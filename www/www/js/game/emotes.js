/* NEON BRAWL — Taunts (emotes) and holographic emojis: the gameplay side.
 *
 * G (or the touch EMOTE button) plays the fighter's own emote — a stylised 3D animation (render/emotes3d.js: a dance,
 * a weapon spin, a backflip, a flex, a formal bow, a levitation, a moonwalk or a roar, each shaped by the fighter's own
 * motion profile). It can only start on the ground out of the neutral state; the fighter is rooted and fully
 * vulnerable while it plays, so a taunt is a real risk. 1-8 (or the touch emoji wheel) pop a glowing holographic 3D
 * emoji over the fighter's head: pure presentation, rate-limited, and carried in the input packets so both players
 * see it online. The CPU taunts now and then after taking a stock.
 *
 * v13: two taunt slots (G · H, the touch Emote button + the emoji wheel, View · R3 on a pad) play the emotes you map to
 * them in Settings → Profile; 'signature' is the fighter's own. The 8 classic emotes are free; 10 more (a robot
 * dance, a breakdance windmill, air guitar, a floating lotus, juggling, shadow-boxing, a power nap, a hype jump, a
 * friendly wave and a magic trick) and 12 more holographic emojis are bought with Coins in the Item Shop. Keys 1-8
 * pop the emojis mapped to those slots; the packet carries the emoji's own id, so both players see the same one.
 * v14: the Griddy — heel taps, swinging arms and "goggle" hands, procedurally animated (render/emotes3d.js).        */
'use strict';

const EMOTE_DUR = { dance: 96, weaponSpin: 80, backflip: 58, flex: 84, bow: 72, levitate: 96, moonwalk: 96, roar: 74,
  robot: 96, breakdance: 90, guitar: 96, meditate: 110, juggle: 100, shadowbox: 84, nap: 110, hype: 80, wave: 70, magic: 100, griddy: 128 };
const EMOTE_NAMES = { dance: 'Victory Dance', weaponSpin: 'Weapon Spin', backflip: 'Backflip', flex: 'Power Flex', bow: 'Formal Bow', levitate: 'Levitation', moonwalk: 'Moonwalk', roar: 'Battle Roar',
  robot: 'Robot Dance', breakdance: 'Windmill', guitar: 'Air Guitar', meditate: 'Zen Lotus', juggle: 'Juggler', shadowbox: 'Shadowbox', nap: 'Power Nap', hype: 'Hype Jump', wave: 'Friendly Wave', magic: 'Magic Trick', griddy: 'The Griddy' };
const EMOTE_ICON = { signature: '★', dance: '🕺', weaponSpin: '⚔', backflip: '🤸', flex: '💪', bow: '🙇', levitate: '🧘', moonwalk: '🎩', roar: '🦁',
  robot: '🤖', breakdance: '🌀', guitar: '🎸', meditate: '🪷', juggle: '🤹', shadowbox: '🥊', nap: '💤', hype: '🎉', wave: '👋', magic: '🎩', griddy: '👓' };
const FREE_EMOTES = ['dance', 'weaponSpin', 'backflip', 'flex', 'bow', 'levitate', 'moonwalk', 'roar'];
const SHOP_EMOTES = ['robot', 'breakdance', 'guitar', 'meditate', 'juggle', 'shadowbox', 'nap', 'hype', 'wave', 'magic', 'griddy'];
const EMOTE_OVERRIDE = { dino: 'moonwalk', pulse: 'dance', siren: 'dance', mimic: 'dance', riptide: 'dance', origami: 'bow', comet: 'backflip', axiom: 'levitate', monolith: 'flex',
  ronin: 'bow', zen: 'bow', mirage: 'bow', umbra: 'bow', drift: 'moonwalk', blitz: 'moonwalk', rogue: 'moonwalk', glitch: 'moonwalk', gridrunner: 'moonwalk', blaze: 'flex', terra: 'roar',
  djinn: 'levitate', scarab: 'bow', lumen: 'levitate', totem: 'roar', hive: 'dance', pug: 'bow', panda: 'dance', axo: 'dance' };
