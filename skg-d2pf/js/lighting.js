// lighting.js — the only artificial light sources: 75 mm trimless deep-recessed downlights.
//  • layout: per-room grid (STYLE.lighting.spacing, ≥ wallMin from walls, ≥ featureMin from feature-wall faces,
//    clear of skylights) + rules: 2 over each dining table, kitchen = aisle-centre row + a row over each island.
//  • fittings: dark anti-glare baffle + small aperture (vertex colour = CCT; material level = on/off).
//  • evening: a pool of N SpotLights (no shadows) is re-assigned to the fixtures nearest the camera with smooth
//    cross-fades; every other fixture is represented by fake light — a floor pool + wall scallops (multiplicative
//    decals with an IES-like cookie), faded out while that fixture owns a real SpotLight.
import * as THREE from 'three';
import { GeoAcc, pointInPoly, distToPoly } from './geom.js';
import { SCALLOP_U, SCALLOP_T } from './materials.js';

const EPS = 1e-4;

export function roomCCT(STYLE, room) {
  const c = STYLE.lighting.cct;
  return c[room.id] ?? c[room.floor] ?? c.default ?? 3000;
}

// Sutherland–Hodgman: clip (possibly concave) subject polygon against an axis-aligned rectangle.
function clipRect(poly, x0, z0, x1, z1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= z0, (p) => p[1] <= z1,
  ];
  const inter = [
    (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (z0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z0]; },
    (a, b) => { const t = (z1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z1]; },
  ];
  let out = poly;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ia = edges[e](a), ib = edges[e](b);
      if (ib) { if (!ia) out.push(inter[e](a, b)); out.push(b); } else if (ia) out.push(inter[e](a, b));
    }
  }
  return out;
}

