/* NEON BRAWL — v14 Monthly Minigames (Main menu → Challenges → Monthly Minigames).
 *
 *   VOLLEY BRAWL   the season's headline minigame, always on. A neon beach court split by a glowing net: each fighter
 *                  keeps to their own half and nobody can hurt anybody — every attack, special and projectile hits the
 *                  BALL instead. The heavy ball flies along each move's own launch angle with power from its damage and
 *                  knockback (smashes blast it, jabs tap it, up-tilts set it), bodies bump it gently, and any aerial that
 *                  meets it above the net top near the net SPIKES it straight down into the other court. A point is
 *                  scored when the ball touches the floor; the side that lost the point gets the next ball dropped to
 *                  them. First to 7 wins. The CPU predicts the ball's arc, runs under it, sets, clears and spikes.
 *   PARTY MODES    three rule-twisting battles that rotate month by month (the current one is featured: double Coins):
 *                  Sumo Showdown (one stock on a small dohyō, knockback ×1.35) · Mega Mayhem (both fighters at 150 %,
 *                  the Ultimate meter fills 3× as fast) · Feather Fall (55 % gravity, two extra air jumps).
 *
 * Everything runs offline against the CPU. Each mode pays Coins + Battle Pass XP and has its own titles.        */
'use strict';

/* ============================== the court ============================== */
const VB = { R: 24, GRAV: 0.3, DRAG: 0.997, NET_X: 640, NET_H: 150, TARGET: 7, MAXV: 27 };
const VOLLEY_STAGE = { id: 'volleycourt', name: 'Volley Brawl Court', tag: 'Minigame · first to 7', clean: true, volley: true,
  desc: 'A neon beach court under the stadium lights, split by a glowing energy net.',
  main: { x: 140, y: 500, w: 1000, h: 70 }, plats: [], bz: { l: -300, r: 1580, t: -420, b: 940 }, spawns: [380, 900],
  pal: { fill: ['#c89a62', '#5a3a1e'], edge: '#3dfff0', top: '#d8aa6a', plat: '#ffd23a', glow: '#ff4fd8', bz: 'rgba(61,255,240,0.3)' } };
// Sumo Showdown's ring: a small clay dohyō with a straw-bale edge
const SUMO_STAGE = { id: 'sumoring', name: 'Sumo Ring', tag: 'Party · one small ring', clean: true,
  desc: 'A clay sumo ring ringed with straw bales — the only way to win is to push them out.',
  main: { x: 410, y: 486, w: 460, h: 74 }, plats: [], bz: { l: -200, r: 1480, t: -220, b: 900 }, spawns: [540, 740],
  pal: { fill: ['#c8a070', '#5a3a22'], edge: '#ffd38a', top: '#f6e2c0', plat: '#e8c890', glow: '#ff9a5a', bz: 'rgba(255,154,90,0.32)' } };
Object.assign(THEME3D, { volleycourt: 'arena', sumoring: 'temple' });
Object.assign(LIGHT_RIG, { volleycourt: 'strobe', sumoring: 'lanterns' });
Object.assign(WX_STAGE, { volleycourt: ['confetti'], sumoring: ['petals'] });
Object.assign(ATMO, { volleycourt: ['mote', 28, ['#3dfff0', '#ff4fd8', '#ffffff']], sumoring: ['petal', 26, ['#ffb0c8', '#ffffff']] });
BACKGROUNDS.volleycourt = BACKGROUNDS.stadium; BACKGROUNDS.sumoring = BACKGROUNDS.temple;
Object.assign(STAGE_MUSIC, {
  volleycourt: ['tropical', 124, 57, 'major', 0.12, { name: 'Spike It!', kick: ['punch', FOUR], snare: ['clap', [4, 12]], lead: ['steel', 0.04, 1, 0.2], pump: true }],
  sumoring: ['asian', 132, 50, 'inScale', 0, { name: 'Dohyō Drums', kick: ['taiko', [0, 3, 6, 8, 11, 14]], perc: ['wood', [4, 12]], fx: ['gong'] }]
});
Object.assign(DECO_EXT, {
  volleycourt(kind, w, h, d, add, pal, R, C, main) {                          // sand, crisp court lines, the centre line under the net, a scoreboard trim
    const hw = w / 2, fz = d / 2;
    for (const z of [-fz + 14, fz - 14]) add('box', 0, 0.9, z, w - 20, 1.4, 4, [1, 1, 1], 0.3);
    for (const x of [-hw + 10, hw - 10, 0]) add('box', x, 0.9, 0, 4, 1.4, d - 24, [1, 1, 1], 0.3);
    for (const x of [-hw * 0.4, hw * 0.4]) add('box', x, 0.9, 0, 3, 1.3, d - 24, [1, 1, 1], 0.2);
    add('box', 0, -h / 2, fz + 1, w - 8, h - 12, 2, C('#14102a'), 0);
    for (let x = -hw + 20, k = 0; x < hw - 10; x += 40, k++) add('box', x, -h / 2, fz + 2.2, 30, 6, 1, k % 2 ? C(pal.edge) : C(pal.glow), 0.9);
  },
  sumoring(kind, w, h, d, add, pal, R, C, main) {                             // the straw tawara round the edge, the two white shikiri-sen
    const hw = w / 2, fz = d / 2, straw = [0.86, 0.74, 0.46];
    for (let x = -hw + 14; x < hw - 10; x += 26) for (const z of [-fz + 10, fz - 10]) add('sph', x, 4, z, 13, 6, 9, straw, 0);
    for (let z = -fz + 30; z < fz - 26; z += 26) for (const x of [-hw + 10, hw - 10]) add('sph', x, 4, z, 9, 6, 13, straw, 0);
    for (const x of [-38, 38]) add('box', x, 0.9, 0, 4, 1.4, 60, [1, 1, 1], 0.3);
    add('box', 0, -h / 2, fz + 1, w - 10, h - 14, 2, C('#7a4a2a'), 0);
  }
});

