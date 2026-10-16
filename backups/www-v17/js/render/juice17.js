/* NEON BRAWL — v17 "the juice": 3D impact bursts + kinetic trails (presentation only; nothing here touches the simulation).
 *
 *   IMPACT BURSTS   every connect explodes at the exact point of impact (the centre of the hitbox ∩ hurtbox overlap): a
 *                   white-hot core flash, two shock rings (one facing the camera, one thrown along the floor plane) and a
 *                   spray of glowing 3D geometry — octahedra, pyramids, cubes, four-point stars and long shards — that
 *                   tumble outward in all three dimensions, slow down, fall and shrink away. More, bigger and hotter with
 *                   knockback; heavies add shards and a second ring. Blocks spit white chips, parries a cyan star, KOs a nova.
 *   KINETIC TRAILS  every fighter, every attack: the striking fist / foot (the limb nearest the move's real hitbox) leaves a
 *                   fading semi-transparent ribbon with a glowing core — fat on smashes, thin on jabs; weapons leave blade
 *                   afterimages (a fan of hilt→tip ghosts) and a bright tip arc. Anything moving fast — dashes, launches,
 *                   Ultimate rushes — leaves a motion streak and two afterimage ghosts of the body. (A Battle Pass trail
 *                   replaces the default fist ribbon for its owner.)                                                       */
'use strict';

/* ---------------- impact bursts ---------------- */
const JUICE = { parts: [], last: 0 };
const SPK_SHAPES = ['octa', 'pyr', 'box', 'star4', 'shard'];
function spawnBurst3D(x, y, kb, col, o) {
  o = o || {}; const P = JUICE.parts, heavy = !!o.heavy, hot = col3('#ffffff'), c = col3(col || '#ffffff'), c2 = mix3(c, [1, 1, 1], 0.45);
  const n = Math.round(clamp((10 + kb * 1.0) * (heavy ? 1.35 : 1) * (o.mul || 1), 8, 46) * clamp(SET.part || 1, 0.4, 1.7));
  if (heavy || kb > 14) P.push({ k: 'ring', x, y, z: 4, r: 26 + kb * 3.4, life: 15, max: 15, col: c, tilt: 1.2, spin: o.dir || 1 });   // (one thin floor-plane shock ring; the flash + facing ring are the impact's own)
  for (let i = 0; i < n; i++) {
    const th = Math.random() * TAU, ph = (Math.random() - 0.5) * 1.6, sp = (3.5 + Math.random() * (5 + kb * 0.38)) * (o.speed || 1);
    const shape = heavy && i % 4 === 0 ? 'shard' : SPK_SHAPES[i % 4], s = (3.4 + Math.random() * 4.6) * (1 + kb / 30) * (o.size || 1), life = 14 + Math.random() * (14 + kb * 0.5);
    P.push({ k: shape, x, y, z: 8, vx: Math.cos(th) * Math.cos(ph) * sp + (o.dir || 0) * sp * 0.35, vy: Math.sin(th) * Math.cos(ph) * sp - 1, vz: Math.sin(ph) * sp * 1.4,
      rx: Math.random() * TAU, ry: Math.random() * TAU, wr: (Math.random() - 0.5) * 0.5, s, life, max: life, col: i % 3 === 0 ? hot : i % 3 === 1 ? c : c2, g: 0.16 + Math.random() * 0.1 });
  }
  if (P.length > 900) P.splice(0, P.length - 900);
}
GAME_EVENT_LISTENERS.push((type, d) => {
  if (!RENDER3D.on) return;
  if (type === 'hit' && d.vic) spawnBurst3D(d.x, d.y, d.kb || 6, d.att && d.att.color || '#ffffff', { heavy: d.m && d.m.heavy, dir: d.dir || 0 });
  else if (type === 'block') spawnBurst3D(d.x, d.y, 4, '#dfefff', { mul: 0.6, size: 0.8 });
  else if (type === 'parry') spawnBurst3D(d.x, d.y, 14, '#7af0ff', { mul: 1.2, heavy: true });
  else if (type === 'ko') spawnBurst3D(d.x, d.y, 26, d.f ? d.f.color : '#ffffff', { heavy: true, mul: 1.4, size: 1.3, speed: 1.3 });
});
function collectJuice3D() {
  const now = performance.now(), fin = typeof finisherState === 'function' ? finisherState(now)[0] : 1;
  const dt = Math.min(3, (now - (JUICE.last || now)) / STEP) * fin; JUICE.last = now;
  const P = JUICE.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt; if (p.life <= 0) { P.splice(i, 1); continue; }
    const k = p.life / p.max, u = 1 - k;
    if (p.k === 'flash') { const r = p.r * (0.55 + u * 0.8); bG('sph', p.x, p.y, p.z, r, r, r, p.col, 1.35 * k * k); continue; }
    if (p.k === 'ring') { ringG(p.x, p.y, p.z, p.r * (0.25 + 0.75 * (1 - k * k)), 1.5 + 2.5 * k, p.col, 0.9 * k, p.tilt, (p.spin || 0) * u); continue; }
    const dr = Math.pow(0.9, dt); p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.vz *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wr * dt; p.ry += p.wr * 0.7 * dt;
    const s = p.s * (0.3 + 0.7 * k), halo = 0.55 * k;                        // a crisp, flat-lit solid + a soft glowing halo of the same shape
    if (p.k === 'shard') { const a = Math.atan2(p.vy, p.vx) + Math.PI / 2; bF('octa', p.x, p.y, p.z, s * 0.42, s * 1.9, s * 0.42, p.col, 1, p.ry, a, p.rx); bG('octa', p.x, p.y, p.z, s * 0.8, s * 2.6, s * 0.8, p.col, halo, p.ry, a, p.rx); }
    else { bF(p.k, p.x, p.y, p.z, s, s, s, p.col, 1, p.ry, p.rx, p.rx * 0.6); bG(p.k, p.x, p.y, p.z, s * 1.7, s * 1.7, s * 1.7, p.col, halo, p.ry, p.rx, p.rx * 0.6); }
  }
}

