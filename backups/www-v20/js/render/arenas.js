/* NEON BRAWL — Arena backgrounds (part 2): the 4-layer parallax arenas.
 *   L0 atmosphere : sky / interior gradient, light sources, fog
 *   L1 far        : silhouettes that scroll slowly with the camera (parallax ~0.03-0.05)
 *   L2 midground  : lit props, light shafts and particles drawn with 'lighter' (parallax ~0.08-0.12)
 *   L3 foreground : the stage itself (stage.js) + the in-match vignette (render.js)
 * Loaded before backgrounds.js, which registers these in BACKGROUNDS. Helpers (hash, skyGradient, cleanVignette) live there. */
'use strict';

const AR = {                                                           // per-arena particle / prop seeds
  motes: Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.2, 0.8), s: rand(1, 2.6), ph: Math.random() * 6.28, d: rand(0.3, 1) })),
  petals: Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.5, 1.2), s: rand(2.5, 5), ph: Math.random() * 6.28, r: Math.random() * 6.28 })),
  islands: Array.from({ length: 7 }, (_, i) => ({ x: i * 300 + rand(-60, 60), y: rand(0.2, 0.55), w: rand(90, 200), d: rand(0.2, 1), ph: Math.random() * 6.28 })),
  ghosts: Array.from({ length: 5 }, (_, i) => ({ x: rand(0, 1400), y: rand(0.3, 0.7), sp: rand(0.15, 0.4), ph: Math.random() * 6.28 })),
  jelly: Array.from({ length: 9 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.15, 0.45), s: rand(10, 24), ph: Math.random() * 6.28, hue: [190, 300, 160, 330][(Math.random() * 4) | 0] })),
  drips: Array.from({ length: 12 }, () => ({ x: Math.random(), ph: Math.random() * 200, h: rand(0.1, 0.35) })),
  bubbles: Array.from({ length: 30 }, () => ({ x: Math.random(), ph: Math.random() * 100, s: rand(2, 6) })),
  stars: Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.5, 2), d: Math.random() }))
};
const wrapX = (x, span) => ((x % span) + span) % span;
// Pre-render a static layer once into an offscreen canvas (at 2× for sharpness) and reuse it every frame
const LAYER_CACHE = {};
function cachedLayer(key, w, h, draw) {
  let c = LAYER_CACHE[key];
  if (!c) {
    c = LAYER_CACHE[key] = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const saved = ctx; ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); draw(); ctx = saved;
  }
  return c;
}