/* ============================== Volley Brawl: start / step / end ============================== */
function volleyStart() {
  CHAL.mode = 'volley';
  withSel({ stage: VOLLEY_STAGE, randStage: false, time: 0, hazards: false, boss: false }, () => startMatch());
  const [p, o] = fighters;
  p.stocks = o.stocks = 1; p.x = VOLLEY_STAGE.spawns[0]; o.x = VOLLEY_STAGE.spawns[1]; p.facing = 1; o.facing = -1;
  const first = Math.random() < 0.5 ? 0 : 1;
  G.volley = { ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, ang: 0, hidden: true, last: -1, still: 0, trail: [] }, score: [0, 0], serve: first, pauseT: 0, started: false, rally: 0, best: 0,
               hits: [0, 0], spikes: [0, 0], points: [], done: false, cd: [0, 0] };
  volleyPlaceBall(first);
  G.endText = null;
}
const netTop = () => STAGE.y - VB.NET_H;
// the ball hangs above the receiving side (during READY / between points), then drops
function volleyPlaceBall(side) { const b = G.volley.ball; b.x = VB.NET_X + (side ? 1 : -1) * 250; b.y = STAGE.y - 430; b.vx = 0; b.vy = 0; b.hidden = false; b.last = -1; b.still = 0; b.spin = 0; G.volley.serve = side; }
function volleyStep() {
  const V = G.volley; if (!V) return;
  const b = V.ball, R = VB.R, L = STAGE.x + R, Rr = STAGE.x + STAGE.w - R, top = netTop();
  // each fighter stays on their own half of the court
  for (const f of fighters) {
    const hw = fHW(f), lo = f.id === 0 ? STAGE.x + hw : VB.NET_X + 14 + hw, hi = f.id === 0 ? VB.NET_X - 14 - hw : STAGE.x + STAGE.w - hw;
    if (f.x < lo) { f.x = lo; if (f.vx < 0) f.vx = 0; } else if (f.x > hi) { f.x = hi; if (f.vx > 0) f.vx = 0; }
    if (V.cd[f.id] > 0) V.cd[f.id]--;
  }
  if (G.mode === 'count' || V.done) return;
  if (!V.started) { V.started = true; volleyPlaceBall(V.serve); }
  if (V.pauseT > 0) { if (--V.pauseT === 0) volleyPlaceBall(V.serve); return; }
  if (b.hidden) return;
  // flight: gravity, a little air drag, the side walls, the stadium roof, the net (its side and the tape on top)
  const px = b.x; b.vy = Math.min(b.vy + VB.GRAV, VB.MAXV); b.vx *= VB.DRAG; b.x += b.vx; b.y += b.vy; b.ang += b.spin; b.spin *= 0.99;
  if (b.x < L) { b.x = L; b.vx = Math.abs(b.vx) * 0.45; volleyTap(b.x - R, b.y, '#ffffff'); } else if (b.x > Rr) { b.x = Rr; b.vx = -Math.abs(b.vx) * 0.45; volleyTap(b.x + R, b.y, '#ffffff'); }
  if (b.y < STAGE.y - 560) { b.y = STAGE.y - 560; b.vy = Math.abs(b.vy) * 0.5; }                 // (the stadium roof keeps it in shot)
  if (b.y > top && Math.abs(b.x - VB.NET_X) < R + 4) {                                  // into the side of the net: it drops back
    const side = px < VB.NET_X ? -1 : 1; b.x = VB.NET_X + side * (R + 4.5); b.vx = side * Math.max(1.5, Math.abs(b.vx) * 0.35); b.vy *= 0.8; volleyTap(VB.NET_X, b.y, VOLLEY_STAGE.pal.edge);
  } else { const dx = b.x - VB.NET_X, dy = b.y - top, d = Math.hypot(dx, dy);           // off the tape on top: a circle-point bounce
    if (d < R + 3) { const nx = d ? dx / d : 0, ny = d ? dy / d : -1, vn = b.vx * nx + b.vy * ny; b.x = VB.NET_X + nx * (R + 3.5); b.y = top + ny * (R + 3.5);
      if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; } V.tape = (V.tape || 0) + 1;
      if (Math.abs(nx) < 0.45) b.vx += (Math.sign(dx) || (V.tape % 2 ? 1 : -1)) * 1.6;           // (a ball on the tape always rolls off one side or the other)
      volleyTap(VB.NET_X, top, VOLLEY_STAGE.pal.edge); } }
  // bodies bump it: a soft header / chest pop that keeps rallies alive
  for (const f of fighters) {
    if (f.state === 'dead' || f.state === 'respawn') continue;
    const r = bodyRect(f), cx = clamp(b.x, r.x, r.x + r.w), cy = clamp(b.y, r.y, r.y + r.h), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d >= R) continue;
    let nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1; if (ny > 0.6 && f.onGround) { ny = -0.6; nx = Math.sign(b.x - f.x) || 1; }
    const rvx = b.vx - f.vx, rvy = b.vy - f.vy, vn = rvx * nx + rvy * ny;
    b.x = cx + nx * (R + 0.5); b.y = cy + ny * (R + 0.5);
    if (vn < 0) { b.vx -= 1.45 * vn * nx; b.vy -= 1.45 * vn * ny; b.vx += f.vx * 0.4; if (ny < -0.3) { b.vy = Math.min(b.vy, -8); b.vx += f.facing * 3.5; }   // a header: popped up and forward the way you face
      volleyTouch(f, false); volleyTap(cx, cy, f.color); gameEvent('volleyBump', { f }); }
  }
  // attacks hit it: along the move's own launch angle, with power from its damage + knockback; aerials over the net spike it
  for (const h of HITBOX_LOG) {
    if (h.kind === 'grab') continue;
    const F = fighters[h.owner]; if (!F || V.cd[F.id] > 0 || !rectCircle(h, b.x, b.y, R + 6)) continue;
    const m = F.state === 'attack' ? F.move : F.state === 'special' ? ((F.sp && F.sp.m) || F.ch.special) : null; if (!m) continue;
    volleyStrike(F, m);
  }
  for (const p of projs) {                                                               // projectiles shove it along their flight and burst
    if (!p.owner || !fighters.includes(p.owner) || p.life <= 0 || Math.hypot(p.x - b.x, p.y - b.y) > R + (p.r || 8)) continue;
    const sp = Math.hypot(p.vx, p.vy) || 1; b.vx = p.vx / sp * Math.min(16, 7 + (p.dmg || 4)); b.vy = Math.min(b.vy * 0.3 + p.vy / sp * 8, -6); b.spin = (Math.sign(p.vx) || 1) * 0.2;
    p.life = 0; volleyTouch(p.owner, false); burst(b.x, b.y, p.color || '#ffffff', 10, 7, 14); G.hitstop = Math.max(G.hitstop, 2); gameEvent('volleyHit', { f: p.owner, spike: false });
  }
  // a stuck ball (balanced somewhere, or barely moving for 2 s) is re-served to the same side
  if (Math.hypot(b.vx, b.vy) < 0.6) { if (++b.still > 120) volleyPlaceBall(V.serve); } else b.still = 0;
  if (G.time % 2 === 0) { b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift(); }
  G.camExtra = [{ x: b.x, y: b.y - 30 }];                                                   // (the camera keeps the ball in frame)
  // the floor: a point to whoever's court it didn't land in
  if (b.y + R >= STAGE.y) { b.y = STAGE.y - R; volleyPoint(b.x < VB.NET_X ? 1 : 0); }
}
function volleyStrike(F, m) {
  const V = G.volley, b = V.ball, toward = F.id === 0 ? 1 : -1, ang = (m.ang === undefined ? 45 : m.ang) * Math.PI / 180;
  let dir = m.radial ? (Math.sign(b.x - F.x) || F.facing) : m.dir !== undefined ? m.dir : F.facing;
  const power = (m.base || 5) * 0.9 + (m.dmg || 4) * 0.55 + (m.heavy ? 4 : 0) + (m.charged ? m.charged * 6 : 0);
  let speed = clamp(9 + power * 1.1, 11, 26), vx = Math.cos(ang) * speed * dir, vy = -Math.sin(ang) * speed;
  const spike = !F.onGround && b.y < netTop() - 6 && Math.abs(F.x - VB.NET_X) < 280 && (dir === toward || m.radial || ang < 0);
  if (spike) { dir = toward; speed = clamp(speed * 1.3, 18, 28); vx = Math.cos(0.55) * speed * dir; vy = Math.sin(0.55) * speed; }   // SPIKE: straight down into the other court
  else if (ang * 180 / Math.PI > 65) { vx = toward * 1.5 + (b.x - F.x) * 0.02; vy = -Math.max(11, speed * 0.85); }        // an up-move SETS it: straight up, drifting a touch toward the net — then jump and spike it
  else if (dir === toward || m.radial) {
    // a forward hit: pick a landing spot in the other court (deeper for stronger moves) and solve the flight so the arc clears the
    // tape — smashes become fast, flat drives; taps float over as lobs (an arcade solve: rallies, not net-balls or wall-bounces)
    // (rally heat: the longer the rally, the faster and less predictable every return — long rallies build to a decisive point)
    const heat = Math.min(12, V.rally), x0 = b.x, y0 = b.y, yf = STAGE.y - VB.R, deep = clamp(150 + power * 15 + heat * 12 + (Math.random() - 0.5) * 90, 170, 470), tx = clamp(VB.NET_X + toward * deep, STAGE.x + 70, STAGE.x + STAGE.w - 70);
    let T = clamp(72 - power * 2.2 - heat * 2, 30, 72);
    for (let k = 0; k < 14; k++) {
      vx = (tx - x0) / T / 0.93; vy = (yf - y0 - 0.5 * VB.GRAV * T * T) / T;
      const tn = (VB.NET_X - x0) / (vx * 0.97); if (tn <= 0) break;
      if (y0 + vy * tn + 0.5 * VB.GRAV * tn * tn < netTop() - 30) break;
      T += 6;
    }
  } else if (vy > -7) vy = -7 - power * 0.15;                                             // (a backward hit keeps the move's own angle, with a little lift)
  b.vx = vx; b.vy = vy; b.spin = dir * speed * 0.012; F.hitDone = true; V.cd[F.id] = 8;
  volleyTouch(F, spike);
  hitSparks(b.x, b.y, speed, F.color, spike ? 5 : 1);
  G.hitstop = Math.max(G.hitstop, spike ? 8 : m.heavy ? 6 : 3); G.shake = Math.max(G.shake, spike ? 9 : m.heavy ? 5 : 2);
  if (spike) { V.spikes[F.id]++; textFx('SPIKE!', b.x, b.y - 50, F.color); ring(b.x, b.y, '#ffffff', 12, 12, 18, 6); G.flash = Math.max(G.flash, 0.15); }
  gameEvent('volleyHit', { f: F, spike });
}
function volleyTouch(f, spike) { const V = G.volley, b = V.ball; V.hits[f.id]++; if (b.last >= 0 && b.last !== f.id) { V.rally++; V.best = Math.max(V.best, V.rally); } b.last = f.id; void spike; }
function volleyTap(x, y, col) { ring(x, y, col, 4, 4, 10, 2); }
function volleyPoint(w) {
  const V = G.volley, b = V.ball, winner = fighters[w];
  V.score[w]++; V.points.push(w); V.rally = 0;
  ring(b.x, STAGE.y, winner.color, 16, 12, 22, 6); burst(b.x, STAGE.y - 6, '#ffe9a0', 26, 11, 26); shatter(b.x, STAGE.y - 10, winner.color, 18); G.shake = Math.max(G.shake, 10); G.hitstop = 10;
  b.hidden = true; gameEvent('volleyPoint', { w, x: b.x });
  if (V.score[w] >= VB.TARGET) {                                                         // match point won
    V.done = true; G.mode = 'ending'; G.endT = 160; G.winner = winner; G.finishAt = G.time; G.matchTime = G.frame;
    G.endText = winner.ch.name + ' WINS ' + Math.max(...V.score) + '–' + Math.min(...V.score);
    return;
  }
  textFx('POINT!', b.x, STAGE.y - 120, winner.color);
  V.serve = 1 - w; V.pauseT = 70;                                                        // the side that lost the point gets the next ball
}
function volleyResult() {
  const V = G.volley, me = fighters[0], foe = fighters[1], won = G.winner === me, t = won ? 'VOLLEY CHAMPION!' : 'DEFEAT';
  $('lad-title').textContent = t; $('lad-title').dataset.text = t;
  $('lad-sub').textContent = `${me.ch.name} ${V.score[0]} – ${V.score[1]} ${foe.ch.name} · ${DIFFS[G.diff].name} CPU`;
  const rows = [['Points', V.score[0], V.score[1]], ['Ball touches', V.hits[0], V.hits[1]], ['Spikes', V.spikes[0], V.spikes[1]], ['Longest rally', V.best, '']];
  $('lad-list').innerHTML = rows.map(([l, a, b], k) => `<li class="done" style="--c:${k ? '#3dfff0' : '#ffd23a'}"><span class="lad-n">${['🏐', '✋', '💥', '🔁'][k]}</span><b>${l}</b><small>${me.ch.name} ${a}${b !== '' ? ' · ' + foe.ch.name + ' ' + b : ''}</small><span class="lad-st">${b === '' || a > b ? '✓' : ''}</span></li>`).join('');
  $('lad-menu').innerHTML = `<button class="btn primary big" data-act="mini-again">Rematch</button><button class="btn big" data-act="mini-hub">Minigames</button><button class="btn big" data-go="scr-main">Menu</button>`;
  const rec = store.get('neonbrawl.minigames', {}); const v = rec.volley || (rec.volley = { played: 0, wins: 0, best: '' });
  v.played++; if (won) { v.wins++; const s = V.score[0] + '–' + V.score[1]; if (!v.best || V.score[0] - V.score[1] > (+v.best.split('–')[0] - +v.best.split('–')[1])) v.best = s; } store.set('neonbrawl.minigames', rec);
  V.won = won; showScreen('scr-ladder');
}

