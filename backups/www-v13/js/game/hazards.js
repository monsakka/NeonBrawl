/* NEON BRAWL — Stage hazards (lava / acid geysers, lightning, arrow volleys, icicles, highway traffic). Toggle on the stage-select screen.
 * Also the Forgotten Temple's crumbling platforms (always on). */
'use strict';

/* Every hazard telegraphs first ('warn'), then is dangerous for a few frames ('active').
 * Hits go through deliver() with a neutral pseudo-attacker, so shields, parries and knockback all apply. */
const HAZARD_ATT = { isHazard: true, id: -1, ch: {}, color: '#ffffff', x: 0, y: 0, facing: 1, cmbN: 0 };
const HAZARDS = {
  lava:      { every: [330, 430], warn: 70, dur: 40, hit: { dmg: 10, base: 9,   scale: 0.09, ang: 85, heavy: true }, color: '#ff7a2a' },
  lightning: { every: [280, 360], warn: 55, dur: 10, hit: { dmg: 12, base: 8,   scale: 0.10, ang: 70, heavy: true }, color: '#cfe0ff' },
  flare:     { every: [400, 480], warn: 70, dur: 22, hit: { dmg: 9,  base: 8,   scale: 0.09, ang: 45, heavy: true }, color: '#ffd36e' },
  icicle:    { every: [160, 220], warn: 40, dur: 60, hit: { dmg: 7,  base: 6.5, scale: 0.08, ang: 75 },              color: '#dff6ff' },
  traffic:   { every: [360, 460], warn: 66, dur: 30, hit: { dmg: 10, base: 9,   scale: 0.09, ang: 38, heavy: true }, color: '#ffe9a0' },
  train:     { every: [330, 430], warn: 80, dur: 34, hit: { dmg: 13, base: 10,  scale: 0.10, ang: 35, heavy: true }, color: '#3df0ff' }
};
const vehicle = h => h.kind === 'traffic' || h.kind === 'train';                // (the highway car and the subway train share their logic)
const TRAIN_LEN = 520;
const HZ = { t: 200, list: [] };
const hazCol = h => (h.kind === 'lava' && ST.hazColor) || HAZARDS[h.kind].color;          // (Toxic Wasteland's geysers are acid green)

function resetHazards() { HZ.t = 240; HZ.list.length = 0; }
const hazardsOn = () => SEL.hazards && ST.hazard && (G.mode === 'play' || G.mode === 'ending');
const randFighterX = () => { const live = fighters.filter(f => f.state !== 'dead' && f.state !== 'respawn'); return live.length ? live[Math.floor(Math.random() * live.length)].x : STAGE.x + STAGE.w / 2; };

// Danger rectangle of a hazard (world space)
function hazardRect(h) {
  if (h.kind === 'lava') return { x: h.x - 34, y: STAGE.y - 280, w: 68, h: 280 };
  if (h.kind === 'lightning') return { x: h.x - 26, y: BZ.t, w: 52, h: STAGE.y - BZ.t + 4 };
  if (h.kind === 'flare') return { x: BZ.l, y: h.y - 23, w: BZ.r - BZ.l, h: 46 };
  if (vehicle(h)) {                                                                    // Neon Highway's car / Neon Subways' train tearing across the deck
    const train = h.kind === 'train', ht = train ? 66 : 40, len = train ? TRAIN_LEN : 128;
    if (h.phase === 'warn') return { x: STAGE.x, y: STAGE.y - ht, w: STAGE.w, h: ht };   // (the lane it will use)
    const u = h.t / HAZARDS[h.kind].dur, front = h.dir > 0 ? lerp(BZ.l, BZ.r + len, u) : lerp(BZ.r, BZ.l - len, u);
    return { x: h.dir > 0 ? front - len : front, y: STAGE.y - ht, w: len, h: ht };
  }
  return { x: h.x - 10, y: h.y - 34, w: 20, h: 34 };                                  // icicle body
}