// ── fixture layout ──────────────────────────────────────────────────────────
export function layoutFixtures(P, STYLE, L, { wallFeatures = [], skylights = [] } = {}) {
  const LG = STYLE.lighting, out = [];
  const solid = (x, z, y = 1.2) => P.walls.some((w) => w.y0 < y && w.y1 > y && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);
  const okFeature = (x, z) => wallFeatures.every((f) => {
    const cx = Math.max(f.x0, Math.min(x, f.x1)), cz = Math.max(f.z0, Math.min(z, f.z1));
    return Math.hypot(x - cx, z - cz) >= LG.featureMin;
  });
  const skyClear = (x, z, m = 0.25) => skylights.every((s) => x < s.x0 - m || x > s.x1 + m || z < s.z0 - m || z > s.z1 + m);
  const furn = (P.furniture || []);
  const fp = (it) => { const a = (it.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const hw = (it.w * c + it.d * s) / 2, hd = (it.w * s + it.d * c) / 2; return { x0: it.x - hw, x1: it.x + hw, z0: it.z - hd, z1: it.z + hd }; };

  for (const r of P.rooms) {
    if (r.ceiling === false) continue;
    const pts = [], cct = roomCCT(STYLE, r);
    const valid = (x, z, wm = LG.wallMin) => pointInPoly(x, z, r.poly) && distToPoly(x, z, r.poly) >= Math.min(wm, 0.45) - 1e-3 && !solid(x, z) && okFeature(x, z);
    const { x0, z0, x1, z1 } = r.bbox;
    // special rules
    const tables = furn.filter((f) => f.type === 'dining_table' && pointInPoly(f.x, f.z, r.poly));
    for (const t of tables) {
      const along = (t.rot || 0) % 180 === 0 ? (t.d >= t.w ? 'z' : 'x') : (t.d >= t.w ? 'x' : 'z');
      const half = Math.max(t.w, t.d) / 4;
      for (const s of [-1, 1]) pts.push({ x: t.x + (along === 'x' ? s * half : 0), z: t.z + (along === 'z' ? s * half : 0), rule: 'dining' });
    }
    const counters = furn.filter((f) => f.type === 'counter' && pointInPoly(f.x, f.z, r.poly));
    let kitchen = false;
    if (counters.length) {
      const islands = counters.filter((c) => c.opts && c.opts.island), runs = counters.filter((c) => !(c.opts && c.opts.island));
      for (const isl of islands) {           // row over the island's centre line (nudged off walls / glass screens)
        const b = fp(isl), alongX = (b.x1 - b.x0) >= (b.z1 - b.z0);
        let c = alongX ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
        const span = alongX ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(span / 0.9));
        for (let i = 0; i < n; i++) {
          const u = (alongX ? b.x0 : b.z0) + span * (i + 0.5) / n;
          let best = null;
          for (const dc of [0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24]) {
            const [x, z] = alongX ? [u, c + dc] : [c + dc, u];
            const nearGlass = P.windows.some((w) => w.kind === 'partition' && Math.max(w.x0 - x, x - w.x1, w.z0 - z, z - w.z1) < 0.4);
            if (valid(x, z, 0.35) && !nearGlass) { best = [x, z]; break; }
          }
          if (best) pts.push({ x: best[0], z: best[1], rule: 'island' });
        }
      }
      for (const run of runs) {               // aisle centre between the run and the island (or the run front + 0.5 m)
        const b = fp(run), alongX = (b.x1 - b.x0) >= (b.z1 - b.z0);
        let aisle;
        const isl = islands.map(fp)[0];
        if (isl && alongX) aisle = b.z0 > isl.z1 ? (b.z0 + isl.z1) / 2 : (isl.z0 + b.z1) / 2;
        else if (isl) aisle = b.x0 > isl.x1 ? (b.x0 + isl.x1) / 2 : (isl.x0 + b.x1) / 2;
        else aisle = alongX ? (run.rot === 180 ? b.z0 - 0.5 : b.z1 + 0.5) : (run.rot === 90 ? b.x1 + 0.5 : b.x0 - 0.5);
        // run the aisle row across the whole room extent
        const a0 = (alongX ? x0 : z0) + LG.wallMin, a1 = (alongX ? x1 : z1) - LG.wallMin;
        const n = Math.max(1, Math.round((a1 - a0) / LG.spacing) + 1);
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? (a0 + a1) / 2 : a0 + (a1 - a0) * i / (n - 1);
          for (const du of [0, 0.15, -0.15, 0.3, -0.3]) {
            const [x, z] = alongX ? [u + du, aisle] : [aisle, u + du];
            if (valid(x, z, 0.4)) { pts.push({ x, z, rule: 'aisle' }); break; }
          }
        }
      }
      kitchen = islands.length > 0 || runs.length > 0;
    }
    // generic grid (skipped for the kitchen, which is fully rule-based)
    if (!kitchen) {
      const inX = Math.min(LG.wallMin, (x1 - x0) / 2), inZ = Math.min(LG.wallMin, (z1 - z0) / 2);
      let gx0 = x0 + inX, gx1 = x1 - inX, gz0 = z0 + inZ, gz1 = z1 - inZ;
      // keep the grid ≥ featureMin from feature-wall faces inside this room
      for (const f of wallFeatures) {
        if (f.z1 < z0 || f.z0 > z1 || f.x1 < x0 || f.x0 > x1) continue;
        const thinX = (f.x1 - f.x0) < (f.z1 - f.z0);
        if (thinX) { if (f.x0 >= gx1 - 0.01 || f.x0 > (x0 + x1) / 2) gx1 = Math.min(gx1, f.x0 - LG.featureMin); else gx0 = Math.max(gx0, f.x1 + LG.featureMin); }
        else { if (f.z0 > (z0 + z1) / 2) gz1 = Math.min(gz1, f.z0 - LG.featureMin); else gz0 = Math.max(gz0, f.z1 + LG.featureMin); }
      }
      const cnt = (len) => len < 0.9 ? 1 : Math.max(1, Math.round(len / LG.spacing) + 1);
      const nx = cnt(gx1 - gx0), nz = cnt(gz1 - gz0);
      const alongZ = (z1 - z0) > (x1 - x0);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        let x = nx === 1 ? (gx0 + gx1) / 2 : gx0 + (gx1 - gx0) * i / (nx - 1);
        let z = nz === 1 ? (gz0 + gz1) / 2 : gz0 + (gz1 - gz0) * j / (nz - 1);
        if (tables.length && pts.some((p) => p.rule === 'dining' && Math.hypot(p.x - x, p.z - z) < 0.95)) continue;
        if (!skyClear(x, z)) {                // slide along the room's long axis out of a skylight
          let moved = null;
          for (let d = 0.05; d <= 0.75 && !moved; d += 0.05) for (const s of [1, -1]) {
            const xx = alongZ ? x : x + s * d, zz = alongZ ? z + s * d : z;
            if (skyClear(xx, zz) && valid(xx, zz)) { moved = [xx, zz]; break; }
          }
          if (!moved) continue; [x, z] = moved;
        }
        if (!valid(x, z)) {                   // narrow / L-shaped rooms: move to the clearest nearby spot
          let best = null, bd = -1;
          for (let dx = -0.6; dx <= 0.6001; dx += 0.05) for (let dz = -0.6; dz <= 0.6001; dz += 0.05) {
            const xx = x + dx, zz = z + dz;
            if (!pointInPoly(xx, zz, r.poly) || !skyClear(xx, zz) || solid(xx, zz) || !okFeature(xx, zz)) continue;
            const c = distToPoly(xx, zz, r.poly) - 0.15 * Math.hypot(dx, dz);
            if (c > bd) { bd = c; best = [xx, zz]; }
          }
          if (!best || distToPoly(best[0], best[1], r.poly) < 0.3) continue;
          [x, z] = best;
        }
        pts.push({ x, z, rule: 'grid' });
      }
      if (!pts.length) { const [cx, cz] = r.centroid; if (skyClear(cx, cz) && !solid(cx, cz)) pts.push({ x: cx, z: cz, rule: 'centre' }); }
    }
    // de-duplicate (rules first)
    const kept = [];
    for (const p of pts) if (!kept.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < (p.rule === k.rule && p.rule !== 'grid' || p.rule === 'aisle' || k.rule === 'aisle' ? 0.6 : LG.minGap))) kept.push(p);
    for (const p of kept) out.push({ ...p, room: r.id, y: r.ceilingH, cct, color: new THREE.Color(STYLE.kelvin(cct)) });
  }
  out.forEach((f, i) => { f.i = i; });
  return out;
}

