/* NEON BRAWL — Camera follow / zoom, plus the cinematic layer (shake, smash zoom + roll) shared by both renderers. */
'use strict';

/* ============================== CAMERA ============================== */
// fractions of the screen height covered by the HUD at the bottom (b) and top (t) — measured from the DOM by render/hud.js
const HUD_SAFE = { b: 0, t: 0 };
function updateCamera() {
  const c = G.cam;
  let list = fighters.filter(f => f.state !== 'dead');
  if (!list.length) list = fighters;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const f of list) {
    const s = f.scale || 1, px = clamp(f.x, BZ.l, BZ.r), py = clamp(f.y - 32 * s, BZ.t, BZ.b);   // (a giant is framed by its middle)
    if (s > 1) { minY = Math.min(minY, clamp(f.y - BODY_H * s, BZ.t, BZ.b)); }
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  if (G.camExtra) for (const p of G.camExtra) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }   // (Break the Targets: keep the targets in frame)
  minX = Math.min(minX, STAGE.x + 120); maxX = Math.max(maxX, STAGE.x + STAGE.w - 120);     // keep the stage in frame
  minY = Math.min(minY, STAGE.y - 170); maxY = Math.max(maxY, STAGE.y + 10);
  // (v16) the UI-safe frame: the HUD panels own a band of the screen (bottom, or top with touch controls) — frame the fight in
  // the free area above / below them, so the arena's front edge and the fighters standing on it never sit under the glass
  const sb = HUD_SAFE, free = 1 - sb.b - sb.t;
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 * 0.7 + (STAGE.y - 140) * 0.3;
  let z = clamp(Math.min(W / (maxX - minX + 560), H * free / (maxY - minY + 380)), 0.66, 1.08);
  if (G.suddenDeath) z = clamp(z * 1.16, 0.9, 1.3);                                           // Sudden Death: a tighter, tenser frame
  let ease = 0.09, easeZ = 0.07;
  const U = G.ultCine, uf = U && fighters[U.id], uv = U && U.vic >= 0 ? fighters[U.vic] : null;
  if (uf && G.mode !== 'menu') {                                                              // Ultimates: push in on the fighter, then frame the flurry
    if (G.ultFreeze > 0) { cx = uf.x; cy = uf.y - 56; z = 1.6; ease = 0.16; easeZ = 0.12; }
    else if (U.ph === 'cine' && uv) { cx = (uf.x + uv.x) / 2; cy = (uf.y + uv.y) / 2 - 56; z = 1.28; ease = 0.12; easeZ = 0.08; }
  }
  const vw = VIEW.LW / z, vh = VIEW.LH / z;                                                   // the full-bleed view (wider screens see more)
  cx = vw < BZ.r - BZ.l ? clamp(cx, BZ.l + vw / 2, BZ.r - vw / 2) : (BZ.l + BZ.r) / 2;
  cy = vh < BZ.b - BZ.t ? clamp(cy, BZ.t + vh / 2, BZ.b - vh / 2) : (BZ.t + BZ.b) / 2;
  if (!(uf && G.mode !== 'menu' && G.ultFreeze > 0)) cy += (sb.b - sb.t) / 2 * vh;            // shift the frame's centre into the free band
  c.x +=(cx - c.x) * ease; c.y += (cy - c.y) * ease; c.z += (z - c.z) * easeZ;
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
  const c = G.cam, k = SET.flash ? CAMFX.k : CAMFX.k * 0.5, sa = G.shakeAng || 0;
  const rum = G.ultCine && G.mode !== 'menu' && G.ultCine.ph === 'cine' ? 2.6 : 0, sk = Math.max(G.shake, rum) * SET.shake;   // (v16: a low rumble through the Ultimate flurry)
  const along = sk ? rand(-1, 1) * sk : 0, across = sk ? rand(-1, 1) * sk * 0.45 : 0;        // multi-axis shake, biased along the last launch
  const shx = Math.cos(sa) * along - Math.sin(sa) * across, shy = Math.sin(sa) * along + Math.cos(sa) * across;
  const e = k * k * (3 - 2 * k);
  const v = { x: c.x + (CAMFX.x - c.x) * 0.32 * e - shx, y: c.y + (CAMFX.y - c.y) * 0.32 * e - shy, z: c.z * (1 + 0.32 * e), roll: CAMFX.roll * e, k: e };
  return typeof finisherCam === 'function' && G.mode !== 'menu' ? finisherCam(v) : v;          // v16: the FINAL BLOW punch-in
}
