// main.js — renderer, scene assembly from PLAN, lighting/themes, modes, loop, debug hook.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLAN as RAW_PLAN } from './plan.js';
import { STYLE, THEMES } from './theme.js';
import { makeMaterials } from './materials.js';
import { preparePlan, buildHouse, doorColliders } from './build.js';
import { makeSky, makeCity, makeSun, fitSun, makeInteriorLights } from './env.js';
import { createWalkControls, isFree, EYE, PLAYER_R } from './controls.js';
import { createHUD } from './hud.js';
import { pointInPoly, polyBBox } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
const MOBILE = TOUCH && Math.min(screen.width, screen.height) < 1000;
const loadingEl = document.getElementById('loading');
const setLoad = (t) => { const el = document.getElementById('loadingText'); if (el) el.textContent = t; };

// ── renderer ───────────────────────────────────────────────────────────────
const canvasWrap = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
if (params.get('dpr')) pixelRatio = parseFloat(params.get('dpr'));
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
canvasWrap.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
canvasWrap.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 3000);
scene.add(camera);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ── build ──────────────────────────────────────────────────────────────────
setLoad('建構空間 Building…');
const P = preparePlan(RAW_PLAN);
const M = makeMaterials(STYLE, renderer, MOBILE);
const house = buildHouse(P, M, STYLE);
scene.add(house.root);
const B = P.bounds;
const CENTER = new THREE.Vector3((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);

const sky = makeSky(); scene.add(sky); sky.position.copy(CENTER);
const exterior = makeCity(STYLE, CENTER); scene.add(exterior);
const sun = makeSun(B, MOBILE); scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#fff', '#fff', 0.5); scene.add(hemi);
const iLights = makeInteriorLights(6); for (const l of iLights) scene.add(l);
scene.fog = new THREE.Fog('#cfdde8', 80, 700);

// ── furniture (async; graceful fallback) ───────────────────────────────────
const NO_COLLIDE = new Set(['rug', 'curtain', 'pendant', 'picture', 'tv', 'aircon_indoor', 'db_box', 'towel_rail']);
const furnGroup = new THREE.Group(); furnGroup.name = 'furniture'; scene.add(furnGroup);
const furnColliders = [];
let furnitureSource = 'pending';
function normItem(it) {
  const inner = it.opts && typeof it.opts.opts === 'object' ? it.opts.opts : null;
  const opts = inner ? { ...it.opts, ...inner } : { ...(it.opts || {}) };
  return { ...it, opts };
}
function placeholder(item) {
  const h = item.h || 0.8;
  const mount = item.opts && item.opts.mount;
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(item.w, mount ? Math.min(h, 0.5) : h, item.d), M.placeholder);
  m.position.y = mount ? mount : h / 2;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  g.userData.collide = !NO_COLLIDE.has(item.type);
  return g;
}
const glowMats = [];
function applyLampGlow() { const k = (THEMES[currentTheme] || THEMES.day).lampGlow ?? 1; for (const m of glowMats) m.emissiveIntensity = m.userData.baseEI * k; }
async function loadFurniture() {
  let mod = null;
  try { mod = await import('./furniture.js'); } catch (e) { console.warn('[house] furniture.js unavailable, using placeholders', e && e.message); }
  const theme = { ...STYLE, furniture: STYLE.furniture, name: currentTheme };
  let ok = 0, fb = 0;
  for (const raw of P.furniture || []) {
    const item = normItem(raw);
    let g = null;
    if (mod && typeof mod.makeFurniture === 'function') {
      try { g = mod.makeFurniture(item, theme); } catch (e) { console.warn('[house] makeFurniture failed for', item.type, e && e.message); g = null; }
    }
    if (!g) { g = placeholder(item); fb++; } else ok++;
    g.position.set(item.x, 0, item.z);
    g.rotation.y = (item.rot || 0) * DEG;
    g.userData.item = item;
    if (item.type === 'curtain') g.traverse((o) => { o.castShadow = false; });   // sheers must not black out the sun
    furnGroup.add(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
    const collide = g.userData.collide !== undefined ? !!g.userData.collide : !NO_COLLIDE.has(item.type);
    if (collide) {
      const a = (item.rot || 0) * DEG, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const hw = (item.w * c + item.d * s) / 2 - 0.02, hd = (item.w * s + item.d * c) / 2 - 0.02;
      furnColliders.push({ x0: item.x - hw, x1: item.x + hw, z0: item.z - hd, z1: item.z + hd, src: 'furn:' + item.type });
    }
  }
  furnGroup.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01 && !glowMats.includes(m)) { m.userData.baseEI = m.emissiveIntensity; glowMats.push(m); }
    }
  });
  applyLampGlow();
  if (!params.has('nobatch')) batchStatic(furnGroup);
  furnitureSource = mod ? `module (${ok} ok, ${fb} placeholder)` : `placeholder (${fb})`;
  rebuildStatic();
  renderer.shadowMap.needsUpdate = true;
  // re-resolve player in case furniture landed on top of the spawn point
  if (mode === 'walk') walk.setPose(walk.state.x, walk.state.z, null, null, true);
}

