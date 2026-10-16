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
    <div class="hp-shield"><div class="hp-bar thin"><i></i></div></div></div></div>`;
  el.innerHTML = panel(0) + panel(1) + `<div class="hud-tip"></div>`;
  wrap.insertBefore(el, document.getElementById('touch'));
  HUD.el = el; HUD.tip = el.querySelector('.hud-tip');
  HUD.panels = [...el.querySelectorAll('.hp')].map(p => ({
    root: p, port: p.querySelector('.hp-port'), pctx: p.querySelector('.hp-port').getContext('2d'), name: p.querySelector('.hp-name'), sub: p.querySelector('.hp-sub'),
    stocks: [...p.querySelectorAll('.hp-stocks i')], num: p.querySelector('.hp-num'), ghost: p.querySelector('.hp-ghost'),
    resL: p.querySelector('.hp-res small'), res: p.querySelector('.hp-res i'), resW: p.querySelector('.hp-res'),
    launchL: p.querySelector('.hp-launch small'), launch: p.querySelector('.hp-launch i'), shield: p.querySelector('.hp-shield i'),
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
    hset(P, 'sub', f.cpu ? 'CPU · ' + DIFFS[G.diff].name.toUpperCase() : 'PLAYER 1', v => { P.sub.textContent = v; });
    // % counter: cyan → green → yellow → orange → red, glow grows with damage; pops on each hit, shakes while hurt
    const pc = Math.floor(f.percent), tt = clamp(f.percent / 200, 0, 1);
    hset(P, 'pc', pc, v => { P.num.textContent = v; P.ghost.textContent = '8'.repeat(String(v).length); });
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
    const sf = clamp(f.shield / 100, 0, 1), low = sf < 0.3;
    hset(P, 'shield', sf.toFixed(3), v => { P.shield.style.transform = `scaleX(${v})`; });
    hset(P, 'slow', (f.state === 'stunned' ? 's' : low ? 'l' : 'n'), v => { P.root.classList.toggle('shield-low', v === 'l'); P.root.classList.toggle('stunned', v === 's'); });
    if (drawPorts) drawPortrait(P, f, k);
  });
  // control reminder during the countdown and the first seconds
  const showTip = G.mode === 'count' || (G.mode === 'play' && G.frame < 480), a = G.mode === 'count' ? 1 : clamp((480 - G.frame) / 60, 0, 1);
  hset(HUD, 'tipA', showTip ? a.toFixed(2) : '0', v => { HUD.tip.style.opacity = v; });
  hset(HUD, 'tipT', TOUCH.using ? 't' : 'k', v => { HUD.tip.textContent = v === 't' ? 'Left thumb: move and aim with the stick · right thumb: Attack, Smash, Special, Jump, Shield (tap = parry)'
    : 'A/D move · Space jump · Left click light · Right click smash (hold to charge) · Q special · E shield (tap = parry) · aim with the mouse'; });
}
HUD.c = {};

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
