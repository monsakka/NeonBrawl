/* NEON BRAWL — WebGL core of the 2.5D renderer (native WebGL 1, no libraries).
 *
 * The game simulates on a flat 2D plane (x right, y DOWN, units = pixels). The renderer lifts that plane into a 3D
 * world: X = x, Y = -y (up), Z = depth (+Z toward the camera; the gameplay plane is Z = 0).
 *
 * Camera: a perspective camera dollies along Z with the follow-cam zoom and sits a little above / beside its target
 * with an off-axis (lens-shifted) frustum. Looking perpendicular to the gameplay plane keeps that plane mapped exactly
 * like the gameplay camera, while everything with depth — platform tops, bevels, fighters' limbs, deep scenery,
 * projectiles, props — shows real perspective. The smash-cam roll is applied in clip space.
 *
 * Look: a cel-shaded toon renderer for EVERYTHING — three hard light bands (shadow / mid / lit), a hard specular
 * highlight and a crisp rim line, plus thick black ink outlines (inverted hull, pushed out in screen space so the
 * line weight stays bold at any zoom). Fighters additionally carry a battle-damage term (procedural scorch marks with
 * glowing ember edges and scratched paint) driven by their damage percent.
 *
 * Passes per frame: shadow map (light's-eye depth, RGBA-packed) → procedural sky → opaque toon meshes (single items
 * + per-frame dynamic batches) → ink outlines → transparent meshes (back to front) → weather → additive glows →
 * screen effects (vignette, flashes, emergency lights).                                                         */
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
  persp(o, fovY, aspect, n, f) { const t = n * Math.tan(fovY / 2); return M4.frustum(o, -t * aspect, t * aspect, -t, t, n, f); },
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
  },
  invert(o, m) {                                          // general 4×4 inverse
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return M4.ident(o); det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }
};
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
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
  // attribute 2 (aCol) carries the colour: a per-vertex array for batched geometry, or one constant value
  // (gl.vertexAttrib4f) per single item. aCol.a = emissive amount (or alpha in the transparent batch).
  litV: `attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol;
uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; uniform mat4 uLightVP;
varying vec3 vW; varying vec3 vN; varying vec4 vL; varying vec4 vC; varying vec3 vLoc;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = uNormalM * aNor; vL = uLightVP * w; vC = aCol;
  vLoc = aPos * vec3(length(uModel[0].xyz), length(uModel[1].xyz), length(uModel[2].xyz));   // object space, in world units
  gl_Position = uVP * w; }`,
  litF: GLSL_PREC + `
uniform vec4 uMat; uniform float uAlpha; uniform float uAOy; uniform float uAOk; uniform float uRimK; uniform float uVA; uniform float uEmisU; uniform float uGlowA;
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim; uniform vec3 uFog; uniform vec3 uEye; uniform vec2 uFogR;
uniform sampler2D uShadow; uniform float uShadowOn; uniform float uTexel;
uniform vec4 uDmg;
varying vec3 vW; varying vec3 vN; varying vec4 vL; varying vec4 vC; varying vec3 vLoc;
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
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 base = vC.rgb; float emis = mix(vC.a, uEmisU, uVA); float a = uAlpha * mix(1.0, vC.a, uVA);
  if (a < 0.01) discard;
  float toon = uMat.w;
  // ---- battle damage: hard-edged scorch patches (ember-glowing rims) + scratched paint, in object space ----
  if (uDmg.x + uDmg.y > 0.002) {
    vec3 q = vLoc * 0.13 + uDmg.z;
    float n = vnoise(q) * 0.62 + vnoise(q * 2.7 + 3.1) * 0.38;
    float th = 1.0 - uDmg.x * 0.42;
    float sc = smoothstep(th, th + 0.015, n), rim = smoothstep(th - 0.07, th - 0.055, n) - sc;
    base = mix(base, base * 0.16 + vec3(0.035, 0.025, 0.03), sc * 0.9);
    float g = abs(fract(dot(vLoc, vec3(0.23, 0.31, 0.13)) + vnoise(q * 1.9) * 0.9) - 0.5);
    float scr = smoothstep(0.045, 0.03, g) * step(1.0 - uDmg.y * 0.75, vnoise(q * 0.8 + 7.0));
    base = mix(base, min(base * 1.5 + 0.3, vec3(1.0)), scr * 0.75);
    base = mix(base, vec3(1.0, 0.42, 0.1), rim * uDmg.w); emis = max(emis, rim * uDmg.w);
  }
  vec3 L = -uLightDir; float ndl = max(dot(N, L), 0.0);
  float sh = uShadowOn > 0.5 ? shadowAt(vL) : 1.0;
  float d = ndl * mix(0.2, 1.0, sh);
  // three hard cel bands (shadow 0 / mid 0.55 / lit 1), with a tiny smoothstep so the band edges don't alias
  float lit = toon > 0.5 ? smoothstep(0.09, 0.13, d) * 0.55 + smoothstep(0.52, 0.56, d) * 0.45 : d;
  vec3 V = normalize(uEye - vW), H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), uMat.y);
  if (toon > 0.5) sp = smoothstep(0.42, 0.48, sp);                                // hard toon highlight
  sp *= uMat.x * sh;
  float hemi = N.y * 0.5 + 0.5;
  float ao = (1.0 - uAOk * (1.0 - clamp((vW.y - uAOy) / 46.0, 0.0, 1.0))) * (0.75 + 0.25 * hemi);   // contact + hemispheric occlusion
  vec3 amb = mix(uGround, uSky, toon > 0.5 ? step(0.5, hemi) * 0.6 + hemi * 0.4 : hemi) * ao;
  float fr = 1.0 - max(dot(N, V), 0.0);
  float rim = toon > 0.5 ? smoothstep(0.6, 0.66, fr) * (0.45 + 0.55 * step(0.0, dot(N, L) + 0.35)) : pow(fr, 3.0);   // crisp rim line
  vec3 col = base * (amb + uLightCol * lit) + sp * mix(vec3(1.0), base, uMat.z) + uRim * rim * uRimK;
  if (uMat.z > 0.0) { vec3 R = reflect(-V, N);                                    // banded environment reflection (gold, chrome)
    float band = toon > 0.5 ? step(-0.12, R.y) * 0.45 + step(0.4, R.y) * 0.55 : smoothstep(-0.3, 0.6, R.y);
    vec3 env = mix(uGround * 0.6, uSky * 1.5 + vec3(0.15), band); col = mix(col, col * 0.55 + env * (base * 0.8 + 0.2), uMat.z * 0.55); }
  col = mix(col, base * 1.12, clamp(emis, 0.0, 1.0)); col += base * max(emis - 1.0, 0.0);
  float f = clamp((length(uEye - vW) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  col = mix(col, uFog, f * f);
  gl_FragColor = vec4(col, uGlowA > 0.5 ? clamp((emis - 0.2) * 1.4, 0.0, 1.0) : a);   // (post FX: opaque pixels store how emissive they are → bloom mask)
}`,
  // ink outline: inverted hull, pushed out along the normal; the push is measured in screen pixels and clamped, so
  // lines stay bold when the camera pulls back and never balloon when it zooms in
  outV: `attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; uniform float uThick; uniform vec2 uRes; uniform vec2 uPx; varying vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vec3 n = normalize(uNormalM * aNor); vW = w.xyz;
  vec4 p = uVP * w, q = uVP * vec4(w.xyz + n * uThick, 1.0);
  vec2 d = (q.xy / q.w - p.xy / p.w) * uRes * 0.5; float L = length(d);
  if (L > 1e-4) p.xy += d / L * clamp(L, uPx.x, uPx.y) / (uRes * 0.5) * p.w;
  gl_Position = p; }`,
  outF: GLSL_PREC + `uniform vec4 uCol; uniform vec3 uFog; uniform vec3 uEye; uniform vec2 uFogR; varying vec3 vW;
void main(){ float f = clamp((length(uEye - vW) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0); gl_FragColor = vec4(mix(uCol.rgb, uFog, f * f), uCol.a); }`,
  depV: `attribute vec3 aPos; uniform mat4 uModel; uniform mat4 uLightVP; void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`,
  depF: GLSL_PREC + `void main(){ vec4 e = fract(gl_FragCoord.z * vec4(1.0, 255.0, 65025.0, 16581375.0)); e -= e.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0); gl_FragColor = e; }`,
  glowV: `attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol; uniform mat4 uModel; uniform mat3 uNormalM; uniform mat4 uVP; varying vec3 vN; varying vec3 vW; varying vec4 vC;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = uNormalM * aNor; vC = aCol; gl_Position = uVP * w; }`,
  glowF: GLSL_PREC + `uniform float uK; uniform float uPow; uniform vec3 uEye; varying vec3 vN; varying vec3 vW; varying vec4 vC;
void main(){ float d = abs(dot(normalize(vN), normalize(uEye - vW)));
  float c = uPow > 0.0 ? pow(d, uPow) : pow(1.0 - d, -uPow) + 0.12;          // uPow < 0 = fresnel rim (bubbles)
  gl_FragColor = vec4(vC.rgb * vC.a * uK * c, clamp(vC.a * uK * c, 0.0, 1.0)); }`,   // (alpha = glow intensity: the bloom mask under post FX)
  // procedural toon sky: gradient, stepped sun halo, a shaded moon / planet, banded cartoon clouds, stars, aurora
  skyV: `attribute vec2 aXY; uniform mat4 uInvVP; varying vec3 vDir;
void main(){ vec4 a = uInvVP * vec4(aXY, 1.0, 1.0), b = uInvVP * vec4(aXY, -1.0, 1.0); vDir = a.xyz / a.w - b.xyz / b.w; gl_Position = vec4(aXY, 0.9999, 1.0); }`,
  skyF: GLSL_PREC + `uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGnd; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uCl1; uniform vec3 uCl2;
uniform vec3 uAur1; uniform vec3 uAur2; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform vec4 uK; uniform vec4 uK2; uniform vec3 uFlash;
varying vec3 vDir;
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir); float y = d.y, az = atan(d.x, -d.z);
  vec3 col = y > 0.0 ? mix(uHor, uZen, pow(clamp(y * 1.6, 0.0, 1.0), 0.7)) : mix(uHor, uGnd, clamp(-y * 4.0, 0.0, 1.0));
  col += uHor * uK2.w * exp(-abs(y) * 10.0) * 0.4;                                 // glow along the horizon
  if (uK.y > 0.0) { vec3 c = floor(d * 240.0); float h = fract(sin(dot(c, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    float tw = 0.55 + 0.45 * sin(uK2.x * 2.3 + h * 70.0); col += vec3(step(1.0 - 0.0065 * uK.y, h) * tw * smoothstep(-0.04, 0.2, y)); }
  if (uK.w > 0.0 && y > 0.0) {                                                     // aurora curtains
    float band = sin(az * 5.0 + sin(az * 11.0 + uK2.x * 0.3) * 0.9 + uK2.x * 0.12);
    float cur = smoothstep(0.5, 0.95, band) * smoothstep(0.06, 0.22, y) * (1.0 - smoothstep(0.3, 0.65, y));
    col += mix(uAur1, uAur2, smoothstep(0.1, 0.45, y)) * cur * uK.w * (0.55 + 0.45 * n2(vec2(az * 24.0, uK2.x * 0.5)));
  }
  if (uK.x > 0.0) { float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));            // sun: a flat disc + two stepped halo rings
    col += uSunCol * (smoothstep(uK.x * 3.2, uK.x * 3.1, a) * 0.1 + smoothstep(uK.x * 1.9, uK.x * 1.8, a) * 0.16 + exp(-a * 2.5) * 0.22);
    col = mix(col, uSunCol * 1.25 + 0.25, smoothstep(uK.x, uK.x * 0.93, a)); }
  if (uK2.y > 0.0) { vec3 X = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), Y = cross(X, uMoonDir);
    vec2 q = vec2(dot(d - uMoonDir, X), dot(d - uMoonDir, Y)) / uK2.y; float r2 = dot(q, q);
    if (r2 < 1.0) { vec3 n = q.x * X + q.y * Y - sqrt(1.0 - r2) * uMoonDir;
      float l = smoothstep(-0.04, 0.04, dot(n, normalize(-X * 0.7 + Y * 0.45 - uMoonDir * 0.5)));
      float cr = step(0.72, n2(q * 4.0 + 9.0)) * 0.18;
      vec3 mc = mix(uMoonCol * 0.22, uMoonCol * (1.0 - cr), l);
      col = mix(col, mc, smoothstep(1.0, 0.94, r2)); }
  }
  if (uK.z > 0.0 && y > -0.08) {                                                   // banded toon clouds
    vec2 uv = vec2(az * 2.3 + uK2.x * 0.012, y * uK2.z);
    float n = n2(uv * vec2(3.0, 6.0)) * 0.55 + n2(uv * vec2(7.0, 13.0) + 3.1) * 0.3 + n2(uv * vec2(16.0, 29.0) + 7.7) * 0.15;
    float m = exp(-pow((y - 0.1) / (0.12 + 0.6 / uK2.z), 2.0)), c = n * m, th = 0.78 - uK.z * 0.42;
    float cl = smoothstep(th, th + 0.02, c), hi = smoothstep(th + 0.075, th + 0.095, c + (n2(uv * vec2(3.0, 6.0) + vec2(0.0, 0.35)) - 0.5) * 0.08);
    col = mix(col, mix(uCl2, uCl1, hi), cl);
  }
  col += uFlash;
  gl_FragColor = vec4(col, 1.0);
}`,
  // screen effects in one full-screen pass (premultiplied): vignette, white flash, damage vignette, sudden-death
  // emergency lights (pulse + two sweeping beacons), blinding white-out, storm flash
  postV: `attribute vec2 aXY; varying vec2 vP; void main(){ vP = aXY; gl_Position = vec4(aXY, 0.0, 1.0); }`,
  postF: GLSL_PREC + `uniform vec4 uA; uniform vec4 uB; uniform float uAspect; uniform float uT; varying vec2 vP;
void main(){
  vec2 p = vec2(vP.x * uAspect, vP.y); float r = length(vP * vec2(1.0, 0.92));
  float vig = uA.x * smoothstep(0.55, 1.45, r);
  vec3 add = vec3(uA.y) + vec3(0.75, 0.82, 1.0) * uB.z;                           // white flash + storm flash
  float red = uA.z * smoothstep(0.35, 1.3, r);
  vec3 over = vec3(1.0, 0.16, 0.24) * red; float oa = red;
  if (uA.w > 0.0) { float pulse = 0.5 + 0.5 * sin(uT * 0.22);                       // sudden death emergency lights
    add += vec3(1.0, 0.08, 0.15) * (0.12 + 0.2 * pulse) * smoothstep(0.3, 1.25, r) * uA.w;
    for (int i = 0; i < 2; i++) { float sx = i == 0 ? -1.0 : 1.0; vec2 o = vec2(sx * (uAspect - 0.06), 0.97);
      vec2 v = p - o; float ang = atan(v.x, -v.y), aim = sin(uT * 0.09 * sx) * 0.9;
      float beam = smoothstep(0.2, 0.15, abs(ang - aim)) * (1.0 - smoothstep(0.0, 2.2, length(v)));
      add += vec3(1.0, 0.18, 0.2) * beam * (0.14 + 0.1 * pulse) * uA.w;
      add += vec3(1.0, 0.35, 0.35) * smoothstep(0.035, 0.02, length(v)) * (0.6 + 0.4 * pulse) * uA.w; }
  }
  if (uB.x > 0.0) { float w = uB.x * mix(0.15, 0.85, smoothstep(0.12 * (1.0 - uB.x * 0.6), 0.95, r)); over = mix(over, vec3(1.0, 0.98, 0.9), w); oa = max(oa, w); }
  float a = max(max(oa, vig), uB.y); vec3 c = over * oa;
  gl_FragColor = vec4(c + add, a);
}`
};

