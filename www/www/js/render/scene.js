/* NEON BRAWL — the 3D scene graph + smooth parametric geometry for the WebGL renderer.
 *
 * SceneNode is a classic hierarchy node: a local transform (position · Euler rotation · scale), children, and
 * optionally a mesh + material (a draw item) or a batch template (one of the per-frame dynamic batches). update()
 * composes world = parent.world · local down the tree; submit() turns every visible node into draw items. Composite
 * 3D objects — the Nebula Apex arena's orbiting monoliths, rings and ringed planet, the holographic emojis, the
 * nameplates and the Battle Pass reward previews — are described once as a tree and animated by touching a few
 * local transforms (node.tick(node, t) runs before the node's matrix is rebuilt).
 *
 * Geometry here is mathematically smooth: bicubic Bézier patches (analytic ∂S/∂u × ∂S/∂v normals), superellipsoids,
 * superellipse hulls lofted along a cubic Bézier profile, and tubes swept round closed curves. Every mesh gets
 * area-weighted vertex normals welded across seams, so the toon bands and highlights flow without a single facet.   */
'use strict';

/* ---------------- smooth normals ---------------- */
// area-weighted face normals accumulated per vertex, then welded across coincident positions (seams, poles)
function geoNormals(g) {
  const P = g.pos, I = g.idx, n = new Float64Array(P.length), key = i => Math.round(P[i] * 64) + ',' + Math.round(P[i + 1] * 64) + ',' + Math.round(P[i + 2] * 64);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  const acc = new Map();
  for (let i = 0; i < P.length; i += 3) { const k = key(i), s = acc.get(k) || [0, 0, 0]; s[0] += n[i]; s[1] += n[i + 1]; s[2] += n[i + 2]; acc.set(k, s); }
  g.nor = [];
  for (let i = 0; i < P.length; i += 3) { const s = acc.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1; g.nor.push(s[0] / l, s[1] / l, s[2] / l); }
  return g;
}
// a grid of (nu+1) × (nv+1) vertices from f(u, v) → [x, y, z]; triangles wound CCW seen from the side f's normal faces
function geoGrid(nu, nv, f, flip) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...f(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  return { pos, nor: [], idx };
}
const bern3 = t => { const s = 1 - t; return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]; };
const bern3d = t => { const s = 1 - t; return [-3 * s * s, 3 * s * s - 6 * s * t, 6 * s * t - 3 * t * t, 3 * t * t]; };

