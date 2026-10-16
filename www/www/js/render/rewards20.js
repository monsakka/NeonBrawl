/* NEON BRAWL — v20 Pro Pass reward visuals (presentation only). Everything here is real geometry, previewed live in the Pro track:
 *
 *   PRO SKIN PARTS   eight new parametric part families for the 30 Pro skins (data/skins.js PRO_SKINS), on the same kit as the shop
 *                    parts (render/skins3d.js): proWings · proHalo · proBlades · proHelm · proAura · proArmor · proTail · proOrbit,
 *                    plus five Pro body materials (pearl · glass · magma · neon · carbon)
 *   KO EXPLOSIONS    78 = 13 effects × 6 Pro palettes: the 10 Battle Pass effects + three new ones (Spiral Galaxy · Crystal Bloom ·
 *                    Neon Serpent) in six new palettes (Prismatic · Solar · Abyssal · Venom · Blood Moon · Borealis)
 *   NAMEPLATES       100 = 20 new 3D border designs × 5 finishes (Gilded · Prismatic · Obsidian · Frostfire · Infernal)
 *   EMOJIS           40 new holographic emojis (game/emotes.js), each its own animated 3D model inside a gold Pro projector ring */
'use strict';

Object.assign(MAT3D, {
  pearl: { spec: 1.35, shin: 130, metal: 0.22, emis: 0.12, smooth: true }, glass: { spec: 1.7, shin: 190, metal: 0.25, emis: 0.16, alpha: 0.72, smooth: true },
  magma: { spec: 0.55, shin: 30, emis: 0.42 }, neon: { spec: 0.8, shin: 70, emis: 0.55, smooth: true }, carbon: { spec: 0.95, shin: 120, metal: 0.45, smooth: true }
});

