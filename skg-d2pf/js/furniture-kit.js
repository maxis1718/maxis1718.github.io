// furniture-kit.js — shared helpers for js/furniture.js
// Material cache, procedural textures, geometry cache and a "Kit" that collects
// transformed geometry per material and merges them into ONE mesh per material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// ---------------------------------------------------------------- palette
export const DEFAULT_PALETTE = {
  oak: '#c8a57a',        // light oak (multiplied by grain texture)
  oakPale: '#d9c2a0',
  walnut: '#7b5b41',
  white: '#eeebe5',      // warm white lacquer
  cabinet: '#e8e3da',    // kitchen / wardrobe fronts
  carcass: '#3a3632',    // shadow-gap colour behind fronts
  black: '#262524',      // matte black accents
  steel: '#c9cbcd',      // brushed steel
  chrome: '#e9ebec',
  fabric: '#cfc5b5',     // oatmeal linen (sofa / headboard)
  fabricDark: '#7f776d', // task chair
  bedding: '#f4f1eb',
  pillow: '#ebe5da',
  throw: '#a8977f',
  accent: '#b97c58',     // terracotta cushion
  accent2: '#8f9b82',    // sage
  ceramic: '#f7f6f3',
  worktop: '#f2f0ec',    // white quartz (veined texture)
  stone: '#dcd7cf',
  glass: '#dde9e8',
  leaf: '#557a42',
  leaf2: '#3f6233',
  pot: '#cbc3b6',
  soil: '#3a2e24',
  rug: '#e9e3d8',
  rugBorder: '#a89a83',
  appliance: '#f3f3f1',
  screen: '#0b0d0f',
  teak: '#9b6c45',
  alu: '#55585b',
  outdoorFabric: '#d8d0c2',
  lampGlow: '#ffe2b8',
  sheer: '#f6f3ee',
  drape: '#c9bca9',
  frame: '#2a2826',
  sheerOpacity: 0.3,      // ≤ 0.35
  kitchenLower: '#c7a479', // oak veneer base units
  kitchenUpper: '#efebe4', // warm white matte wall units / tall tower
  kitchenHandle: '#1f1f1f',
  // round 3 — living / dining set
  tvConsole: '#cfb08a',    // TV sideboard finish (warm light oak, matte)
  tvConsolePlinth: '#2e2b28',
  tvFrame: '#dcc8a8',      // The Frame 75" bezel (beige oak)
  ledWarm: '#ffb06a',      // 2700 K LED strip / floor glow
  ledGlow: 2.0,            // emissiveIntensity of ambient LED strips
  oakWheat: '#d6b688',     // dining table base / chairs (light warm oak)
  sintered: '#e9e1d2',     // dining table top (travertine-look sintered stone, matte)
  chairSeat: '#ece6da',    // dining chair seat (warm off-white boucle)
  // round 4 — contractor kitchen (opts.style:'contractor'), housings, utility, AV, blinds
  kcLower: '#eceae5',      // lower cabinets: flat matte warm white
  kcUpper: '#8b8e91',      // upper cabinets: matte mid-grey
  kcProfile: '#19191a',    // black aluminium edge profiles / worktop edge line
  kcWorktop: '#f3f2ef',    // white sintered stone worktop (soft grey veining)
  kcPlinth: '#2c2c2d',     // recessed kick
  kcHousing: '#85888b',    // matte-grey tall housings (fridge / washer stack)
  fridgeSteel: '#c3c5c7',  // French-door fridge stainless
  ovenGlass: '#111214',    // oven / hob black glass
  utility: '#efebe4',      // shoe / utility tower warm white
  speakerWhite: '#e7e5e0', // KEF Mineral White
  speakerCone: '#a88c62',  // Uni-Q cone (champagne)
  speakerTweeter: '#8e8c87', // titanium tweeter / waveguide
  standWhite: '#dedcd8',   // KEF S2 stand
  zipFabric: '#2d2f31',    // ziptrack sunscreen mesh (charcoal, ~5 % openness)
  zipOpacity: 0.55,
  zipFrame: '#3b3e41',     // anthracite cassette / zip channels
  glow: 1.0,             // emissive intensity multiplier
};

