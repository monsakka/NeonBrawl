/* NEON BRAWL — Costume skins. Every fighter has 3, each with its own shader material in the 3D renderer:
 *   0 Base          the original colours — cel-shaded cartoon render with rim lighting
 *   1 Gold Crusader a highly reflective metallic-gold body (+ sparkle glints) wearing a procedural geometric 3D helmet
 *                   (5 designs, tuned per fighter — render/fighter3d.js helmet3D)
 *   2 Void Reaver   a pitch-black obsidian body with glowing red eyes and dark smoke, in spiked armour, with its weapon
 *                   swapped for a crueller one (jagged void blade, trident, spiked mace, cleaver, kusarigama, crescent bow, claws)
 *   3 Prism Shard   (Battle Pass tier 10) a crystal body: faceted crystal growths on the shoulders, spine and crown + a shard ring
 *   4 Mech Frame    (tier 22) chrome armour: a chest plate with a glowing core, pauldrons, piston gauntlets and greaves, a jetpack
 *   5 Celestial     (tier 35) a night-sky body: a starry halo, two orbit rings, a glowing constellation across the chest
 *   6 Neon Legend   (tier 50) a hologram: a crown of light, wings of light and rising aura flames
 *   7 … 51          the 45 Item Shop skins (v13, bought with Coins in ui/shop.js): nine themed collections of five, each skin a
 *                   body material + colour scheme + a set of real 3D parts (helmets, hats, crowns, horns, ears, masks, wings,
 *                   tails, back weapons, packs, capes, shoulder / chest / limb armour, orbiting objects, auras) — built in
 *                   render/skins3d.js, so every one of them is a different 3D model on every fighter, not a colour swap
 * A skin decides colours (f.color / f.fill), the material (f.skinFx) and extra geometry (f.skin); everything that glows — HUD, hit sparks,
 * specials — follows f.color. Skins 3-6 are unlocked through the Battle Pass (ui/battlepass.js), 7-51 in the Item Shop. */
'use strict';

/* ---- the Item Shop skins: [id, name, collection, rarity (2 rare · 3 epic · 4 legendary), body material, body colour, glow colour, parts]
 *      colours: '#rrggbb' · 'self' (the fighter's own) · 'mix:#rrggbb:k' (the fighter's own colour mixed toward #rrggbb by k)
 *      parts: [part, options] — the 3D part library is render/skins3d.js (SKIN_PARTS) ---- */