// Merge all static furniture meshes that share a material into one mesh (draw calls: ~250 → ~50).
function batchStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), keep = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || (o.geometry.groups && o.geometry.groups.length > 1) || !o.visible) { keep.push(o); return; }
    const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${attrs}|${g.index ? 1 : 0}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  const out = new THREE.Group(); out.name = 'furnitureBatched';
  let merged = 0;
  for (const list of buckets.values()) {
    const m0 = list[0];
    const geos = list.map((o) => { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k]; return g; });
    let g = null;
    try { g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch { g = null; }
    if (!g) { keep.push(...list); continue; }
    const mesh = new THREE.Mesh(g, m0.material);
    mesh.castShadow = m0.castShadow; mesh.receiveShadow = m0.receiveShadow; mesh.renderOrder = m0.renderOrder;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    out.add(mesh); merged += list.length;
  }
  // re-home meshes we could not merge, preserving their world transform
  for (const o of keep) { const m = o.matrixWorld.clone(); o.removeFromParent(); m.decompose(o.position, o.quaternion, o.scale); o.updateMatrix(); out.add(o); }
  group.clear(); group.add(out);
  console.info(`[house] furniture batched: ${merged} meshes → ${buckets.size} draws (+${keep.length} kept)`);
}

// ── colliders ──────────────────────────────────────────────────────────────
let staticColliders = [];
const colliders = [];
function rebuildStatic() { staticColliders = [...house.colliders, ...furnColliders]; }
rebuildStatic();
function getColliders() {
  colliders.length = 0;
  for (const c of staticColliders) colliders.push(c);
  doorColliders(house.doors, colliders);
  return colliders;
}

// ── controls ───────────────────────────────────────────────────────────────
const touchLayer = document.getElementById('touch');
const walk = createWalkControls({ layer: touchLayer, camera, getColliders, onFirstInput: () => {} });
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.enableDamping = true; orbit.dampingFactor = 0.08;
orbit.minDistance = 3; orbit.maxDistance = 45;
orbit.maxPolarAngle = 80 * DEG; orbit.minPolarAngle = 5 * DEG;
orbit.rotateSpeed = 0.7; orbit.zoomSpeed = 0.9; orbit.panSpeed = 0.8;
orbit.target.copy(CENTER);
orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// ── state ──────────────────────────────────────────────────────────────────
let mode = 'walk';
let currentTheme = params.get('theme') === 'evening' ? 'evening' : 'day';
let labelsOn = false;
let currentRoom = null;
let tween = null;

