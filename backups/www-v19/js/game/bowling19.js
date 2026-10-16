/* NEON BRAWL — v19 minigame: BRAWLER BOWLING (Challenges → Minigames).
 *
 *   THE ALLEY   a long polished lane down the stage, gutters on both sides, a pin deck at the far end and the pit behind it.
 *               The lane has real depth: the ball and the ten giant neon pins live in 3D (x down the lane, z across it),
 *               and the camera rides higher than in a fight so the rack reads as a triangle.
 *   BOWLING     your ball waits on the rack in front of you while a glowing aim arrow sweeps across the lane. Launch it
 *               with an attack: HEAVY attacks and smashes send it thundering down the lane (charge a smash for even more),
 *               light attacks only nudge it. The arrow locks the moment you start your swing. Up-moves loft it (it bounces
 *               down the lane — or sails over the pins); drift too wide and it drops into the gutter.
 *   PHYSICS     a heavy ball (it barely slows when it hits a pin) and pins that are knocked along the contact normal, tip
 *               over toward where they're flying, slide, and knock over every pin their falling bodies sweep through —
 *               chain reactions decide the spares.
 *   THE MATCH   you and a CPU rival alternate frames: five frames, classic scoring (a strike adds the next two balls, a spare
 *               the next one; the fifth frame gets its bonus balls). Nobody can hurt anybody — every attack is for the ball.
 *               A clean strike drops the game into slow motion as the pins explode.                                  */
'use strict';

const BOWL = { N: 5, R: 40, GRAV: 0.55, LANE_W: 150, FOUL: 470, RACK: 420, STAND: 74, PIN_H: 120, PR: 18, PX: 1470, PD: 60, PS: 62, SWEEP_A: 0.11, AIM_T: 15 * 60 };
const BOWL_STAGE = { id: 'bowlalley', name: 'Neon Bowling Alley', tag: 'Minigame · Brawler Bowling', clean: true,
  desc: 'A midnight bowling alley: a polished lane, neon arches overhead and ten giant glowing pins at the end.',
  main: { x: 60, y: 520, w: 1640, h: 70 }, plats: [], bz: { l: -420, r: 2200, t: -520, b: 1000 }, spawns: [330, 150],
  pal: { fill: ['#2a1a3e', '#0c0816'], edge: '#ff4fd8', top: '#d8a868', plat: '#3dfff0', glow: '#ff4fd8', bz: 'rgba(255,79,216,0.3)' } };
Object.assign(THEME3D, { bowlalley: THEME3D.neon || 'city' }); Object.assign(LIGHT_RIG, { bowlalley: LIGHT_RIG.stadium || LIGHT_RIG.neon || 'strobe' });
Object.assign(WX_STAGE, { bowlalley: ['motes'] }); Object.assign(ATMO, { bowlalley: ['mote', 24, ['#ff4fd8', '#3dfff0', '#ffffff']] });
BACKGROUNDS.bowlalley = BACKGROUNDS.neon || BACKGROUNDS.stadium;
Object.assign(STAGE_MUSIC, { bowlalley: ['synthwave', 112, 52, 'dorian', 0.12, { name: 'Ten Pin Groove', snare: ['clap', [4, 12]] }] });
const laneEnd = () => STAGE.x + STAGE.w;
const bowlAim = t => Math.sin(t * 0.045) * BOWL.SWEEP_A;                         // the sweeping aim arrow (radians across the lane)

/* ---------------- the rack ---------------- */
function bowlRack() {
  const P = [];
  for (let k = 0; k < 4; k++) for (let j = 0; j <= k; j++) P.push({ n: P.length, x: BOWL.PX + k * BOWL.PD, z: (j - k / 2) * BOWL.PS, vx: 0, vz: 0, tilt: 0, tv: 0, dx: 1, dz: 0, st: 'up', drop: 0, wob: 0 });
  return P;
}
const pinsUp = B => B.pins.filter(p => p.st === 'up').length;

