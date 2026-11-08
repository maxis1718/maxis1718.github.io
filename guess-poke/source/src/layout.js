// Screen layout in buffer pixels (portrait column centred on wide screens).
// n = number of answer cards (3, 4 or 5). 5 cards use two rows (3 + 2) so they stay big enough for small fingers.
export function computeLayout(W, H, n = 3) {
  const CW = Math.min(W, Math.round(H * 0.62));
  const x0 = Math.floor((W - CW) / 2);
  const gap3 = Math.max(6, Math.round(CW * 0.03));
  const w3 = Math.floor((CW - gap3 * 4) / 3);
  let cols = n === 4 ? 4 : 3, rows = n >= 5 ? 2 : 1;
  const gap = n === 4 ? Math.max(5, Math.round(CW * 0.025)) : gap3;
  let cardW = n === 4 ? Math.floor((CW - gap * 5) / 4) : n >= 5 ? Math.round(w3 * 0.84) : w3;
  const cardH = Math.round(cardW * 1.16);
  const rowGap = 8;
  const bottom = Math.max(12, Math.round(H * 0.04));
  const cardsY = H - bottom - cardH * rows - rowGap * (rows - 1);
  const topBar = 30;
  const bannerH = 34;
  let frameW = CW - Math.max(14, Math.round(CW * 0.06));
  const avail = cardsY - 16 - bannerH - topBar - 6;
  let frameH = Math.min(Math.round(frameW * 1.1), avail);
  if (frameH < frameW * 0.9) frameW = Math.round(frameH / 0.9);
  frameW -= frameW % 2; frameH -= frameH % 2;
  const slack = Math.max(0, avail - frameH);
  const frameX = x0 + Math.round((CW - frameW) / 2);
  const frameY = topBar + 4 + Math.round(slack * 0.3);
  const fb = frameY + frameH;
  const bannerY = fb + Math.round((cardsY - fb - bannerH) * 0.42);
  const cards = [];
  const rowCounts = n === 5 ? [3, 2] : n === 6 ? [3, 3] : [n];
  let yy = cardsY;
  for (const cnt of rowCounts) {
    const g = n >= 5 ? Math.round((CW - cnt * cardW) / (cnt + 1)) : gap;
    const rowW = cnt * cardW + (cnt - 1) * g;
    const sx = x0 + Math.round((CW - rowW) / 2);
    for (let i = 0; i < cnt; i++) {
      const x = sx + i * (cardW + g);
      cards.push({ x, y: yy, w: cardW, h: cardH, cx: x + cardW / 2, cy: yy + cardH / 2 });
    }
    yy += cardH + rowGap;
  }
  const inner = Math.min(frameW, frameH) - 28;
  const target = inner * 0.9;
  const bigK = target >= 130 ? 2 : 1;
  const Nb = Math.floor(target / bigK);
  const Ns = cardW - (cardW < 60 ? 8 : 12);
  const Np = Math.min(w3 - 12, Math.floor((CW - 8) / 7) + 4);
  return {
    n, W, H, CW, x0, gap, cards, cardW, cardH, cardsY,
    frame: { x: frameX, y: frameY, w: frameW, h: frameH, cx: frameX + frameW / 2, cy: frameY + frameH / 2 },
    banner: { y: bannerY, h: bannerH, cx: x0 + CW / 2 },
    top: { y: 6, h: 22 },
    mute: { x: x0 + CW - 30, y: 4, w: 26, h: 26 },
    home: { x: x0 + 4, y: 4, w: 26, h: 26 },
    bigK, Nb, Ns, Np,
  };
}