// start: foyer just inside the main door, looking north toward the living room
const foyer = P.rooms.find((r) => r.id === 'foyer');
// start: north end of the entrance hall, looking north-west across kitchen/dining to the living room + balcony
const START = params.has('start') ? (([x, z, y]) => ({ x, z, yaw: y, pitch: -4 }))(params.get('start').split(',').map(Number))
  : foyer ? { x: 14.85, z: 6.35, yaw: 38, pitch: -4 } : { x: CENTER.x, z: CENTER.z, yaw: 0, pitch: 0 };
walk.setPose(START.x, START.z, START.yaw, START.pitch);

// ── camera fov per aspect ──────────────────────────────────────────────────
function walkFov(aspect) { const h = 84 * DEG; return THREE.MathUtils.clamp(2 * Math.atan(Math.tan(h / 2) / aspect) / DEG, 58, 84); }
function overviewFov(aspect) { return aspect < 1 ? 58 : 42; }
function targetFov() { return mode === 'walk' ? walkFov(camera.aspect) : overviewFov(camera.aspect); }
camera.fov = walkFov(camera.aspect); camera.updateProjectionMatrix();

// ── HUD ────────────────────────────────────────────────────────────────────
const hud = createHUD({
  PLAN: P, lookup: house.lookup, touch: TOUCH,
  onToggleMode: () => setMode(mode === 'walk' ? 'overview' : 'walk'),
  onToggleTheme: () => applyTheme(currentTheme === 'day' ? 'evening' : 'day'),
  onPickRoom: (r) => goRoom(r),
  onToggleLabels: () => { labelsOn = !labelsOn; hud.setLabels(labelsOn); if (labelsOn && mode === 'walk') setMode('overview'); updateLabels(); },
  onMinimapTap: (x, z) => {
    if (mode !== 'walk') { const r = house.lookup.at(x, z); if (r) goRoom(r); return; }
    const spot = freeSpotNear(x, z, house.lookup.at(x, z));
    if (spot) teleport(spot[0], spot[1], walk.state.yaw / DEG);
  },
});

// room labels (overview)
const labelObjs = [];
for (const r of P.rooms) {
  const el = document.createElement('div');
  el.className = 'room-label' + (r.area < 3 ? ' small' : '') + (MOBILE || Math.min(innerWidth, innerHeight) < 600 ? ' compact' : '');
  el.innerHTML = `<b>${r.zh}</b><span>${r.name}</span><em>${r.dims || ''}</em>`;
  const o = new CSS2DObject(el);
  o.position.set(r.centroid[0], 0.05, r.centroid[1]);
  o.visible = false;
  scene.add(o); labelObjs.push(o);
}
function updateLabels() { const v = labelsOn && mode === 'overview'; for (const o of labelObjs) o.visible = v; labelRenderer.domElement.style.display = v ? '' : 'none'; }

// ── teleport / room navigation ─────────────────────────────────────────────
function freeSpotNear(x, z, room) {
  const cols = getColliders();
  const ok = (px, pz) => isFree(px, pz, cols, PLAYER_R + 0.12) && (!room || (pointInPoly(px, pz, room.poly)));
  if (ok(x, z)) return [x, z];
  for (let rad = 0.15; rad < 3; rad += 0.15) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * rad, pz = z + Math.sin((a / 16) * Math.PI * 2) * rad;
      if (ok(px, pz)) return [px, pz];
    }
  }
  return null;
}
function bestYaw(x, z) {
  const cols = getColliders();
  let best = 0, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const yaw = (i / 16) * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    let d = 0;
    for (; d < 9; d += 0.1) {
      const px = x + dx * d, pz = z + dz * d;
      if (!isFree(px, pz, cols, 0.05)) break;
    }
    if (d > bestD + 0.05) { bestD = d; best = yaw; }
  }
  return best / DEG;
}
const fader = document.getElementById('fader');
function teleport(x, z, yawDeg) {
  fader.classList.add('on');
  setTimeout(() => { walk.setPose(x, z, yawDeg, -4); snapDoors(); fader.classList.remove('on'); }, 180);
}
function goRoom(r) {
  if (mode === 'walk') {
    const [cx, cz] = r.centroid;
    const spot = freeSpotNear(cx, cz, r) || freeSpotNear(cx, cz, null);
    if (spot) teleport(spot[0], spot[1], bestYaw(spot[0], spot[1]));
    hud.setRoom(r);
  } else {
    const bb = polyBBox(r.poly);
    const tgt = new THREE.Vector3(r.centroid[0], 0.5, r.centroid[1]);
    const size = Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0);
    const dist = THREE.MathUtils.clamp(size * 2.2 + 3, 5, 16);
    const dir = camera.position.clone().sub(orbit.target).normalize();
    tweenOrbit(tgt, tgt.clone().addScaledVector(dir, dist), 0.9);
    hud.setRoom(r);
  }
}

