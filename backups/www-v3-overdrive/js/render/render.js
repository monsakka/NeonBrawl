/* NEON BRAWL — Frame render entry point + cinematic match overlays. */
'use strict';

/* ============================== RENDER ============================== */
// Storm Citadel: deterministic lightning flashes (0..1) that light up the whole arena
function stormFlash() {
  const cyc = Math.floor(G.time / 110), ph = G.time % 110;
  if (hash(cyc * 7.13) < 0.45 || ph > 14) return 0;
  return [1, 0.9, 0.3, 0.1, 0.7, 0.8, 0.2, 0.1, 0.4, 0.2, 0.1, 0.05, 0.05, 0, 0][ph];
}

function render() {
  ctx = mainCtx;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.filter = 'none';
  canvas.style.cursor = (G.mode === 'play' || G.mode === 'count' || G.mode === 'ending') && !G.paused ? 'crosshair' : 'default';

  // Sub-frame interpolation: the sim runs at a fixed 60 Hz; draw fighters + camera between the last two steps
  // so motion stays perfectly smooth on 90 / 120 / 144 Hz displays (teleports are not smeared).
  const a = G.mode === 'menu' || G.paused ? 1 : clamp(acc / STEP, 0, 1), saved = fighters.map(f => [f.x, f.y]), realCam = G.cam;
  if (a < 1) {
    for (const f of fighters) if (Math.hypot(f.x - f.px, f.y - f.py) < 60) { f.x = lerp(f.px, f.x, a); f.y = lerp(f.py, f.y, a); }
    if (G.pcam) G.cam = { x: lerp(G.pcam.x, realCam.x, a), y: lerp(G.pcam.y, realCam.y, a), z: lerp(G.pcam.z, realCam.z, a) };
  }

  if (G.mode === 'menu') { if (G.screen === 'scr-stage') drawBackground(); else drawMenuBackdrop(); }
  else { drawBackground(); drawAtmosphereBack(); }

  if (G.mode !== 'menu') {
    const c = G.cam, sk = G.shake * SET.shake, sa = G.shakeAng || 0;
    ctx.save();
    // multi-axis shake, biased along the direction of the last big launch
    const along = sk ? rand(-1, 1) * sk : 0, across = sk ? rand(-1, 1) * sk * 0.45 : 0;
    const shx = Math.cos(sa) * along - Math.sin(sa) * across, shy = Math.sin(sa) * along + Math.cos(sa) * across;
    ctx.translate(W / 2, H / 2); ctx.scale(c.z, c.z); ctx.translate(-c.x + shx, -c.y + shy);
    drawStage();
    drawHazards();
    drawShadows(); drawGadgets();
    for (const f of fighters) drawRespawnPad(f);
    for (const f of fighters) drawFighter(f);
    drawProjs(); drawFx(); drawAtmosphereFront(); drawAim(fighters[0]);
    ctx.restore();
    if (ST.id === 'abyss') underwaterWarp();
    if (ST.id === 'desert' || ST.id === 'caldera') heatHaze();          // Desert Mirage / Magma Caldera: heat-wave distortion
    if (ST.id === 'storm') { const fl = stormFlash(); if (fl > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(190,210,255,${fl * 0.28})`; ctx.fillRect(0, 0, W, H); ctx.restore(); } }
    {                                                                   // vignette framing: a soft dark border that pulls the eye to the fighters
      const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.42, W / 2, H / 2, H * 1.02);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
    const me = fighters[0];
    if (me && !me.cpu && me.blindT > 0) {                               // blinded by Orin's sun-lance: a white-out that clears from the centre
      const k = Math.min(1, me.blindT / 60), g = ctx.createRadialGradient(W / 2, H / 2, H * 0.15 * (1 - k * 0.6), W / 2, H / 2, H * 0.9);
      g.addColorStop(0, `rgba(255,250,230,${0.15 * k})`); g.addColorStop(1, `rgba(255,250,230,${0.85 * k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (G.vig > 0 && SET.flash) {                                       // red damage vignette when you get hit
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${G.vig * 0.55})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (G.mode === 'ending' && G.time - G.finishAt < 10 && SET.flash) {  // FINISH!: colour-inverted flash frame
      ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    drawOffscreenMarkers(); drawHUD();
    if (G.combo && G.mode !== 'ending') drawCombo(G.combo);
  }
  if (G.mode === 'count') drawBanner('READY...', `${fighters[0].ch.name}  vs  ${fighters[1].ch.name}  ·  ${ST.name}`, '#ffffff', G.countT / READY_T, false);
  else if (G.goT > 0) drawBanner('GO!', '', '#ffe14d', 1 - G.goT / 50, true);
  if (G.mode === 'ending') drawBanner('FINISH!', '', '#ff4d6d', clamp((G.time - G.finishAt) / 60, 0, 1), false);

  fighters.forEach((f, i) => { f.x = saved[i][0]; f.y = saved[i][1]; });
  G.cam = realCam;
}

// Big animated banner: a skewed light stripe slams in, text with chromatic-aberration fringes
function drawBanner(text, sub, color, u, outro) {
  const easeOutBack = x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const inK = clamp(u * 4, 0, 1), slide = easeOutBack(inK), fadeOut = outro ? clamp(1 - (u - 0.6) / 0.4, 0, 1) : 1;
  const y = H / 2 - 20, stripeX = (1 - slide) * -W * 1.2;
  ctx.save(); ctx.globalAlpha = fadeOut;
  ctx.translate(stripeX, 0);
  const g = ctx.createLinearGradient(0, y - 70, 0, y + 70);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(10,8,30,0.72)'); g.addColorStop(0.8, 'rgba(10,8,30,0.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-40, y - 66); ctx.lineTo(W + 40, y - 86); ctx.lineTo(W + 40, y + 66); ctx.lineTo(-40, y + 86); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.moveTo(-40, y - 66); ctx.lineTo(W + 40, y - 86); ctx.moveTo(-40, y + 86); ctx.lineTo(W + 40, y + 66); ctx.stroke();
  ctx.restore();
  // title: scale punch + RGB split
  const pop = 1 + 0.5 * Math.max(0, 1 - inK * 1.6) + (outro ? 0.25 * clamp((u - 0.6) / 0.4, 0, 1) : 0), jit = inK < 1 ? 6 : 2.5;
  ctx.save(); ctx.globalAlpha = fadeOut * clamp(inK * 2, 0, 1);
  ctx.translate(W / 2, y + 12); ctx.rotate(-0.03); ctx.scale(pop, pop);
  ctx.font = `900 112px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,40,90,0.75)'; ctx.fillText(text, -jit, 0);
  ctx.fillStyle = 'rgba(40,220,255,0.75)'; ctx.fillText(text, jit, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowColor = color; ctx.shadowBlur = 30; ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
  if (sub) { ctx.save(); ctx.globalAlpha = fadeOut * clamp(inK * 2 - 0.5, 0, 1); txt(sub, W / 2, y + 74, 22, '#d9dcff', 'center', 700); ctx.restore(); }
}

// "N-HIT COMBO!" counter on the attacker's side of the screen
function drawCombo(cb) {
  const age = 80 - cb.t, pop = 1 + 0.6 * Math.max(0, 1 - age / 8), fade = clamp(cb.t / 20, 0, 1);
  const x = cb.side === 0 ? 150 : W - 150, y = 150;
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(x + (age < 8 ? rand(-4, 4) : 0), y); ctx.rotate(cb.side === 0 ? -0.08 : 0.08); ctx.scale(pop, pop);
  ctx.font = `900 64px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = 8; ctx.strokeStyle = '#06061a'; ctx.strokeText(cb.n, 0, 0);
  ctx.shadowColor = cb.color; ctx.shadowBlur = 24; ctx.fillStyle = cb.color; ctx.fillText(cb.n, 0, 0);
  ctx.shadowBlur = 0; ctx.font = `900 20px ${FONT_NUM}`; ctx.lineWidth = 5; ctx.strokeText('HIT COMBO!', 0, 26); ctx.fillStyle = '#ffffff'; ctx.fillText('HIT COMBO!', 0, 26);
  ctx.restore();
}
