/* NEON BRAWL — the v14 Item Shop maps, everything but their gameplay (data/stages.js · game/hazards.js):
 *
 *   Japanese Garden     a spring temple garden: the arena is a wooden deck on a mossy stone island in a koi pond — koi
 *                       circle under lily pads and lotus flowers, ripples spread, two cherry trees shed petals, stone
 *                       lanterns glow at the water's edge, a vermilion torii and an arched bridge stand in the mist.
 *   The Runaway Train   a steampunk express at full steam across a sunset canyon: the arena is the roof of a brass-trimmed
 *                       carriage with an observation canopy, coupled to a rear car and a modelled locomotive (boiler bands,
 *                       a flared smokestack pouring steam, a headlamp, three driving wheels turning their connecting rod);
 *                       sleepers, telegraph poles, sagebrush and mesas race past at their own parallax speeds. Hazard: a
 *                       riveted girder bridge sweeps over the roofs — get down onto the main roof.
 *   The Giant Pinball   inside a roaring pinball table: neon bumpers (a lit cap, a chrome skirt, a ring that flashes when
 *   Machine             it fires someone) bounce fighters back into the fight; a backglass with neon rings and a live
 *                       7-segment score that counts every bumper hit; two flippers snapping below the table, chasing
 *                       arrow inserts, a chrome ball looping a wire ramp. Hazard: MULTIBALL — a giant chrome ball rolls
 *                       across the table.
 *
 * Each map has its own lighting environment, procedural sky, deep scenery, stage-block detailing, a scene graph of set
 * pieces (cached meshes, GPU instanced), per-frame animated details in the dynamic batches, a light rig, a soundtrack
 * and a canvas-fallback background. The hooks live in render/stage3d.js and render/fx3d.js.                        */
'use strict';

/* ============================== registries ============================== */
Object.assign(THEME3D, { garden: 'garden', train: 'canyon', pinball: 'arcade' });
Object.assign(LIGHT_RIG, { garden: 'sakura', train: 'steam', pinball: 'arcade' });
Object.assign(WX_STAGE, { garden: ['petals'], train: ['ash'], pinball: ['confetti'] });
Object.assign(ATMO, { garden: ['petal', 40, ['#ffb0c8', '#ffd6e6', '#ffffff']], train: ['ember', 24, ['#ffb84d', '#ff8a2a', '#fff0c8']], pinball: ['mote', 34, ['#ff3df0', '#3dfff0', '#ffe14d']] });
Object.assign(BACKGROUNDS, { garden: bgGarden, train: bgTrain, pinball: bgPinball });
Object.assign(GENRES, {
  steampunk: { kick: ['punch', [0, 6, 8, 14]], snare: ['snare', [4, 12]], ghost: [2, 6, 10, 14], hat: ['shaker', ALL], bass: ['pluck', [0, 4, 8, 12], -2], arp: ['brass', 2, 'chord', 1, 0.034], pad: ['organ', 0.016, 1500], lead: ['brass', 0.036, 1, 0.2], prog: [0, 3, 4, 0], fx: ['riser'] },   // a chugging train-beat swing
  chiptune:  { kick: ['punch', FOUR], snare: ['gated', [4, 12]], hat: ['tick', EIGHTHS], hat2: ['tick', ALL], bass: ['square', EIGHTHS, -2], arp: ['square', 1, 'updown', 1, 0.03], pad: ['saw', 0.012, 1400], lead: ['square', 0.034, 1, 0.5], prog: [0, 5, 3, 4], fx: ['riser'] }   // 8-bit arcade
});
Object.assign(STAGE_MUSIC, {
  garden:  ['asian', 78, 55, 'hirajoshi', 0.12, { name: 'Koi Pond Reverie', kick: ['soft', [0, 10]], snare: null, arp: ['koto', 2, 'updown', 1, 0.04], pad: ['sine', 0.04, 1000, 1.2], lead: ['flute', 0.034, 1, 0], fx: ['shimmer'] }],
  train:   ['steampunk', 152, 50, 'mixolydian', 0.16, { name: 'Full Steam Ahead' }],
  pinball: ['chiptune', 148, 55, 'major', 0, { name: 'TILT!' }]
});
Object.assign(SFX, {
  bumper() { const t = AUDIO.ctx.currentTime; tone({ type: 'square', f0: mtof(88), f1: mtof(76), dur: 0.12, gain: 0.07 }); tone({ type: 'triangle', f0: mtof(100), dur: 0.08, gain: 0.05, at: t + 0.03 });
    noise({ f0: 6000, dur: 0.06, gain: 0.08, filter: 'highpass' }); },
  whistle() { const t = AUDIO.ctx.currentTime; for (const [n, d] of [[79, 0], [83, 0], [79, 0.55], [83, 0.55]]) tone({ type: 'sawtooth', f0: mtof(n), dur: 0.45, gain: 0.035, at: t + d, attack: 0.05, verb: 0.5, filter: 'lowpass', ff: 2400 });
    noise({ f0: 3000, dur: 0.9, gain: 0.05, filter: 'bandpass', at: t }); },
  multiball() { const t = AUDIO.ctx.currentTime; [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone({ type: 'square', f0: mtof(n), dur: 0.09, gain: 0.05, at: t + i * 0.06 })); }
});
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type === 'bumper') sfx('bumper');
  else if (type === 'hazardWarn' && d.kind === 'bridge') sfx('whistle');
  else if (type === 'hazardWarn' && d.kind === 'multiball') sfx('multiball');
});

