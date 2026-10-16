/* NEON BRAWL — v16 Battle Pass reward visuals (presentation only; the local player's own equipped cosmetics).
 *
 *   KO EXPLOSIONS   40 = 10 effects × 4 palettes. When YOUR hit takes a stock, the KO blast is replaced by your equipped one
 *                   on top of the normal flash: supernova · light pillar · glass shatter · vortex · fireworks · voxel burst ·
 *                   sakura storm · thunderstrike · black hole · phoenix. Each is a pure function of its age (koDraw3D), so the
 *                   Battle Pass previews and the arena draw exactly the same thing.
 *   NEON TRAILS     40 = 10 styles × 4 palettes: a glowing ribbon that follows your striking fist or foot (whichever is nearest
 *                   the move's real hitbox) through every attack: ribbon · comet · dashes · twin rails · sparkle · voxels ·
 *                   flame · lightning · petals · prism.
 *   NAMEPLATES      16 more 3D nameplate borders (plate3D PLATE_EXT) · EMOJIS: 12 more holographic emojis (emoji3D EMOJI_EXT). */
'use strict';

const RW_PAL = { neon: ['Neon', [0.2, 0.95, 1], [1, 0.3, 0.9], [1, 1, 1]], inferno: ['Inferno', [1, 0.25, 0.08], [1, 0.62, 0.1], [1, 0.95, 0.6]],
  frost: ['Frost', [0.55, 0.85, 1], [0.85, 0.95, 1], [0.6, 0.5, 1]], royal: ['Royal', [1, 0.8, 0.25], [0.62, 0.3, 1], [1, 1, 0.9]] };
const KO_SHAPES = { nova: 'Supernova', pillar: 'Light Pillar', shatter: 'Glass Shatter', vortex: 'Vortex', firework: 'Fireworks', voxel: 'Voxel Burst', sakura: 'Sakura Storm', thunder: 'Thunderstrike', blackhole: 'Black Hole', phoenix: 'Phoenix' };
const TRAIL_SHAPES = { ribbon: 'Ribbon', comet: 'Comet', dash: 'Dashes', twin: 'Twin Rails', sparkle: 'Sparkle', voxel: 'Voxels', flame: 'Flame', bolt: 'Lightning', petal: 'Petals', prism: 'Prism' };
const rwPal = id => RW_PAL[(id || '').split('-')[1]] || RW_PAL.neon, rwShape = id => (id || '').split('-')[0];
const hr = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };   // a fixed pseudo-random number per index

