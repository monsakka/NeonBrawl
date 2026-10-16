/* NEON BRAWL — v16 cinematic finisher + combat-feel polish (presentation only: nothing here changes the simulation).
 *
 *   FINAL BLOW   when a hit launches a fighter on their LAST stock and a ballistic prediction of the launch (the same hitstun
 *                physics: hit gravity, 0.985 air drag, a 24 px fall cap) says they will cross the blast zone, the game
 *                instantly drops to 10 % speed for ~1.1 s of real time while the camera punches in (×1.85) on the impact
 *                and rolls, the vignette closes in and the frame flashes — then time ramps back to full speed so the launch
 *                finishes and the normal FINISH! freeze plays. Offline only (online lockstep keeps real time).
 *   ULT RUMBLE   a continuous low camera rumble through every Ultimate's cinematic flurry (on top of its own hit shakes).
 *   HIT SPARKS   heavy connects add a white-hot core flare, a coloured shock ring and a fan of long glowing streaks.     */
'use strict';

/* v18 timeline fix. The slow-mo used to start on the hit itself, so the heavy hit-pause (6 sim steps) ran at 10 % speed and
 * swallowed the whole slow window: the game sat frozen for ~1.1 s, then the victim shot off at full speed. Now the finisher
 * runs on its own pause-safe clock (finisherTick, called once per frame by main.js) in three phases:
 *   IMPACT  the hit-pause plays at real speed (exactly 0.1 s) while the camera starts to punch in
 *   SLOW    the moment the pause ends: 10 % speed for FIN_SLOW s (the launch is drawn interpolated, so it glides), then a
 *           smooth ramp back to full speed over FIN_RAMP s
 *   KO      if the victim crosses the blast zone during the slow window, speed snaps back over 0.25 s so the KO blast and the
 *           FINISH! freeze play at full speed, and the camera lets go
 * Everything presentational that runs on real time (rig springs, camera shake, 3D bursts) reads TSCALE.k, so it slows too. */
