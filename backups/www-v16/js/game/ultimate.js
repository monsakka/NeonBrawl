/* NEON BRAWL — Ultimate attacks: the gameplay side (data in data/ultimates.js, visuals in render/ultfx.js).
 *
 * Timeline of an Ultimate:
 *   intro   ULT_INTRO frames of world freeze (step.js runs only ultIntroStep): the camera pushes in, the stage goes
 *           dark and the fighter powers up. Nothing else moves, so the move can't be interrupted.
 *   active  the family's own approach (dash, beam, dive, shockwave, strikes, vortex, uppercut, summon, time stop,
 *           F1 laps). The fighter can't be hit. If it misses, it ends in ULT_WHIFF frames of punishable lag.
 *   cine    on contact the victim is held (ultHeld) while the flurry lands `hits` times, then the final blow
 *           launches them with the Ultimate's own knockback.
 *   recover a short landing / pose, then back to normal play.
 * Everything here runs inside the deterministic 60 Hz step (it uses the shared seeded RNG online).            */
'use strict';

const ULT_MAX = 100, ULT_INTRO = 46, ULT_CINE = 74, ULT_RECOVER = 22, ULT_WHIFF = 34;
const ultOf = f => ULTS[f.ch.id] || ULTS.velocity;
const ultLog = (f, r) => logHitbox(r, f, 'ult');

/* ---- the meter: earned strictly in active combat. It NEVER fills passively (no trickle, no damage-taken bonus):
 *   · every punch / kick / smash you LAND fills a little (ULT_EARN.hit) — projectiles, hazards and blocked hits don't
 *   · stringing it into a combo pays more for every extra hit (+comboStep per hit, capped at comboCap per hit)
 * A full bar takes roughly 25–35 landed hits, or a handful of good combo strings.                              ---- */
const ULT_EARN = { hit: 1.8, comboStep: 1, comboCap: 7 };
function ultGain(f, amt, label) {
  if (!f || f.isHazard || !(amt > 0) || f.state === 'ultimate' || G.mode !== 'play') return;
  const was = f.ult || 0;
  f.ult = Math.min(ULT_MAX, was + amt);
  if (label && was < ULT_MAX) textFx(label + ' +ULT', f.x, f.y - 140, '#ff7ae6');
  if (was < ULT_MAX && f.ult >= ULT_MAX) {
    textFx('ULTIMATE READY', f.x, f.y - 120, f.color); ring(f.x, f.y - 32, f.color, 10, 6, 18, 4); ring(f.x, f.y - 32, '#ffffff', 6, 4, 14, 2);
    gameEvent('ultReady', { f });
  }
}
// a melee hit landed (att.cmbN = its place in the combo string; m = the move — projectiles don't charge the meter)
function ultHitGain(att, m) {
  if (!att || att.isHazard || (m && m.proj)) return;
  const k = att.cmbN || 1, E = ULT_EARN;
  ultGain(att, Math.min(E.comboCap, E.hit + (k - 1) * E.comboStep) * (G.party && G.party.ult ? G.party.ult : 1), k >= 5 && k % 5 === 0 ? k + ' HIT COMBO' : null);   // (Mega Mayhem: ×3)
}
// Where an Ultimate can be fired from: standing / running / airborne, the jump squat, behind a shield, and the end-lag of
// an attack (a "super cancel"). The button is buffered for ULT_BUFFER frames, so a press during an attack, a landing or
// a hit-stop fires the moment it becomes possible instead of being lost.
const ULT_FROM = new Set(['free', 'squat', 'shield']), ULT_BUFFER = 24;
const ultCanStart = f => (f.ult || 0) >= ULT_MAX && G.mode === 'play' && !G.ultCine && !f.helpless && !(f.rootT > 0) &&
  (ULT_FROM.has(f.state) || (f.state === 'attack' && !!f.move && f.stateT >= f.move.s + f.move.a));