/* ---------------- KO explosions ---------------- */
const KO16 = [];                                                          // live blasts: { id, x, y, t0 }
const KO16_LIFE = 80;
function koDraw3D(id, x, y, z, age, S) {
  const shape = rwShape(id), P = rwPal(id), a = P[1], b = P[2], c = P[3], u = clamp(age / KO16_LIFE, 0, 1), k = 1 - u, e = 1 - Math.pow(1 - Math.min(1, age / 16), 3);
  S = S || 1;
  if (age < 10) bG('sph', x, y, z, (40 + age * 9) * S, (40 + age * 9) * S, (40 + age * 9) * S, c, 1.4 * (1 - age / 10));            // the white-hot core
  ringG(x, y, z, (30 + e * 170) * S, 6 * S * k + 1, a, 1.2 * k, 0.9);                                                          // the shock ring across the floor plane
  switch (shape) {
    case 'nova': for (let i = 0; i < 4; i++) ringG(x, y, z, (20 + e * (90 + i * 50)) * S, (5 - i) * S, i % 2 ? b : a, k * (1.3 - i * 0.2), 0, age * 0.02 * (i % 2 ? 1 : -1));
      for (let i = 0; i < 14; i++) { const ang = i / 14 * TAU, r = e * 180 * S; bG('star4', x + Math.cos(ang) * r, y + Math.sin(ang) * r, z, 9 * S * k, 9 * S * k, 4, i % 2 ? c : b, 1.2 * k, 0, age * 0.1); } break;
    case 'pillar': { const h = (60 + e * 900) * S; sG('cyl', x, y + 40 * S, z, x, y - h, z, (36 - 20 * u) * S, a, 1.1 * k); sG('cyl', x, y + 40 * S, z, x, y - h * 0.9, z, 12 * S, c, 1.4 * k);
      for (let i = 0; i < 3; i++) ringG(x, y - e * (120 + i * 160) * S, z, (50 + i * 10) * S, 4 * S, b, k, 1.2); break; }
    case 'shatter': for (let i = 0; i < 22; i++) { const ang = hr(i, 1) * TAU, sp = (80 + hr(i, 2) * 160) * S, px = x + Math.cos(ang) * sp * e, py = y + Math.sin(ang) * sp * e + u * u * 80 * S;
        bL('octa', px, py, z + (hr(i, 3) - 0.5) * 60, (6 + hr(i, 4) * 8) * S, (10 + hr(i, 5) * 10) * S, 2.5 * S, i % 3 ? a : c, 0.6, age * 0.12 + i, age * 0.07); }
      bG('sph', x, y, z, 70 * e * S, 70 * e * S, 70 * e * S, b, 0.4 * k); break;
    case 'vortex': for (let i = 0; i < 18; i++) { const ang = i / 18 * TAU + age * 0.18, r = (30 + i * 9) * S * e; bG('sph', x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.5, z + Math.sin(ang) * r * 0.4, 7 * S, 7 * S, 7 * S, i % 2 ? a : b, 1.2 * k); }
      for (let i = 0; i < 3; i++) ringG(x, y, z, (40 + i * 40) * S * e, 3 * S, i % 2 ? b : a, k, 0.5, age * 0.1 * (i + 1)); break;
    case 'firework': for (let r = 0; r < 4; r++) { const ox = (hr(r, 9) - 0.5) * 260 * S, oy = -(60 + hr(r, 8) * 160) * S, t2 = Math.max(0, age - r * 8), e2 = 1 - Math.pow(1 - Math.min(1, t2 / 18), 3), k2 = clamp(1 - t2 / 60, 0, 1);
        if (t2 > 0) for (let i = 0; i < 16; i++) { const ang = i / 16 * TAU, rr = e2 * 70 * S; bG('sph', x + ox + Math.cos(ang) * rr, y + oy + Math.sin(ang) * rr + t2 * t2 * 0.01 * S, z, 4 * S, 4 * S, 4 * S, [a, b, c][(i + r) % 3], 1.4 * k2); } } break;
    case 'voxel': for (let i = 0; i < 30; i++) { const ang = hr(i, 1) * TAU, sp = (60 + hr(i, 2) * 200) * S, s2 = (6 + hr(i, 3) * 10) * S * (0.4 + 0.6 * k);
        bF('box', x + Math.cos(ang) * sp * e, y + Math.sin(ang) * sp * e + u * u * 60 * S, z + (hr(i, 4) - 0.5) * 80, s2, s2, s2, i % 3 === 0 ? c : i % 3 === 1 ? a : b, 1, age * 0.1, age * 0.06); } break;
    case 'sakura': for (let i = 0; i < 36; i++) { const ang = hr(i, 1) * TAU, sp = (70 + hr(i, 2) * 220) * S, sw = Math.sin(age * 0.08 + i) * 20 * S;
        bF('sph', x + Math.cos(ang) * sp * e + sw, y + Math.sin(ang) * sp * e + u * 90 * S, z + (hr(i, 3) - 0.5) * 90, 7 * S, 3.5 * S, 1.5 * S, i % 2 ? b : c, 1, age * 0.07 + i, age * 0.05); } break;
    case 'thunder': for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU + 0.3; let px = x, py = y;
        for (let j = 0; j < 5; j++) { const r = (j + 1) * 34 * S * e, nx = x + Math.cos(ang + (hr(i, j) - 0.5) * 0.6) * r, ny = y + Math.sin(ang + (hr(i, j + 7) - 0.5) * 0.6) * r;
          sG('tube', px, py, z, nx, ny, z, 2.6 * S, j % 2 ? c : a, 1.5 * k * ((age >> 1) % 3 ? 1 : 0.4)); px = nx; py = ny; } }
      sG('tube', x, y - 900 * S, z, x, y, z, 6 * S, c, age < 12 ? 1.6 : 0); break;
    case 'blackhole': { const R = (20 + Math.sin(Math.min(1, age / 50) * Math.PI) * 80) * S; bF('sph', x, y, z, R, R, R, [0.01, 0.01, 0.02], 1);
      for (let i = 0; i < 3; i++) ringG(x, y, z, R * (1.4 + i * 0.35), 4 * S, i % 2 ? b : a, 1.2 * k, 1.1, age * 0.15 * (i + 1));
      shell(x, y, z, R * 1.15, R * 1.15, R * 1.15, a, 0.9 * k, -1.8);
      for (let i = 0; i < 12; i++) { const ang = i / 12 * TAU - age * 0.12, r = R * (2.6 - (age % 30) / 30 * 1.3); bG('sph', x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.35, z + Math.sin(ang) * r * 0.5, 4 * S, 4 * S, 4 * S, c, k); } break; }
    case 'phoenix': for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const ang = -Math.PI / 2 + sd * (0.4 + i * 0.17) * e * 1.4, L = (60 + i * 26) * S * e;
        sG('cone', x, y, z, x + Math.cos(ang) * L, y + Math.sin(ang) * L - 30 * S * e, z - i * 4, (16 - i * 1.6) * S, i % 2 ? a : b, 1.2 * k); }
      sG('cone', x, y + 30 * S, z, x, y - 140 * S * e, z, 24 * S, c, 1.3 * k); break;
  }
}
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type !== 'ko' || !d.f) return;
  const me = typeof localFighter === 'function' ? localFighter() : null, by = d.f.lastHitBy;
  if (!me || me.cpu || by !== me || d.f === me) return;
  const id = typeof PASS !== 'undefined' && PASS.equip && PASS.equip.ko; if (!id || id === 'classic') return;
  KO16.push({ id, x: d.x, y: d.y, t0: G.time });
  const P = rwPal(id); burst(d.x, d.y, '#ffffff', 24, 16, 40); for (let i = 0; i < 3; i++) burst(d.x, d.y, `rgb(${P[1 + i].map(v => Math.round(v * 255)).join(',')})`, 14, 14, 46);
});
function collectKO16() {
  for (let i = KO16.length - 1; i >= 0; i--) { const q = KO16[i], age = G.time - q.t0; if (age > KO16_LIFE || age < 0) { KO16.splice(i, 1); continue; } koDraw3D(q.id, q.x, q.y, 20, age, 1); }
}

