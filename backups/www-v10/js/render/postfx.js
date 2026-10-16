/* NEON BRAWL — the post-processing pipeline (the WebGL "graphics buff"), Settings → Post FX.
 *
 * The main 3D frame (match or menu backdrop) is drawn into an offscreen target — a colour texture plus, where the
 * WEBGL_depth_texture extension exists (almost everywhere), a 24-bit depth texture — and then composited:
 *
 *   bloom     a saturation-aware bright pass (energy, neon and glows bloom; white marble / snow barely does), box-
 *             downsampled to ½ and ¼ resolution and Gaussian-blurred at both (9 taps in 5 linear fetches), added back
 *   SSAO      screen-space ambient occlusion from the depth texture at ½ resolution: 12 spiral taps per pixel with a
 *             per-pixel rotation and a range check, blurred during the composite; deep contact shadows + crevices
 *   ink       comic-book lines wherever depth jumps (silhouettes, overlaps, creases between objects), on top of the
 *             inverted-hull outlines; thinner / lighter with distance so the background stays readable
 *   halftone  printed-comic dots in the shadows (Comic mode)
 *   FXAA      offscreen targets have no hardware MSAA in WebGL 1, so the composite runs FXAA on the scene
 *   grade     a saturation boost and a gentle S-curve
 * Then the usual screen effects (vignette, flashes, Sudden Death lights) go on top. Modes: 'off' (direct, MSAA),
 * 'bloom' (bloom + ink + FXAA, the light option for phones) and 'comic' (everything).                       */
'use strict';

