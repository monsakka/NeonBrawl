/* NEON BRAWL — Frame render entry point + cinematic match overlays. */
'use strict';

/* ============================== RENDER ============================== */
// Storm Citadel: deterministic lightning flashes (0..1) that light up the whole arena
function stormFlash() {
  const cyc = Math.floor(G.time / 110), ph = G.time % 110;
  if (hash(cyc * 7.13) < 0.45 || ph > 14) return 0;
  return [1, 0.9, 0.3, 0.1, 0.7, 0.8, 0.2, 0.1, 0.4, 0.2, 0.1, 0.05, 0.05, 0, 0][ph];
}

// Full-bleed transforms: "safe" = the 1280 × 720 design area centred in the view; "cover" = the design area scaled up to
// cover the whole view (used for painted backgrounds, so no screen edge is ever left empty).
function safeTransform() { ctx.setTransform(DPR, 0, 0, DPR, DPR * VIEW.OX, DPR * VIEW.OY); }
function coverTransform() { const s = Math.max(VIEW.LW / W, VIEW.LH / H); ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (VIEW.LW - W * s) / 2, DPR * (VIEW.LH - H * s) / 2); }
// Fill the whole view (in safe-area coordinates)
function fillView(style) { ctx.fillStyle = style; ctx.fillRect(-VIEW.OX, -VIEW.OY, VIEW.LW, VIEW.LH); }

let FRAME_CAM = null;                                               // this frame's camera sample (shake is random: sample it once)
// Canvas fallback for the social layer: emoji glyphs popping over heads, simple glass nameplates (the 3D versions: render/emotes3d.js)
function drawSocial2D() {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const e of EMOJI_FX) { const f = e.f, age = G.time - e.born, k = age < 12 ? age / 12 : 1, a = age > EMOJI_LIFE - 20 ? (EMOJI_LIFE - age) / 20 : 1;
    ctx.globalAlpha = Math.max(0, a); ctx.font = `${Math.round(34 * k)}px ${FONT}`; ctx.fillText(EMOJIS[e.i].glyph, f.x, f.y - BODY_H - 104 - age * 0.22); }
  ctx.globalAlpha = 1;
  if (SET.plates !== false && G.mode !== 'menu') fighters.forEach((f, k) => { if (f.state === 'dead' || f.hand) return;
    const info = plateInfo(f, k), y = f.y - BODY_H - 46, line = (info.title ? info.title + ' ' : '') + info.name; ctx.font = `900 13px ${FONT_NUM}`; const w = Math.max(70, ctx.measureText(line).width + 22);
    ctx.fillStyle = 'rgba(6,8,22,0.78)'; ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(f.x - w / 2, y - 14, w, 28, 8) : ctx.rect(f.x - w / 2, y - 14, w, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(line, f.x, y - 4); ctx.font = `800 8px ${FONT}`; ctx.fillStyle = f.color; ctx.fillText(info.sub, f.x, y + 8); });
  ctx.restore();
}
function render() {
  ctx = mainCtx;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.filter = 'none';
  canvas.style.cursor = (G.mode === 'play' || G.mode === 'count' || G.mode === 'ending') && !G.paused ? 'crosshair' : 'default';

  // Sub-frame interpolation: the sim runs at a fixed 60 Hz; draw fighters + camera between the last two steps
  // so motion stays perfectly smooth on 90 / 120 / 144 Hz displays (teleports are not smeared).
  const a = G.mode === 'menu' || G.paused ? 1 : clamp(acc / STEP, 0, 1), saved = fighters.map(f => [f.x, f.y]), realCam = G.cam;
  if (a < 1) {
    for (const f of fighters) if (Math.hypot(f.x - f.px, f.y - f.py) < 60) { f.x = lerp(f.px, f.x, a); f.y = lerp(f.py, f.y, a); }
    if (G.pcam) G.cam = { x: lerp(G.pcam.x, realCam.x, a), y: lerp(G.pcam.y, realCam.y, a), z: lerp(G.pcam.z, realCam.z, a) };
  }
  FRAME_CAM = G.mode === 'menu' ? null : viewCam();
  try {
    if (RENDER3D.active()) render3D();                                 // WebGL 2.5D renderer (render/render3d.js)
    else renderCanvas();
  } finally {
    fighters.forEach((f, i) => { f.x = saved[i][0]; f.y = saved[i][1]; });
    G.cam = realCam; FRAME_CAM = null;
  }
}

