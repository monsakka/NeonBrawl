/* NEON BRAWL — The menus, rendered in real-time 3D (WebGL) behind the glass UI.
 *   • main menu / settings / online / setup: a living 3D arena — your picked arena with its sky, scenery and weather,
 *     a slow cinematic camera orbit (plus pointer parallax), and your fighter + your rival idling on the stage;
 *   • stage select: the hovered arena itself, live in 3D, behind the stage cards;
 *   • character select: a 3D showcase viewport — the actual WebGL model on a glass pedestal under a spotlight; it
 *     spins in on hover, idles through its moves, and reacts with its victory celebration (and a burst of 3D
 *     confetti) when you pick it; the VS nameplates carry live 3D head portraits (a 3D die for a random CPU);
 *   • roster tiles and stage cards show 3D renders of every fighter / arena (rendered once each into a cache);
 *   • results: a 3D victory scene — the winner celebrating in the spotlight, the loser dazed beside them.
 * Viewports are DOM elements; the 3D view is drawn straight into the WebGL canvas behind them (render3d.js).     */
'use strict';

const MENU3D = { store: {}, px: 0, py: 0, tileKey: CHARS.map(() => ''), stageKey: STAGES.map(() => ''), parts: [] };
const MENU_DIM = { 'scr-main': 0.08, 'scr-stage': 0.02, 'scr-select': 0.42, 'scr-settings': 0.45, 'scr-how': 0.5, 'scr-online': 0.45, 'scr-setup': 0.35 };
const DET3 = { i: -1, t0: 0, p1: undefined, cpu: undefined, pick: -999, pickI: -1 };

function withStage(st, fn) {
  const save = { ST, STAGE, PLATS, BZ };
  ST = st; STAGE = st.main; PLATS = st.plats; BZ = st.bz;
  try { return fn(); } finally { ({ ST, STAGE, PLATS, BZ } = save); }
}
const menuStage = () => G.screen === 'scr-stage' ? STAGES[stageHover !== null ? stageHover : SEL.stage] : ST;

function renderMenu3D() {
  const t = G.time;
  menuSnapshots();                                                            // thumbnail caches first (they use their own framebuffer)
  const st = menuStage();
  MENU3D.px += ((typeof PAR !== 'undefined' ? PAR.x : 0) - MENU3D.px) * 0.04; MENU3D.py += ((typeof PAR !== 'undefined' ? PAR.y : 0) - MENU3D.py) * 0.04;
  withStage(st, () => {
    if (STAGE3D.key !== st.id || !STAGE3D.main) buildStage3D();
    const S = STAGE, cx = S.x + S.w / 2, cy = -S.y + 70, stageScr = G.screen === 'scr-stage';
    const a = Math.sin(t * 0.0021) * 0.42 + MENU3D.px * 0.4, R = stageScr ? 1380 : 1300, off = (stageScr ? 0.3 : G.screen === 'scr-main' ? 0.16 : 0) * R;
    const eye = [cx + Math.sin(a) * R, cy + 250 - MENU3D.py * 140, Math.cos(a) * R];
    const E = Object.assign({}, STAGE3D.env, { fogNear: R + 350, fogFar: R + 5200 });
    glViewCamera(eye, [cx - Math.cos(a) * off, cy - (stageScr ? 130 : 0), Math.sin(a) * off], 0.62, VIEW.LW / VIEW.LH, E, 20, 9000);
    glLight(cx, -(S.y - 160), Math.max(900, (BZ.r - BZ.l) * 0.42));
    collectStage3D();
    if (G.screen !== 'scr-select') menuFighters(st);
    glFlush({ sky: STAGE3D.sky, weather: weatherFor(st.id, { x: cx, y: S.y - 140, z: 0.8 }), post: { vig: G.screen === 'scr-main' ? 0.5 : 0.62, dim: MENU_DIM[G.screen] || 0.3 } });
  });
  if (G.screen === 'scr-select') { showcase3D(); plates3D(); }
}
// your fighter and your rival idling on the arena (an occasional flourish keeps them alive)
function menuFighters(st) {
  const t = G.time, pool = fighterPool();
  const picks = [[SEL.p1, 0, 1], [SEL.cpu !== null ? SEL.cpu : pool[Math.floor(t / 420) % pool.length], 1, -1]];
  for (const [ci, k, face] of picks) {
    if (ci === undefined || ci === null) continue;
    const ch = CHARS[ci], d = dummyFor(MENU3D.store, 'w' + k, ch, skinIdx(ch)), lt = (t + k * 260) % 600;
    poseDummy(d, lt > 540 ? 2 * 90 + (lt - 540) : (t + k * 37) % 90);
    d.x = st.spawns[k]; d.y = st.main.y; d.facing = face; d.onGround = true;
    collectFighter3D(d, solveRig(d));
  }
}