// ── modes ──────────────────────────────────────────────────────────────────
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function overviewPose() {
  const aspect = camera.aspect, fov = overviewFov(aspect) * DEG;
  const hf = 2 * Math.atan(Math.tan(fov / 2) * aspect);
  const portrait = aspect < 1;
  // portrait: look along −X so the long side of the unit runs up the screen (entrance at the bottom)
  const az = portrait ? Math.PI / 2 : 0;
  const ex = (B.x1 - B.x0) / 2 + 0.5, ez = (B.z1 - B.z0) / 2 + 0.5;
  const halfW = portrait ? ez : ex, halfD = portrait ? ex : ez;
  const polar = (portrait ? 28 : 32) * DEG;
  const dist = Math.max(halfW / Math.tan(hf / 2), (halfD * Math.cos(polar) + 1.4) / Math.tan(fov / 2) + halfD * Math.sin(polar)) * (portrait ? 1.22 : 1.06);
  const target = CENTER.clone().setY(0.4);
  const pos = target.clone().add(new THREE.Vector3(Math.sin(polar) * Math.sin(az) * dist, Math.cos(polar) * dist, Math.sin(polar) * Math.cos(az) * dist));
  return { target, pos };
}
function tweenOrbit(target, pos, dur) {
  tween = { kind: 'orbit', t: 0, dur, fromT: orbit.target.clone(), toT: target, fromP: camera.position.clone(), toP: pos };
}
function setMode(m) {
  if (m === mode || tween && tween.kind === 'mode') return;
  hud.closeMenu();
  const fromP = camera.position.clone(), fromQ = camera.quaternion.clone(), fromFov = camera.fov;
  if (m === 'overview') {
    mode = 'overview';
    walk.setEnabled(false);
    house.ceilingGroup.visible = false; house.roofGroup.visible = false;
    renderer.shadowMap.needsUpdate = true;
    const { target, pos } = overviewPose();
    const tmp = new THREE.PerspectiveCamera(); tmp.position.copy(pos); tmp.lookAt(target);
    orbit.target.copy(target);
    tween = { kind: 'mode', to: 'overview', t: 0, dur: 1.25, fromP, fromQ, fromFov, toP: pos, toQ: tmp.quaternion.clone(), toFov: overviewFov(camera.aspect) };
    touchLayer.classList.add('off');
  } else {
    mode = 'walk';
    orbit.enabled = false;
    const S = walk.state;
    const tmp = new THREE.Object3D(); tmp.rotation.order = 'YXZ'; tmp.rotation.set(S.pitch, S.yaw, 0);
    tween = { kind: 'mode', to: 'walk', t: 0, dur: 1.2, fromP, fromQ, fromFov, toP: new THREE.Vector3(S.x, EYE, S.z), toQ: tmp.quaternion.clone(), toFov: walkFov(camera.aspect) };
  }
  hud.setMode(mode);
  updateLabels();
  updateBackdrop(); adaptWarmup(1.5);
  if (mode === 'overview') hud.setRoom({ zh: '全屋俯瞰', name: 'Whole unit', dims: '122 m²' });
}
function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = ease(tween.t);
  if (tween.kind === 'mode') {
    camera.position.lerpVectors(tween.fromP, tween.toP, k);
    // lift in an arc so we rise out of the room rather than clipping through walls
    const lift = Math.sin(Math.PI * k) * (tween.to === 'overview' ? 2.0 : 1.0);
    camera.position.y += lift;
    camera.quaternion.slerpQuaternions(tween.fromQ, tween.toQ, k);
    camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * k; camera.updateProjectionMatrix();
    if (tween.t >= 1) {
      if (tween.to === 'overview') { orbit.enabled = true; orbit.update(); }
      else {
        house.ceilingGroup.visible = true; house.roofGroup.visible = true;
        renderer.shadowMap.needsUpdate = true;
        walk.setEnabled(true); touchLayer.classList.remove('off'); walk.applyCamera();
        currentRoom = null;
      }
      tween = null;
    } else if (tween.to === 'walk' && tween.t > 0.82 && !house.ceilingGroup.visible) {
      house.ceilingGroup.visible = true; house.roofGroup.visible = true; renderer.shadowMap.needsUpdate = true;
    }
  } else if (tween.kind === 'orbit') {
    orbit.target.lerpVectors(tween.fromT, tween.toT, k);
    camera.position.lerpVectors(tween.fromP, tween.toP, k);
    camera.lookAt(orbit.target);
    if (tween.t >= 1) tween = null;
  }
}