/* ---------------- neon attack trails ---------------- */
// trail points are world-space [x, y, z, born]; draw them as a fading ribbon in the equipped style
function trailDraw3D(id, pts, now, S) {
  const shape = rwShape(id), P = rwPal(id), a = P[1], b = P[2], c = P[3], n = pts.length; S = S || 1;
  for (let i = 1; i < n; i++) {
    const p = pts[i - 1], q = pts[i], age = now - q[3], k = clamp(1 - age / 14, 0, 1) * (i / n); if (k <= 0.02) continue;
    const r = (shape === 'comet' ? 1 + 6 * (i / n) ** 3 : shape === 'twin' ? 1.4 : 3.2 * (0.35 + 0.65 * i / n)) * S, col = shape === 'prism' ? hue3((i * 32 + now * 4) % 360) : i % 2 ? a : b;
    const seg = (x0, y0, x1, y1, rr, cc, kk, mesh) => { FXA[0] = x0; FXA[1] = y0; FXA[2] = p[2]; FXB[0] = x1; FXB[1] = y1; FXB[2] = q[2]; BAT.glow.add(BAT.T[mesh || 'tube'], xfSeg(FXM, FXA, FXB, rr), cc[0], cc[1], cc[2], kk); };
    switch (shape) {
      case 'dash': if (i % 2) seg(p[0], p[1], q[0], q[1], r, col, 1.3 * k); break;
      case 'twin': { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 4 * S, ny = dx / L * 4 * S;
        seg(p[0] + nx, p[1] + ny, q[0] + nx, q[1] + ny, r, a, 1.3 * k); seg(p[0] - nx, p[1] - ny, q[0] - nx, q[1] - ny, r, b, 1.3 * k); break; }
      case 'sparkle': seg(p[0], p[1], q[0], q[1], r * 0.7, col, 1.1 * k); if (i % 3 === 0) bG('star4', q[0], -q[1], q[2], 5 * S * k, 5 * S * k, 2, c, 1.4 * k, 0, now * 0.2 + i); break;
      case 'voxel': if (i % 2 === 0) bF('box', q[0], -q[1], q[2], 4 * S * k + 1, 4 * S * k + 1, 4 * S * k + 1, col, 1, now * 0.1 + i, i); seg(p[0], p[1], q[0], q[1], 1.2 * S, col, 0.7 * k); break;
      case 'flame': seg(p[0], p[1], q[0], q[1] + 4 * S * (1 - k), r * 1.3, i % 2 ? a : b, 1.2 * k, 'cone'); seg(p[0], p[1], q[0], q[1], r * 0.5, c, 1.2 * k); break;
      case 'bolt': { const j = (hr(i, now >> 1) - 0.5) * 10 * S; seg(p[0], p[1], q[0] + j, q[1] - j, 1.6 * S, i % 2 ? c : a, 1.6 * k); break; }
      case 'petal': seg(p[0], p[1], q[0], q[1], 1.2 * S, a, 0.8 * k); if (i % 2) bF('sph', q[0] + Math.sin(i + now * 0.1) * 6, -q[1] + age * 0.6, q[2], 4 * S, 2 * S, 1, b, 1, now * 0.1 + i); break;
      default: seg(p[0], p[1], q[0], q[1], r, col, 1.25 * k); seg(p[0], p[1], q[0], q[1], r * 0.4, c, 1.4 * k);   // ribbon · comet · prism
    }
  }
}
// called from fighter3d.js with the striking limb's world position, every frame of an attack
function trailRecord(f, wp) {
  const T = f._tr16 || (f._tr16 = []), now = G.time;
  if (!T.length || T[T.length - 1][3] !== now) T.push([wp[0], wp[1], wp[2], now]); else { const L = T[T.length - 1]; L[0] = wp[0]; L[1] = wp[1]; L[2] = wp[2]; }
  while (T.length > 18 || (T.length && now - T[0][3] > 16)) T.shift();
}
const trailOn = f => !!(f && !f.cpu && typeof PASS !== 'undefined' && PASS.equip && PASS.equip.trail && PASS.equip.trail !== 'none' && f === (typeof localFighter === 'function' ? localFighter() : null));
function collectTrails16() {
  for (const f of fighters) { const T = f._tr16; if (!T || !T.length) continue;
    while (T.length && G.time - T[0][3] > 16) T.shift(); if (T.length > 1 && trailOn(f)) trailDraw3D(PASS.equip.trail, T, G.time, f.scale || 1); }
}
// a looping demo path (Battle Pass previews): a crescent swipe in front of the camera
function trailDemoPts(t, cx, cy, R) {
  const pts = [];
  for (let i = 15; i >= 0; i--) { const tt = t - i, ph = ((tt % 60) + 60) % 60 / 60, ang = -2.4 + ph * 3.6; pts.push([cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.7, 10 + Math.sin(ang) * 10, tt]); }
  return pts;
}

