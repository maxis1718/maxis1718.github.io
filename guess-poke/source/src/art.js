// Procedural pixel art (no external images). Everything is drawn with fillRect / ImageData
// into cached offscreen canvases and blitted at integer coords. Deterministic given args.
import { drawText, measure, LINE } from './text.js';

export const PAL = {
  navy: '#1b2a5c', deep: '#101a3c', sky: '#5ec4f0', skyLight: '#9fe0ff', white: '#ffffff',
  cream: '#fff6d8', red: '#e8483b', yellow: '#ffd84a', ink: '#141428',
  navyLight: '#2c4386', navyHi: '#3d5aa8', creamDark: '#ecd9a4', gold: '#f0a020', goldDark: '#b8661a',
  redDark: '#a8283a', pink: '#ff6c94', grey: '#c8d2ea',
};

// ---------------------------------------------------------------- helpers
function mk(w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  return new OffscreenCanvas(w, h);
}
const R = Math.round;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // 4x4, /16

const insetCache = new Map();
/** per-row horizontal inset for a pixel rounded corner of radius r */
function insets(r) {
  let t = insetCache.get(r);
  if (t) return t;
  t = [];
  for (let i = 0; i < r; i++) {
    const d = r - i - 0.5;
    t.push(Math.max(0, r - R(Math.sqrt(Math.max(0, r * r - d * d)))));
  }
  if (r >= 2) t[0] = Math.max(t[0], 2);
  insetCache.set(r, t);
  return t;
}
/** filled pixel rounded rect */
function rr(g, x, y, w, h, r, col) {
  if (w <= 0 || h <= 0) return;
  r = Math.max(0, Math.min(r, w >> 1, h >> 1));
  g.fillStyle = col;
  const t = insets(r);
  for (let i = 0; i < r; i++) {
    g.fillRect(x + t[i], y + i, w - 2 * t[i], 1);
    g.fillRect(x + t[i], y + h - 1 - i, w - 2 * t[i], 1);
  }
  g.fillRect(x, y + r, w, h - 2 * r);
}
/** is (px,py) inside rounded rect (x,y,w,h,r) */
function inRR(px, py, x, y, w, h, r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  r = Math.max(0, Math.min(r, w >> 1, h >> 1));
  const t = insets(r);
  const row = py - y < r ? py - y : (y + h - 1 - py < r ? y + h - 1 - py : -1);
  if (row < 0) return true;
  return px >= x + t[row] && px < x + w - t[row];
}
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

/** canvas from a char map */
function fromMap(rows, pal) {
  const h = rows.length, w = rows[0].length;
  const c = mk(w, h), g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = pal[rows[y][x]];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
/** auto-shade a '#' mask: e=edge, l=light (top/left inner), d=dark (bottom/right inner), f=fill */
function shadeMask(rows) {
  const h = rows.length, w = rows[0].length;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '.';
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) { s += '.'; continue; }
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) { s += 'e'; continue; }
      const eu = !on(x, y - 2) || !on(x - 1, y - 1), el = !on(x - 2, y);
      const ed = !on(x, y + 2) || !on(x + 1, y + 1), er = !on(x + 2, y);
      s += (eu || el) && !(ed && !eu) ? 'l' : (ed || er) ? 'd' : 'f';
    }
    out.push(s);
  }
  return out;
}
function poke(rows, pts, ch) {
  const a = rows.map(r => r.split(''));
  for (const [x, y] of pts) if (a[y] && a[y][x] !== undefined) a[y][x] = ch;
  return a.map(r => r.join(''));
}
function sprite(frames, extra = {}) {
  const c0 = frames[0];
  return Object.assign({
    w: c0.width, h: c0.height, frames: frames.length, img: frames,
    draw(ctx, x, y, frame = 0, scale = 1) {
      const n = frames.length;
      const c = frames[((Math.floor(frame) % n) + n) % n];
      if (scale === 1) ctx.drawImage(c, R(x), R(y));
      else ctx.drawImage(c, R(x), R(y), c.width * scale, c.height * scale);
    },
  }, extra);
}