/* ---------------- Neon Dojo: lit shoji walls, neon strip lights, holographic training dummies ---------------- */
function bgDojo() {
  const t = G.time, c = G.cam;
  skyGradient(['#0c0a1a', '#1a1230', '#120c18']);                                      // L0
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [y, col] of [[40, '#ff4fd8'], [62, '#22d0ff']]) { const g = ctx.createLinearGradient(0, y - 10, 0, y + 40); g.addColorStop(0, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(0, y, W, 40); ctx.fillStyle = col; ctx.fillRect(0, y, W, 2); }
  ctx.restore();
  const ox = -c.x * 0.04, wy = 110, wh = 330;                                            // L1: shoji screen wall with wooden beams
  for (let i = -1; i < 10; i++) {
    const x = wrapX(i * 170 + ox, 1700) - 170;
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#f4e2b8'); g.addColorStop(1, '#c89a5a');
    ctx.globalAlpha = 0.28; ctx.fillStyle = g; ctx.fillRect(x + 8, wy, 154, wh); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(30,18,8,0.9)'; ctx.lineWidth = 3; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 8 + k * 38.5, wy); ctx.lineTo(x + 8 + k * 38.5, wy + wh); ctx.stroke(); }
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x + 8, wy + k * 55); ctx.lineTo(x + 162, wy + k * 55); ctx.stroke(); }
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(x, wy - 14, 170, 14); ctx.fillRect(x, wy, 8, wh);
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: holographic training dummies
  for (let i = 0; i < 4; i++) {
    const x = wrapX(i * 360 + 120 - c.x * 0.1, 1440) - 100, y = 360 + Math.sin(t * 0.04 + i) * 4, a = 0.35 + 0.15 * Math.sin(t * 0.1 + i * 2);
    ctx.strokeStyle = `rgba(80,230,255,${a})`; ctx.fillStyle = `rgba(80,230,255,${a * 0.25})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 92, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); rr(x - 16, y - 76, 32, 46, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y + 30); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y + 30, 22, 5, 0, 0, Math.PI * 2); ctx.stroke();
    for (let s = y - 106; s < y + 30; s += 5) { ctx.fillStyle = `rgba(80,230,255,${a * 0.3})`; ctx.fillRect(x - 18, s + (t % 5), 36, 1); }   // scanlines
  }
  for (const m of AR.motes) { const x = wrapX(m.x * W - c.x * 0.08 * m.d, W), y = wrapX(m.y * H - t * m.v * 0.3, H); ctx.fillStyle = `rgba(255,230,190,${0.15 * m.d})`; ctx.fillRect(x, y, m.s, m.s); }
  ctx.restore();
  cleanVignette(0.45);
}

/* ---------------- Floating Archipelago: bright sky, drifting islands with waterfalls, cloud packs, sun rays ---------------- */
function bgArchipelago() {
  const t = G.time, c = G.cam;
  skyGradient(['#3a8ae0', '#7ec0ff', '#cfe8ff']);                                         // L0
  const sx = W * 0.75 - c.x * 0.01, sy = 110, sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 300);
  sg.addColorStop(0, 'rgba(255,255,230,0.95)'); sg.addColorStop(0.15, 'rgba(255,250,210,0.5)'); sg.addColorStop(1, 'rgba(255,250,210,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  for (const is of AR.islands) {                                                         // L1: floating islands
    const x = wrapX(is.x - c.x * 0.03 * (0.5 + is.d), 2100) - 300, y = is.y * H + Math.sin(t * 0.01 + is.ph) * 6, w = is.w * (0.5 + is.d * 0.5), fade = 0.35 + is.d * 0.45;
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#7a6a8a'; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w * 0.2, y + w * 0.55, x, y + w * 0.7); ctx.quadraticCurveTo(x + w * 0.25, y + w * 0.5, x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fbf6a'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, w * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x - w * 0.18, y - w * 0.3, w * 0.06, w * 0.3); ctx.fillRect(x + w * 0.1, y - w * 0.22, w * 0.06, w * 0.22); ctx.fillRect(x - w * 0.2, y - w * 0.32, w * 0.4, w * 0.04);   // ruined columns
    const wg = ctx.createLinearGradient(0, y, 0, y + 160); wg.addColorStop(0, 'rgba(230,248,255,0.8)'); wg.addColorStop(1, 'rgba(230,248,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(x + w * 0.3, y, 5, 160);                            // waterfall spilling off the edge
    ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: sun rays
  for (let i = 0; i < 5; i++) { const a = 1.9 + i * 0.16 + Math.sin(t * 0.004 + i) * 0.03; ctx.fillStyle = 'rgba(255,255,230,0.06)'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.05) * 1400, sy + Math.sin(a - 0.05) * 1400); ctx.lineTo(sx + Math.cos(a + 0.05) * 1400, sy + Math.sin(a + 0.05) * 1400); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  for (const cl of BG.clouds) {                                                          // L2: drifting cloud packs (soft white volumes)
    const x = wrapX(cl.x + t * cl.speed * 0.4 - c.x * 0.08 * (0.5 + cl.layer), 1900) - 300, y = H * (0.45 + cl.y * 0.5);
    for (let k = 0; k < 3; k++) { const g = ctx.createRadialGradient(x + k * cl.w * 0.22, y - 8, 4, x + k * cl.w * 0.22, y, cl.w * 0.3); g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + k * cl.w * 0.22, y, cl.w * 0.3, cl.h, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = 'rgba(40,50,80,0.6)'; ctx.lineWidth = 1.5;                            // birds
  for (let i = 0; i < 4; i++) { const x = wrapX(i * 320 + t * 0.8, W + 100) - 50, y = 150 + i * 30 + Math.sin(t * 0.05 + i) * 10, f = Math.sin(t * 0.3 + i) * 4; ctx.beginPath(); ctx.moveTo(x - 7, y - f); ctx.lineTo(x, y); ctx.lineTo(x + 7, y - f); ctx.stroke(); }
  cleanVignette(0.25);
}

/* ---------------- Haunted Manor: moonlit gothic windows, portraits, candelabras, drifting spectres, ground fog ---------------- */
function bgManor() {
  const t = G.time, c = G.cam;
  skyGradient(['#0a0612', '#1a1024', '#0c0810']);                                         // L0
  const ox = -c.x * 0.04;
  for (let i = 0; i < 5; i++) {                                                           // L1: tall gothic windows with moonlight, portraits between
    const x = wrapX(i * 300 + 80 + ox, 1500) - 150, y = 90, w = 90, h = 260;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(150,170,255,0.35)'); g.addColorStop(1, 'rgba(60,70,140,0.15)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + 40); ctx.quadraticCurveTo(x + w / 2, y - 30, x + w, y + 40); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 5; ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + 130); ctx.lineTo(x + w, y + 130); ctx.stroke();
    ctx.fillStyle = '#2a1a14'; rr(x + 150, 150, 60, 80, 4); ctx.fill(); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3; ctx.stroke();       // portrait frame
    ctx.fillStyle = 'rgba(80,60,60,0.6)'; ctx.beginPath(); ctx.arc(x + 180, 180, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + 166, 194, 28, 28);
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: candelabras + flicker light
  for (let i = 0; i < 4; i++) {
    const x = wrapX(i * 360 + 200 - c.x * 0.1, 1440) - 100, y = 380, fl = 0.7 + 0.3 * Math.sin(t * 0.4 + i * 3) * Math.sin(t * 0.13 + i);
    const g = ctx.createRadialGradient(x, y - 50, 4, x, y - 50, 120); g.addColorStop(0, `rgba(255,200,120,${0.3 * fl})`); g.addColorStop(1, 'rgba(255,160,80,0)'); ctx.fillStyle = g; ctx.fillRect(x - 120, y - 170, 240, 240);
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 60); ctx.lineTo(x, y - 30); ctx.moveTo(x - 22, y - 40); ctx.quadraticCurveTo(x, y - 20, x + 22, y - 40); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (const dx of [-22, 0, 22]) { ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.ellipse(x + dx, y - 50 - (dx ? 0 : 6) + Math.sin(t * 0.5 + dx) * 1, 3, 6 * fl, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const gh of AR.ghosts) {                                                           // spectral figures drifting and fading
    const x = wrapX(gh.x + t * gh.sp - c.x * 0.07, 1600) - 200, y = gh.y * H + Math.sin(t * 0.03 + gh.ph) * 14, a = 0.12 + 0.1 * Math.sin(t * 0.02 + gh.ph);
    const g = ctx.createLinearGradient(0, y - 50, 0, y + 50); g.addColorStop(0, `rgba(200,210,255,${a})`); g.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 30, 16, Math.PI, 0); ctx.lineTo(x + 16, y + 40);
    for (let k = 4; k >= 0; k--) ctx.lineTo(x - 16 + k * 8, y + 40 + (k % 2 ? 8 : 0) + Math.sin(t * 0.1 + k) * 3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const fog = ctx.createLinearGradient(0, H * 0.65, 0, H); fog.addColorStop(0, 'rgba(120,110,160,0)'); fog.addColorStop(1, 'rgba(120,110,160,0.35)');
  ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);
  cleanVignette(0.6);
}

/* ---------------- Orbital Station: starfield, the Earth turning below, glass dome struts with reflections ---------------- */
function bgOrbital() {
  const t = G.time, c = G.cam;
  skyGradient(['#000004', '#02030c', '#05081a']);                                         // L0
  for (const s of AR.stars) { ctx.globalAlpha = 0.3 + 0.6 * s.d; ctx.fillStyle = '#ffffff'; ctx.fillRect(wrapX(s.x * W - c.x * 0.01, W), s.y * H * 0.7, s.s, s.s); }
  ctx.globalAlpha = 1;
  const ex = W * 0.5 - c.x * 0.03, ey = H * 1.55 - (c.y - 330) * 0.03, R = 900;          // L1: Earth
  let g = ctx.createRadialGradient(ex - 200, ey - 500, 50, ex, ey, R); g.addColorStop(0, '#5ab0ff'); g.addColorStop(0.55, '#1a5aa8'); g.addColorStop(1, '#06204a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(80,170,90,0.55)'; for (let i = 0; i < 6; i++) { const x = ex - R + wrapX(i * 420 + t * 0.15, 2 * R + 400) - 200; ctx.beginPath(); ctx.ellipse(x, ey - R + 120 + (i % 3) * 60, 160, 60, 0.3, 0, Math.PI * 2); ctx.fill(); }   // continents
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; for (let i = 0; i < 9; i++) { const x = ex - R + wrapX(i * 260 + t * 0.3, 2 * R + 400) - 200; ctx.beginPath(); ctx.ellipse(x, ey - R + 70 + (i % 4) * 40, 120, 14, -0.1, 0, Math.PI * 2); ctx.fill(); }   // cloud bands
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = 14; ctx.shadowColor = '#5ac8ff'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(ex, ey, R + 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();                                        // atmosphere rim
  ctx.save(); ctx.strokeStyle = 'rgba(160,190,230,0.35)'; ctx.lineWidth = 4;              // L2: dome struts + glass reflections
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 240 - c.x * 0.1, H); ctx.quadraticCurveTo(W / 2 + i * 120 - c.x * 0.1, H * 0.25, W / 2 - c.x * 0.1, -40); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(W / 2 - c.x * 0.1, H * 0.95, W * 0.8, H * 0.55, 0, Math.PI, 0); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const rg = ctx.createLinearGradient(0, 0, W, H); rg.addColorStop(0.2, 'rgba(255,255,255,0)'); rg.addColorStop(0.3, 'rgba(200,230,255,0.08)'); rg.addColorStop(0.36, 'rgba(255,255,255,0)'); rg.addColorStop(0.6, 'rgba(200,230,255,0.05)'); rg.addColorStop(0.64, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) if ((t >> 5) % 6 === i) { ctx.fillStyle = 'rgba(255,80,80,0.9)'; ctx.beginPath(); ctx.arc(80 + i * 220 - c.x * 0.1, 40 + (i % 2) * 20, 3, 0, Math.PI * 2); ctx.fill(); }   // blinking beacons
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Crystal Caverns: cave walls, glowing refractive geodes, light beams, water drips ---------------- */
function bgCaverns() {
  const t = G.time, c = G.cam;
  skyGradient(['#0a0618', '#1a1030', '#0c0818']);                                         // L0
  const ox = -c.x * 0.04;
  ctx.fillStyle = '#120a22'; ctx.beginPath(); ctx.moveTo(0, 0);                           // L1: jagged cave ceiling + walls
  for (let x = -40; x <= W + 40; x += 60) ctx.lineTo(x + wrapX(ox, 60), 40 + hash(Math.floor((x - ox) / 60)) * 90); ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 7; i++) {                                                           // geode clusters glowing in the walls
    const x = wrapX(i * 230 + 60 + ox * 1.2, 1610) - 100, y = 200 + (i % 3) * 110, hue = [275, 190, 320, 210][i % 4];
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 110); glow.addColorStop(0, `hsla(${hue},100%,70%,0.35)`); glow.addColorStop(1, `hsla(${hue},100%,60%,0)`); ctx.fillStyle = glow; ctx.fillRect(x - 110, y - 110, 220, 220);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.4, len = 30 + hash(i * 5 + k) * 40, bx = x + (k - 2) * 8;
      const cg = ctx.createLinearGradient(bx, y, bx + Math.cos(a) * len, y + Math.sin(a) * len); cg.addColorStop(0, `hsla(${hue},80%,30%,0.9)`); cg.addColorStop(1, `hsla(${hue},100%,85%,0.95)`);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(bx - 6, y); ctx.lineTo(bx + Math.cos(a) * len, y + Math.sin(a) * len); ctx.lineTo(bx + 6, y); ctx.closePath(); ctx.fill();
    }
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: refracted light beams + sparkles
  for (let i = 0; i < 4; i++) { const x = wrapX(i * 340 + 100 - c.x * 0.08, 1360) - 60, a = 0.07 + 0.04 * Math.sin(t * 0.02 + i * 2); ctx.fillStyle = `hsla(${200 + i * 30},100%,75%,${a})`; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 140, H); ctx.lineTo(x + 60, H); ctx.closePath(); ctx.fill(); }
  for (const m of AR.motes) { const x = wrapX(m.x * W - c.x * 0.06 * m.d, W), y = m.y * H, tw = 0.5 + 0.5 * Math.sin(t * 0.1 + m.ph); ctx.fillStyle = `rgba(220,200,255,${0.4 * tw * m.d})`; ctx.fillRect(x, y, m.s, m.s); }
  ctx.restore();
  for (const d of AR.drips) {                                                             // water drips falling from the ceiling, rippling at the bottom
    const x = d.x * W, cyc = (t + d.ph) % 200, y0 = 80 + d.h * 60;
    if (cyc < 120) { const y = y0 + (cyc / 120) ** 2 * (H - y0 - 40); ctx.fillStyle = 'rgba(180,220,255,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
    else { const k = (cyc - 120) / 80; ctx.strokeStyle = `rgba(180,220,255,${0.4 * (1 - k)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, H - 40, 4 + k * 26, 1.5 + k * 5, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  cleanVignette(0.6);
}

/* ---------------- Toxic Wasteland: sickly haze, wreckage silhouettes, bubbling acid pools with green under-light ---------------- */
function bgToxic() {
  const t = G.time, c = G.cam;
  skyGradient(['#1a2010', '#3a4418', '#2a3010']);                                         // L0
  const hz = ctx.createRadialGradient(W * 0.3, H * 0.3, 20, W * 0.3, H * 0.3, 500); hz.addColorStop(0, 'rgba(220,255,120,0.18)'); hz.addColorStop(1, 'rgba(200,255,100,0)'); ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
  const ox = -c.x * 0.04, base = H * 0.78;                                               // L1: wreckage — cooling towers, broken pylons, pipes
  ctx.fillStyle = '#141a0a';
  for (let i = 0; i < 5; i++) {
    const x = wrapX(i * 320 + ox, 1600) - 200;
    if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 20, base - 120, x + 10, base - 220); ctx.lineTo(x + 100, base - 220); ctx.quadraticCurveTo(x + 90, base - 120, x + 110, base); ctx.closePath(); ctx.fill(); }
    else { ctx.fillRect(x + 30, base - 260, 14, 260); ctx.save(); ctx.translate(x + 37, base - 260); ctx.rotate(0.5); ctx.fillRect(0, 0, 10, 90); ctx.restore(); ctx.fillRect(x - 20, base - 120, 160, 10); }
  }
  ctx.fillRect(0, base, W, H - base);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: acid pools glowing up from below
  const pool = ctx.createLinearGradient(0, H, 0, H * 0.45); pool.addColorStop(0, 'rgba(140,255,40,0.45)'); pool.addColorStop(1, 'rgba(140,255,40,0)'); ctx.fillStyle = pool; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  ctx.fillStyle = 'rgba(160,255,60,0.55)'; for (let x = 0; x < W; x += 6) ctx.fillRect(x, H - 34 + Math.sin(x * 0.05 + t * 0.08) * 3, 6, 34);
  for (const b of AR.bubbles) {                                                           // bubbles rising and popping in the acid
    const k = ((t + b.ph * 3) % 100) / 100, x = b.x * W, y = H - 30 - k * 30;
    ctx.strokeStyle = `rgba(210,255,140,${0.7 * (1 - k)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, b.s * (k < 0.9 ? 1 : 1.6), 0, Math.PI * 2); ctx.stroke();
  }
  for (const m of AR.motes) { const x = wrapX(m.x * W + t * 0.2 - c.x * 0.06 * m.d, W), y = wrapX(m.y * H - t * m.v * 0.4, H); ctx.fillStyle = `rgba(190,255,90,${0.12 * m.d})`; ctx.beginPath(); ctx.arc(x, y, m.s * 3, 0, Math.PI * 2); ctx.fill(); }   // toxic fumes
  ctx.restore();
  cleanVignette(0.55);
}

/* ---------------- Shogun's Palace: moonlit night, layered pagoda roofs, swaying paper lanterns, cherry blossoms ---------------- */
function bgShogun() {
  const t = G.time, c = G.cam;
  skyGradient(['#06081c', '#141a3a', '#2a1a2e']);                                         // L0
  const mx = W * 0.72 - c.x * 0.01, mg = ctx.createRadialGradient(mx, 120, 30, mx, 120, 200); mg.addColorStop(0, 'rgba(255,240,210,0.95)'); mg.addColorStop(0.25, 'rgba(255,230,190,0.25)'); mg.addColorStop(1, 'rgba(255,230,190,0)');
  ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.arc(mx, 120, 44, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1028';                                                              // L1: distant mountains + pagoda roofs
  ctx.beginPath(); ctx.moveTo(0, H * 0.62); for (let x = 0; x <= W; x += 80) ctx.lineTo(x - c.x * 0.02, H * 0.5 + hash(x) * 60); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const x = wrapX(i * 460 + 160 - c.x * 0.05, 1380) - 150, base = H * 0.72;
    for (let tier = 0; tier < 3; tier++) {
      const w = 200 - tier * 50, y = base - tier * 70;
      ctx.fillStyle = '#0e0a18'; ctx.beginPath(); ctx.moveTo(x - w / 2 - 20, y); ctx.quadraticCurveTo(x - w / 4, y - 26, x, y - 34); ctx.quadraticCurveTo(x + w / 4, y - 26, x + w / 2 + 20, y); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - w / 2 + 16, y, w - 32, 36);
      ctx.fillStyle = 'rgba(255,190,110,0.5)'; for (let k = 0; k < 3; k++) ctx.fillRect(x - w / 2 + 30 + k * (w - 60) / 2, y + 10, 10, 16);   // lit windows
    }
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: lanterns + petals
  for (let i = 0; i < 6; i++) {
    const ax = wrapX(i * 230 + 60 - c.x * 0.1, 1380) - 60, sway = Math.sin(t * 0.03 + i) * 0.12, len = 70 + (i % 3) * 30, x = ax + Math.sin(sway) * len, y = len;
    ctx.strokeStyle = 'rgba(80,60,60,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(x, y); ctx.stroke();
    const lg = ctx.createRadialGradient(x, y + 14, 2, x, y + 14, 60); lg.addColorStop(0, 'rgba(255,140,70,0.45)'); lg.addColorStop(1, 'rgba(255,120,60,0)'); ctx.fillStyle = lg; ctx.fillRect(x - 60, y - 46, 120, 120);
    ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.ellipse(x, y + 14, 11, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.ellipse(x, y + 14, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  for (const p of AR.petals) {                                                            // cherry blossom petals tumbling down
    const x = wrapX(p.x * W + Math.sin(t * 0.02 + p.ph) * 30 + t * 0.5 - c.x * 0.1, W), y = wrapX(p.y * H + t * p.v, H);
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.r + t * 0.03); ctx.fillStyle = 'rgba(255,190,215,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  cleanVignette(0.5);
}

/* ---------------- Grand Coliseum: hazy sun, tiered arches with a shadowy cheering crowd, banners, marble pillars ---------------- */
function bgColiseum() {
  const t = G.time, c = G.cam;
  skyGradient(['#d89a5a', '#f0c890', '#f8e2b8']);                                         // L0: warm hazy sky
  const sg = ctx.createRadialGradient(W * 0.25, 90, 10, W * 0.25, 90, 260); sg.addColorStop(0, 'rgba(255,250,220,0.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  const ox = -c.x * 0.04, aw = 64;                                                        // L1: three tiers of arches (pre-rendered) + a bobbing, cheering crowd
  const tiers = cachedLayer('coliseum', W + aw * 2, 300, () => {
    for (let tier = 0; tier < 3; tier++) {
      const y = 6 + tier * 92, h = 84, shade = 150 - tier * 20;
      ctx.fillStyle = `rgb(${shade + 50},${shade + 30},${shade})`; ctx.fillRect(0, y, W + aw * 2, h);
      for (let x = 0; x < W + aw * 2; x += aw) { ctx.fillStyle = 'rgba(40,24,14,0.85)'; ctx.beginPath(); ctx.moveTo(x + 10, y + h); ctx.lineTo(x + 10, y + 30); ctx.arc(x + aw / 2, y + 30, aw / 2 - 10, Math.PI, 0); ctx.lineTo(x + aw - 10, y + h); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = `rgb(${shade + 80},${shade + 60},${shade + 30})`; ctx.fillRect(0, y - 6, W + aw * 2, 6);
    }
  });
  ctx.drawImage(tiers, wrapX(ox, aw) - aw, 114, W + aw * 2, 300);
  ctx.fillStyle = 'rgba(20,12,8,0.9)';
  for (let tier = 0; tier < 3; tier++) for (let x = wrapX(ox, aw) - aw; x < W + aw; x += aw) {   // the crowd: three heads per arch, bouncing as they cheer
    const y = 120 + tier * 92 + 84;
    for (let k = 0; k < 3; k++) { const bob = Math.abs(Math.sin(t * 0.15 + x * 0.1 + k + tier)) * 3; ctx.fillRect(x + 15 + k * 12, y - 23 - bob, 10, 23); }
  }
  for (let i = 0; i < 5; i++) {                                                            // banners fluttering
    const x = wrapX(i * 280 + 100 + ox, 1400) - 100, wave = Math.sin(t * 0.08 + i) * 6;
    ctx.fillStyle = i % 2 ? '#a8321e' : '#d8a23a'; ctx.beginPath(); ctx.moveTo(x, 110); ctx.lineTo(x + 30, 110); ctx.lineTo(x + 30 + wave, 190); ctx.lineTo(x + 15 + wave, 178); ctx.lineTo(x + wave, 190); ctx.closePath(); ctx.fill();
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: dusty sunbeams
  for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(255,240,200,0.07)'; ctx.beginPath(); ctx.moveTo(W * 0.25 + i * 40, 0); ctx.lineTo(W * 0.25 + i * 40 + 30, 0); ctx.lineTo(W * 0.5 + i * 160 + 120, H); ctx.lineTo(W * 0.5 + i * 160, H); ctx.closePath(); ctx.fill(); }
  for (const m of AR.motes) { const x = wrapX(m.x * W + Math.sin(t * 0.01 + m.ph) * 20 - c.x * 0.08 * m.d, W), y = m.y * H; ctx.fillStyle = `rgba(255,240,200,${0.25 * m.d})`; ctx.fillRect(x, y, m.s, m.s); }
  ctx.restore();
  for (const sx of [0.04, 0.96]) {                                                         // nearer marble pillars with a 3D bevel
    const x = W * sx - c.x * 0.12 - 30, g = ctx.createLinearGradient(x, 0, x + 60, 0);
    g.addColorStop(0, '#8a7a62'); g.addColorStop(0.3, '#fff8e8'); g.addColorStop(0.6, '#d8cbb0'); g.addColorStop(1, '#6a5a44');
    ctx.fillStyle = g; ctx.fillRect(x, 60, 60, H);
    ctx.strokeStyle = 'rgba(80,60,40,0.35)'; ctx.lineWidth = 2; for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x + k * 12, 70); ctx.lineTo(x + k * 12, H); ctx.stroke(); }   // fluting
    ctx.fillStyle = '#e8dcc4'; ctx.fillRect(x - 10, 50, 80, 16);
  }
  cleanVignette(0.4);
}

/* ---------------- Final Destination: a spiralling galactic core far below a slab of pure energy ---------------- */
function bgFinal() {
  const t = G.time, c = G.cam;
  skyGradient(['#05020f', '#0e0624', '#05020f']);                                         // L0
  for (const s of AR.stars) { ctx.globalAlpha = (0.2 + 0.6 * s.d) * (0.6 + 0.4 * Math.sin(t * 0.03 + s.x * 90)); ctx.fillStyle = '#e8e0ff'; ctx.fillRect(wrapX(s.x * W - c.x * 0.02 * s.d, W), s.y * H, s.s, s.s); }
  ctx.globalAlpha = 1;
  const gx = W * 0.5 - c.x * 0.04, gy = H * 0.62 - (c.y - 330) * 0.04;                   // L1: the galaxy — glowing core + spiral arms
  let g = ctx.createRadialGradient(gx, gy, 4, gx, gy, 420); g.addColorStop(0, 'rgba(255,240,255,0.9)'); g.addColorStop(0.08, 'rgba(230,160,255,0.6)'); g.addColorStop(0.4, 'rgba(120,60,200,0.2)'); g.addColorStop(1, 'rgba(60,20,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const arms = cachedLayer('galaxy', 960, 960, () => {                                    // the spiral arms are drawn once, then just rotated
    ctx.translate(480, 480); ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 90; k++) {
      const u = k / 90, a = arm * TAU / 3 + u * 5.2, r = 30 + u * 420, j = hash(k * 7.1 + arm) * 22;
      ctx.fillStyle = `hsla(${280 - u * 80},100%,${80 - u * 30}%,${0.55 * (1 - u)})`; ctx.beginPath(); ctx.arc(Math.cos(a) * (r + j), Math.sin(a) * (r + j), 2 + (1 - u) * 3, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(gx, gy); ctx.scale(1, 0.38); ctx.rotate(t * 0.0015);
  ctx.drawImage(arms, -480, -480, 960, 960);
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: energy streams rising toward the slab
  for (let i = 0; i < 14; i++) {
    const x = wrapX(i * 97 - c.x * 0.1, W + 100) - 50, k = ((t * 0.6 + i * 40) % 300) / 300, y = H - k * 380;
    ctx.strokeStyle = `rgba(200,150,255,${0.3 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke();
  }
  ctx.restore();
  cleanVignette(0.55);
}

/* ---------------- add-on layers for existing arenas ---------------- */
// Abyssal Trench: bioluminescent jellyfish pulsing as they drift up
function jellyfishLayer() {
  const t = G.time, c = G.cam;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const j of AR.jelly) {
    const x = wrapX(j.x * W + Math.sin(t * 0.01 + j.ph) * 30 - c.x * 0.06, W), y = wrapX(j.y * H - t * j.v, H + 80) - 40, pulse = 0.85 + 0.15 * Math.sin(t * 0.08 + j.ph), s = j.s;
    const g = ctx.createRadialGradient(x, y, 1, x, y, s * 1.6); g.addColorStop(0, `hsla(${j.hue},100%,80%,0.55)`); g.addColorStop(1, `hsla(${j.hue},100%,60%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `hsla(${j.hue},100%,75%,0.45)`; ctx.beginPath(); ctx.ellipse(x, y, s * pulse, s * 0.7 / pulse, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = `hsla(${j.hue},100%,80%,0.35)`; ctx.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * s * 0.3, y); for (let s2 = 1; s2 <= 5; s2++) ctx.lineTo(x + k * s * 0.3 + Math.sin(t * 0.08 + s2 + k + j.ph) * 3, y + s2 * s * 0.4); ctx.stroke(); }
  }
  ctx.restore();
}
// Aetherial Peak: the floating mountain summit + wind streaks
function aetherialLayer() {
  const t = G.time, c = G.cam, x = W / 2 - c.x * 0.05, y = H * 0.66 - (c.y - 330) * 0.05;
  ctx.fillStyle = '#16243a'; ctx.beginPath(); ctx.moveTo(x - 360, y); ctx.lineTo(x - 140, y - 150); ctx.lineTo(x - 60, y - 90); ctx.lineTo(x + 40, y - 210); ctx.lineTo(x + 200, y - 70); ctx.lineTo(x + 380, y);
  ctx.quadraticCurveTo(x + 120, y + 180, x, y + 260); ctx.quadraticCurveTo(x - 140, y + 170, x - 360, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(230,250,255,0.85)'; ctx.beginPath(); ctx.moveTo(x + 40, y - 210); ctx.lineTo(x + 8, y - 165); ctx.lineTo(x + 30, y - 172); ctx.lineTo(x + 52, y - 160); ctx.lineTo(x + 74, y - 168); ctx.closePath(); ctx.fill();   // snowcap
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) { const k = ((t * 3 + i * 97) % (W + 400)), yy = 80 + hash(i) * 420; ctx.strokeStyle = 'rgba(220,250,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(k - 200, yy); ctx.quadraticCurveTo(k - 100, yy - 8, k, yy); ctx.stroke(); }
  ctx.restore();
}

/* ---------------- Neon Stadium: sweeping spotlights, a glow-stick crowd, equalizer banks and a jumbotron, all on the beat ---------------- */
function bgStadium() {
  const t = G.time, c = G.cam, beat = 1 - (t % 40) / 40, kick = beat * beat;              // the whole arena pulses to one beat
  skyGradient(['#12041e', '#2a0838', '#0a0214']);                                         // L0
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // roof-rig spotlights sweeping the arena
  for (let i = 0; i < 6; i++) {
    const x0 = 120 + i * 210 - c.x * 0.02, a = Math.PI / 2 + Math.sin(t * 0.012 + i * 1.3) * 0.45, col = i % 2 ? '255,46,230' : '46,240,255';
    const g = ctx.createLinearGradient(x0, 0, x0 + Math.cos(a) * 700, Math.sin(a) * 700); g.addColorStop(0, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + Math.cos(a - 0.08) * 760, Math.sin(a - 0.08) * 760); ctx.lineTo(x0 + Math.cos(a + 0.08) * 760, Math.sin(a + 0.08) * 760); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const ox = -c.x * 0.04, by = H * 0.42 - (c.y - 330) * 0.03;                             // L1: the bowl — tiers of seats and a sea of glow-sticks
  for (let tier = 0; tier < 4; tier++) {
    const y = by + tier * 46; ctx.fillStyle = `rgb(${24 + tier * 6},${8 + tier * 4},${40 + tier * 8})`; ctx.fillRect(0, y, W, 46);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y, W, 3);
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const sticks = ['#ff2ee6', '#2ef0ff', '#ffe14d', '#7dff6a'];
  for (let col = 0; col < 4; col++) {                                                     // (batched by colour)
    ctx.strokeStyle = sticks[col]; ctx.globalAlpha = 0.45 + 0.4 * kick; ctx.beginPath();
    for (let i = col; i < 160; i += 4) {
      const tier = (i >> 2) % 4, x = wrapX(hash(i * 1.7) * 1600 + ox * (1 + tier * 0.15), 1600) - 160, y = by + tier * 46 + 18 + hash(i * 3.3) * 18;
      const sway = Math.sin(t * 0.13 + i) * 6 * (0.5 + kick); ctx.moveTo(x, y); ctx.lineTo(x + sway, y - 9);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const side of [-1, 1]) {                                                           // L2: equalizer banks either side of the jumbotron
    const x0 = W / 2 + side * 330 - c.x * 0.08 - (side < 0 ? 200 : 0);
    for (let b = 0; b < 10; b++) {
      const lvl = 0.25 + 0.75 * Math.abs(Math.sin(t * 0.07 + b * 0.9 + side)) * (0.55 + 0.45 * kick), n = Math.round(lvl * 12);
      for (let k = 0; k < n; k++) { ctx.fillStyle = k > 9 ? 'rgba(255,80,120,0.85)' : k > 6 ? 'rgba(255,225,77,0.7)' : 'rgba(46,240,255,0.6)'; ctx.fillRect(x0 + b * 20, by - 12 - k * 11, 15, 8); }
    }
  }
  const jx = W / 2 - c.x * 0.06, jy = 120 - (c.y - 330) * 0.04;                         // the jumbotron: rings pulsing on the beat
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#0a0612'; rr(jx - 130, jy - 62, 260, 124, 8); ctx.fill(); ctx.strokeStyle = '#ff2ee6'; ctx.lineWidth = 3; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(46,240,255,${0.7 - k * 0.2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(jx, jy - 8, 14 + k * 12 + kick * 8, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = `rgba(255,46,230,${0.35 + 0.5 * kick})`; ctx.font = `900 16px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NEON BRAWL', jx, jy + 44);
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Sky Sanctuary: bright sun, marble ruins adrift on rock, a sea of clouds far below ---------------- */
function bgSanctuary() {
  const t = G.time, c = G.cam;
  skyGradient(['#4aa0f0', '#9ad2ff', '#e8f6ff']);                                         // L0
  const sx = W * 0.2 - c.x * 0.01, sy = 90, sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 340);
  sg.addColorStop(0, 'rgba(255,255,240,0.95)'); sg.addColorStop(0.2, 'rgba(255,250,220,0.4)'); sg.addColorStop(1, 'rgba(255,250,220,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  const ruins = cachedLayer('sanctuary-ruins', 1600, 400, () => {                         // L1: broken colonnades and arches on floating rock (drawn once)
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 400, y = 230 + (i % 2) * 40, w = 220 - (i % 2) * 50;
      ctx.fillStyle = 'rgba(150,140,170,0.55)'; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + w * 0.8, x + w / 2, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(245,242,232,0.85)'; ctx.fillRect(x - w / 2, y - 8, w, 10);
      for (let k = 0; k < 5; k++) { const h = (k === 1 || k === 4) ? 60 : 120; ctx.fillRect(x - w / 2 + 12 + k * (w - 24) / 4 - 5, y - 8 - h, 10, h); }
      ctx.fillRect(x - w / 2 + 6, y - 136, w * 0.55, 10);
      if (i % 2 === 0) { ctx.strokeStyle = 'rgba(245,242,232,0.85)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x + w * 0.25, y - 70, 34, Math.PI, 0); ctx.stroke(); }
    }
  });
  const bob = Math.sin(t * 0.01) * 6, rx = wrapX(-c.x * 0.03, 1600), ry = 20 + bob - (c.y - 330) * 0.03;
  ctx.drawImage(ruins, rx - 1600, ry, 1600, 400); ctx.drawImage(ruins, rx, ry, 1600, 400);
  const puff = cachedLayer('cloud-puff', 200, 120, () => {                                 // one soft cloud sprite, reused for the whole cloud sea
    const g = ctx.createRadialGradient(100, 70, 6, 100, 60, 90); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(100, 64, 100, 56, 0, 0, Math.PI * 2); ctx.fill();
  });
  for (let layer = 0; layer < 2; layer++) {                                               // L2: two cloud layers drifting at different speeds
    const y0 = H * (0.66 + layer * 0.12) - (c.y - 330) * (0.06 + layer * 0.04), sp = 0.15 + layer * 0.25;
    for (let i = 0; i < 14; i++) {
      const x = wrapX(i * 130 + t * sp - c.x * (0.06 + layer * 0.05), 1820) - 200, s = 1 + hash(i + layer * 20) * 0.8;
      ctx.drawImage(puff, x, y0 + hash(i * 7 + layer) * 30 - 40 * s, 200 * s, 120 * s);
    }
    if (!layer) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, y0 + 40, W, H); }
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // drifting motes of light
  for (const m of AR.motes) { const x = wrapX(m.x * W - c.x * 0.1 * m.d + Math.sin(t * 0.01 + m.ph) * 20, W), y = wrapX(m.y * H - t * m.v * 0.2, H); ctx.fillStyle = `rgba(255,250,210,${0.25 * m.d})`; ctx.beginPath(); ctx.arc(x, y, m.s, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  cleanVignette(0.18);
}

/* ---------------- Neon Highway: city glow on the horizon, lanes of headlights below, lamp posts whipping past ---------------- */
function bgHighway() {
  const t = G.time, c = G.cam;
  skyGradient(['#05061a', '#14123a', '#3a1a40']);                                         // L0
  const hz = H * 0.62 - (c.y - 330) * 0.04;
  const glow = ctx.createLinearGradient(0, hz - 140, 0, hz); glow.addColorStop(0, 'rgba(255,120,80,0)'); glow.addColorStop(1, 'rgba(255,120,80,0.35)'); ctx.fillStyle = glow; ctx.fillRect(0, hz - 140, W, 140);
  const city = cachedLayer('highway-city', 1600, 320, () => {                             // L1: the skyline with lit windows (drawn once)
    for (let x = 0; x < 1600;) {
      const w = 40 + hash(x) * 70, h = 80 + hash(x * 1.3) * 220; ctx.fillStyle = '#0c0c22'; ctx.fillRect(x, 320 - h, w, h);
      ctx.fillStyle = 'rgba(255,214,140,0.55)'; for (let wy = 320 - h + 8; wy < 312; wy += 9) for (let wx = x + 5; wx < x + w - 5; wx += 8) if (hash(wx * 3.1 + wy) > 0.62) ctx.fillRect(wx, wy, 3, 4);
      x += w + 4;
    }
  });
  const cx0 = wrapX(-c.x * 0.03, 1600); ctx.drawImage(city, cx0 - 1600, hz - 320, 1600, 320); ctx.drawImage(city, cx0, hz - 320, 1600, 320);
  ctx.fillStyle = '#07071a'; ctx.fillRect(0, hz, W, H - hz);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';           // L2: the lower expressway — headlights one way, tail-lights the other
  for (let lane = 0; lane < 4; lane++) {
    const y = hz + 30 + lane * 26, dir = lane < 2 ? 1 : -1, col = lane < 2 ? '255,246,208' : '255,47,87', sp = 9 + lane * 2;
    for (let k = 0; k < 7; k++) {
      const x = wrapX(k * 230 + hash(k + lane * 9) * 120 + dir * t * sp - c.x * 0.12, 1600) - 160;
      ctx.strokeStyle = `rgba(${col},0.7)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 70, y); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.18)`; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 120, y); ctx.stroke();
    }
  }
  ctx.restore();
  for (let k = 0; k < 6; k++) {                                                           // lamp posts racing past: fast parallax sells the speed
    const x = wrapX(k * 260 - t * 6 - c.x * 0.15, 1560) - 140, top = hz - 150;
    ctx.fillStyle = '#1a1a2a'; ctx.fillRect(x, top, 5, 190); ctx.fillRect(x, top, 34, 4);
    const g = ctx.createRadialGradient(x + 32, top + 6, 2, x + 32, top + 6, 60); g.addColorStop(0, 'rgba(255,200,120,0.7)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 30, top - 54, 124, 120);
  }
  ctx.fillStyle = 'rgba(20,20,34,0.9)'; for (let k = 0; k < 4; k++) { const x = wrapX(k * 400 + 200 - c.x * 0.2, 1600) - 200; ctx.fillRect(x, hz - 20, 40, H); }   // elevated-road pillars
  cleanVignette(0.5);
}

/* ---------------- Stellar Observatory: starfield, a ringed planet with moons, a turning orrery and the great telescope ---------------- */
function bgObservatory() {
  const t = G.time, c = G.cam;
  skyGradient(['#02030c', '#0a0e26', '#141032']);                                         // L0
  for (const s of AR.stars) { const x = wrapX(s.x * W - c.x * 0.02 * s.d, W), y = s.y * H, tw = 0.5 + 0.5 * Math.sin(t * 0.05 + s.x * 40); ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.6 * s.d) * tw})`; ctx.fillRect(x, y, s.s, s.s); }
  const px = W * 0.72 - c.x * 0.03, py = H * 0.34 - (c.y - 330) * 0.03, pr = 120;        // L1: the ringed planet
  const ringPath = front => { ctx.beginPath(); ctx.ellipse(px, py, pr * 2.1, pr * 0.42, -0.25, front ? 0 : Math.PI, front ? Math.PI : TAU); };
  ctx.save(); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(220,190,140,0.45)'; ringPath(false); ctx.stroke(); ctx.restore();   // back half of the rings
  const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr); pg.addColorStop(0, '#f4d8a8'); pg.addColorStop(0.5, '#c8905a'); pg.addColorStop(1, '#3a2018');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(90,50,30,0.35)'; ctx.lineWidth = 8;   // cloud bands
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(px, py + k * 28 + Math.sin(t * 0.01 + k) * 2, pr * 1.2, 10, -0.25, 0, TAU); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(240,215,170,0.6)'; ringPath(true); ctx.stroke();                  // front half, with ring bands turning
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,240,210,0.6)'; ctx.setLineDash([30, 12]); ctx.lineDashOffset = -t * 0.4; ringPath(true); ctx.stroke(); ctx.restore();
  for (let m = 0; m < 2; m++) { const a = t * (0.004 + m * 0.003) + m * 3, mx = px + Math.cos(a) * pr * (2.6 + m), my = py + Math.sin(a) * pr * 0.5; ctx.fillStyle = m ? '#9ab8ff' : '#d8d8e8'; ctx.beginPath(); ctx.arc(mx, my, 10 - m * 3, 0, TAU); ctx.fill(); }
  const ox = W * 0.24 - c.x * 0.08, oy = H * 0.5 - (c.y - 330) * 0.06;                   // L2: the orrery — planets gliding round brass orbit rings
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(200,160,80,0.35)'; ctx.lineWidth = 1.5;
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath(); ctx.ellipse(ox, oy, k * 42, k * 14, 0.15, 0, TAU); ctx.stroke();
    const a = t * 0.02 / k + k; ctx.fillStyle = ['#ffd36e', '#9ab8ff', '#ff8a5a', '#7dffd0'][k - 1]; ctx.beginPath(); ctx.arc(ox + Math.cos(a) * k * 42, oy + Math.sin(a) * k * 14, 4, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, TAU); ctx.fill();
  ctx.restore();
  const tx = W * 0.5 - c.x * 0.1, ty = H * 0.62 - (c.y - 330) * 0.08, ang = -0.6 + Math.sin(t * 0.004) * 0.15;   // the great telescope, slowly tracking
  ctx.save(); ctx.fillStyle = '#1a1e34'; ctx.fillRect(tx - 6, ty, 12, 120); ctx.beginPath(); ctx.moveTo(tx - 40, ty + 120); ctx.lineTo(tx, ty + 60); ctx.lineTo(tx + 40, ty + 120); ctx.closePath(); ctx.fill();
  ctx.translate(tx, ty); ctx.rotate(ang); const tg = ctx.createLinearGradient(0, -18, 0, 18); tg.addColorStop(0, '#c8a050'); tg.addColorStop(0.5, '#8a6a30'); tg.addColorStop(1, '#3a2a10');
  ctx.fillStyle = tg; rr(-40, -16, 190, 32, 6); ctx.fill(); ctx.fillStyle = '#e8c878'; ctx.fillRect(140, -20, 14, 40);
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Neon Skyline Expressway: dusk towers with animated billboards, distant highway ribbons, drone traffic ---------------- */
function bgExpressway() {
  const t = G.time, c = G.cam;
  skyGradient(['#1a0a3a', '#4a1a5a', '#ff6a7a']);                                         // L0
  const towers = cachedLayer('expressway-towers', 1800, 520, () => {                       // L1: towers (drawn once)
    for (let i = 0; i < 9; i++) {
      const x = i * 200 + hash(i) * 40, w = 110 + hash(i * 2) * 50, h = 260 + hash(i * 5) * 240;
      ctx.fillStyle = '#100a24'; ctx.fillRect(x, 520 - h, w, h); ctx.fillStyle = 'rgba(120,200,255,0.25)'; for (let y = 520 - h + 10; y < 520; y += 14) ctx.fillRect(x + 6, y, w - 12, 2);
    }
  });
  const tx0 = wrapX(-c.x * 0.035, 1800), ty0 = H - 480 - (c.y - 330) * 0.03;
  ctx.drawImage(towers, tx0 - 1800, ty0, 1800, 520); ctx.drawImage(towers, tx0, ty0, 1800, 520);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 14px ${FONT_NUM}`;
  const bbCols = ['#ff4dd8', '#2ef0ff', '#ffe14d', '#7dff6a'], words = ['DRIFT', 'NITRO', 'ZERO-G', 'VOLT', '24/7', 'NEON'];
  for (let i = 0; i < 9; i++) {                                                           // neon billboards that cycle their ads (and sometimes flicker off)
    if (((t >> 4) + i) % 9 === 0) continue;
    const x = wrapX(i * 200 + hash(i) * 40 + 20 - c.x * 0.035, 1800) - 200, y = ty0 + 520 - (260 + hash(i * 5) * 240) + 40, col = bbCols[i % 4];
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.strokeRect(x, y, 80, 40);
    ctx.fillStyle = rgba(col, 0.18); ctx.fillRect(x, y, 80, 40);
    ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.fillText(words[(i + (t >> 7)) % words.length], x + 40, y + 21);
  }
  for (let r = 0; r < 2; r++) {                                                           // L2: distant highway ribbons with car-light streaks
    const y = H * (0.48 + r * 0.12) - (c.y - 330) * (0.06 + r * 0.03);
    ctx.strokeStyle = 'rgba(46,240,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 30); ctx.stroke();
    ctx.fillStyle = r ? 'rgba(255,47,87,0.8)' : 'rgba(255,246,208,0.85)';
    for (let k = 0; k < 6; k++) { const u = wrapX(k / 6 + t * (0.004 + r * 0.002) * (r ? -1 : 1), 1); ctx.fillRect(u * W - 12, y + u * 30 - 3, 24, 3); }
  }
  for (let d = 0; d < 5; d++) {                                                           // hovering drones with blinking lights and scanner beams
    const x = wrapX(d * 330 + t * (0.6 + d * 0.15) - c.x * 0.1, 1650) - 200, y = 140 + d * 40 + Math.sin(t * 0.05 + d) * 10;
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#1a1a2a'; rr(x - 14, y - 4, 28, 8, 3); ctx.fill(); ctx.fillRect(x - 20, y - 6, 8, 2); ctx.fillRect(x + 12, y - 6, 8, 2);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = (t + d * 7) % 30 < 15 ? '#ff2f57' : '#2ef0ff'; ctx.beginPath(); ctx.arc(x, y + 5, 2.5, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(x, y, x, y + 90); g.addColorStop(0, 'rgba(46,240,255,0.18)'); g.addColorStop(1, 'rgba(46,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 26, y + 90); ctx.lineTo(x - 26, y + 90); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  cleanVignette(0.45);
}

/* ---------------- Forgotten Temple: jungle god-rays, a mossy step pyramid, twin waterfalls, vines and fireflies ---------------- */
function bgRuins() {
  const t = G.time, c = G.cam;
  skyGradient(['#2a5a4a', '#5a8a6a', '#1a3026']);                                         // L0
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { const x = 200 + i * 230 - c.x * 0.02 + Math.sin(t * 0.004 + i) * 30; ctx.fillStyle = 'rgba(230,255,200,0.07)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 230, H); ctx.lineTo(x + 110, H); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const temple = cachedLayer('ruins-temple', 900, 420, () => {                             // L1: the step pyramid, overgrown (drawn once)
    for (let s = 0; s < 6; s++) {
      const w = 600 - s * 80, h = 50; ctx.fillStyle = s % 2 ? '#4a5a44' : '#56664c'; ctx.fillRect(450 - w / 2, 420 - (s + 1) * h, w, h);
      ctx.fillStyle = 'rgba(110,170,80,0.55)'; for (let k = 0; k < w; k += 24) { ctx.beginPath(); ctx.arc(450 - w / 2 + k + 12, 420 - (s + 1) * h + 2, 8 + hash(k + s) * 6, Math.PI, 0); ctx.fill(); }
    }
    ctx.fillStyle = '#2a3428'; ctx.fillRect(420, 70, 60, 50); ctx.beginPath(); ctx.moveTo(410, 70); ctx.lineTo(450, 40); ctx.lineTo(490, 70); ctx.closePath(); ctx.fill();
  });
  ctx.drawImage(temple, W / 2 - 450 - c.x * 0.035, H * 0.62 - 420 - (c.y - 330) * 0.03, 900, 420);
  for (const side of [-1, 1]) {                                                           // L2: twin waterfalls with churning mist
    const x = W / 2 + side * 470 - c.x * 0.09, top = 40 - (c.y - 330) * 0.06;
    ctx.fillStyle = '#3a4a36'; ctx.fillRect(x - 70, top - 40, 140, 50);
    const g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, 'rgba(210,240,255,0.85)'); g.addColorStop(1, 'rgba(180,220,255,0.35)'); ctx.fillStyle = g; ctx.fillRect(x - 40, top, 80, H - top);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k < 9; k++) { const sx = x - 36 + k * 9, off = (t * 6 + k * 37) % 120; for (let y = top + off - 120; y < H; y += 120) { ctx.moveTo(sx, Math.max(top, y)); ctx.lineTo(sx, y + 50); } }
    ctx.stroke(); ctx.restore();
    const mist = ctx.createRadialGradient(x, H * 0.82, 10, x, H * 0.82, 160); mist.addColorStop(0, 'rgba(230,250,255,0.5)'); mist.addColorStop(1, 'rgba(230,250,255,0)'); ctx.fillStyle = mist; ctx.fillRect(x - 160, H * 0.82 - 160, 320, 320);
  }
  ctx.strokeStyle = 'rgba(40,70,30,0.9)'; ctx.lineWidth = 3; ctx.fillStyle = '#4a8a3a';  // hanging vines
  for (let i = 0; i < 9; i++) { const x = wrapX(i * 160 - c.x * 0.12, 1440) - 80, l = 80 + hash(i) * 140, s = Math.sin(t * 0.02 + i) * 8; ctx.beginPath(); ctx.moveTo(x, -5); ctx.quadraticCurveTo(x + s, l * 0.5, x + s * 1.6, l); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x + s * 1.6, l, 5, 3, 0.5, 0, TAU); ctx.fill(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // fireflies
  for (const m of AR.motes) { const x = wrapX(m.x * W + Math.sin(t * 0.02 + m.ph) * 30 - c.x * 0.1 * m.d, W), y = m.y * H * 0.9 + Math.cos(t * 0.03 + m.ph) * 20, a = 0.4 + 0.4 * Math.sin(t * 0.1 + m.ph); ctx.fillStyle = `rgba(220,255,120,${a * m.d})`; ctx.beginPath(); ctx.arc(x, y, m.s, 0, TAU); ctx.fill(); }
  ctx.restore();
  cleanVignette(0.4);
}

