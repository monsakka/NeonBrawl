/* NEON BRAWL — 3D stages for the WebGL renderer.
 *   • the main stage and every floating platform are bevelled 3D prisms (real depth along Z);
 *   • each stage's hand-painted art (render/stage.js) is painted into a texture and laid on the prisms' front faces as a
 *     lit decal, so all 35 arenas keep their identity (kerbs, tatami, lanterns, vines, cracks as ledges crumble…);
 *   • neon light strips run round each platform top; real shadows from the key light fall across them;
 *   • deep-Z scenery (towers, peaks, islands, planets, crystals…) is generated per stage theme, merged into a few
 *     static meshes and placed hundreds to thousands of units behind the arena, fading into distance fog;
 *   • the stage's painted background (render/backgrounds.js) becomes the far backdrop plate.               */
'use strict';

const STAGE3D = { key: null, main: null, plats: [], props: [], artCv: null, artCtx: null, artTex: null, artRect: null, bgCv: null, bgCtx: null, env: null, f: 0 };
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
    light: bright ? [1.05, 1.0, 0.94] : mix3([1, 1, 1], top, 0.3).map(v => v * 0.92),
    sky: mix3(glow, [1, 1, 1], bright ? 0.65 : 0.4).map(v => v * (bright ? 0.62 : 0.46)),
    ground: mix3(f1, glow, 0.3).map(v => v * 0.42 + 0.04),
    rim: mix3(glow, edge, 0.4).map(v => v * 0.85),
    fog: mix3(f1, glow, bright ? 0.15 : 0.22).map(v => Math.min(1, v * (bright ? 1.15 : 0.62))),
    ink: [0.02, 0.02, 0.05, 1], glow, edge, bright
  };
  if (st.id === 'peak' || st.id === 'aurora') E.fog = [0.62, 0.72, 0.84];
  if (st.id === 'sanctuary' || st.id === 'haven' || st.id === 'shrine') E.fog = mix3(E.fog, [0.95, 0.85, 0.8], 0.4);
  return E;
}

