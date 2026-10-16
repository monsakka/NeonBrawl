/* NEON BRAWL — v20 AXO, the Pro Pass fighter: its 3D accents (render/fighter3d.js runs these through the ACC_EXT20 hook on the
 * same local kit as every recipe) + its axolotl tail chain.
 *   axoGills   three feathery external gill stalks a side, curving back from behind the cheeks: a tapering stalk with a row of
 *              frilly fronds that glow at the tips, swaying with the breath and fluttering in the air
 *   axoFace    the wide axolotl grin + two blush spots (it replaces the default mouth: FACE_MOUTH)
 *   axoBelly   a pale belly + throat patch
 *   axoFins    a translucent dorsal fin ridge down the back and a fin skirt along the physics tail
 *   axoSpots   bioluminescent cyan spots along the flanks, shoulders and limbs, pulsing slowly                          */
'use strict';

Object.assign(TRAIL_SPEC, { axotail: { n: 8, seg: 6, w0: 14, w1: 2, grav: 0.1, look: 'tail', anchor: (bw, back) => [back * bw * 0.38, -16] } });
FACE_MOUTH.add('axoFace');

const ACC_EXT20 = {
  axoGills(X, o) {
    const { hx, hy, R, back, t, f, s, onGround, C, P, dress, oval, glowSph, O3, REF } = X, col = C(o.col), tip = C(o.tip), air = !onGround;
    for (const sd of [-1, 1]) for (let g = 0; g < 3; g++) {
      const ang = -0.8 + g * 0.62, sway = Math.sin(t * (air ? 0.3 : 0.08) + g * 1.3 + sd + f.id) * (air ? 0.22 : 0.1), L = (g === 1 ? 19 : 15) * (o.len || 1);
      const b = [hx + back * R * 0.3, hy + Math.sin(ang) * R * 0.5 - R * 0.08, sd * R * 0.8], pts = [], at = [];
      for (let k = 0; k <= 6; k++) {                                       // the stalk: one smooth tube curving back and out, tapering
        const u = k / 6, a = ang + sway * u * 2 - u * 0.3, q = [b[0] + back * Math.cos(a) * L * u, b[1] + Math.sin(a) * L * u * 0.9 - u * u * 2.5, b[2] + sd * u * 6];
        pts.push(P(q[0], q[1], q[2])); at.push([q, a]); }
      const it = chainTube(pts, u => (2.5 - u * 1.7) * s, O3, REF, 3); if (it) dress(it, col, 'slime', { noInk: true, emis: 0.12 });
      for (let k = 1; k < 7; k++) { const [q, a] = at[k], len = 5.2 - k * 0.45;   // feathery filaments sweeping back off both edges of the stalk
        for (const s2 of [-1, 1]) { const fr = oval(q, [q[0] + back * Math.cos(a - s2 * 0.9) * len, q[1] + Math.sin(a - s2 * 0.9) * len, q[2] + sd * 1.2], 1.2, 1.1, tip, 'slime'); fr.emis = 0.45; fr.outline = 0; } }   // (soft rounded fronds)
      const e = at[6][0]; glowSph(e[0], e[1], e[2], 1.5, C(o.glow || o.tip), 1.2 + 0.3 * Math.sin(t * 0.1 + g), 0.8);
    }
  },
  axoFace(X, o) {
    const { hd, R, f, C, ell, seg } = X, hurt = f.state === 'hitstun' || f.state === 'stunned', mc = C(o.mouth || '#3a1028');
    // the grin: a curve across the face from below the near eye to below the far eye, dipping in the middle (an 'o' when hit)
    if (hurt) { const m = hd(0.42, -0.42, 0.8, 1.0); ell(m[0], m[1], m[2], R * 0.16, R * 0.14, R * 0.1, mc, 'gloss', { noInk: true }); }
    else { let prev = null; for (let i = 0; i <= 6; i++) { const u = i / 6, p = hd(0.12 + u * 0.56, -0.3 - Math.sin(u * Math.PI) * 0.16, 0.96 - u * 0.36, 1.01); if (prev) seg(prev, p, 0.8, mc, 'gloss', { noInk: true }); prev = p; } }
    for (const sx of [0.86, 0.05]) { const p = hd(sx, -0.24, sx > 0.4 ? 0.48 : 0.96, 1.0); ell(p[0], p[1], p[2], R * 0.16, R * 0.09, R * 0.06, C(o.blush || '#ff4fa8'), 'silk', { noInk: true, emis: 0.3 }); }
  },
  axoBelly(X, o) {
    const { ty, th, tw, face, C, ell, TB, TZ } = X, b = TB(ty + th * 0.08);
    ell(b.cx + face * tw * 0.12, ty + th * 0.1, TZ(ty + th * 0.1, b.cx + face * tw * 0.12) - 1.4, tw * 0.3, th * 0.38, 2.2, C(o.col), 'slime', { noInk: true });
  },
  axoFins(X, o) {
    const { ty, th, tw, bw, back, t, S, s, latK, W, C, dress, hx, hy, R } = X, col = C(o.col);
    for (let i = 0; i < 5; i++) { const u = i / 4, x = back * (tw * 0.42 + 1) + back * Math.sin(u * Math.PI) * 2, y = hy + R * 0.9 + u * (ty + th * 0.3 - hy - R * 0.9);   // the dorsal ridge down the back
      X.ell(x + back * 3, y, -latK * 0.1, 3.4, 5.5 - u * 1.5, 1.2, col, 'silk', { alpha: 0.7, emis: 0.35, noInk: true }); }
    const tr = S.trails && S.trails[0]; if (!tr || tr.length < 3) return;   // the fin skirt along the physics tail
    const zt = -latK * 0.72 * s, pts = tr.map(q => W(q.x, -q.y, zt));
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = V3.sub(b, a), L = Math.hypot(d[0], d[1], d[2]) || 1, dn = V3.scale(d, 1 / L);
      let up = V3.norm([-dn[1], dn[0], 0]); if (up[1] < 0) up = V3.scale(up, -1);
      const thin = V3.cross(dn, up), u = i / (pts.length - 1), h = (7 - u * 4) * s, sw = Math.sin(t * 0.2 - i) * 0.6;
      for (const sd of [1, -0.6]) { const it = glItem(GL3D.mesh.sphere), c = [(a[0] + b[0]) / 2 + up[0] * h * 0.55 * sd, (a[1] + b[1]) / 2 + up[1] * h * 0.55 * sd + sw, (a[2] + b[2]) / 2];
        M4.basis(it.m, c[0], c[1], c[2], V3.scale(dn, L * 0.65), V3.scale(up, h * Math.abs(sd)), V3.scale(thin, 1.1 * s)); dress(it, col, 'silk', { alpha: 0.62, emis: 0.4, noInk: true }); } }
    void bw;
  },
  axoSpots(X, o) {
    const { ty, th, tw, face, t, f, S, zA, zL, jointed, fa, ba, fr, glowSph, C, TZ } = X, col = C(o.col), k = 0.9 + 0.4 * Math.sin(t * 0.06 + f.id);
    for (const [u, v] of [[-0.3, -0.25], [0.28, -0.1], [-0.22, 0.18], [0.3, 0.3], [0, -0.38]]) { const x = u * tw, y = ty + v * th; glowSph(x, y, TZ(y, x) + 0.5, 1.5, col, k, 0.8); }
    if (jointed) for (const [a, b, z] of [[S.elF, fa, zA], [S.elB, ba, -zA], [S.knF, fr, zL]]) for (const q of [0.35, 0.7]) glowSph(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, z + Math.sign(z) * 3.5, 1.1, col, k, 0.8);
    void face;
  }
};
ACC3D.axo = [['axoBelly', { col: '#ffd6ec' }], ['axoFins', { col: '#ff9ad8' }], ['axoGills', { col: '#ff5fb8', tip: '#ffb0e0', glow: '#ff7ad0' }], ['axoFace', { mouth: '#3a1028', blush: '#ff4fa8' }], ['axoSpots', { col: '#7af0ff' }]];
