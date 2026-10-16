/* NEON BRAWL — Costume skins. Every fighter has 3, each with its own shader material in the 3D renderer:
 *   0 Base          the original colours — cel-shaded cartoon render with rim lighting
 *   1 Gold Crusader a highly reflective metallic-gold body (+ sparkle glints) wearing a procedural geometric 3D helmet
 *                   (5 designs, tuned per fighter — render/fighter3d.js helmet3D)
 *   2 Void Reaver   a pitch-black obsidian body with glowing red eyes and dark smoke, in spiked armour, with its weapon
 *                   swapped for a crueller one (jagged void blade, trident, spiked mace, cleaver, kusarigama, crescent bow, claws)
 * A skin decides colours (f.color / f.fill), the material (f.skinFx) and extra geometry (f.skin); everything that glows — HUD, hit sparks,
 * specials — follows f.color. */
'use strict';

const SKIN_COUNT = 3;
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
  return { i, name: 'Base', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2), fx: null };
}
// Dress a fighter (or a menu preview dummy) in a skin
function applySkin(f, ch, i) { const s = skinOf(ch, i); f.ch = ch; f.skin = s.i; f.skinFx = s.fx; f.color = s.color; f.fill = s.fill; return s; }
