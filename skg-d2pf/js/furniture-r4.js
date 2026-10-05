// furniture-r4.js — round-4 builders: contractor kitchen, appliance housings, utility tower, KEF AV set, ziptrack blinds.
// Same conventions as furniture.js: local front = +Z, origin = footprint centre on the floor, fits w (X) × d (Z).
import * as THREE from 'three';
import { mat, rbox, cyl, cached, lathe } from './furniture-kit.js';

const PI = Math.PI, HP = Math.PI / 2;
const has = (v) => v !== undefined && v !== null && v !== false;

// ------------------------------------------------------------------ shared kitchen bits
function kitMats(P) {
  return {
    front: mat('paint', P.kcLower, { rough: 0.85 }),
    prof: mat('black', P.kcProfile, { rough: 0.45 }),          // anodised black aluminium
    up: mat('paint', P.kcUpper, { rough: 0.85 }),
    hous: mat('paint', P.kcHousing, { rough: 0.85 }),
    gap: mat('paint', '#141414', { rough: 0.85 }),              // shadow volume behind fronts
    plinth: mat('paint', P.kcPlinth, { rough: 0.85 }),
    top: mat('quartz', P.kcWorktop),
    edge: mat('paint', P.kcProfile, { rough: 0.55 }),
    steel: mat('metal', P.steel),
    steelDark: mat('metal', '#55585b', { rough: 0.32 }),
    black: mat('black', P.black),
    glass: mat('gloss', P.ovenGlass, { rough: 0.05, metal: 0.3 }),
    iron: mat('black', '#171717', { rough: 0.75 }),
    led: mat('emissive', '#fff1dd', { e: 0.9 * (P.glow ?? 1) }),
    digits: mat('emissive', '#ffffff', { e: 0.7 }),
    white: mat('gloss', P.appliance, { rough: 0.3 }),
  };
}

/** flat handleless front with thin black aluminium edge profile (top band + side edges), face at zf */
function profFront(K, M, x0, x1, y0, y1, zf, th = 0.018, band = 0.008, panel = M.front) {
  const g = 0.003, a = x0 + g / 2, b = x1 - g / 2, c0 = y0 + g / 2, c1 = y1 - g / 2;
  if (b - a < 0.01 || c1 - c0 < 0.02) return;
  K.box(panel, a + 0.0025, b - 0.0025, c0, c1 - band, zf - th, zf);
  K.box(M.prof, a, b, c1 - band, c1, zf - th, zf + 0.0006);
  K.box(M.prof, a, a + 0.0025, c0, c1 - band, zf - th, zf);
  K.box(M.prof, b - 0.0025, b, c0, c1 - band, zf - th, zf);
}
/** flat handleless (push-to-open) front, no profile */
function flatFront(K, panel, x0, x1, y0, y1, zf, th = 0.018) {
  const g = 0.003;
  K.box(panel, x0 + g / 2, x1 - g / 2, y0 + g / 2, y1 - g / 2, zf - th, zf);
}
function frontsRow(K, panel, x0, x1, y0, y1, zf, n) {
  for (let i = 0; i < n; i++) flatFront(K, panel, x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n, y0, y1, zf);
}

/** stone slab [x0,x1]×[y0,y1]×[z0,z1] with optional undermount sink cut-out {sx0,sx1,sz0,sz1} */
function slab(K, m, x0, x1, y0, y1, z0, z1, cut) {
  if (!cut) { K.box(m, x0, x1, y0, y1, z0, z1, 0.0015, 1); return; }
  K.box(m, x0, cut.sx0, y0, y1, z0, z1, 0.0015, 1);
  K.box(m, cut.sx1, x1, y0, y1, z0, z1, 0.0015, 1);
  K.box(m, cut.sx0, cut.sx1, y0, y1, z0, cut.sz0, 0.0015, 1);
  K.box(m, cut.sx0, cut.sx1, y0, y1, cut.sz1, z1, 0.0015, 1);
}

function sinkAndTap(K, M, sinkX, H, ty0, sz0, sz1, sinkW) {
  const sx0 = sinkX - sinkW / 2, sx1 = sinkX + sinkW / 2, by = ty0 - 0.2, t = 0.0015;
  K.box(M.steel, sx0, sx1, by - 0.004, by, sz0, sz1);
  K.box(M.steel, sx0, sx0 + t, by, ty0, sz0, sz1); K.box(M.steel, sx1 - t, sx1, by, ty0, sz0, sz1);
  K.box(M.steel, sx0, sx1, by, ty0, sz0, sz0 + t); K.box(M.steel, sx0, sx1, by, ty0, sz1 - t, sz1);
  K.add(M.black, cyl(0.042, 0.042, 0.003, 18), sinkX, by + 0.0015, (sz0 + sz1) / 2);
  // matte black gooseneck tap behind the bowl
  const tz = sz0 - 0.05;
  K.add(M.black, cyl(0.026, 0.028, 0.03, 16), sinkX, H + 0.015, tz);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(0, 0.33, 0.06), new THREE.Vector3(0, 0.31, 0.16), new THREE.Vector3(0, 0.25, 0.19)]);
  K.add(M.black, cached('tapcurve', () => new THREE.TubeGeometry(curve, 20, 0.0115, 8)), sinkX, H, tz);
  K.boxc(M.black, sinkX + 0.03, H + 0.12, tz, 0.05, 0.012, 0.012, 0, 0, 0.35, 0.004, 1);
}

