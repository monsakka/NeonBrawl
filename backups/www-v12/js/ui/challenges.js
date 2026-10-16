/* NEON BRAWL — Retro Challenge modes (Main menu → Challenges).
 *
 *   Classic Arcade   pick a fighter, then climb a ladder of 6 rivals with rising CPU difficulty (Easy → Extreme) on
 *                    random arenas, 2 stocks each; then GIANT OMEGA — Omega scaled to 300 % (f.scale = 3: hurtbox,
 *                    attack boxes, collision, ledges and model all scale), almost twice as heavy and hitting 30 % harder;
 *                    and finally OMNI HAND, the towering floating glove (game/boss.js), on Final Destination.
 *                    Losing offers a continue (the rung restarts).
 *   Board the Platforms  a jumping puzzle: 10 tiny procedural platforms to land on before a 45-second clock runs out.
 *   Break the Targets every fighter gets its own procedural obstacle course (seeded by the fighter's id: a random walk
 *                    of floating platforms from the start pad, so every one is reachable with a jump + double jump)
 *                    and 10 floating 3D targets — above platforms, in mid-air gaps, up high and tucked under the start
 *                    pad. Any of your attacks, projectiles or your Ultimate breaks them. A speedrun timer runs from
 *                    GO! and each fighter's best time is saved.                                                    */
'use strict';

const CHAL = { mode: null, arc: null, btt: null };
const ARC_DIFF = [0, 1, 1, 2, 2, 3];
const BTT_TRACK = ['cyber', 150, 55, 'major', 0, { name: 'Target Rush', arp: ['square', 1, 'updown', 1, 0.03], lead: ['square', 0.032, 1, 0.3] }];
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
const fmtTime = fr => { const s = fr / 60, m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(2).padStart(5, '0'); };

function chalExit() { CHAL.mode = null; CHAL.arc = null; CHAL.btt = null; SEL.challenge = null; SEL.boss = false; G.camExtra = null; G.endText = null; for (const f of fighters) f.bossScale = 0; }
// Run startMatch with temporary SEL values (the player's own menu picks are restored afterwards)
function withSel(tmp, fn) {
  const keep = {}; for (const k of Object.keys(tmp)) keep[k] = SEL[k];
  Object.assign(SEL, tmp); try { fn(); } finally { Object.assign(SEL, keep); }
}
const chalRestart = () => (CHAL.mode === 'arcade' ? arcadeFight() : CHAL.mode === 'btt' ? bttStart() : CHAL.mode === 'btp' ? btpStart() : G.training ? startTraining() : startMatch());

