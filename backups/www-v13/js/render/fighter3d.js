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
  gold: { spec: 1.6, shin: 120, metal: 1.0, smooth: true }, obsidian: { spec: 1.2, shin: 150, metal: 0.3, smooth: true },
  // Battle Pass skins: Prism Shard crystal, Mech Frame chrome, Celestial night-sky, Neon Legend hologram
  crystal: { spec: 1.3, shin: 150, metal: 0.35, emis: 0.18, smooth: true }, chrome: { spec: 1.5, shin: 170, metal: 1.0, smooth: true },
  cosmic: { spec: 0.9, shin: 90, metal: 0.25, emis: 0.06, smooth: true }, holo: { spec: 0.8, shin: 80, metal: 0.2, emis: 0.5, smooth: true }
};
const PASS_SKIN = { prism: { mat: 'crystal', alb: f => lighten(f.color, 0.35), rim: [0.7, 1, 1] }, mech: { mat: 'chrome', alb: () => '#c4cddf', rim: [1, 1, 1] },
                    cosmic: { mat: 'cosmic', alb: () => '#141a3c', rim: [1, 0.85, 0.45] }, legend: { mat: 'holo', alb: f => f.color, rim: null } };
const GOLD_ALB = '#ffc935', VOID_ALB = '#0b0a10';
const SPIN_SP = /spin|tornado|cyclone|whirl|vortex|twister|drill|flurry/;
let F3_ERR = 0;
// The Gold Crusader helmet replaces the headgear accents it would clash with
const HELM_REPLACES = new Set(['crown', 'hood', 'horns', 'ears', 'spikes', 'plume', 'tophat', 'helmetF1', 'moss', 'leaf', 'hair', 'circlet', 'helmWings', 'flames', 'oniHorns',
  'antenna', 'antennae', 'headphones', 'fins', 'bandTails', 'maskStripe', 'talonCrest', 'topknot', 'quiff', 'mane', 'tufts', 'brimhat', 'greathelm', 'cubeHead', 'kabuto',
  'tricorn', 'hardhat', 'galea', 'floatCrown', 'cobraHood', 'backSpikes', 'goggles', 'foldHat', 'waveCrest', 'cometHead', 'turban', 'beetleHorn', 'jellyBell', 'hiveHead', 'crownlet']);
const SKSEED = {};
const skinSeed = id => SKSEED[id] || (SKSEED[id] = [...id].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 2166136261));
// Which parts of the face a fighter's 3D accents cover (visors hide the eye expressions, masks / beards / fangs the mouth)
const FACE_EYES = new Set(['visor', 'shades', 'tvisor', 'compoundEye', 'slitEyes']), FACE_MOUTH = new Set(['mask', 'beard', 'fangs', 'tvisor', 'compoundEye', 'drip']);
function faceKindOf(id) { const ks = (ACC3D[id] || []).map(r => r[0]); return { eyes: ks.some(k => FACE_EYES.has(k)), mouth: ks.some(k => FACE_MOUTH.has(k)) || !!(CHARS.find(c => c.id === id) || {}).venom }; }

// The canvas transform chain of drawFighterBody, as a 2D affine (a b c d e g): local (x, y↓) → world (x, y↓)
function rigXf(f, S) {
  let a = 1, b = 0, c = 0, d = 1, e = 0, g = 0;
  const T = (x, y) => { e += a * x + c * y; g += b * x + d * y; }, Sc = (x, y) => { a *= x; b *= x; c *= y; d *= y; };
  const Rt = r => { const cs = Math.cos(r), sn = Math.sin(r), na = a * cs + c * sn, nb = b * cs + d * sn, nc = -a * sn + c * cs, nd = -b * sn + d * cs; a = na; b = nb; c = nc; d = nd; };
  T(f.x + S.hs, f.y);
  if (f.scale && f.scale !== 1) Sc(f.scale, f.scale);                       // the Arcade's Giant Boss: the whole model scales about the feet
  if (S.sink !== null) { T(0, S.sink * 30); Sc(1 + S.sink * 0.3, 1 - S.sink * 0.6); }
  if (S.bob) T(0, S.bob); if (S.oy) T(0, S.oy);
  if (S.stretch) { const { va, k } = S.stretch; T(0, -32); Rt(va); Sc(1 + k, 1 - k * 0.55); Rt(-va); T(0, 32); }
  T(0, -32); Rt(S.rot); T(0, 32); Sc(S.sx, S.sy);
  return { a, b, c, d, e, g, s: Math.sqrt(Math.abs(a * d - b * c)) || 1 };
}

function collectFighter3D(f, S) {
  if (f.state === 'dead') return;
  if (f.ch.hand) { try { hand3D(f); } catch (e) { if (F3_ERR++ < 3) console.error('[NEON BRAWL] boss hand 3D', e); } return; }   // OMNI HAND (game/boss.js)
  if (f.state === 'special' && f.sp && f.sp.type === 'sink' && f.sp.phase === 'under') return;   // Umbra melded into the floor (overlay draws the pool)
  try { buildFighter3D(f, S); } catch (e) { if (F3_ERR++ < 3) console.error('[NEON BRAWL] 3D fighter', f.ch.id, e); }
  // 3D shield bubble: a fresnel-glowing sphere that shrinks as it weakens and flashes white on a parry
  if (f.state === 'shield' || f.shieldHit > 0 || f.parryFlash > 0) {
    const R = f.parryFlash > 0 ? 50 : shieldR(f), frac = clamp(f.shield / 100, 0, 1);
    const col = f.parryFlash > 0 ? [1, 1, 1] : col3(frac > 0.35 ? f.color : '#ff5a5a');
    const it = glSphere(f.x, -(f.y - 32 * (f.scale || 1)), 0, R); it.col = col; it.glow = 0.75 + (f.shieldHit > 0 ? 0.5 : 0) + (f.parryFlash > 0 ? 0.6 : 0); it.glowPow = -1.7; it.shadow = false;
  }
}

