// build.js — builds the house (static merged geometry, doors, colliders, lighting anchors) from PLAN.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoAcc, pointInPoly, distToPoly, polyBBox, polyArea, polyCentroid } from './geom.js';
import { makeGrazeTexture, rawOutput } from './materials.js';
import { buildDownlights } from './lighting.js';

const OUTDOOR = ['balcony', 'decking', 'ledge', 'service'];

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
  if (OUTDOOR.includes(room.floor)) return 'facade';
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
    skirt: new GeoAcc(), slab: new GeoAcc(), thresh: new GeoAcc(), black: new GeoAcc(), clear: new GeoAcc(), alw: new GeoAcc() };
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
  // u-intervals of face f in [u0,u1] NOT covered by a PLAN feature (feature walls get no skirting / AO strips)
  const FEATS = (P.features || []).filter((f) => !f.type || f.type === 'wall' || f.finish);     // feature walls
  const SKY = (P.features || []).filter((f) => f.type === 'skylight');
  function minusFeatures(f, u0, u1) {
    let out = [[u0, u1]];
    for (const ft of FEATS) {
      const flush = f.axis === 'x' ? (f.sign < 0 ? Math.abs(ft.x1 - f.at) < 0.03 : Math.abs(ft.x0 - f.at) < 0.03)
        : (f.sign < 0 ? Math.abs(ft.z1 - f.at) < 0.03 : Math.abs(ft.z0 - f.at) < 0.03);
      if (!flush) continue;
      const c0 = (f.axis === 'x' ? ft.z0 : ft.x0) - 0.01, c1 = (f.axis === 'x' ? ft.z1 : ft.x1) + 0.01;
      out = out.flatMap(([a, b]) => (c1 <= a || c0 >= b) ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]].filter(([p, q]) => q - p > 0.01));
    }
    return out;
  }
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
        const fl = run.room.floor;
        for (const [su0, su1] of minusFeatures(f, run.u0, run.u1)) {
        // skirting
        if (w.y0 < EPS && inRoom && (fl === 'wood' || fl === 'tile' || fl === 'lobby')) {
          const t = STYLE.skirting.t, h = STYLE.skirting.h;
          if (f.axis === 'x') {
            const a = f.at, b = f.at + f.sign * t;
            acc.skirt.box(Math.min(a, b), 0, su0, Math.max(a, b), h, su1, { ny: true });
          } else {
            const a = f.at, b = f.at + f.sign * t;
            acc.skirt.box(su0, 0, Math.min(a, b), su1, h, Math.max(a, b), { ny: true });
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
                A = [xa, y, su0]; B = [xa, y, su1]; Cc = [xb, y, su1]; D = [xb, y, su0];
              } else {
                const za = f.at + s * oa, zb = f.at + s * ob;
                A = [su0, y, za]; B = [su1, y, za]; Cc = [su1, y, zb]; D = [su0, y, zb];
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
    const part = win.kind === 'partition';
    const alongX = (win.x1 - win.x0) >= (win.z1 - win.z0);
    const c = alongX ? (win.z0 + win.z1) / 2 : (win.x0 + win.x1) / 2;
    const a0 = alongX ? win.x0 : win.z0, a1 = alongX ? win.x1 : win.z1;
    const fa = part ? acc.black : frameAcc, ga = part ? acc.clear : glassAcc;
    const fw = part ? STYLE.partition.frameW : FW, fd = part ? STYLE.partition.frameD : FD;
    const boxA = (u0, u1, y0, y1, d = fd) => alongX ? fa.box(u0, y0, c - d / 2, u1, y1, c + d / 2) : fa.box(c - d / 2, y0, u0, c + d / 2, y1, u1);
    // glass (two faces)
    if (alongX) { ga.face('z', 1, c + 0.003, a0, a1, win.y0, win.y1); ga.face('z', -1, c - 0.003, a0, a1, win.y0, win.y1); }
    else { ga.face('x', 1, c + 0.003, a0, a1, win.y0, win.y1); ga.face('x', -1, c - 0.003, a0, a1, win.y0, win.y1); }
    boxA(a0, a1, win.y0, win.y0 + fw); boxA(a0, a1, win.y1 - fw, win.y1);
    boxA(a0, a0 + fw, win.y0, win.y1); boxA(a1 - fw, a1, win.y0, win.y1);
    const n = Math.max(1, win.frames || 1);
    for (let i = 1; i < n; i++) { const u = a0 + ((a1 - a0) * i) / n; boxA(u - fw * (part ? 0.5 : 0.6), u + fw * (part ? 0.5 : 0.6), win.y0, win.y1); }
    if (part) { if (win.y0 < 1.0) colliders.push({ x0: win.x0, z0: win.z0, x1: win.x1, z1: win.z1, src: 'partition' }); continue; }
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

  // ---------- feature walls (PLAN.features) --------------------------------
  const features = [], washers = [], sideSlots = [];
  for (const ft of FEATS) {
    const out = buildFeature(ft, P, M, STYLE, L, ceilingGroup, root);
    if (!out) continue;
    features.push(out); colliders.push(out.collider);
    if (out.washer) washers.push(out.washer);
    if (out.slots) sideSlots.push(out.slots);
  }

  // ---------- ceilings (with skylight holes) + skylights ---------------------
  const ceilGeos = [];
  for (const r of P.rooms) {
    if (r.ceiling === false) continue;
    const shape = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, z)));
    for (const sk of SKY) {
      if (!pointInPoly((sk.x0 + sk.x1) / 2, (sk.z0 + sk.z1) / 2, r.poly)) continue;
      shape.holes.push(new THREE.Path([new THREE.Vector2(sk.x0, sk.z0), new THREE.Vector2(sk.x1, sk.z0), new THREE.Vector2(sk.x1, sk.z1), new THREE.Vector2(sk.x0, sk.z1)]));
    }
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);                 // (x, z) → (x, 0, z), normal +Z → -Y (faces down)
    g.translate(0, r.ceilingH, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    ceilGeos.push(g);
  }
  const ceilMesh = mergeToMesh(ceilGeos, M.ceiling, { cast: true, name: 'ceiling' });
  ceilingGroup.add(ceilMesh);
  const skylights = SKY.map((sk) => buildSkylight(sk, P, M, STYLE, L, ceilingGroup));

  // ---------- recessed downlights (only artificial sources) -----------------
  const downlights = buildDownlights(P, M, STYLE, L, { wallFeatures: FEATS, skylights: SKY });
  for (const m of downlights.fittings) ceilingGroup.add(m);
  root.add(downlights.pools, downlights.scallops);

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
    else if (d.type === 'bifold') doors.push(buildBifold(d, P, M, STYLE, acc));
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
  add(acc.black, M.frameBlack, { cast: true, name: 'framesBlack' });
  const cg = add(acc.clear, M.glassClear, { name: 'glassClear', receive: false }); if (cg) cg.renderOrder = 3;
  add(frameAcc2, M.doorFrame, { cast: true, name: 'doorFrames' });
  add(acc.alw, M.alWhite, { cast: true, name: 'alWhite' });
  add(railMetalAcc, M.railMetal, { cast: true, name: 'railMetal' });
  const gm = add(glassAcc, M.glass, { name: 'glass', receive: false }); if (gm) gm.renderOrder = 3;
  const rg = add(railGlassAcc, M.railGlass, { name: 'railGlass', receive: false }); if (rg) rg.renderOrder = 3;
  const aoMesh = add(ao, M.ao, { name: 'aoStrips', receive: false }); if (aoMesh) aoMesh.renderOrder = 1;
  root.add(ceilingGroup); root.add(roofGroup);

  return { root, ceilingGroup, roofGroup, colliders, doors, lookup: L, aoMesh, capMesh, features, washers, sideSlots, skylights, downlights };
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

