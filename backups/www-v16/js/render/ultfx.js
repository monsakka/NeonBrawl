/* NEON BRAWL — Ultimate attacks: the presentation side (gameplay in game/ultimate.js, data in data/ultimates.js).
 *
 *   ultPose        each fighter's own Ultimate choreography (charge → strike → flurry → finale) from its three
 *                  keyframes, with power tremble, spins and dives layered on per family
 *   collectUlt3D   the WebGL cinematic: a power aura and focus lines during the freeze, then the family's own 3D
 *                  set piece — energy beams, meteor trails and craters, erupting spike shockwaves, bolt / icicle /
 *                  arrow / holy-pillar / data / cannonball storms, vortices, flame columns, nine kinds of giant
 *                  spirit beast, a giant clock for the time-stoppers and Dino's F1 car on its victory lap
 *   drawUlt2D      the same set pieces for the classic canvas renderer
 *   ultDarkK       how dark the stage goes during the cinematic (render3d.js frameEnv + the canvas overlay)
 * Plus the Ultimate's sounds and rumble. Nothing here touches the simulation.                                 */
'use strict';

/* ============================== poses ============================== */
function ultPose(f, A, t) {
  const U = ultOf(f), K = U.k, T = f.ultT || 0, ph = f.ultPh, id = f.ch.id;
  const Cp = keyPose(K.c, A), Sp = keyPose(K.s, A), Fp = keyPose(K.f, A);
  let P, tag = 'strike';
  if (ph === 'intro') {                                                       // powering up: into the charge pose, trembling harder and harder
    P = mixPose(pose({ fa: [A, -26], ba: [-A, -24] }), Cp, smooth(T / 22));
    const j = 0.6 + 2.4 * clamp(T / ULT_INTRO, 0, 1), h = n => (hash(t * 0.37 + n + f.id * 7) - 0.5) * 2 * j;
    P.fa = [P.fa[0] + h(1), P.fa[1] + h(2)]; P.ba = [P.ba[0] + h(3), P.ba[1] + h(4)]; P.hd = [P.hd[0] + h(5) * 0.4, P.hd[1] + h(6) * 0.4];
    P.oy -= Math.sin(T * 0.12) * 2;
    tag = 'charge';
  } else if (ph === 'active') {
    P = mixPose(Cp, Sp, smooth(T / 6));
    switch (U.fam) {
      case 'meteor': if (T < 16) { P = mixPose(Cp, Sp, 0.3); P.spin += TAU * 2 * smooth(T / 16); } else if (T < 32) P = Cp; else P = Sp; break;
      case 'uppercut': if (T > 6 && !RENDER3D.on) P.spin += TAU * 2 * smooth((T - 6) / 18); break;   // (the 3D model corkscrews instead: fighter3d.js yaw)
      case 'beam': case 'storm': case 'timestop': if (T < (U.fam === 'storm' ? 22 : U.fam === 'beam' ? 12 : 6)) P = Cp; break;
      case 'quake': if (f.ultS < 0) P = Cp; break;
      case 'grandprix': P = Sp; break;
    }
  } else if (ph === 'cine') {
    const every = Math.max(3, Math.floor(ULT_CINE * 0.78 / U.p.hits)), u = (T % every) / every;
    if (U.fam === 'rush' || U.fam === 'timestop' || U.fam === 'uppercut') P = mixPose(Sp, mixPose(Sp, Cp, 0.65), 0.5 - 0.5 * Math.cos(u * TAU));   // a strike on every hit
    else { P = Sp; const j = 1.2, h = n => (hash(t * 0.41 + n + f.id * 5) - 0.5) * 2 * j; P.fa = [P.fa[0] + h(1), P.fa[1] + h(2)]; P.ba = [P.ba[0] + h(3), P.ba[1] + h(4)]; }
    if (U.fam === 'uppercut' && !RENDER3D.on) P.spin += T * 0.25;
    if (T > ULT_CINE - 14 && U.fam !== 'grandprix') { P = mixPose(P, Fp, smooth((T - (ULT_CINE - 14)) / 8)); tag = 'finale'; }
  } else { P = Fp; tag = 'finale'; }
  P.stiff = 1;
  return [P, 'ult:' + tag + ':' + id];
}
RIG_POSES.push(...[].concat(...Object.keys(ULTS).map(id => ['ult:charge:' + id, 'ult:strike:' + id, 'ult:finale:' + id])));

/* how dark the stage goes (0..1): black-out during the freeze, easing back as the move plays */
function ultDarkK() {
  const C = G.ultCine; if (!C || G.mode === 'menu') return 0;
  if (G.ultFreeze > 0) return clamp(C.t / 6, 0, 1) * 0.85;
  if (C.ph === 'active') return 0.85 * clamp(1 - C.t / 14, 0, 1) + (C.fam === 'timestop' ? 0.35 : 0);
  if (C.ph === 'cine') return C.fam === 'timestop' ? 0.5 : 0.22;
  return 0.22 * clamp(1 - C.t / 14, 0, 1);
}

