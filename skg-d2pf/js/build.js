// build.js — builds the house (static merged geometry, doors, colliders, lighting anchors) from PLAN.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoAcc, pointInPoly, distToPoly, polyBBox, polyArea, polyCentroid } from './geom.js';

const EPS = 1e-4;

// ── Plan preparation (non-destructive; PLAN itself is never edited) ─────────
export function preparePlan(PLAN) {
  const P = JSON.parse(JSON.stringify(PLAN));
  P.ceiling = P.ceiling || 2.75;
  P.doorHead = P.doorHead || 2.1;
  for (const w of P.walls) { if (w.y0 == null) w.y0 = 0; if (w.y1 == null) w.y1 = P.ceiling; }
  for (const r of P.rooms) {
    r.ceilingH = r.ceilingH || P.ceiling;
    r.bbox = polyBBox(r.poly);
    r.area = Math.abs(polyArea(r.poly));
    r.centroid = polyCentroid(r.poly);
    if (!pointInPoly(r.centroid[0], r.centroid[1], r.poly)) r.centroid = [(r.bbox.x0 + r.bbox.x1) / 2, (r.bbox.z0 + r.bbox.z1) / 2];
  }
  P.fixes = [];
  // Data-gap guard: the partition between Bedroom 3 and Living (x 9.527–9.753, z 2.016–4.095) is missing in
  // plan.js (see engine report). Patch it only while it is missing so a corrected plan.js wins automatically.
  const covered = (x, z) => P.walls.some((w) => w.y0 < 0.5 && w.y1 > 2 && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);
  if (P.rooms.some((r) => r.id === 'bed3') && !covered(9.64, 3.0) && !covered(9.64, 2.5)) {
    P.walls.push({ x0: 9.527, z0: 2.016, x1: 9.753, z1: 4.095, y0: 0, y1: P.ceiling, kind: 'wall', patched: true });
    P.fixes.push('added missing wall bed3|living x9.527–9.753 z2.016–4.095');
  }
  return P;
}

export function makeRoomLookup(P) {
  const rooms = [...P.rooms].sort((a, b) => a.area - b.area);
  const at = (x, z) => rooms.find((r) => pointInPoly(x, z, r.poly)) || null;
  const near = (x, z, maxD = 0.4) => {
    let best = null, bd = maxD;
    for (const r of rooms) { const d = distToPoly(x, z, r.poly); if (d < bd) { bd = d; best = r; } }
    return best;
  };
  return { at, near, rooms };
}

function faceClass(room) {
  if (!room) return 'facade';
  if (room.floor === 'bath') return 'bath';
  if (room.floor === 'balcony' || room.floor === 'ledge' || room.floor === 'service') return 'facade';
  return 'wall';
}

function mergeToMesh(geos, mat, opts = {}) {
  const list = geos.filter((g) => g && g.attributes.position.count > 0);
  if (!list.length) return null;
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
  m.matrixAutoUpdate = false; m.updateMatrix();
  if (opts.name) m.name = opts.name;
  return m;
}

