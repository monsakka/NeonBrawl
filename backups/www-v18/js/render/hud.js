/* NEON BRAWL — In-match HUD as an HTML/CSS overlay (it is never rendered by WebGL or the game canvas).
 * Two chrome-edged glass panels with a live portrait, a colour-shifting digital % counter, gem stock badges and
 * meters (special / fuel / hover, launch multiplier, shield). updateHUD() runs every frame but only touches the DOM
 * when a value actually changes; meters move with transform: scaleX (compositor-only, no layout).               */
'use strict';

const HUD = { el: null, panels: [], tip: null, shown: false, touch: null, portT: 0 };
(function buildHUD() {
  const wrap = document.getElementById('wrap'), el = document.createElement('div');
  el.id = 'hud'; el.className = 'hud';
  const panel = k => `<div class="hp ${k ? 'p2' : 'p1'}"><div class="hp-portw"><canvas class="hp-port" width="168" height="168"></canvas></div>
    <div class="hp-body"><div class="hp-top"><b class="hp-name"></b><span class="hp-stocks"><i></i><i></i><i></i></span></div>
    <small class="hp-sub"></small>
    <div class="hp-pct"><span class="hp-ghost">888</span><span class="hp-num">0</span><em>%</em></div>
    <div class="hp-res"><small></small><div class="hp-bar"><i></i></div></div>
    <div class="hp-launch"><small></small><div class="hp-bar seg"><i></i></div></div>
    <div class="hp-ult"><small></small><div class="hp-bar ult"><i></i></div></div>
    <div class="hp-shield"><div class="hp-bar thin"><i></i></div></div></div></div>`;
  el.innerHTML = panel(0) + panel(1) + `<div class="hud-tip"></div><div class="hud-timer"></div>` +
    `<div class="ult-cutin"><div class="uc-lines"></div><div class="uc-band"><small>ULTIMATE</small><b></b><i></i></div></div>`;   // the Ultimate cut-in
  wrap.insertBefore(el, document.getElementById('touch'));
  HUD.el = el; HUD.tip = el.querySelector('.hud-tip'); HUD.timer = el.querySelector('.hud-timer');
  HUD.cut = el.querySelector('.ult-cutin'); HUD.cutName = HUD.cut.querySelector('b'); HUD.cutWho = HUD.cut.querySelector('i');
  HUD.panels = [...el.querySelectorAll('.hp')].map(p => ({
    root: p, port: p.querySelector('.hp-port'), pctx: p.querySelector('.hp-port').getContext('2d'), name: p.querySelector('.hp-name'), sub: p.querySelector('.hp-sub'),
    stocks: [...p.querySelectorAll('.hp-stocks i')], num: p.querySelector('.hp-num'), ghost: p.querySelector('.hp-ghost'),
    resL: p.querySelector('.hp-res small'), res: p.querySelector('.hp-res i'), resW: p.querySelector('.hp-res'),
    launchL: p.querySelector('.hp-launch small'), launch: p.querySelector('.hp-launch i'), shield: p.querySelector('.hp-shield i'),
    ultL: p.querySelector('.hp-ult small'), ult: p.querySelector('.hp-ult i'),
    c: {}, dummy: null
  }));
})();

// Write a DOM value only when it changed (cache per panel)
function hset(P, key, val, fn) { if (P.c[key] !== val) { P.c[key] = val; fn(val); } }

