/* NEON BRAWL — v18 Settings → Controls: remappable keyboard + mouse, and a drag-to-arrange touch layout.
 *
 *   KEY BINDS     every gameplay action is bound to one physical key or mouse button (localStorage neonbrawl.keybinds).
 *                 The game itself never changes: input.js runs each physical code through bindCode(), which turns it into
 *                 the action's original virtual code (KeyA, Space, M0…) — so the simulation, online lockstep, touch and
 *                 gamepads (which press virtual codes directly) are untouched. A default key you rebound away goes dead;
 *                 binding a key another action uses swaps the two. Esc / P / Enter / Tab / 1-8 stay reserved. Every key
 *                 hint in the game (the match tip, the pause keymap, How to Play) shows your current binds.
 *   TOUCH LAYOUT  "Customize touch layout" lifts the live touch controls over the screen: drag any button (or the stick's
 *                 resting spot) to fit your hands, select one to resize it; Done saves (localStorage
 *                 neonbrawl.touchlayout), Reset restores the default thumb arc. Hit-testing reads the live button rects,
 *                 so a moved button works exactly where you put it.                                                      */
'use strict';

/* ============================== key binds ============================== */
const BIND_ACTIONS = [                       // id · label · the virtual code the game reads (= the default key)
  ['left', 'Move left', 'KeyA'], ['right', 'Move right', 'KeyD'], ['down', 'Fast-fall · drop through', 'KeyS'], ['jump', 'Jump', 'Space'],
  ['light', 'Light attack', 'M0'], ['smash', 'Smash · hold to charge', 'M2'], ['special', 'Special · recovery', 'KeyQ'],
  ['shield', 'Shield · tap = parry', 'KeyE'], ['ult', 'Ultimate', 'KeyR'], ['taunt1', 'Taunt 1', 'KeyG'], ['taunt2', 'Taunt 2', 'KeyH']
];
const BIND_RESERVED = new Set(['Escape', 'KeyP', 'Enter', 'NumpadEnter', 'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']);
const KEYBINDS = { map: {}, phys: new Map(), dead: new Set(), ver: 0 };
const bindOf = id => KEYBINDS.map[id] || BIND_ACTIONS.find(a => a[0] === id)[2];
function bindsCompile() {
  KEYBINDS.phys.clear(); KEYBINDS.dead.clear(); KEYBINDS.ver++;
  for (const [id, , def] of BIND_ACTIONS) KEYBINDS.phys.set(bindOf(id), def);
  for (const [, , def] of BIND_ACTIONS) if (!KEYBINDS.phys.has(def)) KEYBINDS.dead.add(def);   // (a default key that now does nothing)
}
// a physical key / mouse button → the virtual code the game reads (null: it is unbound now)
function bindCode(code) { return KEYBINDS.phys.has(code) ? KEYBINDS.phys.get(code) : KEYBINDS.dead.has(code) ? null : code; }
function bindsLoad() { try { const m = JSON.parse(localStorage.getItem('neonbrawl.keybinds') || '{}'); if (m && typeof m === 'object') KEYBINDS.map = m; } catch (e) { /* storage unavailable */ } bindsCompile(); }
function bindsSave() { try { localStorage.setItem('neonbrawl.keybinds', JSON.stringify(KEYBINDS.map)); } catch (e) { /* storage unavailable */ } }
const KEY_NAMES = { M0: 'LMB', M1: 'MMB', M2: 'RMB', M3: 'Mouse 4', M4: 'Mouse 5', Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', CapsLock: 'Caps', Backspace: '⌫',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
const KEY_LONG = { M0: 'Left click', M1: 'Middle click', M2: 'Right click' };
function keyLabel(code, long) {
  if (!code) return '—'; if (long && KEY_LONG[code]) return KEY_LONG[code]; if (KEY_NAMES[code]) return KEY_NAMES[code];
  return code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
}
// the one-line control reminder shown under the HUD at the start of a match (render/hud.js)
function keyHintLine() {
  const L = id => keyLabel(bindOf(id), true);
  return `${L('left')}/${L('right')} move · ${L('jump')} jump · ${L('light')} light · ${L('smash')} smash (hold to charge) · ${L('special')} special · ${L('shield')} shield (tap = parry) · ${L('ult')} Ultimate · ${L('taunt1')} taunt · 1-8 emojis · aim with the mouse`;
}
// every <kbd data-bind="…"> in the page (pause keymap, combo guide, How to Play) shows your bind
function refreshKeyHints() { document.querySelectorAll('kbd[data-bind]').forEach(k => { k.textContent = keyLabel(bindOf(k.dataset.bind)); }); }

/* ---- capture: click a keycap, press the new key / mouse button (Esc cancels) ---- */
const BIND_CAP = { id: null, swallow: false, msg: '' };
function bindCaptureStart(id) { BIND_CAP.id = id; BIND_CAP.msg = ''; rebuildControls(); }
function bindCaptureEnd() { BIND_CAP.id = null; rebuildControls(); }
function bindAssign(id, code) {
  if (BIND_RESERVED.has(code)) { BIND_CAP.msg = keyLabel(code) + ' is reserved'; rebuildControls(); sfx('click'); return; }
  const cur = bindOf(id), other = BIND_ACTIONS.find(a => a[0] !== id && bindOf(a[0]) === code);
  if (other) KEYBINDS.map[other[0]] = cur;                                        // (taken: the two actions swap keys)
  KEYBINDS.map[id] = code;
  for (const [aid, , def] of BIND_ACTIONS) if (KEYBINDS.map[aid] === def) delete KEYBINDS.map[aid];
  bindsCompile(); bindsSave(); refreshKeyHints(); BIND_CAP.id = null; BIND_CAP.msg = other ? `Swapped with ${other[1]}` : ''; rebuildControls(); sfx('click');
}
window.addEventListener('keydown', e => {
  if (!BIND_CAP.id) return;
  e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
  if (e.code === 'Escape') bindCaptureEnd(); else bindAssign(BIND_CAP.id, e.code);
}, true);
window.addEventListener('mousedown', e => {
  if (!BIND_CAP.id || e.target.closest('[data-bindstart]')) return;               // (the keycap that started listening ignores its own click)
  e.preventDefault(); e.stopImmediatePropagation(); BIND_CAP.swallow = true; bindAssign(BIND_CAP.id, 'M' + e.button);
}, true);
window.addEventListener('click', e => { if (BIND_CAP.swallow) { BIND_CAP.swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
window.addEventListener('contextmenu', e => { if (BIND_CAP.id || BIND_CAP.swallow) e.preventDefault(); }, true);

/* ---- the Settings → Controls rows (menus.js settingRow calls these) ---- */
function bindsHTML() {
  const rows = BIND_ACTIONS.map(([id, label]) => { const on = BIND_CAP.id === id, code = bindOf(id), mod = !!KEYBINDS.map[id];
    return `<div class="bind${on ? ' listening' : ''}"><span>${label}</span><button class="keycap${mod ? ' mod' : ''}" data-bindstart="${id}" aria-label="${label}: ${keyLabel(code, true)} — click to rebind">${on ? 'Press a key…' : keyLabel(code)}</button></div>`; }).join('');
  return `<div class="srow col binds"><div class="sl"><b>Keyboard &amp; mouse</b><small>Click a key, then press the new key or mouse button. Esc cancels; a key that's already used swaps over.</small></div>` +
    `<div class="bind-grid">${rows}</div><div class="bind-foot"><span class="bind-msg">${BIND_CAP.msg}</span><button class="btn small" data-act="binds-reset"${Object.keys(KEYBINDS.map).length ? '' : ' disabled'}>Reset to defaults</button></div></div>` +
    `<div class="srow col"><div class="sl"><b>Gamepad</b><small>Fixed layout — any standard controller.</small></div><div class="kgrid pad"><span><kbd>Ⓐ</kbd> attack</span><span><kbd>Ⓑ</kbd> special</span><span><kbd>Ⓧ</kbd><kbd>Ⓨ</kbd> jump</span><span><kbd>RT</kbd> smash</span><span><kbd>LB</kbd><kbd>RB</kbd> shield</span><span><kbd>LT</kbd> Ultimate</span><span><kbd>View</kbd> taunt</span><span><kbd>L3</kbd><kbd>R3</kbd> emojis</span><span><kbd>Start</kbd> pause</span></div></div>`;
}
function touchLayoutHTML() {
  const mod = Object.keys(TLAYOUT.btn).length || TLAYOUT.stick;
  return `<div class="srow"><div class="sl"><b>Touch layout</b><small>Drag the stick and every button where your thumbs want them, and resize any button.${mod ? ' · customised' : ''}</small></div>` +
    `<div class="tl-acts"><button class="btn small primary" data-act="tlayout-edit">Customize</button><button class="btn small" data-act="tlayout-reset"${mod ? '' : ' disabled'}>Reset</button></div></div>`;
}
function rebuildControls() { if (G.screen === 'scr-settings' && setTab === 'controls') buildSettings(); }
document.addEventListener('click', e => {
  const k = e.target.closest('[data-bindstart]'); if (k) { e.preventDefault(); const id = k.dataset.bindstart; BIND_CAP.id === id ? bindCaptureEnd() : bindCaptureStart(id); sfx('click'); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const A = b.dataset.act;
  if (A === 'binds-reset') { KEYBINDS.map = {}; bindsCompile(); bindsSave(); refreshKeyHints(); BIND_CAP.msg = 'Defaults restored'; rebuildControls(); sfx('click'); }
  else if (A === 'tlayout-edit') tlEditOpen();
  else if (A === 'tlayout-reset') { TLAYOUT.btn = {}; TLAYOUT.stick = null; tlSave(); tlApply(); rebuildControls(); sfx('click'); }
});

/* ============================== touch layout ============================== */
const TLAYOUT = { btn: {}, stick: null };     // btn: id → { r, b, k } (centre offsets from the bottom-right, logical px · size ×) · stick: { x, y } resting centre (from the bottom-left)
function tlLoad() { try { const o = JSON.parse(localStorage.getItem('neonbrawl.touchlayout') || '{}'); TLAYOUT.btn = o.btn || {}; TLAYOUT.stick = o.stick || null; } catch (e) { /* storage unavailable */ } }
function tlSave() { try { localStorage.setItem('neonbrawl.touchlayout', JSON.stringify(TLAYOUT)); } catch (e) { /* storage unavailable */ } }
const tlBtn = b => { const o = TLAYOUT.btn[b.id] || {}; return { r: o.r !== undefined ? o.r : b.r, b: o.b !== undefined ? o.b : b.b, s: b.size * (o.k || 1) }; };
const tlStick = () => TLAYOUT.stick || { x: 118, y: 230 };
function tlApply() {
  for (const b of TOUCH_BTNS) { const el = btnEl(b.id); if (!el) continue; const p = tlBtn(b);
    el.style.setProperty('--s', p.s.toFixed(1)); el.style.setProperty('--r', (p.r - p.s / 2).toFixed(1)); el.style.setProperty('--b', (p.b - p.s / 2).toFixed(1)); }
  const em = TOUCH_BTNS.find(b => b.id === 'emoji'), p = tlBtn(em), w = document.getElementById('t-wheel');   // the emoji wheel opens round the emoji button
  if (w) { w.style.right = `calc(var(--u) * ${p.r.toFixed(1)})`; w.style.bottom = `calc(var(--u) * ${p.b.toFixed(1)})`; }
  if (stickId === null) resetStick();
}
/* ---- the editor ---- */
const TEDIT = { on: false, sel: null, drag: null, bar: null };
function tlEditOpen() {
  TEDIT.on = true; TEDIT.sel = null; releaseTouch();
  if (!TEDIT.bar) { TEDIT.bar = document.createElement('div'); TEDIT.bar.className = 'te-bar'; touchEl.appendChild(TEDIT.bar);
    TEDIT.bar.addEventListener('input', e => { if (e.target.id !== 'te-size' || !TEDIT.sel) return; const o = TLAYOUT.btn[TEDIT.sel] || (TLAYOUT.btn[TEDIT.sel] = {}); o.k = +e.target.value; tlApply(); });
    TEDIT.bar.addEventListener('click', e => { const a = e.target.closest('[data-te]'); if (!a) return;
      if (a.dataset.te === 'done') tlEditClose(); else if (a.dataset.te === 'reset') { TLAYOUT.btn = {}; TLAYOUT.stick = null; TEDIT.sel = null; tlApply(); tlBarUI(); } sfx('click'); }); }
  document.getElementById('wrap').classList.add('tedit'); touchEl.classList.add('show', 'edit'); tBase.classList.add('on');
  tlApply(); tlBarUI(); sfx('click');
}
function tlEditClose() {
  TEDIT.on = false; TEDIT.sel = null; TEDIT.drag = null; tlSave();
  document.getElementById('wrap').classList.remove('tedit'); touchEl.classList.remove('edit', 'show'); touchShown = false;
  touchEl.querySelectorAll('.t-btn.sel').forEach(el => el.classList.remove('sel')); tBase.classList.remove('on', 'sel'); resetStick(); rebuildControls();
}
function tlBarUI() {
  const b = TEDIT.sel && TOUCH_BTNS.find(q => q.id === TEDIT.sel), k = b ? (TLAYOUT.btn[b.id] || {}).k || 1 : 1;
  TEDIT.bar.innerHTML = `<div class="te-t"><b>Touch layout</b><small>${b ? 'Drag to move · slide to resize' : 'Drag any control to move it · tap a button to resize it'}</small></div>` +
    `<label class="te-size${b ? '' : ' off'}"><span>${b ? b.label || 'Emoji' : 'Size'}</span><input type="range" id="te-size" min="0.7" max="1.4" step="0.05" value="${k}"${b ? '' : ' disabled'}></label>` +
    `<button class="btn small" data-te="reset">Reset</button><button class="btn small primary" data-te="done">Done</button>`;
  touchEl.querySelectorAll('.t-btn').forEach(el => el.classList.toggle('sel', el.dataset.tb === TEDIT.sel)); tBase.classList.toggle('sel', TEDIT.sel === 'stick');
}
// drag handling: capture phase on the touch layer, so the pad / stick never see the pointer while editing
touchEl.addEventListener('pointerdown', e => {
  if (!TEDIT.on || e.target.closest('.te-bar')) return;
  e.preventDefault(); e.stopPropagation();
  const btn = e.target.closest('.t-btn'), stick = !btn && e.target.closest('.t-base');
  if (!btn && !stick) { TEDIT.sel = null; tlBarUI(); return; }
  try { touchEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
  const ts = SET.touchScale || 1;
  if (btn) { const b = TOUCH_BTNS.find(q => q.id === btn.dataset.tb), p = tlBtn(b); TEDIT.sel = b.id; TEDIT.drag = { id: b.id, x0: e.clientX, y0: e.clientY, r0: p.r, b0: p.b, ts, pid: e.pointerId }; }
  else { const s = tlStick(); TEDIT.sel = 'stick'; TEDIT.drag = { id: 'stick', x0: e.clientX, y0: e.clientY, sx: s.x, sy: s.y, pid: e.pointerId }; }
  tlBarUI();
}, true);
touchEl.addEventListener('pointermove', e => {
  const D = TEDIT.drag; if (!TEDIT.on || !D || e.pointerId !== D.pid) return;
  e.preventDefault(); e.stopPropagation();
  const u = VIEW.u || 1, dx = (e.clientX - D.x0) / u, dy = (e.clientY - D.y0) / u;
  if (D.id === 'stick') { const zw = (document.getElementById('t-zone').getBoundingClientRect().width || 400) / u;
    TLAYOUT.stick = { x: Math.round(clamp(D.sx + dx, 80, zw - 80)), y: Math.round(clamp(D.sy - dy, 90, VIEW.LH - 180)) }; resetStick(); tBase.classList.add('on'); return; }
  const b = TOUCH_BTNS.find(q => q.id === D.id), o = TLAYOUT.btn[D.id] || (TLAYOUT.btn[D.id] = {}), s = b.size * (o.k || 1) / 2, pr = tPad.getBoundingClientRect();
  o.r = Math.round(clamp(D.r0 - dx / D.ts, s, pr.width / u / D.ts - s)); o.b = Math.round(clamp(D.b0 - dy / D.ts, s, pr.height / u / D.ts - s)); tlApply();
}, true);
const tlUp = e => { if (TEDIT.on && TEDIT.drag && e.pointerId === TEDIT.drag.pid) { e.stopPropagation(); TEDIT.drag = null; } };
touchEl.addEventListener('pointerup', tlUp, true); touchEl.addEventListener('pointercancel', tlUp, true);
window.addEventListener('keydown', e => { if (TEDIT.on && (e.code === 'Escape' || e.code === 'Enter')) { e.preventDefault(); e.stopImmediatePropagation(); tlEditClose(); } }, true);

bindsLoad(); tlLoad(); tlApply(); refreshKeyHints();