/* ============================== Pro skin parts ============================== */
// a torus round local point (lx, ly, lz) with its axis n (y-UP local), radius r; th = tube scale (r = a round tube, smaller = a flat ribbon)
function ring20(X, lx, ly, lz, r, n, th) {
  const N = V3.norm(n), A = Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = V3.norm(V3.cross(A, N)), v = V3.cross(u, N), p = X.P(lx, ly, lz), it = glItem(GL3D.mesh.torus), k = (th === undefined ? 1 : th) * r;
  M4.basis(it.m, p[0], p[1], p[2], X.U(u[0] * r, u[1] * r, u[2] * r), X.U(N[0] * k, N[1] * k, N[2] * k), X.U(v[0] * r, v[1] * r, v[2] * r)); return it;
}
const octAng20 = (dx, dy) => Math.atan2(-dx, -dy);                          // X.oct spin so its long axis points along (dx, dy) (local, y down)
Object.assign(SKIN_PARTS, {
  proWings(o, X) {
    const { ty, th, tw, bw, back, t, f, C, G, onGround, box, glowSph, ell, cone, NI } = X, air = !onGround, x0 = back * tw * 0.18, y0 = ty - th * 0.32, WS = 1.3 * (o.size || 1);   // (WS: the wing scale)
    const flap = air ? Math.sin(t * 0.28 + f.id) * 0.5 + 0.5 : 0.22 + Math.sin(t * 0.05 + f.id) * 0.06;
    for (const sd of [-1, 1]) {
      const z = -bw * 0.55 + sd * bw * 0.3;
      switch (o.k) {
        case 'seraph': for (let tier = 0; tier < 3; tier++) for (let k = 0; k < 5; k++) {           // three tiers of pearl feather-blades tipped in light
            const a = -1.25 + tier * 0.45 - flap * 0.35 + k * 0.13, len = (42 - tier * 8 + k * 2.2) * WS, dx = Math.cos(a) * back, dy = Math.sin(a), yy = y0 + tier * 7;
            box(x0 + dx * len * 0.5, yy + dy * len * 0.5, z - tier * 1.4, len, (5.2 - k * 0.45) * 1.2, 1.8, C(o.col), 'pearl', null, Math.atan2(dy, dx));
            if (k === 4) glowSph(x0 + dx * len, yy + dy * len, z, 1.9, G(o.glow), 1.35, 0.8); }
          break;
        case 'energy': for (let k = 0; k < 5; k++) { const a = -1.15 + k * 0.3 - flap * 0.3, len = (52 - Math.abs(k - 1.5) * 6) * WS, dx = Math.cos(a) * back, dy = Math.sin(a);   // blades of pure light
            X.gseg([x0, y0, z], [x0 + dx * len, y0 + dy * len, z - 2], 3.4 - k * 0.3, G(o.glow), 1.25, 0.5, GL3D.mesh.cone);
            X.gseg([x0, y0, z + 0.5], [x0 + dx * len * 0.78, y0 + dy * len * 0.78, z - 1], 1.1, [1, 1, 1], 1.05, 0.4, GL3D.mesh.cone); }
          glowSph(x0, y0, z, 4, G(o.glow), 0.9, 0.7); break;
        case 'mech': for (let k = 0; k < 3; k++) { const a = -0.95 + k * 0.38 - flap * 0.25, L = (40 - k * 7) * WS, dx = Math.cos(a) * back, dy = Math.sin(a), ang = Math.atan2(dy, dx);   // segmented vanes + glowing edge + thruster
            box(x0 + dx * L * 0.5, y0 + dy * L * 0.5, z, L, 7 - k, 2.6, C(o.col), 'chrome', null, ang);
            X.gseg([x0 + dx * L * 0.15, y0 + dy * L * 0.15 + 3.6, z + 1.4], [x0 + dx * L * 0.95, y0 + dy * L * 0.95 + 3.6, z + 1.4], 0.7, G(o.glow), 1.4, 0.4);
            glowSph(x0 + dx * L, y0 + dy * L, z, 2.2, G(o.glow), 1.3, 0.8);
            if (air && k === 1) X.gseg([x0 + dx * L * 0.6, y0 + dy * L * 0.6 + 4, z], [x0 + dx * L * 0.6 + back * 3, y0 + dy * L * 0.6 + 20, z], 2.4, G(o.glow), 1.2, 0.6, GL3D.mesh.cone); }
          box(x0, y0, z, 8, 10, 6, C(o.col), 'chrome'); break;
        case 'crystal': for (let k = 0; k < 6; k++) { const a = -1.2 + k * 0.24 - flap * 0.3, L = (26 + (k % 3) * 10) * WS, dx = Math.cos(a) * back, dy = Math.sin(a), sp = octAng20(dx, dy);   // faceted ice / crystal shards
            X.oct(x0 + dx * L * 0.55, y0 + dy * L * 0.55, z - k * 0.5, 3.4, L * 0.52, 1.7, C(o.col), 'crystal', { emis: 0.4 }, sp, 0);
            X.oct(x0 + dx * L * 0.55, y0 + dy * L * 0.55, z - k * 0.5, 4.2, L * 0.6, 2.2, G(o.glow), null, null, sp, 0, 0.5); }
          break;
        case 'butterfly': { const sp = 0.55 + 0.45 * (1 - flap), rx = 22 * sp * WS, mat = { alpha: 0.6, emis: 0.5, noInk: true };   // two translucent lobes a side, glowing veins
          ell(x0 + back * (8 + rx), y0 - 12 * WS, z, rx, 15 * WS, 1.2, C(o.col), 'silk', mat); ell(x0 + back * (6 + rx * 0.7), y0 + 9 * WS, z - 0.5, rx * 0.66, 10 * WS, 1.1, C(o.col), 'silk', mat);
          for (const [ex, ey] of [[rx * 1.7, -22], [rx * 1.9, -8], [rx * 1.3, 14]]) X.gseg([x0, y0, z + 1], [x0 + back * ex, y0 + ey, z + 1], 0.55, G(o.glow), 1.2, 0.4);
          glowSph(x0 + back * (8 + rx * 1.3), y0 - 14, z + 1.4, 2.6, G(o.glow), 1.3, 0.8); break; }
        case 'flame': for (let k = 0; k < 6; k++) { const a = -1.1 + k * 0.22 - flap * 0.35, L = ((34 + Math.sin(t * 0.3 + k + sd) * 5) - Math.abs(k - 2.5) * 3) * WS, dx = Math.cos(a) * back, dy = Math.sin(a);   // wings of living flame
            X.gseg([x0, y0, z], [x0 + dx * L, y0 + dy * L, z], 4.2 - k * 0.3, G(k % 2 ? o.col : o.glow), 1.3, 0.5, GL3D.mesh.cone); }
          for (let i = 0; i < 3; i++) { const q = ((t * 0.03 + i / 3 + (sd > 0 ? 0.5 : 0)) % 1); glowSph(x0 + back * (10 + q * 30), y0 - 10 - q * 30, z, 2.2 * (1 - q) + 0.5, G(o.glow), 1.2 * (1 - q), 0.8); }
          break;
        case 'void': { const bones = [-1.05, -0.6, -0.15].map((a0, i) => { const a = a0 - flap * 0.4, L = (40 - i * 7) * WS; return [x0 + Math.cos(a) * back * L, y0 + Math.sin(a) * L * 0.9 - 6, z]; });   // torn void membranes, red-veined
          for (const e of bones) { X.seg([x0, y0, z], e, 1.3, C(o.col), 'obsidian'); X.gseg([x0, y0, z + 0.8], e, 0.6, G(o.glow), 1.4, 0.4); cone(e, [e[0] + back * 4, e[1] + 3, z], 1.2, C(o.col), 'obsidian', NI); }
          for (let i = 0; i < 3; i++) { const a = i ? bones[i - 1] : [x0, y0 + 18, z], b2 = bones[i], m = [(x0 + a[0] + b2[0]) / 3, (y0 + a[1] + b2[1]) / 3, z], L = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
            ell(m[0], m[1], m[2] - 0.5, L * 0.55, Math.hypot(m[0] - x0, m[1] - y0) * 0.85, 1, C(o.col), 'obsidian', { alpha: 0.85, noInk: true }); }
          break; }
      }
    }
  },
  proHalo(o, X) {
    const { hx, hy, R, back, t, f, C, G, glowSph, glowIt, box, cone, NI } = X;
    switch (o.k) {
      case 'gyro': for (let i = 0; i < 3; i++) { const a = t * (0.022 + i * 0.008) + i * 2.1 + f.id;                // three gilded rings turning round the head like an orrery
          X.dress(ring20(X, hx, hy - R * 0.1, 0, R * (1.42 + i * 0.2), [Math.sin(a) * Math.cos(i * 1.3), Math.cos(a), Math.sin(a) * Math.sin(i * 1.3 + 1)], 0.42), C(o.col), 'gold', NI); }
        for (let i = 0; i < 4; i++) { const a = t * 0.05 + i * TAU / 4; glowSph(hx + Math.cos(a) * R * 1.85, hy - R * 0.1 + Math.sin(a * 2) * 3, Math.sin(a) * R * 1.85, 1.6, G(o.col), 1.4, 0.8); }
        break;
      case 'sigil': { const cx = hx + back * 4, cy = hy + R * 0.6, z = -R * 1.2, r1 = R * 2.3;                     // a turning rune circle on the back: two rings, glyphs, a hexagram
        glowIt(ring20(X, cx, cy, z, r1, [0, 0, 1], 0.05), G(o.col), 1.1, 0.5); glowIt(ring20(X, cx, cy, z, r1 * 0.78, [0, 0, 1], 0.05), G(o.col), 0.8, 0.5);
        for (let i = 0; i < 8; i++) { const a = t * 0.02 + i * TAU / 8; box(cx + Math.cos(a) * r1 * 0.89, cy + Math.sin(a) * r1 * 0.89, z, 3.2, 3.2, 1, G(o.col), null, { emis: 1, noInk: true }, a); }
        for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) { const a0 = -t * 0.015 + k * Math.PI / 3 + i * TAU / 3, a1 = a0 + TAU / 3;
          X.gseg([cx + Math.cos(a0) * r1 * 0.76, cy + Math.sin(a0) * r1 * 0.76, z], [cx + Math.cos(a1) * r1 * 0.76, cy + Math.sin(a1) * r1 * 0.76, z], 0.5, G(o.col), 1.1, 0.4); }
        break; }
      case 'rose': { const cx = hx + back * 3, cy = hy - 2, z = -R * 0.9, r1 = R * 1.75;                              // a stained-glass rose window behind the head
        X.disc(cx, cy, z - 1, r1, 1.2, [0.08, 0.06, 0.12], 'gloss', NI);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.004; glowSph(cx + Math.cos(a) * r1 * 0.62, cy + Math.sin(a) * r1 * 0.62, z + 0.6, R * 0.26, G(CATH_GLASS[i % CATH_GLASS.length]), 0.95, 0.6); }
        glowSph(cx, cy, z + 0.8, R * 0.34, G(o.glow), 1.3, 0.6); glowIt(ring20(X, cx, cy, z + 0.5, r1, [0, 0, 1], 0.1), G(o.col), 0.9, 0.5); break; }
      case 'eclipse': { const cx = hx + back * 4, cy = hy - R * 0.2, z = -R * 1.1, r1 = R * 1.55;                     // a black sun ringed in a blazing corona
        X.disc(cx, cy, z, r1, 1.4, [0.01, 0.01, 0.02], 'obsidian', NI); glowIt(ring20(X, cx, cy, z + 0.4, r1 * 1.04, [0, 0, 1], 0.12), G(o.col), 1.5, 0.5);
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + t * 0.01, l = 7 + Math.sin(t * 0.13 + i * 2.3) * 4 + (i % 2) * 5;
          X.gseg([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, z], [cx + Math.cos(a) * (r1 + l), cy + Math.sin(a) * (r1 + l), z], 1.4, G(o.col), 1.2, 0.5, GL3D.mesh.cone); }
        glowSph(cx, cy, z - 1, r1 * 1.5, G(o.col), 0.22, -1.4); break; }
      case 'thorn': for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.006, x = hx + Math.cos(a) * R * 1.05, z = Math.sin(a) * R * 1.05, y = hy - R * 0.7;   // a crown of glowing thorns
          cone([x, y, z], [x + Math.cos(a) * 4, y - 9 - (i % 3) * 3, z + Math.sin(a) * 4], 1.6, C(o.col), 'gloss', NI); glowSph(x + Math.cos(a) * 4, y - 9 - (i % 3) * 3, z + Math.sin(a) * 4, 1.1, G(o.col), 1.5, 0.8); }
        X.dress(ring20(X, hx, hy - R * 0.68, 0, R * 1.06, [0, 1, 0.12], 0.5), [0.16, 0.02, 0.05], 'gloss', NI); break;
    }
  },
  proBlades(o, X) {
    const { ty, th, tw, bw, back, t, f, C, G, glowSph, box, NI } = X, n = o.n || 3, cx = back * 3, cy = ty - th * 0.45, z = -bw * 0.95;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (n > 4 ? 0.34 : 0.46) + Math.sin(t * 0.03 + f.id) * 0.05, bob = Math.sin(t * 0.06 + i * 1.3) * 2, dx = Math.cos(a) * back, dy = Math.sin(a);
      const r0 = 14 + bob, r1 = r0 + (o.k === 'trident' ? 46 : 40), b0 = [cx + dx * r0, cy + dy * r0, z - i * 0.3], b1 = [cx + dx * r1, cy + dy * r1, z - i * 0.3];
      X.cyl([cx + dx * (r0 - 8), cy + dy * (r0 - 8), z], b0, 1.3, C('#2a2236'), 'metal', NI);                         // the grip
      box(b0[0], b0[1], b0[2], 8, 2.2, 2.2, C('#ffcf5a'), 'gold', NI, Math.atan2(dy, dx) + Math.PI / 2);               // the guard
      if (o.k === 'crystal') { X.oct((b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, z, 2.6, (r1 - r0) / 2, 1.2, C(o.col), 'crystal', { emis: 0.45 }, octAng20(dx, dy), 0); X.oct((b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, z, 3.6, (r1 - r0) / 2 + 3, 1.8, G(o.glow), null, null, octAng20(dx, dy), 0, 0.5); }
      else if (o.k === 'trident') { X.cyl(b0, b1, 1, C(o.col), 'metal', NI); for (const k of [-1, 0, 1]) { const px = -dy * back, py = dx * back, tip = [b1[0] + dx * 10 + px * k * 5, b1[1] + dy * 10 + py * k * 5, z];
          X.gseg([b1[0] + px * k * 5, b1[1] + py * k * 5, z], tip, 1.2, G(o.glow), 1.3, 0.5, GL3D.mesh.cone); } }
      else { X.gseg(b0, b1, 2.2, G(o.glow), 1.25, 0.6, GL3D.mesh.cylCap); X.gseg(b0, [b1[0] - dx * 2, b1[1] - dy * 2, z + 0.4], 0.9, [1, 1, 1], 1.3, 0.4, GL3D.mesh.cylCap); }   // an energy blade with a white core
      glowSph(b1[0], b1[1], z, 1.6, G(o.glow), 1.1, 0.8);
    }
  },
  proHelm(o, X) {
    const { hx, hy, R, face, back, t, ell, box, cone, torus, sph, glowSph, C, G, H, NI } = X, col = C(o.col);
    switch (o.k) {
      case 'dragon':                                                                                                 // a horned dragon skull with burning eyes
        ell(hx, hy - R * 0.2, -R * 0.05, R * 1.14, R * 0.86, R * 1.1, col, 'gloss');
        cone(H(0.55, 0.55, 0.62, 1.04), H(1.25, 0.25, 0.4, 1.5), R * 0.42, col, 'gloss');                                // the snout ridge over the brow
        for (const sd of [-1, 1]) { const b = [hx + back * R * 0.2, hy - R * 0.7, sd * R * 0.62], m = [hx + back * (R + 8), hy - R - 8, sd * R * 0.82], e = [hx + back * (R + 22), hy - R + 2, sd * R * 0.9];
          X.seg(b, m, R * 0.18, C('#f4ead8'), 'gloss'); cone(m, e, R * 0.16, C('#f4ead8'), 'gloss'); cone([hx + back * R * 0.6, hy + R * 0.2, sd * R * 0.9], [hx + back * (R + 10), hy + R * 0.32, sd * R], R * 0.12, col, 'gloss', NI); }
        for (const sx of [0.15, 0.6]) { const p = H(sx + 0.05, 0.12, sx > 0.3 ? 0.62 : 0.95, 1.12); glowSph(p[0], p[1], p[2] + 0.5, R * 0.14, G(o.glow), 1.9, 0.6); glowSph(p[0], p[1], p[2], R * 0.3, G(o.glow), 0.45, 1.4); }
        for (let i = 0; i < 4; i++) cone(H(0.1 - i * 0.28, 1.0 - i * 0.05, -0.1, 0.95), H(-0.05 - i * 0.3, 1.4 - i * 0.05, -0.15, 1.1), R * 0.1, C('#f4ead8'), 'gloss', NI);   // a ridge of spines
        break;
      case 'crescent':                                                                                               // a war kabuto crowned by a great golden crescent moon
        ell(hx, hy - R * 0.32, -R * 0.06, R * 1.12, R * 0.74, R * 1.1, col, 'metal');
        for (let k = 0; k < 3; k++) torus(hx - face * R * 0.12, hy - R * (0.0 - k * 0.2), -R * 0.1, R * (1.22 + k * 0.08), col, 0.3, 'metal', null, R * (1 + k * 0.05));
        { const cxm = hx + face * R * 0.3, cym = hy - R * 1.5, czm = R * 0.75, r = R * 1.3;                         // the crescent: a U of gold segments, thickest at the bottom
          for (let i = 0; i < 9; i++) { const a = Math.PI * (0.08 + i / 8 * 0.84), th2 = 1.4 + 3.4 * Math.sin(i / 8 * Math.PI);
            box(cxm + Math.cos(a) * r, cym + Math.sin(a) * r * 0.62, czm, r * 0.36, th2, 1.6, C('#ffcf5a'), 'gold', NI, Math.atan2(Math.cos(a) * 0.62, -Math.sin(a))); }
          glowSph(cxm, cym + r * 0.62, czm + 1, 2.2, G(o.glow), 1.5, 0.8); }
        break;
      case 'knight': {                                                                                               // a winged great helm with a glowing T-visor
        const it = ell(hx, hy - R * 0.1, 0, R * 1.08, R * 1.1, R * 1.06, col, 'metal'); it.metal = 0.85;
        const vp = H(0.42, 0.06, 0.88, 1.04); box(vp[0], vp[1], vp[2], R * 1.15, 2.8, 1, G(o.glow), null, { emis: 1, noInk: true }); const vq = H(0.62, -0.25, 0.7, 1.04); box(vq[0], vq[1], vq[2], 2.4, R * 0.55, 1, G(o.glow), null, { emis: 1, noInk: true });
        glowSph(vp[0], vp[1], vp[2] + 1, R * 0.5, G(o.glow), 0.3, 1.2);
        for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const fl = Math.sin(t * 0.1 + k) * 1.2;                 // swept helm wings: four feathers a side, fanning up and back
          X.seg([hx + back * R * (0.1 + k * 0.12), hy - R * 0.25 - k * 2.5, sd * (R + 0.5)], [hx + back * (R * 0.5 + 8 + k * 5), hy - R - 8 - (3 - k) * 4 + fl, sd * (R + 3 + k * 1.5)], 2.4 - k * 0.35, C(o.crest), 'pearl', NI); }
        cone([hx, hy - R * 1.02, 0], [hx + back * 3, hy - R * 1.6, 0], R * 0.14, C(o.crest), 'gold', NI); break; }
      case 'beast':                                                                                                  // a horned void-demon mask with a mane of spines
        ell(hx + face * R * 0.15, hy, R * 0.25, R * 1.02, R * 1.02, R * 0.9, col, 'obsidian');
        for (const sd of [-1, 1]) { const b = [hx + face * R * 0.15, hy - R * 0.7, sd * R * 0.55], m = [hx + face * R * 0.1 + back * 6, hy - R - 14, sd * (R + 4)], e = [hx + face * R * 0.5, hy - R - 26, sd * (R - 2)];
          X.seg(b, m, R * 0.2, col, 'obsidian'); cone(m, e, R * 0.17, col, 'obsidian'); X.gseg(b, m, R * 0.07, G(o.glow), 1, 0.4); }
        for (const sx of [0.12, 0.6]) { const p = H(sx + 0.05, 0.1, sx > 0.3 ? 0.62 : 0.95, 1.12); glowSph(p[0], p[1], p[2] + 0.5, R * 0.15, G(o.glow), 2, 0.6); glowSph(p[0], p[1], p[2], R * 0.32, G(o.glow), 0.45, 1.4); }
        for (let i = 0; i < 7; i++) { const a = Math.PI * (0.55 + i * 0.11); cone([hx + back * Math.abs(Math.cos(a)) * R * 0.6, hy + Math.sin(a) * R * 0.2 - R * 0.3, -R * 0.4], [hx + back * (R + 10 + (i % 2) * 5), hy - R * 0.5 + i * 4, -R * 0.5], R * 0.14, col, 'obsidian', NI); }
        break;
    }
  },
  proAura(o, X) {
    const { ty, th, tw, t, f, C, G, glowSph, box } = X;
    switch (o.k) {
      case 'flame': for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + f.id, x = Math.cos(a) * tw * 0.8, z = Math.sin(a) * tw * 0.7, y0 = ty + th * 0.85, h = 24 + Math.sin(t * 0.32 + i * 1.7) * 8 + (i % 3) * 6;   // a ring of flames round the feet
          X.gseg([x, y0, z], [x + Math.sin(t * 0.2 + i) * 4, y0 - h, z], 4.2, G(o.col), 0.95, 0.5, GL3D.mesh.cone); }
        for (let i = 0; i < 5; i++) { const q = ((t * 0.02 + i / 5 + f.id * 0.1) % 1); glowSph(Math.sin(i * 2.4) * tw * 0.7, ty + th * 0.7 - q * th * 2.2, Math.cos(i * 1.7) * tw * 0.6, 2.4 * (1 - q) + 0.4, G(o.col), 1.2 * (1 - q), 0.8); }
        break;
      case 'storm': for (let i = 0; i < 4; i++) glowSph(Math.cos(i * 1.6 + t * 0.01) * tw * 1.1, ty - th * 0.9 - (i % 2) * 6, Math.sin(i * 1.6 + t * 0.01) * tw, 8, [0.3, 0.32, 0.45], 0.25, -1.3);   // a crackling storm round the body
        if ((t + f.id * 13) % 24 < 6) for (let b = 0; b < 2; b++) { let px = (b ? 1 : -1) * tw * 0.9, py = ty - th * 0.9, pz = (b ? -1 : 1) * tw * 0.4;
          for (let k = 0; k < 5; k++) { const nx = px + Math.sin(t * 1.7 + k * 3 + b) * 6, ny = py + th * 0.34, nz = pz; X.gseg([px, py, pz], [nx, ny, nz], 0.7, G(o.col), 1.7, 0.3); px = nx; py = ny; pz = nz; } }
        for (let i = 0; i < 6; i++) { const a = t * 0.06 + i * TAU / 6; glowSph(Math.cos(a) * tw * 1.05, ty + Math.sin(a * 2) * th * 0.4, Math.sin(a) * tw, 1.2, G(o.col), 1.4, 0.8); }
        break;
      case 'galaxy': { const tilt = 0.35;                                                                            // a whole galaxy turning round the waist
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 12; i++) { const q = i / 11, a = arm * Math.PI + q * 3.2 + t * 0.03, r = tw * (0.75 + q * 0.7);
          glowSph(Math.cos(a) * r, ty + th * 0.15 + Math.sin(a) * r * tilt * 0.5, Math.sin(a) * r, 1.6 - q * 0.7, G(i % 3 ? o.col : o.alt), 1.3 - q * 0.5, 0.8); }
        glowSph(0, ty + th * 0.15, 0, tw * 1.5, G(o.col), 0.12, -1.4); break; }
      case 'motes': for (let i = 0; i < 12; i++) { const q = ((t * 0.012 + i / 12 + f.id * 0.07) % 1), a = q * TAU * 1.5 + i, r = tw * (0.7 + 0.25 * Math.sin(i));   // motes of light spiralling up
          glowSph(Math.cos(a) * r, ty + th * 0.8 - q * th * 2.4, Math.sin(a) * r, 1.6 * Math.sin(q * Math.PI) + 0.3, G(o.col), 1.4 * Math.sin(q * Math.PI), 0.8); }
        break;
      case 'glitch': for (let i = 0; i < 6; i++) { const on = hash(((t >> 2) * 13) + i * 7 + f.id) > 0.45; if (!on) continue;   // the body tearing into RGB fragments
          const x = (hash(i * 3.1 + (t >> 2)) - 0.5) * tw * 2.2, y = ty + (hash(i * 5.7 + (t >> 2)) - 0.5) * th * 2.2, w = 4 + hash(i + (t >> 3)) * 12;
          box(x, y, tw * 0.6, w, 2.2, 1, G(i % 2 ? o.col : o.alt), null, { emis: 1, noInk: true }); box(x + 3, y + 2.4, tw * 0.6, w * 0.6, 1.4, 1, G(i % 2 ? o.alt : o.col), null, { emis: 1, noInk: true }); }
        break;
    }
  },
  proArmor(o, X) {
    const { ty, th, tw, bw, S, zA, lw, face, t, f, C, G, box, ell, torus, glowSph, NI, jointed } = X, z = tw * 0.46, neck = ty - th / 2;
    switch (o.k) {
      case 'plate': box(0, ty - 2, z - 0.5, tw * 0.86, th * 0.66, 6, C(o.col), 'metal');                              // a breastplate with glowing seams + gorget + pauldrons
        for (const [x0, y0, x1, y1] of [[0, ty - th * 0.3, 0, ty + th * 0.28], [-tw * 0.36, ty - th * 0.05, tw * 0.36, ty - th * 0.05]]) X.gseg([x0, y0, z + 3], [x1, y1, z + 3], 0.7, G(o.glow), 1.3 + 0.3 * Math.sin(t * 0.1 + f.id), 0.4);
        torus(0, neck + 2, 0, tw * 0.36, C(o.col), 0.1, 'metal', NI, tw * 0.3);
        for (const [sp, zz] of [[S.shB, -zA * 0.62], [S.shF, zA * 0.62]]) { ell(sp[0], sp[1] - 4, zz, lw * 1.7 + 3, lw * 1.1 + 2, lw * 1.6 + 3, C(o.col), 'metal'); glowSph(sp[0], sp[1] - 4, zz + Math.sign(zz) * (lw * 1.6 + 3), 1.4, G(o.glow), 1.4, 0.8); }
        break;
      case 'leaded': { const cols = CATH_GLASS, nx = 4, ny = 4, cw = tw * 0.78 / nx, ch = th * 0.78 / ny;              // stained-glass panes over the torso, framed in lead
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) box(-tw * 0.39 + cw * (i + 0.5), ty - th * 0.39 + ch * (j + 0.5), z + 0.6, cw - 1.4, ch - 1.4, 1, G(cols[(i + j * 2) % cols.length]), null, { emis: 0.9 + 0.2 * Math.sin(t * 0.04 + i + j), noInk: true });
        for (let i = 0; i <= nx; i++) box(-tw * 0.39 + cw * i, ty, z + 1.1, 1.1, th * 0.8, 1.2, [0.12, 0.1, 0.16], 'metal', NI);
        for (let j = 0; j <= ny; j++) box(0, ty - th * 0.39 + ch * j, z + 1.1, tw * 0.8, 1.1, 1.2, [0.12, 0.1, 0.16], 'metal', NI);
        glowSph(0, ty, z + 2, tw * 0.5, G(o.glow), 0.2, -1.2); break; }
      case 'circuit': { const tr = [[[-0.35, -0.38], [-0.35, -0.1], [-0.1, 0.05], [-0.1, 0.36]], [[0.32, -0.36], [0.12, -0.2], [0.12, 0.1], [0.34, 0.3]], [[-0.2, -0.42], [0.05, -0.42], [0.05, -0.18]]];   // glowing traces + running pulses
        for (const path of tr) { for (let i = 1; i < path.length; i++) X.gseg([path[i - 1][0] * tw, ty + path[i - 1][1] * th, z + 1], [path[i][0] * tw, ty + path[i][1] * th, z + 1], 0.45, G(o.glow), 1.1, 0.4);
          const q = ((t * 0.02 + path.length * 0.13) % 1) * (path.length - 1), k = Math.floor(q), u = q - k, a = path[k], b = path[Math.min(path.length - 1, k + 1)];
          glowSph((a[0] + (b[0] - a[0]) * u) * tw, ty + (a[1] + (b[1] - a[1]) * u) * th, z + 1.4, 1.5, [1, 1, 1], 1.5, 0.8); for (const p of path) glowSph(p[0] * tw, ty + p[1] * th, z + 1.2, 1, G(o.glow), 1.2, 0.8); }
        if (jointed) for (const [a, b, zz] of [[S.elF, X.fa, zA], [S.knF, X.fr, X.zL]]) X.gseg([a[0], a[1], zz + lw], [b[0], b[1], zz + lw], 0.4, G(o.glow), 1.1, 0.4);
        break; }
      case 'scale': for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) { const x = -tw * 0.33 + i * tw * 0.22 + (r % 2) * tw * 0.11, y = ty - th * 0.3 + r * th * 0.19;   // overlapping bark scales with a glowing core
          ell(x, y, z + 0.4 + r * 0.2, tw * 0.13, th * 0.13, 1.6, C(o.col), 'gloss', NI); }
        glowSph(0, ty - th * 0.05, z + 2.4, 3.4 + Math.sin(t * 0.08) * 0.8, G(o.glow), 1.4, 0.7); break;
    }
    void bw; void face;
  },
  proTail(o, X) {
    const { ty, th, tw, bw, back, t, f, C, G, glowSph, ell, P, NI } = X, b = [back * tw * 0.38, ty + th * 0.36, -bw * 0.3];
    const curve = (u, amp) => [b[0] + back * u * 46, b[1] + u * 12 - Math.sin(u * Math.PI) * 10 + Math.sin(t * 0.09 + u * 4 + f.id) * u * (amp || 5), b[2] - u * 6];
    switch (o.k) {
      case 'fin': { const pts = []; for (let i = 0; i <= 8; i++) pts.push(P(...curve(i / 8)));                         // a great finned fish tail
        const it = X.tube(pts, u => (6 - u * 3.6) * X.s); if (it) X.dress(it, C(o.col), 'gloss');
        const e = curve(1); for (const sd of [-1, 1]) ell(e[0] + back * 8, e[1] + sd * 9, e[2], 11, 8, 1.2, C(o.col), 'gloss', { alpha: 0.8, emis: 0.25, noInk: true });
        for (let i = 2; i < 8; i += 2) { const q = curve(i / 8); glowSph(q[0], q[1] - (6 - i * 0.4), q[2], 1.3, G(o.glow), 1.3, 0.8); }
        X.gseg([e[0], e[1] - 2, e[2] + 1], [e[0] + back * 16, e[1] - 14, e[2] + 1], 0.6, G(o.glow), 1.2, 0.4); X.gseg([e[0], e[1] + 2, e[2] + 1], [e[0] + back * 16, e[1] + 14, e[2] + 1], 0.6, G(o.glow), 1.2, 0.4); break; }
      case 'energy': for (let i = 0; i < 10; i++) { const u = i / 9, q = curve(u, 9);                                   // a tail of living light / lightning / embers
          glowSph(q[0], q[1], q[2], (4.2 - u * 3) + Math.sin(t * 0.3 + i) * 0.4, G(o.col), 1.25 - u * 0.4, 0.7); }
        break;
      case 'scorpion': { let prev = b; for (let i = 1; i <= 7; i++) { const u = i / 7, a = -0.3 - u * 2.4, q = [b[0] + back * Math.cos(a) * 20 * u * 1.6, b[1] + Math.sin(a) * 26 * u * 1.4, b[2]];
          X.seg(prev, q, 3.6 - u * 1.6, C(o.col), 'gloss'); prev = q; }
        X.gseg(prev, [prev[0] - back * 4, prev[1] + 9, prev[2]], 1.8, G(o.glow), 1.4, 0.5, GL3D.mesh.cone); break; }
    }
    void NI;
  },
  proOrbit(o, X) {
    const { ty, th, tw, t, f, C, G, glowSph, sph, box, NI } = X, n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const a = t * 0.04 + i * TAU / n + f.id, r = tw * 0.95 + 12, x = Math.cos(a) * r, z = Math.sin(a) * r, y = ty - th * 0.25 + Math.sin(t * 0.05 + i * 2) * 5;
      switch (o.k) {
        case 'runes': box(x, y, z, 5, 5, 5, G(o.col), null, { emis: 1, noInk: true }, t * 0.05 + i); glowSph(x, y, z, 5, G(o.col), 0.35, -1.2);
          if (i) { const pa = t * 0.04 + (i - 1) * TAU / n + f.id; X.gseg([Math.cos(pa) * r, ty - th * 0.25 + Math.sin(t * 0.05 + (i - 1) * 2) * 5, Math.sin(pa) * r], [x, y, z], 0.3, G(o.col), 0.7, 0.4); } break;
        case 'planets': sph(x * 1.1, y - 8, z * 1.1, 4.4, C(i % 2 ? o.col : '#ffb87a'), 'stone'); X.dress(ring20(X, x * 1.1, y - 8, z * 1.1, 7, [0.25, 1, 0.3], 0.18), C('#ffe08a'), 'gold', NI); break;
        case 'shards': X.oct(x, y, z, 2.8, 6.5, 2.8, G(o.col), null, null, a, t * 0.1, 1.2); X.oct(x, y, z, 2, 5, 2, C(o.col), 'crystal', { emis: 0.5 }, a, t * 0.1); break;
        case 'lanterns': { const bob = Math.sin(t * 0.07 + i * 2.1) * 4; box(x, y - 10 + bob, z, 5, 7, 5, C('#2a2236'), 'metal', NI); glowSph(x, y - 10 + bob, z, 2.6, G(o.col), 1.6, 0.8); glowSph(x, y - 10 + bob, z, 8, G(o.col), 0.25, -1.3);
          X.gseg([x, y - 13.5 + bob, z], [x, y - 22 + bob, z], 0.3, G(o.col), 0.5, 0.4); break; }
      }
    }
  }
});

