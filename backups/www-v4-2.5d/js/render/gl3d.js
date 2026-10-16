/* NEON BRAWL — WebGL core of the 2.5D renderer (native WebGL 1, no libraries).
 *
 * The game simulates on a flat 2D plane (x right, y DOWN, units = pixels). The renderer lifts that plane into a 3D
 * world: X = x, Y = -y (up), Z = depth (+Z toward the camera; the gameplay plane is Z = 0).
 *
 * Camera: a perspective camera dollies along Z with the follow-cam zoom and sits a little above / beside its target
 * with an off-axis (lens-shifted) frustum. Looking perpendicular to the gameplay plane keeps that plane mapped exactly
 * like the 2D camera (so 2D overlay effects line up pixel-perfectly), while everything with depth — platform tops,
 * bevels, fighters' limbs, deep scenery — shows real perspective. The smash-cam roll is applied in clip space.
 *
 * Passes per frame: shadow map (light's-eye depth, RGBA-packed) → backdrop → opaque lit meshes → ink outlines
 * (inverted hull) → alpha decals / transparent meshes (back to front) → additive glows.                          */
'use strict';

/* ---------------- tiny column-major mat4 / mat3 library ---------------- */
const M4 = {
  ident(o) { o = o || new Float32Array(16); o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  mul(o, a, b) {                                         // o = a · b
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  frustum(o, l, r, b, t, n, f) {
    o.fill(0); o[0] = 2 * n / (r - l); o[5] = 2 * n / (t - b); o[8] = (r + l) / (r - l); o[9] = (t + b) / (t - b);
    o[10] = -(f + n) / (f - n); o[11] = -1; o[14] = -2 * f * n / (f - n); return o;
  },
  ortho(o, l, r, b, t, n, f) {
    o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o;
  },
  lookAt(o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz, l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1; return o;
  },
  // model matrix from an origin and three (scaled) basis axes
  basis(o, px, py, pz, ax, ay, az) {
    o[0] = ax[0]; o[1] = ax[1]; o[2] = ax[2]; o[3] = 0; o[4] = ay[0]; o[5] = ay[1]; o[6] = ay[2]; o[7] = 0;
    o[8] = az[0]; o[9] = az[1]; o[10] = az[2]; o[11] = 0; o[12] = px; o[13] = py; o[14] = pz; o[15] = 1; return o;
  },
  // inverse-transpose of the upper 3×3 (normal matrix), general case
  normal(o, m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-9, k = 1 / det;
    o[0] = A * k; o[1] = B * k; o[2] = C * k;
    o[3] = -(b * i - c * h) * k; o[4] = (a * i - c * g) * k; o[5] = -(a * h - b * g) * k;
    o[6] = (b * f - c * e) * k; o[7] = -(a * f - c * d) * k; o[8] = (a * e - b * d) * k; return o;
  }
};
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s]
};
const COL3 = new Map();
function col3(hex) {                                      // '#rrggbb' / 'rgba(…)' → [r,g,b] 0..1 (cached)
  let c = COL3.get(hex); if (c) return c;
  if (hex[0] === '#') { const n = parseInt(hex.length === 4 ? hex.slice(1).split('').map(x => x + x).join('') : hex.slice(1, 7), 16); c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  else { const m = hex.match(/[\d.]+/g) || [255, 255, 255]; c = [m[0] / 255, m[1] / 255, m[2] / 255]; }
  COL3.set(hex, c); return c;
}
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/* ---------------- shaders ---------------- */
const GLSL_PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const SH = {
  litV: `attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; uniform mat4 uLightVP;
varying vec3 vW; varying vec3 vN; varying vec4 vL;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = uNormalM * aNor; vL = uLightVP * w; gl_Position = uVP * w; }`,
  litF: GLSL_PREC + `
uniform vec3 uColor; uniform vec4 uMat; uniform float uAlpha; uniform float uToon; uniform float uAOy; uniform float uAOk; uniform float uRimK;
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim; uniform vec3 uFog; uniform vec3 uEye; uniform vec2 uFogR;
uniform sampler2D uShadow; uniform float uShadowOn; uniform float uTexel;
uniform sampler2D uTex; uniform float uTexOn; uniform vec4 uTexRect;
varying vec3 vW; varying vec3 vN; varying vec4 vL;
float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float shadowAt(vec4 lp){
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float b = 0.0016, s = 0.0;
  s += step(p.z - b, unpackD(texture2D(uShadow, p.xy + vec2(-0.6, -0.6) * uTexel)));
  s += step(p.z - b, unpackD(texture2D(uShadow, p.xy + vec2( 0.6, -0.6) * uTexel)));
  s += step(p.z - b, unpackD(texture2D(uShadow, p.xy + vec2(-0.6,  0.6) * uTexel)));
  s += step(p.z - b, unpackD(texture2D(uShadow, p.xy + vec2( 0.6,  0.6) * uTexel)));
  return s * 0.25;
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 base = uColor; float a = uAlpha;
  if (uTexOn > 0.5) { vec2 uv = vec2((vW.x - uTexRect.x) / uTexRect.z, (-vW.y - uTexRect.y) / uTexRect.w); vec4 tx = texture2D(uTex, uv); base = tx.rgb; a *= tx.a; }
  if (a < 0.01) discard;
  vec3 L = -uLightDir; float ndl = max(dot(N, L), 0.0);
  float sh = uShadowOn > 0.5 ? shadowAt(vL) : 1.0;
  float d = ndl * mix(0.35, 1.0, sh);
  if (uToon > 0.5) d = mix(d, smoothstep(0.18, 0.26, d) * 0.82 + d * 0.18, 0.7);      // cel band
  vec3 V = normalize(uEye - vW), H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), uMat.y) * uMat.x * sh;
  float hemi = N.y * 0.5 + 0.5;
  float ao = (1.0 - uAOk * (1.0 - clamp((vW.y - uAOy) / 46.0, 0.0, 1.0))) * (0.72 + 0.28 * hemi);   // contact + hemispheric occlusion
  vec3 amb = mix(uGround, uSky, hemi) * ao;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = base * (amb + uLightCol * d) + sp * mix(vec3(1.0), base, uMat.z) + uRim * fres * uRimK + base * uMat.w;
  if (uMat.z > 0.0) { vec3 R = reflect(-V, N); vec3 env = mix(uGround * 0.6, uSky * 1.5 + vec3(0.15), smoothstep(-0.3, 0.6, R.y)); col = mix(col, col * 0.55 + env * (base * 0.8 + 0.2), uMat.z * 0.55); }
  float f = clamp((length(uEye - vW) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  col = mix(col, uFog, f * f);
  gl_FragColor = vec4(col, a);
}`,
  outV: `attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; uniform float uThick;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); w.xyz += normalize(uNormalM * aNor) * uThick; gl_Position = uVP * w; }`,
  outF: GLSL_PREC + `uniform vec4 uCol; void main(){ gl_FragColor = uCol; }`,
  depV: `attribute vec3 aPos; uniform mat4 uModel; uniform mat4 uLightVP; void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,
  depF: GLSL_PREC + `void main(){ vec4 e = fract(gl_FragCoord.z * vec4(1.0, 255.0, 65025.0, 16581375.0)); e -= e.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0); gl_FragColor = e; }`,
  glowV: `attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = uNormalM * aNor; gl_Position = uVP * w; }`,
  glowF: GLSL_PREC + `uniform vec3 uColor; uniform float uK; uniform float uPow; uniform vec3 uEye; varying vec3 vN; varying vec3 vW;