/* ============================== Volley Brawl: the CPU ============================== */
// predict where the ball will be when it falls back through height y (side walls included); null if it never does in 2 s
function volleyPredict(y) {
  const b = G.volley.ball; let x = b.x, yy = b.y, vx = b.vx, vy = b.vy;
  for (let i = 0; i < 120; i++) { vy = Math.min(vy + VB.GRAV, VB.MAXV); vx *= VB.DRAG; x += vx; yy += vy;
    if (x < STAGE.x + VB.R) { x = STAGE.x + VB.R; vx = Math.abs(vx) * 0.45; } else if (x > STAGE.x + STAGE.w - VB.R) { x = STAGE.x + STAGE.w - VB.R; vx = -Math.abs(vx) * 0.45; }
    if (vy > 0 && yy >= y) return { x, t: i }; }
  return null;
}
// the ball's path for the next n frames (side walls included), for the CPU's timing
function volleyPath(n) {
  const b = G.volley.ball, out = []; let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  for (let i = 0; i < n; i++) { vy = Math.min(vy + VB.GRAV, VB.MAXV); vx *= VB.DRAG; x += vx; y += vy;
    if (x < STAGE.x + VB.R) { x = STAGE.x + VB.R; vx = Math.abs(vx) * 0.45; } else if (x > STAGE.x + STAGE.w - VB.R) { x = STAGE.x + STAGE.w - VB.R; vx = -Math.abs(vx) * 0.45; }
    out.push([x, y]); }
  return out;
}
/* The CPU reads the ball's arc, runs to stand just behind where it will drop, and then — instead of guessing — checks each of
 * its real moves: would the ball be inside that move's hitbox during its active frames? It throws the first one that will
 * connect (a smash from deep court, a jab mid-court, an up-tilt to set it up), jumps for balls dropping near the net and
 * spikes them with an aerial. Lower levels react later, misjudge the landing spot and whiff more often.                  */