// ---------------------------------------------------------------- sprites
const STAR_MASK = [
  '.....#.....',
  '....###....',
  '....###....',
  '.#########.',
  '###########',
  '.#########.',
  '..#######..',
  '..#######..',
  '.####.####.',
  '.###...###.',
  '.##.....##.',
];
function makeStar() {
  const base = shadeMask(STAR_MASK);
  const pal = { e: PAL.goldDark, f: PAL.yellow, l: '#fff1a0', d: PAL.gold, w: '#ffffff', s: '#fff8d0' };
  const glint = poke(base, [[4, 3], [4, 4], [3, 4]], 'w');
  const f0 = glint;
  const f1 = poke(base.map(r => r.replace(/f/g, 'l')), [[4, 3], [4, 4], [3, 4], [5, 4]], 'w');
  const f2 = poke(poke(glint, [[9, 0], [8, 1], [10, 1], [9, 2]], 's'), [[9, 1]], 'w');
  const f3 = poke(glint, [[9, 1]], 's');
  const star = sprite([f0, f1, f2, f3].map(m => fromMap(m, pal)));
  const empty = sprite([fromMap(base, { e: PAL.navyHi, f: PAL.deep, l: '#16224a', d: PAL.deep })]);
  return { star, empty };
}
function makeSparkle() {
  const W = '#ffffff', Y = '#fff2a0', S = PAL.skyLight;
  const frames = [
    ['.......', '.......', '...y...', '..ywy..', '...y...', '.......', '.......'],
    ['.......', '...y...', '...w...', '.ywwwy.', '...w...', '...y...', '.......'],
    ['...s...', '...y...', '..ywy..', 'sywwwys', '..ywy..', '...y...', '...s...'],
    ['.......', '.s...s.', '..y.y..', '...w...', '..y.y..', '.s...s.', '.......'],
  ];
  return sprite(frames.map(m => fromMap(m, { w: W, y: Y, s: S })));
}
function makeHeart() {
  const mask = [
    '.##...##.',
    '####.####',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ];
  let m = shadeMask(mask);
  m = poke(m, [[2, 2], [1, 2], [2, 1]], 'w');
  return sprite([fromMap(m, { e: '#b8285a', f: PAL.pink, l: '#ffa6c0', d: '#e8487a', w: '#ffffff' })]);
}
function makeBall() {
  const m = [
    '....kkkk....',
    '..kkrrrrkk..',
    '.krhhrrrrrk.',
    '.krhrrrrrdk.',
    'krrrkkkkrrdk',
    'kkkkkwwkkkkk',
    'kkkkkwwkkkkk',
    'kwwwkkkkwwsk',
    '.kwwwwwwwsk.',
    '.kwwwwwwssk.',
    '..kksssskk..',
    '....kkkk....',
  ];
  return sprite([fromMap(m, { k: PAL.ink, r: PAL.red, h: '#ffb0a0', d: PAL.redDark, w: '#ffffff', s: PAL.grey })]);
}
function makeHand() {
  // white glove pointing up; fingertip hotspot at (6,0)
  const m = [
    '.....kkk........',
    '....kwwwk.......',
    '....kwwgk.......',
    '....kwwgk.......',
    '....kwwgk.......',
    '....kwwgkkk.....',
    '....kwwgkwgkkk..',
    '....kwwgkwgkwgk.',
    '.kk.kwwgkwgkwgk.',
    'kwwkkwwwgwwgwwgk',
    'kwwwkwwwwwwwwwgk',
    'kwwwwwwwwwwwwwgk',
    '.kwwwwwwwwwwwwgk',
    '.kgwwwwwwwwwwggk',
    '..kggwwwwwwwggk.',
    '...kkkkkkkkkkk..',
    '...kcccccccccsk.',
    '...kkkkkkkkkkkk.',
  ];
  for (const r of m) if (r.length !== 16) throw new Error('hand map');
  return sprite([fromMap(m, { k: PAL.ink, w: '#ffffff', g: PAL.grey, c: PAL.skyLight, s: PAL.sky })], { hx: 6, hy: 0 });
}
function withShadow(rows, sh = 'z') {
  const a = rows.map(r => r.split(''));
  for (let y = rows.length - 1; y >= 1; y--) for (let x = 0; x < a[0].length; x++)
    if (a[y][x] === '.' && rows[y - 1][x] !== '.' && rows[y - 1][x] !== sh) a[y][x] = sh;
  return a.map(r => r.join(''));
}
function makeSpeakers() {
  const on = [
    '............',
    '.....w......',
    '....ww...w..',
    '...www....w.',
    '.wwwww.w..w.',
    '.wwwww..w..w',
    '.wwwww..w..w',
    '.wwwww.w..w.',
    '...www....w.',
    '....ww...w..',
    '.....w......',
    '............',
  ];
  const off = [
    '............',
    '.....w......',
    '....ww......',
    '...www......',
    '.wwwww.x...x',
    '.wwwww..x.x.',
    '.wwwww...x..',
    '.wwwww..x.x.',
    '...www.x...x',
    '....ww......',
    '.....w......',
    '............',
  ];
  const pal = { w: '#ffffff', x: '#ff8a7a', z: PAL.ink };
  return { on: sprite([fromMap(withShadow(on), pal)]), off: sprite([fromMap(withShadow(off), pal)]) };
}
const CONFETTI_COLORS = [PAL.red, PAL.yellow, PAL.sky, '#ffffff', PAL.pink, '#7ee07a'];
const CONFETTI_SHAPES = [ // spin frames: flat, tilted, edge-on, tilted other way
  [[0, 0, 3, 2]], [[0, 0, 2, 1], [1, 1, 2, 1]], [[1, 0, 1, 2]], [[1, 0, 2, 1], [0, 1, 2, 1]],
];