function spawnHazard(kind) {
  const H = HAZARDS[kind], h = { kind, phase: 'warn', t: 0, hit: [], dir: Math.random() < 0.5 ? -1 : 1 };
  if (kind === 'lava') h.x = clamp(randFighterX() + rand(-60, 60), STAGE.x + 40, STAGE.x + STAGE.w - 40);
  else if (kind === 'lightning') h.x = clamp(randFighterX(), BZ.l + 60, BZ.r - 60);
  else if (kind === 'traffic' || kind === 'train') h.y = STAGE.y;
  else if (kind === 'flare') { const ys = [STAGE.y - 26, ...PLATS.map(p => p.y - 26)]; h.y = ys[Math.floor(Math.random() * ys.length)]; }
  else { h.x = rand(STAGE.x + 20, STAGE.x + STAGE.w - 20); h.y = STAGE.y - 430; h.vy = 0; }
  HZ.list.push(h);
  HZ.t = Math.round(rand(H.every[0], H.every[1]));
}

function hazardHits(h) {
  const H = HAZARDS[h.kind], r = hazardRect(h);
  for (const f of fighters) {
    if (h.hit.includes(f) || !canBeHit(f) || !overlap(r, bodyRect(f))) continue;
    h.hit.push(f);
    const dir = h.kind === 'flare' || vehicle(h) ? h.dir : sign(f.x - (h.x || f.x)) || (Math.random() < 0.5 ? -1 : 1);
    const blocked = f.state === 'shield';
    deliver(HAZARD_ATT, f, H.hit, dir, f.x, f.y - 32, blocked);
    if (h.kind === 'lightning' && !blocked) { f.hitstun += 6; boltFx(f.x, f.y - 32, '#ffffff'); }
  }
}

function updateHazards() {
  if (!hazardsOn()) { HZ.list.length = 0; return; }
  if (--HZ.t <= 0) spawnHazard(ST.hazard);
  for (let i = HZ.list.length - 1; i >= 0; i--) {
    const h = HZ.list[i], H = HAZARDS[h.kind]; h.t++;
    if (h.phase === 'warn') {
      if (h.kind === 'lava' && h.t % 6 === 0) burst(h.x + rand(-20, 20), STAGE.y, hazCol(h), 1, 3, 20, 'dot');
      if (h.t >= H.warn) {
        h.phase = 'active'; h.t = 0;
        if (h.kind === 'lightning') { G.flash = Math.max(G.flash, 0.7); G.shake = Math.max(G.shake, 10); ring(h.x, STAGE.y, '#ffffff', 10, 14, 22, 6); burst(h.x, STAGE.y, '#cfe0ff', 20, 10, 20); }
        if (h.kind === 'lava') { G.shake = Math.max(G.shake, 6); burst(h.x, STAGE.y, hazCol(h), 24, 10, 30, 'dot'); }
        if (h.kind === 'flare') { G.flash = Math.max(G.flash, 0.4); G.shake = Math.max(G.shake, 5); }
        if (vehicle(h)) G.shake = Math.max(G.shake, h.kind === 'train' ? 7 : 4);
      }
      continue;
    }
    if (h.kind === 'icicle') {                                          // falls until it hits a fighter or a surface
      h.vy = Math.min(h.vy + 0.7, 16); h.y += h.vy;
      hazardHits(h);
      let land = h.y >= STAGE.y && h.x > STAGE.x && h.x < STAGE.x + STAGE.w;
      for (const p of PLATS) if (h.x > p.x && h.x < p.x + p.w && h.y >= p.y && h.y - h.vy <= p.y) land = true;
      if (land || h.hit.length || h.y > BZ.b) { shatter(h.x, h.y - 10, H.color, 12); HZ.list.splice(i, 1); }
      continue;
    }
    hazardHits(h);
    if (vehicle(h) && h.t % 2 === 0) { const r = hazardRect(h); pushFx({ type: 'cloud', x: r.x + (h.dir > 0 ? 0 : r.w), y: STAGE.y - 6, vx: -h.dir, vy: -0.4, life: 22, max: 22, color: 'rgba(200,200,215,0.45)', size: 9, drag: 0.96, g: 0 }); }
    if (h.kind === 'lava' && h.t % 2 === 0) burst(h.x + rand(-26, 26), STAGE.y - rand(0, 260), hazCol(h), 1, 3, 22, 'dot');
    if (h.t >= H.dur) HZ.list.splice(i, 1);
  }
}

