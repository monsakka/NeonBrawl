/* NEON BRAWL — Procedural audio engine (Web Audio API). Every sound is synthesised at runtime: no audio files.
 *
 *   Signal chain:  voices → sfx bus ─┐
 *                  sequencer → music bus ─┼→ master → compressor → speakers
 *                  (both buses also feed a shared generated-impulse reverb and a tempo-synced delay)
 *
 *   SFX are triggered by gameplay events (gameEvent() in state.js), by state changes noticed each frame (attacks,
 *   specials, countdown, FINISH!) and by UI pointer events. The soundtrack (audio/music.js) gives every stage its own
 *   procedurally composed track, plus menu and results themes; layers fade in as the fight gets more intense.
 *   Browsers only allow audio after a user gesture, so the context is created on the first tap / click / key.   */
'use strict';

const AUDIO = { ctx: null, ok: false, master: null, sfx: null, music: null, verb: null, delay: null, noise: null,
                mode: null, step: 0, next: 0, timer: 0, intensity: 0, layers: null, prev: [], lastTick: 0, lastClick: 0, ducked: 1 };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function audioUnlock() {
  if (AUDIO.ctx) { if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  let c; try { c = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
  AUDIO.ctx = c;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
  comp.connect(c.destination);
  AUDIO.master = c.createGain(); AUDIO.master.gain.value = 0.9; AUDIO.master.connect(comp);
  AUDIO.sfx = c.createGain(); AUDIO.sfx.connect(AUDIO.master);
  AUDIO.music = c.createGain(); AUDIO.music.gain.value = 0; AUDIO.music.connect(AUDIO.master);
  AUDIO.musicLP = c.createBiquadFilter(); AUDIO.musicLP.type = 'lowpass'; AUDIO.musicLP.frequency.value = 18000; AUDIO.musicLP.connect(AUDIO.music);
  // reverb: a generated stereo impulse (exponentially decaying noise)
  const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  AUDIO.verb = c.createConvolver(); AUDIO.verb.buffer = ir;
  const verbOut = c.createGain(); verbOut.gain.value = 0.32; AUDIO.verb.connect(verbOut); verbOut.connect(AUDIO.master);
  // tempo delay with a darkening feedback loop
  AUDIO.delay = c.createDelay(1.5); const fb = c.createGain(), dl = c.createBiquadFilter(), dOut = c.createGain();
  fb.gain.value = 0.32; dl.type = 'lowpass'; dl.frequency.value = 2600; dOut.gain.value = 0.35;
  AUDIO.delay.connect(dl); dl.connect(fb); fb.connect(AUDIO.delay); dl.connect(dOut); dOut.connect(AUDIO.musicLP);
  // one second of white noise, shared by every noisy voice
  const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AUDIO.noise = nb;
  AUDIO.ok = true; AUDIO.next = c.currentTime + 0.1;
  AUDIO.timer = setInterval(scheduleMusic, 25);
  applyVolumes();
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, audioUnlock, { capture: true, passive: true }));

function applyVolumes() {
  if (!AUDIO.ok) return;
  const t = AUDIO.ctx.currentTime, s = SET.sfx * 0.9, m = AUDIO.mode ? SET.music * 0.55 * AUDIO.ducked : 0;
  if (s !== AUDIO.vS) { AUDIO.vS = s; AUDIO.sfx.gain.setTargetAtTime(s, t, 0.05); }        // (only touch the params when something changed)
  if (m !== AUDIO.vM) { AUDIO.vM = m; AUDIO.music.gain.setTargetAtTime(m, t, 0.25); }
}

/* ---------------- voices ---------------- */
// An oscillator with an attack/decay envelope and an optional pitch sweep and filter. Returns the gain node.
function tone(o) {
  const c = AUDIO.ctx, t = (o.at || c.currentTime), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.sweep || o.dur));
  if (o.detune) osc.detune.value = o.detune;
  const a = o.attack || 0.004, peak = o.gain || 0.3;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node = osc;
  if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter; f.frequency.setValueAtTime(o.ff || 2000, t); if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + o.dur); f.Q.value = o.q || 0.8; osc.connect(f); node = f; }
  node.connect(g); g.connect(o.dest || AUDIO.sfx);
  if (o.verb) { const s = c.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(AUDIO.verb); }
  osc.start(t); osc.stop(t + o.dur + 0.05);
  return g;
}
// Filtered white noise with an envelope and an optional filter sweep
function noise(o) {
  const c = AUDIO.ctx, t = (o.at || c.currentTime), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = AUDIO.noise; src.loop = true; src.playbackRate.value = o.rate || 1;
  f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.f0 || 2000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur); f.Q.value = o.q || 1;
  const a = o.attack || 0.002, peak = o.gain || 0.3;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(o.dest || AUDIO.sfx);
  if (o.verb) { const s = c.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(AUDIO.verb); }
  src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
}
// Soft-clipped (distorted) copy of a tone, for crunchy impacts
let DIST_CURVE = null;
function crunch(o) {
  const c = AUDIO.ctx;
  if (!DIST_CURVE) { DIST_CURVE = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; DIST_CURVE[i] = Math.tanh(x * 4); } }
  const ws = c.createWaveShaper(); ws.curve = DIST_CURVE; ws.connect(o.dest || AUDIO.sfx);
  return tone(Object.assign({}, o, { dest: ws }));
}

