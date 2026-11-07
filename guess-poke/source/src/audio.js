// audio.js — WebAudio chiptune synth (no samples). Game Boy style channels
// (2 pulse w/ duty cycles, 4-bit wave channel, LFSR noise) + GBA-ish softness/echo.
// All melodies here are original compositions.
//
// export createAudio() -> { unlock, sfx, bgm, setMuted, muted, duck, magnet, ctx }
// export _renderTo(baseAudioContext, name, opts) -> schedules 'sfx:<name>' | 'bgm:<name>' | 'magnet'
//   on any BaseAudioContext (e.g. OfflineAudioContext) for testing. Returns seconds of audio scheduled.

const STEP_LOOKAHEAD = 0.12; // s scheduled ahead
const TICK_MS = 25;
const VOICE_CAP = 24; // concurrent voices total
const BGM_VOICE_CAP = 18; // bgm leaves headroom for sfx
const BGM_LEVEL = 0.35; // bgm relative to sfx
const XFADE = 0.3;

// ---------------------------------------------------------------- utils
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  // 'C#5', 'Bb4', 'E6'
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return 12 * (+m[3] + 1) + NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const nf = (n) => mf(midi(n));

function rng(seed) {
  if (seed == null) return Math.random;
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- waveforms
function pulseCoefs(duty, nh, roll) {
  // pulse high for fraction `duty` of the period; Fourier series, optional 1/n^roll softening
  const re = new Float32Array(nh + 1), im = new Float32Array(nh + 1);
  for (let n = 1; n <= nh; n++) {
    const k = 1 / (n * Math.PI) * Math.pow(n, -roll);
    re[n] = k * Math.sin(2 * Math.PI * n * duty);
    im[n] = k * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return [re, im];
}
function tableCoefs(tbl) {
  // DFT of a 32-step 4-bit wave table (GB wave channel), DC removed
  const N = tbl.length, nh = N / 2;
  const re = new Float32Array(nh + 1), im = new Float32Array(nh + 1);
  for (let n = 1; n <= nh; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) {
      // sample-and-hold step i covers phase [i/N,(i+1)/N): integrate cos/sin exactly
      const p0 = (2 * Math.PI * n * i) / N, p1 = (2 * Math.PI * n * (i + 1)) / N;
      const v = tbl[i] / 7.5 - 1;
      a += v * (Math.sin(p1) - Math.sin(p0));
      b += v * (Math.cos(p0) - Math.cos(p1));
    }
    re[n] = a / (Math.PI * n);
    im[n] = b / (Math.PI * n);
  }
  return [re, im];
}
const q4 = (x) => Math.max(0, Math.min(15, Math.round(7.5 + 7.5 * x)));
// warm GB-style bass wave: sine + a little 2nd/3rd, quantised to 4-bit
const GB_WAVE = Array.from({ length: 32 }, (_, i) => {
  const p = (2 * Math.PI * i) / 32;
  return q4(0.82 * Math.sin(p) + 0.18 * Math.sin(2 * p + 0.6) + 0.08 * Math.sin(3 * p));
});
// soft triangle, 4-bit (for boings / thuds)
const TRI_WAVE = Array.from({ length: 32 }, (_, i) => q4(i < 16 ? -1 + i / 8 : 3 - i / 8));

function buildWaves(ctx) {
  const mk = ([re, im]) => ctx.createPeriodicWave(re, im);
  return {
    // bright GB pulses
    p12: mk(pulseCoefs(0.125, 40, 0.15)),
    p25: mk(pulseCoefs(0.25, 40, 0.15)),
    p50: mk(pulseCoefs(0.5, 40, 0.15)),
    // softer GBA-ish pulses (rolled-off harmonics)
    p12s: mk(pulseCoefs(0.125, 20, 0.55)),
    p25s: mk(pulseCoefs(0.25, 20, 0.55)),
    p50s: mk(pulseCoefs(0.5, 20, 0.55)),
    gbw: mk(tableCoefs(GB_WAVE)),
    tri: mk(tableCoefs(TRI_WAVE)),
  };
}

function buildNoise(ctx) {
  // GB LFSR noise: 15-bit (hiss) and 7-bit (metallic/tonal) modes, 1 s each
  const sr = ctx.sampleRate, len = Math.floor(sr);
  const mk = (short) => {
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lfsr = 0x7fff;
    for (let i = 0; i < len; i++) {
      const bit = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      if (short) lfsr = (lfsr & ~0x40) | (bit << 6);
      d[i] = lfsr & 1 ? -0.8 : 0.8;
    }
    return buf;
  };
  return { long: mk(false), short: mk(true) };
}

// ---------------------------------------------------------------- engine
function buildEngine(ctx) {
  const E = { ctx, voices: [], muted: false };
  E.waves = buildWaves(ctx);
  E.noise = buildNoise(ctx);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.knee.value = 8;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);

  const shelf = ctx.createBiquadFilter(); // tame the fizz: kid-friendly
  shelf.type = 'highshelf';
  shelf.frequency.value = 5200;
  shelf.gain.value = -5;
  shelf.connect(comp);

  E.master = ctx.createGain();
  E.master.gain.value = 0.62;
  E.master.connect(shelf);

  E.sfxBus = ctx.createGain();
  E.sfxBus.connect(E.master);

  E.bgmBus = ctx.createGain(); // level
  E.bgmBus.gain.value = BGM_LEVEL;
  E.duckG = ctx.createGain(); // duck(on)
  E.jingleG = ctx.createGain(); // auto-dip during big jingles
  E.bgmBus.connect(E.duckG);
  E.duckG.connect(E.jingleG);
  E.jingleG.connect(E.master);

  // GBA-ish echo send: delay -> lowpass -> feedback
  E.echo = ctx.createGain();
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.19;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  E.echo.connect(dl);
  dl.connect(lp);
  lp.connect(fb);
  fb.connect(dl);
  lp.connect(wet);
  wet.connect(E.master);
  return E;
}

