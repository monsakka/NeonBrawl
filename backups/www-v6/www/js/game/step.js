/* NEON BRAWL — One fixed 60 Hz simulation step. */
'use strict';

/* ============================== MAIN STEP =========================== */
const READY_T = 110;          // frames of "READY..." before "GO!"

// Echo's soundwave scrambles controls: left/right swap, and a confused CPU fumbles its inputs
// (Fairness: a confused fighter that's off-stage keeps its real controls, so confusion can't force a self-destruct.)
function confuseInput(i, f) {
  if (isOffStage(f)) return i;
  [i.left, i.right] = [i.right, i.left]; [i.tapL, i.tapR] = [i.tapR, i.tapL]; i.dash = -i.dash;
  if (f.cpu) {
    if (Math.random() < 0.25) { i.lightP = false; i.heavyP = false; i.specialP = false; }
    if (Math.random() < 0.02) i.jumpP = true;
  }
  return i;
}

// Where each fighter's input comes from this step: the online opponent, the Training dummy, the CPU, or this device's player
function fighterInput(f) {
  if (NET.active) return netInput(f);                                                       // online match (game/netplay.js)
  if (f.cpu) return G.training && TRAIN.ai !== 'cpu' ? trainingInput(f, otherOf(f)) : aiInput(f, otherOf(f));
  return readHuman(f);
}

function step() {
  // remember where things were at the start of this step (render() interpolates between steps)
  for (const f of fighters) { f.px = f.x; f.py = f.y; }
  G.pcam = { x: G.cam.x, y: G.cam.y, z: G.cam.z };

  G.time++;
  G.shake *= 0.86; if (G.shake < 0.1) G.shake = 0;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - 0.06);
  if (G.vig > 0) G.vig = Math.max(0, G.vig - 0.025);
  if (G.combo && --G.combo.t <= 0) G.combo = null;

  if (G.mode === 'menu' || G.mode === 'over') { updateFx(); if (G.mode === 'over') updateCamera(); pressed.clear(); return; }
  if (G.paused) return;
  if (G.hitstop > 0) { if (SET.hitstop) { G.hitstop--; updateFx(); updateCamera(); return; } G.hitstop = 0; }       // hit-stop: input events stay queued

  G.frame++;
  if (G.mode === 'count') {
    G.countT++;
    if (G.countT >= READY_T) { G.mode = 'play'; G.goT = 50; }
  } else {
    if (G.goT > 0) G.goT--;
    HITBOX_LOG.length = 0;
    const inps = fighters.map(f => { const i = fighterInput(f); return f.confuse > 0 ? confuseInput(i, f) : i; });
    const order = (G.frame & 1) ? [1, 0] : [0, 1];
    for (const i of order) updateFighter(fighters[i], fighters[1 - i], inps[i]);
    updateProjs(); updateGadgets(); updateHazards(); updatePlatforms();
    if (G.mode === 'play' && G.timeLeft > 0 && --G.timeLeft === 0) timeUp();                  // time limit
    if (G.mode === 'ending' && --G.endT <= 0) { if (G.sdNext) startSuddenDeath(); else { G.mode = 'over'; showResult(); } }
  }
  updateFx(); updateCamera();
  pressed.clear();
}