function updateHUD() {
  const inMatch = G.mode === 'count' || G.mode === 'play' || G.mode === 'ending';
  if (inMatch !== HUD.shown) { HUD.shown = inMatch; HUD.el.classList.toggle('show', inMatch); }
  if (!inMatch) return;
  const touch = typeof touchShown !== 'undefined' && touchShown;
  if (touch !== HUD.touch) { HUD.touch = touch; HUD.el.classList.toggle('touch', touch); }
  const drawPorts = (G.time - HUD.portT) >= 3 || G.time < HUD.portT; if (drawPorts) HUD.portT = G.time;
  fighters.forEach((f, k) => {
    const P = HUD.panels[k]; if (!P) return;
    const col = f.color, c = f.ch;
    hset(P, 'col', col, v => P.root.style.setProperty('--pc', v));
    hset(P, 'name', c.name, v => { P.name.textContent = v; });
    hset(P, 'sub', NET.active ? (f.id === NET.me ? 'YOU · ' + (NET.role || '').toUpperCase() : 'RIVAL · ONLINE') : G.training && f.cpu ? 'TRAINING DUMMY' : f.cpu ? 'CPU · ' + DIFFS[G.diff].name.toUpperCase() : 'PLAYER 1', v => { P.sub.textContent = v; });
    // % counter: cyan → green → yellow → orange → red, glow grows with damage; pops on each hit, shakes while hurt
    const boss = !!f.hand, pc = boss ? Math.max(0, Math.ceil(f.hpMax - f.percent)) : Math.floor(f.percent), tt = boss ? clamp(f.percent / f.hpMax, 0, 1) : clamp(f.percent / 200, 0, 1);
    hset(P, 'pc', pc, v => { P.num.textContent = v; P.ghost.textContent = '8'.repeat(String(v).length); });
    hset(P, 'unit', boss ? 'HP' : '%', v => { (P.unit || (P.unit = P.root.querySelector('.hp-pct em'))).textContent = v; });   // (the boss shows HP left)
    const hue = Math.round(190 - 190 * Math.min(1, tt * 1.25));
    hset(P, 'hue', hue + '|' + Math.round(tt * 10), () => { P.root.style.setProperty('--ph', hue); P.root.style.setProperty('--pg', (10 + tt * 14).toFixed(0)); });
    const pop = 1 + 0.25 * (f.percentPop / 14), hurt = SET.flash ? f.hurt / 14 : 0, jx = hurt ? (Math.random() * 2 - 1) * 3 * hurt : 0, jy = hurt ? (Math.random() * 2 - 1) * 3 * hurt : 0;
    hset(P, 'pop', pop.toFixed(3) + '|' + jx.toFixed(1) + '|' + jy.toFixed(1), () => { P.num.style.transform = `translate(${jx}px,${jy}px) scale(${pop})`; });
    hset(P, 'hurt', hurt > 0.05 ? 1 : 0, v => P.root.classList.toggle('hurt', !!v));
    // stocks (last stock pulses red)
    hset(P, 'stocks', f.stocks, v => { P.stocks.forEach((s, i) => s.classList.toggle('on', i < v)); P.root.classList.toggle('last', v === 1); });
    // resource meter: jet fuel / hover / special cooldown
    let label = '', val = 0;
    if (c.jet) { label = 'FUEL'; val = f.fuel / 100; } else if (c.hover) { label = 'HOVER'; val = f.hoverT / c.hover; } else if (c.special.cd) { label = 'Q'; val = 1 - f.spCD / c.special.cd; }
    val = clamp(val, 0, 1);
    hset(P, 'resL', label ? label + (val >= 1 ? ' READY' : '') : '', v => { P.resL.textContent = v; P.resW.style.visibility = label ? 'visible' : 'hidden'; P.resW.classList.toggle('ready', val >= 1); });
    hset(P, 'res', val.toFixed(3), v => { P.res.style.transform = `scaleX(${v})`; });
    // launch multiplier: how hard a reference smash would launch this fighter right now
    const mult = (8 + f.percent * 0.12) / 8 / c.weight, fr = clamp((mult - 0.5) / 3.5, 0, 1);
    hset(P, 'launchL', 'LAUNCH ×' + mult.toFixed(2), v => { P.launchL.textContent = v; });
    hset(P, 'launch', fr.toFixed(3), v => { P.launch.style.transform = `scaleX(${v})`; });
    // the Ultimate meter: glows and pulses when full
    const uf = clamp((f.ult || 0) / ULT_MAX, 0, 1), ready = uf >= 1, mine = f === localFighter() && !f.cpu;
    hset(P, 'ultL', ready ? (mine ? (touch ? 'ULT · TAP!' : 'ULT · PRESS R') : 'ULT READY') : 'ULTIMATE', v => { P.ultL.textContent = v; P.root.classList.toggle('ult-ready', ready); });
    hset(P, 'ult', uf.toFixed(3), v => { P.ult.style.transform = `scaleX(${v})`; });
    if (mine) hset(HUD, 'ultBtn', uf.toFixed(2), v => { const t = HUD.ultBtn || (HUD.ultBtn = document.querySelector('#touch .t-ult')); if (!t) return;   // the touch ULT button fills up as the meter charges
      t.style.setProperty('--p', v); t.classList.toggle('ready', +v >= 1); (t.querySelector('span') || t).textContent = +v >= 1 ? 'ULT' : Math.floor(+v * 100) + '%'; });   // (v18: the caption only — the icon stays)
    hset(P, 'ultDeny', f.ultDenyT > 28 ? 1 : 0, v => P.root.classList.toggle('ult-deny', !!v));
    const sf = clamp(f.shield / 100, 0, 1), low = sf < 0.3;
    hset(P, 'shield', sf.toFixed(3), v => { P.shield.style.transform = `scaleX(${v})`; });
    hset(P, 'slow', (f.state === 'stunned' ? 's' : low ? 'l' : 'n'), v => { P.root.classList.toggle('shield-low', v === 'l'); P.root.classList.toggle('stunned', v === 's'); });
    if (drawPorts && !RENDER3D.on) drawPortrait(P, f, k);                 // (the WebGL renderer draws live 3D portraits in this window)
  });
  hudSafeArea();
  // match clock (time limit) / Sudden Death tag / Training label
  hset(HUD, 'solo', CHAL.mode === 'btt' || CHAL.mode === 'btp' || CHAL.mode === 'horde' ? 1 : 0, v => HUD.el.classList.toggle('solo', !!v));     // Break the Targets: no opponent panel
  const chalT = typeof chalHudText === 'function' ? chalHudText() : '';
  const tl = chalT ? chalT : G.suddenDeath ? 'SUDDEN DEATH' : G.training ? 'TRAINING' : G.timeLeft > 0 ? (() => { const s = Math.ceil(G.timeLeft / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); })() : '';
  hset(HUD, 'timer', tl, v => { HUD.timer.textContent = v; HUD.timer.style.display = v ? 'block' : 'none'; HUD.timer.classList.toggle('sd', G.suddenDeath); HUD.timer.classList.toggle('low', !G.suddenDeath && !G.training && G.timeLeft > 0 && G.timeLeft < 600); });
  if (typeof minigameHUD === 'function') minigameHUD();                                   // v14 Volley Brawl scoreboard (game/minigames.js)
  // control reminder during the countdown and the first seconds
  const showTip = G.mode === 'count' || (G.mode === 'play' && G.frame < 480), a = G.mode === 'count' ? 1 : clamp((480 - G.frame) / 60, 0, 1);
  hset(HUD, 'tipA', showTip ? a.toFixed(2) : '0', v => { HUD.tip.style.opacity = v; });
  const mode = typeof GP !== 'undefined' && GP.using ? 'g' : TOUCH.using ? 't' : 'k';                   // (the last device used: keyboard + mouse, touch or a gamepad)
  hset(HUD, 'tipT', mode + (typeof KEYBINDS !== 'undefined' ? KEYBINDS.ver : ''), v => { v = v[0]; HUD.tip.textContent = v === 't' ? 'Left thumb: move and aim with the stick · right thumb: Attack, Smash, Special, Jump, Shield (tap = parry) · ULT when the meter is full · Emote + emoji wheel'
    : v === 'g' ? '🎮 Stick move / aim · A attack · RT or right-stick flick smash · B special · X/Y jump · LB/RB shield (tap = parry) · LT Ultimate · View taunt · L3/R3 emojis · Start pause'
    : typeof keyHintLine === 'function' ? keyHintLine() : 'A/D move · Space jump · Left click light · Right click smash (hold to charge) · Q special · E shield (tap = parry) · R Ultimate · G taunt · 1-8 emojis · aim with the mouse'; });   // (v18: your key binds)
  updateUltCutin();
}

