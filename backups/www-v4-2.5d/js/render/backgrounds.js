/* NEON BRAWL — Procedural animated stage backgrounds + menu backdrop. */
'use strict';

/* ---------------- Backgrounds (parallax / animated, all procedural) ---------------- */
const BG = { bldg: [[], []], stars: [], clouds: [], pillars: [], petals: [], rain: [], warp: [], embers: [], ash: [], peaks: [[], []], cracks: [] };
(function initBackgrounds() {
  for (let l = 0; l < 2; l++) {                                    // neon skyline layers
    let x = 0;
    while (x < 2000) {
      const w = rand(50, 120), h = rand(l ? 90 : 150, l ? 200 : 330), win = [];
      for (let i = 0; i < 10; i++) win.push({ x: rand(6, w - 10), y: rand(8, h - 10), on: Math.random() < 0.6, hue: Math.random() < .5 ? 190 : 310 });
      BG.bldg[l].push({ x, w, h, win }); x += w + rand(4, 26);
    }
  }
  for (let i = 0; i < 160; i++) BG.stars.push({ x: Math.random(), y: Math.random(), d: Math.random(), s: rand(0.6, 2.4) });
  for (let i = 0; i < 24; i++) BG.clouds.push({ x: Math.random() * 1700, y: rand(0.12, 0.62), w: rand(160, 420), h: rand(26, 60), speed: rand(0.1, 0.45), layer: Math.random() });
  for (let i = 0; i < 9; i++) BG.pillars.push({ x: Math.random() * 2200 - 400, y: rand(120, 540), w: rand(26, 54), h: rand(120, 260), depth: rand(0.2, 1), phase: Math.random() * 6.28 });
  for (let i = 0; i < 40; i++) BG.petals.push({ x: Math.random(), y: Math.random(), s: rand(1.5, 3.5), v: rand(0.2, 0.7), ph: Math.random() * 6 });
  for (let i = 0; i < 90; i++) BG.rain.push({ x: Math.random(), y: Math.random(), v: rand(7, 15), len: rand(12, 30), hue: Math.random() < .5 ? 185 : 310, d: rand(0.4, 1) });
  for (let i = 0; i < 130; i++) BG.warp.push({ a: Math.random() * 6.283, p: Math.random(), sp: rand(0.004, 0.012), hue: rand(180, 290) });
  for (let i = 0; i < 110; i++) BG.embers.push({ x: Math.random(), y: Math.random(), v: rand(0.5, 1.8), s: rand(1.2, 3.4), ph: Math.random() * 6.28, d: rand(0.3, 1) });
  for (let i = 0; i < 50; i++) BG.ash.push({ x: Math.random(), y: Math.random(), v: rand(0.2, 0.6), s: rand(1.5, 3), ph: Math.random() * 6.28 });
  for (let l = 0; l < 2; l++) { let x = -200; while (x < 1500) { BG.peaks[l].push([x, rand(l ? 0.52 : 0.4, l ? 0.7 : 0.58)]); x += rand(50, 110); } }
  for (let i = 0; i < 14; i++) BG.cracks.push({ x: Math.random(), y: rand(0.45, 0.8), l: rand(30, 90), ph: Math.random() * 6.28 });
})();

/* Cyber Metropolis: skyline layers, scrolling synthwave grid, neon rain */
function bgNeon() {
  const t = G.time, c = G.cam, horizon = H * 0.58 - (c.y - 330) * 0.08;
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05061a'); g.addColorStop(0.55, '#1a0b3a'); g.addColorStop(1, '#2b0f4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * 0.5 - c.x * 0.02, sr = 120;
  g = ctx.createLinearGradient(0, horizon - sr * 1.6, 0, horizon);
  g.addColorStop(0, '#ff4fd8'); g.addColorStop(1, '#ffb347');
  ctx.save(); ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 50; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, horizon - sr * 0.6, sr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#1a0b3a';
  for (let i = 0; i < 6; i++) { const y = horizon - sr * 0.6 + 10 + i * i * 3.2 + i * 12; ctx.fillRect(sx - sr, y, sr * 2, 2 + i * 1.6); }
  for (let l = 0; l < 2; l++) {
    const par = l ? 0.22 : 0.09, col = l ? '#120a2e' : '#0a0620';
    for (const b of BG.bldg[l]) {
      const bx = (((b.x - c.x * par) % 2000) + 2000) % 2000 - 360;
      if (bx > W || bx + b.w < 0) continue;
      ctx.fillStyle = col; ctx.fillRect(bx, horizon - b.h, b.w, b.h + 2);
      ctx.fillStyle = l ? 'rgba(80,220,255,0.55)' : 'rgba(160,90,255,0.4)'; ctx.fillRect(bx, horizon - b.h, b.w, 2);
      for (const w of b.win) if (w.on) { ctx.fillStyle = `hsla(${w.hue},100%,65%,${l ? 0.7 : 0.4})`; ctx.fillRect(bx + w.x, horizon - b.h + w.y, 4, 5); }
    }
  }
  g = ctx.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, '#12062a'); g.addColorStop(1, '#050210');
  ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = 'rgba(140,100,255,0.35)'; ctx.lineWidth = 1.3;
  const vx = W / 2 - c.x * 0.05, flow = (t * 0.012) % 1;
  for (let i = -16; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(vx + i * 30, horizon); ctx.lineTo(vx + i * 230, H); ctx.stroke(); }
  for (let j = 0; j < 10; j++) {
    const k = (j + flow) / 10, y = horizon + Math.pow(k, 2.2) * (H - horizon);
    ctx.globalAlpha = 0.25 + k * 0.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,79,216,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
  ctx.save(); ctx.lineCap = 'round';                                   // floating neon rain
  for (const r of BG.rain) {
    const x = (((r.x * W - c.x * 0.1 * r.d + t * r.v * 0.35) % W) + W) % W, y = ((r.y * H + t * r.v) % (H + 40)) - 20;
    ctx.strokeStyle = `hsla(${r.hue},100%,70%,${0.25 + 0.4 * r.d})`; ctx.lineWidth = 1 + r.d;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r.len * 0.35, y - r.len); ctx.stroke();
  }
  ctx.restore();
}