function voiceOK(E, t0, t1, bgm) {
  const now = E.ctx.currentTime;
  const v = E.voices;
  let n = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i][1] < now) { v[i] = v[v.length - 1]; v.pop(); continue; }
    if (v[i][0] < t1 && v[i][1] > t0) n++;
  }
  if (n >= (bgm ? BGM_VOICE_CAP : VOICE_CAP)) return false;
  v.push([t0, t1]);
  return true;
}

// Gain envelope using only setValue/linear/exponential ramps (no setTarget) -> click-free and exact.
function envelope(param, t, dur, vol, a = 0.004, d = 0.1, s = 0.6, r = 0.04) {
  const g = param;
  a = Math.max(0.003, a);
  r = Math.max(0.008, r);
  const tEnd = t + Math.max(dur, a + 0.002);
  const sus = Math.max(vol * s, 1e-4);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(vol, t + a);
  if (t + a + d <= tEnd) {
    g.exponentialRampToValueAtTime(sus, t + a + d);
    g.setValueAtTime(sus, tEnd);
  } else {
    const frac = (tEnd - t - a) / d;
    g.exponentialRampToValueAtTime(vol * Math.pow(sus / vol, frac), tEnd);
  }
  g.linearRampToValueAtTime(0, tEnd + r);
  return tEnd + r;
}

/** Tone voice.
 * o: { t, f, dur, wave, vol, a,d,s,r, fp:[[dt,f],...] (exp ramps), vib:[rate,cents,delay,endCents],
 *      dest, send, bgm } */
function tone(E, o) {
  const ctx = E.ctx;
  const t = o.t, r = o.r == null ? 0.04 : o.r;
  const end = t + Math.max(o.dur, 0.004) + r + 0.01;
  if (!voiceOK(E, t, end, o.bgm)) return end;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(E.waves[o.wave || 'p25s']);
  osc.frequency.setValueAtTime(o.f, t);
  if (o.fp) for (const [dt, f] of o.fp) osc.frequency.exponentialRampToValueAtTime(f, t + dt);
  const g = ctx.createGain();
  g.gain.value = 0;
  envelope(g.gain, t, o.dur, o.vol, o.a, o.d, o.s, r);
  osc.connect(g);
  g.connect(o.dest || E.sfxBus);
  if (o.send) {
    const sg = ctx.createGain();
    sg.gain.value = o.send;
    g.connect(sg);
    sg.connect(E.echo);
  }
  let lfo;
  if (o.vib && o.dur > o.vib[2]) {
    const [rate, cents, delay, endCents] = o.vib;
    lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + delay);
    lg.gain.linearRampToValueAtTime(cents, t + delay + 0.06);
    if (endCents != null) lg.gain.exponentialRampToValueAtTime(Math.max(endCents, 0.5), t + o.dur + r);
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t);
    lfo.stop(end);
  }
  osc.start(t);
  osc.stop(end);
  osc.onended = () => { try { g.disconnect(); } catch (e) {} };
  return end;
}

