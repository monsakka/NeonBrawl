/* NEON BRAWL — Procedural soundtrack: 36 stage tracks + menu / results themes, all synthesised live (no audio files).
 *
 * Every arena has its own track, matched to its look: fast gated-arp synthwave for the neon cities, distorted
 * double-kick metal for the volcanoes, ethereal lydian pads and bell arpeggios for the cosmic stages, koto and taiko
 * for the shrines, steel drums for the islands, a music box for the clock tower, darbuka and oud for the desert,
 * drum & bass for the subway, a pumping EDM festival for the stadium, cosmic trance for the Nebula Apex… Each track is built from:
 *   • a genre recipe (drum kit + patterns, bass instrument + rhythm, arpeggiator, pad, lead instrument, extra FX);
 *   • the stage's own tempo, key, musical scale (major / minor / dorian / phrygian / lydian / hirajoshi / whole-tone…)
 *     and chord progression;
 *   • a lead melody composed procedurally from the stage id (a seeded generator writes a 4-bar motif from scale and
 *     chord tones), so no two tracks share a tune.
 * The battle intensity (damage, last stocks) brings in extra layers: 16th hats, louder arps, the lead line.
 * Stage select previews the hovered arena's track. Sudden Death doubles the tempo.                                */
'use strict';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11], phrygDom: [0, 1, 4, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], penta: [0, 2, 4, 7, 9], pentaMin: [0, 3, 5, 7, 10], inScale: [0, 1, 5, 7, 8], hirajoshi: [0, 2, 3, 7, 8],
  wholeTone: [0, 2, 4, 6, 8, 10], blues: [0, 3, 5, 6, 7, 10]
};
const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14], OFFS = [2, 6, 10, 14], FOUR = [0, 4, 8, 12];

