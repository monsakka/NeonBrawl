/* NEON BRAWL — In-match HUD.
 * Each player panel is an angled chrome-edged glass plate. The static parts (plate, chrome edge, neon trim, scanlines)
 * are painted ONCE into a cached layer per colour / resolution and simply blitted every frame; only the live parts
 * (portrait, % counter, stocks, meters) are drawn per frame. No per-frame blur filters. */
'use strict';

/* ---------------- HUD ---------------- */
const HUD_W = 340, HUD_H = 118, HUD_PAD = 14, HUD_CUT = 22;
// The plate outline: chamfered top-left and bottom-right corners (mirrored for the right-hand panel)
function hudPlatePath(x, y, w, h, flip) {
  const c = HUD_CUT; ctx.beginPath();
  if (!flip) { ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); }
  else { ctx.moveTo(x, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); }
  ctx.closePath();
}
function hudFrame(col, flip) {
  const P = HUD_PAD, w = HUD_W + P * 2, h = HUD_H + P * 2;
  return uiLayer('hud' + (flip ? 1 : 0), col + '|' + DPR, Math.ceil(w * DPR), Math.ceil(h * DPR), c2 => {
    c2.setTransform(DPR, 0, 0, DPR, 0, 0);
    hudPlatePath(P, P, HUD_W, HUD_H, flip);
    c2.save(); c2.shadowColor = col; c2.shadowBlur = 14; c2.fillStyle = 'rgba(6,8,22,0.82)'; c2.fill(); c2.restore();   // outer neon bloom (baked)
    const g = c2.createLinearGradient(P, P, P + HUD_W * 0.5, P + HUD_H);
    g.addColorStop(0, 'rgba(44,50,112,0.85)'); g.addColorStop(0.55, 'rgba(12,14,38,0.9)'); g.addColorStop(1, rgba(col, 0.22));
    c2.fillStyle = g; c2.fill();
    c2.save(); hudPlatePath(P, P, HUD_W, HUD_H, flip); c2.clip();
    c2.fillStyle = 'rgba(255,255,255,0.035)'; for (let y = P; y < P + HUD_H; y += 3) c2.fillRect(P, y, HUD_W, 1);              // scanlines
    const hl = c2.createLinearGradient(0, P, 0, P + HUD_H * 0.45); hl.addColorStop(0, 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = hl; c2.fillRect(P, P, HUD_W, HUD_H * 0.45);                                                                  // glass top reflection
    c2.fillStyle = rgba(col, 0.9); c2.fillRect(flip ? P + HUD_W - 4 : P, P, 4, HUD_H);                                          // neon side bar
    c2.restore();
    const ch = c2.createLinearGradient(P, P, P + HUD_W, P + HUD_H);                                                              // chrome edge
    ch.addColorStop(0, '#f4f6ff'); ch.addColorStop(0.2, '#7a82a8'); ch.addColorStop(0.35, '#ffffff'); ch.addColorStop(0.55, '#4a5278'); ch.addColorStop(0.75, '#e8ecff'); ch.addColorStop(1, '#6a7298');
    hudPlatePath(P, P, HUD_W, HUD_H, flip); c2.lineWidth = 2.2; c2.strokeStyle = ch; c2.stroke();
    hudPlatePath(P + 4, P + 4, HUD_W - 8, HUD_H - 8, flip); c2.lineWidth = 1; c2.strokeStyle = rgba(col, 0.45); c2.stroke();   // inner neon trim
    // portrait socket
    const pcx = P + (flip ? HUD_W - 56 : 56), pcy = P + HUD_H / 2;
    c2.fillStyle = 'rgba(0,0,0,0.5)'; c2.beginPath(); c2.arc(pcx, pcy, 40, 0, TAU); c2.fill();
    c2.lineWidth = 3; c2.strokeStyle = ch; c2.stroke();
  });
}

/* Live portraits: a private dummy per panel (so the real fighter's springs aren't stepped twice), drawn straight into
 * the HUD clipped to the socket. (Rendering into a side canvas and blitting it every few frames forces a GPU sync
 * between the two contexts — measured as 250 ms stalls — so the portrait is drawn in place with cheap shading.) */
const HUD_PORT = [null, null];
function drawHudPortrait(k, f, cx, cy) {
  let d = HUD_PORT[k];
  if (!d || d.ch !== f.ch) { d = HUD_PORT[k] = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch: f.ch, name: '', color: f.color, fill: f.fill }; resetFighter(d, 0); }
  applySkin(d, f.ch, f.skin);
  const hit = f.hurt > 0 || f.state === 'hitstun' || f.state === 'stunned';
  poseDummy(d, hit ? 5 * 90 + 10 : f.state === 'attack' ? 2 * 90 + 6 : G.time % 90);
  if (hit) { d.rot = Math.sin(G.time * 0.6) * 0.25; d.hitFlash = f.hitFlash; }
  d.facing = k === 0 ? 1 : -1;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 37, 0, TAU); ctx.clip();
  const g = ctx.createRadialGradient(cx, cy - 10, 4, cx, cy, 44); g.addColorStop(0, rgba(f.color, hit ? 0.2 : 0.5)); g.addColorStop(1, hit ? 'rgba(255,40,60,0.45)' : 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 40, cy - 40, 80, 80);
  // glows are switched off inside the clipped socket: a blurred shadow under a non-rectangular clip takes the GPU's slow
  // layer path (multi-second stalls on some drivers). An own-property shadows the context's shadowBlur setter until deleted.
  Object.defineProperty(ctx, 'shadowBlur', NO_BLUR);
  SHADE.lite = true; ctx.translate(cx, cy + 66); ctx.scale(0.9, 0.9);
  try { drawFighter(d); } finally { SHADE.lite = false; delete ctx.shadowBlur; }
  ctx.restore();
}
const NO_BLUR = { configurable: true, get: () => 0, set: () => {} };

