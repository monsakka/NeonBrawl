/* NEON BRAWL — Real-time 3D weather (WebGL). Every particle is real geometry — rain drops are thin 3D streaks
 * stretched along their fall, snow flakes and embers are tiny crystals, leaves / petals / confetti are flat cards
 * tumbling in 3D, bubbles are spheres with a fresnel rim — animated entirely on the GPU: one static buffer per system
 * (template geometry × N, each copy carrying a random seed), and the vertex shader moves, spins and wraps each
 * particle inside a box that follows the camera, from deep behind the arena to just in front of the lens. So rain
 * falls between you and the fighters, desert dust lines stream along the Z axis toward the camera, snow drifts
 * through the scenery. Purely cosmetic: it never touches the simulation (and uses no gameplay RNG).            */
'use strict';

const WEATHER3D = { key: null, sys: [], prog: null };

SH.wxV = `attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aWS;
uniform mat4 uVP; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform vec3 uVel; uniform float uT; uniform vec3 uSz;
uniform float uSpin; uniform float uSway; uniform vec3 uLightDir; uniform vec3 uEye; uniform vec3 uCol; uniform vec3 uCol2; uniform float uMode; uniform float uAlpha; uniform float uFlash;
varying vec3 vC; varying float vA;
vec3 rotA(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main(){
  float r = aWS.w;
  vec3 vel = uVel * (0.7 + 0.6 * fract(r * 13.7));
  vec3 p = aWS.xyz * uBoxSize + vel * uT;
  p.x += sin(uT * 1.3 + r * 40.0) * uSway; p.z += cos(uT * 0.9 + r * 25.0) * uSway * 0.6;
  vec3 q = mod(p - uBoxMin, uBoxSize);
  vec3 e3 = min(q, uBoxSize - q) / (uBoxSize * 0.08);
  float edge = clamp(min(min(e3.x, e3.y), e3.z), 0.0, 1.0);
  p = uBoxMin + q;
  float s = uSz.x * (1.0 - uSz.z + uSz.z * 2.0 * fract(r * 7.31));
  vec3 lp = aPos * s, n = aNor;
  if (uSz.y > 0.0) {                                                   // streaks: local +Y along the velocity, stretched
    vec3 Y = normalize(vel), X = normalize(cross(Y, abs(Y.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0))), Z = cross(X, Y);
    lp = X * lp.x + Y * aPos.y * uSz.y + Z * lp.z; n = X * n.x + Y * n.y + Z * n.z;
  } else {                                                             // everything else tumbles about its own random axis
    vec3 k = normalize(vec3(fract(r * 3.1) - 0.5, 0.7, fract(r * 5.7) - 0.5)); float a = r * 6.283 + uT * uSpin * (0.5 + fract(r * 9.1));
    lp = rotA(lp, k, a); n = rotA(n, k, a);
  }
  vec3 w = p + lp;
  float dc = length(uEye - w); vec3 V = (uEye - w) / dc;
  float near = smoothstep(70.0, 240.0, dc);
  vec3 col; float d = abs(dot(normalize(n), -uLightDir));
  if (uMode < 0.5) col = mix(uCol2, uCol, step(0.35, d)) * (0.88 + 0.24 * fract(r * 17.0));                       // toon-lit flakes / leaves / petals
  else if (uMode < 1.5) col = uCol * (0.45 + 0.55 * fract(r * 23.0)) * (0.55 + 0.9 * (1.0 - smoothstep(250.0, 1800.0, dc))) + uFlash;   // rain / dust streaks catch the light up close
  else if (uMode < 2.5) col = mix(uCol, uCol2, fract(r * 3.7)) * (0.55 + 0.45 * sin(uT * 3.0 + r * 50.0));          // embers / motes twinkle
  else if (uMode < 3.5) col = uCol * (pow(1.0 - abs(dot(normalize(n), V)), 1.6) + 0.06);                             // bubbles: fresnel rim
  else { vec3 h = 0.5 + 0.5 * cos(6.2831 * (fract(r * 7.0) + vec3(0.0, 0.33, 0.67))); col = h * (step(0.35, d) * 0.35 + 0.75); }   // confetti
  vC = col; vA = uAlpha * edge * near;
  gl_Position = uVP * vec4(w, 1.0);
}`;
SH.wxF = GLSL_PREC + `varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }`;

