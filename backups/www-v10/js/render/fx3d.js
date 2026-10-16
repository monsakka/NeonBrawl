/* NEON BRAWL — Every effect, projectile, ability, prop and hazard as real 3D geometry (WebGL renderer).
 *
 * Nothing here is a sprite or a canvas drawing: particles are faceted crystals, spheres and streak tubes; slashes are
 * swept 3D ribbons; projectiles are modelled objects (arrows with shafts and heads, spinning vinyl disks, tumbling
 * boulders, rockets with fins and exhaust flames, flasks with corks…); gadgets and hazards are built from boxes,
 * tori, cones and cylinders (Tempest's storm cloud, Aether's tornado, Gaia's rock pillar, the subway train, the
 * highway car, lava geysers, lightning bolts); Dino Nuggi's F1 car is a fully modelled vehicle with chassis, nose
 * cone, side pods, halo, front + rear wings and four spinning wheels.
 *
 * Everything is cel-shaded like the fighters: solid parts go into the inked toon batch (hard light bands + black
 * outline), energy goes into the additive glow batch, smoke and ice into the see-through batch. Everything is
 * rebuilt each frame from the (unchanged) gameplay state, so it can never affect the simulation.             */
'use strict';

const FXM = new Float32Array(16), FXA = [0, 0, 0], FXB = [0, 0, 0];
const C = col3, WHITE = [1, 1, 1], BLACK = [0.03, 0.03, 0.06];
// batch writers in GAME coordinates (x right, y DOWN, z toward the camera); rz = rotation in the screen plane (world)
function bL(t, x, y, z, sx, sy, sz, c, e, ry, rz, rx) { BAT.lit.add(BAT.T[t], xf(FXM, x, -y, z, sx, sy, sz, ry, rz, rx), c[0], c[1], c[2], e || 0); }
function bF(t, x, y, z, sx, sy, sz, c, e, ry, rz, rx) { BAT.flat.add(BAT.T[t], xf(FXM, x, -y, z, sx, sy, sz, ry, rz, rx), c[0], c[1], c[2], e === undefined ? 1 : e); }
function bA(t, x, y, z, sx, sy, sz, c, a, ry, rz, rx) { if (a > 0.01) BAT.alpha.add(BAT.T[t], xf(FXM, x, -y, z, sx, sy, sz, ry, rz, rx), c[0], c[1], c[2], Math.min(1, a)); }
function bG(t, x, y, z, sx, sy, sz, c, k, ry, rz, rx) { if (k > 0.01) BAT.glow.add(BAT.T[t], xf(FXM, x, -y, z, sx, sy, sz, ry, rz, rx), c[0], c[1], c[2], k); }
const seg3 = (x0, y0, z0, x1, y1, z1) => { FXA[0] = x0; FXA[1] = -y0; FXA[2] = z0; FXB[0] = x1; FXB[1] = -y1; FXB[2] = z1; };
function sL(t, x0, y0, z0, x1, y1, z1, r, c, e, rz) { seg3(x0, y0, z0, x1, y1, z1); BAT.lit.add(BAT.T[t], xfSeg(FXM, FXA, FXB, r, rz), c[0], c[1], c[2], e || 0); }
function sF(t, x0, y0, z0, x1, y1, z1, r, c, e, rz) { seg3(x0, y0, z0, x1, y1, z1); BAT.flat.add(BAT.T[t], xfSeg(FXM, FXA, FXB, r, rz), c[0], c[1], c[2], e === undefined ? 1 : e); }
function sG(t, x0, y0, z0, x1, y1, z1, r, c, k, rz) { if (k > 0.01) { seg3(x0, y0, z0, x1, y1, z1); BAT.glow.add(BAT.T[t], xfSeg(FXM, FXA, FXB, r, rz), c[0], c[1], c[2], k); } }
function sA(t, x0, y0, z0, x1, y1, z1, r, c, a, rz) { if (a > 0.01) { seg3(x0, y0, z0, x1, y1, z1); BAT.alpha.add(BAT.T[t], xfSeg(FXM, FXA, FXB, r, rz), c[0], c[1], c[2], Math.min(1, a)); } }
// a fresnel energy shell (single item: needs the rim falloff, not the batch's core glow)
function shell(x, y, z, rx, ry, rz, c, k, pw) { if (k <= 0.01) return null; const it = glSphere(x, -y, z, rx, ry, rz); it.col = c; it.glow = k; it.glowPow = pw === undefined ? -1.6 : pw; it.shadow = false; return it; }
// a ring facing the camera (tilt > 0 leans it back toward the floor, like a shockwave)
const RING_T = [[0.03, 'ring1'], [0.06, 'ring'], [0.12, 'ring3'], [0.2, 'ring4']];
function ringG(x, y, z, r, th, c, k, tilt, spin) { th = Math.max(1, th); const q = th / (2 * Math.max(1, r)); let b = RING_T[0]; for (const e of RING_T) if (Math.abs(e[0] - q) < Math.abs(b[0] - q)) b = e;
  bG(b[1], x, y, z, r, th / (2 * b[0]), r, c, k, spin || 0, 0, Math.PI / 2 - (tilt || 0)); }
function ringL(x, y, z, r, c, e, tilt, spin) { bL('torus', x, y, z, r, r, r, c, e, spin || 0, 0, Math.PI / 2 - (tilt || 0)); }
// a ring lying flat on the floor (ground markers, runes, pads)
function ringFloor(x, y, r, rz, c, k) { bG('ring', x, y, 0, r, 2, rz || r, c, k); }
const fxZ = p => p._z === undefined ? (p._z = (Math.random() - 0.5) * 46) : p._z;      // (cosmetic depth scatter, native RNG)

/* ============================== particles ============================== */
function fx3D() {
  for (const p of fx) {
    const t = clamp(p.life / p.max, 0, 1), z = fxZ(p), c = C(p.color || '#ffffff');
    switch (p.type) {
      case 'dot': { const r = p.size * t + 0.6; bF('octa', p.x, p.y, z, r, r, r, c, 1, p.life * 0.2, p.life * 0.13); bG('sph', p.x, p.y, z, r * 2.6, r * 2.6, r * 2.6, c, 0.55 * t); break; }
      case 'spark': { const x1 = p.x - p.vx * p.len, y1 = p.y - p.vy * p.len, w = p.w * t + 0.5; sF('cone', x1, y1, z, p.x, p.y, z, w, c, 1); sG('tube', x1, y1, z, p.x, p.y, z, w * 2.2, c, 0.5 * t); break; }
      case 'ring': ringG(p.x, p.y, z * 0.3, p.r, p.w * t + 0.5, c, 1.1 * t, 0.4); ringG(p.x, p.y, z * 0.3, p.r * 0.96, 1, WHITE, 0.6 * t, 0.4); break;
      case 'star': { const s = p.size * (1.2 - t * 0.4) * 0.55; bL('star', p.x, p.y, z, s, s, s, c, 0.9, p.rot * 6, p.rot * 6 + (1 - t) * 3); bG('sph', p.x, p.y, z, s * 1.8, s * 1.8, s * 1.8, c, 0.6 * t); break; }
      case 'ghost': ghost3D(p, t, c); break;
      case 'wave': bG('ring3', p.x + Math.cos(p.ang) * p.r * 0.3, p.y + Math.sin(p.ang) * p.r * 0.3, z * 0.2, p.r * 0.45, 12, p.r, c, 0.9 * t, 0, -p.ang, Math.PI / 2); break;
      case 'bolt': { const pts = p.pts; for (let i = 1; i < pts.length; i++) { const ax = p.x + pts[i - 1][0], ay = p.y + pts[i - 1][1], bx = p.x + pts[i][0], by = p.y + pts[i][1];
        sF('tube', ax, ay, z, bx, by, z, 1.3, WHITE, 1); sG('tube', ax, ay, z, bx, by, z, 4.5, c, 0.8 * t); } break; }
      case 'cloud': { const s = p.size * (1 + (1 - t) * 1.7); bA('sph', p.x, p.y, z, s, s * 0.9, s, c, t * 0.6); break; }
      case 'speed': sG('tube', p.x - p.dx * p.len, p.y - p.dy * p.len, z, p.x, p.y, z, 1.6, c, 0.8 * t); break;
      case 'shard': { const s = p.size; bL('octa', p.x, p.y, z, s, s * 0.45, s * 0.3, c, 0.25, p.rot * 0.7, -p.rot, p.rot * 0.5); if (t > 0.5) bG('octa', p.x, p.y, z, s * 1.4, s * 0.7, s * 0.6, c, 0.4 * (t - 0.5), 0, -p.rot); break; }
      case 'ink': { const s = p.size * (1 + (1 - t) * 0.8); bL('sph', p.x, p.y, z, s * p.stretch, s, s * 0.6, c, 0, 0, -p.rot); break; }
      case 'beam': bG('cyl', p.x, p.y + 20, 0, 34, 440, 34, c, 0.7 * t); bG('cyl', p.x, p.y + 20, 0, 12, 440, 12, WHITE, 0.6 * t); break;
      case 'pixel': { const s = p.size; bF('box', p.x, p.y, z, s, s, s, c, 1, p.life * 0.1, p.life * 0.07); break; }
      case 'text': break;                                                                       // (a DOM pop-up: ui layer)
    }
  }
}
// motion-trail afterimage: the pose snapshot rebuilt as glowing 3D volumes
function ghost3D(p, t, c) {
  const s = p.snap, k = 0.45 * t;
  if (!s) { shell(p.x, p.y - 32, 0, 18, 32, 14, c, k, 1.2); return; }
  const ca = Math.cos(s.rot || 0), sa = Math.sin(s.rot || 0), face = p.face || 1;
  const P = (lx, ly) => { const X = lx * s.sx, Y = ly * s.sy + 32; return [p.x + X * ca - Y * sa, p.y - 32 + X * sa + Y * ca]; };
  const sp = (q, r) => { const w = P(q[0], q[1]); bG('sph', w[0], w[1], 0, r, r, r, c, k); };
  const tq = P(0, s.ty); bG('sph', tq[0], tq[1], 0, s.tw * 0.55, s.th * 0.55, s.tw * 0.45, c, k);
  sp([s.hx, s.hy], s.R); sp(s.fa, s.lw + 2); sp(s.ba, s.lw + 2); sp([s.fl[0], s.fl[1] - s.lw * 0.7], s.lw + 2); sp([s.fr[0], s.fr[1] - s.lw * 0.7], s.lw + 2);
  if (s.bones) for (const [a, j, b] of s.bones) { const A = P(a[0], a[1]), J = P(j[0], j[1]), B = P(b[0], b[1]); sG('tube', A[0], A[1], 0, J[0], J[1], 0, s.lw * 0.65, c, k); sG('tube', J[0], J[1], 0, B[0], B[1], 0, s.lw * 0.6, c, k); }
  void face;
}