/* ---------------- start ---------------- */
function bowlStart() {
  CHAL.mode = 'bowl';
  withSel({ stage: BOWL_STAGE, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  for (const f of fighters) { f.stocks = 99; f.ult = 0; }
  G.bowl = { p: 0, frame: 0, ball: 0, rolls: [[], []], pins: bowlRack(), ph: 'ready', t: 0, phT: 0, key: 1, lockA: null, ball3: null, msg: '', msgT: 0, strikes: [0, 0], spares: [0, 0], gutters: [0, 0], best: 0, done: false, slowT: 0 };
  G.camLift = 0.45; G.endText = null;
  bowlBall(); bowlPlace();
}
// a fresh ball on the rack in front of the bowler
function bowlBall() { const B = G.bowl; B.ball3 = { x: BOWL.RACK, y: STAGE.y - BOWL.R, z: 0, vx: 0, vy: 0, vz: 0, live: false, gutter: false, drop: false, still: 0, hit: false, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], trail: [], tE: 0 }; B.lockA = null; B.firstHit = 0; B.key++; }
// the bowler steps up to the line, the other waits at the far end of the approach
function bowlPlace() {
  const B = G.bowl, a = fighters[B.p], o = fighters[1 - B.p];
  for (const [f, x] of [[a, BOWL.RACK - BOWL.STAND], [o, STAGE.x + 60]]) { if (f.state === 'dead' || f.state === 'respawn') continue;
    Object.assign(f, { x, y: STAGE.y, vx: 0, vy: 0, facing: 1, onGround: true, state: 'free', stateT: 0, move: null, sp: null, charging: false }); f.px = f.x; f.py = f.y; }
}
// which balls a frame allows: [needs another ball?, reset the full rack before it?]
function bowlNext(rolls, frame) {
  const fr = bowlFrameRolls(rolls, frame), last = frame === BOWL.N - 1;
  if (!last) return fr.length === 0 ? [true, true] : fr.length === 1 && fr[0] < 10 ? [true, false] : [false, false];
  if (fr.length < 2) return [true, fr.length === 0 || fr[0] === 10];
  if (fr.length === 2 && (fr[0] === 10 || fr[0] + fr[1] === 10)) return [true, fr[0] + fr[1] === 10 || fr[1] === 10 || fr[0] === 10 && fr[1] === 10];
  return [false, false];
}
// the rolls that belong to `frame` (each earlier frame: a strike = one ball, otherwise two)
function bowlFrameRolls(rolls, frame) { let i = 0; for (let f = 0; f < frame; f++) i += rolls[i] === 10 ? 1 : 2; return rolls.slice(i, frame === BOWL.N - 1 ? i + 3 : i + (rolls[i] === 10 ? 1 : 2)); }
/* classic scoring over N frames → { frames: [{ r: marks, pts, total }], score, done } (totals stay blank until every bonus ball is in) */
function bowlScore(rolls) {
  const N = BOWL.N, out = []; let i = 0, run = 0, ok = true;
  const mk = n => n === 0 ? '–' : n === 10 ? 'X' : String(n);
  for (let f = 0; f < N; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2], last = f === N - 1; let r = [], pts = null, used = 0;
    if (a === undefined) { out.push({ r, pts: null, total: null }); ok = false; continue; }
    if (!last) {
      if (a === 10) { r = ['X']; used = 1; if (b !== undefined && c !== undefined) pts = 10 + b + c; }
      else if (b === undefined) { r = [mk(a)]; used = 1; }
      else { r = [mk(a), a + b === 10 ? '/' : mk(b)]; used = 2; if (a + b < 10) pts = a + b; else if (c !== undefined) pts = 10 + c; }
    } else {
      r.push(mk(a)); if (b !== undefined) r.push(a === 10 ? mk(b) : a + b === 10 ? '/' : mk(b));
      if (c !== undefined) r.push(a === 10 && b !== 10 ? (b + c === 10 ? '/' : mk(c)) : mk(c));
      const need = a === 10 || (b !== undefined && a + b === 10) ? 3 : 2, have = [a, b, c].filter(v => v !== undefined).length;
      if (have >= need) pts = [a, b, c].slice(0, need).reduce((s, v) => s + v, 0); used = 3;
    }
    if (pts === null) ok = false; if (ok) run += pts;
    out.push({ r, pts, total: ok ? run : null }); i += used;
  }
  return { frames: out, score: run, done: ok };
}
const bowlTotal = rolls => { const S = bowlScore(rolls); return S.frames.reduce((s, f) => f.total !== null ? f.total : s, 0); };