/* ============================== Classic Arcade ============================== */
function bossChar() {
  const o = CHARS.find(c => c.id === 'omega');
  return Object.assign({}, o, { name: 'GIANT OMEGA', role: 'Final Boss · 300 %', weight: o.weight * 1.9, boss: true });
}
function arcadeBuild(p1) {
  const pool = CHARS.map((c, i) => i).filter(i => i !== p1 && CHARS[i].id !== 'omega');
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const stages = STAGES.map((s, i) => i).filter(i => STAGES[i].id !== 'starlight');
  const rungs = ARC_DIFF.map((diff, k) => ({ ci: pool[k], st: stages[Math.floor(Math.random() * stages.length)], diff, stocks: 2 }));
  rungs.push({ ci: CHARS.findIndex(c => c.id === 'omega'), st: stages[Math.floor(Math.random() * stages.length)], diff: 3, stocks: 2, boss: 'giant' });   // the mid-boss
  rungs.push({ ci: CHARS.findIndex(c => c.id === 'velocity'), st: STAGES.findIndex(s => s.id === 'starlight'), diff: 3, stocks: 1, boss: 'hand' });       // the final boss
  return { p1, idx: 0, rungs, continues: 0, frames: 0, state: 'intro' };
}
const rungName = R => R.boss === 'hand' ? 'OMNI HAND' : R.boss === 'giant' ? 'GIANT OMEGA' : CHARS[R.ci].name;
function arcadeStart() { CHAL.mode = 'arcade'; CHAL.arc = arcadeBuild(SEL.p1); showLadder(); }
function arcadeFight() {
  const A = CHAL.arc, R = A.rungs[A.idx];
  withSel({ cpu: R.ci, stage: R.st, randStage: false, diff: R.diff, time: 0, hazards: false, boss: R.boss === 'giant' }, () => startMatch());
  const [p, o] = fighters;
  p.stocks = R.boss ? 3 : 2; o.stocks = R.stocks;
  if (R.boss === 'giant') { o.ch = bossChar(); applySkin(o, o.ch, 2); o.scale = o.bossScale = 3; o.x = ST.spawns[1] + 40; }
  else if (R.boss === 'hand') setupHand(o);                                                      // the floating final boss (game/boss.js)
  A.state = 'fight';
}
function arcadeResult() {
  const A = CHAL.arc, won = G.winner === fighters[0], R = A.rungs[A.idx];
  A.frames += G.matchTime || G.frame;
  if (won) { A.idx++; A.state = A.idx >= A.rungs.length ? 'clear' : 'won';
    if (A.state === 'clear') { const rec = store.get('neonbrawl.arcade', {}), id = CHARS[A.p1].id; rec[id] = Math.min(rec[id] || 1e12, A.frames); store.set('neonbrawl.arcade', rec); } }
  else A.state = 'lost';
  void R; showLadder();
}
function showLadder() {
  const A = CHAL.arc, me = CHARS[A.p1], cols = ['#5dffa0', '#ffd36e', '#ff8a3d', '#ff4d6d'];
  const title = { intro: 'ARCADE LADDER', won: 'STAGE CLEAR!', lost: 'CONTINUE?', clear: 'ARCADE CLEAR!', fight: 'ARCADE LADDER' }[A.state];
  $('lad-title').textContent = title; $('lad-title').dataset.text = title;
  $('lad-sub').textContent = A.state === 'clear' ? `${me.name} destroyed OMNI HAND · ${fmtTime(A.frames)} · continues used: ${A.continues}`
    : A.state === 'lost' ? `${me.name} fell to ${rungName(A.rungs[A.idx])}. Continue from this rung?`
    : `${me.name} · Stage ${A.idx + 1} of ${A.rungs.length}` + (A.rungs[A.idx] && A.rungs[A.idx].boss === 'hand' ? ' · the final boss awaits' : A.rungs[A.idx] && A.rungs[A.idx].boss ? ' · a giant blocks the way' : '');
  $('lad-list').innerHTML = A.rungs.map((R, k) => {
    const st = k < A.idx ? 'done' : k === A.idx && A.state !== 'clear' ? 'next' : 'todo';
    const who = R.boss === 'hand' ? 'OMNI HAND <em>FINAL</em>' : R.boss ? 'GIANT OMEGA <em>×3</em>' : CHARS[R.ci].name;
    return `<li class="${st}${R.boss ? ' boss' : ''}" style="--c:${R.boss === 'hand' ? '#ffffff' : R.boss ? '#ff2fd0' : cols[R.diff]}"><span class="lad-n">${R.boss === 'hand' ? '✋' : R.boss ? '☠' : k + 1}</span><b>${who}</b><small>${STAGES[R.st].name}</small>` +
      `<i class="lad-pips">${[0, 1, 2, 3].map(q => `<u class="${q <= R.diff ? 'on' : ''}"></u>`).join('')}</i><span class="lad-st">${st === 'done' ? '✓' : st === 'next' ? '▶' : ''}</span></li>`;
  }).join('');
  $('lad-menu').innerHTML = A.state === 'clear' ? `<button class="btn primary big" data-act="chal-arcade-again">Play again</button><button class="btn big" data-go="scr-main">Main menu</button>`
    : A.state === 'lost' ? `<button class="btn primary big" data-act="chal-continue">Continue</button><button class="btn big" data-go="scr-main">Give up</button>`
    : `<button class="btn primary big" data-act="chal-fight">${A.rungs[A.idx].boss === 'hand' ? 'Face OMNI HAND →' : A.rungs[A.idx].boss ? 'Face the Giant →' : 'Fight! →'}</button><button class="btn big" data-go="scr-main">Quit</button>`;
  $('lad-list').style.display = ''; showScreen('scr-ladder');
}

/* ============================== Stages (Break the Targets · Board the Platforms) ==============================
 * Each solo challenge has 5 progressive Stages. Stage 1 is the original course (so old records still count); every
 * later stage tightens the table below. Clearing a stage unlocks the next (any fighter). Every layout is a seeded
 * random walk out from the start pad whose steps are clamped to THIS fighter's real reach (jump + double jump height,
 * air drift over the airtime), so no stage is ever impossible for a weak jumper.                                   */
