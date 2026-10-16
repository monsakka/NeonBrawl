/* NEON BRAWL — v15 "DINO NUGGI F1": the exclusive skin's Formula 1 car (WebGL, cel-shaded, ink-outlined).
 *
 * A stylised modern F1 car in a rosso-red racing livery (generic: no real team marks or logos), built procedurally around
 * the fighter so it inherits his squash & stretch, lean and spin (a double jump is a barrel roll):
 *   monocoque  one lofted elliptical sweep from the needle nose over the cockpit to the tapered engine cover
 *   sidepods   undercut superellipsoid pods with dark intakes · a carbon floor + diffuser · an airbox above the driver
 *   wings      a three-element front wing with endplates · a rear wing with a DRS flap, endplates and a swan-neck pylon
 *   halo       a carbon tube loop around the cockpit with its centre pillar · mirrors on stalks · shark fin
 *   wheels     rounded tyres with coloured sidewall bands and a rotating 5-spoke rim; they ROLL with the car's real distance
 *              travelled (angle = x / r), the fronts STEER into drifts, the suspension wishbones follow the bounce
 *   life       exhaust glow + heat shimmer when driving, glowing brake discs when braking, tyre smoke while drifting
 * The driver sits in the cockpit (fighter3d.js hides his legs; anim15.js puts his hands on the wheel).            */
'use strict';

const F1C = { red: '#d8141a', dark: '#7a0a10', carbon: '#16171f', white: '#f4f4f8', yellow: '#ffd21a', tyre: '#1a1a20', rim: '#c8ccd8' };
// the drift yaw (radians, toward the facing side) for the whole fighter: kicks out when reversing at speed, then catches
function f1DriftYaw(f) { const k = f.driftT > 0 ? f.driftT / 18 : 0; return Math.sin(k * Math.PI) * 0.75 + clamp(-f.vx * f.facing * 0.05, -0.2, 0.3) * (f.onGround ? 1 : 0.3); }

