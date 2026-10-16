/* NEON BRAWL — Stage atmosphere: drifting fog bands, swaying light shafts, volumetric light around the platforms,
 * bevelled platform edges and per-stage directional particles (sparks, embers, ice mist, leaves, petals, rain…).
 * Everything is procedural and allocation-free: particle positions are a pure function of (index, time). */
'use strict';

// Particle theme per stage: kind, count, colours
const ATMO = {
  volcano: ['ember', 46, ['#ff8a3d', '#ffd23a', '#ff4a1a']], caldera: ['ember', 46, ['#ff8a3d', '#ffd23a', '#ff4a1a']],
  forge: ['ember', 22, ['#ffb347', '#ffe0a0']], speedway: ['spark', 26, ['#ffd23a', '#ffffff']], dock: ['spark', 22, ['#ffb84d', '#3dd0ff']],
  clockwork: ['spark', 18, ['#ffd38a', '#ffffff']], peak: ['snow', 60, ['#ffffff', '#d6fbff']], aurora: ['snow', 40, ['#e0fff4', '#9bd8ff']],
  forest: ['leaf', 26, ['#7dffe0', '#3dffb8', '#b0ff7a']], haven: ['leaf', 22, ['#7fd05a', '#c8f08a', '#ffe08a']], ruins: ['leaf', 24, ['#6fae4a', '#9ad86a', '#c8c098']],
  shrine: ['leaf', 22, ['#ffcf8a', '#ff9a5a', '#ffe0a0']], temple: ['petal', 34, ['#ffb0c8', '#ffd0e0', '#ffffff']], sanctuary: ['petal', 24, ['#ffffff', '#ffe6a0']],
  celestial: ['mote', 40, ['#ffe6a8', '#d8c8ff', '#ffffff']], storm: ['rain', 90, ['#b8c8ff']], abyss: ['bubble', 34, ['#a0f0ff', '#ffffff']],
  desert: ['dust', 50, ['#ffdca0', '#e8b070']], quantum: ['spore', 36, ['#9dff2e', '#e2ff5a']], vault: ['bit', 34, ['#3dff7a', '#a0ffc0']],
  grid: ['bit', 22, ['#ff4fd8', '#22e6ff']], cybercol: ['bit', 26, ['#3df0ff', '#ff4d6d']], citadel: ['shard', 26, ['#5afff0', '#b06bff']],
  space: ['mote', 40, ['#3df0ff', '#ffffff']], astral: ['mote', 50, ['#ff7af0', '#7af0ff', '#ffffff']], nebula: ['mote', 46, ['#c890ff', '#5ff2ff', '#ffffff']], starlight: ['mote', 40, ['#d8b0ff', '#ffffff']],
  observatory: ['mote', 30, ['#9ab8ff', '#fff3d0']], skyline: ['mote', 24, ['#7fd8ff', '#ffffff']], obsidian: ['mote', 26, ['#b0ffb8', '#d0d0ff']],
  matrix: ['mote', 30, ['#c0a0ff', '#a0e0ff']], highway: ['spark', 18, ['#ffd23a', '#ff4d6d']], expressway: ['bit', 20, ['#2ef0ff', '#ff4dd8']],
  subway: ['spark', 20, ['#3df0ff', '#ff4dd8']], stadium: ['mote', 30, ['#ff2ee6', '#2ef0ff', '#ffffff']],
  dragonspine: ['ember', 34, ['#ff8a3d', '#ffd23a', '#ff5a3a']], horizon: ['mote', 44, ['#ffae42', '#b98cff', '#ffffff']]
};
const atmoOf = st => ATMO[st.id] || ['mote', 24, [st.pal.glow, '#ffffff']];

