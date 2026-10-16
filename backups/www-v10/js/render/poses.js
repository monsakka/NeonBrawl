/* NEON BRAWL — Pose library for the vector fighter rig.
 *
 * Every fighter is a 6-part rig: torso, floating head, two fists and two feet (Rayman-style floating limbs,
 * joined to the body by glowing tendons). computePose(f) works out which named pose the fighter is in and
 * returns a target for each part in the fighter's local, facing-relative space:
 *     x > 0 = in front of the fighter, y < 0 = up, origin = between the feet.
 * drawFighter() chases those targets with damped springs, so switching poses blends smoothly (with a little
 * overshoot) at any frame rate, and the sub-pixel positions are interpolated between simulation steps.
 *
 * Attacks are keyframed in phases (wind-up → [charge] → strike → recovery). The striking limb is aimed at the
 * move's real hitbox, so the fist / foot you see is where the hit lands.
 *
 * Pose fields:  fa / ba = front / back fist · ff / bf = front / back foot · hd = head offset
 *               lean = body tilt (radians, + = forward) · spin = extra whole-body rotation (unsprung)
 *               sx / sy = squash & stretch · oy = drop the whole body (e.g. lying on the floor)
 *               stiff = 1 → limbs snap faster (attacks)                                                     */
'use strict';

const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

/* Rig proportions per animation archetype (arm-length multiplier, leg bone length, head scale, torso height).
 * Combined with each fighter's body width (bw) and limb thickness, this gives every fighter its own silhouette. */
const RIG_BUILD = {
  fighter: { armK: 1.0,  legL: 11, headK: 1.0,  torsoH: 28 }, heavy:   { armK: 1.0,  legL: 11, headK: 0.9,  torsoH: 33 },
  brute:   { armK: 1.18, legL: 10, headK: 0.82, torsoH: 34 }, float:   { armK: 0.92, legL: 9,  headK: 1.02, torsoH: 30 },
  mage:    { armK: 0.95, legL: 11, headK: 1.06, torsoH: 30 }, ninja:   { armK: 1.0,  legL: 12, headK: 0.95, torsoH: 27 },
  knight:  { armK: 1.0,  legL: 11, headK: 0.94, torsoH: 32 }, brawler: { armK: 1.06, legL: 11, headK: 1.0,  torsoH: 29 },
  beast:   { armK: 1.08, legL: 9,  headK: 1.02, torsoH: 26 }, mutant:  { armK: 1.38, legL: 12, headK: 1.0,  torsoH: 26 },
  skater:  { armK: 1.0,  legL: 13, headK: 1.0,  torsoH: 27 }, acrobat: { armK: 0.95, legL: 13, headK: 1.06, torsoH: 24 },
  racer:   { armK: 1.0,  legL: 11, headK: 1.06, torsoH: 28 }
};
const rigOf = c => RIG_BUILD[c.arch] || RIG_BUILD.fighter;
const TAU = Math.PI * 2;

function pose(o) { return Object.assign({ fa: [16, -26], ba: [-16, -24], ff: [8, 0], bf: [-8, 0], hd: [0, 0], lean: 0, spin: 0, sx: 1, sy: 1, oy: 0, stiff: 0 }, o); }
function mixPose(a, b, k) {
  const L = (p, q) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k], N = (p, q) => p + (q - p) * k;
  return { fa: L(a.fa, b.fa), ba: L(a.ba, b.ba), ff: L(a.ff, b.ff), bf: L(a.bf, b.bf), hd: L(a.hd, b.hd),
           lean: N(a.lean, b.lean), spin: N(a.spin, b.spin), sx: N(a.sx, b.sx), sy: N(a.sy, b.sy), oy: N(a.oy, b.oy), stiff: Math.max(a.stiff, b.stiff) };
}
// Map a point from the un-rotated local frame into the body's rotated + scaled frame (so a limb can be aimed at a hitbox).
// drawFighter applies: translate(0,-32) · rotate(lean) · translate(0,32) · scale(sx,sy) — this is the inverse.
function intoBody(p, lean, sx, sy) {
  const c = Math.cos(-lean), s = Math.sin(-lean), x = p[0], y = p[1] + 32;              // relative to the pivot (0,-32)
  const rx = x * c - y * s, ry = x * s + y * c - 32;
  return [rx / sx, ry / sy];
}

/* Two-bone IK: the joint (elbow / knee) between root p and end-effector t, for bones a and b.
 * bend = +1 / -1 picks which side the joint folds to. Out of reach, the limb straightens and stretches
 * (cartoon "rubber-hose" stretch) so fists and feet still land exactly where the pose puts them.        */
function ik2(p, t, a, b, bend) {
  const dx = t[0] - p[0], dy = t[1] - p[1], d0 = Math.hypot(dx, dy) || 0.001;
  if (d0 >= a + b) { const k = d0 / (a + b); return [p[0] + dx / d0 * a * k, p[1] + dy / d0 * a * k]; }
  const d = Math.max(d0, Math.abs(a - b) + 0.01);
  const off = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)), ang = Math.atan2(dy, dx) + bend * off;
  return [p[0] + Math.cos(ang) * a, p[1] + Math.sin(ang) * a];
}

/* ------------------------------------------------------------------------------------------------
 * ATTACK KEYFRAMES: (A = arm reach, H = hit point aimed at the hitbox, k = progress through the active frames)
 * each returns { wind, hit } poses; `limb` says which part delivers the blow.
 * ------------------------------------------------------------------------------------------------ */