/* ---------------- Cyber Colosseum: an arena bowl, hex energy barriers, live holographic scoreboards ---------------- */
function bgCyberColosseum() {
  const t = G.time, c = G.cam;
  skyGradient(['#14061e', '#2a0a2a', '#0a0410']);                                         // L0
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const x = 160 + i * 320 - c.x * 0.02, a = Math.PI / 2 + Math.sin(t * 0.01 + i * 2) * 0.35; ctx.fillStyle = 'rgba(255,77,109,0.08)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + Math.cos(a - 0.1) * 800, Math.sin(a - 0.1) * 800); ctx.lineTo(x + Math.cos(a + 0.1) * 800, Math.sin(a + 0.1) * 800); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const bowl = cachedLayer('cybercol-bowl', 1600, 300, () => {                             // L1: the bowl's tiers, packed with light-sticks (drawn once)
    for (let r = 0; r < 5; r++) { ctx.fillStyle = `rgb(${30 + r * 8},${10 + r * 4},${40 + r * 6})`; ctx.fillRect(0, r * 56, 1600, 56); ctx.fillStyle = 'rgba(255,77,109,0.5)'; ctx.fillRect(0, r * 56, 1600, 2);
      for (let x = 0; x < 1600; x += 9) if (hash(x * 0.37 + r) > 0.45) { ctx.fillStyle = hash(x + r * 7) > 0.5 ? 'rgba(255,120,150,0.55)' : 'rgba(80,220,255,0.5)'; ctx.fillRect(x, r * 56 + 14 + hash(x * 3 + r) * 30, 2, 5); } }
  });
  const bx = wrapX(-c.x * 0.04, 1600), by = H * 0.38 - (c.y - 330) * 0.03;
  ctx.drawImage(bowl, bx - 1600, by, 1600, 300); ctx.drawImage(bowl, bx, by, 1600, 300);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: hex energy barriers either side
  for (const side of [-1, 1]) {
    const x0 = W / 2 + side * 560 - c.x * 0.08 - 50, k = 0.5 + 0.5 * Math.sin(t * 0.05 + side);
    ctx.strokeStyle = `rgba(80,220,255,${0.18 + 0.12 * k})`; ctx.lineWidth = 1.2;
    for (let row = 0; row < 14; row++) for (let col = 0; col < 4; col++) { const hx = x0 + col * 26 + (row % 2) * 13, hy = 120 + row * 22; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(hx + Math.cos(a) * 12, hy + Math.sin(a) * 12); } ctx.closePath(); ctx.stroke(); }
  }
  const sx = W / 2 - c.x * 0.06, sy = 96 - (c.y - 330) * 0.04;                            // floating holographic scoreboard with the live damage
  ctx.fillStyle = 'rgba(255,77,109,0.12)'; rr(sx - 220, sy - 40, 440, 80, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,120,150,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  for (let y = sy - 36; y < sy + 40; y += 4) { ctx.fillStyle = 'rgba(255,120,150,0.05)'; ctx.fillRect(sx - 218, y + (t % 4), 436, 1); }
  ctx.font = `900 22px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (G.mode !== 'menu' && fighters.length === 2) fighters.forEach((f, i) => { ctx.fillStyle = rgba(f.color, 0.85); ctx.fillText(Math.floor(f.percent) + '%', sx + (i ? 110 : -110), sy + 6); ctx.font = `700 11px ${FONT_NUM}`; ctx.fillText(f.ch.name, sx + (i ? 110 : -110), sy - 22); ctx.font = `900 22px ${FONT_NUM}`; });
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('VS', sx, sy + 4);
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Starfighter Dock: a hangar bay open to space, departing starfighters, beacons and launch-pad glow ---------------- */
function bgDock() {
  const t = G.time, c = G.cam;
  skyGradient(['#1a1e28', '#262c3a', '#0e1016']);                                         // L0: hangar interior
  const dx = W / 2 - c.x * 0.02, dy = -(c.y - 330) * 0.02;                                // the bay doors, open on a starfield
  ctx.fillStyle = '#04050c'; ctx.fillRect(dx - 360, 20 + dy, 720, 230);
  for (const s of AR.stars) { const x = dx - 360 + s.x * 720, y = 20 + dy + s.y * 230; ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * s.d})`; ctx.fillRect(x, y, s.s, s.s); }
  const p = (t % 360) / 360, shx = dx - 200 + p * 420, shy = 220 + dy - p * 260;          // L2: a starfighter lifting off through the doors, then the next
  if (p < 0.9) {
    ctx.save(); ctx.translate(shx, shy); ctx.rotate(-0.55); const s = 1 - p * 0.55; ctx.scale(s, s);
    ctx.fillStyle = '#c8d0e0'; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(-20, -14); ctx.lineTo(-30, 0); ctx.lineTo(-20, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a8498'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-24, -30); ctx.lineTo(-18, -8); ctx.moveTo(-6, 8); ctx.lineTo(-24, 30); ctx.lineTo(-18, 8); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(-30, 0, -100, 0); g.addColorStop(0, 'rgba(120,220,255,0.9)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-28, -6); ctx.lineTo(-100 - Math.random() * 20, 0); ctx.lineTo(-28, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const walls = cachedLayer('dock-walls', 1600, 520, () => {                               // L1: ribbed hangar walls and catwalks (drawn once)
    for (let x = 0; x < 1600; x += 160) { const g = ctx.createLinearGradient(x, 0, x + 40, 0); g.addColorStop(0, '#3a4252'); g.addColorStop(1, '#1e2430'); ctx.fillStyle = g; ctx.fillRect(x, 0, 40, 520); }
    ctx.fillStyle = '#2a303c'; ctx.fillRect(0, 300, 1600, 10); ctx.fillRect(0, 160, 1600, 6);
    ctx.strokeStyle = '#3a4252'; ctx.lineWidth = 2; for (let x = 0; x < 1600; x += 20) { ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x + 10, 285); ctx.stroke(); }
    ctx.fillStyle = '#ffb84d'; for (let x = 0; x < 1600; x += 40) ctx.fillRect(x + (x % 80 ? 0 : 20), 310, 20, 4);
  });
  const wx = wrapX(-c.x * 0.05, 1600), wy = -(c.y - 330) * 0.04;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(dx - 360, 20 + dy, 720, 230); ctx.clip('evenodd');   // (walls everywhere except the open doors)
  ctx.drawImage(walls, wx - 1600, wy, 1600, 520); ctx.drawImage(walls, wx, wy, 1600, 520); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const bxk of [-1, 1]) { const bx = dx + bxk * 380, by = 30 + dy, a = t * 0.08 * bxk;               // rotating warning beacons
    ctx.fillStyle = 'rgba(255,184,77,0.9)'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(bx, by, 2, bx, by, 160); g.addColorStop(0, 'rgba(255,184,77,0.3)'); g.addColorStop(1, 'rgba(255,184,77,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 160, a, a + 0.5); ctx.closePath(); ctx.fill(); }
  const floor = H * 0.86 - (c.y - 330) * 0.08, pg = ctx.createLinearGradient(0, floor - 60, 0, floor); pg.addColorStop(0, 'rgba(60,200,255,0)'); pg.addColorStop(1, 'rgba(60,200,255,0.25)');
  ctx.fillStyle = pg; ctx.fillRect(0, floor - 60, W, 60);
  ctx.restore();
  cleanVignette(0.45);
}

/* ---------------- Quantum Citadel: impossible towers drifting through each other, a turning tesseract, floating shards ---------------- */
function bgCitadel() {
  const t = G.time, c = G.cam;
  skyGradient(['#06041a', '#1a0a3a', '#0a0620']);                                         // L0
  ctx.save(); ctx.strokeStyle = 'rgba(140,90,255,0.12)'; ctx.lineWidth = 1;                // a receding vector grid
  for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 30 - c.x * 0.02, H * 0.55); ctx.lineTo(W / 2 + i * 160 - c.x * 0.05, H); ctx.stroke(); }
  for (let k = 0; k < 8; k++) { const y = H * 0.55 + Math.pow(k / 8, 2) * H * 0.45 + ((t * 0.5) % 6); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  for (let i = 0; i < 7; i++) {                                                           // L1: towers that slide up and down, phasing through each other
    const x = wrapX(i * 210 + 60 - c.x * 0.04, 1470) - 100, h = 160 + hash(i) * 200, shift = Math.sin(t * 0.008 + i * 1.7) * 60, y = H * 0.62 - h + shift - (c.y - 330) * 0.03;
    const g = ctx.createLinearGradient(x, y, x + 70, y); g.addColorStop(0, 'rgba(70,40,150,0.75)'); g.addColorStop(1, 'rgba(30,16,80,0.75)');
    ctx.fillStyle = g; ctx.fillRect(x, y, 70, h); ctx.strokeStyle = 'rgba(176,107,255,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, 70, h);
    ctx.save(); ctx.translate(x + 35, y); ctx.rotate(t * 0.004 * (i % 2 ? 1 : -1)); ctx.strokeRect(-20, -20, 40, 40); ctx.restore();   // a rotating cube capstone
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: a slowly turning tesseract
  const cx = W / 2 - c.x * 0.07, cy = 150 - (c.y - 330) * 0.05, a = t * 0.012, b = t * 0.008;
  const proj = (x, y, z, s) => { const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a), y1 = y * Math.cos(b) - z1 * Math.sin(b); return [cx + x1 * s, cy + y1 * s]; };
  const V = []; for (let i = 0; i < 8; i++) V.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1]);
  ctx.strokeStyle = 'rgba(90,255,240,0.5)'; ctx.lineWidth = 1.5;
  for (const s of [40, 22 + Math.sin(t * 0.03) * 6]) for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const d = V[i].filter((v, k) => v !== V[j][k]).length; if (d !== 1) continue;
    const p0 = proj(...V[i], s), p1 = proj(...V[j], s); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  for (let i = 0; i < 8; i++) { const p0 = proj(...V[i], 40), p1 = proj(...V[i], 22 + Math.sin(t * 0.03) * 6); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  for (let i = 0; i < 14; i++) {                                                          // drifting geometric shards
    const x = wrapX(hash(i * 3.1) * 1400 + t * (0.1 + hash(i) * 0.3) - c.x * 0.1, 1400) - 60, y = 60 + hash(i * 7.7) * 400 + Math.sin(t * 0.02 + i) * 12, r = 6 + hash(i * 1.3) * 10, rot = t * 0.02 * (i % 2 ? 1 : -1) + i;
    ctx.fillStyle = i % 3 ? 'rgba(176,107,255,0.3)' : 'rgba(90,255,240,0.3)'; ctx.beginPath(); for (let k = 0; k < 3; k++) { const q = rot + k * TAU / 3; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Magma Caldera: a crater ringed by lava falls, a glowing lava lake, smoke and rising embers ---------------- */
function bgCaldera() {
  const t = G.time, c = G.cam;
  skyGradient(['#1a0806', '#3a120a', '#5a1a0a']);                                         // L0
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const x = wrapX(i * 400 + t * 0.15 - c.x * 0.01, 1600) - 200; const g = ctx.createRadialGradient(x, 60, 10, x, 60, 220); g.addColorStop(0, 'rgba(80,40,30,0.25)'); g.addColorStop(1, 'rgba(80,40,30,0)'); ctx.fillStyle = g; ctx.fillRect(x - 220, -160, 440, 440); }   // smoke banks
  ctx.restore();
  const wall = cachedLayer('caldera-wall', 1600, 420, () => {                              // L1: the jagged crater wall (drawn once)
    ctx.fillStyle = '#1c0c08'; ctx.beginPath(); ctx.moveTo(0, 420);
    for (let x = 0; x <= 1600; x += 40) ctx.lineTo(x, 60 + hash(x * 0.13) * 120 + Math.sin(x * 0.004) * 60); ctx.lineTo(1600, 420); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,30,0.35)'; ctx.lineWidth = 2; for (let x = 20; x < 1600; x += 90) { ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x + 14, 260); ctx.lineTo(x - 6, 320); ctx.stroke(); }   // glowing fissures
  });
  const wx = wrapX(-c.x * 0.04, 1600), wy = H - 470 - (c.y - 330) * 0.03;
  ctx.drawImage(wall, wx - 1600, wy, 1600, 420); ctx.drawImage(wall, wx, wy, 1600, 420);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // L2: lava falls pouring down the wall
  for (let i = 0; i < 4; i++) {
    const x = wrapX(i * 400 + 140 - c.x * 0.04, 1600) - 100, top = wy + 120 + hash(i) * 40, w = 18 + hash(i * 3) * 14;
    const g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,80,20,0.5)'); ctx.fillStyle = g; ctx.fillRect(x - w / 2, top, w, H - top);
    ctx.fillStyle = 'rgba(255,240,180,0.6)'; for (let k = 0; k < 4; k++) { const y = top + ((t * 4 + k * 60 + i * 30) % (H - top)); ctx.fillRect(x - w / 2 + 3, y, w - 6, 10); }
  }
  const lake = H * 0.9 - (c.y - 330) * 0.08, lg = ctx.createLinearGradient(0, lake - 80, 0, H); lg.addColorStop(0, 'rgba(255,100,30,0)'); lg.addColorStop(0.4, 'rgba(255,100,30,0.45)'); lg.addColorStop(1, 'rgba(255,200,80,0.7)');
  ctx.fillStyle = lg; ctx.fillRect(0, lake - 80, W, H);
  for (const e of BG.embers) { const x = wrapX(e.x * W + Math.sin(t * 0.02 + e.ph) * 12 - c.x * 0.1 * e.d, W), y = wrapX(e.y * H - t * e.v, H); ctx.fillStyle = `rgba(255,${(140 + e.ph * 15) | 0},60,${0.4 + 0.4 * e.d})`; ctx.fillRect(x, y, e.s, e.s); }
  ctx.restore();
  cleanVignette(0.5);
}

