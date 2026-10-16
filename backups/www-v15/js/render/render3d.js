/* NEON BRAWL — The 2.5D frame. With WebGL available, EVERYTHING on screen that belongs to the game world is real 3D:
 *
 *   #gl  (WebGL)   procedural sky, deep scenery, stage blocks + their 3D detailing, fighters, every effect /
 *                  projectile / ability / prop / hazard, weather, KO flights, screen effects — and the live 3D
 *                  portraits that sit inside the HUD panels and the menus' 3D viewports
 *   DOM            the HUD, banners / pop-up text, and every menu (glass panels floating over the WebGL canvas)
 *   #game (2D)     left transparent; only the no-WebGL fallback renderer paints into it
 *
 * Menus render through WebGL too (render/menu3d.js): a living 3D arena behind the main menu, the hovered arena behind
 * stage select, a real-time 3D showcase on the character-select screen and a 3D victory scene. If WebGL is
 * unavailable (or the context is lost) the game falls back to the classic canvas renderer automatically.       */
'use strict';

const RENDER3D = {
  on: false, cleared: false,
  active() {
    if (SET.renderer !== 'webgl' || GL3D.failed || GL3D.lost || G.screen === 'scr-intro') return false;
    return GL3D.ok || glInit();
  },
  show(on) {
    if (on === RENDER3D.on) return;
    RENDER3D.on = on; RENDER3D.cleared = false;
    if (GL3D.canvas) GL3D.canvas.classList.toggle('on', on);
    canvas.classList.toggle('overlay', on);
    wrapEl3D().classList.toggle('gl3d', on);
    RENDER_FLAGS.shield3D = on;
    if (!on && typeof updateFXUI === 'function') updateFXUI(false);
    // the roster / stage-card thumbnails are cached per renderer: switching renderers redraws them
    if (typeof MENU3D !== 'undefined') { MENU3D.tileKey.fill(''); MENU3D.stageKey.fill(''); }
    if (typeof portraitKey !== 'undefined') { portraitKey.fill(''); stageKey.fill(''); }
    // the 2D canvases that become 3D windows must be empty (clear glass the WebGL view shows through)
    if (on) for (const c of document.querySelectorAll('#det-canvas,.plate-port,#res-canvas,.hp-port')) { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); }
  }
};
const wrapEl3D = () => RENDER3D.wrap || (RENDER3D.wrap = document.getElementById('wrap'));

// the sky / light environment for this frame (Sudden Death turns the lights emergency red; Storm Citadel flashes)
function frameEnv(v) {
  let E = STAGE3D.env, sky = STAGE3D.sky; const D = CAM3D.K / v.z;
  E.fogNear = D + 350; E.fogFar = D + 5200;
  if (G.suddenDeath) {
    const p = 0.5 + 0.5 * Math.sin(G.time * 0.22);
    E = Object.assign({}, E, { light: mix3(E.light, [1.2, 0.25, 0.25], 0.35 + 0.3 * p), fog: mix3(E.fog, [0.35, 0.02, 0.05], 0.5), rim: [1, 0.15, 0.2], sky: mix3(E.sky, [0.6, 0.1, 0.12], 0.5) });
    sky = Object.assign({}, sky, { Zen: mix3(sky.Zen, [0.25, 0, 0.02], 0.6), Hor: E.fog, Cl1: mix3(sky.Cl1, [0.8, 0.1, 0.15], 0.5), Cl2: mix3(sky.Cl2, [0.3, 0, 0.05], 0.5) });
  }
  if (ST.id === 'storm') { const fl = stormFlash(); if (fl > 0) sky = Object.assign({}, sky, { flash: [0.5 * fl, 0.55 * fl, 0.7 * fl] }); }
  const uk = ultDarkK();                                                          // an Ultimate's cinematic: the stage goes dark, rim light in the fighter's colour
  if (uk > 0) {
    const uc = col3(fighters[G.ultCine.id].color), mono = G.ultCine.fam === 'timestop';
    E = Object.assign({}, E, { light: mix3(E.light, mono ? [0.55, 0.6, 0.75] : [0.42, 0.4, 0.5], 0.7 * uk), sky: mix3(E.sky, [0.04, 0.03, 0.08], 0.75 * uk), ground: mix3(E.ground, [0.02, 0.01, 0.04], 0.7 * uk),
                               rim: mix3(E.rim || [1, 1, 1], uc, uk), fog: mix3(E.fog, mono ? [0.1, 0.12, 0.2] : [0.02, 0.01, 0.05], 0.7 * uk) });
    const dk = mono ? [0.06, 0.08, 0.16] : mix3(uc, [0, 0, 0], 0.85), sk = {};
    for (const key of ['Zen', 'Hor', 'Gnd', 'Cl1', 'Cl2']) if (sky[key]) sk[key] = mix3(sky[key], dk, 0.8 * uk);
    sky = Object.assign({}, sky, sk);
  }
  return { E, sky };
}