/* ============================== WebGL ============================== */
function collectUlt3D() {
  for (const f of fighters) {
    if (f.state === 'dead' || f.state === 'respawn') continue;
    const col = C(f.color), t = G.time;
    if (f.state === 'ultimate') { try { ult3D(f, col); } catch (e) { if (ULT3D_ERR++ < 3) console.error('[NEON BRAWL] ultimate 3D', f.ch.id, e); } }
    else if ((f.ult || 0) >= ULT_MAX && G.mode === 'play') {                 // meter full: a pulsing aura + sparks orbiting the fighter
      const p = 0.5 + 0.5 * Math.sin(t * 0.18);
      shell(f.x, f.y - 34, 0, 30, 44, 26, col, 0.18 + 0.14 * p, -1.8);
      for (let i = 0; i < 3; i++) { const a = t * 0.09 + i * TAU / 3; bG('sph', f.x + Math.cos(a) * 34, f.y - 34 + Math.sin(a * 2) * 18, Math.sin(a) * 26, 3, 3, 3, i ? col : WHITE, 1.1); }
    }
    if (f.ultHeld > 0) shell(f.x, f.y - 32, 0, 28, 40, 24, WHITE, 0.25 + 0.2 * Math.sin(t * 0.7), -1.4);   // caught: a flickering energy cage
  }
}
let ULT3D_ERR = 0;

function ult3D(f, col) {
  const U = ultOf(f), P = U.p, alt = C(f.ch.alt || '#ffffff'), t = G.time, T = f.ultT || 0, d = f.facing, cx = f.x, cy = f.y - 34;
  if (f.ultPh === 'intro') {                                                 // the power-up: aura shell, rising rings, streaks, focus lines
    const k = clamp(T / 14, 0, 1), p = Math.sin(t * 0.4);
    shell(cx, cy, 0, 46 + p * 4, 60 + p * 4, 40, col, 0.9 * k, -1.4); shell(cx, cy, 0, 30, 44, 26, WHITE, 0.35 * k, -2.2);
    for (let i = 0; i < 3; i++) { const y = f.y - 6 - ((T * 3 + i * 30) % 90); ringG(cx, y, 0, 44 + i * 6 - ((T * 3 + i * 30) % 90) * 0.2, 3, i % 2 ? alt : col, 1.1 * k, 1.15, t * 0.1 + i); }
    ringFloor(cx, f.y, 70 + p * 8, 46, col, 0.9 * k); ringFloor(cx, f.y, 40, 26, WHITE, 0.7 * k);
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + t * 0.05, r = 34 + (i % 3) * 10, y0 = f.y - ((t * 6 + i * 37) % 170);
      sG('tube', cx + Math.cos(a) * r, y0, Math.sin(a) * r, cx + Math.cos(a) * r, y0 - 28, Math.sin(a) * r, 1.5, i % 2 ? WHITE : col, 0.9 * k); }
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU + hash(i) * 0.2, r0 = 170 + hash(i * 3 + (t >> 2)) * 80;   // manga focus lines, behind the fighter
      sG('tube', cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, -160, cx + Math.cos(a) * 1100, cy + Math.sin(a) * 1100, -160, 2 + hash(i) * 3, i % 3 ? col : WHITE, 0.3 * k); }
    return;
  }
  if (f.ultPh === 'active' || f.ultPh === 'cine') shell(cx, cy, 0, 34, 46, 28, col, 0.35, -1.8);
  const v = f.ultVic >= 0 ? fighters[f.ultVic] : null;
  switch (U.fam) {
    case 'rush':
      if (f.ultPh === 'active' && T > 6) for (let i = 0; i < 7; i++) { const y = cy + (i - 3) * 9, z = (i % 2 ? 12 : -12);
        sG('tube', f.x - d * (24 + i * 10), y, z, f.x - d * (140 + i * 26), y, z, 1.6, i % 2 ? WHITE : col, 0.75); }
      if (f.ultPh === 'cine' && v) for (let i = 0; i < 6; i++) { const a = t * 0.6 + i * 1.05, x = v.x + Math.cos(a) * 34, y = v.y - 34 + Math.sin(a) * 26;   // a blur of fists around the victim
        bG('sph', x, y, 22, 8, 8, 8, i % 2 ? col : WHITE, 0.8); sG('tube', x, y, 22, x - Math.cos(a) * 30, y - Math.sin(a) * 22, 22, 3, col, 0.4); }
      break;
    case 'beam': beam3D(f, col, alt, t); break;
    case 'meteor': meteor3D(f, U, P, col, alt, t, T); break;
    case 'quake': quake3D(f, U, col, alt, t); break;
    case 'storm': storm3D(f, P, col, alt, t); break;
    case 'vortex': vortex3D(f, col, alt, t); break;
    case 'uppercut': {
      const rising = f.ultPh === 'active' ? T > 6 : true;
      if (rising) { sG('cone', f.x, f.y + 150, 0, f.x, f.y - 50, 0, 40, col, 0.75); sG('cone', f.x, f.y + 100, 0, f.x, f.y - 30, 0, 18, WHITE, 0.6);
        for (let i = 0; i < 4; i++) { const y = f.y + 40 - ((T * 8 + i * 30) % 120); ringG(f.x, y, 0, 30 + i * 6, 3, i % 2 ? alt : col, 0.9, 1.2, t * 0.2 + i); } }
      break;
    }
    case 'summon': if (f.ultSum) beast3D(f.ultSum, col, alt, t, f.ultPh === 'cine'); break;
    case 'timestop': clock3D(f, v, col, alt, t, T); break;
    case 'grandprix':
      if (f.ultCar) { car3D(Object.assign({}, f, { stateT: 10, move: { s: 2, a: 1e9 } }));
        for (let i = 0; i < 6; i++) { const y = f.y - 10 - i * 7; sG('tube', f.x - d * 70, y, (i - 2.5) * 10, f.x - d * (190 + hash(i + (t >> 1)) * 80), y, (i - 2.5) * 10, 1.3, i % 2 ? WHITE : col, 0.6); }
        if (f.ultPh === 'cine') {                                                                         // a checkered flag on a pole, rippling behind the car
          const px = f.x - d * 46, py = f.y - 30; sL('tube', px, py, -14, px - d * 10, py - 64, -14, 1.6, C('#d8dce8'), 0.2);
          for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) { const x = px - d * (14 + i * 10), y = py - 60 + k * 9 + Math.sin(t * 0.35 - i * 0.8) * 3 * (i / 5);
            bF('box', x, y, -14, 10, 9, 1.2, (i + k) % 2 ? WHITE : C('#14161e'), 1); } } }
      break;
  }
}

