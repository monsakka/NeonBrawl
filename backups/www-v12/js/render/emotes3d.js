/* NEON BRAWL — Taunts, holographic emojis and 3D nameplates (WebGL renderer; presentation only).
 *
 *   Emotes   every fighter's taunt (game/emotes.js picks the kind) is a procedural, stylised animation built on the
 *            shared rig — dance · weapon spin · backflip · power flex · formal bow · levitation · moonwalk · battle
 *            roar — paced and sized by the fighter's own motion profile (cadence, bounce, arm reach), with a 3D yaw
 *            (pirouettes, twirls) and its own 3D set dressing: a disco spotlight and rising notes, a glowing arc,
 *            flip rings, flex sparkles, falling petals, orbiting orbs, a floating top hat, roar shock rings.
 *   Emojis   glowing holographic 3D emojis that pop out over a fighter's head — a laughing face with flying tears, a
 *            flickering flame, a chattering skull, sweat drops, a beating heart (a parametric heart surface), star
 *            eyes, a jewelled crown, a GG trophy — each on a projector beam, with a scanline sweeping through it.
 *   Plates   sharp floating 3D nameplates over every fighter in a match: a smoked-glass slab with a 3D border (8
 *            designs, unlockable through the Battle Pass) and crisp lettering — a canvas atlas uploaded with
 *            trilinear mipmaps and drawn as a depth-tested billboard (glSprite in gl3d.js).                       */
'use strict';

