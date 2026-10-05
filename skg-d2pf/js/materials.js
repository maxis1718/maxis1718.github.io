// materials.js — procedural canvas textures + material factory. Reads STYLE from theme.js.
import * as THREE from 'three';

// ── deterministic PRNG ─────────────────────────────────────────────────────
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const C = (hex) => new THREE.Color(hex);
function shade(hex, k) {           // k in [-1,1] → darker / lighter, returns css
  const c = C(hex);
  if (k >= 0) c.lerp(new THREE.Color(1, 1, 1), k); else c.multiplyScalar(1 + k);
  return '#' + c.getHexString();
}
function clear(hex) { const c = C(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0)`; }
function mix(a, b, t) { return '#' + C(a).lerp(C(b), t).getHexString(); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

let ANISO = 8;
function tex(cv, repX, repY) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.repeat.set(repX, repY);          // UVs are in metres → repeat = 1 / (metres covered by the canvas)
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noiseDots(g, w, h, r, n, alpha, colA, colB) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = r() < 0.5 ? colA : colB;
    const s = 0.6 + r() * 1.6;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

// ── Oak planks: canvas covers L (along X) × planks*plankW (along Z) ────────
function oakTexture(cfg, mobile) {
  const planks = 8, L = cfg.plankL * 2;
  const W = mobile ? 1024 : 2048, H = mobile ? 512 : 1024;
  const cv = canvas(W, H), g = cv.getContext('2d'), r = rng(11);
  const ph = H / planks, pxm = W / L;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    // stagger: each row has joints at different offset
    const off = (r() * 0.8 + 0.1) * cfg.plankL * pxm;
    const joints = [off - cfg.plankL * pxm, off, off + cfg.plankL * pxm];
    for (let j = 0; j < joints.length; j++) {
      const x0 = joints[j], x1 = x0 + cfg.plankL * pxm;
      const base = mix(cfg.color, cfg.color2, r() * 0.7);
      const tint = shade(base, (r() - 0.5) * 0.12);
      g.fillStyle = tint;
      g.fillRect(x0, y0, x1 - x0, ph);
      // grain lines
      const lines = 26;
      for (let k = 0; k < lines; k++) {
        const yy = y0 + r() * ph;
        g.strokeStyle = shade(tint, -0.12 - r() * 0.12);
        g.globalAlpha = 0.10 + r() * 0.18;
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        g.moveTo(x0, yy);
        const amp = 1 + r() * 3, freq = 0.002 + r() * 0.01, ph0 = r() * 6;
        for (let x = x0; x <= x1; x += 24) g.lineTo(x, yy + Math.sin(x * freq + ph0) * amp);
        g.stroke();
      }
      // a few knots / cathedral arcs
      if (r() < 0.45) {
        const kx = x0 + (0.2 + r() * 0.6) * (x1 - x0), ky = y0 + ph * (0.3 + r() * 0.4);
        for (let k = 0; k < 6; k++) {
          g.globalAlpha = 0.10;
          g.strokeStyle = shade(tint, -0.3);
          g.lineWidth = 1;
          g.beginPath(); g.ellipse(kx, ky, 18 + k * 14, 3 + k * 2.5, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      g.globalAlpha = 1;
      // end joint
      g.fillStyle = shade(cfg.color2, -0.35);
      g.globalAlpha = 0.55;
      g.fillRect(x0, y0, 1.5, ph);
      g.globalAlpha = 1;
    }
    // long-edge micro bevel
    g.fillStyle = shade(cfg.color2, -0.4); g.globalAlpha = 0.6; g.fillRect(0, y0, W, 1.5);
    g.fillStyle = shade(cfg.color, 0.25); g.globalAlpha = 0.25; g.fillRect(0, y0 + 1.5, W, 1);
    g.globalAlpha = 1;
  }
  noiseDots(g, W, H, r, W * 3, 0.06, '#000', '#fff');
  return tex(cv, 1 / L, 1 / (planks * cfg.plankW));
}

// ── Composite / teak decking: boards along canvas X (= room long axis), dark 5 mm gaps, staggered butt joints ──
function deckTexture(cfg, mobile) {
  const boards = 8, L = cfg.boardL * 2;
  const W = mobile ? 1024 : 2048, H = mobile ? 512 : 1024;
  const cv = canvas(W, H), g = cv.getContext('2d'), r = rng(77);
  const bh = H / boards, pxm = W / L, gap = Math.max(2, cfg.gapW * (H / (boards * cfg.boardW)));
  g.fillStyle = cfg.gap; g.fillRect(0, 0, W, H);
  for (let b = 0; b < boards; b++) {
    const y0 = b * bh + gap / 2, hh = bh - gap;
    const off = (r() * 0.9 + 0.05) * cfg.boardL * pxm;
    for (const x0 of [off - cfg.boardL * pxm, off, off + cfg.boardL * pxm]) {
      const x1 = x0 + cfg.boardL * pxm - gap;
      const base = shade(mix(cfg.color, cfg.color2, r()), (r() - 0.5) * 0.14);
      g.fillStyle = base; g.fillRect(x0, y0, x1 - x0, hh);
      // long streaky grain (composite brushed finish)
      for (let k = 0; k < 34; k++) {
        const yy = y0 + r() * hh;
        g.strokeStyle = r() < 0.6 ? shade(base, -0.18 - r() * 0.12) : shade(base, 0.12);
        g.globalAlpha = 0.08 + r() * 0.16; g.lineWidth = 0.5 + r() * 1.6;
        g.beginPath(); g.moveTo(x0, yy);
        const amp = 0.5 + r() * 1.5, f = 0.003 + r() * 0.006, p0 = r() * 6;
        for (let x = x0; x <= x1; x += 32) g.lineTo(x, yy + Math.sin(x * f + p0) * amp);
        g.stroke();
      }
      g.globalAlpha = 1;
      // soft edge darkening (rounded board edges)
      const eg = g.createLinearGradient(0, y0, 0, y0 + hh);
      eg.addColorStop(0, 'rgba(0,0,0,0.22)'); eg.addColorStop(0.12, 'rgba(0,0,0,0)'); eg.addColorStop(0.88, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = eg; g.fillRect(x0, y0, x1 - x0, hh);
    }
    g.fillStyle = cfg.gap;
    for (const x0 of [off - cfg.boardL * pxm, off, off + cfg.boardL * pxm]) g.fillRect(x0 + cfg.boardL * pxm - gap, y0, gap, hh);
  }
  noiseDots(g, W, H, r, W * 3, 0.07, '#000', '#fff');
  return tex(cv, 1 / L, 1 / (boards * cfg.boardW));
}

// ── Porcelain / stone tiles: canvas covers nx × ny tiles ────────────────────
function tileTexture(cfg, mobile, seed = 3, nx = 4, ny = 4) {
  const pxPerTile = mobile ? 192 : 288;
  const aspect = cfg.tileH / cfg.tileW;
  const W = nx * pxPerTile, H = Math.round(ny * pxPerTile * aspect);
  const cv = canvas(W, H), g = cv.getContext('2d'), r = rng(seed);
  const tw = W / nx, th = H / ny;
  const pxm = tw / cfg.tileW;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * tw, y = j * th;
    const base = mix(cfg.color, cfg.color2, r() * 0.55);
    g.fillStyle = base; g.fillRect(x, y, tw, th);
    // soft cloudy variation
    for (let k = 0; k < 10; k++) {
      const gx = x + r() * tw, gy = y + r() * th, rad = (0.15 + r() * 0.35) * tw;
      const grd = g.createRadialGradient(gx, gy, 0, gx, gy, rad);
      const c2 = r() < 0.5 ? shade(base, 0.05) : shade(base, -0.035);
      grd.addColorStop(0, c2); grd.addColorStop(1, clear(c2));
      g.globalAlpha = 0.5; g.fillStyle = grd;
      g.save(); g.beginPath(); g.rect(x, y, tw, th); g.clip(); g.fillRect(x, y, tw, th); g.restore();
    }
    g.globalAlpha = 1;
    if (cfg.kind === 'tile' && cfg.vein) {   // faint marble veins
      g.save(); g.beginPath(); g.rect(x, y, tw, th); g.clip();
      const veins = 2 + Math.floor(r() * 3);
      for (let v = 0; v < veins; v++) {
        g.strokeStyle = shade(base, -0.18); g.globalAlpha = cfg.vein * (1 + r() * 2);
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        let px = x + r() * tw, py = y - 5, ang = Math.PI / 2 + (r() - 0.5) * 1.2;
        g.moveTo(px, py);
        while (py < y + th + 5 && px > x - 20 && px < x + tw + 20) {
          ang += (r() - 0.5) * 0.5; px += Math.cos(ang) * 10; py += Math.abs(Math.sin(ang)) * 10 + 2; g.lineTo(px, py);
        }
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    }
    if (cfg.kind === 'stone') {           // anti-slip speckle texture
      g.save(); g.beginPath(); g.rect(x, y, tw, th); g.clip();
      noiseDots(g, W, H, r, (tw * th) / 6, 0.22, shade(base, -0.25), shade(base, 0.2));
      g.restore();
    }
  }
  // grout
  const gw = Math.max(1.2, 0.003 * pxm);
  g.fillStyle = cfg.grout;
  for (let i = 0; i <= nx; i++) g.fillRect(i * tw - gw / 2, 0, gw, H);
  for (let j = 0; j <= ny; j++) g.fillRect(0, j * th - gw / 2, W, gw);
  // edge highlight (tiny bevel)
  g.globalAlpha = 0.18; g.fillStyle = '#ffffff';
  for (let i = 0; i < nx; i++) g.fillRect(i * tw + gw / 2, 0, 1, H);
  for (let j = 0; j < ny; j++) g.fillRect(0, j * th + gw / 2, W, 1);
  g.globalAlpha = 1;
  noiseDots(g, W, H, r, W * 2, 0.05, '#000', '#fff');
  return tex(cv, 1 / (nx * cfg.tileW), 1 / (ny * cfg.tileH));
}

function concreteTexture(cfg, mobile) {
  const S = mobile ? 512 : 1024, cv = canvas(S, S), g = cv.getContext('2d'), r = rng(5);
  g.fillStyle = cfg.color; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 60; k++) {
    const x = r() * S, y = r() * S, rad = 30 + r() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const cc = r() < 0.5 ? cfg.color2 : shade(cfg.color, 0.08);
    grd.addColorStop(0, cc); grd.addColorStop(1, clear(cc));
    g.globalAlpha = 0.35; g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
  noiseDots(g, S, S, r, S * 30, 0.12, shade(cfg.color, -0.3), shade(cfg.color, 0.2));
  return tex(cv, 1 / 2, 1 / 2);
}

function plasterTexture(amount) {          // near-white noise multiplier, 2 m tile
  const S = 512, cv = canvas(S, S), g = cv.getContext('2d'), r = rng(9);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 140; k++) {
    const x = r() * S, y = r() * S, rad = 20 + r() * 120;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = Math.round(255 * (1 - amount * (0.5 + r())));
    grd.addColorStop(0, `rgb(${v},${v},${v})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  noiseDots(g, S, S, r, S * 12, amount * 0.9, '#9a978f', '#ffffff');
  return tex(cv, 1 / 2, 1 / 2);
}

