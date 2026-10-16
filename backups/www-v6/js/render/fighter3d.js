/* NEON BRAWL — Procedural 3D fighters for the WebGL renderer.
 *
 * Nothing about a fighter's gameplay lives here. Each frame the shared pose solver (solveRig in render/fighters.js —
 * the same springs, IK and per-fighter motion the canvas renderer uses) produces the skeleton, and this file turns it
 * into 3D geometry: capsule limbs with sphere joints, an ellipsoid torso and head, 3D eyes, gloves and boots, weapons,
 * wings, tails / capes / scarves (the same verlet chains), and a per-fighter "accent recipe" — the 3D counterpart of
 * the hand-drawn signature details in drawAccents (crowns, hoods, horns, visors, helmets, halos, orbiting moons…).
 *
 * Depth: back limbs sit behind the torso (−Z), front limbs in front (+Z); the whole model is yawed a little toward
 * the camera (3/4 view) and spins around its vertical axis for spin attacks and hard launches. Hitboxes stay 2D.  */
'use strict';

const MAT3D = {
  plastic: { spec: 0.55, shin: 42 }, metal: { spec: 1.0, shin: 70, metal: 0.85 }, gloss: { spec: 1.0, shin: 96, metal: 0.12 },
  cloth: { spec: 0.08, shin: 8 }, energy: { spec: 0.6, shin: 40, emis: 0.3 }, shadow: { spec: 0.15, shin: 10 }, stone: { spec: 0.05, shin: 6 },
  ice: { spec: 1.0, shin: 110, metal: 0.3 }, slime: { spec: 0.95, shin: 80 }, fire: { spec: 0.4, shin: 30, emis: 0.45 }, digital: { spec: 0.4, shin: 30, emis: 0.22 },
  spectral: { spec: 0.5, shin: 40, emis: 0.3, alpha: 0.82 }, silk: { spec: 0.6, shin: 50 }, fur: { spec: 0.05, shin: 6 }, brass: { spec: 0.9, shin: 60, metal: 0.75 },
  // skin materials: Gold Edition (mirror-polished metallic gold) and Void (glassy black obsidian)
  gold: { spec: 1.6, shin: 120, metal: 1.0, smooth: true }, obsidian: { spec: 1.2, shin: 150, metal: 0.3, smooth: true }
};
const GOLD_ALB = '#ffc935', VOID_ALB = '#0b0a10';
const SPIN_SP = /spin|tornado|cyclone|whirl|vortex|twister|drill|flurry/;
let F3_ERR = 0;

// The canvas transform chain of drawFighterBody, as a 2D affine (a b c d e g): local (x, y↓) → world (x, y↓)
function rigXf(f, S) {
  let a = 1, b = 0, c = 0, d = 1, e = 0, g = 0;
  const T = (x, y) => { e += a * x + c * y; g += b * x + d * y; }, Sc = (x, y) => { a *= x; b *= x; c *= y; d *= y; };
  const Rt = r => { const cs = Math.cos(r), sn = Math.sin(r), na = a * cs + c * sn, nb = b * cs + d * sn, nc = -a * sn + c * cs, nd = -b * sn + d * cs; a = na; b = nb; c = nc; d = nd; };
  T(f.x + S.hs, f.y);
  if (S.sink !== null) { T(0, S.sink * 30); Sc(1 + S.sink * 0.3, 1 - S.sink * 0.6); }
  if (S.bob) T(0, S.bob); if (S.oy) T(0, S.oy);
  if (S.stretch) { const { va, k } = S.stretch; T(0, -32); Rt(va); Sc(1 + k, 1 - k * 0.55); Rt(-va); T(0, 32); }
  T(0, -32); Rt(S.rot); T(0, 32); Sc(S.sx, S.sy);
  return { a, b, c, d, e, g, s: Math.sqrt(Math.abs(a * d - b * c)) || 1 };
}

function collectFighter3D(f, S) {
  if (f.state === 'dead') return;
  if (f.state === 'special' && f.sp && f.sp.type === 'sink' && f.sp.phase === 'under') return;   // Umbra melded into the floor (overlay draws the pool)
  try { buildFighter3D(f, S); } catch (e) { if (F3_ERR++ < 3) console.error('[NEON BRAWL] 3D fighter', f.ch.id, e); }
  // 3D shield bubble: a fresnel-glowing sphere that shrinks as it weakens and flashes white on a parry
  if (f.state === 'shield' || f.shieldHit > 0 || f.parryFlash > 0) {
    const R = f.parryFlash > 0 ? 50 : shieldR(f), frac = clamp(f.shield / 100, 0, 1);
    const col = f.parryFlash > 0 ? [1, 1, 1] : col3(frac > 0.35 ? f.color : '#ff5a5a');
    const it = glSphere(f.x, -(f.y - 32), 0, R); it.col = col; it.glow = 0.75 + (f.shieldHit > 0 ? 0.5 : 0) + (f.parryFlash > 0 ? 0.6 : 0); it.glowPow = -1.7; it.shadow = false;
  }
}

