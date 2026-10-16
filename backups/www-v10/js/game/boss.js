/* NEON BRAWL — OMNI HAND, the Classic Arcade's final boss: a towering, floating giant glove ("Master Hand" style).
 *
 * It occupies the opponent slot (fighters[1]) but runs its own brain (updateHand) instead of the fighter state machine:
 *   hover   drifts above the arena on the far side of you, bobbing, then picks an attack
 *   slam    hovers over you (a target ring marks the spot), then drops palm-first; two shockwaves race along the floor
 *   poke    points from the side of the arena (the fingertip flashes), then jabs straight across at your height
 *   sweep   drops to the floor at one edge and sweeps across it, palm down — jump it
 *   fist    clenches, trembling, beside the arena, then rockets across as a giant fist
 *   gun     finger-gun: three energy shots aimed at you
 *   stun    a perfect parry against any of its attacks staggers it (dizzy stars) — free hits
 * It has HP instead of knockback (f.percent = damage taken; the HUD shows HP left): everything you can do lands —
 * punches, smashes, specials, projectiles and your Ultimate (the cinematic holds the hand while the flurry lands).
 * At 0 HP it shudders, explodes and the match is won.                                                          */
'use strict';

const HAND_HP = 300, HAND_W = 150, HAND_H = 110;
function handChar() {
  const b = CHARS.find(c => c.id === 'velocity');
  return Object.assign({}, b, { id: 'omnihand', name: 'OMNI HAND', role: 'Final Boss', color: '#f4f4ff', alt: '#ff4fd8', hand: true, weight: 2, trail: null,
    special: { type: 'none', name: '—' }, stats: b.stats, sdesc: 'The final boss.', pass: '' });
}
// Turn the opponent into the boss (after startMatch)
function setupHand(f) {
  f.ch = handChar(); f.color = '#f4f4ff'; f.fill = 'rgba(244,244,255,0.3)'; f.skin = 0; f.skinFx = null;
  f.hand = true; f.hpMax = HAND_HP; f.percent = 0; f.stocks = 1; f.scale = 1; f.facing = -1;
  f.x = STAGE.x + STAGE.w * 0.75; f.y = STAGE.y - 260; f.onGround = false; f.state = 'free';
  f.bs = { st: 'enter', t: 0, tx: f.x, ty: f.y, dir: -1, shots: 0, hit: false, pose: 'open', curl: 0.15, tilt: 0 };
  f.bullets = [];
}
const handRect = f => ({ x: f.x - HAND_W / 2, y: f.y - HAND_H, w: HAND_W, h: HAND_H });
const handHittable = f => !!f.hand && f.bs && f.bs.st !== 'die';

function handHit(f, o, r, m, dir) {                                      // one attack's hitbox against the player
  logHitbox(r, f, 'hit');
  if (f.bs.hit || !canBeHit(o) || !overlap(r, bodyRect(o))) return;
  f.bs.hit = true;
  deliver(f, o, m, dir, o.x, o.y - 32, o.state === 'shield');
}
function handShot(f, x, y, vx, vy, kind) { f.bullets.push({ x, y, vx, vy, r: kind === 'wave' ? 22 : 12, life: kind === 'wave' ? 80 : 110, kind }); }

function handGo(f, st) { const B = f.bs; B.st = st; B.t = 0; B.hit = false; B.shots = 0; }
function handPickAttack(f, o) {
  const r = Math.random(), lowHP = f.percent > f.hpMax * 0.6;                                // below 40 % HP it gets meaner: more slams and fists
  handGo(f, r < (lowHP ? 0.28 : 0.22) ? 'slam' : r < 0.42 ? 'poke' : r < 0.6 ? 'sweep' : r < (lowHP ? 0.85 : 0.78) ? 'fist' : 'gun');
  f.bs.dir = o.x < f.x ? -1 : 1;
}

