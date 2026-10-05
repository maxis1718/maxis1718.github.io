// furniture.js — procedural Japandi furniture for the SKG walkthrough.
// Contract (SPEC.md): makeFurniture(item, theme) → THREE.Group, origin = footprint centre on the floor,
// local front = +Z, fits inside item.w (X) × item.d (Z). One merged mesh per material (≲ 15 meshes/item).
import * as THREE from 'three';
import { Kit, mat, palette, rbox, cyl, cached, lathe, rng, setGlow, setFurnitureTextures, furnitureMaterials } from './furniture-kit.js';
import { counterContractor, fridgeFrench, washerStack, utilityTower, speaker, speakerStand, subwoofer, ziptrack } from './furniture-r4.js';

export { setGlow as setFurnitureGlow, setFurnitureTextures, furnitureMaterials };

const PI = Math.PI, HP = Math.PI / 2;

// collide flags (SPEC: false for rugs, ceiling lights, high wall-mounted items, curtains)
const NO_COLLIDE = new Set(['rug', 'pendant', 'tv', 'aircon_indoor', 'curtain', 'picture', 'towel_rail', 'shower', 'ziptrack']);
// shadow casters (big items only)
const CAST = new Set(['bed', 'sofa', 'armchair', 'dining_table', 'coffee_table', 'desk', 'wardrobe', 'tall_cabinet', 'counter',
  'fridge', 'washer_dryer', 'tv_console', 'shelving', 'bookshelf', 'dining_chair', 'outdoor_table', 'outdoor_chair', 'bench',
  'nightstand', 'side_table', 'chair', 'vanity', 'toilet', 'ac_condenser', 'speaker', 'speaker_stand', 'subwoofer']);

const DEFAULT_H = {
  bed: 1.05, nightstand: 0.5, wardrobe: 2.4, desk: 0.75, chair: 0.95, sofa: 0.8, armchair: 0.8, coffee_table: 0.38,
  tv_console: 0.4, tv: 0, rug: 0.012, dining_table: 0.75, dining_chair: 0.8, pendant: 0, plant: 1.4, floor_lamp: 1.6,
  counter: 0.9, fridge: 1.85, washer_dryer: 1.85, db_box: 0.75, toilet: 0.8, vanity: 0.86, shower: 2.2, towel_rail: 0.8,
  shelving: 2.0, outdoor_table: 0.74, outdoor_chair: 0.8, ac_condenser: 0.6, aircon_indoor: 0.3, curtain: 2.6, picture: 0,
  bookshelf: 1.8, side_table: 0.5, bench: 0.45, tall_cabinet: 2.4,
  speaker: 0.305, speaker_stand: 0.657, subwoofer: 0.256, ziptrack: 2.75,
};

// ============================================================ public API
const BUILDERS = {
  bed, nightstand, wardrobe, desk, chair, sofa, armchair, coffee_table, tv_console, tv, rug, dining_table, dining_chair,
  pendant, plant, floor_lamp, counter, fridge, washer_dryer, db_box, toilet, vanity, shower, towel_rail, shelving,
  outdoor_table, outdoor_chair, ac_condenser, aircon_indoor, curtain, picture, bookshelf, side_table, bench, tall_cabinet,
  speaker, speaker_stand: speakerStand, subwoofer, ziptrack,
};
export const FURNITURE_TYPES = Object.keys(BUILDERS);

const _warned = new Set();
const _cache = new Map(); // key → [{geometry, material, cast, receive}]

export function makeFurniture(item, theme) {
  const type = item.type;
  const o = Object.assign({}, item.opts || {}, (item.opts && item.opts.opts) || {});
  delete o.opts;
  const w = +item.w || 0.5, d = +item.d || 0.5;
  const h = item.h ?? o.h ?? DEFAULT_H[type] ?? 0.8;
  const group = new THREE.Group();
  group.name = 'furniture:' + type;
  group.userData.type = type;
  group.userData.collide = !NO_COLLIDE.has(type);
  const fn = BUILDERS[type];
  const P = palette(theme);
  const seed = type === 'plant' ? Math.abs(Math.round((item.x || 0) * 131 + (item.z || 0) * 977)) % 9973 : 0;
  const key = JSON.stringify([type, +w.toFixed(3), +d.toFixed(3), +(+h).toFixed(3), o, seed, P]);
  let parts = _cache.get(key);
  if (!parts) {
    const K = new Kit();
    let dyn = null;
    if (fn) dyn = fn(K, { w, d, h, o, P, seed, item });
    else {
      if (!_warned.has(type)) { console.warn('[furniture] unknown type "' + type + '" → placeholder box'); _warned.add(type); }
      K.box(mat('paint', '#d8d4cc'), -w / 2, w / 2, 0, item.h || 0.8, -d / 2, d / 2, 0.01, 1);
    }
    const tmp = new THREE.Group();
    K.build(tmp, CAST.has(type));
    parts = tmp.children.map(m => ({ geometry: m.geometry, material: m.material, cast: m.castShadow, receive: m.receiveShadow, amb: !!m.material.userData.ambient }));
    parts.dyn = typeof dyn === 'function' ? dyn : null;   // per-instance (animated) parts, e.g. ziptrack fabric + bar
    _cache.set(key, parts);
  }
  for (const p of parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = p.cast; m.receiveShadow = p.receive;
    if (p.amb) { m.userData.ambientGlow = true; m.castShadow = false; m.receiveShadow = false; }
    group.add(m);
  }
  if (parts.dyn) parts.dyn(group);
  return group;
}

// ============================================================ shared sub-builders
function M(P) { // material shortcuts for a palette
  return {
    oak: mat('wood', P.oak), oakPale: mat('wood', P.oakPale), walnut: mat('wood', P.walnut),
    white: mat('paint', P.white), cab: mat('paint', P.cabinet), carcass: mat('paint', P.carcass, { rough: 0.8 }),
    black: mat('black', P.black), steel: mat('metal', P.steel), chrome: mat('metal', P.chrome, { rough: 0.12 }),
    fabric: mat('fabric', P.fabric), bedding: mat('fabric', P.bedding), pillow: mat('fabric', P.pillow), throw: mat('fabric', P.throw),
    accent: mat('fabric', P.accent), accent2: mat('fabric', P.accent2),
    ceramic: mat('ceramic', P.ceramic), worktop: mat('quartz', P.worktop), stone: mat('paint', P.stone, { rough: 0.7 }),
    glass: mat('glass', P.glass), appliance: mat('gloss', P.appliance), screen: mat('gloss', P.screen, { rough: 0.12, metal: 0.4 }),
    smoked: mat('gloss', '#1b1e21', { rough: 0.06, metal: 0.3 }), mirror: mat('mirror', '#dfe5e7'),
    glow: mat('emissive', P.lampGlow, { e: P.glow }), led: mat('emissive', '#ffe9cc', { e: 0.9 * P.glow }),
  };
}

/** small horizontal bar handle on a front whose face is at zf */
function barHandle(K, m, cx, cy, zf, len, vertical = false) {
  const t = 0.011, off = 0.026;
  if (vertical) {
    K.box(m, cx - t / 2, cx + t / 2, cy - len / 2, cy + len / 2, zf + off - t, zf + off, 0.004, 1);
    for (const s of [-1, 1]) K.box(m, cx - 0.004, cx + 0.004, cy + s * (len / 2 - 0.02) - 0.004, cy + s * (len / 2 - 0.02) + 0.004, zf, zf + off - t);
  } else {
    K.box(m, cx - len / 2, cx + len / 2, cy - t / 2, cy + t / 2, zf + off - t, zf + off, 0.004, 1);
    for (const s of [-1, 1]) K.box(m, cx + s * (len / 2 - 0.02) - 0.004, cx + s * (len / 2 - 0.02) + 0.004, cy - 0.004, cy + 0.004, zf, zf + off - t);
  }
}

/** a row of fronts (doors/drawers) over [x0,x1]×[y0,y1] with front face at zf, thickness th, 3 mm gaps */
function frontsGrid(K, m, x0, x1, y0, y1, zf, cols, rows, opt = {}) {
  const g = opt.gap ?? 0.003, th = opt.th ?? 0.018;
  const cw = (x1 - x0) / cols;
  const heights = opt.rowHeights || Array(rows).fill((y1 - y0) / rows);
  let yy = y1;
  for (let r = 0; r < heights.length; r++) {
    const rh = heights[r];
    for (let c = 0; c < cols; c++) {
      const fx0 = x0 + c * cw + g / 2, fx1 = x0 + (c + 1) * cw - g / 2, fy1 = yy - g / 2, fy0 = yy - rh + g / 2;
      K.box(m, fx0, fx1, fy0, fy1, zf - th, zf, 0.0025, 1);
      if (opt.handle) {
        const hm = opt.handle;
        if (opt.drawers || heights.length > 1) barHandle(K, hm, (fx0 + fx1) / 2, fy1 - Math.min(0.05, rh / 3), zf, Math.min(0.32, (fx1 - fx0) * 0.55));
        else {
          const hx = cols === 1 ? fx1 - 0.04 : (c % 2 === 0 ? fx1 - 0.04 : fx0 + 0.04);
          const hy = opt.handleY ?? (fy1 - 0.18);
          barHandle(K, hm, hx, hy, zf, Math.min(0.3, (fy1 - fy0) * 0.4), true);
        }
      }
    }
    yy -= rh;
  }
}

function legsTapered(K, m, pts, y0, y1, rTop, rBot, seg = 12) {
  for (const [x, z] of pts) K.add(m, cyl(rTop, rBot, y1 - y0, seg), x, (y0 + y1) / 2, z);
}

// ============================================================ bedroom
function bed(K, { w, d, h, o, P }) {
  const m = M(P);
  const W = w, D = d, hbT = 0.09, H = Math.min(h, 1.2);
  const zH = -D / 2 + hbT;
  // headboard: oak back plate + channel-tufted linen cushions
  K.box(m.oak, -W / 2, W / 2, 0.1, H, -D / 2, -D / 2 + 0.03, 0.012, 2);
  const n = Math.max(3, Math.round((W - 0.08) / 0.3));
  const cw = (W - 0.08) / n;
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 + 0.04 + i * cw;
    K.box(m.fabric, x0 + 0.004, x0 + cw - 0.004, 0.36, H - 0.05, -D / 2 + 0.03, zH, 0.035, 2);
  }
  // platform: oak frame on recessed black plinth
  K.box(m.black, -W / 2 + 0.08, W / 2 - 0.08, 0, 0.1, zH + 0.08, D / 2 - 0.08);
  K.box(m.oak, -W / 2, W / 2, 0.1, 0.32, zH, D / 2, 0.015, 2);
  // mattress
  K.box(m.bedding, -W / 2 + 0.035, W / 2 - 0.035, 0.30, 0.54, zH + 0.01, D / 2 - 0.035, 0.05, 2);
  // duvet (drapes over the frame lip) + folded cuff
  const zD0 = zH + 0.40;
  K.box(m.bedding, -W / 2 + 0.006, W / 2 - 0.006, 0.36, 0.595, zD0, D / 2 - 0.006, 0.07, 3);
  K.box(m.bedding, -W / 2 + 0.01, W / 2 - 0.01, 0.57, 0.625, zD0 - 0.01, zD0 + 0.2, 0.025, 2);
  // throw across the foot
  const zt0 = D / 2 - 0.62, zt1 = D / 2 - 0.16;
  K.box(m.throw, -W / 2, W / 2, 0.35, 0.612, zt0, zt1, 0.07, 3);
  // pillows
  const np = W >= 1.3 ? 2 : 1;
  const pw = Math.min(0.74, (W - 0.12) / np - 0.03);
  for (let i = 0; i < np; i++) {
    const cx = np === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.03);
    K.boxc(m.pillow, cx, 0.66, zH + 0.17, pw, 0.15, 0.44, 0.75, 0, 0, 0.07, 3);
  }
  // decorative cushions in front
  const nc = W >= 1.3 ? 2 : 1;
  for (let i = 0; i < nc; i++) {
    const cx = nc === 1 ? 0 : (i === 0 ? -1 : 1) * 0.25;
    K.boxc(i === 0 ? m.accent2 : m.throw, cx, 0.72, zH + 0.36, 0.44, 0.42, 0.13, -0.25, (i === 0 ? 0.12 : -0.1), 0, 0.06, 2);
  }
}

