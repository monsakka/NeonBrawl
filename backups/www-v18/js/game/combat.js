/* NEON BRAWL — Hits, knockback, shields, parry, attacks, specials, grabs, ledges, KO. */
'use strict';

/* ============================ COMBAT CORE =========================== */
const canBeHit = v => v.invuln <= 0 && v.state !== 'dead' && v.state !== 'respawn' && v.state !== 'climb' && v.state !== 'grabbed' &&
                      v.state !== 'ultimate' && !(v.ultHeld > 0) &&                  // (an Ultimate's user and its held victim are untouchable)
                      !(v.hand && v.bs && v.bs.st === 'die');                         // (nor is a boss that's already exploding)

function releaseAll(v) {
  if (v.ledge) { v.ledge.owner = null; v.ledge = null; v.ledgeCD = 20; }
  if (v.state === 'holding' && v.grabbing) { const g = v.grabbing; g.state = 'free'; g.grabber = null; g.invuln = 12; v.grabbing = null; }
  if (v.state === 'grabbed' && v.grabber) { v.grabber.grabbing = null; v.grabber.state = 'lag'; v.grabber.lagT = 10; v.grabber = null; }
}

/* Launch a fighter. KB already includes base + damage% × scale. */
function launch(v, kb, ang, dir) {
  if (v.hand) { v.hitFlash = 6; v.hurt = 14; if (!(v.ultHeld > 0)) v.state = 'free'; return; }   // OMNI HAND has HP, not knockback (game/boss.js)
  releaseAll(v);
  const sp = kb * LAUNCH, r = ang * Math.PI / 180;
  v.vx = Math.cos(r) * sp * dir; v.vy = -Math.sin(r) * sp;
  v.state = 'hitstun'; v.stateT = 0; v.hitstun = Math.floor(kb * BALANCE.hitstunMul) + BALANCE.hitstunAdd;
  v.move = null; v.sp = null; v.hitFlash = 6; v.dashT = 0; v.combo = 0; v.sx = 1.35; v.sy = 0.72; v.techT = 0; v.frozenT = 0; v.inkTrap = false;
  if (v.vy < 0) { v.onGround = false; v.ground = null; v.y -= 1; }
}

function impactFx(px, py, kb, color) {
  burst(px, py, '#ffffff', 8, 9, 14); burst(px, py, color, 10, 12, 20); ring(px, py, '#ffffff', 6, 5, 12, 4);
  if (kb >= 14) { ring(px, py, color, 10, 8, 18, 5); starFx(px, py, color, 10 + kb); }
  if (kb >= 10) G.shake = Math.max(G.shake, 2 + (kb - 10) * 0.25);
  if (kb >= 16) G.shake = Math.max(G.shake, clamp(4 + (kb - 16) * 0.45, 4, 16));
  if (typeof heavySparks16 === 'function') heavySparks16(px, py, kb, color);                     // v16: massive glowing sparks on heavy connects
}

/* Parry: shield raised moments before impact. Negates the hit and stuns the attacker. */
function doParry(v, att, px, py) {
  v.parryFlash = 16; v.shield = Math.min(100, v.shield + 12); v.invuln = Math.max(v.invuln, 4);
  if (att) { att.state = 'lag'; att.lagT = 34; att.reelT = 34; att.move = null; att.sp = null; att.combo = 0; att.vx = (att.x < v.x ? -1 : 1) * 3; }
  ring(px, py, '#ffffff', 10, 10, 22, 5); ring(px, py, v.color, 6, 6, 20, 4); starFx(px, py, '#ffffff', 40);
  burst(px, py, '#ffffff', 14, 10, 16);
  textFx('PARRY!', v.x, v.y - 96, '#ffffff'); gameEvent('parry', { v, x: px, y: py });  G.hitstop = 6;G.shake = Math.max(G.shake, 5); G.flash = Math.max(G.flash, 0.25);
  if (v.ch.counter && att && !att.isHazard && canBeHit(att) && Math.abs(att.x - v.x) < 170) {   // Paladin: every parry fires a holy counter-strike
    textFx('COUNTER!', v.x, v.y - 120, '#fff1b8'); holyBeam(att.x, att.y);
    deliver(v, att, { dmg: 9, base: 8.5, scale: 0.1, ang: 40, hs: 8, heavy: true }, sign(att.x - v.x) || v.facing, att.x, att.y - 32, false);
  }
}
const parryWin = v => PARRY_WIN + (v.ch.parryBonus || 0);
// A pillar of holy light (Paladin's counters)
function holyBeam(x, y) { pushFx({ type: 'beam', x, y, life: 18, max: 18, color: '#fff1b8', vx: 0, vy: 0, drag: 1, g: 0 }); ring(x, y - 32, '#ffffff', 12, 9, 20, 5); }

// Zenith's meditation: a barrier that absorbs hits and reflects projectiles during the active window
const inMeditate = v => v.state === 'special' && v.sp && v.sp.type === 'meditate' && v.stateT >= v.sp.wind && v.stateT < v.sp.wind + v.sp.active;
// Paladin's counter stance: the incoming hit is negated and answered with a stronger strike
const inCounter =v => v.state === 'special' && v.sp && v.sp.type === 'counter' && !v.sp.countered && v.stateT >= v.sp.wind && v.stateT < v.sp.wind + v.sp.active;
function counterStrike(v, att, m, px, py) {
  const S = v.ch.special; v.sp.countered = v.stateT; v.invuln = Math.max(v.invuln, 14);
  ring(px, py, '#ffffff', 12, 10, 22, 6); starFx(px, py, '#fff1b8', 60); textFx('COUNTER!', v.x, v.y - 110, '#fff1b8');
  G.hitstop = 8; G.shake = Math.max(G.shake, 8); G.flash = Math.max(G.flash, 0.3);
  if (att && !att.isHazard && canBeHit(att) && Math.abs(att.x - v.x) < 170) {                 // in reach: strike back
    v.facing = sign(att.x - v.x) || v.facing;
    if (S.slash) {                                                                             // Zen: a neon draw-cut through the attacker
      inkFx(att.x, att.y - 36, 8, v.facing * 6, 0); ring(att.x, att.y - 36, v.color, 10, 9, 14, 4); textFx('MIRROR DRAW', v.x, v.y - 130, v.color);
      pushFx({ type: 'beam', x: att.x, y: att.y, life: 10, max: 10, color: v.color, vx: 0, vy: 0, drag: 1, g: 0 });
    } else holyBeam(att.x, att.y);
    deliver(v, att, { dmg: Math.max(S.minDmg, m.dmg * S.mult), base: S.base + m.base * 0.3, scale: S.scale, ang: 38, hs: 8, heavy: true }, v.facing, att.x, att.y - 32, false);
  }
  return 'counter';
}

