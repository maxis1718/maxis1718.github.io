// Game logic + rendering. Everything is time-based in "frames" (dt = 1 at 60 fps) so 120 Hz screens stay silky.
import { computeLayout } from './layout.js';
import { ROSTER, BY_ID, OPENING, prepare, pixelSprite, isFailed, loadImage, resetFailed } from './poke.js';
import { FX, drawSpr, sprW, sprH } from './fx.js';
import { drawText, measure } from './text.js';
import { drawBackground, drawFrame, drawCard, drawSlotHint, drawButton, drawStarMeter, SPR } from './art.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const follow = (k, dt) => 1 - Math.pow(1 - k, dt);
const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const R = Math.round;

const STARS = 5;

export class Game {
  constructor({ audio, voice, store }) {
    this.audio = audio; this.voice = voice; this.store = store;
    this.fx = new FX();
    this.fx.onPop = () => this.sfx('pop');
    this.t = 0;
    this.scene = 'title';
    this.round = 0; this.correct = 0; this.meter = 0;
    this.recent = [];
    this.cards = [];
    this.ans = null;
    this.next = null; // prepared next round {ans, ids}
    this.L = null;
    this.ptr = { down: false, x: 0, y: 0, sx: 0, sy: 0, st: 0, card: null, moved: 0 };
    this.hover = { x: -1, y: -1 };
    this.titleMons = [];
    this.btnPress = 0;
    this.muteBtnPress = 0;
    this.started = false;
    this.inTransition = 0;
    this.stats = { rounds: 0, wrong: 0, snaps: 0 };
    // title: warm up favourites
    const favs = [25, 4, 7, 1, 393, 702, 235];
    favs.forEach((id, i) => {
      loadImage(id);
      this.titleMons.push({ id, x: 0, hop: 0, hopV: 0, ph: i * 0.9 });
    });
  }

  sfx(n, o) { try { this.audio.sfx(n, o); } catch (e) {} }

  resize(W, H) {
    const old = this.L;
    this.L = computeLayout(W, H);
    const L = this.L;
    // prepare sprite sizes for whatever is loaded
    const ids = new Set([...this.titleMons.map((m) => m.id), ...this.cards.map((c) => c.id), ...(this.next ? this.next.ids : [])]);
    ids.forEach((id) => prepare(id, [L.Nb, L.Ns, L.Np]));
    this.cards.forEach((c, i) => {
      const s = L.cards[c.slot];
      c.hx = s.cx; c.hy = s.cy;
      if (c.state === 'idle' || c.state === 'return') { c.x = c.hx; c.y = c.hy; }
      if (c.state === 'snapped') { c.x = L.frame.cx; c.y = L.frame.cy; }
    });
    if (!old) this.prepTitle();
  }

  async prepTitle() {
    const L = this.L;
    await Promise.all(this.titleMons.map((m) => prepare(m.id, [L.Nb, L.Ns, L.Np])));
  }

  // ---------------------------------------------------------------- round setup
  chooseAnswer() {
    const n = this.round;
    if (n < OPENING.length) {
      for (let i = n; i < OPENING.length; i++) if (!isFailed(OPENING[i]) && !this.recent.includes(OPENING[i])) return OPENING[i];
    }
    let pool = ROSTER.filter((p) => !isFailed(p.id) && !this.recent.slice(-6).includes(p.id));
    if (!pool.length) pool = ROSTER.filter((p) => !isFailed(p.id));
    if (!pool.length) return null;
    let tot = 0; pool.forEach((p) => (tot += p.fav || 1));
    let r = Math.random() * tot;
    for (const p of pool) { r -= p.fav || 1; if (r <= 0) return p.id; }
    return pool[0].id;
  }
  chooseDistractors(ans) {
    const a = BY_ID[ans];
    const easy = this.round < 14;
    const out = [];
    for (let tries = 0; tries < 400 && out.length < 2; tries++) {
      // favourites are fun distractors too (she knows them) — weight them up
      const p = ROSTER[(Math.random() * ROSTER.length) | 0];
      if (p.id === ans || isFailed(p.id) || out.includes(p.id)) continue;
      if (Math.random() > (p.fav ? 0.9 : 0.45)) continue;
      if (a.group && p.group === a.group) continue;
      if (easy && p.color === a.color) continue;
      if (out.length && easy && BY_ID[out[0]].color === p.color) continue;
      if (out.length && p.group && BY_ID[out[0]].group === p.group) continue;
      out.push(p.id);
    }
    for (let k = 0; out.length < 2 && k < 400; k++) { const p = ROSTER[(Math.random() * ROSTER.length) | 0]; if (p.id !== ans && !out.includes(p.id) && !isFailed(p.id)) out.push(p.id); }
    for (let k = 0; out.length < 2 && k < 400; k++) { const p = ROSTER[(Math.random() * ROSTER.length) | 0]; if (p.id !== ans && !out.includes(p.id)) out.push(p.id); }
    return out;
  }
  async prepareRound() {
    try { return await this._prepareRound(false); } catch (e) { return null; }
  }
  async _prepareRound(waitSnap) {
    const L = this.L;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ans = this.chooseAnswer();
      if (ans == null) return null;
      const ds = this.chooseDistractors(ans);
      const ids = [ans, ...ds];
      // download now, but build the pixel sprites only after the snap (no hitch while she is dragging),
      // one per tick so even slow phones never drop a frame for long
      const ok = (await Promise.all(ids.map((id) => loadImage(id)))).map(Boolean);
      if (ok.every(Boolean)) {
        if (waitSnap) await new Promise((res) => { const chk = () => (this.rev || this.scene !== 'round' ? res() : setTimeout(chk, 100)); chk(); });
        for (const id of ids) { await new Promise((res) => setTimeout(res, 16)); await prepare(id, [this.L.Nb, this.L.Ns]); }
      }
      if (ok.every(Boolean)) {
        for (let i = ids.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
        return { ans, ids };
      }
      if (!ok[0]) this.recent.push(ans); // skip broken answer next time
    }
    return null;
  }
  queueNext() {
    this.next = null;
    this.nextP = this._prepareRound(true).catch(() => null).then((r) => {
      if (!r) { return new Promise((res) => setTimeout(res, 2500)).then(() => { resetFailed(); this.queueNext(); return this.nextP; }); }
      this.next = r; return r;
    });
  }