/* ---- scenery generators: lists of { g, m, mat } (mat 0 = body, 1 = accent, 2 = emissive) ---- */
let PROTO = null;
function protos() {
  if (!PROTO) PROTO = { box: GEO.box(), cyl: GEO.cylinder(12, true), cone: GEO.cylinder(10, true, 0.001), pyr: GEO.cylinder(4, true, 0.001),
                        sph: GEO.sphere(12, 8), octa: GEO.octa(), torus: GEO.torus(24, 6, 0.08), disc: GEO.cylinder(16, true) };
  return PROTO;
}
// translate · Ry · Rz · Rx · scale (scales must stay positive: a negative scale would flip the triangle winding)
function trs(x, y, z, sx, sy, sz, ry, rz, rx) {
  const rot = (a, i, j) => { const m = M4.ident(); const c = Math.cos(a || 0), s = Math.sin(a || 0); m[i * 4 + i] = c; m[j * 4 + j] = c; m[i * 4 + j] = s; m[j * 4 + i] = -s; return m; };
  const Ry = rot(-(ry || 0), 0, 2), Rz = rot(rz, 0, 1), Rx = rot(rx, 1, 2), S = M4.ident(); S[0] = sx; S[5] = sy; S[10] = sz;
  const m = M4.mul(M4.ident(), Ry, M4.mul(M4.ident(), Rz, M4.mul(M4.ident(), Rx, S)));
  m[12] = x; m[13] = y; m[14] = z; return m;
}
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
      for (let i = 0; i < 4; i++) { const s = r(160, 480), x = r(-1800, 3200), y = top + r(700, 1800), z = deep(-2600, -4600);
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
      for (let i = 0; i < 26; i++) { const s = r(140, 520); put('torus', r(X0, X1), top + r(-500, 900), deep(-400, -2800), s, s * 1.6, s, 1, r(-0.5, 0.5), 0, Math.PI / 2); }   // gears facing the camera
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

/* ---- build everything for the current stage (once per stage) ---- */
function buildStage3D() {
  const st = ST, S = STAGE, P = st.pal;
  for (const m of [STAGE3D.main, ...STAGE3D.plats.map(p => p.mesh), ...STAGE3D.props.map(p => p.mesh)]) glFreeMesh(m);
  STAGE3D.key = st.id; STAGE3D.env = stageEnv(st);
  const g = GEO.prism(S.w, S.h, MAIN_DEPTH, 12); STAGE3D.main = glMesh(g.pos, g.nor, g.idx);
  STAGE3D.plats = PLATS.map(p => { const h = Math.max(16, p.h + 8), gp = GEO.prism(p.w, h, PLAT_DEPTH, 5); return { p, h, mesh: glMesh(gp.pos, gp.nor, gp.idx) }; });
  // scenery → one merged mesh per material
  const sc = genScenery(st), E = STAGE3D.env, f1 = col3(P.fill[1]), f0 = col3(P.fill[0]);
  const matCol = [mix3(f1, E.fog, 0.25).map(v => v * 0.85 + 0.03), mix3(mix3(f0, col3(P.edge), 0.35), E.fog, 0.15), mix3(E.glow, [1, 1, 1], 0.25)];
  STAGE3D.props = [0, 1, 2].map(mi => { const list = sc.filter(o => o.mat === mi).map(o => ({ g: o.g, m: o.m })); if (!list.length) return null;
    const mg = geoMerge(list); return { mat: mi, col: matCol[mi], mesh: glMesh(mg.pos, mg.nor, mg.idx) }; }).filter(Boolean);
  // stage-art texture covering the stage + platforms (+ room for things that hang below them)
  let x0 = S.x, x1 = S.x + S.w, y0 = S.y; for (const p of PLATS) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); y0 = Math.min(y0, p.y); }
  x0 -= 60; x1 += 60; y0 -= 80; const y1 = S.y + S.h + 200;
  const k = Math.min(GL3D.mobile ? 1 : 1.25, 2048 / (x1 - x0));
  if (!STAGE3D.artCv) { STAGE3D.artCv = document.createElement('canvas'); STAGE3D.artCtx = STAGE3D.artCv.getContext('2d'); STAGE3D.artTex = glTex(1, 1, new Uint8Array(4), GL3D.gl.LINEAR); }
  STAGE3D.artCv.width = Math.ceil((x1 - x0) * k); STAGE3D.artCv.height = Math.ceil((y1 - y0) * k);
  STAGE3D.artRect = new Float32Array([x0, y0, x1 - x0, y1 - y0]); STAGE3D.artK = k; STAGE3D.artOX = x0; STAGE3D.artOY = y0;
  if (!STAGE3D.bgCv) { STAGE3D.bgCv = document.createElement('canvas'); STAGE3D.bgCtx = STAGE3D.bgCv.getContext('2d'); }
  const bk = GL3D.mobile ? 0.6 : 0.85; STAGE3D.bgCv.width = Math.round(W * bk); STAGE3D.bgCv.height = Math.round(H * bk); STAGE3D.bgK = bk;
  STAGE3D.f = 0; paintStageArt(); paintBackdrop(G.cam);
}
function paintStageArt() {
  const c2 = STAGE3D.artCtx, k = STAGE3D.artK, prev = ctx;
  c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, STAGE3D.artCv.width, STAGE3D.artCv.height);
  c2.setTransform(k, 0, 0, k, -STAGE3D.artOX * k, -STAGE3D.artOY * k); c2.globalAlpha = 1; c2.shadowBlur = 0; c2.setLineDash([]); c2.globalCompositeOperation = 'source-over';
  ctx = c2; RENDER_FLAGS.stageTex = true;
  try { drawStageBody(); } finally { RENDER_FLAGS.stageTex = false; ctx = prev; }
  glUpload(STAGE3D.artTex, STAGE3D.artCv);
}
function paintBackdrop(cam) {
  const c2 = STAGE3D.bgCtx, k = STAGE3D.bgK, prev = ctx, saved = G.cam;
  c2.setTransform(k, 0, 0, k, 0, 0); c2.globalAlpha = 1; c2.shadowBlur = 0; c2.setLineDash([]); c2.globalCompositeOperation = 'source-over';
  ctx = c2; G.cam = cam;
  try { drawBackground(); drawAtmosphereBack(); } finally { ctx = prev; G.cam = saved; }
  glUpload(GL3D.bgTex, STAGE3D.bgCv); GL3D.bgW = STAGE3D.bgCv.width; GL3D.bgH = STAGE3D.bgCv.height;
}

