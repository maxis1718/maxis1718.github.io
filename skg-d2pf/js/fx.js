// fx.js — real-time post stack for the walkthrough while moving (and the raster underlay of photo mode).
//
//   const fx = createFX({ renderer, scene, camera, quality: 'auto' | 'off' | 'low' | 'medium' | 'high', mobile });
//   fx.render();                 // instead of renderer.render(scene, camera)
//   fx.setSize(w, h);            // on resize (CSS px; pixel ratio is read from the renderer)
//   fx.setQuality(q);            // HUD toggle
//
// Pipeline (EffectComposer, HalfFloat linear HDR buffers):
//   scene → 4× MSAA HDR target  →  N8AO ambient occlusion (half-res on 'medium', full on 'high', off on 'low')
//         → bloom on emissive sources only (threshold above diffuse white: light apertures, LED strips, skylights)
//         → OutputPass (renderer.toneMapping / exposure, sRGB)  →  fine film grain
// 'auto' starts at 'medium' on desktop, 'low' on phones, and steps down when frames are slow (never up by itself).
// Note: materials flagged toneMapped:false (LED apertures, sky panels) ARE tone mapped in this pipeline — like a real
// camera they become slightly desaturated/brighter-looking highlights instead of flat sRGB colours.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';

export const PRESETS = {
  off: null,
  low: { ao: null, bloom: { strength: 0.2, radius: 0.35, threshold: 3.0 }, msaa: 4, grain: 0 },
  // AO radius is large on purpose: besides contact shadows it gives the broad corner / under-cabinet darkening that a
  // real interior photo shows (cheap stand-in for missing indirect-light occlusion)
  medium: { ao: { halfRes: true, mode: 'Low', radius: 1.4, intensity: 3.2, falloff: 1.4 }, bloom: { strength: 0.22, radius: 0.4, threshold: 3.0 }, msaa: 4, grain: 0.008 },
  high: { ao: { halfRes: false, mode: 'Medium', radius: 1.4, intensity: 3.2, falloff: 1.4 }, bloom: { strength: 0.25, radius: 0.45, threshold: 3.0 }, msaa: 4, grain: 0.008 },
};
const ORDER = ['high', 'medium', 'low', 'off'];

const GrainShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.012 }, seed: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float amount; uniform float seed; varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(443.897, 441.423) + seed); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float n = h(gl_FragCoord.xy) - 0.5;
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb += n * amount * (1.0 - lum * 0.6);        // luminance-weighted (less in highlights), like film / sensor noise
      gl_FragColor = c;
    }`,
};

export function createFX({ renderer, scene, camera, quality = 'auto', mobile = false, autoDegrade = true } = {}) {
  let q = quality === 'auto' ? (mobile ? 'low' : 'medium') : quality;
  let composer = null, aoPass = null, bloomPass = null, grainPass = null, outPass = null, renderPass = null;
  const size = new THREE.Vector2(innerWidth, innerHeight);
  const stats = { frames: 0, ms: 0, slow: 0, degradedFrom: null };

  function build() {
    dispose();
    const P = PRESETS[q];
    if (!P) return;
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: P.msaa || 0 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
    if (P.ao) {
      aoPass = new N8AOPass(scene, camera, size.x * pr, size.y * pr);
      aoPass.setQualityMode(P.ao.mode);
      const c = aoPass.configuration;
      c.halfRes = !!P.ao.halfRes; c.aoRadius = P.ao.radius; c.intensity = P.ao.intensity; c.distanceFalloff = P.ao.falloff;
      c.gammaCorrection = false;                 // composer works in linear HDR; OutputPass does the transfer
      c.screenSpaceRadius = false;
      if (P.msaa) aoPass.beautyRenderTarget.samples = P.msaa;   // keep MSAA edges (N8AO renders the beauty pass itself)
      composer.addPass(aoPass);
    } else {
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
    }
    if (P.bloom) {
      bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * pr / 2, size.y * pr / 2), P.bloom.strength, P.bloom.radius, P.bloom.threshold);
      composer.addPass(bloomPass);
    }
    outPass = new OutputPass();
    composer.addPass(outPass);
    if (P.grain) { grainPass = new ShaderPass(GrainShader); grainPass.uniforms.amount.value = P.grain; composer.addPass(grainPass); }
  }
  function dispose() {
    if (!composer) return;
    for (const p of composer.passes) if (p.dispose) try { p.dispose(); } catch (e) { /* ignore */ }
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    composer = aoPass = bloomPass = grainPass = outPass = renderPass = null;
  }
  build();

  let last = performance.now();
  function render() {
    const now = performance.now(), ms = now - last; last = now;
    if (!composer) { renderer.render(scene, camera); return; }
    if (grainPass) grainPass.uniforms.seed.value = (grainPass.uniforms.seed.value + 0.6180339) % 1;
    composer.render();
    // auto-degrade: >1.5 s of frames slower than 24 ms (≈ < 42 fps) → next lower preset
    if (autoDegrade && quality === 'auto' && ms < 250) {
      stats.ms = stats.ms * 0.9 + ms * 0.1; stats.frames++;
      if (stats.frames > 90 && stats.ms > 24) { stats.slow += ms; if (stats.slow > 1500) step(); } else stats.slow = 0;
    }
  }
  function step() {
    const i = ORDER.indexOf(q);
    if (i < ORDER.length - 2) { stats.degradedFrom = stats.degradedFrom || q; q = ORDER[i + 1]; build(); console.info('[fx] auto quality →', q); }
    stats.slow = 0; stats.frames = 0;
  }
  return {
    render,
    setSize(w, h) { size.set(w, h); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); if (aoPass) aoPass.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); } },
    setQuality(nq) { quality = nq; q = nq === 'auto' ? (mobile ? 'low' : 'medium') : nq; build(); },
    get quality() { return q; },
    get composer() { return composer; },
    passes: () => ({ aoPass, bloomPass, outPass, grainPass }),
    info() { return { quality: q, avgMs: +stats.ms.toFixed(1), degradedFrom: stats.degradedFrom, passes: composer ? composer.passes.map((p) => p.constructor.name) : [] }; },
    dispose,
  };
}

// ── environments: CC0 HDR skies (assets/env) → equirect DataTextures for the path tracer + PMREM for raster ─────────
// Returns { pt: { day, evening }, pmrem: { day, evening } }. The raster scene keeps RoomEnvironment for interior
// reflections by default (an outdoor sky reflected in every cabinet looks wrong indoors); use pmrem.day for exterior
// glass / balcony materials if wanted.
export async function loadEnvironments(renderer, { base = './assets/env/', files = { day: 'sky_day.hdr', evening: 'sky_dusk.hdr' }, pmrem = false } = {}) {
  const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
  const loader = new RGBELoader().setDataType(THREE.FloatType);
  const out = { pt: {}, pmrem: {} };
  const gen = pmrem ? new THREE.PMREMGenerator(renderer) : null;
  await Promise.all(Object.entries(files).map(async ([k, f]) => {
    try {
      const t = await loader.loadAsync(base + f);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.LinearSRGBColorSpace;
      out.pt[k] = t;
      if (gen) out.pmrem[k] = gen.fromEquirectangular(t).texture;
    } catch (e) { console.warn('[fx] env load failed', f, e && e.message); }
  }));
  if (gen) gen.dispose();
  return out;
}