/* ---------------- the step ---------------- */
function bowlStep() {
  const B = G.bowl; if (!B || B.done) return;
  const act = fighters[B.p], idle = fighters[1 - B.p], b = B.ball3;
  // the line: the bowler stays behind the foul line; the one waiting stays at the back
  const hw = fHW(act); if (act.x > BOWL.FOUL - hw) { act.x = BOWL.FOUL - hw; if (act.vx > 0) act.vx = 0; }
  if (idle.state !== 'dead' && idle.state !== 'respawn') { idle.x = STAGE.x + 60; idle.vx = 0; idle.facing = 1; }
  if (G.mode === 'count') return;
  B.t++; B.phT++; if (B.msgT > 0) B.msgT--;
  if (B.ph === 'ready') { if (B.phT > 70) bowlPhase('aim'); return; }
  if (B.ph === 'aim') {
    // the arrow locks as the swing starts; a whiff unlocks it again
    if (act.state === 'attack' || act.state === 'special') { if (B.lockA === null) B.lockA = bowlAim(B.phT); } else if (!b.live) B.lockA = null;
    for (const h of HITBOX_LOG) {
      if (h.owner !== act.id || h.kind === 'grab' || b.live) continue;
      if (!rectCircle(h, b.x, b.y, BOWL.R + 4)) continue;
      const m = h.mv || (act.state === 'attack' ? act.move : act.state === 'special' ? ((act.sp && act.sp.m) || act.ch.special) : null) || {};
      bowlLaunch(act, m);
    }
    for (const p of projs) if (!b.live && p.owner === act && p.life > 0 && Math.hypot(p.x - b.x, p.y - b.y) < BOWL.R + (p.r || 8)) { p.life = 0; bowlLaunch(act, { base: 4, dmg: p.dmg || 4, ang: 0 }); }
    if (!b.live && B.phT > BOWL.AIM_T) { textFx('TIME!', b.x, b.y - 90, '#ff4d6d'); bowlRecord(0, true); }
    G.camExtra = [{ x: b.x, y: b.y }, { x: BOWL.PX + 90, y: STAGE.y - 100 }];
    return;
  }
  if (B.ph === 'roll' || B.ph === 'settle') { bowlPhysics(); bowlPins(); G.camExtra = [{ x: Math.min(b.x, laneEnd()), y: b.y }, { x: BOWL.PX + 90, y: STAGE.y - 100 }]; }
  if (B.ph === 'roll') {
    const sp = Math.hypot(b.vx, b.vz); b.still = sp < 0.3 && !b.drop ? b.still + 1 : 0;
    if (b.gone || b.still > 40 || B.phT > 9 * 60) bowlPhase('settle');
  } else if (B.ph === 'settle') {
    const moving = B.pins.some(p => p.st === 'falling' || (p.st !== 'gone' && Math.hypot(p.vx, p.vz) > 0.25));
    if ((!moving && B.phT > 30) || B.phT > 140) { const down = B.pins.filter(p => p.wasUp && p.st !== 'up').length; bowlRecord(down, false); }
  } else if (B.ph === 'count') { if (B.phT > 95) bowlAdvance(); }
  else if (B.ph === 'sweep') {
    const k = B.phT / 50, bx = lerp(BOWL.PX - 60, laneEnd() + 40, k);
    for (const p of B.pins) if (p.st !== 'up' && p.st !== 'gone' && p.x < bx) { p.st = 'gone'; p.drop = 0; }
    if (B.phT > 55) { B.pins = B.pins.filter(p => p.st === 'up'); bowlBall(); bowlPlace(); bowlPhase('ready'); }
  }
}
function bowlPhase(ph) { const B = G.bowl; B.ph = ph; B.phT = 0; if (ph === 'aim') for (const p of B.pins) p.wasUp = p.st === 'up'; }
// the swing connects: power from the move, direction from the (locked) arrow
function bowlLaunch(F, m) {
  const B = G.bowl, b = B.ball3, heavy = !!(m.heavy || m.charged || (m.base || 0) >= 7);
  const power = (m.base || 5) * 0.9 + (m.dmg || 4) * 0.55 + (m.heavy ? 4 : 0) + (m.charged ? m.charged * 6 : 0);
  const speed = heavy ? clamp(9 + power * 0.95, 13, 30) : clamp(3.5 + power * 0.25, 4, 8), aim = B.lockA !== null ? B.lockA : bowlAim(B.phT), ang = m.ang === undefined ? 30 : m.ang;
  b.vx = Math.cos(aim) * speed; b.vz = Math.sin(aim) * speed; b.vy = 0;
  if (ang > 62) { b.vy = -speed * 0.55; b.vx *= 0.8; b.vz *= 0.8; }                          // an up-move lofts it
  else if (ang < -20) { b.vx *= 0.7; b.vz *= 0.7; b.vy = 4; }                                // a spike slams it into the lane
  b.live = true; b.hit = true; b.tE = 0; F.hitDone = true; B.lockA = aim; bowlPhase('roll');
  hitSparks(b.x, b.y, speed, F.color, heavy ? 3 : 1);
  G.hitstop = Math.max(G.hitstop, heavy ? 7 : 3); if (typeof addTrauma === 'function') addTrauma(heavy ? 0.42 : 0.15, Math.atan2(0, 1)); else G.shake = Math.max(G.shake, heavy ? 8 : 3);
  if (heavy) { ring(b.x, b.y, '#ffffff', 12, 12, 18, 6); textFx(speed > 24 ? 'THUNDERBALL!' : 'BOWLED!', b.x, b.y - 90, F.color); }
  else textFx('nudge…', b.x, b.y - 80, '#cfd3ff');
  gameEvent('bowlRoll', { f: F, speed, heavy });
}
function bowlPhysics() {
  const B = G.bowl, b = B.ball3, R = BOWL.R, ly = STAGE.y, W = BOWL.LANE_W; if (!b.live || b.gone) return;
  const onDeck = b.x <= laneEnd();
  if (b.drop || !onDeck) { b.drop = true; b.vy += BOWL.GRAV; b.y += b.vy; b.x += b.vx * 0.6; if (b.y > ly + 260) b.gone = true; return; }
  const floor = b.gutter ? ly - R + 22 : ly - R;
  b.vy += BOWL.GRAV; b.y += b.vy;
  if (b.y >= floor) { if (b.vy > 3.2) { b.vy = -b.vy * 0.32; G.shake = Math.max(G.shake, 4); dust(b.x, ly, 5); gameEvent('bowlThud', {}); } else b.vy = 0; b.y = floor; }
  const grounded = b.y >= floor - 0.5;
  b.x += b.vx; b.z += b.vz; if (grounded) { b.vx *= 0.9978; b.vz *= 0.9978; }
  if (!b.gutter && grounded && Math.abs(b.z) > W - R * 0.35) {                                     // over the edge: into the gutter
    b.gutter = true; b.z = Math.sign(b.z) * (W + 22); b.vz = 0; b.y = ly - R + 22; textFx('GUTTER!', b.x, ly - 120, '#ff4d6d'); gameEvent('bowlGutter', {}); }
  // roll the ball: rotate its orientation about (up × velocity)
  const sp = Math.hypot(b.vx, b.vz); if (sp > 0.01 && grounded) { const ax = [-b.vz / sp, 0, b.vx / sp], th = -sp / R; b.rot = rotM19(b.rot, [ax[0], ax[1], ax[2]], th); }   // (world z toward the camera: rolling +x turns about −z)
  if (G.time % 2 === 0) { b.trail.push([b.x, b.y, b.z]); if (b.trail.length > 10) b.trail.shift(); }
}
// pins: ball contact, toppling, sliding, and falling pins knocking over standing ones
function bowlPins() {
  const B = G.bowl, b = B.ball3, R = BOWL.R, PR = BOWL.PR, H = BOWL.PIN_H, ly = STAGE.y, end = laneEnd(), W = BOWL.LANE_W;
  const knock = (p, vx, vz, k) => { if (p.st !== 'up') return; p.st = 'falling'; p.vx = vx; p.vz = vz; const s = Math.hypot(vx, vz) || 1; p.dx = vx / s; p.dz = vz / s; p.tv = 0.035 + Math.min(0.08, s * 0.004);
    if (!B.firstHit) { B.firstHit = G.time; if (B.pins.length === 10 && p.n === 0 && s > 14 && Math.abs(b.z) < 34) { G.slowmo = 26; B.slowT = 26; } }   // a clean pocket hit on a full rack: slow motion
    burst(p.x, ly - H * 0.45, '#ffffff', k ? 6 : 3, 5, 14, 'dot'); gameEvent('pinHit', { p, k }); };
  if (b.live && !b.gutter && !b.drop && b.y + R > ly - H + 6) for (const p of B.pins) {
    if (p.st !== 'up' && p.st !== 'falling') continue;
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz); if (d >= R + PR || d < 0.01) continue;
    const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz - (p.vx * nx + p.vz * nz); if (vn <= 0) continue;
    const pvx = nx * vn * 1.7 + b.vx * 0.25, pvz = nz * vn * 1.7 + b.vz * 0.25;
    if (p.st === 'up') knock(p, pvx, pvz, true); else { p.vx += pvx * 0.5; p.vz += pvz * 0.5; }
    b.vx -= nx * vn * 0.2; b.vz -= nz * vn * 0.2; p.x = b.x + nx * (R + PR + 0.5); p.z = b.z + nz * (R + PR + 0.5);
    if (typeof addTrauma === 'function') addTrauma(0.12, 0); else G.shake = Math.max(G.shake, 3);
  }
  for (const q of B.pins) {
    if (q.st === 'gone') { q.drop += 6; continue; }
    if (q.st === 'up') continue;
    q.x += q.vx; q.z += q.vz; const damp = q.st === 'down' ? 0.88 : 0.95; q.vx *= damp; q.vz *= damp;
    if (q.st === 'falling') { q.tv += 0.006 + 0.022 * Math.sin(q.tilt); q.tilt += q.tv; if (q.tilt >= Math.PI / 2) { q.tilt = Math.PI / 2; q.st = 'down'; q.vx *= 0.6; q.vz *= 0.6; gameEvent('pinClatter', {}); } }
    if (q.x > end || Math.abs(q.z) > W + 26) { q.st = 'gone'; q.drop = 0; continue; }
    // the falling pin's body sweeps the deck from its base to its tip
    const reach = H * Math.sin(q.tilt) * 0.95, ex = q.x + q.dx * reach, ez = q.z + q.dz * reach, sp = Math.hypot(q.vx, q.vz) + q.tv * 40;
    if (sp < 0.5) continue;
    for (const s of B.pins) { if (s === q || s.st !== 'up') continue;
      const L2 = (ex - q.x) ** 2 + (ez - q.z) ** 2, u = L2 > 0 ? clamp(((s.x - q.x) * (ex - q.x) + (s.z - q.z) * (ez - q.z)) / L2, 0, 1) : 0, cx = q.x + (ex - q.x) * u, cz = q.z + (ez - q.z) * u, d = Math.hypot(s.x - cx, s.z - cz);
      if (d < PR * 1.75) { const nx = (s.x - cx) / (d || 1), nz = (s.z - cz) / (d || 1); knock(s, q.vx * 0.55 + nx * (1.5 + sp * 0.5), q.vz * 0.55 + nz * (1.5 + sp * 0.5), false); q.vx *= 0.8; q.vz *= 0.8; } }
  }
}
// a 3×3 rotation (row-major) premultiplied by the rotation of `th` about unit axis a
function rotM19(M, a, th) {
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c, [x, y, z] = a;
  const Rm = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c], o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = Rm[i * 3] * M[j] + Rm[i * 3 + 1] * M[3 + j] + Rm[i * 3 + 2] * M[6 + j];
  return o;
}
// a ball is over: record it, call it, and work out what comes next
function bowlRecord(n, foul) {
  const B = G.bowl, rolls = B.rolls[B.p], first = B.pins.filter(p => p.wasUp).length === 10;                     // (this ball met a full rack)
  rolls.push(n); const who = fighters[B.p], x = BOWL.PX + 90, y = STAGE.y - 200;
  if (first && n === 10) { B.strikes[B.p]++; B.msg = 'STRIKE!'; textFx('STRIKE!', x, y, '#ffd23a'); G.flash = Math.max(G.flash, 0.3); ring(x, STAGE.y - 60, '#ffd23a', 20, 16, 30, 8); burst(x, STAGE.y - 80, '#ffe680', 40, 14, 30); starFx(x, y + 30, '#ffffff', 60); if (typeof addTrauma === 'function') addTrauma(0.5, 0); gameEvent('bowlStrike', { f: who }); }
  else if (!first && n > 0 && pinsUp(B) === 0) { B.spares[B.p]++; B.msg = 'SPARE!'; textFx('SPARE!', x, y, '#3dfff0'); ring(x, STAGE.y - 60, '#3dfff0', 16, 12, 24, 6); burst(x, STAGE.y - 80, '#c8fff8', 26, 10, 24); gameEvent('bowlSpare', { f: who }); }
  else { B.msg = foul ? 'TIME — 0' : n === 0 ? (B.ball3.gutter ? 'GUTTER BALL' : 'MISS') : n + (n === 1 ? ' PIN' : ' PINS'); if (n === 0) B.gutters[B.p]++; textFx(B.msg, x, y, n ? '#ffffff' : '#ff4d6d'); }
  B.msgT = 90; bowlPhase('count');
}
function bowlAdvance() {
  const B = G.bowl, [more, reset] = bowlNext(B.rolls[B.p], B.frame);
  if (more) { if (reset) { B.pins = bowlRack(); bowlBall(); bowlPlace(); bowlPhase('ready'); } else bowlPhase('sweep'); return; }
  // this player's frame is done → the rival's turn at the same frame, or the next frame
  if (B.p === 0) B.p = 1; else { B.p = 0; B.frame++; }
  if (B.frame >= BOWL.N) return bowlEnd();
  B.pins = bowlRack(); bowlBall(); bowlPlace(); bowlPhase('ready');
  textFx((B.p === 0 ? 'YOUR' : fighters[1].ch.name + "'S") + ' TURN · FRAME ' + (B.frame + 1), STAGE.x + 640, STAGE.y - 260, fighters[B.p].color);
}
function bowlEnd() {
  const B = G.bowl, s = [bowlTotal(B.rolls[0]), bowlTotal(B.rolls[1])], w = s[0] === s[1] ? null : s[0] > s[1] ? fighters[0] : fighters[1];
  B.done = true; B.score = s; G.mode = 'ending'; G.endT = 150; G.winner = w; G.finishAt = G.time; G.hitstop = 20; G.matchTime = G.frame;
  G.endText = w ? w.ch.name + ' WINS ' + Math.max(...s) + '–' + Math.min(...s) : 'TIE ' + s[0] + '–' + s[1];
}
// the waiting player's controls go quiet (in step.js, after inputs are read)
function bowlFilterInputs(inps) { const B = G.bowl; if (!B) return; const k = 1 - B.p; if (inps[k]) inps[k] = emptyInput(); if (B.ph !== 'aim' && inps[B.p]) { const i = inps[B.p]; i.lightP = i.heavyP = i.specialP = i.ultP = false; } }

