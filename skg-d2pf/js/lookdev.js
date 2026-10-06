// lookdev.js — material look-dev layer (runs inside realism.js after the photographic texture sets have loaded).
//
//   • crema-marfil porcelain floor (living / dining / kitchen / hall = floor type 'tile'): real 600×1200 tiles laid in
//     world space, every tile cut from a different window of a large CC0 marble scan (random offset + 180° turn + tiny
//     tone shift → no visible repeats), hairline 1.5 mm grout (analytic, anti-aliased at any distance), polished
//     roughness 0.10–0.22 from a roughness map, grout matte.
//   • planar floor reflection: the scene mirrored about y = 0 is rendered into a reduced-resolution HDR target (oblique
//     near plane, like three's Reflector) and fed into the floor's indirect-specular term (replaces the probe radiance
//     → Fresnel / roughness handled by the standard BRDF). Blur by roughness via the target's mip chain.
//   • TV-console LED under-glow: analytic line light (closed-form irradiance of a lambertian strip on a horizontal
//     receiver) added to the floor + rug shading — tone-mapped with everything else, so it can never blow out.
//   • photographic maps on furniture (oak veneer with grain along each part's long axis, linen weave, wool/jute rug,
//     travertine top), limewash feature wall, plaster relief on walls / ceiling.
import * as THREE from 'three';

const chain = (mat, key, fn) => {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) { if (hasPrev) prev.call(this, sh, r); fn(sh, r); };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|' + key; };
  mat.needsUpdate = true;
};

const VERT_DECL = 'varying vec3 vLdWorld;';
const VERT_BODY = /* glsl */`
	{ vec4 ldw = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		ldw = batchingMatrix * ldw;
	#endif
	#ifdef USE_INSTANCING
		ldw = instanceMatrix * ldw;
	#endif
	vLdWorld = ( modelMatrix * ldw ).xyz; }`;

// closed-form irradiance of a straight lambertian line source (segment A→B at height h above the receiver plane,
// emitting downward) on a horizontal receiver; normalised so an infinitely long strip gives 1 directly below it
const GLOW_GLSL = /* glsl */`
uniform vec3 ldGlowA; uniform vec3 ldGlowB; uniform vec3 ldGlowCol; uniform vec2 ldGlowOut;
float ldLineF( float s, float D ) { return s / ( 2.0 * D * D * ( s * s + D * D ) ) + atan( s / D ) / ( 2.0 * D * D * D ); }
vec3 ldGlow( vec3 P ) {
	if ( dot( ldGlowCol, ldGlowCol ) < 1e-8 ) return vec3( 0.0 );
	vec2 a = ldGlowA.xz - P.xz, b = ldGlowB.xz - P.xz;
	vec2 u = normalize( ldGlowB.xz - ldGlowA.xz );
	float s1 = dot( a, u ), s2 = dot( b, u );
	float y0 = abs( a.x * u.y - a.y * u.x );
	float h = max( 0.012, ldGlowA.y - P.y );
	float D = sqrt( y0 * y0 + h * h );
	float E = h * h * ( ldLineF( s2, D ) - ldLineF( s1, D ) ) / ( 1.5707963 / h );
	// strip sits under the cabinet overhang: almost nothing reaches the floor behind the emitter
	float front = dot( P.xz - ldGlowA.xz, ldGlowOut );
	E *= smoothstep( -0.05, 0.01, front );
	return ldGlowCol * max( E, 0.0 );
}`;