const ATTACK_POSES = {
  jab:     { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [A * 0.3, -32], ba: [A + 2, -40], lean: -0.05 }),
                                          hit: pose({ fa: H, ba: [-A, -28], lean: 0.1, ff: [12, 0] }) }) },
  jab2:    { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A * 0.4, -34], ba: [A, -36], lean: -0.1, sx: 0.96 }),
                                          hit: pose({ fa: H, ba: [-A - 4, -30], lean: 0.16, sx: 1.04, ff: [14, 0], bf: [-10, 0] }) }) },
  jab3:    { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A * 0.5, -30], ba: [-A * 0.3, -34], sy: 0.92, lean: -0.15, bf: [-14, 0] }),
                                          hit: pose({ fa: H, ba: [H[0] - 10, H[1] + 8], lean: 0.24, sx: 1.08, ff: [20, 0], bf: [-14, 0] }) }) },
  ftilt:   { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A * 0.3, -40], ba: [A * 0.5, -34], lean: -0.12, bf: [-14, 0], ff: [8, 0] }),
                                          hit: pose({ fa: H, ba: [-A - 6, -34], lean: 0.28, ff: [22, 0], bf: [-14, 0], sx: 1.06 }) }) },
  utilt:   { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A * 0.6, -14], ba: [-A, -20], lean: 0.12, sy: 0.92 }),
                                          hit: pose({ fa: H, ba: [-A, -34], lean: -0.18, sy: 1.08, hd: [-2, -3] }) }) },
  dtilt:   { limb: 'ff', f: (A, H) => ({ wind: pose({ ff: [4, -12], bf: [-10, 0], fa: [A, -22], ba: [-A, -26], sy: 0.84, lean: 0.1 }),
                                          hit: pose({ ff: H, bf: [-14, 0], fa: [A * 0.6, -18], ba: [-A - 4, -30], sy: 0.78, lean: 0.24, hd: [4, 4] }) }) },
  dashatk: { limb: 'ff', f: (A, H) => ({ wind: pose({ ff: [10, -10], bf: [-12, -4], fa: [-A * 0.4, -34], ba: [-A - 6, -38], lean: 0.3 }),
                                          hit: pose({ ff: H, bf: [-6, -4], fa: [-A, -50], ba: [-A - 8, -44], lean: -0.3, sy: 0.8, hd: [-4, 2] }) }) },
  nair:    { limb: 'spin', f: (A, H, k) => ({ wind: pose({ ff: [6, -22], bf: [-6, -20], fa: [10, -34], ba: [-10, -32], sy: 0.9 }),
                                               hit: pose({ ff: [18, -12], bf: [-18, -12], fa: [A + 8, -40], ba: [-A - 8, -40], sx: 1.08, spin: k < 1 ? TAU * k : 0 }) }) },
  fair:    { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A * 0.4, -86], ba: [-A, -50], ff: [8, -14], bf: [-10, -6], lean: -0.3 }),
                                          hit: pose({ fa: H, ba: [-A - 6, -40], ff: [14, -8], bf: [-12, -2], lean: 0.4, hd: [3, 2] }) }) },
  bair:    { limb: 'bf', f: (A, H) => ({ wind: pose({ bf: [0, -22], ff: [8, -18], fa: [A, -44], ba: [A * 0.4, -40], lean: 0.25 }),
                                          hit: pose({ bf: H, ff: [8, -10], fa: [A + 6, -52], ba: [A * 0.5, -46], lean: 0.45, hd: [4, 1] }) }) },
  uair:    { limb: 'ff', f: (A, H) => ({ wind: pose({ ff: [6, -22], bf: [-6, -14], fa: [A, -30], ba: [-A, -28], lean: 0.2, sy: 0.92 }),
                                          hit: pose({ ff: H, bf: [-8, -6], fa: [A + 4, -18], ba: [-A - 4, -22], lean: -0.95 }) }) },
  dair:    { limb: 'stomp', f: (A, H) => ({ wind: pose({ ff: [6, -36], bf: [-6, -34], fa: [A, -72], ba: [-A, -70], sy: 0.92 }),
                                             hit: pose({ ff: H, bf: [H[0] - 12, H[1] - 2], fa: [A + 4, -78], ba: [-A - 4, -76], sy: 1.12, hd: [0, -2] }) }) },
  // Dino Nuggi's F1 car: he drops into the cockpit (body lowered, legs forward inside the car), hands on the wheel
  carsmash:{ limb: 'car', f: (A, H) => ({ wind: pose({ fa: [A * 0.9, -26], ba: [A * 0.6, -24], ff: [20, -10], bf: [12, -10], sy: 0.8, oy: 12, lean: 0.12, hd: [2, 1] }),
                                           hit: pose({ fa: [A + 2, -24], ba: [A * 0.7, -22], ff: [22, -10], bf: [14, -10], sy: 0.76, oy: 13, lean: 0.32, hd: [5, 2], stiff: 1 }) }) },
  cardash: { limb: 'car', f: (A, H) => ({ wind: pose({ fa: [A * 0.9, -26], ba: [A * 0.6, -24], ff: [20, -10], bf: [12, -10], sy: 0.8, oy: 12, lean: 0.1 }),
                                           hit: pose({ fa: [A + 2, -24], ba: [A * 0.7, -22], ff: [22, -10], bf: [14, -10], sy: 0.76, oy: 13, lean: 0.25, hd: [4, 2], stiff: 1 }) }) },
  nheavy:  { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [6, -38], ba: [-6, -36], sy: 0.86, sx: 1.08, hd: [0, 4] }),
                                          hit: pose({ fa: H, ba: [-H[0], H[1]], sx: 1.12, sy: 1.04, ff: [16, 0], bf: [-16, 0] }) }) },
  fsmash:  { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [-A - 12, -42], ba: [A, -30], lean: -0.32, bf: [-20, 0], ff: [6, 0], sx: 0.94 }),
                                          hit: pose({ fa: H, ba: [-A - 6, -32], lean: 0.32, ff: [22, 0], bf: [-18, 0], sx: 1.1 }) }) },
  usmash:  { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [10, -10], ba: [-8, -12], sy: 0.78, sx: 1.12, hd: [0, 6] }),
                                          hit: pose({ fa: H, ba: [H[0] - 14, H[1] + 10], sy: 1.16, sx: 0.92, ff: [6, -6], bf: [-6, -6], hd: [0, -4] }) }) },
  dsmash:  { limb: 'fa', f: (A, H) => ({ wind: pose({ fa: [6, -84], ba: [-6, -82], sy: 1.08, sx: 0.94 }),
                                          hit: pose({ fa: H, ba: [-H[0], H[1]], sy: 0.78, sx: 1.16, ff: [20, 0], bf: [-20, 0], hd: [0, 6] }) }) }
};
const limbOf = m => (m && m.limb) || 'fist';

function attackPose(f, A, rest) {
  const m = f.move, t = f.stateT, def = ATTACK_POSES[m.key] || ATTACK_POSES.jab;
  const hb = hitboxRect(f, m), Hw = [(hb.x + hb.w / 2 - f.x) * f.facing, hb.y + hb.h / 2 - f.y];
  const k = clamp((t - m.s + 1) / m.a, 0, 1);
  const K = def.f(A, Hw, k);
  if (def.limb.length === 2) K.hit[def.limb] = intoBody(Hw, K.hit.lean, K.hit.sx, K.hit.sy);     // aim the striking limb (fa/ba/ff/bf) at the hitbox
  if (def.limb === 'stomp') { K.hit.ff = intoBody(Hw, K.hit.lean, K.hit.sx, K.hit.sy); K.hit.bf = [K.hit.ff[0] - 12, K.hit.ff[1] - 2]; }
  let P, phase;
  if (f.charging) {                                                     // charging a smash: pulled back further, trembling with power
    const q = f.chargeT / SMASH_CHARGE.max, j = 1.2 + q * 2;
    P = mixPose(K.wind, pose(Object.assign({}, K.wind, { lean: K.wind.lean * 1.35, sy: K.wind.sy * 0.95, sx: K.wind.sx * 1.04 })), q);
    P.hd = [P.hd[0] + rand(-j, j), P.hd[1] + rand(-j, j)]; P.fa = [P.fa[0] + rand(-j, j), P.fa[1] + rand(-j, j)];
    phase = 'charge';
  } else if (t < m.s) { P = mixPose(rest, K.wind, smooth(t / Math.max(1, m.s - 2))); phase = 'wind'; }
  else if (t < m.s + m.a) { P = mixPose(K.wind, K.hit, smooth((t - m.s + 1) / Math.min(3, m.a))); phase = 'strike'; }
  else { P = mixPose(K.hit, rest, smooth((t - m.s - m.a) / Math.max(4, m.e * 0.8))); phase = 'recover'; }   // (k = 1 here, so any spin has finished)
  P.stiff = 1;
  P.lean *= ARCH_LEAN[f.ch.arch] || 1;                                  // heavies throw their weight into it, floaters barely lean
  if (f.ch.arch === 'acrobat' && m.air && phase === 'strike') P.spin = (P.spin || 0) + TAU * k;   // acrobats flip through their aerials
  return [P, m.key + ':' + phase];
}

/* ------------------------------------------------------------------------------------------------
 * SPECIAL-MOVE POSES
 * ------------------------------------------------------------------------------------------------ */
