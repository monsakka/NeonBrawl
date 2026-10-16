/* NEON BRAWL — v16 modes: SURVIVE THE HORDE (Challenges) and COIN SCRAMBLE (Minigames).
 *
 *   SURVIVE THE HORDE   endless waves of low-HP holographic enemies pour into the Horde Pit: grunts that march in and swing,
 *                       hoppers that leap at you, drones that hover and dive, and from wave 4 armoured brutes. Your real
 *                       attacks hurt them (every hitbox you log, every projectile, your Ultimate's blast), they launch and
 *                       shatter; they hit you through the normal damage + knockback + shield + parry rules. Clearing a wave
 *                       heals 20 % and the next is bigger and faster. Three stocks; how far can you get?
 *   COIN SCRAMBLE       90 seconds vs the CPU: coins rain from the sky (gold coins are worth 5), land on the platforms and blink
 *                       away after 10 s. Touch them to collect. A solid hit knocks coins out of your rival; a KO spills five.
 *                       Stocks are endless — most coins when the clock runs out wins. The CPU chases coins and fights for them.
 * Both run offline; both pay Coins + Battle Pass XP and have titles.                                                    */
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
Object.assign(STAGE_MUSIC, { hordepit: ['cyber', 158, 50, 'phrygian', 0.1, { name: 'No Way Out' }], coinrush: ['tropical', 136, 55, 'major', 0.1, { name: 'Gold Fever' }] });

