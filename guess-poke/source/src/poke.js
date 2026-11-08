// Roster + runtime image loading + in-browser pixelation (images are fetched at runtime, not bundled).
// color: PokeAPI species colour; group: look-alike group (never offered together early on).
export const ROSTER = [
  { id: 25, name: '皮卡丘', color: 'yellow', group: 'mouse', fav: 1 },
  { id: 1, name: '妙蛙種子', color: 'green', group: 'bulba', fav: 1 },
  { id: 4, name: '小火龍', color: 'red', group: 'char', fav: 1 },
  { id: 7, name: '傑尼龜', color: 'blue', group: 'squirt', fav: 1 },
  { id: 393, name: '波加曼', color: 'blue', fav: 1 },
  { id: 235, name: '圖圖犬', color: 'white', fav: 1 },
  { id: 702, name: '咚咚鼠', color: 'yellow', group: 'mouse', fav: 1 },
  { id: 133, name: '伊布', color: 'brown', group: 'eevee' },
  { id: 700, name: '仙子伊布', color: 'pink', group: 'eevee' },
  { id: 39, name: '胖丁', color: 'pink', group: 'jiggly' },
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
  { id: 3, name: '妙蛙花', color: 'green', group: 'bulba' },
  { id: 6, name: '噴火龍', color: 'red', group: 'char' },
  { id: 9, name: '水箭龜', color: 'blue', group: 'squirt' },
  { id: 26, name: '雷丘', color: 'yellow', group: 'mouse' },
  { id: 35, name: '皮皮', color: 'pink', group: 'clefairy' },
  { id: 43, name: '走路草', color: 'blue' },
  { id: 50, name: '地鼠', color: 'brown' },
  { id: 58, name: '卡蒂狗', color: 'brown' },
  { id: 60, name: '蚊香蝌蚪', color: 'blue' },
  { id: 63, name: '凱西', color: 'brown' },
  { id: 74, name: '小拳石', color: 'brown' },
  { id: 77, name: '小火馬', color: 'yellow' },
  { id: 81, name: '小磁怪', color: 'gray' },
  { id: 98, name: '大鉗蟹', color: 'red' },
  { id: 100, name: '霹靂電球', color: 'red' },
  { id: 113, name: '吉利蛋', color: 'pink' },
  { id: 116, name: '墨海馬', color: 'blue' },
  { id: 118, name: '角金魚', color: 'red' },
  { id: 120, name: '海星星', color: 'brown' },
  { id: 131, name: '拉普拉斯', color: 'blue' },
  { id: 134, name: '水伊布', color: 'blue', group: 'eevee' },
  { id: 135, name: '雷伊布', color: 'yellow', group: 'eevee' },
  { id: 136, name: '火伊布', color: 'red', group: 'eevee' },
  { id: 137, name: '多邊獸', color: 'pink' },
  { id: 138, name: '菊石獸', color: 'blue' },
  { id: 147, name: '迷你龍', color: 'blue', group: 'dratini' },
  { id: 149, name: '快龍', color: 'brown', group: 'dratini' },
  { id: 16, name: '波波', color: 'brown' },
  { id: 19, name: '小拉達', color: 'purple' },
  { id: 27, name: '穿山鼠', color: 'yellow' },
  { id: 46, name: '派拉斯', color: 'red' },
  { id: 69, name: '喇叭芽', color: 'green' },
  { id: 86, name: '小海獅', color: 'white' },
  { id: 104, name: '卡拉卡拉', color: 'brown' },
  { id: 128, name: '肯泰羅', color: 'brown' },
  { id: 94, name: '耿鬼', color: 'purple' },
  { id: 161, name: '尾立', color: 'brown' },
  { id: 163, name: '咕咕', color: 'brown' },
  { id: 170, name: '燈籠魚', color: 'blue' },
  { id: 173, name: '皮寶寶', color: 'pink', group: 'clefairy' },
  { id: 174, name: '寶寶丁', color: 'pink', group: 'jiggly' },
  { id: 179, name: '咩利羊', color: 'white' },
  { id: 187, name: '毽子草', color: 'pink' },
  { id: 190, name: '長尾怪手', color: 'purple' },
  { id: 196, name: '太陽伊布', color: 'purple', group: 'eevee' },
  { id: 197, name: '月亮伊布', color: 'black', group: 'eevee' },
  { id: 202, name: '果然翁', color: 'blue' },
  { id: 216, name: '熊寶寶', color: 'brown' },
  { id: 225, name: '信使鳥', color: 'red' },
  { id: 251, name: '時拉比', color: 'green' },
  { id: 252, name: '木守宮', color: 'green' },
  { id: 255, name: '火稚雞', color: 'red' },
  { id: 258, name: '水躍魚', color: 'blue' },
  { id: 263, name: '蛇紋熊', color: 'brown' },
  { id: 280, name: '拉魯拉絲', color: 'white' },
  { id: 300, name: '向尾喵', color: 'pink' },
  { id: 311, name: '正電拍拍', color: 'yellow', group: 'mouse' },
  { id: 312, name: '負電拍拍', color: 'yellow', group: 'mouse' },
  { id: 333, name: '青綿鳥', color: 'blue' },
  { id: 351, name: '飄浮泡泡', color: 'gray' },
  { id: 363, name: '海豹球', color: 'blue' },
  { id: 385, name: '基拉祈', color: 'yellow' },
  { id: 399, name: '大牙狸', color: 'brown' },
  { id: 403, name: '小貓怪', color: 'blue' },
  { id: 418, name: '泳圈鼬', color: 'brown' },
  { id: 425, name: '飄飄球', color: 'purple' },
  { id: 433, name: '鈴鐺響', color: 'yellow' },
  { id: 443, name: '圓陸鯊', color: 'blue' },
  { id: 447, name: '利歐路', color: 'blue', group: 'riolu' },
  { id: 448, name: '路卡利歐', color: 'blue', group: 'riolu' },
  { id: 470, name: '葉伊布', color: 'green', group: 'eevee' },
  { id: 471, name: '冰伊布', color: 'blue', group: 'eevee' },
  { id: 492, name: '謝米', color: 'green' },
  { id: 495, name: '藤藤蛇', color: 'green' },
  { id: 498, name: '暖暖豬', color: 'red' },
  { id: 501, name: '水水獺', color: 'blue' },
  { id: 509, name: '扒手貓', color: 'purple' },
  { id: 517, name: '食夢夢', color: 'pink' },
  { id: 531, name: '差不多娃娃', color: 'pink' },
  { id: 572, name: '泡沫栗鼠', color: 'gray' },
  { id: 587, name: '電飛鼠', color: 'white', group: 'mouse' },
  { id: 661, name: '小箭雀', color: 'red' },
  { id: 669, name: '花蓓蓓', color: 'white' },
  { id: 674, name: '頑皮熊貓', color: 'white' },
  { id: 677, name: '妙喵', color: 'gray' },
  { id: 725, name: '火斑喵', color: 'red' },
  { id: 728, name: '球球海獅', color: 'blue' },
  { id: 731, name: '小篤兒', color: 'black' },
  { id: 742, name: '萌虻', color: 'yellow' },
  { id: 744, name: '岩狗狗', color: 'brown' },
  { id: 755, name: '睡睡菇', color: 'purple' },
  { id: 777, name: '托戈德瑪爾', color: 'gray', group: 'mouse' },
  { id: 778, name: '謎擬Ｑ', color: 'yellow' },
  { id: 789, name: '科斯莫古', color: 'blue' },
  { id: 819, name: '貪心栗鼠', color: 'brown' },
  { id: 831, name: '毛辮羊', color: 'white' },
  { id: 845, name: '古月鳥', color: 'blue' },
  { id: 848, name: '毒電嬰', color: 'purple' },
  { id: 872, name: '雪吞蟲', color: 'white' },
  { id: 877, name: '莫魯貝可', color: 'yellow', group: 'mouse' },
  { id: 915, name: '愛吃豚', color: 'gray' },
  { id: 926, name: '狗仔包', color: 'yellow' },
  { id: 957, name: '小鍛匠', color: 'pink' },
  { id: 940, name: '電海燕', color: 'black' },
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
