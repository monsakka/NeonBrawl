/* NEON BRAWL — v19 models: Dino Nuggi's racing helmet and MOCHI's pug face rebuilt on the head's FACE FRAME, and the
 * Mastery skin ("Ascendant") every fighter earns at max Mastery (ui/mastery19.js).
 *
 * The face frame: every fighter's face looks out of a 3/4 turn toward the camera — eyes3D puts the two eyes at
 * hd(0.62, 0.12, 0.62) and hd(0.12, 0.12, 0.95). F is the levelled direction halfway between them, U is up and L runs
 * across the face. Everything on these two heads is placed in (L, U, F), so the snout, the visor window, the ears and the
 * stripes line up with the eyes from every angle. (The v14/v15 parts were placed in the profile frame — the snout and the
 * visor sat off to the side of the eyes, and flat discs / slabs cut straight through the skull.)
 *
 *   DINO NUGGI   a one-piece F1 shell: a sphere with a rounded visor window cut out of it and a bottom rim that dips at
 *                the nape; a tinted glass visor his eyes show through, with a light streak across it; three livery stripes
 *                swept over the crown; his dorsal spikes as a crest growing out of the shell along the centre stripe; the
 *                visor pivots and chin vents. Smooth meshes only — nothing pokes through the shell.
 *   MOCHI        a short, wide black muzzle with a glossy button nose, the over-nose roll, heavy jowls and a panting tongue,
 *                a black mask that hugs the skull round each eye (surface-aligned, never cutting in), two forehead wrinkles,
 *                velvet rose ears folding forward from the crown and a hachimaki that wraps the skull, knotted at the back.
 *
 * Meshes are built once in a canonical frame (X = across, Y = up, Z = forward, unit radius) and placed with the face
 * frame's axes; the placement basis is forced right-handed in world space so neither facing turns a mesh inside out. */
'use strict';

const dot19 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dir19 = (a, e) => [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];   // canonical: a = across from forward, e = elevation

/* ---------------- geometry (canonical, unit radius) ---------------- */
// wind every triangle so it faces away from its centre (the origin, or ctr(vertex) for tubes), then weld smooth normals
function geoOutward19(g, ctr) {
  const P = g.pos, I = g.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, n = V3.cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
    const o = ctr ? ctr(I[t]) : [0, 0, 0], m = [(P[a] + P[b] + P[c]) / 3 - o[0], (P[a + 1] + P[b + 1] + P[c + 1]) / 3 - o[1], (P[a + 2] + P[b + 2] + P[c + 2]) / 3 - o[2]];
    if (dot19(n, m) < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
  }
  return geoNormals(g);
}
// the visor window's half-height at angle a across: a superellipse (rounded corners, near-vertical sides)
const winH19 = (a, wa, wh) => { const u = Math.abs(a) / wa; return u >= 1 ? 0 : wh * Math.pow(1 - u * u * u * u, 0.25); };
Object.assign(GEO, {
  /* a helmet shell: the unit sphere minus a visor window (half-width wa across, centred at elevation wc, half-height wh) and
   * minus the neck opening (the bottom rim runs from elevation bf at the chin to bb at the nape). Two sheets — the crown
   * (window top → pole) and the jaw (bottom rim → window bottom) — share their seam outside the window, so it welds smooth. */
  helmShell19(wa, wc, wh, bf, bb) {
    const raw = []; for (let i = 0; i <= 168; i++) raw.push(-Math.PI + i / 168 * TAU);
    for (const sg of [-1, 1]) for (const d of [0.002, 0.01, 0.025, 0.05, 0.085, 0.13, 0.2, 0.3]) raw.push(sg * wa * (1 - d));   // (columns crowd the window's sides)
    raw.sort((p, q) => p - q); const C = raw.filter((a, i) => i === 0 || a - raw[i - 1] > 1e-4), nc = C.length;
    const bot = a => bb + (bf - bb) * (1 + Math.cos(a)) / 2, pos = [], idx = [];
    const sheet = (rows, eOf) => { const base = pos.length / 3;
      for (let j = 0; j <= rows; j++) for (const a of C) pos.push(...dir19(a, eOf(a, j / rows)));
      for (let j = 0; j < rows; j++) for (let i = 0; i < nc - 1; i++) { const p = base + j * nc + i, q = p + 1, r = p + nc, s = r + 1; idx.push(p, q, r, q, s, r); } };
    sheet(26, (a, v) => { const e0 = wc + winH19(a, wa, wh); return e0 + (Math.PI / 2 - e0) * v; });
    sheet(14, (a, v) => { const e0 = bot(a); return e0 + (wc - winH19(a, wa, wh) - e0) * v; });
    return geoOutward19({ pos, nor: [], idx });
  },
  // a curved patch of the sphere shaped like that window (the visor glass, its light streak)
  visor19(wa, wc, wh, n = 40, m = 16) {
    return geoOutward19(geoGrid(n, m, (u, v) => { const a = -wa + 2 * wa * (0.5 - 0.5 * Math.cos(u * Math.PI)); return dir19(a, wc + winH19(a, wa, wh) * (2 * v - 1)); }));
  },
  /* a band lying on the sphere: a flattened tube (half-width wl across the path, half-thickness tk out of the surface) swept
   * along path(s) → [point on the unit sphere, unit vector across]; open bands taper to rounded ends */
  band19(n, path, wl, tk, closed) {
    const ring = 10, pos = [], idx = [], ctr = [];
    for (let i = 0; i <= n; i++) { const s = i / n, [c, ac] = path(s), env = closed ? 1 : Math.pow(Math.max(0, Math.min(1, s / 0.07, (1 - s) / 0.07)), 0.5);
      for (let k = 0; k <= ring; k++) { const ph = k / ring * TAU, w = Math.cos(ph) * wl * env, h = 1 + Math.sin(ph) * tk * env;
        pos.push(c[0] * h + ac[0] * w, c[1] * h + ac[1] * w, c[2] * h + ac[2] * w); ctr.push(c); } }
    for (let i = 0; i < n; i++) for (let k = 0; k < ring; k++) { const p = i * (ring + 1) + k, q = p + 1, r = p + ring + 1, s = r + 1; idx.push(p, q, r, q, s, r); }
    return geoOutward19({ pos, nor: [], idx }, v => ctr[v]);
  }
});