// ── Main builder ────────────────────────────────────────────────────────────
export function buildHouse(P, M, STYLE) {
  const L = makeRoomLookup(P);
  const root = new THREE.Group(); root.name = 'house';
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = 'ceilings';   // hidden in overview
  const roofGroup = new THREE.Group(); roofGroup.name = 'roof';
  const colliders = [];          // static AABBs {x0,z0,x1,z1}
  const H = P.ceiling;

  // ---------- floors -------------------------------------------------------
  const floorGeos = {};
  for (const r of P.rooms) {
    const shape = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    // planks along the longer room axis; tiles don't care
    const uv = g.attributes.uv, pos = g.attributes.position;
    const alongZ = (r.bbox.z1 - r.bbox.z0) > (r.bbox.x1 - r.bbox.x0) * 1.05;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (alongZ) uv.setXY(i, z, x); else uv.setXY(i, x, -z);
    }
    const key = M.floor[r.floor] ? r.floor : 'tile';
    (floorGeos[key] ||= []).push(g);
  }
  for (const [k, list] of Object.entries(floorGeos)) {
    const m = mergeToMesh(list, M.floor[k], { name: 'floor_' + k });
    root.add(m);
  }

  // ---------- walls (faces classified per room side) -----------------------
  const acc = { wall: new GeoAcc(), bath: new GeoAcc(), facade: new GeoAcc(), cap: new GeoAcc(), sill: new GeoAcc(),
    skirt: new GeoAcc(), slab: new GeoAcc(), thresh: new GeoAcc() };
  const ao = new GeoAcc(true);
  const aoW = STYLE.ao.width;
  const windowAt = (w) => P.windows.find((win) => win.x0 >= w.x0 - 0.05 && win.x1 <= w.x1 + 0.05 && win.z0 >= w.z0 - 0.05 && win.z1 <= w.z1 + 0.05);
  const insideAnyWall = (x, z, y) => P.walls.some((w) => x > w.x0 + EPS && x < w.x1 - EPS && z > w.z0 + EPS && z < w.z1 - EPS && y > w.y0 && y < w.y1);

  // The 4 vertical faces of a box: axis/sign/plane/u-range
  function sideFaces(w) {
    return [
      { axis: 'x', sign: 1, at: w.x1, u0: w.z0, u1: w.z1 },
      { axis: 'x', sign: -1, at: w.x0, u0: w.z0, u1: w.z1 },
      { axis: 'z', sign: 1, at: w.z1, u0: w.x0, u1: w.x1 },
      { axis: 'z', sign: -1, at: w.z0, u0: w.x0, u1: w.x1 },
    ];
  }
  const pt = (f, u, off) => (f.axis === 'x' ? [f.at + f.sign * off, u] : [u, f.at + f.sign * off]);
  function sampleRoom(f, u) {
    const [x, z] = pt(f, u, 0.05);
    const r = L.at(x, z); if (r) return r;
    const [x2, z2] = pt(f, u, 0.15);
    const r2 = L.at(x2, z2); if (r2) return r2;
    return (f.u1 - f.u0 < 0.45) ? L.near(x, z, 0.3) : null;     // short jamb / end faces
  }

  for (const w of P.walls) {
    const isFull = w.y1 >= H - 0.01;
    const midY = (w.y0 + w.y1) / 2;
    if (w.y0 < 0.5) colliders.push({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1, src: 'wall' });
    for (const f of sideFaces(w)) {
      // split face into runs of same room
      const len = f.u1 - f.u0, n = Math.max(1, Math.ceil(len / 0.05));
      const runs = [];
      for (let i = 0; i < n; i++) {
        const ua = f.u0 + (len * i) / n, ub = f.u0 + (len * (i + 1)) / n, um = (ua + ub) / 2;
        // hidden if another wall covers just outside this face at this height
        const [hx, hz] = pt(f, um, 0.01);
        const hidden = insideAnyWall(hx, hz, midY);
        const room = hidden ? null : sampleRoom(f, um);
        const last = runs[runs.length - 1];
        if (last && last.room === room && last.hidden === hidden) last.u1 = ub;
        else runs.push({ u0: ua, u1: ub, room, hidden });
      }
      for (const run of runs) {
        if (run.hidden) continue;
        const cls = faceClass(run.room);
        // vertical extent: no need to go above the room's ceiling (bath false ceilings)
        let y1 = w.y1;
        if (run.room && run.room.ceiling !== false && cls !== 'facade') y1 = Math.min(w.y1, run.room.ceilingH);
        if (y1 > w.y0 + EPS) acc[cls].face(f.axis, f.sign, f.at, run.u0, run.u1, w.y0, y1);
        // slab edge below floor (overview solidity) for exterior faces
        if (cls === 'facade' && w.y0 < EPS && !run.room) acc.slab.face(f.axis, f.sign, f.at, run.u0, run.u1, -0.3, 0);
        if (!run.room || cls === 'facade') continue;
        const inRoom = (() => { const [x, z] = pt(f, (run.u0 + run.u1) / 2, 0.05); return !!L.at(x, z); })();
        // skirting
        const fl = run.room.floor;
        if (w.y0 < EPS && inRoom && (fl === 'wood' || fl === 'tile' || fl === 'lobby')) {
          const t = STYLE.skirting.t, h = STYLE.skirting.h;
          if (f.axis === 'x') {
            const a = f.at, b = f.at + f.sign * t;
            acc.skirt.box(Math.min(a, b), 0, run.u0, Math.max(a, b), h, run.u1, { ny: true });
          } else {
            const a = f.at, b = f.at + f.sign * t;
            acc.skirt.box(run.u0, 0, Math.min(a, b), run.u1, h, Math.max(a, b), { ny: true });
          }
        }
        // fake AO strips (floor + ceiling)
        if (inRoom) {
          const strip = (y, up, strength) => {
            const s = f.sign, d1 = 0.07, d2 = aoW;
            const rows = [[0, strength], [d1, strength * 0.45], [d2, 0]];
            for (let k = 0; k < 2; k++) {
              const [oa, aa] = rows[k], [ob, ab] = rows[k + 1];
              let A, B, Cc, D;
              if (f.axis === 'x') {
                const xa = f.at + s * oa, xb = f.at + s * ob;
                A = [xa, y, run.u0]; B = [xa, y, run.u1]; Cc = [xb, y, run.u1]; D = [xb, y, run.u0];
              } else {
                const za = f.at + s * oa, zb = f.at + s * ob;
                A = [run.u0, y, za]; B = [run.u1, y, za]; Cc = [run.u1, y, zb]; D = [run.u0, y, zb];
              }
              const cols = [[0, 0, 0, aa], [0, 0, 0, aa], [0, 0, 0, ab], [0, 0, 0, ab]];
              // fix winding so the quad faces up (floor) or down (ceiling)
              const e1 = [B[0] - A[0], B[2] - A[2]], e2 = [D[0] - A[0], D[2] - A[2]];
              const cy = e1[1] * e2[0] - e1[0] * e2[1];   // y of (B-A)×(D-A) — sign tells facing
              const wantUp = up;
              if ((cy > 0) === wantUp) ao.quad(A, B, Cc, D, [0, up ? 1 : -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], cols);
              else ao.quad(A, D, Cc, B, [0, up ? 1 : -1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], [cols[0], cols[3], cols[2], cols[1]]);
            }
          };
          if (w.y0 < EPS && fl !== 'bath') strip(0.002, true, STYLE.ao.floor);
          if (fl === 'bath' && w.y0 < EPS) strip(0.002, true, STYLE.ao.floor * 0.6);
          if (run.room.ceiling !== false && w.y1 >= run.room.ceilingH - 0.01) strip(run.room.ceilingH - 0.002, false, STYLE.ao.ceiling);
        }
      }
    }
    // top face
    if (isFull) acc.cap.face('y', 1, w.y1, w.x0, w.x1, w.z0, w.z1);
    else {
      const win = windowAt(w);
      const tgt = win && w.y1 <= win.y0 + 0.01 ? 'sill' : (w.kind === 'parapet' || w.kind === 'lowwall' ? 'facade' : 'wall');
      acc[tgt].face('y', 1, w.y1, w.x0, w.x1, w.z0, w.z1);
    }
    // soffit of lintels / window heads
    if (w.y0 > EPS) acc.wall.face('y', -1, w.y0, w.x0, w.x1, w.z0, w.z1);
    if (w.y0 < EPS) acc.slab.box(w.x0, -0.3, w.z0, w.x1, 0, w.z1, { py: true, ny: true });
  }

  // door thresholds: lintels with no low wall underneath
  const lintels = P.walls.filter((w) => w.y0 >= 1.8 && w.y1 > w.y0 &&
    !P.walls.some((o) => o !== w && o.y0 < 0.5 && o.x0 < w.x1 - 0.02 && o.x1 > w.x0 + 0.02 && o.z0 < w.z1 - 0.02 && o.z1 > w.z0 + 0.02));
  for (const w of lintels) acc.thresh.box(w.x0, -0.3, w.z0, w.x1, 0.004, w.z1, { ny: true });

  // ---------- windows ------------------------------------------------------
  const glassAcc = new GeoAcc(), frameAcc = new GeoAcc();
  const FW = STYLE.frame.w, FD = 0.06;
  for (const win of P.windows) {
    const alongX = (win.x1 - win.x0) >= (win.z1 - win.z0);
    const c = alongX ? (win.z0 + win.z1) / 2 : (win.x0 + win.x1) / 2;
    const a0 = alongX ? win.x0 : win.z0, a1 = alongX ? win.x1 : win.z1;
    const boxA = (u0, u1, y0, y1, d = FD) => alongX ? frameAcc.box(u0, y0, c - d / 2, u1, y1, c + d / 2) : frameAcc.box(c - d / 2, y0, u0, c + d / 2, y1, u1);
    // glass (two faces)
    if (alongX) { glassAcc.face('z', 1, c + 0.003, a0, a1, win.y0, win.y1); glassAcc.face('z', -1, c - 0.003, a0, a1, win.y0, win.y1); }
    else { glassAcc.face('x', 1, c + 0.003, a0, a1, win.y0, win.y1); glassAcc.face('x', -1, c - 0.003, a0, a1, win.y0, win.y1); }
    boxA(a0, a1, win.y0, win.y0 + FW); boxA(a0, a1, win.y1 - FW, win.y1);
    boxA(a0, a0 + FW, win.y0, win.y1); boxA(a1 - FW, a1, win.y0, win.y1);
    const n = Math.max(1, win.frames || 1);
    for (let i = 1; i < n; i++) { const u = a0 + ((a1 - a0) * i) / n; boxA(u - FW * 0.6, u + FW * 0.6, win.y0, win.y1); }
    if (win.y1 - win.y0 > 1.5) { const y = win.y1 - 0.5; boxA(a0, a1, y - FW * 0.5, y + FW * 0.5); }   // top-hung vent transom
    // interior stone sill board
    const room = L.at(...(alongX ? [(a0 + a1) / 2, c + 0.3] : [c + 0.3, (a0 + a1) / 2])) ? 1 : -1;
    const sillW = P.walls.find((w) => Math.abs(w.y1 - win.y0) < 0.02 && (alongX ? w.x0 <= a0 + 0.05 && w.x1 >= a1 - 0.05 && w.z0 <= c && w.z1 >= c : w.z0 <= a0 + 0.05 && w.z1 >= a1 - 0.05 && w.x0 <= c && w.x1 >= c));
    if (sillW && win.y0 > 0.3) {
      const inner = alongX ? (room > 0 ? sillW.z1 : sillW.z0) : (room > 0 ? sillW.x1 : sillW.x0);
      const outer = inner + room * 0.03;
      const lo = Math.min(inner, outer, c), hi = Math.max(inner, outer, c);
      if (alongX) acc.sill.box(a0 - 0.02, win.y0, lo, a1 + 0.02, win.y0 + 0.02, hi, { ny: false });
      else acc.sill.box(lo, win.y0, a0 - 0.02, hi, win.y0 + 0.02, a1 + 0.02);
    }
    if (win.y0 < 1.0) colliders.push({ x0: win.x0, z0: win.z0, x1: win.x1, z1: win.z1, src: 'window' });
  }

  // ---------- railings -----------------------------------------------------
  const railGlassAcc = new GeoAcc(), railMetalAcc = new GeoAcc();
  for (const r of P.railings) {
    const alongX = (r.x1 - r.x0) >= (r.z1 - r.z0);
    const c = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
    const h = r.h || 1.1;
    const mbox = (u0, u1, y0, y1, d) => alongX ? railMetalAcc.box(u0, y0, c - d / 2, u1, y1, c + d / 2) : railMetalAcc.box(c - d / 2, y0, u0, c + d / 2, y1, u1);
    if (r.kind === 'bar') {
      const bw = STYLE.railing.barW, gap = STYLE.railing.barGap;
      mbox(a0, a1, h - 0.05, h, 0.05); mbox(a0, a1, 0.08, 0.11, 0.03);
      for (let u = a0 + 0.03; u < a1 - 0.01; u += gap) mbox(u, u + bw, 0.08, h - 0.05, bw);
    } else {
      const panels = Math.max(1, Math.round((a1 - a0) / 1.25));
      const pl = (a1 - a0) / panels;
      for (let i = 0; i < panels; i++) {
        const u0 = a0 + i * pl + 0.006, u1 = a0 + (i + 1) * pl - 0.006;
        if (alongX) { railGlassAcc.face('z', 1, c + 0.006, u0, u1, 0.06, h - 0.04); railGlassAcc.face('z', -1, c - 0.006, u0, u1, 0.06, h - 0.04); }
        else { railGlassAcc.face('x', 1, c + 0.006, u0, u1, 0.06, h - 0.04); railGlassAcc.face('x', -1, c - 0.006, u0, u1, 0.06, h - 0.04); }
      }
      mbox(a0, a1, h - 0.045, h, 0.055);          // top rail
      mbox(a0, a1, 0, 0.07, 0.07);                 // base shoe
    }
    colliders.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, src: 'rail' });
  }

  // ---------- ceilings, downlights, light spots -----------------------------
  const ceilGeos = [], dl = new GeoAcc(), trim = new GeoAcc(), glow = new GeoAcc();
  const spots = [];
  const R = STYLE.downlight.radius, seg = 16;
  const disc = (acc2, x, y, z, r0, r1) => {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      const p = (rr, t) => [x + Math.cos(t) * rr, y, z + Math.sin(t) * rr];
      // facing down: winding A, B, C with normal -Y
      if (r0 === 0) acc2.p.push(...[x, y, z], ...p(r1, a), ...p(r1, b));
      else acc2.p.push(...p(r0, a), ...p(r1, a), ...p(r1, b), ...p(r0, a), ...p(r1, b), ...p(r0, b));
      const nv = r0 === 0 ? 3 : 6;
      for (let k = 0; k < nv; k++) { acc2.n.push(0, -1, 0); acc2.uv.push(0, 0); }
    }
  };
  for (const r of P.rooms) {
    if (r.ceiling === false) continue;
    const shape = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);                 // (x, z) → (x, 0, z), normal +Z → -Y (faces down)
    g.translate(0, r.ceilingH, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    ceilGeos.push(g);
    // downlight grid
    const { x0, z0, x1, z1 } = r.bbox, sp = STYLE.downlight.spacing;
    const ins = Math.min(STYLE.downlight.inset, (x1 - x0) / 2, (z1 - z0) / 2);
    const nx = Math.max(1, Math.round((x1 - x0 - 2 * ins) / sp) + 1), nz = Math.max(1, Math.round((z1 - z0 - 2 * ins) / sp) + 1);
    const pts = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = nx === 1 ? (x0 + x1) / 2 : x0 + ins + ((x1 - x0 - 2 * ins) * i) / (nx - 1);
      const z = nz === 1 ? (z0 + z1) / 2 : z0 + ins + ((z1 - z0 - 2 * ins) * j) / (nz - 1);
      if (pointInPoly(x, z, r.poly) && distToPoly(x, z, r.poly) > 0.3) pts.push([x, z]);
    }
    if (!pts.length) pts.push(r.centroid);
    const y = r.ceilingH - 0.003;
    for (const [x, z] of pts) {
      disc(dl, x, y - 0.001, z, 0, R);
      disc(trim, x, y - 0.0005, z, R, R + 0.014);
      const s = 0.55;
      glow.quad([x - s, y, z - s], [x + s, y, z - s], [x + s, y, z + s], [x - s, y, z + s], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    // evening point-light anchor spots (one per ~8 m²)
    const k = Math.max(1, Math.min(3, Math.round(r.area / 6)));
    if (r.floor !== 'ledge' && r.id !== 'lobby') {
      if (k === 1) spots.push({ room: r.id, x: r.centroid[0], z: r.centroid[1], y: r.ceilingH - 0.5 });
      else {
        const alongX = (x1 - x0) > (z1 - z0);
        for (let i = 0; i < k; i++) {
          const t = (i + 0.5) / k;
          const x = alongX ? x0 + (x1 - x0) * t : r.centroid[0], z = alongX ? r.centroid[1] : z0 + (z1 - z0) * t;
          if (pointInPoly(x, z, r.poly)) spots.push({ room: r.id, x, z, y: r.ceilingH - 0.5 });
        }
      }
    }
  }
  const ceilMesh = mergeToMesh(ceilGeos, M.ceiling, { cast: true, name: 'ceiling' });
  ceilingGroup.add(ceilMesh);
  // the merged downlight geometry: winding check (we pushed raw), make sure it faces down
  const fixDown = (a) => { const g = a.geometry(); return g; };
  const dlMesh = mergeToMesh([fixDown(dl)], M.downlight, { name: 'downlights', receive: false });
  const trimMesh = mergeToMesh([fixDown(trim)], M.downTrim, { name: 'downtrim', receive: false });
  const glowMesh = mergeToMesh([glow.geometry()], M.glow, { name: 'glow', receive: false });
  M.downlight.side = THREE.DoubleSide; M.downTrim.side = THREE.DoubleSide; M.glow.side = THREE.DoubleSide;
  for (const m of [dlMesh, trimMesh, glowMesh]) if (m) ceilingGroup.add(m);
  glowMesh.renderOrder = 2;

  // roof slab (= floor above): shadow caster only, follows the unit footprint so it never overhangs windows
  const roofAcc = new GeoAcc();
  const roofGeos = [];
  for (const r of P.rooms) {
    if (r.ceiling === false) continue;
    const sh = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); g.translate(0, H + 0.02, 0);
    g.deleteAttribute('uv'); roofGeos.push(g);
  }
  for (const w of P.walls) if (w.y1 >= H - 0.01) roofAcc.box(w.x0, H + 0.005, w.z0, w.x1, H + 0.04, w.z1, { ny: true });
  const rg2 = roofAcc.geometry(); rg2.deleteAttribute('uv');
  roofGeos.push(rg2);
  const roof = new THREE.Mesh(mergeGeometries(roofGeos.map((g) => g.index ? g.toNonIndexed() : g), false), M.shadowOnly);
  roof.castShadow = true; roof.receiveShadow = false; roof.name = 'roofCaster';
  roofGroup.add(roof);

  // ---------- room slab edges (for overview) --------------------------------
  for (const r of P.rooms) {
    const pl = r.poly;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
      const [ax, az] = pl[j], [bx, bz] = pl[i];
      if (Math.abs(ax - bx) < EPS) { const s = L.at(ax + 0.05, (az + bz) / 2) === r ? -1 : 1; acc.slab.face('x', s, ax, Math.min(az, bz), Math.max(az, bz), -0.3, 0); }
      else if (Math.abs(az - bz) < EPS) { const s = L.at((ax + bx) / 2, az + 0.05) === r ? -1 : 1; acc.slab.face('z', s, az, Math.min(ax, bx), Math.max(ax, bx), -0.3, 0); }
    }
  }

  // ---------- doors --------------------------------------------------------
  const doors = [];
  const frameAcc2 = new GeoAcc();
  for (const d of P.doors) {
    if (d.type === 'swing') doors.push(buildSwing(d, P, M, STYLE, frameAcc2, acc.thresh));
    else if (d.type === 'slide') doors.push(buildSlide(d, P, M, STYLE, frameAcc, acc));
  }
  for (const d of doors) if (d && d.group) root.add(d.group);

  // ---------- assemble static meshes ---------------------------------------
  const add = (a, mat, o = {}) => { if (!a.empty) { const m = mergeToMesh([a.geometry()], mat, o); root.add(m); return m; } };
  add(acc.wall, M.wall, { cast: true, name: 'walls' });
  add(acc.bath, M.bathWall, { cast: true, name: 'bathWalls' });
  add(acc.facade, M.facade, { cast: true, name: 'facade' });
  const capMesh = add(acc.cap, M.wallCap, { cast: true, name: 'wallCaps' });
  add(acc.sill, M.sill, { cast: true, name: 'sills' });
  add(acc.skirt, M.skirting, { name: 'skirting' });
  add(acc.slab, M.slab, { name: 'slab' });
  add(acc.thresh, M.sill, { name: 'thresholds' });
  add(frameAcc, M.frame, { cast: true, name: 'frames' });
  add(frameAcc2, M.doorFrame, { cast: true, name: 'doorFrames' });
  add(railMetalAcc, M.railMetal, { cast: true, name: 'railMetal' });
  const gm = add(glassAcc, M.glass, { name: 'glass', receive: false }); if (gm) gm.renderOrder = 3;
  const rg = add(railGlassAcc, M.railGlass, { name: 'railGlass', receive: false }); if (rg) rg.renderOrder = 3;
  const aoMesh = add(ao, M.ao, { name: 'aoStrips', receive: false }); if (aoMesh) aoMesh.renderOrder = 1;
  root.add(ceilingGroup); root.add(roofGroup);

  return { root, ceilingGroup, roofGroup, colliders, doors, spots, lookup: L, aoMesh, capMesh };
}

