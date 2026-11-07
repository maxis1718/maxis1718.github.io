// Renders every sfx / bgm from src/audio.js in Playwright Chromium OfflineAudioContext.
// Reports duration/peak/RMS, checks NaN + peak < 0.99, writes WAVs to /tmp/audio/.
// usage: node tools/audio-test.mjs [bgmSeconds=10]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/tmp/audio';
fs.mkdirSync(OUT, { recursive: true });
const bgmSecs = +(process.argv[2] || 10);

let src = fs.readFileSync(path.join(root, 'src/audio.js'), 'utf8');
src = src.replace(/^export /gm, '') + '\nwindow.__A = { _renderTo, createAudio, SFX_NAMES, BGM_NAMES };\n';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: src, type: 'module' });
await page.waitForFunction(() => window.__A);

// no-op path + live API smoke test (must not throw)
const smoke = await page.evaluate(async () => {
  const a = window.__A.createAudio();
  const out = [];
  try {
    a.unlock(); a.sfx('tap'); a.bgm('play'); a.duck(true); a.magnet(0.5); a.magnet(null);
    a.setMuted(true); out.push('muted=' + a.muted); a.setMuted(false); a.bgm('title'); a.bgm(null);
    a.sfx('nonexistent'); out.push('ctx=' + (a.ctx && a.ctx.constructor.name));
  } catch (e) { out.push('THROW ' + e); }
  const saved = window.AudioContext; window.AudioContext = undefined; window.webkitAudioContext = undefined;
  try { const n = window.__A.createAudio(); n.unlock(); n.sfx('tap'); n.bgm('play'); n.magnet(1); out.push('noop ok ctx=' + n.ctx); }
  catch (e) { out.push('NOOP THROW ' + e); }
  window.AudioContext = saved;
  return out.join(' ');
});
console.log('smoke:', smoke);

const names = [
  ...(await page.evaluate(() => window.__A.SFX_NAMES)).map((n) => 'sfx:' + n),
  'magnet',
  ...(await page.evaluate(() => window.__A.BGM_NAMES)).map((n) => 'bgm:' + n),
  'mix',
];

let bad = 0;
console.log('name            dur(s)  peak    rms     onset  maxJump  nan');
for (const name of names) {
  const r = await page.evaluate(async ({ name, bgmSecs }) => {
    const sr = 44100;
    const maxLen = name.startsWith('bgm') ? bgmSecs + 1.5 : 8;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * maxLen), sr);
    const want = window.__A._renderTo(ctx, name, { seconds: bgmSecs, seed: 7 });
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0, nan = 0, last = 0, first = -1, maxJump = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = R[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
      const m = Math.max(Math.abs(a), Math.abs(b));
      if (m > peak) peak = m;
      sum += a * a + b * b;
      if (m > 0.001) { last = i; if (first < 0) first = i; }
      if (i) maxJump = Math.max(maxJump, Math.abs(a - L[i - 1]));
    }
    const n = last + 1;
    // onset: amplitude in the first 0.5ms after the first audible sample (big => click)
    let onset = 0;
    for (let i = first; i < first + 22 && i < L.length; i++) onset = Math.max(onset, Math.abs(L[i]));
    // 16-bit stereo WAV, trimmed to audible length + 50ms
    const len = Math.min(L.length, n + 2205);
    const ab = new ArrayBuffer(44 + len * 4);
    const dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, len * 4, true);
    for (let i = 0; i < len; i++) {
      dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] || 0)) * 32767, true);
      dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] || 0)) * 32767, true);
    }
    let bin = '';
    const u8 = new Uint8Array(ab);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { want, dur: n / sr, peak, rms: Math.sqrt(sum / (2 * Math.max(1, n))), nan, onset, maxJump, wav: btoa(bin) };
  }, { name, bgmSecs });
  const file = path.join(OUT, name.replace(':', '_') + '.wav');
  fs.writeFileSync(file, Buffer.from(r.wav, 'base64'));
  const ok = r.nan === 0 && r.peak < 0.99 && r.peak > 0.01;
  if (!ok) bad++;
  console.log(
    `${name.padEnd(15)} ${r.dur.toFixed(2).padStart(6)}  ${r.peak.toFixed(3)}  ${r.rms.toFixed(3)}  ${r.onset.toFixed(3)}  ${r.maxJump.toFixed(3)}  ${r.nan}${ok ? '' : '  <-- FAIL'}`
  );
}
if (errs.length) { console.log('page errors:', errs); bad++; }
await browser.close();
console.log(bad ? `FAILED (${bad})` : 'ALL OK', '-> WAVs in', OUT);
process.exit(bad ? 1 : 0);
