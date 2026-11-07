// Single-pointer input (mouse/touch/pen) mapped to buffer coordinates. Events are queued and consumed by the game
// each frame so nothing is lost; `onGesture` runs synchronously inside real user gestures (audio/speech unlock).
export function createInput(canvas, toBuffer, onGesture) {
  const q = [];
  const active = new Set();
  const pos = (e) => toBuffer(e.clientX, e.clientY);

  canvas.addEventListener('pointerdown', (e) => {
    active.add(e.pointerId);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pos(e);
    q.push({ t: 'down', id: e.pointerId, x: p.x, y: p.y, time: performance.now() });
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!active.has(e.pointerId)) { if (e.pointerType === 'mouse') q.push({ t: 'hover', x: p.x, y: p.y }); return; }
    // coalesce consecutive moves of the same pointer
    const last = q[q.length - 1];
    if (last && last.t === 'move' && last.id === e.pointerId) { last.x = p.x; last.y = p.y; } else q.push({ t: 'move', id: e.pointerId, x: p.x, y: p.y });
    e.preventDefault();
  }, { passive: false });

  const up = (e, cancel) => {
    if (!active.has(e.pointerId)) return;
    active.delete(e.pointerId);
    const p = pos(e);
    q.push({ t: cancel ? 'cancel' : 'up', id: e.pointerId, x: p.x, y: p.y, time: performance.now() });
  };
  canvas.addEventListener('pointerup', (e) => { up(e, false); onGesture && onGesture(); });
  canvas.addEventListener('pointercancel', (e) => up(e, true));
  canvas.addEventListener('lostpointercapture', (e) => { if (active.has(e.pointerId)) up(e, false); });
  // iOS only unlocks audio / speech on touchend / click, not touchstart
  canvas.addEventListener('touchend', () => onGesture && onGesture(), { passive: true });
  window.addEventListener('keydown', (e) => { onGesture && onGesture(); q.push({ t: 'key', key: e.key }); });
  const reset = () => { for (const id of active) q.push({ t: 'cancel', id, x: -1, y: -1 }); active.clear(); };
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
