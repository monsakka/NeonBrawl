/* NEON BRAWL — SURVIVE THE HORDE (Challenges), v18 rewrite of the v16 mode.
 *
 *   DIRECTOR  wave n sends 4 + 2n enemies, at most min(12, 3 + n) on the field at once. They march in through the arena gate
 *             farther from you (a 0.5 s materialising portal, never on top of you), drop in from the sky from wave 2, and
 *             drones fly in from the sides. A wave clears when every one of its enemies is gone — then 2.5 s of breathing
 *             room, +20 % healed, and the next wave (tougher, faster, new kinds: drones from wave 2, brutes from wave 4).
 *             Spawning pauses while you're down.
 *   AI        ground enemies stand ON their surface (the v16 goons kept falling — gravity never stopped on the ground, so
 *             they sank through the floor and vanished uncounted). They path to you: walk their surface without stepping
 *             off by accident, line up under your platform and jump to it, drop through theirs when you're below, hold
 *             the ledge while you're off-stage, and claw back once with a recovery leap if knocked off. Hoppers pounce
 *             only at a landing spot that is solid; drones hover above you, telegraph, then dive (the v16 drones never
 *             attacked at all); brutes are armoured — light hits don't stagger them.
 *   KILLS     every enemy dies exactly once (mobDie): HP to zero, or knocked out of the blast zone after you hit it, is a KO
 *             for you; one that falls out without you touching it is refunded to the wave instead of silently counting
 *             toward the clear. Your real hitboxes deal their move's real damage, your hits charge your Ultimate, and the
 *             Ultimate's blast shreds everything near you.                                                              */
'use strict';

/* ============================== the Horde Pit ============================== */
const HORDE_STAGE = { id: 'hordepit', name: 'The Horde Pit', tag: 'Challenge · endless waves', clean: true,
  desc: 'A neon gladiator pit sunk into the city: the gates never stop opening.',
  main: { x: 200, y: 500, w: 880, h: 80 }, plats: [{ x: 290, y: 372, w: 170, h: 10 }, { x: 820, y: 372, w: 170, h: 10 }, { x: 555, y: 250, w: 170, h: 10 }],
  bz: { l: -280, r: 1560, t: -320, b: 920 }, spawns: [560, 720],
  pal: { fill: ['#26162e', '#0e0814'], edge: '#ff3d6a', top: '#ffd0dc', plat: '#ff9a3d', glow: '#ff3d6a', bz: 'rgba(255,61,106,0.3)' } };
Object.assign(THEME3D, { hordepit: THEME3D.cybercol || 'city' }); Object.assign(LIGHT_RIG, { hordepit: LIGHT_RIG.cybercol || 'strobe' });
Object.assign(WX_STAGE, { hordepit: ['embers'] }); Object.assign(ATMO, { hordepit: ['ember', 30, ['#ff3d6a', '#ff9a3d', '#ffffff']] });
BACKGROUNDS.hordepit = BACKGROUNDS.cybercol || BACKGROUNDS.neon;
Object.assign(STAGE_MUSIC, { hordepit: ['cyber', 158, 50, 'phrygian', 0.1, { name: 'No Way Out' }] });

// kind → body (half-width, height), HP, walk speed, the strike, its reach + wind-up, the jump it can make
const MOBK = {
  grunt:  { hp: 14, w: 15, h: 46, spd: 1.9, col: '#ff3d6a', hit: { dmg: 5, base: 5, scale: 0.05, ang: 40 }, reach: 46, wind: 22, jump: 12.5 },
  hopper: { hp: 10, w: 13, h: 34, spd: 3.2, col: '#3dff7a', hit: { dmg: 4, base: 4.5, scale: 0.045, ang: 55 }, reach: 38, wind: 18, jump: 11.5 },
  flyer:  { hp: 9,  w: 14, h: 26, spd: 2.6, col: '#3df0ff', hit: { dmg: 4, base: 5, scale: 0.05, ang: 70 }, reach: 40, wind: 24, fly: true },
  brute:  { hp: 42, w: 24, h: 70, spd: 1.2, col: '#b45aff', hit: { dmg: 10, base: 8, scale: 0.08, ang: 42, heavy: true }, reach: 62, wind: 30, jump: 10.5, armor: true }
};
const MOB_G = PHYS.grav * 0.9, HORDE_BREAK = 150, HORDE_PORTAL = 28;
const HORDE_ATT = { isHazard: true, id: -1, ch: {}, color: '#ff3d6a', x: 0, y: 0, facing: 1, cmbN: 0 };
const hordeCap = n => Math.min(12, 3 + n);
const mobBody = m => { const K = MOBK[m.kind]; return { x: m.x - K.w, y: m.y - K.h, w: K.w * 2, h: K.h }; };

