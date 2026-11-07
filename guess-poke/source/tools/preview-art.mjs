// Render an art/text showcase in headless Chromium and save upscaled PNGs to /tmp/art/.
// Usage: node tools/preview-art.mjs [outDir=/tmp/art]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp/art';
fs.mkdirSync(OUT, { recursive: true });

const entry = `
import * as A from './art.js';
import * as T from './text.js';
const W = 270, H = 585;
function cv() { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
function silhouette(g, cx, cy) { // stand-in blob for a Pokémon silhouette
  g.fillStyle = '#141428';
  g.fillRect(cx - 30, cy - 20, 60, 50); g.fillRect(cx - 24, cy - 28, 48, 66); g.fillRect(cx - 34, cy - 50, 10, 30);
  g.fillRect(cx + 24, cy - 50, 10, 30); g.fillRect(cx + 30, cy - 4, 22, 8); g.fillRect(cx + 44, cy - 20, 8, 20);
}
function pageGame(t, glow, lift) {
  const [c, g] = cv();
  A.drawBackground(g, W, H, t);
  T.drawText(g, '我是誰？', W / 2, 10, { scale: 3, align: 'center', color: '#fff', outline: '#1b2a5c', shadow: '#05081a' });
  const inner = A.drawFrame(g, 20, 58, 230, 230, t, glow);
  silhouette(g, inner.x + inner.w / 2, inner.y + inner.h / 2 + 6);
  A.drawSlotHint(g, 135, 173, 70, t);
  A.drawStarMeter(g, W / 2 - 32, 300, 3, 5, t);
  const cw = 78, ch = 96, gap = 9, x0 = Math.round((W - cw * 3 - gap * 2) / 2);
  const states = [{}, { lift, hl: lift }, { press: 1 }];
  states.forEach((s, i) => {
    const f = A.drawCard(g, x0 + i * (cw + gap), 330, cw, ch, s);
    g.fillStyle = '#ffd84a'; g.fillRect(f.x + 10, f.y + 10, f.w - 20, f.h - 20);
    g.fillStyle = '#141428'; g.fillRect(f.x + 10, f.y + 10, f.w - 20, 1);
  });
  A.SPR.hand.draw(g, x0 + cw + gap + 40, 420, 0);
  A.drawButton(g, 60, 452, 150, 42, '開始', { color: 'yellow' });
  A.drawButton(g, 60, 500, 150, 42, '再來一次', { color: 'red', press: 1 });
  A.SPR.speaker_on.draw(g, W - 20, 8); A.SPR.speaker_off.draw(g, W - 20, 24);
  T.drawText(g, '是皮卡丘！', W / 2, 552, { scale: 2, align: 'center', color: '#ffd84a', outline: '#141428', shadow: '#05081a' });
  return c;
}
function pageSheet(t) {
  const [c, g] = cv();
  A.drawBackground(g, W, H, t);
  A.drawFrame(g, 12, 10, 110, 110, t, 0);
  A.drawFrame(g, 146, 10, 110, 110, t, 1);
  // cards: 4 states
  const st = [{}, { hl: 1 }, { lift: 1 }, { lift: 1, hl: 1 }, { press: 1 }];
  st.forEach((s, i) => A.drawCard(g, 8 + i * 52, 140, 46, 56, s));
  // sprites row
  let x = 8, y = 214;
  const show = (name, n, sc = 1) => { const s = A.SPR[name]; for (let f = 0; f < n; f++) { s.draw(g, x, y, f, sc); x += s.w * sc + 3; } x += 5; };
  show('star', 4); show('sparkle', 4); show('heart', 1); show('ball', 1); show('star_empty', 1);
  x = 8; y = 232; show('star', 4, 2); show('heart', 1, 2); show('ball', 1, 2);
  x = 8; y = 260; show('hand', 1, 1); show('hand', 1, 2); show('speaker_on', 1, 2); show('speaker_off', 1, 2); show('sparkle', 4, 2);
  for (let i = 0; i < 24; i++) A.SPR.confetti.draw(g, 150 + (i % 12) * 9, 280 + Math.floor(i / 12) * 8, i, i);
  A.drawStarMeter(g, 150, 302, 2, 5, t);
  // buttons
  A.drawButton(g, 8, 330, 80, 30, '開始', {});
  A.drawButton(g, 94, 330, 80, 30, '開始', { hover: true });
  A.drawButton(g, 180, 330, 80, 30, '開始', { press: 1 });
  A.drawButton(g, 8, 366, 120, 26, '下一個', { color: 'sky' });
  A.drawButton(g, 136, 366, 124, 26, '回到標題', { color: 'cream' });
  A.drawBox(g, 8, 400, 254, 34);
  T.drawText(g, '說明：下一個 提示 聲音 音樂 設定', 16, 410, { color: '#1b2a5c' });
  // text samples
  T.drawText(g, 'Abc 123 ?! 我是誰？ 是皮卡丘！', 8, 442, { color: '#fff' });
  T.drawText(g, '妙蛙種子 傑尼龜', 8, 456, { scale: 2, color: '#fff', outline: '#1b2a5c', shadow: '#05081a' });
  T.drawText(g, '我是誰？', 8, 486, { scale: 3, color: '#ffd84a', outline: '#141428', shadow: '#e8483b' });
  T.drawText(g, '開始', 262, 486, { scale: 3, align: 'right', color: '#fff', shadow: '#141428' });
  T.drawText(g, '好棒！\\n太厲害了！', 135, 528, { scale: 2, align: 'center', color: '#fff', outline: '#e8483b' });
  return c;
}
function up(c, k) { const o = document.createElement('canvas'); o.width = c.width * k; o.height = c.height * k; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); }
function bench() {
  const [c, g] = cv(); const res = {};
  const time = (name, fn) => { fn(0); const n = 500, t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); res[name] = ((performance.now() - t0) / n).toFixed(4); };
  time('drawBackground', i => A.drawBackground(g, W, H, i));
  time('drawFrame', i => A.drawFrame(g, 20, 58, 230, 230, i, 0));
  time('drawFrame glow', i => A.drawFrame(g, 20, 58, 230, 230, i, 1));
  time('drawCard', i => A.drawCard(g, 20, 330, 78, 96, { lift: (i % 10) / 10, hl: 1 }));
  time('drawSlotHint', i => A.drawSlotHint(g, 135, 173, 70, i));
  time('drawButton', i => A.drawButton(g, 75, 458, 120, 34, '開始', {}));
  time('drawStarMeter', i => A.drawStarMeter(g, 10, 10, 3, 5, i));
  time('drawText s3', i => T.drawText(g, '我是誰？', 135, 10, { scale: 3, align: 'center', outline: '#1b2a5c', shadow: '#000' }));
  time('SPR.star', i => A.SPR.star.draw(g, 10, 10, i));
  time('measure', i => T.measure('是皮卡丘！', 2));
  return res;
}
window.run = () => ({
  game: up(pageGame(120, 0, 0.6), 2), game4: up(pageGame(120, 0, 0.6), 4), glow: up(pageGame(260, 1, 1), 2),
  sheet: up(pageSheet(80), 2), sheet4: up(pageSheet(80), 4), bench: bench(),
});
`;

const out = await esbuild.build({
  stdin: { contents: entry, resolveDir: path.join(ROOT, 'src'), loader: 'js' },
  bundle: true, format: 'iife', write: false,
});
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await page.addScriptTag({ content: out.outputFiles[0].text });
const r = await page.evaluate(() => window.run());
await browser.close();
for (const k of ['game', 'game4', 'glow', 'sheet', 'sheet4']) {
  const f = path.join(OUT, `showcase-${k}.png`);
  fs.writeFileSync(f, Buffer.from(r[k].split(',')[1], 'base64'));
  console.log('wrote', f);
}
console.log('ms per call (cached):', r.bench);
if (errs.length) { console.error('ERRORS:', errs); process.exit(1); }