/* ---- character select: the 3D showcase ---- */
function showcase3D() {
  const w = domViewport(document.getElementById('det-canvas')); if (!w) return;
  const t = G.time, i = detailIndex(), ch = CHARS[i], d = dummyFor(MENU3D.store, 'show', ch, skinIdx(ch)), col = col3(d.color);
  if (i !== DET3.i) { DET3.i = i; DET3.t0 = t; }
  for (const k of ['p1', 'cpu']) { if (SEL[k] !== DET3[k]) { if (DET3[k] !== undefined && SEL[k] !== null) { DET3.pick = t; DET3.pickI = SEL[k]; confetti3D(col3(skinOf(CHARS[SEL[k]], skinIdx(CHARS[SEL[k]])).color)); } DET3[k] = SEL[k]; } }
  const lt = t - DET3.t0, k = clamp(lt / 26, 0, 1), sm = smooth(k);
  const turns = Math.floor(lt / 480) + smooth(clamp((lt % 480 - 440) / 40, 0, 1));
  const spin = (1 - sm) * TAU + turns * Math.PI + Math.sin(lt * 0.013) * 0.45;
  const reacting = DET3.pickI === i && t - DET3.pick < 150;
  if (reacting) { poseDummy(d, 30); d.victory = true; d.victoryStyle = victoryStyleOf(ch); d.state = 'free'; }
  else { d.victory = false; poseDummy(d, lt + 30); }
  d.facing = 1; d.x = 0; d.y = 0; d.percent = d.state === 'hitstun' ? 120 : 0;
  glViewCamera([0, 74, 255], [0, 40, 0], 0.4, w.aspect, studioEnv(col), 10, 3000, true);
  // pedestal: a dark glossy drum with a glowing neon rim, rings of light pulsing outward, a spotlight from above
  const ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -14, 0, 66, 14, 66); ped.col = [0.1, 0.11, 0.2]; ped.spec = 1; ped.shin = 80; ped.metal = 0.6; ped.outline = 1.2; ped.shadow = false;
  const top = glItem(GL3D.mesh.cylCap); xf(top.m, 0, -1.5, 0, 62, 1.5, 62); top.col = mix3(col, [0.1, 0.1, 0.2], 0.7); top.spec = 1.2; top.shin = 120; top.metal = 0.4; top.shadow = false;
  BAT.glow.add(BAT.T.ring, xf(SM, 0, -1, 0, 66, 4, 66), col[0], col[1], col[2], 1.4);
  for (let r = 0; r < 3; r++) { const u = ((t * 0.008 + r / 3) % 1); BAT.glow.add(BAT.T.ring1, xf(SM, 0, 0.5, 0, 62 * u + 4, 2, 62 * u + 4), col[0], col[1], col[2], 0.9 * (1 - u)); }
  if (k < 1) BAT.glow.add(BAT.T.ring3, xf(SM, 0, 1, 0, 30 + 90 * k, 3, 30 + 90 * k), col[0], col[1], col[2], 1.2 * (1 - k));
  BAT.glow.add(BAT.T.cone, xf(SM, 0, 260, 0, 120, 262, 120, 0, Math.PI), 1, 1, 1, 0.07);
  for (let m = 0; m < 14; m++) { const h = (Math.sin(m * 91.7) * 0.5 + 0.5), y = (m * 41 + t * (0.18 + h * 0.2)) % 200, r = 18 + y * 0.45;
    BAT.glow.add(BAT.T.octa, xf(SM, Math.sin(m * 12.9 + t * 0.01) * r * 0.8, 200 - y, Math.cos(m * 7.3 + t * 0.012) * r * 0.6, 0.9, 0.9, 0.9), 1, 1, 1, 0.5 * Math.sin(Math.PI * y / 200)); }
  // the fighter, spun on the turntable
  const n0 = GL3D.n; collectFighter3D(d, solveRig(d));
  const Rm = xf(new Float32Array(16), 0, 0, 0, 0.9 + 0.1 * sm, 0.9 + 0.1 * sm, 0.9 + 0.1 * sm, spin), tmp = new Float32Array(16);
  for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, Rm, it.m); it.m.set(tmp); it.shadow = false; }
  partsTick();
  glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
}
// a burst of 3D confetti + stars round the pedestal when a fighter is picked
function confetti3D(col) {
  for (let i = 0; i < 46; i++) { const a = Math.random() * TAU, s = 1.5 + Math.random() * 3.5;
    MENU3D.parts.push({ x: Math.cos(a) * 20, y: 30 + Math.random() * 20, z: Math.sin(a) * 20, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, r: Math.random() * 6, life: 70 + Math.random() * 40, max: 110,
      c: i % 3 === 0 ? col : [Math.random(), Math.random() * 0.6 + 0.4, 1 - Math.random() * 0.5], star: i % 5 === 0 }); }
}
function partsTick() {
  const P = MENU3D.parts;
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vy -= 0.12; p.vx *= 0.97; p.vz *= 0.97; p.r += 0.15;
    if (--p.life <= 0 || p.y < -20) { P.splice(i, 1); continue; }
    if (p.star) BAT.flat.add(BAT.T.star, xf(SM, p.x, p.y, p.z, 4, 4, 2.5, p.r, p.r * 0.5), p.c[0], p.c[1], p.c[2], 1);
    else BAT.flat.add(BAT.T.box, xf(SM, p.x, p.y, p.z, 4, 2.4, 0.5, p.r, p.r * 0.7, p.r * 1.3), p.c[0], p.c[1], p.c[2], 0.6); }
}
/* ---- VS nameplates: live 3D head portraits (a tumbling 3D die stands in for a random CPU) ---- */
function plates3D() {
  for (const slot of ['p1', 'cpu']) {
    const w = domViewport(document.getElementById('port-' + slot)); if (!w) continue;
    const i = SEL[slot], t = G.time;
    if (i === null || i === undefined) {
      glViewCamera([0, 0, 120], [0, 0, 0], 0.5, w.aspect, studioEnv([1, 0.83, 0.43]), 10, 1000, true);
      const a = t * 0.03, die = glItem(GL3D.mesh.rbox); xf(die.m, 0, 0, 0, 30, 30, 30, a, a * 0.7, a * 0.4); die.col = [0.97, 0.97, 1]; die.spec = 1; die.shin = 60; die.outline = 1.5;
      const pip = (x, y, z) => { const it = glItem(GL3D.mesh.sphere), m = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, a, a * 0.7, a * 0.4), q = new Float32Array(16); xf(q, x, y, z, 3.6, 3.6, 3.6); M4.mul(it.m, m, q); it.col = [0.08, 0.06, 0.12]; it.spec = 0.6; };
      pip(0, 0, 15.5); pip(-7, 7, -15.5); pip(7, -7, -15.5); pip(15.5, 7, 7); pip(15.5, -7, -7); pip(15.5, 0, 0);
      glFlush({ vp: w.vp, shadow: false, sky: studioSky([1, 0.83, 0.43]) });
      continue;
    }
    const ch = CHARS[i], d = dummyFor(MENU3D.store, 'plate' + slot, ch, skinIdx(ch)), col = col3(d.color);
    poseDummy(d, t % 90); d.facing = slot === 'p1' ? 1 : -1; d.y = Math.sin(t * 0.05) * 1.2;
    glViewCamera([d.facing * 16, 58, 118], [0, 47, 0], 0.6, w.aspect, studioEnv(col), 10, 2000, true);
    collectFighter3D(d, solveRig(d));
    glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
  }
}

