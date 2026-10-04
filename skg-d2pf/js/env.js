// env.js — sky dome, distant ground + city, sun / hemisphere / interior lights, theme application.
import * as THREE from 'three';
import { GeoAcc } from './geom.js';
import { rng } from './materials.js';

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt;
      varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h*3.0,0.0,1.0), 0.6));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 8.0) * 0.18 + pow(s, 600.0) * 1.6) * sunAmt;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false; m.name = 'sky';
  return m;
}

function facadeTextures(seed) {
  const W = 256, H = 256, bays = 4, floors = 4;
  const a = document.createElement('canvas'); a.width = W; a.height = H;
  const e = document.createElement('canvas'); e.width = W; e.height = H;
  const g = a.getContext('2d'), ge = e.getContext('2d'), r = rng(seed);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const bw = W / bays, fh = H / floors;
  for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) {
    const x = i * bw + bw * 0.14, y = j * fh + fh * 0.25, w = bw * 0.72, h = fh * 0.5;
    g.fillStyle = '#9aa6b0'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, w, h * 0.35);
    if (r() < 0.42) { const k = 0.6 + r() * 0.4; ge.fillStyle = `rgba(255,${Math.round(200 * k)},${Math.round(130 * k)},1)`; ge.fillRect(x, y, w, h); }
  }
  // slab bands
  g.fillStyle = 'rgba(0,0,0,0.08)'; for (let j = 0; j < floors; j++) g.fillRect(0, j * fh, W, 3);
  const ta = new THREE.CanvasTexture(a), te = new THREE.CanvasTexture(e);
  for (const t of [ta, te]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 12, 1 / 12); t.anisotropy = 4; }
  return [ta, te];
}

export function makeCity(STYLE, center) {
  const grp = new THREE.Group(); grp.name = 'exterior';
  const gy = STYLE.ground.y;
  const groundMat = new THREE.MeshLambertMaterial({ color: STYLE.ground.color });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1300, 48), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, gy, center.z);
  grp.add(ground);
  // city blocks
  const [map, emap] = facadeTextures(STYLE.city.seed);
  const acc = new GeoAcc(true), roofAcc = new GeoAcc();
  const r = rng(STYLE.city.seed);
  const c1 = new THREE.Color(STYLE.city.color), c2 = new THREE.Color(STYLE.city.color2);
  const N = STYLE.city.count;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + r() * 0.08;
    const rad = STYLE.city.minR + r() * (STYLE.city.maxR - STYLE.city.minR);
    const x = center.x + Math.cos(ang) * rad, z = center.z + Math.sin(ang) * rad;
    const slab = r() < 0.4;
    const w = slab ? 40 + r() * 30 : 18 + r() * 16, d = slab ? 14 + r() * 4 : 18 + r() * 14;
    const h = (r() < 0.3 ? 14 : 30) + r() * (rad > 320 ? 95 : 55);
    const col = c1.clone().lerp(c2, r()).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08);
    const cc = [col.r, col.g, col.b, 1];
    const rot = r() < 0.5;
    const ww = rot ? d : w, dd = rot ? w : d;
    const c0 = acc.c.length;
    acc.box(x - ww / 2, gy, z - dd / 2, x + ww / 2, gy + h, z + dd / 2, { py: true, ny: true });
    for (let k = c0; k < acc.c.length; k += 4) { acc.c[k] = cc[0]; acc.c[k + 1] = cc[1]; acc.c[k + 2] = cc[2]; }
    roofAcc.face('y', 1, gy + h, x - ww / 2, x + ww / 2, z - dd / 2, z + dd / 2);
  }
  const cityMat = new THREE.MeshLambertMaterial({ map, emissiveMap: emap, emissive: '#ffd9a0', emissiveIntensity: 0, vertexColors: true });
  const city = new THREE.Mesh(acc.geometry(), cityMat); city.name = 'city';
  const roofs = new THREE.Mesh(roofAcc.geometry(), new THREE.MeshLambertMaterial({ color: '#9a9a96' }));
  grp.add(city, roofs);
  grp.userData = { cityMat, groundMat };
  grp.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  return grp;
}

// directional light with shadow camera fitted tightly to bounds
export function makeSun(bounds, mobile) {
  const sun = new THREE.DirectionalLight('#fff', 3);
  sun.castShadow = true;
  const sz = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = mobile ? 3 : 4;
  sun.userData.bounds = bounds;
  return sun;
}

export function fitSun(sun, dirArr) {
  const b = sun.userData.bounds;
  const c = new THREE.Vector3((b.x0 + b.x1) / 2, 1.4, (b.z0 + b.z1) / 2);
  const dir = new THREE.Vector3(...dirArr).normalize();
  sun.position.copy(c).addScaledVector(dir, 40);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  // light-space bounds of the unit box
  const view = new THREE.Matrix4().lookAt(sun.position, c, new THREE.Vector3(0, 1, 0));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(view));
  m.setPosition(sun.position);
  const w2l = m.clone().invert();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const p = new THREE.Vector3();
  for (const x of [b.x0 - 0.3, b.x1 + 0.3]) for (const y of [-0.3, 3.1]) for (const z of [b.z0 - 0.3, b.z1 + 0.3]) {
    p.set(x, y, z).applyMatrix4(w2l);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  const cam = sun.shadow.camera;
  cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1;
  cam.near = Math.max(0.1, -z1 - 1); cam.far = -z0 + 1;
  cam.updateProjectionMatrix();
}

export function makeInteriorLights(n = 6) {
  const lights = [];
  for (let i = 0; i < n; i++) {
    const l = new THREE.PointLight('#ffc488', 0, 6, 2);
    l.castShadow = false; l.userData = { spot: null, cur: 0, goal: 0 };
    lights.push(l);
  }
  return lights;
}