let S = null;
function sprites() {
  if (S) return S;
  const st = makeStar(), sp = makeSpeakers();
  S = {
    star: st.star, star_empty: st.empty, sparkle: makeSparkle(), heart: makeHeart(), hand: makeHand(),
    speaker_on: sp.on, speaker_off: sp.off, ball: makeBall(),
    confetti: {
      w: 3, h: 2, frames: 4, colors: CONFETTI_COLORS,
      /** frame = spin phase (0..3), color = index into colors or a css colour */
      draw(ctx, x, y, frame = 0, color = 0, scale = 1) {
        ctx.fillStyle = typeof color === 'number' ? CONFETTI_COLORS[((color % 6) + 6) % 6] : color;
        const sh = CONFETTI_SHAPES[((Math.floor(frame) % 4) + 4) % 4];
        x = R(x); y = R(y);
        for (const [a, b, w, h] of sh) ctx.fillRect(x + a * scale, y + b * scale, w * scale, h * scale);
      },
    },
  };
  return S;
}
/** SPR.<name>: {w,h,frames,img[],draw(ctx,x,y,frame=0,scale=1)}; built lazily on first access. */
export const SPR = new Proxy({}, {
  get(_, k) { return sprites()[k]; },
  has(_, k) { return k in sprites(); },
  ownKeys() { return Reflect.ownKeys(sprites()); },
  getOwnPropertyDescriptor(_, k) { return { value: sprites()[k], enumerable: true, configurable: true }; },
});

