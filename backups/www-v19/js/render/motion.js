/* NEON BRAWL — Per-fighter motion suite.
 *
 * Every fighter owns a motion profile (MOTION[id]) that drives its whole locomotion state machine on top of the shared
 * skeleton: a gait generator with its own stride / bounce / lean / arm carriage, a jump squash depth, a mid-air style
 * (and matching double-jump), footplant screen-shake and a sprint effect. Each fighter also owns a keyframed victory
 * animation (VICTORY_ANIM) and a keyframed defeat animation (DEFEAT_ANIM) for the results screen.
 *
 *   gait  : stomp · sprint · bounce · hover · bound · skate · slither · march · prowl · swagger · lope · glide · robot ·
 *           glitch · stagger · dance · shuffle · orbit · surf · grind · flutter · streak · genie · scuttle · jelly · rock · buzz ·
 *           pugtrot · waddle
 *   arm   : pump · swing · back · out · still · guard · claw · pray · flail · cross · hilt · drag · shoulder · shield · hips · robot ·
 *           compass · wave · slab · fan · swept · lamp · carapace · tendril · idol · sting · paw · bear
 *   air   : flip · backflip · tuck · spread · wingflap · thruster · meditate · capedive · spin · pike · cannonball · starfish ·
 *           corkscrew · superman · pounce · kickflip · glitch · float · dive · grab · starburst · splash · wisp · shellroll ·
 *           bell · plummet · hum · tornado · bellyflop
 *   s / b / l / a / c : stride, bounce, lean, arm swing, cadence · sq : jump-squat depth (lower = deeper crouch, bigger launch)
 *   plant : screen-shake on each footfall · fx : sprint effect (ghost · sparks · embers · dust · pixels · frost · shadow · petals)
 *
 * Loaded after poses.js; computePose() (poses.js) runs motionPose() last.                                               */
'use strict';

const MOTION = {
  velocity:  { g: 'sprint',  s: 16, b: 6, l: 0.45, a: 20, c: 1.15, arm: 'pump',     air: 'flip',       sq: 0.8,  fx: 'ghost' },
  titan:     { g: 'stomp',   s: 14, b: 3, l: 0.18, a: 8,  c: 0.8,  arm: 'swing',    air: 'cannonball', sq: 0.62, plant: 1.5, fx: 'dust' },
  vortex:    { g: 'hover',   s: 0,  b: 4, l: 0.16, a: 6,  c: 1,    arm: 'claw',     air: 'float',      sq: 0.92 },
  aether:    { g: 'hover',   s: 0,  b: 2, l: 0.24, a: 10, c: 1,    arm: 'back',     air: 'starburst',  sq: 0.88, fx: 'petals' },
  phantom:   { g: 'prowl',   s: 13, b: 2, l: 0.52, a: 6,  c: 1.2,  arm: 'back',     air: 'tuck',       sq: 0.8,  fx: 'shadow' },
  dynamo:    { g: 'stomp',   s: 16, b: 4, l: 0.26, a: 12, c: 0.75, arm: 'swing',    air: 'splash',     sq: 0.6,  plant: 2 },
  spark:     { g: 'swagger', s: 14, b: 5, l: 0.3,  a: 8,  c: 1.1,  arm: 'guard',    air: 'corkscrew',  sq: 0.82, fx: 'sparks' },
  frost:     { g: 'skate',   s: 10, b: 1, l: 0.12, a: 6,  c: 0.8,  arm: 'cross',    air: 'spread',     sq: 0.86, fx: 'frost' },
  mirage:    { g: 'prowl',   s: 17, b: 2, l: 0.62, a: 4,  c: 1.25, arm: 'back',     air: 'flip',       sq: 0.76, fx: 'shadow' },
  aegis:     { g: 'march',   s: 12, b: 2, l: 0.08, a: 4,  c: 0.9,  arm: 'still',    air: 'pike',       sq: 0.74, plant: 0.6 },
  venom:     { g: 'lope',    s: 18, b: 4, l: 0.16, a: 18, c: 0.85, arm: 'flail',    air: 'starfish',   sq: 0.8 },
  apex:      { g: 'bound',   s: 12, b: 6, l: 0.7,  a: 10, c: 1.1,  arm: 'claw',     air: 'pounce',     sq: 0.7,  fx: 'dust' },
  tempest:   { g: 'hover',   s: 0,  b: 5, l: 0.22, a: 14, c: 1,    arm: 'out',      air: 'spread',     sq: 0.9,  fx: 'petals' },
  terra:     { g: 'stomp',   s: 14, b: 5, l: 0.32, a: 10, c: 0.78, arm: 'swing',    air: 'cannonball', sq: 0.6,  plant: 2.5, fx: 'dust' },
  luna:      { g: 'sprint',  s: 14, b: 4, l: 0.24, a: 14, c: 1,    arm: 'pump',     air: 'backflip',   sq: 0.82 },
  solaris:   { g: 'hover',   s: 0,  b: 3, l: 0.1,  a: 4,  c: 1,    arm: 'pray',     air: 'starfish',   sq: 0.9 },
  void:      { g: 'march',   s: 12, b: 3, l: 0.12, a: 4,  c: 0.85, arm: 'shield',   air: 'pike',       sq: 0.7,  plant: 1 },
  chrono:    { g: 'robot',   s: 12, b: 2, l: 0.1,  a: 10, c: 0.9,  arm: 'robot',    air: 'spin',       sq: 0.84 },
  chimera:   { g: 'slither', s: 8,  b: 2, l: 0.2,  a: 12, c: 1,    arm: 'claw',     air: 'starfish',   sq: 0.82 },
  mecha:     { g: 'robot',   s: 14, b: 3, l: 0.14, a: 12, c: 0.75, arm: 'robot',    air: 'thruster',   sq: 0.66, plant: 2, fx: 'sparks' },
  nyx:       { g: 'prowl',   s: 14, b: 2, l: 0.44, a: 6,  c: 1.1,  arm: 'back',     air: 'capedive',   sq: 0.82, fx: 'shadow' },
  surge:     { g: 'skate',   s: 14, b: 2, l: 0.3,  a: 10, c: 0.9,  arm: 'swing',    air: 'kickflip',   sq: 0.84, fx: 'sparks' },
  glitch:    { g: 'glitch',  s: 15, b: 4, l: 0.3,  a: 14, c: 1.1,  arm: 'pump',     air: 'glitch',     sq: 0.8,  fx: 'pixels' },
  echo:      { g: 'hover',   s: 0,  b: 4, l: 0.18, a: 16, c: 1,    arm: 'flail',    air: 'float',      sq: 0.9 },
  kitsune:   { g: 'bounce',  s: 9,  b: 9, l: 0.2,  a: 10, c: 1.05, arm: 'back',     air: 'backflip',   sq: 0.84, fx: 'petals' },
  ronin:     { g: 'prowl',   s: 15, b: 1, l: 0.36, a: 2,  c: 1,    arm: 'hilt',     air: 'tuck',       sq: 0.78 },
  sylph:     { g: 'bounce',  s: 8,  b: 12, l: 0.1, a: 22, c: 1.25, arm: 'out',      air: 'spin',       sq: 0.88, fx: 'petals' },
  dino:      { g: 'sprint',  s: 18, b: 5, l: 0.55, a: 6,  c: 1.2,  arm: 'back',     air: 'superman',   sq: 0.74, fx: 'dust' },
  blaze:     { g: 'swagger', s: 16, b: 5, l: 0.34, a: 16, c: 1,    arm: 'pump',     air: 'spread',     sq: 0.76, fx: 'embers' },
  pulse:     { g: 'dance',   s: 11, b: 6, l: 0.12, a: 12, c: 1,    arm: 'swing',    air: 'spin',       sq: 0.84 },
  valkyrie:  { g: 'glide',   s: 12, b: 10, l: 0.3, a: 8,  c: 0.8,  arm: 'shoulder', air: 'wingflap',   sq: 0.8 },
  magma:     { g: 'stomp',   s: 14, b: 4, l: 0.22, a: 8,  c: 0.72, arm: 'drag',     air: 'cannonball', sq: 0.6,  plant: 2.5, fx: 'embers' },
  sol:       { g: 'march',   s: 13, b: 2, l: 0.1,  a: 6,  c: 0.9,  arm: 'shield',   air: 'starburst',  sq: 0.76, plant: 0.6 },
  gale:      { g: 'hover',   s: 0,  b: 6, l: 0.3,  a: 12, c: 1,    arm: 'out',      air: 'float',      sq: 0.92, fx: 'petals' },
  drift:     { g: 'skate',   s: 16, b: 1, l: 0.42, a: 8,  c: 1,    arm: 'back',     air: 'grab',       sq: 0.84, fx: 'ghost' },
  zenith:    { g: 'hover',   s: 0,  b: 2, l: 0.06, a: 2,  c: 1,    arm: 'pray',     air: 'meditate',   sq: 0.86 },
  serpent:   { g: 'slither', s: 10, b: 1, l: 0.3,  a: 8,  c: 1.1,  arm: 'claw',     air: 'corkscrew',  sq: 0.86 },
  blitz:     { g: 'sprint',  s: 18, b: 4, l: 0.62, a: 22, c: 1.3,  arm: 'pump',     air: 'dive',       sq: 0.8,  fx: 'ghost' },
  umbra:     { g: 'prowl',   s: 11, b: 1, l: 0.3,  a: 4,  c: 0.9,  arm: 'cross',    air: 'tuck',       sq: 0.84, fx: 'shadow' },
  fang:      { g: 'bound',   s: 14, b: 7, l: 0.66, a: 12, c: 1.15, arm: 'claw',     air: 'pounce',     sq: 0.68, fx: 'dust' },
  prism:     { g: 'hover',   s: 0,  b: 3, l: 0.12, a: 4,  c: 1,    arm: 'still',    air: 'spin',       sq: 0.9,  fx: 'sparks' },
  smith:     { g: 'stomp',   s: 13, b: 4, l: 0.2,  a: 6,  c: 0.75, arm: 'drag',     air: 'cannonball', sq: 0.62, plant: 2, fx: 'embers' },
  mimic:     { g: 'hover',   s: 0,  b: 7, l: 0.14, a: 10, c: 1,    arm: 'swing',    air: 'float',      sq: 0.9 },
  stormmage: { g: 'hover',   s: 0,  b: 3, l: 0.2,  a: 12, c: 1,    arm: 'out',      air: 'spread',     sq: 0.88, fx: 'sparks' },
  strider:   { g: 'sprint',  s: 20, b: 3, l: 0.34, a: 16, c: 0.9,  arm: 'swing',    air: 'backflip',   sq: 0.8,  fx: 'dust' },
  specter:   { g: 'hover',   s: 0,  b: 2, l: 0.2,  a: 4,  c: 1,    arm: 'still',    air: 'pike',       sq: 0.86, fx: 'shadow' },
  inferno:   { g: 'stomp',   s: 16, b: 5, l: 0.4,  a: 18, c: 0.9,  arm: 'flail',    air: 'cannonball', sq: 0.64, plant: 2, fx: 'embers' },
  byte:      { g: 'glitch',  s: 0,  b: 4, l: 0.2,  a: 8,  c: 1,    arm: 'robot',    air: 'glitch',     sq: 0.86, fx: 'pixels' },
  titanus:   { g: 'robot',   s: 16, b: 4, l: 0.16, a: 8,  c: 0.65, arm: 'robot',    air: 'thruster',   sq: 0.58, plant: 3, fx: 'sparks' },
  apexx:     { g: 'sprint',  s: 15, b: 3, l: 0.3,  a: 12, c: 1.05, arm: 'robot',    air: 'flip',       sq: 0.8,  fx: 'pixels' },
  strix:     { g: 'glide',   s: 10, b: 8, l: 0.36, a: 6,  c: 0.9,  arm: 'back',     air: 'wingflap',   sq: 0.84, fx: 'shadow' },
  kuro:      { g: 'swagger', s: 15, b: 4, l: 0.28, a: 6,  c: 0.82, arm: 'shoulder', air: 'cannonball', sq: 0.66, plant: 1 },
  bismuth:   { g: 'stomp',   s: 12, b: 3, l: 0.14, a: 6,  c: 0.7,  arm: 'swing',    air: 'cannonball', sq: 0.62, plant: 2, fx: 'frost' },
  aura:      { g: 'hover',   s: 0,  b: 3, l: 0.1,  a: 6,  c: 1,    arm: 'pray',     air: 'meditate',   sq: 0.9,  fx: 'petals' },
  nox:       { g: 'shuffle', s: 9,  b: 2, l: 0.28, a: 4,  c: 1.05, arm: 'cross',    air: 'capedive',   sq: 0.84 },
  helix:     { g: 'lope',    s: 20, b: 6, l: 0.12, a: 22, c: 0.9,  arm: 'flail',    air: 'corkscrew',  sq: 0.78 },
  zealot:    { g: 'sprint',  s: 15, b: 4, l: 0.4,  a: 6,  c: 1.15, arm: 'back',     air: 'flip',       sq: 0.78, fx: 'sparks' },
  pyre:      { g: 'slither', s: 12, b: 2, l: 0.36, a: 10, c: 1.2,  arm: 'claw',     air: 'corkscrew',  sq: 0.84, fx: 'embers' },
  vesper:    { g: 'glide',   s: 8,  b: 6, l: 0.42, a: 4,  c: 1.4,  arm: 'claw',     air: 'wingflap',   sq: 0.86, fx: 'sparks' },
  rogue:     { g: 'swagger', s: 15, b: 3, l: 0.26, a: 12, c: 1,    arm: 'out',      air: 'backflip',   sq: 0.8,  fx: 'pixels' },
  titanis:   { g: 'stomp',   s: 11, b: 2, l: 0.1,  a: 4,  c: 0.62, arm: 'swing',    air: 'cannonball', sq: 0.58, plant: 2.5, fx: 'dust' },
  paradox:   { g: 'robot',   s: 13, b: 3, l: 0.18, a: 12, c: 1.1,  arm: 'robot',    air: 'backflip',   sq: 0.82, fx: 'ghost' },
  zen:       { g: 'prowl',   s: 14, b: 1, l: 0.3,  a: 2,  c: 1.05, arm: 'hilt',     air: 'pike',       sq: 0.8 },
  fable:     { g: 'bounce',  s: 10, b: 7, l: 0.08, a: 12, c: 0.95, arm: 'swing',    air: 'starfish',   sq: 0.86, fx: 'petals' },
  goliath:   { g: 'stomp',   s: 15, b: 5, l: 0.3,  a: 12, c: 0.68, arm: 'swing',    air: 'splash',     sq: 0.56, plant: 3, fx: 'dust' },
  orin:      { g: 'march',   s: 15, b: 3, l: 0.22, a: 4,  c: 1,    arm: 'shoulder', air: 'pike',       sq: 0.76 },
  nyx2:      { g: 'prowl',   s: 16, b: 2, l: 0.5,  a: 6,  c: 1.2,  arm: 'back',     air: 'capedive',   sq: 0.8,  fx: 'shadow' },
  kryp:      { g: 'stagger', s: 12, b: 3, l: 0.2,  a: 14, c: 0.85, arm: 'flail',    air: 'starfish',   sq: 0.84 },
  atlas:     { g: 'hover',   s: 0,  b: 5, l: 0.08, a: 8,  c: 1,    arm: 'cross',    air: 'float',      sq: 0.88 },
  siren:     { g: 'dance',   s: 9,  b: 4, l: 0.06, a: 10, c: 0.9,  arm: 'out',      air: 'spin',       sq: 0.86, fx: 'petals' },
  talon:     { g: 'glide',   s: 14, b: 9, l: 0.4,  a: 6,  c: 1,    arm: 'back',     air: 'dive',       sq: 0.76, fx: 'dust' },
  brimstone: { g: 'stomp',   s: 14, b: 5, l: 0.3,  a: 14, c: 0.75, arm: 'swing',    air: 'splash',     sq: 0.6,  plant: 2.5, fx: 'embers' },
  gridrunner:{ g: 'glitch',  s: 16, b: 3, l: 0.4,  a: 16, c: 1.15, arm: 'pump',     air: 'flip',       sq: 0.8,  fx: 'pixels' },
  vanguard:  { g: 'march',   s: 12, b: 3, l: 0.18, a: 2,  c: 0.82, arm: 'shield',   air: 'pike',       sq: 0.68, plant: 1.2 },
  omega:     { g: 'hover',   s: 0,  b: 4, l: 0.28, a: 10, c: 1,    arm: 'out',      air: 'starburst',  sq: 0.84, fx: 'ghost' },
  axiom:     { g: 'orbit',   s: 0,  b: 4, l: 0.12, a: 8,  c: 1,    arm: 'compass',  air: 'starburst',  sq: 0.88, fx: 'sparks' },
  riptide:   { g: 'surf',    s: 14, b: 4, l: 0.36, a: 14, c: 0.95, arm: 'wave',     air: 'splash',     sq: 0.78, fx: 'frost' },
  monolith:  { g: 'grind',   s: 10, b: 1, l: 0.06, a: 6,  c: 0.6,  arm: 'slab',     air: 'cannonball', sq: 0.56, plant: 3, fx: 'dust' },
  origami:   { g: 'flutter', s: 12, b: 8, l: 0.3,  a: 10, c: 1.2,  arm: 'fan',      air: 'spin',       sq: 0.86, fx: 'petals' },
  comet:     { g: 'streak',  s: 22, b: 3, l: 0.78, a: 6,  c: 1.4,  arm: 'swept',    air: 'superman',   sq: 0.8,  fx: 'embers' },
  // v13: the Item Shop fighters
  djinn:     { g: 'genie',   s: 0,  b: 5, l: 0.2,  a: 10, c: 1,    arm: 'lamp',     air: 'wisp',       sq: 0.9,  fx: 'ghost' },
  scarab:    { g: 'scuttle', s: 10, b: 2, l: 0.14, a: 6,  c: 1.15, arm: 'carapace', air: 'shellroll',  sq: 0.68, plant: 1, fx: 'dust' },
  lumen:     { g: 'jelly',   s: 0,  b: 6, l: 0.1,  a: 12, c: 0.9,  arm: 'tendril',  air: 'bell',       sq: 0.9,  fx: 'sparks' },
  totem:     { g: 'rock',    s: 9,  b: 3, l: 0.04, a: 6,  c: 0.7,  arm: 'idol',     air: 'plummet',    sq: 0.58, plant: 2.5, fx: 'dust' },
  hive:      { g: 'buzz',    s: 10, b: 5, l: 0.36, a: 8,  c: 1.3,  arm: 'sting',    air: 'hum',        sq: 0.84, fx: 'sparks' },
  // v14: the Japanese Pug and the Panda Monk
  pug:       { g: 'pugtrot', s: 12, b: 6, l: 0.32, a: 10, c: 1.35, arm: 'paw',      air: 'tornado',    sq: 0.78, fx: 'dust' },
  panda:     { g: 'waddle',  s: 9,  b: 4, l: 0.08, a: 8,  c: 0.8,  arm: 'bear',     air: 'bellyflop',  sq: 0.6,  plant: 2, fx: 'dust' }
};