/** Noise voice. o: { t, dur, vol, mode:'long'|'short', rate, ft:'lowpass'|'bandpass'|'highpass', ff, fq, ffp:[[dt,f]], a,d,s,r, dest, send, bgm } */
function noise(E, o) {
  const ctx = E.ctx;
  const t = o.t, r = o.r == null ? 0.03 : o.r;
  const end = t + Math.max(o.dur, 0.004) + r + 0.01;
  if (!voiceOK(E, t, end, o.bgm)) return end;
  const src = ctx.createBufferSource();
  src.buffer = E.noise[o.mode || 'long'];
  src.loop = true;
  src.playbackRate.value = o.rate || 1;
  let node = src;
  if (o.ft) {
    const f = ctx.createBiquadFilter();
    f.type = o.ft;
    f.frequency.setValueAtTime(o.ff, t);
    if (o.ffp) for (const [dt, v] of o.ffp) f.frequency.exponentialRampToValueAtTime(v, t + dt);
    f.Q.value = o.fq || 0.7;
    src.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  envelope(g.gain, t, o.dur, o.vol, o.a == null ? 0.002 : o.a, o.d == null ? 0.05 : o.d, o.s == null ? 0.3 : o.s, r);
  node.connect(g);
  g.connect(o.dest || E.sfxBus);
  if (o.send) {
    const sg = ctx.createGain();
    sg.gain.value = o.send;
    g.connect(sg);
    sg.connect(E.echo);
  }
  // random start offset so repeated hits aren't identical
  src.start(t, (t * 7.31) % 0.9);
  src.stop(end);
  src.onended = () => { try { g.disconnect(); } catch (e) {} };
  return end;
}

// ---------------------------------------------------------------- drums (noise channel)
function drum(E, kind, t, dest, vol, bgm) {
  const base = { t, dest, bgm };
  switch (kind) {
    case 'k': // soft kick: low noise thump + wave pitch drop
      tone(E, { ...base, f: 140, fp: [[0.07, 50]], dur: 0.04, wave: 'gbw', vol: 0.32 * vol, a: 0.002, d: 0.08, s: 0.2, r: 0.05 });
      noise(E, { ...base, dur: 0.012, vol: 0.12 * vol, rate: 0.12, ft: 'lowpass', ff: 900, r: 0.03 });
      break;
    case 's': // gentle snare
      noise(E, { ...base, dur: 0.03, vol: 0.32 * vol, rate: 0.55, ft: 'bandpass', ff: 2200, fq: 0.6, d: 0.06, s: 0.25, r: 0.07 });
      tone(E, { ...base, f: 240, fp: [[0.05, 150]], dur: 0.03, wave: 'tri', vol: 0.18 * vol, r: 0.04 });
      break;
    case 'h': // closed hat / shaker
      noise(E, { ...base, dur: 0.012, vol: 0.18 * vol, rate: 1, ft: 'highpass', ff: 6500, r: 0.03 });
      break;
    case 'o': // open hat
      noise(E, { ...base, dur: 0.06, vol: 0.15 * vol, rate: 1, ft: 'highpass', ff: 5500, d: 0.08, s: 0.4, r: 0.12 });
      break;
    case 'c': // soft splash
      noise(E, { ...base, dur: 0.1, vol: 0.2 * vol, rate: 0.9, ft: 'highpass', ff: 3500, d: 0.4, s: 0.2, r: 0.5, send: 0.3 });
      break;
  }
}

// ---------------------------------------------------------------- tracker data
// melody tokens 'C5:4' (16th-steps), 'r:2' rest.
function mel(str) {
  const ev = [];
  let s = 0;
  for (const tok of str.trim().split(/[\s|]+/)) {
    const [n, l] = tok.split(':');
    const len = +l;
    if (n !== 'r') ev.push([s, midi(n), len]);
    s += len;
  }
  ev.total = s;
  return ev;
}
const CHORD_Q = { '': [0, 4, 7, 12], m: [0, 3, 7, 12], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], aug: [0, 4, 8, 12] };
function chord(name) {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  return { root: midi(m[1] + '0') - 12, iv: CHORD_Q[m[2]] }; // root as pitch class (octave -1)
}
// bars: ['C', 'Dm G', ...]; fn(chord, step, len, barIndex) -> events [step, midi, len]
function perChord(bars, fn) {
  const ev = [];
  bars.forEach((b, bi) => {
    const cs = b.trim().split(/\s+/);
    const L = 16 / cs.length;
    cs.forEach((c, ci) => ev.push(...fn(chord(c), bi * 16 + ci * L, L, bi)));
  });
  return ev;
}
const tn = (c, deg, oct) => c.root + 12 * (oct + 1) + (deg >= 4 ? 12 + c.iv[deg - 4] : c.iv[deg]);
// bass note kept in a phone-audible GB range (lowest >= E2 by default)
const bn = (c, deg, lo = 40) => { let m = c.root + c.iv[deg]; while (m < lo) m += 12; return m; };
// hold current automation value at t (cancelAndHold where supported)
function hold(param, t) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
}

// ----- BGM 'title': calm & cute, F major, 100 bpm, 16 bars (A/B)
function songTitle() {
  const bars = ['F', 'Am', 'Bb', 'C', 'F', 'Dm', 'Gm C', 'F', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'Bb C', 'F'];
  const lead = mel(
    'A4:4 C5:4 F5:6 E5:2 | E5:4 C5:4 A4:8 | D5:4 F5:4 Bb5:6 A5:2 | G5:6 F5:2 E5:4 C5:4 |' +
    'A4:4 C5:4 F5:4 A5:4 | F5:4 D5:4 A5:6 G5:2 | Bb5:4 A5:2 G5:2 E5:4 G5:4 | F5:12 r:4 |' +
    'D6:4 C6:2 Bb5:2 F5:8 | C6:4 Bb5:2 A5:2 G5:8 | A5:4 G5:2 E5:2 C5:4 E5:4 | F5:4 E5:2 D5:2 A4:8 |' +
    'Bb4:4 D5:4 G5:6 F5:2 | E5:4 G5:4 C6:6 Bb5:2 | A5:4 F5:4 G5:4 E5:4 | F5:8 r:4 C5:4'
  );
  // music-box broken chord in 8ths
  const arp = perChord(bars, (c, s, L) => {
    const pat = [[0, 3], [2, 3], [5, 3], [2, 3], [0, 3], [2, 3], [5, 3], [6, 3]];
    const out = [];
    for (let i = 0; i < L / 2; i++) out.push([s + i * 2, tn(c, pat[i][0], pat[i][1]), 2]);
    return out;
  });
  const bass = perChord(bars, (c, s, L) =>
    L === 16 ? [[s, bn(c, 0, 41), 8], [s + 8, bn(c, 2, 41), 8]] : [[s, bn(c, 0, 41), 8]]
  );
  const drums = [];
  for (let b = 0; b < 16; b++) {
    drums.push([b * 16, 'k', 0.5]);
    for (const k of [2, 6, 10, 14]) drums.push([b * 16 + k, 'h', 0.45]);
  }
  return {
    bpm: 100, steps: 256,
    tracks: [
      { ev: lead, wave: 'p25s', vol: 0.42, a: 0.01, d: 0.25, s: 0.55, r: 0.12, gate: 0.92, vib: [5.5, 14, 0.18], send: 0.45, pan: -0.12 },
      { ev: arp, wave: 'p12s', vol: 0.18, a: 0.004, d: 0.18, s: 0.25, r: 0.1, gate: 0.6, send: 0.35, pan: 0.3 },
      { ev: bass, wave: 'gbw', vol: 0.3, a: 0.012, d: 0.5, s: 0.55, r: 0.1, gate: 0.85, pan: 0 },
    ],
    drums, drumVol: 0.6,
  };
}