/* Cosmic Zenith: twinkling starfield with warp-speed particle streams */
function bgSpace() {
  const t = G.time, c = G.cam;
  let g = ctx.createRadialGradient(W / 2 - c.x * 0.02, H * 0.45, 40, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#0b1236'); g.addColorStop(0.6, '#04061a'); g.addColorStop(1, '#010208');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [bx, by, br, col] of [[0.2, 0.3, 380, '61,240,255'], [0.78, 0.6, 440, '138,77,255'], [0.5, 0.88, 340, '255,77,210']]) {
    const x = bx * W - c.x * 0.03, y = by * H - c.y * 0.02;
    g = ctx.createRadialGradient(x, y, 0, x, y, br); g.addColorStop(0, `rgba(${col},${0.10 + 0.08 * Math.sin(t * 0.02 + bx * 9)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (const s of BG.stars) {                                          // twinkling stars (depth parallax)
    const sp = 0.1 + s.d * 0.7;
    const x = (((s.x * W - c.x * sp * 0.1) % W) + W) % W, y = (((s.y * H - c.y * sp * 0.05) % H) + H) % H;
    const tw = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.02 + s.d * 0.05) + s.x * 80));
    ctx.globalAlpha = tw * (0.4 + 0.6 * s.d); ctx.fillStyle = s.d > 0.7 ? '#cfe9ff' : '#8aa8ff';
    ctx.fillRect(x, y, s.s, s.s);
    if (s.s > 2.1) { ctx.fillRect(x - 3, y + s.s / 2 - 0.4, s.s + 6, 0.8); ctx.fillRect(x + s.s / 2 - 0.4, y - 3, 0.8, s.s + 6); }
  }
  ctx.globalAlpha = 1;
  const vx = W / 2 - c.x * 0.03, vy = H * 0.42 - c.y * 0.02;           // warp streams radiating from the vanishing point
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const w of BG.warp) {
    const k = (w.p + t * w.sp) % 1, r0 = Math.pow(k, 2.4) * 900, len = r0 * 0.16 + 3, cs = Math.cos(w.a), sn = Math.sin(w.a);
    ctx.strokeStyle = `hsla(${w.hue},100%,70%,${k * 0.55})`; ctx.lineWidth = 0.6 + k * 2.2;
    ctx.beginPath(); ctx.moveTo(vx + cs * r0, vy + sn * r0); ctx.lineTo(vx + cs * (r0 + len), vy + sn * (r0 + len)); ctx.stroke();
  }
  ctx.restore();
}

/* Sunset Sanctuary: sunset gradient, layered drifting clouds, floating pillars */
function bgShrine() {
  const t = G.time, c = G.cam, horizon = H * 0.7 - (c.y - 330) * 0.06;
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b1b5a'); g.addColorStop(0.4, '#b23f7d'); g.addColorStop(0.68, '#ff8a5c'); g.addColorStop(1, '#ffd08a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * 0.62 - c.x * 0.02, sy = horizon - 40;
  g = ctx.createRadialGradient(sx, sy, 20, sx, sy, 300); g.addColorStop(0, 'rgba(255,240,190,0.9)'); g.addColorStop(0.3, 'rgba(255,170,100,0.35)'); g.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 100); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#ffb066');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 100, 0, Math.PI * 2); ctx.fill();
  const drawClouds = (lo, hi, alpha, col) => {
    for (const cl of BG.clouds) {
      if (cl.layer < lo || cl.layer >= hi) continue;
      const par = 0.05 + cl.layer * 0.25;
      const x = (((cl.x + t * cl.speed - c.x * par) % (W + 500)) + W + 500) % (W + 500) - 250, y = cl.y * H - c.y * par * 0.1;
      ctx.fillStyle = col.replace('A', alpha);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + i * cl.w * 0.24, y + Math.sin(i * 1.7) * 6, cl.w * 0.32, cl.h * (0.7 + 0.15 * (i % 2)), 0, 0, Math.PI * 2); ctx.fill(); }
    }
  };
  drawClouds(0, 0.4, 0.35, 'rgba(255,200,170,A)');
  const tx = W * 0.25 - c.x * 0.06;                                    // distant shrine silhouette
  ctx.fillStyle = '#4a2358';
  ctx.fillRect(tx - 120, horizon - 60, 240, 70); ctx.fillRect(tx - 90, horizon - 100, 180, 44);
  ctx.beginPath(); ctx.moveTo(tx - 110, horizon - 100); ctx.lineTo(tx, horizon - 160); ctx.lineTo(tx + 110, horizon - 100); ctx.closePath(); ctx.fill();
  for (let i = -3; i <= 3; i++) ctx.fillRect(tx + i * 30 - 4, horizon - 56, 8, 56);
  drawClouds(0.4, 0.75, 0.5, 'rgba(255,150,150,A)');
  g = ctx.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, 'rgba(255,170,150,0.0)'); g.addColorStop(1, 'rgba(90,40,100,0.65)');
  ctx.fillStyle = g; ctx.fillRect(0, horizon - 10, W, H - horizon + 10);
  drawClouds(0.75, 1.01, 0.6, 'rgba(255,120,140,A)');
  for (const p of BG.pillars) {                                        // floating pillars
    const x = ((p.x - c.x * p.depth * 0.3) % 2200 + 2200) % 2200 - 400, y = p.y + Math.sin(t * 0.018 + p.phase) * 12 - c.y * p.depth * 0.06;
    const w = p.w * (0.6 + p.depth * 0.6), h = p.h * (0.6 + p.depth * 0.6);
    ctx.globalAlpha = 0.35 + p.depth * 0.5; ctx.fillStyle = '#3b2145';
    ctx.fillRect(x, y, w, h); ctx.fillRect(x - 5, y - 8, w + 10, 10); ctx.fillRect(x - 5, y + h - 2, w + 10, 8);
    ctx.fillStyle = 'rgba(255,200,150,0.35)'; ctx.fillRect(x + w - 4, y, 3, h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(255,220,200,0.7)';
  for (const p of BG.petals) {
    const x = (((p.x * W - t * p.v * 1.4 - c.x * 0.1) % W) + W) % W, y = (p.y * H + Math.sin(t * 0.02 + p.ph) * 18 + t * p.v * 0.3) % H;
    ctx.fillRect(x, y, p.s, p.s * 0.6);
  }
}

/* Volcanic Core: pulsing gradient, glowing lava vault, rising embers and ash */
function bgVolcano() {
  const t = G.time, c = G.cam, pulse = 0.5 + 0.5 * Math.sin(t * 0.03);
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${16 + 14 * pulse | 0},4,8)`); g.addColorStop(0.55, `rgb(${70 + 40 * pulse | 0},10,8)`); g.addColorStop(1, `rgb(255,${90 + 50 * pulse | 0},20)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let l = 0; l < 2; l++) {                                        // jagged cavern silhouettes
    const par = l ? 0.1 : 0.05, pts = BG.peaks[l];
    ctx.fillStyle = l ? '#1a0606' : '#2a0a08';
    ctx.beginPath(); ctx.moveTo(pts[0][0] - c.x * par, H);
    for (const p of pts) ctx.lineTo(p[0] - c.x * par, p[1] * H);
    ctx.lineTo(pts[pts.length - 1][0] - c.x * par, H); ctx.closePath(); ctx.fill();
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';   // glowing cracks
  for (const k of BG.cracks) {
    const x = k.x * W - c.x * 0.1, y = k.y * H;
    ctx.strokeStyle = `rgba(255,120,30,${0.25 + 0.3 * Math.sin(t * 0.04 + k.ph) ** 2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k.l * 0.4, y + k.l * 0.3); ctx.lineTo(x + k.l * 0.2, y + k.l * 0.7); ctx.stroke();
  }
  ctx.restore();
  const ly = H * 0.86 - (c.y - 330) * 0.05;                            // lava lake
  g = ctx.createLinearGradient(0, ly - 170, 0, ly); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, `rgba(255,130,30,${0.35 + 0.2 * pulse})`);
  ctx.fillStyle = g; ctx.fillRect(0, ly - 170, W, 170);
  g = ctx.createLinearGradient(0, ly, 0, H); g.addColorStop(0, '#ffc03a'); g.addColorStop(0.3, '#ff5a14'); g.addColorStop(1, '#8a0c00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, ly + Math.sin(x * 0.02 + t * 0.04) * 5 + Math.sin(x * 0.045 - t * 0.03) * 3);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                // rising embers
  for (const e of BG.embers) {
    const span = H * 1.2, y = ((((e.y * span - t * e.v * 1.4) % span) + span) % span) - 20, x = e.x * W + Math.sin(t * 0.02 + e.ph) * 14 - c.x * 0.04 * e.d;
    ctx.fillStyle = `hsla(${20 + e.s * 8},100%,${55 + e.d * 20}%,${0.35 + 0.5 * e.d})`;
    ctx.beginPath(); ctx.arc(x, y, e.s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(120,110,110,0.4)';                             // drifting ash
  for (const a of BG.ash) {
    const span = H * 1.1, y = ((((a.y * span - t * a.v) % span) + span) % span), x = a.x * W + Math.sin(t * 0.015 + a.ph) * 24;
    ctx.fillRect(x, y, a.s, a.s * 0.7);
  }
  g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}


Object.assign(BG, { crystals: [], cols: [], spores: [], mush: [], gears: [], vents: [], streams: [], shapes: [] });
(function initBackgrounds2() {
  for (let i = 0; i < 18; i++) BG.crystals.push({ x: Math.random(), y: rand(0.1, 0.7), s: rand(10, 34), ph: Math.random() * 6.28, d: rand(0.3, 1), rot: rand(0, 6) });
  for (let i = 0; i < 46; i++) BG.cols.push({ x: Math.random(), v: rand(1.5, 5), len: Math.floor(rand(6, 18)), ph: Math.random() });
  for (let i = 0; i < 70; i++) BG.spores.push({ x: Math.random(), y: Math.random(), v: rand(0.15, 0.5), ph: Math.random() * 6.28, hue: rand(150, 300), s: rand(1.2, 3.4), d: rand(0.3, 1) });
  for (let i = 0; i < 8; i++) BG.mush.push({ x: Math.random() * 1800 - 250, h: rand(160, 330), w: rand(110, 210), depth: rand(0.2, 0.9), ph: Math.random() * 6.28, hue: rand(160, 310) });
  for (const [x, y, r, teeth, dir] of [[0.12, 0.25, 220, 16, 1], [0.3, 0.75, 150, 12, -1], [0.55, 0.3, 110, 10, 1], [0.78, 0.65, 200, 14, -1], [0.9, 0.2, 90, 9, 1], [0.45, 0.9, 130, 11, 1], [0.05, 0.85, 100, 10, -1]])
    BG.gears.push({ x, y, r, teeth, dir });
  for (const x of [0.12, 0.3, 0.5, 0.7, 0.88]) BG.vents.push({ x, ph: Math.random() });
  for (let i = 0; i < 150; i++) BG.streams.push({ p: Math.random(), lane: Math.floor(Math.random() * 4), sp: rand(0.4, 1.4), hue: rand(180, 300), amp: rand(20, 70), s: rand(1, 2.6) });
  for (let i = 0; i < 16; i++) BG.shapes.push({ x: Math.random(), y: Math.random(), r: rand(18, 60), k: Math.floor(rand(0, 3)), rot: Math.random() * 6, vr: rand(-0.01, 0.01), vx: rand(-0.12, 0.12), vy: rand(-0.1, 0.1), d: rand(0.3, 1), hue: rand(190, 300) });
})();
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function drawGear(x, y, r, teeth, rot, fill, edge) {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = rot + i * Math.PI / teeth, rr2 = i % 2 ? r * 0.84 : r;
    const a2 = a + Math.PI / teeth * 0.5;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); ctx.lineTo(x + Math.cos(a2) * rr2, y + Math.sin(a2) * rr2);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22); ctx.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); ctx.stroke(); }
}