// Called every step from updateFighter with this step's input
function ultInput(f, o, inp) {
  if (inp.ultP) {
    f.buf.ultP = ULT_BUFFER;
    if ((f.ult || 0) < ULT_MAX && !f.cpu && !(f.ultDenyT > 0)) {                               // not charged yet: say so, instead of silently ignoring it
      f.ultDenyT = 40; textFx('ULT ' + Math.floor(f.ult || 0) + '%', f.x, f.y - 120, '#b48ac8'); gameEvent('ultDeny', { f });
    }
  } else if (f.buf.ultP > 0) f.buf.ultP--;
  if (f.ultDenyT > 0) f.ultDenyT--;
  if (f.buf.ultP > 0 && ultCanStart(f)) { f.buf.ultP = 0; startUltimate(f, o); return true; }
  if ((f.ult || 0) < ULT_MAX) f.buf.ultP = 0;                                                   // (a press while uncharged doesn't wait for the meter)
  return false;
}

/* ---- start: the cinematic freeze ---- */
function startUltimate(f, o) {
  const U = ultOf(f);
  f.ult = 0; f.state = 'ultimate'; f.stateT = 0; f.ultPh = 'intro'; f.ultT = 0; f.ultN = 0; f.ultVic = -1;
  f.move = null; f.sp = null; f.charging = false; f.chargeDone = true; f.combo = 0; f.vx = 0; f.vy = 0; f.dashT = 0; f.hoverOn = 0; f.jetT = 0; f.turnT = 0;
  if (o && o.state !== 'dead' && o.state !== 'respawn') f.facing = sign(o.x - f.x) || f.facing;   // Ultimates always face the opponent
  f.ultX = f.x; f.ultY = f.y; f.ultTx = o ? o.x : f.x; f.ultTy = o ? o.y : f.y; f.ultS = -1; f.ultLand = -1; f.ultRise = false;
  f.ultBeam = null; f.ultQuake = null; f.ultStorm = null; f.ultV = null; f.ultSum = null; f.ultCar = false;
  G.ultCine = { id: f.id, vic: -1, t: 0, ph: 'intro', fam: U.fam, name: U.name };
  G.ultFreeze = ULT_INTRO;
  ring(f.x, f.y - 34, '#ffffff', 14, 12, 22, 6); ring(f.x, f.y - 34, f.color, 10, 8, 28, 5); starFx(f.x, f.y - 34, f.color, 80);
  burst(f.x, f.y - 34, f.color, 24, 10, 26); burst(f.x, f.y - 34, '#ffffff', 12, 7, 20);
  G.flash = Math.max(G.flash, 0.55); G.shake = Math.max(G.shake, 7);
  gameEvent('ult', { f, phase: 'start', name: U.name });
}

// One frozen step of the intro (step.js calls this instead of simulating the world)
function ultIntroStep() {
  const C = G.ultCine, f = C && fighters[C.id];
  if (!f || f.state !== 'ultimate') { G.ultFreeze = 0; G.ultCine = null; return; }
  C.t++; f.ultT++; f.stateT++;
  const col = f.color, k = f.ultT;
  if (k % 3 === 0) { const a = hash(k * 1.7 + f.id) * TAU, r = 30 + hash(k * 3.1) * 30;   // energy motes rising out of the aura
    pushFx({ type: 'dot', x: f.x + Math.cos(a) * r, y: f.y - 8 - hash(k * 2.3) * 20, vx: 0, vy: -3 - hash(k) * 3, life: 26, max: 26, color: k % 6 ? col : '#ffffff', size: 3, drag: 0.98, g: -0.05 }); }
  if (k % 11 === 0) ring(f.x, f.y - 34, k % 22 ? col : '#ffffff', 60, -2, 20, 3);                 // rings collapsing inward: gathering power
  if (k === 18) G.shake = Math.max(G.shake, 4);
  if (G.ultFreeze <= 0) {                                                                     // ...release!
    f.ultPh = 'active'; f.ultT = 0; C.ph = 'active'; C.t = 0;
    ring(f.x, f.y - 34, '#ffffff', 20, 16, 18, 6); burst(f.x, f.y - 34, col, 20, 12, 20); G.flash = Math.max(G.flash, 0.4); G.shake = Math.max(G.shake, 8);
    gameEvent('ult', { f, phase: 'go' });
  }
}