/* Apply a connected hit (melee, projectile or stage hazard). `m` carries dmg/base/scale/ang. */
function deliver(att, vic, m, dir, px, py, blocked) {
  if (G.volley && !(att && att.isHazard)) return 'volley';                // Volley Brawl: nobody hurts anybody — attacks hit the ball (game/minigames.js)
  if (inCounter(vic) && att) return counterStrike(vic, att, m, px, py);
  if (inMeditate(vic) && att && att !== vic) {                            // Zenith's meditation barrier: the hit fizzles against it
    vic.sp.absorbed++; ring(px, py, '#ffc95a', 10, 6, 16, 4); burst(px, py, '#fff1b8', 8, 6, 14, 'dot'); textFx('ABSORBED', vic.x, vic.y - 110, '#ffc95a');
    if (!att.isHazard) att.vx = sign(att.x - vic.x) * 4;
    G.hitstop = 3; return 'absorb';
  }
  if (blocked && att && att.ch && att.ch.pierceShield && !m.proj && vic.stateT >= parryWin(vic)) {   // Specter: the spectral blade passes through shields (a perfect parry still stops it)
    blocked = false; textFx('PIERCE', vic.x, vic.y - 120, att.color); ring(px, py, '#9ad8ff', 8, 7, 16, 3);
  }
  if (blocked) {
    if (vic.stateT < parryWin(vic)) { doParry(vic, att, px, py); return 'parry'; }
    vic.shield -= (m.dmg * 1.3 + 2) * (vic.ch.shieldDef || 1); vic.shieldHit = 10; vic.vx = dir * (1.2 + m.dmg * 0.2);
    ring(px, py, vic.color, 8, 4, 14, 3); burst(px, py, '#ffffff', 5, 6, 12);
    if (vic.ch.sunShield && att && !att.isHazard && att !== vic && Math.abs(att.x - vic.x) < 130 && att.state !== 'dead') {   // Sol: the sun-shield scorches whoever strikes it
      att.percent += 2.5; att.percentPop = 10; att.hitFlash = 4;
      burst(att.x, att.y - 40, '#ffb31a', 10, 6, 18); burst(att.x, att.y - 40, '#fff1b8', 6, 4, 14, 'dot'); textFx('SCORCHED', att.x, att.y - 100, '#ffb31a');
    }
    G.hitstop = Math.min(5, 2 + Math.floor(m.dmg / 4));
    gameEvent('block', { vic, x: px, y: py, dmg: m.dmg });
    if (vic.shield <= 0) breakShield(vic);
    return 'block';
  }
  if (vic.rootT > 0 && vic.onGround) {                                    // Titanis rooted: half damage, never knocked back
    vic.percent += m.dmg * (vic.ch.special.taken || 0.5); vic.percentPop = 14; vic.hurt = 10; vic.sx = 1.08; vic.sy = 0.94;
    ring(px, py, '#b8c8b0', 8, 6, 14, 4); burst(px, py, '#8a9a8a', 8, 5, 14); textFx('ROOTED', vic.x, vic.y - 110, '#c8d8c0');
    G.hitstop = Math.max(3, Math.min(6, 2 + Math.floor(m.dmg / 4))); G.shake = Math.max(G.shake, 3);
    return 'armor';
  }
  // Titan's heavy armor: smashes absorb hits (damage, no flinch) during startup + active frames
  // (armor only holds against light-ish hits: anything dealing ARMOR_BREAK% or more breaks through — balance.js)
  // (Titan's grabs are armored too, against slightly stronger hits)
  if ((vic.ch.armor && vic.state === 'attack' && vic.move && vic.move.heavy && vic.stateT < vic.move.s + vic.move.a && m.dmg < ARMOR_BREAK) ||
      (vic.ch.grabArmor && (vic.state === 'grab' || vic.state === 'holding') && m.dmg < ARMOR_BREAK * 1.5)) {
    vic.percent += m.dmg * 0.6; vic.percentPop = 14; vic.hurt = 10; vic.sx = 1.12; vic.sy = 0.9;
    ring(px, py, '#ffffff', 8, 6, 14, 4); burst(px, py, '#ffffff', 6, 6, 12); textFx('ARMOR', vic.x, vic.y - 90, '#ffffff');
    G.hitstop = 3; G.shake = Math.max(G.shake, 3);
    return 'armor';
  }
  let boost = 1;
  if (att.buffT > 0 && att.ch.special.mult && att.ch.special.type === 'warcry') boost *= att.ch.special.mult;   // Valkyrie: Battle Cry power-up
  if (att.ch.rage) boost *= 1 + Math.min(att.percent, 150) / 300;                                              // Inferno: the more damage he has taken, the harder he hits (up to +50%)
  if (att.rootT > 0) boost *= att.ch.special.mult || 1.2;
  if (att.scale > 1) boost *= 1 + (att.scale - 1) * 0.15;                                                     // the Giant Boss hits 30 % harder                                                       // Titanis strikes harder while rooted
  if (att.ch.backstab && sign(att.x - vic.x) === -vic.facing) {                               // Nyx: hits from behind
    boost *= att.ch.backstab; textFx('BACKSTAB', vic.x, vic.y - 130, att.color); burst(px, py, '#2a0018', 10, 6, 24, 'cloud');
  }
  const wasStun = vic.state === 'hitstun' || vic.state === 'stunned';
  const dmg = m.dmg * boost * (vic.ch.dmgTaken || 1);
  vic.percent += dmg; vic.percentPop = 14;
  const kb = knockbackOf(m, vic, boost) * (G.party && G.party.kb ? G.party.kb : 1);   // KNOCKBACK = base + damage% × scale × weightFactor (balance.js) · × a party mode's launch rule
  launch(vic, kb, m.ang, dir);
  vic.lastHitBy = att; vic.hurt = 14;
  if (vic === fighters[0]) G.vig = Math.max(G.vig, clamp(0.25 + kb * 0.02, 0.25, 0.8));
  impactFx(px, py, kb, att.color);
  gameEvent('hit', { att, vic, m, kb, x: px, y: py, dir });                                  // (audio + smash camera listen; no sim effect)
  G.shakeAng = Math.atan2(vic.vy, vic.vx);                                                  // camera shake follows the launch direction
  G.hitstop = m.heavy ? HEAVY_PAUSE : Math.min(4, 2 + Math.floor(kb / 8));                // v17 hit-pause: a heavy connect freezes both fighters for exactly 0.1 s (6 fixed 60 Hz steps); lights 2-4
  // match stats + combo counter (consecutive hits while the victim is still in hit-stun)
  if (att.st) { att.st.dmg += dmg; att.st.hits++; }
  att.cmbN = wasStun ? att.cmbN + 1 : 1;
  ultHitGain(att, m);                                                       // the ULT meter fills only from landed punches + combos (game/ultimate.js)
  if (!att.isHazard) hitSparks(px, py, kb, att.color, att.cmbN);                          // glowing hit-sparks: more, longer and hotter as the combo grows (render/effects.js)
  if (att.cmbN >= 3 && !att.isHazard && !m.heavy) G.hitstop = Math.min(5, G.hitstop + 1);  // deep in a combo, each light connect holds a touch longer (heavies stay at exactly 0.1 s)
  if (kb >= 22 && !att.isHazard) G.flash = Math.max(G.flash, 0.18);                         // a kill-confirm launch flashes
  if (att.cmbN >= 2 && !att.isHazard) {
    G.combo = { n: att.cmbN, color: att.color, t: 80, side: att.id };
    if (att.st) att.st.best = Math.max(att.st.best, att.cmbN);
    G.shake = Math.max(G.shake, 2 + att.cmbN * 0.6);
  }
  if (vic.ch.glitchy && vic.glitchCD <= 0 && Math.random() < 0.35) vic.glitchT = 8;          // Glitch: will teleport out of this combo
  if (kb >= 12) shockwave(px, py, vic.vx, vic.vy, att.color, kb);
  if ((att.ch.fiery && m.heavy) || m.molten) {                                                  // Blaze / Inferno: smashes explode · Forge: molten-tempered strikes
    ring(px, py, '#ffd23a', 14, 9, 20, 6); burst(px, py, '#ff6a1f', 22, 11, 24); burst(px, py, '#ffd23a', 12, 7, 18); starFx(px, py, '#ff9a3d', 60);
    G.shake = Math.max(G.shake, 6); G.flash = Math.max(G.flash, 0.12);
  }
  if (att.ch.chill) { vic.chill = Math.max(vic.chill, m.heavy ? 130 : 90); burst(px, py, '#bfeaff', 8, 6, 22, 'dot'); }      // Frost: slow the target
  if (att.ch.elec) { vic.hitstun += 4; boltFx(px, py, att.color); boltFx(px, py, '#ffffff'); }                               // Volt: extended hit-stun
  const dose = m.poison || (att.ch.venom && !m.heavy ? 1 : 0);                                                               // Toxin: stacking poison
  if (dose) { vic.poison = Math.min(6, vic.poison + dose); vic.poisonT = 200; burst(px, py, '#9dff2e', 6 + dose * 2, 5, 22, 'dot'); }
  if (att.ch.freezeHeavy && m.heavy) {                                // Rime: smashes encase the target in an ice block (held in place, then the launch kicks in)
    vic.frozenT = ICE_HOLD; vic.frozenV = [vic.vx, vic.vy]; vic.vx = vic.vy = 0; vic.hitstun += ICE_HOLD;
    ring(px, py, '#d6fbff', 12, 8, 20, 5); burst(px, py, '#bfeaff', 16, 7, 22); textFx('FROZEN', vic.x, vic.y - 110, '#bfeaff');
  }
  if (m.trap) {                                                       // Fable: trapped in a bubble of living ink (held in place, then the launch kicks in)
    vic.frozenT = m.trap; vic.frozenV = [vic.vx, vic.vy]; vic.vx = vic.vy = 0; vic.hitstun += m.trap; vic.inkTrap = true;
    inkFx(px, py, 14); textFx('INKED', vic.x, vic.y - 110, '#2a2a70');
  } else if (m.freeze) {                                              // Rime's ice shard / frost trap: flash-frozen in a block of ice
    vic.frozenT = m.freeze; vic.frozenV = [vic.vx, vic.vy]; vic.vx = vic.vy = 0; vic.hitstun += m.freeze;
    ring(px, py, '#d6fbff', 10, 7, 18, 4); burst(px, py, '#bfeaff', 12, 6, 20); textFx('FROZEN', vic.x, vic.y - 110, '#bfeaff');
  }
  if (m.antigrav) { vic.antiGravT = m.antigrav; burst(px, py, '#00ff9c', 8, 5, 14, 'pixel'); }   // Cipher: gravity reversed for a moment
  if (m.blind) {                                                      // Orin: a blinding flash of sunlight
    vic.blindT = m.blind; G.flash = Math.max(G.flash, 0.3); starFx(px, py, '#fff6c0', 70); textFx('BLINDED', vic.x, vic.y - 120, '#ffcf3a');
  }
  if (att.ch.echoHits && !m.echo && !att.isHazard) {                  // Chronos: the same strike lands again a moment later, as a time-echo
    G.echoes.push({ owner: att, x: px, y: py, at: G.frame + ECHO_DELAY, dir, m: { dmg: m.dmg * 0.45, base: m.base * 0.5 + 2, scale: m.scale * 0.5, ang: m.ang, hs: 3, echo: true } });
    ring(px, py, att.color, 6, 1.5, ECHO_DELAY, 2);
  }
  return 'hit';
}
const ICE_HOLD = 26, ECHO_DELAY = 22, HEAVY_PAUSE = 6;                 // (HEAVY_PAUSE: 6 steps × 1/60 s = 0.1 s)

// Chronos's time-echoes: each fires once, hitting whoever is at the spot when it comes due
function updateEchoes() {
  for (let i = G.echoes.length - 1; i >= 0; i--) {
    const e = G.echoes[i]; if (G.frame < e.at) continue;
    G.echoes.splice(i, 1);
    const v = otherOf(e.owner), R = e.r || 30;
    if (e.fx === 'pillar') {                                             // Brimstone: the magma pillar erupts
      burst(e.x, e.y + 30, '#ff6a1f', 22, 10, 26); burst(e.x, e.y - 30, '#ffd23a', 14, 8, 20); ring(e.x, e.y + 36, '#ffb03a', 10, 8, 16, 5);
      pushFx({ type: 'beam', x: e.x, y: e.y + 40, life: 16, max: 16, color: '#ff6a1f', vx: 0, vy: 0, drag: 1, g: 0 }); G.shake = Math.max(G.shake, 6);
    } else if (e.fx === 'guardian') { ring(e.x, e.y, '#9af0d8', 12, 9, 18, 5); starFx(e.x, e.y, '#d8fff4', 40); }   // Aura: the ancestor's blow lands
    else { ring(e.x, e.y, e.owner.color, 8, 7, 16, 4); burst(e.x, e.y, '#ffffff', 6, 5, 12); }
    if (canBeHit(v) && rectCircle(bodyRect(v), e.x, e.y, R)) {
      const blocked = v.state === 'shield' && Math.hypot(e.x - v.x, e.y - (v.y - 32)) < shieldR(v) + R;
      deliver(e.owner, v, e.m, e.dir, e.x, e.y, blocked);
    }
  }
}

/* ---- Mirage's decoy / Aegis's wall: gadgets that intercept the opponent's attacks ---- */
const wallRect = w => ({ x: w.x - 7, y: w.y - 118, w: 14, h: 122 });

function popDecoy(f) {
  const d = f.decoy; if (!d) return;
  f.decoy = null;
  shatter(d.x, d.y - 32, f.color, 30); ring(d.x, d.y - 32, '#ffffff', 8, 7, 18, 4); burst(d.x, d.y - 32, f.color, 14, 8, 20);
  textFx('DECOY', d.x, d.y - 90, f.color);
}

// Returns true when the hit was soaked up by the victim's decoy or wall
function gadgetBlocks(att, vic, hb, px, py) {
  if (vic.decoy && overlap(hb, bodyRect(vic.decoy))) { popDecoy(vic); G.hitstop = 4; return true; }
  const w = vic.wall;
  if (w && overlap(hb, wallRect(w)) && sign(att.x - w.x) === w.dir) {
    w.life -= 40; w.flash = 8; att.vx = w.dir * 5;
    ring(px, py, '#ffffff', 6, 6, 14, 4); burst(px, py, vic.color, 10, 7, 14); G.hitstop = 4; G.shake = Math.max(G.shake, 3);
    return true;
  }
  return false;
}

// Aegis's wall of light, or (pillar = true) Gaia's rock pillar, which erupts under whoever stands there and launches them upward
function deployWall(f, inp, pillar) {
  const sp = f.ch.special, dir = Math.abs(inp.aimX) > 8 ? sign(inp.aimX) : f.facing;
  f.facing = dir;
  f.wall = { x: f.x + dir * (pillar ? 58 : 46), y: f.onGround ? f.y : f.y + 20, dir, life: sp.life, max: sp.life, flash: 10, pillar: !!pillar, rise: 0 };
  f.spCD = sp.cd;
  const o = otherOf(f), r = wallRect(f.wall);
  if (pillar) { dust(f.wall.x, f.wall.y, 12); burst(f.wall.x, f.wall.y - 20, '#8a6a4a', 14, 7, 24); }
  else { ring(f.wall.x, f.wall.y - 60, f.color, 10, 7, 20, 4); burst(f.wall.x, f.wall.y - 60, '#ffffff', 12, 8, 18); }
  if (canBeHit(o) && o.state !== 'shield' && overlap({ x: r.x - 34, y: r.y, w: r.w + 68, h: r.h }, bodyRect(o)))   // shove (or launch) whoever is caught by it
    deliver(f, o, { dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: pillar ? 82 : 35, hs: pillar ? 7 : 4, heavy: !!pillar }, dir, f.wall.x, o.y - 32, false);
}

// Tempest's updraft: launches the opponent the first time, keeps pushing them up, lifts Tempest once
const gustRect = (g, sp) => ({ x: g.x - sp.w / 2, y: g.y - sp.h, w: sp.w, h: sp.h });
function updateGust(f) {
  const g = f.gust, sp = f.ch.special, r = gustRect(g, sp), o = otherOf(f);
  if (--g.life <= 0) { f.gust = null; return; }
  if (G.frame % 2 === 0) burst(r.x + Math.random() * r.w, g.y - 6, f.color, 1, 2, 24, 'dot');
  if (canBeHit(o) && o.state !== 'shield' && overlap(r, bodyRect(o))) {
    if (!g.hit) { g.hit = true; deliver(f, o, { dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 88, hs: 4 }, sign(o.x - g.x) || f.facing, o.x, o.y - 32, false); }
    else if (o.state === 'hitstun' && o.vy > -7) o.vy = Math.max(o.vy - 0.8, -7);      // keeps them aloft, but can't carry them to the top blastzone
  }
  if (!g.lifted && overlap(r, bodyRect(f)) && !f.onGround) {           // ride your own updraft
    g.lifted = true; f.vy = -14; f.helpless = false; f.sx = 0.8; f.sy = 1.3; ring(f.x, f.y, f.color, 8, 6, 16, 3);
  }
}