  startRound(r) {
    const L = this.L;
    this.ans = r.ans;
    this.recent.push(r.ans); if (this.recent.length > 12) this.recent.shift();
    this.cards = r.ids.map((id, i) => {
      const s = L.cards[i];
      return { id, slot: i, hx: s.cx, hy: s.cy, x: s.cx, y: s.cy + L.H * 0.5, vx: 0, vy: 0, state: 'enter', enterT: -i * 5,
        lift: 0, hl: 0, press: 0, wig: 0, hop: 0, hopV: 0, alpha: 1, fly: null, ox: 0, oy: 0 };
    });
    this.scene = 'round';
    this.rt = 0; // round timer
    this.idle = 0;
    this.hintCycle = 0;
    this.silIn = 0;
    this.silShake = 0;
    this.silHop = 0; this.silHopV = 0;
    this.revealed = false;
    this.rev = null;
    this.glow = 0;
    this.excite = 0;
    this.bannerT = 0;
    this.stats.rounds++;
    if (this.meter >= STARS) this.meter = 0;
    this.sfx('whoosh');
    setTimeout(() => this.sfx('question'), 180);
    this.next = null;
    this.nextP = new Promise((res) => setTimeout(() => { this.queueNext(); this.nextP.then(res); }, 700));
  }
  sayLater(text, ms, guard) {
    clearTimeout(this._sayTo);
    this._sayTo = setTimeout(() => { if (!guard || guard()) this.voice.say(text); }, ms);
  }

  async begin() {
    if (this.started) return;
    this.started = true;
    resetFailed();
    this.sfx('tap');
    try { this.audio.bgm('play'); } catch (e) {}
    this.scene = 'loading';
    this.loadT = 0;
    const r = await this.prepareRound();
    if (!r) { this.scene = 'offline'; this.started = false; return; }
    await prepare(r.ans, [this.L.Nb, this.L.Ns]);
    this.titleOut = 0;
    this.startRound(r);
  }