/* ---- contact, flurry, finish ---- */
function ultTry(f, o, r) {
  ultLog(f, r);
  if (!canBeHit(o) || !overlap(r, bodyRect(o))) return false;
  ultConnect(f, o); return true;
}
function ultTryCircle(f, o, cx, cy, rad) {
  ultLog(f, { x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2 });
  if (!canBeHit(o) || !rectCircle(bodyRect(o), cx, cy, rad)) return false;
  ultConnect(f, o); return true;
}
function ultConnect(f, o) {
  releaseAll(o);
  Object.assign(o, { state: 'hitstun', stateT: 0, hitstun: 24, ultHeld: 3, vx: 0, vy: 0, move: null, sp: null, charging: false, rot: 0, hitFlash: 6, dashT: 0, techT: 0, frozenT: 0, lastHitBy: f, hurt: 14 });
  f.ultPh = 'cine'; f.ultT = 0; f.ultVic = o.id; f.ultN = 0; f.ultHx = o.x; f.ultHy = o.y; f.cmbN = 0;
  const C = G.ultCine; if (C) { C.ph = 'cine'; C.vic = o.id; C.t = 0; }
  G.hitstop = 8; G.flash = Math.max(G.flash, 0.45); G.shake = Math.max(G.shake, 10);
  impactFx(o.x, o.y - 32, 18, f.color);
  gameEvent('ult', { f, vic: o, phase: 'connect' });
}
function ultTick(f, v, U, P) {
  f.ultN++; f.cmbN = f.ultN;
  v.percent += P.dmg; v.percentPop = 14; v.hitFlash = 3; v.hurt = 10; v.sx = 1.16; v.sy = 0.86;
  if (f.st) { f.st.dmg += P.dmg; f.st.hits++; f.st.best = Math.max(f.st.best, f.ultN); }
  if (f.ultN >= 2) G.combo = { n: f.ultN, color: f.color, t: 80, side: f.id };
  const px = v.x + rand(-10, 10), py = v.y - 32 + rand(-14, 14);
  burst(px, py, '#ffffff', 6, 7, 12); burst(px, py, f.color, 8, 9, 16); ring(px, py, f.color, 6, 5, 12, 3);
  if (f.ultN % 3 === 0) starFx(px, py, f.color, 22);
  if (U.fam === 'storm' && P.style === 'bolt') boltFx(px, py, f.color);
  if (U.fam === 'rush' || U.fam === 'timestop') ghost(f);
  G.shake = Math.max(G.shake, 4);
  gameEvent('hit', { att: f, vic: v, m: { dmg: P.dmg, ult: true }, kb: 9, x: px, y: py, dir: f.facing });
}
function ultFinish(f, v, U, P) {
  const [dmg, base, scale, ang] = P.fin, dir = f.facing;
  v.ultHeld = 0; v.percent += dmg; v.percentPop = 14;
  const kb = knockbackOf({ base, scale }, v, 1);
  launch(v, kb, ang, dir);
  v.lastHitBy = f; v.hurt = 14;
  if (f.st) { f.st.dmg += dmg; f.st.hits++; f.st.best = Math.max(f.st.best, f.ultN + 1); }
  G.combo = { n: f.ultN + 1, color: f.color, t: 90, side: f.id };
  const px = v.x, py = v.y - 32;
  impactFx(px, py, kb, f.color); shockwave(px, py, v.vx, v.vy, f.color, kb);
  ring(px, py, '#ffffff', 16, 18, 26, 8); ring(px, py, f.color, 10, 12, 34, 6); starFx(px, py, '#ffffff', 90); burst(px, py, f.color, 30, 16, 30);
  G.hitstop = 14; G.shake = Math.max(G.shake, 16); G.flash = Math.max(G.flash, 0.7); G.shakeAng = Math.atan2(v.vy, v.vx);
  if (v === fighters[0]) G.vig = 0.8;
  gameEvent('hit', { att: f, vic: v, m: { dmg, heavy: true, ult: true }, kb, x: px, y: py, dir });
  gameEvent('ult', { f, vic: v, phase: 'finish', kb });
  f.ultPh = 'recover'; f.ultT = 0; f.ultCar = false; f.ultSum = null; f.ultBeam = null; f.ultV = null; f.ultStorm = null;
  const C = G.ultCine; if (C) { C.ph = 'finish'; C.t = 0; }
}
function ultWhiff(f) {
  f.state = 'lag'; f.lagT = ULT_WHIFF; f.ultPh = null; f.helpless = false; f.vx *= 0.3;
  f.ultBeam = null; f.ultQuake = null; f.ultStorm = null; f.ultV = null; f.ultSum = null; f.ultCar = false;
  textFx('MISSED', f.x, f.y - 110, '#9aa0c0');
  if (G.ultCine && G.ultCine.id === f.id) G.ultCine = null;
  gameEvent('ult', { f, phase: 'whiff' });
}
function ultEnd(f) {
  f.state = 'free'; f.ultPh = null; f.helpless = false; f.vx *= 0.3; f.invuln = Math.max(f.invuln, 8);
  f.ultBeam = null; f.ultQuake = null; f.ultStorm = null; f.ultV = null; f.ultSum = null; f.ultCar = false;
  if (G.ultCine && G.ultCine.id === f.id) G.ultCine = null;
}
// the platform (or the main stage) a grounded fighter stands on: [left, right]
function ultFloor(f) {
  if (f.ground === 'plat') { const p = PLATS.find(q => f.x >= q.x - HW && f.x <= q.x + q.w + HW && Math.abs(q.y - f.y) < 3); if (p) return [p.x + 16, p.x + p.w - 16]; }
  return [STAGE.x + 16, STAGE.x + STAGE.w - 16];
}

