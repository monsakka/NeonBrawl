/* NEON BRAWL — KO cinematics (presentation only; the fighter's real state is already 'dead' and respawns on schedule).
 *   STAR KO    knocked out through the top: the fighter tumbles away into the deep background (−Z), shrinking with
 *              perspective, and ends as a twinkling star with a "ping".
 *   SCREEN KO  knocked out through the top, sometimes: the fighter flies at the camera, slams flat against the screen
 *              glass (cracks + thud + rumble), then slides down the glass and fades.
 *   Side / bottom KOs keep the existing blast. In the WebGL renderer the flying fighter is the real 3D model (built
 *   once per frame from a pose dummy, then moved by a 3D transform); the canvas renderer shows the star / cracks only.
 * Also: haptic rumble (navigator.vibrate) on heavy smashes, high-percentage launches and KOs.                     */
'use strict';

const KOFX = [];
const STAR_T = 96, SCREEN_T = 120;

GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'ko' && d.f) {
    const f = d.f, top = d.y <= BZ.t + 8;
    if (!top) return;
    const kind = hash(G.frame * 1.7 + f.id * 13.1) < 0.45 ? 'screen' : 'star';      // (deterministic, so both online players see the same KO)
    const dm = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch: f.ch, name: '', color: f.color, fill: f.fill };
    resetFighter(dm, 0); applySkin(dm, f.ch, f.skin);
    KOFX.push({ kind, f, d: dm, x0: d.x, y0: d.y, t0: G.time, dir: Math.sign(f.vx) || (d.x < 640 ? -1 : 1), cracked: false, star: false });
    if (KOFX.length > 4) KOFX.shift();
  }
  // haptics: a physical rumble on big moments (phones; ignored where unsupported)
  if (canRumble()) {
    try {
      if (type === 'ko') navigator.vibrate([70, 40, 120]);
      else if (type === 'hit' && d.m && d.m.heavy && d.kb >= 14) navigator.vibrate(40);
      else if (type === 'hit' && d.vic && d.vic.percent >= 100 && d.kb >= 12) navigator.vibrate(28);
    } catch (e) { /* no vibration support */ }
  }
});
function clearKOFX() { KOFX.length = 0; }
// rumble only on devices that support it, and only after the player has touched the game (browsers block it before that)
function canRumble() { return SET.haptics && typeof navigator.vibrate === 'function' && !!(navigator.userActivation ? navigator.userActivation.hasBeenActive : TOUCH.seen); }

