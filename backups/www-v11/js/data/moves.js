/* NEON BRAWL — Move data, light/heavy maps, throws, grab box, CPU difficulty levels. */
'use strict';

/* ================================ MOVES ============================= */
/* Hitbox is relative to the fighter's feet; `ox` = near edge toward facing, `oy` = top edge.
 * s = startup, a = active, e = ending lag (frames).
 * limb  = what lands the hit in the animation: 'fist' (default, a flying fist), 'kick' (front foot), 'stomp' (both feet), 'spin' (whole body)
 * air   = aerial (light attack in the air) · back = hits behind the fighter · charge = can be held to charge (smashes) */
const MOVES = {
  // light attacks (left click)
  jab:    { s: 3, a: 3, e: 11, box: { ox: 8,   oy: -52,  w: 50,  h: 26 }, dmg: 3,   base: 3.2, scale: .035, ang: 40, lunge: .6, hs: 3, chain: true },
  jab2:   { s: 3, a: 3, e: 12, box: { ox: 8,   oy: -50,  w: 54,  h: 28 }, dmg: 3.5, base: 3.4, scale: .04,  ang: 42, lunge: .8, hs: 3, chain: true },
  jab3:   { s: 4, a: 4, e: 18, box: { ox: 10,  oy: -54,  w: 64,  h: 30 }, dmg: 6,   base: 5.5, scale: .07,  ang: 36, lunge: 2,  hs: 5 },
  ftilt:  { s: 5, a: 4, e: 16, box: { ox: 10,  oy: -48,  w: 70,  h: 24 }, dmg: 7,   base: 6,   scale: .075, ang: 30, lunge: 2.5, hs: 4 },   // walking side attack: a lunging thrust
  utilt:  { s: 4, a: 5, e: 14, box: { ox: -32, oy: -112, w: 64,  h: 46 }, dmg: 6,   base: 5.5, scale: .065, ang: 84, hs: 4 },
  dtilt:  { s: 4, a: 4, e: 12, box: { ox: 8,   oy: -18,  w: 64,  h: 20 }, dmg: 5,   base: 4.5, scale: .05,  ang: 28, hs: 3, limb: 'kick' },
  dashatk:{ s: 5, a: 8, e: 18, box: { ox: 4,   oy: -34,  w: 58,  h: 32 }, dmg: 7,   base: 6,   scale: .06,  ang: 55, lunge: 9.5, hs: 4, limb: 'kick' },   // running slide kick
  // aerials (light attack in the air)
  nair:   { s: 4, a: 8, e: 12, box: { ox: -40, oy: -80,  w: 80,  h: 82 }, dmg: 5,   base: 4.2, scale: .05,  ang: 50, radial: true, hs: 3, air: true, limb: 'spin' },
  fair:   { s: 6, a: 4, e: 15, box: { ox: 6,   oy: -78,  w: 62,  h: 62 }, dmg: 8,   base: 5.5, scale: .08,  ang: 38, hs: 5, air: true },
  bair:   { s: 5, a: 4, e: 14, box: { ox: 4,   oy: -62,  w: 58,  h: 40 }, dmg: 9,   base: 6,   scale: .085, ang: 34, hs: 5, air: true, back: true, limb: 'kick' },
  uair:   { s: 4, a: 5, e: 12, box: { ox: -34, oy: -126, w: 68,  h: 56 }, dmg: 6,   base: 5,   scale: .065, ang: 85, hs: 4, air: true, limb: 'kick' },
  dair:   { s: 7, a: 4, e: 18, box: { ox: -24, oy: -16,  w: 48,  h: 46 }, dmg: 9,   base: 5,   scale: .07,  ang: -75, hs: 6, air: true, limb: 'stomp' },   // meteor stomp
  // heavy / smash attacks (right click). 12-18 frame wind-ups for real KO power; hold right click to charge (up to 1 s)
  nheavy: { s: 14, a: 6, e: 24, box: { ox: -46, oy: -68,  w: 92,  h: 60 }, dmg: 11, base: 7,   scale: .095, ang: 48, radial: true, hs: 7, heavy: true, charge: true },
  fsmash: { s: 16, a: 4, e: 26, box: { ox: 10,  oy: -60,  w: 78,  h: 38 }, dmg: 15, base: 8,   scale: .12,  ang: 32, lunge: 3, hs: 9, heavy: true, charge: true },
  usmash: { s: 14, a: 6, e: 26, box: { ox: -36, oy: -124, w: 72,  h: 66 }, dmg: 13, base: 8.5, scale: .14,  ang: 86, hs: 8, heavy: true, charge: true },
  dsmash: { s: 13, a: 5, e: 26, box: { ox: -56, oy: -28,  w: 112, h: 28 }, dmg: 12, base: 7,   scale: .10,  ang: 30, radial: true, hs: 7, heavy: true, charge: true },
  // Dino Nuggi only: he jumps into a mini F1 car and drives it through the opponent (car = driving speed)
  carsmash:{ s: 14, a: 16, e: 24, box: { ox: -14, oy: -56, w: 132, h: 58 }, dmg: 17, base: 10,  scale: .15,  ang: 36, hs: 9, heavy: true, charge: true, car: 9, limb: 'car' },
  cardash: { s: 6,  a: 14, e: 18, box: { ox: -10, oy: -52, w: 112, h: 52 }, dmg: 11, base: 8,   scale: .10,  ang: 48, hs: 6, heavy: true, car: 11, limb: 'car' }
};
const LIGHT_MAP = { n: 'jab',    s: 'jab',    u: 'utilt', d: 'dtilt' };
const AIR_MAP   = { n: 'nair',   s: 'fair',   u: 'uair',  d: 'dair' };       // (side aim behind you = bair)
const HEAVY_MAP = { n: 'nheavy', s: 'fsmash', u: 'usmash', d: 'dsmash' };
const SMASH_CHARGE = { max: 60, dmg: 0.4, kb: 0.25 };                        // full charge (60 frames): +40% damage, +25% knockback
// Dynamo's throws (f = forward, b = back, u = up, d = crushing slam)
const THROWS = {
  f: { dmg: 9,  base: 7,   scale: 0.12,  ang: 36 },
  b: { dmg: 10, base: 7.5, scale: 0.125, ang: 40 },
  u: { dmg: 8,  base: 7.5, scale: 0.115, ang: 88 },
  d: { dmg: 14, base: 6,   scale: 0.10,  ang: 80 }
};
const GRAB_BOX = { ox: 4, oy: -60, w: 66, h: 52 };

