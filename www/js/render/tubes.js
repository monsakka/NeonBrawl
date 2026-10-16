/* NEON BRAWL — smooth swept tubes for the 3D fighters (limbs, tails, capes, scarves, hair, tentacles).
 *
 * Instead of stacking short cylinders with ball joints (which shows kinks at every joint), each limb is ONE continuous
 * tube swept along a curve: arms and legs along a quadratic bezier through shoulder → elbow → hand (the control point
 * is chosen so the curve passes through the elbow; for sharply folded limbs it is pulled back toward the joint so
 * punches and kicks stay crisp instead of noodly), physics chains along a centripetal Catmull-Rom spline through the
 * verlet points (duplicate points skipped). Rings are oriented by parallel transport from a fixed reference axis (no
 * twisting or popping as a fighter turns) and every vertex normal is the unit ring direction — perfectly smooth shading
 * and clean ink outlines.
 *
 * GPU side: a pool of reusable meshes, each with a STATIC index buffer (built once for the largest ring count) and
 * position / normal buffers preallocated once and refilled with bufferSubData each frame — no allocation per frame.
 * A mesh draws only the rings it was filled with. Vertices are stored relative to the fighter's origin and the item
 * carries a translation, so the battle-damage pattern (object-space) travels with the fighter. The pool is dropped on
 * WebGL context loss and rebuilt lazily. Phones use 12 sides × up to 28 rings, desktops 24 × 56 (v14: limbs sweep 28
 * rings, so even a fully bent elbow is a perfectly round curve); the ring's sin / cos are tabled once.        */
'use strict';

const TUBE = { pool: [], used: 0, sides: 24, maxRings: 56, ready: false, tmpC: [], tmpR: [], cs: null, sn: null };
function tubeSetup() {
  if (TUBE.ready) return;
  TUBE.sides = GL3D.mobile ? 12 : 24; TUBE.maxRings = GL3D.mobile ? 28 : 56; TUBE.ready = true;
  TUBE.cs = new Float32Array(TUBE.sides); TUBE.sn = new Float32Array(TUBE.sides);
  for (let j = 0; j < TUBE.sides; j++) { TUBE.cs[j] = Math.cos(j / TUBE.sides * 6.283185307); TUBE.sn[j] = Math.sin(j / TUBE.sides * 6.283185307); }
  // the shared static index pattern (identical for every tube; one buffer per mesh because WebGL 1 binds per draw)
  const S = TUBE.sides, Rn = TUBE.maxRings, idx = new Uint16Array((Rn - 1) * S * 6); let k = 0;
  for (let i = 0; i < Rn - 1; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + (j + 1) % S, c = a + S, d = b + S;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;   // CCW seen from outside (front faces)
  }
  TUBE.idx = idx;
}
function tubeMesh() {
  tubeSetup();
  let m = TUBE.pool[TUBE.used];
  if (!m) {
    const gl = GL3D.gl, n = TUBE.maxRings * TUBE.sides * 3;
    m = { vb: gl.createBuffer(), nb: gl.createBuffer(), ib: gl.createBuffer(), count: 0, u32: false, pos: new Float32Array(n), nor: new Float32Array(n), tube: true };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, m.pos.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferData(gl.ARRAY_BUFFER, m.nor.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, TUBE.idx, gl.STATIC_DRAW);
    TUBE.pool[TUBE.used] = m;
  }
  TUBE.used++;
  return m;
}
// next view: reuse the pool from the start (keep = the view is appended to the previous one's items: keep going)
function tubeReset(keep) { if (!keep) TUBE.used = 0; }
function tubeLost() { TUBE.pool.length = 0; TUBE.used = 0; TUBE.ready = false; }

/* Fill a mesh from centreline points C[i] = [x,y,z] (GL world) and radii R[i]; vertices relative to origin O.
 * ref = the fixed reference axis used to start the parallel-transport frame. */