// ---------------------------------------------------------------- background
const bgCache = { key: '', c: null, dots: null };
const BG_PERIOD = 16;
function buildBg(W, H) {
  const cw = W + BG_PERIOD, c = mk(cw, H), g = c.getContext('2d');
  const img = g.createImageData(cw, H), d = img.data;
  const lv = ['#17244f', '#142048', '#121c41', '#0f1839', '#0c1431'].map(hex);
  for (let y = 0; y < H; y++) {
    const v = Math.min(1, Math.max(0, (y / H) * 1.15 - 0.05)) * (lv.length - 1);
    for (let x = 0; x < cw; x++) {
      const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const i0 = Math.min(lv.length - 1, Math.floor(v) + ((v % 1) > th ? 1 : 0));
      const col = lv[i0];
      const stripe = ((x + y) % BG_PERIOD) < 6;
      const k = (y * cw + x) * 4;
      d[k] = col[0] + (stripe ? 5 : 0); d[k + 1] = col[1] + (stripe ? 7 : 0); d[k + 2] = col[2] + (stripe ? 13 : 0); d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // deterministic twinkle dots
  const dots = [];
  let s = (W * 73856093) ^ (H * 19349663);
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
  const n = Math.round(W * H / 2600);
  for (let i = 0; i < n; i++) dots.push([Math.floor(rnd() * W), Math.floor(rnd() * H), Math.floor(rnd() * 400), 0.6 + rnd() * 0.8]);
  return { c, dots };
}
/** Full-screen animated background. t = frames. */
export function drawBackground(ctx, W, H, t) {
  const key = W + 'x' + H;
  if (bgCache.key !== key) { Object.assign(bgCache, buildBg(W, H)); bgCache.key = key; }
  const ox = Math.floor(t / 6) % BG_PERIOD;
  ctx.drawImage(bgCache.c, -ox, 0);
  // twinkling dots (slow): mostly dim 1px, occasionally a tiny plus
  for (const [x, y, ph, sp] of bgCache.dots) {
    const p = ((t * sp + ph) % 400) / 400;           // 0..1 cycle
    if (p < 0.55) { ctx.fillStyle = '#2c3f7c'; ctx.fillRect(x, y, 1, 1); continue; }
    const k = Math.sin((p - 0.55) / 0.45 * Math.PI);  // 0..1..0
    if (k > 0.75) {
      ctx.fillStyle = '#5b78c4'; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = '#c8dcff'; ctx.fillRect(x, y, 1, 1);
    } else { ctx.fillStyle = k > 0.35 ? '#7f9ad8' : '#3d5598'; ctx.fillRect(x, y, 1, 1); }
  }
}

// ---------------------------------------------------------------- "who's that" frame
const FR = 9;           // outer corner radius
const FB = 8;           // border thickness to the panel (ink 1 + navy 5 + white 2)
const frameCache = new Map();
function buildFrame(w, h) {
  const M = 4; // margin for drop shadow
  const c = mk(w + M, h + M), g = c.getContext('2d');
  // drop shadow
  g.globalAlpha = 0.55; rr(g, 0, 3, w, h, FR, '#05081a'); g.globalAlpha = 1;
  // ink outline + bevelled navy border
  rr(g, 0, 0, w, h, FR, '#0a1030');
  rr(g, 1, 1, w - 2, h - 2, FR - 1, '#121d46');           // bottom dark
  rr(g, 1, 1, w - 2, h - 3, FR - 1, PAL.navyHi);           // top highlight
  rr(g, 1, 2, w - 2, h - 4, FR - 1, PAL.navyLight);
  rr(g, 2, 3, w - 4, h - 6, FR - 2, PAL.navy);             // navy body
  rr(g, 5, 5, w - 10, h - 10, FR - 5, '#0e1638');          // ink-ish groove
  // white inner line (2px) with a light-blue lower bevel
  rr(g, 6, 6, w - 12, h - 12, FR - 6, '#cfe6ff');
  rr(g, 6, 6, w - 12, h - 13, FR - 6, '#ffffff');
  // panel with dithered radial light
  const px = FB, py = FB, pw = w - FB * 2, ph = h - FB * 2, pr = Math.max(2, FR - FB);
  const img = g.getImageData(px, py, pw, ph), d = img.data;
  const lv = ['#3aa6e2', '#4ab6ea', PAL.sky, '#7ed2f6', PAL.skyLight, '#c2edff'].map(hex);
  const cx = pw / 2, cy = ph * 0.44;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    if (!inRR(x, y, 0, 0, pw, ph, pr)) continue;
    const dx = (x + 0.5 - cx) / (pw * 0.62), dy = (y + 0.5 - cy) / (ph * 0.62);
    let v = 1 - Math.sqrt(dx * dx + dy * dy);
    v = Math.max(0, Math.min(1, v * 1.25)) * (lv.length - 1);
    const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const col = lv[Math.min(lv.length - 1, Math.floor(v) + ((v % 1) > th ? 1 : 0))];
    const k = (y * pw + x) * 4;
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
  }
  g.putImageData(img, px, py);
  // inner shadow line along the panel top + left (depth)
  g.fillStyle = '#3aa0dc';
  const t = insets(pr);
  g.fillRect(px + t[0], py, pw - 2 * t[0], 1);
  g.fillRect(px, py + pr, 1, ph - 2 * pr);
  for (let i = 1; i < pr; i++) g.fillRect(px + t[i], py + i, 1, 1);
  // golden glow overlays (drawn with alpha by drawFrame)
  const G = 7, gc = mk(w + G * 2, h + G * 2), gg = gc.getContext('2d');
  rr(gg, 0, 0, w + G * 2, h + G * 2, FR + G, PAL.yellow);   // outer soft halo (checker-dithered below)
  gg.globalCompositeOperation = 'destination-out';
  rr(gg, 2, 2, w + G * 2 - 4, h + G * 2 - 4, FR + G - 2, '#000');
  gg.globalCompositeOperation = 'source-over';
  {
    const id = gg.getImageData(0, 0, gc.width, gc.height), dd = id.data;
    for (let y = 0; y < gc.height; y++) for (let x = 0; x < gc.width; x++) if ((x + y) & 1) dd[(y * gc.width + x) * 4 + 3] = 0;
    gg.putImageData(id, 0, 0);
  }
  rr(gg, 3, 3, w + 8, h + 8, FR + 4, '#fff0b0');
  rr(gg, 4, 4, w + 6, h + 6, FR + 3, PAL.yellow);
  rr(gg, 6, 6, w + 2, h + 2, FR + 1, '#ffb52a');
  gg.globalCompositeOperation = 'destination-out';
  rr(gg, G, G, w, h, FR, '#000');                          // only the rim outside the frame
  const ic = mk(w, h), ig = ic.getContext('2d');           // inner rim recolour (white line -> gold)
  rr(ig, 6, 6, w - 12, h - 12, FR - 6, PAL.yellow);
  ig.globalCompositeOperation = 'destination-out';
  rr(ig, FB, FB, pw, ph, pr, '#000');
  return { c, gc, ic, inner: { x: px, y: py, w: pw, h: ph } };
}
/**
 * The "who's that" panel. glow 0..1 adds a pulsing golden rim. Returns the inner panel rect
 * {x,y,w,h} (buffer px) for placing the silhouette.
 */
export function drawFrame(ctx, x, y, w, h, t, glow = 0) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const key = w + 'x' + h;
  let f = frameCache.get(key);
  if (!f) { f = buildFrame(w, h); frameCache.set(key, f); }
  ctx.drawImage(f.c, x, y);
  if (glow > 0.01) {
    const pa = ctx.globalAlpha;
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.18);
    ctx.globalAlpha = pa * Math.min(1, glow) * pulse;
    ctx.drawImage(f.gc, x - 7, y - 7);
    ctx.globalAlpha = pa * Math.min(1, glow);
    ctx.drawImage(f.ic, x, y);
    ctx.globalAlpha = pa;
  }
  // corner balls with a gentle idle bob
  const ball = sprites().ball;
  const bs = w >= 200 ? 2 : 1, bw = ball.w * bs, ins = 4;
  const pts = [[x + ins, y + ins], [x + w - ins, y + ins], [x + ins, y + h - ins], [x + w - ins, y + h - ins]];
  for (let i = 0; i < 4; i++) {
    const bob = R(Math.sin(t * 0.05 + i * 1.7) * 1.2);
    ball.draw(ctx, R(pts[i][0] - bw / 2), R(pts[i][1] - bw / 2) + bob, 0, bs);
  }
  return { x: x + f.inner.x, y: y + f.inner.y, w: f.inner.w, h: f.inner.h };
}