// The classic renderer: everything painted with Canvas 2D
function renderCanvas() {
  // intro splash: a WebGL particle field behind the HTML title (the 2D canvas stays transparent on top)
  if (G.mode === 'menu' && G.screen === 'scr-intro' && SET.renderer === 'webgl' && !GL3D.failed && glIntro(G.time)) {
    if (typeof intro15 === 'function') intro15(G.time);                    // v15: the 3D cold open (render/intro15.js)
    RENDER3D.show(true); RENDER_FLAGS.shield3D = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  RENDER3D.show(false);
  coverTransform();
  if (G.mode === 'menu') { if (G.screen === 'scr-stage') drawBackground(); else drawMenuBackdrop(); }
  else { drawBackground(); safeTransform(); drawAtmosphereBack(); }
  safeTransform();

  if (G.mode !== 'menu') {
    ctx.save();
    worldTransform();
    drawStage();
    drawHazards();
    drawShadows(); drawGadgets();
    drawUlt2D('back');                                                  // an Ultimate's cinematic darkens the stage behind the fighters (render/ultfx.js)
    for (const f of fighters) drawRespawnPad(f);
    { const T0 = G.time; G.time = T0 - (G.hsLag || 0); try { for (const f of fighters) drawFighter(f); } finally { G.time = T0; } }
    drawProjs(); drawFx(); drawUlt2D('front'); drawChal2D(); if (typeof drawMinigame2D === 'function') drawMinigame2D(); drawAtmosphereFront(); drawHitboxes(); drawAim(localFighter()); drawSocial2D();
    ctx.restore();
    if (ST.id === 'abyss') underwaterWarp();
    if (ST.id === 'desert' || ST.id === 'caldera') heatHaze();          // Desert Mirage / Magma Caldera: heat-wave distortion
    drawKOFX2D(false);
    drawScreenOverlays();
  }
  drawBanners();
}

// Camera → canvas transform for world drawing (shared by the canvas renderer and the 2D overlay of the WebGL renderer,
// so overlay effects land exactly on the 3D world): shake, smash zoom and roll included (viewCam in camera.js).
function worldTransform() {
  const v = FRAME_CAM || viewCam();
  ctx.translate(W / 2, H / 2); if (v.roll) ctx.rotate(v.roll); ctx.scale(v.z, v.z); ctx.translate(-v.x, -v.y);
}

// Screen-space overlays drawn on top of the world (safe-area coordinates; fills cover the whole view)
function drawScreenOverlays(skipVignette) {
  drawEmergency();
  if (ST.id === 'storm') { const fl = stormFlash(); if (fl > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fillView(`rgba(190,210,255,${fl * 0.28})`); ctx.restore(); } }
  if (!skipVignette) {                                                // vignette framing: a soft dark border that pulls the eye to the fighters
    const R = Math.max(VIEW.LW, VIEW.LH * 1.6) * 0.5, g = ctx.createRadialGradient(W / 2, H * 0.48, R * 0.52, W / 2, H / 2, R * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)'); fillView(g);
  }
  if (G.flash > 0) fillView(`rgba(255,255,255,${G.flash * 0.35})`);
  const me = fighters[0];
  if (me && !me.cpu && me.blindT > 0) {                               // blinded by Orin's sun-lance: a white-out that clears from the centre
    const k = Math.min(1, me.blindT / 60), g = ctx.createRadialGradient(W / 2, H / 2, H * 0.15 * (1 - k * 0.6), W / 2, H / 2, H * 0.9);
    g.addColorStop(0, `rgba(255,250,230,${0.15 * k})`); g.addColorStop(1, `rgba(255,250,230,${0.85 * k})`); fillView(g);
  }
  if (G.vig > 0 && SET.flash) {                                       // red damage vignette when you get hit
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(H * 0.95, VIEW.LW * 0.55));
    g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${G.vig * 0.55})`); fillView(g);
  }
  if (G.mode === 'ending' && G.time - G.finishAt < 10 && SET.flash) {  // FINISH!: colour-inverted flash frame
    ctx.save(); ctx.globalCompositeOperation = 'difference'; fillView('#ffffff'); ctx.restore();
  }
  drawOffscreenMarkers();
  if (G.combo && G.mode !== 'ending') drawCombo(G.combo);
}
function drawBanners() {
  if (G.mode === 'count') { if (G.suddenDeath) drawBanner('SUDDEN DEATH', 'One stock each · 300% · next KO wins', '#ff3048', G.countT / READY_T, false);
    else drawBanner('READY...', `${fighters[0].ch.name}  vs  ${fighters[1].ch.name}  ·  ${ST.name}`, '#ffffff', G.countT / READY_T, false); }
  else if (G.goT > 0) drawBanner('GO!', '', '#ffe14d', 1 - G.goT / 50, true);
  if (G.mode === 'ending') drawBanner(G.endText || (G.timeUp ? 'TIME!' : G.sdNext ? 'DRAW!' : 'GAME!'), G.sdNext ? 'Sudden Death next' : '', G.timeUp ? '#ffd23a' : '#ff4d6d', clamp((G.time - G.finishAt) / 60, 0, 1), false);
}
// Sudden Death emergency lighting: a pulsing red wash and two sweeping alarm beacons
function drawEmergency() {
  if (!G.suddenDeath) return;
  const p = 0.5 + 0.5 * Math.sin(G.time * 0.22);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(VIEW.LW, VIEW.LH) * 0.7);
  g.addColorStop(0, 'rgba(255,20,40,0)'); g.addColorStop(1, `rgba(255,20,40,${0.12 + 0.2 * p})`); fillView(g);
  for (const sx of [-VIEW.OX + 30, W + VIEW.OX - 30]) {
    const a = G.time * 0.09 * (sx < W / 2 ? 1 : -1);
    ctx.fillStyle = `rgba(255,40,50,${0.1 + 0.08 * p})`; ctx.beginPath(); ctx.moveTo(sx, -VIEW.OY + 10);
    ctx.arc(sx, -VIEW.OY + 10, VIEW.LH * 0.9, Math.PI / 2 + Math.sin(a) * 0.9 - 0.18, Math.PI / 2 + Math.sin(a) * 0.9 + 0.18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,80,90,${0.6 + 0.4 * p})`; ctx.beginPath(); ctx.arc(sx, -VIEW.OY + 10, 8, 0, TAU); ctx.fill();
  }
  ctx.restore();
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