/* ---- each family's approach (active phase): returns { phys, grav } for updateFighter ---- */
const ULT_ACTIVE = {
  rush(f, o, U, P, t) {
    if (t <= 6) { f.vx = 0; f.vy = 0; if (t === 6) { dust(f.x, f.y, 6); ring(f.x - f.facing * 20, f.y - 34, f.color, 8, 7, 12, 4); } return { phys: false }; }
    let vx = f.facing * P.spd; const nx = f.x + vx;
    if (f.onGround) { const [l, r] = ultFloor(f); if (nx < l || nx > r) vx = 0; }                    // never dash off the edge
    else if (f.y > STAGE.y + 2 && nx > STAGE.x - HW && nx < STAGE.x + STAGE.w + HW) vx = 0;           // ...or into the side of the stage
    f.x += vx; f.vx = 0; f.vy = 0;
    if (t % 2 === 0) ghost(f); if (t % 3 === 0) speedLines(f);
    ultTry(f, o, { x: f.x + (f.facing > 0 ? -16 : -76), y: f.y - 74, w: 92, h: 80 });
    return { phys: false };
  },
  beam(f, o, U, P, t) {
    f.vx = 0; f.vy = 0;
    const y = f.y - 34, x0 = f.x + f.facing * 22;
    if (t < 12) { f.ultBeam = { x0, y, len: 0, h: P.h * (t / 12) * 0.4, k: t / 12 }; return { phys: f.onGround, grav: 0 }; }
    const len = P.len * Math.min(1, (t - 11) / 5);
    f.ultBeam = { x0, y, len, h: P.h, k: 1 };
    if (t % 4 === 0) { G.shake = Math.max(G.shake, 3); burst(x0, y, f.color, 3, 6, 10); }
    ultTry(f, o, { x: f.facing > 0 ? x0 : x0 - len, y: y - P.h / 2, w: len, h: P.h });
    return { phys: f.onGround, grav: 0 };
  },
  meteor(f, o, U, P, t) {
    const top = Math.max(BZ.t + 80, STAGE.y - 640), L = STAGE.x + 30, R = STAGE.x + STAGE.w - 30;
    if (t < 16) {                                                                                   // launch up past the top of the screen
      if (t === 1) { f.onGround = false; f.ground = null; dust(f.x, f.y, 10); ring(f.x, f.y, f.color, 10, 10, 16, 5); }
      f.y = lerp(f.ultY, top, smooth(t / 16)); f.vx = f.vy = 0;
      if (t % 2 === 0) ghost(f);
      return { phys: false };
    }
    if (t < 32) {                                                                                   // hang above the target, locking on
      if (canBeHit(o)) f.ultTx = approach(f.ultTx, clamp(o.x, L, R), 22);
      f.ultTx = clamp(f.ultTx, L, R); f.x = approach(f.x, f.ultTx, 40); f.y = top; f.vx = f.vy = 0;
      return { phys: false };
    }
    if (f.ultLand < 0) {                                                                            // the dive
      f.vx = 0; f.vy = 30;
      if (o.y > f.y + 40 && o.state !== 'dead') f.dropT = 2;                                        // punch straight through platforms above the target
      if (!f.onGround) { if (t % 2 === 0) ghost(f); ultTry(f, o, { x: f.x - 42, y: f.y - 84, w: 84, h: 96 }); }
      if (f.ultPh === 'active' && f.onGround) {                                                     // impact!
        f.ultLand = t; f.vy = 0; f.ultQuake = { x: f.x, y: f.y, R: P.r, t0: t };
        ring(f.x, f.y - 10, '#ffffff', 20, 16, 20, 7); ring(f.x, f.y - 10, f.color, 14, 12, 28, 6); dust(f.x, f.y, 16); shatter(f.x, f.y - 10, f.color, 26);
        G.shake = Math.max(G.shake, 14); G.flash = Math.max(G.flash, 0.3);
        gameEvent('land', { f, impact: 18 });
        ultTryCircle(f, o, f.x, f.y - 30, P.r);
      }
      return { phys: true, grav: 0, fall: 34 };
    }
    if (t - f.ultLand > 12) ultWhiff(f);
    return { phys: true };
  },
  quake(f, o, U, P, t) {
    if (f.ultS < 0) {
      if (!f.onGround) { f.vx = 0; f.vy = Math.max(f.vy, 22); return { phys: true, grav: 0, fall: 24 }; }   // airborne: drive down to the floor first
      f.vx = 0;
      if (t >= 8) { f.ultS = t; ring(f.x, f.y - 6, '#ffffff', 16, 14, 18, 6); dust(f.x, f.y, 14); G.shake = Math.max(G.shake, 12); gameEvent('land', { f, impact: 16 }); }
      return { phys: true };
    }
    const R = Math.min(P.len, (t - f.ultS) * 26);
    f.ultQuake = { x: f.x, y: f.y, R, t0: f.ultS };
    if (t % 3 === 0) { dust(f.x + R, f.y, 2); dust(f.x - R, f.y, 2); }
    ultTry(f, o, { x: f.x - R, y: f.y - 120, w: R * 2, h: 126 });
    return { phys: true };
  },
  storm(f, o, U, P, t) {
    f.vx = 0; f.vy = 0;
    if (t <= 22 && canBeHit(o)) { f.ultTx = approach(f.ultTx, o.x, 10); f.ultTy = approach(f.ultTy, o.y, 10); }
    f.ultStorm = { x: f.ultTx, y: f.ultTy, r: P.r, t, style: P.style };
    if (t > 22 && (t - 22) % 5 === 0) {
      const sx = f.ultTx + rand(-P.r * 0.55, P.r * 0.55), sy = f.ultTy - 32;
      f.ultStorm.strike = { x: sx, t };
      if (P.style === 'bolt') boltFx(sx, sy, f.color); else burst(sx, sy, f.color, 10, 8, 16);
      ring(sx, f.ultTy - 4, f.color, 10, 8, 14, 4); G.shake = Math.max(G.shake, 4);
      ultTryCircle(f, o, sx, sy, P.r * 0.6);
    }
    return { phys: f.onGround, grav: 0 };
  },
  vortex(f, o, U, P, t) {
    f.vx = 0; f.vy = 0;
    const cx = f.x + f.facing * 180, cy = f.y - 70;
    f.ultV = { x: cx, y: cy, r: P.r, t };
    if (t > 8 && canBeHit(o)) {
      const dx = cx - o.x, dy = cy - (o.y - 32), dd = Math.hypot(dx, dy) || 1;
      if (dd < P.r) { o.vx += dx / dd * P.pull; o.vy += dy / dd * P.pull * 0.6; if (G.frame % 4 === 0) speedLines(o); }
    }
    if (t % 4 === 0) { const a = t * 0.7; pushFx({ type: 'dot', x: cx + Math.cos(a) * P.r * 0.6, y: cy + Math.sin(a) * P.r * 0.3, vx: -Math.cos(a) * 6, vy: -Math.sin(a) * 3, life: 18, max: 18, color: f.color, size: 3, drag: 0.95, g: 0 }); }
    if (t > 8) ultTryCircle(f, o, cx, cy, 62);
    return { phys: f.onGround, grav: 0 };
  },
  uppercut(f, o, U, P, t) {
    if (t <= 6) { f.vx = 0; f.vy = 0; return { phys: f.onGround, grav: 0 }; }
    if (!f.ultRise) { f.ultRise = true; f.onGround = false; f.ground = null; f.y -= 1; f.ultY = f.y; ring(f.x, f.y, f.color, 10, 10, 16, 5); dust(f.x, f.y, 8); }
    const k = clamp((t - 6) / 18, 0, 1), top = Math.max(BZ.t + 160, f.ultY - P.h * 0.62);
    f.y = lerp(f.ultY, top, 1 - (1 - k) * (1 - k)); f.x += f.facing * 1.6 * (1 - k); f.vx = f.vy = 0;
    if (t % 2 === 0) ghost(f);
    ultTry(f, o, { x: f.x + (f.facing > 0 ? -18 : -58), y: f.y - 124, w: 76, h: 130 });
    return { phys: false };
  },
  summon(f, o, U, P, t) {
    if (t === 1) { f.ultSx = f.x - f.facing * 260; f.ultSy = f.y; }
    f.ultSx += f.facing * P.spd; f.vx = 0; f.vy = 0;
    f.ultSum = { x: f.ultSx, y: f.ultSy, dir: f.facing, beast: P.beast, t };
    if (t % 3 === 0) dust(f.ultSx - f.facing * 40, f.ultSy, 2);
    if (t % 6 === 0) G.shake = Math.max(G.shake, 3);
    if (t > 4) ultTry(f, o, { x: f.ultSx - 80, y: f.ultSy - 210, w: 160, h: 216 });
    return { phys: f.onGround, grav: 0 };
  },
  timestop(f, o, U, P, t) {
    f.vx = 0; f.vy = 0;
    if (t === 6 && canBeHit(o) && Math.hypot(o.x - f.x, o.y - f.y) < P.range) {
      const mid = STAGE.x + STAGE.w / 2, side = sign(mid - o.x) || -f.facing;                       // appear on the stage side, facing out
      burst(f.x, f.y - 32, f.color, 12, 8, 14); ghost(f);
      f.x = o.x + side * 56; f.y = o.y; f.facing = -side; f.onGround = o.onGround; f.ground = o.ground;
      burst(f.x, f.y - 32, '#ffffff', 12, 8, 14);
      ultConnect(f, o);
    }
    return { phys: false };
  },
  grandprix(f, o, U, P, t) {
    if (!f.onGround) { f.vx = 0; f.vy = Math.max(f.vy, 18); return { phys: true, grav: 0, fall: 20 }; }   // the car drops onto the track first
    f.ultCar = true;
    if (t < 10) { f.vx = 0; if (t % 2 === 0) pushFx({ type: 'cloud', x: f.x - f.facing * 50, y: f.y - 6, vx: -f.facing * 2, vy: -0.6, life: 30, max: 30, color: 'rgba(220,220,230,0.5)', size: 10, drag: 0.95, g: 0 }); return { phys: true }; }
    ultDrive(f, P.spd);
    ultTry(f, o, { x: f.x - 72, y: f.y - 96, w: 144, h: 98 });                                     // (car + driver: catches short hops too)
    return { phys: true };
  }
};
// Dino's car: flat out along the floor, handbrake-turning at each end of the track
function ultDrive(f, spd) {
  const [l, r] = ultFloor(f); let nx = f.x + f.facing * spd;
  if (nx > r || nx < l) { f.facing = -f.facing; f.ultLap = (f.ultLap || 0) + 1; nx = clamp(nx, l, r); dust(nx, f.y, 10); burst(nx, f.y - 10, '#ffffff', 8, 6, 14); G.shake = Math.max(G.shake, 4); }
  f.x = nx; f.vx = 0;
  if (G.frame % 2 === 0) pushFx({ type: 'cloud', x: f.x - f.facing * 56, y: f.y - 6, vx: -f.facing * 2, vy: -0.5, life: 28, max: 28, color: 'rgba(220,220,230,0.45)', size: 9, drag: 0.95, g: 0 });
  if (G.frame % 3 === 0) dashSparks(f);
}

