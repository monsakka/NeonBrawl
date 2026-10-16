/* NEON BRAWL — v15 "AAA stage unification": every legacy arena rebuilt up to the fidelity of the v11–v14 maps.
 *
 * Each of the 35 legacy stages (everything before the Nebula Apex) gets, on top of its sky, deep scenery, light rig, weather
 * and soundtrack:
 *   1. a premium platform kit — the main stage block wrapped in a smooth bevelled metal rim + a glowing inlay line on its deck
 *      + a lower trim band (superellipse loop tubes, render/scene.js GEO.loopTube), and a themed undercarriage that gives the
 *      block real mass: a tech reactor (struts, a pulsing core, thruster glows) · a rock root (stacked boulders, glowing
 *      seams) · a built foundation (columns, an arch, a keystone)
 *   2. a HERO SET PIECE — a big, animated, hand-composed 3D landmark per arena (the F1 start gantry and grandstand, the
 *      coliseum arcade, an ice palace under aurora ribbons, a mega-tower with flying traffic, a pagoda against a setting sun,
 *      a ringed planet + station, an erupting volcano, a turning vault door, crystal clusters, waterfalls of floating isles,
 *      giant jellyfish, turning clock gears, a castle keep, a neon torii, a frozen summit, cooling towers, a planet under the
 *      station, a step pyramid, pyramids and an obelisk, a world tree, a haunted manor under the moon, energy rings, a
 *      jumbotron with lasers, a marble temple, an overpass, a turning telescope, sweeping light trails, a colossal stone head,
 *      a holo-ring, a hovering starfighter + gantry crane, quantum towers, a lava lake, the moon over altars, a passing
 *      subway train, warp gates) — built once as a scene graph (cached meshes, ink outlines, glow materials) and animated
 *      with per-node ticks
 * Presentation only; the gameplay geometry of every stage is untouched.                                                */
'use strict';

const STAGE15_LEGACY = new Set(['speedway', 'forge', 'aurora', 'neon', 'shrine', 'space', 'volcano', 'vault', 'matrix', 'haven', 'abyss', 'clockwork', 'storm', 'grid', 'peak', 'quantum',
  'skyline', 'temple', 'desert', 'forest', 'obsidian', 'starlight', 'stadium', 'sanctuary', 'highway', 'observatory', 'expressway', 'ruins', 'cybercol', 'dock', 'citadel', 'caldera', 'celestial', 'subway', 'astral', 'hordepit']);
const UNDER15 = { tech: ['hordepit', 'speedway', 'neon', 'vault', 'space', 'skyline', 'starlight', 'stadium', 'highway', 'observatory', 'expressway', 'cybercol', 'dock', 'citadel', 'celestial', 'subway', 'astral', 'grid'],
  rock: ['aurora', 'volcano', 'matrix', 'haven', 'abyss', 'peak', 'quantum', 'desert', 'forest', 'ruins', 'caldera'], stone: ['forge', 'shrine', 'clockwork', 'storm', 'temple', 'obsidian', 'sanctuary'] };
const H15K = { blob: () => GEO.superellipsoid(0.9, 0.9, 28, 20), rock: () => GEO.superellipsoid(0.7, 0.85, 22, 16), cyl: () => GEO.cylinder(32, true), cone: () => GEO.cylinder(28, true, 0.001),
  taper: () => GEO.cylinder(28, true, 0.62), box: () => GEO.rcube(0.08, 3), sph: () => GEO.sphere(40, 26), tor: () => GEO.torus(72, 14, 0.09), ring: () => GEO.torus(110, 8, 0.022),
  octa: () => GEO.octa(), pyr: () => GEO.cylinder(4, true, 0.001), disc: () => GEO.cylinder(48, true), hemi: () => GEO.superellipsoid(1, 1, 32, 20) };
const c15 = c => typeof c === 'string' ? col3(c) : c;
const m15 = (col, o) => Object.assign({ col: c15(col), spec: 0.4, shin: 30, outline: 1.3, rimK: 0.5 }, o || {});
const g15 = (col, k, p) => ({ col: c15(col), glow: k === undefined ? 1 : k, glowPow: p === undefined ? 0.6 : p });
function n15(kind, pos, scl, mat, rot, tick) {
  return new SceneNode(kind, { pos, scl, rot: rot || [0, 0, 0], mat, tick, meshKey: 'h15:' + kind, build: H15K[kind], ink: kind !== 'ring' });
}
const grp15 = (pos, kids, tick, rot, scl) => new SceneNode('g', { pos, rot: rot || [0, 0, 0], scl: scl || [1, 1, 1], tick }).add(...kids);
const pulse15 = (base, amp, sp, ph) => (n, t) => { const k = base + amp * Math.sin(t * sp + (ph || 0)); n.mat.glow = k; };