// ── feature wall (PLAN.features) ───────────────────────────────────────────
function aoQuad(acc, A, B, Cc, D, aa, ab, up) {      // floor/ceiling AO quad A-B (edge, alpha aa) → D-C (alpha ab)
  const cols = [[0, 0, 0, aa], [0, 0, 0, aa], [0, 0, 0, ab], [0, 0, 0, ab]];
  const e1 = [B[0] - A[0], B[2] - A[2]], e2 = [D[0] - A[0], D[2] - A[2]];
  const cy = e1[1] * e2[0] - e1[0] * e2[1];
  if ((cy > 0) === up) acc.quad(A, B, Cc, D, [0, up ? 1 : -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], cols);
  else acc.quad(A, D, Cc, B, [0, up ? 1 : -1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], [cols[0], cols[3], cols[2], cols[1]]);
}

function buildFeature(ft, P, M, STYLE, L, ceilingGroup, root) {
  const H = P.ceiling, FWc = STYLE.featureWall, g = FWc.gapW;
  const thinX = (ft.x1 - ft.x0) < (ft.z1 - ft.z0);
  const axis = thinX ? 'x' : 'z';
  const a0 = thinX ? ft.z0 : ft.x0, a1 = thinX ? ft.z1 : ft.x1, am = (a0 + a1) / 2;
  const at = (off) => thinX ? [off, am] : [am, off];
  // front = the side that faces a room
  const sign = L.at(...at((thinX ? ft.x0 : ft.z0) - 0.12)) ? -1 : 1;
  const front = thinX ? (sign < 0 ? ft.x0 : ft.x1) : (sign < 0 ? ft.z0 : ft.z1);
  const back = thinX ? (sign < 0 ? ft.x1 : ft.x0) : (sign < 0 ? ft.z1 : ft.z0);
  const room = L.at(...at(front + sign * 0.2));
  const y0 = ft.y0 || 0, top = Math.min(ft.y1 ?? H, room ? room.ceilingH : H);
  const u0 = a0 + g, u1 = a1 - g, yt = top - g;
  const SS = STYLE.sideSlot, sw = ft.sideSlots ? SS.w : 0;      // recessed LED channel at each end
  const group = new THREE.Group(); group.name = 'feature_' + ft.id;

  // front surface: one non-repeating texture, uv 0..1 over the whole panel
  const faceUV = (geo) => {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const along = thinX ? pos.getZ(i) : pos.getX(i);
      const u = (along - a0) / (a1 - a0);
      uv.setXY(i, sign * (thinX ? -1 : 1) > 0 ? u : 1 - u, (pos.getY(i) - y0) / (top - y0));
    }
    return geo;
  };
  const fA = new GeoAcc(); fA.face(axis, sign, front, u0 + sw, u1 - sw, y0, yt);
  const fg = faceUV(fA.geometry());
  const faceMat = M.makeFeatureWall(a1 - a0, top - y0);
  const face = new THREE.Mesh(fg, faceMat);
  face.castShadow = true; face.receiveShadow = true; face.name = 'featureFace';
  // exposed timber edges (ends + top)
  const eA = new GeoAcc(), lo = Math.min(front, back), hi = Math.max(front, back);
  if (thinX) eA.box(lo, y0, u0, hi, yt, u1, { px: true, nx: true, ny: true });
  else eA.box(u0, y0, lo, u1, yt, hi, { pz: true, nz: true, ny: true });
  const edge = new THREE.Mesh(eA.geometry(), M.featureEdge); edge.castShadow = true; edge.receiveShadow = true;
  // 8 mm shadow-gap reveal (dark back strip) at the ceiling and both ends
  const gA = new GeoAcc(), gp = back + sign * 0.003;
  gA.face(axis, sign, gp, a0, a1, yt, top); gA.face(axis, sign, gp, a0, u0, y0, yt); gA.face(axis, sign, gp, u1, a1, y0, yt);
  const gap = new THREE.Mesh(gA.geometry(), M.gap); gap.receiveShadow = false;
  // soft contact shadow on the floor in front of the panel (replaces the skirting AO strip)
  const aoA = new GeoAcc(true), yF = y0 + 0.002;
  const P2 = (o, u) => thinX ? [front + sign * o, yF, u] : [u, yF, front + sign * o];
  aoQuad(aoA, P2(0, u0), P2(0, u1), P2(0.06, u1), P2(0.06, u0), STYLE.ao.floor, STYLE.ao.floor * 0.45, true);
  aoQuad(aoA, P2(0.06, u0), P2(0.06, u1), P2(0.3, u1), P2(0.3, u0), STYLE.ao.floor * 0.45, 0, true);
  const aoM = new THREE.Mesh(aoA.geometry(), M.ao); aoM.renderOrder = 1;
  group.add(face, edge, gap, aoM);
  let slots = null;
  if (ft.sideSlots) {
    // channel: diffuser strip recessed behind the face + dark channel cheeks, at both ends, floor → ceiling
    const rec = front - sign * SS.recess, chA = new GeoAcc(), dA = new GeoAcc();
    const cross = thinX ? 'z' : 'x';
    for (const [c0, c1] of [[u0, u0 + sw], [u1 - sw, u1]]) {
      dA.face(axis, sign, rec, c0, c1, y0, yt);
      const lo2 = Math.min(front, rec), hi2 = Math.max(front, rec);
      chA.face(cross, 1, c0, lo2, hi2, y0, yt); chA.face(cross, -1, c1, lo2, hi2, y0, yt);
    }
    const strip = new THREE.Mesh(dA.geometry(), M.slotStrip); strip.name = 'slotStrip';
    const cheeks = new THREE.Mesh(chA.geometry(), M.gap); cheeks.name = 'slotCheeks';
    // grazing light across the textured face, baked from its height map (fades toward the middle)
    const gA = new GeoAcc(); gA.face(axis, sign, front + sign * 0.0015, u0 + sw, u1 - sw, y0, yt);
    const gMat = rawOutput(M.graze.clone()); gMat.map = makeGrazeTexture(faceMat.userData.canvas, a1 - a0, SS);
    const graze = new THREE.Mesh(faceUV(gA.geometry()), gMat); graze.name = 'slotGraze'; graze.renderOrder = 4; graze.visible = false;
    group.add(strip, cheeks, graze);
    slots = { id: ft.id, strip, graze, mat: gMat };
  }
  group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  root.add(group);

  let washer = null;
  if (ft.washer) {
    const W = STYLE.washer, cpos = front + sign * W.offset, yc = room ? room.ceilingH : H;
    const v0 = a0 + 0.05, v1 = a1 - 0.05;
    const sA = new GeoAcc(), bA = new GeoAcc();
    if (thinX) { sA.face('y', -1, yc - 0.0016, cpos - W.slotW / 2, cpos + W.slotW / 2, v0, v1); bA.face('y', -1, yc - 0.0008, cpos - W.slotW / 2 - 0.008, cpos + W.slotW / 2 + 0.008, v0 - 0.008, v1 + 0.008); }
    else { sA.face('y', -1, yc - 0.0016, v0, v1, cpos - W.slotW / 2, cpos + W.slotW / 2); bA.face('y', -1, yc - 0.0008, v0 - 0.008, v1 + 0.008, cpos - W.slotW / 2 - 0.008, cpos + W.slotW / 2 + 0.008); }
    const slot = new THREE.Mesh(sA.geometry(), M.washerSlot); slot.name = 'washerSlot';
    const rim = new THREE.Mesh(bA.geometry(), M.gap); rim.name = 'washerRim';
    for (const m of [slot, rim]) { m.matrixAutoUpdate = false; m.updateMatrix(); ceilingGroup.add(m); }
    // additive grazing wash on the top part of the textured wall
    const wA = new GeoAcc(); wA.face(axis, sign, front + sign * 0.002, u0, u1, Math.max(y0, yt - W.glowH), yt);
    const wg = wA.geometry(), wp = wg.attributes.position, wuv = wg.attributes.uv;
    for (let i = 0; i < wuv.count; i++) {
      const along = thinX ? wp.getZ(i) : wp.getX(i);
      wuv.setXY(i, (along - u0) / (u1 - u0), (wp.getY(i) - (yt - W.glowH)) / W.glowH);
    }
    const glow = new THREE.Mesh(wg, M.washerGlow); glow.renderOrder = 2; glow.name = 'washerGlow';
    glow.matrixAutoUpdate = false; glow.updateMatrix(); glow.visible = false;
    root.add(glow);
    // grazing spot from the slot, aimed down the wall face → lights wall + console, never the ceiling
    const light = new THREE.SpotLight(W.color, 0, 4.2, 1.15, 0.95, 1.6);
    const lp = (o, y) => thinX ? [front + sign * o, y, am] : [am, y, front + sign * o];
    light.position.set(...lp(0.28, yc - 0.06)); light.target.position.set(...lp(0.02, 0.7));
    light.castShadow = false; light.visible = false; light.name = 'washerLight';
    light.add(light.target); light.target.position.sub(light.position);
    washer = { id: ft.id, slot, glow, light };
  }
  return { id: ft.id, group, collider: { x0: ft.x0, z0: ft.z0, x1: ft.x1, z1: ft.z1, src: 'feature' }, washer, slots };
}