// Intro particle field: each particle is a seed (angle, radius, phase, hue); the vertex shader flies it down a spiralling
// tunnel toward the camera, sizes it by depth and the fragment shader draws a soft glowing disc (additive blending).
SH.ptsV = `attribute vec4 aSeed; uniform float uT; uniform float uAspect; uniform float uPx; varying vec3 vCol; varying float vA;
void main(){
  float z = fract(aSeed.z + uT * (0.06 + aSeed.w * 0.05));            // 0 = far, 1 = at the lens
  float ang = aSeed.x * 6.2831 + uT * 0.35 + z * 2.6;
  float r = mix(0.18, 1.35, aSeed.y) * (0.35 + z * 0.9);
  float depth = mix(9.0, 0.6, z);
  vec2 p = vec2(cos(ang), sin(ang)) * r * 4.0;
  gl_Position = vec4(p.x / (depth * uAspect), p.y / depth, 0.0, 1.0);
  gl_PointSize = uPx * (1.4 + aSeed.w * 2.6) / depth;
  vec3 c1 = vec3(0.13, 0.9, 1.0), c2 = vec3(1.0, 0.18, 0.82), c3 = vec3(0.55, 0.36, 1.0);
  vCol = aSeed.w < 0.33 ? c1 : aSeed.w < 0.66 ? c2 : c3;
  vA = smoothstep(0.0, 0.25, z) * (1.0 - smoothstep(0.85, 1.0, z));
}`;
SH.ptsF = GLSL_PREC + `varying vec3 vCol; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float g = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol * g * vA * 1.25 + vec3(g * g * vA * 0.5), 1.0); }`;