/* ---------------- the platform kit ---------------- */
function platKit15(id) {
  const S = STAGE, P = ST.pal, a = S.w / 2, b = MAIN_DEPTH / 2, edge = c15(P.edge), glow = c15(P.glow), plat = c15(P.plat), f1 = c15(P.fill[1]), f0 = c15(P.fill[0]);
  const metal = m15(mix3(f0, [0.85, 0.87, 0.95], 0.45), { spec: 1.1, shin: 90, metal: 0.65, outline: 1.1 });
  const loop = (k, sa, sb, y, r, mat) => new SceneNode(k, { meshKey: 'h15:' + k + ':' + id, build: () => GEO.loopTube(sa, sb, 8, y, r, 200, 12), mat });
  const root = new SceneNode('kit15');
  root.add(loop('rim', a + 1.5, b + 1.5, -3, 3.4, metal), loop('inlay', a - 18, b - 14, 0.7, 1.1, g15(edge, 0.8, 0.5)), loop('low', a + 1, b + 1, -S.h + 5, 2.6, metal));
  const fam = UNDER15.tech.includes(id) ? 'tech' : UNDER15.rock.includes(id) ? 'rock' : 'stone', y0 = -S.h;
  if (fam === 'tech') {                                                   // a reactor under the deck: struts, a ribbed core, thrusters
    const dark = m15(mix3(f1, [0.1, 0.1, 0.14], 0.4), { spec: 0.9, shin: 70, metal: 0.5 });
    root.add(n15('taper', [0, y0 - 70, 0], [a * 0.32, 70, b * 0.6], dark, [Math.PI, 0, 0]));
    for (const sx of [-1, 1]) { root.add(n15('box', [sx * a * 0.55, y0 - 46, 0], [a * 0.5, 22, b * 0.9], dark, [0, 0, sx * 0.18]));
      root.add(n15('cyl', [sx * a * 0.78, y0 - 30, 0], [16, 30, 16], dark, [Math.PI, 0, 0]), n15('sph', [sx * a * 0.78, y0 - 66, 0], [13, 9, 13], g15(glow, 1.1), null, pulse15(1, 0.35, 0.21, sx))); }
    root.add(n15('sph', [0, y0 - 150, 0], [26, 26, 26], g15(glow, 1.2, 0.5), null, pulse15(1.1, 0.4, 0.09)), n15('ring', [0, y0 - 150, 0], [46, 46, 46], m15(edge, { emis: 0.9, outline: 0 }), null, (n, t) => { n.rot[0] = 0.6 + Math.sin(t * 0.01) * 0.3; n.rot[1] = t * 0.02; }));
    for (let i = 0; i < 6; i++) root.add(n15('box', [-a * 0.6 + i * a * 0.24, y0 - 8, b + 1], [10, 6, 3], g15(i % 2 ? edge : glow, 1, 0.5), null, pulse15(0.9, 0.5, 0.15, i)));
  } else if (fam === 'rock') {                                            // the block sits on a root of boulders with glowing seams
    const R = seeded(id + '/u15'), rk = m15(mix3(f1, [0.2, 0.18, 0.2], 0.35), { spec: 0.15, shin: 10 });
    for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5, w = a * (0.62 - Math.abs(u) * 0.7);
      root.add(n15('rock', [u * a * 1.5, y0 - 20 - (0.5 - Math.abs(u)) * 70 - R() * 20, (R() - 0.5) * b * 0.6], [Math.max(30, w * 0.55), 34 + R() * 30, b * (0.5 + R() * 0.3)], rk, [R() * 3, R() * 0.4, 0])); }
    root.add(n15('cone', [0, y0 - 40, 0], [a * 0.45, 190, b * 0.55], rk, [Math.PI, 0, 0]));
    for (let i = 0; i < 4; i++) root.add(n15('box', [-a * 0.3 + i * a * 0.2, y0 - 60 - i * 12, b * 0.45], [3, 60, 2], g15(glow, 0.9, 0.5), [0, 0, 0.4 - i * 0.25], pulse15(0.8, 0.3, 0.07, i)));
  } else {                                                                // a built foundation: columns, an arch, a keystone
    const st = m15(mix3(f0, [0.82, 0.78, 0.7], 0.55), { spec: 0.2, shin: 14 });
    for (let i = 0; i < 6; i++) { const x = -a * 0.8 + i * a * 0.32; root.add(n15('cyl', [x, y0 - 120, b * 0.2], [11, 120, 11], st), n15('box', [x, y0 - 128, b * 0.2], [30, 10, 30], st)); }
    root.add(n15('box', [0, y0 - 26, b * 0.3], [a * 1.7, 22, 40], st), n15('box', [0, y0 - 30, b * 0.42], [30, 30, 16], m15(edge, { emis: 0.25 })));   // a lintel + keystone
  }
  return root;
}