// ---------------------------------------------------------------- choice cards
const CR = 6;
const cardCache = new Map();
function buildCard(w, h) {
  const c = mk(w, h), g = c.getContext('2d');
  rr(g, 0, 0, w, h, CR, PAL.ink);
  rr(g, 1, 1, w - 2, h - 2, CR - 1, '#0f183a');            // navy border dark bottom
  rr(g, 1, 1, w - 2, h - 3, CR - 1, PAL.navyHi);           // highlight top
  rr(g, 1, 2, w - 2, h - 4, CR - 1, PAL.navy);
  rr(g, 4, 4, w - 8, h - 8, CR - 4, '#d9c28a');            // face bottom bevel (dark)
  rr(g, 4, 4, w - 8, h - 10, CR - 4, PAL.creamDark);
  rr(g, 4, 4, w - 8, h - 11, CR - 4, PAL.cream);
  g.fillStyle = '#ffffff';                                  // top-left gloss
  g.fillRect(4 + 2, 5, w - 8 - 4 - 8, 1);
  g.fillRect(5, 6, 1, Math.max(0, h - 11 - 8));
  g.fillRect(w - 11, 5, 2, 1);
  const sh = mk(w, h), sg = sh.getContext('2d');
  rr(sg, 0, 0, w, h, CR, '#04071a');
  const rim = mk(w + 4, h + 4), rg = rim.getContext('2d');
  rr(rg, 0, 0, w + 4, h + 4, CR + 2, '#fff2a8');
  rr(rg, 1, 1, w + 2, h + 2, CR + 1, PAL.yellow);
  rr(rg, 2, 2, w, h, CR, PAL.ink);
  rr(rg, 3, 3, w - 2, h - 2, CR - 1, '#ffb52a');
  rr(rg, 3, 3, w - 2, h - 3, CR - 1, PAL.yellow);
  rr(rg, 4, 4, w - 4, h - 5, CR - 2, '#fff0a0');
  rr(rg, 5, 5, w - 6, h - 7, CR - 3, PAL.yellow);
  rg.globalCompositeOperation = 'destination-out';
  rr(rg, 6, 6, w - 8, h - 10, CR - 4, '#000');
  return { c, sh, rim };
}
/**
 * Choice card background. state {lift 0..1, hl 0..1, press 0..1}.
 * The card body is drawn at y - round(lift*4) + round(press*2); the shadow stays on the ground.
 * Returns the content rect {x,y,w,h} of the cream face (already offset), for drawing the Pokémon.
 */