function volleyAI(f) {
  const V = G.volley, b = V.ball, inp = emptyInput(), lvl = G.diff, side = f.id === 0 ? -1 : 1, toward = -side, a = f.ai || (f.ai = { t: 0, cd: 0, err: 0, last: -1, miss: false });
  a.t++; if (a.cd > 0) a.cd--;
  const home = VB.NET_X + side * 300, moveTo = (x, tol) => { if (x > f.x + tol) inp.right = true; else if (x < f.x - tol) inp.left = true; };
  if (b.hidden || V.done) { moveTo(home, 16); return inp; }
  const key = V.hits[0] + V.hits[1] + V.score[0] * 31 + V.score[1] * 37;
  if (key !== a.last) { a.last = key; a.err = (Math.random() - 0.5) * [110, 56, 24, 8][lvl]; a.miss = Math.random() < [0.4, 0.18, 0.08, 0.04][lvl] + Math.min(0.25, V.rally * 0.012); }   // a fresh read of every touch
  const P = volleyPredict(f.y - 50), mineNow = side < 0 ? b.x < VB.NET_X : b.x > VB.NET_X, mine = P ? (side < 0 ? P.x < VB.NET_X : P.x > VB.NET_X) : mineNow;
  const lo = side < 0 ? STAGE.x + 30 : VB.NET_X + 36, hi = side < 0 ? VB.NET_X - 36 : STAGE.x + STAGE.w - 30;
  const back = BODY_W / 2 * (f.scale || 1) + VB.R + 14;                                // (just outside head-bump range, still inside a jab's reach)
  const tx = mine && P ? clamp(P.x - toward * back + a.err, lo, hi) : home;
  moveTo(tx, 6);
  if (Math.abs(tx - f.x) > 150 && f.onGround && a.t % 16 === 0 && lvl >= 1) inp.dash = Math.sign(tx - f.x);
  if (!mineNow || a.cd > 0 || f.state !== 'free' || a.miss) return inp;
  const path = volleyPath(34), g = PHYS.grav * (f.ch.grav || 1) * (ST.grav || 1), far = Math.abs(f.x - VB.NET_X);
  // would `k` (thrown now, facing `face`) have the ball inside its hitbox during its active frames?
  // (and the ball must not bump into the body before the swing lands — that would pop it away first)
  const connects = (k, face) => { const m = buildMove(f, k); for (let t = 0; t < m.s + m.a && t < path.length; t++) {
      const fy = f.onGround ? f.y : f.y + f.vy * t + 0.5 * g * t * t, fx = f.onGround ? f.x : f.x + f.vx * t, q = path[t];
      if (t < m.s) { if (rectCircle(bodyRect({ x: fx, y: fy, scale: f.scale, crawl: false }), q[0], q[1], VB.R)) return false; continue; }
      if (rectCircle(hitboxRect({ x: fx, y: fy, facing: face, scale: f.scale }, m), q[0], q[1], VB.R + 6)) return true; } return false; };
  const aim = { jab: [100, -30], utilt: [0, -100], fsmash: [100, 0], usmash: [0, -100], fair: [100, -20], bair: [100, -20], uair: [0, -100], nair: [0, 0], dair: [0, 100] };
  if (f.onGround) {
    const heavyOK = lvl >= 2 && far > 380 && !f.ch.carSmash, fire = (k, heavy) => { const [ax, ay] = aim[k]; inp.aimX = ax ? toward * ax : 0; inp.aimY = ay; if (heavy) inp.heavyP = true; else inp.lightP = true; a.cd = [22, 12, 7, 4][lvl]; return inp; };
    if (heavyOK && connects('fsmash', toward)) return fire('fsmash', true);                // a deep-court smash: a fast, flat drive
    if (connects('jab', toward)) return fire('jab', false);                               // the bread-and-butter return: a jab lobs it over
    if (far < 220 && Math.abs(b.x - f.x) < 44 && b.vy > -2 && connects('utilt', toward)) return fire('utilt', false);   // right under it by the net: set it up…
    // …then jump up to meet a ball hanging near the net (facing the net) and spike it
    if (lvl >= 1 && far < 260) { const hit = path.findIndex(q => Math.abs(q[0] - (f.x + toward * 20)) < 70 && q[1] < netTop() - 10 && q[1] > f.y - 230); if (hit > 6 && hit < 22) { inp.jumpP = true; if (toward > 0) inp.right = true; else inp.left = true; a.cd = 3; } }
    return inp;
  }  // in the air: the aerial that will connect (aiming at the net: a forward or back aerial depending on which way it faces)
  for (const k of [f.facing === toward ? 'fair' : 'bair', 'nair', 'uair']) {
    if (!connects(k, f.facing)) continue;
    const [ax, ay] = aim[k]; inp.aimX = ax ? toward * ax : 0; inp.aimY = ay; inp.lightP = true; a.cd = [22, 12, 7, 4][lvl]; return inp; }
  return inp;
}
/* ============================== party modes + the monthly rotation ============================== */
const PARTY_MODES = {
  sumo:    { name: 'Sumo Showdown', icon: '🎌', col: '#ff9a5a', desc: 'One stock each on a tiny clay dohyō, and every hit launches 35 % harder. Push them out!',
             tags: ['1 stock', 'Knockback ×1.35', 'Sumo ring'], rules: { stocks: 1, kb: 1.35, stage: SUMO_STAGE } },
  mega:    { name: 'Mega Mayhem', icon: '🦖', col: '#ff4fd8', desc: 'Both fighters are supersized to 150 % — bigger reach, bigger hurtboxes — and the Ultimate meter charges three times as fast.',
             tags: ['150 % fighters', 'Ultimate ×3', '3 stocks'], rules: { scale: 1.5, ult: 3 } },
  feather: { name: 'Feather Fall', icon: '🪶', col: '#7af0ff', desc: 'Moon gravity: everyone falls at 55 % speed with two extra air jumps, and launches are a touch floatier.',
             tags: ['55 % gravity', '+2 air jumps', 'Floaty launches'], rules: { grav: 0.55, jumps: 2, kb: 0.92 } }
};
const PARTY_ROTATION = ['sumo', 'mega', 'feather'];
const monthIndex = (d = new Date()) => d.getFullYear() * 12 + d.getMonth();
const featuredParty = (d = new Date()) => PARTY_ROTATION[monthIndex(d) % PARTY_ROTATION.length];
// when a party mode next comes round (the first day of its next month)
function partyNextMonth(id, from = new Date()) { for (let k = 0; k < 12; k++) { const d = new Date(from.getFullYear(), from.getMonth() + k, 1); if (featuredParty(d) === id) return d; } return null; }
// the rules for this match: SEL.challenge 'party:<id>' → G.party (startMatch); never online
function partyRulesFor(ch) {
  if (!ch || !String(ch).startsWith('party:') || (typeof NET !== 'undefined' && NET.connected)) return null;
  const id = ch.slice(6), P = PARTY_MODES[id]; if (!P) return null;
  return Object.assign({ id, name: P.name, featured: featuredParty() === id }, P.rules);
}
// after startMatch has reset the fighters: stocks + sizes
function partyApply() {
  const P = G.party; if (!P) return;
  for (const f of fighters) { if (P.stocks) f.stocks = P.stocks; if (P.scale) { f.bossScale = f.scale = P.scale * (f.ch.scale || 1); } if (P.jumps) f.jumps = f.ch.airJumps + P.jumps; }
}
function partyStart(id) { SEL.challenge = 'party:' + id; startMatch(); }
// showResult() hook: party wins are recorded per mode; winning this month's featured mode earns "Party Animal"
function partyResult() {
  const P = G.party, me = fighters[0], won = G.winner === me; if (!P || me.cpu) return;
  const rec = store.get('neonbrawl.minigames', {}); rec.party = rec.party || {}; if (won) rec.party[P.id] = (rec.party[P.id] || 0) + 1; store.set('neonbrawl.minigames', rec);
  if (won && P.featured && typeof earnTitle === 'function') earnTitle('partyAnimal');
}