const SKIN_SETS = ['Samurai Dynasty', 'Cyber Grid', 'Mythic Olympus', 'Elemental Forge', 'Cosmic Voyager', 'Beast Kingdom', 'Royal Court', 'Mech Works', 'Spectral Night'];
const HEAD_PARTS = new Set(['helm', 'hat', 'crown', 'horns', 'ears', 'snakes', 'headRing']);
const SK = (id, name, set, r, mat, alb, glow, parts, o) => Object.assign({ id, name, set: SKIN_SETS[set], r, mat, alb, glow, parts, head: parts.some(p => HEAD_PARTS.has(p[0])) }, o || {});
const SHOP_SKINS = [
  // ---- Samurai Dynasty ----
  SK('shogun', 'Shogun', 0, 3, 'metal', '#a3161c', '#ffcf3a', [['helm', { k: 'kabuto', col: '#1a1014', crest: '#ffcf3a' }], ['shoulders', { k: 'sode', col: '#a3161c', trim: '#ffcf3a' }], ['backWeapon', { k: 'katana2', col: '#e8e8f0', hilt: '#1a1014' }], ['mask', { k: 'mempo', col: '#1a1014' }]]),
  SK('ashigaru', 'Ashigaru', 0, 2, 'cloth', '#3a3f5a', '#e8d8a8', [['hat', { k: 'jingasa', col: '#2a1e14', trim: '#e8d8a8' }], ['chest', { k: 'plate', col: '#4a2a20' }], ['backWeapon', { k: 'yari', col: '#6a5636', tip: '#e8e8f0' }]]),
  SK('oni', 'Oni Warlord', 0, 3, 'gloss', '#c81e3a', '#ff5a2a', [['mask', { k: 'oni', col: '#c81e3a', fang: '#f4ead8' }], ['horns', { k: 'oni', col: '#f4ead8' }], ['shoulders', { k: 'spiked', col: '#1a1014' }], ['backWeapon', { k: 'kanabo', col: '#2a2228' }]]),
  SK('kitsune', 'Kitsune Spirit', 0, 2, 'silk', '#f4f0ea', '#ff5a7a', [['mask', { k: 'fox', col: '#ffffff', mark: '#ff2f57' }], ['ears', { k: 'fox', col: '#f4f0ea', inner: '#ff5a7a' }], ['tail', { k: 'fox9', col: '#f4f0ea', tip: '#ff5a7a' }], ['chest', { k: 'bell', col: '#ffcf3a' }]]),
  SK('sakura', 'Sakura Eternal', 0, 4, 'silk', '#ffb3d1', '#ff6aa8', [['crown', { k: 'flower', col: '#ffb3d1', core: '#ffe08a' }], ['halo', { k: 'branch', col: '#5a3a2a', bloom: '#ffc6e0' }], ['aura', { k: 'petals', col: '#ffc6e0' }], ['chest', { k: 'sash', col: '#ff6aa8' }]]),
  // ---- Cyber Grid ----
  SK('netrunner', 'Netrunner', 1, 2, 'gloss', '#1a1e2e', '#2ef0ff', [['visor', { k: 'band', col: '#0a0c16', glow: '#2ef0ff' }], ['pack', { k: 'cables', col: '#2a2e40', glow: '#2ef0ff' }], ['limbs', { k: 'glowlines', col: '#2ef0ff' }]]),
  SK('mechronin', 'Mech Ronin', 1, 3, 'chrome', '#c4cad8', '#ff2f8a', [['helm', { k: 'cyber', col: '#20232e', glow: '#ff2f8a' }], ['backWeapon', { k: 'saber', col: '#ff2f8a' }], ['shoulders', { k: 'grid', col: '#20232e', glow: '#ff2f8a' }]]),
  SK('hologram', 'Hologram', 1, 3, 'holo', 'self', '#7af0ff', [['ring', { k: 'scan', col: '#7af0ff' }], ['orbit', { k: 'cubes', col: '#7af0ff', n: 5 }], ['visor', { k: 'shades', col: '#0a1018', glow: '#7af0ff' }]]),
  SK('synthwave', 'Synthwave Star', 1, 2, 'gloss', '#2a1450', '#ff4fd8', [['visor', { k: 'shades', col: '#0c0d16', glow: '#ff4fd8' }], ['hat', { k: 'phones', col: '#20222c', glow: '#2ef0ff' }], ['shoulders', { k: 'grid', col: '#2a1450', glow: '#ff4fd8' }]]),
  SK('quantum', 'Quantum Core', 1, 4, 'digital', '#0e1a2a', '#3dffb8', [['crown', { k: 'cube', col: '#3dffb8' }], ['chest', { k: 'core', col: '#3dffb8' }], ['orbit', { k: 'shards', col: '#3dffb8', n: 4 }], ['limbs', { k: 'glowlines', col: '#3dffb8' }]]),
  // ---- Mythic Olympus ----
  SK('spartan', 'Spartan', 2, 2, 'metal', '#b8862a', '#ff3a2a', [['helm', { k: 'galea', col: '#c89a3a', crest: '#c81e2a' }], ['backWeapon', { k: 'aspis', col: '#c89a3a', emblem: '#c81e2a' }], ['limbs', { k: 'greaves', col: '#c89a3a' }]]),
  SK('zeus', 'Thunder God', 2, 4, 'gloss', '#f4f0e6', '#ffe629', [['crown', { k: 'laurel', col: '#ffcf3a' }], ['halo', { k: 'storm', col: '#5a6080', bolt: '#ffe629' }], ['orbit', { k: 'bolts', col: '#ffe629', n: 3 }], ['chest', { k: 'sash', col: '#ffcf3a' }]]),
  SK('pegasus', 'Pegasus Knight', 2, 3, 'gloss', '#f4f6ff', '#8ad8ff', [['wings', { k: 'feather', col: '#ffffff', tip: '#8ad8ff' }], ['helm', { k: 'winged', col: '#e8e0c0', wing: '#ffffff' }], ['limbs', { k: 'greaves', col: '#e8e0c0' }]]),
  SK('gorgon', 'Gorgon', 2, 3, 'slime', '#3a7a4a', '#c6ff2e', [['snakes', { col: '#4aa05a', eye: '#ffe629' }], ['visor', { k: 'gaze', glow: '#c6ff2e' }], ['chest', { k: 'goldcollar', col: '#ffcf3a' }]]),
  SK('minotaur', 'Minotaur', 2, 2, 'fur', '#6a3a22', '#ff7a3a', [['horns', { k: 'bull', col: '#f4ead8' }], ['mask', { k: 'ring', col: '#ffcf3a' }], ['backWeapon', { k: 'labrys', col: '#c8ccd8', haft: '#5a3a1e' }]]),
  // ---- Elemental Forge ----
  SK('magmaskin', 'Magma Core', 3, 3, 'stone', '#2a1a16', '#ff8a2a', [['shoulders', { k: 'rock', col: '#3a2a24' }], ['cracks', { col: '#ffb03a' }], ['crown', { k: 'flame', col: '#ff5a1f', core: '#ffd23a' }]]),
  SK('glacier', 'Glacier', 3, 2, 'ice', '#bfeaff', '#7ad8ff', [['crown', { k: 'ice', col: '#d6fbff' }], ['shoulders', { k: 'ice', col: '#d6fbff' }], ['aura', { k: 'snow', col: '#ffffff' }]]),
  SK('tempestskin', 'Tempest', 3, 3, 'cloth', '#5a6488', '#bfe8ff', [['halo', { k: 'storm', col: '#3a4060', bolt: '#bfe8ff' }], ['ring', { k: 'wind', col: '#d6f4ff' }], ['visor', { k: 'gaze', glow: '#bfe8ff' }]]),
  SK('verdant', 'Verdant', 3, 2, 'cloth', '#3f8a32', '#8be06a', [['crown', { k: 'leaf', col: '#5fbf4a' }], ['limbs', { k: 'vines', col: '#3f8a32', bloom: '#ff8ad8' }], ['shoulders', { k: 'leaf', col: '#5fbf4a' }]]),
  SK('tidal', 'Tidal Sovereign', 3, 4, 'slime', '#1aa0d8', '#6ff6ff', [['crown', { k: 'coral', col: '#ff8a7a' }], ['orbit', { k: 'water', col: '#6ff6ff', n: 6 }], ['aura', { k: 'bubbles', col: '#c8fbff' }], ['chest', { k: 'shell', col: '#ffe0d0' }]]),
  // ---- Cosmic Voyager ----
  SK('ringed', 'Ringed World', 4, 3, 'cosmic', '#3a2a6a', '#ffd48a', [['headRing', { col: '#ffd48a' }], ['orbit', { k: 'moons', col: '#d8d0ff', n: 2 }], ['chest', { k: 'emblem', col: '#ffd48a' }]]),
  SK('starforged', 'Starforged', 4, 4, 'cosmic', '#141a3c', '#ffe08a', [['crown', { k: 'star', col: '#ffe08a' }], ['trail', { col: '#ffe08a' }], ['limbs', { k: 'constellation', col: '#ffffff' }]]),
  SK('singularity', 'Singularity', 4, 4, 'obsidian', '#08060e', '#ff9a3a', [['ring', { k: 'accretion', col: '#ff9a3a', hot: '#ffe08a' }], ['halo', { k: 'void', col: '#ff9a3a' }], ['visor', { k: 'gaze', glow: '#ff9a3a' }]]),
  SK('astronaut', 'Astronaut', 4, 2, 'cloth', '#e8ecf4', '#ff8a3a', [['helm', { k: 'space', col: '#e8ecf4', glass: '#8ad8ff' }], ['pack', { k: 'astro', col: '#d8dce8', glow: '#ff8a3a' }], ['chest', { k: 'flag', col: '#ff8a3a' }]]),
  SK('nebuladrift', 'Nebula Drifter', 4, 3, 'cosmic', '#2a1450', '#c86bff', [['aura', { k: 'nebula', col: '#c86bff', alt: '#5ff2ff' }], ['orbit', { k: 'stars', col: '#ffffff', n: 5 }], ['halo', { k: 'ring', col: '#c86bff' }]]),
  // ---- Beast Kingdom ----
  SK('direwolf', 'Dire Wolf', 5, 2, 'fur', '#5a5e6a', '#8ad8ff', [['ears', { k: 'wolf', col: '#5a5e6a', inner: '#2a2e38' }], ['tail', { k: 'wolf', col: '#5a5e6a', tip: '#e8ecf4' }], ['limbs', { k: 'claws', col: '#f4ead8' }]]),
  SK('dragonborn', 'Dragonborn', 5, 4, 'gloss', '#7a1a2a', '#ff5a2a', [['horns', { k: 'dragon', col: '#2a1a1a' }], ['wings', { k: 'bat', col: '#5a1020', bone: '#2a1a1a' }], ['tail', { k: 'dragon', col: '#7a1a2a', spike: '#2a1a1a' }]]),
  SK('neoncat', 'Neon Cat', 5, 2, 'gloss', '#20182e', '#ff4fd8', [['ears', { k: 'cat', col: '#20182e', inner: '#ff4fd8' }], ['tail', { k: 'cat', col: '#20182e', tip: '#ff4fd8' }], ['visor', { k: 'whiskers', glow: '#ff4fd8' }], ['chest', { k: 'bell', col: '#ffcf3a' }]]),
  SK('moonbunny', 'Moon Bunny', 5, 2, 'fur', '#f4f0f8', '#b08aff', [['ears', { k: 'bunny', col: '#f4f0f8', inner: '#ffb3d1' }], ['tail', { k: 'pom', col: '#ffffff' }], ['orbit', { k: 'moons', col: '#ffe08a', n: 1 }]]),
  SK('stag', 'Forest Stag', 5, 3, 'fur', '#8a5a3a', '#ffe08a', [['horns', { k: 'antlers', col: '#e8dcc0' }], ['chest', { k: 'leafcollar', col: '#3f8a32' }], ['aura', { k: 'leaves', col: '#8be06a' }]]),
  // ---- Royal Court ----
  SK('sovereign', 'Sovereign', 6, 4, 'gold', '#ffd23a', '#ffffff', [['crown', { k: 'royal', col: '#ffcf3a', gem: '#ff2f57' }], ['chest', { k: 'ermine', col: '#ffffff', spot: '#14121a' }], ['backWeapon', { k: 'scepter', col: '#ffcf3a', gem: '#8a6bff' }], ['cape', { col: '#8a1a2a', trim: '#ffcf3a' }]]),
  SK('paladinknight', 'Paladin Knight', 6, 3, 'metal', '#c9d3e3', '#8fb0ff', [['helm', { k: 'greathelm', col: '#c9d3e3', plume: '#2a5aff' }], ['shoulders', { k: 'round', col: '#c9d3e3', trim: '#ffcf3a' }], ['chest', { k: 'tabard', col: '#2a5aff', emblem: '#ffcf3a' }]]),
  SK('jester', 'Jester', 6, 2, 'silk', '#8a2aff', '#ffcf3a', [['hat', { k: 'jester', col: '#8a2aff', alt: '#ffcf3a' }], ['chest', { k: 'ruffle', col: '#ffffff' }], ['orbit', { k: 'juggle', col: '#ff5a5a', n: 3 }]]),
  SK('pharaoh', 'Pharaoh', 6, 3, 'gold', '#e8c060', '#2a8aff', [['hat', { k: 'nemes', col: '#ffcf3a', stripe: '#1a4aa8' }], ['chest', { k: 'goldcollar', col: '#ffcf3a' }], ['backWeapon', { k: 'ankh', col: '#ffcf3a' }]]),
  SK('empress', 'Empress', 6, 3, 'silk', '#f4e0f0', '#ff6ad5', [['crown', { k: 'tiara', col: '#e8ecf4', gem: '#ff6ad5' }], ['orbit', { k: 'jewels', col: '#ff6ad5', n: 4 }], ['chest', { k: 'sash', col: '#ff6ad5' }]]),
  // ---- Mech Works ----
  SK('titanframe', 'Titan Frame', 7, 4, 'chrome', '#e8ecf4', '#2a8aff', [['helm', { k: 'vfin', col: '#e8ecf4', fin: '#ffcf3a', eye: '#3dffb8' }], ['shoulders', { k: 'heavy', col: '#2a5aff' }], ['wings', { k: 'thruster', col: '#e8ecf4', glow: '#2a8aff' }], ['backWeapon', { k: 'saber', col: '#ff2f57' }]]),
  SK('steamwright', 'Steamwright', 7, 3, 'brass', '#b8862a', '#ffb84d', [['hat', { k: 'top', col: '#3a2a20', band: '#b8862a' }], ['visor', { k: 'goggles', col: '#b8862a', glow: '#ffb84d' }], ['pack', { k: 'gears', col: '#b8862a' }]]),
  SK('dronepilot', 'Drone Pilot', 7, 2, 'gloss', '#3a4252', '#3dffb8', [['visor', { k: 'headset', col: '#20232e', glow: '#3dffb8' }], ['orbit', { k: 'drone', col: '#d8dce8', n: 1 }], ['pack', { k: 'antenna', col: '#3a4252', glow: '#3dffb8' }]]),
  SK('rocketeer', 'Rocketeer', 7, 2, 'cloth', '#6a4a2a', '#ff8a2a', [['helm', { k: 'aviator', col: '#5a3a22', glass: '#ffcf3a' }], ['pack', { k: 'rocket', col: '#c8ccd8', fin: '#ff2f57' }], ['chest', { k: 'scarf', col: '#ffffff' }]]),
  SK('bastion', 'Iron Bastion', 7, 3, 'metal', '#4a5260', '#ffb84d', [['shoulders', { k: 'heavy', col: '#4a5260' }], ['pack', { k: 'cannon', col: '#3a404c' }], ['visor', { k: 'band', col: '#14161e', glow: '#ffb84d' }], ['chest', { k: 'plate', col: '#3a404c' }]]),
  // ---- Spectral Night ----
  SK('reaper', 'Grim Reaper', 8, 4, 'shadow', '#0c0a14', '#7affd8', [['hat', { k: 'hood', col: '#0c0a14' }], ['visor', { k: 'gaze', glow: '#7affd8' }], ['backWeapon', { k: 'scythe', col: '#c8ccd8', haft: '#2a2228' }], ['orbit', { k: 'souls', col: '#7affd8', n: 3 }]]),
  SK('pumpkinking', 'Pumpkin King', 8, 3, 'cloth', '#2a1a2a', '#ff8a1a', [['mask', { k: 'pumpkin', col: '#ff7a1a', glow: '#ffd23a' }], ['limbs', { k: 'vines', col: '#2a5a1e', bloom: '#ff8a1a' }], ['cape', { col: '#1a0c1e', trim: '#ff8a1a' }]]),
  SK('hexwitch', 'Hex Witch', 8, 2, 'cloth', '#2a1a3a', '#9dff2e', [['hat', { k: 'witch', col: '#1a1024', band: '#9dff2e' }], ['backWeapon', { k: 'broom', col: '#6a4a2a', bristle: '#d8b05a' }], ['orbit', { k: 'potion', col: '#9dff2e', n: 1 }]]),
  SK('vampire', 'Vampire Lord', 8, 3, 'gloss', '#e8e4ec', '#ff2238', [['chest', { k: 'highcollar', col: '#1a0a10', lining: '#a0101e' }], ['wings', { k: 'bat', col: '#1a0a10', bone: '#3a1a24', small: true }], ['mask', { k: 'fangs', col: '#ffffff' }], ['cape', { col: '#1a0a10', trim: '#a0101e' }]]),
  SK('wraith', 'Wraith', 8, 2, 'spectral', '#a8b0c8', '#a8f0ff', [['limbs', { k: 'chains', col: '#8a90a0' }], ['orbit', { k: 'wisps', col: '#a8f0ff', n: 4 }], ['visor', { k: 'gaze', glow: '#a8f0ff' }]])
];
const SHOP_SKIN0 = 7, SKIN_COUNT = SHOP_SKIN0 + SHOP_SKINS.length;               // 7 base / Battle Pass skins + the 45 Item Shop skins
const SKIN_TIER = { 3: 10, 4: 22, 5: 35, 6: 50 };                                 // Battle Pass tier that unlocks each pass skin
const skinUnlocked = i => i >= SHOP_SKIN0 ? (typeof shopOwns === 'function' && shopOwns('skin:' + SHOP_SKINS[i - SHOP_SKIN0].id))
  : !SKIN_TIER[i] || (typeof passOwns === 'function' && passOwns('skin' + i));
