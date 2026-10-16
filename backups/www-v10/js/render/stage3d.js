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
  celestial: 'islands', subway: 'tunnel', astral: 'space', training: 'holo'
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
    case 'gears': if (!E.bright) { S.Zen = [0.06, 0.04, 0.02]; S.Hor = mix3(hor, [1, 0.7, 0.3], 0.35); S.K = [0, 0.3, 0.4, 0]; S.Cl1 = [0.5, 0.36, 0.2]; S.Cl2 = [0.2, 0.13, 0.08]; S.horGlow = 0.9; } break;
  }
  if (st.id === 'aurora') S.K[3] = 1.2;
  if (st.id === 'starlight' || st.id === 'astral') { S.K[1] = 1.2; S.moon = st.id === 'astral' ? 0.22 : 0.12; }
  return S;
}

/* ---- primitives for static geometry (merged meshes) ---- */
let PROTO = null;
function protos() {
  if (!PROTO) PROTO = { box: GEO.box(), rbox: GEO.rbox(), cyl: GEO.cylinder(12, true), cone: GEO.cylinder(10, true, 0.001), pyr: GEO.cylinder(4, true, 0.001),
                        sph: GEO.sphere(12, 8), hemi: GEO.sphere(14, 10), octa: GEO.octa(), torus: GEO.torus(24, 6, 0.08), ring: GEO.torus(40, 6, 0.04), disc: GEO.cylinder(16, true),
                        star: GEO.star(), hex: GEO.cylinder(6, true), tri: GEO.cylinder(3, true), gear: gearGeo(12) };
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
    case 'wasteland': {
      for (let i = 0; i < 40; i++) { const x = r(X0, X1), z = deep(-400, -2800), h = r(300, 1400); put('box', x, top - 500 + h / 2, z, r(100, 260), h, r(100, 260), 0, r(0, 3), r(-0.2, 0.2)); }
      for (let i = 0; i < 16; i++) put('sph', r(X0, X1), top - r(500, 800), deep(-400, -2400), r(150, 380), 20, r(120, 260), 2);       // toxic pools
      for (let i = 0; i < 30; i++) put('cyl', r(X0, X1), top - r(500, 800), deep(-300, -2000), r(20, 40), r(60, 110), r(20, 40), 1);     // barrels
      break;
    }
  }
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
    case 'training': lip(C('#3df0ff'), 1, 3); break;
  }
}

/* ---- build everything for the current stage (once per stage) ---- */
function buildBlock(id, kind, w, h, d, bevel, pal, R, special) {
  // the prism, coloured per face (top lighter, sides the stage fill, underside darker), + its merged 3D detailing
  const g = GEO.prism(w, h, d, bevel), P = pal, parts = [];
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
// Built stages are cached (a few at a time) so menus can flip between arenas without rebuilding their geometry.
const STAGE_CACHE = new Map(), STAGE_CACHE_MAX = 5;
function freeStageRec(r) { for (const m of [r.main, ...r.plats.map(p => p.mesh), r.scenery]) if (m) { glFreeMesh(m); if (m.outline) glFreeMesh(m.outline); } }
function buildStageRec(st, S, plats) {
  const P = st.pal, R = seeded(st.id + '/deco'), env = stageEnv(st), rec = { id: st.id, env, sky: stageSky(st, env) };
  rec.main = buildBlock(st.id, 'main', S.w, S.h, MAIN_DEPTH, 12, P, R);
  rec.plats = plats.map(p => {
    const h = Math.max(16, p.h + 8);
    const special = p.launch ? add => { add('box', 0, -h / 2, PLAT_DEPTH / 2 + 1, p.w - 10, h - 4, 2, col3('#2a303c'), 0); add('cyl', 0, 0.5, 0, p.w * 0.3, 2, PLAT_DEPTH * 0.3, col3(P.plat), 0.6); } : null;
    return { p, h, mesh: buildBlock(st.id, 'plat', p.w, h, PLAT_DEPTH, 5, P, R, special) };
  });
  // scenery → one merged mesh, coloured per material (0 body, 1 accent, 2 emissive lights)
  const sc = genScenery(st), f1 = col3(P.fill[1]), f0 = col3(P.fill[0]);
  const matCol = [mix3(f1, env.fog, 0.25).map(v => v * 0.85 + 0.03), mix3(mix3(f0, col3(P.edge), 0.35), env.fog, 0.15), mix3(env.glow, [1, 1, 1], 0.25)];
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
  it.spec = 0.3; it.shin = 30; it.outline = 2.2; it.outMesh = STAGE3D.main.outline; it.rimK = 0.35; it.metal = ST.clean ? 0.3 : 0;
  stripGlow(S.x, S.w, -S.y, MAIN_DEPTH, E.edge, 0.9);
  // floating platforms (crumbling ones shake + crack, phasing ones strobe and turn into a hologram while out of phase)
  for (const q of STAGE3D.plats) {
    const p = q.p, up = platUp(p);
    let a = 1, sh = 0; if (p.phase !== undefined && p.warn) a = (G.time >> 2) & 1 ? 0.35 : 0.9;
    if (p.crumble) { const c = (p.crack || 0) / CRUMBLE_T; if (c > 0.3) sh = Math.sin(G.time * 1.7) * c * 2.5; }
    if (!up) { ghostBlock(p, q.h, p.crumble ? 1 - p.downT / CRUMBLE_BACK : 0.5); continue; }
    it = glItem(q.mesh); M4.basis(it.m, p.x + p.w / 2 + sh, -p.y, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    it.spec = 0.45; it.shin = 40; it.outline = a < 1 ? 0 : 1.6; it.outMesh = q.mesh.outline; it.alpha = a; it.rimK = 0.5;
    stripGlow(p.x + sh, p.w, -p.y, PLAT_DEPTH, col3(P.plat), 0.7 * a);
    if (p.crumble && p.crack > 0) crackChips(p, sh, (p.crack || 0) / CRUMBLE_T);
  }
  // deep scenery
  if (STAGE3D.scenery) { it = glItem(STAGE3D.scenery); M4.ident(it.m); it.shadow = false; it.spec = 0.12; it.shin = 16; it.rimK = 0.25;
    it.outline = 3; it.outMesh = STAGE3D.scenery.outline; it.inkPx = [0.9, 2.2]; }
  stageAnim3D();
  if (ST.portals) portals3D();
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
