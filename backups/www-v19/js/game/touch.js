/* NEON BRAWL — On-screen touch controls for phones and tablets.
 *   Left thumb:  a floating multi-touch stick, placed wherever you touch the left half of the screen. It moves (flick
 *                twice = dash), fast-falls / drops (down) and aims attacks and specials, like the mouse does on PC.
 *                A small dead zone stops drift; if your thumb runs past the rim, the base follows it so you never
 *                "lose" the stick. A direction arrow on the rim shows where you're pushing.
 *   Right thumb: Attack · Smash (hold to charge) · Special · Jump (hold to hover / fly) · Shield (tap = parry) · ULT ·
 *                Emote (taunt slot 1) · an emoji button that opens a wheel of your 8 mapped holographic emojis + taunt slot 2,
 *                laid out in a thumb arc around the big Attack button. The whole right half is one touch pad: a touch
 *                presses the NEAREST button centre within 1.6× its radius, so near-misses still land, and the enlarged
 *                zones can never overlap. A thumb may slide onto Jump or Shield (slide-jump out of an attack, slide into
 *                shield) — sliding from one attack onto another never fires the second attack by accident.
 * Every press writes the same virtual keys as the keyboard and mouse (read by the next 60 Hz step: no input delay,
 * nothing waits for a click event), so the game logic can't tell them apart. Pointer capture + pointercancel keep
 * every finger tracked; touchstart / gesturestart default actions are blocked so the page never scrolls or zooms.  */
'use strict';

const STICK_R = 64, STICK_DEAD = 0.18;      // stick travel in logical pixels · dead zone (fraction of the travel)
// (v18) clean line icons (24 × 24, stroked in currentColor) instead of emoji glyphs
const TICON = {
  light: '<rect x="5.5" y="7.5" width="13" height="10" rx="3.2"/><path d="M9.8 7.5v4.2M14.2 7.5v4.2M5.5 11.7h13"/>',
  heavy: '<path d="M12 2.8l2 5.6 5.7-2-3.2 5.1 5 2.9-5.9.7 1.1 5.9-4.7-3.7-4.7 3.7 1.1-5.9-5.9-.7 5-2.9-3.2-5.1 5.7 2z"/>',
  special: '<path d="M12 3.5c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z"/>',
  jump: '<path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/>',
  shield: '<path d="M12 3.2l7 2.8v5.2c0 4.3-2.9 8.1-7 9.7-4.1-1.6-7-5.4-7-9.7V6z"/>',
  ult: '<path d="M13.2 2.8L5.8 13.2h5.6l-1 8 7.6-10.6h-5.6z"/>',
  emote: '<circle cx="12" cy="5.2" r="2.2"/><path d="M12 8.6v6.4M8.2 20.6l3.8-5.6 3.8 5.6M5.2 8.8l6.8 2 6.4-4.6"/>',
  emoji: '<circle cx="12" cy="12" r="8.6"/><path d="M8.6 14.2c.9 1.4 2.1 2.1 3.4 2.1s2.5-.7 3.4-2.1"/><path d="M9.2 9.8v.4M14.8 9.8v.4"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>'
};
const ticon = k => `<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TICON[k]}</svg>`;
const TOUCH_BTNS = [                         // code = the key / mouse button it stands for · hold = stays down while touched
  // (layout: centre offsets from the bottom-right corner, in logical px — a thumb arc around Attack; Settings → Controls
  //  → Customize moves / resizes them: ui/controls18.js)
  { id: 'light',   label: 'Attack',  code: 'M0',    hold: false, size: 132, r: 112, b: 108, attack: true },
  { id: 'heavy',   label: 'Smash',   code: 'M2',    hold: true,  size: 100, r: 262, b: 96,  attack: true },   // hold to charge
  { id: 'special', label: 'Special', code: 'KeyQ',  hold: false, size: 98,  r: 218, b: 214, attack: true },
  { id: 'jump',    label: 'Jump',    code: 'Space', hold: true,  size: 110, r: 108, b: 262, slide: true },
  { id: 'shield',  label: 'Shield',  code: 'KeyE',  hold: true,  size: 90,  r: 292, b: 318, slide: true },
  { id: 'ult',     label: '0%',      code: 'KeyR',  hold: false, size: 92,  r: 400, b: 100, attack: true },  // fills up with the Ultimate meter
  { id: 'emote',   label: 'Emote',   code: 'KeyG',  hold: false, size: 70,  r: 430, b: 226, attack: true },  // the taunt (game/emotes.js)
  { id: 'emoji',   label: '',        code: '',      hold: false, size: 62,  r: 466, b: 334, attack: true }   // opens the emoji wheel
];
const BTN_REACH = 1.6;                       // a touch counts within 1.6× a button's radius (nearest centre wins)