function nightstand(K, { w, d, h, P }) {
  const m = M(P);
  const H = Math.min(h, 0.6), legH = 0.16, t = 0.018;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  legsTapered(K, m.black, [[x0 + 0.04, z0 + 0.04], [x1 - 0.04, z0 + 0.04], [x0 + 0.04, z1 - 0.04], [x1 - 0.04, z1 - 0.04]], 0, legH + 0.01, 0.011, 0.008, 8);
  K.box(m.oak, x0, x1, H - t, H, z0, z1, 0.006, 1);            // top
  K.box(m.oak, x0, x1, legH, legH + t, z0, z1, 0.004, 1);       // bottom
  K.box(m.oak, x0, x0 + t, legH, H - t, z0, z1, 0.003, 1);      // sides
  K.box(m.oak, x1 - t, x1, legH, H - t, z0, z1, 0.003, 1);
  K.box(m.oak, x0 + t, x1 - t, legH + t, H - t, z0, z0 + 0.01); // back
  const ym = legH + (H - legH) * 0.45;
  K.box(m.oak, x0 + t, x1 - t, ym - t / 2, ym + t / 2, z0, z1 - 0.004);
  // drawer front (upper) with recessed finger pull
  K.box(m.oakPale, x0 + t + 0.002, x1 - t - 0.002, ym + t / 2 + 0.002, H - t - 0.002, z1 - 0.02, z1 - 0.002, 0.003, 1);
  K.box(m.carcass, -0.06, 0.06, H - t - 0.03, H - t - 0.012, z1 - 0.003, z1 - 0.001);
  // table lamp: ceramic base + linen shade with warm glow
  const lx = x0 + w * 0.32, lz = -0.02;
  K.add(m.ceramic, lathe('nlbase', [[0.0, 0], [0.055, 0.0], [0.07, 0.05], [0.06, 0.13], [0.025, 0.17], [0.012, 0.18], [0, 0.18]], 20), lx, H, lz);
  K.add(m.black, cyl(0.004, 0.004, 0.08, 6), lx, H + 0.21, lz);
  K.add(mat('fabric', P.bedding, { ds: true }), cyl(0.085, 0.11, 0.15, 24, true), lx, H + 0.3, lz);
  K.add(m.glow, cyl(0.105, 0.105, 0.004, 20), lx, H + 0.23, lz);
  // book
  K.box(mat('paint', '#6f7a6a'), x1 - 0.17, x1 - 0.03, H, H + 0.025, -0.08, 0.12, 0.002, 1);
}

function wardrobe(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, plinth = 0.08;
  K.box(m.carcass, -w / 2 + 0.03, w / 2 - 0.03, 0, plinth, -d / 2, d / 2 - 0.05);
  K.box(m.carcass, -w / 2 + 0.018, w / 2 - 0.018, plinth, H - 0.018, -d / 2, d / 2 - 0.042);
  K.box(m.cab, -w / 2, -w / 2 + 0.018, 0, H, -d / 2, d / 2 - 0.022, 0.002);
  K.box(m.cab, w / 2 - 0.018, w / 2, 0, H, -d / 2, d / 2 - 0.022, 0.002);
  K.box(m.cab, -w / 2 + 0.018, w / 2 - 0.018, H - 0.018, H, -d / 2, d / 2 - 0.042);
  const n = Math.max(1, Math.round((w - 0.036) / 0.5));
  const zf = d / 2 - 0.022;
  const x0 = -w / 2 + 0.018, x1 = w / 2 - 0.018, cw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const fx0 = x0 + i * cw + 0.0015, fx1 = x0 + (i + 1) * cw - 0.0015;
    K.box(m.cab, fx0, fx1, plinth + 0.003, H - 0.021, zf - 0.02, zf, 0.0025, 1);
    // slim full-height oak pull at the meeting edge
    const right = (n === 1) || (i % 2 === 0);
    const hx = right ? fx1 - 0.03 : fx0 + 0.03;
    K.box(m.oak, hx - 0.008, hx + 0.008, 0.95, 1.35, zf, zf + 0.022, 0.005, 1);
  }
}

// ============================================================ living
function sofaCore(K, { w, d, h, P }, seats, armW) {
  const m = M(P);
  const H = Math.min(h, 0.9), W = w, D = d, legH = 0.1;
  const pts = [[-W / 2 + 0.07, -D / 2 + 0.07], [W / 2 - 0.07, -D / 2 + 0.07], [-W / 2 + 0.07, D / 2 - 0.07], [W / 2 - 0.07, D / 2 - 0.07]];
  legsTapered(K, m.oak, pts, 0, legH + 0.01, 0.022, 0.016, 10);
  K.box(m.fabric, -W / 2 + 0.01, W / 2 - 0.01, legH, 0.4, -D / 2 + 0.01, D / 2 - 0.02, 0.03, 2);    // base
  for (const s of [-1, 1]) {                                                                      // arms
    const xa = s < 0 ? -W / 2 : W / 2 - armW;
    K.box(m.fabric, xa, xa + armW, legH, 0.63, -D / 2, D / 2, 0.055, 2);
  }
  K.box(m.fabric, -W / 2 + armW - 0.02, W / 2 - armW + 0.02, 0.36, H - 0.1, -D / 2, -D / 2 + 0.17, 0.05, 2); // back frame
  const wi = W - 2 * armW, cw = wi / seats;
  for (let i = 0; i < seats; i++) {
    const x0 = -W / 2 + armW + i * cw;
    K.box(m.fabric, x0 + 0.006, x0 + cw - 0.006, 0.38, 0.56, -D / 2 + 0.17, D / 2 - 0.005, 0.06, 3);
    const t = 0.19, bh = H - 0.52, cz = -D / 2 + 0.165 + t / 2, cy = 0.53 + bh / 2;
    K.boxc(m.fabric, x0 + cw / 2, cy, cz + 0.02, cw - 0.012, bh, t, -0.16, 0, 0, 0.07, 3);
  }
  return { m, armW, H };
}
function sofa(K, a) {
  const seats = a.w > 1.55 ? 3 : a.w > 1.15 ? 2 : 1;
  const { m } = sofaCore(K, a, seats, 0.15);
  const W = a.w, D = a.d;
  // two throw cushions
  K.boxc(m.accent, -W / 2 + 0.15 + 0.24, 0.73, -D / 2 + 0.36, 0.44, 0.42, 0.13, -0.3, 0.18, 0.05, 0.06, 2);
  K.boxc(m.accent2, W / 2 - 0.15 - 0.24, 0.73, -D / 2 + 0.36, 0.44, 0.42, 0.13, -0.3, -0.15, -0.04, 0.06, 2);
}
function armchair(K, a) {
  const { m } = sofaCore(K, a, 1, Math.min(0.12, a.w * 0.15));
  K.boxc(m.accent2, 0, 0.72, -a.d / 2 + 0.36, 0.4, 0.38, 0.12, -0.3, 0.1, 0, 0.06, 2);
}

function roundedRectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** soft-edged slab with rounded plan corners; top at y=0 → spans [-t,0] */
function softSlab(w, d, t, r) {
  return cached(`slab|${w.toFixed(3)}|${d.toFixed(3)}|${t}|${r}`, () => {
    const bev = Math.min(0.006, t / 3);
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bev, d - 2 * bev, Math.max(0.002, r - bev)),
      { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(HP);          // extrusion → -Y, shape y → +Z
    g.translate(0, -bev, 0);
    return g;
  });
}

function coffee_table(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, t = 0.04;
  K.add(m.oak, softSlab(w, d, t, Math.min(0.12, d * 0.25)), 0, H, 0);
  const lx = w / 2 - 0.09, lz = d / 2 - 0.08;
  legsTapered(K, m.oak, [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]], 0, H - t + 0.002, 0.024, 0.018, 12);
  K.box(m.oak, -lx, lx, 0.1, 0.118, -lz + 0.02, lz - 0.02, 0.004, 1); // lower shelf
  // decor: two books + ceramic bowl
  K.box(mat('paint', '#e3ddd2'), -0.28, -0.04, H, H + 0.022, -0.1, 0.08, 0.002, 1);
  K.box(mat('paint', '#7d8778'), -0.26, -0.06, H + 0.022, H + 0.04, -0.08, 0.06, 0.002, 1);
  K.add(m.ceramic, lathe('bowl', [[0, 0], [0.04, 0], [0.09, 0.03], [0.11, 0.065], [0.105, 0.066], [0.085, 0.035], [0.035, 0.012], [0, 0.012]], 24), Math.min(0.2, w / 2 - 0.12), H, 0.02);
}

function side_table(K, { w, d, h, P }) {
  const m = M(P);
  const R = Math.min(w, d) / 2, H = h;
  K.add(m.oak, cyl(R, R, 0.03, 32), 0, H - 0.015, 0);
  K.add(m.oak, cyl(R * 0.92, R * 0.95, 0.008, 32), 0, H - 0.034, 0);
  K.add(m.black, cyl(0.025, 0.025, H - 0.04, 12), 0, (H - 0.04) / 2 + 0.01, 0);
  K.add(m.black, cyl(R * 0.7, R * 0.72, 0.012, 28), 0, 0.006, 0);
  K.add(m.ceramic, lathe('budvase', [[0, 0], [0.035, 0], [0.045, 0.05], [0.03, 0.12], [0.015, 0.15], [0.018, 0.16], [0, 0.16]], 16), R * 0.3, H, 0);
}

function roundedPlan(w, d, rf, rb) {
  // plan outline (x, z): front (+z) corners radius rf, back (−z) corners radius rb
  const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  s.moveTo(x0 + rb, z0); s.lineTo(x1 - rb, z0); s.quadraticCurveTo(x1, z0, x1, z0 + rb);
  s.lineTo(x1, z1 - rf); s.absarc(x1 - rf, z1 - rf, rf, 0, HP, false);
  s.lineTo(x0 + rf, z1); s.absarc(x0 + rf, z1 - rf, rf, HP, PI, false);
  s.lineTo(x0, z0 + rb); s.quadraticCurveTo(x0, z0, x0 + rb, z0);
  return s;
}
/** vertical extrusion of a plan outline, spanning y∈[y0, y1], soft bevelled edges, exact outer footprint */
function planBlock(key, w, d, rf, rb, y0, y1, bev = 0.006) {
  return cached(`pb|${key}|${w.toFixed(3)}|${d.toFixed(3)}|${rf}|${rb}|${(y1 - y0).toFixed(3)}|${bev}`, () => {
    const g = new THREE.ExtrudeGeometry(roundedPlan(w - 2 * bev, d - 2 * bev, Math.max(0.002, rf - bev), Math.max(0.001, rb - bev)),
      { depth: (y1 - y0) - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 12 });
    g.rotateX(HP);                      // shape y → +z, extrusion → −y
    g.translate(0, (y1 - y0) - bev, 0); // span [0, y1−y0]
    return g;
  }).clone().translate(0, y0, 0);
}