const FX = { tried: false, ok: false, w: 0, h: 0, depthTex: false, P: {}, t: {}, f: {}, err: 0 };
const FX_V = `attribute vec2 aXY; varying vec2 vUV; void main(){ vUV = aXY * 0.5 + 0.5; gl_Position = vec4(aXY, 0.0, 1.0); }`;
const FX_LIN = `uniform vec2 uNF; float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }`;
const FX_SH = {
  // 4-tap box downsample; with uThr > 0 it is the bloom bright pass, keyed on the scene's glow mask (alpha = how
  // emissive the pixel is: additive glows, eyes, energy, lava…), plus a touch for saturated near-white-hot colour
  down: GLSL_PREC + `uniform sampler2D uTex; uniform vec2 uPx; uniform float uThr; varying vec2 vUV;
vec4 tap(vec2 o){ return texture2D(uTex, vUV + o * uPx); }
void main(){
  vec4 s = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25;
  vec3 c = s.rgb;
  if (uThr > 0.0) {
    float m = max(c.r, max(c.g, c.b)), n = min(c.r, min(c.g, c.b)), sat = m > 0.001 ? (m - n) / m : 0.0;
    c *= smoothstep(0.02, 0.55, s.a) + smoothstep(uThr, 1.0, m) * sat * sat * 0.25;
  }
  gl_FragColor = vec4(c, 1.0);
}`,
  // separable 9-tap Gaussian (5 bilinear fetches)
  blur: GLSL_PREC + `uniform sampler2D uTex; uniform vec2 uDir; varying vec2 vUV;
void main(){
  vec3 s = texture2D(uTex, vUV).rgb * 0.2270270270;
  s += (texture2D(uTex, vUV + uDir * 1.3846153846).rgb + texture2D(uTex, vUV - uDir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture2D(uTex, vUV + uDir * 3.2307692308).rgb + texture2D(uTex, vUV - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`,
  // SSAO, normal-aware: view-space positions are rebuilt from linear depth (uP = projection terms P0, P5, P8, P9), the
  // surface normal from the neighbouring positions; only samples above the tangent plane occlude (no self-shadowing of
  // planes seen at an angle). 12 spiral taps, rotated by a 4×4 interleaved pattern that the blur pass removes.
  ao: GLSL_PREC + FX_LIN + `uniform sampler2D uDepth; uniform vec2 uRes; uniform float uProjS; uniform float uR; uniform vec4 uP; varying vec2 vUV;
vec3 pos(vec2 uv){ float z = lin(texture2D(uDepth, uv).r); vec2 n = uv * 2.0 - 1.0; return vec3(z * (n.x + uP.z) / uP.x, z * (n.y + uP.w) / uP.y, z); }
void main(){
  float d0 = texture2D(uDepth, vUV).r;
  if (d0 > 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = pos(vUV); vec2 px = 1.0 / uRes;
  vec3 pr = pos(vUV + vec2(px.x, 0.0)), pl = pos(vUV - vec2(px.x, 0.0)), pu = pos(vUV + vec2(0.0, px.y)), pd = pos(vUV - vec2(0.0, px.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;   // (the flatter side: no normals across edges)
  vec3 N = normalize(cross(dy, dx)); if (N.z > 0.0) N = -N;                                                                         // facing the camera (view looks along +z here)
  vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
  float a = (cell.x * 4.0 + cell.y) * 0.3926991 + 0.2, rp = clamp(uR * uProjS / P.z, 2.0, 40.0), occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i), ang = a + fi * 2.3999632, rr = rp * (0.15 + 0.85 * fract(fi * 0.618034 + 0.13));
    vec3 v = pos(vUV + vec2(cos(ang), sin(ang)) * rr * px) - P; float L = length(v);
    occ += max(0.0, dot(N, v / max(L, 0.001)) - 0.18) * (1.0 - smoothstep(uR * 0.9, uR * 2.4, L));
  }
  occ = occ / 12.0 * (1.0 - smoothstep(1800.0, 5200.0, P.z));
  gl_FragColor = vec4(vec3(clamp(1.0 - occ * 1.6, 0.0, 1.0)), 1.0);
}`,
  // the composite: FXAA scene · blurred AO · depth-edge ink · halftone · bloom · grade
  comp: GLSL_PREC + FX_LIN + `uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uAO; uniform sampler2D uDepth;
uniform vec2 uPx; uniform vec4 uK; uniform vec4 uK2; varying vec2 vUV;
// uK = bloom, AO, ink strength, ink width (px) · uK2 = halftone, saturation, depth available, pixel scale
vec3 fxaa(vec2 uv){
  vec3 nw = texture2D(uScene, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(uScene, uv + vec2(1.0, -1.0) * uPx).rgb;
  vec3 sw = texture2D(uScene, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(uScene, uv + vec2(1.0, 1.0) * uPx).rgb, m = texture2D(uScene, uv).rgb;
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
  vec3 a = 0.5 * (texture2D(uScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(uScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(uScene, uv - dir * 0.5).rgb + texture2D(uScene, uv + dir * 0.5).rgb);
  float lb = dot(b, L);
  return (lb < lmin || lb > lmax) ? a : b;
}
float depthAt(vec2 uv){ return lin(texture2D(uDepth, uv).r); }
void main(){
  vec3 c = fxaa(vUV);
  if (uK.y > 0.0) c *= mix(1.0, texture2D(uAO, vUV).r, uK.y);          // ambient occlusion (½ res, already blurred)
  if (uK.z > 0.0 && uK2.z > 0.5) {                                      // comic ink wherever the depth jumps
    float z0 = depthAt(vUV); vec2 o = uPx * uK.w;
    float zl = depthAt(vUV - vec2(o.x, 0.0)), zr = depthAt(vUV + vec2(o.x, 0.0)), zd = depthAt(vUV - vec2(0.0, o.y)), zu = depthAt(vUV + vec2(0.0, o.y));
    float near = min(z0, min(min(zl, zr), min(zd, zu)));
    float e = max(max(abs(zl - z0), abs(zr - z0)), max(abs(zu - z0), abs(zd - z0))) / near;
    // creases: the second difference of 1/z (exactly zero across any flat surface, however steeply it is seen)
    float crease = (abs(1.0 / zl + 1.0 / zr - 2.0 / z0) + abs(1.0 / zu + 1.0 / zd - 2.0 / z0)) * near;
    float ink = max(smoothstep(0.03, 0.08, e), smoothstep(0.015, 0.04, crease));
    c = mix(c, vec3(0.02, 0.02, 0.06), ink * uK.z * (1.0 - smoothstep(1800.0, 6000.0, near)));
  }
  if (uK2.x > 0.0 && (uK2.z < 0.5 || texture2D(uDepth, vUV).r < 0.9999)) {   // halftone dots in the shadows (on geometry, not the sky)
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / (uK2.w * 4.5));
    float r = clamp((0.4 - l) * 1.5, 0.0, 0.6), dotm = 1.0 - smoothstep(r - 0.07, r, length(fract(g) - 0.5));
    c *= 1.0 - dotm * 0.3 * uK2.x;
  }
  c += (texture2D(uB1, vUV).rgb * 0.7 + texture2D(uB2, vUV).rgb * 1.1) * uK.x;   // bloom
  c = clamp(c, 0.0, 1.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uK2.y);                                           // saturation
  c = clamp(c, 0.0, 1.0); c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);   // gentle S-curve
  gl_FragColor = vec4(c, 1.0);
}`
};