/* ---------------- genre recipes ---------------- */
const GENRES = {
  synthwave: { kick: ['punch', FOUR], snare: ['gated', [4, 12]], hat: ['hat', OFFS], hat2: ['hat', ALL], bass: ['saw', EIGHTHS, -2], arp: ['pluck', 1, 'updown', 1, 0.05], pad: ['saw', 0.026, 1500], lead: ['square', 0.034, 1, 0.3], prog: [0, 5, 3, 4], fx: ['riser'] },
  cyber:     { kick: ['punch', FOUR], snare: ['clap', [4, 12]], hat: ['open', OFFS], hat2: ['hat', ALL], perc: ['rim', [3, 7, 11, 15]], bass: ['acid', [0, 3, 6, 8, 11, 14], -2], arp: ['square', 1, 'rand', 1, 0.03], pad: ['saw', 0.012, 900], lead: ['saw', 0.03, 1, 0.4], prog: [0, 0, 6, 5] },
  metal:     { kick: ['punch', EIGHTHS], kick2: ALL, snare: ['snare', [4, 12]], hat: ['ride', EIGHTHS], bass: ['dist', EIGHTHS, -2], arp: null, pad: ['saw', 0.018, 700], lead: ['dist', 0.032, 0, 0.25], power: true, prog: [0, 1, 0, 6], fx: ['riser'] },
  ambient:   { kick: ['soft', [0, 10]], snare: null, hat: ['shaker', [4, 12]], hat2: ['shaker', EIGHTHS], bass: ['sub', [0, 8], -2], arp: ['bell', 2, 'up', 1, 0.045], pad: ['sine', 0.05, 900, 1.2], lead: ['flute', 0.03, 1, 0], prog: [0, 3, 5, 4], fx: ['shimmer'] },
  epic:      { kick: ['taiko', [0, 6, 8, 14]], snare: ['snare', [4, 12]], hat: ['hat', OFFS], perc: ['tom', [11, 13, 15]], bass: ['saw', [0, 6, 8, 14], -2], arp: ['brass', 4, 'chord', 0, 0.035], pad: ['saw', 0.03, 1300, 0.6], lead: ['brass', 0.038, 1, 0.2], prog: [0, 5, 6, 4], fx: ['gong'] },
  asian:     { kick: ['taiko', [0, 7, 10]], snare: null, hat: ['shaker', OFFS], perc: ['wood', [4, 12, 14]], bass: ['pluck', [0, 10], -2], arp: ['koto', 2, 'rand', 1, 0.05], pad: ['sine', 0.03, 1100, 1], lead: ['flute', 0.036, 1, 0], prog: [0, 3, 4, 0] },
  tropical:  { kick: ['punch', [0, 8, 11]], snare: ['rim', [4, 12]], hat: ['shaker', ALL], bass: ['pluck', [0, 3, 6, 8, 11, 14], -2], arp: ['steel', 2, 'updown', 1, 0.05], pad: ['organ', 0.012, 1600], lead: ['steel', 0.04, 1, 0], prog: [0, 4, 5, 3] },
  underwater:{ kick: ['soft', [0, 8]], snare: null, hat: ['shaker', [6, 14]], bass: ['sub', [0, 6, 8], -2], arp: ['bell', 2, 'down', 0, 0.035], pad: ['sine', 0.05, 700, 1.5], lead: ['sine', 0.03, 0, 0], prog: [0, 6, 3, 4], fx: ['bubbles'] },
  clockwork: { kick: ['punch', [0, 8]], snare: ['rim', [4, 12]], hat: ['tick', EIGHTHS], hat2: ['tick', ALL], bass: ['pluck', EIGHTHS, -2], arp: ['celesta', 1, 'up', 1, 0.04], pad: ['organ', 0.014, 1400], lead: ['organ', 0.03, 1, 0], prog: [0, 4, 3, 4] },
  desert:    { kick: ['soft', [0, 6, 10]], snare: ['darbuka', [3, 4, 11, 12]], hat: ['shaker', OFFS], perc: ['tom', [7, 14]], bass: ['pluck', [0, 6, 10], -2], arp: ['oud', 1, 'rand', 0, 0.045], pad: ['saw', 0.016, 800, 1], lead: ['flute', 0.038, 1, 0], prog: [0, 1, 0, 6], drone: true },
  forest:    { kick: ['soft', [0, 8]], snare: ['rim', [12]], hat: ['shaker', EIGHTHS], bass: ['pluck', [0, 7, 10], -2], arp: ['harp', 2, 'updown', 1, 0.045], pad: ['sine', 0.035, 1200, 1], lead: ['flute', 0.036, 1, 0], prog: [0, 6, 3, 4] },
  haunted:   { kick: ['soft', [0, 8]], snare: ['rim', [4, 12]], hat: null, perc: ['wood', [6, 14]], bass: ['sub', [0, 8], -2], arp: ['celesta', 2, 'down', 1, 0.04], pad: ['organ', 0.022, 1100, 0.8], lead: ['organ', 0.03, 1, 0], prog: [0, 3, 4, 0] },
  frozen:    { kick: ['soft', [0, 8]], snare: null, hat: ['shaker', OFFS], bass: ['sub', [0, 8], -2], arp: ['bell', 1, 'up', 1, 0.035], pad: ['sine', 0.045, 1000, 1.2], lead: ['celesta', 0.035, 1, 0], prog: [0, 4, 1, 3], fx: ['shimmer'] },
  toxic:     { kick: ['punch', FOUR], snare: ['gated', [4, 12]], hat: ['hat', EIGHTHS], hat2: ['hat', ALL], perc: ['rim', [7, 15]], bass: ['reese', [0, 3, 8, 11], -2], arp: ['square', 2, 'rand', 0, 0.025], pad: ['saw', 0.014, 600], lead: ['dist', 0.028, 0, 0.35], prog: [0, 1, 0, 5], fx: ['riser'] },
  edm:       { kick: ['punch', FOUR], snare: ['clap', [4, 12]], hat: ['open', OFFS], hat2: ['hat', ALL], bass: ['saw', OFFS, -2], arp: ['supersaw', 4, 'chord', 1, 0.03], pad: ['supersaw', 0.018, 2200], lead: ['supersaw', 0.03, 1, 0.3], pump: true, prog: [0, 5, 3, 4], fx: ['riser'] },
  dnb:       { kick: ['punch', [0, 10]], snare: ['snare', [4, 12]], ghost: [7, 15], hat: ['hat', ALL], bass: ['reese', [0, 10], -2, 2], arp: ['bell', 4, 'up', 1, 0.03], pad: ['saw', 0.02, 900, 1], lead: ['square', 0.028, 1, 0.35], prog: [0, 5, 6, 4] },
  station:   { kick: ['punch', [0, 8, 10]], snare: ['snare', [4, 12]], hat: ['hat', OFFS], hat2: ['hat', ALL], bass: ['fm', EIGHTHS, -2], arp: ['square', 1, 'up', 1, 0.03], pad: ['saw', 0.018, 1200], lead: ['tri', 0.036, 1, 0.2], prog: [0, 4, 5, 3] },
  cosmic:    { kick: ['punch', FOUR], snare: ['clap', [4, 12]], hat: ['open', OFFS], hat2: ['hat', ALL], bass: ['sub', [0, 3, 6, 8, 11, 14], -2], arp: ['bell', 1, 'updown', 1, 0.042], pad: ['supersaw', 0.022, 1900, 1], lead: ['supersaw', 0.03, 1, 0.3], pump: true, prog: [0, 5, 3, 6], fx: ['shimmer'] },   // trance under the stars
  racing:    { kick: ['punch', [0, 4, 8, 10, 12]], snare: ['snare', [4, 12]], hat: ['hat', EIGHTHS], hat2: ['hat', ALL], bass: ['dist', EIGHTHS, -2], arp: ['saw', 1, 'up', 1, 0.028], pad: ['saw', 0.016, 1600], lead: ['square', 0.034, 1, 0.25], power: true, prog: [0, 6, 5, 6], fx: ['riser'] }
};