/* ============================== menus: the Minigames pane, the select screen, results ============================== */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function refreshMinigames() {
  const el = $('mini-grid'); if (!el) return;
  const rec = store.get('neonbrawl.minigames', {}), v = rec.volley || {}, now = new Date(), feat = featuredParty(now), day = now.getDate(), left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - day + 1;
  $('mini-month').textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${PARTY_MODES[feat].name} is this month's party mode · ${left} day${left === 1 ? '' : 's'} left`;
  const card = (id, icon, name, col, desc, tags, state, foot, btn) => `<article class="mini-card ${state}" style="--c:${col}"><i class="mini-ico">${icon}</i><div class="mini-txt"><b>${name}</b><small>${desc}</small>` +
    `<p class="mini-tags">${tags.map(t => `<span>${t}</span>`).join('')}</p><em>${foot}</em></div>${btn}</article>`;
  let html = card('volley', '🏐', 'Volley Brawl', '#3dfff0', 'Spike a heavy physics ball over a glowing net with your own attacks. Smashes blast it, up-tilts set it, aerials over the net spike it. First to 7.',
    ['Season minigame', 'Always on', 'vs CPU'], 'on', v.played ? `Played ${v.played} · won ${v.wins}${v.best ? ' · best win ' + v.best : ''}` : 'Not played yet',
    `<button class="btn small primary" data-act="mini-volley">Play →</button>`);
  const cr = rec.coins || {};                                                              // v16 Coin Scramble: the second season minigame
  html += card('coins', '🪙', 'Coin Scramble', '#ffd23a', 'Coins rain from the sky for 90 seconds — grab them, and knock them out of your rival with solid hits. A KO spills five. Most coins at the bell wins.',
    ['Season minigame', 'Always on', 'vs CPU'], 'on', cr.played ? `Played ${cr.played} · won ${cr.wins} · best haul ${cr.best}` : 'Not played yet',
    `<button class="btn small primary" data-act="mini-coins">Play →</button>`);
  for (const id of PARTY_ROTATION) { const P = PARTY_MODES[id], on = id === feat, wins = (rec.party || {})[id] || 0, nx = partyNextMonth(id, new Date(now.getFullYear(), now.getMonth() + 1, 1));
    html += card(id, P.icon, P.name, P.col, P.desc, (on ? ['THIS MONTH', '×2 Coins'] : []).concat(P.tags), on ? 'on featured' : 'off',
      on ? `Wins: ${wins}` : `Rotates back in ${nx ? MONTHS[nx.getMonth()] + ' ' + nx.getFullYear() : 'soon'}`,
      on ? `<button class="btn small primary" data-act="mini-party" data-id="${id}">Play →</button>` : `<button class="btn small" disabled>🔒 ${nx ? MONTHS[nx.getMonth()].slice(0, 3) : ''}</button>`); }
  el.innerHTML = html;
  const nav = $('chal-mini-best'); if (nav) nav.textContent = `Volley Brawl · Coin Scramble · ${PARTY_MODES[feat].name}`;
}
// the character-select screen's labels for these modes (ui/menus.js)
function miniSelectLabels(ch) {
  if (ch === 'volley') return { title: 'Volley Brawl · pick your fighter + rival', go: 'Serve! →', cpu: 'Your rival (CPU)' };
  if (ch === 'coins') return { title: 'Coin Scramble · pick your fighter + rival', go: 'Scramble! →', cpu: 'Your rival (CPU)' };
  if (ch === 'horde') return { title: 'Survive the Horde · pick your fighter', go: 'Enter the Pit →', cpu: '(no rival — the horde)' };
  const P = ch && ch.startsWith('party:') ? PARTY_MODES[ch.slice(6)] : null;
  return P ? { title: P.name + ' · pick your fighters', go: 'Start ' + P.name + ' →', cpu: 'CPU opponent' } : null;
}
function miniGo() { if (SEL.challenge === 'coins') coinStart(); else if (SEL.challenge === 'volley') volleyStart(); else if (SEL.challenge && SEL.challenge.startsWith('party:')) partyStart(SEL.challenge.slice(6)); }
$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-act^="mini-"]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'mini-volley') { SEL.challenge = 'volley'; go('scr-select'); }
  else if (a === 'mini-party') { SEL.challenge = 'party:' + t.dataset.id; go('scr-select'); }
  else if (a === 'mini-again') volleyStart();
  else if (a === 'mini-hub') { go('scr-challenge'); hubShow('chal', 'mini'); }
});
// HUD: the scoreboard (Volley Brawl) and the mode banner (party modes)
const MINI_HUD = { el: null, k: '' };
function minigameHUD() {
  if (G.coins16 && typeof coinsHUD === 'function') return coinsHUD();                    // v16 Coin Scramble (game/modes16.js)
  const V = G.volley, on = !!V && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending');
  if (!MINI_HUD.el) { MINI_HUD.el = document.createElement('div'); MINI_HUD.el.className = 'vb-board'; HUD.el.appendChild(MINI_HUD.el); }
  HUD.el.classList.toggle('volley', on);
  const k = on ? V.score.join(':') + '|' + V.serve + '|' + (V.pauseT > 0) + '|' + V.rally + '|' + fighters[0].ch.id + fighters[1].ch.id : '';
  if (k === MINI_HUD.k) return; MINI_HUD.k = k;
  MINI_HUD.el.style.display = on ? 'flex' : 'none'; if (!on) return;
  const [a, b] = fighters;
  MINI_HUD.el.innerHTML = `<span class="vb-side" style="--pc:${a.color}"><b>${a.ch.name}</b>${V.serve === 0 && !V.done ? '<i>🏐</i>' : ''}</span><span class="vb-score">${V.serve === 0 && !V.done ? '<i class="vb-srv">🏐</i>' : ''}<em style="color:${a.color}">${V.score[0]}</em><small>FIRST TO ${VB.TARGET}${V.rally > 1 ? ' · RALLY ' + V.rally : ''}</small><em style="color:${b.color}">${V.score[1]}</em>${V.serve === 1 && !V.done ? '<i class="vb-srv">🏐</i>' : ''}</span><span class="vb-side r" style="--pc:${b.color}">${V.serve === 1 && !V.done ? '<i>🏐</i>' : ''}<b>${b.ch.name}</b></span>`;
}
function minigameHudText() {
  if (CHAL.mode === 'volley') return '';
  if (G.party) return (PARTY_MODES[G.party.id] ? PARTY_MODES[G.party.id].icon + ' ' : '') + G.party.name.toUpperCase() + (G.party.featured ? ' · ×2 COINS' : '');
  return '';
}