/* ============================== projectiles ============================== */
function projs3D() {
  const t = G.time;
  for (const p of projs) {
    const c = C(p.color || '#ffffff'), ang = Math.atan2(p.vy, p.vx), rz = -ang, z = 0;
    switch (p.kind) {
      case 'flame': {                                                     // Blaze: three nested tongues of fire
        const k = clamp(p.life / 12, 0, 1) * clamp(p.t / 4, 0, 1), fl = Math.sin(p.t * 0.7 + p.x) * 3; if (k <= 0) break;
        [[1, C('#ff5a1f')], [0.62, C('#ffb03a')], [0.3, C('#fff2b0')]].forEach(([s, col], i) => { const h = p.r * 2.2 * s * (0.85 + 0.15 * Math.sin(p.t * 0.9 + s * 5)) * k, w = p.r * s * k;
          sF('cone', p.x, p.y + p.r * 0.6, i * 3, p.x + fl * s, p.y + p.r * 0.6 - h, i * 3, w, col, 1); });
        bG('sph', p.x, p.y, 0, p.r * 2, p.r * 2.4, p.r * 2, C('#ff6a1f'), 0.5 * k); break; }
      case 'wave': {                                                      // Terra: jagged rock spikes erupting from the floor
        const base = p.y + p.r, fade = clamp(p.life / 10, 0, 1);
        for (let k = 0; k < 3; k++) { const x = p.x - sign(p.vx) * k * 13, h = (26 - k * 7) * (0.8 + 0.2 * Math.sin(p.t * 0.6 + k)) * fade;
          bL('pyr', x, base, (k - 1) * 10, 9, h, 9, c, 0.1, k * 0.7 + 0.4, (k - 1) * 0.15); }
        bG('sph', p.x, base - 6, 0, 26, 10, 22, c, 0.35 * fade); break; }
      case 'arrow':                                                       // Orion: a bolt of light — shaft, arrowhead, fletching, streak
        sL('tube', p.x - Math.cos(ang) * 30, p.y - Math.sin(ang) * 30, z, p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4, z, 1.4, C('#f2e6b8'), 0.3);
        sL('cone', p.x + Math.cos(ang) * 3, p.y + Math.sin(ang) * 3, z, p.x + Math.cos(ang) * 15, p.y + Math.sin(ang) * 15, z, 4, WHITE, 0.8);
        for (const s of [-1, 1]) bL('box', p.x - Math.cos(ang) * 27 - Math.sin(ang) * s * 3, p.y - Math.sin(ang) * 27 + Math.cos(ang) * s * 3, 0, 8, 2.5, 1, c, 0.6, 0, rz + s * 0.4);
        sG('cone', p.x - Math.cos(ang) * 60, p.y - Math.sin(ang) * 60, z, p.x, p.y, z, 5, c, 0.6); break;
      case 'water': {                                                     // Kraken: a pressurised water blob + spray
        const cx = p.x - Math.cos(ang) * 6, cy = p.y - Math.sin(ang) * 6;
        bA('sph', cx, cy, z, p.r * 1.8, p.r, p.r, C('#5fd8ff'), 0.7, 0, rz); bF('sph', p.x, p.y, z + 2, p.r * 0.6, p.r * 0.5, p.r * 0.5, WHITE, 1);
        for (let k = 0; k < 4; k++) { const d = p.r * 2 + k * 7, s = 3 - k * 0.5; bA('sph', p.x - Math.cos(ang) * d - Math.sin(ang) * Math.sin(p.t + k) * 5, p.y - Math.sin(ang) * d + Math.cos(ang) * Math.sin(p.t + k) * 5, (k % 2 ? 6 : -6), s, s, s, C('#cfffff'), 0.7); }
        break; }
      case 'foxorb':                                                      // Vex: foxfire — three dancing flames round a white core
        for (let i = 0; i < 3; i++) { const fl = p.r * (0.9 + 0.3 * Math.sin(p.t * 0.7 + i * 2)), off = (i - 1) * 6; sF('cone', p.x + off, p.y + 6, (i - 1) * 5, p.x + off * 0.6, p.y - fl * 1.1, (i - 1) * 5, fl * 0.5, i === 1 ? WHITE : c, 1); }
        bG('sph', p.x, p.y, 0, p.r * 1.8, p.r * 1.8, p.r * 1.8, c, 0.8); break;
      case 'star':                                                        // Nova: a ground marker, then a blazing star falls from the sky
        if (p.t < p.delay) { const k = p.t / p.delay; ringFloor(p.x, p.ty, p.r * (1.6 - 0.6 * k), p.r * (1.6 - 0.6 * k) * 0.9, c, 0.6 + 0.8 * k); bG('cyl', p.x, p.ty, 0, 3, 900, 3, c, 0.25 * k); }
        else { const s = p.r * 1.1; bL('star', p.x, p.y, 0, s, s, s * 0.8, WHITE, 1, p.t * 0.2, p.t * 0.3); bG('sph', p.x, p.y, 0, s * 2, s * 2, s * 2, c, 0.9);
          sG('cone', p.x, p.y - 170, 0, p.x, p.y, 0, p.r * 0.9, c, 0.7); }
        break;
      case 'tendril': {                                                   // Nyx: a writhing shadow tentacle bursting up from the floor
        const up = p.t < p.delay ? 0 : clamp((p.t - p.delay) / 5, 0, 1) * clamp(p.life / 6, 0, 1), h = p.h * up, b = p.base0;
        if (p.t < p.delay) { const k = p.t / p.delay; bA('disc', p.x, b, 0, 26 * k, 1.5, 18 * k, C('#1a0010'), 0.7); break; }
        let px = p.x, py = b;
        for (let k = 1; k <= 8; k++) { const u = k / 8, x = p.x + Math.sin(p.t * 0.4 + u * 5) * 9 * u, y = b - h * u, r = 16 * (1 - u * 0.85);
          sL('cone', px, py, 0, x, y, 0, r + 3, mix3(C('#0a0008'), c, u * u), u > 0.75 ? 0.6 : 0); px = x; py = y; }
        bG('sph', px, py, 0, 8, 8, 8, c, 0.9); break; }
      case 'disk': {                                                      // Pulse: a spinning vinyl record with a neon label + sound ripples
        const sp = p.t * 0.45, bk = -sign(p.vx) || -1;
        bL('disc', p.x, p.y, 0, p.r * 1.25, 1.6, p.r * 1.25, C('#16171f'), 0, sp, 0, Math.PI / 2 - 0.5);
        bF('disc', p.x, p.y, 0.5, p.r * 0.42, 2.2, p.r * 0.42, c, 1, sp, 0, Math.PI / 2 - 0.5);
        for (let k = 1; k <= 2; k++) ringG(p.x + bk * k * 12, p.y, 0, p.r + k * 5, 2, c, 0.6 / k, 0, 0);
        break; }
      case 'magma': {                                                     // Magma: a molten glob — white-hot core, dark crust plates
        bF('sph', p.x, p.y, 0, p.r, p.r, p.r, C('#ffb03a'), 1); bF('sph', p.x, p.y, 2, p.r * 0.55, p.r * 0.55, p.r * 0.55, C('#fff6c8'), 1);
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + p.t * 0.05; bL('octa', p.x + Math.cos(a) * p.r * 0.75, p.y + Math.sin(a) * p.r * 0.75, Math.sin(a * 1.7) * p.r * 0.5, p.r * 0.45, p.r * 0.3, p.r * 0.35, C('#3a1208'), 0, a, a); }
        bG('sph', p.x, p.y, 0, p.r * 2.2, p.r * 2.2, p.r * 2.2, C('#ff5a1f'), 0.7); break; }
      case 'acid':                                                        // Venom: a corrosive glob, dripping as it arcs
        bL('sph', p.x - Math.cos(ang) * 2, p.y - Math.sin(ang) * 2, 0, p.r * 1.35, p.r * 0.9, p.r * 0.9, C('#c6ff2e'), 0.5, 0, rz);
        for (let k = 1; k <= 3; k++) { const d = p.r * 1.2 + k * 6, s = 3 - k * 0.6; bL('sph', p.x - Math.cos(ang) * d, p.y - Math.sin(ang) * d + Math.sin(p.t * 0.4 + k) * 3, 0, s, s, s, C('#c6ff2e'), 0.5); }
        bG('sph', p.x, p.y, 0, p.r * 2, p.r * 2, p.r * 2, c, 0.4); break;
      case 'slime': {                                                     // Venom: a bubbling puddle of toxic slime
        const k = clamp(p.life / 20, 0, 1) * clamp(p.t / 6, 0, 1); if (k <= 0) break;
        bL('sph', p.x, p.y + 4, 0, p.r * 1.4 * k, 4, p.r * 1.1 * k, C('#8adf1a'), 0.4);
        const b = (p.t * 0.05 + p.x * 0.01) % 1; bL('sph', p.x + Math.sin(p.x) * 6, p.y - 1 - b * 8, 4, 2.4 * (1 - b) + 0.6, 2.4 * (1 - b) + 0.6, 2.4 * (1 - b) + 0.6, C('#e4ff7a'), 0.6);
        bG('sph', p.x, p.y + 2, 0, p.r * 1.6, 8, p.r * 1.3, C('#c6ff2e'), 0.3 * k); break; }
      case 'bolt':                                                        // Prism / Apex-X: a refracted bolt with a rainbow fringe
        [[1, 0.31, 0.47], [0.31, 1, 0.63], [0.35, 0.55, 1]].forEach((col, i) => sG('tube', p.x - Math.cos(ang) * 34 - Math.sin(ang) * (i - 1) * 2.4, p.y - Math.sin(ang) * 34 + Math.cos(ang) * (i - 1) * 2.4, (i - 1) * 2, p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4, (i - 1) * 2, 1.4, col, 1));
        bF('sph', p.x + Math.cos(ang) * 2, p.y + Math.sin(ang) * 2, 0, 9, 3.2, 3.2, WHITE, 1, 0, rz); bG('sph', p.x, p.y, 0, 14, 8, 8, c, 0.7, 0, rz); break;
      case 'packet': {                                                    // Byte: a tumbling cube of corrupted data
        const s = p.r * 1.3, a = p.t * 0.25;
        bL('box', p.x, p.y, 0, s, s, s, c, 0.55, a * 0.7, a, a * 0.4);
        bF('box', p.x - s * 0.18, p.y - s * 0.18, s * 0.5 + 0.5, s / 3, s / 3, 1, BLACK, 0, 0, a); bF('box', p.x + s * 0.2, p.y + s * 0.2, s * 0.5 + 0.5, s / 3 - 2, s / 3 - 2, 1, BLACK, 0, 0, a);
        bG('box', p.x - s / 2 - 3 + (p.t % 3) + s / 2, p.y, 0, s + 6, 2, s * 0.8, C('#2ef0ff'), 0.8); break; }
      case 'shuriken': bL('star4', p.x, p.y, 0, p.r + 3, p.r + 3, (p.r + 3) * 0.6, C('#d8dce8'), 0.1, 0, -p.t * 0.6, 0.35); bL('cyl', p.x, p.y, 0, 2.4, 3, 2.4, C('#1a1a2a'), 0, 0, 0, Math.PI / 2); break;
      case 'shard':                                                       // Rime: a jagged shard of glowing ice
        bL('octa', p.x, p.y, 0, 14, 5, 5, C('#dff8ff'), 0.35, 0, rz, p.t * 0.3); bG('octa', p.x - Math.cos(ang) * 6, p.y - Math.sin(ang) * 6, 0, 20, 7, 7, C('#bfeaff'), 0.6, 0, rz); break;
      case 'frost': {                                                     // Rime: a frost rune of ice on the floor (lies flat on the platform)
        const k = Math.min(1, p.life / 30) * Math.min(1, p.t / 8), R = p.r * 1.6, y = p.y + 4;
        ringFloor(p.x, y, R, R, C('#d6fbff'), 1.2 * k);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + p.t * 0.02; bG('box', p.x + Math.cos(a) * R * 0.47, y, Math.sin(a) * R * 0.47, R * 0.94, 1.5, 1.5, C('#d6fbff'), 0.9 * k, -a); }
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + p.t * 0.03; bL('octa', p.x + Math.cos(a) * R * 0.7, y - 4, Math.sin(a) * R * 0.7, 3, 8, 3, C('#e8fbff'), 0.4 * k, a); }
        break; }
      case 'feather':                                                     // Strix: a razor feather-dart
        bL('sph', p.x, p.y, 0, 12, 3.6, 1.2, C('#e8dcc0'), 0, 0, rz); sL('tube', p.x - Math.cos(ang) * 14, p.y - Math.sin(ang) * 14, 0, p.x + Math.cos(ang) * 10, p.y + Math.sin(ang) * 10, 0, 0.7, C('#6a5040'), 0);
        bF('box', p.x - Math.cos(ang) * 14, p.y - Math.sin(ang) * 14, 0, 4, 3, 2, c, 1, 0, rz); break;
      case 'flask': {                                                     // Nox: a spinning glass flask of green plague
        const a = p.t * 0.3, ca = Math.cos(a), sa = Math.sin(a);
        bA('sph', p.x, p.y + 2, 0, p.r, p.r, p.r, C('#c8ff78'), 0.8); bF('sph', p.x, p.y + 2, 0, p.r * 0.6, p.r * 0.6, p.r * 0.6, C('#9dff2e'), 1);
        sA('cyl', p.x + sa * (p.r - 2), p.y + 2 - ca * (p.r - 2), 0, p.x + sa * (p.r + 6), p.y + 2 - ca * (p.r + 6), 0, 3, C('#dcf0ff'), 0.6);
        sL('cyl', p.x + sa * (p.r + 6), p.y + 2 - ca * (p.r + 6), 0, p.x + sa * (p.r + 10), p.y + 2 - ca * (p.r + 10), 0, 3.5, C('#6a4a2a'), 0); break; }
      case 'mist': {                                                      // Nox: a roiling plague cloud with a little 3D skull in it
        const k = Math.min(1, p.life / 40) * Math.min(1, p.t / 12);
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + p.t * 0.01, d = p.r * 0.45, r = p.r * (0.5 + 0.12 * Math.sin(p.t * 0.05 + i));
          bA('sph', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.5, Math.sin(a) * d * 0.6, r, r * 0.8, r, C('#9ad83c'), 0.35 * k); }
        const sy = p.y + Math.sin(p.t * 0.08) * 4; bA('sph', p.x, sy, 10, 8, 7.5, 7, C('#e6ffaa'), 0.8 * k); bA('box', p.x, sy + 7, 10, 7, 4, 5, C('#e6ffaa'), 0.8 * k);
        for (const s of [-1, 1]) bA('sph', p.x + s * 3, sy, 16, 2.2, 2.6, 1, C('#1a2a08'), 0.9 * k);
        break; }
      case 'ink': {                                                       // Fable: a wobbling blob of living ink with a little face
        const w = 1 + 0.12 * Math.sin(p.t * 0.6);
        bL('sph', p.x, p.y, 0, p.r * w, p.r / w, p.r * 0.9, C('#14143a'), 0);
        for (const s of [-1, 1]) bF('sph', p.x + s * 4 + sign(p.vx) * 2, p.y - 2, p.r * 0.85, 2.2, 2.6, 1.2, WHITE, 1);
        for (let k = 1; k <= 3; k++) { const s = 3 - k * 0.7; bL('sph', p.x - sign(p.vx) * (p.r + k * 6), p.y + Math.sin(p.t + k) * 3, 0, s, s, s, C('#14143a'), 0); }
        break; }
      case 'boulder': bL('octa', p.x, p.y, 0, p.r * 1.05, p.r * 0.95, p.r, C('#8a8a80'), 0, p.t * 0.05, -p.t * 0.12 * (sign(p.vx) || 1), 0.4);
        bL('octa', p.x + 3, p.y - 3, 4, p.r * 0.7, p.r * 0.8, p.r * 0.75, C('#a8a89c'), 0, 0.8 + p.t * 0.05, -p.t * 0.12 * (sign(p.vx) || 1), 1.1); break;
      case 'missile': {                                                   // Mecha: a little rocket — body, nose, fins, exhaust flame
        const cx = Math.cos(ang), sy2 = Math.sin(ang);
        sL('cyl', p.x - cx * 10, p.y - sy2 * 10, 0, p.x + cx * 7, p.y + sy2 * 7, 0, 4, C('#e8edf5'), 0);
        sL('cone', p.x + cx * 7, p.y + sy2 * 7, 0, p.x + cx * 14, p.y + sy2 * 14, 0, 4, C('#ff5a5a'), 0.2);
        for (const [dz, s] of [[0, 1], [0, -1]]) bL('box', p.x - cx * 8 - sy2 * s * 5, p.y - sy2 * 8 + cx * s * 5, dz, 6, 2, 6, C('#ff5a5a'), 0, 0, rz);
        bL('box', p.x - cx * 8, p.y - sy2 * 8, 0, 6, 2, 12, C('#ff5a5a'), 0, 0, rz);
        const fl = 10 + Math.random() * 8; sF('cone', p.x - cx * 10, p.y - sy2 * 10, 0, p.x - cx * (10 + fl), p.y - sy2 * (10 + fl), 0, 3.5, C('#ffb84d'), 1);
        bG('sph', p.x - cx * 14, p.y - sy2 * 14, 0, 9, 9, 9, C('#ff9a3d'), 0.6); break; }
      default: {                                                          // Vortex: a volumetric energy orb — lit core + orbiting band
        bF('sph', p.x, p.y, 0, p.r * 0.85, p.r * 0.85, p.r * 0.85, mix3(c, WHITE, 0.5), 1);
        bG('sph', p.x, p.y, 0, p.r * 1.9, p.r * 1.9, p.r * 1.9, c, 1);
        bG('ring', p.x, p.y, 0, p.r * 1.3, 2, p.r * 1.3, WHITE, 0.8, p.t * 0.2, 0.4, Math.PI / 2 - 1.1); break; }
    }
  }
}