/* ---------------- the 36 stage tracks (+ training, menu, results) ----------------
 * [genre, bpm, root (MIDI), scale, swing, overrides] */
const STAGE_MUSIC = {
  speedway:    ['racing', 152, 52, 'minor', 0, { name: 'Pole Position' }],
  forge:       ['epic', 112, 50, 'harmMinor', 0, { name: 'Sands of the Coliseum' }],
  aurora:      ['frozen', 88, 53, 'lydian', 0, { name: 'Aetherial Heights' }],
  neon:        ['synthwave', 118, 57, 'minor', 0, { name: 'Metropolis After Dark' }],
  shrine:      ['asian', 90, 55, 'penta', 0.12, { name: 'Sunset Lanterns', arp: ['harp', 2, 'up', 1, 0.045] }],
  space:       ['ambient', 76, 48, 'lydian', 0, { name: 'Zenith Drift' }],
  volcano:     ['metal', 168, 52, 'phrygian', 0, { name: 'Magma Core' }],
  vault:       ['cyber', 136, 54, 'phrygian', 0, { name: 'Vault Protocol' }],
  matrix:      ['frozen', 104, 59, 'dorian', 0, { name: 'Crystal Echoes', kick: ['punch', [0, 8, 11]], snare: ['rim', [4, 12]] }],
  haven:       ['tropical', 108, 55, 'penta', 0.18, { name: 'Island Hopper' }],
  abyss:       ['underwater', 80, 48, 'dorian', 0, { name: 'Trench Lullaby' }],
  clockwork:   ['clockwork', 116, 57, 'mixolydian', 0, { name: 'Tick of the Tower' }],
  storm:       ['epic', 126, 48, 'harmMinor', 0, { name: 'Siege in the Storm', hat: ['ride', EIGHTHS] }],
  grid:        ['asian', 124, 52, 'inScale', 0, { name: 'Neon Dojo', kick: ['punch', FOUR], snare: ['clap', [4, 12]], bass: ['saw', EIGHTHS, -2] }],
  peak:        ['frozen', 100, 52, 'major', 0, { name: 'Whiteout', kick: ['soft', [0, 6, 8]] }],
  quantum:     ['toxic', 128, 55, 'phrygian', 0, { name: 'Biohazard' }],
  skyline:     ['station', 112, 50, 'mixolydian', 0, { name: 'Orbit Lock' }],
  temple:      ['asian', 104, 57, 'hirajoshi', 0, { name: "Shogun's Court", snare: ['clap', [12]] }],
  desert:      ['desert', 100, 50, 'phrygDom', 0, { name: 'Mirage Caravan' }],
  forest:      ['forest', 92, 52, 'dorian', 0.1, { name: 'Glowcap Grove' }],
  obsidian:    ['haunted', 96, 47, 'harmMinor', 0.15, { name: 'Manor of Whispers' }],
  starlight:   ['epic', 138, 53, 'minor', 0, { name: 'Final Destination', kick: ['punch', FOUR], arp: ['saw', 1, 'updown', 1, 0.03], pad: ['supersaw', 0.02, 2000] }],
  stadium:     ['edm', 128, 49, 'minor', 0, { name: 'Main Event' }],
  sanctuary:   ['ambient', 84, 51, 'major', 0, { name: 'Halls of the Sky', lead: ['brass', 0.03, 1, 0], kick: ['soft', [0, 8]] }],
  highway:     ['synthwave', 110, 54, 'minor', 0, { name: 'Night Drive', arp: ['saw', 1, 'up', 1, 0.04] }],
  observatory: ['station', 100, 58, 'lydian', 0, { name: 'Star Chart', arp: ['bell', 1, 'updown', 1, 0.035] }],
  expressway:  ['synthwave', 128, 49, 'dorian', 0, { name: 'Overdrive Lane', bass: ['square', ALL, -2] }],
  ruins:       ['forest', 108, 55, 'pentaMin', 0.12, { name: 'Lost Idols', kick: ['taiko', [0, 3, 8, 10]], perc: ['tom', [6, 14]], arp: ['pluck', 2, 'rand', 0, 0.04] }],
  cybercol:    ['edm', 140, 50, 'phrygian', 0, { name: 'Gladiator.exe', bass: ['acid', [0, 3, 6, 8, 11, 14], -2] }],
  dock:        ['station', 124, 52, 'minor', 0, { name: 'Launch Bay', bass: ['reese', [0, 3, 8, 10], -2], perc: ['rim', [7, 15]] }],
  citadel:     ['cyber', 132, 48, 'wholeTone', 0, { name: 'Phase Shift', arp: ['bell', 1, 'rand', 1, 0.03] }],
  caldera:     ['metal', 180, 50, 'locrian', 0, { name: 'Eruption' }],
  celestial:   ['asian', 80, 54, 'hirajoshi', 0, { name: 'Celestial Bells', arp: ['bell', 2, 'updown', 1, 0.04], fx: ['shimmer'] }],
  subway:      ['dnb', 172, 53, 'minor', 0, { name: 'Last Train' }],
  astral:      ['ambient', 64, 57, 'wholeTone', 0, { name: 'Astral Void', lead: ['sine', 0.03, 1, 0], fx: ['shimmer'] }],
  nebula:      ['cosmic', 134, 50, 'lydian', 0, { name: 'Apex of the Nebula' }],
  training:    ['cyber', 120, 48, 'minor', 0, { name: 'Holo Grid', pad: ['sine', 0.03, 900], lead: ['tri', 0.026, 1, 0.5] }]
};
const MENU_MUSIC = ['synthwave', 98, 57, 'minor', 0, { name: 'Neon Brawl', kick: ['punch', [0, 8]], snare: null, bass: ['saw', [0, 6, 8, 14], -2], lead: ['square', 0.03, 1, 0.9], prog: [0, 5, 2, 6] }];
const RESULT_MUSIC = ['edm', 110, 57, 'major', 0, { name: 'Victory Lap', kick: ['punch', [0, 6, 8]], bass: ['saw', [0, 3, 8, 11], -2], pump: false, prog: [0, 3, 4, 0] }];