/** black-glass gas hob, 5 burners (2 + wok + 2), cast-iron trivets, knobs at the front right */
function gasHob(K, M, cx, y, cz, hw, hd) {
  K.box(M.glass, cx - hw / 2, cx + hw / 2, y, y + 0.006, cz - hd / 2, cz + hd / 2, 0.003, 1);
  const top = y + 0.006, sx = hw / 2 - 0.13;
  const burners = [[-sx, -0.1, 1], [-sx, 0.08, 0.8], [0, -0.02, 1.45], [sx, -0.1, 0.8], [sx, 0.08, 1]];
  const bGeo = lathe('gasburner', [[0, 0], [0.05, 0], [0.05, 0.008], [0.042, 0.012], [0.042, 0.018], [0.034, 0.022], [0.02, 0.026], [0, 0.026]], 20);
  const capGeo = lathe('gascap', [[0, 0], [0.03, 0], [0.03, 0.006], [0.022, 0.011], [0, 0.012]], 16);
  for (const [bx, bz, s] of burners) {
    K.add(M.steelDark, bGeo, cx + bx, top, cz + bz, 0, 0, 0, s, 1, s);
    K.add(M.iron, capGeo, cx + bx, top + 0.026, cz + bz, 0, 0, 0, s, 1, s);
    if (s > 1.2) K.add(M.iron, capGeo, cx + bx, top + 0.032, cz + bz, 0, 0, 0, 0.55, 1, 0.55);
  }
  // trivets: three cast-iron grids sitting on rubber feet, fingers pointing at each burner
  const ty = top + 0.03, tb = 0.009, th = 0.011;
  const grid = (x0, x1, z0, z1, centres) => {
    K.box(M.iron, x0, x1, ty, ty + th, z0, z0 + tb); K.box(M.iron, x0, x1, ty, ty + th, z1 - tb, z1);
    K.box(M.iron, x0, x0 + tb, ty, ty + th, z0, z1); K.box(M.iron, x1 - tb, x1, ty, ty + th, z0, z1);
    for (const [px, pz] of [[x0, z0], [x1 - tb, z0], [x0, z1 - tb], [x1 - tb, z1 - tb]]) K.box(M.iron, px, px + tb, top, ty, pz, pz + tb);
    for (const [bx, bz, s] of centres) {
      const r0 = 0.045 * s, ex = cx + bx, ez = cz + bz;
      K.box(M.iron, ex - 0.0045, ex + 0.0045, ty, ty + th, z0 + tb, ez - r0);       // to back rail
      K.box(M.iron, ex - 0.0045, ex + 0.0045, ty, ty + th, ez + r0, z1 - tb);       // to front rail
      K.box(M.iron, Math.max(x0 + tb, ex - 0.13), ex - r0, ty, ty + th, ez - 0.0045, ez + 0.0045);
      K.box(M.iron, ex + r0, Math.min(x1 - tb, ex + 0.13), ty, ty + th, ez - 0.0045, ez + 0.0045);
    }
  };
  const z0 = cz - hd / 2 + 0.03, z1 = cz + hd / 2 - 0.075;
  grid(cx - hw / 2 + 0.025, cx - 0.115, z0, z1, burners.slice(0, 2));
  grid(cx - 0.105, cx + 0.105, z0, z1, burners.slice(2, 3));
  grid(cx + 0.115, cx + hw / 2 - 0.025, z0, z1, burners.slice(3));
  // control knobs along the front edge (right half)
  for (let i = 0; i < 5; i++) {
    const kx = cx + 0.04 + i * 0.075, kz = cz + hd / 2 - 0.038;
    K.add(M.steelDark, cyl(0.022, 0.024, 0.006, 20), kx, top + 0.003, kz);
    K.add(M.black, cyl(0.019, 0.02, 0.022, 20), kx, top + 0.017, kz);
    K.box(M.steel, kx - 0.002, kx + 0.002, top + 0.028, top + 0.0285, kz - 0.016, kz - 0.006);
  }
}