/* The Ultimate cut-in: a slanted band slams across the screen during the cinematic freeze, with the move's name and
 * the fighter's, in the fighter's colour, over racing speed lines. DOM + CSS, so it looks the same in both renderers. */
function updateUltCutin() {
  const C = G.ultCine, on = !!C && G.mode !== 'menu' && (G.ultFreeze > 0 || (C.ph === 'active' && C.t < 10));
  const f = C ? fighters[C.id] : null;
  hset(HUD, 'cutOn', on ? 1 : 0, v => HUD.cut.classList.toggle('on', !!v));
  if (!on || !f) return;
  hset(HUD, 'cutKey', C.id + '|' + C.name + '|' + f.color, () => {
    HUD.cutName.textContent = C.name; HUD.cutWho.textContent = f.ch.name;
    HUD.cut.style.setProperty('--c', f.color); HUD.cut.style.setProperty('--c2', f.ch.alt || '#ffffff');
    HUD.cut.classList.toggle('r', f.id === 1);
  });
  const k = G.ultFreeze > 0 ? 1 - G.ultFreeze / ULT_INTRO : 1, out = C.ph === 'active' ? clamp(C.t / 10, 0, 1) : 0;
  hset(HUD, 'cutK', k.toFixed(2) + '|' + out.toFixed(2), () => { HUD.cut.style.setProperty('--k', k.toFixed(3)); HUD.cut.style.setProperty('--out', out.toFixed(3)); });
}
HUD.c = {};