/* ============================== 78 Pro KO explosions ============================== */
const PRO_PAL = { prism: ['Prismatic', [1, 0.35, 0.75], [0.3, 0.85, 1], [1, 0.95, 0.6]], solar: ['Solar', [1, 0.85, 0.3], [1, 0.45, 0.1], [1, 1, 0.92]],
  abyss: ['Abyssal', [0.1, 0.9, 0.8], [0.25, 0.32, 1], [0.8, 1, 1]], toxic: ['Venom', [0.6, 1, 0.15], [0.7, 0.2, 1], [0.95, 1, 0.7]],
  blood: ['Blood Moon', [1, 0.1, 0.22], [0.62, 0.05, 0.32], [1, 0.75, 0.7]], aurora: ['Borealis', [0.2, 1, 0.65], [0.55, 0.35, 1], [0.85, 1, 1]] };
const PRO_KO_SHAPES = Object.assign({}, KO_SHAPES, { galaxy: 'Spiral Galaxy', bloom: 'Crystal Bloom', serpent: 'Neon Serpent' });
const PRO_KOS = Object.assign({}, ...Object.keys(PRO_PAL).flatMap(p => Object.keys(PRO_KO_SHAPES).map(s => ({ [s + '-' + p]: PRO_KO_SHAPES[s] + ' · ' + PRO_PAL[p][0] }))));
const KO_EXT = {
  galaxy(x, y, z, age, S, a, b, c, u, k, e) {                                // three spiral arms of stars unwinding from a blazing core
    bG('sph', x, y, z, 28 * S * (0.5 + e), 28 * S * (0.5 + e), 28 * S, c, 1.3 * k);
    for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 16; i++) { const q = i / 15, ang = arm * TAU / 3 + q * 4.2 + age * 0.06, r = (10 + q * 200) * S * e, s2 = (5.2 - q * 2.8) * S;
      bG(i % 4 ? 'sph' : 'star4', x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.45, z + Math.sin(ang) * r * 0.6, s2, s2, 3 * S, i % 3 ? a : b, 1.4 * k * (1 - q * 0.4), 0, age * 0.1); }
    ringG(x, y, z, 210 * S * e, 3 * S, b, 0.7 * k, 1.2, age * 0.02);
  },
  bloom(x, y, z, age, S, a, b, c, u, k, e) {                                 // crystals erupt in a ring, hold, then shatter outward
    const grow = Math.min(1, age / 14), shat = Math.max(0, (age - 34) / 30);
    for (let i = 0; i < 14; i++) { const ang = i / 14 * TAU + 0.2, len = (60 + hr(i, 3) * 90) * S * grow, d = 20 * S + len * 0.5 + shat * 130 * S, px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d + shat * shat * 80 * S;
      if (shat < 1) bL('octa', px, py, z + (hr(i, 5) - 0.5) * 40, 10 * S * (1 - shat * 0.5), len * 0.5 + 1, 10 * S * (1 - shat * 0.5), i % 2 ? a : b, 0.7, shat * 3, -ang + Math.PI / 2 + shat * i);
      bG('octa', px, py, z, 14 * S, len * 0.55 + 1, 14 * S, i % 2 ? a : b, 0.5 * k, 0, -ang + Math.PI / 2); }
    for (let i = 0; i < 8; i++) { const ang = i / 8 * TAU + age * 0.01; sG('tube', x, y, z, x + Math.cos(ang) * 260 * S * e, y + Math.sin(ang) * 260 * S * e, z, 2.2 * S, c, 0.9 * k); }
  },
  serpent(x, y, z, age, S, a, b, c, u, k, e) {                               // a glowing serpent coils up out of the blast and roars
    const n = 22, rise = Math.min(1, age / 30); let hx = x, hy = y, hz = z;
    for (let i = 0; i < n; i++) { const q = i / (n - 1), h = q * 300 * S * rise, ang = q * 9 + age * 0.12, r = (60 - q * 36) * S, px = x + Math.cos(ang) * r, py = y - h, pz = z + Math.sin(ang) * r, s2 = (12 - q * 6) * S;
      bG('sph', px, py, pz, s2, s2, s2, i % 2 ? a : b, 1.2 * k); if (i === n - 1) { hx = px; hy = py; hz = pz; } }
    bG('sph', hx, hy, hz, 18 * S, 13 * S, 13 * S, c, 1.4 * k); for (const s of [-1, 1]) bG('sph', hx + s * 7 * S, hy - 5 * S, hz + 10 * S, 3 * S, 3 * S, 3 * S, [1, 1, 1], 1.6 * k);
    sG('cone', hx, hy - 6 * S, hz, hx + 40 * S, hy - 30 * S, hz, 8 * S, b, 1.1 * k * (age < 40 ? 1 : 0.4));
  }
};