// Echo's soundwave: an expanding ring that hits once, pushes and confuses (Drift's sonic boom uses the same ring, without the confusion)
function updateSonic(f) {
  const s = f.sonic, sp = s.S || f.ch.special, o = otherOf(f);
  s.r += sp.grow; if (--s.life <= 0) { f.sonic = null; return; }
  if (s.hit || !canBeHit(o)) return;
  const d = Math.hypot(o.x - s.x, (o.y - 32) - s.y);
  if (Math.abs(d - s.r) < 26) {
    s.hit = true;
    const res = deliver(f, o, { dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 35, hs: 4 }, sign(o.x - s.x) || f.facing, o.x, o.y - 32, o.state === 'shield');
    if (res === 'hit' && sp.confuse) { o.confuse = sp.confuse; textFx('CONFUSED', o.x, o.y - 110, f.color); }
    if (res === 'hit' && sp.stun) { o.hitstun += sp.stun; textFx('STUNNED', o.x, o.y - 110, f.color); ring(o.x, o.y - 40, f.color, 8, 4, 18, 3); }   // Siren: resonance stun
    if (res === 'hit' && sp.soulfire) burst(o.x, o.y - 40, '#5dff6a', 14, 6, 22);                                                             // Kryp: soulfire
  }
}

// Prism's crystal: every `every` frames it refracts a bolt of light at the opponent (if in range)
function updatePrism(f) {
  const pr = f.prism, S = f.ch.special, B = S.bolt, o = otherOf(f);
  pr.t++; if (pr.flash > 0) pr.flash--;
  if (--pr.life <= 0) { shatter(pr.x, pr.y, f.color, 18); f.prism = null; return; }
  if (pr.t % S.every === 0 && canBeHit(o) && Math.hypot(o.x - pr.x, o.y - 32 - pr.y) < S.range) {
    const ax = o.x - pr.x, ay = o.y - 36 - pr.y, l = Math.hypot(ax, ay) || 1;
    projs.push({ kind: 'bolt', x: pr.x + ax / l * 14, y: pr.y + ay / l * 14, vx: ax / l * B.speed, vy: ay / l * B.speed, r: B.r, owner: f, life: B.life, dmg: B.dmg, base: B.base, scale: B.scale, ang: B.ang, color: f.color, t: 0 });
    pr.flash = 10; ring(pr.x, pr.y, '#ffffff', 6, 5, 12, 3);
  }
}
// Tempest's thundercloud: a temporary platform that strikes lightning straight down every `every` frames
function updateCloud(f) {
  const cl = f.cloud, S = f.ch.special, o = otherOf(f), cx = cl.x + cl.w / 2;
  cl.t++; if (cl.flash > 0) cl.flash--;
  if (--cl.life <= 0) { burst(cx, cl.y, '#c8d4ff', 14, 5, 24, 'cloud'); f.cloud = null; return; }
  if (cl.t >= S.warn && (cl.t - S.warn) % S.every === 0) {
    const bot = cx > STAGE.x && cx < STAGE.x + STAGE.w ? STAGE.y : cl.y + 420, col = { x: cx - 24, y: cl.y + 8, w: 48, h: bot - cl.y };
    cl.flash = 12; cl.boltBot = bot; G.shake = Math.max(G.shake, 4); boltFx(cx, (cl.y + bot) / 2, '#ffffff'); burst(cx, bot, '#ffe629', 10, 7, 16);
    if (canBeHit(o) && overlap(col, bodyRect(o))) deliver(f, o, S.bolt, sign(o.x - cx) || 1, o.x, o.y - 32, o.state === 'shield');
  }
}
// Strider's grappling hook: where (if anywhere) the hook head catches — the main stage (always pulls up to a top corner
// when it strikes the sides or underside, so the swing carries over the lip) or the top of a floating platform
function hookAnchor(x, y) {
  const S = STAGE;
  if (x > S.x - 12 && x < S.x + S.w + 12 && y > S.y - 10 && y < S.y + S.h + 6) {
    if (y < S.y + 14 && x > S.x && x < S.x + S.w) return [x, S.y];
    return [x < S.x + S.w / 2 ? S.x : S.x + S.w, S.y];
  }
  for (const p of PLATS) if (platUp(p) && x > p.x - 6 && x < p.x + p.w + 6 && Math.abs(y - p.y) < 12) return [clamp(x, p.x, p.x + p.w), p.y];
  return null;
}
// Every fighter's temporary platforms (Tempest's thunderclouds)
const tempPlats = () => { const out = []; for (const f of fighters) if (f.cloud) out.push(f.cloud); return out; };

// Ticks decoys, walls, updrafts and soundwaves (called once per simulation step)
function updateGadgets() {
  for (const f of fighters) {
    if (f.prism) updatePrism(f);
    if (f.gfield && --f.gfield.life <= 0) { ring(f.gfield.x, f.gfield.y, f.color, 10, 5, 14, 3); f.gfield = null; }   // Atlas's gravity well collapses
    if (f.cloud) updateCloud(f);
    if (f.sonic) updateSonic(f);
    if (f.gust) updateGust(f);
    if (f.decoy && --f.decoy.life <= 0) popDecoy(f);
    if (f.wall) {
      const w = f.wall; w.life--; if (w.flash > 0) w.flash--; if (w.rise < 1) w.rise = Math.min(1, w.rise + 0.2);   // (pillars grind up out of the floor)
      if (w.life <= 0) { if (w.pillar) { burst(w.x, w.y - 60, '#8a6a4a', 16, 6, 22); dust(w.x, w.y, 8); } else burst(w.x, w.y - 60, f.color, 12, 5, 18); f.wall = null; }
    }
  }
  updateEchoes();
}

function tryHit(att, vic, m) {
  if (att.hitDone) return;
  const hb = hitboxRect(att, m); logHitbox(hb, att, 'hit', m);            // (logged even with no hittable victim: Training overlay + Break the Targets + the Horde)
  if (!canBeHit(vic)) return;
  if (gadgetBlocks(att, vic, hb, hb.x + hb.w / 2, hb.y + hb.h / 2)) { att.hitDone = true; return; }
  let blocked = false;
  if (vic.state === 'shield' && rectCircle(hb, vic.x, vic.y - 32 * (vic.scale || 1), shieldR(vic))) blocked = true;
  if (!blocked && !overlap(hb, bodyRect(vic))) return;
  att.hitDone = true;
  const dir = m.dir !== undefined ? m.dir : (m.radial ? (vic.x >= att.x ? 1 : -1) : att.facing);
  if (att.ch.sweet && !m.radial) {                                      // Ronin: blade-tip sweet spot vs. sour body of the swing
    const tipX = att.facing > 0 ? hb.x + hb.w * 0.6 : hb.x + hb.w * 0.4, inTip = att.facing > 0 ? vic.x + BODY_W / 2 >= tipX : vic.x - BODY_W / 2 <= tipX;
    const k = inTip ? 1.35 : 0.8;
    m = Object.assign({}, m, { dmg: m.dmg * k, base: m.base * k });
    if (inTip && !blocked) { textFx('CRITICAL', vic.x, vic.y - 120, '#ffffff'); inkFx(vic.x, vic.y - 32, 10); }
  }
  const br = bodyRect(vic), ox0 = Math.max(hb.x, br.x), ox1 = Math.min(hb.x + hb.w, br.x + br.w), oy0 = Math.max(hb.y, br.y), oy1 = Math.min(hb.y + hb.h, br.y + br.h);   // (v17) the exact point of impact:
  const ipx = ox1 > ox0 ? (ox0 + ox1) / 2 : (hb.x + hb.w / 2 + vic.x) / 2, ipy = oy1 > oy0 ? (oy0 + oy1) / 2 : (hb.y + hb.h / 2 + vic.y - 32) / 2;                     // the centre of hitbox ∩ hurtbox
  deliver(att, vic, m, dir, ipx, ipy, blocked);
}

function breakShield(f) {
  gameEvent('shieldBreak', { f });
  if (f.ch.unbreakable) {                                                // Vanguard's scutum can't break: a stagger instead
    f.shield = 30; f.state = 'lag'; f.lagT = 18; f.vx *= 0.3; ring(f.x, f.y - 32, '#ffcf6a', 10, 6, 16, 4); textFx('HOLD THE LINE', f.x, f.y - 110, '#ffcf6a'); G.hitstop = 4;
    return;
  }
  f.state = 'stunned'; f.stunT = 170; f.vx = 0; f.vy = -9; f.onGround = false; f.ground = null; f.y -= 1;
  f.shield = 0; f.move = null;
  ring(f.x, f.y - 32, '#ffffff', 10, 10, 24, 5); burst(f.x, f.y - 32, f.color, 22, 12, 30);
  shatter(f.x, f.y - 32, f.color, 44);
  G.shake = Math.max(G.shake, 12); G.hitstop = 8;
}

/* ---- Attacks ---- */
// Direction from the mouse aim: cursor above = up, below = down, beside = side, on the fighter = neutral
function aimDir(inp) {
  const ax = inp.aimX, ay = inp.aimY, d = Math.hypot(ax, ay);
  if (d < 48) return 'n';
  if (ay < -40 && ay < -Math.abs(ax) * 0.8) return 'u';
  if (ay > 40 && ay > Math.abs(ax) * 0.8) return 'd';
  return 's';
}

// Build a move instance with the fighter's archetype modifiers applied
function buildMove(f, key) {
  const base = MOVES[key], c = f.ch, m = Object.assign({ key }, base);
  m.box = Object.assign({}, base.box);
  const F = BALANCE.frames, spd = base.heavy ? c.heavySpd : c.lightSpd, win = base.car ? [4, 18] : base.heavy ? F.heavyStartup : base.air ? F.airStartup : F.lightStartup;
  m.s = clamp(Math.round(m.s * spd), win[0], win[1]);                                             // startup stays inside the frame-data rules
  m.e = Math.max(4, Math.round(m.e * spd * (c.endLag || 1)));                                     // endLag: extra recovery frames (Mecha)
  m.dmg *= base.heavy ? c.heavyDmg : c.lightDmg;
  const kb = base.heavy ? c.heavyKb : 1; m.base *= kb; m.scale *= kb;
  if (key === 'dsmash' && c.dsmashBoost) { m.dmg *= c.dsmashBoost; m.base *= 1.15; }          // Dynamo's crushing down-smash
  if ((key === 'jab' || key === 'jab2') && c.multiJab) {                                    // Volt / Striker: a flurry of rapid hits per jab
    const n = c.multiJab; m.multi = n; m.a += (n - 1) * 2; m.dmg *= 1.25 / n; m.base *= 0.8;
  }
  if (key === 'dashatk' && c.drift) { m.dmg *= 1.3; m.base *= 1.15; m.lunge *= 1.2; m.a += 2; } // Dino Nuggi: a long drifting slide
  if (base.heavy && c.multiHeavy && !base.car) {                                            // Kuro: the kanabo crunches N times per smash
    const n = c.multiHeavy; m.multi = n; m.a += (n - 1) * 3; m.dmg *= 1.3 / n; m.base *= 0.9;
  }
  if (!base.heavy && c.whip) { m.box = Object.assign({}, m.box, { w: m.box.w * c.whip }); m.dmg *= 0.9; m.whip = true; }   // Kryp: bone-whip reach
  if (!base.heavy && c.shapeshift) {                                                        // Helix: every light attack morphs the limb
    const morph = ['blade', 'hammer', 'whip'][Math.floor(Math.random() * 3)]; m.morph = morph;
    if (morph === 'blade') { m.dmg *= 1.2; m.box.w *= 1.15; }
    else if (morph === 'hammer') { m.base *= 1.35; m.scale *= 1.2; m.box.w *= 0.9; }
    else { m.box.w *= 1.7; m.dmg *= 0.85; }
  }
  m.box.w *= c.range;
  if (base.back) m.box.ox = -(m.box.ox + m.box.w + (c.reach || 0));                 // back hits: mirror the box behind the fighter
  else if (m.box.ox < 0) m.box.ox = -m.box.w / 2; else m.box.ox += (c.reach || 0);  // reach = disjointed range
  if (c.tall) { const nh = m.box.h * c.tall; m.box.oy -= (nh - m.box.h) / 2; m.box.h = nh; }
  return m;
}