/* ---------------- arm carriage (fists, local space; ph = gait phase, a = swing amount) ---------------- */
function armCarriage(M, A, ph, k, t) {
  const a = M.a * k, s = Math.sin(ph), c = Math.cos(ph);
  switch (M.arm) {
    case 'pump':     return { fa: [s * -a + 4, -36 + Math.max(0, -c) * 6], ba: [s * a - 4, -36 + Math.max(0, c) * 6] };   // sprinter's driving arms
    case 'swing':    return { fa: [A * 0.6 - s * a, -22 - Math.abs(s) * 4], ba: [-A * 0.6 + s * a, -22 - Math.abs(s) * 4] };   // loose, heavy swings
    case 'back':     return { fa: [-A - 4, -30 + s * 2], ba: [-A - 12, -34 - s * 2] };                                     // arms trailing behind (ninja / racer)
    case 'out':      return { fa: [A + 10, -42 + s * a * 0.3], ba: [-A - 10, -42 - s * a * 0.3] };                        // spread for balance
    case 'still':    return { fa: [A + 2, -38 + s], ba: [A * 0.3, -34] };                                                 // weapon held steady
    case 'guard':    return { fa: [A * 0.65, -46 + s * 2], ba: [A * 0.3, -48 - s * 2] };                                  // boxer's guard
    case 'claw':     return { fa: [A + 14, -40 + s * a * 0.4], ba: [A + 6, -36 - s * a * 0.4] };                          // reaching forward
    case 'pray':     return { fa: [8, -44 + s], ba: [4, -44 + s] };                                                       // palms together
    case 'flail':    return { fa: [A + Math.sin(ph * 2) * a, -50 + Math.cos(ph * 2) * a * 0.6], ba: [-A + Math.cos(ph * 1.6) * a, -46 + Math.sin(ph * 1.3) * a * 0.6] };
    case 'cross':    return { fa: [5, -34], ba: [-2, -32] };                                                              // arms folded
    case 'hilt':     return { fa: [-A * 0.15, -20], ba: [-A * 0.5, -22] };                                                // hand resting on the hilt
    case 'drag':     return { fa: [-A - 10, -12 + Math.abs(s) * 2], ba: [-A * 0.4, -22] };                                // dragging a heavy weapon
    case 'shoulder': return { fa: [A * 0.2, -62], ba: [A * 0.35, -48 + s * 2] };                                          // weapon on the shoulder
    case 'shield':   return { fa: [A * 0.5, -30 - s * 2], ba: [A + 8, -40] };                                             // shield carried forward
    case 'robot':    { const q = Math.round(s * 2) / 2; return { fa: [A * 0.7 - q * a, -26], ba: [-A * 0.7 + q * a, -26] }; }   // snapping, quantized swings
    case 'hips':     return { fa: [A * 0.45, -22], ba: [-A * 0.45, -22] };
    case 'compass':  return { fa: [A + 10 + Math.cos(t * 0.05) * 6, -46 + Math.sin(t * 0.05) * 6], ba: [-A * 0.4, -40 + s] };                       // one hand tracing circles in the air
    case 'wave':     return { fa: [A + 6 + s * a * 0.5, -36 + Math.sin(ph + 1.2) * a * 0.5], ba: [-A - 8 - s * a * 0.4, -38 + Math.sin(ph + 2.4) * a * 0.5] };   // arms rolling like water
    case 'slab':     return { fa: [A * 0.75 + s * a * 0.3, -10], ba: [-A * 0.55 - s * a * 0.3, -12] };                                                // stone arms swinging low like pendulums
    case 'fan':      return { fa: [A * 0.45, -60 + s * 2], ba: [-A - 14, -30 - s * 2] };                                                              // the fan held up at the face, the other arm trailing
    case 'swept':    return { fa: [-A - 10, -24 + s * 2], ba: [-A - 18, -30 - s * 2] };                                                               // both arms swept straight back
    case 'lamp':     return { fa: [A * 0.6, -40 + s * 2], ba: [A * 0.2 + Math.cos(t * 0.05) * 6, -56 + Math.sin(t * 0.05) * 4] };                       // the lamp cupped up front, the other hand weaving spells
    case 'carapace': return { fa: [A * 0.55 + s * a * 0.2, -40], ba: [A * 0.3 - s * a * 0.2, -42] };                                              // forearms raised like a beetle's shield
    case 'tendril':  return { fa: [A * 0.5 + Math.sin(ph * 1.3) * a * 0.5, -14 + Math.cos(ph * 1.1) * 4], ba: [-A * 0.4 + Math.sin(ph * 1.3 + 1.5) * a * 0.5, -16 + Math.cos(ph * 1.1 + 1.2) * 4] };   // trailing tentacles
    case 'idol':     return { fa: [A * 0.5, -30 + Math.abs(s) * 2], ba: [-A * 0.5, -30 + Math.abs(s) * 2] };                                          // rigid carved arms
    case 'sting':    return { fa: [A + 8 + s * a * 0.3, -44], ba: [A * 0.2, -40 - s * 2] };                                                          // the stinger arm cocked forward
    case 'paw':      return { fa: [A * 0.72 + s * a * 0.2, -36 + Math.abs(s) * 3], ba: [A * 0.4 - s * a * 0.2, -31 + Math.abs(c) * 2] };   // (v16: paws at the chest, clear of the face)                 // little kung-fu paws held up, ready
    case 'bear':     return { fa: [A * 0.6 + s * a * 0.3, -26 + Math.abs(s) * 3], ba: [-A * 0.5 - s * a * 0.3, -26 + Math.abs(c) * 3] };                 // big round arms swinging wide
  }
  return { fa: [A, -28], ba: [-A, -26] };
}

/* ---------------- gaits: k = intensity (0.5 walk → 1 run, more when dashing) ---------------- */
function gaitPose(f, M, A, t, k) {
  const ph = (f.runPhase || 0) * M.c, s = Math.sin(ph), c = Math.cos(ph), S = M.s * k, B = M.b * k, L = M.l * k;
  const arms = armCarriage(M, A, ph, k, t);
  const legs = (stride, lift) => ({ ff: [s * stride, -Math.max(0, c) * lift], bf: [-s * stride, -Math.max(0, -c) * lift] });
  switch (M.g) {
    case 'stomp':   return Object.assign({}, arms, legs(S, S * 0.45), { lean: L, oy: Math.abs(c) * B, sy: 1 - Math.abs(c) * 0.05, sx: 1 + Math.abs(c) * 0.04, hd: [2, 2 + Math.abs(c) * 2] });
    case 'sprint':  return Object.assign({}, arms, legs(S, S * 0.75), { lean: L, oy: -Math.abs(s) * B, hd: [3, 0] });
    case 'bounce':  return Object.assign({}, arms, { ff: [4 + s * S * 0.4, -2 - Math.max(0, s) * 6], bf: [-4 - s * S * 0.4, -2 - Math.max(0, -s) * 6], lean: L, oy: -Math.abs(Math.sin(ph * 1.5)) * B, sy: 1 + Math.abs(Math.sin(ph * 1.5)) * 0.06 });
    case 'hover':   return Object.assign({}, arms, { ff: [4 + s * 2, 6], bf: [-4 + s * 2, 9], lean: L, oy: -12 - Math.sin(t * 0.08 + f.id) * B });
    case 'bound':   { const g = Math.sin(ph * 1.2);                                         // quadruped gallop: hands are the front legs
                      return { fa: [A + 16 + g * S * 0.8, -2 - Math.max(0, g) * 8], ba: [A + 6 - g * S * 0.8, -2 - Math.max(0, -g) * 8], ff: [-4 - g * S * 0.6, -Math.max(0, -g) * 7], bf: [-15 + g * S * 0.6, -Math.max(0, g) * 7],
                               lean: L, sy: 0.86, oy: -Math.abs(g) * B * 0.6, hd: [10, 12] }; }
    case 'skate':   { const w = Math.sin(ph * 0.6);                                         // long gliding strides, pushing off sideways
                      return Object.assign({}, arms, { ff: [8 + w * S, -Math.max(0, w) * 4], bf: [-8 - w * S * 1.1, -Math.max(0, -w) * 4], lean: L, oy: Math.abs(w) * 1.5 }); }
    case 'slither': return Object.assign({}, arms, { ff: [6 + s * 3, 0], bf: [-6 - s * 3, 0], lean: L + s * 0.08, oy: 6, sy: 0.88, sx: 1.08, hd: [8 + s * 3, 6] });
    case 'march':   return Object.assign({}, arms, legs(S, S * 0.32), { lean: L, oy: Math.abs(c) * B * 0.4, hd: [1, -1] });
    case 'prowl':   return Object.assign({}, arms, legs(S, S * 0.4), { lean: L, oy: 4 + Math.abs(s) * B, sy: 0.9, hd: [3, 3] });
    case 'swagger': return Object.assign({}, arms, legs(S, S * 0.5), { lean: L + s * 0.08, oy: -Math.abs(s) * B, hd: [2 + s * 2, 0] });
    case 'lope':    return Object.assign({}, arms, legs(S, S * 0.6), { lean: L, oy: -Math.abs(s) * B, sy: 1.04, hd: [2, 1] });
    case 'glide':   { const h = Math.abs(Math.sin(ph * 0.5));                               // springy hops, wings half-open
                      return Object.assign({}, arms, { ff: [6, -h * 10], bf: [-4, -h * 8], lean: L, oy: -h * B * 1.4, sy: 1 + h * 0.08 }); }
    case 'robot':   { const q = Math.round(s * 2) / 2, qc = Math.round(c * 2) / 2;          // mechanical, quantized steps
                      return Object.assign({}, arms, { ff: [q * S, -Math.max(0, qc) * S * 0.4], bf: [-q * S, -Math.max(0, -qc) * S * 0.4], lean: L, oy: Math.abs(qc) * B * 0.5 }); }
    case 'glitch':  { const j = n => (hash(((t >> 2) * 7) + n + f.id) - 0.5) * 8;          // a sprint that skips frames and jitters
                      return Object.assign({}, arms, legs(S, S * 0.6), { lean: L + j(1) * 0.01, oy: -Math.abs(s) * B + j(2) * 0.4, hd: [j(3) * 0.4, j(4) * 0.3] }); }
    case 'stagger': return Object.assign({}, arms, { ff: [s * S, -Math.max(0, c) * S * 0.4], bf: [-12 - s * 2, 0], lean: L + Math.sin(ph * 0.5) * 0.22, oy: Math.abs(c) * 2, hd: [Math.sin(ph * 0.5) * 6, 4] });   // a lurching undead drag
    case 'dance':   return Object.assign({}, arms, legs(S, S * 0.4), { lean: L, oy: -Math.abs(Math.sin(ph * 2)) * B, hd: [2, Math.abs(Math.sin(ph * 2)) * 3] });          // grooving to the beat
    case 'shuffle': return Object.assign({}, arms, legs(S * 0.7, S * 0.2), { lean: L, oy: 3, sy: 0.94, hd: [4, 4] });
    case 'orbit':   { const w = Math.sin(t * 0.06 + f.id);                                  // floating cross-legged, tilting into the travel direction
                      return Object.assign({}, arms, { ff: [7, -12 + w], bf: [-7, -11 - w], lean: L + 0.1 * k, oy: -18 - Math.sin(t * 0.08 + f.id) * B, sy: 0.94, hd: [1, -1] }); }
    case 'surf':    { const r = Math.sin(ph * 0.5);                                         // riding a wave: a wide side-on stance, knees bent, rocking fore and aft
                      return Object.assign({}, arms, { ff: [12 + r * 3, -Math.max(0, r) * 3], bf: [-12 + r * 3, -Math.max(0, -r) * 3], lean: L + r * 0.12, oy: 5 + Math.abs(r) * B * 0.6, sy: 0.9, sx: 1.04, hd: [3 + r * 2, 2] }); }
    case 'grind':   return Object.assign({}, arms, legs(S * 0.8, S * 0.12), { lean: L, oy: Math.abs(c) * B * 0.3, hd: [0, 1], stiff: 1 });            // an obelisk glides: feet barely lift, the body stays level
    case 'flutter': { const h = Math.abs(Math.sin(ph * 1.3));                               // tiptoe hops, drifting like paper on a breeze
                      return Object.assign({}, arms, { ff: [5 + s * S * 0.5, -h * 7], bf: [-5 - s * S * 0.5, -h * 4 - 2], lean: L + Math.sin(ph * 0.65) * 0.06, oy: -h * B, sy: 1 + h * 0.05, spin: Math.sin(ph * 0.65) * 0.05 }); }
    case 'streak':  return Object.assign({}, arms, legs(S, S * 0.9), { lean: L, oy: 8 - Math.abs(s) * B, sy: 0.9, hd: [8, 6] });                        // a comet's sprint: bent nearly flat, legs a blur
    case 'genie':   return Object.assign({}, arms, { ff: [4, -16], bf: [-4, -14], lean: L + 0.12 * k, oy: -16 - Math.sin(t * 0.07 + f.id) * B, sy: 0.96, hd: [2, -1] });   // gliding on the smoke tail, leaning into the travel
    case 'scuttle': return Object.assign({}, arms, legs(S, S * 0.3), { lean: L, oy: 4 + Math.abs(Math.sin(ph * 2)) * B * 0.5, sy: 0.92, sx: 1.04, hd: [3, 2] });          // quick, low beetle steps
    case 'jelly':   { const h = Math.max(0, Math.sin(ph * 0.8));                            // the bell contracts and pushes it along in pulses
                      return Object.assign({}, arms, { ff: [3 + s * 2, 8 + h * 4], bf: [-3 - s * 2, 10 + h * 4], lean: L, oy: -14 - h * B * 1.4, sy: 1 - h * 0.08, sx: 1 + h * 0.06 }); }
    case 'rock':    return Object.assign({}, arms, legs(S * 0.6, S * 0.25), { lean: s * 0.12, oy: Math.abs(s) * B * 0.6, spin: s * 0.04, hd: [0, 1], stiff: 1 });      // a carved idol waddling side to side
    case 'buzz':    return Object.assign({}, arms, { ff: [6 + s * S * 0.3, -6], bf: [-6 - s * S * 0.3, -4], lean: L, oy: -6 - Math.abs(Math.sin(t * 0.6)) * 2 - B * 0.5 });   // skimming the floor on buzzing wings
    case 'pugtrot': { const h = Math.abs(Math.sin(ph));                                     // a pug's quick, bouncy little trot: short legs a blur, the whole body waddling
                      return Object.assign({}, arms, legs(S, S * 0.75), { lean: L, oy: -h * B, sy: 1 + h * 0.06, sx: 1 - h * 0.03, spin: Math.sin(ph) * 0.05, hd: [3, Math.abs(Math.cos(ph)) * 2] }); }
    case 'waddle':  return Object.assign({}, arms, legs(S * 0.7, S * 0.3), { lean: L + s * 0.03, oy: Math.abs(s) * B * 0.6, spin: s * 0.07, sx: 1 + Math.abs(c) * 0.05, sy: 1 - Math.abs(c) * 0.03, hd: [s * 2, 1] });   // a heavy panda waddle, rocking hip to hip
  }
  return Object.assign({}, arms, legs(S, S * 0.6), { lean: L });
}

