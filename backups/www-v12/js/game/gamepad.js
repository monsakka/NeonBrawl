/* NEON BRAWL — Gamepad support (the Gamepad API's "standard" Xbox / PlayStation layout), alongside keyboard, mouse and
 * touch. Like the touch controls, a pad presses the same virtual keys the keyboard does, so the game logic — and the
 * online lockstep, which only ever sends inputs — can't tell them apart. Any device works at any moment; the last one
 * used decides the aim source and the on-screen control hints.
 *
 *   Left stick / D-pad  move · down = fast-fall / drop through · a quick flick = dash · it also aims attacks
 *   Right stick         aims while held; a flick = a smash attack in that direction (a "C-stick")
 *   A light attack · B special · X / Y jump (hold to hover / fly) · RT smash (hold to charge) · LB / RB shield (tap = parry)
 *   LT Ultimate · View / Select taunt · L3 / R3 emojis 1 / 2 · Start pause
 *   Menus: D-pad / stick move between buttons (spatial focus), A confirms, B goes back, Start resumes.
 * Rumble (where the pad supports it) on big hits and KOs.                                                            */
'use strict';

const GP = { using: false, prev: [], held: new Set(), aimX: 0, aimY: 0, hist: [], dashQ: null, rFlick: 0, navT: 0, navDir: '', id: '' };
const GP_MOVE = 0.5, GP_AIM = 0.42;
function gpKey(code, on) {
  if (on && !GP.held.has(code)) { GP.held.add(code); keys.add(code); pressed.add(code); }
  else if (!on && GP.held.has(code)) { GP.held.delete(code); keys.delete(code); }
}
function gpRelease() { for (const c of [...GP.held]) gpKey(c, false); GP.dashQ = null; }
function activePad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let any = null;
  for (const p of pads) { if (!p || !p.connected) continue; if (p.mapping === 'standard') return p; any = any || p; }
  return any;
}
// polled once per animation frame by the main loop (before the simulation steps that read the keys)
function pollGamepad() {
  const p = activePad(); if (!p) { if (GP.held.size) gpRelease(); return; }
  const now = p.buttons.map(b => !!b && (b.pressed || b.value > 0.5)), edge = i => now[i] && !GP.prev[i];
  let x = p.axes[0] || 0, y = p.axes[1] || 0; const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
  if (now[14]) x = -1; if (now[15]) x = 1; if (now[12]) y = -1; if (now[13]) y = 1;
  if (now.some(Boolean) || Math.hypot(x, y) > 0.6 || Math.hypot(rx, ry) > 0.6) { if (!GP.using) { GP.using = true; TOUCH.using = false; } GP.id = p.id; }
  const inMenus = G.mode === 'menu' || G.mode === 'over' || G.paused;
  if (inMenus) { gpRelease(); gpMenus(p, now, edge, x, y); GP.prev = now; return; }
  // ---- in a match: the virtual keys ----
  gpKey('KeyA', x < -GP_MOVE); gpKey('KeyD', x > GP_MOVE); gpKey('KeyS', y > 0.65 && Math.abs(y) > Math.abs(x));
  GP.hist.push(x); if (GP.hist.length > 4) GP.hist.shift();                     // a flick (neutral → full in ≤ 3 polls) = dash: a second tap of the same key
  if (Math.abs(x) > 0.85 && GP.hist.slice(0, -1).some(v => Math.abs(v) < 0.3) && !GP.dashQ) GP.dashQ = { code: x < 0 ? 'KeyA' : 'KeyD', t: 2 };
  if (GP.dashQ && --GP.dashQ.t <= 0) { if (GP.held.has(GP.dashQ.code)) pressed.add(GP.dashQ.code); GP.dashQ = null; }
  gpKey('Space', now[2] || now[3]); gpKey('M0', now[0]); gpKey('KeyQ', now[1]); gpKey('KeyE', now[4] || now[5]);
  gpKey('KeyR', now[6]); gpKey('KeyG', now[8]);
  // the right stick: aim while held, and a flick out of neutral fires a smash that way
  const rm = Math.hypot(rx, ry);
  if (rm > 0.75 && GP.rFlick < 0.3) GP.rHold = true; if (rm < 0.4) GP.rHold = false; GP.rFlick = rm;   // (held out = keep charging the smash)
  gpKey('M2', now[7] || GP.rHold);
  if (rm > GP_AIM) { GP.aimX = rx * 110; GP.aimY = ry * 110; } else if (Math.hypot(x, y) > GP_AIM) { GP.aimX = x * 110; GP.aimY = y * 110; } else { GP.aimX = 0; GP.aimY = 0; }
  if (edge(10)) pressed.add('Digit1'); if (edge(11)) pressed.add('Digit2');
  if (edge(9)) setPaused(true);
  GP.prev = now;
}
// menus: spatial focus between the visible buttons, A = click, B = back, Start = resume
function gpMenus(p, now, edge, x, y) {
  const dir = Math.abs(x) > 0.6 || Math.abs(y) > 0.6 ? (Math.abs(x) > Math.abs(y) ? (x < 0 ? 'L' : 'R') : (y < 0 ? 'U' : 'D')) : '';
  const t = performance.now();
  if (dir && (dir !== GP.navDir || t - GP.navT > (GP.navRep ? 130 : 380))) { GP.navRep = dir === GP.navDir; GP.navDir = dir; GP.navT = t; gpNav(dir); }
  if (!dir) { GP.navDir = ''; GP.navRep = false; }
  if (edge(0)) { const a = document.activeElement; if (a && a !== document.body && a.closest('#ui')) a.click(); else uiKey('Enter'); }
  if (edge(1)) { if (!uiKey('Escape')) { const back = document.querySelector('.screen.show .hd [data-go], .screen.show [data-net="back"]'); if (back) back.click(); } }
  if (edge(9) && G.paused) setPaused(false);
  if (edge(9) && G.screen === 'scr-intro' && typeof introStart === 'function') introStart();
}
const gpFocusable = () => [...document.querySelectorAll('.screen.show button:not([disabled]), .screen.show input, .screen.show [tabindex="0"]')]
  .filter(el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; });