/** built-in black-glass oven front in [x0,x1]×[y0,y1], face at zf */
function ovenFront(K, M, x0, x1, y0, y1, zf) {
  const a = x0 + 0.002, b = x1 - 0.002;
  K.box(M.glass, a, b, y0, y1, zf - 0.022, zf);
  const cy = y1 - 0.05;
  K.box(M.digits, (a + b) / 2 - 0.035, (a + b) / 2 + 0.035, cy - 0.009, cy + 0.009, zf, zf + 0.0006);           // display
  for (let i = 0; i < 6; i++) K.box(M.digits, a + 0.05 + i * 0.03, a + 0.062 + i * 0.03, cy - 0.004, cy + 0.004, zf, zf + 0.0006); // touch icons
  K.box(M.steelDark, a, b, y1 - 0.1, y1 - 0.098, zf, zf + 0.0006);                                               // trim line
  // handle bar (black), stand-offs
  const hy = y1 - 0.125;
  K.box(M.black, a + 0.04, b - 0.04, hy - 0.007, hy + 0.007, zf + 0.008, zf + 0.018, 0.004, 1);
  for (const s of [a + 0.06, b - 0.06]) K.box(M.black, s - 0.006, s + 0.006, hy - 0.006, hy + 0.006, zf, zf + 0.008);
  // inner window (slightly glossier, inset frame)
  K.box(mat('gloss', '#08090a', { rough: 0.05, metal: 0.3 }), a + 0.06, b - 0.06, y0 + 0.07, hy - 0.04, zf, zf + 0.0005);
}
/** integrated black/stainless dishwasher front */
function dishwasherFront(K, M, x0, x1, y0, y1, zf) {
  const a = x0 + 0.002, b = x1 - 0.002;
  K.box(mat('metal', '#3d4043', { rough: 0.38 }), a, b, y0 + 0.002, y1 - 0.06, zf - 0.02, zf, 0.003, 1);
  K.box(M.glass, a, b, y1 - 0.058, y1 - 0.002, zf - 0.02, zf, 0.003, 1);
  K.box(M.digits, (a + b) / 2 - 0.02, (a + b) / 2 + 0.02, y1 - 0.034, y1 - 0.026, zf, zf + 0.0006);
  const hy = y1 - 0.1;
  K.box(M.steel, a + 0.05, b - 0.05, hy - 0.007, hy + 0.007, zf + 0.008, zf + 0.018, 0.004, 1);
  for (const s of [a + 0.07, b - 0.07]) K.box(M.steel, s - 0.006, s + 0.006, hy - 0.006, hy + 0.006, zf, zf + 0.008);
}

