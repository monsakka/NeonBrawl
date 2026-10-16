/* NEON BRAWL — Main loop and startup. Loaded last. */
'use strict';

/* ============================== MAIN LOOP =========================== */
let last = performance.now(), acc = 0;
function loop(now) {
  const dt = Math.min(100, now - last); last = now;
  const fin = typeof finisherState === 'function' ? finisherState(now)[0] : 1;             // v16: the cinematic FINAL BLOW slow-mo (render/finisher16.js)
  if (G.slowmo > 0) { G.slowmo -= dt / STEP; acc += dt * 0.3 * fin; } else acc += dt * fin;   // slow-motion (the decisive Sudden Death blow)
  pollGamepad();                                                                           // gamepads press the same virtual keys (game/gamepad.js)
  if (NET.active) netLoopSteps();                                      // online: lockstep (game/netplay.js)
  else {
    let n = 0;
    while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  }
  render(); updateTouch(); audioTick(); updateHUD(); updateTrainPanel(); if (typeof netTick === 'function') netTick();
  glAdaptRes(dt);                                                                          // v14: adaptive resolution keeps chaotic scenes at 60 fps (render/gl3d.js)
  if (G.mode === 'menu' || G.mode === 'over') drawPreviews();
  requestAnimationFrame(loop);
}

window.__brawl = { G, SEL, drawMenuBackdrop, drawBackground, SET, fighters, projs, CHARS, STAGES, DIFFS, step, render, startMatch, go, setPaused, aiInput, emptyInput, readHuman, keys, pressed, mouse, TOUCH, updateTouch, drawPreviews, uiKey,
                  ko, HZ, spawnHazard, drawVictory, showResult, VICTORY_STYLES, VFX, MOTION, VICTORY_ANIM, DEFEAT_ANIM, computePose, RIG_POSES, MOVES, sizeCanvas, skinOf, VIC, currentStage: () => ST,
                  VIEW, GL3D, RENDER3D, AUDIO, ACC3D, gameEvent, introStart };

loadSettings(); loadSkins(); sizeCanvas(); buildSettings(); applyRoster();      // applyRoster also refreshes the select / stage / setup screens
leaveMatch(); showScreen('scr-intro');
requestAnimationFrame(loop);