/* Celestial Aurora: shimmering northern lights, icy peaks, floating crystal shards */
function bgAurora() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#020816'); g.addColorStop(0.6, '#06223a'); g.addColorStop(1, '#0c3a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#cfe9ff';
  for (let i = 0; i < BG.stars.length; i += 2) { const s = BG.stars[i]; ctx.globalAlpha = 0.2 + 0.6 * Math.abs(Math.sin(t * 0.03 + s.x * 60)); ctx.fillRect(s.x * W, s.y * H * 0.7, s.s, s.s); }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [{ y: 0.22, amp: 60, sp: 0.011, hue: 150, a: 0.32 }, { y: 0.32, amp: 80, sp: 0.008, hue: 175, a: 0.26 }, { y: 0.18, amp: 50, sp: 0.014, hue: 280, a: 0.2 }].forEach((r, ri) => {
    const base = r.y * H - c.y * 0.02;
    const g2 = ctx.createLinearGradient(0, base - 120, 0, base + 170);
    g2.addColorStop(0, `hsla(${r.hue},100%,60%,0)`); g2.addColorStop(0.4, `hsla(${r.hue},100%,62%,${r.a * (0.7 + 0.3 * Math.sin(t * 0.02 + ri))})`); g2.addColorStop(1, `hsla(${r.hue + 40},100%,60%,0)`);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, base + 200);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base + Math.sin(x * 0.004 + t * r.sp * 3 + ri) * r.amp + Math.sin(x * 0.011 - t * r.sp * 5) * r.amp * 0.4);
    for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, base + 140 + Math.sin(x * 0.006 - t * r.sp * 2 + ri) * r.amp * 0.5);
    ctx.closePath(); ctx.fill();
  });
  ctx.lineWidth = 2;                                                    // vertical curtain rays
  for (let x = 0; x <= W; x += 22) {
    const k = 0.5 + 0.5 * Math.sin(x * 0.02 + t * 0.03), y0 = H * 0.2 + Math.sin(x * 0.004 + t * 0.02) * 60;
    ctx.strokeStyle = `hsla(${150 + 30 * Math.sin(x * 0.005 + t * 0.01)},100%,65%,${0.05 + 0.08 * k})`;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 140 + 60 * k); ctx.stroke();
  }
  ctx.restore();
  aetherialLayer();                                                     // the floating mountain summit + wind streaks (arenas.js)
  for (const cr of BG.crystals) {                                       // floating crystal shards
    const x = (((cr.x * W - c.x * 0.06 * cr.d) % W) + W) % W, y = cr.y * H + Math.sin(t * 0.02 + cr.ph) * 14 - c.y * 0.04 * cr.d;
    ctx.save(); ctx.translate(x, y); ctx.rotate(cr.rot + Math.sin(t * 0.01 + cr.ph) * 0.2);
    const sz = cr.s * (0.6 + cr.d * 0.5), cg = ctx.createLinearGradient(0, -sz, 0, sz);
    cg.addColorStop(0, 'rgba(190,255,240,0.7)'); cg.addColorStop(1, 'rgba(80,170,255,0.25)');
    ctx.shadowColor = '#8ff0ff'; ctx.shadowBlur = 14; ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.5, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.5, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(220,255,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  }
}