const fxMode = () => (SET.fx === 'off' ? 'off' : SET.fx === 'bloom' ? 'bloom' : 'comic');

function fxTarget(gl, w, h, depth) {
  const t = glTex(w, h, null, gl.LINEAR), f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  let d = null;
  if (depth === 'tex') {
    d = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, d);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, d, 0);
  } else if (depth === 'rb') {
    d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { t, f, d, w, h, ok, depth };
}
function fxFree(gl) {
  for (const T of Object.values(FX.t)) { gl.deleteFramebuffer(T.f); gl.deleteTexture(T.t); if (T.d) (T.depth === 'tex' ? gl.deleteTexture(T.d) : gl.deleteRenderbuffer(T.d)); }
  FX.t = {};
}
// Make sure the targets exist at the canvas size (rebuilt on resize). Returns false if post-processing can't run here.
function fxEnsure() {
  const gl = GL3D.gl; if (!gl || FX.err > 2) return false;
  if (!FX.tried) {
    FX.tried = true;
    try {
      FX.depthTex = !!(gl.getExtension('WEBGL_depth_texture') || gl.getExtension('WEBKIT_WEBGL_depth_texture'));
      for (const k of Object.keys(FX_SH)) FX.P[k] = glCompile(gl, FX_V, FX_SH[k], 'fx-' + k);
      FX.ok = true;
    } catch (e) { console.error('[NEON BRAWL] post FX unavailable:', e.message); FX.ok = false; }
  }
  if (!FX.ok) return false;
  const w = GL3D.canvas.width, h = GL3D.canvas.height;
  if (w !== FX.w || h !== FX.h || !FX.t.scene) {
    fxFree(gl); FX.w = w; FX.h = h;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    FX.t.scene = fxTarget(gl, w, h, FX.depthTex ? 'tex' : 'rb');
    if (!FX.t.scene.ok && FX.depthTex) { fxFree(gl); FX.depthTex = false; FX.t.scene = fxTarget(gl, w, h, 'rb'); }
    FX.t.b1 = fxTarget(gl, hw, hh); FX.t.b2 = fxTarget(gl, hw, hh); FX.t.b3 = fxTarget(gl, qw, qh); FX.t.b4 = fxTarget(gl, qw, qh); FX.t.ao = fxTarget(gl, hw, hh);
    if (!Object.values(FX.t).every(T => T.ok)) { fxFree(gl); FX.ok = false; console.error('[NEON BRAWL] post FX framebuffers incomplete; drawing directly'); return false; }
  }
  return true;
}

