// realism.js — the photographic layer of the walkthrough (real-time) + the photo-mode (path tracer) controller.
//
// Real-time (always on, every device):
//   • photographic CC0 PBR texture sets (js/textures.js) on floors / walls / furniture (metre-scaled UVs)
//   • filmic tone mapping (STYLE.realism.toneMapping, default AgX) with per-theme exposure
//   • window "portal" lights: a small pool of RectAreaLights re-assigned to the openings of the room you are in →
//     daylight falls off away from the windows and the windows show up as soft reflections on floors / tables
//   • room reflection probes: the current room is rendered into a cube map (once per room / theme / 氛圍燈 / blinds
//     state, while you stand still) → box-projected (parallax-corrected) reflections + room-tinted ambient light
//   • physically based glass: Fresnel reflection, premultiplied blending (transparent face-on, mirror-like at grazing
//     angles and at night)
//   • contact-hardening soft sun shadows (PCSS) on desktop; PCF soft on phones
//   • desktop: post stack (js/fx.js) — 4×MSAA HDR, N8AO ambient occlusion, bloom on light sources only, fine grain
// Photo mode (js/photo.js, three-gpu-pathtracer — lazy-loaded on first use): progressive path tracing after the camera
//   rests (desktop: automatic after 1.5 s; phones: opt-in with the 相片 button), cross-fades from the raster image,
//   any input returns to real-time instantly.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const OUTDOOR = ['balcony', 'decking', 'ledge', 'service'];

// ── contact-hardening sun shadows (PCSS for an orthographic DirectionalLight shadow) ─────────────────────────────
// Penumbra width grows with the blocker→receiver distance: w = d · 2·tan(θ/2), θ = apparent sun size (+ sky haze).
// Must run before the first material compiles. Uses renderer.shadowMap.type = PCFShadowMap.
export function installPCSS({ shadowCamera, mapSize = 2048, sunAngleDeg = 1.6, maxBlockerDist = 4.0, minTexels = 1.25, blockerSamples = 16, filterSamples = 24 }) {
  const c = shadowCamera, W = Math.max(1e-3, c.right - c.left), D = Math.max(1e-3, c.far - c.near);
  const K = D * 2 * Math.tan((sunAngleDeg * Math.PI / 180) / 2) / W;            // uv of penumbra per unit of normalised depth
  const search = Math.min(0.02, maxBlockerDist * 2 * Math.tan((sunAngleDeg * Math.PI / 180) / 2) / W);
  const f = (v) => v.toFixed(7);
  const code = /* glsl */`
	#define HOUSE_PCSS_K ${f(K)}
	#define HOUSE_PCSS_SEARCH ${f(search)}
	#define HOUSE_PCSS_MIN ${f(minTexels / mapSize)}
	#define HOUSE_PCSS_BS ${blockerSamples}
	#define HOUSE_PCSS_FS ${filterSamples}
	float houseIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 houseVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) ); float th = float( i ) * 2.39996323 + phi;
		return r * vec2( cos( th ), sin( th ) );
	}
	float housePCSS( sampler2D map, vec2 uv, float zR ) {
		float phi = houseIGN( gl_FragCoord.xy ) * 6.2831853;
		float sum = 0.0, n = 0.0;
		for ( int i = 0; i < HOUSE_PCSS_BS; i ++ ) {
			float d = unpackRGBAToDepth( texture2D( map, uv + houseVogel( i, HOUSE_PCSS_BS, phi ) * HOUSE_PCSS_SEARCH ) );
			if ( d < zR ) { sum += d; n += 1.0; }
		}
		if ( n < 0.5 ) return 1.0;
		float zB = sum / n;
		float r = clamp( ( zR - zB ) * HOUSE_PCSS_K, HOUSE_PCSS_MIN, HOUSE_PCSS_SEARCH );
		if ( n > float( HOUSE_PCSS_BS ) - 0.5 && r >= HOUSE_PCSS_SEARCH * 0.999 ) return 0.0;
		float s = 0.0;
		for ( int i = 0; i < HOUSE_PCSS_FS; i ++ ) s += texture2DCompare( map, uv + houseVogel( i, HOUSE_PCSS_FS, phi + 1.7 ) * r, zR );
		return s / float( HOUSE_PCSS_FS );
	}
	float getShadow(`;
  let s = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (s.includes('housePCSS')) return { K, search };
  const a = s.indexOf('float getShadow(');
  const b = s.indexOf('#if defined( SHADOWMAP_TYPE_PCF )', a);
  if (a < 0 || b < 0) { console.warn('[realism] shadow chunk layout changed — PCSS not installed'); return null; }
  s = s.slice(0, a) + code + s.slice(a + 'float getShadow('.length, b) +
    '#if defined( SHADOWMAP_TYPE_PCF )\n\t\t\tshadow = housePCSS( shadowMap, shadowCoord.xy, shadowCoord.z );\n\t\t#elif defined( SHADOWMAP_TYPE_PCF_DISABLED )' +
    s.slice(b + '#if defined( SHADOWMAP_TYPE_PCF )'.length);
  THREE.ShaderChunk.shadowmap_pars_fragment = s;
  return { K, search };
}

