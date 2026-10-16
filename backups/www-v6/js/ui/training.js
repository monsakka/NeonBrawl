/* NEON BRAWL — Holographic Training mode.
 *   Main menu → Training → pick your fighter and a dummy → the Holo Training Grid. No stocks are lost, there is no
 *   time limit, and a glass panel controls the practice dummy (stand · walk · jump · shield · attack · full CPU at any
 *   level), its damage, positions, and a hitbox overlay: the exact rectangles the combat code tests (red = attacks,
 *   amber = grabs), projectiles (red circles) and every hurtbox (green), drawn over the 3D models. */
'use strict';

const TRAIN_AIS = [['stand', 'Stand'], ['walk', 'Walk'], ['jump', 'Jump'], ['shield', 'Shield'], ['attack', 'Attack'], ['cpu', 'CPU']];

// The dummy's scripted behaviours (anything but 'cpu', which hands the dummy to the real AI)
function trainingInput(f, o) {
  const i = emptyInput(), t = G.frame;
  switch (TRAIN.ai) {
    case 'walk': {
      let dir = Math.floor(t / 100) % 2 ? 1 : -1;
      if (f.x < STAGE.x + 90) dir = 1; else if (f.x > STAGE.x + STAGE.w - 90) dir = -1;
      i.left = dir < 0; i.right = dir > 0; break;
    }
    case 'jump': i.jumpP = t % 70 === 0 || t % 70 === 22; i.jump = t % 70 < 10; break;
    case 'shield': i.shield = true; break;
    case 'attack': {
      i.aimX = o.x - f.x; i.aimY = (o.y - 32) - (f.y - 32);
      if (Math.abs(o.x - f.x) > 70) { i.left = o.x < f.x; i.right = o.x > f.x; }
      i.lightP = t % 36 === 0; i.heavyP = t % 150 === 75; i.heavy = t % 150 >= 75 && t % 150 < 95; break;
    }
  }
  return i;
}

function startTraining() {
  G.training = true;
  const keep = { stage: SEL.stage, rand: SEL.randStage, hz: SEL.hazards, time: SEL.time };
  SEL.stage = 'training'; SEL.randStage = false; SEL.hazards = false; SEL.time = 0;
  try { startMatch(); } finally { SEL.stage = keep.stage; SEL.randStage = keep.rand; SEL.hazards = keep.hz; SEL.time = keep.time; }
  G.mode = 'play'; G.countT = READY_T; G.goT = 30;                     // no countdown in training
  refreshTrainPanel(); document.getElementById('train-panel').classList.add('show');
}
function trainReset() {
  fighters.forEach((f, i) => { const p = f.percent; resetFighter(f, ST.spawns[i]); f.facing = i ? -1 : 1; f.percent = i ? p : 0; });
  fx.length = 0; projs.length = 0; G.combo = null;
}

/* ---- the glass control panel ---- */
(function buildTrainPanel() {
  const el = document.createElement('aside'); el.id = 'train-panel'; el.className = 'trainp';
  el.innerHTML = `<h4>Training <small>holo grid</small></h4>
    <label>Dummy</label><div class="seg tp-ai">${TRAIN_AIS.map(([k, l]) => `<button data-tai="${k}">${l}</button>`).join('')}</div>
    <div class="tp-cpu"><label>CPU level</label><div class="seg">${DIFFS.map((d, i) => `<button data-tlv="${i}">${d.name}</button>`).join('')}</div></div>
    <label>Dummy damage</label><div class="seg">${[0, 50, 100, 150, 200].map(p => `<button data-tpct="${p}">${p}%</button>`).join('')}</div>
    <div class="tp-row"><button class="btn small" data-tact="hitboxes" id="tp-hb">Hitboxes: On</button><button class="btn small" data-tact="reset">Reset positions</button></div>
    <div class="tp-row"><button class="btn small" data-tact="exit">Exit training</button></div>
    <p class="tp-legend"><i class="lg-hit"></i>attack <i class="lg-grab"></i>grab <i class="lg-hurt"></i>hurtbox · <kbd>H</kbd> hitboxes · <kbd>R</kbd> reset</p>`;
  document.getElementById('ui').appendChild(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.tai) TRAIN.ai = d.tai;
    else if (d.tlv !== undefined) { SEL.diff = +d.tlv; G.diff = SEL.diff; }
    else if (d.tpct !== undefined) { const v = fighters[1]; v.percent = +d.tpct; v.percentPop = 14; }
    else if (d.tact === 'hitboxes') TRAIN.hitboxes = !TRAIN.hitboxes;
    else if (d.tact === 'reset') trainReset();
    else if (d.tact === 'exit') go('scr-main');
    refreshTrainPanel(); canvas.focus();
  });
})();
function refreshTrainPanel() {
  const el = document.getElementById('train-panel');
  el.querySelectorAll('[data-tai]').forEach(b => b.classList.toggle('on', b.dataset.tai === TRAIN.ai));
  el.querySelectorAll('[data-tlv]').forEach(b => b.classList.toggle('on', +b.dataset.tlv === G.diff));
  el.querySelector('.tp-cpu').style.display = TRAIN.ai === 'cpu' ? '' : 'none';
  el.querySelector('#tp-hb').textContent = 'Hitboxes: ' + (TRAIN.hitboxes ? 'On' : 'Off');
}
// keep the panel only while a training match is on screen (and not behind the pause card)
function updateTrainPanel() {
  const el = document.getElementById('train-panel'), on = G.training && G.mode !== 'menu' && !G.paused;
  if (el.classList.contains('show') !== on) el.classList.toggle('show', on);
}
// Training keyboard shortcuts: H = hitbox overlay, R = reset positions
window.addEventListener('keydown', e => {
  if (!G.training || G.mode === 'menu' || G.paused || e.repeat) return;
  if (e.code === 'KeyH') { TRAIN.hitboxes = !TRAIN.hitboxes; refreshTrainPanel(); }
  else if (e.code === 'KeyR') trainReset();
});

/* ---- hitbox / hurtbox overlay (world transform active; both renderers) ---- */
function drawHitboxes() {
  if (!((G.training && TRAIN.hitboxes) || SET.hitboxes)) return;
  ctx.save(); ctx.lineWidth = 2; ctx.globalCompositeOperation = 'source-over';
  const box = (r, fill, stroke) => { ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = stroke; ctx.strokeRect(r.x, r.y, r.w, r.h); };
  for (const f of fighters) {
    if (f.state === 'dead') continue;
    box(bodyRect(f), 'rgba(40,255,120,0.16)', 'rgba(60,255,140,0.9)');                                 // hurtbox (green)
    if (f.state === 'shield') { ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.beginPath(); ctx.arc(f.x, f.y - 32, shieldR(f), 0, TAU); ctx.stroke(); }
  }
  for (const h of HITBOX_LOG) h.kind === 'grab' ? box(h, 'rgba(255,190,40,0.22)', 'rgba(255,200,60,0.95)') : box(h, 'rgba(255,40,60,0.28)', 'rgba(255,60,80,1)');   // attacks (red) / grabs (amber)
  for (const p of projs) { const r = p.r || p.rad || p.size || 10; ctx.fillStyle = 'rgba(255,40,60,0.25)'; ctx.strokeStyle = 'rgba(255,60,80,1)'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