// ── fittings + fake light geometry ─────────────────────────────────────────
export function buildDownlights(P, M, STYLE, L, opts) {
  const LG = STYLE.lighting;
  const fixtures = layoutFixtures(P, STYLE, L, opts);
  const seg = 20;
  const baffle = new GeoAcc(), ap = new GeoAcc(true);
  const disc = (acc, x, y, z, r, col) => {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      acc.p.push(x, y, z, x + Math.cos(b) * r, y, z + Math.sin(b) * r, x + Math.cos(a) * r, y, z + Math.sin(a) * r);
      for (let k = 0; k < 3; k++) { acc.n.push(0, -1, 0); acc.uv.push(0, 0); if (acc.c) acc.c.push(col.r, col.g, col.b, 1); }
    }
  };
  for (const f of fixtures) {
    disc(baffle, f.x, f.y - 0.0008, f.z, LG.baffleR);
    disc(ap, f.x, f.y - 0.0016, f.z, LG.apertureR, f.color);
  }
  const mk = (acc, mat, name) => { const m = new THREE.Mesh(acc.geometry(), mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = false; return m; };
  const fittings = [mk(baffle, M.baffle, 'dlBaffle'), mk(ap, M.aperture, 'dlAperture')];

  // floor pools: room polygon ∩ square around the fixture, triangulated
  const poolP = [], poolUV = [], poolC = [], poolRange = [];
  const T = Math.tan(LG.beam);
  for (const f of fixtures) {
    const r = P.rooms.find((q) => q.id === f.room);
    const R = f.y * T, start = poolP.length / 3;
    const clip = clipRect(r.poly, f.x - R, f.z - R, f.x + R, f.z + R);
    if (clip.length >= 3) {
      const v2 = clip.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const t of tris) for (const k of t) {
        const [x, z] = clip[k];
        poolP.push(x, 0.004, z); poolUV.push((x - f.x) / (2 * R) + 0.5, 1 - ((z - f.z) / (2 * R) + 0.5));
        poolC.push(0, 0, 0);
      }
    }
    poolRange.push([start, poolP.length / 3]);
  }
  // wall scallops: nearest solid wall face in ±x/±z within scallopReach
  const sP = [], sUV = [], sC = [], sRange = [], sGain = [];
  const solidAt = (x, z, y) => P.walls.some((w) => w.y0 < y && w.y1 > y && x > w.x0 - EPS && x < w.x1 + EPS && z > w.z0 - EPS && z < w.z1 + EPS)
    || (opts.wallFeatures || []).some((w) => x > w.x0 - EPS && x < w.x1 + EPS && z > w.z0 - EPS && z < w.z1 + EPS);
  for (const f of fixtures) {
    const start = sP.length / 3, gains = [];
    const room = P.rooms.find((q) => q.id === f.room);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let d = null;
      for (let t = 0.04; t <= LG.scallopReach; t += 0.01) if (solidAt(f.x + dx * t, f.z + dz * t, 1.2)) { d = t; break; }
      if (d === null || d < 0.2) continue;
      // refine face position
      for (let k = 0; k < 6; k++) { const t = d - 0.01 * (k + 1) / 6; if (solidAt(f.x + dx * t, f.z + dz * t, 1.2)) d = t; }
      const fx = f.x + dx * d, fz = f.z + dz * d;           // point on the face
      const alongX = dz !== 0;                              // face runs along X when we hit it moving in z
      const uf = alongX ? f.x : f.z, Umax = SCALLOP_U * d;
      // horizontal extent: solid behind the face and inside the room in front of it
      const ok = (u) => {
        const [bx, bz] = alongX ? [u, fz + dz * 0.012] : [fx + dx * 0.012, u];
        const [qx, qz] = alongX ? [u, fz - dz * 0.06] : [fx - dx * 0.06, u];
        return solidAt(bx, bz, 1.2) && solidAt(bx, bz, Math.min(2.3, f.y - 0.1)) && pointInPoly(qx, qz, room.poly);
      };
      let uL = uf, uR = uf;
      while (uL > uf - Umax && ok(uL - 0.02)) uL -= 0.02;
      while (uR < uf + Umax && ok(uR + 0.02)) uR += 0.02;
      if (uR - uL < 0.2) continue;
      const yTop = f.y, yBot = Math.max(0, f.y - SCALLOP_T * d);
      const off = 0.003, at = (alongX ? fz : fx) - (alongX ? dz : dx) * off;
      const V = (y) => 1 - (f.y - y) / d / SCALLOP_T, U = (u) => 0.5 + (u - uf) / (2 * Umax);
      const corners = [[uL, yBot], [uR, yBot], [uR, yTop], [uL, yTop]];
      const tri = [0, 1, 2, 0, 2, 3];
      for (const k of tri) {
        const [u, y] = corners[k];
        if (alongX) sP.push(u, y, at); else sP.push(at, y, u);
        sUV.push(U(u), V(y)); sC.push(0, 0, 0);
      }
      gains.push(Math.min(1.6, Math.pow(0.6 / d, 2)));
    }
    sRange.push([start, sP.length / 3]);
    sGain.push(gains);
  }
  const decalMesh = (pos, uv, col, mat, name) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.renderOrder = 4; m.frustumCulled = false;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.visible = false;
    return m;
  };
  M.lightDecal.side = THREE.DoubleSide; M.scallopDecal.side = THREE.DoubleSide;
  const pools = decalMesh(poolP, poolUV, poolC, M.lightDecal, 'lightPools');
  const scallops = decalMesh(sP, sUV, sC, M.scallopDecal, 'wallScallops');

  const level = new Float32Array(fixtures.length).fill(-1);
  function setLevel(i, k) {                           // k = fake-light level of fixture i (0..1)
    if (Math.abs(level[i] - k) < 0.002) return false;
    level[i] = k;
    const f = fixtures[i], c = f.color;
    const pc = pools.geometry.attributes.color, [p0, p1] = poolRange[i], pk = k * LG.pool;
    for (let v = p0; v < p1; v++) pc.setXYZ(v, c.r * pk, c.g * pk, c.b * pk);
    const sc = scallops.geometry.attributes.color, [s0, s1] = sRange[i];
    for (let v = s0, q = 0; v < s1; v++) { const gk = k * LG.scallop * (sGain[i][Math.floor((v - s0) / 6)] ?? 1); sc.setXYZ(v, c.r * gk, c.g * gk, c.b * gk); q++; }
    return true;
  }
  function commit() { pools.geometry.attributes.color.needsUpdate = true; scallops.geometry.attributes.color.needsUpdate = true; }
  return { fixtures, fittings, pools, scallops, setLevel, commit };
}

