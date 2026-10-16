/* NEON BRAWL — Pseudo-3D shading for the fighter rig ("official render" look).
 *
 * Everything is lit by one key light from the upper left (KEY), with a cool rim light from behind on the
 * opposite edge. Each body part is drawn as a shaded volume built from canvas gradients:
 *   1. albedo fill   — a radial gradient: lit highlight → base colour → core shadow (gives roundness)
 *   2. occlusion     — a soft darkening toward the bottom of each part (ambient occlusion where parts meet)
 *   3. material      — surface detail: brushed metal bands, glossy clear-coat streaks, cloth weave, stone speckle,
 *                      ice facets, digital scanlines, shadow smoke, silk sheen, emissive glow
 *   4. rim light     — an inner edge highlight on the side away from the key light
 *   5. specular      — a sharp highlight (size + strength per material), added with 'lighter'
 *   6. outline       — a bold ink contour (cel-shaded look) + a faint coloured glow so fighters pop against the stage
 * SHADE.cel adds a hard-edged toon shadow band (the "terminator") to every volume and limb.
 * Limbs are tubes: a gradient across the limb's width (dark edge → lit edge → base → dark edge).
 * SHADE.lite (set while drawing the 29 small menu previews) skips the costly layers.                        */
'use strict';

const KEY = { x: -0.55, y: -0.83 };                                   // key-light direction (unit vector, upper left)
// lite: cheap mode for tiny previews · ink: width of the bold cel-shaded ink outline · cel: hard-edged toon shadow band
const SHADE = { lite: false, ink: 2.6, cel: true };
const MATERIALS = {
  plastic:  { spec: 0.55, specR: 0.30, rim: 0.55, shade: 0.6 },
  metal:    { spec: 0.95, specR: 0.20, rim: 0.75, shade: 0.75, bands: true },
  gloss:    { spec: 1.0,  specR: 0.17, rim: 0.65, shade: 0.6, streak: true },
  cloth:    { spec: 0.10, specR: 0.55, rim: 0.35, shade: 0.5, weave: true },
  energy:   { spec: 0.65, specR: 0.30, rim: 0.95, shade: 0.35, glow: 18 },
  shadow:   { spec: 0.15, specR: 0.45, rim: 0.95, shade: 0.8, smoke: true },
  stone:    { spec: 0.08, specR: 0.55, rim: 0.3, shade: 0.65, speckle: true },
  ice:      { spec: 1.0,  specR: 0.18, rim: 0.95, shade: 0.35, facets: true },
  slime:    { spec: 0.95, specR: 0.15, rim: 0.6, shade: 0.45, streak: true },
  fire:     { spec: 0.45, specR: 0.30, rim: 0.95, shade: 0.35, glow: 22 },
  digital:  { spec: 0.40, specR: 0.30, rim: 0.75, shade: 0.5, scan: true },
  spectral: { spec: 0.55, specR: 0.35, rim: 1.0, shade: 0.3, glow: 14, alpha: 0.85 },
  silk:     { spec: 0.60, specR: 0.40, rim: 0.6, shade: 0.45, sheen: true },
  fur:      { spec: 0.06, specR: 0.60, rim: 0.7, shade: 0.55 },
  brass:    { spec: 0.85, specR: 0.24, rim: 0.6, shade: 0.65, bands: true }
};
const matOf = f => f.skinFx === 'gold' ? MATERIALS.metal : f.skinFx === 'void' ? MATERIALS.gloss : (MATERIALS[f.ch.mat] || MATERIALS.plastic);   // skins carry their own material