/* ============================== hook tables (called from render/stage3d.js + fx3d.js) ============================== */
const MAP_ENV = {
  garden(E) { E.fog = [0.92, 0.8, 0.84]; E.sky = [0.72, 0.68, 0.78]; E.light = [1.1, 1.02, 0.96]; E.rim = [1, 0.78, 0.86]; E.bright = true; },   // a soft spring afternoon
  train(E) { E.fog = [0.74, 0.5, 0.42]; E.sky = [0.62, 0.5, 0.5]; E.light = [1.02, 0.9, 0.8]; E.rim = [1, 0.66, 0.42]; },                    // dusty canyon sunset
  pinball(E) { E.fog = [0.08, 0.03, 0.14]; E.sky = [0.5, 0.3, 0.62]; E.light = [1, 0.95, 1.05]; E.rim = [1, 0.4, 0.95]; }                       // neon dark
};
const SKY_EXT = {
  garden(S) { S.Zen = [0.36, 0.58, 0.92]; S.Hor = [1, 0.86, 0.9]; S.Gnd = [0.6, 0.7, 0.6]; S.K = [0.05, 0, 0.55, 0]; S.SunDir = V3.norm([0.55, 0.28, -1]); S.SunCol = [1, 0.94, 0.85];
    S.Cl1 = [1, 0.97, 0.98]; S.Cl2 = [0.98, 0.8, 0.86]; S.horGlow = 0.5; S.cloudH = 6; },
  canyon(S) { S.Zen = [0.18, 0.12, 0.32]; S.Hor = [1, 0.62, 0.36]; S.Gnd = [0.5, 0.26, 0.16]; S.K = [0.085, 0.05, 0.5, 0]; S.SunDir = V3.norm([-0.7, 0.08, -1]); S.SunCol = [1, 0.7, 0.36];
    S.Cl1 = [1, 0.74, 0.5]; S.Cl2 = [0.6, 0.3, 0.32]; S.horGlow = 1.1; S.cloudH = 5; },
  arcade(S) { S.Zen = [0.02, 0.01, 0.05]; S.Hor = [0.18, 0.04, 0.22]; S.Gnd = [0.04, 0.01, 0.06]; S.K = [0, 0.6, 0, 0]; S.horGlow = 1.2;
    S.neb = { k: [0.62, 0, 0.62, 0.3], a: [0.9, 0.2, 0.9], b: [0.1, 0.9, 0.95], c: [1, 0.6, 0.9] }; }
};
// deep-scenery colours: [body, accent, emissive] (the default palette mix would turn blossoms brown)
const SCENERY_COLS = { garden: ['#5e7262', '#ffb2cc', '#ffd08a'], canyon: ['#8a4a2a', '#c8743a', '#ffb84d'], arcade: ['#1a1030', '#5a2a9a', '#ff3df0'] };
const SCENERY_EXT = {
  garden(put, r, deep, top, X0, X1) {                                         // misty mountains, pagodas, cherry groves, a distant waterfall of mist
    for (let i = 0; i < 9; i++) { const s = r(500, 1100); put('cone', r(X0, X1), top - r(1000, 1300), deep(-2200, -4200), s, r(900, 1700), s * 0.8, 0, r(0, 6)); }
    for (let i = 0; i < 5; i++) { const x = r(X0, X1), z = deep(-900, -2600), b = top - r(700, 900);
      for (let k = 0; k < 4; k++) { const w = 150 - k * 26; put('box', x, b + 70 + k * 110, z, w * 0.62, 90, w * 0.62, 0); put('cone', x, b + 110 + k * 110, z, w, 34, w, 1); } put('cone', x, b + 540, z, 10, 120, 10, 2); }
    for (let i = 0; i < 26; i++) { const x = r(X0, X1), z = deep(-500, -2400), b = top - r(700, 900), h = r(180, 320);
      put('cyl', x, b, z, r(8, 14), h, r(8, 14), 0); for (let k = 0; k < 5; k++) put('sph', x + r(-70, 70), b + h + r(-30, 50), z + r(-50, 50), r(50, 90), r(40, 70), r(50, 80), 1); }
    for (let i = 0; i < 6; i++) put('sph', r(X0, X1), top - r(700, 900), deep(-400, -2200), r(260, 560), 26, r(160, 300), 2);           // glinting pools
  },
  canyon(put, r, deep, top, X0, X1) {                                         // buttes and mesas in a red desert, distant mountains
    for (let i = 0; i < 26; i++) { const w = r(220, 640), h = r(260, 900), x = r(X0 - 1500, X1 + 1500), z = deep(-1800, -4200), b = top - r(900, 1100);
      put('rbox', x, b + h / 2, z, w, h, w * r(0.5, 0.9), 0); put('rbox', x, b + h - 18, z, w * 1.04, 40, w * 0.92, 1); }
    for (let i = 0; i < 8; i++) { const s = r(700, 1400); put('cone', r(X0, X1), top - r(1100, 1300), deep(-3200, -4600), s, r(700, 1200), s * 0.7, 0, r(0, 6)); }
  },
  arcade(put, r, deep, top, X0, X1) {                                         // cabinet walls, giant coin stacks, neon tubes and stars
    for (let i = 0; i < 22; i++) { const w = r(260, 520), h = r(700, 1600), x = r(X0, X1), z = deep(-1200, -3600), b = top - r(800, 1000);
      put('box', x, b + h / 2, z, w, h, w * 0.6, 0); put('box', x, b + h * r(0.4, 0.9), z + w * 0.31, w * 0.86, r(8, 18), 4, 2); }
    for (let i = 0; i < 14; i++) { const x = r(X0, X1), z = deep(-900, -2600), b = top - r(700, 900), n = 3 + (r(0, 6) | 0);
      for (let k = 0; k < n; k++) put('cyl', x + r(-8, 8), b + k * 34, z, 80, 30, 80, 1); }
    for (let i = 0; i < 40; i++) put('octa', r(X0, X1), top + r(-300, 1500), deep(-600, -3400), r(10, 26), r(10, 26), r(10, 26), 2, r(0, 6), r(0, 6));
  }
};
const DECO_EXT = {
  garden(kind, w, h, d, add, pal, R, C, main) {                               // a wooden engawa deck on a stone island · red-lacquered bridge planks
    const hw = w / 2, fz = d / 2;
    if (main) {
      for (let x = -hw + 6, k = 0; x < hw - 26; x += 40, k++) add('box', x + 20, 0.6, 0, 38, 1.4, d - 14, k & 1 ? [0.55, 0.38, 0.24] : [0.6, 0.42, 0.27], 0);   // deck planks
      for (let row = 0; row < 3; row++) for (let x = -hw + 18 + (row % 2) * 22; x < hw - 14; x += 44) add('sph', x, -14 - row * 17, fz + 2, 20 + R() * 4, 8.5, 5, mix3([0.48, 0.47, 0.44], [0.3, 0.34, 0.3], R()), 0);   // a dry-stone front
      for (let x = -hw + 10; x < hw - 6; x += 18) add('sph', x + 9, 0.5, fz - 4 - R() * 8, 8 + R() * 4, 4, 7, [0.38, 0.6, 0.3], 0);                // moss along the lip
      add('box', 0, -2, fz + 0.5, w - 10, 3, 2, C('#2a1a12'), 0);
    } else {
      for (let x = -hw + 6; x < hw - 2; x += 24) for (const z of [-fz + 8, fz - 8]) add('box', x, 7, z, 3.4, 14, 3.4, C('#c8301e'), 0.05);   // railing posts
      for (const z of [-fz + 8, fz - 8]) { add('box', 0, 14, z, w - 6, 3, 3.6, C('#d8381e'), 0.05); for (const sx of [-1, 1]) add('sph', sx * (hw - 6), 16, z, 3.6, 3.6, 3.6, C('#ffcf5a'), 0.2); }
      add('box', 0, -h / 2, fz + 1, w + 6, h, 3, C('#a8261a'), 0);
    }
  },
  train(kind, w, h, d, add, pal, R, C, main) {                                // a riveted, brass-trimmed carriage roof + its lit windows
    const hw = w / 2, fz = d / 2, brass = C('#d8a24a'), dark = C('#2a1a12');
    for (let x = -hw + 14; x < hw - 8; x += 34) add('box', x, 1.6, 0, 6, 3.2, d - 8, mix3(brass, dark, 0.62), 0);                             // roof ribs
    add('box', 0, -2, fz + 1, w - 6, 4, 3, brass, 0.15); add('box', 0, -h + 4, fz + 1, w - 6, 4, 3, brass, 0.1);
    for (let x = -hw + 12; x < hw - 8; x += 22) add('sph', x, -6, fz + 2, 1.8, 1.8, 1.4, brass, 0.2);                                           // rivets
    if (main) {
      const n = 7, pw = (w - 40) / n;
      for (let i = 0; i < n; i++) { const x = -hw + 20 + pw * (i + 0.5);
        if (i === 3) { add('box', x, -h / 2 - 2, fz + 1.5, pw * 0.5, h - 20, 2, dark, 0); add('sph', x + pw * 0.15, -h / 2, fz + 3, 2, 2, 2, brass, 0.3); continue; }   // the door
        add('rbox', x, -h * 0.42, fz + 1.4, pw * 0.62, h * 0.42, 2.5, C('#ffd890'), 1.1); add('box', x, -h * 0.42, fz + 2.2, pw * 0.66, 2, 1.5, brass, 0.1); }
      for (let x = -hw + 30; x < hw; x += 120) add('cyl', x, -h - 10, 0, 6, 100, 6, C('#3a3a40'), 0, 0, -Math.PI / 2);                            // under-floor pipes
    } else add('cyl', 0, 3.5, 0, 9, 5, 9, C('#4a4a50'), 0);                                                                                      // a roof vent
  },
  pinball(kind, w, h, d, add, pal, R, C, main) {                              // chrome guide rails, rollover lights and lane arrows
    const hw = w / 2, fz = d / 2, chrome = [0.86, 0.88, 0.95];
    for (const z of [fz - 5, -fz + 5]) add('cyl', -hw + 6, 3, z, 3, w - 12, 3, chrome, 0.15, 0, -Math.PI / 2);
    if (main) { for (let i = 0; i < 9; i++) add('cyl', -hw + 40 + i * (w - 80) / 8, 0.8, 0, 7, 1.6, 7, C(pal.plat), 0.6);                          // rollover star lights (lit per frame)
      for (let i = 0; i < 6; i++) add('tri', -hw + 60 + i * (w - 120) / 5, -h / 2, fz + 1, 12, 3, 18, C('#2a1840'), 0, 0, Math.PI / 2, Math.PI / 2); }
    else for (let x = -hw + 10; x < hw - 6; x += 18) add('box', x + 4, -h / 2, fz + 1, 8, h - 4, 2, C(pal.edge), 0.5, 0, 0.5);
  }
};
const MAP3D = { garden: collectGarden3D, train: collectTrain3D, pinball: collectPinball3D };
const LIGHT_EXT = {
  sakura(L, S, t, cx, top) { L(S.x + S.w + 500, top + 600, 300, 2000, [1, 0.88, 0.8], 0.7); L(cx, top - 140, 200, 900, [1, 0.62, 0.78], 0.45);
    for (const sx of [-1, 1]) L(cx + sx * (S.w / 2 + 70), top - S.h + 42, 150, 340, [1, 0.72, 0.38], 0.85 + 0.12 * Math.sin(t * 0.21 + sx)); },
  steam(L, S, t, cx, top) { L(S.x - 700, top + 300, 120, 2600, [1, 0.62, 0.32], 1.05); L(cx + 760, top + 22, 60, 760, [1, 0.95, 0.75], 0.85);
    L(cx + 440, top - 10, 90, 300, [1, 0.45, 0.15], 0.75 + 0.2 * Math.sin(t * 0.6) + 0.1 * Math.sin(t * 1.7)); L(cx, top + 220, 160, 700, [1, 0.78, 0.55], 0.4); },
  arcade(L, S, t, cx, top) { (ST.bumpers || []).forEach((b, i) => { if (GL3D.plN < 6) { const fl = (BUMP.flash[i] || 0) / 14; L(b.x, -b.y, 60, 240 + fl * 160, fl > 0 ? [1, 1, 1] : col3(ST.pal.edge), 0.55 + fl * 1.8); } });
    L(cx, top + 520, -700, 1600, [0.85, 0.3, 1], 0.6); L(cx, top - 300, 120, 700, [0.25, 0.95, 1], 0.45 + 0.15 * Math.sin(t * 0.1)); }
};
const HAZ3D_EXT = { bridge: bridge3D, multiball: multiball3D };