// ------------------------------------------------------------------ contractor kitchen (south run + island)
export function counterContractor(K, { w, d, h, o, P }) {
  const M = kitMats(P);
  const W = w, D = d, H = h || 0.9, island = !!o.island;
  const topT = 0.02, plinth = 0.1, ceil = o.ceiling || 2.75;
  const zf = D / 2 - 0.02;                                   // door faces → 20 mm worktop overhang
  const backOv = island ? 0.025 : 0;                         // island: 25 mm overhang on the dining side
  const zb = -D / 2 + backOv + (island ? 0.018 : 0);         // back of the carcass
  const fy0 = plinth, fy1 = H - topT;
  // carcass shadow volume + recessed kick
  K.box(M.gap, -W / 2 + 0.018, W / 2 - 0.018, plinth, fy1, zb, zf - 0.018);
  K.box(M.plinth, -W / 2 + 0.02, W / 2 - 0.02, 0, plinth - 0.002, island ? zb + 0.06 : zb, zf - 0.07);
  // finished end panels (warm white, black front edge)
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -W / 2 : W / 2 - 0.018;
    K.box(M.front, x0, x0 + 0.018, 0, fy1, -D / 2 + backOv, zf - 0.003);
    K.box(M.prof, x0, x0 + 0.018, 0, fy1, zf - 0.003, zf);
  }
  if (island) {   // clean finished back panel on the dining side
    K.box(M.front, -W / 2 + 0.018, W / 2 - 0.018, 0, fy1, -D / 2 + backOv, zb);
    K.box(M.prof, -W / 2 + 0.018, W / 2 - 0.018, 0, 0.004, -D / 2 + backOv - 0.0005, zb);
  }
  // ---- module layout along X: appliances keep 600 mm, sink / hob bays flex
  const ax0 = -W / 2 + 0.018, ax1 = W / 2 - 0.018;
  const fixed = [], flex = [];
  if (has(o.oven)) fixed.push({ c: o.oven, w: 0.6, kind: 'oven' });
  if (has(o.dishwasher)) fixed.push({ c: o.dishwasher, w: 0.6, kind: 'dw' });
  if (has(o.sink)) flex.push({ c: o.sink, w: 0.8, kind: 'sink' });
  if (has(o.hob) && !has(o.oven)) flex.push({ c: o.hob, w: 0.9, kind: 'drawers' });
  for (const f of fixed) { f.x0 = Math.max(ax0, f.c - f.w / 2); f.x1 = Math.min(ax1, f.x0 + f.w); }
  for (const f of flex) {
    f.x0 = Math.max(ax0, f.c - f.w / 2); f.x1 = Math.min(ax1, f.c + f.w / 2);
    for (const g of fixed) if (f.x0 < g.x1 && f.x1 > g.x0) { if (g.c < f.c) f.x0 = g.x1; else f.x1 = g.x0; }
  }
  const spec = [...fixed, ...flex].filter(s => s.x1 - s.x0 > 0.05).sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < spec.length; i++) if (spec[i].x0 < spec[i - 1].x1) { const mid = (spec[i].x0 + spec[i - 1].x1) / 2; spec[i - 1].x1 = mid; spec[i].x0 = mid; }
  const mods = []; let cur = ax0, alt = 0;
  const fill = (a, b) => {
    const len = b - a; if (len < 0.1) { if (len > 0.004) mods.push({ x0: a, x1: b, kind: 'filler' }); return; }
    const n = Math.max(1, Math.round(len / 0.55));
    for (let i = 0; i < n; i++) mods.push({ x0: a + len * i / n, x1: a + len * (i + 1) / n, kind: (alt++ % 2 === 0) ? 'drawers' : 'door' });
  };
  for (const s of spec) { fill(cur, s.x0); mods.push(s); cur = s.x1; }
  fill(cur, ax1);
  for (const md of mods) {
    const { x0, x1 } = md;
    if (md.kind === 'drawers') {
      const r1 = fy1 - 0.18, r2 = r1 - 0.27;
      profFront(K, M, x0, x1, r1, fy1, zf); profFront(K, M, x0, x1, r2, r1, zf); profFront(K, M, x0, x1, fy0, r2, zf);
    } else if (md.kind === 'oven') {
      const oy1 = fy1 - 0.012, oy0 = oy1 - 0.595;
      K.box(M.prof, x0, x1, oy1, fy1, zf - 0.02, zf);                    // black trim under the worktop
      ovenFront(K, M, x0, x1, oy0, oy1, zf);
      profFront(K, M, x0, x1, fy0, oy0, zf);                             // drawer under the oven
    } else if (md.kind === 'dw') {
      dishwasherFront(K, M, x0, x1, fy0, fy1 - 0.004, zf);
    } else if (md.kind === 'filler') {
      K.box(M.front, x0 + 0.0015, x1 - 0.0015, fy0 + 0.0015, fy1 - 0.0015, zf - 0.018, zf);
    } else {
      const n = (x1 - x0) > 0.62 ? 2 : 1;
      for (let i = 0; i < n; i++) profFront(K, M, x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n, fy0, fy1, zf);
    }
  }
  // ---- worktop: white sintered stone, 20 mm, thin dark edge line along the bottom of the visible edges
  const ty0 = H - topT, sinkW = 0.54, sinkD = 0.4;
  const sz1 = D / 2 - 0.085, sz0 = sz1 - sinkD;
  const cut = has(o.sink) ? { sx0: o.sink - sinkW / 2, sx1: o.sink + sinkW / 2, sz0, sz1 } : null;
  slab(K, M.top, -W / 2, W / 2, ty0 + 0.003, H, -D / 2, D / 2 - 0.001, cut);
  K.box(M.edge, -W / 2, W / 2, ty0, ty0 + 0.003, D / 2 - 0.012, D / 2 - 0.001);           // dark edge line (front)
  if (island) {
    K.box(M.edge, -W / 2, W / 2, ty0, ty0 + 0.003, -D / 2, -D / 2 + 0.012);
    for (const s of [-1, 1]) K.box(M.edge, s < 0 ? -W / 2 : W / 2 - 0.012, s < 0 ? -W / 2 + 0.012 : W / 2, ty0, ty0 + 0.003, -D / 2 + 0.012, D / 2 - 0.012);
  } else {
    K.box(M.edge, -W / 2, -W / 2 + 0.012, ty0, ty0 + 0.003, -D / 2, D / 2 - 0.012);
    K.box(M.edge, W / 2 - 0.012, W / 2, ty0, ty0 + 0.003, -D / 2, D / 2 - 0.012);
  }
  K.box(M.gap, -W / 2 + 0.012, W / 2 - 0.012, ty0, ty0 + 0.003, island ? -D / 2 + 0.012 : -D / 2, D / 2 - 0.012); // underside fill
  if (cut) sinkAndTap(K, M, o.sink, H, ty0, sz0, sz1, sinkW);
  // ---- hob (+ oven below handled above)
  if (has(o.hob)) {
    const hw = Math.min(0.86, W - 0.1), hd = 0.5, hz = island ? 0 : D / 2 - 0.06 - hd / 2;
    if (o.hobType === 'gas') gasHob(K, M, o.hob, H, hz, hw, hd);
    else {
      K.box(M.glass, o.hob - 0.295, o.hob + 0.295, H, H + 0.006, hz - hd / 2, hz + hd / 2, 0.003, 1);
      const ring = mat('paint', '#8a8a8a', { rough: 0.5 });
      for (const [ox, oz, rr] of [[-0.15, -0.11, 0.095], [0.15, -0.11, 0.085], [-0.15, 0.1, 0.08], [0.15, 0.1, 0.095]])
        K.add(ring, cached('ring' + rr, () => new THREE.RingGeometry(rr - 0.003, rr, 40, 1)), o.hob + ox, H + 0.0065, hz + oz, -HP, 0, 0);
    }
  }
  if (island) return;
  // ---- low stone upstand along the wall (south run only)
  K.box(M.top, -W / 2, W / 2, H, H + 0.1, -D / 2, -D / 2 + 0.012, 0.002, 1);
  // ---- upper cabinets: matte mid-grey, flat handleless, 1.45 m → ceiling, with a window gap
  if (o.upper) {
    const uy0 = 1.45, uy1 = ceil, Du = 0.35, zuf = -D / 2 + Du, split = Math.min(uy1 - 0.3, 2.3);
    let segs = [[-W / 2, W / 2]];
    if (Array.isArray(o.upperGap)) {
      const [g0, g1] = o.upperGap; const next = [];
      for (const [a, b] of segs) { if (g0 > a) next.push([a, Math.min(b, g0)]); if (g1 < b) next.push([Math.max(a, g1), b]); }
      segs = next;
    }
    for (const [a, b] of segs) {
      if (b - a < 0.12) continue;
      K.box(M.gap, a + 0.018, b - 0.018, uy0 + 0.018, uy1, -D / 2, zuf - 0.018);
      K.box(M.up, a, a + 0.018, uy0, uy1, -D / 2, zuf - 0.018); K.box(M.up, b - 0.018, b, uy0, uy1, -D / 2, zuf - 0.018);
      K.box(M.up, a + 0.018, b - 0.018, uy0, uy0 + 0.018, -D / 2, zuf - 0.018);
      const n = Math.max(1, Math.round((b - a) / 0.45));
      frontsRow(K, M.up, a, b, uy0, split, zuf, n);
      frontsRow(K, M.up, a, b, split, uy1, zuf, n);
      K.box(M.led, a + 0.03, b - 0.03, uy0 - 0.004, uy0, zuf - 0.07, zuf - 0.05);   // under-cabinet LED
    }
    // slim telescopic hood under the uppers above the hob
    if (o.hood && has(o.hob)) {
      const hx0 = o.hob - 0.45, hx1 = o.hob + 0.45, y = uy0, zw = -D / 2;
      K.box(M.steel, hx0, hx1, y - 0.045, y, zw + 0.012, zw + 0.3, 0.003, 1);                         // fixed body
      K.box(mat('paint', '#3b3d3f', { rough: 0.6 }), hx0 + 0.02, hx1 - 0.02, y - 0.0465, y - 0.045, zw + 0.03, zw + 0.28); // grease filter
      K.boxc(M.steel, o.hob, y - 0.056, zw + 0.39, 0.9, 0.01, 0.2, 0.12, 0, 0, 0.003, 1);              // pulled-out visor
      K.box(M.steel, hx0, hx1, y - 0.09, y - 0.064, zw + 0.485, zw + 0.497, 0.003, 1);                 // front lip
      K.box(M.led, hx0 + 0.06, hx1 - 0.06, y - 0.0475, y - 0.0465, zw + 0.24, zw + 0.27);
    }
  }
}