/* ---------------- mid-air styles: rise / apex / fall ---------------- */
function airStylePose(f, M, A, t) {
  const v = f.vy, rise = v < -4, fall = v > 3, w = Math.sin(t * 0.35);
  switch (M.air) {
    case 'tuck':       return { fa: [8, -34], ba: [-8, -32], ff: [8, -22], bf: [-6, -20], sy: 0.92 };
    case 'spread':     return { fa: [A + 16, -58], ba: [-A - 16, -58], ff: [12, 2], bf: [-12, 2] };
    case 'wingflap':   return { fa: [A + 12, -50 + w * 14], ba: [-A - 12, -50 + w * 14], ff: [4, -4], bf: [-4, -2], oy: w * 2 };
    case 'thruster':   return { fa: [-A * 0.4, -16], ba: [-A * 0.8, -18], ff: [2, 6], bf: [-3, 5], lean: 0.08 };
    case 'meditate':   return { fa: [8, -40], ba: [4, -40], ff: [14, -14], bf: [-14, -14], sy: 0.92 };
    case 'capedive':   return { fa: [-A - 8, -40], ba: [-A - 12, -46], ff: [6, 0], bf: [-10, 2], lean: fall ? 0.45 : 0.1 };
    case 'spin':       return { fa: [A + 14, -48], ba: [-A - 14, -48], ff: [6, -6], bf: [-6, -2], sx: 0.75 + 0.25 * Math.abs(Math.cos(t * 0.25)) };
    case 'pike':       return { fa: [A + 10, -44], ba: [A + 4, -40], ff: [12, -2], bf: [8, 0], lean: fall ? 0.2 : -0.05 };
    case 'cannonball': return { fa: [10, -24], ba: [-4, -22], ff: [10, -18], bf: [-2, -16], sy: 0.88, sx: 1.06 };
    case 'starfish':   return { fa: [A + 14, -64 + w * 4], ba: [-A - 14, -60 - w * 4], ff: [14, 4], bf: [-14, 4] };
    case 'corkscrew':  return { fa: [6, -86], ba: [-6, -84], ff: [3, 2], bf: [-3, 4], sx: 0.7 + 0.3 * Math.abs(Math.cos(t * 0.4)), sy: 1.08 };
    case 'superman':   return { fa: [A + 22, -40], ba: [-A - 6, -34], ff: [-6, -8], bf: [-14, -10], lean: 0.6 };
    case 'pounce':     return { fa: [A + 18, -30], ba: [A + 10, -28], ff: [-8, -6], bf: [-16, -10], lean: rise ? 0.3 : 0.55 };
    case 'backflip':   return rise ? { fa: [-A, -66], ba: [-A - 10, -60], ff: [8, -8], bf: [-6, -4], lean: -0.25, hd: [-3, -4] } : { fa: [A + 8, -48], ba: [-A - 8, -46], ff: [10, -4], bf: [-8, -6] };
    case 'kickflip':   return { fa: [A + 10, -46], ba: [-A - 12, -40], ff: [18, -26 - w * 4], bf: [-6, 0], lean: -0.1 };
    case 'glitch':     { const j = n => (hash((t >> 2) * 5 + n + f.id) - 0.5) * 18; return { fa: [A + j(1), -46 + j(2)], ba: [-A + j(3), -44 + j(4)], ff: [8 + j(5) * 0.4, -4], bf: [-8 + j(6) * 0.4, -2] }; }
    case 'float':      return { fa: [A + 12, -40 + w * 3], ba: [-A - 12, -40 - w * 3], ff: [3, 6], bf: [-3, 8], oy: -2 };
    case 'dive':       return fall ? { fa: [A + 14, -14], ba: [A + 6, -10], ff: [-6, -16], bf: [-12, -20], lean: 0.7 } : { fa: [A + 6, -62], ba: [-A * 0.5, -40], ff: [8, -10], bf: [-6, -4] };
    case 'grab':       return { fa: [12, -8], ba: [-A - 10, -46], ff: [12, -12], bf: [-10, -10], sy: 0.92, lean: 0.1 };
    case 'starburst':  return { fa: [A * 0.8, -96], ba: [-A * 0.8, -96], ff: [12, 6], bf: [-12, 6], sy: 1.06 };
    case 'splash':     return fall ? { fa: [A + 18, -40], ba: [-A - 18, -40], ff: [14, -10], bf: [-14, -10], lean: 0.35, sx: 1.08 } : { fa: [A + 8, -64], ba: [-A - 8, -64], ff: [10, -4], bf: [-10, -4] };
    case 'wisp':       return { fa: [A + 10, -50 + w * 4], ba: [-A - 6, -46 - w * 4], ff: [4, -14], bf: [-4, -12], oy: -2, lean: 0.1 };
    case 'shellroll':  return { fa: [8, -26], ba: [-4, -24], ff: [10, -18], bf: [-2, -16], sy: 0.86, sx: 1.08 };
    case 'bell':       return { fa: [A * 0.6 + w * 6, -20 + w * 6], ba: [-A * 0.6 - w * 6, -22 + w * 6], ff: [4, 8 + w * 4], bf: [-4, 10 + w * 4], sy: 1 + w * 0.06, sx: 1 - w * 0.05 };
    case 'plummet':    return fall ? { fa: [A * 0.6, -86], ba: [-A * 0.6, -86], ff: [8, -6], bf: [-8, -6], sy: 1.04 } : { fa: [A + 6, -40], ba: [-A - 6, -40], ff: [10, -8], bf: [-10, -8], sy: 0.92 };
    case 'hum':        return { fa: [A + 12, -40], ba: [A * 0.3, -36], ff: [-4, -10], bf: [-12, -12], lean: 0.4 + w * 0.04 };
    case 'tornado':    return rise ? { fa: [A + 10, -50], ba: [-A - 10, -46], ff: [20, -26 + w * 4], bf: [-6, -6], lean: -0.06, sx: 0.8 + 0.2 * Math.abs(Math.cos(t * 0.4)) }   // a spinning crane kick on the way up
                              : { fa: [A * 0.6, -52], ba: [A * 0.2, -46], ff: [10, -12], bf: [-8, -6], sy: 0.94 };
    case 'bellyflop':  return fall ? { fa: [A + 18, -36], ba: [-A - 18, -36], ff: [14, -8], bf: [-14, -8], lean: 0.32, sx: 1.1, sy: 0.92 }                     // spread-eagle for a belly flop
                              : { fa: [A + 14, -66 + w * 3], ba: [-A - 14, -66 - w * 3], ff: [12, 4], bf: [-12, 4], sy: 1.05 };
  }
  return rise ? { fa: [A + 4, -50], ba: [-A - 6, -36], ff: [9, -10], bf: [-7, -4], sy: 1.04 }               // 'flip': the default athletic jump
              : { fa: [A + 8, -48], ba: [-A - 8, -46], ff: [10, -4], bf: [-8, -6] };
}
// The double jump, per style: somersaults, back-flips, corkscrews, wing-beats, thruster bursts...
function doubleJumpPose(f, M, A, k) {
  const flipK = smooth(k);
  switch (M.air) {
    case 'backflip': case 'capedive': return { fa: [-8, -32], ba: [-12, -30], ff: [6, -24], bf: [-6, -22], sy: 0.9, spin: -TAU * flipK };
    case 'corkscrew': case 'spin': case 'kickflip': case 'grab': case 'tornado': return { fa: [6, -84], ba: [-6, -82], ff: [3, 0], bf: [-3, 2], sx: 0.55 + 0.45 * Math.abs(Math.cos(flipK * TAU * 2)), sy: 1.08 };
    case 'wingflap': case 'float': case 'meditate': case 'starburst': case 'wisp': case 'bell': case 'hum': { const beat = Math.sin(flipK * Math.PI);
      return { fa: [A + 14, -70 + beat * 50], ba: [-A - 14, -70 + beat * 50], ff: [4, 2], bf: [-4, 4], sy: 1 + beat * 0.08 }; }
    case 'thruster': return { fa: [-A * 0.6, -14], ba: [-A, -16], ff: [2, 6], bf: [-2, 6], sy: 1.12, sx: 0.92 };
    case 'superman': case 'dive': case 'pounce': return { fa: [A + 20, -42], ba: [A + 8, -38], ff: [-6, -10], bf: [-14, -12], lean: 0.5, spin: TAU * flipK };
    case 'glitch': return { fa: [A, -40], ba: [-A, -40], ff: [6, -6], bf: [-6, -6], spin: Math.round(flipK * 4) / 4 * TAU };
    case 'cannonball': case 'tuck': case 'splash': case 'shellroll': case 'plummet': case 'bellyflop': return { fa: [8, -24], ba: [-6, -22], ff: [8, -18], bf: [-4, -16], sy: 0.86, spin: TAU * flipK };
  }
  return { fa: [10, -30], ba: [-10, -28], ff: [6, -24], bf: [-6, -22], sy: 0.9, spin: TAU * flipK };
}