/* ============================== emote poses ============================== */
function emotePose(f, A) {
  const T = f.stateT, D = f.emoteDur || 80, u = clamp(T / D, 0, 1), M = MOTION[f.ch.id] || { b: 4, a: 10, c: 1, l: 0.2, s: 12 };
  const bt = T * (0.19 + 0.05 * M.c), bounce = 3 + M.b * 0.45;
  switch (f.emoteK) {
    case 'dance': { const s = Math.sin(bt), c = Math.cos(bt), up = Math.max(0, s), dn = Math.max(0, -s);
      return pose({ fa: [A * 0.9 + c * 4, -38 - up * 44], ba: [-A * 0.9 - c * 4, -38 - dn * 44], ff: [10 + s * 6, -up * 6], bf: [-10 + s * 6, -dn * 6],
                    lean: Math.sin(bt * 0.5) * 0.14, oy: -Math.abs(s) * bounce, hd: [s * 3, Math.abs(c) * 2] }); }
    case 'weaponSpin': { const a = T * 0.42, fin = smooth(clamp((u - 0.82) / 0.18, 0, 1));
      const spin = [Math.cos(a) * A * 1.15, -66 + Math.sin(a) * A * 0.9], aim = [A * 1.7, -42];
      return pose({ fa: [lerp(spin[0], aim[0], fin), lerp(spin[1], aim[1], fin)], ba: [-A * 0.45, -24], ff: [12, 0], bf: [-12, 0], lean: -0.05 + fin * 0.2, hd: [1 + fin * 2, -2] }); }
    case 'backflip': {
      if (u < 0.18) { const k = smooth(u / 0.18); return pose({ fa: [-A * 0.6, -18], ba: [-A * 0.9, -20], ff: [10, 0], bf: [-10, 0], sy: 1 - k * 0.18, sx: 1 + k * 0.1, oy: k * 6, hd: [0, 4] }); }
      if (u < 0.82) { const v = (u - 0.18) / 0.64; return pose({ fa: [8, -32], ba: [-12, -30], ff: [6, -24], bf: [-6, -22], sy: 0.9, oy: -Math.sin(Math.PI * v) * (66 + M.b * 2), spin: -TAU * smooth(v) }); }
      const k = (u - 0.82) / 0.18; return pose({ fa: [A + 8, -76 + k * 10], ba: [-A - 8, -76 + k * 10], ff: [12, 0], bf: [-12, 0], sy: 0.84 + k * 0.16, sx: 1.1 - k * 0.1, hd: [0, -2] }); }
    case 'flex': { const p = Math.sin(T * 0.35) * 2;
      if (u < 0.42) return pose({ fa: [A + 6, -58 + p], ba: [-A - 6, -58 - p], ff: [13, 0], bf: [-13, 0], sx: 1.08 + Math.abs(p) * 0.012, hd: [0, -2] });
      if (u < 0.76) return pose({ fa: [A * 0.4, -30 + p], ba: [-A * 0.4, -30 - p], ff: [14, 0], bf: [-14, 0], sx: 1.14, sy: 0.92, lean: 0.15, hd: [2, 4] });
      return pose({ fa: [A * 0.3, -96], ba: [-A * 0.6, -24], ff: [12, 0], bf: [-12, 0], sy: 1.04, hd: [1, -3] }); }
    case 'bow': { const k = smooth(clamp((u - 0.2) / 0.25, 0, 1)) * (1 - smooth(clamp((u - 0.78) / 0.2, 0, 1)));
      return pose({ fa: [A * 0.35, -42 + k * 10], ba: [A * 0.3, -40 + k * 10], ff: [8, 0], bf: [-8, 0], lean: 0.62 * k, hd: [3 * k, 3 * k] }); }
    case 'levitate': { const h = smooth(Math.min(1, u * 3)) * (1 - smooth(clamp((u - 0.86) / 0.14, 0, 1))), w = Math.sin(T * 0.1) * 4;
      return pose({ fa: [A + 12, -40 + w], ba: [-A - 12, -40 - w], ff: [7, -12], bf: [-7, -11], oy: -h * 30, sy: 0.95, hd: [0, -2] }); }
    case 'moonwalk': { const ph = T * 0.2, sl = (ph % Math.PI) / Math.PI, alt = Math.floor(ph / Math.PI) % 2;
      if (u > 0.84) return pose({ fa: [A * 0.2, -92], ba: [-A * 0.5, -30], ff: [4, -8], bf: [-4, -8], sy: 1.05, lean: -0.05, hd: [1, -3] });   // up on the toes, hand to the hat
      const a = 10 - sl * 18, b2 = -8 + sl * 4;
      return pose({ fa: [A * 0.6, -30 + Math.sin(ph) * 3], ba: [-A * 0.8, -26], ff: alt ? [a, -Math.sin(sl * Math.PI) * 4] : [b2, 0], bf: alt ? [b2, 0] : [a, -Math.sin(sl * Math.PI) * 4], lean: -0.12, hd: [-2, 0] }); }
    case 'roar': { const j = u > 0.25 && u < 0.85 ? (hash(T * 1.7 + f.id) - 0.5) * 3 : 0, k = smooth(clamp((u - 0.2) / 0.1, 0, 1));
      return pose({ fa: [lerp(A * 0.3, A + 16, k) + j, lerp(-20, -56, k)], ba: [lerp(-A * 0.3, -A - 16, k) - j, lerp(-20, -56, k)], ff: [15, 0], bf: [-15, 0],
                    sy: lerp(0.86, 1.04, k), lean: lerp(0.25, -0.2, k), hd: [lerp(3, -4, k) + j * 0.5, lerp(5, -8, k)] }); }
  }
  return pose({});
}
// the 3D yaw an emote adds (pirouettes, twirls, a slow levitating turn)
function emoteYaw(f) {
  const u = clamp(f.stateT / (f.emoteDur || 80), 0, 1), face = f.facing;
  switch (f.emoteK) {
    case 'dance': return u > 0.78 ? face * TAU * smooth((u - 0.78) / 0.22) : 0;
    case 'weaponSpin': return u > 0.35 && u < 0.65 ? face * TAU * smooth((u - 0.35) / 0.3) : 0;
    case 'levitate': return face * TAU * smooth(u);
    case 'moonwalk': return u > 0.84 ? face * TAU * smooth((u - 0.84) / 0.16) : 0;
  }
  return 0;
}