export function createLookdev({ renderer, scene, camera, house, M, STYLE, mobile, params, P }) {
  const LK = STYLE.look || {};
  const info = { floor: 'off', planar: 'off', glow: 0, furniture: '' };

  // ── shared uniforms ───────────────────────────────────────────────────────────────────────────────────────────
  const U = {
    ldMarble: { value: null }, ldMarbleN: { value: null }, ldMarbleR: { value: null },
    ldMarbleSize: { value: 1.6 }, ldTile: { value: new THREE.Vector2(1.2, 0.6) }, ldOrigin: { value: new THREE.Vector2(0, 0) },
    ldGrout: { value: 0.0015 }, ldGroutCol: { value: new THREE.Color('#b8a993') }, ldNormalScale: { value: 0.35 },
    ldTileVar: { value: 0.05 },
    ldRefl: { value: null }, ldReflMat: { value: new THREE.Matrix4() }, ldReflOn: { value: 0 }, ldReflLod: { value: 8 },
    ldReflStr: { value: 1 }, ldReflGraze: { value: 3 }, ldSheen: { value: 0.45 },
    ldGlowA: { value: new THREE.Vector3() }, ldGlowB: { value: new THREE.Vector3(1, 0, 0) }, ldGlowCol: { value: new THREE.Vector3() },
    ldGlowOut: { value: new THREE.Vector2(0, 1) },
  };

  // ── TV console LED line (from the plan) ─────────────────────────────────────────────────────────────────────
  const cons = (P.furniture || []).find((f) => f.type === 'tv_console' && !(f.opts && f.opts.led === false));
  const glowBase = new THREE.Color(0, 0, 0);
  if (cons) {
    const a = (cons.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const toW = (lx, lz) => [cons.x + lx * c + lz * s, cons.z - lx * s + lz * c];
    const rf = Math.min(0.12, cons.d * 0.32, cons.w / 4), zl = cons.d / 2 - 0.05 + 0.01;
    const [ax, az] = toW(-cons.w / 2 + rf, zl), [bx, bz] = toW(cons.w / 2 - rf, zl), [ox, oz] = toW(0, 1);
    const hL = (LK.consoleGlow && LK.consoleGlow.h) ?? 0.09;
    U.ldGlowA.value.set(ax, hL, az); U.ldGlowB.value.set(bx, hL, bz);
    U.ldGlowOut.value.set(ox - cons.x, oz - cons.z).normalize();
    glowBase.set(STYLE.wbColor ? STYLE.wbColor(LK.consoleGlow ? LK.consoleGlow.cct : 2700) : '#ffc690');
  }
  function setGlow(k) {
    const G = LK.consoleGlow || { level: 0.6 };
    const v = Math.max(0, k) * (G.level ?? 0.6);
    U.ldGlowCol.value.set(glowBase.r * v, glowBase.g * v, glowBase.b * v);
    info.glow = +v.toFixed(3);
  }

  // ── floor shader (tile floors) ─────────────────────────────────────────────────────────────────────────────
  const planarOK = !params.has('noplanar') && (LK.planar !== false);
  const FLOOR_FRAG_DECL = /* glsl */`
varying vec3 vLdWorld;
uniform sampler2D ldMarble; uniform sampler2D ldMarbleN; uniform sampler2D ldMarbleR;
uniform float ldMarbleSize; uniform vec2 ldTile; uniform vec2 ldOrigin; uniform float ldGrout; uniform vec3 ldGroutCol;
uniform float ldNormalScale; uniform float ldTileVar;
uniform sampler2D ldRefl; uniform mat4 ldReflMat; uniform float ldReflOn; uniform float ldReflLod; uniform float ldReflStr; uniform float ldReflGraze;
${GLOW_GLSL}
float ldHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
vec2 ldMuv; vec2 ldDx; vec2 ldDy; float ldFlip; float ldGroutM; float ldTint; vec3 ldNw;
void ldTileSetup() {
	vec2 fp = vLdWorld.xz - ldOrigin;
	vec2 tid = floor( fp / ldTile );
	vec2 local = fp - tid * ldTile;
	float h1 = ldHash( tid ), h2 = ldHash( tid + vec2( 17.3, 5.1 ) ), h3 = ldHash( tid + vec2( 3.7, 41.9 ) ), h4 = ldHash( tid + vec2( 9.1, 2.3 ) );
	ldFlip = h3 > 0.5 ? -1.0 : 1.0;
	vec2 l2 = ldFlip > 0.0 ? local : ldTile - local;
	ldMuv = ( l2 + vec2( h1, h2 ) * ldMarbleSize * 3.0 ) / ldMarbleSize;
	ldDx = dFdx( fp ) / ldMarbleSize * ldFlip; ldDy = dFdy( fp ) / ldMarbleSize * ldFlip;
	vec2 e2 = min( local, ldTile - local ); float e = min( e2.x, e2.y );
	float w = max( length( fwidth( fp ) ), 1e-5 ), g = ldGrout * 0.5;
	ldGroutM = ( 1.0 - smoothstep( g - 0.5 * w, g + 0.5 * w, e ) ) * min( 1.0, ldGrout / w );
	ldTint = h4 - 0.5;
}`;
  function patchFloor(mat) {
    if (mat.userData.__ldFloor) return;
    mat.userData.__ldFloor = true;
    mat.color.set('#ffffff'); mat.roughness = 1; mat.metalness = 0;
    mat.dithering = true;
    chain(mat, 'ldFloor' + (planarOK ? 'P' + (mobile ? 'm' : 'd') : ''), (sh) => {
      Object.assign(sh.uniforms, U);
      if (planarOK) sh.defines = { ...(sh.defines || {}), LD_PLANAR: 1, LD_TAPS: mobile ? 1 : 4 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FLOOR_FRAG_DECL)
        .replace('#include <map_fragment>', /* glsl */`
	ldTileSetup();
	{ vec3 a = textureGrad( ldMarble, ldMuv, ldDx, ldDy ).rgb;
	  a *= 1.0 + ldTint * ldTileVar;
	  diffuseColor.rgb *= mix( a, ldGroutCol, ldGroutM ); }`)
        .replace('#include <roughnessmap_fragment>', /* glsl */`
	float roughnessFactor = roughness * textureGrad( ldMarbleR, ldMuv, ldDx, ldDy ).g;
	roughnessFactor = mix( roughnessFactor, 0.6, ldGroutM );`)
        .replace('#include <normal_fragment_maps>', /* glsl */`
	{ vec3 n = textureGrad( ldMarbleN, ldMuv, ldDx, ldDy ).xyz * 2.0 - 1.0;
	  n.xy *= ldNormalScale * ldFlip * ( 1.0 - ldGroutM );
	  ldNw = normalize( vec3( n.x, n.z, - n.y ) );
	  normal = normalize( ( viewMatrix * vec4( ldNw, 0.0 ) ).xyz ); }`)
        .replace('#include <lights_fragment_maps>', /* glsl */`#include <lights_fragment_maps>
	#if defined( LD_PLANAR ) && defined( RE_IndirectSpecular )
	if ( ldReflOn > 0.5 ) {
		vec4 rc = ldReflMat * vec4( vLdWorld.x + ldNw.x * 0.04, 0.0, vLdWorld.z + ldNw.z * 0.04, 1.0 );
		vec2 ruv = rc.xy / rc.w;
		float lod = ldReflLod * clamp( material.roughness - 0.05, 0.0, 1.0 );
		vec3 pr;
		#if LD_TAPS > 1
			vec2 px = 0.6 * exp2( lod ) / vec2( textureSize( ldRefl, 0 ) );
			pr = 0.25 * ( textureLod( ldRefl, ruv + vec2( px.x, px.y * 0.3 ), lod ).rgb + textureLod( ldRefl, ruv - vec2( px.x, px.y * 0.3 ), lod ).rgb
				+ textureLod( ldRefl, ruv + vec2( - px.x * 0.3, px.y ), lod ).rgb + textureLod( ldRefl, ruv + vec2( px.x * 0.3, - px.y ), lod ).rgb );
		#else
			pr = textureLod( ldRefl, ruv, lod ).rgb;
		#endif
		float f = smoothstep( 0.0, 0.04, ruv.x ) * smoothstep( 1.0, 0.96, ruv.x ) * smoothstep( 0.0, 0.04, ruv.y ) * smoothstep( 1.0, 0.96, ruv.y );
		float nv = saturate( dot( geometryNormal, geometryViewDir ) );
		float gain = mix( ldReflStr, ldReflGraze, pow( 1.0 - nv, 3.0 ) );    // presence grows toward grazing (Fresnel-like), ≈ physical face-on
		radiance = mix( radiance, pr * gain, f * ( 1.0 - ldGroutM ) );
	}
	#endif`)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.directDiffuse += ldGlow( vLdWorld ) * BRDF_Lambert( material.diffuseColor );');
    });
  }
  // the LED glow also lands on the rug
  function patchGlow(mat) {
    if (mat.userData.__ldGlow) return;
    mat.userData.__ldGlow = true;
    chain(mat, 'ldGlow', (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_BODY);
      sh.uniforms.ldSheen = U.ldSheen;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLdWorld;\nuniform float ldSheen;\n' + GLOW_GLSL)
        .replace('#include <lights_physical_fragment>', '{ float nvS = saturate( dot( normal, normalize( vViewPosition ) ) ); diffuseColor.rgb *= 1.0 + ldSheen * pow( 1.0 - nvS, 3.0 ); }\n#include <lights_physical_fragment>')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.directDiffuse += ldGlow( vLdWorld ) * BRDF_Lambert( material.diffuseColor );');
    });
  }

  // composite tile texture (desktop): the path tracer / any un-patched consumer sees real tiles + grout in material.map
  function compositeTiles(img) {
    const S = 2048, Wm = 2.4, Hm = 2.4, pm = S / Wm, ms = U.ldMarbleSize.value;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const r = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const T = U.ldTile.value;
    for (let j = 0; j < Hm / T.y; j++) for (let i = 0; i < Wm / T.x; i++) {
      const sx = r(i * 7 + j * 13 + 1) * (img.width - T.x / ms * img.width), sy = r(i * 3 + j * 29 + 5) * (img.height - T.y / ms * img.height);
      const sw = T.x / ms * img.width, shh = T.y / ms * img.height;
      g.save(); g.translate(i * T.x * pm, j * T.y * pm);
      if (r(i + j * 5 + 9) > 0.5) { g.translate(T.x * pm, T.y * pm); g.rotate(Math.PI); }
      g.drawImage(img, sx, sy, sw, shh, 0, 0, T.x * pm, T.y * pm); g.restore();
    }
    g.fillStyle = '#' + U.ldGroutCol.value.getHexString(THREE.SRGBColorSpace);
    const gw = Math.max(1, U.ldGrout.value * pm);
    for (let x = 0; x <= Wm + 1e-6; x += T.x) g.fillRect(x * pm - gw / 2, 0, gw, S);
    for (let y = 0; y <= Hm + 1e-6; y += T.y) g.fillRect(0, y * pm - gw / 2, S, gw);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / Wm, 1 / Hm); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // ── planar reflection ───────────────────────────────────────────────────────────────────────────────────────
  let rt = null; const vcam = new THREE.PerspectiveCamera();
  const _n = new THREE.Vector3(0, 1, 0), _pos = new THREE.Vector3(), _cam = new THREE.Vector3(), _rot = new THREE.Matrix4(),
    _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
  const hide = [];
  const scale = mobile ? (LK.planarScaleMobile ?? 0.35) : (LK.planarScale ?? 0.5);
  function ensureRT() {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(sz.x * scale)), h = Math.max(64, Math.round(sz.y * scale));
    if (rt && rt.width === w && rt.height === h) return rt;
    const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    rt.texture.name = 'floorReflection';
    U.ldRefl.value = rt.texture;
    U.ldReflLod.value = mobile ? 5 : 7;
    info.planar = `${w}×${h} ${half ? 'half' : 'u8'}`;
    return rt;
  }
  let reflMs = 0, frames = 0, enabled = false, suspended = false;
  // phones: if frames stay slow (> 26 ms for 3 s while walking) the planar pass is dropped → probe reflections only
  let slowT = 0, dtEMA = 1 / 60;
  function renderReflection(ctx) {
    if (ctx && ctx.rawDt) {
      dtEMA += (Math.min(ctx.rawDt, 0.2) - dtEMA) * 0.1;
      if (mobile && !params.has('keepplanar') && enabled && ctx.mode === 'walk') {
        slowT = dtEMA > 0.026 && renderer.getPixelRatio() <= 1.26 ? slowT + ctx.rawDt : 0;   // after adaptive DPR hit its floor
        if (slowT > 3) { enabled = false; info.planar += ' (dropped: slow)'; console.info('[look] planar reflection off (slow device)'); }
      }
    }
    if (!enabled || suspended || !planarOK) { U.ldReflOn.value = 0; return; }
    const walk = !ctx || ctx.mode === 'walk' || ctx.mode === 'tween';
    if (!walk) { U.ldReflOn.value = 0; return; }
    camera.updateMatrixWorld();
    _cam.setFromMatrixPosition(camera.matrixWorld);
    if (_cam.y <= 0.05) { U.ldReflOn.value = 0; return; }
    const t0 = performance.now();
    ensureRT();
    _pos.set(0, 0, 0);
    _view.subVectors(_pos, _cam).reflect(_n).negate().add(_pos);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cam);
    _tgt.subVectors(_pos, _look).reflect(_n).negate().add(_pos);
    vcam.position.copy(_view);
    vcam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vcam.lookAt(_tgt);
    vcam.near = camera.near; vcam.far = camera.far; vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    const tm = U.ldReflMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vcam.projectionMatrix); tm.multiply(vcam.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _pos); _plane.applyMatrix4(vcam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pe = vcam.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pe[8]) / pe[0]; _q.y = (Math.sign(_clip.y) + pe[9]) / pe[5]; _q.z = -1; _q.w = (1 + pe[10]) / pe[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pe[2] = _clip.x; pe[6] = _clip.y; pe[10] = _clip.z + 1 - 0.003; pe[14] = _clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    U.ldReflOn.value = 0;
    const vis = hide.map((o) => o.visible); for (const o of hide) o.visible = false;
    const prevRT = renderer.getRenderTarget(), prevXr = renderer.xr.enabled, prevSM = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.clear();
    renderer.render(scene, vcam);
    info.reflCalls = renderer.info.render.calls;
    renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXr; renderer.shadowMap.autoUpdate = prevSM;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    U.ldReflOn.value = 1;
    frames++; reflMs = reflMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  // ── texture application ─────────────────────────────────────────────────────────────────────────────────────
  async function apply(sets) {
    const rep = [];
    const F = M.floor;
    const mb = sets.marble;
    if (F.tile && mb && mb.map) {
      U.ldMarble.value = mb.map; U.ldMarbleN.value = mb.normalMap; U.ldMarbleR.value = mb.roughnessMap;
      for (const t of [mb.map, mb.normalMap, mb.roughnessMap]) if (t) { t.repeat.set(1, 1); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true; }
      const meta = mb.meta || {};
      U.ldMarbleSize.value = mb.size[0];
      if (meta.tile) U.ldTile.value.set(meta.tile[0], meta.tile[1]);
      if (meta.grout) U.ldGrout.value = meta.grout;
      U.ldNormalScale.value = mb.normalScale;
      const FL = LK.floor || {};
      if (FL.origin) U.ldOrigin.value.set(FL.origin[0], FL.origin[1]);
      if (FL.grout) U.ldGroutCol.value.set(FL.grout);
      if (FL.tileVar !== undefined) U.ldTileVar.value = FL.tileVar;
      F.tile.map = (!mobile && mb.map.image) ? compositeTiles(mb.map.image) : mb.map;
      F.tile.normalMap = null; F.tile.roughnessMap = null; F.tile.bumpMap = null;
      F.tile.envMapIntensity = FL.env ?? 1.0;
      U.ldReflStr.value = LK.reflect ?? 1; U.ldReflGraze.value = LK.reflectGrazing ?? 3;
      patchFloor(F.tile);
      info.floor = `marble ${U.ldTile.value.x}×${U.ldTile.value.y} m, grout ${U.ldGrout.value * 1000} mm`;
      rep.push('floor:marble');
      // planar reflection needs to hide the floors (and their light decals) while rendering the mirrored view
      house.root.traverse((o) => { if (o.isMesh && /^floor_/.test(o.name)) hide.push(o); });
      if (house.downlights && house.downlights.pools) hide.push(house.downlights.pools);
      enabled = true;
    }
    // walls / ceiling: plaster relief only (paint colour stays STYLE.wall.color)
    const pl = sets.plaster;
    if (pl) {
      for (const [w, k] of [[M.wall, LK.wallRelief ?? 0.18], [M.facade, 0.2], [M.ceiling, LK.ceilingRelief ?? 0.05]]) {
        if (!w) continue;
        const keep = w.map; pl.apply(w, { normalScale: k / pl.normalScale, roughness: 1 }); w.map = keep; w.roughnessMap = null;
        w.roughness = w === M.ceiling ? 0.95 : 0.92; w.dithering = true;
      }
      // feature wall: limewash albedo + relief, one texture across the face (no repeats)
      const fs = sets.feature;
      scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'featureFace' || !fs) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h = b.max.y - b.min.y;
        const m = o.material;
        fs.apply(m, { uvSize: [w, h], normalScale: (LK.featureRelief ?? 0.7) / fs.normalScale });   // face-sized map, no repeats
        m.roughnessMap = null; m.roughness = fs.roughness;
        m.bumpMap = null; m.color.set(LK.featureColor || '#ffffff'); m.dithering = true;
        rep.push('feature');
      });
      // side-slot grazing light: rebake from the new plaster albedo (relief picked out by the grazing LEDs)
      try {
        const { makeGrazeTexture } = await import('./materials.js');
        for (const sl of house.sideSlots || []) {
          const g = sl.graze.geometry; g.computeBoundingBox();
          const bb = g.boundingBox, wM = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
          const img = fs && fs.map && fs.map.image; if (!img) continue;
          const cv = document.createElement('canvas'); const k = Math.min(1, 1024 / img.width);
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const old = sl.mat.map; sl.mat.map = makeGrazeTexture(cv, wM, STYLE.sideSlot); sl.mat.needsUpdate = true; if (old) old.dispose();
        }
      } catch (e) { console.warn('[look] graze rebake skipped', e && e.message); }
    }
    for (const m of [M.wall, M.ceiling]) if (m) m.dithering = true;
    // LED channel diffusers are tone-mapped like any light source (no hard clipped lines)
    if (M.slotStrip) { M.slotStrip.toneMapped = true; M.slotStrip.needsUpdate = true; }
    // furniture (cached kit materials; live — also the batched meshes)
    try {
      const fm = await import('./furniture.js');
      if (fm.setFurnitureTextures) {
        const spec = {}, det = (s) => 1 / ((s.meta && s.meta.detail) || 0.62);
        const v = sets.veneer, ln = sets.linen, rg = sets.rug, tv = sets.travert;
        if (v) spec.wood = { map: v.map, normalMap: v.normalMap, roughnessMap: v.roughnessMap, size: v.size[0], normalScale: v.normalScale, roughness: 1, colorScale: det(v) };
        if (ln) spec.fabric = { map: ln.map, normalMap: ln.normalMap, roughnessMap: ln.roughnessMap, size: ln.size[0], normalScale: ln.normalScale, roughness: 1, colorScale: det(ln) };
        if (rg && rg.meta && rg.meta.sheen !== undefined) U.ldSheen.value = rg.meta.sheen;
        if (rg) spec.rug = { map: rg.map, normalMap: rg.normalMap, roughnessMap: rg.roughnessMap, size: rg.size[0], normalScale: rg.normalScale, roughness: 0.97, colorScale: det(rg) };
        if (tv) spec.sintered = { map: tv.map, normalMap: tv.normalMap, roughnessMap: tv.roughnessMap, size: tv.size[0], normalScale: tv.normalScale, roughness: 1, color: '#ffffff' };
        const wt = sets.worktop;
        if (wt) spec.quartz = { map: wt.map, roughnessMap: wt.roughnessMap, normalMap: null, size: wt.size[0], roughness: 1, colorScale: det(wt) };
        if (sets.steel) spec.metal = { normalMap: sets.steel.normalMap, roughnessMap: sets.steel.roughnessMap, size: 0.5, normalScale: 0.2, roughness: 1.0 };
        fm.setFurnitureTextures(spec);
        info.furniture = Object.keys(spec).join('+'); rep.push('furniture:' + info.furniture);
        if (fm.furnitureMaterials) for (const m of fm.furnitureMaterials()) if (m.userData.kind === 'rug') patchGlow(m);
      }
    } catch (e) { console.warn('[look] furniture textures skipped', e && e.message); }
    return rep;
  }

  return {
    U, apply, setGlow, patchGlow,
    beforeRender: renderReflection,
    setPlanar(on) { enabled = !!on && !!U.ldMarble.value; if (!enabled) U.ldReflOn.value = 0; return enabled; },
    suspend(on) { suspended = !!on; if (suspended) U.ldReflOn.value = 0; },
    get reflectionTarget() { return rt; },
    info() { return { ...info, reflMs: +reflMs.toFixed(2), reflFrames: frames, reflOn: U.ldReflOn.value }; },
  };
}