/* ---- thumbnail caches: 3D renders of each fighter (roster tiles) and each arena (stage cards) ---- */
function menuSnapshots() {
  if (G.screen === 'scr-select') {
    let budget = 2;
    for (let i = 0; i < CHARS.length && budget > 0; i++) {
      if (charCards[i].classList.contains('off') || !tileVisible[i]) continue;
      const key = skinIdx(CHARS[i]) + '|3d'; if (MENU3D.tileKey[i] === key) continue;
      tileSnap(i); MENU3D.tileKey[i] = key; budget--;
    }
  } else if (G.screen === 'scr-stage') {
    for (let i = 0; i < STAGES.length; i++) {
      if (stageCards[i].classList.contains('off') || MENU3D.stageKey[i] === '3d') continue;
      stageSnap(i); MENU3D.stageKey[i] = '3d'; break;                              // (one arena per frame: it may need building)
    }
  }
}
function tileSnap(i) {
  const ch = CHARS[i], d = dummyFor(MENU3D.store, 'tile', ch, skinIdx(ch)); d.rig = null; d.trail = null;
  poseDummy(d, 30); d.facing = 1; d.percent = 0;
  const img = glSnapshot(156, 104, o => { glViewCamera([30, 56, 206], [0, 37, 0], 0.5, o.aspect, studioEnv(col3(d.color)), 10, 2000);
    collectFighter3D(d, solveRig(d)); glFlush({ fbo: o.fbo, vp: o.vp, shadow: false, clear: [0, 0, 0, 0] }); });
  if (!img) return;
  const c2 = charCtx[i]; c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 156, 104); c2.drawImage(img, 0, 0);
}
function stageSnap(i) {
  const st = STAGES[i];
  const img = glSnapshot(424, 140, o => withStage(st, () => {
    buildStage3D();
    const S = st.main, cx = S.x + S.w / 2, cy = -S.y + 40;
    glViewCamera([cx + 110, cy + 200, 860], [cx, cy - 10, 0], 0.6, o.aspect, Object.assign({}, STAGE3D.env, { fogNear: 1400, fogFar: 6400 }), 20, 9000);
    glLight(cx, -(S.y - 160), 900);
    collectStage3D();
    glFlush({ fbo: o.fbo, vp: o.vp, sky: STAGE3D.sky });
  }));
  if (!img) return;
  const c2 = stageCtx[i]; c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 424, 140); c2.drawImage(img, 0, 0);
}