// Stock badge: a faceted diamond gem (full) or an empty socket with a crack (lost)
function stockBadge(x, y, full, col, pulse) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0); ctx.closePath();
  if (full) {
    const c = pulse ? '#ff5a5a' : col, g = ctx.createLinearGradient(-8, -9, 8, 9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c); g.addColorStop(1, rgba(c, 0.55));
    ctx.shadowColor = c; ctx.shadowBlur = pulse ? 16 : 9; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#05060f'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(1, -1); ctx.lineTo(-1, 2); ctx.lineTo(3, 6); ctx.stroke();
  }
  ctx.restore();
}
// Segmented "digital" bar
function segBar(x, y, w, frac, col, n) {
  const gap = 2, sw = (w - gap * (n - 1)) / n, on = Math.round(clamp(frac, 0, 1) * n * 2) / 2;
  for (let i = 0; i < n; i++) {
    const lit = i < Math.floor(on) ? 1 : i < on ? 0.5 : 0;
    ctx.fillStyle = lit ? (typeof col === 'function' ? col(i / (n - 1)) : col) : 'rgba(255,255,255,0.08)';
    ctx.globalAlpha = lit ? 0.45 + 0.55 * lit : 1; ctx.fillRect(x + i * (sw + gap), y, sw, 6);
  }
  ctx.globalAlpha = 1;
}
const launchCol = u => u < 0.5 ? '#5dffa0' : u < 0.8 ? '#ffd36e' : '#ff4d4d';