// ── doors ──────────────────────────────────────────────────────────────────
function springTo(d, target, dt, w = 6.5) {
  const a = w * w * (target - d.open) - 2 * w * d.vel;
  d.vel += a * dt; d.open += d.vel * dt;
  if (d.open < 0) { d.open = 0; d.vel = 0; } if (d.open > 1) { d.open = 1; d.vel = 0; }
}
function applyDoor(d) {
  if (d.type === 'swing') d.pivot.rotation.y = d.closedRot + (d.openRot - d.closedRot) * d.open;
  else for (const p of d.panels) {
    const u = p.closedU + (p.openU - p.closedU) * d.open;
    if (d.alongX) p.g.position.x = u; else p.g.position.z = u;
  }
}
let doorOverride = null;   // debug: null = automatic, 0 = force closed, 1 = force open
function updateDoors(dt) {
  const px = walk.state.x, pz = walk.state.z;
  for (const d of house.doors) {
    if (!d) continue;
    const dist = Math.hypot(px - d.center[0], pz - d.center[1]);
    const near = d.type === 'swing' ? dist < (d.id === 'main' ? 0.95 : 1.4) : distToSeg(px, pz, d) < 1.5;
    d.target = doorOverride !== null ? doorOverride : (mode === 'overview') ? 1 : near ? 1 : 0;
    const before = d.open;
    springTo(d, d.target, Math.min(dt, 0.05), d.type === 'swing' ? 6.0 : 5.0);
    if (before !== d.open) applyDoor(d);
  }
}
function distToSeg(px, pz, d) {
  const [o0, o1] = d.seg;
  if (d.alongX) { const u = Math.max(o0, Math.min(px, o1)); return Math.hypot(px - u, pz - d.c); }
  const u = Math.max(o0, Math.min(pz, o1)); return Math.hypot(px - d.c, pz - u);
}
function snapDoors() {
  const px = walk.state.x, pz = walk.state.z;
  for (const d of house.doors) {
    if (!d) continue;
    const near = d.type === 'swing' ? Math.hypot(px - d.center[0], pz - d.center[1]) < (d.id === 'main' ? 0.95 : 1.4) : distToSeg(px, pz, d) < 1.5;
    d.open = doorOverride !== null ? doorOverride : near ? 1 : 0; d.vel = 0; applyDoor(d);
  }
}