function updateHand(f, o) {
  if (f.hitFlash > 0) f.hitFlash--; if (f.invuln > 0) f.invuln--; if (f.percentPop > 0) f.percentPop--; if (f.hurt > 0) f.hurt--; if (f.shieldHit > 0) f.shieldHit--;
  f.px = f.x; f.py = f.y;
  const B = f.bs; B.t++;
  updateHandShots(f, o);
  if (f.ultHeld > 0) { f.ultHeld--; return; }                              // held by an Ultimate
  if (f.state === 'hitstun') f.state = 'free';
  if (f.state === 'lag' && B.st !== 'die') { handGo(f, 'stun'); f.state = 'free'; B.stunT = Math.max(90, f.lagT * 3); f.lagT = 0; }   // parried: stagger
  if (B.st !== 'die' && f.percent >= f.hpMax) { handGo(f, 'die'); gameEvent('ult', { f, phase: 'connect' }); }
  const t = B.t, ground = STAGE.y, L = STAGE.x - 40, R = STAGE.x + STAGE.w + 40;
  const ease = (tx, ty, k) => { f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; };
  B.tilt *= 0.9;
  switch (B.st) {
    case 'enter': B.pose = 'open'; ease(STAGE.x + STAGE.w * 0.72, ground - 250, 0.04); if (t > 70) handGo(f, 'hover'); break;
    case 'hover': {
      B.pose = 'open'; B.curl = 0.15 + 0.05 * Math.sin(t * 0.05);
      const side = o.x < STAGE.x + STAGE.w / 2 ? 1 : -1;
      ease(clamp(o.x + side * 230, L, R), ground - 250 + Math.sin(G.time * 0.04) * 18, 0.035); f.facing = o.x < f.x ? -1 : 1;
      if (t > (f.percent > f.hpMax * 0.6 ? 55 : 80) && o.state !== 'dead' && o.state !== 'respawn') handPickAttack(f, o);
      break;
    }
    case 'slam': {
      if (t < 40) { B.pose = 'slam'; ease(clamp(o.x, STAGE.x + 40, STAGE.x + STAGE.w - 40), ground - 330, 0.12); B.tx = f.x; }            // lock on
      else if (t < 48) { f.y -= 3; }                                                                                                 // wind up
      else if (f.y < ground) { f.vy = Math.min(30, (f.vy || 0) + 3); f.y = Math.min(ground, f.y + f.vy);
        handHit(f, o, { x: f.x - 80, y: f.y - 70, w: 160, h: 72 }, { dmg: 15, base: 10, scale: 0.12, ang: 80, hs: 8, heavy: true }, o.x < f.x ? -1 : 1);
        if (f.y >= ground) { f.vy = 0; B.land = t; G.shake = Math.max(G.shake, 14); dust(f.x, ground, 16); ring(f.x, ground - 6, '#ffffff', 20, 14, 20, 7); gameEvent('land', { f, impact: 18 });
          handShot(f, f.x - 70, ground - 18, -9, 0, 'wave'); handShot(f, f.x + 70, ground - 18, 9, 0, 'wave'); } }
      else if (t - B.land > 50) { f.vy = 0; handGo(f, 'hover'); }                                                                 // rests on the floor: hit it!
      break;
    }
    case 'poke': {
      const sx = B.dir > 0 ? L - 120 : R + 120;
      if (t < 46) { B.pose = 'point'; f.facing = B.dir; ease(sx, clamp(o.y - 50, ground - 300, ground - 40), 0.1); }
      else { f.x += B.dir * 21; B.pose = 'point';
        handHit(f, o, { x: B.dir > 0 ? f.x + 40 : f.x - 120, y: f.y - 70, w: 80, h: 44 }, { dmg: 13, base: 9, scale: 0.11, ang: 30, hs: 6, heavy: true }, B.dir);
        if ((B.dir > 0 && f.x > R + 160) || (B.dir < 0 && f.x < L - 160)) handGo(f, 'hover'); }
      break;
    }
    case 'sweep': {
      const sx = B.dir > 0 ? L - 80 : R + 80;
      if (t < 50) { B.pose = 'slam'; f.facing = B.dir; ease(sx, ground - 4, 0.1); }
      else { f.x += B.dir * 14; f.y = ground - 4; B.pose = 'slam';
        if (t % 3 === 0) dust(f.x - B.dir * 60, ground, 2);
        handHit(f, o, { x: f.x - 80, y: ground - 58, w: 160, h: 58 }, { dmg: 11, base: 9, scale: 0.1, ang: 62, hs: 6 }, B.dir);
        if ((B.dir > 0 && f.x > R + 120) || (B.dir < 0 && f.x < L - 120)) handGo(f, 'hover'); }
      break;
    }
    case 'fist': {
      const sx = B.dir > 0 ? L - 60 : R + 60;
      if (t < 55) { B.pose = 'fist'; f.facing = B.dir; ease(sx, clamp(o.y - 40, ground - 260, ground - 30), 0.1); if (t > 30) f.x += Math.sin(t * 2.3) * 3; }   // trembling with power
      else { f.x += B.dir * 25; B.pose = 'fist'; if (t % 2 === 0) ghost(f);
        handHit(f, o, { x: f.x - 70, y: f.y - 90, w: 140, h: 90 }, { dmg: 18, base: 12, scale: 0.13, ang: 38, hs: 9, heavy: true }, B.dir);
        if ((B.dir > 0 && f.x > R + 180) || (B.dir < 0 && f.x < L - 180)) handGo(f, 'hover'); }
      break;
    }
    case 'gun': {
      B.pose = 'gun'; f.facing = o.x < f.x ? -1 : 1; ease(clamp(o.x - f.facing * 300, L, R), ground - 220, 0.05);
      if (t > 30 && t % 22 === 8 && B.shots < 3) { B.shots++; const mx = f.x + f.facing * 80, my = f.y - 60, a = Math.atan2(o.y - 32 - my, o.x - mx); handShot(f, mx, my, Math.cos(a) * 9, Math.sin(a) * 9, 'shot'); B.tilt = -0.3; ring(mx, my, '#ff4fd8', 6, 6, 12, 3); }
      if (t > 110) handGo(f, 'hover');
      break;
    }
    case 'stun': {
      B.pose = 'open'; B.curl = 0.6; f.y = Math.min(ground - 40, f.y + 3); f.x += Math.sin(t * 0.3) * 1.5;
      if (t % 14 === 0) burst(f.x, f.y - HAND_H - 10, '#ffe14d', 2, 3, 14, 'dot');
      if (t > B.stunT) handGo(f, 'hover');
      break;
    }
    case 'die': {
      B.pose = 'open'; B.curl = 0.9; f.x += Math.sin(t * 1.7) * 3; f.y += 0.5;
      if (t % 6 === 0) { burst(f.x + rand(-60, 60), f.y - rand(10, 100), '#ffffff', 10, 9, 18); burst(f.x + rand(-60, 60), f.y - rand(10, 100), '#ff4fd8', 8, 8, 18); G.shake = Math.max(G.shake, 6); }
      if (t === 90) handDefeat(f);
      break;
    }
  }
}
function updateHandShots(f, o) {
  for (let i = f.bullets.length - 1; i >= 0; i--) {
    const b = f.bullets[i]; b.x += b.vx; b.y += b.vy; b.life--;
    if (b.kind === 'shot' && G.frame % 2 === 0) pushFx({ type: 'dot', x: b.x, y: b.y, vx: 0, vy: 0, life: 10, max: 10, color: '#ff4fd8', size: 4, drag: 1, g: 0 });
    let gone = b.life <= 0 || b.x < BZ.l || b.x > BZ.r;
    if (!gone && canBeHit(o) && rectCircle(bodyRect(o), b.x, b.y, b.r)) {
      deliver(f, o, b.kind === 'wave' ? { dmg: 8, base: 8, scale: 0.08, ang: 70, hs: 5, proj: true } : { dmg: 6, base: 6, scale: 0.07, ang: 45, hs: 4, proj: true }, sign(b.vx) || 1, b.x, b.y, o.state === 'shield');
      gone = true;
    }
    if (gone) f.bullets.splice(i, 1);
  }
}
function handDefeat(f) {
  const x = f.x, y = f.y - HAND_H / 2;
  starFx(x, y, '#ffffff', 120); for (let k = 0; k < 6; k++) ring(x, y, k % 2 ? '#ff4fd8' : '#ffffff', 10 + k * 6, 12 + k * 3, 40 + k * 6, 6); burst(x, y, '#ffffff', 50, 18, 50); shatter(x, y, '#f4f4ff', 40);
  gameEvent('ko', { f, x, y }); G.shake = 22; G.flash = 1; f.bullets.length = 0;
  f.stocks = 0; f.state = 'dead'; f.deadT = 1e9; f.x = -5000;
  G.mode = 'ending'; G.endT = 150; G.winner = fighters[0]; G.finishAt = G.time; G.hitstop = 36; G.matchTime = G.frame; G.endText = 'BOSS DEFEATED!';
}