/* ---------------- the renderer object ---------------- */
const GL3D = {
  ok: false, failed: false, gl: null, canvas: null, P: {}, mesh: {}, items: [], n: 0,
  VP: new Float32Array(16), V: new Float32Array(16), Proj: new Float32Array(16), LVP: new Float32Array(16), invVP: new Float32Array(16), mainVP: new Float32Array(16), eye: [0, 0, 1000],
  shadowSize: 2048, scale: 1, env: null, tmp: new Float32Array(16), tmpN: new Float32Array(9), I16: M4.ident(), I9: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
};

function glCompile(gl, vs, fs, name) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ' shader: ' + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  for (const a of ['aPos', 'aXY', 'aSeed']) gl.bindAttribLocation(p, 0, a);
  gl.bindAttribLocation(p, 1, 'aNor');
  for (const a of ['aCol', 'aWS']) gl.bindAttribLocation(p, 2, a);
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
function glFreeMesh(m) { if (!m) return; const gl = GL3D.gl; gl.deleteBuffer(m.vb); gl.deleteBuffer(m.nb); gl.deleteBuffer(m.ib); if (m.cb) gl.deleteBuffer(m.cb); }
// A static mesh with per-vertex colours (merged scenery / stage detailing: one draw call, many colours)
function glMeshC(g) {
  const m = glMesh(g.pos, g.nor, g.idx), gl = GL3D.gl;
  m.cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.col), gl.STATIC_DRAW);
  return m;
}
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
  // rounded box: a cube whose normals are blended toward the corner directions — reads as a soft toy-like block
  // under toon shading, and gives the ink outline a closed, gap-free hull
  rbox() { const g = GEO.box(); for (let i = 0; i < g.nor.length; i += 3) { const n = V3.norm([g.pos[i] * 2 * 0.55 + g.nor[i], g.pos[i + 1] * 2 * 0.55 + g.nor[i + 1], g.pos[i + 2] * 2 * 0.55 + g.nor[i + 2]]); g.nor[i] = n[0]; g.nor[i + 1] = n[1]; g.nor[i + 2] = n[2]; } return g; },
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
  // a 3D five-point star: front + back pyramids around a star outline (KO stars, starlight, star specials)
  star(points = 5, inner = 0.45, depth = 0.35) {
    const pos = [], nor = [], idx = [], n = points * 2, rim = [];
    for (let i = 0; i < n; i++) { const a = Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : 1; rim.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
    for (const sz of [1, -1]) for (let i = 0; i < n; i++) {
      const a = rim[i], b = rim[(i + 1) % n], c = [0, 0, depth * sz], nn = V3.norm(V3.cross(V3.sub(b, a), V3.sub(c, a))), k = pos.length / 3;
      const fix = sz > 0 ? nn : V3.scale(nn, -1);
      pos.push(...a, ...b, ...c); nor.push(...fix, ...fix, ...fix); sz > 0 ? idx.push(k, k + 1, k + 2) : idx.push(k, k + 2, k + 1);
    }
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
    quad([x0 + b, yT, z1 - b], [x1 - b, yT, z1 - b], [x1 - b, yT, z0 + b], [x0 + b, yT, z0 + b], [0, 1, 0]);
    quad([x0 + b, yT - b, z1], [x1 - b, yT - b, z1], [x1 - b, yT, z1 - b], [x0 + b, yT, z1 - b], n45(0, 1, 1));
    quad([x1 - b, yT - b, z0], [x0 + b, yT - b, z0], [x0 + b, yT, z0 + b], [x1 - b, yT, z0 + b], n45(0, 1, -1));
    quad([x0, yT - b, z0 + b], [x0, yT - b, z1 - b], [x0 + b, yT, z1 - b], [x0 + b, yT, z0 + b], n45(-1, 1, 0));
    quad([x1, yT - b, z1 - b], [x1, yT - b, z0 + b], [x1 - b, yT, z0 + b], [x1 - b, yT, z1 - b], n45(1, 1, 0));
    quad([x0 + b, yB + b, z1], [x1 - b, yB + b, z1], [x1 - b, yT - b, z1], [x0 + b, yT - b, z1], [0, 0, 1]);
    quad([x1 - b, yB + b, z0], [x0 + b, yB + b, z0], [x0 + b, yT - b, z0], [x1 - b, yT - b, z0], [0, 0, -1]);
    quad([x0, yB + b, z0 + b], [x0, yB + b, z1 - b], [x0, yT - b, z1 - b], [x0, yT - b, z0 + b], [-1, 0, 0]);
    quad([x1, yB + b, z1 - b], [x1, yB + b, z0 + b], [x1, yT - b, z0 + b], [x1, yT - b, z1 - b], [1, 0, 0]);
    quad([x0, yB + b, z1 - b], [x0 + b, yB + b, z1], [x0 + b, yT - b, z1], [x0, yT - b, z1 - b], n45(-1, 0, 1));
    quad([x1 - b, yB + b, z1], [x1, yB + b, z1 - b], [x1, yT - b, z1 - b], [x1 - b, yT - b, z1], n45(1, 0, 1));
    quad([x1, yB + b, z0 + b], [x1 - b, yB + b, z0], [x1 - b, yT - b, z0], [x1, yT - b, z0 + b], n45(1, 0, -1));
    quad([x0 + b, yB + b, z0], [x0, yB + b, z0 + b], [x0, yT - b, z0 + b], [x0 + b, yT - b, z0], n45(-1, 0, -1));
    quad([x1 - b, yB + b, z1], [x0 + b, yB + b, z1], [x0 + b, yB, z1 - b], [x1 - b, yB, z1 - b], n45(0, -1, 1));
    quad([x0 + b, yB + b, z0], [x1 - b, yB + b, z0], [x1 - b, yB, z0 + b], [x0 + b, yB, z0 + b], n45(0, -1, -1));
    quad([x0, yB + b, z1 - b], [x0, yB + b, z0 + b], [x0 + b, yB, z0 + b], [x0 + b, yB, z1 - b], n45(-1, -1, 0));
    quad([x1, yB + b, z0 + b], [x1, yB + b, z1 - b], [x1 - b, yB, z1 - b], [x1 - b, yB, z0 + b], n45(1, -1, 0));
    quad([x0 + b, yB, z0 + b], [x1 - b, yB, z0 + b], [x1 - b, yB, z1 - b], [x0 + b, yB, z1 - b], [0, -1, 0]);
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
// Smooth (averaged) normals for the outline hull of a flat-shaded mesh: welds coincident vertices so the inverted
// hull closes at hard edges instead of splitting into gaps
function smoothNormals(g) {
  const key = i => Math.round(g.pos[i] * 100) + ',' + Math.round(g.pos[i + 1] * 100) + ',' + Math.round(g.pos[i + 2] * 100), acc = new Map(), out = [];
  for (let i = 0; i < g.pos.length; i += 3) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += g.nor[i]; a[1] += g.nor[i + 1]; a[2] += g.nor[i + 2]; acc.set(k, a); }
  for (let i = 0; i < g.pos.length; i += 3) { const n = V3.norm(acc.get(key(i))); out.push(n[0], n[1], n[2]); }
  return out;
}
// Merge many transformed geometries into one (static scenery = one draw call). Optional per-part colour c = [r,g,b(,e)].
function geoMerge(list) {
  const pos = [], nor = [], idx = [], col = [];
  for (const { g, m, c } of list) {
    const base = pos.length / 3, nm = M4.normal(new Float32Array(9), m);
    for (let i = 0; i < g.pos.length; i += 3) {
      const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
      pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const nx = g.nor[i], ny = g.nor[i + 1], nz = g.nor[i + 2], n = V3.norm([nm[0] * nx + nm[3] * ny + nm[6] * nz, nm[1] * nx + nm[4] * ny + nm[7] * nz, nm[2] * nx + nm[5] * ny + nm[8] * nz]);
      nor.push(n[0], n[1], n[2]); if (c) col.push(c[0], c[1], c[2], c[3] || 0);
    }
    for (const k of g.idx) idx.push(base + k);
  }
  return { pos, nor, idx, col };
}

/* ---------------- dynamic batches: many small 3D objects → one draw call ----------------
 * Effects, projectiles, particles and props are real geometry (spheres, crystals, cones, boxes, tori, stars…),
 * transformed on the CPU into a per-frame vertex buffer with per-vertex colour. One draw call per batch keeps
 * hundreds of 3D particles cheap even on phones. */
function DynBatch(maxV, maxI) {
  this.p = new Float32Array(maxV * 3); this.nn = new Float32Array(maxV * 3); this.c = new Float32Array(maxV * 4); this.i = new Uint16Array(maxI);
  this.nv = 0; this.ni = 0; this.maxV = maxV; this.maxI = maxI; this.vb = null; this.over = 0;
}
DynBatch.prototype.reset = function () { this.nv = 0; this.ni = 0; };
// add template geometry t (typed arrays) transformed by the affine matrix m (Float32Array(16)), colour r g b, w (emissive / alpha / glow)
DynBatch.prototype.add = function (t, m, r, g, b, w) {
  const nv = t.nv; if (this.nv + nv > this.maxV || this.ni + t.idx.length > this.maxI) { this.over++; return; }
  const P = this.p, Nn = this.nn, C = this.c, tp = t.pos, tn = t.nor, n = BAT.nm; M4.normal(n, m);
  let o = this.nv * 3, oc = this.nv * 4;
  for (let i = 0; i < nv * 3; i += 3) {
    const x = tp[i], y = tp[i + 1], z = tp[i + 2];
    P[o] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nx = tn[i], ny = tn[i + 1], nz = tn[i + 2];
    let ax = n[0] * nx + n[3] * ny + n[6] * nz, ay = n[1] * nx + n[4] * ny + n[7] * nz, az = n[2] * nx + n[5] * ny + n[8] * nz; const l = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
    Nn[o] = ax * l; Nn[o + 1] = ay * l; Nn[o + 2] = az * l; o += 3;
    C[oc] = r; C[oc + 1] = g; C[oc + 2] = b; C[oc + 3] = w; oc += 4;
  }
  const I = this.i, base = this.nv, ti = t.idx; let k = this.ni;
  for (let i = 0; i < ti.length; i++) I[k++] = ti[i] + base;
  this.nv += nv; this.ni = k;
};
DynBatch.prototype.upload = function (gl) {
  if (!this.vb) { this.vb = gl.createBuffer(); this.nb = gl.createBuffer(); this.cb = gl.createBuffer(); this.ib = gl.createBuffer(); }
  if (!this.ni) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.bufferData(gl.ARRAY_BUFFER, this.p.subarray(0, this.nv * 3), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.nb); gl.bufferData(gl.ARRAY_BUFFER, this.nn.subarray(0, this.nv * 3), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.cb); gl.bufferData(gl.ARRAY_BUFFER, this.c.subarray(0, this.nv * 4), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.i.subarray(0, this.ni), gl.DYNAMIC_DRAW);
};
DynBatch.prototype.bind = function (gl, withNor, withCol) {
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  if (withNor) { gl.bindBuffer(gl.ARRAY_BUFFER, this.nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); }
  if (withCol) { gl.enableVertexAttribArray(2); gl.bindBuffer(gl.ARRAY_BUFFER, this.cb); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0); }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
};
DynBatch.prototype.draw = function (gl) { gl.drawElements(gl.TRIANGLES, this.ni, gl.UNSIGNED_SHORT, 0); };
// lit = toon + ink + shadows, flat = toon without ink, alpha = see-through toon (w = alpha), glow = additive light (w = intensity)
const BAT = { lit: null, flat: null, alpha: null, glow: null, nm: new Float32Array(9), T: {} };
function geoT(g) { return { pos: new Float32Array(g.pos), nor: new Float32Array(g.nor), idx: new Uint16Array(g.idx), nv: g.pos.length / 3 }; }

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
    GL3D.P.sky = glCompile(gl, SH.skyV, SH.skyF, 'sky');
    GL3D.P.post = glCompile(gl, SH.postV, SH.postF, 'post');
    // high-poly primitives with smooth (analytic) normals, so fighters shade buttery-smooth with no polygon facets
    const mobG = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(screen.width, screen.height) < 700;
    for (const [k, g] of Object.entries({ sphere: mobG ? GEO.sphere(36, 26) : GEO.sphere(56, 40), sphereLo: GEO.sphere(12, 8), cyl: GEO.cylinder(28, false), cylCap: GEO.cylinder(28, true), taper: GEO.cylinder(24, true, 0.55),
      box: GEO.box(), rbox: GEO.rbox(), cone: GEO.cone(24), torus: GEO.torus(44, 16), octa: GEO.octa(), quad: GEO.quad(), star: GEO.star() })) GL3D.mesh[k] = glMesh(g.pos, g.nor, g.idx);
    // batch templates (low-poly: they're small on screen)
    Object.assign(BAT.T, { sph: geoT(GEO.sphere(12, 8)), sphHi: geoT(GEO.sphere(18, 12)), box: geoT(GEO.box()), rbox: geoT(GEO.rbox()), octa: geoT(GEO.octa()), cyl: geoT(GEO.cylinder(10, true)),
      tube: geoT(GEO.cylinder(10, false)), cone: geoT(GEO.cone(10)), pyr: geoT(GEO.cylinder(4, true, 0.001)), torus: geoT(GEO.torus(24, 6, 0.12)), ring: geoT(GEO.torus(32, 5, 0.06)), ring1: geoT(GEO.torus(36, 4, 0.03)), ring3: geoT(GEO.torus(32, 6, 0.12)), ring4: geoT(GEO.torus(28, 6, 0.2)),
      disc: geoT(GEO.cylinder(18, true)), star: geoT(GEO.star()), star4: geoT(GEO.star(4, 0.28, 0.18)), quad: geoT(GEO.quad()), wedge: geoT(GEO.cylinder(3, true)), hemi: geoT(GEO.sphere(14, 10)) });
    const mob = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(screen.width, screen.height) < 700;
    BAT.lit = new DynBatch(mob ? 40000 : 60000, mob ? 90000 : 150000); BAT.flat = new DynBatch(40000, 100000);
    BAT.alpha = new DynBatch(20000, 50000); BAT.glow = new DynBatch(mob ? 30000 : 50000, mob ? 80000 : 130000);
    GL3D.fsq = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // shadow map: RGBA8 colour target (packed depth; works on every WebGL1 device) + depth renderbuffer
    GL3D.shadowSize = mob ? 1024 : 2048;
    GL3D.shTex = glTex(GL3D.shadowSize, GL3D.shadowSize, null, gl.NEAREST);
    GL3D.shFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, GL3D.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, GL3D.shTex, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, GL3D.shadowSize, GL3D.shadowSize);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    GL3D.shadowOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    GL3D.mobile = mob;
  } catch (e) {
    console.error('[NEON BRAWL] WebGL init failed, using the canvas renderer:', e.message);
    GL3D.failed = true; GL3D.gl = null; return false;
  }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GL3D.ok = false; GL3D.lost = true; cv.classList.remove('on'); }, false);
  cv.addEventListener('webglcontextrestored', () => { GL3D.lost = false; GL3D.failed = false; GL3D.ok = false; GL3D.mesh = {}; GL3D.P = {}; GL3D.snap = null;
    for (const k of ['lit', 'flat', 'alpha', 'glow']) if (BAT[k]) BAT[k].vb = null;
    if (typeof tubeLost === 'function') tubeLost();                                  // (the tube pool's buffers died with the context)
    if (typeof STAGE3D !== 'undefined') { STAGE3D.key = null; STAGE_CACHE.clear(); } if (typeof WEATHER3D !== 'undefined') WEATHER3D.key = null; glInit(); }, false);
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
GL3D.resize = function () {
  if (!GL3D.ok) return;
  const cap = SET.res === 'balanced' ? 1.25 : (GL3D.mobile ? 1.75 : 2);
  const s = Math.min(cap, Math.max(1, (window.devicePixelRatio || 1)));
  const w = Math.max(2, Math.round(VIEW.cssW * s)), h = Math.max(2, Math.round(VIEW.cssH * s));
  if (GL3D.canvas.width !== w || GL3D.canvas.height !== h) { GL3D.canvas.width = w; GL3D.canvas.height = h; }
  GL3D.scale = s;
};