/* ---------------- the hero set pieces ---------------- */
const HERO15 = {
  speedway(P) {                                                           // F1: grandstand, the start gantry with its five red lights, floodlights
    const R = [], dark = m15('#1c1f2a', { metal: 0.4, spec: 0.8, shin: 60 }), red = m15('#e01e2a'), white = m15('#f2f4f8');
    const stand = grp15([0, -520, -1100], [n15('box', [0, 0, 0], [1900, 160, 220], dark), n15('box', [0, 160, -60], [1900, 120, 120], dark), n15('box', [0, 280, -110], [1960, 18, 220], white, [0.12, 0, 0])]);
    for (let i = 0; i < 40; i++) stand.add(n15('box', [-930 + i * 47.5, 80 + (i % 2) * 70, 112], [30, 16, 4], g15(['#ff3b6b', '#3dd6ff', '#ffd23a', '#ffffff'][i % 4], 0.9, 0.5), null, pulse15(0.7, 0.4, 0.2, i)));
    const gantry = grp15([0, 260, -1000], [n15('box', [-380, -640, 0], [26, 820, 26], dark), n15('box', [380, -640, 0], [26, 820, 26], dark), n15('box', [0, 170, 0], [800, 60, 30], dark), n15('box', [0, 210, 6], [560, 26, 8], red)]);
    for (let i = 0; i < 5; i++) gantry.add(n15('sph', [-200 + i * 100, 170, 18], [22, 22, 6], g15('#ff2238', 1, 0.5), null, (n, t) => { const c = (t % 300) / 60; n.mat.glow = c > i && c < 5 ? 1.6 : 0.15; }));
    for (const sx of [-1, 1]) R.push(grp15([sx * 1150, -560, -760], [n15('cyl', [0, 0, 0], [14, 900, 14], dark), n15('box', [0, 900, 0], [140, 60, 20], dark), n15('box', [0, 900, 12], [120, 44, 4], g15('#fff6d8', 1.4, 0.5))]));
    return [stand, gantry, ...R];
  },
  forge(P) {                                                              // the coliseum arcade: two tiers of arches round the arena, banners, braziers
    const st = m15('#d8c49a', { spec: 0.15, shin: 10 }), out = [], ring = grp15([0, -560, -900], []);
    for (let i = 0; i < 26; i++) { const a = Math.PI * (0.08 + i / 25 * 0.84), x = -Math.cos(a) * 1500, z = -Math.sin(a) * 500;
      for (let tier = 0; tier < 2; tier++) ring.add(n15('cyl', [x, tier * 300, z], [22, 300, 22], st), n15('box', [x, tier * 300 + 290, z], [120, 30, 50], st, [0, -a + Math.PI / 2, 0]));
      if (i % 3 === 0) ring.add(n15('box', [x, 470, z + 30], [60, 140, 3], m15(i % 2 ? '#b8302a' : '#2a50b8', { spec: 0.1 }), [0, -a + Math.PI / 2, 0])); }
    ring.add(n15('box', [0, 600, -480], [3200, 40, 60], st));
    for (const sx of [-1, 1]) out.push(grp15([sx * 640, -260, -260], [n15('taper', [0, 0, 0], [30, 120, 30], m15('#4a3a2a')), n15('cone', [0, 120, 0], [34, 70, 34], g15('#ffb03a', 1.3, 0.4), null, (n, t) => { n.scl[1] = 70 + Math.sin(t * 0.4 + sx) * 14; })]));
    return [ring, ...out];
  },
  aurora(P) {                                                             // an ice palace on the far ridge under ribbons of aurora
    const ice = m15('#bfeaff', { spec: 1.3, shin: 110, metal: 0.2, emis: 0.12 }), pal = grp15([0, -560, -1300], []);
    for (const [x, h, w] of [[0, 900, 90], [-220, 640, 70], [220, 640, 70], [-400, 420, 56], [400, 420, 56], [-120, 520, 50], [120, 520, 50]]) pal.add(n15('octa', [x, h / 2, 0], [w, h / 2, w], ice));
    const rib = grp15([0, 700, -2000], []);
    for (let i = 0; i < 7; i++) rib.add(n15('box', [-1500 + i * 500, 0, -i * 30], [520, 180, 4], g15(i % 2 ? '#5affc8' : '#7a8aff', 0.55, 0.5), [0, 0, 0.1], (n, t) => { n.pos[1] = Math.sin(t * 0.012 + i * 0.9) * 90; n.rot[2] = Math.sin(t * 0.01 + i) * 0.18; n.mat.glow = 0.45 + 0.2 * Math.sin(t * 0.02 + i * 1.3); }));
    return [pal, rib];
  },
  neon(P) {                                                               // a mega-tower with a holo billboard and a stream of flying traffic
    const dark = m15('#141428', { spec: 1, shin: 80, metal: 0.5 }), tower = grp15([280, -620, -1150], [n15('box', [0, 0, 0], [260, 1700, 200], dark), n15('box', [0, 1700, 0], [180, 200, 140], dark), n15('cyl', [0, 1900, 0], [6, 260, 6], dark),
      n15('sph', [0, 2160, 0], [14, 14, 14], g15('#ff2f6a', 1.4), null, pulse15(1, 0.8, 0.12)), n15('box', [0, 1100, 102], [230, 300, 4], g15('#3dfff0', 0.75, 0.5), null, pulse15(0.65, 0.2, 0.05))]);
    for (let i = 0; i < 12; i++) tower.add(n15('box', [0, 160 + i * 120, 101], [240, 8, 2], g15(i % 2 ? '#ff3df0' : '#5a7aff', 0.8, 0.5)));
    const traffic = grp15([0, 380, -700], []);
    for (let i = 0; i < 8; i++) traffic.add(n15('box', [0, (i % 3) * 60, -(i % 2) * 120], [46, 12, 20], g15(i % 2 ? '#ffd23a' : '#ff4f6a', 1.1, 0.5), null, (n, t) => { n.pos[0] = ((t * (4 + i % 3) + i * 420) % 3400) - 1700; }));
    return [tower, traffic];
  },
  shrine(P) {                                                             // a five-roof pagoda against a huge setting sun, cloud banks
    const wood = m15('#7a2a1e', { spec: 0.3 }), roof = m15('#2a1a20'), sun = n15('sph', [-600, 380, -2600], [520, 520, 40], g15('#ffb070', 0.8, -0.4)), pag = grp15([520, -560, -1100], []);
    for (let k = 0; k < 5; k++) { const w = 240 - k * 34; pag.add(n15('box', [0, k * 150, 0], [w * 0.62, 120, w * 0.62], wood), n15('pyr', [0, k * 150 + 110, 0], [w * 0.75, 50, w * 0.75], roof, [0, Math.PI / 4, 0])); }
    pag.add(n15('cyl', [0, 800, 0], [6, 160, 6], m15('#ffcf6a', { metal: 0.6 })));
    const clouds = grp15([0, -300, -800], []); for (let i = 0; i < 9; i++) clouds.add(n15('blob', [-1600 + i * 400, (i % 3) * 30, -(i % 2) * 200], [260, 70, 120], m15('#ffd6c0', { spec: 0.05, emis: 0.15, outline: 0.8 }), null, (n, t) => { n.pos[0] = ((-1600 + i * 400 + t * 0.4) % 3600 + 3600) % 3600 - 1800; }));
    return [sun, pag, clouds];
  },
  space(P) {                                                              // a ringed planet and a turning wheel station
    const pl = grp15([-900, 300, -2600], [n15('sph', [0, 0, 0], [520, 520, 520], m15('#3a6ad8', { spec: 0.3, outline: 0, rimK: 1.2, rimCol: [0.4, 0.9, 1] }), null, (n, t) => { n.rot[1] = t * 0.0008; }),
      n15('ring', [0, 0, 0], [900, 900, 900], m15('#bfe8ff', { emis: 0.6, outline: 0, alpha: 0.85, cull: false }), [0.3, 0, -0.25])]);
    const hull = m15('#d8dce8', { metal: 0.5, spec: 1, shin: 90 }), st = grp15([700, 420, -1300], [n15('tor', [0, 0, 0], [260, 260, 260], hull, [1.2, 0, 0]), n15('cyl', [0, -40, 0], [26, 80, 26], hull, [Math.PI / 2 + 1.2, 0, 0]), n15('sph', [0, 0, 0], [40, 40, 40], g15('#5affc8', 0.9))], (n, t) => { n.rot[1] = t * 0.004; });
    for (let i = 0; i < 4; i++) st.add(n15('box', [0, 0, 0], [520, 8, 8], hull, [1.2, i * Math.PI / 4, 0]));
    return [pl, st];
  },
  volcano(P) {                                                            // an erupting volcano with lava rivers, blobs of lava arcing out
    const rock = m15('#3a1a14', { spec: 0.1 }), v = grp15([0, -640, -1500], [n15('cone', [0, 0, 0], [900, 900, 700], rock), n15('disc', [0, 840, 0], [150, 8, 110], g15('#ff6a1a', 1.4, 0.4), null, pulse15(1.2, 0.4, 0.08))]);
    for (let i = 0; i < 4; i++) v.add(n15('box', [-200 + i * 130, 420, 330 - Math.abs(i - 1.5) * 40], [16, 760, 4], g15('#ff7a2a', 0.9, 0.5), [0.42, 0, (i - 1.5) * 0.25]));
    for (let i = 0; i < 6; i++) v.add(n15('sph', [0, 880, 0], [26, 26, 26], g15('#ffb03a', 1.2), null, (n, t) => { const u = ((t * 0.006 + i / 6) % 1); n.pos[0] = Math.cos(i * 1.7) * u * 600; n.pos[1] = 880 + u * 900 - u * u * 1100; n.scl[0] = n.scl[1] = n.scl[2] = 26 * (1 - u * 0.6); }));
    return [v];
  },
  vault(P) {                                                              // a colossal circular vault door turning its locking wheel; data pillars
    const steel = m15('#3a4a40', { metal: 0.7, spec: 1.1, shin: 100 }), door = grp15([0, 380, -1500], [n15('disc', [0, 0, 0], [700, 60, 700], steel, [Math.PI / 2, 0, 0]), n15('tor', [0, 0, 70], [720, 720, 400], m15('#5aff9a', { emis: 0.5, metal: 0.4 }), [Math.PI / 2, 0, 0])]);
    const wheel = grp15([0, 0, 120], [], (n, t) => { n.rot[2] = t * 0.004; }); for (let i = 0; i < 6; i++) wheel.add(n15('box', [0, 0, 0], [560, 40, 30], steel, [0, 0, i * Math.PI / 6])); wheel.add(n15('cyl', [0, 0, -30], [120, 60, 120], steel, [Math.PI / 2, 0, 0]));
    door.add(wheel); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; door.add(n15('cyl', [Math.cos(a) * 640, Math.sin(a) * 640, 40], [36, 60, 36], steel, [Math.PI / 2, 0, 0])); }
    const cols = grp15([0, -600, -900], []); for (let i = 0; i < 8; i++) cols.add(n15('box', [-1400 + i * 400, 0, -(i % 2) * 200], [60, 1300, 60], g15('#3dff7a', 0.35, 0.5), null, pulse15(0.3, 0.15, 0.05, i)));
    return [door, cols];
  },
  matrix(P) {                                                             // crystal caverns: a giant glowing cluster, stalactites hanging from the dark
    const cr = (c, e) => m15(c, { spec: 1.4, shin: 120, emis: e || 0.35, metal: 0.1 }), cl = grp15([600, -600, -1200], []);
    for (let i = 0; i < 9; i++) cl.add(n15('octa', [(i - 4) * 70, 260 + (i % 3) * 120, (i % 2) * 60], [60 + (i % 3) * 20, 300 + (i % 4) * 110, 60], cr(i % 2 ? '#d07aff' : '#7ad8ff'), [0, i, (i - 4) * 0.12]));
    const top = grp15([0, 1100, -900], []); for (let i = 0; i < 14; i++) top.add(n15('cone', [-1600 + i * 240, 0, -(i % 3) * 140], [60 + (i % 3) * 30, -260 - (i % 4) * 120, 60], m15('#2a1a3a', { spec: 0.4 })));
    cl.add(n15('sph', [0, 400, 0], [260, 260, 260], g15('#c86bff', 0.35, -1.4), null, pulse15(0.3, 0.12, 0.04)));
    return [cl, top];
  },
  haven(P) {                                                              // floating isles with waterfalls pouring into the clouds
    const out = [], grass = m15('#6fcf4a'), earth = m15('#7a5a3a', { spec: 0.1 });
    for (const [x, y, z, s] of [[-900, 200, -1300, 1], [700, 380, -1700, 1.3], [1300, -60, -1000, 0.7], [-300, 520, -2200, 0.9]]) {
      out.push(grp15([x, y, z], [n15('blob', [0, 0, 0], [220, 40, 160], grass), n15('cone', [0, -20, 0], [200, -300, 150], earth), n15('box', [120, -260, 140], [40, 520, 2], g15('#bfeaff', 0.7, 0.5)),
        n15('cyl', [-60, 30, 0], [10, 90, 10], m15('#5a4632')), n15('blob', [-60, 150, 0], [70, 60, 70], m15('#4aa83a'))], (n, t) => { n.pos[1] = y + Math.sin(t * 0.01 + x) * 18; }, null, [s, s, s]));
    }
    return out;
  },
  abyss(P) {                                                              // the trench: giant glowing jellyfish drifting up, kelp swaying
    const out = [];
    for (let i = 0; i < 3; i++) { const j = grp15([-700 + i * 700, 0, -900 - i * 300], [n15('hemi', [0, 0, 0], [160, 120, 160], m15('#ff7ad8', { alpha: 0.75, emis: 0.5, spec: 1.2 }))], (n, t) => { n.pos[1] = 100 + Math.sin(t * 0.01 + i * 2) * 120; n.scl[0] = n.scl[2] = 1 + Math.sin(t * 0.05 + i) * 0.08; });
      for (let k = 0; k < 6; k++) j.add(n15('cyl', [Math.cos(k) * 90, -280, Math.sin(k) * 90], [6, 280, 6], g15('#ffb0e8', 0.6, 0.5), null, (n, t) => { n.rot[2] = Math.sin(t * 0.04 + k) * 0.15; }));
      out.push(j); }
    const kelp = grp15([0, -640, -600], []); for (let i = 0; i < 16; i++) kelp.add(n15('box', [-1500 + i * 200, 0, -(i % 3) * 150], [18, 600 + (i % 4) * 160, 6], m15('#1e8a5a', { spec: 0.2 }), null, (n, t) => { n.rot[2] = Math.sin(t * 0.02 + i) * 0.12; }));
    return [...out, kelp];
  },
  clockwork(P) {                                                          // the tower's works: three meshing gears and a swinging pendulum
    const brass = m15('#c8a050', { metal: 0.75, spec: 1.2, shin: 100 }), out = [];
    const gear = (x, y, z, r, sp) => { const g = grp15([x, y, z], [n15('disc', [0, 0, 0], [r, 30, r], brass, [Math.PI / 2, 0, 0]), n15('cyl', [0, 0, 20], [r * 0.25, 20, r * 0.25], m15('#5a4020'), [Math.PI / 2, 0, 0])], (n, t) => { n.rot[2] = t * sp; });
      const nt = Math.round(r / 22); for (let i = 0; i < nt; i++) g.add(n15('box', [Math.cos(i / nt * TAU) * r, Math.sin(i / nt * TAU) * r - 18, 0], [34, 36, 26], brass, [0, 0, i / nt * TAU - Math.PI / 2])); return g; };
    out.push(gear(-700, 300, -1200, 420, 0.004), gear(-110, 620, -1250, 230, -0.0073), gear(560, 140, -1150, 330, -0.0051));
    out.push(grp15([200, 900, -900], [n15('box', [0, -700, 0], [16, 700, 16], brass), n15('disc', [0, -740, 0], [90, 20, 90], brass, [Math.PI / 2, 0, 0])], (n, t) => { n.rot[2] = Math.sin(t * 0.03) * 0.35; }));
    return out;
  },
  storm(P) {                                                              // the ruined castle keep: towers, conical roofs, a lightning rod
    const st = m15('#5a5e74', { spec: 0.15 }), roof = m15('#2a2a3a'), k = grp15([-500, -600, -1400], [n15('box', [0, 0, 0], [500, 900, 300], st)]);
    for (const [x, h] of [[-300, 1100], [300, 1000], [0, 1300]]) k.add(n15('cyl', [x, 0, 60], [90, h, 90], st), n15('cone', [x, h, 60], [110, 260, 110], roof));
    k.add(n15('cyl', [0, 1560, 60], [4, 200, 4], m15('#c8ccd8', { metal: 0.8 })), n15('sph', [0, 1760, 60], [16, 16, 16], g15('#bfe8ff', 1), null, (n, t) => { n.mat.glow = (t % 200) < 8 ? 3 : 0.4; }));
    for (let i = 0; i < 9; i++) k.add(n15('box', [-240 + i * 60, 900, 60], [30, 50, 30], st));
    return [k];
  },
  grid(P) {                                                               // the neon dojo: a huge neon torii, hanging lanterns, bamboo
    const ne = (c, k) => g15(c, k || 1.1, 0.5), t = grp15([0, -560, -1100], [n15('box', [-420, 0, 0], [40, 900, 40], ne('#ff3d6a')), n15('box', [420, 0, 0], [40, 900, 40], ne('#ff3d6a')), n15('box', [0, 880, 0], [1100, 50, 50], ne('#ff3d6a', 1.3)), n15('box', [0, 740, 0], [940, 34, 34], ne('#3dfff0'))]);
    for (let i = 0; i < 6; i++) t.add(n15('blob', [-500 + i * 200, 620, 80], [34, 46, 34], g15('#ffb04a', 1, 0.5), null, (n, tt) => { n.rot[2] = Math.sin(tt * 0.03 + i) * 0.1; }));
    const bam = grp15([0, -600, -700], []); for (let i = 0; i < 18; i++) bam.add(n15('cyl', [(i < 9 ? -1 : 1) * (900 + (i % 9) * 70), 0, -(i % 4) * 80], [12, 1100 + (i % 5) * 100, 12], m15('#3a8a3a', { spec: 0.4 })));
    return [t, bam];
  },
  peak(P) {                                                               // the frozen summit, a frozen waterfall, glittering ice pillars
    const snow = m15('#f4f8ff', { spec: 0.6, shin: 40 }), rock = m15('#5a6478', { spec: 0.2 }), out = [];
    for (const [x, z, s] of [[-700, -1800, 1.2], [600, -2200, 1.6], [0, -2800, 2]]) out.push(grp15([x, -700, z], [n15('cone', [0, 0, 0], [600, 1100, 520], rock), n15('cone', [0, 640, 0], [256, 470, 220], snow)], null, null, [s, s, s]));
    const fall = grp15([-260, -600, -1200], []); for (let i = 0; i < 7; i++) fall.add(n15('octa', [i * 26 - 80, 500 - i * 60, 0], [40, 260, 16], m15('#bfeaff', { spec: 1.4, shin: 120, emis: 0.2, alpha: 0.85 })));
    return [...out, fall];
  },
  quantum(P) {                                                            // the wasteland: cooling towers venting toxic glow, leaking barrels
    const conc = m15('#5a5a48', { spec: 0.1 }), out = [];
    for (const [x, z, s] of [[-800, -1400, 1], [300, -1700, 1.25], [1100, -1250, 0.85]]) out.push(grp15([x, -640, z], [n15('taper', [0, 0, 0], [220, 700, 220], conc), n15('disc', [0, 700, 0], [140, 6, 140], g15('#9dff2e', 1.2, 0.4)),
      n15('blob', [0, 820, 0], [180, 120, 180], g15('#c6ff5a', 0.35, -1.2), null, (n, t) => { n.pos[1] = 820 + ((t * 1.2) % 300); n.mat.glow = 0.35 * (1 - ((t * 1.2) % 300) / 300); })], null, null, [s, s, s]));
    const bar = grp15([-500, -230, -400], []); for (let i = 0; i < 5; i++) bar.add(n15('cyl', [i * 60, 0, (i % 2) * 40], [22, 60, 22], m15(i % 2 ? '#ffd23a' : '#3a5a2a')));
    return [...out, bar];
  },
  skyline(P) {                                                            // the orbital station: a planet far below, modules and turning solar arrays
    const planet = n15('sph', [0, -2600, -3200], [2400, 2400, 2400], m15('#2a6ad8', { spec: 0.4, outline: 0, rimK: 1.4, rimCol: [0.5, 0.9, 1] }), null, (n, t) => { n.rot[1] = t * 0.0004; });
    const hull = m15('#e4e8f0', { metal: 0.5, spec: 1, shin: 90 }), mod = grp15([0, 620, -2000], [n15('cyl', [-700, 0, 0], [70, 1400, 70], hull, [0, 0, Math.PI / 2])]);
    for (const x of [-600, -150, 300]) mod.add(n15('cyl', [x, 0, 0], [110, 220, 110], hull, [0, 0, Math.PI / 2]));
    for (const sx of [-1, 1]) mod.add(grp15([sx * 820, 0, 0], [n15('box', [0, 0, 0], [40, 520, 260], m15('#2a3a8a', { metal: 0.6, spec: 1.3, shin: 120, emis: 0.1 }))], (n, t) => { n.rot[0] = t * 0.003; }));
    return [planet, mod];
  },
  temple(P) {                                                             // a stepped pyramid temple with fire braziers on its terraces
    const st = m15('#a86a3a', { spec: 0.1 }), p = grp15([0, -640, -1500], []);
    for (let k = 0; k < 6; k++) p.add(n15('box', [0, k * 130, 0], [1300 - k * 190, 130, 700 - k * 90], st));
    p.add(n15('box', [0, 780, 0], [200, 160, 160], m15('#7a3a1e')), n15('box', [0, 0, 340], [160, 780, 30], m15('#8a5a30'), [-0.55, 0, 0]));
    for (const sx of [-1, 1]) p.add(n15('cone', [sx * 420, 300, 260], [30, 80, 30], g15('#ffa03a', 1.3, 0.4), null, (n, t) => { n.scl[1] = 80 + Math.sin(t * 0.5 + sx) * 16; }));
    return [p];
  },
  desert(P) {                                                             // three pyramids, an obelisk and a half-buried colossus head
    const sand = m15('#e8b870', { spec: 0.1 }), out = [];
    for (const [x, z, s] of [[-700, -2000, 1], [200, -2400, 1.4], [1000, -1800, 0.8]]) out.push(n15('pyr', [x, -700, z], [700 * s, 760 * s, 700 * s], sand, [0, Math.PI / 4, 0]));
    out.push(grp15([-200, -600, -1000], [n15('box', [0, 0, 0], [60, 700, 60], m15('#c89a5a')), n15('pyr', [0, 700, 0], [44, 60, 44], m15('#ffd36e', { metal: 0.7 }), [0, Math.PI / 4, 0])]));
    out.push(grp15([700, -620, -1000], [n15('blob', [0, 0, 0], [200, 180, 170], sand), n15('box', [0, 40, 160], [180, 40, 20], m15('#2a4ab8')), n15('sph', [-60, 60, 150], [20, 16, 10], m15('#1a1a1a')), n15('sph', [60, 60, 150], [20, 16, 10], m15('#1a1a1a'))]));
    return out;
  },
  forest(P) {                                                             // the world tree: a vast trunk, a glowing canopy, giant mushrooms, fireflies
    const bark = m15('#3a2a24', { spec: 0.1 }), t = grp15([500, -640, -1400], [n15('taper', [0, 0, 0], [180, 1300, 180], bark)]);
    for (let i = 0; i < 9; i++) { const a = i * 2.4; t.add(n15('blob', [Math.cos(a) * 340, 1300 + (i % 3) * 120, Math.sin(a) * 200], [380, 220, 300], m15(i % 2 ? '#1e7a5a' : '#2a9a6a', { emis: 0.12 }))); }
    for (let i = 0; i < 5; i++) t.add(n15('cyl', [Math.cos(i * 1.3) * 200, 0, Math.sin(i * 1.3) * 200], [40, 160, 40], bark, [0, 0, Math.cos(i * 1.3) * 0.6]));
    const m = grp15([-700, -640, -800], []); for (let i = 0; i < 4; i++) m.add(n15('cyl', [i * 160, 0, -(i % 2) * 100], [24, 260 + i * 60, 24], m15('#e8e0c8')), n15('hemi', [i * 160, 260 + i * 60, -(i % 2) * 100], [130, 70, 130], g15(i % 2 ? '#3dffb8' : '#ff6ad5', 0.5, -0.5)));
    const ff = grp15([0, 0, -400], []); for (let i = 0; i < 18; i++) ff.add(n15('sph', [0, 0, 0], [5, 5, 5], g15('#f4ff8a', 1.5), null, (n, tt) => { n.pos[0] = Math.sin(tt * 0.01 + i * 1.7) * 900; n.pos[1] = 100 + Math.sin(tt * 0.017 + i) * 260; n.mat.glow = 0.8 + Math.sin(tt * 0.2 + i) * 0.7; }));
    return [t, m, ff];
  },
  obsidian(P) {                                                           // the haunted manor on its hill, lit windows, a moon and circling bats
    const st = m15('#2a2034', { spec: 0.2 }), roof = m15('#140c1c'), h = grp15([-300, -560, -1500], [n15('box', [0, 0, 0], [700, 420, 300], st), n15('pyr', [0, 420, 0], [520, 260, 230], roof, [0, Math.PI / 4, 0]),
      n15('cyl', [380, 0, 0], [90, 760, 90], st), n15('cone', [380, 760, 0], [120, 300, 120], roof)]);
    for (let i = 0; i < 8; i++) h.add(n15('box', [-260 + (i % 4) * 170, 120 + Math.floor(i / 4) * 160, 152], [50, 80, 4], g15('#ffb04a', 1, 0.5), null, pulse15(0.9, 0.4, 0.07, i * 3)));
    const moon = n15('sph', [700, 900, -2600], [280, 280, 40], g15('#f4ecd0', 0.9, -0.3));
    const bats = grp15([0, 500, -900], []); for (let i = 0; i < 7; i++) bats.add(n15('box', [0, 0, 0], [36, 8, 4], m15('#0a0610'), null, (n, t) => { const a = t * 0.012 + i * 0.9; n.pos[0] = Math.cos(a) * (400 + i * 40); n.pos[1] = Math.sin(a * 2) * 80; n.rot[2] = Math.sin(t * 0.6 + i) * 0.5; }));
    return [h, moon, bats];
  },
  starlight(P) {                                                          // final destination: gyroscope rings of energy around a core of light
    const edge = c15(P.edge), glow = c15(P.glow), g = grp15([0, 300, -1600], [n15('sph', [0, 0, 0], [180, 180, 180], g15(glow, 1.2, -0.5), null, pulse15(1, 0.3, 0.05))]);
    for (let i = 0; i < 4; i++) g.add(n15('ring', [0, 0, 0], [500 + i * 160, 500 + i * 160, 500 + i * 160], m15(i % 2 ? edge : glow, { emis: 1, outline: 0 }), null, (n, t) => { n.rot[0] = t * (0.004 + i * 0.002); n.rot[1] = t * 0.003 * (i % 2 ? -1 : 1) + i; }));
    return [g];
  },
  stadium(P) {                                                            // a stadium bowl, a giant jumbotron and sweeping lasers
    const dark = m15('#1a1428', { spec: 0.6, metal: 0.3 }), bowl = grp15([0, -600, -1200], [n15('box', [0, 200, -200], [3200, 400, 400], dark, [0.35, 0, 0])]);
    for (let i = 0; i < 30; i++) bowl.add(n15('box', [-1500 + i * 103, 240, 10], [70, 12, 4], g15(i % 3 ? '#ff3df0' : '#3dfff0', 0.8, 0.5), null, pulse15(0.6, 0.5, 0.3, i * 0.7)));
    const jt = grp15([0, 620, -1300], [n15('box', [0, 0, 0], [900, 460, 60], dark), n15('box', [0, 0, 32], [840, 400, 4], g15('#5a7aff', 0.7, 0.5), null, (n, t) => { n.mat.col = [0.4 + 0.3 * Math.sin(t * 0.03), 0.3, 0.8 + 0.2 * Math.sin(t * 0.05)]; })]);
    const las = grp15([0, -300, -700], []); for (let i = 0; i < 6; i++) las.add(n15('cyl', [-900 + i * 360, 0, 0], [5, 1600, 5], g15(i % 2 ? '#ff3df0' : '#3dfff0', 0.9, 0.5), null, (n, t) => { n.rot[2] = Math.sin(t * 0.02 + i) * 0.6; }));
    return [bowl, jt, las];
  },
  sanctuary(P) {                                                          // a marble temple in the clouds, a floating golden ring
    const mar = m15('#f2ece0', { spec: 0.5, shin: 40 }), t = grp15([0, -400, -1500], [n15('box', [0, -40, 0], [1100, 40, 500], mar), n15('pyr', [0, 560, 0], [640, 160, 280], mar, [0, Math.PI / 4, 0])]);
    for (let i = 0; i < 8; i++) t.add(n15('cyl', [-480 + i * 137, 0, 160], [34, 520, 34], mar));
    t.add(n15('box', [0, 520, 0], [1100, 50, 420], mar));
    const ring = n15('tor', [0, 1100, -1500], [260, 260, 260], m15('#ffd36e', { metal: 0.8, spec: 1.3, shin: 120, emis: 0.3 }), null, (n, tt) => { n.rot[0] = Math.PI / 2 + Math.sin(tt * 0.01) * 0.2; n.rot[1] = tt * 0.005; });
    return [t, ring];
  },
  highway(P) {                                                            // an overpass with lamp posts, a billboard, headlight streaks
    const con = m15('#3a3a48', { spec: 0.2 }), o = grp15([0, 120, -900], [n15('box', [0, 0, 0], [4000, 60, 160], con)]);
    for (let i = 0; i < 8; i++) o.add(n15('box', [-1750 + i * 500, -400, 0], [70, 400, 70], con), n15('cyl', [-1750 + i * 500, 60, 70], [5, 140, 5], con), n15('sph', [-1750 + i * 500, 200, 70], [12, 8, 12], g15('#ffd890', 1.2)));
    for (let i = 0; i < 6; i++) o.add(n15('box', [0, 40, 82], [80, 10, 4], g15(i % 2 ? '#ff3a3a' : '#fff4d0', 1.2, 0.5), null, (n, t) => { n.pos[0] = ((t * (8 + i) * (i % 2 ? -1 : 1) + i * 700) % 4000 + 4000) % 4000 - 2000; }));
    const bb = grp15([700, 300, -1300], [n15('box', [0, -500, 0], [30, 500, 30], con), n15('box', [0, 0, 0], [600, 260, 20], con), n15('box', [0, 0, 12], [560, 220, 4], g15('#ff3df0', 0.8, 0.5), null, pulse15(0.7, 0.2, 0.1))]);
    return [o, bb];
  },
  observatory(P) {                                                        // the observatory: a dome with a slit and a giant telescope tracking the sky
    const wh = m15('#e8ecf4', { spec: 0.9, shin: 80, metal: 0.2 }), d = grp15([1100, -700, -2300], [n15('cyl', [0, 0, 0], [380, 400, 380], wh), n15('hemi', [0, 400, 0], [380, 360, 380], wh)]);
    d.add(grp15([0, 620, 0], [n15('cyl', [0, 0, 0], [70, 520, 70], m15('#3a4a8a', { metal: 0.6, spec: 1.2, shin: 100 })), n15('disc', [0, 520, 0], [70, 4, 70], g15('#bfe8ff', 1))], (n, t) => { n.rot[2] = -0.6 + Math.sin(t * 0.004) * 0.35; }));
    const stars = grp15([0, 900, -2400], []); for (let i = 0; i < 24; i++) stars.add(n15('octa', [-2000 + (i * 173) % 4000, (i * 97) % 700, 0], [10, 10, 10], g15('#ffffff', 1.4), null, pulse15(1, 0.6, 0.1, i)));
    return [d, stars];
  },
  expressway(P) {                                                         // an elevated expressway curving through towers; light trails race along it
    const con = m15('#2a2a3a', { spec: 0.4 }), out = [grp15([0, -100, -1400], [n15('tor', [0, 0, 0], [1800, 120, 600], con, [0, 0, 0])])];
    const tr = grp15([0, -86, -1400], []); for (let i = 0; i < 10; i++) tr.add(n15('box', [0, 0, 0], [60, 8, 10], g15(i % 2 ? '#3dfff0' : '#ff3df0', 1.3, 0.5), null, (n, t) => { const a = t * 0.004 * (i % 2 ? 1 : -1) + i * 0.63; n.pos[0] = Math.cos(a) * 1800; n.pos[2] = Math.sin(a) * 600; n.rot[1] = -a; }));
    const tw = grp15([0, -700, -2200], []); for (let i = 0; i < 12; i++) tw.add(n15('box', [-2200 + i * 400, 0, -(i % 3) * 200], [220, 900 + (i * 137) % 900, 200], m15('#161828', { spec: 0.8, metal: 0.4 })));
    return [...out, tr, tw];
  },
  ruins(P) {                                                              // a colossal mossy stone head, broken columns, a waterfall
    const st = m15('#7a7a62', { spec: 0.1 }), moss = m15('#5a8a3a'), h = grp15([-600, -500, -1300], [n15('blob', [0, 0, 0], [320, 380, 280], st), n15('blob', [0, 340, 0], [330, 70, 290], moss),
      n15('box', [-110, 60, 260], [90, 30, 20], g15('#96ff78', 0.9, 0.5)), n15('box', [110, 60, 260], [90, 30, 20], g15('#96ff78', 0.9, 0.5)), n15('box', [0, -120, 260], [60, 120, 30], st)]);
    const cols = grp15([500, -620, -1000], []); for (let i = 0; i < 5; i++) cols.add(n15('cyl', [i * 140, 0, -(i % 2) * 120], [40, 260 + (i * 97) % 420, 40], st, [0, 0, (i % 3 - 1) * 0.08]));
    const fall = n15('box', [100, -200, -1600], [160, 1400, 4], g15('#bfeaff', 0.6, 0.5), null, pulse15(0.5, 0.15, 0.2));
    return [h, cols, fall];
  },
  cybercol(P) {                                                           // the holo-colosseum: a ring of light pillars and a turning holo-ring overhead
    const edge = c15(P.edge), out = [grp15([0, -600, -1000], [])];
    for (let i = 0; i < 20; i++) { const a = Math.PI * (0.06 + i / 19 * 0.88); out[0].add(n15('box', [-Math.cos(a) * 1500, 0, -Math.sin(a) * 500], [40, 1100, 40], g15(i % 2 ? edge : '#ff3df0', 0.7, 0.5), null, pulse15(0.6, 0.3, 0.08, i))); }
    out.push(n15('ring', [0, 700, -900], [900, 900, 900], m15(edge, { emis: 1, outline: 0 }), [Math.PI / 2 - 0.2, 0, 0], (n, t) => { n.rot[1] = t * 0.004; }));
    return out;
  },
  dock(P) {                                                               // the hangar: a starfighter hovering in its cradle, a gantry crane
    const hull = m15('#d8dce8', { metal: 0.5, spec: 1.1, shin: 100 }), f = grp15([500, 360, -1000], [n15('blob', [0, 0, 0], [240, 50, 70], hull), n15('box', [-40, 0, 0], [180, 12, 420], hull), n15('blob', [100, 30, 0], [70, 30, 40], m15('#3a8aff', { spec: 1.4, shin: 120 })),
      n15('sph', [-240, 0, 0], [28, 28, 28], g15('#5affff', 1.4), null, pulse15(1.2, 0.4, 0.3))], (n, t) => { n.pos[1] = 360 + Math.sin(t * 0.02) * 14; n.rot[2] = Math.sin(t * 0.013) * 0.04; });
    const steel = m15('#3a4048', { metal: 0.6 }), cr = grp15([-700, -600, -1100], [n15('box', [0, 0, 0], [50, 1300, 50], steel), n15('box', [300, 1280, 0], [800, 50, 50], steel), n15('cyl', [500, 1080, 0], [4, 200, 4], steel), n15('box', [500, 1040, 0], [80, 40, 80], m15('#ffd23a'))]);
    return [f, cr];
  },
  citadel(P) {                                                            // the quantum citadel: crystal towers in counter-rotating rings
    const cr = m15('#a8c8ff', { spec: 1.4, shin: 120, emis: 0.3 }), c = grp15([0, -600, -1500], []);
    for (const [x, h] of [[0, 1500], [-300, 1000], [300, 1100], [-560, 700], [560, 760]]) c.add(n15('octa', [x, h / 2, 0], [80, h / 2, 80], cr));
    for (let i = 0; i < 3; i++) c.add(n15('ring', [0, 500 + i * 300, 0], [400 + i * 60, 400 + i * 60, 400 + i * 60], m15(c15(P.edge), { emis: 1, outline: 0 }), [Math.PI / 2, 0, 0], (n, t) => { n.rot[1] = t * 0.006 * (i % 2 ? -1 : 1); n.rot[0] = Math.PI / 2 + Math.sin(t * 0.01 + i) * 0.2; }));
    return [c];
  },
  caldera(P) {                                                            // the caldera: a lava lake under the arena, jagged spires, a plume
    const rock = m15('#2a1410', { spec: 0.1 }), lake = n15('disc', [0, -700, -900], [2200, 6, 900], g15('#ff5a1a', 0.75, 0.4), null, pulse15(0.7, 0.15, 0.03));
    const sp = grp15([0, -700, -1200], []); for (let i = 0; i < 9; i++) sp.add(n15('cone', [-1600 + i * 400, 0, -(i % 2) * 300], [140, 600 + (i * 211) % 600, 120], rock));
    const plume = n15('blob', [1300, 200, -2600], [160, 380, 160], g15('#ff8a3a', 0.22, -1.2), null, (n, t) => { n.scl[1] = 380 + Math.sin(t * 0.02) * 60; });
    return [lake, sp, plume];
  },
  celestial(P) {                                                          // a great moon behind floating altars and a starlit torii
    const moon = n15('sph', [-500, 700, -2600], [600, 600, 600], m15('#e8e4f8', { spec: 0.2, outline: 0, emis: 0.35, rimK: 1.2, rimCol: [0.6, 0.6, 1] }));
    const gold = m15('#ffe6a8', { metal: 0.6, spec: 1.1 }), alt = grp15([0, 0, -1000], []);
    for (let i = 0; i < 4; i++) alt.add(grp15([-1000 + i * 650, 100 + (i % 2) * 160, 0], [n15('box', [0, 0, 0], [180, 40, 120], m15('#2a2848')), n15('octa', [0, 90, 0], [30, 50, 30], gold)], (n, t) => { n.pos[1] = 100 + (i % 2) * 160 + Math.sin(t * 0.015 + i) * 20; }));
    const t = grp15([600, -560, -1300], [n15('box', [-200, 0, 0], [30, 600, 30], gold), n15('box', [200, 0, 0], [30, 600, 30], gold), n15('box', [0, 600, 0], [560, 36, 40], gold)]);
    return [moon, alt, t];
  },
  subway(P) {                                                             // a tunnel mouth and a subway train thundering past behind the platform
    const con = m15('#2a3038', { spec: 0.2 }), tun = n15('tor', [0, -500, -1300], [900, 3000, 900], con, [Math.PI / 2, 0, 0]);   // (the tube's y scale = the tunnel's depth)
    const train = grp15([0, -470, -700], [], (n, t) => { n.pos[0] = ((t * 22) % 6000) - 3000; });
    for (let i = 0; i < 4; i++) { train.add(n15('box', [i * 420, 0, 0], [400, 160, 120], m15('#c8ccd8', { metal: 0.5, spec: 1 })));
      for (let k = 0; k < 4; k++) train.add(n15('box', [i * 420 - 150 + k * 100, 80, 61], [60, 40, 2], g15('#ffe8a8', 1.1, 0.5))); train.add(n15('box', [i * 420, 30, 61], [380, 10, 2], g15(c15(P.edge), 1, 0.5))); }
    return [tun, train];
  },
  hordepit(P) {                                                           // v16 the Horde Pit: the gladiator gates the waves pour out of, a ring of spiked pylons
    const steel = m15('#2a1a30', { metal: 0.6, spec: 1, shin: 80 }), out = [];
    for (const sx of [-1, 1]) { const g = grp15([sx * 820, -560, -700], [n15('box', [0, 0, 0], [420, 720, 120], steel), n15('box', [0, 0, 62], [260, 520, 4], g15('#ff3d6a', 0.55, 0.5), null, pulse15(0.5, 0.25, 0.08, sx))]);
      for (let i = 0; i < 6; i++) g.add(n15('box', [-110 + i * 44, 260, 66], [10, 520, 10], steel));
      out.push(g); }
    const ring = grp15([0, -640, -1300], []); for (let i = 0; i < 14; i++) { const a = Math.PI * (0.1 + i / 13 * 0.8); ring.add(n15('cone', [-Math.cos(a) * 1600, 0, -Math.sin(a) * 480], [40, 700 + (i % 3) * 140, 40], steel), n15('sph', [-Math.cos(a) * 1600, 720 + (i % 3) * 140, -Math.sin(a) * 480], [16, 16, 16], g15(i % 2 ? '#ff3d6a' : '#ff9a3d', 1.2), null, pulse15(1, 0.5, 0.1, i))); }
    return [...out, ring];
  },
  astral(P) {                                                             // the astral void: two warp gates and drifting star clusters
    const edge = c15(P.edge), out = [];
    for (const [x, s] of [[-800, 1], [900, 0.7]]) out.push(grp15([x, 300, -1600], [n15('tor', [0, 0, 0], [400, 400, 400], m15('#2a1a48', { metal: 0.5, spec: 1 }), [Math.PI / 2, 0, 0]), n15('disc', [0, 0, 0], [360, 4, 360], g15(edge, 0.55, -0.6), [Math.PI / 2, 0, 0], pulse15(0.5, 0.2, 0.06, x))], (n, t) => { n.rot[2] = t * 0.003; }, null, [s, s, s]));
    const st = grp15([0, 600, -2200], []); for (let i = 0; i < 30; i++) st.add(n15('octa', [-2200 + (i * 151) % 4400, (i * 89) % 900 - 300, -(i % 4) * 200], [12, 12, 12], g15(i % 3 ? '#ffffff' : edge, 1.3), null, pulse15(1, 0.5, 0.08, i)));
    return [...out, st];
  }
};

/* ---------------- per frame ---------------- */
const STAGE15_SG = new Map();                                            // built scene graphs, by stage id (rebuilt after a context loss with SG_MESH)
function collectStage15() {
  const id = ST.id; if (!STAGE15_LEGACY.has(id) || SET.stage15 === false) return;
  let N = STAGE15_SG.get(id);
  if (!N) { N = { kit: platKit15(id), hero: new SceneNode('hero15').add(...(HERO15[id] ? HERO15[id](ST.pal) : [])) }; STAGE15_SG.set(id, N); if (STAGE15_SG.size > 4) STAGE15_SG.delete(STAGE15_SG.keys().next().value); }
  const S = STAGE, t = G.time, cx = S.x + S.w / 2;
  N.kit.pos[0] = cx; N.kit.pos[1] = -S.y; sgDraw(N.kit, t);
  if (G.mode === 'menu' && G.screen !== 'scr-stage') return;              // (v16: the menus' orbiting camera would swing the landmarks behind the UI)
  N.hero.pos[0] = cx; N.hero.pos[1] = -S.y; sgDraw(N.hero, t);
}