/* ============================== Japanese Garden ============================== */
let GARDEN_SG = null;
function gardenScene() {
  if (GARDEN_SG) return GARDEN_SG;
  const S = STAGE, pondY = -S.h - 50, m = (col, o) => Object.assign({ col, spec: 0.45, shin: 30, outline: 1.3 }, o || {});
  const blob = (k, pos, scl, mat, tick) => new SceneNode(k, { pos, scl, mat, tick, meshKey: 'gd:blob', build: () => GEO.superellipsoid(0.92, 0.92, 26, 18), ink: true });
  const cyl = (k, pos, scl, rot, mat, r1) => new SceneNode(k, { pos, scl, rot: rot || [0, 0, 0], mat, meshKey: 'gd:cyl' + (r1 || 1), build: () => GEO.cylinder(28, true, r1 || 1), ink: true });
  const box = (k, pos, scl, rot, mat) => new SceneNode(k, { pos, scl, rot: rot || [0, 0, 0], mat, meshKey: 'gd:box', build: () => GEO.rcube(0.12, 3), ink: true });
  const root = new SceneNode('garden');
  // the koi pond: a wide glassy disc under the island, rimmed with rounded stones along the near bank
  root.add(new SceneNode('pond', { pos: [0, pondY, -160], scl: [1100, 2, 460], meshKey: 'gd:pond', build: () => GEO.cylinder(72, true), mat: { col: [0.16, 0.38, 0.46], spec: 1.4, shin: 140, metal: 0.35, alpha: 0.86, emis: 0.04, rimK: 0.3, outline: 0, shadow: false } }));
  for (let i = 0; i < 26; i++) { const x = -1000 + i * 80 + Math.sin(i * 7.3) * 18; root.add(blob('bank' + i, [x, pondY + 4, 300 + Math.sin(i * 3.1) * 16], [30 + (i * 13) % 16, 14 + (i * 7) % 8, 26], m(mix3([0.5, 0.5, 0.48], [0.36, 0.42, 0.34], (i % 3) / 2)))); }
  // the stone island under the deck
  for (const [x, y, z, sx, sy, sz] of [[-S.w * 0.28, -S.h - 30, -10, 190, 64, 120], [S.w * 0.26, -S.h - 38, 4, 170, 70, 110], [0, -S.h - 22, -70, 260, 56, 120]])
    root.add(blob('isle' + x, [x, y, z], [sx, sy, sz], m([0.42, 0.42, 0.4], { spec: 0.1, shin: 8 })));
  // two cherry trees (+ one far back): leaning trunks, a cloud of blossom that sways in the breeze
  const tree = (k, x, z, s, lean) => { const t = new SceneNode(k, { pos: [x, pondY, z], scl: [s, s, s], rot: [0, 0, lean] }), bark = m([0.28, 0.18, 0.14], { spec: 0.1, shin: 8 });
    t.add(cyl(k + 'tr', [0, 0, 0], [16, 210, 16], [0, 0, 0], bark, 0.7));
    t.add(cyl(k + 'b1', [0, 180, 0], [9, 120, 9], [0, 0, 0.7], bark, 0.5), cyl(k + 'b2', [0, 170, 0], [8, 110, 8], [0, 0, -0.8], bark, 0.5));
    const crown = new SceneNode(k + 'cr', { pos: [0, 250, 0], tick: (n, tt) => { n.rot[2] = Math.sin(tt * 0.012 + x) * 0.03; n.rot[0] = Math.sin(tt * 0.009 + z) * 0.02; } });
    const pinks = [[1, 0.56, 0.74], [0.98, 0.68, 0.82], [0.92, 0.46, 0.66], [1, 0.78, 0.88]];
    for (let i = 0; i < 14; i++) { const a = i * 2.39, rr = 40 + (i % 4) * 26; crown.add(blob(k + 'bl' + i, [Math.cos(a) * rr, (i % 3) * 26 - 10, Math.sin(a) * rr * 0.7], [70 - (i % 3) * 10, 46, 60], m(pinks[i % 4], { spec: 0.2, shin: 10, emis: 0.08 }))); }
    return t.add(crown); };
  root.add(tree('treeL', -S.w / 2 - 190, -240, 1.1, 0.12), tree('treeR', S.w / 2 + 210, -320, 1.25, -0.1), tree('treeB', -160, -720, 0.9, 0.04));
  // stone lanterns (tōrō) at the water's edge
  const stone = m([0.62, 0.6, 0.56], { spec: 0.08, shin: 6 });
  for (const sx of [-1, 1]) { const L = new SceneNode('toro' + sx, { pos: [sx * (S.w / 2 + 70), pondY, 150] });
    L.add(blob('tb' + sx, [0, 8, 0], [34, 16, 30], stone), cyl('ts' + sx, [0, 18, 0], [9, 62, 9], [0, 0, 0], stone), box('tf' + sx, [0, 92, 0], [30, 26, 30], [0, 0, 0], stone),
      new SceneNode('tw' + sx, { pos: [0, 92, 15.5], scl: [16, 12, 1], meshKey: 'gd:box', build: () => GEO.rcube(0.12, 3), mat: { col: [1, 0.78, 0.42], glow: 1.4, glowPow: 0.6 } }),
      new SceneNode('tr' + sx, { pos: [0, 104, 0], scl: [34, 26, 34], rot: [0, Math.PI / 4, 0], meshKey: 'gd:pyr', build: () => GEO.cylinder(4, true, 0.001), mat: stone, ink: true }),
      blob('tk' + sx, [0, 134, 0], [5, 7, 5], stone));
    root.add(L); }
  // the torii far back, and a red arched bridge to the right
  const red = m([0.86, 0.22, 0.14], { spec: 0.6, shin: 50 }), black = m([0.1, 0.08, 0.08]);
  const torii = new SceneNode('torii', { pos: [70, pondY, -860] });
  for (const sx of [-1, 1]) torii.add(cyl('tp' + sx, [sx * 150, 0, 0], [16, 380, 16], [0, 0, 0], red), box('tbase' + sx, [sx * 150, 6, 0], [44, 12, 44], [0, 0, 0], black));
  torii.add(box('kasaL', [-110, 392, 0], [250, 22, 34], [0, 0, 0.06], black), box('kasaR', [110, 392, 0], [250, 22, 34], [0, 0, -0.06], black), box('shimaki', [0, 372, 0], [420, 16, 28], [0, 0, 0], red),
    box('nuki', [0, 300, 0], [370, 14, 18], [0, 0, 0], red), box('gakuzuka', [0, 336, 0], [16, 56, 14], [0, 0, 0], red));
  const bridge = new SceneNode('bridge', { pos: [S.w / 2 + 470, pondY, -520], rot: [0, -0.35, 0] });
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10), x = -Math.cos(a) * 180, y = Math.sin(a) * 70;
    bridge.add(box('bd' + i, [x, y + 6, 0], [40, 8, 90], [0, 0, Math.cos(a) * 0.38], red));
    if (i % 2 === 0) for (const sz of [-1, 1]) bridge.add(cyl('bp' + i + sz, [x, y + 6, sz * 42], [3, 26, 3], [0, 0, 0], red)); }
  root.add(torii, bridge);
  // lily pads + lotus flowers on the near water
  const lily = m([0.24, 0.52, 0.26], { spec: 0.6, shin: 60 }), lotus = m([1, 0.66, 0.82], { spec: 0.3, shin: 20, emis: 0.1 });
  for (let i = 0; i < 9; i++) { const x = -520 + i * 130 + Math.sin(i * 4.1) * 30, z = 120 + Math.sin(i * 2.3) * 80;
    root.add(new SceneNode('pad' + i, { pos: [x, pondY + 2.5, z], scl: [26 + (i % 3) * 6, 1.4, 22 + (i % 2) * 6], rot: [0, i, 0], meshKey: 'gd:cylc', build: () => GEO.cylinder(28, true), mat: lily, ink: true }));
    if (i % 3 === 1) for (let p = 0; p < 6; p++) root.add(new SceneNode('lo' + i + p, { pos: [x, pondY + 6, z], rot: [0.5, p * TAU / 6, 0], scl: [5, 14, 4], meshKey: 'gd:petal', build: () => GEO.cylinder(12, true, 0.001), mat: lotus })); }
  return (GARDEN_SG = { root });
}
// koi: [radius x, radius z, centre x, centre z, speed, phase, body colour, spot colour]
const KOI = [[420, 120, -120, 110, 0.006, 0, [1, 0.42, 0.12], [1, 1, 1]], [360, 90, 260, 150, -0.008, 2, [1, 1, 0.98], [0.95, 0.22, 0.1]], [520, 140, 40, 60, 0.005, 4, [1, 0.72, 0.18], [0.12, 0.08, 0.08]],
             [300, 70, -420, 200, -0.009, 1, [0.95, 0.25, 0.1], [1, 0.95, 0.9]], [260, 90, 480, 90, 0.007, 3, [1, 0.96, 0.9], [1, 0.5, 0.1]], [440, 110, -20, 210, -0.0055, 5, [0.98, 0.55, 0.15], [1, 1, 1]]];