function tv_console(K, { w, d, h, o, P }) {
  // modern sideboard on a recessed toe-kick plinth; radiused vertical end panels; flush handleless fronts
  // with fine push-gaps; warm 2700 K LED strip under the body + soft additive floor glow (userData.ambientGlow)
  const m = M(P);
  const H = h || 0.4, kick = 0.06, setback = 0.05, rf = Math.min(0.12, d * 0.32, w / 4);
  const body = mat('wood', P.tvConsole, { rough: 0.62 }), dark = mat('paint', P.tvConsolePlinth, { rough: 0.85 });
  const gap = mat('paint', '#2b2622', { rough: 0.9 });
  K.add(body, planBlock('tvc', w, d, rf, 0.006, kick, H, 0.006));
  // recessed plinth (set back from the front and from the rounded ends)
  K.box(dark, -w / 2 + rf * 0.6, w / 2 - rf * 0.6, 0, kick, -d / 2 + 0.02, d / 2 - setback);
  // push-gaps on the flat front: 4 bays — doors outside, 2×2 drawers in the middle
  const zf = d / 2 + 0.0006, fx0 = -w / 2 + rf, fx1 = w / 2 - rf, gy0 = kick + 0.012, gy1 = H - 0.012, gw = 0.003;
  const bays = 4, bw = (fx1 - fx0) / bays;
  const vline = (x) => K.box(gap, x - gw / 2, x + gw / 2, gy0, gy1, zf - 0.002, zf);
  const hline = (a, b, y) => K.box(gap, a, b, y - gw / 2, y + gw / 2, zf - 0.002, zf);
  for (let i = 0; i <= bays; i++) vline(fx0 + i * bw);
  hline(fx0, fx1, gy1); hline(fx0, fx1, gy0);
  hline(fx0 + bw, fx1 - bw, (gy0 + gy1) / 2);
  // LED strip under the front edge of the body, just in front of the plinth
  if (o.led !== false) {
    const led = mat('emissive', P.ledWarm, { e: P.ledGlow ?? 2, amb: true });
    K.box(led, -w / 2 + rf, w / 2 - rf, kick - 0.006, kick - 0.001, d / 2 - setback + 0.004, d / 2 - setback + 0.016);
    const reach = 0.35, z0 = d / 2 - setback, gl = mat('floorglow', P.ledWarm, { opacity: 0.85 });
    const gw2 = w - 2 * rf * 0.4;
    K.add(gl, cached(`glowplane|${gw2.toFixed(3)}|${reach + setback}`, () => new THREE.PlaneGeometry(gw2, reach + setback).rotateX(-HP)), 0, 0.014, z0 + (reach + setback) / 2); // y 14 mm: clears a rug
  }
  // decor kept low and clear of the TV (bottom edge ≈ 0.62 m): ceramic vase at one end, books + bowl at the other
  if (o.decor === false) return;
  K.add(m.ceramic, lathe('lowvase', [[0, 0], [0.055, 0], [0.075, 0.05], [0.07, 0.11], [0.04, 0.16], [0.032, 0.18], [0.038, 0.19], [0, 0.19]], 20), -w / 2 + 0.2, H, -0.03);
  K.box(mat('paint', '#d9d1c4'), w / 2 - 0.42, w / 2 - 0.16, H, H + 0.028, -0.11, 0.08, 0.002, 1);
  K.box(mat('paint', '#6d675e'), w / 2 - 0.4, w / 2 - 0.19, H + 0.028, H + 0.048, -0.1, 0.06, 0.002, 1);
  K.add(mat('ceramic', '#cfc6b8', { rough: 0.6 }), lathe('bowl', [[0, 0], [0.04, 0], [0.09, 0.03], [0.11, 0.065], [0.105, 0.066], [0.085, 0.035], [0.035, 0.012], [0, 0.012]], 24), w / 2 - 0.62, H, 0.0, 0, 0, 0, 0.8, 0.8, 0.8);
}

function tv(K, { w, d, h, o, P }) {
  const cy = o.mount ?? 1.1;
  if (o.model === 'frame75' || o.model === 'frame') {
    // Samsung The Frame: flush wall mount, beige-oak picture-frame bezel, matte Art-Mode screen
    const Ht = (h && h > 0.2) ? h : w * 0.571, y0 = cy - Ht / 2, y1 = cy + Ht / 2, z0 = -d / 2, z1 = d / 2;
    const fw = 0.04, fr = mat('wood', P.tvFrame, { rough: 0.7 });
    K.box(mat('black', '#2a2b2c'), -w / 2 + 0.01, w / 2 - 0.01, y0 + 0.01, y1 - 0.01, z0, z1 - 0.006);           // panel body
    K.box(fr, -w / 2, w / 2, y1 - fw, y1, z0, z1, 0.0025, 1);
    K.box(fr, -w / 2, w / 2, y0, y0 + fw, z0, z1, 0.0025, 1);
    K.box(fr, -w / 2, -w / 2 + fw, y0 + fw, y1 - fw, z0, z1, 0.0025, 1);
    K.box(fr, w / 2 - fw, w / 2, y0 + fw, y1 - fw, z0, z1, 0.0025, 1);
    K.box(mat('black', '#1c1c1c', { rough: 0.8 }), -w / 2 + fw - 0.003, w / 2 - fw + 0.003, y0 + fw - 0.003, y1 - fw + 0.003, z1 - 0.008, z1 - 0.006); // thin black inner lip
    const sw = w - 2 * fw, sh = Ht - 2 * fw;
    K.add(mat('frameart', '#ffffff', { e: 0.05 }), cached(`plane|${sw.toFixed(4)}|${sh.toFixed(4)}`, () => new THREE.PlaneGeometry(sw, sh)), 0, cy, z1 - 0.005);
    return;
  }
  const m = M(P);
  const Ht = w * 9 / 16 + 0.02;
  const z0 = -d / 2;
  K.box(m.black, -w / 2 + 0.25, w / 2 - 0.25, cy - Ht / 2 + 0.15, cy + Ht / 2 - 0.15, z0, z0 + d - 0.012, 0.01, 1); // rear body
  K.box(mat('black', '#18191a'), -w / 2, w / 2, cy - Ht / 2, cy + Ht / 2, d / 2 - 0.012, d / 2, 0.003, 1);           // bezel
  K.box(m.screen, -w / 2 + 0.006, w / 2 - 0.006, cy - Ht / 2 + 0.006, cy + Ht / 2 - 0.006, d / 2 - 0.0115, d / 2 + 0.0002);
}

function rug(K, { w, d, P }) {
  K.box(mat('rug', P.rug), -w / 2, w / 2, 0, 0.012, -d / 2, d / 2, 0.004, 1);
}

function picture(K, { w, d, h, o, P }) {
  const m = M(P);
  const Hh = (h && h > 0.05 && h < 2) ? h : +(w * 0.7).toFixed(2), cy = o.mount ?? 1.5;
  const z0 = -d / 2, z1 = d / 2, f = 0.03;
  const fm = mat('wood', P.oak);
  K.box(fm, -w / 2, w / 2, cy + Hh / 2 - f, cy + Hh / 2, z0, z1, 0.003, 1);
  K.box(fm, -w / 2, w / 2, cy - Hh / 2, cy - Hh / 2 + f, z0, z1, 0.003, 1);
  K.box(fm, -w / 2, -w / 2 + f, cy - Hh / 2 + f, cy + Hh / 2 - f, z0, z1, 0.003, 1);
  K.box(fm, w / 2 - f, w / 2, cy - Hh / 2 + f, cy + Hh / 2 - f, z0, z1, 0.003, 1);
  K.box(mat('paint', '#fbfaf6', { rough: 0.9 }), -w / 2 + f, w / 2 - f, cy - Hh / 2 + f, cy + Hh / 2 - f, z0, z1 - 0.012);
  const mg = Math.min(w, Hh) * 0.11;
  K.box(mat('art', '#ffffff'), -w / 2 + f + mg, w / 2 - f - mg, cy - Hh / 2 + f + mg, cy + Hh / 2 - f - mg, z0, z1 - 0.011);
}

function plant(K, { w, d, h, o, P, seed }) {
  const R = Math.min(w, d) / 2;
  const r = rng(seed * 7 + 3);
  const kind = o.kind || (R >= 0.24 ? 'tree' : 'snake');
  const potH = kind === 'tree' ? Math.min(0.42, R * 1.6) : Math.min(0.36, R * 1.5);
  const pr = R * 0.8;
  K.add(mat('paint', P.pot, { rough: 0.85 }), lathe('pot' + pr.toFixed(3) + potH, [[0, 0], [pr * 0.78, 0], [pr * 0.86, 0.02], [pr, potH * 0.85], [pr, potH], [pr - 0.012, potH], [pr * 0.92, potH * 0.5], [0, potH * 0.5]], 28), 0, 0, 0);
  K.add(mat('paint', P.soil, { rough: 1 }), cyl(pr - 0.012, pr - 0.012, 0.01, 20), 0, potH - 0.03, 0);
  const lm = mat('vc', '#ffffff', { ds: true, rough: 0.7 });
  const base = new THREE.Color(P.leaf), base2 = new THREE.Color(P.leaf2);
  const leafCol = () => base.clone().lerp(base2, r()).multiplyScalar(0.85 + r() * 0.3);
  const Y = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(), qq = new THREE.Quaternion(), qy = new THREE.Quaternion();
  if (kind === 'snake') {
    // Sansevieria: upright sword leaves leaning slightly outward
    const g = cached('snakeleaf', () => {
      const s = new THREE.Shape(); s.moveTo(-0.03, 0); s.quadraticCurveTo(-0.04, 0.5, 0, 1); s.quadraticCurveTo(0.04, 0.5, 0.03, 0); s.lineTo(-0.03, 0);
      const sg = new THREE.ShapeGeometry(s, 6);
      const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -Math.abs(x) * 0.5); } // V-fold
      sg.computeVertexNormals(); return sg;
    });
    const n = 15;
    const Hmax = Math.min((h || 1.0) - potH, 0.85);
    for (let i = 0; i < n; i++) {
      const a = r() * PI * 2, rad = r() * pr * 0.5, len = Hmax * (0.5 + r() * 0.5);
      const tilt = Math.min(0.06 + r() * 0.22, Math.asin(Math.max(0, R - 0.04 - rad) / len));
      ax.set(Math.sin(a), 0, -Math.cos(a));
      qq.setFromAxisAngle(ax, tilt).multiply(qy.setFromAxisAngle(Y, r() * PI));
      const mtx = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rad, potH - 0.03, Math.sin(a) * rad), qq, new THREE.Vector3(1 + r() * 0.5, len, 1));
      K.addM(lm, g, mtx, leafCol());
    }
  } else {
    // small olive-like tree: trunk + branches + clusters of slender leaves
    const H = Math.max(1.1, Math.min(h || 1.5, 1.9));
    const bm = mat('paint', '#6b5643', { rough: 0.9 });
    const trunkTop = H * 0.6;
    const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, potH - 0.03, 0), new THREE.Vector3(0.02, potH + 0.3, 0.01), new THREE.Vector3(-0.015, trunkTop * 0.85, -0.01), new THREE.Vector3(0.01, trunkTop, 0)]);
    K.add(bm, new THREE.TubeGeometry(trunk, 10, 0.016, 6));
    const leaf = cached('olivleaf', () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.011, 0.03, 0.003, 0, 0.08, 0, -0.011, 0.03, 0.003], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g;
    });
    const clusters = 6, lim = R - 0.09;
    for (let c = 0; c < clusters; c++) {
      const a = (c / clusters) * PI * 2 + r() * 0.8;
      const cr = lim * (0.3 + r() * 0.5), cyy = trunkTop + 0.05 + r() * (H - trunkTop - 0.2);
      const cx = Math.cos(a) * cr, cz = Math.sin(a) * cr;
      const br = new THREE.CatmullRomCurve3([new THREE.Vector3(0, trunkTop * (0.8 + r() * 0.15), 0), new THREE.Vector3(cx * 0.5, (trunkTop + cyy) / 2, cz * 0.5), new THREE.Vector3(cx, cyy, cz)]);
      K.add(bm, new THREE.TubeGeometry(br, 5, 0.006, 4));
      const nl = 55, rad = 0.13;
      for (let i = 0; i < nl; i++) {
        let px, py, pz; do { px = r() * 2 - 1; py = r() * 2 - 1; pz = r() * 2 - 1; } while (px * px + py * py + pz * pz > 1);
        let x = cx + px * rad, z = cz + pz * rad; const hd = Math.hypot(x, z);
        if (hd > lim) { x *= lim / hd; z *= lim / hd; }
        const yy = Math.min(H - 0.09, cyy + py * rad * 0.9);
        K.add(lm, leaf, x, yy, z, r() * PI * 2, r() * PI * 2, r() * PI * 2, 1.1, 0.9 + r() * 0.4, 1, leafCol());
      }
    }
  }
}

function floor_lamp(K, { w, d, h, P }) {
  // tripod floor lamp: three slim oak legs, short black stem, compact linen drum shade
  const m = M(P);
  const H = Math.min(h || 1.6, 1.7), R = Math.min(w, d) / 2;
  const sr = Math.min(0.2, R - 0.005), sh = 0.24, hub = H - sh - 0.16;
  const fr = R - 0.02;
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + i * PI * 2 / 3;
    K.rod(m.oak, [Math.cos(a) * fr, 0, Math.sin(a) * fr], [Math.cos(a) * 0.018, hub, Math.sin(a) * 0.018], 0.011, 0.008, 8);
    K.add(m.black, cyl(0.012, 0.012, 0.012, 8), Math.cos(a) * fr, 0.006, Math.sin(a) * fr);
  }
  K.add(m.black, cyl(0.022, 0.026, 0.05, 12), 0, hub, 0);
  K.add(m.black, cyl(0.007, 0.007, H - sh - hub + 0.02, 8), 0, (hub + H - sh) / 2 + 0.01, 0);
  K.add(mat('fabric', P.sheer, { ds: true }), lathe('lampshade2' + sr.toFixed(3), [[sr, H - sh], [sr * 0.86, H]], 32), 0, 0, 0);
  K.add(m.black, cyl(0.004, 0.004, sr * 1.7, 6), 0, H - 0.02, 0, 0, 0, HP);
  K.add(m.glow, cyl(sr * 0.7, sr * 0.7, 0.004, 24), 0, H - sh + 0.03, 0);
}

