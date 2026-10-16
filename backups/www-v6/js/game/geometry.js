/* NEON BRAWL — Hitbox / hurtbox geometry helpers. */
'use strict';

/* ============================ GEOMETRY ============================== */
const CRAWL_H = 36;                                                  // Chimera's low-profile crawl hurtbox height
const bodyRect = f => f.crawl ? { x: f.x - BODY_W / 2 - 6, y: f.y - CRAWL_H, w: BODY_W + 12, h: CRAWL_H } : { x: f.x - BODY_W / 2, y: f.y - BODY_H, w: BODY_W, h: BODY_H };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Every attack / grab rectangle the combat code actually tests this step (drawn by the Training hitbox overlay; no sim effect)
const HITBOX_LOG = [];
function logHitbox(r, f, kind) { if (HITBOX_LOG.length < 64) HITBOX_LOG.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind, col: f.color }); }
function hitboxRect(f, m) {
  const b = m.box;
  return { x: f.facing > 0 ? f.x + b.ox : f.x - b.ox - b.w, y: f.y + b.oy, w: b.w, h: b.h };
}
function rectCircle(r, cx, cy, rad) {
  const px = clamp(cx, r.x, r.x + r.w), py = clamp(cy, r.y, r.y + r.h);
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= rad * rad;
}
const shieldR = f => 18 + 26 * clamp(f.shield / 100, 0, 1) + (f.ch.shieldBonus || 0);     // bubble shrinks as it weakens
const isOffStage = f => !f.onGround && (f.x < STAGE.x - 6 || f.x > STAGE.x + STAGE.w + 6 || f.y > STAGE.y + 20);
