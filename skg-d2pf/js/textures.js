// textures.js — photographic PBR texture sets (CC0, see assets/textures/CREDITS.md) for the walkthrough.
//
//   const sets = await loadTextureSets(renderer, { mobile });       // → { oak, decking, tile, stone, travertine, limewash,
//                                                                     //     linen, boucle, steel, frosted }
//   sets.oak = { map, normalMap, roughnessMap, size:[u,v] (metres one texture covers), repeat(uM,vM) → Vector2,
//                normalScale, roughness, metalness, gray, apply(material, { metres }) }
//
// UV convention: the engine's floors / walls use UVs in METRES, so `repeat = 1 / size` (set by default). For a
// surface with 0..1 UVs, call set.apply(mat, { uvSize: [w, h] }) with the surface size in metres.
// Albedo maps are sRGB; normal / roughness maps are linear (NoColorSpace). `gray` sets are neutral grey detail maps
// meant to be multiplied by the material colour (limewash, linen, boucle, steel).
import * as THREE from 'three';

const SETS = {
  oak: ['albedo', 'normal', 'rough'],
  decking: ['albedo', 'normal', 'rough'],
  tile: ['albedo', 'normal', 'rough'],
  stone: ['albedo', 'normal', 'rough'],
  travertine: ['albedo', 'normal', 'rough'],
  limewash: ['albedo', 'normal', 'rough'],
  linen: ['albedo', 'normal'],
  boucle: ['albedo', 'normal'],
  steel: ['albedo', 'normal', 'rough'],
  frosted: ['normal', 'rough'],
  // look-dev sets (tools/lookdev-textures.py): WebP, desktop 2048 / mobile 1024
  marble: ['albedo', 'normal', 'rough', 'webp'],
  veneer: ['albedo', 'normal', 'rough', 'webp'],
  travert: ['albedo', 'normal', 'rough', 'webp'],
  plaster: ['normal', 'webp'],                  // wall / ceiling relief only
  feature: ['albedo', 'normal', 'webp'],        // limewash feature wall, one map per face (3.23 × 2.75 m)
  oakfloor: ['albedo', 'normal', 'rough', 'webp'],
  worktop: ['albedo', 'rough', 'webp'],
  bathwall: ['albedo', 'normal', 'rough', 'webp'],
  bathfloor: ['albedo', 'normal', 'rough', 'webp'],
  linen: ['albedo', 'normal', 'rough', 'webp'],
  rug: ['albedo', 'normal', 'webp'],
};

export async function loadTextureSets(renderer, { mobile = false, base = './assets/textures/', only = null, skip = [] } = {}) {
  const meta = await fetch(base + 'meta.json').then((r) => r.json());
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(mobile ? 8 : 16, renderer.capabilities.getMaxAnisotropy());
  const load = (file, srgb) => new Promise((res) => {
    loader.load(base + file, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      res(t);
    }, undefined, () => { console.warn('[tex] missing', file); res(null); });
  });
  const out = {};
  await Promise.all(Object.entries(SETS).filter(([k]) => (!only || only.includes(k)) && !skip.includes(k)).map(async ([name, maps]) => {
    const m = meta[name] || {};
    const ext = maps.includes('webp') ? 'webp' : 'jpg';
    const [map, normalMap, roughnessMap] = await Promise.all([
      maps.includes('albedo') ? load(`${name}_albedo.${ext}`, true) : null,
      maps.includes('normal') ? load(`${name}_normal.${ext}`, false) : null,
      maps.includes('rough') ? load(`${name}_rough.${ext}`, false) : null,
    ]);
    const size = m.size || [1, 1];
    const set = {
      name, map, normalMap, roughnessMap, size,
      normalScale: m.normalScale ?? 1, roughness: m.roughness ?? 1, metalness: m.metalness ?? 0, gray: !!m.gray, source: m.source, meta: m,
      textures: [map, normalMap, roughnessMap].filter(Boolean),
      setRepeat(u, v) { for (const t of this.textures) t.repeat.set(u, v); return this; },
      /** Patch an existing MeshStandardMaterial. opts.uvSize = [w,h] metres covered by the surface's 0..1 UVs (else UVs are metres).
       *  opts.keepColor keeps material.color (default: white for colour sets, kept for grey detail sets). */
      apply(mat, opts = {}) {
        const rep = opts.uvSize ? [opts.uvSize[0] / size[0], opts.uvSize[1] / size[1]] : [1 / size[0], 1 / size[1]];
        const tex = (t) => { if (!t) return null; const c = opts.share ? t : t.clone(); c.repeat.set(rep[0] * (opts.scale || 1), rep[1] * (opts.scale || 1)); if (opts.rotate) { c.rotation = opts.rotate; } c.needsUpdate = true; return c; };
        if (map) { mat.map = tex(map); if (!this.gray && !opts.keepColor) mat.color.set('#ffffff'); }
        if (normalMap) { mat.normalMap = tex(normalMap); const k = (opts.normalScale ?? 1) * this.normalScale; mat.normalScale = new THREE.Vector2(k, k); }
        if (roughnessMap) { mat.roughnessMap = tex(roughnessMap); mat.roughness = opts.roughness ?? this.roughness; }
        if (opts.metalness !== undefined) mat.metalness = opts.metalness;
        else if (this.metalness) mat.metalness = this.metalness;
        if (mat.bumpMap && normalMap && opts.dropBump !== false) mat.bumpMap = null;
        mat.needsUpdate = true;
        return mat;
      },
    };
    set.setRepeat(1 / size[0], 1 / size[1]);
    out[name] = set;
  }));
  return out;
}

