import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__said = [];
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  const ss = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'Mei-Jia', localService: true }], addEventListener() {},
    speak(u) { window.__said.push([performance.now() | 0, u.text]); ss.speaking = true; setTimeout(() => { ss.speaking = false; u.onend && u.onend(); }, 800); },
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
console.log(JSON.stringify(await page.evaluate(() => window.__said)));
await browser.close();