const emoteOwned = k => k === 'signature' || FREE_EMOTES.includes(k) || (SHOP_EMOTES.includes(k) && typeof shopOwns === 'function' && shopOwns('emote:' + k));
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

// The holographic emojis: 4 to start with, 4 more from the Battle Pass (ui/battlepass.js), 12 more in the Item Shop (shop: true)
const EMOJIS = [
  { id: 'laugh', glyph: '😂', name: 'Laughing' }, { id: 'fire', glyph: '🔥', name: 'On Fire' }, { id: 'skull', glyph: '💀', name: 'Skull' }, { id: 'sweat', glyph: '💦', name: 'Sweat Drops' },
  { id: 'heart', glyph: '❤️', name: 'Heart', tier: 4 }, { id: 'stareyes', glyph: '🤩', name: 'Star Eyes', tier: 16 }, { id: 'crown', glyph: '👑', name: 'Crown', tier: 28 }, { id: 'trophy', glyph: '🏆', name: 'GG Trophy', tier: 44 },
  { id: 'thumbsup', glyph: '👍', name: 'Thumbs Up', shop: true }, { id: 'rocket', glyph: '🚀', name: 'Rocket', shop: true }, { id: 'bolt', glyph: '⚡', name: 'Lightning', shop: true },
  { id: 'ghost', glyph: '👻', name: 'Ghost', shop: true }, { id: 'hundred', glyph: '💯', name: 'One Hundred', shop: true }, { id: 'controller', glyph: '🎮', name: 'Game On', shop: true },
  { id: 'rage', glyph: '😡', name: 'Rage', shop: true }, { id: 'cry', glyph: '😭', name: 'Tears', shop: true }, { id: 'cool', glyph: '😎', name: 'Cool Shades', shop: true },
  { id: 'popcorn', glyph: '🍿', name: 'Popcorn', shop: true }, { id: 'clown', glyph: '🤡', name: 'Clown', shop: true }, { id: 'diamond', glyph: '💎', name: 'Diamond', shop: true },
  // v16: 12 more holographic emojis on the 250-tier Battle Pass (their tiers are set by ui/battlepass.js)
  { id: 'star', glyph: '⭐', name: 'Superstar', pass: true }, { id: 'moon', glyph: '🌙', name: 'Moonlight', pass: true }, { id: 'sun', glyph: '☀️', name: 'Sunburst', pass: true },
  { id: 'snow', glyph: '❄️', name: 'Snowflake', pass: true }, { id: 'note', glyph: '🎵', name: 'Encore', pass: true }, { id: 'swords', glyph: '⚔️', name: 'Crossed Blades', pass: true },
  { id: 'shield', glyph: '🛡️', name: 'Iron Guard', pass: true }, { id: 'flag', glyph: '🚩', name: 'Victory Flag', pass: true }, { id: 'zzz', glyph: '💤', name: 'Too Easy', pass: true },
  { id: 'question', glyph: '❓', name: 'Huh?', pass: true }, { id: 'bang', glyph: '❗', name: 'Alert', pass: true }, { id: 'target', glyph: '🎯', name: 'Bullseye', pass: true },
  // v20: 40 holographic emojis on the 10,000-coin Pro Pass (ui/propass20.js sets their tiers · 3D models in render/rewards20.js)
  ...[['wink', '😉', 'Wink'], ['party', '🥳', 'Party Time'], ['mindblown', '🤯', 'Mind Blown'], ['nerd', '🤓', 'Big Brain Play'], ['sleepy', '😴', 'Snooze'], ['alien', '👽', 'Visitor'],
    ['robo', '🤖', 'Beep Boop'], ['moai', '🗿', 'Moai'], ['eyes', '👀', 'Watching You'], ['cat', '🐱', 'Kitty'], ['dog', '🐶', 'Good Boy'], ['panda', '🐼', 'Panda Pal'],
    ['ufo', '🛸', 'Abducted'], ['rainbow', '🌈', 'Rainbow'], ['comet', '☄️', 'Comet'], ['orb', '🔮', 'Crystal Ball'], ['medal', '🥇', 'Gold Medal'], ['dice', '🎲', 'Lucky Roll'],
    ['eightball', '🎱', 'Magic 8-Ball'], ['pizza', '🍕', 'Pizza Party'], ['cake', '🎂', 'Victory Cake'], ['gift', '🎁', 'Gift'], ['balloon', '🎈', 'Balloon'], ['tornado', '🌪️', 'Twister'],
    ['wave', '🌊', 'Tidal Wave'], ['snowman', '⛄', 'Snowman'], ['mushroom', '🍄', 'Power-Up'], ['clover', '🍀', 'Lucky Clover'], ['rose', '🌹', 'A Rose for You'], ['butterfly', '🦋', 'Butterfly'],
    ['bomb', '💣', 'Bomb'], ['anchor', '⚓', 'Anchored'], ['key', '🔑', 'Golden Key'], ['hourglass', '⏳', 'Time\'s Up'], ['infinity', '♾️', 'Infinite'], ['atom', '⚛️', 'Atomic'],
    ['magnet', '🧲', 'Magnetic'], ['galaxy', '🌌', 'Galaxy'], ['unicorn', '🦄', 'Unicorn'], ['volcano', '🌋', 'Eruption']].map(([id, glyph, name]) => ({ id, glyph, name, pro: true }))
];
const emojiIndex = id => EMOJIS.findIndex(e => e.id === id);
const emojiUnlocked = i => !!EMOJIS[i] && (EMOJIS[i].pro ? (typeof proOwns === 'function' && proOwns('emoji:' + EMOJIS[i].id))   // (v20 Pro Pass)
  : EMOJIS[i].shop ? (typeof shopOwns === 'function' && shopOwns('emoji:' + EMOJIS[i].id))
  : !(EMOJIS[i].tier || EMOJIS[i].pass) || (typeof passOwns === 'function' && passOwns('emoji:' + EMOJIS[i].id)));