/* ---------------- the face frame ---------------- */
const FACE19 = {};
function faceFrame19(face) {
  let q = FACE19[face]; if (q) return q;
  const e1 = V3.norm([face * 0.62, -0.12, 0.62]), e2 = V3.norm([face * 0.12, -0.12, 0.95]), m = V3.norm(V3.add(e1, e2));
  const F = V3.norm([m[0], 0, m[2]]), U = [0, -1, 0], L = V3.norm(V3.cross(U, F));
  const ang = e => [Math.atan2(dot19(e, L), dot19(e, F)), Math.asin(-e[1])];          // an eye's (across, elevation) in the frame
  return (FACE19[face] = { F, U, L, eyes: [ang(e1), ang(e2)] });
}
const fdir19 = (FR, a, e) => { const c = Math.cos(e); return [FR.F[0] * c * Math.cos(a) + FR.L[0] * c * Math.sin(a), FR.F[1] * c * Math.cos(a) + FR.L[1] * c * Math.sin(a) + FR.U[1] * Math.sin(e), FR.F[2] * c * Math.cos(a) + FR.L[2] * c * Math.sin(a)]; };
const loc19 = (FR, v) => [FR.L[0] * v[0] + FR.U[0] * v[1] + FR.F[0] * v[2], FR.L[1] * v[0] + FR.U[1] * v[1] + FR.F[1] * v[2], FR.L[2] * v[0] + FR.U[2] * v[1] + FR.F[2] * v[2]];   // canonical → local
const add19 = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
// the surface frame on the head at frame direction (a, e): [across, up the surface, out] (local unit vectors)
function surf19(FR, a, e) { const N = fdir19(FR, a, e), T1 = V3.norm(V3.cross(FR.U, N)), T2 = V3.cross(N, T1); return [T1, T2, N]; }
// a mesh placed at local point c with local axes ax, ay, az (already scaled): world basis forced right-handed
function f19Item(X, mesh, c, ax, ay, az) {
  const p = X.P(c[0], c[1], c[2]), it = glItem(mesh), B = X.D(ay[0], ay[1], ay[2]), Cz = X.D(az[0], az[1], az[2]); let A = X.D(ax[0], ax[1], ax[2]);
  if (dot19(V3.cross(A, B), Cz) < 0) A = [-A[0], -A[1], -A[2]];
  M4.basis(it.m, p[0], p[1], p[2], A, B, Cz); if (mesh.outline) it.outMesh = mesh.outline;
  return it;
}
// an ellipsoid on frame axes: radii along L, U, F — or along a surface frame [T1, T2, N]
const fEll19 = (X, c, T, r, col, mk, o) => X.dress(f19Item(X, GL3D.mesh.sphere, c, V3.scale(T[0], r[0]), V3.scale(T[1], r[1]), V3.scale(T[2], r[2])), col, mk, o);
// a thin glowing ring (its own item, so turntable previews spin it with the model): centre c, plane spanned by local unit u, v
function ring19(X, c, u, v, r, col, k) {
  const m = sgMesh('h19:ring', () => GEO.torus(72, 8, 0.055)), n = V3.norm(V3.cross(u, v));
  return X.glowIt(f19Item(X, m, c, V3.scale(u, r), V3.scale(n, r), V3.scale(v, r)), col, k, 0.5);
}