/* ---------------- 16 more nameplate borders ---------------- */
const PLATE16 = { rgb: 'Chroma Rail', hex: 'Hex Grid', wings: 'Seraph Wings', thorn: 'Thorn Crown', orbit: 'Orbiter', pixel: '8-Bit Frame', ice: 'Glacier Crest', storm: 'Storm Front',
  sakura: 'Sakura Branch', gear: 'Clockwork', sun: 'Solar Flare', void: 'Event Horizon', royal: 'Royal Crest', matrix: 'Data Stream', aurora: 'Aurora Veil', dragon: 'Dragon Horns' };
const PLATE_EXT = {
  rgb(x, y, z, W, H, c, t, edge) { for (let i = 0; i < 12; i++) { const u = i / 12, px = x - W / 2 + u * W; bG('box', px + W / 24, y - H / 2, z + 3, W / 12, 1.6, 1.6, hue3((u * 360 + t * 3) % 360), 1.3); bG('box', px + W / 24, y + H / 2, z + 3, W / 12, 1.6, 1.6, hue3((u * 360 - t * 3 + 720) % 360), 1.3); } },
  hex(x, y, z, W, H, c, t, edge) { edge(0.5); for (let i = 0; i < 9; i++) { const px = x - W / 2 + 6 + i * (W - 12) / 8; bG('ring1', px, y - H / 2 - 4, z, 5, 5, 5, c, ((t >> 3) + i) % 4 ? 0.5 : 1.4, 0, 0, Math.PI / 2); } },
  wings(x, y, z, W, H, c, t, edge) { edge(0.7, [1, 1, 1]); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const fl = Math.sin(t * 0.08) * 0.08; bL('sph', x + s * (W / 2 + 10 + i * 7), y - 4 - i * 4, z, 12 - i * 2, 3, 2, [1, 1, 1], 0.3, 0, s * (0.5 + i * 0.18 + fl)); } },
  thorn(x, y, z, W, H, c, t, edge) { edge(0.5, [0.5, 0.1, 0.2]); for (let i = 0; i < 10; i++) { const px = x - W / 2 + 5 + i * (W - 10) / 9; sL('cone', px, y - H / 2, z, px + (i % 2 ? 3 : -3), y - H / 2 - 7 - (i % 3) * 2, z, 1.8, [0.25, 0.05, 0.1], 0.1); } },
  orbit(x, y, z, W, H, c, t, edge) { edge(0.6); for (let i = 0; i < 3; i++) { const a = t * 0.04 + i * TAU / 3; bG('sph', x + Math.cos(a) * (W / 2 + 8), y + Math.sin(a) * (H / 2 + 6), z + Math.sin(a) * 10, 3.4, 3.4, 3.4, i ? c : [1, 1, 1], 1.4); } },
  pixel(x, y, z, W, H, c, t, edge) { for (let i = 0; i < 14; i++) { const px = x - W / 2 + i * W / 13; bF('box', px, y - H / 2, z + 2, 4, 4, 3, i % 2 ? c : [1, 1, 1], 1); bF('box', px, y + H / 2, z + 2, 4, 4, 3, i % 2 ? [1, 1, 1] : c, 1); } },
  ice(x, y, z, W, H, c, t, edge) { edge(0.6, [0.7, 0.92, 1]); for (let i = 0; i < 7; i++) { const px = x - W / 2 + 8 + i * (W - 16) / 6; bL('octa', px, y + H / 2 + 5, z, 2.5, 6 + (i % 3) * 3, 2.5, [0.8, 0.95, 1], 0.5); } },
  storm(x, y, z, W, H, c, t, edge) { edge(0.6, [0.6, 0.8, 1]); if ((t % 50) < 6) for (const s of [-1, 1]) { let px = x + s * W / 2, py = y - H / 2; for (let j = 0; j < 4; j++) { const nx = px + s * 5, ny = py - 5; sG('tube', px, py, z, nx + (j % 2 ? 3 : -3), ny, z, 1, [0.8, 0.9, 1], 1.6); px = nx; py = ny; } } },
  sakura(x, y, z, W, H, c, t, edge) { edge(0.5, [1, 0.6, 0.8]); sL('cyl', x - W / 2 - 4, y - H / 2 - 2, z, x + W * 0.1, y - H / 2 - 8, z, 1.4, [0.35, 0.2, 0.15], 0.1);
    for (let i = 0; i < 6; i++) bF('sph', x - W / 2 + i * W * 0.12, y - H / 2 - 4 - (i % 2) * 5, z + 1, 3.5, 3.5, 2, [1, 0.7, 0.85], 1); },
  gear(x, y, z, W, H, c, t, edge) { edge(0.5, [0.85, 0.65, 0.3]); for (const s of [-1, 1]) { bL('torus', x + s * (W / 2 + 8), y, z, 8, 8, 8, [0.85, 0.65, 0.3], 0.2, 0, s * t * 0.04, Math.PI / 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + s * t * 0.04; bL('box', x + s * (W / 2 + 8) + Math.cos(a) * 10, y + Math.sin(a) * 10, z, 3, 3, 3, [0.85, 0.65, 0.3], 0.2, 0, a); } } },
  sun(x, y, z, W, H, c, t, edge) { edge(0.8, [1, 0.8, 0.3]); bG('sph', x, y - H / 2 - 8, z - 2, 10, 10, 4, [1, 0.85, 0.4], 1.2); for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; sG('cone', x + Math.cos(a) * 11, y - H / 2 - 8 + Math.sin(a) * 11, z - 2, x + Math.cos(a) * (17 + Math.sin(t * 0.2 + i) * 2), y - H / 2 - 8 + Math.sin(a) * (17 + Math.sin(t * 0.2 + i) * 2), z - 2, 2, [1, 0.6, 0.2], 1.1); } },
  void(x, y, z, W, H, c, t, edge) { edge(0.9, [0.6, 0.2, 1]); for (const s of [-1, 1]) { bF('sph', x + s * (W / 2 + 9), y, z, 7, 7, 7, [0.01, 0.01, 0.02], 1); ringG(x + s * (W / 2 + 9), y, z, 10, 2, [0.7, 0.3, 1], 1.3, 0.3, t * 0.1); } },
  royal(x, y, z, W, H, c, t, edge) { edge(1, [1, 0.8, 0.3]); bL('rbox', x, y, z - 2, W + 8, H + 8, 4, [0.45, 0.1, 0.6], 0.2); for (let i = 0; i < 5; i++) sL('cone', x + (i - 2) * 7, y - H / 2 - 2, z, x + (i - 2) * 7, y - H / 2 - 9 - (i % 2) * 3, z, 2, [1, 0.8, 0.3], 0.3); bG('octa', x, y - H / 2 - 12, z + 2, 2.5, 3.5, 2.5, [1, 0.25, 0.4], 1.3); },
  matrix(x, y, z, W, H, c, t, edge) { edge(0.5, [0.3, 1, 0.5]); for (let i = 0; i < 8; i++) { const px = x - W / 2 + 4 + i * (W - 8) / 7, py = y - H / 2 - 4 - ((t * 0.6 + i * 9) % 18); bG('box', px, py, z + 2, 1.6, 3, 1, [0.4, 1, 0.55], 1.2); } },
  aurora(x, y, z, W, H, c, t, edge) { for (let i = 0; i < 10; i++) { const px = x - W / 2 + i * W / 9, h = 6 + Math.sin(t * 0.06 + i * 0.7) * 4; bG('box', px, y - H / 2 - h / 2, z - 1, W / 10, h, 1, hue3((150 + i * 12 + t) % 360), 0.7); } edge(0.6, [0.5, 1, 0.8]); },
  dragon(x, y, z, W, H, c, t, edge) { edge(0.7, [1, 0.35, 0.2]); for (const s of [-1, 1]) { sL('cone', x + s * (W / 2 - 6), y - H / 2, z, x + s * (W / 2 + 6), y - H / 2 - 16, z, 3.4, [0.95, 0.9, 0.8], 0.2); sL('cone', x + s * (W / 2 - 14), y - H / 2, z, x + s * (W / 2 - 8), y - H / 2 - 10, z, 2.4, [0.95, 0.9, 0.8], 0.2); } }
};

