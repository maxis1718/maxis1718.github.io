// Bitmap pixel text (Cubic 11 glyphs baked by tools/cjk.py into font.js).
// 1 font px = `scale` buffer px. Rendered strings are cached on offscreen canvases.
import { GLYPHS } from './font.js';

export const LINE = 12;          // nominal line box height (font px)
const LINE_ADV = 14;             // line advance for multi-line strings ('\n')
const EM = 14;                   // baked em box height (ascent 10 + descent 4)
const MISSING_ADV = 6;

const gcache = new Map();
function glyph(ch) {
  let g = gcache.get(ch);
  if (g !== undefined) return g;
  const s = GLYPHS[ch];
  if (!s) { gcache.set(ch, null); return null; }
  const p = s.split(',');
  const w = +p[3], h = +p[4];
  const bits = new Uint8Array(w * h);
  if (w * h) {
    const bin = atob(p[5]);
    for (let i = 0; i < w * h; i++) bits[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  }
  g = { adv: +p[0], xo: +p[1], yo: +p[2], w, h, bits };
  gcache.set(ch, g);
  return g;
}

function lineWidth(line) {
  let w = 0;
  for (const ch of line) { const g = glyph(ch); w += g ? g.adv : MISSING_ADV; }
  return w;
}

/** Width in buffer px of `str` (widest line if multi-line). */
export function measure(str, scale = 1) {
  str = String(str);
  let m = 0;
  for (const line of str.split('\n')) m = Math.max(m, lineWidth(line));
  return m * scale;
}

function mkCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  return new OffscreenCanvas(w, h);
}

const PAD = 1; // font px of padding around the bitmap (outline / shadow room)
const scache = new Map();
const SCACHE_MAX = 400;

function build(str, scale, color, outline, shadow) {
  const lines = str.split('\n');
  const widths = lines.map(lineWidth);
  const fw = Math.max(1, ...widths) + PAD * 2;
  const fh = (lines.length - 1) * LINE_ADV + EM + PAD * 2 + 1;
  // fill mask at font resolution
  const fill = new Uint8Array(fw * fh);
  lines.forEach((line, li) => {
    let pen = PAD;
    const top = PAD + li * LINE_ADV;
    for (const ch of line) {
      const g = glyph(ch);
      if (!g) { pen += MISSING_ADV; continue; }
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        if (!g.bits[y * g.w + x]) continue;
        const X = pen + g.xo + x, Y = top + g.yo + y;
        if (X >= 0 && X < fw && Y >= 0 && Y < fh) fill[Y * fw + X] = 1;
      }
      pen += g.adv;
    }
  });
  // layer ids: 0 empty, 1 shadow, 2 outline, 3 fill
  const id = new Uint8Array(fw * fh);
  const at = (m, x, y) => (x >= 0 && y >= 0 && x < fw && y < fh ? m[y * fw + x] : 0);
  let body = fill;
  if (outline) {
    body = new Uint8Array(fw * fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) if (at(fill, x + dx, y + dy)) { on = 1; break; }
      body[y * fw + x] = on;
    }
  }
  for (let i = 0; i < fw * fh; i++) {
    const x = i % fw, y = (i / fw) | 0;
    if (fill[i]) id[i] = 3;
    else if (outline && body[i]) id[i] = 2;
    else if (shadow && at(body, x, y - 1)) id[i] = 1;
  }
  const cols = [null, shadow, outline, color];
  const c = mkCanvas(fw * scale, fh * scale);
  const g = c.getContext('2d');
  for (let y = 0; y < fh; y++) {
    let x = 0;
    while (x < fw) {
      const v = id[y * fw + x];
      let e = x + 1;
      while (e < fw && id[y * fw + e] === v) e++;
      if (v) { g.fillStyle = cols[v]; g.fillRect(x * scale, y * scale, (e - x) * scale, scale); }
      x = e;
    }
  }
  return { c, widths, w: fw - PAD * 2 };
}

/**
 * Draw pixel text. y = top of the 12px line box (times scale).
 * opts: {scale=1, color='#fff', align:'left'|'center'|'right', outline:color|null, shadow:color|null, alpha=1}
 * Multi-line strings ('\n') advance 14*scale per line; lines are aligned individually.
 * Returns the drawn width in buffer px.
 */
export function drawText(ctx, str, x, y, opts = {}) {
  str = String(str);
  if (str.indexOf('\n') >= 0 && opts.align && opts.align !== 'left') {
    let m = 0;
    str.split('\n').forEach((ln, i) => {
      m = Math.max(m, drawText(ctx, ln, x, y + i * LINE_ADV * Math.max(1, Math.round(opts.scale || 1)), opts));
    });
    return m;
  }
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const color = opts.color || '#fff';
  const outline = opts.outline || null;
  const shadow = opts.shadow || null;
  const align = opts.align || 'left';
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0 || !str) return 0;
  const key = str + '\u0000' + scale + color + '|' + outline + '|' + shadow;
  let e = scache.get(key);
  if (!e) {
    e = build(str, scale, color, outline, shadow);
    if (scache.size >= SCACHE_MAX) scache.delete(scache.keys().next().value);
    scache.set(key, e);
  }
  const pa = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = pa * alpha;
  const W = e.w * scale;
  const X = Math.round(align === 'center' ? x - W / 2 : align === 'right' ? x - W : x);
  const Y = Math.round(y);
  const p = PAD * scale;
  ctx.drawImage(e.c, X - p, Y - p);
  if (alpha !== 1) ctx.globalAlpha = pa;
  return W;
}