// Forgotten Temple: platforms crack while someone stands on them, crumble away, then rebuild
const PHASE_CYCLE = 420, PHASE_OFF = 120;                 // Quantum Citadel: each phasing platform is gone for PHASE_OFF frames of every PHASE_CYCLE
function updatePlatforms() {
  if (ST.portals) updatePortals();
  for (const p of PLATS) {
    if (p.phase !== undefined) {                               // Quantum Citadel: phase out of reality on a cycle (flickering for a second first)
      const k = (G.frame + p.phase) % PHASE_CYCLE, was = p.downT > 0;
      p.downT = k >= PHASE_CYCLE - PHASE_OFF ? PHASE_CYCLE - k : 0;
      p.warn = !p.downT && k >= PHASE_CYCLE - PHASE_OFF - 60;
      if (p.downT && !was) { burst(p.x + p.w / 2, p.y, ST.pal.plat, 14, 5, 18, 'pixel'); ring(p.x + p.w / 2, p.y, ST.pal.glow, 10, 6, 14, 3); }
      if (!p.downT && was) burst(p.x + p.w / 2, p.y, '#ffffff', 10, 4, 14, 'pixel');
      continue;
    }
    if (!p.crumble) continue;
    if (p.downT > 0) {
      if (--p.downT === 0) { p.crack = 0; burst(p.x + p.w / 2, p.y, ST.pal.plat, 12, 4, 20, 'dot'); ring(p.x + p.w / 2, p.y + 4, ST.pal.glow, 10, 5, 14, 3); }
      continue;
    }
    const loaded = fighters.some(f => f.onGround && f.ground === 'plat' && Math.abs(f.y - p.y) < 1 && f.x + HW > p.x && f.x - HW < p.x + p.w);
    if (loaded) {
      p.crack = (p.crack || 0) + 1;
      if (p.crack % 12 === 0) burst(p.x + rand(10, p.w - 10), p.y + 8, '#8a7a5a', 2, 2, 18, 'dot');                // grit trickling out
      if (p.crack >= CRUMBLE_T) {                                                                                   // it gives way
        p.downT = CRUMBLE_BACK; p.crack = 0;
        shatter(p.x + p.w / 2, p.y + 6, '#a89a72', 26); dust(p.x + p.w / 2, p.y, 8); G.shake = Math.max(G.shake, 4);
        for (const f of fighters) if (f.onGround && f.ground === 'plat' && Math.abs(f.y - p.y) < 1 && f.x + HW > p.x && f.x - HW < p.x + p.w) { f.onGround = false; f.ground = null; }
      }
    } else if (p.crack > 0) p.crack = Math.max(0, p.crack - 0.5);                                                   // settles back slowly
  }
}

// Astral Void: touching one time-warp portal throws you out of the other, keeping your momentum
function updatePortals() {
  const P = ST.portals;
  for (const f of fighters) {
    if (f.portalCD > 0) { f.portalCD--; continue; }
    if (f.state === 'dead' || f.state === 'respawn' || f.state === 'ledge' || f.state === 'climb' || f.state === 'grabbed') continue;
    for (let i = 0; i < 2; i++) {
      const a = P[i], b = P[1 - i];
      if (Math.hypot(f.x - a.x, f.y - 32 - a.y) > 30) continue;
      ring(a.x, a.y, ST.pal.edge, 10, 8, 18, 4); burst(a.x, a.y, ST.pal.glow, 14, 6, 18);
      f.x = b.x + (b.x < 640 ? 1 : -1) * 6; f.y = b.y + 32; f.portalCD = 45; f.px = f.x; f.py = f.y;   // (no interpolation smear across the warp)
      if (Math.abs(f.vx) < 3) f.vx = (b.x < 640 ? 1 : -1) * 3;                                          // nudge out toward the stage
      f.vy = Math.min(f.vy, -4);
      ring(b.x, b.y, ST.pal.edge, 10, 8, 18, 4); starFx(b.x, b.y, '#ffffff', 40); textFx('WARP', b.x, b.y - 50, ST.pal.edge);
      break;
    }
  }
}