// Pulse's rhythm: a beat every `ch.beat` frames, with a forgiving window either side of it
const BEAT_WIN = 6;
const beatPhase = f => G.frame % f.ch.beat;
const onBeat = f => { const p = beatPhase(f); return p <= BEAT_WIN || p >= f.ch.beat - BEAT_WIN; };
function beginMove(f, m) {
  if (!f.onGround) {                                            // aerial versions
    m.e = Math.ceil(m.e * (f.ch.airLag || 0.5)); m.dmg *= f.ch.airDmg || 1;
    if (m.key === 'dtilt' || m.key === 'dsmash') { m.ang = -72; m.radial = false; m.box = { ox: -26, oy: -6, w: 52, h: 48 }; }   // meteor spike
  }
  if (m.heavy && f.ch.kinetic && f.kin > 10) {                 // Surge: stored kinetic energy supercharges the smash
    const k = f.kin / 100; m.base *= 1 + 0.7 * k; m.scale *= 1 + 0.45 * k; m.dmg *= 1 + 0.3 * k; m.kinetic = k; f.kin = 0;
    ring(f.x, f.y - 32, f.color, 10, 6, 16, 4); boltFx(f.x, f.y - 40, '#ffffff');
  }
  if (m.heavy && f.heatN > 0) {                                  // Forge: a molten-tempered heavy (one of the charges from Molten Temper)
    f.heatN--; const T = f.ch.special; m.dmg *= T.mult || 1.35; m.base *= 1.2; m.scale *= 1.1; m.molten = true;
    burst(f.x, f.y - 50, '#ffb03a', 10, 5, 16); if (f.heatN === 0) textFx('COOLED', f.x, f.y - 100, '#ffb03a');
  }
  if (f.ch.beat && onBeat(f)) {                                  // Pulse: attacks started on the beat hit harder
    m.dmg *= 1.2; m.base *= 1.15; m.onBeat = true;
    ring(f.x, f.y - 32, f.color, 8, 5, 12, 3); if (m.heavy || f.combo <= 1) textFx('ON BEAT!', f.x, f.y - 100, f.color);
  }
  f.move = m; f.state = 'attack'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
  if (m.heavy) { f.sx = 1.12; f.sy = 0.88; }
  if (f.onGround && m.lunge) f.vx = f.facing * m.lunge;
}

function startAttack(f, inp, heavy) {
  const d = aimDir(inp);
  let key;
  if (!heavy && !f.onGround) {                                            // aerials keep the facing: aiming behind you = back aerial
    key = d === 's' && inp.aimX * f.facing < 0 ? 'bair' : AIR_MAP[d];
  } else {
    if (Math.abs(inp.aimX) > 8) f.facing = inp.aimX > 0 ? 1 : -1;        // face the cursor
    key = (heavy ? HEAVY_MAP : LIGHT_MAP)[d];
    const running = f.dashT > 0 || (f.runMode && Math.abs(f.vx) > f.ch.run * 0.8);
    const walkIn = (f.facing > 0 ? inp.right : inp.left) && !running;
    if (!heavy && d === 's' && f.onGround && running && sign(f.vx) === f.facing) key = 'dashatk';   // light attack out of a run = slide kick
    else if (!heavy && d === 's' && f.onGround && walkIn) key = 'ftilt';                             // holding forward (walking) = forward-tilt thrust
    if (f.ch.carSmash && f.onGround && d === 's' && (key === 'fsmash' || key === 'dashatk' || (heavy && running))) key = key === 'fsmash' && !running ? 'carsmash' : 'cardash';   // Dino Nuggi: F1 car
  }
  f.combo = key === 'jab' ? 1 : 0;
  const m = buildMove(f, key);
  if (m.back) m.dir = -f.facing;
  f.chargeT = 0; f.charging = false; f.chargeDone = !m.charge;
  if (f.ch.airCombo && !f.onGround && !heavy) { m.chain = true; f.combo = 1; }      // Sylph: aerial lights chain into multi-hit air combos
  beginMove(f, m);
}

/* ---- Specials ---- */
// Echo: the opponent's own projectile, rebuilt from their special (a plain sonic orb if they have none)
function mimicSpec(o) {
  const S = o.ch.special, T = S.type, base = { kind: 'orb', speed: 11, r: 13, dmg: 6, base: 5, scale: 0.08, ang: 35, life: 70, distort: true };
  const pick = src => { const out = {}; for (const k of ['speed', 'r', 'dmg', 'base', 'scale', 'ang', 'life', 'grav', 'turn', 'bounces', 'poison']) if (src && src[k] !== undefined) out[k] = src[k]; return out; };
  if (T === 'orb') return Object.assign(base, pick(S.orb), { kind: 'orb' });
  if (T === 'arrow' || T === 'water' || T === 'disk' || T === 'acid') return Object.assign(base, pick(S), { kind: T });
  if (T === 'magma') return Object.assign(base, pick(S), { kind: 'magma', noPool: true });
  if (T === 'volley') return Object.assign(base, pick(S), { kind: S.projKind || 'foxorb' });
  if (T === 'missiles') return Object.assign(base, pick(S), { kind: 'missile', life: 90 });
  if (T === 'prism') return Object.assign(base, pick(S.bolt), { kind: 'bolt' });
  if (T === 'adapt') return Object.assign(base, pick(S.floaty), { kind: 'bolt' });
  return base;
}