// ----- BGM 'play': happy bouncy, C major, 120 bpm, 24 bars (A/B/A')
function songPlay() {
  const bars = [
    'C', 'Am', 'F', 'G', 'C', 'Am', 'Dm G', 'C',
    'F', 'G', 'Em', 'Am', 'Dm', 'G', 'F G', 'C',
    'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C G',
  ];
  const lead = mel(
    'C5:2 E5:2 G5:3 E5:1 A5:4 G5:4 | E5:2 C5:2 A4:2 C5:2 E5:4 r:4 | F5:2 E5:2 F5:2 A5:2 C6:4 A5:4 | G5:3 F5:1 E5:2 D5:2 B4:4 D5:4 |' +
    'C5:2 E5:2 G5:3 E5:1 A5:4 G5:4 | C6:2 B5:2 A5:2 G5:2 E5:4 C5:4 | D5:2 F5:2 A5:4 G5:2 F5:2 D5:4 | E5:2 D5:2 C5:8 r:4 |' +
    'A5:2 r:2 A5:2 G5:2 F5:4 C5:4 | B5:2 r:2 B5:2 A5:2 G5:4 D5:4 | G5:2 F5:2 E5:2 D5:2 E5:2 G5:2 B5:4 | A5:6 G5:2 E5:4 C5:4 |' +
    'F5:2 E5:2 D5:2 F5:2 A5:4 F5:4 | G5:2 A5:2 B5:2 D6:2 B5:4 G5:4 | A5:4 F5:4 G5:4 B5:4 | C6:8 r:8 |' +
    'E5:2 A5:2 C6:3 B5:1 A5:4 E5:4 | F5:2 A5:2 C6:3 B5:1 A5:4 F5:4 | G5:2 E5:2 C5:2 E5:2 G5:2 C6:2 G5:4 | D5:2 G5:2 B5:3 A5:1 G5:8 |' +
    'C6:2 B5:2 A5:2 E5:2 A5:4 C6:4 | A5:2 G5:2 F5:2 C5:2 F5:4 A5:4 | G5:3 A5:1 G5:2 F5:2 E5:2 D5:2 B4:4 | C5:4 E5:2 G5:2 r:2 G4:2 B4:2 D5:2'
  );
  // harmony: offbeat 'chuck' stabs (A & A'), 16th sparkle arpeggio in B
  const harm = perChord(bars, (c, s, L, bi) => {
    const out = [];
    if (bi >= 8 && bi < 16) {
      const pat = [0, 1, 2, 4];
      for (let i = 0; i < L; i++) out.push([s + i, tn(c, pat[i % 4], 4), 1]);
    } else {
      for (let i = 2, k = 0; i < L; i += 4, k++) out.push([s + i, tn(c, k % 2 ? 2 : 1, 4), 1]);
    }
    return out;
  });
  const bassPat = ['R', null, 'O', 'R', '5', null, 'O', null];
  const bass = perChord(bars, (c, s, L) => {
    const out = [];
    for (let i = 0; i < L / 2; i++) {
      const p = bassPat[i];
      if (!p) continue;
      const r = bn(c, 0);
      const m = p === 'R' ? r : p === 'O' ? r + 12 : bn(c, 2);
      out.push([s + i * 2, m, 2]);
    }
    return out;
  });
  const drums = [];
  for (let b = 0; b < 24; b++) {
    const o = b * 16;
    const fill = b % 8 === 7;
    drums.push([o, 'k', 0.6], [o + 8, 'k', 0.5]);
    drums.push([o + 4, 's', 0.45]);
    if (!fill) drums.push([o + 12, 's', 0.45]);
    else drums.push([o + 12, 's', 0.4], [o + 14, 's', 0.35], [o + 15, 's', 0.45]);
    for (const k of [2, 6, 10, 14]) drums.push([o + k, 'h', 0.5]);
    if (b >= 8 && b < 16) for (const k of [3, 7, 11]) drums.push([o + k, 'h', 0.25]);
    if (b % 8 === 0) drums.push([o, 'c', 0.35]);
  }
  return {
    bpm: 120, steps: 384,
    tracks: [
      { ev: lead, wave: 'p25s', vol: 0.4, a: 0.006, d: 0.16, s: 0.5, r: 0.06, gate: 0.85, vib: [6, 12, 0.22], send: 0.3, pan: -0.15 },
      { ev: harm, wave: 'p12s', vol: 0.15, a: 0.003, d: 0.08, s: 0.3, r: 0.04, gate: 0.7, send: 0.15, pan: 0.3 },
      { ev: bass, wave: 'gbw', vol: 0.34, a: 0.005, d: 0.12, s: 0.55, r: 0.04, gate: 0.6, pan: 0 },
    ],
    drums, drumVol: 0.55,
  };
}