/* ---------------- building a track ---------------- */
const PROG_POOL = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 6, 5, 6], [0, 2, 5, 4], [0, 4, 5, 3], [0, 0, 3, 3], [0, 5, 6, 4], [0, 1, 0, 6], [0, 3, 1, 4], [0, 4, 1, 5]];
function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
const TRACK_CACHE = {};
function buildTrack(key, def) {
  if (TRACK_CACHE[key]) return TRACK_CACHE[key];
  const [genre, bpm, root, scale, swing, o] = def, G0 = GENRES[genre], R = strSeed('music/' + key);
  const T = Object.assign({ key, genre, bpm, root, scaleName: scale, scale: SCALES[scale], swing }, G0, o || {});
  // the chord progression: the genre's own for the first stage that uses it, a seeded pick from the pool otherwise
  if (!(o && o.prog)) T.prog = R() < 0.35 ? G0.prog : PROG_POOL[Math.floor(R() * PROG_POOL.length)];
  // the lead melody: a 4-bar motif of scale degrees; strong beats land on chord tones, the rest walks the scale
  const rhythms = [[0, 3, 6, 8, 10, 12], [0, 2, 4, 7, 8, 12, 14], [0, 4, 6, 8, 11, 14], [0, 3, 4, 8, 10, 11, 14], [0, 2, 3, 6, 8, 12], [0, 6, 8, 9, 12, 14], [0, 4, 8, 10, 12, 13]];
  const rh = rhythms[Math.floor(R() * rhythms.length)], rh2 = rhythms[Math.floor(R() * rhythms.length)], n = T.scale.length;
  T.motif = []; let deg = T.prog[0] + 2;
  for (let bar = 0; bar < 4; bar++) {
    const r = bar === 3 ? rh2 : rh, ch = T.prog[bar];
    for (let s = 0; s < 16; s++) {
      if (!r.includes(s)) { T.motif.push(null); continue; }
      if (s === 0 || s === 8) deg = ch + [0, 2, 4][Math.floor(R() * 3)] + (R() < 0.3 ? n : 0);
      else deg += [-2, -1, -1, 1, 1, 2, 0][Math.floor(R() * 7)];
      deg = Math.max(-1, Math.min(n * 2, deg));
      T.motif.push({ deg, len: R() < 0.3 ? 2 : 1 });
    }
  }
  T.sig = [genre, bpm, root, scale, T.prog.join(''), T.motif.map(m => m ? m.deg : '-').join(',')].join('|');
  return (TRACK_CACHE[key] = T);
}
const degNote = (T, d, oct) => { const n = T.scale.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return T.root + T.scale[i] + 12 * (o + (oct || 0)); };
const chordOf = (T, bar) => { const d = T.prog[bar % 4]; return [degNote(T, d), degNote(T, d + 2), degNote(T, d + 4)]; };
function trackFor(key) {
  if (key === 'menu') return buildTrack('menu', MENU_MUSIC);
  if (key === 'result') return buildTrack('result', RESULT_MUSIC);
  return buildTrack(key, STAGE_MUSIC[key] || STAGE_MUSIC.neon);
}

