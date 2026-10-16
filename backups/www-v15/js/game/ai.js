/* NEON BRAWL — CPU opponent AI. */
'use strict';

/* ================================ CPU AI ============================ */
// Is `o`'s current attack about to hit `f`?
function inDanger(f, o) {
  if (o.state !== 'attack' || !o.move) return false;
  const hb = hitboxRect(o, o.move), b = bodyRect(f);
  b.x -= 12; b.y -= 12; b.w += 24; b.h += 24;
  return overlap(hb, b);
}
// Incoming enemy projectile; `tight` only reports it when a parry would be well-timed
function projThreat(f, tight) {
  for (const p of projs) {
    if (p.owner === f) continue;
    const dx = f.x - p.x;
    const lim = tight ? Math.abs(p.vx) * 5 + 55 : Math.abs(p.vx) * 7 + 30;
    if (sign(dx) === sign(p.vx) && Math.abs(dx) < lim && Math.abs((f.y - 32) - p.y) < 50) return p;
  }
  return null;
}
function floorDist(f) {                                  // distance to the nearest surface below (for teching)
  let best = 1e9;
  if (f.x > STAGE.x - HW && f.x < STAGE.x + STAGE.w + HW && f.y <= STAGE.y + 1) best = STAGE.y - f.y;
  for (const p of PLATS) if (platUp(p) && f.x > p.x - HW && f.x < p.x + p.w + HW && f.y <= p.y + 1) best = Math.min(best, p.y - f.y);
  return best;
}