const STAGE_N = 5;
const BTT_STAGES = [
  { plats: 7, w: [110, 170], dx: [170, 300], up: [50, 150], down: [30, 110], targets: 10, r: 20, moving: 0 },
  { plats: 7, w: [90, 140],  dx: [180, 300], up: [60, 150], down: [30, 110], targets: 11, r: 18, moving: 2 },
  { plats: 8, w: [80, 120],  dx: [190, 320], up: [60, 160], down: [30, 120], targets: 12, r: 17, moving: 4 },
  { plats: 8, w: [60, 100],  dx: [200, 320], up: [70, 160], down: [40, 120], targets: 13, r: 16, moving: 6 },
  { plats: 9, w: [50, 80],   dx: [200, 330], up: [70, 170], down: [40, 130], targets: 15, r: 14, moving: 9 }
];
const BTP_STAGES = [
  { plats: 10, w: [36, 46], dx: [120, 215], up: [30, 120], down: [20, 90],  limit: 45, crumble: 0 },
  { plats: 10, w: [32, 42], dx: [140, 230], up: [40, 125], down: [20, 90],  limit: 42, crumble: 0 },
  { plats: 11, w: [30, 38], dx: [150, 240], up: [40, 130], down: [30, 100], limit: 42, crumble: 0 },
  { plats: 12, w: [28, 34], dx: [150, 245], up: [45, 130], down: [30, 100], limit: 44, crumble: 2 },
  { plats: 13, w: [26, 32], dx: [160, 250], up: [50, 135], down: [30, 110], limit: 45, crumble: 1 }
];
// How far this fighter can really travel between platforms (with a safety margin)
function reachOf(ch) {
  const g = PHYS.grav * (ch.grav || 1), h1 = ch.jump * ch.jump / (2 * g), h2 = ch.airJumps > 0 ? ch.djump * ch.djump / (2 * g) : 0;
  const air = 2 * ch.jump / g + (ch.airJumps > 0 ? 2 * ch.djump / g : 0) + (ch.hover ? 60 : 0) + (ch.jet ? 80 : 0);
  return { up: (h1 + 0.85 * h2) * 0.72 + (ch.jet ? 80 : 0), dx: ch.airMax * air * 0.5 };
}
const stageProgress = () => store.get('neonbrawl.stages', { btt: 1, btp: 1 });
function unlockStage(mode, s) { const P = stageProgress(); if ((P[mode] || 1) < Math.min(STAGE_N, s)) { P[mode] = Math.min(STAGE_N, s); store.set('neonbrawl.stages', P); return true; } return false; }
// records: { '<fighter>/<stage>': frames } (pre-stage records were per fighter: they become Stage 1)
function stageRecords(mode) {
  const rec = store.get('neonbrawl.' + mode, {}); let moved = false;
  for (const k of Object.keys(rec)) if (!k.includes('/')) { rec[k + '/1'] = Math.min(rec[k + '/1'] || 1e12, rec[k]); delete rec[k]; moved = true; }
  if (moved) store.set('neonbrawl.' + mode, rec);
  return rec;
}
// a random walk of platforms from the start pad (t = stage table, reach-clamped)
function walkPlatforms(R, ch, t, main, h, recent) {
  const rr = (a, b) => a + R() * (b - a), rc = reachOf(ch), plats = [], nodes = [{ x: main.x + main.w / 2, y: main.y }];
  const dxMax = Math.max(t.dx[0] + 10, Math.min(t.dx[1], rc.dx)), upMax = Math.max(t.up[0] + 10, Math.min(t.up[1], rc.up));
  for (let tries = 0; plats.length < t.plats && tries < 900; tries++) {
    const n = recent ? nodes[nodes.length - 1 - Math.floor(R() * Math.min(3, nodes.length))] : nodes[Math.floor(R() * nodes.length)], w = Math.round(rr(t.w[0], t.w[1]));
    // (the bounds and spacing rules are each mode's original ones, so Stage 1 reproduces the pre-stage courses exactly)
    const x = clamp(n.x + (R() < 0.5 ? -1 : 1) * rr(t.dx[0], dxMax), recent ? 70 : 110, recent ? 1210 : 1170), y = clamp(n.y + (R() < (recent ? 0.7 : 0.72) ? -rr(t.up[0], upMax) : rr(t.down[0], t.down[1])), recent ? 130 : 150, recent ? 610 : 600);
    const near = recent ? plats.some(p => Math.hypot(p.x + p.w / 2 - x, p.y - y) < 100) : plats.some(p => Math.abs(p.x + p.w / 2 - x) < (p.w + w) / 2 + 70 && Math.abs(p.y - y) < 90);
    const onPad = recent ? Math.abs(x - (main.x + main.w / 2)) < 140 && y > main.y - 80 : Math.abs(x - (main.x + main.w / 2)) < (main.w + w) / 2 + 50 && y > main.y - 110;
    if (near || onPad) continue;
    plats.push({ x: Math.round(x - w / 2), y: Math.round(y), w, h }); nodes.push({ x, y });
  }
  return plats;
}
function registerCourse(st) { THEME3D[st.id] = 'holo'; BACKGROUNDS[st.id] = BACKGROUNDS.training; WX_STAGE[st.id] = ['motes']; STAGE_MUSIC[st.id] = BTT_TRACK; return st; }