function buildFighter3D(f, S) {
  const c = f.ch, t = G.time, face = S.face, back = S.back, X = rigXf(f, S), s = X.s, bw = S.bw, lw = S.lw, R = S.R;
  const flash = f.hitFlash > 0, hit = f.state === 'hitstun' || f.state === 'stunned';
  // skin → material: Base keeps the fighter's own material (cel-shaded + rim), Gold Edition is polished metallic gold,
  // Void is black obsidian with a red rim light and glowing red eyes
  const skin = f.skinFx, gold = skin === 'gold', voidS = skin === 'void';
  const matKey = gold ? 'gold' : voidS ? 'obsidian' : (c.mat || 'plastic'), M = MAT3D[matKey] || MAT3D.plastic;
  const alb = flash ? '#ffffff' : gold ? GOLD_ALB : voidS ? VOID_ALB : albedoOf(f), albC = col3(alb), altC = col3(flash ? '#ffffff' : (c.alt || f.color)), selfC = col3(flash ? '#ffffff' : f.color);
  const gloveC = col3(flash ? '#ffffff' : gold ? '#ffe9a8' : voidS ? '#1a1620' : (MATERIALS[matKey] && MATERIALS[matKey].bands ? lighten(alb, 0.25) : '#e9ecf6'));
  const shoeC = col3(flash ? '#ffffff' : gold ? '#c8901c' : voidS ? '#050408' : darken(alb, 0.25));
  const skinRim = gold ? [1, 0.82, 0.45] : voidS ? [1, 0.12, 0.18] : null;
  const alpha = S.alpha * (M.alpha || 1), wire = !!c.wireframe;
  const onGround = f.onGround, footY = -f.y;
  // battle damage (shader): scorch patches + scratched paint grow with the damage percent; scorch rims glow like
  // embers past 120 %. A per-fighter seed keeps each fighter's scars in their own places.
  const pc = f.percent || 0, dmgV = pc > 12 && f.state !== 'respawn' ? (f._dmgV || (f._dmgV = new Float32Array(4))) : null;
  if (dmgV) { dmgV[0] = clamp((pc - 12) / 150, 0, 1); dmgV[1] = clamp((pc - 25) / 110, 0, 1); dmgV[2] = (f.ch.id.length * 7.3 + (f.id || 0) * 3.1) % 10; dmgV[3] = clamp((pc - 110) / 60, 0, 1) * (0.75 + 0.25 * Math.sin(G.time * 0.2)); }

  // ---- yaw: a 3/4 turn toward the camera, plus spin flair (spin attacks, spinning specials, hard launches) ----
  let yaw = -face * 0.38;
  if (f.state === 'attack' && f.move && (f.move.key === 'nair' || f.move.spin)) yaw += face * TAU * clamp((f.stateT - f.move.s + 3) / (f.move.a + 8), 0, 1);
  else if (f.state === 'special' && f.sp && (SPIN_SP.test(f.sp.type || '') || f.sp.spin)) yaw += face * f.stateT * 0.45;
  else if (f.state === 'hitstun' && Math.hypot(f.vx, f.vy) > 9) yaw += f.stateT * 0.32;
  const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw);
  const cxw = X.a * 0 + X.c * S.ty + X.e;                                   // spin axis: through the torso centre
  // local (x, y↓, z) → world; direction variant
  const P = (lx, ly, lz) => { const x = X.a * lx + X.c * ly + X.e, y = X.b * lx + X.d * ly + X.g, rx = x - cxw, z = (lz || 0) * s;
    return [cxw + rx * cy0 + z * sy0, -y, -rx * sy0 + z * cy0]; };
  const D = (dx, dy, dz) => { const x = X.a * dx + X.c * dy, y = X.b * dx + X.d * dy, z = (dz || 0) * s; return [x * cy0 + z * sy0, -y, -x * sy0 + z * cy0]; };
  const W = (wx, wy, wz) => { const rx = wx - cxw; return [cxw + rx * cy0 + wz * sy0, wy, -rx * sy0 + wz * cy0]; };   // world-space point (trails) → yawed

  // ---- material helper ----
  const dress = (it, col, mk, o) => {
    const m = mk ? (MAT3D[mk] || M) : M;
    it.col = col; it.spec = m.spec; it.shin = m.shin; it.metal = m.metal || 0; it.emis = m.emis || 0; it.alpha = alpha; it.toon = 1; it.rimK = skinRim ? 1.1 : 0.75; it.rimCol = skinRim;
    it.outline = o && o.noInk ? 0 : 1.6 * s; it.aoY = footY; it.aoK = onGround ? 0.32 : 0; it.dmg = o && o.noInk ? null : dmgV;
    if (o) { if (o.emis !== undefined) it.emis = o.emis; if (o.metal !== undefined) it.metal = o.metal; if (o.spec !== undefined) it.spec = o.spec; if (o.alpha !== undefined) it.alpha = alpha * o.alpha; }
    if (wire) { it.glow = 0.5; it.glowPow = -1.4; it.outline = 0; it.shadow = false; }
    return it;
  };
  const glowIt = (it, col, k, pw) => { it.col = col; it.glow = k * Math.min(1, alpha + 0.2); it.glowPow = pw === undefined ? 1.2 : pw; it.shadow = false; return it; };
  // primitives in local coordinates
  const sph = (lx, ly, lz, r, col, mk, o) => { const p = P(lx, ly, lz); return dress(glSphere(p[0], p[1], p[2], r * s), col, mk, o); };
  const ell = (lx, ly, lz, rx, ry, rz, col, mk, o) => { const p = P(lx, ly, lz), it = glItem(GL3D.mesh.sphere);
    M4.basis(it.m, p[0], p[1], p[2], D(rx, 0, 0), D(0, -ry, 0), D(0, 0, rz)); return dress(it, col, mk, o); };
  const segW = (a, b, r, col, mk, o, mesh) => dress(glSegment(a, b, r, r, mesh), col, mk, o);
  const seg = (a, b, r, col, mk, o) => segW(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), r * s, col, mk, o);
  const cone = (base, tip, r, col, mk, o) => { const a = P(base[0], base[1], base[2]), b = P(tip[0], tip[1], tip[2]); return segW(a, b, r * s, col, mk, o, GL3D.mesh.cone); };
  const box = (lx, ly, lz, w, h, d, col, mk, o, ang) => {                    // box with local axes (ang = in-plane rotation)
    const p = P(lx, ly, lz), it = glItem(GL3D.mesh.box), ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
    M4.basis(it.m, p[0], p[1], p[2], D(ca * w, sa * w, 0), D(sa * h, -ca * h, 0), D(0, 0, d)); return dress(it, col, mk, o); };
  const glowSph = (lx, ly, lz, r, col, k, pw) => { const p = P(lx, ly, lz); return glowIt(glSphere(p[0], p[1], p[2], r * s), col, k, pw); };
  const torus = (lx, ly, lz, r, col, tiltX, mk, o, ry) => { const p = P(lx, ly, lz), it = glItem(GL3D.mesh.torus), cr = Math.cos(tiltX || 0), sr = Math.sin(tiltX || 0), yy = ry || r;
    M4.basis(it.m, p[0], p[1], p[2], D(r, 0, 0), D(0, -cr * yy, sr * yy), D(0, sr * r, cr * r)); return dress(it, col, mk, o); };
  // head-surface point: direction (fx toward facing, up, toward camera) on the head sphere at radius k·R
  const hd = (fx, up, cz, k) => { const v = V3.norm([face * fx, -up, cz]); const kk = (k === undefined ? 1 : k) * R; return [S.hx + v[0] * kk, S.hy + v[1] * kk, v[2] * kk]; };

  const zA = bw * 0.36, zL = bw * 0.2, rA = lw * 0.62, rL = lw * 0.74;
  const { fl, fr, ba, fa, ty, th, tw, hx, hy, ankle } = S;

  // ---- trails (scarf / cape / tails / ribbons / topknot): the shared verlet chains, behind the body ----
  if (c.trail && S.trails.length) {
    const spec = TRAIL_SPEC[c.trail], zt = -bw * 0.42;
    const tc = c.trail === 'hair' ? col3('#0c0c12') : c.trail === 'dinotail' ? albC : selfC, glowy = spec.look === 'ribbon' || spec.look === 'tail' || c.trail === 'tail';
    for (const tr of S.trails) for (let i = 0; i < tr.length - 1; i++) {
      const u = i / (tr.length - 1), w = lerp(spec.w0, spec.w1, u) / 2 * (c.trail === 'cape' ? 0.55 : 1);
      const a = W(tr[i].x, -tr[i].y, zt * s), b = W(tr[i + 1].x, -tr[i + 1].y, zt * s);
      const it = glSegment(a, b, Math.max(0.8, w), w);
      if (glowy) glowIt(it, selfC, 0.55 * (1 - u * 0.6), 1.2); else dress(it, tc, c.trail === 'cape' ? 'silk' : null, { alpha: c.trail === 'cape' ? 0.92 : 1 });
      if (i === tr.length - 2 && (c.trail === 'foxtails' || glowy)) { const tip = W(tr[i + 1].x, -tr[i + 1].y, zt * s); const g = glSphere(tip[0], tip[1], tip[2], 3.2 * s); glowIt(g, [1, 1, 1], 0.9, 1); }
    }
  }
  // ---- wings (behind) ----
  if (c.id === 'valkyrie' || c.wings) {
    const air = !onGround, cry = (f.state === 'special' && f.sp && (f.sp.type === 'warcry' || f.sp.wingDash)) || f.victory;
    const flap = air ? Math.sin(t * 0.35 + f.id) * 0.5 + 0.5 : 0.15 + Math.sin(t * 0.05) * 0.05, spread = cry ? 1 : 0.35 + flap * 0.55;
    const wc = col3(c.id === 'valkyrie' ? '#f4f6ff' : (c.id === 'strix' ? darken(f.color, 0.2) : f.color));
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
      const a = -0.35 - spread * 0.9 + k * 0.17, len = 26 + k * 4 - (k > 3 ? (k - 3) * 6 : 0);
      const x0 = back * 4, y0 = ty - 8, dx = Math.cos(a) * back, dy = Math.sin(a);
      box(x0 + dx * len * 0.5, y0 + dy * len * 0.5, -bw * 0.55 + side * bw * 0.25, len, 6 - k * 0.4, 2.2, wc, 'silk', null, Math.atan2(dy, dx));
    }
  }
  if (c.id === 'sylph' || c.id === 'vesper') {                               // translucent insect wings, buzzing / flapping
    const flap = Math.sin(t * (c.id === 'vesper' ? 2.4 : (onGround ? 0.12 : 0.55)) + f.id) * 0.5 + 0.5;
    for (const [ay, len, wid, col] of [[ty - 10, 30, 14, c.id === 'vesper' ? '#c8f0ff' : '#ffaee0'], [ty + 2, 20, 10, '#a8d8ff']]) {
      const a = back > 0 ? -0.45 - flap * 0.6 : Math.PI + 0.45 + flap * 0.6, dx = Math.cos(a), dy = Math.sin(a);
      ell(back * 6 + dx * len / 2, ay + dy * len / 2, -bw * 0.5, len / 2, wid / 2 * (0.6 + 0.4 * flap), 1.2, col3(col), 'silk', { alpha: 0.45, noInk: true, emis: 0.5 });
    }
  }
  if (c.id === 'sol') { const p = P(hx + back * 2, hy - 2, -bw * 0.6); const it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R + 6, 0, 0), D(0, 0, 1.5), D(0, R + 6, 0)); glowIt(it, col3('#fff1b8'), 0.9, 0.6);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.015, r0 = R + 5, r1 = R + (i % 2 ? 11 : 17); cone([hx + back * 2 + Math.cos(a) * r0, hy - 2 + Math.sin(a) * r0, -bw * 0.6], [hx + back * 2 + Math.cos(a) * r1, hy - 2 + Math.sin(a) * r1, -bw * 0.6], 2.6, col3('#ffd36e'), 'metal', { emis: 0.6, noInk: true }); } }

  const jointed = S.jointed;
  // ---- back limbs ----
  const tentArm = (sh, hand, z, ph) => {                                    // Kraken: writhing tentacles instead of arms
    const dx = hand[0] - sh[0], dy = hand[1] - sh[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; let prev = null;
    for (let i = 0; i <= 7; i++) { const u = i / 7, wv = Math.sin(u * Math.PI * 2 + t * 0.2 + ph) * 6 * Math.sin(u * Math.PI), p = [sh[0] + dx * u + nx * wv, sh[1] + dy * u + ny * wv, z];
      if (prev) seg(prev, p, rA * (1.2 - u * 0.65), albC); prev = p; }
  };
  const arm = (sh, el, hand, z) => { seg([sh[0], sh[1], z * 0.6], [el[0], el[1], z], rA, albC); sph(el[0], el[1], z, rA * 1.04, albC); seg([el[0], el[1], z], [hand[0], hand[1], z], rA * 0.9, albC); };
  const leg = (hip, kn, ft, z) => { const an = [ft[0], ft[1] - ankle]; seg([hip[0], hip[1], z], [kn[0], kn[1], z], rL, albC); sph(kn[0], kn[1], z, rL * 1.04, albC); seg([kn[0], kn[1], z], [an[0], an[1], z], rL * 0.92, albC); };
  const foot = (p, z) => { const x = p[0] + face * 2, y = p[1] - (lw * 0.7 + 1.5); ell(x, y, z, lw + 3.5, lw * 0.7 + 1.5, lw + 2.6, shoeC, 'gloss', { metal: 0 });
    if (c.skate) { box(x, y + lw * 0.7 + 2.5, z, (lw + 3.5) * 2, 2.5, 4, col3('#20242e'), 'metal'); for (let k = 0; k < 3; k++) glowSph(x - lw - 0.5 + k * (lw + 0.5), y + lw * 0.7 + 5, z, 2.4, selfC, 1, 1); } };
  const fist = (p, z) => { sph(p[0], p[1], z, lw + 2, gloveC, MATERIALS[matKey] && MATERIALS[matKey].bands ? null : 'plastic');
    if ((c.id === 'chimera' && !c.tentacles) || c.claws) for (const k of [-1, 0, 1]) cone([p[0] + face * (lw + 1), p[1] + k * 3, z], [p[0] + face * (lw + 9), p[1] + k * 4 + 2, z], 1.6, col3(c.claws ? '#f4ead8' : f.color), 'plastic'); };
  if (jointed) { if (c.tentacles) tentArm(S.shB, ba, -zA, 2); else arm(S.shB, S.elB, ba, -zA); leg(S.hipB, S.knB, fl, -zL); }
  fist(ba, -zA); foot(fl, -zL);
  if (c.dualBlade) weapon3D('sword', S.shB, ba, -zA - 2);
  // ---- torso ----
  if (S.crawling) ell(back * 4, ty, 0, tw * 0.62, 11, tw * 0.44, albC);
  else ell(0, ty, 0, tw / 2 + 1, th / 2 + 2, tw * 0.46, albC);
  if (jointed && (c.arch === 'heavy' || c.arch === 'brute' || c.arch === 'knight')) {
    const pr = lw * (c.arch === 'knight' ? 1.45 : 1.75) + 2, pc = c.arch === 'knight' ? col3(lighten(alb, 0.12)) : albC;
    for (const [sp, z] of [[S.shB, -zA * 0.55], [S.shF, zA * 0.55]]) sph(sp[0], sp[1] - 2, z, pr, pc, c.arch === 'knight' ? 'metal' : null);
  }
  // ---- front leg ----
  if (jointed) leg(S.hipF, S.knF, fr, zL);
  foot(fr, zL);
  if (c.id === 'void' || c.bigShield) shield3D();
  // ---- head + eyes ----
  sph(hx, hy, 0, R, albC);
  eyes3D();
  // ---- signature accents ----
  const recipe = ACC3D[c.id];
  if (recipe && recipe.length) { const ACC_FN = makeAccFns(); for (const [type, o] of recipe) { const fn = ACC_FN[type]; if (fn) fn(o || {}); } }
  // ---- front arm + held weapons ----
  if (jointed) { if (c.tentacles) tentArm(S.shF, fa, zA, 0); else arm(S.shF, S.elF, fa, zA); }
  if (c.sword) weapon3D('sword', S.shF, fa, zA + 2);
  if (c.spear) weapon3D('spear', S.shF, fa, zA + 2);
  if (c.hammer) weapon3D('hammer', S.shF, fa, zA + 2);
  if (c.club) weapon3D('club', S.shF, fa, zA + 2);
  if (c.nunchucks) weapon3D('nunchucks', S.shF, fa, zA + 2);
  if (c.id === 'luna') weapon3D('bow', S.shF, fa, zA + 3);
  if (!S.armOut) fist(fa, zA);
  // ---- status glows ----
  if (f.chill > 0) { const p = P(0, ty - 4, 0); glowIt(glSphere(p[0], p[1], p[2], (BODY_H * 0.62) * s), col3('#bfeaff'), 0.35, -1.6); }
  if (f.buffT > 0) { const p = P(0, ty - 4, 0); glowIt(glSphere(p[0], p[1], p[2], (BODY_H * 0.7) * s), col3('#ffd36e'), 0.45 * Math.min(1, f.buffT / 30), -1.6); }
  if (f.poison > 0) { const p = P(0, ty - 4, 0); glowIt(glSphere(p[0], p[1], p[2], (BODY_H * 0.66) * s), col3('#9dff2e'), 0.2 + 0.06 * f.poison, -1.8); }
  if (c.armor && f.state === 'attack' && f.move && f.move.heavy && f.stateT < f.move.s + f.move.a) { const p = P(0, ty - 4, 0); glowIt(glSphere(p[0], p[1], p[2], (BODY_H * 0.68) * s), [1, 1, 1], 0.5 + 0.25 * Math.sin(t * 0.5), -1.5); }
  if (f.hoverOn > 0) { const p = P(0, 6, 0); glowIt(glSphere(p[0], p[1], p[2], 26 * s), selfC, 0.35, -2); }   // hover glow
  // Void skin: a procedural trail of dark smoke puffs (presentation-only ring buffer, sampled from the torso as it moves)
  if (voidS) {
    const smk = f._smoke || (f._smoke = []), now = G.time;
    if (!smk.length || now - smk[smk.length - 1].t >= 2) { const p = P((Math.random() - 0.5) * tw, ty + (Math.random() - 0.5) * th, -bw * 0.2); smk.push({ x: p[0], y: p[1], z: p[2], t: now, r: 0.6 + Math.random() * 0.6 }); }
    while (smk.length && (now - smk[0].t > 40 || now < smk[0].t)) smk.shift();
    for (const q of smk) { const u = (now - q.t) / 40, it = glSphere(q.x, q.y + u * 26, q.z - u * 8, (5 + u * 11) * q.r * s);
      it.col = [0.05, 0.03, 0.06]; it.spec = 0; it.shin = 4; it.toon = 1; it.alpha = 0.55 * (1 - u) * alpha; it.shadow = false; it.rimK = 0.9; it.rimCol = [0.6, 0.05, 0.1]; }
  } else if (f._smoke) f._smoke = null;

  /* ---------- eyes: sclera + pupil, squinting when hurt / charging, blinking now and then ---------- */
  function eyes3D() {
    if (c.id === 'umbra' || c.id === 'specter' || c.id === 'gridrunner') return;     // (their accents draw glowing slits / visors instead)
    const blink = ((t + f.id * 97) % 260) < 6, sq = hit ? 0.35 : f.charging ? 0.6 : blink ? 0.12 : 1;
    const glowEyes = voidS || matKey === 'energy' || matKey === 'spectral' || matKey === 'shadow' || matKey === 'digital' || matKey === 'fire';
    const eyeGlow = voidS ? [1, 0.08, 0.12] : selfC;
    for (const [fx, cz] of [[0.62, 0.62], [0.12, 0.95]]) {
      const p = hd(fx, 0.12, cz, 0.9), q = hd(fx + 0.08, 0.1, cz + 0.06, 1.02);
      if (voidS) { const g = glItem(GL3D.mesh.sphere), pp = P(p[0], p[1], p[2]); M4.basis(g.m, pp[0], pp[1], pp[2], D(R * 0.2, 0, 0), D(0, -R * 0.22 * sq, 0), D(0, 0, R * 0.1)); glowIt(g, eyeGlow, 2.2, 0.5);
        glowSph(q[0], q[1], q[2], R * 0.3, eyeGlow, 0.5, 1.6); continue; }                      // Void: burning red eyes with a halo
      ell(p[0], p[1], p[2], R * 0.2, R * 0.27 * sq, R * 0.1, [1, 1, 1], 'gloss', { noInk: true, emis: glowEyes ? 0.6 : 0.12 });
      if (sq > 0.2) { if (glowEyes) glowSph(q[0], q[1], q[2], R * 0.11, eyeGlow, 1.4, 0.8); else sph(q[0], q[1], q[2], R * 0.11, [0.06, 0.06, 0.1], 'gloss', { noInk: true }); }
    }
  }
  /* ---------- weapons (follow the forearm while attacking; rest at the side / on the shoulder otherwise) ---------- */
  function weapon3D(kind, sh, hand, z) {
    let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const at = (k, zz) => [hand[0] + dx * k, hand[1] + dy * k, zz === undefined ? z : zz];
    if (kind === 'sword') {
      if (f.state !== 'attack') { const a = -Math.PI / 2 + face * (0.5 + Math.sin(t * 0.05) * 0.05); dx = Math.cos(a); dy = Math.sin(a); }
      box(hand[0], hand[1], z, 3.5, 18, 4, col3('#c9a24a'), 'metal', null, Math.atan2(dy, dx) + Math.PI / 2);   // crossguard
      const a = P(...at(6)), b = P(...at(64));
      glowIt(glSegment(a, b, 3.4 * s, 3.4 * s, GL3D.mesh.cylCap), selfC, 1.2, 0.6);                          // energy blade
      glowIt(glSegment(a, b, 1.3 * s, 1.3 * s, GL3D.mesh.cylCap), [1, 1, 1], 1.4, 0.4);
    } else if (kind === 'spear') {
      if (f.state !== 'attack' && !(f.state === 'special' && f.sp && f.sp.type === 'burst')) { const a = -Math.PI / 2 + face * (0.18 + Math.sin(t * 0.05) * 0.03); dx = Math.cos(a); dy = Math.sin(a); }
      seg(at(-26), at(50), 1.8, col3('#6a5636'), 'cloth'); cone(at(50), at(66), 3.4, col3('#f4f6ff'), 'metal'); box(...at(49), 3, 4, 4, col3('#ffd36e'), 'metal');
    } else if (kind === 'hammer') {
      const swinging = f.state === 'attack' || (f.state === 'special' && f.sp && f.sp.type === 'temper');
      if (!swinging) { const a = Math.PI / 2 - face * (0.35 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      seg(at(-8), at(34), 2.4, col3('#5a3a1e'), 'cloth'); const hot = f.heatN > 0;
      box(...at(36), 30, 18, 18, col3(hot ? '#ff9a3d' : '#5a5e6a'), 'metal', hot ? { emis: 0.8 } : null, Math.atan2(dy, dx) + Math.PI / 2);
    } else if (kind === 'club') {
      if (f.state !== 'attack' && !(f.state === 'special' && f.sp && f.sp.type === 'flurry')) { const a = -Math.PI / 2 - face * (0.25 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      const a = P(...at(-6)), b = P(...at(58)); dress(glSegment(a, b, 3 * s, 3 * s, GL3D.mesh.taper), col3('#3a2a2a'), 'metal');
      const it = glSegment(b, a, 9 * s, 9 * s, GL3D.mesh.taper); dress(it, col3('#3a2a2a'), 'metal');
      for (let k = 0; k < 5; k++) { const u = 30 + k * 6; sph(...at(u, z + 6), 1.8, col3('#d8d8e0'), 'metal', { noInk: true }); }
    } else if (kind === 'nunchucks') {
      const spin = f.state === 'attack' || (f.state === 'special' && f.sp && f.sp.type === 'flurry'), a = spin ? t * 0.9 : Math.PI / 2 + Math.sin(t * 0.08) * 0.3;
      const cx = hand[0] + Math.cos(a) * 16, cy = hand[1] + Math.sin(a) * 16, ex = cx + Math.cos(a) * 18, ey = cy + Math.sin(a) * 18;
      glowIt(glSegment(P(hand[0] - face * 2, hand[1] - 14, z), P(hand[0] + face * 2, hand[1] + 2, z), 2.2 * s, 2.2 * s, GL3D.mesh.cylCap), selfC, 1.1, 0.6);
      glowIt(glSegment(P(cx, cy, z), P(ex, ey, z), 2.2 * s, 2.2 * s, GL3D.mesh.cylCap), selfC, 1.1, 0.6);
      glowIt(glSegment(P(hand[0], hand[1], z), P(cx, cy, z), 0.6 * s, 0.6 * s), altC, 0.8, 0.5);
    } else if (kind === 'bow') {
      const p = P(hand[0] - face * 13, hand[1], z), it = glItem(GL3D.mesh.torus);
      M4.basis(it.m, p[0], p[1], p[2], D(24, 0, 0), D(0, 0, 2), D(0, 24, 0)); dress(it, col3('#f2e6b8'), 'gloss', { noInk: true });
      glowIt(glSegment(P(hand[0] - face * 13 + face * 12, hand[1] - 21, z), P(hand[0] - face * 13 + face * 12, hand[1] + 21, z), 0.5 * s, 0.5 * s), [1, 1, 1], 0.8, 0.5);
    }
  }
  /* ---------- shields held on the back arm, in front of the body ---------- */
  function shield3D() {
    const p = [ba[0] + face * 6, ba[1] + 2], z = zA + 6;
    if (c.id === 'vanguard') { box(p[0], p[1], z, 30, 58, 6, col3(flash ? '#ffffff' : '#b8302a'), 'metal'); sph(p[0], p[1], z + 3, 6, col3('#ffcf6a'), 'metal', { noInk: true }); return; }
    const q = P(p[0], p[1], z), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, q[0], q[1], q[2], D(16, 0, 0), D(0, 0, 4), D(0, 26, 0)); dress(it, col3(flash ? '#ffffff' : '#d9dde8'), 'metal');
    glowSph(p[0], p[1], z + 4, 5, col3('#ffd36e'), 1, 1);
  }

  /* ================= 3D accent vocabulary (used by the ACC3D recipes) ================= */
  function makeAccFns() {                                                   // (a hoisted factory: the recipes run before this point in the body)
  const C = o => o === 'self' || !o ? selfC : o === 'alt' ? altC : o === 'dark' ? col3(darken(f.color, 0.35)) : o === 'light' ? col3(lighten(f.color, 0.25)) : col3(o);
  const ACC_FN = {
    spikes: o => { const n = o.n || 3; for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) - 0.5 : 0, b = hd(u * 0.9, 0.8, 0.1, 0.85), tp = hd(u * 1.3 - (o.swept || 0), 1.7 * (o.len || 1), 0.1, 1.15); cone(b, tp, R * 0.22, C(o.col), null); } },
    crown: o => { const n = o.n || 3; for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) - 0.5 : 0, b = hd(u * 1.1, 0.85, 0.15, 0.82); const tp = [b[0], b[1] - R * (0.5 + (0.5 - Math.abs(u)) * 0.8) * (o.len || 1), b[2]];
      cone(b, tp, R * 0.2, C(o.col), o.ice ? 'ice' : 'stone', o.ice ? { emis: 0.25 } : null); } },
    hood: o => { const b = hd(-0.2, 0.55, -0.2, 0.7), tp = [hx + back * (R + (o.tall ? 12 : 8)), hy - R - (o.tall ? 14 : 8), -R * 0.3];
      ell(hx + back * 1, hy - R * 0.15, -R * 0.12, R * 1.08, R * 1.02, R * 0.95, C(o.col), 'cloth'); cone(b, tp, R * 0.55, C(o.col), 'cloth'); },
    horns: o => { for (const sd of [-1, 1]) { const b = [hx + sd * R * 0.5, hy - R * 0.62, R * 0.15], m = [hx + sd * (R + (o.big ? 12 : 9)), hy - R - 2, R * 0.1], tp = [hx + sd * (R + (o.big ? 8 : 4)), hy - R - (o.big ? 18 : 15), 0];
      seg(b, m, R * 0.2, C(o.col), 'stone'); cone(m, tp, R * 0.19, C(o.col), 'stone'); } },
    ears: o => { for (const sd of [-1, 1]) { const b = [hx + sd * R * 0.55, hy - R * 0.62, R * 0.1], tp = [hx + sd * R * (o.wolf ? 0.7 : 0.62) + back * 3, hy - R - (o.wolf ? 12 : 13), R * 0.05];
      cone(b, tp, R * 0.3, C(o.col), 'fur'); if (o.inner) cone([b[0], b[1], b[2] + R * 0.12], [tp[0], tp[1] + 4, tp[2] + R * 0.12], R * 0.14, C(o.inner), 'fur', { noInk: true }); } },
    halo: o => { const p = P(hx, hy - R - 6 + Math.sin(t * 0.06) * 1.2, 0), it = glItem(GL3D.mesh.torus); M4.basis(it.m, p[0], p[1], p[2], D(R * 0.85, 0, 0), D(0, -R * 0.85 * 0.25, 0), D(0, 0, R * 0.85)); glowIt(it, C(o.col), 1.2, 0.5); },
    cross: o => { box(0, ty, tw * 0.47, 3.5, 17, 2, C(o.col), 'metal', { emis: 0.8, noInk: true }); box(0, ty - 3, tw * 0.47, 13, 3.5, 2, C(o.col), 'metal', { emis: 0.8, noInk: true }); },
    stripes: o => { const n = o.n || 2; for (let k = 0; k < n; k++) box(0, ty - th * 0.3 + k * th * (0.6 / Math.max(1, n - 1)), tw * 0.44, tw * 0.9, 3, 2, C(o.col), 'cloth', { noInk: true }, -0.25 * face); },
    belt: o => { torus(0, ty + 7, 0, tw * 0.5, C(o.col), 0, 'metal', { noInk: true }, tw * 0.46); if (o.buckle) box(0, ty + 7, tw * 0.46, 12, 8, 3, C(o.buckle), 'metal', { noInk: true }); },
    pauldronsBox: o => { for (const [sd, z] of [[-1, -zA * 0.5], [1, zA * 0.5]]) box(sd * tw / 2, ty - th / 2 - 1, z, 18, 13, 16, C(o.col), 'metal'); },
    maskStripe: o => { torus(hx, hy - R * 0.45, 0, R * 1.02, C(o.col), 0, 'cloth', { noInk: true }, R * 1.0); cone(hd(0, 0.5, 0.85, 0.95), hd(0, 1.05, 0.7, 1.1), R * 0.15, C(o.tip), null, { noInk: true }); },
    bolt: o => { box(0, ty, tw * 0.47, 3, 14, 2, C(o.col), 'metal', { emis: 0.9, noInk: true }, 0.5); },
    mask: o => { ell(hx + face * R * 0.15, hy + R * 0.32, R * 0.25, R * 0.98, R * 0.62, R * 0.92, C(o.col), 'cloth'); },
    plate: o => { const p = hd(0.2, 0.55, 0.8, 0.98); box(p[0], p[1], p[2], R * 1.1, 4.5, 2.5, C(o.col), 'metal', { noInk: true }); },
    bandTails: o => { torus(hx, hy - R * 0.5, 0, R * 1.03, C(o.col), 0, 'cloth', { noInk: true }, R * 1.0);
      for (const k of [0, 1]) { const b = [hx + back * R, hy - R * 0.45, -R * 0.2], m = [hx + back * (R + 8), hy - R * 0.25 + k * 4 + Math.sin(t * 0.2 + k) * 2, -R * 0.4], e2 = [hx + back * (R + 15), hy + k * 5 + Math.sin(t * 0.15 + k) * 3, -R * 0.5];
        seg(b, m, 1.4, C(o.col), 'cloth', { noInk: true }); seg(m, e2, 1.2, C(o.col), 'cloth', { noInk: true }); } },
    plume: o => { for (let i = 0; i < 6; i++) { const u = i / 5, x = hx + back * (u * 20), y = hy - R - 4 - Math.sin(u * Math.PI) * 10 + Math.sin(t * 0.1) * u * 2; sph(x, y, -R * 0.2, 3.6 - u * 1.4, C(o.col), 'silk', { noInk: true }); } },
    crestEmblem: o => { box(0, ty - 2, tw * 0.47, 13, 15, 2, C(o.col), 'metal', { noInk: true }); },
    fangs: o => { for (const k of [2, 8]) cone(hd(0.55, -0.4, 0.75, 0.92), [hx + face * (k + 1.5), hy + R * 0.4 + 6, R * 0.7], 1.4, C(o.col || '#ffffff'), 'gloss', { noInk: true }); },
    drip: o => { const dr = (t * 0.03 + f.id) % 1; glowSph(hx + face * 7, hy + R * 0.35 + 9 + dr * 16, R * 0.7, 2.2, C(o.col), 1 - dr, 1); },
    talonCrest: o => { for (const [dy, l] of [[-R * 0.7, 18], [-R * 0.25, 14], [R * 0.2, 10]]) cone([hx + back * R * 0.5, hy + dy, -R * 0.1], [hx + back * (R + l), hy + dy - 6 + Math.sin(t * 0.12 + dy) * 1.5, -R * 0.2], R * 0.22, C(o.col), 'fur'); },
    swirl: o => { for (let i = 0; i < 2; i++) { const p = P(hx, hy, 0), it = glItem(GL3D.mesh.torus), a = t * 0.12 + i * Math.PI, r = R + 6 + i * 4;
      M4.basis(it.m, p[0], p[1], p[2], D(r * Math.cos(a), r * Math.sin(a) * 0.3, 0), D(0, -r * 0.2, 0), D(0, 0, r)); glowIt(it, C(o.col), 0.7, 0.5); } },
    shoulderRocks: o => { for (const [sd, z] of [[-1, -zA * 0.5], [1, zA * 0.5]]) { const p = [sd * (tw / 2 + 2), ty - th / 2 - 1]; const it = glItem(GL3D.mesh.octa), q = P(p[0], p[1], z); M4.basis(it.m, q[0], q[1], q[2], D(11, 0, 0), D(0, -9, 0), D(0, 0, 10)); dress(it, C(o.col), 'stone'); } },
    moss: o => { ell(hx, hy - R * 0.82, 0, R * 0.98, R * (o.thin ? 0.18 : 0.3), R * 0.98, C(o.col), 'fur'); },
    leaf: o => { seg([hx, hy - R - 1, 0], [hx + back * 6, hy - R - 11, 0], 0.9, C('#3f8a32'), 'cloth', { noInk: true }); ell(hx + back * 8, hy - R - 13, 0, 5, 2.5, 2, C(o.col), 'cloth'); },
    orbit: o => { const n = o.n || 1; for (let i = 0; i < n; i++) { const a = t * (o.speed || 0.07) + f.id + i * TAU / n, r = R + 10; glowSph(hx + Math.cos(a) * r, hy - 4 + Math.sin(a * 2) * 3, Math.sin(a) * r, o.star ? 2.6 : 3.5, C(o.col), 1.4, 0.8); } },
    rays: o => { const n = o.n || 12; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * (n > 8 ? 0.24 : 0.3), l = (i % 2 ? 7 : 12) + Math.sin(t * 0.1 + i) * 2;
      const b = [hx + Math.cos(a) * (R + 2), hy + Math.sin(a) * (R + 2), -R * 0.25], tp = [hx + Math.cos(a) * (R + 3 + l), hy + Math.sin(a) * (R + 3 + l), -R * 0.25];
      glowIt(glSegment(P(...b), P(...tp), 1.2 * s, 1.2 * s, GL3D.mesh.cone), C(o.col), 1.1, 0.5); } },
    stars: o => { for (const [dx, dy, r] of [[0, -7, 5], [-8, -3, 3.2], [8, -3, 3.2]]) { const p = P(hx + dx, hy - R + dy, R * 0.2), it = glItem(GL3D.mesh.octa); M4.basis(it.m, p[0], p[1], p[2], D(r, 0, 0), D(0, -r, 0), D(0, 0, r * 0.5)); glowIt(it, C(o.col), 1.2, 0.6); } },
    quiver: o => { box(back * (tw / 2 + 2), ty - 6, -zA, 8, 26, 8, C(o.col), 'cloth', null, back * 0.35); for (let i = 0; i < 3; i++) box(back * (tw / 2 + 2) + (i - 1) * 2.5, ty - 22, -zA, 1.5, 8, 1.5, selfC, null, { noInk: true }, back * 0.35); },
    tophat: o => { const p = P(hx, hy - R + 1, 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R * 0.95, 0, 0), D(0, -2.5, 0), D(0, 0, R * 0.95)); dress(it, C(o.col), 'cloth');
      const q = P(hx, hy - R - 1, 0), it2 = glItem(GL3D.mesh.cylCap); M4.basis(it2.m, q[0], q[1], q[2], D(R * 0.58, 0, 0), D(0, -10, 0), D(0, 0, R * 0.58)); dress(it2, C(o.col), 'cloth'); },
    clock: o => { const p = P(0, ty, tw * 0.46), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(8, 0, 0), D(0, 0, 1.5), D(0, 8, 0)); dress(it, C('#f4ead0'), 'brass');
      glowIt(glSegment(P(0, ty, tw * 0.46 + 2), P(Math.cos(t * 0.1) * 6, ty + Math.sin(t * 0.1) * 6, tw * 0.46 + 2), 0.7 * s, 0.7 * s), C(o.col), 1.2, 0.4); },
    fins: o => { for (const sd of [-1, 1]) cone([hx + sd * R * 0.6, hy - R * 0.5, 0], [hx + sd * (R + 9), hy - R * 0.9 + Math.sin(t * 0.1 + sd) * 2, 0], R * 0.25, C(o.col), 'slime'); },
    beard: o => { for (let i = -2; i <= 2; i++) { const x0 = hx + face * 2 + i * 4; seg([x0, hy + R * 0.6, R * 0.5], [x0 + Math.sin(t * 0.15 + i) * 5, hy + R + 6 - Math.abs(i) * 2, R * 0.45], 1.4, C(o.col), 'slime', { noInk: true }); } },
    antenna: o => { seg([hx + back * 4, hy - R, 0], [hx + back * 7, hy - R - 11, 0], 0.9, C(o.col), 'metal', { noInk: true }); glowSph(hx + back * 7, hy - R - 12, 0, 3, C(o.tip), 1.3, 0.8); },
    pack: o => { box(back * (tw / 2 + 9), ty, -zA * 0.4, 12, 26, 14, C(o.col), 'metal');
      if (f.jetT > 0) { const fl = 18 + Math.random() * 12; glowIt(glSegment(P(back * (tw / 2 + 9), ty + 13, -zA * 0.4), P(back * (tw / 2 + 9), ty + 13 + fl, -zA * 0.4), 5 * s, 5 * s, GL3D.mesh.cone), col3('#ffb84d'), 1.5, 0.6); } },
    smoke: o => { for (let i = 0; i < 3; i++) { const u = (t * 0.02 + i / 3) % 1; glowSph(hx + back * (6 + u * 18), hy - R - 4 - u * 22, -R * 0.3, 4 + u * 6, C(o.col), (1 - u) * (o.glow ? 0.7 : 0.35), -1.2); } },
    visor: o => { const p = hd(0.35, 0.18, 0.85, 1.0); const it = box(p[0], p[1], p[2], R * 1.6, R * 0.42, 5, C(o.col), 'gloss', { metal: 0.3 }); it.rimK = 1;
      if (o.glowLine) { const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(p[0], p[1] + 1, p[2] + 3), D(R * 1.2, 0, 0), D(0, -2.5, 0), D(0, 0, 1)); glowIt(g, C(o.glowLine), 1.2, 0.3); }
      if (o.rim) { const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(p[0], p[1] + R * 0.18, p[2] + 2.6), D(R * 1.55, 0, 0), D(0, -1.2, 0), D(0, 0, 1)); glowIt(g, C(o.rim), 1, 0.3); }
      if (o.scan) { const mc = scanCol(); const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(p[0] + Math.sin(t * 0.1) * R * 0.4, p[1], p[2] + 3), D(6, 0, 0), D(0, -R * 0.26, 0), D(0, 0, 1)); glowIt(g, mc, 1.5, 0.3); } },
    core: o => { const col = o.col === 'mode' ? scanCol() : C(o.col); glowSph(0, ty, tw * 0.44, 4.5 + Math.sin(t * 0.3) * 1.2, col, 1.4, 0.7); },
    glitchShell: o => { const j = (t >> 2) % 7 === 0 ? 4 : 1.6; for (const [dx, col] of [[-j, [1, 0.16, 0.47]], [j, [0.16, 0.78, 1]]]) { const p = P(hx + dx, hy, 0); glowIt(glSphere(p[0], p[1], p[2], R * 1.03 * s), col, 0.45, -1.6); } },
    hair: o => { for (let i = 0; i < (o.n || 5); i++) { const y0 = hy - R * 0.8 + i * 4, sw = Math.sin(t * 0.1 + i) * 5; let prev = [hx - face * R * 0.1, y0, -R * 0.2];
      for (let k = 1; k <= 4; k++) { const u = k / 4, p = [hx + back * (R * 0.3 + u * (o.len || 30)), y0 + u * u * 24 + sw * u, -R * 0.35 - u * 4]; seg(prev, p, 1.8 - u * 0.8, C(o.col), 'silk', { noInk: true }); prev = p; } } },
    cheeks: o => { for (const k of [0, 3]) box(...hd(0.45, -0.25 - k * 0.05, 0.85, 1.0), 9, 1.6, 1, C(o.col), null, { noInk: true }); },
    katana: o => { if (f.state === 'attack' || (f.state === 'special' && f.sp && f.stateT > f.sp.wind)) return;
      seg([back * tw * 0.6, ty + 10, -zA * 0.8], [face * tw * 0.3, ty - th / 2 - 12, -zA * 0.8], 1.5, C(o.col), 'metal'); seg([face * tw * 0.12, ty - th / 2 - 4, -zA * 0.8], [face * tw * 0.3, ty - th / 2 - 12, -zA * 0.8], 2.2, C(o.hilt), 'cloth'); },
    antennae: o => { for (const sd of [-1, 1]) { const x0 = hx + sd * R * 0.35, sw = Math.sin(t * 0.1 + sd) * 3; seg([x0, hy - R + 2, 0], [x0 + sd * 4 + sw, hy - R - 10, 0], 0.8, C(o.col), null, { noInk: true }); seg([x0 + sd * 4 + sw, hy - R - 10, 0], [x0 + sd * 8 + sw, hy - R - 12, 0], 0.8, C(o.col), null, { noInk: true });
      if (o.tip) glowSph(x0 + sd * 8 + sw, hy - R - 12, 0, 2.5, C(o.tip), 1.3, 0.8); } },
    helmetF1: o => { ell(hx, hy - R * 0.2, 0, R + 2.6, R * 0.85, R + 2.6, C(o.col), 'gloss'); box(hx, hy - R - 1, 0, 5, 3, R * 2, C(o.stripe), 'gloss', { noInk: true });
      const v = hd(0.3, 0.45, 0.85, 1.05); box(v[0], v[1], v[2], R * 1.56, R * 0.36, 4, C(o.visor), 'gloss', { metal: 0.4 }); },
    backSpikes: o => { for (const [dy, l] of [[-R * 0.75, 9], [-R * 0.2, 10], [R * 0.35, 7]]) cone([hx + back * R * 0.82, hy + dy, -R * 0.2], [hx + back * (R + l), hy + dy, -R * 0.2], 3.4, C(o.col), null); },
    flames: o => { const n = o.n || 5, rage = o.rage ? Math.min(1, (f.percent || 0) / 150) : 0;
      for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) - 0.5 : 0, h = (12 + (0.5 - Math.abs(u)) * 14 + rage * 16) * (0.8 + 0.2 * Math.sin(t * 0.35 + i * 1.7)), sway = Math.sin(t * 0.2 + i) * 3 + back * 4;
        const b = [hx + u * R * 1.5, hy - R * 0.6, 0], tp = [hx + u * R * 1.5 + sway, hy - R - h, 0];
        glowIt(glSegment(P(...b), P(...tp), 5 * s, 5 * s, GL3D.mesh.cone), C(o.cols[0]), 1.2, 0.5); glowIt(glSegment(P(b[0], b[1], 1), P(tp[0] * 0.5 + b[0] * 0.5, (tp[1] + b[1]) / 2, 1), 2.6 * s, 2.6 * s, GL3D.mesh.cone), C(o.cols[1]), 1.4, 0.5); } },
    headphones: o => { torus(hx, hy - 1, 0, R + 3, C(o.col), Math.PI / 2, 'plastic', { noInk: true }, R + 3);
      for (const sd of [-1, 1]) { const q = P(hx + sd * (R + 2), hy + 1, 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, q[0], q[1], q[2], D(0, 0, 5), D(sd * 4, 0, 0), D(0, 8, 0)); dress(it, C(o.col), 'gloss'); glowSph(hx + sd * (R + 5), hy + 1, 0, 2.4, C(o.ring), 1, 0.8); } },
    shades: o => { const p = hd(0.35, 0.15, 0.85, 1.0); box(p[0], p[1], p[2], R * 1.56, R * 0.4, 4, C(o.col), 'gloss', { metal: 0.6 }); const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(p[0], p[1] - R * 0.08, p[2] + 2.4), D(R * 1.4, 0, 0), D(0, -1.4, 0), D(0, 0, 1)); glowIt(g, C(o.rim), 1, 0.3); },
    eq: o => { const beat = c.beat ? 1 - (G.frame % c.beat) / c.beat : 0; for (let i = 0; i < 5; i++) { const h = 3 + (hash(i * 3.1 + (t >> 3)) * 6 + beat * 6) * (i % 2 ? 0.8 : 1); const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(-8 + i * 4, ty + 6 - h / 2, tw * 0.46), D(2.6, 0, 0), D(0, -h, 0), D(0, 0, 1)); glowIt(g, i < 2 ? selfC : i < 4 ? altC : [1, 1, 1], 1.2, 0.3); } },
    circlet: o => { torus(hx, hy - R * 0.5, 0, R * 1.02, C(o.col), 0, 'metal', { noInk: true, emis: 0.3 }, R * 1.0); },
    helmWings: o => { for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const x0 = hx + sd * R * 0.85, y0 = hy - R * 0.45, fl = Math.sin(t * 0.12 + sd) * 1.5; ell(x0 + sd * (5 + k * 3), y0 - 6 - k * 3 + fl, 0, 7 - k * 1.5, 2.6, 1.5, C(o.col), 'silk', { noInk: true }); } },
    cracks: o => { const gl2 = 0.65 + 0.35 * Math.sin(t * 0.09 + f.id); for (const [x0, y0, x1, y1] of [[-tw * 0.3, ty - th * 0.4, -tw * 0.05, ty - th * 0.1], [-tw * 0.05, ty - th * 0.1, -tw * 0.2, ty + th * 0.15], [-tw * 0.2, ty + th * 0.15, tw * 0.05, ty + th * 0.38], [-tw * 0.05, ty - th * 0.1, tw * 0.28, ty - th * 0.22]])
      glowIt(glSegment(P(x0, y0, tw * 0.45), P(x1, y1, tw * 0.45), 1.2 * s, 1.2 * s), C(o.col), gl2 * 1.4, 0.4); },
    sunDisc: () => {},                                                        // (drawn above, behind the body)
    tvisor: o => { const p = hd(0.3, 0.25, 0.85, 1.0); box(p[0], p[1], p[2], R * 1.4, 4, 3, C(o.col), 'metal', { noInk: true }); box(...hd(0.15, -0.05, 0.98, 1.0), 4, R * 0.75, 3, C(o.col), 'metal', { noInk: true }); },
    emblem: o => { glowSph(0, ty - 2, tw * 0.45, 5.5, C(o.col), 1.4, 0.7); },
    clouds: o => { const n = o.n || 6; for (let i = 0; i < n; i++) { const u = i / (n - 1); const x = o.swept ? hx + back * (u * (R + 14)) - face * 3 : hx + (i - (n - 1) / 2) * R * 0.42 + back * 2;
      const y = o.swept ? hy - R * 0.75 + u * 6 + Math.sin(t * 0.1 + i) * 1.5 : hy - R * 0.85 - (2 - Math.abs(i - 2)) * 3; sph(x, y, -R * 0.1, o.swept ? (R * 0.5) * (1 - u * 0.5) : 6.5, C(o.cols[i % 2]), 'cloth', { noInk: true, emis: 0.15 }); }
      if ((t + f.id * 13) % 90 < 6) glowIt(glSegment(P(hx + back * 10, hy - R - 2, 0), P(hx + back * 16, hy - R + 14, 0), 0.8 * s, 0.8 * s), [1, 1, 0.6], 1.6, 0.3); },
    fin: o => { cone([hx - 3, hy - R + 1, 0], [hx + back * 14, hy - R - 9 + Math.sin(t * 0.2) * 1.5, 0], R * 0.25, C(o.col), 'energy', { emis: 0.6 }); },
    topknot: o => { sph(hx + back * 2, hy - R + 1, -R * 0.2, 4.5, C(o.col), 'fur'); },
    gem: o => { const p = P(...hd(0.25, 0.45, 0.9, 1.0)), it = glItem(GL3D.mesh.octa); M4.basis(it.m, p[0], p[1], p[2], D(2.4, 0, 0), D(0, -3.4, 0), D(0, 0, 1.6)); glowIt(it, C(o.col), 1.5, 0.6); },
    beads: o => { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + t * 0.03; sph(Math.cos(a) * (tw / 2 + 10), ty - 4 + Math.sin(a * 2) * 3, Math.sin(a) * (tw / 2 + 10), 2.6, C(o.col), 'gloss', { noInk: true }); } },
    sash: o => { box(0, ty, tw * 0.45, Math.hypot(tw, th) * 0.92, 4, 2, C(o.col), 'cloth', { noInk: true }, Math.atan2(th, tw) * face); },
    cobraHood: o => { ell(hx + back * 2, hy - R * 0.2, -R * 0.5, R * 2, R * 1.2, R * 0.4, C(o.col), 'slime'); },
    diamonds: o => { for (let i = 0; i < 3; i++) { const p = P(0, ty - th * 0.3 + i * th * 0.28, tw * 0.46), it = glItem(GL3D.mesh.octa); M4.basis(it.m, p[0], p[1], p[2], D(4, 0, 0), D(0, -4, 0), D(0, 0, 1.2)); dress(it, C(o.col), 'gloss', { noInk: true, emis: 0.3 }); } },
    quiff: o => { cone([hx - face * 4, hy - R + 2, 0], [hx + back * 16, hy - R - 9, 0], R * 0.35, C(o.col), 'gloss', { emis: 0.4 }); },
    slitEyes: o => { for (const sfx of [0.1, 0.45]) { const p = P(...hd(sfx + 0.1, 0.05, 0.9, 1.02)), g = glItem(GL3D.mesh.sphere); M4.basis(g.m, p[0], p[1], p[2], D(3.2, 0, 0), D(0, -1.2, 0), D(0, 0, 1)); glowIt(g, C(o.col), 1.6, 0.6); } },
    mane: o => { for (let i = 0; i < 7; i++) { const a = Math.PI * (0.55 + i * 0.16); const dx = Math.cos(a) * back, dy = -Math.abs(Math.sin(a)) * 0.6 + 0.3; cone([hx + dx * R * 0.8, hy + dy * R * 0.8, -R * 0.3], [hx + dx * (R + 10), hy + dy * (R + 10), -R * 0.4], R * 0.3, C(o.col), 'fur'); } },
    snout: o => { ell(...hd(0.8, -0.25, 0.4, 0.95), R * 0.45, R * 0.32, R * 0.4, C(o.col), 'fur'); sph(...hd(1.05, -0.15, 0.45, 1.25), 2.4, C(o.nose), 'gloss', { noInk: true }); },
    shards: o => { const cols = ['#ff8cb4', '#8cffc8', '#ffffff', '#8cb4ff', '#ffdc8c']; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.42, d = R + 7 + Math.sin(t * 0.08 + i) * 2;
      const p = P(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 0), it = glItem(GL3D.mesh.octa); M4.basis(it.m, p[0], p[1], p[2], D(Math.cos(a) * 7, Math.sin(a) * 7, 0), D(-Math.sin(a) * 3, Math.cos(a) * 3, 0), D(0, 0, 3)); glowIt(it, col3(cols[i]), 1.1, 0.5); } },
    apron: o => { box(0, ty + th * 0.15, tw * 0.43, tw * 0.72, th * 0.7, 2.5, C(o.col), 'cloth'); },
    furnace: o => { const hot = f.heatN > 0 ? 1 : 0.45 + 0.15 * Math.sin(t * 0.1); const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(0, ty - th * 0.3, tw * 0.46), D(16, 0, 0), D(0, -11, 0), D(0, 0, 1)); glowIt(g, C(o.col), 1.4 * hot, 0.3); },
    brow: o => { box(...hd(0.2, 0.42, 0.85, 1.0), R * 1.4, 4, 3, C(o.col), 'metal', { noInk: true }); },
    speakers: o => { for (const [sd, z] of [[-1, -zA * 0.4], [1, zA * 0.4]]) { const pp = 1 + 0.12 * Math.sin(t * 0.4 + sd), q = P(sd * (tw / 2 + 3), ty - th / 2 + 4, z), it = glItem(GL3D.mesh.cylCap);
      M4.basis(it.m, q[0], q[1], q[2], D(8 * pp, 0, 0), D(0, 0, 3), D(0, 8 * pp, 0)); dress(it, C(o.col), 'gloss'); glowSph(sd * (tw / 2 + 3), ty - th / 2 + 4, z + 3.5, 2.4, C(o.ring), 1.2, 0.8); } },
    collar: o => { for (const sd of [-1, 1]) cone([sd * 4, ty - th / 2 + 2, tw * 0.3], [sd * 12, ty - th / 2 - 6, tw * 0.3], 3, C(o.col), 'metal', { emis: 0.5 }); },
    brimhat: o => { const p = P(hx, hy - R * (o.tall ? 0.7 : 0.55), 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R * 1.55, 0, 0), D(0, -2.5, 0), D(0, 0, R * 1.4)); dress(it, C(o.col), 'cloth');
      if (o.tall) { const q = P(hx, hy - R * 0.7, 0), i2 = glItem(GL3D.mesh.cylCap); M4.basis(i2.m, q[0], q[1], q[2], D(R * 0.65, 0, 0), D(0, -R * 0.8, 0), D(0, 0, R * 0.65)); dress(i2, C(o.col), 'cloth'); }
      else ell(hx, hy - R * 0.8, 0, R * 0.75, R * 0.45, R * 0.75, C(o.col), 'cloth'); },
    wrap: o => { ell(hx + face * R * 0.1, hy + R * 0.35, R * 0.2, R * 1.0, R * 0.55, R * 0.95, C(o.col), 'cloth'); },
    coil: o => { torus(back * tw * 0.42, ty + 8, zA * 0.2, 6, C(o.col), 0.4, 'cloth', { noInk: true }); },
    greathelm: o => { const it = ell(hx, hy - R * 0.1, 0, R * 1.0, R * 0.95, R * 1.0, C(o.col), 'metal'); it.metal = 0.7;
      const g = glItem(GL3D.mesh.box); M4.basis(g.m, ...P(...hd(0.3, 0.05, 0.9, 1.02)), D(R * 1.1, 0, 0), D(0, -3.5, 0), D(0, 0, 1)); glowIt(g, C(o.slit), 1.6, 0.3); },
    cubeHead: o => { const p = P(hx, hy, 0), it = glItem(GL3D.mesh.box); M4.basis(it.m, p[0], p[1], p[2], D(R * 2.1, 0, 0), D(0, -R * 2.1, 0), D(0, 0, R * 2.1)); glowIt(it, C(o.col), 0.5, -1.2);
      for (let i = 0; i < 4; i++) if (hash(i + (t >> 3)) > 0.5) glowSph(hx - R + hash(i * 3 + (t >> 3)) * R * 1.6, hy - R + i * R * 0.5, R, 2, C(o.col), 1.2, 0.8); },
    bigPauldrons: o => { for (const [sd, z] of [[-1, -zA * 0.5], [1, zA * 0.5]]) { const it = ell(sd * (tw / 2 + 2), ty - th / 2 - 1, z, 13, 9, 12, C(o.col), 'metal'); it.metal = 0.9; } },
    stacks: o => { for (const k of [0, 9]) seg([back * (tw / 2 - 4 + k), ty - th / 2 - 4, -zA * 0.6], [back * (tw / 2 - 4 + k), ty - th / 2 - 24, -zA * 0.6], 3.6, C(o.col), 'metal'); },
    tufts: o => { for (const sd of [-1, 1]) cone([hx + sd * R * 0.5, hy - R * 0.7, 0], [hx + sd * R * 0.75 + back * 2, hy - R - 11, 0], R * 0.22, C(o.col), 'fur'); },
    facedisc: o => { for (const sd of [-1, 1]) ell(...hd(0.3 + sd * 0.3, 0.02, 0.9, 0.96), R * 0.34, R * 0.34, R * 0.12, C(o.col), 'fur', { noInk: true }); },
    beak: o => { cone(hd(0.65, -0.2, 0.55, 0.95), [hx + face * (R + (o.hooked ? 9 : 8)), hy + R * (o.hooked ? 0.35 : 0.25), R * 0.45], R * 0.2, C(o.col), 'gloss'); },
    oniHorns: o => { for (const sd of [-1, 1]) { const b = [hx + sd * R * 0.4, hy - R * 0.75, R * 0.2]; cone(b, [hx + sd * R * 0.5 + back * 3, hy - R - 16, R * 0.1], R * 0.18, C(o.col), 'gloss'); } },
    crystalSteps: () => { const cols = ['#ff8cdc', '#8cffdc', '#ffe678', '#96a0ff']; for (const [x, y, sc, z] of [[-tw / 2 - 2, ty - th / 2 - 4, 1, -zA * 0.4], [tw / 2 + 2, ty - th / 2 - 4, 1, zA * 0.4], [hx, hy - R - 2, 0.8, 0]])
      for (let k = 0; k < 3; k++) { const w = (14 - k * 4) * sc; box(x, y - k * 6 * sc - w * 0.3, z, w, w * 0.6, w, col3(cols[(k + Math.floor(t / 20)) % 4]), 'gloss', { metal: 0.7, emis: 0.25 }); } },
    ghostMask: o => { const p = P(hx + back * (R + 8), hy - 6 + Math.sin(t * 0.06) * 2, -R * 0.6); glowIt(glSphere(p[0], p[1], p[2], R * 0.8 * s), C(o.col), 0.45, -1.4); },
    lantern: o => { const a = t * 0.05; glowSph(Math.cos(a) * (tw / 2 + 14), ty - 10 + Math.sin(a) * 8, Math.sin(a) * (tw / 2 + 14), 4.5, C(o.col), 1.4, 0.7); },
    plagueBeak: o => { cone(hd(0.6, 0.05, 0.6, 0.92), [hx + face * (R + 22), hy + R * 0.6, R * 0.5], R * 0.38, C(o.col), 'cloth'); },
    goggles: o => { for (const sfx of [0.05, 0.5]) glowSph(...hd(sfx + 0.1, 0.15, 0.9, 1.0), 3.4, C(o.col), 1.2, 0.8); },
    helix: o => { for (const ph of [0, Math.PI]) for (let i = 0; i <= 14; i++) { const u = i / 14, y = ty + th / 2 - u * (th + R * 2.2), a = u * TAU * 1.5 + t * 0.08 + ph;
      glowSph(Math.sin(a) * (tw / 2 + 6), y, Math.cos(a) * (tw / 2 + 6), 1.8, ph ? altC : [1, 1, 1], 1.1, 0.8); } },
    sigil: o => { const p = P(...hd(0.2, 0.55, 0.85, 1.02)), it = glItem(GL3D.mesh.torus); M4.basis(it.m, p[0], p[1], p[2], D(4, 0, 0), D(0, 0, 0.8), D(0, 4, 0)); glowIt(it, C(o.col), 1.4, 0.5); },
    crest: o => { const n = o.n || 4; for (let i = 0; i < n; i++) cone([hx + back * (R * 0.2 + i * 4), hy - R * 0.7 + i * 6, -R * 0.1], [hx + back * (R + 8 - i), hy - R * 0.9 + i * 8 - 4, -R * 0.15], R * 0.2, C(o.col), null); },
    embers: o => { for (let i = 0; i < 5; i++) glowSph(-tw * 0.3 + i * tw * 0.15, ty - th * 0.2 + (i % 2) * 8, tw * 0.45, 2.2, C(o.col), 0.9, 0.8); },
    compoundEye: o => { ell(...hd(0.4, 0.05, 0.75, 0.75), R * 0.55, R * 0.45, R * 0.45, C(o.col), 'gloss', { emis: 0.4 }); },
    bugWings: () => {},                                                       // (drawn above with the insect wings)
    tricorn: o => { const p = P(hx, hy - R * 0.7, 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R * 1.3, 0, 0), D(0, -R * 0.55, 0), D(0, 0, R * 1.1)); dress(it, C(o.col), 'cloth');
      const g = glItem(GL3D.mesh.torus); M4.basis(g.m, p[0], p[1], p[2], D(R * 1.3, 0, 0), D(0, -0.6, 0), D(0, 0, R * 1.1)); glowIt(g, C(o.rim), 0.9, 0.4); },
    eyepatch: () => { const p = hd(0.55, 0.1, 0.7, 1.02); sph(p[0], p[1], p[2], 4, [0.04, 0.04, 0.08], 'cloth', { noInk: true }); },
    runes: o => { const gl2 = f.rootT > 0 ? 1 : 0.5 + 0.2 * Math.sin(t * 0.06); for (let k = 0; k < 2; k++) { const y = ty - th * 0.2 + k * th * 0.4; for (let i = 0; i < 6; i++)
      glowIt(glSegment(P(-tw * 0.35 + i * tw * 0.117, y + (i % 2 ? 3 : -3), tw * 0.46), P(-tw * 0.35 + (i + 1) * tw * 0.117, y + (i % 2 ? -3 : 3), tw * 0.46), 0.9 * s, 0.9 * s), C(o.col), gl2 * 1.3, 0.4); } },
    hourglass: o => { for (const [x0, y0, x1, y1] of [[-6, ty - 9, 6, ty - 9], [6, ty - 9, -6, ty + 9], [-6, ty + 9, 6, ty + 9], [6, ty + 9, -6, ty - 9]]) glowIt(glSegment(P(x0, y0, tw * 0.46), P(x1, y1, tw * 0.46), 0.9 * s, 0.9 * s), C(o.col), 1.1, 0.4); },
    ghostRings: o => { for (let k = 1; k <= 2; k++) { const off = Math.sin(t * 0.05 + k) * 4 * k, p = P(hx + back * off, hy, 0); glowIt(glSphere(p[0], p[1], p[2], (R + 2 + k * 3) * s), C(o.col), 0.25, -2.2); } },
    kabuto: o => { ell(hx, hy - R * 0.25, 0, R + 1.6, R * 0.8, R + 1.6, C(o.col), 'metal');
      for (const sd of [-1, 1]) glowIt(glSegment(P(hx + sd * 3, hy - R - 1, R * 0.3), P(hx + sd * R * 1.3, hy - R - 18, R * 0.3), 1.2 * s, 1.2 * s, GL3D.mesh.cone), C(o.crest), 1.3, 0.4); },
    mempo: o => { glowIt(glSegment(P(...hd(0.05, -0.35, 0.95, 1.02)), P(...hd(0.85, -0.35, 0.55, 1.02)), 0.8 * s, 0.8 * s), C(o.col), 1.2, 0.4); },
    quill: () => { seg([hx + back * R * 0.5, hy - R * 0.3, -R * 0.3], [hx + back * (R + 6), hy - R - 12, -R * 0.3], 0.8, col3('#2a2a70'), null, { noInk: true }); ell(hx + back * (R + 3), hy - R - 6, -R * 0.3, 2.5, 7, 1, [1, 1, 1], 'silk', { noInk: true }); },
    book: () => { box(back * (tw / 2 + 2), ty + 6, zA * 0.3, 18, 14, 6, col3('#7a2a2a'), 'cloth', null, back * 0.2); box(back * (tw / 2 + 2), ty + 6, zA * 0.3 + 3.2, 15, 11, 0.8, col3('#f8f0dc'), 'cloth', { noInk: true }, back * 0.2); },
    rebar: o => { for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) seg([sd * (tw / 2 - 4 - k * 6), ty - th / 2 + 2, sd * zA * 0.3], [sd * (tw / 2 + 4 - k * 4), ty - th / 2 - 12 - k * 4, sd * zA * 0.3], 1.2, C(o.col), 'metal', { noInk: true }); },
    hardhat: o => { ell(hx, hy - R * 0.35, 0, R + 1.5, R * 0.75, R + 1.5, C(o.col), 'gloss'); const p = P(hx, hy - R * 0.32, 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R + 5, 0, 0), D(0, -1.6, 0), D(0, 0, R + 5)); dress(it, C(o.col), 'gloss'); },
    faceplate: o => { const p = hd(0.3, o.big ? 0.05 : 0.3, 0.85, 1.0); box(p[0], p[1], p[2], R * (o.big ? 1.6 : 1.4), o.big ? R * 0.6 : 4, 3, C(o.col), 'metal', { noInk: true, metal: 0.8 }); },
    daggers: o => { for (const sd of [-1, 1]) seg([back * tw * 0.45, ty + 4, -zA * 0.7], [back * tw * 0.45 + sd * 10, ty - 16, -zA * 0.7], 1.1, C(o.col), 'metal', { noInk: true }); },
    ribs: o => { for (let k = 0; k < 4; k++) box(0, ty - th * 0.3 + k * 6, tw * 0.46, tw * 0.62 - k * 3, 1.8, 1.5, C(o.col), 'gloss', { noInk: true }); box(0, ty, tw * 0.47, 2, th * 0.7, 1.5, C(o.col), 'gloss', { noInk: true }); },
    soulfire: o => { for (let i = 0; i < 3; i++) { const x = hx + (i - 1) * 6, h = 8 + Math.sin(t * 0.4 + i * 2) * 3; glowIt(glSegment(P(x, hy - R * 0.7, 0), P(x + 1, hy - R - h, 0), 3 * s, 3 * s, GL3D.mesh.cone), C(o.col), 1.3, 0.5); } },
    moon: o => { const p = P(hx, hy - 2, 0), it = glItem(GL3D.mesh.torus); M4.basis(it.m, p[0], p[1], p[2], D(R + 9, 0, 0), D(0, -(R + 9) * 0.06, 0), D(0, 0, R + 9)); glowIt(it, C(o.col), 0.7, 0.4);
      const a = t * 0.08; glowSph(hx + Math.cos(a) * (R + 9), hy - 2, Math.sin(a) * (R + 9), 3.5, C(o.col), 1.4, 0.8); },
    pearls: o => { for (let i = -2; i <= 2; i++) sph(hx + i * 4, hy - R - 1 + Math.abs(i), R * 0.3, 2, C(o.col), 'gloss', { noInk: true, emis: 0.2 }); },
    throatGem: o => { glowSph(0, ty - th / 2 + 4, tw * 0.4, 3.5, C(o.col), 1.4, 0.8); },
    galea: o => { ell(hx, hy - R * 0.25, 0, R + 1.6, R * 0.8, R + 1.6, C(o.col), 'metal');
      const p = P(hx, hy - R - 1, 0), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R * 1.15, 0, 0), D(0, 0, 3), D(0, 7, 0)); dress(it, C(o.crest), 'fur');
      box(...hd(0.55, -0.2, 0.75, 1.02), 3, R * 0.8, 2, C(o.col), 'metal', { noInk: true }); },
    floatCrown: o => { const bob = Math.sin(t * 0.06) * 1.5, p = P(hx, hy - R - 4 + bob, 0), it = glItem(GL3D.mesh.torus); M4.basis(it.m, p[0], p[1], p[2], D(R * 0.95, 0, 0), D(0, -R * 0.2, 0), D(0, 0, R * 0.95)); glowIt(it, C(o.col), 1.2, 0.5);
      for (let i = 0; i < 5; i++) { const x = hx + (i - 2) * R * 0.45; glowIt(glSegment(P(x, hy - R - 4 + bob, 0), P(x, hy - R - 10 - (2 - Math.abs(i - 2)) * 4 + bob, 0), 0.9 * s, 0.9 * s), C(o.col), 1.2, 0.4); } }
  };
  return ACC_FN;
  }
  function scanCol() { const o = fighters.includes(f) ? otherOf(f) : null, cls = o ? weightClassOf(o.ch).id : 'mid'; return col3(cls === 'floaty' ? '#2ef0ff' : cls === 'mid' ? '#ffe14d' : '#ff2f57'); }
}