// Base (albedo) colour of the body: the skin colour, or a near-black version of it for dark costumes (Shadow skin, Ronin, Kage)
function albedoOf(f) {
  const dark = f.skinFx === 'void' || (f.ch.fill && f.skin === 0 && /^rgba\(\s*1\d,/.test(f.ch.fill));
  return dark ? mixHex(f.color, '#0c0c18', 0.78) : f.color;
}
const lighten = (c, k) => mixHex(c, '#ffffff', k), darken = (c, k) => mixHex(c, '#07081a', k);

// Shaded volume for any closed path (torso, head, feet). (cx, cy, w, h) = the part's bounding box centre + size.
function shadeBlob(path, cx, cy, w, h, alb, mat, f) {
  const R = Math.max(w, h) * 0.75, lx = cx + KEY.x * w * 0.32, ly = cy + KEY.y * h * 0.32;
  ctx.save();
  if (mat.alpha) ctx.globalAlpha *= mat.alpha;
  if (mat.glow && !SHADE.lite) { ctx.shadowColor = f.color; ctx.shadowBlur = mat.glow; }
  const g = ctx.createRadialGradient(lx, ly, R * 0.05, cx, cy, R);                 // 1. albedo: highlight → base → (hard cel edge) → core shadow
  g.addColorStop(0, lighten(alb, 0.55)); g.addColorStop(0.42, alb);
  if (SHADE.cel) { g.addColorStop(0.64, alb); g.addColorStop(0.66, darken(alb, mat.shade * 0.6)); }   // the toon shadow terminator
  g.addColorStop(1, darken(alb, mat.shade));
  path(); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
  if (SHADE.lite) { ctx.lineWidth = 1.5; ctx.strokeStyle = darken(alb, 0.8); ctx.stroke(); ctx.restore(); return; }
  ctx.save(); path(); ctx.clip();
  const ao = ctx.createLinearGradient(0, cy - h * 0.05, 0, cy + h * 0.55);           // 2. ambient occlusion toward the bottom
  ao.addColorStop(0, 'rgba(4,4,16,0)'); ao.addColorStop(1, `rgba(4,4,16,${0.42 * mat.shade})`);
  ctx.fillStyle = ao; ctx.fillRect(cx - w, cy - h, w * 2, h * 2);
  materialDetail(cx, cy, w, h, alb, mat, f);                                         // 3. material
  const rg = ctx.createLinearGradient(cx + KEY.x * w * 0.5, cy + KEY.y * h * 0.5, cx - KEY.x * w * 0.6, cy - KEY.y * h * 0.6);   // 4. rim light
  rg.addColorStop(0, 'rgba(160,220,255,0)'); rg.addColorStop(0.62, 'rgba(160,220,255,0)'); rg.addColorStop(1, `rgba(190,235,255,${0.85 * mat.rim})`);
  path(); ctx.strokeStyle = rg; ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.18); ctx.globalCompositeOperation = 'lighter'; ctx.stroke();
  ctx.restore();
  specular(cx + KEY.x * w * 0.24, cy + KEY.y * h * 0.27, Math.min(w, h) * mat.specR, mat);   // 5. specular
  if (mat.streak) {                                                                  //    clear-coat streak (gloss / slime)
    ctx.save(); path(); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx + KEY.x * w * 0.12, cy + KEY.y * h * 0.15); ctx.rotate(-0.7);
    const sg = ctx.createLinearGradient(0, -h * 0.08, 0, h * 0.08); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-w * 0.6, -h * 0.08, w * 1.2, h * 0.16); ctx.restore();
  }
  path(); ctx.lineWidth = SHADE.ink; ctx.lineJoin = 'round'; ctx.strokeStyle = darken(alb, 0.92); ctx.stroke();   // 6. bold ink contour (cel look)
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.35; ctx.lineWidth = 1; ctx.strokeStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 8; ctx.stroke();
  ctx.restore();
}

function specular(x, y, r, mat) {
  if (r < 0.5 || mat.spec < 0.05) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${0.9 * mat.spec})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Surface detail inside an already-clipped part
