/* NEON BRAWL — 3D stages for the WebGL renderer (everything is real geometry; no painted textures anywhere).
 *   • the main stage and every floating platform are bevelled 3D prisms (real depth along Z), toon-shaded with ink
 *     outlines, coloured per face (lit top, darker sides);
 *   • each arena's identity is built from 3D detailing merged into the block: kerbs, tatami mats, floorboards, deck
 *     plates, columns, rivets, cogs, crystals, icicles, moss, roots, lanterns, chevrons, barnacles, glyphs…;
 *     animated details (lights, scrolling lane lines, light-up floors, swaying lanterns, spinning cogs) are rebuilt
 *     every frame in the dynamic batches;
 *   • neon light strips run round each platform top; real shadows from the key light fall across them;
 *   • a procedural toon sky (gradient, sun / moon / planet, banded cartoon clouds, stars, aurora) per arena theme;
 *   • deep-Z scenery (towers, peaks, islands, planets, crystals…) is generated per theme, merged into one
 *     vertex-coloured mesh and placed hundreds to thousands of units behind the arena, fading into distance fog.   */
'use strict';

const STAGE3D = { key: null, main: null, plats: [], scenery: null, env: null, sky: null, f: 0 };
const MAIN_DEPTH = 220, PLAT_DEPTH = 120;

/* ---- per-stage scenery theme ---- */
const THEME3D = {
  speedway: 'speedway', forge: 'colosseum', aurora: 'mountains', neon: 'city', shrine: 'temple', space: 'space', volcano: 'volcano', vault: 'crystal',
  matrix: 'crystal', haven: 'islands', abyss: 'reef', clockwork: 'gears', storm: 'castle', grid: 'temple', peak: 'mountains', quantum: 'wasteland',
  skyline: 'space', temple: 'temple', desert: 'desert', forest: 'forest', obsidian: 'castle', starlight: 'space', stadium: 'arena', sanctuary: 'islands',
  highway: 'city', observatory: 'space', expressway: 'city', ruins: 'jungle', cybercol: 'arena', dock: 'gears', citadel: 'crystal', caldera: 'volcano',
  celestial: 'islands', subway: 'tunnel', astral: 'space', nebula: 'nebula', training: 'holo', dragonspine: 'dragon', horizon: 'blackhole'
};
function seeded(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
const lum3 = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

/* ---- lighting environment from the stage palette ---- */
function stageEnv(st) {
  const P = st.pal, glow = col3(P.glow), edge = col3(P.edge), f0 = col3(P.fill[0]), f1 = col3(P.fill[1]), top = col3(P.top);
  const bright = lum3(f0) > 0.55;                                           // marble / snow / cloud arenas are lit like daylight
  const E = {
    light: bright ? [1.05, 1.0, 0.94] : mix3([1, 1, 1], top, 0.3).map(v => v * 0.95),
    sky: mix3(glow, [1, 1, 1], bright ? 0.65 : 0.45).map(v => v * (bright ? 0.6 : 0.5)),
    ground: mix3(f1, glow, 0.3).map(v => v * 0.42 + 0.06),
    rim: mix3(glow, edge, 0.4).map(v => v * 0.9),
    fog: mix3(f1, glow, bright ? 0.15 : 0.22).map(v => Math.min(1, v * (bright ? 1.15 : 0.62))),
    ink: [0.02, 0.02, 0.05, 1], glow, edge, bright
  };
  if (st.id === 'peak' || st.id === 'aurora') E.fog = [0.62, 0.72, 0.84];
  if (st.id === 'sanctuary' || st.id === 'haven' || st.id === 'shrine') E.fog = mix3(E.fog, [0.95, 0.85, 0.8], 0.4);
  if (st.id === 'abyss') E.fog = [0.03, 0.2, 0.3];
  if (st.id === 'speedway') E.fog = [0.07, 0.08, 0.16];
  if (st.id === 'nebula') { E.fog = [0.06, 0.03, 0.13]; E.sky = [0.42, 0.34, 0.62]; E.rim = [0.45, 0.92, 1]; E.light = [1.02, 0.97, 1.05]; }
  if (st.id === 'dragonspine') { E.fog = [0.62, 0.34, 0.32]; E.sky = [0.62, 0.42, 0.42]; E.light = [1.12, 0.9, 0.72]; E.rim = [1, 0.62, 0.38]; }   // sunset over the cloud sea
  if (st.id === 'horizon') { E.fog = [0.05, 0.03, 0.06]; E.sky = [0.42, 0.3, 0.3]; E.light = [1.06, 0.94, 0.86]; E.rim = [1, 0.6, 0.28]; }        // lit by the accretion disk
  if (typeof MAP_ENV !== 'undefined' && MAP_ENV[st.id]) MAP_ENV[st.id](E);                                                                   // v14 shop maps (render/maps14.js)
  return E;
}

/* ---- procedural toon sky per arena theme ---- */
function stageSky(st, E) {
  const th = THEME3D[st.id] || 'city', P = st.pal, glow = col3(P.glow), edge = col3(P.edge), hor = E.fog;
  const S = { Zen: mix3(hor, [0.02, 0.02, 0.07], 0.75), Hor: hor, Gnd: hor.map(v => v * 0.6), SunDir: V3.norm([-0.55, 0.32, -1]), SunCol: [1, 0.95, 0.8],
    Cl1: mix3(hor, [1, 1, 1], 0.35), Cl2: mix3(hor, [0, 0, 0], 0.25), Aur1: [0.2, 1, 0.6], Aur2: [0.7, 0.3, 1], MoonDir: V3.norm([0.6, 0.45, -1]), MoonCol: [0.92, 0.94, 1],
    K: [0, 0.6, 0, 0], moon: 0, cloudH: 9, horGlow: 0.6 };
  if (E.bright) { S.Zen = [0.28, 0.52, 0.92]; S.Hor = hor; S.K = [0.045, 0, 0.62, 0]; S.Cl1 = [1, 1, 1]; S.Cl2 = mix3([0.75, 0.8, 0.95], hor, 0.3); S.horGlow = 0.3; }
  switch (th) {
    case 'space': S.Zen = [0.005, 0.005, 0.03]; S.K = [0, 1, 0.45, 0]; S.cloudH = 2.2; S.Cl1 = mix3(glow, [1, 1, 1], 0.2).map(v => v * 0.55); S.Cl2 = mix3(edge, [0, 0, 0], 0.55).map(v => v * 0.6);
      S.moon = 0.16; S.MoonCol = mix3(glow, [1, 1, 1], 0.45); S.horGlow = 0.3; break;
    case 'mountains': S.K = [0, 0.8, 0.25, 1]; S.Zen = [0.03, 0.06, 0.16]; S.Hor = [0.35, 0.45, 0.62]; S.moon = 0.07; S.Cl2 = [0.3, 0.36, 0.5]; S.Cl1 = [0.6, 0.66, 0.8]; break;
    case 'volcano': S.Zen = [0.08, 0.01, 0.01]; S.Hor = mix3(hor, [1, 0.35, 0.08], 0.5); S.K = [0, 0.15, 0.7, 0]; S.Cl1 = [0.35, 0.16, 0.12]; S.Cl2 = [0.12, 0.05, 0.05]; S.horGlow = 1.2; break;
    case 'desert': S.Zen = [0.2, 0.42, 0.85]; S.Hor = [0.96, 0.78, 0.55]; S.K = [0.08, 0, 0.25, 0]; S.SunCol = [1, 0.9, 0.6]; S.SunDir = V3.norm([0.2, 0.22, -1]); S.Cl1 = [1, 0.96, 0.9]; S.Cl2 = [0.92, 0.75, 0.6]; break;
    case 'castle': S.Zen = [0.04, 0.04, 0.08]; S.K = [0, 0.2, 0.92, 0]; S.Cl1 = [0.32, 0.34, 0.42]; S.Cl2 = [0.12, 0.12, 0.17]; S.cloudH = 5; S.moon = st.id === 'obsidian' ? 0.1 : 0; S.MoonCol = [1, 0.95, 0.75]; break;
    case 'reef': S.Zen = [0.0, 0.04, 0.08]; S.Hor = [0.04, 0.28, 0.36]; S.K = [0.12, 0, 0, 0]; S.SunDir = V3.norm([0, 1, -0.35]); S.SunCol = [0.4, 0.9, 1]; S.horGlow = 0.2; break;
    case 'forest': case 'jungle': S.Zen = [0.01, 0.05, 0.06]; S.K = [0, 0.7, 0.2, 0]; S.moon = 0.09; S.MoonCol = [0.85, 1, 0.92]; S.Cl2 = [0.05, 0.14, 0.14]; S.Cl1 = [0.15, 0.3, 0.3]; break;
    case 'islands': if (!E.bright) { S.Zen = mix3(glow, [0.1, 0.15, 0.4], 0.6); S.K = [0.05, 0.25, 0.7, 0]; S.Cl1 = [1, 0.95, 0.95]; S.Cl2 = mix3(glow, hor, 0.4); } break;
    case 'temple': if (!E.bright) { S.Zen = mix3(glow, [0.05, 0.02, 0.1], 0.7); S.Hor = mix3(hor, glow, 0.35); S.K = [0.07, 0.2, 0.4, 0]; S.SunCol = [1, 0.6, 0.35]; S.SunDir = V3.norm([-0.3, 0.06, -1]); S.Cl1 = [1, 0.62, 0.45]; S.Cl2 = [0.45, 0.2, 0.3]; S.horGlow = 1; } break;
    case 'crystal': S.Zen = [0.02, 0.0, 0.06]; S.K = [0, 0.5, 0, 0.6]; S.Aur1 = glow; S.Aur2 = edge; break;
    case 'holo': S.Zen = [0.0, 0.03, 0.07]; S.Hor = [0.02, 0.15, 0.22]; S.K = [0, 0.3, 0, 0]; S.horGlow = 0.9; break;
    case 'wasteland': S.Zen = [0.05, 0.07, 0.02]; S.Hor = mix3(hor, [0.55, 0.65, 0.15], 0.4); S.K = [0.05, 0, 0.6, 0]; S.SunCol = [0.85, 1, 0.4]; S.Cl1 = [0.42, 0.46, 0.2]; S.Cl2 = [0.18, 0.2, 0.08]; break;
    case 'arena': case 'speedway': S.Zen = [0.01, 0.01, 0.05]; S.K = [0, 0.5, 0.15, 0]; S.horGlow = 1.0; break;
    case 'colosseum': S.Zen = [0.35, 0.5, 0.78]; S.Hor = [1, 0.85, 0.65]; S.K = [0.06, 0, 0.5, 0]; S.SunCol = [1, 0.9, 0.7]; break;
    case 'tunnel': S.Zen = [0.01, 0.01, 0.03]; S.K = [0, 0, 0, 0]; S.horGlow = 0.6; break;
    case 'nebula': S.Zen = [0.008, 0.004, 0.03]; S.Hor = [0.1, 0.05, 0.18]; S.Gnd = [0.03, 0.015, 0.07]; S.K = [0, 1.15, 0, 0]; S.horGlow = 0.35;
      S.neb = { k: [1, 0.9, 0.62, 0.3], a: [0.62, 0.16, 0.95], b: [0.06, 0.62, 0.95], c: [1, 0.6, 0.9] }; break;   // nebula strength, galaxy strength, galaxy azimuth / height
    case 'gears': if (!E.bright) { S.Zen = [0.06, 0.04, 0.02]; S.Hor = mix3(hor, [1, 0.7, 0.3], 0.35); S.K = [0, 0.3, 0.4, 0]; S.Cl1 = [0.5, 0.36, 0.2]; S.Cl2 = [0.2, 0.13, 0.08]; S.horGlow = 0.9; } break;
    case 'dragon': S.Zen = [0.08, 0.05, 0.2]; S.Hor = [1, 0.52, 0.34]; S.Gnd = [0.36, 0.17, 0.2]; S.K = [0.075, 0.12, 0.82, 0]; S.SunDir = V3.norm([0.5, 0.07, -1]); S.SunCol = [1, 0.64, 0.32];
      S.Cl1 = [1, 0.68, 0.46]; S.Cl2 = [0.46, 0.2, 0.3]; S.horGlow = 1.25; S.cloudH = 5; break;
    case 'blackhole': S.Zen = [0.004, 0.002, 0.012]; S.Hor = [0.07, 0.035, 0.05]; S.Gnd = [0.02, 0.01, 0.02]; S.K = [0, 1.3, 0, 0]; S.horGlow = 0.25;
      S.bh = { dir: V3.norm([-0.27, 0.02, -1]), col: [1, 0.52, 0.14], k: [0.05, 1.25, 0.6, 1] }; break;
  }
  if (typeof SKY_EXT !== 'undefined' && SKY_EXT[th]) SKY_EXT[th](S, E, st);                                                                 // v14 shop maps (render/maps14.js)
  if (st.id === 'aurora') S.K[3] = 1.2;
  if (st.id === 'starlight' || st.id === 'astral') { S.K[1] = 1.2; S.moon = st.id === 'astral' ? 0.22 : 0.12; }
  return S;
}

/* ---- primitives for static geometry (merged meshes) ---- */
let PROTO = null;
// (v12: every round primitive is high-poly — smooth silhouettes on the deep scenery and block detailing of all 36 arenas;
//  boxes became rounded slabs. Pyramids, hexes and prisms keep their facets on purpose.)
function protos() {
  const H = !GL3D.mobile, q = (hi, lo) => H ? hi : lo;
  if (!PROTO) PROTO = { box: H ? GEO.rcube(0.05, 2) : GEO.box(), rbox: GEO.rcube(0.14, q(3, 2)), cyl: GEO.cylinder(q(40, 22), true), cone: GEO.cylinder(q(36, 20), true, 0.001), pyr: GEO.cylinder(4, true, 0.001),
                        sph: GEO.sphere(q(32, 20), q(22, 14)), hemi: GEO.sphere(q(32, 20), q(22, 14)), octa: GEO.octa(), torus: GEO.torus(q(64, 36), q(14, 8), 0.08), ring: GEO.torus(q(96, 56), q(10, 6), 0.04),
                        disc: GEO.cylinder(q(48, 28), true), star: GEO.star(), hex: GEO.cylinder(6, true), tri: GEO.cylinder(3, true), gear: gearGeo(q(16, 12)) };
  return PROTO;
}
// a cog wheel: a thick disc with square teeth round its rim (unit radius, along +Y from 0 to 1)
function gearGeo(n) {
  const parts = [{ g: GEO.cylinder(24, true), m: trs(0, 0, 0, 0.82, 1, 0.82) }];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; parts.push({ g: GEO.box(), m: trs(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9, 0.24, 1, 0.2, a) }); }
  const g = geoMerge(parts); return { pos: g.pos, nor: g.nor, idx: g.idx };
}
// translate · Ry · Rz · Rx · scale (scales must stay positive: a negative scale would flip the triangle winding)
function trs(x, y, z, sx, sy, sz, ry, rz, rx) { return xf(new Float32Array(16), x, y, z, sx, sy, sz, ry, rz, rx); }