// ── dynamic SpotLight rig ───────────────────────────────────────────────────
export function createSpotRig(scene, STYLE, mobile) {
  const LG = STYLE.lighting, n = mobile ? LG.spotsMobile : LG.spots;
  const spots = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.SpotLight('#ffffff', 0, LG.spotDistance, LG.beam, LG.penumbra, 2);
    s.castShadow = false; s.visible = false;
    s.target.position.set(0, -1, 0); s.add(s.target);
    s.userData = { fix: null, want: null, w: 0 };
    scene.add(s); spots.push(s);
  }
  let timer = 0;
  const _v = new THREE.Vector3();
  function update(dt, dl, { on, camera, mode, roomId, focus }) {
    const fixtures = dl.fixtures;
    for (const s of spots) s.visible = on;
    timer -= dt;
    if (on && timer <= 0) {
      timer = 0.2;
      let want;
      if (mode === 'walk') {
        const dir = camera.getWorldDirection(_v);
        const px = camera.position.x, pz = camera.position.z;
        const score = (f) => {
          const dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
          const front = d > 0.01 ? (dx * dir.x + dz * dir.z) / (d * Math.hypot(dir.x, dir.z) || 1) : 1;
          return d + (front < -0.2 ? 1.8 : 0) + (f.room === roomId ? 0 : 1.2);
        };
        want = [...fixtures].sort((a, b) => score(a) - score(b)).slice(0, spots.length);
      } else want = [];                       // overview: fake pools/scallops everywhere (even look, cheaper)
      const free = [];
      for (const s of spots) { const i = want.indexOf(s.userData.fix); if (i >= 0) { want.splice(i, 1); s.userData.want = s.userData.fix; } else free.push(s); }
      for (const s of free) s.userData.want = want.shift() || null;
    }
    const a = Math.min(1, dt / LG.fade);
    const owned = new Map();
    let changing = false;
    for (const s of spots) {
      const u = s.userData, w0 = u.w;
      if (!on) { u.w = 0; u.fix = null; continue; }
      if (u.want !== u.fix) { u.w = Math.max(0, u.w - a); if (u.w <= 0) { u.fix = u.want; if (u.fix) { s.position.set(u.fix.x, u.fix.y - 0.03, u.fix.z); s.color.copy(u.fix.color); s.updateMatrixWorld(); } } }
      else if (u.fix) u.w = Math.min(1, u.w + a);
      s.intensity = u.fix ? LG.spotIntensity * u.w : 0;
      if (u.fix) owned.set(u.fix.i, Math.max(owned.get(u.fix.i) || 0, u.w));
      if (u.w !== w0) changing = true;
    }
    let dirty = false;
    for (const f of fixtures) dirty = dl.setLevel(f.i, on ? 1 - (owned.get(f.i) || 0) : 0) || dirty;
    if (dirty) dl.commit();
    dl.pools.visible = dl.scallops.visible = on;
    return changing;
  }
  return { spots, update };
}