// ── swing door ──────────────────────────────────────────────────────────────
function findOpening(d, P) {
  const [hx, hz] = d.hinge, m = 0.09;
  const lint = P.walls.filter((w) => w.y0 >= 1.8 && hx >= w.x0 - m && hx <= w.x1 + m && hz >= w.z0 - m && hz <= w.z1 + m);
  if (!lint.length) return null;
  // choose the lintel whose long axis matches the closed leaf direction
  const rad = (d.closedRot * Math.PI) / 180, dx = Math.cos(rad), dz = -Math.sin(rad);
  lint.sort((a, b) => {
    const sa = Math.abs(dx) > Math.abs(dz) ? a.x1 - a.x0 : a.z1 - a.z0;
    const sb = Math.abs(dx) > Math.abs(dz) ? b.x1 - b.x0 : b.z1 - b.z0;
    return sb - sa;
  });
  return lint[0];
}

function buildSwing(d, P, M, STYLE, frameAcc, threshAcc) {
  const group = new THREE.Group(); group.name = 'door_' + d.id;
  const pivot = new THREE.Group();
  pivot.position.set(d.hinge[0], 0, d.hinge[1]);
  group.add(pivot);
  const h = d.h || 2.1, t = d.thickness || 0.045, W = d.width;
  const isMain = d.id === 'main';
  const leafAcc = new GeoAcc();
  leafAcc.box(0.005, 0.008, -t / 2, W - 0.005, h - 0.004, t / 2);
  const leaf = new THREE.Mesh(leafAcc.geometry(), isMain ? M.mainDoor : M.door);
  leaf.castShadow = false; leaf.receiveShadow = true;
  // handles: lever + rose on both faces
  const hAcc = new GeoAcc();
  const hxp = W - 0.075, hy = 1.0;
  for (const s of [1, -1]) {
    const z0 = s * (t / 2), z1 = s * (t / 2 + 0.012);
    hAcc.box(hxp - 0.03, hy - 0.03, Math.min(z0, z1), hxp + 0.03, hy + 0.03, Math.max(z0, z1));          // rose
    const zz = s * (t / 2 + 0.05);
    hAcc.box(hxp - 0.009, hy - 0.009, Math.min(z0, zz), hxp + 0.009, hy + 0.009, Math.max(z0, zz));      // neck
    hAcc.box(hxp - 0.13, hy - 0.009, zz - 0.009, hxp + 0.009, hy + 0.009, zz + 0.009);                    // lever
  }
  if (isMain) hAcc.box(hxp - 0.02, 1.3, t / 2, hxp + 0.02, 1.45, t / 2 + 0.015);   // digital lock pad
  const handle = new THREE.Mesh(hAcc.geometry(), M.handle);
  pivot.add(leaf, handle);
  const toRad = (deg) => (deg * Math.PI) / 180;
  pivot.rotation.y = toRad(d.closedRot);

  // frame / linings / side panel
  const op = findOpening(d, P);
  let center = [d.hinge[0] + Math.cos(toRad(d.closedRot)) * W / 2, d.hinge[1] - Math.sin(toRad(d.closedRot)) * W / 2];
  const fixedColliders = [];
  if (op) {
    const alongX = (op.x1 - op.x0) >= (op.z1 - op.z0);
    const a0 = alongX ? op.x0 : op.z0, a1 = alongX ? op.x1 : op.z1;
    const c0 = alongX ? op.z0 : op.x0, c1 = alongX ? op.z1 : op.x1;
    const oh = op.y0;
    const B = (u0, u1, y0, y1, w0, w1) => alongX ? frameAcc.box(u0, y0, w0, u1, y1, w1) : frameAcc.box(w0, y0, u0, w1, y1, u1);
    // leaf extent along the opening axis
    const hinU = alongX ? d.hinge[0] : d.hinge[1];
    const rad = toRad(d.closedRot);
    const dirU = alongX ? Math.cos(rad) : -Math.sin(rad);
    const freeU = hinU + dirU * W;
    const l0 = Math.min(hinU, freeU), l1 = Math.max(hinU, freeU);
    let j0 = a0, j1 = a1;                  // inner jamb faces
    const jt = 0.02;
    // side panel or widened jamb
    const leftGap = l0 - a0, rightGap = a1 - l1;
    if (leftGap > 0.12) { B(a0, l0 - 0.01, 0, oh, c0 + (c1 - c0) / 2 - t / 2, c0 + (c1 - c0) / 2 + t / 2); fixedColliders.push(alongX ? { x0: a0, x1: l0, z0: c0, z1: c1 } : { z0: a0, z1: l0, x0: c0, x1: c1 }); j0 = l0 - 0.01 - jt; }
    else j0 = Math.max(a0, l0 - jt - 0.003);
    if (rightGap > 0.12) { B(l1 + 0.01, a1, 0, oh, c0 + (c1 - c0) / 2 - t / 2, c0 + (c1 - c0) / 2 + t / 2); fixedColliders.push(alongX ? { x0: l1, x1: a1, z0: c0, z1: c1 } : { z0: l1, z1: a1, x0: c0, x1: c1 }); j1 = l1 + 0.01 + jt; }
    else j1 = Math.min(a1, l1 + jt + 0.003);
    // jamb linings (fill from wall end to jamb face) + head
    B(a0, j0 + jt, 0, oh, c0 - 0.005, c1 + 0.005);
    B(j1 - jt, a1, 0, oh, c0 - 0.005, c1 + 0.005);
    B(a0, a1, oh - 0.02, oh, c0 - 0.005, c1 + 0.005);
    // door stop strips
    const cm = (c0 + c1) / 2;
    B(j0 + jt, j1 - jt, oh - 0.035, oh - 0.02, cm - 0.02, cm + 0.02);
    // architraves on both faces
    const aw = 0.065, ap = 0.012;
    for (const [w0, w1] of [[c0 - ap, c0], [c1, c1 + ap]]) {
      B(a0 - aw, a0 + 0.0, 0, oh + aw, w0, w1);
      B(a1, a1 + aw, 0, oh + aw, w0, w1);
      B(a0 - aw, a1 + aw, oh, oh + aw, w0, w1);
    }
    center = alongX ? [(l0 + l1) / 2, cm] : [cm, (l0 + l1) / 2];
  }
  return {
    type: 'swing', id: d.id, group, pivot, open: 0, vel: 0, target: 0, center,
    closedRot: toRad(d.closedRot), openRot: toRad(d.openRot), hinge: d.hinge, width: W, thickness: t, fixedColliders,
  };
}