// a skin colour spec → hex for this fighter ('self' · '#rrggbb' · 'mix:#rrggbb:k')
function skinColor(ch, spec) {
  if (!spec || spec === 'self') return ch.color;
  if (spec.startsWith('mix:')) { const [, h, k] = spec.split(':'); return mixHex(ch.color, h, +k); }
  return spec;
}
function hexHue(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return -1;                                                      // greyish: no real hue
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function mixHex(a, b, k) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16), m = s => Math.round(((p >> s) & 255) * (1 - k) + ((q >> s) & 255) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
function skinOf(ch, i) {
  i = ((i || 0) % SKIN_COUNT + SKIN_COUNT) % SKIN_COUNT;
  if (i === 1) {
    const h = hexHue(ch.color), goldish = h >= 30 && h <= 62;                   // (already-gold fighters get a brighter, whiter gold)
    return { i, name: 'Gold Crusader', color: goldish ? '#ffe9a0' : '#ffd23a', fill: rgba('#ffd23a', goldish ? 0.42 : 0.34), fx: 'gold' };
  }
  if (i === 2) return { i, name: 'Void Reaver', color: mixHex(ch.color, '#ff2238', 0.82), fill: 'rgba(6,6,10,0.95)', fx: 'void' };   // obsidian body, red glow
  if (i === 3) return { i, name: 'Prism Shard', color: mixHex(ch.color, '#c8f6ff', 0.5), fill: rgba('#c8f6ff', 0.3), fx: 'prism' };
  if (i === 4) return { i, name: 'Mech Frame', color: mixHex(ch.color, '#dfe6f5', 0.45), fill: rgba('#c4cddf', 0.4), fx: 'mech' };
  if (i === 5) return { i, name: 'Celestial', color: mixHex(ch.color, '#ffe08a', 0.4), fill: 'rgba(14,18,48,0.92)', fx: 'cosmic' };
  if (i === 6) return { i, name: 'Neon Legend', color: mixHex(ch.color, '#ffffff', 0.15), fill: rgba(ch.color, 0.35), fx: 'legend' };
  if (i >= SHOP_SKIN0) { const d = SHOP_SKINS[i - SHOP_SKIN0], col = skinColor(ch, d.glow); return { i, name: d.name, color: col, fill: rgba(skinColor(ch, d.alb), 0.32), fx: 'shop', shop: d }; }
  return { i, name: 'Base', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2), fx: null };
}
// Dress a fighter (or a menu preview dummy) in a skin
function applySkin(f, ch, i) { const s = skinOf(ch, i); f.ch = ch; f.skin = s.i; f.skinFx = s.fx; f.color = s.color; f.fill = s.fill; return s; }
