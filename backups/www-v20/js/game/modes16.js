/* NEON BRAWL — v16 modes: COIN SCRAMBLE (Minigames) + the shared HUD text / sounds / menu wiring of both v16 modes.
 * (SURVIVE THE HORDE itself was rewritten for v18 and lives in game/horde18.js.)
 *
 *   COIN SCRAMBLE       90 seconds vs the CPU: coins rain from the sky (gold coins are worth 5), land on the platforms and blink
 *                       away after 10 s. Touch them to collect. A solid hit knocks coins out of your rival; a KO spills five.
 *                       Stocks are endless — most coins when the clock runs out wins. The CPU chases coins and fights for them.
 * Both run offline; both pay Coins + Battle Pass XP and have titles.                                                    */
'use strict';

Object.assign(STAGE_MUSIC, { coinrush: ['tropical', 136, 55, 'major', 0.1, { name: 'Gold Fever' }] });
// (v18: Survive the Horde moved to game/horde18.js — a rewrite of the v16 mode)

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
  if (CHAL.mode === 'horde' && CHAL.horde) return hordeHudText();                // (game/horde18.js)
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