// ------------------------------------------------------------------ appliance housings
function housing(K, M, w, d, H, y0, opt = {}) {
  // grey side panels full height + overhead cabinet from y0 to the ceiling
  const t = 0.02;
  K.box(M.hous, -w / 2, -w / 2 + t, 0, H, -d / 2, d / 2);
  K.box(M.hous, w / 2 - t, w / 2, 0, H, -d / 2, d / 2);
  K.box(M.hous, -w / 2 + t, w / 2 - t, 0, H, -d / 2, -d / 2 + 0.008);       // finished grey back (seen from the dining room)
  K.box(M.gap, -w / 2 + t, w / 2 - t, 0, H, -d / 2 + 0.008, -d / 2 + 0.012); // dark interior back
  K.box(M.gap, -w / 2 + t, w / 2 - t, y0 + 0.018, H, -d / 2 + 0.012, d / 2 - 0.02);
  K.box(M.hous, -w / 2 + t, w / 2 - t, y0, y0 + 0.018, -d / 2 + 0.012, d / 2 - 0.02);
  frontsRow(K, M.hous, -w / 2 + t, w / 2 - t, y0, H, d / 2, (w - 2 * t) > 0.62 ? 2 : 1);
  if (opt.kick) K.box(M.plinth, -w / 2 + t, w / 2 - t, 0, 0.012, -d / 2 + 0.012, d / 2 - 0.04);
}

export function fridgeFrench(K, { w, d, h, o, P }) {
  const M = kitMats(P);
  const H = h, A = o.appliance ?? 1.8, side = o.housing ? 0.02 : 0;
  if (o.housing) housing(K, M, w, d, H, A + 0.03, { kick: true });
  const st = mat('metal', P.fridgeSteel, { rough: 0.28 }), dark = M.gap;
  const fw = w - 2 * side - 0.012, x0 = -fw / 2, x1 = fw / 2, zf = d / 2 - 0.012, dt = 0.05;
  K.box(st, x0, x1, 0.03, A, -d / 2 + 0.05, zf - dt - 0.003, 0.008, 1);              // cabinet
  K.box(dark, x0 + 0.01, x1 - 0.01, 0, 0.03, -d / 2 + 0.08, zf - 0.04);               // kick grille
  const ySplit = A * 0.47, yMid = ySplit / 2 + 0.017;
  // French doors (top) with recessed vertical grip pockets at the meeting edge
  for (const s of [-1, 1]) {
    const a = s < 0 ? x0 : 0.0015, b = s < 0 ? -0.0015 : x1;
    K.box(st, a, b, ySplit + 0.003, A, zf - dt, zf, 0.008, 2);
    const px = s * 0.03;
    K.box(dark, px - 0.008, px + 0.008, ySplit + 0.2, ySplit + 0.62, zf - 0.006, zf + 0.0006, 0.004, 1);
  }
  // two pull-out freezer drawers with recessed top grip channel
  for (const [y0, y1] of [[0.034, yMid - 0.002], [yMid + 0.002, ySplit - 0.003]]) {
    K.box(st, x0, x1, y0, y1, zf - dt, zf, 0.008, 2);
    K.box(dark, x0 + 0.08, x1 - 0.08, y1 - 0.032, y1 - 0.014, zf - 0.006, zf + 0.0006, 0.004, 1);
  }
  // door-gap shadow lines
  K.box(dark, x0 + 0.004, x1 - 0.004, ySplit - 0.003, ySplit + 0.003, zf - dt - 0.003, zf - 0.006);
  // display on the left door
  K.box(M.glass, x0 + 0.08, x0 + 0.2, A - 0.38, A - 0.3, zf, zf + 0.0012, 0.0008, 1);
  K.box(M.digits, x0 + 0.11, x0 + 0.17, A - 0.35, A - 0.335, zf + 0.0012, zf + 0.0016);
}