function veneerTexture(cfg, seed) {        // vertical grain, canvas covers 1 m × 2.2 m
  const W = 256, H = 512, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(seed);
  g.fillStyle = cfg.color; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    const x = r() * W;
    g.strokeStyle = r() < 0.7 ? cfg.grain : shade(cfg.color, 0.1);
    g.globalAlpha = 0.12 + r() * 0.2; g.lineWidth = 0.5 + r() * 1.5;
    g.beginPath(); g.moveTo(x, 0);
    const amp = 1 + r() * 3, f = 0.01 + r() * 0.02, p = r() * 6;
    for (let y = 0; y <= H; y += 16) g.lineTo(x + Math.sin(y * f + p) * amp, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(cv, 1 / 1.0, 1 / 2.2);
}

function radialGlowTexture() {
  const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Downlight floor pool (IES-like): smooth cone (penumbra) × cos³θ falloff; uv (0.5,0.5) = beam axis.
// Quad half-size = poolR = h·tan(beam) metres at the reference height h; vertex colours scale it per fixture.
function poolTexture(LG) {
  const S = 128, cv = canvas(S, S), g = cv.getContext('2d'), img = g.createImageData(S, S);
  const outer = LG.beam, inner = LG.beam * (1 - LG.penumbra), T = Math.tan(outer);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = ((x + 0.5) / S - 0.5) * 2, v = ((y + 0.5) / S - 0.5) * 2;   // −1..1 → ±tan(outer) in h units
    const rr = Math.hypot(u, v) * T, th = Math.atan(rr);
    const cone = th >= outer ? 0 : th <= inner ? 1 : (() => { const t = (Math.cos(th) - Math.cos(outer)) / (Math.cos(inner) - Math.cos(outer)); return t * t * (3 - 2 * t); })();
    const val = cone * Math.pow(Math.cos(th), 3);
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * val); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}
// Wall scallop of a downlight at distance d from the wall, in units of d: u ∈ [−3,3] (horizontal), t ∈ [0,6] (depth below the
// ceiling). Lit where the cone reaches the wall; irradiance ∝ I(θ)·cos(incidence)/r². Canvas top = t 0 (ceiling).
export const SCALLOP_U = 3, SCALLOP_T = 6;
function scallopTexture(LG) {
  const W = 96, H = 192, cv = canvas(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H);
  const outer = LG.beam, inner = LG.beam * (1 - LG.penumbra);
  let peak = 0; const buf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = ((x + 0.5) / W - 0.5) * 2 * SCALLOP_U, t = ((y + 0.5) / H) * SCALLOP_T;
    const r2 = 1 + u * u + t * t, ct = t / Math.sqrt(r2), th = Math.acos(ct);
    const cone = th >= outer ? 0 : th <= inner ? 1 : (() => { const k = (Math.cos(th) - Math.cos(outer)) / (Math.cos(inner) - Math.cos(outer)); return k * k * (3 - 2 * k); })();
    const val = cone / Math.pow(r2, 1.5);
    buf[y * W + x] = val; peak = Math.max(peak, val);
  }
  for (let i = 0; i < W * H; i++) { const v = Math.round(255 * Math.min(1, buf[i] / peak)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.userData = { peakAtUnit: peak }; return t;
}
// LED sky panel: saturated clear-blue gradient + very faint high cirrus
function skyPanelTexture(SK) {
  const W = 256, H = 512, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(808);
  const grd = g.createLinearGradient(0, 0, W * 0.3, H);
  grd.addColorStop(0, SK.top); grd.addColorStop(1, SK.bottom);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H, rw = 40 + r() * 120, rh = 4 + r() * 10;
    g.save(); g.translate(x, y); g.rotate(-0.35 + (r() - 0.5) * 0.3); g.scale(1, rh / rw);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, rw);
    cg.addColorStop(0, `rgba(255,255,255,${SK.clouds * (0.5 + r())})`); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.fillRect(-rw, -rw, rw * 2, rw * 2); g.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Grazing light baked from the feature-wall height map: light from both ends, fading toward the middle, picking out relief.
// srcCanvas = wabi-sabi texture (greyscale height). Width wM metres. Returns a texture for the M.graze blend (dst×(1+src)).
export function makeGrazeTexture(srcCanvas, wM, cfg) {
  const k = Math.min(1, 1024 / srcCanvas.width);
  const W = Math.max(64, Math.round(srcCanvas.width * k)), H = Math.max(64, Math.round(srcCanvas.height * k));
  const cv = canvas(W, H), g = cv.getContext('2d');
  g.drawImage(srcCanvas, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H), out = g.createImageData(W, H), pm = W / wM;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const hl = src.data[(y * W + Math.max(0, x - 2)) * 4], hr = src.data[(y * W + Math.min(W - 1, x + 2)) * 4];
    const d = (hr - hl) / 255;                                   // + = surface rising to the right → faces the left light
    const uL = x / pm, uR = (W - 1 - x) / pm;
    const fL = Math.exp(-uL / cfg.reach), fR = Math.exp(-uR / cfg.reach);
    const v = Math.max(0, fL * (1 + cfg.relief * d) + fR * (1 - cfg.relief * d));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = Math.round(255 * Math.min(1, v * 0.8)); out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ── Wabi-sabi limewash wallpaper: ONE non-repeating texture for a whole surface (w × h metres) ──
// near-white greyscale mottle (multiplied by STYLE.featureWall.color); also used as the bump map.
function wabiSabiTexture(cfg, wM, hM, mobile) {
  const ppm = mobile ? cfg.pxPerMMobile : cfg.pxPerM;
  const k = Math.min(1, 2048 / (Math.max(wM, hM) * ppm));
  const W = Math.round(wM * ppm * k), H = Math.round(hM * ppm * k), pm = ppm * k;   // px per metre
  const cv = canvas(W, H), g = cv.getContext('2d'), r = rng(4242);
  const grey = (v, a) => `rgba(${v},${v},${v},${a})`;
  g.fillStyle = grey(238, 1); g.fillRect(0, 0, W, H);
  // 1) large soft clouds (limewash mottling) — low contrast, several scales
  for (const [n, r0, r1] of [[40, 0.5, 1.2], [140, 0.18, 0.5], [320, 0.05, 0.18]]) {
    for (let i = 0; i < n * wM * hM / 4; i++) {
      const x = r() * W, y = r() * H, rad = (r0 + r() * (r1 - r0)) * pm;
      const v = Math.round(238 + (r() - 0.55) * 255 * cfg.mottle * 2.2);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, grey(v, 0.55)); grd.addColorStop(0.6, grey(v, 0.22)); grd.addColorStop(1, grey(v, 0));
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // 2) trowel strokes: short sweeping arcs with a lighter body and a faint darker ridge on one edge
  const strokes = Math.round(260 * wM * hM);
  g.lineCap = 'round';
  for (let i = 0; i < strokes; i++) {
    const x = r() * W, y = r() * H, len = (0.12 + r() * 0.38) * pm, wid = (0.025 + r() * 0.08) * pm;
    const ang = (r() - 0.5) * Math.PI * 0.9 + (r() < 0.5 ? 0 : Math.PI), bend = (r() - 0.5) * 0.9;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const ex = x + dx * len, ey = y + dy * len, cx = x + dx * len / 2 + nx * bend * len * 0.5, cy = y + dy * len / 2 + ny * bend * len * 0.5;
    const light = r() < 0.6;
    g.strokeStyle = grey(light ? 255 : 214, cfg.strokes * (0.45 + r() * 0.9));
    g.lineWidth = wid;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    g.strokeStyle = grey(200, cfg.strokes * 0.8 * r()); g.lineWidth = Math.max(0.8, wid * 0.07);
    const o = wid * 0.5;
    g.beginPath(); g.moveTo(x + nx * o, y + ny * o); g.quadraticCurveTo(cx + nx * o, cy + ny * o, ex + nx * o, ey + ny * o); g.stroke();
  }
  // 3) fine grain / pores
  noiseDots(g, W, H, r, Math.round(W * H / 22), 0.05, grey(196, 1), grey(255, 1));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = ANISO;
  return t;
}

// soft wash gradient for the LED washer glow plane: alpha 1 at the top → 0, faded at both ends
function washTexture() {
  const W = 128, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / (H - 1);                                   // canvas top = wall top (uv flipY)
    const ends = Math.min(1, Math.min(x, W - 1 - x) / (W * 0.07));
    const a = Math.pow(v, 2.2) * (0.25 + 0.75 * Math.pow(v, 6)) * (0.35 + 0.65 * ends);
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.min(1, a * 1.3));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Multiplicative "light" materials (result = dst × (1 + src)) must output src raw: strip the sRGB output transform,
// otherwise small factors get inflated (0.03 → 0.17) and the light spreads over whole surfaces.
export function rawOutput(mat) {
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <colorspace_fragment>', ''); };
  mat.customProgramCacheKey = () => 'rawOutput';
  return mat;
}

// ── Material factory ───────────────────────────────────────────────────────
export function makeMaterials(STYLE, renderer, mobile) {
  ANISO = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};

  // floors
  M.floor = {};
  for (const [k, cfg] of Object.entries(STYLE.floors)) {
    let map;
    if (cfg.kind === 'oak') map = oakTexture(cfg, mobile);
    else if (cfg.kind === 'deck') map = deckTexture(cfg, mobile);
    else if (cfg.kind === 'concrete') map = concreteTexture(cfg, mobile);
    else map = tileTexture(cfg, mobile, 3 + k.length, cfg.tileW >= 0.6 ? 4 : 6, cfg.tileH >= 0.6 ? 4 : 6);
    M.floor[k] = std({ map, roughness: cfg.roughness, metalness: 0, envMapIntensity: 0.9 });
    M.floor[k].name = 'floor_' + k;
  }

  const plaster = plasterTexture(STYLE.wall.plasterNoise);
  M.wall = std({ color: STYLE.wall.color, map: plaster, roughness: STYLE.wall.roughness, envMapIntensity: 0.6 });
  M.facade = std({ color: STYLE.facade.color, map: plaster, roughness: STYLE.facade.roughness, envMapIntensity: 0.6 });
  M.wallCap = std({ color: STYLE.wallCap.color, roughness: STYLE.wallCap.roughness });
  M.ceiling = std({ color: STYLE.ceiling.color, map: plaster, roughness: STYLE.ceiling.roughness, envMapIntensity: 0.5 });
  const bw = STYLE.bathWall;
  M.bathWall = std({
    map: tileTexture({ kind: 'tile', color: bw.color, color2: shade(bw.color, -0.03), grout: bw.grout, tileW: bw.tileW, tileH: bw.tileH, vein: 0.02 }, mobile, 21, 4, 8),
    roughness: bw.roughness, envMapIntensity: 0.9,
  });
  M.skirting = std({ color: STYLE.skirting.color, roughness: STYLE.skirting.roughness });
  M.sill = std({ color: STYLE.sill.color, roughness: STYLE.sill.roughness });
  M.slab = std({ color: STYLE.slab.color, roughness: STYLE.slab.roughness });

  M.glass = std({
    color: STYLE.glass.color, transparent: true, opacity: STYLE.glass.opacity, roughness: STYLE.glass.roughness,
    metalness: STYLE.glass.metalness, envMapIntensity: STYLE.glass.envIntensity, depthWrite: false,
  });
  M.frame = std({ color: STYLE.frame.color, roughness: STYLE.frame.roughness, metalness: STYLE.frame.metalness });
  M.railGlass = std({
    color: STYLE.railing.glassColor, transparent: true, opacity: STYLE.railing.glassOpacity, roughness: 0.05,
    envMapIntensity: 1.2, depthWrite: false,
  });
  M.railMetal = std({ color: STYLE.railing.metal, roughness: 0.4, metalness: 0.7 });
  M.door = std({ color: '#ffffff', map: veneerTexture(STYLE.door, 31), roughness: STYLE.door.roughness });
  M.mainDoor = std({ color: '#ffffff', map: veneerTexture(STYLE.mainDoor, 37), roughness: STYLE.mainDoor.roughness });
  M.doorFrame = std({ color: STYLE.doorFrame.color, roughness: STYLE.doorFrame.roughness });
  M.handle = std({ color: STYLE.handle.color, roughness: STYLE.handle.roughness, metalness: STYLE.handle.metalness });
  M.slideOpaque = std({ color: STYLE.slideOpaque.color, roughness: STYLE.slideOpaque.roughness });

  // recessed downlights: dark anti-glare baffle + small aperture (vertex colour = CCT, material colour = on/off level)
  const LG = STYLE.lighting;
  M.baffle = new THREE.MeshBasicMaterial({ color: LG.baffle, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  M.aperture = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // fake light (pools / scallops): result = dst × (1 + src) → brightens the lit surface in proportion to its albedo
  M.lightDecal = new THREE.MeshBasicMaterial({
    map: poolTexture(LG), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  M.scallopDecal = M.lightDecal.clone(); M.scallopDecal.map = scallopTexture(LG);
  rawOutput(M.lightDecal); rawOutput(M.scallopDecal);
  M.graze = new THREE.MeshBasicMaterial({     // feature-wall side-slot grazing light (map baked per wall by build.js)
    color: '#000000', transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  M.slotStrip = new THREE.MeshBasicMaterial({ color: STYLE.sideSlot.stripOff, toneMapped: false });
  // skylights
  const SK = STYLE.skylight;
  M.skyPanel = new THREE.MeshBasicMaterial({ map: skyPanelTexture(SK), toneMapped: false });
  M.skyPanel.color.setScalar(SK.panelGain);
  M.skyReveal = std({ color: SK.reveal, roughness: 0.9, emissive: '#dfeaff', emissiveIntensity: 0.55, envMapIntensity: 0.3 });
  M.skyRim = new THREE.MeshBasicMaterial({ color: '#f4f8ff', toneMapped: false });
  // helper-room bifold: white aluminium frame, frosted glass upper, louvres lower
  M.alWhite = std({ color: '#f1f0ec', roughness: 0.42, metalness: 0.15 });
  M.frosted = std({ color: '#f6f4f0', roughness: 0.55, transparent: true, opacity: 0.86, emissive: '#ffffff', emissiveIntensity: 0.06, envMapIntensity: 0.5 });
  M.ao = new THREE.MeshBasicMaterial({
    color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  // feature wall (texture made per surface size by build.js)
  const FWc = STYLE.featureWall;
  M.makeFeatureWall = (wM, hM) => {
    const map = wabiSabiTexture(FWc, wM, hM, mobile);
    const m = std({ color: FWc.color, map, bumpMap: map, bumpScale: FWc.bump, roughness: FWc.roughness, envMapIntensity: 0.35 });
    m.userData.canvas = map.image; return m;
  };
  M.featureEdge = std({ color: FWc.edge, map: veneerTexture({ color: '#ffffff', grain: '#d8cfc4' }, 41), roughness: 0.7 });
  M.gap = std({ color: FWc.gap, roughness: 1, envMapIntensity: 0 });
  M.washerSlot = new THREE.MeshBasicMaterial({ color: STYLE.washer.slotOff, side: THREE.DoubleSide });
  M.washerGlow = new THREE.MeshBasicMaterial({
    map: washTexture(), color: STYLE.washer.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const PT = STYLE.partition;
  M.frameBlack = std({ color: PT.frame, roughness: PT.roughness, metalness: PT.metalness });
  M.glassClear = std({ color: PT.glassColor, transparent: true, opacity: PT.glassOpacity, roughness: 0.03, metalness: 0,
    envMapIntensity: PT.envIntensity, depthWrite: false });
  M.placeholder = std({ color: '#d5d3cf', roughness: 0.8 });
  M.shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  return M;
}