/* ---------------- idle: each body type breathes and fidgets in its own way, tuned by the fighter's profile ---------------- */
function idlePose(f, M, A, t) {
  const o = idleBody(f, M, A, t), hd = o.hd || [0, 0];
  o.hd = [hd[0], hd[1] + (1 - M.sq) * 6];                                       // deep-crouch jumpers carry their head lower
  o.oy = (o.oy || 0) + (M.a - 10) * 0.06;                                       // big arm-swingers sit a touch lower in their stance
  return o;
}
function idleBody(f, M, A, t) {
  const w = 0.045 + 0.03 * M.c, ph = t * w + f.id * 1.3, b = Math.sin(ph), b2 = Math.sin(ph * 2), B = M.b, L = M.l;
  const arms = armCarriage(M, A, ph * 0.5, 0.18, t), st = 8 + M.s * 0.35;          // the fighter's own arm carriage, barely swinging · stance follows the stride
  const o = { fa: arms.fa, ba: arms.ba, ff: [st, 0], bf: [-st, 0] };
  switch (M.g) {
    case 'stomp':   return Object.assign(o, { ff: [st + 4, 0], bf: [-st - 4, 0], lean: L * 0.35, sy: 1 + b * 0.009 * B, sx: 1 - b * 0.02, oy: Math.max(0, b) * 1.5, hd: [1, 2 + b * 1.5],   // a slow heave of the shoulders, planted wide
                                         fa: [arms.fa[0] + 4, arms.fa[1] + 6 + b * 2], ba: [arms.ba[0] - 4, arms.ba[1] + 6 - b * 2] });
    case 'sprint':  { const hop = Math.abs(Math.sin(ph * 2)); return Object.assign(o, { oy: -hop * B * 0.5, ff: [st, -hop * 2], bf: [-st, -hop * 3], lean: L * 0.3, hd: [2, 0] }); }   // on the balls of the feet
    case 'bounce':  { const hop = Math.abs(Math.sin(ph * 1.6)); return Object.assign(o, { oy: -hop * B * 0.9, ff: [5, -hop * 5], bf: [-5, -hop * 4], sy: 1 + (hop - 0.5) * 0.1, lean: L * 0.5 }); }   // hopping on the spot
    case 'hover':   return Object.assign(o, { oy: -12 - b * B * 1.2, ff: [4 + b * 2, 6], bf: [-4 - b * 2, 9], lean: L * 0.4 + b2 * 0.03, hd: [0, -b] });                                    // bobbing in the air
    case 'bound':   return Object.assign(o, { fa: [A + 14, -2], ba: [A + 4, -3], ff: [-4, 0], bf: [-14, 0], lean: L * 0.9, sy: 0.86, hd: [9 + b * 3, 12 + b2 * 1.5], oy: Math.max(0, b) });   // on all fours, panting
    case 'skate':   return Object.assign(o, { ff: [st + b * 4, 0], bf: [-st + b * 4, 0], lean: L * 0.25 + b * 0.05, oy: Math.abs(b) * 1.2 });                                                // weight rocking side to side
    case 'slither': return Object.assign(o, { ff: [6, 0], bf: [-6, 0], lean: L * 0.6 + b * 0.12, oy: 6, sy: 0.88, sx: 1.06, hd: [8 + b * 4, 6 + b2 * 2] });                                  // a swaying S-curve
    case 'march':   return Object.assign(o, { ff: [st * 0.75, 0], bf: [-st * 0.75, 0], lean: 0, sy: 1 + b * 0.012, hd: [0, -1] });                                                         // standing at attention
    case 'prowl':   return Object.assign(o, { ff: [st + 3, 0], bf: [-st - 3, 0], lean: L * 0.45, sy: 0.9, oy: 3 + Math.abs(b) * 1.5, hd: [3 + Math.sin(ph * 0.5) * 3, 3] });               // low and coiled, scanning
    case 'swagger': return Object.assign(o, { lean: -0.08 + b * 0.05, oy: -Math.abs(b2) * B * 0.3, hd: [2 + b * 2, -1 + Math.abs(b2)] });                                                    // cocky lean back, head bobbing
    case 'lope':    return Object.assign(o, { fa: [arms.fa[0] + b * 6, arms.fa[1] + 10], ba: [arms.ba[0] - b * 6, arms.ba[1] + 10], lean: L * 0.6, hd: [2 + b * 3, 3 + Math.abs(b) * 2] });   // loose arms dangling
    case 'glide':   { const fl = Math.max(0, Math.sin(ph * 0.7)); return Object.assign(o, { fa: [A + 10 + fl * 6, -48 - fl * 12], ba: [-A - 10 - fl * 6, -48 - fl * 12], oy: -fl * 3, lean: L * 0.3 }); }   // stretching the wings
    case 'robot':   { const q = Math.round(b * 2) / 2; return Object.assign(o, { lean: 0, hd: [q * 2, 0], sy: 1 + q * 0.01, stiff: 1, fa: [arms.fa[0], arms.fa[1] + q * 3], ba: [arms.ba[0], arms.ba[1] - q * 3] }); }   // servo twitches
    case 'glitch':  { const j = n => (hash(((t >> 3) * 7) + n + f.id) - 0.5) * 6; return Object.assign(o, { lean: L * 0.3 + j(1) * 0.02, oy: j(2) * 0.4, hd: [j(3) * 0.5, j(4) * 0.4] }); }   // skipping frames
    case 'stagger': return Object.assign(o, { ff: [st, 0], bf: [-st * 0.6, -2], lean: L * 0.5 + Math.sin(ph * 0.5) * 0.18, hd: [Math.sin(ph * 0.5) * 6, 4], fa: [arms.fa[0] + 6, arms.fa[1] + 18] });   // an undead sway
    case 'dance':   { const bt = Math.abs(Math.sin(ph * 2)); return Object.assign(o, { oy: -bt * B * 0.5, hd: [2, bt * 3], lean: Math.sin(ph) * 0.08, ff: [st, -Math.max(0, Math.sin(ph * 2)) * 3], bf: [-st, -Math.max(0, -Math.sin(ph * 2)) * 3] }); }   // grooving to the beat
    case 'shuffle': return Object.assign(o, { ff: [st * 0.7 + Math.max(0, b) * 3, 0], bf: [-st * 0.7 + Math.max(0, -b) * 3, 0], lean: L * 0.6, oy: 3, sy: 0.94, hd: [4, 4] });                // hunched, shuffling
    case 'orbit':   return Object.assign(o, { ff: [7, -12 + b], bf: [-7, -11 - b], oy: -16 - b * B, lean: L * 0.3, sy: 0.95, hd: [0, -b * 0.6], spin: Math.sin(ph * 0.5) * 0.04 });          // meditating cross-legged in mid-air
    case 'surf':    return Object.assign(o, { ff: [st + 4, 0], bf: [-st - 2, 0], lean: L * 0.4 + b * 0.06, oy: 4 + Math.abs(b) * 1.5, sy: 0.92, hd: [2 + b * 2, 2] });                             // balancing on an invisible board
    case 'grind':   return Object.assign(o, { ff: [st + 2, 0], bf: [-st - 2, 0], lean: 0, sy: 1 + b * 0.004, hd: [0, 0.5 * b], stiff: 1 });                                                     // utterly still: a breathing monument
    case 'flutter': { const hop = Math.abs(Math.sin(ph * 1.4)); return Object.assign(o, { ff: [5, -hop * 3], bf: [-6, -hop * 2], oy: -hop * B * 0.5, lean: L * 0.4 + Math.sin(ph * 0.7) * 0.05, hd: [1 + Math.sin(ph * 0.7) * 2, 0] }); }   // weightless, swaying on its toes
    case 'streak':  { const v = Math.abs(Math.sin(ph * 3)); return Object.assign(o, { ff: [st + 2, -v * 2], bf: [-st, -v * 3], lean: L * 0.25, oy: -v, hd: [3, 0] }); }                       // bouncing, impatient to go
    case 'genie':   return Object.assign(o, { oy: -16 - b * B, ff: [4, -16], bf: [-4, -14], lean: L * 0.4, hd: [0, -b * 0.8], spin: Math.sin(ph * 0.5) * 0.05 });                         // drifting on the smoke, slowly turning
    case 'scuttle': return Object.assign(o, { ff: [st + 2, 0], bf: [-st - 2, 0], sy: 0.92 + b * 0.01, oy: 3, lean: L * 0.5, hd: [3 + Math.sin(ph * 0.7) * 2, 2] });                  // low and poised, head twitching
    case 'jelly':   { const h = Math.max(0, Math.sin(ph * 1.2)); return Object.assign(o, { oy: -14 - h * B, sy: 1 - h * 0.07, sx: 1 + h * 0.05, ff: [3, 8 + h * 3], bf: [-3, 10 + h * 3] }); }   // pulsing in place
    case 'rock':    return Object.assign(o, { ff: [st + 4, 0], bf: [-st - 4, 0], lean: b * 0.05, sy: 1 + b * 0.006, hd: [0, 1], stiff: 1 });                                               // a carved idol, rocking on its base
    case 'buzz':    return Object.assign(o, { oy: -4 - Math.abs(Math.sin(t * 0.5)) * 2, ff: [5, -4], bf: [-5, -3], lean: L * 0.3 + b * 0.04, hd: [2 + b, 0] });                                  // hovering a hand's breadth off the floor
    case 'pugtrot': { const pant = Math.abs(Math.sin(t * 0.42)), tilt = Math.sin(ph * 0.5);                                                                                                // panting in a kung-fu stance, head tilting this way and that
                      return Object.assign(o, { ff: [st + 4, 0], bf: [-st - 3, 0], lean: L * 0.3, oy: pant * 0.8, sy: 1 + pant * 0.015, hd: [2 + tilt * 3, Math.abs(tilt) * 1.5 - 1], spin: tilt * 0.03,
                                                fa: [A * 0.75, -37 + pant * 2], ba: [A * 0.42, -32 + pant * 2] }); }
    case 'waddle':  { const chew = Math.max(0, Math.sin(ph * 0.35)), munch = Math.sin(t * 0.32) * chew;                                                                                   // the panda munches a bamboo shoot, belly heaving
                      return Object.assign(o, { ff: [st + 5, 0], bf: [-st - 5, 0], lean: -0.04, sy: 1 + b * 0.012, sx: 1 - b * 0.008, oy: Math.max(0, b) * 1.2,
                                                fa: [lerp(A * 0.5, A * 0.28, chew), lerp(-30, -62, chew)], ba: [A * 0.15, -28 + b * 2], hd: [2, 1 + munch * 1.2] }); }
  }
  return o;
}

/* ---------------- the punch (jab string): chambered, guarded and thrown in each fighter's own style ----------------
 * c = where the fist chambers during the wind-up (x in A units) · g = where the other hand guards · l = how far the
 * body drives into it · plus squash, spin, head tuck. The striking fist stays aimed at the real hitbox.           */
const PUNCH = {
  pump:     { c: [0.2, -42], g: [0.3, -44], l: 0.12, hd: [2, 1] },               // a boxer's straight
  swing:    { c: [-1.1, -46], g: [-1.2, -20], l: 0.28, sx: 1.1 },                // a looping haymaker
  back:     { c: [-0.6, -24], g: [-1.3, -30], l: 0.22, ff: 18 },                 // a ninja's palm from the hip
  out:      { c: [1.2, -62], g: [-1.4, -48], l: 0.06, spin: 0.12 },              // an open-handed slap from high
  still:    { c: [0.1, -34], g: [0.4, -32], l: 0.08, stiff: true },              // a weapon thrust, held steady
  guard:    { c: [0.6, -46], g: [0.25, -48], l: 0.1, hd: [3, 3] },               // a jab out of a tight guard
  claw:     { c: [0.4, -70], g: [1.1, -30], l: 0.34, sy: 0.92 },                 // a raking claw from above
  pray:     { c: [0.25, -44], g: [0.3, -44], l: 0.04, sy: 1.04 },                // a palm strike from prayer hands
  flail:    { c: [-1, -72], g: [0.5, -66], l: 0.18, spin: 0.2 },                 // a wild windmill
  cross:    { c: [0.2, -36], g: [0.1, -32], l: -0.04, hd: [-2, 0] },             // a backfist from folded arms
  hilt:     { c: [-0.2, -20], g: [-0.5, -22], l: 0.26, sy: 0.9 },                // a pommel strike from the hilt
  drag:     { c: [-1.3, -14], g: [-0.5, -20], l: 0.4, sx: 1.12 },                // a heavy low shove
  shoulder: { c: [0.2, -80], g: [0.35, -50], l: 0.16, sy: 0.92 },                // an overhead hammer-fist
  shield:   { c: [0.2, -30], g: [1.4, -38], l: 0.18 },                           // a punch from behind the shield
  robot:    { c: [-0.2, -30], g: [-0.7, -26], l: 0.05, stiff: true, sx: 1.05 },  // a piston snap
  hips:     { c: [0.5, -22], g: [-0.45, -22], l: 0.1 },
  compass:  { c: [0.9, -70], g: [-0.5, -40], l: 0.06, spin: 0.08, hd: [0, -2] },   // a palm strike drawn down an arc from high
  wave:     { c: [-1.0, -30], g: [0.6, -40], l: 0.32, sx: 1.08 },                   // a rolling, surging hook
  slab:     { c: [-0.9, -6], g: [-0.3, -12], l: 0.18, sy: 0.94, stiff: true },      // a stone-fist uppercut from the hip
  fan:      { c: [0.4, -66], g: [-1.2, -32], l: 0.2, spin: 0.16 },                   // a fan-edge slash from the face
  swept:    { c: [-1.4, -20], g: [-1.6, -28], l: 0.46, ff: 22 },                     // a lunging comet punch out of swept-back arms
  lamp:     { c: [0.5, -58], g: [0.2, -50], l: 0.1, spin: 0.1, hd: [1, -1] },        // a palm thrust out of the lamp hand
  carapace: { c: [0.3, -40], g: [0.6, -42], l: 0.2, sy: 0.94, stiff: true },         // a short, shell-backed ram
  tendril:  { c: [-0.8, -12], g: [0.4, -16], l: 0.14, sx: 1.06 },                     // a tentacle lash whipped up from below
  idol:     { c: [-0.5, -44], g: [-0.5, -30], l: 0.24, sy: 0.92, stiff: true },      // a stiff, swinging idol arm
  sting:    { c: [0.8, -40], g: [0.2, -38], l: 0.36, ff: 16 },                        // a darting stinger lunge
  paw:      { c: [0.3, -50], g: [0.25, -46], l: 0.24, spin: 0.1, hd: [2, 1], sy: 0.96 },   // a snapping paw-palm strike out of the guard
  bear:     { c: [-0.8, -50], g: [-0.4, -30], l: 0.3, sx: 1.1, sy: 0.94 }             // a big round bear-paw swipe
};
const GAIT_PUNCH = { stomp: [2, 0.96], sprint: [-2, 1.02], bounce: [-4, 1.04], hover: [-6, 1], bound: [4, 0.9], skate: [0, 1], slither: [5, 0.9], march: [0, 1], prowl: [3, 0.92],
                     swagger: [-1, 1.03], lope: [1, 1.02], glide: [-3, 1], robot: [0, 1], glitch: [0, 1], stagger: [2, 0.97], dance: [-2, 1.03], shuffle: [3, 0.95],
                     orbit: [-6, 1], surf: [4, 0.94], grind: [2, 0.97], flutter: [-3, 1.04], streak: [3, 0.96],
                     genie: [-6, 1], scuttle: [3, 0.94], jelly: [-6, 1], rock: [2, 0.96], buzz: [-2, 1.03], pugtrot: [-1, 1.02], waddle: [3, 0.95] };
function punchStyle(f, M, A, P, phase) {
  const S = PUNCH[M.arm] || PUNCH.pump, m = f.move, t = f.stateT, gb = GAIT_PUNCH[M.g] || [0, 1];
  const drive = S.l + M.l * 0.25, gx = S.g[0] * A + M.a * 0.15 * (S.g[0] < 0 ? -1 : 1), gy = S.g[1] - M.b * 0.4;
  const R = { fa: P.fa.slice(), ba: P.ba.slice(), ff: P.ff.slice(), bf: P.bf.slice(), hd: P.hd.slice(), lean: P.lean, spin: P.spin, sx: P.sx, sy: P.sy, oy: P.oy, stiff: P.stiff };
  if (phase === 'wind') {                                                       // chamber the fist, set the guard, coil back
    const k = smooth(t / Math.max(1, m.s - 2));
    R.fa = [lerp(P.fa[0], S.c[0] * A - M.s * 0.2, k), lerp(P.fa[1], S.c[1] + M.b * 0.5, k)];
    R.ba = [lerp(P.ba[0], gx, k), lerp(P.ba[1], gy, k)];
    R.lean = P.lean - drive * 0.5 * k; R.oy = P.oy + gb[0] * 0.5 * k;
    if (S.sx) R.sx = P.sx * (1 + (S.sx - 1) * 0.5 * k);
  } else {                                                                      // drive into the strike, then settle
    const k = phase === 'strike' ? 1 : 1 - smooth((t - m.s - m.a) / Math.max(4, m.e * 0.8));
    R.ba = [lerp(P.ba[0], gx, k), lerp(P.ba[1], gy, k)];
    R.lean = P.lean + drive * k; R.oy = P.oy + gb[0] * k - M.b * 0.3 * k; R.sy = P.sy * (1 + (gb[1] - 1) * k);
    if (S.sx) R.sx = P.sx * (1 + (S.sx - 1) * k); if (S.sy) R.sy *= 1 + (S.sy - 1) * k;
    if (S.spin) R.spin = P.spin + S.spin * k;
    if (S.hd) R.hd = [P.hd[0] + S.hd[0] * k, P.hd[1] + S.hd[1] * k + (M.c - 1) * 6 * k];
    else R.hd = [P.hd[0], P.hd[1] + (M.c - 1) * 6 * k];
    if (S.ff) R.ff = [Math.max(P.ff[0], S.ff * k), P.ff[1]];
    if (phase === 'strike' && m) {                                              // keep the fist on the hitbox despite the extra drive
      const hb = hitboxRect(f, m), Hw = [(hb.x + hb.w / 2 - f.x) * f.facing, hb.y + hb.h / 2 - f.y];
      const a0 = intoBody(Hw, P.lean, P.sx, P.sy), a1 = intoBody(Hw, R.lean, R.sx, R.sy);
      R.fa = [P.fa[0] + a1[0] - a0[0], P.fa[1] + a1[1] - a0[1]];
    }
  }
  if (S.stiff) R.stiff = 1;
  return R;
}

/* ---------------- motionPose: the last layer of computePose ---------------- */
const MOTION_GROUND = { run: 1, dash: 1.25, walk: 0.5 };
const PUNCH_POSES = ['jab:wind', 'jab:strike', 'jab:recover', 'jab2:wind', 'jab2:strike', 'jab2:recover', 'jab3:wind', 'jab3:strike', 'jab3:recover'];
function motionPose(f, P, name, base, A, t) {
  const M = MOTION[f.ch.id]; if (!M) return [P, name];
  const id = f.ch.id;
  if (f.state === 'special' && f.sp && f.sp.type === 'burst' && f.ch.special.roll && f.stateT >= (f.sp.wind || 0) - 2) {      // PANDAMONIUM's Barrel Roll: curled into a ball, rolling
    const r = f.facing * Math.max(0, f.stateT - (f.sp.wind || 0) + 2) * 0.55;
    return [pose({ fa: [10, -24], ba: [-4, -22], ff: [10, -20], bf: [-2, -18], sy: 0.8, sx: 1.08, oy: -8, spin: r, hd: [7, 12] }), 'roll:' + id];
  }
  if (base === 'idle' && f.onGround) return [pose(idlePose(f, M, A, t)), 'idle:' + id];
  if (f.move && PUNCH_POSES.includes(base)) return [punchStyle(f, M, A, P, base.slice(base.indexOf(':') + 1)), base + ':' + id];
  if (MOTION_GROUND[base] !== undefined && f.onGround && !f.crawl) {
    const k = MOTION_GROUND[base], G2 = gaitPose(f, M, A, t, k);
    if (base === 'dash') G2.lean = (G2.lean || 0) + 0.1;
    return [pose(G2), (base === 'walk' ? 'walk:' : 'run:') + id];
  }
  if (base === 'jump:squat') return [pose({ fa: [A * 0.5, -10], ba: [-A * 0.5, -12], ff: [10, 0], bf: [-10, 0], sy: M.sq, sx: 2 - M.sq, hd: [0, 4 + (1 - M.sq) * 10] }), 'jump:squat:' + id];
  if (base === 'air:jump-flip') return [pose(doubleJumpPose(f, M, A, 1 - f.flipT / 20)), 'air:double:' + id];
  if (base === 'air:rise' || base === 'air:fall' || base === 'air:apex') return [pose(airStylePose(f, M, A, t)), 'air:' + id];
  return [P, name];
}

