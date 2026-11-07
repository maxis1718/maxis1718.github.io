// Particles, fireworks, shockwave rings. Pixel-crisp (integer rects), capped counts.
import { SPR } from './art.js';

export function drawSpr(ctx, spr, x, y, frame = 0) {
  if (!spr) return;
  if (typeof spr.draw === 'function') return spr.draw(ctx, Math.round(x), Math.round(y), frame);
  if (Array.isArray(spr)) return drawSpr(ctx, spr[((frame % spr.length) + spr.length) % spr.length], x, y, 0);
  if (spr.frames) return drawSpr(ctx, spr.frames[((frame % spr.frames.length) + spr.frames.length) % spr.frames.length], x, y, 0);
  if (spr.width) ctx.drawImage(spr, Math.round(x), Math.round(y));
}
export const sprW = (s) => (s ? s.w || s.width || (s.frames && sprW(s.frames[0])) || (Array.isArray(s) && sprW(s[0])) || 8 : 8);
export const sprH = (s) => (s ? s.h || s.height || (s.frames && sprH(s.frames[0])) || (Array.isArray(s) && sprH(s[0])) || 8 : 8);

const FW_COLS = [
  ['#ffd84a', '#fff6d8'], ['#ff7eb6', '#ffd1e6'], ['#5ec4f0', '#e0f7ff'], ['#8ee86b', '#e6ffd8'],
  ['#ff9a3c', '#ffe2b0'], ['#c49bff', '#efe2ff'],
];
const MAXP = 420;

export class FX {
  constructor() { this.p = []; this.rings = []; this.rockets = []; this.flash = 0; this.onPop = null; this.onTwinkle = null; }
  clear() { this.p.length = 0; this.rings.length = 0; this.rockets.length = 0; this.flash = 0; }
  add(o) { if (this.p.length < MAXP) this.p.push(o); }

  ring(x, y, r1, col = '#fff6d8', life = 22) { this.rings.push({ x, y, r0: 4, r1, t: 0, life, col }); }

  starBurst(x, y, n = 12, speed = 3.2) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const v = speed * (0.7 + Math.random() * 0.5);
      this.add({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, g: 0.08, drag: 0.95, life: 0, max: 50 + Math.random() * 25, f: (Math.random() * 4) | 0 });
    }
  }
  sparkles(x, y, n = 6, spread = 20) {
    for (let i = 0; i < n; i++) {
      this.add({ k: 'sparkle', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2, vx: 0, vy: -0.2, g: 0, drag: 1, life: -i * 3, max: 28, f: 0 });
    }
  }
  pixels(x, y, n, cols, speed = 2.5, g = 0.06, max = 45) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * Math.sqrt(Math.random());
      this.add({ k: 'px', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, drag: 0.97, life: 0, max: max * (0.6 + Math.random() * 0.6), c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.3 ? 2 : 1 });
    }
  }
  firework(x, y, H, delay = 0) {
    const ty = H * (0.14 + Math.random() * 0.22);
    this.rockets.push({ x, y, ty, vy: -(y - ty) / 34, wait: delay, col: FW_COLS[(Math.random() * FW_COLS.length) | 0], t: 0 });
  }
  confetti(W, n = 60) {
    const cols = ['#ffd84a', '#ff7eb6', '#5ec4f0', '#8ee86b', '#ff9a3c', '#c49bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.add({ k: 'conf', x: Math.random() * W, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.8, g: 0.004, drag: 1, life: 0, max: 400, c: cols[i % cols.length], ph: Math.random() * 6.28, w: Math.random() < 0.5 ? 2 : 3 });
    }
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - 0.06 * dt);
    for (const r of this.rockets) {
      if (r.wait > 0) { r.wait -= dt; continue; }
      r.t += dt;
      r.y += r.vy * dt;
      if ((r.t | 0) % 2 === 0) this.add({ k: 'px', x: r.x + (Math.random() - 0.5) * 2, y: r.y + 3, vx: 0, vy: 0.3, g: 0, drag: 1, life: 0, max: 14, c: r.col[1], s: 1 });
      if (r.y <= r.ty) {
        r.dead = true;
        this.pixels(r.x, r.y, 46, r.col, 2.6, 0.035, 60);
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * 6.28;
          this.add({ k: 'star', x: r.x, y: r.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, g: 0.03, drag: 0.97, life: 0, max: 55, f: i });
        }
        this.ring(r.x, r.y, 26, r.col[1], 16);
        this.onPop && this.onPop();
      }
    }
    this.rockets = this.rockets.filter((r) => !r.dead);
    for (const p of this.p) {
      p.life += dt;
      if (p.life < 0) continue;
      p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt);
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'conf') { p.ph += 0.12 * dt; p.x += Math.sin(p.ph) * 0.4 * dt; }
    }
    this.p = this.p.filter((p) => p.life < p.max && p.y < 2000);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  draw(ctx, H) {
    for (const r of this.rings) {
      const k = r.t / r.life, rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3));
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = r.col;
      const n = Math.max(12, Math.round(rad * 1.6));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad), 2, 2);
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rockets) {
      if (r.wait > 0) continue;
      ctx.fillStyle = r.col[1];
      ctx.fillRect(Math.round(r.x) - 1, Math.round(r.y) - 1, 2, 3);
    }
    for (const p of this.p) {
      if (p.life < 0) continue;
      const k = p.life / p.max;
      // pixel flicker near the end instead of alpha fade
      if (k > 0.7 && ((p.life | 0) % 4) < 2) continue;
      if (p.k === 'px') { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      else if (p.k === 'conf') {
        ctx.fillStyle = p.c;
        const w = Math.abs(Math.cos(p.ph)) > 0.5 ? p.w : 1;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), w, p.w);
      } else if (p.k === 'star') {
        const s = SPR && SPR.star;
        drawSpr(ctx, s, p.x - sprW(s) / 2, p.y - sprH(s) / 2, ((p.life / 5) | 0) + p.f);
      } else if (p.k === 'sparkle') {
        const s = SPR && SPR.sparkle;
        const fr = Math.min(3, (k * 4) | 0);
        drawSpr(ctx, s, p.x - sprW(s) / 2, p.y - sprH(s) / 2, fr);
      }
    }
  }
}
