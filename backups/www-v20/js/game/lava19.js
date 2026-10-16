/* NEON BRAWL — v19 minigame: THE FLOOR IS LAVA (Challenges → Minigames).
 *
 *   THE FOUNDRY   a main floor and seven floating stone platforms over a sea of lava. 3 stocks each vs the CPU; KO them
 *                 off the top or sides as usual — but the lava is the real enemy.
 *   THE LAVA      starts well below the floor and keeps rising. After 22 s the MAIN FLOOR SINKS into it (the ledges go down
 *                 with it): from then on the floor is lava and only the platforms are safe. From 45 s the lava SURGES every
 *                 11 s — a telegraphed swell (bubbling, a warning) that swallows the low platforms for a few seconds.
 *   PLATFORMS     every few seconds one platform cracks and glows red (2⅓ s warning), then slowly sinks into the lava; later it
 *                 re-emerges somewhere nearby, glowing hot, and rises back to its height. Never fewer than three safe spots.
 *   BURNS         touching the lava scorches you (9 %) and pops you straight up out of it — with knockback that grows with your
 *                 damage, so a few dips late in a stock will launch you off the top. A short grace stops repeat burns.
 *   THE CPU       knows where the safe ground is: it abandons a cracking platform, climbs above surges, recovers to the
 *                 nearest safe surface (double jump, then its up-special) and never drops through into the lava; otherwise
 *                 it fights as usual. Time limit 2:30 — most stocks, then lowest damage, wins.                          */
'use strict';

const LAVA = { LIMIT: 150 * 60, CALM: 5 * 60, SINK_AT: 22 * 60, SINK_V: 0.32, SURGE_AT: 45 * 60, SURGE_EVERY: 11 * 60, SURGE_H: 75, SURGE_T: 170,
  BURN: { dmg: 9, base: 10.5, scale: 0.075, ang: 90, heavy: true }, CD: 45 };
const LAVA_SLOTS = [[150, 410, 150], [980, 410, 150], [420, 330, 150], [710, 330, 150], [565, 225, 150], [255, 235, 130], [895, 235, 130]];
const LAVA_ATT = { isHazard: true, id: -1, ch: {}, color: '#ff7a2a', x: 0, y: 0, facing: 1, cmbN: 0 };
// a fresh stage object every match (loadStage keeps a reference to it, and this one sinks)
function lavaStageDef() {
  return { id: 'lavafoundry', name: 'Magma Foundry', tag: 'Minigame · The Floor is Lava', clean: true,
    desc: 'A sunken foundry: the floor melts into a rising sea of lava and the stone platforms take turns sinking.',
    main: { x: 260, y: 520, w: 760, h: 70 }, plats: LAVA_SLOTS.map(([x, y, w]) => ({ x, y, w, h: 12 })),
    bz: { l: -340, r: 1620, t: -500, b: 1000 }, spawns: [470, 810],
    pal: { fill: ['#3a1a14', '#140806'], edge: '#ff7a2a', top: '#ffd0a0', plat: '#ff9a3d', glow: '#ff5a1f', bz: 'rgba(255,90,31,0.32)' } };
}
Object.assign(THEME3D, { lavafoundry: THEME3D.caldera || THEME3D.volcano || 'volcano' }); Object.assign(LIGHT_RIG, { lavafoundry: LIGHT_RIG.caldera || LIGHT_RIG.volcano || 'strobe' });
Object.assign(WX_STAGE, { lavafoundry: ['embers', 'ash'] }); Object.assign(ATMO, { lavafoundry: ['ember', 40, ['#ff7a2a', '#ffd23a', '#ffffff']] });
BACKGROUNDS.lavafoundry = BACKGROUNDS.caldera || BACKGROUNDS.volcano;
Object.assign(STAGE_MUSIC, { lavafoundry: ['metal', 172, 50, 'phrygian', 0, { name: 'The Floor is Lava' }] });
const lavaY = () => G.lava ? G.lava.lv - G.lava.surge : 1e9;