/* Mystic Forest: pulsing giant mushrooms, bioluminescent spores, mist */
function bgForest() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04141a'); g.addColorStop(0.6, '#0a2a2e'); g.addColorStop(1, '#0f1438');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(2,10,14,0.65)';                                  // distant trunks
  for (let i = 0; i < 9; i++) { const x = ((i * 190 - c.x * 0.08) % (W + 200) + W + 200) % (W + 200) - 100; ctx.fillRect(x, 0, 38 + (i % 3) * 14, H); }
  const base = H * 0.9 - (c.y - 330) * 0.04;
  for (const m of BG.mush.slice().sort((a, b) => a.depth - b.depth)) {
    const x = ((m.x - c.x * m.depth * 0.3) % 2200 + 2200) % 2200 - 300, pulse = 0.5 + 0.5 * Math.sin(t * 0.04 + m.ph);
    const w = m.w * (0.6 + m.depth * 0.6), h = m.h * (0.6 + m.depth * 0.6);
    ctx.fillStyle = `hsla(${m.hue},40%,14%,${0.5 + 0.3 * m.depth})`; ctx.fillRect(x - w * 0.12, base - h, w * 0.24, h);
    ctx.save(); ctx.shadowColor = `hsl(${m.hue},100%,60%)`; ctx.shadowBlur = 20 + 24 * pulse;
    ctx.fillStyle = `hsla(${m.hue},80%,${24 + 22 * pulse}%,${0.4 + 0.3 * m.depth})`;
    ctx.beginPath(); ctx.ellipse(x, base - h, w / 2, w * 0.28, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = `hsla(${m.hue},100%,75%,${0.3 + 0.5 * pulse})`;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * w * 0.22, base - h - w * 0.1 + Math.abs(i) * 6, 3 + 2 * pulse, 0, Math.PI * 2); ctx.fill(); }
  }
  g = ctx.createLinearGradient(0, base - 120, 0, H); g.addColorStop(0, 'rgba(120,255,220,0)'); g.addColorStop(1, 'rgba(60,200,180,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, base - 120, W, H - base + 120);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const s of BG.spores) {                                          // drifting spores
    const x = (((s.x * W + Math.sin(t * 0.01 + s.ph) * 30 - c.x * 0.05 * s.d) % W) + W) % W, y = (((s.y * H - t * s.v) % H) + H) % H;
    const pl = 0.5 + 0.5 * Math.sin(t * 0.05 + s.ph);
    ctx.fillStyle = `hsla(${s.hue},100%,70%,${0.25 + 0.5 * pl})`; ctx.beginPath(); ctx.arc(x, y, s.s * (0.7 + 0.3 * pl), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* Clockwork Citadel: rotating brass gears, pipes, steam vents */
function bgClockwork() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#140c06'); g.addColorStop(0.6, '#2b1a0c'); g.addColorStop(1, '#40280f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  BG.gears.forEach((gr, i) => {
    const layer = i % 3, par = 0.03 + layer * 0.03;
    ctx.globalAlpha = 0.5 + layer * 0.15;
    drawGear(gr.x * W - c.x * par, gr.y * H - c.y * par * 0.5, gr.r, gr.teeth, t * 0.004 * gr.dir * (1 + layer * 0.3), 'rgba(110,72,28,0.55)', '#c08a3a');
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7a5528'; ctx.lineWidth = 10;                        // brass pipes
  for (const y of [H * 0.3, H * 0.72]) { ctx.beginPath(); ctx.moveTo(0, y - c.y * 0.02); ctx.lineTo(W, y - c.y * 0.02); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,220,150,0.25)'; ctx.lineWidth = 2;
  for (const y of [H * 0.3, H * 0.72]) { ctx.beginPath(); ctx.moveTo(0, y - 3 - c.y * 0.02); ctx.lineTo(W, y - 3 - c.y * 0.02); ctx.stroke(); }
  for (const v of BG.vents) {                                           // steam vents
    const bx = v.x * W - c.x * 0.04, burst = 0.5 + 0.5 * Math.sin(t * 0.02 + v.ph * 6);
    for (let i = 0; i < 9; i++) {
      const u = ((t * 0.011 + v.ph + i / 9) % 1), y = H * 0.94 - u * 300, x = bx + Math.sin(u * 7 + i) * 20 * u;
      ctx.fillStyle = `rgba(235,230,220,${(1 - u) * 0.28 * (0.4 + burst)})`; ctx.beginPath(); ctx.arc(x, y, 10 + u * 34, 0, Math.PI * 2); ctx.fill();
    }
  }
  g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,4,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

Object.assign(BG, { bubbles: [], kelp: [], sand: [], dunes: [[], []], ruins: [], snow: [], ridges: [[], []] });
(function initBackgrounds3() {
  for (let i = 0; i < 70; i++) BG.bubbles.push({ x: Math.random(), y: Math.random(), v: rand(0.4, 1.4), r: rand(1.5, 6), ph: Math.random() * 6.28, d: rand(0.3, 1) });
  for (let i = 0; i < 14; i++) BG.kelp.push({ x: Math.random() * 1800 - 250, h: rand(140, 320), ph: Math.random() * 6.28, d: rand(0.2, 0.8), hue: rand(150, 200) });
  for (let i = 0; i < 160; i++) BG.sand.push({ x: Math.random(), y: Math.random(), v: rand(6, 16), len: rand(6, 26), d: rand(0.3, 1) });
  for (let l = 0; l < 2; l++) { let x = -200; while (x < 1600) { BG.dunes[l].push([x, rand(l ? 0.66 : 0.56, l ? 0.76 : 0.66)]); x += rand(120, 220); } }
  for (let i = 0; i < 7; i++) BG.ruins.push({ x: Math.random() * 1900 - 300, w: rand(30, 60), h: rand(90, 230), depth: rand(0.2, 0.8), broken: rand(0.1, 0.4) });
  for (let i = 0; i < 220; i++) BG.snow.push({ x: Math.random(), y: Math.random(), v: rand(0.8, 3.2), s: rand(1, 3.6), ph: Math.random() * 6.28, d: rand(0.3, 1) });
  for (let l = 0; l < 2; l++) { let x = -200; while (x < 1600) { BG.ridges[l].push([x, rand(l ? 0.5 : 0.3, l ? 0.66 : 0.5)]); x += rand(70, 150); } }
})();

/* Abyssal Depths: deep-water gradient, light shafts, swaying kelp, rising bubbles (+ a screen-warp overlay in render) */
function bgAbyss() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a3a5c'); g.addColorStop(0.5, '#05203a'); g.addColorStop(1, '#010812');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {                                         // god-rays swaying from the surface
    const x = (i * 260 + Math.sin(t * 0.006 + i * 1.3) * 60 - c.x * 0.04) % (W + 300) - 100, w = 70 + (i % 3) * 30;
    g = ctx.createLinearGradient(0, 0, 0, H * 0.85); g.addColorStop(0, 'rgba(120,220,255,0.16)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 2.4 + 80, H * 0.85); ctx.lineTo(x + w * 1.2 + 80, H * 0.85); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const base = H * 1.02 - (c.y - 330) * 0.05;
  ctx.lineCap = 'round';
  for (const k of BG.kelp) {                                            // swaying kelp forest
    const x0 = ((k.x - c.x * k.d * 0.3) % 2200 + 2200) % 2200 - 300, h = k.h * (0.6 + k.d * 0.6);
    ctx.strokeStyle = `hsla(${k.hue},60%,${18 + k.d * 14}%,${0.4 + 0.4 * k.d})`; ctx.lineWidth = 6 + k.d * 8;
    ctx.beginPath(); ctx.moveTo(x0, base);
    for (let s = 1; s <= 8; s++) { const u = s / 8; ctx.lineTo(x0 + Math.sin(t * 0.02 + k.ph + u * 3) * 22 * u, base - h * u); }
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {                                      // caustic shimmer bands
    ctx.strokeStyle = `rgba(150,230,255,${0.04 + 0.03 * Math.sin(t * 0.03 + y)})`; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 0.04 + y) * 8);
    ctx.stroke();
  }
  jellyfishLayer();                                                      // bioluminescent jellyfish (arenas.js)
  for (const b of BG.bubbles) {                                          // rising, wobbling bubbles
    const x = (((b.x * W + Math.sin(t * 0.04 + b.ph) * 10 - c.x * 0.06 * b.d) % W) + W) % W, y = (((b.y * H - t * b.v) % (H + 20)) + H + 20) % (H + 20) - 10;
    ctx.strokeStyle = `rgba(200,245,255,${0.25 + 0.45 * b.d})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - b.r * 0.4, y - b.r * 0.5, 1.5, 1.5);
  }
}

/* Desert Ruins: hot sky, layered dunes, crumbling pillars, horizontal sandstorm streaks */
function bgDesert() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a2a1a'); g.addColorStop(0.45, '#c46a34'); g.addColorStop(1, '#f0b060');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * 0.3 - c.x * 0.02, sy = H * 0.3;                         // hazy sun
  g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220); g.addColorStop(0, 'rgba(255,240,200,0.85)'); g.addColorStop(0.25, 'rgba(255,200,120,0.3)'); g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  BG.dunes.forEach((layer, l) => {
    ctx.fillStyle = l ? '#a85a2c' : '#c97b40'; ctx.beginPath(); ctx.moveTo(0, H);
    for (const [x, y] of layer) ctx.lineTo(x - c.x * (0.03 + l * 0.04), y * H - (c.y - 330) * 0.05);
    ctx.lineTo(W + 300, H); ctx.closePath(); ctx.fill();
  });
  for (const r of BG.ruins) {                                            // broken sandstone pillars
    const x = ((r.x - c.x * r.depth * 0.3) % 2200 + 2200) % 2200 - 300, base = H * 0.8, h = r.h * (0.6 + r.depth * 0.6), w = r.w * (0.6 + r.depth * 0.5);
    ctx.fillStyle = `rgba(${90 + r.depth * 60},${50 + r.depth * 30},${30 + r.depth * 10},${0.55 + r.depth * 0.4})`;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h); ctx.lineTo(x + w * 0.4, base - h * (1 - r.broken * 0.3)); ctx.lineTo(x + w * 0.7, base - h * (1 - r.broken)); ctx.lineTo(x + w, base - h * 0.9); ctx.lineTo(x + w, base); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 5, base - h - 2, w * 0.5, 6);
  }
  const gust = 0.6 + 0.4 * Math.sin(t * 0.013);                          // sandstorm gusts
  ctx.fillStyle = `rgba(230,170,100,${0.12 + 0.12 * gust})`; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.lineCap = 'round';
  for (const s of BG.sand) {
    const x = (((s.x * W + t * s.v * gust - c.x * 0.1 * s.d) % (W + 60)) + W + 60) % (W + 60) - 30, y = s.y * H + Math.sin(t * 0.05 + s.x * 40) * 6;
    ctx.strokeStyle = `rgba(255,220,170,${0.15 + 0.35 * s.d * gust})`; ctx.lineWidth = 0.8 + s.d * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.len * gust, y + 1); ctx.stroke();
  }
  ctx.restore();
}

/* Frozen Peak: pale sky, layered icy ridges, heavy blowing snow */
function bgPeak() {
  const t = G.time, c = G.cam;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2c4a'); g.addColorStop(0.55, '#5a7ea6'); g.addColorStop(1, '#c4dcf0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  BG.ridges.forEach((layer, l) => {
    ctx.fillStyle = l ? '#d8ecf8' : '#8eb2d0'; ctx.beginPath(); ctx.moveTo(0, H);
    for (const [x, y] of layer) ctx.lineTo(x - c.x * (0.03 + l * 0.05), y * H - (c.y - 330) * 0.06);
    ctx.lineTo(W + 300, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  });
  g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(230,245,255,0)'); g.addColorStop(1, 'rgba(230,245,255,0.45)');   // valley mist
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  const wind = 1.5 + Math.sin(t * 0.01) * 1.2;
  for (const s of BG.snow) {                                             // heavy, wind-blown snowfall
    const x = (((s.x * W + t * wind * s.d + Math.sin(t * 0.03 + s.ph) * 12 - c.x * 0.1 * s.d) % W) + W) % W, y = (((s.y * H + t * s.v) % H) + H) % H;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * s.d})`; ctx.beginPath(); ctx.arc(x, y, s.s * s.d, 0, Math.PI * 2); ctx.fill();
  }
}

Object.assign(BG, { vines: [], leaves: [], flares: [], embers2: [], drops: [], cloudsS: [] });
(function initBackgrounds4() {
  for (let i = 0; i < 16; i++) BG.vines.push({ x: Math.random() * 1700 - 200, len: Math.floor(rand(6, 14)), seg: rand(14, 22), ph: Math.random() * 6.28, d: rand(0.3, 1) });
  for (let i = 0; i < 46; i++) BG.leaves.push({ x: Math.random(), y: Math.random(), v: rand(0.4, 1.2), s: rand(4, 8), ph: Math.random() * 6.28, rot: Math.random() * 6.28, hue: rand(80, 140) });
  for (let i = 0; i < 7; i++) BG.flares.push({ a: rand(-2.6, -0.5), r: rand(140, 260), ph: Math.random() * 6.28, sp: rand(0.004, 0.012) });
  for (let i = 0; i < 90; i++) BG.embers2.push({ x: Math.random(), y: Math.random(), v: rand(0.6, 2), s: rand(1, 3), ph: Math.random() * 6.28 });
  for (let i = 0; i < 260; i++) BG.drops.push({ x: Math.random(), y: Math.random(), v: rand(14, 24), len: rand(14, 30), d: rand(0.3, 1) });
  for (let i = 0; i < 12; i++) BG.cloudsS.push({ x: Math.random() * 1800, y: rand(0, 0.35), w: rand(260, 520), h: rand(60, 120), sp: rand(0.2, 0.6) });
})();

// Desert Mirage overlay: heat-wave distortion (offsets narrow columns of the finished frame with an oscillating wave)
function heatHaze() {
  const t = G.time, w = canvas.width, h = canvas.height, band = Math.ceil(16 * DPR);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let x = 0; x < w; x += band) ctx.drawImage(canvas, x, 0, band, h, x, Math.sin(x / DPR * 0.03 + t * 0.12) * 1.6 * DPR, band, h);
  ctx.restore();
}

