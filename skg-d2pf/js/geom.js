// geom.js — small geometry helpers (polygons, world-UV quads, geometry accumulator)
import * as THREE from 'three';

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPoly(x, z, poly) {      // distance to polygon boundary
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    d = Math.min(d, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return d;
}

export function polyBBox(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { x0, z0, x1, z1 };
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}

export function polyCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, z0] = poly[j], [x1, z1] = poly[i];
    const f = x0 * z1 - x1 * z0; a += f; cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  a *= 0.5; return [cx / (6 * a), cz / (6 * a)];
}

// Accumulates triangles (positions, normals, uvs, optional rgba colors) → BufferGeometry
export class GeoAcc {
  constructor(withColor = false) { this.p = []; this.n = []; this.uv = []; this.c = withColor ? [] : null; }
  get empty() { return this.p.length === 0; }
  // quad from 4 corners (CCW seen from the front), normal n, uvs per corner, optional colors per corner
  quad(a, b, c, d, n, uvs, cols) {
    const P = [a, b, c, a, c, d], U = [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]];
    const Cc = cols ? [cols[0], cols[1], cols[2], cols[0], cols[2], cols[3]] : null;
    for (let i = 0; i < 6; i++) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(n[0], n[1], n[2]); this.uv.push(U[i][0], U[i][1]);
      if (this.c) { const k = Cc ? Cc[i] : [1, 1, 1, 1]; this.c.push(k[0], k[1], k[2], k[3]); }
    }
  }
  // axis-aligned face of a box. axis: 'x'|'z'|'y', sign ±1, at plane coord, spanning [u0,u1]×[v0,v1]
  // world UVs in metres: x-faces u=z, z-faces u=x, y-faces (u=x, v=z); vertical v=y
  face(axis, sign, at, u0, u1, v0, v1) {
    if (u1 - u0 < 1e-5 || v1 - v0 < 1e-5) return;
    if (axis === 'x') {
      const n = [sign, 0, 0];
      // CCW seen from +X looking -X: (z1,y0)->(z0,y0)?  build so normal matches winding
      if (sign > 0) this.quad([at, v0, u1], [at, v0, u0], [at, v1, u0], [at, v1, u1], n, [[-u1, v0], [-u0, v0], [-u0, v1], [-u1, v1]]);
      else this.quad([at, v0, u0], [at, v0, u1], [at, v1, u1], [at, v1, u0], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    } else if (axis === 'z') {
      const n = [0, 0, sign];
      if (sign > 0) this.quad([u0, v0, at], [u1, v0, at], [u1, v1, at], [u0, v1, at], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      else this.quad([u1, v0, at], [u0, v0, at], [u0, v1, at], [u1, v1, at], n, [[-u1, v0], [-u0, v0], [-u0, v1], [-u1, v1]]);
    } else {
      const n = [0, sign, 0]; // u = x range, v = z range
      if (sign > 0) this.quad([u0, at, v1], [u1, at, v1], [u1, at, v0], [u0, at, v0], n, [[u0, -v1], [u1, -v1], [u1, -v0], [u0, -v0]]);
      else this.quad([u0, at, v0], [u1, at, v0], [u1, at, v1], [u0, at, v1], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  box(x0, y0, z0, x1, y1, z1, skip = {}) {
    if (!skip.px) this.face('x', 1, x1, z0, z1, y0, y1);
    if (!skip.nx) this.face('x', -1, x0, z0, z1, y0, y1);
    if (!skip.pz) this.face('z', 1, z1, x0, x1, y0, y1);
    if (!skip.nz) this.face('z', -1, z0, x0, x1, y0, y1);
    if (!skip.py) this.face('y', 1, y1, x0, x1, z0, z1);
    if (!skip.ny) this.face('y', -1, y0, x0, x1, z0, z1);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// Box of given size centred at origin with metre-UVs (for doors etc.)
export function boxGeo(w, h, d, cx = 0, cy = 0, cz = 0) {
  const a = new GeoAcc();
  a.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2);
  return a.geometry();
}