function drawHUD() {
  const panels = [{ f: fighters[0], cx: W * 0.27, flip: false }, { f: fighters[1], cx: W * 0.73, flip: true }];
  panels.forEach(({ f, cx, flip }, k) => {
    const w = HUD_W, h = HUD_H, x = Math.round(cx - w / 2), y = H - h - 14, hurt = SET.flash ? f.hurt / 14 : 0, col = f.color;
    ctx.drawImage(hudFrame(col, flip), x - HUD_PAD, y - HUD_PAD, w + HUD_PAD * 2, h + HUD_PAD * 2);
    if (hurt > 0) { ctx.save(); hudPlatePath(x, y, w, h, flip); ctx.fillStyle = `rgba(255,40,60,${(0.4 * hurt).toFixed(3)})`; ctx.fill(); ctx.lineWidth = 2 + 3 * hurt; ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = hurt; ctx.stroke(); ctx.restore(); }
    // portrait (live) + ring; the ring pulses red on the last stock
    const pcx = flip ? x + w - 56 : x + 56, pcy = y + h / 2;
    drawHudPortrait(k, f, pcx, pcy);
    const last = f.stocks === 1, beat = last ? 0.5 + 0.5 * Math.sin(G.time * 0.2) : 0;
    ctx.save(); ctx.beginPath(); ctx.arc(pcx, pcy, 38, 0, TAU); ctx.lineWidth = 2.5; ctx.strokeStyle = last ? `rgba(255,90,90,${0.5 + 0.5 * beat})` : col; ctx.shadowColor = last ? '#ff3a3a' : col; ctx.shadowBlur = 10 + 8 * beat; ctx.stroke(); ctx.restore();
    // text column (left of the portrait on the right-hand panel)
    const tx = flip ? x + 18 : x + 108, tr = flip ? x + w - 108 : x + w - 18;
    txt(f.ch.name, tx, y + 26, 15, col, 'left', 900, FONT_NUM);
    txt(f.cpu ? 'CPU · ' + DIFFS[G.diff].name.toUpperCase() : 'PLAYER 1', tx, y + 39, 9, 'rgba(220,224,255,0.6)', 'left', 800, FONT_NUM);
    for (let i = 0; i < 3; i++) stockBadge(tr - 8 - i * 20, y + 22, i < f.stocks, col, last && ((G.time >> 4) & 1));
    // big glowing % counter: a faint "888" ghost (digital readout) behind a colour-shifting number
    const pc = Math.floor(f.percent), t = clamp(f.percent / 200, 0, 1);
    const pcol = `hsl(${Math.round(190 - 190 * Math.min(1, t * 1.25))}, 100%, ${Math.round(88 - 30 * t)}%)`;   // cyan → yellow → orange → red
    const pop = 1 + 0.25 * (f.percentPop / 14), jit = hurt * 3;
    ctx.save(); ctx.translate(tx + rand(-jit, jit), y + 84 + rand(-jit, jit)); ctx.scale(pop, pop);
    ctx.font = `900 50px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';     // Inter: Orbitron's slashed zero reads badly this big
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillText('8'.repeat(String(pc).length), 0, 0);
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#050510'; ctx.strokeText(pc, 0, 0);
    ctx.shadowColor = pcol; ctx.shadowBlur = 16 + 10 * t;
    ctx.fillStyle = hurt > 0.2 && ((G.time >> 1) & 1) ? '#ff4d4d' : pcol; ctx.fillText(pc, 0, 0);
    const wNum = ctx.measureText(String(pc)).width;
    ctx.shadowBlur = 0; ctx.font = `900 20px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText('%', wNum + 3, 0); ctx.fillText('%', wNum + 3, 0);
    ctx.restore();
    // resource meter (jet fuel / hover / special cooldown), next to the counter
    const c = f.ch; let label = null, val = 0;
    if (c.jet) { label = 'FUEL'; val = f.fuel / 100; }
    else if (c.hover) { label = 'HOVER'; val = f.hoverT / c.hover; }
    else if (c.special.cd) { label = 'Q'; val = 1 - f.spCD / c.special.cd; }
    if (label) {
      const mx = tr - 70, my = y + 62;
      txt(label + (val >= 1 ? ' READY' : ''), tr, my - 4, 8.5, val >= 1 ? col : 'rgba(255,255,255,0.5)', 'right', 800, FONT_NUM);
      segBar(mx, my, 70, val, val >= 1 ? col : rgba(col, 0.7), 7);
    }
    // launch multiplier gauge + shield bar
    const mult = (8 + f.percent * 0.12) / 8 / f.ch.weight, fr = clamp((mult - 0.5) / 3.5, 0, 1), gw = tr - tx;
    txt('LAUNCH ×' + mult.toFixed(2), tr, y + 92, 8.5, '#c6c9f5', 'right', 800, FONT_NUM);
    segBar(tx, y + 95, gw, fr, launchCol, 16);
    const frac = clamp(f.shield / 100, 0, 1), low = frac < 0.3;
    const scol = f.state === 'stunned' ? '#ffe14d' : low ? (((G.time >> 3) & 1) ? '#ff5a5a' : '#ffa0a0') : col;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(tx, y + 105, gw, 4, 2); ctx.fill();
    if (frac > 0) { ctx.fillStyle = scol; rr(tx, y + 105, Math.max(4, gw * frac), 4, 2); ctx.fill(); }
  });
  if (G.mode === 'count' || (G.mode === 'play' && G.frame < 480)) {   // control reminder
    const a = G.mode === 'count' ? 1 : clamp((480 - G.frame) / 60, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,8,22,0.7)'; rr(W / 2 - 440, 16, 880, 40, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(34,230,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    txt(TOUCH.using ? 'Left thumb: move and aim with the stick · right thumb: Attack, Smash, Special, Jump, Shield (tap = parry)'
                    : 'A/D move · Space jump · Left click light · Right click smash (hold to charge) · Q special · E shield (tap = parry) · aim with the mouse', W / 2, 42, 15, '#d9dcff', 'center', 600);
    ctx.restore();
  }
}

function drawOverlayCenter(big, small, color) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 30;
  txt(big, W / 2, H / 2 - 10, 120, color, 'center', 900, FONT_NUM); ctx.restore();
  if (small) txt(small, W / 2, H / 2 + 42, 24, '#d9dcff', 'center', 600);
}