/* Storm Citadel: rolling storm clouds, castle towers, heavy slanted rain, lightning that lights everything */
function bgStorm() {
  const t = G.time, c = G.cam, fl = stormFlash();
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0e1a'); g.addColorStop(0.6, '#1a2234'); g.addColorStop(1, '#0c1018');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (fl > 0) {                                                           // sky lights up + a distant bolt
    ctx.fillStyle = `rgba(170,190,255,${fl * 0.45})`; ctx.fillRect(0, 0, W, H);
    const bx = hash(Math.floor(t / 110) * 3.7) * W; ctx.strokeStyle = `rgba(230,240,255,${fl})`; ctx.lineWidth = 3; ctx.shadowColor = '#9db8ff'; ctx.shadowBlur = 20;
    ctx.beginPath(); let x = bx; ctx.moveTo(x, 0); for (let y = 0; y < H * 0.6; y += 30) { x += (hash(y + bx) - 0.5) * 50; ctx.lineTo(x, y); } ctx.stroke(); ctx.shadowBlur = 0;
  }
  for (const cl of BG.cloudsS) {                                          // dark rolling clouds, rim-lit by lightning
    const x = (((cl.x + t * cl.sp - c.x * 0.05) % (W + 600)) + W + 600) % (W + 600) - 300, y = cl.y * H;
    ctx.fillStyle = `rgba(${30 + fl * 120},${36 + fl * 120},${54 + fl * 140},0.85)`;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + i * cl.w * 0.24, y + Math.sin(i * 1.9) * 12, cl.w * 0.3, cl.h * (0.7 + 0.2 * (i % 2)), 0, 0, Math.PI * 2); ctx.fill(); }
  }
  const base = H * 0.95 - (c.y - 330) * 0.05;                              // citadel towers
  ctx.fillStyle = `rgba(${8 + fl * 60},${10 + fl * 60},${18 + fl * 80},0.95)`;
  for (const [x0, w, h] of [[80, 90, 360], [260, 60, 260], [960, 70, 300], [1120, 100, 400]]) {   // ruined gothic towers: pointed spires, arched windows, broken tops
    const x = x0 - c.x * 0.1 + 64; ctx.fillRect(x, base - h, w, h);
    if (w > 80) { ctx.beginPath(); ctx.moveTo(x - 6, base - h); ctx.lineTo(x + w / 2, base - h - 110); ctx.lineTo(x + w + 6, base - h); ctx.closePath(); ctx.fill(); }   // spire
    else for (let k = 0; k < w; k += 18) ctx.fillRect(x + k, base - h - 14 + (k % 36 ? 6 : 0), 10, 14);                                                           // crumbling battlements
    for (let k = 0; k < 2; k++) {                                                                                                                                  // lancet windows
      const wy = base - h + 50 + k * 110, wx = x + w / 2 - 9;
      ctx.fillStyle = `rgba(255,200,120,${0.25 + fl * 0.4})`; ctx.beginPath(); ctx.moveTo(wx, wy + 40); ctx.lineTo(wx, wy + 10); ctx.quadraticCurveTo(wx + 9, wy - 8, wx + 18, wy + 10); ctx.lineTo(wx + 18, wy + 40); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = `rgba(${8 + fl * 60},${10 + fl * 60},${18 + fl * 80},0.95)`;
  }
  const wind = 0.35 + 0.25 * Math.sin(t * 0.01);                           // heavy slanted rain with wind gusts
  ctx.strokeStyle = `rgba(170,190,230,${0.3 + fl * 0.4})`; ctx.lineWidth = 1.2; ctx.beginPath();
  for (const d of BG.drops) {
    const x = (((d.x * W + t * d.v * wind - c.x * 0.1 * d.d) % W) + W) % W, y = ((d.y * H + t * d.v) % (H + 40)) - 20;
    ctx.moveTo(x, y); ctx.lineTo(x - d.len * wind, y - d.len);
  }
  ctx.stroke();
}

