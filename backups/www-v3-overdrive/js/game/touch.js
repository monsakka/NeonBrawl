/* NEON BRAWL — On-screen touch controls for phones and tablets.
 *   Left thumb:  a floating stick, placed wherever you touch. It moves (flick twice = dash), fast-falls / drops (down)
 *                and aims attacks and specials, like the mouse does on PC. Stick near the centre = neutral attack.
 *   Right thumb: Attack · Smash (hold to charge) · Special · Jump (hold to hover / fly) · Shield (tap = parry).
 * The controls press the same virtual keys as the keyboard and mouse, so the game logic can't tell them apart. */
'use strict';

const STICK_R = 64;                 // stick travel in logical pixels
const TOUCH_BTNS = [                // code = the key / mouse button it stands for; hold = stays down while touched
  { id: 'light',   label: 'Attack',  code: 'M0',    hold: false },
  { id: 'heavy',   label: 'Smash',   code: 'M2',    hold: true },        // hold to charge
  { id: 'special', label: 'Special', code: 'KeyQ',  hold: false },
  { id: 'jump',    label: 'Jump',    code: 'Space', hold: true },
  { id: 'shield',  label: 'Shield',  code: 'KeyE',  hold: true }
];

const touchEl = document.getElementById('touch');
touchEl.innerHTML =
  `<div class="t-zone" id="t-zone"><div class="t-base" id="t-base"><div class="t-knob" id="t-knob"></div></div></div>` +
  TOUCH_BTNS.map(b => `<button class="t-btn t-${b.id}" data-tb="${b.id}">${b.label}</button>`).join('') +
  `<button class="t-pause" id="t-pause" aria-label="Pause">II</button>`;
const tBase = document.getElementById('t-base'), tKnob = document.getElementById('t-knob');
const touchHeld = new Set();        // virtual keys currently held down by touch
let stickId = null, touchShown = false;

const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
function touchEnabled() { return SET.touch === 'on' || (SET.touch !== 'off' && (TOUCH.seen || coarsePointer.matches)); }

function setVKey(code, on) {
  if (on && !touchHeld.has(code)) { touchHeld.add(code); keys.add(code); pressed.add(code); }
  else if (!on && touchHeld.has(code)) { touchHeld.delete(code); keys.delete(code); }
}
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event (tests) */ } }
function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not supported */ } }

// Logical (1280 × 720) coordinates of a pointer event
function touchPos(e) { const r = touchEl.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }

/* ---- stick ---- */
function setStick(x, y) {
  TOUCH.sx = x; TOUCH.sy = y;
  setVKey('KeyA', x < -0.35); setVKey('KeyD', x > 0.35);
  setVKey('KeyS', y > 0.6 && y > Math.abs(x));
  tKnob.style.transform = `translate(calc(${x * STICK_R} * var(--u)), calc(${y * STICK_R} * var(--u)))`;
}
function placeBase(x, y) { tBase.style.left = `calc(${x} * var(--u))`; tBase.style.top = `calc(${y} * var(--u))`; }
function resetStick() { stickId = null; setStick(0, 0); tBase.classList.remove('on'); placeBase(108, 470); }

const zone = document.getElementById('t-zone');
zone.addEventListener('pointerdown', e => {
  e.preventDefault(); if (stickId !== null) return;
  stickId = e.pointerId; capture(zone, e);
  const [x, y] = touchPos(e);
  tBase.dataset.ox = x; tBase.dataset.oy = y; placeBase(x, y); tBase.classList.add('on');
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId) return;
  const [x, y] = touchPos(e);
  let dx = (x - tBase.dataset.ox) / STICK_R, dy = (y - tBase.dataset.oy) / STICK_R;
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  setStick(dx, dy);
});
const stickUp = e => { if (e.pointerId === stickId) resetStick(); };
zone.addEventListener('pointerup', stickUp); zone.addEventListener('pointercancel', stickUp);

/* ---- buttons ---- */
touchEl.querySelectorAll('.t-btn').forEach(el => {
  const b = TOUCH_BTNS.find(x => x.id === el.dataset.tb);
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); capture(el, e); el.classList.add('on'); if (e.isTrusted) buzz();
    if (b.hold) setVKey(b.code, true); else pressed.add(b.code);
  });
  const up = () => { el.classList.remove('on'); if (b.hold) setVKey(b.code, false); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
document.getElementById('t-pause').addEventListener('pointerdown', e => { e.preventDefault(); setPaused(true); });
touchEl.addEventListener('contextmenu', e => e.preventDefault());

// Let go of everything (when the controls hide, e.g. on pause, or the app loses focus)
function releaseTouch() {
  for (const code of [...touchHeld]) setVKey(code, false);
  touchEl.querySelectorAll('.t-btn.on').forEach(el => el.classList.remove('on'));
  resetStick();
}
window.addEventListener('blur', releaseTouch);

// A finger anywhere switches to touch aiming (and turns the controls on in "Auto"); moving a real mouse switches back
window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { TOUCH.seen = true; TOUCH.using = true; } }, true);
window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') TOUCH.using = false; }, true);

// Called every frame: show the controls only during a match
function updateTouch() {
  const show = touchEnabled() && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending') && !G.paused;
  if (show === touchShown) return;
  touchShown = show; touchEl.classList.toggle('show', show);
  if (!show) releaseTouch();
}
resetStick();