export function palette(theme) {
  const t = (theme && theme.furniture) || {};
  const p = { ...DEFAULT_PALETTE };
  for (const k in t) if (t[k] !== undefined && t[k] !== null) p[k] = t[k];
  return p;
}

// ---------------------------------------------------------------- textures (shared)
const HAS_DOM = typeof document !== 'undefined';
const _tex = {};
function canvasTex(key, size, draw, repeat = true, w = size, h = size) {
  if (!HAS_DOM) return null;
  if (_tex[key]) return _tex[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  _tex[key] = t; return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export { rng };

export function woodTex() {
  return canvasTex('wood', 512, (g, w, h) => {
    g.fillStyle = '#efe7dc'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    // long grain streaks along U (x)
    for (let i = 0; i < 260; i++) {
      const y = r() * h, a = 0.03 + r() * 0.09, lw = 0.6 + r() * 2.4;
      const dark = r() < 0.75;
      g.strokeStyle = dark ? `rgba(120,80,40,${a})` : `rgba(255,250,240,${a * 1.3})`;
      g.lineWidth = lw; g.beginPath();
      const amp = 2 + r() * 6, f = 0.004 + r() * 0.01, ph = r() * 6;
      for (let x = -4; x <= w + 4; x += 8) {
        const yy = y + Math.sin(x * f + ph) * amp;
        x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    // tiny pores
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,60,30,${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 1); }
  });
}
export function fabricTex() {
  return canvasTex('fabric', 256, (g, w, h) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    const r = rng(11);
    // low-contrast weave (high contrast aliases into a plaid at distance)
    for (let y = 0; y < h; y += 2) { const v = 228 + r() * 24 | 0; g.fillStyle = `rgba(${v},${v},${v},0.4)`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { const v = 226 + r() * 26 | 0; g.fillStyle = `rgba(${v},${v},${v},0.3)`; g.fillRect(x, 0, 1, h); }
    // soft slubs
    for (let i = 0; i < 90; i++) { const v = r() < 0.5 ? 205 : 255; g.fillStyle = `rgba(${v},${v},${v},0.22)`; g.fillRect(r() * w, r() * h, 6 + r() * 22, 1.5); }
  });
}
export function quartzTex() {
  return canvasTex('quartz', 1024, (g, w, h) => {
    g.fillStyle = '#f7f6f3'; g.fillRect(0, 0, w, h);
    const r = rng(41);
    for (let i = 0; i < 6000; i++) { const v = 225 + r() * 30 | 0; g.fillStyle = `rgba(${v},${v},${v - 2},0.25)`; g.fillRect(r() * w, r() * h, 2, 2); }
    // soft grey veins (drawn wrapped so the tile repeats)
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x0 = r() * w, y0 = r() * h, len = 500 + r() * 700, ang = -0.5 + r() * 0.5;
      for (const pass of [[10, 0.05], [3, 0.12], [1.2, 0.22]]) {
        g.strokeStyle = `rgba(120,118,115,${pass[1] * (0.6 + r() * 0.6)})`; g.lineWidth = pass[0];
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          g.beginPath(); g.moveTo(x0 + ox, y0 + oy);
          let x = x0, y = y0; const rr = rng(i * 97 + 5);
          for (let t = 0; t < len; t += 20) { x += Math.cos(ang) * 20; y += Math.sin(ang) * 20 + (rr() - 0.5) * 14; g.lineTo(x + ox, y + oy); }
          g.stroke();
        }
      }
    }
  });
}
/** travertine-look sintered stone: warm ivory, fine low-contrast striations running along V (rot=false) or U */
export function sinteredTex(alongU = false) {
  const t = canvasTex('sintered' + (alongU ? 'U' : 'V'), 1024, (g, w, h) => {
    g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, w, h);
    const r = rng(53);
    // soft broad tonal bands
    for (let i = 0; i < 26; i++) {
      const x = r() * w, bw = 8 + r() * 70, a = 0.03 + r() * 0.07, warm = r() < 0.6;
      g.fillStyle = warm ? `rgba(196,170,132,${a})` : `rgba(255,253,248,${a * 1.4})`;
      for (const ox of [-w, 0, w]) g.fillRect(x + ox, 0, bw, h);
    }
    // fine striations (slightly wavy, wrap-safe)
    for (let i = 0; i < 340; i++) {
      const x0 = r() * w, a = 0.05 + r() * 0.11, lw = 0.5 + r() * 1.5, amp = 1 + r() * 3, f = 0.002 + r() * 0.006, ph = r() * 6;
      g.strokeStyle = r() < 0.75 ? `rgba(150,125,92,${a})` : `rgba(255,255,252,${a * 1.5})`; g.lineWidth = lw;
      const y0 = r() * h, len = h * (0.25 + r() * 0.75);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0]) {
        g.beginPath();
        for (let y = y0; y <= y0 + len; y += 12) { const xx = x0 + ox + Math.sin(y * f + ph) * amp; y === y0 ? g.moveTo(xx, y + oy) : g.lineTo(xx, y + oy); }
        g.stroke();
      }
    }
    // travertine pores: tiny elongated pits along the grain
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(150,128,98,${0.06 + r() * 0.12})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 2 + r() * 7); }
    // paper-fine noise
    for (let i = 0; i < 12000; i++) { const v = 200 + r() * 55 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.08)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  });
  if (t && alongU && !t.userData.rot) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; t.userData.rot = true; }
  return t;
}
/** Samsung The Frame "Art Mode" picture: digital white mat + soft wabi-sabi abstract on warm paper (16:9) */
export function frameArtTex() {
  return canvasTex('frameart', 1024, (g, w, h) => {
    g.fillStyle = '#f3efe8'; g.fillRect(0, 0, w, h);                    // mat
    const r = rng(77);
    const mx = w * 0.17, my = h * 0.13, aw = w - 2 * mx, ah = h - 2 * my;
    // inner bevel shadow of the digital mat
    g.fillStyle = 'rgba(120,105,85,0.18)'; g.fillRect(mx - 3, my - 3, aw + 6, ah + 6);
    g.save(); g.beginPath(); g.rect(mx, my, aw, ah); g.clip();
    g.fillStyle = '#e7ddcd'; g.fillRect(mx, my, aw, ah);                 // warm paper
    for (let i = 0; i < 9000; i++) { const v = 190 + r() * 60 | 0; g.fillStyle = `rgba(${v},${v - 8},${v - 20},0.07)`; g.fillRect(mx + r() * aw, my + r() * ah, 2, 2); }
    // large soft washes
    const wash = (x, y, rx, ry, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 6.3); g.fill(); g.restore(); };
    wash(mx + aw * 0.25, my + ah * 0.7, aw * 0.45, ah * 0.35, 'rgba(201,188,166,A)', 0.55);
    wash(mx + aw * 0.8, my + ah * 0.25, aw * 0.35, ah * 0.3, 'rgba(236,230,219,A)', 0.8);
    // muted terracotta / ochre organic shape (irregular blob)
    const cx = mx + aw * 0.6, cy = my + ah * 0.47, R = ah * 0.27;
    g.fillStyle = 'rgba(186,121,82,0.86)'; g.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.2832; const rr = R * (1 + 0.07 * Math.sin(a * 3 + 0.6) + 0.04 * Math.sin(a * 7 + 2)); const x = cx + Math.cos(a) * rr * 1.08, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.fill();
    for (let i = 0; i < 2500; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R; g.fillStyle = `rgba(${r() < 0.5 ? '150,90,60' : '220,170,130'},0.08)`; g.fillRect(cx + Math.cos(a) * d * 1.05, cy + Math.sin(a) * d, 3, 3); }
    // sand-coloured ground shape at the bottom
    g.fillStyle = 'rgba(176,160,134,0.75)'; g.beginPath(); g.moveTo(mx, my + ah * 0.82);
    g.bezierCurveTo(mx + aw * 0.3, my + ah * 0.74, mx + aw * 0.55, my + ah * 0.9, mx + aw, my + ah * 0.8); g.lineTo(mx + aw, my + ah); g.lineTo(mx, my + ah); g.fill();
    // charcoal brush arc (dry-brush: several thin offset strokes)
    g.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(48,43,38,${0.18 + r() * 0.25})`; g.lineWidth = 2 + r() * 4;
      g.beginPath(); g.moveTo(mx + aw * 0.14, my + ah * (0.62 + k * 0.006));
      g.bezierCurveTo(mx + aw * 0.2, my + ah * (0.18 + k * 0.006), mx + aw * 0.42, my + ah * (0.16 + k * 0.005), mx + aw * 0.48, my + ah * (0.36 + k * 0.006)); g.stroke();
    }
    g.restore();
  }, false, 1024, 576);
}
/** additive floor-glow gradient for LED strips (black = no light) */
export function floorGlowTex() {
  return canvasTex('floorglow', 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = y / (h - 1);                                   // 0 = top of canvas = back (under the cabinet)
      const fz = v < 0.12 ? 0.75 + 0.25 * (v / 0.12) : Math.exp(-(v - 0.12) * 4.2) * (1 - v) ** 0.6;
      const u = Math.min(x, w - 1 - x) / (w * 0.5);             // 0 at ends → 1 mid
      const fx = Math.min(1, u / 0.18) ** 1.6;
      const k = Math.max(0, Math.min(1, fz * fx)) * 255;
      const i = (y * w + x) * 4; D[i] = D[i + 1] = D[i + 2] = k; D[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false, 256, 128);
}
/** near-white mottle for matte paint / lacquer (map + roughnessMap): breaks up large flat surfaces */
export function paintTex() {
  return canvasTex('paint', 256, (g, w, h) => {
    g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h);
    const r = rng(61);
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 40, v = r() < 0.5 ? 236 : 255;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${v},${v},${v},0.16)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.fillStyle = gr; g.save(); g.translate(ox, oy); g.fillRect(x - rr, y - rr, rr * 2, rr * 2); g.restore(); } }
    for (let i = 0; i < 9000; i++) { const v = 228 + r() * 27 | 0; g.fillStyle = `rgba(${v},${v},${v},0.18)`; g.fillRect(r() * w, r() * h, 1, 1); }
  });
}
/** brushed-metal streaks along U (map + roughnessMap) */
export function brushedTex() {
  return canvasTex('brushed', 256, (g, w, h) => {
    g.fillStyle = '#ececec'; g.fillRect(0, 0, w, h);
    const r = rng(67);
    for (let i = 0; i < 1600; i++) { const v = 222 + r() * 33 | 0, y = r() * h, len = 30 + r() * 200, x = r() * w;
      g.fillStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.16})`; g.fillRect(x, y, len, 0.6 + r() * 0.6); g.fillRect(x - w, y, len, 1); }
  });
}
/** ziptrack sunscreen: fine basket weave with see-through openings (RGBA) */
export function zipMeshTex() {
  return canvasTex('zipmesh', 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const n = 16, p = w / n;
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, w, h);            // openings (partly see-through)
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(235,235,235,1)'; g.fillRect(0, i * p + 0.6, w, p * 0.62);            // weft
      g.fillStyle = 'rgba(205,205,205,1)'; g.fillRect(i * p + 0.6, 0, p * 0.62, h);            // warp
    }
  });
}
export function rugTex() {
  return canvasTex('rug', 512, (g, w, h) => {
    g.fillStyle = '#f2efe9'; g.fillRect(0, 0, w, h);
    const r = rng(23);
    for (let i = 0; i < 9000; i++) { const v = 205 + r() * 50 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
    // soft tonal border (multiplied with rug colour)
    g.strokeStyle = 'rgba(150,130,105,0.55)'; g.lineWidth = 14; g.strokeRect(34, 34, w - 68, h - 68);
    g.strokeStyle = 'rgba(150,130,105,0.35)'; g.lineWidth = 3; g.strokeRect(58, 58, w - 116, h - 116);
  }, false);
}
export function artTex(variant = 0) {
  return canvasTex('art' + variant, 512, (g, w, h) => {
    g.fillStyle = '#efe9df'; g.fillRect(0, 0, w, h);
    const r = rng(31 + variant);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(160,140,110,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 3, 3); }
    // muted earthy abstract: sun disc, hills, brush stroke
    g.fillStyle = '#c9845e'; g.beginPath(); g.arc(w * 0.66, h * 0.36, w * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8c917c'; g.beginPath(); g.moveTo(0, h * 0.78);
    g.bezierCurveTo(w * 0.25, h * 0.55, w * 0.45, h * 0.62, w * 0.62, h * 0.72); g.bezierCurveTo(w * 0.78, h * 0.8, w * 0.9, h * 0.7, w, h * 0.66);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#5f5a52'; g.beginPath(); g.moveTo(0, h * 0.9);
    g.bezierCurveTo(w * 0.3, h * 0.78, w * 0.6, h * 0.95, w, h * 0.85); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.strokeStyle = 'rgba(40,36,32,0.85)'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.18, h * 0.2); g.bezierCurveTo(w * 0.3, h * 0.12, w * 0.4, h * 0.3, w * 0.48, h * 0.18); g.stroke();
  }, false, 512, 360);
}