/* ---------------- sound effects ---------------- */
const SFX = {
  click()  { tone({ type: 'sine', f0: 880, f1: 1500, dur: 0.07, gain: 0.16 }); tone({ type: 'triangle', f0: 1760, dur: 0.04, gain: 0.05 }); },
  tick()   { tone({ type: 'sine', f0: 2200, dur: 0.025, gain: 0.03 }); },
  back()   { tone({ type: 'sine', f0: 900, f1: 500, dur: 0.09, gain: 0.14 }); },
  select() { [0, 4, 7, 12].forEach((s, i) => tone({ type: 'triangle', f0: mtof(76 + s), dur: 0.22, gain: 0.1, at: AUDIO.ctx.currentTime + i * 0.045, verb: 0.3 })); },
  jump()   { tone({ type: 'square', f0: 260, f1: 620, dur: 0.12, sweep: 0.1, gain: 0.07, filter: 'lowpass', ff: 1800 }); noise({ f0: 1200, f1: 3000, dur: 0.08, gain: 0.04, filter: 'bandpass' }); },
  djump()  { tone({ type: 'triangle', f0: 480, f1: 1100, dur: 0.15, gain: 0.09 }); tone({ type: 'sine', f0: 1500, f1: 2400, dur: 0.12, gain: 0.04, at: AUDIO.ctx.currentTime + 0.03 }); },
  land(k)  { tone({ type: 'sine', f0: 130, f1: 55, dur: 0.12, gain: 0.12 * k }); noise({ f0: 600, f1: 200, dur: 0.1, gain: 0.08 * k, filter: 'lowpass' }); },
  swing(h) { noise({ f0: h ? 500 : 1400, f1: h ? 1800 : 4200, dur: h ? 0.2 : 0.11, gain: h ? 0.07 : 0.045, filter: 'bandpass', q: 1.6 }); },
  charge() { tone({ type: 'sawtooth', f0: 110, f1: 330, dur: 0.5, gain: 0.04, filter: 'lowpass', ff: 600, ff1: 2400 }); },
  hitL(k)  { const p = 1 + Math.random() * 0.15;
    noise({ f0: 2400 * p, dur: 0.06, gain: 0.16, filter: 'bandpass', q: 0.9 }); tone({ type: 'sine', f0: 240 * p, f1: 90, dur: 0.09, gain: 0.22 * Math.min(1.3, 0.7 + k * 0.04) }); },
  hitH(k)  { crunch({ type: 'sine', f0: 120, f1: 42, dur: 0.28, gain: 0.5 }); noise({ f0: 1800, f1: 400, dur: 0.18, gain: 0.25, filter: 'lowpass' }); noise({ f0: 5000, dur: 0.05, gain: 0.12, filter: 'highpass' });
    tone({ type: 'square', f0: 70, f1: 40, dur: 0.2, gain: 0.08, filter: 'lowpass', ff: 300 }); },
  smash(k) { const t = AUDIO.ctx.currentTime;
    SFX.hitH(k); crunch({ type: 'sawtooth', f0: 90, f1: 30, dur: 0.6, gain: 0.32, verb: 0.4 });
    noise({ f0: 6000, f1: 300, dur: 0.7, gain: 0.22, filter: 'lowpass', verb: 0.5 });
    [523, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f * 1.5, f1: f, dur: 0.9, gain: 0.05, at: t + 0.02 * i, verb: 0.6 })); },   // metallic ring
  block()  { tone({ type: 'square', f0: 620, dur: 0.08, gain: 0.07, filter: 'bandpass', ff: 1400, q: 4 }); noise({ f0: 4000, dur: 0.07, gain: 0.08, filter: 'highpass' }); tone({ type: 'sine', f0: 180, f1: 120, dur: 0.08, gain: 0.1 }); },
  parry()  { const t = AUDIO.ctx.currentTime; [1320, 1980, 2640].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.9 - i * 0.2, gain: 0.12 - i * 0.03, at: t + i * 0.015, verb: 0.6 }));
    noise({ f0: 7000, f1: 12000, dur: 0.25, gain: 0.06, filter: 'highpass', verb: 0.4 }); },
  shieldBreak() { const t = AUDIO.ctx.currentTime; noise({ f0: 5000, f1: 1500, dur: 0.6, gain: 0.25, filter: 'highpass', verb: 0.5 });
    for (let i = 0; i < 6; i++) tone({ type: 'triangle', f0: 2400 - i * 300, f1: 900 - i * 100, dur: 0.25, gain: 0.05, at: t + i * 0.04 }); },
  special() { tone({ type: 'sawtooth', f0: 300, f1: 1400, dur: 0.22, gain: 0.07, filter: 'lowpass', ff: 900, ff1: 5000, q: 6 }); tone({ type: 'sine', f0: 1400, f1: 700, dur: 0.2, gain: 0.05, at: AUDIO.ctx.currentTime + 0.08, verb: 0.3 }); },
  ko() { const t = AUDIO.ctx.currentTime;                                       // a big explosion: sub boom + crackling debris + air whoosh
    crunch({ type: 'sine', f0: 80, f1: 24, dur: 1.4, gain: 0.7, verb: 0.5 });
    noise({ f0: 3200, f1: 140, dur: 1.6, gain: 0.45, filter: 'lowpass', verb: 0.7 });
    noise({ f0: 900, f1: 6000, dur: 0.4, gain: 0.12, filter: 'bandpass', q: 2 });
    for (let i = 0; i < 10; i++) noise({ f0: 2000 + Math.random() * 4000, dur: 0.05, gain: 0.06, filter: 'bandpass', q: 3, at: t + 0.1 + Math.random() * 0.8 }); },
  twinkle() { const t = AUDIO.ctx.currentTime; [2637, 3136, 3951].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.5, gain: 0.07, at: t + i * 0.06, verb: 0.7 })); },   // star-KO "ping"
  glass() { const t = AUDIO.ctx.currentTime; crunch({ type: 'sine', f0: 110, f1: 50, dur: 0.3, gain: 0.5 });                             // screen-KO thud + glass crack
    noise({ f0: 6000, f1: 2500, dur: 0.35, gain: 0.25, filter: 'highpass', verb: 0.3 }); for (let i = 0; i < 6; i++) tone({ type: 'triangle', f0: 3000 + i * 400, f1: 1800, dur: 0.12, gain: 0.04, at: t + i * 0.025 }); },
  ready() { const t = AUDIO.ctx.currentTime; noise({ f0: 300, f1: 6000, dur: 1.1, gain: 0.08, filter: 'bandpass', q: 3, verb: 0.4 }); tone({ type: 'sawtooth', f0: 110, f1: 440, dur: 1.1, gain: 0.05, filter: 'lowpass', ff: 400, ff1: 4000, at: t }); },
  go() { const t = AUDIO.ctx.currentTime; [52, 59, 64, 67, 71].forEach(n => { tone({ type: 'sawtooth', f0: mtof(n), dur: 0.7, gain: 0.07, filter: 'lowpass', ff: 3500, verb: 0.5, at: t }); });
    crunch({ type: 'sine', f0: 100, f1: 40, dur: 0.4, gain: 0.4 }); noise({ f0: 8000, f1: 3000, dur: 0.6, gain: 0.08, filter: 'highpass', verb: 0.5 }); },
  finish() { const t = AUDIO.ctx.currentTime; SFX.ko();
    [45, 52, 57, 60, 64].forEach(n => tone({ type: 'sawtooth', f0: mtof(n), dur: 2.4, gain: 0.06, filter: 'lowpass', ff: 2600, ff1: 500, verb: 0.7, at: t + 0.05 })); },
  // the cinematic startup: low drone swell, a rising arpeggio, a cymbal swell and a final bass hit with a bright chord
  startup() { const c = AUDIO.ctx, t = c.currentTime;
    [33, 40, 45].forEach(n => tone({ type: 'sawtooth', f0: mtof(n), dur: 3.2, attack: 1.6, gain: 0.07, filter: 'lowpass', ff: 200, ff1: 2400, verb: 0.6, at: t }));
    [57, 60, 64, 69, 72, 76, 81, 84].forEach((n, i) => tone({ type: 'triangle', f0: mtof(n), dur: 0.5, gain: 0.07, at: t + 0.35 + i * 0.13, verb: 0.5 }));
    noise({ f0: 3000, f1: 9000, dur: 1.6, attack: 1.4, gain: 0.08, filter: 'highpass', verb: 0.6, at: t + 0.2 });
    crunch({ type: 'sine', f0: 90, f1: 30, dur: 1.5, gain: 0.6, verb: 0.6, at: t + 1.62 });
    noise({ f0: 9000, f1: 2000, dur: 1.8, gain: 0.12, filter: 'highpass', verb: 0.8, at: t + 1.62 });
    [57, 64, 69, 73, 76].forEach(n => tone({ type: 'sawtooth', f0: mtof(n), dur: 2.4, gain: 0.05, filter: 'lowpass', ff: 4000, ff1: 600, verb: 0.8, at: t + 1.62 })); }
};
function sfx(name, arg) {
  if (!AUDIO.ok || SET.sfx <= 0 || AUDIO.ctx.state !== 'running' || !SFX[name]) return;
  try { SFX[name](arg === undefined ? 1 : arg); } catch (e) { /* audio must never break the game */ }
}

