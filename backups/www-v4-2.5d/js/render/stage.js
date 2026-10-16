/* NEON BRAWL — Stage geometry rendering. */
'use strict';

/* ---------------- Stage geometry ---------------- */
// Floating platforms get a stage-specific look (the collision surface is always the thin top line)
function drawPlatform(p) {
  const P = ST.pal, t = G.time;
  ctx.save();
  if (p.crumble) {                                                          // Forgotten Temple: crumbled ledges show a faint outline as they rebuild; cracking ones shudder
    if (p.downT > 0) {
      const k = 1 - p.downT / CRUMBLE_BACK; ctx.globalAlpha = 0.12 + 0.3 * k * k; ctx.setLineDash([6, 6]); ctx.strokeStyle = P.plat; ctx.lineWidth = 2;
      rr(p.x, p.y, p.w, p.h + 10, 3); ctx.stroke(); ctx.restore(); return;
    }
    const q = (p.crack || 0) / CRUMBLE_T; if (q > 0.3) ctx.translate(Math.sin(t * 1.7) * q * 2.5, Math.cos(t * 2.3) * q);
  }
  if (p.phase !== undefined) {                                              // Quantum Citadel: out-of-phase ledges are a faint wireframe; about-to-phase ones strobe
    if (p.downT > 0) { ctx.globalAlpha = 0.25; ctx.setLineDash([3, 5]); ctx.strokeStyle = P.plat; ctx.lineWidth = 1.5; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.stroke(); ctx.restore(); return; }
    if (p.warn) ctx.globalAlpha = (t >> 2) & 1 ? 0.3 : 0.9;
  }
  ctx.shadowColor = P.plat; ctx.shadowBlur = 16;
  if (p.launch) {                                                           // Starfighter Dock: a launch pad with chevrons pulsing upward
    ctx.fillStyle = '#2a303c'; rr(p.x, p.y, p.w, p.h + 8, 4); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) { const u = ((t * 0.04 + k / 3) % 1), y = p.y - 6 - u * 46; ctx.strokeStyle = rgba(P.plat, 0.8 * (1 - u)); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x + p.w / 2 - 22, y + 10); ctx.lineTo(p.x + p.w / 2, y); ctx.lineTo(p.x + p.w / 2 + 22, y + 10); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, p.y - 40, 0, p.y); g.addColorStop(0, rgba(P.plat, 0)); g.addColorStop(1, rgba(P.plat, 0.3)); ctx.fillStyle = g; ctx.fillRect(p.x + 8, p.y - 40, p.w - 16, 40);
  } else if (ST.id === 'dock' || ST.id === 'subway') {                      // a steel gantry with a yellow safety edge
    ctx.fillStyle = '#3a404c'; rr(p.x, p.y, p.w, p.h + 6, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd23a'; ctx.fillRect(p.x + 3, p.y + 1, p.w - 6, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; for (let x = p.x + 8; x < p.x + p.w - 4; x += 8) { ctx.beginPath(); ctx.moveTo(x, p.y + 5); ctx.lineTo(x, p.y + p.h + 5); ctx.stroke(); }
  } else if (ST.id === 'citadel' || ST.id === 'astral') {                   // a slab of solid light / crystal with a refracting edge
    const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h); g.addColorStop(0, rgba(P.plat, 0.35)); g.addColorStop(0.5, rgba(P.glow, 0.25)); g.addColorStop(1, rgba(P.plat, 0.35));
    ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(p.x + ((t * 1.5 + p.x) % p.w), p.y + 1, 14, 2);
  } else if (ST.id === 'caldera') {                                         // a slab of basalt with lava glowing through its cracks
    ctx.fillStyle = '#2a1a16'; rr(p.x, p.y, p.w, p.h + 8, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,120,40,${0.5 + 0.3 * Math.sin(t * 0.06 + p.x)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.2, p.y + 2); ctx.lineTo(p.x + p.w * 0.3, p.y + p.h + 6); ctx.moveTo(p.x + p.w * 0.65, p.y + 2); ctx.lineTo(p.x + p.w * 0.58, p.y + 9); ctx.lineTo(p.x + p.w * 0.7, p.y + p.h + 6); ctx.stroke();
  } else if (ST.id === 'celestial') {                                       // a drifting altar stone with a gold rim and a star glyph
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h + 10); g.addColorStop(0, '#4a4878'); g.addColorStop(1, '#22203e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.lineTo(p.x + p.w - 14, p.y + p.h + 12); ctx.lineTo(p.x + 14, p.y + p.h + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y + 1); ctx.lineTo(p.x + p.w, p.y + 1); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,230,168,0.7)'; const sx = p.x + p.w / 2, sy = p.y + p.h / 2 + 4;
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 2 : 5, a = i * Math.PI / 4 + t * 0.01; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  } else if (ST.id === 'ruins') {                                                  // Forgotten Temple: a mossy stone ledge, cracking as it's stood on
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h + 14); g.addColorStop(0, '#a8a07c'); g.addColorStop(1, '#5a5440');
    ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h + 14, 3); ctx.fill(); ctx.strokeStyle = '#2a2a1a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#6fae4a'; for (let x = p.x + 4; x < p.x + p.w - 4; x += 14) { ctx.beginPath(); ctx.arc(x + 7, p.y + 1, 5 + hash(x) * 3, Math.PI, 0); ctx.fill(); }   // moss
    ctx.strokeStyle = 'rgba(70,90,40,0.9)'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const x = p.x + p.w * (0.2 + i * 0.3), s = Math.sin(t * 0.03 + i + p.x) * 3; ctx.beginPath(); ctx.moveTo(x, p.y + p.h + 12); ctx.quadraticCurveTo(x + s, p.y + p.h + 24, x + s * 2, p.y + p.h + 34 + i * 5); ctx.stroke(); }   // trailing vines
    const q = (p.crack || 0) / CRUMBLE_T;
    if (q > 0.05) { ctx.strokeStyle = `rgba(30,24,12,${0.4 + 0.6 * q})`; ctx.lineWidth = 1.5 + q; ctx.beginPath();                                                       // cracks spread as it weakens
      ctx.moveTo(p.x + p.w * 0.5, p.y + 2); ctx.lineTo(p.x + p.w * 0.45, p.y + 8); ctx.lineTo(p.x + p.w * (0.5 - 0.25 * q), p.y + p.h + 12);
      if (q > 0.4) { ctx.moveTo(p.x + p.w * 0.45, p.y + 8); ctx.lineTo(p.x + p.w * (0.45 + 0.35 * q), p.y + 14); }
      if (q > 0.7) { ctx.moveTo(p.x + p.w * 0.2, p.y + 2); ctx.lineTo(p.x + p.w * 0.28, p.y + p.h + 12); }
      ctx.stroke(); }
  } else if (ST.id === 'stadium') {                                         // Neon Stadium: a lighting truss with chasing bulbs
    ctx.fillStyle = '#1a0a28'; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,46,230,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = p.x + 6; x < p.x + p.w - 6; x += 12) { ctx.moveTo(x, p.y + 3); ctx.lineTo(x + 6, p.y + p.h + 3); ctx.lineTo(x + 12, p.y + 3); } ctx.stroke();
    for (let x = p.x + 8, k = 0; x < p.x + p.w - 4; x += 16, k++) { ctx.fillStyle = (k + (t >> 3)) % 4 === 0 ? '#ffffff' : (k % 2 ? '#ff2ee6' : '#2ef0ff'); ctx.fillRect(x, p.y + p.h + 4, 4, 3); }
  } else if (ST.id === 'sanctuary') {                                       // Sky Sanctuary: a floating marble slab with gold inlay and a wisp of cloud beneath
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h + 10); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c8c0b0');
    ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h + 10, 3); ctx.fill(); ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd36e'; ctx.fillRect(p.x + 8, p.y + p.h + 2, p.w - 16, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(p.x + p.w * (0.25 + k * 0.25), p.y + p.h + 18 + Math.sin(t * 0.03 + k) * 2, 22, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (ST.id === 'highway' || ST.id === 'expressway') {               // Neon Highway / Expressway: an overhead gantry sign with a glowing strip
    ctx.fillStyle = ST.id === 'highway' ? '#1e4a2a' : '#121a30'; rr(p.x, p.y, p.w, p.h + 12, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 9px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ST.id === 'highway' ? (p.x < 640 ? '← EXIT 12' : 'CITY →') : (p.x < 640 ? 'SKYWAY 7' : 'LANE ' + (1 + (p.x >> 8) % 4)), p.x + p.w / 2, p.y + p.h / 2 + 5);
    ctx.fillStyle = P.plat; ctx.fillRect(p.x + 6, p.y + p.h + 9, p.w - 12, 2);
  } else if (ST.id === 'observatory') {                                     // Stellar Observatory: a brass gantry ring
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h + 6); g.addColorStop(0, '#e8c878'); g.addColorStop(1, '#6a4a20');
    ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h + 6, 4); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(154,184,255,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h + 3, p.w * 0.55, 6, 0, 0, Math.PI); ctx.stroke();
  } else if (ST.id === 'speedway') {                                               // pit gantry: dark beam with yellow-black hazard chevrons
    ctx.fillStyle = '#16161e'; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.fill();
    ctx.save(); rr(p.x, p.y, p.w, p.h + 6, 3); ctx.clip(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffd23a';
    for (let x = p.x - 16; x < p.x + p.w + 16; x += 16) { ctx.beginPath(); ctx.moveTo(x, p.y + p.h + 6); ctx.lineTo(x + 8, p.y + p.h + 6); ctx.lineTo(x + 16, p.y + 4); ctx.lineTo(x + 8, p.y + 4); ctx.closePath(); ctx.fill(); }
    ctx.restore(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.stroke();
  } else if (ST.clean) {                                                    // competitive set: dark bar, bright neon outline, white-hot top edge
    ctx.fillStyle = 'rgba(8,10,24,0.9)'; rr(p.x, p.y, p.w, p.h + 4, 4); ctx.fill();
    ctx.strokeStyle = P.plat; ctx.lineWidth = 3; ctx.stroke();
    ctx.shadowBlur = 8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + 4, p.y + 1); ctx.lineTo(p.x + p.w - 4, p.y + 1); ctx.stroke();
  } else if (ST.id === 'forest') {                                                 // pulsing mushroom cap on a stem
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.05 + p.x * 0.01);
    ctx.shadowBlur = 14 + 10 * pulse; ctx.fillStyle = '#0e3a34'; ctx.fillRect(p.x + p.w / 2 - 9, p.y + 6, 18, 46);
    ctx.fillStyle = `rgba(125,255,224,${0.22 + 0.14 * pulse})`;
    ctx.beginPath(); ctx.moveTo(p.x - 6, p.y + 10); ctx.quadraticCurveTo(p.x + p.w / 2, p.y - 26, p.x + p.w + 6, p.y + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * pulse})`; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x + p.w * i / 4, p.y - 4 - (i % 2) * 6, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = P.top; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y + 1); ctx.lineTo(p.x + p.w, p.y + 1); ctx.stroke();
  } else if (ST.id === 'clockwork') {                                       // bar carried by two spinning cogs
    ctx.fillStyle = 'rgba(217,154,58,0.25)'; rr(p.x, p.y, p.w, p.h, 4); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0; drawGear(p.x + 10, p.y + 18, 13, 8, t * 0.05, 'rgba(217,154,58,0.5)', P.plat); drawGear(p.x + p.w - 10, p.y + 18, 13, 8, -t * 0.05, 'rgba(217,154,58,0.5)', P.plat);
  } else if (ST.id === 'abyss') {                                           // coral shelf with swaying fronds
    ctx.fillStyle = 'rgba(255,127,168,0.22)'; rr(p.x, p.y, p.w, p.h + 4, 6); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let x = p.x + 12; x < p.x + p.w - 6; x += 22) { const s = Math.sin(t * 0.04 + x) * 5; ctx.beginPath(); ctx.moveTo(x, p.y + p.h + 3); ctx.quadraticCurveTo(x + s, p.y + p.h + 14, x + s * 1.6, p.y + p.h + 24); ctx.stroke(); }
  } else if (ST.id === 'desert') {                                          // weathered sandstone slab shedding grit
    ctx.fillStyle = 'rgba(70,38,16,0.75)'; rr(p.x, p.y, p.w, p.h + 6, 2); ctx.fill(); ctx.strokeStyle = P.top; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,160,0.7)';
    for (let i = 0; i < 3; i++) { const u = ((t * 0.012 + i / 3 + p.x * 0.001) % 1); ctx.fillRect(p.x + p.w * hash(i + p.x), p.y + p.h + 6 + u * 70, 2.5, 2.5); }
  } else if (ST.id === 'quantum') {                                         // Toxic Wasteland: rusted grating, dripping acid
    ctx.fillStyle = '#5a4a32'; rr(p.x, p.y, p.w, p.h + 6, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(30,20,10,0.7)'; ctx.lineWidth = 1.5; for (let x = p.x + 8; x < p.x + p.w; x += 10) { ctx.beginPath(); ctx.moveTo(x, p.y + 2); ctx.lineTo(x - 4, p.y + p.h + 4); ctx.stroke(); }
    ctx.fillStyle = '#9dff2e'; for (let i = 0; i < 3; i++) { const u = ((t * 0.01 + i / 3 + p.x * 0.003) % 1); ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(p.x + p.w * (0.2 + i * 0.3), p.y + p.h + 8 + u * 50, 2, 3.5, 0, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
  } else if (ST.id === 'temple') {                                          // Shogun's Palace: red-lacquered eave with gold trim and a hanging lantern
    ctx.fillStyle = '#8a2a20'; rr(p.x - 6, p.y, p.w + 12, p.h + 6, 3); ctx.fill(); ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.quadraticCurveTo(p.x + p.w / 2, p.y - 10, p.x + p.w + 14, p.y); ctx.lineTo(p.x + p.w + 6, p.y + 4); ctx.lineTo(p.x - 6, p.y + 4); ctx.closePath(); ctx.fill();
    const lx = p.x + p.w / 2, sw = Math.sin(t * 0.04 + p.x) * 2; ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, p.y + p.h + 6); ctx.lineTo(lx + sw, p.y + p.h + 18); ctx.stroke();
    ctx.shadowColor = '#ff8a5a'; ctx.shadowBlur = 16; ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.ellipse(lx + sw, p.y + p.h + 26, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  } else if (ST.id === 'forge') {                                           // Grand Coliseum: a bevelled marble slab
    const g = ctx.createLinearGradient(0, p.y - 2, 0, p.y + p.h + 8); g.addColorStop(0, '#fffaf0'); g.addColorStop(0.4, '#e8dcc4'); g.addColorStop(1, '#9a8a70');
    ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h + 8, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,100,80,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x + 10, p.y + 6); ctx.bezierCurveTo(p.x + 40, p.y + 12, p.x + 60, p.y + 2, p.x + 90, p.y + 10); ctx.stroke();   // marble vein
  } else if (ST.id === 'matrix') {                                          // Crystal Caverns: a ledge of glowing crystal
    ctx.fillStyle = 'rgba(60,30,110,0.85)'; rr(p.x, p.y, p.w, p.h + 6, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 22) { const h = 8 + hash(x) * 12; ctx.fillStyle = `rgba(160,220,255,${0.35 + 0.2 * Math.sin(t * 0.05 + x)})`; ctx.beginPath(); ctx.moveTo(x - 5, p.y + p.h + 6); ctx.lineTo(x, p.y + p.h + 6 + h); ctx.lineTo(x + 5, p.y + p.h + 6); ctx.closePath(); ctx.fill(); }
  } else if (ST.id === 'grid') {                                            // Neon Dojo: a dark wooden beam with neon trim
    ctx.fillStyle = '#3a2412'; rr(p.x, p.y, p.w, p.h + 4, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x + 4, p.y + 7); ctx.lineTo(p.x + p.w - 4, p.y + 7); ctx.stroke();
  } else if (ST.id === 'haven') {                                           // Floating Archipelago: a grassy chunk of floating rock with dangling roots
    ctx.fillStyle = '#7a6a5a'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 2); ctx.lineTo(p.x + p.w, p.y + 2); ctx.quadraticCurveTo(p.x + p.w * 0.6, p.y + 40, p.x + p.w / 2, p.y + 44); ctx.quadraticCurveTo(p.x + p.w * 0.3, p.y + 36, p.x, p.y + 2); ctx.fill();
    ctx.fillStyle = '#7fd05a'; rr(p.x - 3, p.y - 2, p.w + 6, 8, 4); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(90,70,50,0.8)'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const x = p.x + p.w * (0.3 + i * 0.12), s = Math.sin(t * 0.03 + i) * 3; ctx.beginPath(); ctx.moveTo(x, p.y + 30); ctx.quadraticCurveTo(x + s, p.y + 48, x + s * 2, p.y + 60 + i * 4); ctx.stroke(); }
  } else if (ST.id === 'obsidian') {                                        // Haunted Manor: a dusty bookshelf ledge with candles
    ctx.fillStyle = '#2a1a14'; rr(p.x, p.y, p.w, p.h + 6, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 2; i++) { const x = p.x + 16 + i * (p.w - 32); ctx.fillStyle = '#e8dcc4'; ctx.fillRect(x - 2, p.y - 12, 4, 12); ctx.shadowColor = '#ffcf6a'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.ellipse(x, p.y - 15 + Math.sin(t * 0.5 + i) * 0.6, 2, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
  } else if (ST.id === 'skyline') {                                         // Orbital Station: a metal catwalk with running lights
    ctx.fillStyle = '#4a5268'; rr(p.x, p.y, p.w, p.h + 4, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2; ctx.stroke();
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 20) { ctx.fillStyle = ((t >> 3) + x / 20) % 6 < 1 ? '#ffffff' : 'rgba(61,240,255,0.6)'; ctx.fillRect(x, p.y + p.h, 4, 2); }
  } else if (ST.id === 'storm') {                                           // wet slate battlement, lit by lightning
    const fl = stormFlash();
    ctx.fillStyle = `rgba(${60 + fl * 140},${70 + fl * 140},${100 + fl * 140},0.45)`; rr(p.x, p.y, p.w, p.h + 6, 2); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    for (let x = p.x; x < p.x + p.w; x += 24) ctx.fillRect(x, p.y - 7, 12, 7);
  } else if (ST.id === 'aurora' || ST.id === 'peak') {                      // faceted ice slab
    ctx.fillStyle = 'rgba(155,216,255,0.2)'; rr(p.x, p.y, p.w, p.h, 3); ctx.fill(); ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,255,255,0.5)'; for (let x = p.x + 14; x < p.x + p.w - 6; x += 24) { ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x + 8, p.y + p.h); ctx.stroke(); }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(p.x, p.y, p.w, p.h, 5); ctx.fill();
    ctx.strokeStyle = P.plat; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
}

function drawStageBody() {
  const S = STAGE, P = ST.pal, t = G.time;
  // Foreground polish (every stage): soft drop shadows cast beneath the stage and each floating platform
  if (!RENDER_FLAGS.stageTex) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 28;
    rr(S.x + 12, S.y + 20, S.w - 24, S.h, 10); ctx.fill();
    for (const p of PLATS) { if (!platUp(p)) continue; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + 30, p.w * 0.42, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = P.glow; ctx.shadowBlur = 24;
  const g = ctx.createLinearGradient(0, S.y, 0, S.y + S.h);
  g.addColorStop(0, P.fill[0]); g.addColorStop(1, P.fill[1]);
  ctx.fillStyle = g; rr(S.x, S.y, S.w, S.h, 8); ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 9; ctx.strokeStyle = '#04040c'; ctx.stroke();               // thick cartoon outer stroke...
  ctx.shadowBlur = 24; ctx.lineWidth = 3; ctx.strokeStyle = P.edge; ctx.stroke();                 // ...under the glowing neon edge
  ctx.shadowBlur = 0;
  ctx.strokeStyle = P.edge; ctx.globalAlpha = 0.25; ctx.lineWidth = 1.5;
  if (ST.clean) {                                                           // competitive set: a crisp double outline + one quiet inner bevel line
    ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.shadowColor = P.glow; ctx.shadowBlur = 18; rr(S.x, S.y, S.w, S.h, 8); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.22; ctx.lineWidth = 1.5; rr(S.x + 7, S.y + 7, S.w - 14, S.h - 14, 5); ctx.stroke();
  } else if (ST.id === 'speedway') {                                        // asphalt: red-white kerb along the lip, a grid-slot line, the start/finish checker
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    for (let x = S.x, k = 0; x < S.x + S.w; x += 24, k++) { ctx.fillStyle = k & 1 ? '#ff2f57' : '#f4f4f8'; ctx.fillRect(x, S.y, 24, 8); }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let x = S.x + 40; x < S.x + S.w - 30; x += 90) ctx.fillRect(x, S.y + 30, 34, 3);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) { ctx.fillStyle = (i + j) % 2 ? '#0a0a10' : '#ffffff'; ctx.fillRect(S.x + S.w / 2 - 8 + i * 8, S.y + 10 + j * 8, 8, 8); }
    ctx.restore();
  } else if (ST.id === 'space') {                                           // energy conduit
    ctx.globalAlpha = 0.7; ctx.setLineDash([26, 18]); ctx.lineDashOffset = -t * 1.5;
    ctx.beginPath(); ctx.moveTo(S.x + 14, S.y + S.h * 0.55); ctx.lineTo(S.x + S.w - 14, S.y + S.h * 0.55); ctx.stroke(); ctx.setLineDash([]);
  } else if (ST.id === 'shrine') {                                          // carved stone columns
    ctx.globalAlpha = 0.35; ctx.fillStyle = P.edge;
    for (let x = S.x + 30; x < S.x + S.w - 10; x += 62) { ctx.fillRect(x, S.y + 12, 10, S.h - 22); ctx.fillRect(x - 4, S.y + 8, 18, 5); }
  } else if (ST.id === 'dock') {                                            // Starfighter Dock: steel deck plates, hazard chevrons along the lip, landing lights
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.fillStyle = '#ffd23a'; for (let x = S.x - 20; x < S.x + S.w + 20; x += 28) { ctx.beginPath(); ctx.moveTo(x, S.y + 4); ctx.lineTo(x + 14, S.y + 4); ctx.lineTo(x + 26, S.y + 14); ctx.lineTo(x + 12, S.y + 14); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; for (let x = S.x + 85; x < S.x + S.w; x += 85) { ctx.beginPath(); ctx.moveTo(x, S.y + 16); ctx.lineTo(x, S.y + S.h); ctx.stroke(); }
    for (let x = S.x + 40, k = 0; x < S.x + S.w - 20; x += 85, k++) { ctx.fillStyle = ((t >> 4) + k) % 4 === 0 ? '#ffffff' : 'rgba(61,208,255,0.7)'; ctx.fillRect(x, S.y + S.h - 12, 10, 4); }
    ctx.restore();
  } else if (ST.id === 'citadel') {                                         // Quantum Citadel: a dark crystal block with shifting geometric etchings
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(90,255,240,0.3)'; ctx.lineWidth = 1.2;
    for (let x = S.x + ((t * 0.5) % 60) - 60; x < S.x + S.w + 60; x += 60) { ctx.beginPath(); ctx.moveTo(x, S.y + S.h); ctx.lineTo(x + 30, S.y + 8); ctx.lineTo(x + 60, S.y + S.h); ctx.stroke(); }
    ctx.restore();
  } else if (ST.id === 'celestial') {                                       // Celestial Shrine: temple stone inlaid with a gold star-dial
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.fillStyle = '#ffe6a8'; ctx.fillRect(S.x, S.y + 8, S.w, 2);
    ctx.strokeStyle = 'rgba(255,230,168,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(S.x + S.w / 2, S.y + S.h * 0.6, 120, 16, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.003; ctx.beginPath(); ctx.moveTo(S.x + S.w / 2, S.y + S.h * 0.6); ctx.lineTo(S.x + S.w / 2 + Math.cos(a) * 120, S.y + S.h * 0.6 + Math.sin(a) * 16); ctx.stroke(); }
    ctx.restore();
  } else if (ST.id === 'subway') {                                          // Neon Subways: concrete platform with a yellow tactile edge strip and a neon underlight
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(S.x, S.y + 3, S.w, 8); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = S.x + 3; x < S.x + S.w; x += 7) ctx.fillRect(x, S.y + 5, 3, 3);
    ctx.fillStyle = 'rgba(61,240,255,0.5)'; ctx.fillRect(S.x, S.y + S.h - 8, S.w, 3);
    ctx.restore();
  } else if (ST.id === 'astral') {                                          // Astral Void: a slab of night sky — stars drifting inside it
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) { const x = S.x + wrapX(hash(i) * S.w + t * (0.2 + hash(i * 2) * 0.4), S.w), y = S.y + 6 + hash(i * 3) * (S.h - 12); ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * hash(i * 5)})`; ctx.fillRect(x, y, 1.6, 1.6); }
    ctx.restore();
  } else if (ST.id === 'volcano' || ST.id === 'caldera') {                  // glowing lava cracks in the basalt
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 0.05); ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 2;
    for (let x = S.x + 20; x < S.x + S.w - 20; x += 54) {
      ctx.beginPath(); ctx.moveTo(x, S.y + 8); ctx.lineTo(x + 12, S.y + 26); ctx.lineTo(x - 4, S.y + 40); ctx.lineTo(x + 10, S.y + S.h - 8); ctx.stroke();
    }
  } else if (ST.id === 'aurora') {                                          // ice facets with a sliding sheen
    ctx.globalAlpha = 0.3; for (let x = S.x + 24; x < S.x + S.w; x += 46) { ctx.beginPath(); ctx.moveTo(x, S.y + 6); ctx.lineTo(x + 18, S.y + S.h - 6); ctx.stroke(); }
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#e0fff4'; ctx.fillRect(S.x + ((t * 2) % (S.w + 120)) - 60, S.y, 40, S.h);
  } else if (ST.id === 'matrix') {                                          // Crystal Caverns: geode rock with crystals glowing through it
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    for (let x = S.x + 20; x < S.x + S.w - 10; x += 46) { const h = 18 + hash(x) * 26, hue = 260 + hash(x * 3) * 80; ctx.fillStyle = `hsla(${hue},100%,72%,${0.35 + 0.15 * Math.sin(t * 0.04 + x)})`;
      ctx.beginPath(); ctx.moveTo(x - 9, S.y + S.h); ctx.lineTo(x, S.y + S.h - h); ctx.lineTo(x + 9, S.y + S.h); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  } else if (ST.id === 'grid') {                                            // Neon Dojo: tatami mats with dark borders
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    for (let x = S.x, k = 0; x < S.x + S.w; x += 100, k++) { ctx.fillStyle = k & 1 ? '#a89a5a' : '#b8aa66'; ctx.fillRect(x, S.y, 100, S.h); ctx.fillStyle = '#1a1408'; ctx.fillRect(x, S.y, 4, S.h); }
    ctx.strokeStyle = 'rgba(60,50,20,0.25)'; ctx.lineWidth = 1; for (let y = S.y + 4; y < S.y + S.h; y += 4) { ctx.beginPath(); ctx.moveTo(S.x, y); ctx.lineTo(S.x + S.w, y); ctx.stroke(); }
    ctx.restore();
  } else if (ST.id === 'haven') {                                           // Floating Archipelago: grass-topped earth with hanging roots
    ctx.globalAlpha = 1; ctx.fillStyle = '#6fcf4a'; rr(S.x - 4, S.y - 3, S.w + 8, 12, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,50,0.8)'; ctx.lineWidth = 2; for (let x = S.x + 40; x < S.x + S.w - 30; x += 70) { const s = Math.sin(t * 0.02 + x) * 4; ctx.beginPath(); ctx.moveTo(x, S.y + S.h - 4); ctx.quadraticCurveTo(x + s, S.y + S.h + 20, x + s * 2, S.y + S.h + 34 + (x % 3) * 8); ctx.stroke(); }
  } else if (ST.id === 'obsidian') {                                        // Haunted Manor: old floorboards
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#120a08'; ctx.lineWidth = 2; for (let y = S.y + 14; y < S.y + S.h; y += 14) { ctx.beginPath(); ctx.moveTo(S.x + 6, y); ctx.lineTo(S.x + S.w - 6, y); ctx.stroke(); }
    for (let r = 0, y = S.y; y < S.y + S.h - 4; r++, y += 14) for (let x = S.x + (r % 2 ? 50 : 110); x < S.x + S.w - 10; x += 120) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke(); }
  } else if (ST.id === 'skyline') {                                         // Orbital Station: deck panels with recessed lights
    ctx.globalAlpha = 0.45; for (let x = S.x + 60; x < S.x + S.w; x += 80) { ctx.beginPath(); ctx.moveTo(x, S.y + 6); ctx.lineTo(x, S.y + S.h - 6); ctx.stroke(); }
    ctx.globalAlpha = 1; for (let x = S.x + 30; x < S.x + S.w - 20; x += 80) { ctx.fillStyle = 'rgba(127,216,255,0.8)'; ctx.fillRect(x, S.y + S.h - 12, 20, 3); }
  } else if (ST.id === 'starlight') {                                       // Final Destination: energy rippling through the slab
    ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const y = S.y + 14 + i * 14; ctx.strokeStyle = `hsla(${280 - i * 30},100%,75%,0.6)`; ctx.beginPath(); for (let x = S.x + 10; x <= S.x + S.w - 10; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.03 + t * 0.08 + i) * 3); ctx.stroke(); }
  } else if (ST.id === 'forest') {                                          // mossy top and glowing roots
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#3dffb8'; for (let x = S.x + 10; x < S.x + S.w; x += 28) { ctx.beginPath(); ctx.arc(x, S.y + 2, 6 + (x % 3), Math.PI, 0); ctx.fill(); }
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 0.05); ctx.strokeStyle = '#7dffe0'; ctx.lineWidth = 2;
    for (let x = S.x + 30; x < S.x + S.w - 20; x += 70) { ctx.beginPath(); ctx.moveTo(x, S.y + 10); ctx.bezierCurveTo(x + 20, S.y + 30, x - 10, S.y + 44, x + 12, S.y + S.h - 6); ctx.stroke(); }
  } else if (ST.id === 'clockwork') {                                       // rivets and a turning cog
    ctx.globalAlpha = 0.6; ctx.fillStyle = P.edge; for (let x = S.x + 20; x < S.x + S.w; x += 34) { ctx.beginPath(); ctx.arc(x, S.y + 12, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x, S.y + S.h - 10, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 0.5; drawGear(S.x + S.w / 2, S.y + S.h / 2 + 2, 26, 10, t * 0.02, 'rgba(224,178,90,0.15)', P.edge);
  } else if (ST.id === 'abyss') {                                           // barnacled reef rock with glowing anemones
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#3fd6ff';
    for (let x = S.x + 18; x < S.x + S.w - 10; x += 36) { ctx.beginPath(); ctx.arc(x, S.y + 20 + (x % 3) * 9, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.05); ctx.strokeStyle = '#ff7fa8'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let x = S.x + 40; x < S.x + S.w - 30; x += 90) for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x, S.y + 2); ctx.lineTo(x + k * 5 + Math.sin(t * 0.05 + k) * 3, S.y - 12 + Math.abs(k) * 2); ctx.stroke(); }
  } else if (ST.id === 'desert') {                                          // stacked sandstone blocks with cracks
    ctx.globalAlpha = 0.35;
    for (let y = S.y + 26; y < S.y + S.h; y += 26) { ctx.beginPath(); ctx.moveTo(S.x + 6, y); ctx.lineTo(S.x + S.w - 6, y); ctx.stroke(); }
    for (let r = 0, y = S.y; y < S.y + S.h - 10; r++, y += 26) for (let x = S.x + (r % 2 ? 40 : 70); x < S.x + S.w - 10; x += 60) { ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, Math.min(y + 26, S.y + S.h - 4)); ctx.stroke(); }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#3a2212'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S.x + 90, S.y + 4); ctx.lineTo(S.x + 104, S.y + 30); ctx.lineTo(S.x + 96, S.y + 52); ctx.moveTo(S.x + S.w - 120, S.y + 30); ctx.lineTo(S.x + S.w - 104, S.y + S.h - 6); ctx.stroke();
  } else if (ST.id === 'quantum') {                                         // Toxic Wasteland: riveted rusty plating, acid stains glowing from below
    ctx.globalAlpha = 0.5; for (let x = S.x + 50; x < S.x + S.w; x += 100) { ctx.beginPath(); ctx.moveTo(x, S.y + 6); ctx.lineTo(x, S.y + S.h - 6); ctx.stroke(); }
    ctx.fillStyle = '#5a3a1a'; for (let x = S.x + 20; x < S.x + S.w; x += 34) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x, S.y + 10, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 0.05); ctx.fillStyle = '#9dff2e'; for (let x = S.x + 70; x < S.x + S.w; x += 150) { ctx.beginPath(); ctx.ellipse(x, S.y + S.h - 4, 30, 6, 0, Math.PI, 0); ctx.fill(); }
  } else if (ST.id === 'peak') {                                            // glassy ice: reflections + sliding glint
    ctx.globalAlpha = 0.3; for (let x = S.x + 24; x < S.x + S.w; x += 52) { ctx.beginPath(); ctx.moveTo(x, S.y + 6); ctx.lineTo(x + 22, S.y + S.h - 6); ctx.stroke(); }
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#ffffff'; ctx.fillRect(S.x + ((t * 3) % (S.w + 160)) - 80, S.y + 2, 26, S.h - 4);
    ctx.globalAlpha = 0.18; if (G.mode !== 'menu') for (const f of fighters) if (f.onGround && f.ground === 'stage' && f.state !== 'dead') {      // fighters' mirror reflections in the ice
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(f.x, S.y + 22, f.ch.bw * 0.45, 20, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff';                     // icicles hanging under the lip
    for (let x = S.x + 16; x < S.x + S.w - 10; x += 30) { const l = 10 + hash(x) * 22; ctx.beginPath(); ctx.moveTo(x - 4, S.y + S.h); ctx.lineTo(x, S.y + S.h + l); ctx.lineTo(x + 4, S.y + S.h); ctx.fill(); }
  } else if (ST.id === 'temple') {                                          // Shogun's Palace: polished wooden veranda boards with a gold-trimmed lip
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#2a0a06'; ctx.lineWidth = 2; for (let x = S.x + 24; x < S.x + S.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, S.y + 8); ctx.lineTo(x, S.y + S.h - 6); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffcf6a'; ctx.fillRect(S.x + 6, S.y + 6, S.w - 12, 2);
  } else if (ST.id === 'forge') {                                           // Grand Coliseum: a bevelled marble arena floor with inlaid stripes
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    const g = ctx.createLinearGradient(0, S.y, 0, S.y + S.h); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = g; ctx.fillRect(S.x, S.y, S.w, S.h);
    ctx.strokeStyle = 'rgba(120,100,70,0.35)'; ctx.lineWidth = 1.5; for (let x = S.x + 30; x < S.x + S.w; x += 90) { ctx.beginPath(); ctx.moveTo(x, S.y + 4); ctx.bezierCurveTo(x + 20, S.y + 20, x - 10, S.y + 40, x + 14, S.y + S.h); ctx.stroke(); }   // marble veins
    ctx.fillStyle = '#c8a050'; ctx.fillRect(S.x, S.y + S.h * 0.55, S.w, 4); ctx.restore();
  } else if (ST.id === 'storm') {                                           // rain-slick slate with lightning glints
    const fl = stormFlash();
    ctx.globalAlpha = 0.3; for (let x = S.x + 34; x < S.x + S.w - 34; x += 68) { ctx.strokeRect(x - 30, S.y + 10, 60, 24); if (x + 60 < S.x + S.w - 4) ctx.strokeRect(x, S.y + 36, 60, 24); }
    if (fl > 0) { ctx.globalAlpha = fl * 0.6; ctx.fillStyle = '#e8f0ff'; ctx.fillRect(S.x + 4, S.y + 2, S.w - 8, 6); }
  } else if (ST.id === 'stadium') {                                         // Neon Stadium: a glossy stage deck with a light-up floor that pulses on the beat
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    const kick = Math.pow(1 - (t % 40) / 40, 2);
    for (let x = S.x, k = 0; x < S.x + S.w; x += 40, k++) for (let y = S.y + 8, j = 0; y < S.y + S.h; y += 20, j++) { const on = hash(k * 7 + j * 13 + (t / 40 | 0)) > 0.6; ctx.fillStyle = on ? `rgba(${k % 2 ? '255,46,230' : '46,240,255'},${0.15 + 0.35 * kick})` : 'rgba(255,255,255,0.03)'; ctx.fillRect(x + 2, y, 36, 17); }
    ctx.restore();
  } else if (ST.id === 'sanctuary') {                                       // Sky Sanctuary: polished marble with gold inlay and an arcade of carved columns
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.fillStyle = '#ffd36e'; ctx.fillRect(S.x, S.y + 10, S.w, 3);
    ctx.fillStyle = 'rgba(160,150,130,0.35)'; for (let x = S.x + 24; x < S.x + S.w - 10; x += 48) { ctx.fillRect(x, S.y + 18, 12, S.h - 24); ctx.beginPath(); ctx.arc(x + 30, S.y + 30, 12, Math.PI, 0); ctx.fill(); }
    ctx.strokeStyle = 'rgba(150,140,120,0.3)'; ctx.lineWidth = 1; for (let x = S.x + 60; x < S.x + S.w; x += 130) { ctx.beginPath(); ctx.moveTo(x, S.y + 14); ctx.bezierCurveTo(x + 20, S.y + 30, x - 12, S.y + 44, x + 10, S.y + S.h); ctx.stroke(); }   // marble veins
    ctx.restore();
  } else if (ST.id === 'highway' || ST.id === 'expressway') {               // the road deck: asphalt, lane markings, and a crash barrier with reflectors
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.fillStyle = ST.id === 'highway' ? '#ffd23a' : '#2ef0ff'; for (let x = S.x + ((t * (ST.id === 'highway' ? 3 : 5)) % 70) - 70; x < S.x + S.w; x += 70) ctx.fillRect(x, S.y + 14, 36, 3);   // dashed centre line, scrolling with the traffic
    ctx.fillStyle = '#9aa0b0'; ctx.fillRect(S.x, S.y + S.h - 14, S.w, 6);
    for (let x = S.x + 16; x < S.x + S.w; x += 40) { ctx.fillStyle = (x >> 3) % 2 ? '#ff2f57' : '#ffffff'; ctx.fillRect(x, S.y + S.h - 13, 6, 4); }
    ctx.restore();
  } else if (ST.id === 'observatory') {                                     // Stellar Observatory: a brass-trimmed deck with a star-chart dial inlaid in it
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.strokeStyle = 'rgba(200,160,80,0.55)'; ctx.lineWidth = 1.5;
    for (let r = 14; r < 60; r += 14) { ctx.beginPath(); ctx.ellipse(S.x + S.w / 2, S.y + S.h * 0.55, r * 3, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save(); ctx.translate(S.x + S.w / 2, S.y + S.h * 0.55); ctx.rotate(t * 0.004); ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 160, Math.sin(a) * 26); } ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#c8a050'; ctx.fillRect(S.x, S.y + 6, S.w, 3);
    ctx.restore();
  } else if (ST.id === 'ruins') {                                           // Forgotten Temple: massive moss-covered blocks, carved glyphs glowing faintly
    ctx.globalAlpha = 1; ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
    ctx.strokeStyle = 'rgba(30,30,16,0.55)'; ctx.lineWidth = 2;
    for (let y = S.y + 26; y < S.y + S.h; y += 26) { ctx.beginPath(); ctx.moveTo(S.x, y); ctx.lineTo(S.x + S.w, y); ctx.stroke(); }
    for (let r = 0, y = S.y; y < S.y + S.h; r++, y += 26) for (let x = S.x + (r % 2 ? 46 : 90); x < S.x + S.w; x += 96) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 26); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(150,255,120,${0.25 + 0.15 * Math.sin(t * 0.04)})`; ctx.font = `700 14px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = S.x + 70, k = 0; x < S.x + S.w - 30; x += 140, k++) ctx.fillText(['◈', '✧', '◇', '❖'][k % 4], x, S.y + 40);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#6fae4a'; for (let x = S.x; x < S.x + S.w; x += 16) { ctx.beginPath(); ctx.arc(x + 8, S.y + 2, 6 + hash(x) * 5, Math.PI, 0); ctx.fill(); }   // moss along the lip
    ctx.restore();
  } else {                                                                  // neon city
    for (let x = S.x + 30; x < S.x + S.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, S.y + 8); ctx.lineTo(x - 14, S.y + S.h - 8); ctx.stroke(); }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = (t >> 5) & 1 ? '#ff4fd8' : '#22e6ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S.x + 12, S.y + S.h - 8); ctx.lineTo(S.x + S.w - 12, S.y + S.h - 8); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip(); ctx.shadowBlur = 0;                          // bevelled top edge: a light band fading down
  const bev = ctx.createLinearGradient(0, S.y, 0, S.y + 14); bev.addColorStop(0, 'rgba(255,255,255,0.3)'); bev.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bev; ctx.fillRect(S.x, S.y, S.w, 14); ctx.restore();
  ctx.strokeStyle = P.top; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(S.x + 6, S.y + 1.5); ctx.lineTo(S.x + S.w - 6, S.y + 1.5); ctx.stroke();
  ctx.shadowColor = P.plat; ctx.shadowBlur = 16;                            // floating pass-through platforms
  for (const p of PLATS) drawPlatform(p);
  ctx.restore();
  if (RENDER_FLAGS.stageTex) return;                                        // (3D: real bevels + lights; portals go in the overlay)
  drawPortals();
  drawBevels(); drawPlatformLight();                                        // render/atmosphere.js: chamfers, specular lips, volumetric spill
}
function drawPortals() {
  const P = ST.pal, t = G.time;
  if (ST.portals) for (const [i, q] of ST.portals.entries()) {              // Astral Void: two swirling time-warp portals
    ctx.save(); ctx.translate(q.x, q.y); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34); g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.4, rgba(P.edge, 0.5)); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { const a = t * 0.08 * (i ? -1 : 1) + k * 2.1; ctx.strokeStyle = rgba(k % 2 ? P.edge : P.plat, 0.8); ctx.beginPath(); ctx.arc(0, 0, 18 + k * 6, a, a + 3.4); ctx.stroke(); }
    ctx.restore();
  }
}

function drawStage() {
  ctx.save();
  ctx.setLineDash([22, 16]); ctx.lineWidth = 3; ctx.strokeStyle = ST.pal.bz;               // blastzone boundary
  ctx.strokeRect(BZ.l, BZ.t, BZ.r - BZ.l, BZ.b - BZ.t);
  ctx.restore();
  drawStageBody();
}

function drawRespawnPad(f) {
  if (f.state !== 'respawn') return;
  ctx.save();
  ctx.shadowColor = f.color; ctx.shadowBlur = 20; ctx.fillStyle = f.fill; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(f.x, f.y + 6, 48, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(f.x, f.y + 6, 30 + Math.sin(G.time * 0.2) * 4, 7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