// spOverride: a substitute special (Apex-X's adaptive modes)
function startSpecial(f, inp, spOverride) {
  const sp = spOverride || f.ch.special;
  let dx = inp.aimX, dy = inp.aimY, len = Math.hypot(dx, dy);
  if (sp.type === 'adapt') {                                             // Apex-X: read the opponent's weight class and pick the counter-tool
    const cls = weightClassOf(otherOf(f).ch).id, M = cls === 'floaty' ? sp.floaty : cls === 'mid' ? sp.mid : sp.heavy;
    if (f.adaptShown !== M.label) { f.adaptShown = M.label; textFx('ADAPT: ' + M.label, f.x, f.y - 110, f.color); }
    return startSpecial(f, inp, M);
  }
  if (sp.type === 'meditate') {                                          // Zenith: float in a cosmic barrier, then release a palm-blast
    if (f.spCD > 0) return false;
    f.sp = { type: 'meditate', wind: sp.wind, active: sp.active, end: sp.end, absorbed: 0 }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.vx *= 0.3; if (!f.onGround) f.vy = Math.min(f.vy, 0);
    ring(f.x, f.y - 36, '#ffc95a', 10, 5, 16, 3);
    return true;
  }
  if (sp.type === 'sink') {                                              // Umbra: melt into the floor (ground) · shadow-step (air)
    if (!f.onGround) {
      if (f.specialUsed) return false;
      if (len < 40) { dx = f.facing; dy = -0.5; len = Math.hypot(dx, dy); }
      f.sp = { type: 'blink', dx: dx / len, dy: dy / len, wind: 4, dist: sp.blink };
      if (Math.abs(dx) > 8) f.facing = sign(dx);
      f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.specialUsed = true; f.invuln = Math.max(f.invuln, 12);
      return true;
    }
    if (f.spCD > 0) return false;
    const E = sp.emerge;
    f.sp = { type: 'sink', phase: 'down', t0: 0, m: { box: E.box, dmg: E.dmg, base: E.base, scale: E.scale, ang: 80, radial: true, hs: 7, heavy: true } }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.hitDone = true; f.buf.jumpP = 0; f.vx *= 0.5;
    return true;
  }
  if (sp.type === 'prism') {                                             // Prism: conjure a refracting crystal at the cursor
    if (f.spCD > 0) return false;
    const px = clamp(f.x + clamp(dx, -320, 320), BZ.l + 80, BZ.r - 80), py = Math.min(f.y - 40 + clamp(dy, -260, 40), STAGE.y - 60);
    f.prism = { x: px, y: py, life: sp.life, max: sp.life, t: 0, flash: 0 }; f.spCD = sp.cd;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'lag'; f.lagT = 12; f.vx *= 0.3; f.buf.jumpP = 0;
    ring(px, py, f.color, 10, 6, 18, 4); starFx(px, py, '#ffffff', 40); burst(px, py, f.color, 12, 6, 18, 'dot');
    return true;
  }
  if (sp.type === 'temper') {                                            // Forge: heat the hammer — the next heavies are molten
    if (f.spCD > 0 || (f.heatN || 0) >= sp.charges) return false;
    f.sp = { type: 'temper', wind: sp.wind }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.vx *= 0.3;
    return true;
  }
  if (sp.type === 'mimic') {                                             // Echo: replay the opponent's projectile
    if (f.spCD > 0) return false;
    if (len < 20) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len; f.facing = dx >= 0 ? 1 : -1;
    const spec = mimicSpec(otherOf(f));
    f.sp = { type: 'shoot', kind: spec.kind, dx, dy, wind: sp.wind, end: sp.end, spec }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'storm') {                                             // Tempest: a thundercloud at the cursor — a platform that rains lightning
    if (f.spCD > 0) return false;
    const cx = clamp(f.x + clamp(dx, -340, 340), BZ.l + 90, BZ.r - 90), cy = clamp(f.y - 32 + clamp(dy, -300, 200), STAGE.y - 330, STAGE.y - 110);
    f.cloud = { x: cx - sp.w / 2, y: cy, w: sp.w, h: 10, life: sp.life, max: sp.life, t: 0, flash: 0 }; f.spCD = sp.cd;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'lag'; f.lagT = 12; f.vx *= 0.3; f.buf.jumpP = 0;
    burst(cx, cy, '#c8d4ff', 16, 6, 24, 'cloud'); ring(cx, cy, f.color, 10, 6, 16, 3);
    return true;
  }
  if (sp.type === 'hook') {                                              // Strider: fire the grappling hook toward the cursor
    if (!f.onGround && f.specialUsed) return false;
    if (len < 30) { dx = f.facing; dy = -0.6; len = Math.hypot(dx, dy); }
    dx /= len; dy /= len; if (Math.abs(dx) > 0.15) f.facing = sign(dx);
    f.sp = { type: 'hook', dx, dy, hx: f.x, hy: f.y - 40, phase: 'throw', d: 0, t0: 0 };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    if (!f.onGround) f.specialUsed = true;
    return true;
  }
  if (sp.up && aimDir(inp) === 'u') {                                    // up-special: a dedicated vertical recovery (Mecha's rockets, Volt's thunder burst)
    if (!f.onGround && f.specialUsed) return false;
    const U = sp.up, ux = clamp(dx / 140, -0.35, 0.35), uy = -Math.sqrt(1 - ux * ux);   // mostly straight up, drifts a little toward the aim
    f.sp = { type: 'burst', up: U.fx, dx: ux, dy: uy, wind: U.wind, dur: U.dur, speed: U.speed,
             m: { box: U.box, dmg: U.dmg, base: U.base, scale: U.scale, ang: 82, dir: f.facing, hs: 6, heavy: true } };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    if (!f.onGround) f.specialUsed = true;
    ring(f.x, f.y - 10, f.color, 8, 5, 16, 3);
    if (U.fx === 'thunder') { boltFx(f.x, f.y - 40, '#ffffff'); boltFx(f.x, f.y - 40, f.color); }
    return true;
  }
  if (sp.type === 'grab') {                                              // Dynamo: close-range grab (ground only)
    if (!f.onGround) return false;
    if (Math.abs(dx) > 8) f.facing = dx > 0 ? 1 : -1;
    f.state = 'grab'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'tele') {                                              // Ghost: phase-teleport toward the cursor, strike on arrival
    if (len < 40) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len;
    if (Math.abs(dx) > 0.2) f.facing = dx > 0 ? 1 : -1;
    f.sp = { type: 'tele', dx, dy, wind: sp.wind, dist: sp.dist, zap: sp.zap, rift: sp.rift,
             m: { box: sp.box, dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: dy < -0.4 ? 75 : dy > 0.4 ? -50 : 38, dir: Math.abs(dx) > 0.2 ? sign(dx) : f.facing, hs: 6, heavy: true } };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.invuln = Math.max(f.invuln, 10);
    if (!f.onGround) f.specialUsed = true;
    if (sp.decoy && f.onGround) { f.decoy = { x: f.x, y: f.y, facing: f.facing, life: 150, onGround: true }; burst(f.x, f.y - 32, '#0a2a1a', 10, 4, 18, 'cloud'); }   // Ghost: a phantom decoy left behind
    return true;
  }
  if (sp.type === 'decoy') {                                             // Mirage: leave a decoy, blink toward the cursor
    if (!f.onGround && f.specialUsed) return false;
    if (f.spCD <= 0) {
      f.decoy = { x: f.x, y: f.y, facing: f.facing, life: sp.life, onGround: f.onGround };
      f.spCD = sp.cd; ring(f.x, f.y - 32, '#ffffff', 6, 5, 14, 3);
    }
    if (len < 40) { dx = f.facing; dy = 0; len = 1; }
    if (f.onGround && dy > 0) dy = 0;                                    // don't blink into the floor
    len = Math.hypot(dx, dy) || 1;
    f.sp = { type: 'blink', dx: dx / len, dy: dy / len, wind: 4, dist: sp.dist };
    if (Math.abs(dx) > 8) f.facing = dx > 0 ? 1 : -1;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.invuln = Math.max(f.invuln, 12);
    if (!f.onGround) f.specialUsed = true;
    return true;
  }
  if (sp.type === 'wall') {                                              // Aegis: raise a reflecting wall in front
    if (f.spCD > 0) return false;
    deployWall(f, inp);
    f.state = 'lag'; f.lagT = 12; f.vx *= 0.3; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'dive') {                                              // Apex: (leap, then) dive-kick toward the cursor
    if (!f.onGround && f.specialUsed) return false;
    if (Math.abs(dx) > 8) f.facing = dx > 0 ? 1 : -1;
    f.sp = { type: 'dive', phase: f.onGround ? 'rise' : 'wind', t0: 0,
             m: { box: sp.box, dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 55, dir: f.facing, hs: 7, heavy: true, poison: sp.poison } };   // (Vesper's stinger poisons)
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.specialUsed = true;
    if (f.onGround) { f.vy = -14; f.onGround = false; f.ground = null; f.y -= 1; dust(f.x, f.y, 6); f.sx = 0.75; f.sy = 1.3; }
    return true;
  }
  if (sp.type === 'gust') {                                              // Tempest: column of rising wind (under yourself when off-stage)
    if (f.spCD > 0 || (!f.onGround && f.specialUsed)) return false;
    const self = isOffStage(f) || (!f.onGround && len < 60);
    f.gust = { x: self ? f.x : f.x + clamp(dx, -170, 170), y: self ? f.y + 70 : f.onGround ? f.y : f.y + 40, life: sp.life, max: sp.life, hit: false, lifted: false };
    f.spCD = sp.cd; if (!f.onGround) f.specialUsed = true;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'lag'; f.lagT = 10; f.buf.jumpP = 0;
    ring(f.gust.x, f.gust.y, f.color, 10, 8, 18, 4);
    return true;
  }
  if (sp.type === 'stomp') {                                             // Terra: ground stomp, or plummet from the air
    if (!f.onGround && f.specialUsed) return false;
    f.sp = { type: 'stomp', phase: f.onGround ? 'ground' : 'air', m: { box: sp.box, dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 60, radial: true, hs: 7, heavy: true } };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    if (!f.onGround) f.specialUsed = true;
    return true;
  }
  if (sp.type === 'missiles') {                                          // Mecha: missile barrage
    if (f.projCD > 0) return false;
    if (len < 20) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len; f.facing = dx >= 0 ? 1 : -1;
    f.sp = { type: 'missiles', dx, dy, n: 0 }; f.projCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'warcry') {                                            // Valkyrie: Battle Cry on the ground · wing-dash in the air (or while it recharges)
    if (f.onGround && f.spCD <= 0) {
      f.sp = { type: 'warcry', wind: sp.wind, end: sp.end }; f.spCD = sp.cd;
      if (Math.abs(dx) > 8) f.facing = sign(dx);
      f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.vx *= 0.3;
      return true;
    }
    if (!f.onGround && (f.airDashN || 0) >= sp.airDashes) return false;
    const W = sp.dash;
    if (len < 40) { dx = f.facing; dy = f.onGround ? 0 : -0.3; len = Math.hypot(dx, dy); }
    dx /= len; dy /= len;
    if (f.onGround && dy > 0) { dy = 0; dx = sign(dx) || f.facing; }      // no dashing into the floor
    if (Math.abs(dx) > 0.2) f.facing = sign(dx);
    const ang = dy > 0.3 ? -50 : Math.max(30, Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI);
    f.sp = { type: 'burst', wingDash: true, dx, dy, wind: W.wind, dur: W.dur, speed: W.speed,
             m: { box: W.box, dmg: W.dmg, base: W.base, scale: W.scale, ang, dir: Math.abs(dx) > 0.2 ? sign(dx) : f.facing, hs: 5 } };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    if (!f.onGround) f.airDashN = (f.airDashN || 0) + 1;
    ring(f.x, f.y - 32, '#ffffff', 8, 5, 14, 3); burst(f.x, f.y - 40, '#ffffff', 8, 5, 16, 'dot');
    return true;
  }
  if (sp.type === 'flare') {                                             // Sol: gather the sun, then a solar flare all around
    if (f.spCD > 0 || (!f.onGround && f.specialUsed)) return false;
    f.sp = { type: 'flare', wind: sp.wind, end: sp.end }; f.spCD = sp.cd;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.vx *= 0.3;
    if (!f.onGround) { f.specialUsed = true; f.vy = Math.min(f.vy, 0); }
    return true;
  }
  if (sp.type === 'root') {                                              // Titanis: root into the earth (or uproot)
    if (f.rootT > 0) { f.rootT = 0; dust(f.x, f.y, 6); f.state = 'lag'; f.lagT = 6; f.buf.jumpP = 0; return true; }
    if (!f.onGround || f.spCD > 0) return false;
    f.rootT = sp.dur; f.spCD = sp.cd; f.vx = 0; f.state = 'lag'; f.lagT = 12; f.buf.jumpP = 0;
    dust(f.x, f.y, 10); ring(f.x, f.y, '#b8c8b0', 12, 6, 18, 5); G.shake = Math.max(G.shake, 5); textFx('ROOTED', f.x, f.y - 110, '#c8d8c0');
    return true;
  }
  if (sp.type === 'gravfield') {                                         // Atlas: plant a crushing gravity well at the cursor
    if (f.spCD > 0) return false;
    const gx = clamp(f.x + clamp(dx, -300, 300), BZ.l + 80, BZ.r - 80), gy = Math.min(f.y - 32 + clamp(dy, -220, 120), STAGE.y - 40);
    f.gfield = { x: gx, y: gy, r: sp.r, life: sp.life, max: sp.life }; f.spCD = sp.cd;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'lag'; f.lagT = 12; f.vx *= 0.3; f.buf.jumpP = 0;
    ring(gx, gy, f.color, 12, 9, 20, 5); burst(gx, gy, f.ch.alt, 14, 6, 18, 'dot');
    return true;
  }
  if (['arrow', 'water', 'volley', 'disk', 'magma', 'acid', 'bolt', 'flask', 'ink', 'boulder', 'shard'].includes(sp.type)) {   // Orion's arrow · Kraken's jet · Vex / Byte volleys · Pulse's disk · Magma's lob · Venom's spit · Apex-X's rail
    if (f.spCD > 0) return false;
    if (len < 20) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len; f.facing = dx >= 0 ? 1 : -1;
    f.sp = { type: 'shoot', kind: sp.type, dx, dy, wind: sp.wind, end: sp.end, spec: spOverride }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'star') {                                              // Nova: mark a spot; a star falls on it from the top of the sky
    if (f.spCD > 0) return false;
    f.sp = { type: 'star', tx: clamp(f.x + clamp(dx, -420, 420), BZ.l + 60, BZ.r - 60), wind: sp.wind }; f.spCD = sp.cd;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'laser') {                                             // Lux: a long focus, then an instant beam
    if (f.spCD > 0) return false;
    if (len < 20) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len; if (Math.abs(dx) > 0.15) f.facing = sign(dx);
    f.sp = { type: 'laser', dx, dy, wind: sp.wind, beam: null }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'counter') {                                           // Paladin: raise the shield and wait for a hit to answer
    if (f.spCD > 0) return false;
    f.sp = { type: 'counter', wind: sp.wind, active: sp.active, end: sp.end, countered: 0 }; f.spCD = sp.cd || 30;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.vx *= 0.3;
    return true;
  }
  if (sp.type === 'pillar') {                                            // Gaia: wrench a rock pillar out of the ground
    if (f.spCD > 0 || !f.onGround) return false;
    deployWall(f, inp, true);
    f.state = 'lag'; f.lagT = 14; f.vx *= 0.3; f.buf.jumpP = 0; G.shake = Math.max(G.shake, 5);
    return true;
  }
  if (sp.type === 'tendril') {                                           // Nyx: a shadow tendril under the cursor (ground) · phase dash (air)
    if (!f.onGround) {
      if (f.specialUsed) return false;
      const P = sp.phase; if (len < 40) { dx = f.facing; dy = -0.4; len = Math.hypot(dx, dy); }
      dx /= len; dy /= len; if (Math.abs(dx) > 0.2) f.facing = sign(dx);
      f.sp = { type: 'phase', dx, dy, wind: P.wind, dur: P.dur, speed: P.speed,
               m: { box: P.box, dmg: P.dmg, base: P.base, scale: P.scale, ang: 40, dir: f.facing, hs: 6, heavy: true } };
      f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0; f.specialUsed = true; f.invuln = Math.max(f.invuln, P.wind + P.dur + 2);
      return true;
    }
    if (f.spCD > 0) return false;
    const reach = clamp(Math.abs(dx), 60, sp.range) * (Math.abs(dx) > 8 ? sign(dx) : f.facing);
    f.facing = sign(reach); f.sp = { type: 'tendril', tx: f.x + reach, ty: f.y, wind: sp.wind }; f.spCD = sp.cd;
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0;
    return true;
  }
  if (sp.type === 'rewind') {                                            // Chrono: snap back along your own path, 1.5 s into the past
    if (f.spCD > 0 || f.hist.length < 20) return false;
    const back = Math.min(sp.back, f.hist.length - 1);
    f.sp = { type: 'rewind', path: f.hist.slice(f.hist.length - 1 - back).reverse(), pct: f.hist[f.hist.length - 1 - back].pct };   // (Chronos-II also takes back the damage)
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.spCD = sp.cd; f.invuln = Math.max(f.invuln, 16);
    releaseAll(f);
    ring(f.x, f.y - 32, f.color, 10, 6, 18, 4);
    return true;
  }
  if (sp.type === 'glitch') {                                            // Glitch: three erratic micro-teleports
    if (!f.onGround && f.specialUsed) return false;
    if (len < 40) { dx = f.facing; dy = 0; len = 1; }
    f.sp = { type: 'glitch', dx: dx / len, dy: dy / len, dist: sp.dist, n: 0,
             m: { box: sp.box, dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 50, radial: true, hs: 3, antigrav: sp.antigrav } };
    f.state = 'special'; f.stateT = 0; f.hitDone = true; f.buf.jumpP = 0; f.invuln = Math.max(f.invuln, sp.hops * sp.gap + 6);
    if (!f.onGround) f.specialUsed = true;
    return true;
  }
  if (sp.type === 'sonic') {                                             // Echo: expanding soundwave ring
    if (f.spCD > 0) return false;
    f.sonic = { x: f.x, y: f.y - 32, r: 18, life: sp.life, hit: false };
    f.spCD = sp.cd; f.state = 'lag'; f.lagT = 10; f.vx *= 0.3;
    ring(f.x, f.y - 32, '#ffffff', 10, 5, 12, 3);
    return true;
  }
  if (sp.type === 'flurry') {                                            // Chimera: five-hit claw flurry
    if (!f.onGround && f.specialUsed) return false;
    if (Math.abs(dx) > 8) f.facing = sign(dx);
    f.sp = { type: 'flurry', n: 0, m: { box: sp.box, dmg: sp.dmg, base: sp.base, scale: sp.scale, ang: 80, dir: f.facing, hs: 2 } };
    f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
    if (!f.onGround) f.specialUsed = true;
    return true;
  }
  if (sp.type === 'orb') {
    if (isOffStage(f) && !f.specialUsed) return startBlink(f, dx, dy, len);        // off-stage: Phase Blink recovery
    if (f.projCD > 0) return false;
    if (len < 20) { dx = f.facing; dy = 0; len = 1; }
    dx /= len; dy /= len;
    f.facing = dx >= 0 ? 1 : -1;
    f.sp = { type: 'orb', dx, dy, wind: 9, end: 15 };
    f.state = 'special'; f.stateT = 0; f.buf.jumpP = 0; f.projCD = sp.orb.cd;
    return true;
  }
  // burst (Flash Dash / Rising Hammer): dash toward the cursor, hits on the way
  if (len < 40) { dx = 0; dy = -1; len = 1; }
  dx /= len; dy /= len;
  if (sp.rise && dy > -0.65) { const sgn = Math.abs(dx) > 0.15 ? sign(dx) : 0; dy = -0.65; dx = sgn * 0.76; }   // Aether always rises
  if (sp.flat) { dy = clamp(dy, -0.3, 0.3); dx = (Math.abs(dx) > 0.1 ? sign(dx) : f.facing) * Math.sqrt(1 - dy * dy); }   // Volt: horizontal boost
  if (Math.abs(dx) > 0.2) f.facing = dx > 0 ? 1 : -1;
  const ang = dy > 0.1 ? -55 : Math.max(28, Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI);
  let k = 1;
  if (sp.kineticBoost) { k = 1 + f.kin / 100 * 1.2; if (f.kin > 30) textFx('DISCHARGE', f.x, f.y - 100, f.color); f.kin = 0; }   // Surge spends its stored energy
  f.sp = { type: sp.type === 'phase' ? 'phase' : 'burst', dx, dy, wind: sp.wind, dur: sp.dur, speed: sp.speed * (k > 1 ? 1 + (k - 1) * 0.25 : 1), refund: sp.refund,
           m: { box: sp.box, dmg: sp.dmg * k, base: sp.base * k, scale: sp.scale, ang, dir: Math.abs(dx) > 0.2 ? sign(dx) : f.facing, hs: 5 + (k > 1.5 ? 4 : 0), poison: sp.poison, blind: sp.blind, heavy: k > 1.5 || sp.type === 'phase' } };
  f.state = 'special'; f.stateT = 0; f.hitDone = false; f.buf.jumpP = 0;
  if (sp.type === 'phase') f.invuln = Math.max(f.invuln, sp.wind + sp.dur + 2);               // Nyx is intangible while phasing
  f.sp.ink = sp.ink; f.sp.turbo = sp.turbo; f.sp.flames = sp.flames;              // Dino's exhaust · Blaze's flame trail
  f.sp.gale = sp.gale; f.sp.boom = sp.boom;                                         // Gale's wind streaks · Drift's sonic boom at the end of the dash
  f.sp.serpent = sp.serpent;                                                        // Pyre: the lunge weaves like a serpent
  if (!f.onGround) f.specialUsed = true;
  ring(f.x, f.y - 32, f.color, 8, 4, 16, 3);
  return true;
}