// ---------------------------------------------------------------- materials (cached)
const _mats = new Map();
const _emissive = new Set();
const _all = new Set();          // every real THREE material created here (for texture injection)
const _inject = {};              // kind → { map, normalMap, roughnessMap, aoMap, size, normalScale, vertexColors, roughness }
function hex(c) { return '#' + new THREE.Color(c).getHexString(); }

/**
 * kind: wood | paint | fabric | metal | black | ceramic | gloss | glass | emissive | mirror | vc | art | rug | sheer | drape | leaf
 */
// Opaque kinds share ONE material per (kind, params) and carry their colour as vertex colours, so an item's
// differently-coloured fabric / wood / paint parts merge into a single mesh (fewer draw calls).
const VC_KINDS = new Set(['wood', 'paint', 'fabric', 'metal', 'black', 'ceramic', 'gloss', 'quartz']);
// world-UV scale (metres per texture tile) for kinds whose UVs are generated by projection
const WORLD_UV = { rug: 1, wood: 0.9, fabric: 0.35, quartz: 1.4, sintered: 1.25, paint: 0.8, black: 0.8, metal: 0.5, gloss: 0.8, ceramic: 0.8, sheer: 0.2, drape: 0.3, mirror: 1, glass: 1 };
export function mat(kind, color, extra = {}) {
  if (VC_KINDS.has(kind)) {
    extra = bucket(kind, extra);
    const rk = 'ref|' + kind + '|' + hex(color ?? '#ffffff') + '|' + JSON.stringify(extra);
    let r = _mats.get(rk);
    if (!r) { r = { isMatRef: true, material: baseMat(kind, '#ffffff', extra, true), color: new THREE.Color(color ?? '#ffffff') }; _mats.set(rk, r); }
    return r;
  }
  return baseMat(kind, color, extra, false);
}
// quantise finish parameters into a few buckets so more parts share a material (draw-call budget)
function bucket(kind, e) {
  const o = {}; if (e.ds) o.ds = true;
  const near = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  if (kind === 'paint' && e.rough !== undefined) { const r = near(e.rough, [0.3, 0.55, 0.85]); if (r !== 0.55) o.rough = r; }
  if (kind === 'metal' && e.rough !== undefined) { const r = near(e.rough, [0.15, 0.32]); if (r !== 0.32) o.rough = r; }
  if (kind === 'gloss' && e.rough !== undefined && e.rough < 0.1) { o.rough = 0.05; o.metal = 0.3; }
  return o;
}
function baseMat(kind, color, extra, vc) {
  const key = kind + '|' + (vc ? 'vc' : hex(color ?? '#ffffff')) + '|' + JSON.stringify(extra);
  let m = _mats.get(key);
  if (m) return m;
  const c = new THREE.Color(color ?? '#ffffff');
  const P = { color: c };
  let worldUV = 0;
  switch (kind) {
    case 'wood': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.6, metalness: 0, map: woodTex() }); worldUV = 0.9; break;
    case 'paint': { const t = paintTex(); m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.55, metalness: 0, map: t, roughnessMap: t }); break; }
    case 'fabric': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.95, metalness: 0, map: fabricTex() }); worldUV = 0.35; break;
    case 'quartz': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.22, metalness: 0, map: quartzTex() }); worldUV = 1.4; break;
    case 'metal': { const t = brushedTex(); m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.32, metalness: 1.0, map: t, roughnessMap: t }); break; }
    case 'black': { const t = paintTex(); m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.5, metalness: 0.35, roughnessMap: t }); break; }
    case 'ceramic': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.1, metalness: 0 }); break;
    case 'gloss': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.18, metalness: 0.05 }); break;
    case 'mirror': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.03, metalness: 1.0, envMapIntensity: 1.2 }); break;
    case 'glass': m = new THREE.MeshPhysicalMaterial({ ...P, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }); break;
    case 'emissive': m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1, roughness: 0.6, side: THREE.DoubleSide }); _emissive.add(m); m.userData.baseEmissive = extra.e ?? 1; m.userData.glow = true; if (extra.amb) m.userData.ambient = true; break;
    case 'vc': m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: extra.rough ?? 0.8, metalness: 0, side: extra.ds ? THREE.DoubleSide : THREE.FrontSide }); break;
    case 'art': m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: artTex(extra.v || 0) }); break;
    case 'rug': m = new THREE.MeshStandardMaterial({ ...P, roughness: 1, map: rugTex() }); break;
    case 'sintered': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.85, metalness: 0, map: sinteredTex(!!extra.alongU), envMapIntensity: 0.6 }); worldUV = 1.25; break;
    case 'frameart': { const t = frameArtTex(); m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: extra.e ?? 0.05, envMapIntensity: 0.3 }); break; }
    case 'floorglow': m = new THREE.MeshBasicMaterial({ ...P, map: floorGlowTex(), transparent: true, opacity: extra.opacity ?? 0.9, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); m.userData.ambient = true; break;
    case 'sheer': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.95, transparent: true, opacity: Math.min(0.35, extra.opacity ?? 0.3), side: THREE.DoubleSide, depthWrite: false, map: fabricTex() }); worldUV = 0.2; break;
    case 'drape': m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.95, side: THREE.DoubleSide, map: fabricTex() }); worldUV = 0.3; break;
    case 'zipmesh': {
      // sunscreen mesh: semi-transparent weave that turns nearly opaque at grazing view angles (fresnel-like)
      m = new THREE.MeshStandardMaterial({ ...P, roughness: 0.9, metalness: 0, transparent: true, opacity: extra.opacity ?? 0.55, side: THREE.DoubleSide, depthWrite: false, map: zipMeshTex() });
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
        '{ float fz = 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ); diffuseColor.a = mix( diffuseColor.a, 0.97, fz * fz ); }\n#include <opaque_fragment>'); };
      m.customProgramCacheKey = () => 'furn-zipmesh';
      break;
    }
    default: m = new THREE.MeshStandardMaterial({ ...P, roughness: extra.rough ?? 0.6, metalness: extra.metal ?? 0 });
  }
  if (extra.rough !== undefined && kind !== 'vc') m.roughness = extra.rough;
  if (extra.metal !== undefined) m.metalness = extra.metal;
  if (extra.ds) m.side = THREE.DoubleSide;
  if (kind === 'emissive') m.emissiveIntensity = m.userData.baseEmissive * _glow;
  if (vc) m.vertexColors = true;
  m.userData.worldUV = worldUV || WORLD_UV[kind] || 0;
  m.userData.kind = kind;
  m.name = 'furn:' + key;
  _mats.set(key, m); _all.add(m);
  applyInject(m);
  return m;
}