function beam3D(f, col, alt, t) {
  const B = f.ultBeam; if (!B) return;
  const d = f.facing, x1 = B.x0 + d * B.len, h = B.h, pulse = 0.92 + 0.08 * Math.sin(t * 0.9);
  bG('sph', B.x0, B.y, 0, 30 + h * 0.3 * B.k, 30 + h * 0.3 * B.k, 30, col, 1.2); bG('sph', B.x0, B.y, 0, 16 + h * 0.12, 16 + h * 0.12, 16, WHITE, 1.4);   // the muzzle
  if (B.len < 4) { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.2, r = 70 * (1 - B.k); sG('tube', B.x0 + Math.cos(a) * r, B.y + Math.sin(a) * r, 0, B.x0, B.y, 0, 1.4, col, 0.8); } return; }   // gathering
  sG('cyl', B.x0, B.y, 0, x1, B.y, 0, h * 0.5 * pulse, col, 0.85); sG('cyl', B.x0, B.y, 0, x1, B.y, 0, h * 0.24, WHITE, 1.25);
  for (let s = (t * 14) % 70; s < B.len; s += 70) bG('ring', B.x0 + d * s, B.y, 0, h * 0.64, 3.4, h * 0.64, alt, 0.85, 0, Math.PI / 2);   // spiral rings racing down the beam
  for (let i = 0; i < 10; i++) { const s = ((t * 22 + i * 97) % B.len), a = t * 0.3 + i * 2.1;
    sG('tube', B.x0 + d * s, B.y + Math.cos(a) * h * 0.55, Math.sin(a) * h * 0.55, B.x0 + d * (s + 40), B.y + Math.cos(a) * h * 0.55, Math.sin(a) * h * 0.55, 1.2, WHITE, 0.7); }
  shell(x1, B.y, 0, h * 0.7, h * 0.7, h * 0.6, col, 1, -1.4);                                              // the impact end
}
function meteor3D(f, U, P, col, alt, t, T) {
  const top = f.y - 30;
  if (f.ultPh === 'active' && T >= 16 && T < 32) { ringFloor(f.ultTx, STAGE.y, 60 + Math.sin(t * 0.4) * 8, 36, col, 1); ringFloor(f.ultTx, STAGE.y, 26, 16, WHITE, 0.9);   // lock-on marker
    sG('tube', f.ultTx, STAGE.y, 0, f.ultTx, STAGE.y - 900, 0, 2, col, 0.4); }
  const diving = (f.ultPh === 'active' && T >= 32 && f.ultLand < 0) || (f.ultPh === 'cine' && !f.onGround);
  if (diving) { sG('cone', f.x, top - 260, 0, f.x, top + 10, 0, 46, col, 0.9); sG('cone', f.x, top - 180, 0, f.x, top + 10, 0, 22, WHITE, 0.9);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.3; bG('octa', f.x + Math.cos(a) * 30, top - 40 - ((t * 9 + i * 31) % 140), Math.sin(a) * 30, 5, 5, 5, i % 2 ? alt : col, 1); } }
  const Q = f.ultQuake; if (Q) { const age = T - Q.t0, k = f.ultPh === 'cine' ? 1 : clamp(1 - age / 16, 0, 1), R = Q.R * (0.6 + 0.4 * clamp(age / 6, 0, 1));
    ringFloor(Q.x, Q.y, R, R * 0.55, col, 1.2 * k); ringFloor(Q.x, Q.y, R * 0.6, R * 0.33, WHITE, 0.9 * k);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = R * 0.75; bL('pyr', Q.x + Math.cos(a) * r, Q.y - 14 * k, Math.sin(a) * r * 0.5, 9, 28 * k, 9, C('#4a3a40'), 0, a, 0.3 * Math.cos(a)); }
    if (age < 10) bG('cyl', Q.x, Q.y - 140, 0, 50, 280, 50, col, 0.8 * (1 - age / 10)); }
}
function quake3D(f, U, col, alt, t) {
  const Q = f.ultQuake; if (!Q) { ringFloor(f.x, f.y, 50 + Math.sin(t * 0.5) * 6, 30, col, 0.8); return; }
  const rock = C(darken(f.color, 0.55));
  ringFloor(Q.x, Q.y, Q.R, Q.R * 0.32, col, 1); ringFloor(Q.x, Q.y, Q.R * 0.97, Q.R * 0.3, WHITE, 0.7);
  for (let s = 40; s < Q.R; s += 36) for (const sd of [-1, 1]) {                                            // spikes erupting behind the wave front
    const px = Q.x + sd * s, h = (34 + hash(s * 0.13 + sd) * 46) * clamp((Q.R - s) / 60, 0, 1);
    if (h < 2) continue;
    bL('pyr', px, Q.y - h / 2, (hash(s + sd * 7) - 0.5) * 30, 11, h, 11, rock, 0, 0, sd * 0.15);
    bG('sph', px, Q.y - 2, 0, 16, 5, 16, col, 0.7);
  }
  const fr = Q.R; for (const sd of [-1, 1]) bG('sph', Q.x + sd * fr, Q.y - 8, 0, 22, 18, 22, WHITE, 0.8);  // the wave fronts
  if (Q.pillar) { const p = Q.pillar; bL('rbox', p.x, p.y - p.h / 2, 0, 46, p.h, 46, rock, 0); bG('box', p.x, p.y - p.h, 24, 46, 3, 2, col, 1); }
}
function storm3D(f, P, col, alt, t) {
  const S = f.ultStorm; if (!S) return;
  const sky = S.y - 460, st = P.style;
  ringFloor(S.x, S.y, S.r, S.r * 0.4, col, 0.8 + 0.2 * Math.sin(t * 0.5)); ringFloor(S.x, S.y, S.r * 0.4, S.r * 0.16, WHITE, 0.7);
  for (let i = 0; i < 7; i++) { const x = S.x + (i - 3) * S.r * 0.42, r = 46 + (i % 3) * 14;                   // the storm cloud overhead
    bA('sph', x, sky + Math.sin(t * 0.05 + i) * 6, (i % 2 ? 20 : -20), r, r * 0.7, r, st === 'holy' ? C('#fff6d8') : C('#262a40'), 0.75); }
  bG('sph', S.x, sky + 10, 0, S.r * 1.6, 30, 60, col, 0.35 + 0.25 * ((t >> 1) & 1));
  const k = S.strike && (S.t - S.strike.t) < 4 ? 1 - (S.t - S.strike.t) / 4 : 0;
  if (!S.strike || k <= 0) return;
  const x = S.strike.x, y = S.y - 32;
  if (st === 'bolt') { let px = x, py = sky; for (let yy = sky + 40; yy < y + 40; yy += 40) { const ny = Math.min(yy, y), nx = yy >= y ? x : x + (hash(yy + S.t) - 0.5) * 40;
    sF('tube', px, py, 0, nx, ny, 0, 2.4, WHITE, 1); sG('tube', px, py, 0, nx, ny, 0, 10, col, k); px = nx; py = ny; } }
  else if (st === 'ice') for (let i = 0; i < 5; i++) { const xx = x + (i - 2) * 22, yy = lerp(sky, y, 1 - k * 0.3) - i * 20; bL('cone', xx, yy, (i - 2) * 10, 9, 46, 9, C('#d6fbff'), 0.4, 0, Math.PI); bG('cone', xx, yy, 0, 12, 50, 12, col, 0.5 * k, 0, Math.PI); }
  else if (st === 'arrows') for (let i = 0; i < 6; i++) { const xx = x + (i - 2.5) * 18, yy = y - 30 - i * 26; sF('tube', xx, yy - 60, 0, xx, yy, 0, 1.4, C('#f2e6b8'), 1); sG('cone', xx, yy, 0, xx, yy + 16, 0, 5, col, 1); }
  else if (st === 'holy') { bG('cyl', x, (sky + y) / 2, 0, 46, y - sky, 46, C('#fff1b8'), 1.1 * k); bG('cyl', x, (sky + y) / 2, 0, 18, y - sky, 18, WHITE, 1.3 * k); }
  else if (st === 'data') for (let i = 0; i < 14; i++) { const xx = x + (hash(i * 3.3) - 0.5) * 80, yy = lerp(sky, y, hash(i + S.t * 0.1)); bF('box', xx, yy, (hash(i) - 0.5) * 40, 7, 7, 7, i % 2 ? col : alt, 1, t * 0.2, t * 0.1); }
  else if (st === 'cannon') { const yy = lerp(sky, y, 1 - k); bL('sph', x, yy, 0, 14, 14, 14, C('#1a1c26'), 0); bG('sph', x, yy - 20, 0, 12, 22, 12, C('#ffb84d'), 0.8); }
  ringG(x, y + 28, 0, 40 * (1.4 - k), 4, WHITE, k, 1.3);
}
function vortex3D(f, col, alt, t) {
  const V = f.ultV; if (!V) return;
  bA('sph', V.x, V.y, 0, 44, 44, 44, C('#07040f'), 0.85); shell(V.x, V.y, 0, 54, 54, 54, col, 1.1, -1.6);
  for (let i = 0; i < 7; i++) { const r = V.r * (0.16 + i * 0.1) * (0.92 + 0.08 * Math.sin(t * 0.2 + i));
    ringG(V.x, V.y, 0, r, 4 - i * 0.3, i % 2 ? alt : col, 0.95 - i * 0.09, 0.9 + i * 0.06, t * 0.12 * (i % 2 ? 1 : -1) + i); }
  for (let i = 0; i < 18; i++) { const a = t * 0.18 + i * 0.35, rr = V.r * (1 - ((t * 0.012 + i * 0.055) % 1));
    bL('octa', V.x + Math.cos(a) * rr, V.y + Math.sin(a) * rr * 0.45, Math.sin(a) * rr * 0.6, 4, 4, 4, i % 3 ? col : WHITE, 0.6, a, a); }
}
function clock3D(f, v, col, alt, t, T) {
  const ax = v ? v.x : f.x + f.facing * 150, ay = (v ? v.y : f.y) - 120, z = -260, R = 230, spin = -t * 0.12;
  const k = f.ultPh === 'active' ? clamp(T / 6, 0, 1) : 1;
  ringG(ax, ay, z, R, 10, alt, 1 * k, 0); ringG(ax, ay, z, R * 0.86, 3, col, 0.8 * k, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; bG('box', ax + Math.cos(a) * R * 0.93, ay + Math.sin(a) * R * 0.93, z, i % 3 ? 6 : 12, 26, 4, WHITE, 0.9 * k, 0, -a + Math.PI / 2); }
  sG('tube', ax, ay, z, ax + Math.cos(spin) * R * 0.8, ay + Math.sin(spin) * R * 0.8, z, 5, WHITE, 1.1 * k);
  sG('tube', ax, ay, z, ax + Math.cos(spin * 0.08) * R * 0.5, ay + Math.sin(spin * 0.08) * R * 0.5, z, 8, col, 1.1 * k);
  bG('sph', ax, ay, z, 16, 16, 16, WHITE, 1.2 * k);
  for (let i = 0; i < 3; i++) ringG(ax + (i - 1) * R * 0.7, ay + R * 0.75, z - 40, 50 + i * 12, 6, col, 0.5 * k, 0, t * 0.05 * (i % 2 ? 1 : -1));   // gears
  if (f.ultPh === 'cine' && v) for (let i = 0; i < 3; i++) { const a = (t * 0.25 + i * 2.1), r = 70;               // slash afterimages crossing the frozen victim
    sG('tube', v.x - Math.cos(a) * r, v.y - 34 - Math.sin(a) * r * 0.6, 30, v.x + Math.cos(a) * r, v.y - 34 + Math.sin(a) * r * 0.6, 30, 2.6, i ? col : WHITE, 0.9); }
}