/* ================= rendering: a giant cel-shaded white glove (WebGL) + a canvas version ================= */
// Each pose: finger direction U, palm normal N (game coords: x right, y down, z toward the camera), finger curl
function handFrame(f) {
  const B = f.bs || { pose: 'open', curl: 0.2, tilt: 0 }, d = f.facing || 1;
  switch (B.pose) {
    case 'slam':  return { U: [d, 0, 0], N: [0, 1, 0], curl: 0.08, thumbOut: 1 };
    case 'point': return { U: [d, 0, 0], N: [0, 0, 1], curl: 0.95, point: true };
    case 'gun':   return { U: [d, -0.15 + B.tilt, 0], N: [0, 0, 1], curl: 0.95, point: true, thumbUp: true };
    case 'fist':  return { U: [d, 0, 0], N: [0, 0, 1], curl: 1.25 };
    default:      return { U: [d * 0.35, 1, 0], N: [0, 0, 1], curl: B.curl };
  }
}
function hand3D(f) {
  const portrait = !f.bs, k = portrait ? 0.42 : 1, F = handFrame(f), U = V3.norm(F.U), N = V3.norm(F.N), Vv = V3.norm(V3.cross(N, U));
  const cx = f.x, cy = f.y - (portrait ? 40 : HAND_H * 0.55), col = f.hitFlash > 0 ? [1, 1, 1] : col3('#f4f4ff'), cuff = col3('#ff4fd8');
  const dm = f.hpMax ? f._dmgV || (f._dmgV = new Float32Array(4)) : null;
  if (dm) { const p = f.percent / f.hpMax; dm[0] = clamp(p * 1.1, 0, 1); dm[1] = clamp(p * 1.3 - 0.2, 0, 1); dm[2] = 3.7; dm[3] = clamp((p - 0.6) * 2.5, 0, 1); }
  const W = (a, b, c) => [cx + (U[0] * a + Vv[0] * b + N[0] * c) * k, -(cy + (U[1] * a + Vv[1] * b + N[1] * c) * k), (U[2] * a + Vv[2] * b + N[2] * c) * k];   // local → GL world
  const mat = (it, c, glow) => { it.col = c; it.spec = 0.55; it.shin = 40; it.toon = 1; it.outline = 1.8; it.rimK = 0.8; it.aoK = 0; it.emis = glow || 0; it.dmg = dm; return it; };
  const ball = (p, r, c) => { const it = glSphere(p[0], p[1], p[2], r * k); return mat(it, c); };
  const bone = (a, b, r, c) => mat(glSegment(a, b, r * k, r * k), c);
  // palm + back of the hand
  const pc = W(0, 0, 0), palm = glItem(GL3D.mesh.sphere);
  // (game → GL flips y, which would mirror the basis and turn the ellipsoid inside out: the V axis is negated to keep it right-handed)
  M4.basis(palm.m, pc[0], pc[1], pc[2], [U[0] * 44 * k, -U[1] * 44 * k, U[2] * 44 * k], [-Vv[0] * 40 * k, Vv[1] * 40 * k, -Vv[2] * 40 * k], [N[0] * 17 * k, -N[1] * 17 * k, N[2] * 17 * k]); mat(palm, col);
  // the cuff at the wrist
  bone(W(-40, 0, 0), W(-62, 0, 0), 30, cuff); ball(W(-62, 0, 0), 30, cuff);
  // four fingers: three phalanges each, curling toward the palm (−N)
  const curl = F.curl, lens = [[24, 19, 15], [26, 21, 16], [24, 19, 15], [19, 15, 12]];
  for (let i = 0; i < 4; i++) {
    let p = [36, -28 + i * 18.5, 0], phi = 0; const c = F.point && i === 0 ? 0 : curl;
    let a = W(p[0], p[1], p[2]);
    for (let j = 0; j < 3; j++) { phi += c * (j === 0 ? 0.7 : 0.55); const L = lens[i][j], q = [p[0] + Math.cos(phi) * L, p[1], p[2] - Math.sin(phi) * L], b = W(q[0], q[1], q[2]);
      bone(a, b, 9.5 - j * 0.8, col); ball(b, 9.5 - j * 0.8, col); p = q; a = b; }
    if (F.point && i === 0 && f.bs && (f.bs.st === 'poke' || f.bs.st === 'gun') && f.bs.t < 46) { const g = glSphere(a[0], a[1], a[2], 16 * k); g.col = cuff; g.glow = 0.8 + 0.5 * Math.sin(G.time * 0.6); g.glowPow = -1.4; g.shadow = false; }
  }
  // the thumb
  const tb = [4, F.thumbOut ? -44 : -38, 6], td = F.thumbUp ? [0.2, -0.2, 1] : F.thumbOut ? [0.45, -0.9, 0] : [0.75, -0.55, 0.3 - curl * 0.3];
  let ta = W(tb[0], tb[1], tb[2]); for (let j = 0; j < 2; j++) { const L = 22 - j * 4, q = [tb[0] + td[0] * L * (j + 1), tb[1] + td[1] * L * (j + 1), tb[2] + td[2] * L * (j + 1)], b = W(q[0], q[1], q[2]); bone(ta, b, 10, col); ball(b, 10, col); ta = b; }
  if (portrait || !f.bs) return;
  // telegraphs + the shots
  const B = f.bs, t = G.time;
  if (B.st === 'slam' && B.t < 48) { ringFloor(f.x, STAGE.y, 80 + Math.sin(t * 0.4) * 10, 40, cuff, 1.1); ringFloor(f.x, STAGE.y, 40, 20, [1, 1, 1], 0.8); }
  if (B.st === 'fist' && B.t < 55) shell(f.x, f.y - 50, 0, 90, 70, 60, cuff, 0.4 + 0.3 * Math.sin(t * 0.8), -1.6);
  if (B.st === 'stun') for (let i = 0; i < 4; i++) { const a = t * 0.12 + i * TAU / 4; bL('star', f.x + Math.cos(a) * 60, f.y - HAND_H - 20, Math.sin(a) * 40, 8, 8, 8, C('#ffe14d'), 0.8, a, a); }
  for (const b of f.bullets) { bG('sph', b.x, b.y, 0, b.r, b.r, b.r, cuff, 1.2); bG('sph', b.x, b.y, 0, b.r * 0.5, b.r * 0.5, b.r * 0.5, [1, 1, 1], 1.4);
    if (b.kind === 'wave') bG('cone', b.x, b.y + 10, 0, 18, 46, 18, cuff, 0.9); }
}
function drawHand2D(f) {
  const F = handFrame(f), d = f.facing || 1, cx = f.x, cy = f.y - HAND_H * 0.55;
  ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = '#07081a'; ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : '#f4f4ff';
  const ang = Math.atan2(F.U[1], F.U[0]);
  ctx.translate(cx, cy); ctx.rotate(ang);
  ctx.fillStyle = '#ff4fd8'; ctx.beginPath(); ctx.ellipse(-56, 0, 18, 32, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : '#f4f4ff'; ctx.beginPath(); ctx.ellipse(0, 0, 46, 40, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) { const len = (F.point && i === 0 ? 60 : 60 * Math.max(0.25, 1 - F.curl * 0.6)), y = -28 + i * 18.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(34, y - 9, len, 18, 9) : ctx.rect(34, y - 9, len, 18); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(10, -44 * d * 0 - 40, 12, 24, 0.6, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.fillStyle = '#ff4fd8'; for (const b of f.bullets || []) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); } ctx.restore();
}