void main(){ float d = max(dot(normalize(vN), normalize(uEye - vW)), 0.0);
  float c = uPow > 0.0 ? pow(d, uPow) : pow(1.0 - d, -uPow) + 0.12;          // uPow < 0 = fresnel rim (bubbles)
  gl_FragColor = vec4(uColor * uK * c, 1.0); }`,
  bgV: `attribute vec2 aXY; uniform vec4 uUV; varying vec2 vUV; void main(){ vUV = vec2(aXY.x * 0.5 + 0.5, 0.5 - aXY.y * 0.5) * uUV.xy + uUV.zw; gl_Position = vec4(aXY, 0.9999, 1.0); }`,
  bgF: GLSL_PREC + `uniform sampler2D uTex; uniform vec3 uTint; varying vec2 vUV; void main(){ gl_FragColor = vec4(texture2D(uTex, vUV).rgb * uTint, 1.0); }`
};

/* ---------------- the renderer object ---------------- */
const GL3D = {
  ok: false, failed: false, gl: null, canvas: null, P: {}, mesh: {}, items: [], n: 0,
  VP: new Float32Array(16), V: new Float32Array(16), Proj: new Float32Array(16), LVP: new Float32Array(16), eye: [0, 0, 1000],
  shadowSize: 2048, scale: 1, env: null, tmp: new Float32Array(16), tmpN: new Float32Array(9)
};

function glCompile(gl, vs, fs, name) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ' shader: ' + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNor'); gl.bindAttribLocation(p, 0, 'aXY');
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  // a uniform the GLSL compiler optimised away reads as null (a harmless no-op), never undefined (a TypeError)
  return { p, u: new Proxy(u, { get: (o, k) => (k in o ? o[k] : null) }) };
}

/* ---------------- meshes ---------------- */
function glMesh(pos, nor, idx) {
  const gl = GL3D.gl, m = { count: idx.length };
  m.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  m.nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
  m.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
  m.u32 = idx.length > 65535 || pos.length / 3 > 65535;
  if (m.u32 && !GL3D.u32) { m.count = 0; return m; }                      // (no OES_element_index_uint: skip oversized meshes)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.u32 ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
  return m;
}
function glFreeMesh(m) { if (!m) return; const gl = GL3D.gl; gl.deleteBuffer(m.vb); gl.deleteBuffer(m.nb); gl.deleteBuffer(m.ib); }
// Geometry builders return { pos, nor, idx } so they can also be merged into one static mesh (scenery)
const GEO = {
  sphere(seg = 18, rings = 12) {
    const pos = [], nor = [], idx = [];
    for (let r = 0; r <= rings; r++) { const v = r / rings, ph = v * Math.PI;
      for (let s = 0; s <= seg; s++) { const th = s / seg * Math.PI * 2, x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th); pos.push(x, y, z); nor.push(x, y, z); } }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = r * (seg + 1) + s, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // CCW from outside
    return { pos, nor, idx };
  },
  // unit cylinder along +Y from 0 to 1, radius 1 (open; capsules add sphere caps)
  cylinder(seg = 16, cap = false, r1 = 1) {
    const pos = [], nor = [], idx = [], k = (1 - r1);                        // r1 < 1 = tapered (cone-ish); normals tilt accordingly
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = V3.norm([c, k, s]);
      pos.push(c, 0, s, c * r1, 1, s * r1); nor.push(n[0], n[1], n[2], n[0], n[1], n[2]); }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    if (cap) for (const [y, ny, rr] of [[0, -1, 1], [1, 1, r1]]) { const c0 = pos.length / 3; pos.push(0, y, 0); nor.push(0, ny, 0);
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); nor.push(0, ny, 0); }
      for (let i = 0; i < seg; i++) ny > 0 ? idx.push(c0, c0 + i + 2, c0 + i + 1) : idx.push(c0, c0 + i + 1, c0 + i + 2); }
    return { pos, nor, idx };
  },
  box() {                                                                    // unit cube centred on the origin, flat normals
    const pos = [], nor = [], idx = [];
    const F = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [n, u, v] of F) { const b = pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push((n[0] + u[0] * su + v[0] * sv) * 0.5, (n[1] + u[1] * su + v[1] * sv) * 0.5, (n[2] + u[2] * su + v[2] * sv) * 0.5); nor.push(n[0], n[1], n[2]); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    return { pos, nor, idx };
  },
  cone(seg = 16) { return GEO.cylinder(seg, true, 0.001); },
  torus(seg = 28, tube = 10, r = 0.16) {
    const pos = [], nor = [], idx = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2;
      for (let j = 0; j <= tube; j++) { const b = j / tube * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        pos.push(cx * (1 + r * Math.cos(b)), r * Math.sin(b), cz * (1 + r * Math.cos(b))); nor.push(cx * Math.cos(b), Math.sin(b), cz * Math.cos(b)); } }
    for (let i = 0; i < seg; i++) for (let j = 0; j < tube; j++) { const a = i * (tube + 1) + j, b = a + tube + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // CCW from outside
    return { pos, nor, idx };
  },
  octa() {                                                                   // crystal (flat-shaded octahedron, unit radius)
    const P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const T = [[2, 4, 0], [2, 0, 5], [2, 5, 1], [2, 1, 4], [3, 0, 4], [3, 5, 0], [3, 1, 5], [3, 4, 1]], pos = [], nor = [], idx = [];
    for (const t of T) { const a = P[t[0]], b = P[t[1]], c = P[t[2]], n = V3.norm(V3.cross(V3.sub(b, a), V3.sub(c, a))), k = pos.length / 3;
      pos.push(...a, ...b, ...c); nor.push(...n, ...n, ...n); idx.push(k, k + 1, k + 2); }
    return { pos, nor, idx };
  },
  /* A bevelled prism (stage / platform block): width w, height h, depth d, chamfer b, top at y = 0 (local), going down.
   * Built with real chamfer faces so the bevel catches the key light. */
  prism(w, h, d, b) {
    b = Math.min(b, w / 4, h / 3, d / 4);
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, yT = 0, yB = -h;
    const pos = [], nor = [], idx = [];
    const quad = (a, bb, c, dd, n) => { const k = pos.length / 3; pos.push(...a, ...bb, ...c, ...dd); for (let i = 0; i < 4; i++) nor.push(...n); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    const n45 = (x, y, z) => V3.norm([x, y, z]);
    // top face (inset by the bevel)
    quad([x0 + b, yT, z1 - b], [x1 - b, yT, z1 - b], [x1 - b, yT, z0 + b], [x0 + b, yT, z0 + b], [0, 1, 0]);
    // bevels around the top: front, back, left, right
    quad([x0 + b, yT - b, z1], [x1 - b, yT - b, z1], [x1 - b, yT, z1 - b], [x0 + b, yT, z1 - b], n45(0, 1, 1));
    quad([x1 - b, yT - b, z0], [x0 + b, yT - b, z0], [x0 + b, yT, z0 + b], [x1 - b, yT, z0 + b], n45(0, 1, -1));
    quad([x0, yT - b, z0 + b], [x0, yT - b, z1 - b], [x0 + b, yT, z1 - b], [x0 + b, yT, z0 + b], n45(-1, 1, 0));
    quad([x1, yT - b, z1 - b], [x1, yT - b, z0 + b], [x1 - b, yT, z0 + b], [x1 - b, yT, z1 - b], n45(1, 1, 0));
    // vertical sides (inset at the corners by the bevel → corner chamfers)
    quad([x0 + b, yB + b, z1], [x1 - b, yB + b, z1], [x1 - b, yT - b, z1], [x0 + b, yT - b, z1], [0, 0, 1]);
    quad([x1 - b, yB + b, z0], [x0 + b, yB + b, z0], [x0 + b, yT - b, z0], [x1 - b, yT - b, z0], [0, 0, -1]);
    quad([x0, yB + b, z0 + b], [x0, yB + b, z1 - b], [x0, yT - b, z1 - b], [x0, yT - b, z0 + b], [-1, 0, 0]);
    quad([x1, yB + b, z1 - b], [x1, yB + b, z0 + b], [x1, yT - b, z0 + b], [x1, yT - b, z1 - b], [1, 0, 0]);
    // vertical corner chamfers
    quad([x0, yB + b, z1 - b], [x0 + b, yB + b, z1], [x0 + b, yT - b, z1], [x0, yT - b, z1 - b], n45(-1, 0, 1));
    quad([x1 - b, yB + b, z1], [x1, yB + b, z1 - b], [x1, yT - b, z1 - b], [x1 - b, yT - b, z1], n45(1, 0, 1));
    quad([x1, yB + b, z0 + b], [x1 - b, yB + b, z0], [x1 - b, yT - b, z0], [x1, yT - b, z0 + b], n45(1, 0, -1));
    quad([x0 + b, yB + b, z0], [x0, yB + b, z0 + b], [x0, yT - b, z0 + b], [x0 + b, yT - b, z0], n45(-1, 0, -1));
    // bottom bevels + bottom
    quad([x1 - b, yB + b, z1], [x0 + b, yB + b, z1], [x0 + b, yB, z1 - b], [x1 - b, yB, z1 - b], n45(0, -1, 1));
    quad([x0 + b, yB + b, z0], [x1 - b, yB + b, z0], [x1 - b, yB, z0 + b], [x0 + b, yB, z0 + b], n45(0, -1, -1));
    quad([x0, yB + b, z1 - b], [x0, yB + b, z0 + b], [x0 + b, yB, z0 + b], [x0 + b, yB, z1 - b], n45(-1, -1, 0));
    quad([x1, yB + b, z0 + b], [x1, yB + b, z1 - b], [x1 - b, yB, z1 - b], [x1 - b, yB, z0 + b], n45(1, -1, 0));
    quad([x0 + b, yB, z0 + b], [x1 - b, yB, z0 + b], [x1 - b, yB, z1 - b], [x0 + b, yB, z1 - b], [0, -1, 0]);
    // corner triangles (top + bottom) as degenerate quads
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const cx = sx < 0 ? x0 : x1, cz = sz < 0 ? z0 : z1, ix = cx - sx * b, iz = cz - sz * b;
      const nT = n45(sx, 1, sz), nB = n45(sx, -1, sz);
      const tri = (a, bb, c, n) => { const k = pos.length / 3; pos.push(...a, ...bb, ...c); nor.push(...n, ...n, ...n);
        const e1 = V3.sub(bb, a), e2 = V3.sub(c, a), cr = V3.cross(e1, e2); if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) idx.push(k, k + 1, k + 2); else idx.push(k, k + 2, k + 1); };
      tri([ix, yT, iz], [cx, yT - b, iz], [ix, yT - b, cz], nT);
      tri([ix, yB, iz], [cx, yB + b, iz], [ix, yB + b, cz], nB);
    }
    return { pos, nor, idx };
  },
  quad() { return { pos: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2, 0, 2, 3] }; }
};
// Merge many transformed geometries into one (static scenery = one draw call). xf(geo, m) applies a mat4.
function geoMerge(list) {
  const pos = [], nor = [], idx = [], col = [];
  for (const { g, m, c } of list) {
    const base = pos.length / 3, nm = M4.normal(new Float32Array(9), m);
    for (let i = 0; i < g.pos.length; i += 3) {
      const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
      pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const nx = g.nor[i], ny = g.nor[i + 1], nz = g.nor[i + 2], n = V3.norm([nm[0] * nx + nm[3] * ny + nm[6] * nz, nm[1] * nx + nm[4] * ny + nm[7] * nz, nm[2] * nx + nm[5] * ny + nm[8] * nz]);
      nor.push(n[0], n[1], n[2]); if (c) col.push(c[0], c[1], c[2]);
    }
    for (const k of g.idx) idx.push(base + k);
  }
  return { pos, nor, idx, col };
}

/* ---------------- setup ---------------- */
function glInit() {
  if (GL3D.ok || GL3D.failed) return GL3D.ok;
  const cv = document.getElementById('gl');
  let gl = null;
  try { gl = cv.getContext('webgl', { antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }) || cv.getContext('experimental-webgl'); } catch (e) { gl = null; }
  if (!gl) { GL3D.failed = true; return false; }
  GL3D.gl = gl; GL3D.canvas = cv;
  try {
    GL3D.u32 = !!gl.getExtension('OES_element_index_uint');
    GL3D.P.lit = glCompile(gl, SH.litV, SH.litF, 'lit');
    GL3D.P.out = glCompile(gl, SH.outV, SH.outF, 'outline');
    GL3D.P.dep = glCompile(gl, SH.depV, SH.depF, 'depth');
    GL3D.P.glow = glCompile(gl, SH.glowV, SH.glowF, 'glow');
    GL3D.P.bg = glCompile(gl, SH.bgV, SH.bgF, 'backdrop');
    for (const [k, g] of Object.entries({ sphere: GEO.sphere(), sphereLo: GEO.sphere(10, 7), cyl: GEO.cylinder(16, false), cylCap: GEO.cylinder(16, true), taper: GEO.cylinder(14, true, 0.55),
      box: GEO.box(), cone: GEO.cone(), torus: GEO.torus(), octa: GEO.octa(), quad: GEO.quad() })) GL3D.mesh[k] = glMesh(g.pos, g.nor, g.idx);
    GL3D.fsq = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // shadow map: RGBA8 colour target (packed depth; works on every WebGL1 device) + depth renderbuffer
    const mobile = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(screen.width, screen.height) < 700;
    GL3D.shadowSize = mobile ? 1024 : 2048;
    GL3D.shTex = glTex(GL3D.shadowSize, GL3D.shadowSize, null, gl.NEAREST);
    GL3D.shFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, GL3D.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, GL3D.shTex, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, GL3D.shadowSize, GL3D.shadowSize);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    GL3D.shadowOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    GL3D.white = glTex(1, 1, new Uint8Array([255, 255, 255, 255]), gl.NEAREST);
    GL3D.bgTex = glTex(1, 1, new Uint8Array([10, 10, 30, 255]), gl.LINEAR); GL3D.bgW = 1; GL3D.bgH = 1;
    GL3D.mobile = mobile;
  } catch (e) {
    console.error('[NEON BRAWL] WebGL init failed, using the canvas renderer:', e.message);
    GL3D.failed = true; GL3D.gl = null; return false;
  }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GL3D.ok = false; GL3D.lost = true; cv.classList.remove('on'); }, false);
  cv.addEventListener('webglcontextrestored', () => { GL3D.lost = false; GL3D.failed = false; GL3D.ok = false; GL3D.mesh = {}; GL3D.P = {}; if (typeof STAGE3D !== 'undefined') STAGE3D.key = null; glInit(); }, false);
  GL3D.ok = true; GL3D.resize();
  return true;
}
function glTex(w, h, data, filter) {
  const gl = GL3D.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
// Upload a 2D canvas into a texture (painted backdrops, stage art)
function glUpload(tex, src) {
  const gl = GL3D.gl; gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}
GL3D.resize = function () {
  if (!GL3D.ok) return;
  const cap = SET.res === 'balanced' ? 1.25 : (GL3D.mobile ? 1.75 : 2);
  const s = Math.min(cap, Math.max(1, (window.devicePixelRatio || 1)));
  const w = Math.max(2, Math.round(VIEW.cssW * s)), h = Math.max(2, Math.round(VIEW.cssH * s));
  if (GL3D.canvas.width !== w || GL3D.canvas.height !== h) { GL3D.canvas.width = w; GL3D.canvas.height = h; }
  GL3D.scale = s;
};

/* ---------------- per-frame camera + light ---------------- */
const CAM3D = { K: 1100, D: 1100, h: 0, dx: 0 };
function glBeginFrame(v, env) {
  const gl = GL3D.gl, LW = VIEW.LW, LH = VIEW.LH, aspect = LW / LH;
  // dolly: the camera distance follows the 2D zoom so the gameplay plane maps exactly like the 2D camera
  const D = CAM3D.K / v.z, tanH = LH / (2 * CAM3D.K);
  const tx = v.x, ty = -v.y;                                                       // look-at target on the gameplay plane
  const midX = STAGE.x + STAGE.w / 2;
  const h = D * (0.13 + 0.07 * clamp(1.1 - v.z, 0, 0.5)) + 40;                    // camera height above the target: look down on the platforms
  const dx = clamp((tx - midX) * 0.12, -90, 90);                                    // slight orbit as the camera pans across the arena
  const ex = tx + dx, ey = ty + h, ez = D;
  GL3D.eye = [ex, ey, ez]; CAM3D.D = D; CAM3D.h = h; CAM3D.dx = dx;
  const n = Math.max(20, D * 0.08), f = D + 6000;
  const xc = -dx * n / D, yc = -h * n / D;                                          // lens shift: keep the target dead centre
  M4.frustum(GL3D.Proj, -n * tanH * aspect + xc, n * tanH * aspect + xc, -n * tanH + yc, n * tanH + yc, n, f);
  if (v.roll) {                                                                     // smash-cam roll, about the screen centre (aspect-correct, in clip space)
    const r = -v.roll, c = Math.cos(r), s = Math.sin(r), R = M4.ident(GL3D.tmp);
    R[0] = c; R[4] = -s / aspect; R[1] = s * aspect; R[5] = c;
    M4.mul(GL3D.Proj, R, new Float32Array(GL3D.Proj));
  }
  M4.ident(GL3D.V); GL3D.V[12] = -ex; GL3D.V[13] = -ey; GL3D.V[14] = -ez;
  M4.mul(GL3D.VP, GL3D.Proj, GL3D.V);
  // key light from the upper left, in front: shadows fall back and to the right onto the platform tops
  const L = V3.norm([0.42, -1, -0.5]); GL3D.lightDir = L;
  const cx = midX, cy = -(STAGE.y - 160), R = Math.max(900, (BZ.r - BZ.l) * 0.42);
  const lv = M4.lookAt(new Float32Array(16), cx - L[0] * 2000, cy - L[1] * 2000, -L[2] * 2000, cx, cy, 0, 0, 0, -1);
  const lp = M4.ortho(new Float32Array(16), -R, R, -R * 0.75, R * 0.75, 100, 4200);
  M4.mul(GL3D.LVP, lp, lv);
  GL3D.env = env; GL3D.n = 0;
  gl.viewport(0, 0, GL3D.canvas.width, GL3D.canvas.height);
}

/* ---------------- draw list ---------------- */
// Get a pooled draw item. Fields: mesh, m (model), col, spec, shin, metal, emis, alpha, toon, outline, shadow, glow, tex
function glItem(mesh) {
  let it = GL3D.items[GL3D.n];
  if (!it) it = GL3D.items[GL3D.n] = { m: new Float32Array(16), nm: new Float32Array(9) };
  GL3D.n++;
  it.mesh = mesh; it.col = null; it.spec = 0.35; it.shin = 24; it.metal = 0; it.emis = 0; it.alpha = 1; it.toon = 1; it.outline = 0;
  it.shadow = true; it.glow = 0; it.glowPow = 2; it.tex = null; it.texRect = null; it.aoY = -1e6; it.aoK = 0; it.rimK = 0.6; it.decal = false; it.cull = true;
  return it;
}
// Common shapes (all positions in world space)
function glSphere(x, y, z, rx, ry, rz) { const it = glItem(GL3D.mesh.sphere); M4.basis(it.m, x, y, z, [rx, 0, 0], [0, ry === undefined ? rx : ry, 0], [0, 0, rz === undefined ? rx : rz]); return it; }
function glBox(x, y, z, w, h, d, ang) {
  const it = glItem(GL3D.mesh.box), c = Math.cos(ang || 0), s = Math.sin(ang || 0);
  M4.basis(it.m, x, y, z, [c * w, s * w, 0], [-s * h, c * h, 0], [0, 0, d]); return it;
}
// A capsule-like limb segment from a to b (world points) with radii r0 → r1: tapered cylinder + sphere at the far end
function glSegment(a, b, r0, r1, mesh) {
  const ax = V3.sub(b, a), L = V3.len(ax) || 0.001, Y = V3.scale(ax, 1 / L);
  let X = V3.cross(Y, [0, 0, 1]); if (V3.len(X) < 0.01) X = V3.cross(Y, [1, 0, 0]); X = V3.norm(X); const Z = V3.cross(X, Y);
  const it = glItem(mesh || GL3D.mesh.cyl);
  M4.basis(it.m, a[0], a[1], a[2], V3.scale(X, r0), V3.scale(Y, L), V3.scale(Z, r0));
  it.taper = r1 / r0; return it;
}
// Oriented primitive: origin p, local axes given by an up vector (Y) and a facing hint (Z); sizes sx, sy, sz
function glOriented(mesh, p, up, sx, sy, sz, fwd) {
  const Y = V3.norm(up); let X = V3.cross(Y, fwd || [0, 0, 1]); if (V3.len(X) < 0.01) X = V3.cross(Y, [1, 0, 0]); X = V3.norm(X); const Z = V3.cross(X, Y);
  const it = glItem(mesh); M4.basis(it.m, p[0], p[1], p[2], V3.scale(X, sx), V3.scale(Y, sy), V3.scale(Z, sz)); return it;
}

function bindMesh(gl, m, withNormals) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  if (withNormals) { gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
}
const drawElems = (gl, m) => gl.drawElements(gl.TRIANGLES, m.count, m.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);

/* ---------------- flush: run all passes over the collected items ---------------- */
function glFlush(bg) {
  const gl = GL3D.gl, E = GL3D.env, items = GL3D.items, N = GL3D.n;
  for (let i = 0; i < N; i++) { const it = items[i]; if (!it.nmOK) M4.normal(it.nm, it.m); }
  gl.enableVertexAttribArray(0);
  // 1. shadow map
  const shadowOn = GL3D.shadowOK && SET.res !== 'balanced' || (GL3D.shadowOK && !GL3D.mobile);
  if (shadowOn) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL3D.shFbo); gl.viewport(0, 0, GL3D.shadowSize, GL3D.shadowSize);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const P = GL3D.P.dep; gl.useProgram(P.p); gl.disableVertexAttribArray(1); gl.uniformMatrix4fv(P.u.uLightVP, false, GL3D.LVP);
    for (let i = 0; i < N; i++) { const it = items[i]; if (!it.shadow || it.glow || it.decal || it.alpha < 0.5 || !it.mesh.count) continue;
      bindMesh(gl, it.mesh, false); gl.uniformMatrix4fv(P.u.uModel, false, it.m); drawElems(gl, it.mesh); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, GL3D.canvas.width, GL3D.canvas.height);
  }
  // 2. backdrop (painted sky as a far plate) — or just the fog colour
  gl.clearColor(E.fog[0], E.fog[1], E.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (bg) {
    const P = GL3D.P.bg; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(1); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GL3D.bgTex); gl.uniform1i(P.u.uTex, 0);
    gl.uniform4fv(P.u.uUV, bg.uv); gl.uniform3fv(P.u.uTint, bg.tint); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 3. lit meshes
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.enableVertexAttribArray(1);
  const L = GL3D.P.lit; gl.useProgram(L.p);
  gl.uniformMatrix4fv(L.u.uVP, false, GL3D.VP); gl.uniformMatrix4fv(L.u.uLightVP, false, GL3D.LVP);
  gl.uniform3fv(L.u.uLightDir, GL3D.lightDir); gl.uniform3fv(L.u.uLightCol, E.light); gl.uniform3fv(L.u.uSky, E.sky); gl.uniform3fv(L.u.uGround, E.ground);
  gl.uniform3fv(L.u.uRim, E.rim); gl.uniform3fv(L.u.uFog, E.fog); gl.uniform3fv(L.u.uEye, GL3D.eye); gl.uniform2f(L.u.uFogR, E.fogNear, E.fogFar);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, GL3D.shTex); gl.uniform1i(L.u.uShadow, 1);
  gl.uniform1f(L.u.uShadowOn, shadowOn ? 1 : 0); gl.uniform1f(L.u.uTexel, 1 / GL3D.shadowSize);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(L.u.uTex, 0);
  const drawLit = it => {
    bindMesh(gl, it.mesh, true);
    gl.uniformMatrix4fv(L.u.uModel, false, it.m); gl.uniformMatrix3fv(L.u.uNormalM, false, it.nm);
    gl.uniform3fv(L.u.uColor, it.col || [1, 1, 1]); gl.uniform4f(L.u.uMat, it.spec, it.shin, it.metal, it.emis);
    gl.uniform1f(L.u.uAlpha, it.alpha); gl.uniform1f(L.u.uToon, it.toon); gl.uniform1f(L.u.uAOy, it.aoY); gl.uniform1f(L.u.uAOk, it.aoK); gl.uniform1f(L.u.uRimK, it.rimK);
    if (it.tex) { gl.bindTexture(gl.TEXTURE_2D, it.tex); gl.uniform1f(L.u.uTexOn, 1); gl.uniform4fv(L.u.uTexRect, it.texRect); }
    else gl.uniform1f(L.u.uTexOn, 0);
    if (it.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    drawElems(gl, it.mesh);
  };
  gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
  const trans = [];
  for (let i = 0; i < N; i++) { const it = items[i]; if (!it.mesh.count || it.glow) continue; if (it.alpha < 1 || it.decal) { trans.push(it); continue; } drawLit(it); }
  // 4. ink outlines (inverted hull: back faces pushed out along the normals)
  const O = GL3D.P.out; gl.useProgram(O.p); gl.uniformMatrix4fv(O.u.uVP, false, GL3D.VP); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
  for (let i = 0; i < N; i++) { const it = items[i]; if (!it.outline || it.glow || it.alpha < 1 || !it.mesh.count) continue;
    bindMesh(gl, it.mesh, true); gl.uniformMatrix4fv(O.u.uModel, false, it.m); gl.uniformMatrix3fv(O.u.uNormalM, false, it.nm);
    gl.uniform1f(O.u.uThick, it.outline); gl.uniform4fv(O.u.uCol, it.outCol || E.ink); drawElems(gl, it.mesh); }
  gl.cullFace(gl.BACK);
  // 5. decals + transparent meshes, back to front
  if (trans.length) {
    gl.useProgram(L.p); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    trans.sort((a, b) => a.m[14] - b.m[14]);
    for (const it of trans) { gl.depthMask(!!it.decal); drawLit(it); }
    gl.depthMask(true);
  }
  // 6. additive glows (eyes, energy blades, shields, projectiles)
  const Gp = GL3D.P.glow; gl.useProgram(Gp.p); gl.uniformMatrix4fv(Gp.u.uVP, false, GL3D.VP); gl.uniform3fv(Gp.u.uEye, GL3D.eye);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  for (let i = 0; i < N; i++) { const it = items[i]; if (!it.glow || !it.mesh.count) continue;
    bindMesh(gl, it.mesh, true); gl.uniformMatrix4fv(Gp.u.uModel, false, it.m); gl.uniformMatrix3fv(Gp.u.uNormalM, false, it.nm);
    gl.uniform3fv(Gp.u.uColor, it.col); gl.uniform1f(Gp.u.uK, it.glow); gl.uniform1f(Gp.u.uPow, it.glowPow); drawElems(gl, it.mesh); }
  gl.depthMask(true); gl.disable(gl.BLEND);
  for (let i = 0; i < N; i++) items[i].nmOK = false;
}