/* ============================== hazards ============================== */
function hazards3D() {
  const t = G.time, S = STAGE;
  for (const h of HZ.list) {
    const H = HAZARDS[h.kind], r = hazardRect(h), warn = h.phase === 'warn', k = warn ? h.t / H.warn : 1;
    if (h.kind === 'lava') {
      const Cc = C(hazCol(h)), hot = mix3(Cc, WHITE, 0.55);
      if (warn) { const s = 20 + 22 * k; bF('disc', h.x, S.y + 0.5, 20, s, 1.5, s * 0.6, Cc, 0.6 + 0.4 * k * (0.6 + 0.4 * Math.sin(t * 0.5)));
        for (let i = 0; i < 3; i++) { const u = ((t * 0.04 + i / 3) % 1); bL('sph', h.x + (i - 1) * 12, S.y - u * 10, 20, 4 * (1 - u) + 1, 4 * (1 - u) + 1, 4 * (1 - u) + 1, hot, 1); }
        bG('cyl', h.x, S.y, 0, 34, 280, 30, Cc, 0.12 * k); }
      else { const u = clamp(h.t / 8, 0, 1), fade = clamp((H.dur - h.t) / 10, 0, 1), top = S.y - r.h * u;
        for (let y = S.y, i = 0; y > top; y -= 22, i++) { const w = 26 + Math.sin(y * 0.05 + t * 0.4) * 6, q = (S.y - y) / Math.max(1, r.h);
          bF('sph', h.x + Math.sin(y * 0.03 + t * 0.3) * 4, y - 11, 0, w * fade, 16, w * 0.8 * fade, mix3(mix3(Cc, BLACK, 0.3), hot, q), 1); }
        bF('sph', h.x, top - 6, 0, 30 * fade, 24 * fade, 26 * fade, hot, 1);
        for (let i = 0; i < 6; i++) { const a = t * 0.2 + i, d = ((t * 3 + i * 40) % 120); bL('sph', h.x + Math.cos(a) * 30, top - d * 0.6 + d * d * 0.004, Math.sin(a) * 20, 4, 4, 4, hot, 1); }
        bG('cyl', h.x, S.y, 0, 44 * fade, r.h * u + 20, 40 * fade, Cc, 0.7 * fade); }
    } else if (h.kind === 'lightning') {
      if (warn) { ringFloor(h.x, S.y, 34 - 10 * k, 22 - 6 * k, C('#cfe0ff'), 0.5 + 0.8 * k); if ((t >> 2) & 1) bG('cyl', h.x, S.y, 0, 2.5, r.h, 2.5, C('#cfe0ff'), 0.35 * k); }
      else { const fade = 1 - h.t / H.dur; let x = h.x, y = r.y;
        for (let yy = r.y + 40; yy <= S.y + 1; yy += 40) { const nx = yy >= S.y ? h.x : h.x + hash(yy + h.x + (h.t >> 1)) * 40 - 20, ny = Math.min(yy, S.y);
          sF('tube', x, y, 0, nx, ny, 0, 2.2, WHITE, 1); sG('tube', x, y, 0, nx, ny, 0, 9, C('#9db8ff'), 0.9 * fade); x = nx; y = ny; }
        bG('sph', h.x, S.y, 0, 40, 18, 30, C('#cfe0ff'), 0.9 * fade); }
    } else if (h.kind === 'flare') {
      const cy = r.y + r.h / 2;
      if (warn) { bA('box', (r.x + r.x + r.w) / 2, cy, 0, r.w, r.h, 60, C('#ffd36e'), 0.06 + 0.12 * k);
        for (let x = r.x + ((t * 2 * h.dir) % 30 + 30) % 30; x < r.x + r.w; x += 30) for (const y of [r.y, r.y + r.h]) bG('box', x, y, 30, 14, 1.6, 1.6, C('#ffd36e'), 0.4 + 0.6 * k); }
      else { const fade = clamp((H.dur - h.t) / 8, 0, 1);
        sG('cyl', r.x, cy, 0, r.x + r.w, cy, 0, 24 * fade, C('#ff8a2a'), 0.8); sF('cyl', r.x, cy, 0, r.x + r.w, cy, 0, 7 * fade + 0.5, C('#fff4c8'), 1); }
    } else if (h.kind === 'train') train3D(h, r, warn, k);
    else if (h.kind === 'traffic') traffic3D(h, r, warn, k);
    else {                                                                 // icicle: shaking up top, then falling
      const x = h.x + (warn ? Math.sin(t * 1.3) * 2 : 0);
      if (warn) bA('disc', h.x, S.y + 0.5, 0, 14, 1, 10, BLACK, 0.4 * k);
      bL('cone', x, h.y - 34, 0, 10, 34, 10, C('#dff6ff'), 0.3, t * 0.02, Math.PI); bG('cone', x, h.y - 34, 0, 14, 40, 14, C('#9fe4ff'), 0.35, 0, Math.PI);
    }
  }
}
// Neon Subways: platform lights flash and the tunnel glows… then a modelled 4-car train blasts through
function train3D(h, r, warn, k) {
  const y = STAGE.y, t = G.time, cyan = C('#3df0ff');
  if (warn) { const ex = h.dir > 0 ? BZ.l + 40 : BZ.r - 40, on = (t >> 3) & 1;
    bG('sph', ex, y - 40, -30, 120 + 260 * k, 120 + 160 * k, 80, C('#e8fbff'), 0.35 * k);
    for (let x = STAGE.x + 20; x < STAGE.x + STAGE.w; x += 60) bF('box', x + 11, y - 1.5, MAIN_DEPTH / 2 - 4, 22, 3, 6, C('#ff3c5a'), on ? 1 : 0.25);
    return; }
  const x0 = r.x, d = h.dir, L = r.w, z = 0;
  for (let i = 0; i < 6; i++) sG('tube', d > 0 ? x0 - 260 : x0 + L + 260, y - 10 - i * 10, -20, d > 0 ? x0 : x0 + L, y - 10 - i * 10, -20, 1.4, i % 2 ? cyan : WHITE, 0.6);
  for (let c = 0; c < 4; c++) {
    const cx = x0 + c * (L / 4) + L / 8, w = L / 4 - 8;
    bL('rbox', cx, y - 34, z, w, 58, 70, C('#a8b4c6'), 0);                                         // carriage shell
    bL('rbox', cx, y - 63, z, w - 10, 6, 56, C('#d8e0ec'), 0);                                     // roof
    bF('box', cx, y - 30, z + 35.5, w, 4, 1, cyan, 1);                                             // neon livery stripe
    for (let wdw = 0; wdw < 5; wdw++) bF('box', cx - w / 2 + 14 + wdw * (w - 20) / 4.4, y - 46, z + 35.5, 15, 16, 1, C('#fff0c8'), 0.95);   // lit windows
    for (const wx of [-w * 0.32, w * 0.32]) for (const wz of [-30, 30]) bL('cyl', cx + wx, y - 4, z + wz, 7, 6, 7, C('#20242e'), 0, 0, 0, Math.PI / 2);
  }
  const nose = d > 0 ? x0 + L : x0;
  bL('sph', nose - d * 4, y - 34, z, 18, 28, 34, C('#a8b4c6'), 0);
  bF('sph', nose + d * 8, y - 22, z + 18, 4, 4, 3, WHITE, 1); bF('sph', nose + d * 8, y - 22, z - 18, 4, 4, 3, WHITE, 1);
  sG('cone', nose + d * 250, y - 40, 0, nose + d * 6, y - 24, 0, 40, C('#e6faff'), 0.45);           // headlight beam
}
// Neon Highway: headlights sweep in, then a modelled sports car tears across the deck
function traffic3D(h, r, warn, k) {
  const y = STAGE.y, t = G.time;
  if (warn) { const ex = h.dir > 0 ? STAGE.x : STAGE.x + STAGE.w; bG('sph', ex, y - 20, 20, 90 + 160 * k, 60 + 80 * k, 60, C('#fff6d0'), 0.35 * k);
    for (let x = STAGE.x + ((t * 4 * h.dir) % 34 + 34) % 34; x < STAGE.x + STAGE.w - 20; x += 34) bF('box', x + 10, y - 1, MAIN_DEPTH / 2 - 6, 20, 2, 4, C('#ffd23a'), 0.3 + 0.6 * k);
    return; }
  const cx = r.x + r.w / 2, d = h.dir, ry = d > 0 ? 0 : Math.PI, base = xf(new Float32Array(16), cx, -y, 0, 1, 1, 1, ry), m = new Float32Array(16), L = new Float32Array(16);
  const part = (b, t2, lx, ly, lz, sx, sy, sz, col, e, rzz, rxx) => { xf(L, lx, ly, lz, sx, sy, sz, 0, rzz, rxx); M4.mul(m, base, L); b.add(BAT.T[t2], m, col[0], col[1], col[2], e || 0); };
  const red = C('#e0285a');
  part(BAT.lit, 'rbox', 0, 14, 0, 120, 16, 50, red); part(BAT.lit, 'rbox', -6, 28, 0, 62, 16, 44, mix3(red, WHITE, 0.15));
  part(BAT.alpha, 'rbox', 10, 29, 0, 26, 12, 40, C('#a0dcff'), 0.75);
  for (const wx of [-36, 38]) for (const wz of [-24, 24]) { part(BAT.lit, 'cyl', wx, 9, wz - 5, 9, 10, 9, C('#101018'), 0, 0, Math.PI / 2); part(BAT.lit, 'cyl', wx, 9, wz > 0 ? wz + 5.5 : wz - 5.5, 5, 1, 5, C('#c8ccd8'), 0.1, 0, Math.PI / 2); }
  part(BAT.flat, 'box', 60, 18, 16, 3, 5, 9, C('#fff6d0'), 1); part(BAT.flat, 'box', 60, 18, -16, 3, 5, 9, C('#fff6d0'), 1);
  part(BAT.flat, 'box', -60, 18, 16, 3, 5, 8, C('#ff2f57'), 1); part(BAT.flat, 'box', -60, 18, -16, 3, 5, 8, C('#ff2f57'), 1);
  for (let i = 0; i < 5; i++) sG('tube', cx - d * 60, y - 8 - i * 6, -10, cx - d * (140 + hash(i + t) * 80), y - 8 - i * 6, -10, 1.2, i % 2 ? C('#ff4d6d') : C('#ffe9a0'), 0.6);
  sG('cone', cx + d * 230, y - 20, 0, cx + d * 62, y - 18, 0, 34, C('#fff6d0'), 0.4);
}