/* ---- the cinematic hold: where the fighter and the victim are while the flurry lands ---- */
const ULT_HOLD = {
  rush(f, v, U, P, t) {
    const late = t > ULT_CINE - 12;
    if (late) { f.x += f.facing * 5; }                                                                // the finisher drives through
    v.x = f.x + f.facing * 46; v.y = f.y; if (t % 3 === 0) ghost(f);
    return { phys: false };
  },
  beam(f, v, U, P, t) {
    const y = f.y - 34, x0 = f.x + f.facing * 22;
    v.x += f.facing * 0.7; v.y = f.ultHy;
    f.ultBeam = { x0, y, len: Math.abs(v.x - x0) + 70, h: P.h * (1 + 0.08 * Math.sin(t * 0.8)), k: 1 };
    if (t % 4 === 0) burst(x0, y, f.color, 3, 6, 10);
    return { phys: f.onGround, grav: 0 };
  },
  meteor(f, v, U, P, t) {
    if (!f.onGround) { f.vy = 28; v.x = f.x + f.facing * 34; v.y = f.y + 4; return { phys: true, grav: 0, fall: 30 }; }   // caught mid-dive: drive them into the floor
    if (f.ultLand < 0) { f.ultLand = t; f.ultQuake = { x: f.x, y: f.y, R: P.r, t0: t }; ring(f.x, f.y - 10, '#ffffff', 20, 16, 20, 7); dust(f.x, f.y, 16); G.shake = Math.max(G.shake, 14); }
    v.x = f.x + f.facing * 34; v.y = f.y;
    return { phys: true };
  },
  quake(f, v, U, P, t) { v.x = f.ultHx; v.y = f.ultHy - Math.min(96, t * 2.2); f.ultQuake = { x: f.x, y: f.y, R: P.len, t0: f.ultS, pillar: { x: v.x, y: f.y, h: Math.min(96, t * 2.2) } }; return { phys: true }; },
  storm(f, v, U, P, t) {
    v.x = f.ultHx + rand(-2, 2); v.y = f.ultHy;
    f.ultStorm = { x: v.x, y: f.ultHy, r: P.r, t: t + 30, style: P.style, strike: t % 8 < 3 ? { x: v.x, t: t + 30 } : null };
    return { phys: f.onGround, grav: 0 };
  },
  vortex(f, v, U, P, t) {
    const V = f.ultV || { x: f.x + f.facing * 180, y: f.y - 70 }, a = t * 0.35;
    f.ultV = { x: V.x, y: V.y, r: P.r, t: t + 60 };
    v.x = V.x + Math.cos(a) * 26; v.y = V.y + 32 + Math.sin(a) * 14; v.rot = a;
    return { phys: f.onGround, grav: 0 };
  },
  uppercut(f, v, U, P, t) {
    const top = Math.max(BZ.t + 160, f.ultY - P.h * 0.62 - 30);                                     // (a gentle rise: the finisher, not the height, does the work)
    f.y = Math.max(top, f.y - 0.6); v.x = f.x + f.facing * 22; v.y = f.y - 86;
    return { phys: false };
  },
  summon(f, v, U, P, t) {
    f.ultSx += f.facing * 3; f.ultSum = { x: f.ultSx, y: f.ultSy, dir: f.facing, beast: P.beast, t: t + 60, held: true };
    v.x = f.ultSx + f.facing * 62; v.y = f.ultSy - 48;
    return { phys: f.onGround, grav: 0 };
  },
  timestop(f, v, U, P, t) {
    const every = Math.max(3, Math.floor(ULT_CINE * 0.78 / P.hits)), slot = Math.floor(t / every);
    const mid = STAGE.x + STAGE.w / 2, home = sign(mid - v.x) || 1;
    v.x = f.ultHx; v.y = f.ultHy;
    if (t > ULT_CINE - 10 || slot >= P.hits) { f.x = v.x + home * 56; f.y = v.y; f.facing = -home; }   // back to the stage side for the final cut
    else { const s = slot % 2 ? 1 : -1, hgt = (slot % 3) * 26; f.x = v.x + s * 58; f.y = v.y - hgt; f.facing = -s; }
    return { phys: false };
  },
  grandprix(f, v, U, P, t) {
    ultDrive(f, P.spd * 0.72);
    v.x = f.x + f.facing * 80; v.y = f.y - 6;
    return { phys: true };
  }
};