function specialPose(f, A, t) {
  const sp = f.sp, c = f.ch, D = c.special, T = f.stateT;
  const dl = sp.dx !== undefined ? [sp.dx * f.facing, sp.dy] : [1, 0];                 // move direction in local space
  const reach = (d, r, y) => [d[0] * r, (y || -34) + d[1] * r];
  switch (sp.type) {
    case 'burst': {
      if (sp.up === 'rocket') return T <= sp.wind                          // Mecha: crouch, then ride the thrusters with arms pressed down
        ? [pose({ fa: [A * 0.6, -14], ba: [-A * 0.6, -14], ff: [10, 0], bf: [-10, 0], sy: 0.8, sx: 1.12, hd: [0, 5] }), 'sp-up:rocket-ignite']
        : [pose({ fa: [A * 0.3, -12], ba: [-A * 0.5, -14], ff: [4, 6], bf: [-4, 6], sy: 1.1, sx: 0.94, hd: [0, -3], stiff: 1 }), 'sp-up:rocket-thrust'];
      if (sp.up === 'thunder') return T <= sp.wind                         // Volt: coil, then a lightning uppercut leap
        ? [pose({ fa: [A * 0.4, -18], ba: [-A * 0.4, -20], ff: [8, -4], bf: [-8, -2], sy: 0.78, sx: 1.14, hd: [0, 6] }), 'sp-up:thunder-coil']
        : [pose({ fa: [6, -104], ba: [-A * 0.6, -36], ff: [6, -16], bf: [-6, 6], sy: 1.16, sx: 0.88, hd: [0, -4], stiff: 1 }), 'sp-up:thunder-burst'];
      if (sp.turbo) {                                                       // Dino Nuggi: rev the engine (hands on an imaginary wheel), then launch streamlined
        if (T <= sp.wind) { const j = Math.sin(T * 2.3) * 1.5;
          return [pose({ fa: [A * 0.7 + j, -34], ba: [A * 0.5 - j, -30], ff: [10, 0], bf: [-12, 0], sy: 0.82, sx: 1.12, lean: 0.15, hd: [3, 4 + j] }), 'sp-turbo:rev']; }
        return [pose({ fa: reach(dl, -A * 0.4, -30), ba: reach(dl, -A * 0.7, -32), ff: reach(dl, -14, -4), bf: reach(dl, -20, -6), lean: clamp(dl[0], -1, 1) * 0.5, sx: 0.9, sy: 1.12, stiff: 1 }), 'sp-turbo:launch'];
      }
      if (sp.up === 'inferno') return T <= sp.wind                          // Blaze: gather fire low, then erupt upward with both fists raised
        ? [pose({ fa: [A * 0.5, -12], ba: [-A * 0.5, -12], ff: [12, 0], bf: [-12, 0], sy: 0.8, sx: 1.12, hd: [0, 5] }), 'sp-up:inferno-gather']
        : [pose({ fa: [8, -98], ba: [-8, -96], ff: [5, 2], bf: [-5, 4], sy: 1.14, sx: 0.9, hd: [0, -4], stiff: 1 }), 'sp-up:inferno-rise'];
      if (T <= sp.wind) return [pose({ fa: [8, -30], ba: [4, -36], ff: [8, -4], bf: [-10, 0], sy: 0.84, sx: 1.1, hd: [2, 4] }), 'sp-burst:wind'];
      if (sp.dy < -0.6) return [pose({ fa: [4, -100], ba: [-A * 0.6, -40], ff: [6, -14], bf: [-6, 4], sy: 1.14, sx: 0.9, hd: [0, -4], stiff: 1 }), 'sp-burst:uppercut'];
      return [pose({ fa: reach(dl, A + 20), ba: reach(dl, A + 6, -30), ff: reach(dl, -16, -4), bf: reach(dl, -22, -8), lean: clamp(dl[0], -1, 1) * 0.35, sx: 1.08, stiff: 1 }), 'sp-burst:dash'];
    }
    case 'orb': return T < sp.wind ? [pose({ fa: [-A * 0.3, -40], ba: [A * 0.6, -34], lean: -0.12 }), 'sp-orb:cast']
                                   : [pose({ fa: [A + 16, -38], ba: [A + 4, -34], lean: 0.14, ff: [12, 0], stiff: 1 }), 'sp-orb:release'];
    case 'tele': return T <= sp.wind ? [pose({ fa: [6, -36], ba: [-6, -36], sy: 0.84, hd: [0, 4] }), 'sp-tele:vanish']
                                     : [pose({ fa: reach(dl, A + 20), ba: [-A - 6, -40], lean: 0.3, ff: [16, 0], stiff: 1 }), 'sp-tele:strike'];
    case 'blink': return [pose({ fa: [6, -40], ba: [-6, -40], sy: 0.86, sx: 1.06, ff: [4, -6], bf: [-4, -6] }), 'sp-blink'];
    case 'dive':
      if (sp.phase === 'rise') return [pose({ ff: [8, -24], bf: [-6, -20], fa: [A, -70], ba: [-A, -66], sy: 0.92 }), 'sp-dive:rise'];
      if (sp.phase === 'wind') return [pose({ ff: [6, -26], bf: [-8, -18], fa: [A + 12, -58], ba: [-A - 12, -60], sx: 1.08 }), 'sp-dive:hang'];
      return [pose({ bf: [-4, -8], ff: [16, 3], ba: [-A - 4, -54], fa: [-A, -60], lean: 0.55, stiff: 1 }), 'sp-dive:kick'];
    case 'phase':
      if (T <= sp.wind) return [pose({ fa: [-A * 0.4, -28], ba: [-A, -30], sy: 0.88, lean: 0.2 }), 'sp-phase:wind'];
      if (T <= sp.wind + sp.dur) return [pose({ fa: [-A - 4, -30], ba: [-A - 10, -36], ff: [14, -6], bf: [-16, -10], lean: 0.5, sx: 1.1 }), 'sp-phase:dash'];
      return [pose({ fa: [A + 16, -40], ba: [-A - 16, -40], ff: [16, 0], bf: [-16, 0], sx: 1.1, stiff: 1 }), 'sp-phase:strike'];
    case 'glitch': {                                                     // corrupted pose: limbs snap to random offsets
      const h = n => (hash((T >> 1) * 7 + n) - 0.5) * 18;
      return [pose({ fa: [A + h(1), -30 + h(2)], ba: [-A + h(3), -30 + h(4)], ff: [8 + h(5), h(6) * 0.4], bf: [-8 + h(7), h(8) * 0.4], hd: [h(9) * 0.4, h(10) * 0.3] }), 'sp-glitch'];
    }
    case 'stomp':
      if (sp.phase === 'ground') return T < D.wind ? [pose({ ff: [8, -36], bf: [-8, 0], fa: [A, -50], ba: [-A, -48], sy: 1.04 }), 'sp-stomp:lift']
                                                   : [pose({ ff: [18, 0], bf: [-14, 0], fa: [A + 4, -20], ba: [-A - 4, -20], sy: 0.8, sx: 1.12, hd: [0, 4], stiff: 1 }), 'sp-stomp:slam'];
      return T < 7 ? [pose({ ff: [6, -28], bf: [-6, -26], fa: [A + 6, -76], ba: [-A - 6, -76] }), 'sp-stomp:hang']
                   : [pose({ ff: [4, 4], bf: [-4, 4], fa: [A, -80], ba: [-A, -80], sy: 1.12, sx: 0.92, stiff: 1 }), 'sp-stomp:plunge'];
    case 'shoot': {
      const aim = reach(dl, A + 14, -40);
      if (sp.kind === 'arrow')                                             // Orion: bow arm out along the aim, string hand drawn back to the cheek, then loosed
        return T < sp.wind ? [pose({ fa: aim, ba: [aim[0] * 0.2 - 4, -46], lean: -0.08, ff: [12, 0], bf: [-14, 0], hd: [-1, 0] }), 'sp-arrow:draw']
                           : [pose({ fa: aim, ba: [-A, -40], lean: 0.05, ff: [12, 0], bf: [-14, 0], stiff: 1 }), 'sp-arrow:loose'];
      if (sp.kind === 'water')                                             // Kraken: both hands thrust forward, braced against the jet's recoil
        return T < sp.wind ? [pose({ fa: [A * 0.4, -36], ba: [A * 0.2, -32], sy: 0.9, lean: -0.1, bf: [-16, 0] }), 'sp-water:charge']
                           : [pose({ fa: aim, ba: reach(dl, A + 6, -34), lean: -0.18, ff: [8, 0], bf: [-18, 0], stiff: 1 }), 'sp-water:jet'];
      if (sp.kind === 'boulder')                                           // Goliath: haul the boulder overhead, then heave it with both arms
        return T < sp.wind ? [pose({ fa: [A * 0.3, -92], ba: [-A * 0.3, -90], ff: [14, 0], bf: [-14, 0], sy: 0.92 + 0.08 * Math.min(1, T / sp.wind), hd: [0, 2] }), 'sp-boulder:lift']
                           : [pose({ fa: aim, ba: reach(dl, A + 4, -36), lean: 0.3, ff: [16, 0], bf: [-14, 0], stiff: 1 }), 'sp-boulder:heave'];
      if (sp.kind === 'disk')                                             // Pulse: one hand scratching the deck, then a frisbee flick off the turntable
        return T < sp.wind ? [pose({ fa: [A * 0.7 + Math.sin(T * 1.6) * 5, -34], ba: [-A * 0.2, -66], ff: [10, 0], bf: [-12, 0], lean: 0.05, hd: [2, 3] }), 'sp-disk:scratch']
                           : [pose({ fa: aim, ba: [-A * 0.2, -66], lean: 0.18, ff: [14, 0], bf: [-12, 0], stiff: 1 }), 'sp-disk:flick'];
      if (sp.kind === 'magma')                                             // Magma: scoop molten rock from the body, then an underarm lob
        return T < sp.wind ? [pose({ fa: [-A * 0.5, -10], ba: [A * 0.3, -24], sy: 0.88, sx: 1.06, lean: 0.2, ff: [14, 0], bf: [-14, 0], hd: [3, 4] }), 'sp-magma:scoop']
                           : [pose({ fa: [A + 10, -64], ba: [-A * 0.4, -22], lean: -0.12, ff: [12, 0], bf: [-14, 0], stiff: 1 }), 'sp-magma:lob'];
      return T < sp.wind ? [pose({ fa: [-A * 0.6, -70], ba: [A * 0.6, -36], lean: -0.22, bf: [-14, 0] }), 'sp-volley:wind']        // Vex: a sweeping fan throw
                         : [pose({ fa: aim, ba: [-A, -30], lean: 0.24, ff: [16, 0], stiff: 1 }), 'sp-volley:throw'];
    }
    case 'meditate': {                                                     // Zenith: lotus seat in mid-air, palms pressed — then both palms thrust out
      if (T < sp.wind + sp.active) { const b = Math.sin(t * 0.1) * 2;
        return [pose({ fa: [6, -40 + b], ba: [-2, -40 + b], ff: [14, -14], bf: [-14, -14], oy: -10 + b, sy: 0.92, hd: [0, -1] }), 'sp-meditate:lotus']; }
      return [pose({ fa: [A + 20, -40], ba: [-A - 20, -40], ff: [14, 0], bf: [-14, 0], sx: 1.1, stiff: 1 }), 'sp-meditate:palm-blast'];
    }
    case 'sink':                                                           // Umbra: melts down, then erupts from the floor with a rising claw
      if (sp.phase === 'up') return [pose({ fa: [A * 0.3, -104], ba: [-A * 0.6, -26], ff: [8, -12], bf: [-6, 4], sy: 1.15, sx: 0.88, hd: [0, -4], stiff: 1 }), 'sp-sink:erupt'];
      return [pose({ fa: [A * 0.6, -6], ba: [-A * 0.6, -6], ff: [14, 0], bf: [-14, 0], sy: 0.7, sx: 1.2, hd: [2, 8] }), 'sp-sink:melt'];
    case 'temper': {                                                       // Forge: hammer raised, then driven down into the core again and again
      const ph = Math.floor(T / 6) % 2;
      return ph ? [pose({ fa: [A + 14, -10], ba: [A * 0.4, -18], ff: [14, 0], bf: [-14, 0], lean: 0.25, sy: 0.9, stiff: 1 }), 'sp-temper:strike']
                : [pose({ fa: [A * 0.2, -92], ba: [A * 0.4, -40], ff: [14, 0], bf: [-14, 0], lean: -0.12, sy: 1.04 }), 'sp-temper:raise'];
    }
    case 'hook':                                                           // Strider: throwing arm out along the line; then hanging on with both hands while swinging
      if (sp.phase === 'pull') return [pose({ fa: reach(dl, A + 12, -46), ba: reach(dl, A + 4, -42), ff: [4, 6], bf: [-6, 2], lean: clamp(dl[0], -1, 1) * 0.3, sy: 1.08, stiff: 1 }), 'sp-hook:swing'];
      return [pose({ fa: reach(dl, A + 18, -40), ba: [-A, -30], ff: [12, 0], bf: [-14, 0], lean: 0.12, stiff: 1 }), 'sp-hook:throw'];
    case 'warcry': return T < sp.wind                                     // Valkyrie: spear drawn back and up, chest out... then the shout, spear thrust skyward
      ? [pose({ fa: [A * 0.4, -30], ba: [-A * 0.6, -40], sy: 0.9, lean: 0.1, ff: [12, 0], bf: [-14, 0], hd: [2, 3] }), 'sp-warcry:inhale']
      : [pose({ fa: [A * 0.3, -104], ba: [-A - 8, -44], sy: 1.08, lean: -0.15, ff: [14, 0], bf: [-16, 0], hd: [-1, -5], stiff: 1 }), 'sp-warcry:shout'];
    case 'flare': {                                                        // Sol: hands raised to cradle the growing sun, then flung wide as it detonates
      if (T < sp.wind) { const q = T / sp.wind, j = q > 0.7 ? Math.sin(T * 2.5) * 1.5 : 0;
        return [pose({ fa: [A * 0.45 + j, -84 + q * 6], ba: [-A * 0.45 - j, -82 + q * 6], sy: 1.02 - q * 0.08, ff: [12, 0], bf: [-12, 0], hd: [0, -3 + q * 3] }), 'sp-flare:gather']; }
      return [pose({ fa: [A + 22, -56], ba: [-A - 22, -56], ff: [16, 0], bf: [-16, 0], sx: 1.12, sy: 0.94, hd: [0, -2], stiff: 1 }), 'sp-flare:detonate'];
    }
    case 'star': return T < sp.wind                                        // Nova: arms raised, calling the star down
      ? [pose({ fa: [A * 0.5, -84], ba: [-A * 0.5, -82], sy: 1.06, hd: [0, -3], ff: [8, 0], bf: [-8, 0] }), 'sp-star:call']
      : [pose({ fa: [A + 8, -20], ba: [-A - 8, -22], sy: 0.94, hd: [0, 2] }), 'sp-star:release'];
    case 'laser': {                                                        // Lux: focus light in cupped hands, then the beam recoils the body
      const aim = reach(dl, A + 16, -40);
      if (T < sp.wind) { const q = T / sp.wind, j = q > 0.6 ? Math.sin(T * 2) * q : 0;
        return [pose({ fa: [aim[0] * 0.6 + j, aim[1] + j], ba: [aim[0] * 0.5, aim[1] + 6], sy: 0.94 - q * 0.04, lean: -0.05 * q, ff: [10, 0], bf: [-14, 0] }), 'sp-laser:focus']; }
      return [pose({ fa: aim, ba: reach(dl, A + 8, -36), lean: -0.2, ff: [8, 0], bf: [-18, 0], stiff: 1 }), 'sp-laser:fire'];
    }
    case 'counter':                                                        // Paladin: shield braced in front; on a counter, a forward strike
      if (sp.countered) return [pose({ fa: [A + 18, -44], ba: [A + 4, -36], lean: 0.3, ff: [20, 0], bf: [-14, 0], stiff: 1 }), 'sp-counter:strike'];
      return [pose({ fa: [A * 0.5, -30], ba: [A + 6, -42], sy: 0.9, sx: 1.06, lean: 0.06, ff: [12, 0], bf: [-14, 0] }), 'sp-counter:stance'];
    case 'tendril': return T < sp.wind                                     // Nyx: one hand clawed at the floor, then raised as the tendril erupts
      ? [pose({ fa: [A, -10], ba: [-A * 0.6, -40], sy: 0.86, lean: 0.2, hd: [2, 4] }), 'sp-tendril:summon']
      : [pose({ fa: [A + 4, -70], ba: [-A * 0.6, -36], sy: 1.04, lean: -0.05 }), 'sp-tendril:raise'];
    case 'missiles': {
      const kick = (T - D.wind) % D.gap < 2 && T >= D.wind ? 4 : 0;           // recoil on every launch
      return [pose({ fa: [A + 2 - kick, -62 + kick], ba: [A - 6 - kick, -70 + kick], lean: -0.1 - kick * 0.02, ff: [10, 0], bf: [-12, 0] }), 'sp-missiles'];
    }
    case 'rewind': return [pose({ fa: [4, -38], ba: [-2, -40], ff: [3, -4], bf: [-3, -4], hd: [0, 4], sy: 0.94 }), 'sp-rewind'];
    case 'flurry': {
      const k = T - D.wind, s = Math.sin(T * 1.3), q = clamp(k / (D.hits * D.every), 0, 1);
      if (k < 0) return [pose({ fa: [A * 0.3, -30], ba: [-A * 0.3, -32], sy: 0.9, lean: 0.12 }), 'sp-flurry:wind'];
      if (D.rise) return [pose({ fa: [A + 10, -40], ba: [-A - 10, -40], ff: [6, -6], bf: [-6, -6], spin: TAU * Math.round(D.hits / 2) * q, stiff: 1 }), 'sp-flurry:spin'];
      return [pose({ fa: [A + 8 + s * 10, -40 + s * 10], ba: [A + 2 - s * 10, -28 - s * 8], lean: 0.25, ff: [14, 0], bf: [-12, 0], stiff: 1 }), 'sp-flurry:claws'];
    }
  }
  return [pose({ fa: [A, -36], ba: [-A, -34] }), 'sp-cast'];
}

