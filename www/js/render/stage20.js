/* NEON BRAWL — v20 the Pro Pass map (tier 2), everything but its gameplay (data/stages.js):
 *
 *   PRISMATIC CATHEDRAL   a crystal cathedral floating above a sea of golden-hour clouds. The arena is a marble nave floor
 *                         (checkered inlay, gold borders, a front arcade of glowing stained-glass lancets) over a root of
 *                         pink-and-cyan crystals. Behind it the cathedral front rises: a GIANT ROSE WINDOW — twelve petal
 *                         panes, an inner ring of twelve roundels and a golden heart, each pane slowly breathing light —
 *                         under a pointed gable, five lancet windows below it, twin bell towers with spires and swinging
 *                         golden bells, and colonnades of slender columns down both sides of the nave. Coloured GOD RAYS
 *                         pour out of the rose window onto the back of the nave and pool on the floor in shifting stained-
 *                         glass colours (with dust motes drifting in the beams); six crystal prisms turn and bob in the
 *                         air, flashing rainbow glints. Its own sky (low gold sun, peach horizon, violet zenith), deep
 *                         scenery (floating chapel isles, distant spires, crystal pinnacles, cloud banks), a light rig that
 *                         tints the fighters with the window's colours, prism-glint weather, a soundtrack and a canvas
 *                         fallback background. Hooks: render/stage3d.js + weather3d.js + audio/music.js tables.        */
'use strict';

/* ============================== registries ============================== */
Object.assign(THEME3D, { cathedral: 'cathedral' });
Object.assign(LIGHT_RIG, { cathedral: 'stainedglass' });
Object.assign(WX_KIND, { prism: { tpl: 'mote', n: 300, vel: [8, 22, 6], sz: [2.1, 0, 0.6], mode: 2, add: true, spin: 2.5, sway: 40, col: [1, 0.72, 0.92], col2: [0.6, 0.95, 1], a: 1 } });
Object.assign(WX_STAGE, { cathedral: ['gold', 'prism'] });
Object.assign(ATMO, { cathedral: ['mote', 36, ['#ffe08a', '#ff9ad8', '#9ad8ff']] });
Object.assign(BACKGROUNDS, { cathedral: bgCathedral });
Object.assign(STAGE_MUSIC, {
  cathedral: ['epic', 100, 53, 'lydian', 0, { name: 'Light Through Glass', kick: ['taiko', [0, 8, 11]], snare: ['snare', [12]], hat: ['shaker', OFFS], arp: ['bell', 2, 'updown', 1, 0.042],
    pad: ['organ', 0.03, 1500, 1], lead: ['brass', 0.034, 1, 0.1], prog: [0, 4, 5, 3], fx: ['shimmer'] }]
});
const CATH_GLASS = ['#ff3d6a', '#ffcf3a', '#3d8aff', '#3dffb8', '#b06bff', '#ff8a2a'];   // the stained-glass palette (window · rays · floor pools · lights)
const cathCol = (i, t) => { const n = CATH_GLASS.length, u = ((i + (t || 0)) % n + n) % n, a = Math.floor(u), k = u - a; return mix3(col3(CATH_GLASS[a]), col3(CATH_GLASS[(a + 1) % n]), k); };