/* Nine kinds of giant spirit beast for the summoners: translucent bodies, glowing edges, burning eyes */
function beast3D(S, col, alt, t, held) {
  const d = S.dir, x0 = S.x, y0 = S.y, age = S.t, k = clamp(age / 6, 0, 1);
  const X = lx => x0 + d * lx, Y = ly => y0 - ly;
  const body = mix3(col, WHITE, 0.25), dark = mix3(col, BLACK, 0.45), A = 0.55 * k;
  const blob = (lx, ly, lz, sx, sy, sz, c, a, rz) => { bA('sph', X(lx), Y(ly), lz, sx, sy, sz, c || body, a === undefined ? A : a * k, 0, (rz || 0) * d); bG('sph', X(lx), Y(ly), lz, sx * 1.04, sy * 1.04, sz * 1.04, col, 0.16 * k, 0, (rz || 0) * d); };
  const limb = (ax, ay, az, bx, by, bz, r, c) => { seg3(X(ax), Y(ay), az, X(bx), Y(by), bz); BAT.alpha.add(BAT.T.tube, xfSeg(FXM, FXA, FXB, r), (c || body)[0], (c || body)[1], (c || body)[2], A); sG('tube', X(ax), Y(ay), az, X(bx), Y(by), bz, r * 1.15, col, 0.18 * k); };
  const eye = (lx, ly, lz, r) => { bG('sph', X(lx), Y(ly), lz, r, r, r, WHITE, 1.5 * k); bG('sph', X(lx), Y(ly), lz, r * 2.2, r * 2.2, r * 2.2, alt, 0.6 * k); };
  const horn = (ax, ay, az, bx, by, bz, r) => { seg3(X(ax), Y(ay), az, X(bx), Y(by), bz); BAT.lit.add(BAT.T.cone, xfSeg(FXM, FXA, FXB, r), 0.95, 0.93, 0.85, 0.2); };
  const gallop = (lx, ph) => { const s = Math.sin(t * 0.5 + ph); limb(lx, 46, 0, lx + s * 22, 4, 0, 9); };
  const jaw = held ? 0.15 : 0.35 + 0.25 * Math.sin(t * 0.3);
  switch (S.beast) {
    case 'tiger': case 'wolf': case 'fox': {
      blob(0, 72, 0, 96, 42, 46); blob(96, 104, 0, 40, 36, 38); blob(132, 94, 0, 26, 16 + jaw * 10, 22);
      for (const [lx, ph] of [[-60, 0], [-40, 2], [50, 1], [70, 3]]) gallop(lx, ph);
      for (const s of [-1, 1]) { horn(98, 130, s * 18, 92, 164, s * 22, 9); eye(122, 112, s * 15, 5); }
      if (S.beast === 'tiger') for (let i = 0; i < 5; i++) bF('box', X(-50 + i * 24), Y(98), 46, 6, 30, 2, dark, 1, 0, 0.4 * d);
      const tails = S.beast === 'fox' ? 9 : 1;
      for (let i = 0; i < tails; i++) { const a = (tails > 1 ? (i / (tails - 1) - 0.5) * 1.6 : 0.3) + Math.sin(t * 0.2 + i) * 0.15;
        limb(-90, 86, 0, -90 - Math.cos(a) * 90, 86 + Math.sin(a) * 90, (i - tails / 2) * 6, tails > 1 ? 8 : 6, tails > 1 ? mix3(alt, WHITE, 0.3) : body); }
      break;
    }
    case 'kraken': {
      blob(20, 170, 0, 70, 84, 66); for (const s of [-1, 1]) eye(66, 176, s * 26, 9);
      for (let i = 0; i < 8; i++) { const zz = (i - 3.5) * 14; let px = 40, py = 110;
        for (let s = 1; s <= 5; s++) { const u = s / 5, nx = 40 + u * 170 + Math.sin(t * 0.25 + i + u * 3) * 24, ny = 110 - u * 100 + Math.cos(t * 0.2 + i * 1.3 + u * 2) * 20; limb(px, py, zz, nx, ny, zz, 13 - u * 9); px = nx; py = ny; } }
      break;
    }
    case 'serpent': case 'dragon': {
      let px = -320, py = 40;
      for (let i = 1; i <= 12; i++) { const u = i / 12, nx = -320 + u * 360, ny = 40 + u * 130 + Math.sin(t * 0.2 + u * 6) * 30; limb(px, py, Math.sin(u * 4 + t * 0.1) * 30, nx, ny, Math.sin(u * 4 + t * 0.1) * 30, 30 - u * 8); px = nx; py = ny; }
      blob(70, 180, 0, 62, 34, 38); blob(120, 168 - jaw * 18, 0, 46, 14, 30);                                  // head + jaw
      for (const s of [-1, 1]) { eye(92, 194, s * 22, 7); horn(52, 200, s * 20, S.beast === 'dragon' ? 0 : 30, 250, s * 30, 10); }
      if (S.beast === 'serpent') blob(40, 186, 0, 22, 70, 74, mix3(alt, body, 0.5), 0.4);                      // the hood
      if (S.beast === 'dragon') { for (const s of [-1, 1]) { const fl = Math.sin(t * 0.25) * 0.4; blob(-40, 210 + fl * 40, s * 70, 110, 12, 70, mix3(alt, body, 0.4), 0.45, s * 0.3); }
        if (!held) { sG('cone', X(180), Y(170), 0, X(150), Y(170), 0, 30, col, 0.9); bG('sph', X(160), Y(170), 0, 30, 24, 24, WHITE, 0.9); } }   // fire breath
      break;
    }
    case 'horse': {
      blob(0, 92, 0, 90, 40, 40); limb(70, 110, 0, 104, 168, 0, 20); blob(118, 172, 0, 44, 22, 22);
      for (const [lx, ph] of [[-60, 0], [-40, 2.4], [52, 1.2], [72, 3.6]]) gallop(lx, ph);
      for (let i = 0; i < 6; i++) blob(84 - i * 14, 190 - i * 4 + Math.sin(t * 0.4 + i) * 4, 0, 10, 10, 10, alt, 0.6);   // mane
      blob(0, 170, 0, 30, 44, 28); blob(4, 228, 0, 22, 24, 22, mix3(body, WHITE, 0.4));                      // the spectral rider
      seg3(X(10), Y(178), 30, X(240), Y(150), 30); BAT.glow.add(BAT.T.cone, xfSeg(FXM, FXA, FXB, 12), alt[0], alt[1], alt[2], 0.9 * k);   // lance
      eye(130, 178, 14, 5);
      break;
    }
    case 'golem': {
      const bone = C('#e8e4d6');
      bL('rbox', X(0), Y(120), 0, 120, 120, 70, mix3(bone, col, 0.2), 0.15); bL('rbox', X(10), Y(204), 0, 64, 54, 56, bone, 0.15);
      for (const s of [-1, 1]) { const sw = Math.sin(t * 0.3 + s) * 30; bL('rbox', X(70 + sw), Y(110), s * 50, 50, 50, 50, bone, 0.15); bL('rbox', X(-30), Y(26), s * 34, 34, 52, 34, bone, 0.15); eye(36, 210, s * 14, 7); }
      for (let i = 0; i < 4; i++) bG('box', X(-20 + i * 14), Y(140), 40, 4, 70, 2, col, 0.8 * k);
      break;
    }
    case 'phoenix': {
      blob(0, 150, 0, 70, 40, 40, mix3(col, C('#ffd23a'), 0.4)); blob(70, 176, 0, 30, 28, 28, mix3(col, C('#ffd23a'), 0.4));
      horn(96, 176, 0, 130, 170, 0, 9);
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const fl = Math.sin(t * 0.3) * 0.5, a = 0.2 + i * 0.22 + fl;
        blob(-10 - i * 12, 160 + Math.sin(a) * (50 + i * 16), s * (40 + i * 18), 40 - i * 4, 10, 18, mix3(C('#ffd23a'), col, i / 6), 0.55); }
      for (let i = 0; i < 5; i++) limb(-60, 140, (i - 2) * 10, -200 - i * 10, 120 - i * 18 + Math.sin(t * 0.2 + i) * 10, (i - 2) * 22, 6, mix3(col, C('#ff6a1f'), 0.5));
      eye(82, 184, 12, 5); eye(82, 184, -12, 5);
      bG('sph', X(0), Y(150), 0, 110, 70, 70, C('#ffb03a'), 0.3 * k);
      break;
    }
    case 'guardian': case 'spirit': default: {
      const copies = S.beast === 'spirit' ? 3 : 1;                                                        // Echo's Mirror Legion: three echoes in a line
      for (let c = 0; c < copies; c++) { const ox = -c * 90, a = (copies > 1 ? 1 - c * 0.28 : 1);
        blob(ox, 150, -c * 30, 56, 80, 42, null, 0.5 * a); blob(ox + 10, 254, -c * 30, 40, 42, 40, null, 0.55 * a);
        for (const s of [-1, 1]) { const reach = held ? 40 : 70 + Math.sin(t * 0.3 + s + c) * 20; limb(ox + 20, 200, s * 50 - c * 30, ox + 20 + reach, 150 + s * 16, s * 40 - c * 30, 16); eye(ox + 40, 262, s * 14 - c * 30, 6 * a); }
        if (S.beast === 'guardian') { ringG(X(ox + 10), Y(300), -c * 30, 46, 4, alt, 1 * k, 1.2, t * 0.05); bF('rbox', X(ox + 40), Y(250), 36, 30, 44, 6, mix3(alt, WHITE, 0.4), 0.6); } }
    }
  }
}