/* ============================== sounds ============================== */
Object.assign(SFX, {
  volleyHit(spike) { const t = AUDIO.ctx.currentTime; noise({ f0: spike ? 900 : 1800, dur: spike ? 0.22 : 0.08, gain: spike ? 0.3 : 0.16, filter: 'lowpass' }); tone({ type: 'sine', f0: spike ? 140 : 220, f1: 70, dur: spike ? 0.25 : 0.1, gain: spike ? 0.3 : 0.14 });
    if (spike) noise({ f0: 4000, dur: 0.3, gain: 0.08, filter: 'highpass', at: t + 0.02, verb: 0.5 }); },
  volleyBump() { tone({ type: 'sine', f0: 320, f1: 180, dur: 0.07, gain: 0.08 }); },
  volleyPoint() { const t = AUDIO.ctx.currentTime; tone({ type: 'square', f0: 2900, dur: 0.18, gain: 0.04, at: t }); tone({ type: 'square', f0: 2900, dur: 0.3, gain: 0.04, at: t + 0.22 });   // the ref's whistle
    noise({ f0: 1200, dur: 1.1, gain: 0.07, filter: 'bandpass', at: t + 0.1, verb: 0.6 }); }                                                                                    // + the crowd
});
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'volleyHit') sfx('volleyHit', d.spike ? 1 : 0); else if (type === 'volleyBump') sfx('volleyBump'); else if (type === 'volleyPoint') sfx('volleyPoint');
});