/* ---------------- 12 more holographic emojis ---------------- */
Object.assign(EMOJI_COL, { star: [1, 0.85, 0.25], moon: [0.85, 0.9, 1], sun: [1, 0.75, 0.2], snow: [0.7, 0.92, 1], note: [0.75, 0.5, 1], swords: [0.85, 0.88, 0.95], shield: [0.35, 0.6, 1],
  flag: [1, 0.3, 0.35], zzz: [0.6, 0.75, 1], question: [1, 0.85, 0.3], bang: [1, 0.3, 0.25], target: [1, 0.3, 0.35] });
const EMOJI_EXT = {
  star(x, y, z, S, age, col) { bL('star', x, y, z, S * 1.1, S * 1.1, S * 0.45, col, 0.5, 0, age * 0.06); for (let k = 0; k < 4; k++) { const b = age * 0.08 + k * TAU / 4; bG('star4', x + Math.cos(b) * S * 1.4, y + Math.sin(b) * S * 1.4, z, S * 0.2, S * 0.2, S * 0.1, [1, 1, 1], 1.2); } },
  moon(x, y, z, S, age, col) { bL('sph', x, y, z, S, S, S * 0.8, col, 0.3); bF('sph', x + S * 0.45, y - S * 0.25, z + S * 0.35, S * 0.82, S * 0.82, S * 0.6, [0.04, 0.05, 0.12], 0); for (let k = 0; k < 3; k++) bG('star4', x - S * (0.6 + k * 0.4), y - S * (1 - k * 0.5), z, S * 0.16, S * 0.16, S * 0.08, [1, 1, 1], 0.6 + 0.6 * Math.abs(Math.sin(age * 0.1 + k))); },
  sun(x, y, z, S, age, col) { bL('sph', x, y, z, S * 0.8, S * 0.8, S * 0.8, col, 0.6); for (let k = 0; k < 10; k++) { const b = k / 10 * TAU + age * 0.03; sG('cone', x + Math.cos(b) * S * 0.9, y + Math.sin(b) * S * 0.9, z, x + Math.cos(b) * S * 1.6, y + Math.sin(b) * S * 1.6, z, S * 0.2, [1, 0.6, 0.15], 1.1); } },
  snow(x, y, z, S, age, col) { for (let k = 0; k < 3; k++) { const b = k * Math.PI / 3 + age * 0.03; sL('cyl', x - Math.cos(b) * S * 1.2, y - Math.sin(b) * S * 1.2, z, x + Math.cos(b) * S * 1.2, y + Math.sin(b) * S * 1.2, z, S * 0.12, col, 0.5); }
    for (let k = 0; k < 6; k++) { const b = k * Math.PI / 3 + age * 0.03; bL('octa', x + Math.cos(b) * S * 1.2, y + Math.sin(b) * S * 1.2, z, S * 0.22, S * 0.22, S * 0.22, [1, 1, 1], 0.6, b); } },
  note(x, y, z, S, age, col) { const bo = Math.sin(age * 0.15) * S * 0.15; bL('sph', x - S * 0.3, y + S * 0.6 + bo, z, S * 0.45, S * 0.35, S * 0.3, col, 0.4, 0, -0.4); sL('cyl', x + S * 0.1, y + S * 0.55 + bo, z, x + S * 0.1, y - S * 1 + bo, z, S * 0.09, col, 0.4);
    sL('cyl', x + S * 0.1, y - S + bo, z, x + S * 0.75, y - S * 0.6 + bo, z, S * 0.12, col, 0.4); },
  swords(x, y, z, S, age, col) { for (const s of [-1, 1]) { const sw = Math.sin(age * 0.1) * 0.1 * s; sL('cyl', x - s * S, y + S + sw * S, z, x + s * S * 0.9, y - S * 1.1, z, S * 0.12, col, 0.5); bL('box', x - s * S * 0.55, y + S * 0.5, z, S * 0.5, S * 0.12, S * 0.12, [1, 0.8, 0.3], 0.3, 0, s * 0.8); } },
  shield(x, y, z, S, age, col) { bL('sph', x, y, z, S * 1.05, S * 1.25, S * 0.35, col, 0.3, Math.sin(age * 0.05) * 0.4); bL('star', x, y, z + S * 0.3, S * 0.45, S * 0.45, S * 0.2, [1, 0.85, 0.3], 0.5); },
  flag(x, y, z, S, age, col) { sL('cyl', x - S * 0.7, y + S * 1.2, z, x - S * 0.7, y - S * 1.2, z, S * 0.08, [0.85, 0.85, 0.9], 0.3);
    for (let k = 0; k < 6; k++) bL('box', x - S * 0.5 + k * S * 0.24, y - S * 0.75 + Math.sin(age * 0.2 + k * 0.8) * S * 0.12, z, S * 0.25, S * 0.8, S * 0.06, k % 2 ? col : [1, 1, 1], 0.4); },
  zzz(x, y, z, S, age, col) { for (let k = 0; k < 3; k++) { const q = ((age * 0.02 + k / 3) % 1), sz = S * (0.4 + q * 0.5), px = x + q * S * 1.2, py = y + S * 0.8 - q * S * 2;
      for (const [x0, y0, x1, y1] of [[-0.5, -0.5, 0.5, -0.5], [0.5, -0.5, -0.5, 0.5], [-0.5, 0.5, 0.5, 0.5]]) sG('tube', px + x0 * sz, py + y0 * sz, z, px + x1 * sz, py + y1 * sz, z, sz * 0.12, col, 1.2 * (1 - q)); } },
  question(x, y, z, S, age, col) { const bo = Math.abs(Math.sin(age * 0.12)) * S * 0.2; bL('torus', x, y - S * 0.5 - bo, z, S * 0.55, S * 0.55, S * 0.55, col, 0.4, 0, Math.PI * 0.25, Math.PI / 2); sL('cyl', x, y - S * 0.05 - bo, z, x, y + S * 0.45 - bo, z, S * 0.16, col, 0.4); bL('sph', x, y + S * 0.95 - bo, z, S * 0.2, S * 0.2, S * 0.2, col, 0.4); },
  bang(x, y, z, S, age, col) { const sh = Math.sin(age * 0.9) * S * 0.05; sL('cone', x + sh, y + S * 0.45, z, x + sh, y - S * 1.2, z, S * 0.32, col, 0.5); bL('sph', x + sh, y + S * 0.95, z, S * 0.24, S * 0.24, S * 0.24, col, 0.5); },
  target(x, y, z, S, age, col) { for (let k = 0; k < 3; k++) bL('torus', x, y, z, S * (1.2 - k * 0.38), S * (1.2 - k * 0.38), S * (1.2 - k * 0.38), k % 2 ? [1, 1, 1] : col, 0.4, 0, 0, Math.PI / 2); bL('sph', x, y, z, S * 0.18, S * 0.18, S * 0.18, col, 0.6);
    const q = (age % 40) / 40; sL('cyl', x + S * 2 * (1 - q), y - S * 2 * (1 - q), z, x + S * 3 * (1 - q) + S * 0.4, y - S * 3 * (1 - q) - S * 0.4, z, S * 0.07, [0.9, 0.9, 1], 0.3); }
};