/* ---------------- gameplay events → sounds ---------------- */
GAME_EVENT_LISTENERS.push((type, d) => {
  switch (type) {
    case 'hit':
      if (d.m && d.m.heavy && d.kb >= 14) sfx('smash', d.kb); else if (d.m && d.m.heavy) sfx('hitH', d.kb); else sfx('hitL', d.kb);
      break;
    case 'block': sfx('block'); break;
    case 'parry': sfx('parry'); break;
    case 'shieldBreak': sfx('shieldBreak'); break;
    case 'ko': sfx('ko'); break;
    case 'jump': if (d.f && !d.f.cpu || Math.random() < 0.6) sfx(d.air ? 'djump' : 'jump'); break;
    case 'land': if (d.impact > 7) sfx('land', Math.min(1, d.impact / 14)); break;
  }
});

/* ---------------- UI sounds ---------------- */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.btn,.mcard,.tile,.card,.slot,.swatch,.seg button,[data-go],[data-act]');
  if (!b || !AUDIO.ok) return;
  if (b.matches('.tile,.card.stage,.card.diff')) sfx('select'); else if (b.textContent.trim().startsWith('←')) sfx('back'); else sfx('click');
}, true);
document.addEventListener('mouseover', e => {
  const b = e.target.closest && e.target.closest('.btn,.mcard,.tile,.card,.slot');
  if (!b || b === AUDIO.lastHover) return; AUDIO.lastHover = b;
  const now = performance.now(); if (now - AUDIO.lastTick > 45) { AUDIO.lastTick = now; sfx('tick'); }
}, true);