/* ---------------- Celestial Shrine: a star-worship temple under a river of starlight, with drifting altars ---------------- */
function bgCelestial() {
  const t = G.time, c = G.cam;
  skyGradient(['#05061a', '#14123a', '#2a1a4a']);                                         // L0
  for (const s of AR.stars) { const x = wrapX(s.x * W - c.x * 0.015 * s.d, W), y = s.y * H * 0.8, tw = 0.5 + 0.5 * Math.sin(t * 0.04 + s.x * 50); ctx.fillStyle = `rgba(230,225,255,${(0.3 + 0.6 * s.d) * tw})`; ctx.fillRect(x, y, s.s, s.s); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // a river of starlight across the sky
  const band = ctx.createLinearGradient(0, 40, W, 260); band.addColorStop(0, 'rgba(160,140,255,0)'); band.addColorStop(0.5, 'rgba(200,180,255,0.18)'); band.addColorStop(1, 'rgba(160,140,255,0)');
  ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(0, 40); ctx.quadraticCurveTo(W / 2, 220, W, 120); ctx.lineTo(W, 220); ctx.quadraticCurveTo(W / 2, 320, 0, 140); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.4)'; ctx.lineWidth = 1;                             // constellations being traced
  const cons = [[0.15, 0.2], [0.2, 0.12], [0.27, 0.18], [0.31, 0.1], [0.7, 0.14], [0.76, 0.2], [0.82, 0.12], [0.86, 0.22]];
  for (let i = 0; i < cons.length - 1; i++) { if (i === 3) continue; const a = cons[i], b = cons[i + 1]; ctx.beginPath(); ctx.moveTo(a[0] * W - c.x * 0.01, a[1] * H); ctx.lineTo(b[0] * W - c.x * 0.01, b[1] * H); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; for (const a of cons) { ctx.beginPath(); ctx.arc(a[0] * W - c.x * 0.01, a[1] * H, 2.2, 0, TAU); ctx.fill(); }
  ctx.restore();
  const tx = W / 2 - c.x * 0.04, ty = H * 0.66 - (c.y - 330) * 0.03;                      // L1: the shrine — a stepped base, pillars and a great star-dial
  ctx.fillStyle = '#1e1c3a'; ctx.fillRect(tx - 300, ty - 30, 600, 60); ctx.fillRect(tx - 240, ty - 60, 480, 30);
  for (let k = -3; k <= 3; k++) ctx.fillRect(tx + k * 70 - 9, ty - 230, 18, 170);
  ctx.beginPath(); ctx.moveTo(tx - 260, ty - 230); ctx.lineTo(tx, ty - 300); ctx.lineTo(tx + 260, ty - 230); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,230,168,0.55)'; ctx.lineWidth = 2; ctx.translate(tx, ty - 255); ctx.rotate(t * 0.004);
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); ctx.stroke(); }
  ctx.restore();
  for (let i = 0; i < 4; i++) {                                                           // L2: altars drifting in the air, candles burning
    const x = wrapX(i * 380 + 120 - c.x * 0.09, 1520) - 100, y = 210 + (i % 2) * 90 + Math.sin(t * 0.02 + i * 1.5) * 10 - (c.y - 330) * 0.06;
    ctx.fillStyle = '#2a2850'; ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x + 40, y); ctx.lineTo(x + 20, y + 26); ctx.lineTo(x - 20, y + 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe6a8'; ctx.fillRect(x - 40, y - 3, 80, 3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const dx of [-18, 0, 18]) { ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.ellipse(x + dx, y - 12 + Math.sin(t * 0.4 + dx) * 0.8, 2.4, 5, 0, 0, TAU); ctx.fill(); }
    const g = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 50); g.addColorStop(0, 'rgba(255,220,150,0.25)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.fillRect(x - 50, y - 62, 100, 100); ctx.restore();
  }
  cleanVignette(0.45);
}