/** front-load washer / dryer unit (uw × uh × ud), centred at x=0, z=zc, bottom at y0 */
function laundryUnit(K, M, uw, ud, uh, y0, zc, kind) {
  const zf = zc + ud / 2, z0 = zc - ud / 2, x0 = -uw / 2, x1 = uw / 2;
  K.box(M.white, x0, x1, y0, y0 + uh, z0, zf - 0.008, 0.012, 2);
  K.box(M.white, x0 + 0.004, x1 - 0.004, y0 + 0.004, y0 + uh - 0.11, zf - 0.01, zf - 0.002, 0.008, 1);   // front panel
  K.box(mat('gloss', '#e6e6e4', { rough: 0.3 }), x0 + 0.004, x1 - 0.004, y0 + uh - 0.105, y0 + uh - 0.006, zf - 0.01, zf - 0.001, 0.006, 1);
  K.box(mat('gloss', '#d9d9d7', { rough: 0.3 }), x0 + 0.025, x0 + 0.19, y0 + uh - 0.09, y0 + uh - 0.022, zf - 0.0015, zf, 0.003, 1); // drawer
  K.add(mat('metal', P_CHROME, { rough: 0.15 }), cyl(0.028, 0.028, 0.02, 24), 0.03, y0 + uh - 0.056, zf, HP, 0, 0);
  K.box(M.glass, 0.1, 0.24, y0 + uh - 0.075, y0 + uh - 0.037, zf - 0.001, zf + 0.0005);
  K.box(M.digits, 0.14, 0.2, y0 + uh - 0.06, y0 + uh - 0.052, zf + 0.0005, zf + 0.0009);
  const cy = y0 + (uh - 0.11) * 0.52 + 0.01, R = Math.min(0.19, uw * 0.31);
  const chrome = mat('metal', P_CHROME, { rough: 0.15 });
  K.add(chrome, cached('porthole' + R.toFixed(3), () => new THREE.TorusGeometry(R, 0.022, 8, 40)), 0, cy, zf - 0.002, 0, 0, 0, 1, 1, 0.5);
  K.add(mat('gloss', kind === 'dryer' ? '#4a4f54' : '#2f3439', { rough: 0.04, metal: 0.3 }), cyl(R - 0.01, R - 0.01, 0.006, 40), 0, cy, zf - 0.001, HP, 0, 0);
  K.add(mat('paint', '#5a5e63', { rough: 0.5 }), cached('drumring' + R.toFixed(3), () => new THREE.RingGeometry(R * 0.62, R * 0.86, 36, 1)), 0, cy, zf + 0.0025);
  K.box(chrome, R * 0.82, R * 0.82 + 0.03, cy - 0.04, cy + 0.04, zf - 0.006, zf + 0.004, 0.004, 1);
}
const P_CHROME = '#e4e6e8';

export function washerStack(K, { w, d, h, o, P }) {
  const M = kitMats(P);
  const H = h, uw = Math.min(0.6, w - 0.06), ud = Math.min(0.6, d - 0.03), uh = 0.85;
  const zc = d / 2 - 0.022 - ud / 2;
  laundryUnit(K, M, uw, ud, uh, 0, zc, 'washer');
  K.box(M.gap, -uw / 2 + 0.01, uw / 2 - 0.01, uh, uh + 0.012, zc - ud / 2 + 0.02, zc + ud / 2 - 0.02);   // stacking kit
  laundryUnit(K, M, uw, ud, uh, uh + 0.012, zc, 'dryer');
  if (o.housing && H > 2 * uh + 0.2) housing(K, M, w, d, H, 2 * uh + 0.05);
}

export function utilityTower(K, { w, d, h, P }) {
  const M = kitMats(P);
  const cab = mat('paint', P.utility, { rough: 0.85 }), H = h, plinth = 0.1, zf = d / 2, t = 0.018;
  K.box(M.plinth, -w / 2 + 0.02, w / 2 - 0.02, 0, plinth, -d / 2 + 0.02, zf - 0.06);
  K.box(M.gap, -w / 2 + t, w / 2 - t, plinth, H - t, -d / 2, zf - t);
  K.box(cab, -w / 2, -w / 2 + t, 0, H, -d / 2, zf); K.box(cab, w / 2 - t, w / 2, 0, H, -d / 2, zf);
  K.box(cab, -w / 2 + t, w / 2 - t, H - t, H, -d / 2, zf - t);
  const n = w > 0.66 ? 2 : 1, split = Math.min(H - 0.4, 1.95);
  frontsRow(K, cab, -w / 2 + t, w / 2 - t, plinth, split, zf, n);
  frontsRow(K, cab, -w / 2 + t, w / 2 - t, split, H - t, zf, n);
}

// ------------------------------------------------------------------ KEF AV set
/** convex baffle cap: plane (bw × bh) bulging +Z by b at the centre (0 at the edges, sits on a flat face),
 *  with a round opening of radius rh centred at (0, yo) for the driver */
