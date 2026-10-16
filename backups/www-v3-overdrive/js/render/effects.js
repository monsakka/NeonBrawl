/* NEON BRAWL — Particles and visual effects. */
'use strict';

/* ============================== EFFECTS ============================= */
const den = n => Math.max(1, Math.round(n * SET.part));            // particle density setting
function pushFx(p) { if (fx.length > 900) fx.splice(0, 80); fx.push(p); }
function burst(x, y, color, n, speed, life, type) {
  n = den(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(speed * 0.4, speed);
    pushFx({ type: type || 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rand(0.6, 1), max: life,
             color, w: rand(1.5, 3.2), len: 2.2, drag: 0.92, g: 0, size: rand(2, 4.5) });
  }
}
// Soft expanding dust puffs (jumps, landings, dashes)
function dust(x, y, n) {
  n = den(n);
  for (let i = 0; i < n; i++) pushFx({ type: 'cloud', x: x + rand(-12, 12), y: y - 3, vx: rand(-1.7, 1.7), vy: rand(-0.8, -0.1), life: 24, max: 24, color: '#aab0d8', size: rand(5, 9), drag: 0.92, g: 0 });
}
function ring(x, y, color, r0, dr, life, w) { pushFx({ type: 'ring', x, y, r: r0, dr, life, max: life, color, w: w || 3, vx: 0, vy: 0, drag: 1, g: 0 }); }
function starFx(x, y, color, size) { pushFx({ type: 'star', x, y, size, life: 22, max: 22, color, vx: 0, vy: 0, drag: 1, g: 0, rot: Math.random() }); }
// Motion-trail ghost: a fading silhouette of the fighter's current pose (f.snap is recorded by drawFighter)
function ghost(f) { pushFx({ type: 'ghost', x: f.x, y: f.y, face: f.facing, rot: f.rot, snap: f.snap || null, color: f.color, life: 14, max: 14, vx: 0, vy: 0, drag: 1, g: 0 }); }
function textFx(text, x, y, color) { pushFx({ type: 'text', text, x, y, color, life: 50, max: 50, vx: 0, vy: -0.7, drag: 1, g: 0 }); }
// Sparks kicked out behind a dashing fighter
function dashSparks(f) {
  const n = den(3);
  for (let i = 0; i < n; i++) pushFx({ type: 'spark', x: f.x - f.facing * 8, y: f.y - 2, vx: -f.facing * rand(2, 6), vy: rand(-3, -0.5), life: 12, max: 12, color: i % 2 ? '#ffffff' : f.color, w: 2, len: 2.4, drag: 0.9, g: 0.15 });
}
// Streaks parallel to the velocity of a strongly launched fighter
function speedLines(f) {
  const ang = Math.atan2(f.vy, f.vx), cs = Math.cos(ang), sn = Math.sin(ang), n = den(2);
  for (let i = 0; i < n; i++) {
    const off = rand(-28, 28);
    pushFx({ type: 'speed', x: f.x - sn * off - cs * 10, y: f.y - 32 + cs * off - sn * 10, dx: cs, dy: sn, len: rand(40, 100), life: 10, max: 10, color: '#ffffff', vx: 0, vy: 0, drag: 1, g: 0 });
  }
}
// Shield-break: the bubble bursts into spinning shards
function shatter(x, y, color, r) {
  const n = den(16);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(3, 10);
    pushFx({ type: 'shard', x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 46, max: 46,
             color: i % 3 ? color : '#ffffff', size: rand(5, 11), rot: rand(0, 6.28), vr: rand(-0.4, 0.4), drag: 0.97, g: 0.28 });
  }
}

// Ronin: calligraphy ink — dark brush blots with a pale rim that bleed outward and fade
function inkFx(x, y, n, dx, dy) {
  n = den(n);
  for (let i = 0; i < n; i++) pushFx({ type: 'ink', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: (dx || 0) * rand(0.2, 1) + rand(-1.2, 1.2), vy: (dy || 0) * rand(0.2, 1) + rand(-1.2, 1.2),
                                      life: 34, max: 34, color: '#0a0a10', size: rand(3, 8), rot: rand(0, 6.28), stretch: rand(1, 2.6), drag: 0.88, g: 0.03 });
}

// Shockwave: flattened ring that expands in the launch direction
function shockwave(x, y, vx, vy, color, kb) { pushFx({ type: 'wave', x, y, ang: Math.atan2(vy, vx), r: 6, dr: 6 + kb * 0.25, life: 18, max: 18, color, vx: 0, vy: 0, drag: 1, g: 0 }); }
// Electric arc (Volt)
function boltFx(x, y, color) {
  const pts = [[0, 0]]; let a = rand(0, 6.28), px = 0, py = 0;
  for (let i = 0; i < 6; i++) { a += rand(-1, 1); const l = rand(10, 22); px += Math.cos(a) * l; py += Math.sin(a) * l; pts.push([px, py]); }
  pushFx({ type: 'bolt', x, y, pts, color, life: 10, max: 10, vx: 0, vy: 0, drag: 1, g: 0 });
}

function updateFx() {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
    if (p.type === 'ring' || p.type === 'wave') { p.r += p.dr; p.dr *= 0.9; }
    if (p.type === 'shard') p.rot += p.vr;
    if (--p.life <= 0) { fx[i] = fx[fx.length - 1]; fx.pop(); }
  }
}
