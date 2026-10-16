/* NEON BRAWL — Canvas drawing helpers. */
'use strict';

/* ============================== RENDERING =========================== */
// stageTex: the stage art is being painted into a WebGL texture (skip fake 2D shadows / light spill — real 3D lighting replaces them)
const RENDER_FLAGS = { stageTex: false, shield3D: false };   // shield3D: the 3D renderer draws shield bubbles as real spheres
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function capsulePath(w, h) {
  const r = w / 2;
  ctx.beginPath(); ctx.moveTo(-r, -h + r); ctx.arc(0, -h + r, r, Math.PI, 0); ctx.lineTo(r, -r); ctx.arc(0, -r, r, 0, Math.PI); ctx.closePath();
}
// Off-screen render target for cached layers (HUD frames, portraits, previews). A detached <canvas> shares the page's
// GPU context, so blitting it every frame is cheap; OffscreenCanvas is only the fallback where there is no DOM.
function makeLayer(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w; c.height = h; return c;
}
// Cached layer: paint(ctx) runs only when `key` changes; returns the bitmap to blit
const UI_LAYERS = {};
function uiLayer(id, key, w, h, paint) {
  let L = UI_LAYERS[id];
  if (!L || L.w !== w || L.h !== h) L = UI_LAYERS[id] = { c: makeLayer(w, h), w, h, key: null };
  if (L.key !== key) {
    const prev = ctx, c2 = L.c.getContext('2d'); c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, w, h);
    ctx = c2; try { paint(c2); } finally { ctx = prev; } L.key = key;
  }
  return L.c;
}
function txt(s, x, y, size, color, align, weight, family) {
  ctx.font = `${weight || 800} ${size}px ${family || FONT}`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(s, x, y);
}