function buildFighter3D(f, S) {
  const c = f.ch, t = G.time, face = S.face, back = S.back, X = rigXf(f, S), s = X.s, bw = S.bw, lw = S.lw, R = S.R;
  const flash = f.hitFlash > 0, hit = f.state === 'hitstun' || f.state === 'stunned';
  // skin → material: Base keeps the fighter's own material (cel-shaded + rim), Gold Edition is polished metallic gold,
  // Void is black obsidian with a red rim light and glowing red eyes
  const skin = f.skinFx, gold = skin === 'gold', voidS = skin === 'void', SHOP = f.skin >= SHOP_SKIN0 ? SHOP_SKINS[f.skin - SHOP_SKIN0] : null, PS = PASS_SKIN[skin] || (SHOP && shopSkinMat(SHOP));
  const matKey = gold ? 'gold' : voidS ? 'obsidian' : PS ? PS.mat : (c.mat || 'plastic'), M = MAT3D[matKey] || MAT3D.plastic;
  const alb = flash ? '#ffffff' : gold ? GOLD_ALB : voidS ? VOID_ALB : PS ? PS.alb(f) : albedoOf(f), albC = col3(alb), altC = col3(flash ? '#ffffff' : (c.alt || f.color)), selfC = col3(flash ? '#ffffff' : f.color);
  const gloveC = col3(flash ? '#ffffff' : gold ? '#ffe9a8' : voidS ? '#1a1620' : (MATERIALS[matKey] && MATERIALS[matKey].bands ? lighten(alb, 0.25) : '#e9ecf6'));
  const shoeC = col3(flash ? '#ffffff' : gold ? '#c8901c' : voidS ? '#050408' : darken(alb, 0.25));
  const skinRim = gold ? [1, 0.82, 0.45] : voidS ? [1, 0.12, 0.18] : PS ? (PS.rim || selfC) : null;
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
  else if (f.state === 'ultimate' && ultOf(f).fam === 'uppercut' && f.ultPh !== 'intro') yaw += face * (f.ultT || 0) * 0.55;   // a corkscrew uppercut
  else if (f.ultHeld > 0 && G.ultCine && G.ultCine.fam === 'vortex') yaw += G.time * 0.4;                                     // spun around inside a vortex
  else if (f.state === 'emote') yaw += emoteYaw(f);                                                                            // taunt pirouettes and twirls (render/emotes3d.js)
  const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw);
  const cxw = X.a * 0 + X.c * S.ty + X.e;                                   // spin axis: through the torso centre
  // local (x, y↓, z) → world; direction variant
  const P = (lx, ly, lz) => { const x = X.a * lx + X.c * ly + X.e, y = X.b * lx + X.d * ly + X.g, rx = x - cxw, z = (lz || 0) * s;
    return [cxw + rx * cy0 + z * sy0, -y, -rx * sy0 + z * cy0]; };
  const D = (dx, dy, dz) => { const x = X.a * dx + X.c * dy, y = X.b * dx + X.d * dy, z = (dz || 0) * s; return [x * cy0 + z * sy0, -y, -x * sy0 + z * cy0]; };
  const W = (wx, wy, wz) => { const rx = wx - cxw; return [cxw + rx * cy0 + wz * sy0, wy, -rx * sy0 + wz * cy0]; };   // world-space point (trails) → yawed
  const U = (ux, uy, uz) => D(ux, -uy, uz);                                 // a direction in y-UP local space (keeps bases right-handed)

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

  // smooth swept tubes (render/tubes.js): limbs are bezier tubes, chains are Catmull-Rom tubes — relative to the feet
  const O3 = P(0, 0, 0), REF = [0, 0, 1];
  // ---- trails (scarf / cape / tails / ribbons / topknot): the shared verlet chains, behind the body, as one smooth tube each ----
  if (c.trail && S.trails.length) {
    const spec = TRAIL_SPEC[c.trail], zt = -bw * 0.42;
    const tc = c.trail === 'hair' ? col3('#0c0c12') : c.trail === 'dinotail' ? albC : selfC, glowy = spec.look === 'ribbon' || spec.look === 'tail' || c.trail === 'tail';
    const wk = (c.trail === 'cape' ? 0.55 : 1) * (f.scale || 1), rOf = u => Math.max(0.8, lerp(spec.w0, spec.w1, u) / 2 * wk);
    for (const tr of S.trails) {
      const it = chainTube(tr.map(q => W(q.x, -q.y, zt * s)), rOf, O3, REF, 3); if (!it) continue;
      if (glowy) glowIt(it, selfC, 0.5, 1.2); else dress(it, tc, c.trail === 'cape' ? 'silk' : null, { alpha: c.trail === 'cape' ? 0.92 : 1 });
      if (c.trail === 'foxtails' || glowy) { const e = tr[tr.length - 1], tip = W(e.x, -e.y, zt * s); glowIt(glSphere(tip[0], tip[1], tip[2], 3.2 * s), [1, 1, 1], 0.9, 1); }
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
  if (c.id === 'sylph' || c.id === 'vesper' || c.bugWings) {                 // translucent insect wings, buzzing / flapping (Hive: amber, a constant buzz)
    const buzz = c.id === 'vesper' || c.bugWings, flap = Math.sin(t * (buzz ? 2.4 : (onGround ? 0.12 : 0.55)) + f.id) * 0.5 + 0.5;
    for (const [ay, len, wid, col] of [[ty - 10, 30, 14, c.bugWings ? '#fff2c0' : c.id === 'vesper' ? '#c8f0ff' : '#ffaee0'], [ty + 2, 20, 10, c.bugWings ? '#ffe08a' : '#a8d8ff']]) {
      const a = back > 0 ? -0.45 - flap * 0.6 : Math.PI + 0.45 + flap * 0.6, dx = Math.cos(a), dy = Math.sin(a);
      ell(back * 6 + dx * len / 2, ay + dy * len / 2, -bw * 0.5, len / 2, wid / 2 * (0.6 + 0.4 * flap), 1.2, col3(col), 'silk', { alpha: 0.45, noInk: true, emis: 0.5 });
    }
  }
  if (c.id === 'sol') { const p = P(hx + back * 2, hy - 2, -bw * 0.6); const it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R + 6, 0, 0), D(0, 0, 1.5), D(0, R + 6, 0)); glowIt(it, col3('#fff1b8'), 0.9, 0.6);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.015, r0 = R + 5, r1 = R + (i % 2 ? 11 : 17); cone([hx + back * 2 + Math.cos(a) * r0, hy - 2 + Math.sin(a) * r0, -bw * 0.6], [hx + back * 2 + Math.cos(a) * r1, hy - 2 + Math.sin(a) * r1, -bw * 0.6], 2.6, col3('#ffd36e'), 'metal', { emis: 0.6, noInk: true }); } }

  const jointed = S.jointed;
  // ---- back limbs ----
  const tentArm = (sh, hand, z, ph) => {                                    // Kraken: writhing tentacles instead of arms (one smooth tapering tube)
    const dx = hand[0] - sh[0], dy = hand[1] - sh[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7, wv = Math.sin(u * Math.PI * 2 + t * 0.2 + ph) * 6 * Math.sin(u * Math.PI); pts.push(P(sh[0] + dx * u + nx * wv, sh[1] + dy * u + ny * wv, z)); }
    const it = chainTube(pts, u => rA * (1.2 - u * 0.65) * s, O3, REF, 3); if (it) dress(it, albC);
  };
  // arms / legs: ONE bezier tube through shoulder → elbow → hand (hip → knee → ankle) — no seams, no ball joints
  const limb = (a, b, c2, r0, r1) => dress(limbTube(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), P(c2[0], c2[1], c2[2]), r0 * s, r1 * s, O3, REF), albC);
  const arm = (sh, el, hand, z) => limb([sh[0], sh[1], z * 0.6], [el[0], el[1], z], [hand[0], hand[1], z], rA * 1.05, rA * 0.86);
  const leg = (hip, kn, ft, z) => limb([hip[0], hip[1], z], [kn[0], kn[1], z], [ft[0], ft[1] - ankle, z], rL * 1.08, rL * 0.86);
  const foot = (p, z) => { const x = p[0] + face * 2, y = p[1] - (lw * 0.7 + 1.5); ell(x, y, z, lw + 3.5, lw * 0.7 + 1.5, lw + 2.6, shoeC, 'gloss', { metal: 0 });
    if (c.skate) { box(x, y + lw * 0.7 + 2.5, z, (lw + 3.5) * 2, 2.5, 4, col3('#20242e'), 'metal'); for (let k = 0; k < 3; k++) glowSph(x - lw - 0.5 + k * (lw + 0.5), y + lw * 0.7 + 5, z, 2.4, selfC, 1, 1); } };
  const fist = (p, z) => { sph(p[0], p[1], z, lw + 2, gloveC, MATERIALS[matKey] && MATERIALS[matKey].bands ? null : 'plastic');
    if ((c.id === 'chimera' && !c.tentacles) || c.claws) for (const k of [-1, 0, 1]) cone([p[0] + face * (lw + 1), p[1] + k * 3, z], [p[0] + face * (lw + 9), p[1] + k * 4 + 2, z], 1.6, col3(c.claws ? '#f4ead8' : f.color), 'plastic'); };
  const legless = !!c.smokeTail;                                            // Djinn floats on a smoke tail instead of legs (its accent draws the tail)
  if (jointed) { if (c.tentacles) tentArm(S.shB, ba, -zA, 2); else arm(S.shB, S.elB, ba, -zA); if (!legless) leg(S.hipB, S.knB, fl, -zL); }
  fist(ba, -zA); if (!legless) foot(fl, -zL);
  if (c.dualBlade) weapon3D(f.skin === 2 ? 'voidblade' : 'sword', S.shB, ba, -zA - 2);
  // ---- torso ----
  if (S.crawling) ell(back * 4, ty, 0, tw * 0.62, 11, tw * 0.44, albC);
  else ell(0, ty, 0, tw / 2 + 1, th / 2 + 2, tw * 0.46, albC);
  if (jointed && (c.arch === 'heavy' || c.arch === 'brute' || c.arch === 'knight')) {
    const pr = lw * (c.arch === 'knight' ? 1.45 : 1.75) + 2, pc = c.arch === 'knight' ? col3(lighten(alb, 0.12)) : albC;
    for (const [sp, z] of [[S.shB, -zA * 0.55], [S.shF, zA * 0.55]]) sph(sp[0], sp[1] - 2, z, pr, pc, c.arch === 'knight' ? 'metal' : null);
  }
  // ---- front leg ----
  if (jointed && !legless) leg(S.hipF, S.knF, fr, zL);
  if (!legless) foot(fr, zL);
  if (c.id === 'void' || c.bigShield) shield3D();
  // ---- head + eyes (Monolith's head is a floating obelisk: its accent draws it) ----
  if (!c.headShape) { sph(hx, hy, 0, R, albC); eyes3D(); }               // (Monolith's obelisk and Totem's stack of carved faces are drawn by their accents)
  // ---- signature accents (the Gold Crusader skin's helmet — and Item Shop headgear — replace whatever headgear they would clash with) ----
  const recipe = ACC3D[c.id], helmed = f.skin === 1 || !!(SHOP && SHOP.head);   // (on wireframe Matrix the gear is holographic too)
  const ACC_FN = recipe && recipe.length || SHOP ? makeAccFns() : null;
  if (recipe && recipe.length) for (const [type, o] of recipe) { if (helmed && HELM_REPLACES.has(type)) continue; const fn = ACC_FN[type]; if (fn) fn(o || {}); }
  // ---- skin geometry: skin 1 = a procedural geometric helmet, skin 2 = spiked armour (+ its weapons change below) ----
  if (f.skin === 1) { if (c.headShape === 'obelisk') obeliskCrown(); else if (c.headShape === 'totem') totemCrown(); else helmet3D(); } else if (f.skin === 2) spikedArmor3D();
  else if (SHOP) shopSkin3D(SHOP, { P, D, U, W, hd, sph, ell, seg, cone, box, torus, glowSph, glowIt, dress, rb, acc: ACC_FN, S, f, c, t, face, back, R, hx, hy, ty, th, tw, bw, lw, zA, zL, s, jointed,
    fa, ba, fl, fr, flash, selfC, altC, albC, onGround, O3, REF, legless });   // the 45 Item Shop skins (render/skins3d.js)
  else if (f.skin >= 3) passSkin3D(f.skin);                                  // the Battle Pass skins (ui/battlepass.js): more geometry
  // ---- front arm + held weapons (the Void Reaver skin swaps each weapon for a darker, crueller one) ----
  if (jointed) { if (c.tentacles) tentArm(S.shF, fa, zA, 0); else arm(S.shF, S.elF, fa, zA); }
  const vw = f.skin === 2;
  if (c.sword) weapon3D(vw ? 'voidblade' : 'sword', S.shF, fa, zA + 2);
  if (c.spear) weapon3D(vw ? 'trident' : 'spear', S.shF, fa, zA + 2);
  if (c.hammer) weapon3D(vw ? 'mace' : 'hammer', S.shF, fa, zA + 2);
  if (c.club) weapon3D(vw ? 'cleaver' : 'club', S.shF, fa, zA + 2);
  if (c.nunchucks) weapon3D(vw ? 'kusarigama' : 'nunchucks', S.shF, fa, zA + 2);
  if (c.id === 'luna') weapon3D(vw ? 'crescent' : 'bow', S.shF, fa, zA + 3);
  if (vw && !(c.sword || c.spear || c.hammer || c.club || c.nunchucks || c.id === 'luna')) { claws3D(fa, zA); claws3D(ba, -zA); }   // unarmed fighters get void claws
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

  /* ---------- the face: eyes that track the opponent (pupils glide on a spring), blink and squint; cartoon X eyes
   *            when hit, spinning spirals when dazed, ^^ when celebrating; brows that scowl while charging, frown
   *            while attacking and lift when worried; a mouth to match (grin, gritted teeth, O, frown, open smile) ---------- */
  function eyes3D() {
    if (c.id === 'umbra' || c.id === 'specter' || c.id === 'gridrunner') return;     // (their accents draw glowing slits / visors instead)
    const FK = c._fk || (c._fk = faceKindOf(c.id));
    const atk = f.state === 'attack' || f.state === 'special' || f.state === 'grab' || f.state === 'holding' || f.state === 'ultimate';
    const worried = f.state === 'shield' || f.state === 'ledge' || f.state === 'grabbed' || (f.state === 'free' && f.percent > 120);
    const focus = f.charging || (f.state === 'ultimate' && f.ultPh === 'intro') || (f.state === 'special' && f.sp && f.sp.wind >= 10 && f.stateT < f.sp.wind);
    const happy = f.victory && f.state === 'free' && Math.floor(t / 90) % 3 === 1;
    const expr = f.state === 'stunned' ? 'dizzy' : hit ? 'x' : happy ? 'happy' : focus ? 'scowl' : atk ? 'angry' : worried ? 'worried' : (!onGround && f.vy < -4) ? 'whee' : 'calm';
    f.expr = expr;
    // where to look: at the opponent in a match, ahead in the menus
    let lx = face, ly = 0;
    if (fighters.includes(f)) { const o = otherOf(f); if (o.state !== 'dead' && o.state !== 'respawn') { const dd = Math.hypot(o.x - f.x, o.y - f.y) || 1; lx = (o.x - f.x) / dd; ly = (o.y - f.y) / dd; } }
    const rg = f.rig || (f.rig = {}), look = rg.eye3 || (rg.eye3 = { x: lx, y: ly });
    look.x += (lx - look.x) * 0.18; look.y += (ly - look.y) * 0.18;
    const lf = look.x * face;                                                    // + = toward the way the fighter faces
    const blink = ((t + f.id * 97) % 260) < 6 && (expr === 'calm' || expr === 'worried');
    const sq = blink ? 0.12 : expr === 'scowl' ? 0.5 : expr === 'angry' ? 0.78 : expr === 'worried' ? 1.1 : 1;
    const glowEyes = voidS || matKey === 'energy' || matKey === 'spectral' || matKey === 'shadow' || matKey === 'digital' || matKey === 'fire';
    const eyeGlow = voidS ? [1, 0.08, 0.12] : selfC;
    const ink = lum3(albC) < 0.2 ? [0.95, 0.95, 1] : [0.05, 0.05, 0.09], NI = { noInk: true };
    const special = !FK.eyes && (expr === 'x' || expr === 'dizzy' || expr === 'happy');
    for (const [fx, cz, front] of [[0.62, 0.62, 1], [0.12, 0.95, 0]]) {
      const p = hd(fx, 0.12, cz, 0.9);
      if (voidS) { const q = hd(fx + 0.08, 0.1, cz + 0.06, 1.02), g = glItem(GL3D.mesh.sphere), pp = P(p[0], p[1], p[2]); M4.basis(g.m, pp[0], pp[1], pp[2], D(R * 0.2, 0, 0), D(0, -R * 0.22 * sq, 0), D(0, 0, R * 0.1)); glowIt(g, eyeGlow, 2.2, 0.5);
        glowSph(q[0], q[1], q[2], R * 0.3, eyeGlow, 0.5, 1.6); continue; }                      // Void: burning red eyes with a halo
      if (special) {
        const q = hd(fx + 0.03, 0.12, cz + 0.04, 1.0);
        if (expr === 'x') for (const a of [0.785, -0.785]) box(q[0], q[1], q[2], R * 0.44, R * 0.09, 1.6, ink, null, NI, a);           // cartoon X eyes
        else if (expr === 'dizzy') { torus(q[0], q[1], q[2], R * 0.15, ink, Math.PI / 2, null, NI);                                       // spinning spiral eyes
          const a = t * 0.35 * (front ? 1 : -1); sph(q[0] + Math.cos(a) * R * 0.15, q[1] + Math.sin(a) * R * 0.15, q[2] + 0.6, R * 0.06, ink, null, NI); }
        else for (const s of [-1, 1]) box(q[0] + s * R * 0.08, q[1] + R * 0.02, q[2], R * 0.2, R * 0.07, 1.6, ink, null, NI, s * 0.62);   // ^^
        continue;
      }
      ell(p[0], p[1], p[2], R * 0.2, R * 0.27 * sq, R * 0.1, [1, 1, 1], 'gloss', { noInk: true, emis: glowEyes ? 0.6 : 0.12 });
      if (sq > 0.2) { const q = hd(fx + 0.08 + lf * 0.12, 0.1 - look.y * 0.14 * sq, cz + 0.06, 1.02);                           // the pupil follows the opponent
        if (glowEyes) glowSph(q[0], q[1], q[2], R * 0.11, eyeGlow, 1.4, 0.8); else sph(q[0], q[1], q[2], R * 0.11, [0.06, 0.06, 0.1], 'gloss', NI); }
      if (!FK.eyes && expr !== 'calm' && expr !== 'whee') {                                                                          // brows: scowl / frown / worried lift
        const k = expr === 'scowl' ? 0.55 : expr === 'angry' ? 0.34 : expr === 'worried' ? -0.38 : 0, ang = (front ? -face : face) * k;
        const b = hd(fx - 0.02, expr === 'worried' ? 0.46 : 0.4, cz * 0.94, 0.98); box(b[0], b[1], b[2], R * 0.42, R * 0.09, 2, ink, null, NI, ang);
      }
    }
    if (FK.mouth || voidS) return;
    const m = hd(0.5, -0.42, 0.82, 0.98);
    if (expr === 'x' || expr === 'dizzy' || expr === 'whee') ell(m[0], m[1], m[2], R * 0.1, R * 0.13, 1.6, ink, null, NI);             // O
    else if (expr === 'happy') { ell(m[0], m[1], m[2], R * 0.22, R * 0.12, 1.6, ink, null, NI); ell(m[0], m[1] + R * 0.05, m[2] + 0.4, R * 0.1, R * 0.05, 1, [1, 0.42, 0.55], null, NI); }
    else if (expr === 'angry' || expr === 'scowl') { box(m[0], m[1], m[2], R * 0.38, R * 0.15, 1.4, [0.97, 0.97, 1], null, NI); box(m[0], m[1], m[2] + 0.5, R * 0.38, R * 0.025, 1, ink, null, NI); }   // gritted teeth
    else if (expr === 'worried') for (const s of [-1, 1]) box(m[0] + s * R * 0.07, m[1] - R * 0.01, m[2], R * 0.16, R * 0.05, 1.4, ink, null, NI, -s * 0.4);
    else { box(m[0], m[1], m[2], R * 0.16, R * 0.05, 1.4, ink, null, NI); for (const s of [-1, 1]) box(m[0] + s * R * 0.12, m[1] - R * 0.035, m[2], R * 0.1, R * 0.05, 1.4, ink, null, NI, -s * 0.55); }   // grin
    if (expr === 'scowl') { const u = (t * 0.03 + f.id * 0.3) % 1, s = hd(-0.5, 0.35 - u * 0.6, 0.6, 1.02); sph(s[0], s[1], s[2], R * 0.07 * (1 - u * 0.4), [0.75, 0.92, 1], 'gloss', NI); }   // a bead of sweat
  }
  /* ---------- weapons (follow the forearm while attacking; rest at the side / on the shoulder otherwise) ---------- */
  function weapon3D(kind, sh, hand, z) {
    const atk = f.state === 'attack' || f.state === 'emote';                 // (a taunt's weapon spin swings it like an attack)
    let dx = hand[0] - sh[0], dy = hand[1] - sh[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const at = (k, zz) => [hand[0] + dx * k, hand[1] + dy * k, zz === undefined ? z : zz];
    if (kind === 'sword') {
      if (!atk) { const a = -Math.PI / 2 + face * (0.5 + Math.sin(t * 0.05) * 0.05); dx = Math.cos(a); dy = Math.sin(a); }
      box(hand[0], hand[1], z, 3.5, 18, 4, col3('#c9a24a'), 'metal', null, Math.atan2(dy, dx) + Math.PI / 2);   // crossguard
      const a = P(...at(6)), b = P(...at(64));
      glowIt(glSegment(a, b, 3.4 * s, 3.4 * s, GL3D.mesh.cylCap), selfC, 1.2, 0.6);                          // energy blade
      glowIt(glSegment(a, b, 1.3 * s, 1.3 * s, GL3D.mesh.cylCap), [1, 1, 1], 1.4, 0.4);
    } else if (kind === 'spear') {
      if (!atk && !(f.state === 'special' && f.sp && f.sp.type === 'burst')) { const a = -Math.PI / 2 + face * (0.18 + Math.sin(t * 0.05) * 0.03); dx = Math.cos(a); dy = Math.sin(a); }
      seg(at(-26), at(50), 1.8, col3('#6a5636'), 'cloth'); cone(at(50), at(66), 3.4, col3('#f4f6ff'), 'metal'); box(...at(49), 3, 4, 4, col3('#ffd36e'), 'metal');
    } else if (kind === 'hammer') {
      const swinging = atk || (f.state === 'special' && f.sp && f.sp.type === 'temper');
      if (!swinging) { const a = Math.PI / 2 - face * (0.35 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      seg(at(-8), at(34), 2.4, col3('#5a3a1e'), 'cloth'); const hot = f.heatN > 0;
      box(...at(36), 30, 18, 18, col3(hot ? '#ff9a3d' : '#5a5e6a'), 'metal', hot ? { emis: 0.8 } : null, Math.atan2(dy, dx) + Math.PI / 2);
    } else if (kind === 'club') {
      if (!atk && !(f.state === 'special' && f.sp && f.sp.type === 'flurry')) { const a = -Math.PI / 2 - face * (0.25 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      const a = P(...at(-6)), b = P(...at(58)); dress(glSegment(a, b, 3 * s, 3 * s, GL3D.mesh.taper), col3('#3a2a2a'), 'metal');
      const it = glSegment(b, a, 9 * s, 9 * s, GL3D.mesh.taper); dress(it, col3('#3a2a2a'), 'metal');
      for (let k = 0; k < 5; k++) { const u = 30 + k * 6; sph(...at(u, z + 6), 1.8, col3('#d8d8e0'), 'metal', { noInk: true }); }
    } else if (kind === 'nunchucks') {
      const spin = atk || (f.state === 'special' && f.sp && f.sp.type === 'flurry'), a = spin ? t * 0.9 : Math.PI / 2 + Math.sin(t * 0.08) * 0.3;
      const cx = hand[0] + Math.cos(a) * 16, cy = hand[1] + Math.sin(a) * 16, ex = cx + Math.cos(a) * 18, ey = cy + Math.sin(a) * 18;
      glowIt(glSegment(P(hand[0] - face * 2, hand[1] - 14, z), P(hand[0] + face * 2, hand[1] + 2, z), 2.2 * s, 2.2 * s, GL3D.mesh.cylCap), selfC, 1.1, 0.6);
      glowIt(glSegment(P(cx, cy, z), P(ex, ey, z), 2.2 * s, 2.2 * s, GL3D.mesh.cylCap), selfC, 1.1, 0.6);
      glowIt(glSegment(P(hand[0], hand[1], z), P(cx, cy, z), 0.6 * s, 0.6 * s), altC, 0.8, 0.5);
    } else if (kind === 'bow') {
      const p = P(hand[0] - face * 13, hand[1], z), it = glItem(GL3D.mesh.torus);
      M4.basis(it.m, p[0], p[1], p[2], D(24, 0, 0), D(0, 0, 2), D(0, 24, 0)); dress(it, col3('#f2e6b8'), 'gloss', { noInk: true });
      glowIt(glSegment(P(hand[0] - face * 13 + face * 12, hand[1] - 21, z), P(hand[0] - face * 13 + face * 12, hand[1] + 21, z), 0.5 * s, 0.5 * s), [1, 1, 1], 0.8, 0.5);
    }
    // ---- the Void Reaver skin's weapons ----
    const red = col3('#ff2238'), obs = col3(flash ? '#ffffff' : '#141018'), px = -dy, py = dx;            // (px, py) = across the weapon
    if (kind === 'voidblade') {                                                                              // a jagged obsidian blade with a burning red edge
      if (!atk) { const a = -Math.PI / 2 + face * (0.5 + Math.sin(t * 0.05) * 0.05); dx = Math.cos(a); dy = Math.sin(a); }
      const qx = -dy, qy = dx, A = k => [hand[0] + dx * k, hand[1] + dy * k, z];
      for (const sd of [-1, 1]) cone(A(2), [hand[0] + dx * 2 + qx * sd * 12, hand[1] + dy * 2 + qy * sd * 12 - 3, z], 2.2, obs, 'metal');   // a spiked guard
      dress(glSegment(P(...A(6)), P(...A(68)), 3.4 * s, 1 * s, GL3D.mesh.taper), obs, 'obsidian');
      glowIt(glSegment(P(...A(6)), P(...A(64)), 4.4 * s, 4.4 * s, GL3D.mesh.cylCap), red, 0.75, 0.6);
      for (let k = 0; k < 5; k++) { const b = A(16 + k * 10), sd = k % 2 ? 1 : -1; cone(b, [b[0] + qx * sd * 7 + dx * 4, b[1] + qy * sd * 7 + dy * 4, z], 2, obs, 'metal'); }   // the jagged teeth
    } else if (kind === 'trident') {
      if (!atk && !(f.state === 'special' && f.sp && f.sp.type === 'burst')) { const a = -Math.PI / 2 + face * (0.18 + Math.sin(t * 0.05) * 0.03); dx = Math.cos(a); dy = Math.sin(a); }
      const qx = -dy, qy = dx, A = k => [hand[0] + dx * k, hand[1] + dy * k, z];
      seg(A(-26), A(46), 1.8, obs, 'metal'); box(...A(47), 3, 22, 3, red, 'metal', { emis: 0.5 }, Math.atan2(dy, dx));
      for (const sd of [-1, 0, 1]) { const b = A(48), b2 = [b[0] + qx * sd * 9, b[1] + qy * sd * 9, z]; cone(b2, [b2[0] + dx * (sd ? 14 : 20), b2[1] + dy * (sd ? 14 : 20), z], 2.6, obs, 'metal'); glowSph(b2[0] + dx * (sd ? 14 : 20), b2[1] + dy * (sd ? 14 : 20), z, 1.6, red, 1, 1); }
    } else if (kind === 'mace') {
      const swinging = atk || (f.state === 'special' && f.sp && f.sp.type === 'temper');
      if (!swinging) { const a = Math.PI / 2 - face * (0.35 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      const A = k => [hand[0] + dx * k, hand[1] + dy * k, z];
      seg(A(-8), A(32), 2.4, obs, 'metal'); const hc = A(40); sph(hc[0], hc[1], hc[2], 11, obs, 'metal');
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, dz = Math.sin(a * 1.7) * 6; cone([hc[0] + Math.cos(a) * 9, hc[1] + Math.sin(a) * 9, z + dz], [hc[0] + Math.cos(a) * 20, hc[1] + Math.sin(a) * 20, z + dz * 1.6], 3, obs, 'metal'); }
      glowSph(hc[0], hc[1], hc[2], 13, red, 0.35, -1.4);
    } else if (kind === 'cleaver') {
      if (!atk && !(f.state === 'special' && f.sp && f.sp.type === 'flurry')) { const a = -Math.PI / 2 - face * (0.25 + Math.sin(t * 0.05) * 0.04); dx = Math.cos(a); dy = Math.sin(a); }
      const qx = -dy, qy = dx, A = k => [hand[0] + dx * k, hand[1] + dy * k, z];
      seg(A(-6), A(20), 2.4, obs, 'metal');
      const c0 = A(42); box(c0[0] + qx * 6, c0[1] + qy * 6, z, 18, 46, 3, obs, 'metal', null, Math.atan2(dy, dx) + Math.PI / 2);
      glowIt(glSegment(P(...A(20).map((v, i) => i < 2 ? v + [qx, qy][i] * 15 : v)), P(...A(64).map((v, i) => i < 2 ? v + [qx, qy][i] * 15 : v)), 1.4 * s, 1.4 * s, GL3D.mesh.cylCap), red, 1.2, 0.5);
    } else if (kind === 'kusarigama') {                                                                     // a sickle on a chain
      const spin = atk || (f.state === 'special' && f.sp && f.sp.type === 'flurry'), a = spin ? t * 0.8 : Math.PI / 2 + Math.sin(t * 0.08) * 0.3;
      seg([hand[0], hand[1] - 10, z], [hand[0], hand[1] + 6, z], 2, obs, 'metal');
      let px0 = hand[0], py0 = hand[1]; for (let k = 1; k <= 6; k++) { const u = k / 6, x = hand[0] + Math.cos(a) * 34 * u, y = hand[1] + Math.sin(a) * 34 * u + Math.sin(u * Math.PI) * 6; sph(x, y, z, 1.6, obs, 'metal', { noInk: true }); px0 = x; py0 = y; }
      cone([px0, py0, z], [px0 + Math.cos(a + 1.4) * 18, py0 + Math.sin(a + 1.4) * 18, z], 3.2, obs, 'metal'); glowSph(px0, py0, z, 3, red, 1.1, 0.8);
    } else if (kind === 'crescent') {                                                                       // a black crescent bow with blade tips
      const p = P(hand[0] - face * 13, hand[1], z), it = glItem(GL3D.mesh.torus);
      M4.basis(it.m, p[0], p[1], p[2], D(26, 0, 0), D(0, 0, 2.6), D(0, 26, 0)); dress(it, obs, 'metal');
      for (const sd of [-1, 1]) cone([hand[0] - face * 13, hand[1] + sd * 25, z], [hand[0] - face * 20, hand[1] + sd * 40, z], 2.6, obs, 'metal');
      glowIt(glSegment(P(hand[0] - face, hand[1] - 23, z), P(hand[0] - face, hand[1] + 23, z), 0.6 * s, 0.6 * s), red, 1, 0.5);
    }
    void px; void py;
  }
  /* ---------- skin 1 (Gold Crusader): a procedural geometric helmet. Five designs (knight · kabuto · tech · crown-helm ·
   *            faceted diamond); the fighter's id picks one and tunes its crest, horns, fins, spike count and trim, so no two
   *            fighters wear the same helmet. The cap sits up and back on the head, so the face (and its expressions) stay
   *            visible; whatever headgear the fighter normally wears that would clash is left off (HELM_REPLACES). ---------- */
  function helmet3D() {
    const h = skinSeed(c.id), type = h % 5, v1 = ((h >> 3) % 7) / 6, v2 = ((h >> 6) % 5) / 4;
    const gold = flash ? [1, 1, 1] : col3('#ffcf3a'), trim = flash ? [1, 1, 1] : col3(c.alt || '#ffffff'), dark = col3('#3a2a14');
    const cx = hx - face * R * 0.04, cy = hy - R * 0.6, cz = -R * 0.2;
    if (type === 4) {                                                                                         // a faceted diamond helm
      const it = glItem(GL3D.mesh.octa), p = P(cx, cy - R * 0.05, cz);
      M4.basis(it.m, p[0], p[1], p[2], D(R * 1.18, 0, 0), D(0, -R * (0.95 + v1 * 0.35), 0), D(0, 0, R * 1.12)); dress(it, gold, 'gold');
      const n = 3 + h % 3; for (let i = 0; i < n; i++) { const a = t * 0.04 + i * TAU / n, r = R * 1.5, q = P(cx + Math.cos(a) * r, cy - R * 0.5 + Math.sin(a * 2) * 4, Math.sin(a) * r), g = glItem(GL3D.mesh.octa);
        M4.basis(g.m, q[0], q[1], q[2], D(3.2, 0, 0), D(0, -5.5, 0), D(0, 0, 3.2)); glowIt(g, trim, 1.2, 0.6); }
      return;
    }
    ell(cx, cy, cz, R * 1.1, R * 0.62, R * 1.08, gold, 'gold');                                                // the dome
    box(cx + face * R * 0.15, hy - R * 0.42, R * 0.38, R * 1.5, R * 0.16, R * 0.55, trim, 'metal', null, 0);       // the brow band
    if (type === 0) {                                                                                          // knight: a crest fin + cheek guards
      const chh = R * (0.45 + v1 * 0.5); box(cx, cy - R * 0.3 - chh / 2, cz, R * 1.3, chh + R * 0.2, 3, trim, 'metal', null, 0);   // (sunk into the dome)
      for (const sd of [-1, 1]) box(cx - face * R * 0.35, hy + R * 0.2, sd * R * 0.84, R * 0.5, R * 0.62, 3, gold, 'gold');
    } else if (type === 1) {                                                                                   // kabuto: a flared neck guard, crescent horns, a crest disc
      torus(cx - face * R * 0.15, cy + R * 0.42, cz, R * (1.18 + v2 * 0.15), dark, 0.25, 'metal', null, R * 0.9);
      for (const sd of [-1, 1]) cone([cx + face * R * 0.3, hy - R * 0.6, sd * R * 0.25], [cx + face * R * (0.6 + v1 * 0.3), hy - R * (1.5 + v1 * 0.6), sd * R * (0.75 + v2 * 0.4)], R * 0.12, trim, 'gold');
      const g = P(cx + face * R * 0.75, hy - R * 0.66, R * 0.5), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, g[0], g[1], g[2], D(R * 0.22, 0, 0), D(0, 0, 1.2), D(0, R * 0.22, 0)); dress(it, gold, 'gold');
    } else if (type === 2) {                                                                                   // tech: a glowing visor strip, ear pods, antenna fins
      const vb = P(cx + face * R * 0.2, hy - R * 0.44, R * 0.66), g = glItem(GL3D.mesh.box); M4.basis(g.m, vb[0], vb[1], vb[2], D(R * 1.1, 0, 0), D(0, -2.2, 0), D(0, 0, 1.5)); glowIt(g, trim, 1.4, 0.4);
      for (const sd of [-1, 1]) { const q = P(cx, hy - R * 0.15, sd * R), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, q[0], q[1], q[2], D(R * 0.32, 0, 0), D(0, -R * 0.32, 0), D(0, 0, 4)); dress(it, gold, 'gold');
        glowSph(cx, hy - R * 0.15, sd * R * 1.08, 2.4, trim, 1.3, 0.8); }
      for (let i = 0; i < 2 + h % 2; i++) cone([cx + back * R * (0.2 + i * 0.25), cy - R * 0.5, cz], [cx + back * R * (0.6 + i * 0.3 + v1 * 0.3), cy - R * (1.1 + v2 * 0.4) + i * 4, cz], R * 0.1, trim, 'metal');
    } else {                                                                                                   // crown-helm: a ring of spikes + a glowing gem
      const n = 5 + h % 4;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, bx = cx + Math.cos(a) * R * 0.8, bz = cz + Math.sin(a) * R * 0.8;
        cone([bx, cy - R * 0.32, bz], [bx + Math.cos(a) * R * 0.25, cy - R * (0.95 + v1 * 0.5), bz + Math.sin(a) * R * 0.25], R * 0.13, i % 2 ? trim : gold, 'gold'); }
      const gp = P(cx + face * R * 0.8, hy - R * 0.55, R * 0.5), g = glItem(GL3D.mesh.octa); M4.basis(g.m, gp[0], gp[1], gp[2], D(4.5, 0, 0), D(0, -6.5, 0), D(0, 0, 3)); glowIt(g, trim, 1.6, 0.5);
    }
  }
  /* ---------- skin 2 (Void Reaver): spiked obsidian armour — spiked pauldrons, a spiked collar, a row of spine spikes,
   *            knuckle and knee spikes; spike count and length are tuned per fighter ---------- */
  function spikedArmor3D() {
    const h = skinSeed(c.id), L = 1 + ((h >> 2) % 5) * 0.12, steel = flash ? [1, 1, 1] : col3('#1c1820'), edge = col3('#ff2238');
    const spike = (b, dir, len, r, glow) => { const tip = [b[0] + dir[0] * len, b[1] + dir[1] * len, b[2] + dir[2] * len]; cone(b, tip, r, steel, 'metal'); if (glow) glowSph(tip[0], tip[1], tip[2], r * 0.5, edge, 0.9, 1); };
    for (const [sp, z] of [[S.shB, -zA * 0.6], [S.shF, zA * 0.6]]) {
      const pr = lw * 1.5 + 3; sph(sp[0], sp[1] - 2, z, pr, steel, 'metal');
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.65; spike([sp[0] + Math.cos(a) * pr * 0.8, sp[1] - 2 + Math.sin(a) * pr * 0.8, z], [Math.cos(a), Math.sin(a), z > 0 ? 0.3 : -0.3], (8 + (k % 2) * 4) * L, 3, k === 1); }
    }
    const ny = ty - th / 2 - 1; for (let k = 0; k < 4; k++) { const zz = (k - 1.5) * tw * 0.24; spike([back * 3, ny, zz], [back * 0.3, -1, 0], 6.5 * L, 2.2, false); }
    const ns = 3 + h % 3; for (let k = 0; k < ns; k++) { const y = ty - th * 0.4 + k * th * 0.8 / Math.max(1, ns - 1); spike([back * tw * 0.42, y, -tw * 0.1], [back, -0.35, 0], (10 - k * 1.2) * L, 2.8, k === 0); }
    for (const [p, z] of [[fa, zA], [ba, -zA]]) for (const k of [-1, 1]) spike([p[0] + face * (lw + 1), p[1] + k * 2.5, z], [face, -0.15, 0], 6 * L, 1.6, false);
    if (jointed) for (const [kn, z] of [[S.knF, zL], [S.knB, -zL]]) spike([kn[0] + face * rL, kn[1], z], [face, -0.2, 0], 7 * L, 2.4, false);
  }
  // the Gold Crusader on Totem: a gold war-bonnet band round the topmost carved face
  function totemCrown() {
    const top = hy - R * 2.35, gl2 = flash ? [1, 1, 1] : col3('#ffcf3a'), p = P(hx, top - R * 0.55, 0), it = glItem(GL3D.mesh.torus);
    M4.basis(it.m, p[0], p[1], p[2], U(R * 1.1, 0, 0), U(0, R * 0.6, 0), U(0, 0, R * 1.0)); dress(it, gl2, 'gold');
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2, x = hx + Math.sin(a) * R * 1.05; cone([x, top - R * 0.6, -R * 0.3], [x + Math.sin(a) * 10, top - R * 1.6 - (3 - Math.abs(i - 3)) * 3, -R * 0.4], R * 0.16, gl2, 'gold'); }
    glowSph(hx + face * R * 0.9, top - R * 0.55, R * 0.6, 2.6, altC, 1.4, 0.8);
  }
  // the Gold Crusader on Monolith: no helmet fits an obelisk, so it wears a jewelled gold band with four spikes instead
  function obeliskCrown() {
    const cy = hy - R * 0.25 + Math.sin(t * 0.04 + f.id) * 2 - R * 0.9, p = P(hx, cy, 0), it = glItem(GL3D.mesh.torus), gl2 = flash ? [1, 1, 1] : col3('#ffcf3a');
    M4.basis(it.m, p[0], p[1], p[2], U(R * 1.05, 0, 0), U(0, R * 0.9, 0), U(0, 0, R * 0.9)); dress(it, gl2, 'gold');
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, x = hx + Math.cos(a) * R * 1.0, z = Math.sin(a) * R * 0.85; cone([x, cy - 2, z], [x, cy - R * 0.9, z], R * 0.16, gl2, 'gold'); glowSph(x, cy - R * 0.95, z, 2, altC, 1.3, 0.8); }
  }
  /* ---------- the Battle Pass skins (3 Prism Shard · 4 Mech Frame · 5 Celestial · 6 Neon Legend): each adds real geometry,
   *            tuned per fighter by its seed ---------- */
  function passSkin3D(k) {
    const h = skinSeed(c.id), NI = { noInk: true };
    // an elongated crystal (flat-shaded octahedron) from local point (x, y, z) along local direction (dx, dy) — y DOWN
    const crystal = (x, y, z, dx, dy, L, w, col, e) => { const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const p = P(x + dx * L * 0.5, y + dy * L * 0.5, z), it = glItem(GL3D.mesh.octa);
      M4.basis(it.m, p[0], p[1], p[2], D(dx * L * 0.5, dy * L * 0.5, 0), D(dy * w, -dx * w, 0), D(0, 0, w)); return dress(it, col, 'crystal', { emis: e === undefined ? 0.3 : e }); };
    if (k === 3) {                                                                                            // Prism Shard: crystal growths + a ring of shards
      const cr = flash ? [1, 1, 1] : mix3(col3('#8ff0ff'), selfC, 0.3), n = 3 + h % 2;
      for (const [sp, z] of [[S.shB, -zA * 0.6], [S.shF, zA * 0.6]]) for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + back * 0.25; crystal(sp[0], sp[1] - 3, z, Math.cos(a), Math.sin(a), 20 + (i % 2) * 9, 5, cr, 0.45); }
      for (let i = 0; i < 3; i++) crystal(back * tw * 0.42, ty - th * 0.3 + i * 10, -tw * 0.1, back, -0.55, 22 - i * 4, 5, cr, 0.45);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.38; crystal(hx + Math.cos(a) * R * 0.75, hy + Math.sin(a) * R * 0.75, 0, Math.cos(a), Math.sin(a), 13 + (2 - Math.abs(i - 2)) * 7, 3.6, cr, 0.6); }
      for (let i = 0; i < 6; i++) { const a = t * 0.05 + i * TAU / 6, p = P(Math.cos(a) * (tw * 0.8 + 8), ty + 10 + Math.sin(a * 3) * 3, Math.sin(a) * (tw * 0.8 + 8)), it = glItem(GL3D.mesh.octa), B = rb(a, t * 0.1, 3.4 * s);
        M4.basis(it.m, p[0], p[1], p[2], B[0], V3.scale(B[1], 1.8), B[2]); glowIt(it, i % 2 ? selfC : [0.85, 1, 1], 1.1, 0.6); }
    } else if (k === 4) {                                                                                     // Mech Frame: chrome plates, pistons, a jetpack
      const ch = flash ? [1, 1, 1] : col3('#d2dae8'), dk = col3('#3a4252');
      box(0, ty - 2, tw * 0.36, tw * 0.82, th * 0.62, 7, ch, 'chrome');
      glowSph(0, ty - 4, tw * 0.36 + 4, 4.5 + Math.sin(t * 0.3) * 0.8, selfC, 1.5, 0.7);
      for (const sd of [-1, 1]) box(sd * tw * 0.22, ty + th * 0.18, tw * 0.36 + 3.6, 6, 2.2, 1, selfC, null, NI);
      const pm = sgMesh('skin:pauld', () => GEO.superellipsoid(0.3, 0.3, 28, 20));
      for (const [sp, z] of [[S.shB, -zA * 0.6], [S.shF, zA * 0.6]]) { const p = P(sp[0], sp[1] - 3, z), it = glItem(pm); M4.basis(it.m, p[0], p[1], p[2], U(lw * 1.9 * s, 0, 0), U(0, lw * 1.3 * s, 0), U(0, 0, lw * 1.7 * s)); dress(it, ch, 'chrome'); }
      if (jointed) for (const [a, b2, z] of [[S.elF, fa, zA], [S.elB, ba, -zA], [S.knF, fr, zL], [S.knB, fl, -zL]]) {
        const A2 = [a[0] + (b2[0] - a[0]) * 0.25, a[1] + (b2[1] - a[1]) * 0.25], B2 = [a[0] + (b2[0] - a[0]) * 0.8, a[1] + (b2[1] - a[1]) * 0.8];
        dress(glSegment(P(A2[0], A2[1], z), P(B2[0], B2[1], z), lw * 1.05 * s, lw * 1.05 * s, GL3D.mesh.cylCap), ch, 'chrome'); }
      for (const sd of [-0.3, 0.3]) { seg([back * (tw * 0.45 + 6), ty - th * 0.3, sd * tw], [back * (tw * 0.45 + 6), ty + th * 0.2, sd * tw], 4.5, dk, 'chrome');
        if (!onGround || f.jetT > 0) glowIt(glSegment(P(back * (tw * 0.45 + 6), ty + th * 0.22, sd * tw), P(back * (tw * 0.45 + 6), ty + th * 0.22 + 14 + Math.random() * 8, sd * tw), 3.6 * s, 3.6 * s, GL3D.mesh.cone), selfC, 1.4, 0.6); }
      const vb = P(...hd(0.32, 0.15, 0.85, 1.04)), g = glItem(GL3D.mesh.box); M4.basis(g.m, vb[0], vb[1], vb[2], D(R * 1.3, 0, 0), D(0, -2.4, 0), D(0, 0, 1.4)); glowIt(g, selfC, 1.5, 0.4);
    } else if (k === 5) {                                                                                     // Celestial: a starry halo, orbit rings, a constellation
      const gold2 = col3('#ffe08a'), hc = P(hx + back * 3, hy - 2, -R * 0.7), it = glItem(GL3D.mesh.torus), hr = R * 1.55;
      M4.basis(it.m, hc[0], hc[1], hc[2], D(hr, 0, 0), D(0, 0, hr * 0.08), D(0, hr, 0)); glowIt(it, gold2, 0.9, 0.5);
      for (let i = 0; i < 8; i++) { const a = t * 0.01 + i * TAU / 8, p = P(hx + back * 3 + Math.cos(a) * hr, hy - 2 + Math.sin(a) * hr, -R * 0.7), st = glItem(GL3D.mesh.star), B = rb(a, 0, (i % 2 ? 2.4 : 3.6) * s);
        M4.basis(st.m, p[0], p[1], p[2], B[0], B[1], B[2]); glowIt(st, i % 2 ? [1, 1, 1] : gold2, 1.4, 0.6); }
      for (let r2 = 0; r2 < 2; r2++) { const p = P(0, ty, 0), ri = glItem(GL3D.mesh.torus), rr = tw * (0.85 + r2 * 0.18), a = t * 0.012 * (r2 ? -1 : 1), tl = 0.45 + r2 * 0.5;
        M4.basis(ri.m, p[0], p[1], p[2], U(Math.cos(a) * rr, Math.sin(tl) * 0.3 * rr, Math.sin(a) * rr), U(0, rr * 0.06, 0), U(-Math.sin(a) * rr, 0, Math.cos(a) * rr)); glowIt(ri, r2 ? [0.6, 0.8, 1] : gold2, 0.8, 0.5); }
      const cs = [0, 1, 2, 3, 4].map(i => [(hash(h * 0.001 + i * 3.1) - 0.5) * tw * 0.7, ty + (hash(h * 0.002 + i * 7.3) - 0.5) * th * 0.7]);
      for (let i = 0; i < cs.length; i++) { glowSph(cs[i][0], cs[i][1], tw * 0.46, 1.8 + ((t >> 3) + i) % 3 * 0.4, [1, 1, 1], 1.4, 0.8);
        if (i) glowIt(glSegment(P(cs[i - 1][0], cs[i - 1][1], tw * 0.45), P(cs[i][0], cs[i][1], tw * 0.45), 0.4 * s, 0.4 * s), gold2, 0.8, 0.4); }
    } else if (k === 6) {                                                                                     // Neon Legend: a crown of light, light wings, aura flames
      const bob = Math.sin(t * 0.06) * 1.5, cp = P(hx, hy - R - 7 + bob, 0), cr = glItem(GL3D.mesh.torus);
      M4.basis(cr.m, cp[0], cp[1], cp[2], U(R * 0.85, 0, 0), U(0, R * 0.22, 0), U(0, 0, R * 0.85)); glowIt(cr, [1, 0.9, 0.5], 1.5, 0.5);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 0.02, x = hx + Math.cos(a) * R * 0.85, z = Math.sin(a) * R * 0.85; glowIt(glSegment(P(x, hy - R - 7 + bob, z), P(x, hy - R - 16 - (i % 2) * 5 + bob, z), 1 * s, 1 * s, GL3D.mesh.cone), [1, 0.92, 0.6], 1.4, 0.5); }
      for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + back * (0.3 + i * 0.28) + Math.sin(t * 0.08) * 0.08, L = 34 - i * 4, b0 = [back * tw * 0.25, ty - th * 0.3, sd * 3 - bw * 0.4];
        glowIt(glSegment(P(...b0), P(b0[0] + Math.cos(a) * L, b0[1] + Math.sin(a) * L, b0[2]), 1.6 * s, 0.6 * s, GL3D.mesh.taper), i % 2 ? [1, 1, 1] : selfC, 1.1, 0.5); }
      for (let i = 0; i < 5; i++) { const u = ((t * 0.025 + i / 5) % 1), x = (i - 2) * tw * 0.22, hgt = 22 * (1 - u) + 6; glowIt(glSegment(P(x, 2 - u * 30, -4), P(x + Math.sin(t * 0.2 + i) * 3, 2 - u * 30 - hgt, -4), 4 * (1 - u) * s + 0.5, 4 * (1 - u) * s + 0.5, GL3D.mesh.cone), selfC, 0.6 * (1 - u), 0.6); }
    }
  }
  // the Void Reaver's claws for fighters with no weapon: three burning red blades from each fist
  function claws3D(p, z) {
    for (const k of [-1, 0, 1]) { const a = [p[0] + face * (lw + 1), p[1] + k * 3.4, z], b = [p[0] + face * (lw + 14), p[1] + k * 5 - 3, z];
      glowIt(glSegment(P(...a), P(...b), 1.7 * s, 1.7 * s, GL3D.mesh.cone), col3('#ff2238'), 1.3, 0.6); }
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
      for (let i = 0; i < 5; i++) { const x = hx + (i - 2) * R * 0.45; glowIt(glSegment(P(x, hy - R - 4 + bob, 0), P(x, hy - R - 10 - (2 - Math.abs(i - 2)) * 4 + bob, 0), 0.9 * s, 0.9 * s), C(o.col), 1.2, 0.4); } },
    /* ---- the v11 newcomers: parametric surfaces and solids (render/scene.js geometry) ---- */
    // AXIOM: a Möbius-strip halo (one surface, a half twist), three orbiting Platonic solids and a geodesic icosahedral cage
    mobius: o => { const a = t * 0.025, r = R * 1.05, tl = 0.62, ct = Math.cos(tl), st = Math.sin(tl), p = P(hx, hy - R - 12 + Math.sin(t * 0.05) * 1.5, 0), it = glItem(sgMesh('acc:mobius', () => GEO.mobius(0.3)));
      // the strip spins about its own axis, tilted toward the camera so the half twist reads
      const X = [Math.cos(a) * r, 0, Math.sin(a) * r], Z = [-Math.sin(a) * r, 0, Math.cos(a) * r], tilt = v => [v[0], v[1] * ct - v[2] * st, v[1] * st + v[2] * ct];
      const Xt = tilt(X), Yt = tilt([0, r, 0]), Zt = tilt(Z);
      M4.basis(it.m, p[0], p[1], p[2], U(...Xt), U(...Yt), U(...Zt));
      dress(it, C(o.col), 'brass', { emis: 0.4, metal: 0.8 }); it.cull = false; it.outline = 1.1 * s; },
    platonic: o => { const meshes = [sgMesh('acc:tetra', () => GEO.tetra()), GL3D.mesh.box, GL3D.mesh.octa];
      for (let i = 0; i < 3; i++) { const a = t * 0.04 + i * TAU / 3, rr = R + 15, x = hx + Math.cos(a) * rr, y = hy - 4 + Math.sin(a * 2 + i) * 4, z = Math.sin(a) * rr, sc = (i === 1 ? 3.6 : 4.6) * s;
        const p = P(x, y, z), it = glItem(meshes[i]), B = rb(t * 0.07 + i, t * 0.05 + i * 2, sc); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]);
        dress(it, i === 1 ? altC : C(o.col), 'gloss', { emis: 0.45 }); it.outline = 0.9 * s; } },
    geoCage: o => { const a = t * 0.012, ca = Math.cos(a), sa = Math.sin(a), rr = R * 1.32, V = ICOSA.V.map(v => [v[0] * ca + v[2] * sa, v[1], -v[0] * sa + v[2] * ca]);
      for (const [i, j] of ICOSA.E) { const A = V[i], B2 = V[j]; glowIt(glSegment(P(hx + A[0] * rr, hy - A[1] * rr, A[2] * rr), P(hx + B2[0] * rr, hy - B2[1] * rr, B2[2] * rr), 0.45 * s, 0.45 * s), C(o.col), 0.55, 0.5); } },
    // RIPTIDE: a breaking-wave crest of water hair (one Catmull-Rom tube curling over), a Bézier-surface surfboard, glowing gills
    waveCrest: o => { const K = [[-0.3, -0.7], [0.3, -1.25], [1.0, -1.45], [1.6, -1.15], [1.8, -0.6], [1.45, -0.3], [1.15, -0.55], [1.3, -0.8]], pts = [];
      K.forEach(([ox, oy], i) => pts.push(P(hx + back * ox * R + Math.sin(t * 0.1 + i) * 1.2, hy + oy * R + Math.cos(t * 0.12 + i) * 1.2, -R * 0.15)));
      const it = chainTube(pts, u => R * (0.46 - 0.34 * u) * s, O3, REF, 3); if (it) dress(it, C(o.col), 'slime', { alpha: 0.9, emis: 0.3 });
      for (let i = 1; i < 5; i++) { const q = K[i]; sph(hx + back * q[0] * R, hy + q[1] * R - R * 0.22, -R * 0.1 + 2, 2.2 - i * 0.25, [0.95, 1, 1], 'gloss', { noInk: true, emis: 0.4 }); } },
    surfboard: o => { const L = 78, cx = back * (tw * 0.5 + 5), cy = ty - 4, p = P(cx, cy, -bw * 0.55), e = 0.35, it = glItem(sgMesh('acc:board', () => GEO.surfboard()));
      M4.basis(it.m, p[0], p[1], p[2], U(back * Math.sin(e) * L, Math.cos(e) * L, 0), U(back * Math.cos(e) * L, -Math.sin(e) * L, 0), U(0, 0, -back * L));
      dress(it, C(o.col), 'gloss', { metal: 0.05 }); it.cull = false;
      const q = P(cx + back * 1.5, cy, -bw * 0.55), st = glItem(GL3D.mesh.box); M4.basis(st.m, q[0], q[1], q[2], U(back * Math.sin(e) * 62, Math.cos(e) * 62, 0), U(back * Math.cos(e) * 1.4, -Math.sin(e) * 1.4, 0), U(0, 0, 3.2)); glowIt(st, C(o.stripe), 1, 0.5); },
    gills: o => { for (let k = 0; k < 3; k++) glowIt(glSegment(P(hx + back * R * 0.5, hy + R * 0.5 + k * 3, R * 0.6), P(hx + back * R * 0.12, hy + R * 0.58 + k * 3, R * 0.78), 0.7 * s, 0.7 * s), C(o.col), 1.1, 0.5); },
    // MONOLITH: the head is a floating superellipsoid obelisk with a gold capstone and one rune eye; rune bands and orbiting slabs
    obeliskHead: o => { const bob = Math.sin(t * 0.04 + f.id) * 2, cy = hy - R * 0.25 + bob, p = P(hx, cy, 0), it = glItem(sgMesh('acc:obelisk', () => GEO.superellipsoid(0.14, 0.32, 32, 28), true));
      M4.basis(it.m, p[0], p[1], p[2], U(R * 0.95, 0, 0), U(0, R * 1.55, 0), U(0, 0, R * 0.8)); dress(it, albC, 'stone'); it.outMesh = it.mesh.outline;
      const q = P(hx, cy - R * 1.55, 0), cap = glItem(sgMesh('acc:pyr4', () => geoFlat(GEO.cylinder(4, true, 0.001)))); M4.basis(cap.m, q[0], q[1], q[2], U(R * 0.7, 0, R * 0.7), U(0, R * 0.75, 0), U(-R * 0.7, 0, R * 0.7));
      dress(cap, gold ? col3('#ffe9a0') : col3('#ffcf3a'), 'gold', { emis: 0.2 });
      const ey = P(hx + face * R * 0.35, cy - R * 0.35, R * 0.78), eg = glItem(GL3D.mesh.box); M4.basis(eg.m, ey[0], ey[1], ey[2], D(R * 0.75, 0, 0), D(0, -R * 0.12, 0), D(0, 0, 1)); glowIt(eg, C(o.eye), 1.8, 0.4);
      for (let k = 0; k < 3; k++) { const gq = P(hx + face * R * 0.1, cy + R * (0.15 + k * 0.32), R * 0.8), g2 = glItem(GL3D.mesh.box); M4.basis(g2.m, gq[0], gq[1], gq[2], D(R * (0.3 - k * 0.06), 0, 0), D(0, -1.6, 0), D(0, 0, 1)); glowIt(g2, C(o.eye), 0.9, 0.4); } },
    runeBands: o => { for (const [k, dy] of [[0, -th * 0.18], [1, th * 0.22]]) { const r = tw * (0.62 - k * 0.04), p = P(0, ty + dy, 0), it = glItem(GL3D.mesh.torus), a = t * 0.01 * (k ? -1 : 1), tl = 0.12 + k * 0.1;
      M4.basis(it.m, p[0], p[1], p[2], U(Math.cos(a) * r, tl * r * 0.3, Math.sin(a) * r), U(0, r * 0.22, 0), U(-Math.sin(a) * r, 0, Math.cos(a) * r)); glowIt(it, C(o.col), 0.9, 0.5); } },
    floatSlabs: o => { for (let i = 0; i < 3; i++) { const a = t * 0.025 + i * TAU / 3, x = Math.cos(a) * (tw * 0.95), z = Math.sin(a) * tw * 0.8, y = ty - th * 0.45 + Math.sin(t * 0.05 + i) * 4;
      const p = P(x, y, z), it = glItem(GL3D.mesh.rbox), B = rb(a, 0.3 * Math.sin(t * 0.03 + i), 1); M4.basis(it.m, p[0], p[1], p[2], V3.scale(B[0], 10 * s), V3.scale(B[1], 15 * s), V3.scale(B[2], 6 * s)); dress(it, C(o.col), 'stone'); } },
    // ORIGAMI: folded-paper crane wings (flat-shaded mountain / valley creases), a folded kabuto, a pleated fan
    craneWings: o => { const m = sgMesh('acc:pwing', () => GEO.paperWing(5), true);
      for (const [sd, z] of [[0, -bw * 0.42], [1, -bw * 0.7]]) { const e = 0.25 + 0.3 * Math.sin(t * (onGround ? 0.06 : 0.22) + sd * 1.3) + sd * 0.15, L = 40 - sd * 6, p = P(back * tw * 0.2, ty - th * 0.35, z), it = glItem(m);
        M4.basis(it.m, p[0], p[1], p[2], U(back * Math.cos(e) * L, Math.sin(e) * L, 0), U(-back * Math.sin(e) * L, Math.cos(e) * L, 0), U(0, 0, L * 0.7)); dress(it, C(o.col), 'cloth'); it.cull = false; it.outMesh = m.outline; } },
    foldHat: o => { const pm = sgMesh('acc:pyr4', () => geoFlat(GEO.cylinder(4, true, 0.001))), w = R * 0.95, p = P(hx, hy - R * 0.6, 0), it = glItem(pm);
      M4.basis(it.m, p[0], p[1], p[2], U(w, 0, w * 0.15), U(0, R * 0.95, 0), U(-w * 0.15, 0, w)); dress(it, C(o.col), 'cloth');
      for (const sd of [-1, 1]) { const q = P(hx + sd * R * 0.55, hy - R * 0.85, R * 0.2), h3 = glItem(sgMesh('acc:pyr3', () => geoFlat(GEO.cylinder(3, true, 0.001))));
        M4.basis(h3.m, q[0], q[1], q[2], U(sd * 3.2 + back * 1, 1.5, 0), U(sd * 6, R * 0.85, 0), U(0, 0, 3)); dress(h3, altC, 'cloth'); } },
    paperFan: o => { const r = 26, b = 0.5 + Math.sin(t * 0.05) * 0.08, p = P(back * (tw * 0.45 + 2), ty - th * 0.15, -bw * 0.55), it = glItem(sgMesh('acc:fan', () => GEO.fanFold(10), true));
      M4.basis(it.m, p[0], p[1], p[2], U(back * Math.cos(b) * r, Math.sin(b) * r, 0), U(-back * Math.sin(b) * r, Math.cos(b) * r, 0), U(0, 0, r)); dress(it, C(o.col), 'silk'); it.cull = false;
      glowSph(back * (tw * 0.45 + 2), ty - th * 0.15, -bw * 0.55 + 1, 2.2, selfC, 1.1, 0.8); },
    // COMET: a blazing tail streaming from the head against the direction of travel, and little stars in orbit
    cometHead: o => { const sp = Math.hypot(f.vx || 0, f.vy || 0); let dx = back, dy = -0.35;
      if (sp > 2) { dx = -f.vx / sp; dy = -f.vy / sp; } const L = R * (2.2 + Math.min(sp, 12) * 0.25), nx = -dy, ny = dx, pts = [], core = [];
      for (let i = 0; i <= 7; i++) { const u = i / 7, w = Math.sin(t * 0.3 + u * 6) * u * 3, x = hx + dx * L * u + nx * w, y = hy - R * 0.25 + dy * L * u + ny * w; pts.push(P(x, y, -R * 0.2)); if (i <= 5) core.push(P(x, y, -R * 0.2 + 1)); }
      const it = chainTube(pts, u => R * (0.95 - 0.85 * u) * s, O3, REF, 3); if (it) glowIt(it, C(o.col), 0.95, 0.7);
      const ic = chainTube(core, u => R * (0.45 - 0.4 * u) * s, O3, REF, 3); if (ic) glowIt(ic, C(o.core), 0.9, 0.5); },
    orbitStars: o => { for (let i = 0; i < 3; i++) { const a = t * 0.07 + i * TAU / 3, p = P(Math.cos(a) * (tw * 0.75 + 6), ty + 6 + Math.sin(a * 2) * 3, Math.sin(a) * (tw * 0.75 + 6)), it = glItem(GL3D.mesh.star), sc = 4 * s;
      const B = rb(t * 0.1 + i, 0, sc); M4.basis(it.m, p[0], p[1], p[2], B[0], B[1], B[2]); glowIt(it, C(o.col), 1.4, 0.6); } },
    /* ---- v13: the Item Shop fighters ---- */
    // DJINN: a jewelled turban with a plume, gold arm cuffs, a swirling smoke tail instead of legs, a golden lamp in orbit
    turban: o => { for (let k = 0; k < 3; k++) torus(hx - face * 1, hy - R * (0.42 + k * 0.2), -R * 0.05, R * (1.06 - k * 0.14), C(o.col), 0.12 * face, 'silk', null, R * (0.98 - k * 0.12));
      ell(hx, hy - R * 0.92, -R * 0.08, R * 0.82, R * 0.42, R * 0.8, C(o.col), 'silk');
      const g = P(...hd(0.35, 0.62, 0.88, 1.08)), it = glItem(GL3D.mesh.octa); M4.basis(it.m, g[0], g[1], g[2], D(3, 0, 0), D(0, -4.4, 0), D(0, 0, 2)); glowIt(it, C(o.gem), 1.6, 0.6);
      for (let i = 0; i < 3; i++) { const u = i / 2; cone([hx + face * R * 0.3, hy - R * 0.9, R * 0.5], [hx + back * (4 + i * 5), hy - R - 12 - u * 6 + Math.sin(t * 0.1 + i) * 1.5, R * 0.1 - i * 2], R * 0.12, C(o.plume), 'silk', { noInk: true }); } },
    cuffs: o => { if (!jointed) return; for (const [el, hand, z] of [[S.elF, fa, zA], [S.elB, ba, -zA]]) { const q = [el[0] + (hand[0] - el[0]) * 0.62, el[1] + (hand[1] - el[1]) * 0.62];
      dress(glSegment(P(q[0], q[1], z), P(q[0] + (hand[0] - el[0]) * 0.22, q[1] + (hand[1] - el[1]) * 0.22, z), lw * 1.08 * s, lw * 1.08 * s, GL3D.mesh.cylCap), C(o.col), 'gold'); } },
    smokeTail: o => { const pts = [], sw = Math.sin(t * 0.08 + f.id) * 6, hipY = ty + th * 0.48;
      for (let i = 0; i <= 8; i++) { const u = i / 8, x = back * (u * u * 26) + Math.sin(u * 5 + t * 0.12) * (3 + u * 5) + sw * u, y = hipY + u * 34 - u * u * 12; pts.push(P(x, y, -2 - u * 6)); }
      const it = chainTube(pts, u => (tw * 0.42 * (1 - u * 0.86) + 0.8) * s, O3, REF, 3); if (it) dress(it, mix3(albC, selfC, 0.35), 'silk', { alpha: 0.9, emis: 0.25 });
      for (let i = 0; i < 3; i++) { const q = ((t * 0.02 + i / 3) % 1); glowSph(back * (26 + q * 10) + Math.sin(q * 6 + i) * 4, hipY + 22 - q * 8, -8, 3 + q * 6, selfC, (1 - q) * 0.45, -1.2); } },
    lampOrbit: o => { const a = t * 0.045 + f.id, r = tw * 0.9 + 10, x = Math.cos(a) * r, z = Math.sin(a) * r, y = ty - th * 0.2 + Math.sin(t * 0.07) * 4, L = C(o.col);
      ell(x, y, z, 7, 3.6, 4.8, L, 'gold'); ell(x, y - 3.4, z, 2.8, 1.8, 2.8, L, 'gold'); cone([x + 5, y, z], [x + 12, y - 3, z], 1.7, L, 'gold'); glowSph(x + 12.5, y - 3.5, z, 2.4, selfC, 1.2, 0.8); },
    // SCARAB: a domed iridescent carapace split down the middle, a rhinoceros horn and a golden sun disc behind the head
    beetleShell: o => { for (const sd of [-1, 1]) { const p = P(back * tw * 0.22, ty - th * 0.08, sd * tw * 0.2 - bw * 0.2), it = glItem(sgMesh('acc:elytra', () => GEO.superellipsoid(0.55, 0.9, 32, 22)));
        M4.basis(it.m, p[0], p[1], p[2], U(back * tw * 0.48, 0, 0), U(0, th * 0.62, 0), U(0, 0, tw * 0.26)); dress(it, C(o.col), 'gloss', { metal: 0.65, spec: 1.3 }); it.rimK = 1.2; it.rimCol = col3(o.rim === 'alt' ? (c.alt || '#ffffff') : o.rim); }
      glowIt(glSegment(P(back * tw * 0.25, ty - th * 0.62, -bw * 0.2), P(back * tw * 0.25, ty + th * 0.5, -bw * 0.2), 0.9 * s, 0.9 * s), altC, 0.9, 0.5);
      torus(0, ty + th * 0.36, 0, tw * 0.52, altC, 0, 'gold', { noInk: true }, tw * 0.46); },
    beetleHorn: o => { const b = hd(0.55, 0.55, 0.62, 0.9), m = [hx + face * (R + 4), hy - R - 2, R * 0.4], tp = [hx + face * (R - 2), hy - R - 15, R * 0.3];
      seg(b, m, R * 0.26, C(o.col), 'gloss'); cone(m, tp, R * 0.22, C(o.col), 'gloss'); cone(hd(0.1, 0.8, 0.3, 0.86), [hx + back * 2, hy - R - 6, R * 0.1], R * 0.14, C(o.col), 'gloss'); },
    sunDisc2: o => { const p = P(hx + back * 3, hy - R * 0.3, -R * 0.75), it = glItem(GL3D.mesh.cylCap); M4.basis(it.m, p[0], p[1], p[2], D(R + 7, 0, 0), D(0, 0, 1.6), D(0, R + 7, 0)); dress(it, C(o.col), 'gold', { emis: 0.35 });
      glowSph(hx + back * 3, hy - R * 0.3, -R * 0.75, R + 9, C(o.col), 0.35, -1.6); },
    // LUMEN: a translucent jellyfish bell over the head with a frilled rim, trailing tentacles and bioluminescent spots
    jellyBell: o => { const pulse = 1 + Math.sin(t * 0.09 + f.id) * 0.06, p = P(hx, hy - R * 0.2, 0), it = glItem(GL3D.mesh.sphere);
      M4.basis(it.m, p[0], p[1], p[2], U(R * 1.45 * pulse, 0, 0), U(0, R * 1.15 / pulse, 0), U(0, 0, R * 1.35 * pulse)); dress(it, C(o.col), 'gloss', { alpha: 0.55, emis: 0.45, noInk: true }); it.rimK = 1.4; it.rimCol = altC;
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = hx + Math.cos(a) * R * 1.4 * pulse, z = Math.sin(a) * R * 1.3 * pulse; sph(x, hy + R * 0.35, z, 2.6, C(o.rim), 'gloss', { noInk: true, emis: 0.6 }); }
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + t * 0.02; glowSph(hx + Math.cos(a) * R * 0.7, hy - R * 0.55, Math.sin(a) * R * 0.7, 2.2, altC, 1.3, 0.8); } },
    tentacles: o => { for (let k = 0; k < 6; k++) { const a = (k / 5 - 0.5) * 2.4, x0 = hx + Math.sin(a) * R * 1.1, z0 = Math.cos(a) * R * 0.6 - R * 0.4, pts = [];
        for (let i = 0; i <= 6; i++) { const u = i / 6, w = Math.sin(u * 4 + t * 0.12 + k) * 4 * u; pts.push(P(x0 + back * u * 10 + w, hy + R * 0.4 + u * (th + 16), z0 - u * 4)); }
        const it = chainTube(pts, u => (1.8 - u * 1.3) * s, O3, REF, 3); if (it) glowIt(it, k % 2 ? C(o.col) : altC, 0.7, 0.8); } },
    glowSpots: o => { for (let i = 0; i < 6; i++) glowSph((hash(i * 2.3) - 0.5) * tw * 0.7, ty + (hash(i * 5.1) - 0.5) * th * 0.7, tw * 0.45, 1.8 + ((t >> 3) + i) % 3 * 0.4, C(o.col), 1.3, 0.8); },
    // TOTEM: three carved faces stacked into one totem head (scowling · grinning · roaring), a feather crest on top
    totemStack: o => { const sk = f.skin || 0, hatted = sk === 1 || (sk >= SHOP_SKIN0 && SHOP_SKINS[sk - SHOP_SKIN0].head);   // (a skin's headgear sits on the top face instead of the feathers)
      const cols = sk ? [albC, mix3(albC, C(o.mid), 0.35), mix3(albC, C(o.top), 0.35)] : [albC, C(o.mid), C(o.top)], h = R * 1.15, faceMat = sk ? null : 'stone';   // (skins re-carve the stack in their own material)
      for (let k = 0; k < 3; k++) { const cy = hy - k * h, p = P(hx, cy, 0), it = glItem(GL3D.mesh.cylCap), ck = flash ? [1, 1, 1] : cols[k];
        M4.basis(it.m, p[0], p[1], p[2], U(R * (1.05 - k * 0.06), 0, 0), U(0, h * 0.5, 0), U(0, 0, R * (1.0 - k * 0.06))); dress(it, ck, faceMat);
        const ey = cy - h * 0.12, glow = k === 0 ? C(o.eyes) : col3('#ffe08a');
        for (const sd of [0.18, 0.62]) { const e = P(...[hx + face * R * (sd - 0.05) * 1.2, ey, R * 0.86]), g = glItem(GL3D.mesh.box);
          M4.basis(g.m, e[0], e[1], e[2], D(R * 0.32, 0, 0), D(0, -R * (k === 1 ? 0.12 : 0.2), 0), D(0, 0, 1.2)); glowIt(g, glow, k === 0 ? 1.4 : 0.8, 0.4); }
        box(hx + face * R * 0.42, cy + h * 0.22, R * 0.88, R * (k === 2 ? 0.9 : 0.7), R * (k === 2 ? 0.34 : 0.14), 2.5, k === 2 ? [0.12, 0.04, 0.03] : col3('#2a1810'), null, { noInk: true });
        cone([hx + face * R * 0.4, cy - h * 0.02, R * 0.85], [hx + face * R * 0.4, cy + h * 0.12, R * 1.18], R * 0.15, mix3(ck, [0, 0, 0], 0.3), 'stone');
        torus(hx, cy + h * 0.48, 0, R * (1.08 - k * 0.06), C(o.band), 0, 'stone', { noInk: true }, R * (1.02 - k * 0.06)); }
      if (!hatted) for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4, x = hx + Math.sin(a) * R * 0.8, top = hy - h * 2.5; cone([x, top, -R * 0.2], [x + Math.sin(a) * 9, top - 16 - (3 - Math.abs(i - 3)) * 4, -R * 0.3], R * 0.14, i % 2 ? C(o.feather) : altC, 'silk'); }
      for (const sd of [-1, 1]) { const w = P(hx + sd * R * 1.05, hy - h * 1.2, 0), wing = glItem(GL3D.mesh.box); M4.basis(wing.m, w[0], w[1], w[2], D(sd * R * 0.7, -R * 0.25, 0), D(0, -R * 0.55, 0), D(0, 0, 3)); dress(wing, C(o.mid), 'stone'); } },
    // HIVE: compound eyes + feathery antennae, honeycomb plates, a queen's crownlet and a striped abdomen with a stinger
    hiveHead: o => { for (const sd of [0.15, 0.6]) ell(...hd(sd + 0.08, 0.1, 0.84, 0.9), R * 0.34, R * 0.42, R * 0.22, C(o.eye), 'gloss', { emis: 0.25, noInk: true });
      for (const sd of [-1, 1]) { const x0 = hx + sd * R * 0.3 + face * 2, sw = Math.sin(t * 0.14 + sd) * 2; seg([x0, hy - R + 2, R * 0.3], [x0 + face * 6 + sw, hy - R - 9, R * 0.35], 0.8, C(o.col), null, { noInk: true });
        seg([x0 + face * 6 + sw, hy - R - 9, R * 0.35], [x0 + face * 12 + sw, hy - R - 12, R * 0.3], 0.8, C(o.col), null, { noInk: true }); sph(x0 + face * 12 + sw, hy - R - 12, R * 0.3, 1.8, C(o.col), 'gloss', { noInk: true }); } },
    honeycomb: o => { const hm = sgMesh('acc:hex', () => geoFlat(GEO.cylinder(6, true)));
      for (const [x, y, z] of [[-tw * 0.18, ty - th * 0.15, tw * 0.44], [tw * 0.18, ty - th * 0.15, tw * 0.44], [0, ty + th * 0.15, tw * 0.45], [-tw * 0.36, ty + th * 0.08, tw * 0.36], [tw * 0.36, ty + th * 0.08, tw * 0.36]]) {
        const p = P(x, y, z), it = glItem(hm); M4.basis(it.m, p[0], p[1], p[2], D(5.6, 0, 0), D(0, 0, 1.4), D(0, 5.6, 0)); dress(it, C(o.col), 'gloss', { emis: 0.3, metal: 0.4, noInk: true }); } },
    crownlet: o => { const p = P(hx, hy - R * 0.92, 0), it = glItem(GL3D.mesh.torus); M4.basis(it.m, p[0], p[1], p[2], U(R * 0.55, 0, 0), U(0, R * 0.22, 0), U(0, 0, R * 0.55)); dress(it, C(o.col), 'gold');
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, x = hx + Math.cos(a) * R * 0.55, z = Math.sin(a) * R * 0.55; cone([x, hy - R * 0.95, z], [x, hy - R * 1.25, z], 1.6, C(o.col), 'gold'); } },
    stinger: o => { const b = [back * tw * 0.42, ty + th * 0.35, -bw * 0.3], p = P(b[0] + back * 10, b[1] + 6, b[2]), it = glItem(GL3D.mesh.sphere), sw = Math.sin(t * 0.1) * 0.15;
      M4.basis(it.m, p[0], p[1], p[2], D(back * 15 * Math.cos(sw), 15 * Math.sin(sw), 0), D(-back * 9 * Math.sin(sw), 9 * Math.cos(sw), 0), D(0, 0, 9)); dress(it, C(o.col), 'gloss');
      for (let k = 0; k < 3; k++) torus(b[0] + back * (4 + k * 6), b[1] + 6, b[2], 8.6 - k * 1.6, C(o.stripe), Math.PI / 2, 'gloss', { noInk: true }, 8.6 - k * 1.6);
      cone([b[0] + back * 24, b[1] + 8, b[2]], [b[0] + back * 34, b[1] + 13, b[2]], 2.4, C(o.stripe), 'metal'); }
  };
  return ACC_FN;
  }
  // a right-handed basis from two angles (spin in the screen plane · tumble), in y-up local space, scaled
  function rb(a1, a2, sc) { const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    return [U(c1 * sc, s1 * sc, 0), U(-s1 * c2 * sc, c1 * c2 * sc, s2 * sc), U(s1 * s2 * sc, -c1 * s2 * sc, c2 * sc)]; }
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
  omega: [['floatCrown', { col: 'alt' }], ['faceplate', { col: '#0a0614', big: true }], ['core', { col: 'alt' }]],
  axiom: [['mobius', { col: 'alt' }], ['platonic', { col: 'self' }], ['geoCage', { col: 'self' }], ['core', { col: 'alt' }]],
  riptide: [['waveCrest', { col: 'self' }], ['surfboard', { col: 'alt', stripe: 'self' }], ['gills', { col: 'self' }]],
  monolith: [['obeliskHead', { eye: 'alt' }], ['runeBands', { col: 'alt' }], ['floatSlabs', { col: 'self' }]],
  origami: [['craneWings', { col: 'alt' }], ['foldHat', { col: 'self' }], ['paperFan', { col: 'alt' }]],
  comet: [['cometHead', { col: 'self', core: '#ffffff' }], ['visor', { col: '#16244a', glowLine: 'alt' }], ['orbitStars', { col: 'alt' }]],
  djinn: [['turban', { col: '#f4ead8', gem: 'alt', plume: '#ff5ad8' }], ['cuffs', { col: '#ffcf4a' }], ['smokeTail', {}], ['lampOrbit', { col: '#ffcf4a' }]],
  scarab: [['beetleShell', { col: 'self', rim: 'alt' }], ['beetleHorn', { col: 'dark' }], ['sunDisc2', { col: 'alt' }]],
  lumen: [['jellyBell', { col: 'self', rim: '#ffffff' }], ['tentacles', { col: 'self' }], ['glowSpots', { col: 'alt' }]],
  totem: [['totemStack', { mid: '#a85a2a', top: '#7a3a1e', eyes: 'alt', band: 'alt', feather: '#ff5a3a' }]],
  hive: [['hiveHead', { col: '#2a1a10', eye: '#1a0e08' }], ['honeycomb', { col: '#ffe08a' }], ['crownlet', { col: '#ffcf3a' }], ['stinger', { col: 'self', stripe: '#2a1a10' }]]
};
delete ACC3D.mecha2;
