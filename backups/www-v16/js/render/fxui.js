/* NEON BRAWL — In-match text as an HTML/CSS layer (WebGL renderer): damage / status pop-ups that follow their
 * point in the 3D world, the "N HIT COMBO!" counter, the READY / GO! / GAME! / TIME! / SUDDEN DEATH banners and
 * the off-screen fighter markers. Text is UI, so it lives in the DOM (crisp at any resolution, styled with CSS);
 * the canvas renderer keeps drawing its own versions. Nothing here touches the simulation.                     */
'use strict';

const FXUI = { el: null, pops: [], used: new Map(), marks: [], shown: false };
(function buildFXUI() {
  const wrap = document.getElementById('wrap'), el = document.createElement('div');
  el.id = 'fxui'; el.className = 'fxui';
  el.innerHTML = `<div class="fxu-marks"><div class="fxu-mark"><i></i><b></b></div><div class="fxu-mark"><i></i><b></b></div></div>
    <div class="fxu-combo"><b></b><small>HIT COMBO!</small></div><div class="fxu-combo r"><b></b><small>HIT COMBO!</small></div>
    <div class="fxu-banner"><div class="fxu-stripe"></div><h2></h2><p></p></div>`;
  wrap.insertBefore(el, document.getElementById('hud') || document.getElementById('touch'));
  FXUI.el = el; FXUI.marks = [...el.querySelectorAll('.fxu-mark')]; FXUI.combos = [...el.querySelectorAll('.fxu-combo')];
  FXUI.banner = el.querySelector('.fxu-banner'); FXUI.bt = FXUI.banner.querySelector('h2'); FXUI.bs = FXUI.banner.querySelector('p');
})();
const safeToCss = (sx, sy) => [(sx + VIEW.OX) * VIEW.u, (sy + VIEW.OY) * VIEW.u];
function fxuiPop() { let e = FXUI.pops.pop(); if (!e) { e = document.createElement('div'); e.className = 'fxu-pop'; FXUI.el.appendChild(e); } e.style.display = ''; return e; }

function updateFXUI(on) {
  const show = on && G.mode !== 'menu';
  if (show !== FXUI.shown) { FXUI.shown = show; FXUI.el.classList.toggle('show', show); }
  if (!show) { for (const [p, e] of FXUI.used) { e.style.display = 'none'; FXUI.pops.push(e); } FXUI.used.clear(); return; }
  // pop-ups: one element per live text effect, pinned to its world point
  const live = new Set();
  for (const p of fx) {
    if (p.type !== 'text') continue; live.add(p);
    let e = FXUI.used.get(p); if (!e) { e = fxuiPop(); e.textContent = p.text; e.style.setProperty('--c', p.color); FXUI.used.set(p, e); }
    const t = clamp(p.life / p.max, 0, 1), s = projectToSafe(p.x, -p.y, 30), c = safeToCss(s[0], s[1]), pop = 1 + 0.5 * Math.max(0, (t - 0.85) / 0.15);
    e.style.transform = `translate(${c[0].toFixed(1)}px,${c[1].toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`; e.style.opacity = clamp(t * 2, 0, 1).toFixed(2);
  }
  for (const [p, e] of FXUI.used) if (!live.has(p)) { e.style.display = 'none'; FXUI.pops.push(e); FXUI.used.delete(p); }
  // combo counter on the attacker's side
  const cb = G.combo && G.mode !== 'ending' ? G.combo : null;
  FXUI.combos.forEach((e, i) => {
    const on2 = !!cb && cb.side === i; e.style.display = on2 ? '' : 'none'; if (!on2) return;
    const age = 80 - cb.t, pop = 1 + 0.6 * Math.max(0, 1 - age / 8);
    e.querySelector('b').textContent = cb.n; e.style.setProperty('--c', cb.color); e.style.opacity = clamp(cb.t / 20, 0, 1).toFixed(2);
    e.style.transform = `rotate(${i ? 5 : -5}deg) scale(${pop.toFixed(2)})`;
  });
  // banners
  let text = '', sub = '', color = '#ffffff', u = 0, outro = false;
  if (G.mode === 'count') { u = G.countT / READY_T; if (G.suddenDeath) { text = 'SUDDEN DEATH'; sub = 'One stock each · 300% · next KO wins'; color = '#ff3048'; }
    else { text = 'READY...'; sub = `${fighters[0].ch.name}  vs  ${fighters[1].ch.name}  ·  ${ST.name}`; } }
  else if (G.goT > 0) { text = 'GO!'; color = '#ffe14d'; u = 1 - G.goT / 50; outro = true; }
  if (G.mode === 'ending') { text = G.endText || (G.timeUp ? 'TIME!' : G.sdNext ? 'DRAW!' : 'GAME!'); sub = G.sdNext ? 'Sudden Death next' : ''; color = G.timeUp ? '#ffd23a' : '#ff4d6d'; u = clamp((G.time - G.finishAt) / 60, 0, 1); outro = false; }
  const B = FXUI.banner;
  if (!text) { if (B.style.display !== 'none') B.style.display = 'none'; }
  else {
    if (B.style.display === 'none') B.style.display = '';
    if (FXUI.bt.textContent !== text) FXUI.bt.textContent = text; if (FXUI.bs.textContent !== sub) FXUI.bs.textContent = sub;
    B.style.setProperty('--c', color);
    const inK = clamp(u * 4, 0, 1), ease = 1 + 2.2 * Math.pow(inK - 1, 3) + 1.2 * Math.pow(inK - 1, 2), fade = outro ? clamp(1 - (u - 0.6) / 0.4, 0, 1) : 1;
    const popS = 1 + 0.5 * Math.max(0, 1 - inK * 1.6) + (outro ? 0.25 * clamp((u - 0.6) / 0.4, 0, 1) : 0);
    B.style.opacity = fade.toFixed(2); B.style.setProperty('--slide', ((1 - ease) * -120).toFixed(1) + 'vw'); B.style.setProperty('--pop', popS.toFixed(3));
    B.style.setProperty('--sub', clamp(inK * 2 - 0.5, 0, 1).toFixed(2)); B.style.setProperty('--title', clamp(inK * 2, 0, 1).toFixed(2));
  }
  // off-screen markers: an arrow at the screen edge pointing at a fighter outside the view
  fighters.forEach((f, i) => {
    const e = FXUI.marks[i]; if (!e) return;
    let vis = false;
    if (f.state !== 'dead' && f.state !== 'respawn') {
      const s = projectToSafe(f.x, -(f.y - 32), 0), x0 = -VIEW.OX, x1 = W + VIEW.OX, y0 = -VIEW.OY, y1 = H + VIEW.OY, m = 34;
      if (!(s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1 - 130)) {
        vis = true; const px = clamp(s[0], x0 + m, x1 - m), py = clamp(s[1], y0 + m, y1 - 150), a = Math.atan2(s[1] - py, s[0] - px), c = safeToCss(px, py);
        e.style.transform = `translate(${c[0].toFixed(1)}px,${c[1].toFixed(1)}px)`; e.querySelector('i').style.transform = `translate(-50%,-50%) rotate(${a.toFixed(3)}rad)`;
        e.style.setProperty('--c', f.color); const b = e.querySelector('b'); if (b.textContent !== f.name) b.textContent = f.name;
      }
    }
    if (e.classList.contains('on') !== vis) e.classList.toggle('on', vis);
  });
}