// ---------------------------------------------------------------- texture injection hook (realism pass)
const INJECT_GROUPS = { oak: ['wood'], wood: ['wood'], stone: ['quartz', 'sintered'], fabric: ['fabric', 'drape'], paint: ['paint'], lacquer: ['paint'], metal: ['metal'], steel: ['metal'] };
/**
 * Inject photographic PBR maps into the cached furniture materials (live: affects already-built furniture, also batched).
 *   setFurnitureTextures({ oak:{map,normalMap,roughnessMap,size:0.9}, stone:{...}, fabric:{...}, paint:{...}, metal:{...} })
 * Keys: oak|wood → wood veneers, stone → worktops + sintered table top, fabric → upholstery/drapes, paint, metal,
 * or any material kind name (sheer, black, ceramic, gloss, zipmesh…). Per entry:
 *   size        metres covered by one texture tile (default 1)
 *   vertexColors false → ignore the per-part palette tint (maps are otherwise MULTIPLIED by the palette colour; keep maps near-neutral)
 *   normalScale, roughness, metalness  optional overrides. A map set to null removes it.
 */
export function setFurnitureTextures(spec = {}) {
  for (const key in spec) for (const k of (INJECT_GROUPS[key] || [key])) _inject[k] = { ...(_inject[k] || {}), ...spec[key] };
  for (const m of _all) applyInject(m);
}
/** all cached furniture materials (debug / engine tweaks) */
export function furnitureMaterials() { return [..._all]; }
function applyInject(m) {
  const s = _inject[m.userData.kind]; if (!s) return;
  const rep = (m.userData.worldUV || 1) / (s.size || 1);
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'metalnessMap']) {
    if (!(slot in s)) continue;
    const src = s[slot];
    if (!src) { m[slot] = null; continue; }
    const old = m[slot], t = src.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
    if (old && old.userData && old.userData.rot) { t.center.set(0.5, 0.5); t.rotation = old.rotation; }
    if (slot === 'map') t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; m[slot] = t;
  }
  if (s.normalScale !== undefined && m.normalScale) m.normalScale.set(s.normalScale, s.normalScale);
  if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
  if (s.color !== undefined) m.color.set(s.color); else m.color.copy(m.userData.baseColor);
  if (s.colorScale !== undefined) m.color.multiplyScalar(s.colorScale);   // detail maps (mean < 1): restore the palette tone
  if (s.vertexColors === false) m.vertexColors = false;
  if (s.roughness !== undefined) m.roughness = s.roughness;
  if (s.metalness !== undefined) m.metalness = s.metalness;
  m.needsUpdate = true;
}
let _glow = 1;
/** Scale all furniture emissive materials (e.g. 0.6 by day, 1.4 in the evening). */
export function setGlow(k) { _glow = k; for (const m of _emissive) m.emissiveIntensity = m.userData.baseEmissive * k; }