/* ---------------- instruments ---------------- */
// distortion with a proper output level (the waveshaper saturates whatever goes in, so the level is set after it)
function distTone(o, level) {
  const c = AUDIO.ctx, ws = c.createWaveShaper(), og = c.createGain();
  if (!DIST_CURVE) { DIST_CURVE = new Float32Array(1024); for (let i = 0; i < 1024; i++) DIST_CURVE[i] = Math.tanh((i / 512 - 1) * 4); }
  ws.curve = DIST_CURVE; og.gain.value = level; ws.connect(og); og.connect(o.dest);
  return tone(Object.assign({}, o, { gain: 0.5, dest: ws }));
}
function fmTone(f, t, dur, gain, dest, ratio, index) {
  const c = AUDIO.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.value = f; mod.frequency.value = f * ratio; mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.1), t + dur);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05); return g;
}
function vibTone(f, t, dur, gain, dest, type, rate, depth, attack) {
  const c = AUDIO.ctx, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.value = f; lfo.frequency.value = rate || 5.5; lg.gain.value = f * (depth || 0.008);
  lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + (attack || 0.05)); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); return g;
}
// a pitched voice: kind, MIDI note, start, duration (s), gain, destination; returns a node for sends (delay / reverb)
function voice(kind, m, t, dur, gain, dest) {
  const f = mtof(m);
  switch (kind) {
    case 'pluck': return tone({ at: t, type: 'triangle', f0: f, dur: Math.min(dur, 0.35), gain, filter: 'lowpass', ff: 4000, ff1: 500, dest });
    case 'koto': { const g = tone({ at: t, type: 'triangle', f0: f * 1.012, f1: f, sweep: 0.04, dur: 0.6, gain, filter: 'bandpass', ff: f * 3, q: 1.2, dest, verb: 0.35 }); tone({ at: t, type: 'sine', f0: f * 2, dur: 0.25, gain: gain * 0.3, dest }); return g; }
    case 'bell': { const g = tone({ at: t, type: 'sine', f0: f, dur: 1.4, gain, dest, verb: 0.5 }); tone({ at: t, type: 'sine', f0: f * 2.76, dur: 0.7, gain: gain * 0.35, dest }); tone({ at: t, type: 'sine', f0: f * 5.4, dur: 0.25, gain: gain * 0.12, dest }); return g; }
    case 'celesta': { const g = tone({ at: t, type: 'sine', f0: f * 2, dur: 0.8, gain, dest, verb: 0.4 }); tone({ at: t, type: 'sine', f0: f * 8, dur: 0.12, gain: gain * 0.2, dest }); return g; }
    case 'steel': { const g = tone({ at: t, type: 'sine', f0: f, dur: 0.5, gain, dest, verb: 0.25 }); tone({ at: t, type: 'sine', f0: f * 2, dur: 0.35, gain: gain * 0.45, dest }); tone({ at: t, type: 'sine', f0: f * 3.98, dur: 0.15, gain: gain * 0.2, dest }); return g; }
    case 'harp': return tone({ at: t, type: 'triangle', f0: f, dur: 1.1, gain, filter: 'lowpass', ff: 3000, ff1: 900, dest, verb: 0.4 });
    case 'flute': { const g = vibTone(f, t, Math.max(0.25, dur), gain, dest, 'sine', 5.2, 0.01, 0.06); noise({ at: t, f0: f * 2, dur: 0.12, gain: gain * 0.25, filter: 'bandpass', q: 6, dest }); return g; }
    case 'organ': { const g = tone({ at: t, type: 'square', f0: f, dur, attack: 0.02, gain: gain * 0.6, filter: 'lowpass', ff: 2200, dest }); tone({ at: t, type: 'sine', f0: f * 2, dur, attack: 0.02, gain: gain * 0.5, dest }); return g; }
    case 'brass': return tone({ at: t, type: 'sawtooth', f0: f, dur: Math.max(0.2, dur), attack: 0.04, gain, filter: 'lowpass', ff: 500, ff1: 2800, q: 1.5, dest, verb: 0.3 });
    case 'supersaw': { let g; for (const d of [-14, 0, 14]) g = tone({ at: t, type: 'sawtooth', f0: f, detune: d, dur, attack: 0.01, gain: gain * 0.45, filter: 'lowpass', ff: 3200, dest }); return g; }
    case 'dist': return distTone({ at: t, type: 'sawtooth', f0: f, dur, filter: 'lowpass', ff: 2400, dest }, gain * 0.9);
    case 'oud': return tone({ at: t, type: 'sawtooth', f0: f, dur: 0.3, gain, filter: 'bandpass', ff: f * 2.5, q: 2, dest });
    case 'fm': return fmTone(f, t, Math.min(dur, 0.4), gain, dest, 2, 2.5);
    case 'sine': return vibTone(f, t, Math.max(0.3, dur), gain, dest, 'sine', 4, 0.004, 0.08);
    case 'tri': return tone({ at: t, type: 'triangle', f0: f, dur, gain, dest });
    case 'saw': return tone({ at: t, type: 'sawtooth', f0: f, dur, gain, filter: 'lowpass', ff: 2600, dest });
    default: return tone({ at: t, type: 'square', f0: f, dur, gain, filter: 'lowpass', ff: 2600, dest });
  }
}
function bassNote(kind, m, t, dur, gain, dest, accent) {
  const f = mtof(m);
  switch (kind) {
    case 'sub': return tone({ at: t, type: 'sine', f0: f, dur: dur * 1.6, attack: 0.02, gain: gain * 1.4, dest });
    case 'acid': return tone({ at: t, type: 'sawtooth', f0: f, dur, gain, filter: 'lowpass', ff: 300 + 2400 * (accent || 0.4), ff1: 160, q: 12, dest });
    case 'reese': { let g; for (const d of [-18, 18]) g = tone({ at: t, type: 'sawtooth', f0: f, detune: d, dur: dur * 1.8, attack: 0.02, gain: gain * 0.7, filter: 'lowpass', ff: 700, q: 2, dest }); return g; }
    case 'dist': return distTone({ at: t, type: 'sawtooth', f0: f, dur, filter: 'lowpass', ff: 1200, dest }, gain * 0.75);
    case 'pluck': return tone({ at: t, type: 'triangle', f0: f, dur: Math.min(dur * 1.4, 0.4), gain: gain * 1.3, filter: 'lowpass', ff: 1400, ff1: 300, dest });
    case 'fm': return fmTone(f, t, dur, gain, dest, 1, 1.6);
    case 'square': return tone({ at: t, type: 'square', f0: f, dur, gain: gain * 0.7, filter: 'lowpass', ff: 900, ff1: 260, q: 3, dest });
    default: return tone({ at: t, type: 'sawtooth', f0: f, dur, gain, filter: 'lowpass', ff: 900, ff1: 220, q: 4, dest });
  }
}
function drum(kind, t, dest, gain) {
  const c = AUDIO.ctx, k = gain || 1;
  switch (kind) {
    case 'punch': case 'soft': case '808': {
      const o = c.createOscillator(), g = c.createGain(), lo = kind === '808', pk = (kind === 'soft' ? 0.32 : 0.55) * k;
      o.frequency.setValueAtTime(lo ? 90 : 150, t); o.frequency.exponentialRampToValueAtTime(lo ? 38 : 44, t + (lo ? 0.4 : 0.13));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (lo ? 0.6 : 0.24));
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.7); break; }
    case 'taiko': tone({ at: t, type: 'sine', f0: 110, f1: 55, dur: 0.45, gain: 0.5 * k, dest, verb: 0.4 }); noise({ at: t, f0: 400, dur: 0.12, gain: 0.12 * k, filter: 'lowpass', dest }); break;
    case 'snare': noise({ at: t, f0: 1900, dur: 0.16, gain: 0.16 * k, filter: 'bandpass', q: 0.7, dest, verb: 0.25 }); tone({ at: t, type: 'triangle', f0: 190, f1: 140, dur: 0.1, gain: 0.08 * k, dest }); break;
    case 'clap': for (let i = 0; i < 3; i++) noise({ at: t + i * 0.011, f0: 1500, dur: i === 2 ? 0.18 : 0.02, gain: 0.13 * k, filter: 'bandpass', q: 1.2, dest, verb: i === 2 ? 0.35 : 0 }); break;
    case 'rim': tone({ at: t, type: 'square', f0: 820, dur: 0.03, gain: 0.05 * k, filter: 'bandpass', ff: 1700, q: 5, dest }); break;
    case 'gated': noise({ at: t, f0: 1400, dur: 0.24, gain: 0.18 * k, filter: 'bandpass', q: 0.6, dest, verb: 0.55 }); tone({ at: t, type: 'triangle', f0: 200, f1: 150, dur: 0.1, gain: 0.07 * k, dest }); break;
    case 'darbuka': tone({ at: t, type: 'sine', f0: 320, f1: 260, dur: 0.12, gain: 0.12 * k, dest }); noise({ at: t, f0: 3500, dur: 0.03, gain: 0.05 * k, filter: 'highpass', dest }); break;
    case 'hat': noise({ at: t, f0: 8500, dur: 0.03, gain: 0.035 * k, filter: 'highpass', dest }); break;
    case 'open': noise({ at: t, f0: 7500, dur: 0.12, gain: 0.04 * k, filter: 'highpass', dest }); break;
    case 'shaker': noise({ at: t, f0: 6200, dur: 0.06, attack: 0.02, gain: 0.025 * k, filter: 'bandpass', q: 1.5, dest }); break;
    case 'ride': noise({ at: t, f0: 9500, dur: 0.25, gain: 0.025 * k, filter: 'highpass', dest }); tone({ at: t, type: 'square', f0: 3700, dur: 0.15, gain: 0.006 * k, dest }); break;
    case 'tick': tone({ at: t, type: 'sine', f0: 3200, dur: 0.02, gain: 0.04 * k, dest }); break;
    case 'wood': tone({ at: t, type: 'sine', f0: 1050, f1: 900, dur: 0.06, gain: 0.08 * k, dest }); break;
    case 'tom': tone({ at: t, type: 'sine', f0: 210, f1: 120, dur: 0.22, gain: 0.18 * k, dest, verb: 0.2 }); break;
  }
}