const FIN16 = { on: false, ph: '', c: 0, cs: 0, ck: 0, x: 640, y: 360, vic: null, dir: 1 };
const FIN_SLOW = 1.15, FIN_RAMP = 0.55;
const TSCALE = { k: 1 };                                                    // this frame's presentation time scale (main.js)
// would this launched fighter cross the blast zone? (mirrors fighter-update.js: hitstun flight, then the v17 free fall)
function predictKO(f) {
  let x = f.x, y = f.y - 32 * (f.scale || 1), vx = f.vx, vy = f.vy, h = f.hitstun || 0;
  const gk = f.ch.grav || 1, gh = PHYS.hitGrav * gk, S = STAGE;
  for (let i = 0; i < 240; i++) {
    if (i < h) { vx *= 0.985; vy = Math.min(vy + gh, 24); }
    else { const off = x < S.x || x > S.x + S.w || y > S.y; vx *= 0.97; vy = Math.min(vy + PHYS.grav * gk * (vy < 0 ? 1 : off ? 1.12 : FALL_K), PHYS.maxFall * (off ? 1.05 : 1.18)); }
    const py = y; x += vx; y += vy;
    if (x < BZ.l || x > BZ.r || y < BZ.t || y > BZ.b) return true;
    if (vy > 0 && py <= S.y && y >= S.y && x > S.x && x < S.x + S.w) return false;           // lands on the main stage
    if (i > h + 30 && Math.abs(vx) < 1 && vy < 2) return false;                               // the launch has died out in the air
  }
  return false;
}
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'ko' && FIN16.on && d.f === FIN16.vic && !FIN16.ck) { FIN16.ck = Math.max(FIN16.c, 1e-3); return; }
  if (type !== 'hit' || G.mode !== 'play' || FIN16.on || !d.vic || d.vic.isHazard) return;
  const v = d.vic; if (v.stocks !== 1 || G.training || G.volley || G.bowl || (CHAL.mode && CHAL.mode !== 'arcade' && CHAL.mode !== 'lava')) return;   // (v19: The Floor is Lava's last stock gets the FINAL BLOW too)
  if (fighters.filter(q => q.stocks > 0).length !== 2 || !predictKO(v)) return;
  Object.assign(FIN16, { on: true, ph: 'impact', c: 0, cs: 0, ck: 0, x: d.x, y: d.y, vic: v, dir: d.dir || 1 });
  G.flash = Math.max(G.flash, 0.4); G.shake = Math.max(G.shake, 10);
  for (let k = 0; k < 3; k++) ring(d.x, d.y, k ? v.color : '#ffe6c8', 12 + k * 8, 7 + k * 3, 20 + k * 5, 5 - k);   // (v18: tighter rings — in slow-mo the old ones swelled into screen-wide white arcs)
  if (typeof textFx === 'function') textFx('FINAL BLOW', d.x, d.y - 120, '#ffffff');
});
// advance the finisher clock by one rendered frame (dt ms; frozen while paused) and return this frame's sim speed
function finisherTick(dt) {
  if (!FIN16.on) return 1;
  if (G.mode === 'menu' || G.mode === 'over' || !FIN16.vic) { FIN16.on = false; return 1; }
  if (!G.paused) FIN16.c += Math.min(dt, 100) / 1000;
  if (FIN16.ph === 'impact' && !(G.hitstop > 0 && SET.hitstop)) { FIN16.ph = 'slow'; FIN16.cs = FIN16.c; }   // the hit-pause is over: slow-mo starts now
  const u = FIN16.c - FIN16.cs;
  if (FIN16.c > 6 || (FIN16.ph === 'slow' && u > FIN_SLOW + FIN_RAMP + 0.9) || (FIN16.ck && FIN16.c - FIN16.ck > 1.3)) { FIN16.on = false; return 1; }
  return finisherState()[0];
}
// the finisher envelope at the current clock: [sim speed 0.1..1, camera weight 0..1]
function finisherState() {
  if (!FIN16.on) return [1, 0];
  const c = FIN16.c, slow = FIN16.ph === 'slow', u = c - FIN16.cs;
  let speed = !slow ? 1 : u < FIN_SLOW ? 0.1 : 0.1 + 0.9 * smooth((u - FIN_SLOW) / FIN_RAMP);
  if (FIN16.ck) speed = Math.max(speed, 0.1 + 0.9 * smooth((c - FIN16.ck) / 0.25));
  if (NET.active) speed = 1;                                                // (online lockstep keeps real time)
  const out = Math.min(slow ? FIN16.cs + FIN_SLOW + 0.15 : 1e9, FIN16.ck ? FIN16.ck + 0.3 : 1e9);   // (a KO only ever brings the release forward)
  return [speed, smooth(c / 0.14) * (1 - smooth((c - out) / 0.7))];
}
// the camera layer (camera.js viewCam calls this): punch in on the impact, follow the victim, roll toward the launch
function finisherCam(v) {
  const [, w] = finisherState(); if (w <= 0.001) return v;
  const f = FIN16.vic, tx = f && f.state !== 'dead' ? lerp(FIN16.x, f.x, 0.55) : FIN16.x, ty = f && f.state !== 'dead' ? lerp(FIN16.y, f.y - 40, 0.55) : FIN16.y;
  return { x: lerp(v.x, tx, 0.85 * w), y: lerp(v.y, ty, 0.85 * w), z: v.z * (1 + 0.85 * w), roll: (v.roll || 0) + FIN16.dir * 0.05 * w, k: Math.max(v.k || 0, w) };
}
// heavier connects: a white-hot core, a coloured shock ring and long glowing streaks (called from combat.js impactFx)
function heavySparks16(px, py, kb, color) {
  if (kb < 11) return;
  const k = clamp((kb - 11) / 14, 0, 1);
  const n = den(8 + Math.round(10 * k));
  for (let i = 0; i < n; i++) { const a = FXR() * TAU, sp = frand(10, 18 + 10 * k);
    pushFx({ type: 'spark', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: frand(14, 24), max: 24, color: i % 2 ? '#ffffff' : color, w: frand(3.4, 5.2), len: frand(4, 6.5), drag: 0.88, g: 0.12 }); }
}