function lavaStart() {
  CHAL.mode = 'lava';
  withSel({ stage: lavaStageDef(), randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  for (const f of fighters) { f.stocks = 3; f.lavaCD = 0; }
  G.lava = { t: 0, lv: STAGE.y + 160, surge: 0, surgeT: 0, warn: 0, floor0: STAGE.y, slots: PLATS.map((p, i) => ({ p, i, hx: p.x, hy: p.y, st: 'up', t: 0 })),
    nextCyc: 8 * 60, burns: [0, 0], done: false, bub: [], sunk: false };
  G.endText = null;
}

/* ---------------- the step ---------------- */
function lavaStep() {
  const L = G.lava; if (!L || L.done || G.mode !== 'play') return;
  const t = ++L.t, f0 = L.floor0;
  // the lava rises: slowly to just under the floor, then on past where the floor used to be
  const base = t < LAVA.CALM ? f0 + 160 : t < LAVA.SINK_AT ? lerp(f0 + 160, f0 + 65, (t - LAVA.CALM) / (LAVA.SINK_AT - LAVA.CALM)) : Math.max(f0 - 40, f0 + 65 - (t - LAVA.SINK_AT) * 0.09);
  L.lv = base + Math.sin(t * 0.02) * 3;
  // the floor sinks (ledges + anyone hanging on them go down with it)
  if (t === LAVA.SINK_AT - 150) { textFx('⚠ THE FLOOR IS LAVA!', STAGE.x + STAGE.w / 2, STAGE.y - 220, '#ffb03a'); G.flash = Math.max(G.flash, 0.2); gameEvent('lavaWarn', {}); }
  if (t >= LAVA.SINK_AT && STAGE.y < f0 + 150) {
    STAGE.y += LAVA.SINK_V; for (const g of LEDGES) g.y = STAGE.y; for (const f of fighters) if (f.state === 'ledge') f.y += LAVA.SINK_V;
    if (t % 6 === 0) dust(STAGE.x + Math.random() * STAGE.w, STAGE.y, 1);
    if (t % 40 === 0) { G.shake = Math.max(G.shake, 2); gameEvent('lavaRumble', {}); }
    if (!L.sunk && STAGE.y > lavaY()) { L.sunk = true; textFx('THE FLOOR IS GONE', STAGE.x + STAGE.w / 2, lavaY() - 200, '#ff5a1f'); }
  }
  // surges: telegraphed swells from 45 s
  if (t >= LAVA.SURGE_AT && (t - LAVA.SURGE_AT) % LAVA.SURGE_EVERY === 0 && !L.surgeT && !L.warn) { L.warn = 90; textFx('⚠ LAVA SURGE', 640, lavaY() - 240, '#ffd23a'); gameEvent('lavaWarn', {}); }
  if (L.warn > 0 && --L.warn === 0) L.surgeT = LAVA.SURGE_T;
  if (L.surgeT > 0) { L.surgeT--; L.surge = LAVA.SURGE_H * Math.pow(Math.sin(Math.PI * (1 - L.surgeT / LAVA.SURGE_T)), 0.7); if (L.surgeT === LAVA.SURGE_T - 1) { G.shake = Math.max(G.shake, 6); gameEvent('lavaRumble', {}); } } else L.surge = 0;
  lavaPlatforms(); lavaBurns();
  G.camExtra = [{ x: STAGE.x + STAGE.w / 2, y: Math.min(lavaY() - 10, f0 + 90) }];                   // (keep the lava's surface in shot)
  if (t >= LAVA.LIMIT) lavaTimeUp();
}
// the platform director: crack one (never below three safe spots), sink it, bring it back up somewhere nearby
function lavaPlatforms() {
  const L = G.lava, ly = lavaY();
  for (const s of L.slots) { const p = s.p; s.t++;
    if (s.st === 'warn' && s.t > 140) { s.st = 'sink'; s.t = 0; gameEvent('lavaRumble', {}); }
    else if (s.st === 'sink') { p.y += 0.85; if (p.y > ly + 60) { s.st = 'down'; s.t = 0; } }
    else if (s.st === 'down' && s.t > 210) {
      let x = s.hx; for (let k = 0; k < 10; k++) { const c = clamp(s.hx + (Math.random() - 0.5) * 260, 90, 1190 - p.w);
        if (L.slots.every(o => o === s || o.st === 'down' || o.st === 'sink' || Math.abs(c - o.p.x) > p.w + 40 || Math.abs(s.hy - o.hy) > 70)) { x = c; break; } }
      p.x = x; p.y = ly + 60; s.st = 'rise'; s.t = 0;
    } else if (s.st === 'rise') { p.y -= 1.3; if (p.y <= s.hy) { p.y = s.hy; s.st = 'up'; s.t = 0; } }
  }
  if (L.t >= L.nextCyc) {
    L.nextCyc = L.t + (L.t > LAVA.SURGE_AT ? 330 : 420);
    const up = L.slots.filter(s => s.st === 'up'), safe = up.length + (STAGE.y < ly - 20 ? 1 : 0);
    if (safe > 3 && up.length) {
      const me = fighters[0], mine = up.find(s => me.onGround && me.ground === 'plat' && Math.abs(me.y - s.p.y) < 1 && me.x > s.p.x && me.x < s.p.x + s.p.w);
      const s = mine && Math.random() < 0.5 ? mine : up[Math.floor(Math.random() * up.length)]; s.st = 'warn'; s.t = 0;
    }
  }
}
// touching the lava: a scorch that pops you up out of it (knockback grows with damage) — a short grace stops repeat burns
function lavaBurns() {
  const L = G.lava, ly = lavaY();
  for (const f of fighters) {
    if (f.lavaCD > 0) f.lavaCD--;
    if (f.state === 'dead' || f.state === 'respawn' || f.y <= ly) continue;
    if (f.invuln > 0 || f.lavaCD > 0 || !canBeHit(f)) { if (f.y > ly + 6 && f.vy > -8) f.vy = -8; continue; }   // (never let anyone sink into it)
    releaseAll(f);                                                              // (off a ledge, out of a grab)
    deliver(LAVA_ATT, f, LAVA.BURN, f.x < STAGE.x + STAGE.w / 2 ? 1 : -1, f.x, ly - 10, false);
    if (f.vy > -9) f.vy = -9; f.lavaCD = LAVA.CD; L.burns[f.id]++;
    burst(f.x, ly, '#ffb03a', 22, 10, 26, 'dot'); ring(f.x, ly, '#ff7a2a', 10, 12, 20, 5); textFx('HOT!', f.x, f.y - 100, '#ffb03a');
    G.hitstop = Math.max(G.hitstop, 5); if (typeof addTrauma === 'function') addTrauma(0.32, -Math.PI / 2);
    gameEvent('lavaBurn', { f });
  }
}
function lavaTimeUp() {
  const L = G.lava, [a, b] = fighters; L.done = true;
  const w = a.stocks !== b.stocks ? (a.stocks > b.stocks ? a : b) : Math.abs(a.percent - b.percent) < 1 ? null : a.percent < b.percent ? a : b;
  G.mode = 'ending'; G.endT = 150; G.winner = w; G.finishAt = G.time; G.hitstop = 30; G.matchTime = G.frame; G.endText = w ? 'TIME! ' + w.ch.name + ' SURVIVES' : 'TIME! — DRAW';
}

/* ---------------- the CPU: survival first ---------------- */
// the surfaces safe to stand on right now (above the lava + the coming surge, not cracking)
function lavaSafe(margin) {
  const L = G.lava, top = lavaY() - (L.warn > 0 || L.surgeT > 0 ? LAVA.SURGE_H - L.surge : 0) - (margin || 30), out = [];
  if (STAGE.y < top) out.push({ x0: STAGE.x + 12, x1: STAGE.x + STAGE.w - 12, y: STAGE.y, main: true });
  for (const s of L.slots) if (s.st === 'up' && s.p.y < top) out.push({ x0: s.p.x + 10, x1: s.p.x + s.p.w - 10, y: s.p.y, s });
  return out;
}
function lavaStanding(f) {
  if (!f.onGround) return null;
  if (f.ground === 'stage') return { main: true, y: STAGE.y };
  const s = G.lava.slots.find(q => Math.abs(f.y - q.p.y) < 1.5 && f.x > q.p.x - 12 && f.x < q.p.x + q.p.w + 12); return s ? { s, y: s.p.y } : null;
}
// returns this step's input when survival comes first, else null (the normal brain fights)
function lavaAI(f, o) {
  const L = G.lava; if (!L || f.state === 'dead' || f.state === 'respawn' || f.state === 'ledge') return null;
  const safe = lavaSafe(30), on = lavaStanding(f), ly = lavaY();
  const onSafe = on && safe.some(q => (on.main ? q.main : q.s === on.s));
  const overSafe = safe.some(q => f.x > q.x0 - 6 && f.x < q.x1 + 6 && q.y >= f.y - 4);
  if (onSafe || (!f.onGround && overSafe && f.y < ly - 120)) return null;
  // pick the best surface to reach: near, not far above, and comfortably above the lava
  let best = null, bs = -1e9;
  for (const q of safe) { const cx = clamp(f.x, q.x0 + 14, q.x1 - 14), dx = Math.abs(cx - f.x), dy = f.y - q.y; if (dy > 250) continue;
    const sc = -dx - Math.max(0, dy - 110) * 2.5 + (ly - q.y) * 0.4 + (q.main ? -30 : 0); if (sc > bs) { bs = sc; best = { q, cx }; } }
  const inp = emptyInput(); if (f.state === 'hitstun') { if (best) { inp.right = best.cx > f.x; inp.left = best.cx < f.x; } return inp; }
  if (!best) { if (!f.onGround && f.vy > -1 && f.jumps > 0) inp.jumpP = true; return inp; }
  const { q, cx } = best;
  if (cx > f.x + 8) inp.right = true; else if (cx < f.x - 8) inp.left = true;
  if (f.onGround) { if (q.y < f.y - 8 && Math.abs(cx - f.x) < 170) inp.jumpP = true; }
  else if (f.vy > 0 && f.y > q.y - 24) {
    if (f.jumps > 0) inp.jumpP = true;
    else if (!f.specialUsed && f.state === 'free') { inp.specialP = true; inp.aimX = Math.sign(cx - f.x) * 50; inp.aimY = -100; }   // the up-special recovery
  }
  void o; return inp;
}
// the normal brain's input, made lava-safe: no dropping through a platform into the lava, no strolling off an edge over it
function lavaSanitize(f, inp) {
  const on = lavaStanding(f); if (!on || on.main) return inp;
  const safe = lavaSafe(30), below = safe.some(q => q.y > f.y + 4 && f.x > q.x0 && f.x < q.x1);
  if (inp.down && !below) inp.down = false;
  const p = on.s.p, edgeL = f.x - p.x < 16, edgeR = p.x + p.w - f.x < 16;
  if (!inp.jumpP && ((inp.left && edgeL) || (inp.right && edgeR)) && !below) { inp.left = inp.right = false; }
  return inp;
}

/* ---------------- results ---------------- */
function lavaResult() {
  const L = G.lava, me = fighters[0], foe = fighters[1], won = G.winner === me, t = won ? 'LAVA SURVIVOR!' : G.winner ? 'MELTED DOWN' : 'COOLED OFF';
  $('lad-title').textContent = t; $('lad-title').dataset.text = t;
  const secs = Math.round(L.t / 60);
  $('lad-sub').textContent = `${me.ch.name} vs ${foe.ch.name} · ${DIFFS[G.diff].name} CPU · survived ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('lad-list').innerHTML = [['❤', 'Stocks left', me.stocks, foe.stocks], ['🔥', 'Lava burns', L.burns[0], L.burns[1]], ['💥', 'KOs', (me.st && me.st.kos) || 0, (foe.st && foe.st.kos) || 0]]
    .map(([i, l, a, b], k) => `<li class="done" style="--c:${['#ff5a1f', '#ffb03a', '#ffd23a'][k]}"><span class="lad-n">${i}</span><b>${l}</b><small>${me.ch.name} ${a} · ${foe.ch.name} ${b}</small><span class="lad-st">${(k === 1 ? a < b : a > b) ? '✓' : ''}</span></li>`).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="lava-again">Rematch</button><button class="btn big" data-act="mini-hub">Minigames</button><button class="btn big" data-go="scr-main">Menu</button>`;
  const rec = store.get('neonbrawl.minigames', {}), r = rec.lava || (rec.lava = { played: 0, wins: 0, best: 0 }); r.played++; if (won) r.wins++; r.best = Math.max(r.best, secs); store.set('neonbrawl.minigames', rec);
  L.won = won; showScreen('scr-ladder');
}

/* ---------------- HUD ---------------- */
const LAVA_HUD = { el: null, k: '' };
function lavaHUD() {
  const L = G.lava, on = !!L && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending');
  if (!LAVA_HUD.el) { LAVA_HUD.el = document.createElement('div'); LAVA_HUD.el.className = 'lv-board'; HUD.el.appendChild(LAVA_HUD.el); }
  const left = L ? Math.max(0, Math.ceil((LAVA.LIMIT - L.t) / 60)) : 0, phase = !L ? '' : L.warn > 0 ? '⚠ SURGE INCOMING' : L.surgeT > 0 ? 'SURGE!' : L.t < LAVA.SINK_AT ? 'the lava is rising' : L.sunk ? 'only the platforms are safe' : 'the floor is sinking';
  const k = on ? left + phase : ''; if (k === LAVA_HUD.k) return; LAVA_HUD.k = k;
  LAVA_HUD.el.style.display = on ? 'flex' : 'none'; if (!on) return;
  LAVA_HUD.el.classList.toggle('alarm', !!(L.warn > 0 || L.surgeT > 0));
  LAVA_HUD.el.innerHTML = `<b>🔥 THE FLOOR IS LAVA</b><em>${phase}</em><span>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`;
}

/* ---------------- the lava in 3D ---------------- */
function collectLava3D() {
  const L = G.lava; if (!L) return; const t = G.time, ly = lavaY(), hot = [0.95, 0.28, 0.05], gold = [1, 0.78, 0.3], crust = [0.11, 0.04, 0.025], crust2 = [0.2, 0.07, 0.035];
  bL('box', 640, ly + 300, -100, 4400, 600, 2200, hot, 0.85);                                              // the lava sea, right up to the camera (emissive: it blooms)
  // a drifting field of crust plates — the molten lava glows through the cracks between them
  const cx0 = Math.floor((G.cam.x - 1300) / 150) * 150;
  for (let gx = 0; gx < 18; gx++) for (let gz = 0; gz < 12; gz++) { const h = hash((cx0 / 150 + gx) * 17.3 + gz * 3.1), x = cx0 + gx * 150 + h * 90 + Math.sin(t * 0.004 + h * 6) * 18, z = -560 + gz * 135 + hash(h * 9.7) * 70;
    if (hash(h * 3.3) < 0.28) continue; const r = 40 + hash(h * 5.1) * 46; bL('sph', x, ly - 1.2, z, r, 2.5, r * (0.45 + hash(h * 2.2) * 0.3), hash(h * 7.7) < 0.5 ? crust : crust2, 0.02, h * 6); }
  for (let i = 0; i < 9; i++) { const x = ((i * 233 + t * 0.6) % 2200) - 460, z = ((i * 151) % 700) - 400, k = 0.5 + 0.5 * Math.sin(t * 0.05 + i);
    bG('sph', x, ly - 2, z, 60 + 30 * k, 4, 34, gold, 0.25 + 0.2 * k); }
  // bubbles that swell and pop
  if (G.mode === 'play' && Math.random() < 0.3) L.bub.push({ x: G.cam.x + (Math.random() - 0.5) * 1300, z: (Math.random() - 0.4) * 500, t: 0, r: 6 + Math.random() * 14 });
  for (let i = L.bub.length - 1; i >= 0; i--) { const b = L.bub[i]; b.t++; const u = b.t / 34;
    if (u >= 1) { L.bub.splice(i, 1); if (Math.abs(b.z) < 120) burst(b.x, ly, '#ffb03a', 4, 4, 12, 'dot'); continue; }
    bG('sph', b.x, ly - b.r * u * 0.5, b.z, b.r * u, b.r * u * 0.7, b.r * u, gold, 0.5 * (1 - u * 0.5)); }
  // the surge: a glowing band rising up the wall of the arena while it swells
  if (L.warn > 0 || L.surgeT > 0) { const k = L.warn > 0 ? 0.5 + 0.5 * Math.sin(t * 0.4) : 1; bG('box', 640, ly - 4, 40, 3600, 8, 6, gold, 0.6 * k); }
  // cracking platforms glow red underneath; rising ones are still glowing hot
  for (const s of L.slots) { const p = s.p, cx = p.x + p.w / 2;
    if (s.st === 'warn') { const k = 0.5 + 0.5 * Math.sin(t * (0.2 + s.t * 0.004)); bG('box', cx, p.y + 9, 0, p.w - 6, 3, PLAT_DEPTH + 4, [1, 0.2, 0.05], 0.6 + 0.6 * k);
      for (let j = 0; j < 4; j++) bG('box', p.x + 18 + j * (p.w - 36) / 3, p.y - 1, PLAT_DEPTH / 2 + 1, 2, 2, 2 + 12 * k, [1, 0.4, 0.1], 1.2 * k);
      if (s.t % 8 === 0) pushFx({ type: 'cloud', x: p.x + Math.random() * p.w, y: p.y + 6, vx: 0, vy: -0.7, life: 30, max: 30, color: 'rgba(255,200,170,0.4)', size: 7, drag: 0.98, g: 0 }); }
    else if (s.st === 'sink' || s.st === 'rise') { const k = s.st === 'rise' ? 1 - Math.min(1, (s.hy - p.y + 200) / 400) : 1; bG('box', cx, p.y + 2, 0, p.w + 4, 14, PLAT_DEPTH + 6, [1, 0.45, 0.1], 0.5 * k + 0.2); } }
  // the lava lights everyone from below
  if (typeof glPointLight === 'function') for (const x of [G.cam.x - 420, G.cam.x + 420]) glPointLight(x, -ly + 50, 60, 780, [1, 0.42, 0.14], 0.95);
}
function drawLava2D() {
  const L = G.lava; if (!L) return; const ly = lavaY(); ctx.save();
  const g = ctx.createLinearGradient(0, ly, 0, ly + 300); g.addColorStop(0, '#ffb03a'); g.addColorStop(0.2, '#ff5a1f'); g.addColorStop(1, '#5a1206');
  ctx.fillStyle = g; ctx.fillRect(-800, ly, 3000, 800); ctx.restore();
}

/* ---------------- sounds + wiring ---------------- */
Object.assign(SFX, {
  lavaBurn() { noise({ f0: 5000, f1: 900, dur: 0.5, gain: 0.14, filter: 'highpass' }); tone({ type: 'sawtooth', f0: 180, f1: 60, dur: 0.3, gain: 0.06, filter: 'lowpass', ff: 700 }); },
  lavaRumble() { noise({ f0: 120, f1: 60, dur: 0.9, gain: 0.12, filter: 'lowpass' }); },
  lavaWarn() { const t = AUDIO.ctx.currentTime; [0, 0.28].forEach(d => tone({ type: 'square', f0: 880, dur: 0.18, gain: 0.05, at: t + d })); }
});
GAME_EVENT_LISTENERS.push(type => { if (type === 'lavaBurn') sfx('lavaBurn'); else if (type === 'lavaRumble') sfx('lavaRumble'); else if (type === 'lavaWarn') sfx('lavaWarn'); });
$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
  if (a === 'mini-lava') { SEL.challenge = 'lava'; go('scr-select'); }
  else if (a === 'lava-again') lavaStart();
});