function render3D() {
  RENDER3D.show(true);
  if (!RENDER3D.cleared) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); RENDER3D.cleared = true; }
  if (G.mode === 'menu') { renderMenu3D(); updateFXUI(false); return; }
  const v = FRAME_CAM || viewCam();
  if (STAGE3D.key !== ST.id || !STAGE3D.main) buildStage3D();
  const { E, sky } = frameEnv(v);
  glBeginFrame(v, E);
  collectStage3D();
  stageLights3D();                                                                // the arena's coloured light rig + effect lights (render/stage3d.js)
  for (const f of fighters) { if (f.state === 'dead') continue; collectFighter3D(f, solveRig(f)); }
  collectFX3D();
  collectSocial3D();                                                              // taunt set dressing · holographic emojis · 3D nameplates (render/emotes3d.js)
  collectUlt3D();                                                                 // Ultimates: auras, beams, vortices, spirit beasts… (render/ultfx.js)
  collectChal3D();                                                                // Break the Targets: the floating bullseyes (ui/challenges.js)
  if (typeof collectMinigame3D === 'function') collectMinigame3D();               // v14 Volley Brawl: the glowing net + the ball (game/minigames.js)
  collectKOFX3D();                                                                // Star / Screen KO flights + the cracked glass
  const me = fighters[0];
  const post = { vig: 0.42, flash: G.flash * 0.35, red: G.vig > 0 && SET.flash ? G.vig * 0.55 : 0, emerg: G.suddenDeath ? 1 : 0,
    blind: me && !me.cpu && me.blindT > 0 ? Math.min(1, me.blindT / 60) : 0, storm: ST.id === 'storm' ? stormFlash() * 0.28 : 0,
    invert: G.mode === 'ending' && G.time - G.finishAt < 10 && SET.flash, dim: G.screen === 'scr-result' ? 0.5 : 0 };
  glFlushFX({ sky, weather: weatherFor(ST.id, v), post });                       // bloom · SSAO · comic ink · FXAA (render/postfx.js)
  GL3D.frameN = GL3D.n;
  hudPortraits3D();
  if (G.screen === 'scr-result') victory3D();                                     // the 3D victory scene inside the results card
  updateFXUI(G.screen !== 'scr-result');
}

/* ---------------- 3D viewports inside DOM elements ----------------
 * A DOM element marks the window (a transparent hole in the glass UI); the 3D view is rendered straight into the
 * WebGL canvas behind it — same frame, no read-back, so live portraits cost no more than drawing the model. */
const VPORT = { gr: null, gt: 0 };
function domViewport(el) {
  if (!el || !GL3D.canvas) return null;
  if (!VPORT.gr || VPORT.gt !== G.time) { VPORT.gr = GL3D.canvas.getBoundingClientRect(); VPORT.gt = G.time; }
  const g = VPORT.gr, r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || !g.width) return null;
  if (r.right < g.left || r.left > g.right || r.bottom < g.top || r.top > g.bottom) return null;
  const sx = GL3D.canvas.width / g.width, sy = GL3D.canvas.height / g.height;
  return { vp: [Math.round((r.left - g.left) * sx), Math.round((g.bottom - r.bottom) * sy), Math.round(r.width * sx), Math.round(r.height * sy)], aspect: r.width / r.height };
}
// Studio lighting for portraits and showcases (key light + a coloured rim)
function studioEnv(col) {
  return { light: [1.08, 1.02, 0.96], sky: [0.5, 0.5, 0.62], ground: [0.16, 0.13, 0.22], rim: mix3(col, [1, 1, 1], 0.25), fog: [0.03, 0.03, 0.08], ink: [0.02, 0.02, 0.05, 1], fogNear: 6000, fogFar: 9000 };
}
function studioSky(col, hit) {
  const c = hit ? [0.9, 0.12, 0.18] : col;
  return { Zen: mix3(c, [0.02, 0.02, 0.06], 0.9), Hor: mix3(c, [0.04, 0.04, 0.1], 0.66), Gnd: [0.02, 0.02, 0.05], K: [0, 0, 0, 0], horGlow: 0.5 };
}
// pose a private dummy fighter (its own springs) and queue its model; returns the dummy
function dummyFor(store, key, ch, skin) {
  let d = store[key];
  if (!d || d.ch !== ch) { d = store[key] = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2) }; resetFighter(d, 0); }
  applySkin(d, ch, skin); return d;
}
// live 3D head-and-shoulders portraits inside the HUD panels
const HUDP = {};
function hudPortraits3D() {
  if (!HUD.shown) return;
  fighters.forEach((f, k) => {
    const P = HUD.panels[k]; if (!P) return;
    const w = domViewport(P.portW || (P.portW = P.root.querySelector('.hp-portw'))); if (!w) return;
    const d = dummyFor(HUDP, k, f.ch, f.skin), hit = f.hurt > 0 || f.state === 'hitstun' || f.state === 'stunned';
    poseDummy(d, hit ? 5 * 90 + 10 : f.state === 'attack' ? 2 * 90 + 6 : G.time % 90);
    if (hit) { d.rot = Math.sin(G.time * 0.6) * 0.25; d.hitFlash = f.hitFlash; } else d.rot = 0;
    d.facing = k === 0 ? 1 : -1; d.percent = f.percent;
    const col = col3(f.color);
    glViewCamera([d.facing * 18, 58, 124], [0, 47, 0], 0.62, w.aspect, studioEnv(col), 10, 2000, true);
    collectFighter3D(d, solveRig(d));
    glFlush({ vp: w.vp, shadow: false, sky: studioSky(col, hit) });
  });
}