function pendant(K, { w, d, o, P }) {
  const m = M(P);
  const ceil = o.ceiling || 2.75, drop = o.drop ?? 0.8;
  const long = Math.max(w, d), short = Math.min(w, d);
  const alongZ = d >= w;
  const n = long / short >= 2.2 ? Math.max(2, Math.min(4, Math.round(long / 0.55))) : 1;
  const span = long * 0.72;
  const sr = Math.min(short / 2 - 0.01, n > 1 ? 0.16 : 0.25);
  const shadeH = sr * 1.0;
  const shade = lathe('pdome' + sr.toFixed(3), [[sr, 0], [sr * 0.98, shadeH * 0.25], [sr * 0.85, shadeH * 0.6], [sr * 0.55, shadeH * 0.88], [sr * 0.18, shadeH], [0.012, shadeH]], 32);
  const shadeMat = mat('paint', P.white, { rough: 0.45, ds: true });
  const yTop = ceil - drop;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span / 2 + span * i / (n - 1);
    const x = alongZ ? 0 : t, z = alongZ ? t : 0;
    K.add(m.black, cyl(0.0025, 0.0025, drop, 5), x, ceil - drop / 2, z);
    K.add(shadeMat, cyl(0.045, 0.045, 0.02, 16), x, ceil - 0.01, z);
    K.add(m.oak, cyl(0.02, 0.025, 0.05, 12), x, yTop - 0.02, z);
    K.add(shadeMat, shade, x, yTop - 0.04 - shadeH, z);
    K.add(m.glow, lathe('pdiff' + sr.toFixed(3), [[0, -0.025], [sr * 0.6, -0.008], [sr * 0.93, 0]], 24), x, yTop - 0.04 - shadeH + 0.02, z);
  }
}

function curtain(K, { w, d, h, o, P }) {
  const H = o.h ?? h ?? 2.6;
  const top = H, bottom = 0.015;
  // ceiling track
  K.box(mat('paint', P.white, { rough: 0.6 }), -w / 2, w / 2, top - 0.03, top, -d / 2 + 0.01, d / 2 - 0.01, 0.004, 1);
  const folds = (len, amp, period, z, matl, x0) => {
    const segs = Math.max(8, Math.round(len / period * 8));
    const Hc = top - 0.035 - bottom;
    const key = `curt|${len.toFixed(3)}|${amp}|${period}|${Hc.toFixed(3)}`;
    const g = cached(key, () => {
      const pg = new THREE.PlaneGeometry(len, Hc, segs, 4);
      const p = pg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + len / 2, v = 0.5 - p.getY(i) / Hc;            // v: 0 top → 1 bottom
        const k = x / period * PI * 2;
        const z = (Math.sin(k) + 0.3 * Math.sin(k * 1.9 + 1.3)) / 1.3 * amp * (0.8 + 0.35 * v);
        p.setZ(i, z);
      }
      pg.computeVertexNormals(); return pg;
    });
    K.add(matl, g, x0 + len / 2, (top - 0.035 + bottom) / 2, z);
  };
  // sheer (window side, -Z) full width
  if (o.sheer !== false) folds(w - 0.02, 0.02, 0.17, -d / 2 + 0.04, mat('sheer', P.sheer, { opacity: P.sheerOpacity }), -w / 2 + 0.01);
  // drapes stacked open at both ends (room side, +Z)
  const dw = Math.min(0.42, w * 0.18);
  folds(dw, 0.032, 0.13, d / 2 - 0.042, mat('drape', P.drape), -w / 2 + 0.01);
  folds(dw, 0.032, 0.13, d / 2 - 0.042, mat('drape', P.drape), w / 2 - 0.01 - dw);
}

// ============================================================ dining
function dining_table(K, { w, d, h, o, P }) {
  // matte travertine-look sintered stone top (12 mm, knife-edge underside bevel) on a light "oak wheat" base
  const H = h || 0.75, t = 0.012;
  const alongZ = d >= w;
  const L = Math.max(w, d), S = Math.min(w, d);
  const stone = o.top === 'oak' ? mat('wood', P.oak) : mat('sintered', P.sintered, { alongU: !alongZ });
  const oak = mat('wood', o.legs === 'black' ? P.black : P.oakWheat, { rough: 0.6 });
  K.add(stone, softSlab(w, d, t, 0.025), 0, H, 0);
  // knife edge: bevelled under-panel inset from the edge so the slab reads 12 mm thin
  const ut = 0.016, k = 0.93;
  const under = cached(`knife|${w.toFixed(3)}|${d.toFixed(3)}|${k}`, () => {
    const g = new THREE.CylinderGeometry(1, k, ut, 4, 1).toNonIndexed(); g.rotateY(PI / 4); g.computeVertexNormals();
    g.scale((w - 0.05) / 2 * Math.SQRT2, 1, (d - 0.05) / 2 * Math.SQRT2); return g;   // top = (w−5cm)×(d−5cm), bevels inward
  });
  K.add(stone, under, 0, H - t - ut / 2, 0);
  // four solid tapered square legs, set in from the corners, + slim apron
  const li = L / 2 - 0.085, si = S / 2 - 0.075, top = H - t - ut;
  const legs = alongZ ? [[-si, -li], [si, -li], [-si, li], [si, li]] : [[-li, -si], [li, -si], [-li, si], [li, si]];
  for (const [x, z] of legs) K.add(oak, cached('sqleg' + top.toFixed(3), () => { const g = new THREE.CylinderGeometry(0.0225 * Math.SQRT2, 0.015 * Math.SQRT2, top, 4, 1).toNonIndexed(); g.rotateY(PI / 4); g.computeVertexNormals(); return g; }), x, top / 2, z);
  const ay0 = top - 0.06, ay1 = top, at = 0.02;
  if (alongZ) {
    for (const sx of [-1, 1]) K.box(oak, sx * si - at / 2, sx * si + at / 2, ay0, ay1, -li, li, 0.003, 1);
    for (const sz of [-1, 1]) K.box(oak, -si, si, ay0, ay1, sz * li - at / 2, sz * li + at / 2, 0.003, 1);
  } else {
    for (const sz of [-1, 1]) K.box(oak, -li, li, ay0, ay1, sz * si - at / 2, sz * si + at / 2, 0.003, 1);
    for (const sx of [-1, 1]) K.box(oak, sx * li - at / 2, sx * li + at / 2, ay0, ay1, -si, si, 0.003, 1);
  }
  // centrepiece: stoneware vase + low bowl along the table axis
  const ax = (v) => alongZ ? [0, v] : [v, 0];
  const [vx, vz] = ax(-0.16), [bx, bz] = ax(0.2);
  K.add(mat('ceramic', '#d8cfc1', { rough: 0.55 }), lathe('dvase', [[0, 0], [0.045, 0], [0.06, 0.05], [0.055, 0.14], [0.025, 0.2], [0.022, 0.22], [0, 0.22]], 18), vx, H, vz);
  K.add(mat('ceramic', '#f3f0ea'), lathe('bowl', [[0, 0], [0.04, 0], [0.09, 0.03], [0.11, 0.065], [0.105, 0.066], [0.085, 0.035], [0.035, 0.012], [0, 0.012]], 24), bx, H, bz);
}

function hoopBand(R, a, t, hgt) {
  // horizontal back hoop: arc of radius R (centre +Z of the rear point), half-angle a, section t × hgt, rounded edges
  return cached(`hoop|${R}|${a}|${t}|${hgt}`, () => {
    const s = new THREE.Shape(), N = 28, Ro = R + t / 2, Ri = R - t / 2;
    for (let i = 0; i <= N; i++) { const p = -a + 2 * a * i / N; const x = Ro * Math.sin(p), y = R - Ro * Math.cos(p); i ? s.lineTo(x, y) : s.moveTo(x, y); }
    for (let i = N; i >= 0; i--) { const p = -a + 2 * a * i / N; s.lineTo(Ri * Math.sin(p), R - Ri * Math.cos(p)); }
    const b = Math.min(0.006, t / 3);
    const g = new THREE.ExtrudeGeometry(s, { depth: hgt - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.6, bevelSegments: 2, curveSegments: 1 });
    g.rotateX(HP); g.translate(0, hgt - b, 0);   // y ∈ [0, hgt]; shape y → +z
    return g;
  });
}

function dining_chair(K, { w, d, h, o, P }) {
  // Scandinavian round-back chair: solid oak frame, curved horizontal back hoop wrapping toward the arms,
  // upholstered boucle seat (0.46 m), slim tapered legs. Front = +Z.
  const oak = mat('wood', P.oakWheat, { rough: 0.6 }), seat = mat('fabric', P.chairSeat);
  const sy = 0.46, top = Math.min(0.8, Math.max(0.74, o.back ?? 0.78));
  const hw = Math.min(w, d) / 2;
  const R = hw - 0.04, zc = -d / 2 + 0.012 + R + 0.011;   // hoop circle centre (z)
  const a = 1.95;                                         // half-angle → hoop ends wrap forward past the seat mid-line
  const band = 0.06, bt = 0.024;
  // legs: front pair straight-ish, back pair raked; all tapered round
  const fx = hw - 0.055, fz = d / 2 - 0.06, bx = hw - 0.065, bz = -d / 2 + 0.07;
  for (const s of [-1, 1]) {
    K.rod(oak, [s * (fx + 0.012), 0, fz + 0.012], [s * fx, sy - 0.05, fz], 0.0125, 0.017, 10);
    K.rod(oak, [s * (bx + 0.012), 0, bz - 0.03], [s * bx, sy - 0.05, bz], 0.0125, 0.017, 10);
  }
  // seat frame (rails) + boucle cushion
  const ry0 = sy - 0.085, ry1 = sy - 0.045;
  K.box(oak, -fx, fx, ry0, ry1, fz - 0.011, fz + 0.011, 0.004, 1);
  K.box(oak, -bx, bx, ry0, ry1, bz - 0.011, bz + 0.011, 0.004, 1);
  for (const s of [-1, 1]) K.box(oak, s * ((fx + bx) / 2) - 0.011, s * ((fx + bx) / 2) + 0.011, ry0, ry1, bz, fz, 0.004, 1);
  K.box(seat, -hw + 0.03, hw - 0.03, sy - 0.05, sy, -d / 2 + 0.07, d / 2 - 0.02, 0.025, 3);
  // low side stretchers
  for (const s of [-1, 1]) K.rod(oak, [s * (fx + 0.008), 0.17, fz + 0.006], [s * (bx + 0.008), 0.17, bz - 0.017], 0.008, 0.008, 8);
  // back hoop
  const hy0 = top - band;
  K.add(oak, hoopBand(R, a, bt, band), 0, hy0, zc - R);
  // two back posts (rise from the back legs into the hoop) + two arm posts at the hoop ends
  const post = (p, r0) => { const x = R * Math.sin(p), z = zc - R * Math.cos(p); K.rod(oak, [x * 0.97, sy - 0.05, z + 0.01], [x, hy0 + 0.01, z], r0, r0 * 0.8, 10); };
  post(0.62, 0.013); post(-0.62, 0.013);
  post(a - 0.12, 0.011); post(-(a - 0.12), 0.011);
}