/* ============================== 100 Pro nameplates: 20 designs × 5 finishes ============================== */
// finish: [name, main, light, dark]; 'prism' cycles the hue
const FIN20 = { gold: ['Gilded', [1, 0.8, 0.3], [1, 0.96, 0.72], [0.45, 0.28, 0.06]], prism: ['Prismatic', null, [1, 1, 1], [0.2, 0.1, 0.3]], obsidian: ['Obsidian', [0.66, 0.3, 1], [0.95, 0.8, 1], [0.04, 0.02, 0.08]],
  frost: ['Frostfire', [0.55, 0.88, 1], [1, 1, 1], [0.1, 0.25, 0.4]], inferno: ['Infernal', [1, 0.36, 0.1], [1, 0.84, 0.35], [0.3, 0.04, 0.02]] };
const fin20 = (F, t, i) => F[1] || hue3(((t || 0) * 2 + (i || 0) * 40) % 360);
const PLATE20 = {
  cathedral: ['Rose Window', (x, y, z, W, H, F, t, edge) => { edge(0.7, fin20(F, t)); const cy = y - H / 2 - 12; bF('disc', x, cy, z - 1, 14, 2, 14, F[3], 0.2, 0, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; bG('sph', x + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5, z + 1, 3.2, 3.2, 1.4, col3(CATH_GLASS[i % 6]), 1.1); } bG('sph', x, cy, z + 1.5, 4, 4, 2, fin20(F, t), 1.3);
    ringG(x, cy, z + 1, 14, 1.6, F[2], 1, 0); for (const s of [-1, 1]) sL('cone', x + s * (W / 2 - 4), y - H / 2, z, x + s * (W / 2 - 4), y - H / 2 - 14, z, 2.6, F[2], 0.3); }],
  axolotl: ['Axo Frills', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); for (const s of [-1, 1]) for (let g = 0; g < 3; g++) { const a = -0.6 + g * 0.6 + Math.sin(t * 0.08 + g) * 0.12;
      sG('cone', x + s * W / 2, y + (g - 1) * 8, z, x + s * (W / 2 + 16 + (g === 1 ? 4 : 0)), y + (g - 1) * 8 + Math.sin(a) * 10, z, 3.4, fin20(F, t, g), 1.1); bG('sph', x + s * (W / 2 + 17), y + (g - 1) * 8 + Math.sin(a) * 10, z, 2.4, 2.4, 2.4, F[2], 1.2); } }],
  crown: ['Imperial Crown', (x, y, z, W, H, F, t, edge) => { edge(0.9, fin20(F, t)); const cy = y - H / 2; bL('rbox', x, cy - 4, z, 40, 8, 6, fin20(F, t), 0.3);
    for (let i = 0; i < 5; i++) { sL('cone', x + (i - 2) * 9, cy - 6, z, x + (i - 2) * 9, cy - 16 - (i % 2 ? 0 : 5), z, 3, fin20(F, t), 0.3); bG('sph', x + (i - 2) * 9, cy - 17 - (i % 2 ? 0 : 5), z + 1, 2, 2, 2, i === 2 ? [1, 0.25, 0.4] : F[2], 1.3); } }],
  dragon: ['Wyrm Coil', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (let i = 0; i < 26; i++) { const u = i / 25, px = x - W / 2 + u * W, a = u * TAU * 2 + t * 0.05, py = y + Math.sin(a) * (H / 2 + 4), pz = z + Math.cos(a) * 8;
      bL('sph', px, py, pz, 3.4 - u * 1.2, 3.4 - u * 1.2, 3.4 - u * 1.2, fin20(F, t, i), 0.35); }
    bL('sph', x + W / 2 + 4, y + Math.sin(TAU * 2 + t * 0.05) * (H / 2 + 4), z + 8, 5, 3.6, 3.6, fin20(F, t), 0.4); bG('sph', x + W / 2 + 7, y + Math.sin(TAU * 2 + t * 0.05) * (H / 2 + 4) - 1, z + 11, 1.2, 1.2, 1.2, [1, 0.3, 0.2], 1.6); }],
  phoenix: ['Phoenix Wings', (x, y, z, W, H, F, t, edge) => { edge(0.7, fin20(F, t)); for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { const a = -0.5 - k * 0.22 + Math.sin(t * 0.1) * 0.1, L = 26 - k * 2;
      sG('cone', x + s * W / 2, y, z, x + s * (W / 2 + Math.cos(a) * L), y + Math.sin(a) * L, z - k, 4 - k * 0.5, k % 2 ? fin20(F, t, k) : F[2], 1.2); } }],
  clock: ['Chrono Dial', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); const cx = x - W / 2 - 10; bL('disc', cx, y, z, 12, 2, 12, F[3], 0.2, 0, 0, Math.PI / 2); ringG(cx, y, z + 1.4, 12, 1.6, fin20(F, t), 1.1, 0);
    for (const [L, sp] of [[9, 0.05], [6, 0.004]]) { const a = t * sp; sF('tube', cx, y, z + 2, cx + Math.sin(a) * L, y - Math.cos(a) * L, z + 2, 0.8, F[2], 1); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.03; bL('box', x + W / 2 + 10 + Math.cos(a) * 9, y + Math.sin(a) * 9, z, 3, 3, 3, fin20(F, t), 0.2, 0, a); } bL('torus', x + W / 2 + 10, y, z, 7, 7, 7, fin20(F, t), 0.2, 0, t * 0.03, Math.PI / 2); }],
  galaxy: ['Spiral Arms', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 14; i++) { const q = i / 13, a = arm * Math.PI + q * 4 + t * 0.03, r = 6 + q * (W / 2 + 6);
      bG('sph', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.32, z + Math.sin(a) * 10, 1.8 - q * 0.6, 1.8 - q * 0.6, 1.8 - q * 0.6, i % 3 ? fin20(F, t, i) : F[2], 1.3 - q * 0.4); } }],
  blades: ['Sword Fan', (x, y, z, W, H, F, t, edge) => { edge(0.7, fin20(F, t)); for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.3 + Math.sin(t * 0.04) * 0.04, bx = x + Math.cos(a) * 14, by = y - H / 2 + Math.sin(a) * 6;
      sG('tube', bx, by, z - 2, x + Math.cos(a) * 34, y - H / 2 + Math.sin(a) * 26, z - 2, 1.4, fin20(F, t, i), 1.2); bG('sph', x + Math.cos(a) * 34, y - H / 2 + Math.sin(a) * 26, z - 2, 1.6, 1.6, 1.6, F[2], 1.1); } }],
  crystal: ['Geode', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (let k = 0; k < 3; k++) { const a = (sx > 0 ? 0 : Math.PI) + (k - 1) * 0.5;
      bL('octa', x + sx * W / 2 + Math.cos(a) * 5, y + sy * H / 2 - 4 - k * 2, z, 2.6, 7 + k * 2, 2.6, fin20(F, t, k), 0.5, t * 0.02, -sx * (0.3 + k * 0.3) * sy); } }],
  neonsign: ['Neon Sign', (x, y, z, W, H, F, t, edge) => { const fl = (t % 97) < 4 ? 0.2 : 1; edge(1.3 * fl, fin20(F, t)); for (const s of [-1, 1]) bG('box', x, y + s * (H / 2 + 5), z + 3, W - 10, 1.2, 1.2, F[2], 1.1 * fl); for (const s of [-1, 1]) bG('sph', x + s * (W / 2 + 6), y, z + 3, 3, 3, 3, fin20(F, t), 1.4 * fl); }],
  thunder: ['Tesla Coils', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (const s of [-1, 1]) { const cx = x + s * (W / 2 + 7); for (let k = 0; k < 4; k++) bL('torus', cx, y + 8 - k * 5, z, 4, 4, 4, F[3], 0.2, 0, 0, 0); bL('sph', cx, y - 13, z, 4, 4, 4, fin20(F, t), 0.5);
      if ((t + (s > 0 ? 9 : 0)) % 30 < 8) { let px = cx, py = y - 13; for (let j = 0; j < 4; j++) { const nx = px - s * 9, ny = py + (j % 2 ? 5 : -5); sG('tube', px, py, z, nx, ny, z, 0.8, F[2], 1.7); px = nx; py = ny; } } } }],
  sakura: ['Petal Storm', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (let i = 0; i < 10; i++) { const q = ((t * 0.008 + i / 10) % 1), px = x - W / 2 + hr(i, 2) * W + Math.sin(t * 0.05 + i) * 6, py = y - H / 2 - 10 + q * (H + 20);
      bF('sph', px, py, z + 3, 3.4, 1.8, 1, fin20(F, t, i), 0.7, q * 6 + i, q * 4); } }],
  skull: ['Bone Throne', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const cx = x + sx * W / 2, cy = y + sy * H / 2;
      bL('sph', cx, cy - 1, z + 2, 6, 5.6, 5, [0.94, 0.92, 0.86], 0.15); for (const e of [-1, 1]) bG('sph', cx + e * 2.2, cy - 1.5, z + 6.6, 1.3, 1.3, 1, fin20(F, t), 1.5); } }],
  halo: ['Seraph Halo', (x, y, z, W, H, F, t, edge) => { edge(0.7, F[2]); ringG(x, y - H / 2 - 9, z, W * 0.24, 2.2, fin20(F, t), 1.2, 1.25, t * 0.04); ringG(x, y - H / 2 - 13, z, W * 0.16, 1.6, F[2], 1, 1.25, -t * 0.05);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) bL('sph', x + s * (W / 2 + 8 + k * 6), y - 6 - k * 3, z, 10 - k * 2, 2.6, 1.6, F[2], 0.4, 0, s * (0.4 + k * 0.2)); }],
  circuit: ['Mainframe', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (let i = 0; i < 5; i++) { const px = x - W / 2 + 10 + i * (W - 20) / 4; sG('tube', px, y - H / 2, z + 3, px, y - H / 2 - 9, z + 3, 0.6, fin20(F, t, i), 1);
      bG('sph', px, y - H / 2 - 10, z + 3, 1.8, 1.8, 1.8, F[2], ((t >> 3) + i) % 3 ? 0.5 : 1.6); } const q = (t * 0.02) % 1; bG('sph', x - W / 2 + q * W, y + H / 2, z + 3.5, 2, 2, 2, [1, 1, 1], 1.6); }],
  ocean: ['Tidal', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); for (let i = 0; i < 16; i++) { const u = i / 15, px = x - W / 2 + u * W, py = y + H / 2 + 2 + Math.sin(u * 9 + t * 0.12) * 3;
      bL('sph', px, py, z + 2, 4, 3, 3, fin20(F, t, i), 0.3); if (i % 3 === 0) bF('sph', px + 2, py - 3, z + 4, 1.6, 1.2, 1, [1, 1, 1], 1); }
    for (let i = 0; i < 4; i++) { const q = ((t * 0.01 + i / 4) % 1); bA('sph', x - W / 2 + hr(i, 4) * W, y + H / 2 - q * (H + 14), z + 4, 1.6 + q * 1.6, 1.6 + q * 1.6, 1.6 + q * 1.6, F[2], 0.6 * (1 - q)); } }],
  flame: ['Hellfire', (x, y, z, W, H, F, t, edge) => { edge(0.6, fin20(F, t)); for (let i = 0; i < 9; i++) { const px = x - W / 2 + 4 + i * (W - 8) / 8, h = 12 + Math.sin(t * 0.3 + i * 1.7) * 4 + (i % 2) * 5;
      sG('cone', px, y - H / 2 + 1, z + 1, px + Math.sin(t * 0.2 + i) * 2, y - H / 2 - h, z + 1, 3.6, i % 2 ? fin20(F, t, i) : F[2], 1.2); } }],
  laurel: ['Victor\'s Laurel', (x, y, z, W, H, F, t, edge) => { edge(0.7, fin20(F, t)); for (const s of [-1, 1]) for (let i = 0; i < 8; i++) { const u = i / 7, px = x + s * (W / 2 + 3 + Math.sin(u * Math.PI) * 6), py = y + H / 2 + 2 - u * (H + 8);   // two laurel branches curling up the ends
      bL('sph', px, py, z, 4.6, 1.8, 1.4, fin20(F, t, i), 0.3, 0, s * (0.9 - u * 1.1)); } }],
  cube: ['Hypercube', (x, y, z, W, H, F, t, edge) => { edge(0.5, fin20(F, t)); for (const s of [-1, 1]) { const cx = x + s * (W / 2 + 10), a = t * 0.03 * s;
      bL('box', cx, y, z, 9, 9, 9, F[3], 0.2, a, a * 0.7); bG('box', cx, y, z, 12, 12, 12, fin20(F, t), 0.45, -a, a * 0.5); bG('box', cx, y, z, 5, 5, 5, F[2], 1.2, a * 2, a); } }],
  eclipse: ['Eclipse', (x, y, z, W, H, F, t, edge) => { edge(0.8, fin20(F, t)); const cy = y - H / 2 - 10; bF('sph', x, cy, z - 1, 9, 9, 3, [0.01, 0.01, 0.02], 1); ringG(x, cy, z, 10, 2, fin20(F, t), 1.5, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.01; sG('cone', x + Math.cos(a) * 10, cy + Math.sin(a) * 10, z, x + Math.cos(a) * (15 + (i % 2) * 4), cy + Math.sin(a) * (15 + (i % 2) * 4), z, 1.6, F[2], 1); } }]
};
const PRO_PLATES = {};
for (const d in PLATE20) for (const fk in FIN20) { const id = 'p20-' + d + '-' + fk, F = FIN20[fk], fn = PLATE20[d][1];
  PRO_PLATES[id] = PLATE20[d][0] + ' · ' + F[0];
  PLATE_EXT[id] = (x, y, z, W, H, c, t, edge) => { if (fk === 'obsidian') bL('rbox', x, y, z - 2, W + 8, H + 8, 4, [0.06, 0.03, 0.1], 0.2); else if (fk === 'gold') bL('rbox', x, y, z - 2, W + 8, H + 8, 4, [0.55, 0.38, 0.08], 0.3);
    fn(x, y, z, W, H, F, t, edge); };
}