function gpNav(dir) {
  const els = gpFocusable(); if (!els.length) return;
  let cur = document.activeElement;
  if (cur && cur.type === 'range' && (dir === 'L' || dir === 'R')) { cur.stepUp ? (dir === 'R' ? cur.stepUp() : cur.stepDown()) : 0; cur.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (!els.includes(cur)) { gpFocus(els[0]); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, D = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] }[dir];
  let best = null, bs = Infinity;
  for (const el of els) { if (el === cur) continue; const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay, along = dx * D[0] + dy * D[1];
    if (along <= 2) continue; const across = Math.abs(dx * D[1] - dy * D[0]), s = along + across * 2.2; if (s < bs) { bs = s; best = el; } }
  if (best) gpFocus(best);
}
function gpFocus(el) { document.querySelectorAll('.gp-focus').forEach(e => e.classList.remove('gp-focus')); el.classList.add('gp-focus'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }

// rumble on your own big moments (Settings → Haptics)
GAME_EVENT_LISTENERS.push((type, d) => {
  if (!GP.using || SET.haptics === false) return;
  const p = activePad(), act = p && p.vibrationActuator; if (!act || !act.playEffect) return;
  const me = typeof localFighter === 'function' ? localFighter() : fighters[0];
  try {
    if (type === 'hit' && (d.att === me || d.vic === me) && d.kb >= 9) act.playEffect('dual-rumble', { duration: 60 + Math.min(220, d.kb * 6), strongMagnitude: Math.min(1, d.kb / 22), weakMagnitude: 0.5 });
    else if (type === 'ko') act.playEffect('dual-rumble', { duration: 420, strongMagnitude: 1, weakMagnitude: 1 });
    else if (type === 'parry' && d.v === me) act.playEffect('dual-rumble', { duration: 90, strongMagnitude: 0.2, weakMagnitude: 0.9 });
  } catch (e) { /* not supported */ }
});
window.addEventListener('gamepadconnected', e => { GP.using = true; TOUCH.using = false; if (typeof passToast === 'function') passToast('🎮 ' + (e.gamepad.id.replace(/\s*\(.*$/, '') || 'Gamepad') + ' connected'); });
window.addEventListener('gamepaddisconnected', () => { gpRelease(); GP.using = false; });
// a real mouse or keyboard takes over again
window.addEventListener('mousemove', e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) GP.using = false; }, true);
window.addEventListener('keydown', () => { GP.using = false; }, true);
window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') GP.using = false; }, true);
