/* =====================================================================
 *  NEON BRAWL — single-player 2D platform brawler (4 fighters, 4 stages, 4 CPU levels)
 *  HTML5 Canvas + vanilla JavaScript, one file, zero dependencies.
 *
 *  Controls (Player 1)
 *    A / D ........ move (double-tap to dash)      S ... fast-fall / drop through (optional)
 *    Space ........ jump / mid-air jump
 *    Left click ... light attack      Right click ... heavy / smash attack
 *    Q ............ special / recovery
 *    E ............ shield  (tap it just before a hit lands = PARRY)
 *    Mouse AIM decides attack direction: cursor above you = up attack,
 *    below = down attack, to the side = side attack, on top of you = neutral.
 *    The special (Q) also fires / dashes toward the cursor.
 *
 *  Knockback:  KB = base + (damage% × scale)   (divided by the target's weight)
 *              launch speed = KB × 0.8
 * ===================================================================== */
'use strict';

/* ============================== CONFIG ============================== */
const W = 1280, H = 720;
const STEP = 1000 / 60;                  // fixed 60 Hz simulation
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_NUM = 'Orbitron, "Arial Black", Impact, "Segoe UI", system-ui, sans-serif';   // bundled in www/fonts

const PHYS = { grav: 0.6, hitGrav: 0.24, maxFall: 13, fastFall: 18, groundAcc: 1.1, friction: 0.72 };
const HW = 14;                    // terrain half-width of a fighter
const BODY_W = 34, BODY_H = 64;   // hurtbox
const LAUNCH = 0.8;               // knockback -> launch speed
const PARRY_WIN = 8;              // frames after raising the shield that count as a parry