/* ---------------- kinetic trails ---------------- */
const KT = { A: [0, 0, 0], B: [0, 0, 0] };
const ktSeg = (bat, a, b, r, c, k) => { if (k <= 0.01) return; KT.A[0] = a[0]; KT.A[1] = a[1]; KT.A[2] = a[2]; KT.B[0] = b[0]; KT.B[1] = b[1]; KT.B[2] = b[2];
  bat.add(BAT.T.tube, xfSeg(FXM, KT.A, KT.B, r), c[0], c[1], c[2], Math.min(1, k)); };
// called from fighter3d.js every frame with the fighter's world-space striking limb / weapon / torso (time = the fighter clock)
function kineticRecord(f, limb, tip, hilt, torso) {
  const K = f._k17 || (f._k17 = { fist: [], wpn: [], body: [] }), t = G.time;
  const push = (L, v, lim) => { const q = L[L.length - 1]; if (q && q.t === t) { q.p = v; return; } L.push({ t, p: v }); while (L.length > lim) L.shift(); };
  if (limb) push(K.fist, limb, 12);
  if (tip && hilt) push(K.wpn, [tip, hilt], 10);
  if (torso) push(K.body, torso, 9);
  for (const L of [K.fist, K.wpn, K.body]) while (L.length && t - L[0].t > 14) L.shift();
}
function collectKinetic17() {
  const t = G.time;
  for (const f of fighters) {
    const K = f._k17; if (!K || f.state === 'dead') continue;
    for (const L of [K.fist, K.wpn, K.body]) while (L.length && (t - L[0].t > 14 || t < L[0].t)) L.shift();
    const col = col3(f.color), core = mix3(col, [1, 1, 1], 0.6), heavy = !!(f.move && f.move.heavy), sc = f.scale || 1;
    const custom = typeof trailOn === 'function' && trailOn(f);
    if (!custom && K.fist.length > 1) {
      const n = K.fist.length, r0 = (heavy ? 7 : 4.2) * sc;
      for (let i = 1; i < n; i++) { const a = K.fist[i - 1], b = K.fist[i], k = clamp(1 - (t - b.t) / 12, 0, 1) * (i / n);
        if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) > 140) continue;
        ktSeg(BAT.alpha, a.p, b.p, r0 * (0.35 + 0.65 * i / n), col, 0.42 * k); ktSeg(BAT.glow, a.p, b.p, r0 * 0.28, core, 0.9 * k); }
    }
    if (K.wpn.length > 1) {
      const n = K.wpn.length;
      for (let i = 0; i < n; i++) { const w = K.wpn[i], k = clamp(1 - (t - w.t) / 10, 0, 1) * ((i + 1) / n);
        ktSeg(BAT.alpha, w.p[1], w.p[0], 2.6 * sc, col, 0.26 * k);                                             // a blade afterimage
        if (i) { const p = K.wpn[i - 1]; ktSeg(BAT.glow, p.p[0], w.p[0], 1.8 * sc, core, 1.1 * k); ktSeg(BAT.alpha, p.p[0], w.p[0], 5 * sc, col, 0.35 * k); } }   // the tip arc
    }
    if (K.body.length > 1) {
      const n = K.body.length;
      for (let i = 1; i < n; i++) { const a = K.body[i - 1], b = K.body[i], k = clamp(1 - (t - b.t) / 9, 0, 1) * (i / n);
        if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) > 160) continue;
        ktSeg(BAT.alpha, a.p, b.p, 13 * sc * (0.4 + 0.6 * i / n), col, 0.2 * k); }
      for (const j of [Math.floor(n * 0.25), Math.floor(n * 0.6)]) { const g = K.body[j]; if (!g) continue; const k = clamp(1 - (t - g.t) / 9, 0, 1);   // two afterimage ghosts
        BAT.alpha.add(BAT.T.sph, xf(FXM, g.p[0], g.p[1], g.p[2], 15 * sc, 24 * sc, 12 * sc), col[0], col[1], col[2], 0.16 * k);
        BAT.alpha.add(BAT.T.sph, xf(FXM, g.p[0], g.p[1] + 30 * sc, g.p[2], 11 * sc, 11 * sc, 10 * sc), col[0], col[1], col[2], 0.13 * k); }
    }
  }
}