function aiInput(f, o) {
  if (G.volley) return volleyAI(f);                                       // v14 Volley Brawl: the CPU plays the ball (game/minigames.js)
  const a = f.ai || (f.ai = { t: 0, cd: 0, shieldT: 0, offT: 0, ledgeWait: 30, rdir: 1, reactT: 0, aggroT: 0, comboWin: 0, gimpT: 0, techTried: false });
  const D = DIFFS[G.diff], S = STAGE, c = f.ch, midX = S.x + S.w / 2;
  const lvl = G.diff, easy = lvl === 0, hard = lvl >= 2, extreme = lvl === 3;
  const inp = emptyInput();
  a.t++; if (a.cd > 0) a.cd--; if (a.gimpT > 0) a.gimpT--;
  if (o.state === 'hitstun') a.comboWin = 20; else if (a.comboWin > 0) a.comboWin--;
  const aimTo = (x, y) => { inp.aimX = x - f.x; inp.aimY = y - (f.y - 32); };
  aimTo(o.x, o.y - 32);
  const dx = o.x - f.x, dy = o.y - f.y, adx = Math.abs(dx);
  const g = f.onGround, free = f.state === 'free';
  const oppOff = (!o.onGround && (o.x < S.x - 20 || o.x > S.x + S.w + 20 || o.y > S.y + 10)) || o.state === 'dead' || o.state === 'respawn';
  const oppLedge = o.state === 'ledge';
  const punish = (o.state === 'lag' || o.state === 'stunned') && adx < 120;
  const aimForAttack = () => {
    if (dy < -70 && adx < 90) { inp.aimX = 0; inp.aimY = -100; }
    else if (dy > 70 && adx < 90) { inp.aimX = 0; inp.aimY = 100; }
    else { inp.aimX = (dx >= 0 ? 1 : -1) * Math.max(80, adx); inp.aimY = 0; }
  };
  const strike = heavy => { aimForAttack(); inp.lightP = !heavy; inp.heavyP = heavy; a.cd = D.cd[0] + Math.random() * (D.cd[1] - D.cd[0]); };
  // Ultimate: fired when the meter is full and the opponent is where this fighter's Ultimate will reach (game/ultimate.js)
  if (free && ultCanStart(f) && ultAIWants(f, o) && Math.random() < [0.02, 0.06, 0.16, 0.35][lvl]) { inp.ultP = true; return inp; }
  if (free && !extreme && aiEmote(f, o, inp)) return inp;                    // a cheeky taunt after taking a stock (game/emotes.js)

  switch (f.state) {
    case 'respawn': if (f.respT > 70) { inp.left = a.rdir < 0; inp.right = a.rdir > 0; } return inp;
    case 'ledge':
      if (f.ledgeT === 1) a.ledgeWait = (hard ? 8 : 20) + (Math.random() * 40 | 0);
      if (f.ledgeT > a.ledgeWait) {
        const r = Math.random();                                         // mix up ledge options: climb · roll · jump
        if (r < 0.45) { inp.right = f.ledge.side < 0; inp.left = f.ledge.side > 0; } else if (r < 0.7) inp.shield = true; else inp.jumpP = true;
      }
      return inp;
    case 'hitstun': {
      // Directional influence: steer toward the stage so strong launches are survivable
      if (Math.random() < D.di) {
        const toward = f.x < midX ? 1 : -1;
        if (!(Math.abs(f.vy) > Math.abs(f.vx) * 2 && f.x > S.x && f.x < S.x + S.w)) { inp.right = toward > 0; inp.left = toward < 0; }
      }
      // Tech: tap shield a few frames before touching the floor
      if (!a.techTried && D.tech > 0 && f.vy > 2) {
        const d = floorDist(f);
        if (d >= 0 && d < f.vy * 4 + 8) { a.techTried = true; if (Math.random() < D.tech) inp.shield = true; }
      }
      return inp;
    }
    case 'grabbed': if (a.t % 5 === 0) inp.lightP = true; return inp;
    case 'wall':                                                   // Apex: hang on briefly, then wall-jump back up
      inp.right = f.wallSide < 0; inp.left = f.wallSide > 0;
      if (f.stateT > (hard ? 6 : 18)) inp.jumpP = true;
      return inp;
    case 'holding':
      if (f.holdT === 1) a.throwDir = ['f', 'f', 'b', 'u', 'd'][Math.floor(Math.random() * 5)];
      if (f.holdT === 20 + (D.react >> 1)) {
        inp.lightP = true; const fd = f.facing;
        if (a.throwDir === 'f') { inp.aimX = fd * 100; inp.aimY = 0; } else if (a.throwDir === 'b') { inp.aimX = -fd * 100; inp.aimY = 0; }
        else if (a.throwDir === 'u') { inp.aimX = 0; inp.aimY = -100; } else { inp.aimX = 0; inp.aimY = 100; }
      }
      return inp;
    case 'attack':
      a.techTried = false;
      if (f.move && f.move.chain && f.hitDone && Math.random() < D.chain) inp.lightP = true;
      return inp;
    case 'free': case 'special': a.techTried = false; break;
    default: return inp;
  }

  if (f.blindT > 0 && !isOffStage(f) && Math.random() < 0.55) {           // blinded by Orin's flash: stumbling around instead of fighting
    if (a.t % 20 < 10) inp.left = true; else inp.right = true;
    return inp;
  }
  /* ---------- off-stage: gimp attempts, then recovery ---------- */
  if (isOffStage(f)) {
    a.offT++;
    if (D.gimp && a.gimpT > 0 && free) {                         // EXTREME: chase the opponent off-stage and spike them
      const near = adx < 130 && Math.abs(dy) < 130;
      if (near && a.cd <= 0) {
        if (dy > 30) { inp.aimX = 0; inp.aimY = 100; inp.heavyP = true; } else { aimForAttack(); inp.lightP = true; }
        a.cd = 10; return inp;
      }
      inp.right = dx > 0; inp.left = dx < 0;
      if (f.vy > 1 && f.jumps > 0 && dy < -40 && Math.random() < 0.2) inp.jumpP = true;
      if (dy > 40) inp.down = true;                                // EXTREME: fast-fall to catch them
      return inp;
    }
    if (a.offT >= D.recDelay) {
      const L = f.x < midX ? LEDGES[0] : LEDGES[1], toward = f.x < midX ? 1 : -1;
      inp.right = toward > 0; inp.left = toward < 0;
      if (c.jet) inp.jump = f.y > S.y - 70 || f.vy > 2;                 // Mecha: burn fuel to climb back
      if (c.hover) inp.jump = f.vy > 0 && f.y < S.y + 40;               // Solaris: float toward the ledge
      if (free && c.special.type === 'rewind' && f.spCD <= 0 && f.hist.length > 30) {        // Chrono: rewind to solid ground
        const past = f.hist[f.hist.length - 1 - Math.min(c.special.back, f.hist.length - 1)];
        if (past.g || (past.x > S.x && past.x < S.x + S.w && past.y <= S.y)) inp.specialP = true;
      }
      if (free) {
        const low = f.y > S.y - 20;
        if (low && f.vy > 1 && f.jumps > 0 && (D.optimal || Math.random() < 0.25)) inp.jumpP = true;
        if (low && f.jumps <= 0 && !f.specialUsed && !f.helpless && f.vy > -2 && f.y > S.y + 25 && !c.special.norecover && (!c.special.flat || f.y < S.y + 90) && Math.random() < D.rec) {
          inp.specialP = true;
          if (D.optimal) aimTo(L.x + L.side * 4, L.y + 30);      // exact line to the ledge
          else aimTo(midX, S.y - 80);                              // rough "up and over"
        }
        // up-special recovery (Mecha out of fuel, Volt too low for its flat dash): aim straight up, drifting toward the stage
        if (inp.specialP !== true && c.special.up && low && f.jumps <= 0 && !f.specialUsed && !f.helpless && f.vy > -2 && f.y > S.y + 30 &&
            (!c.jet || f.fuel < 8) && Math.random() < D.rec) { inp.specialP = true; aimTo(f.x + toward * 40, f.y - 200); }
      }
    }
    return inp;
  }
  a.offT = 0;

  /* ---------- defense: shield / parry ---------- */
  if (a.shieldT > 0) {
    inp.shield = true; a.shieldT--; if (f.shield < 25) a.shieldT = 0;
    if (a.shieldT > 0) return inp;
  }
  if (g && free && c.special.type === 'decoy' && f.spCD <= 0 && inDanger(f, o) && Math.random() < (hard ? 0.5 : 0.15)) {   // Mirage: leave a decoy and slip away
    aimTo(f.x - sign(dx || 1) * 160, f.y - 32); inp.specialP = true; return inp;
  }
  if (free && c.special.type === 'counter' && f.spCD <= 0 && o.state === 'attack' && o.move && inDanger(f, o) && o.stateT < o.move.s &&
      Math.random() < (hard ? 0.35 : 0.1)) { aimTo(o.x, o.y - 32); inp.specialP = true; return inp; }   // Paladin: read the swing and counter it
  if (g && free && c.special.type === 'root' && !(f.rootT > 0) && f.spCD <= 0 && (inDanger(f, o) || (o.state === 'attack' && adx < 140)) && Math.random() < (hard ? 0.35 : 0.12)) {   // Titanis: dig in
    inp.specialP = true; return inp;
  }
  if (free && f.rootT > 0 && (adx > 260 || isOffStage(o)) && Math.random() < 0.05) { inp.specialP = true; return inp; }   // ...and uproot when they keep away
  if (free && c.special.type === 'meditate' && f.spCD <= 0 && (inDanger(f, o) || projThreat(f, false)) && Math.random() < (hard ? 0.3 : 0.1)) {   // Zenith: meditate through the hit
    inp.specialP = true; return inp;
  }
  if (free && c.special.type === 'wall' && f.spCD <= 0 && (projThreat(f, false) || (o.state === 'attack' && adx < 150)) && Math.random() < (hard ? 0.4 : 0.12)) {   // Aegis: wall up
    aimTo(o.x, o.y - 32); inp.specialP = true; return inp;
  }
  if (g && free) {
    if (D.parry > 0) {                                           // HARD / EXTREME: time the shield so the hit lands inside the parry window
      if (o.state === 'attack' && o.move && inDanger(f, o)) {
        const rem = o.move.s - o.stateT;
        if (rem <= (extreme ? 4 : 5) && rem >= 0 && Math.random() < D.parry) { a.shieldT = rem + 5; inp.shield = true; return inp; }
      }
      if (projThreat(f, true) && Math.random() < D.parry) { a.shieldT = 7; inp.shield = true; return inp; }
    } else {
      if (o.state === 'attack' && o.stateT === 1 && adx < 130 && Math.abs(dy) < 90 && Math.random() < D.shield) a.reactT = D.react;
      if (a.reactT > 0 && --a.reactT === 0) { a.shieldT = 14 + (Math.random() * 20 | 0); inp.shield = true; return inp; }
    }
  }

  /* ---------- stage hazards: get out of anything that's telegraphing ---------- */
  const hz = free && !easy ? hazardDanger(f) : null;
  if (hz && Math.random() < (hard ? 1 : 0.6)) {
    if (hz.dir) { inp.right = hz.dir > 0; inp.left = hz.dir < 0; if (g && Math.random() < D.dash * 4) inp.dash = hz.dir; }
    if (hz.jump && g) inp.jumpP = true;
    if (hz.drop && f.vy > 0) inp.down = true;
    if (hz.down) inp.down = true;                                                  // (a low bridge: drop off the high platforms)
    return inp;
  }

  /* ---------- positioning ---------- */
  if (easy) { if (a.aggroT > 0) a.aggroT--; else if (Math.random() < 0.004) a.aggroT = 70; }
  const gimpOpp = D.gimp && oppOff && !oppLedge && o.state !== 'dead' && o.state !== 'respawn' && o.y > S.y - 20 && f.jumps > 0 && f.shield > 20;
  let tx;
  if (oppOff && D.edge) { const L = o.x < midX ? LEDGES[0] : LEDGES[1]; tx = L.x - L.side * (gimpOpp ? 10 : c.zoner ? 70 : 32); }   // edge-guard
  else if (c.zoner && !punish) tx = o.x + (f.x < o.x ? -1 : 1) * (easy ? c.aiSpace - 60 : c.aiSpace);                                // zoner: keep range
  else if (easy && a.aggroT <= 0) tx = o.x + (f.x < o.x ? -1 : 1) * 180;                                                                // passive spacing
  else tx = o.x;
  tx = clamp(tx, S.x + 30, S.x + S.w - 30);
  const dxT = tx - f.x;
  if (free && Math.abs(dxT) > (oppOff ? 12 : 40)) {
    inp.right = dxT > 0; inp.left = dxT < 0;
    if (g && Math.abs(dxT) > 230 && Math.random() < D.dash) inp.dash = sign(dxT);
  }
  if (gimpOpp && g && free) {                                    // jump off the ledge after them
    const L = o.x < midX ? LEDGES[0] : LEDGES[1];
    if (Math.abs(f.x - L.x) < 46 && adx < 280) { inp.jumpP = true; inp.right = L.side > 0; inp.left = L.side < 0; a.gimpT = 28; }
  }
  if (g && dy < -90 && adx < 150 && Math.random() < 0.08) inp.jumpP = true;                            // go after platform campers
  if (!g && free && !easy && f.jumps > 0 && dy < -70 && f.vy > 0 && Math.random() < 0.2) inp.jumpP = true;
  if (extreme && g && o.state === 'hitstun' && dy < -80 && adx < 120) inp.jumpP = true;                // EXTREME: jump after juggled opponents
  if (f.ground === 'plat' && dy > 70 && adx < 150) inp.down = true;                                    // drop through
  if (g && f.ground === 'plat' && (f.x < S.x - 2 || f.x > S.x + S.w + 2)) {                            // hop off side platforms toward the stage
    const p = PLATS.find(p => f.x >= p.x && f.x <= p.x + p.w);
    if (p) {
      const toward = f.x < midX ? 1 : -1; inp.right = toward > 0; inp.left = toward < 0;
      if (Math.abs((toward > 0 ? p.x + p.w : p.x) - f.x) < 24) inp.jumpP = true;
    }
  }

  /* ---------- offense ---------- */
  if (free && a.cd <= 0) {
    const reach = c.aiRange * (f.scale || 1) + (oppLedge ? 20 : 0);                    // (a giant's attacks reach 3× as far)
    const near = adx < reach && Math.abs(dy) < 80;
    const above = dy < -70 && dy > -190 && adx < 70;
    const chase = hard && (o.state === 'hitstun' || a.comboWin > 0) && (near || above) && !oppOff;       // HARD: keep the combo going / reset it
    const heavyRoll = Math.random() < D.heavy + (o.percent > 90 && hard ? 0.4 : 0) + (o.state === 'shield' ? 0.3 : 0);
    if (punish) strike(true);
    else if (oppLedge && D.edge) { if (o.invuln <= 3 && adx < 120 && Math.abs(dy) < 120) strike(hard); }
    else if (oppOff && D.edge) { if (adx < 110 && Math.abs(dy) < 110 && Math.random() < 0.5) strike(hard && o.percent > 60); }
    else if (c.zoner && adx > 170 && f.projCD <= 0 && f.spCD <= 0 && Math.random() < D.orb * 0.12) {    // zoner: projectile pressure
      const S = c.special, spd = S.orb ? S.orb.speed : S.speed, t = adx / spd;
      const drop = S.grav ? 0.5 * S.grav * t * t : 0;                                                   // Orion: aim above to allow for the arrow's arc
      aimTo(o.x + (hard ? o.vx * t : 0), o.y - 32 - drop);
      inp.specialP = true; a.cd = D.cd[0] + 6;
    }
    else if (c.special.ranged && !c.zoner && f.spCD <= 0 && adx > 110 && adx < (c.special.range || 560) && Math.abs(dy) < 170 && Math.random() < D.orb * 0.08) {   // ranged specials: laser, star, jet, volley, tendril
      const S = c.special, lead = S.type === 'star' ? (S.delay + S.wind) * 0.6 : 0;
      const tt = adx / (S.speed || 1), drop = S.grav ? 0.5 * S.grav * tt * tt : 0;                       // Magma: lob above the target to allow for the arc
      aimTo(o.x + o.vx * lead, o.y - 32 - Math.min(drop, 260)); inp.specialP = true; a.cd = D.cd[0] + 8;
    }
    else if (c.special.type === 'sink' && g && f.spCD <= 0 && adx > 120 && adx < 380 && Math.abs(dy) < 40 && Math.random() < D.aggr * 0.06) {   // Umbra: slip under the floor toward them
      inp.specialP = true; a.cd = D.cd[0] + 10;
    }
    else if (c.special.type === 'temper' && g && f.spCD <= 0 && !(f.heatN > 0) && adx > 170 && Math.random() < D.aggr * 0.08) { inp.specialP = true; a.cd = D.cd[0] + 10; }   // Forge: heat the hammer at range
    else if (c.special.type === 'warcry' && g && f.spCD <= 0 && !(f.buffT > 0) && adx > 140 && adx < 420 && Math.random() < D.aggr * 0.08) {   // Valkyrie: power up from a safe distance
      aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 10;
    }
    else if (c.special.type === 'warcry' && !g && (f.airDashN || 0) < c.special.airDashes && !oppOff && adx > 90 && adx < 260 && Math.abs(dy) < 160 && Math.random() < D.aggr * 0.05) {   // ...or wing-dash in on them
      aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 10;
    }
    else if (c.special.type === 'grab' && g && adx < 85 * (c.special.reach || 1) && Math.abs(dy) < 60 && Math.random() < 0.3) { aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 14; }     // grappler / Toxin's long snare
    else if (c.special.type === 'tele' && g && adx > 95 && adx < 210 && Math.abs(dy) < 90 && Math.random() < D.aggr * 0.06) { aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 10; }   // assassin: teleport strike
    else if (c.special.type === 'dive' && !f.specialUsed && !oppOff &&                                     // Apex: dive-kick from above / leap-dive from range
             ((!g && dy > 40 && adx < 150) || (g && adx > 110 && adx < 240 && Math.abs(dy) < 60)) && Math.random() < D.aggr * 0.12) {
      aimTo(o.x + o.vx * 6, o.y - 20); inp.specialP = true; a.cd = D.cd[0] + 10;
    }
    else if ((c.special.type === 'phase' || c.special.type === 'glitch') && g && adx > 110 && adx < 240 && Math.abs(dy) < 90 && Math.random() < D.aggr * 0.05) {   // Nyx / Glitch: blink in
      aimTo(o.x + sign(o.x - f.x) * (c.special.type === 'phase' ? 60 : 0), o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 10;
    }
    else if (c.special.kineticBoost && f.kin > 60 && g && adx < 220 && Math.abs(dy) < 60 && Math.random() < D.aggr * 0.1) { aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 10; }   // Surge: unload
    else if (c.special.aiMelee && f.spCD <= 0 && !oppOff && (near || ((c.special.type === 'gust' || c.special.type === 'sonic') && adx < 170 && Math.abs(dy) < 120)) &&    // close-range specials
             (g || c.special.type !== 'stomp' || dy > 30) && Math.random() < D.aggr * 0.12) {
      aimTo(o.x, o.y - 32); inp.specialP = true; a.cd = D.cd[0] + 12;
    }
    else if (chase) { strike(extreme ? o.percent > 95 : o.percent > 110); a.cd = 3; }
    else if ((near || above) && !oppOff && Math.random() < D.aggr * 0.35) strike(heavyRoll);
  }
  return inp;
}