// ----- jingles (one-shots through the same tracker)
function songCheer() {
  return {
    bpm: 150, steps: 16, gain: 0.72,
    tracks: [
      { ev: mel('G5:1 E5:1 G5:1 C6:3 A5:1 C6:1 D6:1 E6:7'), wave: 'p25s', vol: 0.36, a: 0.004, d: 0.18, s: 0.6, r: 0.25, gate: 0.9, vib: [6, 18, 0.15], send: 0.35 },
      { ev: mel('E5:1 C5:1 E5:1 G5:3 F5:1 A5:1 B5:1 G5:7'), wave: 'p12s', vol: 0.2, a: 0.004, d: 0.18, s: 0.5, r: 0.25, gate: 0.9, send: 0.25 },
      { ev: mel('C3:3 G3:3 F3:2 G3:1 C3:7'), wave: 'gbw', vol: 0.45, a: 0.005, d: 0.2, s: 0.6, r: 0.15, gate: 0.85 },
    ],
    drums: [[0, 'k', 0.8], [3, 's', 0.6], [6, 'k', 0.7], [8, 's', 0.6], [9, 'c', 0.8], [9, 'k', 0.7]], drumVol: 0.8,
  };
}
function songBig() {
  const t = {
    bpm: 170, steps: 36, gain: 0.72,
    tracks: [
      { ev: mel('C5:2 E5:2 G5:2 C6:2 A5:2 C6:2 F6:4 D6:2 B5:2 D6:2 F6:2 E6:12'), wave: 'p25s', vol: 0.34, a: 0.004, d: 0.2, s: 0.6, r: 0.35, gate: 0.88, vib: [6, 20, 0.2], send: 0.35 },
      { ev: mel('E4:2 G4:2 C5:2 E5:2 F5:2 A5:2 C6:4 B5:2 G5:2 B5:2 D6:2 C6:12'), wave: 'p12s', vol: 0.2, a: 0.004, d: 0.2, s: 0.5, r: 0.35, gate: 0.88, send: 0.25 },
      { ev: mel('C3:2 C4:2 G3:2 C4:2 F3:2 F4:2 A3:2 F4:2 G3:2 G4:2 B3:2 G4:2 C3:12'), wave: 'gbw', vol: 0.45, a: 0.005, d: 0.15, s: 0.6, r: 0.2, gate: 0.7 },
      { ev: mel('r:26 G6:1 C7:1 E6:1 G6:1 C7:1 E7:1 G6:1 C7:1 r:2'), wave: 'p12s', vol: 0.07, a: 0.002, d: 0.12, s: 0.1, r: 0.1, gate: 0.9, send: 0.6 },
    ],
    drums: [[0, 'k', 0.8], [4, 's', 0.6], [8, 'k', 0.8], [12, 's', 0.6], [16, 'k', 0.8], [20, 's', 0.55], [22, 's', 0.45], [23, 's', 0.55], [24, 'k', 0.9], [24, 'c', 1]],
    drumVol: 0.8,
  };
  return t;
}
function songQuestion() {
  // augmented-flavoured "hmm?" — curious, with an upward question glide at the end
  return {
    bpm: 140, steps: 11, gain: 0.7,
    tracks: [
      { ev: mel('C5:1 E5:1 G#5:2 E5:1 G#5:1 C6:5'), wave: 'p25s', vol: 0.34, a: 0.004, d: 0.12, s: 0.6, r: 0.2, gate: 0.85, vib: [7, 22, 0.12], send: 0.4, lastSlide: 0.94 },
      { ev: mel('r:2 G#4:2 r:2 C5:5'), wave: 'p12s', vol: 0.16, a: 0.004, d: 0.12, s: 0.5, r: 0.2, gate: 0.8, send: 0.3, lastSlide: 0.94 },
      { ev: mel('C3:4 E3:2 G#3:5'), wave: 'gbw', vol: 0.42, a: 0.005, d: 0.15, s: 0.6, r: 0.15, gate: 0.8 },
    ],
    drums: [[0, 'h', 0.7], [2, 'h', 0.5], [4, 'h', 0.7], [5, 'h', 0.5], [6, 's', 0.4]], drumVol: 0.7,
  };
}

function compile(song) {
  for (const tr of song.tracks) if (tr.ev.total != null && tr.ev.total !== song.steps) throw new Error('track length ' + tr.ev.total + ' != ' + song.steps);
  const by = Array.from({ length: song.steps }, () => []);
  song.tracks.forEach((tr, ti) => {
    tr.ev.forEach((e, i) => by[e[0] % song.steps].push({ tr: ti, m: e[1], len: e[2], last: i === tr.ev.length - 1 }));
  });
  for (const d of song.drums) by[d[0] % song.steps].push({ drum: d[1], v: d[2] });
  song.by = by;
  song.stepDur = 60 / song.bpm / 4;
  return song;
}
const SONGS = { title: songTitle, play: songPlay };
const JINGLES = { cheer: songCheer, big: songBig, question: songQuestion };
const songCache = new WeakMap();
function getSong(E, name, table) {
  let c = songCache.get(E);
  if (!c) songCache.set(E, (c = {}));
  return c[name] || (c[name] = compile(table[name]()));
}

function playStep(E, song, list, t, buses, bgm, pitch = 1) {
  const G = song.gain || 1;
  for (const n of list) {
    if (n.drum) { drum(E, n.drum, t, buses.drum, G * n.v * (song.drumVol || 1), bgm); continue; }
    const tr = song.tracks[n.tr];
    const f = mf(n.m) * pitch;
    const dur = n.len * song.stepDur * tr.gate;
    const o = {
      t, f, dur, wave: tr.wave, vol: tr.vol * G, a: tr.a, d: tr.d, s: tr.s, r: tr.r,
      vib: tr.vib && dur > 0.25 ? tr.vib : null, send: tr.send, dest: buses.tr[n.tr], bgm,
    };
    if (n.last && tr.lastSlide) { o.f = f * tr.lastSlide; o.fp = [[0.09, f]]; }
    tone(E, o);
  }
}