function collectGarden3D() {
  const S = STAGE, N = gardenScene(), t = G.time, cx = S.x + S.w / 2, gy = S.y + S.h + 50;          // (gy: the pond surface in game coordinates, y down)
  N.root.pos[0] = cx; N.root.pos[1] = -S.y; sgDraw(N.root, t);
  for (const [ax, az, ox, oz, sp, ph, col, spot] of KOI) {                                           // koi gliding round the pond, tails beating
    const a = t * sp + ph, x = cx + ox + Math.cos(a) * ax, z = oz + Math.sin(a) * az, dx = -Math.sin(a) * ax * Math.sign(sp), dz = Math.cos(a) * az * Math.sign(sp), yaw = Math.atan2(-dz, dx), wig = Math.sin(t * 0.25 + ph) * 0.35;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    bL('sph', x, gy - 3, z, 17, 6, 7, col, 0.05, yaw); bL('sph', x + fx * 4, gy - 4.5, z + fz * 4, 7, 3.4, 4, spot, 0.05, yaw);
    bL('sph', x - fx * 17, gy - 3, z - fz * 17, 8, 2, 7, col, 0.05, yaw + wig);
    if (Math.floor(t / 7 + ph * 13) % 23 === 0) bG('ring', x + fx * 18, gy - 1, z + fz * 18, 10 + (t % 7) * 3, 2, 10 + (t % 7) * 3, [1, 1, 1], 0.4);   // a nibble at the surface
  }
  for (let i = 0; i < 5; i++) { const q = ((t * 0.006 + i * 0.2) % 1), x = cx - 600 + hash(i * 3.7) * 1200, z = -40 + hash(i * 5.3) * 260;      // slow ripples spreading
    bG('ring', x, gy - 1, z, 8 + q * 70, 2, 8 + q * 70, [1, 1, 1], 0.35 * (1 - q)); }
  for (let i = 0; i < 14; i++) { const x = cx - 700 + ((hash(i * 9.1) * 1400 + t * 0.15 * (0.5 + hash(i))) % 1400), z = -60 + hash(i * 2.9) * 320;   // fallen petals floating on the water
    bF('sph', x, gy - 1.2, z, 3.2, 0.6, 2.2, [1, 0.78, 0.86], 0.4, hash(i) * 6); }
  for (const sx of [-1, 1]) { const fl = 0.85 + 0.15 * Math.sin(t * 0.21 + sx) + 0.08 * Math.sin(t * 0.9 + sx * 3);                  // the lanterns' glow
    bG('sph', cx + sx * (S.w / 2 + 70), gy - 92, 150, 34 * fl, 30 * fl, 34 * fl, [1, 0.72, 0.38], 0.35 * fl); }
}