// ── themes ─────────────────────────────────────────────────────────────────
function applyTheme(name) {
  const T = THEMES[name] || THEMES.day;
  currentTheme = T.name || name;
  renderer.toneMappingExposure = T.exposure;
  const u = sky.material.uniforms;
  u.top.value.set(T.sky.top); u.horizon.value.set(T.sky.horizon); u.bottom.value.set(T.sky.bottom);
  u.sunDir.value.set(...T.sun.dir).normalize(); u.sunCol.value.set(T.sun.color); u.sunAmt.value = name === 'day' ? 1 : 0.15;
  scene.fog.color.set(T.fog.color); scene.fog.near = T.fog.near; scene.fog.far = T.fog.far;
  sun.color.set(T.sun.color); sun.intensity = T.sun.intensity; fitSun(sun, T.sun.dir);
  hemi.color.set(T.hemi.sky); hemi.groundColor.set(T.hemi.ground); hemi.intensity = T.hemi.intensity;
  scene.environmentIntensity = T.envIntensity;
  M.downlight.color.set(T.downlight.color).multiplyScalar(T.downlight.intensity);
  M.glow.color.set(T.downlight.color); M.glow.opacity = T.downlight.glow; M.glow.visible = T.downlight.glow > 0.001;
  for (const l of iLights) { l.color.set(T.interior.color); l.distance = T.interior.distance; }
  interiorTarget = T.interior.intensity;
  exterior.userData.cityMat.emissiveIntensity = T.cityWindows;
  exterior.userData.groundMat.color.set(T.groundColor || STYLE.ground.color).multiplyScalar(T.ground);
  applyLampGlow();
  updateBackdrop();
  adaptWarmup(1.0);
  renderer.shadowMap.needsUpdate = true;
  document.body.classList.toggle('theme-evening', currentTheme === 'evening');
  hud.setTheme(currentTheme);
}
let interiorTarget = 0;
// overview backdrop: optional screen-space gradient (evening dusk) instead of ground + city
const bgCache = {};
function gradientTexture(stops) {
  const key = stops.join(); if (bgCache[key]) return bgCache[key];
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach((col, i) => grd.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (bgCache[key] = t);
}
function updateBackdrop() {
  const T = THEMES[currentTheme] || THEMES.day;
  const useBg = mode === 'overview' && T.overviewBg;
  scene.background = useBg ? gradientTexture(T.overviewBg) : null;
  sky.visible = !useBg; exterior.visible = !useBg;
}
let spotTimer = 0;
function updateInteriorLights(dt) {
  spotTimer -= dt;
  if (spotTimer <= 0 && interiorTarget > 0) {
    spotTimer = 0.25;
    const px = mode === 'walk' ? walk.state.x : orbit.target.x, pz = mode === 'walk' ? walk.state.z : orbit.target.z;
    const room = mode === 'walk' && currentRoom ? currentRoom.id : null;
    let want;
    if (mode === 'walk') {
      want = [...house.spots].sort((a, b) => (Math.hypot(a.x - px, a.z - pz) + (a.room === room ? 0 : 2.5)) - (Math.hypot(b.x - px, b.z - pz) + (b.room === room ? 0 : 2.5))).slice(0, iLights.length);
    } else {
      // spread over the unit: greedy farthest-point from the biggest room
      want = [house.spots[0]];
      while (want.length < iLights.length) {
        let best = null, bd = -1;
        for (const s of house.spots) { if (want.includes(s)) continue; const d = Math.min(...want.map((w) => Math.hypot(w.x - s.x, w.z - s.z))); if (d > bd) { bd = d; best = s; } }
        if (!best) break; want.push(best);
      }
    }
    const free = [];
    for (const l of iLights) { if (l.userData.spot && want.includes(l.userData.spot)) want = want.filter((s) => s !== l.userData.spot); else free.push(l); }
    for (const l of free) l.userData.want = want.shift() || null;
  }
  for (const l of iLights) {
    const ud = l.userData;
    if (ud.want !== undefined && ud.want !== ud.spot) {
      ud.goal = 0;
      if (ud.cur < 0.03) { ud.spot = ud.want; if (ud.spot) l.position.set(ud.spot.x, ud.spot.y, ud.spot.z); }
    } else ud.goal = ud.spot ? interiorTarget : 0;
    if (interiorTarget === 0) ud.goal = 0;
    ud.cur += (ud.goal - ud.cur) * (1 - Math.exp(-dt * 6));
    if (Math.abs(ud.cur - ud.goal) < 0.01) ud.cur = ud.goal;
    l.intensity = ud.cur;
    l.visible = interiorTarget > 0 || ud.cur > 0.01;   // hidden in daytime → cheaper shaders
  }
}

// ── resize / adaptive resolution ───────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  if (!tween) camera.fov = targetFov();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

const ADAPT = !params.has('noadapt');
const PR_STEPS = [2, 1.75, 1.5, 1.25, 1];
// starts at min(dpr, 2); measures 0.75 s windows (after a 1 s warm-up that skips shader compiles) and steps
// down 2 → 1.5 → 1.25 → 1 whenever a window averages < 50 fps — reaches the floor within ~2–3 s on a slow GPU.
let fpsEMA = 60, fpsWindow = [], adaptTimer = 0, adaptWarm = 1.0;
function adaptWarmup(t = 1.0) { adaptWarm = t; fpsWindow = []; adaptTimer = 0; }
function adapt(dt) {
  if (adaptWarm > 0) { adaptWarm -= dt; return; }
  fpsWindow.push(dt);
  adaptTimer += dt;
  if (adaptTimer < 0.75) return;
  const avg = fpsWindow.length / fpsWindow.reduce((a, b) => a + b, 0);
  fpsWindow = []; adaptTimer = 0;
  if (!ADAPT || document.hidden) return;
  if (avg < 50) {
    // fill-rate bound → scale pixel count by fps ratio, i.e. ratio by its square root; snap down to a step
    const want = pixelRatio * Math.sqrt(Math.max(avg, 5) / 58);
    const next = PR_STEPS.find((p) => p <= want + 0.01) || PR_STEPS[PR_STEPS.length - 1];
    if (next && next < pixelRatio - 0.01) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); onResize(); adaptWarmup(0.25); console.info('[house] pixelRatio →', pixelRatio); }
  }
}