/* ================================ DINO NUGGI: the F1 helmet ================================ */
const HELM19 = { wa: 0.72, wc: 0.13, wh: 0.46, bf: -0.8, bb: -1.06, r: 1.17 };
function helmF1v19(X, o) {
  const { R, S, face } = X, FR = faceFrame19(face), H = [S.hx, S.hy - R * 0.04, 0], rs = R * HELM19.r, A = [FR.L, FR.U, FR.F];
  const ax = (k1, k2, k3) => [V3.scale(FR.L, k1), V3.scale(FR.U, k2), V3.scale(FR.F, k3)];
  const shellC = X.C(o.col), stripe = X.C(o.stripe), stripe2 = X.altC, glass = X.C(o.visor), NI = { noInk: true };
  // the shell
  const sh = sgMesh('h19:helm', () => GEO.helmShell19(HELM19.wa, HELM19.wc, HELM19.wh, HELM19.bf, HELM19.bb), true);
  let [a1, a2, a3] = ax(rs, rs * 1.03, rs); X.dress(f19Item(X, sh, H, a1, a2, a3), shellC, 'gloss', { spec: 1.3 });
  // the glass: tinted, see-through (his eyes show), and a soft light streak along its top
  const vm = sgMesh('h19:visor', () => GEO.visor19(HELM19.wa + 0.05, HELM19.wc, HELM19.wh + 0.05));
  [a1, a2, a3] = ax(rs * 1.012, rs * 1.042, rs * 1.012); const v = X.dress(f19Item(X, vm, H, a1, a2, a3), glass, 'gloss', { noInk: true, alpha: 0.4, spec: 1.7, metal: 0.35 }); v.shadow = false;
  const sm = sgMesh('h19:streak', () => GEO.visor19(HELM19.wa * 0.74, HELM19.wc + HELM19.wh * 0.6, 0.05, 24, 4));
  [a1, a2, a3] = ax(rs * 1.02, rs * 1.05, rs * 1.02); X.glowIt(f19Item(X, sm, H, a1, a2, a3), [1, 1, 1], 0.42, 0.6);
  // livery: a broad stripe in his colour over the crown, a thin pinstripe either side in his second colour
  const crown = d => s => { const ps = 0.66 + s * (Math.PI + 0.62 - 0.66), cd = Math.cos(d), sd = Math.sin(d);
    return [V3.norm([sd, Math.sin(ps) * cd, Math.cos(ps) * cd]), V3.norm([cd, -Math.sin(ps) * sd, -Math.cos(ps) * sd])]; };
  [a1, a2, a3] = ax(rs, rs * 1.03, rs);
  X.dress(f19Item(X, sgMesh('h19:stripeC', () => GEO.band19(56, crown(0), 0.12, 0.022, false)), H, a1, a2, a3), stripe, 'gloss', NI);
  for (const d of [-0.2, 0.2]) X.dress(f19Item(X, sgMesh('h19:stripe' + d, () => GEO.band19(56, crown(d), 0.035, 0.02, false)), H, a1, a2, a3), stripe2, 'gloss', NI);
  // the dino crest: four spikes growing out of the shell from the crown down the back of the head (the arc from straight up
  // toward the side he faces away from, so the ridge reads in his silhouette), each swept back along the arc
  if (o.crest !== false) { const Bk = [-face, 0, 0];
    [[0.2, 0.5], [0.62, 0.56], [1.04, 0.47], [1.46, 0.36]].forEach(([b, len]) => {
      const c = V3.norm(add19(V3.scale(FR.U, Math.cos(b) * 1.03), Bk, Math.sin(b))), tg = V3.norm(add19(V3.scale(FR.U, -Math.sin(b)), Bk, Math.cos(b))), base = add19(H, c, rs * 0.96);
      X.cone(base, add19(base, V3.norm(add19(V3.scale(c, 0.78), tg, 0.62)), R * len), R * 0.17, X.C(o.crestCol || 'self'), 'gloss'); }); }
  // the visor pivots on the sides + three chin vents
  for (const sd of [-1, 1]) { const T = surf19(FR, sd * Math.PI / 2, HELM19.wc), c = add19(H, T[2], rs);
    fEll19(X, c, T, [R * 0.15, R * 0.15, R * 0.05], X.C('#2a2e3a'), 'metal');
    fEll19(X, add19(c, T[2], R * 0.04), T, [R * 0.07, R * 0.07, R * 0.03], stripe, 'gloss', NI); }
  for (let k = 0; k < 3; k++) { const T = surf19(FR, 0, -0.44 - k * 0.09); fEll19(X, add19(H, T[2], rs * 1.0), T, [R * (0.13 - k * 0.025), R * 0.022, R * 0.03], X.C('#1a1c24'), 'plastic', NI); }
  void A;
}