function chair(K, { w, d, h, P }) { // task chair
  const m = M(P);
  const R = Math.min(w, d) / 2 - 0.03, sy = 0.47, H = h;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * PI * 2;
    K.boxc(m.black, Math.sin(a) * R / 2, 0.07, Math.cos(a) * R / 2, 0.035, 0.03, R, 0.08, a, 0, 0.008, 1);
    K.add(m.black, cyl(0.025, 0.025, 0.035, 10), Math.sin(a) * (R - 0.01), 0.025, Math.cos(a) * (R - 0.01), 0, 0, HP);
  }
  K.add(m.black, cyl(0.035, 0.035, 0.06, 12), 0, 0.09, 0);
  K.add(m.steel, cyl(0.016, 0.016, sy - 0.17, 10), 0, (sy - 0.17) / 2 + 0.11, 0);
  K.box(m.black, -0.12, 0.12, sy - 0.07, sy - 0.04, -0.12, 0.12, 0.01, 1);
  K.box(mat('fabric', P.fabricDark), -w / 2 + 0.03, w / 2 - 0.03, sy - 0.05, sy + 0.03, -d / 2 + 0.06, d / 2 - 0.02, 0.035, 3);
  K.boxc(m.black, 0, sy + 0.1, -d / 2 + 0.06, 0.06, 0.25, 0.025, -0.08, 0, 0, 0.008, 1);
  K.boxc(mat('fabric', P.fabricDark), 0, (sy + 0.18 + H) / 2, -d / 2 + 0.05, w - 0.1, H - sy - 0.2, 0.06, -0.1, 0, 0, 0.03, 3);
}

function desk(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, t = 0.03;
  K.add(m.oak, softSlab(w, d, t, 0.01), 0, H, 0);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.06);
    K.box(m.black, x - 0.015, x + 0.015, 0.0, 0.025, -d / 2 + 0.04, d / 2 - 0.04, 0.004, 1);
    K.box(m.black, x - 0.015, x + 0.015, H - t - 0.03, H - t, -d / 2 + 0.06, d / 2 - 0.06, 0.004, 1);
    K.box(m.black, x - 0.015, x + 0.015, 0.025, H - t - 0.03, -0.0125, 0.0125, 0.004, 1);
  }
  K.box(m.black, -w / 2 + 0.06, w / 2 - 0.06, H - t - 0.03, H - t - 0.005, -d / 2 + 0.06, -d / 2 + 0.08);
  // drawer under top
  K.box(m.oak, w / 2 - 0.5, w / 2 - 0.1, H - t - 0.1, H - t, -d / 2 + 0.08, d / 2 - 0.05, 0.004, 1);
  K.box(m.carcass, w / 2 - 0.36, w / 2 - 0.24, H - t - 0.035, H - t - 0.02, d / 2 - 0.051, d / 2 - 0.048);
  // closed laptop
  K.box(mat('metal', '#b9bcbf', { rough: 0.45 }), -0.17, 0.17, H, H + 0.016, -0.12, 0.12, 0.006, 1);
}

function bench(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, t = 0.035, n = 3, g = 0.012;
  const sw = (d - g * (n - 1)) / n;
  for (let i = 0; i < n; i++) { const z0 = -d / 2 + i * (sw + g); K.box(m.oak, -w / 2, w / 2, H - t, H, z0, z0 + sw, 0.006, 1); }
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.1);
    K.box(m.oak, x - 0.02, x + 0.02, 0, H - t, -d / 2 + 0.02, d / 2 - 0.02, 0.005, 1);
  }
  K.box(m.oak, -w / 2 + 0.1, w / 2 - 0.1, H - t - 0.06, H - t, -0.015, 0.015, 0.004, 1);
}

// ============================================================ storage
function books(K, x0, x1, y0, z0, z1, hmax, r) {
  const bm = mat('vc', '#ffffff', { rough: 0.75 });
  const cols = ['#e7e1d6', '#c9b79c', '#7e8a79', '#4f5458', '#b88a6a', '#d8d2c6', '#9a8f80', '#2f3337', '#aab3a7'];
  let x = x0;
  while (x < x1 - 0.03) {
    if (r() < 0.12) { x += 0.06 + r() * 0.15; continue; }
    const bw = 0.018 + r() * 0.03, bh = hmax * (0.62 + r() * 0.36), bd = (z1 - z0) * (0.75 + r() * 0.22);
    if (x + bw > x1) break;
    K.add(bm, rbox(bw, bh, bd), x + bw / 2, y0 + bh / 2, z1 - bd / 2, 0, 0, 0, 1, 1, 1, cols[(r() * cols.length) | 0]);
    x += bw + 0.002;
  }
}

function bookshelf(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, t = 0.022;
  K.box(m.oak, -w / 2, -w / 2 + t, 0, H, -d / 2, d / 2, 0.003, 1);
  K.box(m.oak, w / 2 - t, w / 2, 0, H, -d / 2, d / 2, 0.003, 1);
  K.box(m.white, -w / 2 + t, w / 2 - t, 0, H, -d / 2, -d / 2 + 0.01);
  const n = Math.max(3, Math.round(H / 0.36));
  const r = rng(Math.round(w * 1000 + H * 100));
  K.box(m.oak, -w / 2 + t, w / 2 - t, 0, 0.06, -d / 2 + 0.01, d / 2 - 0.01);
  for (let i = 0; i <= n; i++) {
    const y = 0.06 + i * (H - 0.06 - t) / n;
    K.box(m.oak, -w / 2 + t, w / 2 - t, y, y + t, -d / 2 + 0.01, d / 2, 0.002, 1);
    if (i < n) {
      const gap = (H - 0.06 - t) / n - t;
      if (i % 2 === 0) books(K, -w / 2 + t + 0.01, w / 2 - t - 0.01, y + t, -d / 2 + 0.02, d / 2 - 0.02, gap - 0.04, r);
      else { books(K, -w / 2 + t + 0.01, 0, y + t, -d / 2 + 0.02, d / 2 - 0.02, gap - 0.06, r); K.add(m.ceramic, lathe('vase', [[0, 0], [0.05, 0], [0.075, 0.06], [0.07, 0.16], [0.035, 0.24], [0.03, 0.27], [0.036, 0.28], [0, 0.28]], 16), w / 4, y + t, 0, 0, 0, 0, 0.7, 0.7, 0.7); }
    }
  }
}

function shelving(K, { w, d, h, P }) {
  const m = M(P);
  const H = h, r = rng(Math.round(w * 977 + d * 131));
  const post = 0.022;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(m.black, sx * w / 2 - (sx > 0 ? post : 0), sx * w / 2 + (sx < 0 ? post : 0), 0, H, sz * d / 2 - (sz > 0 ? post : 0), sz * d / 2 + (sz < 0 ? post : 0), 0.003, 1);
  const n = 5, basket = mat('fabric', '#b59c7c', { rough: 0.95 }), box = mat('paint', '#e9e6e0');
  for (let i = 0; i < n; i++) {
    const y = 0.12 + i * (H - 0.16) / (n - 1);
    K.box(m.oak, -w / 2 + 0.003, w / 2 - 0.003, y - 0.022, y, -d / 2 + 0.003, d / 2 - 0.003, 0.003, 1);
    if (i === n - 1) continue;
    const gapH = (H - 0.16) / (n - 1) - 0.03;
    // storage baskets / boxes
    let x = -w / 2 + 0.04;
    while (x < w / 2 - 0.25) {
      const bw = 0.24 + r() * 0.12; if (x + bw > w / 2 - 0.03) break;
      const bh = Math.min(gapH - 0.04, 0.18 + r() * 0.12);
      if (r() < 0.75) K.box(r() < 0.5 ? basket : box, x, x + bw, y, y + bh, -d / 2 + 0.03, d / 2 - 0.03, 0.012, 1);
      x += bw + 0.03 + r() * 0.05;
    }
  }
}

