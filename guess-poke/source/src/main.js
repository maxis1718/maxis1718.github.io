import { Game } from './game.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { voiceAPI } from './voice.js';

const store = {
  get(k) { try { return localStorage.getItem('guesspoke.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('guesspoke.' + k, v); } catch (e) {} },
};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let audio;
try { audio = createAudio(); } catch (e) { audio = null; }
if (!audio) audio = { unlock() {}, sfx() {}, bgm() {}, setMuted(m) { this.muted = m; }, muted: false, duck() {}, magnet() {} };
const muted = store.get('muted') === '1';
audio.setMuted(muted);
voiceAPI.setEnabled(!muted);
voiceAPI.setDuck((on) => { try { audio.duck(on); } catch (e) {} });

const game = new Game({ audio, voice: voiceAPI, store });

let W = 0, H = 0, S = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth, vh = window.innerHeight;
  const dw = Math.round(vw * dpr), dh = Math.round(vh * dpr);
  // integer device-pixel scale so every game pixel is the same size
  const portrait = vh >= vw * 1.25;
  if (portrait) S = Math.max(1, Math.round(dw / 272));
  else S = Math.max(1, Math.round(dh / 520));
  W = Math.floor(dw / S); H = Math.floor(dh / S);
  if (portrait && W > 300) { S++; W = Math.floor(dw / S); H = Math.floor(dh / S); }
  canvas.width = W; canvas.height = H;
  canvas.style.width = (W * S) / dpr + 'px';
  canvas.style.height = (H * S) / dpr + 'px';
  ctx.imageSmoothingEnabled = false;
  game.resize(W, H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

const toBuffer = (cx, cy) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
};
let unlocked = false;
const input = createInput(canvas, toBuffer, () => {
  try { audio.unlock(); } catch (e) {}
  voiceAPI.unlock();
  if (!unlocked) { unlocked = true; }
});

document.addEventListener('visibilitychange', () => {
  try {
    if (document.hidden) { audio.ctx && audio.ctx.suspend && audio.ctx.suspend(); voiceAPI.cancel(); }
    else if (unlocked) { audio.ctx && audio.ctx.resume && audio.ctx.resume(); }
  } catch (e) {}
});

let last = performance.now();
let manual = false;
function frame(now) {
  let dt = (now - last) / (1000 / 60);
  last = now;
  if (!(dt > 0)) dt = 1;
  if (dt > 3) dt = 3;
  if (!manual) {
    game.update(dt, input.drain());
    ctx.imageSmoothingEnabled = false;
    game.draw(ctx);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks
window.__gp = {
  game, input, audio,
  get W() { return W; }, get H() { return H; }, get S() { return S; },
  manual(on) { manual = on; },
  step(n = 1, dt = 1) { for (let i = 0; i < n; i++) game.update(dt, input.drain()); ctx.imageSmoothingEnabled = false; game.draw(ctx); },
};