function materialDetail(cx, cy, w, h, alb, mat, f) {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  if (mat.bands) {                                                                   // brushed metal: soft diagonal reflection bands
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const b = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
    for (const [s, a] of [[0, 0], [0.18, 0.28], [0.3, 0], [0.55, 0], [0.66, 0.18], [0.78, 0], [1, 0]]) b.addColorStop(s, `rgba(235,245,255,${a})`);
    ctx.fillStyle = b; ctx.fillRect(x0, y0, w, h); ctx.restore();
  }
  if (mat.weave) {                                                                   // matte cloth: a faint diagonal weave
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = -h; k < w; k += 4) { ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + k + h, y0 + h); } ctx.stroke(); ctx.restore();
  }
  if (mat.speckle) {                                                                 // stone: darker and lighter flecks
    ctx.save(); for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(x0 + hash(i * 3.1 + f.id) * w, y0 + hash(i * 7.7 + 2) * h, 1 + hash(i) * 1.6, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
  }
  if (mat.facets) {                                                                  // ice: crisp facet lines
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(230,250,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.2, y0); ctx.lineTo(x0 + w * 0.55, y0 + h * 0.5); ctx.lineTo(x0 + w * 0.35, y0 + h);
    ctx.moveTo(x0 + w * 0.55, y0 + h * 0.5); ctx.lineTo(x0 + w, y0 + h * 0.35); ctx.stroke(); ctx.restore();
  }
  if (mat.scan) {                                                                    // digital: scanlines scrolling down
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.2)'; const off = G.time % 4; for (let y = y0 + off; y < y0 + h; y += 4) ctx.fillRect(x0, y, w, 1.5); ctx.restore();
  }
  if (mat.sheen) {                                                                   // silk: a moving soft sheen band
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const u = (G.time * 0.01 + f.id * 0.3) % 1.6 - 0.3;
    const s = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h); s.addColorStop(clamp(u - 0.15, 0, 1), 'rgba(255,255,255,0)'); s.addColorStop(clamp(u, 0, 1), 'rgba(255,255,255,0.22)'); s.addColorStop(clamp(u + 0.15, 0, 1), 'rgba(255,255,255,0)');
    ctx.fillStyle = s; ctx.fillRect(x0, y0, w, h); ctx.restore();
  }
  if (mat.smoke) {                                                                   // shadow: a churning dark core
    ctx.save(); const r = Math.max(w, h) * 0.6, sx = cx + Math.sin(G.time * 0.05 + f.id) * w * 0.15, sy = cy + h * 0.15;
    const s = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); s.addColorStop(0, 'rgba(10,0,20,0.55)'); s.addColorStop(1, 'rgba(10,0,20,0)');
    ctx.fillStyle = s; ctx.fillRect(x0, y0, w, h); ctx.restore();
  }
  if (mat.glow) {                                                                    // energy / fire: an inner emissive core
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const r = Math.min(w, h) * 0.55, p = 0.5 + 0.5 * Math.sin(G.time * 0.12 + f.id);
    const s = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); s.addColorStop(0, `rgba(255,255,255,${0.25 + 0.15 * p})`); s.addColorStop(0.5, rgba(f.color, 0.25)); s.addColorStop(1, rgba(f.color, 0));
    ctx.fillStyle = s; ctx.fillRect(x0, y0, w, h); ctx.restore();
  }
}

// A shaded sphere (head, fists, joints)
function shadeSphere(x, y, r, alb, mat, f) {
  shadeBlob(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, x, y, r * 2, r * 2, alb, mat, f);
}

// A shaded tube between two points (one limb segment): lit across its width so it reads as a cylinder
function shadeTube(p0, p1, w, alb, mat, f) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const lit = nx * KEY.x + ny * KEY.y > 0 ? 1 : -1;                                   // which side of the tube faces the light
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
  const g = ctx.createLinearGradient(mx + nx * w / 2 * lit, my + ny * w / 2 * lit, mx - nx * w / 2 * lit, my - ny * w / 2 * lit);
  g.addColorStop(0, darken(alb, 0.35)); g.addColorStop(0.22, lighten(alb, 0.5)); g.addColorStop(0.5, alb);
  if (SHADE.cel) { g.addColorStop(0.62, alb); g.addColorStop(0.64, darken(alb, mat.shade * 0.65)); }   // toon terminator along the limb
  g.addColorStop(0.85, darken(alb, mat.shade)); g.addColorStop(1, 'rgba(190,235,255,0.9)');
  ctx.save(); ctx.lineCap = 'round';
  if (mat.alpha) ctx.globalAlpha *= mat.alpha;
  ctx.strokeStyle = darken(alb, 0.92); ctx.lineWidth = w + SHADE.ink * 1.6; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();   // bold ink contour
  if (mat.glow && !SHADE.lite) { ctx.shadowColor = f.color; ctx.shadowBlur = mat.glow * 0.6; }
  ctx.strokeStyle = SHADE.lite ? alb : g; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}

// A tapering shaded tube along a polyline (Kraken's tentacles, stretchy limbs)
function shadeCurve(pts, w0, w1, alb, mat, f) {
  for (let i = 1; i < pts.length; i++) shadeTube(pts[i - 1], pts[i], lerp(w0, w1, i / (pts.length - 1)), alb, mat, f);
}