/* ============================== emote set dressing ============================== */
function emoteFX3D(f) {
  const T = f.stateT, u = clamp(T / (f.emoteDur || 80), 0, 1), x = f.x, y = f.y, c = col3(f.color), alt = col3(f.ch.alt || f.color), sc = f.scale || 1, k = Math.min(1, T / 8) * (1 - smooth(clamp((u - 0.88) / 0.12, 0, 1)));
  switch (f.emoteK) {
    case 'dance':                                                       // a disco spotlight, a mirror ball, notes rising on the beat
      bG('cone', x, y - 260, 0, 70, 262, 70, [1, 1, 1], 0.08 * k, 0, Math.PI);
      bG('disc', x, y + 0.5, 0, 52, 0.5, 34, c, 0.45 * k);
      bL('sph', x, y - 250, 0, 12, 12, 12, [0.85, 0.88, 1], 0.2, T * 0.05); for (let i = 0; i < 6; i++) { const a = T * 0.05 + i; bG('box', x + Math.cos(a) * 10, y - 250 + Math.sin(a * 1.3) * 10, Math.sin(a) * 10, 2.4, 2.4, 2.4, i % 2 ? c : alt, 1.2 * k); }
      for (let i = 0; i < 3; i++) { const q = ((T * 0.012 + i / 3) % 1), nx = x + (i - 1) * 34 + Math.sin(q * 6 + i) * 8, ny = y - 70 - q * 90;
        bL('sph', nx, ny, 12, 4, 3.2, 3, i % 2 ? c : alt, 0.6); sL('tube', nx + 3.6, ny, 12, nx + 3.6, ny - 14, 12, 0.8, i % 2 ? c : alt, 0.6); bG('sph', nx, ny, 12, 8, 8, 8, c, 0.4 * (1 - q) * k); }
      break;
    case 'weaponSpin': {                                                // the arc the weapon carves overhead
      const r = (f.ch.bw / 2 + 7) * sc * 1.15 + 34; ringG(x, y - 66 * sc, 0, r, 6, c, 0.7 * k * (u < 0.82 ? 1 : 0.3), 0.15, T * 0.42);
      if (u > 0.82) for (let i = 0; i < 5; i++) bG('star4', x + f.facing * (80 + i * 6) * sc, y - 42 * sc + (hash(i + T) - 0.5) * 16, 0, 4, 4, 2, [1, 1, 1], 0.9 * k);
      break; }
    case 'backflip': if (u > 0.3 && u < 0.75) ringG(x, y - 32 - Math.sin(Math.PI * (u - 0.18) / 0.64) * 66, 0, 34 + (u - 0.3) * 60, 3, c, 0.8 * (0.75 - u) * 2.2, 0, 0);
      if (u > 0.82 && u < 0.95) ringG(x, y, 0, 20 + (u - 0.82) * 300, 3, [1, 1, 1], (0.95 - u) * 6, 1.35);
      break;
    case 'flex': for (let i = 0; i < 4; i++) { const a = T * 0.09 + i * TAU / 4, r = 46 + Math.sin(T * 0.2 + i) * 6; bG('star4', x + Math.cos(a) * r, y - 52 + Math.sin(a) * r * 0.5, Math.sin(a) * 14, 5, 5, 2.5, i % 2 ? [1, 1, 0.8] : c, 1.1 * k, 0, T * 0.1); } break;
    case 'bow': for (let i = 0; i < 8; i++) { const q = ((T * 0.01 + i / 8) % 1), px = x + (hash(i * 7.1) - 0.5) * 160 + Math.sin(q * 8 + i) * 12, py = y - 170 + q * 170;
      bA('sph', px, py, (hash(i * 3.3) - 0.5) * 60, 4, 2.2, 1.2, [1, 0.72, 0.85], 0.85 * k, q * 6, q * 9); } break;
    case 'levitate': for (let i = 0; i < 3; i++) { const a = T * 0.07 + i * TAU / 3, oy = -Math.min(1, u * 3) * 30;
      bF('sph', x + Math.cos(a) * 44, y - 40 + oy + Math.sin(a * 2) * 6, Math.sin(a) * 44, 5, 5, 5, mix3(c, [1, 1, 1], 0.5), 1); bG('sph', x + Math.cos(a) * 44, y - 40 + oy + Math.sin(a * 2) * 6, Math.sin(a) * 44, 11, 11, 11, c, 0.8 * k); }
      bG('disc', x, y + 0.5, 0, 48, 0.5, 32, c, 0.5 * k); break;
    case 'moonwalk': {                                                  // a floating top hat + sparkles at the sliding feet
      const hy = y - (BODY_H + 10) * sc, tilt = u > 0.84 ? -0.35 : Math.sin(T * 0.2) * 0.05;
      bL('cyl', x, hy, 0, 15, 2.5, 15, [0.08, 0.08, 0.12], 0, 0, tilt); bL('cyl', x - Math.sin(tilt) * 9, hy - 11, 0, 10, 20, 10, [0.08, 0.08, 0.12], 0, 0, tilt); bL('cyl', x - Math.sin(tilt) * 3, hy - 3.5, 0, 10.5, 3, 10.5, c, 0.4, 0, tilt);
      if ((T >> 2) % 2) bG('star4', x + (hash(T) - 0.5) * 30, y - 2, 6, 3.5, 3.5, 2, [1, 1, 1], 1); break; }
    case 'roar': if (u > 0.25 && u < 0.85) for (let i = 0; i < 3; i++) { const q = ((T * 0.04 + i / 3) % 1); ringG(x + f.facing * (24 + q * 80), y - 58, 0, 12 + q * 40, 3, c, 0.9 * (1 - q) * k, 0, 0); } break;
  }
}