function makeBuses(E, out, song) {
  const ctx = E.ctx;
  const mk = (pan) => {
    const g = ctx.createGain();
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    return g;
  };
  return { tr: song.tracks.map((tr) => mk(tr.pan || 0)), drum: mk(0.12) };
}

// one-shot jingle at time t
function playJingle(E, name, t, pitch = 1) {
  const song = getSong(E, name, JINGLES);
  const buses = { tr: song.tracks.map(() => E.sfxBus), drum: E.sfxBus };
  for (let s = 0; s < song.steps; s++) playStep(E, song, song.by[s], t + s * song.stepDur, buses, false, pitch);
  return t + song.steps * song.stepDur + 0.5;
}

// looping bgm player
function makePlayer(E, name, t0) {
  const song = getSong(E, name, SONGS);
  const g = E.ctx.createGain();
  g.connect(E.bgmBus);
  return { name, song, g, t0, next: 0, buses: makeBuses(E, g, song), dead: false };
}
function pump(E, p, until) {
  const sd = p.song.stepDur;
  const now = E.ctx.currentTime;
  // fell behind (tab throttled / iOS interruption): shift timeline instead of bursting notes
  if (p.t0 + p.next * sd < now - 0.03) p.t0 = now + 0.05 - p.next * sd;
  while (p.t0 + p.next * sd < until) {
    const step = p.next % p.song.steps;
    playStep(E, p.song, p.song.by[step], p.t0 + p.next * sd, p.buses, true);
    p.next++;
  }
}

// ---------------------------------------------------------------- sfx
const SFX = {
  tap(E, t) {
    tone(E, { t, f: nf('B5'), dur: 0.035, wave: 'p50', vol: 0.22, a: 0.003, d: 0.03, s: 0.7, r: 0.015 });
    return tone(E, { t: t + 0.05, f: nf('E6'), dur: 0.05, wave: 'p50', vol: 0.22, a: 0.002, d: 0.05, s: 0.5, r: 0.04 });
  },
  pick(E, t) {
    tone(E, { t, f: nf('C5'), fp: [[0.07, nf('G5')]], dur: 0.08, wave: 'p25s', vol: 0.3, a: 0.003, d: 0.09, s: 0.35, r: 0.06 });
    return tone(E, { t, f: nf('C4'), fp: [[0.07, nf('G4')]], dur: 0.08, wave: 'tri', vol: 0.2, a: 0.003, d: 0.09, s: 0.35, r: 0.06 });
  },
  drop(E, t) {
    tone(E, { t, f: 200, fp: [[0.12, 95]], dur: 0.09, wave: 'gbw', vol: 0.42, a: 0.003, d: 0.12, s: 0.3, r: 0.07 });
    tone(E, { t, f: nf('G4'), fp: [[0.08, nf('D4')]], dur: 0.04, wave: 'p50s', vol: 0.08, a: 0.002, d: 0.05, s: 0.3, r: 0.04 });
    return noise(E, { t, dur: 0.02, vol: 0.12, rate: 0.12, ft: 'lowpass', ff: 700, r: 0.05 });
  },
  nope(E, t) {
    // cartoon "boing-boing": quick upward scoop then decaying wobble, second boing a bit lower
    let end = t;
    [[0, 330, 0.22], [0.27, 262, 0.3]].forEach(([dt, b, dur]) => {
      const fp = [[0.045, b], [dur, b * 0.9]];
      const vib = [15, 110, 0.04, 6];
      tone(E, { t: t + dt, f: b * 0.55, fp, dur, wave: 'tri', vol: 0.42, a: 0.006, d: 0.25, s: 0.5, r: 0.07, vib });
      end = tone(E, { t: t + dt, f: b * 1.1, fp: [[0.045, b * 2], [dur, b * 1.8]], dur, wave: 'p50s', vol: 0.06, a: 0.006, d: 0.2, s: 0.4, r: 0.07, vib });
    });
    return end;
  },
  snap(E, t) {
    tone(E, { t, f: 170, fp: [[0.09, 62]], dur: 0.06, wave: 'gbw', vol: 0.5, a: 0.002, d: 0.08, s: 0.3, r: 0.06 });
    noise(E, { t, dur: 0.015, vol: 0.2, rate: 0.35, ft: 'lowpass', ff: 2000, r: 0.03 });
    const sh = ['E6', 'G6', 'B6', 'E7'];
    let end = t;
    sh.forEach((n, i) => {
      const last = i === sh.length - 1;
      end = tone(E, {
        t: t + 0.05 + i * 0.04, f: nf(n), dur: last ? 0.12 : 0.03, wave: 'p12s', vol: last ? 0.1 : 0.13,
        a: 0.002, d: 0.08, s: 0.35, r: last ? 0.22 : 0.05, send: 0.5, vib: last ? [9, 20, 0.03] : null,
      });
    });
    return end;
  },
  reveal(E, t) {
    const ns = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6'];
    const sp = 0.055;
    ns.forEach((n, i) => {
      const f = nf(n), v = 0.24 - i * 0.008;
      tone(E, { t: t + i * sp, f: f * 0.97, fp: [[0.03, f]], dur: 0.05, wave: 'p25s', vol: v, a: 0.005, d: 0.08, s: 0.4, r: 0.05, send: 0.3 });
      tone(E, { t: t + i * sp + 0.028, f, dur: 0.04, wave: 'p12s', vol: v * 0.4, a: 0.005, d: 0.06, s: 0.3, r: 0.04 });
    });
    const tf = t + ns.length * sp;
    tone(E, { t: tf, f: nf('E6'), dur: 0.22, wave: 'p25s', vol: 0.12, a: 0.004, d: 0.15, s: 0.5, r: 0.2, vib: [8, 25, 0.05], send: 0.4 });
    return tone(E, { t: tf, f: nf('C7'), fp: [[0.03, nf('C7') * 1.004]], dur: 0.22, wave: 'p12s', vol: 0.09, a: 0.004, d: 0.15, s: 0.5, r: 0.22, vib: [8, 25, 0.05], send: 0.5 });
  },
  pop(E, t, o, R) {
    const k = 0.85 + 0.3 * R();
    noise(E, { t, dur: 0.05, vol: 0.32, mode: 'long', rate: 0.5 * k, ft: 'lowpass', ff: 4200 * k, ffp: [[0.4, 400]], a: 0.002, d: 0.35, s: 0.05, r: 0.15, send: 0.25 });
    tone(E, { t, f: 820 * k, fp: [[0.18, 140 * k]], dur: 0.1, wave: 'tri', vol: 0.18, a: 0.002, d: 0.15, s: 0.2, r: 0.08 });
    let end = t + 0.5;
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + 0.12 + R() * 0.38;
      end = Math.max(end, noise(E, { t: tt, dur: 0.008, vol: 0.06 + 0.04 * R(), mode: 'short', rate: 0.6 + R() * 0.4, ft: 'highpass', ff: 3000, r: 0.03, send: 0.3 }));
    }
    return end;
  },
  twinkle(E, t, o, R) {
    const pent = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'];
    const n = pent[o.note != null ? o.note % pent.length : Math.floor(R() * pent.length)];
    const f = nf(n);
    tone(E, { t, f, dur: 0.03, wave: 'p12s', vol: 0.24, a: 0.002, d: 0.22, s: 0.05, r: 0.15, send: 0.5 });
    return tone(E, { t: t + 0.035, f: f * 2, dur: 0.03, wave: 'tri', vol: 0.1, a: 0.003, d: 0.2, s: 0.05, r: 0.15, send: 0.5 });
  },
  whoosh(E, t) {
    return noise(E, { t, dur: 0.22, vol: 0.2, mode: 'long', rate: 1, ft: 'bandpass', ff: 350, fq: 1.4, ffp: [[0.18, 2600], [0.36, 1200]], a: 0.12, d: 0.1, s: 0.6, r: 0.14 });
  },
  cheer(E, t) {
    dipBgm(E, t, 2.0);
    return playJingle(E, 'cheer', t);
  },
  big(E, t) {
    dipBgm(E, t, 3.6);
    return playJingle(E, 'big', t);
  },
  question(E, t) {
    return playJingle(E, 'question', t);
  },
};