/* ============================== The Runaway Train ============================== */
const TRAIN_SPEED = 16;                                                                              // world units per frame the scenery races past
let TRAIN_SG = null;
function trainScene() {
  if (TRAIN_SG) return TRAIN_SG;
  const m = (col, o) => Object.assign({ col, spec: 0.55, shin: 40, outline: 1.3 }, o || {}), brass = m([0.85, 0.62, 0.26], { spec: 1.2, shin: 80, metal: 0.8 }), steel = m([0.18, 0.18, 0.2], { spec: 0.8, shin: 60, metal: 0.6 });
  const iron = m([0.12, 0.12, 0.14], { spec: 0.6, shin: 40, metal: 0.5 }), maroon = m([0.42, 0.12, 0.1], { spec: 0.5, shin: 30 }), green = m([0.1, 0.24, 0.18], { spec: 0.7, shin: 50 }), glowW = { col: [1, 0.85, 0.55], glow: 1.3, glowPow: 0.6 };
  const box = (k, pos, scl, mat, rot) => new SceneNode(k, { pos, scl, rot: rot || [0, 0, 0], mat, meshKey: 'tr:box', build: () => GEO.rcube(0.1, 3), ink: true });
  const cyl = (k, pos, scl, rot, mat, r1) => new SceneNode(k, { pos, scl, rot: rot || [0, 0, 0], mat, meshKey: 'tr:cyl' + (r1 || 1), build: () => GEO.cylinder(36, true, r1 || 1), ink: true });
  const tor = (k, pos, r, rot, mat) => new SceneNode(k, { pos, scl: [r, r, r], rot, mat, meshKey: 'tr:tor', build: () => GEO.torus(48, 12, 0.12) });
  // a spoked wheel on an axle along Z: spins with the speed of the train (k = 1 / radius)
  const wheel = (k, pos, R, w) => { const ax = new SceneNode(k, { pos, rot: [Math.PI / 2, 0, 0] }), spin = new SceneNode(k + 's', { tick: (n, t) => { n.rot[1] = -t * TRAIN_SPEED / R; } });
    spin.add(cyl(k + 'd', [0, -w / 2, 0], [R * 0.8, w, R * 0.8], [0, 0, 0], iron), tor(k + 'r', [0, 0, 0], R * 0.92, [0, 0, 0], steel));
    for (let i = 0; i < 3; i++) spin.add(box(k + 'sp' + i, [0, w * 0.55, 0], [R * 1.6, 3, 4], brass, [0, i * Math.PI / 3, 0]));
    spin.add(cyl(k + 'h', [0, -w * 0.7, 0], [R * 0.22, w * 1.4, R * 0.22], [0, 0, 0], brass));
    return ax.add(spin); };
  const root = new SceneNode('train');                                                               // (origin: the main roof's centre)
  // the main carriage's two bogies
  for (const bx of [-250, 250]) { root.add(box('bog' + bx, [bx, -90, 0], [150, 18, 150], iron)); for (const wx of [-42, 42]) for (const wz of [-66, 66]) root.add(wheel('w' + bx + wx + wz, [bx + wx, -102, wz], 22, 12)); }
  // the rear car (under the left platform) + its bogie
  root.add(box('rcar', [-430, -24, 0], [126, 106, 150], maroon), box('rcarT', [-430, 28, 0], [130, 6, 154], brass), box('rcarB', [-430, -77, 0], [130, 6, 154], brass));
  for (let i = 0; i < 3; i++) root.add(new SceneNode('rwin' + i, { pos: [-466 + i * 36, -14, 76], scl: [22, 26, 2], meshKey: 'tr:box', build: () => GEO.rcube(0.1, 3), mat: glowW }));
  for (const wx of [-470, -390]) for (const wz of [-66, 66]) root.add(wheel('rw' + wx + wz, [wx, -102, wz], 22, 12));
  root.add(box('coupL', [-354, -70, 0], [34, 10, 14], iron), box('coupR', [356, -70, 0], [36, 10, 14], iron));
  // the locomotive: cab (under the right platform), boiler with brass bands, dome, flared smokestack, headlamp, cowcatcher
  root.add(box('cab', [440, -14, 0], [140, 130, 150], green), box('cabT', [440, 52, 0], [148, 6, 158], brass));
  for (const wz of [-1, 1]) root.add(new SceneNode('cabwin' + wz, { pos: [462, 6, wz * 76], scl: [44, 34, 2], meshKey: 'tr:box', build: () => GEO.rcube(0.1, 3), mat: { col: [1, 0.55, 0.2], glow: 1.1, glowPow: 0.7 } }));
  root.add(cyl('boiler', [508, -22, 0], [52, 216, 52], [0, 0, -Math.PI / 2], green));
  for (const bx of [540, 600, 660, 712]) root.add(tor('band' + bx, [bx, -22, 0], 53, [0, 0, -Math.PI / 2], brass));
  root.add(cyl('stack', [676, 26, 0], [17, 56, 17], [0, 0, 0], iron), cyl('stackF', [676, 80, 0], [17, 30, 17], [0, 0, 0], iron, 1.7),
    new SceneNode('dome', { pos: [600, 32, 0], scl: [26, 20, 26], meshKey: 'tr:dome', build: () => GEO.superellipsoid(0.8, 1, 24, 16), mat: brass, ink: true }),
    cyl('lamp', [712, 22, 0], [14, 26, 14], [0, 0, -Math.PI / 2], brass),
    new SceneNode('lampG', { pos: [740, 22, 0], scl: [9, 9, 9], meshKey: 'tr:ball', build: () => GEO.sphere(18, 12), mat: { col: [1, 0.95, 0.7], glow: 2, glowPow: 0.5 } }),
    box('cow', [742, -86, 0], [44, 34, 130], iron, [0, 0, 0.6]), box('front', [722, -22, 0], [10, 108, 108], iron), box('frame', [600, -78, 0], [300, 14, 140], iron));
  for (let i = 0; i < 3; i++) for (const wz of [-62, 62]) root.add(wheel('dw' + i + wz, [530 + i * 80, -96, wz], 34, 14));
  // the connecting rod: pinned to each driving wheel's crank, so it orbits as the wheels turn
  root.add(new SceneNode('rod', { pos: [610, -96, 72], scl: [168, 6, 4], meshKey: 'tr:box', build: () => GEO.rcube(0.1, 3), mat: brass, ink: true,
    tick: (n, t) => { const a = t * TRAIN_SPEED / 34; n.pos[0] = 610 + Math.cos(a) * 20; n.pos[1] = -96 - Math.sin(a) * 20; } }));
  // the observation canopy's brass posts (fighters walk between them; the canopy roof is the top platform)
  for (const px of [-70, 70]) for (const pz of [-46, 46]) root.add(cyl('post' + px + pz, [px, 0, pz], [3.6, 108, 3.6], [0, 0, 0], brass));
  // the rails + trackbed (the sleepers scroll every frame)
  for (const z of [-66, 66]) root.add(box('rail' + z, [0, -128, z], [7000, 8, 8], steel));
  root.add(box('bed', [0, -146, 0], [7000, 26, 240], m([0.36, 0.26, 0.2], { spec: 0.05, shin: 6 })));
  return (TRAIN_SG = { root });
}
function collectTrain3D() {
  const S = STAGE, N = trainScene(), t = G.time, cx = S.x + S.w / 2, topY = S.y;                     // (game coordinates below: y down)
  N.root.pos[0] = cx; N.root.pos[1] = -S.y; sgDraw(N.root, t);
  const wrap = (v, p) => ((v % p) + p) % p, base = topY + 133;
  for (let i = 0; i < 120; i++) { const x = cx - 3000 + wrap(i * 50 - t * TRAIN_SPEED, 6000); bL('box', x, base, 0, 14, 6, 186, [0.3, 0.2, 0.14], 0); }   // sleepers
  for (let i = 0; i < 12; i++) { const x = cx - 3000 + wrap(i * 520 - t * TRAIN_SPEED, 6240), z = -270;                                          // telegraph poles + sagging wires
    bL('cyl', x, base, z, 6, 360, 6, [0.32, 0.22, 0.16], 0); bL('box', x, base - 352, z, 70, 6, 6, [0.32, 0.22, 0.16], 0);
    for (const sx of [-28, 28]) { bL('sph', x + sx, base - 358, z, 3.4, 4, 3.4, [0.85, 0.9, 1], 0.2);
      const nx = x + 520; sL('tube', x + sx, base - 358, z, (x + nx) / 2 + sx, base - 330, z, 0.8, [0.12, 0.12, 0.14], 0); sL('tube', (x + nx) / 2 + sx, base - 330, z, nx + sx, base - 358, z, 0.8, [0.12, 0.12, 0.14], 0); } }
  for (let i = 0; i < 40; i++) { const x = cx - 2600 + wrap(i * 137 - t * TRAIN_SPEED, 5480), z = i % 2 ? 190 + hash(i) * 120 : -190 - hash(i) * 200;   // sagebrush whipping past
    const bs = 12 + hash(i * 3) * 12; bL('sph', x, base - 8, z, bs, bs * 0.8 + 4, bs, [0.28, 0.34, 0.18], 0); bL('sph', x + bs * 0.6, base - 6, z + 4, bs * 0.7, bs * 0.6, bs * 0.7, [0.34, 0.4, 0.22], 0); }
  for (let i = 0; i < 9; i++) { const x = cx - 4200 + wrap(i * 960 - t * 3, 8640), h = 160 + hash(i * 4.1) * 300, w = 280 + hash(i * 1.7) * 300, sh = 0.75 + hash(i * 2.2) * 0.3;   // mesas at mid-distance (slower parallax)
    bL('rbox', x, base + 160 - h / 2, -2100, w, h, w * 0.6, [0.6 * sh, 0.3 * sh, 0.2 * sh], 0); bL('rbox', x, base + 160 - h + 10, -2100, w * 1.05, 26, w * 0.64, [0.74 * sh, 0.42 * sh, 0.26 * sh], 0); }
  const sx = cx + 676, sy = topY - 110;                                                                 // steam pouring from the smokestack, streaming back
  for (let i = 0; i < 12; i++) { const q = ((t * 0.02 + i / 12) % 1), s = 14 + q * 46;
    bA('sph', sx - q * 520 - hash(i) * 30, sy - q * 120 - Math.sin(q * 5 + i) * 14, (hash(i * 3) - 0.5) * 40, s, s * 0.8, s, [0.92, 0.9, 0.9], 0.55 * (1 - q)); }
  for (let i = 0; i < 6; i++) { const y = topY - 60 - hash(i * 5.7 + (t >> 4)) * 260, x = cx + 900 - wrap(t * 38 + i * 260, 2200);       // speed streaks
    sG('tube', x, y, 160, x + 140, y, 160, 0.9, [1, 0.9, 0.75], 0.18); }
  if (t % 5 === 0) for (const bx of [-250, 250]) bG('sph', cx + bx - 40, topY + 124, 70, 6, 4, 6, [1, 0.8, 0.4], 0.8);              // sparks off the brake shoes
}
// the low bridge: warning lamps flash on a signal mast, then a riveted girder bridge on stone piers sweeps over the roofs
function bridge3D(h, r, warn, k) {
  const t = G.time, y0 = STAGE.y, steel = [0.24, 0.17, 0.13], dark = [0.12, 0.1, 0.09];
  if (warn) { const on = (t >> 3) & 1, mx = STAGE.x + STAGE.w + 80;
    bL('cyl', mx, y0 + 140, 140, 4, 320, 4, dark, 0); bL('box', mx, y0 - 176, 140, 34, 14, 6, dark, 0);
    for (const sx of [-1, 1]) { bL('sph', mx + sx * 12, y0 - 176, 145, 5, 5, 3, on === (sx > 0 ? 1 : 0) ? [1, 0.2, 0.12] : [0.3, 0.06, 0.05], on === (sx > 0 ? 1 : 0) ? 1.2 : 0); }
    bA('box', (r.x + r.x + r.w) / 2, r.y + r.h / 2, 0, r.w, r.h, 120, [1, 0.7, 0.3], 0.04 + 0.06 * k); return; }
  const cx = r.x + r.w / 2, yb = r.y + r.h;
  bL('rbox', cx, yb - 8, 0, r.w, 16, 700, steel, 0); bL('rbox', cx, yb - 92, 0, r.w, 14, 700, steel, 0);
  for (const z of [-340, 340]) { for (let x = r.x + 6; x <= r.x + r.w - 6; x += 43) bL('box', x, yb - 50, z, 8, 84, 8, steel, 0);
    for (let x = r.x + 6; x < r.x + r.w - 40; x += 43) { sL('cyl', x, yb - 10, z, x + 43, yb - 90, z, 2.6, steel, 0); sL('cyl', x + 43, yb - 10, z, x, yb - 90, z, 2.6, steel, 0); }
    if (z < 0) bL('rbox', cx, yb - 50 + 260, z * 1.2, r.w * 0.8, 520, 70, [0.5, 0.44, 0.38], 0); }   // (only the far pier: a near one would block the view)
  bL('box', cx, yb - 60, 350, 110, 24, 3, [1, 0.8, 0.2], 0.2); for (let i = 0; i < 5; i++) bF('box', cx - 44 + i * 22, yb - 60, 352, 8, 22, 1, dark, 0, 0, 0.6);
}