// template shapes (centred, unit size)
const WX_TPL = {
  streak: () => GEO.box(), flake: () => GEO.octa(), mote: () => GEO.octa(), bubble: () => GEO.sphere(8, 6), cube: () => GEO.box(),
  leaf: () => ({ pos: [0, 1, 0, 0.55, 0, 0, 0, -1, 0, -0.55, 0, 0], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 2, 1, 0, 3, 2] }),
  card: () => ({ pos: [-1, -0.6, 0, 1, -0.6, 0, 1, 0.6, 0, -1, 0.6, 0], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2, 0, 2, 3] })
};
// mode: 0 toon-lit, 1 streak (additive), 2 twinkling mote (additive), 3 bubble (additive), 4 confetti
const WX_KIND = {
  rain:     { tpl: 'streak', n: 1500, vel: [-110, -1250, 30], sz: [0.85, 30, 0.3], mode: 1, add: true, col: [0.62, 0.72, 0.95], a: 0.42 },
  drizzle:  { tpl: 'streak', n: 800, vel: [-70, -950, 0], sz: [0.7, 22, 0.3], mode: 1, add: true, col: [0.5, 0.65, 0.95], a: 0.32 },
  snow:     { tpl: 'flake', n: 1100, vel: [40, -95, 20], sz: [2.6, 0, 0.45], mode: 0, spin: 1.6, sway: 26, col: [1, 1, 1], col2: [0.7, 0.82, 1], a: 0.95 },
  dust:     { tpl: 'streak', n: 520, vel: [240, -14, 560], sz: [0.9, 70, 0.4], mode: 1, add: true, col: [0.95, 0.78, 0.52], a: 0.28 },
  sand:     { tpl: 'flake', n: 500, vel: [300, -30, 380], sz: [1.4, 0, 0.5], mode: 0, spin: 4, sway: 10, col: [0.98, 0.84, 0.6], col2: [0.75, 0.55, 0.35], a: 0.8 },
  embers:   { tpl: 'mote', n: 520, vel: [24, 150, 30], sz: [2.2, 0, 0.5], mode: 2, add: true, spin: 3, sway: 34, col: [1, 0.45, 0.12], col2: [1, 0.85, 0.35], a: 1 },
  ash:      { tpl: 'flake', n: 420, vel: [30, -60, 10], sz: [1.8, 0, 0.5], mode: 0, spin: 2, sway: 30, col: [0.42, 0.38, 0.38], col2: [0.2, 0.18, 0.18], a: 0.85 },
  petals:   { tpl: 'leaf', n: 280, vel: [70, -75, 30], sz: [5, 0, 0.35], mode: 0, spin: 2.2, sway: 40, col: [1, 0.72, 0.84], col2: [0.85, 0.42, 0.6], a: 0.95 },
  leaves:   { tpl: 'leaf', n: 200, vel: [60, -85, 20], sz: [6.5, 0, 0.35], mode: 0, spin: 2, sway: 44, col: [0.45, 0.85, 0.35], col2: [0.22, 0.5, 0.2], a: 0.95 },
  fireflies:{ tpl: 'mote', n: 220, vel: [0, 12, 0], sz: [2.4, 0, 0.4], mode: 2, add: true, spin: 1, sway: 60, col: [0.55, 1, 0.55], col2: [0.95, 1, 0.5], a: 1 },
  feathers: { tpl: 'leaf', n: 120, vel: [40, -50, 10], sz: [6, 0, 0.3], mode: 0, spin: 1.2, sway: 50, col: [1, 1, 1], col2: [0.8, 0.82, 0.9], a: 0.95 },
  gold:     { tpl: 'mote', n: 300, vel: [10, 40, 10], sz: [2, 0, 0.5], mode: 2, add: true, spin: 2, sway: 40, col: [1, 0.85, 0.4], col2: [1, 1, 0.8], a: 1 },
  stardust: { tpl: 'mote', n: 420, vel: [0, 0, 70], sz: [1.8, 0, 0.6], mode: 2, add: true, spin: 1, sway: 10, col: [1, 1, 1], col2: [0.55, 0.7, 1], a: 1 },
  bubbles:  { tpl: 'bubble', n: 260, vel: [0, 140, 0], sz: [4, 0, 0.6], mode: 3, add: true, spin: 0, sway: 22, col: [0.6, 0.92, 1], a: 1 },
  marine:   { tpl: 'mote', n: 420, vel: [0, -20, 0], sz: [1.2, 0, 0.5], mode: 2, add: true, spin: 1, sway: 16, col: [0.4, 0.7, 0.8], col2: [0.7, 0.9, 1], a: 0.6 },
  sparkle:  { tpl: 'mote', n: 320, vel: [0, 20, 0], sz: [2, 0, 0.6], mode: 2, add: true, spin: 3, sway: 30, col: [0.75, 0.6, 1], col2: [0.6, 1, 1], a: 1 },
  spores:   { tpl: 'mote', n: 420, vel: [20, 40, 10], sz: [2.2, 0, 0.5], mode: 2, add: true, spin: 2, sway: 44, col: [0.6, 1, 0.18], col2: [0.9, 1, 0.5], a: 0.9 },
  sparks:   { tpl: 'streak', n: 160, vel: [40, -420, 40], sz: [0.9, 10, 0.4], mode: 1, add: true, col: [1, 0.7, 0.3], a: 0.8 },
  confetti: { tpl: 'card', n: 360, vel: [10, -120, 10], sz: [3.6, 0, 0.3], mode: 4, spin: 4.5, sway: 34, col: [1, 1, 1], a: 0.95 },
  motes:    { tpl: 'mote', n: 240, vel: [10, 8, 4], sz: [1.6, 0, 0.5], mode: 2, add: true, spin: 1, sway: 30, col: [0.75, 0.8, 0.9], col2: [1, 1, 1], a: 0.45 },
  wisps:    { tpl: 'mote', n: 160, vel: [0, 30, 0], sz: [3, 0, 0.5], mode: 2, add: true, spin: 1, sway: 60, col: [0.6, 0.4, 1], col2: [0.4, 1, 0.8], a: 0.7 },
  holo:     { tpl: 'cube', n: 170, vel: [0, 34, 0], sz: [3, 0, 0.6], mode: 2, add: true, spin: 1.5, sway: 12, col: [0.24, 0.94, 1], col2: [0.5, 1, 0.9], a: 0.8 }
};
const WX_STAGE = {
  storm: ['rain'], neon: ['drizzle'], highway: ['drizzle'], expressway: ['drizzle'], aurora: ['snow'], peak: ['snow'], desert: ['dust', 'sand'],
  volcano: ['embers', 'ash'], caldera: ['embers', 'ash'], forest: ['fireflies', 'leaves'], ruins: ['leaves'], shrine: ['petals'], temple: ['petals'], grid: ['petals'],
  haven: ['feathers'], sanctuary: ['feathers', 'gold'], celestial: ['gold'], space: ['stardust'], starlight: ['stardust'], skyline: ['stardust'], observatory: ['stardust'],
  astral: ['stardust', 'wisps'], nebula: ['stardust', 'wisps'], abyss: ['bubbles', 'marine'], matrix: ['sparkle'], vault: ['sparkle'], citadel: ['sparkle'], quantum: ['spores'], clockwork: ['sparks'],
  dock: ['motes'], stadium: ['confetti'], cybercol: ['confetti'], forge: ['confetti'], speedway: ['confetti'], subway: ['motes'], obsidian: ['ash', 'wisps'], training: ['holo']
};

