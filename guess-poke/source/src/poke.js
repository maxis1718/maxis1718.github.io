// Roster + runtime image loading + in-browser pixelation (images are fetched at runtime, not bundled).
// color: PokeAPI species colour; group: look-alike group (never offered together early on).
export const ROSTER = [
  { id: 25, name: '皮卡丘', color: 'yellow', group: 'mouse', fav: 3 },
  { id: 1, name: '妙蛙種子', color: 'green', fav: 3 },
  { id: 4, name: '小火龍', color: 'red', fav: 3 },
  { id: 7, name: '傑尼龜', color: 'blue', fav: 3 },
  { id: 393, name: '波加曼', color: 'blue', fav: 3 },
  { id: 235, name: '圖圖犬', color: 'white', fav: 3 },
  { id: 702, name: '咚咚鼠', color: 'yellow', group: 'mouse', fav: 3 },
  { id: 133, name: '伊布', color: 'brown', group: 'eevee' },
  { id: 700, name: '仙子伊布', color: 'pink', group: 'eevee' },
  { id: 39, name: '胖丁', color: 'pink' },
  { id: 54, name: '可達鴨', color: 'yellow' },
  { id: 143, name: '卡比獸', color: 'black' },
  { id: 172, name: '皮丘', color: 'yellow', group: 'mouse' },
  { id: 52, name: '喵喵', color: 'yellow' },
  { id: 132, name: '百變怪', color: 'purple' },
  { id: 79, name: '呆呆獸', color: 'pink' },
  { id: 129, name: '鯉魚王', color: 'red' },
  { id: 151, name: '夢幻', color: 'pink' },
  { id: 722, name: '木木梟', color: 'brown' },
  { id: 906, name: '新葉喵', color: 'green' },
  { id: 909, name: '呆火鱷', color: 'red' },
  { id: 912, name: '潤水鴨', color: 'white' },
  { id: 417, name: '帕奇利茲', color: 'white', group: 'mouse' },
  { id: 175, name: '波克比', color: 'white' },
  { id: 427, name: '捲捲耳', color: 'brown' },
  { id: 37, name: '六尾', color: 'brown' },
  { id: 194, name: '烏波', color: 'blue' },
  { id: 183, name: '瑪力露', color: 'blue' },
  { id: 921, name: '布撥', color: 'yellow', group: 'mouse' },
  { id: 158, name: '小鋸鱷', color: 'blue' },
  { id: 155, name: '火球鼠', color: 'yellow' },
  { id: 152, name: '菊草葉', color: 'green' },
  { id: 650, name: '哈力栗', color: 'green' },
  { id: 653, name: '火狐狸', color: 'red' },
  { id: 656, name: '呱呱泡蛙', color: 'blue' },
  { id: 810, name: '敲音猴', color: 'green' },
  { id: 813, name: '炎兔兒', color: 'white' },
  { id: 816, name: '淚眼蜥', color: 'blue' },
  { id: 390, name: '小火焰猴', color: 'brown' },
  { id: 387, name: '草苗龜', color: 'green' },
];
export const BY_ID = Object.fromEntries(ROSTER.map((p) => [p.id, p]));
// The order of the very first rounds (her favourites).
export const OPENING = [25, 4, 7, 1, 393, 702, 235];

const SRC = [
  (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  (id) => `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${id}.png`,
];

const imgs = new Map(); // id -> Promise<HTMLImageElement|null>
const failed = new Set();

function loadOne(url) {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    let done = false;
    const fin = (v) => { if (!done) { done = true; clearTimeout(to); res(v); } };
    const to = setTimeout(() => fin(null), 15000);
    im.onload = () => fin(im);
    im.onerror = () => fin(null);
    im.src = url;
  });
}

export function loadImage(id) {
  if (!imgs.has(id)) {
    imgs.set(id, (async () => {
      for (const s of SRC) {
        const im = await loadOne(s(id));
        if (im && im.naturalWidth) return im;
      }
      failed.add(id);
      return null;
    })());
  }
  return imgs.get(id);
}
export const isFailed = (id) => failed.has(id);
export function resetFailed() { for (const id of failed) imgs.delete(id); failed.clear(); }

