/* NEON BRAWL — Main loop and startup. Loaded last. */
'use strict';

/* ============================== MAIN LOOP =========================== */
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  let n = 0;
  while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  render(); updateTouch(); audioTick(); updateHUD();
  if (G.mode === 'menu' || G.mode === 'over') drawPreviews();
  requestAnimationFrame(loop);
}

window.__brawl = { G, SEL, drawMenuBackdrop, drawBackground, SET, fighters, projs, CHARS, STAGES, DIFFS, step, render, startMatch, go, setPaused, aiInput, emptyInput, readHuman, keys, pressed, mouse, TOUCH, updateTouch, drawPreviews, uiKey,
                  ko, HZ, spawnHazard, drawVictory, showResult, VICTORY_STYLES, VFX, MOTION, VICTORY_ANIM, DEFEAT_ANIM, computePose, RIG_POSES, MOVES, sizeCanvas, skinOf, VIC, currentStage: () => ST,
                  VIEW, GL3D, RENDER3D, AUDIO, ACC3D, gameEvent, introStart };

loadSettings(); loadSkins(); sizeCanvas(); buildSettings(); applyRoster();      // applyRoster also refreshes the select / stage / setup screens
leaveMatch(); showScreen('scr-intro');
requestAnimationFrame(loop);