/* ============================== The Giant Pinball Machine ============================== */
let PINBALL_SG = null;
function pinballScene() {
  if (PINBALL_SG) return PINBALL_SG;
  const S = STAGE, P = ST.pal, edge = col3(P.edge), plat = col3(P.plat), m = (col, o) => Object.assign({ col, spec: 0.8, shin: 80, outline: 1.2 }, o || {});
  const chrome = m([0.88, 0.9, 0.96], { spec: 1.5, shin: 170, metal: 1 });
  const box = (k, pos, scl, mat, rot) => new SceneNode(k, { pos, scl, rot: rot || [0, 0, 0], mat, meshKey: 'pb:box', build: () => GEO.rcube(0.08, 3), ink: true });
  const root = new SceneNode('pinball');                                                             // (origin: the main stage's top centre)
  // the backglass: a dark panel with concentric neon rings, starburst rays and the score window
  root.add(box('glass', [0, 360, -1000], [2600, 1400, 20], m([0.05, 0.03, 0.12], { spec: 0.6, shin: 60 })), box('glassFrame', [0, 360, -1012], [2680, 1480, 10], chrome));
  [[220, edge], [300, plat], [380, [1, 0.88, 0.3]]].forEach(([r, c], i) => root.add(new SceneNode('ring' + i, { pos: [0, 380, -985], rot: [Math.PI / 2, 0, 0], scl: [r, r, r], meshKey: 'pb:ring', build: () => GEO.torus(96, 10, 0.02),
    tick: (n, t) => { n.mat.glow = 0.7 + 0.5 * Math.max(0, Math.sin(t * 0.08 - i * 1.2)); }, mat: { col: c, glow: 0.9, glowPow: 0.6 } })));
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; root.add(new SceneNode('ray' + i, { pos: [Math.cos(a) * 560, 380 + Math.sin(a) * 560, -988], rot: [0, 0, a], scl: [220, 5, 2], meshKey: 'pb:box', build: () => GEO.rcube(0.08, 3), mat: { col: i % 2 ? edge : plat, glow: 0.55, glowPow: 0.6 } })); }
  root.add(box('score', [0, -S.h - 136, -152], [300, 54, 6], m([0.02, 0.02, 0.03])), box('scoreF', [0, -S.h - 136, -156], [316, 68, 4], chrome));
  // the table walls: chrome rails either side, with neon guide lights
  for (const sx of [-1, 1]) { root.add(new SceneNode('wall' + sx, { pos: [sx * 610, -620, -60], scl: [9, 1500, 9], meshKey: 'pb:cyl', build: () => GEO.cylinder(28, true), mat: chrome, ink: true }));
    for (let i = 0; i < 8; i++) root.add(new SceneNode('wl' + sx + i, { pos: [sx * 604, -500 + i * 140, -50], scl: [5, 5, 5], meshKey: 'pb:ball', build: () => GEO.sphere(18, 12), mat: { col: i % 2 ? edge : plat, glow: 1.3, glowPow: 0.6 } })); }
  // the playfield floor far below the table, and a wire ramp loop in the background with its chrome ball
  root.add(box('field', [0, -S.h - 300, -400], [1800, 8, 1400], m([0.1, 0.05, 0.22], { spec: 0.9, shin: 90 })));
  root.add(new SceneNode('ramp', { pos: [-560, 230, -640], rot: [Math.PI / 2 - 0.25, 0, 0.18], meshKey: 'pb:ramp', build: () => GEO.loopTube(260, 160, 2, 0, 4, 140, 10), mat: chrome, ink: true }));
  return (PINBALL_SG = { root });
}
// 7-segment digits: segments a b c d e f g as [x, y, horizontal?]
const SEG7 = [[0, -1, 1], [0.5, -0.5, 0], [0.5, 0.5, 0], [0, 1, 1], [-0.5, 0.5, 0], [-0.5, -0.5, 0], [0, 0, 1]];
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
function collectPinball3D() {
  const S = STAGE, N = pinballScene(), t = G.time, cx = S.x + S.w / 2, P = ST.pal, edge = col3(P.edge), plat = col3(P.plat), gold = [1, 0.85, 0.3];
  N.root.pos[0] = cx; N.root.pos[1] = -S.y; sgDraw(N.root, t);
  // the bumpers: a dark base, a chrome skirt, a lit cap with a star, a neon ring that flashes white (and pops) when it fires
  (ST.bumpers || []).forEach((b, i) => { const fl = (BUMP.flash[i] || 0) / 14, pop = 1 + fl * 0.18, R = b.r * pop;
    const base = glSegment([b.x, -b.y, -26], [b.x, -b.y, 10], R * 1.02, R * 1.02, GL3D.mesh.cylCap); base.col = [0.06, 0.03, 0.12]; base.spec = 0.6; base.shin = 60; base.outline = 1.4;
    const cap = glSegment([b.x, -b.y, 10], [b.x, -b.y, 22], R * 0.8, R * 0.66, GL3D.mesh.cylCap); cap.col = fl > 0 ? [1, 1, 1] : mix3(edge, [1, 1, 1], 0.25); cap.spec = 1; cap.shin = 90; cap.emis = 0.12 + fl; cap.outline = 1.2;
    ringL(b.x, b.y, 4, R * 1.06, [0.88, 0.9, 0.96], 0.2); ringG(b.x, b.y, 12, R * 0.95, 4 + fl * 6, fl > 0 ? [1, 1, 1] : edge, 1.1 + fl * 1.5, 0, t * 0.05);
    bF('star', b.x, b.y, 23, R * 0.34, R * 0.34, 2, fl > 0 ? edge : gold, 1, 0, t * 0.02 + i);
    if (fl > 0) bG('sphHi', b.x, b.y, 10, R * 1.6, R * 1.6, R * 0.8, edge, 0.6 * fl); });
  // two flippers below the table: they snap up every couple of seconds, then fall back
  for (const sd of [-1, 1]) { const ph = ((t + (sd > 0 ? 40 : 0)) % 150) / 150, up = ph < 0.08 ? ph / 0.08 : ph < 0.2 ? 1 : Math.max(0, 1 - (ph - 0.2) / 0.12);
    const px = cx + sd * 210, py = S.y + 165, a = (0.42 - up * 0.82) * -sd, len = 130;
    sL('cyl', px, py, 0, px - sd * Math.cos(a) * len, py + Math.sin(a) * len * sd * -1, 0, 16, mix3(edge, [1, 1, 1], 0.4), 0.15);
    bL('cyl', px, py, -12, 18, 26, 18, [0.88, 0.9, 0.96], 0.2, 0, 0, Math.PI / 2); }
  // chasing arrow inserts on the stage front + the rollover lights on its top
  const front = MAIN_DEPTH / 2 + 2;
  for (let i = 0; i < 6; i++) { const on = ((t >> 3) - i + 60) % 6 < 2, x = S.x + 60 + i * (S.w - 120) / 5;
    bF('wedge', x, S.y + S.h / 2, front + 1, 11, 3, 16, on ? edge : mix3(edge, [0, 0, 0], 0.75), on ? 1 : 0.3, 0, Math.PI / 2, Math.PI / 2); }
  for (let i = 0; i < 9; i++) { const on = ((t >> 4) + i) % 3 === 0, x = S.x + 40 + i * (S.w - 80) / 8; bG('disc', x, S.y - 1.5, 0, 7, 1.2, 7, on ? plat : edge, on ? 1.4 : 0.35); }
  // the live score on the backglass (every bumper hit is worth 1,000)
  const digits = String(Math.min(99999999, BUMP.score)).padStart(8, '0'), dW = 24, sY = S.y + 196, z = -146;            // (a dot-matrix-style display under the table, between the HUD panels)
  for (let d = 0; d < 8; d++) { const dx = cx + (d - 3.5) * (dW + 10), segs = DIGITS[+digits[d]];
    SEG7.forEach(([sx2, sy2, hz], k) => { const on = segs.includes('abcdefg'[k]), x = dx + sx2 * dW, y = sY + sy2 * 16;
      bG('box', x, y, z, hz ? dW * 0.82 : 4, hz ? 4 : 14, 2, on ? [1, 0.55, 0.15] : [0.25, 0.08, 0.04], on ? (G.frame - BUMP.lit < 20 ? 2 : 1.3) : 0.25); }); }
  // a chrome ball looping the wire ramp in the background
  const ra = t * 0.03, rx = cx - 560 + Math.cos(ra) * 260, ry = S.y - 230 - Math.sin(ra) * 160 * Math.cos(0.25), rz = -640 + Math.sin(ra) * 40;
  const ball = glSphere(rx, -ry, rz, 18); ball.col = [0.9, 0.92, 0.98]; ball.metal = 1; ball.spec = 1.6; ball.shin = 180; ball.outline = 1;
}
// MULTIBALL: a giant chrome pinball rolling across the table (+ the warning lane lights)
function multiball3D(h, r, warn, k) {
  const t = G.time;
  if (warn) { for (let x = STAGE.x + ((t * 4 * h.dir) % 40 + 40) % 40; x < STAGE.x + STAGE.w - 10; x += 40) bG('box', x, STAGE.y - 1.5, MAIN_DEPTH / 2 - 8, 18, 2, 6, [1, 1, 1], 0.3 + 0.7 * k); return; }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, ball = glSphere(cx, -cy, 0, MULTI_R);
  ball.col = [0.9, 0.92, 0.98]; ball.metal = 1; ball.spec = 1.7; ball.shin = 190; ball.outline = 1.6; ball.rimK = 1.2; ball.rimCol = col3(ST.pal.edge);
  const a = (cx / MULTI_R) * h.dir; bG('star4', cx + Math.cos(a) * MULTI_R * 0.6, cy - Math.sin(a) * MULTI_R * 0.6, MULTI_R * 0.8, 6, 6, 3, [1, 1, 1], 1.2);
  for (let i = 0; i < 4; i++) sG('tube', cx - h.dir * (MULTI_R + 10 + i * 30), cy - 20 + i * 12, 0, cx - h.dir * (MULTI_R + 80 + i * 40), cy - 20 + i * 12, 0, 1.4, col3(ST.pal.edge), 0.35);
}