/* ============================== canvas renderer ============================== */
function drawUlt2D(layer) {
  const k = ultDarkK();
  if (layer === 'back') { if (k > 0) { ctx.save(); safeTransform(); fillView(`rgba(4,2,14,${(k * 0.7).toFixed(3)})`); ctx.restore(); } return; }
  for (const f of fighters) {
    if (f.state === 'dead' || f.state === 'respawn') continue;
    const t = G.time, col = f.color, cx = f.x, cy = f.y - 34;
    if ((f.ult || 0) >= ULT_MAX && f.state !== 'ultimate' && G.mode === 'play') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 0.18);
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 52); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 52, 0, TAU); ctx.fill(); ctx.restore(); }
    if (f.state !== 'ultimate') continue;
    const U = ultOf(f), T = f.ultT || 0, d = f.facing;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
    if (f.ultPh === 'intro') { const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 90); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(T / 12, 0, 1) * 0.8; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, TAU); ctx.fill(); }
    const B = f.ultBeam; if (B && B.len > 4) { const h = B.h; ctx.globalAlpha = 0.85; const x1 = B.x0 + d * B.len;
      const g = ctx.createLinearGradient(0, B.y - h / 2, 0, B.y + h / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, col); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(B.x0, x1), B.y - h / 2, Math.abs(x1 - B.x0), h); }
    const Q = f.ultQuake; if (Q) { ctx.globalAlpha = 0.8; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(Q.x, Q.y, Q.R, Q.R * 0.18, 0, 0, TAU); ctx.stroke();
      for (let s = 40; s < Q.R; s += 36) for (const sd of [-1, 1]) { const h = (30 + hash(s * 0.13 + sd) * 40) * clamp((Q.R - s) / 60, 0, 1); ctx.fillStyle = darken(col, 0.4);
        ctx.beginPath(); ctx.moveTo(Q.x + sd * s - 9, Q.y); ctx.lineTo(Q.x + sd * s, Q.y - h); ctx.lineTo(Q.x + sd * s + 9, Q.y); ctx.fill(); } }
    const S = f.ultStorm; if (S) { ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.25, 0, 0, TAU); ctx.stroke();
      if (S.strike && S.t - S.strike.t < 4) { ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(S.strike.x, S.y - 460); for (let y = S.y - 420; y < S.y; y += 40) ctx.lineTo(S.strike.x + (hash(y + S.t) - 0.5) * 40, y); ctx.lineTo(S.strike.x, S.y - 20); ctx.stroke(); } }
    const V = f.ultV; if (V) { for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.7 - i * 0.09; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(V.x, V.y, V.r * (0.15 + i * 0.12), V.r * (0.15 + i * 0.12) * 0.5, t * 0.1 * (i % 2 ? 1 : -1), 0, TAU); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.fillStyle = '#07040f'; ctx.beginPath(); ctx.arc(V.x, V.y, 40, 0, TAU); ctx.fill(); }
    const Sm = f.ultSum; if (Sm) { ctx.globalAlpha = 0.55; const x = Sm.x, y = Sm.y; const g = ctx.createRadialGradient(x, y - 120, 10, x, y - 120, 140); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 110, 150, 110, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * 70, y - 150 + s * 2, 7, 0, TAU); ctx.fill(); } }
    if (U.fam === 'timestop' && (f.ultPh === 'cine' || (f.ultPh === 'active' && T > 2))) { const v = fighters[f.ultVic] || f, ax = v.x, ay = v.y - 120;
      ctx.globalAlpha = 0.6; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ax, ay, 220, 0, TAU); ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(-t * 0.12) * 170, ay + Math.sin(-t * 0.12) * 170); ctx.stroke(); }
    if (U.fam === 'meteor' && f.ultPh === 'active' && T >= 16 && T < 32) { ctx.globalAlpha = 0.8; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(f.ultTx, STAGE.y, 60, 14, 0, 0, TAU); ctx.stroke(); }
    if (U.fam === 'uppercut' && f.ultPh !== 'intro') { const g = ctx.createLinearGradient(0, f.y + 120, 0, f.y - 60); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col); ctx.globalAlpha = 0.6; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(f.x - 34, f.y + 120); ctx.lineTo(f.x, f.y - 60); ctx.lineTo(f.x + 34, f.y + 120); ctx.fill(); }
    ctx.restore();
    if (f.ultCar && typeof drawCar === 'function') drawCar(Object.assign({}, f, { stateT: 10, move: { s: 2, a: 1e9 } }));
  }
}