/* Abyssal Depths overlay: shifts horizontal strips of the finished frame to fake underwater refraction */
function underwaterWarp() {
  const t = G.time, w = canvas.width, h = canvas.height, band = Math.ceil(18 * DPR);   // fewer, taller bands: same wobble, ~half the self-blit cost
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let y = 0; y < h; y += band) ctx.drawImage(canvas, 0, y, w, band, Math.sin(y / DPR * 0.025 + t * 0.06) * 2.2 * DPR, y, w, band);
  ctx.fillStyle = 'rgba(20,90,140,0.08)'; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* Interactive menu backdrop: glowing particle streams + floating shapes that react to the mouse */
function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function drawMenuBackdrop() {
  const t = G.time;
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04051a'); g.addColorStop(1, '#0c0a26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const target = hexRGB(G.tintTarget || '#7b5cff'), cur = G.tintRGB || (G.tintRGB = target.slice());
  for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * 0.08;
  g = ctx.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.45, W * 0.65);
  g.addColorStop(0, `rgba(${cur[0] | 0},${cur[1] | 0},${cur[2] | 0},0.22)`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';                    // radial "mesh gradient": slow drifting colour blobs
  for (const [hx, hy, r, col, sp] of [[0.2, 0.3, 420, '120,60,255', 0.7], [0.8, 0.25, 380, '0,200,255', 1], [0.65, 0.8, 460, '255,40,160', 0.8], [0.25, 0.85, 340, '60,255,190', 1.2]]) {
    const x = hx * W + Math.sin(t * 0.004 * sp + hx * 9) * 120, y = hy * H + Math.cos(t * 0.005 * sp + hy * 7) * 80;
    g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  const mx = mouse.cx, my = mouse.cy;
  ctx.save(); ctx.lineWidth = 1.5;
  for (const sh of BG.shapes) {                                         // floating ambient shapes (mouse parallax)
    sh.rot += sh.vr;
    const x = (((sh.x * W + t * sh.vx * 6 - (mx - W / 2) * 0.05 * sh.d) % (W + 200)) + W + 200) % (W + 200) - 100;
    const y = (((sh.y * H + t * sh.vy * 6 - (my - H / 2) * 0.05 * sh.d) % (H + 200)) + H + 200) % (H + 200) - 100;
    ctx.strokeStyle = `hsla(${sh.hue},90%,65%,${0.35 * sh.d})`; ctx.shadowColor = `hsl(${sh.hue},100%,60%)`; ctx.shadowBlur = 12;
    ctx.beginPath();
    if (sh.k === 2) ctx.arc(x, y, sh.r * 0.7, 0, Math.PI * 2);
    else { const n = sh.k === 0 ? 3 : 6; for (let i = 0; i <= n; i++) { const a = sh.rot + i * Math.PI * 2 / n; ctx.lineTo(x + Math.cos(a) * sh.r, y + Math.sin(a) * sh.r); } }
    ctx.stroke();
  }
  ctx.restore();
  if (G.screen === 'scr-main' || G.screen === 'scr-intro') {                                       // title screen: a 3D particle field flying at the camera + sweeping stage lights
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const F = BG.field || (BG.field = Array.from({ length: 160 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: Math.random(), h: rand(190, 320) })));
    for (const p of F) {
      p.z -= 0.0035; if (p.z <= 0.02) { p.z = 1; p.x = rand(-1, 1); p.y = rand(-1, 1); }
      const k = 1 / p.z, x = W / 2 + p.x * W * 0.35 * k - (mx - W / 2) * 0.04 * k, y = H / 2 + p.y * H * 0.35 * k - (my - H / 2) * 0.04 * k;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const s = Math.min(4, 0.6 * k), a = Math.min(1, (1 - p.z) * 1.4);
      ctx.fillStyle = `hsla(${p.h},100%,75%,${0.65 * a})`; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (k > 3) { ctx.strokeStyle = `hsla(${p.h},100%,75%,${0.25 * a})`; ctx.lineWidth = s * 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (x - W / 2) * 0.06, y - (y - H / 2) * 0.06); ctx.stroke(); }   // motion streak near the lens
    }
    for (const [ox, sp, col] of [[0.22, 1, '150,120,255'], [0.78, -1.3, '34,230,255']]) {   // two stage lights sweeping across the logo
      const bx = W * ox, by = H + 40, a = -Math.PI / 2 + Math.sin(t * 0.008 * sp) * 0.55;
      const g2 = ctx.createLinearGradient(bx, by, bx + Math.cos(a) * H, by + Math.sin(a) * H); g2.addColorStop(0, `rgba(${col},0.32)`); g2.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.09) * H * 1.3, by + Math.sin(a - 0.09) * H * 1.3); ctx.lineTo(bx + Math.cos(a + 0.09) * H * 1.3, by + Math.sin(a + 0.09) * H * 1.3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const p of BG.streams) {                                         // glowing particle streams
    const u = (p.p + t * 0.0016 * p.sp) % 1, base = H * (0.25 + 0.16 * p.lane);
    let x = u * (W + 200) - 100, y = base + Math.sin(x * 0.006 + p.lane * 1.7 + t * 0.012) * p.amp;
    const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy);
    if (d < 150 && d > 0) { const f = (150 - d) / 150; x += dx / d * f * 60; y += dy / d * f * 60; }
    ctx.strokeStyle = `hsla(${p.hue},100%,68%,0.35)`; ctx.lineWidth = p.s;
    ctx.beginPath(); ctx.moveTo(x - 16, y - Math.cos(x * 0.006 + p.lane * 1.7 + t * 0.012) * p.amp * 0.1); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = `hsla(${p.hue},100%,75%,0.8)`; ctx.beginPath(); ctx.arc(x, y, p.s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* ================= Competitive set: clean, distraction-free backgrounds =================
 * Rules: dark and low-contrast so fighters and platform edges always read first; slow, low-opacity motion only. */
function cleanVignette(a) {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function skyGradient(stops) { const g = ctx.createLinearGradient(0, 0, 0, H); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }

/* Matrix Vault: faint columns of falling code cells */
function bgVault() {
  const t = G.time, c = G.cam;
  skyGradient(['#010603', '#03110a', '#010603']);
  const colW = 34, n = Math.ceil(W / colW) + 2, ox = ((-c.x * 0.05) % colW + colW) % colW;
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + hash(i) * 1.2, head = ((t * sp + hash(i + 40) * 900) % (H + 300)) - 150, x = ox + (i - 1) * colW + 10;
    for (let k = 0; k < 14; k++) {
      const y = head - k * 16; if (y < -10 || y > H) continue;
      const a = (k === 0 ? 0.32 : 0.16 * (1 - k / 14)) * (0.5 + 0.5 * hash(i * 31 + ((t >> 4) + k)));
      ctx.fillStyle = k === 0 ? `rgba(200,255,220,${a})` : `rgba(57,255,122,${a})`;
      ctx.fillRect(x, y, 7 + hash(i + k) * 5, 10);                                   // a "glyph" cell
    }
  }
  cleanVignette(0.6);
}

/* Grand Prix Speedway — a 4-layer parallax night race:
 *   L0 sky: deep night gradient, haze, sweeping stadium spotlights (additive)
 *   L1 far: grandstands packed with a twinkling crowd, an LED screen, floodlight towers   (parallax 0.04)
 *   L2 mid: pit-lane garages, the track with race cars streaking past as light trails, light shafts   (parallax 0.12)
 *   L3: the stage itself (stage.js) + the in-match vignette (render.js)                                              */
function bgSpeedway() {
  const t = G.time, c = G.cam;
  // L0: sky + haze + spotlights
  let g = ctx.createRadialGradient(W * 0.5, H * 0.15, 40, W * 0.5, H * 0.4, W * 0.8);
  g.addColorStop(0, '#1d1a46'); g.addColorStop(0.55, '#0c0b24'); g.addColorStop(1, '#05040e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {                                                         // spotlight cones sweeping from the towers
    const bx = W * (0.12 + i * 0.25) - c.x * 0.04, a = Math.PI / 2 + Math.sin(t * 0.008 + i * 1.9) * 0.55 + (i < 2 ? -0.25 : 0.25);
    const len = 900, sp = 0.09;
    const lg = ctx.createLinearGradient(bx, 120, bx + Math.cos(a) * len * 0.6, 120 - Math.sin(a) * len * 0.6);
    lg.addColorStop(0, 'rgba(210,225,255,0.16)'); lg.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(bx, 130);
    ctx.lineTo(bx + Math.cos(a - sp) * len, 130 - Math.sin(a - sp) * len); ctx.lineTo(bx + Math.cos(a + sp) * len, 130 - Math.sin(a + sp) * len); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // L1: grandstands (tiered), crowd flashes, LED screen, floodlight towers
  const gy = H * 0.5 - (c.y - 330) * 0.04, ox = -c.x * 0.04;
  ctx.fillStyle = '#0d0c22';
  ctx.beginPath(); ctx.moveTo(0, gy + 40); for (let x = -40; x <= W + 40; x += 160) { ctx.lineTo(x + ox, gy - 30 - hash(x) * 20); ctx.lineTo(x + ox + 150, gy - 30 - hash(x) * 20); } ctx.lineTo(W, gy + 200); ctx.lineTo(0, gy + 200); ctx.closePath(); ctx.fill();
  for (let row = 0; row < 5; row++) for (let i = 0; i < 70; i++) {                       // crowd: a sea of tiny lights, the odd camera flash
    const x = ((i * 19 + row * 9 + ox) % (W + 40) + W + 40) % (W + 40) - 20, y = gy - 18 + row * 11, k = hash(i * 13 + row * 7);
    const flash = hash(i * 3 + row + (t >> 3)) > 0.985;
    ctx.fillStyle = flash ? '#ffffff' : `hsla(${k * 360},70%,${55 + k * 20}%,${0.18 + 0.12 * k})`; ctx.fillRect(x, y, flash ? 3 : 2, 2);
  }
  const sx = W * 0.5 + ox - 90, sy = gy - 92;                                          // LED screen with a scrolling checkered banner
  ctx.fillStyle = '#05050c'; ctx.fillRect(sx - 4, sy - 4, 188, 58); ctx.fillStyle = '#10142e'; ctx.fillRect(sx, sy, 180, 50);
  for (let i = 0; i < 18; i++) for (let j = 0; j < 5; j++) if ((i + j + (t >> 4)) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(sx + i * 10, sy + j * 10, 10, 10); }
  ctx.fillStyle = 'rgba(255,47,87,0.85)'; ctx.fillRect(sx, sy + 20, 180, 10);
  for (const tx of [0.08, 0.36, 0.64, 0.92]) {                                          // floodlight towers
    const x = W * tx + ox; ctx.fillStyle = '#0a0918'; ctx.fillRect(x - 3, 110, 6, gy - 100);
    ctx.save(); ctx.shadowColor = '#e8f0ff'; ctx.shadowBlur = 24; ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x - 22, 100, 44, 14); ctx.restore();
  }
  // L2: pit-lane garages + track + cars streaking past + soft light shafts
  const ty = H * 0.8 - (c.y - 330) * 0.12, ox2 = -c.x * 0.12;
  ctx.fillStyle = '#121126'; ctx.fillRect(0, ty - 70, W, 70);
  for (let i = -1; i < 16; i++) {                                                       // garages with lit doorways in team colours
    const x = ((i * 96 + ox2) % 1536 + 1536) % 1536 - 96, hue = [350, 200, 45, 140, 280][((i % 5) + 5) % 5];
    ctx.fillStyle = `hsla(${hue},80%,55%,0.22)`; ctx.fillRect(x + 8, ty - 52, 74, 44); ctx.fillStyle = `hsla(${hue},90%,65%,0.7)`; ctx.fillRect(x + 8, ty - 54, 74, 3);
  }
  g = ctx.createLinearGradient(0, ty, 0, H); g.addColorStop(0, '#1c1c28'); g.addColorStop(1, '#0a0a12');
  ctx.fillStyle = g; ctx.fillRect(0, ty, W, H - ty);
  for (let x = ((ox2 * 1.5) % 40 + 40) % 40 - 40; x < W; x += 40) { ctx.fillStyle = (Math.round((x - ox2 * 1.5) / 40) & 1) ? '#ff2f57' : '#f4f4f8'; ctx.fillRect(x, ty, 40, 5); }   // kerb
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {                                                         // race cars: a bright head + long light streak
    const period = 140 + k * 37, ph = ((t + k * 61) % period) / period, dir = k & 1 ? -1 : 1;
    const x = dir > 0 ? -300 + ph * (W + 600) : W + 300 - ph * (W + 600), y = ty + 22 + k * 14, col = ['#ff2f57', '#3df0ff', '#ffd23a', '#7dff8a'][k];
    const sg = ctx.createLinearGradient(x - dir * 260, y, x, y); sg.addColorStop(0, rgba(col, 0)); sg.addColorStop(1, rgba(col, 0.75));
    ctx.strokeStyle = sg; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - dir * 260, y); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 3; i++) {                                                         // soft light shafts falling on the track
    const x = W * (0.2 + i * 0.3) + ox2, sg = ctx.createLinearGradient(0, 110, 0, ty + 40);
    sg.addColorStop(0, 'rgba(230,236,255,0.0)'); sg.addColorStop(1, 'rgba(230,236,255,0.07)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - 20, 110); ctx.lineTo(x + 20, 110); ctx.lineTo(x + 110, ty + 40); ctx.lineTo(x - 110, ty + 40); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  g = ctx.createLinearGradient(0, H * 0.35, 0, H * 0.75); g.addColorStop(0, 'rgba(60,50,120,0)'); g.addColorStop(1, 'rgba(60,50,120,0.12)');   // atmospheric haze
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// stage id → background (the new 4-layer arenas live in arenas.js)
const BACKGROUNDS = { speedway: bgSpeedway, forge: bgColiseum, aurora: bgAurora, neon: bgNeon, shrine: bgShrine, space: bgSpace, volcano: bgVolcano, vault: bgVault,
                      matrix: bgCaverns, haven: bgArchipelago, abyss: bgAbyss, clockwork: bgClockwork, storm: bgStorm, grid: bgDojo, peak: bgPeak,
                      quantum: bgToxic, skyline: bgOrbital, temple: bgShogun, desert: bgDesert, forest: bgForest, obsidian: bgManor, starlight: bgFinal,
                      stadium: bgStadium, sanctuary: bgSanctuary, highway: bgHighway, observatory: bgObservatory, expressway: bgExpressway, ruins: bgRuins,
                      cybercol: bgCyberColosseum, dock: bgDock, citadel: bgCitadel, caldera: bgCaldera, celestial: bgCelestial, subway: bgSubway, astral: bgAstral };
function drawBackground() { BACKGROUNDS[ST.id](); }