// ---------------------------------------------------------------- geometry cache
const _geo = new Map();
const q = (v) => Math.round(v * 2000) / 2000;
export function rbox(w, h, d, r = 0, seg = 1) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const key = `rb|${q(w)}|${q(h)}|${q(d)}|${r > 0.0004 ? q(r) : 0}|${seg}`;
  let g = _geo.get(key);
  if (!g) { g = r > 0.0004 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d); _geo.set(key, g); }
  return g;
}
/** box with 45° chamfered edges (≈ 70 tris): catches a highlight line so panels never read as razor-edged */
export function chamferBox(w, h, d, c) {
  const key = `cb|${q(w)}|${q(h)}|${q(d)}|${q(c)}`;
  let g = _geo.get(key);
  if (!g) {
    const a = w / 2, b = h / 2, e = d / 2, pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(new THREE.Vector3(sx * (a - c), sy * b, sz * e), new THREE.Vector3(sx * a, sy * (b - c), sz * e), new THREE.Vector3(sx * a, sy * b, sz * (e - c)));
    }
    g = new ConvexGeometry(pts); _geo.set(key, g);
  }
  return g;
}
export function cyl(rt, rb, h, seg = 16, open = false, thetaStart = 0, thetaLen = Math.PI * 2) {
  const key = `cy|${q(rt)}|${q(rb)}|${q(h)}|${seg}|${open}|${q(thetaStart)}|${q(thetaLen)}`;
  let g = _geo.get(key);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLen); _geo.set(key, g); }
  return g;
}
export function cached(key, make) { let g = _geo.get(key); if (!g) { g = make(); _geo.set(key, g); } return g; }
export function lathe(key, pts, seg = 24) {
  return cached('la|' + key + '|' + seg, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg));
}

