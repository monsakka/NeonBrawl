/* NEON BRAWL — Camera follow / zoom, plus the cinematic layer (shake, smash zoom + roll) shared by both renderers.
 *
 * v17 "game feel" camera:
 *   FOLLOW   the frame (both fighters + the stage, lead-ahead for anything launched fast) is tracked with a critically
 *            damped spring (SmoothDamp) on x, y and zoom, speed-capped — respawns, deaths, zoom-limit changes and Ultimate
 *            push-ins glide instead of snapping, and there is no lerp "stair-stepping" at the start of a move.
 *   SHAKE    a trauma model: every hit, block, parry, KO and Ultimate adds trauma (0…1); the shake is trauma² through
 *            smooth multi-frequency noise — translation biased along the launch direction, a roll and a small zoom punch —
 *            decaying in real time. A jab is a tiny rattle (~1 px); a smash, a kill launch or an Ultimate shakes violently.
 *            The legacy G.shake (px) every system still sets feeds in as a trauma floor. Settings → Screen shake scales it. */
'use strict';

/* ============================== CAMERA ============================== */
// fractions of the screen height covered by the HUD at the bottom (b) and top (t) — measured from the DOM by render/hud.js
const HUD_SAFE = { b: 0, t: 0 };
const CAMV = { cam: null, vx: 0, vy: 0, vz: 0 };                         // the follow spring's velocities (per match camera object)
// Unity-style SmoothDamp: a critically damped spring toward `to` (time constant T seconds, speed cap max/s), dt seconds
function smoothDamp(cur, to, key, T, max, dt) {
  const w = 2 / T, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), lim = max * T;
  const ch = clamp(cur - to, -lim, lim), tgt = cur - ch, tmp = (CAMV[key] + w * ch) * dt;
  CAMV[key] = (CAMV[key] - w * tmp) * e;
  let out = tgt + (ch + tmp) * e;
  if ((to - cur > 0) === (out > to)) { out = to; CAMV[key] = 0; }        // (never overshoot)
  return out;
}
function updateCamera() {
  const c = G.cam; if (CAMV.cam !== c) { CAMV.cam = c; CAMV.vx = CAMV.vy = CAMV.vz = 0; }
  let list = fighters.filter(f => f.state !== 'dead');
  if (!list.length) list = fighters;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const add = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const f of list) {
    const s = f.scale || 1, px = clamp(f.x, BZ.l, BZ.r), py = clamp(f.y - 32 * s, BZ.t, BZ.b);   // (a giant is framed by its middle)
    if (s > 1) minY = Math.min(minY, clamp(f.y - BODY_H * s, BZ.t, BZ.b));
    add(px, py);
    if (Math.hypot(f.vx, f.vy) > 7 && f.state === 'hitstun') add(clamp(f.x + f.vx * 7, BZ.l, BZ.r), clamp(f.y - 32 * s + f.vy * 7, BZ.t, BZ.b));   // (v17: lead a launched fighter)
  }
  if (G.camExtra) for (const p of G.camExtra) add(p.x, p.y);                                       // (Break the Targets / the Horde: keep them in frame)
  const smid = STAGE.x + STAGE.w / 2, shalf = Math.max(110, STAGE.w / 2 - 190);                // keep the heart of the stage in frame
  minX = Math.min(minX, smid - shalf); maxX = Math.max(maxX, smid + shalf);
  minY = Math.min(minY, STAGE.y - 150); maxY = Math.max(maxY, STAGE.y + 10);
  // (v16) the UI-safe frame: the HUD panels own a band of the screen (bottom, or top with touch controls) — frame the fight in
  // the free area above / below them, so the arena's front edge and the fighters standing on it never sit under the glass
  const sb = HUD_SAFE, free = 1 - sb.b - sb.t;
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 * 0.7 + (STAGE.y - 140) * 0.3;
  let z = clamp(Math.min(W / (maxX - minX + 470), H * free / (maxY - minY + 330)), 0.66, 1.26);   // (v17: a tighter, punchier frame)
  if (G.suddenDeath) z = clamp(z * 1.16, 0.9, 1.3);                                           // Sudden Death: a tighter, tenser frame
  let T = 0.2, Tz = 0.34, vmax = 1700;                                                        // spring time constants (s) + speed cap (px/s)
  const U = G.ultCine, uf = U && fighters[U.id], uv = U && U.vic >= 0 ? fighters[U.vic] : null;
  if (uf && G.mode !== 'menu') {                                                              // Ultimates: push in on the fighter, then frame the flurry
    if (G.ultFreeze > 0) { cx = uf.x; cy = uf.y - 56; z = 1.6; T = 0.1; Tz = 0.14; vmax = 4000; }
    else if (U.ph === 'cine' && uv) { cx = (uf.x + uv.x) / 2; cy = (uf.y + uv.y) / 2 - 56; z = 1.28; T = 0.13; Tz = 0.2; vmax = 3000; }
  }
  const vw = VIEW.LW / z, vh = VIEW.LH / z;                                                   // the full-bleed view (wider screens see more)
  cx = vw < BZ.r - BZ.l ? clamp(cx, BZ.l + vw / 2, BZ.r - vw / 2) : (BZ.l + BZ.r) / 2;
  cy = vh < BZ.b - BZ.t ? clamp(cy, BZ.t + vh / 2, BZ.b - vh / 2) : (BZ.t + BZ.b) / 2;
  if (!(uf && G.mode !== 'menu' && G.ultFreeze > 0)) cy += (sb.b - sb.t) / 2 * vh;            // shift the frame's centre into the free band
  const dt = STEP / 1000;
  c.x = smoothDamp(c.x, cx, 'vx', T, vmax, dt); c.y = smoothDamp(c.y, cy, 'vy', T, vmax, dt); c.z = smoothDamp(c.z, z, 'vz', Tz, 2.5, dt);
  CAMFX.k *= 0.9; if (CAMFX.k < 0.002) CAMFX.k = 0;                                          // the smash punch-in eases back out
}