/* ============================== sound + rumble ============================== */
Object.assign(SFX, {
  ultStart() { const t = AUDIO.ctx.currentTime;                                 // a swelling choir chord, a riser and two heartbeat thumps
    [45, 52, 57, 61, 64].forEach((n, i) => tone({ type: 'sawtooth', f0: mtof(n), dur: 1.0, attack: 0.5, gain: 0.05, filter: 'lowpass', ff: 300, ff1: 5000, verb: 0.7, at: t + i * 0.01 }));
    noise({ f0: 400, f1: 9000, dur: 0.85, attack: 0.7, gain: 0.12, filter: 'bandpass', q: 2, verb: 0.5, at: t });
    crunch({ type: 'sine', f0: 70, f1: 40, dur: 0.25, gain: 0.5, at: t + 0.05 }); crunch({ type: 'sine', f0: 70, f1: 40, dur: 0.25, gain: 0.5, at: t + 0.32 }); },
  ultGo() { noise({ f0: 6000, f1: 300, dur: 0.4, gain: 0.25, filter: 'lowpass', verb: 0.4 }); crunch({ type: 'sawtooth', f0: 160, f1: 50, dur: 0.35, gain: 0.3 }); },
  ultConnect() { const t = AUDIO.ctx.currentTime; SFX.hitH(20); [57, 64, 69, 76].forEach(n => tone({ type: 'square', f0: mtof(n), dur: 0.5, gain: 0.04, filter: 'lowpass', ff: 3000, verb: 0.5, at: t + 0.03 })); },
  ultFinish() { const t = AUDIO.ctx.currentTime; SFX.smash(30);
    crunch({ type: 'sine', f0: 60, f1: 22, dur: 1.6, gain: 0.7, verb: 0.6 }); noise({ f0: 8000, f1: 200, dur: 1.4, gain: 0.3, filter: 'lowpass', verb: 0.7 });
    [45, 57, 64, 69, 73, 76].forEach(n => tone({ type: 'sawtooth', f0: mtof(n), dur: 2.2, gain: 0.045, filter: 'lowpass', ff: 4000, ff1: 600, verb: 0.8, at: t + 0.06 })); },
  ultReady() { const t = AUDIO.ctx.currentTime; [72, 76, 79, 84, 88].forEach((n, i) => tone({ type: 'triangle', f0: mtof(n), dur: 0.35, gain: 0.06, at: t + i * 0.05, verb: 0.5 })); },
  ultWhiff() { tone({ type: 'sawtooth', f0: 400, f1: 90, dur: 0.5, gain: 0.06, filter: 'lowpass', ff: 1200 }); },
  ultDeny() { tone({ type: 'square', f0: 180, dur: 0.07, gain: 0.05, filter: 'lowpass', ff: 900 }); tone({ type: 'square', f0: 150, dur: 0.09, gain: 0.05, filter: 'lowpass', ff: 900, at: AUDIO.ctx.currentTime + 0.09 }); }
});
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'ultReady') { if (d.f && !d.f.cpu) sfx('ultReady'); return; }
  if (type === 'ultDeny') { sfx('ultDeny'); return; }
  if (type !== 'ult') return;
  if (d.phase === 'start') sfx('ultStart'); else if (d.phase === 'go') sfx('ultGo'); else if (d.phase === 'connect') sfx('ultConnect');
  else if (d.phase === 'finish') { sfx('ultFinish'); smashCam(d.vic ? d.vic.x : 640, d.vic ? d.vic.y - 32 : 360, d.f ? d.f.facing : 1, 1); }
  else if (d.phase === 'whiff') sfx('ultWhiff');
  if (typeof canRumble === 'function' && canRumble()) {                                          // haptics: a build-up buzz, then the big hit
    try { if (d.phase === 'start') navigator.vibrate([30, 40, 30, 40, 60]); else if (d.phase === 'connect') navigator.vibrate(60); else if (d.phase === 'finish') navigator.vibrate([120, 50, 200]); } catch (e) { /* unsupported */ }
  }
});