function genScenery(st) {
  const P = protos(), R = seeded(st.id), out = [], theme = THEME3D[st.id] || 'city';
  const top = -st.main.y, X0 = -2900, X1 = 4200;                            // world y of the stage top; horizontal spread
  // Every prop is pushed further back (and spread / lowered to match) so scenery frames the arena from a distance instead of
  // crowding it: the deeper layers then melt into the distance fog, which is what sells the scale.
  const r = (a, b) => a + (b - a) * R(), put = (g, x, y, z, sx, sy, sz, mat, ry, rz, rx) => {
    const zz = z * 1.7 - 650, k = (CAM3D.K - zz) / (CAM3D.K - z);
    out.push({ g: P[g], m: trs(640 + (x - 640) * k, top + (y - top) * 1.15 - 260, zz, sx, sy, sz, ry, rz, rx), mat });
  };
  const deep = (zMin, zMax) => r(zMin, zMax);
  switch (theme) {
    case 'city': case 'tunnel': {
      const n = theme === 'tunnel' ? 34 : 64;
      for (let i = 0; i < n; i++) {
        const z = deep(-450, -3400), w = r(140, 340), h = r(700, 2700), d = r(140, 320), x = r(X0, X1), base = top - r(1100, 1700);
        put('box', x, base + h / 2, z, w, h, d, 0);
        for (let k = 0, m = 2 + (R() * 6 | 0); k < m; k++) put('box', x, base + h * r(0.45, 0.97), z + d / 2 + 2, w * r(0.5, 0.92), r(5, 12), 3, 2);   // lit window bands
        if (R() < 0.4) { put('cone', x, base + h, z, 10, r(120, 260), 10, 1); put('sph', x, base + h + 250, z, 12, 12, 12, 2); }        // antennas
      }
      if (theme === 'tunnel') for (let i = 0; i < 14; i++) { const x = -1600 + i * 360; put('box', x, top + 600, -500, 60, 2400, 80, 1); put('box', x, top + 460, -455, 14, 1800, 6, 2); }
      break;
    }
    case 'mountains': case 'volcano': {
      const n = theme === 'volcano' ? 24 : 30;
      for (let i = 0; i < n; i++) {
        const z = deep(-900, -3900), s = r(500, 1400), h = r(800, 2000), x = r(X0, X1), base = top - r(900, 1400);
        put('cone', x, base, z, s, h, s * r(0.6, 1), 0, r(0, 6));
        if (theme === 'mountains') put('cone', x, base + h * 0.62, z, s * 0.38, h * 0.38, s * 0.38 * r(0.6, 1), 1, r(0, 6));          // snow cap
        else if (R() < 0.55) put('sph', x, base + h * 0.97, z, s * 0.09, 30, s * 0.09, 2);                                               // glowing crater
      }
      for (let i = 0; i < 18; i++) put('octa', r(-1200, 2500), top + r(-300, 900), deep(-350, -1100), r(18, 50), r(40, 110), r(18, 50), theme === 'volcano' ? 0 : 1, r(0, 6), r(-0.4, 0.4));
      break;
    }
    case 'forest': case 'jungle': {
      for (let i = 0; i < 70; i++) {
        const z = deep(-350, -3000), x = r(X0, X1), h = r(300, 900), base = top - r(400, 900), tr = r(20, 46);
        put('cyl', x, base, z, tr, h, tr, 0);
        if (R() < 0.5) put('sph', x, base + h, z, r(150, 300), r(120, 240), r(150, 300), 1); else put('cone', x, base + h * 0.55, z, r(130, 240), r(400, 700), r(130, 240), 1);
        if (R() < 0.25) put('sph', x + r(-80, 80), base + r(20, 60), z + 40, r(30, 60), r(14, 30), r(30, 60), 2);                         // glowing mushrooms
      }
      if (theme === 'jungle') for (let k = 0; k < 6; k++) put('box', 640, top - 800 + k * 160, -1900, 1800 - k * 260, 160, 900 - k * 120, 0);   // step pyramid
      break;
    }
    case 'islands': {
      for (let i = 0; i < 26; i++) {
        const z = deep(-350, -3300), x = r(X0, X1), y = top + r(-500, 1300), s = r(120, 420);
        put('cone', x, y, z, s, s * r(0.8, 1.6), s * 0.8, 0, 0, Math.PI);                                                                // rocky underside (cone flipped apex-down)
        put('disc', x, y, z, s * 1.02, 22, s * 0.82, 1);                                                                                 // grassy / marble top
        if (R() < 0.5) put('cyl', x + r(-s * 0.4, s * 0.4), y + 22, z, 14, r(80, 220), 14, 1);                                          // pillars / trees
        if (R() < 0.35) put('sph', x, y + r(200, 420), z, r(60, 140), r(30, 70), r(60, 140), 2);                                        // glowing orbs / clouds
      }
      for (let i = 0; i < 30; i++) put('sph', r(X0, X1), top - r(300, 900), deep(-600, -3500), r(200, 520), r(70, 160), r(150, 380), 1);   // cloud sea
      break;
    }
    case 'temple': case 'castle': case 'colosseum': {
      if (theme === 'colosseum') {
        for (let i = 0; i < 46; i++) { const a = Math.PI * (1.05 + 0.9 * i / 45), cx = 640 + Math.cos(a) * 2400, cz = -1700 + Math.sin(a) * 1300;
          for (let t = 0; t < 3; t++) put('box', cx, top - 300 + t * 330, cz, 200, 300, 120, t === 2 ? 1 : 0, -a + Math.PI / 2);
          if (i % 3 === 0) put('sph', cx, top + 720, cz, 20, 30, 20, 2); }
      } else {
        for (let i = 0; i < 44; i++) {
          const z = deep(-450, -2600), x = r(X0 + 800, X1 - 800), h = r(500, 1300), base = top - r(300, 700);
          if (theme === 'castle' && R() < 0.5) { const w = r(120, 260); put('cyl', x, base, z, w, h, w, 0); put('cone', x, base + h, z, w * 1.2, r(260, 480), w * 1.2, 1);
            put('box', x, base + h * 0.7, z + w, 20, 40, 4, 2); }
          else { put('cyl', x, base, z, r(30, 55), h, r(30, 55), 1); put('box', x, base + h + 20, z, 150, 40, 150, 0); if (R() < 0.3) put('sph', x, base + h + 80, z, 22, 30, 22, 2); }
        }
        for (let i = 0; i < 6; i++) put('box', r(-1500, 2800), top - r(500, 700), deep(-900, -2800), r(900, 1800), r(300, 700), r(300, 500), 0);   // terraces / walls
      }
      break;
    }
    case 'space': {
      for (let i = 0; i < 3; i++) { const s = r(160, 420), x = r(-1800, 3200), y = top + r(700, 1800), z = deep(-2600, -4600);
        put('sph', x, y, z, s, s, s, 1); if (R() < 0.6) put('torus', x, y, z, s * r(1.5, 1.9), s * 0.4, s * r(1.5, 1.9), 1, r(0, 6), r(-0.35, 0.35)); }
      for (let i = 0; i < 60; i++) { const s = r(10, 50); put('octa', r(X0, X1), top + r(-900, 1600), deep(-700, -3200), s, s * r(0.6, 1.2), s, 0, r(0, 6), r(0, 6)); }
      if (st.id === 'skyline' || st.id === 'observatory') for (let i = 0; i < 8; i++) { const x = r(-1500, 2800), z = deep(-600, -1800); put('box', x, top + r(-200, 600), z, r(300, 700), 40, 120, 0); put('box', x, top + r(-200, 600), z + 62, r(200, 600), 6, 2, 2); }
      break;
    }
    case 'crystal': {
      for (let i = 0; i < 60; i++) { const x = r(X0, X1), z = deep(-350, -3000), h = r(160, 900), base = top - r(300, 1000);
        put('octa', x, base + h * 0.5, z, h * r(0.12, 0.25), h * 0.55, h * r(0.12, 0.25), R() < 0.45 ? 2 : 1, r(0, 6), r(-0.3, 0.3)); }
      break;
    }
    case 'desert': {
      for (let i = 0; i < 7; i++) { const s = r(500, 1200); put('pyr', r(-2000, 3400), top - r(400, 700), deep(-1400, -3800), s, s * 0.9, s, 1, Math.PI / 4); }
      for (let i = 0; i < 40; i++) put('sph', r(X0, X1), top - r(500, 900), deep(-400, -3600), r(400, 1100), r(80, 200), r(300, 700), 0);
      for (let i = 0; i < 14; i++) { const x = r(X0, X1), z = deep(-400, -1800), h = r(140, 320), base = top - r(450, 650);          // saguaro cacti
        put('cyl', x, base, z, 16, h, 16, 1); put('cyl', x + 26, base + h * 0.45, z, 11, h * 0.35, 11, 1); put('box', x + 13, base + h * 0.45, z, 26, 14, 14, 1); }
      break;
    }
    case 'reef': {
      for (let i = 0; i < 60; i++) { const x = r(X0, X1), z = deep(-300, -2600), base = top - r(500, 1000), h = r(200, 800);
        if (R() < 0.5) { put('cyl', x, base, z, r(14, 30), h, r(14, 30), 1, 0, r(-0.3, 0.3)); put('sph', x, base + h, z, r(40, 90), r(40, 90), r(40, 90), 1); }
        else put('box', x, base + h, z, r(10, 22), h * 2, 6, 0, r(0, 3), r(-0.15, 0.15));                                                // kelp
        if (R() < 0.3) put('sph', x, base + r(0, h), z + 30, 8, 8, 8, 2); }
      break;
    }
    case 'gears': {
      for (let i = 0; i < 26; i++) { const s = r(140, 520); put('gear', r(X0, X1), top + r(-500, 900), deep(-400, -2800), s, s * 0.25, s, 1, r(-0.5, 0.5), 0, Math.PI / 2); }   // cogs facing the camera
      for (let i = 0; i < 30; i++) { const x = r(X0, X1), z = deep(-400, -2800), h = r(600, 1800); put('box', x, top - 900 + h / 2, z, r(60, 180), h, r(60, 180), 0); if (R() < 0.5) put('box', x, top - 900 + h, z + 60, 30, 18, 4, 2); }
      break;
    }
    case 'arena': case 'speedway': {
      for (let i = 0; i < 40; i++) { const a = Math.PI * (1.08 + 0.84 * i / 39), cx = 640 + Math.cos(a) * 2300, cz = -1500 + Math.sin(a) * 1100;
        put('box', cx, top - 200, cz, 220, 500, 380, 0, -a + Math.PI / 2); put('box', cx, top + 70, cz + 10, 210, 20, 340, 2, -a + Math.PI / 2); }   // grandstand tiers + light strips
      for (let i = 0; i < 6; i++) { const x = -1200 + i * 760, z = -1000 - (i % 2) * 500; put('cyl', x, top - 400, z, 18, 1500, 18, 0); put('box', x, top + 1110, z, 160, 60, 40, 2); }   // floodlight towers
      break;
    }
    case 'holo': {                                                          // Training: a holographic grid room of glowing lines + floating wire cubes
      for (let i = -14; i <= 14; i++) { put('box', 640 + i * 320, top - 700, -1900, 5, 5, 5200, 2); put('box', 640, top - 700, -i * 260 - 600, 9400, 5, 5, 2); }
      for (let i = -12; i <= 12; i++) put('box', 640 + i * 360, top + 600, -4300, 5, 2600, 5, 2);                                         // back wall
      for (let i = 0; i < 26; i++) { const s = r(40, 140); put('box', r(X0, X1), top + r(-400, 1200), deep(-500, -3200), s, s, s, i % 3 ? 0 : 1, r(0, 3), r(0, 3)); }
      break;
    }
    case 'dragon': {                                                        // a sea of sunset clouds far below, peaks breaking through, drifting rocks
      for (let i = 0; i < 40; i++) put('sph', r(X0, X1), top - r(700, 1100), deep(-300, -3600), r(260, 640), r(70, 160), r(200, 480), i % 3 ? 0 : 1);
      for (let i = 0; i < 9; i++) { const s = r(260, 700), x = r(X0, X1), z = deep(-1600, -3800); put('cone', x, top - r(900, 1200), z, s, r(900, 1600), s * 0.8, 0, r(0, 6)); put('cone', x, top - r(900, 1200) + r(700, 1000), z, s * 0.3, r(200, 400), s * 0.25, 1, r(0, 6)); }
      for (let i = 0; i < 8; i++) put('octa', r(-2000, 3300), top + r(200, 1100), deep(-1800, -3200), r(40, 110), r(50, 140), r(40, 110), 0, r(0, 6), r(-0.5, 0.5));
      break;
    }
    case 'blackhole': {                                                     // tumbling debris, distant crystal shards and two dead planets
      for (let i = 0; i < 70; i++) { const s = r(8, 46); put('octa', r(X0, X1), top + r(-900, 1700), deep(-500, -3400), s, s * r(0.5, 1.4), s, i % 5 ? 0 : 1, r(0, 6), r(0, 6)); }
      for (let i = 0; i < 12; i++) { const h = r(200, 700); put('octa', r(X0, X1), top + r(-400, 900), deep(-1400, -3600), h * 0.14, h * 0.5, h * 0.14, 2, r(0, 6), r(-0.4, 0.4)); }
      for (let i = 0; i < 2; i++) { const s = r(140, 300); put('sph', r(-1600, 3000), top + r(600, 1400), deep(-2800, -4400), s, s, s, 1); }
      break;
    }
    case 'wasteland': {
      for (let i = 0; i < 40; i++) { const x = r(X0, X1), z = deep(-400, -2800), h = r(300, 1400); put('box', x, top - 500 + h / 2, z, r(100, 260), h, r(100, 260), 0, r(0, 3), r(-0.2, 0.2)); }
      for (let i = 0; i < 16; i++) put('sph', r(X0, X1), top - r(500, 800), deep(-400, -2400), r(150, 380), 20, r(120, 260), 2);       // toxic pools
      for (let i = 0; i < 30; i++) put('cyl', r(X0, X1), top - r(500, 800), deep(-300, -2000), r(20, 40), r(60, 110), r(20, 40), 1);     // barrels
      break;
    }
  }
  if (typeof SCENERY_EXT !== 'undefined' && SCENERY_EXT[theme]) SCENERY_EXT[theme](put, r, deep, top, X0, X1);                              // v14 shop maps (render/maps14.js)
  return out;
}

