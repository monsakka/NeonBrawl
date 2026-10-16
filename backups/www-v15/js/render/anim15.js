/* NEON BRAWL — v15 procedural animation layer (weight · anticipation · squash & stretch).
 *
 * Runs on top of motion.js: motionPose() is wrapped so every pose keeps its name (run:<id>, idle:<id>, air:<id>, jab:strike:<id>…)
 * and every fighter keeps its own style (arm carriage, air style, punch style), while the MOTION underneath is rebuilt:
 *
 *   walk / run   real foot planting: a stance phase that slides the planted foot back at ground speed and a swing phase on an
 *                eased arc (duty factor 0.6 walking → 0.36 sprinting) · walking rides an inverted pendulum (highest at mid-stance),
 *                running compresses at mid-stance and floats in the flight phase · an impact squash on every footfall and a
 *                push-off stretch · arms counter-swing with a per-fighter lag (follow-through) and trail the body's bob
 *                (overlapping action) · lean follows acceleration (drive forward on a start, rock back on a stop)
 *   idle         a slow weight shift between the feet, breathing in the chest, and every few seconds a "settle" dip + glance
 *   jump         a deeper anticipation crouch with the arms thrown back, a velocity stretch on the way up, an apex hang (tuck,
 *                round out), arms reaching up and legs extending on the fall, a landing squash scaled by mass
 *   punch        a coiled, squashed anticipation (lean back, sink) → an overshooting stretch on the strike (limbs re-solved so the
 *                fist / foot stays exactly on the real hitbox) → a damped settle in recovery
 *   ultimates    a long coil while powering up → an explosive release stretch → a pulse on every hit → a heavy settle
 *
 * Everything is a pure function of the fighter's state and G.time (deterministic; nothing here touches the simulation). Heavier
 * fighters (weight + body width) anticipate deeper, squash harder on impact and recover slower; every fighter id seeds its own
 * stride timing, arm lag, idle rhythm and stretch, so no two characters move alike.                                              */
'use strict';

const ANIM15 = {
  LEGGED: { stomp: 0.5, sprint: 0.8, march: 0.45, prowl: 0.4, swagger: 0.55, lope: 0.65, robot: 0.4, dance: 0.45, shuffle: 0.2, scuttle: 0.32,
            pugtrot: 0.75, waddle: 0.3, streak: 0.9, grind: 0.1, rock: 0.25, skate: 0.25 },                    // gait → swing-foot lift
  PENDULUM: new Set(['march', 'grind', 'rock', 'waddle', 'shuffle']),                                         // always "walk" mechanics
  seedOf(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; },
  per(f) {                                                                                                    // per-fighter personality (cached on the character)
    const c = f.ch; if (c._a15) return c._a15;
    const s = ANIM15.seedOf(c.id), s2 = ANIM15.seedOf(c.id + '#'), s3 = ANIM15.seedOf('@' + c.id);
    const mass = clamp(((c.weight || 1) - 0.8) / 0.5 * 0.6 + (c.bw - 28) / 24 * 0.4, 0, 1);
    return (c._a15 = { s, s2, s3, mass, lag: 0.12 + s * 0.3, liftK: 0.85 + s2 * 0.35, str: 0.8 + s3 * 0.5, idleW: 0.016 + s2 * 0.014, fidget: 240 + Math.floor(s3 * 180) });
  }
};
const easeBack15 = (k, o = 1.7) => { k = clamp(k, 0, 1) - 1; return 1 + k * k * ((o + 1) * k + o); };
const easeIn15 = k => { k = clamp(k, 0, 1); return k * k; };
// body space → the fighter's local space (the inverse of poses.js intoBody)
function fromBody(p, lean, sx, sy) { const rx = p[0] * sx, ry = p[1] * sy + 32, c = Math.cos(lean), s = Math.sin(lean); return [rx * c - ry * s, rx * s + ry * c - 32]; }
// re-express the limbs so they stay where they were in the world after lean / squash changed (fists stay on the hitbox, feet stay planted)
function keepLimbs(R, lean0, sx0, sy0) { for (const k of ['fa', 'ba', 'ff', 'bf']) R[k] = intoBody(fromBody(R[k], lean0, sx0, sy0), R.lean, R.sx, R.sy); }
// acceleration (facing-relative), smoothed once per sim frame
function accelOf(f) { const st = f._a15 || (f._a15 = { vx: f.vx, ax: 0, t: -1 });
  if (st.t !== G.time) { st.ax = lerp(st.ax, (f.vx - st.vx) * f.facing, 0.3); st.vx = f.vx; st.t = G.time; } return st.ax; }