// ---------- pixelation ----------
// Returns {img: canvas (colour, with 1px ink outline), sil: canvas (solid silhouette), w, h}
const sprites = new Map(); // `${id}:${N}` -> sprite
const trims = new Map(); // id -> trimmed full-res canvas

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function trimmed(id, im) {
  if (trims.has(id)) return trims.get(id);
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const t = canvas(x1 - x0 + 1, y1 - y0 + 1);
  t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
  trims.set(id, t);
  return t;
}

// High quality downscale by repeated halving, then hard alpha threshold + light posterize + ink outline.
export function pixelSprite(id, N) {
  const key = id + ':' + N;
  if (sprites.has(key)) return sprites.get(key);
  return null;
}

export async function prepare(id, sizes) {
  const im = await loadImage(id);
  if (!im) return false;
  for (const N of sizes) {
    const key = id + ':' + N;
    if (!sprites.has(key)) sprites.set(key, build(id, im, N));
  }
  return true;
}

function build(id, im, N) {
  const t = trimmed(id, im);
  const inner = N - 2; // leave room for 1px outline on each side
  const s = inner / Math.max(t.width, t.height);
  const tw = Math.max(1, Math.round(t.width * s)), th = Math.max(1, Math.round(t.height * s));
  let src = t, sw = t.width, sh = t.height;
  while (sw / 2 > tw * 1.5) {
    const nw = Math.round(sw / 2), nh = Math.round(sh / 2);
    const c = canvas(nw, nh), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = c; sw = nw; sh = nh;
  }
  const w = tw + 2, h = th + 2;
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, sw, sh, 1, 1, tw, th);
  const id2 = g.getImageData(0, 0, w, h), d = id2.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3];
    if (a > 100) {
      solid[i] = 1;
      // un-premultiply edge pixels & posterize slightly (keeps a clean pixel-art palette)
      const k = 255 / a;
      for (let ch = 0; ch < 3; ch++) {
        let v = Math.min(255, d[i * 4 + ch] * (a < 250 ? Math.min(k, 1.25) : 1));
        v = Math.round(v / 12) * 12;
        d[i * 4 + ch] = Math.min(255, v);
      }
      d[i * 4 + 3] = 255;
    } else {
      d[i * 4 + 3] = 0;
    }
  }
  // 1px outline: transparent pixels touching a solid one (4-neighbour) become dark ink
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) out[i] = 1;
  }
  for (let i = 0; i < w * h; i++) if (out[i]) { d[i * 4] = 24; d[i * 4 + 1] = 22; d[i * 4 + 2] = 44; d[i * 4 + 3] = 255; }
  g.putImageData(id2, 0, 0);
  // silhouette
  const sc = canvas(w, h), sg = sc.getContext('2d');
  const sd = sg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (solid[i] || out[i]) { sd.data[i * 4] = 18; sd.data[i * 4 + 1] = 18; sd.data[i * 4 + 2] = 38; sd.data[i * 4 + 3] = 255; }
  }
  sg.putImageData(sd, 0, 0);
  // white rim around the silhouette (used for glow when the right card comes close)
  const rc = canvas(w + 2, h + 2), rg = rc.getContext('2d');
  const rd = rg.createImageData(w + 2, h + 2);
  const S = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (solid[y * w + x] || out[y * w + x]);
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    const sx = x - 1, sy = y - 1;
    if (S(sx, sy)) continue;
    if (S(sx - 1, sy) || S(sx + 1, sy) || S(sx, sy - 1) || S(sx, sy + 1)) {
      const i = (y * (w + 2) + x) * 4; rd.data[i] = 255; rd.data[i + 1] = 250; rd.data[i + 2] = 200; rd.data[i + 3] = 255;
    }
  }
  rg.putImageData(rd, 0, 0);
  return { img: c, sil: sc, rim: rc, w, h };
}