/* ---- 3D stage detailing: the block itself + its signature details, in block-local coordinates ----
 * Local frame: x across (centred), y up (top surface at 0), z toward the camera (front face at +d/2). */
function stageDeco(id, kind, w, h, d, add, pal, R) {
  const C = col3, hw = w / 2, fz = d / 2, main = kind === 'main';
  const edge = C(pal.edge), glow = C(pal.glow), top = C(pal.top), plat = C(pal.plat), f0 = C(pal.fill[0]), f1 = C(pal.fill[1]);
  const lip = (col, e, th) => add('box', 0, -(th || 4) / 2 + 0.5, fz - 1, w - 10, th || 4, 4, col, e);              // a trim strip along the front-top edge
  const rivets = (y, step, col) => { for (let x = -hw + 18; x < hw - 10; x += step) add('sph', x, y, fz + 0.5, 3, 3, 2.4, col, 0); };
  const panels = (n, col, inset) => { const pw = (w - 16) / n; for (let i = 0; i < n; i++) add('box', -hw + 8 + pw * (i + 0.5), -h / 2 - 2, fz + (inset || 1.5), pw - 6, h - 18, 3, col, 0); };
  switch (id) {
    case 'speedway':
      if (main) {
        for (let x = -hw, k = 0; x < hw - 1; x += 24, k++) add('box', x + 12, 1.5, fz - 10, 24, 3, 20, k & 1 ? C('#ff2f57') : C('#f4f4f8'), 0.05);   // red-white kerb
        for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) add('box', -8 + i * 8 + 4, 0.6, fz - 20 - j * 12, 8, 1.4, 12, (i + j) % 2 ? C('#0a0a10') : C('#ffffff'), 0);   // start/finish checker
        for (let x = -hw + 40; x < hw - 30; x += 90) add('box', x + 17, 0.6, -10, 34, 1.4, 4, C('#ffffff'), 0.2);                    // grid slots
        panels(6, mix3(f0, [0, 0, 0], 0.15));
      } else { for (let x = -hw + 4, k = 0; x < hw - 8; x += 16, k++) add('box', x + 8, -h / 2, fz + 1, 9, h - 4, 2, C('#ffd23a'), 0.1, 0, 0.6); }   // hazard chevrons
      break;
    case 'forge':
      if (main) { add('box', 0, -h * 0.45, fz + 1.5, w - 4, 6, 3, C('#c8a050'), 0.1); panels(5, mix3(f0, [1, 1, 1], 0.12)); for (let x = -hw + 30; x < hw; x += 90) add('box', x, -6, fz + 2, 8, 12, 4, C('#c8a050'), 0); }
      else add('box', 0, -h - 2, 0, w * 0.86, 4, d * 0.8, C('#c8a050'), 0);
      break;
    case 'aurora': case 'peak':
      for (let x = -hw + 16; x < hw - 10; x += main ? 30 : 26) { const l = 10 + R() * 26; add('cone', x, -h, fz - 6 - R() * 20, 4.5, l, 4.5, C('#e8fbff'), 0.25, 0, Math.PI); }   // icicles under the lip
      for (let x = -hw + 24; x < hw - 10; x += main ? 52 : 40) add('octa', x, -h * 0.55, fz + 2, 8, h * 0.35, 4, C('#cfefff'), 0.3, 0, 0.3);      // ice facets
      lip(C('#ffffff'), 0.4, 3);
      break;
    case 'neon': case 'expressway': case 'highway': {
      if (main && id !== 'neon') { add('box', 0, -h + 12, fz + 3, w, 6, 6, C('#9aa0b0'), 0); for (let x = -hw + 16; x < hw; x += 40) add('box', x, -h + 12, fz + 6.5, 6, 4, 1.5, (x >> 3) % 2 ? C('#ff2f57') : C('#ffffff'), 0.6); }   // crash barrier + reflectors
      else if (main) { for (let x = -hw + 30; x < hw; x += 40) add('box', x - 7, -h / 2, fz + 1, 4, h - 16, 2, mix3(edge, f0, 0.5), 0.2, 0, 0.3); }
      if (!main && id !== 'neon') { add('box', 0, -h / 2, fz + 1.5, w - 12, h - 6, 2, C(id === 'highway' ? '#1e4a2a' : '#121a30'), 0); add('box', 0, -h + 3, fz + 3, w - 12, 2, 1, plat, 0.8);
        for (const sx of [-0.35, 0.35]) add('box', w * sx, -h - 40, -d * 0.2, 6, 80, 6, C('#5a606c'), 0); }                         // gantry sign + posts
      break;
    }
    case 'shrine': for (let x = -hw + 30; x < hw - 10; x += main ? 62 : 40) { add('cyl', x, -h + 4, fz - 6, 6, h - 12, 6, mix3(f0, edge, 0.3), 0); add('box', x, -6, fz - 6, 18, 5, 18, mix3(f0, edge, 0.4), 0); } break;
    case 'space': case 'starlight': case 'vault':
      lip(edge, 0.9, 3);
      if (main) add('box', 0, -h * 0.55, fz + 1, w - 28, 4, 2, edge, 0.4);
      break;
    case 'volcano': case 'caldera':
      for (let x = -hw + 20; x < hw - 20; x += 54) { add('box', x + 6, -h * 0.3, fz + 0.8, 3, h * 0.55, 1.5, C('#ff7a2a'), 1.2, 0, 0.5); add('box', x + 2, -h * 0.75, fz + 0.8, 3, h * 0.45, 1.5, C('#ff7a2a'), 1.2, 0, -0.4); }   // lava cracks
      for (let x = -hw + 30; x < hw; x += 70) add('octa', x, -h - 6, fz - 20, 16, 16, 14, C('#2a1a16'), 0, R() * 3, 0);        // basalt chunks hanging under
      break;
    case 'matrix': case 'citadel':
      for (let x = -hw + 20; x < hw - 10; x += main ? 46 : 26) { const hh = 14 + R() * 24; add('octa', x, -h + hh * 0.4, fz + 1, 7, hh, 5, mix3(glow, [1, 1, 1], 0.3), 0.8, 0, (R() - 0.5) * 0.5); }
      lip(plat, 0.7, 3);
      break;
    case 'haven':
      add('rbox', 0, -2, 0, w + 8, 6, d + 6, C('#6fcf4a'), 0);                                                                     // grass cap
      for (let x = -hw + 10; x < hw - 6; x += 16) add('sph', x, 0, fz + 1, 9, 4, 6, C('#7fd05a'), 0);
      for (let x = -hw + 40; x < hw - 30; x += 70) { add('cyl', x, -h - 34, fz - 10, 2.5, 36, 2.5, C('#5a4632'), 0); add('sph', x, -h - 34, fz - 10, 4, 4, 4, C('#5a4632'), 0); }   // hanging roots
      if (!main) add('cone', 0, -h, 0, w * 0.45, 46, d * 0.45, C('#7a6a5a'), 0, 0, Math.PI);                                       // floating rock underside
      break;
    case 'abyss':
      for (let x = -hw + 18; x < hw - 10; x += 36) add('sph', x, -12 - R() * (h - 24), fz + 1, 5, 5, 4, C('#3fd6ff'), 0.4);      // barnacles
      if (!main) for (let x = -hw + 12; x < hw - 6; x += 22) add('cyl', x, -h - 20, fz - 8, 2, 22, 2, plat, 0.3);                   // coral fronds
      break;
    case 'clockwork':
      rivets(-12, 34, edge); rivets(-h + 10, 34, edge);
      break;
    case 'storm':
      for (let x = -hw + 34; x < hw - 34; x += 68) { add('box', x, -18, fz + 1.5, 60, 22, 3, mix3(f0, [1, 1, 1], 0.08), 0); if (x + 60 < hw - 4) add('box', x + 34, -44, fz + 1.5, 60, 22, 3, mix3(f0, [0, 0, 0], 0.1), 0); }
      if (!main) for (let x = -hw; x < hw - 6; x += 24) add('box', x + 6, 4, -d / 2 + 8, 12, 8, 10, mix3(f0, [1, 1, 1], 0.1), 0);      // battlements
      break;
    case 'grid':
      if (main) for (let x = -hw, k = 0; x < hw - 1; x += 100, k++) { const ww = Math.min(100, hw - x); add('box', x + ww / 2, 0.8, 0, ww - 6, 1.6, d - 10, k & 1 ? C('#a89a5a') : C('#b8aa66'), 0); }   // tatami mats
      else add('box', 0, -h / 2, fz + 1, w - 4, 2, 2, C('#1a1408'), 0);
      lip(plat, 0.6, 3);
      break;
    case 'quantum':
      panels(main ? 6 : 2, C('#6a5236')); rivets(-10, 34, C('#5a3a1a'));
      if (main) for (let x = -hw + 70; x < hw; x += 150) add('sph', x, -h + 2, fz - 4, 30, 6, 10, C('#9dff2e'), 1.1);              // acid stains glowing below
      break;
    case 'skyline':
      panels(main ? 8 : 2, mix3(f0, [1, 1, 1], 0.1));
      break;
    case 'temple':
      if (main) { for (let x = -hw + 24; x < hw; x += 24) add('box', x, -h / 2, fz + 0.8, 2, h - 14, 1.5, C('#2a0a06'), 0); add('box', 0, -6, fz + 1.5, w - 12, 2.5, 2, C('#ffcf6a'), 0.3); }
      else { add('box', 0, 0, 0, w + 28, 2, d + 16, C('#2a1410'), 0); add('box', 0, -h / 2, fz + 2, w + 10, h, 3, C('#8a2a20'), 0); }   // red lacquered eave
      break;
    case 'desert':
      for (let y = -26; y > -h; y -= 26) add('box', 0, y, fz + 0.5, w - 12, 2, 1.5, mix3(f1, [0, 0, 0], 0.2), 0);
      for (let x = -hw + 40; x < hw - 10; x += 60) add('box', x, -h / 2, fz + 0.5, 2, h - 8, 1.5, mix3(f1, [0, 0, 0], 0.2), 0);
      break;
    case 'forest':
      for (let x = -hw + 10; x < hw; x += 28) add('sph', x, 2, fz - 4, 8, 5, 8, C('#3dffb8'), 0.5);                                 // glowing moss
      if (!main) { add('cyl', 0, -h - 46, 0, 9, 46, 9, C('#0e3a34'), 0); add('hemi', 0, -h / 2, 0, w * 0.58, h / 2 + 5, d * 0.5, mix3(plat, [1, 1, 1], 0.1), 0.35); }   // mushroom cap + stem
      break;
    case 'obsidian':
      if (main) for (let y = -14; y > -h; y -= 14) add('box', 0, y, fz + 0.6, w - 12, 1.6, 1.2, C('#120a08'), 0);
      else for (const sx of [-1, 1]) { add('cyl', sx * (hw - 16), 0, fz - 20, 2.4, 12, 2.4, C('#e8dcc4'), 0.2); }               // candles (flames are animated)
      break;
    case 'stadium': lip(plat, 0.6, 3); break;
    case 'sanctuary':
      add('box', 0, -10, fz + 1.5, w - 8, 3, 2, C('#ffd36e'), 0.3);
      if (main) for (let x = -hw + 30; x < hw - 10; x += 48) add('cyl', x, -h + 6, fz - 3, 6, h - 22, 6, C('#f2ece0'), 0);
      break;
    case 'observatory':
      add('box', 0, -6, fz + 1.5, w - 8, 3, 2, C('#c8a050'), 0.2);
      if (main) for (let r = 1; r <= 3; r++) add('ring', 0, -h * 0.55, fz + 1, r * 46, 3, r * 46 * 0.18, C('#c8a050'), 0.3, 0, 0, Math.PI / 2);
      break;
    case 'ruins':
      if (main) { for (let y = -26; y > -h; y -= 26) add('box', 0, y, fz + 0.5, w - 4, 2, 1.5, C('#2a2a18'), 0);
        for (let x = -hw + 70; x < hw - 30; x += 140) add('octa', x, -40, fz + 2, 6, 9, 2, C('#96ff78'), 0.9); }
      for (let x = -hw + 4; x < hw - 4; x += 16) add('sph', x + 8, 1, fz - 4 - R() * 10, 7 + R() * 4, 5, 7, C('#6fae4a'), 0);      // moss along the lip
      break;
    case 'celestial':
      add('box', 0, -8, fz + 1.5, w - 8, 2.5, 2, C('#ffe6a8'), 0.4);
      if (main) { add('ring', 0, -h * 0.6, fz + 1, 120, 3, 20, C('#ffe6a8'), 0.4, 0, 0, Math.PI / 2); }
      else add('cone', 0, -h, 0, w * 0.42, 28, d * 0.42, C('#2a2848'), 0, 0, Math.PI);
      break;
    case 'subway':
      if (main) { add('box', 0, 1, fz - 8, w, 2, 12, C('#ffd23a'), 0.2); for (let x = -hw + 6; x < hw - 4; x += 9) add('cyl', x, 1.5, fz - 8, 1.6, 1.5, 1.6, C('#d8b02a'), 0); }
      break;
    case 'dock':
      if (main) for (let x = -hw + 85; x < hw; x += 85) add('box', x, -h / 2 - 6, fz + 0.6, 2, h - 18, 1.4, C('#101418'), 0);
      for (let x = -hw + 6, k = 0; x < hw - 10; x += 28, k++) add('box', x + 10, -4, fz + 1, 12, 6, 2, C('#ffd23a'), 0.1, 0, 0.5);   // hazard chevrons along the lip
      break;
    case 'astral':
      for (let i = 0; i < (main ? 30 : 6); i++) add('octa', -hw + 10 + R() * (w - 20), -8 - R() * (h - 16), fz + 1, 2.4, 2.4, 1.5, C('#ffffff'), 1.2, R() * 3, R() * 3);   // stars embedded in the slab
      break;
    case 'cybercol': lip(edge, 0.9, 3); panels(main ? 6 : 2, mix3(f0, edge, 0.08)); break;
    case 'dragonspine': {                                                   // overlapping dragon scales down the front, bone spikes along the spine, plated undersides
      const sc = mix3(f0, [0, 0, 0], 0.18), bone = C('#e8d8c0');
      for (let row = 0; row < (main ? 3 : 1); row++) for (let x = -hw + 14 + (row % 2) * 14; x < hw - 10; x += 28) add('sph', x, -12 - row * 18, fz + 1, 15, 9, 4, row % 2 ? sc : f0, 0);
      if (main) { for (let x = -hw + 40; x < hw - 30; x += 64) add('cone', x, -h * 0.4, -fz - 1, 8, 26, 8, bone, 0, 0, 0, -0.9); add('box', 0, -1.5, fz - 6, w - 20, 3, 4, edge, 0.5); }   // (spine spikes along the back face, out of the fighters' way)
      else { add('cone', 0, -h, 0, w * 0.38, 26, d * 0.32, sc, 0, 0, Math.PI); lip(edge, 0.6, 3); }
      break; }
    case 'horizon': {                                                       // a crystal shard: glowing facets and a circuit of light round the rim
      lip(edge, 1, 3);
      for (let i = 0; i < (main ? 14 : 3); i++) add('octa', -hw + 20 + R() * (w - 40), -10 - R() * (h - 20), fz + 1, 5 + R() * 6, 8 + R() * 10, 3, i % 3 ? C(pal.plat) : edge, 0.7, R() * 3, R() * 0.6);
      if (main) for (let i = 0; i < 9; i++) add('octa', -hw * 0.8 + i * hw * 0.2, -h - 10 - (i % 3) * 30, 0, 12, 40 + (i % 3) * 30, 12, i % 2 ? C(pal.plat) : f1, 0.3, 0, 0, Math.PI);
      else add('octa', 0, -h - 18, 0, w * 0.18, 36, d * 0.18, C(pal.plat), 0.4, 0, 0, Math.PI);
      break; }
    case 'training': lip(C('#3df0ff'), 1, 3); break;
    default: if (typeof DECO_EXT !== 'undefined' && DECO_EXT[id]) DECO_EXT[id](kind, w, h, d, add, pal, R, C, main);                      // v14 shop maps (render/maps14.js)
  }
}

