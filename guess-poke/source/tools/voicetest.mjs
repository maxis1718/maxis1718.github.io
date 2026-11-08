import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__said = []; window.__inEvt = ''; for (const t of ['touchend','click','pointerup']) window.addEventListener(t, () => { window.__inEvt += t + ' '; setTimeout(() => (window.__inEvt = ''), 0); }, true);
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  const ss = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'Mei-Jia', localService: true }], addEventListener() {},
    speak(u) { window.__said.push([performance.now() | 0, u.text, window.__inEvt]); ss.speaking = true; setTimeout(() => { ss.speaking = false; u.onend && u.onend(); }, 800); },
    cancel() { window.__said.push([performance.now() | 0, '<cancel>']); ss.speaking = false; } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
const html = readFileSync('dist/index.html', 'utf8');
await page.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.startsWith('https://game.test/')) return route.fulfill({ body: html, contentType: 'text/html' });
  const m = u.match(/official-artwork\/(\d+)\.png/);
  if (m && existsSync(`.cache/art/${m[1]}.png`)) return route.fulfill({ body: readFileSync(`.cache/art/${m[1]}.png`), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
  return route.abort();
});
await page.goto('https://game.test/');
await page.waitForTimeout(1000);
const cdp = await ctx.newCDPSession(page);
const tap = async (bx, by) => { const [x, y] = await page.evaluate(([bx, by]) => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + bx / window.__gp.W * r.width, r.top + by / window.__gp.H * r.height]; }, [bx, by]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(50); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await tap(10, 10);
for (let r = 0; r < 4; r++) {
  await page.waitForTimeout(2500);
  const I = await page.evaluate(() => { const g = window.__gp.game; return { scene: g.scene, ans: g.ans, cards: g.cards.map((c) => ({ id: c.id, x: c.x, y: c.y })) }; });
  const c = I.cards.find((c) => c.id === I.ans);
  if (!c) { console.log('no card', I.scene); continue; }
  await tap(c.x, c.y);
  await page.waitForTimeout(4500);
}
// drag with auto-snap while the finger is still down, release a bit later
{
  await page.waitForTimeout(2500);
  const I = await page.evaluate(() => { const g = window.__gp.game; return { ans: g.ans, F: g.L.frame, cards: g.cards.map((c) => ({ id: c.id, x: c.x, y: c.y })) }; });
  const c = I.cards.find((c) => c.id === I.ans);
  const css = async (bx, by) => page.evaluate(([bx, by]) => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + bx / window.__gp.W * r.width, r.top + by / window.__gp.H * r.height]; }, [bx, by]);
  const [sx, sy] = await css(c.x, c.y), [ex, ey] = await css(I.F.cx, I.F.cy);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * i / 20, y: sy + (ey - sy) * i / 20 }] }); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  console.log('snapped while held:', await page.evaluate(() => !!window.__gp.game.rev));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(3000);
}
console.log(JSON.stringify(await page.evaluate(() => window.__said)));
await browser.close();