// ── optional desktop 'High' quality (GTAO) ─────────────────────────────────
let composer = null, hq = false;
async function setQuality(q) {
  hq = q === 'high' && !MOBILE;
  if (hq && !composer) {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.1 });
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !MOBILE) setQuality(hq ? 'normal' : 'high'); });

// ── main loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let frames = 0, fpsVal = 0, fpsAcc = 0;
function frame() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.1);
  frames++; fpsAcc += dt; if (fpsAcc >= 0.5) { fpsVal = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  fpsEMA += (1 / Math.max(dt, 1e-3) - fpsEMA) * 0.05;
  if (mode === 'walk' && !tween) walk.update(dt);
  stepTween(dt);
  if (mode === 'overview' && !tween) orbit.update();
  updateDoors(dt);
  updateInteriorLights(dt);
  // room tracking + minimap
  if (mode === 'walk') {
    const r = house.lookup.at(walk.state.x, walk.state.z);
    if (r && r !== currentRoom) { currentRoom = r; hud.setRoom(r); }
  }
  const mx = mode === 'walk' || tween ? walk.state.x : orbit.target.x, mz = mode === 'walk' || tween ? walk.state.z : orbit.target.z;
  const myaw = mode === 'walk' ? walk.state.yaw : Math.atan2(-(orbit.target.x - camera.position.x), -(orbit.target.z - camera.position.z));
  hud.drawMinimap(mx, mz, myaw, currentRoom && mode === 'walk' ? currentRoom.id : null);
  if (hq && composer) composer.render(); else renderer.render(scene, camera);
  if (labelsOn && mode === 'overview') labelRenderer.render(scene, camera);
  adapt(Math.min(rawDt, 2));
}

