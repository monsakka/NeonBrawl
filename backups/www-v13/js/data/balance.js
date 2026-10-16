/* NEON BRAWL — Central competitive-balance configuration (Smash-style).
 *
 * Everything that decides "how hard does this hit launch" lives here, so tuning happens in one place:
 *
 *   KNOCKBACK  = base + damage% × scale × weightFactor(target)
 *   launch speed = KNOCKBACK × LAUNCH (config.js)
 *   hit-stun (frames) = floor(KNOCKBACK × hitstunMul) + hitstunAdd
 *
 * weightFactor shrinks the %-scaling part for heavies, so at LOW percent everyone gets similar
 * knockback (true combos work on everyone) while at HIGH percent floaties fly much further.
 * Heavies also fall faster, which is why they are "combo food".                                    */
'use strict';

const BALANCE = {
  // weight → class, plus the class's fall-speed multiplier (only used when a fighter doesn't set its own `grav`)
  weightClasses: [
    { id: 'floaty', label: 'Floaty',       max: 0.9,      grav: 0.9  },
    { id: 'mid',    label: 'Middleweight', max: 1.15,     grav: 1.0  },
    { id: 'heavy',  label: 'Heavyweight',  max: 1.32,     grav: 1.06 },
    { id: 'super',  label: 'Super-heavy',  max: Infinity, grav: 1.12 }
  ],
  weightFactor: w => 2 / (1 + w),                 // 0.72 → 1.16 · 1.0 → 1.0 · 1.45 → 0.82
  hitstunMul: 1.5, hitstunAdd: 6,
  // frame-data rules every move is checked against (see tools/smoke-test.js)
  frames: { lightStartup: [3, 5], airStartup: [3, 8], heavyStartup: [12, 18] },
  // offence budget: (speed score) × (damage score) must stay inside this band, so fast fighters hit softer
  offenceBand: [0.72, 1.18]
};

/* Balance patch: per-fighter overrides applied on top of the roster data (characters.js).
 * Tuned with tools/balance-sim.js (CPU-vs-CPU round robin) — every change here is a nerf ▼ or buff ▲.
 * Dotted keys reach into nested data, e.g. 'special.cd'.                                              */