// ── sliding door ────────────────────────────────────────────────────────────
function buildSlide(d, P, M, STYLE, frameAcc, acc) {
  const group = new THREE.Group(); group.name = 'slide_' + d.id;
  const alongX = (d.x1 - d.x0) >= (d.z1 - d.z0);
  const a0 = alongX ? d.x0 : d.z0, a1 = alongX ? d.x1 : d.z1;
  const c = alongX ? (d.z0 + d.z1) / 2 : (d.x0 + d.x1) / 2;
  const h = d.h || 2.4, H = P.ceiling;
  const glass = d.glass !== false;
  // opening = range minus walls (y0<1) overlapping the door strip
  let segs = [[a0, a1]];
  for (const w of P.walls) {
    if (w.y0 > 1) continue;
    const wc0 = alongX ? w.z0 : w.x0, wc1 = alongX ? w.z1 : w.x1;
    if (wc1 <= c - 0.01 || wc0 >= c + 0.01) continue;
    const w0 = alongX ? w.x0 : w.z0, w1 = alongX ? w.x1 : w.z1;
    segs = segs.flatMap(([s0, s1]) => (w1 <= s0 || w0 >= s1) ? [[s0, s1]] : [[s0, Math.max(s0, w0)], [Math.min(s1, w1), s1]].filter(([p, q]) => q - p > 0.05));
  }
  segs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  let [o0, o1] = segs[0] || [a0, a1];
  // snap small gaps (< 6 cm) to neighbouring wall faces so no sliver of sky shows
  for (const w of P.walls) {
    if (w.y0 > 1) continue;
    const wc0 = alongX ? w.z0 : w.x0, wc1 = alongX ? w.z1 : w.x1;
    if (wc1 < c - 0.15 || wc0 > c + 0.15) continue;
    const w0 = alongX ? w.x0 : w.z0, w1 = alongX ? w.x1 : w.z1;
    if (w0 > o1 && w0 - o1 < 0.06) o1 = w0;
    if (w1 < o0 && o0 - w1 < 0.06) o0 = w1;
  }
  const n = Math.max(1, d.panels || 1);
  const ov = 0.04, pw = (o1 - o0) / n + (n > 1 ? ov : 0);
  // header above door if no wall covers it
  const covered = P.walls.some((w) => w.y0 >= h - 0.06 && (alongX ? (w.x0 <= (o0 + o1) / 2 && w.x1 >= (o0 + o1) / 2 && w.z0 <= c && w.z1 >= c) : (w.z0 <= (o0 + o1) / 2 && w.z1 >= (o0 + o1) / 2 && w.x0 <= c && w.x1 >= c)));
  if (!covered && h < H - 0.01) {
    const d0 = alongX ? d.z0 : d.x0, d1 = alongX ? d.z1 : d.x1;
    if (alongX) { acc.wall.box(o0, h, d0, o1, H, d1, { py: true }); acc.cap.face('y', 1, H, o0, o1, d0, d1); }
    else { acc.wall.box(d0, h, o0, d1, H, o1, { py: true }); acc.cap.face('y', 1, H, d0, d1, o0, o1); }
  }
  // track / threshold
  { const d0 = alongX ? d.z0 : d.x0, d1 = alongX ? d.z1 : d.x1;
    if (alongX) acc.thresh.box(o0, -0.3, d0, o1, 0.006, d1, { ny: true }); else acc.thresh.box(d0, -0.3, o0, d1, 0.006, o1, { ny: true }); }
  // frame around opening (head + jambs) for glass doors
  const FW = STYLE.frame.w;
  const fbox = (u0, u1, y0, y1, w0, w1) => alongX ? frameAcc.box(u0, y0, w0, u1, y1, w1) : frameAcc.box(w0, y0, u0, w1, y1, u1);
  if (glass) {
    fbox(o0 - 0.0, o0 + 0.03, 0, h, c - 0.06, c + 0.06);
    fbox(o1 - 0.03, o1, 0, h, c - 0.06, c + 0.06);
    fbox(o0, o1, h - 0.04, h, c - 0.06, c + 0.06);
  }
  const panels = [];
  for (let i = 0; i < n; i++) {
    const pg = new THREE.Group();
    const fa = new GeoAcc(), ga = new GeoAcc();
    const track = n === 1 ? 0 : ((i === 0 || i === n - 1) ? -1 : 1);
    const dz = track * 0.022, th = glass ? 0.035 : 0.04;
    // panel local: u from 0..pw, centred on depth 0
    const pb = (u0, u1, y0, y1, acc2, dd = th) => alongX ? acc2.box(u0, y0, -dd / 2, u1, y1, dd / 2) : acc2.box(-dd / 2, y0, u0, dd / 2, y1, u1);
    if (glass) {
      pb(0, FW, 0.01, h - 0.04, fa); pb(pw - FW, pw, 0.01, h - 0.04, fa);
      pb(0, pw, 0.01, 0.01 + FW * 1.4, fa); pb(0, pw, h - 0.04 - FW, h - 0.04, fa);
      if (alongX) { ga.face('z', 1, 0.004, FW, pw - FW, 0.01 + FW, h - 0.04 - FW); ga.face('z', -1, -0.004, FW, pw - FW, 0.01 + FW, h - 0.04 - FW); }
      else { ga.face('x', 1, 0.004, FW, pw - FW, 0.01 + FW, h - 0.04 - FW); ga.face('x', -1, -0.004, FW, pw - FW, 0.01 + FW, h - 0.04 - FW); }
      // pull handle
      const hu = (i < n / 2) ? pw - 0.06 : 0.04;
      pb(hu, hu + 0.02, 0.9, 1.25, fa, th + 0.05);
    } else {
      pb(0, pw, 0.01, h - 0.01, fa);
      const hu = 0.06; pb(hu, hu + 0.015, 0.85, 1.15, fa, th + 0.03);
    }
    const fm = new THREE.Mesh(fa.geometry(), glass ? M.frame : M.slideOpaque);
    fm.castShadow = false; fm.receiveShadow = true;
    pg.add(fm);
    if (!ga.empty) { const gm = new THREE.Mesh(ga.geometry(), M.glass); gm.renderOrder = 3; pg.add(gm); }
    const closedU = o0 + i * ((o1 - o0) / n) - (n > 1 && i > 0 ? ov / 2 : 0);
    let openU = closedU;
    if (n === 1) {
      // slide toward the side with more wall (pocket)
      const leftRoom = o0 - a0, rightRoom = a1 - o1;
      openU = leftRoom >= rightRoom ? closedU - (pw - 0.12) : closedU + (pw - 0.12);
    } else if (n === 2) {
      openU = i === 0 ? closedU : o0;   // panel 1 slides over panel 0
    } else {
      const half = n / 2;
      if (i === 0 || i === n - 1) openU = closedU;
      else if (i < half) openU = o0 + (i - 0) * 0.0 + 0.0;                    // stack over first panel
      else openU = o1 - pw;                                                   // stack over last panel
    }
    if (alongX) pg.position.set(closedU, 0, c + dz); else pg.position.set(c + dz, 0, closedU);
    group.add(pg);
    panels.push({ g: pg, closedU, openU, pw, dz });
  }
  return {
    type: 'slide', id: d.id, group, panels, alongX, c, open: 0, vel: 0, target: 0,
    center: alongX ? [(o0 + o1) / 2, c] : [c, (o0 + o1) / 2], seg: [o0, o1], depth: alongX ? d.z1 - d.z0 : d.x1 - d.x0,
  };
}

// collider boxes for doors in their current state
export function doorColliders(doors, out) {
  for (const d of doors) {
    if (!d) continue;
    if (d.type === 'swing') {
      for (const f of d.fixedColliders) out.push(f);
      const ang = d.pivot.rotation.y;
      const closedness = Math.abs(ang - d.closedRot);
      if (closedness < 0.35) {
        const [hx, hz] = d.hinge, ex = hx + Math.cos(ang) * d.width, ez = hz - Math.sin(ang) * d.width;
        const t = d.thickness / 2 + 0.01;
        out.push({ x0: Math.min(hx, ex) - t, x1: Math.max(hx, ex) + t, z0: Math.min(hz, ez) - t, z1: Math.max(hz, ez) + t, src: 'door' });
      }
    } else {
      for (const p of d.panels) {
        const u = d.alongX ? p.g.position.x : p.g.position.z;
        const cc = d.c + p.dz, t = 0.03;
        if (d.alongX) out.push({ x0: u, x1: u + p.pw, z0: cc - t, z1: cc + t, src: 'slide' });
        else out.push({ z0: u, z1: u + p.pw, x0: cc - t, x1: cc + t, src: 'slide' });
      }
    }
  }
  return out;
}
