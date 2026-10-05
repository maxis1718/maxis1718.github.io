// photo.js — progressive path-traced "photo mode" for the walkthrough (three-gpu-pathtracer 0.0.23 / three r170).
//
//   const photo = createPhotoMode({ renderer, scene, camera, isIdle, rasterRender, house, M, spotRig, mobile, onProgress });
//   HOOKS.render = (ctx) => photo.render(ctx);        // replaces the default raster render in main.js
//
// While the camera / scene move the page renders the normal raster image (rasterRender()). Once isIdle() has been
// true for `idleDelay` seconds the module starts accumulating path-traced samples (tiled, a budgeted number of tiles
// per frame so input stays responsive) and cross-fades from the raster image to the path-traced one after
// `minSamples` samples. Any input / movement → reset() and back to raster in the same frame.
//
// The path tracer never sees the live scene directly: it traces a *proxy scene* that shares geometry with the live
// meshes but swaps raster-only tricks for physical equivalents —
//   • fake light decals (multiplicative pools/scallops, additive glows, vertex-alpha AO strips) are dropped
//     (GI + soft shadows produce the real thing);
//   • unlit MeshBasicMaterials (LED apertures, sky panels, slot strips) become emissive surfaces;
//   • glass becomes thin-walled transmissive glass (frosted glass = rough transmission);
//   • Lambert/Phong → Standard; colorWrite:false shadow casters → plain occluders;
//   • downlights become one PhysicalSpotLight (Ø75 mm soft source) per fixture near the camera, the skylights keep
//     their RectAreaLights, the sun stays a DirectionalLight, the hemisphere light is replaced by a real sky
//     environment (equirect) that also shows through the windows.
// Proxies keep a constant mesh set (hidden sources are collapsed to a zero-scale matrix) so that door / blind changes
// only refit the BVH instead of rebuilding it.
import * as THREE from 'three';
import { WebGLPathTracer, PhysicalSpotLight, ProceduralEquirectTexture } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ── denoiser: albedo demodulation + normal/depth/luminance-guided à-trous wavelet filter (SVGF-style, spatial only) ─
// raster guides at PT resolution: view normal + linear depth, and albedo (a = 1 → demodulate, 0 → emissive / sky)
class GuideMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader: /* glsl */`varying vec3 vN; varying float vD;
        void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`varying vec3 vN; varying float vD;
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n, vD); }`,
      side: THREE.DoubleSide,
    });
  }
}
const QUAD_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
class AtrousMaterial extends THREE.ShaderMaterial {
  // mode 0 (prep): demodulate by albedo, estimate per-pixel luminance variance from a 5×5 same-surface neighbourhood
  // mode 1 (à-trous step): 5×5 B3 kernel at stepPx spacing; edge-stopping on normal, depth (gradient-scaled) and
  //   luminance (σ ∝ √variance, SVGF-style); variance is filtered alongside (Σw²·var / (Σw)²) and kept in .a
  constructor() {
    super({
      uniforms: {
        src: { value: null }, nd: { value: null }, alb: { value: null }, texel: { value: new THREE.Vector2() },
        stepPx: { value: 1 }, sigmaL: { value: 4 }, mode: { value: 0 }, exposure: { value: 1 },
        lit: { value: null }, sigmaR: { value: 0.35 }, useLit: { value: 0 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D src; uniform sampler2D nd; uniform sampler2D alb; uniform vec2 texel;
        uniform float stepPx; uniform float sigmaL; uniform int mode; uniform float exposure;
        uniform sampler2D lit; uniform float sigmaR; uniform int useLit;
        // raster lighting guide: log of the demodulated raster image (noise-free direct light, shadows, AO) → stops the
        // filter at sun-patch / shadow / light-pool edges that the noisy PT estimate cannot resolve yet
        float litG(vec2 uv) { vec3 l = texture2D(lit, uv).rgb; vec4 a = texture2D(alb, uv); float al = max(dot(a.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.04);
          return log(dot(l, vec3(0.2126, 0.7152, 0.0722)) / al + 1e-3); }
        varying vec2 vUv;
        float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        bool valid(vec4 g, vec4 a) { return a.a > 0.5 && g.w < 5000.0; }
        vec3 demod(vec2 uv) { vec3 c = texture2D(src, uv).rgb * exposure; vec4 a = texture2D(alb, uv); if (a.a > 0.5) c /= max(a.rgb, vec3(0.04)); return c; }
        void main() {
          vec4 g0 = texture2D(nd, vUv); vec4 a0 = texture2D(alb, vUv);
          float zx = abs(texture2D(nd, vUv + vec2(texel.x, 0.0)).w - texture2D(nd, vUv - vec2(texel.x, 0.0)).w);
          float zy = abs(texture2D(nd, vUv + vec2(0.0, texel.y)).w - texture2D(nd, vUv - vec2(0.0, texel.y)).w);
          float zg = max(max(zx, zy) * 0.5, g0.w * 0.002);
          if (mode == 0) {
            vec3 c0 = demod(vUv);
            if (!valid(g0, a0)) { gl_FragColor = vec4(c0, 0.0); return; }
            float m1 = 0.0, m2 = 0.0, ws = 0.0;
            for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
              vec2 off = vec2(float(x), float(y));
              vec2 uv = vUv + off * texel;
              vec4 g = texture2D(nd, uv);
              if (!valid(g, texture2D(alb, uv))) continue;
              float w = pow(max(dot(g0.xyz, g.xyz), 0.0), 32.0) * exp(-abs(g.w - g0.w) / (zg * length(off) * 1.5 + 1e-3));
              float l = lum(demod(uv));
              m1 += l * w; m2 += l * l * w; ws += w;
            }
            m1 /= max(ws, 1e-6); m2 /= max(ws, 1e-6);
            gl_FragColor = vec4(c0, max(m2 - m1 * m1, 0.0));
            return;
          }
          vec4 s0 = texture2D(src, vUv);
          if (!valid(g0, a0)) { gl_FragColor = s0; return; }
          // 3×3 gaussian of variance for a stable σ
          float v = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) v += texture2D(src, vUv + vec2(float(x), float(y)) * texel).a * (x == 0 ? 0.5 : 0.25) * (y == 0 ? 0.5 : 0.25);
          float sl = sigmaL * sqrt(max(v, 0.0)) + 1e-4;
          float l0 = lum(s0.rgb);
          float lg0 = useLit == 1 ? litG(vUv) : 0.0;
          vec3 acc = vec3(0.0); float ws = 0.0, wv = 0.0;
          float k[3]; k[0] = 0.375; k[1] = 0.25; k[2] = 0.0625;
          for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
            vec2 off = vec2(float(x), float(y)) * stepPx;
            vec2 uv = vUv + off * texel;
            vec4 g = texture2D(nd, uv);
            if (!valid(g, texture2D(alb, uv))) continue;
            vec4 c = texture2D(src, uv);
            float w = k[abs(x)] * k[abs(y)];
            w *= pow(max(dot(g0.xyz, g.xyz), 0.0), 64.0);
            w *= exp(-abs(g.w - g0.w) / (zg * length(off) * 1.5 + 1e-3));
            w *= exp(-abs(lum(c.rgb) - l0) / sl);
            if (useLit == 1) w *= exp(-abs(litG(uv) - lg0) / sigmaR);
            acc += c.rgb * w; ws += w; wv += w * w * c.a;
          }
          gl_FragColor = ws > 1e-6 ? vec4(acc / ws, wv / (ws * ws)) : s0;
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
  }
}
class PhotoCompositeMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        raw: { value: null }, den: { value: null }, alb: { value: null }, nd: { value: null },
        useDen: { value: 0 }, opacity: { value: 1 }, exposure: { value: 1 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D raw; uniform sampler2D den; uniform sampler2D alb; uniform sampler2D nd;
        uniform int useDen; uniform float opacity; uniform float exposure;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(raw, vUv).rgb * exposure;
          if (useDen == 1) {
            vec4 a = texture2D(alb, vUv);
            if (a.a > 0.5 && texture2D(nd, vUv).w < 5000.0) c = texture2D(den, vUv).rgb * max(a.rgb, vec3(0.04));   // den already × exposure
          }
          c = max(c, 0.0);
          #if defined( TONE_MAPPING )
          c = toneMapping(c);
          #endif
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), opacity);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending,
    });
  }
}

// ── procedural sky equirect matching env.js's sky dome (used when no HDR is supplied) ────────────────────────────
class ThemeSkyTexture extends ProceduralEquirectTexture {
  constructor(w = 512, h = 256) {
    super(w, h);
    this.top = new THREE.Color(); this.horizon = new THREE.Color(); this.bottom = new THREE.Color();
    this.intensity = 1;
    const d = new THREE.Vector3();
    this.generationCallback = (polar, uv, coord, color) => {
      d.setFromSpherical(polar);
      const h = d.y;
      if (h > 0) color.copy(this.horizon).lerp(this.top, Math.pow(Math.min(h, 1), 0.55));
      else color.copy(this.horizon).lerp(this.bottom, Math.pow(Math.min(-h * 3, 1), 0.6));
      color.multiplyScalar(this.intensity);
    };
  }
}

// ── material conversion ──────────────────────────────────────────────────────────────────────────────────────────
function luminance(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function isFakeLight(m) {
  return m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending || m.blending === THREE.MultiplyBlending || m.blending === THREE.SubtractiveBlending;
}

export function createPhotoMode(opts) {
  const {
    renderer, scene, camera,
    isIdle = () => false,
    rasterRender = () => renderer.render(scene, camera),
    onProgress = null,
    house = null, M = null, spotRig = null, STYLE = null, plan = null,
    mobile = false,
  } = opts;
  const O = {
    idleDelay: 0.6,                       // s of idle before tracing starts
    minSamples: mobile ? 3 : 4,           // samples before the fade starts
    fadeDuration: 0.6,                    // s
    maxSamples: mobile ? 256 : 1024,      // stop accumulating (saves battery)
    renderScale: mobile ? 0.5 : 1.0,      // PT resolution relative to the drawing buffer (overridden by targetPixels)
    targetPixels: mobile ? 0.35e6 : 1.1e6, // traced pixels budget (≈ 1280×860 desktop); 0 = use renderScale
    tiles: mobile ? 3 : 2,                // tiles per axis (one sample = tiles² frames)
    bounces: mobile ? 4 : 6,
    transmissiveBounces: 4,
    filterGlossyFactor: 0.5,              // fireflies ↓ (slight blur of glossy paths)
    textureSize: mobile ? 512 : 1024,     // PT texture atlas size per texture
    tileBudgetMs: mobile ? 22 : 18,       // adaptive: more tiles per frame while frames stay under this
    maxTilesPerFrame: 16,
    exposure: 1.0,                        // PT exposure multiplier (× renderer.toneMappingExposure)
    denoise: true,
    denoiseStrength: 1.0,                 // luminance edge-stopping σ (× 4·√variance, SVGF default)
    litGuide: true,                       // also edge-stop on the (noise-free) raster lighting
    litSigma: 0.3,                        // log-luminance σ of that guide
    maxSpotLights: mobile ? 10 : 14,      // downlight fixtures of the camera's room (+ within 2.5 m) as PT spot lights
    spotRadius: 0.03,                     // m — soft source size of a Ø75 mm downlight
    spotIntensityScale: 1.0,
    sunScale: 1.0,
    rectScale: 1.0,
    envIntensity: 1.0,
    emissiveBoost: 1.0,
    hazeColor: null,                      // tint city/ground toward fog colour (aerial perspective)
    environment: null,                    // optional { day: DataTexture(equirect), evening: DataTexture } HDR skies
    portals: true,                        // sky light enters through RectAreaLight "portals" at exterior openings
    portalScale: 1.0,
    coveredPortal: 0.5,                   // openings onto a covered balcony see less sky
    maxPortals: 6,                        // portals of the camera's room (+ any within 3 m) — light sampling is uniform over lights
    lightRadius: 6,                       // RectAreaLights (skylights) farther than this from the camera are dropped
    exteriorFill: 0.75,                   // exterior surfaces: emissive sky-fill (× albedo × sky radiance)
    environmentRotation: 0,               // rad around +Y
    ...(opts.options || {}),
  };

  const pt = new WebGLPathTracer(renderer);
  pt.renderDelay = 0;
  pt.minSamples = O.minSamples;
  pt.fadeDuration = O.fadeDuration * 1000;
  pt.renderScale = O.renderScale;
  pt.tiles.set(O.tiles, O.tiles);
  pt.bounces = O.bounces;
  pt.transmissiveBounces = O.transmissiveBounces;
  pt.filterGlossyFactor = O.filterGlossyFactor;
  pt.textureSize.set(O.textureSize, O.textureSize);
  pt.dynamicLowRes = false;
  pt.rasterizeScene = true;
  pt.rasterizeSceneCallback = () => rasterRender();

  // proxy scene ---------------------------------------------------------------------------------------------------
  const ptScene = new THREE.Scene();
  ptScene.name = 'photoProxy';
  const meshRoot = new THREE.Group(); meshRoot.name = 'proxies'; ptScene.add(meshRoot);
  const lightRoot = new THREE.Group(); lightRoot.name = 'ptLights'; ptScene.add(lightRoot);
  const proxies = [];                    // { src, proxy, conv }
  const matCache = new Map();            // src material uuid → converted (or null = excluded)
  const glassSet = new Set([M && M.glass, M && M.glassClear, M && M.railGlass].filter(Boolean));
  const frostedSet = new Set([M && M.frosted].filter(Boolean));
  let built = false, buildMs = 0, sig = '';
  const exteriorMats = new Set();
  function collectExterior() {
    exteriorMats.clear();
    if (M) for (const m of [M.facade, M.slab, M.wallCap, M.railMetal, M.floor && M.floor.balcony, M.floor && M.floor.decking,
      M.floor && M.floor.ledge, M.floor && M.floor.service]) if (m) exteriorMats.add(m);
    const ext = scene.getObjectByName('exterior');
    if (ext) ext.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) exteriorMats.add(m); });
  }

  function convert(m) {
    if (!m) return null;
    if (matCache.has(m.uuid)) return matCache.get(m.uuid);
    let out = null;
    if (m.isShaderMaterial || m.isRawShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial || m.isSpriteMaterial) out = null;
    else if (isFakeLight(m)) out = null;
    else if (m.colorWrite === false) {
      out = new THREE.MeshStandardMaterial({ color: '#8f8b85', roughness: 1, side: THREE.DoubleSide });
      out.userData.kind = 'occluder';
    } else if (m.isMeshBasicMaterial) {
      if (m.transparent && (m.opacity < 0.99 || m.vertexColors)) out = null;          // glow planes, AO strips
      else {
        out = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9, metalness: 0, side: m.side });
        out.userData.kind = 'emissive'; out.userData.src = m;
      }
    } else if (m.isMeshStandardMaterial) {
      const glassy = glassSet.has(m) || frostedSet.has(m) ||
        (m.transparent && m.opacity <= 0.4 && !m.map && m.roughness <= 0.2 && m.metalness < 0.5);
      if (glassy) {
        const frosted = frostedSet.has(m);
        out = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(m.color).lerp(new THREE.Color(1, 1, 1), frosted ? 0.4 : 0.75),
          metalness: 0, roughness: frosted ? 0.45 : 0.02, transmission: 1, ior: 1.5, thickness: 0,
          side: THREE.DoubleSide, transparent: false,
        });
        out.userData.kind = frosted ? 'frosted' : 'glass';
      } else if (exteriorMats.has(m) && O.exteriorFill > 0) {
        out = m.clone(); out.userData = { kind: 'exterior', src: m };
      } else {
        out = m;                                                               // shared (physical already)
      }
    } else if (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial) {
      out = new THREE.MeshStandardMaterial({
        color: m.color, map: m.map, vertexColors: m.vertexColors, side: m.side,
        emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
        roughness: m.isMeshPhongMaterial ? Math.max(0.2, 1 - Math.sqrt((m.shininess || 30) / 100)) : 0.92, metalness: 0,
        transparent: m.transparent, opacity: m.opacity,
      });
      out.userData.kind = 'lambert'; out.userData.src = m; out.userData.exterior = exteriorMats.has(m);
    }
    matCache.set(m.uuid, out);
    return out;
  }
  // refresh parameters of converted materials whose source can change at runtime (theme / ambient fades)
  function syncMaterial(out, mesh) {
    if (!out || !out.userData.src) return;
    const s = out.userData.src;
    if (out.userData.kind === 'emissive') {
      const c = out.emissive.copy(s.color);
      if (s.vertexColors && mesh.geometry.attributes.color) {   // e.g. downlight apertures: CCT lives in vertex colours
        const avg = mesh.userData.__avgColor || (mesh.userData.__avgColor = averageColor(mesh.geometry.attributes.color));
        c.multiply(avg);
      }
      out.emissiveMap = s.map || null;
      out.emissiveIntensity = O.emissiveBoost;
      out.map = null;
    } else if (out.userData.kind === 'lambert') {
      out.color.copy(s.color); if (s.emissive) out.emissive.copy(s.emissive); out.emissiveIntensity = s.emissiveIntensity ?? 1;
    }
    if (out.userData.kind === 'exterior' || out.userData.exterior) {
      // sky light received by exterior surfaces (the environment is off for indirect rays → bake it as emission)
      const fill = envStats ? envStats.up * O.exteriorFill : 0;
      if (out.userData.kind === 'exterior') { out.color.copy(s.color); out.map = s.map; }
      const own = s.emissive && s.emissiveIntensity > 0 && luminance(s.emissive) > 0.01;     // e.g. lit city windows at night
      if (own) { out.emissive.copy(s.emissive); out.emissiveMap = s.emissiveMap || null; out.emissiveIntensity = s.emissiveIntensity; }
      else {
        out.emissive.copy(out.color).multiplyScalar(fill);
        if (s.vertexColors && mesh.geometry.attributes.color) {
          const avg = mesh.userData.__avgColor || (mesh.userData.__avgColor = averageColor(mesh.geometry.attributes.color));
          out.emissive.multiply(avg);
        }
        out.emissiveMap = s.map || null; out.emissiveIntensity = 1;
      }
    }
  }
  function averageColor(attr) {
    const c = new THREE.Color(0, 0, 0); const n = attr.count;
    for (let i = 0; i < n; i++) { c.r += attr.getX(i); c.g += attr.getY(i); c.b += attr.getZ(i); }
    return n ? c.multiplyScalar(1 / n) : c.setScalar(1);
  }
  function effectivelyVisible(o) {
    for (let a = o; a; a = a.parent) if (!a.visible) return false;
    return true;
  }
  function hazeGeometry(mesh, fogCol) {   // aerial perspective baked into the city's vertex colours
    const g = mesh.geometry.clone(), col = g.attributes.color, pos = g.attributes.position;
    if (!col) return mesh.geometry;
    const c = new THREE.Color(), v = new THREE.Vector3();
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < col.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const d = Math.hypot(v.x - cx, v.z - cz), k = 1 - Math.exp(-d / 420);
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(fogCol, k * 0.75);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    return g;
  }

  function collect() {
    proxies.length = 0; meshRoot.clear(); collectExterior(); matCache.clear();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      if (o.name === 'sky' || o.geometry.attributes.position.count === 0) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const conv = mats.map(convert);
      if (conv.every((c) => !c)) return;
      let geometry = o.geometry;
      if (Array.isArray(o.material) && conv.some((c) => !c)) {
        // multi-material mesh with some excluded groups: keep it, but use an invisible stand-in for excluded groups
        for (let i = 0; i < conv.length; i++) if (!conv[i]) conv[i] = invisibleMat();
      }
      if (O.hazeColor && o.name === 'city') geometry = hazeGeometry(o, new THREE.Color(O.hazeColor));
      geometry = normalizeGeometry(geometry);
      const proxy = new THREE.Mesh(geometry, Array.isArray(o.material) ? conv : conv[0]);
      proxy.matrixAutoUpdate = false; proxy.name = 'pt:' + (o.name || o.type);
      meshRoot.add(proxy);
      proxies.push({ src: o, proxy, conv });
    });
  }
  // the path tracer merges every mesh into one geometry: attribute layouts must agree (RGB vertex colours → RGBA,
  // no extra attributes such as tangents / uv1). Converted copies share the index and other attributes.
  const geoCache = new Map();
  function normalizeGeometry(g) {
    const col = g.attributes.color;
    const extra = Object.keys(g.attributes).filter((k) => !['position', 'normal', 'uv', 'color'].includes(k));
    const odd = Object.values(g.attributes).some((a) => a.isInterleavedBufferAttribute) || (g.attributes.uv && g.attributes.uv.itemSize !== 2);
    if ((!col || col.itemSize === 4) && !extra.length && !odd && !g.morphAttributes.position) return g;
    if (geoCache.has(g.uuid)) return geoCache.get(g.uuid);
    const n = new THREE.BufferGeometry();
    if (g.index) n.setIndex(g.index);
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k]; if (!a) continue;
      if (a.isInterleavedBufferAttribute || (k === 'uv' && a.itemSize !== 2)) {
        const s = k === 'uv' ? 2 : 3, arr = new Float32Array(a.count * s);
        for (let i = 0; i < a.count; i++) { arr[i * s] = a.getX(i); arr[i * s + 1] = a.getY(i); if (s > 2) arr[i * s + 2] = a.getZ(i); }
        n.setAttribute(k, new THREE.BufferAttribute(arr, s));
      } else n.setAttribute(k, a);
    }
    if (col) {
      if (col.itemSize === 4 && !col.isInterleavedBufferAttribute && col.array instanceof Float32Array) n.setAttribute('color', col);
      else {
        const arr = new Float32Array(col.count * 4);
        for (let i = 0; i < col.count; i++) { arr[i * 4] = col.getX(i); arr[i * 4 + 1] = col.getY(i); arr[i * 4 + 2] = col.getZ(i); arr[i * 4 + 3] = col.itemSize > 3 ? col.getW(i) : 1; }
        n.setAttribute('color', new THREE.BufferAttribute(arr, 4));
      }
    }
    n.groups = g.groups.map((x) => ({ ...x }));
    n.boundingBox = g.boundingBox; n.boundingSphere = g.boundingSphere;
    geoCache.set(g.uuid, n);
    return n;
  }
  let _inv = null;
  function invisibleMat() { return _inv || (_inv = Object.assign(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }), { userData: { kind: 'invisible' } })); }

  function syncProxies() {
    scene.updateMatrixWorld(true);
    for (const p of proxies) {
      const vis = effectivelyVisible(p.src);
      p.proxy.matrix.copy(vis ? p.src.matrixWorld : ZERO);
      p.proxy.matrixWorld.copy(p.proxy.matrix);
      const mats = Array.isArray(p.proxy.material) ? p.proxy.material : [p.proxy.material];
      for (const m of mats) syncMaterial(m, p.src);
    }
  }

  // lights ------------------------------------------------------------------------------------------------------------
  const spotPool = [];
  function syncLights() {
    lightRoot.clear();
    const live = [];
    scene.traverse((o) => { if (o.isLight) live.push(o); });
    for (const l of live) {
      if (!effectivelyVisible(l) || l.intensity <= 0 || l.userData.realismPortal) continue;   // raster-only window fill (PT has its own sky portals)
      if (l.isDirectionalLight) {
        const d = new THREE.DirectionalLight(l.color, l.intensity * O.sunScale);
        d.position.setFromMatrixPosition(l.matrixWorld); d.target.position.setFromMatrixPosition(l.target.matrixWorld);
        lightRoot.add(d, d.target); d.updateMatrixWorld(); d.target.updateMatrixWorld();
      } else if (l.isRectAreaLight) {
        if (l.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) > O.lightRadius) continue;   // far → wasted light samples
        const r = new THREE.RectAreaLight(l.color, l.intensity * O.rectScale, l.width, l.height);
        l.matrixWorld.decompose(r.position, r.quaternion, r.scale); r.scale.set(1, 1, 1);
        lightRoot.add(r); r.updateMatrixWorld();
      } else if (l.isSpotLight && !(spotRig && spotRig.spots.includes(l))) {
        const s = new PhysicalSpotLight(l.color, l.intensity, l.distance, l.angle, l.penumbra, l.decay);
        s.radius = 0.02;
        s.position.setFromMatrixPosition(l.matrixWorld); s.target.position.setFromMatrixPosition(l.target.matrixWorld);
        lightRoot.add(s, s.target); s.updateMatrixWorld(); s.target.updateMatrixWorld();
      } else if (l.isPointLight) {
        const p = new THREE.PointLight(l.color, l.intensity, l.distance, l.decay);
        p.position.setFromMatrixPosition(l.matrixWorld); lightRoot.add(p); p.updateMatrixWorld();
      }
      // HemisphereLight / AmbientLight: replaced by the sky environment (real GI)
    }
    // sky portals at exterior openings (nearest first)
    if (O.portals && envStats) {
      if (!portalDefs) buildPortals();
      const cp = camera.position, camRoom = house.lookup.at(cp.x, cp.z);
      // light samples are spread uniformly over all lights → keep only portals that can matter here
      const sorted = [...portalDefs].sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
      let list = sorted.filter((p) => p.room === camRoom || p.pos.distanceTo(cp) < 3.0);
      if (!list.length) list = sorted.slice(0, 1);
      list = list.slice(0, O.maxPortals);
      for (const p of list) {
        const col = envStats.color[p.outKey].clone(), Lm = luminance(col);
        if (Lm <= 1e-5) continue;
        const r = new THREE.RectAreaLight(col.multiplyScalar(1 / Lm), Lm * p.factor * O.portalScale, p.w, p.h);
        r.position.copy(p.pos); r.lookAt(p.pos.clone().add(p.inward));
        r.name = 'portal'; lightRoot.add(r); r.updateMatrixWorld();
      }
    }
    // downlights: one soft spot per fixture near the camera (only when the raster rig has them switched on)
    const fixtures = house && house.downlights && house.downlights.fixtures;
    const on = spotRig && spotRig.spots.some((s) => s.visible);
    if (fixtures && on && STYLE) {
      const LG = STYLE.lighting;
      const cx = camera.position.x, cz = camera.position.z;
      const camRoom = house.lookup && house.lookup.at(cx, cz);
      const d = (f) => Math.hypot(f.x - cx, f.z - cz);
      let near = [...fixtures].sort((a, b) => d(a) - d(b));
      const inRoom = near.filter((f) => (camRoom && f.room === camRoom.id) || d(f) < 2.5);
      near = (inRoom.length ? inRoom : near).slice(0, O.maxSpotLights);
      near.forEach((f, i) => {
        let s = spotPool[i];
        if (!s) { s = spotPool[i] = new PhysicalSpotLight(); s.add(s.target); s.target.position.set(0, -1, 0); }
        s.color.copy(f.color); s.intensity = LG.spotIntensity * O.spotIntensityScale;
        s.angle = LG.beam; s.penumbra = LG.penumbra; s.decay = 2; s.distance = 0; s.radius = O.spotRadius;
        s.position.set(f.x, f.y - 0.02, f.z);
        lightRoot.add(s); s.updateMatrixWorld(true);
      });
    }
  }

  // environment -------------------------------------------------------------------------------------------------------
  const skyTex = new ThemeSkyTexture(512, 256);
  let envKey = '';
  function syncEnvironment(theme) {
    const env = O.environment && (O.environment[theme] || O.environment.day);
    let tex = env;
    if (!tex) {
      const sky = scene.getObjectByName('sky');
      const u = sky && sky.material.uniforms;
      if (u) { skyTex.top.copy(u.top.value); skyTex.horizon.copy(u.horizon.value); skyTex.bottom.copy(u.bottom.value); }
      else { skyTex.top.set('#6f9fd8'); skyTex.horizon.set('#dfe9f0'); skyTex.bottom.set('#c8ccc6'); }
      skyTex.intensity = 1;
      const key = skyTex.top.getHexString() + skyTex.horizon.getHexString() + skyTex.bottom.getHexString();
      if (key !== envKey) { skyTex.update(); envKey = key; }
      tex = skyTex;
    }
    ptScene.background = tex;
    ptScene.environment = O.portals ? null : tex;                 // portals: no env for indirect rays (no double counting)
    ptScene.backgroundIntensity = O.envIntensity; ptScene.environmentIntensity = O.envIntensity;
    ptScene.environmentRotation.set(0, O.environmentRotation, 0); ptScene.backgroundRotation.set(0, O.environmentRotation, 0);
    envStats = computeEnvStats(tex);
  }
  // cosine-weighted mean sky radiance (upper hemisphere only) through a vertical opening facing ±X / ±Z, and for an
  // upward-facing surface — used for portal and exterior-fill emission. Cached per texture.
  let envStats = null; const envStatsCache = new Map();
  function computeEnvStats(tex) {
    const key = tex.uuid + ':' + tex.version + ':' + O.environmentRotation + ':' + envKey;
    if (envStatsCache.has(key)) return envStatsCache.get(key);
    const { data, width: w, height: h } = tex.image;
    const half = data instanceof Uint16Array;
    const rd = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
    const dirs = { px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1], up: [0, 1, 0] };
    const acc = {}; for (const k in dirs) acc[k] = new THREE.Color(0, 0, 0);
    const step = Math.max(1, Math.floor(w / 128)), rot = O.environmentRotation, c = new THREE.Color();
    for (let y = 0; y < h; y += step) {
      const phi = tex.flipY ? ((y + 0.5) / h) * Math.PI : (1 - (y + 0.5) / h) * Math.PI;
      const dy = Math.cos(phi); if (dy <= 0) continue;
      const sinP = Math.sin(phi), dOmega = (2 * Math.PI / w) * step * (Math.PI / h) * step * sinP;
      for (let x = 0; x < w; x += step) {
        const th = ((x + 0.5) / w - 0.5) * 2 * Math.PI + rot;
        const dx = sinP * Math.cos(th), dz = sinP * Math.sin(th);
        const i = (y * w + x) * 4; c.setRGB(rd(i), rd(i + 1), rd(i + 2));
        for (const k in dirs) { const d = dirs[k], cos = dx * d[0] + dy * d[1] + dz * d[2]; if (cos > 0) acc[k].r += c.r * cos * dOmega, acc[k].g += c.g * cos * dOmega, acc[k].b += c.b * cos * dOmega; }
      }
    }
    const out = { color: {} };
    for (const k in acc) { acc[k].multiplyScalar(O.envIntensity / Math.PI); out[k] = luminance(acc[k]); out.color[k] = acc[k]; }
    envStatsCache.set(key, out);
    return out;
  }
  // exterior openings (PLAN windows + glass sliders) → inward-facing portal rectangles
  let portalDefs = null;
  function buildPortals() {
    portalDefs = [];
    if (!plan || !house || !house.lookup) return;
    const L = house.lookup, OUTDOOR = ['balcony', 'decking', 'ledge', 'service'];
    const indoor = (r) => r && !OUTDOOR.includes(r.floor);
    const ops = [
      ...(plan.windows || []).filter((w) => w.kind !== 'partition').map((w) => ({ ...w })),
      ...(plan.doors || []).filter((d) => d.type === 'slide' && d.glass !== false).map((d) => ({ x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y0: 0.02, y1: d.h || 2.4 })),
    ];
    for (const o of ops) {
      const alongX = (o.x1 - o.x0) >= (o.z1 - o.z0);
      const c = alongX ? (o.z0 + o.z1) / 2 : (o.x0 + o.x1) / 2, a0 = alongX ? o.x0 : o.z0, a1 = alongX ? o.x1 : o.z1, am = (a0 + a1) / 2;
      const at = (off) => (alongX ? L.at(am, c + off) : L.at(c + off, am));
      const rP = at(0.35), rN = at(-0.35);
      let sgn = 0;
      if (indoor(rP) && !indoor(rN)) sgn = 1; else if (indoor(rN) && !indoor(rP)) sgn = -1; else continue;
      const out = sgn > 0 ? rN : rP;
      const covered = out && out.ceiling !== false;
      const half = alongX ? Math.abs(o.z1 - o.z0) / 2 : Math.abs(o.x1 - o.x0) / 2;
      const pc = c + sgn * (half + 0.03);
      const pos = alongX ? new THREE.Vector3(am, (o.y0 + o.y1) / 2, pc) : new THREE.Vector3(pc, (o.y0 + o.y1) / 2, am);
      const inward = alongX ? new THREE.Vector3(0, 0, sgn) : new THREE.Vector3(sgn, 0, 0);
      const outKey = alongX ? (sgn > 0 ? 'nz' : 'pz') : (sgn > 0 ? 'nx' : 'px');
      portalDefs.push({ pos, inward, w: a1 - a0, h: o.y1 - o.y0, outKey, factor: covered ? O.coveredPortal : 1, room: sgn > 0 ? rP : rN });
    }
  }

  // signature of everything that requires a re-sync (theme, doors, blinds, ambient, light levels) ------------------
  function signature() {
    let s = '';
    const sky = scene.getObjectByName('sky');
    if (sky) s += sky.material.uniforms.top.value.getHexString();
    s += '|' + renderer.toneMappingExposure.toFixed(3);
    for (const p of proxies) {
      const v = effectivelyVisible(p.src);
      s += v ? 1 : 0;
      if (v && !p.src.matrixWorld.equals(p.proxy.matrix)) s += 'm';
      const m = Array.isArray(p.src.material) ? p.src.material[0] : p.src.material;
      if (m && m.emissiveIntensity !== undefined) s += m.emissiveIntensity.toFixed(2);
      if (m && m.isMeshBasicMaterial) s += m.color.getHexString();
    }
    scene.traverse((o) => { if (o.isLight && !o.userData.realismPortal && !(spotRig && spotRig.spots.includes(o))) s += (effectivelyVisible(o) ? o.intensity.toFixed(2) : '0') + ','; });
    if (spotRig) s += spotRig.spots.some((x) => x.visible) ? 'D' : 'd';
    return s;
  }

  let theme = 'day';
  function sync(force = false) {
    const t0 = performance.now();
    if (!built) collect();
    const s = signature();
    if (!force && built && s === sig) return false;
    syncEnvironment(theme);
    syncProxies();
    syncLights();
    pt.setScene(ptScene, camera);
    sig = signature();
    const dt = performance.now() - t0;
    if (!built) { buildMs = dt; built = true; }
    lastSyncMs = dt;
    return true;
  }
  let lastSyncMs = 0;

  // guide buffers for the denoiser (raster, PT resolution): normal+depth and albedo --------------------------------------
  const guideMat = new GuideMaterial();
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const ndRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const albRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const litRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const denA = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const denB = denA.clone();
  const albCache = new Map();
  const albBlack = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, blending: THREE.NoBlending, toneMapped: false });
  function albedoMat(m, mesh) {
    if (!m) return null;
    let a = albCache.get(m.uuid);
    if (a !== undefined) return a;
    const conv = convert(m);
    if (!conv || conv.userData.kind === 'glass' || conv.userData.kind === 'frosted' || conv.userData.kind === 'invisible') a = null;   // hidden
    else if (conv.userData.kind === 'emissive' || (m.emissive && m.emissiveIntensity * luminance(m.emissive) > 0.3)) a = albBlack;
    else {
      a = new THREE.MeshBasicMaterial({
        color: conv.color, map: conv.map || null, vertexColors: !!conv.vertexColors, side: conv.side,
        alphaMap: conv.alphaMap || null, alphaTest: conv.alphaTest || 0,
        transparent: true, opacity: 1, blending: THREE.NoBlending, toneMapped: false,
      });
    }
    albCache.set(m.uuid, a);
    return a;
  }
  let guideValid = false, denoised = -1, denOut = null;
  function renderGuides(w, h) {
    for (const rt of [ndRT, albRT, litRT, denA, denB]) if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    // lit raster guide (HDR, untonemapped) of the scene exactly as it is shown
    { const pr = renderer.getRenderTarget(); renderer.setRenderTarget(litRT); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(pr); }
    const bg = scene.background, ov = scene.overrideMaterial, fog = scene.fog;
    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevTM = renderer.toneMapping;
    const touched = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const a = o.name === 'sky' ? null : albedoMat(m, o);
      touched.push([o, o.material, o.visible]);
      if (!a) o.visible = false; else o.material = a;
    });
    scene.background = null; scene.fog = null; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(albRT); renderer.setClearColor(0xffffff, 0); renderer.clear(); renderer.render(scene, camera);
    // normal + depth: same visibility set (glass / fake lights hidden)
    scene.overrideMaterial = guideMat;
    renderer.setRenderTarget(ndRT); renderer.setClearColor(0x000000, 1e4); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTM;
    scene.background = bg; scene.overrideMaterial = ov; scene.fog = fog;
    for (const [o, m, v] of touched) { o.material = m; o.visible = v; }
    guideValid = true; denoised = -1;
  }

  // à-trous passes (run once per completed sample, cached) + composite ----------------------------------------------
  const atrous = new AtrousMaterial();
  const atQuad = new FullScreenQuad(atrous);
  function runDenoise(srcTex, spp) {
    const iters = !O.denoise ? 0 : spp < 64 ? 5 : spp < 256 ? 4 : 3;
    if (!iters) return null;
    const u = atrous.uniforms;
    u.nd.value = ndRT.texture; u.alb.value = albRT.texture; u.texel.value.set(1 / ndRT.width, 1 / ndRT.height);
    u.sigmaL.value = 4.0 * O.denoiseStrength * (O.litGuide ? 2.0 : 1.0);
    u.lit.value = litRT.texture; u.useLit.value = O.litGuide ? 1 : 0; u.sigmaR.value = O.litSigma;
    u.exposure.value = O.exposure;
    const prevRT = renderer.getRenderTarget();
    u.src.value = srcTex; u.mode.value = 0;
    renderer.setRenderTarget(denA); atQuad.render(renderer);
    let src = denA.texture, dst = denB;
    u.mode.value = 1;
    for (let i = 0; i < iters; i++) {
      u.src.value = src; u.stepPx.value = 1 << i;
      renderer.setRenderTarget(dst); atQuad.render(renderer);
      src = dst.texture; dst = dst === denA ? denB : denA;
    }
    renderer.setRenderTarget(prevRT);
    return src;
  }
  const comp = new PhotoCompositeMaterial();
  const quad = new FullScreenQuad(comp);
  pt.renderToCanvasCallback = (target, r, ptQuad) => {
    const spp = Math.floor(pt.samples);
    if (guideValid && spp >= 1 && spp !== denoised) { denOut = runDenoise(target.texture, spp); denoised = spp; }
    comp.uniforms.raw.value = target.texture;
    comp.uniforms.den.value = denOut; comp.uniforms.alb.value = albRT.texture; comp.uniforms.nd.value = ndRT.texture;
    comp.uniforms.useDen.value = denOut && guideValid ? 1 : 0;
    comp.uniforms.exposure.value = O.exposure;
    comp.uniforms.opacity.value = ptQuad.material.opacity;
    const ac = r.autoClear; r.autoClear = false;
    quad.render(r);
    r.autoClear = ac;
  };

  // state machine ----------------------------------------------------------------------------------------------------
  let enabled = true, idleT = 0, tracing = false, frameMs = 16, tilesPerFrame = 1, compiled = false, lastT = performance.now();
  let stats = { samples: 0, sps: 0, t0: 0 };

  function reset() {
    if (tracing) { tracing = false; pt.reset(); }
    idleT = 0;
  }
  function render(ctx = {}) {
    const now = performance.now(), dt = ctx.rawDt ?? (now - lastT) / 1000; lastT = now;
    frameMs = frameMs * 0.8 + Math.min(200, dt * 1000) * 0.2;
    const idle = enabled && (ctx.mode === undefined || ctx.mode === 'walk') && isIdle(ctx);
    if (!idle) { reset(); rasterRender(); return; }
    idleT += dt;
    if (idleT < O.idleDelay) { rasterRender(); return; }
    if (!tracing) {
      // (re)start: sync the proxy scene with the live scene, refresh the guide buffer
      if (ctx.theme) theme = ctx.theme;
      try { sync(); } catch (e) { console.error('[photo] sync failed', e); enabled = false; rasterRender(); return; }
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (O.targetPixels) {        // keep the traced resolution near a pixel budget (HiDPI screens: trace below native)
        O.renderScale = Math.min(1, Math.max(0.25, Math.sqrt(O.targetPixels / Math.max(1, size.x * size.y))));
        pt.renderScale = O.renderScale;
      }
      pt.updateCamera();
      renderGuides(Math.floor(size.x * O.renderScale), Math.floor(size.y * O.renderScale)); denOut = null;
      tracing = true; tilesPerFrame = 1; stats = { samples: 0, sps: 0, t0: now };
    }
    if (pt.samples >= O.maxSamples) { pt.pausePathTracing = true; } else pt.pausePathTracing = false;
    // adaptive tile budget: extra tiles while frames stay fast (the first one is rendered by renderSample)
    if (!pt.isCompiling && !pt.pausePathTracing) {
      if (frameMs < O.tileBudgetMs * 0.75) tilesPerFrame = Math.min(O.maxTilesPerFrame, tilesPerFrame + 1);
      else if (frameMs > O.tileBudgetMs * 1.3) tilesPerFrame = Math.max(1, tilesPerFrame - 1);
      for (let i = 1; i < tilesPerFrame; i++) pt._pathTracer.update();
    }
    pt.renderSample();
    if (!compiled && !pt.isCompiling && pt.samples > 0) compiled = true;
    const el = (now - stats.t0) / 1000;
    stats.samples = pt.samples; stats.sps = el > 0 ? pt.samples / el : 0;
    if (onProgress) onProgress({ samples: pt.samples, sps: stats.sps, opacity: pt._quad.material.opacity, tracing });
  }

  return {
    render, reset,
    update: render,
    setEnabled(b) { enabled = !!b; if (!enabled) reset(); },
    get enabled() { return enabled; },
    get samples() { return pt.samples; },
    get tracing() { return tracing; },
    get opacity() { return pt._quad.material.opacity; },
    setTheme(t) { theme = t; sig = ''; },
    setOptions(o) {
      Object.assign(O, o);
      pt.renderScale = O.renderScale; pt.tiles.set(O.tiles, O.tiles); pt.bounces = O.bounces; pt.minSamples = O.minSamples;
      pt.transmissiveBounces = O.transmissiveBounces; pt.filterGlossyFactor = O.filterGlossyFactor; pt.fadeDuration = O.fadeDuration * 1000;
      sig = ''; matCache.clear(); built = false; reset();
    },
    options: O,
    // re-composite the current accumulation straight to the canvas and return it as a data URL (tests / "save photo")
    capture({ denoise = O.denoise, type = 'image/png' } = {}) {
      const d0 = O.denoise; O.denoise = denoise; denoised = -1;
      const target = pt._pathTracer.target;
      renderer.setRenderTarget(null);
      const op = pt._quad.material.opacity; pt._quad.material.opacity = 1;
      pt.renderToCanvasCallback(target, renderer, pt._quad);
      pt._quad.material.opacity = op; O.denoise = d0; denoised = -1;
      return renderer.domElement.toDataURL(type);
    },
    invalidate() { sig = ''; reset(); },
    rebuild() { built = false; sig = ''; reset(); },
    info() {
      const g = pt._generator && pt._generator.geometry;
      const tris = g && g.index ? g.index.count / 3 : g && g.attributes.position ? g.attributes.position.count / 3 : 0;
      return { built, buildMs: Math.round(buildMs), lastSyncMs: Math.round(lastSyncMs), proxies: proxies.length, triangles: tris,
        materials: pt._materials ? pt._materials.length : 0, samples: pt.samples, sps: +stats.sps.toFixed(3), tilesPerFrame,
        frameMs: +frameMs.toFixed(1), compiling: pt.isCompiling, lights: lightRoot.children.filter((l) => l.isLight).length };
    },
    // internals for tooling
    _: { pt, ptScene, proxies, sync, O, ndRT, albRT,
      targetStats() {
        const t = pt._pathTracer.target, buf = new Float32Array(t.width * t.height * 4);
        renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
        let nan = 0, zero = 0, inf = 0, sum = 0, n = t.width * t.height;
        for (let i = 0; i < n; i++) { const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2]; if (Number.isNaN(r + g + b)) nan++; else if (!Number.isFinite(r + g + b)) inf++; else if (r + g + b === 0) zero++; else sum += r + g + b; }
        return { w: t.width, h: t.height, nan, inf, zero, mean: sum / n / 3 };
      }, get denOut() { return denOut; } },
    dispose() { try { pt.dispose(); } catch (e) { /* 0.0.23 dispose() references a missing quad */ } for (const rt of [ndRT, albRT, litRT, denA, denB]) rt.dispose(); comp.dispose(); atrous.dispose(); guideMat.dispose(); skyTex.dispose(); for (const m of matCache.values()) if (m && m.userData.kind) m.dispose(); },
  };
}