/* ---- the per-frame state (called from updateFighter's 'ultimate' case) ---- */
function ultUpdate(f, o) {
  const U = ultOf(f), P = U.p;
  f.stateT++; f.ultT++;
  const t = f.ultT;
  if (f.ultPh === 'intro') { f.vx = f.vy = 0; return { phys: false }; }                              // (the world is normally frozen here)
  if (f.ultPh === 'active') {
    if (G.ultCine && G.ultCine.id === f.id) G.ultCine.t = t;                                         // (drives the cut-in fade-out and the lights coming back up)
    const r = ULT_ACTIVE[U.fam](f, o, U, P, t);
    if (f.state === 'ultimate' && f.ultPh === 'active' && t >= ULT_FAMS[U.fam].dur) ultWhiff(f);
    return r;
  }
  if (f.ultPh === 'cine') {
    const v = fighters[f.ultVic];
    if (!v || v.state !== 'hitstun' || !(v.ultHeld > 0)) { ultEnd(f); return { phys: true }; }
    const r = ULT_HOLD[U.fam](f, v, U, P, t);
    v.vx = v.vy = 0; v.ultHeld = 3; v.hitstun = Math.max(v.hitstun, 20);
    if (G.ultCine) G.ultCine.t = t;
    const every = Math.max(3, Math.floor(ULT_CINE * 0.78 / P.hits));
    if (t % every === 0 && f.ultN < P.hits) ultTick(f, v, U, P);
    if (t >= ULT_CINE) ultFinish(f, v, U, P);
    return r;
  }
  // recover: land / hold the finale pose, then back to normal play
  f.vx *= 0.8;
  if (G.ultCine && G.ultCine.id === f.id) G.ultCine.t = t;
  if (t >= ULT_RECOVER) ultEnd(f);
  return { phys: true };
}