Object.assign(GEO, {
  // A bicubic Bézier patch from 16 control points C[row v][col u] = [x,y,z]; normals are the analytic ∂S/∂u × ∂S/∂v
  bezierPatch(C, n = 16, twoSided = false) {
    const pos = [], nor = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const u = i / n, v = j / n, Bu = bern3(u), Bv = bern3(v), Du = bern3d(u), Dv = bern3d(v), p = [0, 0, 0], pu = [0, 0, 0], pv = [0, 0, 0];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const q = C[r][c], w = Bv[r] * Bu[c], wu = Bv[r] * Du[c], wv = Dv[r] * Bu[c];
        for (let k = 0; k < 3; k++) { p[k] += q[k] * w; pu[k] += q[k] * wu; pv[k] += q[k] * wv; } }
      const nn = V3.norm(V3.cross(pu, pv)); pos.push(...p); nor.push(...nn);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    if (twoSided) { const o = pos.length / 3; for (let k = 0; k < o; k++) { pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); nor.push(-nor[k * 3], -nor[k * 3 + 1], -nor[k * 3 + 2]); }
      for (let t = 0, L = idx.length; t < L; t += 3) idx.push(idx[t] + o, idx[t + 2] + o, idx[t + 1] + o); }
    return { pos, nor, idx };
  },
  // Superellipsoid |x|^(2/e2)… : e1 = north-south squareness, e2 = east-west (1, 1 = sphere; 0.2 = a rounded cube)
  superellipsoid(e1 = 0.4, e2 = 0.4, seg = 40, rings = 28) {
    const sp = (w, m) => Math.sign(w) * Math.pow(Math.abs(w), m);
    const g = geoGrid(seg, rings, (u, v) => { const th = u * TAU - Math.PI, ph = v * Math.PI - Math.PI / 2;
      const cp = sp(Math.cos(ph), e1), spv = sp(Math.sin(ph), e1); return [cp * sp(Math.cos(th), e2), spv, cp * sp(Math.sin(th), e2)]; }, true);
    return geoNormals(g);
  },
  /* A floating-island hull: a superellipse (exponent p) cross-section of half-size a × b, a flat top at y = 0 with a
   * rounded fillet of radius r, lofted down a cubic Bézier profile to a narrow keel at depth h. */
  hull(a, b, h, r = 12, p = 4, seg = 96) {
    const ring = (s) => { const out = []; for (let i = 0; i <= seg; i++) { const th = i / seg * TAU, c = Math.cos(th), sn = Math.sin(th);
      out.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / p) * (a * s.x), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p) * (b * s.z)]); } return out; };
    const prof = [];                                                                            // (scale x, scale z, y) from the top centre down
    const fx = 1 - r / a, fz = 1 - r / b;
    for (let k = 0; k <= 6; k++) { const q = k / 6 * Math.PI / 2; prof.push({ x: fx + (1 - fx) * Math.sin(q), z: fz + (1 - fz) * Math.sin(q), y: -r * (1 - Math.cos(q)) }); }   // the fillet
    const B = [[1, -r], [1.04, -r - h * 0.28], [0.42, -h * 0.82], [0.06, -h]];             // the belly: a cubic Bézier in (scale, y)
    for (let k = 1; k <= 22; k++) { const t = k / 22, w = bern3(t); let sc = 0, y = 0; for (let i = 0; i < 4; i++) { sc += B[i][0] * w[i]; y += B[i][1] * w[i]; } prof.push({ x: sc, z: sc, y }); }
    const pos = [], idx = [];
    pos.push(0, 0, 0);                                                                          // the top: a fan from the centre
    const top = ring(prof[0]); for (const q of top) pos.push(q[0], 0, q[1]);
    for (let i = 0; i < seg; i++) idx.push(0, 1 + i + 1, 1 + i);
    let prevBase = 1;
    for (let k = 1; k < prof.length; k++) { const R = ring(prof[k]), base = pos.length / 3; for (const q of R) pos.push(q[0], prof[k].y, q[1]);
      for (let i = 0; i < seg; i++) { const a0 = prevBase + i, a1 = a0 + 1, b0 = base + i, b1 = b0 + 1; idx.push(a0, a1, b0, a1, b1, b0); } prevBase = base; }
    const tip = pos.length / 3; pos.push(0, prof[prof.length - 1].y - 2, 0);
    for (let i = 0; i < seg; i++) idx.push(prevBase + i, prevBase + i + 1, tip);
    return geoNormals({ pos, nor: [], idx });
  },
  /* A slab with perfectly rounded edges and corners (every stage block and platform): width w, height h, depth d, fillet
   * radius r, top at y = 0 going down. Each face is a grid whose samples crowd into the fillet bands (cosine spacing);
   * every vertex is pushed onto the rounded surface — inner box + r · n — and n IS its exact normal. */
  slab(w, h, d, r, K = 5) {
    const ax = w / 2, ay = h / 2, az = d / 2; r = Math.min(r, ax * 0.49, ay * 0.49, az * 0.49);
    const samp = a => { const s = []; for (let k = 0; k <= K; k++) s.push(-a + r * (1 - Math.cos(k / K * Math.PI / 2))); for (let k = K; k >= 0; k--) s.push(a - r * (1 - Math.cos(k / K * Math.PI / 2))); return s; };
    const H = [ax, ay, az], S = H.map(samp), pos = [], nor = [], idx = [];
    // faces: [normal axis, sign, U axis, V axis] with U × V = outward normal (CCW from outside)
    for (const [n, sg, U, V] of [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]]) {
      const base = pos.length / 3, su = S[U], sv = S[V];
      for (let j = 0; j < sv.length; j++) for (let i = 0; i < su.length; i++) {
        const p = [0, 0, 0]; p[n] = sg * H[n]; p[U] = su[i]; p[V] = sv[j];
        const c = p.map((v, k) => Math.max(-(H[k] - r), Math.min(H[k] - r, v))), dv = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], l = Math.hypot(dv[0], dv[1], dv[2]) || 1;
        const nn = l > 1e-9 ? [dv[0] / l, dv[1] / l, dv[2] / l] : [n === 0 ? sg : 0, n === 1 ? sg : 0, n === 2 ? sg : 0];
        pos.push(c[0] + nn[0] * r, c[1] + nn[1] * r - ay, c[2] + nn[2] * r); nor.push(...nn);
      }
      for (let j = 0; j < sv.length - 1; j++) for (let i = 0; i < su.length - 1; i++) { const a = base + j * su.length + i, b = a + 1, c = a + su.length, e = c + 1;
        idx.push(a, b, c, b, e, c); }
    }
    return { pos, nor, idx };
  },
  // a unit cube with exactly rounded edges, centred on the origin (fillet r in units of the cube)
  rcube(r = 0.14, K = 3) { const g = GEO.slab(1, 1, 1, r, K); for (let i = 1; i < g.pos.length; i += 3) g.pos[i] += 0.5; return g; },
  // A tube of radius rt swept round the superellipse loop (half-sizes a, b, exponent p) in the XZ plane at height y
  loopTube(a, b, p, y, rt, seg = 160, sides = 10) {
    const pt = th => { const c = Math.cos(th), s = Math.sin(th); return [Math.sign(c) * Math.pow(Math.abs(c), 2 / p) * a, y, Math.sign(s) * Math.pow(Math.abs(s), 2 / p) * b]; };
    const g = geoGrid(sides, seg, (u, v) => { const th = v * TAU, c = pt(th), n = pt(th + 0.002), tx = n[0] - c[0], tz = n[2] - c[2], L = Math.hypot(tx, tz) || 1;
      const ox = tz / L, oz = -tx / L, ph = u * TAU; return [c[0] + ox * Math.cos(ph) * rt, y + Math.sin(ph) * rt, c[2] + oz * Math.cos(ph) * rt]; });
    return geoNormals(g);
  }
});