// 3D: queue each flying fighter's model, transformed along its KO path
function collectKOFX3D() {
  for (let i = KOFX.length - 1; i >= 0; i--) {
    const k = KOFX[i], age = G.time - k.t0, T = k.kind === 'star' ? STAR_T : SCREEN_T;
    if (age < 0 || age > T) { KOFX.splice(i, 1); continue; }
    if (k.kind === 'star' && age > 62) {                                                // the fighter has become a twinkling 3D star far away
      if (!k.star) { k.star = true; sfx('twinkle'); }
      const s0 = starPath(k), u = (age - 62) / (STAR_T - 62), tw = Math.sin(u * Math.PI), c = col3(k.f.color), r = 18 + 60 * tw;
      const st = glItem(GL3D.mesh.star); xf(st.m, s0[0], s0[1], s0[2], r, r, r * 0.5, u * 2, u * 1.5); st.col = [1, 1, 1]; st.emis = 1; st.outline = 4; st.shadow = false;
      const g = glSphere(s0[0], s0[1], s0[2], r * 2.4); g.col = c; g.glow = 1.2 * tw; g.glowPow = 1.4; g.shadow = false;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + u * 1.5, sp = glItem(GL3D.mesh.cone); xfSeg(sp.m, s0, [s0[0] + Math.cos(a) * r * 3, s0[1] + Math.sin(a) * r * 3, s0[2]], r * 0.18); sp.col = [1, 1, 1]; sp.glow = tw; sp.glowPow = 0.5; sp.shadow = false; }
      continue;
    }
    const d = k.d;
    d.state = 'hitstun'; d.stateT = age; d.hitstun = 999; d.onGround = false; d.vx = k.dir * 3; d.vy = -4; d.x = 0; d.y = 0; d.facing = -k.dir; d.hurt = 6;
    d.rot = k.kind === 'star' ? age * 0.32 * k.dir : (age < 26 ? age * 0.25 * k.dir : 0);
    const S = solveRig(d), n0 = GL3D.n;
    collectFighter3D(d, S);
    // the KO path: position + scale + spin, applied to every item of the model (pivot = the body centre)
    let px, py, pz, sc = 1, flat = 1, roll = 0;
    if (k.kind === 'star') {
      // from just inside the top of the view, away into the deep background toward the horizon
      const u = age / 62, e = 1 - Math.pow(1 - u, 2), top = -G.cam.y + (VIEW.LH / 2 - 70) / G.cam.z, s0 = starPath(k);
      px = lerp(clamp(k.x0, G.cam.x - 500, G.cam.x + 500), s0[0], e); py = lerp(Math.min(-k.y0, top), s0[1], e); pz = lerp(0, s0[2], e); sc = 1.2;
    } else {
      // toward the lens along the camera's own centre ray (the camera sits above its target, so "straight at the screen"
      // means along eye→target, not along −Z), until the fighter is flattened against the glass just past the near plane
      const e3 = GL3D.eye, tx = G.cam.x, ty = -G.cam.y, L = Math.hypot(tx - e3[0], ty - e3[1], e3[2]) || 1, gd = Math.max(150, CAM3D.D * 0.17);
      const gx = e3[0] + (tx - e3[0]) * gd / L + k.dir * 8, gy = e3[1] + (ty - e3[1]) * gd / L, gz = e3[2] - e3[2] * gd / L;
      if (age < 26) { const u = age / 26, e = u * u; px = lerp(k.x0, gx, e); py = lerp(Math.min(-k.y0, -G.cam.y + 300), gy, e); pz = lerp(0, gz, e); }
      else { const u = (age - 26) / (SCREEN_T - 26); px = gx; py = gy - u * u * gd * 0.45; pz = gz; flat = 0.25; roll = k.dir * 0.2;
        if (!k.cracked) { k.cracked = true; const c = projectToSafe(px, py, pz); k.cx = c[0]; k.cy = c[1]; k.gp = [gx, gy, gz + 2];   // the crack sits where the fighter hit the glass
          sfx('glass'); G.shake = Math.max(G.shake, 9); if (canRumble()) try { navigator.vibrate(90); } catch (e) {} } }
      sc = 1.15;
    }
    const T4 = M4.ident(), cs = Math.cos(roll), sn = Math.sin(roll);
    T4[0] = cs * sc; T4[1] = sn * sc; T4[4] = -sn * sc; T4[5] = cs * sc; T4[10] = sc * flat;
    T4[12] = px; T4[13] = py; T4[14] = pz;
    const piv = M4.ident(); piv[13] = -32;                                               // dummy feet at the origin → body centre at y=32 (world)
    const X = M4.mul(M4.ident(), T4, piv), tmp = new Float32Array(16);
    for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, X, it.m); it.m.set(tmp); it.shadow = false; it.aoK = 0;
      if (k.kind === 'screen' && age > 26) it.alpha = Math.min(it.alpha, 1 - Math.max(0, (age - 80) / (SCREEN_T - 80))); }
  }
  koCracks3D();
}