// ============================================================ kitchen
function counter(K, { w, d, h, o, P }) {
  if (o.style === 'contractor') return counterContractor(K, { w, d, h, o, P });
  const m = M(P);
  const W = w, D = d, H = h || 0.9;
  const island = !!o.island;
  const low = mat('wood', P.kitchenLower), up = mat('paint', P.kitchenUpper, { rough: 0.85 });
  const top = mat('quartz', P.worktop), handle = mat('black', P.kitchenHandle);
  const topT = 0.04, plinth = 0.1;
  const zf = D / 2 - 0.028;                          // door faces; slim bar handles end flush with the worktop edge
  const ov = island ? 0.025 : 0;                     // island: 25 mm quartz overhang on the dining (-Z) side
  const zb = island ? -D / 2 + ov + 0.018 : -D / 2;  // back of carcass (island: behind the finished back panel)
  const xL = -W / 2, xR = W / 2;
  const fy0 = plinth, fy1 = H - topT;
  // carcass (dark → shadow gaps), recessed plinth, oak end panels
  K.box(m.carcass, xL + 0.018, xR - 0.018, plinth, fy1, zb, zf - 0.018);
  K.box(m.carcass, xL + 0.04, xR - 0.04, 0, plinth, island ? zb + 0.04 : zb, zf - 0.07);
  K.box(low, xL, xL + 0.018, 0, fy1, island ? -D / 2 + ov : zb, zf, 0.0015, 1);
  K.box(low, xR - 0.018, xR, 0, fy1, island ? -D / 2 + ov : zb, zf, 0.0015, 1);
  if (island) K.box(low, xL + 0.018, xR - 0.018, plinth, fy1, -D / 2 + ov, zb, 0.0015, 1); // clean finished back panel
  // ---- module layout along X
  const mods = [];
  const sinkX = o.sink, hobX = o.hob;
  const special = [];
  if (sinkX !== undefined && sinkX !== null && sinkX !== false) special.push({ x0: sinkX - 0.4, x1: sinkX + 0.4, kind: 'sink' });
  if (hobX !== undefined && hobX !== null && hobX !== false) special.push({ x0: hobX - 0.4, x1: hobX + 0.4, kind: 'hob' });
  special.sort((a, b) => a.x0 - b.x0);
  const ax0 = xL + 0.018, ax1 = xR - 0.018;
  for (let i = 0; i < special.length; i++) {
    const s = special[i];
    s.x0 = Math.max(s.x0, ax0); s.x1 = Math.min(s.x1, ax1);
    if (i > 0 && s.x0 < special[i - 1].x1) { const mid = (s.x0 + special[i - 1].x1) / 2; special[i - 1].x1 = mid; s.x0 = mid; }
  }
  let cur = ax0, alt = 0;
  const fill = (a, b) => {
    const len = b - a; if (len < 0.08) { if (len > 0.005) mods.push({ x0: a, x1: b, kind: 'filler' }); return; }
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i < n; i++) mods.push({ x0: a + len * i / n, x1: a + len * (i + 1) / n, kind: (alt++ % 2 === 0) ? 'drawers' : 'door' });
  };
  for (const s of special) { fill(cur, s.x0); mods.push(s); cur = s.x1; }
  fill(cur, ax1);
  for (const md of mods) {
    if (md.kind === 'drawers' || md.kind === 'hob') {
      const hs = [0.2, 0.25]; const rest = (fy1 - fy0) - 0.45;
      frontsGrid(K, low, md.x0, md.x1, fy0, fy1, zf, 1, 3, { rowHeights: [hs[0], hs[1], rest], handle, drawers: true });
    } else if (md.kind === 'filler') {
      K.box(low, md.x0 + 0.0015, md.x1 - 0.0015, fy0 + 0.0015, fy1 - 0.0015, zf - 0.018, zf);
    } else {
      const cols = (md.x1 - md.x0) > 0.62 ? 2 : 1;
      frontsGrid(K, low, md.x0, md.x1, fy0, fy1, zf, cols, 1, { handle, handleY: fy1 - 0.2 });
    }
  }
  // ---- worktop (with undermount sink cut-out)
  const tz0 = -D / 2, tz1 = D / 2, ty0 = H - topT;
  const wtX0 = -W / 2, wtX1 = W / 2;
  const sinkW = 0.54, sinkD = 0.4;
  const sz1 = D / 2 - 0.08, sz0 = sz1 - sinkD;
  const lineZ = (sz0 + sz1) / 2;
  if (sinkX !== undefined && sinkX !== null && sinkX !== false) {
    const sx0 = sinkX - sinkW / 2, sx1 = sinkX + sinkW / 2;
    K.box(top, wtX0, sx0, ty0, H, tz0, tz1);
    K.box(top, sx1, wtX1, ty0, H, tz0, tz1);
    K.box(top, sx0, sx1, ty0, H, tz0, sz0);
    K.box(top, sx0, sx1, ty0, H, sz1, tz1);
    // bowl
    const by = ty0 - 0.2;
    K.box(m.steel, sx0, sx1, by - 0.004, by, sz0, sz1);
    K.box(m.steel, sx0, sx0 + 0.004, by, ty0, sz0, sz1); K.box(m.steel, sx1 - 0.004, sx1, by, ty0, sz0, sz1);
    K.box(m.steel, sx0, sx1, by, ty0, sz0, sz0 + 0.004); K.box(m.steel, sx0, sx1, by, ty0, sz1 - 0.004, sz1);
    K.add(m.black, cyl(0.045, 0.045, 0.003, 16), sinkX, by + 0.0015, lineZ);
    // gooseneck tap (matte black)
    const tz = sz0 - 0.055, tx = sinkX;
    K.add(m.black, cyl(0.026, 0.028, 0.03, 16), tx, H + 0.015, tz);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(0, 0.33, 0.06), new THREE.Vector3(0, 0.31, 0.16), new THREE.Vector3(0, 0.25, 0.19)]);
    K.add(m.black, cached('tapcurve', () => new THREE.TubeGeometry(curve, 20, 0.0115, 8)), tx, H, tz);
    K.boxc(m.black, tx + 0.03, H + 0.12, tz, 0.05, 0.012, 0.012, 0, 0, 0.35, 0.004, 1);
  } else {
    K.box(top, wtX0, wtX1, ty0, H, tz0, tz1, 0.002, 1);
  }
  if (island) {
    // fruit bowl
    K.add(m.oak, lathe('bowl', [[0, 0], [0.04, 0], [0.09, 0.03], [0.11, 0.065], [0.105, 0.066], [0.085, 0.035], [0.035, 0.012], [0, 0.012]], 24), W * 0.18, H, 0);
  }
  // ---- hob
  if (hobX !== undefined && hobX !== null && hobX !== false) {
    const hw = 0.59, hd = Math.min(0.52, D - 0.1), hz = island ? 0 : Math.min(lineZ, D / 2 - 0.05 - hd / 2);
    K.box(m.smoked, hobX - hw / 2, hobX + hw / 2, H, H + 0.006, hz - hd / 2, hz + hd / 2, 0.003, 1);
    const ringM = mat('paint', '#8a8a8a', { rough: 0.5 });
    const zones = [[-0.15, -0.11, 0.095], [0.15, -0.11, 0.085], [-0.15, 0.1, 0.08], [0.15, 0.1, 0.095]];
    for (const [ox, oz, rr] of zones) {
      K.add(ringM, cached('ring' + rr, () => new THREE.RingGeometry(rr - 0.003, rr, 40, 1)), hobX + ox, H + 0.0065, hz + oz, -HP, 0, 0);
      K.add(ringM, cached('ring' + (rr * 0.55).toFixed(3), () => new THREE.RingGeometry(rr * 0.55 - 0.002, rr * 0.55, 32, 1)), hobX + ox, H + 0.0065, hz + oz, -HP, 0, 0);
    }
    for (let i = 0; i < 6; i++) K.add(ringM, cached('dot', () => new THREE.CircleGeometry(0.006, 10)), hobX - 0.09 + i * 0.036, H + 0.0065, hz + hd / 2 - 0.03, -HP, 0, 0);
  }
  if (island) return;
  // ---- backsplash
  const uy0 = 1.45, uy1 = 2.2;
  K.box(top, -W / 2, W / 2, H, o.upper ? uy0 : H + 0.12, -D / 2, -D / 2 + 0.012);
  // ---- upper cabinets + slim hood
  const Du = 0.35, zuf = -D / 2 + Du;
  const hoodOn = !!o.hood && hobX !== undefined && hobX !== null && hobX !== false;
  if (o.upper) {
    K.box(m.carcass, -W / 2 + 0.018, W / 2 - 0.018, uy0 + 0.018, uy1 - 0.018, -D / 2, zuf - 0.018);
    K.box(up, -W / 2, -W / 2 + 0.018, uy0, uy1, -D / 2, zuf); K.box(up, W / 2 - 0.018, W / 2, uy0, uy1, -D / 2, zuf);
    K.box(up, -W / 2 + 0.018, W / 2 - 0.018, uy1 - 0.018, uy1, -D / 2, zuf - 0.018);
    const segs = [];
    if (hoodOn) {
      const h0 = Math.max(-W / 2 + 0.018, hobX - 0.3), h1 = Math.min(W / 2 - 0.018, hobX + 0.3);
      segs.push([-W / 2 + 0.018, h0, uy0], [h0, h1, uy0 + 0.1], [h1, W / 2 - 0.018, uy0]);
    } else segs.push([-W / 2 + 0.018, W / 2 - 0.018, uy0]);
    for (const [a, b, y0] of segs) {
      if (b - a < 0.05) continue;
      K.box(up, a, b, y0, y0 + 0.018, -D / 2, zuf - 0.018); // bottom panel
      const n = Math.max(1, Math.round((b - a) / 0.5));
      frontsGrid(K, up, a, b, y0, uy1 - 0.018, zuf, n, 1, {});
      if (y0 === uy0) K.box(m.led, a + 0.02, b - 0.02, uy0 - 0.003, uy0, zuf - 0.07, zuf - 0.05);
    }
    if (hoodOn) {
      K.box(m.steel, hobX - 0.3, hobX + 0.3, uy0, uy0 + 0.1, -D / 2, zuf + 0.03, 0.004, 1);
      K.box(mat('paint', '#3a3c3e', { rough: 0.6 }), hobX - 0.27, hobX + 0.27, uy0 - 0.002, uy0, -D / 2 + 0.03, zuf);
      K.box(m.led, hobX - 0.2, hobX + 0.2, uy0 - 0.003, uy0 - 0.001, zuf - 0.02, zuf - 0.005);
    }
  } else if (hoodOn) {
    K.box(m.steel, hobX - 0.3, hobX + 0.3, 1.5, 1.58, -D / 2, -D / 2 + 0.48, 0.004, 1);
    K.box(m.steel, hobX - 0.13, hobX + 0.13, 1.58, 2.4, -D / 2, -D / 2 + 0.24, 0.004, 1);
  }
}

function tall_cabinet(K, { w, d, h, o, P }) {
  if (o.style === 'utility') return utilityTower(K, { w, d, h, P });
  const m = M(P);
  const cab = mat('paint', P.kitchenUpper, { rough: 0.85 }), hdl = mat('black', P.kitchenHandle);
  const H = h, plinth = 0.1, zf = d / 2 - 0.027;
  K.box(m.carcass, -w / 2 + 0.03, w / 2 - 0.03, 0, plinth, -d / 2, zf - 0.07);
  K.box(m.carcass, -w / 2 + 0.018, w / 2 - 0.018, plinth, H - 0.018, -d / 2 + 0.012, zf - 0.018);
  K.box(cab, -w / 2 + 0.018, w / 2 - 0.018, 0, H - 0.018, -d / 2, -d / 2 + 0.012);   // finished back (may be seen from the dining room)
  K.box(cab, -w / 2, -w / 2 + 0.018, 0, H, -d / 2, zf); K.box(cab, w / 2 - 0.018, w / 2, 0, H, -d / 2, zf);
  K.box(cab, -w / 2 + 0.018, w / 2 - 0.018, H - 0.018, H, -d / 2, zf - 0.018);
  const x0 = -w / 2 + 0.018, x1 = w / 2 - 0.018;
  // two drawers
  frontsGrid(K, cab, x0, x1, plinth, 0.78, zf, 1, 2, { handle: hdl, drawers: true });
  // appliances: oven + combi-steam, 600 wide, filler strips each side
  const aw = Math.min(0.597, x1 - x0 - 0.01), ax0 = -aw / 2, ax1 = aw / 2;
  if (ax0 - x0 > 0.01) { K.box(cab, x0 + 0.0015, ax0 - 0.002, 0.78, 1.83, zf - 0.018, zf); K.box(cab, ax1 + 0.002, x1 - 0.0015, 0.78, 1.83, zf - 0.018, zf); }
  const app = (y0, y1) => {
    K.box(m.smoked, ax0, ax1, y0 + 0.002, y1 - 0.002, zf - 0.025, zf, 0.004, 1);                      // black glass front
    K.box(m.steel, ax0, ax1, y1 - 0.075, y1 - 0.002, zf - 0.024, zf + 0.001, 0.003, 1);                 // control strip
    K.box(m.led, -0.04, 0.04, y1 - 0.05, y1 - 0.03, zf + 0.0012, zf + 0.0016);                          // display
    for (const s of [-1, 1]) K.add(m.black, cyl(0.014, 0.014, 0.012, 16), s * 0.2, y1 - 0.04, zf + 0.006, HP, 0, 0);
    barHandle(K, m.steel, 0, y1 - 0.11, zf, aw - 0.12);
    K.box(mat('gloss', '#2a2d30', { rough: 0.02, metal: 0.6 }), ax0 + 0.07, ax1 - 0.07, y0 + 0.07, y1 - 0.16, zf + 0.0002, zf + 0.001);
  };
  app(0.785, 1.385);
  app(1.39, 1.83);
  frontsGrid(K, cab, x0, x1, 1.83, H - 0.018, zf, 1, 1, { handle: hdl, handleY: 1.83 + 0.12 });
}

function fridge(K, { w, d, h, o, P }) {
  if (o.model === 'french') return fridgeFrench(K, { w, d, h, o, P });
  const m = M(P);
  const H = h, zf = d / 2 - 0.027, dt = 0.055;
  K.box(m.steel, -w / 2, w / 2, 0.03, H, -d / 2, zf - dt - 0.004, 0.01, 1);
  K.box(m.black, -w / 2 + 0.03, w / 2 - 0.03, 0, 0.04, -d / 2 + 0.02, zf - 0.03);
  const split = H * 0.40;
  K.box(m.steel, -w / 2, w / 2, 0.035, split - 0.004, zf - dt, zf, 0.012, 2);
  K.box(m.steel, -w / 2, w / 2, split + 0.004, H, zf - dt, zf, 0.012, 2);
  K.box(m.carcass, -w / 2 + 0.005, w / 2 - 0.005, split - 0.004, split + 0.004, zf - dt - 0.004, zf - 0.01);
  // handles: full-height bar on upper door, horizontal on freezer drawer
  barHandle(K, mat('metal', P.steel, { rough: 0.2 }), -w / 2 + 0.06, split + (H - split) / 2, zf, (H - split) * 0.6, true);
  barHandle(K, mat('metal', P.steel, { rough: 0.2 }), 0, split - 0.07, zf, w * 0.6);
  K.box(m.smoked, w / 2 - 0.16, w / 2 - 0.06, H - 0.3, H - 0.18, zf, zf + 0.002, 0.0008, 1); // display
  K.box(m.led, w / 2 - 0.14, w / 2 - 0.08, H - 0.26, H - 0.24, zf + 0.002, zf + 0.0025);
}

function washerUnit(K, m, w, d, y0, uh, kind) {
  const zf = d / 2 - 0.01;
  K.box(m.appliance, -w / 2, w / 2, y0, y0 + uh, -d / 2, zf - 0.01, 0.015, 2);
  K.box(m.appliance, -w / 2 + 0.005, w / 2 - 0.005, y0 + 0.004, y0 + uh - 0.12, zf - 0.012, zf - 0.002, 0.008, 1);   // front panel
  K.box(mat('gloss', '#e4e4e2'), -w / 2 + 0.005, w / 2 - 0.005, y0 + uh - 0.115, y0 + uh - 0.005, zf - 0.012, zf - 0.001, 0.006, 1); // control panel
  K.box(mat('gloss', '#d7d7d5'), -w / 2 + 0.03, -w / 2 + 0.2, y0 + uh - 0.1, y0 + uh - 0.02, zf - 0.0015, zf, 0.003, 1);         // detergent drawer
  K.add(m.chrome, cyl(0.028, 0.028, 0.02, 24), 0.03, y0 + uh - 0.06, zf, HP, 0, 0);                                                // dial
  K.box(m.smoked, 0.1, 0.24, y0 + uh - 0.08, y0 + uh - 0.04, zf - 0.001, zf + 0.0005);                                              // display
  const cy = y0 + (uh - 0.12) * 0.5 + 0.01, R = Math.min(0.2, w * 0.3);
  K.add(m.chrome, cached('porthole' + R.toFixed(3), () => new THREE.TorusGeometry(R, 0.022, 8, 36)), 0, cy, zf - 0.002, 0, 0, 0, 1, 1, 0.5);
  K.add(mat('gloss', '#33383d', { rough: 0.04, metal: 0.3 }), cyl(R - 0.01, R - 0.01, 0.006, 36), 0, cy, zf - 0.001, HP, 0, 0);
  K.add(mat('paint', '#55595e', { rough: 0.5 }), cached('drumring' + R.toFixed(3), () => new THREE.RingGeometry(R * 0.62, R * 0.86, 32, 1)), 0, cy, zf + 0.0025);
  K.box(m.chrome, R * 0.82, R * 0.82 + 0.03, cy - 0.04, cy + 0.04, zf - 0.006, zf + 0.004, 0.004, 1);
}
function washer_dryer(K, { w, d, h, o, P }) {
  if (o.stacked || o.housing) return washerStack(K, { w, d, h, o, P });
  const m = M(P);
  if (h > 1.3) {
    const uh = (h - 0.03) / 2;
    washerUnit(K, m, w, d, 0, uh, 'washer');
    K.box(m.carcass, -w / 2 + 0.01, w / 2 - 0.01, uh, uh + 0.03, -d / 2, d / 2 - 0.03);
    washerUnit(K, m, w, d, uh + 0.03, uh, 'dryer');
  } else washerUnit(K, m, w, d, 0, h, 'washer');
}