export function drawCard(ctx, x, y, w, h, state = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const lift = state.lift || 0, hl = state.hl || 0, press = state.press || 0;
  const key = w + 'x' + h;
  let cd = cardCache.get(key);
  if (!cd) { cd = buildCard(w, h); cardCache.set(key, cd); }
  const L = R(lift * 4), P = R(press * 2);
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * (0.5 - lift * 0.12);
  ctx.drawImage(cd.sh, x + (lift > 0.5 ? 1 : 0), y + 3 - P);
  if (L > 2) { ctx.globalAlpha = pa * 0.25; ctx.drawImage(cd.sh, x - 1, y + 2, w + 2, h + 2); }
  ctx.globalAlpha = pa;
  const cy = y - L + P;
  ctx.drawImage(cd.c, x, cy);
  if (hl > 0.01) {
    ctx.globalAlpha = pa * Math.min(1, hl * 1.6);
    ctx.drawImage(cd.rim, x - 2, cy - 2);
    ctx.globalAlpha = pa;
  }
  return { x: x + 5, y: cy + 5, w: w - 10, h: h - 13 };
}

// ---------------------------------------------------------------- slot hint
/** Pulsing corner brackets + faint marching dashed square around (cx,cy), half-size r. */
export function drawSlotHint(ctx, cx, cy, r, t) {
  cx = R(cx); cy = R(cy); r = R(r);
  const p = (Math.sin(t * 0.07) + 1) / 2;
  const o = R(p * 2), a = 0.45 + 0.4 * p;
  const x0 = cx - r - o, y0 = cy - r - o, x1 = cx + r + o, y1 = cy + r + o;
  const L = Math.max(6, R(r * 0.32));
  const pa = ctx.globalAlpha;
  // dashed edges
  ctx.globalAlpha = pa * a * 0.55;
  ctx.fillStyle = '#ffffff';
  const ph = Math.floor(t / 4) % 8;
  for (let s = x0 + L + 2 + ph - 8; s < x1 - L - 2; s += 8) {
    const a0 = Math.max(s, x0 + L + 2), a1 = Math.min(s + 4, x1 - L - 2);
    if (a1 > a0) { ctx.fillRect(a0, y0, a1 - a0, 1); ctx.fillRect(x1 - (a1 - x0) + 1, y1, a1 - a0, 1); }
  }
  for (let s = y0 + L + 2 + ph - 8; s < y1 - L - 2; s += 8) {
    const a0 = Math.max(s, y0 + L + 2), a1 = Math.min(s + 4, y1 - L - 2);
    if (a1 > a0) { ctx.fillRect(x1, a0, 1, a1 - a0); ctx.fillRect(x0, y1 - (a1 - y0) + 1, 1, a1 - a0); }
  }
  // corner brackets (2px, with ink shadow)
  ctx.globalAlpha = pa * a;
  const br = (col, d) => {
    ctx.fillStyle = col;
    ctx.fillRect(x0 + d, y0 + d, L, 2); ctx.fillRect(x0 + d, y0 + d, 2, L);
    ctx.fillRect(x1 - L + 1 + d, y0 + d, L, 2); ctx.fillRect(x1 - 1 + d, y0 + d, 2, L);
    ctx.fillRect(x0 + d, y1 - 1 + d, L, 2); ctx.fillRect(x0 + d, y1 - L + 1 + d, 2, L);
    ctx.fillRect(x1 - L + 1 + d, y1 - 1 + d, L, 2); ctx.fillRect(x1 - 1 + d, y1 - L + 1 + d, 2, L);
  };
  br(PAL.ink, 1);
  br('#ffffff', 0);
  ctx.globalAlpha = pa;
}