function bulgeCap(bw, bh, b, yo, rh) {
  return cached(`bulge|${bw}|${bh}|${b}|${yo.toFixed(4)}|${rh}`, () => {
    const g = new THREE.PlaneGeometry(bw, bh, 28, 40).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (bw / 2), y = p.getY(i) / (bh / 2); p.setZ(i, b * Math.cos(x * HP) * Math.cos(y * HP)); }
    const keep = [];
    for (let t = 0; t < p.count; t += 3) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3 - yo;
      if (Math.hypot(cx, cy) > rh) for (let k = 0; k < 3; k++) keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    out.computeVertexNormals(); return out;
  });
}
const bulgeAt = (b, bw, bh, x, y) => b * Math.cos((x / (bw / 2)) * HP) * Math.cos((y / (bh / 2)) * HP);
export function speaker(K, { w, d, h, o, P }) {
  const base = o.base ?? 0, H = h || 0.305, W = w, D = d, r = 0.02, b = 0.008;
  const body = mat('paint', P.speakerWhite, { rough: 0.55 }), bodyDS = mat('paint', P.speakerWhite, { rough: 0.55, ds: true });
  K.at(0, base, 0, 0, () => {
    // cabinet with softly radiused edges + compound-curved front baffle (cap with the driver opening)
    K.add(body, rbox(W, H, D - b, r, 3), 0, H / 2, -b / 2);
    const zF = D / 2 - b, bw = W - 2 * r, bh = H - 2 * r, yd = H * 0.56, yo = yd - H / 2;
    K.add(bodyDS, bulgeCap(bw, bh, b, yo, 0.07), 0, H / 2, zF);
    // Uni-Q coaxial driver: skirted trim ring (meets the curved baffle), surround, champagne cone, titanium tweeter
    const zd = zF + bulgeAt(b, bw, bh, 0, yo), rot = [HP, 0, 0];
    K.add(bodyDS, lathe('kefTrim2', [[0.064, -0.002], [0.066, 0.0015], [0.072, 0.0025], [0.077, 0.0015], [0.078, -0.002], [0.078, -0.0095]], 48), 0, yd, zd, ...rot);
    K.add(mat('paint', '#cfccc6', { rough: 0.85, ds: true }), lathe('kefSur2', [[0.064, -0.002], [0.061, 0.0005], [0.057, 0.0], [0.055, -0.0025]], 40), 0, yd, zd, ...rot);
    K.add(mat('metal', P.speakerCone, { rough: 0.5, ds: true }), lathe('kefCone2', [[0.055, -0.0025], [0.042, -0.0045], [0.03, -0.006], [0.021, -0.0065]], 36), 0, yd, zd, ...rot);
    K.add(mat('metal', P.speakerTweeter, { rough: 0.3, ds: true }), lathe('kefTw2', [[0.021, -0.0065], [0.02, -0.004], [0.014, -0.0025], [0.007, -0.0005], [0, 0.0]], 24), 0, yd, zd, ...rot);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; K.boxc(mat('metal', P.speakerTweeter, { rough: 0.3 }), Math.cos(a) * 0.0165, yd + Math.sin(a) * 0.0165, zd - 0.0035, 0.01, 0.0022, 0.004, 0, 0, a, 0, 1); }
    // rear: port + connection panel
    K.add(mat('paint', '#1d1d1e', { rough: 0.9 }), cyl(0.026, 0.026, 0.004, 24), 0, H * 0.3, -D / 2 + 0.0015, HP, 0, 0);
    K.box(mat('black', '#202020'), -0.06, 0.06, H * 0.48, H * 0.78, -D / 2 - 0.0005, -D / 2 + 0.002);
    K.add(mat('emissive', '#ffffff', { e: 0.6 }), cyl(0.0018, 0.0018, 0.001, 8), 0, 0.03, zF + 0.0005, HP, 0, 0);  // status LED
  });
}
export function speakerStand(K, { w, d, h, P }) {
  const wh = mat('paint', P.standWhite, { rough: 0.3 }), H = h || 0.657;
  const soft = (sw, sd, t, rr, y) => K.add(wh, cached(`kefplate|${sw}|${sd}|${t}|${rr}`, () => {
    const s = new THREE.Shape(), x = -sw / 2, z = -sd / 2;
    s.moveTo(x + rr, z); s.lineTo(x + sw - rr, z); s.quadraticCurveTo(x + sw, z, x + sw, z + rr); s.lineTo(x + sw, z + sd - rr);
    s.quadraticCurveTo(x + sw, z + sd, x + sw - rr, z + sd); s.lineTo(x + rr, z + sd); s.quadraticCurveTo(x, z + sd, x, z + sd - rr); s.lineTo(x, z + rr); s.quadraticCurveTo(x, z, x + rr, z);
    const g = new THREE.ExtrudeGeometry(s, { depth: t - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, 0.002); g.rotateX(HP); g.translate(0, t, 0); return g;     // spans y∈[0,t]
  }), 0, y, 0);
  soft(w - 0.004, d - 0.004, 0.014, 0.035, 0.008);                                 // base plate
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.add(mat('black', '#1e1e1e', { rough: 0.8 }), cyl(0.012, 0.012, 0.008, 12), x * (w / 2 - 0.03), 0.004, z * (d / 2 - 0.035));
  // slim elongated column (lens-shaped section), slight taper
  K.add(wh, rbox(0.07, H - 0.034, 0.12, 0.03, 3), 0, 0.022 + (H - 0.034) / 2, -0.01, 0, 0, 0, 1, 1, 1);
  K.box(mat('black', '#2a2a2a'), -0.012, 0.012, 0.06, H - 0.06, -0.071, -0.069);       // rear cable channel cover
  soft(Math.min(0.2, w - 0.02), Math.min(0.28, d - 0.02), 0.012, 0.025, H - 0.012);   // top plate
}
export function subwoofer(K, { w, d, h, P }) {
  const wh = mat('paint', P.speakerWhite, { rough: 0.55 }), H = h || 0.256, r = 0.045;
  K.add(wh, rbox(w, H - 0.01, d, r, 4), 0, 0.01 + (H - 0.01) / 2, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.add(mat('black', '#1e1e1e', { rough: 0.8 }), cyl(0.014, 0.014, 0.01, 12), x * (w / 2 - 0.05), 0.005, z * (d / 2 - 0.05));
  // opposed side drivers (P2P force-cancelling), recessed into both side faces
  const yc = 0.01 + (H - 0.01) / 2;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.005), rot = [0, 0, -s * HP];
    K.add(mat('paint', '#d3d1cc', { rough: 0.8, ds: true }), lathe('kcSur', [[0.075, 0.0005], [0.07, 0.004], [0.064, 0.0045], [0.06, 0.001]], 40), x, yc, 0, ...rot);
    K.add(mat('paint', '#e0ded9', { rough: 0.6, ds: true }), lathe('kcCone', [[0.06, 0.001], [0.045, -0.006], [0.03, -0.012], [0.026, -0.011], [0.018, -0.006], [0, -0.004]], 36), x, yc, 0, ...rot);
  }
  K.add(mat('emissive', '#ffffff', { e: 0.5 }), cyl(0.0018, 0.0018, 0.001, 8), 0, 0.04, d / 2 + 0.0002, HP, 0, 0);
}