Object.assign(MAP_ENV, {
  cathedral(E) { E.fog = [0.76, 0.56, 0.58]; E.sky = [0.66, 0.5, 0.58]; E.light = [1.08, 0.97, 0.86]; E.rim = [1, 0.74, 0.86]; E.ground = [0.4, 0.3, 0.4]; E.bright = true; }   // golden hour, a rose-gold dusk haze
});
Object.assign(SKY_EXT, {
  cathedral(S) { S.Zen = [0.34, 0.36, 0.74]; S.Hor = [1, 0.8, 0.58]; S.Gnd = [0.82, 0.62, 0.58]; S.K = [0.085, 0.04, 0.55, 0]; S.SunDir = V3.norm([0.42, 0.1, -1]); S.SunCol = [1, 0.86, 0.6];
    S.Cl1 = [1, 0.9, 0.82]; S.Cl2 = [0.92, 0.58, 0.66]; S.horGlow = 1.05; S.cloudH = 6; }
});
// deep-scenery colours: [body, accent, emissive]
Object.assign(SCENERY_COLS, { cathedral: ['#cdbad8', '#ffd36e', '#ff9ad8'] });
Object.assign(SCENERY_EXT, {
  cathedral(put, r, deep, top, X0, X1) {                                    // a sea of cloud banks, floating chapel isles, distant spires and crystal pinnacles
    for (let i = 0; i < 16; i++) { const x = r(X0 - 800, X1 + 800), y = top - r(760, 980), z = deep(-1200, -4400), s = r(160, 360);   // puffy golden-hour cloud banks
      for (let k = 0; k < 4; k++) put('sph', x + (k - 1.5) * s * 0.7, y + (k % 2) * s * 0.18, z + (k % 3) * 40, s * (0.7 + (k % 2) * 0.3), s * 0.42, s * 0.6, 0); }
    for (let i = 0; i < 8; i++) { const x = r(X0, X1), z = deep(-1300, -3600), y = top - r(-200, 420), s = r(90, 170);   // a floating isle with a little chapel on it
      put('cone', x, y, z, s, s * 1.5, s * 0.8, 0, 0, Math.PI); put('box', x, y + s * 0.28, z, s * 0.7, s * 0.55, s * 0.5, 0); put('pyr', x, y + s * 0.55, z, s * 0.5, s * 0.5, s * 0.36, 1, Math.PI / 4);
      put('cyl', x + s * 0.32, y + s * 0.5, z, s * 0.1, s * 0.9, s * 0.1, 0); put('cone', x + s * 0.32, y + s * 1.4, z, s * 0.14, s * 0.5, s * 0.14, 1); put('octa', x, y + s * 0.3, z + s * 0.26, s * 0.12, s * 0.16, 2, 2); }
    for (let i = 0; i < 12; i++) { const x = r(X0 - 600, X1 + 600), z = deep(-2600, -4600), b = top - r(700, 900), h = r(700, 1500), w = r(30, 70);   // distant spires
      put('cyl', x, b, z, w, h, w, 0); put('cone', x, b + h, z, w * 1.3, h * 0.35, w * 1.3, 1); }
    for (let i = 0; i < 26; i++) { const s = r(14, 46); put('octa', r(X0, X1), top + r(-300, 1300), deep(-700, -3400), s * 0.6, s * 1.6, s * 0.6, i % 3 ? 2 : 1, r(0, 6), r(-0.4, 0.4)); }   // floating crystal shards
  }
});
Object.assign(DECO_EXT, {
  cathedral(kind, w, h, d, add, pal, R, C, main) {                          // the marble nave floor + a front arcade of stained glass · crystal slabs with gold rails
    const hw = w / 2, fz = d / 2, gold = C('#ffcf5a'), m1 = C('#f6f0f8'), m2 = C('#cbb6d8');
    if (main) {
      const rows = 3, rd = (d - 22) / rows;
      for (let x = -hw + 10, k = 0; x < hw - 30; x += 40, k++) for (let j = 0; j < rows; j++) add('box', x + 20, 0.6, -d / 2 + 11 + rd * (j + 0.5), 38, 1.4, rd - 2, (k + j) & 1 ? m1 : m2, 0);   // checkered marble
      add('box', 0, 1, fz - 6, w - 8, 2, 3, gold, 0.3); add('box', 0, 1, -fz + 6, w - 8, 2, 3, gold, 0.3);                                                     // gold borders
      const n = 9, pw = (w - 30) / n;
      for (let i = 0; i < n; i++) { const x = -hw + 15 + pw * (i + 0.5), col = C(CATH_GLASS[i % CATH_GLASS.length]);                                              // the front arcade
        add('box', x, -h * 0.5 - 2, fz + 0.8, pw - 16, h - 30, 1.6, col, 0.72);                                                                                  // a glowing lancet pane
        add('box', x, -h * 0.5 - 2, fz + 1.8, 2, h - 30, 1.2, C('#2a2236'), 0); add('box', x, -h * 0.45, fz + 1.8, pw - 16, 2, 1.2, C('#2a2236'), 0);            // its lead cross
        for (const sx of [-1, 1]) add('cyl', x + sx * (pw / 2 - 4), -h + 6, fz + 1.5, 3.4, h - 18, 3.4, m1, 0);                                                    // slender columns
        for (const sx of [-1, 1]) add('box', x + sx * (pw * 0.22), -14, fz + 2, pw * 0.56, 4, 3, m1, 0, 0, sx * -0.55); }                                         // the pointed arch
      add('box', 0, -h + 3, fz + 2, w - 6, 3.4, 2.4, gold, 0.25); add('box', 0, -5, fz + 2.4, w - 6, 2.4, 2, gold, 0.2);
    } else {
      add('box', 0, 0.9, fz - 4, w - 8, 1.8, 3, gold, 0.35); add('box', 0, 0.9, -fz + 4, w - 8, 1.8, 3, gold, 0.35);
      add('octa', 0, -h - 18, 0, w * 0.3, 30, d * 0.3, C(pal.plat), 0.7, 0.4);                                                                                  // a crystal keel
      for (let x = -hw + 16; x < hw - 10; x += 24) add('cone', x, -h, fz - 8, 3.6, 12 + R() * 14, 3.6, C('#d8f8ff'), 0.6, 0, Math.PI);                         // little hanging prisms
      add('box', 0, -h / 2, fz + 1, w - 10, 2, 1.4, gold, 0.3);
    }
  }
});
Object.assign(MAP3D, { cathedral: collectCathedral3D });
Object.assign(LIGHT_EXT, {
  stainedglass(L, S, t, cx, top) {                                          // the low gold sun through the rose window + three lights cycling through the glass colours
    L(cx, top + 520, -720, 1900, [1, 0.84, 0.58], 1.9); L(S.x - 300, top + 300, 200, 1100, [1, 0.78, 0.62], 0.8);
    for (let i = 0; i < 3; i++) L(S.x + S.w * (0.18 + i * 0.32) + Math.sin(t * 0.01 + i * 2) * 50, top + 150, 90, 480, cathCol(i * 2, t * 0.004), 1.5 + 0.3 * Math.sin(t * 0.03 + i));
  }
});