// 3D: the spider-web crack in the "screen glass" — real thin tubes on a pane just in front of the lens, where the
// fighter hit it (so they sit in the 3D world, catch the glow, and stay put while the fighter slides down)
function koCracks3D() {
  if (!BAT.glow) return;
  const A = [0, 0, 0], B = [0, 0, 0], M = new Float32Array(16);
  for (const k of KOFX) {
    const age = G.time - k.t0; if (k.kind !== 'screen' || age <= 26 || age > SCREEN_T || !k.gp) continue;
    const a = clamp(1 - (age - 90) / 30, 0, 1), [cx, cy, cz] = k.gp, s = Math.max(0.05, (GL3D.eye[2] - cz) / CAM3D.K), w = 1.1 * s;
    const line = (x0, y0, x1, y1) => { A[0] = cx + x0 * s; A[1] = cy - y0 * s; A[2] = cz; B[0] = cx + x1 * s; B[1] = cy - y1 * s; B[2] = cz;
      BAT.glow.add(BAT.T.tube, xfSeg(M, A, B, w, w), 0.92, 0.96, 1, a * 1.3); BAT.glow.add(BAT.T.tube, xfSeg(M, A, B, w * 3, w), 0.6, 0.75, 1, a * 0.25); };
    for (let i = 0; i < 11; i++) { const ang = i / 11 * TAU + hash(i + k.t0) * 0.4; let x = 0, y = 0;
      for (let st = 1; st <= 4; st++) { const nx = x + Math.cos(ang + (hash(i * 7 + st) - 0.5) * 0.6) * (40 + st * 26), ny = y + Math.sin(ang + (hash(i * 5 + st) - 0.5) * 0.6) * (40 + st * 26); line(x, y, nx, ny); x = nx; y = ny; } }
    for (let r = 36; r < 200; r += 54) { let px = 0, py = 0; for (let i = 0; i <= 11; i++) { const ang = i / 11 * TAU, j = 0.8 + hash(i * 3 + r) * 0.4, x = Math.cos(ang) * r * j, y = Math.sin(ang) * r * j; if (i) line(px, py, x, y); px = x; py = y; } }
  }
}
// 2D overlay (canvas renderer): the star twinkle and the cracked screen glass
function drawKOFX2D(threeD) {
  for (const k of KOFX) {
    const age = G.time - k.t0;
    if (k.kind === 'star' && (age > 62 || !threeD) && age <= STAR_T) {
      // where the star sits on screen: project its end point (3D) or put it high above the KO point (canvas)
      let sx, sy;
      if (threeD) { const s0 = starPath(k), p = projectToSafe(s0[0], s0[1], s0[2]); sx = p[0]; sy = p[1]; }
      else { const v = FRAME_CAM || G.cam; sx = (k.x0 + k.dir * 120 - v.x) * v.z + W / 2; sy = Math.max(40, (k.y0 - v.y) * v.z + H / 2 - 40); }
      const u = (age - (threeD ? 62 : 0)) / (STAR_T - (threeD ? 62 : 0)), tw = Math.sin(u * Math.PI), r = 6 + 22 * tw;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(sx, sy); ctx.rotate(u * 1.5);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g.addColorStop(0, `rgba(255,255,255,${tw})`); g.addColorStop(0.3, rgba(k.f.color, 0.8 * tw)); g.addColorStop(1, rgba(k.f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(r * 2.2, 0); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    if (k.kind === 'screen' && age > 26 && age <= SCREEN_T) {                         // a spider-web crack where the fighter hit the glass
      if (!threeD && !k.cracked) { k.cracked = true; k.cx = W / 2 + k.dir * 80; k.cy = H / 2 - 40; sfx('glass'); G.shake = Math.max(G.shake, 9); }
      const a = clamp(1 - (age - 90) / 30, 0, 1), cx = k.cx === undefined ? W / 2 : k.cx, cy = k.cy === undefined ? H / 2 - 40 : k.cy;
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(235,245,255,0.85)'; ctx.lineWidth = 2; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
      for (let i = 0; i < 11; i++) { const ang = i / 11 * TAU + hash(i + k.t0) * 0.4; let x = cx, y = cy; ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 1; s <= 4; s++) { x += Math.cos(ang + (hash(i * 7 + s) - 0.5) * 0.6) * (40 + s * 26); y += Math.sin(ang + (hash(i * 5 + s) - 0.5) * 0.6) * (40 + s * 26); ctx.lineTo(x, y); }
        ctx.stroke(); }
      for (let rr2 = 36; rr2 < 200; rr2 += 54) { ctx.beginPath(); for (let i = 0; i <= 11; i++) { const ang = i / 11 * TAU, j = 0.8 + hash(i * 3 + rr2) * 0.4; const x = cx + Math.cos(ang) * rr2 * j, y = cy + Math.sin(ang) * rr2 * j; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
      if (!threeD && age < 60) { ctx.globalAlpha = a * 0.9; ctx.fillStyle = rgba(k.f.color, 0.5); ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
}
// Where a star-KO'd fighter ends up: far behind the arena, up and to the side it flew (fixed at the KO, so the star stays put)
function starPath(k) { if (!k.end) k.end = [G.cam.x + k.dir * 600, -G.cam.y + 380, -3800]; return k.end; }
// World point → safe-area screen coordinates through the current 3D camera
function projectToSafe(x, y, z) {
  const m = GL3D.mainVP, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [(cx / cw * 0.5 + 0.5) * VIEW.LW - VIEW.OX, (0.5 - cy / cw * 0.5) * VIEW.LH - VIEW.OY];
}