/* ---------------- intro particle field (drawn behind the HTML splash) ---------------- */
function glIntro(t) {
  if (!GL3D.ok && !glInit()) return false;
  const gl = GL3D.gl;
  if (!GL3D.P.pts) {
    try { GL3D.P.pts = glCompile(gl, SH.ptsV, SH.ptsF, 'particles'); } catch (e) { GL3D.P.pts = null; return false; }
    const N = 2600, d = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) d[i] = Math.random();
    GL3D.ptsBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.ptsBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); GL3D.ptsN = N;
  }
  const P = GL3D.P.pts; GL3D.resize();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, GL3D.canvas.width, GL3D.canvas.height);
  gl.clearColor(0.012, 0.012, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.enableVertexAttribArray(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.ptsBuf); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.uniform1f(P.u.uT, t / 60); gl.uniform1f(P.u.uAspect, VIEW.LW / VIEW.LH); gl.uniform1f(P.u.uPx, GL3D.canvas.height * 0.012);
  gl.drawArrays(gl.POINTS, 0, GL3D.ptsN);
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
  return true;
}

/* ---------------- per-frame camera + light ---------------- */
const CAM3D = { K: 1100, D: 1100, h: 0, dx: 0 };
function glBeginFrame(v, env) {
  const LW = VIEW.LW, LH = VIEW.LH, aspect = LW / LH;
  // dolly: the camera distance follows the 2D zoom so the gameplay plane maps exactly like the gameplay camera
  const D = CAM3D.K / v.z, tanH = LH / (2 * CAM3D.K);
  const tx = v.x, ty = -v.y;                                                       // look-at target on the gameplay plane
  const midX = STAGE.x + STAGE.w / 2;
  const h = D * (0.13 + 0.07 * clamp(1.1 - v.z, 0, 0.5)) + 40;                    // camera height above the target: look down on the platforms
  const dx = clamp((tx - midX) * 0.12, -90, 90);                                    // slight orbit as the camera pans across the arena
  const ex = tx + dx, ey = ty + h, ez = D;
  GL3D.eye = [ex, ey, ez]; CAM3D.D = D; CAM3D.h = h; CAM3D.dx = dx;
  const n = Math.max(20, D * 0.08), f = D + 7000; GL3D.nf = [n, f];                // (near / far: postfx.js linearises depth with them)
  const xc = -dx * n / D, yc = -h * n / D;                                          // lens shift: keep the target dead centre
  M4.frustum(GL3D.Proj, -n * tanH * aspect + xc, n * tanH * aspect + xc, -n * tanH + yc, n * tanH + yc, n, f);
  if (v.roll) {                                                                     // smash-cam roll, about the screen centre (aspect-correct, in clip space)
    const r = -v.roll, c = Math.cos(r), s = Math.sin(r), R = M4.ident(GL3D.tmp);
    R[0] = c; R[4] = -s / aspect; R[1] = s * aspect; R[5] = c;
    M4.mul(GL3D.Proj, R, new Float32Array(GL3D.Proj));
  }
  M4.ident(GL3D.V); GL3D.V[12] = -ex; GL3D.V[13] = -ey; GL3D.V[14] = -ez;
  M4.mul(GL3D.VP, GL3D.Proj, GL3D.V); M4.invert(GL3D.invVP, GL3D.VP); GL3D.mainVP.set(GL3D.VP);
  glLight(midX, -(STAGE.y - 160), Math.max(900, (BZ.r - BZ.l) * 0.42));
  glResetDraw(env);
}
// key light from the upper left, in front: shadows fall back and to the right onto the platform tops
function glLight(cx, cy, R) {
  const L = V3.norm([0.42, -1, -0.5]); GL3D.lightDir = L;
  const lv = M4.lookAt(new Float32Array(16), cx - L[0] * 2000, cy - L[1] * 2000, -L[2] * 2000, cx, cy, 0, 0, 0, -1);
  const lp = M4.ortho(new Float32Array(16), -R, R, -R * 0.75, R * 0.75, 100, 4200);
  M4.mul(GL3D.LVP, lp, lv);
}
// A free camera for viewports (menus, portraits, previews): eye → target, vertical field of view, aspect
// keep = true: the new view's items are appended after the previous view's (which stay inspectable until the next frame)
function glViewCamera(eye, target, fovY, aspect, env, near, far, keep) {
  M4.persp(GL3D.Proj, fovY, aspect, near || 10, far || 9000); GL3D.nf = [near || 10, far || 9000];
  M4.lookAt(GL3D.V, eye[0], eye[1], eye[2], target[0], target[1], target[2], 0, 1, 0);
  M4.mul(GL3D.VP, GL3D.Proj, GL3D.V); M4.invert(GL3D.invVP, GL3D.VP);
  GL3D.eye = eye.slice(); GL3D.lightDir = V3.norm([0.42, -1, -0.5]);
  glResetDraw(env, keep);
}
function glResetDraw(env, keep) { GL3D.env = env; if (keep) GL3D.base = GL3D.n; else { GL3D.n = 0; GL3D.base = 0; } if (BAT.lit) for (const k of ['lit', 'flat', 'alpha', 'glow']) BAT[k].reset();
  if (typeof tubeReset === 'function') tubeReset(keep); }                          // (the smooth-limb mesh pool: render/tubes.js)