/* ============================== the court in 3D: the glowing net, the ball, the landing marker ============================== */
function collectMinigame3D() {
  const V = G.volley; if (!V || ST.id !== 'volleycourt') return;
  const t = G.time, b = V.ball, top = netTop(), x = VB.NET_X, y0 = STAGE.y, edge = col3(VOLLEY_STAGE.pal.edge), pink = col3(VOLLEY_STAGE.pal.glow), white = [1, 1, 1];
  // the net: chrome posts front + back, a glowing cable along the top, an energy mesh between them (lines along z and up the posts)
  for (const z of [-104, 104]) { const p = glSegment([x, -y0, z], [x, -(top - 14), z], 4.2, 4.2, GL3D.mesh.cylCap); p.col = [0.86, 0.88, 0.95]; p.metal = 1; p.spec = 1.4; p.shin = 160; p.outline = 1.2; }
  sG('tube', x, top, -104, x, top, 104, 3.2, white, 1.2); sG('tube', x, top, -104, x, top, 104, 7, edge, 0.6);
  for (let i = 1; i <= 9; i++) { const yy = top + i * VB.NET_H / 10, k = 0.35 + 0.25 * Math.sin(t * 0.08 - i * 0.6); sG('tube', x, yy, -104, x, yy, 104, 0.9, edge, k); }
  for (let i = -4; i <= 4; i++) sG('tube', x, top, i * 23, x, y0, i * 23, 0.8, pink, 0.3);
  bA('box', x, top + VB.NET_H / 2, 0, 3, VB.NET_H, 208, edge, 0.12);                     // a faint energy curtain + its glowing face toward the camera
  for (let i = 0; i < 6; i++) bG('box', x, top + 6 + i * 25, 105, 10, 2, 2, i % 2 ? edge : pink, 0.9);
  // (a stylised net strip facing the camera, so the net reads as a net in the side view: a mesh of glowing cord + a white tape)
  for (let i = 0; i <= 10; i++) sG('tube', x - 22, top + i * VB.NET_H / 10, 2, x + 22, top + i * VB.NET_H / 10, 2, 0.7, edge, 0.55);
  for (let i = -2; i <= 2; i++) sG('tube', x + i * 11, top, 2, x + i * 11, y0, 2, 0.7, edge, 0.45);
  bA('box', x, top + VB.NET_H / 2, 0, 44, VB.NET_H, 4, edge, 0.08); bF('box', x, top - 1, 4, 52, 6, 6, white, 1.2);
  if (b.hidden) return;
  // where it will land: a pulsing target on the sand (red on your side when it's coming for you)
  const P = volleyPredict(y0 - VB.R);
  if (P) { const k = 0.6 + 0.4 * Math.sin(t * 0.3), mine = P.x < x; ringFloor(P.x, y0 - 1, 26 + P.t * 0.15, 18, mine ? [1, 0.3, 0.3] : edge, k); bA('disc', P.x, y0 - 0.6, 0, 18, 0.5, 12, [0, 0, 0], 0.35); }
  // the ball: a glossy sphere with three coloured panel seams spinning with it, a glow trail when it's moving fast
  const s = Math.hypot(b.vx, b.vy), ball = glSphere(b.x, -b.y, 0, VB.R); ball.col = [1, 0.97, 0.88]; ball.spec = 1.2; ball.shin = 110; ball.outline = 1.6; ball.rimK = 1; ball.rimCol = edge;
  [[[1, 0.82, 0.2], 0], [[0.2, 0.55, 1], Math.PI / 3], [[1, 0.3, 0.45], -Math.PI / 3]].forEach(([c, off]) => bL('torus', b.x, b.y, 0, VB.R * 1.01, VB.R * 1.01, VB.R * 1.01, c, 0.05, off, b.ang, Math.PI / 2 + off * 0.5));
  if (s > 12) b.trail.forEach(([tx, ty], i) => bG('sph', tx, ty, 0, VB.R * (0.4 + i * 0.07), VB.R * (0.4 + i * 0.07), VB.R * (0.4 + i * 0.07), s > 20 ? [1, 0.85, 0.4] : edge, 0.05 + i * 0.03));
  if (V.pauseT > 0 || (G.mode === 'count')) ringG(b.x, b.y, 0, VB.R + 8 + Math.sin(t * 0.2) * 3, 2.5, edge, 0.9, 0, t * 0.1);   // the ball waiting to drop
}
function drawMinigame2D() {
  const V = G.volley; if (!V || ST.id !== 'volleycourt') return;
  const b = V.ball, top = netTop();
  ctx.save(); ctx.fillStyle = 'rgba(61,255,240,0.25)'; ctx.fillRect(VB.NET_X - 4, top, 8, VB.NET_H); ctx.fillStyle = '#ffffff'; ctx.fillRect(VB.NET_X - 6, top - 3, 12, 5);
  if (!b.hidden) { ctx.fillStyle = '#fff6e0'; ctx.strokeStyle = '#2a6aff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, VB.R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, VB.R * 0.7, b.ang, b.ang + 2); ctx.stroke(); }
  ctx.restore();
}
