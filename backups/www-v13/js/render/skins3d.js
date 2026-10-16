/* NEON BRAWL — The Item Shop skins: a library of parametric 3D parts (v13).
 *
 * Each of the 45 shop skins (data/skins.js SHOP_SKINS) is a body material + colour scheme + a list of parts from this
 * library. Every part is real geometry attached to the live rig — it follows the head, torso, shoulders, arms and legs
 * through every pose, attack, emote and launch — so a skin is a different 3D model, not a colour swap:
 *   helm      kabuto · cyber · galea · winged · space · greathelm · vfin · aviator
 *   hat       jingasa · phones · top · jester · nemes · hood · witch
 *   crown     flower · cube · laurel · flame · ice · leaf · coral · star · royal · tiara
 *   horns / ears / mask / visor / snakes / headRing / halo
 *   backWeapon katana2 · yari · kanabo · saber · aspis · labrys · scepter · ankh · scythe · broom
 *   pack      cables · astro · gears · antenna · rocket · cannon      tail   fox9 · wolf · dragon · cat · pom
 *   wings     feather · bat · thruster      cape      shoulders / chest / limbs armour      cracks
 *   ring      scan · wind · accretion      orbit (12 kinds of things in orbit)      aura (5 particle kinds)      trail
 * Called from render/fighter3d.js buildFighter3D with a kit of its local-space helpers (P · D · U · sph · ell · seg ·
 * cone · box · torus · glowSph · glowIt · dress …). Local space: x across (face = the way the fighter faces), y DOWN,
 * z toward the camera.                                                                                               */
'use strict';

// the body material + albedo of a shop skin (fighter3d.js treats it like a Battle Pass skin material)
function shopSkinMat(d) { return d._mat || (d._mat = { mat: d.mat, alb: f => skinColor(f.ch, d.alb), rim: d.rim || null }); }

function shopSkin3D(d, K) {
  const R = K.R, c = K.c, hy = c.headShape === 'totem' ? K.hy - R * 2.3 : c.headShape === 'obelisk' ? K.hy - R * 1.15 : K.hy;   // headgear sits on top of a totem / obelisk head
  const X = Object.assign(K, { hy, hy0: K.hy });
  X.H = (fx, up, cz, k) => { const v = V3.norm([K.face * fx, -up, cz]), kk = (k === undefined ? 1 : k) * R; return [K.hx + v[0] * kk, hy + v[1] * kk, v[2] * kk]; };   // a point on the (headgear) head sphere
  X.C = h => K.flash ? [1, 1, 1] : !h || h === 'self' ? K.selfC : col3(h);                                                  // a solid colour (white in a hit flash)
  X.G = h => !h || h === 'self' ? K.selfC : col3(h);                                                                        // a glow colour
  X.cyl = (a, b, r, col, mk, o) => K.dress(glSegment(K.P(a[0], a[1], a[2]), K.P(b[0], b[1], b[2]), r * K.s, r * K.s, GL3D.mesh.cylCap), col, mk, o);
  X.gseg = (a, b, r, col, k, pw, mesh) => K.glowIt(glSegment(K.P(a[0], a[1], a[2]), K.P(b[0], b[1], b[2]), r * K.s, r * K.s, mesh), col, k, pw === undefined ? 0.5 : pw);
  X.disc = (x, y, z, r, th, col, mk, o, flat) => { const p = K.P(x, y, z), it = glItem(GL3D.mesh.cylCap);
    if (flat) M4.basis(it.m, p[0], p[1], p[2], K.D(r, 0, 0), K.D(0, -th, 0), K.D(0, 0, r)); else M4.basis(it.m, p[0], p[1], p[2], K.D(r, 0, 0), K.D(0, 0, th), K.D(0, r, 0)); return K.dress(it, col, mk, o); };
  X.oct = (x, y, z, sx, sy, sz, col, mk, o, a1, a2, glow) => { const p = K.P(x, y, z), it = glItem(GL3D.mesh.octa), B = K.rb(a1 || 0, a2 || 0, 1);
    M4.basis(it.m, p[0], p[1], p[2], V3.scale(B[0], sx * K.s), V3.scale(B[1], sy * K.s), V3.scale(B[2], sz * K.s)); return glow ? K.glowIt(it, col, glow, 0.6) : K.dress(it, col, mk, o); };
  X.tube = (pts, rf) => chainTube(pts, rf, K.O3, K.REF, 3);
  X.NI = { noInk: true };
  for (const [k, o] of d.parts) { const fn = SKIN_PARTS[k]; if (fn) fn(o, X); }
}