/* ---------------- Neon Subways: a tiled tunnel with neon signage, flickering strip lights and trains streaking past on the far track ---------------- */
function bgSubway() {
  const t = G.time, c = G.cam;
  skyGradient(['#0a0c14', '#14182a', '#06070c']);                                         // L0
  const wall = cachedLayer('subway-wall', 1600, 420, () => {                              // L1: tiled tunnel wall with signage (drawn once)
    ctx.fillStyle = '#1c2230'; ctx.fillRect(0, 0, 1600, 420);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; for (let y = 0; y < 420; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1600, y); ctx.stroke(); } for (let x = 0; x < 1600; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 420); ctx.stroke(); }
    ctx.fillStyle = '#3df0ff'; ctx.fillRect(0, 150, 1600, 6); ctx.fillStyle = '#ff4dd8'; ctx.fillRect(0, 160, 1600, 3);
    ctx.font = '900 30px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) { const x = 200 + i * 400; ctx.fillStyle = '#0a0c14'; ctx.fillRect(x - 110, 70, 220, 56); ctx.strokeStyle = i % 2 ? '#ff4dd8' : '#3df0ff'; ctx.lineWidth = 3; ctx.strokeRect(x - 110, 70, 220, 56); ctx.fillStyle = i % 2 ? '#ff4dd8' : '#3df0ff'; ctx.fillText(['LINE 7', 'NEO-SHIBUYA', 'EXIT B4', 'SECTOR 9'][i], x, 99); }
  });
  const wx = wrapX(-c.x * 0.05, 1600), wy = -(c.y - 330) * 0.04;
  ctx.drawImage(wall, wx - 1600, wy, 1600, 420); ctx.drawImage(wall, wx, wy, 1600, 420);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // flickering ceiling strip lights
  for (let i = 0; i < 6; i++) { const x = wrapX(i * 260 - c.x * 0.08, 1560) - 130, on = hash(i * 7 + (t >> 3)) > 0.08 ? 1 : 0.2; ctx.fillStyle = `rgba(220,245,255,${0.8 * on})`; ctx.fillRect(x, 10, 120, 5);
    const g = ctx.createLinearGradient(0, 15, 0, 200); g.addColorStop(0, `rgba(200,240,255,${0.18 * on})`); g.addColorStop(1, 'rgba(200,240,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x + 120, 15); ctx.lineTo(x + 170, 200); ctx.lineTo(x - 50, 200); ctx.closePath(); ctx.fill(); }
  const ty = 330 + wy, p = (t % 300) / 300;                                               // L2: the far track — every few seconds a train smears past in light
  ctx.fillStyle = 'rgba(10,12,20,0.9)'; ctx.fillRect(0, ty + 40, W, 24);
  if (p < 0.35) {
    const u = p / 0.35, x = -900 + u * (W + 1800);
    const g = ctx.createLinearGradient(x - 900, 0, x, 0); g.addColorStop(0, 'rgba(61,240,255,0)'); g.addColorStop(0.7, 'rgba(61,240,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.8)');
    ctx.fillStyle = g; ctx.fillRect(x - 900, ty - 10, 900, 50);
    ctx.fillStyle = 'rgba(255,240,200,0.5)'; for (let k = 0; k < 18; k++) ctx.fillRect(x - 880 + k * 48, ty + 2, 30, 12);
  }
  ctx.restore();
  cleanVignette(0.55);
}

/* ---------------- Astral Void: drifting star-clusters, a time-warp vortex and slowly turning clock-rings ---------------- */
function bgAstral() {
  const t = G.time, c = G.cam, hue = 270 + Math.sin(t * 0.002) * 30;
  skyGradient([`hsl(${hue},60%,6%)`, `hsl(${hue - 20},60%,12%)`, `hsl(${hue + 20},50%,5%)`]);   // L0: the void slowly shifts hue
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {                                                           // L1: star-clusters drifting across the void
    const cx = wrapX(k * 300 + t * (0.05 + k * 0.03) - c.x * 0.02, 1500) - 100, cy = 80 + k * 90 + Math.sin(t * 0.004 + k) * 20;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 70); g.addColorStop(0, `hsla(${hue + k * 30},100%,80%,0.25)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 70, cy - 70, 140, 140);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 18; i++) { const a = hash(i + k * 20) * TAU, r = hash(i * 3 + k) * 50; ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 1.6, 1.6); }
  }
  const vx = W * 0.5 - c.x * 0.05, vy = H * 0.36 - (c.y - 330) * 0.04;                    // L2: the time-warp vortex — a spiral being drawn inward
  for (let arm = 0; arm < 4; arm++) { ctx.strokeStyle = `hsla(${hue + arm * 40},100%,70%,0.25)`; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 60; i++) { const u = i / 60, a = arm * TAU / 4 + u * 7 - t * 0.02, r = 10 + u * 200; i ? ctx.lineTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r * 0.45) : ctx.moveTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r * 0.45); }
    ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,200,255,0.25)'; ctx.lineWidth = 1.5;                         // clock-rings with ticking hands
  for (const [r, sp] of [[260, 0.002], [320, -0.0015]]) { ctx.beginPath(); ctx.ellipse(vx, vy, r, r * 0.45, 0, 0, TAU); ctx.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * sp; ctx.beginPath(); ctx.moveTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r * 0.45); ctx.lineTo(vx + Math.cos(a) * (r - 10), vy + Math.sin(a) * (r - 10) * 0.45); ctx.stroke(); } }
  ctx.restore();
  cleanVignette(0.5);
}
