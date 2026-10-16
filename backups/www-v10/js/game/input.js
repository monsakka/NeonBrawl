/* NEON BRAWL — Keyboard + mouse input and menu keyboard navigation. */
'use strict';

/* ============================== INPUT =============================== */
function emptyInput() {
  return { left: false, right: false, down: false, shield: false, jump: false, heavy: false,   // jump = Space held (hover / jetpack) · heavy = held (smash charge)
           jumpP: false, lightP: false, heavyP: false, specialP: false,
           tapL: false, tapR: false, ultP: false, dash: 0, aimX: 0, aimY: 0 };
}

function screenToWorld(sx, sy) { const c = G.cam; return { x: (sx - W / 2) / c.z + c.x, y: (sy - H / 2) / c.z + c.y }; }

/* Player 1 aim vector, relative to the fighter's chest in world units.
   Mouse: the cursor position. Touch: the stick direction (stick near the centre = neutral). */
function humanAim(f) {
  if (TOUCH.using) return Math.hypot(TOUCH.sx, TOUCH.sy) < 0.4 ? [0, 0] : [TOUCH.sx * 110, TOUCH.sy * 110];
  const w = screenToWorld(mouse.cx, mouse.cy);
  return [w.x - f.x, w.y - (f.y - 32)];
}

/* Player 1 input. Touch controls press the same virtual keys (see touch.js). */
function readHuman(f) {
  const i = emptyInput();
  i.left = keys.has('KeyA'); i.right = keys.has('KeyD'); i.down = keys.has('KeyS'); i.shield = keys.has('KeyE'); i.jump = keys.has('Space'); i.heavy = keys.has('M2');
  i.jumpP = pressed.has('Space'); i.lightP = pressed.has('M0'); i.heavyP = pressed.has('M2'); i.specialP = pressed.has('KeyQ');
  i.tapL = pressed.has('KeyA'); i.tapR = pressed.has('KeyD'); i.ultP = pressed.has('KeyR') || pressed.has('M1');   // Ultimate: R or the middle mouse button
  [i.aimX, i.aimY] = humanAim(f);
  return i;
}

const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab']);

window.addEventListener('keydown', e => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); pressed.add(e.code);
  if (uiKey(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); if (G.mode === 'play' || G.mode === 'count') setPaused(true); });

function setMouse(e) {                                       // → safe-area logical coordinates (the view can extend past 0..W / 0..H)
  const r = canvas.getBoundingClientRect();
  mouse.cx = (e.clientX - r.left) / r.width * VIEW.LW - VIEW.OX; mouse.cy = (e.clientY - r.top) / r.height * VIEW.LH - VIEW.OY;
}
document.getElementById('wrap').addEventListener('contextmenu', e => e.preventDefault());   // right-click = smash attack
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', setMouse);
document.getElementById('wrap').addEventListener('mousemove', setMouse);      // keeps the menu backdrop interactive
canvas.addEventListener('mousedown', e => {
  e.preventDefault(); canvas.focus(); setMouse(e);
  if (G.paused || G.mode === 'menu' || G.mode === 'over') return;
  pressed.add('M' + e.button); keys.add('M' + e.button);
});
window.addEventListener('mouseup', e => keys.delete('M' + e.button));

const NEXT_SCREEN = { 'scr-main': 'scr-select', 'scr-select': 'scr-stage', 'scr-stage': 'scr-setup' };
const BACK_SCREEN = { 'scr-challenge': 'scr-main', 'scr-ladder': 'scr-main', 'scr-select': 'scr-main', 'scr-stage': 'scr-select', 'scr-setup': 'scr-stage', 'scr-how': 'scr-main', 'scr-settings': 'scr-main' };

// Keyboard shortcuts for the menus / pause / results. Returns true when the key was consumed.
function uiKey(c) {
  if (G.mode === 'menu') {
    const sc = G.screen;
    if (sc === 'scr-intro') { if (c === 'Enter' || c === 'Space' || c === 'Escape') { introStart(); return true; } return false; }
    if (c === 'Enter') {
      if (sc === 'scr-select' && SEL.trainingMode) startTraining();
      else if (sc === 'scr-select' && SEL.challenge) chalGo();
      else if (sc === 'scr-ladder') { const b = document.querySelector('#lad-menu .btn.primary'); if (b) b.click(); }
      else if (sc === 'scr-setup') startMatch(); else if (NEXT_SCREEN[sc]) go(NEXT_SCREEN[sc]); else if (BACK_SCREEN[sc]) go(BACK_SCREEN[sc]);
      return true;
    }
    if (c === 'Escape' && BACK_SCREEN[sc]) { go(BACK_SCREEN[sc]); return true; }
    const d = (c === 'ArrowRight' || c === 'ArrowDown') ? 1 : (c === 'ArrowLeft' || c === 'ArrowUp') ? -1 : 0;
    if (d) { cycleSel(sc, d); return true; }
    return false;
  }
  if (G.mode === 'over') {
    if (c === 'Enter' && CHAL.mode) { const b = document.querySelector('#lad-menu .btn.primary'); if (b) b.click(); return true; }   // (challenge results: the highlighted choice)
    if (c === 'Enter') { startMatch(); return true; }
    if (c === 'Escape' || c === 'KeyM') { go('scr-main'); return true; }
    return false;
  }
  if (c === 'Escape' || c === 'KeyP') { setPaused(!G.paused); return true; }
  if (G.paused && c === 'KeyR') { chalRestart(); return true; }                   // (restarts a normal match, Training, an Arcade rung or a target course)
  if (G.paused && c === 'KeyM') { go('scr-main'); return true; }
  return false;
}