function anim15(f, P, name, base, A, t) {
  const M = MOTION[f.ch.id]; if (!M || !P) return [P, name];
  const Q = ANIM15.per(f), R = Object.assign({}, P, { fa: P.fa.slice(), ba: P.ba.slice(), ff: P.ff.slice(), bf: P.bf.slice(), hd: (P.hd || [0, 0]).slice() });
  R.lean = R.lean || 0; R.oy = R.oy || 0; R.sx = R.sx || 1; R.sy = R.sy || 1; R.spin = R.spin || 0;
  const heavy = 1 + Q.mass * 0.6;

  // ---------------- ultimates ----------------
  if (f.state === 'ultimate') {
    const T = f.ultT || 0, ph = f.ultPh;
    if (ph === 'intro') { const k = easeIn15(T / (typeof ULT_INTRO === 'number' ? ULT_INTRO : 40)); R.sy *= 1 - 0.14 * k * heavy; R.sx *= 1 + 0.1 * k * heavy; R.oy += 4 * k; R.lean -= 0.1 * k; R.hd[1] += 2 * k; }
    else if (ph === 'active') { const r = T < 16 ? Math.sin(Math.PI * T / 16) * Math.exp(-T / 12) : 0; R.sy *= 1 + 0.26 * r * Q.str; R.sx *= 1 - 0.13 * r * Q.str; R.lean += 0.08 * r; }
    else if (ph === 'cine') { const p = Math.max(0, Math.sin(T * 0.55)); R.sy *= 1 - 0.04 * p; R.sx *= 1 + 0.035 * p; }
    else { const k = Math.exp(-T / 14) * Math.cos(T * 0.35); R.sy *= 1 - 0.06 * k * heavy; R.sx *= 1 + 0.045 * k * heavy; }
    return [R, name];
  }
  // ---------------- attacks (jabs and every other ground / air move) ----------------
  if (f.state === 'attack' && f.move) {
    const m = f.move, T = f.stateT, s = Math.max(1, m.s || 1), a = Math.max(1, m.a || 1), e = Math.max(1, m.e || 1), big = m.heavy ? 1.4 : 1;
    if (T < s) {                                                       // anticipation: coil back, sink, squash — deeper for heavy moves / heavy bodies
      const k = easeIn15(T / s) * big * heavy;
      R.lean -= 0.11 * k; R.sy *= 1 - 0.06 * k; R.sx *= 1 + 0.045 * k; R.oy += 2 * k; R.hd[1] += 1.4 * k;
    } else if (T < s + a) {                                            // the strike: an overshooting stretch toward the target
      const l0 = R.lean, x0 = R.sx, y0 = R.sy, u = (T - s) / Math.max(3, a), pk = (easeBack15(Math.min(1, u * 2.2), 2.4) - Math.min(1, u * 2.2) * 0.85) * big * Q.str;
      R.sx *= 1 + 0.11 * pk; R.sy *= 1 - 0.06 * pk; R.lean += 0.07 * pk;
      keepLimbs(R, l0, x0, y0);
    } else {                                                           // recovery: a damped settle (heavier = slower, bigger)
      const u = T - s - a, d = Math.exp(-u / (5 + Q.mass * 5)) * Math.cos(u * 0.45);
      R.sy *= 1 + 0.035 * d * big; R.sx *= 1 - 0.025 * d * big; R.lean += 0.03 * d;
    }
    return [R, name];
  }
  // ---------------- Dino Nuggi F1: seated in the car, hands on the wheel; the car pitches with acceleration and air ----------------
  if (f.car && (f.state === 'free' || f.state === 'squat') && !f.crawl) {
    const ax = accelOf(f), air = !f.onGround, sp = Math.min(1, Math.abs(f.vx) / 6), land = f.landT > 0 ? f.landT / 6 : 0, sq = f.state === 'squat';
    const wob = Math.sin(t * 0.6 + Q.s * 9) * sp * 1.5;                                                              // steering corrections at speed
    R.fa = [14 + wob, -34 + wob * 0.4]; R.ba = [10 - wob, -35 - wob * 0.4]; R.ff = [8, -12]; R.bf = [2, -12];
    R.lean = clamp(-ax * 0.22, -0.18, 0.18) + (air ? clamp(f.vy * 0.025, -0.22, 0.28) : 0) + (f.driftT > 0 ? 0.06 : 0);   // squat on the rear launching, dive under braking · nose up / down in the air
    R.oy = 10 + (f.onGround ? Math.sin(t * 1.7 + Q.s2 * 5) * 0.5 * sp : 0); R.spin = P.spin || 0;   // (seated low in the cockpit)
    R.sy = sq ? 0.82 : 1 - 0.2 * land * heavy + (air ? clamp(-f.vy * 0.012, -0.06, 0.12) : 0); R.sx = sq ? 1.14 : 1 + 0.16 * land * heavy - (air ? clamp(-f.vy * 0.008, -0.04, 0.08) : 0);
    R.hd = [2 + clamp(ax * 3, -3, 3), -2 + (sq ? 3 : 0)];
    return [R, name];
  }
  // ---------------- landing ----------------
  if (base === 'land' && f.landT > 0) {
    const k = f.landT / 6, d = 0.2 * heavy * (0.55 + 0.45 * k);
    R.sy = 1 - d; R.sx = 1 + d * 0.75; R.oy += 3 * k * heavy; R.fa[1] += 6 * k; R.ba[1] += 6 * k; R.hd[1] += 4 * k;
    return [R, name];
  }
  // ---------------- jump anticipation ----------------
  if (base === 'jump:squat') {
    const k = 0.6 + 0.4 * clamp((f.stateT || 0) / 3, 0, 1);
    R.sy = lerp(1, M.sq - 0.08 * heavy, k); R.sx = 2 - R.sy + 0.04; R.fa = [-A * 0.35, -6]; R.ba = [-A * 0.8, -8]; R.lean = 0.12 * k; R.hd[1] += 3 * k;
    return [R, name];
  }
  // ---------------- airborne ----------------
  if (name.startsWith('air:') && !name.startsWith('air:double') && f.state === 'free' && !f.onGround) {
    const vy = f.vy, rk = clamp(-vy / Math.max(6, f.ch.jump || 12), 0, 1), ak = clamp(1 - Math.abs(vy) / 2.5, 0, 1), fk = clamp(vy / 10, 0, 1);
    R.sy *= 1 + 0.15 * rk * Q.str - 0.03 * ak + 0.06 * fk; R.sx *= 1 - 0.08 * rk * Q.str + 0.04 * ak - 0.03 * fk;   // stretch up · round out at the apex · stretch into the fall
    R.fa[1] -= 6 * rk + 3 * ak + 10 * fk; R.ba[1] -= 4 * rk + 3 * ak + 8 * fk;                                       // arms lead the rise, float at the apex, reach up as it falls
    R.ff[1] += 4 * rk - 6 * ak + 5 * fk; R.bf[1] += 3 * rk - 5 * ak + 3 * fk;                                        // legs trail, tuck, then reach for the floor
    return [R, name];
  }
  // ---------------- locomotion ----------------
  if ((name.startsWith('run:') || name.startsWith('walk:')) && f.onGround) {
    const lift = ANIM15.LEGGED[M.g], ax = accelOf(f);
    if (lift === undefined) { R.lean += clamp(ax * 0.3, -0.2, 0.2); return [R, name]; }     // hover / slither / jelly… keep their own float, just drive into it
    const k = MOTION_GROUND[base] || (name.startsWith('walk:') ? 0.5 : 1), walk = k < 0.75 || ANIM15.PENDULUM.has(M.g);
    const D = M.g === 'grind' ? 0.7 : walk ? 0.6 : M.g === 'sprint' || M.g === 'streak' ? 0.36 : base === 'dash' ? 0.34 : 0.42;
    const ph = (f.runPhase || 0) * M.c + Q.s * TAU;
    let p = ((ph / TAU) % 1 + 1) % 1; if (M.g === 'robot') p = Math.round(p * 8) / 8;
    const Ls = M.s * k, Lf = Ls * lift * Q.liftK * (walk ? 0.7 : 1.15), B = M.b * k;
    const foot = u => {                                                  // u = this foot's cycle phase: [0, D) planted, [D, 1) swinging
      if (u < D) return [Ls * (1 - 2 * u / D), 0];
      const w = (u - D) / (1 - D), e = w * w * (3 - 2 * w);
      return [-Ls + 2 * Ls * e, -Lf * Math.pow(Math.sin(Math.PI * w), 0.8) - (w < 0.25 ? Lf * 0.25 * Math.sin(Math.PI * w / 0.25) : 0)];   // (a toe-off flick)
    };
    const F = foot(p), Bk = foot((p + 0.5) % 1);
    R.ff = [F[0] + 2, F[1]]; R.bf = [Bk[0] - 2, Bk[1]];
    const q = (p * 2) % 1, mid = Math.min(D, 0.5);                       // q: step phase (0 = a foot strikes)
    let oy;
    if (walk) oy = -B * 0.6 * Math.cos(TAU * (q - mid * 0.5));
    else { const sp = Math.min(0.95, 2 * D); oy = q < sp ? B * Math.sin(Math.PI * q / sp) : -B * 0.55 * Math.sin(Math.PI * (q - sp) / Math.max(0.05, 1 - sp)); }
    const imp = Math.exp(-q * 9), push = Math.exp(-(((q - Math.min(0.9, 2 * D * 0.92)) / 0.09) ** 2));
    const sq = (walk ? 0.03 : 0.08) * heavy * Q.str, st = (walk ? 0.012 : 0.06) * Q.str;
    R.sy *= (1 - sq * imp) * (1 + st * push); R.sx *= (1 + sq * 0.7 * imp) * (1 - st * 0.5 * push);
    R.oy += oy; R.hd[1] += -oy * 0.3 + imp * 2 * k * heavy; R.hd[0] += clamp(ax * 2, -3, 3);
    const arms = armCarriage(M, A, ph - Q.lag * TAU * 0.25, k, t);       // the arm swing lags the legs (follow-through)
    R.fa = [arms.fa[0], arms.fa[1] - oy * 0.35]; R.ba = [arms.ba[0], arms.ba[1] - oy * 0.35];   // and trails the bob
    R.lean += clamp(ax * 0.35, -0.22, 0.26) + imp * 0.03 * k;
    return [R, name];
  }
  // ---------------- idle ----------------
  if (name.startsWith('idle:') && f.onGround) {
    const ph = t * Q.idleW + Q.s * TAU, w = Math.sin(ph), br = Math.sin(t * 0.055 + Q.s2 * TAU), sh = w * 2.2 * (1 - Q.mass * 0.4);
    R.ff[0] -= sh; R.bf[0] -= sh; R.lean += w * 0.03 + clamp(accelOf(f) * 0.35, -0.22, 0.22); R.hd[0] += w * 1.2;        // weight shift (body over one foot, then the other)
    R.sy *= 1 + 0.018 * br; R.sx *= 1 - 0.01 * br; R.fa[1] += br * 1.2; R.ba[1] += br * 1.2;                           // breathing
    const tau = (t + Math.floor(Q.s3 * 997)) % Q.fidget;
    if (tau < 44) { const e = Math.sin(Math.PI * tau / 44) * Math.exp(-tau / 30);                                       // a settle: dip, re-plant, glance
      R.oy += 2.6 * e * heavy; R.sy *= 1 - 0.045 * e; R.sx *= 1 + 0.03 * e; R.hd[0] += 3.5 * Math.sin(Math.PI * tau / 22) * (Q.s2 > 0.5 ? 1 : -1); }
    return [R, name];
  }
  return [R, name];
}

// wrap motion.js's last pose layer (keeps all pose names)
const motionPose14 = motionPose;
motionPose = function (f, P, name, base, A, t) {
  const r = motionPose14(f, P, name, base, A, t);
  return SET.anim15 === false ? r : anim15(f, r[0], r[1], base, A, t);
};
