/* NEON BRAWL — Hitbox / hurtbox geometry helpers. */
'use strict';

/* ============================ GEOMETRY ============================== */
const CRAWL_H = 36;                                                  // Chimera's low-profile crawl hurtbox height
// (f.scale: the Arcade's Giant Boss is 3× — hurtbox, attack boxes and shield all scale about the feet)
const CAR_W = 84, CAR_H = 46;                                       // (v15) Dino Nuggi F1: the car's hurtbox — long and low (the dino's head pokes out of the cockpit)
const bodyRect = f => { if (f.hand) return handRect(f); const s = f.scale || 1; if (f.car && !f.crawl && f.state !== 'ledge') return { x: f.x - CAR_W / 2 * s, y: f.y - CAR_H * s, w: CAR_W * s, h: CAR_H * s }; return f.crawl ? { x: f.x - (BODY_W / 2 + 6) * s, y: f.y - CRAWL_H * s, w: (BODY_W + 12) * s, h: CRAWL_H * s } : { x: f.x - BODY_W / 2 * s, y: f.y - BODY_H * s, w: BODY_W * s, h: BODY_H * s }; };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Every attack / grab rectangle the combat code actually tests this step (drawn by the Training hitbox overlay; no sim effect)
const HITBOX_LOG = [];
function logHitbox(r, f, kind, mv) { if (HITBOX_LOG.length < 64) HITBOX_LOG.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind, col: f.color, owner: f.id, mv: mv || null }); }   // (mv: the move — the Horde's enemies take its real damage)
function hitboxRect(f, m) {
  const b = m.box, s = f.scale || 1;
  return { x: f.facing > 0 ? f.x + b.ox * s : f.x - (b.ox + b.w) * s, y: f.y + b.oy * s, w: b.w * s, h: b.h * s };
}
function rectCircle(r, cx, cy, rad) {
  const px = clamp(cx, r.x, r.x + r.w), py = clamp(cy, r.y, r.y + r.h);
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= rad * rad;
}
const shieldR = f => (18 + 26 * clamp(f.shield / 100, 0, 1) + (f.ch.shieldBonus || 0)) * (f.scale || 1);     // bubble shrinks as it weakens
const isOffStage = f => !f.onGround && (f.x < STAGE.x - 6 || f.x > STAGE.x + STAGE.w + 6 || f.y > STAGE.y + 20);