const SKIN_PARTS = {
  /* ================= helmets ================= */
  helm(o, X) {
    const { hx, hy, R, face, back, t, ell, box, cone, torus, sph, glowSph, C, G, H, NI } = X, col = C(o.col);
    switch (o.k) {
      case 'kabuto':
        ell(hx, hy - R * 0.32, -R * 0.08, R * 1.12, R * 0.74, R * 1.1, col, 'metal');
        for (let k = 0; k < 2; k++) torus(hx - face * R * 0.12, hy - R * (0.02 - k * 0.22), -R * 0.1, R * (1.24 + k * 0.08), col, 0.32, 'metal', null, R * (1.0 + k * 0.05));
        for (const sd of [-1, 1]) cone([hx + face * R * 0.45, hy - R * 0.72, sd * R * 0.22], [hx + face * R * 0.82, hy - R * 1.78, sd * R * 0.9], R * 0.1, C(o.crest), 'gold');
        X.disc(hx + face * R * 0.82, hy - R * 0.7, R * 0.5, R * 0.22, 1.2, C(o.crest), 'gold');
        box(...H(0.5, 0.42, 0.8, 1.02), R * 1.2, R * 0.12, R * 0.4, C(o.crest), 'gold', NI); break;
      case 'cyber':
        ell(hx, hy - R * 0.25, 0, R * 1.1, R * 0.82, R * 1.08, col, 'chrome');
        X.gseg(H(0.15, 0.2, 0.95, 1.08), H(0.85, 0.2, 0.5, 1.08), 1.3, G(o.glow), 1.5, 0.4);
        for (const sd of [-1, 1]) cone([hx + back * R * 0.3, hy - R * 0.6, sd * R * 0.75], [hx + back * (R + 12), hy - R * 1.05, sd * R * 0.95], R * 0.14, col, 'chrome');
        for (let i = 0; i < 3; i++) glowSph(hx + back * R * 0.6, hy - R * 0.1 + i * 3.4, R * 0.75, 1, G(o.glow), 1.2, 0.8); break;
      case 'galea':
        ell(hx, hy - R * 0.25, 0, R * 1.08, R * 0.8, R * 1.08, col, 'metal');
        X.disc(hx, hy - R - 2, 0, R * 1.15, 3.2, C(o.crest), 'fur', null, false);
        for (const sd of [-1, 1]) box(hx + face * R * 0.35, hy + R * 0.18, sd * R * 0.82, R * 0.55, R * 0.62, 2.6, col, 'metal');
        box(...H(0.62, -0.1, 0.72, 1.04), 3, R * 0.75, 2, col, 'metal', NI); break;
      case 'winged':
        ell(hx, hy - R * 0.3, 0, R * 1.06, R * 0.72, R * 1.06, col, 'gold');
        for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const fl = Math.sin(t * 0.12 + sd + k) * 1.4; ell(hx + back * (2 + k * 3), hy - R * 0.5 - k * 4 + fl, sd * (R + 2 + k * 2.2), 8 - k * 1.4, 2.4, 1.4, C(o.wing), 'silk', NI); }
        box(...H(0.7, 0.1, 0.65, 1.04), 2.4, R * 0.7, 2, col, 'gold', NI); break;
      case 'space': {
        const it = ell(hx, hy - R * 0.05, 0, R * 1.42, R * 1.42, R * 1.42, C(o.glass), 'gloss', { alpha: 0.32, emis: 0.2, noInk: true }); it.rimK = 1.4; it.rimCol = [0.8, 0.95, 1];
        torus(hx, hy + R * 1.05, 0, R * 1.1, col, 0, 'gloss', null, R * 0.9);
        X.cyl([hx + back * R * 0.6, hy - R * 1.2, -R * 0.3], [hx + back * R * 0.8, hy - R * 1.9, -R * 0.3], 0.6, col, 'metal', NI); glowSph(hx + back * R * 0.8, hy - R * 1.95, -R * 0.3, 1.8, G('#ff3a3a'), (t >> 4) & 1 ? 1.4 : 0.3, 0.8); break; }
      case 'greathelm': {
        const it = ell(hx, hy - R * 0.1, 0, R * 1.06, R * 1.08, R * 1.06, col, 'metal'); it.metal = 0.8;
        box(...H(0.32, 0.08, 0.9, 1.03), R * 1.15, 3, 1, [0.04, 0.04, 0.08], null, NI); box(...H(0.62, -0.2, 0.7, 1.03), 2, R * 0.5, 1, [0.04, 0.04, 0.08], null, NI);
        for (let i = 0; i < 6; i++) { const u = i / 5; sph(hx + back * (u * 22), hy - R - 3 - Math.sin(u * Math.PI) * 9 + Math.sin(t * 0.1) * u * 2, -R * 0.2, 3.6 - u * 1.4, C(o.plume), 'silk', NI); } break; }
      case 'vfin':
        ell(hx, hy - R * 0.22, 0, R * 1.1, R * 0.82, R * 1.08, col, 'chrome');
        for (const sd of [-1, 1]) cone(H(0.6, 0.55, 0.72, 1.0), [hx + face * R * 0.7, hy - R * 1.9, sd * R * 1.05], R * 0.13, C(o.fin), 'gold');
        for (const sd of [0.15, 0.55]) { const q = H(sd + 0.12, 0.15, 0.9, 1.06); X.gseg(q, [q[0] + face * 3, q[1], q[2]], 1.3, G(o.eye), 1.6, 0.4); }
        for (let i = 0; i < 3; i++) box(...H(0.5, -0.45 - i * 0.12, 0.8, 1.02), R * 0.5, 1.2, 1, col, 'chrome', NI); break;
      case 'aviator':
        ell(hx, hy - R * 0.35, 0, R * 1.08, R * 0.72, R * 1.08, col, 'cloth');
        for (const sd of [-1, 1]) ell(hx - face * R * 0.1, hy + R * 0.2, sd * R * 0.92, R * 0.45, R * 0.6, R * 0.2, col, 'cloth');
        for (const sx of [0.1, 0.55]) { const q = H(sx + 0.1, 0.62, 0.78, 1.04); torus(q[0], q[1], q[2], R * 0.28, C('#5a3a22'), Math.PI / 2, 'metal', NI); glowSph(q[0], q[1], q[2] + 0.4, R * 0.22, G(o.glass), 0.8, -1); } break;
    }
  },
  hat(o, X) {
    const { hx, hy, R, face, back, t, ell, box, cone, torus, sph, glowSph, C, G, H, NI } = X, col = C(o.col);
    switch (o.k) {
      case 'jingasa': cone([hx, hy - R * 0.62, 0], [hx, hy - R * 1.5, 0], R * 2.05, col, 'cloth'); torus(hx, hy - R * 0.62, 0, R * 2.0, C(o.trim), 0, 'metal', NI, R * 1.0); sph(hx, hy - R * 1.52, 0, 2.2, C(o.trim), 'metal', NI); break;
      case 'phones': torus(hx, hy - 1, 0, R + 3, col, Math.PI / 2, 'plastic', NI, R + 3);
        for (const sd of [-1, 1]) { X.disc(hx, hy + 1, sd * (R + 2), 6, 3, col, 'gloss'); glowSph(hx, hy + 1, sd * (R + 5), 3, G(o.glow), 1.1, 0.8); } break;
      case 'top': X.disc(hx, hy - R * 0.68, 0, R * 1.5, 2.6, col, 'cloth', null, true); X.cyl([hx, hy - R * 0.7, 0], [hx, hy - R * 2.15, 0], R * 0.82, col, 'cloth');
        X.cyl([hx, hy - R * 0.78, 0], [hx, hy - R * 1.05, 0], R * 0.85, C(o.band), 'brass', NI); break;
      case 'jester': torus(hx, hy - R * 0.55, 0, R * 1.05, C(o.alt), 0, 'silk', NI, R * 0.9);
        for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.9, sw = Math.sin(t * 0.12 + i) * 3, b = [hx + Math.sin(a) * R * 0.6, hy - R * 0.8, Math.cos(a) * R * 0.2 - R * 0.2], m = [hx + Math.sin(a) * R * 1.4, hy - R * 1.9, -R * 0.2], e = [hx + Math.sin(a) * R * 1.9 + sw, hy - R * 1.2, -R * 0.3];
          X.seg(b, m, R * 0.32, i % 2 ? C(o.alt) : col, 'silk'); cone(m, e, R * 0.26, i % 2 ? C(o.alt) : col, 'silk'); sph(e[0], e[1], e[2], 3, C('#ffcf3a'), 'gold', NI); } break;
      case 'nemes': ell(hx - face * 1, hy - R * 0.35, -R * 0.05, R * 1.16, R * 0.86, R * 1.12, col, 'gold');
        for (let k = 0; k < 4; k++) torus(hx - face * 1, hy - R * (0.95 - k * 0.22), -R * 0.05, R * (0.6 + k * 0.17), C(o.stripe), 0, 'gloss', NI, R * (0.5 + k * 0.15));
        for (const sd of [-1, 1]) { box(hx - face * R * 0.15, hy + R * 0.9, sd * R * 1.0, R * 0.7, R * 1.6, 2.4, col, 'gold'); for (let k = 0; k < 3; k++) box(hx - face * R * 0.15, hy + R * (0.4 + k * 0.4), sd * R * 1.02, R * 0.72, 2, 2.6, C(o.stripe), null, NI); }
        cone(H(0.85, 0.55, 0.6, 1.05), H(1.1, 0.95, 0.55, 1.2), R * 0.1, C('#ffcf3a'), 'gold'); glowSph(...H(1.1, 0.98, 0.55, 1.22), 1.6, G('#ff2f57'), 1.2, 0.8); break;
      case 'hood': { ell(hx + back * 1, hy - R * 0.12, -R * 0.1, R * 1.16, R * 1.1, R * 1.05, col, 'cloth');
        cone(H(-0.2, 0.55, -0.2, 0.75), [hx + back * (R + 12), hy - R - 12, -R * 0.3], R * 0.5, col, 'cloth');
        box(...H(0.4, 0, 0.88, 1.0), R * 1.2, R * 1.05, 1.5, [0.01, 0.01, 0.02], null, NI); break; }          // the face lost in shadow (a 'gaze' visor glows in front of it)
      case 'witch': X.disc(hx, hy - R * 0.7, 0, R * 2.0, 1.8, col, 'cloth', null, true); torus(hx, hy - R * 0.85, 0, R * 0.92, C(o.band), 0, 'cloth', NI, R * 0.5);
        cone([hx, hy - R * 0.72, 0], [hx + back * 6, hy - R * 2.1, 0], R * 0.9, col, 'cloth'); cone([hx + back * 6, hy - R * 2.1, 0], [hx + back * 14 + Math.sin(t * 0.08) * 2, hy - R * 2.5, 0], R * 0.32, col, 'cloth');
        sph(hx + face * R * 0.4, hy - R * 0.88, R * 0.82, 2.4, C(o.band), 'gold', NI); break;
    }
  },
  crown(o, X) {
    const { hx, hy, R, face, back, t, ell, box, cone, torus, sph, glowSph, glowIt, C, G, H, NI } = X, col = C(o.col), top = hy - R * 0.9;
    switch (o.k) {
      case 'flower': for (const [ox, oy, oz, sc] of [[back * R * 0.55, -R * 0.55, R * 0.72, 1], [face * R * 0.2, -R * 0.95, R * 0.25, 0.6], [back * R * 0.8, -R * 0.1, R * 0.82, 0.55]]) {
          for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ell(hx + ox + Math.cos(a) * 4 * sc, hy + oy + Math.sin(a) * 4 * sc, oz, 3.6 * sc, 2.2 * sc, 1.2, col, 'silk', NI); }
          glowSph(hx + ox, hy + oy, oz + 0.6, 2 * sc, G(o.core), 1.2, 0.8); } break;
      case 'cube': { const p = X.P(hx, top - 12 + Math.sin(t * 0.06) * 2, 0), it = glItem(GL3D.mesh.box), B = X.rb(t * 0.04, t * 0.03, 7 * X.s); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]); glowIt(it, G(o.col), 0.55, -1.2);
        for (let i = 0; i < 4; i++) { const a = t * 0.06 + i * TAU / 4; X.oct(hx + Math.cos(a) * 12, top - 12, Math.sin(a) * 12, 1.8, 1.8, 1.8, G(o.col), null, null, a, a, 1.3); } break; }
      case 'laurel': for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const ph = 0.25 + i / 6 * (Math.PI - 0.5);   // leaves round the brow from the forehead to the back of the head, both sides
          ell(hx + face * Math.cos(ph) * R * 1.02, hy - R * 0.5 - Math.sin(ph) * 2 - (i % 2) * 1.6, sd * Math.sin(ph) * R * 1.0, 4, 1.8, 2.2, col, 'gold', NI); } break;
      case 'flame': for (let i = 0; i < 5; i++) { const u = i / 4 - 0.5, h = (12 + (0.5 - Math.abs(u)) * 14) * (0.8 + 0.2 * Math.sin(t * 0.35 + i * 1.7)), sw = Math.sin(t * 0.2 + i) * 3 + back * 3;
          X.gseg([hx + u * R * 1.5, hy - R * 0.6, 0], [hx + u * R * 1.5 + sw, hy - R - h, 0], 5, G(o.col), 1.2, 0.5, GL3D.mesh.cone); X.gseg([hx + u * R * 1.5, hy - R * 0.6, 1], [hx + u * R * 1.5 + sw * 0.5, hy - R - h * 0.5, 1], 2.6, G(o.core), 1.4, 0.5, GL3D.mesh.cone); } break;
      case 'ice': for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.36; X.oct(hx + Math.cos(a) * R * 0.8, hy + Math.sin(a) * R * 0.8 - (2 - Math.abs(i - 2)) * 4, 0, 3, 10 + (2 - Math.abs(i - 2)) * 5, 3, col, 'ice', { emis: 0.35 }, 0, a + Math.PI / 2); } break;
      case 'leaf': torus(hx, hy - R * 0.55, 0, R * 1.04, C('#3f6a2a'), 0, 'cloth', NI, R * 0.9);
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ell(hx + Math.cos(a) * R * 1.05, hy - R * 0.6, Math.sin(a) * R * 1.0, 4.4, 1.6, 2.6, col, 'cloth', NI); }
        cone([hx, top, 0], [hx + back * 6, top - 10, 0], 1.2, C('#3f6a2a'), 'cloth', NI); ell(hx + back * 8, top - 12, 0, 5, 2.4, 2, col, 'cloth'); break;
      case 'coral': for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.5, b = [hx + Math.sin(a) * R * 0.5, hy - R * 0.85, Math.cos(a) * R * 0.3], m = [b[0] + Math.sin(a) * 6, b[1] - 9, b[2]], e1 = [m[0] + 4, m[1] - 7, m[2]], e2 = [m[0] - 4, m[1] - 6, m[2]];
          X.seg(b, m, 1.8, col, 'gloss'); X.seg(m, e1, 1.3, col, 'gloss'); X.seg(m, e2, 1.2, col, 'gloss'); sph(e1[0], e1[1], e1[2], 1.6, col, 'gloss', NI); } break;
      case 'star': { const bob = Math.sin(t * 0.06) * 2, p = X.P(hx, top - 14 + bob, 0), it = glItem(GL3D.mesh.star), B = X.rb(t * 0.03, 0, 6 * X.s); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]); glowIt(it, G(o.col), 1.5, 0.6);
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + t * 0.02; X.oct(hx + Math.cos(a) * R * 0.9, top - 2, Math.sin(a) * R * 0.9, 1.4, 2.6, 1.4, G(o.col), null, null, 0, 0, 1.4); } break; }
      case 'royal': ell(hx, hy - R * 0.72, 0, R * 0.78, R * 0.42, R * 0.78, C('#8a1a2a'), 'cloth'); torus(hx, hy - R * 0.62, 0, R * 0.98, col, 0, 'gold', null, R * 0.7);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, x = hx + Math.cos(a) * R * 0.95, z = Math.sin(a) * R * 0.95; cone([x, hy - R * 0.7, z], [x, hy - R * 1.45, z], R * 0.18, col, 'gold'); sph(x, hy - R * 1.5, z, 1.8, col, 'gold', NI); }
        for (let i = 0; i < 3; i++) glowSph(...H(0.2 + i * 0.25, 0.58, 0.85, 1.06), 1.8, G(i === 1 ? o.gem : '#3a8aff'), 1.3, 0.8); break;
      case 'tiara': for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; cone(H(0.3 + a * 0.6, 0.62, 0.75, 0.98), H(0.3 + a * 0.6, 0.62 + (2 - Math.abs(i - 2)) * 0.12 + 0.12, 0.72, 1.12), R * 0.08, col, 'metal', NI); }
        torus(hx, hy - R * 0.62, 0, R * 1.02, col, 0, 'metal', NI, R * 0.4); X.oct(...H(0.3, 0.88, 0.75, 1.12), 2.4, 3.6, 1.6, G(o.gem), null, null, 0, 0, 1.6); break;
    }
  },
  horns(o, X) {
    const { hx, hy, R, face, back, cone, sph, C, NI } = X, col = C(o.col);
    for (const sd of [-1, 1]) {
      const b = [hx + face * R * 0.2, hy - R * 0.72, sd * R * 0.5];
      switch (o.k) {
        case 'oni': cone(b, [hx + face * R * 0.35 + back * 2, hy - R - 15, sd * R * 0.72], R * 0.2, col, 'gloss'); break;
        case 'bull': { const m = [hx, hy - R * 0.9, sd * (R + 9)], e = [hx + face * 6, hy - R - 12, sd * (R + 14)]; X.seg(b, m, R * 0.22, col, 'gloss'); cone(m, e, R * 0.2, col, 'gloss'); break; }
        case 'dragon': { const m = [hx + back * 8, hy - R - 6, sd * R * 0.62], e = [hx + back * 20, hy - R - 2, sd * R * 0.7]; X.seg(b, m, R * 0.2, col, 'gloss'); cone(m, e, R * 0.18, col, 'gloss');
          cone([hx + back * R * 0.5, hy - R * 0.4, sd * R * 0.8], [hx + back * (R + 8), hy - R * 0.5, sd * R * 0.9], R * 0.12, col, 'gloss'); break; }
        case 'antlers': { const m = [hx + back * 2, hy - R - 12, sd * (R + 4)], e = [hx + back * 6, hy - R - 26, sd * (R + 10)]; X.seg(b, m, 1.8, col, 'stone'); X.seg(m, e, 1.5, col, 'stone');
          for (const [u, l] of [[0.4, 9], [0.7, 7], [1, 5]]) { const p = [b[0] + (e[0] - b[0]) * u, b[1] + (e[1] - b[1]) * u, b[2] + (e[2] - b[2]) * u]; cone(p, [p[0] + face * l, p[1] - l * 0.6, p[2] + sd * 2], 1.2, col, 'stone'); }
          sph(e[0], e[1], e[2], 1.4, col, 'stone', NI); break; }
      }
    }
  },
  ears(o, X) {
    const { hx, hy, R, face, back, t, cone, ell, C, NI } = X, col = C(o.col), inner = C(o.inner);
    for (const sd of [-1, 1]) {
      const b = [hx + sd * R * 0.5 * 0 + back * 1, hy - R * 0.65, sd * R * 0.55];
      if (o.k === 'bunny') { const bend = sd > 0 ? Math.sin(t * 0.08) * 0.3 + 0.4 : 0, L = R * 1.7; ell(hx + back * (2 + bend * 8), hy - R - L * 0.45 + bend * 6, sd * R * 0.5, R * 0.3, L * 0.55, R * 0.18, col, 'fur');
        ell(hx + back * (2 + bend * 8) + face * 0.6, hy - R - L * 0.45 + bend * 6, sd * R * 0.5 + 0.5, R * 0.16, L * 0.42, R * 0.08, inner, 'fur', NI); continue; }
      const tall = o.k === 'fox' ? 15 : o.k === 'wolf' ? 12 : 8, w = o.k === 'cat' ? 0.32 : 0.28, tp = [hx + back * 3, hy - R - tall, sd * R * 0.62];
      cone(b, tp, R * w, col, 'fur'); cone([b[0] + face * 1, b[1], b[2] + sd * 0.4], [tp[0] + face * 1, tp[1] + 4, tp[2]], R * w * 0.5, inner, 'fur', NI);
    }
  },
  mask(o, X) {
    const { hx, hy, R, face, back, t, ell, box, cone, torus, sph, glowSph, C, G, H, NI } = X, col = C(o.col), hy0 = X.hy0;
    switch (o.k) {
      case 'mempo': ell(hx + face * R * 0.2, hy0 + R * 0.42, R * 0.25, R * 0.95, R * 0.48, R * 0.88, col, 'metal');
        for (let i = 0; i < 3; i++) box(...H(0.55, -0.3 - i * 0.12, 0.8, 1.04).map((v, j) => j === 1 ? v + (hy0 - hy) : v), R * 0.5, 1.2, 1, C('#ffcf3a'), null, NI); break;
      case 'oni': { ell(hx + face * R * 0.25, hy0 + R * 0.05, R * 0.3, R * 1.0, R * 1.0, R * 0.9, col, 'gloss');
        for (const sd of [0.15, 0.6]) glowSph(hx + face * R * (sd * 1.2), hy0 - R * 0.12, R * 0.95, 2.4, G('#ffd23a'), 1.4, 0.8);
        for (const sd of [-1, 1]) cone([hx + face * R * 0.75, hy0 + R * 0.45, sd * R * 0.35 + R * 0.5], [hx + face * R * 0.85, hy0 + R * 0.9, sd * R * 0.4 + R * 0.5], R * 0.12, C(o.fang), 'gloss', NI);
        box(hx + face * R * 0.65, hy0 - R * 0.42, R * 0.88, R * 1.0, 2.2, 1.4, [0.06, 0.02, 0.03], null, NI); break; }
      case 'fox': { const p = [hx + back * R * 0.3, hy0 - R * 0.35, R * 0.75]; ell(p[0], p[1], p[2], R * 0.62, R * 0.7, R * 0.3, col, 'gloss');
        cone([p[0] + face * R * 0.3, p[1] + R * 0.15, p[2] + 2], [p[0] + face * R * 0.75, p[1] + R * 0.3, p[2] + 3], R * 0.25, col, 'gloss');
        for (const sd of [-1, 1]) box(p[0] + sd * R * 0.22, p[1] - R * 0.12, p[2] + R * 0.3, R * 0.32, 1.3, 1, C(o.mark), null, NI, sd * 0.4); break; }
      case 'ring': torus(hx + face * (R + 2), hy0 + R * 0.25, R * 0.45, 3.4, col, Math.PI / 2, 'gold', NI); break;
      case 'pumpkin': { const r2 = R * 1.3, cy = hy0 - R * 0.05;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; ell(hx + Math.cos(a) * r2 * 0.42, cy, Math.sin(a) * r2 * 0.42, r2 * 0.62, r2 * 0.86, r2 * 0.62, col, 'gloss'); }
        X.cyl([hx, cy - r2 * 0.8, 0], [hx + back * 3, cy - r2 * 1.15, 0], 2.2, C('#3a6a1e'), 'cloth');
        for (const sd of [0.1, 0.62]) X.oct(hx + face * r2 * (sd * 1.1), cy - r2 * 0.18, r2 * 0.95, 3.2, 3.2, 1, G(o.glow), null, null, 0, 0, 1.6);
        for (let i = 0; i < 4; i++) X.oct(hx + face * r2 * (0.1 + i * 0.16), cy + r2 * 0.32 + (i % 2) * 2, r2 * 0.93, 2.2, 2.2, 1, G(o.glow), null, null, 0, 0, 1.5);
        glowSph(hx, cy, 0, r2 * 0.7, G(o.glow), 0.25, -1.2); break; }
      case 'fangs': for (const k of [2, 7]) cone(H(0.55, -0.4, 0.75, 0.92).map((v, j) => j === 1 ? v + (hy0 - hy) : v), [hx + face * (k + 1.5), hy0 + R * 0.4 + 6, R * 0.7], 1.4, col, 'gloss', NI); break;
    }
  },
  visor(o, X) {
    const { hx, R, face, t, box, torus, ell, glowSph, C, G, NI } = X, hy0 = X.hy0, F = (fx, up, cz, k) => { const v = V3.norm([face * fx, -up, cz]), kk = (k || 1) * R; return [hx + v[0] * kk, hy0 + v[1] * kk, v[2] * kk]; };
    switch (o.k) {
      case 'band': { const p = F(0.35, 0.18, 0.85, 1.0); box(p[0], p[1], p[2], R * 1.6, R * 0.38, 5, C(o.col), 'gloss', { metal: 0.4 }); X.gseg([p[0] - face * R * 0.55, p[1], p[2] + 2.8], [p[0] + face * R * 0.55, p[1], p[2] + 2.8], 1.2, G(o.glow), 1.5, 0.4); break; }
      case 'shades': { const p = F(0.35, 0.15, 0.85, 1.0); box(p[0], p[1], p[2], R * 1.56, R * 0.38, 4, C(o.col), 'gloss', { metal: 0.6 }); X.gseg([p[0] - face * R * 0.7, p[1] - R * 0.18, p[2] + 2.4], [p[0] + face * R * 0.7, p[1] - R * 0.18, p[2] + 2.4], 0.7, G(o.glow), 1, 0.3); break; }
      case 'gaze': for (const sx of [0.62, 0.12]) { const p = F(sx + 0.05, 0.12, sx > 0.3 ? 0.62 : 0.95, 1.1); glowSph(p[0], p[1], p[2] + 0.5, R * 0.16, G(o.glow), 1.8, 0.6); glowSph(p[0], p[1], p[2], R * 0.32, G(o.glow), 0.45, 1.4); } break;
      case 'whiskers': for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const p = F(0.6, -0.15, 0.7, 1.0); X.gseg([p[0], p[1] + i * 2 - 2, p[2] + 1], [p[0] + face * 12, p[1] + i * 3.2 - 4 + sd, p[2] + 1 + sd * 3], 0.45, G(o.glow), 1.2, 0.4); } break;
      case 'goggles': torus(hx, hy0 - R * 0.42, 0, R * 1.03, C('#2a1e14'), 0, 'cloth', NI, R * 0.6);
        for (const sx of [0.1, 0.55]) { const q = F(sx + 0.1, 0.42, 0.85, 1.04); torus(q[0], q[1], q[2], R * 0.3, C(o.col), Math.PI / 2, 'brass', NI); glowSph(q[0], q[1], q[2] + 0.5, R * 0.24, G(o.glow), 0.9, -1); } break;
      case 'headset': torus(hx, hy0 - 1, 0, R + 2.5, C(o.col), Math.PI / 2, 'plastic', NI, R + 2.5); ell(hx, hy0 + 1, R + 1.5, 4, 5.4, 2.6, C(o.col), 'gloss');
        X.gseg([hx, hy0 + 3, R + 2], [hx + face * R * 0.85, hy0 + R * 0.55, R * 0.8], 0.6, C(o.col), 0.4, 0.5); glowSph(hx + face * R * 0.9, hy0 + R * 0.55, R * 0.8, 1.8, G(o.glow), 1.4, 0.8); break;
    }
  },
  snakes(o, X) {
    const { hx, hy, R, back, t, sph, glowSph, C, G, P, NI } = X, col = C(o.col);
    for (let k = 0; k < 7; k++) { const a = (k / 6 - 0.5) * 2.8, pts = [];
      for (let i = 0; i <= 6; i++) { const u = i / 6, w = Math.sin(u * 5 + t * 0.15 + k * 1.3) * 3.5 * u; pts.push(P(hx + Math.sin(a) * (R * 0.7 + u * 14) + back * u * 6 + w, hy - R * 0.6 - Math.cos(a) * u * 12 - u * 6, Math.cos(a) * R * 0.5 - R * 0.3 + w * 0.4)); }
      const it = X.tube(pts, u => (2.4 - u * 1.2) * X.s); if (it) X.dress(it, col, 'slime');
      const e = pts[pts.length - 1], hp = [hx + Math.sin(a) * (R * 0.7 + 14) + back * 6, hy - R * 0.6 - Math.cos(a) * 12 - 6, Math.cos(a) * R * 0.5 - R * 0.3];
      sph(hp[0], hp[1], hp[2], 2.6, col, 'slime', NI); glowSph(hp[0], hp[1] - 0.5, hp[2] + 1.6, 0.8, G(o.eye), 1.6, 0.8); void e; }
  },
  headRing(o, X) { const { hx, hy, R, t, torus, ell, C } = X; const p = X.P(hx, hy - R * 0.2, 0), it = glItem(GL3D.mesh.torus), a = t * 0.01, r = R * 1.85, tl = 0.38;
    M4.basis(it.m, p[0], p[1], p[2], X.U(Math.cos(a) * r, Math.sin(tl) * r * 0.25, Math.sin(a) * r), X.U(0, r * 0.05, 0), X.U(-Math.sin(a) * r, 0, Math.cos(a) * r)); X.glowIt(it, X.G(o.col), 0.9, 0.5);
    torus(hx, hy - R * 0.2, 0, R * 1.5, C(o.col), 0.38, 'gold', X.NI, R * 0.1); void ell; },
  halo(o, X) {
    const { hx, hy, R, back, t, sph, glowSph, glowIt, torus, C, G, P, NI } = X;
    switch (o.k) {
      case 'branch': { const pts = [[back * R * 1.3, R * 0.6], [back * R * 0.9, -R * 0.6], [back * 0.2, -R * 1.4], [-back * R * 0.8, -R * 1.2]]; for (let i = 0; i < 3; i++) X.seg([hx + pts[i][0], hy + pts[i][1], -R * 0.8], [hx + pts[i + 1][0], hy + pts[i + 1][1], -R * 0.8], 1.6 - i * 0.3, C(o.col), 'cloth');
        for (let i = 0; i < 9; i++) { const u = i / 8, q = pts[Math.min(2, Math.floor(u * 3))], q2 = pts[Math.min(3, Math.floor(u * 3) + 1)], f = u * 3 % 1; sph(hx + q[0] + (q2[0] - q[0]) * f + Math.sin(i * 2.1) * 4, hy + q[1] + (q2[1] - q[1]) * f + Math.cos(i * 1.7) * 4, -R * 0.75, 2.4, C(o.bloom), 'silk', NI); } break; }
      case 'storm': for (let i = 0; i < 5; i++) sph(hx + (i - 2) * R * 0.45, hy - R - 12 - (2 - Math.abs(i - 2)) * 3 + Math.sin(t * 0.05 + i) * 1.5, -R * 0.2, 6.5, C(o.col), 'cloth', { noInk: true, emis: 0.12 });
        if ((t + X.f.id * 11) % 70 < 8) { let px = hx + back * 4, py = hy - R - 10; for (let k = 0; k < 3; k++) { const nx = px + (k % 2 ? 5 : -5), ny = py + 6; X.gseg([px, py, 0], [nx, ny, 0], 0.9, G(o.bolt), 1.8, 0.3); px = nx; py = ny; } } break;
      case 'void': { const p = P(hx + back * 3, hy - 2, -R * 0.75), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], X.D(R + 6, 0, 0), X.D(0, 0, 1.2), X.D(0, R + 6, 0)); X.dress(it, [0.01, 0.0, 0.02], 'obsidian');
        torus(hx + back * 3, hy - 2, -R * 0.7, R + 7, G(o.col), Math.PI / 2, 'energy', { emis: 1, noInk: true }, R + 7); glowSph(hx + back * 3, hy - 2, -R * 0.8, R + 10, G(o.col), 0.4, -1.6); break; }
      case 'ring': { const p = P(hx + back * 3, hy - 3, -R * 0.7), it = glItem(GL3D.mesh.torus), r = R * 1.55; M4.basis(it.m, p[0], p[1], p[2], X.D(r, 0, 0), X.D(0, 0, r * 0.06), X.D(0, r, 0)); glowIt(it, G(o.col), 1, 0.5);
        for (let i = 0; i < 6; i++) { const a = t * 0.012 + i * TAU / 6; glowSph(hx + back * 3 + Math.cos(a) * r, hy - 3 + Math.sin(a) * r, -R * 0.7, 1.6, [1, 1, 1], 1.3, 0.8); } break; }
    }
  },
  /* ================= on the back ================= */
  backWeapon(o, X) {
    const { ty, th, tw, bw, back, face, t, cone, box, sph, glowSph, torus, C, G, NI } = X, z = -bw * 0.6, bx = back * tw * 0.35;
    const A = (u, L, ang) => [bx + Math.cos(ang) * L * u * back, ty + Math.sin(ang) * L * u, z];                     // along a diagonal line across the back
    switch (o.k) {
      case 'katana2': for (const [ang, L] of [[-2.1, 54], [-2.45, 46]]) { X.cyl(A(-0.25, L, ang), A(0, L, ang), 1.6, C(o.hilt), 'cloth'); box(...A(0, L, ang), 3, 9, 3, C('#c9a24a'), 'metal', null, ang); X.cyl(A(0, L, ang), A(1, L, ang), 1.1, C(o.col), 'metal'); } break;
      case 'yari': X.cyl(A(-0.5, 90, -2.2), A(0.75, 90, -2.2), 1.4, C(o.col), 'cloth'); cone(A(0.75, 90, -2.2), A(0.92, 90, -2.2), 2.8, C(o.tip), 'metal'); break;
      case 'kanabo': X.dress(glSegment(X.P(...A(-0.3, 60, -2.0)), X.P(...A(0.75, 60, -2.0)), 2.6 * X.s, 7 * X.s, GL3D.mesh.taper), C(o.col), 'metal');
        for (let i = 0; i < 6; i++) { const q = A(0.4 + i * 0.07, 60, -2.0); sph(q[0] + (i % 2 ? 3 : -3), q[1], q[2] + 4, 1.7, C('#d8d8e0'), 'metal', NI); } break;
      case 'saber': X.cyl(A(-0.1, 40, -2.3), A(0.2, 40, -2.3), 2, C('#2a2e3a'), 'metal'); X.gseg(A(0.2, 40, -2.3), A(1.2, 40, -2.3), 2.2, G(o.col), 1.3, 0.6, GL3D.mesh.cylCap); X.gseg(A(0.2, 40, -2.3), A(1.2, 40, -2.3), 0.9, [1, 1, 1], 1.4, 0.4, GL3D.mesh.cylCap); break;
      case 'aspis': X.disc(back * tw * 0.42, ty - th * 0.05, z - 2, tw * 0.62, 3, C(o.col), 'metal'); torus(back * tw * 0.42, ty - th * 0.05, z - 0.5, tw * 0.62, C(o.col), Math.PI / 2, 'gold', NI);
        X.disc(back * tw * 0.42, ty - th * 0.05, z - 4, tw * 0.22, 1, C(o.emblem), 'gloss', NI); break;
      case 'labrys': { X.cyl(A(-0.3, 70, -2.0), A(0.8, 70, -2.0), 1.6, C(o.haft), 'cloth'); const h = A(0.7, 70, -2.0);
        for (const sd of [-1, 1]) X.ell(h[0] + sd * 9, h[1] - 2, h[2], 8, 11, 1.6, C(o.col), 'metal'); break; }
      case 'scepter': X.cyl(A(-0.4, 70, -2.3), A(0.65, 70, -2.3), 1.4, C(o.col), 'gold'); { const h = A(0.72, 70, -2.3); sph(h[0], h[1], h[2], 4.2, C(o.col), 'gold'); glowSph(h[0], h[1] - 5, h[2], 3, G(o.gem), 1.5, 0.7);
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; cone([h[0] + Math.cos(a) * 4, h[1] - 3, h[2] + Math.sin(a) * 4], [h[0] + Math.cos(a) * 5, h[1] - 9, h[2] + Math.sin(a) * 5], 1, C(o.col), 'gold', NI); } } break;
      case 'ankh': { const cx = back * tw * 0.45, cy = ty - th * 0.1; box(cx, cy + 8, z, 4.4, 26, 3, C(o.col), 'gold'); box(cx, cy - 1, z, 20, 4.4, 3, C(o.col), 'gold');
        torus(cx, cy - 10, z, 6.5, C(o.col), Math.PI / 2, 'gold', null, 8.5); glowSph(cx, cy - 1, z - 2, 2.4, X.selfC, 1.2, 0.8); break; }
      case 'scythe': { X.cyl(A(-0.45, 96, -2.15), A(0.75, 96, -2.15), 1.3, C(o.haft), 'cloth'); const h = A(0.75, 96, -2.15);
        for (let i = 0; i < 6; i++) { const a0 = -0.3 + i * 0.24, a1 = a0 + 0.24, r0 = 30 - i * 3, r1 = 30 - (i + 1) * 3; cone([h[0] + back * Math.cos(a0) * r0 * 0.9, h[1] + Math.sin(a0) * 10 - i * 1.2, h[2]], [h[0] + back * Math.cos(a1) * r1 * 0.9, h[1] + Math.sin(a1) * 10 - (i + 1) * 1.2, h[2]], 2.6 - i * 0.35, C(o.col), 'metal'); }
        X.gseg([h[0], h[1], h[2] + 1], [h[0] + back * 26, h[1] - 6, h[2] + 1], 0.6, X.selfC, 0.9, 0.4); break; }
      case 'broom': X.cyl(A(-0.6, 84, -2.6), A(0.6, 84, -2.6), 1.3, C(o.col), 'cloth'); cone(A(-0.45, 84, -2.6), A(-0.85, 84, -2.6), 7, C(o.bristle), 'cloth'); torus(...A(-0.48, 84, -2.6), 3, C('#3a2a1a'), Math.PI / 2, 'cloth', NI); break;
    }
    void face; void t;
  },
  pack(o, X) {
    const { ty, th, tw, bw, back, face, t, box, sph, cone, torus, glowSph, C, G, P, NI, hx, hy, R, onGround } = X, bx = back * (tw * 0.5 + 6), z = -bw * 0.15;
    switch (o.k) {
      case 'cables': box(bx, ty - th * 0.15, z, 10, 18, 14, C(o.col), 'metal');
        for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push(P(hx + back * (R * 0.6 + u * 8) + (bx - hx - back * R * 0.6) * u * u, hy + R * 0.2 + (ty - th * 0.3 - hy) * u + Math.sin(u * Math.PI) * 6 + k * 2, -R * 0.3 + (z + k * 3 - 3 + R * 0.3) * u)); }
          const it = X.tube(pts, () => 0.9 * X.s); if (it) X.glowIt(it, G(o.glow), 0.6, 0.6); } break;
      case 'astro': box(bx, ty - th * 0.1, z, 12, 26, 20, C(o.col), 'gloss'); for (const sd of [-1, 1]) X.cyl([bx + back * 6, ty - th * 0.4, z + sd * 6], [bx + back * 6, ty + th * 0.3, z + sd * 6], 3.4, C('#b8bcc8'), 'metal');
        glowSph(bx + back * 1, ty - th * 0.38, z + 10.5, 1.6, G(o.glow), (t >> 4) & 1 ? 1.5 : 0.4, 0.8); break;
      case 'gears': { const gm = sgMesh('skin:gear', () => gearGeo(12)); for (const [gx, gy, r, dir] of [[bx, ty - th * 0.2, 9, 1], [bx + back * 5, ty + th * 0.2, 6, -1], [bx - back * 3, ty - th * 0.55, 5, -1]]) {
          const p = P(gx, gy, z - 4), it = glItem(gm), a = t * 0.05 * dir, ca = Math.cos(a) * r * X.s, sa = Math.sin(a) * r * X.s; M4.basis(it.m, p[0], p[1], p[2], X.D(ca, sa, 0), X.D(0, 0, -3), X.D(-sa, ca, 0)); X.dress(it, C(o.col), 'brass'); }
        X.cyl([bx + back * 2, ty - th * 0.5, z], [bx + back * 2, ty - th * 1.05, z], 2.2, C(o.col), 'brass'); for (let i = 0; i < 3; i++) { const u = ((t * 0.02 + i / 3) % 1); glowSph(bx + back * (2 + u * 6), ty - th * 1.05 - u * 18, z, 2 + u * 4, [0.85, 0.85, 0.9], (1 - u) * 0.35, -1.2); } break; }
      case 'antenna': box(bx, ty - th * 0.1, z, 9, 16, 14, C(o.col), 'metal'); X.cyl([bx, ty - th * 0.3, z], [bx + back * 4, ty - th * 1.6, z], 0.7, C(o.col), 'metal', NI); glowSph(bx + back * 4, ty - th * 1.62, z, 2, G(o.glow), (t >> 3) & 1 ? 1.5 : 0.5, 0.8);
        cone([bx + back * 3, ty - th * 0.45, z + 6], [bx + back * 9, ty - th * 0.55, z + 8], 5, C('#d8dce8'), 'metal'); break;
      case 'rocket': for (const sd of [-1, 1]) { const zz = z + sd * 6; X.cyl([bx, ty - th * 0.4, zz], [bx, ty + th * 0.35, zz], 4, C(o.col), 'chrome'); cone([bx, ty - th * 0.4, zz], [bx, ty - th * 0.7, zz], 4, C(o.fin), 'gloss');
          box(bx + back * 4, ty + th * 0.3, zz, 6, 6, 1.4, C(o.fin), 'gloss', NI);
          if (!onGround || X.f.jetT > 0 || X.f.hoverOn > 0) X.gseg([bx, ty + th * 0.4, zz], [bx, ty + th * 0.4 + 14 + Math.random() * 8, zz], 3.2, G('#ffb84d'), 1.4, 0.6, GL3D.mesh.cone); } break;
      case 'cannon': { const sh = X.S.shB, cx = sh[0] + back * 2, cy = sh[1] - 12; box(cx, cy + 4, -bw * 0.45, 10, 8, 10, C(o.col), 'metal');
        X.cyl([cx - face * 4, cy, -bw * 0.45], [cx + face * 24, cy - 3, -bw * 0.45], 3.4, C(o.col), 'metal'); torus(cx + face * 24, cy - 3, -bw * 0.45, 3.6, C('#20242e'), 0, 'metal', NI);
        glowSph(cx + face * 25, cy - 3, -bw * 0.45, 2.4, X.selfC, 0.8 + 0.4 * Math.sin(t * 0.2), 0.8); break; }
    }
    void cone; void sph;
  },
  tail(o, X) {
    const { ty, th, tw, bw, back, face, t, sph, cone, glowSph, C, G, P, NI } = X, b = [back * tw * 0.35, ty + th * 0.38, -bw * 0.25], col = C(o.col);
    const tailTube = (curve, r0, r1, colr, mk, emis) => { const pts = []; for (let i = 0; i <= 7; i++) { const u = i / 7, q = curve(u); pts.push(P(q[0], q[1], q[2])); }
      const it = X.tube(pts, u => (r0 + (r1 - r0) * u) * X.s); if (it) X.dress(it, colr, mk, emis ? { emis } : null); return pts; };
    switch (o.k) {
      case 'fox9': for (let k = 0; k < 9; k++) { const a = (k / 8 - 0.5) * 1.8, sw = Math.sin(t * 0.08 + k) * 4;
          tailTube(u => [b[0] + back * u * 26 * Math.cos(a * 0.6), b[1] - u * 22 * Math.cos(a) + Math.sin(u * 3 + t * 0.1 + k) * 2, b[2] + u * 18 * Math.sin(a) - u * 6 + sw * u * 0.5], 2.4, 4.6, col, 'fur');
          sph(b[0] + back * 26 * Math.cos(a * 0.6), b[1] - 22 * Math.cos(a), b[2] + 18 * Math.sin(a) - 6 + sw * 0.5, 3.6, C(o.tip), 'fur', NI); } break;
      case 'wolf': tailTube(u => [b[0] + back * u * 28, b[1] + u * 10 - Math.sin(u * Math.PI) * 6 + Math.sin(t * 0.1) * u * 3, b[2] - u * 4], 3, 6.2, col, 'fur'); sph(b[0] + back * 30, b[1] + 10, b[2] - 4, 4.8, C(o.tip), 'fur', NI); break;
      case 'dragon': { const pts = tailTube(u => [b[0] + back * u * 46, b[1] + u * 16 - Math.sin(u * Math.PI) * 10 + Math.sin(t * 0.07 + u * 4) * u * 4, b[2] - u * 8], 6, 1.2, col, 'gloss');
        for (let i = 1; i < 7; i++) { const u = i / 7, q = [b[0] + back * u * 46, b[1] + u * 16 - Math.sin(u * Math.PI) * 10 + Math.sin(t * 0.07 + u * 4) * u * 4, b[2] - u * 8]; cone([q[0], q[1] - (5.5 - u * 4.5), q[2]], [q[0] + back * 2, q[1] - (10 - u * 6), q[2]], 2.2 - u * 1.2, C(o.spike), 'gloss'); } void pts; break; }
      case 'cat': { const sw = Math.sin(t * 0.09) * 6; tailTube(u => [b[0] + back * (u * 18 + Math.sin(u * 2) * 4), b[1] - u * 34 + u * u * 6, b[2] - u * 4 + sw * u * u * 0.4], 1.8, 1.4, col, 'gloss');
        glowSph(b[0] + back * (18 + Math.sin(2) * 4), b[1] - 28, b[2] - 4 + sw * 0.4, 2.2, G(o.tip), 1.2, 0.8); break; }
      case 'pom': sph(b[0] + back * 4, b[1] - 2, b[2] - 2, 6.2, col, 'fur', NI); break;
    }
    void face; void glowSph;
  },
  wings(o, X) {
    const { ty, th, tw, bw, back, face, t, box, ell, cone, glowSph, C, G, P, onGround, NI } = X, air = !onGround, x0 = back * tw * 0.2, y0 = ty - th * 0.3;
    if (o.k === 'feather') { const flap = air ? Math.sin(t * 0.3 + X.f.id) * 0.5 + 0.5 : 0.2 + Math.sin(t * 0.05) * 0.05, spread = 0.35 + flap * 0.6;
      for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { const a = -0.3 - spread * 0.9 + k * 0.16, len = 30 + k * 4 - (k > 4 ? (k - 4) * 7 : 0), dx = Math.cos(a) * back, dy = Math.sin(a);
        box(x0 + dx * len * 0.5, y0 + dy * len * 0.5, -bw * 0.55 + sd * bw * 0.28, len, 6.4 - k * 0.4, 2.2, k > 4 ? C(o.tip) : C(o.col), 'silk', null, Math.atan2(dy, dx)); } return; }
    if (o.k === 'bat') { const sc = o.small ? 0.65 : 1, flap = air ? Math.sin(t * 0.32) * 0.35 : Math.sin(t * 0.06) * 0.08;
      for (const sd of [-1, 1]) { const z = -bw * 0.5 + sd * bw * 0.3, sh = [x0, y0, z];
        const bones = [-1.0, -0.55, -0.15].map((a0, i) => { const a = a0 - flap, L = (42 - i * 8) * sc; return [x0 + Math.cos(a) * back * L, y0 + Math.sin(a) * L * 0.9 - 6 * sc, z]; });
        for (const e of bones) { X.seg(sh, e, 1.2 * sc, C(o.bone), 'gloss'); cone(e, [e[0] + back * 3, e[1] + 2, z], 1, C(o.bone), 'gloss', NI); }
        for (let i = 0; i < 3; i++) { const a = i ? bones[i - 1] : [x0, y0 + 18 * sc, z], b2 = bones[i], m = [(sh[0] + a[0] + b2[0]) / 3, (sh[1] + a[1] + b2[1]) / 3, z], L = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
          const it = ell(m[0], m[1], m[2], L * 0.55, Math.hypot(m[0] - sh[0], m[1] - sh[1]) * 0.9, 1, C(o.col), 'silk', { alpha: 0.88, noInk: true }); void it; } } return; }
    if (o.k === 'thruster') { for (const sd of [-1, 1]) { const z = -bw * 0.5 + sd * bw * 0.32;
        for (let k = 0; k < 2; k++) { const a = -0.55 - k * 0.45 + (air ? Math.sin(t * 0.1) * 0.05 : 0), L = 34 - k * 8, dx = Math.cos(a) * back, dy = Math.sin(a);
          box(x0 + dx * L * 0.5, y0 + dy * L * 0.5, z, L, 8 - k * 2, 2.8, C(o.col), 'chrome', null, Math.atan2(dy, dx));
          glowSph(x0 + dx * L, y0 + dy * L, z, 2.6, G(o.glow), 1.3, 0.8); if (air) X.gseg([x0 + dx * L * 0.6, y0 + dy * L * 0.6 + 3, z], [x0 + dx * L * 0.6 + back * 4, y0 + dy * L * 0.6 + 18, z], 2.2, G(o.glow), 1.2, 0.6, GL3D.mesh.cone); } } }
    void face; void P;
  },
  cape(o, X) {
    const { ty, th, tw, bw, back, t, box, torus, C, f, NI } = X, sp = Math.min(1, Math.abs(f.vx || 0) / 8), sway = Math.sin(t * 0.06 + f.id) * 0.05;
    let x = back * tw * 0.42, y = ty - th * 0.48, ang = Math.PI / 2 + back * (0.1 + sp * 0.5 + sway);
    for (let k = 0; k < 3; k++) { const L = th * 0.62, dx = Math.cos(ang), dy = Math.sin(ang);
      box(x + dx * L * 0.5, y + dy * L * 0.5, -bw * 0.2, 2.4, L + 2, tw * (1.05 + k * 0.08), C(o.col), 'silk', null, ang - Math.PI / 2);
      if (k === 2) box(x + dx * L, y + dy * L, -bw * 0.2, 3, 3, tw * 1.25, C(o.trim), 'gold', NI, ang - Math.PI / 2);
      x += dx * L; y += dy * L; ang += back * (0.12 + sp * 0.25); }
    torus(0, ty - th * 0.48, 0, tw * 0.45, C(o.trim), 0, 'gold', NI, tw * 0.3);
  },
  /* ================= armour ================= */
  shoulders(o, X) {
    const { S, zA, lw, t, ell, box, cone, sph, torus, glowSph, C, G, face, NI } = X, col = C(o.col);
    for (const [sp, z, sd] of [[S.shB, -zA * 0.6, -1], [S.shF, zA * 0.6, 1]]) {
      const x = sp[0], y = sp[1] - 3, pr = lw * 1.6 + 3;
      switch (o.k) {
        case 'sode': for (let k = 0; k < 3; k++) { box(x, y + 3 + k * 5, z + sd * 2, pr * 2.1, 5, 3, col, 'metal'); box(x, y + 5.4 + k * 5, z + sd * 3.6, pr * 2.1, 0.9, 0.8, C(o.trim), null, NI); } break;
        case 'spiked': sph(x, y, z, pr, col, 'metal'); for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.6; cone([x + Math.cos(a) * pr * 0.8, y + Math.sin(a) * pr * 0.8, z], [x + Math.cos(a) * (pr + 9), y + Math.sin(a) * (pr + 9), z + sd * 2], 2.6, col, 'metal'); } break;
        case 'grid': box(x, y - 1, z, pr * 2.2, pr * 1.1, pr * 1.6, col, 'gloss'); for (let k = 0; k < 3; k++) X.gseg([x - pr, y - 2 + k * 3 - 2, z + sd * pr * 0.82], [x + pr, y - 2 + k * 3 - 2, z + sd * pr * 0.82], 0.5, G(o.glow), 1.3, 0.4); break;
        case 'rock': for (let k = 0; k < 3; k++) X.oct(x + (k - 1) * 5, y - 2 - (k === 1 ? 4 : 0), z, 6 + (k === 1) * 3, 5 + (k === 1) * 3, 6, col, 'stone', null, k, k * 1.3); break;
        case 'ice': for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.55; X.oct(x + Math.cos(a) * 6, y + Math.sin(a) * 6 - 6, z, 2.6, 9 + (k === 1) * 5, 2.6, col, 'ice', { emis: 0.35 }, 0, a + Math.PI / 2); } break;
        case 'leaf': ell(x, y - 1, z, pr * 1.3, pr * 0.5, pr * 0.95, col, 'cloth'); X.gseg([x - pr, y - 1.5, z + sd * 1], [x + pr, y - 1.5, z + sd * 1], 0.4, C('#2a5a1e'), 0.6, 0.5); break;
        case 'round': { const it = ell(x, y - 1, z, pr * 1.1, pr * 0.8, pr, col, 'metal'); it.metal = 0.8; torus(x, y + 2, z, pr * 0.95, C(o.trim), 0, 'gold', NI, pr * 0.4); break; }
        case 'heavy': box(x, y - 2, z, pr * 2.6, pr * 1.6, pr * 1.9, col, 'metal'); box(x - face * pr * 0.3, y - pr * 0.9, z, pr * 1.4, 3, pr * 1.6, col, 'metal');
          for (let k = 0; k < 3; k++) glowSph(x + (k - 1) * pr * 0.55, y + pr * 0.3, z + sd * pr * 0.95, 1, G('#ffb84d'), 1.2, 0.8); break;
      }
    }
    void t;
  },
  chest(o, X) {
    const { ty, th, tw, bw, face, back, t, box, sph, torus, ell, cone, glowSph, C, G, NI, hx, hy, R } = X, col = C(o.col), z = tw * 0.42, neck = ty - th / 2;
    switch (o.k) {
      case 'plate': box(0, ty - 2, z, tw * 0.8, th * 0.62, 6, col, 'metal'); for (const sd of [-1, 1]) for (const k of [-1, 1]) sph(sd * tw * 0.3, ty - 2 + k * th * 0.24, z + 3.2, 1.2, C('#d8dce8'), 'metal', NI); break;
      case 'bell': torus(0, neck + 2, 0, tw * 0.32, C('#c81e2a'), 0, 'cloth', NI, tw * 0.22); sph(0, neck + 6, tw * 0.33, 3.4, col, 'gold'); break;
      case 'sash': box(0, ty, z + 1, Math.hypot(tw, th) * 0.92, 4.4, 2, col, 'silk', NI, Math.atan2(th, tw) * face); break;
      case 'core': glowSph(0, ty - 3, z + 2, 5 + Math.sin(t * 0.25) * 1, G(o.col), 1.5, 0.7); torus(0, ty - 3, z + 1, 7, C('#20242e'), Math.PI / 2, 'metal', NI); break;
      case 'goldcollar': for (let k = 0; k < 3; k++) torus(0, neck + 3 + k * 2.6, 0, tw * (0.34 + k * 0.07), k % 2 ? C('#1a4aa8') : col, 0.15, 'gold', NI, tw * 0.24); break;
      case 'emblem': X.oct(0, ty - 2, z + 2, 5, 5, 1.4, G(o.col), null, null, 0, 0, 1.4); torus(0, ty - 2, z + 1.5, 7, col, Math.PI / 2, 'gold', NI); break;
      case 'flag': box(face * tw * 0.18, ty - th * 0.2, z + 1.5, 9, 6, 1, col, 'cloth', NI); box(face * tw * 0.18, ty - th * 0.2 - 1.5, z + 2.1, 9, 1.2, 0.5, C('#ffffff'), null, NI); break;
      case 'leafcollar': for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ell(Math.cos(a) * tw * 0.36, neck + 2, Math.sin(a) * tw * 0.36, 5, 1.6, 3, col, 'cloth', NI); } break;
      case 'ermine': torus(0, neck + 2, 0, tw * 0.42, col, 0.1, 'fur', null, tw * 0.6); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; sph(Math.cos(a) * tw * 0.42, neck + 1, Math.sin(a) * tw * 0.42 + 2, 1.2, C(o.spot), 'gloss', NI); }
        for (let i = 0; i < 5; i++) sph((i - 2) * 3, neck + 8 + Math.abs(i - 2) * -1.5 + 3, z + 0.6, 1, C('#ffcf3a'), 'gold', NI); break;
      case 'tabard': box(0, ty + th * 0.18, z + 1, tw * 0.62, th * 1.1, 2.2, col, 'cloth'); box(0, ty + th * 0.05, z + 2.4, 3, th * 0.5, 0.6, C(o.emblem), 'gold', NI); box(0, ty - th * 0.05, z + 2.4, th * 0.36, 3, 0.6, C(o.emblem), 'gold', NI); break;
      case 'ruffle': for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ell(Math.cos(a) * tw * 0.36, neck + 1, Math.sin(a) * tw * 0.36, 4.2, 3.2, 2, col, 'silk', NI); } break;
      case 'shell': for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; ell(Math.sin(a) * 4, ty - 4 - Math.cos(a) * 3, z + 2, 2.2, 6, 1.2, col, 'gloss', NI); } break;
      case 'scarf': { torus(0, neck + 2, 0, tw * 0.34, col, 0.1, 'silk', null, tw * 0.3); const sw = Math.sin(t * 0.15) * 4, sp = Math.min(1, Math.abs(X.f.vx || 0) / 8);
        X.seg([back * tw * 0.3, neck + 3, -2], [back * (tw * 0.3 + 14 + sp * 10), neck + 8 + sw - sp * 6, -4], 2.2, col, 'silk'); X.seg([back * (tw * 0.3 + 14 + sp * 10), neck + 8 + sw - sp * 6, -4], [back * (tw * 0.3 + 26 + sp * 16), neck + 6 + sw * 1.4 - sp * 8, -5], 1.8, col, 'silk'); break; }
      case 'highcollar': for (const sd of [-1, 1]) { box(back * 2, neck - 10, sd * tw * 0.36, 3, 22, tw * 0.5, col, 'silk', null, back * 0.2); box(back * 1, neck - 10, sd * tw * 0.36 + sd * 0.2, 1, 19, tw * 0.44, C(o.lining), 'silk', NI, back * 0.2); } break;
    }
    void hx; void hy; void R; void cone; void bw;
  },
  limbs(o, X) {
    if (!X.jointed) return;
    const { S, fa, ba, fl, fr, zA, zL, lw, t, cone, sph, torus, glowSph, C, G, face, NI, legless } = X, L = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const arms = [[S.elF, fa, zA], [S.elB, ba, -zA]], legs = legless ? [] : [[S.knF, fr, zL], [S.knB, fl, -zL]];
    switch (o.k) {
      case 'glowlines': for (const [a, b, z] of arms.concat(legs)) { const p = L(a, b, 0.15), q = L(a, b, 0.85); X.gseg([p[0], p[1], z + Math.sign(z) * lw * 0.8], [q[0], q[1], z + Math.sign(z) * lw * 0.8], 0.5, G(o.col), 1.4, 0.4); } break;
      case 'greaves': for (const [a, b, z] of legs.concat(arms)) { const p = L(a, b, 0.2), q = L(a, b, 0.78); X.cyl([p[0], p[1], z], [q[0], q[1], z], lw * 1.12, C(o.col), 'metal'); } break;
      case 'vines': for (const [a, b, z] of arms.concat(legs)) { for (let i = 0; i < 6; i++) { const u0 = i / 6, u1 = (i + 1) / 6, p = L(a, b, u0), q = L(a, b, u1), a0 = u0 * TAU * 2 + t * 0.02, a1 = u1 * TAU * 2 + t * 0.02;
          X.seg([p[0] + Math.cos(a0) * lw, p[1], z + Math.sin(a0) * lw], [q[0] + Math.cos(a1) * lw, q[1], z + Math.sin(a1) * lw], 0.8, C(o.col), 'cloth', NI); }
        const m = L(a, b, 0.5); sph(m[0], m[1] - lw, z + Math.sign(z) * lw, 2.2, C(o.bloom), 'silk', NI); } break;
      case 'constellation': for (const [a, b, z] of arms.concat(legs)) { const pts = [0.1, 0.4, 0.7, 0.95].map(u => L(a, b, u)); pts.forEach((p, i) => { glowSph(p[0], p[1], z + Math.sign(z) * lw * 0.9, 1.2 + ((t >> 3) + i) % 3 * 0.3, G(o.col), 1.4, 0.8);
          if (i) X.gseg([pts[i - 1][0], pts[i - 1][1], z + Math.sign(z) * lw * 0.9], [p[0], p[1], z + Math.sign(z) * lw * 0.9], 0.3, G('#ffe08a'), 0.8, 0.4); }); } break;
      case 'claws': for (const [, h, z] of arms) for (const k of [-1, 0, 1]) cone([h[0] + face * (lw + 1), h[1] + k * 3, z], [h[0] + face * (lw + 9), h[1] + k * 4 + 2, z], 1.5, C(o.col), 'gloss');
        for (const [, ft, z] of legs) for (const k of [-1, 1]) cone([ft[0] + face * (lw + 2), ft[1] - 2 + k, z + k * 2], [ft[0] + face * (lw + 7), ft[1], z + k * 2], 1.2, C(o.col), 'gloss'); break;
      case 'chains': for (const [, h, z] of arms) { for (let i = 0; i < 5; i++) { const sw = Math.sin(t * 0.1 + i * 0.6) * i * 0.8; torus(h[0] + sw, h[1] + 4 + i * 3.2, z, 1.6, C(o.col), i % 2 ? Math.PI / 2 : 0, 'metal', NI, 1.6); } } break;
    }
  },
  cracks(o, X) { const { ty, th, tw, t, f, G } = X, k = 0.65 + 0.35 * Math.sin(t * 0.09 + f.id);
    for (const [x0, y0, x1, y1] of [[-tw * 0.32, ty - th * 0.4, -tw * 0.04, ty - th * 0.08], [-tw * 0.04, ty - th * 0.08, -tw * 0.22, ty + th * 0.18], [-tw * 0.04, ty - th * 0.08, tw * 0.3, ty - th * 0.24], [tw * 0.1, ty + th * 0.1, tw * 0.28, ty + th * 0.36]])
      X.gseg([x0, y0, tw * 0.45], [x1, y1, tw * 0.45], 1.2, G(o.col), k * 1.4, 0.4);
    if (X.jointed) for (const [a, b, z] of [[X.S.elF, X.fa, X.zA], [X.S.knF, X.fr, X.zL]]) X.gseg([a[0], a[1], z + 3], [(a[0] + b[0]) / 2 + 2, (a[1] + b[1]) / 2, z + 3], 0.8, G(o.col), k * 1.2, 0.4); },
  /* ================= around the body ================= */
  ring(o, X) {
    const { ty, th, tw, t, P, U, glowIt, G, f } = X, ringAt = (y, r, tilt, a, k, col, thick) => { const p = P(0, y, 0), it = glItem(GL3D.mesh.torus);
      M4.basis(it.m, p[0], p[1], p[2], U(Math.cos(a) * r, Math.sin(tilt) * r * 0.3, Math.sin(a) * r), U(0, r * (thick || 0.06), 0), U(-Math.sin(a) * r, 0, Math.cos(a) * r)); glowIt(it, col, k, 0.5); };
    switch (o.k) {
      case 'scan': { const u = (t * 0.02 + f.id * 0.3) % 1, y = ty + th * 0.7 - u * (th + 60); ringAt(y, tw * 0.9, 0, 0, 1.2 * Math.sin(u * Math.PI), G(o.col)); ringAt(ty, tw * 0.95, 0.1, t * 0.01, 0.35, G(o.col)); break; }
      case 'wind': for (let k = 0; k < 2; k++) ringAt(ty - th * 0.1 + k * th * 0.5, tw * (0.95 + k * 0.15), 0.5 + k * 0.4, t * (0.08 + k * 0.04) * (k ? -1 : 1), 0.7, G(o.col), 0.08); break;
      case 'accretion': ringAt(ty + th * 0.1, tw * 1.25, 0.25, t * 0.03, 1.1, G(o.col), 0.16); ringAt(ty + th * 0.1, tw * 0.95, 0.25, -t * 0.05, 1.4, G(o.hot), 0.08); break;
    }
  },
  orbit(o, X) {
    const { ty, th, tw, t, f, sph, ell, cone, box, glowSph, torus, C, G, NI, fa, ba } = X, n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const a = t * 0.045 + i * TAU / n + f.id, r = tw * 0.95 + 10, x = Math.cos(a) * r, z = Math.sin(a) * r, y = ty - th * 0.2 + Math.sin(t * 0.06 + i * 2) * 5;
      switch (o.k) {
        case 'cubes': { const p = X.P(x, y, z), it = glItem(GL3D.mesh.box), B = X.rb(t * 0.08 + i, t * 0.05 + i, 3 * X.s); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]); X.glowIt(it, G(o.col), 0.9, -1.2); break; }
        case 'shards': X.oct(x, y, z, 2.4, 6, 2.4, G(o.col), null, null, a, t * 0.1, 1.2); break;
        case 'bolts': { let px = x, py = y - 6; for (let k = 0; k < 3; k++) { const nx = px + (k % 2 ? 3 : -3), ny = py + 4; X.gseg([px, py, z], [nx, ny, z], 0.8, G(o.col), 1.6, 0.4); px = nx; py = ny; } break; }
        case 'water': sph(x, y, z, 2.8, C(o.col), 'gloss', { alpha: 0.6, emis: 0.4, noInk: true }); break;
        case 'moons': sph(x * 1.15, y - 10, z * 1.15, 4.6, C(o.col), 'stone'); glowSph(x * 1.15, y - 10, z * 1.15, 6, G(o.col), 0.25, -1.4); break;
        case 'stars': { const p = X.P(x, y, z), it = glItem(GL3D.mesh.star), B = X.rb(t * 0.1 + i, 0, 2.6 * X.s); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]); X.glowIt(it, G(o.col), 1.4, 0.6); break; }
        case 'juggle': { const u = ((t * 0.025 + i / n) % 1), hx2 = fa[0] + (ba[0] - fa[0]) * u, hy2 = Math.min(fa[1], ba[1]) - 18 - Math.sin(u * Math.PI) * 26; sph(hx2, hy2, 6, 3, i % 2 ? C('#ffcf3a') : C(o.col), 'gloss', NI); break; }
        case 'jewels': X.oct(x, y - 4, z, 2.6, 4, 2.6, G(o.col), null, null, a, 0.3, 1.5); break;
        case 'drone': { const dx = tw * 0.6 + 8, dy = ty - th * 0.9 + Math.sin(t * 0.08) * 3, dz = 8; box(X.back * dx, dy, dz, 9, 3.4, 9, C(o.col), 'gloss');
          for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { X.disc(X.back * dx + ox, dy - 2.4, dz + oz, 3.6, 0.4, [0.1, 0.1, 0.12], 'plastic', NI, true); }
          glowSph(X.back * dx, dy + 2, dz + 4.6, 1.2, X.selfC, 1.5, 0.8); i = n; break; }
        case 'souls': { glowSph(x, y - 6, z, 3.2, G(o.col), 1.3, 0.7); X.gseg([x, y - 6, z], [x - Math.sin(a) * 9, y + 2, z + Math.cos(a) * 9], 1.4, G(o.col), 0.5, 0.6, GL3D.mesh.cone); break; }
        case 'potion': { const px = X.back * (tw * 0.7 + 8), py = ty - th * 0.6 + Math.sin(t * 0.07) * 4; sph(px, py, 6, 4.2, C('#d8f0ff'), 'gloss', { alpha: 0.7, noInk: true }); glowSph(px, py + 1, 6, 3.2, G(o.col), 1.2, 0.7);
          X.cyl([px, py - 4, 6], [px, py - 8, 6], 1.4, C('#d8f0ff'), 'gloss', NI); X.cyl([px, py - 8, 6], [px, py - 10, 6], 1.6, C('#6a4a2a'), 'cloth', NI); i = n; break; }
        case 'wisps': glowSph(x * 0.9, y - 8 + Math.sin(t * 0.1 + i) * 6, z * 0.9, 2.6, G(o.col), 1.1, 0.8); break;
      }
    }
    void ell; void cone; void torus;
  },
  aura(o, X) {
    const { ty, th, tw, t, f, ell, sph, glowSph, C, G, NI } = X, n = o.k === 'nebula' ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const q = ((t * 0.008 + i / n + f.id * 0.13) % 1), hsh = Math.sin(i * 12.9898) * 43758.5453 % 1, x = (hsh - 0.5) * tw * 2.6 + Math.sin(q * 6 + i) * 6, z = Math.cos(i * 2.3) * tw * 0.9;
      switch (o.k) {
        case 'petals': ell(x, ty - th * 1.6 + q * th * 2.6, z, 3, 1.6, 0.8, C(o.col), 'silk', NI); break;
        case 'leaves': ell(x, ty - th * 1.6 + q * th * 2.6, z, 3.6, 1.6, 1, C(o.col), 'cloth', NI); break;
        case 'snow': X.oct(x, ty - th * 1.6 + q * th * 2.6, z, 1.4, 1.4, 1.4, G(o.col), null, null, q * 6, q * 4, 1.1); break;
        case 'bubbles': sph(x * 0.8, ty + th * 0.6 - q * th * 2.4, z, 1.6 + q * 1.8, C(o.col), 'gloss', { alpha: 0.5, emis: 0.3, noInk: true }); break;
        case 'nebula': { const a = t * 0.01 + i * TAU / n, r = tw * 1.1; glowSph(Math.cos(a) * r, ty - th * 0.2 + Math.sin(a * 2) * 8, Math.sin(a) * r, 9 + Math.sin(t * 0.03 + i) * 2, G(i % 2 ? o.alt : o.col), 0.22, -1.4); break; }
      }
    }
    void sph;
  },
  trail(o, X) {
    const { ty, th, back, t, f, G, P } = X, sp = Math.hypot(f.vx || 0, f.vy || 0); let dx = back, dy = 0.2;
    if (sp > 2) { dx = -f.vx / sp; dy = -f.vy / sp; } const L = 30 + Math.min(sp, 12) * 4, pts = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7, w = Math.sin(t * 0.3 + u * 6) * u * 3; pts.push(P(dx * L * u - dy * w, ty - th * 0.2 + dy * L * u + dx * w, -6)); }
    const it = X.tube(pts, u => (6 * (1 - u) + 0.5) * X.s); if (it) X.glowIt(it, G(o.col), 0.8, 0.7);
  }
};