BALANCE.patch = {
  titan:   { weight: 1.24, range: 1.05, heavyDmg: 1.04, heavySpd: 1.18 },  // ▼ dominated: armor + reach + bulk (won 87% after the aerials patch)
  // ▼ Mecha rework: still hard to launch and hits like a truck, but slow to start, low jump and punishable
  mecha:   { 'special.cd': 110, 'special.dmg': 3, weight: 1.32, heavyDmg: 1.3, heavyKb: 1.12,
             lightSpd: 1.12, heavySpd: 1.2, endLag: 1.2, jump: 12.2, 'special.wind': 12 },
  vortex:  { 'special.orb.cd': 62, 'special.orb.dmg': 5.5 },                // ▼ orb spam
  aegis:   { 'special.cd': 240 },                                           // ▼ wall uptime
  terra:   { 'special.wave.dmg': 5 },                                       // ▼ shockwave chip
  // ▲ Sylph buff: faster jabs, harder-launching Cyclone Kick, quicker air movement and a higher-rising recovery
  sylph:   { weight: 1.08, lightDmg: 1.04, heavyDmg: 1.16, lightSpd: 0.72, airMax: 7.0, airAcc: 0.85,
             'special.last.base': 7.5, 'special.last.scale': 0.12, 'special.scale': 0.02, 'special.rise': 4.4 },
  chimera: { lightDmg: 1.0, weight: 1.12 },                                 // ▲ Kraken
  phantom: { heavyDmg: 1.38, dmgTaken: 1.0, weight: 0.88 },                 // ▲ Ghost: "balanced durability" — no longer a glass cannon (offence still inside the band)
  solaris: { weight: 1.12, airMax: 5.4 },                                   // ▲ Nova
  velocity:{ weight: 0.92 },                                                // ▲ Striker
  // 29-fighter pass (round robin, 812 matches): Dino 91 % · Titan 80 % · Toxin 77 % at the top, Zephyr 18 % at the bottom
  dino:    { heavyDmg: 1.16, heavyKb: 1.1, weight: 1.14, dmgTaken: 1.04 },                // ▼ still clearly top-tier (armor, F1 speed, car smash), just not unbeatable
  dynamo:  { heavyKb: 1.04, weight: 1.24 },                                 // ▼ Titan: armored grabs + slam quake were too safe
  venom:   { 'special.reach': 2.1, lightDmg: 0.8 },                         // ▼ Toxin: Elastic Snare reached too far
  surge:   { lightDmg: 1.12, heavyDmg: 1.2, heavyKb: 1.14, weight: 1.12, 'special.dmg': 9 },   // ▲ Zephyr
  chrono:  { lightDmg: 1.02, heavyDmg: 1.1, weight: 1.1 },                  // ▲ Chronos
  tempest: { heavyKb: 1.1, 'special.cd': 130, weight: 1.08, lightDmg: 1.08, heavyDmg: 1.16 },   // ▲ Aether (keeps the updraft nerf above)
  mirage:  { lightDmg: 1.0, heavyDmg: 1.08 },                               // ▲ Kage
  // 35-fighter pass (round robin, 2380 matches): Gale 15 % · Drift 19 % at the bottom
  gale:    { weight: 0.96, lightSpd: 0.82, lightDmg: 1.06, heavyDmg: 1.14, heavyKb: 1.08, 'special.dmg': 9, 'special.base': 7 },   // ▲ Gale
  magma:   { heavyDmg: 1.18 },                                              // ▼ Magma
  // 50-fighter pass (round robin, 2450 matches): Titanus 78 % at the top; Fang 24 % · Blitz 28 % · Tempest / Echo 32 % · Apex-X 34 % at the bottom
  titanus: { weight: 1.46, heavyDmg: 1.22, heavyKb: 1.08 },                // ▼ Titanus
  fang:    { weight: 1.12, lightDmg: 1.1, heavyDmg: 1.16, heavyKb: 1.1, 'special.last.dmg': 8, 'special.last.base': 8 },   // ▲ Fang
  blitz:   { weight: 0.96, lightDmg: 1.02, heavyDmg: 1.1, heavyKb: 1.08, 'special.dmg': 11 },                             // ▲ Blitz
  stormmage: { weight: 1.04, lightDmg: 1.0, heavyDmg: 1.12, heavyKb: 1.08 },                                            // ▲ Tempest
  mimic:   { weight: 1.0, lightDmg: 1.04, heavyDmg: 1.1, heavyKb: 1.06 },                                               // ▲ Echo
  apexx:   { lightDmg: 1.06, heavyDmg: 1.12, heavyKb: 1.08, weight: 1.1 },                                              // ▲ Apex-X
  // 75-fighter pass (round robin, 5550 matches): Zen 81 % edged out Dino; Vesper 78 %; Atlas 14 % · Nyx-II 24 % · Matrix 26 % · Aether 27 % at the bottom
  zen:     { 'special.mult': 1.3, 'special.minDmg': 9, 'special.active': 16, 'special.cd': 100, heavyDmg: 1.0, lightDmg: 0.95, range: 1.18, weight: 0.96 },   // ▼ Zen: the counter could be spammed every half-second
  atlas:   { weight: 1.08, lightSpd: 0.9, lightDmg: 1.05, heavyDmg: 1.16, heavyKb: 1.1, range: 1.15, 'special.cd': 220, 'special.mult': 2.0 },   // ▲ Atlas (toned back down once the well also inverted controls)
  fable:   { weight: 1.04, lightDmg: 1.08, heavyDmg: 1.16, heavyKb: 1.1, 'special.trap': 44, 'special.cd': 48 },               // ▲ Fable
  zealot:  { weight: 1.0, lightDmg: 1.0, heavyDmg: 1.12, heavyKb: 1.08 },                                                     // ▲ Zealot
  // v11 newcomers (each vs all 79 others): Monolith 85 % (armor + reach + bulk, like Gaia was) · Origami 32 % · Axiom 43 % · Riptide 44 % · Comet 54 %
  //   → after this patch: Monolith 62 % · Origami 43 %
  monolith: { weight: 1.16, range: 1.0, heavyDmg: 1.0, heavyKb: 1.04, heavySpd: 1.24, lightSpd: 1.2, lightDmg: 1.0 },          // ▼ Monolith (the same cure as Gaia's, a notch further)
  origami: { weight: 0.98, lightDmg: 1.08, heavyDmg: 1.2, heavyKb: 1.12, range: 1.08, 'special.dmg': 11, 'special.base': 7.5 },   // ▲ Origami
  drift:   { weight: 1.0, lightSpd: 0.75, lightDmg: 1.08, heavyDmg: 1.16, heavyKb: 1.1, 'special.dmg': 9 },                    // ▲ Drift (again)
  aura:    { weight: 1.0, lightDmg: 1.02, heavyDmg: 1.08, heavyKb: 1.06 },                                                     // ▲ Aura
  vesper:  { lightDmg: 0.74, weight: 0.74, 'special.dmg': 6 },                                                                // ▼ Vesper (again)
  nyx2:    { weight: 0.96, lightDmg: 1.06, heavyDmg: 1.22, 'special.wind': 10, 'special.dmg': 13 },                  // ▲ Nyx-II
  gridrunner: { weight: 1.0, lightDmg: 1.06, heavyDmg: 1.14, heavyKb: 1.08 },                                         // ▲ Matrix
  nox:     { weight: 1.06, lightDmg: 1.04, heavyDmg: 1.1, heavyKb: 1.06 },                                             // ▲ Nox
  // v13 Item Shop fighters (each vs all 84 others): Scarab 87 % · Lumen 80 % · Totem 76 % · Hive 55 % · Djinn 31 %
  //   → after this patch: Scarab 54 % · Lumen 52 % · Totem 52 % · Hive 54 % · Djinn 52 %
  djinn:   { weight: 0.98, lightSpd: 0.88, lightDmg: 1.08, heavyDmg: 1.18, heavyKb: 1.1, range: 1.18, 'special.dmg': 11, 'special.base': 7.5 },   // ▲ Djinn
  scarab:  { weight: 1.04, lightDmg: 0.96, heavyDmg: 0.98, heavyKb: 0.96, range: 1.0, shieldDef: 0.9, shieldBonus: 4, parryBonus: 0, 'special.mult': 1.05, 'special.active': 14 },   // ▼ Scarab
  lumen:   { weight: 0.8, lightDmg: 0.8, heavyDmg: 0.9, heavyKb: 0.96, range: 1.06, 'special.stun': 10, 'special.cd': 190 },   // ▼ Lumen
  totem:   { weight: 1.26, lightSpd: 1.2, heavySpd: 1.24, heavyDmg: 1.12, heavyKb: 1.02, range: 1.06 },                 // ▼ Totem
  // Dino Nuggi is deliberately top-tier (armor, speed, power) and sits outside the offence band by design.
};
const ARMOR_BREAK = 6;                                                      // super armor (Gaia, Dino Nuggi) only absorbs hits below this damage
for (const ch of CHARS) for (const [key, val] of Object.entries(BALANCE.patch[ch.id] || {})) {
  const parts = key.split('.'); let o = ch;
  while (parts.length > 1) o = o[parts.shift()];
  o[parts[0]] = val;
}

const knockbackOf =(m, vic, boost) => (m.base * (boost || 1)) + vic.percent * m.scale * BALANCE.weightFactor(vic.ch.weight);
const weightClassOf = ch => BALANCE.weightClasses.find(c => ch.weight <= c.max);

// Scores used by the balance check: how fast a fighter is × how hard it hits, discounted for glass cannons
// (a fighter that takes extra damage is allowed to hit a little harder)
function offenceScore(ch) {
  const speed = (ch.run / 6.5 + 1 / ch.lightSpd + 1 / ch.heavySpd) / 3;
  const power = (ch.lightDmg + ch.heavyDmg * ch.heavyKb) / 2;
  return speed * power / (ch.dmgTaken || 1);
}

for (const ch of CHARS) {
  const wc = weightClassOf(ch);
  ch.wclass = wc.label;
  if (ch.grav === undefined) ch.grav = wc.grav;                 // heavies fall faster, floaties hang in the air
}