// ---------------------------------------------------------------- buttons
const BTN = {
  yellow: { face: PAL.yellow, light: '#fff3a8', dark: '#f0b42a', lip: '#c47a1a', text: '#ffffff', outline: '#7a3e10' },
  red: { face: PAL.red, light: '#ff9c8c', dark: '#c8303a', lip: '#7e1c2c', text: '#ffffff', outline: '#5a1020' },
  sky: { face: PAL.sky, light: '#c0f0ff', dark: '#3a9ad8', lip: '#20589a', text: '#ffffff', outline: PAL.navy },
  cream: { face: PAL.cream, light: '#ffffff', dark: PAL.creamDark, lip: '#b89a5a', text: PAL.navy, outline: null },
};
const btnCache = new Map();
const BR = 7, LIP = 4;
function buildButton(w, h, col, pressed, hover) {
  const c = mk(w, h + 2), g = c.getContext('2d'), k = BTN[col] || BTN.yellow;
  const P = pressed ? 2 : 0;
  g.globalAlpha = 0.5; rr(g, 0, 2, w, h, BR, '#04071a'); g.globalAlpha = 1;   // ground shadow
  rr(g, 0, P, w, h - P, BR, PAL.ink);
  rr(g, 1, P + 1, w - 2, h - P - 2, BR - 1, k.lip);                           // lip (depth)
  const fh = h - 2 - LIP + (pressed ? 2 : 0) - P;                             // face height
  rr(g, 1, P + 1, w - 2, fh, BR - 1, k.dark);
  rr(g, 1, P + 1, w - 2, fh - 2, BR - 1, k.light);
  rr(g, 1, P + 2, w - 2, fh - 3, BR - 1, hover ? k.light : k.face);
  if (hover) rr(g, 2, P + 3, w - 4, fh - 5, BR - 2, k.face);
  // dithered soft lower shade on face
  g.fillStyle = k.dark;
  for (let y = P + fh - 4; y < P + fh - 2; y++) for (let x = 1 + BR; x < w - 1 - BR; x++)
    if (((x + y) & 1) === 0 && (y === P + fh - 3 || (x & 3) === 0)) g.fillRect(x, y, 1, 1);
  // gloss
  g.fillStyle = '#ffffff';
  g.fillRect(BR, P + 3, 3, 1); g.fillRect(BR - 3, P + 4, 1, 2); g.fillRect(BR + 4, P + 3, 1, 1);
  return { c, faceY: P + 1, faceH: fh };
}
/**
 * Big pixel button. state {press 0..1|bool, hover bool, color:'yellow'|'red'|'sky'|'cream', scale}.
 * Label auto-scales (1..3) to fit. Press moves the face 2px down.
 */