/* ================================ MOCHI: the pug ================================ */
const PUG19 = { band: { e0: 0.6, tilt: 0.07, wl: 0.105, tk: 0.035 } };
function pugFace19(X, o) {
  const { R, S, face, f, t, onGround, flash, albC } = X, FR = faceFrame19(face), H = [S.hx, S.hy, 0], mask = X.C(o.mask), NI = { noInk: true };
  const at = (fw, up, ac) => add19(add19(add19(H, FR.F, fw * R), FR.U, up * R), FR.L, (ac || 0) * R);
  const FA = [FR.L, FR.U, FR.F], fold = mix3(albC, mask, 0.42), crease = mix3(albC, mask, 0.7);
  fEll19(X, at(0.78, -0.37), FA, [R * 0.43, R * 0.3, R * 0.33], mask, 'fur');                                  // the short, wide muzzle
  fEll19(X, at(1.05, -0.21), FA, [R * 0.2, R * 0.125, R * 0.1], X.C('#100c0c'), 'gloss', NI);                  // the button nose…
  X.glowSph(...at(1.12, -0.15, 0.06), R * 0.035, [1, 1, 1], 0.9, 0.8);                                         // …and its shine
  fEll19(X, at(0.96, -0.04), FA, [R * 0.29, R * 0.075, R * 0.11], fold, 'fur');                                // the roll over the nose
  for (const sd of [-1, 1]) fEll19(X, at(0.8, -0.55, sd * 0.2), FA, [R * 0.2, R * 0.18, R * 0.2], mask, 'fur'); // heavy jowls
  const pant = f.state === 'free' && onGround && !flash ? Math.abs(Math.sin(t * 0.42)) : f.victory ? 0.8 : 0;
  if (pant > 0.05) fEll19(X, at(0.97, -0.74 - pant * 0.05), FA, [R * 0.095, R * (0.12 + pant * 0.03), R * 0.05], X.C('#ff7a8a'), 'gloss', NI);   // the panting tongue
  for (const [a, e] of FR.eyes) fEll19(X, add19(H, fdir19(FR, a, e), R * 0.92), surf19(FR, a, e), [R * 0.27, R * 0.31, R * 0.09], mask, 'fur', NI);   // the mask, hugging the skull round each eye
  for (const e0 of [0.45, 0.52]) {                                                                                // two forehead wrinkles
    const pts = []; for (let i = 0; i <= 6; i++) { const a = -0.28 + i / 6 * 0.56, e = e0 - 0.06 * (a / 0.28) ** 2; pts.push(X.P(...add19(H, fdir19(FR, a, e), R * 1.01))); }
    const it = chainTube(pts, () => R * 0.03 * X.s, X.O3, X.REF, 3); if (it) X.dress(it, crease, 'fur', NI); }
}
function pugEars19(X, o) {
  const { R, S, face, f, t, onGround } = X, FR = faceFrame19(face), H = [S.hx, S.hy, 0];
  for (const sd of [-1, 1]) {
    const flop = Math.sin(t * 0.09 + sd) * 0.08 + (onGround ? 0 : clamp(-f.vy * 0.02, -0.2, 0.2)), N = surf19(FR, sd * 1.12, 0.98)[2], base = add19(H, N, R * 0.98);
    const lA = V3.scale(V3.norm(add19(add19(V3.scale(FR.L, sd * 0.62), FR.U, -0.7), FR.F, 0.26 + flop)), R * 0.33);   // the flap folds forward, out and down over the corner of the head
    const wA = V3.scale(V3.norm(V3.cross(lA, N)), R * 0.25), tA = V3.scale(V3.norm(V3.cross(lA, wA)), R * 0.085);
    X.dress(f19Item(X, GL3D.mesh.sphere, add19(add19(base, lA, 0.9), N, R * 0.13), wA, lA, tA), X.C(o.col), 'fur');
  }
}
function pugBand19(X, o) {
  const { R, S, face, f, t, onGround } = X, FR = faceFrame19(face), H = [S.hx, S.hy, 0], B = PUG19.band, NI = { noInk: true };
  const bm = sgMesh('h19:band', () => GEO.band19(72, s => { const a = s * TAU - Math.PI, e = B.e0 + B.tilt * Math.cos(a);
    return [dir19(a, e), [-Math.sin(e) * Math.sin(a), Math.cos(e), -Math.sin(e) * Math.cos(a)]]; }, B.wl, B.tk, true), true);
  X.dress(f19Item(X, bm, H, V3.scale(FR.L, R * 1.03), V3.scale(FR.U, R * 1.07), V3.scale(FR.F, R * 1.02)), X.C(o.col), 'cloth');
  const sun = surf19(FR, 0, B.e0 + B.tilt); fEll19(X, add19(H, sun[2], R * 1.075), sun, [R * 0.13, R * 0.13, R * 0.025], X.C(o.sun), 'gloss', { noInk: true, emis: 0.35 });   // the rising sun
  // knotted at the back (the side away from the way MOCHI faces), two tails streaming behind
  const bk = [-face, 0, 0], ak = Math.atan2(dot19(bk, FR.L), dot19(bk, FR.F)), K = surf19(FR, ak, B.e0 + B.tilt * Math.cos(ak)), knot = add19(H, K[2], R * 1.08);
  fEll19(X, knot, K, [R * 0.11, R * 0.09, R * 0.08], X.C(o.col), 'cloth');
  for (const k of [0, 1]) { const sw = Math.sin(t * 0.2 + k) * 2 + (onGround ? 0 : clamp(-f.vy * 0.4, -5, 5)), back = -face;
    const m = [knot[0] + back * 9, knot[1] + 3 + k * 4 + sw, knot[2] - R * 0.2], e2 = [knot[0] + back * 18, knot[1] + R * 0.42 + k * 6 + sw * 1.5, knot[2] - R * 0.3];
    X.seg(knot, m, 1.5, X.C(o.col), 'cloth', NI); X.seg(m, e2, 1.3, X.C(o.col), 'cloth', NI); }
}