// flat (faceted) shading: un-index so every triangle carries its own face normal — folded paper, cut gems
function geoFlat(g) {
  const pos = [], nor = [], idx = [];
  for (let t = 0; t < g.idx.length; t += 3) {
    const v = [0, 1, 2].map(k => [g.pos[g.idx[t + k] * 3], g.pos[g.idx[t + k] * 3 + 1], g.pos[g.idx[t + k] * 3 + 2]]), n = V3.norm(V3.cross(V3.sub(v[1], v[0]), V3.sub(v[2], v[0])));
    for (const p of v) { pos.push(...p); nor.push(...n); idx.push(idx.length); }
  }
  return { pos, nor, idx };
}
Object.assign(GEO, {
  // A Möbius strip (radius 1, half-width w): one continuous surface with a half twist; analytic normals, draw two-sided
  mobius(w = 0.28, nu = 120, nv = 6) {
    const S = (u, v) => { const r = 1 + v * Math.cos(u / 2); return [r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u)]; };
    const g = geoGrid(nu, nv, (a, b) => S(a * TAU, (b * 2 - 1) * w));
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu * TAU, v = (j / nv * 2 - 1) * w, e = 1e-3;
      const n = V3.norm(V3.cross(V3.sub(S(u + e, v), S(u - e, v)), V3.sub(S(u, v + e), S(u, v - e)))); g.nor.push(...n); }
    return g;
  },
  tetra() { const P = [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];
    return geoFlat({ pos: [].concat(...P), idx: [0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3] }); },
  // a folded paper wing: a fan of triangular facets alternately creased up and down (mountain / valley folds)
  paperWing(n = 5) {
    const pos = [0, 0, 0], idx = [];
    for (let i = 0; i <= n; i++) { const a = -0.15 + i / n * 1.2, r = 1 - Math.abs(i / n - 0.55) * 0.5; pos.push(Math.cos(a) * r, Math.sin(a) * r, (i % 2 ? 0.09 : -0.09)); }
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    const g = geoFlat({ pos, idx }), k = g.pos.length / 3;                                  // + the back faces (paper has two sides)
    for (let i = 0; i < k; i++) { g.pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); g.nor.push(-g.nor[i * 3], -g.nor[i * 3 + 1], -g.nor[i * 3 + 2]); }
    for (let i = 0; i < k; i += 3) g.idx.push(k + i, k + i + 2, k + i + 1);
    return g;
  },
  // a pleated half-disc folding fan (n pleats, flat-shaded)
  fanFold(n = 10) {
    const pos = [0, 0, 0], idx = [];
    for (let i = 0; i <= n; i++) { const a = Math.PI * 0.08 + i / n * Math.PI * 0.84; pos.push(Math.cos(a), Math.sin(a), i % 2 ? 0.06 : -0.06); }
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    const g = geoFlat({ pos, idx }), k = g.pos.length / 3;
    for (let i = 0; i < k; i++) { g.pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); g.nor.push(-g.nor[i * 3], -g.nor[i * 3 + 1], -g.nor[i * 3 + 2]); }
    for (let i = 0; i < k; i += 3) g.idx.push(k + i, k + i + 2, k + i + 1);
    return g;
  },
  // a surfboard: a bicubic Bézier patch — pointed nose, rounded tail, a little rocker, domed deck (unit length along +x)
  surfboard() {
    const C = []; for (let r = 0; r < 4; r++) { const v = r / 3 - 0.5, row = [];
      for (let c = 0; c < 4; c++) { const u = c / 3, wdt = [0.35, 1, 0.95, 0.12][c] * 0.26, lift = [0.05, 0, 0.02, 0.16][c];
        row.push([u - 0.5, lift + (0.25 - v * v) * 0.12, v * 2 * wdt]); } C.push(row); }
    return GEO.bezierPatch(C, 14, true);
  },
  // (v15) a sword blade: a lozenge cross-section (sharp edges, a raised spine) lofted up +y from 0 to 1, a slight leaf belly and a
  // drawn-out point; unit half-width along x, half-thickness 0.22 along z — scale it like a segment (glSegment's X = the flat)
  blade(nu = 16, nv = 24) {
    const W = v => v < 0.06 ? 0.82 + v * 3 : v < 0.8 ? 1 - 0.12 * v + 0.08 * Math.sin(v * Math.PI) : Math.max(0, (1 - v) / 0.2) ** 0.8 * 0.95;
    const g = geoGrid(nu, nv, (u, v) => { const a = u * TAU, c = Math.cos(a), s = Math.sin(a), w = W(v);
      return [Math.sign(c) * Math.abs(c) ** 1.7 * w, v, Math.sign(s) * Math.abs(s) ** 1.15 * w * 0.22]; }, true);
    const base = g.pos.length / 3; g.pos.push(0, 0, 0); for (let i = 0; i < nu; i++) g.idx.push(base, i, i + 1);   // the butt cap
    return geoNormals(g);
  },
  // (v15) a heater shield: a domed superellipse plate (rounded top, pointed bottom), unit half-size, bulging toward +z
  shieldDome(n = 22) {
    const g = geoGrid(n, n, (u, v) => { const x = u * 2 - 1, y = v * 2 - 1, wy = y < 0 ? 1 - (-y) ** 2.2 * 0.62 : 1 - y ** 4 * 0.18, xx = x * wy;
      return [xx, y, (1 - Math.min(1, xx * xx + y * y * 0.6)) * 0.32]; });
    const k = g.pos.length / 3; for (let i = 0; i < k; i++) g.pos.push(g.pos[i * 3], g.pos[i * 3 + 1], -0.06);   // the flat back
    for (let i = 0, L = g.idx.length; i < L; i += 3) g.idx.push(g.idx[i] + k, g.idx[i + 2] + k, g.idx[i + 1] + k);
    const P = g.pos, V = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], rim = [];                                     // the rim wall, wound outward
    for (let j = 0; j < n; j++) rim.push([j * (n + 1), (j + 1) * (n + 1)], [j * (n + 1) + n, (j + 1) * (n + 1) + n]);
    for (let i = 0; i < n; i++) rim.push([i, i + 1], [n * (n + 1) + i, n * (n + 1) + i + 1]);
    for (const [p, q] of rim) { const a = V(p), b = V(q), c = V(p + k), nn = V3.cross(V3.sub(b, a), V3.sub(c, a));
      if (nn[0] * (a[0] + b[0]) + nn[1] * (a[1] + b[1]) > 0) g.idx.push(p, q, q + k, p, q + k, p + k); else g.idx.push(p, q + k, q, p, p + k, q + k); }
    return geoNormals(g);
  }
});
// the 30 edges of an icosahedron (unit circumradius): Axiom's geodesic cage
const ICOSA = (() => { const p = (1 + Math.sqrt(5)) / 2, V = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]].map(V3.norm), E = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (V3.len(V3.sub(V[i], V[j])) < 1.1) E.push([i, j]);
  return { V, E }; })();