function tubeFill(m, C, R, n, O, ref) {
  const S = TUBE.sides, pos = m.pos, nor = m.nor, CS = TUBE.cs, SN = TUBE.sn;
  let tx, ty, tz, nx, ny, nz;
  for (let i = 0; i < n; i++) {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
    tx = b[0] - a[0]; ty = b[1] - a[1]; tz = b[2] - a[2]; let L = Math.hypot(tx, ty, tz) || 1; tx /= L; ty /= L; tz /= L;
    if (i === 0) {                                                       // the first frame: ref × T (fallback axis if parallel)
      nx = ref[1] * tz - ref[2] * ty; ny = ref[2] * tx - ref[0] * tz; nz = ref[0] * ty - ref[1] * tx;
      if (Math.hypot(nx, ny, nz) < 0.05) { nx = 0; ny = tz; nz = -ty; }
    } else { const d = nx * tx + ny * ty + nz * tz; nx -= tx * d; ny -= ty * d; nz -= tz * d; }   // parallel transport
    L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx, c = C[i], r = R[i];
    for (let j = 0; j < S; j++) {
      const ca = CS[j], sa = SN[j], dx = nx * ca + bx * sa, dy = ny * ca + by * sa, dz = nz * ca + bz * sa;   // (n ⟂ b, both unit: already a unit normal)
      const o = (i * S + j) * 3;
      pos[o] = c[0] + dx * r - O[0]; pos[o + 1] = c[1] + dy * r - O[1]; pos[o + 2] = c[2] + dz * r - O[2];
      nor[o] = dx; nor[o + 1] = dy; nor[o + 2] = dz;
    }
  }
  const gl = GL3D.gl, len = n * S * 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos.subarray(0, len));
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, nor.subarray(0, len));
  m.count = (n - 1) * S * 6;
}
// A pooled tube as a draw item (material etc. are set by the caller, e.g. fighter3d's dress())
function tubeItem(C, R, n, O, ref) {
  const m = tubeMesh(); tubeFill(m, C, R, n, O, ref);
  const it = glItem(m); M4.ident(it.m); it.m[12] = O[0]; it.m[13] = O[1]; it.m[14] = O[2]; it.outMesh = null;
  return it;
}

/* v15: an ELLIPTICAL sweep — every ring has its own in-plane radius rx and lateral radius rz, with the lateral axis held
 * as close as possible to LAT (the body's left-right axis in world space). This builds the lofted torsos (a chest wider
 * than it is deep, a narrow waist, rounded closed ends) and the flat cloth of scarves, ribbons and capes (rz ≈ the cloth's
 * thickness, so the broad face of the cloth looks at the camera). Normals are the ellipse's exact gradient. */
function sweepFill(m, C, RX, RZ, n, O, LAT) {
  const S = TUBE.sides, pos = m.pos, nor = m.nor, CS = TUBE.cs, SN = TUBE.sn;
  for (let i = 0; i < n; i++) {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2], L = Math.hypot(tx, ty, tz) || 1; tx /= L; ty /= L; tz /= L;
    let nx = LAT[1] * tz - LAT[2] * ty, ny = LAT[2] * tx - LAT[0] * tz, nz = LAT[0] * ty - LAT[1] * tx; L = Math.hypot(nx, ny, nz);   // in-plane axis = LAT × T
    if (L < 1e-4) { nx = 1; ny = 0; nz = 0; L = 1; } nx /= L; ny /= L; nz /= L;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx, c = C[i], rx = Math.max(1e-3, RX[i]), rz = Math.max(1e-3, RZ[i]);   // lateral = T × in-plane
    for (let j = 0; j < S; j++) {
      const ca = CS[j], sa = SN[j], o = (i * S + j) * 3;
      pos[o] = c[0] + nx * ca * rx + bx * sa * rz - O[0]; pos[o + 1] = c[1] + ny * ca * rx + by * sa * rz - O[1]; pos[o + 2] = c[2] + nz * ca * rx + bz * sa * rz - O[2];
      let gx = nx * ca / rx + bx * sa / rz, gy = ny * ca / rx + by * sa / rz, gz = nz * ca / rx + bz * sa / rz; const gl = Math.hypot(gx, gy, gz) || 1;
      nor[o] = gx / gl; nor[o + 1] = gy / gl; nor[o + 2] = gz / gl;
    }
  }
  const gl = GL3D.gl, len = n * S * 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos.subarray(0, len));
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, nor.subarray(0, len));
  m.count = (n - 1) * S * 6;
}
function sweepItem(C, RX, RZ, n, O, LAT) {
  const m = tubeMesh(); sweepFill(m, C, RX, RZ, n, O, LAT);
  const it = glItem(m); M4.ident(it.m); it.m[12] = O[0]; it.m[13] = O[1]; it.m[14] = O[2]; it.outMesh = null;
  return it;
}