// ── skylight (LED sky panel in a deep, slightly tapered white reveal) ───────
function buildSkylight(sk, P, M, STYLE, L, ceilingGroup) {
  const SK = STYLE.skylight, room = L.at((sk.x0 + sk.x1) / 2, (sk.z0 + sk.z1) / 2);
  const yc = room ? room.ceilingH : P.ceiling, d = sk.depth || 0.2, yt = yc + d, t = SK.taper;
  const { x0, z0, x1, z1 } = sk, X0 = x0 + t, X1 = x1 - t, Z0 = z0 + t, Z1 = z1 - t;
  const rv = new GeoAcc();
  const quad = (a, b, c, e) => rv.quad(a, b, c, e, [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  quad([x0, yc, z0], [x1, yc, z0], [X1, yt, Z0], [X0, yt, Z0]);
  quad([x1, yc, z0], [x1, yc, z1], [X1, yt, Z1], [X1, yt, Z0]);
  quad([x1, yc, z1], [x0, yc, z1], [X0, yt, Z1], [X1, yt, Z1]);
  quad([x0, yc, z1], [x0, yc, z0], [X0, yt, Z0], [X0, yt, Z1]);
  const rg = rv.geometry(); rg.computeVertexNormals();
  // flip normals to point into the opening (toward the shaft axis, downward)
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, n = rg.attributes.normal, p = rg.attributes.position;
  for (let i = 0; i < n.count; i++) { const tx = cx - p.getX(i), tz = cz - p.getZ(i); if (n.getX(i) * tx + n.getZ(i) * tz < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  M.skyReveal.side = THREE.DoubleSide;
  const reveal = new THREE.Mesh(rg, M.skyReveal); reveal.name = 'skyReveal';
  // thin bright rim + panel
  const rim = new GeoAcc(), pa = new GeoAcc(), rw = 0.014;
  rim.face('y', -1, yt - 0.001, X0, X1, Z0, Z1);
  pa.face('y', -1, yt - 0.002, X0 + rw, X1 - rw, Z0 + rw, Z1 - rw);
  const pg = pa.geometry(), puv = pg.attributes.uv, pp = pg.attributes.position;
  for (let i = 0; i < puv.count; i++) puv.setXY(i, (pp.getX(i) - X0) / (X1 - X0), (pp.getZ(i) - Z0) / (Z1 - Z0));
  M.skyPanel.side = THREE.DoubleSide; M.skyRim.side = THREE.DoubleSide;
  const panel = new THREE.Mesh(pg, M.skyPanel); panel.name = 'skyPanel';
  const rimM = new THREE.Mesh(rim.geometry(), M.skyRim); rimM.name = 'skyRim';
  for (const m of [reveal, rimM, panel]) { m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = false; ceilingGroup.add(m); }
  return { id: sk.id, x: cx, z: cz, w: x1 - x0, d: z1 - z0, y: yc, top: yt, panel };
}

// ── bifold (concertina) door: two leaves, pivot at one jamb, folds out to foldTo ──
function buildBifold(d, P, M, STYLE, acc) {
  const group = new THREE.Group(); group.name = 'bifold_' + d.id;
  const alongX = (d.x1 - d.x0) >= (d.z1 - d.z0);
  const a0 = alongX ? d.x0 : d.z0, a1 = alongX ? d.x1 : d.z1;
  const c0 = alongX ? d.z0 : d.x0, c1 = alongX ? d.z1 : d.x1, c = (c0 + c1) / 2;
  const h = d.h || 2.1, jw = 0.03, inner0 = a0 + jw, inner1 = a1 - jw;
  const nP = Math.max(2, d.panels || 2), Lf = (inner1 - inner0) / nP - 0.003, t = 0.032;
  const ft = d.foldTo || (alongX ? '+z' : '+x');
  const s = alongX ? (ft === '+z' ? -1 : 1) : (ft === '+x' ? 1 : -1);
  const base = alongX ? 0 : -Math.PI / 2;
  // static white aluminium lining: jambs + head
  const B = (u0, u1, y0, y1, w0, w1) => alongX ? acc.alw.box(u0, y0, w0, u1, y1, w1) : acc.alw.box(w0, y0, u0, w1, y1, u1);
  B(a0, inner0, 0, h, c0 - 0.006, c1 + 0.006); B(inner1, a1, 0, h, c0 - 0.006, c1 + 0.006);
  B(a0, a1, h - 0.03, h, c0 - 0.006, c1 + 0.006);
  // leaf geometry (local +X = 0..Lf, centred on z = 0)
  const leaf = (withHandle) => {
    const g = new THREE.Group(), fa = new GeoAcc(), gl = new GeoAcc(), dk = new GeoAcc(), hd = new GeoAcc();
    const top = h - 0.035, split = 0.12 + (top - 0.12) * 0.45, st = 0.045;
    fa.box(0, 0.01, -t / 2, st, top, t / 2); fa.box(Lf - st, 0.01, -t / 2, Lf, top, t / 2);
    fa.box(st, 0.01, -t / 2, Lf - st, 0.12, t / 2); fa.box(st, top - 0.06, -t / 2, Lf - st, top, t / 2);
    fa.box(st, split - 0.025, -t / 2, Lf - st, split + 0.025, t / 2);
    gl.box(st, split + 0.025, -0.003, Lf - st, top - 0.06, 0.003);
    for (let y = 0.135; y < split - 0.04; y += 0.03) fa.box(st, y, -t * 0.38, Lf - st, y + 0.016, t * 0.38);   // louvres
    dk.face('z', 1, 0.0005, st, Lf - st, 0.12, split - 0.025); dk.face('z', -1, -0.0005, st, Lf - st, 0.12, split - 0.025);
    if (withHandle) for (const sz of [1, -1]) hd.box(Lf - 0.03, 1.0, Math.min(sz * t / 2, sz * (t / 2 + 0.03)), Lf - 0.018, 1.07, Math.max(sz * t / 2, sz * (t / 2 + 0.03)));
    const parts = [[fa, M.alWhite], [gl, M.frosted], [dk, M.gap], [hd, M.handle]];
    for (const [a, m] of parts) if (!a.empty) { const mesh = new THREE.Mesh(a.geometry(), m); mesh.castShadow = m !== M.frosted; mesh.receiveShadow = true; g.add(mesh); }
    return g;
  };
  const A = leaf(false), Bl = leaf(true);
  const pivot = new THREE.Group();
  if (alongX) pivot.position.set(inner0 + 0.0015, 0, c); else pivot.position.set(c, 0, inner0 + 0.0015);
  pivot.add(A); Bl.position.set(Lf + 0.003, 0, 0); A.add(Bl);
  group.add(pivot);
  const box = alongX ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a1 };
  return {
    type: 'bifold', id: d.id, group, A, B: Bl, base, s, maxFold: 1.45, open: 0, vel: 0, target: 0,
    center: alongX ? [(a0 + a1) / 2, c] : [c, (a0 + a1) / 2], box: { ...box, src: 'bifold' },
  };
}

// ── sliding door ────────────────────────────────────────────────────────────
function roomAtP(P, x, z) {
  let best = null;
  for (const r of P.rooms) if (pointInPoly(x, z, r.poly) && (!best || r.area < best.area)) best = r;
  return best;
}
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
  // interior glass slider (rooms on both sides, neither a balcony) → slim matte-black frame + clear glass
  const side = (off) => { const [x, z] = alongX ? [(o0 + o1) / 2, c + off] : [c + off, (o0 + o1) / 2]; return roomAtP(P, x, z); };
  const sA = side(-0.3), sB = side(0.3);
  const outdoor = (r) => !r || OUTDOOR.includes(r.floor);
  const slim = glass && ((!outdoor(sA) && !outdoor(sB)) || STYLE.partition.balconySliders);
  const fAcc = slim ? acc.black : frameAcc, frameMat = slim ? M.frameBlack : M.frame, glassMat = slim ? M.glassClear : M.glass;
  const FW = slim ? STYLE.partition.frameW : STYLE.frame.w;

  const n = Math.max(1, d.panels || 1);
  const ov = 0.04;
  let pw = (o1 - o0) / n + (n > 1 ? ov : 0);
  // single panel: slide toward the side whose wall hides it; a glass panel slides on the surface instead of
  // disappearing into masonry (track on the room-side face of that wall)
  let single = null;
  if (n === 1) {
    const travel = pw - 0.12;
    const solidAt = (u) => { const [x, z] = alongX ? [u, c] : [c, u]; return P.walls.find((w) => w.y0 < 0.5 && w.y1 > 1.8 && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1); };
    const cover = (sgn) => { let k = 0; for (let t = 0.05; t < travel; t += 0.05) if (solidAt(sgn < 0 ? o0 - t : o1 + t)) k++; return k; };
    const sgn = cover(-1) >= cover(1) ? -1 : 1;
    single = { sgn, travel, dz: 0, surface: false };
    if (glass) {
      const w = solidAt(sgn < 0 ? o0 - 0.15 : o1 + 0.15);
      if (w) {
        const wc0 = alongX ? w.z0 : w.x0, wc1 = alongX ? w.z1 : w.x1;
        const cand = [wc0 - 0.026, wc1 + 0.026].sort((p, q) => Math.abs(p - c) - Math.abs(q - c))[0];
        single.dz = cand - c; single.surface = true; single.travel = pw; pw += 0.05;
      }
    }
  }
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
  const fbox = (u0, u1, y0, y1, w0, w1) => alongX ? fAcc.box(u0, y0, w0, u1, y1, w1) : fAcc.box(w0, y0, u0, w1, y1, u1);
  if (glass) {
    const jw = slim ? 0.02 : 0.03, jd = slim ? 0.03 : 0.06;
    fbox(o0, o0 + jw, 0, h, c - jd, c + jd);
    fbox(o1 - jw, o1, 0, h, c - jd, c + jd);
    fbox(o0, o1, h - (slim ? 0.025 : 0.04), h, c - jd, c + jd);
    if (single && single.surface) {     // surface top track over opening + parking zone
      const cc = c + single.dz, t0 = single.sgn < 0 ? o0 - single.travel - 0.03 : o0 - 0.03, t1 = single.sgn < 0 ? o1 + 0.03 : o1 + single.travel + 0.03;
      fbox(t0, t1, h - 0.03, h + 0.03, cc - 0.022, cc + 0.022);
    }
  }
  const panels = [];
  for (let i = 0; i < n; i++) {
    const pg = new THREE.Group();
    const fa = new GeoAcc(), ga = new GeoAcc();
    const track = n === 1 ? 0 : n === 2 ? (i === 0 ? -1 : 1) : ((i === 0 || i === n - 1) ? -1 : 1);
    const dz = single ? single.dz : track * 0.022, th = glass ? (slim ? 0.03 : 0.035) : 0.04;
    const top = single && single.surface ? h - 0.03 : h - 0.04;
    // panel local: u from 0..pw, centred on depth 0
    const pb = (u0, u1, y0, y1, acc2, dd = th) => alongX ? acc2.box(u0, y0, -dd / 2, u1, y1, dd / 2) : acc2.box(-dd / 2, y0, u0, dd / 2, y1, u1);
    if (glass) {
      pb(0, FW, 0.01, top, fa); pb(pw - FW, pw, 0.01, top, fa);
      pb(0, pw, 0.01, 0.01 + FW * 1.4, fa); pb(0, pw, top - FW, top, fa);
      if (alongX) { ga.face('z', 1, 0.004, FW, pw - FW, 0.01 + FW, top - FW); ga.face('z', -1, -0.004, FW, pw - FW, 0.01 + FW, top - FW); }
      else { ga.face('x', 1, 0.004, FW, pw - FW, 0.01 + FW, top - FW); ga.face('x', -1, -0.004, FW, pw - FW, 0.01 + FW, top - FW); }
      // pull handle (slim: long thin black bar)
      const hu = single ? (single.sgn < 0 ? pw - 0.07 : 0.05) : (i < n / 2) ? pw - 0.06 : 0.04;
      if (slim) pb(hu, hu + 0.014, 0.75, 1.45, fa, th + 0.06); else pb(hu, hu + 0.02, 0.9, 1.25, fa, th + 0.05);
    } else {
      pb(0, pw, 0.01, h - 0.01, fa);
      const hu = 0.06; pb(hu, hu + 0.015, 0.85, 1.15, fa, th + 0.03);
    }
    const fm = new THREE.Mesh(fa.geometry(), glass ? frameMat : M.slideOpaque);
    fm.castShadow = false; fm.receiveShadow = true;
    pg.add(fm);
    if (!ga.empty) { const gm = new THREE.Mesh(ga.geometry(), glassMat); gm.renderOrder = 3; pg.add(gm); }
    let closedU = o0 + i * ((o1 - o0) / n) - (n > 1 && i > 0 ? ov / 2 : 0);
    let openU = closedU;
    if (single) {
      if (single.surface) closedU = o0 - 0.025;
      openU = closedU + single.sgn * single.travel;
    } else if (n === 2) {
      openU = i === 0 ? closedU : o0;   // panel 1 slides over panel 0
    } else {
      if (i === 0 || i === n - 1) openU = closedU;
      else if (i < n / 2) openU = o0;                                       // stack over first panel
      else openU = o1 - pw;                                                 // stack over last panel
    }
    if (alongX) pg.position.set(closedU, 0, c + dz); else pg.position.set(c + dz, 0, closedU);
    group.add(pg);
    panels.push({ g: pg, closedU, openU, pw, dz });
  }
  return {
    type: 'slide', id: d.id, group, panels, alongX, c, open: 0, vel: 0, target: 0, slim,
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
    } else if (d.type === 'bifold') {
      if (d.open < 0.3) out.push(d.box);
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
