/* NEON BRAWL — Fighter, projectile, effect and off-screen marker rendering. */
'use strict';

/* ---------------- Fighters: Rayman-style composite vector bodies ----------------
 * Each fighter is a floating head, a rounded torso, two floating fists and two floating feet
 * (no limbs), positioned per-pose in the fighter's local space (origin = feet, -y = up),
 * plus an optional spring-physics appendage (scarf / cape / energy tail) drawn behind.     */

/* ---- physics appendages: follow-the-leader verlet chains anchored to the body ---- */
const TRAIL_SPEC = {
  scarf: { n: 9,  seg: 6,   w0: 7,  w1: 2,   grav: 0.22, anchor: (bw, back) => [back * 4, -44] },
  cape:  { n: 7,  seg: 6.5, w0: 20, w1: 30,  grav: 0.5,  anchor: (bw, back) => [back * bw * 0.22, -40] },
  tail:  { n: 11, seg: 5,   w0: 6,  w1: 0.6, grav: 0.06, anchor: (bw, back) => [back * bw * 0.4, -20] },
  // Kitsune: three fluffy fox tails fanned out (each its own chain, with a different upward drift)
  foxtails: { n: 8, seg: 6, w0: 10, w1: 3, grav: -0.05, look: 'tail', count: 3, lift: [-0.55, -0.15, 0.25], anchor: (bw, back) => [back * bw * 0.38, -18] },
  // Sylph / Banshee: two long, silky ribbons streaming behind (motion trails)
  ribbon: { n: 12, seg: 7, w0: 6, w1: 1.5, grav: 0.04, count: 2, lift: [-0.18, 0.12], look: 'ribbon', anchor: (bw, back) => [back * bw * 0.3, -40] },
  // Dino Nuggi: a thick, tapering dinosaur tail with a racing stripe
  dinotail: { n: 7, seg: 6, w0: 17, w1: 3, grav: 0.4, anchor: (bw, back) => [back * bw * 0.36, -14] },
  // Ronin: a topknot ponytail swinging from the back of the head
  hair:  { n: 7,  seg: 5,   w0: 7,  w1: 2,   grav: 0.3,  look: 'scarf', anchor: (bw, back) => [back * bw * 0.3, -72] }
};
function stepTrail(f, ax, ay, s, key, lift) {
  let tr = f[key];
  if (!tr || tr.length !== s.n || Math.hypot(tr[0].x - ax, tr[0].y - ay) > 120)       // (re)spawn the chain, e.g. after a teleport
    tr = f[key] = Array.from({ length: s.n }, (_, i) => { const x = ax - f.facing * i * s.seg; return { x, y: ay, ox: x, oy: ay }; });
  tr[0].x = ax; tr[0].y = ay;
  const t = G.time;
  for (let i = 1; i < s.n; i++) {
    const p = tr[i], vx = (p.x - p.ox) * 0.86, vy = (p.y - p.oy) * 0.86;           // verlet: velocity = last displacement (damped)
    p.ox = p.x; p.oy = p.y;
    p.x += vx - f.facing * 0.35 + Math.sin(t * 0.25 + i * 0.8) * 0.25;                 // drift behind + flutter
    p.y += vy + s.grav + (lift || 0) + Math.cos(t * 0.2 + i) * 0.12;
    const q = tr[i - 1], dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;  // keep a fixed link length (spring lag)
    p.x = q.x + dx / d * s.seg; p.y = q.y + dy / d * s.seg;
  }
  return tr;
}
// Ribbon along the chain, tapering from w0 to w1. (ox, oy) maps world coords into the current local frame.
function drawTrail(f, tr, ox, oy) {
  const s = TRAIL_SPEC[f.ch.trail], n = tr.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = tr[Math.max(0, i - 1)], b = tr[Math.min(n - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    const w = lerp(s.w0, s.w1, i / (n - 1)) / 2;
    L.push([tr[i].x - ox + nx * w, tr[i].y - oy + ny * w]); R.push([tr[i].x - ox - nx * w, tr[i].y - oy - ny * w]);
  }
  ctx.save();
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.quadraticCurveTo(L[i - 1][0], L[i - 1][1], (L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2);
  ctx.lineTo(L[n - 1][0], L[n - 1][1]); ctx.lineTo(R[n - 1][0], R[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) ctx.quadraticCurveTo(R[i + 1][0], R[i + 1][1], (R[i + 1][0] + R[i][0]) / 2, (R[i + 1][1] + R[i][1]) / 2);
  ctx.closePath();
  ctx.shadowColor = f.color;
  if (f.ch.trail === 'foxtails') {                                              // fluffy fox tail: solid colour with a white tip
    ctx.shadowBlur = 12; ctx.fillStyle = rgba(f.color, 0.85); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd0f0'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(tr[n - 1].x - ox, tr[n - 1].y - oy, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (s.look === 'ribbon') {                                             // silk ribbon: glowing translucent band fading toward the tip
    const g = ctx.createLinearGradient(tr[0].x - ox, tr[0].y - oy, tr[n - 1].x - ox, tr[n - 1].y - oy);
    g.addColorStop(0, rgba(f.color, 0.85)); g.addColorStop(0.6, rgba(f.color, 0.45)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 14; ctx.fillStyle = g; ctx.fill();
  } else if (s.look === 'tail' || f.ch.trail === 'tail') {                     // glowing energy tail with a bright tip
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 16; ctx.fillStyle = rgba(f.color, 0.6); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(tr[n - 1].x - ox, tr[n - 1].y - oy, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (f.ch.trail === 'dinotail') {                                       // solid scaly tail: skin fill, bold outline, a stripe down the middle
    ctx.shadowBlur = 8; ctx.fillStyle = f.fill; ctx.fill(); ctx.fillStyle = rgba(f.color, 0.35); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = f.color; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tr[0].x - ox, tr[0].y - oy); for (let i = 1; i < n - 1; i++) ctx.lineTo(tr[i].x - ox, tr[i].y - oy);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  } else if (f.ch.trail === 'hair') {                                           // ink-black topknot with a pale outline
    ctx.shadowBlur = 6; ctx.fillStyle = '#0c0c12'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = f.color; ctx.stroke();
  } else {
    ctx.shadowBlur = 10; ctx.fillStyle = f.ch.trail === 'cape' ? rgba(f.color, 0.32) : f.color; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = f.color; ctx.stroke();
  }
  ctx.restore();
}

/* ---- attack visuals ---- */
// A fist launched toward a target point (a faint streak marks the path it flew)
function drawArm(f, tx, ty, ext) {
  const sx = f.x, sy = f.y - 34, ex = lerp(sx, tx, ext), ey = lerp(sy, ty, ext), r = f.ch.limb + 4;
  ctx.save();
  ctx.lineCap = 'round'; ctx.globalAlpha *= 0.3; ctx.lineWidth = r * 1.2; ctx.strokeStyle = f.color;
  ctx.beginPath(); ctx.moveTo(lerp(sx, ex, 0.35), lerp(sy, ey, 0.35)); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.globalAlpha /= 0.3;
  ctx.shadowColor = f.color; ctx.shadowBlur = 16; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (f.ch.id === 'chimera') drawClaws(ex, ey, Math.atan2(ey - sy, ex - sx), r, f.color);
  ctx.restore();
}
function drawClaws(x, y, a, r, col) {                                           // three hooked claws on a fist
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col;
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(r * 0.6, k * r * 0.55 - 2); ctx.quadraticCurveTo(r * 1.6, k * r * 0.7, r * 2.1, k * r * 0.9 + 3); ctx.lineTo(r * 0.6, k * r * 0.55 + 2.5); ctx.fill(); }
  ctx.restore();
}

// Attack slash arc: a FILLED crescent built from two cubic Béziers (outer + inner edge) swept around the shoulder.
// It grows with `prog`, thickest at the leading edge, and `fade` takes it out over 3 frames once the hit window closes.
function drawSlash(f, cx, cy, prog, fade, sgn, oy) {
  const sx = f.x, sy = f.y - (oy || 36), ang = Math.atan2(cy - sy, cx - sx), r = Math.max(40, Math.hypot(cx - sx, cy - sy) + 10), span = 1.8 * clamp(prog, 0.15, 1);
  const a0 = ang - sgn * 0.9, a1 = a0 + sgn * span, th = 8 + r * 0.22;                                 // th = crescent thickness at the tip
  const P = (a, rad) => [sx + Math.cos(a) * rad, sy + Math.sin(a) * rad];
  const k = 4 / 3 * Math.tan((a1 - a0) / 4);                                                             // Bézier circle-arc control factor
  const o0 = P(a0, r), o3 = P(a1, r + th * 0.35), i0 = P(a0, r - 2), i3 = P(a1, r - th);
  const t0 = [-Math.sin(a0), Math.cos(a0)], t1 = [-Math.sin(a1), Math.cos(a1)];
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 22; ctx.globalAlpha = fade;
  const g = ctx.createLinearGradient(o0[0], o0[1], o3[0], o3[1]); g.addColorStop(0, rgba(f.color, 0)); g.addColorStop(0.65, rgba(f.color, 0.75)); g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(o0[0], o0[1]);
  ctx.bezierCurveTo(o0[0] + t0[0] * k * r, o0[1] + t0[1] * k * r, o3[0] - t1[0] * k * (r + th * 0.35), o3[1] - t1[1] * k * (r + th * 0.35), o3[0], o3[1]);   // outer edge
  ctx.lineTo(i3[0], i3[1]);
  ctx.bezierCurveTo(i3[0] - t1[0] * k * (r - th), i3[1] - t1[1] * k * (r - th), i0[0] + t0[0] * k * (r - 2), i0[1] + t0[1] * k * (r - 2), i0[0], i0[1]);   // inner edge (back)
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// How far the flying fist is out (0..1) for punch-type moves; kicks / stomps / spins are drawn by the pose instead
function attackArmExt(f) {
  const m = f.move; if (f.state !== 'attack' || !m || limbOf(m) !== 'fist' || SET.limbs !== 'floating') return 0;   // (jointed arms punch with the real arm)
  const t = f.stateT;
  if (t < m.s) return 0;
  if (t < m.s + m.a) return 1;
  return Math.max(0, 1 - (t - m.s - m.a) / Math.max(6, m.e * 0.7));
}

function drawAttackFx(f) {
  const m = f.move, t = f.stateT, active = t >= m.s && t < m.s + m.a;
  const hb = hitboxRect(f, m), cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
  const ext = attackArmExt(f), fist = limbOf(m) === 'fist';
  if (f.charging) {                                                        // smash charge: pulsing aura that grows and flickers white at full power
    const q = f.chargeT / SMASH_CHARGE.max, full = f.chargeT >= SMASH_CHARGE.max, bx = f.x, by = f.y - 34, pulse = 0.5 + 0.5 * Math.sin(G.time * (0.4 + q * 0.5));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 46 + 30 * q + 6 * pulse, g = ctx.createRadialGradient(bx, by, 4, bx, by, r);
    g.addColorStop(0, rgba(full && (G.time >> 2) & 1 ? '#ffffff' : f.color, 0.25 + 0.35 * q)); g.addColorStop(1, rgba(f.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(f.color, 0.4 + 0.4 * pulse); ctx.lineWidth = 2 + 2 * q; ctx.shadowColor = f.color; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(bx, by, 30 + 24 * (1 - pulse), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (t < m.s && m.heavy) {                                                // wind-up telegraph: body bloom + a charging orb at the fist
    const k = t / m.s, bx = f.x, by = f.y - 34;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bloom = ctx.createRadialGradient(bx, by, 6, bx, by, 70 + 40 * k); bloom.addColorStop(0, rgba(f.color, 0.45 * k)); bloom.addColorStop(1, rgba(f.color, 0));
    ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(bx, by, 70 + 40 * k, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = f.color; ctx.shadowBlur = 24; ctx.fillStyle = f.color; ctx.globalAlpha = 0.3 + 0.5 * k;
    ctx.beginPath(); ctx.arc(lerp(f.x, cx, 0.5), lerp(f.y - 40, cy, 0.5), 6 + 22 * k, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (m.car) return;                                                      // the F1 car is its own hit visual (drawCar)
  if (f.ch.flagSmash && m.heavy) {                                         // Dino Nuggi: the smash swings a checkered flag (wound back during wind-up)
    const k = t < m.s ? t / m.s : 1, ang = f.facing * (t < m.s ? -1.2 * k : 0.9 - 0.9 * clamp((t - m.s) / 10, 0, 1));
    drawFlag(lerp(f.x, cx, 0.75 * (t < m.s ? 0.3 : 1)), lerp(f.y - 34, cy, 0.75 * (t < m.s ? 0.3 : 1)), ang, G.time);
  }
  if (t < m.s) return;
  if (fist && ext > 0.01) { drawArm(f, cx, cy, ext); if (m.radial) drawArm(f, 2 * f.x - cx, cy, ext); }
  {                                                                       // filled crescent slash, fading over 3 frames after the hit window
    const prog = clamp((t - m.s + 1) / m.a, 0, 1), fade = t >= m.s + m.a ? clamp(1 - (t - m.s - m.a + 1) / 3, 0, 1) : 1;
    const sgn = m.back ? -f.facing : f.facing, oy = fist ? 36 : 20;                              // kicks sweep from the hips
    if (fade > 0) { drawSlash(f, cx, cy, prog, fade, sgn, oy); if (m.radial) drawSlash(f, 2 * f.x - cx, cy, prog, fade, -sgn, oy); }
  }
  if (active) {
    ctx.save();
    ctx.shadowColor = f.color; ctx.shadowBlur = m.dmg > 10 ? 28 : 16;
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5;
    rr(hb.x, hb.y, hb.w, hb.h, 12); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// Special-move visuals drawn behind the body (world space)
function drawSpecialFx(f) {
  const sp = f.sp, t = G.time, D = f.ch.special;
  ctx.save();
  if (sp.type === 'burst' && f.stateT > sp.wind) {
    ctx.globalAlpha = 0.5; ctx.shadowColor = f.color; ctx.shadowBlur = 24; ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 32, 42, 54, 0, 0, Math.PI * 2); ctx.fill();
  } else if ((sp.type === 'orb' || (sp.type === 'shoot' && sp.kind !== 'disk')) && f.stateT < sp.wind) {   // a glowing charge gathering at the hand
    const k = f.stateT / sp.wind; ctx.shadowColor = f.color; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(f.x + sp.dx * 28, f.y - 38 + sp.dy * 28, 4 + 11 * k, 0, Math.PI * 2); ctx.fill();
  } else if (sp.type === 'laser') {                                       // Lux: a swelling core of light, then the beam itself
    const hx = f.x + sp.dx * 26, hy = f.y - 40 + sp.dy * 26;
    ctx.globalCompositeOperation = 'lighter';
    if (f.stateT < sp.wind) {
      const k = f.stateT / sp.wind, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10 + 30 * k);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, rgba(f.color, 0.8)); g.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 10 + 30 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(f.color, 0.25 * k); ctx.lineWidth = 1; ctx.setLineDash([6, 8]);                   // a faint sight-line shows where it will fire
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + sp.dx * D.len, hy + sp.dy * D.len); ctx.stroke(); ctx.setLineDash([]);
    }
    const b = sp.beam;
    if (b && b.t > 0) {
      const k = b.t / 12; ctx.lineCap = 'round'; ctx.shadowColor = f.color; ctx.shadowBlur = 30;
      for (const [w, col] of [[22 * k, rgba(f.color, 0.35)], [9 * k + 2, rgba(f.color, 0.9)], [3 * k + 1, '#ffffff']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      }
    }
  } else if (sp.type === 'counter') {                                     // Paladin: a holy dome in front of the shield
    const live = !sp.countered && f.stateT >= sp.wind && f.stateT < sp.wind + sp.active, cx = f.x + f.facing * 26, cy = f.y - 36;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = live ? 0.55 + 0.25 * Math.sin(t * 0.6) : 0.2;
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 58); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.6, rgba('#fff1b8', 0.35)); g.addColorStop(1, rgba('#fff1b8', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 58, -Math.PI / 2, Math.PI / 2, f.facing < 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff1b8'; ctx.lineWidth = 3; ctx.shadowColor = '#fff1b8'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(cx, cy, 54, -Math.PI / 2, Math.PI / 2, f.facing < 0); ctx.stroke();
  } else if (sp.type === 'star' && f.stateT < sp.wind) {                  // Nova: starlight spiralling up into the sky
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 14;
    for (let i = 0; i < 6; i++) { const a = t * 0.2 + i * 1.05, r = 26 + f.stateT * 2; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r * 0.6, f.y - 60 - f.stateT * 6 + Math.sin(a) * 8, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (sp.type === 'flurry' && f.stateT >= D.wind) {                 // claw rake marks
    const k = (f.stateT - D.wind) % D.every, hb = hitboxRect(f, sp.m);
    if (k < 4) {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = sp.n === D.hits ? '#ffffff' : f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.globalAlpha = 1 - k / 4;
      const flip = sp.n % 2 ? 1 : -1;
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(hb.x + 8, hb.y + 8 + j * 14 + flip * 6); ctx.quadraticCurveTo(hb.x + hb.w / 2, hb.y + hb.h / 2 + j * 6, hb.x + hb.w - 6, hb.y + hb.h - 26 + j * 14 - flip * 6); ctx.stroke(); }
    }
  } else if (sp.type === 'phase') {                                        // Nyx: shadow aura while phasing, then a double slash on arrival
    const end = sp.wind + sp.dur;
    if (f.stateT <= end) {
      const g = ctx.createRadialGradient(f.x, f.y - 32, 4, f.x, f.y - 32, 60); g.addColorStop(0, 'rgba(60,0,40,0.7)'); g.addColorStop(1, 'rgba(60,0,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y - 32, 60, 0, Math.PI * 2); ctx.fill();
    } else if (f.stateT <= end + 6) {
      const u = (f.stateT - end) / 6; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 20; ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - u; ctx.lineWidth = 6 * (1 - u) + 1;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(f.x - 44 * s, f.y - 74); ctx.quadraticCurveTo(f.x, f.y - 30, f.x + 44 * s, f.y - 4); ctx.stroke(); }
    }
  } else if (sp.type === 'glitch') {                                       // corrupted pixel blocks around the hop points
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,60,200,0.7)' : 'rgba(0,255,156,0.7)'; ctx.fillRect(f.x + (hash(i + t) - 0.5) * 70, f.y - 32 + (hash(i * 3 + t) - 0.5) * 80, 6 + hash(i + 7) * 14, 4); }
  } else if (sp.type === 'tele' && sp.rift && f.stateT <= sp.wind) {         // Nyx-II: two void rifts tear open — here and where the dagger will land
    const k = f.stateT / sp.wind, tx = f.x + sp.dx * sp.dist, ty = f.y - 32 + sp.dy * sp.dist;
    for (const [x, y] of [[f.x, f.y - 32], [tx, ty]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.3); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 40 * k); g.addColorStop(0, 'rgba(10,0,30,0.9)'); g.addColorStop(0.7, rgba(f.color, 0.5)); g.addColorStop(1, rgba(f.ch.alt, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 14 * k, 44 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = f.ch.alt; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 12 * k, 42 * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  } else if (sp.type === 'shoot' && sp.kind === 'boulder' && f.stateT < sp.wind) {   // Goliath: the boulder hauled up overhead
    const k = Math.min(1, f.stateT / (sp.wind * 0.6)), bx = f.x - f.facing * 4, by = f.y - 40 - 70 * k, r = 22;
    const g = ctx.createRadialGradient(bx - 8, by - 9, 2, bx, by, r * 1.1); g.addColorStop(0, '#d8d8cc'); g.addColorStop(0.6, '#8a8a80'); g.addColorStop(1, '#3a3a34');
    ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr2 = r * (0.85 + 0.2 * hash(i * 3.7)); ctx.lineTo(bx + Math.cos(a) * rr2, by + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill();
    if (k < 1) { ctx.fillStyle = 'rgba(160,150,130,0.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(bx + rand(-20, 20), f.y - rand(0, 10), 3, 3); }
  } else if (sp.type === 'meditate') {                                      // Zenith: a cosmic barrier sphere with a slowly turning mandala, then the palm-blast
    const end = sp.wind + sp.active, cx = f.x, cy = f.y - 36, R = D.r;
    ctx.globalCompositeOperation = 'lighter';
    if (f.stateT < end) {
      const k = Math.min(1, f.stateT / Math.max(1, sp.wind)), live = f.stateT >= sp.wind, pulse = 0.8 + 0.2 * Math.sin(t * 0.3);
      const g = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R); g.addColorStop(0, 'rgba(255,201,90,0)'); g.addColorStop(0.8, rgba('#ffc95a', 0.18 * k * pulse)); g.addColorStop(1, rgba('#fff1b8', 0.5 * k));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#ffc95a', live ? 0.8 : 0.4); ctx.lineWidth = 2; ctx.shadowColor = '#ffc95a'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha = 0.5 * k;                          // mandala: two counter-rotating petal rings
      for (const [n, rr2, dir] of [[8, R * 0.62, 1], [12, R * 0.82, -1]]) for (let i = 0; i < n; i++) { const a = i / n * TAU + t * 0.02 * dir; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 6, 2.5, a, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      const u = clamp((f.stateT - end) / sp.end, 0, 1), r = D.palm.r * (0.4 + 0.8 * u);
      ctx.strokeStyle = rgba('#ffc95a', 1 - u); ctx.lineWidth = 6 * (1 - u) + 1; ctx.shadowColor = '#ffc95a'; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba('#fff1b8', 0.4 * (1 - u)); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, 12, 7, a, 0, Math.PI * 2); ctx.fill(); }   // palm prints of light
    }
  } else if (sp.type === 'hook') {                                         // Strider: the grappling line and its three-pronged hook
    const hx0 = f.x + f.facing * 12, hy0 = f.y - 42, hx = sp.phase === 'pull' ? sp.ax : sp.hx, hy = sp.phase === 'pull' ? sp.ay : sp.hy;
    if (hx !== undefined) {
      ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(hx0, hy0);
      const sag = sp.phase === 'pull' ? 0 : 10; ctx.quadraticCurveTo((hx0 + hx) / 2, (hy0 + hy) / 2 + sag, hx, hy); ctx.stroke();
      const a = Math.atan2(hy - hy0, hx - hx0); ctx.translate(hx, hy); ctx.rotate(a); ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(4, 0); for (const s of [-1, 0, 1]) { ctx.moveTo(4, 0); ctx.quadraticCurveTo(8, s * 6, 3, s * 8 + (s ? 0 : 0.1)); } ctx.stroke();
    }
  } else if (sp.type === 'temper') {                                        // Forge: the forge-core flares at the hammer head
    const k = Math.min(1, f.stateT / sp.wind), hx = f.x + f.facing * 30, hy = f.y - 18;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, 20 + 30 * k); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.4, rgba('#ff9a3d', 0.8)); g.addColorStop(1, rgba('#ff4a1a', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 20 + 30 * k, 0, Math.PI * 2); ctx.fill();
  } else if (sp.type === 'warcry') {                                        // Valkyrie: the battle cry — golden shock rings off the raised spear
    const k = f.stateT / sp.wind, cx = f.x, cy = f.y - 60;
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 20; ctx.lineCap = 'round';
    if (k < 1) { ctx.fillStyle = rgba('#ffd36e', 0.35 * k); ctx.beginPath(); ctx.arc(cx, cy, 14 + 18 * k, 0, Math.PI * 2); ctx.fill(); }
    else {
      const u = clamp((f.stateT - sp.wind) / sp.end, 0, 1);
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = (1 - u) * (1 - i * 0.25); ctx.strokeStyle = i ? '#ffd36e' : '#ffffff'; ctx.lineWidth = 6 - i * 1.5; ctx.beginPath(); ctx.arc(cx, cy + 20, 30 + u * D.r * (1 + i * 0.25), 0, Math.PI * 2); ctx.stroke(); }
    }
  } else if (sp.type === 'flare') {                                         // Sol: a miniature sun swells above Sol, then erupts into a solar flare
    const cx = f.x, cy = f.y - 40;
    ctx.globalCompositeOperation = 'lighter';
    if (f.stateT < sp.wind) {
      const k = f.stateT / sp.wind, r = 8 + 26 * k, sy = f.y - 92 + 20 * k * k;
      const g = ctx.createRadialGradient(cx, sy, 0, cx, sy, r * 2.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff1b8'); g.addColorStop(0.55, rgba(f.color, 0.8)); g.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, sy, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#fff1b8', 0.6); ctx.lineWidth = 2;                                         // corona spikes
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.08, l = r * (1.3 + 0.4 * Math.sin(t * 0.5 + i)); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, sy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * l * 1.4, sy + Math.sin(a) * l * 1.4); ctx.stroke(); }
      ctx.globalAlpha = 0.25 * k; ctx.strokeStyle = f.color; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(cx, cy, D.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);   // reach preview
    } else {
      const u = clamp((f.stateT - sp.wind) / sp.end, 0, 1), r = D.r * (0.5 + 0.7 * u);
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r); g.addColorStop(0, rgba('#ffffff', 0.9 * (1 - u))); g.addColorStop(0.5, rgba('#fff1b8', 0.6 * (1 - u))); g.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba('#ffd36e', 1 - u); ctx.lineWidth = 3;
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); ctx.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15); ctx.stroke(); }
    }
  } else if (sp.type === 'shoot' && sp.kind === 'disk' && f.stateT < sp.wind + 4) {   // Pulse: a holographic turntable spins up at the hand
    const hx = f.x + sp.dx * 30, hy = f.y - 40 + sp.dy * 30;
    ctx.translate(hx, hy); ctx.scale(1, 0.45); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 16;
    ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 22, t * 0.5, t * 0.5 + 1.2); ctx.stroke();
  } else if (sp.type === 'stomp' && sp.phase === 'air' && f.stateT >= 7) {  // plummeting rock trail
    ctx.globalAlpha = 0.45; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(f.x - 22, f.y - 10); ctx.lineTo(f.x, f.y - 90); ctx.lineTo(f.x + 22, f.y - 10); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* ---- expressive cartoon face: eyes that track the opponent and blink, brows + mouth that change with the action ---- */
function drawFace(f, hx, hy, R, face, hit, t) {
  const c = f.ch;
  ctx.save(); ctx.shadowBlur = 0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (c.id === 'mecha') {                                                      // Mecha keeps a glowing red visor
    ctx.fillStyle = '#ff5a5a'; ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 10; rr(hx + (face > 0 ? -R * 0.25 : -R * 0.95), hy - 4, R * 1.2, 7, 3.5); ctx.fill();
    ctx.restore(); return;
  }
  const atk = f.state === 'attack' || f.state === 'special' || f.state === 'grab' || f.state === 'holding';
  const worried = f.state === 'shield' || f.state === 'ledge' || f.state === 'grabbed';
  const focus = f.charging || (f.state === 'special' && f.sp && f.sp.wind && f.stateT < f.sp.wind && f.sp.wind >= 10);   // charging a smash / a long wind-up: intense concentration
  const happy = f.victory && f.state === 'free' && Math.floor(t / 90) % 3 === 1;                              // victory screen: now and then a beaming ^^ face
  // where to look: the opponent in a match, straight ahead in menus — eased on a spring, so the pupils glide (sub-pixel) instead of snapping
  let lx = face, ly = 0;
  if (fighters.includes(f)) { const o = otherOf(f), d = Math.hypot(o.x - f.x, o.y - f.y) || 1; lx = (o.x - f.x) / d; ly = (o.y - f.y) / d; if (sign(lx) !== face) lx *= 0.3; }
  const rg = f.rig || (f.rig = {}), eye = rg.eye || (rg.eye = { x: lx, y: ly });
  eye.x += (lx - eye.x) * 0.18; eye.y += (ly - eye.y) * 0.18; lx = eye.x; ly = eye.y;
  const blink = ((t + f.id * 97) % 200) < 7 && !hit && !atk;
  const ex = hx + face * R * 0.22, ey = hy - R * 0.08, gap = R * 0.36;
  const eyes = [[ex - face * gap * 0.55, 0.85], [ex + face * gap * 0.75, 1]];   // far eye a bit smaller: three-quarter view
  if (f.state === 'stunned') {                                                 // shield broken / dazed: spinning spiral eyes + a wobbly mouth
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    for (const [x, s] of eyes) {
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) { const a = i * 0.7 + t * 0.35 * (x > hx ? 1 : -1), r = i / 18 * 4.2 * s; i ? ctx.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r) : ctx.moveTo(x, ey); }
      ctx.stroke();
    }
    ctx.lineWidth = 1.6; ctx.beginPath(); const mx = hx + face * R * 0.3, my = hy + R * 0.5;
    for (let i = 0; i <= 8; i++) { const x = mx - 4 + i, y = my + Math.sin(i * 1.4 + t * 0.4) * 1.2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore(); return;
  }
  if (happy) {                                                                 // ^^ eyes and a wide open smile
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
    for (const [x, s] of eyes) { ctx.beginPath(); ctx.arc(x, ey + 1.5 * s, 3.2 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    if (!c.venom) { ctx.fillStyle = '#0a0a14'; ctx.beginPath(); ctx.arc(hx + face * R * 0.32, hy + R * 0.4, 4, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff6a8a'; ctx.beginPath(); ctx.arc(hx + face * R * 0.32, hy + R * 0.4 + 2.4, 2, 0, Math.PI); ctx.fill(); }
    ctx.restore(); return;
  }
  if (hit) {                                                                   // dizzy X eyes + "O" mouth
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4;
    for (const [x, s] of eyes) { const k = 3 * s; ctx.beginPath(); ctx.moveTo(x - k, ey - k); ctx.lineTo(x + k, ey + k); ctx.moveTo(x + k, ey - k); ctx.lineTo(x - k, ey + k); ctx.stroke(); }
    ctx.fillStyle = '#0a0a14'; ctx.beginPath(); ctx.ellipse(hx + face * R * 0.3, hy + R * 0.5, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  const narrow = c.id === 'ronin' ? 0.55 : 1;                                  // Ronin's focused, narrowed eyes
  for (const [x, s] of eyes) {
    const rx = 3.4 * s, ry = (blink ? 0.6 : (focus ? 2.1 : atk ? 3.6 : 4.6) * narrow) * s;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    if (!blink) { ctx.fillStyle = '#0a0a14'; ctx.beginPath(); ctx.arc(x + lx * 1.4, ey + ly * 1.4 * narrow, 1.9 * s, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + lx * 1.4 - 0.7, ey + ly * 1.4 - 0.9, 0.6 * s, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;                              // eyebrows: angry when attacking, raised when worried
  for (const [x, s] of eyes) {
    const inner = x === eyes[0][0] ? -face : face, by = ey - 6.5 * s - (worried ? 1.5 : 0);
    const tilt = focus ? 3.4 : atk ? 2.2 : worried ? -2 : 0;
    ctx.beginPath(); ctx.moveTo(x - 3 * s * inner, by - tilt * 0.4); ctx.lineTo(x + 3 * s * inner, by + tilt); ctx.stroke();
  }
  const mx = hx + face * R * 0.32, my = hy + R * 0.48;                         // mouth
  if (focus) {                                                                 // a bead of sweat slides down the temple while straining
    const u = ((t * 0.03 + f.id * 0.3) % 1), sx = hx - face * R * 0.55, sy = hy - R * 0.35 + u * R * 0.7;
    ctx.globalAlpha = 1 - u * 0.6; ctx.fillStyle = '#bfeaff'; ctx.beginPath(); ctx.moveTo(sx, sy - 3.5); ctx.quadraticCurveTo(sx + 2.4, sy + 0.5, sx, sy + 2.2); ctx.quadraticCurveTo(sx - 2.4, sy + 0.5, sx, sy - 3.5); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (c.venom) { ctx.restore(); return; }                                      // Venom's fangs replace the mouth
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
  if (atk) { ctx.fillStyle = '#ffffff'; rr(mx - 4, my - 2, 8, 4.5, 1.5); ctx.fill(); ctx.strokeStyle = '#0a0a14'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my); ctx.stroke(); }   // gritted teeth
  else if (worried) { ctx.beginPath(); ctx.arc(mx, my + 3, 3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  else if (!f.onGround && f.vy < -4) { ctx.fillStyle = '#0a0a14'; ctx.beginPath(); ctx.ellipse(mx, my, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill(); }   // "whee"
  else { ctx.beginPath(); ctx.arc(mx, my - 2, 3.4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }                                                // grin
  ctx.restore();
}

// Sylph: two pairs of translucent fairy wings, flapping faster in the air
function drawWings(f, ty, back, t) {
  const flap = Math.sin(t * (f.onGround ? 0.12 : 0.55) + f.id) * 0.5 + 0.5;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 14;
  for (const [ay, len, wid, col] of [[ty - 10, 30, 14, '#ffaee0'], [ty + 2, 20, 10, '#a8d8ff']]) {
    ctx.save(); ctx.translate(back * 6, ay); ctx.rotate(back > 0 ? -0.45 - flap * 0.6 : Math.PI + 0.45 + flap * 0.6);   // up and behind, flapping
    ctx.fillStyle = rgba(col, 0.35); ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, wid / 2 * (0.6 + 0.4 * flap), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

/* ---- per-fighter decorations, drawn in local space: (hx, hy) = head centre, R = head radius, ty = torso centre ---- */
function drawAccents(f, hx, hy, R, ty, tw, th, face, back, t) {
  const c = f.ch, id = c.id;
  ctx.fillStyle = f.color; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tri = (x0, y0, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill(); };
  if (id === 'velocity') { ctx.beginPath(); ctx.moveTo(-tw / 2 + 4, ty + 7); ctx.lineTo(tw / 2 - 4, ty - 3); ctx.moveTo(-tw / 2 + 4, ty); ctx.lineTo(tw / 2 - 4, ty - 10); ctx.stroke(); }   // speed stripes
  else if (id === 'titan') {                                                                                 // Gaia: stone shoulder slabs, a mossy crown with a sprouting leaf
    ctx.save(); ctx.fillStyle = '#7a6a58'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (tw / 2 - 10), ty - th / 2 - 2); ctx.lineTo(s * (tw / 2 + 9), ty - th / 2 - 7); ctx.lineTo(s * (tw / 2 + 7), ty - th / 2 + 9); ctx.lineTo(s * (tw / 2 - 6), ty - th / 2 + 7); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#5fbf4a'; ctx.beginPath(); ctx.ellipse(hx, hy - R + 2, R * 0.95, 5, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#3f8a32'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy - R - 2); ctx.quadraticCurveTo(hx + back * 2, hy - R - 10, hx + back * 7, hy - R - 13); ctx.stroke();
    ctx.fillStyle = '#8be06a'; ctx.beginPath(); ctx.ellipse(hx + back * 8, hy - R - 13, 5, 2.5, back * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  else if (id === 'vortex') { const a = t * 0.07 + f.id; ctx.shadowColor = f.color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(hx + Math.cos(a) * (R + 10), hy + Math.sin(a) * 6, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
  else if (id === 'aether') {                                                                                // Lux: a radiant crown of light rays behind the head
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i - 5.5) * 0.24, l = (i % 2 ? 7 : 12) + Math.sin(t * 0.1 + i) * 2;
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * (R + 3), hy + Math.sin(a) * (R + 3)); ctx.lineTo(hx + Math.cos(a) * (R + 3 + l), hy + Math.sin(a) * (R + 3 + l)); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'phantom') { tri(hx + back * R * 0.2, hy - R * 0.95, hx + back * (R + 9), hy - R * 0.2, hx + back * R * 0.6, hy + R * 0.3); }   // hood point
  else if (id === 'dynamo') {                                                                                // Titan: champion's belt, huge pauldrons, a grappler's mask stripe
    ctx.fillRect(-tw / 2 + 2, ty + 5, tw - 4, 4); ctx.save(); ctx.fillStyle = '#fff3c4'; rr(-9, ty + 2, 18, 10, 3); ctx.fill(); ctx.restore();
    rr(-tw / 2 - 9, ty - th / 2 - 6, 18, 13, 5); ctx.fill(); rr(tw / 2 - 9, ty - th / 2 - 6, 18, 13, 5); ctx.fill();
    ctx.fillRect(hx - R, hy - R * 0.45, R * 2, 4); ctx.save(); ctx.fillStyle = '#ff5a5a'; tri(hx - 4, hy - R * 0.45, hx, hy - R - 3, hx + 4, hy - R * 0.45); ctx.restore();
  }
  else if (id === 'spark') { ctx.beginPath(); ctx.moveTo(2, ty - 10); ctx.lineTo(-5, ty); ctx.lineTo(2, ty); ctx.lineTo(-4, ty + 11); ctx.stroke(); for (let i = -1; i <= 1; i++) tri(hx + i * 7 - 3, hy - R + 3, hx + i * 7 + back * 4, hy - R - 10, hx + i * 7 + 4, hy - R + 2); }   // bolt + spiky hair
  else if (id === 'frost') { for (const [x, h] of [[-8, 11], [0, 16], [8, 11]]) tri(hx + x - 4, hy - R + 3, hx + x, hy - R - h, hx + x + 4, hy - R + 3); }   // ice crown
  else if (id === 'mirage') {                                                                                // Kage: ninja mask over the lower face, steel forehead plate, headband tails
    ctx.save(); ctx.fillStyle = '#0e0e1c'; ctx.beginPath(); ctx.arc(hx, hy, R + 0.5, 0.08 * Math.PI, 0.92 * Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8cde0'; rr(hx - R * 0.55, hy - R * 0.62, R * 1.1, 5, 2); ctx.fill();
    ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; for (const k of [0, 4]) { ctx.beginPath(); ctx.moveTo(hx + back * R, hy - R * 0.5); ctx.quadraticCurveTo(hx + back * (R + 8), hy - R * 0.5 + k + Math.sin(t * 0.2 + k) * 3, hx + back * (R + 16), hy - R * 0.3 + k * 2); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'aegis') {
    ctx.beginPath(); ctx.moveTo(-7, ty - 8); ctx.lineTo(7, ty - 8); ctx.lineTo(7, ty + 1); ctx.lineTo(0, ty + 9); ctx.lineTo(-7, ty + 1); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx, hy - R); ctx.quadraticCurveTo(hx + back * 10, hy - R - 14, hx + back * 20, hy - R - 4 + Math.sin(t * 0.1) * 2); ctx.lineWidth = 4; ctx.stroke();   // helmet plume
  }
  else if (id === 'venom') {
    const vy = hy + R * 0.35; ctx.beginPath(); ctx.moveTo(hx + face * 1, vy); ctx.lineTo(hx + face * 3.5, vy + 7); ctx.lineTo(hx + face * 6, vy); ctx.moveTo(hx + face * 8, vy); ctx.lineTo(hx + face * 10.5, vy + 7); ctx.lineTo(hx + face * 13, vy); ctx.fill();
    const dr = (t * 0.03 + f.id) % 1, a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * (1 - dr); ctx.beginPath(); ctx.arc(hx + face * 7, vy + 9 + dr * 16, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = a0;
  }
  else if (id === 'apex') { for (const [dy, l] of [[-R * 0.7, 18], [-R * 0.25, 14], [R * 0.2, 10]]) tri(hx + back * R * 0.5, hy + dy, hx + back * (R + l), hy + dy - 6 + Math.sin(t * 0.12 + dy) * 1.5, hx + back * R * 0.5, hy + dy + 6); }   // talon crest
  else if (id === 'tempest') { ctx.lineWidth = 2; for (let i = 0; i < 2; i++) { const a = t * 0.12 + i * Math.PI; ctx.beginPath(); ctx.arc(hx, hy, R + 6 + i * 4, a, a + 1.6); ctx.stroke(); } }   // wind swirls
  else if (id === 'terra') { for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * tw / 2 - 8 * s, ty - th / 2); ctx.lineTo(s * (tw / 2 + 8), ty - th / 2 - 8); ctx.lineTo(s * (tw / 2 + 4), ty - th / 2 + 6); ctx.closePath(); ctx.fill(); } ctx.fillStyle = '#7fd24a'; ctx.fillRect(hx - R * 0.8, hy - R * 0.9, R * 1.6, 3); }   // boulder shoulders + moss
  else if (id === 'luna') {                                                                                  // Orion: a crown of three little stars + a quiver on the back
    const star = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? r * 0.4 : r, a = i * Math.PI / 4 + t * 0.03; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); };
    ctx.save(); ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.fillStyle = '#ffffff'; star(hx, hy - R - 7, 5); star(hx - 8, hy - R - 3, 3.2); star(hx + 8, hy - R - 3, 3.2);
    ctx.fillStyle = '#3a3f8a'; ctx.save(); ctx.translate(back * (tw / 2 + 2), ty - 6); ctx.rotate(back * 0.35); rr(-4, -18, 8, 26, 3); ctx.fill();
    ctx.fillStyle = f.color; for (let i = 0; i < 3; i++) ctx.fillRect(-3 + i * 2.5, -24, 1.5, 7); ctx.restore(); ctx.restore();
  }
  else if (id === 'solaris') {                                                                               // Nova: twinkling four-point stars orbiting the head
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 12; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) { const a = t * 0.04 + i * Math.PI / 2, x = hx + Math.cos(a) * (R + 10), y = hy - 4 + Math.sin(a) * 6, s = 3 + Math.sin(t * 0.2 + i) * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * 2, y); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x + s * 2, y); ctx.lineTo(x, y - s * 0.5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  else if (id === 'void') {                                                                                  // Paladin: a golden crown-halo and a holy cross on the breastplate
    ctx.save(); ctx.strokeStyle = '#ffd36e'; ctx.fillStyle = '#ffd36e'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 12; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(hx, hy - R - 6 + Math.sin(t * 0.06) * 1.2, R * 0.85, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(-2, ty - 9, 4, 18); ctx.fillRect(-7, ty - 4, 14, 4); ctx.restore();
  }
  else if (id === 'chrono') {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, ty, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(Math.cos(t * 0.1) * 6, ty + Math.sin(t * 0.1) * 6); ctx.moveTo(0, ty); ctx.lineTo(0, ty - 5); ctx.stroke();   // ticking clock
    ctx.beginPath(); ctx.ellipse(hx, hy - R + 1, R * 0.95, 3, 0, 0, Math.PI * 2); ctx.fill(); rr(hx - R * 0.55, hy - R - 9, R * 1.1, 10, 2); ctx.fill();         // top hat
  }
  else if (id === 'chimera') {                                                                               // Kraken: finned head crest + a beard of little writhing tentacles
    for (const s of [-1, 1]) tri(hx + s * R * 0.5, hy - R * 0.5, hx + s * (R + 9), hy - R * 0.9 + Math.sin(t * 0.1 + s) * 2, hx + s * R * 0.8, hy);
    ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) { const x0 = hx + face * 2 + i * 4; ctx.beginPath(); ctx.moveTo(x0, hy + R * 0.6); ctx.quadraticCurveTo(x0 + Math.sin(t * 0.15 + i) * 5, hy + R + 4, x0 + Math.sin(t * 0.12 + i * 2) * 7, hy + R + 10 - Math.abs(i) * 2); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'nyx') {                                                                                   // pointed shadow hood + smoke wisps
    tri(hx - R * 0.9, hy - R * 0.2, hx + back * (R + 6), hy - R - 12, hx + R * 0.9, hy - R * 0.2);
    ctx.save(); ctx.fillStyle = 'rgba(30,0,24,0.6)'; for (let i = 0; i < 3; i++) { const u = (t * 0.02 + i / 3) % 1; ctx.globalAlpha = (1 - u) * 0.7; ctx.beginPath(); ctx.arc(hx + back * (6 + u * 18), hy - R - 4 - u * 22, 4 + u * 6, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
  }
  else if (id === 'surge') {                                                                                 // Zephyr: sport visor + a kinetic core whose aura grows with stored speed
    ctx.save(); ctx.fillStyle = 'rgba(20,40,30,0.85)'; rr(hx - R * 0.8 + face * 3, hy - R * 0.35, R * 1.6, R * 0.42, 4); ctx.fill(); ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(0, ty, 5 + 3 * Math.sin(t * 0.3), 0, Math.PI * 2); ctx.fill();
    const kin = (f.kin || 0) / 100;
    if (kin > 0.05) {
      ctx.globalAlpha = kin; ctx.lineWidth = 1.8;
      for (let i = 0; i < 5; i++) {
        const a0 = hash(i + (t >> 2)) * 6.28; let x = Math.cos(a0) * (tw / 2 + 8), y = ty - 10 + Math.sin(a0) * 34; ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) { x += (hash(i * 9 + j + (t >> 2)) - 0.5) * 14; y += (hash(i * 5 + j * 3 + (t >> 2)) - 0.5) * 14; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  else if (id === 'glitch') {                                                                                // chromatic-aberration fringes + displaced scanline slices
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
    const j = (t >> 2) % 7 === 0 ? 4 : 1.6;
    ctx.strokeStyle = 'rgba(255,40,120,0.8)'; ctx.beginPath(); ctx.arc(hx - j, hy, R, 0, Math.PI * 2); ctx.stroke(); rr(-tw / 2 - j, ty - th / 2, tw, th, th * 0.45); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,200,255,0.8)'; ctx.beginPath(); ctx.arc(hx + j, hy, R, 0, Math.PI * 2); ctx.stroke(); rr(-tw / 2 + j, ty - th / 2, tw, th, th * 0.45); ctx.stroke();
    if ((t >> 3) % 4 === 0) { ctx.fillStyle = rgba(f.color, 0.6); const sy = ty - 30 + hash(t >> 3) * 50; ctx.fillRect(-tw / 2 + (hash((t >> 3) + 1) - 0.5) * 16, sy, tw, 4); }
    ctx.restore();
  }
  else if (id === 'echo') {                                                                                  // Banshee: long spectral hair streaming back + sound rings
    ctx.save(); ctx.globalAlpha *= 0.85; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const y0 = hy - R * 0.8 + i * 4, sw = Math.sin(t * 0.1 + i) * 5;
      ctx.beginPath(); ctx.moveTo(hx - face * R * 0.2, y0); ctx.bezierCurveTo(hx + back * (R + 6), y0 - 4, hx + back * (R + 16), y0 + 10 + sw, hx + back * (R + 26), y0 + 22 + sw * 1.5); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { const u = (t * 0.03 + i / 2) % 1; ctx.globalAlpha = (1 - u) * 0.8; ctx.beginPath(); ctx.arc(hx + back * (R + 2), hy, 6 + u * 14, back > 0 ? -0.8 : Math.PI - 0.8, back > 0 ? 0.8 : Math.PI + 0.8); ctx.stroke(); } ctx.restore();
  }
  else if (id === 'kitsune') {                                                                               // fox ears (white inner) + crimson cheek marks
    for (const s of [-1, 1]) {
      const x0 = hx + s * R * 0.55, tw2 = Math.sin(t * 0.05 + s) * 1.5;
      tri(x0 - 5, hy - R * 0.7, x0 + s * 3 + tw2, hy - R - 13, x0 + 5, hy - R * 0.55);
      ctx.save(); ctx.fillStyle = '#ffffff'; tri(x0 - 2.5, hy - R * 0.72, x0 + s * 2.4 + tw2, hy - R - 7, x0 + 2.5, hy - R * 0.62); ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = '#ff2f57'; ctx.lineWidth = 1.8; for (const k of [0, 3]) { ctx.beginPath(); ctx.moveTo(hx + face * R * 0.15, hy + R * 0.2 + k); ctx.lineTo(hx + face * R * 0.75, hy + R * 0.1 + k); ctx.stroke(); } ctx.restore();
  }
  else if (id === 'ronin') {                                                                                 // red headband with flowing tails + katana on the back
    ctx.save(); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(hx - R, hy - R * 0.55, R * 2, 4);
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2.5; for (const k of [0, 1]) { ctx.beginPath(); ctx.moveTo(hx + back * R, hy - R * 0.45); ctx.quadraticCurveTo(hx + back * (R + 8), hy - R * 0.2 + k * 4, hx + back * (R + 14 + Math.sin(t * 0.15 + k) * 3), hy + k * 5); ctx.stroke(); }
    if (f.state !== 'attack' && !(f.state === 'special' && f.sp && f.stateT > f.sp.wind)) {      // sheathed blade
      ctx.strokeStyle = '#ececf4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(back * tw * 0.6, ty + 10); ctx.lineTo(face * tw * 0.3, ty - th / 2 - 12); ctx.stroke();
      ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(face * tw * 0.12, ty - th / 2 - 4); ctx.lineTo(face * tw * 0.3, ty - th / 2 - 12); ctx.stroke();
    }
    ctx.restore();
  }
  else if (id === 'sylph') {                                                                                 // curly antennae with glowing tips
    ctx.save(); ctx.lineWidth = 1.6; for (const s of [-1, 1]) {
      const x0 = hx + s * R * 0.35, sw = Math.sin(t * 0.1 + s) * 3;
      ctx.beginPath(); ctx.moveTo(x0, hy - R + 2); ctx.quadraticCurveTo(x0 + s * 4 + sw, hy - R - 10, x0 + s * 8 + sw, hy - R - 12); ctx.stroke();
      ctx.fillStyle = '#a8d8ff'; ctx.shadowColor = '#a8d8ff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x0 + s * 8 + sw, hy - R - 12, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } ctx.restore();
  }
  else if (id === 'mecha') {
    ctx.beginPath(); ctx.moveTo(hx + back * 4, hy - R); ctx.lineTo(hx + back * 7, hy - R - 11); ctx.stroke(); ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(hx + back * 7, hy - R - 12, 3, 0, Math.PI * 2); ctx.fill();   // antenna
    ctx.fillStyle = f.color; rr(back * (tw / 2 + 9) - 6, ty - 14, 12, 26, 3); ctx.fill();                                                                    // jetpack
    if (f.jetT > 0) {                                                                                                                                  // thruster flame
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff9a3d'; ctx.shadowBlur = 18; ctx.fillStyle = '#ffb84d';
      const fl = 18 + Math.random() * 12; ctx.beginPath(); ctx.moveTo(back * (tw / 2 + 9) - 5, ty + 12); ctx.lineTo(back * (tw / 2 + 9), ty + 12 + fl); ctx.lineTo(back * (tw / 2 + 9) + 5, ty + 12); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  else if (id === 'dino') {                                                                                  // F1 helmet, raised visor, race number, back spikes
    ctx.save();
    for (const [dy, l] of [[-R * 0.75, 9], [-R * 0.2, 10], [R * 0.35, 7]]) tri(hx + back * R * 0.82, hy + dy - 4, hx + back * (R + l), hy + dy, hx + back * R * 0.82, hy + dy + 4);   // spikes
    const shell = () => { ctx.beginPath(); ctx.arc(hx, hy, R + 2.5, Math.PI * 1.04, Math.PI * 1.96); ctx.closePath(); };   // helmet shell (top half of the head)
    if (SET.gfx !== 'neon') shadeBlob(shell, hx, hy - R * 0.5, (R + 2.5) * 2, R + 2.5, '#f2f4fc', MATERIALS.gloss, f);       // high-gloss clear-coat helmet
    shell(); if (SET.gfx === 'neon') { ctx.fillStyle = 'rgba(246,248,255,0.95)'; ctx.fill(); } ctx.save(); ctx.clip();
    ctx.fillStyle = f.color; ctx.fillRect(hx - 3, hy - R - 4, 6, R + 4);                                       // racing stripe over the top
    ctx.fillStyle = '#0a0a14'; for (let k = 0; k < 4; k++) ctx.fillRect(hx + back * (R * 0.35 + (k % 2) * 3.5), hy - R + 2 + Math.floor(k / 2) * 3.5, 3.5, 3.5);   // checker patch
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = f.color; ctx.beginPath(); ctx.arc(hx, hy, R + 2.5, Math.PI * 1.04, Math.PI * 1.96); ctx.closePath(); ctx.stroke();
    rr(hx - R * 0.78 + face * 2, hy - R * 0.62, R * 1.56, R * 0.36, 3);                                         // tinted visor, flipped up
    ctx.fillStyle = 'rgba(30,60,120,0.85)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - R * 0.5 + face * 2, hy - R * 0.55); ctx.lineTo(hx - R * 0.1 + face * 2, hy - R * 0.55); ctx.stroke();
    ctx.font = `900 11px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#0a0a14';
    ctx.strokeText('1', face * 2, ty + 1); ctx.fillStyle = '#ffffff'; ctx.fillText('1', face * 2, ty + 1);       // race number on the jumpsuit
    ctx.restore();
  }
  else if (id === 'pulse') {                                                                                 // Pulse: studio headphones, mirrored shades, a chest equalizer bouncing to the beat
    ctx.save();
    ctx.strokeStyle = '#20222c'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(hx, hy - 1, R + 3, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();   // headband
    for (const s of [-1, 1]) {                                                                                // ear cups (glossy, with a glowing ring)
      const cx = hx + s * (R + 2), cy = hy + 1;
      if (SET.gfx !== 'neon' && !SHADE.lite) shadeBlob(() => { ctx.beginPath(); ctx.ellipse(cx, cy, 5, 8, 0, 0, Math.PI * 2); }, cx, cy, 10, 16, '#2a2c38', MATERIALS.gloss, f);
      else { ctx.fillStyle = '#2a2c38'; ctx.beginPath(); ctx.ellipse(cx, cy, 5, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.6; ctx.shadowColor = f.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.ellipse(cx, cy, 3, 5.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    }
    const sx0 = hx - R * 0.78 + face * 3; ctx.fillStyle = '#0c0d16'; rr(sx0, hy - R * 0.3, R * 1.56, R * 0.4, 3); ctx.fill();   // shades
    const g = ctx.createLinearGradient(sx0, 0, sx0 + R * 1.56, 0); g.addColorStop(0, rgba(f.color, 0.9)); g.addColorStop(1, rgba(c.alt, 0.9));
    ctx.fillStyle = g; ctx.fillRect(sx0 + 2, hy - R * 0.3 + 2, R * 1.56 - 4, 2);
    const beat = c.beat ? 1 - (G.frame % c.beat) / c.beat : 0;                                                     // equalizer bars
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 8;
    for (let i = 0; i < 5; i++) { const h = 3 + (hash(i * 3.1 + (t >> 3)) * 6 + beat * 6) * (i % 2 ? 0.8 : 1); ctx.fillStyle = i < 2 ? f.color : i < 4 ? c.alt : '#ffffff'; ctx.fillRect(-9 + i * 4, ty + 6 - h, 2.6, h); }
    ctx.restore();
  }
  else if (id === 'valkyrie') {                                                                              // Valkyrie: winged helm with a gold circlet
    ctx.save(); ctx.fillStyle = '#ffd36e'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 6; rr(hx - R, hy - R * 0.5, R * 2, 3.5, 1.5); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#f4f6ff'; ctx.strokeStyle = 'rgba(120,140,180,0.8)'; ctx.lineWidth = 1;
    for (const s of [-1, 1]) {                                                                                // little helm wings
      const x0 = hx + s * R * 0.85, y0 = hy - R * 0.45, fl = Math.sin(t * 0.12 + s) * 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x0 + s * (5 + k * 3), y0 - 6 - k * 3 + fl, 7 - k * 1.5, 2.6, s * (-0.7 - k * 0.15), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  }
  else if (id === 'magma') {                                                                                 // Magma: molten cracks glowing through the rock + a jagged crown of cooling basalt
    ctx.save(); ctx.fillStyle = '#3a2a24';
    for (let i = -2; i <= 2; i++) tri(hx + i * R * 0.36 - 4, hy - R * 0.7, hx + i * R * 0.36 + back * 2, hy - R - 8 - (2 - Math.abs(i)) * 4, hx + i * R * 0.36 + 4, hy - R * 0.7);
    const glow = 0.65 + 0.35 * Math.sin(t * 0.09 + f.id);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 12;
    ctx.strokeStyle = rgba('#ffb03a', glow); ctx.lineWidth = 2.2; ctx.beginPath();
    ctx.moveTo(-tw * 0.3, ty - th * 0.4); ctx.lineTo(-tw * 0.05, ty - th * 0.1); ctx.lineTo(-tw * 0.2, ty + th * 0.15); ctx.lineTo(tw * 0.05, ty + th * 0.38);
    ctx.moveTo(-tw * 0.05, ty - th * 0.1); ctx.lineTo(tw * 0.28, ty - th * 0.22);
    ctx.moveTo(hx - R * 0.5, hy - R * 0.55); ctx.lineTo(hx - R * 0.1, hy - R * 0.2); ctx.lineTo(hx + back * R * 0.4, hy - R * 0.3);
    ctx.stroke();
    ctx.strokeStyle = rgba('#fff2b0', glow * 0.7); ctx.lineWidth = 0.9; ctx.stroke();                           // white-hot core of each crack
    ctx.restore();
  }
  else if (id === 'sol') {                                                                                   // Sol: a T-visor and a sun emblem (the sun-disc halo is drawn behind the head: drawSunHalo)
    ctx.save(); ctx.fillStyle = '#2a1a08'; rr(hx - R * 0.7 + face * 2, hy - R * 0.28, R * 1.4, 4, 2); ctx.fill(); rr(hx + face * R * 0.15 - 2, hy - R * 0.28, 4, R * 0.75, 2); ctx.fill();
    ctx.fillStyle = '#fff1b8'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, ty - 2, 5.5, 0, Math.PI * 2); ctx.fill();   // sun emblem on the cuirass
    ctx.restore();
  }
  else if (id === 'gale') {                                                                                  // Gale: a crown of storm-cloud puffs streaming back, little lightning sparks
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const u = i / 5, x = hx + back * (u * (R + 14)) - face * 3, y = hy - R * 0.75 + u * 6 + Math.sin(t * 0.1 + i) * 1.5, r = (R * 0.5) * (1 - u * 0.5);
      ctx.fillStyle = i % 2 ? '#e6f9ff' : '#c9e9ff'; ctx.globalAlpha = 0.95 - u * 0.4; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if ((t + f.id * 13) % 90 < 6) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(hx + back * 10, hy - R - 2); ctx.lineTo(hx + back * 14, hy - R + 6); ctx.lineTo(hx + back * 11, hy - R + 6); ctx.lineTo(hx + back * 16, hy - R + 14); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(f.color, 0.55); ctx.lineWidth = 2;        // a wind vortex around the legs
    for (let i = 0; i < 3; i++) { const a = t * 0.2 + i * 2.1; ctx.beginPath(); ctx.ellipse(0, ty + th / 2 + 6 + i * 5, 14 - i * 3, 3, 0, a, a + 3.6); ctx.stroke(); }
    if (f.jetT > 0) { ctx.strokeStyle = rgba('#ffffff', 0.7); for (let i = 0; i < 4; i++) { const a = -t * 0.4 + i * 1.6; ctx.beginPath(); ctx.ellipse(0, ty + th / 2 + 14 + i * 6, 18 - i * 3, 4, 0, a, a + 4); ctx.stroke(); } }
    ctx.restore();
  }
  else if (id === 'drift') {                                                                                 // Drift: wrap-around holo visor, a neon light-fin crest, scrolling scanlines
    ctx.save(); ctx.fillStyle = 'rgba(10,12,30,0.9)'; rr(hx - R * 0.85 + face * 3, hy - R * 0.38, R * 1.7, R * 0.46, 5); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = c.alt; ctx.shadowBlur = 10;
    ctx.fillStyle = c.alt; ctx.fillRect(hx - R * 0.6 + face * 3 + ((t * 0.8) % (R * 1.2)), hy - R * 0.3, 3, R * 0.3);   // scanning light in the visor
    ctx.fillStyle = f.color; tri(hx - 3, hy - R + 1, hx + back * 14, hy - R - 9 + Math.sin(t * 0.2) * 1.5, hx + back * 4, hy - R * 0.5);   // light-fin
    ctx.shadowBlur = 0; ctx.fillStyle = rgba(f.color, 0.18);
    for (let y = ty - th / 2 + ((t * 0.6) % 4); y < ty + th / 2; y += 4) ctx.fillRect(-tw / 2 + 2, y, tw - 4, 1.2);   // hologram scanlines
    ctx.restore();
  }
  else if (id === 'zenith') {                                                                                // Zenith: shaved head with a topknot, a third-eye gem and orbiting prayer beads
    ctx.save(); ctx.fillStyle = darken(f.color, 0.35); ctx.beginPath(); ctx.arc(hx + back * 2, hy - R + 1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6bff'; ctx.shadowColor = '#8a6bff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(hx + face * 3, hy - R * 0.62); ctx.lineTo(hx + face * 5, hy - R * 0.45); ctx.lineTo(hx + face * 3, hy - R * 0.28); ctx.lineTo(hx + face, hy - R * 0.45); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#7a3a1a'; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + t * 0.03; ctx.beginPath(); ctx.arc(Math.cos(a) * (tw / 2 + 10), ty + Math.sin(a) * 6 - 4, 2.6, 0, Math.PI * 2); ctx.fill(); }   // prayer beads
    ctx.strokeStyle = '#8a6bff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-tw / 2 + 2, ty - th / 2 + 2); ctx.lineTo(tw / 2 - 4, ty + th / 2 - 2); ctx.stroke();   // monk's sash
    ctx.restore();
  }
  else if (id === 'serpent') {                                                                               // Venom: a flared cobra hood, fangs, and diamond scale markings
    ctx.save(); ctx.fillStyle = '#c6ff2e'; for (let i = 0; i < 3; i++) { const y = ty - th * 0.3 + i * th * 0.28; ctx.beginPath(); ctx.moveTo(0, y - 4); ctx.lineTo(4, y); ctx.lineTo(0, y + 4); ctx.lineTo(-4, y); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#ffffff'; const vy = hy + R * 0.4; for (const k of [2, 8]) { ctx.beginPath(); ctx.moveTo(hx + face * k, vy); ctx.lineTo(hx + face * (k + 1.5), vy + 6); ctx.lineTo(hx + face * (k + 3), vy); ctx.fill(); }
    const dr = (t * 0.04 + f.id) % 1; ctx.globalAlpha = 1 - dr; ctx.fillStyle = '#c6ff2e'; ctx.beginPath(); ctx.arc(hx + face * 9, vy + 8 + dr * 14, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'blitz') {                                                                                 // Blitz: a lightning-bolt quiff, sprint visor, plasma core
    ctx.save(); ctx.fillStyle = '#ffffff'; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(hx - face * 4, hy - R + 2); ctx.lineTo(hx + back * 14, hy - R - 10); ctx.lineTo(hx + back * 6, hy - R - 2); ctx.lineTo(hx + back * 18, hy - R - 4); ctx.lineTo(hx + face * 4, hy - R * 0.55); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(10,30,60,0.85)'; rr(hx - R * 0.75 + face * 3, hy - R * 0.32, R * 1.5, R * 0.36, 4); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(0, ty, 4 + Math.sin(t * 0.5) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'umbra') {                                                                                 // Umbra: a deep void hood with glowing slit eyes and dripping darkness
    ctx.save(); ctx.fillStyle = '#0c0618';
    ctx.beginPath(); ctx.arc(hx, hy, R + 3, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(hx + back * (R + 8), hy + R * 0.6); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ff3d9a'; ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = 10;
    for (const s of [0.1, 0.45]) { ctx.beginPath(); ctx.ellipse(hx + face * R * s, hy - 1, 3, 1.2, -face * 0.25, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(20,8,40,0.7)';
    for (let i = 0; i < 3; i++) { const u = (t * 0.025 + i / 3) % 1; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(-tw / 2 + 6 + i * (tw - 12) / 2, ty + th / 2 + u * 22, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  else if (id === 'fang') {                                                                                  // Fang: pointed wolf ears, a shaggy mane and a snout
    ctx.save(); for (const s of [-1, 1]) { tri(hx + s * R * 0.55 - 5, hy - R * 0.6, hx + s * R * 0.7 + back * 3, hy - R - 12, hx + s * R * 0.55 + 5, hy - R * 0.45); }
    ctx.fillStyle = darken(f.color, 0.3); for (let i = 0; i < 6; i++) { const a = Math.PI * 0.55 + i * 0.32 * (back > 0 ? -1 : 1) + (back > 0 ? Math.PI * 0.9 : 0); tri(hx + Math.cos(a) * R * 0.8, hy + Math.sin(a) * R * 0.8 - 3, hx + Math.cos(a) * (R + 10), hy + Math.sin(a) * (R + 10), hx + Math.cos(a + 0.3) * R * 0.8, hy + Math.sin(a + 0.3) * R * 0.8); }   // mane
    ctx.fillStyle = lighten(f.color, 0.25); ctx.beginPath(); ctx.ellipse(hx + face * R * 0.75, hy + R * 0.25, R * 0.45, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();   // snout
    ctx.fillStyle = '#1a1010'; ctx.beginPath(); ctx.arc(hx + face * R * 1.1, hy + R * 0.18, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'prism') {                                                                                 // Prism: a crown of floating crystal shards casting rainbow glints
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 10;
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.42, d = R + 7 + Math.sin(t * 0.08 + i) * 2, x = hx + Math.cos(a) * d, y = hy + Math.sin(a) * d;
      ctx.fillStyle = ['rgba(255,140,180,0.85)', 'rgba(140,255,200,0.85)', 'rgba(255,255,255,0.95)', 'rgba(140,180,255,0.85)', 'rgba(255,220,140,0.85)'][i];
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.lineTo(x - Math.sin(a) * 3, y + Math.cos(a) * 3); ctx.lineTo(x - Math.cos(a) * 3, y - Math.sin(a) * 3); ctx.lineTo(x + Math.sin(a) * 3, y - Math.cos(a) * 3); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  else if (id === 'smith') {                                                                                 // Forge: a leather apron and a glowing furnace grate in the chest
    ctx.save(); ctx.fillStyle = '#4a2e1a'; rr(-tw * 0.36, ty - th * 0.2, tw * 0.72, th * 0.7, 4); ctx.fill();
    const hot = f.heatN > 0 ? 1 : 0.45 + 0.15 * Math.sin(t * 0.1);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,140,40,${hot})`; ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 16; rr(-8, ty - th * 0.38, 16, 11, 3); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.fillStyle = '#2a1a10'; for (let k = 0; k < 3; k++) ctx.fillRect(-7 + k * 5, ty - th * 0.38, 1.6, 11);   // grate bars
    ctx.fillStyle = '#3a2a20'; rr(hx - R * 0.7, hy - R * 0.3, R * 1.4, 4, 2); ctx.fill();                                                          // soot-dark brow plate
    ctx.restore();
  }
  else if (id === 'mimic') {                                                                                 // Echo: speaker-cone shoulders that pulse, and a waveform grille for a mouth
    ctx.save(); for (const s of [-1, 1]) { const x = s * (tw / 2 + 3), y = ty - th / 2 + 4, p = 1 + 0.12 * Math.sin(t * 0.4 + s);
      ctx.fillStyle = '#1a2a2a'; ctx.beginPath(); ctx.arc(x, y, 8 * p, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5 * p, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = c.alt; ctx.lineWidth = 1.4; ctx.shadowColor = c.alt; ctx.shadowBlur = 8; ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = hx + face * R * 0.1 + (i - 5) * 1.2 * face, y = hy + R * 0.5 + Math.sin(i * 1.3 + t * 0.6) * 2.5 * Math.sin(i / 10 * Math.PI); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore();
  }
  else if (id === 'stormmage') {                                                                             // Tempest: a crackling thundercloud crown and a lightning-tipped collar
    ctx.save();
    for (let i = 0; i < 5; i++) { const x = hx + (i - 2) * R * 0.42 + back * 2, y = hy - R * 0.85 - (2 - Math.abs(i - 2)) * 3; const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7); g.addColorStop(0, '#9aa4c8'); g.addColorStop(1, '#3a4060'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill(); }
    if ((t + f.id * 17) % 50 < 5) { ctx.strokeStyle = '#ffe629'; ctx.lineWidth = 1.6; ctx.shadowColor = '#ffe629'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(hx + 4, hy - R - 4); ctx.lineTo(hx, hy - R + 4); ctx.lineTo(hx + 3, hy - R + 4); ctx.lineTo(hx - 2, hy - R + 12); ctx.stroke(); }
    ctx.fillStyle = '#ffe629'; for (const s of [-1, 1]) tri(s * 4, ty - th / 2 + 2, s * 12, ty - th / 2 - 6, s * 10, ty - th / 2 + 6);
    ctx.restore();
  }
  else if (id === 'strider') {                                                                               // Strider: a wide-brimmed nomad hat, face wrap, and the coiled grapple at the hip
    ctx.save(); ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.ellipse(hx, hy - R * 0.55, R * 1.55, R * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, hy - R * 0.8, R * 0.75, R * 0.45, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5ac8a0'; ctx.beginPath(); ctx.arc(hx, hy, R + 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.closePath(); ctx.fill();   // face wrap
    ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(back * tw * 0.42, ty + 8, 6 - k, 4 - k * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'specter') {                                                                               // Specter: a hollow great-helm with blue spirit-fire in the visor slit and a wisping plume
    ctx.save(); ctx.fillStyle = '#26304e'; rr(hx - R * 0.95, hy - R * 0.9, R * 1.9, R * 1.6, R * 0.5); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.fillRect(hx - R * 0.55 + face * 3, hy - 3, R * 1.1, 3.5);
    for (let i = 0; i < 4; i++) { const u = (t * 0.04 + i / 4) % 1; ctx.globalAlpha = (1 - u) * 0.7; ctx.beginPath(); ctx.arc(hx + back * (4 + u * 16) + Math.sin(t * 0.2 + i) * 2, hy - R - 2 - u * 18, 4 * (1 - u) + 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  else if (id === 'inferno') {                                                                               // Inferno: blazing horns, a molten jaw-guard, flames that rage harder with damage
    ctx.save(); ctx.fillStyle = '#3a1a10'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + s * R * 0.5, hy - R * 0.6); ctx.quadraticCurveTo(hx + s * (R + 10), hy - R - 4, hx + s * (R + 4), hy - R - 16); ctx.lineTo(hx + s * R * 0.75, hy - R * 0.35); ctx.closePath(); ctx.fill(); }
    const rage = Math.min(1, (f.percent || 0) / 150);
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff3a1a'; ctx.shadowBlur = 14 + rage * 14;
    for (let i = -1; i <= 1; i++) { const x = hx + i * R * 0.45, h = (10 + rage * 16) * (0.8 + 0.2 * Math.sin(t * 0.4 + i * 2));
      ctx.fillStyle = i ? '#ff5a1f' : '#ffd23a'; ctx.beginPath(); ctx.moveTo(x - 5, hy - R * 0.7); ctx.quadraticCurveTo(x, hy - R - h, x + Math.sin(t * 0.3 + i) * 3, hy - R - h); ctx.quadraticCurveTo(x + 2, hy - R - h * 0.4, x + 5, hy - R * 0.7); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = rgba('#ffb03a', 0.6 + rage * 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-tw * 0.3, ty - th * 0.3); ctx.lineTo(0, ty); ctx.lineTo(tw * 0.25, ty - th * 0.15); ctx.moveTo(0, ty); ctx.lineTo(-tw * 0.1, ty + th * 0.35); ctx.stroke();   // magma veins
    ctx.restore();
  }
  else if (id === 'byte') {                                                                                  // Byte: a cube-pixel head overlay, error glyph, broken scanlines
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(c.alt, 0.8); ctx.lineWidth = 1.5; rr(hx - R, hy - R, R * 2, R * 2, 3); ctx.stroke();
    ctx.fillStyle = rgba(c.alt, 0.5); for (let i = 0; i < 4; i++) if (hash(i + (t >> 3)) > 0.5) ctx.fillRect(hx - R + hash(i * 3 + (t >> 3)) * R * 1.6, hy - R + i * R * 0.5, 4, 4);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#0a0a14'; ctx.font = `900 9px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((t >> 5) % 2 ? '404' : 'ERR', 0, ty + 2);
    ctx.restore();
  }
  else if (id === 'titanus') {                                                                               // Titanus: colossal pauldrons, twin exhaust stacks and a burning visor slit
    ctx.save();
    for (const s of [-1, 1]) { const part = () => rr(s * (tw / 2 + 2) - 13, ty - th / 2 - 10, 26, 18, 7);
      if (SET.gfx !== 'neon' && !SHADE.lite) shadeBlob(part, s * (tw / 2 + 2), ty - th / 2 - 1, 26, 18, '#9aa6b8', MATERIALS.metal, f); else { part(); ctx.fillStyle = '#9aa6b8'; ctx.fill(); } }
    ctx.fillStyle = '#3a404c'; for (const k of [0, 9]) { rr(back * (tw / 2 - 4) - 4 + back * k, ty - th / 2 - 24, 8, 20, 2); ctx.fill(); }   // exhaust stacks (their smoke is emitted in fighter-update)
    ctx.fillStyle = '#20242e'; rr(hx - R * 0.85, hy - R * 0.35, R * 1.7, R * 0.42, 3); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffb84d'; ctx.shadowColor = '#ff9a3d'; ctx.shadowBlur = 12; ctx.fillRect(hx - R * 0.6 + face * 2, hy - R * 0.2, R * 1.2, 3);
    ctx.restore();
  }
  else if (id === 'apexx') {                                                                                 // Apex-X: chrome android — a sensor visor whose colour shows the adapted mode, and a core
    const o = fighters.includes(f) ? otherOf(f) : null, cls = o ? weightClassOf(o.ch).id : 'mid';
    const mc = cls === 'floaty' ? '#2ef0ff' : cls === 'mid' ? '#ffe14d' : '#ff2f57';
    ctx.save(); ctx.fillStyle = '#14161e'; rr(hx - R * 0.85 + face * 2, hy - R * 0.36, R * 1.7, R * 0.42, 5); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = mc; ctx.shadowColor = mc; ctx.shadowBlur = 12;
    ctx.fillRect(hx - R * 0.6 + face * 2 + Math.sin(t * 0.1) * R * 0.4, hy - R * 0.28, 6, R * 0.26);     // scanning eye
    ctx.beginPath(); ctx.arc(0, ty - 2, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(mc, 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, ty - 2); ctx.lineTo(-tw * 0.3, ty + th * 0.3); ctx.moveTo(0, ty - 2); ctx.lineTo(tw * 0.3, ty + th * 0.3); ctx.stroke();   // circuit lines
    ctx.restore();
  }
  else if (id === 'strix') {                                                                                 // Strix: owl ear-tufts, a pale facial disc and a hooked beak
    ctx.save(); ctx.fillStyle = darken(f.color, 0.3); for (const s of [-1, 1]) tri(hx + s * R * 0.35, hy - R * 0.75, hx + s * R * 0.75 + back * 2, hy - R - 11, hx + s * R * 0.85, hy - R * 0.45);
    ctx.fillStyle = 'rgba(250,240,220,0.75)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + face * R * 0.22 + s * R * 0.32, hy - R * 0.05, R * 0.34, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(hx + face * R * 0.45, hy + R * 0.12); ctx.lineTo(hx + face * R * 0.75, hy + R * 0.25); ctx.lineTo(hx + face * R * 0.45, hy + R * 0.42); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  else if (id === 'kuro') {                                                                                  // Kuro: a red oni mask with two horns and a fanged grin
    ctx.save(); ctx.fillStyle = '#f4ead8'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + s * R * 0.35, hy - R * 0.8); ctx.quadraticCurveTo(hx + s * R * 0.7, hy - R - 8, hx + s * R * 0.5 + back * 3, hy - R - 16); ctx.lineTo(hx + s * R * 0.55, hy - R * 0.65); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#1a1020'; ctx.beginPath(); ctx.moveTo(hx - R * 0.8, hy - R * 0.5); ctx.lineTo(hx + R * 0.8, hy - R * 0.5); ctx.lineTo(hx, hy - R * 0.2); ctx.closePath(); ctx.fill();   // furrowed brow
    ctx.fillStyle = '#ffffff'; for (const k of [-0.25, 0.15]) tri(hx + face * R * (0.3 + k), hy + R * 0.38, hx + face * R * (0.36 + k), hy + R * 0.62, hx + face * R * (0.42 + k), hy + R * 0.38);
    ctx.restore();
  }
  else if (id === 'bismuth') {                                                                               // Bismuth: stair-stepped iridescent crystal growths on the shoulders and crown
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cols = ['rgba(255,140,220,0.65)', 'rgba(140,255,220,0.6)', 'rgba(255,230,120,0.6)', 'rgba(150,160,255,0.65)'];
    for (const [x, y, s] of [[-tw / 2 - 2, ty - th / 2 - 4, 1], [tw / 2 + 2, ty - th / 2 - 4, 1], [hx, hy - R - 2, 0.8]]) for (let k = 0; k < 3; k++) {
      ctx.fillStyle = cols[(k + Math.floor(t / 20)) % 4]; const w = (14 - k * 4) * s; ctx.fillRect(x - w / 2, y - k * 6 * s - w * 0.6, w, w * 0.6); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - k * 6 * s - w * 0.6, w, w * 0.6); }
    ctx.restore();
  }
  else if (id === 'aura') {                                                                                  // Aura: a spirit lantern orbiting and a translucent ancestor's mask hovering behind
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(c.alt, 0.35); ctx.beginPath(); ctx.ellipse(hx + back * (R + 8), hy - 6 + Math.sin(t * 0.06) * 2, R * 0.7, R * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(10,20,20,0.6)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + back * (R + 8) + s * 4, hy - 9 + Math.sin(t * 0.06) * 2, 2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    const a = t * 0.05, lx = Math.cos(a) * (tw / 2 + 14), ly = ty - 10 + Math.sin(a) * 8;
    ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'nox') {                                                                                   // Nox: a long plague-doctor beak mask, round goggles and a wide-brimmed hat
    ctx.save(); ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(hx + face * R * 0.2, hy - R * 0.1); ctx.quadraticCurveTo(hx + face * (R + 16), hy + R * 0.1, hx + face * (R + 22), hy + R * 0.7); ctx.quadraticCurveTo(hx + face * (R + 4), hy + R * 0.5, hx + face * R * 0.2, hy + R * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c6ff2e'; ctx.shadowColor = '#c6ff2e'; ctx.shadowBlur = 8; for (const s of [0.05, 0.5]) { ctx.beginPath(); ctx.arc(hx + face * R * s, hy - R * 0.12, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = '#1a1c14'; ctx.beginPath(); ctx.ellipse(hx, hy - R * 0.7, R * 1.5, R * 0.25, 0, 0, Math.PI * 2); ctx.fill(); rr(hx - R * 0.65, hy - R * 1.45, R * 1.3, R * 0.8, 3); ctx.fill();
    ctx.restore();
  }
  else if (id === 'helix') {                                                                                 // Helix: a double-helix strand spiralling round the body
    ctx.save(); ctx.lineWidth = 2;
    for (const ph of [0, Math.PI]) { ctx.strokeStyle = ph ? c.alt : '#ffffff'; ctx.beginPath(); for (let i = 0; i <= 16; i++) { const u = i / 16, y = ty + th / 2 - u * (th + R * 2.2), x = Math.sin(u * TAU * 1.5 + t * 0.08 + ph) * (tw / 2 + 6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'zealot') {                                                                                // Zealot: a shaved head with a glowing laser-sigil and a saffron sash
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c.alt; ctx.shadowColor = c.alt; ctx.shadowBlur = 10; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(hx + face * 2, hy - R * 0.55, 4, 0, Math.PI * 2); ctx.moveTo(hx + face * 2, hy - R * 0.95); ctx.lineTo(hx + face * 2, hy - R * 0.15); ctx.stroke();
    ctx.restore(); ctx.save(); ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-tw / 2 + 2, ty - th / 2 + 2); ctx.lineTo(tw / 2 - 2, ty + th / 2 - 4); ctx.stroke(); ctx.restore();
  }
  else if (id === 'pyre') {                                                                                  // Pyre: a wyrm's horned crest, back spines and smouldering scales
    ctx.save(); ctx.fillStyle = c.alt; for (let i = 0; i < 4; i++) tri(hx + back * (R * 0.2 + i * 4), hy - R * 0.7 + i * 6, hx + back * (R + 8 - i), hy - R * 0.9 + i * 8, hx + back * (R * 0.5 + i * 4), hy - R * 0.4 + i * 6);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,80,0.5)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-tw * 0.3 + i * tw * 0.15, ty - th * 0.2 + (i % 2) * 8, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = `rgba(255,140,40,${0.5 + 0.3 * Math.sin(t * 0.3)})`; ctx.beginPath(); ctx.arc(hx + face * R * 0.9, hy + R * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();   // nostril ember
    ctx.restore();
  }
  else if (id === 'vesper') {                                                                                // Vesper: black stripes, compound-eye visor, antennae and buzzing wings
    ctx.save(); ctx.fillStyle = '#1a1a24'; for (let k = 0; k < 3; k++) ctx.fillRect(-tw / 2 + 2, ty - th * 0.35 + k * th * 0.3, tw - 4, 4);
    ctx.fillStyle = 'rgba(255,60,90,0.8)'; ctx.beginPath(); ctx.ellipse(hx + face * R * 0.35, hy - 2, R * 0.55, R * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + s * 3, hy - R); ctx.quadraticCurveTo(hx + s * 6 + face * 4, hy - R - 10, hx + s * 10 + face * 6, hy - R - 12); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter'; const fl = f.jetT > 0 || !f.onGround ? Math.sin(t * 2.4) * 0.5 + 0.5 : 0.2;
    ctx.fillStyle = 'rgba(200,240,255,0.3)'; for (const s of [0, 1]) { ctx.beginPath(); ctx.ellipse(back * (8 + s * 6), ty - th / 2 - 4, 14 - s * 3, 5 + fl * 3, back * (0.6 + s * 0.4), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  else if (id === 'rogue') {                                                                                 // Rogue: a holographic tricorn, an eyepatch, and a data-skull badge
    ctx.save(); ctx.fillStyle = '#1a2a2a'; ctx.beginPath(); ctx.moveTo(hx - R * 1.3, hy - R * 0.55); ctx.quadraticCurveTo(hx, hy - R * 1.7, hx + R * 1.3, hy - R * 0.55); ctx.quadraticCurveTo(hx, hy - R * 0.85, hx - R * 1.3, hy - R * 0.55); ctx.fill();
    ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#0a0a14'; ctx.beginPath(); ctx.arc(hx + face * R * 0.5, hy - R * 0.1, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#0a0a14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - R, hy - R * 0.5); ctx.lineTo(hx + face * R * 0.5, hy - R * 0.1); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = c.alt; ctx.font = `900 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☠', 0, ty);
    ctx.restore();
  }
  else if (id === 'titanis') {                                                                               // Titanis: a moss-crowned monolith head with glowing rune-eyes and rune bands
    ctx.save(); ctx.fillStyle = '#5fae4a'; ctx.beginPath(); ctx.ellipse(hx, hy - R + 1, R * 0.95, 5, 0, Math.PI, 0); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; const glow = f.rootT > 0 ? 1 : 0.5 + 0.2 * Math.sin(t * 0.06);
    ctx.strokeStyle = rgba(c.alt, glow); ctx.shadowColor = c.alt; ctx.shadowBlur = 10; ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) { const y = ty - th * 0.2 + k * th * 0.4; ctx.beginPath(); ctx.moveTo(-tw * 0.35, y); for (let i = 1; i <= 6; i++) ctx.lineTo(-tw * 0.35 + i * tw * 0.117, y + (i % 2 ? -3 : 3)); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'paradox') {                                                                               // Chronos-II: a cracked hourglass emblem and fractured, offset after-image halo
    ctx.save(); ctx.strokeStyle = c.alt; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, ty - 9); ctx.lineTo(6, ty - 9); ctx.lineTo(-6, ty + 9); ctx.lineTo(6, ty + 9); ctx.closePath(); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(f.color, 0.5); ctx.lineWidth = 1.5;
    for (let k = 1; k <= 2; k++) { const off = Math.sin(t * 0.05 + k) * 4 * k; ctx.beginPath(); ctx.arc(hx + back * off, hy, R + 2 + k * 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'zen') {                                                                                   // Zen: a cyber-samurai kabuto crest and a neon mempo face-guard
    ctx.save(); ctx.fillStyle = '#14181c'; ctx.beginPath(); ctx.arc(hx, hy, R + 1.5, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(hx - 3, hy - R - 1); ctx.quadraticCurveTo(hx - R, hy - R - 12, hx - R * 1.3, hy - R - 18); ctx.moveTo(hx + 3, hy - R - 1); ctx.quadraticCurveTo(hx + R, hy - R - 12, hx + R * 1.3, hy - R - 18); ctx.stroke();   // crescent crest
    ctx.strokeStyle = c.alt; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx + face * R * 0.05, hy + R * 0.35); ctx.lineTo(hx + face * R * 0.85, hy + R * 0.35); ctx.stroke();
    ctx.restore();
  }
  else if (id === 'fable') {                                                                                 // Fable: a quill tucked behind the ear and an open storybook at the hip
    ctx.save(); ctx.strokeStyle = '#2a2a70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + back * R * 0.5, hy - R * 0.3); ctx.lineTo(hx + back * (R + 6), hy - R - 12); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(hx + back * (R + 3), hy - R - 6, 2.5, 7, back * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.translate(back * (tw / 2 + 2), ty + 6); ctx.rotate(back * 0.2); ctx.fillStyle = '#7a2a2a'; rr(-9, -7, 18, 14, 2); ctx.fill(); ctx.fillStyle = '#f8f0dc'; ctx.fillRect(-7, -5, 6, 10); ctx.fillRect(1, -5, 6, 10);
    ctx.fillStyle = '#2a2a70'; ctx.globalAlpha *= 0.6; ctx.fillRect(-6, -3, 4, 1); ctx.fillRect(-6, 0, 4, 1); ctx.fillRect(2, -3, 4, 1);
    ctx.restore();
  }
  else if (id === 'goliath') {                                                                               // Goliath: rebar spikes jutting from cracked concrete shoulders and a hard-hat
    ctx.save(); ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = 2.5; for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(s * (tw / 2 - 4 - k * 6), ty - th / 2 + 2); ctx.lineTo(s * (tw / 2 + 4 - k * 4), ty - th / 2 - 12 - k * 4); ctx.stroke(); }
    ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.arc(hx, hy - R * 0.3, R + 1, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - R - 4, hy - R * 0.32, R * 2 + 8, 3);
    ctx.strokeStyle = 'rgba(40,40,30,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-tw * 0.2, ty - th * 0.3); ctx.lineTo(-tw * 0.05, ty); ctx.lineTo(-tw * 0.18, ty + th * 0.3); ctx.stroke();
    ctx.restore();
  }
  else if (id === 'orin') {                                                                                  // Orin: a sunburst crest-helm with a golden face-plate
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffe680'; ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 12;
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.3; tri(hx + Math.cos(a - 0.08) * R, hy + Math.sin(a - 0.08) * R, hx + Math.cos(a) * (R + 12 + (i % 2) * 5), hy + Math.sin(a) * (R + 12 + (i % 2) * 5), hx + Math.cos(a + 0.08) * R, hy + Math.sin(a + 0.08) * R); }
    ctx.restore(); ctx.save(); ctx.fillStyle = '#c89a2a'; rr(hx - R * 0.7 + face * 3, hy - R * 0.32, R * 1.4, 4, 2); ctx.fill(); ctx.restore();
  }
  else if (id === 'nyx2') {                                                                                  // Nyx-II: a torn wraith hood with rift-cracks of light and twin daggers at the back
    tri(hx - R * 0.95, hy - R * 0.1, hx + back * (R + 10), hy - R - 14, hx + R * 0.95, hy - R * 0.1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c.alt; ctx.shadowColor = c.alt; ctx.shadowBlur = 8; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-tw * 0.2, ty - th * 0.3); ctx.lineTo(-tw * 0.05, ty - th * 0.05); ctx.lineTo(-tw * 0.15, ty + th * 0.2); ctx.lineTo(tw * 0.05, ty + th * 0.35); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(back * tw * 0.45, ty + 4); ctx.lineTo(back * tw * 0.45 + s * 10, ty - 16); ctx.stroke(); }
    ctx.restore();
  }
  else if (id === 'kryp') {                                                                                  // Kryp: a grinning skull face with green soulfire eye-sockets and an exposed ribcage
    ctx.save(); ctx.strokeStyle = '#e8ffe0'; ctx.lineWidth = 1.6; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, ty - th * 0.3 + k * 6, tw * 0.32 - k * 1.5, 2, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
    ctx.fillStyle = '#e8ffe0'; ctx.fillRect(-1, ty - th * 0.38, 2, th * 0.7);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
    for (let i = 0; i < 3; i++) { const x = hx + (i - 1) * 6, h = 8 + Math.sin(t * 0.4 + i * 2) * 3; ctx.beginPath(); ctx.moveTo(x - 3, hy - R * 0.7); ctx.quadraticCurveTo(x, hy - R - h, x + 1, hy - R - h); ctx.quadraticCurveTo(x + 1, hy - R * 0.9, x + 3, hy - R * 0.7); ctx.fill(); }   // soulfire flames on the skull
    ctx.restore();
  }
  else if (id === 'atlas') {                                                                                 // Atlas: a tiny orbiting moon and a gravity halo bending around the head
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(c.alt, 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(hx, hy - 2, R + 9, 5, -0.2, 0, Math.PI * 2); ctx.stroke();
    const a = t * 0.08, mx = hx + Math.cos(a) * (R + 9), my = hy - 2 + Math.sin(a) * 5 - Math.cos(a) * 1.8;
    ctx.fillStyle = c.alt; ctx.shadowColor = c.alt; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(mx, my, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'siren') {                                                                                 // Siren: flowing aqua hair, a pearl headpiece and a glowing throat-gem
    ctx.save(); ctx.strokeStyle = c.alt; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const y0 = hy - R * 0.7 + i * 5, sw = Math.sin(t * 0.08 + i) * 4; ctx.beginPath(); ctx.moveTo(hx, y0); ctx.bezierCurveTo(hx + back * (R + 8), y0 - 2, hx + back * (R + 12), y0 + 16 + sw, hx + back * (R + 18), y0 + 30 + sw); ctx.stroke(); }
    ctx.fillStyle = '#fff6f0'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(hx + i * 4, hy - R - 1 + Math.abs(i), 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, ty - th / 2 + 4, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'talon') {                                                                                 // Talon: a hawk's swept crest, a hooked beak and hunter's goggles
    ctx.save(); ctx.fillStyle = darken(f.color, 0.25); for (let i = 0; i < 3; i++) tri(hx + back * R * 0.2, hy - R * 0.8 + i * 5, hx + back * (R + 12 - i * 3), hy - R * 0.9 + i * 7, hx + back * R * 0.4, hy - R * 0.5 + i * 5);
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(hx + face * R * 0.55, hy); ctx.quadraticCurveTo(hx + face * (R + 8), hy + 2, hx + face * (R + 4), hy + R * 0.5); ctx.lineTo(hx + face * R * 0.55, hy + R * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30,60,90,0.85)'; rr(hx - R * 0.5 + face * 2, hy - R * 0.42, R * 1.1, R * 0.3, 3); ctx.fill();
    ctx.restore();
  }
  else if (id === 'brimstone') {                                                                             // Brimstone: hellfire horns, a molten chest-core and smoking shoulders
    ctx.save(); ctx.fillStyle = '#2a0a06'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + s * R * 0.4, hy - R * 0.7); ctx.quadraticCurveTo(hx + s * (R + 12), hy - R, hx + s * (R + 8), hy - R - 18); ctx.lineTo(hx + s * R * 0.7, hy - R * 0.4); ctx.closePath(); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, ty - 4, 1, 0, ty - 4, 12); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, ty - 4, 12 + Math.sin(t * 0.2) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  else if (id === 'gridrunner') {                                                                            // Matrix: a wireframe body — a scrolling grid wraps the torso, data streams off the head
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(f.color, 0.55); ctx.lineWidth = 1;
    for (let y = ty - th / 2 + ((t * 0.5) % 6); y < ty + th / 2; y += 6) { ctx.beginPath(); ctx.moveTo(-tw / 2 + 2, y); ctx.lineTo(tw / 2 - 2, y); ctx.stroke(); }
    for (let x = -tw / 2 + 4; x < tw / 2; x += 7) { ctx.beginPath(); ctx.moveTo(x, ty - th / 2 + 2); ctx.lineTo(x, ty + th / 2 - 2); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(hx, hy, R, R * 0.35, 0, 0, Math.PI * 2); ctx.moveTo(hx, hy - R); ctx.ellipse(hx, hy, R * 0.35, R, 0, 0, Math.PI * 2); ctx.stroke();   // head meridians
    ctx.fillStyle = c.alt; for (let i = 0; i < 4; i++) { const u = (t * 0.03 + i / 4) % 1; ctx.globalAlpha = 1 - u; ctx.fillRect(hx + back * (4 + i * 3), hy - R - u * 20, 2, 4); }
    ctx.restore();
  }
  else if (id === 'vanguard') {                                                                              // Vanguard: a centurion's galea with a transverse red crest
    ctx.save(); ctx.fillStyle = '#c8a050'; ctx.beginPath(); ctx.arc(hx, hy, R + 1.5, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8302a'; ctx.beginPath(); ctx.ellipse(hx, hy - R - 5, R * 1.2, 6, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#7a1a14'; ctx.lineWidth = 1; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(hx + i * R * 0.27, hy - R - 1); ctx.lineTo(hx + i * R * 0.27 * 1.1, hy - R - 9); ctx.stroke(); }
    ctx.fillStyle = '#c8a050'; ctx.fillRect(hx + face * R * 0.35, hy - R * 0.2, 3, R * 0.8);   // cheek guard
    ctx.restore();
  }
  else if (id === 'omega') {                                                                                 // Omega: a floating crown of light, a void-black faceplate and an Ω core
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c.alt; ctx.shadowColor = c.alt; ctx.shadowBlur = 14; ctx.lineWidth = 2;
    const bob = Math.sin(t * 0.06) * 1.5; ctx.beginPath(); for (let i = 0; i < 5; i++) { const x = hx + (i - 2) * R * 0.45; ctx.moveTo(x, hy - R - 4 + bob); ctx.lineTo(x, hy - R - 10 - (2 - Math.abs(i - 2)) * 4 + bob); } ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hx, hy - R - 4 + bob, R * 0.95, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.fillStyle = '#0a0614'; rr(hx - R * 0.8 + face * 2, hy - R * 0.4, R * 1.6, R * 0.6, 6); ctx.fill();
    ctx.fillStyle = c.alt; ctx.font = `900 12px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Ω', 0, ty);
    ctx.restore();
  }
  else if (id === 'blaze') {                                                                                 // flickering flame hair + ember belt
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 14;
    for (let i = -2; i <= 2; i++) {
      const x = hx + i * R * 0.38 + back * 2, h = (12 + (2 - Math.abs(i)) * 6) * (0.8 + 0.2 * Math.sin(t * 0.35 + i * 1.7)), sway = Math.sin(t * 0.2 + i) * 3 + back * 4;
      for (const [s, col] of [[1, '#ff5a1f'], [0.55, '#ffd23a']]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 5 * s, hy - R * 0.6); ctx.quadraticCurveTo(x - 4 * s, hy - R - h * s * 0.5, x + sway * s, hy - R - h * s);
        ctx.quadraticCurveTo(x + 4 * s, hy - R - h * s * 0.5, x + 5 * s, hy - R * 0.6); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(-tw / 2 + 2, ty + 5, tw - 4, 3); ctx.fillStyle = f.color; rr(-6, ty + 2, 12, 8, 2); ctx.fill();   // belt + buckle
  }
}

// Sol: a blazing sun-disc with slowly turning rays, behind the helm
function drawSunHalo(f, hx, hy, R, back, t) {
  const cx = hx + back * 2, cy = hy - 2;
  ctx.save(); ctx.shadowColor = f.color; ctx.shadowBlur = 18; ctx.fillStyle = rgba('#fff1b8', 0.95);
  ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + t * 0.015, r = (i % 2 ? R + 4 : R + 12) + (i % 4 === 0 ? 3 : 0); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R + 5); g.addColorStop(0, '#fff6d0'); g.addColorStop(1, f.color);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Valkyrie: great feathered wings that fold at rest, beat in the air and flare wide on the Battle Cry
function drawFeatherWings(f, ty, back, t) {
  const air = !f.onGround, cry = (f.state === 'special' && f.sp && (f.sp.type === 'warcry' || f.sp.wingDash)) || f.victory;
  const flap = air ? Math.sin(t * 0.35 + f.id) * 0.5 + 0.5 : 0.15 + Math.sin(t * 0.05) * 0.05, spread = cry ? 1 : 0.35 + flap * 0.55;
  ctx.save();
  for (const [side, depth] of [[back, 0], [-back, 1]]) {                                     // far wing first, near wing over the body
    if (depth === 1 && !cry && !air) continue;                                                  // folded at rest: only the far wing shows behind the back
    ctx.save(); ctx.translate(back * 4, ty - 8); ctx.scale(side, 1); ctx.rotate(-0.35 - spread * 0.9);
    ctx.globalAlpha *= depth ? 0.92 : 1;
    for (let k = 0; k < 7; k++) {                                                              // primaries: long feathers fanning out
      const a = k * 0.17 * (0.5 + spread), L = 22 + k * 4.2;
      ctx.save(); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, L, 0);
      if (f.ch.wings) { g.addColorStop(0, lighten(f.color, 0.35)); g.addColorStop(0.7, f.color); g.addColorStop(1, darken(f.color, 0.35)); }   // (Strix / Talon: earthy feathers)
      else { g.addColorStop(0, '#f4f6ff'); g.addColorStop(0.7, '#d9e4ff'); g.addColorStop(1, rgba(f.color, 0.9)); }
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(110,130,170,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(L / 2, 0, L / 2, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = f.ch.wings ? darken(f.color, 0.3) : '#ffd36e'; ctx.beginPath(); ctx.ellipse(6, -2, 9, 5, 0, 0, Math.PI * 2); ctx.fill();   // wing-bone
    ctx.restore();
  }
  ctx.restore();
}
// Valkyrie: a long winged spear — held upright at rest, thrust along the arm when attacking
function drawSpear(f, sh, hand, face, t) {
  let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  if (f.state !== 'attack' && !(f.state === 'special' && f.sp && f.sp.type === 'burst')) { const a = -Math.PI / 2 + face * (0.18 + Math.sin(t * 0.05) * 0.03); dx = Math.cos(a); dy = Math.sin(a); }
  const x0 = hand[0] - dx * 26, y0 = hand[1] - dy * 26, x1 = hand[0] + dx * 52, y1 = hand[1] + dy * 52, nx = -dy, ny = dx;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#6a5636'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();       // shaft
  ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(x1 - dx * 3, y1 - dy * 3); ctx.lineTo(x1 + dx * 2, y1 + dy * 2); ctx.stroke();
  ctx.fillStyle = '#f4f6ff'; ctx.strokeStyle = 'rgba(120,140,180,0.7)'; ctx.lineWidth = 0.8;                                 // little wings at the socket
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1 + nx * s * 12 - dx * 4, y1 + ny * s * 12 - dy * 4, x1 + nx * s * 4 - dx * 10, y1 + ny * s * 4 - dy * 10); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.globalCompositeOperation = 'lighter';                                    // glowing blade
  ctx.fillStyle = rgba(f.color, 0.85); ctx.beginPath(); ctx.moveTo(x1 + nx * 4.5, y1 + ny * 4.5); ctx.lineTo(x1 + dx * 22, y1 + dy * 22); ctx.lineTo(x1 - nx * 4.5, y1 - ny * 4.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + dx * 20, y1 + dy * 20); ctx.stroke();
  ctx.restore();
}
// Forge: a great smithing hammer — iron head on a banded haft; it glows white-hot while charged with molten metal
function drawHammer(f, sh, hand, face, t) {
  let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const swinging = f.state === 'attack' || (f.state === 'special' && f.sp && f.sp.type === 'temper');
  if (!swinging) { const a = Math.PI / 2 - face * (0.35 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }   // resting: hanging down at the side
  const hx = hand[0] + dx * 34, hy = hand[1] + dy * 34, nx = -dy, ny = dx, hot = f.heatN > 0;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(hand[0] - dx * 8, hand[1] - dy * 8); ctx.lineTo(hx, hy); ctx.stroke();    // haft
  ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 5; for (const u of [0.35, 0.7]) { ctx.beginPath(); ctx.moveTo(hand[0] + dx * 34 * u - dx, hand[1] + dy * 34 * u - dy); ctx.lineTo(hand[0] + dx * 34 * u + dx, hand[1] + dy * 34 * u + dy); ctx.stroke(); }
  const head = () => { ctx.beginPath(); ctx.moveTo(hx + nx * 15 - dx * 9, hy + ny * 15 - dy * 9); ctx.lineTo(hx + nx * 15 + dx * 9, hy + ny * 15 + dy * 9); ctx.lineTo(hx - nx * 15 + dx * 9, hy - ny * 15 + dy * 9); ctx.lineTo(hx - nx * 15 - dx * 9, hy - ny * 15 - dy * 9); ctx.closePath(); };
  if (SET.gfx !== 'neon' && !SHADE.lite) shadeBlob(head, hx, hy, 30, 30, hot ? '#ff9a3d' : '#5a5e6a', MATERIALS.metal, f);
  else { head(); ctx.fillStyle = hot ? '#ff9a3d' : '#5a5e6a'; ctx.fill(); }
  if (hot) {                                                                  // molten glow + dripping metal
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 22; head(); ctx.fillStyle = `rgba(255,190,90,${0.35 + 0.2 * Math.sin(t * 0.3)})`; ctx.fill();
    const d = (t * 0.05) % 1; ctx.globalAlpha = 1 - d; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(hx - nx * 6, hy - ny * 6 + d * 18, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
// Kuro: an iron-studded kanabo club — long tapering head covered in spikes
function drawClub(f, sh, hand, face, t) {
  let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  if (f.state !== 'attack' && !(f.state === 'special' && f.sp && f.sp.type === 'flurry')) { const a = -Math.PI / 2 - face * (0.25 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }   // resting on the shoulder
  const nx = -dy, ny = dx, x0 = hand[0] - dx * 6, y0 = hand[1] - dy * 6, x1 = hand[0] + dx * 58, y1 = hand[1] + dy * 58;
  ctx.save();
  const body = () => { ctx.beginPath(); ctx.moveTo(x0 + nx * 3, y0 + ny * 3); ctx.lineTo(x1 + nx * 9, y1 + ny * 9); ctx.quadraticCurveTo(x1 + dx * 8, y1 + dy * 8, x1 - nx * 9, y1 - ny * 9); ctx.lineTo(x0 - nx * 3, y0 - ny * 3); ctx.closePath(); };
  if (SET.gfx !== 'neon' && !SHADE.lite) shadeBlob(body, (x0 + x1) / 2, (y0 + y1) / 2, 64, 20, '#3a2a2a', MATERIALS.metal, f); else { body(); ctx.fillStyle = '#3a2a2a'; ctx.fill(); }
  ctx.fillStyle = '#d8d8e0'; for (let k = 0; k < 6; k++) { const u = 0.35 + k * 0.11, cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u, w = 3 + u * 6;   // studs
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + nx * s * w, cy + ny * s * w); ctx.lineTo(cx + nx * s * (w + 5) + dx * 1.5, cy + ny * s * (w + 5) + dy * 1.5); ctx.lineTo(cx + nx * s * w + dx * 3, cy + ny * s * w + dy * 3); ctx.closePath(); ctx.fill(); } }
  ctx.restore();
}
// Zealot: twin laser nunchucks — one held, the other whirling on its energy chain
function drawNunchucks(f, hand, face, t) {
  const spin = f.state === 'attack' || (f.state === 'special' && f.sp && f.sp.type === 'flurry'), a = spin ? t * 0.9 : Math.PI / 2 + Math.sin(t * 0.08) * 0.3;
  const hx = hand[0], hy = hand[1], cx = hx + Math.cos(a) * 16, cy = hy + Math.sin(a) * 16, ex = cx + Math.cos(a) * 18, ey = cy + Math.sin(a) * 18;
  ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 14;
  ctx.strokeStyle = rgba(f.ch.alt, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);   // energy chain
  for (const [w, c] of [[7, rgba(f.color, 0.4)], [3.5, f.color], [1.4, '#ffffff']]) { ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(hx - face * 2, hy - 14); ctx.lineTo(hx + face * 2, hy + 2); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); }
  if (spin) { ctx.strokeStyle = rgba(f.color, 0.35); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 34, a - 1.6, a); ctx.stroke(); }   // the whirl's smear
  ctx.restore();
}
// Titanis rooted: stone roots spreading from the feet into the floor
function drawRoots(f) {
  const t = G.time, k = Math.min(1, (f.ch.special.dur - f.rootT + 1) / 12);
  ctx.save(); ctx.strokeStyle = '#6a7a5a'; ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) { if (!i) continue; const len = (30 + Math.abs(i) * 10) * k; ctx.lineWidth = 6 - Math.abs(i);
    ctx.beginPath(); ctx.moveTo(f.x + i * 6, f.y - 4); ctx.quadraticCurveTo(f.x + i * 6 + sign(i) * len * 0.5, f.y + 4, f.x + i * 4 + sign(i) * len, f.y + 2 + Math.abs(i)); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(122,255,216,${0.25 + 0.15 * Math.sin(t * 0.1)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, 46 * k, 8 * k, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
// Sol: a round sun-shield on the back arm — burnished gold with a radiant sunburst boss
function drawSunShield(f, p, face) {
  const x = p[0] + face * 6, y = p[1] - 4, r = 17, t = G.time;
  const path = () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  if (SET.gfx !== 'neon') shadeBlob(path, x, y, r * 2, r * 2, f.hitFlash > 0 ? '#ffffff' : '#ffc94a', MATERIALS.metal, f);
  else { path(); ctx.fillStyle = rgba(f.color, 0.3); ctx.fill(); }
  ctx.save(); ctx.strokeStyle = '#a8641a'; ctx.lineWidth = 2; path(); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff1b8'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 10 + (f.state === 'shield' ? 10 : 0);
  ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + t * 0.02, rr2 = i % 2 ? 4.5 : 10; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---- held props + smear frames (drawn in the fighter's local space) ---- */
// Smear frames: during a strike, the striking hand / foot leaves a tapered, fading streak along the path it just swept
function drawSmear(f, rig, stiff, fa, fr, lw) {
  const m = f.move, on = stiff && f.state === 'attack' && m && f.stateT >= m.s - 1 && f.stateT < m.s + m.a + 2 && limbOf(m) !== 'car';
  const h = rig.smear || (rig.smear = []);
  if (!on) { h.length = 0; return; }
  const p = m.limb === 'kick' || m.limb === 'stomp' ? fr : fa;
  h.push([p[0], p[1]]); if (h.length > 6) h.shift();
  if (h.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 1; i < h.length; i++) {
    const k = i / (h.length - 1);
    ctx.strokeStyle = rgba(f.color, 0.1 + 0.4 * k); ctx.lineWidth = (lw + 2) * 2 * (0.35 + 0.65 * k);
    ctx.beginPath(); ctx.moveTo(h[i - 1][0], h[i - 1][1]); ctx.lineTo(h[i][0], h[i][1]); ctx.stroke();
  }
  ctx.restore();
}
// Aegis: an energy broadsword — held angled up at rest, swung along the arm when attacking
function drawSword(f, sh, hand, face, t) {
  let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  if (f.state !== 'attack') { const a = -Math.PI / 2 + face * (0.5 + Math.sin(t * 0.05) * 0.05); dx = Math.cos(a); dy = Math.sin(a); }
  const len = 64, x0 = hand[0] + dx * 6, y0 = hand[1] + dy * 6, x1 = hand[0] + dx * len, y1 = hand[1] + dy * len;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hand[0] - dy * 9, hand[1] + dx * 9); ctx.lineTo(hand[0] + dy * 9, hand[1] - dx * 9); ctx.stroke();   // crossguard
  ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 18;
  for (const [w, c] of [[12, rgba(f.color, 0.3)], [6.5, rgba(f.color, 0.85)], [2.2, '#ffffff']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  ctx.restore();
}
// Paladin: a giant kite shield on the back arm, gold-rimmed with a holy cross
function drawShield(f, p, face, mat) {
  if (f.ch.id === 'vanguard') {                                             // Vanguard: a curved red tower scutum with a gold boss and lightning-bolt blazon
    const x = p[0] + face * 6, y = p[1] + 2, w = 30, h = 58, path = () => rr(x - w / 2, y - h / 2, w, h, 6);
    if (SET.gfx !== 'neon' && !SHADE.lite) shadeBlob(path, x, y, w, h, f.hitFlash > 0 ? '#ffffff' : '#b8302a', MATERIALS.metal, f); else { path(); ctx.fillStyle = '#b8302a'; ctx.fill(); }
    ctx.save(); ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 2.5; path(); ctx.stroke();
    ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - h * 0.38); ctx.lineTo(x + 2, y - 10); ctx.lineTo(x - 3, y - 10); ctx.lineTo(x + 6, y - 2); ctx.moveTo(x - 6, y + h * 0.38); ctx.lineTo(x + 2, y + 10); ctx.lineTo(x - 3, y + 10); ctx.lineTo(x + 6, y + 2); ctx.stroke();
    ctx.restore(); return;
  }
  const x = p[0] + face * 6, y = p[1] - 4, w = 32, h = 44;
  const path = () => { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h * 0.1); ctx.quadraticCurveTo(x + w / 2, y + h * 0.38, x, y + h / 2); ctx.quadraticCurveTo(x - w / 2, y + h * 0.38, x - w / 2, y + h * 0.1); ctx.closePath(); };
  if (SET.gfx !== 'neon') shadeBlob(path, x, y, w, h, f.hitFlash > 0 ? '#ffffff' : '#d9dde8', MATERIALS.metal, f);
  else { path(); ctx.fillStyle = rgba(f.color, 0.25); ctx.fill(); ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.save(); ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 2.5; path(); ctx.stroke();
  ctx.fillStyle = '#ffd36e'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 8; ctx.fillRect(x - 2, y - h * 0.32, 4, h * 0.56); ctx.fillRect(x - 9, y - h * 0.14, 18, 4); ctx.restore();
}
// Orion: a light-bow in the front hand; the string pulls back to the other hand while drawing an arrow
function drawBow(f, hand, back, face) {
  const cx = hand[0] - face * 13, r = 24, a0 = face > 0 ? -1.05 : Math.PI - 1.05, a1 = face > 0 ? 1.05 : Math.PI + 1.05;
  const tip1 = [cx + Math.cos(a0) * r, hand[1] + Math.sin(a0) * r], tip2 = [cx + Math.cos(a1) * r, hand[1] + Math.sin(a1) * r];
  const drawing = f.state === 'special' && f.sp && f.sp.type === 'shoot' && f.stateT < f.sp.wind, nock = drawing ? back : [(tip1[0] + tip2[0]) / 2, hand[1]];
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
  ctx.strokeStyle = '#f2e6b8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, hand[1], r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tip1[0], tip1[1]); ctx.lineTo(nock[0], nock[1]); ctx.lineTo(tip2[0], tip2[1]); ctx.stroke();
  ctx.restore();
}

/* Dino Nuggi's mini F1 car (world space). Pops into existence during the wind-up, drives through the active frames
 * (spinning wheels, speed streaks), then vanishes in a puff. Built from shaded volumes: glossy body in the team
 * colour, rear + front wings, halo bar, chunky tyres with spinning rims, sponsor stripe and race number.            */
function drawCar(f) {
  const m = f.move, t = f.stateT, d = f.facing, end = m.s + m.a;
  const appear = clamp(t / Math.max(1, m.s - 2), 0, 1), gone = t > end ? clamp(1 - (t - end) / 8, 0, 1) : 1;
  const pop = appear < 1 ? 1 + 2.2 * Math.pow(appear - 1, 3) + 1.2 * Math.pow(appear - 1, 2) : 1, k = pop * gone;
  if (k <= 0.01) return;
  const driving = t >= m.s - 2 && t < end, wheelA = (G.time * (driving ? 0.9 : 0.15)) * d;
  ctx.save(); ctx.translate(f.x, f.y); ctx.scale(d * k, k); ctx.globalAlpha *= gone;
  if (driving) {                                                            // speed streaks behind the car
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const y = -8 - i * 7, len = 60 + hash(i + (G.time >> 1)) * 50; ctx.strokeStyle = rgba(f.color, 0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-62, y); ctx.lineTo(-62 - len, y); ctx.stroke(); }
    ctx.restore();
  }
  const alb = f.color, gloss = MATERIALS.gloss, sh = SET.gfx !== 'neon';
  const part = (path, cx, cy, w, h, col, mat) => { if (sh) shadeBlob(path, cx, cy, w, h, col, mat || gloss, f); else { path(); ctx.fillStyle = rgba(col, 0.35); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); } };
  // rear wing (struts + plate)
  ctx.fillStyle = '#1a1c26'; ctx.fillRect(-58, -40, 4, 26);
  part(() => rr(-70, -46, 24, 8, 2), -58, -42, 24, 8, alb);
  // main body: low sidepods, raised engine cover, long tapered nose
  const body = () => { ctx.beginPath(); ctx.moveTo(-60, -8); ctx.lineTo(-60, -22); ctx.quadraticCurveTo(-40, -34, -14, -30); ctx.lineTo(18, -24); ctx.quadraticCurveTo(52, -18, 74, -12); ctx.lineTo(76, -6); ctx.lineTo(-60, -6); ctx.closePath(); };
  part(body, 6, -18, 136, 30, alb);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-48, -16, 92, 3);                 // sponsor stripe
  ctx.font = `900 11px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#0a0a14'; ctx.strokeText('1', -30, -22); ctx.fillText('1', -30, -22);
  ctx.strokeStyle = '#20222c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, -30); ctx.quadraticCurveTo(-2, -48, 12, -30); ctx.stroke();   // halo bar over the cockpit
  // front wing
  part(() => rr(58, -9, 26, 6, 2), 71, -6, 26, 6, '#e8eaf2', MATERIALS.metal);
  // tyres with spinning rims
  for (const [wx, r] of [[-40, 14], [44, 12]]) {
    const g = ctx.createRadialGradient(wx - r * 0.3, -r - r * 0.3, 1, wx, -r, r); g.addColorStop(0, '#4a4d5a'); g.addColorStop(0.7, '#15161d'); g.addColorStop(1, '#050508');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(wx, -r, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(f.color, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx, -r, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let s = 0; s < 5; s++) { const a = wheelA + s * Math.PI * 0.4; ctx.moveTo(wx, -r); ctx.lineTo(wx + Math.cos(a) * r * 0.55, -r + Math.sin(a) * r * 0.55); } ctx.stroke();
  }
  ctx.restore();
}
// Rime's ice block: a translucent faceted cube around the frozen fighter, trembling just before it shatters
function drawIceBlock(f) {
  const j = f.frozenT < 8 ? rand(-1.5, 1.5) : 0, x = f.x - 30 + j, y = f.y - 76, w = 60, h = 80;
  ctx.save();
  if (f.inkTrap) {                                                          // Fable: a wobbling bubble of living ink instead of ice
    const t = G.time, g = ctx.createRadialGradient(f.x - 10, f.y - 50, 4, f.x, f.y - 36, 50);
    g.addColorStop(0, 'rgba(80,80,160,0.35)'); g.addColorStop(0.75, 'rgba(20,20,58,0.6)'); g.addColorStop(1, 'rgba(20,20,58,0.85)');
    ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = 46 + Math.sin(t * 0.3 + i * 1.7) * 3; ctx.lineTo(f.x + j + Math.cos(a) * r * 0.8, f.y - 36 + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#14143a'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(f.x - 14, f.y - 60, 7, 3.5, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(230,250,255,0.55)'); g.addColorStop(0.5, 'rgba(150,220,255,0.3)'); g.addColorStop(1, 'rgba(90,170,230,0.45)');
  ctx.fillStyle = g; rr(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(235,252,255,0.9)'; ctx.lineWidth = 2.5; ctx.shadowColor = '#bfeaff'; ctx.shadowBlur = 14; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 24, y + 4); ctx.moveTo(x + 6, y + 30); ctx.lineTo(x + 30, y + 52); ctx.lineTo(x + 44, y + 40); ctx.moveTo(x + w - 10, y + 12); ctx.lineTo(x + w - 4, y + h - 20); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x + 16, y + 14, 7, 3.5, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Dino Nuggi's checkered flag, waved on smash attacks
function drawFlag(x, y, ang, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke();   // pole
  const cols = 5, rows = 4, cw = 5, chh = 5;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const wave = Math.sin(t * 0.5 + i * 0.9) * 2.5;
    ctx.fillStyle = (i + j) % 2 ? '#0a0a14' : '#ffffff'; ctx.fillRect(i * cw, -40 + j * chh + wave, cw + 0.5, chh + 0.5);
  }
  ctx.restore();
}

function drawFighter(f) {
  if (f.state === 'dead') return;
  const c = f.ch, t = G.time, face = f.facing, back = -face;
  const hs = G.hitstop > 0 && f.state === 'hitstun' ? rand(-3, 3) : 0;
  if (f.state === 'attack' && f.move) drawAttackFx(f);
  if (SET.limbs === 'floating') {                                         // floating style: grabs throw out a flying fist (jointed arms reach via the pose)
    if (f.state === 'grab') { const hb = hitboxRect(f, { box: GRAB_BOX }); drawArm(f, hb.x + hb.w / 2, hb.y + hb.h / 2, f.stateT >= 6 ? 1 : f.stateT / 6); }
    if (f.state === 'holding' && f.grabbing) drawArm(f, f.grabbing.x, f.grabbing.y - 38, 1);
  }
  if (f.state === 'special' && f.sp) drawSpecialFx(f);
  if (c.corrupt && f.state !== 'respawn') {                                // Byte: the corruption field — a flickering ring of broken pixels
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 0.2);
    ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t * 0.8; ctx.beginPath(); ctx.arc(f.x, f.y - 32, c.corrupt, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 10; i++) { const a = hash(i + (t >> 2)) * TAU, r = c.corrupt * (0.6 + 0.4 * hash(i * 3 + (t >> 2))); ctx.fillStyle = i % 2 ? f.color : c.alt; ctx.fillRect(f.x + Math.cos(a) * r, f.y - 32 + Math.sin(a) * r, 4, 4); }
    ctx.restore();
  }
  if (f.state === 'special' && f.sp && f.sp.type === 'sink' && f.sp.phase === 'under') {   // Umbra, melded into the floor: a gliding pool of shadow with two eyes
    ctx.save(); ctx.translate(f.x, f.y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34); g.addColorStop(0, 'rgba(10,0,24,0.95)'); g.addColorStop(1, 'rgba(40,10,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 34 + Math.sin(t * 0.3) * 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(f.facing * 6 + s * 5, -3, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore(); return;
  }
  if (f.hoverOn > 0) {                                                     // Solaris hover glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(f.color, 0.35); ctx.shadowColor = f.color; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 6, 26 + Math.sin(t * 0.3) * 3, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  ctx.save();
  ctx.translate(f.x + hs, f.y);
  if (f.invuln > 0 && f.state !== 'ledge' && f.state !== 'climb' && ((G.time >> 2) & 1)) ctx.globalAlpha = 0.45;
  if (f.state === 'special' && f.sp && (f.sp.type === 'blink' || f.sp.type === 'tele')) ctx.globalAlpha = f.stateT <= f.sp.wind ? 1 - f.stateT / f.sp.wind * 0.8 : 0.3;
  if (f.state === 'special' && f.sp && f.sp.type === 'phase' && f.stateT > f.sp.wind && f.stateT <= f.sp.wind + f.sp.dur) ctx.globalAlpha = 0.28;   // Nyx phasing
  if (c.holo) ctx.globalAlpha *= hash((t >> 1) + f.id * 31) > 0.05 ? 0.9 : 0.4;   // Drift: a hologram that flickers now and then
  if (f.state === 'special' && f.sp && f.sp.type === 'sink' && f.sp.phase === 'down') { const k = f.stateT / c.special.wind; ctx.globalAlpha *= 1 - k * 0.8; ctx.translate(0, k * 30); ctx.scale(1 + k * 0.3, 1 - k * 0.6); }   // Umbra melting into the floor

  // ---- pose (poses.js): pick the named pose for whatever the fighter is doing ----
  const [P, poseName] = computePose(f); f.poseName = poseName;
  // Overlapping action (UbiArt-style): fists, feet, head, lean and squash chase their pose targets on damped springs,
  // so they lag, overshoot and wobble back instead of snapping. Spring time is measured in 60 Hz steps from the real
  // frame time, so the motion looks the same at 60, 120 or 144 FPS.
  const rig = f.rig || (f.rig = {});
  const now = performance.now(), dt = clamp((now - (rig.now || now - STEP)) / STEP, 0, 3); rig.now = now;
  const spring = (key, p, k, damp) => {
    let s = rig[key];
    if (!s || Math.abs(s.x - p[0]) > 70 || Math.abs(s.y - p[1]) > 70) s = rig[key] = { x: p[0], y: p[1], vx: 0, vy: 0 };
    const n = Math.ceil(dt), h = dt / n, d = Math.pow(damp, h);
    for (let i = 0; i < n; i++) { s.vx = s.vx * d + (p[0] - s.x) * k * h; s.vy = s.vy * d + (p[1] - s.y) * k * h; s.x += s.vx * h; s.y += s.vy * h; }
    return [s.x, s.y];
  };
  const stiff = P.stiff > 0;

  // ---- squash & stretch (anchored at the feet) ----
  let sx = f.sx, sy = f.sy, rot = f.rot, bob = 0;
  if (!f.onGround && f.state !== 'ledge' && f.state !== 'hitstun') { const s = clamp(f.vy * 0.012, -0.12, 0.15); sy *= 1 + s; sx *= 1 - s * 0.7; }
  if (f.onGround && f.state === 'free' && Math.abs(f.vx) < 0.6) {                          // idle: sub-pixel breathing + floating stance
    const b = Math.sin(t * 0.07 + f.id * 1.7); sy *= 1 + b * 0.025; sx *= 1 - b * 0.015;
    bob = -Math.abs(Math.sin(t * 0.035 + f.id)) * 1.6; ctx.translate(0, bob);
  }
  if (f.state === 'free' || f.state === 'attack') rot += clamp(f.vx * 0.012, -0.12, 0.12);   // drift with momentum
  const rolling = f.state === 'roll', crawling = f.crawl;
  if (rolling) rot += f.rollDir * (f.stateT / ROLL_T) * Math.PI * 2;                         // tucked forward roll
  const [lean] = spring('ln', [P.lean * 40, 0], stiff ? 0.45 : 0.25, 0.55);                // (scaled ×40 so the shared spring's reset distance fits)
  const [psx, psy] = spring('sc', [P.sx * 40, P.sy * 40], 0.35, 0.5);
  const [oy] = spring('oy', [P.oy, 0], 0.25, 0.55);
  rot += face * (lean / 40 + P.spin); sx *= psx / 40; sy *= psy / 40;
  if (oy) ctx.translate(0, oy);

  // ---- physics appendage (simulated in world space, drawn behind the body) ----
  const bw = c.bw;
  if (c.trail) {
    const s = TRAIL_SPEC[c.trail], [lx, ly] = s.anchor(bw, back), dy0 = ly + 32, cs = Math.cos(rot), sn = Math.sin(rot);
    const ax = f.x + hs + lx * cs - dy0 * sn, ay = f.y + bob - 32 + lx * sn + dy0 * cs;
    for (let k = 0; k < (s.count || 1); k++)                                // multi-chain appendages (Kitsune's three tails)
      drawTrail(f, stepTrail(f, ax, ay, s, k ? 'trail' + k : 'trail', s.lift ? s.lift[k] : 0), f.x + hs, f.y + bob);
  }
  if (f.state === 'hitstun') {                                             // extreme stretch along the launch vector
    const spd = Math.hypot(f.vx, f.vy);
    if (spd > 5) {
      const va = Math.atan2(f.vy, f.vx), k = Math.min(0.5, (spd - 5) * 0.03);
      ctx.translate(0, -32); ctx.rotate(va); ctx.scale(1 + k, 1 - k * 0.55); ctx.rotate(-va); ctx.translate(0, 32);
    }
  }
  ctx.translate(0, -32); ctx.rotate(rot); ctx.translate(0, 32); ctx.scale(sx, sy);

  // ---- limb targets from the pose (facing-relative → this frame): fl / fr = back / front foot, ba / fa = back / front fist ----
  const lw = c.limb;
  const hit = f.state === 'hitstun' || f.state === 'stunned';
  const col = f.hitFlash > 0 ? '#ffffff' : f.color;
  let fl = [face * P.bf[0], P.bf[1]], fr = [face * P.ff[0], P.ff[1]], ba = [face * P.ba[0], P.ba[1]], fa = [face * P.fa[0], P.fa[1]];

  // ---- body layout (per-archetype proportions): torso + floating head (lags slightly behind the torso when moving) ----
  const build = rigOf(c);
  const tw = bw * 0.84, th = crawling ? 22 : build.torsoH, ty = crawling ? -16 : -15 - th / 2 + Math.sin(t * 0.08 + f.id) * 0.6;
  const R = (bw * 0.36 + 3) * build.headK;
  let hx = face * (2 + P.hd[0]) - clamp(f.vx * 0.35, -4, 4), hy = ty - th / 2 - R - 3 + Math.sin(t * 0.08 + f.id + 0.6) * 1.2 + P.hd[1];
  if (crawling) { hx = face * (tw / 2 + R * 0.6); hy = ty - 4; }
  ba = spring('ba', ba, stiff ? 0.55 : 0.3, stiff ? 0.45 : 0.6); fa = spring('fa', fa, stiff ? 0.55 : 0.3, stiff ? 0.45 : 0.6);
  fl = spring('fl', fl, stiff ? 0.7 : 0.55, 0.45); fr = spring('fr', fr, stiff ? 0.7 : 0.55, 0.45);
  [hx, hy] = spring('hd', [hx, hy], 0.22, 0.68);
  if (c.glitchy && SET.gfx !== 'neon') {                                     // Cipher: the rig stutters — now and then it freezes in place for a few frames
    const hold = rig.stutter || (rig.stutter = { t: 0, pose: null });
    if (hold.t > 0) { hold.t--; ({ fa, ba, fl, fr } = hold.pose); hx = hold.pose.hx; hy = hold.pose.hy; }
    else if (hash((t >> 2) * 3.7 + f.id) > 0.93) hold.t = 3 + (hash(t) * 5 | 0), hold.pose = { fa, ba, fl, fr, hx, hy };
  }
  const armOut = attackArmExt(f) > 0.01;                                     // front fist is out as a flying fist (floating style only)
  // ---- skeleton: shoulders / hips on the torso, elbows / knees solved with two-bone IK ----
  const jointed = SET.limbs !== 'floating' && !crawling && !rolling, shaded = SET.gfx !== 'neon' && !c.wireframe;   // (Matrix is always a glowing wireframe)
  const shY = ty - th / 2 + 6, hipY = ty + th / 2 - 2, ankle = lw * 0.7 + 1.5;
  const shB = [back * tw * 0.42, shY], shF = [face * tw * 0.42, shY], hipB = [back * tw * 0.2, hipY], hipF = [face * tw * 0.2, hipY];
  const armL = (bw * 0.4 + 5) * build.armK, legL = build.legL;              // bone lengths (upper = lower)
  const elB = ik2(shB, ba, armL, armL, -face), elF = ik2(shF, fa, armL, armL, face);              // elbows bend down / outward
  const knB = ik2(hipB, [fl[0], fl[1] - ankle], legL, legL, -face), knF = ik2(hipF, [fr[0], fr[1] - ankle], legL, legL, -face);   // knees bend forward
  f.snap = { fa, ba, fl, fr, hx, hy, R, tw, th, ty, rot, sx, sy, lw,         // pose snapshot for motion-trail ghosts
             bones: jointed ? [[shB, elB, ba], [shF, elF, fa], [hipB, knB, [fl[0], fl[1] - ankle]], [hipF, knF, [fr[0], fr[1] - ankle]]] : null };
  const mat = matOf(f), alb = f.hitFlash > 0 ? '#ffffff' : albedoOf(f);
  const glove = f.hitFlash > 0 ? '#ffffff' : mat.bands ? lighten(alb, 0.25) : '#e9ecf6', shoe = f.hitFlash > 0 ? '#ffffff' : darken(alb, 0.25);
  // Kraken: arms become writhing tentacles (a wavy polyline from shoulder to hand)
  const tentacle = (p0, p1, ph) => {
    const pts = [], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 0; i <= 7; i++) { const u = i / 7, wv = Math.sin(u * Math.PI * 2 + t * 0.2 + ph) * 6 * Math.sin(u * Math.PI); pts.push([p0[0] + dx * u + nx * wv, p0[1] + dy * u + ny * wv]); }
    return pts;
  };
  // A limb: shaded tubes (3D) or neon outline + tinted core (Neon style)
  const limb = (p0, j, p1, w, arm, ph) => {
    if (arm && c.tentacles) {
      const pts = tentacle(p0, p1, ph);
      if (shaded) shadeCurve(pts, w * 1.2, w * 0.55, alb, mat, f);
      else { ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = w + 2; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.fillStyle = 'rgba(255,220,230,0.7)'; for (let i = 2; i < 7; i += 2) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] + 1, 1.4, 0, Math.PI * 2); ctx.fill(); } ctx.restore();   // suckers
      return;
    }
    if (shaded) { shadeTube(p0, j, w, alb, mat, f); shadeTube(j, p1, w * 0.92, alb, mat, f); if (!SHADE.lite) shadeSphere(j[0], j[1], w * 0.5, alb, mat, f); return; }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(j[0], j[1]); ctx.lineTo(p1[0], p1[1]);
    ctx.strokeStyle = col; ctx.lineWidth = w + 3; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#161936'; ctx.lineWidth = w; ctx.stroke();
    ctx.strokeStyle = f.hitFlash > 0 ? '#ffffff' : rgba(f.color, 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, w * 0.22); ctx.stroke();      // specular highlight down the limb
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(j[0], j[1], w * 0.32 + 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  ctx.shadowColor = f.color; ctx.shadowBlur = shaded ? 0 : 10;
  if (c.id === 'sylph') drawWings(f, ty, back, t);                           // fairy wings sit behind everything
  if (c.id === 'valkyrie' || c.wings) drawFeatherWings(f, ty, back, t);      // feathered wings (Valkyrie · Strix · Talon)
  if (c.id === 'sol') drawSunHalo(f, hx, hy, R, back, t);                    // Sol's sun-disc, behind the body and helm
  if (c.id === 'serpent') {                                                  // Venom's flared cobra hood, behind the head
    ctx.save(); const hood = () => { ctx.beginPath(); ctx.moveTo(hx - R * 0.9, hy + R * 0.9); ctx.quadraticCurveTo(hx - R * 2.1, hy - R * 0.2, hx, hy - R * 1.35); ctx.quadraticCurveTo(hx + R * 2.1, hy - R * 0.2, hx + R * 0.9, hy + R * 0.9); ctx.closePath(); };
    if (shaded && !SHADE.lite) shadeBlob(hood, hx, hy - R * 0.2, R * 4.2, R * 2.3, darken(alb, 0.2), mat, f); else { hood(); ctx.fillStyle = darken(f.color, 0.3); ctx.fill(); }
    ctx.strokeStyle = '#c6ff2e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx - R * 1.3, hy); ctx.quadraticCurveTo(hx, hy - R * 1.6, hx + R * 1.3, hy); ctx.stroke(); ctx.restore();
  }
  const foot = (p) => {
    const x = p[0] + face * 2, y = p[1] - (lw * 0.7 + 1.5), rx = lw + 3.5, ry = lw * 0.7 + 1.5;
    if (shaded) shadeBlob(() => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }, x, y, rx * 2, ry * 2, shoe, mat, f);
    else { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
    if (c.skate) {                                                          // Zephyr: neon roller-blade frame + glowing wheels
      ctx.save(); ctx.fillStyle = '#20242e'; ctx.fillRect(x - rx, y + ry - 1, rx * 2, 3);
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 8; ctx.fillStyle = f.color;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - rx + 3 + k * (rx - 3), y + ry + 3, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  };
  const fist = (p) => {
    const r = lw + 2;
    if (shaded) shadeSphere(p[0], p[1], r, glove, mat.bands ? mat : MATERIALS.plastic, f);
    else { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : '#f4f6ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke(); }
    if ((c.id === 'chimera' && !c.tentacles) || c.claws) drawClaws(p[0], p[1], face > 0 ? 0 : Math.PI, r, c.claws ? '#f4ead8' : col);   // (Fang's claws are bone-white)
  };
  if (jointed) {                                                              // back arm + back leg sit behind the torso
    limb(shB, elB, ba, lw * 1.15, true, 2); limb(hipB, knB, [fl[0], fl[1] - ankle], lw * 1.4);
  } else if (!crawling && !rolling) {                                         // floating style: faint glowing Bézier "tendons" to the floating fists & feet
    ctx.save(); ctx.globalAlpha *= 0.32; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.shadowBlur = 8;
    const link = (x0, y0, x1, y1, bend) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + bend, y0 + (y1 - y0) * 0.25, x1 - bend * 0.3, y1 - (y1 - y0) * 0.35, x1, y1); ctx.stroke(); };
    link(back * tw * 0.42, shY, ba[0], ba[1], back * 10);
    if (!armOut) link(face * tw * 0.42, shY, fa[0], fa[1], face * 10);
    link(-tw * 0.2, hipY, fl[0], fl[1] - 4, -5); link(tw * 0.2, hipY, fr[0], fr[1] - 4, 5);
    ctx.restore();
  }
  fist(ba); foot(fl);                                                         // back fist / back foot
  if (c.dualBlade) drawSword(f, shB, ba, face, t);                           // Omega's second blade, in the back hand
  // torso
  const tx0 = -tw / 2 + (crawling ? back * 4 : 0), tW = crawling ? tw * 1.25 : tw, tRad = Math.min(th, tw) * 0.45;
  if (shaded) shadeBlob(() => rr(tx0, ty - th / 2, tW, th, tRad), tx0 + tW / 2, ty, tW, th, alb, mat, f);
  else {
    ctx.save(); ctx.shadowBlur = 18; rr(tx0, ty - th / 2, tW, th, tRad);
    ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : f.fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  }
  if (jointed && (c.arch === 'heavy' || c.arch === 'brute' || c.arch === 'knight') && !c.wireframe) {   // tanks & knights: massive rounded shoulders / pauldrons
    const pr = lw * (c.arch === 'knight' ? 1.45 : 1.75) + 2;
    for (const s of [shB, shF]) { if (shaded) shadeSphere(s[0], s[1] - 2, pr, c.arch === 'knight' ? lighten(alb, 0.12) : alb, c.arch === 'knight' ? MATERIALS.metal : mat, f);
      else { ctx.save(); ctx.beginPath(); ctx.arc(s[0], s[1] - 2, pr, 0, Math.PI * 2); ctx.fillStyle = f.fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke(); ctx.restore(); } }
  }
  if (jointed) limb(hipF, knF, [fr[0], fr[1] - ankle], lw * 1.4);           // front leg
  foot(fr);
  if (c.id === 'void' || c.bigShield) drawShield(f, ba, face, mat);          // Paladin's giant shield / Vanguard's scutum, held on the back arm in front of the body
  if (c.id === 'sol') drawSunShield(f, ba, face);                            // Sol's sun-shield
  // head
  if (shaded) shadeSphere(hx, hy, R, alb, mat, f);
  else { ctx.save(); ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : f.fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); ctx.restore(); }
  drawAccents(f, hx, hy, R, ty, tw, th, face, back, t);
  drawFace(f, hx, hy, R, face, hit, t);
  if (jointed) limb(shF, elF, fa, lw * 1.15, true, 0);                       // front arm, in front of the body
  if (c.sword) drawSword(f, shF, fa, face, t);                               // Aegis's energy broadsword
  if (c.spear) drawSpear(f, shF, fa, face, t);                               // Valkyrie's winged spear
  if (c.hammer) drawHammer(f, shF, fa, face, t);                             // Forge's smithing hammer
  if (c.club) drawClub(f, shF, fa, face, t);                                 // Kuro's kanabo
  if (c.nunchucks) drawNunchucks(f, fa, face, t);                            // Zealot's laser nunchucks
  if (f.state === 'attack' && f.move && (f.move.morph || f.move.whip) && f.stateT >= f.move.s - 1 && f.stateT < f.move.s + f.move.a + 2) {
    const m = f.move, reachX = face * (Math.abs(m.box.ox + m.box.w) || 60), ex = reachX, ey = fa[1];
    ctx.save(); ctx.lineCap = 'round';
    if (m.whip || m.morph === 'whip') {                                       // Kryp's bone whip / Helix's whip-limb: a segmented lash out to the hitbox's far end
      ctx.strokeStyle = m.whip ? '#e8ffe0' : f.color; ctx.lineWidth = 3; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(fa[0], fa[1]);
      for (let i = 1; i <= 6; i++) { const u = i / 6; ctx.lineTo(fa[0] + (ex - fa[0]) * u, fa[1] + (ey - fa[1]) * u + Math.sin(u * Math.PI * 2 + t * 0.5) * 5 * (1 - u)); } ctx.stroke();
      if (m.whip) { ctx.fillStyle = '#e8ffe0'; for (let i = 1; i < 6; i++) { const u = i / 6; ctx.beginPath(); ctx.arc(fa[0] + (ex - fa[0]) * u, fa[1] + (ey - fa[1]) * u, 2.4, 0, Math.PI * 2); ctx.fill(); } }   // vertebrae
    } else if (m.morph === 'blade') {                                         // Helix: the arm becomes a bone blade
      ctx.fillStyle = lighten(f.color, 0.3); ctx.beginPath(); ctx.moveTo(fa[0], fa[1] - 5); ctx.lineTo(fa[0] + face * 34, fa[1]); ctx.lineTo(fa[0], fa[1] + 5); ctx.closePath(); ctx.fill();
    } else {                                                                  // ...or a swollen hammer-fist
      ctx.fillStyle = darken(f.color, 0.15); ctx.beginPath(); ctx.arc(fa[0] + face * 6, fa[1], lw + 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (c.id === 'luna') drawBow(f, fa, ba, face);                             // Orion's bow
  if (f.victory && f.victoryStyle === 'champagne' && f.state === 'free') {    // Dino Nuggi's winner's champagne, held up in the front hand
    ctx.save(); ctx.translate(fa[0], fa[1]); ctx.rotate(face * 0.35);
    ctx.fillStyle = '#1f5a2a'; ctx.strokeStyle = '#0a1a0c'; ctx.lineWidth = 1.5; rr(-5, -24, 10, 22, 4); ctx.fill(); ctx.stroke();   // bottle
    ctx.fillRect(-2.5, -32, 5, 9); ctx.fillStyle = '#ffd23a'; ctx.fillRect(-3, -32, 6, 6);                                           // neck + gold foil
    ctx.fillStyle = '#f4f0e0'; ctx.fillRect(-4, -18, 8, 7); ctx.restore();                                                           // label
  }
  if (!armOut) fist(fa);                                                      // front fist (floating style: launched as a flying fist during punches)
  drawSmear(f, rig, stiff, fa, fr, lw);                                       // smear frames on fast strikes

  if (f.chill > 0) {                                                       // chilled: icy outline
    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 0.3); ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 3; ctx.shadowColor = '#bfeaff'; ctx.shadowBlur = 12;
    ctx.translate(0, -6); capsulePath(bw + 8, BODY_H + 8); ctx.stroke(); ctx.restore();
  }
  if (f.buffT > 0) {                                                       // Valkyrie's Battle Cry: a golden aura while empowered
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.3 + 0.15 * Math.sin(t * 0.25)) * Math.min(1, f.buffT / 30);
    ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 16;
    ctx.translate(0, -6); capsulePath(bw + 14, BODY_H + 14); ctx.stroke(); ctx.restore();
  }
  if (f.poison > 0) {                                                      // poisoned: bubbling acid outline, stronger per stack
    ctx.save(); ctx.globalAlpha = 0.25 + 0.08 * f.poison + 0.15 * Math.sin(t * 0.25); ctx.strokeStyle = '#9dff2e'; ctx.lineWidth = 2 + f.poison * 0.5;
    ctx.shadowColor = '#9dff2e'; ctx.shadowBlur = 12; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 0.8;
    ctx.translate(0, -6); capsulePath(bw + 12, BODY_H + 12); ctx.stroke(); ctx.restore();
  }
  // Titan armor shimmer while a heavy attack is armored
  if (c.armor && f.state === 'attack' && f.move.heavy && f.stateT < f.move.s + f.move.a) {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.5); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
    ctx.translate(0, -4); capsulePath(bw + 10, BODY_H + 12); ctx.stroke();
  }
  ctx.restore();

  if (f.state === 'attack' && f.move && f.move.car) drawCar(f);             // Dino Nuggi's mini F1 car, around him in the cockpit
  if (f.rootT > 0) drawRoots(f);                                            // Titanis rooted into the floor
  if (f.frozenT > 0) drawIceBlock(f);                                       // Rime's ice block

  // shield bubble (shrinks as it weakens; white flash on parry)
  if (f.state === 'shield' || f.shieldHit > 0 || f.parryFlash > 0) {
    const R = f.parryFlash > 0 ? 50 : shieldR(f), frac = clamp(f.shield / 100, 0, 1);
    const scol = f.parryFlash > 0 ? '#ffffff' : frac > 0.35 ? f.color : '#ff5a5a';
    ctx.save();
    ctx.shadowColor = scol; ctx.shadowBlur = 20;
    ctx.globalAlpha = 0.22 + (f.shieldHit > 0 ? 0.3 : 0) + (f.parryFlash > 0 ? 0.35 : 0) + (frac < 0.35 ? 0.12 * Math.sin(G.time * 0.6) : 0);
    ctx.fillStyle = scol; ctx.beginPath(); ctx.arc(f.x, f.y - 32, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.strokeStyle = scol; ctx.stroke();
    if (f.state === 'shield' && f.stateT < PARRY_WIN) {                // parry window indicator
      ctx.globalAlpha = 0.9 * (1 - f.stateT / PARRY_WIN); ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(f.x, f.y - 32, R + 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  if (f.state === 'stunned') {
    for (let i = 0; i < 3; i++) {
      const a = G.time * 0.12 + i * 2.1;
      ctx.fillStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 24, f.y - 78 + Math.sin(a) * 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  if (f.invuln > 30 && f.state === 'free') {
    ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y - 32, 44, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

// Soft drop shadow on the surface below each fighter (shrinks and fades with height)
function drawShadows() {
  ctx.save();
  for (const f of fighters) {
    if (f.state === 'dead' || f.state === 'respawn') continue;
    const d = floorDist(f); if (d > 480) continue;
    const k = 1 - d / 480, R = (f.ch.bw * 0.8 + 10) * (0.45 + 0.55 * k);
    ctx.save(); ctx.translate(f.x, f.y + d + 1); ctx.scale(1, 0.24);           // radial-gradient contact shadow, squashed into an ellipse
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, `rgba(0,0,0,${0.6 * k})`); g.addColorStop(0.6, `rgba(0,0,0,${0.3 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// Mirage's decoys and Aegis's walls
function drawGadgets() {
  for (const f of fighters) {
    const d = f.decoy;
    if (d) {
      const ghostF = Object.assign({}, f, { x: d.x, y: d.y, facing: d.facing, state: 'free', move: null, sp: null, vx: 0, vy: 0, onGround: true,
        invuln: 0, hitFlash: 0, chill: 0, poison: 0, rot: 0, sx: 1, sy: 1, shieldHit: 0, parryFlash: 0, decoy: null, crawl: false, hoverOn: 0, jetT: 0, trail: d.trail || null, rig: d.rig || null });
      ctx.save(); ctx.globalAlpha = d.life < 60 && (G.time >> 2) & 1 ? 0.2 : 0.45 + 0.1 * Math.sin(G.time * 0.2);   // flickers before it expires
      drawFighter(ghostF); ctx.restore();
      d.trail = ghostF.trail; d.rig = ghostF.rig;                              // the decoy keeps its own scarf + spring simulation
    }
    const so = f.sonic;
    if (so) {                                                                  // Echo's soundwave: triple rippling rings
      const sp = so.S || f.ch.special, fade = so.life / sp.life;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = so.S ? '#ffffff' : f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 16;
      for (let i = 0; i < 3; i++) { const r = so.r - i * 16; if (r <= 4) continue; ctx.globalAlpha = fade * (1 - i * 0.3); ctx.lineWidth = 5 - i * 1.4; ctx.beginPath(); ctx.arc(so.x, so.y, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    const gw = f.gfield;
    if (gw) {                                                                  // Atlas's gravity well: a dark dome with chevrons dragging everything down
      const k = Math.min(1, gw.life / 30) * Math.min(1, (gw.max - gw.life + 1) / 10), t = G.time;
      ctx.save(); ctx.globalAlpha = k;
      const g = ctx.createRadialGradient(gw.x, gw.y, gw.r * 0.2, gw.x, gw.y, gw.r); g.addColorStop(0, 'rgba(20,10,60,0.35)'); g.addColorStop(0.85, rgba(f.color, 0.18)); g.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gw.x, gw.y, gw.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(f.color, 0.55); ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t; ctx.beginPath(); ctx.arc(gw.x, gw.y, gw.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rgba(f.ch.alt, 0.6); ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) { const x = gw.x + (i - 2) * gw.r * 0.35, y = gw.y - gw.r * 0.5 + ((t * 2 + i * 23) % (gw.r)); ctx.beginPath(); ctx.moveTo(x - 7, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + 7, y - 6); ctx.stroke(); }
      ctx.restore();
    }
    const pr = f.prism;
    if (pr) {                                                                  // Prism's crystal: a spinning faceted prism casting rainbow light
      const fade = Math.min(1, pr.life / 20), spin = G.time * 0.04, bob = Math.sin(G.time * 0.06) * 4, x = pr.x, y = pr.y + bob, R = 18;
      ctx.save(); ctx.globalAlpha = fade; ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(x, y, 2, x, y, 60 + pr.flash * 3); halo.addColorStop(0, rgba(f.color, 0.45)); halo.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 60 + pr.flash * 3, 0, Math.PI * 2); ctx.fill();
      const pts = [0, 1, 2].map(i => { const a = spin + i * TAU / 3 - Math.PI / 2; return [x + Math.cos(a) * R, y + Math.sin(a) * R * 1.25]; });
      ['rgba(255,120,160,0.55)', 'rgba(120,255,190,0.55)', 'rgba(120,160,255,0.55)'].forEach((col, i) => {     // three refracting faces
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[(i + 1) % 3][0], pts[(i + 1) % 3][1]); ctx.closePath(); ctx.fill();
      });
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = fade * 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 30, spin * 2, spin * 2 + 1.2); ctx.stroke();
      ctx.restore();
    }
    const cl = f.cloud;
    if (cl) {                                                                  // Tempest's thundercloud: a dark storm-cloud platform; lightning flickers inside before each strike
      const S = f.ch.special, fade = Math.min(1, cl.life / 20) * Math.min(1, cl.t / 8), cx = cl.x + cl.w / 2;
      const due = cl.t >= S.warn - 20 && ((cl.t - S.warn) % S.every + S.every) % S.every > S.every - 20;
      ctx.save(); ctx.globalAlpha = fade;
      for (let i = 0; i < 6; i++) {                                            // billowing puffs
        const px = cl.x + 12 + i * (cl.w - 24) / 5, py = cl.y - 6 - Math.sin(i * 1.7) * 8 + Math.sin(G.time * 0.05 + i) * 1.5, r = 16 + (i % 3) * 5;
        const g = ctx.createRadialGradient(px - 4, py - 6, 2, px, py, r); g.addColorStop(0, '#8a93b8'); g.addColorStop(1, '#2a2f4a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#20243a'; rr(cl.x, cl.y - 4, cl.w, 12, 6); ctx.fill();
      ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cl.x + 6, cl.y + 1); ctx.lineTo(cl.x + cl.w - 6, cl.y + 1); ctx.stroke();   // standable top edge
      if (due || cl.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,240,120,${cl.flash > 0 ? 0.5 : 0.25 * ((G.time >> 1) & 1)})`; ctx.beginPath(); ctx.ellipse(cx, cl.y - 8, cl.w * 0.45, 18, 0, 0, Math.PI * 2); ctx.fill(); }
      if (cl.flash > 0 && cl.boltBot) {                                        // the strike itself
        ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffe629'; ctx.shadowBlur = 24; ctx.lineJoin = 'round';
        for (const [w, a] of [[12, 0.25], [5, 0.7], [2, 1]]) { ctx.globalAlpha = fade * a * cl.flash / 12; ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = w; ctx.beginPath(); let x = cx; ctx.moveTo(x, cl.y + 8);
          for (let y = cl.y + 8; y < cl.boltBot; y += 30) { x = cx + (hash(y + cl.t) - 0.5) * 30; ctx.lineTo(x, y); } ctx.lineTo(cx, cl.boltBot); ctx.stroke(); }
      }
      ctx.restore();
    }
    const gu = f.gust;
    if (gu) {                                                                  // Aether's tornado: a funnel narrow at the ground, wide at the top, spinning
      const sp = f.ch.special, k = Math.min(1, gu.life / 10) * Math.min(1, (gu.max - gu.life + 1) / 5), t = G.time;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {                                           // stacked spinning rings, each swaying a little
        const u = i / 15, y = gu.y - u * sp.h, w = 10 + u * sp.w * 0.62, sway = Math.sin(t * 0.08 + u * 4) * 10 * u;
        ctx.strokeStyle = rgba(i % 3 ? f.color : '#ffffff', (0.25 + 0.4 * (1 - u)) * k); ctx.lineWidth = 2 + (1 - u) * 2;
        ctx.beginPath(); ctx.ellipse(gu.x + sway, y, w, 5 + u * 6, 0, t * 0.35 + i, t * 0.35 + i + 4.2); ctx.stroke();
      }
      ctx.globalAlpha = 0.6 * k; ctx.fillStyle = 'rgba(220,255,250,0.8)';
      for (let i = 0; i < 10; i++) { const u = ((t * 0.02 + i / 10) % 1), a = t * 0.3 + i * 2.1, w = 10 + u * sp.w * 0.62;   // debris whirling up the funnel
        ctx.beginPath(); ctx.arc(gu.x + Math.cos(a) * w, gu.y - u * sp.h + Math.sin(a) * 4, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (f.ch.special.type === 'rewind' && f.spCD <= 0 && f.hist.length > 30 && f.state !== 'dead' && f.state !== 'respawn') {   // Chrono: echo of the rewind target
      const p = f.hist[f.hist.length - 1 - Math.min(f.ch.special.back, f.hist.length - 1)];
      ctx.save(); ctx.globalAlpha = 0.18 + 0.06 * Math.sin(G.time * 0.15); ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.translate(p.x, p.y - 4); capsulePath(BODY_W, BODY_H); ctx.stroke(); ctx.restore();
    }
    const w = f.wall;
    if (w && w.pillar) {                                                       // Gaia's rock pillar: grinds up out of the floor, cracked stone with a mossy cap
      const r = wallRect(w), h = r.h * (w.rise || 0), x = w.x - 16, y = w.y - h, fade = Math.min(1, w.life / 20);
      ctx.save(); ctx.globalAlpha = fade;
      const path = () => { ctx.beginPath(); ctx.moveTo(x, w.y); ctx.lineTo(x + 2, y + 8); ctx.lineTo(x + 8, y); ctx.lineTo(x + 26, y + 2); ctx.lineTo(x + 32, y + 10); ctx.lineTo(x + 32, w.y); ctx.closePath(); };
      if (SET.gfx !== 'neon') shadeBlob(path, x + 16, y + h / 2, 32, Math.max(h, 1), w.flash > 0 ? '#c9b49a' : '#8a7660', MATERIALS.stone, f);
      else { path(); ctx.fillStyle = 'rgba(138,118,96,0.85)'; ctx.fill(); ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath();                 // cracks
      for (let k = 1; k < 4; k++) { const cy = y + h * k / 4; ctx.moveTo(x + 4, cy); ctx.lineTo(x + 14, cy - 6); ctx.lineTo(x + 22, cy + 3); } ctx.stroke();
      if (h > 20) { ctx.fillStyle = '#6fcf4a'; ctx.beginPath(); ctx.ellipse(x + 16, y + 3, 16, 4, 0, Math.PI, 0); ctx.fill(); }
      ctx.restore();
    } else if (w) {
      const r = wallRect(w), k = clamp(w.life / w.max, 0, 1), t = G.time;
      const fade = Math.min(1, w.life / 20) * Math.min(1, (w.max - w.life + 1) / 6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = f.color; ctx.shadowBlur = 24;
      const g = ctx.createLinearGradient(r.x - w.dir * 10, 0, r.x + r.w + w.dir * 10, 0);
      g.addColorStop(0, rgba(f.color, 0)); g.addColorStop(0.5, rgba(f.color, 0.35 + (w.flash > 0 ? 0.4 : 0))); g.addColorStop(1, rgba(f.color, 0));
      ctx.globalAlpha = fade; ctx.fillStyle = g; rr(r.x - 8, r.y, r.w + 16, r.h, 7); ctx.fill();
      ctx.strokeStyle = w.flash > 0 ? '#ffffff' : f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w.x + w.dir * 4, r.y); ctx.lineTo(w.x + w.dir * 4, r.y + r.h); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.globalAlpha = fade * (0.35 + 0.4 * k);                     // scrolling hex energy lines
      for (let y = r.y + ((t * 1.5) % 14); y < r.y + r.h; y += 14) { ctx.beginPath(); ctx.moveTo(r.x - 4, y); ctx.lineTo(r.x + r.w / 2, y - 5); ctx.lineTo(r.x + r.w + 4, y); ctx.stroke(); }
      ctx.restore();
    }
  }
}

// Aim reticle around the player's fighter: shows where attacks / specials will go
function drawAim(f) {
  if (!SET.aim || f.cpu || f.state === 'dead' || f.state === 'respawn') return;
  const [ax, ay] = humanAim(f), d = Math.hypot(ax, ay);
  if (d < 1) return;
  const a = Math.atan2(ay, ax), r = 58, dir = aimDir({ aimX: ax, aimY: ay });
  ctx.save(); ctx.translate(f.x, f.y - 32); ctx.rotate(a);
  ctx.globalAlpha = dir === 'n' ? 0.25 : 0.7; ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(r + 12, 0); ctx.lineTo(r - 4, -7); ctx.lineTo(r - 4, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawProjs() {
  for (const p of projs) {
    ctx.save();
    ctx.shadowColor = p.color; ctx.shadowBlur = 22;
    if (p.kind === 'flame') {                                                  // Blaze: a flickering tongue of fire left on the dash path
      const k = clamp(p.life / 12, 0, 1) * clamp(p.t / 4, 0, 1), fl = Math.sin(p.t * 0.7 + p.x) * 3;
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff6a1f'; ctx.globalAlpha = k;
      for (const [s, col] of [[1, '#ff5a1f'], [0.62, '#ffb03a'], [0.3, '#fff2b0']]) {
        const h = p.r * 2.2 * s * (0.85 + 0.15 * Math.sin(p.t * 0.9 + s * 5)), w = p.r * s;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.x - w, p.y + p.r * 0.6);
        ctx.quadraticCurveTo(p.x - w * 0.9, p.y - h * 0.4, p.x + fl * s, p.y - h); ctx.quadraticCurveTo(p.x + w * 0.9, p.y - h * 0.4, p.x + w, p.y + p.r * 0.6); ctx.closePath(); ctx.fill();
      }
    } else if (p.kind === 'wave') {                                            // Terra: jagged rock spikes erupting along the ground
      const base = p.y + p.r, fade = clamp(p.life / 10, 0, 1);
      ctx.globalAlpha = fade; ctx.fillStyle = p.color; ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const x = p.x - sign(p.vx) * k * 13, h = (26 - k * 7) * (0.8 + 0.2 * Math.sin(p.t * 0.6 + k));
        ctx.beginPath(); ctx.moveTo(x - 8, base); ctx.lineTo(x - 2, base - h); ctx.lineTo(x + 3, base - h * 0.6); ctx.lineTo(x + 8, base); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (p.kind === 'arrow') {                                           // Orion: a bolt of light, pointing along its arc, with a fading streak
      const a = Math.atan2(p.vy, p.vx); ctx.translate(p.x, p.y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(-46, 0, 10, 0); g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(1, rgba(p.color, 0.8));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-46, -2); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.lineTo(-46, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(2, -5); ctx.lineTo(4, 0); ctx.lineTo(2, 5); ctx.closePath(); ctx.fill();   // arrowhead
    } else if (p.kind === 'water') {                                           // Kraken: a pressurised blob with a foamy core and spray
      const a = Math.atan2(p.vy, p.vx); ctx.translate(p.x, p.y); ctx.rotate(a);
      const g = ctx.createRadialGradient(-4, -3, 1, 0, 0, p.r * 1.6); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#9ff4ff'); g.addColorStop(1, rgba('#2fb8ff', 0.2));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-6, 0, p.r * 1.8, p.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfffff'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-p.r * 2 - k * 7, Math.sin(p.t + k) * 5, 3 - k * 0.5, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'foxorb') {                                          // Vex: foxfire orb — real and fake look identical
      ctx.translate(p.x, p.y); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const fl = p.r * (0.9 + 0.3 * Math.sin(p.t * 0.7 + i * 2)), off = (i - 1) * 6;
        ctx.fillStyle = i === 1 ? 'rgba(255,255,255,0.85)' : rgba(p.color, 0.6); ctx.beginPath();
        ctx.moveTo(off - fl * 0.5, 6); ctx.quadraticCurveTo(off - fl * 0.55, -fl * 0.3, off, -fl * 1.1); ctx.quadraticCurveTo(off + fl * 0.55, -fl * 0.3, off + fl * 0.5, 6); ctx.closePath(); ctx.fill();
      }
    } else if (p.kind === 'star') {                                            // Nova: a ground marker while it waits, then a blazing falling star
      if (p.t < p.delay) {
        const k = p.t / p.delay; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.save(); ctx.translate(p.x, p.ty); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, p.r * (1.6 - 0.6 * k), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        ctx.globalAlpha = 0.15 * k; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.ty - 900, 4, 900);
      } else {
        ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
        const g = ctx.createLinearGradient(0, -160, 0, 0); g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(1, rgba(p.color, 0.8));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-p.r * 0.6, -160); ctx.lineTo(p.r * 0.6, -160); ctx.lineTo(p.r * 0.9, 0); ctx.lineTo(-p.r * 0.9, 0); ctx.closePath(); ctx.fill();
        ctx.rotate(p.t * 0.3); ctx.fillStyle = '#ffffff'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? p.r * 0.45 : p.r * 1.1, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
      }
    } else if (p.kind === 'tendril') {                                         // Nyx: a dark, writhing tendril that bursts up from the floor
      const up = p.t < p.delay ? 0 : clamp((p.t - p.delay) / 5, 0, 1) * clamp(p.life / 6, 0, 1), h = p.h * up, b = p.base0;
      if (p.t < p.delay) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#1a0010'; ctx.beginPath(); ctx.ellipse(p.x, b, 26 * p.t / p.delay, 5, 0, 0, Math.PI * 2); ctx.fill(); }
      else {
        ctx.shadowColor = p.color; ctx.shadowBlur = 18; const g = ctx.createLinearGradient(0, b - h, 0, b); g.addColorStop(0, rgba(p.color, 0.9)); g.addColorStop(0.3, '#2a0020'); g.addColorStop(1, '#0a0008');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p.x - 18, b);
        for (let k = 0; k <= 8; k++) { const u = k / 8, w = 18 * (1 - u * 0.9); ctx.lineTo(p.x - w + Math.sin(p.t * 0.4 + u * 5) * 9 * u, b - h * u); }
        for (let k = 8; k >= 0; k--) { const u = k / 8, w = 18 * (1 - u * 0.9); ctx.lineTo(p.x + w + Math.sin(p.t * 0.4 + u * 5) * 9 * u, b - h * u); }
        ctx.closePath(); ctx.fill();
      }
    } else if (p.kind === 'disk') {                                            // Pulse: a spinning vinyl sound-disk with a neon label and sound ripples
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = rgba(p.color, 0.5); ctx.lineWidth = 2;                                          // trailing sound ripples
      const bk = -sign(p.vx) || -1;
      for (let k = 1; k <= 2; k++) { ctx.globalAlpha = 0.6 / k; ctx.beginPath(); ctx.arc(bk * k * 12, 0, p.r + k * 5, bk < 0 ? Math.PI * 0.65 : -Math.PI * 0.35, bk < 0 ? Math.PI * 1.35 : Math.PI * 0.35); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.scale(1, 0.62); ctx.rotate(p.t * 0.45);
      const g = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, 1, 0, 0, p.r * 1.25);
      g.addColorStop(0, '#5a5e70'); g.addColorStop(0.55, '#16171f'); g.addColorStop(1, '#050508');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.8;           // grooves
      for (let k = 0.55; k < 1.2; k += 0.18) { ctx.beginPath(); ctx.arc(0, 0, p.r * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.42, 0, Math.PI * 2); ctx.fill();   // label
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6;   // specular glint sweeping round
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.95, -0.4 - p.t * 0.45, 0.4 - p.t * 0.45); ctx.stroke();
    } else if (p.kind === 'magma') {                                           // Magma: a molten glob — cooling crust over a white-hot core, dripping as it flies
      ctx.translate(p.x, p.y); ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 26;
      const g = ctx.createRadialGradient(-p.r * 0.25, -p.r * 0.3, 1, 0, 0, p.r * 1.2);
      g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffb03a'); g.addColorStop(0.75, '#ff4a1a'); g.addColorStop(1, '#5a1206');
      ctx.fillStyle = g; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = p.r * (1 + 0.12 * Math.sin(p.t * 0.5 + i * 2)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(40,14,8,0.75)';                                          // dark crust plates
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + p.t * 0.05; ctx.beginPath(); ctx.ellipse(Math.cos(a) * p.r * 0.55, Math.sin(a) * p.r * 0.55, p.r * 0.32, p.r * 0.2, a, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'acid') {                                            // Venom: a corrosive glob, dripping as it arcs
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, p.r * 1.4); g.addColorStop(0, '#f4ffc8'); g.addColorStop(0.45, '#c6ff2e'); g.addColorStop(1, rgba(p.color, 0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-2, 0, p.r * 1.35, p.r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(198,255,46,0.6)'; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(-p.r * 1.2 - k * 6, Math.sin(p.t * 0.4 + k) * 3, 3 - k * 0.6, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'slime') {                                           // Venom: a bubbling puddle of toxic slime
      const k = clamp(p.life / 20, 0, 1) * clamp(p.t / 6, 0, 1); ctx.globalAlpha = 0.85 * k; ctx.shadowColor = '#c6ff2e'; ctx.shadowBlur = 12;
      const g = ctx.createRadialGradient(p.x, p.y + 4, 2, p.x, p.y + 4, p.r * 1.4); g.addColorStop(0, '#e4ff7a'); g.addColorStop(0.6, '#8adf1a'); g.addColorStop(1, rgba(p.color, 0.3));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, p.r * 1.4, p.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(240,255,190,0.8)'; const b = (p.t * 0.05 + p.x * 0.01) % 1; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.x) * 6, p.y + 2 - b * 6, 2 * (1 - b) + 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'bolt') {                                            // Prism / Apex-X: a refracted bolt of light with a rainbow fringe
      const a = Math.atan2(p.vy, p.vx); ctx.translate(p.x, p.y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter';
      const cols = ['rgba(255,80,120,0.5)', 'rgba(80,255,160,0.5)', 'rgba(90,140,255,0.5)'];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-34, -2.5 + (i - 1) * 2.2, 40, 2.4); });
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = p.color; ctx.beginPath(); ctx.ellipse(2, 0, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'packet') {                                          // Byte: a tumbling cube of corrupted data
      ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.25); const s = p.r * 1.3;
      ctx.fillStyle = rgba(p.color, 0.85); ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.shadowBlur = 0; ctx.fillStyle = '#0a0a14'; ctx.fillRect(-s / 2 + 2, -s / 2 + 2, s / 3, s / 3); ctx.fillRect(s / 6, s / 6, s / 3 - 2, s / 3 - 2);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(46,240,255,0.6)'; ctx.fillRect(-s / 2 - 3 + (p.t % 3), -1, s + 6, 2);   // scanline glitch
    } else if (p.kind === 'shuriken') {                                        // Kage: a spinning four-point throwing star
      ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.6); ctx.shadowBlur = 10; ctx.fillStyle = '#d8dce8';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.5 : p.r + 2, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'shard') {                                           // Rime: a jagged shard of glowing ice
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.shadowColor = '#bfeaff';
      const g = ctx.createLinearGradient(-14, 0, 12, 0); g.addColorStop(0, 'rgba(160,220,255,0.2)'); g.addColorStop(1, '#f4fdff');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -6); ctx.lineTo(-14, -2); ctx.lineTo(-10, 0); ctx.lineTo(-14, 3); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke();
    } else if (p.kind === 'frost') {                                           // Rime: a frost trap — a glittering rune of ice on the floor
      const k = Math.min(1, p.life / 30) * Math.min(1, p.t / 8); ctx.globalAlpha = k; ctx.shadowColor = '#bfeaff'; ctx.shadowBlur = 12;
      ctx.translate(p.x, p.y + 4); ctx.scale(1, 0.32); ctx.strokeStyle = '#d6fbff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, p.r * 1.6, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + p.t * 0.02; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * p.r * 1.5, Math.sin(a) * p.r * 1.5); ctx.stroke(); }
      ctx.fillStyle = 'rgba(214,251,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, p.r * 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'feather') {                                         // Strix: a razor feather-dart
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.shadowBlur = 8;
      ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(0, -5, -12, -2); ctx.lineTo(-14, 0); ctx.lineTo(-12, 2); ctx.quadraticCurveTo(0, 5, 10, 0); ctx.fill();
      ctx.strokeStyle = '#6a5040'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-14, 0); ctx.stroke();
      ctx.fillStyle = p.color; ctx.fillRect(-16, -1.5, 4, 3);
    } else if (p.kind === 'flask') {                                           // Nox: a spinning glass flask of green plague
      ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.3); ctx.shadowColor = '#c6ff2e';
      ctx.fillStyle = 'rgba(200,255,120,0.8)'; ctx.beginPath(); ctx.arc(0, 2, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(220,240,255,0.5)'; ctx.fillRect(-3, -p.r - 6, 6, 8); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-3.5, -p.r - 9, 7, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-3, -2, 2.5, 4, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'mist') {                                            // Nox: a roiling cloud of plague mist
      const k = Math.min(1, p.life / 40) * Math.min(1, p.t / 12); ctx.shadowBlur = 0;
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + p.t * 0.01, d = p.r * 0.45, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.5, r = p.r * (0.5 + 0.12 * Math.sin(p.t * 0.05 + i));
        const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, `rgba(170,230,60,${0.32 * k})`); g.addColorStop(1, 'rgba(90,140,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = `rgba(230,255,170,${0.5 * k})`; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('☠', p.x, p.y + 6 + Math.sin(p.t * 0.08) * 4);
    } else if (p.kind === 'ink') {                                             // Fable: a wobbling blob of living ink with a little face
      ctx.translate(p.x, p.y); ctx.shadowColor = '#2a2a70'; ctx.fillStyle = '#14143a';
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = p.r * (1 + 0.15 * Math.sin(p.t * 0.6 + i * 2)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 4 + sign(p.vx) * 2, -2, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(20,20,58,0.6)'; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(-sign(p.vx) * (p.r + k * 6), Math.sin(p.t + k) * 3, 3 - k * 0.7, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'boulder') {                                         // Goliath: a tumbling boulder of broken concrete and rock
      ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.12 * (sign(p.vx) || 1)); ctx.shadowBlur = 0;
      const g = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.4, 2, 0, 0, p.r * 1.1); g.addColorStop(0, '#d8d8cc'); g.addColorStop(0.6, '#8a8a80'); g.addColorStop(1, '#3a3a34');
      ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = p.r * (0.85 + 0.2 * hash(i * 3.7)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,30,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-p.r * 0.4, -p.r * 0.2); ctx.lineTo(p.r * 0.1, p.r * 0.1); ctx.lineTo(p.r * 0.2, p.r * 0.5); ctx.stroke();
    } else if (p.kind === 'missile') {                                         // Mecha: little rocket with a flickering flame
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#ffb84d'; ctx.shadowColor = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-17 - Math.random() * 8, 0); ctx.lineTo(-9, 3); ctx.fill();
      ctx.shadowColor = p.color; ctx.fillStyle = '#e8edf5'; rr(-10, -4, 18, 8, 3); ctx.fill();
      ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(13, 0); ctx.lineTo(8, 4); ctx.fill(); ctx.fillRect(-10, -7, 5, 14);
    } else {                                                                   // Vortex: a volumetric energy orb — layered glow, a lit core and a swirling band
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.35, 1, p.x, p.y, p.r * 1.8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, rgba(p.color, 0.95)); g.addColorStop(0.7, rgba(p.color, 0.35)); g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.4, p.t * 0.2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFx() {
  for (const p of fx) {
    const t = clamp(p.life / p.max, 0, 1);
    ctx.save();
    switch (p.type) {
      case 'dot':
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t + 0.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'spark':
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t; ctx.strokeStyle = p.color; ctx.lineWidth = p.w * t + 0.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len); ctx.stroke(); break;
      case 'ring':
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t; ctx.strokeStyle = p.color; ctx.lineWidth = p.w * t + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); break;
      case 'star': {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t; ctx.strokeStyle = p.color; ctx.lineWidth = 3 * t + 1; ctx.lineCap = 'round';
        const len = p.size * (1.2 - t * 0.4);
        for (let i = 0; i < 8; i++) {
          const a = p.rot * 6 + i * Math.PI / 4, r0 = len * 0.2, r1 = len * (i % 2 ? 0.55 : 1);
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0); ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); ctx.stroke();
        }
        break;
      }
      case 'ghost': {
        const s = p.snap;
        ctx.translate(p.x, p.y); ctx.translate(0, -32); ctx.rotate(s ? s.rot : p.rot); ctx.translate(0, 32);
        if (!s) { capsulePath(BODY_W, BODY_H); ctx.globalAlpha = t * 0.35; ctx.fillStyle = p.color; ctx.fill(); break; }
        ctx.scale(s.sx, s.sy); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t * 0.4; ctx.fillStyle = p.color;   // pose silhouette
        const dot = (q, r) => { ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill(); };
        rr(-s.tw / 2, s.ty - s.th / 2, s.tw, s.th, Math.min(s.th, s.tw) * 0.45); ctx.fill();
        dot([s.hx, s.hy], s.R); dot(s.fa, s.lw + 2); dot(s.ba, s.lw + 2); dot([s.fl[0], s.fl[1] - s.lw * 0.7], s.lw + 2); dot([s.fr[0], s.fr[1] - s.lw * 0.7], s.lw + 2);
        if (s.bones) {                                                         // jointed limbs
          ctx.strokeStyle = p.color; ctx.lineWidth = s.lw * 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const [a, j, b] of s.bones) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(j[0], j[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        }
        break;
      }
      case 'wave':
        ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.globalAlpha = t * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = 5 * t + 1; ctx.beginPath(); ctx.ellipse(p.r * 0.3, 0, p.r * 0.45, p.r, 0, 0, Math.PI * 2); ctx.stroke(); break;
      case 'bolt':
        ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.globalAlpha = t; ctx.strokeStyle = p.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.beginPath();
        p.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); break;
      case 'cloud':
        ctx.globalAlpha = t * 0.5; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - t) * 1.7), 0, Math.PI * 2); ctx.fill(); break;
      case 'speed':
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.dx * p.len, p.y - p.dy * p.len); ctx.stroke(); break;
      case 'shard':
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = clamp(t * 1.6, 0, 1); ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.3, -p.size * 0.6); ctx.closePath(); ctx.fill(); break;
      case 'text':
        ctx.globalAlpha = clamp(t * 2, 0, 1); ctx.shadowColor = p.color; ctx.shadowBlur = 14;
        txt(p.text, p.x, p.y, 26, p.color, 'center', 900, FONT_NUM); break;
      case 'ink': {                                                       // Ronin: brush-stroke ink blot (pale rim so it reads on dark stages)
        const s = p.size * (1 + (1 - t) * 0.8);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.stretch, 1); ctx.globalAlpha = clamp(t * 1.4, 0, 1);
        ctx.fillStyle = 'rgba(236,236,244,0.55)'; ctx.beginPath(); ctx.arc(0, 0, s + 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); break;
      }
      case 'beam': {                                                      // Paladin's counter: a pillar of holy light
        ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(p.x - 40, 0, p.x + 40, 0);
        g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(0.5, rgba(p.color, 0.8 * t)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.fillRect(p.x - 40, p.y - 420, 80, 440); break;
      }
      case 'pixel':                                                       // Glitch: square digital debris
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t; ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); break;
    }
    ctx.restore();
  }
}

function drawOffscreenMarkers() {
  const c = G.cam;
  for (const f of fighters) {
    if (f.state === 'dead' || f.state === 'respawn') continue;
    const sx = (f.x - c.x) * c.z + W / 2, sy = (f.y - 32 - c.y) * c.z + H / 2, m = 34;
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H - 130) continue;
    const px = clamp(sx, m, W - m), py = clamp(sy, m, H - 150), a = Math.atan2(sy - py, sx - px);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -14); ctx.lineTo(-10, 14); ctx.closePath(); ctx.fill();
    ctx.restore();
    txt(f.name, px, py - 22, 14, f.color, 'center', 800);
  }
}