/* ---- build everything for the current stage (once per stage) ---- */
function buildBlock(id, kind, w, h, d, bevel, pal, R, special) {
  // the block — a slab with exactly rounded (filleted) edges and smooth normals — coloured per face (top lighter, sides the
  // stage fill, underside darker), + its merged 3D detailing
  const g = GEO.slab(w, h, d, bevel * 1.15), P = pal, parts = [];
  const topC = kind === 'main' ? mix3(col3(P.fill[0]), col3(P.top), 0.15) : mix3(col3(P.fill[0]), col3(P.plat), 0.3);
  const sideC = kind === 'main' ? col3(P.fill[0]) : mix3(col3(P.fill[0]), col3(P.plat), 0.15), botC = mix3(col3(P.fill[1]), [0, 0, 0], 0.2);
  const col = []; for (let i = 0; i < g.nor.length; i += 3) { const ny = g.nor[i + 1], c = ny > 0.5 ? topC : ny < -0.5 ? botC : mix3(sideC, col3(P.fill[1]), clamp(-g.pos[i + 1] / h, 0, 1) * 0.6); col.push(c[0], c[1], c[2], 0); }
  const base = { pos: g.pos, nor: g.nor, idx: g.idx };
  const add = (pk, x, y, z, sx, sy, sz, c, e, ry, rz, rx) => parts.push({ g: protos()[pk], m: trs(x, y, z, sx, sy, sz, ry, rz, rx), c: [c[0], c[1], c[2], e || 0] });
  if (special) special(add); else stageDeco(id, kind, w, h, d, add, P, R);
  const dg = geoMerge(parts), off = base.pos.length / 3;
  const out = { pos: base.pos.concat(dg.pos), nor: base.nor.concat(dg.nor), idx: base.idx.concat(dg.idx.map(i => i + off)), col: col.concat(dg.col) };
  const m = glMeshC(out), on = smoothNormals(out);
  m.outline = glMesh(out.pos, on, out.idx);                                                   // welded-normal hull for a gap-free ink line
  return m;
}
/* Nebula Apex: one vast, perfectly smooth platform — a superellipse (p = 4) slab with a rounded fillet, lofted down a
 * cubic Bézier belly to a keel (GEO.hull, render/scene.js), vertex-coloured from the lit top down into the deep. */
