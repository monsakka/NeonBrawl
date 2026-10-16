/* NEON BRAWL — Costume skins. Every fighter has 3:
 *   0 Classic       the original colours
 *   1 Gold Nitro    gold outline + glints over the fighter's own tint (Neon Nitro green for fighters that are already gold)
 *   2 Shadow        stealth: an ink-black body with the fighter's colour as a thin neon outline, trailing dark wisps
 * A skin only decides colours (f.color / f.fill); everything that glows — rig, HUD, hit sparks, specials — follows f.color. */
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
    const h = hexHue(ch.color), goldish = h >= 30 && h <= 62;                   // already gold? go neon green instead
    const col = goldish ? '#39ff9e' : '#ffd23a';
    return { i, name: goldish ? 'Neon Nitro' : 'Gold Nitro', color: col, fill: rgba(ch.color, 0.34), fx: 'nitro' };
  }
  if (i === 2) {
    const dark = ch.fill && /^rgba\(\s*1\d,/.test(ch.fill);                      // fighters that are already dark (Ronin) swap to their alt colour
    return { i, name: 'Shadow', color: mixHex(dark ? ch.alt : ch.color, '#9a7bff', 0.5), fill: 'rgba(9,9,18,0.92)', fx: 'shadow' };   // violet-tinted, ink-black body
  }
  return { i, name: 'Classic', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2), fx: null };
}
// Dress a fighter (or a menu preview dummy) in a skin
function applySkin(f, ch, i) { const s = skinOf(ch, i); f.ch = ch; f.skin = s.i; f.skinFx = s.fx; f.color = s.color; f.fill = s.fill; return s; }
