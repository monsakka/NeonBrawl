/* NEON BRAWL — Movement, gravity, landing, wall bounce, tech. */
'use strict';

/* ============================== PHYSICS ============================= */
// (f.scale: the Giant Boss is 3× — its collision width and height scale with it)
const fHW = f => HW * (f.scale || 1), fBH = f => BODY_H * (f.scale || 1);
const inStageBox = f => f.y > STAGE.y && f.y - fBH(f) < STAGE.y + STAGE.h && f.x + fHW(f) > STAGE.x && f.x - fHW(f) < STAGE.x + STAGE.w;

// Tech: tapping shield just before touching ground / wall in hit-stop cancels the bounce
function techNow(f) {
  f.state = 'free'; f.hitstun = 0; f.rot = 0; f.techT = 0; f.invuln = Math.max(f.invuln, 10); f.sx = 1.2; f.sy = 0.8; f.techPoseT = 12; f.missT = 0;
  ring(f.x, f.y - 10, '#ffffff', 8, 6, 16, 4); textFx('TECH', f.x, f.y - 86, '#ffffff');
}
function wallBounce(f) {
  if (f.state === 'hitstun' && f.techT > 0) { techNow(f); f.vx = 0; f.bonk = true; return; }
  f.vx = f.state === 'hitstun' ? -f.vx * 0.45 : 0; f.bonk = true;
}

function physics(f, grav, maxFall) {
  const prevY = f.y, HW = fHW(f), BODY_H = fBH(f);
  f.bonk = false;
  if (ST.wind && !f.onGround && f.state !== 'ledge' && f.state !== 'respawn') f.vx += ST.wind;   // the Runaway Train's slipstream pushes airborne fighters toward the rear
  f.x += f.vx;
  const prevX = f.x - f.vx;
  if (inStageBox(f)) {                                         // side walls of the main platform
    if (prevX + HW <= STAGE.x + 0.5) { f.x = STAGE.x - HW; wallBounce(f); }
    else if (prevX - HW >= STAGE.x + STAGE.w - 0.5) { f.x = STAGE.x + STAGE.w + HW; wallBounce(f); }
  }
  f.vy = Math.min(f.vy + grav, maxFall);
  f.y += f.vy;
  f.onGround = false; f.ground = null;
  let landed = false;
  if (inStageBox(f)) {
    if (prevY <= STAGE.y + 0.5 && f.vy >= 0) { f.y = STAGE.y; f.ground = 'stage'; landed = true; }
    else if (prevY - BODY_H >= STAGE.y + STAGE.h - 0.5) {
      f.y = STAGE.y + STAGE.h + BODY_H; f.vy = f.state === 'hitstun' && f.vy < 0 ? -f.vy * 0.4 : 0; f.bonk = true;
    } else { f.x = f.x < STAGE.x + STAGE.w / 2 ? STAGE.x - HW : STAGE.x + STAGE.w + HW; f.vx = 0; f.bonk = true; }
  }
  if (!landed && f.vy >= 0 && f.dropT <= 0) {                  // one-way floating platforms
    for (const p of PLATS) {
      if (!platUp(p)) continue;                                  // (a crumbled Forgotten Temple ledge)
      if (f.ch.platPhase && f.padHold) continue;                 // Matrix: holding down phases straight through platforms
      if (f.x + HW > p.x && f.x - HW < p.x + p.w && prevY <= p.y + 0.5 && f.y >= p.y) { f.y = p.y; f.ground = 'plat'; landed = true; break; }
    }
    if (!landed) for (const p of tempPlats()) {                  // Tempest's thunderclouds are standable
      if (f.x + HW > p.x && f.x - HW < p.x + p.w && prevY <= p.y + 0.5 && f.y >= p.y) { f.y = p.y; f.ground = 'plat'; landed = true; break; }
    }
  }
  if (landed && f.ground === 'plat' && f.state !== 'hitstun' && !f.padHold) {       // Starfighter Dock: launch pads fling you upward
    const pad = PLATS.find(p => p.launch && platUp(p) && Math.abs(p.y - f.y) < 1 && f.x + HW > p.x && f.x - HW < p.x + p.w);
    if (pad) { f.vy = -pad.launch; f.y -= 2; f.jumps = Math.max(f.jumps, f.ch.airJumps); ring(f.x, f.y, ST.pal.glow, 10, 7, 16, 4); burst(f.x, f.y, ST.pal.plat, 10, 6, 14); f.flipT = 20; return; }
  }
  if (landed) onLand(f, f.vy);
}

function onLand(f, impact) {
  if (impact > 3) gameEvent('land', { f, impact });
  f.onGround = true; f.vy = 0; f.jumps = f.ch.airJumps + (G.party && G.party.jumps ? G.party.jumps : 0); f.helpless = false;   // (Feather Fall: +2 air jumps) f.specialUsed = false; f.airDashN = 0; f.hoverT = f.ch.hover || 0;
  if (f.state === 'hitstun' && f.techT > 0) { techNow(f); f.vx *= 0.3; if (f.lastDir) { startRoll(f, f.lastDir); f.rollTech = true; } return; }   // hold A/D to tech-roll
  if (f.state === 'hitstun' && impact > 7.5) {                 // meteor / hard-landing bounce
    f.vy = -impact * 0.5; f.onGround = false; f.ground = null; f.y -= 1; f.missT = 30;      // missed the tech: knocked flat
    burst(f.x, f.y, '#ffffff', 10, 6, 18); G.shake = Math.max(G.shake, 5); return;
  }
  if (impact > 4) { f.sx = 1 + Math.min(0.75, impact * 0.065); f.sy = 1 - Math.min(0.5, impact * 0.05); f.svx = f.svy = 0; }   // squash on landing (the spring then bounces it back up)
  if (impact >= 14 && f.state !== 'ultimate') { f.sx = 1.62; f.sy = 0.42; f.pancakeT = 2; }                 // heavy landing: squashed flat as a pancake for two frames
  if (impact > 6) { f.landT = 6; dust(f.x, f.y, 6); }
  if (impact > 11) { ring(f.x, f.y, '#ffffff', 8, 7, 16, 3); pushFx({ type: 'wave', x: f.x, y: f.y, ang: Math.PI / 2, r: 6, dr: 8, life: 14, max: 14, color: f.color, vx: 0, vy: 0, drag: 1, g: 0 }); }   // heavy-landing shockwave
}
