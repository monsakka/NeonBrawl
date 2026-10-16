/* NEON BRAWL — Camera follow / zoom. */
'use strict';

/* ============================== CAMERA ============================== */
function updateCamera() {
  const c = G.cam;
  let list = fighters.filter(f => f.state !== 'dead');
  if (!list.length) list = fighters;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const f of list) {
    const px = clamp(f.x, BZ.l, BZ.r), py = clamp(f.y - 32, BZ.t, BZ.b);
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  minX = Math.min(minX, STAGE.x + 120); maxX = Math.max(maxX, STAGE.x + STAGE.w - 120);     // keep the stage in frame
  minY = Math.min(minY, STAGE.y - 170); maxY = Math.max(maxY, STAGE.y + 10);
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 * 0.7 + (STAGE.y - 140) * 0.3;
  const z = clamp(Math.min(W / (maxX - minX + 560), H / (maxY - minY + 380)), 0.74, 1.08);
  const vw = W / z, vh = H / z;
  cx = vw < BZ.r - BZ.l ? clamp(cx, BZ.l + vw / 2, BZ.r - vw / 2) : (BZ.l + BZ.r) / 2;
  cy = vh < BZ.b - BZ.t ? clamp(cy, BZ.t + vh / 2, BZ.b - vh / 2) : (BZ.t + BZ.b) / 2;
  c.x += (cx - c.x) * 0.09; c.y += (cy - c.y) * 0.09; c.z += (z - c.z) * 0.07;
}