/* Cinematic punch-in on big smash hits: the camera lunges toward the impact, zooms in and rolls slightly. */
const CAMFX = { k: 0, x: 640, y: 360, roll: 0 };
function smashCam(x, y, dir, power) {
  const p = clamp(power, 0, 1);
  if (p < CAMFX.k * 0.6) return;                                                              // a bigger punch is already playing
  CAMFX.k = Math.max(CAMFX.k, p); CAMFX.x = x; CAMFX.y = y; CAMFX.roll = (dir || 1) * 0.055 * p;
}

/* ---- trauma shake ---- */
const SHAKE = { trauma: 0, ang: 0, last: 0 };
function addTrauma(amount, ang) { SHAKE.trauma = Math.min(1, SHAKE.trauma + amount); if (ang !== undefined) SHAKE.ang = ang; }
// smooth noise in [-1, 1]: three incommensurate sines per channel (continuous, never repeats visibly)
const shakeNoise = (t, k) => Math.sin(t * 19.1 + k * 1.7) * 0.55 + Math.sin(t * 31.7 + k * 4.3) * 0.3 + Math.sin(t * 53.3 + k * 7.9) * 0.15;
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'hit') {
    const kb = d.kb || 0, tr = kb < 9 ? 0.2 : kb < 14 ? 0.32 : kb < 20 ? 0.46 + (kb - 14) * 0.02 : 0.62 + Math.min(0.3, (kb - 20) * 0.02);
    addTrauma(tr + (d.m && d.m.heavy ? 0.06 : 0), d.vic ? Math.atan2(d.vic.vy || 0, d.vic.vx || 1) : SHAKE.ang);
    if (d.m && d.m.heavy && d.kb >= 13) smashCam(d.x, d.y, d.dir || 1, (d.kb - 10) / 14);         // dramatic smash connect
  }
  else if (type === 'block') addTrauma(0.14);
  else if (type === 'parry') addTrauma(0.32);
  else if (type === 'ko') { addTrauma(0.9); smashCam(d.x, d.y, d.x < 640 ? -1 : 1, 0.55); }       // the KO blast
  else if (type === 'land' && d.impact > 12) addTrauma(Math.min(0.3, (d.impact - 12) * 0.03));
});

/* The camera actually used to draw this frame: follow cam + smash punch-in + trauma shake. Both the canvas renderer
 * (worldTransform) and the WebGL renderer read this, so 2D overlay effects stay glued to the 3D world. */
function viewCam() {
  const c = G.cam, k = SET.flash ? CAMFX.k : CAMFX.k * 0.5, now = performance.now(), dt = Math.min(0.1, (now - (SHAKE.last || now)) / 1000); SHAKE.last = now;
  SHAKE.trauma = Math.max(0, SHAKE.trauma - dt * 1.3);
  const legacy = Math.sqrt(clamp(G.shake / 26, 0, 1)), rum = G.ultCine && G.mode !== 'menu' && G.ultCine.ph === 'cine' ? 0.44 : 0;   // (G.shake px from every system · the Ultimate rumble)
  const T = Math.max(SHAKE.trauma, legacy, rum), s = T * T * (SET.shake === undefined ? 1 : SET.shake), ts = now / 1000, sa = SHAKE.trauma >= legacy ? SHAKE.ang : (G.shakeAng || SHAKE.ang);
  const along = s * 30 * shakeNoise(ts, 1), across = s * 15 * shakeNoise(ts, 2);
  const shx = Math.cos(sa) * along - Math.sin(sa) * across, shy = Math.sin(sa) * along + Math.cos(sa) * across;
  const e = k * k * (3 - 2 * k);
  const v = { x: c.x + (CAMFX.x - c.x) * 0.32 * e - shx, y: c.y + (CAMFX.y - c.y) * 0.32 * e - shy, z: c.z * (1 + 0.32 * e + s * 0.035 * Math.abs(shakeNoise(ts, 3))),
    roll: CAMFX.roll * e + s * 0.045 * shakeNoise(ts, 4), k: e };
  return typeof finisherCam === 'function' && G.mode !== 'menu' ? finisherCam(v) : v;          // v16: the FINAL BLOW punch-in
}