function f1Car3D(X) {
  const { P, D, U, dress, glowIt, glowSph, sph, seg, box, torus, face, s, f, t, flash, O3, LATW, S } = X;
  const C = h => col3(flash ? '#ffffff' : h), red = C(F1C.red), dark = C(F1C.dark), carbon = C(F1C.carbon), white = C(F1C.white), yellow = C(F1C.yellow), tyre = C(F1C.tyre), rimC = C(F1C.rim);
  const dy = ((S && S.oy) || 0) + ((S && S.bob) || 0), ky = (S && S.sy) || 1;               // (the driver sinks into the cockpit by oy: the car stays on the road)
  const L = (k, h, z) => [face * k, -h - dy / ky, z || 0];                               // car frame → fighter local (k forward, h up, z toward camera)
  const SLAB = sgMesh('f1:slab', () => GEO.slab(1, 1, 1, 0.22, 4), true), POD = sgMesh('f1:pod', () => GEO.superellipsoid(0.55, 0.7, 32, 20), true);
  const TYRE = sgMesh('f1:tyre', () => GEO.superellipsoid(0.32, 1, 40, 22), true);
  const slab = (k, h, z, len, ht, wd, col, mk, pitch, o) => {                         // a rounded slab, pitched about the lateral axis
    const p = P(...L(k, h, z)), it = glItem(SLAB), ca = Math.cos(pitch || 0), sa = Math.sin(pitch || 0);
    M4.basis(it.m, p[0], p[1], p[2], U(face * ca * len, sa * len, 0), U(-face * sa * ht, ca * ht, 0), U(0, 0, wd * face));   // (z flips with the facing: a right-handed basis)
    dress(it, col, mk || 'gloss', o); it.outMesh = SLAB.outline; return it; };
  const ellK = (mesh, k, h, z, rl, rh, rw, col, mk, o) => { const p = P(...L(k, h, z)), it = glItem(mesh);
    M4.basis(it.m, p[0], p[1], p[2], U(rl, 0, 0), U(0, rh, 0), U(0, 0, rw)); dress(it, col, mk || 'gloss', o); if (mesh.outline) it.outMesh = mesh.outline; return it; };

  // ---- motion state (presentation only) ----
  const spd = Math.abs(f.vx), driving = f.onGround && spd > 0.6, brake = f.onGround && spd > 2 && (f.turnT > 0 || f.driftT > 0);
  const bounce = f.onGround ? Math.sin(t * 1.3 + f.id) * Math.min(1, spd / 6) * 0.6 : 0, steer = clamp(f1DriftYaw(f) * -0.9 + Math.sin(t * 0.05) * 0.04, -0.6, 0.6);

  // ---- the monocoque: nose → cockpit → engine cover (one lofted sweep) ----
  { const n = 26, Cs = TUBE.tmpC, RX = TUBE.tmpR, RZ = TUBE.tmpZ || (TUBE.tmpZ = []);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), k = 66 - u * 114;                                          // k: 66 (nose tip) … -48 (tail)
      const hc = k > 30 ? lerp(13, 8.5, (k - 30) / 36) : k > 6 ? lerp(15.5, 13, (k - 6) / 24) : k > -16 ? lerp(18, 15.5, (k + 16) / 22) : lerp(13.5, 18, (k + 48) / 32);
      const rh = k > 30 ? lerp(5.2, 1.4, Math.pow((k - 30) / 36, 1.6)) : k > 6 ? lerp(8.5, 5.2, (k - 6) / 24) : k > -16 ? lerp(10.5, 8.5, (k + 16) / 22) : lerp(3.2, 10.5, Math.pow((k + 48) / 32, 0.7));
      const rw = k > 30 ? lerp(6.5, 1.6, Math.pow((k - 30) / 36, 1.4)) : k > 6 ? lerp(11, 6.5, (k - 6) / 24) : k > -16 ? lerp(12.5, 11, (k + 16) / 22) : lerp(4.5, 12.5, Math.pow((k + 48) / 32, 0.8));
      const p = P(...L(k, hc + bounce * 0.3, 0)), q = Cs[i] || (Cs[i] = [0, 0, 0]); q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; RX[i] = rh * s; RZ[i] = rw * s;
    }
    dress(sweepItem(Cs, RX, RZ, n, O3, LATW), red, 'gloss', { spec: 1.1 }); }
  // livery: a white nose stripe, the race number 1, yellow engine-cover flashes
  slab(46, 13.2, 0, 34, 1.4, 5, white, 'gloss', -0.12, { noInk: true });
  for (const z of [-7.2, 7.2]) { box(...L(38, 11.5, z), 1.6, 7, 0.6, white, 'gloss', { noInk: true }); box(...L(39.4, 14, z), 3, 1.4, 0.6, white, 'gloss', { noInk: true }, face * 0.6); }
  for (const z of [-11.4, 11.4]) slab(-24, 18.5, z, 22, 2, 1, yellow, 'gloss', 0.12, { noInk: true });
  // cockpit opening (dark) + steering wheel
  ellK(GL3D.mesh.sphere, 2, 23.2, 0, 13, 2.2, 8.6, carbon, 'plastic', { noInk: true });
  torus(...L(12, 22.5, 0), 4.2, carbon, Math.PI / 2 - 0.3, 'plastic', { noInk: true });
  // ---- sidepods (undercut), intakes, floor + diffuser, airbox, shark fin ----
  for (const z of [-17, 17]) { ellK(POD, -8, 11.5 + bounce * 0.3, z, 22, 7.5, 6.5, red, 'gloss');
    ellK(GL3D.mesh.sphere, 12.5, 13, z, 2.2, 5, 4.8, carbon, 'plastic', { noInk: true }); }
  slab(-2, 3.4, 0, 92, 2.4, 50, carbon, 'plastic');                                   // the floor
  slab(-46, 5, 0, 10, 4, 34, carbon, 'plastic', -0.35);                               // diffuser
  ellK(POD, -12, 28.5, 0, 8, 6, 4.6, red, 'gloss'); ellK(GL3D.mesh.sphere, -6.6, 29.5, 0, 1.6, 3.4, 3.2, carbon, 'plastic', { noInk: true });   // airbox + its intake
  slab(-30, 25, 0, 26, 7, 0.9, red, 'gloss', 0.16);                                   // shark fin
  // ---- front wing: three elements + endplates ----
  for (const [e, h, k, col] of [[0, 3.6, 66, carbon], [1, 5.6, 63, red], [2, 7.6, 60, white]]) slab(k, h, 0, 13 - e * 2, 1.4, 62 - e * 4, col, 'gloss', -0.12 - e * 0.12);
  for (const z of [-31.5, 31.5]) slab(64, 7, z, 16, 9, 1.2, red, 'gloss');
  // ---- rear wing: main plane, DRS flap, endplates, swan-neck pylon ----
  slab(-50, 31, 0, 11, 1.8, 44, red, 'gloss', 0.1); slab(-46.5, 34.5, 0, 7, 1.4, 44, white, 'gloss', 0.32);
  for (const z of [-22.5, 22.5]) slab(-48, 28, z, 15, 17, 1.3, carbon, 'plastic');
  seg(L(-44, 20, 0), L(-49, 31, 0), 1.6, carbon, 'plastic');
  // ---- halo + mirrors ----
  { const a = P(...L(-6, 24, -10)), e = P(...L(15, 30, 0)), b = P(...L(-6, 24, 10)); dress(limbTube(a, e, b, 1.6 * s, 1.6 * s, O3, [0, 0, 1]), carbon, 'plastic');
    seg(L(17, 18.5, 0), L(14, 28.5, 0), 1.5, carbon, 'plastic'); }
  for (const z of [-13.5, 13.5]) { seg(L(10, 21, z * 0.75), L(11, 25, z), 0.8, carbon, 'plastic'); slab(11, 25.5, z, 3, 2.4, 4.5, red, 'gloss'); }
  // ---- wheels: roll with the distance travelled, fronts steer, wishbones to the chassis ----
  const roll = -(f.x || 0) * face;
  for (const [k, r, w, front] of [[-34, 13.5, 12, false], [42, 11.5, 9.5, true]]) for (const sd of [-1, 1]) {
    const z = sd * 25, h = r - Math.max(0, bounce) * 0.4, ang = roll / r, st = front ? steer : 0;
    const p = P(...L(k, h, z)), cs = Math.cos(st), sn = Math.sin(st);
    const fw = U(face * cs * r, 0, sn * r), lat = U(-face * sn * w * 0.5, 0, cs * w * 0.5), th = V3.scale(V3.norm(V3.cross(fw, lat)), r * s);   // (tyre axis = the mesh's poles)
    const it = glItem(TYRE); M4.basis(it.m, p[0], p[1], p[2], fw, lat, th); dress(it, tyre, 'plastic', { spec: 0.25 }); it.outMesh = TYRE.outline;
    const zo = z + sd * (w * 0.5 + 0.2);                                              // the outer face: sidewall band, rim, spokes, hub nut
    torus(...L(k, h, zo), r * 0.78, yellow, Math.PI / 2, 'gloss', { noInk: true }, r * 0.35);
    ellK(GL3D.mesh.sphere, k, h, zo, r * 0.56, r * 0.56, 0.9, rimC, 'metal', { noInk: true });
    for (let i = 0; i < 5; i++) { const a = ang + i * TAU / 5; box(...L(k + Math.cos(a) * r * 0.28, h + Math.sin(a) * r * 0.28, zo + sd * 0.5), r * 0.52, 1.6, 0.8, carbon, 'metal', { noInk: true }, Math.atan2(-Math.sin(a), face * Math.cos(a))); }
    sph(...L(k, h, zo + sd * 0.9), 1.6, red, 'metal', { noInk: true });
    if (brake) glowSph(...L(k, h, z - sd * 2), r * 0.42, [1, 0.45, 0.1], 0.9, 0.8);   // glowing brake discs
    for (const dh of [-2.5, 2.5]) seg(L(k + (front ? -3 : 3), h + dh, z - sd * w * 0.5), L(k + (front ? -12 : 10), 12 + dh * 0.6, sd * 9), 0.9, carbon, 'plastic');
  }
  // ---- exhaust + drift smoke ----
  if (driving || f.state === 'attack') { const g = 0.6 + 0.4 * Math.sin(t * 0.9); glowSph(...L(-50, 13.5, 0), 2.4 + g, [1, 0.6, 0.2], 1.1 * g, 0.7); }
  if (f.driftT > 0 && f.onGround) for (let i = 0; i < 3; i++) { const u = ((t * 0.08 + i / 3) % 1), it = glSphere(...P(...L(-34 - u * 30, 6 + u * 14, (i - 1) * 16)), (6 + u * 12) * s);
    it.col = [0.9, 0.9, 0.95]; it.alpha = 0.45 * (1 - u) * (f.driftT / 18); it.shadow = false; it.toon = 1; it.spec = 0; }
}