// ── optional helper used by tools/realism-test.html: put the sets on the engine's existing materials ───────────────
// Returns a report of what was patched. Non-destructive for geometry; only material maps / colours change.
export function applyTextureSets({ sets, M, STYLE, scene, furniture = null }) {
  const rep = [];
  const F = M && M.floor;
  if (F) {
    if (F.wood && sets.oak) { sets.oak.apply(F.wood); rep.push('floor.wood ← oak'); }
    if (F.tile && sets.tile) { sets.tile.apply(F.tile); rep.push('floor.tile ← tile'); }
    if (F.lobby && sets.tile) { sets.tile.apply(F.lobby, { keepColor: true }); rep.push('floor.lobby ← tile'); }
    if (F.decking && sets.decking) { sets.decking.apply(F.decking); rep.push('floor.decking ← decking'); }
  }
  if (M && M.wall && sets.limewash) {      // very subtle plaster relief on all walls (colour stays STYLE.wall.color)
    const w = M.wall; const keepMap = w.map;
    sets.limewash.apply(w, { normalScale: 0.25, roughness: 1 }); w.map = keepMap; rep.push('wall ← limewash normal');
  }
  // feature (wabi-sabi) wall faces: limewash albedo + relief, sized by the face geometry
  scene.traverse((o) => {
    if (!o.isMesh || o.name !== 'featureFace' || !sets.limewash) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h = b.max.y - b.min.y;
    const m = o.material;
    sets.limewash.apply(m, { uvSize: [w, h], normalScale: 1.0 });
    m.bumpMap = null; m.color.set(STYLE && STYLE.featureWall ? STYLE.featureWall.color : '#e9e5df');
    rep.push(`featureFace ${w.toFixed(2)}×${h.toFixed(2)} ← limewash`);
  });
  // furniture: retexture by material heuristics (kit materials are shared per colour → patch once)
  if (furniture) {
    const seen = new Set();
    furniture.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seen.has(m) || !m.isMeshStandardMaterial) continue; seen.add(m);
        const hex = '#' + m.color.getHexString();
        const kind = classify(m, STYLE);
        if (kind === 'fabric' && sets.linen) { sets.linen.apply(m, { scale: 1, normalScale: 0.8, keepColor: true }); rep.push(`fabric ${hex} ← linen`); }
        else if (kind === 'steel' && sets.steel) { sets.steel.apply(m, { keepColor: true }); rep.push(`metal ${hex} ← steel`); }
        else if (kind === 'stone' && sets.stone) { sets.stone.apply(m); rep.push(`worktop ${hex} ← stone`); }
        else if (kind === 'sintered' && sets.travertine) { sets.travertine.apply(m); rep.push(`table ${hex} ← travertine`); }
      }
    });
  }
  return rep;
}
function classify(m, STYLE) {
  const P = (STYLE && STYLE.furniture) || {};
  const hex = '#' + m.color.getHexString();
  const near = (a) => a && new THREE.Color(a).getHex() === m.color.getHex();
  if (m.metalness >= 0.9 && m.roughness < 0.5 && m.roughness > 0.15) return 'steel';
  if (m.roughness >= 0.9 && m.metalness === 0 && !m.transparent && (near(P.fabric) || near(P.fabricDark) || near(P.outdoorFabric))) return 'fabric';
  if (m.roughness < 0.3 && (near(P.worktop) || near(P.stone))) return 'stone';
  if (m.roughness > 0.8 && m.map && m.envMapIntensity === 0.6 && hex) return 'sintered';
  return null;
}
