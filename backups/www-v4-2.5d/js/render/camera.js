/* NEON BRAWL — Camera follow / zoom, plus the cinematic layer (shake, smash zoom + roll) shared by both renderers. */
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
  const vw = VIEW.LW / z, vh = VIEW.LH / z;                                                   // the full-bleed view (wider screens see more)
  cx = vw < BZ.r - BZ.l ? clamp(cx, BZ.l + vw / 2, BZ.r - vw / 2) : (BZ.l + BZ.r) / 2;
  cy = vh < BZ.b - BZ.t ? clamp(cy, BZ.t + vh / 2, BZ.b - vh / 2) : (BZ.t + BZ.b) / 2;
  c.x += (cx - c.x) * 0.09; c.y += (cy - c.y) * 0.09; c.z += (z - c.z) * 0.07;
  CAMFX.k *= 0.9; if (CAMFX.k < 0.002) CAMFX.k = 0;                                          // the smash punch-in eases back out
}

/* Cinematic punch-in on big smash hits: the camera lunges toward the impact, zooms in and rolls slightly. */
const CAMFX = { k: 0, x: 640, y: 360, roll: 0 };
function smashCam(x, y, dir, power) {
  const p = clamp(power, 0, 1);
  if (p < CAMFX.k * 0.6) return;                                                              // a bigger punch is already playing
  CAMFX.k = Math.max(CAMFX.k, p); CAMFX.x = x; CAMFX.y = y; CAMFX.roll = (dir || 1) * 0.055 * p;
}

GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'hit' && d.m && d.m.heavy && d.kb >= 13) smashCam(d.x, d.y, d.dir || 1, (d.kb - 10) / 14);   // dramatic smash connect
  else if (type === 'ko') smashCam(d.x, d.y, d.x < 640 ? -1 : 1, 0.55);                                  // the KO blast
});

/* The camera actually used to draw this frame: follow cam + smash punch-in + directional shake. Both the canvas
 * renderer (worldTransform) and the WebGL renderer read this, so 2D overlay effects stay glued to the 3D world. */
function viewCam() {
  const c = G.cam, k = SET.flash ? CAMFX.k : CAMFX.k * 0.5, sk = G.shake * SET.shake, sa = G.shakeAng || 0;
  const along = sk ? rand(-1, 1) * sk : 0, across = sk ? rand(-1, 1) * sk * 0.45 : 0;        // multi-axis shake, biased along the last launch
  const shx = Math.cos(sa) * along - Math.sin(sa) * across, shy = Math.sin(sa) * along + Math.cos(sa) * across;
  const e = k * k * (3 - 2 * k);
  return { x: c.x + (CAMFX.x - c.x) * 0.32 * e - shx, y: c.y + (CAMFX.y - c.y) * 0.32 * e - shy, z: c.z * (1 + 0.32 * e), roll: CAMFX.roll * e, k: e };
}