/* ---------------- draw list ---------------- */
// Get a pooled draw item. Fields: mesh, m (model), col, spec, shin, metal, emis, alpha, toon, outline, shadow, glow…
function glItem(mesh) {
  let it = GL3D.items[GL3D.n];
  if (!it) it = GL3D.items[GL3D.n] = { m: new Float32Array(16), nm: new Float32Array(9) };
  GL3D.n++;
  it.mesh = mesh; it.col = null; it.spec = 0.35; it.shin = 24; it.metal = 0; it.emis = 0; it.alpha = 1; it.toon = 1; it.outline = 0;
  it.shadow = true; it.glow = 0; it.glowPow = 2; it.aoY = -1e6; it.aoK = 0; it.rimK = 0.6; it.decal = false; it.cull = true; it.rimCol = null; it.outCol = null;
  it.dmg = null; it.inkPx = null; it.nmOK = false; it.outMesh = null;
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
const NO_DMG = new Float32Array(4);

/* ---------------- flush: run all passes over the collected items ----------------
 * o.sky      sky parameters (procedural sky) — or o.clear = [r,g,b] to clear to a colour (o.keep: keep the colour buffer)
 * o.shadow   false = no shadow pass         o.vp = [x, y, w, h] viewport in device pixels (bottom-left origin)
 * o.weather  a weather system (render/weather3d.js)   o.post = screen-effect parameters   o.fbo = render target */
function glFlush(o) {
  o = o || {};
  const gl = GL3D.gl, E = GL3D.env, items = GL3D.items, N = GL3D.n, B0 = GL3D.base || 0;
  for (let i = B0; i < N; i++) { const it = items[i]; if (!it.nmOK) M4.normal(it.nm, it.m); }
  for (const k of ['lit', 'flat', 'alpha', 'glow']) BAT[k].upload(gl);
  gl.enableVertexAttribArray(0); gl.disableVertexAttribArray(2);
  const vp = o.vp || [0, 0, GL3D.canvas.width, GL3D.canvas.height];
  // 1. shadow map
  const shadowOn = o.shadow !== false && GL3D.shadowOK && (SET.res !== 'balanced' || !GL3D.mobile);
  gl.disable(gl.SCISSOR_TEST);
  if (shadowOn) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL3D.shFbo); gl.viewport(0, 0, GL3D.shadowSize, GL3D.shadowSize);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const P = GL3D.P.dep; gl.useProgram(P.p); gl.disableVertexAttribArray(1); gl.uniformMatrix4fv(P.u.uLightVP, false, GL3D.LVP);
    for (let i = B0; i < N; i++) { const it = items[i]; if (!it.shadow || it.glow || it.decal || it.alpha < 0.5 || !it.mesh.count) continue;
      bindMesh(gl, it.mesh, false); gl.uniformMatrix4fv(P.u.uModel, false, it.m); drawElems(gl, it.mesh); }
    if (BAT.lit.ni) { gl.uniformMatrix4fv(P.u.uModel, false, GL3D.I16); BAT.lit.bind(gl, false, false); BAT.lit.draw(gl); }
  }
  // 2. target + background: procedural sky, or a plain clear
  gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo || null); gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  if (o.vp) { gl.enable(gl.SCISSOR_TEST); gl.scissor(vp[0], vp[1], vp[2], vp[3]); }
  if (o.keep) gl.clear(gl.DEPTH_BUFFER_BIT);
  else { const c = o.clear || E.fog; gl.clearColor(c[0], c[1], c[2], o.glowMask ? 0 : c[3] === undefined ? 1 : c[3]); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
  // post FX bloom mask (o.glowMask): the target's alpha only receives emissive opaque surfaces + the additive glows
  const gm = !!o.glowMask, maskA = on => { if (gm) gl.colorMask(true, true, true, on); };
  maskA(false);
  if (o.sky) glDrawSky(o.sky);
  maskA(true);
  // 3. lit meshes
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.enableVertexAttribArray(1);
  const L = GL3D.P.lit; gl.useProgram(L.p);
  gl.uniformMatrix4fv(L.u.uVP, false, GL3D.VP); gl.uniformMatrix4fv(L.u.uLightVP, false, GL3D.LVP);
  gl.uniform3fv(L.u.uLightDir, GL3D.lightDir); gl.uniform3fv(L.u.uLightCol, E.light); gl.uniform3fv(L.u.uSky, E.sky); gl.uniform3fv(L.u.uGround, E.ground);
  gl.uniform3fv(L.u.uFog, E.fog); gl.uniform3fv(L.u.uEye, GL3D.eye); gl.uniform2f(L.u.uFogR, E.fogNear || 4000, E.fogFar || 9000);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, GL3D.shTex); gl.uniform1i(L.u.uShadow, 1);
  gl.uniform1f(L.u.uShadowOn, shadowOn ? 1 : 0); gl.uniform1f(L.u.uTexel, 1 / GL3D.shadowSize);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(L.u.uVA, 0); gl.uniform1f(L.u.uEmisU, 0); gl.uniform1f(L.u.uGlowA, gm ? 1 : 0);
  let lastDmg = null;
  const drawLit = it => {
    bindMesh(gl, it.mesh, true);
    gl.uniformMatrix4fv(L.u.uModel, false, it.m); gl.uniformMatrix3fv(L.u.uNormalM, false, it.nm);
    if (it.mesh.cb) { gl.enableVertexAttribArray(2); gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.cb); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0); }   // per-vertex colours
    else { gl.disableVertexAttribArray(2); const c = it.col || [1, 1, 1]; gl.vertexAttrib4f(2, c[0], c[1], c[2], it.emis); }
    gl.uniform4f(L.u.uMat, it.spec, it.shin, it.metal, it.toon);
    gl.uniform1f(L.u.uAlpha, it.alpha); gl.uniform1f(L.u.uAOy, it.aoY); gl.uniform1f(L.u.uAOk, it.aoK); gl.uniform1f(L.u.uRimK, it.rimK);
    gl.uniform3fv(L.u.uRim, it.rimCol || E.rim);                                     // (Gold / Void skins tint their own rim light)
    const dm = it.dmg || NO_DMG; if (dm !== lastDmg) { gl.uniform4fv(L.u.uDmg, dm); lastDmg = dm; }
    if (it.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    drawElems(gl, it.mesh);
  };
  const batchLit = (b, alphaMode) => {
    if (!b.ni) return;
    gl.uniformMatrix4fv(L.u.uModel, false, GL3D.I16); gl.uniformMatrix3fv(L.u.uNormalM, false, GL3D.I9);
    gl.uniform4f(L.u.uMat, 0.45, 36, 0, 1); gl.uniform1f(L.u.uAlpha, 1); gl.uniform1f(L.u.uAOy, -1e6); gl.uniform1f(L.u.uAOk, 0); gl.uniform1f(L.u.uRimK, 0.55);
    gl.uniform3fv(L.u.uRim, E.rim); gl.uniform4fv(L.u.uDmg, NO_DMG); lastDmg = NO_DMG;
    gl.uniform1f(L.u.uVA, alphaMode ? 1 : 0); gl.uniform1f(L.u.uEmisU, alphaMode ? 0.35 : 0);
    gl.disable(gl.CULL_FACE); b.bind(gl, true, true); b.draw(gl); gl.disableVertexAttribArray(2);
    gl.uniform1f(L.u.uVA, 0); gl.uniform1f(L.u.uEmisU, 0);
  };
  gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
  const trans = [];
  for (let i = B0; i < N; i++) { const it = items[i]; if (!it.mesh.count || it.glow) continue; if (it.alpha < 1 || it.decal) { trans.push(it); continue; } drawLit(it); }
  gl.disableVertexAttribArray(2);
  batchLit(BAT.lit); batchLit(BAT.flat);
  maskA(false); gl.uniform1f(L.u.uGlowA, 0);
  // 4. ink outlines (inverted hull: back faces pushed out along the normals, a bold screen-space line weight)
  const O = GL3D.P.out; gl.useProgram(O.p); gl.uniformMatrix4fv(O.u.uVP, false, GL3D.VP); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
  const comicInk = typeof fxMode === 'function' && fxMode() === 'comic' && !o.vp ? 1.3 : 1;   // Comic post FX: extra-bold comic-book ink
  const k = GL3D.scale * Math.max(0.8, Math.min(1.6, vp[3] / GL3D.scale / 720)) * comicInk, ink = E.ink || [0.02, 0.02, 0.05, 1];
  gl.uniform2f(O.u.uRes, vp[2], vp[3]); gl.uniform2f(O.u.uPx, 2.1 * k, 5.5 * k);
  gl.uniform3fv(O.u.uFog, E.fog); gl.uniform3fv(O.u.uEye, GL3D.eye); gl.uniform2f(O.u.uFogR, E.fogNear || 4000, E.fogFar || 9000);
  let lastPx = null;
  for (let i = B0; i < N; i++) { const it = items[i]; if (!it.outline || it.glow || it.alpha < 1 || !it.mesh.count) continue;
    const om = it.outMesh || it.mesh;
    bindMesh(gl, om, true); gl.uniformMatrix4fv(O.u.uModel, false, it.m); gl.uniformMatrix3fv(O.u.uNormalM, false, it.nm);
    if (it.inkPx !== lastPx) { lastPx = it.inkPx; if (it.inkPx) gl.uniform2f(O.u.uPx, it.inkPx[0] * k, it.inkPx[1] * k); else gl.uniform2f(O.u.uPx, 2.1 * k, 5.5 * k); }
    gl.uniform1f(O.u.uThick, it.outline); gl.uniform4fv(O.u.uCol, it.outCol || ink); drawElems(gl, om); }
  if (BAT.lit.ni) { gl.uniform2f(O.u.uPx, 1.8 * k, 4 * k); gl.uniformMatrix4fv(O.u.uModel, false, GL3D.I16); gl.uniformMatrix3fv(O.u.uNormalM, false, GL3D.I9);
    gl.uniform1f(O.u.uThick, 1.2); gl.uniform4fv(O.u.uCol, ink); BAT.lit.bind(gl, true, false); BAT.lit.draw(gl); }
  gl.cullFace(gl.BACK);
  // 5. transparent meshes, back to front
  if (trans.length || BAT.alpha.ni) {
    gl.useProgram(L.p); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    trans.sort((a, b) => a.m[14] - b.m[14]);
    for (const it of trans) { gl.depthMask(!!it.decal); drawLit(it); }
    gl.disableVertexAttribArray(2); gl.depthMask(false); batchLit(BAT.alpha, true);
    gl.depthMask(true);
  }
  // 6. weather (snow, leaves, rain streaks, dust lines…)
  if (o.weather && typeof drawWeather3D === 'function') drawWeather3D(o.weather, vp);
  // 7. additive glows (eyes, energy blades, shields, projectiles, sparks)
  maskA(true);
  const Gp = GL3D.P.glow; gl.useProgram(Gp.p); gl.uniformMatrix4fv(Gp.u.uVP, false, GL3D.VP); gl.uniform3fv(Gp.u.uEye, GL3D.eye);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enableVertexAttribArray(1);
  for (let i = B0; i < N; i++) { const it = items[i]; if (!it.glow || !it.mesh.count) continue;
    bindMesh(gl, it.mesh, true); gl.uniformMatrix4fv(Gp.u.uModel, false, it.m); gl.uniformMatrix3fv(Gp.u.uNormalM, false, it.nm);
    const c = it.col || [1, 1, 1]; gl.vertexAttrib4f(2, c[0], c[1], c[2], 1); gl.uniform1f(Gp.u.uK, it.glow); gl.uniform1f(Gp.u.uPow, it.glowPow); drawElems(gl, it.mesh); }
  if (BAT.glow.ni) { gl.uniformMatrix4fv(Gp.u.uModel, false, GL3D.I16); gl.uniformMatrix3fv(Gp.u.uNormalM, false, GL3D.I9); gl.uniform1f(Gp.u.uK, 1); gl.uniform1f(Gp.u.uPow, 0.9);
    BAT.glow.bind(gl, true, true); BAT.glow.draw(gl); gl.disableVertexAttribArray(2); }
  gl.depthMask(true); gl.disable(gl.BLEND);
  // 8. screen effects
  if (o.post) glDrawPost(o.post, vp);
  gl.disable(gl.SCISSOR_TEST);
  for (let i = B0; i < N; i++) items[i].nmOK = false;
}