/* Per-fighter accent recipes: the 3D translation of each fighter's signature details (render/fighters.js drawAccents). */
const ACC3D = {
  velocity: [['stripes', { col: 'alt' }]],
  titan: [['shoulderRocks', { col: '#7a6a58' }], ['moss', { col: '#5fbf4a' }], ['leaf', { col: '#8be06a' }]],
  vortex: [['orbit', { n: 1, col: 'self' }]],
  aether: [['rays', { col: 'self', n: 12 }]],
  phantom: [['hood', { col: 'self' }]],
  dynamo: [['belt', { col: 'self', buckle: '#fff3c4' }], ['pauldronsBox', { col: 'self' }], ['maskStripe', { col: 'self', tip: '#ff5a5a' }]],
  spark: [['spikes', { n: 3, col: 'self', swept: 0.5 }], ['bolt', { col: 'self' }]],
  frost: [['crown', { n: 3, col: 'self', ice: true }]],
  mirage: [['mask', { col: '#0e0e1c' }], ['plate', { col: '#c8cde0' }], ['bandTails', { col: 'self' }]],
  aegis: [['crestEmblem', { col: 'self' }], ['plume', { col: 'self' }]],
  venom: [['fangs', { col: 'self' }], ['drip', { col: 'self' }]],
  apex: [['talonCrest', { col: 'self' }]],
  tempest: [['swirl', { col: 'self' }]],
  terra: [['shoulderRocks', { col: 'self' }], ['moss', { col: '#7fd24a', thin: true }]],
  luna: [['stars', { col: '#ffffff' }], ['quiver', { col: '#3a3f8a' }]],
  solaris: [['orbit', { n: 4, col: '#ffffff', star: true, speed: 0.04 }]],
  void: [['halo', { col: '#ffd36e' }], ['cross', { col: '#ffd36e' }]],
  chrono: [['tophat', { col: 'self' }], ['clock', { col: 'self' }]],
  chimera: [['fins', { col: 'self' }], ['beard', { col: 'self' }]],
  mecha: [['antenna', { col: 'self', tip: '#ff5a5a' }], ['pack', { col: 'self' }]],
  nyx: [['hood', { col: 'self', tall: true }], ['smoke', { col: '#3a1030' }]],
  surge: [['visor', { col: '#14281e', rim: 'self' }], ['core', { col: 'self' }]],
  glitch: [['glitchShell', {}]],
  echo: [['hair', { col: 'self', n: 5, len: 30 }]],
  kitsune: [['ears', { col: 'self', inner: '#ffffff' }], ['cheeks', { col: '#ff2f57' }]],
  ronin: [['bandTails', { col: '#ff5a5a' }], ['katana', { col: '#ececf4', hilt: '#ff5a5a' }]],
  sylph: [['antennae', { col: 'self', tip: '#a8d8ff' }]],
  mecha2: [],
  dino: [['helmetF1', { col: '#f2f4fc', stripe: 'self', visor: '#1e3c78' }], ['backSpikes', { col: 'self' }]],
  blaze: [['flames', { cols: ['#ff5a1f', '#ffd23a'], n: 5 }], ['belt', { col: '#ffd23a', buckle: 'self' }]],
  pulse: [['headphones', { col: '#20222c', ring: 'self' }], ['shades', { col: '#0c0d16', rim: 'self' }], ['eq', {}]],
  valkyrie: [['circlet', { col: '#ffd36e' }], ['helmWings', { col: '#f4f6ff' }]],
  magma: [['crown', { n: 5, col: '#3a2a24', len: 0.8 }], ['cracks', { col: '#ffb03a' }]],
  sol: [['tvisor', { col: '#2a1a08' }], ['emblem', { col: '#fff1b8' }]],
  gale: [['clouds', { cols: ['#e6f9ff', '#c9e9ff'], n: 6, swept: true }]],
  drift: [['visor', { col: '#0a0c1e', rim: 'alt' }], ['fin', { col: 'self' }]],
  zenith: [['topknot', { col: 'dark' }], ['gem', { col: '#8a6bff' }], ['beads', { col: '#7a3a1a' }], ['sash', { col: '#8a6bff' }]],
  serpent: [['cobraHood', { col: 'dark' }], ['fangs', { col: '#ffffff' }], ['diamonds', { col: '#c6ff2e' }]],
  blitz: [['quiff', { col: '#ffffff' }], ['visor', { col: '#0a1e3c' }], ['core', { col: 'self' }]],
  umbra: [['hood', { col: '#0c0618' }], ['slitEyes', { col: '#ff3d9a' }]],
  fang: [['ears', { col: 'self', wolf: true }], ['mane', { col: 'dark' }], ['snout', { col: 'light', nose: '#1a1010' }]],
  prism: [['shards', {}]],
  smith: [['apron', { col: '#4a2e1a' }], ['furnace', { col: '#ff8c28' }], ['brow', { col: '#3a2a20' }]],
  mimic: [['speakers', { col: '#1a2a2a', ring: 'self' }]],
  stormmage: [['clouds', { cols: ['#9aa4c8', '#3a4060'], n: 5 }], ['collar', { col: '#ffe629' }]],
  strider: [['brimhat', { col: '#6a4a2a' }], ['wrap', { col: '#5ac8a0' }], ['coil', { col: '#d8c8a0' }]],
  specter: [['greathelm', { col: '#26304e', slit: 'self' }], ['smoke', { col: 'self', glow: true }]],
  inferno: [['horns', { col: '#3a1a10' }], ['flames', { cols: ['#ff5a1f', '#ffd23a'], n: 3, rage: true }]],
  byte: [['cubeHead', { col: 'alt' }]],
  titanus: [['bigPauldrons', { col: '#9aa6b8' }], ['stacks', { col: '#3a404c' }], ['visor', { col: '#20242e', glowLine: '#ffb84d' }]],
  apexx: [['visor', { col: '#14161e', scan: true }], ['core', { col: 'mode' }]],
  strix: [['tufts', { col: 'dark' }], ['facedisc', { col: '#faf0dc' }], ['beak', { col: '#ffd23a' }]],
  kuro: [['oniHorns', { col: '#f4ead8' }], ['brow', { col: '#1a1020' }]],
  bismuth: [['crystalSteps', {}]],
  aura: [['ghostMask', { col: 'alt' }], ['lantern', { col: 'self' }]],
  nox: [['plagueBeak', { col: '#e8dcc0' }], ['goggles', { col: '#c6ff2e' }], ['brimhat', { col: '#1a1c14', tall: true }]],
  helix: [['helix', {}]],
  zealot: [['sigil', { col: 'alt' }], ['sash', { col: '#ff6a1f' }]],
  pyre: [['crest', { col: 'alt', n: 4 }], ['embers', { col: '#ffc850' }]],
  vesper: [['stripes', { col: '#1a1a24', n: 3 }], ['compoundEye', { col: '#ff3c5a' }], ['antennae', { col: '#1a1a24' }]],
  rogue: [['tricorn', { col: '#1a2a2a', rim: 'self' }], ['eyepatch', {}]],
  titanis: [['moss', { col: '#5fae4a' }], ['runes', { col: 'alt' }]],
  paradox: [['hourglass', { col: 'alt' }], ['ghostRings', { col: 'self' }]],
  zen: [['kabuto', { col: '#14181c', crest: 'self' }], ['mempo', { col: 'alt' }]],
  fable: [['quill', {}], ['book', {}]],
  goliath: [['rebar', { col: '#6a4a3a' }], ['hardhat', { col: '#ffb84d' }]],
  orin: [['rays', { col: '#ffe680', n: 7 }], ['faceplate', { col: '#c89a2a' }]],
  nyx2: [['hood', { col: 'self', tall: true }], ['daggers', { col: '#c8ccd8' }]],
  kryp: [['ribs', { col: '#e8ffe0' }], ['soulfire', { col: 'self' }]],
  atlas: [['moon', { col: 'alt' }]],
  siren: [['hair', { col: 'alt', n: 4, len: 32 }], ['pearls', { col: '#fff6f0' }], ['throatGem', { col: 'self' }]],
  talon: [['crest', { col: 'dark', n: 3 }], ['beak', { col: '#ffd23a', hooked: true }], ['goggles', { col: '#5ab4ff' }]],
  brimstone: [['horns', { col: '#2a0a06', big: true }], ['core', { col: '#ff8a2a' }]],
  gridrunner: [],
  vanguard: [['galea', { col: '#c8a050', crest: '#b8302a' }]],
  omega: [['floatCrown', { col: 'alt' }], ['faceplate', { col: '#0a0614', big: true }], ['core', { col: 'alt' }]]
};
delete ACC3D.mecha2;