/* ============================== fighters: attacks, specials, props ============================== */
function fighterFx3D(f) {
  const c = f.ch, t = G.time, col = C(f.color);
  if (f.state === 'attack' && f.move) attackFx3D(f, col);
  if (SET.limbs === 'floating') {
    if (f.state === 'grab') { const hb = hitboxRect(f, { box: GRAB_BOX }); flyFist(f, hb.x + hb.w / 2, hb.y + hb.h / 2, f.stateT >= 6 ? 1 : f.stateT / 6, col); }
    if (f.state === 'holding' && f.grabbing) flyFist(f, f.grabbing.x, f.grabbing.y - 38, 1, col);
  }
  if (f.state === 'special' && f.sp) specialFx3D(f, col);
  if (c.corrupt && f.state !== 'respawn') {                                    // Byte: the corruption field — a ring of broken pixel cubes
    const R = c.corrupt, alt = C(c.alt);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + t * 0.013; if ((i + (t >> 3)) % 3 === 0) continue; bG('box', f.x + Math.cos(a) * R, f.y - 32 + Math.sin(a) * R, Math.sin(a * 3) * 10, 6, 2, 2, col, 0.35, 0, -a + Math.PI / 2); }
    for (let i = 0; i < 10; i++) { const a = hash(i + (t >> 2)) * TAU, r = R * (0.6 + 0.4 * hash(i * 3 + (t >> 2))); bF('box', f.x + Math.cos(a) * r, f.y - 32 + Math.sin(a) * r, (hash(i * 7) - 0.5) * 30, 4, 4, 4, i % 2 ? col : alt, 1, a, a); }
  }
  if (f.state === 'special' && f.sp && f.sp.type === 'sink' && f.sp.phase === 'under') {   // Umbra, melded into the floor: a gliding shadow pool with two eyes
    bA('disc', f.x, f.y + 0.5, 0, 34 + Math.sin(t * 0.3) * 3, 1.2, 26, C('#0a0018'), 0.9);
    for (const s of [-1, 1]) { bF('sph', f.x + f.facing * 6 + s * 5, f.y - 3, 14, 2.6, 1.3, 1.3, col, 1); bG('sph', f.x + f.facing * 6 + s * 5, f.y - 3, 14, 6, 3, 3, col, 0.6); }
  }
  if (f.state === 'attack' && f.move && f.move.car) car3D(f);
  if (f.rootT > 0) roots3D(f);
  if (f.frozenT > 0) iceBlock3D(f);
  if (f.state === 'shield' && f.stateT < PARRY_WIN) ringG(f.x, f.y - 32, 0, shieldR(f) + 5, 3, WHITE, 1.2 * (1 - f.stateT / PARRY_WIN), 0);   // parry window
  if (f.state === 'stunned') for (let i = 0; i < 3; i++) { const a = G.time * 0.12 + i * 2.1;                                                 // cartoon stun stars circling the head
    bL('star', f.x + Math.cos(a) * 24, f.y - 78 + Math.sin(a) * 4, Math.sin(a) * 16, 5, 5, 3, C('#ffe14d'), 0.8, a * 2); bG('sph', f.x + Math.cos(a) * 24, f.y - 78, Math.sin(a) * 16, 9, 9, 9, C('#ffe14d'), 0.4); }
  if (f.invuln > 30 && f.state === 'free') shell(f.x, f.y - 32, 0, 44, 44, 44, WHITE, 0.25, -2.2);
  rage3D(f, col);
}
// RAGE AURA: at critical damage a fighter is wreathed in red energy — a pulsing fresnel shell + licking flame cones
function rage3D(f, col) {
  if (f.state === 'dead' || f.state === 'respawn' || f.percent < 100) return;
  const k = clamp((f.percent - 100) / 60, 0, 1), t = G.time, pul = 0.75 + 0.25 * Math.sin(t * 0.3 + f.id), red = [1, 0.12, 0.08], g = f.scale || 1;
  shell(f.x, f.y - 34 * g, 0, (34 + 8 * k) * g, (44 + 10 * k) * g, (30 + 6 * k) * g, red, (0.35 + 0.55 * k) * pul, -1.8);
  for (let i = 0; i < 7; i++) { const u = ((t * 0.035 + i / 7 + f.id * 0.13) % 1), a = i / 7 * TAU + f.id, rr = (18 + 6 * Math.sin(i * 2.3)) * g;
    const x = f.x + Math.cos(a) * rr, z = Math.sin(a) * rr, y = f.y - 4 - u * (60 + 30 * k) * g, s = (1 - u) * (5 + 4 * k) * g;
    sG('cone', x, y + s * 1.5, z, x + Math.sin(t * 0.1 + i) * 3, y - s * 2.5, z, s, i % 2 ? red : [1, 0.45, 0.1], (1 - u) * (0.5 + 0.5 * k)); }
  if (k > 0.5 && (t >> 2) % 5 === 0) bG('sph', f.x, f.y - 34 * g, 0, 50 * g, 60 * g, 40 * g, red, 0.15 * k);
}
function flyFist(f, tx, ty, ext, col) {
  const sx = f.x, sy = f.y - 34, ex = lerp(sx, tx, ext), ey = lerp(sy, ty, ext), r = f.ch.limb + 4;
  sG('tube', lerp(sx, ex, 0.35), lerp(sy, ey, 0.35), 8, ex, ey, 8, r * 0.6, col, 0.35); bL('sph', ex, ey, 8, r, r, r, C('#e9ecf6'), 0.2); bG('sph', ex, ey, 8, r * 1.8, r * 1.8, r * 1.8, col, 0.5);
}
// a swept 3D slash ribbon: a crescent of flattened tubes arcing round the shoulder, thickest at the leading edge,
// curling toward the camera through the middle of the swing, with a white-hot core at the tip
function slash3D(f, cx, cy, prog, fade, sgn, oy, col) {
  const sx = f.x, sy = f.y - (oy || 36), ang = Math.atan2(cy - sy, cx - sx), r = Math.max(40, Math.hypot(cx - sx, cy - sy) + 10), span = 1.8 * clamp(prog, 0.15, 1);
  const a0 = ang - sgn * 0.9, th = 8 + r * 0.22, N = 12; let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = a0 + sgn * span * u, outer = r + th * 0.35 * u, inner = r - 2 - (th - 2) * u, rad = (outer + inner) / 2, hw = Math.max(0.8, (outer - inner) / 2);
    const x = sx + Math.cos(a) * rad, y = sy + Math.sin(a) * rad, z = Math.sin(u * Math.PI) * 16 + 10;
    if (i) { seg3(px, py, pz, x, y, z); BAT.glow.add(BAT.T.tube, xfSeg(FXM, FXA, FXB, hw, 2 + hw * 0.4), col[0], col[1], col[2], fade * (0.15 + 1.1 * u));
      if (u > 0.45) BAT.glow.add(BAT.T.tube, xfSeg(FXM, FXA, FXB, hw * 0.35, 1.2), 1, 1, 1, fade * (u - 0.45) * 2); }
    px = x; py = y; pz = z;
  }
  bG('sph', px, py, pz, th * 0.5, th * 0.5, th * 0.5, WHITE, 0.5 * fade);
}
function attackFx3D(f, col) {
  const m = f.move, t = f.stateT, active = t >= m.s && t < m.s + m.a;
  const hb = hitboxRect(f, m), cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2, fist = limbOf(m) === 'fist', ext = attackArmExt(f);
  if (f.charging) {                                                          // smash charge: pulsing aura shell + a contracting ring, flickering white at full power
    const q = f.chargeT / SMASH_CHARGE.max, full = f.chargeT >= SMASH_CHARGE.max, pulse = 0.5 + 0.5 * Math.sin(G.time * (0.4 + q * 0.5)), cc = full && (G.time >> 2) & 1 ? WHITE : col;
    shell(f.x, f.y - 34, 0, 40 + 26 * q + 5 * pulse, 46 + 30 * q + 6 * pulse, 34 + 18 * q, cc, 0.3 + 0.5 * q, -1.5);
    ringG(f.x, f.y - 34, 0, 30 + 24 * (1 - pulse), 2 + 2 * q, col, 0.5 + 0.5 * pulse, 0.25, G.time * 0.05);
    for (let i = 0; i < 4; i++) { const a = G.time * 0.15 + i * TAU / 4, rr = 40 * (1 - pulse) + 12; bF('octa', f.x + Math.cos(a) * rr, f.y - 34 + Math.sin(a) * rr, Math.sin(a) * 18, 2.5, 2.5, 2.5, cc, 1, a); }
  }
  if (t < m.s && m.heavy) {                                                  // wind-up telegraph: body bloom + a charging orb at the fist
    const k = t / m.s, ox = lerp(f.x, cx, 0.5), oy = lerp(f.y - 40, cy, 0.5);
    shell(f.x, f.y - 34, 0, 50 + 30 * k, 56 + 34 * k, 40 + 20 * k, col, 0.45 * k, -1.3);
    bF('sph', ox, oy, 14, 3 + 9 * k, 3 + 9 * k, 3 + 9 * k, mix3(col, WHITE, 0.4), 1); bG('sph', ox, oy, 14, 8 + 22 * k, 8 + 22 * k, 8 + 22 * k, col, 0.4 + 0.5 * k);
  }
  if (m.car) return;                                                        // the F1 car is its own hit visual
  if (f.ch.flagSmash && m.heavy) {                                           // Dino Nuggi: a waving 3D checkered flag
    const k = t < m.s ? t / m.s : 1, a = f.facing * (t < m.s ? -1.2 * k : 0.9 - 0.9 * clamp((t - m.s) / 10, 0, 1));
    flag3D(lerp(f.x, cx, 0.75 * (t < m.s ? 0.3 : 1)), lerp(f.y - 34, cy, 0.75 * (t < m.s ? 0.3 : 1)), a, f.facing);
  }
  if (t < m.s) return;
  if (fist && ext > 0.01) { flyFist(f, cx, cy, ext, col); if (m.radial) flyFist(f, 2 * f.x - cx, cy, ext, col); }
  const prog = clamp((t - m.s + 1) / m.a, 0, 1), fade = t >= m.s + m.a ? clamp(1 - (t - m.s - m.a + 1) / 3, 0, 1) : 1;
  const sgn = m.back ? -f.facing : f.facing, oy = fist ? 36 : 20;
  if (fade > 0) { slash3D(f, cx, cy, prog, fade, sgn, oy, col); if (m.radial) slash3D(f, 2 * f.x - cx, cy, prog, fade, -sgn, oy, col); }
  if (active) bG('sph', cx, cy, 6, hb.w * 0.55, hb.h * 0.55, 20, col, m.dmg > 10 ? 0.4 : 0.25);   // the impact zone glows while it can hit
}
// Dino Nuggi's checkered flag: a pole + a 5×4 grid of cloth cells rippling in 3D
function flag3D(x, y, ang, face) {
  const t = G.time, ca = Math.cos(ang), sa = Math.sin(ang), P = (lx, ly) => [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
  const top = P(0, -42); sL('tube', x, y, 12, top[0], top[1], 12, 1.4, C('#e8e8f0'), 0.1); bL('sph', top[0], top[1], 12, 2.4, 2.4, 2.4, C('#ffd23a'), 0.3);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const q = P(face * (i * 5 + 2.5), -40 + j * 5 + 2.5), wv = Math.sin(t * 0.5 + i * 0.9) * 3;
    bL('box', q[0], q[1], 12 + wv, 5.2, 5.2, 1.2, (i + j) % 2 ? C('#0a0a14') : WHITE, 0.05, Math.cos(t * 0.5 + i * 0.9) * 0.5, -ang); }
}
function specialFx3D(f, col) {
  const sp = f.sp, t = G.time, D = f.ch.special, st = f.stateT;
  switch (sp.type) {
    case 'burst': if (st > sp.wind) shell(f.x, f.y - 32, 0, 42, 54, 36, col, 0.8, -1.2); break;
    case 'orb': case 'shoot': {
      if (sp.type === 'shoot' && sp.kind === 'disk') { if (st < sp.wind + 4) { const hx = f.x + sp.dx * 30, hy = f.y - 40 + sp.dy * 30;          // Pulse: a holographic turntable spins up
        bL('disc', hx, hy, 10, 22, 1.5, 22, C('#16171f'), 0, t * 0.5, 0, 1.1); ringG(hx, hy, 10, 22, 2, col, 1, 0.45, t * 0.5); } break; }
      if (sp.type === 'shoot' && sp.kind === 'boulder') { if (st < sp.wind) { const k = Math.min(1, st / (sp.wind * 0.6)), bx = f.x - f.facing * 4, by = f.y - 40 - 70 * k;   // Goliath hauls a boulder overhead
        bL('octa', bx, by, 0, 23, 21, 22, C('#8a8a80'), 0, 0.3, 0.2, 0.5); bL('octa', bx + 4, by - 3, 5, 15, 17, 16, C('#a8a89c'), 0, 1.1, 0.4, 1.2); } break; }
      if (st < sp.wind) { const k = st / sp.wind, hx = f.x + sp.dx * 28, hy = f.y - 38 + sp.dy * 28;   // a glowing charge gathering at the hand
        bF('sph', hx, hy, 12, 3 + 8 * k, 3 + 8 * k, 3 + 8 * k, WHITE, 1); bG('sph', hx, hy, 12, 8 + 18 * k, 8 + 18 * k, 8 + 18 * k, col, 0.9); }
      break; }
    case 'laser': {                                                        // Lux: a swelling core of light, a sight-line, then the beam itself
      const hx = f.x + sp.dx * 26, hy = f.y - 40 + sp.dy * 26;
      if (st < sp.wind) { const k = st / sp.wind; bF('sph', hx, hy, 10, 4 + 8 * k, 4 + 8 * k, 4 + 8 * k, WHITE, 1); bG('sph', hx, hy, 10, 10 + 30 * k, 10 + 30 * k, 10 + 30 * k, col, 1);
        sG('tube', hx, hy, 10, hx + sp.dx * D.len, hy + sp.dy * D.len, 10, 0.8, col, 0.3 * k); }
      const b = sp.beam;
      if (b && b.t > 0) { const k = b.t / 12; sG('cyl', b.x0, b.y0, 10, b.x1, b.y1, 10, 11 * k + 1, col, 0.6); sG('cyl', b.x0, b.y0, 10, b.x1, b.y1, 10, 4.5 * k + 1, col, 1); sF('cyl', b.x0, b.y0, 10, b.x1, b.y1, 10, 1.6 * k + 0.6, WHITE, 1); }
      break; }
    case 'counter': {                                                      // Paladin: a holy dome in front of the shield
      const live = !sp.countered && st >= sp.wind && st < sp.wind + sp.active, cx = f.x + f.facing * 26, cy = f.y - 36;
      shell(cx, cy, 0, 30, 58, 50, C('#fff1b8'), live ? 0.8 + 0.3 * Math.sin(t * 0.6) : 0.3, -1.4);
      if (live) bG('ring', cx + f.facing * 6, cy, 0, 54, 3, 54, C('#fff1b8'), 0.8, Math.PI / 2, 0, Math.PI / 2);
      break; }
    case 'star': if (st < sp.wind) for (let i = 0; i < 6; i++) { const a = t * 0.2 + i * 1.05, r = 26 + st * 2;                     // Nova: starlight spiralling up
      bL('star', f.x + Math.cos(a) * r * 0.6, f.y - 60 - st * 6 + Math.sin(a) * 8, Math.sin(a) * r * 0.6, 4, 4, 2.5, col, 1, a); } break;
    case 'flurry': if (st >= D.wind) { const k = (st - D.wind) % D.every, hb = hitboxRect(f, sp.m);                                // claw rakes: three curved 3D strokes
      if (k < 4) { const flip = sp.n % 2 ? 1 : -1, cc = sp.n === D.hits ? WHITE : col, a = 1 - k / 4;
        for (let j = 0; j < 3; j++) { const x0 = hb.x + 8, y0 = hb.y + 8 + j * 14 + flip * 6, x2 = hb.x + hb.w - 6, y2 = hb.y + hb.h - 26 + j * 14 - flip * 6, x1 = hb.x + hb.w / 2, y1 = hb.y + hb.h / 2 + j * 6;
          let px = x0, py = y0; for (let s = 1; s <= 6; s++) { const u = s / 6, x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * x1 + u * u * x2, y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * y1 + u * u * y2;
            sG('tube', px, py, 16 + j * 3, x, y, 16 + j * 3, 2.2 * Math.sin(u * Math.PI) + 0.6, cc, a * 1.2); px = x; py = y; } } } }
      break;
    case 'phase': { const end = sp.wind + sp.dur;                         // Nyx: a shadow aura while phasing, then a double slash
      if (st <= end) bA('sph', f.x, f.y - 32, 0, 50, 56, 40, C('#3c0028'), 0.45);
      else if (st <= end + 6) { const u = (st - end) / 6; for (const s of [-1, 1]) { let px = f.x - 44 * s, py = f.y - 74;
        for (let k = 1; k <= 6; k++) { const v = k / 6, x = (1 - v) * (1 - v) * (f.x - 44 * s) + 2 * (1 - v) * v * f.x + v * v * (f.x + 44 * s), y = (1 - v) * (1 - v) * (f.y - 74) + 2 * (1 - v) * v * (f.y - 30) + v * v * (f.y - 4);
          sG('tube', px, py, 14, x, y, 14, 3 * (1 - u) + 0.6, col, 1 - u); px = x; py = y; } } }
      break; }
    case 'glitch': for (let i = 0; i < 6; i++) bF('box', f.x + (hash(i + t) - 0.5) * 70, f.y - 32 + (hash(i * 3 + t) - 0.5) * 80, (hash(i * 5 + t) - 0.5) * 40, 6 + hash(i + 7) * 14, 4, 4, i % 2 ? C('#ff3cc8') : C('#00ff9c'), 1); break;
    case 'tele': if (sp.rift && st <= sp.wind) { const k = st / sp.wind, tx = f.x + sp.dx * sp.dist, ty = f.y - 32 + sp.dy * sp.dist, alt = C(f.ch.alt);   // two void rifts tear open
      for (const [x, y] of [[f.x, f.y - 32], [tx, ty]]) { bA('sph', x, y, 0, 13 * k, 42 * k, 6, C('#0a001e'), 0.9, 0, -0.3); bG('ring', x, y, 0, 13 * k, 2, 42 * k, alt, 1, 0, -0.3, Math.PI / 2); bG('sph', x, y, 0, 24 * k, 50 * k, 12, col, 0.4, 0, -0.3); } }
      break;
    case 'meditate': {                                                     // Zenith: a cosmic barrier sphere with a turning 3D mandala, then the palm blast
      const end = sp.wind + sp.active, cx = f.x, cy = f.y - 36, R = D.r, gold = C('#ffc95a');
      if (st < end) { const k = Math.min(1, st / Math.max(1, sp.wind)), live = st >= sp.wind;
        shell(cx, cy, 0, R, R, R, gold, (live ? 0.8 : 0.4) * k, -2);
        for (const [n, rr, dir, tilt] of [[8, R * 0.62, 1, 0.5], [12, R * 0.82, -1, -0.4]]) { bG('ring', cx, cy, 0, rr, 2, rr, gold, 0.6 * k, t * 0.02 * dir, tilt, Math.PI / 2);
          for (let i = 0; i < n; i++) { const a = i / n * TAU + t * 0.02 * dir; bF('octa', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * Math.cos(tilt), Math.sin(a) * rr * Math.sin(tilt) * 0, 6, 2.5, 2.5, C('#fff1b8'), 0.9 * k, 0, -a); } } }
      else { const u = clamp((st - end) / sp.end, 0, 1), r = D.palm.r * (0.4 + 0.8 * u);
        ringG(cx, cy, 0, r, 6 * (1 - u) + 1, gold, 1 - u, 0.2); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; bF('sph', cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, 10, 12, 7, 3, C('#fff1b8'), 1 - u, 0, -a); } }
      break; }
    case 'hook': {                                                         // Strider: the grappling rope and its three-pronged hook
      const hx0 = f.x + f.facing * 12, hy0 = f.y - 42, hx = sp.phase === 'pull' ? sp.ax : sp.hx, hy = sp.phase === 'pull' ? sp.ay : sp.hy;
      if (hx !== undefined) { const sag = sp.phase === 'pull' ? 0 : 10; let px = hx0, py = hy0;
        for (let k = 1; k <= 8; k++) { const u = k / 8, x = lerp(hx0, hx, u), y = lerp(hy0, hy, u) + Math.sin(u * Math.PI) * sag; sL('tube', px, py, 14, x, y, 14, 0.9, C('#d8c8a0'), 0); px = x; py = y; }
        const a = Math.atan2(hy - hy0, hx - hx0), ca = Math.cos(a), sa = Math.sin(a);
        sL('cyl', hx - ca * 6, hy - sa * 6, 14, hx + ca * 4, hy + sa * 4, 14, 1.6, C('#c8ccd8'), 0.1);
        for (const s of [-1, 0, 1]) sL('cone', hx + ca * 3, hy + sa * 3, 14, hx + ca * 7 - sa * s * 7, hy + sa * 7 + ca * s * 7, 14 + (s === 0 ? 5 : 0), 1.4, C('#c8ccd8'), 0.1); }
      break; }
    case 'temper': { const k = Math.min(1, st / sp.wind), hx = f.x + f.facing * 30, hy = f.y - 18;   // Forge: the forge-core flares at the hammer head
      bF('sph', hx, hy, 14, 6 + 5 * k, 6 + 5 * k, 6 + 5 * k, C('#fff2b0'), 1); bG('sph', hx, hy, 14, 20 + 30 * k, 20 + 30 * k, 20 + 30 * k, C('#ff9a3d'), 0.9);
      for (let i = 0; i < 4; i++) { const a = t * 0.4 + i * 1.6, rr = 14 + (t * 3 + i * 7) % 20; bF('octa', hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 14, 1.6, 1.6, 1.6, C('#ffd23a'), 1); }
      break; }
    case 'warcry': { const k = st / sp.wind, cx = f.x, cy = f.y - 60, gold = C('#ffd36e');                  // Valkyrie: golden shock rings off the raised spear
      if (k < 1) bG('sph', cx, cy, 0, 14 + 18 * k, 14 + 18 * k, 14 + 18 * k, gold, 0.7 * k);
      else { const u = clamp((st - sp.wind) / sp.end, 0, 1); for (let i = 0; i < 3; i++) ringG(cx, cy + 20, 0, 30 + u * D.r * (1 + i * 0.25), 6 - i * 1.5, i ? gold : WHITE, (1 - u) * (1 - i * 0.25) * 1.3, 0.5); }
      break; }
    case 'flare': { const cx = f.x, cy = f.y - 40;                         // Sol: a miniature 3D sun swells overhead, then erupts into a solar flare
      if (st < sp.wind) { const k = st / sp.wind, r = 8 + 26 * k, sy = f.y - 92 + 20 * k * k;
        bF('sph', cx, sy, 0, r, r, r, C('#fff1b8'), 1); bG('sph', cx, sy, 0, r * 2.2, r * 2.2, r * 2.2, col, 1);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.08, l = r * (1.3 + 0.4 * Math.sin(t * 0.5 + i)) * 1.4; sF('cone', cx + Math.cos(a) * r, sy + Math.sin(a) * r, 0, cx + Math.cos(a) * l, sy + Math.sin(a) * l, 0, 2.6, C('#ffd36e'), 1); }
        ringG(cx, cy, 0, D.r, 2, col, 0.35 * k, 0); }
      else { const u = clamp((st - sp.wind) / sp.end, 0, 1), r = D.r * (0.5 + 0.7 * u);
        shell(cx, cy, 0, r, r, r * 0.8, C('#fff1b8'), 1.2 * (1 - u), 0.8);
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; sG('cone', cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, 0, cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, 0, 4, C('#ffd36e'), 1 - u); } }
      break; }
    case 'stomp': if (sp.phase === 'air' && st >= 7) sG('cone', f.x, f.y - 10, 0, f.x, f.y - 100, 0, 22, col, 0.6); break;
  }
}
/* Dino Nuggi's F1 car: a fully modelled 3D vehicle. Pops into existence during the wind-up (springy scale), drives
 * through the active frames with spinning wheels and exhaust glow, then shrinks away in a puff. */