function dipBgm(E, t, len) {
  const g = E.jingleG.gain;
  hold(g, t);
  g.linearRampToValueAtTime(0.45, t + 0.08);
  g.setValueAtTime(0.45, t + len - 0.3);
  g.linearRampToValueAtTime(1, t + len + 0.3);
}

// ---------------------------------------------------------------- magnet (continuous)
function magnetAt(E, level, t) {
  const ctx = E.ctx;
  let M = E.mag;
  if (level == null) {
    if (!M) return;
    M.out.gain.setTargetAtTime(0, t, 0.018); // ~-50 dB after 80 ms
    for (const o of M.oscs) o.stop(t + 0.2);
    M.lfo.onended = () => { try { M.out.disconnect(); } catch (e) {} };
    E.mag = null;
    return;
  }
  level = Math.max(0, Math.min(1, +level || 0));
  if (!M) {
    M = E.mag = { oscs: [] };
    M.out = ctx.createGain();
    M.out.gain.setValueAtTime(0, t);
    M.out.connect(E.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    M.out.connect(send);
    send.connect(E.echo);
    M.trem = ctx.createGain(); // tremolo stage
    M.trem.gain.value = 0.75;
    M.trem.connect(M.out);
    M.lfo = ctx.createOscillator();
    M.lfo.frequency.setValueAtTime(5, t);
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    M.lfo.connect(lg);
    lg.connect(M.trem.gain);
    M.voices = [['p12s', 1, 0.5], ['tri', 1.0035, 1], ['tri', 2.003, 0.35]].map(([w, mul, v]) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(E.waves[w]);
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g);
      g.connect(M.trem);
      M.oscs.push(o);
      return { o, mul };
    });
    M.oscs.push(M.lfo);
    const f0 = 330 * Math.pow(2, level * 1.6);
    for (const v of M.voices) v.o.frequency.setValueAtTime(f0 * v.mul, t);
    for (const o of M.oscs) o.start(t);
  }
  const f = 330 * Math.pow(2, level * 1.6); // E4 -> ~1 kHz
  for (const v of M.voices) v.o.frequency.setTargetAtTime(f * v.mul, t, 0.05);
  M.lfo.frequency.setTargetAtTime(5 + level * 9, t, 0.05);
  M.out.gain.setTargetAtTime(0.03 + level * 0.14, t, 0.04);
}

// ---------------------------------------------------------------- public API
function playSfx(E, name, opts, t) {
  const fn = SFX[name];
  if (!fn) return 0;
  const o = opts || {};
  return fn(E, t, o, rng(o.seed));
}

