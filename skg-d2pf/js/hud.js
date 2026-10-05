// hud.js — glass HUD: room card, toolbar, minimap, room menu, controls hint.
const ICON = {
  overview: '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.2-6.5L14 17v4M8.5 11.5l2.5-4 3 1.2 2 3.3M11 7.5l-1 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  rooms: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 12h9M12.5 3.5v13M16 12h4.5"/></svg>',
  ambient: '<svg viewBox="0 0 24 24"><path d="M5 4.5h14"/><path d="M6.5 4.5c0 0 .2 9 5.5 9s5.5-9 5.5-9"/><path d="M12 16.5v3M7.2 15.2l-1.8 2.2M16.8 15.2l1.8 2.2"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="m3 16.5 13.5-13.5 4.5 4.5L7.5 21 3 16.5Z"/><path d="m7 12.5 2 2M10 9.5l1.5 1.5M13 6.5l2 2"/></svg>',
};

export function createHUD({ PLAN, lookup, onToggleMode, onToggleTheme, onToggleAmbient, onPickRoom, onToggleLabels, onMinimapTap, touch }) {
  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <div class="card room-card" id="roomCard"><div class="zh" id="roomZh">—</div><div class="en"><span id="roomEn"></span><span class="dims" id="roomDims"></span></div></div>
    <div class="toolbar card" id="toolbar">
      <button id="bMode" class="tb" aria-label="mode">${ICON.overview}<span>俯瞰</span></button>
      <button id="bTheme" class="tb" aria-label="theme">${ICON.moon}<span>夜</span></button>
      <button id="bAmbient" class="tb" aria-label="ambient lighting">${ICON.ambient}<span>氛圍燈</span></button>
      <button id="bRooms" class="tb" aria-label="rooms">${ICON.rooms}<span>房間</span></button>
      <button id="bLabels" class="tb" aria-label="labels">${ICON.ruler}<span>標尺</span></button>
    </div>
    <div class="card minimap" id="minimapWrap"><canvas id="minimap"></canvas></div>
    <div class="menu card" id="menu" hidden><div class="menu-h">房間 <small>Rooms</small></div><div class="menu-list" id="menuList"></div></div>
    <div class="hint" id="hint" hidden></div>`;
  const $ = (id) => document.getElementById(id);
  const roomZh = $('roomZh'), roomEn = $('roomEn'), roomDims = $('roomDims');
  const bMode = $('bMode'), bTheme = $('bTheme'), bRooms = $('bRooms'), bLabels = $('bLabels'), bAmbient = $('bAmbient');
  const menu = $('menu'), menuList = $('menuList');

  const stop = (e) => { e.stopPropagation(); };
  for (const el of [bMode, bTheme, bAmbient, bRooms, bLabels, menu, $('minimapWrap')]) {
    el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true });
  }
  bMode.addEventListener('click', () => onToggleMode());
  bTheme.addEventListener('click', () => onToggleTheme());
  bAmbient.addEventListener('click', () => onToggleAmbient && onToggleAmbient());
  bLabels.addEventListener('click', () => onToggleLabels());
  bRooms.addEventListener('click', () => { menu.hidden = !menu.hidden; bRooms.classList.toggle('on', !menu.hidden); });

  // room menu (skip duplicates like the two A/C ledges)
  const seen = new Set();
  const rooms = PLAN.rooms.filter((r) => { const k = r.zh + r.name; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const r of rooms) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.innerHTML = `<span class="mz">${r.zh}</span><span class="me">${r.name}</span><span class="md">${r.dims || ''}</span>`;
    b.addEventListener('click', () => { menu.hidden = true; bRooms.classList.remove('on'); onPickRoom(r); });
    menuList.appendChild(b);
  }
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== bRooms && !bRooms.contains(e.target)) { menu.hidden = true; bRooms.classList.remove('on'); }
  });

  // ── minimap ──────────────────────────────────────────────────────────────
  const mm = $('minimap'), wrap = $('minimapWrap');
  const B = PLAN.bounds, pad = 6;
  let scale = 1, cw = 0, ch = 0, dpr = 1, base = null;
  const FILL = { wood: '#c8ab86', tile: '#d9d6cf', bath: '#a9b6bc', balcony: '#b4ae9f', ledge: '#8e8b85', service: '#b4ae9f', lobby: '#bdb7ac' };
  function layoutMinimap() {
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const W = small ? 128 : 210;
    const H = Math.round(W * (B.z1 - B.z0 + 0.4) / (B.x1 - B.x0 + 0.4));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = W; ch = H;
    mm.style.width = W + 'px'; mm.style.height = H + 'px';
    mm.width = Math.round(W * dpr); mm.height = Math.round(H * dpr);
    scale = (W - pad * 2) / (B.x1 - B.x0);
    base = document.createElement('canvas'); base.width = mm.width; base.height = mm.height;
    const g = base.getContext('2d'); g.scale(dpr, dpr);
    for (const r of PLAN.rooms) {
      g.beginPath();
      r.poly.forEach(([x, z], i) => { const [px, py] = toMap(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.closePath(); g.fillStyle = FILL[r.floor] || '#ccc'; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
    }
    g.fillStyle = '#2a2826';
    for (const w of PLAN.walls) {
      if (w.y0 > 0.5) continue;
      const [a, b] = toMap(w.x0, w.z0), [c, d] = toMap(w.x1, w.z1);
      g.fillRect(a, b, Math.max(0.8, c - a), Math.max(0.8, d - b));
    }
    g.fillStyle = '#9a8670';      // feature walls (wabi-sabi TV wall)
    for (const f of PLAN.features || []) { const [a, b] = toMap(f.x0, f.z0), [c, d] = toMap(f.x1, f.z1); g.fillRect(a - 0.6, b, Math.max(1.6, c - a + 1.2), Math.max(1.6, d - b)); }
    g.fillStyle = '#7fb4cf';
    for (const w of PLAN.windows) { const [a, b] = toMap(w.x0, w.z0), [c, d] = toMap(w.x1, w.z1); g.fillRect(a - 0.5, b - 0.5, c - a + 1, d - b + 1); }
    // doors: swing leaves as thin arcs-less lines, sliders as bars
    g.strokeStyle = '#c08a52'; g.lineWidth = 1.1; g.fillStyle = '#c08a52';
    for (const d of PLAN.doors || []) {
      if (d.type === 'swing') {
        const r = (d.closedRot * Math.PI) / 180, [hx, hz] = d.hinge;
        const [a1, b1] = toMap(hx, hz), [a2, b2] = toMap(hx + Math.cos(r) * d.width, hz - Math.sin(r) * d.width);
        g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
      } else if (d.x0 != null) {
        const [a1, b1] = toMap(d.x0, d.z0), [a2, b2] = toMap(d.x1, d.z1);
        g.fillRect(a1, b1, Math.max(1, a2 - a1), Math.max(1, b2 - b1));
      }
    }
  }
  function toMap(x, z) { return [pad + (x - B.x0) * scale, pad + (z - B.z0) * scale]; }
  layoutMinimap();
  window.addEventListener('resize', layoutMinimap);
  wrap.addEventListener('click', (e) => {
    const r = mm.getBoundingClientRect();
    const x = (e.clientX - r.left - pad) / scale + B.x0, z = (e.clientY - r.top - pad) / scale + B.z0;
    onMinimapTap && onMinimapTap(x, z);
  });

  let lastRoomId = null;
  function drawMinimap(px, pz, yaw, roomId) {
    const g = mm.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, mm.width, mm.height);
    g.drawImage(base, 0, 0);
    g.scale(dpr, dpr);
    if (roomId) {
      const r = PLAN.rooms.find((q) => q.id === roomId);
      if (r) {
        g.beginPath(); r.poly.forEach(([x, z], i) => { const [a, b] = toMap(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
        g.closePath(); g.fillStyle = 'rgba(233,196,143,0.55)'; g.fill();
      }
    }
    const [x, y] = toMap(px, pz);
    const dx = -Math.sin(yaw), dy = -Math.cos(yaw), a = Math.atan2(dy, dx), L = 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, L);
    grd.addColorStop(0, 'rgba(255,214,150,0.85)'); grd.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(x, y); g.arc(x, y, L, a - 0.55, a + 0.55); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fillStyle = '#e08a3c'; g.fill();
    lastRoomId = roomId;
  }

  function setRoom(r) {
    if (!r) return;
    roomZh.textContent = r.zh; roomEn.textContent = r.name; roomDims.textContent = r.dims ? ' · ' + r.dims : '';
  }
  function setMode(mode) {
    bMode.innerHTML = mode === 'walk' ? `${ICON.overview}<span>俯瞰</span>` : `${ICON.walk}<span>漫遊</span>`;
    bLabels.classList.toggle('dim', mode === 'walk');
    document.body.classList.toggle('mode-overview', mode !== 'walk');
  }
  function setTheme(name) { bTheme.innerHTML = name === 'day' ? `${ICON.moon}<span>夜</span>` : `${ICON.sun}<span>日</span>`; }
  function setLabels(on) { bLabels.classList.toggle('on', on); }
  function setAmbient(on) { bAmbient.classList.toggle('on', !!on); }

  // ── one-time controls hint ───────────────────────────────────────────────
  const hint = $('hint');
  function showHint() {
    let seenHint = false;
    try { seenHint = localStorage.getItem('skg-hint') === '1'; } catch {}
    if (seenHint) return;
    hint.innerHTML = touch
      ? `<div class="hint-row"><div class="hint-stick"><i></i></div><div><b>左手：轉動視角</b><span>Left stick · look around</span></div></div>
         <div class="hint-row"><div class="hint-stick r"><i></i></div><div><b>右手：前後左右移動</b><span>Right stick · walk</span></div></div>
         <div class="hint-foot">輕觸任意處開始 · Tap to begin</div>`
      : `<div class="hint-row"><div class="kbd">W A S D</div><div><b>移動</b><span>Move (Shift = faster)</span></div></div>
         <div class="hint-row"><div class="kbd">拖曳</div><div><b>滑鼠拖曳轉視角</b><span>Drag to look · Q/E turn</span></div></div>
         <div class="hint-foot">點擊任意處開始 · Click to begin</div>`;
    hint.hidden = false;
    const close = () => {
      hint.classList.add('bye'); setTimeout(() => (hint.hidden = true), 400);
      try { localStorage.setItem('skg-hint', '1'); } catch {}
      window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', close, true);
    };
    window.addEventListener('pointerdown', close, true); window.addEventListener('keydown', close, true);
  }

  return { setRoom, setMode, setTheme, setLabels, setAmbient, drawMinimap, showHint, closeMenu: () => { menu.hidden = true; } };
}