// ============================================================ utility
function db_box(K, { w, d, h, o, P }) {
  const H = h, cy = o.mount ?? 1.2, y0 = cy - H / 2, y1 = cy + H / 2;
  const body = mat('paint', '#e2e1dc', { rough: 0.5, metal: 0.2 });
  K.box(body, -w / 2, w / 2, y0, y1, -d / 2, d / 2 - 0.012, 0.008, 1);
  K.box(body, -w / 2 + 0.01, w / 2 - 0.01, y0 + 0.01, y1 - 0.01, d / 2 - 0.014, d / 2, 0.004, 1);
  const dark = mat('paint', '#5d5f60');
  K.add(dark, cyl(0.012, 0.012, 0.012, 12), w / 2 - 0.05, cy, d / 2, HP, 0, 0);
  for (let i = 0; i < 6; i++) K.box(dark, -w / 2 + 0.12, w / 2 - 0.12, y0 + 0.05 + i * 0.016, y0 + 0.056 + i * 0.016, d / 2 - 0.0005, d / 2 + 0.0002);
  K.box(mat('paint', '#ffffff'), -0.08, 0.08, y1 - 0.12, y1 - 0.07, d / 2, d / 2 + 0.0005);
  K.box(mat('paint', '#d4442e'), -0.075, -0.045, y1 - 0.115, y1 - 0.075, d / 2 + 0.0005, d / 2 + 0.001);
}

function ac_condenser(K, { w, d, h, P }) {
  const body = mat('paint', '#ecebe6', { rough: 0.45, metal: 0.1 }), dark = mat('paint', '#2b2d2f', { rough: 0.7 });
  const H = h, y0 = 0.05;
  K.box(mat('black', '#4a4c4e'), -w / 2 + 0.06, -w / 2 + 0.1, 0, y0, -d / 2, d / 2);
  K.box(mat('black', '#4a4c4e'), w / 2 - 0.1, w / 2 - 0.06, 0, y0, -d / 2, d / 2);
  K.box(body, -w / 2, w / 2, y0, H, -d / 2, d / 2 - 0.002, 0.012, 1);
  const R = Math.min((H - y0) / 2 - 0.04, w * 0.3), cx = -w / 2 + 0.04 + R + 0.02, cy = y0 + (H - y0) / 2;
  K.add(dark, cyl(R, R, 0.006, 32), cx, cy, d / 2 - 0.001, HP, 0, 0);
  for (let i = 1; i <= 5; i++) K.add(body, cached('acring' + i + R.toFixed(3), () => new THREE.RingGeometry(R * i / 5.4 - 0.004, R * i / 5.4, 36, 1)), cx, cy, d / 2 + 0.0025);
  K.box(body, cx - R, cx + R, cy - 0.005, cy + 0.005, d / 2 + 0.001, d / 2 + 0.003);
  K.box(body, cx - 0.005, cx + 0.005, cy - R, cy + R, d / 2 + 0.001, d / 2 + 0.003);
  K.add(mat('paint', '#4c5054'), cyl(0.04, 0.04, 0.01, 16), cx, cy, d / 2 + 0.004, HP, 0, 0);
  // service panel louvres on the right
  for (let i = 0; i < 8; i++) K.box(mat('paint', '#d4d3ce'), cx + R + 0.06, w / 2 - 0.04, y0 + 0.06 + i * 0.03, y0 + 0.072 + i * 0.03, d / 2 - 0.002, d / 2);
}

function aircon_indoor(K, { w, d, h, o, P }) {
  const H = h || 0.3, cy = o.mount ?? 2.3, y0 = cy - H / 2, y1 = cy + H / 2;
  const body = mat('gloss', '#f5f5f3', { rough: 0.3 }), dark = mat('paint', '#3a3c3e', { rough: 0.7 });
  K.box(body, -w / 2, w / 2, y0 + 0.05, y1, -d / 2, d / 2, 0.05, 3);
  K.box(body, -w / 2 + 0.01, w / 2 - 0.01, y0, y0 + 0.08, -d / 2, d / 2 - 0.06, 0.03, 2);
  K.box(dark, -w / 2 + 0.06, w / 2 - 0.06, y0 + 0.02, y0 + 0.07, d / 2 - 0.08, d / 2 - 0.035);          // outlet
  K.boxc(body, 0, y0 + 0.045, d / 2 - 0.03, w - 0.14, 0.006, 0.06, 0.6, 0, 0, 0.002, 1);                    // flap
  K.box(mat('paint', '#e3e3e1'), -w / 2 + 0.02, w / 2 - 0.02, y1 - 0.11, y1 - 0.105, d / 2 - 0.001, d / 2); // panel seam
  K.box(m_led(P), w / 2 - 0.12, w / 2 - 0.1, y0 + 0.1, y0 + 0.11, d / 2 - 0.0005, d / 2 + 0.0003);
  for (let i = 0; i < 5; i++) K.box(dark, -w / 2 + 0.05, w / 2 - 0.05, y1 - 0.0005, y1 + 0.0002, -d / 2 + 0.03 + i * 0.03, -d / 2 + 0.04 + i * 0.03);
}
function m_led(P) { return mat('emissive', '#bfe6ff', { e: 0.8 }); }

function towel_rail(K, { w, d, h, o, P }) {
  const H = h, cy = o.mount ?? 1.2, y0 = cy - H / 2, y1 = cy + H / 2;
  const tm = mat('black', P.black, { rough: 0.4 });
  const zr = -d / 2 + 0.045;
  for (const s of [-1, 1]) {
    K.add(tm, cyl(0.012, 0.012, H, 10), s * (w / 2 - 0.015), cy, zr);
    for (const yy of [y0 + 0.08, y1 - 0.08]) K.add(tm, cyl(0.008, 0.008, 0.04, 8), s * (w / 2 - 0.015), yy, -d / 2 + 0.02, HP, 0, 0);
  }
  const nb = Math.max(3, Math.round(H / 0.12));
  for (let i = 0; i < nb; i++) K.add(tm, cyl(0.008, 0.008, w - 0.03, 8), 0, y0 + 0.04 + i * (H - 0.08) / (nb - 1), zr, 0, 0, HP);
  // folded towel over the upper bars
  const towel = mat('fabric', '#ece6dc');
  const ty = y1 - 0.04 - (H - 0.08) / (nb - 1);
  K.box(towel, -w / 2 + 0.06, w / 2 - 0.06, ty - 0.38, ty + 0.012, zr + 0.009, zr + 0.025, 0.006, 1);
  K.box(towel, -w / 2 + 0.06, w / 2 - 0.06, ty - 0.3, ty + 0.012, zr - 0.025, zr - 0.009, 0.006, 1);
  K.box(towel, -w / 2 + 0.06, w / 2 - 0.06, ty + 0.002, ty + 0.018, zr - 0.025, zr + 0.025, 0.007, 1);
}

// ============================================================ bathroom
function toilet(K, { w, d, h, P }) {
  const m = M(P);
  const R = Math.min(w / 2 - 0.005, 0.19);
  const sz = Math.min(1.4, (d - 0.15) / (2 * R));
  const bowlD = 2 * R * sz, bz = d / 2 - bowlD / 2;
  const bowl = lathe('toiletbowl' + R.toFixed(3), [[0, 0], [R * 0.7, 0], [R * 0.72, 0.012], [R * 0.74, 0.1], [R * 0.8, 0.21], [R * 0.92, 0.31], [R * 0.99, 0.375], [R, 0.395], [R * 0.9, 0.4], [0, 0.4]], 28);
  K.add(m.ceramic, bowl, 0, 0, bz, 0, 0, 0, 1, 1, sz);
  // seat + lid (closed)
  K.add(mat('ceramic', P.ceramic, { rough: 0.25 }), cyl(R * 0.99, R, 0.018, 28), 0, 0.409, bz + 0.005, 0, 0, 0, 1, 1, sz * 0.99);
  K.add(m.ceramic, cyl(R * 0.94, R * 0.98, 0.022, 28), 0, 0.429, bz + 0.01, 0, 0, 0, 1, 1, sz * 0.97);
  // cistern
  const cz0 = -d / 2, cz1 = bz - bowlD / 2 + 0.06;
  const cd = Math.max(0.12, cz1 - cz0);
  K.box(m.ceramic, -Math.min(w / 2, 0.19), Math.min(w / 2, 0.19), 0.38, Math.min(h, 0.82), cz0, cz0 + cd, 0.025, 2);
  K.box(m.ceramic, -0.12, 0.12, 0.2, 0.4, cz0, cz0 + 0.08, 0.02, 1);
  K.add(m.chrome, cyl(0.022, 0.022, 0.008, 20), 0, Math.min(h, 0.82) + 0.004, cz0 + cd / 2);
  K.box(m.chrome, -0.03, 0.03, 0.437, 0.447, cz1 - 0.035, cz1 - 0.015, 0.003, 1); // hinge
}