const HULL_H = 250;
function buildHull(S, P) {
  const g = GEO.hull(S.w / 2, MAIN_DEPTH / 2, HULL_H, 12, 4, GL3D.mobile ? 72 : 120), h = HULL_H;
  const topC = mix3(col3(P.fill[0]), col3(P.top), 0.24), f0 = col3(P.fill[0]), f1 = col3(P.fill[1]), col = [];
  for (let i = 0; i < g.pos.length; i += 3) { const y = g.pos[i + 1], u = clamp(-y / h, 0, 1), c = y > -0.5 && g.nor[i + 1] > 0.9 ? topC : mix3(mix3(f0, topC, 0.25), f1, Math.pow(u, 0.6));
    col.push(c[0], c[1], c[2], 0); }
  g.col = col; const m = glMeshC(g); m.outline = null;
  return m;
}
// the hull's smooth neon trim, its orbiting monoliths, rings, Bézier solar sails, keel crystal and the ringed giant — a scene graph
let NEB_SG = null;
function nebulaScene() {
  if (NEB_SG) return NEB_SG;
  const a = STAGE.w / 2, b = MAIN_DEPTH / 2, h = HULL_H, P = ST.pal, edge = col3(P.edge), glow = col3(P.glow), dark = col3(P.fill[1]);
  const neon = (k, gp) => ({ col: edge, glow: k, glowPow: gp === undefined ? 0.6 : gp }), m = (o) => Object.assign({ spec: 0.9, shin: 90, metal: 0.55, outline: 1.4 }, o);
  // profile scale of the hull's Bézier belly at parameter t (the same curve as GEO.hull)
  const belly = t => { const w = bern3(t), B = [[1, -12], [1.04, -12 - h * 0.28], [0.42, -h * 0.82], [0.06, -h]]; let s = 0, y = 0; for (let i = 0; i < 4; i++) { s += B[i][0] * w[i]; y += B[i][1] * w[i]; } return [s, y]; };
  const loop = (key, sa, sb, y, r) => new SceneNode(key, { meshKey: key, build: () => GEO.loopTube(sa, sb, 4, y, r, 180, 10) });
  const trim = new SceneNode('trim');
  trim.add(Object.assign(loop('neb:rim', a - 11, b - 11, 0.9, 1.3), { mat: neon(0.9) }));                                     // the edge line round the top
  trim.add(Object.assign(loop('neb:inlay', a * 0.62, b * 0.55, 0.6, 0.9), { mat: neon(0.35, 0.4) }));                       // a faint inlay on the floor
  for (const [k, t] of [[0, 0.1], [1, 0.32], [2, 0.55]]) { const [s, y] = belly(t);
    trim.add(Object.assign(loop('neb:band' + k, a * s + 1.5, b * s + 1.5, y, 2.2 - k * 0.4), { mat: { col: k === 1 ? glow : edge, glow: 1.1 - k * 0.2, glowPow: 0.5 } })); }
  const keel = new SceneNode('keel', { pos: [0, -h - 46, 0], tick: (n, t) => { n.rot[1] = t * 0.012; n.pos[1] = -h - 46 + Math.sin(t * 0.03) * 8; } }).add(
    new SceneNode('crystal', { meshKey: 'neb:crystal', build: () => GEO.superellipsoid(2.4, 1.6, 24, 18), scl: [26, 54, 26], mat: m({ col: mix3(glow, [1, 1, 1], 0.3), emis: 0.55, metal: 0.3 }) }),
    new SceneNode('crystalGlow', { meshKey: 'neb:glowball', build: () => GEO.sphere(24, 16), scl: [70, 90, 70], mat: { col: glow, glow: 0.45, glowPow: -1.6 } }));
  const rings = new SceneNode('rings', { pos: [0, -h - 46, 0] });
  for (let i = 0; i < 3; i++) rings.add(new SceneNode('ring' + i, { meshKey: 'neb:ring', build: () => GEO.torus(96, 14, 0.035), scl: [120 + i * 46, 120 + i * 46, 120 + i * 46],
    tick: (n, t) => { n.rot[0] = 0.5 + Math.sin(t * 0.01 + i) * 0.35; n.rot[1] = t * (0.006 + i * 0.004) * (i % 2 ? -1 : 1); }, mat: m({ col: i === 1 ? glow : edge, emis: 0.9, metal: 0.4, outline: 0 }) }));
  const orbit = new SceneNode('orbit', { pos: [0, -150, 0], tick: (n, t) => { n.rot[1] = t * 0.0035; } });
  for (let i = 0; i < 4; i++) { const ang = i / 4 * TAU, rx = a + 180, rz = 230;
    const mono = new SceneNode('monolith' + i, { pos: [Math.cos(ang) * rx, 0, Math.sin(ang) * rz], meshKey: 'neb:mono', build: () => GEO.superellipsoid(0.25, 0.3, 32, 24), ink: true, scl: [18, 62, 12],
      tick: (n, t) => { n.pos[1] = Math.sin(t * 0.02 + i * 1.7) * 22; n.rot[1] = -t * 0.0035 + i; n.rot[2] = Math.sin(t * 0.013 + i) * 0.12; }, mat: m({ col: mix3(dark, [0.3, 0.25, 0.5], 0.5), metal: 0.8, shin: 120 }) });
    mono.add(new SceneNode('core' + i, { meshKey: 'neb:glowball', build: () => GEO.sphere(24, 16), pos: [0, 0, 1.15], scl: [0.32, 0.12, 0.25], mat: { col: i % 2 ? edge : glow, glow: 1.4, glowPow: 0.6 } }));
    orbit.add(mono); }
  // two Bézier-patch solar sails swept back under the platform ends (bicubic surfaces, analytic normals)
  const sail = side => { const C = []; for (let r = 0; r < 4; r++) { const row = []; for (let c = 0; c < 4; c++) { const u = c / 3, v = r / 3;
      row.push([side * (u * 150 + v * 40), -v * 170 + Math.sin(u * Math.PI) * 26, -40 - u * 70 + Math.sin(v * Math.PI) * 30]); } C.push(row); } return C; };
  const sails = new SceneNode('sails');
  for (const sd of [-1, 1]) sails.add(new SceneNode('sail' + sd, { meshKey: 'neb:sail' + sd, build: () => GEO.bezierPatch(sail(sd), GL3D.mobile ? 12 : 20, true), pos: [sd * (a - 30), -30, 0],
    tick: (n, t) => { n.rot[2] = sd * Math.sin(t * 0.015) * 0.05; }, mat: m({ col: mix3(glow, [0.1, 0.05, 0.2], 0.45), emis: 0.35, metal: 0.2, alpha: 0.9, outline: 1.2, cull: false }) }));
  const platform = new SceneNode('nebulaPlatform').add(trim, keel, rings, orbit, sails);
  // far away: a ringed gas giant with a moon on its own orbit (hierarchy: giant → moon pivot → moon)
  const giant = new SceneNode('giant', { pos: [-1500, 700, -3900] }).add(
    new SceneNode('planet', { meshKey: 'neb:planet', build: () => GEO.sphere(64, 44), scl: [560, 560, 560], tick: (n, t) => { n.rot[1] = t * 0.0006; }, mat: { col: [0.45, 0.32, 0.85], spec: 0.25, shin: 14, outline: 0, shadow: false, rimK: 1.2, rimCol: [0.4, 0.9, 1] } }),
    new SceneNode('planetRing', { meshKey: 'neb:pring', build: () => GEO.torus(128, 6, 0.012), scl: [980, 980, 980], rot: [0.32, 0, -0.22], mat: { col: [0.62, 0.92, 1], emis: 0.6, outline: 0, shadow: false, alpha: 0.85, cull: false } }),
    new SceneNode('moonPivot', { tick: (n, t) => { n.rot[1] = t * 0.002; } }).add(new SceneNode('moon', { pos: [1250, 120, 0], meshKey: 'neb:moon', build: () => GEO.sphere(32, 22), scl: [95, 95, 95], mat: { col: [0.82, 0.8, 0.95], spec: 0.2, shin: 10, outline: 0, shadow: false } })));
  return (NEB_SG = { platform, giant });
}
function collectNebula3D() {
  const S = STAGE, N = nebulaScene(), t = G.time;
  N.platform.pos[0] = S.x + S.w / 2; N.platform.pos[1] = -S.y; sgDraw(N.platform, t);
  N.giant.pos[0] = S.x + S.w / 2 - 1500; N.giant.pos[1] = -S.y + 760; sgDraw(N.giant, t);
}
// Built stages are cached (a few at a time) so menus can flip between arenas without rebuilding their geometry.
const STAGE_CACHE = new Map(), STAGE_CACHE_MAX = 5;
function freeStageRec(r) { for (const m of [r.main, ...r.plats.map(p => p.mesh), r.scenery]) if (m) { glFreeMesh(m); if (m.outline) glFreeMesh(m.outline); } }
function buildStageRec(st, S, plats) {
  const P = st.pal, R = seeded(st.id + '/deco'), env = stageEnv(st), rec = { id: st.id, env, sky: stageSky(st, env) };
  rec.main = st.hull ? buildHull(S, P) : buildBlock(st.id, 'main', S.w, S.h, MAIN_DEPTH, 12, P, R);
  rec.plats = plats.map(p => {
    const h = Math.max(16, p.h + 8);
    const special = p.launch ? add => { add('box', 0, -h / 2, PLAT_DEPTH / 2 + 1, p.w - 10, h - 4, 2, col3('#2a303c'), 0); add('cyl', 0, 0.5, 0, p.w * 0.3, 2, PLAT_DEPTH * 0.3, col3(P.plat), 0.6); } : null;
    return { p, h, mesh: buildBlock(st.id, 'plat', p.w, h, PLAT_DEPTH, 5, P, R, special) };
  });
  // scenery → one merged mesh, coloured per material (0 body, 1 accent, 2 emissive lights)
  const sc = genScenery(st), f1 = col3(P.fill[1]), f0 = col3(P.fill[0]);
  const own = typeof SCENERY_COLS !== 'undefined' && SCENERY_COLS[THEME3D[st.id]];                                                         // (v14 maps pick their own scenery colours)
  const matCol = own ? own.map((h, i) => mix3(col3(h), env.fog, i === 2 ? 0.05 : 0.2)) : [mix3(f1, env.fog, 0.25).map(v => v * 0.85 + 0.03), mix3(mix3(f0, col3(P.edge), 0.35), env.fog, 0.15), mix3(env.glow, [1, 1, 1], 0.25)];
  if (sc.length) {
    const mg = geoMerge(sc.map(o => ({ g: o.g, m: o.m, c: [...matCol[o.mat], o.mat === 2 ? 1.3 : 0] })));
    rec.scenery = glMeshC(mg); rec.scenery.outline = glMesh(mg.pos, smoothNormals(mg), mg.idx);
  } else rec.scenery = null;
  return rec;
}
function stageRec(st, S, plats) {
  let r = STAGE_CACHE.get(st.id);
  if (r) { STAGE_CACHE.delete(st.id); STAGE_CACHE.set(st.id, r); r.plats.forEach((q, i) => { q.p = plats[i]; }); return r; }
  r = buildStageRec(st, S, plats); STAGE_CACHE.set(st.id, r);
  while (STAGE_CACHE.size > STAGE_CACHE_MAX) { const [k, old] = STAGE_CACHE.entries().next().value; if ((k === ST.id || k === STAGE3D.key) && STAGE_CACHE.size > 2) { STAGE_CACHE.delete(k); STAGE_CACHE.set(k, old); continue; } STAGE_CACHE.delete(k); freeStageRec(old); }
  return r;
}
function buildStage3D() {
  const r = stageRec(ST, STAGE, PLATS);
  Object.assign(STAGE3D, { key: ST.id, env: r.env, sky: r.sky, main: r.main, plats: r.plats, scenery: r.scenery, f: 0 });
}