/* ============================== 40 Pro holographic emojis ============================== */
const DK20 = [0.12, 0.06, 0.04], MOUTH20 = [0.35, 0.08, 0.1], WH20 = [1, 1, 1];
Object.assign(EMOJI_COL, { wink: [1, 0.82, 0.2], party: [1, 0.82, 0.2], mindblown: [1, 0.78, 0.22], nerd: [1, 0.82, 0.2], sleepy: [1, 0.82, 0.24], alien: [0.55, 1, 0.5], robo: [0.72, 0.78, 0.9],
  moai: [0.6, 0.58, 0.55], eyes: [1, 1, 1], cat: [1, 0.72, 0.3], dog: [0.82, 0.6, 0.38], panda: [0.96, 0.96, 0.94], ufo: [0.8, 0.85, 0.95], rainbow: [1, 1, 1], comet: [0.6, 0.85, 1],
  orb: [0.7, 0.45, 1], medal: [1, 0.8, 0.25], dice: [0.96, 0.96, 0.98], eightball: [0.08, 0.08, 0.1], pizza: [1, 0.78, 0.35], cake: [1, 0.85, 0.9], gift: [1, 0.25, 0.35], balloon: [1, 0.2, 0.3],
  tornado: [0.7, 0.75, 0.85], wave: [0.25, 0.6, 1], snowman: [1, 1, 1], mushroom: [1, 0.2, 0.2], clover: [0.3, 0.85, 0.35], rose: [0.95, 0.12, 0.2], butterfly: [0.3, 0.6, 1], bomb: [0.12, 0.12, 0.16],
  anchor: [0.55, 0.62, 0.75], key: [1, 0.8, 0.25], hourglass: [0.85, 0.65, 0.4], infinity: [0.6, 0.5, 1], atom: [0.4, 0.85, 1], magnet: [1, 0.2, 0.25], galaxy: [0.7, 0.45, 1], unicorn: [1, 0.96, 1], volcano: [0.5, 0.32, 0.22] });