/* ---------------- the scene graph ---------------- */
const SG_MESH = new Map();                                       // GPU meshes for scene-graph geometry (dropped on WebGL context loss)
function sgMesh(key, build, ink) {
  let m = SG_MESH.get(key);
  if (!m) { const g = build(); m = glMesh(g.pos, g.nor, g.idx); if (ink) m.outline = glMesh(g.pos, smoothNormals(g), g.idx); SG_MESH.set(key, m); }   // (welded normals: a gap-free ink hull)
  return m;
}
const SG_TMP = new Float32Array(16);
class SceneNode {
  constructor(name, o) {
    this.name = name; this.pos = [0, 0, 0]; this.rot = [0, 0, 0]; this.scl = [1, 1, 1]; this.children = []; this.parent = null;
    this.local = M4.ident(); this.world = M4.ident(); this.visible = true; this.mesh = null; this.meshKey = null; this.build = null; this.ink = false;
    this.mat = null; this.batch = null; this.tick = null;
    if (o) Object.assign(this, o);
  }
  add(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } return this; }
  find(name) { if (this.name === name) return this; for (const c of this.children) { const r = c.find(name); if (r) return r; } return null; }
  // local = T · Ry · Rz · Rx · S (the same convention as xf / trs)
  update(parentWorld, t) {
    if (this.tick) this.tick(this, t);
    xf(this.local, this.pos[0], this.pos[1], this.pos[2], this.scl[0], this.scl[1], this.scl[2], this.rot[1], this.rot[2], this.rot[0]);
    if (parentWorld) M4.mul(this.world, parentWorld, this.local); else this.world.set(this.local);
    for (const c of this.children) c.update(this.world, t);
    return this;
  }
  submit(alpha) {
    if (!this.visible) return;
    const a = (alpha === undefined ? 1 : alpha) * (this.alpha === undefined ? 1 : this.alpha);
    const mesh = this.mesh || (this.meshKey ? sgMesh(this.meshKey, this.build, this.ink) : null);   // (keyed meshes survive a WebGL context loss)
    if (mesh && a > 0.01) { const it = glItem(mesh); it.m.set(this.world); sgMaterial(it, this.mat, a); if (mesh.outline && it.outline) it.outMesh = mesh.outline; }
    else if (this.batch && a > 0.01) { const b = this.batch, c = b.c; BAT[b.b || 'lit'].add(BAT.T[b.t], this.world, c[0], c[1], c[2], (b.w === undefined ? 0 : b.w) * (b.b === 'glow' ? a : 1)); }
    for (const c of this.children) c.submit(a);
  }
}
function sgMaterial(it, m, a) {
  if (!m) return it;
  it.col = m.col || [1, 1, 1]; if (m.spec !== undefined) it.spec = m.spec; if (m.shin !== undefined) it.shin = m.shin; it.metal = m.metal || 0; it.emis = m.emis || 0;
  it.alpha = (m.alpha === undefined ? 1 : m.alpha) * a; it.outline = m.outline || 0; it.shadow = m.shadow !== false; it.rimK = m.rimK === undefined ? 0.6 : m.rimK;
  if (m.rimCol) it.rimCol = m.rimCol; if (m.glow) { it.glow = m.glow * a; it.glowPow = m.glowPow === undefined ? 1.2 : m.glowPow; it.shadow = false; }
  if (m.inkPx) it.inkPx = m.inkPx; if (m.cull === false) it.cull = false;
  return it;
}
// tick → compose → submit a whole tree in one call
function sgDraw(root, t, parentWorld) { root.update(parentWorld || null, t); root.submit(); return root; }
const sgNode = (name, o, ...kids) => new SceneNode(name, o).add(...kids);