const CARM = { base: new Float32Array(16), loc: new Float32Array(16) };
function car3D(f) {
  const m = f.move, t = f.stateT, d = f.facing, end = m.s + m.a;
  const appear = clamp(t / Math.max(1, m.s - 2), 0, 1), gone = t > end ? clamp(1 - (t - end) / 8, 0, 1) : 1;
  const pop = appear < 1 ? 1 + 2.2 * Math.pow(appear - 1, 3) + 1.2 * Math.pow(appear - 1, 2) : 1, k = pop * gone;
  if (k <= 0.02) return;
  const driving = t >= m.s - 2 && t < end, wheelA = G.time * (driving ? 0.9 : 0.15), col = C(f.color);
  xf(CARM.base, f.x, -f.y, 0, k, k, k, d > 0 ? 0 : Math.PI);
  // pieces as single toon items with real materials (gloss team paint, carbon, chrome, rubber)
  const pc = (mesh, lx, ly, lz, sx, sy, sz, c, mat, ry, rz, rx) => { const it = glItem(GL3D.mesh[mesh]); xf(CARM.loc, lx, ly, lz, sx, sy, sz, ry, rz, rx); M4.mul(it.m, CARM.base, CARM.loc);
    const M = MAT3D[mat] || MAT3D.gloss; it.col = c; it.spec = M.spec; it.shin = M.shin; it.metal = M.metal || 0; it.emis = M.emis || 0; it.outline = 1.1 * k; it.rimK = 0.7; it.aoY = -f.y; it.aoK = 0.3; return it; };
  const carbon = C('#1a1c26'), chrome = C('#e8eaf2'), rubber = C('#15161d');
  pc('rbox', 4, 7, 0, 132, 7, 40, carbon, 'plastic');                                        // floor / chassis
  pc('rbox', -24, 17, 0, 70, 18, 28, col, 'gloss');                                          // engine cover
  for (const s of [-1, 1]) pc('rbox', -12, 13, s * 18, 46, 12, 11, col, 'gloss');            // side pods
  { const it = glItem(GL3D.mesh.cone); xfSeg(CARM.loc, [14, 14, 0], [80, 9, 0], 9, 7); M4.mul(it.m, CARM.base, CARM.loc);   // long tapered nose cone
    it.col = col; it.spec = 1; it.shin = 96; it.metal = 0.12; it.outline = 1.1 * k; it.rimK = 0.7; }
  pc('sphere', -6, 23, 0, 12, 5, 10, BLACK, 'plastic');                                         // cockpit opening
  pc('box', -14, 21, 0, 84, 1.2, 4, WHITE, 'plastic');                                       // sponsor stripe
  for (const s of [-1, 1]) { pc('box', -16, 17, s * 23.6, 3, 10, 0.8, WHITE, 'plastic', 0, 0); pc('box', -14, 21, s * 23.6, 4, 2, 0.8, WHITE, 'plastic', 0, 0.6); }   // race number "1"
  pc('box', -58, 44, 0, 22, 4, 54, col, 'gloss'); for (const s of [-1, 1]) pc('box', -58, 38, s * 27, 26, 18, 2.5, carbon, 'plastic');   // rear wing + end plates
  pc('box', -58, 29, 0, 4, 24, 4, carbon, 'plastic');                                        // wing strut
  pc('box', 72, 4, 0, 26, 3.5, 62, chrome, 'metal'); for (const s of [-1, 1]) pc('box', 72, 8, s * 31, 22, 9, 2, col, 'gloss');   // front wing + end plates
  for (const [hx, hy] of [[-14, 30], [-2, 38], [10, 30]]) pc('sphere', hx, hy, 0, 2.2, 2.2, 2.2, carbon, 'plastic');                 // halo
  { const it = glItem(GL3D.mesh.torus); xf(CARM.loc, -2, 26, 0, 13, 13, 4, 0, 0, Math.PI / 2); M4.mul(it.m, CARM.base, CARM.loc); it.col = carbon; it.spec = 0.6; it.shin = 40; it.outline = 0.8 * k; }
  for (const [wx, r] of [[-40, 14], [44, 12]]) for (const s of [-1, 1]) {                    // four wheels: rubber tyre, coloured rim, spinning chrome spokes
    pc('cylCap', wx, r, s * 26 - 6, r, 12, r, rubber, 'plastic', 0, 0, Math.PI / 2);
    pc('cylCap', wx, r, s > 0 ? 32.2 : -33, r * 0.58, 0.8, r * 0.58, col, 'gloss', 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = -wheelA + i * TAU / 5; pc('box', wx + Math.cos(a) * r * 0.3, r + Math.sin(a) * r * 0.3, s * 26 + s * 7.2, r * 0.6, 1.4, 0.6, chrome, 'metal', 0, a); }
  }
  if (driving) {
    for (const s of [-1, 1]) { const fx = f.x - d * 66 * k, fy = f.y - 14 * k; bG('sph', fx, fy, s * 10 * k, 7, 5, 5, C('#ffb84d'), 0.9); }
    for (let i = 0; i < 5; i++) { const y = f.y - 8 - i * 7, len = 60 + hash(i + (G.time >> 1)) * 50; sG('tube', f.x - d * 62, y, (i - 2) * 9, f.x - d * (62 + len), y, (i - 2) * 9, 1.1, col, 0.5); }
  }
  if (gone < 1) for (let i = 0; i < 4; i++) bA('sph', f.x + (i - 1.5) * 26, f.y - 18, (i % 2) * 14, 14 * (1 - gone) + 6, 12 * (1 - gone) + 5, 14, C('#d0d4e0'), 0.5 * gone + 0.2);
}
// Titanis rooted into the floor: gnarled roots spreading out across the platform top in 3D
function roots3D(f) {
  const k = Math.min(1, (f.ch.special.dur - f.rootT + 1) / 12), t = G.time, bark = C('#6a7a5a');
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3, len = (30 + (i % 3) * 12) * k; let px = f.x, py = f.y - 4, pz = 0;
    for (let s = 1; s <= 4; s++) { const u = s / 4, x = f.x + Math.cos(a) * len * u, z = Math.sin(a) * len * u * 0.8, y = f.y - 4 + u * 4 + Math.sin(u * 3 + i) * 2;
      sL('cone', px, py, pz, x, y, z, (5 - u * 3.5) * (0.6 + 0.4 * k), bark, 0); px = x; py = y; pz = z; } }
  ringFloor(f.x, f.y, 46 * k, 36 * k, C('#7affd8'), 0.6 + 0.3 * Math.sin(t * 0.1));
}
// Rime's ice block: a translucent faceted cube with glowing frosted edges, trembling before it shatters (or Fable's ink bubble)
function iceBlock3D(f) {
  const j = f.frozenT < 8 ? (Math.random() * 3 - 1.5) : 0, x = f.x + j, y = f.y - 38;
  if (f.inkTrap) { const t = G.time; bA('sph', x, y + 2, 0, 38 + Math.sin(t * 0.3) * 2, 46 + Math.cos(t * 0.27) * 2, 36, C('#1a1a48'), 0.72);
    bF('sph', x - 14, y - 22, 30, 7, 3.5, 2, WHITE, 1, 0, 0.6); shell(x, y + 2, 0, 40, 48, 38, C('#3a3aa0'), 0.35, -2); return; }
  bA('rbox', x, y, 0, 60, 80, 56, C('#a8dcff'), 0.42);
  const E = [[0, -40, 28, 60, 2, 2], [0, 40, 28, 60, 2, 2], [-30, 0, 28, 2, 80, 2], [30, 0, 28, 2, 80, 2], [0, -40, -28, 60, 2, 2], [-30, -40, 0, 2, 2, 56], [30, -40, 0, 2, 2, 56]];
  for (const [ex, ey, ez, sx, sy, sz] of E) bG('box', x + ex, y + ey, ez, sx, sy, sz, C('#e8fbff'), 0.7);
  bF('sph', x - 16, y - 26, 29, 7, 3.5, 1, WHITE, 1, 0, 0.6); bL('octa', x + 24, y - 36, 20, 6, 12, 5, C('#dff8ff'), 0.4, 0.4, 0.3);
}
// Mirage's decoys (the real 3D model, as a flickering hologram) and the other per-fighter gadgets
function gadgets3D() {
  for (const f of fighters) {
    const col = C(f.color), t = G.time, d = f.decoy;
    if (d) {
      const gf = Object.assign({}, f, { x: d.x, y: d.y, facing: d.facing, state: 'free', move: null, sp: null, vx: 0, vy: 0, onGround: true,
        invuln: 0, hitFlash: 0, chill: 0, poison: 0, rot: 0, sx: 1, sy: 1, shieldHit: 0, parryFlash: 0, decoy: null, crawl: false, hoverOn: 0, jetT: 0, trail: d.trail || null, rig: d.rig || null, _smoke: null });
      const a = d.life < 60 && (t >> 2) & 1 ? 0.25 : 0.5 + 0.1 * Math.sin(t * 0.2), n0 = GL3D.n;
      collectFighter3D(gf, solveRig(gf)); d.trail = gf.trail; d.rig = gf.rig;
      for (let i = n0; i < GL3D.n; i++) { const it = GL3D.items[i]; if (it.glow) it.glow *= a; else { it.alpha = Math.min(it.alpha, a); it.shadow = false; it.dmg = null; } }
    }
    const so = f.sonic;
    if (so) { const sp = so.S || f.ch.special, fade = so.life / sp.life;
      for (let i = 0; i < 3; i++) { const r = so.r - i * 16; if (r > 4) ringG(so.x, so.y, 0, r, 5 - i * 1.4, so.S ? WHITE : col, fade * (1 - i * 0.3) * 1.2, 0.15 * i, t * 0.03); } }
    const gw = f.gfield;
    if (gw) { const k = Math.min(1, gw.life / 30) * Math.min(1, (gw.max - gw.life + 1) / 10), alt = C(f.ch.alt);
      bA('sph', gw.x, gw.y, 0, gw.r, gw.r, gw.r * 0.8, C('#140a3c'), 0.35 * k); shell(gw.x, gw.y, 0, gw.r, gw.r, gw.r * 0.8, col, 0.7 * k, -2.2);
      for (let i = 0; i < 5; i++) { const x = gw.x + (i - 2) * gw.r * 0.35, y = gw.y - gw.r * 0.5 + ((t * 2 + i * 23) % gw.r);
        for (const s of [-1, 1]) sG('tube', x + s * 7, y - 6, 10, x, y, 10, 1.3, alt, 0.8 * k); } }
    const pr = f.prism;
    if (pr) { const fade = Math.min(1, pr.life / 20), x = pr.x, y = pr.y + Math.sin(t * 0.06) * 4;
      bA('wedge', x, y + 20, 0, 18, 40, 18, C('#e8f4ff'), 0.55 * fade, t * 0.04, Math.PI); bG('wedge', x, y + 20, 0, 14, 40, 14, col, 0.6 * fade, t * 0.04, Math.PI);
      for (const [cc, dx] of [[[1, 0.47, 0.63], -1], [[0.47, 1, 0.75], 0], [[0.47, 0.63, 1], 1]]) sG('cone', x, y, 0, x + 70 + dx * 18, y + 30 + dx * 26, 0, 6, cc, 0.35 * fade);
      bG('sph', x, y, 0, 50 + pr.flash * 3, 50 + pr.flash * 3, 40, col, 0.35 * fade); }
    const cl = f.cloud;
    if (cl) { const S = f.ch.special, fade = Math.min(1, cl.life / 20) * Math.min(1, cl.t / 8), cx = cl.x + cl.w / 2;
      const due = cl.t >= S.warn - 20 && ((cl.t - S.warn) % S.every + S.every) % S.every > S.every - 20;
      for (let i = 0; i < 6; i++) { const px = cl.x + 12 + i * (cl.w - 24) / 5, py = cl.y - 6 - Math.sin(i * 1.7) * 8 + Math.sin(t * 0.05 + i) * 1.5, r = (16 + (i % 3) * 5) * fade;
        bL('sph', px, py, (i % 2 ? 8 : -8), r, r * 0.9, r, C(i % 2 ? '#5a6388' : '#7a83a8'), 0); }
      bL('rbox', cx, cl.y + 2, 0, cl.w * fade, 12, 50, C('#2a2f4a'), 0); bG('box', cx, cl.y - 3.5, 26, (cl.w - 12) * fade, 1.5, 1.5, col, 1);
      if (due || cl.flash > 0) bG('sph', cx, cl.y - 8, 0, cl.w * 0.45, 18, 30, C('#fff078'), cl.flash > 0 ? 0.6 : 0.3 * ((t >> 1) & 1));
      if (cl.flash > 0 && cl.boltBot) { let x = cx, y = cl.y + 8; for (let yy = cl.y + 38; yy < cl.boltBot + 30; yy += 30) { const ny = Math.min(yy, cl.boltBot), nx = yy >= cl.boltBot ? cx : cx + (hash(yy + cl.t) - 0.5) * 30;
        sF('tube', x, y, 0, nx, ny, 0, 2, C('#fff6c0'), 1); sG('tube', x, y, 0, nx, ny, 0, 8, C('#ffe629'), fade * cl.flash / 12); x = nx; y = ny; } } }
    const gu = f.gust;
    if (gu) { const sp = f.ch.special, k = Math.min(1, gu.life / 10) * Math.min(1, (gu.max - gu.life + 1) / 5);
      for (let i = 0; i < 16; i++) { const u = i / 15, y = gu.y - u * sp.h, w = 10 + u * sp.w * 0.62, sway = Math.sin(t * 0.08 + u * 4) * 10 * u;
        bG('ring', gu.x + sway, y, 0, w, 2 + (1 - u) * 2, w * 0.8, i % 3 ? col : WHITE, (0.3 + 0.5 * (1 - u)) * k, t * 0.35 + i, 0.08 * Math.sin(t * 0.1 + i)); }
      for (let i = 0; i < 10; i++) { const u = ((t * 0.02 + i / 10) % 1), a = t * 0.3 + i * 2.1, w = 10 + u * sp.w * 0.62;
        bL('octa', gu.x + Math.cos(a) * w, gu.y - u * sp.h, Math.sin(a) * w * 0.8, 2.5, 2.5, 2.5, C('#dcfffa'), 0.3, a, a); } }
    if (f.ch.special.type === 'rewind' && f.spCD <= 0 && f.hist.length > 30 && f.state !== 'dead' && f.state !== 'respawn') {   // Chrono: an echo of the rewind target
      const p = f.hist[f.hist.length - 1 - Math.min(f.ch.special.back, f.hist.length - 1)]; shell(p.x, p.y - 4 - 32, 0, BODY_W * 0.6, BODY_H * 0.55, BODY_W * 0.45, col, 0.35 + 0.1 * Math.sin(t * 0.15), -1.8); }
    const w = f.wall;
    if (w && w.pillar) { const r = wallRect(w), h = r.h * (w.rise || 0), fade = Math.min(1, w.life / 20); if (h < 1) continue;    // Gaia's rock pillar grinding up out of the floor
      const stone = C(w.flash > 0 ? '#c9b49a' : '#8a7660');
      bL('rbox', w.x, w.y - h / 2, 0, 32, h, 34, stone, 0); bL('pyr', w.x - 4, w.y - h, 4, 14, 10, 14, stone, 0, 0.4); bL('pyr', w.x + 8, w.y - h, -4, 11, 7, 11, stone, 0, 1.1);
      for (let kk = 1; kk < 4; kk++) { const cy = w.y - h * kk / 4; sF('tube', w.x - 12, cy, 17.5, w.x - 2, cy - 6, 17.5, 0.8, C('#3a2a18'), 0); sF('tube', w.x - 2, cy - 6, 17.5, w.x + 8, cy + 3, 17.5, 0.8, C('#3a2a18'), 0); }
      if (h > 20) bL('sph', w.x, w.y - h + 1, 0, 17, 4, 18, C('#6fcf4a'), 0);
      void fade;
    } else if (w) { const r = wallRect(w), kk = clamp(w.life / w.max, 0, 1), fade = Math.min(1, w.life / 20) * Math.min(1, (w.max - w.life + 1) / 6);   // Aegis's energy wall
      bA('rbox', r.x + r.w / 2, r.y + r.h / 2, 0, r.w + 10, r.h, 46, col, (0.3 + (w.flash > 0 ? 0.3 : 0)) * fade);
      sG('cyl', w.x + w.dir * 4, r.y, 0, w.x + w.dir * 4, r.y + r.h, 0, 2.4, w.flash > 0 ? WHITE : col, 1.2 * fade);
      for (let y = r.y + ((t * 1.5) % 14); y < r.y + r.h; y += 14) { sG('tube', r.x - 4, y, 24, r.x + r.w / 2, y - 5, 24, 0.8, col, fade * (0.35 + 0.4 * kk)); sG('tube', r.x + r.w / 2, y - 5, 24, r.x + r.w + 4, y, 24, 0.8, col, fade * (0.35 + 0.4 * kk)); } }
  }
}
// the respawn pad: a 3D hover-disc with a glowing rim and a beam of light
function respawn3D(f) {
  if (f.state !== 'respawn') return;
  const col = C(f.color), fill = C(f.fill || f.color), t = G.time;
  bL('disc', f.x, f.y + 8, 0, 48, 6, 30, mix3(fill, BLACK, 0.2), 0.2); bG('ring', f.x, f.y + 5, 0, 48, 3, 30, col, 1.2);
  bG('ring', f.x, f.y + 4, 0, 30 + Math.sin(t * 0.2) * 4, 2, 19 + Math.sin(t * 0.2) * 2.5, col, 0.7);
  bG('cyl', f.x, f.y + 4, 0, 36, 140, 22, col, 0.25);
}
// the aim reticle: a 3D arrowhead orbiting the player's fighter, pointing where attacks / specials will go
function aim3D(f) {
  if (!f || !SET.aim || f.cpu || f.state === 'dead' || f.state === 'respawn') return;
  const [ax, ay] = humanAim(f), d = Math.hypot(ax, ay); if (d < 1) return;
  const a = Math.atan2(ay, ax), r = 58, dir = aimDir({ aimX: ax, aimY: ay }), col = C(f.color), cx = f.x, cy = f.y - 32, ca = Math.cos(a), sa = Math.sin(a);
  if (dir === 'n') { sG('cone', cx + ca * (r - 4), cy + sa * (r - 4), 20, cx + ca * (r + 12), cy + sa * (r + 12), 20, 6, col, 0.45); return; }
  sF('cone', cx + ca * (r - 4), cy + sa * (r - 4), 20, cx + ca * (r + 12), cy + sa * (r + 12), 20, 6.5, col, 1, 2.5);
  sG('cone', cx + ca * (r - 8), cy + sa * (r - 8), 20, cx + ca * (r + 16), cy + sa * (r + 16), 20, 10, col, 0.5);
}
// blob shadows when the shadow map is off (low-power phones)
function blobShadows3D() {
  for (const f of fighters) { if (f.state === 'dead' || f.state === 'respawn') continue; const d = floorDist(f); if (d > 480) continue;
    const k = 1 - d / 480, R = (f.ch.bw * 0.8 + 10) * (0.45 + 0.55 * k) * (f.scale || 1); bA('disc', f.x, f.y + d + 0.6, 0, R, 0.5, R * 0.7, BLACK, 0.45 * k); }
}
// Training: holographic hit / hurt boxes as glowing 3D volumes (hurtboxes green, attacks red, grabs amber)
function hitboxes3D() {
  if (!((G.training && TRAIN.hitboxes) || SET.hitboxes)) return;
  const vol = (r, c, a) => { bA('box', r.x + r.w / 2, r.y + r.h / 2, 0, r.w, r.h, 40, c, a);
    for (const [x, y, sx, sy] of [[r.x + r.w / 2, r.y, r.w, 1.6], [r.x + r.w / 2, r.y + r.h, r.w, 1.6], [r.x, r.y + r.h / 2, 1.6, r.h], [r.x + r.w, r.y + r.h / 2, 1.6, r.h]]) bG('box', x, y, 20, sx, sy, 1.6, c, 1); };
  for (const f of fighters) { if (f.state === 'dead') continue; vol(bodyRect(f), [0.16, 1, 0.47], 0.16);
    if (f.state === 'shield') ringG(f.x, f.y - 32, 0, shieldR(f), 2, [0.47, 0.78, 1], 1, 0); }
  for (const h of HITBOX_LOG) vol(h, h.kind === 'grab' ? [1, 0.75, 0.16] : [1, 0.16, 0.24], h.kind === 'grab' ? 0.22 : 0.28);
  for (const p of projs) { const r = p.r || p.rad || p.size || 10; bA('sph', p.x, p.y, 0, r, r, r, [1, 0.16, 0.24], 0.25); ringG(p.x, p.y, 0, r, 1.5, [1, 0.24, 0.31], 1, 0); }
}

/* ============================== everything, per frame ============================== */
function collectFX3D() {
  hazards3D();
  gadgets3D();
  for (const f of fighters) { respawn3D(f); if (f.state !== 'dead') fighterFx3D(f); }
  projs3D(); fx3D();
  hitboxes3D(); aim3D(localFighter());
  if (!(GL3D.shadowOK && (SET.res !== 'balanced' || !GL3D.mobile))) blobShadows3D();
}