/* ---- centrelines ---- */
// a limb: quadratic bezier through shoulder S → elbow E → hand H (world points); r0 → r1 radii shaped by rf(t) (v15: a muscle
// profile — bicep / calf swell, a pinch at the joint), else a slight mid bulge
function limbTube(S, E, H, r0, r1, O, ref, rf) {
  const n = Math.min(TUBE.maxRings, GL3D.mobile ? 14 : 28), Cs = TUBE.tmpC, Rs = TUBE.tmpR;
  const ux = S[0] - E[0], uy = S[1] - E[1], uz = S[2] - E[2], vx = H[0] - E[0], vy = H[1] - E[1], vz = H[2] - E[2];
  const cosA = (ux * vx + uy * vy + uz * vz) / ((Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz)) || 1);
  const fold = clamp((cosA + 0.17) / 0.8, 0, 1);                      // 0 = straight-ish … 1 = folded tight (elbow < ~80°)
  const k = fold * fold * (3 - 2 * fold);
  const cx = lerp(2 * E[0] - (S[0] + H[0]) / 2, E[0], k), cy = lerp(2 * E[1] - (S[1] + H[1]) / 2, E[1], k), cz = lerp(2 * E[2] - (S[2] + H[2]) / 2, E[2], k);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const p = Cs[i] || (Cs[i] = [0, 0, 0]); p[0] = a * S[0] + b * cx + c * H[0]; p[1] = a * S[1] + b * cy + c * H[1]; p[2] = a * S[2] + b * cz + c * H[2];
    Rs[i] = lerp(r0, r1, t) * (rf ? rf(t) : 1 + 0.1 * Math.sin(Math.PI * t));
  }
  return tubeItem(Cs, Rs, n, O, ref);
}
// sample a chain (verlet points / tentacle polyline) as a centripetal Catmull-Rom curve, `per` samples per span → TUBE.tmpC,
// with each sample's arc parameter u (0 at the root … 1 at the tip) in TUBE.tmpU; returns the sample count (0 = degenerate)
function chainSample(P, per) {
  const pts = []; for (const p of P) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.3) pts.push(p); }   // skip duplicates
  if (pts.length < 2) return 0;
  const Cs = TUBE.tmpC, U = TUBE.tmpU || (TUBE.tmpU = []), N = pts.length; let n = 0;
  per = Math.max(1, Math.min(per || 3, Math.floor((TUBE.maxRings - 1) / (N - 1))));   // (fit the ring budget: long chains are never cut short)
  const knot = (a, b) => Math.pow(Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), 0.5);   // centripetal (α = ½)
  for (let s = 0; s < N - 1 && n < TUBE.maxRings - 1; s++) {
    const p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(N - 1, s + 2)];
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    for (let k = 0; k < per && n < TUBE.maxRings - 1; k++) {
      const t = t1 + (t2 - t1) * k / per, out = Cs[n] || (Cs[n] = [0, 0, 0]);
      for (let d = 0; d < 3; d++) {                                         // Barry–Goldman pyramid
        const A1 = (t1 - t) / (t1 || 1e-4) * p0[d] + t / (t1 || 1e-4) * p1[d], A2 = (t2 - t) / (t2 - t1) * p1[d] + (t - t1) / (t2 - t1) * p2[d], A3 = (t3 - t) / ((t3 - t2) || 1e-4) * p2[d] + (t - t2) / ((t3 - t2) || 1e-4) * p3[d];
        const B1 = (t2 - t) / (t2 || 1e-4) * A1 + t / (t2 || 1e-4) * A2, B2 = (t3 - t) / ((t3 - t1) || 1e-4) * A2 + (t - t1) / ((t3 - t1) || 1e-4) * A3;
        out[d] = s === 0 && k === 0 ? p1[d] : (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      U[n] = (s + k / per) / (N - 1); n++;
    }
  }
  const last = Cs[n] || (Cs[n] = [0, 0, 0]), e = pts[N - 1]; last[0] = e[0]; last[1] = e[1]; last[2] = e[2]; U[n] = 1; n++;
  return n;
}
function chainTube(P, rOf, O, ref, per) {
  const n = chainSample(P, per); if (!n) return null;
  for (let i = 0; i < n; i++) TUBE.tmpR[i] = rOf(TUBE.tmpU[i]);
  return tubeItem(TUBE.tmpC, TUBE.tmpR, n, O, ref);
}
// v15: a chain swept as flat cloth (rx = half-width in the screen plane, rz = half-thickness along LAT)
function chainSweep(P, rxOf, rzOf, O, LAT, per) {
  const n = chainSample(P, per); if (!n) return null;
  const RX = TUBE.tmpR, RZ = TUBE.tmpZ || (TUBE.tmpZ = []);
  for (let i = 0; i < n; i++) { RX[i] = rxOf(TUBE.tmpU[i]); RZ[i] = rzOf(TUBE.tmpU[i]); }
  return sweepItem(TUBE.tmpC, RX, RZ, n, O, LAT);
}