/* CPU difficulty presets
 * parry: chance to time a frame-perfect parry   di: chance to steer out of hit-stun
 * tech: chance to tech a landing / wall        gimp: leaves the stage to intercept recoveries */
const DIFFS = [
  { name: 'Easy',    desc: 'Slow reaction times, minimal edge-guarding and a passive defense.',
    react: 24, cd: [45, 85], shield: 0.10, parry: 0,   heavy: 0.10, rec: 0.7,  recDelay: 30, optimal: false, edge: false, chain: 0.3, aggr: 0.45, dash: 0.003, orb: 0.25, di: 0,   tech: 0,   gimp: false },
  { name: 'Medium',  desc: 'Active recovery, mixes light attacks and shielding, and lands basic combos.',
    react: 12, cd: [22, 45], shield: 0.55, parry: 0,   heavy: 0.30, rec: 0.92, recDelay: 10, optimal: false, edge: true,  chain: 0.7, aggr: 0.8,  dash: 0.010, orb: 0.55, di: 0.5, tech: 0,   gimp: false },
  { name: 'Hard',    desc: 'Aggressive edge-guarding, directional influence, teching and combo resets.',
    react: 4,  cd: [5, 14],  shield: 1,    parry: 0.7, heavy: 0.35, rec: 1,    recDelay: 2,  optimal: true,  edge: true,  chain: 1,   aggr: 1,    dash: 0.030, orb: 0.9,  di: 1,   tech: 0.7, gimp: false },
  { name: 'Extreme', desc: 'Frame-perfect parries, optimal combo strings and aggressive aerial gimps.',
    react: 2,  cd: [3, 9],   shield: 1,    parry: 1,   heavy: 0.40, rec: 1,    recDelay: 1,  optimal: true,  edge: true,  chain: 1,   aggr: 1,    dash: 0.040, orb: 1,    di: 1,   tech: 1,   gimp: true }
];
