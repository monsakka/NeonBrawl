/* NEON BRAWL — Fighter creation / reset and the two active fighters. */
'use strict';

/* ============================ FIGHTERS ============================== */
const BUF_KEYS = ['jumpP', 'lightP', 'heavyP', 'specialP'];

function newFighter(id, keyMap) { const f = { id, keys: keyMap, cpu: false, ai: null, buf: {}, ch: CHARS[0], name: '', color: '#fff', fill: '#fff' }; setChar(f, CHARS[0], false); resetFighter(f, 640); return f; }

function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function setChar(f, ch, skin) { applySkin(f, ch, skin || 0); }                // colours come from the costume skin (data/skins.js)

function resetFighter(f, x) {
  Object.assign(f, {
    x, y: STAGE.y, vx: 0, vy: 0, facing: x < 640 ? 1 : -1, state: 'free', stateT: 0,
    percent: 0, stocks: 3, shield: 100, shieldCD: 0,
    onGround: true, ground: 'stage', jumps: f.ch.airJumps, helpless: false, specialUsed: false,
    invuln: 0, hitFlash: 0, hitstun: 0, dropT: 0, ledgeCD: 0, ledge: null, ledgeT: 0,
    move: null, sp: null, hitDone: false, combo: 0, projCD: 0, dropHeld: 0,
    dashT: 0, runMode: false, lastTapDir: 0, lastTapFrame: -99,
    lagT: 0, landT: 0, stunT: 0, deadT: 0, respT: 0, percentPop: 0, shieldHit: 0, parryFlash: 0,
    rot: 0, bonk: false, lastHitBy: null, sx: 1, sy: 1, hurt: 0, runPhase: 0, techT: 0, techCD: 0, prevShield: false,
    grabbing: null, grabber: null, holdT: 0, holdMax: 0, escape: 0, chill: 0,
    poison: 0, poisonT: 0, spCD: 0, decoy: null, wall: null, wallSide: 0, wallCD: 0, lastDir: 0,
    fuel: 100, hoverT: f.ch.hover || 0, jetT: 0, hoverOn: 0, frozenT: 0, frozenV: null, buffT: 0, airDashN: 0, prism: null, cloud: null, heatN: 0, padHold: false, adaptShown: null, portalCD: 0, gfield: null, rootT: 0, blindT: 0, inkTrap: false, antiGravT: 0, hist: [], gust: null, crawl: false,
    kin: 0, glitchT: 0, glitchCD: 0, confuse: 0, sonic: null, cmbN: 0,
    chargeT: 0, charging: false, chargeDone: true, flipT: 0, turnT: 0, wallKickT: 0, missT: 0, idleT: 0, reelT: 0, techPoseT: 0, rollTech: false, climbRoll: false,   // smash charge + animation timers
    scale: f.bossScale || f.ch.scale || 1, svx: 0, svy: 0, bumpCD: 0, hand: false, bs: null, bullets: null, hpMax: 0, pancakeT: 0, ult: 0, ultHeld: 0, ultPh: null, ultT: 0, ultN: 0, ultVic: -1,                                        // heavy-landing pancake · the Ultimate (game/ultimate.js)
    ultBeam: null, ultQuake: null, ultStorm: null, ultV: null, ultSum: null, ultCar: false,
    emoteK: null, emoteDur: 0, emoteCD: 0, emojiCD: 0, koT: 0,                   // taunts + emojis (game/emotes.js) · koT = the frame this fighter last took a stock
    px: x, py: STAGE.y,                                                          // previous-step position (render interpolation)
    st: { dmg: 0, best: 0, hits: 0, kos: 0 }                                     // match stats for the victory screen
  });
  for (const k of BUF_KEYS) f.buf[k] = 0;
  f.buf.ultP = 0; f.ultDenyT = 0;
  f.ai = null;
}

const fighters = [ newFighter(0, true), newFighter(1, false) ];
fighters[0].name = 'P1'; fighters[1].name = 'CPU'; fighters[1].cpu = true;
const otherOf = f => fighters[1 - f.id];