// ---------------------------------------------------------------- Kit
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export class Kit {
  constructor(seed = 1) { this.parts = new Map(); this.tf = null; this.rand = rng(seed); }
  /** run fn with an extra transform applied to everything it adds (offset x,y,z + rotation about Y) */
  at(x, y, z, ry, fn) {
    const prev = this.tf, m = new THREE.Matrix4().makeRotationY(ry || 0).setPosition(x, y, z);
    this.tf = prev ? prev.clone().multiply(m) : m;
    try { fn(); } finally { this.tf = prev; }
  }
  /** add geometry with transform; rot in radians (XYZ), scale optional; color for vertex-colour materials */
  add(material, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = null) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    const m = new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addM(material, geo, m, color);
  }
  addM(material, geo, matrix, color = null) {
    if (material.isMatRef) {
      if (color === null) {
        color = material.color;
        // veneer / stone: slight per-part tone variation (real panels never match perfectly)
        if (material.material.userData.kind === 'wood') color = color.clone().multiplyScalar(0.955 + this.rand() * 0.09);
      }
      material = material.material;
    }
    if (this.tf) matrix = this.tf.clone().multiply(matrix);
    let e = this.parts.get(material);
    if (!e) { e = []; this.parts.set(material, e); }
    e.push({ geo, matrix, color });
  }
  /** axis-aligned (optionally rounded) box from extents */
  box(material, x0, x1, y0, y1, z0, z1, r = 0, seg = 1) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return;
    const mn = Math.min(w, h, d), mx = Math.max(w, h, d);
    // unrounded panels get a ~1.5 mm chamfer when big enough to be seen up close
    const mm = material.isMatRef ? material.material : material;
    const ownUV = mm.map && !mm.userData.worldUV;          // e.g. artwork: needs the box's native UVs
    const geo = (r <= 0 && !ownUV && mn >= 0.012 && mx >= 0.1) ? chamferBox(w, h, d, Math.min(0.0018, mn * 0.15)) : rbox(w, h, d, r, seg);
    this.add(material, geo, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  /** centred box with rotation */
  boxc(material, cx, cy, cz, w, h, d, rx = 0, ry = 0, rz = 0, r = 0, seg = 1, color = null) {
    this.add(material, rbox(w, h, d, r, seg), cx, cy, cz, rx, ry, rz, 1, 1, 1, color);
  }
  /** cylinder between y0 and y1 at (x,z) */
  cylY(material, x, z, y0, y1, rTop, rBot = rTop, seg = 16) {
    this.add(material, cyl(rTop, rBot, y1 - y0, seg), x, (y0 + y1) / 2, z);
  }
  /** cylinder along Z (facing +Z), centre (x,y,z) */
  cylZ(material, x, y, z, r, len, seg = 16) {
    this.add(material, cyl(r, r, len, seg), x, y, z, Math.PI / 2, 0, 0);
  }
  /** cylinder along X */
  cylX(material, x, y, z, r, len, seg = 12) {
    this.add(material, cyl(r, r, len, seg), x, y, z, 0, 0, Math.PI / 2);
  }
  /** tapered rod from point a=[x,y,z] (radius ra) to b (radius rb) */
  rod(material, a, b, ra, rb = ra, seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1));
    this.addM(material, cyl(rb, ra, len, seg), m);
  }
  /** build merged meshes into group */
  build(group, cast = true) {
    for (const [material, list] of this.parts) {
      const geos = list.map(({ geo, matrix, color }) => prep(geo, matrix, material, color));
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      for (const g of geos) if (g !== merged) g.dispose();
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast && !material.transparent && !material.userData.glow;
      mesh.receiveShadow = !material.transparent;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh);
    }
    return group;
  }
}