/* ---------------- results screen: keyframed victory + defeat animations ----------------
 * A keyframe is [time 0..1, pose] where fa / ba x are in units of A (the fighter's arm reach) and everything else is in px.
 * Short keys: fa ba ff bf (fists / feet) · l lean · o vertical offset · s spin · h head offset · sx sy squash.
 * d: loop length in frames · step: snap between keys (robots) · jit: random shiver · prop / smoke: scene extras.          */
function V(d, keys, extra) { return Object.assign({ d, k: keys }, extra || {}); }
function keyPose(o, A) {
  const p = { fa: [A, -26], ba: [-A, -24], ff: [10, 0], bf: [-10, 0] };
  return pose({ fa: o.fa ? [o.fa[0] * A, o.fa[1]] : p.fa, ba: o.ba ? [o.ba[0] * A, o.ba[1]] : p.ba, ff: o.ff || p.ff, bf: o.bf || p.bf,
                lean: o.l || 0, oy: o.o || 0, spin: o.s || 0, hd: o.h || [0, 0], sx: o.sx || 1, sy: o.sy || 1 });
}
function keyAnim(K, t, A, seed) {
  const ks = K.k, u = (t % K.d) / K.d;
  let i = ks.length - 1; while (i > 0 && ks[i][0] > u) i--;
  const k0 = ks[i], last = i + 1 >= ks.length, k1 = last ? ks[0] : ks[i + 1], t1 = last ? 1 + ks[0][0] : k1[0];
  const w = K.step ? 0 : smooth(clamp((u - k0[0]) / Math.max(1e-6, t1 - k0[0]), 0, 1));
  const P = mixPose(keyPose(k0[1], A), keyPose(k1[1], A), w);
  if (K.jit) { const j = n => (hash((t >> 1) * 3 + n + seed) - 0.5) * K.jit; P.fa = [P.fa[0] + j(1), P.fa[1] + j(2)]; P.ba = [P.ba[0] + j(3), P.ba[1] + j(4)]; P.hd = [P.hd[0] + j(5) * 0.3, P.hd[1]]; }
  return P;
}