/** Test hook: schedule a sound on any BaseAudioContext starting at t=0.05. Returns duration to render. */
export function _renderTo(ctx, name, opts = {}) {
  const E = buildEngine(ctx);
  const t = 0.05;
  const [kind, id] = name.split(':');
  if (kind === 'sfx') return playSfx(E, id, opts, t) + 0.6;
  if (kind === 'bgm') {
    const p = makePlayer(E, id, t);
    const secs = opts.seconds || 10;
    pump(E, p, secs);
    return secs + 1;
  }
  if (kind === 'magnet') {
    for (let i = 0; i <= 40; i++) magnetAt(E, i / 40, t + i * 0.05);
    magnetAt(E, 0.4, t + 2.3);
    magnetAt(E, null, t + 2.8);
    return 3.2;
  }
  if (kind === 'mix') {
    // bgm + sfx on top, worst-case-ish loudness check
    const p = makePlayer(E, 'play', t);
    pump(E, p, 6);
    playSfx(E, 'snap', {}, 0.5);
    playSfx(E, 'reveal', {}, 0.7);
    playSfx(E, 'big', {}, 1.5);
    for (let i = 0; i < 6; i++) playSfx(E, 'pop', { seed: i + 1 }, 1.6 + i * 0.25);
    for (let i = 0; i < 8; i++) playSfx(E, 'twinkle', { seed: i + 9 }, 1.7 + i * 0.15);
    return 7;
  }
  return 0;
}
export const SFX_NAMES = Object.keys(SFX);
export const BGM_NAMES = Object.keys(SONGS);

const NOOP = {
  unlock() {}, sfx() {}, bgm() {}, setMuted() {}, duck() {}, magnet() {},
  get muted() { return false; }, get ctx() { return null; },
};

export function createAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return NOOP;
  let E = null, dead = false;
  let muted = false, ducked = false, want = null;
  const players = [];
  let timer = null;

  function ensure() {
    if (E || dead) return E;
    try {
      const ctx = new AC({ latencyHint: 'interactive' });
      E = buildEngine(ctx);
      E.master.gain.value = muted ? 0 : 0.62;
      E.duckG.gain.value = ducked ? 0.25 : 1;
      if (ctx.addEventListener) ctx.addEventListener('statechange', () => { if (ctx.state === 'running') startWanted(); });
    } catch (e) {
      dead = true;
      E = null;
    }
    return E;
  }
  const running = () => E && E.ctx.state === 'running';

  function tick() {
    if (!E) return;
    const until = E.ctx.currentTime + STEP_LOOKAHEAD;
    for (let i = players.length - 1; i >= 0; i--) {
      const p = players[i];
      if (p.dead && E.ctx.currentTime > p.deadAt) {
        players.splice(i, 1);
        setTimeout(() => { try { p.g.disconnect(); } catch (e) {} }, 1500);
        continue;
      }
      if (!p.dead) pump(E, p, until);
    }
    if (!players.length && timer) { clearInterval(timer); timer = null; }
  }
  function fadeOutAll(t) {
    for (const p of players) {
      if (p.dead) continue;
      p.dead = true;
      p.deadAt = t + XFADE + 0.05;
      hold(p.g.gain, t);
      p.g.gain.linearRampToValueAtTime(0, t + XFADE);
    }
  }
  function startWanted() {
    if (!running()) return;
    const cur = players.find((p) => !p.dead);
    if ((cur && cur.name) === want) return;
    const t = E.ctx.currentTime;
    fadeOutAll(t);
    if (want) {
      const p = makePlayer(E, want, t + 0.06);
      p.g.gain.setValueAtTime(0, t);
      p.g.gain.linearRampToValueAtTime(1, t + XFADE);
      players.push(p);
      pump(E, p, t + STEP_LOOKAHEAD);
    }
    if (!timer) timer = setInterval(tick, TICK_MS);
  }
  function ramp(param, v, secs) {
    const t = E.ctx.currentTime;
    hold(param, t);
    param.linearRampToValueAtTime(v, t + secs);
  }

  return {
    unlock() {
      try {
        if (!ensure()) return;
        const ctx = E.ctx;
        if (ctx.state !== 'running' && ctx.resume) {
          const pr = ctx.resume();
          if (pr && pr.then) pr.then(startWanted, () => {});
        }
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
        startWanted();
      } catch (e) {}
    },
    sfx(name, opts) {
      try {
        if (!ensure()) return;
        if (!running()) { if (E.ctx.resume) E.ctx.resume().catch(() => {}); return; }
        playSfx(E, name, opts, E.ctx.currentTime + 0.01);
      } catch (e) {}
    },
    bgm(name) {
      try {
        want = name && SONGS[name] ? name : null;
        if (!ensure()) return;
        startWanted();
      } catch (e) {}
    },
    setMuted(b) {
      muted = !!b;
      try { if (E) ramp(E.master.gain, muted ? 0 : 0.62, 0.06); } catch (e) {}
    },
    get muted() { return muted; },
    duck(on) {
      ducked = !!on;
      try { if (E) ramp(E.duckG.gain, ducked ? 0.25 : 1, 0.2); } catch (e) {}
    },
    magnet(level) {
      try {
        if (level == null) { if (E && E.mag) magnetAt(E, null, E.ctx.currentTime); return; }
        if (!ensure() || !running()) return;
        magnetAt(E, level, E.ctx.currentTime);
      } catch (e) {}
    },
    get ctx() { return ensure() ? E.ctx : null; },
  };
}