/* ---------------- sky + screen-effect passes ---------------- */
function glDrawSky(S) {
  const gl = GL3D.gl, P = GL3D.P.sky; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(P.u.uInvVP, false, GL3D.invVP);
  for (const k of ['uZen', 'uHor', 'uGnd', 'uSunDir', 'uSunCol', 'uCl1', 'uCl2', 'uAur1', 'uAur2', 'uMoonDir', 'uMoonCol']) gl.uniform3fv(P.u[k], S[k.slice(1)] || [0, 0, 0]);
  gl.uniform4fv(P.u.uK, S.K); gl.uniform4f(P.u.uK2, (G.time % 216000) / 60, S.moon || 0, S.cloudH || 9, S.horGlow || 0);
  gl.uniform3fv(P.u.uFlash, S.flash || [0, 0, 0]);
  gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
}
function glDrawPost(Q, vp) {
  const gl = GL3D.gl, P = GL3D.P.post; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform4f(P.u.uA, Q.vig || 0, Q.flash || 0, Q.red || 0, Q.emerg || 0); gl.uniform4f(P.u.uB, Q.blind || 0, Q.dim || 0, Q.storm || 0, 0);
  gl.uniform1f(P.u.uAspect, vp[2] / vp[3]); gl.uniform1f(P.u.uT, G.time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (Q.invert) { gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ZERO); gl.uniform4f(P.u.uA, 0, 1, 0, 0); gl.uniform4f(P.u.uB, 0, 0, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
}

/* Allocation-free transform: o = T(x,y,z) · Ry(ry) · Rz(rz) · Rx(rx) · S(sx,sy,sz)  (the same convention as trs()) */
function xf(o, x, y, z, sx, sy, sz, ry, rz, rx) {
  const cy = Math.cos(ry || 0), sy_ = Math.sin(ry || 0), cz = Math.cos(rz || 0), sz_ = Math.sin(rz || 0), cx = Math.cos(rx || 0), sx_ = Math.sin(rx || 0);
  // A = Rz·Rx (rows), R = Ry·A
  const a00 = cz, a01 = -sz_ * cx, a02 = sz_ * sx_, a10 = sz_, a11 = cz * cx, a12 = -cz * sx_, a20 = 0, a21 = sx_, a22 = cx;
  const r00 = cy * a00 + sy_ * a20, r01 = cy * a01 + sy_ * a21, r02 = cy * a02 + sy_ * a22;
  const r20 = -sy_ * a00 + cy * a20, r21 = -sy_ * a01 + cy * a21, r22 = -sy_ * a02 + cy * a22;
  o[0] = r00 * sx; o[1] = a10 * sx; o[2] = r20 * sx; o[3] = 0;
  o[4] = r01 * sy; o[5] = a11 * sy; o[6] = r21 * sy; o[7] = 0;
  o[8] = r02 * sz; o[9] = a12 * sz; o[10] = r22 * sz; o[11] = 0;
  o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
}
// basis transform from a segment a→b (world points): local +Y runs a→b (length L), X/Z have radius r (for tubes, cones, beams)
function xfSeg(o, a, b, rx, rz) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001; dx /= L; dy /= L; dz /= L;
  let X0 = dy, X1 = -dx, X2 = 0; if (X0 * X0 + X1 * X1 < 0.0001) { X0 = 0; X1 = dz; X2 = -dy; }    // X = Y × Z(0,0,1)  (fallback: Y × X)
  let l = Math.sqrt(X0 * X0 + X1 * X1 + X2 * X2); X0 /= l; X1 /= l; X2 /= l;
  const Z0 = X1 * dz - X2 * dy, Z1 = X2 * dx - X0 * dz, Z2 = X0 * dy - X1 * dx, r2 = rz === undefined ? rx : rz;
  o[0] = X0 * rx; o[1] = X1 * rx; o[2] = X2 * rx; o[3] = 0; o[4] = dx * L; o[5] = dy * L; o[6] = dz * L; o[7] = 0;
  o[8] = Z0 * r2; o[9] = Z1 * r2; o[10] = Z2 * r2; o[11] = 0; o[12] = a[0]; o[13] = a[1]; o[14] = a[2]; o[15] = 1; return o;
}

/* ---------------- render-to-image (menu portraits, stage thumbnails) ----------------
 * Draws one view into an offscreen framebuffer at 2× and returns a 2D canvas (downsampled = anti-aliased). Used
 * once per portrait / thumbnail and cached, so the read-back never runs during gameplay. */
function glSnapshot(w, h, draw) {
  if (!GL3D.ok) return null;
  const gl = GL3D.gl, W2 = w * 2, H2 = h * 2;
  let S = GL3D.snap;
  if (!S || S.w !== W2 || S.h !== H2) {
    if (S) { gl.deleteFramebuffer(S.fbo); gl.deleteTexture(S.tex); gl.deleteRenderbuffer(S.rb); }
    S = GL3D.snap = { w: W2, h: H2, tex: glTex(W2, H2, null, gl.LINEAR), fbo: gl.createFramebuffer(), rb: gl.createRenderbuffer(), px: new Uint8Array(W2 * H2 * 4) };
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, S.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W2, H2);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.rb);
    S.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  if (!S.ok) return null;
  draw({ fbo: S.fbo, vp: [0, 0, W2, H2], aspect: w / h });
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.readPixels(0, 0, W2, H2, gl.RGBA, gl.UNSIGNED_BYTE, S.px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const big = document.createElement('canvas'); big.width = W2; big.height = H2; const bc = big.getContext('2d'), img = bc.createImageData(W2, H2), row = W2 * 4;
  for (let y = 0; y < H2; y++) img.data.set(S.px.subarray((H2 - 1 - y) * row, (H2 - y) * row), y * row);   // (GL rows are bottom-up)
  bc.putImageData(img, 0, 0);
  const out = document.createElement('canvas'); out.width = w; out.height = h; const oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(big, 0, 0, w, h);
  return out;
}