// one full-screen pass into target T (null = the screen)
function fxPass(P, T, tex, set) {
  const gl = GL3D.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, T ? T.f : null); gl.viewport(0, 0, T ? T.w : FX.w, T ? T.h : FX.h);
  gl.useProgram(P.p);
  tex.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], i); });
  if (set) set(P.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* A full-frame glFlush with post-processing (falls back to a direct glFlush when Post FX is off / unsupported) */
function glFlushFX(o) {
  const mode = fxMode();
  if (mode === 'off' || o.vp || o.fbo || !fxEnsure()) return glFlush(o);
  const gl = GL3D.gl, post = o.post, S = FX.t.scene;
  try {
    glFlush(Object.assign({}, o, { post: null, fbo: S.f, glowMask: true }));
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL3D.fsq); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const comic = mode === 'comic', T = FX.t, nf = GL3D.nf || [20, 9000], k = GL3D.scale || 1;
    // bloom: bright pass ½ → blur, ¼ → blur
    fxPass(FX.P.down, T.b1, [['uTex', S.t]], u => { gl.uniform2f(u.uPx, 1 / S.w, 1 / S.h); gl.uniform1f(u.uThr, 0.85); });
    fxPass(FX.P.blur, T.b2, [['uTex', T.b1.t]], u => gl.uniform2f(u.uDir, 1 / T.b1.w, 0));
    fxPass(FX.P.blur, T.b1, [['uTex', T.b2.t]], u => gl.uniform2f(u.uDir, 0, 1 / T.b1.h));
    fxPass(FX.P.down, T.b3, [['uTex', T.b1.t]], u => { gl.uniform2f(u.uPx, 1 / T.b1.w, 1 / T.b1.h); gl.uniform1f(u.uThr, 0); });
    fxPass(FX.P.blur, T.b4, [['uTex', T.b3.t]], u => gl.uniform2f(u.uDir, 1.5 / T.b3.w, 0));
    fxPass(FX.P.blur, T.b3, [['uTex', T.b4.t]], u => gl.uniform2f(u.uDir, 0, 1.5 / T.b3.h));
    // SSAO (½ res, from the depth texture)
    const ao = comic && FX.depthTex;
    if (ao) {
      const Pm = GL3D.Proj;
      fxPass(FX.P.ao, T.ao, [['uDepth', S.d]], u => { gl.uniform2f(u.uNF, nf[0], nf[1]); gl.uniform2f(u.uRes, T.ao.w, T.ao.h);
        gl.uniform1f(u.uProjS, Pm[5] * T.ao.h * 0.5); gl.uniform1f(u.uR, 26); gl.uniform4f(u.uP, Pm[0], Pm[5], Pm[8], Pm[9]); });
      fxPass(FX.P.blur, T.b2, [['uTex', T.ao.t]], u => gl.uniform2f(u.uDir, 1 / T.ao.w, 0));          // separable blur (b2 is free again after the bloom)
      fxPass(FX.P.blur, T.ao, [['uTex', T.b2.t]], u => gl.uniform2f(u.uDir, 0, 1 / T.ao.h));
    }
    // composite to the screen
    const tex = [['uScene', S.t], ['uB1', T.b1.t], ['uB2', T.b3.t], ['uAO', T.ao.t]]; if (FX.depthTex) tex.push(['uDepth', S.d]);
    fxPass(FX.P.comp, null, tex, u => { gl.uniform2f(u.uPx, 1 / S.w, 1 / S.h); gl.uniform2f(u.uNF, nf[0], nf[1]);
      gl.uniform4f(u.uK, comic ? 0.75 : 0.7, ao ? 0.85 : 0, comic ? 1 : 0.7, (comic ? 1.6 : 1.2) * k);
      gl.uniform4f(u.uK2, comic ? 1 : 0, comic ? 1.18 : 1.1, FX.depthTex ? 1 : 0, k); });
    gl.activeTexture(gl.TEXTURE0); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    if (post) glDrawPost(post, [0, 0, GL3D.canvas.width, GL3D.canvas.height]);
    FX.frames = (FX.frames || 0) + 1;
  } catch (e) {
    FX.err++; console.error('[NEON BRAWL] post FX failed:', e.message);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); glFlush(o);
  }
}