const VICTORY_ANIM = {
  velocity:  V(140, [[0, { fa: [1.6, -40], ba: [0.3, -42], ff: [14, 0], bf: [-12, 0] }], [0.1, { fa: [0.3, -42], ba: [1.6, -40], ff: [14, 0], bf: [-12, 0], l: 0.1 }], [0.2, { fa: [1.7, -44], ba: [0.2, -42], l: 0.12 }], [0.35, { fa: [0.3, -98], ba: [-0.6, -30], l: -0.06, h: [2, -3] }], [0.9, { fa: [0.3, -98], ba: [-0.6, -30], l: -0.06, h: [2, -3] }]]),   // shadow-boxing flurry → fist to the sky
  titan:     V(180, [[0, { fa: [0.5, -92], ba: [-0.5, -92], sy: 1.05, h: [0, -3] }], [0.45, { fa: [0.5, -92], ba: [-0.5, -92], sy: 1.05 }], [0.55, { fa: [1.2, -4], ba: [-1.2, -4], sy: 0.84, l: 0.22, h: [3, 6] }], [0.75, { fa: [1.2, -4], ba: [-1.2, -4], sy: 0.84, l: 0.22 }]]),   // arms to the sky, then hammers the earth
  vortex:    V(200, [[0, { fa: [1.5, -46], ba: [-1.5, -46], o: -18, ff: [3, 6], bf: [-3, 8] }], [0.5, { fa: [1.7, -60], ba: [-1.7, -60], o: -24, s: 0.25, ff: [3, 6], bf: [-3, 8] }]]),   // hovers ominously, slowly turning
  aether:    V(160, [[0, { fa: [0.9, -92], ba: [-0.9, -92], h: [0, -5], sy: 1.04 }], [0.5, { fa: [1.2, -80], ba: [-1.2, -80], h: [0, -6], sy: 1.08, o: -6 }]]),   // a radiant V, bathed in light
  phantom:   V(160, [[0, { fa: [0.4, -10], ba: [-0.4, -10], sy: 0.78, o: 8, h: [0, 6] }], [0.3, { fa: [0.15, -36], ba: [0.3, -34], h: [3, -2] }], [0.95, { fa: [0.15, -36], ba: [0.3, -34], h: [3, -2] }]]),   // rises from a crouch, arms folded, smug
  dynamo:    V(180, [[0, { fa: [1.3, -60], ba: [-1.3, -60], sx: 1.08, ff: [14, 0], bf: [-14, 0] }], [0.4, { fa: [1.3, -64], ba: [-1.3, -64], sx: 1.1 }], [0.55, { fa: [0.5, -98], ba: [0.3, -96], h: [0, -4] }], [0.9, { fa: [0.5, -98], ba: [0.3, -96] }]]),   // double-biceps, then the championship belt overhead
  spark:     V(90, [[0, { fa: [1, -50], ba: [-1, -50] }], [0.25, { fa: [0.4, -98], ba: [-0.4, -98], o: -22, ff: [6, -10], bf: [-6, -8] }], [0.5, { fa: [1, -50], ba: [-1, -50] }]]),   // bouncing with electric energy
  frost:     V(200, [[0, { fa: [0.3, -82], ba: [-0.3, -82], h: [0, -3] }], [0.4, { fa: [0.3, -82], ba: [-0.3, -82] }], [0.6, { fa: [1.5, -50], ba: [-1.5, -50] }], [0.9, { fa: [1.5, -50], ba: [-1.5, -50] }]]),   // conjures an ice crystal, then lets it bloom
  mirage:    V(150, [[0, { fa: [0.3, -46], ba: [0.2, -44], l: 0.1 }], [0.5, { fa: [0.25, -50], ba: [0.15, -48], l: 0.1 }], [0.7, { fa: [-1.2, -30], ba: [-1.4, -34], sy: 0.84, o: 6, l: 0.3 }]], { jit: 2 }),   // ninja hand-sign, then a crouched poof-ready stance
  aegis:     V(200, [[0, { fa: [0.3, -100], ba: [0.5, -36], h: [0, -3] }], [0.45, { fa: [0.3, -100], ba: [0.5, -36] }], [0.6, { fa: [1.2, -2], ba: [0.4, -30], o: 10, ff: [14, -2], bf: [-10, -12], l: 0.2 }], [0.95, { fa: [1.2, -2], ba: [0.4, -30], o: 10, ff: [14, -2], bf: [-10, -12], l: 0.2 }]]),   // sword raised, then plants it and kneels
  venom:     V(120, [[0, { fa: [0.5, -110], ba: [-1, -30], sy: 1.04 }], [0.5, { fa: [0.9, -130], ba: [-1.1, -26], sy: 1.08, l: -0.1 }]], { jit: 3 }),   // a long, wiggling stretchy arm in the air
  apex:      V(170, [[0, { fa: [1.6, -2], ba: [1, -2], l: 0.6, sy: 0.86, ff: [-4, 0], bf: [-14, 0], h: [9, 12] }], [0.45, { fa: [1.6, -2], ba: [1, -2], l: 0.6, sy: 0.86, ff: [-4, 0], bf: [-14, 0], h: [9, 12] }], [0.6, { fa: [1.2, -70], ba: [-0.8, -60], l: -0.2, h: [-2, -8] }], [0.9, { fa: [1.2, -70], ba: [-0.8, -60], l: -0.2, h: [-2, -8] }]]),   // prowls on all fours, rears up and roars
  tempest:   V(150, [[0, { fa: [1.4, -50], ba: [-1.4, -50], o: -14, ff: [4, 4], bf: [-4, 6] }], [0.5, { fa: [1.4, -60], ba: [-1.4, -40], o: -20, s: TAU, ff: [4, 4], bf: [-4, 6] }], [0.99, { fa: [1.4, -50], ba: [-1.4, -50], o: -14, s: TAU, ff: [4, 4], bf: [-4, 6] }]]),   // twirls up on the breeze
  terra:     V(100, [[0, { fa: [1, -80], ba: [-0.6, -30] }], [0.25, { fa: [1.3, -2], ba: [-0.6, -30], sy: 0.86, l: 0.25 }], [0.5, { fa: [0.6, -30], ba: [-1, -80] }], [0.75, { fa: [0.6, -30], ba: [-1.3, -2], sy: 0.86, l: 0.25 }]]),   // alternating fist-pounds on the ground
  luna:      V(180, [[0, { fa: [0.6, -60], ba: [0.1, -52] }], [0.3, { fa: [0.6, -92], ba: [0.05, -76], l: -0.12, h: [0, -4] }], [0.8, { fa: [0.6, -92], ba: [-0.8, -70], l: -0.12, h: [0, -4] }]]),   // draws the bow skyward and looses a star
  solaris:   V(220, [[0, { fa: [1.2, -70], ba: [-1.2, -70], o: -10, ff: [4, 4], bf: [-4, 6] }], [0.25, { fa: [0.1, -100], ba: [-0.1, -100], o: -16 }], [0.5, { fa: [-1.2, -70], ba: [1.2, -70], o: -10 }], [0.75, { fa: [0.1, -40], ba: [-0.1, -40], o: -6 }]]),   // traces a star in the air
  void:      V(220, [[0, { fa: [0.25, -50], ba: [0.6, -40], o: 10, ff: [14, -2], bf: [-10, -12], h: [2, 4] }], [0.6, { fa: [0.25, -54], ba: [0.6, -40], o: 10, ff: [14, -2], bf: [-10, -12], h: [2, 2] }]]),   // kneels behind the shield in prayer
  chrono:    V(200, [[0, { fa: [0.8, -40], ba: [0.4, -42], h: [3, 4] }], [0.5, { fa: [0.8, -40], ba: [0.4, -42], h: [3, 4] }], [0.6, { fa: [0.4, -100], ba: [-0.6, -30], h: [0, -3] }], [0.9, { fa: [0.4, -100], ba: [-0.6, -30] }]]),   // checks the pocket watch — right on time
  chimera:   V(120, [[0, { fa: [1.4, -40], ba: [-1.4, -70] }], [0.5, { fa: [1.4, -70], ba: [-1.4, -40] }]]),   // tentacles wave in a slow undulation
  mecha:     V(160, [[0, { fa: [1, -26], ba: [-1, -26] }], [0.25, { fa: [1.4, -60], ba: [-1, -26] }], [0.5, { fa: [1.4, -60], ba: [-1.4, -60] }], [0.75, { fa: [0.4, -96], ba: [-0.4, -96], h: [0, -3] }]], { step: true }),   // robotic, snapping victory sequence
  nyx:       V(200, [[0, { fa: [-1, -30], ba: [-1.2, -40], l: 0.6, h: [4, 6], bf: [-14, 0] }], [0.5, { fa: [-1, -30], ba: [-1.2, -40], l: 0.6, h: [4, 6], bf: [-14, 0] }], [0.65, { fa: [1.2, -60], ba: [-1.4, -64] }], [0.9, { fa: [1.2, -60], ba: [-1.4, -64] }]]),   // a deep curtsy, then the cloak flung wide
  surge:     V(120, [[0, { fa: [1.4, -44], ba: [-1.4, -40], ff: [2, -16], bf: [-2, 0], l: -0.1 }], [0.5, { fa: [1.4, -44], ba: [-1.4, -40], ff: [2, -16], bf: [-2, 0], l: -0.1, s: TAU }], [0.99, { fa: [1.4, -44], ba: [-1.4, -40], ff: [2, -16], bf: [-2, 0], s: TAU }]]),   // a one-foot skate spin
  glitch:    V(60, [[0, { fa: [1.2, -60], ba: [-0.6, -30] }], [0.33, { fa: [-0.4, -40], ba: [1.3, -70], o: -6 }], [0.66, { fa: [0.4, -90], ba: [-1.2, -40], sy: 0.9 }]], { step: true, jit: 10 }),   // a stuttering glitch dance
  echo:      V(140, [[0, { fa: [1.6, -60], ba: [-1.6, -60], o: -14, h: [-2, -8], ff: [3, 6], bf: [-3, 8] }], [0.5, { fa: [1.7, -66], ba: [-1.7, -66], o: -18, h: [-3, -9], ff: [3, 6], bf: [-3, 8] }]], { jit: 2 }),   // floats up, screaming triumphantly
  kitsune:   V(110, [[0, { fa: [0.4, -56], ba: [-0.8, -30], o: 0 }], [0.25, { fa: [0.4, -58], ba: [-0.8, -30], o: -10 }], [0.5, { fa: [0.4, -56], ba: [-0.8, -30], o: 0 }], [0.75, { fa: [0.4, -58], ba: [-0.8, -30], o: -6 }]]),   // a mischievous giggle behind the hand
  ronin:     V(220, [[0, { fa: [0.7, -32], ba: [-0.3, -20], l: 0.1 }], [0.5, { fa: [0.15, -20], ba: [-0.4, -22], l: 0.1 }], [0.8, { fa: [0.15, -20], ba: [-0.4, -22], l: 0.4, h: [3, 2] }]]),   // slowly sheathes the blade, then a short bow
  sylph:     V(120, [[0, { fa: [0.4, -96], ba: [-0.4, -96], ff: [2, -14], bf: [-2, 0] }], [0.6, { fa: [0.4, -96], ba: [-0.4, -96], ff: [2, -14], bf: [-2, 0], s: TAU }], [0.99, { fa: [1.4, -50], ba: [-1.4, -50], ff: [2, -14], bf: [-2, 0], s: TAU }]]),   // a tiptoe pirouette
  dino:      V(240, [[0, { fa: [0.9, -68], ba: [-0.6, -24], l: -0.14, h: [1, -3] }], [0.5, { fa: [0.95, -72], ba: [-0.6, -24], l: -0.16, h: [1, -4] }]], { prop: 'car' }),   // sprays champagne beside the F1 car
  blaze:     V(150, [[0, { fa: [0.5, -92], ba: [-0.5, -90], sy: 1.05 }], [0.5, { fa: [0.6, -96], ba: [-0.6, -94], sy: 1.08, o: -4 }]], { jit: 2 }),   // erupts in flame, arms raised
  pulse:     V(80, [[0, { fa: [0.8, -34], ba: [-0.3, -70], h: [2, 2] }], [0.25, { fa: [0.95, -34], ba: [-0.3, -70], h: [2, 6], o: 2 }], [0.5, { fa: [0.8, -34], ba: [-0.3, -70], h: [2, 2] }], [0.75, { fa: [0.95, -34], ba: [-0.3, -70], h: [2, 6], o: 2 }]], { prop: 'turntable' }),   // drops a beat on the turntable, nodding along
  valkyrie:  V(200, [[0, { fa: [0.3, -100], ba: [-1.2, -46], o: -16, ff: [4, 2], bf: [-4, 6] }], [0.5, { fa: [0.3, -104], ba: [-1.2, -42], o: -22, ff: [4, 2], bf: [-4, 6] }]]),   // ascends on spread wings, spear to the sky
  magma:     V(160, [[0, { fa: [1.1, -4], ba: [-1.1, -4], sy: 0.86, sx: 1.1, l: 0.3 }], [0.45, { fa: [1.1, -4], ba: [-1.1, -4], sy: 0.86, l: 0.3 }], [0.55, { fa: [1.3, -88], ba: [-1.3, -86], sy: 1.06, h: [0, -4] }], [0.95, { fa: [1.3, -88], ba: [-1.3, -86], sy: 1.06 }]]),   // slams the ground, then erupts upward
  sol:       V(240, [[0, { fa: [1, -40], ba: [-1, -40] }], [0.4, { fa: [1.6, -90], ba: [-1.6, -90], sy: 1.05, h: [0, -3] }], [0.95, { fa: [1.6, -90], ba: [-1.6, -90], sy: 1.05 }]], { prop: 'sunaura' }),   // the sun rises behind him: a blinding solar aura
  gale:      V(140, [[0, { fa: [1.6, -60], ba: [-1.6, -30], o: -14, ff: [3, 4], bf: [-3, 8] }], [0.99, { fa: [1.6, -60], ba: [-1.6, -30], o: -24, s: TAU * 2, ff: [3, 4], bf: [-3, 8] }]]),   // a rising whirlwind spin
  drift:     V(150, [[0, { fa: [0.4, -60], ba: [-1.3, -4], ff: [16, 0], bf: [-14, -2], sy: 0.84, l: 0.35, o: 4 }], [0.5, { fa: [0.5, -64], ba: [-1.3, -2], ff: [16, 0], bf: [-14, -2], sy: 0.84, l: 0.4, o: 4 }]]),   // a low skating crouch, hand trailing the floor
  zenith:    V(200, [[0, { fa: [0.3, -38], ba: [-0.1, -38], ff: [14, -14], bf: [-14, -14], o: -20, sy: 0.92 }], [0.5, { fa: [0.3, -38], ba: [-0.1, -38], ff: [14, -14], bf: [-14, -14], o: -26, sy: 0.92 }]]),   // floats serenely in the lotus seat
  serpent:   V(150, [[0, { fa: [1, -20], ba: [0.4, -16], sy: 0.8, l: 0.3, o: 4, h: [6, 6] }], [0.5, { fa: [1, -20], ba: [0.4, -16], sy: 0.8, l: 0.3, o: 4, h: [6, 6] }], [0.6, { fa: [2, -40], ba: [1.6, -36], l: 0.5, h: [12, 2] }], [0.9, { fa: [2, -40], ba: [1.6, -36], l: 0.5, h: [12, 2] }]]),   // coils... then lashes into a strike pose
  blitz:     V(120, [[0, { fa: [-1, -10], ba: [1, -10], ff: [12, 0], bf: [-18, -4], sy: 0.8, l: 0.5 }], [0.4, { fa: [-1, -10], ba: [1, -10], ff: [12, 0], bf: [-18, -4], sy: 0.8, l: 0.5 }], [0.5, { fa: [1.6, -50], ba: [-0.6, -30], l: 0.05 }], [0.95, { fa: [1.6, -50], ba: [-0.6, -30] }]]),   // crouched in the starting blocks, then points ahead: "too slow"
  umbra:     V(200, [[0, { fa: [0.2, -36], ba: [0.3, -34], o: 18, sy: 0.9 }], [0.5, { fa: [0.2, -36], ba: [0.3, -34], o: 8 }]]),   // half-risen from the shadow, arms folded
  fang:      V(160, [[0, { fa: [0.6, -50], ba: [-0.4, -36], ff: [14, 0], bf: [-12, 0] }], [0.25, { fa: [0.6, -70], ba: [-0.4, -36], l: -0.35, h: [-2, -8] }], [0.8, { fa: [0.6, -70], ba: [-0.4, -36], l: -0.35, h: [-2, -8] }]], { jit: 1.5 }),   // rears back and howls at the moon
  prism:     V(220, [[0, { fa: [0.2, -96], ba: [-0.6, -40] }], [0.5, { fa: [-0.2, -96], ba: [0.6, -40], s: 0.2 }]]),   // holds a crystal aloft, light refracting
  smith:     V(60, [[0, { fa: [0.2, -92], ba: [0.4, -40], l: -0.1 }], [0.45, { fa: [0.2, -92], ba: [0.4, -40], l: -0.1 }], [0.6, { fa: [1.4, -10], ba: [0.4, -18], l: 0.25, sy: 0.9 }]]),   // hammers the anvil, again and again
  mimic:     V(100, [[0, { fa: [1.4, -70], ba: [-1.4, -30], o: -12 }], [0.5, { fa: [1.4, -30], ba: [-1.4, -70], o: -12 }]]),   // a mirror-image wave, side to side
  stormmage: V(180, [[0, { fa: [1.2, -50], ba: [-1.2, -50] }], [0.4, { fa: [0.8, -100], ba: [-0.8, -100], sy: 1.06, h: [0, -5] }], [0.9, { fa: [0.8, -100], ba: [-0.8, -100], sy: 1.06 }]], { jit: 1 }),   // calls the storm down, arms raised
  strider:   V(180, [[0, { fa: [0.4, -70], ba: [-0.6, -24], h: [2, 0] }], [0.4, { fa: [0.4, -70], ba: [-0.6, -24], h: [2, 2] }], [0.55, { fa: [1.6, -70], ba: [-0.8, -30], l: -0.1 }], [0.9, { fa: [1.6, -70], ba: [-0.8, -30] }]]),   // tips the hat, then flicks the grapple skyward
  specter:   V(220, [[0, { fa: [1.1, -4], ba: [0.3, -30], o: 10, ff: [14, -2], bf: [-10, -12], h: [3, 5] }], [0.5, { fa: [1.1, -4], ba: [0.3, -30], o: 6, ff: [14, -2], bf: [-10, -12], h: [3, 5] }]]),   // kneels at its planted spectral blade
  inferno:   V(120, [[0, { fa: [1.2, -30], ba: [-1.2, -30], l: 0.25, sy: 0.92, h: [6, 2] }], [0.5, { fa: [1.3, -36], ba: [-1.3, -36], l: 0.3, sy: 0.9, h: [7, 3] }]], { jit: 4 }),   // a shaking berserker roar
  byte:      V(70, [[0, { fa: [1.6, -40], ba: [-1.6, -40], o: -8 }], [0.5, { fa: [0.2, -80], ba: [1.2, -50], o: -12, sy: 0.92 }]], { step: true, jit: 8 }),   // flickers between two corrupted poses
  titanus:   V(200, [[0, { fa: [1.2, -30], ba: [-1.2, -30] }], [0.3, { fa: [1.4, -62], ba: [-1.4, -62], sx: 1.08 }], [0.8, { fa: [1.4, -62], ba: [-1.4, -62], sx: 1.08 }]], { step: true }),   // a colossal, ratcheting mech flex
  apexx:     V(120, [[0, { fa: [1.7, -40], ba: [-1.7, -40] }], [0.33, { fa: [0.4, -96], ba: [-1.2, -30] }], [0.66, { fa: [0.5, -46], ba: [0.5, -30] }]], { step: true }),   // snaps between precise robotic poses
  strix:     V(200, [[0, { fa: [-0.6, -30], ba: [-0.9, -32], h: [0, 0] }], [0.4, { fa: [-0.6, -30], ba: [-0.9, -32], h: [-8, 0] }], [0.7, { fa: [-0.6, -30], ba: [-0.9, -32], h: [8, -1] }]]),   // wings wrapped, head swivelling owl-like
  kuro:      V(110, [[0, { fa: [0.2, -62], ba: [0.35, -50], h: [3, -2] }], [0.5, { fa: [0.25, -66], ba: [0.4, -52], h: [4, -4], o: -2 }]], { jit: 3 }),   // club on shoulder, a booming oni laugh
  bismuth:   V(180, [[0, { fa: [1.5, -30], ba: [-1.5, -30], sx: 1 }], [0.5, { fa: [1.6, -40], ba: [-1.6, -40], sx: 1.1, sy: 1.04 }]]),   // crystals grow: arms out, body swelling
  aura:      V(200, [[0, { fa: [0.25, -44], ba: [0.1, -44], o: -12, ff: [4, 4], bf: [-4, 6] }], [0.5, { fa: [0.25, -48], ba: [0.1, -48], o: -18, ff: [4, 4], bf: [-4, 6] }]]),   // prays as ancestral spirits gather
  nox:       V(200, [[0, { fa: [1.4, -60], ba: [-0.4, -30] }], [0.4, { fa: [1.4, -14], ba: [-0.6, -30], l: 0.55, h: [4, 4] }], [0.8, { fa: [1.4, -14], ba: [-0.6, -30], l: 0.55 }]]),   // sweeps the hat off in a deep bow
  helix:     V(120, [[0, { fa: [0.4, -120], ba: [-0.4, -60], sy: 1.12 }], [0.5, { fa: [-0.4, -60], ba: [0.4, -120], sy: 0.9, sx: 1.1 }]]),   // limbs stretching and squashing like taffy
  zealot:    V(70, [[0, { fa: [1.6, -40], ba: [-0.4, -60] }], [0.25, { fa: [0.2, -90], ba: [-1.6, -40] }], [0.5, { fa: [-1.6, -40], ba: [0.4, -60] }], [0.75, { fa: [-0.2, -10], ba: [1.6, -40] }]]),   // a whirling nunchuck kata
  pyre:      V(150, [[0, { fa: [1, -20], ba: [0.4, -18], sy: 0.86, l: 0.25, h: [6, 4] }], [0.5, { fa: [1.2, -30], ba: [0.6, -24], sy: 0.9, l: 0.4, h: [12, 0] }]]),   // coils and breathes a plume of fire
  vesper:    V(80, [[0, { fa: [0.6, -84], ba: [-0.6, -84], o: -12, ff: [4, -2], bf: [-4, 0] }], [0.5, { fa: [0.6, -88], ba: [-0.6, -88], o: -16, ff: [4, -2], bf: [-4, 0] }]], { jit: 1.5 }),   // a buzzing hover, arms in a V
  rogue:     V(180, [[0, { fa: [0.5, -96], ba: [-0.5, -24], ff: [14, -14], bf: [-12, 0], l: -0.08 }], [0.5, { fa: [0.6, -100], ba: [-0.5, -24], ff: [14, -14], bf: [-12, 0], l: -0.1 }]]),   // boot up on a crate, cutlass raised: "Yo-ho!"
  titanis:   V(260, [[0, { fa: [1, -24], ba: [-1, -24] }], [0.6, { fa: [1, -24], ba: [-1, -24], h: [0, 4] }], [0.7, { fa: [1, -24], ba: [-1, -24], h: [0, 0] }]]),   // stands like a monolith... one slow nod
  paradox:   V(160, [[0, { fa: [1.4, -60], ba: [-0.6, -30] }], [0.5, { fa: [0.2, -96], ba: [-1.2, -50], s: 0.5 }], [0.99, { fa: [1.4, -60], ba: [-0.6, -30] }]]),   // a pose that rewinds itself, over and over
  zen:       V(220, [[0, { fa: [0.6, -34], ba: [0.4, -32], h: [0, 2] }], [0.6, { fa: [1.4, -40], ba: [0.3, -34], h: [0, 2] }], [0.95, { fa: [1.4, -40], ba: [0.3, -34] }]]),   // eyes closed, the katana drawn slowly to the guard
  fable:     V(200, [[0, { fa: [0.6, -40], ba: [0.2, -40], h: [2, 3] }], [0.6, { fa: [0.6, -42], ba: [0.2, -42], h: [2, 3] }], [0.7, { fa: [0.5, -96], ba: [-0.6, -60], o: -6 }], [0.9, { fa: [0.5, -96], ba: [-0.6, -60], o: -6 }]]),   // reads the last page, then cheers "The end!"
  goliath:   V(200, [[0, { fa: [0.4, -98], ba: [-0.4, -98], sy: 0.94 }], [0.5, { fa: [0.4, -100], ba: [-0.4, -100], sy: 0.96 }], [0.6, { fa: [1.3, -60], ba: [-1.3, -60], sx: 1.08 }], [0.9, { fa: [1.3, -60], ba: [-1.3, -60] }]]),   // hoists a boulder overhead, then flexes
  orin:      V(200, [[0, { fa: [0.3, -100], ba: [-0.6, -36], h: [0, -3] }], [0.5, { fa: [0.35, -104], ba: [-0.8, -40], h: [0, -4] }]], { prop: 'sunaura' }),   // the sun-spear raised to the heavens
  nyx2:      V(120, [[0, { fa: [0.3, -40], ba: [-0.2, -40] }], [0.5, { fa: [0.4, -44], ba: [-0.3, -44], s: 0.15 }]], { jit: 2 }),   // twirling the void daggers, arms crossed
  kryp:      V(60, [[0, { fa: [1.2, -60], ba: [-0.4, -20], h: [4, 0] }], [0.5, { fa: [-0.4, -20], ba: [1.2, -60], h: [-4, 0] }]], { jit: 6 }),   // a rattling skeleton dance
  atlas:     V(220, [[0, { fa: [0.2, -36], ba: [0.3, -34], o: -20, s: Math.PI }], [0.5, { fa: [0.2, -36], ba: [0.3, -34], o: -26, s: Math.PI }]]),   // floats upside-down, arms folded, unbothered
  siren:     V(180, [[0, { fa: [0.3, -40], ba: [-1.6, -60], h: [-2, -4] }], [0.5, { fa: [0.3, -40], ba: [-1.7, -70], h: [-3, -6] }]]),   // hand on heart, holding the high note
  talon:     V(160, [[0, { fa: [1.4, -60], ba: [-1.4, -60], sy: 0.84, o: 6, l: 0.2 }], [0.5, { fa: [1.6, -70], ba: [-1.6, -70], sy: 0.84, o: 4, l: 0.2 }]]),   // perched in a crouch, wings spread
  brimstone: V(100, [[0, { fa: [0.3, -40], ba: [0.2, -40], sx: 1.06 }], [0.15, { fa: [0.1, -36], ba: [0.4, -40], sx: 1.08 }], [0.3, { fa: [0.3, -40], ba: [0.1, -36] }], [0.5, { fa: [0.5, -96], ba: [-0.6, -30], h: [0, -3] }], [0.9, { fa: [0.5, -96], ba: [-0.6, -30] }]]),   // beats his chest, then a fist to the sky
  gridrunner:V(120, [[0, { fa: [1.8, -40], ba: [-1.8, -40] }], [0.5, { fa: [-0.6, -60], ba: [-1.6, -56], l: 0.1, h: [6, 4] }]], { step: true }),   // T-pose glitch → a dab
  vanguard:  V(180, [[0, { fa: [0.4, -30], ba: [1.2, -40] }], [0.3, { fa: [0.4, -30], ba: [1.6, -40], l: 0.15 }], [0.5, { fa: [0.3, -100], ba: [1.2, -40] }], [0.9, { fa: [0.3, -100], ba: [1.2, -40] }]]),   // shield bash, then the spear raised in salute
  omega:     V(220, [[0, { fa: [0.5, -96], ba: [-0.5, -96], o: -14, ff: [4, 4], bf: [-4, 6] }], [0.5, { fa: [0.2, -104], ba: [-0.2, -104], o: -22, ff: [4, 4], bf: [-4, 6] }]], { prop: 'sunaura' }),   // rises with both blades crossed overhead
  axiom:     V(200, [[0, { fa: [1.2, -60], ba: [-1.2, -60], o: -16, ff: [7, -12], bf: [-7, -11] }], [0.25, { fa: [0.4, -96], ba: [-0.4, -30], o: -20, s: 0.2, ff: [7, -12], bf: [-7, -11] }],
                     [0.5, { fa: [-0.6, -60], ba: [1.4, -70], o: -22, s: 0.4, ff: [7, -12], bf: [-7, -11] }], [0.75, { fa: [1.6, -40], ba: [-1.6, -40], o: -18, s: 0.6, h: [0, -3], ff: [7, -12], bf: [-7, -11] }]]),   // hands trace a golden spiral as it turns in the air
  riptide:   V(160, [[0, { fa: [1.6, -40], ba: [-1.6, -46], ff: [16, 0], bf: [-14, 0], l: 0.2, sy: 0.9 }], [0.3, { fa: [1.5, -44], ba: [-1.7, -40], ff: [16, 0], bf: [-14, 0], l: -0.1, sy: 0.92 }],
                     [0.55, { fa: [0.3, -100], ba: [-0.6, -30], h: [2, -3] }], [0.9, { fa: [0.3, -100], ba: [-0.6, -30], h: [2, -3] }]]),   // rides the last wave in, then a fist to the sky
  monolith:  V(220, [[0, { fa: [0.6, -20], ba: [-0.6, -20], sy: 0.96 }], [0.4, { fa: [1.2, -96], ba: [-1.2, -96], sy: 1.06, h: [0, -4] }], [0.7, { fa: [1.2, -96], ba: [-1.2, -96], sy: 1.06 }],
                     [0.85, { fa: [1.3, -2], ba: [-1.3, -2], sy: 0.86, l: 0.2 }]]),   // raises both slabs like a monument, then hammers the ground
  origami:   V(170, [[0, { fa: [1.6, -64], ba: [-1.6, -64] }], [0.3, { fa: [1.6, -68], ba: [-1.6, -68], s: 0.5, o: -6 }], [0.55, { fa: [0.4, -36], ba: [0.2, -34], l: 0.6, h: [3, 3] }],
                     [0.9, { fa: [0.4, -36], ba: [0.2, -34], l: 0.6, h: [3, 3] }]]),   // unfolds like a paper crane, then a deep bow
  comet:     V(150, [[0, { fa: [1.8, -60], ba: [-1.2, -28], ff: [16, 0], bf: [-16, -4], l: 0.3 }], [0.35, { fa: [0.4, -104], ba: [-0.8, -30], o: -10, h: [2, -4] }],
                     [0.9, { fa: [0.4, -104], ba: [-0.8, -30], o: -10, h: [2, -4] }]]),   // the shooting-star pose: one fist to the heavens
  djinn:     V(200, [[0, { fa: [0.6, -60], ba: [-0.6, -60], o: -16, ff: [4, -16], bf: [-4, -14] }], [0.3, { fa: [0.3, -96], ba: [-0.3, -96], o: -24, h: [0, -4], ff: [4, -16], bf: [-4, -14] }],
                     [0.6, { fa: [1.4, -44], ba: [-1.4, -44], o: -20, s: 0.3, ff: [4, -16], bf: [-4, -14] }]], { prop: 'lamp' }),   // "your wish is granted": a rising flourish of both hands
  scarab:    V(200, [[0, { fa: [0.4, -96], ba: [0.6, -40], h: [0, -3] }], [0.4, { fa: [0.4, -100], ba: [0.6, -40], sy: 1.04 }], [0.6, { fa: [1.2, -60], ba: [-1.2, -60], sx: 1.08 }],
                     [0.95, { fa: [1.2, -60], ba: [-1.2, -60], sx: 1.08 }]], { prop: 'sunaura' }),   // lifts the sun disc high, then flares the shell
  lumen:     V(160, [[0, { fa: [1.2, -20], ba: [-1.2, -20], o: -14, sy: 1.06, sx: 0.95 }], [0.5, { fa: [1.4, -50], ba: [-1.4, -50], o: -26, sy: 0.92, sx: 1.06 }]]),   // pulsing upward like a jellyfish
  totem:     V(180, [[0, { fa: [0.6, -30], ba: [-0.6, -30] }], [0.3, { fa: [1.2, -90], ba: [-1.2, -90], sy: 1.06, h: [0, -3] }], [0.5, { fa: [1.2, -90], ba: [-1.2, -90], sy: 1.06, l: 0.12 }],
                     [0.7, { fa: [1.2, -90], ba: [-1.2, -90], sy: 1.06, l: -0.12 }]], { step: true }),   // arms raised like a carved idol, rocking on its base
  hive:      V(120, [[0, { fa: [1.5, -60], ba: [-1.5, -60], o: -18, ff: [6, -10], bf: [-6, -8] }], [0.5, { fa: [0.4, -96], ba: [-0.4, -96], o: -26, ff: [6, -10], bf: [-6, -8] }]], { jit: 1.5 }),   // a triumphant hovering buzz
  pug:       V(160, [[0, { fa: [1.3, -82], ba: [-1.1, -70], ff: [6, -30], bf: [-8, 0], l: -0.05 }], [0.25, { fa: [1.3, -82], ba: [-1.1, -70], ff: [6, -32], bf: [-8, 0], l: -0.05 }],
                     [0.35, { fa: [1.9, -40], ba: [0.2, -44], ff: [16, 0], bf: [-16, 0], l: 0.3, sy: 0.9 }], [0.55, { fa: [-0.3, -62], ba: [-1, -50], ff: [24, -56], bf: [-6, 0], l: -0.22 }],
                     [0.75, { fa: [0.35, -36], ba: [0.3, -34], ff: [8, 0], bf: [-8, 0], l: 0.55, h: [3, 3] }], [0.95, { fa: [0.35, -36], ba: [0.3, -34], ff: [8, 0], bf: [-8, 0], l: 0.55, h: [3, 3] }]]),   // a kung-fu kata: crane stance, punch, high kick, a deep bow
  panda:     V(170, [[0, { fa: [0.5, -30], ba: [0.3, -28], ff: [14, 0], bf: [-14, 0], sx: 1.08 }], [0.12, { fa: [0.5, -40], ba: [0.3, -24], ff: [14, 0], bf: [-14, 0], sx: 1.12, sy: 0.93 }],
                     [0.24, { fa: [0.5, -26], ba: [0.3, -38], ff: [14, 0], bf: [-14, 0], sx: 1.08 }], [0.36, { fa: [0.5, -40], ba: [0.3, -24], ff: [14, 0], bf: [-14, 0], sx: 1.12, sy: 0.93 }],
                     [0.55, { fa: [1.4, -92], ba: [-1.4, -92], ff: [16, 0], bf: [-16, 0], sy: 1.05, h: [0, -3] }], [0.9, { fa: [1.4, -92], ba: [-1.4, -92], ff: [16, 0], bf: [-16, 0], sy: 1.05, h: [0, -3] }]])   // a belly drum solo, then paws to the sky
};