// ------------------------------------------------------------------ ziptrack outdoor blind
/** static frame via the Kit; returns a per-instance hook that adds the fabric + bottom bar and userData.setDrop(f) */
export function ziptrack(K, { w, d, h, o, P }) {
  const H = h || 2.75, cH = 0.11, cD = Math.min(d, 0.1), ch = 0.04, chD = Math.min(0.05, cD - 0.02);
  const frame = mat('black', P.zipFrame, { rough: 0.45 });
  const z0 = -d / 2, zc = z0 + cD / 2;
  K.box(frame, -w / 2 + 0.008, w / 2 - 0.008, H - cH, H, z0, z0 + cD, 0.008, 2);                 // cassette
  for (const s of [-1, 1]) K.box(mat('black', '#2c2e30', { rough: 0.5 }), s < 0 ? -w / 2 : w / 2 - 0.008, s < 0 ? -w / 2 + 0.008 : w / 2, H - cH, H, z0, z0 + cD, 0.002, 1); // end caps
  for (const s of [-1, 1]) {                                                                         // zip side channels
    const x0 = s < 0 ? -w / 2 + 0.004 : w / 2 - 0.004 - ch;
    K.box(frame, x0, x0 + ch, 0, H - cH, zc - chD / 2, zc + chD / 2, 0.003, 1);
    K.box(mat('paint', '#141516', { rough: 0.9 }), x0 + (s < 0 ? ch - 0.002 : 0), x0 + (s < 0 ? ch : 0.002), 0.01, H - cH, zc - 0.006, zc + 0.006); // zip slot
  }
  const yTop = H - cH, barH = 0.035, travel = yTop - barH, fw = w - 2 * (0.004 + ch) + 0.02, tile = 0.03;
  const fabricMat = mat('zipmesh', P.zipFabric, { opacity: P.zipOpacity ?? 0.55 });
  const barGeo = rbox(w - 2 * (0.004 + ch) - 0.004, barH, 0.03, 0.006, 2);
  const drop0 = Math.max(0, Math.min(1, +o.drop || 0));
  return (group) => {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
    const fabric = new THREE.Mesh(geo, fabricMat); fabric.name = 'ziptrack:fabric';
    fabric.position.set(0, yTop, zc); fabric.renderOrder = 2;
    const bar = new THREE.Mesh(barGeo, frame.material); bar.name = 'ziptrack:bar'; bar.castShadow = true; bar.receiveShadow = true;
    // vertex colour for the shared vertex-coloured frame material
    if (frame.material.vertexColors && !barGeo.userData.vc) {
      const n = barGeo.attributes.position.count, c = new THREE.Color(P.zipFrame), a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      barGeo.setAttribute('color', new THREE.BufferAttribute(a, 3)); barGeo.userData.vc = true;
    }
    bar.position.set(0, 0, zc);
    group.add(fabric, bar);
    const uv = geo.attributes.uv;
    group.userData.drop = drop0;
    group.userData.setDrop = (f) => {
      f = Math.max(0, Math.min(1, +f || 0));
      const L = Math.max(0.001, f * travel + barH / 2);
      fabric.scale.set(fw, L, 1); fabric.visible = f > 0.002;
      // keep the weave at a constant real-world scale while the screen extends
      uv.setXY(0, 0, L / tile); uv.setXY(1, fw / tile, L / tile); uv.setXY(2, 0, 0); uv.setXY(3, fw / tile, 0); uv.needsUpdate = true;
      bar.position.y = yTop - barH / 2 - f * travel;
      group.userData.drop = f;
    };
    group.userData.setDrop(drop0);
  };
}
