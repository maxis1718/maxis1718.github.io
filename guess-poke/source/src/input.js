// Single-pointer input (mouse/touch/pen) mapped to buffer coordinates. Events are queued and consumed by the game
// each frame so nothing is lost; `onGesture` runs synchronously inside real user gestures (audio/speech unlock).
export function createInput(canvas, toBuffer, onGesture) {
  const q = [];
  let active = null; // pointerId being tracked
  const pos = (e) => toBuffer(e.clientX, e.clientY);

  canvas.addEventListener('pointerdown', (e) => {
    if (active !== null && active !== e.pointerId) return; // ignore second finger
    active = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pos(e);
    q.push({ t: 'down', x: p.x, y: p.y, time: performance.now() });
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (e.pointerId !== active) { if (e.pointerType === 'mouse') q.push({ t: 'hover', x: p.x, y: p.y }); return; }
    // coalesce consecutive moves
    const last = q[q.length - 1];
    if (last && last.t === 'move') { last.x = p.x; last.y = p.y; } else q.push({ t: 'move', x: p.x, y: p.y });
    e.preventDefault();
  }, { passive: false });

  const up = (e, cancel) => {
    if (e.pointerId !== active) return;
    active = null;
    const p = pos(e);
    q.push({ t: cancel ? 'cancel' : 'up', x: p.x, y: p.y, time: performance.now() });
  };
  canvas.addEventListener('pointerup', (e) => { up(e, false); onGesture && onGesture(); });
  canvas.addEventListener('pointercancel', (e) => up(e, true));
  canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === active) up(e, false); });
  // iOS only unlocks audio / speech on touchend / click, not touchstart
  canvas.addEventListener('touchend', () => onGesture && onGesture(), { passive: true });
  window.addEventListener('keydown', (e) => { onGesture && onGesture(); q.push({ t: 'key', key: e.key }); });
  const reset = () => { if (active !== null) { active = null; q.push({ t: 'cancel', x: -1, y: -1 }); } };
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  // block page gestures
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    drain() { const out = q.splice(0, q.length); return out; },
    push(ev) { q.push(ev); }, // for tests
  };
}
