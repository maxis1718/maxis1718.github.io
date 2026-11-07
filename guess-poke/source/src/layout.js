// Screen layout in buffer pixels (portrait column centred on wide screens).
export function computeLayout(W, H) {
  const CW = Math.min(W, Math.round(H * 0.62));
  const x0 = Math.floor((W - CW) / 2);
  const gap = Math.max(6, Math.round(CW * 0.03));
  const cardW = Math.floor((CW - gap * 4) / 3);
  const cardH = Math.round(cardW * 1.16);
  const bottom = Math.max(12, Math.round(H * 0.04));
  const cardsY = H - bottom - cardH;
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
  for (let i = 0; i < 3; i++) {
    const x = x0 + gap + i * (cardW + gap);
    cards.push({ x, y: cardsY, w: cardW, h: cardH, cx: x + cardW / 2, cy: cardsY + cardH / 2 });
  }
  const inner = Math.min(frameW, frameH) - 28;
  const target = inner * 0.9;
  const bigK = target >= 130 ? 2 : 1;
  const Nb = Math.floor(target / bigK);
  const Ns = cardW - 12;
  return {
    W, H, CW, x0, gap, cards, cardW, cardH, cardsY,
    frame: { x: frameX, y: frameY, w: frameW, h: frameH, cx: frameX + frameW / 2, cy: frameY + frameH / 2 },
    banner: { y: bannerY, h: bannerH, cx: x0 + CW / 2 },
    top: { y: 6, h: 22 },
    mute: { x: x0 + CW - 30, y: 4, w: 26, h: 26 },
    bigK, Nb, Ns,
  };
}