function startBlink(f, dx, dy, len) {
  if (len < 40) { dx = 0; dy = -1; len = 1; }
  f.sp = { type: 'blink', dx: dx / len, dy: dy / len, wind: 6 };
  f.state = 'special'; f.stateT = 0; f.specialUsed = true; f.buf.jumpP = 0; f.invuln = Math.max(f.invuln, 16);
  return true;
}

function doBlink(f) {
  const sp = f.sp, dist = sp.dist || f.ch.special.blinkDist;
  ring(f.x, f.y - 32, f.color, 8, 8, 20, 4); burst(f.x, f.y - 32, f.color, 16, 8, 24);
  let d = dist, nx = f.x, ny = f.y;
  for (let k = 0; k < 24; k++) {                                // back off until we're not inside the stage
    nx = f.x + sp.dx * d; ny = f.y + sp.dy * d;
    if (!inStageBox({ x: nx, y: ny })) break;
    d -= 10;
  }
  f.x = clamp(nx, BZ.l + 10, BZ.r - 10); f.y = clamp(ny, BZ.t + 40, BZ.b - 10);
  f.vx = f.vy = 0;
  ring(f.x, f.y - 32, f.color, 8, 8, 20, 4); burst(f.x, f.y - 32, '#ffffff', 14, 8, 20);
}

function spawnOrb(f, sp) {
  const o = f.ch.special.orb;
  projs.push({ kind: 'orb', bounces: o.bounces || 0, x: f.x + sp.dx * 28, y: f.y - 38 + sp.dy * 28, vx: sp.dx * o.speed, vy: sp.dy * o.speed, r: o.r,
               owner: f, life: o.life, dmg: o.dmg, base: o.base, scale: o.scale, ang: o.ang, color: f.color, t: 0 });
  burst(f.x + sp.dx * 28, f.y - 38 + sp.dy * 28, f.color, 8, 6, 14);
}

/* ---- Other projectile kinds: Terra's shockwaves, Luna's boomerang, Mecha's missiles ---- */
// Ground shockwaves travelling both ways along whatever surface the fighter stands on
const QUAKE_WAVE = { speed: 8.5, r: 13, dmg: 6, base: 5.5, scale: 0.07, ang: 65, life: 36 };   // (for quake fighters whose special has no wave of its own)
function quake(f, power) {
  const w = f.ch.special.wave || f.ch.quakeWave || QUAKE_WAVE, k = power || 1;
  let y = STAGE.y, minX = STAGE.x, maxX = STAGE.x + STAGE.w;
  if (f.ground === 'plat') { const p = PLATS.find(p => f.x + HW > p.x && f.x - HW < p.x + p.w); if (p) { y = p.y; minX = p.x; maxX = p.x + p.w; } }
  for (const dir of [-1, 1])
    projs.push({ kind: 'wave', x: f.x + dir * 22, y: y - w.r, vx: dir * w.speed, vy: 0, r: w.r, owner: f, life: w.life, dmg: w.dmg * k, base: w.base, scale: w.scale,
                 ang: w.ang, color: f.color, t: 0, minX, maxX });
  dust(f.x, f.y, 12); ring(f.x, f.y, f.color, 10, 10, 22, 5); G.shake = Math.max(G.shake, 6 * k);
}
// Orion's arrow (falls under gravity) · Kraken's water jet (fast, short, big shove) · Vex's volley (one real orb, the rest fake)
function spawnShot(f, sp) {
  const S = sp.spec || f.ch.special, x0 = f.x + sp.dx * 30, y0 = f.y - 40 + sp.dy * 30;   // (sp.spec: Echo's copied projectile / Apex-X's adaptive rail)
  const base = { r: S.r, owner: f, life: S.life, dmg: S.dmg, base: S.base, scale: S.scale, ang: S.ang, color: f.color, t: 0, poison: S.poison || 0, distort: !!S.distort, trap: S.trap || 0, freeze: S.freeze || 0 };
  if (sp.kind === 'volley') {
    const real = Math.floor(Math.random() * S.count), a0 = Math.atan2(sp.dy, sp.dx);
    for (let k = 0; k < S.count; k++) {
      const a = a0 + (k - (S.count - 1) / 2) * S.spread;
      projs.push(Object.assign({}, base, { kind: S.projKind || 'foxorb', x: x0, y: y0, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, fake: !S.allReal && k !== real }));   // (Byte's packets are all real)
    }
  } else projs.push(Object.assign({}, base, { kind: sp.kind, x: x0, y: y0, vx: sp.dx * S.speed, vy: sp.dy * S.speed, grav: S.grav || 0, bounces: S.bounces || 0,
                                               speed: S.speed, turn: S.turn || 0.05, noPool: !!S.noPool }));
  if (S.distort) { ring(x0, y0, '#ffffff', 8, 5, 12, 2); ring(x0, y0, f.color, 14, 7, 16, 3); }                 // Echo: a warped feedback ring
  if (sp.kind === 'disk') { ring(x0, y0, '#ffffff', 6, 4, 10, 2); f.vx -= sp.dx * 1.2; }                 // Pulse: a scratch on the turntable
  if (sp.kind === 'magma') burst(x0, y0, '#ffd23a', 8, 5, 16, 'dot');
  burst(x0, y0, f.color, 8, 6, 14);
  if (sp.kind === 'water') { for (let k = 0; k < 6; k++) pushFx({ type: 'dot', x: x0, y: y0, vx: sp.dx * rand(2, 6) + rand(-1.5, 1.5), vy: sp.dy * rand(2, 6) + rand(-1.5, 1.5), life: 18, max: 18, color: '#cfffff', size: 2.5, drag: 0.94, g: 0.15 }); f.vx -= sp.dx * 2.5; }
}
// Nova's star: hangs invisible at the top of the sky for `delay` frames (a marker shows where), then plummets
function spawnStar(f, tx) {
  const S = f.ch.special;
  let ty = f.y;                                                          // land on whatever surface is under the mark
  if (tx > STAGE.x && tx < STAGE.x + STAGE.w) ty = STAGE.y;
  else { const p = PLATS.find(p => tx > p.x && tx < p.x + p.w); ty = p ? p.y : BZ.b; }
  projs.push({ kind: 'star', x: tx, y: BZ.t + 30, ty, vx: 0, vy: 0, speed: S.speed, delay: S.delay, r: S.r, owner: f, life: S.delay + 80,
               dmg: S.dmg, base: S.base, scale: S.scale, ang: 78, color: f.color, t: 0 });
}
// Nyx's tendril: erupts from the floor at the mark after a short delay, then stays up briefly
function spawnTendril(f, tx, ty) {
  const S = f.ch.special;
  projs.push({ kind: 'tendril', x: tx, y: ty - S.h * 0.45, base0: ty, vx: 0, vy: 0, r: S.w * 0.75, delay: S.delay, owner: f, life: S.delay + S.active,
               dmg: S.dmg, base: S.pull ? S.base * 0.8 : S.base, scale: S.pull ? S.scale * 0.6 : S.scale, ang: S.pull ? 20 : 80, pull: !!S.pull, color: f.color, t: 0, h: S.h });   // (Nyx: a snaring pull instead of a launch)
}
// Lux's laser: an instant ray from the hand toward the aim; stops at the stage, hits the first body (or shield) on the line
function fireLaser(f, o) {
  const S = f.ch.special, sp = f.sp, x0 = f.x + sp.dx * 26, y0 = f.y - 40 + sp.dy * 26;
  let len = S.len, hit = null, blocked = false;
  for (let d = 0; d <= S.len; d += 6) {
    const x = x0 + sp.dx * d, y = y0 + sp.dy * d;
    if (x > STAGE.x && x < STAGE.x + STAGE.w && y > STAGE.y && y < STAGE.y + STAGE.h) { len = d; break; }
    if (o.wall && rectCircle(wallRect(o.wall), x, y, 2)) { len = d; o.wall.flash = 8; break; }
    if (canBeHit(o)) {
      if (o.state === 'shield' && Math.hypot(x - o.x, y - (o.y - 32)) < shieldR(o)) { len = d; hit = [x, y]; blocked = true; break; }
      if (rectCircle(bodyRect(o), x, y, 3)) { len = d; hit = [x, y]; break; }
    }
  }
  sp.beam = { x0, y0, x1: x0 + sp.dx * len, y1: y0 + sp.dy * len, t: 12 };
  G.flash = Math.max(G.flash, 0.18); G.shake = Math.max(G.shake, 4);
  if (hit) deliver(f, o, { dmg: S.dmg, base: S.base, scale: S.scale, ang: sp.dy < -0.5 ? 80 : 30, hs: 7, heavy: true }, sign(sp.dx) || f.facing, hit[0], hit[1], blocked);
  burst(sp.beam.x1, sp.beam.y1, '#ffffff', 12, 9, 16); ring(sp.beam.x1, sp.beam.y1, f.color, 8, 7, 16, 4);
}
function spawnMissile(f, sp, n) {
  const m = f.ch.special, spread = (n - (m.count - 1) / 2) * 0.35, a = Math.atan2(sp.dy, sp.dx) + spread;
  projs.push({ kind: 'missile', x: f.x - f.facing * 10, y: f.y - 58, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, r: m.r, owner: f, life: m.life,
               dmg: m.dmg, base: m.base, scale: m.scale, ang: m.ang, color: f.color, t: 0, speed: m.speed, turn: m.turn });
  burst(f.x - f.facing * 10, f.y - 58, '#ffb84d', 6, 4, 12); f.vx -= sp.dx * 0.6;
}

