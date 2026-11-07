// Headless harness: node tools/play.mjs <scenario> [outdir] [device]
// scenarios: tour (screens of every phase), drag (real touch drag via CDP), wrong, long (30 rounds bot), perf
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const scenario = process.argv[2] || 'tour';
const out = process.argv[3] || '/tmp/gp';
const dev = process.argv[4] || 'iphone';
mkdirSync(out, { recursive: true });
const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  pro: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch();
const ctxb = await browser.newContext(DEVICES[dev]);
const page = await ctxb.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const html = readFileSync('dist/index.html', 'utf8');
await page.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.startsWith('https://game.test/')) return route.fulfill({ body: html, contentType: 'text/html' });
  const m = u.match(/official-artwork\/(\d+)\.png/);
  if (m) {
    const f = `.cache/art/${m[1]}.png`;
    if (existsSync(f)) return route.fulfill({ body: readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
  }
  return route.abort();
});
await page.goto('https://game.test/');
await page.waitForTimeout(800);

const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
const ev = (e) => page.evaluate((e) => window.__gp.input.push(e), e);
const step = (n = 1) => page.evaluate((n) => window.__gp.step(n), n);
const info = () => page.evaluate(() => {
  const g = window.__gp.game;
  return { scene: g.scene, ans: g.ans, round: g.round, correct: g.correct, meter: g.meter, revealed: g.revealed,
    cards: g.cards.map((c) => ({ id: c.id, state: c.state, x: Math.round(c.x), y: Math.round(c.y), hx: c.hx, hy: c.hy })),
    frame: g.L.frame, W: window.__gp.W, H: window.__gp.H, S: window.__gp.S, stats: g.stats };
});
async function waitScene(s, max = 400) {
  for (let i = 0; i < max; i++) { const I = await info(); if (I.scene === s && (s !== 'round' || I.cards.every((c) => c.state === 'idle'))) return I; await step(1); await page.waitForTimeout(5); }
  throw new Error('timeout waiting ' + s + ' ' + JSON.stringify(await info()));
}
async function dragTo(card, tx, ty, n = 20, shots = null) {
  await ev({ t: 'down', x: card.x, y: card.y, time: 0 });
  await step(1);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    await ev({ t: 'move', x: card.x + (tx - card.x) * k, y: card.y + (ty - card.y) * k });
    await step(1);
    if (shots && shots.includes(i)) await shot(shots.prefix + '_' + i);
  }
}

await page.evaluate(() => window.__gp.manual(true));
await step(30);

if (scenario === 'tour') {
  await shot('01_title');
  await ev({ t: 'down', x: 10, y: 10 }); await ev({ t: 'up', x: 10, y: 10 }); // tap anywhere -> start (not a parade mon hopefully)
  await step(1);
  let I = await waitScene('round');
  await step(8); await shot('02_round_enter');
  await step(40); await shot('03_round');
  // drag a wrong card to the frame
  const wrong = I.cards.find((c) => c.id !== I.ans);
  await dragTo(wrong, I.frame.cx, I.frame.cy + 20, 16, Object.assign([16], { prefix: '04_wrong_drag' }));
  await ev({ t: 'up', x: I.frame.cx, y: I.frame.cy + 20, time: 999 });
  await step(6); await shot('05_wrong_release');
  await step(40);
  I = await info();
  const right = I.cards.find((c) => c.id === I.ans);
  const sh = Object.assign([6, 10, 13], { prefix: '06_right_drag' });
  await dragTo(right, I.frame.cx, I.frame.cy + I.frame.h * 0.62, 14, sh);
  I = await info(); console.log('after drag', I.cards.map((c) => c.state), 'revealed', I.revealed);
  await ev({ t: 'up', x: I.frame.cx, y: I.frame.cy, time: 9999 });
  for (const n of [4, 10, 20, 40, 70, 110, 140]) { await step(n - (await page.evaluate(() => window.__gp.game.rev ? window.__gp.game.rev.t : 0)) | 0); await shot('07_reveal_' + n); }
  I = await waitScene('round', 800);
  await step(10); await shot('08_round2');
  // idle hint
  await step(800); await shot('09_idle_hint');
  console.log(JSON.stringify(await info()));
}

if (scenario === 'long') {
  await ev({ t: 'down', x: 10, y: 10 }); await ev({ t: 'up', x: 10, y: 10 });
  const seen = [];
  for (let r = 0; r < Number(process.env.ROUNDS || 30); r++) {
    let I = await waitScene('round', 1500);
    seen.push(I.ans + '/' + I.cards.length);
    if ([0, 5, 10, 12].includes(r)) { await step(20); await shot('long_r' + r); }
    if (Math.random() < 0.3) { // a wrong tap first
      const w = I.cards.find((c) => c.id !== I.ans);
      await ev({ t: 'down', x: w.x, y: w.y }); await step(2); await ev({ t: 'up', x: w.x, y: w.y }); await step(50);
    }
    I = await info();
    const c = I.cards.find((c) => c.id === I.ans);
    if (Math.random() < 0.5) { await ev({ t: 'down', x: c.x, y: c.y }); await step(2); await ev({ t: 'up', x: c.x, y: c.y }); }
    else { await dragTo(c, I.frame.cx + (Math.random() - 0.5) * 60, I.frame.cy + I.frame.h * 0.3, 12); await ev({ t: 'up', x: I.frame.cx, y: I.frame.cy }); }
    await step(5);
    if (r === 4) { await step(40); await shot('long_big5'); }
  }
  const I = await info();
  console.log('rounds', seen.length, 'answers', seen.join(','), 'stats', JSON.stringify(I.stats), 'meter', I.meter);
}

if (scenario === 'drag') {
  // real-time, real touch events through CDP (not the queue) to validate pointer plumbing
  await page.evaluate(() => window.__gp.manual(false));
  const cdp = await ctxb.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const toCss = async (bx, by) => page.evaluate(([bx, by]) => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + bx / window.__gp.W * r.width, r.top + by / window.__gp.H * r.height]; }, [bx, by]);
  let [x, y] = await toCss(10, 10);
  await touch('touchStart', x, y); await touch('touchEnd', x, y);
  await page.waitForTimeout(2500);
  let I = await info();
  console.log('scene', I.scene);
  const c = I.cards.find((c) => c.id === I.ans);
  const [sx, sy] = await toCss(c.x, c.y), [ex, ey] = await toCss(I.frame.cx, I.frame.cy + I.frame.h * 0.3);
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 25; i++) { await touch('touchMove', sx + (ex - sx) * i / 25, sy + (ey - sy) * i / 25); await page.waitForTimeout(16); }
  await shot('drag_live');
  await touch('touchEnd', ex, ey);
  await page.waitForTimeout(1500);
  await shot('drag_after');
  I = await info();
  console.log('after real drag: correct=', I.correct, 'scene', I.scene);
}

if (scenario === 'perf') {
  await ev({ t: 'down', x: 10, y: 10 }); await ev({ t: 'up', x: 10, y: 10 });
  let I = await waitScene('round');
  const c = I.cards.find((c) => c.id === I.ans);
  await ev({ t: 'down', x: c.x, y: c.y }); await step(2); await ev({ t: 'up', x: c.x, y: c.y });
  await step(40);
  const ms = await page.evaluate(() => { const t0 = performance.now(); window.__gp.step(120); return (performance.now() - t0) / 120; });
  console.log('avg ms per update+draw during fireworks:', ms.toFixed(2));
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