/* ---------------- the CPU bowler ---------------- */
// walk up behind the ball, pick a line (near the pocket, sloppier on lower levels) and swing a smash as the arrow crosses it
function bowlAI(f) {
  const B = G.bowl, inp = emptyInput(); if (!B || B.p !== f.id || B.ph !== 'aim' || B.ball3.live) return inp;
  const a = f.ai || (f.ai = {}), lvl = G.diff, b = B.ball3, tx = b.x - BOWL.STAND;
  if (!a.bowl || a.bowl.key !== B.key) a.bowl = { key: B.key, target: (Math.random() < 0.5 ? -1 : 1) * 0.02 + (Math.random() - 0.5) * 2 * [0.07, 0.045, 0.025, 0.012][lvl], wait: 40 + Math.random() * 50, tol: [0.03, 0.02, 0.012, 0.008][lvl] };
  if (f.x < tx - 5) inp.right = true; else if (f.x > tx + 5) inp.left = true;
  else if (f.onGround && f.state === 'free' && --a.bowl.wait <= 0 && Math.abs(bowlAim(B.phT) - a.bowl.target) < a.bowl.tol) { inp.heavyP = true; inp.aimX = 100; inp.aimY = 0; }
  if (f.facing < 0 && !inp.left) inp.aimX = 100;
  return inp;
}