// Per-kind movement; returns true when the projectile should vanish quietly
// Magma: a landed glob spreads into a pool of burning lava along whatever surface it hit
function lavaPool(f, x, y, minX, maxX) {
  const S = f.ch.special, F = S.flame, n = S.pool;
  for (let k = 0; k < n; k++) {
    const px = clamp(x + (k - (n - 1) / 2) * 24, minX + 8, maxX - 8);
    projs.push({ kind: 'flame', pool: true, x: px, y: y - 10, vx: 0, vy: 0, r: F.r, owner: f, life: F.life + k * 4, max: F.life, dmg: F.dmg, base: F.base, scale: F.scale, ang: F.ang, color: f.color, t: 0 });
  }
  burst(x, y - 6, '#ffd23a', 14, 7, 20); burst(x, y - 6, '#ff4a1a', 10, 5, 24, 'dot'); dust(x, y, 6); G.shake = Math.max(G.shake, 3);
}
// The surface a falling projectile is about to land on this frame: [y, minX, maxX] (or null)
function landingSurface(p) {
  const S = STAGE;
  if (p.x > S.x && p.x < S.x + S.w && p.y + p.vy >= S.y && p.y - 4 <= S.y + 10) return [S.y, S.x, S.x + S.w];
  for (const q of PLATS) if (platUp(q) && p.x > q.x && p.x < q.x + q.w && p.y <= q.y && p.y + p.vy >= q.y) return [q.y, q.x, q.x + q.w];
  return null;
}
// Venom: a puddle of toxic slime that poisons whoever steps in it
function slimePuddle(f, x, y, life, trail) {
  projs.push({ kind: 'slime', trail: !!trail, x, y: y - 6, vx: 0, vy: 0, r: 13, owner: f, life, max: life, dmg: 1, base: 2.5, scale: 0.01, ang: 60, poison: 1, color: f.color, t: 0 });
}
// Nox: a lingering cloud of plague mist (poisons whoever stands in it; see updateProjs)
function plagueMist(f, x, y) {
  const M = f.ch.special.mist || { r: 66, life: 240 };
  projs.push({ kind: 'mist', x, y: y - M.r * 0.55, vx: 0, vy: 0, r: M.r, owner: f, life: M.life, max: M.life, dmg: 0, base: 0, scale: 0, ang: 0, color: f.ch.alt, t: 0 });
  burst(x, y - 10, f.ch.alt, 16, 5, 24, 'cloud'); shatter(x, y - 8, '#c8e8ff', 10);
}
// Goliath: the boulder shatters into shockwaves running both ways along the surface it lands on
function boulderLand(p, L) {
  const w = p.owner.ch.special.wave;
  if (w) for (const dir of [-1, 1]) projs.push({ kind: 'wave', x: p.x + dir * 22, y: L[0] - w.r, vx: dir * w.speed, vy: 0, r: w.r, owner: p.owner, life: w.life, dmg: w.dmg, base: w.base, scale: w.scale, ang: w.ang, color: p.owner.color, t: 0, minX: L[1], maxX: L[2] });
  shatter(p.x, L[0] - 14, '#a8a8a0', 30); dust(p.x, L[0], 12); ring(p.x, L[0], '#ffffff', 10, 9, 18, 5); G.shake = Math.max(G.shake, 8);
}
// Rime: a frost trap left where an ice shard lands — it freezes the first foe to step on it (at most two at a time)
function frostTrap(f, x, y) {
  const T = f.ch.special.frostTrap; if (!T) return;
  const mine = projs.filter(p => p.kind === 'frost' && p.owner === f); if (mine.length >= 2) mine[0].life = 0;
  projs.push({ kind: 'frost', x, y: y - 6, vx: 0, vy: 0, r: T.r, owner: f, life: T.life, max: T.life, dmg: 3, base: 3, scale: 0.02, ang: 70, freeze: T.freeze, color: f.color, t: 0 });
  shatter(x, y - 6, '#d6fbff', 10); ring(x, y, '#bfeaff', 8, 5, 14, 3);
}
function moveProj(p) {
  if (p.kind === 'arrow' || p.kind === 'magma' || p.kind === 'acid' || p.kind === 'flask' || p.kind === 'boulder' || p.kind === 'ink' || p.kind === 'shard') p.vy += p.grav;   // lobbed / arcing projectiles
  if ((p.kind === 'magma' || p.kind === 'acid' || p.kind === 'flask' || p.kind === 'boulder' || p.kind === 'shard') && p.vy > 0) {   // these splash where they land
    const L = landingSurface(p);
    if (L) {
      if (p.kind === 'shard') frostTrap(p.owner, p.x, L[0]);
      else if (p.kind === 'flask') plagueMist(p.owner, p.x, L[0]);
      else if (p.kind === 'boulder') boulderLand(p, L);
      else if (p.kind === 'acid') { slimePuddle(p.owner, p.x, L[0], 150); burst(p.x, L[0] - 4, p.color, 10, 5, 18, 'dot'); }
      else if (p.noPool) burst(p.x, L[0] - 4, '#ffb03a', 12, 6, 18);
      else lavaPool(p.owner, p.x, L[0], L[1], L[2]);
      return true;
    }
  }
  if (p.kind === 'disk') p.vx *= 0.995;                                  // Pulse's disk: spins out slowly
  else if (p.kind === 'star') {                                          // Nova: hang until due, then plummet onto the mark
    p.vy = p.t < p.delay ? 0 : p.speed;
    if (p.t >= p.delay && p.y >= p.ty - p.r) { ring(p.x, p.ty, p.color, 14, 9, 22, 6); burst(p.x, p.ty, '#ffffff', 18, 10, 20); starFx(p.x, p.ty - 10, p.color, 70); G.shake = Math.max(G.shake, 7); return true; }
  } else if (p.kind === 'water') { p.vx *= 0.97; p.vy += 0.12; }         // Kraken: the jet loses pressure and droops
  else if (p.kind === 'missile' && p.t > 6) {                            // gentle homing toward the target
    const v = otherOf(p.owner), want = Math.atan2((v.y - 32) - p.y, v.x - p.x), cur = Math.atan2(p.vy, p.vx);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const a = cur + clamp(d, -p.turn, p.turn); p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed;
    if (p.t % 2 === 0) pushFx({ type: 'cloud', x: p.x - p.vx, y: p.y - p.vy, vx: 0, vy: -0.3, life: 18, max: 18, color: 'rgba(200,200,210,0.5)', size: 3, drag: 1, g: 0 });
  }
  p.x += p.vx; p.y += p.vy; p.life--; p.t++;
  if (p.cool > 0) p.cool--;
  if ((p.kind === 'orb' || p.kind === 'disk') && p.bounces > 0) {        // Vortex's orbs and Pulse's disks ricochet off the stage and the tops of platforms
    const S = STAGE, px = p.x - p.vx, py = p.y - p.vy; let hit = false;
    if (p.x > S.x && p.x < S.x + S.w && p.y > S.y && p.y < S.y + S.h) {
      if (py <= S.y || py >= S.y + S.h) { p.vy = -p.vy; p.y = py; } else { p.vx = -p.vx; p.x = px; }
      hit = true;
    } else if (p.vy > 0) {
      for (const q of PLATS) if (p.x > q.x && p.x < q.x + q.w && py <= q.y && p.y >= q.y) { p.vy = -p.vy; p.y = q.y - 1; hit = true; break; }
    }
    if (hit) { p.bounces--; p.life = Math.max(p.life, 35); ring(p.x, p.y, p.color, 6, 5, 12, 3); burst(p.x, p.y, '#ffffff', 4, 4, 10); }
  }
  return false;
}

function updateProjs() {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (moveProj(p)) { projs[i] = projs[projs.length - 1]; projs.pop(); continue; }
    if (p.kind === 'mist') {                                              // Nox's plague mist: no knockback, it just poisons on a slow tick
      if (p.life <= 0) { projs[i] = projs[projs.length - 1]; projs.pop(); continue; }
      const mv = otherOf(p.owner);
      if (p.t % 30 === 0 && canBeHit(mv) && rectCircle(bodyRect(mv), p.x, p.y, p.r)) {
        mv.poison = Math.min(6, mv.poison + 1); mv.poisonT = 200; mv.percent += 1; mv.percentPop = 6; burst(mv.x, mv.y - 40, p.color, 6, 3, 18, 'dot');
      }
      continue;
    }
    const waiting = p.delay && p.t < p.delay;                             // star / tendril: harmless (and trail-less) until due
    if (p.kind === 'wave') { if (p.t % 3 === 0) dust(p.x, p.y + p.r, 1); }
    else if (!waiting && p.kind !== 'tendril') pushFx({ type: 'dot', x: p.x, y: p.y, vx: rand(-.4, .4), vy: rand(-.4, .4), life: 14, max: 14, color: p.color, size: p.r * 0.5, drag: .9, g: 0 });
    let dead = p.life <= 0 || p.x < BZ.l || p.x > BZ.r || p.y < BZ.t || p.y > BZ.b ||
               (p.kind !== 'tendril' && p.x > STAGE.x && p.x < STAGE.x + STAGE.w && p.y > STAGE.y && p.y < STAGE.y + STAGE.h) ||
               (p.kind === 'wave' && (p.x < p.minX || p.x > p.maxX));
    const v = otherOf(p.owner);
    if (p.kind === 'tendril' && p.t === p.delay) { burst(p.x, p.base0, '#2a0018', 14, 6, 24, 'cloud'); dust(p.x, p.base0, 6); }
    if (waiting) continue;
    if (p.fake && !dead && (rectCircle(bodyRect(v), p.x, p.y, p.r) || (v.state === 'shield' && Math.hypot(p.x - v.x, p.y - (v.y - 32)) < shieldR(v) + p.r))) {
      burst(p.x, p.y, '#ffd0f0', 14, 7, 18); ring(p.x, p.y, p.color, 8, 6, 14, 3); textFx('BOOM!', p.x, p.y - 30, p.color);    // Vex: the decoy hologram explodes on contact
      if (canBeHit(v)) deliver(p.owner, v, { dmg: 3, base: 4, scale: 0.03, ang: 50, hs: 3, proj: true }, sign(v.x - p.x) || 1, p.x, p.y, v.state === 'shield');
      projs[i] = projs[projs.length - 1]; projs.pop(); continue;
    }
    if (!dead && v.wall && rectCircle(wallRect(v.wall), p.x, p.y, p.r) && sign(p.vx) === -v.wall.dir) {   // Aegis wall reflects
      p.owner = v; p.vx = v.wall.dir * Math.max(6, Math.abs(p.vx) * 1.2); p.vy *= 0.6; p.dmg *= 1.2; p.life += 40; p.color = v.color;
      v.wall.flash = 8; ring(p.x, p.y, '#ffffff', 8, 8, 18, 4); textFx('REFLECT!', v.wall.x, v.wall.y - 130, '#ffffff');
      G.hitstop = 4; continue;
    }
    if (!dead && v.decoy && rectCircle(bodyRect(v.decoy), p.x, p.y, p.r)) { popDecoy(v); dead = true; }   // decoy soaks it up
    if (!dead && v.ch.crystalReflect && p.dmg < v.ch.crystalReflect && p.vx !== 0 && canBeHit(v) && v.state !== 'shield' && rectCircle(bodyRect(v), p.x, p.y, p.r)) {   // Bismuth's crystal armor
      p.owner = v; p.vx *= -1.1; p.vy *= -0.6; p.color = v.color; p.life += 30; p.x += p.vx * 2;
      ring(p.x, p.y, v.color, 8, 7, 14, 3); shatter(p.x, p.y, '#e8d8ff', 6); textFx('REFRACT', v.x, v.y - 110, v.color); continue;
    }
    if (!dead && inMeditate(v) && p.vx !== 0 && Math.hypot(p.x - v.x, p.y - (v.y - 36)) < v.ch.special.r + p.r) {   // Zenith's barrier sends projectiles back
      p.owner = v; p.vx *= -1.15; p.vy *= -1.15; p.color = v.color; p.life += 30;
      ring(p.x, p.y, '#ffc95a', 8, 8, 16, 4); textFx('REFLECT!', v.x, v.y - 110, '#ffc95a'); G.hitstop = 4; continue;
    }
    if (!dead && canBeHit(v)) {
      if (v.state === 'shield' && (p.x - v.x) ** 2 + (p.y - (v.y - 32)) ** 2 <= (shieldR(v) + p.r) ** 2) {
        if (v.stateT < parryWin(v)) {                            // parry reflects projectiles
          v.parryFlash = 16; v.shield = Math.min(100, v.shield + 8);
          p.owner = v; p.vx *= -1.25; p.vy *= -1.25; p.dmg *= 1.25; p.life += 40; p.color = v.color;
          ring(p.x, p.y, '#ffffff', 8, 8, 18, 4); textFx('REFLECT!', v.x, v.y - 96, '#ffffff');
          G.hitstop = 6; continue;
        }
        deliver(p.owner, v, { dmg: p.dmg, base: p.base, scale: p.scale, ang: p.ang, hs: 3 }, sign(p.vx) || sign(v.x - p.x) || 1, p.x, p.y, true);
        dead = true;
      } else if (rectCircle(bodyRect(v), p.x, p.y, p.r)) {
        deliver(p.owner, v, { dmg: p.dmg, base: p.base, scale: p.scale, ang: p.ang, hs: 3, heavy: p.kind === 'star' || p.kind === 'boulder', poison: p.poison, trap: p.trap, freeze: p.freeze, proj: true },
                p.pull ? (sign(p.owner.x - v.x) || 1) : (sign(p.vx) || sign(v.x - p.x) || 1), p.x, p.y, false);   // (Nyx's tendril drags the foe toward her)
        dead = true;
      }
    }
    if (dead) { burst(p.x, p.y, p.color, 8, 7, 14); projs[i] = projs[projs.length - 1]; projs.pop(); }
  }
}