const MOBK = {                                   // kind → body: hp, half-width, height, speed, hit
  grunt:  { hp: 14, w: 15, h: 46, spd: 1.9, col: '#ff3d6a', hit: { dmg: 5, base: 5, scale: 0.05, ang: 40 }, reach: 46 },
  hopper: { hp: 10, w: 13, h: 34, spd: 3.2, col: '#3dff7a', hit: { dmg: 4, base: 4.5, scale: 0.045, ang: 55 }, reach: 38 },
  flyer:  { hp: 9,  w: 14, h: 26, spd: 2.6, col: '#3df0ff', hit: { dmg: 4, base: 5, scale: 0.05, ang: 70 }, reach: 40, fly: true },
  brute:  { hp: 42, w: 24, h: 70, spd: 1.2, col: '#b45aff', hit: { dmg: 10, base: 8, scale: 0.08, ang: 42, heavy: true }, reach: 62 }
};
const HORDE_ATT = { isHazard: true, id: -1, ch: {}, color: '#ff3d6a', x: 0, y: 0, facing: 1, cmbN: 0 };
function hordeStart() {
  CHAL.mode = 'horde';
  withSel({ cpu: SEL.p1, stage: HORDE_STAGE, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  const [p, o] = fighters;
  p.stocks = 3; Object.assign(o, { state: 'dead', deadT: 1e9, stocks: 1, x: -5000, y: -5000, ult: 0 });
  CHAL.horde = { wave: 0, toSpawn: 0, spawnCD: 0, mobs: [], kills: 0, t: 0, breakT: 90, nextId: 1, best: store.get('neonbrawl.horde', {}).best || 0, cleared: 0 };
  G.endText = null;
}
function hordeWave(n) {
  const H = CHAL.horde; H.wave = n; H.toSpawn = 4 + n * 2; H.spawnCD = 20;
  textFx('WAVE ' + n, 640, 260, '#ff3d6a'); G.flash = Math.max(G.flash, 0.25); gameEvent('hordeWave', { n });
}
function hordeSpawn() {
  const H = CHAL.horde, n = H.wave, r = Math.random(), S = STAGE;
  const kind = n >= 4 && r < 0.12 + n * 0.01 ? 'brute' : n >= 2 && r < 0.42 ? 'flyer' : n >= 1 && r < 0.66 ? 'hopper' : 'grunt';
  const K = MOBK[kind], side = Math.random() < 0.5 ? -1 : 1, x = S.x + S.w / 2 + side * (S.w / 2 - 40 - Math.random() * 120), y = K.fly ? S.y - 300 - Math.random() * 80 : S.y - 380;
  const hpK = 1 + (n - 1) * 0.12;
  H.mobs.push({ id: H.nextId++, kind, x, y, vx: 0, vy: 0, hp: K.hp * hpK, max: K.hp * hpK, face: -side, ground: null, hurt: 0, iframe: 0, atk: 0, cd: 40 + Math.random() * 40, born: G.time, spd: Math.min(K.spd * (1 + n * 0.035), K.spd * 1.7) });
  ring(x, y, K.col, 10, 14, 24, 5); burst(x, y, '#ffffff', 10, 8, 18);
}
// the surfaces a mob can stand on: the main stage + every platform that is up
function mobLand(m, py) {
  const S = STAGE, hw = MOBK[m.kind].w;
  if (m.vy >= 0 && py <= S.y && m.y >= S.y && m.x > S.x - hw && m.x < S.x + S.w + hw) { m.y = S.y; m.vy = 0; m.ground = S; return; }
  for (const p of PLATS) if (platUp(p) && m.vy >= 0 && py <= p.y && m.y >= p.y && m.x > p.x - 4 && m.x < p.x + p.w + 4) { m.y = p.y; m.vy = 0; m.ground = p; return; }
}
function mobHurt(m, dmg, kb, dir, x, y, col) {
  const H = CHAL.horde;
  m.hp -= dmg; m.hurt = 12; m.iframe = 9; m.atk = 0; m.cd = Math.max(m.cd, 24);
  m.vx = dir * kb * 0.75; m.vy = -kb * 0.55 - 2; m.ground = null;
  hitSparks(x, y, kb, col || '#ffffff', 2); G.hitstop = Math.max(G.hitstop, kb > 12 ? 4 : 2); G.shake = Math.max(G.shake, Math.min(6, kb * 0.3));
  if (m.hp <= 0) { m.dead = true; H.kills++; shatter(m.x, m.y - 20, MOBK[m.kind].col, m.kind === 'brute' ? 26 : 14); ring(m.x, m.y - 20, '#ffffff', 8, 10, 18, 4); burst(m.x, m.y - 20, MOBK[m.kind].col, 16, 10, 24);
    textFx('+1', m.x, m.y - 70, '#ffd23a'); gameEvent('hordeKill', { kind: m.kind }); }
}
function hordeStep() {
  const H = CHAL.horde; if (!H || G.mode !== 'play') return;
  const f = fighters[0]; H.t++;
  // the wave director
  const alive = H.mobs.length;
  if (H.breakT > 0) { if (--H.breakT === 0) hordeWave(H.wave + 1); }
  else if (H.toSpawn > 0) { if (--H.spawnCD <= 0 && alive < Math.min(12, 4 + H.wave)) { hordeSpawn(); H.toSpawn--; H.spawnCD = Math.max(14, 46 - H.wave * 3); } }
  else if (alive === 0 && H.wave > 0) { H.cleared = H.wave; f.percent = Math.max(0, f.percent - 20); f.percentPop = 14; textFx('WAVE ' + H.wave + ' CLEAR!', 640, 240, '#ffd23a'); ring(f.x, f.y - 32, '#3dffb8', 10, 16, 24, 5); H.breakT = 150; gameEvent('hordeClear', { n: H.wave }); }
  // your attacks: every hitbox you logged this step · your projectiles · your Ultimate's blast
  const ult = f.state === 'ultimate' && f.ultPh && f.ultPh !== 'intro';
  for (const m of H.mobs) {
    if (m.dead) continue; const K = MOBK[m.kind], body = { x: m.x - K.w, y: m.y - K.h, w: K.w * 2, h: K.h };
    if (m.iframe > 0) m.iframe--;
    else {
      const hb = HITBOX_LOG.find(h => h.owner === 0 && overlap(h, body));
      if (hb) { const mv = f.move || (f.sp && f.ch.special) || {}, dmg = (mv.dmg || 7) * 1.1, kb = (mv.base || 6) + dmg * 0.55 + (mv.heavy ? 4 : 0);
        mobHurt(m, dmg, kb, sign(m.x - f.x) || f.facing, hb.x + hb.w / 2, hb.y + hb.h / 2, f.color); }
      else { const p = projs.find(q => q.owner === f && q.life > 0 && rectCircle(body, q.x, q.y, q.r || q.rad || 8));
        if (p) { mobHurt(m, (p.dmg || 6) * 1.1, (p.base || 5) + 3, sign(p.vx) || f.facing, p.x, p.y, f.color); if (!p.pierce) p.life = 0; }
        else if (ult && H.t % 8 === 0 && Math.hypot(m.x - f.x, m.y - f.y) < 320) mobHurt(m, 12, 12, sign(m.x - f.x) || 1, m.x, m.y - 20, f.color); }
    }
  }
  // the mobs think, move, fall and strike
  for (const m of H.mobs) {
    if (m.dead) continue; const K = MOBK[m.kind], py = m.y, dx = f.x - m.x, dy = f.y - m.y, adx = Math.abs(dx), target = f.state !== 'dead' && f.state !== 'respawn';
    if (m.hurt > 0) m.hurt--; if (m.cd > 0) m.cd--;
    if (m.hurt <= 0 && target) m.face = sign(dx) || m.face;
    if (K.fly) {                                                                // drones: hover above you, then dive
      const tx = f.x - m.face * 30, ty = m.atk > 0 ? f.y - 30 : f.y - 130 + Math.sin(G.time * 0.05 + m.id) * 20;
      if (m.hurt <= 0) { m.vx += clamp(tx - m.x, -1, 1) * 0.22; m.vy += clamp(ty - m.y, -1, 1) * 0.22; }
      m.vx *= 0.93; m.vy *= 0.93; if (m.hurt > 0) m.vy += 0.35;
    } else {
      m.vy = Math.min(m.vy + PHYS.grav * 0.9, 16);
      if (m.ground && m.hurt <= 0 && m.atk === 0 && target) {
        const edgeL = m.ground.x + 6, edgeR = m.ground.x + m.ground.w - 6, want = adx > K.reach * 0.8 ? sign(dx) * m.spd : 0, nx = m.x + want;
        const below = dy > 40;                                                  // (step off the edge only to chase you down)
        if (m.kind === 'hopper') { if (m.cd <= 0 && adx < 360) { m.vy = -11.5; m.vx = sign(dx) * 4.2; m.ground = null; m.cd = 50; } else m.vx = 0; }
        else m.vx = (nx > edgeL && nx < edgeR) || below ? want : 0;
        if (m.kind !== 'hopper' && dy < -70 && adx < 160 && m.cd <= 0) { m.vy = -12.5; m.ground = null; m.cd = 40; }     // jump up to your platform
      } else if (!m.ground) m.vx *= 0.99;
      else m.vx *= 0.8;
    }
    m.x += m.vx; m.y += m.vy;
    if (!K.fly) { if (m.ground && (m.x < m.ground.x - K.w || m.x > m.ground.x + m.ground.w + K.w)) m.ground = null; if (!m.ground) mobLand(m, py); }
    for (const q of H.mobs) if (q !== m && !q.dead && Math.abs(q.x - m.x) < 22 && Math.abs(q.y - m.y) < 30) m.x += sign(m.x - q.x || m.id - q.id) * 0.8;   // (spread out)
    // the strike: a short wind-up (they glow), then the swing lands if you're still in reach
    if (m.hurt <= 0 && target && m.cd <= 0 && m.atk === 0 && adx < K.reach && Math.abs(dy) < 60 + K.h * 0.3) m.atk = 22;
    if (m.atk > 0 && --m.atk === 6) {
      if (adx < K.reach + 8 && Math.abs(dy) < 70 + K.h * 0.3 && canBeHit(f)) { Object.assign(HORDE_ATT, { x: m.x, y: m.y, facing: m.face, color: K.col });
        deliver(HORDE_ATT, f, K.hit, m.face, m.x + m.face * K.w, m.y - K.h * 0.6, f.state === 'shield'); }
      m.cd = 54 + Math.random() * 30;
    }
    if (m.x < BZ.l || m.x > BZ.r || m.y > BZ.b || m.y < BZ.t) { m.dead = true; if (m.hurt > 0 || m.hp < m.max) { H.kills++; textFx('+1', clamp(m.x, BZ.l + 60, BZ.r - 60), clamp(m.y, BZ.t + 60, BZ.b - 60), '#ffd23a'); } }
  }
  H.mobs = H.mobs.filter(m => !m.dead);
  G.camExtra = H.mobs.filter(m => m.y < STAGE.y + 300).slice(0, 6).map(m => ({ x: m.x, y: m.y - 30 }));
  if (f.stocks <= 0 || (f.state === 'dead' && f.stocks <= 0)) G.endText = 'WAVE ' + H.wave;
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
// the enemies in 3D: glossy neon goons with glowing eyes (drones: a spinning octahedron core in a ring), an HP pip bar
function collectHorde3D() {
  const H = CHAL.horde; if (!H) return; const t = G.time;
  for (const m of H.mobs) {
    const K = MOBK[m.kind], c = m.hurt > 6 ? [1, 1, 1] : col3(K.col), dk = mix3(c, [0.05, 0.05, 0.1], 0.55), x = m.x, y = m.y, sq = m.atk > 6 ? 1 - (22 - m.atk) * 0.012 : 1, f = m.face;
    const wind = m.atk > 6 ? (22 - m.atk) / 16 : 0;
    if (K.fly) { const yy = y - 14; bL('octa', x, yy, 0, K.w * 0.8, K.h * 0.6, K.w * 0.8, c, 0.4, t * 0.1); ringG(x, yy, 0, K.w * 1.3, 2, c, 1.1, 0.4, t * 0.15);
      bG('sph', x + f * 5, yy - 2, 8, 3.5, 3.5, 3.5, [1, 1, 1], 1.4); if (wind) bG('sph', x, yy, 0, 30, 30, 30, c, 0.5 * wind); }
    else {
      const h = K.h * sq, w = K.w * (2 - sq);
      bL('sph', x, y - h * 0.42, 0, w, h * 0.42, w * 0.85, dk, 0.1);                                     // the body
      bL('sph', x + f * 2, y - h * 0.88, 0, w * 0.78, w * 0.72, w * 0.7, c, 0.3);                       // the head
      for (const s of [-1, 1]) bG('sph', x + f * w * 0.5, y - h * 0.9, s * w * 0.32, 2.6, 3.2, 2, [1, 0.95, 0.6], 1.5);   // eyes
      const reach = wind > 0 ? -wind * 10 : m.atk > 0 ? 18 : 6;
      sL('tube', x + f * w * 0.4, y - h * 0.55, w * 0.6, x + f * (w + reach), y - h * 0.45, w * 0.6, 3.6, dk, 0.1); bL('sph', x + f * (w + reach), y - h * 0.45, w * 0.6, 5, 5, 5, c, 0.4);   // the swinging arm + fist
      if (m.kind === 'brute') for (const s of [-1, 1]) sL('cone', x + s * w * 0.5, y - h * 0.86, 0, x + s * w * 0.9, y - h * 1.12, 0, 3, [0.95, 0.9, 0.85], 0.2);   // horns
      if (wind) bG('sph', x, y - h * 0.5, 0, w * 1.6, h * 0.7, w * 1.4, c, 0.45 * wind);                // the wind-up glow
      ringFloor(x, (m.ground ? m.ground.y : y) - 1, w * 1.2, w * 0.7, c, 0.35);
    }
    const hpk = clamp(m.hp / m.max, 0, 1), bw = K.w * 2.2, top = y - (K.fly ? 46 : K.h + 14);
    bF('box', x, top, 6, bw, 3, 1.5, [0.08, 0.08, 0.12], 1); bF('box', x - bw / 2 + bw * hpk / 2, top, 7, bw * hpk, 3, 1.5, hpk > 0.5 ? [0.3, 1, 0.5] : hpk > 0.25 ? [1, 0.8, 0.2] : [1, 0.25, 0.3], 1);
  }
}
function drawHorde2D() {
  const H = CHAL.horde; if (!H) return; ctx.save();
  for (const m of H.mobs) { const K = MOBK[m.kind]; ctx.fillStyle = m.hurt > 6 ? '#ffffff' : K.col; ctx.beginPath(); ctx.ellipse(m.x, m.y - K.h / 2, K.w, K.h / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6a0'; ctx.fillRect(m.x + m.face * K.w * 0.4 - 2, m.y - K.h * 0.85, 4, 4);
    ctx.fillStyle = '#14141e'; ctx.fillRect(m.x - K.w, m.y - K.h - 12, K.w * 2, 4); ctx.fillStyle = '#3dff7a'; ctx.fillRect(m.x - K.w, m.y - K.h - 12, K.w * 2 * clamp(m.hp / m.max, 0, 1), 4); }
  ctx.restore();
}

/* ============================== Coin Scramble ============================== */
const COINS_LIMIT = 90 * 60;
function coinStart() {
  CHAL.mode = 'coins';
  const pool = playableStages().filter(i => !STAGES[i].hazard && STAGES[i].plats && STAGES[i].plats.length >= 2), st = pool.length ? pool[Math.floor(Math.random() * pool.length)] : SEL.stage;
  withSel({ stage: st, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  for (const f of fighters) f.stocks = 99;
  G.coins16 = { coins: [], score: [0, 0], t: 0, spawnCD: 40, done: false, best: [0, 0], nextId: 1 };
  G.endText = null;
}
function coinDrop(x, y, v, vx, vy) { const C = G.coins16; C.coins.push({ id: C.nextId++, x, y, vx: vx || 0, vy: vy || 0, v: v || 1, ground: null, born: G.time, life: 600 }); }
function coinsStep() {
  const C = G.coins16; if (!C || C.done) return;
  if (G.mode !== 'play') return;
  C.t++;
  if (--C.spawnCD <= 0) { const S = STAGE, x = S.x + 40 + Math.random() * (S.w - 80); coinDrop(x, S.y - 520 - Math.random() * 80, Math.random() < 0.1 ? 5 : 1); C.spawnCD = 30 + Math.floor(Math.random() * 20) - Math.min(14, C.t / 400); }
  for (const c of C.coins) {
    const py = c.y;
    if (!c.ground) { c.vy = Math.min(c.vy + 0.22, 7); c.vx *= 0.99; c.x += c.vx; c.y += c.vy; const S = STAGE;
      if (c.vy >= 0 && py <= S.y && c.y >= S.y && c.x > S.x && c.x < S.x + S.w) { c.y = S.y; c.ground = S; }
      else for (const p of PLATS) if (platUp(p) && c.vy >= 0 && py <= p.y && c.y >= p.y && c.x > p.x && c.x < p.x + p.w) { c.y = p.y; c.ground = p; break; }
      if (c.ground) { c.vy = 0; c.vx = 0; ring(c.x, c.y, '#ffd23a', 4, 4, 10, 2); } }
    else if (!platUp(c.ground)) c.ground = null;
    if (--c.life <= 0 || c.y > BZ.b) c.gone = true;
    for (const f of fighters) { if (c.gone || f.state === 'dead' || f.state === 'respawn') continue;
      if (rectCircle(bodyRect(f), c.x, c.y - 10, 12)) { c.gone = true; C.score[f.id] += c.v; burst(c.x, c.y - 10, '#ffe680', c.v > 1 ? 18 : 8, 6, 16, 'dot'); ring(c.x, c.y - 10, '#ffd23a', 4, 6, 12, 3);
        textFx('+' + c.v, c.x, c.y - 60, c.v > 1 ? '#ffffff' : '#ffd23a'); gameEvent('coinGrab', { f, v: c.v }); } }
  }
  C.coins = C.coins.filter(c => !c.gone);
  if (C.t >= COINS_LIMIT) {
    C.done = true; const [a, b] = fighters, w = C.score[0] === C.score[1] ? null : C.score[0] > C.score[1] ? a : b;
    G.mode = 'ending'; G.endT = 150; G.winner = w; G.finishAt = G.time; G.hitstop = 30; G.matchTime = G.frame; G.endText = w ? w.ch.name + ' WINS ' + Math.max(...C.score) + '–' + Math.min(...C.score) : 'DRAW ' + C.score[0] + '–' + C.score[1];
  }
}
// hits knock coins loose; a KO spills five (from the blast point, back over the stage)
GAME_EVENT_LISTENERS.push((type, d) => {
  const C = G.coins16; if (!C || C.done) return;
  if (type === 'hit' && d.vic && !d.vic.isHazard && d.kb >= 8) { const id = d.vic.id, n = Math.min(C.score[id], d.kb >= 15 ? 3 : d.kb >= 11 ? 2 : 1);
    for (let k = 0; k < n; k++) coinDrop(d.vic.x, d.vic.y - 50, 1, (Math.random() - 0.5) * 7, -6 - Math.random() * 3); C.score[id] -= n; }
  else if (type === 'ko' && d.f) { const id = d.f.id, n = Math.min(C.score[id], 5), S = STAGE;
    for (let k = 0; k < n; k++) coinDrop(clamp(d.x, S.x + 60, S.x + S.w - 60), S.y - 380 - k * 20, 1, (Math.random() - 0.5) * 5, 0); C.score[id] -= n; }
});
// the CPU in Coin Scramble: grab coins that are closer to it than to you, otherwise fight (the normal brain)
function coinAI(f, o) {
  const C = G.coins16; if (!C || f.state !== 'free') return null;
  const lvl = G.diff, reach = [180, 260, 340, 420][lvl]; let best = null, bd = 1e9;
  for (const c of C.coins) { const d = Math.hypot(c.x - f.x, (c.y - f.y) * 1.4), od = Math.hypot(c.x - o.x, (c.y - o.y) * 1.4); if (d < reach && d < od * 1.15 && d - c.v * 30 < bd) { bd = d - c.v * 30; best = c; } }
  if (!best || Math.random() < [0.25, 0.12, 0.05, 0][lvl]) return null;
  const inp = emptyInput(), dx = best.x - f.x, dy = best.y - f.y;
  if (dx > 8) inp.right = true; else if (dx < -8) inp.left = true;
  if (dy < -50 && (f.onGround || f.vy > 0) && Math.abs(dx) < 220) inp.jumpP = true;
  if (dy > 60 && f.onGround && f.ground !== 'stage') inp.down = true;
  return inp;
}
function coinsResult() {
  const C = G.coins16, me = fighters[0], foe = fighters[1], won = G.winner === me, t = won ? 'GOLD RUSH!' : G.winner ? 'OUT-SCRAMBLED' : 'DEAD HEAT';
  $('lad-title').textContent = t; $('lad-title').dataset.text = t;
  $('lad-sub').textContent = `${me.ch.name} ${C.score[0]} – ${C.score[1]} ${foe.ch.name} · ${DIFFS[G.diff].name} CPU`;
  $('lad-list').innerHTML = [['🪙', 'Coins held at the bell', C.score[0], C.score[1]], ['⏱', 'Round', '1:30', '']].map(([i, l, a, b], k) => `<li class="done" style="--c:${k ? '#3dfff0' : '#ffd23a'}"><span class="lad-n">${i}</span><b>${l}</b><small>${me.ch.name} ${a}${b !== '' ? ' · ' + foe.ch.name + ' ' + b : ''}</small><span class="lad-st">${k === 0 && won ? '✓' : ''}</span></li>`).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="coins-again">Rematch</button><button class="btn big" data-act="mini-hub">Minigames</button><button class="btn big" data-go="scr-main">Menu</button>`;
  const rec = store.get('neonbrawl.minigames', {}), r = rec.coins || (rec.coins = { played: 0, wins: 0, best: 0 }); r.played++; if (won) r.wins++; r.best = Math.max(r.best, C.score[0]); store.set('neonbrawl.minigames', rec);
  C.won = won; showScreen('scr-ladder');
}
function collectCoins3D() {
  const C = G.coins16; if (!C) return; const t = G.time, gold = [1, 0.8, 0.22], white = [1, 0.97, 0.85];
  for (const c of C.coins) {
    if (c.life < 120 && ((t >> 2) & 1)) continue;                               // blinking before it vanishes
    const big = c.v > 1, r = big ? 16 : 11, y = c.y - r - 2 + (c.ground ? Math.sin(t * 0.08 + c.id) * 2 : 0), spin = t * 0.08 + c.id;
    bL('disc', c.x, y, 0, r, 2.4, r, big ? white : gold, 0.35, spin, 0, Math.PI / 2); bL('torus', c.x, y, 0, r, r, r * 0.6, gold, 0.4, spin, 0, Math.PI / 2);
    if (big) bG('star4', c.x, y, 3, 6, 6, 3, [1, 1, 1], 1.4, 0, t * 0.1);
    bG('sph', c.x, y, 0, r * 2, r * 2, r * 2, gold, big ? 0.5 : 0.28);
    if (!c.ground) sG('tube', c.x, y - 30, 0, c.x, y - 6, 0, 2, gold, 0.25);
  }
}
function drawCoins2D() {
  const C = G.coins16; if (!C) return; ctx.save();
  for (const c of C.coins) { if (c.life < 120 && ((G.time >> 2) & 1)) continue; const r = c.v > 1 ? 14 : 9; ctx.fillStyle = c.v > 1 ? '#fff4c0' : '#ffd23a'; ctx.strokeStyle = '#a8740a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y - r - 2, r * Math.abs(Math.cos(G.time * 0.08 + c.id)) + 2, r, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
// the scoreboard (shares the Volley Brawl board element)
function coinsHUD() {
  const C = G.coins16, on = !!C && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending');
  if (!MINI_HUD.el) { MINI_HUD.el = document.createElement('div'); MINI_HUD.el.className = 'vb-board'; HUD.el.appendChild(MINI_HUD.el); }
  HUD.el.classList.toggle('volley', on);
  const left = C ? Math.max(0, Math.ceil((COINS_LIMIT - C.t) / 60)) : 0, k = on ? 'c' + C.score.join(':') + '|' + left : '';
  if (k === MINI_HUD.k) return; MINI_HUD.k = k; MINI_HUD.el.style.display = on ? 'flex' : 'none'; if (!on) return;
  const [a, b] = fighters;
  MINI_HUD.el.innerHTML = `<span class="vb-side" style="--pc:${a.color}"><b>${a.ch.name}</b><i>🪙</i></span><span class="vb-score"><em style="color:${a.color}">${C.score[0]}</em><small>COIN SCRAMBLE · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</small><em style="color:${b.color}">${C.score[1]}</em></span><span class="vb-side r" style="--pc:${b.color}"><i>🪙</i><b>${b.ch.name}</b></span>`;
}
function modesHudText() {
  if (CHAL.mode === 'horde' && CHAL.horde) { const H = CHAL.horde; return H.breakT > 0 && H.wave > 0 ? 'WAVE ' + H.wave + ' CLEAR!' : H.wave ? 'WAVE ' + H.wave + ' · KO ' + H.kills + ' · ' + (H.toSpawn + H.mobs.length) + ' LEFT' : 'SURVIVE THE HORDE'; }
  return '';
}

/* ============================== sounds + menu wiring ============================== */
Object.assign(SFX, {
  coinGrab(big) { const t = AUDIO.ctx.currentTime; tone({ type: 'square', f0: mtof(big ? 88 : 83), dur: 0.06, gain: 0.05 }); tone({ type: 'square', f0: mtof(big ? 95 : 90), dur: 0.14, gain: 0.05, at: t + 0.06 }); },
  hordeWave() { const t = AUDIO.ctx.currentTime; [52, 55, 59].forEach((n, i) => tone({ type: 'sawtooth', f0: mtof(n), dur: 0.5, gain: 0.05, at: t + i * 0.12, filter: 'lowpass', ff: 900, verb: 0.4 })); },
  hordeKill() { noise({ f0: 3000, f1: 600, dur: 0.12, gain: 0.07, filter: 'bandpass' }); }
});
GAME_EVENT_LISTENERS.push((type, d) => { if (type === 'coinGrab') sfx('coinGrab', d.v > 1 ? 1 : 0); else if (type === 'hordeWave') sfx('hordeWave'); else if (type === 'hordeKill') sfx('hordeKill'); });
$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
  if (a === 'chal-horde') { SEL.challenge = 'horde'; go('scr-select'); }
  else if (a === 'horde-again') hordeStart();
  else if (a === 'horde-hub') { go('scr-challenge'); hubShow('chal', 'horde'); }
  else if (a === 'mini-coins') { SEL.challenge = 'coins'; go('scr-select'); }
  else if (a === 'coins-again') coinStart();
  else if (a === 'minigames-open') { go('scr-challenge'); hubShow('chal', 'mini'); }
});