/* ------------------------------------------------------------------------------------------------
 * computePose(f): the full state → pose decision tree. Returns [pose, name].
 * ------------------------------------------------------------------------------------------------ */
/* ------------------------------------------------------------------------------------------------
 * ARCHETYPE STYLE: the same state looks different per fighter type. Applied on top of the base pose for idle,
 * walk, run, dash (and air poses for floaters); the pose name gets the archetype appended, e.g. 'idle:beast'.
 * ------------------------------------------------------------------------------------------------ */
const ARCH_LEAN = { heavy: 1.3, brute: 1.4, acrobat: 1.2, ninja: 1.15, float: 0.6, mage: 0.8, beast: 1.25 };
const ARCH_STYLED = ['idle', 'walk', 'run', 'dash'];
function archetypePose(f, P, name, A, t) {
  const arch = f.ch.arch, b = Math.sin(t * 0.08 + f.id * 2), ph = f.runPhase || 0;
  const floaty = arch === 'float' && (name === 'air:apex' || name === 'air:fall' || name === 'air:rise');
  if (!ARCH_STYLED.includes(name) && !floaty) return [P, name];
  const S = (o) => [pose(Object.assign({}, P, o)), name + ':' + arch];
  switch (arch) {
    case 'heavy':                                                       // slow, deep breathing; wide planted stance; arms hanging heavy
      if (name === 'idle') return S({ fa: [A + 6, -18 + b * 2], ba: [-A - 6, -17 - b * 2], ff: [15, 0], bf: [-15, 0], sy: 1 + b * 0.035, lean: 0.05, hd: [1, 2] });
      if (name === 'run') return S({ lean: 0.12, sy: 0.95 + Math.abs(Math.sin(ph)) * 0.06 });
      return S({ lean: P.lean * 0.7 });
    case 'brute':                                                       // hunched, knuckles nearly dragging, head jutting forward
      if (name === 'idle') return S({ fa: [A + 8, -8 + b * 2], ba: [-A - 2, -8 - b * 2], ff: [16, 0], bf: [-14, 0], lean: 0.2, sy: 0.94, hd: [5, 5] });
      return S({ lean: (P.lean || 0) + 0.15, fa: [P.fa[0] + 4, P.fa[1] + 10], ba: [P.ba[0], P.ba[1] + 10] });
    case 'acrobat': {                                                   // hyperactive: hopping on the spot, arms flung out
      if (name === 'idle') { const hop = Math.abs(Math.sin(t * 0.22 + f.id)); return S({ oy: -hop * 7, fa: [A + 8, -40 - hop * 8], ba: [-A - 8, -38 - hop * 6], ff: [4, -hop * 4], bf: [-4, -hop * 3], sy: 1 + (hop - 0.5) * 0.08 }); }
      if (name === 'run') return S({ lean: 0.42, fa: [-A - 4, -34], ba: [-A - 10, -38] });   // arms swept back
      return S({ lean: P.lean * 1.2 });
    }
    case 'float': {                                                     // hovers above the ground, legs dangling together, arms held out
      const hover = -10 + Math.sin(t * 0.07 + f.id) * 3;
      return S({ oy: name === 'idle' || name === 'walk' ? hover : P.oy, ff: [4, 6], bf: [-3, 8], fa: [A + 8, -36 + b * 3], ba: [-A - 8, -38 - b * 3], lean: name === 'run' || name === 'dash' ? 0.22 : 0.03 });
    }
    case 'mage':                                                        // one hand raised, a little spell glowing over the palm
      if (name === 'idle') return S({ fa: [A * 0.6, -50 + b * 2], ba: [-A * 0.7, -26], ff: [7, 0], bf: [-7, 0], hd: [0, -1] });
      return S({ fa: [P.fa[0] * 0.8, P.fa[1] - 8] });
    case 'ninja':                                                       // low, coiled stance; leading hand forward, the other tucked behind
      if (name === 'idle') return S({ fa: [A + 10, -34], ba: [-A - 4, -28], ff: [14, 0], bf: [-14, 0], sy: 0.9, oy: 3, lean: 0.1, hd: [2, 2] });
      if (name === 'run') return S({ fa: [-A - 6, -30], ba: [-A - 12, -34], lean: 0.48 });
      return S({ lean: P.lean * 1.15 });
    case 'knight':                                                      // upright guard: blade arm forward and up, shield arm across the chest
      if (name === 'idle') return S({ fa: [A + 4, -38 + b], ba: [A * 0.35, -34], ff: [13, 0], bf: [-11, 0], lean: -0.02 });
      return S({ ba: [A * 0.35, -34] });
    case 'brawler': {                                                   // boxer's guard, bouncing on the balls of the feet
      const bo = Math.sin(t * 0.3 + f.id);
      if (name === 'idle') return S({ fa: [A * 0.65, -46 + bo * 2], ba: [A * 0.25, -48 - bo * 2], ff: [12, -Math.max(0, bo) * 3], bf: [-12, -Math.max(0, -bo) * 3], oy: -Math.abs(bo) * 2, lean: 0.08 });
      return S({ fa: [P.fa[0], P.fa[1] - 10], ba: [P.ba[0], P.ba[1] - 10] });
    }
    case 'beast': {                                                     // on all fours: hands planted ahead, head low, gallops when running
      if (name === 'idle') return S({ fa: [A + 14, -2], ba: [A + 4, -3], ff: [-4, 0], bf: [-14, 0], lean: 0.62, sy: 0.86, hd: [9, 12] });
      const g = Math.sin(ph * 1.2);
      return S({ fa: [A + 14 + g * 10, -2 - Math.max(0, g) * 8], ba: [A + 4 - g * 10, -2 - Math.max(0, -g) * 8], ff: [-4 - g * 8, -Math.max(0, -g) * 6], bf: [-14 + g * 8, -Math.max(0, g) * 6], lean: 0.7, sy: 0.85, hd: [10, 12] });
    }
    case 'mutant':                                                      // lanky: long arms dangling and swaying
      if (name === 'idle') return S({ fa: [A + 12 + b * 4, -4], ba: [-A - 8 - b * 4, -6], lean: 0.1, hd: [2, 1] });
      return S({ fa: [P.fa[0] + 6, P.fa[1] + 8], ba: [P.ba[0] - 6, P.ba[1] + 8] });
    case 'skater': {                                                    // relaxed lean; runs are long gliding strides, pushing off to the side
      if (name === 'idle') return S({ ff: [12, 0], bf: [-6, 0], fa: [A, -30], ba: [-A + 4, -22], lean: -0.06, hd: [-1, 0] });
      const s = Math.sin(ph * 0.6);
      return S({ ff: [8 + s * 10, -Math.max(0, s) * 4], bf: [-8 - s * 12, -Math.max(0, -s) * 4], fa: [A + 6 - s * 8, -36], ba: [-A - 6 - s * 6, -34], lean: 0.28 });
    }
    case 'racer':                                                       // hands on hips, chest out; runs in an aerodynamic tuck
      if (name === 'idle') return S({ fa: [A * 0.45, -22], ba: [-A * 0.45, -22], ff: [10, 0], bf: [-10, 0], lean: -0.05, sx: 1.04, hd: [1, -1] });
      if (name === 'run' || name === 'dash') return S({ fa: [-A * 0.3, -26], ba: [-A - 6, -30], lean: 0.5 });
      return S({});
    case 'fighter':                                                     // martial-arts guard, knees bent
      if (name === 'idle') return S({ fa: [A + 4, -40], ba: [A * 0.3, -42], ff: [13, 0], bf: [-13, 0], sy: 0.95, oy: 1.5 });
      return S({});
  }
  return [P, name];
}

