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

const FIN16 = { on: false, t0: 0, x: 640, y: 360, vic: null, dir: 1, hits: 0 };
// would this launched fighter cross the blast zone? (mirrors fighter-update.js hitstun + free-fall physics, ignoring DI)
function predictKO(f) {
  let x = f.x, y = f.y - 32 * (f.scale || 1), vx = f.vx, vy = f.vy, h = f.hitstun || 0;
  const gh = PHYS.hitGrav * (f.ch.grav || 1), g = PHYS.grav * (f.ch.grav || 1), S = STAGE;
  for (let i = 0; i < 200; i++) {
    if (i < h) { vx *= 0.985; vy = Math.min(vy + gh, 24); } else { vx *= 0.97; vy = Math.min(vy + g, PHYS.maxFall); }
    const py = y; x += vx; y += vy;
    if (x < BZ.l || x > BZ.r || y < BZ.t || y > BZ.b) return true;
    if (vy > 0 && py <= S.y && y >= S.y && x > S.x && x < S.x + S.w) return false;           // lands on the main stage
    if (i > h + 30 && Math.abs(vx) < 1 && vy < 2) return false;                               // the launch has died out in the air
  }
  return false;
}
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type !== 'hit' || G.mode !== 'play' || FIN16.on || !d.vic || d.vic.isHazard) return;
  const v = d.vic; if (v.stocks !== 1 || G.training || G.volley || (CHAL.mode && CHAL.mode !== 'arcade')) return;
  if (fighters.filter(q => q.stocks > 0).length !== 2 || !predictKO(v)) return;
  Object.assign(FIN16, { on: true, t0: performance.now(), x: d.x, y: d.y, vic: v, dir: d.dir || 1 });
  G.flash = Math.max(G.flash, 0.75); G.shake = Math.max(G.shake, 10);
  for (let k = 0; k < 3; k++) ring(d.x, d.y, k ? v.color : '#ffffff', 14 + k * 8, 18 + k * 6, 30 + k * 8, 6 - k);
  if (typeof textFx === 'function') textFx('FINAL BLOW', d.x, d.y - 120, '#ffffff');
});
// real-time envelope of the finisher: [time scale for the main loop, camera weight 0..1]
function finisherState(now) {
  if (!FIN16.on) return [1, 0];
  const u = (now - FIN16.t0) / 1000;
  if (u > 3 || G.mode === 'menu' || G.mode === 'over') { FIN16.on = false; return [1, 0]; }
  const speed = NET.active ? 1 : u < 1.1 ? 0.1 : u < 1.7 ? 0.1 + 0.9 * smooth((u - 1.1) / 0.6) : 1;
  const w = smooth(u / 0.14) * (1 - smooth((u - 1.35) / 0.75));
  return [speed, w];
}
// the camera layer (camera.js viewCam calls this): punch in on the impact, follow the victim, roll toward the launch
function finisherCam(v) {
  const [, w] = finisherState(performance.now()); if (w <= 0.001) return v;
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