/* ============================== canvas-fallback backgrounds ============================== */
function bgGarden() {                                                         // pink-blue spring sky, misty mountains, a pagoda, cherry trees and the pond
  const t = G.time, c = G.cam, ox = -(c.x - 640) * 0.04, oy = -(c.y - 330) * 0.04;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6aa0ea'); g.addColorStop(0.6, '#ffd8e2'); g.addColorStop(1, '#a8c0b0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 3; k++) { ctx.fillStyle = ['rgba(150,170,190,0.55)', 'rgba(120,150,150,0.6)', 'rgba(90,120,110,0.7)'][k]; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 60; x += 60) ctx.lineTo(x, H * (0.5 + k * 0.08) - Math.abs(Math.sin(x * 0.004 + k * 2)) * 120 + oy * (k + 1)); ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); }
  const px = W * 0.72 + ox * 2, py = H * 0.62 + oy * 2; ctx.fillStyle = '#3a2a30';
  for (let k = 0; k < 4; k++) { const w = 90 - k * 16; ctx.fillRect(px - w * 0.3, py - k * 44 - 30, w * 0.6, 30); ctx.beginPath(); ctx.moveTo(px - w / 2, py - k * 44 - 26); ctx.lineTo(px + w / 2, py - k * 44 - 26); ctx.lineTo(px, py - k * 44 - 44); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(70,140,160,0.55)'; ctx.fillRect(0, H * 0.82 + oy * 3, W, H);
  for (const [tx, s] of [[W * 0.12, 1], [W * 0.9, 1.2]]) { const x = tx + ox * 3, y = H * 0.84 + oy * 3; ctx.strokeStyle = '#3a2420'; ctx.lineWidth = 10 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20 * s, y - 120 * s, x - 10 * s, y - 220 * s); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i * 2.39, r = (30 + (i % 4) * 22) * s; ctx.fillStyle = ['#ffb6cc', '#ffd0e0', '#ff9cbc'][i % 3]; ctx.beginPath(); ctx.arc(x - 10 * s + Math.cos(a) * r, y - 230 * s + Math.sin(a) * r * 0.6 + Math.sin(t * 0.02 + i) * 2, 34 * s, 0, Math.PI * 2); ctx.fill(); } }
}
function bgTrain() {                                                          // a sunset canyon, mesas and telegraph poles racing past
  const t = G.time, c = G.cam, oy = -(c.y - 330) * 0.04;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1c4a'); g.addColorStop(0.55, '#ff9a5a'); g.addColorStop(1, '#8a4a2a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sg = ctx.createRadialGradient(W * 0.2, H * 0.58, 10, W * 0.2, H * 0.58, 180); sg.addColorStop(0, 'rgba(255,236,190,1)'); sg.addColorStop(1, 'rgba(255,140,80,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) { const x = ((i * 260 - t * 1.5) % (W + 300) + W + 300) % (W + 300) - 150, w = 120 + hash(i) * 120, h = 60 + hash(i * 3) * 140;
    ctx.fillStyle = '#a0502e'; ctx.fillRect(x, H * 0.72 - h + oy * 2, w, h + 200); ctx.fillStyle = '#c86a3a'; ctx.fillRect(x - 6, H * 0.72 - h + oy * 2, w + 12, 12); }
  ctx.fillStyle = '#6a3a22'; ctx.fillRect(0, H * 0.78 + oy * 3, W, H);
  ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 6; for (let i = 0; i < 4; i++) { const x = ((i * 420 - t * 14) % (W + 420) + W + 420) % (W + 420) - 200; ctx.beginPath(); ctx.moveTo(x, H * 0.8); ctx.lineTo(x, H * 0.4); ctx.moveTo(x - 30, H * 0.42); ctx.lineTo(x + 30, H * 0.42); ctx.stroke(); }
}
function bgPinball() {                                                        // a neon backglass: rings, rays and a glowing score
  const t = G.time; ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const cx = W / 2, cy = H * 0.38;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ctx.strokeStyle = i % 2 ? 'rgba(255,61,240,0.25)' : 'rgba(61,255,240,0.25)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200); ctx.lineTo(cx + Math.cos(a) * 700, cy + Math.sin(a) * 700); ctx.stroke(); }
  [[120, '#ff3df0'], [170, '#3dfff0'], [220, '#ffe14d']].forEach(([r, col], i) => { ctx.strokeStyle = rgba(col, 0.5 + 0.4 * Math.max(0, Math.sin(t * 0.08 - i * 1.2))); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
  ctx.font = '900 34px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff8a2a'; ctx.fillText(String(BUMP.score).padStart(8, '0'), cx, H * 0.1);
  ctx.restore();
}