function computePose(f) {
  const [P, name] = basePose(f), A = f.ch.bw / 2 + 7;
  const [P2, name2] = archetypePose(f, P, name, A, G.time);
  return motionPose(f, P2, name2, name, A, G.time);                      // motion.js: the fighter's own gait / jump / air style
}

function basePose(f) {
  const c = f.ch, t = G.time, A = c.bw / 2 + 7, idle = Math.sin(t * 0.08 + f.id * 2), ph = f.runPhase || 0, spd = Math.abs(f.vx);
  const rest = pose({ fa: [A, -26 - idle * 1.5], ba: [-A, -24 + idle * 1.5] });
  const S = f.state;

  // ---- victory screen ----
  if (f.victory && S === 'free' && VICTORY_ANIM[c.id]) return [keyAnim(VICTORY_ANIM[c.id], t, A, f.id), 'victory:' + c.id];   // motion.js: every fighter's own victory
  if (f.defeat && DEFEAT_ANIM[c.id]) return [keyAnim(DEFEAT_ANIM[c.id], t, A, f.id + 50), 'defeat:' + c.id];                // ...and its own defeat
  if (f.victory && S === 'free') {
    const st = f.victoryStyle || 'fistpump';
    if (st === 'champagne') return [pose({ fa: [A * 0.9, -68 + idle * 2], ba: [-A * 0.6, -24], ff: [10, 0], bf: [-12, 0], lean: -0.14, hd: [1, -3] }), 'victory:champagne'];
    if (st === 'inferno') { const p = Math.sin(t * 0.12);
      return [pose({ fa: [A * 0.5, -92 + p * 3], ba: [-A * 0.5, -90 - p * 3], ff: [14, 0], bf: [-14, 0], sy: 1.05 + p * 0.02, hd: [0, -3] }), 'victory:inferno']; }
    if (st === 'bow') { const k = Math.min(1, ((t % 200) / 200) * 4) * (t % 200 < 120 ? 1 : 0);          // ninja / samurai: a deep, formal bow
      return [pose({ fa: [A * 0.3, -24 + k * 6], ba: [A * 0.1, -26 + k * 6], ff: [6, 0], bf: [-6, 0], lean: 0.75 * k, hd: [3 * k, 2 * k] }), 'victory:bow']; }
    if (st === 'cast') return [pose({ fa: [A * 0.7, -86 + idle * 3], ba: [-A * 0.7, -84 - idle * 3], ff: [8, 0], bf: [-8, 0], sy: 1.04, hd: [0, -3] }), 'victory:cast'];
    if (st === 'roar') { const r = Math.sin(t * 0.5) * 2;                                             // beasts and brutes: a hunched, shaking roar
      return [pose({ fa: [A + 10 + r, -30], ba: [-A - 10 - r, -30], ff: [16, 0], bf: [-16, 0], lean: 0.25, sy: 0.92, hd: [6 + r, 2] }), 'victory:roar']; }
    if (st === 'salute') return [pose({ fa: [A * 0.3, -96], ba: [A * 0.4, -34], ff: [12, 0], bf: [-10, 0], lean: -0.04, hd: [0, -2] }), 'victory:salute'];   // knights: blade raised
    if (st === 'hover') { const h = Math.sin(t * 0.05);                                               // floaters: rise and slowly turn
      return [pose({ fa: [A + 12, -44 + h * 4], ba: [-A - 12, -44 - h * 4], ff: [3, 6], bf: [-3, 8], oy: -18 + h * 6, spin: Math.sin(t * 0.02) * 0.3 }), 'victory:hover']; }
    if (st === 'skate') { const k = (t % 120) / 120;                                                  // skater: a one-foot spin
      return [pose({ fa: [A + 14, -44], ba: [-A - 14, -40], ff: [2, -16], bf: [-2, 0], lean: -0.1, spin: k < 0.5 ? TAU * smooth(k * 2) : 0 }), 'victory:skate-spin']; }
    if (st === 'glitch') { const h = n => (hash((t >> 2) * 5 + n) - 0.5) * 22;                        // Cipher: a stuttering glitch dance
      return [pose({ fa: [A + h(1), -50 + h(2)], ba: [-A + h(3), -44 + h(4)], ff: [8 + h(5) * 0.4, 0], bf: [-8 + h(6) * 0.4, 0], hd: [h(7) * 0.3, h(8) * 0.2] }), 'victory:glitch-dance']; }
    if (st === 'rev') { const v = Math.sin(t * 0.6) * 2;                                              // Dino (alternate): crouched, revving an imaginary wheel
      return [pose({ fa: [A * 0.8 + v, -32], ba: [A * 0.5 - v, -30], ff: [12, 0], bf: [-12, 0], sy: 0.86, lean: 0.2, hd: [3, 3 + v * 0.5] }), 'victory:rev']; }
    if (st === 'lotus') { const h = Math.sin(t * 0.05) * 4;                                         // Zenith: floating in the lotus seat, perfectly serene
      return [pose({ fa: [8, -38], ba: [-4, -38], ff: [14, -14], bf: [-14, -14], oy: -20 + h, sy: 0.92, hd: [0, -1] }), 'victory:lotus']; }
    if (st === 'howl') { const k = Math.min(1, (t % 160) / 40);                                        // Fang: rears back and howls at the sky
      return [pose({ fa: [A * 0.6, -50 - 20 * k], ba: [-A * 0.4, -36], ff: [14, 0], bf: [-12, 0], lean: -0.35 * k, hd: [-2 * k, -8 * k], sy: 1.04 }), 'victory:howl']; }
    if (st === 'pose') { const s = Math.floor(t / 40) % 3;                                            // Apex-X: snaps between precise robotic poses
      const P3 = [{ fa: [A + 16, -40], ba: [-A - 16, -40] }, { fa: [A * 0.4, -96], ba: [-A - 10, -30] }, { fa: [A * 0.5, -46], ba: [A * 0.5, -30] }][s];
      return [pose(Object.assign({ ff: [12, 0], bf: [-12, 0], stiff: 1 }, P3)), 'victory:pose']; }
    if (st === 'scratch') { const s = Math.sin(t * 0.5) * 6, nod = Math.abs(Math.sin(t * 0.16)) * 4;          // Pulse: one hand on the headphones, scratching, nodding to the beat
      return [pose({ fa: [A * 0.8 + s, -34], ba: [-A * 0.3, -70], ff: [12, -Math.max(0, Math.sin(t * 0.16)) * 4], bf: [-12, 0], lean: 0.08, hd: [2, 2 + nod], oy: -nod * 0.4 }), 'victory:scratch']; }
    if (st === 'ascend') { const h = Math.sin(t * 0.06);                                              // Valkyrie: hovering on spread wings, spear raised to the sky
      return [pose({ fa: [A * 0.3, -100], ba: [-A - 10, -46 + h * 2], ff: [4, 2], bf: [-4, 6], oy: -16 + h * 4, lean: -0.06, hd: [0, -3] }), 'victory:ascend']; }
    if (st === 'erupt') { const r = Math.sin(t * 0.2) * 2;                                            // Magma: fists hammered down, then arms flung up as the ground erupts
      const up = (t % 160) > 80;
      return up ? [pose({ fa: [A + 10, -88 + r], ba: [-A - 10, -86 - r], ff: [16, 0], bf: [-16, 0], sy: 1.06, hd: [0, -4] }), 'victory:erupt']
                : [pose({ fa: [A + 4, -2], ba: [-A - 4, -2], ff: [16, 0], bf: [-16, 0], sy: 0.86, sx: 1.1, lean: 0.3, hd: [4, 6] }), 'victory:erupt-slam']; }
    if (st === 'sunrise') { const k = Math.min(1, (t % 240) / 90);                                    // Sol: arms rising wide like the sun coming up
      return [pose({ fa: [A + 16 * k, -40 - 50 * k], ba: [-A - 16 * k, -40 - 50 * k], ff: [12, 0], bf: [-12, 0], sy: 1 + 0.05 * k, hd: [0, -3 * k] }), 'victory:sunrise']; }
    if (st === 'whirl') { const k = (t % 140) / 140;                                                  // Gale: a rising whirlwind spin
      return [pose({ fa: [A + 14, -60], ba: [-A - 14, -30], ff: [3, 4], bf: [-3, 8], oy: -14 - Math.sin(k * Math.PI) * 10, spin: TAU * 2 * smooth(k), hd: [0, -2] }), 'victory:whirl']; }
    if (st === 'drift') { const s = Math.sin(t * 0.09);                                               // Drift: a low skating crouch, one hand trailing the floor
      return [pose({ fa: [A * 0.4, -60], ba: [-A - 8, -4], ff: [16, 0], bf: [-14, -2], sy: 0.84, lean: 0.35 + s * 0.05, oy: 4, hd: [4, 3] }), 'victory:drift']; }
    if (st === 'spin') { const k = (t % 150) / 150;
      return [pose({ fa: [A + 10, -50], ba: [-A - 10, -50], ff: [6, -4], bf: [-8, 0], spin: k < 0.3 ? TAU * smooth(k / 0.3) : 0, hd: [0, -2] }), 'victory:spin']; }
    const flex = st === 'flex' ? Math.floor(t / 150) % 3 !== 2 : Math.floor(t / 150) % 3 === 2;      // mostly its signature move, now and then the other
    return flex ? [pose({ fa: [A + 6, -58], ba: [-A - 6, -58], ff: [12, 0], bf: [-12, 0], sx: 1.08, hd: [0, -2] }), 'victory:flex']
                : [pose({ fa: [A * 0.4, -92 + idle * 2], ba: [-A * 0.6, -24], ff: [10, 0], bf: [-12, 0], lean: -0.05, hd: [2, -2] }), 'victory:fist-pump'];
  }
  if (f.defeat) {                                                       // results screen: a defeat pose that suits the fighter's archetype
    const sw = Math.sin(t * 0.07), arch = c.arch;
    if (arch === 'heavy' || arch === 'brute' || arch === 'knight')        // big fighters drop to one knee, head bowed, fist on the floor
      return [pose({ fa: [A + 6, -4], ba: [-A * 0.4, -26], ff: [14, -2], bf: [-10, -12], oy: 10, lean: 0.35 + sw * 0.04, sy: 0.9, hd: [4, 6] }), 'defeat:kneel'];
    if (arch === 'acrobat' || arch === 'fighter' || arch === 'racer')     // light fighters are flat on their back, seeing stars
      return [pose({ fa: [10, -20 + sw * 3], ba: [-24, -26], ff: [26, -4], bf: [18, -2], lean: -1.45, oy: 18, sy: 0.96 }), 'defeat:flat'];
    if (arch === 'float' || arch === 'mage')                              // floaters and mages droop, sinking with arms limp
      return [pose({ fa: [A * 0.4, -6], ba: [-A * 0.4, -6], ff: [3, 4], bf: [-3, 6], oy: 8 + sw * 2, lean: 0.25, sy: 0.92, hd: [2, 6] }), 'defeat:slump'];
    return [pose({ fa: [-A, -8], ba: [-A - 4, -6], ff: [20, -3], bf: [12, -1], oy: 14, lean: -0.22 + sw * 0.12, sy: 0.92, hd: [sw * 5, 4 + Math.cos(t * 0.14) * 2] }), 'defeat:dizzy'];
  }
  if (S === 'ultimate') return ultPose(f, A, t);                       // render/ultfx.js: the fighter's own Ultimate choreography
  if (S === 'attack' && f.move) return attackPose(f, A, rest);
  if (S === 'special' && f.sp) return specialPose(f, A, t);

  // ---- defence & reactions ----
  if (f.parryFlash > 0 && S !== 'hitstun') return [pose({ fa: [A + 12, -42], ba: [A + 4, -30], ff: [14, 0], bf: [-12, 0], lean: 0.1, stiff: 1 }), 'parry'];
  if (S === 'shield') {
    if (f.shieldHit > 0) return [pose({ fa: [14, -36], ba: [8, -32], ff: [10, 0], bf: [-16, 0], lean: -0.16, sy: 0.92, hd: [-3, 2] }), 'shield:pushed'];
    if (f.shield < 35) return [pose({ fa: [10, -30], ba: [6, -28], ff: [12, 0], bf: [-12, 0], sy: 0.86, sx: 1.08, hd: [0, 4] }), 'shield:cracking'];
    return [pose({ fa: [19, -40], ba: [12, -34], ff: [13, 0], bf: [-13, 0], sy: 0.93, sx: 1.05 }), 'shield'];
  }
  if (S === 'stunned') {                                                // shield break: dizzy sway
    const sw = Math.sin(t * 0.09);
    return [pose({ fa: [A * 0.5, -10 + sw * 3], ba: [-A * 0.5, -12 - sw * 3], ff: [8, 0], bf: [-8, 0], lean: sw * 0.28, sy: 0.95, hd: [sw * 4, 3 + Math.cos(t * 0.18) * 2] }), 'stunned:dizzy'];
  }
  if (f.missT > 0 && f.onGround && (S === 'hitstun' || S === 'free' || S === 'lag')) {   // missed tech: knocked flat, then gets up
    if (f.missT > 12) return [pose({ fa: [10, -20], ba: [-24, -26], ff: [26, -4], bf: [18, -2], lean: -1.45, oy: 18, sy: 0.96 }), 'miss-tech:flat'];
    return [pose({ fa: [14, -6], ba: [-10, -18], ff: [10, 0], bf: [-12, -2], lean: 0.35, sy: 0.8, hd: [4, 6] }), 'miss-tech:getup'];
  }
  if (S === 'hitstun') {
    const v = Math.hypot(f.vx, f.vy), fl = Math.sin(t * 0.5), fl2 = Math.cos(t * 0.5);
    if (f.percent > 100 && v > 8) return [pose({ fa: [6, -40], ba: [-6, -38], ff: [8, -22], bf: [-8, -20], sy: 0.86 }), 'hit:spin-tumble'];
    if (v > 14) return [pose({ fa: [A + 10, -64], ba: [-A - 10, -64], ff: [14, 6], bf: [-14, 6], sx: 1.05 }), 'hit:launch'];
    if (v > 6) return [pose({ fa: [A + 4 + fl * 8, -60 + fl2 * 8], ba: [-A - 4 - fl * 8, -56 - fl2 * 6], ff: [13, -8 + fl * 4], bf: [-13, -10 + fl2 * 4], hd: [0, -4] }), 'hit:heavy-tumble'];
    return [pose({ fa: [A * 0.3, -62], ba: [-A, -56], ff: [10, -2], bf: [-12, -4], lean: -0.25, hd: [-4, -2] }), 'hit:flinch'];
  }
  if (S === 'grabbed') { const e = (f.escape || 0) > 30 ? rand(-2, 2) : 0;
    return [pose({ fa: [8 + e, -78], ba: [-8 - e, -74], ff: [4, 6], bf: [-4, 8], hd: [e, 3], sy: 1.08 }), 'grabbed:dangle']; }
  if (S === 'grab') {                                                   // (Toxin's arm stretches out across the long snare box, then snaps back)
    const ext = ((c.special.reach || 1) - 1) * GRAB_BOX.w * Math.sin(Math.PI * clamp(f.stateT / 16, 0, 1));
    return [pose({ fa: [A + 10 + ext, -36], ba: [A + 4, -38], ff: [12, 0], bf: [-14, 0], lean: 0.2, stiff: 1 }), ext > 1 ? 'grab:stretch' : 'grab:reach'];
  }
  if (S === 'holding') return [pose({ fa: [A + 12, -40], ba: [A + 4, -34], ff: [14, 0], bf: [-16, 0], lean: -0.06 }), 'grab:hold'];
  if (S === 'lag') {
    if (f.reelT > 0) return [pose({ fa: [-A * 0.4, -60], ba: [-A - 8, -50], ff: [6, 0], bf: [-14, 0], lean: -0.32, hd: [-4, -1] }), 'lag:parried-reel'];
    if (f.lagT > 10) return [pose({ fa: [A + 4, -12], ba: [-A - 4, -12], ff: [16, 0], bf: [-16, 0], sy: 0.76, sx: 1.16, hd: [0, 6] }), 'lag:impact-crouch'];
    return [pose({ fa: [A * 0.7, -22], ba: [-A * 0.7, -20], hd: [1, 2], sy: 0.96 }), 'lag:recover'];
  }
  if (S === 'roll') {
    if (f.rollTech) return [pose({ fa: [6, -24], ba: [-6, -22], ff: [6, -10], bf: [-6, -10], sy: 0.72, sx: 1.1 }), 'tech-roll'];
    return [pose({ fa: [6, -38], ba: [-6, -36], ff: [6, -12], bf: [-6, -12], sy: 0.82 }), 'dodge-roll'];
  }
  if (f.techPoseT > 0 && f.onGround) return [pose({ fa: [A, -6], ba: [-A, -30], ff: [14, 0], bf: [-10, -2], sy: 0.8, lean: 0.12, hd: [3, 4] }), 'tech:recover'];

  // ---- ledges & walls ----
  if (S === 'ledge') {
    const sw = Math.sin(t * 0.06) * 3;
    if (f.ledgeT < 8) return [pose({ fa: [6, -84], ba: [-6, -84], ff: [14 + sw, -8], bf: [6, -4], sy: 1.12 }), 'ledge:snap'];
    return [pose({ fa: [6, -82], ba: [-6, -82], ff: [4 + sw, 4], bf: [-4 + sw, 6], sy: 1.05 }), 'ledge:hang'];
  }
  if (S === 'climb' && f.climbRoll) {                                    // ledge roll: pull up, then a tucked forward roll
    const p = f.stateT / 28;
    if (p < 0.4) return [pose({ fa: [8, -62], ba: [-4, -60], ff: [10, -30], bf: [-2, -10], sy: 0.94 }), 'ledge:pull-up'];
    return [pose({ fa: [6, -30], ba: [-6, -28], ff: [6, -14], bf: [-6, -14], sy: 0.78, spin: TAU * smooth((p - 0.4) / 0.6) }), 'ledge:roll'];
  }
  if (S === 'climb') {
    const p = f.stateT / 20;
    if (p < 0.4) return [pose({ fa: [8, -62], ba: [-4, -60], ff: [10, -30], bf: [-2, -10], sy: 0.94 }), 'ledge:pull-up'];
    if (p < 0.75) return [pose({ fa: [12, -36], ba: [4, -34], ff: [16, -34], bf: [-6, -6], lean: 0.2 }), 'ledge:knee-up'];
    return [pose({ fa: [A, -30], ba: [-A, -28], ff: [10, 0], bf: [-6, -6], lean: 0.1 }), 'ledge:stand'];
  }
  if (S === 'wall') {
    if (f.stateT > 90) return [pose({ fa: [-A - 6, -70], ba: [-A - 8, -54], ff: [-12, -2], bf: [-13, -14] }), 'wall:slide'];
    return [pose({ fa: [-A - 6, -42], ba: [-A - 8, -60], ff: [-12, -4], bf: [-13, -18] }), 'wall:cling'];
  }

  // ---- misc ----
  if (S === 'respawn') return [pose({ fa: [6, -36], ba: [-2, -38], ff: [4, 0], bf: [-4, 0], hd: [0, -1] }), 'respawn:arms-crossed'];
  if (S === 'squat') return [pose({ fa: [A * 0.5, -10], ba: [-A * 0.5, -12], ff: [10, 0], bf: [-10, 0], sy: 0.78, sx: 1.18, hd: [0, 5] }), 'jump:squat'];

  // ---- free: ground locomotion ----
  if (f.onGround) {
    if (f.crawl) return [pose({ fa: [22 + Math.sin(ph) * 8, -4], ba: [8 + Math.sin(ph + Math.PI) * 8, -4], ff: [-4 + Math.sin(ph + Math.PI) * 6, 0], bf: [-14 + Math.sin(ph) * 6, 0] }), 'crawl'];
    if (f.landT > 0) return [pose({ fa: [A + 4, -14], ba: [-A - 4, -14], ff: [12, 0], bf: [-12, 0], sy: 0.84, sx: 1.12, hd: [0, 4] }), 'land'];
    if (f.turnT > 0) return [pose({ fa: [A, -50], ba: [-A * 0.3, -18], ff: [16, 0], bf: [-4, 0], lean: -0.32, hd: [-4, 0] }), 'skid-turn'];
    if (f.dashT > 0) return [pose({ fa: [-A * 0.5, -30], ba: [-A - 6, -36], ff: [16, -4], bf: [-18, -10], lean: 0.38, sx: 1.08, sy: 0.94 }), 'dash'];
    if (spd > c.walk * 1.05 || (f.runMode && spd > 2)) {
      const lean = Math.min(0.32, spd * 0.04);
      return [pose({ ff: [Math.sin(ph) * 14, -Math.max(0, Math.cos(ph)) * 8], bf: [Math.sin(ph + Math.PI) * 14, -Math.max(0, Math.cos(ph + Math.PI)) * 8],
                     fa: [Math.sin(ph + Math.PI) * 15 + 4, -30], ba: [Math.sin(ph) * 15 - 4, -30], lean }), 'run'];
    }
    if (spd > 1.2) return [pose({ ff: [Math.sin(ph) * 9, -Math.max(0, Math.cos(ph)) * 5], bf: [Math.sin(ph + Math.PI) * 9, -Math.max(0, Math.cos(ph + Math.PI)) * 5],
                                  fa: [A * 0.8 + Math.sin(ph + Math.PI) * 6, -26], ba: [-A * 0.8 + Math.sin(ph) * 6, -25], lean: 0.06 }), 'walk'];
    const cyc = (f.idleT || 0) % 480;
    if (cyc > 330) {                                                    // idle fidget: a big stretch every few seconds
      const k = Math.sin(Math.PI * (cyc - 330) / 150);
      return [pose({ fa: [A * 0.6, -26 - 44 * k], ba: [-A * 0.6, -24 - 44 * k], sy: 1 + 0.05 * k, hd: [0, -3 * k] }), 'idle:stretch'];
    }
    if (f.percent > 100) {                                               // battered: hunched, panting
      const pant = Math.sin(t * 0.2);
      return [pose({ fa: [A * 0.7, -16 + pant], ba: [-A * 0.6, -18 + pant], lean: 0.12, sy: 0.95 + pant * 0.015, hd: [2, 3] }), 'idle:battered'];
    }
    return [rest, 'idle'];
  }

  // ---- free: airborne ----
  if (f.flipT > 0) {                                                    // mid-air jump: tucked forward somersault
    const k = 1 - f.flipT / 20;
    return [pose({ fa: [10, -30], ba: [-10, -28], ff: [6, -24], bf: [-6, -22], sy: 0.9, spin: TAU * smooth(k) }), 'air:jump-flip'];
  }
  if (f.wallKickT > 0) return [pose({ bf: [-24, -16], ff: [8, -22], fa: [A + 4, -58], ba: [A * 0.3, -50], lean: 0.2 }), 'air:wall-jump-kick'];
  if (f.helpless) return [pose({ fa: [A * 0.5, -70], ba: [-A * 0.5, -66], ff: [6, 2], bf: [-6, 4], lean: Math.sin(t * 0.05) * 0.2, hd: [0, 2] }), 'air:helpless'];
  if (f.jetT > 0) return [pose({ fa: [-A * 0.4, -18], ba: [-A * 0.8, -20], ff: [2, 4], bf: [-4, 3], lean: 0.15 }), 'air:jetpack'];
  if (f.hoverOn > 0) return [pose({ fa: [A + 16, -46], ba: [-A - 16, -46], ff: [4, 2], bf: [-4, 1], hd: [0, Math.sin(t * 0.1)] }), 'air:hover'];
  if (f.vy >= PHYS.fastFall - 0.5) return [pose({ fa: [6, -86], ba: [-6, -84], ff: [3, 4], bf: [-3, 4], sy: 1.12, sx: 0.9 }), 'air:fast-fall'];
  if (f.vy < -5) return [pose({ fa: [A + 4, -50], ba: [-A - 6, -36], ff: [9, -10], bf: [-7, -4], sy: 1.04 }), 'air:rise'];
  if (f.vy > 3) { const w = Math.sin(t * 0.3) * 4;
    return [pose({ fa: [A + 6, -56 + w], ba: [-A - 8, -54 - w], ff: [12, -2], bf: [-7, -2] }), 'air:fall']; }
  return [pose({ fa: [A + 10, -44], ba: [-A - 10, -42], ff: [10, -6], bf: [-8, -8] }), 'air:apex'];
}

