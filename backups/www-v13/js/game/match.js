/* NEON BRAWL — Match start / leave / pause. */
'use strict';

/* ============================= MATCH FLOW =========================== */
function startMatch() {
  loadStage(SEL.randStage ? pickFrom(playableStages()) : SEL.stage);                         // "Random map" re-rolls every match (from the visible stages)
  const ci = SEL.cpu === null ? pickFrom(playablePool()) : SEL.cpu;                      // random CPU: from the visible roster
  const s1 = skinIdx(CHARS[SEL.p1]); let s2 = skinIdx(CHARS[ci]);
  if (ci === SEL.p1 && s2 === s1) s2 = s1 === 0 ? 1 : 0;                   // mirror match: the CPU never wears the same skin
  setChar(fighters[0], CHARS[SEL.p1], s1);
  setChar(fighters[1], CHARS[ci], s2);
  G.diff = SEL.diff;
  fighters[0].bossScale = 0; fighters[1].bossScale = SEL.boss ? 3 : 0;                  // (the Arcade's Giant Boss: 300 %, kept through Sudden Death resets)
  resetFighter(fighters[0], ST.spawns[0]); resetFighter(fighters[1], ST.spawns[1]);
  fighters[0].facing = 1; fighters[1].facing = -1;
  fighters[0].cpu = false; fighters[1].cpu = true;
  fighters[0].emotes = tauntSlots().slice(); fighters[1].emotes = null;    // your two taunt slots (Settings → Profile); the CPU uses its signature emote
  fx.length = 0; projs.length = 0; G.echoes.length = 0; if (typeof clearKOFX === 'function') clearKOFX();
  G.mode = 'count'; G.countT = 0; G.goT = 0; G.endT = 0; G.winner = null; G.combo = null; G.finishAt = -999; G.matchStart = G.time;
  resetHazards();
  G.frame = 0; G.hitstop = 0; G.shake = 0; G.flash = 0; G.vig = 0; G.paused = false;
  G.suddenDeath = false; G.sdNext = false; G.timeUp = false; G.slowmo = 0; G.ultCine = null; G.ultFreeze = 0; G.endText = null; G.camExtra = null;
  G.timeLeft = G.training ? 0 : (SEL.time || 0) * 60;                                       // time limit (frames; 0 = none)
  pressed.clear();
  G.cam.x = 640; G.cam.y = 330; G.cam.z = 1;
  showScreen(null);
  canvas.focus();
}

function leaveMatch() {
  G.mode = 'menu'; G.paused = false; fx.length = 0; projs.length = 0; G.echoes.length = 0; pressed.clear(); if (typeof clearKOFX === 'function') clearKOFX();
  G.hitstop = 0; G.shake = 0; G.flash = 0; G.vig = 0;
  G.suddenDeath = false; G.sdNext = false; G.timeUp = false; G.slowmo = 0; G.timeLeft = 0; G.training = false; G.ultCine = null; G.ultFreeze = 0;
  G.cam = { x: 640, y: 330, z: 1 }; G.combo = null;
  resetHazards();
  loadStage(SEL.stage);
}

function setPaused(p) {
  if (G.mode !== 'play' && G.mode !== 'count' && G.mode !== 'ending') return;
  if (NET.active) { showScreen(p ? 'scr-pause' : null); if (!p) canvas.focus(); return; }   // online: the menu opens, the match keeps running
  G.paused = p;
  if (p) { const a = fighters[0], b = fighters[1];                                // match snapshot on the pause card
    document.getElementById('pause-info').textContent = `${a.ch.name} ${Math.floor(a.percent)}% ×${a.stocks}  vs  ${b.ch.name} ${Math.floor(b.percent)}% ×${b.stocks} · ${ST.name}`; }
  showScreen(p ? 'scr-pause' : null);
  if (!p) canvas.focus();
}