function buildWeatherSys(kind) {
  const gl = GL3D.gl, K = WX_KIND[kind], t = WX_TPL[K.tpl](), n = Math.round(K.n * (GL3D.mobile ? 0.55 : 1) * (SET.part === 0 ? 0.4 : 1));
  const nv = t.pos.length / 3, pos = new Float32Array(n * nv * 3), nor = new Float32Array(n * nv * 3), ws = new Float32Array(n * nv * 4), idx = new Uint16Array(n * t.idx.length);
  for (let i = 0; i < n; i++) {
    const sx = Math.random(), sy = Math.random(), sz = Math.random(), r = Math.random();     // (cosmetic: native RNG, never the netplay one)
    for (let v = 0; v < nv; v++) { const o = (i * nv + v) * 3, o4 = (i * nv + v) * 4;
      pos[o] = t.pos[v * 3]; pos[o + 1] = t.pos[v * 3 + 1]; pos[o + 2] = t.pos[v * 3 + 2]; nor[o] = t.nor[v * 3]; nor[o + 1] = t.nor[v * 3 + 1]; nor[o + 2] = t.nor[v * 3 + 2];
      ws[o4] = sx; ws[o4 + 1] = sy; ws[o4 + 2] = sz; ws[o4 + 3] = r; }
    for (let k = 0; k < t.idx.length; k++) idx[i * t.idx.length + k] = t.idx[k] + i * nv;
  }
  const mk = d => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return b; };
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  return { K, vb: mk(pos), nb: mk(nor), wb: mk(ws), ib, count: idx.length };
}
function freeWeather() { const gl = GL3D.gl; for (const s of WEATHER3D.sys) { gl.deleteBuffer(s.vb); gl.deleteBuffer(s.nb); gl.deleteBuffer(s.wb); gl.deleteBuffer(s.ib); } WEATHER3D.sys = []; }

