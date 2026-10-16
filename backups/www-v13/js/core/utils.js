/* NEON BRAWL — Small math helpers. */
'use strict';

/* ============================== UTILS =============================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const sign = v => v > 0 ? 1 : v < 0 ? -1 : 0;