/* ============================== holographic emojis ============================== */
// a parametric heart: every point of a sphere is pushed out to the classic heart curve (16 sin³t, 13 cos t − 5 cos 2t − …)
function heartGeo() {
  const g = GEO.sphere(40, 28);
  for (let i = 0; i < g.pos.length; i += 3) { const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2], r = Math.hypot(x, y), a = Math.atan2(x, y);
    const hx = 16 * Math.pow(Math.sin(a), 3) / 17, hy = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
    g.pos[i] = hx * r; g.pos[i + 1] = hy * r + 0.1; g.pos[i + 2] = z * 0.55; }
  return geoNormals(g);
}
const EMOJI_COL = { laugh: [1, 0.82, 0.2], fire: [1, 0.5, 0.12], skull: [0.92, 0.94, 1], sweat: [0.4, 0.85, 1], heart: [1, 0.25, 0.42], stareyes: [1, 0.82, 0.2], crown: [1, 0.8, 0.25], trophy: [1, 0.78, 0.22] };
// draw emoji `id` centred on game point (x, y) at depth z, size S, animation age (frames)
function emoji3D(id, x, y, z, S, age) {
  const DK = [0.12, 0.06, 0.04], col = EMOJI_COL[id] || [1, 1, 1];
  switch (id) {
    case 'laugh': case 'stareyes': {
      const sh = id === 'laugh' ? Math.sin(age * 0.9) * S * 0.06 : 0; x += sh;
      bL('sph', x, y, z, S, S, S * 0.9, col, 0.3);
      if (id === 'laugh') { for (const s of [-1, 1]) for (const d of [-1, 1]) bF('box', x + s * S * 0.36 + d * S * 0.08, y - S * 0.2, z + S * 0.82, S * 0.2, S * 0.07, 1, DK, 0, 0, -d * 0.6);   // ^^ eyes
        bF('sph', x, y + S * 0.32, z + S * 0.62, S * 0.5, S * 0.3, S * 0.3, [0.35, 0.08, 0.1], 0); bF('sph', x, y + S * 0.45, z + S * 0.7, S * 0.25, S * 0.12, S * 0.12, [1, 0.45, 0.55], 0);
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const q = ((age * 0.04 + k / 3) % 1); bL('sph', x + s * (S * 0.75 + q * S * 1.2), y - S * 0.15 + q * q * S * 1.4, z + S * 0.4, S * 0.16 * (1 - q * 0.4), S * 0.2 * (1 - q * 0.4), S * 0.14, [0.45, 0.85, 1], 0.5); } }
      else { for (const s of [-1, 1]) bL('star', x + s * S * 0.36, y - S * 0.18, z + S * 0.8, S * 0.3, S * 0.3, S * 0.15, [1, 0.95, 0.4], 0.8, 0, age * 0.08 * s);
        bF('sph', x, y + S * 0.38, z + S * 0.66, S * 0.42, S * 0.16, S * 0.2, [0.35, 0.08, 0.1], 0); }
      break; }
    case 'fire': for (const [k, cc] of [[1, [1, 0.35, 0.08]], [0.68, [1, 0.72, 0.15]], [0.36, [1, 0.97, 0.8]]]) { const fl = 1 + Math.sin(age * 0.5 + k * 7) * 0.12, zz = z + (1 - k) * S * 1.1;   // nested tongues, each in front of the last
        sF('cone', x, y + S * 0.7, zz, x + Math.sin(age * 0.3 + k) * S * 0.12, y + S * 0.7 - S * 2 * k * fl, zz, S * 0.75 * k, cc, 1); }
      for (const s of [-1, 1]) { const fl = 1 + Math.sin(age * 0.6 + s * 2) * 0.15; sF('cone', x + s * S * 0.45, y + S * 0.7, z + S * 0.2, x + s * S * 0.85, y + S * 0.7 - S * 1.15 * fl, z + S * 0.2, S * 0.38, [1, 0.5, 0.1], 1); }
      for (let i = 0; i < 4; i++) { const q = ((age * 0.03 + i / 4) % 1); bG('sph', x + Math.sin(i * 2.3 + q * 5) * S * 0.6, y - q * S * 2.2, z, 2.4, 2.4, 2.4, [1, 0.6, 0.2], 1 - q); }
      break;
    case 'skull': { const ch = Math.abs(Math.sin(age * 0.45)) * S * 0.12;
      bL('sph', x, y - S * 0.12, z, S, S * 0.92, S * 0.9, col, 0.15);
      bL('rbox', x, y + S * 0.62 + ch, z + S * 0.1, S * 1.05, S * 0.42, S * 0.78, col, 0.15);
      for (const s of [-1, 1]) { bF('sph', x + s * S * 0.36, y - S * 0.06, z + S * 0.72, S * 0.27, S * 0.32, S * 0.15, [0.03, 0.02, 0.05], 0); bG('sph', x + s * S * 0.36, y - S * 0.06, z + S * 0.82, S * 0.09, S * 0.09, S * 0.09, [1, 0.2, 0.3], 1.2); }
      bF('octa', x, y + S * 0.32, z + S * 0.85, S * 0.1, S * 0.14, S * 0.06, [0.03, 0.02, 0.05], 0);
      for (let k = -1; k <= 1; k++) bF('box', x + k * S * 0.24, y + S * 0.62 + ch, z + S * 0.5, S * 0.05, S * 0.32, 1, [0.25, 0.25, 0.3], 0);
      break; }
    case 'sweat': for (const [ox, oy, s2, ph] of [[-0.35, -0.1, 1, 0], [0.42, 0.35, 0.7, 2]]) { const q = ((age * 0.025 + ph / 6) % 1), dy = q * S * 0.9, a = 1 - Math.max(0, q - 0.75) * 4;
        const cx = x + ox * S, cy = y + oy * S + dy, r = S * 0.45 * s2;
        bA('sph', cx, cy, z, r, r, r * 0.9, col, 0.85 * a); sA('cone', cx, cy - r * 0.55, z, cx, cy - r * 1.9, z, r * 0.62, col, 0.85 * a);
        bF('sph', cx - r * 0.35, cy - r * 0.35, z + r * 0.7, r * 0.18, r * 0.25, r * 0.1, [1, 1, 1], 1); }
      break;
    case 'heart': { const beat = 1 + Math.pow(Math.max(0, Math.sin(age * 0.18)), 8) * 0.18, it = glItem(sgMesh('emoji:heart', heartGeo)), s2 = S * 1.15 * beat;
      xf(it.m, x, -y, z, s2, s2, s2, Math.sin(age * 0.05) * 0.4); it.col = col; it.spec = 1; it.shin = 90; it.emis = 0.35; it.outline = 1.4; it.shadow = false; it.rimK = 1; it.rimCol = [1, 0.7, 0.8];
      break; }
    case 'crown': { const a = age * 0.04; bL('torus', x, y + S * 0.4, z, S * 0.9, S * 1.3, S * 0.9, col, 0.3, a);
      for (let i = 0; i < 5; i++) { const b = a + i / 5 * TAU, px = x + Math.cos(b) * S * 0.85, pz = z + Math.sin(b) * S * 0.85;
        sL('cone', px, y + S * 0.35, pz, px, y - S * 0.75, pz, S * 0.24, col, 0.3); bG('sph', px, y - S * 0.8, pz, S * 0.16, S * 0.16, S * 0.16, i % 2 ? [0.3, 0.6, 1] : [1, 0.25, 0.35], 1.3); }
      break; }
    case 'trophy': { const a = Math.sin(age * 0.05) * 0.4;
      bL('sph', x, y - S * 0.25, z, S * 0.78, S * 0.7, S * 0.78, col, 0.25, a); bL('torus', x, y - S * 0.62, z, S * 0.78, S * 0.5, S * 0.78, col, 0.25, a);
      sL('cyl', x, y + S * 0.4, z, x, y + S * 0.85, z, S * 0.14, col, 0.2); bL('box', x, y + S * 0.95, z, S * 0.9, S * 0.2, S * 0.6, [0.25, 0.18, 0.12], 0, a);
      for (const s of [-1, 1]) bL('torus', x + s * S * 0.8, y - S * 0.3, z, S * 0.3, S * 0.3, S * 0.3, col, 0.25, 0, 0, Math.PI / 2);
      bG('star4', x, y - S * 0.25, z + S * 0.8, S * 0.25, S * 0.25, S * 0.12, [1, 1, 1], 1.2, 0, age * 0.1);
      break; }
  }
  // the hologram: a halo, a projector beam back toward the fighter, a scanline sweeping through
  bG('sph', x, y, z, S * 1.7, S * 1.7, S * 1.7, col, 0.22);
  const sy = y - S * 1.1 + ((age * 1.6) % (S * 2.4)); bG('box', x, sy, z + S, S * 2.2, 1.2, 1, [0.6, 1, 1], 0.5);
}
function collectEmojis3D() {
  for (const e of EMOJI_FX) {
    const f = e.f, age = G.time - e.born; if (f.state === 'dead' || age < 0) continue;
    const sc = f.scale || 1, pop = age < 14 ? easeOutBack(age / 14) : 1, fade = age > EMOJI_LIFE - 20 ? (EMOJI_LIFE - age) / 20 : 1, S = 20 * sc * pop * (0.6 + 0.4 * fade);
    const x = f.x, y = f.y - (plateLift(f) + 66) * sc - age * 0.22, z = 26;                  // (above the nameplate)
    emoji3D(EMOJIS[e.i].id, x, y, z, S, age);
    sG('cone', x, f.y - (BODY_H + 14) * sc, z * 0.5, x, y + S, z, S * 0.9, col3(f.color), 0.12 * fade);   // the projector beam
  }
}
const easeOutBack = k => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/* ============================== 3D nameplates ============================== */
const PLATE_STYLES = ['basic', 'neon', 'chevron', 'circuit', 'crystal', 'flame', 'halo', 'legend'];
const NP = { cv: null, ctx: null, tex: null, slots: new Map(), next: 0, dirty: false, W: 1024, H: 512 };
// a lettering slot in the atlas (2 columns × 4 rows of 512 × 128): "[Title] [Username]" over a smaller sub-line,
// measured so the 3D plate can wrap it exactly
function plateSlot(title, name, sub, color) {
  const key = title + '|' + name + '|' + sub + '|' + color; let s = NP.slots.get(key); if (s) return s;
  if (!NP.cv) { NP.cv = document.createElement('canvas'); NP.cv.width = NP.W; NP.cv.height = NP.H; NP.ctx = NP.cv.getContext('2d'); }
  const i = NP.next++ % 8, col = i % 2, row = i >> 1, c2 = NP.ctx, ox = col * 512, oy = row * 128;
  for (const [k, v] of NP.slots) if (v.i === i) NP.slots.delete(k);                      // (recycle the slot)
  c2.clearRect(ox, oy, 512, 128); c2.textBaseline = 'middle'; c2.textAlign = 'left'; c2.lineJoin = 'round';
  const fT = `italic 800 40px ${FONT}`, fN = `900 52px ${FONT_NUM}`;
  c2.font = fT; const wT = title ? c2.measureText(title).width + 16 : 0; c2.font = fN; const wN = c2.measureText(name).width, tot = wT + wN, sx = tot > 480 ? 480 / tot : 1;
  c2.save(); c2.translate(ox + 256 - tot * sx / 2, oy + 50); c2.scale(sx, 1);
  const draw = (txt, x, font, fill, glow) => { c2.font = font; c2.lineWidth = 10; c2.strokeStyle = 'rgba(2,3,10,0.92)'; c2.strokeText(txt, x, 0);
    c2.shadowColor = glow; c2.shadowBlur = 16; c2.fillStyle = fill; c2.fillText(txt, x, 0); c2.shadowBlur = 0; c2.fillText(txt, x, 0); };
  if (title) draw(title, 0, fT, color, color);
  draw(name, wT, fN, '#ffffff', color); c2.restore();
  c2.textAlign = 'center'; c2.font = `800 26px ${FONT}`; const ws = Math.min(470, c2.measureText(sub).width); c2.lineWidth = 7; c2.strokeText(sub, ox + 256, oy + 102, 470); c2.fillStyle = color; c2.fillText(sub, ox + 256, oy + 102, 470);
  s = { i, w: Math.max(tot * sx, ws), uv: [col * 0.5, (row + 1) * 0.25, col * 0.5 + 0.5, row * 0.25] }; NP.slots.set(key, s); NP.dirty = true;
  return s;
}
// the 3D frame of a plate: centre (x, y) in game coords, face size W × H, style, colour, animation time
function plate3D(style, x, y, z, Wd, Hd, c, t) {
  const glass = [0.035, 0.04, 0.1], gold = [1, 0.8, 0.3], edge = (k, cc) => { bG('box', x, y - Hd / 2, z + 3, Wd - 6, 1.3, 1.3, cc || c, k); bG('box', x, y + Hd / 2, z + 3, Wd - 6, 1.3, 1.3, cc || c, k);
    bG('box', x - Wd / 2, y, z + 3, 1.3, Hd - 6, 1.3, cc || c, k); bG('box', x + Wd / 2, y, z + 3, 1.3, Hd - 6, 1.3, cc || c, k); };
  if (style === 'legend') bL('rbox', x, y, z - 2, Wd + 10, Hd + 10, 5, gold, 0.25);
  // the dark glass face is opaque and writes depth: the post pass's depth-edge ink / SSAO then see one flat surface here,
  // so the edges of a platform behind can never be inked through the lettering (emission 0.2 = outside the bloom mask)
  bF('rbox', x, y, z, Wd, Hd, 6, glass, 0.2);
  switch (style) {
    case 'neon': edge(1.3); edge(0.5, [1, 1, 1]); for (const s of [-1, 1]) bG('sph', x + s * Wd / 2, y, z + 3, 4, 4, 4, c, 1.4); break;
    case 'chevron': edge(0.7); for (const s of [-1, 1]) { bL('pyr', x + s * (Wd / 2 + 7), y, z, 7, 16, 6, gold, 0.3, 0, -s * Math.PI / 2); bL('pyr', x + s * (Wd / 2 + 15), y, z, 5, 11, 4, c, 0.5, 0, -s * Math.PI / 2); } break;
    case 'circuit': edge(0.6); for (let i = 0; i < 6; i++) { const px = x - Wd / 2 + 8 + i * (Wd - 16) / 5, on = ((t >> 3) + i) % 3 === 0; bG('box', px, y + Hd / 2 - 4, z + 3.5, 6, 1, 1, c, on ? 1.5 : 0.4); bG('sph', px, y - Hd / 2 + 4, z + 3.5, 1.6, 1.6, 1.6, on ? [1, 1, 1] : c, on ? 1.6 : 0.5); } break;
    case 'crystal': edge(0.6); for (let i = -1; i <= 1; i++) { bL('octa', x + i * 14, y - Hd / 2 - 6 + Math.abs(i) * 3, z, 4.5, 8 - Math.abs(i) * 2, 4.5, mix3(c, [1, 1, 1], 0.4), 0.5, t * 0.03); bG('octa', x + i * 14, y - Hd / 2 - 6, z, 7, 11, 7, c, 0.5); }
      for (const s of [-1, 1]) bL('octa', x + s * (Wd / 2 + 6), y, z, 8, 4, 4, mix3(c, [1, 1, 1], 0.4), 0.5); break;
    case 'flame': edge(0.6, [1, 0.5, 0.15]); for (let i = 0; i < 7; i++) { const px = x - Wd / 2 + 6 + i * (Wd - 12) / 6, h = 8 + Math.sin(t * 0.3 + i * 1.7) * 3 + (i % 2) * 3;
      sF('cone', px, y - Hd / 2 + 1, z + 1, px + Math.sin(t * 0.2 + i) * 2, y - Hd / 2 - h, z + 1, 3.2, i % 2 ? [1, 0.75, 0.2] : [1, 0.4, 0.1], 1); bG('sph', px, y - Hd / 2 - h * 0.5, z, 5, 6, 5, [1, 0.45, 0.1], 0.6); } break;
    case 'halo': edge(0.7); ringG(x, y - Hd / 2 - 10, z, Wd * 0.28, 2.4, c, 1, 1.25, t * 0.04); bG('star4', x, y - Hd / 2 - 10, z + 4, 4, 4, 2, [1, 1, 1], 1.2, 0, t * 0.06); break;
    case 'legend': edge(1, gold); for (let i = 0; i < 5; i++) sL('cone', x + (i - 2) * 9, y - Hd / 2 - 4, z, x + (i - 2) * 9, y - Hd / 2 - 12 - (2 - Math.abs(i - 2)) * 4, z, 2.6, gold, 0.4);
      for (let i = 0; i < 3; i++) { const a = t * 0.05 + i * TAU / 3; bG('star4', x + Math.cos(a) * (Wd / 2 + 10), y + Math.sin(a) * (Hd / 2 + 6), z + Math.sin(a) * 6, 3.5, 3.5, 2, [1, 0.95, 0.6], 1.2, 0, t * 0.1); } break;
    default: edge(0.85);
  }
}
// how far above the feet a fighter's plate floats (tall fighters and Monolith's obelisk head get more room)
const plateLift = f => BODY_H * (f.ch.tall || 1) + 46 + (f.ch.headShape === 'obelisk' ? 34 : 0);
// who wears what: the local player wears their Battle Pass border + title; CPUs / the online rival a plain plate
function plateInfo(f, k) {
  const me = NET.active ? k === (NET.me || 0) : !f.cpu, P = NET.active ? NET.peer || {} : null, slot = NET.active ? ' · P' + (k + 1) : me ? ' · P1' : '';
  if (me) return { style: typeof passPlate === 'function' ? passPlate() : 'basic', title: typeof passTitle === 'function' ? passTitle() : '', name: typeof profileName === 'function' ? profileName() : 'Player', sub: f.ch.name + slot };
  if (P) return { style: 'basic', title: cleanName(P.ti || ''), name: cleanName(P.n || '') || 'Rival', sub: f.ch.name + slot };     // the online rival's own name + title
  if (G.training) return { style: 'basic', title: 'Training', name: 'Dummy', sub: f.ch.name };
  return { style: 'basic', title: DIFFS[G.diff] ? DIFFS[G.diff].name : '', name: 'CPU', sub: f.ch.name };
}
function collectNameplates3D() {
  if (SET.plates === false || !GL3D.P.spr) return;
  fighters.forEach((f, k) => {
    if (f.state === 'dead' || f.hand) return;
    const info = plateInfo(f, k), slot = plateSlot(info.title, info.name, info.sub, f.color), sc = f.scale || 1, c = col3(f.color);
    // (z: just in front of the floating platforms' front face, so a platform above a fighter never hides the plate)
    const x = f.x, y = f.y - plateLift(f) * sc - (f.state === 'emote' && f.emoteK === 'levitate' ? 30 : 0), Hq = 40, Wq = 160, Wd = Math.max(84, slot.w / 512 * Wq + 26), Hd = 44, z = PLAT_DEPTH / 2 + 10;
    plate3D(info.style, x, y, z, Wd, Hd, c, G.time);
    if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; }
    glSprite(NP.tex, x, -y, z + 3.4, Wq, Hq, slot.uv, [1, 1, 1, 1]);
  });
}

/* ---- the frame hook (render3d.js): emote set dressing, emojis, nameplates ---- */
function collectSocial3D() {
  for (const f of fighters) if (f.state === 'emote') emoteFX3D(f);
  collectEmojis3D();
  if (G.mode === 'play' || G.mode === 'count' || G.mode === 'ending') collectNameplates3D();
}