// ── shared material patches ─────────────────────────────────────────────────────────────────────────────────────
// box-projected env map: uniforms are shared objects → one update re-targets every patched material
const BP = { bpPos: { value: new THREE.Vector3() }, bpMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) }, bpMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) }, bpOn: { value: 0 } };
const BP_FRAG_DECL = /* glsl */`
uniform vec3 bpPos; uniform vec3 bpMin; uniform vec3 bpMax; uniform float bpOn; varying vec3 vBpWorld;
vec3 houseBoxProject( vec3 v ) {
	if ( bpOn < 0.5 ) return v;
	vec3 p = vBpWorld;
	if ( any( lessThan( p, bpMin - 0.08 ) ) || any( greaterThan( p, bpMax + 0.08 ) ) ) return v;
	vec3 dir = normalize( v );
	vec3 t1 = ( bpMax - p ) / dir, t2 = ( bpMin - p ) / dir;
	vec3 tf = max( t1, t2 );
	float d = min( min( tf.x, tf.y ), tf.z );
	return normalize( p + dir * max( d, 0.0 ) - bpPos );
}`;
const BP_VERT = /* glsl */`
	{ vec4 bpw = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		bpw = batchingMatrix * bpw;
	#endif
	#ifdef USE_INSTANCING
		bpw = instanceMatrix * bpw;
	#endif
	vBpWorld = ( modelMatrix * bpw ).xyz; }`;
const IBL_LINE = 'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );';