const DEFEAT_ANIM = {
  velocity:  V(90, [[0, { fa: [0.4, -20], ba: [-1, -26], ff: [26, -4], bf: [18, -2], l: -1.45, o: 18 }], [0.5, { fa: [0.4, -18], ba: [-1, -26], ff: [26, -10], bf: [18, -2], l: -1.45, o: 18 }]]),   // flat on the back, a leg twitching
  titan:     V(200, [[0, { fa: [1.2, -4], ba: [-0.4, -26], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.35, h: [4, 6] }], [0.5, { fa: [1.2, -4], ba: [-0.4, -24], ff: [14, -2], bf: [-10, -12], o: 12, l: 0.4, h: [4, 7] }]]),   // one knee down, crumbling
  vortex:    V(240, [[0, { fa: [0.6, -10], ba: [-0.6, -10], o: 6, s: -0.3 }], [0.5, { fa: [0.6, -10], ba: [-0.6, -10], o: 10, s: 0.3 }]]),   // drifts down, slowly see-sawing
  aether:    V(180, [[0, { fa: [0.4, -6], ba: [-0.4, -6], ff: [12, -6], bf: [-12, -6], o: 16, sy: 0.9, h: [0, 6] }], [0.5, { fa: [0.4, -4], ba: [-0.4, -4], ff: [12, -6], bf: [-12, -6], o: 16, sy: 0.9, h: [0, 7] }]]),   // sits cross-legged, dimmed, sulking
  phantom:   V(120, [[0, { fa: [1.6, -6], ba: [-1.4, -6], ff: [16, -4], bf: [-16, -4], l: 1.5, o: 22 }], [0.5, { fa: [1.6, -6], ba: [-1.4, -8], ff: [16, -4], bf: [-16, -4], l: 1.5, o: 22 }]]),   // face-down, arms splayed
  dynamo:    V(160, [[0, { fa: [0.1, -70], ba: [-0.8, -10], ff: [24, -4], bf: [18, -4], o: 18, sy: 0.92, h: [2, 2] }], [0.5, { fa: [0.15, -74], ba: [-0.8, -10], ff: [24, -4], bf: [18, -4], o: 18, sy: 0.92, h: [3, 2] }]]),   // sits legs-out, scratching his head
  spark:     V(40, [[0, { fa: [0.8, -40], ba: [-0.8, -44], sy: 0.96 }], [0.5, { fa: [1, -50], ba: [-1, -36], sy: 0.98 }]], { jit: 10 }),   // twitching, still electrocuted
  frost:     V(30, [[0, { fa: [0.2, -36], ba: [-0.1, -34], sy: 0.92, h: [0, 3] }]], { jit: 3 }),   // hugs itself, shivering
  mirage:    V(200, [[0, { fa: [0.8, -6], ba: [0.2, -20], ff: [12, -2], bf: [-10, -12], o: 10, l: 0.45, h: [5, 8] }]]),   // kneels, head bowed in shame
  aegis:     V(180, [[0, { fa: [1, -40], ba: [0.8, -38], l: 0.3, sy: 0.92, h: [4, 4] }], [0.5, { fa: [1, -40], ba: [0.8, -38], l: 0.36, sy: 0.9, h: [5, 6] }]], { smoke: true }),   // leans exhausted on the sword, armor smoking
  venom:     V(200, [[0, { fa: [1.2, -2], ba: [-1.2, -2], ff: [14, 0], bf: [-14, 0], sy: 0.5, sx: 1.5, o: 4 }], [0.5, { fa: [1.3, -2], ba: [-1.3, -2], ff: [16, 0], bf: [-16, 0], sy: 0.46, sx: 1.56, o: 4 }]]),   // melted into a puddle
  apex:      V(160, [[0, { fa: [0.3, -10], ba: [0.1, -10], ff: [6, -12], bf: [-4, -10], l: 0.8, sy: 0.8, o: 10, h: [6, 10] }]], { jit: 1.5 }),   // curled up, whimpering
  tempest:   V(240, [[0, { fa: [1.2, -20], ba: [-1.2, -20], ff: [20, -2], bf: [16, -2], l: -1.4, o: 18 }], [0.5, { fa: [1.2, -20], ba: [-1.2, -20], ff: [20, -2], bf: [16, -2], l: -1.3, o: 18 }]]),   // blown flat, the breeze rocking her
  terra:     V(120, [[0, { fa: [1, -4], ba: [-1, -4], ff: [22, -4], bf: [16, -4], o: 18, sy: 0.9, h: [-4, 4] }], [0.5, { fa: [1, -4], ba: [-1, -4], ff: [22, -4], bf: [16, -4], o: 18, sy: 0.9, h: [4, 4] }]]),   // sat down hard, head swaying
  luna:      V(180, [[0, { fa: [0.3, -58], ba: [-0.8, -14], h: [2, 4], l: 0.1 }]]),   // facepalm over the broken bow
  solaris:   V(200, [[0, { fa: [0.3, -30], ba: [0.1, -30], ff: [10, -14], bf: [-6, -12], o: 16, l: 0.3, h: [2, 8] }]]),   // a fallen star: sitting, head on knees
  void:      V(200, [[0, { fa: [0.2, -44], ba: [0.1, -44], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.2, h: [2, 6] }]], { smoke: true }),   // kneeling, hands clasped
  chrono:    V(300, [[0, { fa: [1.2, -40], ba: [-0.8, -30], ff: [14, -6], bf: [-10, 0], l: 0.1 }]], { step: true }),   // frozen mid-step: the clock has stopped
  chimera:   V(160, [[0, { fa: [-0.6, -30], ba: [0.8, -34], ff: [8, 0], bf: [-8, 0], sy: 0.9 }], [0.5, { fa: [-0.8, -26], ba: [1, -30], ff: [8, 0], bf: [-8, 0], sy: 0.9 }]], { jit: 2 }),   // tentacles in a tangled knot
  mecha:     V(160, [[0, { fa: [0.7, -6], ba: [-0.7, -6], o: 8, sy: 0.88, h: [4, 10] }]], { jit: 1.5, smoke: true }),   // powered down, sparking, smoke rising
  nyx:       V(180, [[0, { fa: [0.2, -64], ba: [-0.6, -30], l: 0.15, h: [2, 4] }]]),   // hides behind the cloak
  surge:     V(140, [[0, { fa: [-0.8, -10], ba: [-1.2, -10], ff: [18, -20], bf: [12, -14], o: 18, l: -0.6 }], [0.5, { fa: [-0.8, -10], ba: [-1.2, -10], ff: [18, -26], bf: [12, -18], o: 18, l: -0.6 }]]),   // fell on his backside, skates in the air
  glitch:    V(50, [[0, { fa: [1.8, -40], ba: [-1.8, -40] }], [0.5, { fa: [1.8, -42], ba: [-1.8, -38], o: 2 }]], { step: true, jit: 14 }),   // frozen in an error stutter
  echo:      V(60, [[0, { fa: [0.25, -54], ba: [0.15, -54], o: 6, sy: 0.92, h: [0, 4] }], [0.5, { fa: [0.25, -50], ba: [0.15, -50], o: 7, sy: 0.9, h: [0, 5] }]], { jit: 1.5 }),   // sobbing into her hands
  kitsune:   V(200, [[0, { fa: [0.2, -32], ba: [-0.1, -30], l: -0.08, h: [-3, 2] }]]),   // pouting, arms crossed, looking away
  ronin:     V(240, [[0, { fa: [0.5, -8], ba: [0.3, -8], ff: [6, -4], bf: [-6, -4], o: 16, l: 0.4, h: [4, 8] }]]),   // seiza, head bowed with honour
  sylph:     V(100, [[0, { fa: [1, -20], ba: [-1, -20], ff: [20, -4], bf: [16, -4], o: 18, h: [-5, 4] }], [0.5, { fa: [1, -20], ba: [-1, -20], ff: [20, -4], bf: [16, -4], o: 18, h: [5, 4] }]]),   // sitting, head spinning dizzily
  dino:      V(180, [[0, { fa: [0.2, -72], ba: [-0.8, -10], ff: [24, -4], bf: [18, -4], o: 18, h: [2, 2] }], [0.5, { fa: [0.25, -76], ba: [-0.8, -10], ff: [24, -4], bf: [18, -4], o: 18, h: [3, 2] }]], { smoke: true }),   // sat in a cloud of tyre smoke, scratching the helmet
  blaze:     V(180, [[0, { fa: [0.4, -6], ba: [-0.4, -6], o: 8, sy: 0.86, l: 0.3, h: [3, 8] }]], { smoke: true }),   // fizzled out, smouldering
  pulse:     V(180, [[0, { fa: [0.3, -58], ba: [-0.6, -16], h: [2, 4] }]]),   // headphones down, facepalm
  valkyrie:  V(200, [[0, { fa: [1, -6], ba: [-0.4, -24], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.3, h: [4, 6] }]]),   // kneeling, wings drooped
  magma:     V(200, [[0, { fa: [0.9, -18], ba: [-0.9, -18], sy: 0.94, l: 0.1 }]], { step: true, smoke: true }),   // cooling to stone, steam hissing
  sol:       V(200, [[0, { fa: [1, -6], ba: [-0.4, -26], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.3, h: [3, 6] }]], { smoke: true }),   // eclipsed: kneeling, dimmed
  gale:      V(200, [[0, { fa: [0.4, -4], ba: [-0.4, -4], ff: [3, 4], bf: [-3, 6], o: 12, sy: 0.8, sx: 1.1 }], [0.5, { fa: [0.4, -4], ba: [-0.4, -4], ff: [3, 4], bf: [-3, 6], o: 14, sy: 0.78, sx: 1.12 }]]),   // deflated, drifting down
  drift:     V(160, [[0, { fa: [1.2, -10], ba: [-1.4, -8], ff: [20, -8], bf: [14, -6], l: 1.4, o: 20 }]], { jit: 1 }),   // wiped out, sprawled sideways
  zenith:    V(240, [[0, { fa: [0.3, -30], ba: [-0.1, -30], ff: [14, -10], bf: [-14, -10], o: 16, sy: 0.9, h: [0, 6] }]]),   // sulking meditation, eyes shut tight
  serpent:   V(200, [[0, { fa: [0.8, -6], ba: [0.3, -6], ff: [8, 0], bf: [-8, 0], sy: 0.7, sx: 1.2, o: 8, h: [6, 10] }]]),   // coiled up in defeat
  blitz:     V(60, [[0, { fa: [0.6, -14], ba: [0.2, -16], ff: [12, 0], bf: [-12, 0], l: 0.55, sy: 0.9, h: [5, 6] }], [0.5, { fa: [0.6, -14], ba: [0.2, -16], ff: [12, 0], bf: [-12, 0], l: 0.6, sy: 0.88, h: [5, 7] }]]),   // hands on knees, gasping for breath
  umbra:     V(200, [[0, { fa: [0.5, -6], ba: [-0.5, -6], o: 26, sy: 0.7, sx: 1.2 }], [0.5, { fa: [0.5, -6], ba: [-0.5, -6], o: 30, sy: 0.66, sx: 1.24 }]]),   // melting into its own shadow
  fang:      V(160, [[0, { fa: [0.6, -6], ba: [0.2, -6], ff: [-4, 0], bf: [-14, -2], l: 0.3, o: 8, sy: 0.88, h: [6, 8] }], [0.5, { fa: [0.6, -6], ba: [0.2, -6], ff: [-4, 0], bf: [-14, -2], l: 0.3, o: 8, sy: 0.88, h: [6, 10] }]]),   // sad-puppy sit
  prism:     V(140, [[0, { fa: [0.3, -70], ba: [-0.3, -70], h: [0, 3] }]], { jit: 2 }),   // hands on head, cracking
  smith:     V(200, [[0, { fa: [1.4, -2], ba: [-1, -6], ff: [24, -4], bf: [18, -4], o: 18, sy: 0.92, h: [3, 4] }]], { smoke: true }),   // sat down, the hammer dropped
  mimic:     V(30, [[0, { fa: [1, -30], ba: [-1, -30], o: 4 }]], { jit: 12 }),   // pure static
  stormmage: V(200, [[0, { fa: [0.5, -8], ba: [-0.5, -8], o: 8, sy: 0.9, l: 0.25, h: [2, 7] }]]),   // slumped under a rain-cloud
  strider:   V(200, [[0, { fa: [0.2, -64], ba: [-1, -20], ff: [26, -4], bf: [18, -2], l: -1.45, o: 18 }]]),   // lying back, hat over the face
  specter:   V(200, [[0, { fa: [1.1, -4], ba: [0.3, -20], o: 14, ff: [14, -2], bf: [-10, -12], h: [3, 8] }], [0.5, { fa: [1.1, -4], ba: [0.3, -20], o: 16, ff: [14, -2], bf: [-10, -12], h: [3, 9] }]]),   // fading at its sword
  inferno:   V(40, [[0, { fa: [1.3, -60], ba: [-1.3, -60], ff: [14, -10], bf: [-12, 0] }], [0.5, { fa: [1.3, -20], ba: [-1.3, -20], ff: [14, 0], bf: [-12, -10] }]], { jit: 4 }),   // a stomping tantrum
  byte:      V(300, [[0, { fa: [1.8, -40], ba: [-1.8, -40] }]], { step: true }),   // blue-screened: frozen in a T-pose
  titanus:   V(200, [[0, { fa: [0.8, -4], ba: [-0.8, -4], o: 10, sy: 0.88, l: 0.15, h: [3, 10] }]], { smoke: true }),   // shut down, smoke pouring from the stacks
  apexx:     V(140, [[0, { fa: [0.5, -2], ba: [-0.5, -2], l: 0.4, sy: 0.92, h: [5, 10] }], [0.7, { fa: [0.5, -2], ba: [-0.5, -2], l: 0.4, sy: 0.92, h: [5, 10] }], [0.8, { fa: [0.6, -6], ba: [-0.6, -6], l: 0.3, sy: 0.94, h: [3, 6] }]], { step: true, smoke: true }),   // rebooting, arms dangling
  strix:     V(80, [[0, { fa: [-0.6, -20], ba: [-0.8, -22], h: [-8, 2] }], [0.5, { fa: [-0.6, -20], ba: [-0.8, -22], h: [8, 2] }]]),   // head spinning round and round
  kuro:      V(200, [[0, { fa: [0.15, -34], ba: [0.3, -32], l: -0.08, h: [-3, 3] }]]),   // mask askew, sulking
  bismuth:   V(200, [[0, { fa: [1.2, -4], ba: [-0.4, -26], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.35 }]], { jit: 1 }),   // shattered, on one knee
  aura:      V(200, [[0, { fa: [0.4, -10], ba: [-0.4, -10], o: 12, sy: 0.9, h: [0, 6] }], [0.5, { fa: [0.4, -12], ba: [-0.4, -12], o: 4, sy: 0.9, h: [0, 5] }]]),   // the spirits leave her bobbing, drained
  nox:       V(60, [[0, { fa: [0.4, -50], ba: [0.2, -18], l: 0.5, h: [5, 6] }], [0.5, { fa: [0.4, -46], ba: [0.2, -16], l: 0.6, h: [6, 8] }]]),   // doubled over, coughing in the mist
  helix:     V(160, [[0, { fa: [-1.2, -40], ba: [1.2, -30], ff: [-6, -4], bf: [6, -4], sy: 0.9 }]], { jit: 3 }),   // limbs tied in a knot
  zealot:    V(100, [[0, { fa: [0.3, -70], ba: [-0.6, -20], h: [-4, 2] }], [0.5, { fa: [0.3, -70], ba: [-0.6, -20], h: [4, 2] }]]),   // bonked by his own nunchuck
  pyre:      V(200, [[0, { fa: [0.6, -8], ba: [0.2, -8], sy: 0.8, l: 0.3, o: 8, h: [8, 8] }]], { smoke: true }),   // a smoking, coughing heap
  vesper:    V(40, [[0, { fa: [1.2, -8], ba: [-1.2, -8], ff: [10, -24], bf: [-6, -22], o: 18, s: Math.PI }], [0.5, { fa: [1.2, -8], ba: [-1.2, -8], ff: [10, -30], bf: [-6, -18], o: 18, s: Math.PI }]]),   // crashed upside-down, legs twitching
  rogue:     V(200, [[0, { fa: [1, -40], ba: [-1, -40], h: [0, 2] }], [0.5, { fa: [1.1, -48], ba: [-1.1, -48], h: [0, 0] }]]),   // a shrug over the broken cutlass
  titanis:   V(300, [[0, { fa: [1, -24], ba: [-1, -24], l: 1.45, o: 24 }]], { step: true }),   // toppled over, stiff as a statue
  paradox:   V(30, [[0, { fa: [1.4, -80], ba: [-1.4, -40] }], [0.5, { fa: [0.2, -40], ba: [-0.2, -80] }]], { jit: 6 }),   // frantically trying to rewind
  zen:       V(240, [[0, { fa: [0.4, -20], ba: [0.2, -22], l: 0.5, h: [4, 4] }]]),   // sheathes the blade and bows to the victor
  fable:     V(200, [[0, { fa: [0.3, -70], ba: [-0.3, -70], o: 6, sy: 0.92, h: [0, 4] }]]),   // the book held over the head in despair
  goliath:   V(160, [[0, { fa: [0.5, -60], ba: [-0.5, -60], ff: [24, -4], bf: [18, -4], o: 20, sy: 0.88 }], [0.5, { fa: [0.5, -58], ba: [-0.5, -58], ff: [24, -4], bf: [18, -4], o: 20, sy: 0.86 }]]),   // pinned under his own boulder
  orin:      V(80, [[0, { fa: [0.3, -52], ba: [0.1, -52], h: [-2, 3] }], [0.5, { fa: [0.35, -56], ba: [0.15, -50], h: [2, 3] }]]),   // rubbing his blinded eyes
  nyx2:      V(200, [[0, { fa: [1, -30], ba: [-1, -30], o: 24, sy: 0.8 }], [0.5, { fa: [1.1, -40], ba: [-1.1, -40], o: 20, sy: 0.82 }]]),   // half-swallowed by a rift
  kryp:      V(200, [[0, { fa: [1, -2], ba: [-1, -2], ff: [14, 0], bf: [-14, 0], sy: 0.6, sx: 1.2, o: 10, l: 0.2 }]], { jit: 2 }),   // a collapsed pile of bones
  atlas:     V(240, [[0, { fa: [1.2, -60], ba: [-1.2, -60], o: -10, s: Math.PI, ff: [8, 4], bf: [-8, 4] }], [0.5, { fa: [1.2, -64], ba: [-1.2, -56], o: -14, s: Math.PI + 0.2, ff: [8, 4], bf: [-8, 4] }]]),   // stuck floating upside-down, flailing
  siren:     V(200, [[0, { fa: [0.15, -44], ba: [0.05, -42], h: [0, 3], sy: 0.94 }]]),   // clutching her throat: no voice left
  talon:     V(200, [[0, { fa: [0.8, -8], ba: [-0.8, -8], l: 0.3, o: 6, sy: 0.86, h: [4, 8] }]]),   // feathers ruffled, slumped
  brimstone: V(200, [[0, { fa: [1, -4], ba: [-1, -4], ff: [24, -4], bf: [18, -4], o: 18, sy: 0.9, h: [2, 6] }]], { smoke: true }),   // a smouldering sit
  gridrunner:V(40, [[0, { fa: [1, -26], ba: [-1, -26] }], [0.5, { fa: [1, -26], ba: [-1, -26], o: 3 }]], { step: true, jit: 10 }),   // wireframe flickering, frozen
  vanguard:  V(200, [[0, { fa: [0.4, -20], ba: [1.2, -34], sy: 0.8, o: 8, l: 0.2, h: [3, 6] }]]),   // hiding behind the shield
  omega:     V(220, [[0, { fa: [1.2, -2], ba: [-0.6, -30], ff: [14, -2], bf: [-10, -12], o: 10, l: 0.4, h: [4, 7] }], [0.5, { fa: [1.2, -2], ba: [-0.6, -30], ff: [14, -2], bf: [-10, -12], o: 12, l: 0.45, h: [4, 8] }]], { smoke: true }),   // the final entity kneels, blades guttering
  axiom:     V(200, [[0, { fa: [0.6, -10], ba: [-0.6, -10], sy: 0.84, o: 6, h: [2, 6] }], [0.5, { fa: [0.7, -12], ba: [-0.5, -8], sy: 0.82, o: 8, h: [3, 7], l: 0.15 }]]),   // grounded, the halo flickering
  riptide:   V(180, [[0, { fa: [1, -6], ba: [-1, -6], sy: 0.8, o: 8, l: 0.3, h: [4, 6] }], [0.5, { fa: [1.1, -4], ba: [-0.9, -8], sy: 0.78, o: 9, l: 0.34 }]]),                  // washed up, gasping
  djinn:     V(200, [[0, { fa: [0.4, -20], ba: [-0.4, -20], sy: 0.7, sx: 1.1, o: 10, h: [3, 8] }], [0.5, { fa: [0.4, -18], ba: [-0.4, -18], sy: 0.66, sx: 1.12, o: 12, h: [3, 9] }]], { smoke: true }),   // fizzling back into the lamp
  scarab:    V(200, [[0, { fa: [0.8, -6], ba: [-0.8, -6], sy: 0.78, sx: 1.12, o: 8, l: 0.3, h: [4, 8] }], [0.5, { fa: [0.9, -4], ba: [-0.8, -8], sy: 0.76, o: 9, l: 0.34 }]]),   // cracked shell, slumped
  lumen:     V(180, [[0, { fa: [0.3, -4], ba: [-0.3, -4], sy: 0.72, sx: 1.2, o: 12, h: [0, 10] }], [0.5, { fa: [0.4, -2], ba: [-0.4, -2], sy: 0.7, sx: 1.22, o: 13, h: [1, 11] }]]),   // a deflated, beached jelly
  totem:     V(240, [[0, { fa: [1.1, -6], ba: [-0.7, -3], sy: 0.8, l: 0.42, o: 9, h: [5, 7] }], [0.5, { fa: [1.2, -4], ba: [-0.6, -2], sy: 0.79, l: 0.46, o: 10, h: [6, 8] }]], { smoke: true }),   // a toppled totem leaning on its carved arm, dust rising
  hive:      V(160, [[0, { fa: [1, -8], ba: [-1, -8], sy: 0.8, o: 8, h: [3, 6] }], [0.5, { fa: [1.1, -6], ba: [-0.9, -10], sy: 0.78, o: 9, l: 0.12 }]]),   // wings drooping
  pug:       V(170, [[0, { fa: [0.4, -10], ba: [-0.3, -8], ff: [10, -2], bf: [-10, -2], o: 14, sy: 0.84, l: 0.2, h: [4, 8] }], [0.5, { fa: [0.45, -12], ba: [-0.3, -9], ff: [10, -2], bf: [-10, -2], o: 15, sy: 0.82, l: 0.22, h: [5, 10] }]]),   // sits down with sad puppy eyes
  panda:     V(180, [[0, { fa: [1, -10], ba: [-1, -12], ff: [16, -14], bf: [-12, -14], o: 24, s: -1.3, sy: 0.9 }], [0.5, { fa: [1.1, -14], ba: [-1.05, -12], ff: [17, -16], bf: [-12, -12], o: 25, s: -1.32, sy: 0.9 }]]),   // flopped onto its back, paws in the air
  monolith:  V(220, [[0, { fa: [0.9, -4], ba: [-0.9, -4], sy: 0.86, l: 0.25, o: 6 }], [0.5, { fa: [0.9, -2], ba: [-0.9, -4], sy: 0.84, l: 0.3, o: 8 }]], { smoke: true }),   // a toppled monument, crumbling dust
  origami:   V(180, [[0, { fa: [0.3, -14], ba: [-0.3, -14], sy: 0.7, sx: 1.15, o: 12, h: [2, 10] }], [0.5, { fa: [0.2, -12], ba: [-0.4, -12], sy: 0.68, sx: 1.18, o: 13, h: [3, 11] }]]),   // crumpled like scrap paper
  comet:     V(160, [[0, { fa: [1, -8], ba: [-1, -8], sy: 0.82, o: 6, h: [3, 6] }], [0.5, { fa: [1.1, -6], ba: [-0.9, -10], sy: 0.8, o: 8, l: 0.12 }]], { smoke: true })   // burnt out, smoking
};

// Every bespoke motion pose name (for the rig's reference list in poses.js and the smoke test)
const MOTION_POSES = [].concat(...Object.keys(MOTION).map(id => ['run:' + id, 'walk:' + id, 'air:' + id, 'air:double:' + id, 'jump:squat:' + id, 'victory:' + id, 'defeat:' + id, 'idle:' + id]
  .concat(PUNCH_POSES.map(p => p + ':' + id))))
  .concat(CHARS.filter(c => c.special && c.special.roll).map(c => 'roll:' + c.id));      // (PANDAMONIUM's rolling-ball special)
RIG_POSES.push(...MOTION_POSES);