// Called once per frame: (re)build for the stage, and fit the particle box around the camera's view
function weatherFor(stageId, v) {
  if (!GL3D.ok) return null;
  const key = stageId + '|' + SET.part;
  if (WEATHER3D.key !== key) {
    freeWeather(); WEATHER3D.key = key;
    if (!WEATHER3D.prog) try { WEATHER3D.prog = glCompile(GL3D.gl, SH.wxV, SH.wxF, 'weather'); } catch (e) { console.error('[NEON BRAWL] weather shader', e.message); WEATHER3D.prog = false; }
    if (WEATHER3D.prog) WEATHER3D.sys = (WX_STAGE[stageId] || []).map(buildWeatherSys);
  }
  if (!WEATHER3D.prog || !WEATHER3D.sys.length) return null;
  const D = CAM3D.K / v.z, back = 1100, front = Math.min(D * 0.62, D - 160), k = (D + back) / D;
  const hw = VIEW.LW / v.z * 0.5 * k + 160, hh = VIEW.LH / v.z * 0.5 * k + 160, cy = -v.y + CAM3D.h * 0.4;
  return { min: [v.x - hw, cy - hh, -back], size: [hw * 2, hh * 2, back + front], flash: ST.id === 'storm' ? stormFlash() * 0.6 : 0 };
}
function drawWeather3D(W, vp) {
  const gl = GL3D.gl, P = WEATHER3D.prog; if (!P) return;
  gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, GL3D.VP);
  gl.uniform3fv(P.u.uBoxMin, W.min); gl.uniform3fv(P.u.uBoxSize, W.size); gl.uniform1f(P.u.uT, (G.time % 216000) / 60);
  gl.uniform3fv(P.u.uLightDir, GL3D.lightDir); gl.uniform3fv(P.u.uEye, GL3D.eye); gl.uniform1f(P.u.uFlash, W.flash || 0);
  gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST);
  gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
  for (const s of WEATHER3D.sys) {
    const K = s.K;
    if (K.add) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3fv(P.u.uVel, K.vel); gl.uniform3fv(P.u.uSz, K.sz); gl.uniform1f(P.u.uSpin, K.spin || 0); gl.uniform1f(P.u.uSway, K.sway || 0);
    gl.uniform3fv(P.u.uCol, K.col); gl.uniform3fv(P.u.uCol2, K.col2 || K.col); gl.uniform1f(P.u.uMode, K.mode); gl.uniform1f(P.u.uAlpha, K.a);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.wb); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ib); gl.drawElements(gl.TRIANGLES, s.count, gl.UNSIGNED_SHORT, 0);
  }
  gl.disableVertexAttribArray(2); gl.depthMask(true); gl.disable(gl.BLEND);
}