function hordeStart() {
  CHAL.mode = 'horde';
  withSel({ cpu: SEL.p1, stage: HORDE_STAGE, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  const [p, o] = fighters;
  p.stocks = 3; Object.assign(o, { state: 'dead', deadT: 1e9, stocks: 1, x: -5000, y: -5000, ult: 0 });   // (the rival slot sits out: the horde is the opponent)
  CHAL.horde = { wave: 0, toSpawn: 0, spawnCD: 0, mobs: [], kills: 0, t: 0, breakT: 90, nextId: 1, best: store.get('neonbrawl.horde', {}).best || 0, cleared: 0, spawned: 0 };
  G.endText = null; G.camExtra = null;
}
function hordeWave(n) {
  const H = CHAL.horde; H.wave = n; H.toSpawn = 4 + n * 2; H.spawnCD = 20;
  textFx('WAVE ' + n, 640, 260, '#ff3d6a'); G.flash = Math.max(G.flash, 0.2); gameEvent('hordeWave', { n });
}
function hordeKind(n) {
  const r = Math.random();
  if (n >= 4 && r < 0.12 + n * 0.01) return 'brute';
  if (n >= 2 && r < 0.4) return 'flyer';
  return r < 0.68 ? 'hopper' : 'grunt';
}
// a new enemy: through the gate farther from you (ground kinds), a drop pod from the sky (from wave 2), drones from the sides
function hordeSpawn() {
  const H = CHAL.horde, n = H.wave, S = STAGE, f = fighters[0], kind = hordeKind(n), K = MOBK[kind];
  const far = f.x < S.x + S.w / 2 ? 1 : -1;                                     // the side of the arena away from you
  let x, y, ground = null, portal = HORDE_PORTAL;
  if (K.fly) { x = S.x + S.w / 2 + far * (S.w / 2 + 40); y = S.y - 300 - Math.random() * 60; }
  else if (n >= 2 && Math.random() < 0.35) {                                     // a drop pod (lands at least 160 px from you)
    for (let k = 0; k < 8; k++) { x = S.x + 50 + Math.random() * (S.w - 100); if (Math.abs(x - f.x) > 160) break; }
    y = S.y - 430; portal = 0;
  } else { x = far > 0 ? S.x + S.w - 34 - Math.random() * 40 : S.x + 34 + Math.random() * 40; y = S.y; ground = S; }
  const hpK = 1 + (n - 1) * 0.12;
  H.mobs.push({ id: H.nextId++, kind, x, y, vx: 0, vy: 0, hp: K.hp * hpK, max: K.hp * hpK, face: sign(f.x - x) || -far, ground, hurt: 0, iframe: 0, atk: 0,
    cd: 40 + Math.random() * 40, born: G.time, spd: Math.min(K.spd * (1 + n * 0.035), K.spd * 1.7), spawnT: portal, recover: 0, touched: 0, dive: null, dropFrom: null, pounce: false });
  H.spawned++;
  ring(x, y - K.h / 2, K.col, 10, 14, 24, 5); burst(x, y - K.h / 2, '#ffffff', 10, 8, 18);
}

/* ---------------- surfaces ---------------- */
// the highest walkable surface at x whose top is at or below y (the stage, or a platform that is up); null = the pit
function hordeSurface(x, y) {
  const S = STAGE; let best = x >= S.x - 6 && x <= S.x + S.w + 6 && S.y >= y - 3 ? S : null;
  for (const p of PLATS) if (platUp(p) && x >= p.x - 12 && x <= p.x + p.w + 12 && p.y >= y - 3 && (!best || p.y < best.y)) best = p;
  return best;
}
function mobLand(m, py) {
  if (m.vy < 0) return;
  const S = STAGE, hw = MOBK[m.kind].w * 0.6; let s = null;
  if (py <= S.y && m.y >= S.y && m.x > S.x - hw && m.x < S.x + S.w + hw) s = S;
  else for (const p of PLATS) if (p !== m.dropFrom && platUp(p) && py <= p.y && m.y >= p.y && m.x > p.x - 4 && m.x < p.x + p.w + 4) { s = p; break; }
  if (!s) return;
  m.y = s.y; m.vy = 0; m.ground = s; m.recover = 0; m.pounce = false; m.dropFrom = null; if (m.hurt > 0) m.vx *= 0.5;
}

/* ---------------- damage + death (the one place a KO is counted) ---------------- */
function mobHurt(m, dmg, kb, dir, x, y, col, heavy) {
  const K = MOBK[m.kind], f = fighters[0];
  m.hp -= dmg; m.iframe = 9; m.touched = G.time;
  const stagger = !K.armor || heavy || m.hp <= 0;                                // brutes shrug off light hits (a nudge, no flinch)
  if (stagger) { m.hurt = 12 + Math.min(14, kb * 0.4); m.atk = 0; m.dive = null; m.pounce = false; m.cd = Math.max(m.cd, 24);
    m.vx = dir * kb * (K.armor ? 0.5 : 0.75); m.vy = -kb * (K.armor ? 0.4 : 0.55) - 2; m.ground = null; }
  else m.vx += dir * 1.6;
  hitSparks(x, y, kb, col || '#ffffff', 2); G.hitstop = Math.max(G.hitstop, kb > 12 ? 4 : 2); G.shake = Math.max(G.shake, Math.min(6, kb * 0.3));
  if (typeof spawnBurst3D === 'function' && RENDER3D.on) spawnBurst3D(x, y, Math.min(16, kb), col || '#ffffff', { heavy, dir, mul: 0.7 });
  if (typeof addTrauma === 'function') addTrauma(kb < 9 ? 0.1 : 0.22);
  if (f && f.state !== 'ultimate') ultGain(f, heavy ? 2.4 : 1.4);               // (your hits on the horde charge the Ultimate)
  if (m.hp <= 0) mobDie(m, true);
}
function mobDie(m, credit) {
  const H = CHAL.horde; if (m.dead) return; m.dead = true;
  if (!credit) { H.toSpawn++; return; }                                           // fell out untouched: it re-enters the wave
  H.kills++;
  const K = MOBK[m.kind], x = clamp(m.x, BZ.l + 60, BZ.r - 60), y = clamp(m.y - 20, BZ.t + 60, BZ.b - 60);
  shatter(x, y, K.col, m.kind === 'brute' ? 26 : 14); ring(x, y, '#ffffff', 8, 10, 18, 4); burst(x, y, K.col, 16, 10, 24);
  textFx('+1', x, y - 50, '#ffd23a'); gameEvent('hordeKill', { kind: m.kind });
}

/* ---------------- your attacks ---------------- */
function hordePlayerHits(H, f) {
  const ult = f.state === 'ultimate' && f.ultPh && f.ultPh !== 'intro';
  for (const m of H.mobs) {
    if (m.dead || m.spawnT > 0) continue;
    if (m.iframe > 0) { m.iframe--; continue; }
    const body = mobBody(m), hb = HITBOX_LOG.find(h => h.owner === 0 && h.kind === 'hit' && overlap(h, body));
    if (hb) { const mv = hb.mv || f.move || (f.sp && f.ch.special) || {}, dmg = (mv.dmg || 7) * 1.1, kb = (mv.base || 6) + dmg * 0.55 + (mv.heavy ? 4 : 0);
      mobHurt(m, dmg, kb, sign(m.x - f.x) || f.facing, hb.x + hb.w / 2, hb.y + hb.h / 2, f.color, !!mv.heavy); continue; }
    const p = projs.find(q => q.owner === f && q.life > 0 && rectCircle(body, q.x, q.y, q.r || q.rad || 8));
    if (p) { mobHurt(m, (p.dmg || 6) * 1.1, (p.base || 5) + 3, sign(p.vx) || f.facing, p.x, p.y, f.color, false); if (!p.pierce) p.life = 0; continue; }
    if (ult && H.t % 8 === 0 && Math.hypot(m.x - f.x, m.y - f.y) < 320) mobHurt(m, 12, 12, sign(m.x - f.x) || 1, m.x, m.y - 20, f.color, true);
  }
}

/* ---------------- the enemies' brains ---------------- */
function mobStrike(m, K, f) {
  Object.assign(HORDE_ATT, { x: m.x, y: m.y, facing: m.face, color: K.col });
  deliver(HORDE_ATT, f, K.hit, m.face, m.x + m.face * K.w, m.y - K.h * 0.6, f.state === 'shield');
}
// ground kinds: decide this step's walk / jump / drop / pounce
function mobThinkGround(m, K, f, target) {
  const g = m.ground, eL = g.x + 8, eR = g.x + g.w - 8;
  if (!target) { const home = clamp(STAGE.x + STAGE.w / 2, eL, eR); m.vx = Math.abs(home - m.x) > 30 ? sign(home - m.x) * m.spd * 0.5 : 0; return; }
  const pg = hordeSurface(f.x, f.y);                                              // the surface you're on / above (null: off-stage)
  let goal = f.x, mayLeave = false;
  if (!pg) goal = clamp(f.x, eL, eR);                                             // you're over the pit: hold the ledge
  else if (pg !== g && pg.y < g.y - 10) {                                         // you're higher up: get under it and jump
    goal = clamp(f.x, pg.x + 14, pg.x + pg.w - 14);
    const need = Math.sqrt(2 * MOB_G * (g.y - pg.y + 26));
    if (need <= K.jump && Math.abs(m.x - goal) < 46 && m.cd <= 0) { m.vy = -need - 0.4; m.vx = sign(goal - m.x) * 1.6; m.ground = null; m.cd = 34; return; }
  } else if (pg !== g && pg.y > g.y + 10) {                                       // you're below: drop through / walk off toward you
    if (g !== STAGE && Math.abs(f.x - m.x) < 120) { m.dropFrom = g; m.ground = null; m.y += 1; m.vy = 1; return; }
    mayLeave = true;
  }
  const dx = goal - m.x, adx = Math.abs(f.x - m.x);
  if (m.kind === 'hopper' && m.cd <= 0 && pg && Math.abs(pg.y - g.y) < 140) {     // hop in, then pounce — only at a solid landing spot
    const far = adx >= 300, jv = far ? K.jump * 0.72 : K.jump, tAir = 2 * jv / MOB_G;
    const land = far ? m.x + sign(f.x - m.x) * 140 : clamp(f.x, pg.x + 10, pg.x + pg.w - 10), vx = clamp((land - m.x) / tAir, -6, 6);
    if (hordeSurface(m.x + vx * tAir, g.y - 140)) { m.vy = -jv; m.vx = vx; m.ground = null; m.pounce = !far; m.cd = far ? 24 : 70; return; }
  }
  const want = Math.abs(dx) > K.reach * 0.6 ? sign(dx) * m.spd * (m.kind === 'hopper' ? 0.5 : 1) : 0, nx = m.x + want;   // (hoppers mostly hop; they shuffle between hops)
  m.vx = (nx >= eL && nx <= eR) || mayLeave ? want : 0;                          // (never step off an edge by accident)
}
// drones: hover above you (spread out), telegraph, dive, climb back
function mobThinkFly(m, K, f, target) {
  const D = m.dive;
  if (D && D.ph === 'wind') { m.vx *= 0.8; m.vy = m.vy * 0.8 - 0.08; if (--D.t <= 0) { const ax = f.x - m.x, ay = f.y - 30 - m.y, L = Math.hypot(ax, ay) || 1; m.dive = { ph: 'dive', t: 36, hit: false }; m.vx = ax / L * 8.5; m.vy = ay / L * 8.5; } return; }
  if (D && D.ph === 'dive') {
    if (!D.hit && target && canBeHit(f) && overlap(mobBody(m), bodyRect(f))) { D.hit = true; mobStrike(m, K, f); }
    if (--D.t <= 0 || D.hit || m.y > f.y + 30 || m.y > STAGE.y + 40) { m.dive = { ph: 'rise', t: 34 }; m.cd = 80 + Math.random() * 50; }
    return;
  }
  if (D && D.ph === 'rise') { m.vx *= 0.9; m.vy = Math.max(m.vy - 0.35, -3.5); if (--D.t <= 0) m.dive = null; return; }
  const S = STAGE, tx = target ? clamp(f.x + ((m.id % 3) - 1) * 80, S.x - 60, S.x + S.w + 60) : S.x + S.w / 2 + ((m.id % 3) - 1) * 120;
  const ty = Math.max(BZ.t + 90, (target ? f.y : S.y) - 150 + Math.sin(G.time * 0.05 + m.id) * 16);
  m.vx = (m.vx + clamp((tx - m.x) * 0.02, -0.35, 0.35)) * 0.93; m.vy = (m.vy + clamp((ty - m.y) * 0.02, -0.35, 0.35)) * 0.93;
  const sp = Math.hypot(m.vx, m.vy), cap = m.spd * 1.4; if (sp > cap) { m.vx *= cap / sp; m.vy *= cap / sp; }
  if (target && m.cd <= 0 && Math.abs(m.x - f.x) < 140 && f.y - m.y > 60) m.dive = { ph: 'wind', t: K.wind };
}
function mobStep(H, m, f) {
  const K = MOBK[m.kind], py = m.y, target = f.state !== 'dead' && f.state !== 'respawn' && f.stocks > 0;
  if (m.spawnT > 0) { m.spawnT--; return; }                                       // materialising in the gate portal
  if (m.hurt > 0) m.hurt--; if (m.cd > 0) m.cd--;
  if (m.hurt <= 0 && target && m.atk === 0 && !(m.dive && m.dive.ph === 'dive')) m.face = sign(f.x - m.x) || m.face;
  // think
  if (m.hurt <= 0 && m.atk === 0) {
    if (K.fly) mobThinkFly(m, K, f, target);
    else if (m.ground) mobThinkGround(m, K, f, target);
    else if (!m.recover && m.vy > 0 && (m.x < STAGE.x || m.x > STAGE.x + STAGE.w) && m.y > STAGE.y - 40) {   // knocked off: one recovery leap
      m.recover = 1; m.vy = -(K.jump || 11) * 1.05; m.vx = sign(STAGE.x + STAGE.w / 2 - m.x) * 4.6; }
  }
  // move
  if (m.ground && m.ground !== STAGE && !platUp(m.ground)) m.ground = null;     // (a platform that vanished)
  if (K.fly) { if (m.hurt > 0) { m.vy += 0.35; m.vx *= 0.96; } }
  else if (m.ground) { m.vy = 0; m.y = m.ground.y; if (m.hurt > 0 || m.atk > 0) m.vx *= 0.8; }
  else { m.vy = Math.min(m.vy + MOB_G, 15); if (m.hurt > 0) m.vx *= 0.985; }
  m.x += m.vx; m.y += m.vy;
  if (!K.fly) {
    const hw = K.w * 0.6; if (m.ground && (m.x < m.ground.x - hw || m.x > m.ground.x + m.ground.w + hw)) m.ground = null;   // off the edge
    if (!m.ground) mobLand(m, py);
    if (m.dropFrom && m.y > m.dropFrom.y + 6) m.dropFrom = null;
  }
  for (const q of H.mobs) if (q !== m && !q.dead && !q.spawnT && Math.abs(q.x - m.x) < 22 && Math.abs(q.y - m.y) < 30) m.x += sign(m.x - q.x || m.id - q.id) * 0.8;   // (spread out)
  // strike: a telegraphed wind-up, then the swing lands if you're still in reach; a hopper's pounce hits on contact
  const adx = Math.abs(f.x - m.x), dy = f.y - m.y;
  if (m.pounce && target && canBeHit(f) && overlap(mobBody(m), bodyRect(f))) { m.pounce = false; mobStrike(m, K, f); }
  if (!K.fly && m.ground && m.hurt <= 0 && target && m.cd <= 0 && m.atk === 0 && adx < K.reach && Math.abs(dy) < 60 + K.h * 0.3) m.atk = K.wind;
  if (m.atk > 0 && --m.atk === 6) { if (adx < K.reach + 8 && Math.abs(dy) < 70 + K.h * 0.3 && canBeHit(f)) mobStrike(m, K, f); m.cd = 54 + Math.random() * 30; }
  // out of the arena: a KO if you knocked it there, otherwise it re-enters the wave
  if (m.x < BZ.l || m.x > BZ.r || m.y > BZ.b || m.y < BZ.t) mobDie(m, !!m.touched);
}

/* ---------------- one step of the mode ---------------- */
function hordeStep() {
  const H = CHAL.horde; if (!H || G.mode !== 'play') return;
  const f = fighters[0]; H.t++;
  hordePlayerHits(H, f);
  for (const m of H.mobs) if (!m.dead) mobStep(H, m, f);
  H.mobs = H.mobs.filter(m => !m.dead);
  // the wave director
  const alive = H.mobs.length;
  if (H.breakT > 0) { if (--H.breakT === 0) hordeWave(H.wave + 1); }
  else if (H.toSpawn > 0) { if (f.state !== 'dead' && --H.spawnCD <= 0 && alive < hordeCap(H.wave)) { hordeSpawn(); H.toSpawn--; H.spawnCD = Math.max(14, 46 - H.wave * 3); } }
  else if (alive === 0 && H.wave > 0) {
    H.cleared = H.wave; f.percent = Math.max(0, f.percent - 20); f.percentPop = 14; H.breakT = HORDE_BREAK;
    textFx('WAVE ' + H.wave + ' CLEAR!', 640, 240, '#ffd23a'); ring(f.x, f.y - 32, '#3dffb8', 10, 16, 24, 5); gameEvent('hordeClear', { n: H.wave });
  }
  // keep the closest enemies in frame (not the ones tumbling out of the arena)
  G.camExtra = H.mobs.filter(m => m.y < STAGE.y + 200 && m.y > BZ.t + 40).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x)).slice(0, 6).map(m => ({ x: m.x, y: m.y - 30 }));
  if (f.stocks <= 0) G.endText = 'WAVE ' + H.wave;
}
function hordeHudText() {
  const H = CHAL.horde; if (!H) return '';
  if (H.breakT > 0 && H.wave > 0) return 'WAVE ' + H.wave + ' CLEAR! · NEXT IN ' + Math.ceil(H.breakT / 60);
  if (!H.wave) return 'SURVIVE THE HORDE · GET READY';
  return 'WAVE ' + H.wave + ' · KO ' + H.kills + ' · ' + (H.toSpawn + H.mobs.length) + ' LEFT';
}
function hordeResult() {
  const H = CHAL.horde, me = CHARS.find(c => c === fighters[0].ch) || fighters[0].ch, rec = store.get('neonbrawl.horde', {});
  H.record = H.cleared > (rec.best || 0); if (H.record) { rec.best = H.cleared; rec.by = me.id; } rec.kills = (rec.kills || 0) + H.kills; store.set('neonbrawl.horde', rec);
  const title = H.cleared ? 'SURVIVED ' + H.cleared + ' WAVE' + (H.cleared === 1 ? '' : 'S') : 'OVERRUN!';
  $('lad-title').textContent = title; $('lad-title').dataset.text = title;
  $('lad-sub').textContent = `${me.name} · ${H.kills} KOs · ${fmtTime(H.t)}` + (H.record ? ' · NEW RECORD!' : rec.best ? ' · best ' + rec.best + ' waves' : '');
  const rows = [['🌊', 'Waves cleared', H.cleared], ['💥', 'Enemies KO\'d', H.kills], ['⏱', 'Time survived', fmtTime(H.t)], ['🏆', 'Your record', Math.max(rec.best || 0, H.cleared) + ' waves']];
  $('lad-list').innerHTML = rows.map(([i, l, v], k) => `<li class="done" style="--c:${k ? '#ff9a3d' : '#ff3d6a'}"><span class="lad-n">${i}</span><b>${l}</b><small>${v}</small><span class="lad-st">${k === 0 && H.record ? '★' : ''}</span></li>`).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="horde-again">Fight again</button><button class="btn big" data-act="horde-hub">Challenges</button><button class="btn big" data-go="scr-main">Menu</button>`;
  showScreen('scr-ladder');
}

/* ---------------- drawing ---------------- */
// glossy neon goons with glowing eyes (drones: a spinning octahedron core in a ring), a gate portal while they materialise,
// a wind-up glow before every strike, an HP pip bar
function collectHorde3D() {
  const H = CHAL.horde; if (!H) return; const t = G.time;
  for (const m of H.mobs) {
    const K = MOBK[m.kind], c = m.hurt > 6 ? [1, 1, 1] : col3(K.col), dk = mix3(c, [0.05, 0.05, 0.1], 0.55), x = m.x, y = m.y, f = m.face;
    if (m.spawnT > 0) { const k = 1 - m.spawnT / HORDE_PORTAL; ringG(x, y - K.h / 2, 0, K.h * (0.5 + 0.5 * k), 3, c, 1.4 * (1 - k * 0.5), 1.57, t * 0.2);
      bG('sph', x, y - K.h / 2, 0, K.w * k, K.h * 0.5 * k, K.w * k, c, 0.9 * k); continue; }
    const wind = m.atk > 6 ? (K.wind - m.atk) / (K.wind - 6) : m.dive && m.dive.ph === 'wind' ? 1 - m.dive.t / K.wind : 0, sq = m.atk > 6 ? 1 - wind * 0.2 : 1;
    if (K.fly) { const yy = y - 14, spin = m.dive && m.dive.ph === 'dive' ? t * 0.5 : t * 0.1; bL('octa', x, yy, 0, K.w * 0.8, K.h * 0.6, K.w * 0.8, c, 0.4, spin); ringG(x, yy, 0, K.w * 1.3, 2, c, 1.1, 0.4, t * 0.15);
      bG('sph', x + f * 5, yy - 2, 8, 3.5, 3.5, 3.5, [1, 1, 1], 1.4); if (wind) bG('sph', x, yy, 0, 30, 30, 30, c, 0.5 * wind);
      if (m.dive && m.dive.ph === 'dive') sG('tube', x - m.vx * 4, yy - m.vy * 4, 0, x, yy, 0, 6, c, 0.5); }
    else {
      const h = K.h * sq, w = K.w * (2 - sq);
      bL('sph', x, y - h * 0.42, 0, w, h * 0.42, w * 0.85, dk, 0.1);                                     // the body
      bL('sph', x + f * 2, y - h * 0.88, 0, w * 0.78, w * 0.72, w * 0.7, c, 0.3);                       // the head
      for (const s of [-1, 1]) bG('sph', x + f * w * 0.5, y - h * 0.9, s * w * 0.32, 2.6, 3.2, 2, [1, 0.95, 0.6], 1.5);   // eyes
      const reach = wind > 0 ? -wind * 10 : m.atk > 0 ? 18 : 6;
      sL('tube', x + f * w * 0.4, y - h * 0.55, w * 0.6, x + f * (w + reach), y - h * 0.45, w * 0.6, 3.6, dk, 0.1); bL('sph', x + f * (w + reach), y - h * 0.45, w * 0.6, 5, 5, 5, c, 0.4);   // the swinging arm + fist
      if (m.kind === 'brute') for (const s of [-1, 1]) sL('cone', x + s * w * 0.5, y - h * 0.86, 0, x + s * w * 0.9, y - h * 1.12, 0, 3, [0.95, 0.9, 0.85], 0.2);   // horns
      if (wind) bG('sph', x, y - h * 0.5, 0, w * 1.6, h * 0.7, w * 1.4, c, 0.4 * wind);                // the wind-up glow
      ringFloor(x, (m.ground ? m.ground.y : y) - 1, w * 1.2, w * 0.7, c, 0.35);
    }
    const hpk = clamp(m.hp / m.max, 0, 1), bw = K.w * 2.2, top = y - (K.fly ? 46 : K.h + 14);
    bF('box', x, top, 6, bw, 3, 1.5, [0.08, 0.08, 0.12], 1); bF('box', x - bw / 2 + bw * hpk / 2, top, 7, bw * hpk, 3, 1.5, hpk > 0.5 ? [0.3, 1, 0.5] : hpk > 0.25 ? [1, 0.8, 0.2] : [1, 0.25, 0.3], 1);
  }
}
function drawHorde2D() {
  const H = CHAL.horde; if (!H) return; ctx.save();
  for (const m of H.mobs) { const K = MOBK[m.kind]; ctx.globalAlpha = m.spawnT > 0 ? 1 - m.spawnT / HORDE_PORTAL : 1; ctx.fillStyle = m.hurt > 6 ? '#ffffff' : K.col; ctx.beginPath(); ctx.ellipse(m.x, m.y - K.h / 2, K.w, K.h / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6a0'; ctx.fillRect(m.x + m.face * K.w * 0.4 - 2, m.y - K.h * 0.85, 4, 4);
    ctx.fillStyle = '#14141e'; ctx.fillRect(m.x - K.w, m.y - K.h - 12, K.w * 2, 4); ctx.fillStyle = '#3dff7a'; ctx.fillRect(m.x - K.w, m.y - K.h - 12, K.w * 2 * clamp(m.hp / m.max, 0, 1), 4); }
  ctx.restore();
}