// Every named pose the rig can show, for reference / testing (attack poses × their phases + all the others)
const RIG_POSES = [].concat(
  ...Object.keys(RIG_BUILD).map(a => ARCH_STYLED.map(n => n + ':' + a).concat(a === 'float' ? ['air:apex:float', 'air:fall:float', 'air:rise:float'] : [])),
  ...Object.keys(ATTACK_POSES).map(k => [k + ':wind', k + ':strike', k + ':recover'].concat(MOVES[k] && MOVES[k].charge ? [k + ':charge'] : [])),
  ['sp-turbo:rev', 'sp-turbo:launch', 'sp-up:inferno-gather', 'sp-up:inferno-rise', 'sp-up:rocket-ignite', 'sp-up:rocket-thrust', 'sp-up:thunder-coil', 'sp-up:thunder-burst', 'sp-burst:wind', 'sp-burst:uppercut', 'sp-burst:dash', 'sp-orb:cast', 'sp-orb:release', 'sp-tele:vanish', 'sp-tele:strike', 'sp-blink',
   'sp-dive:rise', 'sp-dive:hang', 'sp-dive:kick', 'sp-phase:wind', 'sp-phase:dash', 'sp-phase:strike', 'sp-glitch', 'sp-stomp:lift', 'sp-stomp:slam',
   'sp-stomp:hang', 'sp-stomp:plunge', 'sp-missiles', 'sp-arrow:draw', 'sp-arrow:loose', 'sp-water:charge', 'sp-water:jet', 'sp-volley:wind', 'sp-volley:throw',
   'sp-star:call', 'sp-star:release', 'sp-laser:focus', 'sp-laser:fire', 'sp-counter:stance', 'sp-counter:strike', 'sp-tendril:summon', 'sp-tendril:raise',
   'sp-rewind', 'sp-flurry:wind', 'sp-flurry:spin', 'sp-flurry:claws', 'sp-cast',
   'sp-disk:scratch', 'sp-disk:flick', 'sp-magma:scoop', 'sp-magma:lob', 'sp-warcry:inhale', 'sp-warcry:shout', 'sp-flare:gather', 'sp-flare:detonate',
   'sp-boulder:lift', 'sp-boulder:heave', 'sp-meditate:lotus', 'sp-meditate:palm-blast', 'sp-sink:melt', 'sp-sink:erupt', 'sp-temper:raise', 'sp-temper:strike', 'sp-hook:throw', 'sp-hook:swing'],
  ['victory:lotus', 'victory:howl', 'victory:pose', 'victory:scratch', 'victory:ascend', 'victory:erupt', 'victory:erupt-slam', 'victory:sunrise', 'victory:whirl', 'victory:drift',
   'victory:bow', 'victory:cast', 'victory:roar', 'victory:salute', 'victory:hover', 'victory:skate-spin', 'victory:glitch-dance', 'victory:rev',
   'defeat:kneel', 'defeat:flat', 'defeat:slump',
   'victory:champagne', 'victory:inferno', 'victory:spin', 'defeat:dizzy', 'victory:flex', 'victory:fist-pump', 'parry', 'shield', 'shield:pushed', 'shield:cracking', 'stunned:dizzy', 'miss-tech:flat', 'miss-tech:getup',
   'hit:spin-tumble', 'hit:launch', 'hit:heavy-tumble', 'hit:flinch', 'grabbed:dangle', 'grab:reach', 'grab:stretch', 'grab:hold', 'lag:parried-reel', 'lag:impact-crouch',
   'lag:recover', 'tech-roll', 'dodge-roll', 'tech:recover', 'ledge:snap', 'ledge:hang', 'ledge:pull-up', 'ledge:knee-up', 'ledge:roll', 'ledge:stand', 'wall:slide',
   'wall:cling', 'respawn:arms-crossed', 'jump:squat', 'crawl', 'land', 'skid-turn', 'dash', 'run', 'walk', 'idle:stretch', 'idle:battered', 'idle',
   'air:jump-flip', 'air:wall-jump-kick', 'air:helpless', 'air:jetpack', 'air:hover', 'air:fast-fall', 'air:rise', 'air:fall', 'air:apex']);