/* ---- CPU: when is the Ultimate worth firing? ---- */
function ultAIWants(f, o) {
  if (!canBeHit(o) || o.state === 'ledge' || (o.ultHeld > 0)) return false;
  const U = ultOf(f), P = U.p, dx = o.x - f.x, dy = o.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy);
  const onStage = o.x > STAGE.x + 20 && o.x < STAGE.x + STAGE.w - 20, meOn = f.x > STAGE.x && f.x < STAGE.x + STAGE.w;
  if (!meOn) return false;
  switch (U.fam) {
    case 'rush': return adx < P.spd * 22 && ady < 50;
    case 'beam': return adx < P.len * 0.9 && ady < P.h * 0.45 + 10;
    case 'meteor': return onStage && o.y > STAGE.y - 260;
    case 'quake': return f.onGround && o.onGround && adx < P.len * 0.85 && ady < 60;
    case 'storm': return Math.hypot(dx, dy) < 720 && Math.abs(o.vx) < 6;
    case 'vortex': return Math.abs(adx - 180) < P.r * 0.5 && Math.abs(dy) < 90;
    case 'uppercut': return adx < 64 && dy > -P.h * 0.8 && dy < 20;
    case 'summon': return ady < 90 && adx < 900;
    case 'timestop': return Math.hypot(dx, dy) < P.range * 0.9 && onStage;
    case 'grandprix': return onStage && o.y > STAGE.y - 90;
  }
  return false;
}