const DEFAULT_EMOJI_KEYS = ['laugh', 'fire', 'skull', 'sweat', 'heart', 'stareyes', 'crown', 'trophy'];
const emojiKeys = () => (typeof PROFILE !== 'undefined' && PROFILE.loadout && PROFILE.loadout.emojis) || DEFAULT_EMOJI_KEYS;   // keys 1-8 → emoji ids (Settings → Profile)
const tauntSlots = () => (typeof PROFILE !== 'undefined' && PROFILE.loadout && PROFILE.loadout.taunts) || ['signature', 'bow'];
const EMOJI_FX = [];                                           // live emojis (presentation only): { f, i, born }
const EMOJI_LIFE = 120, EMOJI_CD = 36;

// which emoji key (1-8) was pressed this step: 0 = none, else the emoji's index + 1 (locked emojis are ignored for the local player)
function emojiPressed() {
  const keys = emojiKeys();
  for (let s = 0; s < 8; s++) if (pressed.has('Digit' + (s + 1)) || pressed.has('Numpad' + (s + 1))) { const i = emojiIndex(keys[s]); return i >= 0 && emojiUnlocked(i) ? i + 1 : 0; }
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
// the emote in taunt slot 0 / 1 for a fighter: its own loadout (set by the match: the local player's, or the online rival's from
// the match config), 'signature' = the fighter's own emote; CPUs always use their signature
function emoteForSlot(f, slot) { const k = f.emotes && f.emotes[slot]; return !k || k === 'signature' || !EMOTE_DUR[k] ? (slot && !f.emotes ? 'bow' : emoteOf(f.ch)) : k; }
function tryEmote(f, inp) {
  if (!(inp.emoteP || inp.emote2P) || f.emoteCD > 0 || !f.onGround || f.helpless) return false;
  const k = emoteForSlot(f, inp.emoteP ? 0 : 1);
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