/* ---------------- results ---------------- */
function bowlResult() {
  const B = G.bowl, me = fighters[0], foe = fighters[1], s = B.score || [bowlTotal(B.rolls[0]), bowlTotal(B.rolls[1])], won = s[0] > s[1], t = won ? 'KINGPIN!' : s[0] === s[1] ? 'DEAD EVEN' : 'OUT-BOWLED';
  $('lad-title').textContent = t; $('lad-title').dataset.text = t;
  $('lad-sub').textContent = `${me.ch.name} ${s[0]} – ${s[1]} ${foe.ch.name} · ${DIFFS[G.diff].name} CPU · ${BOWL.N} frames`;
  const sc = [bowlScore(B.rolls[0]), bowlScore(B.rolls[1])];
  const line = k => sc[k].frames.map(fr => fr.r.join(' ') || '·').join(' | ');
  $('lad-list').innerHTML = [['🎳', me.ch.name, line(0), s[0], 0], ['🤖', foe.ch.name, line(1), s[1], 1], ['💥', 'Strikes · spares', `${me.ch.name} ${B.strikes[0]} · ${B.spares[0]}  —  ${foe.ch.name} ${B.strikes[1]} · ${B.spares[1]}`, '', 2]]
    .map(([i, l, a, v, k]) => `<li class="done" style="--c:${k === 2 ? '#3dfff0' : fighters[Math.min(k, 1)].color}"><span class="lad-n">${i}</span><b>${l}</b><small>${a}</small><span class="lad-st">${v}</span></li>`).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="bowl-again">Rematch</button><button class="btn big" data-act="mini-hub">Minigames</button><button class="btn big" data-go="scr-main">Menu</button>`;
  const rec = store.get('neonbrawl.minigames', {}), r = rec.bowl || (rec.bowl = { played: 0, wins: 0, best: 0 }); r.played++; if (won) r.wins++; r.best = Math.max(r.best, s[0]); store.set('neonbrawl.minigames', rec);
  B.won = won; B.mine = s[0]; showScreen('scr-ladder');
}

/* ---------------- HUD: the scoreboard ---------------- */
const BOWL_HUD = { el: null, k: '' };
function bowlHUD() {
  const B = G.bowl, on = !!B && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending');
  if (!BOWL_HUD.el) { BOWL_HUD.el = document.createElement('div'); BOWL_HUD.el.className = 'bw-board'; HUD.el.appendChild(BOWL_HUD.el); }
  HUD.el.classList.toggle('volley', on);
  const left = B && B.ph === 'aim' ? Math.max(0, Math.ceil((BOWL.AIM_T - B.phT) / 60)) : -1;
  const k = on ? B.rolls.map(r => r.join(',')).join('|') + '/' + B.p + B.frame + B.ph + left : '';
  if (k === BOWL_HUD.k) return; BOWL_HUD.k = k; BOWL_HUD.el.style.display = on ? 'grid' : 'none'; if (!on) return;
  const row = i => { const S = bowlScore(B.rolls[i]), f = fighters[i];
    return `<span class="bw-name${B.p === i && !B.done ? ' on' : ''}" style="--pc:${f.color}">${i === B.p && !B.done ? '▶ ' : ''}${f.ch.name}</span>` +
      S.frames.map((fr, j) => `<span class="bw-fr${j === B.frame && i === B.p && !B.done ? ' cur' : ''}"><i>${fr.r.map(m => `<u class="${m === 'X' ? 'x' : m === '/' ? 's' : ''}">${m}</u>`).join('')}</i><b>${fr.total === null ? '' : fr.total}</b></span>`).join('') +
      `<span class="bw-tot" style="--pc:${f.color}">${bowlTotal(B.rolls[i])}</span>`; };
  BOWL_HUD.el.innerHTML = `<span class="bw-title">🎳 BRAWLER BOWLING${left >= 0 ? ` · <em>${fighters[B.p].cpu ? 'CPU' : 'YOUR'} BALL ${left}s</em>` : ''}</span>` + row(0) + row(1);
}

/* ---------------- the alley in 3D ---------------- */
const PIN19 = [[0, 0.068], [0.02, 0.092], [0.1, 0.132], [0.22, 0.155], [0.3, 0.159], [0.4, 0.15], [0.5, 0.122], [0.6, 0.082], [0.67, 0.06], [0.74, 0.068], [0.82, 0.084], [0.88, 0.083], [0.94, 0.07], [0.98, 0.04], [1, 0]];
Object.assign(GEO, {
  // a lathe: the profile [[y, r]…] (unit height) turned round the y axis, capped at the base
  lathe19(prof, seg = 28) {
    const pos = [], idx = [], ctr = [], n = prof.length;
    for (let i = 0; i < n; i++) for (let k = 0; k <= seg; k++) { const a = k / seg * TAU, [y, r] = prof[i]; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); ctr.push([0, y, 0]); }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const p = i * (seg + 1) + k, q = p + 1, r = p + seg + 1, s = r + 1; idx.push(p, q, r, q, s, r); }
    const c0 = pos.length / 3; pos.push(0, 0, 0); ctr.push([0, 0.5, 0]); for (let k = 0; k < seg; k++) idx.push(c0, k, k + 1);   // the base
    return geoOutward19({ pos, nor: [], idx }, v => ctr[v]);
  }
});
function collectBowl3D() {
  const B = G.bowl; if (!B) return; const t = G.time, ly = STAGE.y, W = BOWL.LANE_W, x0 = STAGE.x, x1 = laneEnd(), mid = (x0 + x1) / 2, len = x1 - x0;
  const wood = [0.42, 0.26, 0.14], wood2 = [0.3, 0.18, 0.1], pink = [1, 0.31, 0.85], cyan = [0.24, 1, 0.94], dark = [0.06, 0.05, 0.1];
  // the lane: polished boards (dark lacquered maple — the stage lights make it gleam), the deck, the gutters, the foul line, the arrows
  bL('box', mid, ly + 0.9, 0, len, 3, W * 2, wood, 0);
  for (let z = -W + 20; z < W; z += 20) bL('box', mid, ly - 0.7, z, len - 4, 0.4, 0.8, wood2, 0);
  bL('box', BOWL.PX + 90, ly + 0.6, 0, x1 - BOWL.PX + 60, 3.2, W * 2, [0.5, 0.33, 0.18], 0);
  for (const sd of [-1, 1]) { bL('cyl', mid, ly + 12, sd * (W + 22), 19, len, 19, [0.12, 0.12, 0.18], 0.02, 0, Math.PI / 2); sG('tube', x0, ly - 1, sd * (W + 2), x1, ly - 1, sd * (W + 2), 1.2, sd > 0 ? pink : cyan, 0.7); }
  bG('box', BOWL.FOUL, ly - 0.8, 0, 4, 1, W * 2, [1, 0.2, 0.3], 1.3);
  for (let k = 0; k < 7; k++) { const z = (k - 3) * 40, x = BOWL.FOUL + 380 + Math.abs(k - 3) * 28; bG('octa', x, ly - 1.2, z, 7, 0.6, 4, k % 2 ? pink : cyan, 0.9); }
  // the pit, the backstop curtain and the pinsetter hood, kickback walls, neon arches over the lane
  bL('box', x1 + 95, ly + 70, 0, 190, 140, W * 2 + 90, [0.02, 0.02, 0.04], 0);
  bL('box', x1 + 200, ly - 120, 0, 12, 400, W * 2 + 150, [0.08, 0.04, 0.14], 0.05);
  for (let k = 0; k < 5; k++) bG('box', x1 + 193, ly - 40 - k * 60, 0, 2, 6, W * 2 + 120, k % 2 ? pink : cyan, 0.5 + 0.3 * Math.sin(t * 0.08 + k));
  bL('box', BOWL.PX + 110, ly - 250, 0, x1 - BOWL.PX + 160, 34, W * 2 + 70, dark, 0.03); bG('box', BOWL.PX + 110, ly - 232, W + 36, x1 - BOWL.PX + 150, 3, 2, pink, 1.1);
  for (const sd of [-1, 1]) bL('box', BOWL.PX + 110, ly - 45, sd * (W + 46), x1 - BOWL.PX + 150, 90, 8, dark, 0.04);
  for (const ax of [BOWL.FOUL + 120, BOWL.FOUL + 520, BOWL.FOUL + 880]) { for (const sd of [-1, 1]) sG('tube', ax, ly, sd * (W + 60), ax, ly - 300, sd * (W + 60), 3, cyan, 0.75);
    sG('tube', ax, ly - 300, -W - 60, ax, ly - 300, W + 60, 3, pink, 0.85); }
  // the aim arrow: a march of chevrons down the line the ball will take
  if (B.ph === 'aim' && !B.ball3.live) { const b = B.ball3, a = B.lockA !== null ? B.lockA : bowlAim(B.phT), locked = B.lockA !== null, col = locked ? [1, 0.85, 0.3] : fighters[B.p].cpu ? [1, 0.4, 0.5] : [0.4, 1, 0.95];
    for (let i = 0; i < 12; i++) { const d = 80 + i * 80, x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d, k = locked ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.25 - i * 0.6));
      if (x > BOWL.PX - 20) break; bG('cone', x, ly - 2, z, 2, 30, 18, col, 1.3 * k, -a, -Math.PI / 2); }   // (Rz −90° lays the cone down the lane, Ry turns it onto the line)
    const e = BOWL.PX - 40, ez = b.z + Math.tan(a) * (e - b.x); bG('disc', e, ly - 1, ez, 26, 0.5, 26, col, 0.7 + 0.3 * Math.sin(t * 0.3)); }   // + where it will meet the pins
  // the pins
  const pm = sgMesh('bowl:pin', () => GEO.lathe19(PIN19), true), H = BOWL.PIN_H;
  for (const p of B.pins) { if (p.st === 'gone' && p.drop > 160) continue;
    const s = Math.sin(p.tilt), c = Math.cos(p.tilt), up = [s * p.dx, c, s * p.dz], bx = [p.x, -(ly - 0.6) - p.drop, p.z];
    let X = V3.norm(V3.cross(up, [0, 0, 1])); if (!isFinite(X[0]) || Math.hypot(...X) < 0.5) X = [1, 0, 0]; const Z = V3.cross(X, up);
    const it = glItem(pm); M4.basis(it.m, bx[0], bx[1], bx[2], V3.scale(X, H), V3.scale(up, H), V3.scale(Z, H)); it.outMesh = pm.outline;
    it.col = [0.97, 0.96, 0.94]; it.spec = 1.2; it.shin = 120; it.metal = 0.1; it.toon = 1; it.outline = 2; it.rimK = 1.1; it.rimCol = p.n % 2 ? pink : cyan; it.emis = 0.04;
    for (const [y, r] of [[0.71, 0.064], [0.77, 0.072]]) { const q = V3.add(bx, V3.scale(up, y * H)), rg = glItem(GL3D.mesh.torus); M4.basis(rg.m, q[0], q[1], q[2], V3.scale(X, r * H * 1.03), V3.scale(up, H * 0.012), V3.scale(Z, r * H * 1.03)); rg.col = [0.92, 0.1, 0.18]; rg.spec = 1; rg.shin = 80; rg.toon = 1; rg.outline = 0; rg.emis = 0.25; }
    if (p.st === 'up') bG('disc', p.x, ly - 0.9, p.z, BOWL.PR + 4, 0.5, BOWL.PR + 4, p.n % 2 ? pink : cyan, 0.45); }
  // the ball: glossy, swirled, three finger holes — all turning with it
  const b = B.ball3; if (!b || b.gone) return;
  const R = BOWL.R, wc = [b.x, -b.y, b.z], rot = b.rot, Rv = v => [rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2], rot[3] * v[0] + rot[4] * v[1] + rot[5] * v[2], rot[6] * v[0] + rot[7] * v[1] + rot[8] * v[2]];
  const ball = glSphere(wc[0], wc[1], wc[2], R); ball.col = [0.28, 0.08, 0.5]; ball.spec = 1.6; ball.shin = 160; ball.metal = 0.25; ball.outline = 2; ball.rimK = 1.1; ball.rimCol = cyan;
  { const sw = glItem(GL3D.mesh.torus), A = Rv([R * 1.004, 0, 0]), Bv = Rv([0, R * 0.03, 0]), C = Rv([0, 0, R * 1.004]); M4.basis(sw.m, wc[0], wc[1], wc[2], A, Bv, C); sw.col = pink; sw.glow = 0.9; sw.glowPow = 0.6; sw.shadow = false; }
  for (const h of [[0.32, 0.86, 0.38], [-0.08, 0.92, 0.37], [0.14, 0.94, 0.03]]) { const v = Rv(V3.norm(h)), q = V3.add(wc, V3.scale(v, R * 0.93)), hs = glSphere(q[0], q[1], q[2], R * 0.12); hs.col = [0.02, 0.01, 0.03]; hs.spec = 0.2; hs.outline = 0; }
  const sp = Math.hypot(b.vx, b.vz); if (b.live && sp > 8) b.trail.forEach(([x, y, z], i) => bG('sph', x, y, z, R * (0.3 + i * 0.05), R * (0.3 + i * 0.05), R * (0.3 + i * 0.05), sp > 20 ? [1, 0.6, 0.95] : cyan, 0.04 + i * 0.025));
  if (!b.live) ringG(b.x, ly - 2, b.z, R + 10 + Math.sin(t * 0.2) * 3, 2.5, fighters[B.p].cpu ? [1, 0.4, 0.5] : cyan, 0.9, Math.PI / 2, t * 0.05);
}
function drawBowl2D() {
  const B = G.bowl; if (!B) return; const ly = STAGE.y; ctx.save();
  ctx.fillStyle = '#c79a5a'; ctx.fillRect(STAGE.x, ly - 3, STAGE.w, 4);
  ctx.fillStyle = '#ff3a5a'; ctx.fillRect(BOWL.FOUL - 2, ly - 4, 4, 6);
  for (const p of B.pins) { if (p.st === 'gone') continue; ctx.save(); ctx.translate(p.x + p.z * 0.15, ly); ctx.rotate(p.tilt * Math.sign(p.dx || 1)); ctx.fillStyle = '#f6f4ee'; ctx.fillRect(-8, -BOWL.PIN_H, 16, BOWL.PIN_H); ctx.fillStyle = '#e8243c'; ctx.fillRect(-6, -BOWL.PIN_H * 0.78, 12, 6); ctx.restore(); }
  const b = B.ball3; if (b && !b.gone) { ctx.fillStyle = '#4a1a80'; ctx.beginPath(); ctx.arc(b.x, b.y, BOWL.R, 0, TAU); ctx.fill(); }
  ctx.restore();
}

/* ---------------- sounds + wiring ---------------- */
Object.assign(SFX, {
  bowlRoll(heavy) { noise({ f0: 220, f1: 120, dur: heavy ? 1.4 : 0.8, gain: heavy ? 0.12 : 0.06, filter: 'lowpass' }); tone({ type: 'sine', f0: 70, f1: 55, dur: 1.2, gain: 0.08 }); },
  pinHit(k) { const t = AUDIO.ctx.currentTime; noise({ f0: 2600, f1: 900, dur: 0.12, gain: k ? 0.16 : 0.08, filter: 'bandpass' }); tone({ type: 'triangle', f0: 620 + Math.random() * 300, f1: 300, dur: 0.12, gain: 0.05, at: t }); },
  pinClatter() { noise({ f0: 1400, f1: 500, dur: 0.18, gain: 0.05, filter: 'bandpass' }); },
  bowlStrike() { const t = AUDIO.ctx.currentTime; [72, 76, 79, 84, 88].forEach((n, i) => tone({ type: 'square', f0: mtof(n), dur: 0.32, gain: 0.06, at: t + 0.15 + i * 0.07, verb: 0.4 })); noise({ f0: 1200, dur: 1.2, gain: 0.07, filter: 'bandpass', at: t + 0.1, verb: 0.6 }); }
});
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'bowlRoll') sfx('bowlRoll', d.heavy ? 1 : 0); else if (type === 'pinHit') sfx('pinHit', d.k ? 1 : 0); else if (type === 'pinClatter') sfx('pinClatter');
  else if (type === 'bowlStrike' || type === 'bowlSpare') sfx('bowlStrike');
});
$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
  if (a === 'mini-bowl') { SEL.challenge = 'bowl'; go('scr-select'); }
  else if (a === 'bowl-again') bowlStart();
});