/* ---- screen space, behind the arena: fog bands + light shafts ---- */
function drawAtmosphereBack() {
  if (SET.gfx === 'neon' && SET.part === 0) return;
  const P = ST.pal, t = G.time, c = G.cam || { x: 640, y: 330 };
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // light shafts: three slanted beams from above that sway and breathe (parallax-shifted with the camera)
  for (let k = 0; k < 3; k++) {
    const sx = W * (0.2 + k * 0.3) - (c.x - 640) * 0.15 + Math.sin(t * 0.004 + k * 2) * 60, sw = 70 + 30 * k, lean = 160 + 60 * Math.sin(t * 0.003 + k);
    const a = 0.045 + 0.025 * Math.sin(t * 0.011 + k * 1.7);
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.85); g.addColorStop(0, rgba(P.glow, a)); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - sw * 0.3, -10); ctx.lineTo(sx + sw * 0.3, -10); ctx.lineTo(sx + lean + sw, H * 0.85); ctx.lineTo(sx + lean - sw, H * 0.85); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // fog: two soft bands drifting across the lower arena, tinted with the stage's glow
  ctx.save();
  for (let k = 0; k < 2; k++) {
    const y = H * (0.66 + k * 0.16) - (c.y - 330) * (0.2 + k * 0.1) + Math.sin(t * 0.006 + k) * 8, hh = 70 + k * 40, a = 0.1 + 0.04 * k;
    const g = ctx.createLinearGradient(0, y - hh, 0, y + hh); g.addColorStop(0, rgba(P.glow, 0)); g.addColorStop(0.5, rgba(P.glow, a)); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(-VIEW.OX, y - hh, VIEW.LW, hh * 2);
    const m = ctx.createLinearGradient(0, y - hh * 0.5, 0, y + hh * 0.5); m.addColorStop(0, 'rgba(200,210,255,0)'); m.addColorStop(0.5, `rgba(200,210,255,${0.035 + 0.02 * k})`); m.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = m;                                                                                     // brighter wisps sliding sideways
    for (let i = 0; i < 4; i++) { const wx = wrapX(i * 420 + t * (0.25 + k * 0.2) * (k ? -1 : 1), VIEW.LW + 400) - 200 - VIEW.OX; ctx.beginPath(); ctx.ellipse(wx, y, 220, hh * 0.45, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

/* ---- world space, around the stage geometry: underside glow, rim light and bevels ---- */
function drawPlatformLight() {
  const S = STAGE, P = ST.pal, t = G.time, breathe = 0.85 + 0.15 * Math.sin(t * 0.03);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // volumetric spill under the main stage: a cone of coloured light falling away from the underside
  const g = ctx.createLinearGradient(0, S.y + S.h, 0, S.y + S.h + 150); g.addColorStop(0, rgba(P.glow, 0.22 * breathe)); g.addColorStop(1, rgba(P.glow, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(S.x + 30, S.y + S.h); ctx.lineTo(S.x + S.w - 30, S.y + S.h); ctx.lineTo(S.x + S.w + 60, S.y + S.h + 150); ctx.lineTo(S.x - 60, S.y + S.h + 150); ctx.closePath(); ctx.fill();
  // a pool of light on the stage top (the arena's key light)
  const pool = ctx.createRadialGradient(S.x + S.w / 2, S.y, 10, S.x + S.w / 2, S.y, S.w * 0.55);
  pool.addColorStop(0, `rgba(255,255,255,${0.07 * breathe})`); pool.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pool; ctx.fillRect(S.x - 40, S.y - 120, S.w + 80, 124);
  for (const p of PLATS) {                                                                 // each floating platform casts a soft glow down
    if (!platUp(p)) continue;
    const pg = ctx.createLinearGradient(0, p.y + p.h, 0, p.y + p.h + 60); pg.addColorStop(0, rgba(P.plat, 0.16 * breathe)); pg.addColorStop(1, rgba(P.plat, 0));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(p.x + 6, p.y + p.h); ctx.lineTo(p.x + p.w - 6, p.y + p.h); ctx.lineTo(p.x + p.w + 16, p.y + p.h + 60); ctx.lineTo(p.x - 16, p.y + p.h + 60); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawBevels() {
  const S = STAGE, P = ST.pal;
  ctx.save(); rr(S.x, S.y, S.w, S.h, 8); ctx.clip();
  const l = ctx.createLinearGradient(S.x, 0, S.x + 22, 0); l.addColorStop(0, 'rgba(255,255,255,0.22)'); l.addColorStop(1, 'rgba(255,255,255,0)');   // lit left chamfer
  ctx.fillStyle = l; ctx.fillRect(S.x, S.y, 22, S.h);
  const r = ctx.createLinearGradient(S.x + S.w - 26, 0, S.x + S.w, 0); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.38)');       // shaded right chamfer
  ctx.fillStyle = r; ctx.fillRect(S.x + S.w - 26, S.y, 26, S.h);
  const b = ctx.createLinearGradient(0, S.y + S.h - 16, 0, S.y + S.h); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, 'rgba(0,0,0,0.35)');         // ambient occlusion along the base
  ctx.fillStyle = b; ctx.fillRect(S.x, S.y + S.h - 16, S.w, 16);
  ctx.restore();
  ctx.save(); ctx.lineCap = 'round';
  for (const p of PLATS) {                                                                 // crisp specular top line on every floating platform
    if (!platUp(p)) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p.x + 5, p.y + 0.8); ctx.lineTo(p.x + p.w - 5, p.y + 0.8); ctx.stroke();
  }
  const sh = (G.time * 2.2) % (S.w + 400) - 200;                                           // a glint sliding along the main lip
  const gl = ctx.createLinearGradient(S.x + sh - 60, 0, S.x + sh + 60, 0); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, rgba(P.top, 0.9)); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = gl; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(Math.max(S.x + 6, S.x + sh - 60), S.y + 1.5); ctx.lineTo(Math.min(S.x + S.w - 6, S.x + sh + 60), S.y + 1.5); ctx.stroke();
  ctx.restore();
}

/* ---- world space, in front of the fighters: directional particles ---- */
function drawAtmosphereFront() {
  const n0 = SET.part; if (!n0) return;
  const [kind, count, cols] = atmoOf(ST), t = G.time, n = Math.round(count * Math.min(1, n0)), SPAN_X = 1600, SPAN_Y = 820;
  ctx.save();
  if (kind === 'ember' || kind === 'spark' || kind === 'mote' || kind === 'bit' || kind === 'spore') ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 1.37 + 0.5), h2 = hash(i * 2.91 + 1.3), h3 = hash(i * 4.17 + 2.1), col = cols[i % cols.length];
    let vx = 0, vy = 0, sway = 0;
    switch (kind) {
      case 'ember': vx = 0.25 + h3 * 0.3; vy = -(0.5 + h2 * 0.8); sway = 14; break;
      case 'spark': vx = 1.6 + h3 * 2.4; vy = -(1.2 + h2 * 1.5); break;
      case 'snow': vx = 0.35 + h3 * 0.3; vy = 0.5 + h2 * 0.5; sway = 18; break;
      case 'leaf': case 'petal': vx = 0.7 + h3 * 0.6; vy = 0.45 + h2 * 0.35; sway = 26; break;
      case 'rain': vx = 3.2; vy = 13 + h2 * 4; break;
      case 'bubble': vx = 0; vy = -(0.5 + h2 * 0.7); sway = 10; break;
      case 'dust': vx = 1.2 + h3 * 1.4; vy = 0.08 * (h2 - 0.5); sway = 8; break;
      case 'spore': vx = 0.15; vy = -(0.18 + h2 * 0.25); sway = 20; break;
      case 'bit': vx = 0; vy = 0.6 + h2 * 1.2; break;
      case 'shard': vx = 0.2; vy = -(0.2 + h2 * 0.3); sway = 12; break;
      default: vx = 0.1 * (h3 - 0.5); vy = -(0.12 + h2 * 0.2); sway = 16;
    }
    const x = wrapX(h1 * SPAN_X + vx * t, SPAN_X) - 160 + Math.sin(t * 0.02 + i) * sway, y = wrapX(h2 * SPAN_Y + vy * t, SPAN_Y) - 40;
    const tw = 0.55 + 0.45 * Math.sin(t * 0.07 + i * 1.9);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    switch (kind) {
      case 'ember': ctx.globalAlpha = 0.5 + 0.5 * tw; ctx.beginPath(); ctx.arc(x, y, 1 + h3 * 1.6, 0, TAU); ctx.fill(); break;
      case 'spark': ctx.globalAlpha = 0.4 + 0.6 * tw; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 3, y - vy * 3); ctx.stroke(); break;
      case 'snow': ctx.globalAlpha = 0.45 + 0.4 * h3; ctx.beginPath(); ctx.arc(x, y, 1.2 + h3 * 2, 0, TAU); ctx.fill();
        if (i % 6 === 0) { ctx.globalAlpha = 0.06; ctx.beginPath(); ctx.ellipse(x, y, 60, 14, 0, 0, TAU); ctx.fill(); } break;   // ice mist puffs
      case 'leaf': case 'petal': {
        const a = t * 0.04 * (h3 > 0.5 ? 1 : -1) + i, s = kind === 'petal' ? 3 : 4.5;
        ctx.globalAlpha = 0.75; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(a * 1.3)));
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore(); break; }
      case 'rain': ctx.globalAlpha = 0.25; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 2, y - vy * 2); ctx.stroke(); break;
      case 'bubble': ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2 + h3 * 4, 0, TAU); ctx.stroke(); break;
      case 'dust': ctx.globalAlpha = 0.35 * tw; ctx.fillRect(x, y, 1.5 + h3 * 2, 1.5 + h3 * 2); break;
      case 'bit': ctx.globalAlpha = 0.35 + 0.4 * tw; ctx.font = `700 ${8 + Math.round(h3 * 5)}px ${FONT_NUM}`; ctx.fillText(((i + (t >> 4)) & 1) ? '1' : '0', x, y); break;
      case 'shard': ctx.globalAlpha = 0.5; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.01 + i); ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3, 0); ctx.lineTo(0, 5); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill(); ctx.restore(); break;
      default: ctx.globalAlpha = 0.25 + 0.55 * tw; ctx.beginPath(); ctx.arc(x, y, 0.8 + h3 * 1.5, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