// ── boot ───────────────────────────────────────────────────────────────────
applyTheme(currentTheme);
hud.setMode(mode);
updateLabels();
snapDoors();
if (params.get('mode') === 'overview') setMode('overview');
setLoad('擺放家具 Furnishing…');
const furnDone = loadFurniture().catch((e) => console.error('[house] furniture load failed', e));
await Promise.race([furnDone, new Promise((r) => setTimeout(r, 6000))]);
renderer.shadowMap.needsUpdate = true;
renderer.setAnimationLoop(frame);
requestAnimationFrame(() => requestAnimationFrame(() => {
  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 700);
  if (!params.has('nohint')) hud.showHint();
}));

// ── debug hook ─────────────────────────────────────────────────────────────
window.__house = {
  ready: true,
  setPose(x, z, yawDeg = 0, pitchDeg = 0) {
    if (mode !== 'walk' || tween) setModeImmediate('walk');
    walk.setPose(x, z, yawDeg, pitchDeg, false); snapDoors();
    const r = house.lookup.at(x, z); if (r) { currentRoom = r; hud.setRoom(r); }
    return { x: walk.state.x, z: walk.state.z };
  },
  mode(name) { if (name) setModeImmediate(name); return mode; },
  modeAnimated(name) { setMode(name); return mode; },
  theme(name) { if (name) applyTheme(name); return currentTheme; },
  labels(on) { labelsOn = !!on; hud.setLabels(labelsOn); updateLabels(); return labelsOn; },
  quality(q) { return setQuality(q); },
  goRoom(id) { const r = P.rooms.find((q) => q.id === id); if (r) goRoom(r); return !!r; },
  fps() { return Math.round(fpsVal * 10) / 10; },
  pose() { const S = walk.state, r = house.lookup.at(S.x, S.z); return { x: S.x, z: S.z, yaw: S.yaw / DEG, pitch: S.pitch / DEG, vx: S.vx, vz: S.vz, room: r ? r.id : null }; },
  info() {
    const i = renderer.info;
    return {
      calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
      programs: i.programs ? i.programs.length : null, pixelRatio, dpr: renderer.getPixelRatio(), deviceDpr: window.devicePixelRatio, fps: this.fps(), mode, theme: currentTheme,
      room: currentRoom && currentRoom.id, pose: this.pose(), furniture: furnitureSource, mobile: MOBILE, touch: TOUCH,
    };
  },
  render() { renderer.render(scene, camera); if (labelsOn && mode === 'overview') labelRenderer.render(scene, camera); },
  step(sec = 1) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (mode === 'walk') walk.update(1 / 60); updateDoors(1 / 60); } return this.pose(); },   // deterministic sim for tests
  forceDoors(v = null) { doorOverride = v; snapDoors(); return v; },
  doors() { return house.doors.map((d) => ({ id: d.id, open: +d.open.toFixed(2) })); },
  _: { THREE, scene, camera, renderer, house, walk, orbit, P },
};
function setModeImmediate(name) {
  tween = null;
  if (name === 'overview') {
    mode = 'overview'; walk.setEnabled(false); touchLayer.classList.add('off');
    house.ceilingGroup.visible = false; house.roofGroup.visible = false;
    const { target, pos } = overviewPose();
    orbit.target.copy(target); camera.position.copy(pos); camera.lookAt(target);
    camera.fov = overviewFov(camera.aspect); camera.updateProjectionMatrix();
    orbit.enabled = true; orbit.update();
    hud.setRoom({ zh: '全屋俯瞰', name: 'Whole unit', dims: '122 m²' });
  } else {
    mode = 'walk'; orbit.enabled = false;
    house.ceilingGroup.visible = true; house.roofGroup.visible = true;
    walk.setEnabled(true); touchLayer.classList.remove('off');
    camera.fov = walkFov(camera.aspect); camera.updateProjectionMatrix(); walk.applyCamera();
    currentRoom = null;
  }
  renderer.shadowMap.needsUpdate = true;
  hud.setMode(mode); updateLabels(); updateBackdrop();
}
