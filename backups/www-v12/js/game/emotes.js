/* NEON BRAWL — Taunts (emotes) and holographic emojis: the gameplay side.
 *
 * G (or the touch EMOTE button) plays the fighter's own emote — a stylised 3D animation (render/emotes3d.js: a dance,
 * a weapon spin, a backflip, a flex, a formal bow, a levitation, a moonwalk or a roar, each shaped by the fighter's own
 * motion profile). It can only start on the ground out of the neutral state; the fighter is rooted and fully
 * vulnerable while it plays, so a taunt is a real risk. 1-8 (or the touch emoji wheel) pop a glowing holographic 3D
 * emoji over the fighter's head: pure presentation, rate-limited, and carried in the input packets so both players
 * see it online. The CPU taunts now and then after taking a stock.                                               */
'use strict';

const EMOTE_DUR = { dance: 96, weaponSpin: 80, backflip: 58, flex: 84, bow: 72, levitate: 96, moonwalk: 96, roar: 74 };
const EMOTE_NAMES = { dance: 'Victory Dance', weaponSpin: 'Weapon Spin', backflip: 'Backflip', flex: 'Power Flex', bow: 'Formal Bow', levitate: 'Levitation', moonwalk: 'Moonwalk', roar: 'Battle Roar' };
const EMOTE_OVERRIDE = { dino: 'moonwalk', pulse: 'dance', siren: 'dance', mimic: 'dance', riptide: 'dance', origami: 'bow', comet: 'backflip', axiom: 'levitate', monolith: 'flex',
  ronin: 'bow', zen: 'bow', mirage: 'bow', umbra: 'bow', drift: 'moonwalk', blitz: 'moonwalk', rogue: 'moonwalk', glitch: 'moonwalk', gridrunner: 'moonwalk', blaze: 'flex', terra: 'roar' };
function emoteOf(ch) {
  if (EMOTE_OVERRIDE[ch.id]) return EMOTE_OVERRIDE[ch.id];
  if (ch.sword || ch.spear || ch.hammer || ch.club || ch.nunchucks || ch.dualBlade || ch.id === 'luna') return 'weaponSpin';
  switch (ch.arch) {
    case 'acrobat': case 'ninja': case 'skater': return 'backflip';
    case 'heavy': return 'flex';
    case 'brute': case 'beast': case 'mutant': return 'roar';
    case 'float': case 'mage': return 'levitate';
    case 'knight': return 'bow';
    case 'racer': return 'moonwalk';
  }
  return 'dance';
}

// The holographic emojis: 4 to start with, 4 more from the Battle Pass (ui/battlepass.js)
const EMOJIS = [
  { id: 'laugh', glyph: '😂', name: 'Laughing' }, { id: 'fire', glyph: '🔥', name: 'On Fire' }, { id: 'skull', glyph: '💀', name: 'Skull' }, { id: 'sweat', glyph: '💦', name: 'Sweat Drops' },
  { id: 'heart', glyph: '❤️', name: 'Heart', tier: 4 }, { id: 'stareyes', glyph: '🤩', name: 'Star Eyes', tier: 16 }, { id: 'crown', glyph: '👑', name: 'Crown', tier: 28 }, { id: 'trophy', glyph: '🏆', name: 'GG Trophy', tier: 44 }
];
const emojiUnlocked = i => !!EMOJIS[i] && (!EMOJIS[i].tier || (typeof passOwns === 'function' && passOwns('emoji:' + EMOJIS[i].id)));
const EMOJI_FX = [];                                           // live emojis (presentation only): { f, i, born }
const EMOJI_LIFE = 120, EMOJI_CD = 36;

// which emoji key (1-8) was pressed this step: 0 = none, else index + 1 (locked emojis are ignored for the local player)
function emojiPressed() {
  for (let i = 0; i < EMOJIS.length; i++) if (pressed.has('Digit' + (i + 1)) || pressed.has('Numpad' + (i + 1))) return emojiUnlocked(i) ? i + 1 : 0;
  return 0;
}
function spawnEmoji(f, i) {
  for (let k = EMOJI_FX.length - 1; k >= 0; k--) if (EMOJI_FX[k].f === f) EMOJI_FX.splice(k, 1);   // one at a time per fighter
  EMOJI_FX.push({ f, i, born: G.time });
  gameEvent('emoji', { f, i });
}
function updateEmojis() { for (let k = EMOJI_FX.length - 1; k >= 0; k--) { const e = EMOJI_FX[k]; if (G.time - e.born > EMOJI_LIFE || G.time < e.born || !fighters.includes(e.f)) EMOJI_FX.splice(k, 1); } }

// called from updateFighter each step: emoji pops (any state) and the emote start (grounded, neutral)
function emoteInput(f, inp) {
  if (f.emojiCD > 0) f.emojiCD--;
  if (f.emoteCD > 0) f.emoteCD--;
  if (inp.emoji > 0 && f.emojiCD <= 0 && f.state !== 'dead') { spawnEmoji(f, inp.emoji - 1); f.emojiCD = EMOJI_CD; }
}
function tryEmote(f, inp) {
  if (!inp.emoteP || f.emoteCD > 0 || !f.onGround || f.helpless) return false;
  const k = emoteOf(f.ch);
  f.state = 'emote'; f.stateT = 0; f.emoteK = k; f.emoteDur = EMOTE_DUR[k]; f.vx *= 0.3; f.runMode = false;
  gameEvent('emote', { f, kind: k });
  return true;
}
// the CPU: an occasional taunt (and an emoji) right after taking one of your stocks, when it's safely far away
function aiEmote(f, o, inp) {
  if (!f.koT || G.frame - f.koT > 150 || f.state !== 'free' || !f.onGround) return false;
  if (Math.abs(o.x - f.x) < 320 || o.state !== 'respawn' && o.state !== 'dead') return false;
  if (Math.random() < 0.006) { inp.emoteP = true; f.koT = 0; if (Math.random() < 0.6) inp.emoji = Math.random() < 0.5 ? 1 : 2; return true; }
  return false;
}