const touchEl = document.getElementById('touch');
touchEl.innerHTML =
  `<div class="t-zone" id="t-zone"><div class="t-base" id="t-base"><i class="t-dir" id="t-dir"></i><div class="t-knob" id="t-knob"></div></div></div>` +
  `<div class="t-pad" id="t-pad">` + TOUCH_BTNS.map(b => `<button class="t-btn t-${b.id}" data-tb="${b.id}" aria-label="${b.label || 'Emoji'}" style="--s:${b.size};--r:${b.r - b.size / 2};--b:${b.b - b.size / 2}">` +
    `<i>${ticon(b.id)}</i><span>${b.label}</span></button>`).join('') + `</div>` +
  `<button class="t-pause" id="t-pause" aria-label="Pause">${ticon('pause')}</button>`;
const tBase = document.getElementById('t-base'), tKnob = document.getElementById('t-knob'), tDir = document.getElementById('t-dir'), tPad = document.getElementById('t-pad');
const btnEl = id => tPad.querySelector(`[data-tb="${id}"]`);
const touchHeld = new Set();        // virtual keys currently held down by touch
let stickId = null, touchShown = false;

const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
function touchEnabled() { return SET.touch === 'on' || (SET.touch !== 'off' && (TOUCH.seen || coarsePointer.matches)); }

function setVKey(code, on) {
  if (on && !touchHeld.has(code)) { touchHeld.add(code); keys.add(code); pressed.add(code); }
  else if (!on && touchHeld.has(code)) { touchHeld.delete(code); keys.delete(code); }
}
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event (tests) */ } }
function buzz(ms) { try { if (navigator.vibrate && SET.haptics !== false) navigator.vibrate(ms || 8); } catch (e) { /* not supported */ } }

// Logical coordinates of a pointer event inside the (full-bleed) touch layer, in the same units as var(--u)
function touchPos(e) { const r = touchEl.getBoundingClientRect(); return [(e.clientX - r.left) / VIEW.u, (e.clientY - r.top) / VIEW.u]; }

/* ---- the floating stick ---- */
function setStick(x, y) {
  const m = Math.hypot(x, y), k = m < STICK_DEAD ? 0 : (m - STICK_DEAD) / (1 - STICK_DEAD) / (m || 1);   // dead zone, then rescaled to 0..1
  const sx = x * k, sy = y * k;
  TOUCH.sx = sx; TOUCH.sy = sy;
  setVKey('KeyA', sx < -0.35); setVKey('KeyD', sx > 0.35);
  setVKey('KeyS', sy > 0.6 && sy > Math.abs(sx));
  tKnob.style.transform = `translate(calc(${x * STICK_R} * var(--u)), calc(${y * STICK_R} * var(--u)))`;
  tKnob.style.setProperty('--m', Math.min(1, m).toFixed(2));
  tDir.style.opacity = m > STICK_DEAD ? Math.min(1, m).toFixed(2) : '0';
  tDir.style.transform = `rotate(${Math.atan2(y, x).toFixed(3)}rad)`;
}
function placeBase(x, y) { tBase.style.left = `calc(${x} * var(--u))`; tBase.style.top = `calc(${y} * var(--u))`; tBase.dataset.ox = x; tBase.dataset.oy = y; }
function resetStick() { stickId = null; setStick(0, 0); tBase.classList.remove('on');
  const s = typeof tlStick === 'function' ? tlStick() : { x: 118, y: 230 }; placeBase(s.x + VIEW.OX * 0.3, VIEW.LH - s.y); }   // (its resting spot: Settings → Controls → touch layout)

const zone = document.getElementById('t-zone');
zone.addEventListener('pointerdown', e => {
  e.preventDefault(); if (stickId !== null) return;
  stickId = e.pointerId; capture(zone, e);
  const [x, y] = touchPos(e);
  placeBase(x, y); tBase.classList.add('on');
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId) return;
  const [x, y] = touchPos(e);
  let ox = +tBase.dataset.ox, oy = +tBase.dataset.oy, dx = (x - ox) / STICK_R, dy = (y - oy) / STICK_R;
  const m = Math.hypot(dx, dy);
  if (m > 1.35) { ox = x - dx / m * STICK_R * 1.35; oy = y - dy / m * STICK_R * 1.35; placeBase(ox, oy); dx = (x - ox) / STICK_R; dy = (y - oy) / STICK_R; }   // the base follows a runaway thumb
  const mm = Math.hypot(dx, dy); if (mm > 1) { dx /= mm; dy /= mm; }
  setStick(dx, dy);
});
const stickUp = e => { if (e.pointerId === stickId) resetStick(); };
zone.addEventListener('pointerup', stickUp); zone.addEventListener('pointercancel', stickUp); zone.addEventListener('lostpointercapture', stickUp);

