// controls.js — first-person walk controls: dual floating joysticks (touch), keyboard + mouse (desktop),
// smooth look/move dynamics and circle-vs-AABB collision with sliding + substeps.
//   LEFT stick  = LOOK (yaw/pitch rate)      RIGHT stick = MOVE (relative to view yaw)
// yaw convention: yaw = 0 looks north (−Z); positive yaw turns left (counter-clockwise from above).
import * as THREE from 'three';

const DEG = Math.PI / 180;
export const PLAYER_R = 0.22;
export const EYE = 1.6;

export function createWalkControls({ layer, camera, getColliders, onFirstInput }) {
  const S = {
    x: 0, z: 0, yaw: 0, pitch: 0,
    vx: 0, vz: 0, yawVel: 0, pitchVel: 0,
    enabled: true, bob: 0, speed: 0,
  };
  const CFG = {
    maxSpeed: 1.6, runSpeed: 2.4, accel: 7.5,           // m/s, 1/s smoothing
    yawRate: 2.5, pitchRate: 1.5, lookSmooth: 16,       // rad/s at full deflection
    dead: 0.08, R: 58,                                   // stick radius (CSS px)
    dragLook: 0.0058, mouseLook: 0.0032,                 // rad per px
    pitchMax: 80 * DEG,
  };

  // ── joystick DOM ─────────────────────────────────────────────────────────
  const mk = (cls, parent) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };
  const sticks = {};
  for (const side of ['look', 'move']) {
    const base = mk('joy joy-' + side, layer);
    const ring = mk('joy-ring', base);
    const knob = mk('joy-knob', base);
    const label = mk('joy-label', base);
    label.innerHTML = side === 'look' ? '<b>視角</b><span>LOOK</span>' : '<b>移動</b><span>MOVE</span>';
    sticks[side] = { side, base, knob, ring, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  }
  let dragLook = null;    // {id, lx, ly}
  const keys = new Set();
  let first = true;
  const firstInput = () => { if (first) { first = false; onFirstInput && onFirstInput(); } };

  function restPos(st) {
    const r = layer.getBoundingClientRect();
    const sa = getSafe();
    const y = r.height - sa.b - 112;
    const x = st.side === 'look' ? sa.l + 96 : r.width - sa.r - 96;
    return [x, y];
  }
  function placeBase(st, x, y) { st.base.style.transform = `translate3d(${x}px, ${y}px, 0)`; }
  function placeKnob(st, dx, dy) { st.knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; }
  function resetStick(st) {
    st.id = null; st.dx = st.dy = 0;
    st.base.classList.remove('active');
    const [x, y] = restPos(st); placeBase(st, x, y); placeKnob(st, 0, 0);
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  function getSafe() {
    const cs = getComputedStyle(probe), v = (x) => parseFloat(x) || 0;
    return { l: v(cs.paddingLeft), r: v(cs.paddingRight), b: v(cs.paddingBottom), t: v(cs.paddingTop) };
  }
  const relayout = () => { for (const st of Object.values(sticks)) if (st.id === null) resetStick(st); };
  relayout();
  window.addEventListener('resize', relayout);

  // ── pointer handling (multitouch by pointerId) ──────────────────────────
  let mouseDrag = null;
  layer.addEventListener('pointerdown', (e) => {
    if (!S.enabled) return;
    e.preventDefault();
    firstInput();
    const r = layer.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'mouse') {
      mouseDrag = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      try { layer.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    const inBottom = y > r.height * 0.42;
    const st = inBottom ? (x < r.width / 2 ? sticks.look : sticks.move) : null;
    if (st && st.id === null) {
      st.id = e.pointerId;
      const m = CFG.R + 14;
      st.ox = Math.min(Math.max(x, m), r.width - m);
      st.oy = Math.min(Math.max(y, m), r.height - m);
      st.dx = st.dy = 0;
      st.base.classList.add('active');
      placeBase(st, st.ox, st.oy); placeKnob(st, 0, 0);
      try { layer.setPointerCapture(e.pointerId); } catch {}
    } else if (!dragLook) {
      dragLook = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      try { layer.setPointerCapture(e.pointerId); } catch {}
    }
  }, { passive: false });

  layer.addEventListener('pointermove', (e) => {
    if (mouseDrag && e.pointerId === mouseDrag.id) {
      const dx = e.clientX - mouseDrag.lx, dy = e.clientY - mouseDrag.ly;
      mouseDrag.lx = e.clientX; mouseDrag.ly = e.clientY;
      S.yaw -= dx * CFG.mouseLook; S.pitch -= dy * CFG.mouseLook; clampPitch();
      return;
    }
    if (document.pointerLockElement === layer && e.pointerType === 'mouse') {
      S.yaw -= e.movementX * CFG.mouseLook; S.pitch -= e.movementY * CFG.mouseLook; clampPitch(); return;
    }
    for (const st of Object.values(sticks)) {
      if (st.id !== e.pointerId) continue;
      const r = layer.getBoundingClientRect();
      let dx = e.clientX - r.left - st.ox, dy = e.clientY - r.top - st.oy;
      const L = Math.hypot(dx, dy);
      if (L > CFG.R) { dx *= CFG.R / L; dy *= CFG.R / L; }
      st.dx = dx / CFG.R; st.dy = dy / CFG.R;
      placeKnob(st, dx, dy);
      e.preventDefault();
      return;
    }
    if (dragLook && e.pointerId === dragLook.id) {
      const dx = e.clientX - dragLook.lx, dy = e.clientY - dragLook.ly;
      dragLook.lx = e.clientX; dragLook.ly = e.clientY;
      S.yaw -= dx * CFG.dragLook; S.pitch -= dy * CFG.dragLook; clampPitch();   // view follows the finger
    }
  }, { passive: false });

  const end = (e) => {
    if (mouseDrag && e.pointerId === mouseDrag.id) mouseDrag = null;
    for (const st of Object.values(sticks)) if (st.id === e.pointerId) resetStick(st);
    if (dragLook && e.pointerId === dragLook.id) dragLook = null;
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(ev, end);
  const releaseAll = () => { for (const st of Object.values(sticks)) resetStick(st); dragLook = null; mouseDrag = null; keys.clear(); };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ── keyboard ─────────────────────────────────────────────────────────────
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
    KeyQ: 'tl', KeyE: 'tr', ShiftLeft: 'run', ShiftRight: 'run' };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = KEYMAP[e.code]; if (!k) return;
    keys.add(k); firstInput();
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });

  function clampPitch() { S.pitch = Math.max(-CFG.pitchMax, Math.min(CFG.pitchMax, S.pitch)); }

  const curve = (m, p) => {                 // deadzone + response curve (fine aim near centre)
    if (m <= CFG.dead) return 0;
    const t = Math.min(1, (m - CFG.dead) / (1 - CFG.dead));
    return p === 'look' ? 0.22 * t + 0.78 * t * t * t : Math.pow(t, 1.35);
  };

  // ── collision ────────────────────────────────────────────────────────────
  function resolve(px, pz, boxes, r) {
    let nx = 0, nz = 0;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const b of boxes) {
        const cx = Math.max(b.x0, Math.min(px, b.x1)), cz = Math.max(b.z0, Math.min(pz, b.z1));
        let dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2), ux, uz, push;
        if (d < 1e-6) {                       // centre inside box → shortest exit
          const l = px - b.x0, rr = b.x1 - px, t = pz - b.z0, bb = b.z1 - pz;
          const m = Math.min(l, rr, t, bb);
          if (m === l) { ux = -1; uz = 0; } else if (m === rr) { ux = 1; uz = 0; } else if (m === t) { ux = 0; uz = -1; } else { ux = 0; uz = 1; }
          push = m + r;
        } else { ux = dx / d; uz = dz / d; push = r - d; }
        px += ux * (push + 1e-4); pz += uz * (push + 1e-4);
        nx += ux; nz += uz; moved = true;
      }
      if (!moved) break;
    }
    return [px, pz, nx, nz];
  }

  function collideMove(dx, dz) {
    const all = getColliders();
    const span = Math.hypot(dx, dz) + PLAYER_R + 0.1;
    const near = all.filter((b) => b.x1 > S.x - span && b.x0 < S.x + span && b.z1 > S.z - span && b.z0 < S.z + span);
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.04));
    for (let i = 0; i < n; i++) {
      const [px, pz, cx, cz] = resolve(S.x + dx / n, S.z + dz / n, near, PLAYER_R);
      S.x = px; S.z = pz;
      const cl = Math.hypot(cx, cz);
      if (cl > 1e-6) {                        // remove velocity into the obstacle → slide
        const ux = cx / cl, uz = cz / cl, vn = S.vx * ux + S.vz * uz;
        if (vn < 0) { S.vx -= ux * vn; S.vz -= uz * vn; }
      }
    }
  }

  // ── per-frame update ─────────────────────────────────────────────────────
  function update(dt) {
    dt = Math.min(dt, 0.05);
    // look
    let ty = 0, tp = 0;
    if (S.enabled) {
      const L = sticks.look, m = Math.hypot(L.dx, L.dy);
      if (L.id !== null && m > 0) {
        const k = curve(m, 'look') / m;
        ty = -L.dx * k * CFG.yawRate; tp = -L.dy * k * CFG.pitchRate;
      }
      if (keys.has('tl')) ty += CFG.yawRate * 0.7;
      if (keys.has('tr')) ty -= CFG.yawRate * 0.7;
    }
    const ls = 1 - Math.exp(-dt * CFG.lookSmooth);
    S.yawVel += (ty - S.yawVel) * ls; S.pitchVel += (tp - S.pitchVel) * ls;
    S.yaw += S.yawVel * dt; S.pitch += S.pitchVel * dt; clampPitch();

    // move
    let f = 0, s = 0, max = CFG.maxSpeed;
    if (S.enabled) {
      const M = sticks.move, m = Math.hypot(M.dx, M.dy);
      if (M.id !== null && m > 0) { const k = curve(m, 'move') / m; f = -M.dy * k; s = M.dx * k; }
      if (keys.has('f')) f += 1; if (keys.has('b')) f -= 1; if (keys.has('l')) s -= 1; if (keys.has('r')) s += 1;
      const mm = Math.hypot(f, s); if (mm > 1) { f /= mm; s /= mm; }
      if (keys.has('run')) max = CFG.runSpeed;
    }
    const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
    const tvx = (-sy * f + cy * s) * max, tvz = (-cy * f - sy * s) * max;
    const a = 1 - Math.exp(-dt * CFG.accel);
    S.vx += (tvx - S.vx) * a; S.vz += (tvz - S.vz) * a;
    if (Math.abs(S.vx) < 1e-4 && Math.abs(S.vz) < 1e-4) { S.vx = S.vz = 0; }
    if (S.vx || S.vz) collideMove(S.vx * dt, S.vz * dt);
    S.speed = Math.hypot(S.vx, S.vz);
    S.bob += dt * S.speed * 5.2;
    applyCamera();
  }

  function applyCamera() {
    const bobA = 0.011 * Math.min(1, S.speed / CFG.maxSpeed);
    camera.position.set(S.x, EYE + Math.sin(S.bob * 2) * bobA, S.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(S.pitch, S.yaw, 0);
  }

  function setPose(x, z, yawDeg = null, pitchDeg = null, resolveCollision = true) {
    S.x = x; S.z = z; S.vx = S.vz = 0;
    if (yawDeg != null) S.yaw = yawDeg * DEG;
    if (pitchDeg != null) S.pitch = pitchDeg * DEG;
    clampPitch();
    if (resolveCollision) { const [px, pz] = resolve(x, z, getColliders(), PLAYER_R); S.x = px; S.z = pz; }
    applyCamera();
  }

  function setEnabled(v) { S.enabled = v; if (!v) releaseAll(); layer.classList.toggle('off', !v); }

  return { state: S, cfg: CFG, update, setPose, setEnabled, applyCamera, sticks, resolve, releaseAll };
}

export function isFree(x, z, colliders, r = PLAYER_R + 0.05) {
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  return true;
}