/* ---- per frame: queue the stage's draw items + animated details ---- */
function collectStage3D() {
  if (STAGE3D.key !== ST.id || !STAGE3D.main) buildStage3D();
  const S = STAGE, P = ST.pal, E = STAGE3D.env; STAGE3D.f++;
  // main stage block
  let it = glItem(STAGE3D.main); M4.basis(it.m, S.x + S.w / 2, -S.y, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  it.spec = 0.3; it.shin = 30; it.outline = 2.2; it.outMesh = STAGE3D.main.outline; it.rimK = 0.2; it.metal = ST.clean ? 0.3 : 0;   // (a low rim: flat tops are seen at a grazing angle)
  if (ST.hull) { it.spec = 0.22; it.shin = 60; it.metal = 0.22; it.rimK = 0.08; collectNebula3D(); }   // the smooth hull + its scene graph (a soft sheen: the top is seen at a grazing angle)
  else stripGlow(S.x, S.w, -S.y, MAIN_DEPTH, E.edge, 0.9);
  // floating platforms (crumbling ones shake + crack, phasing ones strobe and turn into a hologram while out of phase)
  for (const q of STAGE3D.plats) {
    const p = q.p, up = platUp(p);
    let a = 1, sh = 0; if (p.phase !== undefined && p.warn) a = (G.time >> 2) & 1 ? 0.35 : 0.9;
    if (p.crumble) { const c = (p.crack || 0) / CRUMBLE_T; if (c > 0.3) sh = Math.sin(G.time * 1.7) * c * 2.5; }
    if (!up) { ghostBlock(p, q.h, p.crumble ? 1 - p.downT / CRUMBLE_BACK : 0.5); continue; }
    it = glItem(q.mesh); M4.basis(it.m, p.x + p.w / 2 + sh, -p.y, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    it.spec = 0.45; it.shin = 40; it.outline = a < 1 ? 0 : 1.6; it.outMesh = q.mesh.outline; it.alpha = a; it.rimK = 0.3;
    stripGlow(p.x + sh, p.w, -p.y, PLAT_DEPTH, col3(P.plat), 0.7 * a);
    if (p.crumble && p.crack > 0) crackChips(p, sh, (p.crack || 0) / CRUMBLE_T);
  }
  // deep scenery
  if (STAGE3D.scenery) { it = glItem(STAGE3D.scenery); M4.ident(it.m); it.shadow = false; it.spec = 0.12; it.shin = 16; it.rimK = 0.25;
    it.outline = 3; it.outMesh = STAGE3D.scenery.outline; it.inkPx = [0.9, 2.2]; }
  stageAnim3D();
  if (ST.portals) portals3D();
  if (ST.id === 'dragonspine') collectDragon3D(); else if (ST.id === 'horizon') collectHorizon3D();   // v13: the shop maps' living set pieces
  else if (typeof MAP3D !== 'undefined' && MAP3D[ST.id]) MAP3D[ST.id]();                              // v14: Japanese Garden · Runaway Train · Giant Pinball Machine (render/maps14.js)
  if (typeof collectStage15 === 'function') collectStage15();                                         // v15: every legacy arena's platform kit + hero set piece (render/stages15.js)
}
/* ---- v13 Dragon's Spine: the colossal sky-dragon the arena rides on — a scene graph: a scaled belly under the stage, an
 *      arching neck and a horned head that roars, a beating far wing and a tucked near wing (Bézier-patch membranes on
 *      finger bones) and a swaying tail ---- */
let DRAGON_SG = null;
function dragonScene() {
  if (DRAGON_SG) return DRAGON_SG;
  const a = STAGE.w / 2, scale = { col: [0.42, 0.13, 0.17], spec: 0.7, shin: 60, metal: 0.25, outline: 1.6, rimK: 0.9, rimCol: [1, 0.6, 0.35] }, bone = { col: [0.9, 0.84, 0.74], spec: 0.5, shin: 40, outline: 1.2 };
  const blob = (k, pos, scl, mat, tick) => new SceneNode(k, { pos, scl, meshKey: 'drg:blob', build: () => GEO.superellipsoid(0.85, 0.85, 28, 20), mat, tick, ink: true });
  const coneN = (k, pos, scl, rot, mat) => new SceneNode(k, { pos, scl, rot, meshKey: 'drg:cone', build: () => GEO.cylinder(16, true, 0.001), mat });
  const body = new SceneNode('body').add(blob('belly', [0, -150, -10], [a * 1.15, 120, 150], Object.assign({}, scale, { col: [0.36, 0.11, 0.15] })));
  // the neck: a chain of segments arching up and forward to the head
  const neck = new SceneNode('neck', { pos: [a - 30, -70, -70] }); let prev = neck;
  for (let i = 0; i < 6; i++) { const seg = new SceneNode('n' + i, { pos: i ? [40, 12 - i * 1.5, 0] : [0, 0, 0], rot: [0, 0, 0.1], tick: (n, t) => { n.rot[2] = 0.1 + Math.sin(t * 0.02 + i * 0.5) * 0.04; } });
    seg.add(blob('ns' + i, [24, 0, 0], [40 - i * 2.4, 34 - i * 2, 34 - i * 2], scale)); seg.add(coneN('nsp' + i, [24, 26 - i * 2, 0], [6, 22 - i, 6], [0, 0, 0.3], bone)); prev.add(seg); prev = seg; }
  const head = new SceneNode('head', { pos: [62, 4, 0], tick: (n, t) => { n.rot[2] = -0.25 + Math.sin(t * 0.017) * 0.06; } });
  const roar = t => Math.max(0, Math.sin(t * 0.012)) ** 6;
  head.add(blob('skull', [44, 6, 0], [64, 30, 30], scale), new SceneNode('jaw', { pos: [10, -10, 0], tick: (n, t) => { n.rot[2] = -0.08 - roar(t) * 0.45; } }).add(blob('jawb', [40, -8, 0], [56, 13, 24], scale)));
  for (const sd of [-1, 1]) { head.add(coneN('horn' + sd, [20, 22, sd * 16], [8, 54, 8], [sd * 0.25, 0, 1.1], bone)); head.add(coneN('horn2' + sd, [36, 26, sd * 18], [5, 26, 5], [sd * 0.3, 0, 0.8], bone));
    head.add(new SceneNode('eye' + sd, { pos: [74, 14, sd * 22], scl: [7, 5, 5], meshKey: 'drg:ball', build: () => GEO.sphere(16, 12), mat: { col: [1, 0.6, 0.1], glow: 1.6, glowPow: 0.6 } })); }
  head.add(new SceneNode('breath', { pos: [112, -4, 0], meshKey: 'drg:ball', build: () => GEO.sphere(16, 12), scl: [24, 18, 18], tick: (n, t) => { const k = roar(t); n.scl[0] = 10 + k * 70; n.pos[0] = 104 + k * 60; n.mat.glow = 0.2 + k * 1.4; }, mat: { col: [1, 0.5, 0.12], glow: 0.4, glowPow: -1.2 } }));
  prev.add(head);
  // the far wing, raised behind the arena: a bat-wing membrane stretched between an arm bone and four finger bones, its trailing
  // edge scalloped between the fingertips; it beats by tilting toward / away from the camera and folding a little on each stroke
  const wing = new SceneNode('wingFar', { pos: [-a * 0.55, -70, -260], scl: [0.85, 0.85, 0.85], tick: (n, t) => { const s = Math.sin(t * 0.035); n.rot[0] = -0.15 + s * 0.42; n.scl[1] = 0.85 * (1 - Math.max(0, -s) * 0.22); n.rot[2] = 0.18 + s * 0.05; } });
  wing.add(new SceneNode('wingMem', { meshKey: 'drg:wingM', build: () => dragonWingGeo(false), mat: { col: [0.6, 0.17, 0.2], spec: 0.3, shin: 20, emis: 0.2, alpha: 0.95, outline: 1.4, cull: false, rimK: 1.3, rimCol: [1, 0.62, 0.36] } }),
    new SceneNode('wingBone', { meshKey: 'drg:wingB', build: () => dragonWingGeo(true), mat: bone, ink: true }));
  body.add(wing);
  // the tail: segments trailing left and down, swaying
  const tail = new SceneNode('tail', { pos: [-a + 10, -110, -40] }); let tp = tail;
  for (let i = 0; i < 8; i++) { const sg = new SceneNode('t' + i, { pos: i ? [-44 + i * 1.5, -6, 0] : [0, 0, 0], tick: (n, t) => { n.rot[1] = Math.sin(t * 0.025 + i * 0.6) * 0.08; n.rot[2] = -0.05 + Math.sin(t * 0.02 + i * 0.7) * 0.05; } });
    sg.add(blob('ts' + i, [-22, 0, 0], [30 - i * 3, 26 - i * 2.6, 26 - i * 2.6], scale)); if (i % 2 === 0) sg.add(coneN('tsp' + i, [-22, 22 - i * 2.4, 0], [5, 18 - i, 5], [0, 0, -0.3], bone)); tp.add(sg); tp = sg; }
  body.add(neck, tail);
  return (DRAGON_SG = { body });
}
// the wing in its own plane (x along the body, y up): membrane = triangle fans from the wrist with sagging, scalloped edges between fingertips
function dragonWingGeo(bones) {
  const W = [70, 210], root = [0, 0], tips = [[-30, 380], [-150, 350], [-250, 250], [-300, 110], [-170, 10]];
  if (bones) { const seg = (A, B, r) => { const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); return { g: GEO.cylinder(10, true, 0.35), m: trs(A[0], A[1], 0, r, L, r, 0, Math.atan2(-dx, dy)) }; };
    const g = geoMerge([seg(root, W, 9), ...tips.slice(0, 4).map(T => seg(W, T, 5)), ...tips.slice(0, 4).map(T => ({ g: GEO.cylinder(10, true, 0.001), m: trs(T[0], T[1], 0, 5, 24, 5, 0, Math.atan2(-(T[0] - W[0]), T[1] - W[1])) }))]);
    return { pos: g.pos, nor: g.nor, idx: g.idx }; }
  const pos = [], nor = [], idx = [], P = (x, y) => { pos.push(x, y, 0); nor.push(0, 0, 1); return pos.length / 3 - 1; };
  const fan = (C, A, B, sag) => { const c = P(C[0], C[1]); let prev = null;
    for (let i = 0; i <= 10; i++) { const s = i / 10, x = A[0] + (B[0] - A[0]) * s, y = A[1] + (B[1] - A[1]) * s, k = Math.sin(Math.PI * s) * sag, v = P(x + (C[0] - x) * k, y + (C[1] - y) * k);
      if (prev !== null) idx.push(c, prev, v); prev = v; } };
  for (let i = 0; i < tips.length - 1; i++) fan(W, tips[i], tips[i + 1], 0.28);
  fan(W, tips[tips.length - 1], root, 0.12);
  return { pos, nor, idx };
}
function collectDragon3D() {
  const S = STAGE, N = dragonScene(), t = G.time;
  N.body.pos[0] = S.x + S.w / 2; N.body.pos[1] = -S.y + Math.sin(t * 0.035) * 4; sgDraw(N.body, t);     // (the whole dragon rises and falls a little with each wing beat)
}
/* ---- v13 Event Horizon: the crystal shard's hanging crystals and a tilted ring of debris in orbit round it ---- */
let HORIZON_SG = null;
function horizonScene() {
  if (HORIZON_SG) return HORIZON_SG;
  const P = ST.pal, plat = col3(P.plat), edge = col3(P.edge);
  const ring = new SceneNode('debrisRing', { pos: [0, -40, -60], rot: [0.32, 0, 0.12], tick: (n, t) => { n.rot[1] = t * 0.0022; } });
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, r = 560 + (i % 3) * 40;
    ring.add(new SceneNode('rock' + i, { pos: [Math.cos(a) * r, (i % 4 - 1.5) * 14, Math.sin(a) * r * 0.55], scl: [16 + (i * 7) % 18, 12 + (i * 5) % 14, 14 + (i * 3) % 12], meshKey: 'hz:rock', build: () => geoFlat(GEO.octa()), ink: true,
      tick: (n, t) => { n.rot[0] = t * 0.01 + i; n.rot[1] = t * 0.013 + i * 2; }, mat: { col: i % 4 ? [0.2, 0.17, 0.26] : mix3(plat, [0.2, 0.15, 0.3], 0.4), spec: 0.4, shin: 30, emis: i % 4 ? 0 : 0.5, outline: 1.2 } })); }
  void edge;
  return (HORIZON_SG = { root: new SceneNode('hzRoot').add(ring) });
}
function collectHorizon3D() { const S = STAGE, N = horizonScene(); N.root.pos[0] = S.x + S.w / 2; N.root.pos[1] = -S.y; sgDraw(N.root, G.time); }
/* ---- v12: the arenas' light rigs — coloured cel point lights per theme (gl3d.js glPointLight: ≤ 8 per view), plus
 *      the effects' own light: projectiles, fresh impacts and Ultimates light the fighters and the stage. ---- */