export function drawButton(ctx, x, y, w, h, label, state = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const pressed = (state.press || 0) > 0.5, hover = !!state.hover && !pressed;
  const col = state.color || 'yellow';
  const key = w + 'x' + h + col + (pressed ? 'p' : '') + (hover ? 'h' : '');
  let b = btnCache.get(key);
  if (!b) { b = buildButton(w, h, col, pressed, hover); btnCache.set(key, b); }
  ctx.drawImage(b.c, x, y);
  if (label != null && label !== '') {
    const k = BTN[col] || BTN.yellow;
    const tw = measure(label, 1);
    let sc = state.scale || 3;
    if (!state.scale) while (sc > 1 && (13 * sc + 6 > b.faceH || tw * sc + 16 > w)) sc--;
    const ty = y + b.faceY + Math.floor((b.faceH - 2) / 2) - 6 * sc;  // CJK ink rows 1..11 -> centre row 6
    drawText(ctx, label, x + w / 2, ty, { scale: sc, align: 'center', color: k.text, outline: k.outline, shadow: null });
  }
}

// ---------------------------------------------------------------- star meter
/** Row of `max` star slots (13px pitch), `n` filled & twinkling. Returns total width. */
export function drawStarMeter(ctx, x, y, n, max, t) {
  const sp = sprites();
  x = R(x); y = R(y);
  for (let i = 0; i < max; i++) {
    const px = x + i * 13;
    if (i < n) {
      const ph = (Math.floor(t / 5) + i * 9) % 30;
      sp.star.draw(ctx, px, y, ph < 4 ? ph : 0);
    } else sp.star_empty.draw(ctx, px, y);
  }
  return max > 0 ? max * 13 - 2 : 0;
}

// ---------------------------------------------------------------- generic dialog box (FRLG style)
const boxCache = new Map();
/** Message/menu box: cream (default) or 'navy'. Cached per size. */
export function drawBox(ctx, x, y, w, h, style = 'cream') {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const key = w + 'x' + h + style;
  let c = boxCache.get(key);
  if (!c) {
    c = mk(w, h + 2); const g = c.getContext('2d');
    g.globalAlpha = 0.5; rr(g, 0, 2, w, h, 6, '#04071a'); g.globalAlpha = 1;
    rr(g, 0, 0, w, h, 6, PAL.ink);
    if (style === 'navy') {
      rr(g, 1, 1, w - 2, h - 2, 5, PAL.navyHi); rr(g, 2, 2, w - 4, h - 4, 4, PAL.ink); rr(g, 3, 3, w - 6, h - 6, 3, PAL.navy);
    } else {
      rr(g, 1, 1, w - 2, h - 2, 5, PAL.sky); rr(g, 3, 3, w - 6, h - 6, 3, '#ffffff');
      rr(g, 4, 4, w - 8, h - 8, 2, PAL.cream);
    }
    boxCache.set(key, c);
  }
  ctx.drawImage(c, x, y);
}