/* ---------------- the sequencer ---------------- */
function musicKey() {
  const mode = AUDIO.mode;
  if (!mode) return null;
  if (mode === 'battle') return ST ? ST.id : 'neon';
  if (mode === 'result') return 'result';
  if (G.screen === 'scr-stage' && typeof stageHover !== 'undefined') return STAGES[stageHover !== null ? stageHover : SEL.stage].id;   // stage select: preview the arena's track
  return 'menu';
}
function musicSelect() {
  const k = musicKey();
  if (k !== AUDIO.trackKey) { AUDIO.trackKey = k; AUDIO.track = k ? trackFor(k) : null; AUDIO.step = 0; if (AUDIO.ok) AUDIO.next = AUDIO.ctx.currentTime + 0.08; }
}
function scheduleMusic() {
  if (!AUDIO.ok || AUDIO.ctx.state !== 'running' || !AUDIO.mode || !AUDIO.track) return;
  const c = AUDIO.ctx, T = AUDIO.track;
  if (AUDIO.next < c.currentTime - 0.2) AUDIO.next = c.currentTime + 0.05;          // (tab was asleep: don't burst-play the backlog)
  while (AUDIO.next < c.currentTime + 0.14) {
    const len = 60 / (T.bpm * (G.suddenDeath && AUDIO.mode === 'battle' ? 2 : 1)) / 4, sw = AUDIO.step % 2 ? len * (T.swing || 0) : 0;   // Sudden Death: double tempo
    try { playStep(T, AUDIO.step, AUDIO.next + sw, len * 4); } catch (e) { /* audio must never break the game */ }
    AUDIO.next += len; AUDIO.step = (AUDIO.step + 1) % 64;
  }
}
function pumpBus() {
  if (!AUDIO.pump) { AUDIO.pump = AUDIO.ctx.createGain(); AUDIO.pump.connect(AUDIO.musicLP); }
  return AUDIO.pump;
}
function playStep(T, s, t, beat) {
  const dest = AUDIO.musicLP, st = s % 16, bar = (s >> 4) % 4, I = AUDIO.mode === 'battle' ? AUDIO.intensity : (AUDIO.mode === 'menu' && AUDIO.trackKey !== 'menu' ? 0.5 : 0.2);
  const chord = chordOf(T, bar), root = degNote(T, T.prog[bar]), padDest = T.pump ? pumpBus() : dest;
  // drums
  if (T.kick && T.kick[1].includes(st)) { drum(T.kick[0], t, dest); if (T.pump) { const g = AUDIO.pump.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.25, t); g.linearRampToValueAtTime(1, t + beat * 0.45); } }
  else if (T.kick2 && I > 0.55 && T.kick2.includes(st)) drum(T.kick[0], t, dest, 0.7);                        // metal: double-kick 16ths when it heats up
  if (T.snare && T.snare[1].includes(st)) drum(T.snare[0], t, dest);
  if (T.ghost && T.ghost.includes(st)) drum('snare', t, dest, 0.35);
  if (T.perc && T.perc[1].includes(st)) drum(T.perc[0], t, dest);
  const hats = T.hat2 && I > 0.3 ? T.hat2 : T.hat;
  if (hats && hats[1].includes(st)) drum(hats[0], t, dest, st % 4 === 2 ? 1.2 : 0.8);
  if (T.snare && bar === 3 && st >= 12 && I > 0.4) drum(T.snare[0], t, dest, 0.5 + (st - 12) * 0.15);       // fill into the next phrase
  // bass
  if (T.bass && T.bass[1].includes(st)) { const n = root + 12 * (T.bass[2] || -2) + 12 + (T.power && st % 4 === 2 ? 7 : 0);
    bassNote(T.bass[0], n, t, beat * 0.45 * (T.bass[3] || 1), 0.13, padDest, st % 4 === 0 ? 0.9 : 0.3); }
  if (T.drone && st === 0 && bar % 2 === 0) tone({ at: t, type: 'sawtooth', f0: mtof(T.root - 12), dur: beat * 8, attack: beat, gain: 0.02, filter: 'lowpass', ff: 500, dest, verb: 0.4 });
  // pad: the bar's chord, swelling in
  if (T.pad && st === 0) { const [kind, g, ff, att] = T.pad;
    chord.forEach((n, i) => { if (kind === 'organ' || kind === 'supersaw') voice(kind, n, t, beat * 4, g, padDest);
      else tone({ at: t, type: kind === 'sine' ? 'sine' : 'sawtooth', f0: mtof(n), dur: beat * 4, attack: beat * (att || 0.8), gain: g, filter: 'lowpass', ff: ff || 1400, detune: (i - 1) * 7, dest: padDest, verb: 0.5 }); }); }
  // arpeggiator
  if (T.arp) { const [kind, rate, pat, oct, g] = T.arp;
    if (st % rate === 0) {
      const k = st / rate, oc = 12 * (1 + (oct || 0));
      let notes;
      if (pat === 'chord') notes = st % 8 === 0 || st % 8 === 3 ? chord.map(n => n + oc) : null;
      else { const seq = pat === 'down' ? [2, 1, 0] : pat === 'updown' ? [0, 1, 2, 1] : [0, 1, 2], i = pat === 'rand' ? Math.floor(hash(s * 1.37 + T.bpm) * 3) : seq[k % seq.length];
        notes = [chord[i] + oc + ((k >> 2) & 1) * 12]; }
      if (notes) for (const n of notes) { const v = voice(kind, n, t, beat * 0.4 * rate, g * (0.7 + 0.6 * I), dest);
        if (v) { const s2 = AUDIO.ctx.createGain(); s2.gain.value = 0.45; v.connect(s2); s2.connect(AUDIO.delay); } }
    }
  }
  // lead melody (the stage's own motif), entering as the fight intensifies
  if (T.lead && I >= (T.lead[3] || 0)) { const m = T.motif[s % 64];
    if (m) { const [kind, g, oct] = T.lead, n = degNote(T, m.deg, 1 + (oct || 0));
      voice(kind, n, t, beat * 0.5 * m.len, g * Math.min(1, 0.6 + (I - (T.lead[3] || 0)) * 2), dest);
      if (T.power) voice(kind, n - 5, t, beat * 0.5 * m.len, g * 0.6, dest); } }
  // stage colour
  const fx = T.fx || [];
  if (fx.includes('riser') && bar === 3 && st === 0) noise({ at: t, f0: 400, f1: 7000, dur: beat * 4, attack: beat * 3.6, gain: 0.05, filter: 'bandpass', q: 2, dest, verb: 0.4 });
  if (fx.includes('gong') && bar === 0 && st === 0) { [55, 82.4, 110.7].forEach(f => tone({ at: t, type: 'sine', f0: f, dur: 3, gain: 0.06, dest, verb: 0.8 })); }
  if (fx.includes('bubbles') && hash(s * 3.1 + bar) > 0.72) tone({ at: t, type: 'sine', f0: 300 + hash(s) * 600, f1: 1200 + hash(s * 2) * 900, dur: 0.12, gain: 0.03, dest, verb: 0.3 });
  if (fx.includes('shimmer') && st === 8 && bar % 2) tone({ at: t, type: 'sine', f0: mtof(chord[2] + 36), dur: beat * 3, attack: beat, gain: 0.015, dest, verb: 0.9 });
}