// For the CPU: which way to step to get out of a telegraphed hazard (0 = safe), and whether to jump / drop
function hazardDanger(f) {
  for (const h of HZ.list) {
    if (h.kind === 'icicle') { if (h.phase === 'warn' && Math.abs(f.x - h.x) < 40) return { dir: f.x < h.x ? -1 : 1 }; continue; }
    const r = hazardRect(h), b = bodyRect(f);
    if (!overlap({ x: r.x - 16, y: r.y, w: r.w + 32, h: r.h }, b)) continue;
    if (h.kind === 'flare' || vehicle(h)) return { dir: 0, jump: f.onGround, drop: h.kind === 'flare' && !f.onGround };
    return { dir: f.x < h.x ? -1 : 1 };
  }
  return null;
}

/* ---- drawing (world space) ---- */
function drawHazards() {
  const t = G.time;
  for (const h of HZ.list) {
    const H = HAZARDS[h.kind], r = hazardRect(h), warn = h.phase === 'warn', k = warn ? h.t / H.warn : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (h.kind === 'lava') {
      const C = hazCol(h);
      if (warn) {                                                       // bubbling crack that grows brighter
        ctx.fillStyle = rgba(C, 0.2 + 0.5 * k * (0.6 + 0.4 * Math.sin(t * 0.5)));
        ctx.beginPath(); ctx.ellipse(h.x, STAGE.y, 20 + 22 * k, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([8, 8]); ctx.strokeStyle = rgba(C, 0.25 * k); ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else {                                                          // erupting geyser
        const u = clamp(h.t / 8, 0, 1), fade = clamp((H.dur - h.t) / 10, 0, 1), top = STAGE.y - r.h * u;
        const g = ctx.createLinearGradient(0, top, 0, STAGE.y); g.addColorStop(0, rgba(lighten(C, 0.55), 0.9 * fade)); g.addColorStop(0.4, rgba(C, 0.85 * fade)); g.addColorStop(1, rgba(darken(C, 0.3), 0.7 * fade));
        ctx.fillStyle = g; ctx.shadowColor = C; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(h.x - 30, STAGE.y);
        for (let y = STAGE.y; y > top; y -= 20) ctx.lineTo(h.x - 26 - Math.sin(y * 0.05 + t * 0.4) * 6, y);
        ctx.quadraticCurveTo(h.x, top - 30, h.x + 26, top);
        for (let y = top; y < STAGE.y; y += 20) ctx.lineTo(h.x + 26 + Math.sin(y * 0.05 + t * 0.4 + 2) * 6, y);
        ctx.closePath(); ctx.fill();
      }
    } else if (h.kind === 'lightning') {
      if (warn) {                                                       // target reticle + flickering pre-strike
        ctx.strokeStyle = rgba('#cfe0ff', 0.3 + 0.6 * k); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(h.x, STAGE.y, 34 - 10 * k, 8, 0, 0, Math.PI * 2); ctx.stroke();
        if ((t >> 2) & 1) { ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#cfe0ff'; ctx.fillRect(h.x - 2, r.y, 4, r.h); }
      } else {                                                          // jagged bolt
        const fade = 1 - h.t / H.dur; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#9db8ff'; ctx.shadowBlur = 30; ctx.lineJoin = 'round';
        for (const [w, a] of [[14, 0.25], [6, 0.6], [2.5, 1]]) {
          ctx.globalAlpha = a * fade; ctx.lineWidth = w; ctx.beginPath(); let x = h.x; ctx.moveTo(x, r.y);
          for (let y = r.y; y < STAGE.y; y += 40) { x = h.x + hash(y + h.x + (h.t >> 1)) * 40 - 20; ctx.lineTo(x, y); }
          ctx.lineTo(h.x, STAGE.y); ctx.stroke();
        }
      }
    } else if (h.kind === 'flare') {
      if (warn) {                                                       // dashed warning band
        ctx.fillStyle = rgba('#ffd36e', 0.06 + 0.12 * k); ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([18, 12]); ctx.lineDashOffset = -t * 2 * h.dir; ctx.strokeStyle = rgba('#ffd36e', 0.3 + 0.5 * k); ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else {                                                          // searing beam
        const fade = clamp((H.dur - h.t) / 8, 0, 1), g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, rgba('#ff8a2a', 0)); g.addColorStop(0.5, rgba('#fff4c8', 0.95 * fade)); g.addColorStop(1, rgba('#ff8a2a', 0));
        ctx.fillStyle = g; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 40; ctx.fillRect(r.x, r.y - 10, r.w, r.h + 20);
      }
    } else if (h.kind === 'train') {                                    // Neon Subways: platform lights flash, the tunnel glows... then a train blasts through
      const y = STAGE.y;
      if (warn) {
        const on = (t >> 3) & 1, ex = h.dir > 0 ? BZ.l + 40 : BZ.r - 40, g = ctx.createRadialGradient(ex, y - 40, 4, ex, y - 40, 120 + 260 * k);
        g.addColorStop(0, rgba('#e8fbff', 0.55 * k)); g.addColorStop(1, rgba('#3df0ff', 0)); ctx.fillStyle = g; ctx.fillRect(ex - 400, y - 300, 800, 340);
        ctx.fillStyle = on ? 'rgba(255,60,90,0.9)' : 'rgba(255,60,90,0.25)'; for (let x = STAGE.x + 20; x < STAGE.x + STAGE.w; x += 60) ctx.fillRect(x, y - 3, 22, 3);   // edge warning strip
        ctx.setLineDash([10, 10]); ctx.lineDashOffset = -t * 6 * h.dir; ctx.strokeStyle = rgba('#3df0ff', 0.2 + 0.5 * k); ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else {
        const x0 = r.x, d = h.dir; ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 6; i++) { ctx.strokeStyle = rgba(i % 2 ? '#3df0ff' : '#ffffff', 0.35); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(d > 0 ? x0 : x0 + r.w, y - 10 - i * 10); ctx.lineTo(d > 0 ? x0 - 260 : x0 + r.w + 260, y - 10 - i * 10); ctx.stroke(); }   // light smear behind it
        const body = ctx.createLinearGradient(0, y - 66, 0, y); body.addColorStop(0, '#d8e0ec'); body.addColorStop(0.45, '#8a96aa'); body.addColorStop(1, '#2a3040');
        ctx.fillStyle = body; rr(x0, y - 64, r.w, 60, 14); ctx.fill();
        for (let c = 0; c < 4; c++) {                                   // carriages: windows lit from inside, gaps between cars
          const cx0 = x0 + c * (r.w / 4); ctx.fillStyle = '#10141e'; ctx.fillRect(cx0 + r.w / 4 - 3, y - 62, 6, 56);
          for (let w = 0; w < 5; w++) { ctx.fillStyle = 'rgba(255,240,200,0.85)'; ctx.fillRect(cx0 + 12 + w * 22, y - 52, 15, 16); }
        }
        ctx.fillStyle = '#3df0ff'; ctx.fillRect(x0, y - 30, r.w, 4);                                                       // neon livery stripe
        ctx.globalCompositeOperation = 'lighter'; const nose = d > 0 ? x0 + r.w : x0;
        const beam = ctx.createLinearGradient(nose, 0, nose + d * 240, 0); beam.addColorStop(0, 'rgba(230,250,255,0.7)'); beam.addColorStop(1, 'rgba(230,250,255,0)');
        ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(nose, y - 40); ctx.lineTo(nose + d * 240, y - 90); ctx.lineTo(nose + d * 240, y + 10); ctx.lineTo(nose, y - 20); ctx.closePath(); ctx.fill();
      }
    } else if (h.kind === 'traffic') {                                  // Neon Highway: headlights sweep in from the edge, then a car tears across
      const y = STAGE.y;
      if (warn) {
        const ex = h.dir > 0 ? STAGE.x : STAGE.x + STAGE.w, g = ctx.createRadialGradient(ex, y - 20, 4, ex, y - 20, 90 + 160 * k);
        g.addColorStop(0, rgba('#fff6d0', 0.5 * k)); g.addColorStop(1, rgba('#fff6d0', 0)); ctx.fillStyle = g; ctx.fillRect(ex - 260, y - 200, 520, 220);
        ctx.setLineDash([20, 14]); ctx.lineDashOffset = -t * 4 * h.dir; ctx.strokeStyle = rgba('#ffd23a', 0.25 + 0.5 * k); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(STAGE.x, y - 3); ctx.lineTo(STAGE.x + STAGE.w, y - 3); ctx.stroke();
      } else {
        const cx = r.x + r.w / 2, d = h.dir;
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 5; i++) { ctx.strokeStyle = rgba(i % 2 ? '#ff4d6d' : '#ffe9a0', 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - d * 60, y - 8 - i * 6); ctx.lineTo(cx - d * (140 + hash(i + t) * 80), y - 8 - i * 6); ctx.stroke(); }   // speed streaks
        ctx.save(); ctx.translate(cx, y); ctx.scale(d, 1);
        const body = ctx.createLinearGradient(0, -38, 0, -6); body.addColorStop(0, '#ff5a7a'); body.addColorStop(0.5, '#c0204a'); body.addColorStop(1, '#5a0a1e');
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-60, -10); ctx.lineTo(-58, -26); ctx.quadraticCurveTo(-30, -40, 0, -38); ctx.lineTo(30, -28); ctx.quadraticCurveTo(56, -24, 62, -14); ctx.lineTo(62, -8); ctx.lineTo(-60, -8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(160,220,255,0.75)'; ctx.beginPath(); ctx.moveTo(-26, -30); ctx.quadraticCurveTo(-8, -38, 12, -34); ctx.lineTo(24, -27); ctx.lineTo(-26, -27); ctx.closePath(); ctx.fill();   // windscreen
        ctx.fillStyle = '#101018'; for (const wx of [-36, 38]) { ctx.beginPath(); ctx.arc(wx, -8, 9, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#fff6d0'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff6d0'; ctx.fillRect(56, -20, 7, 5);   // headlight
        const beam = ctx.createLinearGradient(62, 0, 220, 0); beam.addColorStop(0, 'rgba(255,246,208,0.55)'); beam.addColorStop(1, 'rgba(255,246,208,0)');
        ctx.shadowBlur = 0; ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(62, -20); ctx.lineTo(220, -46); ctx.lineTo(220, 4); ctx.lineTo(62, -14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff2f57'; ctx.shadowColor = '#ff2f57'; ctx.shadowBlur = 16; ctx.fillRect(-62, -20, 5, 5);                                         // tail-light
        ctx.restore();
      }
    } else {                                                            // icicle: shaking at the top, then falling
      ctx.globalCompositeOperation = 'source-over';
      const x = h.x + (warn ? Math.sin(t * 1.3) * 2 : 0);
      if (warn) { ctx.globalAlpha = 0.3 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(h.x, STAGE.y, 14, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#dff6ff'; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#9fe4ff'; ctx.shadowBlur = 14; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 10, h.y - 34); ctx.lineTo(x + 10, h.y - 34); ctx.lineTo(x, h.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}