/* ================================ the Mastery skin: ASCENDANT ================================ *
 * A dark, glassy body in the fighter's own colour with a hot rim light; glowing circuit veins traced along the limbs and
 * across the chest into a pulsing star sigil; joints that burn like cores; swept energy fins off both shoulders; a crown
 * of crystal shards orbiting above the head; and a turning mastery sigil under the feet with motes rising round the body.
 * Everyone's is in their own colours, and the crown's shard count + fin sweep come from the fighter (skinSeed).        */
function mastery3D19(X) {
  const { P, D, f, c, t, face, back, R, hx, hy, ty, th, tw, lw, zA, zL, s, jointed, fa, ba, fl, fr, S, selfC, onGround } = X;
  const hot = mix3(selfC, [1, 1, 1], 0.3), gold = [1, 0.8, 0.32], h = skinSeed(c.id), n = 5 + (h % 3), sweep = 0.85 + (h % 5) * 0.06;
  const vein = (a, b, z, k) => X.glowIt(glSegment(P(a[0], a[1], z), P(b[0], b[1], z), 0.55 * s, 0.55 * s), hot, k || 0.8, 0.5);
  // crown of crystal shards, orbiting above the head on a thin gold ring
  const bob = Math.sin(t * 0.06) * 1.6, cy = hy - R - 9 + bob, cr = R * 0.9;
  for (let i = 0; i < n; i++) { const a = t * 0.02 + i * TAU / n, p = P(hx + Math.cos(a) * cr, cy + Math.sin(a * 2 + t * 0.05) * 1.2, Math.sin(a) * cr), it = glItem(GL3D.mesh.octa), ca = Math.cos(a * 3), sa = Math.sin(a * 3);
    M4.basis(it.m, p[0], p[1], p[2], D(1.9 * ca, 0, 1.9 * sa), D(0, -(i % 2 ? 4.6 : 6), 0), D(-1.9 * sa, 0, 1.9 * ca)); X.glowIt(it, i % 2 ? gold : hot, 0.95, 0.7); }
  ring19(X, [hx, cy + 2, 0], [1, 0, 0], [0, 0, 1], cr, gold, 0.75);
  // energy fins: three swept blades rising off the upper back, BEHIND the body (they never cross the face)
  for (const zs of [-1, 1]) for (let k = 0; k < 3; k++) {
    const ph = (0.42 + k * 0.3) * sweep + Math.sin(t * 0.07 + k + zs) * 0.04, L = 30 - k * 6, b0 = [back * tw * 0.28, ty - th * 0.3 + k * 3, -tw * 0.42 + zs * 5];
    X.glowIt(glSegment(P(...b0), P(b0[0] + back * Math.cos(ph) * L, b0[1] - Math.sin(ph) * L, b0[2] - 4), 2.2 * s, 0.35 * s, GL3D.mesh.taper), k % 2 ? gold : hot, 0.95, 0.55); }
  // the chest sigil + circuit veins converging on it
  const cz = tw * 0.46 + 2.5, cyS = ty - th * 0.1, pulse = 0.8 + 0.2 * Math.sin(t * 0.12);
  { const p = P(0, cyS, cz), it = glItem(GL3D.mesh.star); M4.basis(it.m, p[0], p[1], p[2], D(5 * pulse, 0, 0), D(0, -5 * pulse, 0), D(0, 0, 1.6)); X.glowIt(it, gold, 1.3, 0.6); }
  for (const sd of [-1, 1]) { vein([sd * tw * 0.36, ty - th * 0.4], [sd * tw * 0.1, cyS - 3], cz - 1); vein([sd * tw * 0.1, cyS + 4], [sd * tw * 0.28, ty + th * 0.36], cz - 1.5, 0.65); }
  // veins along the near-side limbs + a glowing joint at the elbow / knee
  const limbV = (a, b, c2, z) => { vein(a, b, z); vein(b, c2, z); X.glowSph(b[0], b[1], z, lw * 0.42, hot, 0.9, 0.9); };
  if (jointed) { limbV(S.shF, S.elF, fa, zA + lw * 0.85); if (!X.legless) limbV(S.hipF, S.knF, fr, zL + lw * 0.95); }
  if (jointed) for (const [el, p, z] of [[S.elF, fa, zA], [S.elB, ba, -zA]]) { const d = V3.norm([p[0] - el[0], p[1] - el[1], 0]), q = [el[0] + (p[0] - el[0]) * 0.7, el[1] + (p[1] - el[1]) * 0.7, z];
    ring19(X, q, [-d[1], d[0], 0], [0, 0, 1], lw + 2.6, gold, 0.8); }                                            // a gauntlet ring round each forearm
  // the mastery sigil turning under the feet + motes rising round the body
  if (onGround || G.mode === 'menu') { const a = t * 0.015, r = tw * 0.95 + 8;
    ring19(X, [0, 0.5, 0], [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], r, hot, 0.7); ring19(X, [0, 0.4, 0], [1, 0, 0], [0, 0, 1], r * 0.7, gold, 0.45);
    for (let k = 0; k < 6; k++) { const b = a * -2 + k * TAU / 6, q = P(Math.cos(b) * r * 0.85, 0.5, Math.sin(b) * r * 0.85), st = glItem(GL3D.mesh.octa); M4.basis(st.m, q[0], q[1], q[2], D(1.8, 0, 0), D(0, -0.5, 0), D(0, 0, 1.8)); X.glowIt(st, gold, 0.9, 0.6); } }
  for (let k = 0; k < 6; k++) { const u = (t * 0.012 + k / 6) % 1, a = k * 2.4 + t * 0.01, r = tw * 0.8 + 8;
    X.glowSph(Math.cos(a) * r, -u * (th + 60), Math.sin(a) * r, 1.2 + (1 - u) * 1.1, k % 2 ? gold : hot, 0.9 * Math.sin(Math.PI * u), 0.8); }
  void face; void fl; void ba; void zL; void D;
}