function chainCompile(mat, key, fn) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) { if (hasPrev) prev.call(this, sh, r); fn(sh, r); };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|' + key; };
  mat.needsUpdate = true;
}
function patchBoxProjection(mat) {
  if (mat.userData.__bp || !(mat.isMeshStandardMaterial)) return;
  mat.userData.__bp = true;
  chainCompile(mat, 'bp', (sh) => {
    Object.assign(sh.uniforms, BP);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBpWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + BP_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + BP_FRAG_DECL)
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(IBL_LINE, 'reflectVec = houseBoxProject( reflectVec );\n\t\t\t' + IBL_LINE));
  });
}
// thin-glass: reflection weighted by Fresnel, background attenuated by (1 − α) — premultiplied blending
function patchGlass(mat, { base = 0.05, refl = 1.0 } = {}) {
  if (mat.userData.__glass) return;
  mat.userData.__glass = true;
  mat.transparent = true; mat.depthWrite = false;
  mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.userData.glassBase = base;
  chainCompile(mat, 'glass' + base + '_' + refl, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
	{
		float nv = saturate( dot( geometryNormal, geometryViewDir ) );
		float F = 0.04 + 0.96 * pow( 1.0 - nv, 5.0 );
		float a = clamp( ${base.toFixed(3)} + ( 1.0 - ${base.toFixed(3)} ) * F, 0.0, 1.0 );
		gl_FragColor = vec4( totalSpecular * ${refl.toFixed(3)} + totalDiffuse * ${base.toFixed(3)}, a );
	}`);
  });
}

// ── window portals (PLAN windows + glass sliders that open to the outside) ─────────────────────────────────────
export function findPortals(P, L) {
  const out = [];
  const indoor = (r) => r && !OUTDOOR.includes(r.floor);
  const ops = [
    ...(P.windows || []).filter((w) => w.kind !== 'partition').map((w) => ({ ...w, kind: 'window' })),
    ...(P.doors || []).filter((d) => d.type === 'slide' && d.glass !== false).map((d) => ({ x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y0: 0.02, y1: d.h || 2.4, kind: 'slider' })),
  ];
  for (const o of ops) {
    const alongX = (o.x1 - o.x0) >= (o.z1 - o.z0);
    const c = alongX ? (o.z0 + o.z1) / 2 : (o.x0 + o.x1) / 2, a0 = alongX ? o.x0 : o.z0, a1 = alongX ? o.x1 : o.z1, am = (a0 + a1) / 2;
    const at = (off) => (alongX ? L.at(am, c + off) : L.at(c + off, am));
    const rP = at(0.35), rN = at(-0.35);
    let sgn = 0;
    if (indoor(rP) && !indoor(rN)) sgn = 1; else if (indoor(rN) && !indoor(rP)) sgn = -1; else continue;
    const outRoom = sgn > 0 ? rN : rP, room = sgn > 0 ? rP : rN;
    const half = alongX ? Math.abs(o.z1 - o.z0) / 2 : Math.abs(o.x1 - o.x0) / 2;
    const pc = c + sgn * (half + 0.02);
    const y0 = Math.max(0.02, o.y0), y1 = Math.min(room.ceilingH - 0.02, o.y1);
    const pos = alongX ? new THREE.Vector3(am, (y0 + y1) / 2, pc) : new THREE.Vector3(pc, (y0 + y1) / 2, am);
    const inward = alongX ? new THREE.Vector3(0, 0, sgn) : new THREE.Vector3(sgn, 0, 0);
    out.push({ pos, inward, w: a1 - a0 - 0.04, h: y1 - y0, room: room.id, covered: !!(outRoom && outRoom.ceiling !== false), outRoom: outRoom ? outRoom.id : null, kind: o.kind });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function createRealism(o) {
  const { renderer, scene, camera, house, M, STYLE, P, sun, hemi, sky, mobile, params, hud, furnGroup } = o;
  const R = STYLE.realism || {};
  const state = { ready: false, textures: 'pending', fx: null, probe: 0, photo: 'off', errors: [] };
  const flags = {
    tex: !params.has('notex'), portals: !params.has('noportals'), probes: !params.has('noprobe'),
    fx: params.get('fx') || (mobile ? 'off' : 'auto'), photo: !params.has('nophoto'),
  };
  // tone mapping
  const TM = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping };
  renderer.toneMapping = TM[params.get('tm') || R.toneMapping || 'neutral'] ?? THREE.NeutralToneMapping;

  // sky: tone-map it like every other surface (it was written raw) and allow an HDR gain (bright windows)
  if (sky && !sky.material.userData.__tm) {
    sky.material.userData.__tm = true;
    sky.material.fragmentShader = sky.material.fragmentShader.replace('#include <colorspace_fragment>', '#include <tonemapping_fragment>\n        #include <colorspace_fragment>');
    sky.material.needsUpdate = true;
  }

  // camera white balance: a photographer shoots interiors at ~3500–4000 K, so 3000 K fittings read warm, not orange
  const WB = R.whiteBalance ?? 0.3;
  if (WB && house.downlights) for (const f of house.downlights.fixtures) f.color.lerp(new THREE.Color(1, 1, 1), WB);

  // ── glass ─────────────────────────────────────────────────────────────────
  const glassMats = new Set([M.glass, M.glassClear, M.railGlass].filter(Boolean));
  for (const m of glassMats) { m.color.lerp(new THREE.Color(1, 1, 1), 0.5); patchGlass(m, { base: m === M.railGlass ? 0.07 : 0.05 }); }

  // ── portals ───────────────────────────────────────────────────────────────
  RectAreaLightUniformsLib.init();
  const portalDefs = flags.portals ? findPortals(P, house.lookup) : [];
  const nPortal = flags.portals ? (mobile ? (R.portalsMobile ?? 3) : (R.portals ?? 5)) : 0;
  const portalPool = [];
  for (let i = 0; i < nPortal; i++) {
    const l = new THREE.RectAreaLight('#ffffff', 0, 1, 1);
    l.name = 'portal' + i; l.userData = { def: null, want: null, w: 0, realismPortal: true };
    scene.add(l); portalPool.push(l);
  }
  let portalTimer = 0;
  const portalCol = new THREE.Color();
  let PT = { intensity: 0, color: '#ffffff', covered: 0.6, blinds: 0.3 };
  function updatePortals(dt, ctx) {
    if (!nPortal) return false;
    portalTimer -= dt;
    const walk = ctx.mode === 'walk';
    if (portalTimer <= 0) {
      portalTimer = 0.25;
      let want = [];
      if (walk && PT.intensity > 0) {
        const cp = camera.position, room = ctx.room;
        const score = (d) => d.pos.distanceTo(cp) + (room && d.room === room.id ? 0 : 4);
        want = portalDefs.filter((d) => (room && d.room === room.id) || d.pos.distanceTo(cp) < 3.2).sort((a, b) => score(a) - score(b)).slice(0, nPortal);
      }
      const free = [];
      for (const l of portalPool) { const i = want.indexOf(l.userData.def); if (i >= 0) { want.splice(i, 1); l.userData.want = l.userData.def; } else free.push(l); }
      for (const l of free) l.userData.want = want.shift() || null;
    }
    let changing = false;
    const a = Math.min(1, dt / 0.35);
    for (const l of portalPool) {
      const u = l.userData, w0 = u.w;
      if (u.want !== u.def) {
        u.w = Math.max(0, u.w - a);
        if (u.w <= 0) {
          u.def = u.want;
          if (u.def) { l.width = u.def.w; l.height = u.def.h; l.position.copy(u.def.pos); l.lookAt(u.def.pos.clone().add(u.def.inward)); l.updateMatrixWorld(); }
        }
      } else if (u.def) u.w = Math.min(1, u.w + a);
      const d = u.def;
      const k = d ? (d.covered ? PT.covered : 1) * (ctx.blinds && d.outRoom === 'balcony' ? PT.blinds : 1) : 0;
      l.intensity = PT.intensity * k * u.w;
      l.visible = l.intensity > 1e-4;
      if (u.w !== w0) changing = true;
    }
    return changing;
  }

  // ── reflection probes ─────────────────────────────────────────────────────
  const pmrem = new THREE.PMREMGenerator(renderer);
  const probeSize = 256;
  const cubeRT = new THREE.WebGLCubeRenderTarget(probeSize, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.03, 2500, cubeRT);
  const probeCache = new Map();          // key → { rt, room, t }
  const probeMax = mobile ? 4 : 8;
  const fallbackEnv = o.envTexture ? { texture: o.envTexture } : null;   // RoomEnvironment PMREM (256) from main.js — same cubeUV size → no recompiles
  let probeRoom = null, probeKeyCur = '', probeWait = 0, roomSince = 0, lastRoomId = null;
  const hideDuringProbe = [];
  function probeKey(room, ctx) { return [room.id, ctx.theme, ctx.ambient ? 1 : 0, ctx.blinds ? 1 : 0].join('|'); }
  function captureProbe(room, key) {
    const t0 = performance.now();
    const bb = room.bbox, ch = room.ceilingH || P.ceiling;
    const [cx, cz] = room.centroid;
    const py = Math.min(1.55, ch - 0.5);
    // nudge the probe out of furniture / walls (sample free spot near centroid)
    cubeCam.position.set(cx, py, cz);
    const prevEnv = scene.environment;
    for (const ob of hideDuringProbe) ob.visible = false;
    const prevFog = scene.fog;
    cubeCam.update(renderer, scene);
    scene.fog = prevFog;
    for (const ob of hideDuringProbe) ob.visible = true;
    let entry = probeCache.get(key);
    if (!entry && probeCache.size >= probeMax) {          // evict least recently used (but never the current one)
      let oldK = null, oldT = Infinity;
      for (const [k, e] of probeCache) if (k !== probeKeyCur && e.t < oldT) { oldT = e.t; oldK = k; }
      if (oldK) { entry = probeCache.get(oldK); probeCache.delete(oldK); }
    }
    const rt = pmrem.fromCubemap(cubeRT.texture, entry ? entry.rt : null);
    entry = { rt, room, t: performance.now(), pos: cubeCam.position.clone(), min: new THREE.Vector3(bb.x0, 0, bb.z0), max: new THREE.Vector3(bb.x1, ch, bb.z1) };
    probeCache.set(key, entry);
    scene.environment = prevEnv;
    state.probe++; state.probeMs = +(performance.now() - t0).toFixed(1);
    return entry;
  }
  function useProbe(entry) {
    scene.environment = entry ? entry.rt.texture : fallbackEnv && fallbackEnv.texture;
    if (entry) { BP.bpPos.value.copy(entry.pos); BP.bpMin.value.copy(entry.min); BP.bpMax.value.copy(entry.max); BP.bpOn.value = 1; }
    else BP.bpOn.value = 0;
  }
  let probeDirty = true;
  function updateProbe(dt, ctx) {
    if (!flags.probes || !fallbackEnv) return;
    if (ctx.mode !== 'walk' || !ctx.room) {
      if (ctx.mode === 'overview' && probeKeyCur !== 'fallback') { useProbe(null); probeKeyCur = 'fallback'; }
      return;
    }
    const room = ctx.room;
    if (room.ceiling === false) return;                     // A/C ledges: keep the last probe
    if (room.id !== lastRoomId) { lastRoomId = room.id; roomSince = 0; probeWait = 0; } else roomSince += dt;
    const key = probeKey(room, ctx);
    if (key === probeKeyCur && !probeDirty) return;
    const cached = probeCache.get(key);
    if (cached && !probeDirty) { cached.t = performance.now(); useProbe(cached); probeKeyCur = key; return; }
    // capture once the camera rests (or after a while in the room even while moving)
    probeWait += dt;
    if ((ctx.cameraIdle > 0.15 && probeWait > 0.1) || roomSince > 1.2 || probeKeyCur === '' || probeKeyCur === 'fallback') {
      if (probeDirty) { useProbe(null); for (const e of probeCache.values()) e.rt.dispose(); probeCache.clear(); }
      const e = captureProbe(room, key); useProbe(e); probeKeyCur = key; probeWait = 0; probeDirty = false;
    }
  }

  // ── textures ──────────────────────────────────────────────────────────────
  async function applyTextures() {
    if (!flags.tex) { state.textures = 'off'; return; }
    const { loadTextureSets } = await import('./textures.js');
    const T0 = performance.now();
    const sets = await loadTextureSets(renderer, { mobile, base: mobile ? './assets/textures/m/' : './assets/textures/' });
    const F = M.floor, rep = [];
    const TX = R.textures || {};
    if (F.wood && sets.oak) { sets.oak.apply(F.wood, { roughness: TX.oakRoughness ?? 1.0, normalScale: 0.6 }); rep.push('oak'); }
    if (F.tile && sets.tile) { sets.tile.apply(F.tile, { roughness: TX.tileRoughness ?? 0.7, normalScale: 0.5 }); rep.push('tile'); }
    if (F.lobby && sets.tile) { sets.tile.apply(F.lobby, { keepColor: true, roughness: 0.8 }); rep.push('lobby'); }
    if (F.decking && sets.decking) { sets.decking.apply(F.decking, { roughness: 1.0 }); rep.push('decking'); }
    if (M.wall && sets.limewash) {            // subtle plaster relief (paint colour unchanged)
      for (const w of [M.wall, M.facade, M.ceiling]) {
        if (!w) continue;
        const keep = w.map; sets.limewash.apply(w, { normalScale: w === M.ceiling ? 0.12 : 0.22, roughness: 1 }); w.map = keep;
        w.roughness = w === M.ceiling ? 0.95 : 0.9; w.roughnessMap = null;
      }
      rep.push('limewash');
    }
    // furniture: inject into the cached kit materials (works on the batched meshes too)
    try {
      const fm = await import('./furniture.js');
      if (fm.setFurnitureTextures) {
        const spec = {};
        if (sets.linen) spec.fabric = { map: sets.linen.map, normalMap: sets.linen.normalMap, size: 0.22, normalScale: 0.7 };
        if (sets.steel) spec.metal = { normalMap: sets.steel.normalMap, roughnessMap: sets.steel.roughnessMap, size: 0.5, normalScale: 0.2, roughness: 1.0 };
        if (sets.stone) spec.quartz = { roughnessMap: sets.stone.roughnessMap, normalMap: sets.stone.normalMap, size: 1.2, normalScale: 0.15, roughness: 0.9 };
        if (sets.travertine) spec.sintered = { normalMap: sets.travertine.normalMap, roughnessMap: sets.travertine.roughnessMap, size: 1.0, normalScale: 0.35, roughness: 1.0 };
        fm.setFurnitureTextures(spec); rep.push('furniture:' + Object.keys(spec).join('+'));
      }
    } catch (e) { console.warn('[realism] furniture textures skipped', e && e.message); }
    state.textures = rep.join(',') + ` (${Math.round(performance.now() - T0)} ms)`;
  }

  // ── material pass: box projection on every lit standard material inside the house ────────────────────────────
  function patchMaterials() {
    const ext = scene.getObjectByName('exterior');
    const skip = new Set(); if (ext) ext.traverse((x) => { if (x.isMesh) for (const m of [].concat(x.material)) skip.add(m); });
    let n = 0;
    scene.traverse((x) => {
      if (!x.isMesh) return;
      for (const m of [].concat(x.material)) {
        if (!m || skip.has(m) || !m.isMeshStandardMaterial || m.userData.__bp) continue;
        if (m.envMapIntensity === 0) continue;
        patchBoxProjection(m); n++;
      }
      // furniture glass (shower screens, cabinet glass): same thin-glass model
      for (const m of [].concat(x.material)) if (m && m.isMeshPhysicalMaterial && m.transparent && m.opacity < 0.5 && !m.map && !m.userData.__glass && m.roughness < 0.2) { patchGlass(m, { base: 0.06 }); glassMats.add(m); }
    });
    return n;
  }

  // ── themes ────────────────────────────────────────────────────────────────
  let themeName = 'day', TR = {};
  function onTheme(T, name) {
    themeName = name; TR = T.realism || {};
    if (TR.exposure !== undefined) renderer.toneMappingExposure = TR.exposure;
    if (params.get('exp')) renderer.toneMappingExposure *= +params.get('exp');
    if (TR.hemi !== undefined) hemi.intensity *= TR.hemi;
    if (TR.hemiSky) hemi.color.set(TR.hemiSky);
    if (TR.hemiGround) hemi.groundColor.set(TR.hemiGround);
    if (TR.sun !== undefined) sun.intensity *= TR.sun;
    if (TR.sunColor) sun.color.set(TR.sunColor);
    if (TR.env !== undefined) scene.environmentIntensity = TR.env;
    if (TR.skyGain && sky) { const u = sky.material.uniforms; u.top.value.multiplyScalar(TR.skyGain); u.horizon.value.multiplyScalar(TR.skyGain); u.bottom.value.multiplyScalar(TR.skyGain); u.sunAmt.value *= TR.skyGain; }
    if (TR.apertures !== undefined && M.aperture) { if (M.aperture.color.r > 0.5) M.aperture.color.setScalar(TR.apertures); }
    PT = { intensity: 0, color: '#ffffff', covered: 0.6, blinds: 0.3, ...(TR.portal || {}) };
    portalCol.set(PT.color);
    for (const l of portalPool) l.color.copy(portalCol);
    if (M.ao && fx && fx.quality !== 'off' && fx.quality !== 'low') M.ao.opacity = R.aoStripsWithSSAO ?? 0.45; else if (M.ao) M.ao.opacity = 1;
    probeDirty = true;
    if (photo) photo.setTheme(name);
  }

  // ── FX (desktop composer) ─────────────────────────────────────────────────
  let fx = null;
  async function setupFX() {
    if (flags.fx === 'off') return;
    try {
      const { createFX, PRESETS } = await import('./fx.js');
      if (R.fx) for (const k in R.fx) if (PRESETS[k]) Object.assign(PRESETS[k], R.fx[k]);
      fx = createFX({ renderer, scene, camera, quality: flags.fx, mobile });
      state.fx = fx.quality;
    } catch (e) { console.warn('[realism] fx unavailable', e && e.message); state.errors.push('fx: ' + (e && e.message)); fx = null; }
  }

  // ── photo mode ────────────────────────────────────────────────────────────
  let photo = null, photoLoading = null, photoArmed = false, photoSupported = null, envs = null;
  function ptSupported() {
    if (photoSupported !== null) return photoSupported;
    try {
      const gl = renderer.getContext();
      const ok = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float') && renderer.capabilities.maxTextures >= 16 &&
        renderer.capabilities.maxTextureSize >= 4096 && gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) >= 224;
      photoSupported = !!ok && flags.photo;
    } catch (e) { photoSupported = false; }
    return photoSupported;
  }
  async function loadPhoto() {
    if (photo) return photo;
    if (photoLoading) return photoLoading;
    photoLoading = (async () => {
      state.photo = 'loading'; hud && hud.setPhoto && hud.setPhoto({ armed: photoArmed, loading: true });
      const [{ createPhotoMode }, fxm] = await Promise.all([import('./photo.js'), import('./fx.js')]);
      envs = await fxm.loadEnvironments(renderer, { base: './assets/env/' });
      const opts = { ...(R.photo || {}), ...(mobile ? (R.photoMobile || {}) : {}) };
      for (const [k, v] of params) if (k.startsWith('pt.')) opts[k.slice(3)] = isNaN(+v) ? (v === 'true' ? true : v === 'false' ? false : v) : +v;
      opts.environment = envs.pt;
      photo = createPhotoMode({
        renderer, scene, camera, house, M, spotRig: o.spotRig, STYLE, plan: P, mobile,
        isIdle: (ctx) => ctx.cameraIdle > photoDelay() && ctx.sceneIdle > Math.min(0.5, photoDelay()),
        rasterRender: () => rasterRender(), options: opts,
        onProgress: (p) => progress(p),
      });
      photo.setTheme(themeName);
      state.photo = 'ready';
      return photo;
    })().catch((e) => { console.error('[realism] photo mode failed', e); state.photo = 'error'; state.errors.push('photo: ' + (e && e.message)); photoSupported = false; hud && hud.setPhoto && hud.setPhoto({ unsupported: true }); return null; });
    return photoLoading;
  }
  const photoDelay = () => (mobile ? (R.photoIdleMobile ?? 0.6) : (R.photoIdle ?? 1.5));
  function setPhotoArmed(on, userAction = true) {
    if (!ptSupported()) { photoArmed = false; hud && hud.setPhoto && hud.setPhoto({ unsupported: true }); return false; }
    photoArmed = !!on;
    if (!photoArmed && photo) photo.reset();
    if (photoArmed && userAction) loadPhoto();          // explicit tap: fetch now; automatic mode loads on first idle
    hud && hud.setPhoto && hud.setPhoto({ armed: photoArmed, samples: 0, tracing: false });
    if (userAction) try { localStorage.setItem('skg-photo', photoArmed ? '1' : '0'); } catch (e) { /* private mode */ }
    return photoArmed;
  }
  let lastProg = 0;
  function progress(p) {
    const now = performance.now();
    if (now - lastProg < 120 && p.tracing) return; lastProg = now;
    hud && hud.setPhoto && hud.setPhoto({ armed: photoArmed, tracing: p.tracing && p.samples > 0, samples: Math.floor(p.samples), max: photo ? photo.options.maxSamples : 0, opacity: p.opacity });
  }

  function rasterRender() { if (fx) fx.render(); else renderer.render(scene, camera); }

  // ── per-frame ─────────────────────────────────────────────────────────────
  function update(dt, ctx) {
    let busy = false;
    if (updatePortals(dt, ctx)) busy = true;
    if (state.ready) updateProbe(dt, ctx);
    return busy;
  }
  let wasTracing = false;
  function render(ctx) {
    if (!photo && photoArmed && ctx.mode === 'walk' && ctx.cameraIdle > photoDelay() * 0.6 && state.ready) loadPhoto();   // lazy: first use
    if (photo && photoArmed && ctx.mode === 'walk') {
      photo.render(ctx);
      if (wasTracing && !photo.tracing) progress({ tracing: false, samples: 0, opacity: 0 });
      wasTracing = photo.tracing;
    } else {
      if (wasTracing && photo) { photo.reset(); progress({ tracing: false, samples: 0, opacity: 0 }); wasTracing = false; }
      rasterRender();
    }
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  let started = null;
  const start = () => started || (started = (async () => {
    const t0 = performance.now();
    await Promise.all([applyTextures().catch((e) => { console.warn('[realism] textures failed', e); state.textures = 'error'; }), setupFX()]);
    state.patched = patchMaterials();
    renderer.shadowMap.needsUpdate = true;
    // photo mode: desktop auto (unless the user switched it off before), phones opt-in
    let pref = null; try { pref = localStorage.getItem('skg-photo'); } catch (e) { /* ignore */ }
    if (params.has('photo')) pref = params.get('photo') === '0' ? '0' : '1';
    if (!ptSupported()) hud && hud.setPhoto && hud.setPhoto({ unsupported: true });
    else setPhotoArmed(pref ? pref === '1' : !mobile, false);
    if (o.onReapplyTheme) o.onReapplyTheme();
    state.ready = true; state.bootMs = Math.round(performance.now() - t0);
    console.info('[realism] ready', JSON.stringify(state));
  })());

  return {
    start, update, render, onTheme, rasterRender,
    get fx() { return fx; }, get photo() { return photo; },
    get photoArmed() { return photoArmed; },
    togglePhoto() { return setPhotoArmed(!photoArmed, true); },
    setPhotoArmed, loadPhoto, ptSupported,
    invalidateProbe() { probeDirty = true; },
    // relative GPU cost (ms / frame incl. a pixel read-back): 'fx' = current pipeline, 'plain' = renderer.render only
    bench(which = 'fx', n = 5) {
      const gl = renderer.getContext(), px = new Uint8Array(4);
      const fn = which === 'plain' ? () => renderer.render(scene, camera) : () => rasterRender();
      fn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { fn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return +((performance.now() - t0) / n).toFixed(1);
    },
    resize(w, h) { if (fx) fx.setSize(w, h); },
    portals: portalDefs, BP,
    info() {
      return { ...state, fx: fx ? fx.info() : null, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
        portals: portalPool.filter((l) => l.visible).length, portalDefs: portalDefs.length, probeKey: probeKeyCur, probes: probeCache.size,
        photoArmed, photoSupported, photo: photo ? photo.info() : null };
    },
    get isReady() { return state.ready; },
  };
}