/* (v16) The HUD never sits on top of the action:
 *   • every 15 frames the panels' real on-screen band is measured and published as HUD_SAFE (camera.js frames the fight in
 *     the free area above it — or below it when the touch HUD sits at the top);
 *   • every frame, a panel that has a fighter (or the boss hand) behind it fades to a ghost, so a fighter recovering
 *     from low down is never hidden behind the glass.
 * Presentation only: it reads G.cam (never the shaken view, whose shake draws random numbers).                     */
function hudSafeArea() {
  const cv = document.getElementById('game'); if (!cv) return;
  if (!HUD.rT || G.time - HUD.rT >= 15 || G.time < HUD.rT) {
    HUD.rT = G.time; const g = cv.getBoundingClientRect(); HUD.gr = g;
    const vis = HUD.panels.filter(P => P.root.offsetParent !== null && getComputedStyle(P.root).display !== 'none');
    HUD.rects = vis.map(P => ({ P, r: P.root.getBoundingClientRect() }));
    let b = 0, t = 0;
    if (g.height > 0) for (const { r } of HUD.rects) { if (r.top > g.top + g.height / 2) b = Math.max(b, (g.bottom - r.top) / g.height); else t = Math.max(t, (r.bottom - g.top) / g.height); }
    HUD_SAFE.b = clamp(b + (b ? 0.012 : 0), 0, 0.32); HUD_SAFE.t = clamp(t + (t ? 0.012 : 0), 0, 0.32);
  }
  const g = HUD.gr, c = G.cam; if (!g || !g.width || !c) return;
  const sx = wx => g.left + ((wx - c.x) * c.z + VIEW.LW / 2) / VIEW.LW * g.width, sy = wy => g.top + ((wy - c.y) * c.z + VIEW.LH / 2) / VIEW.LH * g.height;
  for (const { P, r } of HUD.rects || []) {
    let behind = false;
    for (const f of fighters) { if (f.state === 'dead') continue; const s = f.scale || 1;
      for (const dy of [-6, -32 * s, -64 * s]) { const x = sx(f.x), y = sy(f.y + dy); if (x > r.left - 14 && x < r.right + 14 && y > r.top - 10 && y < r.bottom + 10) { behind = true; break; } }
      if (behind) break; }
    hset(P, 'behind', behind ? 1 : 0, v => P.root.classList.toggle('behind', !!v));
  }
}

/* Live portrait: a private dummy (so the real fighter's springs aren't stepped twice) posed to match what the fighter
 * is doing, drawn into the panel's own small canvas at 20 fps. */
function drawPortrait(P, f, k) {
  let d = P.dummy;
  if (!d || d.ch !== f.ch) { d = P.dummy = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch: f.ch, name: '', color: f.color, fill: f.fill }; resetFighter(d, 0); }
  applySkin(d, f.ch, f.skin);
  const hit = f.hurt > 0 || f.state === 'hitstun' || f.state === 'stunned';
  poseDummy(d, hit ? 5 * 90 + 10 : f.state === 'attack' ? 2 * 90 + 6 : G.time % 90);
  if (hit) { d.rot = Math.sin(G.time * 0.6) * 0.25; d.hitFlash = f.hitFlash; }
  d.facing = k === 0 ? 1 : -1;
  const c2 = P.pctx, prev = ctx, S = 168 / 84;
  c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 168, 168); c2.setTransform(S, 0, 0, S, 0, 0);
  const g = c2.createRadialGradient(42, 32, 4, 42, 42, 46); g.addColorStop(0, rgba(f.color, hit ? 0.2 : 0.5)); g.addColorStop(1, hit ? 'rgba(255,40,60,0.45)' : 'rgba(0,0,0,0)');
  c2.fillStyle = g; c2.fillRect(0, 0, 84, 84);
  SHADE.lite = true; ctx = c2;
  try { c2.save(); c2.translate(42, 112); c2.scale(0.95, 0.95); drawFighter(d); c2.restore(); } finally { SHADE.lite = false; ctx = prev; }
}

// (kept for API compatibility: a big centred overlay message)
function drawOverlayCenter(big, small, color) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 30;
  txt(big, W / 2, H / 2 - 10, 120, color, 'center', 900, FONT_NUM); ctx.restore();
  if (small) txt(small, W / 2, H / 2 + 42, 24, '#d9dde8', 'center', 600);
}