const LIGHT_RIG = {
  volcano: 'lava', caldera: 'lava', neon: 'city', highway: 'city', expressway: 'city', subway: 'city', skyline: 'city', grid: 'city',
  space: 'cosmic', starlight: 'cosmic', astral: 'cosmic', observatory: 'cosmic', nebula: 'cosmic', celestial: 'cosmic',
  forest: 'fireflies', ruins: 'fireflies', temple: 'lanterns', shrine: 'lanterns', obsidian: 'torches', storm: 'torches', forge: 'torches', dragonspine: 'dragonfire', horizon: 'accretion',
  abyss: 'caustic', haven: 'caustic', stadium: 'strobe', cybercol: 'strobe', speedway: 'strobe', training: 'holo', vault: 'holo', matrix: 'holo', citadel: 'holo', quantum: 'toxic'
};
function stageLights3D() {
  const S = STAGE, P = ST.pal, t = G.time, cx = S.x + S.w / 2, top = -S.y, glow = col3(P.glow), edge = col3(P.edge), plat = col3(P.plat), dim = STAGE3D.env && STAGE3D.env.bright ? 0.45 : 1;
  const L = (x, y, z, r, c, k) => glPointLight(x, y, z, r, c, k * dim);
  const rig = LIGHT_RIG[ST.id] || 'edges';
  if (typeof LIGHT_EXT !== 'undefined' && LIGHT_EXT[rig]) LIGHT_EXT[rig](L, S, t, cx, top);                                               // v14 shop maps (render/maps14.js)
  else switch (rig) {
    case 'lava': L(cx, top - S.h - 240, 60, 1100, [1, 0.42, 0.12], 1.25 + 0.25 * Math.sin(t * 0.11) + 0.1 * Math.sin(t * 0.37)); L(S.x - 120, top - 300, 0, 700, [1, 0.3, 0.06], 0.7); L(S.x + S.w + 120, top - 300, 0, 700, [1, 0.3, 0.06], 0.7); break;
    case 'city': for (let i = 0; i < 3; i++) { const c = (i + (t >> 6)) % 2 ? [1, 0.25, 0.85] : [0.15, 0.85, 1]; L(S.x + S.w * (0.15 + i * 0.35), top + 150, 120, 520, c, 0.75 + 0.2 * Math.sin(t * 0.05 + i * 2)); } break;
    case 'cosmic': L(cx, top + 260, -260, 1000, mix3(glow, [1, 1, 1], 0.3), 0.7); L(S.x - 60, top + 40, 100, 600, edge, 0.6); L(S.x + S.w + 60, top + 40, 100, 600, plat, 0.6); break;
    case 'fireflies': for (let i = 0; i < 4; i++) { const a = t * 0.006 + i * 1.7; L(cx + Math.sin(a * 1.3 + i) * S.w * 0.55, top + 90 + Math.sin(a * 2.1) * 60, 60 + Math.cos(a) * 80, 230, [0.65, 1, 0.45], 0.55 + 0.35 * Math.sin(t * 0.13 + i * 3)); } break;
    case 'lanterns': for (const q of STAGE3D.plats.slice(0, 3)) L(q.p.x + q.p.w / 2, -q.p.y - q.h - 40, 60, 420, [1, 0.62, 0.3], 0.85 + 0.08 * Math.sin(t * 0.2 + q.p.x));
      L(cx, top + 80, 160, 700, [1, 0.7, 0.45], 0.45); break;
    case 'torches': for (const sx of [S.x + 30, S.x + S.w - 30]) L(sx, top + 70, 90, 520, [1, 0.55, 0.2], 0.85 + 0.15 * Math.sin(t * 0.43 + sx) + 0.08 * Math.sin(t * 1.3 + sx));
      if (ST.id === 'storm') { const fl = stormFlash(); if (fl > 0) L(cx, top + 700, 300, 2400, [0.8, 0.86, 1], 2.2 * fl); } break;
    case 'caustic': for (let i = 0; i < 3; i++) L(S.x + S.w * (0.2 + i * 0.3) + Math.sin(t * 0.02 + i) * 60, top + 260, 140, 520, [0.3, 0.85, 1], 0.55 + 0.25 * Math.sin(t * 0.07 + i * 2.3)); break;
    case 'strobe': for (let i = 0; i < 3; i++) { const on = ((t >> 4) + i) % 3 === 0, c = [[1, 0.2, 0.5], [0.2, 0.9, 1], [1, 0.85, 0.2]][i]; L(S.x + S.w * (0.15 + i * 0.35), top + 320, 200, 650, c, on ? 1.1 : 0.35); } break;
    case 'holo': L(cx, top + 200, 120, 900, [0.25, 0.9, 1], 0.6); L(cx, top - 120, 120, 600, [0.5, 0.4, 1], 0.45); break;
    case 'toxic': L(cx, top - 200, 80, 900, [0.55, 1, 0.2], 0.8 + 0.2 * Math.sin(t * 0.08)); break;
    case 'dragonfire': { const roar = Math.max(0, Math.sin(t * 0.012)) ** 6;                                          // the setting sun from the right + the dragon's breath
      L(S.x + S.w + 260, top + 140, -60, 1100, [1, 0.5, 0.16], 0.55 + roar * 1.6 + 0.08 * Math.sin(t * 0.4)); L(cx, top + 420, 200, 1400, [1, 0.62, 0.42], 0.55); L(S.x - 200, top - 120, 0, 700, [0.55, 0.3, 0.6], 0.4); break; }
    case 'accretion': L(cx - 900, top + 700, -400, 2600, [1, 0.58, 0.2], 1.15); L(cx, top - 160, 160, 760, [0.62, 0.42, 1], 0.55);   // the disk's orange light + a violet bounce off the crystal
      for (const q of STAGE3D.plats.slice(0, 2)) L(q.p.x + q.p.w / 2, -q.p.y - q.h - 20, 70, 300, col3(P.plat), 0.5); break;
    default: L(S.x + 20, top + 50, 90, 460, edge, 0.6); L(S.x + S.w - 20, top + 50, 90, 460, edge, 0.6); L(cx, top - S.h - 90, 80, 560, glow, 0.55);
  }
  // the effects' light: Ultimates first, then fresh impacts, then glowing projectiles
  for (const f of fighters) if (f.state === 'ultimate' && GL3D.plN < 8) glPointLight(f.x, -(f.y - 40), 80, 520, col3(f.color), 1.3);
  for (const p of fx) { if (GL3D.plN >= 8) break; if (p.type === 'ring' && p.max - p.life < 6 && p.w >= 4) glPointLight(p.x, -p.y, 70, 260, col3(p.color || '#ffffff'), 1.6 * (p.life / p.max)); }
  for (const p of projs) { if (GL3D.plN >= 8) break; if (p.r) glPointLight(p.x, -p.y, 50, 150 + p.r * 4, col3(p.color || '#ffffff'), 0.9); }
}
// Glowing neon strips along a block's top perimeter (additive)
function stripGlow(x, w, yTop, d, col, k) {
  if (k <= 0.02) return;
  const y = yTop + 1, t = 2.4;
  for (const [cx, cz, sx, sz] of [[x + w / 2, d / 2 - 1, w - 8, t], [x + w / 2, -d / 2 + 1, w - 8, t], [x + 2, 0, t, d - 6], [x + w - 2, 0, t, d - 6]])
    BAT.glow.add(BAT.T.box, xf(SM, cx, y, cz, sx, t, sz), col[0], col[1], col[2], k * 1.6);
}
const SM = new Float32Array(16);
// a platform that isn't there right now: a holographic wire outline (rebuilding / out of phase)
function ghostBlock(p, h, k) {
  const c = col3(ST.pal.plat), a = 0.25 + 0.5 * k * k, cx = p.x + p.w / 2, y0 = -p.y, d = PLAT_DEPTH;
  for (const [x, y, z, sx, sy, sz] of [[cx, y0, d / 2, p.w, 1.6, 1.6], [cx, y0, -d / 2, p.w, 1.6, 1.6], [cx, y0 - h, d / 2, p.w, 1.6, 1.6], [p.x, y0 - h / 2, d / 2, 1.6, h, 1.6], [p.x + p.w, y0 - h / 2, d / 2, 1.6, h, 1.6],
    [p.x, y0, 0, 1.6, 1.6, d], [p.x + p.w, y0, 0, 1.6, 1.6, d]]) BAT.glow.add(BAT.T.box, xf(SM, x, y, z, sx, sy, sz), c[0], c[1], c[2], a);
}
// Forgotten Temple: dark crack chips spreading over a ledge as it weakens, grit trickling out
function crackChips(p, sh, q) {
  const n = Math.floor(3 + q * 9), cx = p.x + p.w / 2 + sh;
  for (let i = 0; i < n; i++) { const u = hash(i * 3.7 + p.x) - 0.5, v = hash(i * 1.9 + p.x * 0.3);
    BAT.flat.add(BAT.T.box, xf(SM, cx + u * p.w * 0.8, -p.y - 2 - v * 12, PLAT_DEPTH / 2 + 1.2, 2 + q * 3, 8 + v * 8, 1, 0, u * 2), 0.12, 0.09, 0.05, 0); }
}
// Astral Void: two swirling 3D warp portals — spinning rings round a glowing vortex core
function portals3D() {
  const P = ST.pal, t = G.time, e = col3(P.edge), gl0 = col3(P.glow), pl = col3(P.plat);
  for (const [i, q] of ST.portals.entries()) {
    const x = q.x, y = -q.y, dir = i ? -1 : 1;
    for (let k = 0; k < 3; k++) { const c = k % 2 ? e : pl;
      BAT.lit.add(BAT.T.torus, xf(SM, x, y, 0, 18 + k * 7, 18 + k * 7, 18 + k * 7, t * 0.03 * dir * (k + 1), t * 0.05 * dir + k, Math.PI / 2 + Math.sin(t * 0.02 + k) * 0.5), c[0], c[1], c[2], 0.85); }
    BAT.glow.add(BAT.T.sphHi, xf(SM, x, y, 0, 16, 16, 16), gl0[0], gl0[1], gl0[2], 1.2);
    BAT.glow.add(BAT.T.sph, xf(SM, x, y, 0, 34, 34, 34), e[0], e[1], e[2], 0.35);
    for (let k = 0; k < 6; k++) { const a = t * 0.08 * dir + k * TAU / 6, r = 26 + Math.sin(t * 0.1 + k) * 4;
      BAT.glow.add(BAT.T.octa, xf(SM, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.sin(a * 2) * 8, 2.5, 2.5, 2.5, a, a), 1, 1, 1, 1); }
  }
}
// Animated stage details (rebuilt every frame in the batches)
function stageAnim3D() {
  const S = STAGE, P = ST.pal, t = G.time, id = ST.id, fz = MAIN_DEPTH / 2, y0 = -S.y, x0 = S.x, gw = BAT.glow, L = BAT.lit;
  const edge = col3(P.edge), plat = col3(P.plat), glow = col3(P.glow);
  switch (id) {
    case 'dock': for (let x = x0 + 40, k = 0; x < x0 + S.w - 20; x += 85, k++) { const on = ((t >> 4) + k) % 4 === 0; gw.add(BAT.T.box, xf(SM, x + 5, y0 - S.h + 12, fz + 2, 10, 4, 2), on ? 1 : 0.24, on ? 1 : 0.82, 1, on ? 1.6 : 0.8); }
      for (const q of STAGE3D.plats) if (q.p.launch && platUp(q.p)) for (let k = 0; k < 3; k++) { const p = q.p, u = (t * 0.04 + k / 3) % 1;
        for (const s of [-1, 1]) gw.add(BAT.T.box, xf(SM, p.x + p.w / 2 + s * 11, -p.y + 6 + u * 46 + 5, 0, 24, 3, 3, 0, -s * 0.45), plat[0], plat[1], plat[2], 1.2 * (1 - u)); }
      break;
    case 'stadium': { const kick = Math.pow(1 - (t % 40) / 40, 2);
      for (let x = x0, k = 0; x < x0 + S.w - 20; x += 40, k++) for (let yy = 8, j = 0; yy < S.h - 10; yy += 20, j++) { const on = hash(k * 7 + j * 13 + (t / 40 | 0)) > 0.6;
        if (on) gw.add(BAT.T.box, xf(SM, x + 20, y0 - yy - 8, fz + 1.5, 36, 17, 1), k % 2 ? 1 : 0.18, k % 2 ? 0.18 : 0.94, k % 2 ? 0.9 : 1, 0.25 + 0.7 * kick); }
      for (const q of STAGE3D.plats) { const p = q.p; for (let x = p.x + 8, k = 0; x < p.x + p.w - 4; x += 16, k++) { const w = (k + (t >> 3)) % 4 === 0; gw.add(BAT.T.sph, xf(SM, x + 2, -p.y - q.h - 2, PLAT_DEPTH / 2, 2.6, 2.6, 2.6), w ? 1 : k % 2 ? 1 : 0.18, w ? 1 : k % 2 ? 0.18 : 0.94, 1, 1.4); } }
      break; }
    case 'highway': case 'expressway': { const c = id === 'highway' ? col3('#ffd23a') : col3('#2ef0ff'), sp = id === 'highway' ? 3 : 5;
      for (let x = x0 + ((t * sp) % 70) - 70; x < x0 + S.w; x += 70) { const a = Math.max(x, x0 + 4), b = Math.min(x + 36, x0 + S.w - 4); if (b > a) gw.add(BAT.T.box, xf(SM, (a + b) / 2, y0 + 1.2, 10, b - a, 1.5, 6), c[0], c[1], c[2], 1.3); }
      break; }
    case 'space': for (let x = x0 + 14 + ((t * 1.5) % 44) - 44; x < x0 + S.w - 14; x += 44) { const a = Math.max(x, x0 + 14), b = Math.min(x + 26, x0 + S.w - 14); if (b > a) gw.add(BAT.T.box, xf(SM, (a + b) / 2, y0 - S.h * 0.55, fz + 2.5, b - a, 4, 2), edge[0], edge[1], edge[2], 1.4); } break;
    case 'starlight': for (let i = 0; i < 3; i++) { const yy = y0 - 14 - i * 14, c = [[0.8, 0.5, 1], [0.6, 0.6, 1], [0.5, 0.8, 1]][i];
      for (let x = x0 + 10; x < x0 + S.w - 20; x += 20) { const a = [x, yy + Math.sin(x * 0.03 + t * 0.08 + i) * 3, fz + 1.5], b = [x + 20, yy + Math.sin((x + 20) * 0.03 + t * 0.08 + i) * 3, fz + 1.5]; gw.add(BAT.T.tube, xfSeg(SM, a, b, 1.2, 1.2), c[0], c[1], c[2], 1); } } break;
    case 'citadel': for (let x = x0 + ((t * 0.5) % 60) - 60; x < x0 + S.w; x += 60) for (const s of [0, 1]) { const a = [x + s * 30, y0 - (s ? 8 : S.h), fz + 1.5], b = [x + 30 + s * 30, y0 - (s ? S.h : 8), fz + 1.5];
      if (a[0] > x0 && b[0] < x0 + S.w) gw.add(BAT.T.tube, xfSeg(SM, a, b, 0.9, 0.9), 0.35, 1, 0.94, 0.7); } break;
    case 'clockwork': { const cx = x0 + S.w / 2, cy = y0 - S.h / 2 - 2;
      L.add(BAT.T.cyl, xf(SM, cx, cy, fz, 24, 4, 24, 0, 0, Math.PI / 2), edge[0] * 0.8, edge[1] * 0.8, edge[2] * 0.8, 0.1);
      for (let i = 0; i < 10; i++) { const a = t * 0.02 + i / 10 * TAU; L.add(BAT.T.box, xf(SM, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, fz + 2, 7, 7, 4, 0, a), edge[0], edge[1], edge[2], 0.1); }
      for (const q of STAGE3D.plats) { const p = q.p; for (const [gx, d] of [[p.x + 10, 1], [p.x + p.w - 10, -1]]) { const gy = -p.y - 18;
        L.add(BAT.T.cyl, xf(SM, gx, gy, PLAT_DEPTH / 2, 11, 3, 11, 0, 0, Math.PI / 2), plat[0], plat[1], plat[2], 0.05);
        for (let i = 0; i < 8; i++) { const a = t * 0.05 * d + i / 8 * TAU; L.add(BAT.T.box, xf(SM, gx + Math.cos(a) * 12, gy + Math.sin(a) * 12, PLAT_DEPTH / 2 + 1, 4.5, 4.5, 3, 0, a), plat[0], plat[1], plat[2], 0.05); } } }
      break; }
    case 'abyss': for (let x = x0 + 40; x < x0 + S.w - 30; x += 90) for (let k = -2; k <= 2; k++) { const a = [x + k * 3, y0, fz - 8], b = [x + k * 5 + Math.sin(t * 0.05 + k) * 3, y0 + 12 - Math.abs(k) * 2, fz - 8];
      L.add(BAT.T.cone, xfSeg(SM, a, b, 2.2, 2.2), 1, 0.5, 0.66, 0.35 + 0.25 * Math.sin(t * 0.05)); } break;
    case 'temple': for (const q of STAGE3D.plats) { const p = q.p, lx = p.x + p.w / 2, sw = Math.sin(t * 0.04 + p.x) * 2, top = [lx, -p.y - q.h, PLAT_DEPTH / 2 - 10], bot = [lx + sw, -p.y - q.h - 12, PLAT_DEPTH / 2 - 10];
      L.add(BAT.T.tube, xfSeg(SM, top, bot, 0.6, 0.6), 0.23, 0.16, 0.12, 0); L.add(BAT.T.sph, xf(SM, bot[0], bot[1] - 9, bot[2], 7, 9, 7), 1, 0.42, 0.23, 0.9);
      gw.add(BAT.T.sph, xf(SM, bot[0], bot[1] - 9, bot[2], 16, 16, 16), 1, 0.54, 0.35, 0.5); } break;
    case 'obsidian': for (const q of STAGE3D.plats) { const p = q.p; for (const sx of [-1, 1]) { const x = p.x + p.w / 2 + sx * (p.w / 2 - 16), fy = -p.y + 15 + Math.sin(t * 0.5 + sx) * 0.6;
      L.add(BAT.T.sph, xf(SM, x, fy, PLAT_DEPTH / 2 - 20, 2.2, 4, 2.2), 1, 0.83, 0.54, 1); gw.add(BAT.T.sph, xf(SM, x, fy, PLAT_DEPTH / 2 - 20, 9, 11, 9), 1, 0.8, 0.42, 0.55); } } break;
    case 'storm': { const fl = stormFlash(); if (fl > 0) gw.add(BAT.T.box, xf(SM, x0 + S.w / 2, y0 + 1, 0, S.w - 8, 1.5, MAIN_DEPTH - 10), 0.9, 0.94, 1, fl * 0.9); break; }
    case 'aurora': case 'peak': { const x = x0 + ((t * (id === 'peak' ? 3 : 2)) % (S.w + 120)) - 60; if (x > x0 && x < x0 + S.w - 26) gw.add(BAT.T.box, xf(SM, x, y0 - S.h / 2, fz + 2, 26, S.h - 4, 1), 0.9, 1, 1, 0.45); break; }
    case 'skyline': for (let x = x0 + 30; x < x0 + S.w - 20; x += 80) gw.add(BAT.T.box, xf(SM, x + 10, y0 - S.h + 12, fz + 2, 20, 3, 1.5), 0.5, 0.85, 1, 1.2);
      for (const q of STAGE3D.plats) { const p = q.p; for (let x = p.x + 10; x < p.x + p.w - 6; x += 20) { const w = ((t >> 3) + x / 20) % 6 < 1; gw.add(BAT.T.box, xf(SM, x + 2, -p.y - q.h + 1, PLAT_DEPTH / 2 + 1, 4, 2, 1.5), w ? 1 : 0.24, w ? 1 : 0.94, 1, 1.3); } } break;
    case 'neon': { const c = (t >> 5) & 1 ? col3('#ff4fd8') : col3('#22e6ff'); gw.add(BAT.T.box, xf(SM, x0 + S.w / 2, y0 - S.h + 8, fz + 2, S.w - 24, 2.5, 1.5), c[0], c[1], c[2], 1.2); break; }
    case 'volcano': case 'caldera': { const k = 0.45 + 0.3 * Math.sin(t * 0.05); gw.add(BAT.T.box, xf(SM, x0 + S.w / 2, y0 - S.h / 2, fz + 1.5, S.w - 30, S.h - 20, 1), 1, 0.35, 0.1, 0.18 * k); break; }
    case 'subway': gw.add(BAT.T.box, xf(SM, x0 + S.w / 2, y0 - S.h + 7, fz + 2, S.w - 6, 3, 1.5), 0.24, 0.94, 1, 1.1); break;
    case 'matrix': case 'vault': case 'cybercol': case 'training': break;
  }
}
