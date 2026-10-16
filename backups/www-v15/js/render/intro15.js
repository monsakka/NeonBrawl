/* NEON BRAWL — v15 intro cinematic (no video: everything is rendered live, behind the HTML title + credit).
 *
 * On top of the GPU particle warp-field (gl3d.js glIntro) the splash now stages a real-time 3D cold open: a mirror-black
 * stage with neon rings rises out of the dark, then the cast drops in one by one from above — DINO NUGGI in his F1 car,
 * STRIKER, AEGIS, MOCHI and PANDAMONIUM — each landing with an exaggerated squash-and-stretch spring, a shockwave ring and
 * a burst of light, before settling into their idles while the camera slowly orbits and the stage lights sweep.      */
'use strict';

const INTRO15 = { store: {}, t0: null, cast: [['velocity', 0], ['aegis', 0], ['dino', 'F1'], ['pug', 0], ['panda', 0]] };
function intro15(t) {
  if (typeof collectFighter3D !== 'function' || !GL3D.ok) return;
  if (INTRO15.t0 === null) INTRO15.t0 = t;
  const T = t - INTRO15.t0, n = INTRO15.cast.length, rise = smooth(T / 50), orbit = Math.sin(T * 0.0045) * 0.32;
  const neon = [0.55, 0.3, 1], E = studioEnv(neon); E.fog = [0.012, 0.012, 0.05]; E.rim = [0.4, 0.9, 1];
  glViewCamera([Math.sin(orbit) * 700, 120, Math.cos(orbit) * 700], [0, 175, 0], 0.62, VIEW.LW / VIEW.LH, E, 10, 6000);
  // the stage: a mirror-black disc rising from below, with two neon rings and sweeping light beams
  const W0 = -40 * (1 - rise), floor = glItem(GL3D.mesh.cylCap); xf(floor.m, 0, W0 - 10, 0, 560, 10, 190);   // (W0: the stage top, world y-up)
  Object.assign(floor, { col: [0.03, 0.03, 0.08], spec: 1.6, shin: 140, metal: 0.8, outline: 1.2, shadow: false, rimK: 0.6 });
  for (const [r, c, k] of [[575, [0.3, 0.9, 1], 1.2], [470, [1, 0.3, 0.9], 0.8]]) BAT.glow.add(BAT.T.ring, xf(SM, 0, W0 + 0.5, 0, r, 3, r * 0.34), c[0], c[1], c[2], k * rise);
  for (let i = 0; i < 4; i++) { const a = T * 0.012 + i * TAU / 4, x = Math.cos(a) * 420;
    sG('tube', x, -W0 - 4, -200, x * 0.4, -700, -600, 26, i % 2 ? [0.3, 0.9, 1] : [1, 0.3, 0.9], 0.18 * rise); }   // stage-light beams
  // the cast drops in
  INTRO15.cast.forEach(([id, sk], i) => {
    const ch = CHARS.find(c => c.id === id); if (!ch) return;
    const skin = sk === 'F1' ? (typeof F1_SKIN === 'number' ? F1_SKIN : 0) : sk, land = 70 + i * 22, tt = T - land;
    if (tt < -45) return;
    const d = dummyFor(INTRO15.store, id, ch, skin), x = (i - (n - 1) / 2) * 150;
    if (tt < 0) { poseDummy(d, 3 * 90 + 20); d.y = -W0 - 0.3 * tt * tt; d.sx = 0.86; d.sy = 1.18; }                              // falling: stretched along the drop
    else {
      poseDummy(d, 30); d.y = -W0;                                                                  // (the idle frame; the v15 idle layer animates from G.time)
      const k = Math.exp(-tt / 11) * Math.cos(tt * 0.42); d.sx = 1 + 0.36 * k; d.sy = 1 - 0.36 * k;                              // the landing spring: squash → stretch → settle
      if (tt < 30) { const u = tt / 30; BAT.glow.add(BAT.T.ring, xf(SM, x, W0 + 1, 0, 20 + u * 160, 3, (20 + u * 160) * 0.4), 1, 1, 1, 1.4 * (1 - u));   // shockwave
        if (tt < 10) bG('sph', x, -W0 - 30, 0, 50 * (1 - tt / 10) + 10, 50 * (1 - tt / 10) + 10, 40, col3(ch.color), 1.2 * (1 - tt / 10)); }
    }
    d.facing = x < 0 ? 1 : x > 0 ? -1 : 1; d.x = x; d.px = x; d.py = d.y; d.percent = 0;
    collectFighter3D(d, solveRig(d));
  });
  glFlush({ keep: true, shadow: false });
}