/* ============================== the scene graph ============================== */
let CATH_SG = null;
const CATH_FRONT = { z: -2600, y: -330, s: 1.15, rose: 470 };                // the cathedral front: depth, lift, scale; the rose window's height on it (it frames the top platform)
const K20 = { blob: () => GEO.superellipsoid(0.9, 0.9, 28, 20), cyl: () => GEO.cylinder(32, true), cone: () => GEO.cylinder(28, true, 0.001), taper: () => GEO.cylinder(28, true, 0.6),
  box: () => GEO.rcube(0.08, 3), sph: () => GEO.sphere(36, 24), tor: () => GEO.torus(96, 16, 0.07), ring: () => GEO.torus(110, 8, 0.03), octa: () => geoFlat(GEO.octa()),
  prism: () => geoFlat(GEO.cylinder(3, true)), disc: () => GEO.cylinder(48, true), pane: () => GEO.superellipsoid(0.55, 0.9, 20, 14) };
const c20 = c => typeof c === 'string' ? col3(c) : c;
const m20 = (col, o) => Object.assign({ col: c20(col), spec: 0.45, shin: 40, outline: 1.3, rimK: 0.55, shadow: false }, o || {});
const g20 = (col, k, p) => ({ col: c20(col), glow: k === undefined ? 0.5 : k, glowPow: p === undefined ? 0.6 : p });
function n20(name, kind, pos, scl, mat, rot, tick) { return new SceneNode(name, { pos, scl, rot: rot || [0, 0, 0], mat, tick, meshKey: 'c20:' + kind, build: K20[kind], ink: !mat.glow && kind !== 'ring' }); }
const grp20 = (name, pos, kids, tick, rot) => new SceneNode(name, { pos, rot: rot || [0, 0, 0], tick }).add(...kids);
function cathedralScene() {
  if (CATH_SG) return CATH_SG;
  const S = STAGE, a = S.w / 2, root = new SceneNode('cathedral');
  const marble = m20('#e6dcec', { spec: 0.55, shin: 70 }), marble2 = m20('#8c7aa8', { spec: 0.35, shin: 40 }), stone = m20('#6e5e8a', { spec: 0.2, shin: 20 });   // (the facade's stone is dusky, so the glass glows against it)
  const gold = m20('#ffcf5a', { spec: 1.4, shin: 120, metal: 0.9, rimK: 0.8 }), lead = m20('#2a2236', { spec: 0.6, shin: 50, outline: 0 }), roof = m20('#5a4a8a', { spec: 0.5, shin: 40 });
  const crystal = (col, e) => m20(col, { spec: 1.6, shin: 160, metal: 0.3, emis: e === undefined ? 0.35 : e, alpha: 0.88, rimK: 1.2, rimCol: [1, 1, 1] });
  // ---- the cathedral front, far behind the nave ----
  const front = new SceneNode('front', { pos: [0, CATH_FRONT.y, CATH_FRONT.z], scl: [CATH_FRONT.s, CATH_FRONT.s, CATH_FRONT.s] });
  front.add(n20('wall', 'box', [0, 300, -40], [760, 900, 70], marble2));                                                    // the west front
  for (let i = 0; i < 6; i++) front.add(n20('course' + i, 'box', [0, -120 + i * 150, 0], [772, 10, 10], stone));        // string courses
  for (const sx of [-1, 1]) {                                                                                               // the gable over the window
    front.add(n20('gable' + sx, 'box', [sx * 230, 820, 0], [560, 46, 70], marble, [0, 0, sx * -0.52]));
    front.add(n20('gableTrim' + sx, 'box', [sx * 228, 846, 30], [560, 10, 12], gold, [0, 0, sx * -0.52]));
    for (let k = 0; k < 5; k++) front.add(n20('crocket' + sx + k, 'cone', [sx * (60 + k * 90), 960 - k * 52, 30], [12, 34, 12], gold, [0, 0, sx * -0.3])); }
  front.add(n20('apexCross', 'box', [0, 1010, 30], [12, 90, 12], gold), n20('apexCross2', 'box', [0, 1030, 30], [52, 12, 12], gold));
  // the ROSE WINDOW: stone ring, tracery, twelve petal panes, twelve roundels, a golden heart — every pane breathes light
  const RW = 300, rose = new SceneNode('rose', { pos: [0, CATH_FRONT.rose, 18] });
  const torF = (name, pos, r, depth, mat) => n20(name, 'tor', pos, [r, depth, r], mat, [Math.PI / 2, 0, 0]);       // a ring facing the camera (tube: 7 % of r across, of depth deep)
  rose.add(torF('roseRim', [0, 0, 0], RW + 22, RW * 1.4, marble), torF('roseRimG', [0, 0, 16], RW + 6, RW * 0.6, gold));
  rose.add(n20('roseBack', 'disc', [0, 0, -14], [RW, 6, RW], lead, [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 12; i++) {
    const ang = i / 12 * TAU, ca = Math.cos(ang), sa = Math.sin(ang), col = c20(CATH_GLASS[i % CATH_GLASS.length]);
    rose.add(n20('petal' + i, 'pane', [ca * RW * 0.62, sa * RW * 0.62, 0], [RW * 0.34, RW * 0.14, 8], g20(col, 0.6, 0.5), [0, 0, ang], (n, t) => { n.mat.glow = 0.5 + 0.22 * Math.sin(t * 0.03 + i * 0.9); }));
    rose.add(n20('round' + i, 'sph', [Math.cos(ang + Math.PI / 12) * RW * 0.32, Math.sin(ang + Math.PI / 12) * RW * 0.32, 2], [RW * 0.075, RW * 0.075, 5], g20(CATH_GLASS[(i + 3) % CATH_GLASS.length], 0.6, 0.5),
      null, (n, t) => { n.mat.glow = 0.45 + 0.25 * Math.sin(t * 0.04 - i * 1.3); }));
    rose.add(n20('spoke' + i, 'box', [Math.cos(ang + Math.PI / 12) * RW * 0.6, Math.sin(ang + Math.PI / 12) * RW * 0.6, 12], [RW * 0.78, 9, 16], marble, [0, 0, ang + Math.PI / 12]));
    rose.add(torF('foil' + i, [ca * RW * 0.86, sa * RW * 0.86, 10], RW * 0.1, RW * 0.2, marble));
  }
  rose.add(torF('roseInner', [0, 0, 12], RW * 0.42, RW * 0.5, marble));
  rose.add(n20('roseHeart', 'sph', [0, 0, 6], [RW * 0.16, RW * 0.16, 10], g20('#ffe08a', 0.9, 0.5), null, (n, t) => { n.mat.glow = 0.75 + 0.25 * Math.sin(t * 0.05); }));
  front.add(rose);
  for (let i = 0; i < 5; i++) { const x = (i - 2) * 120, hh = 150 - Math.abs(i - 2) * 20;                              // the lancet windows under the rose
    front.add(n20('lancet' + i, 'box', [x, 46, 4], [60, hh * 2, 6], g20(CATH_GLASS[(i * 2 + 1) % CATH_GLASS.length], 0.55, 0.5), null, (n, t) => { n.mat.glow = 0.42 + 0.18 * Math.sin(t * 0.025 + i * 1.7); }));
    front.add(n20('lancetTop' + i, 'cone', [x, 46 + hh, 4], [30, 50, 6], g20(CATH_GLASS[(i * 2 + 1) % CATH_GLASS.length], 0.5, 0.5)));
    front.add(n20('lancetFrame' + i, 'box', [x, 46, 14], [72, hh * 2 + 12, 4], marble, null), n20('lancetMull' + i, 'box', [x, 46, 18], [5, hh * 2, 5], lead)); }
  // twin bell towers with spires, belfries and swinging golden bells
  for (const sx of [-1, 1]) {
    const T = new SceneNode('tower' + sx, { pos: [sx * 560, 0, 10] });
    T.add(n20('tw' + sx, 'box', [0, 330, 0], [190, 1100, 190], marble), n20('twC' + sx, 'box', [0, 780, 0], [210, 16, 210], gold));
    for (const k of [0, 1]) T.add(n20('twWin' + sx + k, 'box', [0, 200 + k * 300, 96], [56, 150, 4], g20(CATH_GLASS[(k + (sx > 0 ? 2 : 4)) % 6], 0.45, 0.5)));
    T.add(n20('belfry' + sx, 'box', [0, 870, 0], [170, 170, 170], marble2), n20('belfryOpen' + sx, 'box', [0, 870, 86], [100, 120, 4], lead));
    T.add(new SceneNode('bell' + sx, { pos: [0, 920, 60], tick: (n, t) => { n.rot[2] = Math.sin(t * 0.045 + sx) * 0.35; } }).add(
      n20('bellB' + sx, 'cone', [0, -70, 0], [40, 66, 40], gold), n20('bellL' + sx, 'sph', [0, -76, 0], [10, 10, 10], gold), n20('bellY' + sx, 'box', [0, -2, 0], [50, 8, 10], gold)));
    T.add(n20('spire' + sx, 'cone', [0, 955, 0], [120, 420, 120], roof), n20('spireRing' + sx, 'tor', [0, 960, 0], [118, 118, 118], gold), n20('finial' + sx, 'sph', [0, 1385, 0], [16, 16, 16], g20('#ffe08a', 0.8)));
    for (const cz of [-1, 1]) for (const cxx of [-1, 1]) T.add(n20('pin' + sx + cz + cxx, 'cone', [cxx * 90, 955, cz * 90], [18, 120, 18], roof));
    front.add(T);
    for (let k = 0; k < 2; k++) front.add(n20('buttress' + sx + k, 'box', [sx * (350 + k * 60), 120 + k * 160, 200 + k * 80], [40, 520, 36], stone, [0.32 + k * 0.1, 0, 0]));   // flying buttresses
  }
  root.add(front);
  // the colonnades: slender marble columns + gilded capitals down both sides of the nave, an architrave over them
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = sx * (a + 170 + k * 26), z = -340 - k * 140, hgt = 560;
    root.add(n20('col' + sx + k, 'cyl', [x, -260, z], [17, hgt, 17], marble), n20('cap' + sx + k, 'box', [x, -260 + hgt, z], [52, 22, 52], gold), n20('base' + sx + k, 'box', [x, -260, z], [48, 22, 48], marble2));
    if (k < 4) root.add(n20('arch' + sx + k, 'box', [x + sx * 11, -260 + hgt + 22, z - 65], [26, 18, 150], marble2));
  }
  // the crystal root under the arena floor (pink + cyan crystals with a glowing heart)
  const under = new SceneNode('under', { pos: [0, -S.h, 0] });
  for (let i = 0; i < 11; i++) { const u = i / 10 - 0.5, hh = 70 + (0.5 - Math.abs(u)) * 260 + (i % 3) * 30;
    under.add(n20('rootC' + i, 'octa', [u * a * 1.6, -hh * 0.55, ((i * 37) % 70) - 35], [26 + (i % 4) * 8, hh, 24 + (i % 3) * 8], crystal(i % 2 ? '#ff9ad8' : '#9ad8ff', 0.45), [0, i * 0.7, u * 0.4])); }
  under.add(n20('rootHeart', 'sph', [0, -150, 0], [60, 60, 60], g20('#ffd6f0', 0.5, -1.2), null, (n, t) => { n.mat.glow = 0.4 + 0.15 * Math.sin(t * 0.04); }));
  root.add(under);
  // six crystal prisms turning and bobbing in the light
  const PR = [[-a - 300, 360, -260, 1.0], [a + 320, 420, -320, 1.1], [-a - 120, 620, -520, 0.8], [a + 160, 680, -560, 0.9], [-a - 520, 180, -620, 1.3], [a + 560, 220, -660, 1.2]];
  PR.forEach(([x, y, z, s], i) => root.add(new SceneNode('prism' + i, { pos: [x, y, z], scl: [s, s, s], tick: (n, t) => { n.rot[1] = t * 0.012 * (i % 2 ? 1 : -1) + i; n.rot[2] = 0.4 + Math.sin(t * 0.01 + i) * 0.2; n.pos[1] = y + Math.sin(t * 0.02 + i * 1.7) * 14; } })
    .add(n20('prismBody' + i, 'prism', [0, -48, 0], [30, 96, 30], crystal(i % 2 ? '#e8f8ff' : '#fff0fa', 0.3)), n20('prismCore' + i, 'sph', [0, 0, 0], [14, 30, 14], g20(CATH_GLASS[i % 6], 0.55, 0.5)))));
  return (CATH_SG = { root, PR });
}
function collectCathedral3D() {
  const S = STAGE, N = cathedralScene(), t = G.time, cx = S.x + S.w / 2, deck = S.y;                   // (deck: the floor top in game coords, y down)
  N.root.pos[0] = cx; N.root.pos[1] = -S.y; sgDraw(N.root, t);
  const F = CATH_FRONT, wx = cx, wy = deck - (F.y + F.rose * F.s), wz = F.z + 18 * F.s;                // the rose window's heart in game coords
  // GOD RAYS: coloured beams from the window down onto the back of the nave (behind the fighters), slowly sweeping
  for (let i = 0; i < 6; i++) { const sw = Math.sin(t * 0.004 + i * 1.3) * 60, fx = cx + (i - 2.5) * S.w * 0.17 + sw, fzz = -150 - (i % 2) * 30, col = cathCol(i, t * 0.002);
    const k = 0.11 + 0.04 * Math.sin(t * 0.02 + i * 2.1), ox = Math.cos(i / 6 * TAU) * 120, oy = Math.sin(i / 6 * TAU) * 120;
    sG('cone', fx, deck - 2, fzz, wx + ox, wy + oy, wz, 80 + (i % 3) * 18, col, k); sG('cone', fx, deck - 2, fzz, wx + ox * 0.6, wy + oy * 0.6, wz, 30, mix3(col, [1, 1, 1], 0.5), k * 0.8);
    bG('sph', fx, deck - 1.5, -60 - (i % 2) * 30, 64, 1.6, 52, col, 0.2 + 0.06 * Math.sin(t * 0.03 + i));   // the light pooling on the marble floor
    for (let m = 0; m < 3; m++) { const q = ((t * 0.0035 + i * 0.17 + m / 3) % 1), px = fx + (wx + ox - fx) * q + Math.sin(t * 0.03 + m + i) * 10, py = deck - 2 + (wy + oy - deck) * q, pz = fzz + (wz - fzz) * q;
      bG('sph', px, py, pz, 2.4, 2.4, 2.4, [1, 0.95, 0.85], 0.6 * Math.sin(q * Math.PI)); } }              // dust motes drifting in the beams
  // the prisms flash rainbow glints as they turn
  N.PR.forEach(([x, y, z, s], i) => { const g = Math.max(0, Math.sin(t * 0.024 + i * 1.9)) ** 6; if (g > 0.05) { const gx = cx + x, gy = deck - (y + Math.sin(t * 0.02 + i * 1.7) * 14);
    bG('star4', gx + 12, gy - 20, z + 30, 16 * g * s, 16 * g * s, 4, [1, 1, 1], 1.3 * g, 0, t * 0.05); for (let k = 0; k < 3; k++) sG('tube', gx, gy, z + 20, gx + (k - 1) * 60 * s, gy + 120 * s, z + 40, 2, cathCol(k * 2, 0), 0.5 * g); } });
  // a soft golden haze round the window
  bG('sph', wx, wy, wz - 30, 360 * F.s, 360 * F.s, 30, [1, 0.82, 0.55], 0.12);
}

/* ============================== canvas-fallback background ============================== */
function bgCathedral() {                                                    // golden-hour sky, the rose window, spires and god rays
  const t = G.time, c = G.cam, ox = -(c.x - 640) * 0.04, oy = -(c.y - 330) * 0.04;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a5ab8'); g.addColorStop(0.55, '#ffc890'); g.addColorStop(1, '#e8a8a0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cx = W / 2 + ox, cy = H * 0.34 + oy, R = Math.min(W, H) * 0.24;
  ctx.fillStyle = '#d6c6e0'; ctx.fillRect(cx - R * 1.6, cy - R * 0.9, R * 3.2, H);                                           // the west front
  for (const sx of [-1, 1]) { ctx.fillStyle = '#e8dcf0'; ctx.fillRect(cx + sx * R * 1.9 - R * 0.32, cy - R * 0.6, R * 0.64, H);   // the towers + spires
    ctx.fillStyle = '#5a4a8a'; ctx.beginPath(); ctx.moveTo(cx + sx * R * 1.9 - R * 0.36, cy - R * 0.6); ctx.lineTo(cx + sx * R * 1.9, cy - R * 2.1); ctx.lineTo(cx + sx * R * 1.9 + R * 0.36, cy - R * 0.6); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { const a = 1.1 + i * 0.18 + Math.sin(t * 0.004 + i) * 0.05; ctx.fillStyle = rgba(CATH_GLASS[i], 0.09);   // god rays
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * H * 1.6 - 60, cy + Math.sin(a) * H * 1.6); ctx.lineTo(cx + Math.cos(a) * H * 1.6 + 60, cy + Math.sin(a) * H * 1.6); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  for (let i = 0; i < 12; i++) { const a0 = i / 12 * Math.PI * 2, a1 = a0 + Math.PI * 2 / 12; ctx.fillStyle = CATH_GLASS[i % 6]; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.03 + i);   // the rose window
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 + 0.03, a1 - 0.03); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.strokeStyle = '#f2eaf4'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.42, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2); ctx.fill();
}