/* ============================== Break the Targets ============================== */
function bttCourse(ch, s) {
  s = s || 1; const t = BTT_STAGES[s - 1], R = seeded('btt/' + ch.id + (s > 1 ? '/' + s : '')), rr = (a, b) => a + R() * (b - a);
  const main = { x: 540, y: 540, w: 200, h: 56 }, plats = walkPlatforms(R, ch, t, main, 10, false);
  const targets = plats.map(p => ({ x: Math.round(p.x + p.w * rr(0.25, 0.75)), y: Math.round(p.y - rr(55, 120)) }));
  const top = plats.reduce((a, p) => (p.y < a.y ? p : a), plats[0] || main);
  targets.push({ x: Math.round(top.x + top.w / 2), y: top.y - 175 });                                   // up high
  targets.push({ x: R() < 0.5 ? main.x - 64 : main.x + main.w + 64, y: main.y + 70 });                 // tucked under the start pad
  if (plats.length > 1) { const a = plats[0], b = plats[1]; targets.push({ x: Math.round((a.x + a.w / 2 + b.x + b.w / 2) / 2), y: Math.round((a.y + b.y) / 2 - 30) }); }   // a mid-air gap
  if (s >= 4) targets.push({ x: targets[targets.length - 2].x < main.x ? main.x + main.w + 64 : main.x - 64, y: main.y + 70 });   // (stage 4+: under both sides)
  while (targets.length < t.targets) targets.push({ x: Math.round(rr(160, 1120)), y: Math.round(rr(200, 420)) });
  const st = registerCourse({ id: 'btt-' + ch.id + (s > 1 ? '-' + s : ''), name: 'Break the Targets · Stage ' + s, tag: ch.name + "'s course", clean: true, btt: true, stageNo: s,
    desc: 'A procedural target course.', main, plats, bz: { l: -240, r: 1520, t: -300, b: 860 }, spawns: [main.x + main.w / 2, main.x + main.w / 2],
    pal: { fill: ['#2a1450', '#0c0420'], edge: '#ffd23a', top: '#fff6d0', plat: '#ff7ae6', glow: '#ff4fd8', bz: 'rgba(255,79,216,0.3)' },
    targets: targets.slice(0, t.targets).map((q, k) => ({ x: q.x, y: q.y, r: t.r,
      move: k < t.moving ? { ax: (k % 2 ? 0 : 1) * rr(40, 80), ay: (k % 2 ? 1 : 0) * rr(30, 60), w: rr(0.015, 0.03), ph: rr(0, 6.28) } : null })) });
  return st;
}
function bttStart(s) {
  s = s || (CHAL.btt && CHAL.btt.stage) || 1;
  const ch = CHARS[SEL.p1], st = bttCourse(ch, s);
  CHAL.mode = 'btt';
  withSel({ cpu: SEL.p1, stage: st, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  CHAL.btt = { st, stage: s, ch: ch.id, t: 0, done: false, broke: 0, targets: st.targets.map(q => Object.assign({ hit: false, at: 0, x0: q.x, y0: q.y }, q)) };
  const [p, o] = fighters;
  p.stocks = 99; Object.assign(o, { state: 'dead', deadT: 1e9, stocks: 1, x: -5000, y: -5000, ult: 0 });
  G.endText = null;
}
function bttStep() {
  const B = CHAL.btt; if (!B || B.done) return;
  const f = fighters[0];
  if (G.mode === 'play') B.t++;
  for (const T of B.targets) {
    if (T.hit) continue;
    if (T.move) { T.x = T.x0 + Math.sin(B.t * T.move.w + T.move.ph) * T.move.ax; T.y = T.y0 + Math.sin(B.t * T.move.w * 1.3 + T.move.ph) * T.move.ay; }   // (stage 2+: drifting targets)
    let hit = HITBOX_LOG.some(h => h.owner === 0 && rectCircle(h, T.x, T.y, T.r));
    if (!hit) hit = projs.some(p => p.owner === f && Math.hypot(p.x - T.x, p.y - T.y) < T.r + (p.r || p.rad || 8));
    if (!hit) continue;
    T.hit = true; T.at = B.t; B.broke++;
    shatter(T.x, T.y, '#ff4fd8', 22); burst(T.x, T.y, '#ffffff', 14, 8, 18); ring(T.x, T.y, '#ffd23a', 8, 8, 18, 4);
    textFx(B.broke + ' / ' + B.targets.length, T.x, T.y - 40, '#ffd23a'); gameEvent('target', { x: T.x, y: T.y, n: B.broke });
    G.shake = Math.max(G.shake, 4);
  }
  G.camExtra = B.targets.filter(T => !T.hit);
  if (B.broke >= B.targets.length) {
    B.done = true; B.final = B.t;
    const rec = stageRecords('btt'), key = B.ch + '/' + B.stage; B.prev = rec[key]; B.record = !B.prev || B.t < B.prev; if (B.record) { rec[key] = B.t; store.set('neonbrawl.btt', rec); }
    B.unlocked = unlockStage('btt', B.stage + 1) && B.stage < STAGE_N;
    G.mode = 'ending'; G.endT = 130; G.winner = f; G.finishAt = G.time; G.hitstop = 20; G.matchTime = G.frame; G.endText = 'STAGE ' + B.stage + ' CLEAR!';
    gameEvent('targetsDone', { t: B.t });
  }
}
function bttResult() {
  const B = CHAL.btt, me = CHARS.find(c => c.id === B.ch), title = 'STAGE ' + B.stage + ' CLEAR!';
  $('lad-title').textContent = title; $('lad-title').dataset.text = title;
  $('lad-sub').textContent = `${me.name} · ${fmtTime(B.final)}` + (B.record ? ' · NEW RECORD!' : ' · best ' + fmtTime(B.prev)) + (B.unlocked ? ` · Stage ${B.stage + 1} unlocked!` : '');
  $('lad-list').innerHTML = B.targets.map((T, k) => `<li class="done" style="--c:#ff4fd8"><span class="lad-n">${k + 1}</span><b>Target ${k + 1}</b><small>${fmtTime(T.at)}</small><span class="lad-st">✓</span></li>`).join('');
  $('lad-menu').innerHTML = stageButtons('btt', B.stage, true);
  showScreen('scr-ladder');
}
/* ============================== Board the Platforms ==============================
 * A jumping puzzle: tiny platforms floating around a start pad, placed by a reach-clamped random walk. Land on each of
 * them (each lights up green once boarded) before the clock runs out. Falling costs nothing but time. Later stages:
 * more and tinier platforms, longer gaps, and platforms that crumble once you've landed on them.                     */
const BTP_LIMIT = 45 * 60;
function btpCourse(ch, s) {
  s = s || 1; const t = BTP_STAGES[s - 1], R = seeded('btp/' + ch.id + (s > 1 ? '/' + s : ''));
  const main = { x: 560, y: 560, w: 160, h: 56 }, plats = walkPlatforms(R, ch, t, main, 8, true);
  if (t.crumble) plats.forEach((p, k) => { if (k % t.crumble === 0) p.crumble = true; });
  return registerCourse({ id: 'btp-' + ch.id + (s > 1 ? '-' + s : ''), name: 'Board the Platforms · Stage ' + s, tag: ch.name + "'s jumps", clean: true, btp: true, stageNo: s, limit: t.limit * 60,
    desc: 'A procedural jumping puzzle.', main, plats, bz: { l: -240, r: 1520, t: -300, b: 860 }, spawns: [main.x + main.w / 2, main.x + main.w / 2],
    pal: { fill: ['#0c2a2a', '#03100f'], edge: '#3dffc8', top: '#e0fff6', plat: '#ffd23a', glow: '#3dffc8', bz: 'rgba(61,255,200,0.3)' } });
}
function btpStart(s) {
  s = s || (CHAL.btp && CHAL.btp.stage) || 1;
  const ch = CHARS[SEL.p1], st = btpCourse(ch, s);
  CHAL.mode = 'btp';
  withSel({ cpu: SEL.p1, stage: st, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  CHAL.btp = { st, stage: s, ch: ch.id, t: 0, limit: st.limit || BTP_LIMIT, done: false, failed: false, boarded: 0, plats: st.plats.map(p => Object.assign(p, { boarded: false, at: 0 })) };
  const [p, o] = fighters;
  p.stocks = 99; Object.assign(o, { state: 'dead', deadT: 1e9, stocks: 1, x: -5000, y: -5000, ult: 0 });
  G.endText = null;
}
function btpStep() {
  const B = CHAL.btp; if (!B || B.done) return;
  const f = fighters[0];
  if (G.mode === 'play') B.t++;
  if (f.onGround && f.ground === 'plat') {
    const p = B.plats.find(q => !q.boarded && Math.abs(q.y - f.y) < 1 && f.x + HW > q.x && f.x - HW < q.x + q.w);
    if (p) { p.boarded = true; p.at = B.t; B.boarded++; ring(p.x + p.w / 2, p.y - 4, '#3dffc8', 8, 7, 18, 4); burst(p.x + p.w / 2, p.y - 6, '#ffffff', 10, 6, 16);
      textFx(B.boarded + ' / ' + B.plats.length, p.x + p.w / 2, p.y - 60, '#3dffc8'); gameEvent('target', { x: p.x, y: p.y, n: B.boarded }); }
  }
  G.camExtra = B.plats.filter(q => !q.boarded).map(q => ({ x: q.x + q.w / 2, y: q.y }));
  const win = B.boarded >= B.plats.length, out = B.t >= B.limit;
  if (!win && !out) return;
  B.done = true; B.final = B.t; B.failed = !win;
  if (win) { const rec = stageRecords('btp'), key = B.ch + '/' + B.stage; B.prev = rec[key]; B.record = !B.prev || B.t < B.prev; if (B.record) { rec[key] = B.t; store.set('neonbrawl.btp', rec); }
    B.unlocked = unlockStage('btp', B.stage + 1) && B.stage < STAGE_N; gameEvent('targetsDone', { t: B.t }); }
  G.mode = 'ending'; G.endT = 130; G.winner = win ? f : null; G.finishAt = G.time; G.hitstop = 20; G.matchTime = G.frame; G.endText = win ? 'STAGE ' + B.stage + ' CLEAR!' : 'TIME UP!';
}
function btpResult() {
  const B = CHAL.btp, me = CHARS.find(c => c.id === B.ch), t = B.failed ? 'TIME UP!' : 'STAGE ' + B.stage + ' CLEAR!';
  $('lad-title').textContent = t; $('lad-title').dataset.text = t;
  $('lad-sub').textContent = B.failed ? `${me.name} boarded ${B.boarded} of ${B.plats.length} platforms`
    : `${me.name} · ${fmtTime(B.final)}` + (B.record ? ' · NEW RECORD!' : ' · best ' + fmtTime(B.prev)) + (B.unlocked ? ` · Stage ${B.stage + 1} unlocked!` : '');
  $('lad-list').innerHTML = B.plats.map((p, k) => `<li class="${p.boarded ? 'done' : 'todo'}" style="--c:#3dffc8"><span class="lad-n">${k + 1}</span><b>Platform ${k + 1}</b><small>${p.boarded ? fmtTime(p.at) : '—'}</small><span class="lad-st">${p.boarded ? '✓' : '✗'}</span></li>`).join('');
  $('lad-menu').innerHTML = stageButtons('btp', B.stage, !B.failed);
  showScreen('scr-ladder');
}
// the result buttons: Next stage (when cleared + unlocked) · Retry · Stage list · Menu
function stageButtons(mode, s, cleared) {
  const next = cleared && s < STAGE_N && (stageProgress()[mode] || 1) > s;
  return (next ? `<button class="btn primary big" data-act="chal-stage" data-s="${s + 1}">Stage ${s + 1} →</button>` : `<button class="btn primary big" data-act="chal-retry">Retry</button>`) +
    (next ? `<button class="btn big" data-act="chal-retry">Retry</button>` : '') + `<button class="btn big" data-act="chal-stages">Stages</button><button class="btn big" data-go="scr-main">Menu</button>`;
}
// the stage list for the picked fighter: locked / unlocked / cleared, with this fighter's best time on each
function showStages(mode) {
  CHAL.mode = mode; const P = stageProgress(), top = P[mode] || 1, rec = stageRecords(mode), id = CHARS[SEL.p1].id, col = mode === 'btt' ? '#ff4fd8' : '#3dffc8';
  const title = mode === 'btt' ? 'BREAK THE TARGETS' : 'BOARD THE PLATFORMS', T = mode === 'btt' ? BTT_STAGES : BTP_STAGES;
  $('lad-title').textContent = title; $('lad-title').dataset.text = title;
  $('lad-sub').textContent = `${CHARS[SEL.p1].name} · ${top} of ${STAGE_N} stages unlocked · pick a stage`;
  $('lad-list').innerHTML = T.map((t, k) => { const s = k + 1, locked = s > top, best = rec[id + '/' + s];
    const what = mode === 'btt' ? `${t.targets} targets${t.moving ? ' · ' + t.moving + ' moving' : ''}` : `${t.plats} platforms · ${t.limit}s${t.crumble ? ' · crumbling' : ''}`;
    return `<li class="${locked ? 'todo locked' : best ? 'done pick' : 'next pick'}" style="--c:${col}" ${locked ? '' : `data-act="chal-stage" data-s="${s}"`}><span class="lad-n">${locked ? '🔒' : s}</span>` +
      `<b>Stage ${s}</b><small>${what}</small><i class="lad-pips">${[1, 2, 3, 4, 5].map(q => `<u class="${q <= s ? 'on' : ''}"></u>`).join('')}</i><span class="lad-st">${best ? fmtTime(best) : locked ? '' : '▶'}</span></li>`; }).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="chal-stage" data-s="${top}">Play Stage ${top} →</button><button class="btn big" data-go="scr-main">Menu</button>`;
  showScreen('scr-ladder');
}
// HUD clock / ladder label (render/hud.js)
function chalHudText() {
  if (CHAL.mode === 'btt' && CHAL.btt) { const B = CHAL.btt; return 'STAGE ' + B.stage + ' · ⏱ ' + fmtTime(B.done ? B.final : B.t) + ' · ' + B.broke + '/' + B.targets.length; }
  if (CHAL.mode === 'arcade' && CHAL.arc) { const A = CHAL.arc, R = A.rungs[A.idx]; return 'ARCADE · STAGE ' + (A.idx + 1) + '/' + A.rungs.length + (R && R.boss === 'hand' ? ' · FINAL BOSS' : R && R.boss ? ' · GIANT' : ''); }
  if (CHAL.mode === 'btp' && CHAL.btp) { const B = CHAL.btp, left = Math.max(0, B.limit - B.t); return 'STAGE ' + B.stage + ' · ⏳ ' + fmtTime(left) + ' · ' + B.boarded + '/' + B.plats.length; }
  return '';
}
// showResult() hook: the challenge modes have their own results
function chalResult() {
  const xp = (m, B) => { if (typeof passChallengeXP === 'function') passChallengeXP(m, B); if (typeof challengeTitles === 'function') challengeTitles(m, B); };   // Battle Pass XP · titles (ui/profile.js)
  if (CHAL.mode === 'arcade' && CHAL.arc) { arcadeResult(); xp('arcade', CHAL.arc); return true; }
  if (CHAL.mode === 'btt' && CHAL.btt) { bttResult(); xp('btt', CHAL.btt); return true; }
  if (CHAL.mode === 'btp' && CHAL.btp) { btpResult(); xp('btp', CHAL.btp); return true; }
  return false;
}

/* ---- the targets: 3D bullseyes (WebGL) + canvas versions ---- */
function collectChal3D() {
  const t = G.time;
  if (CHAL.mode === 'btp' && CHAL.btp) {                                       // Board the Platforms: amber beacons on the platforms still to board, green once boarded
    for (const p of CHAL.btp.plats) { const x = p.x + p.w / 2, on = p.boarded, c = C(on ? '#3dffc8' : '#ffb03a');
      ringFloor(x, p.y - 1, p.w * 0.75, p.w * 0.45, c, on ? 0.9 : 0.7 + 0.4 * Math.sin(t * 0.15 + x));
      if (!on) { bG('cyl', x, p.y - 110, 0, 5, 220, 5, c, 0.35 + 0.15 * Math.sin(t * 0.1 + x)); bL('octa', x, p.y - 34 + Math.sin(t * 0.08 + x) * 5, 0, 6, 9, 6, c, 0.6, t * 0.05, 0); }
      else { sL('tube', x, p.y, 0, x, p.y - 40, 0, 1.4, C('#d8dce8'), 0.2); bF('box', x + 9, p.y - 34, 0, 18, 11, 1.5, c, 1); } }
    return;
  }
  const B = CHAL.btt; if (CHAL.mode !== 'btt' || !B) return;
  const red = C('#ff2f57'), white = C('#fff6f0'), gold = C('#ffd23a');
  for (const T of B.targets) {
    if (T.hit) continue;
    const y = T.y + Math.sin(t * 0.06 + T.x) * 4, wob = Math.sin(t * 0.05 + T.y) * 0.5, r = T.r;
    [[1, red], [0.74, white], [0.5, red], [0.26, white]].forEach(([k, c], i) => bL('disc', T.x, y, i * 1.2, r * k, 2.2, r * k, c, i === 3 ? 0.3 : 0.15, wob, 0, Math.PI / 2));
    bL('torus', T.x, y, 0, r * 1.05, r * 1.05, r * 1.05, gold, 0.4, wob, 0, Math.PI / 2);
    bG('sph', T.x, y, 0, r * 1.7, r * 1.7, r * 1.2, C('#ff4fd8'), 0.28 + 0.12 * Math.sin(t * 0.2 + T.x));
    for (let i = 0; i < 3; i++) { const a = t * 0.08 + i * TAU / 3; bG('sph', T.x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, Math.sin(a * 2) * 10, 2.4, 2.4, 2.4, gold, 1.1); }
  }
}
function drawChal2D() {
  if (CHAL.mode === 'btp' && CHAL.btp) { ctx.save(); ctx.lineWidth = 3;
    for (const p of CHAL.btp.plats) { ctx.strokeStyle = p.boarded ? '#3dffc8' : '#ffb03a'; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y - 2, p.w * 0.75, 7, 0, 0, TAU); ctx.stroke();
      if (!p.boarded) { ctx.fillStyle = 'rgba(255,176,58,0.25)'; ctx.fillRect(p.x + p.w / 2 - 3, p.y - 220, 6, 220); } }
    ctx.restore(); return; }
  const B = CHAL.btt; if (CHAL.mode !== 'btt' || !B) return;
  ctx.save();
  for (const T of B.targets) { if (T.hit) continue; const y = T.y + Math.sin(G.time * 0.06 + T.x) * 4;
    [[1, '#ff2f57'], [0.74, '#fff6f0'], [0.5, '#ff2f57'], [0.26, '#fff6f0']].forEach(([k, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(T.x, y, T.r * k, 0, TAU); ctx.fill(); });
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(T.x, y, T.r * 1.05, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

/* ---- sounds ---- */
Object.assign(SFX, {
  target() { const t = AUDIO.ctx.currentTime; noise({ f0: 7000, f1: 2500, dur: 0.25, gain: 0.14, filter: 'highpass', verb: 0.3 }); [88, 95, 100].forEach((n, i) => tone({ type: 'square', f0: mtof(n), dur: 0.12, gain: 0.05, at: t + i * 0.04 })); },
  targetsDone() { const t = AUDIO.ctx.currentTime; [72, 76, 79, 84, 88, 91].forEach((n, i) => tone({ type: 'square', f0: mtof(n), dur: 0.3, gain: 0.06, at: t + i * 0.07, verb: 0.4 })); }
});
GAME_EVENT_LISTENERS.push(type => { if (type === 'target') sfx('target'); else if (type === 'targetsDone') sfx('targetsDone'); });

/* ---- menu wiring ---- */
$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'challenges') go('scr-challenge');
  else if (a === 'chal-arcade' || a === 'chal-btt' || a === 'chal-btp') { SEL.challenge = a.slice(5); go('scr-select'); }
  else if (a === 'chal-go') chalGo();
  else if (a === 'chal-fight' || a === 'chal-continue') { if (a === 'chal-continue') CHAL.arc.continues++; arcadeFight(); }
  else if (a === 'chal-arcade-again') { SEL.challenge = 'arcade'; arcadeStart(); }
  else if (a === 'chal-retry') { if (CHAL.mode === 'btp') btpStart(); else bttStart(); }
  else if (a === 'chal-stage') { const s = +t.dataset.s || 1; if (CHAL.mode === 'btp') btpStart(s); else bttStart(s); }
  else if (a === 'chal-stages') showStages(CHAL.mode === 'btp' ? 'btp' : 'btt');
});
function chalGo() { if (SEL.challenge === 'arcade') arcadeStart(); else if (SEL.challenge === 'btt' || SEL.challenge === 'btp') showStages(SEL.challenge); }   // (the solo challenges open their stage list)
function refreshChallenges() {
  const arc = store.get('neonbrawl.arcade', {}), btt = stageRecords('btt'), btp = stageRecords('btp'), P = stageProgress();
  const na = Object.keys(arc).length, nb = Object.keys(btt).length, np = Object.keys(btp).length;
  $('chal-btp-best').textContent = `Stage ${P.btp || 1}/${STAGE_N} unlocked` + (np ? ` · ${np} clear${np === 1 ? '' : 's'}` : '');
  $('chal-arc-best').textContent = na ? `Cleared with ${na} fighter${na === 1 ? '' : 's'} · fastest ${fmtTime(Math.min(...Object.values(arc)))}` : '8 stages · not cleared yet';
  $('chal-btt-best').textContent = `Stage ${P.btt || 1}/${STAGE_N} unlocked` + (nb ? ` · ${nb} clear${nb === 1 ? '' : 's'}` : '');
}