/* ---- the action pad: nearest-centre hit testing, slide rules, glow on press ---- */
const padTouch = new Map();          // pointerId → the button it is holding (or null)
function nearestBtn(e) {
  let best = null, bd = Infinity;
  for (const b of TOUCH_BTNS) {
    const el = btnEl(b.id); if (!el || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect(), R = r.width / 2, d = Math.hypot(e.clientX - (r.left + R), e.clientY - (r.top + R));
    if (d <= R * BTN_REACH && d / R < bd) { bd = d / R; best = b; }       // (distance in radii: big buttons don't swallow small ones)
  }
  return best;
}
function pressBtn(b, e) {
  const el = btnEl(b.id); el.classList.add('on'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if (b.id === 'emoji') toggleEmojiWheel();
  else if (b.hold) setVKey(b.code, true); else pressed.add(b.code);
  if (e && e.isTrusted) buzz(b.id === 'light' || b.id === 'heavy' ? 10 : 7);   // (only real touches can vibrate)
}
function releaseBtn(b) {
  if (!b) return; const el = btnEl(b.id);
  if (![...padTouch.values()].some(x => x === b)) { el.classList.remove('on'); if (b.hold) setVKey(b.code, false); }
}
tPad.addEventListener('pointerdown', e => {
  e.preventDefault(); capture(tPad, e);
  const b = nearestBtn(e); padTouch.set(e.pointerId, b || null);
  if (b) pressBtn(b, e);
});
tPad.addEventListener('pointermove', e => {
  if (!padTouch.has(e.pointerId)) return;
  const cur = padTouch.get(e.pointerId), b = nearestBtn(e);
  if (b === cur) return;
  if (b && !b.slide && cur) return;                           // never slide from one button into an attack
  padTouch.set(e.pointerId, b || null); releaseBtn(cur);
  if (b) pressBtn(b, e);
});
const padUp = e => { if (!padTouch.has(e.pointerId)) return; const cur = padTouch.get(e.pointerId); padTouch.delete(e.pointerId); releaseBtn(cur); };
tPad.addEventListener('pointerup', padUp); tPad.addEventListener('pointercancel', padUp); tPad.addEventListener('lostpointercapture', padUp);

document.getElementById('t-pause').addEventListener('pointerdown', e => { e.preventDefault(); setPaused(true); });
/* ---- the emoji wheel: an arc of your mapped holographic emojis (keys 1-8, Settings → Profile) + taunt slot 2; a tap pops one ---- */
const wheelEl = document.createElement('div'); wheelEl.className = 't-wheel'; wheelEl.id = 't-wheel'; touchEl.appendChild(wheelEl);
function toggleEmojiWheel(force) {
  const open = force !== undefined ? force : !wheelEl.classList.contains('open');
  if (open) { const own = emojiKeys().map((id, slot) => [EMOJIS[emojiIndex(id)], slot]).filter(([em]) => em && emojiUnlocked(EMOJIS.indexOf(em)));
    const t2 = tauntSlots()[1] || 'bow', items = [[{ glyph: EMOTE_ICON[t2] || '🕺' }, 'taunt2']].concat(own), n = items.length;   // a fan round the emoji button (radius 128, opening up-left)
    wheelEl.innerHTML = items.map(([em, slot], k) => { const a = (100 + (n > 1 ? k / (n - 1) : 0.5) * 120) * Math.PI / 180, x = Math.cos(a) * 128, y = Math.sin(a) * 128;
      return `<button class="t-emo${slot === 'taunt2' ? ' t2' : ''}" data-emo="${slot}" style="--k:${k};left:calc(var(--u) * ${(x - 29).toFixed(1)});bottom:calc(var(--u) * ${(y - 29).toFixed(1)})">${em.glyph}</button>`; }).join(''); }
  wheelEl.classList.toggle('open', open);
}
wheelEl.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); const b = e.target.closest('[data-emo]');
  if (b) { pressed.add(b.dataset.emo === 'taunt2' ? 'KeyH' : 'Digit' + (+b.dataset.emo + 1)); if (e.isTrusted) buzz(6); }
  toggleEmojiWheel(false);
});
touchEl.addEventListener('contextmenu', e => e.preventDefault());
// the page must never scroll, bounce or zoom under a thumb (iOS ignores user-scalable=no: these are what stop it)
touchEl.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
touchEl.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => { if (G.mode !== 'menu') e.preventDefault(); }, { passive: false });

// Let go of everything (when the controls hide, e.g. on pause, or the app loses focus)
function releaseTouch() {
  for (const code of [...touchHeld]) setVKey(code, false);
  padTouch.clear(); tPad.querySelectorAll('.t-btn.on').forEach(el => el.classList.remove('on'));
  if (typeof wheelEl !== 'undefined') wheelEl.classList.remove('open');
  resetStick();
}
window.addEventListener('blur', releaseTouch);

// A finger anywhere switches to touch aiming (and turns the controls on in "Auto"); moving a real mouse switches back
window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { TOUCH.seen = true; TOUCH.using = true; } }, true);
window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') TOUCH.using = false; }, true);

// Called every frame: show the controls only during a match
function updateTouch() {
  if (typeof TEDIT !== 'undefined' && TEDIT.on) return;                    // (the layout editor owns the layer)
  const show = touchEnabled() && (G.mode === 'count' || G.mode === 'play' || G.mode === 'ending') && !G.paused;
  if (show === touchShown) return;
  touchShown = show; touchEl.classList.toggle('show', show);
  if (!show) releaseTouch();
}
resetStick();