/* ---- Grab / throw (Titan; Toxin's stretchy long-range snare) ---- */
// The grab box: Toxin's arm stretches `reach` times further and reels the victim in
const grabBox = f => { const k = f.ch.special.reach || 1; return k === 1 ? GRAB_BOX : Object.assign({}, GRAB_BOX, { w: GRAB_BOX.w * k }); };
function tryGrab(f, v) {
  if (G.volley) return;                                                   // (no grabs across the net)
  if (f.hitDone || !canBeHit(v) || v.hand || v.state === 'hitstun' || v.state === 'ledge' || inMeditate(v)) return;   // (the boss hand can't be grabbed)
  const hb = hitboxRect(f, { box: grabBox(f) }); logHitbox(hb, f, 'grab');
  if (!overlap(hb, bodyRect(v))) return;                                 // grabs IGNORE shields
  if (f.ch.special.reach && Math.abs(v.x - f.x) > 60) {                  // reel in from range, with a stretched elastic line
    for (let k = 0; k < 8; k++) pushFx({ type: 'dot', x: lerp(f.x, v.x, k / 8), y: f.y - 36, vx: 0, vy: 0, life: 12, max: 12, color: f.color, size: 3, drag: 1, g: 0 });
    textFx('SNARED', v.x, v.y - 100, f.color);
  }
  f.hitDone = true; releaseAll(v);
  f.state = 'holding'; f.holdT = 0; f.grabbing = v; f.holdMax = 70;
  v.state = 'grabbed'; v.grabber = f; v.escape = 0; v.vx = v.vy = 0; v.move = null; v.sp = null;
  ring(hb.x + hb.w / 2, hb.y + hb.h / 2, '#ffffff', 6, 5, 14, 3); starFx(hb.x + hb.w / 2, hb.y + hb.h / 2, f.color, 30);
}
function throwTarget(f, v, type) {
  const t = THROWS[type], dir = type === 'b' ? -f.facing : f.facing;
  v.grabber = null; f.grabbing = null;
  v.percent += t.dmg * f.ch.heavyDmg * (v.ch.dmgTaken || 1); v.percentPop = 14; v.hurt = 14;
  const kb = knockbackOf(t, v);
  launch(v, kb, t.ang, dir);
  v.lastHitBy = f;
  if (v === fighters[0]) G.vig = Math.max(G.vig, 0.6);
  impactFx(v.x, v.y - 32, kb, f.color);
  shockwave(v.x, v.y - 20, v.vx, v.vy, f.color, kb + 4);
  if (type === 'd') {
    G.shake = Math.max(G.shake, 12); ring(v.x, v.y, '#ffffff', 10, 14, 24, 6); dust(v.x, v.y, 10);
    if (f.ch.special.slamQuake && f.onGround) { quake(f); G.shake = Math.max(G.shake, 16); textFx('BODY SLAM!', f.x, f.y - 110, f.color); }   // Titan: the slam splits the floor
  }
  G.hitstop = type === 'd' ? 8 : 6;
  f.state = 'lag'; f.lagT = 16;
}
function releaseGrab(f, v, timeout) {
  f.grabbing = null; v.grabber = null;
  v.state = 'free'; v.invuln = 14; v.vx = -f.facing * (timeout ? 3 : 4); v.vy = 0;
  f.state = 'lag'; f.lagT = 14;
  ring(v.x, v.y - 32, '#ffffff', 8, 4, 12, 3);
}

/* ---- Ledge ---- */
function tryLedge(f, inp) {
  if (f.onGround || f.ledgeCD > 0 || f.vy < -2 || inp.down) return false;
  for (const L of LEDGES) {
    if (L.owner && L.owner !== f) continue;
    const dx = f.x - L.x;
    if (L.side < 0 ? dx > 2 : dx < -2) continue;                  // must be outside the edge
    const s = f.scale || 1;
    if (Math.abs(dx) > 46 * s) continue;
    const head = f.y - BODY_H * s;
    if (head < L.y - 34 || head > L.y + 40) continue;
    f.state = 'ledge'; f.ledge = L; L.owner = f; f.ledgeT = 0;
    f.x = L.x + L.side * 20 * s; f.y = L.y + 72 * s; f.vx = f.vy = 0;
    f.facing = -L.side; f.invuln = 50;
    f.jumps = f.ch.airJumps; f.helpless = false; f.specialUsed = false; f.airDashN = 0; f.move = null; f.sp = null; f.hoverT = f.ch.hover || 0;
    ring(L.x, L.y, f.color, 6, 4, 14, 3);
    return true;
  }
  return false;
}

/* ---- KO / respawn ---- */
function ko(f) {
  releaseAll(f);
  const ex = clamp(f.x, BZ.l, BZ.r), ey = clamp(f.y - 32, BZ.t, BZ.b);
  starFx(ex, ey, f.color, 90); ring(ex, ey, '#ffffff', 10, 22, 34, 8); ring(ex, ey, f.color, 10, 14, 40, 6);
  ring(ex, ey, f.color, 4, 30, 46, 4); ring(ex, ey, '#ffe14d', 4, 9, 52, 3); shockwave(ex, ey, ex < 640 ? 12 : -12, 0, f.color, 40);
  burst(ex, ey, f.color, 40, 18, 50); burst(ex, ey, '#ffffff', 20, 14, 36);
  for (let h = 0; h < 360; h += 60) { burst(ex, ey, `hsl(${h},100%,65%)`, 8, 16, 44); ring(ex, ey, `hsl(${h},100%,65%)`, 6 + h / 30, 10 + h / 40, 30 + h / 20, 3); }   // multi-coloured KO blast
  shatter(ex, ey, f.color, 30); gameEvent('ko', { f, x: ex, y: ey });
  if (f.lastHitBy && !f.lastHitBy.isHazard) f.lastHitBy.koT = G.frame;                          // (the CPU may taunt after taking a stock: game/emotes.js)
  G.shake = 20; G.flash = 1; G.hitstop = 12; G.shakeAng = Math.atan2(ey - G.cam.y, ex - G.cam.x);
  f.stocks--; if (G.training || CHAL.mode === 'btt' || CHAL.mode === 'btp') f.stocks = Math.max(f.stocks, 3);       // Training / the solo challenges: infinite stocks
  f.percent = 0; f.shield = 100; f.poison = 0; f.poisonT = 0; f.wall = null; f.decoy = null; f.gust = null;
  f.ultHeld = 0; f.ultPh = null; if (G.ultCine && (G.ultCine.id === f.id || G.ultCine.vic === f.id)) { G.ultCine = null; G.ultFreeze = 0; }
  f.frozenT = 0; f.hist.length = 0; f.fuel = 100; f.crawl = false; f.kin = 0; f.confuse = 0; f.sonic = null; f.buffT = 0; f.prism = null; f.cloud = null; f.heatN = 0; f.gfield = null; f.rootT = 0; f.blindT = 0; f.antiGravT = 0;
  if (f.lastHitBy && f.lastHitBy.st && f.lastHitBy !== f) f.lastHitBy.st.kos++;
  f.state = 'dead'; f.deadT = 70; f.vx = f.vy = 0; f.move = null; f.sp = null;
  const alive = fighters.filter(x => x.stocks > 0);
  if (alive.length < 2 && G.mode === 'play') {                     // FINISH!: long freeze + colour-inverted flash, then the victory screen
    G.mode = 'ending'; G.endT = 150; G.winner = alive[0] || null; G.finishAt = G.time; G.hitstop = 36; G.matchTime = G.frame;
    if (!alive.length) G.sdNext = true;                              // both out at once: a tie → Sudden Death
    if (G.suddenDeath) { G.slowmo = 150; G.hitstop = 48; }           // the decisive Sudden Death blow plays out in slow motion
  } else if (!alive.length && G.mode === 'ending' && G.finishAt === G.time) { G.winner = null; G.sdNext = true; }   // double KO on the same frame
}

/* ---- time limit + Sudden Death ---- */
// Time up: more stocks wins; a tie on stocks goes to Sudden Death.
function timeUp() {
  const [a, b] = fighters, winner = a.stocks === b.stocks ? null : (a.stocks > b.stocks ? a : b);
  G.mode = 'ending'; G.endT = 150; G.winner = winner; G.finishAt = G.time; G.hitstop = 30; G.matchTime = G.frame; G.timeUp = true;
  if (!winner) G.sdNext = true;
}
// Sudden Death: one stock each at 300%, emergency lights, double-tempo music, a tighter camera; the next KO wins.
function startSuddenDeath() {
  G.suddenDeath = true; G.sdNext = false; G.timeUp = false; G.timeLeft = 0; G.winner = null;
  fx.length = 0; projs.length = 0; G.echoes.length = 0; if (typeof clearKOFX === 'function') clearKOFX();
  fighters.forEach((f, i) => { resetFighter(f, ST.spawns[i]); f.facing = i ? -1 : 1; f.stocks = 1; f.percent = 300; });
  G.mode = 'count'; G.countT = 0; G.goT = 0; G.endT = 0; G.finishAt = -999; G.hitstop = 0; G.flash = 0.6; G.ultCine = null; G.ultFreeze = 0;
  gameEvent('suddenDeath', {});
}

function respawn(f) {
  f.state = 'respawn'; f.respT = 0; f.x = 640; f.y = -120; f.vx = f.vy = 0;
  f.facing = Math.random() < .5 ? 1 : -1; f.percent = 0; f.shield = 100;
  f.jumps = f.ch.airJumps; f.helpless = false; f.specialUsed = false; f.airDashN = 0; f.onGround = false; f.rot = 0;
  f.hoverT = f.ch.hover || 0; f.fuel = 100;
  f.invuln = 999;
  if (f.ai) f.ai.rdir = Math.random() < .5 ? -1 : 1;
}