/* ---- per frame: refresh animated art, queue the stage's draw items ---- */
function collectStage3D(v) {
  if (STAGE3D.key !== ST.id || !STAGE3D.main) buildStage3D();
  const S = STAGE, P = ST.pal, E = STAGE3D.env, f = ++STAGE3D.f;
  if (f % (GL3D.mobile ? 6 : 4) === 0) paintStageArt();                              // animated stage details (lights, cracks, dashes…)
  if (f % (GL3D.mobile ? 3 : 2) === 1) paintBackdrop(v);                             // animated painted sky
  const topCol = mix3(col3(P.fill[0]), col3(P.top), 0.12), platCol = mix3(col3(P.fill[0]), col3(P.plat), 0.35);
  // main stage block
  let it = glItem(STAGE3D.main); M4.basis(it.m, S.x + S.w / 2, -S.y, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  it.col = topCol; it.spec = 0.25; it.shin = 30; it.toon = 0; it.outline = 2.2; it.rimK = 0.35; it.metal = ST.clean ? 0.3 : 0;
  // its painted front face (lit decal: cracks / kerbs / patterns + anything hanging below)
  const ar = STAGE3D.artRect;
  it = glItem(GL3D.mesh.quad); { const qx0 = S.x - 50, qx1 = S.x + S.w + 50, qy0 = S.y - 46, qy1 = S.y + S.h + 190;
    M4.basis(it.m, (qx0 + qx1) / 2, -(qy0 + qy1) / 2, MAIN_DEPTH / 2 + 0.6, [qx1 - qx0, 0, 0], [0, qy1 - qy0, 0], [0, 0, 1]); }
  it.tex = STAGE3D.artTex; it.texRect = ar; it.decal = true; it.cull = false; it.toon = 0; it.spec = 0.1; it.shadow = false; it.rimK = 0;
  // neon light strips round the top
  stripGlow(S.x, S.w, -S.y, MAIN_DEPTH, E.edge, 0.9);
  // floating platforms
  for (const q of STAGE3D.plats) {
    const p = q.p; if (!platUp(p)) continue;
    let a = 1, sh = 0; if (p.phase !== undefined && p.warn) a = (G.time >> 2) & 1 ? 0.35 : 0.9;
    if (p.crumble) { const c = (p.crack || 0) / CRUMBLE_T; if (c > 0.3) sh = Math.sin(G.time * 1.7) * c * 2.5; }
    it = glItem(q.mesh); M4.basis(it.m, p.x + p.w / 2 + sh, -p.y, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    it.col = p.launch ? [0.18, 0.2, 0.25] : platCol; it.spec = 0.4; it.shin = 40; it.toon = 0; it.outline = a < 1 ? 0 : 1.6; it.alpha = a; it.rimK = 0.5;
    it = glItem(GL3D.mesh.quad); { const qx0 = p.x - 40, qx1 = p.x + p.w + 40, qy0 = p.y - 46, qy1 = p.y + p.h + 80;
      M4.basis(it.m, (qx0 + qx1) / 2 + sh, -(qy0 + qy1) / 2, PLAT_DEPTH / 2 + 0.6, [qx1 - qx0, 0, 0], [0, qy1 - qy0, 0], [0, 0, 1]); }
    it.tex = STAGE3D.artTex; it.texRect = ar; it.decal = true; it.cull = false; it.toon = 0; it.spec = 0.1; it.shadow = false; it.rimK = 0; it.alpha = a;
    stripGlow(p.x + sh, p.w, -p.y, PLAT_DEPTH, col3(P.plat), 0.7 * a);
  }
  // deep scenery
  for (const pr of STAGE3D.props) { it = glItem(pr.mesh); M4.ident(it.m); it.col = pr.col; it.shadow = false; it.toon = 0; it.spec = pr.mat === 1 ? 0.25 : 0.08; it.shin = 16;
    it.emis = pr.mat === 2 ? 1.3 : 0; it.rimK = pr.mat === 2 ? 0 : 0.25; }
}
// Glowing neon strips along a block's top perimeter (additive)
function stripGlow(x, w, yTop, d, col, k) {
  if (k <= 0.02) return;
  const y = yTop + 1, t = 2.4;
  for (const [cx, cz, sx, sz] of [[x + w / 2, d / 2 - 1, w - 8, t], [x + w / 2, -d / 2 + 1, w - 8, t], [x + 2, 0, t, d - 6], [x + w - 2, 0, t, d - 6]]) {
    const it = glItem(GL3D.mesh.box); M4.basis(it.m, cx, y, cz, [sx, 0, 0], [0, t, 0], [0, 0, sz]); it.col = col; it.glow = k; it.glowPow = 0.2; it.shadow = false;
  }
}