/* ---------------- soundtrack: see audio/music.js (35 stage tracks + menu / results themes) ---------------- */
function musicMode() {
  if (G.screen === 'scr-intro') return null;
  if (G.mode === 'play' || G.mode === 'count' || G.mode === 'ending') return 'battle';
  if (G.mode === 'over') return 'result';
  return 'menu';
}

/* ---------------- per-frame: music mode, intensity, state-change sounds ---------------- */
function audioTick() {
  if (!AUDIO.ok) return;
  const mode = musicMode();
  if (mode !== AUDIO.mode) { AUDIO.mode = mode; AUDIO.step = 0; AUDIO.next = AUDIO.ctx.currentTime + 0.08; }
  musicSelect();                                                                   // which track: this stage's, the menu theme, the results theme
  const lp = G.paused ? 700 : 18000;
  if (lp !== AUDIO.lp) { AUDIO.lp = lp; AUDIO.musicLP.frequency.setTargetAtTime(lp, AUDIO.ctx.currentTime, 0.15); }   // paused: muffled music
  AUDIO.ducked = G.paused ? 0.6 : 1;
  applyVolumes();
  // battle intensity: damage and last stocks raise it; the lead layer fades in above ~0.45
  if (mode === 'battle') { let I = 0; for (const f of fighters) I = Math.max(I, Math.min(1, f.percent / 140) * 0.7 + (f.stocks === 1 ? 0.45 : 0)); AUDIO.intensity += (I - AUDIO.intensity) * 0.02; }
  else AUDIO.intensity *= 0.95;
  // state changes this frame: attack swings, special zaps, smash charge, countdown, GO!, FINISH!
  if (G.mode === 'play' || G.mode === 'ending') fighters.forEach((f, i) => {
    const p = AUDIO.prev[i] || {};
    if (f.state === 'attack' && (p.state !== 'attack' || p.move !== f.move) && f.move) sfx('swing', f.move.heavy ? 1 : 0);
    if (f.state === 'special' && p.state !== 'special') sfx('special');
    if (f.charging && !p.charging && !f.cpu) sfx('charge');
    AUDIO.prev[i] = { state: f.state, move: f.move, charging: f.charging };
  });
  if (G.mode === 'count' && AUDIO.lastMode !== 'count') sfx('ready');
  if (G.mode === 'play' && AUDIO.lastMode === 'count') sfx('go');
  if (G.mode === 'ending' && AUDIO.lastMode === 'play') sfx('finish');
  AUDIO.lastMode = G.mode;
}