const face20 = (x, y, z, S, col) => bL('sph', x, y, z, S, S, S * 0.9, col, 0.3);
const eyes20 = (x, y, z, S, wink) => { bF('sph', x - S * 0.34, y - S * 0.18, z + S * 0.8, S * 0.12, S * 0.18, S * 0.08, DK20, 0); if (wink) bF('box', x + S * 0.36, y - S * 0.16, z + S * 0.82, S * 0.26, S * 0.07, 1, DK20, 0, 0, 0.25); else bF('sph', x + S * 0.34, y - S * 0.18, z + S * 0.8, S * 0.12, S * 0.18, S * 0.08, DK20, 0); };
const smile20 = (x, y, z, S, w) => bF('sph', x, y + S * 0.4, z + S * 0.7, S * (w || 0.42), S * 0.15, S * 0.18, MOUTH20, 0);
const heart20 = (x, y, z, s, col, rz) => { const it = glItem(sgMesh('emoji:heart', heartGeo)); xf(it.m, x, -y, z, s, s, s, 0, rz || 0); it.col = col; it.spec = 1; it.shin = 90; it.emis = 0.3; it.outline = 1.2; it.shadow = false; return it; };
const PRO_EMOJI = {
  wink(x, y, z, S, age, col) { const tl = Math.sin(age * 0.08) * 0.15; face20(x, y, z, S, col); eyes20(x, y, z, S, true); smile20(x, y, z, S); bF('sph', x + S * 0.12, y + S * 0.52, z + S * 0.74, S * 0.14, S * 0.1, S * 0.08, [1, 0.45, 0.55], 0); void tl;
    if ((age % 60) < 10) bG('star4', x + S * 0.9, y - S * 0.6, z + S * 0.5, S * 0.25, S * 0.25, S * 0.1, WH20, 1.4, 0, age * 0.2); },
  party(x, y, z, S, age, col) { face20(x, y, z, S, col); eyes20(x, y, z, S); smile20(x, y, z, S, 0.3);
    sL('cone', x - S * 0.15, y - S * 0.75, z, x - S * 0.3, y - S * 1.9, z, S * 0.45, [0.5, 0.3, 1], 0.3); for (let k = 0; k < 3; k++) bF('box', x - S * (0.18 + k * 0.05), y - S * (0.95 + k * 0.3), z + S * 0.3 - k * S * 0.08, S * (0.6 - k * 0.16), S * 0.06, 1, [1, 0.85, 0.2], 0.6, 0, 0.2);
    const blow = 0.5 + 0.5 * Math.sin(age * 0.15); sL('cone', x + S * 0.15, y + S * 0.5, z + S * 0.8, x + S * (0.6 + blow), y + S * 0.6, z + S * 0.9, S * 0.14, [1, 0.3, 0.6], 0.4);
    for (let i = 0; i < 8; i++) { const q = ((age * 0.015 + i / 8) % 1); bF('box', x + (hr(i, 1) - 0.5) * S * 3, y - S * 1.6 + q * S * 3.2, z + (hr(i, 2) - 0.5) * S, S * 0.12, S * 0.2, 1, hue3(i * 45), 1, q * 8, q * 6); } },
  mindblown(x, y, z, S, age, col) { const q = (age % 70) / 70, k = Math.min(1, q * 3); bL('sph', x, y + S * 0.15, z, S, S * 0.8, S * 0.9, col, 0.3); bF('sph', x, y + S * 0.5, z + S * 0.72, S * 0.24, S * 0.2, S * 0.16, MOUTH20, 0);
    for (const s of [-1, 1]) bF('sph', x + s * S * 0.34, y + S * 0.02, z + S * 0.8, S * 0.12, S * 0.12, S * 0.08, DK20, 0);
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.32, r = S * (0.5 + k * 1.1); bL('sph', x + Math.cos(a) * r, y - S * 0.55 + Math.sin(a) * r * 0.8, z, S * 0.36 * (1 - q * 0.5), S * 0.32 * (1 - q * 0.5), S * 0.32, i % 2 ? [1, 0.55, 0.15] : [0.85, 0.82, 0.8], 0.4); }
    bG('sph', x, y - S * 0.7, z, S * (0.6 + k), S * (0.5 + k * 0.8), S * 0.6, [1, 0.7, 0.3], 0.7 * (1 - q)); },
  nerd(x, y, z, S, age, col) { face20(x, y, z, S, col); for (const s of [-1, 1]) { bL('torus', x + s * S * 0.36, y - S * 0.16, z + S * 0.82, S * 0.26, S * 0.26, S * 0.26, [0.15, 0.1, 0.08], 0, 0, 0, Math.PI / 2); bF('sph', x + s * S * 0.36, y - S * 0.16, z + S * 0.78, S * 0.08, S * 0.12, S * 0.05, DK20, 0); }
    bF('box', x, y - S * 0.17, z + S * 0.92, S * 0.2, S * 0.06, 1, [0.15, 0.1, 0.08], 0); smile20(x, y, z, S, 0.36); for (const s of [-1, 1]) bF('box', x + s * S * 0.08, y + S * 0.42, z + S * 0.84, S * 0.14, S * 0.18, 1, WH20, 1);
    if ((age % 80) < 30) bG('star4', x + S * 1.1, y - S * 0.9, z, S * 0.3, S * 0.3, S * 0.12, [1, 0.95, 0.4], 1.3, 0, age * 0.1); },
  sleepy(x, y, z, S, age, col) { const b = (age % 90) / 90; face20(x, y, z, S, col); for (const s of [-1, 1]) bF('box', x + s * S * 0.34, y - S * 0.14, z + S * 0.82, S * 0.28, S * 0.06, 1, DK20, 0, 0, -s * 0.15);
    bF('sph', x, y + S * 0.42, z + S * 0.72, S * 0.16, S * 0.12, S * 0.1, MOUTH20, 0); bA('sph', x + S * 0.3, y + S * 0.12, z + S * 0.95, S * (0.15 + b * 0.45), S * (0.15 + b * 0.45), S * (0.15 + b * 0.45), [0.6, 0.9, 1], 0.55);
    for (let k = 0; k < 2; k++) { const q = ((age * 0.012 + k / 2) % 1); bG('box', x + S * (0.9 + q * 0.6), y - S * (0.8 + q), z, S * 0.3 * (1 - q * 0.4), S * 0.08, 1, [0.6, 0.75, 1], 1.2 * (1 - q)); } },
  alien(x, y, z, S, age, col) { const bo = Math.sin(age * 0.06) * S * 0.05; bL('sph', x, y - S * 0.1 + bo, z, S * 0.88, S * 1.12, S * 0.85, col, 0.35); bL('sph', x, y + S * 0.65 + bo, z, S * 0.45, S * 0.35, S * 0.45, col, 0.35);
    for (const s of [-1, 1]) { bF('sph', x + s * S * 0.38, y + bo, z + S * 0.72, S * 0.24, S * 0.38, S * 0.12, [0.02, 0.02, 0.04], 0, 0, s * 0.55); bF('sph', x + s * S * 0.32, y - S * 0.12 + bo, z + S * 0.82, S * 0.06, S * 0.06, S * 0.04, WH20, 1); }
    bF('box', x, y + S * 0.62 + bo, z + S * 0.44, S * 0.16, S * 0.04, 1, [0.1, 0.25, 0.1], 0); bG('sph', x, y + bo, z, S * 1.4, S * 1.6, S * 1.2, [0.4, 1, 0.5], 0.18); },
  robo(x, y, z, S, age, col) { const tl = Math.sin(age * 0.07) * 0.12; bL('rbox', x, y, z, S * 1.7, S * 1.5, S * 1.3, col, 0.15, 0, tl); for (const s of [-1, 1]) { bG('box', x + s * S * 0.38, y - S * 0.12, z + S * 0.66, S * 0.3, S * 0.24, 1, [0.3, 0.9, 1], (age % 50) < 4 ? 0.2 : 1.5); bL('cyl', x + s * S * 0.86, y, z, S * 0.18, S * 0.12, S * 0.18, [0.4, 0.42, 0.5], 0.1, 0, Math.PI / 2); }
    for (let k = 0; k < 4; k++) bF('box', x - S * 0.3 + k * S * 0.2, y + S * 0.4, z + S * 0.66, S * 0.1, S * 0.18, 1, [0.15, 0.15, 0.2], 0);
    sL('cyl', x, y - S * 0.75, z, x, y - S * 1.15, z, S * 0.06, [0.4, 0.42, 0.5], 0.1); bG('sph', x, y - S * 1.2, z, S * 0.14, S * 0.14, S * 0.14, [1, 0.3, 0.3], (age >> 3) & 1 ? 1.6 : 0.4); },
  moai(x, y, z, S, age, col) { const tl = Math.sin(age * 0.03) * 0.08; bL('rbox', x, y, z, S * 1.1, S * 1.9, S * 0.95, col, 0.05, 0.25, tl); bL('box', x, y - S * 0.48, z + S * 0.48, S * 1.0, S * 0.22, S * 0.24, mix3(col, [0, 0, 0], 0.2), 0, 0.25);
    bL('box', x + S * 0.04, y - S * 0.08, z + S * 0.6, S * 0.26, S * 0.62, S * 0.34, col, 0.05, 0.25); bF('box', x, y + S * 0.45, z + S * 0.5, S * 0.48, S * 0.06, 1, [0.25, 0.22, 0.2], 0, 0.25);
    for (const s of [-1, 1]) bF('box', x + s * S * 0.26, y - S * 0.32, z + S * 0.5, S * 0.22, S * 0.06, 1, [0.25, 0.22, 0.2], 0, 0.25); },
  eyes(x, y, z, S, age, col) { const look = Math.sin(age * 0.05) * 0.5; for (const s of [-1, 1]) { bL('sph', x + s * S * 0.52, y, z, S * 0.5, S * 0.62, S * 0.45, col, 0.2);
    bF('sph', x + s * S * 0.52 + look * S * 0.2, y + S * 0.05, z + S * 0.42, S * 0.2, S * 0.24, S * 0.1, [0.08, 0.06, 0.06], 0); bF('sph', x + s * S * 0.48 + look * S * 0.2, y - S * 0.04, z + S * 0.5, S * 0.06, S * 0.06, S * 0.03, WH20, 1); } },
  cat(x, y, z, S, age, col) { face20(x, y, z, S, col); for (const s of [-1, 1]) { sL('cone', x + s * S * 0.55, y - S * 0.6, z, x + s * S * 0.8, y - S * 1.25, z, S * 0.3, col, 0.3); sF('cone', x + s * S * 0.57, y - S * 0.66, z + S * 0.15, x + s * S * 0.76, y - S * 1.1, z + S * 0.15, S * 0.15, [1, 0.6, 0.65], 0.6);
      for (let k = -1; k <= 1; k++) sF('tube', x + s * S * 0.4, y + S * 0.2 + k * S * 0.08, z + S * 0.8, x + s * S * 1.2, y + S * 0.12 + k * S * 0.2, z + S * 0.7, 0.5, DK20, 0); }
    eyes20(x, y, z, S, (age % 120) < 8); bF('sph', x, y + S * 0.16, z + S * 0.9, S * 0.1, S * 0.07, S * 0.06, [1, 0.45, 0.55], 0); for (const s of [-1, 1]) bF('sph', x + s * S * 0.12, y + S * 0.34, z + S * 0.8, S * 0.13, S * 0.06, S * 0.06, MOUTH20, 0); },
  dog(x, y, z, S, age, col) { face20(x, y, z, S, col); for (const s of [-1, 1]) bL('sph', x + s * S * 0.92, y + S * 0.05 + Math.sin(age * 0.2 + s) * S * 0.06, z - S * 0.1, S * 0.3, S * 0.6, S * 0.22, mix3(col, [0.2, 0.1, 0.05], 0.5), 0.1, 0, s * 0.3);
    bL('sph', x, y + S * 0.35, z + S * 0.6, S * 0.5, S * 0.36, S * 0.36, [0.98, 0.94, 0.88], 0.2); bF('sph', x, y + S * 0.18, z + S * 0.94, S * 0.16, S * 0.12, S * 0.1, [0.08, 0.06, 0.06], 0); eyes20(x, y, z, S);
    const pant = Math.abs(Math.sin(age * 0.3)); bF('sph', x, y + S * (0.62 + pant * 0.1), z + S * 0.82, S * 0.13, S * (0.16 + pant * 0.08), S * 0.08, [1, 0.45, 0.55], 0); },
  panda(x, y, z, S, age, col) { face20(x, y, z, S, col); for (const s of [-1, 1]) { bL('sph', x + s * S * 0.72, y - S * 0.72, z - S * 0.1, S * 0.3, S * 0.3, S * 0.25, [0.08, 0.08, 0.1], 0.1);
      bF('sph', x + s * S * 0.36, y - S * 0.12, z + S * 0.78, S * 0.22, S * 0.3, S * 0.1, [0.08, 0.08, 0.1], 0, 0, s * 0.5); bF('sph', x + s * S * 0.33, y - S * 0.16, z + S * 0.86, S * 0.07, S * 0.07, S * 0.04, WH20, 1); }
    bF('sph', x, y + S * 0.2, z + S * 0.88, S * 0.14, S * 0.1, S * 0.08, [0.08, 0.08, 0.1], 0); smile20(x, y, z, S, 0.22); },
  ufo(x, y, z, S, age, col) { const bo = Math.sin(age * 0.07) * S * 0.08, tl = Math.sin(age * 0.05) * 0.15; bL('sph', x, y + bo, z, S * 1.25, S * 0.32, S * 1.1, col, 0.3, age * 0.04, tl); bA('sph', x, y - S * 0.25 + bo, z, S * 0.55, S * 0.5, S * 0.5, [0.55, 0.95, 1], 0.6);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + age * 0.05; bG('sph', x + Math.cos(a) * S * 1.05, y + S * 0.06 + bo, z + Math.sin(a) * S * 0.95, S * 0.08, S * 0.08, S * 0.08, i % 2 ? [1, 0.3, 0.6] : [0.4, 1, 0.6], ((age >> 3) + i) % 2 ? 1.6 : 0.4); }
    bG('cone', x, y + S * 1.9 + bo, z, S * 0.7, S * 1.7, S * 0.7, [0.5, 1, 0.6], 0.35); },
  rainbow(x, y, z, S, age, col) { const B = [[1, 0.2, 0.2], [1, 0.55, 0.15], [1, 0.9, 0.2], [0.3, 0.85, 0.35], [0.3, 0.55, 1], [0.6, 0.35, 1]];
    B.forEach((c2, b) => { const r = S * (1.3 - b * 0.13); for (let i = 0; i <= 12; i++) { const a = Math.PI + i / 12 * Math.PI; bL('sph', x + Math.cos(a) * r, y + S * 0.5 + Math.sin(a) * r, z, S * 0.09, S * 0.09, S * 0.09, c2, 0.5); } });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) bL('sph', x + s * S * (1.05 + k * 0.18) - s * k * S * 0.3, y + S * 0.55 - (k === 1 ? S * 0.1 : 0), z + S * 0.1, S * 0.3, S * 0.24, S * 0.24, WH20, 0.3); },
  comet(x, y, z, S, age, col) { bL('sph', x + S * 0.4, y + S * 0.4, z, S * 0.55, S * 0.55, S * 0.55, col, 0.6, age * 0.05); for (let k = 0; k < 3; k++) sG('cone', x + S * 0.4, y + S * 0.4, z - k * 2, x - S * (1.2 + k * 0.2), y - S * (1.2 + k * 0.2) + (k - 1) * S * 0.25, z, S * (0.55 - k * 0.12), k ? [0.5, 0.75, 1] : [0.85, 0.95, 1], 0.9);
    for (let i = 0; i < 5; i++) { const q = ((age * 0.02 + i / 5) % 1); bG('star4', x + S * 0.4 - q * S * 1.8, y + S * 0.4 - q * S * 1.8 + Math.sin(i * 3) * S * 0.3, z, S * 0.12 * (1 - q), S * 0.12 * (1 - q), S * 0.05, WH20, 1.2 * (1 - q)); } },
  orb(x, y, z, S, age, col) { bA('sph', x, y - S * 0.15, z, S * 0.9, S * 0.9, S * 0.9, col, 0.55); for (let i = 0; i < 6; i++) { const a = age * 0.06 + i * TAU / 6; bG('sph', x + Math.cos(a) * S * 0.45, y - S * 0.15 + Math.sin(a * 1.5) * S * 0.3, z + Math.sin(a) * S * 0.45, S * 0.12, S * 0.12, S * 0.12, i % 2 ? [1, 0.5, 1] : [0.5, 0.9, 1], 1.3); }
    bG('sph', x, y - S * 0.15, z, S * 0.35, S * 0.35, S * 0.35, WH20, 0.8 + 0.4 * Math.sin(age * 0.1)); bL('cyl', x, y + S * 0.95, z, S * 0.55, S * 0.25, S * 0.55, [1, 0.8, 0.3], 0.2); bL('torus', x, y + S * 0.72, z, S * 0.5, S * 0.5, S * 0.5, [1, 0.8, 0.3], 0.2); },
  medal(x, y, z, S, age, col) { const sp = Math.sin(age * 0.05) * 0.6; for (const s of [-1, 1]) bL('box', x + s * S * 0.3, y - S * 0.85, z - S * 0.1, S * 0.35, S * 0.9, S * 0.06, s > 0 ? [0.3, 0.5, 1] : [1, 0.3, 0.35], 0.1, 0, -s * 0.4);
    bL('cyl', x, y + S * 0.25, z - S * 0.12, S * 0.85, S * 0.24, S * 0.85, col, 0.4, sp, 0, Math.PI / 2); bL('star', x, y + S * 0.25, z + S * 0.15, S * 0.45, S * 0.45, S * 0.15, [1, 0.95, 0.6], 0.6, sp);
    bG('star4', x + S * 0.5, y - S * 0.1, z + S * 0.3, S * 0.2, S * 0.2, S * 0.08, WH20, (age % 60) < 12 ? 1.4 : 0); },
  dice(x, y, z, S, age, col) { const a = age * 0.04, h = S * 0.62; bL('rbox', x, y, z, S * 1.24, S * 1.24, S * 1.24, col, 0.15, a);
    const pips = [[[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]]];
    for (let k = 0; k < 4; k++) { const th = a + k * Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th); if (cs < -0.15) continue;
      for (const [pu, pv] of pips[k]) { const ux = pu * S * 0.3, vy = pv * S * 0.3; bF('sph', x + sn * (h + 0.5) + cs * ux, y + vy, z + cs * (h + 0.5) - sn * ux, S * 0.1, S * 0.1, S * 0.1, [0.1, 0.1, 0.14], 0); } }
    for (const [pu, pv] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) bF('sph', x + Math.cos(a) * pu * S * 0.28 + Math.sin(a) * pv * S * 0.28, y - h - 0.5, z - Math.sin(a) * pu * S * 0.28 + Math.cos(a) * pv * S * 0.28, S * 0.1, S * 0.05, S * 0.1, [0.85, 0.15, 0.2], 0); },
  eightball(x, y, z, S, age, col) { const r = Math.sin(age * 0.04) * 0.4; bL('sph', x, y, z, S, S, S, col, 0, r); bF('cyl', x + Math.sin(r) * S * 0.2, y - S * 0.1, z + S * 0.97, S * 0.42, S * 0.06, S * 0.42, WH20, 1, 0, 0, Math.PI / 2);   // (the white roundel sits just proud of the ball)
    for (const dy of [-0.13, 0.13]) bL('torus', x + Math.sin(r) * S * 0.2, y - S * 0.1 + dy * S, z + S * 1.05, S * 0.11, S * 0.11, S * 0.11, [0.05, 0.05, 0.06], 0, 0, 0, Math.PI / 2);
    bF('sph', x - S * 0.4, y - S * 0.45, z + S * 0.75, S * 0.18, S * 0.1, S * 0.05, WH20, 0.9, 0, 0.6); },
  pizza(x, y, z, S, age, col) { y += Math.sin(age * 0.08) * S * 0.08;                                          // a slice, tip down: the triangle faces the camera, crust along the top
    bL('wedge', x, y, z, S * 1.2, S * 0.14, S * 1.1, col, 0.25, 0, -Math.PI / 2, Math.PI / 2); sL('cyl', x - S * 1.02, y - S * 0.62, z + S * 0.07, x + S * 1.02, y - S * 0.62, z + S * 0.07, S * 0.2, [0.85, 0.55, 0.25], 0.1);
    for (const [px, py] of [[0, -0.15], [-0.42, -0.32], [0.38, -0.3], [0, 0.4]]) bF('cyl', x + px * S, y + py * S, z + S * 0.15, S * 0.17, S * 0.04, S * 0.17, [0.85, 0.15, 0.12], 0.2, 0, 0, Math.PI / 2);
    const dr = (age * 0.02) % 1; sL('cyl', x, y + S * 1.05, z + S * 0.07, x, y + S * (1.1 + dr * 0.45), z + S * 0.07, S * 0.07, col, 0.3); },
  cake(x, y, z, S, age, col) { bL('cyl', x, y + S * 0.85, z, S * 1.1, S * 0.6, S * 1.1, [0.9, 0.6, 0.45], 0.1); bL('cyl', x, y + S * 0.3, z, S * 0.8, S * 0.5, S * 0.8, col, 0.2); bL('torus', x, y + S * 0.27, z, S * 0.82, S * 0.4, S * 0.82, WH20, 0.3);
    for (let i = 0; i < 3; i++) { const cx = x + (i - 1) * S * 0.38; sL('cyl', cx, y - S * 0.2, z, cx, y - S * 0.62, z, S * 0.07, [0.4, 0.7, 1], 0.2); const fl = 1 + Math.sin(age * 0.6 + i * 2) * 0.2;
      sG('cone', cx, y - S * 0.64, z, cx + Math.sin(age * 0.3 + i) * S * 0.05, y - S * (0.64 + 0.3 * fl), z, S * 0.09, [1, 0.7, 0.2], 1.4); } },
  gift(x, y, z, S, age, col) { const hop = Math.max(0, Math.sin(age * 0.12)) ** 4 * S * 0.3; bL('rbox', x, y + S * 0.3, z, S * 1.4, S * 1.1, S * 1.2, col, 0.2); bL('rbox', x, y - S * 0.3 - hop, z, S * 1.5, S * 0.3, S * 1.3, col, 0.2);
    bL('box', x, y + S * 0.1, z + S * 0.61, S * 0.24, S * 1.5, S * 0.02, [1, 0.85, 0.25], 0.3); bL('box', x, y - S * 0.3 - hop, z + S * 0.66, S * 0.24, S * 0.32, S * 0.02, [1, 0.85, 0.25], 0.3);
    for (const s of [-1, 1]) bL('torus', x + s * S * 0.26, y - S * 0.56 - hop, z, S * 0.24, S * 0.18, S * 0.24, [1, 0.85, 0.25], 0.3, 0, s * 0.5, Math.PI / 2); },
  balloon(x, y, z, S, age, col) { const sw = Math.sin(age * 0.06) * S * 0.15; bL('sph', x + sw, y - S * 0.3, z, S * 0.82, S * 1, S * 0.8, col, 0.35); sL('cone', x + sw, y + S * 0.62, z, x + sw, y + S * 0.78, z, S * 0.14, col, 0.3);
    bF('sph', x + sw - S * 0.3, y - S * 0.65, z + S * 0.6, S * 0.16, S * 0.26, S * 0.06, WH20, 0.8, 0, 0.4);
    let px = x + sw, py = y + S * 0.78; for (let k = 1; k <= 4; k++) { const nx = x + Math.sin(age * 0.1 + k) * S * 0.12, ny = py + S * 0.3; sF('tube', px, py, z, nx, ny, z, 0.5, [0.9, 0.9, 0.9], 0.6); px = nx; py = ny; } },
  tornado(x, y, z, S, age, col) { for (let k = 0; k < 7; k++) { const u = k / 6, sw = Math.sin(age * 0.08 + u * 3) * S * 0.25 * u; bL('torus', x + sw, y - S * 1.1 + u * S * 2.1, z, S * (1.05 - u * 0.75), S * 0.6, S * (1.05 - u * 0.75), col, 0.2, age * 0.15 + k); }
    for (let i = 0; i < 4; i++) { const a = age * 0.12 + i * 1.6; bL('box', x + Math.cos(a) * S * 0.9, y - S * 0.6 + i * S * 0.3, z + Math.sin(a) * S * 0.9, S * 0.12, S * 0.12, S * 0.12, [0.45, 0.35, 0.25], 0, a, a); } },
  wave(x, y, z, S, age, col) { const ph = age * 0.08; for (let i = 0; i <= 14; i++) { const u = i / 14, a = Math.PI * 1.1 * u + Math.PI * 0.55, r = S * (1.1 - u * 0.55), px = x + Math.cos(a) * r - S * 0.1, py = y + S * 0.3 - Math.sin(a) * r;
      bL('sph', px, py + Math.sin(ph + u * 4) * S * 0.03, z, S * (0.42 - u * 0.2), S * (0.42 - u * 0.2), S * 0.4, mix3(col, WH20, u * 0.4), 0.3); }
    for (let i = 0; i < 5; i++) bF('sph', x - S * 0.2 + Math.cos(Math.PI * 1.6 + i * 0.2) * S * 0.6, y - S * 0.55 + i * S * 0.06, z + S * 0.3, S * 0.14, S * 0.14, S * 0.12, WH20, 0.9);
    bL('box', x, y + S * 0.95, z, S * 2.4, S * 0.2, S * 0.8, mix3(col, [0, 0, 0.3], 0.3), 0.2); },
  snowman(x, y, z, S, age, col) { const sw = Math.sin(age * 0.07) * 0.12; bL('sph', x, y + S * 0.6, z, S * 0.7, S * 0.62, S * 0.66, col, 0.25); bL('sph', x, y - S * 0.25, z, S * 0.5, S * 0.48, S * 0.48, col, 0.25);
    for (const s of [-1, 1]) bF('sph', x + s * S * 0.18, y - S * 0.32, z + S * 0.44, S * 0.07, S * 0.07, S * 0.05, DK20, 0); sL('cone', x, y - S * 0.2, z + S * 0.42, x + S * 0.4, y - S * 0.15, z + S * 0.62, S * 0.08, [1, 0.5, 0.1], 0.3);
    bL('cyl', x, y - S * 0.68, z, S * 0.55, S * 0.08, S * 0.55, [0.08, 0.08, 0.1], 0, 0, sw); bL('cyl', x, y - S * 0.7, z, S * 0.36, S * 0.5, S * 0.36, [0.08, 0.08, 0.1], 0, 0, sw);
    bL('torus', x, y + S * 0.1, z, S * 0.44, S * 0.4, S * 0.44, [0.9, 0.2, 0.25], 0.2); },
  mushroom(x, y, z, S, age, col) { const sq = 1 + Math.sin(age * 0.15) * 0.05; bL('sph', x, y - S * 0.25, z, S * 1.05 * sq, S * 0.7 / sq, S * 0.95 * sq, col, 0.3); bL('cyl', x, y + S * 0.9, z, S * 0.42, S * 0.8, S * 0.42, [0.98, 0.95, 0.88], 0.2);
    for (const [a, r] of [[0, 0.55], [1.3, 0.62], [2.5, 0.5], [3.9, 0.6], [5.2, 0.45]]) bF('sph', x + Math.cos(a) * S * r, y - S * 0.62 + Math.sin(a) * S * 0.12, z + Math.sin(a) * S * r * 0.6 + S * 0.25, S * 0.16, S * 0.1, S * 0.12, WH20, 0.8);
    for (const s of [-1, 1]) bF('sph', x + s * S * 0.16, y + S * 0.35, z + S * 0.4, S * 0.06, S * 0.1, S * 0.04, DK20, 0); },
  clover(x, y, z, S, age, col) { const rr = age * 0.02; for (let i = 0; i < 4; i++) { const a = rr + i * Math.PI / 2; heart20(x + Math.sin(a) * S * 0.48, y - Math.cos(a) * S * 0.48, z, S * 0.62, col, -a); }
    sL('cyl', x, y, z - 1, x + S * 0.3, y + S * 1.3, z - 1, S * 0.08, mix3(col, [0, 0.2, 0], 0.4), 0.2); bG('sph', x, y, z + S * 0.2, S * 0.12, S * 0.12, S * 0.12, [1, 1, 0.6], 0.8); },
  rose(x, y, z, S, age, col) { for (let i = 0; i < 9; i++) { const a = i * 2.4 + age * 0.01, r = S * (0.1 + i * 0.05); bL('sph', x + Math.cos(a) * r, y - S * 0.35 + Math.sin(a) * r * 0.4, z + Math.sin(a) * r * 0.6, S * (0.24 + i * 0.03), S * (0.3 + i * 0.02), S * 0.18, mix3(col, [0.4, 0, 0.05], i * 0.04), 0.3, a); }
    sL('cyl', x, y + S * 0.05, z, x + S * 0.12, y + S * 1.3, z, S * 0.08, [0.25, 0.55, 0.25], 0.1); for (const s of [-1, 1]) bL('sph', x + s * S * 0.25, y + S * 0.6 + s * S * 0.1, z, S * 0.24, S * 0.1, S * 0.12, [0.3, 0.65, 0.3], 0.2, 0, s * 0.6); },
  butterfly(x, y, z, S, age, col) { const fl = 0.35 + 0.65 * Math.abs(Math.sin(age * 0.25)); for (const s of [-1, 1]) { bL('sph', x + s * S * 0.6 * fl, y - S * 0.35, z, S * 0.62 * fl, S * 0.62, S * 0.1, col, 0.45, 0, s * 0.25); bL('sph', x + s * S * 0.45 * fl, y + S * 0.42, z, S * 0.42 * fl, S * 0.42, S * 0.1, mix3(col, [1, 0.4, 1], 0.4), 0.45, 0, -s * 0.3);
      bF('sph', x + s * S * 0.7 * fl, y - S * 0.42, z + S * 0.11, S * 0.14 * fl, S * 0.14, S * 0.04, WH20, 0.9);
      sF('tube', x + s * S * 0.04, y - S * 0.6, z, x + s * S * 0.3, y - S * 1.15, z, 0.5, DK20, 0); bG('sph', x + s * S * 0.3, y - S * 1.15, z, S * 0.06, S * 0.06, S * 0.06, col, 1.3); }
    bL('sph', x, y, z + S * 0.05, S * 0.12, S * 0.7, S * 0.12, [0.15, 0.1, 0.12], 0.1); },
  bomb(x, y, z, S, age, col) { const sh = (age % 40) > 30 ? Math.sin(age * 1.4) * S * 0.04 : 0; bL('sph', x + sh, y + S * 0.15, z, S * 0.9, S * 0.9, S * 0.9, col, 0.1); bL('cyl', x + sh + S * 0.35, y - S * 0.62, z, S * 0.22, S * 0.22, S * 0.22, [0.3, 0.3, 0.35], 0.1, 0, -0.6);
    sL('tube', x + sh + S * 0.5, y - S * 0.8, z, x + sh + S * 0.8, y - S * 1.1, z, S * 0.05, [0.75, 0.6, 0.4], 0); const sp = 0.7 + 0.5 * Math.abs(Math.sin(age * 0.9));
    bG('star4', x + sh + S * 0.82, y - S * 1.12, z, S * 0.3 * sp, S * 0.3 * sp, S * 0.1, [1, 0.8, 0.3], 1.5, 0, age * 0.3); bF('sph', x + sh - S * 0.35, y - S * 0.2, z + S * 0.75, S * 0.16, S * 0.1, S * 0.05, WH20, 0.7, 0, 0.6); },
  anchor(x, y, z, S, age, col) { const sw = Math.sin(age * 0.05) * 0.25, c = Math.cos(sw), s = Math.sin(sw), R = (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
    const top = R(0, -S * 0.95), bot = R(0, S * 0.75); sL('cyl', top[0], top[1], z, bot[0], bot[1], z, S * 0.12, col, 0.2); bL('torus', top[0], top[1] - S * 0.18, z, S * 0.24, S * 0.24, S * 0.24, col, 0.2, 0, 0, Math.PI / 2);
    const cb1 = R(-S * 0.5, -S * 0.55), cb2 = R(S * 0.5, -S * 0.55); sL('cyl', cb1[0], cb1[1], z, cb2[0], cb2[1], z, S * 0.1, col, 0.2);
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.05 + i / 8 * 0.9), p = R(Math.cos(a) * S * 0.7, S * 0.75 - (1 - Math.sin(a)) * S * 0.45); bL('sph', p[0], p[1], z, S * 0.12, S * 0.12, S * 0.12, col, 0.2); }   // the curved arms
    for (const sd of [-1, 1]) { const b = R(sd * S * 0.7, S * 0.3), tp = R(sd * S * 0.82, S * 0.05); sL('cone', b[0], b[1], z, tp[0], tp[1], z, S * 0.16, col, 0.2); } },
  key(x, y, z, S, age, col) { const a = age * 0.04; bL('torus', x - S * 0.65, y, z, S * 0.38, S * 0.38, S * 0.38, col, 0.4, a, 0, Math.PI / 2); sL('cyl', x - S * 0.3, y, z, x + S * 1.0, y, z, S * 0.11, col, 0.4);
    for (const [px, h] of [[0.6, 0.35], [0.85, 0.25]]) bL('box', x + S * px, y + S * h / 2 + S * 0.08, z, S * 0.13, S * h, S * 0.13, col, 0.4); bG('star4', x - S * 0.65, y, z + S * 0.2, S * 0.18, S * 0.18, S * 0.08, WH20, (age % 70) < 14 ? 1.3 : 0, 0, age * 0.1); },
  hourglass(x, y, z, S, age, col) { const q = (age % 150) / 150, flip = q > 0.88 ? (q - 0.88) / 0.12 : 0, rz = flip * Math.PI, sand = Math.min(1, q / 0.85);
    const P = (lx, ly) => [x + lx * Math.cos(rz) - ly * Math.sin(rz), y + lx * Math.sin(rz) + ly * Math.cos(rz)];
    for (const sd of [-1, 1]) { const cp = P(0, sd * S * 1.05); bL('cyl', cp[0], cp[1] - S * 0.07, z, S * 0.7, S * 0.14, S * 0.7, [0.55, 0.35, 0.18], 0.1, 0, rz); }
    const tp = P(0, -S * 0.95), bp = P(0, S * 0.95), mid = P(0, 0); sA('cone', tp[0], tp[1], z, mid[0], mid[1], z, S * 0.6, [0.8, 0.95, 1], 0.32); sA('cone', bp[0], bp[1], z, mid[0], mid[1], z, S * 0.6, [0.8, 0.95, 1], 0.32);
    if (!flip) { sL('cone', x, y - S * 0.15 - (1 - sand) * S * 0.55, z, x, y, z, S * 0.42 * (1 - sand) + 0.5, col, 0.3); sL('cone', x, y + S * 0.92, z, x, y + S * 0.92 - S * 0.5 * sand, z, S * 0.5 * sand + 0.5, col, 0.3); sF('tube', x, y, z, x, y + S * 0.9, z, 0.6, col, 0.6); } },
  infinity(x, y, z, S, age, col) { for (let i = 0; i < 40; i++) { const u = i / 40 * TAU, d = 1 + Math.sin(u) ** 2, px = Math.cos(u) / d, py = Math.sin(u) * Math.cos(u) / d;
      bL('sph', x + px * S * 1.3, y + py * S * 1.3, z + Math.sin(u * 2) * S * 0.15, S * 0.16, S * 0.16, S * 0.16, hue3((i * 9 + age * 3) % 360), 0.6); }
    const u = age * 0.06, d = 1 + Math.sin(u) ** 2; bG('sph', x + Math.cos(u) / d * S * 1.3, y + Math.sin(u) * Math.cos(u) / d * S * 1.3, z + S * 0.2, S * 0.24, S * 0.24, S * 0.24, WH20, 1.5); },
  atom(x, y, z, S, age, col) { for (const [dx, dy, c2] of [[0.1, 0.1, [1, 0.3, 0.35]], [-0.12, 0.05, [0.4, 0.6, 1]], [0, -0.12, [1, 0.3, 0.35]], [0.05, 0.02, [0.4, 0.6, 1]]]) bL('sph', x + dx * S, y + dy * S, z, S * 0.2, S * 0.2, S * 0.2, c2, 0.4);
    for (let k = 0; k < 3; k++) { const rr = k * Math.PI / 3; bG('torus', x, y, z, S * 1.1, S * 1.1, S * 0.36, col, 0.8, 0, rr, Math.PI / 2 - 0.15);
      const a = age * 0.12 + k * 2, ex = Math.cos(a) * S * 1.1, ey = Math.sin(a) * S * 0.36, wx = ex * Math.cos(rr) - ey * Math.sin(rr), wy = ex * Math.sin(rr) + ey * Math.cos(rr);   // (the orbit's own rotation, in world space)
      bG('sph', x + wx, y - wy, z + Math.sin(a) * S * 0.3, S * 0.12, S * 0.12, S * 0.12, WH20, 1.6); } },
  magnet(x, y, z, S, age, col) { const pull = Math.sin(age * 0.1) * 0.1; for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10), px = x + Math.cos(a) * S * 0.6, py = y + S * 0.15 + Math.sin(a) * S * 0.6; bL('sph', px, py, z, S * 0.26, S * 0.26, S * 0.26, col, 0.3); }
    for (const sd of [-1, 1]) { bL('cyl', x + sd * S * 0.6, y + S * 0.15, z, S * 0.26, S * 0.85, S * 0.26, col, 0.3); bL('cyl', x + sd * S * 0.6, y - S * 0.7, z, S * 0.27, S * 0.32, S * 0.27, [0.85, 0.88, 0.95], 0.3); }   // the legs up from the arc's ends + steel tips
    for (let k = 0; k < 3; k++) { const q = ((age * 0.03 + k / 3) % 1); ringG(x, y - S * (1.1 + q * 0.6), z, S * (0.5 + q * 0.3 + pull), 1.2, [0.5, 0.8, 1], 0.9 * (1 - q), 1.1); } },
  galaxy(x, y, z, S, age, col) { for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 16; i++) { const q = i / 15, a = arm * Math.PI + q * 4 + age * 0.03, r = S * (0.15 + q * 1.15);
      bG('sph', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, z + Math.sin(a) * r * 0.5, S * (0.14 - q * 0.06), S * (0.14 - q * 0.06), S * (0.14 - q * 0.06), i % 3 ? col : [0.5, 0.9, 1], 1.4 - q * 0.5); }
    bG('sph', x, y, z, S * 0.35, S * 0.22, S * 0.35, [1, 0.9, 0.7], 1.4); bG('sph', x, y, z, S * 1.3, S * 0.5, S * 1.3, col, 0.2); },
  unicorn(x, y, z, S, age, col) { const nod = Math.sin(age * 0.06) * 0.1; bL('sph', x, y, z, S * 0.75, S * 0.85, S * 0.7, col, 0.3, 0, nod); bL('sph', x + S * 0.55, y + S * 0.35, z + S * 0.05, S * 0.5, S * 0.36, S * 0.42, col, 0.3, 0, nod);
    for (const s of [-1, 1]) bF('sph', x + S * 0.88, y + S * 0.32 + s * S * 0.0, z + s * S * 0.15 + S * 0.25, S * 0.05, S * 0.04, S * 0.03, DK20, 0); bF('sph', x + S * 0.2, y - S * 0.15, z + S * 0.6, S * 0.1, S * 0.14, S * 0.06, DK20, 0);
    sL('cone', x + S * 0.2, y - S * 0.65, z, x + S * 0.65, y - S * 1.55, z, S * 0.16, [1, 0.85, 0.35], 0.5); for (let k = 0; k < 3; k++) bL('torus', x + S * (0.28 + k * 0.1), y - S * (0.82 + k * 0.2), z, S * (0.13 - k * 0.03), S * 0.13, S * (0.13 - k * 0.03), [1, 0.95, 0.6], 0.5, 0, -0.45, 0);
    for (let i = 0; i < 6; i++) bL('sph', x - S * (0.35 + i * 0.08), y - S * 0.55 + i * S * 0.28 + Math.sin(age * 0.15 + i) * S * 0.04, z - S * 0.2, S * 0.24, S * 0.24, S * 0.24, hue3(i * 55), 0.5);
    for (const s of [-1, 1]) sL('cone', x - S * 0.15 + s * S * 0.06, y - S * 0.7, z + s * S * 0.2, x - S * 0.25 + s * S * 0.06, y - S * 1.05, z + s * S * 0.22, S * 0.12, col, 0.3); },
  volcano(x, y, z, S, age, col) { bL('cone', x, y + S * 1.05, z, S * 1.25, S * 1.3, S * 1.05, col, 0.1); bG('sph', x, y - S * 0.2, z, S * 0.36, S * 0.12, S * 0.3, [1, 0.45, 0.1], 1.4);
    for (let i = 0; i < 4; i++) sF('cone', x + (i - 1.5) * S * 0.18, y - S * 0.18, z + S * 0.3, x + (i - 1.5) * S * 0.24, y + S * (0.3 + (i % 2) * 0.3), z + S * 0.62, S * 0.07, [1, 0.5, 0.12], 1);
    for (let i = 0; i < 6; i++) { const q = ((age * 0.025 + i / 6) % 1), vx = (hr(i, 1) - 0.5) * 2.4, px = x + vx * q * S, py = y - S * 0.3 - (q * 3 - q * q * 3.2) * S;
      bL('sph', px, py, z + (hr(i, 2) - 0.5) * S * 0.6, S * 0.14, S * 0.14, S * 0.14, [1, 0.45 + 0.4 * (1 - q), 0.1], 0.9); }
    for (let k = 0; k < 3; k++) { const q = ((age * 0.01 + k / 3) % 1); bA('sph', x + Math.sin(k * 2 + age * 0.02) * S * 0.3, y - S * (0.6 + q * 1.4), z - S * 0.2, S * (0.3 + q * 0.4), S * (0.3 + q * 0.4), S * 0.3, [0.5, 0.45, 0.45], 0.5 * (1 - q)); } }
};
// every Pro emoji floats inside a gold Pro projector ring with orbiting glints (on top of the usual hologram halo + scanline)
for (const id in PRO_EMOJI) EMOJI_EXT[id] = (x, y, z, S, age, col) => {
  PRO_EMOJI[id](x, y, z, S, age, col);
  ringG(x, y + S * 1.35, z, S * 0.95, 1.6, [1, 0.8, 0.3], 0.9, 1.2, age * 0.05);
  for (let i = 0; i < 3; i++) { const a = age * 0.07 + i * TAU / 3; bG('star4', x + Math.cos(a) * S * 1.45, y + Math.sin(a * 2) * S * 0.25, z + Math.sin(a) * S * 0.6, S * 0.12, S * 0.12, S * 0.05, [1, 0.9, 0.55], 1.2, 0, age * 0.2); }
};