function vesselBasin(K, m, rx, rz, x, y, z) {
  const b = lathe('vessel', [[0, 0], [0.55, 0], [0.82, 0.018], [0.96, 0.07], [1, 0.125], [0.97, 0.132], [0.92, 0.124], [0.82, 0.07], [0.55, 0.04], [0, 0.035]], 32);
  K.add(m.ceramic, b, x, y, z, 0, 0, 0, rx, 1, rz);
  K.add(m.chrome, cyl(0.02, 0.02, 0.004, 16), x, y + 0.037, z);
}
function basinTap(K, m, x, y, z, reach) {
  K.add(m.black, cyl(0.016, 0.018, 0.2, 14), x, y + 0.1, z);
  K.add(m.black, cyl(0.011, 0.011, reach, 10), x, y + 0.19, z + reach / 2, HP, 0, 0);
  K.boxc(m.black, x, y + 0.215, z - 0.01, 0.012, 0.04, 0.012, -0.5, 0, 0, 0.004, 1);
}
function vanity(K, { w, d, h, o, P }) {
  const m = M(P);
  if (o.small) {
    // compact wall-hung basin + round mirror
    const bh = 0.84;
    K.box(m.ceramic, -w / 2, w / 2, bh - 0.04, bh, -d / 2, -d / 2 + 0.05, 0.01, 1);
    vesselBasin(K, m, w / 2 - 0.005, (d - 0.05) / 2, 0, bh - 0.16, -d / 2 + 0.05 + (d - 0.05) / 2);
    K.add(m.chrome, cyl(0.016, 0.016, 0.2, 12), 0, bh - 0.28, -d / 2 + 0.12);
    K.add(m.chrome, cyl(0.012, 0.012, 0.1, 10), 0, bh - 0.36, -d / 2 + 0.07, HP, 0, 0);
    K.add(m.black, cyl(0.011, 0.011, 0.11, 10), 0, bh + 0.08, -d / 2 + 0.055, HP, 0, 0);
    K.add(m.black, cyl(0.025, 0.025, 0.012, 16), 0, bh + 0.08, -d / 2 + 0.006, HP, 0, 0);
    const mr = Math.min(0.22, w / 2);
    K.add(m.black, cyl(mr, mr, 0.02, 40), 0, 1.45, -d / 2 + 0.01, HP, 0, 0);
    K.add(m.mirror, cyl(mr - 0.008, mr - 0.008, 0.004, 40), 0, 1.45, -d / 2 + 0.021, HP, 0, 0);
    return;
  }
  const nb = Math.max(1, Math.min(2, o.basins || 1));
  const top = 0.86, cab0 = 0.38, tt = 0.02;
  K.box(m.worktop, -w / 2, w / 2, top - tt, top, -d / 2, d / 2, 0.003, 1);
  K.box(m.carcass, -w / 2 + 0.01, w / 2 - 0.01, cab0, top - tt, -d / 2, d / 2 - 0.035);
  const nf = Math.max(1, Math.round(w / 0.5));
  K.box(m.oak, -w / 2, -w / 2 + 0.018, cab0, top - tt, -d / 2, d / 2 - 0.015, 0.002, 1);
  K.box(m.oak, w / 2 - 0.018, w / 2, cab0, top - tt, -d / 2, d / 2 - 0.015, 0.002, 1);
  K.box(m.oak, -w / 2 + 0.018, w / 2 - 0.018, cab0, cab0 + 0.018, -d / 2, d / 2 - 0.035);
  frontsGrid(K, m.oak, -w / 2 + 0.018, w / 2 - 0.018, cab0, top - tt, d / 2 - 0.015, nf, 1, { th: 0.02 });
  // finger-pull shadow line under the top
  K.box(m.carcass, -w / 2 + 0.01, w / 2 - 0.01, top - tt - 0.025, top - tt, d / 2 - 0.04, d / 2 - 0.016);
  const rz = Math.min(0.2, (d - 0.14) / 2), rx = Math.min(0.24, rz * 1.35, w / (2 * nb) - 0.04);
  const cz = d / 2 - 0.03 - rz;
  for (let i = 0; i < nb; i++) {
    const x = nb === 1 ? 0 : (i === 0 ? -1 : 1) * w / 4;
    vesselBasin(K, m, rx, rz, x, top, cz);
    basinTap(K, m, x, top, cz - rz - 0.035, Math.min(0.15, rz + 0.02));
  }
  // mirror cabinet
  const mw = Math.min(w - 0.02, nb === 2 ? w - 0.1 : Math.max(0.6, Math.min(1.2, w * 0.7))), my0 = 1.12, my1 = 1.85, md = 0.13;
  K.box(m.white, -mw / 2, mw / 2, my0, my1, -d / 2, -d / 2 + md - 0.012, 0.004, 1);
  const nd = Math.max(1, Math.round(mw / 0.4));
  for (let i = 0; i < nd; i++) {
    const a = -mw / 2 + mw * i / nd + 0.0015, b = -mw / 2 + mw * (i + 1) / nd - 0.0015;
    K.box(m.mirror, a, b, my0 + 0.002, my1 - 0.002, -d / 2 + md - 0.012, -d / 2 + md, 0.002, 1);
  }
  K.box(m.led, -mw / 2 + 0.02, mw / 2 - 0.02, my0 - 0.002, my0, -d / 2 + 0.03, -d / 2 + md - 0.03);
  // soap dispenser
  K.add(m.ceramic, cyl(0.03, 0.032, 0.14, 16), -w / 2 + 0.1, top + 0.07, -d / 2 + 0.08);
}

function shower(K, { w, d, h, o, P }) {
  const m = M(P);
  const sides = o.glassSides || ['front'];
  const H = Math.min(h, 2.2), tray = 0.035, gH = 2.0;
  K.box(mat('paint', '#ecebe7', { rough: 0.35 }), -w / 2, w / 2, 0, tray, -d / 2, d / 2, 0.006, 1);
  K.box(m.steel, -w / 2 + 0.08, w / 2 - 0.08, tray, tray + 0.002, -d / 2 + 0.06, -d / 2 + 0.11);
  K.box(mat('paint', '#3a3c3e'), -w / 2 + 0.085, w / 2 - 0.085, tray + 0.002, tray + 0.0025, -d / 2 + 0.065, -d / 2 + 0.105);
  const gt = 0.008, ch = mat('black', P.black);
  const gy0 = tray + 0.005, gy1 = gH;
  const panel = (x0, x1, z0, z1) => K.box(m.glass, x0, x1, gy0, gy1, z0, z1, 0.002, 1);
  if (sides.includes('front')) {
    const z0 = d / 2 - 0.03 - gt, z1 = d / 2 - 0.03;
    const split = -w / 2 + w * 0.45;
    panel(-w / 2 + 0.006, split - 0.003, z0, z1);
    panel(split + 0.003, w / 2 - 0.006, z0, z1);
    K.box(ch, -w / 2, -w / 2 + 0.012, gy0, gy1, z0 - 0.006, z1 + 0.006);
    K.box(ch, w / 2 - 0.012, w / 2, gy0, gy1, z0 - 0.006, z1 + 0.006);
    for (const y of [0.3, 1.7]) K.box(ch, split - 0.03, split + 0.03, y - 0.04, y + 0.04, z0 - 0.006, z1 + 0.006, 0.004, 1);  // hinges
    // door pull (both sides of the glass)
    const hx = w / 2 - 0.09;
    K.box(ch, hx - 0.009, hx + 0.009, 0.85, 1.25, z1 + 0.025, z1 + 0.04, 0.005, 1);
    K.box(ch, hx - 0.009, hx + 0.009, 0.85, 1.25, z0 - 0.04, z0 - 0.025, 0.005, 1);
    for (const y of [0.9, 1.2]) K.box(ch, hx - 0.005, hx + 0.005, y - 0.005, y + 0.005, z0 - 0.03, z1 + 0.03);
  }
  if (sides.includes('left')) panel(-w / 2, -w / 2 + gt, -d / 2 + 0.01, d / 2 - 0.03 - gt);
  if (sides.includes('right')) panel(w / 2 - gt, w / 2, -d / 2 + 0.01, d / 2 - 0.03 - gt);
  if (sides.includes('back')) panel(-w / 2 + 0.01, w / 2 - 0.01, -d / 2, -d / 2 + gt);
  // rain head on wall arm
  const rz = Math.min(-d / 2 + 0.35, 0), ry = Math.min(H - 0.02, 2.15);
  K.box(ch, -0.012, 0.012, ry + 0.01, ry + 0.032, -d / 2, rz, 0.005, 1);
  K.box(ch, -0.13, 0.13, ry - 0.004, ry + 0.008, rz - 0.13, rz + 0.13, 0.004, 1);
  K.box(mat('paint', '#4a4c4e', { rough: 0.7 }), -0.11, 0.11, ry - 0.0045, ry - 0.0035, rz - 0.11, rz + 0.11);
  // thermostatic mixer + slide rail + hand shower on the back wall
  const mx = -Math.min(0.18, w / 2 - 0.12);
  K.add(ch, cyl(0.06, 0.06, 0.012, 24), mx, 1.05, -d / 2 + 0.006, HP, 0, 0);
  K.add(ch, cyl(0.018, 0.018, 0.05, 12), mx, 1.05, -d / 2 + 0.035, HP, 0, 0);
  K.boxc(ch, mx + 0.04, 1.05, -d / 2 + 0.06, 0.09, 0.014, 0.014, 0, 0, 0, 0.005, 1);
  const rx = Math.min(0.2, w / 2 - 0.08);
  K.add(ch, cyl(0.011, 0.011, 0.75, 10), rx, 1.5, -d / 2 + 0.035);
  for (const y of [1.13, 1.87]) K.add(ch, cyl(0.009, 0.009, 0.035, 8), rx, y, -d / 2 + 0.017, HP, 0, 0);
  K.add(ch, cyl(0.016, 0.012, 0.22, 12), rx, 1.62, -d / 2 + 0.07, -0.25, 0, 0);
  K.add(ch, cyl(0.032, 0.032, 0.02, 16), rx, 1.73, -d / 2 + 0.1, -0.25 + HP * 0.9, 0, 0);
  // niche bottles on the tray corner
  K.add(m.ceramic, cyl(0.03, 0.03, 0.2, 14), w / 2 - 0.08, tray + 0.1, -d / 2 + 0.16);
  K.add(mat('paint', '#a49784', { rough: 0.4 }), cyl(0.028, 0.028, 0.17, 14), w / 2 - 0.15, tray + 0.085, -d / 2 + 0.16);
}

// ============================================================ outdoor
function outdoor_table(K, { w, d, h, P }) {
  const teak = mat('wood', P.teak), alu = mat('black', P.alu, { rough: 0.6 });
  const H = h, n = 7, g = 0.008, t = 0.025;
  K.box(alu, -w / 2, w / 2, H - t - 0.03, H - t, -d / 2, -d / 2 + 0.03, 0.004, 1);
  K.box(alu, -w / 2, w / 2, H - t - 0.03, H - t, d / 2 - 0.03, d / 2, 0.004, 1);
  K.box(alu, -w / 2, -w / 2 + 0.03, H - t - 0.03, H - t, -d / 2, d / 2, 0.004, 1);
  K.box(alu, w / 2 - 0.03, w / 2, H - t - 0.03, H - t, -d / 2, d / 2, 0.004, 1);
  const sw = (d - 0.06 - g * (n - 1)) / n;
  for (let i = 0; i < n; i++) { const z0 = -d / 2 + 0.03 + i * (sw + g); K.box(teak, -w / 2 + 0.03, w / 2 - 0.03, H - t, H, z0, z0 + sw, 0.004, 1); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(alu, sx * (w / 2 - 0.02) - 0.02, sx * (w / 2 - 0.02) + 0.02, 0, H - t - 0.03, sz * (d / 2 - 0.02) - 0.02, sz * (d / 2 - 0.02) + 0.02, 0.006, 1);
  K.add(mat('ceramic', '#d8d2c8'), lathe('budvase', [[0, 0], [0.035, 0], [0.045, 0.05], [0.03, 0.12], [0.015, 0.15], [0.018, 0.16], [0, 0.16]], 16), 0, H, 0);
}
function outdoor_chair(K, { w, d, h, P }) {
  const teak = mat('wood', P.teak), alu = mat('black', P.alu, { rough: 0.6 });
  const H = h, sy = 0.42, fx = w / 2 - 0.03;
  // side frames: front leg, back leg (raked), arm rest, base runner
  for (const s of [-1, 1]) {
    const x = s * fx;
    K.box(alu, x - 0.018, x + 0.018, 0, 0.64, d / 2 - 0.06, d / 2 - 0.025, 0.006, 1);
    K.boxc(alu, x, H / 2 - 0.004, -d / 2 + 0.085, 0.036, H - 0.01, 0.035, -0.16, 0, 0, 0.006, 1);
    K.box(teak, x - 0.03, x + 0.03, 0.64, 0.665, -d / 2 + 0.06, d / 2, 0.008, 1);
    K.box(alu, x - 0.018, x + 0.018, sy - 0.05, sy - 0.02, -d / 2 + 0.05, d / 2 - 0.04, 0.005, 1);
  }
  // seat slats
  const n = 5, sw = (d - 0.16) / n;
  for (let i = 0; i < n; i++) { const z0 = -d / 2 + 0.1 + i * sw; K.box(teak, -fx + 0.02, fx - 0.02, sy - 0.02, sy, z0 + 0.004, z0 + sw - 0.004, 0.004, 1); }
  // back slats
  for (let i = 0; i < 4; i++) K.boxc(teak, 0, sy + 0.1 + i * 0.08, -d / 2 + 0.085 - (sy + 0.1 + i * 0.08 - H / 2) * 0.16 + 0.03, w - 0.1, 0.06, 0.018, -0.16, 0, 0, 0.004, 1);
  // seat cushion
  K.box(mat('fabric', P.outdoorFabric), -fx + 0.025, fx - 0.025, sy, sy + 0.06, -d / 2 + 0.1, d / 2 - 0.03, 0.025, 2);
}

/**
 * Optional helper for the engine: merge many placed furniture groups (world transforms applied) into one mesh per
 * shared material — all furniture uses a small module-wide material set, so the whole house collapses to ~25 draw calls.
 * Pass only static items (not ones you animate). Returns a THREE.Group; the source groups are left untouched.
 */
export async function mergeFurnitureStatic(groups) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const byMat = new Map();
  for (const g of groups) {
    g.updateMatrixWorld(true);
    g.traverse(m => {
      if (!m.isMesh) return;
      let e = byMat.get(m.material); if (!e) { e = { geos: [], cast: false }; byMat.set(m.material, e); }
      e.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); e.cast = e.cast || m.castShadow;
    });
  }
  const out = new THREE.Group(); out.name = 'furniture:merged';
  for (const [material, e] of byMat) {
    const geo = mergeGeometries(e.geos, false); e.geos.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = e.cast; mesh.receiveShadow = !material.transparent;
    out.add(mesh);
  }
  return out;
}