const _n = new THREE.Vector3();
function prep(geo, matrix, material, color) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  // keep only position / normal / uv (+color)
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (material.vertexColors) {
    const c = new THREE.Color(color ?? '#ffffff');
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  } else if (g.attributes.color) g.deleteAttribute('color');
  const s = material.userData.worldUV;
  if (s) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    // wood: grain (texture U) runs along the part's longest axis — boards, rails, legs, table tops
    let ex = 1, ey = 0, ez = 0;
    if (material.userData.kind === 'wood') {
      g.computeBoundingBox(); const b = g.boundingBox;
      ex = b.max.x - b.min.x; ey = b.max.y - b.min.y; ez = b.max.z - b.min.z;
    }
    const grainY = ey > ex * 1.15 && ey > ez * 1.15, grainZ = !grainY && ez > ex * 1.15;
    for (let i = 0; i < n; i++) {
      _n.set(N.getX(i), N.getY(i), N.getZ(i));
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (ay >= ax && ay >= az) { if (grainZ) U.setXY(i, z / s, x / s); else U.setXY(i, x / s, z / s); }
      else if (ax >= az) { if (grainY) U.setXY(i, y / s, z / s); else U.setXY(i, z / s, y / s); }
      else { if (grainY) U.setXY(i, y / s, x / s); else U.setXY(i, x / s, y / s); }
    }
    U.needsUpdate = true;
  }
  return g;
}