  // ---------------------------------------------------------------- input
  hitCard(x, y) {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      if (c.state !== 'idle' && c.state !== 'return' && !(c.state === 'enter' && c.enterT > 6)) continue;
      const L = this.L, pad = 8;
      if (Math.abs(x - c.x) <= L.cardW / 2 + pad && Math.abs(y - c.y) <= L.cardH / 2 + pad) return c;
    }
    return null;
  }
  inMute(x, y) { const m = this.L.mute; return x >= m.x - 6 && x <= m.x + m.w + 6 && y >= m.y - 4 && y <= m.y + m.h + 6; }

  handle(ev) {
    const L = this.L;
    if (ev.t === 'hover') { this.hover.x = ev.x; this.hover.y = ev.y; return; }
    if (ev.t === 'key') {
      if (this.scene === 'title' && (ev.key === 'Enter' || ev.key === ' ')) this.begin();
      if (ev.key === 'm' || ev.key === 'M') this.toggleMute();
      if (this.scene === 'round' && !this.revealed && /^[123]$/.test(ev.key)) {
        const c = this.cards.find((c) => c.slot === +ev.key - 1);
        if (c && (c.state === 'idle' || c.state === 'return')) this.tapCard(c);
      }
      return;
    }
    const p = this.ptr;
    if (ev.t === 'down') {
      this.idle = 0;
      // a second finger never steals a card that is being dragged; otherwise the newest touch wins
      if (p.down && p.card && p.card.state === 'drag' && ev.id !== p.id && !(p.moved < 10 && this.t - p.st > 18)) return;
      if (p.down && p.card && p.card.state === 'drag') { p.card.state = 'return'; p.card = null; }
      p.id = ev.id;
      if (this.inMute(ev.x, ev.y)) { this.muteBtnPress = 1; p.mute = true; p.down = false; return; }
      p.down = true; p.x = p.sx = ev.x; p.y = p.sy = ev.y; p.st = this.t; p.moved = 0; p.card = null; p.mute = false;
      if (this.scene === 'title') { this.btnPress = 1; return; }
      if (this.rev && this.scene === 'round' && this.rev.t > 30) {
        const F = L.frame;
        if (ev.x > F.x && ev.x < F.x + F.w && ev.y > F.y && ev.y < F.y + F.h && this.t - (this._repeatT || -99) > 50) {
          this._repeatT = this.t;
          this.silHopV = -4.4; this.sfx('twinkle');
          this.fx.sparkles(ev.x, ev.y, 4, 14);
          this.voice.say(BY_ID[this.ans].name);
        }
        return;
      }
      if (this.scene === 'round' && !this.revealed) {
        const c = this.hitCard(ev.x, ev.y);
        if (c) {
          p.card = c;
          c.state = 'drag';
          c.ox = c.x - ev.x; c.oy = c.y - ev.y;
          c.grabT = 0;
          this.sfx('pick');
          // bring to front
          this.cards.splice(this.cards.indexOf(c), 1); this.cards.push(c);
        }
      }
      return;
    }
    if (ev.t === 'move') {
      if (!p.down || (ev.id !== undefined && ev.id !== p.id)) return;
      p.moved = Math.max(p.moved, dist(ev.x, ev.y, p.sx, p.sy));
      p.x = ev.x; p.y = ev.y;
      return;
    }
    if (ev.t === 'up' || ev.t === 'cancel') {
      if (ev.id !== undefined && p.id !== undefined && ev.id !== p.id) return;
      if (p.mute) { p.mute = false; this.muteBtnPress = 0; if (ev.t === 'up' && this.inMute(ev.x, ev.y)) this.toggleMute(); return; }
      const wasDown = p.down;
      p.down = false;
      this.btnPress = 0;
      if (!wasDown) return;
      if (this.scene === 'offline' && ev.t === 'up') { this.scene = 'title'; this.begin(); return; }
      if (this.scene === 'title') {
        if (ev.t === 'cancel') return;
        // tap a parading Pokémon -> it hops and says its name; anywhere else starts
        const m = this.titleHit(ev.x, ev.y);
        if (m) { m.hopV = -4.2; this.sfx('twinkle'); this.voice.say(BY_ID[m.id].name); return; }
        this.begin();
        return;
      }
      const c = p.card;
      p.card = null;
      if (!c || c.state !== 'drag') return;
      const tap = ev.t === 'up' && p.moved < 10;
      if (tap) { c.state = 'idle'; this.tapCard(c); return; }
      this.release(c, ev.t === 'cancel');
    }
  }

  titleHit(x, y) {
    for (const m of this.titleMons) {
      if (!m.box) continue;
      const b = m.box;
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 8) return m;
    }
    return null;
  }

  toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    this.voice.setEnabled(!m);
    this.store.set('muted', m ? '1' : '0');
    if (!m) this.sfx('tap');
  }

  tapCard(c) {
    const L = this.L;
    if (c.id === this.ans) { this.flyToFrame(c, 26); this.sfx('pick'); }
    else { this.wrong(c, false); }
  }

  release(c, cancel) {
    const L = this.L, F = L.frame;
    const d = dist(c.x, c.y, F.cx, F.cy);
    const RR = F.w * 0.8;
    if (!cancel && c.id === this.ans && (d < RR * 1.15 || c.y < L.cardsY - L.cardH * 0.35)) { this.flyToFrame(c, 14); return; }
    if (!cancel && c.id !== this.ans && (d < RR || c.y < L.cardsY - L.cardH * 0.6)) { this.wrong(c, true); return; }
    c.state = 'return';
    this.sfx('drop');
  }

  wrong(c, dragged) {
    this.stats.wrong++;
    c.state = 'return';
    c.wig = 1;
    if (!dragged) { c.hopV = -2.5; }
    this.silShake = 1;
    this.sfx('nope');
    if (!this.voice.busy) this.sayLater('不是我喔～', 420);
    // after a miss, show the hint sooner
    this.idle = Math.max(this.idle, this.round === 0 ? 60 : 200);
  }

  flyToFrame(c, dur) {
    const F = this.L.frame;
    clearTimeout(this._sayTo);
    c.state = 'fly';
    c.fly = { t: 0, dur, x0: c.x, y0: c.y, x1: F.cx, y1: F.cy };
    this.revealed = true; // lock input
    // other cards politely step aside
    this.cards.forEach((o) => { if (o !== c) { o.state = 'leave'; o.leaveT = 0; } });
  }

  // ---------------------------------------------------------------- update
  update(dt, events) {
    this.t += dt;
    for (const ev of events) this.handle(ev);
    const L = this.L;
    if (!L) return;
    this.fx.update(dt);
    this.btnPressV = lerp(this.btnPressV || 0, this.btnPress, follow(0.4, dt));
    this.muteV = lerp(this.muteV || 0, this.muteBtnPress, follow(0.4, dt));

    for (const m of this.titleMons) {
      m.hopV += 0.28 * dt; m.hop += m.hopV * dt;
      if (m.hop > 0) { m.hop = 0; m.hopV = 0; }
    }
    if (this.scene === 'title' || this.scene === 'loading' || this.scene === 'offline') {
      this.loadT = (this.loadT || 0) + dt;
      return;
    }
    if (this.scene === 'out') { this.updateOut(dt); if (this.rev) this.updateReveal(dt); return; }
    if (this.scene !== 'round') return;
    this.rt += dt;
    this.silIn = Math.min(1, this.silIn + dt / 18);
    this.silShake = Math.max(0, this.silShake - dt / 40);
    this.silHopV += 0.3 * dt; this.silHop += this.silHopV * dt;
    if (this.silHop > 0) { this.silHop = 0; this.silHopV = 0; }
    if (!this.revealed && !this.ptr.down) this.idle += dt;

    const F = L.frame, RR = F.w * 0.8;
    let near = 0;
    for (const c of this.cards) {
      c.wig = Math.max(0, c.wig - dt / 36);
      c.hopV += 0.32 * dt; c.hop += c.hopV * dt;
      if (c.hop > 0) { c.hop = 0; c.hopV = c.hopV > 1.5 ? -c.hopV * 0.3 : 0; }
      if (c.state === 'enter') {
        c.enterT += dt;
        const k = clamp(c.enterT / 22, 0, 1);
        c.x = c.hx; c.y = lerp(c.hy + L.H * 0.5, c.hy, easeOutBack(k));
        if (k >= 1) { c.state = 'idle'; c.y = c.hy; }
      } else if (c.state === 'drag') {
        c.grabT += dt;
        // card floats a bit above the finger so the finger doesn't hide it
        const gk = follow(0.22, dt);
        c.ox = lerp(c.ox, 0, gk); c.oy = lerp(c.oy, -L.cardH * 0.3, gk);
        let tx = this.ptr.x + c.ox, ty = this.ptr.y + c.oy;
        const d = dist(tx, ty, F.cx, F.cy);
        if (c.id === this.ans) {
          if (d < RR) {
            const k = 1 - d / RR;
            const pull = Math.pow(k, 1.4) * 0.8;
            tx = lerp(tx, F.cx, pull); ty = lerp(ty, F.cy, pull);
            near = Math.max(near, k);
          }
        } else if (d < RR * 0.65) {
          // gentle repel — "that's not me!"
          const k = 1 - d / (RR * 0.65);
          const nx = (tx - F.cx) / (d || 1), ny = (ty - F.cy) / (d || 1);
          tx += nx * k * 26; ty += ny * k * 26;
          tx += Math.sin(this.t * 1.3) * k * 2;
        }
        const pk = follow(0.5, dt);
        c.x = lerp(c.x, tx, pk); c.y = lerp(c.y, ty, pk);
        // auto-snap: once it is close enough, it just sticks (no need for a precise drop)
        if (c.id === this.ans && dist(c.x, c.y, F.cx, F.cy) < RR * 0.42) { this.ptr.card = null; this.flyToFrame(c, 10); }
      } else if (c.state === 'return') {
        // critically-under-damped spring home (a little bounce)
        const steps = Math.ceil(dt), h = dt / steps;
        for (let s = 0; s < steps; s++) {
          c.vx += ((c.hx - c.x) * 0.16 - c.vx * 0.42) * h; c.vy += ((c.hy - c.y) * 0.16 - c.vy * 0.42) * h;
          c.x += c.vx * h; c.y += c.vy * h;
        }
        if (Math.abs(c.x - c.hx) < 0.3 && Math.abs(c.y - c.hy) < 0.3 && Math.hypot(c.vx, c.vy) < 0.2) { c.x = c.hx; c.y = c.hy; c.vx = c.vy = 0; c.state = 'idle'; }
      } else if (c.state === 'fly') {
        const f = c.fly; f.t += dt;
        const k = clamp(f.t / f.dur, 0, 1), e = easeOutCubic(k);
        const arc = Math.sin(k * Math.PI) * (f.dur > 20 ? 30 : 8);
        c.x = lerp(f.x0, f.x1, e); c.y = lerp(f.y0, f.y1, e) - arc;
        near = Math.max(near, 0.6 + 0.4 * k);
        if (k >= 1) this.snap(c);
      } else if (c.state === 'leave') {
        c.leaveT += dt;
        const k = clamp(c.leaveT / 20, 0, 1);
        c.y = lerp(c.hy, c.hy + 14, easeOutCubic(k)); c.alpha = 1 - k * 0.65;
      } else if (c.state === 'out') {
        c.outT += dt;
        const k = clamp(c.outT / 18, 0, 1);
        c.y = lerp(c.y0, L.H + L.cardH, k * k);
      }
      const lifted = c.state === 'drag' || c.state === 'fly';
      c.lift = lerp(c.lift, lifted ? 1 : 0, follow(0.3, dt));
      const hov = c.state === 'idle' && this.hover.x >= 0 && Math.abs(this.hover.x - c.x) < L.cardW / 2 && Math.abs(this.hover.y - c.y) < L.cardH / 2;
      const hint = !this.revealed && c.id === this.ans && this.idle > 360;
      c.hl = lerp(c.hl, hov || (hint && Math.sin(this.t * 0.12) > 0) ? 1 : 0, follow(0.2, dt));
    }
    this.cards = this.cards.filter((c) => c.state !== 'gone');
    this.glow = lerp(this.glow, near, follow(0.25, dt));
    const ex = near > 0.25 ? 1 : 0;
    if (ex && !this.excite) { this.silHopV = -2.2; this.sfx('twinkle'); }
    this.excite = ex;
    try { this.audio.magnet(near > 0.02 && !this.rev ? near : null); } catch (e) {}

    // idle hints
    if (!this.revealed) {
      const first = this.round === 0 ? 150 : 360;
      if (this.idle > first) {
        const ph = (this.idle - first) % 120;
        if (ph < dt) {
          const c = this.cards.find((c) => c.id === this.ans && c.state === 'idle');
          if (c) { c.hopV = -3.4; this.fx.sparkles(c.x, c.y - 10, 4, 18); }
        }
      }
    }

    if (this.rev) this.updateReveal(dt);
  }

  snap(c) {
    const F = this.L.frame;
    c.state = 'gone';
    this.correct++;
    this.stats.snaps++;
    this.meter = Math.min(STARS, this.meter + 0); // star added when it lands in the meter
    this.rev = { t: 0, big: (this.correct % STARS) === 0, starFly: null, said: false, done: false, voiceDone: false };
    this.fx.flash = 1;
    this.fx.ring(F.cx, F.cy, F.w * 0.62, '#fff6d8', 24);
    this.fx.starBurst(F.cx, F.cy, 14, 3.4);
    this.sfx('snap');
    try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
    this.shake = 10;
    try { this.audio.magnet(null); } catch (e) {}
  }

  updateReveal(dt) {
    const r = this.rev, F = this.L.frame, L = this.L;
    const pt = r.t;
    r.t += dt;
    const at = (n) => pt < n && r.t >= n;
    if (this.shake) this.shake = Math.max(0, this.shake - dt);
    if (at(6)) this.sfx('reveal');
    if (at(12)) {
      this.bannerT = 0.0001;
      const name = BY_ID[this.ans].name;
      this.voice.say('是' + name + '！', { onend: () => (r.voiceDone = true) });
    }
    if (at(14)) {
      const n = r.big ? 6 : 3;
      for (let i = 0; i < n; i++) this.fx.firework(L.x0 + L.CW * (0.15 + Math.random() * 0.7), L.cardsY, L.H, i * 16);
    }
    if (at(66)) this.sfx(r.big ? 'big' : 'cheer');
    if (r.big && at(66)) this.fx.confetti(L.W, 90);
    if (at(24) || at(70) || at(100)) this.silHopV = -4.4;
    if (r.t > 20 && ((r.t / 14) | 0) !== ((pt / 14) | 0)) this.fx.sparkles(F.cx, F.cy, 1, F.w * 0.35);
    if (this.bannerT) this.bannerT += dt;
    // star flies to the meter
    if (at(118)) {
      r.starFly = { t: 0, x0: F.cx, y0: F.cy - 20, x1: this.meterSlotX(this.meter), y1: L.top.y + 6 };
      this.sfx('whoosh');
    }
    if (r.starFly) {
      r.starFly.t += dt;
      if (r.starFly.t >= 28 && !r.starFly.landed) {
        r.starFly.landed = true; this.meter++;
        this.sfx('twinkle');
        this.fx.starBurst(r.starFly.x1, r.starFly.y1, 6, 1.6);
        if (this.meter >= STARS) for (let i = 0; i < STARS; i++) { this.fx.starBurst(this.meterSlotX(i), r.starFly.y1, 4, 1.4); this.fx.sparkles(this.meterSlotX(i), r.starFly.y1, 2, 6); }
      }
    }
    const minT = r.big ? 290 : 195;
    if (r.t > minT && (r.voiceDone || r.t > minT + 120) && !r.done && this.next !== undefined) {
      if (this.next) { r.done = true; this.outro(); }
      else if (r.t > minT + 60 && !this._waitingNext) {
        this._waitingNext = true;
        this.nextP.then(() => { this._waitingNext = false; });
      }
    }
  }

  meterSlotX(i) {
    const L = this.L;
    return L.x0 + 8 + i * 13 + 5.5;
  }

  outro() {
    // cards still on screen drop away; the revealed Pokémon hops off; then new round
    this.cards.forEach((c) => { c.state = 'out'; c.outT = 0; c.y0 = c.y; });
    this.scene = 'out';
    this.outT = 0;
    const tick = () => {
      if (!this.next) { this.nextP.then(tick); return; }
      const nx = this.next; this.next = null;
      Promise.all(nx.ids.map((id) => prepare(id, [this.L.Nb, this.L.Ns]))).then(() => { this.round++; this.startRound(nx); });
    };
    this._outTick = tick;
  }

  // called by main each frame for the 'out' scene (kept separate so draw stays logic-free)
  updateOut(dt) {
    if (this.scene !== 'out') return;
    this.outT += dt;
    for (const c of this.cards) { c.outT += dt; c.y = lerp(c.y0, this.L.H + this.L.cardH, Math.min(1, c.outT / 18) ** 2); }
    if (this.outT >= 22 && this._outTick) { const f = this._outTick; this._outTick = null; f(); }
  }

  // ---------------------------------------------------------------- draw
  draw(ctx) {
    const L = this.L; if (!L) return;
    const t = this.t;
    drawBackground(ctx, L.W, L.H, t);
    if (this.scene === 'title' || this.scene === 'loading' || this.scene === 'offline') this.drawTitle(ctx);
    else this.drawPlay(ctx);
    this.fx.draw(ctx, L.H);
    // star flying to the meter on top of everything
    const r = this.rev;
    if (r && r.starFly && !r.starFly.landed) {
      const s = r.starFly, k = easeInOut(clamp(s.t / 28, 0, 1));
      const cx = lerp(s.x0, s.x1, k), cy = lerp(s.y0, s.y1, k) - Math.sin(k * Math.PI) * 40;
      const big = 1 + Math.sin(k * Math.PI) * 1;
      const sp = SPR.star;
      ctx.save(); ctx.translate(R(cx), R(cy)); ctx.scale(big, big);
      drawSpr(ctx, sp, -sprW(sp) / 2, -sprH(sp) / 2, (t / 5) | 0);
      ctx.restore();
    }
    this.drawMute(ctx);
  }

  drawMute(ctx) {
    const m = this.L.mute;
    const sp = this.audio.muted ? SPR.speaker_off : SPR.speaker_on;
    const p = R(this.muteV * 2);
    ctx.fillStyle = 'rgba(16,26,60,0.55)';
    ctx.fillRect(m.x + 2, m.y + 2 + p, m.w - 4, m.h - 4);
    ctx.fillRect(m.x + 3, m.y + 1 + p, m.w - 6, m.h - 2);
    ctx.fillRect(m.x + 1, m.y + 3 + p, m.w - 2, m.h - 6);
    drawSpr(ctx, sp, m.x + R((m.w - sprW(sp)) / 2), m.y + R((m.h - sprH(sp)) / 2) + p, 0);
  }

  drawPokemon(ctx, id, cx, cy, N, k, mode, alpha = 1) {
    const sp = pixelSprite(id, N);
    if (!sp) return false;
    const src = mode === 'sil' ? sp.sil : sp.img;
    const w = sp.w * k, h = sp.h * k;
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, R(cx - w / 2), R(cy - h / 2), R(w), R(h));
    ctx.globalAlpha = 1;
    return sp;
  }

  titleFrame() {
    const L = this.L, F = L.frame;
    const sc = L.CW >= 250 ? 3 : 2;
    const need = 4 + 12 * sc + 4 + 12 + 16 + 44 + 18 + L.Np + 14;
    const h = Math.min(F.h, L.H - F.y - need);
    if (h >= F.h) return F;
    const w = Math.min(F.w, Math.round(h / 0.92));
    const x = L.x0 + Math.round((L.CW - w) / 2);
    return { x, y: F.y, w, h, cx: x + w / 2, cy: F.y + h / 2 };
  }

  drawTitle(ctx) {
    const L = this.L, t = this.t, F = this.titleFrame();
    drawFrame(ctx, F.x, F.y, F.w, F.h, t, 0);
    // big Pikachu silhouette, bobbing
    const bob = R(Math.sin(t / 26) * 2);
    const tk = F === L.frame ? L.bigK : Math.max(1, Math.min(L.bigK, Math.floor((F.h - 30) / L.Nb)));
    const ok = F === L.frame || tk === L.bigK ? this.drawPokemon(ctx, 25, F.cx, F.cy + bob, L.Nb, tk, 'sil') : this.drawPokemon(ctx, 25, F.cx, F.cy + bob, L.Nb, (F.h - 34) / L.Nb, 'sil');
    if (!ok) this.drawSpinner(ctx, F.cx, F.cy);
    // question marks floating around
    for (let i = 0; i < 3; i++) {
      const a = t / 50 + i * 2.1;
      const qx = F.cx + Math.cos(a) * F.w * 0.36, qy = F.cy - F.h * 0.28 + Math.sin(a * 1.3) * 8;
      drawText(ctx, '？', R(qx), R(qy), { scale: 2, color: '#ffffff', outline: '#1b2a5c', align: 'center', alpha: 0.85 });
    }
    // title text with per-character wave
    const title = '我是誰？';
    const sc = L.CW >= 250 ? 3 : 2;
    const tw = measure(title, sc);
    let x = L.x0 + R((L.CW - tw) / 2);
    const ty = F.y + F.h + 4;
    for (const ch of title) {
      const w = measure(ch, sc);
      const y = ty + R(Math.sin(t / 10 - x / 18) * 2);
      drawText(ctx, ch, x, y, { scale: sc, color: '#ffd84a', outline: '#1b2a5c', shadow: '#101a3c' });
      x += w;
    }
    drawText(ctx, '猜猜寶可夢', L.x0 + R(L.CW / 2), ty + 12 * sc + 4, { scale: 1, color: '#9fe0ff', align: 'center', outline: '#101a3c' });
    // parade of favourites (tap them!)
    const mons = this.titleMons.filter((m) => pixelSprite(m.id, L.Np));
    const n = mons.length;
    const by = L.cardsY + L.cardH - 6;
    const span = L.CW - 8;
    mons.forEach((m, i) => {
      const sp = pixelSprite(m.id, L.Np);
      const cx = L.x0 + 4 + ((i + 0.5) / n) * span;
      const idleHop = Math.max(0, Math.sin(t / 14 + m.ph * 2)) * 2;
      const w = sp.w, h = sp.h;
      const x = R(cx - w / 2), y = R(by - h - idleHop + m.hop);
      ctx.drawImage(sp.img, x, y);
      const cw = span / n;
      m.box = { x: R(cx - cw / 2) + 2, y: by - L.Np - 6, w: R(cw) - 4, h: L.Np + 6 };
    });
    // start button
    const bw = Math.min(156, L.CW - 60), bh = 44;
    const bx = L.x0 + R((L.CW - bw) / 2);
    const byMax = L.cardsY + L.cardH - 6 - L.Np - 18 - bh;
    const by2 = R(Math.min(byMax, Math.max(ty + 12 * sc + 22, lerp(ty + 12 * sc + 22, L.cardsY - bh - 18, 0.55))));
    const pulse = this.scene === 'title' ? Math.sin(t / 12) : 0;
    if (this.scene === 'loading') {
      this.drawSpinner(ctx, L.x0 + L.CW / 2, by2 + bh / 2);
    } else if (this.scene === 'offline') {
      drawText(ctx, '網路好像斷了', L.x0 + R(L.CW / 2), by2, { scale: 1, color: '#fff', align: 'center', outline: '#101a3c' });
      drawText(ctx, '點一下再試試', L.x0 + R(L.CW / 2), by2 + 16, { scale: 1, color: '#9fe0ff', align: 'center', outline: '#101a3c' });
    } else {
      drawButton(ctx, bx, by2 - (pulse > 0.7 ? 1 : 0), bw, bh, '開始', { press: this.btnPressV, hover: 0 });
      // tutorial-ish hand nudging the button
      const hp = SPR.hand;
      if (hp) drawSpr(ctx, hp, bx + bw - 22, by2 + bh - 10 + R(Math.abs(Math.sin(t / 9)) * 3), 0);
    }
  }

  drawSpinner(ctx, cx, cy) {
    const sp = SPR.ball;
    const a = this.t / 6;
    for (let i = 0; i < 3; i++) {
      const x = cx + Math.cos(a + i * 2.09) * 10, y = cy + Math.sin(a + i * 2.09) * 10;
      drawSpr(ctx, sp, R(x - sprW(sp) / 2), R(y - sprH(sp) / 2), 0);
    }
  }

  drawPlay(ctx) {
    const L = this.L, t = this.t, F = L.frame;
    // top bar: star meter
    drawStarMeter(ctx, L.x0 + 8, L.top.y, this.meter, STARS, t);
    // frame (+ shake on snap)
    const sx = this.shake ? R(Math.sin(this.shake * 2.2) * this.shake * 0.35) : 0;
    ctx.save(); ctx.translate(sx, 0);
    drawFrame(ctx, F.x, F.y, F.w, F.h, t, this.glow);
    const r = this.rev;
    const shake = this.silShake > 0 ? R(Math.sin(this.rt * 0.9) * 4 * this.silShake) : 0;
    const bob = R(Math.sin(t / 26) * 1.5);
    const cy = F.cy + bob + R(this.silHop);
    if (this.scene === 'round' && !r) {
      if (this.glow > 0.05) drawSlotHint(ctx, F.cx, F.cy, R(Math.min(F.w, F.h) * 0.46), t);
      const a = this.silIn;
      const sp = pixelSprite(this.ans, L.Nb);
      if (sp && this.glow > 0.05) {
        ctx.globalAlpha = clamp(this.glow * (0.65 + 0.35 * Math.sin(t / 4)), 0, 1);
        const w = sp.rim.width * L.bigK, h = sp.rim.height * L.bigK;
        ctx.drawImage(sp.rim, R(F.cx + shake - w / 2), R(cy - h / 2), w, h);
        ctx.globalAlpha = 1;
      }
      this.drawPokemon(ctx, this.ans, F.cx + shake, cy, L.Nb, L.bigK, 'sil', a);
    } else if (r || this.scene === 'out') {
      const rt = r ? r.t : 999;
      const pop = rt < 18 ? 1 + Math.sin((rt / 18) * Math.PI) * 0.16 : 1;
      let ox = 0, oa = 1;
      if (this.scene === 'out') { const k = clamp(this.outT / 20, 0, 1); ox = R(easeInOut(k) * (F.w * 0.7)); oa = 1 - k; }
      this.drawPokemon(ctx, this.ans, F.cx + ox, cy, L.Nb, L.bigK * pop, 'img', oa);
      // white flash on snap
      if (this.fx.flash > 0) {
        ctx.globalAlpha = this.fx.flash * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(F.x + 6, F.y + 6, F.w - 12, F.h - 12);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // every 5th: big "太棒了！" stamp over the frame
    if (r && r.big && r.t > 60) {
      const k = clamp((r.t - 60) / 16, 0, 1), out = clamp((r.t - 230) / 20, 0, 1);
      if (out < 1) {
        const sc = L.CW >= 250 ? 4 : 3;
        const y = F.y + 12 - R((1 - easeOutBack(k)) * 24) - R(out * 16);
        const s2 = '太棒了！';
        let x = R(F.cx - measure(s2, sc) / 2), i = 0;
        for (const ch of s2) {
          const yy = y + R(Math.sin(t / 7 - i) * 2);
          drawText(ctx, ch, x, yy, { scale: sc, color: ['#ffd84a', '#ff7eb6', '#8ee86b', '#ffffff'][i % 4], outline: '#1b2a5c', shadow: '#101a3c', alpha: 1 - out });
          x += measure(ch, sc); i++;
        }
      }
    }
    // banner
    this.drawBanner(ctx);
    // cards (dragged one last = on top)
    for (const c of this.cards) this.drawCardObj(ctx, c);
    // tutorial hand
    if (this.scene === 'round' && !this.revealed) {
      const first = this.round === 0 ? 150 : 720;
      if (this.idle > first) this.drawHandDemo(ctx, (this.idle - first) % 110);
    }
  }

  drawBanner(ctx) {
    const L = this.L, t = this.t, B = L.banner;
    const r = this.rev;
    const sc = 2;
    if (!r || !this.bannerT) {
      if (this.scene !== 'round') return;
      const s = '我是誰？';
      const tw = measure(s, sc);
      let x = R(B.cx - tw / 2);
      const a = clamp(this.rt / 14, 0, 1);
      for (const ch of s) {
        const w = measure(ch, sc);
        const y = B.y + 4 + R(Math.sin(t / 9 - x / 14) * 1.6);
        drawText(ctx, ch, x, y, { scale: sc, color: '#ffffff', outline: '#1b2a5c', shadow: '#101a3c', alpha: a });
        x += w;
      }
      return;
    }
    const name = BY_ID[this.ans].name;
    const s = '是' + name + '！';
    const tw = measure(s, sc);
    let x = R(B.cx - tw / 2);
    let i = 0;
    for (const ch of s) {
      const w = measure(ch, sc);
      const k = clamp((this.bannerT - i * 3) / 12, 0, 1);
      if (k > 0) {
        const y = B.y + 4 + R((1 - easeOutBack(k)) * 16) + R(Math.sin(t / 8 - i) * 1.2);
        drawText(ctx, ch, x, y, { scale: sc, color: i === 0 || ch === '！' ? '#ffffff' : '#ffd84a', outline: '#1b2a5c', shadow: '#101a3c' });
      }
      x += w; i++;
    }
  }

  drawCardObj(ctx, c) {
    const L = this.L;
    const lift = c.lift;
    const grow = R(lift * 3);
    let w = L.cardW + grow * 2, h = L.cardH + grow * 2;
    let cx = c.x + R(Math.sin(c.wig * 18) * 5 * c.wig);
    let cy = c.y + R(c.hop);
    let alpha = c.alpha;
    let sk = 1; // pokemon scale (integer path at 1)
    if (c.state === 'fly') {
      const k = clamp(c.fly.t / c.fly.dur, 0, 1);
      // the card dissolves while the Pokémon grows into the silhouette
      const cs = 1 - easeOutCubic(k) * 0.55;
      w = R(w * cs); h = R(h * cs);
      alpha = 1 - k;
      const spS = pixelSprite(c.id, L.Ns), spB = pixelSprite(c.id, L.Nb);
      if (spS && spB) sk = lerp(1, (spB.w * L.bigK) / spS.w, easeOutCubic(k));
    }
    ctx.globalAlpha = clamp(alpha, 0, 1);
    const face = drawCard(ctx, R(cx - w / 2), R(cy - h / 2), w, h, { lift, hl: c.hl, press: c.state === 'drag' ? 0 : c.press });
    ctx.globalAlpha = 1;
    const a = c.state === 'leave' || c.state === 'out' ? c.alpha : 1;
    const pcy = face && c.state !== 'fly' ? face.y + face.h / 2 : cy;
    const pcx = face && c.state !== 'fly' ? face.x + face.w / 2 : cx;
    this.drawPokemon(ctx, c.id, pcx, pcy, L.Ns, sk, 'img', a);
  }

  drawHandDemo(ctx, ph) {
    const hp = SPR.hand; if (!hp) return;
    const c = this.cards.find((c) => c.id === this.ans);
    if (!c) return;
    const F = this.L.frame;
    const k = clamp((ph - 15) / 60, 0, 1), e = easeInOut(k);
    const x = lerp(c.hx, F.cx, e), y = lerp(c.hy, F.cy, e) - Math.sin(e * Math.PI) * 20;
    const a = ph < 10 ? ph / 10 : ph > 90 ? Math.max(0, (110 - ph) / 20) : 1;
    ctx.globalAlpha = a * 0.95;
    // ghost of the card being "dragged"
    if (k > 0 && k < 1) {
      const sp = pixelSprite(c.id, this.L.Ns);
      if (sp) { ctx.globalAlpha = a * 0.45; ctx.drawImage(sp.img, R(x - sp.w / 2), R(y - sp.h / 2)); }
    }
    ctx.globalAlpha = a;
    drawSpr(ctx, hp, R(x - (hp.hx || 0)), R(y - (hp.hy || 0)), 0);
    ctx.globalAlpha = 1;
  }
}