/* ---- results: the 3D victory scene ---- */
const VIC3 = { parts: [], acc: 0, t0: -1 };
function victory3D() {
  const d = VIC.dummy, w = domViewport(document.getElementById('res-canvas')); if (!d || !w) return;
  if (VIC3.t0 !== VIC.t0) { VIC3.t0 = VIC.t0; VIC3.parts = []; VIC3.acc = 0; }
  const t = G.time - VIC.t0, col = col3(d.color), lo = VIC.loser, wx = lo ? -42 : 0;
  glViewCamera([12, 78, 300], [12, 40, 0], 0.46, w.aspect, studioEnv(col), 10, 3000, true);
  // stage: a glossy floor disc, a spotlight cone + a pool of light under the winner, slowly turning god-rays
  const fl = glItem(GL3D.mesh.cylCap); xf(fl.m, 10, -6, 0, 220, 6, 120); fl.col = [0.07, 0.08, 0.16]; fl.spec = 1; fl.shin = 90; fl.metal = 0.5; fl.shadow = false;
  BAT.glow.add(BAT.T.cone, xf(SM, wx, 240, 0, 70, 242, 70, 0, Math.PI), 1, 1, 1, 0.09);
  BAT.glow.add(BAT.T.disc, xf(SM, wx, 0.5, 0, 60, 0.5, 40), col[0], col[1], col[2], 0.55);
  for (let i = 0; i < 10; i++) { const a = t * 0.004 + i * Math.PI / 5; BAT.glow.add(BAT.T.cone, xfSeg(SM, [wx, 60, -120], [wx + Math.cos(a) * 420, 60 + Math.sin(a) * 420, -160], 26, 6), col[0], col[1], col[2], 0.05 + 0.03 * Math.sin(t * 0.05 + i)); }
  // loser: sitting dazed (scorched by the beating), stars circling its head
  if (lo) { Object.assign(lo, { x: 72, y: 0, facing: -1, vx: 0, vy: 0, rot: 0, onGround: true, state: 'stunned', stunT: 99, move: null, sp: null, hitFlash: 0, invuln: 0, sx: 1, sy: 1, percent: 150 });
    collectFighter3D(lo, solveRig(lo));
    for (let i = 0; i < 3; i++) { const a = G.time * 0.12 + i * 2.1; BAT.lit.add(BAT.T.star, xf(SM, 72 + Math.cos(a) * 20, 78 + Math.sin(a) * 4, Math.sin(a) * 14, 4.5, 4.5, 2.6, a * 2), 1, 0.88, 0.3, 0.8); } }
  // winner: victory hop, then its own victory stance with the occasional celebratory smash
  const st = d.victoryStyle, hop = t < 40 ? Math.abs(Math.sin(t / 40 * Math.PI * 2)) * 22 : 0;
  Object.assign(d, { x: wx, y: -hop, facing: 1, vx: 0, vy: t < 40 ? -4 : 0, rot: 0, onGround: t >= 40, state: 'free', move: null, sp: null, hitFlash: 0, invuln: 0, sx: 1, sy: 1, shield: 100, chill: 0, percent: 0 });
  if (t >= 40 && (st === 'fistpump' || st === 'flex') && (t % 180) > 120) { d.move = buildMove(d, 'usmash'); d.state = 'attack'; d.stateT = Math.min(d.move.s + 2, ((t % 180) - 120) >> 1); }
  const prop = (VICTORY_ANIM[d.ch.id] || {}).prop;
  if (prop === 'car') car3D({ move: { s: 20, a: 9999 }, stateT: 17.99, facing: 1, x: wx - 78, y: 0, color: d.color });
  if (prop === 'sunaura') { const R = 46 + 4 * Math.sin(t * 0.05); shell(wx, -(38 + hop), 0, R, R, R, col, 0.9, -1.4); BAT.glow.add(BAT.T.sph, xf(SM, wx, 38 + hop, -10, R * 0.8, R * 0.8, R * 0.5), 1, 1, 0.94, 0.5); }
  if (prop === 'turntable') { const dx = wx + 16; BAT.lit.add(BAT.T.rbox, xf(SM, dx, 26, 22, 52, 10, 26), 0.1, 0.11, 0.15, 0);
    for (const ox of [-13, 13]) { BAT.lit.add(BAT.T.disc, xf(SM, dx + ox, 31, 22, 10, 1, 10, t * 0.2), 0.04, 0.04, 0.06, 0); BAT.flat.add(BAT.T.disc, xf(SM, dx + ox, 32, 22, 3.5, 0.6, 3.5), col[0], col[1], col[2], 1); } }
  collectFighter3D(d, solveRig(d));
  // champagne spray (Dino), rising flames (Blaze), and every winner's own signature particles
  if (st === 'champagne' && d.snap && t > 30) for (let k = 0; k < 2; k++) VIC3.parts.push({ x: wx + (d.snap.fa[0] + 11), y: hop - d.snap.fa[1], z: 10, vx: 1.2 + Math.random() * 1.6, vy: 0.4 + Math.random() * 1.2, vz: (Math.random() - 0.5), g: 0.08, life: 50, max: 50, s: 1.2 + Math.random(), c: k ? [1, 0.97, 0.8] : [1, 1, 1], shape: 'drop' });
  victoryVfx3D(t, wx);
  for (let i = VIC3.parts.length - 1; i >= 0; i--) { const p = VIC3.parts[i]; p.x += p.vx; p.y += p.vy; p.z += p.vz || 0; p.vy -= p.g || 0; if (--p.life <= 0 || p.y < -10) { VIC3.parts.splice(i, 1); continue; } part3D(p, t); }
  glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
}
// the winner's signature victory particles (recipes in menus.js VFX), as 3D shapes
function victoryVfx3D(t, wx) {
  const R = VFX[VIC.fx]; if (!R) return;
  VIC3.acc += R.rate;
  while (VIC3.acc >= 1) {
    VIC3.acc--;
    const s = (R.size[0] + Math.random() * (R.size[1] - R.size[0])) * 0.55, c = col3(R.cols[Math.floor(Math.random() * R.cols.length)]);
    let x = (Math.random() - 0.5) * 300, y = 150, z = (Math.random() - 0.5) * 80;
    if (R.from === 'ground') { x = wx + (Math.random() - 0.5) * 80; y = 0; } else if (R.from === 'around') { x = wx + (Math.random() - 0.5) * 90; y = 10 + Math.random() * 80; }
    else if (R.from === 'sky') { y = 90 + Math.random() * 50; } else if (R.from === 'side') { x = 180; y = Math.random() * 100; } else if (R.from === 'center' || R.from === 'orbit') { x = wx; y = 40; z = 0; }
    VIC3.parts.push({ x, y, z, vx: R.v[0] * 0.55 + (Math.random() - 0.5) * 0.4, vy: -R.v[1] * 0.55 + (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.4, g: R.g * 0.55, s, c, life: R.life || 90, max: R.life || 90, a: Math.random() * TAU, r0: 20 + Math.random() * 30, shape: R.shape });
  }
}
function part3D(p, t) {
  const k = p.life / p.max, c = p.c; p.a += 0.05;
  switch (p.shape) {
    case 'streak': BAT.glow.add(BAT.T.tube, xfSeg(SM, [p.x, p.y, p.z], [p.x - p.vx * 5, p.y - p.vy * 5, p.z], p.s * 0.5), c[0], c[1], c[2], k); break;
    case 'leaf': BAT.lit.add(BAT.T.sph, xf(SM, p.x + Math.sin(t * 0.06 + p.a) * 3, p.y, p.z, p.s, p.s * 0.45, 0.6, p.a, p.a * 0.6), c[0], c[1], c[2], 0.1); break;
    case 'rect': BAT.flat.add(BAT.T.box, xf(SM, p.x, p.y, p.z, p.s, p.s * 0.5, 0.4, p.a, p.a * 0.7, p.a * 1.3), c[0], c[1], c[2], 0.6); break;
    case 'puff': BAT.alpha.add(BAT.T.sph, xf(SM, p.x, p.y, p.z, p.s * (1.6 - k * 0.6), p.s * (1.6 - k * 0.6), p.s * (1.6 - k * 0.6)), c[0], c[1], c[2], k * 0.6); break;
    case 'drop': BAT.lit.add(BAT.T.sph, xf(SM, p.x, p.y, p.z, p.s * 0.7, p.s * 1.2, p.s * 0.7), c[0], c[1], c[2], 0.5); break;
    case 'ring': BAT.glow.add(BAT.T.ring, xf(SM, p.x, p.y, p.z, p.s, 1, p.s, 0, 0, Math.PI / 2), c[0], c[1], c[2], k); break;
    case 'bar': { const h = p.s * 3 * Math.sin(k * Math.PI); BAT.glow.add(BAT.T.box, xf(SM, p.x, h / 2, p.z, 3, h, 3), c[0], c[1], c[2], 1); break; }
    case 'wave': { const r = (1 - k) * 70 + 6; BAT.glow.add(BAT.T.ring, xf(SM, p.x, p.y, p.z, r, 2, r, 0, 0, Math.PI / 2), c[0], c[1], c[2], k); break; }
    case 'ray': { const a = p.a * 0.4 + p.r0; BAT.glow.add(BAT.T.cone, xfSeg(SM, [p.x + Math.cos(a) * 160, p.y + Math.sin(a) * 160, -30], [p.x, p.y, -30], 16, 3), c[0], c[1], c[2], k * 0.3); break; }
    case 'glow': case 'flame': { const a = p.a * 2 + p.r0; BAT.glow.add(BAT.T.sph, xf(SM, p.x + Math.cos(a) * p.r0, p.y + Math.sin(a) * p.r0 * 0.35, Math.sin(a) * p.r0, p.s * 1.6, p.s * 1.6, p.s * 1.6), c[0], c[1], c[2], 0.9); break; }
    case 'star': BAT.flat.add(BAT.T.star, xf(SM, p.x, p.y, p.z, p.s, p.s, p.s * 0.6, p.a, p.a), c[0], c[1], c[2], 1); break;
    case 'bolt': { let x = p.x, y = p.y + p.s; for (let j = 0; j < 4; j++) { const nx = x + (Math.random() - 0.5) * 8, ny = y - p.s / 2; BAT.glow.add(BAT.T.tube, xfSeg(SM, [x, y, p.z], [nx, ny, p.z], 0.8), c[0], c[1], c[2], 1); x = nx; y = ny; } break; }
    case 'firework': { if (!p.burst) p.burst = Array.from({ length: 18 }, (_, j) => [Math.cos(j * 0.35) * (0.8 + Math.random()), Math.sin(j * 0.35) * (0.8 + Math.random())]);
      const age = p.max - p.life; for (const [bx, by] of p.burst) BAT.flat.add(BAT.T.octa, xf(SM, p.x + bx * age, p.y + by * age - 0.02 * age * age, p.z, p.s, p.s, p.s), c[0], c[1], c[2], 1); break; }
    default: BAT.flat.add(BAT.T.octa, xf(SM, p.x, p.y, p.z, p.s, p.s, p.s, p.a), c[0], c[1], c[2], 1);
  }
}
