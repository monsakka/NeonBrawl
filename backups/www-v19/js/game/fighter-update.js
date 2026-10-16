/* NEON BRAWL — Per-frame fighter state machine. */
'use strict';

/* ============================ FIGHTER UPDATE ======================== */
function consume(f, k) { if (f.buf[k] > 0) { f.buf[k] = 0; return true; } return false; }
const anyInput = i => i.left || i.right || i.down || i.shield || i.jumpP || i.lightP || i.heavyP || i.specialP;
const ROLL_T = 20;
const AIR_REUSE = new Set(['orb', 'wall', 'missiles', 'rewind', 'arrow', 'water', 'volley', 'star', 'laser', 'counter', 'disk', 'magma', 'warcry',
                           'meditate', 'prism', 'mimic', 'storm', 'acid', 'temper', 'flask', 'ink', 'boulder', 'gravfield', 'shard']);   // specials gated by a cooldown instead of once per airtime

// Dodge roll (shield + A/D) and directional tech-roll: brief invulnerable roll along the ground
function startRoll(f, dir) {
  if (f.ch.cloneDodge && f.onGround && !f.decoy) {                      // Kage: every dodge leaves a shadow clone that soaks up one hit
    f.decoy = { x: f.x, y: f.y, facing: f.facing, life: 110, onGround: true }; burst(f.x, f.y - 32, '#1a1030', 10, 4, 20, 'cloud');
  }
  f.state = 'roll'; f.stateT = 0; f.rollDir = dir; f.facing = dir; f.invuln = Math.max(f.invuln, 14); f.rollTech = false;
  f.vx = dir * 9; dust(f.x, f.y, 4); ghost(f);
}

// Sprint effects (motion.js MOTION[id].fx): what a fighter leaves behind when running flat out
function sprintFx(f, kind) {
  const bx = f.x - f.facing * 14, d = -sign(f.vx) || -f.facing;
  switch (kind) {
    case 'ghost':  ghost(f); break;                                                                      // speedsters: after-image trail
    case 'sparks': pushFx({ type: 'spark', x: bx, y: f.y - 2, vx: d * rand(1, 3), vy: -rand(1, 3), life: 10, max: 10, color: f.color, w: 1.5, len: 3, drag: 0.9, g: 0.2 }); break;
    case 'embers': pushFx({ type: 'dot', x: bx, y: f.y - rand(10, 40), vx: d * rand(0.5, 1.5), vy: -rand(0.5, 1.5), life: 20, max: 20, color: G.frame & 4 ? '#ffb03a' : '#ff5a1f', size: 2.5, drag: 0.97, g: -0.02 }); break;
    case 'dust':   dust(bx, f.y, 2); break;
    case 'pixels': burst(bx, f.y - rand(10, 60), f.color, 1, 2, 12, 'pixel'); break;
    case 'frost':  pushFx({ type: 'dot', x: bx, y: f.y - 2, vx: d, vy: -0.4, life: 18, max: 18, color: '#d6fbff', size: 2.5, drag: 0.95, g: 0 }); break;
    case 'shadow': pushFx({ type: 'cloud', x: bx, y: f.y - rand(20, 50), vx: d * 0.5, vy: -0.2, life: 18, max: 18, color: 'rgba(20,8,36,0.55)', size: 7, drag: 0.97, g: 0 }); break;
    case 'petals': pushFx({ type: 'dot', x: bx, y: f.y - rand(20, 60), vx: d * rand(0.5, 1.5), vy: rand(-0.4, 0.4), life: 26, max: 26, color: f.ch.alt, size: 2.2, drag: 0.98, g: 0.02 }); break;
  }
}

// Apex: is the fighter pressed against a side wall of the main stage, holding toward it?
function wallContact(f, dirIn) {
  if (f.onGround || f.wallCD > 0 || f.vy < -2 || !dirIn) return 0;
  if (f.y < STAGE.y + 8 || f.y - BODY_H > STAGE.y + STAGE.h) return 0;
  if (dirIn > 0 && Math.abs(f.x - (STAGE.x - HW)) < 2) return -1;                 // clinging to the left wall
  if (dirIn < 0 && Math.abs(f.x - (STAGE.x + STAGE.w + HW)) < 2) return 1;       // clinging to the right wall
  return 0;
}

function updateFighter(f, o, inp) {
  const c = f.ch, sl = f.chill > 0 ? 0.62 : 1;      // Frost's chill slows movement
  f.padHold = inp.down;                              // (holding down stops a Starfighter Dock launch pad from flinging you)
  // Byte's corruption field: inside it you lose your grip and float (no traction, low gravity)
  const corrupted = !!o.ch.corrupt && o.state !== 'dead' && o.state !== 'respawn' && f.state !== 'dead' && Math.hypot(o.x - f.x, o.y - f.y) < o.ch.corrupt;
  const icy = ST.ice || corrupted;
  if (corrupted && G.frame % 6 === f.id * 3) burst(f.x + rand(-16, 16), f.y - rand(8, 64), G.frame & 4 ? o.color : o.ch.alt, 1, 2, 12, 'pixel');
  // ---- timers ----
  if (f.invuln > 0 && f.state !== 'respawn') f.invuln--;
  if (f.hitFlash > 0) f.hitFlash--;
  if (f.dropT > 0) f.dropT--;
  if (f.ledgeCD > 0) f.ledgeCD--;
  if (f.shieldCD > 0) f.shieldCD--;
  if (f.projCD > 0) f.projCD--;
  if (f.dashT > 0) f.dashT--;
  if (f.landT > 0) f.landT--;
  if (f.percentPop > 0) f.percentPop--;
  if (f.shieldHit > 0) f.shieldHit--;
  if (f.parryFlash > 0) f.parryFlash--;
  if (f.hurt > 0) f.hurt--;
  if (f.techT > 0) f.techT--;
  if (f.techCD > 0) f.techCD--;
  if (f.spCD > 0) f.spCD--;
  if (f.wallCD > 0) f.wallCD--;
  if (f.jetT > 0) f.jetT--;
  if (f.flipT > 0) f.flipT--;                      // animation timers: mid-air jump flip, turn-around skid, wall-jump kick, missed tech
  if (f.turnT > 0) f.turnT--;
  if (f.driftT > 0) { f.driftT--; if (f.onGround && (G.frame & 1)) burst(f.x - f.facing * 30, f.y - 4, '#e8eaf2', 1, 2, 18, 'dot'); }   // F1 drift: tyre smoke
  if (f.wallKickT > 0) f.wallKickT--;
  if (f.missT > 0) f.missT--;
  if (f.reelT > 0) f.reelT--;                      // (reeling from a parry · tech get-up)
  if (f.techPoseT > 0) f.techPoseT--;
  if (f.blindT > 0) f.blindT--;                    // (Orin's blinding flash wearing off)
  if (f.rootT > 0 && (--f.rootT === 0 || !f.onGround) && f.state !== 'dead') { f.rootT = 0; dust(f.x, f.y, 4); }   // Titanis uproots
  if (f.rootT > 0 && G.frame % 8 === 0) burst(f.x + rand(-24, 24), f.y - 2, '#8a9a7a', 1, 2, 18, 'dot');
  if (f.buffT > 0) {                                // Valkyrie's Battle Cry: golden motes while empowered
    f.buffT--; if (G.frame % 5 === f.id && f.state !== 'dead') burst(f.x + rand(-18, 18), f.y - rand(10, 70), '#ffd36e', 1, 1.5, 18, 'dot');
    if (f.buffT === 0) ring(f.x, f.y - 32, '#ffd36e', 6, 3, 12, 2);
  }
  f.idleT = f.state === 'free' && f.onGround && Math.abs(f.vx) < 0.6 ? (f.idleT || 0) + 1 : 0;
  if (f.confuse > 0) { f.confuse--; if (f.confuse % 20 === 0) textFx('?', f.x + rand(-16, 16), f.y - 92, '#5cc8ff'); }
  if (f.glitchCD > 0) f.glitchCD--;
  if (f.glitchT > 0 && --f.glitchT === 0 && f.state === 'hitstun') {               // Glitch: blink out of the combo
    const mid = STAGE.x + STAGE.w / 2;
    burst(f.x, f.y - 32, '#00ff9c', 10, 6, 16, 'pixel'); burst(f.x, f.y - 32, '#ff4dd8', 8, 6, 16, 'pixel');
    f.x += sign(mid - f.x) * rand(60, 110) + rand(-20, 20); f.y -= rand(10, 50);
    f.vx *= 0.3; f.vy *= 0.3; f.hitstun = Math.floor(f.hitstun / 2); f.glitchCD = 150;
    burst(f.x, f.y - 32, '#ffffff', 8, 5, 14, 'pixel'); textFx('GLITCH', f.x, f.y - 100, '#00ff9c');
  }
  if (c.kinetic) {                                                                  // Surge: running stores kinetic energy
    if (f.onGround && Math.abs(f.vx) > 3 && f.state === 'free') f.kin = Math.min(100, f.kin + Math.abs(f.vx) * 0.12);
    else f.kin = Math.max(0, f.kin - 0.04);
    if (f.kin > 50 && G.frame % 5 === 0) boltFx(f.x + rand(-18, 18), f.y - 32 + rand(-24, 24), f.color);
  }
  if (f.hoverOn > 0) f.hoverOn--;
  if (c.jet && f.onGround && f.fuel < 100) f.fuel = Math.min(100, f.fuel + 2);          // Mecha: jetpack refuels on the ground
  if (c.special.type === 'rewind' && f.state !== 'dead' && f.state !== 'respawn') {    // Chrono: remember the last ~1.7 s of positions
    f.hist.push({ x: f.x, y: f.y, g: f.onGround, pct: f.percent }); if (f.hist.length > 100) f.hist.shift();
  }
  f.crawl = false;
  if (f.chill > 0) { f.chill--; if (f.chill % 9 === 0) burst(f.x, f.y - 32, '#bfeaff', 2, 2, 20, 'dot'); }
  if (f.poison > 0 && f.state !== 'dead' && f.state !== 'respawn') {               // Venom's poison: damage over time
    if (--f.poisonT <= 0) f.poison = 0;
    else if (f.poisonT % 30 === 0) { f.percent += 0.5 * f.poison; f.percentPop = 6; burst(f.x, f.y - 40, '#9dff2e', 2 + f.poison, 3, 20, 'dot'); }
  }
  if (f.onGround && f.state === 'free' && Math.abs(f.vx) > 3.5 && G.frame % 6 === 0) dust(f.x - f.facing * 8, f.y, 1);   // foot-dust puffs
  // signature auras: Volt crackles, Blaze smoulders, Chronos leaves after-images, Zephyr's skates spark
  if (c.elec && G.frame % 23 === f.id * 7 && f.state !== 'dead' && f.state !== 'respawn') boltFx(f.x + rand(-18, 18), f.y - rand(20, 60), f.color);
  if (c.fiery && G.frame % 4 === f.id && f.state !== 'dead' && f.state !== 'respawn')
    pushFx({ type: 'dot', x: f.x + rand(-14, 14), y: f.y - rand(10, 60), vx: rand(-0.3, 0.3), vy: -rand(0.8, 1.8), life: 22, max: 22, color: G.frame & 8 ? '#ffb03a' : '#ff5a1f', size: rand(2, 3.5), drag: 0.98, g: -0.02 });
  if (c.echoHits && (Math.abs(f.vx) > 3 || Math.abs(f.vy) > 5) && G.frame % 4 === 0 && f.state !== 'dead') ghost(f);
  if (c.skate && f.onGround && Math.abs(f.vx) > 4 && G.frame % 3 === 0) pushFx({ type: 'spark', x: f.x - sign(f.vx) * 6, y: f.y, vx: -f.vx * 0.3, vy: -rand(0.5, 2), life: 10, max: 10, color: f.color, w: 1.5, len: 2, drag: 0.9, g: 0.15 });
  const alive = f.state !== 'dead' && f.state !== 'respawn';
  if (c.beat && alive && beatPhase(f) === 0) {                                     // Pulse: the beat drops — a bass ring pulses from the speakers
    ring(f.x, f.y - 32, f.color, 18, 3.2, 12, 2);
  }
  if (c.magmaTrail && alive && f.onGround && Math.abs(f.vx) > 2.6 && G.frame % 10 === 0 &&             // Magma: moving leaves burning lava
      projs.filter(p => p.owner === f && p.trail).length < 6) {
    const F = c.special.flame;
    projs.push({ kind: 'flame', trail: true, x: f.x - f.facing * 18, y: f.y - 10, vx: 0, vy: 0, r: 11, owner: f, life: 60, max: 60, dmg: 1.5, base: 3, scale: 0.015, ang: F.ang, color: f.color, t: 0 });
  }
  if (c.magmaTrail && alive && G.frame % 6 === f.id * 3)                          // ...and drips molten rock
    pushFx({ type: 'dot', x: f.x + rand(-16, 16), y: f.y - rand(20, 60), vx: 0, vy: 0.6, life: 20, max: 20, color: G.frame & 8 ? '#ffd23a' : '#ff4a1a', size: rand(1.5, 3), drag: 1, g: 0.12 });
  if (c.stompShake && alive && G.frame % 5 === 0)                                                      // Titanus: exhaust smoke from the stacks
    pushFx({ type: 'cloud', x: f.x - f.facing * c.bw * 0.4, y: f.y - 96, vx: -f.facing * 0.3, vy: -0.8, life: 30, max: 30, color: 'rgba(80,80,90,0.45)', size: 6, drag: 0.98, g: 0 });
  if (c.fireTrail && alive && f.onGround && (f.dashT > 0 || Math.abs(f.vx) > 6.5) && G.frame % 6 === 0 &&   // Pyre: dashing leaves burning embers
      projs.filter(p => p.owner === f && p.trail).length < 6)
    projs.push({ kind: 'flame', trail: true, x: f.x - f.facing * 16, y: f.y - 10, vx: 0, vy: 0, r: 10, owner: f, life: 45, max: 45, dmg: 1.5, base: 3, scale: 0.015, ang: 75, color: f.color, t: 0 });
  if (c.slimeTrail && alive && f.onGround && Math.abs(f.vx) > 2.4 && G.frame % 11 === 0 &&             // Venom: a toxic slime trail
      projs.filter(p => p.owner === f && p.trail).length < 6) slimePuddle(f, f.x - f.facing * 14, f.y, 80, true);
  if (c.plasmaTrail && alive && (f.dashT > 0 || Math.abs(f.vx) > 7) && G.frame % 3 === 0) {           // Blitz: lightning after-images on every dash
    ghost(f); if (G.frame % 6 === 0) boltFx(f.x - sign(f.vx) * 20, f.y - 32 + rand(-14, 14), f.color);
  }
  if (c.rage && alive && f.percent > 60 && G.frame % 5 === f.id * 2)                                   // Inferno: the angrier, the bigger the flames
    pushFx({ type: 'dot', x: f.x + rand(-20, 20), y: f.y - rand(30, 80), vx: rand(-0.4, 0.4), vy: -rand(1.5, 3) * (1 + f.percent / 150), life: 22, max: 22, color: '#ff3a1a', size: 2 + f.percent / 60, drag: 0.98, g: -0.03 });
  if (c.holo && alive && G.frame % 11 === f.id * 5) burst(f.x + rand(-14, 14), f.y - rand(10, 64), f.color, 1, 1.5, 12, 'pixel');   // Drift: hologram pixels
  if (f.skinFx === 'gold' && G.frame % 9 === f.id * 4) burst(f.x + rand(-16, 16), f.y - rand(10, 70), '#fff3b0', 1, 1.5, 16, 'dot');    // Gold Edition skin: sparkle glints
  if (f.skinFx === 'void' && G.frame % 5 === f.id * 2 && f.state !== 'dead' && f.state !== 'respawn')                                     // Void skin: dark smoke trail
    pushFx({ type: 'cloud', x: f.x + rand(-12, 12), y: f.y - rand(8, 56), vx: -f.vx * 0.25, vy: -0.6, life: 34, max: 34, color: 'rgba(14,6,18,0.62)', size: 8, drag: 0.98, g: 0 });
  if (G.training && !f.cpu && f.state !== 'ultimate' && G.mode === 'play') f.ult = ULT_MAX;      // Training: the Ultimate is always ready
  if (f.pancakeT > 0 && --f.pancakeT > 0) { /* heavy landing: held flat as a pancake for two frames */ }
  else {                                                                          // squash & stretch: an under-damped spring, so every jump, landing and hit
    const air = !f.onGround && f.state === 'free' ? Math.min(1, Math.abs(f.vy) / 14) : 0;   // wobbles like jelly before it settles · fast falls / rises stretch the body along the motion
    f.svx = (f.svx || 0) * 0.66 + (1 - air * 0.1 - f.sx) * 0.3; f.svy = (f.svy || 0) * 0.66 + (1 + air * 0.16 - f.sy) * 0.3;
    f.sx = clamp(f.sx + f.svx, 0.45, 1.9); f.sy = clamp(f.sy + f.svy, 0.45, 1.9);
  }
  if (f.onGround && f.state === 'free') {
    const Mo = MOTION[c.id], cad = Mo ? Mo.c : 1, ph0 = f.runPhase; f.runPhase += Math.abs(f.vx) * 0.09;
    const plant = c.stompShake ? 3 : (Mo && Mo.plant) || 0;
    if (plant && Math.abs(f.vx) > 1.2 && Math.floor(ph0 * cad / Math.PI) !== Math.floor(f.runPhase * cad / Math.PI)) {   // heavy bruisers: every footfall shakes the screen
      G.shake = Math.max(G.shake, plant); dust(f.x + f.facing * 10, f.y, 2 + Math.round(plant));
    }
    if (Mo && Mo.fx && (f.dashT > 0 || Math.abs(f.vx) > c.run * 0.8) && G.frame % 3 === f.id) sprintFx(f, Mo.fx);   // each fighter's own sprint effect
  }
  if (f.dashT > 0 && f.dashT % 3 === 0) dashSparks(f);
  // ---- input buffer (6 frames) ----
  for (const n of BUF_KEYS) { if (inp[n]) f.buf[n] = 6; else if (f.buf[n] > 0) f.buf[n]--; }
  if (ultInput(f, o, inp)) inp = Object.assign(emptyInput(), { aimX: inp.aimX, aimY: inp.aimY });   // the Ultimate fired (game/ultimate.js): this step's other buttons are spent
  emoteInput(f, inp);                                                                               // emojis + the taunt cooldown (game/emotes.js)
  const dirIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  f.lastDir = dirIn;
  const shP = inp.shield && !f.prevShield; f.prevShield = inp.shield;     // shield press edge (used for teching)

  // ---- dash (double-tap A/D) ----
  if (inp.tapL || inp.tapR) {
    const d = inp.tapR ? 1 : -1;
    if (f.lastTapDir === d && G.frame - f.lastTapFrame <= 14) inp.dash = d;
    f.lastTapDir = d; f.lastTapFrame = G.frame;
  }
  if (inp.dash && f.onGround && f.state === 'free' && !(f.rootT > 0)) {
    f.dashT = 14; f.runMode = true; f.facing = inp.dash; f.vx = inp.dash * c.dash * sl; dust(f.x, f.y, 4); dashSparks(f);
  }

  const gf = o.gfield, crushed = !!gf && Math.hypot(f.x - gf.x, f.y - 32 - gf.y) < gf.r;          // Atlas's gravity well: heavier gravity inside it
  if (crushed && G.frame % 5 === f.id) burst(f.x + rand(-14, 14), f.y - rand(10, 60), o.color, 1, 2, 12, 'dot');
  if (crushed) f.confuse = Math.max(f.confuse || 0, 2);                                            // ...and left / right are inverted inside it
  if (f.antiGravT > 0) { f.antiGravT--; if (G.frame % 4 === 0) burst(f.x, f.y - 32, '#00ff9c', 1, 2, 10, 'pixel'); }   // Cipher's glitch: gravity reversed
  let physicsOn = true, grav = PHYS.grav * (c.grav || 1) * (ST.grav || 1) * (G.party && G.party.grav ? G.party.grav : 1) * (corrupted ? 0.62 : 1) * (crushed ? o.ch.special.mult : 1) * (f.antiGravT > 0 && !f.onGround ? -0.3 : 1), maxFall = PHYS.maxFall;   // (Stellar Observatory · Byte's field · Atlas's well)

  switch (f.state) {
    /* ---------------- FREE (idle / move / air) ---------------- */
    case 'free': {
      if (tryLedge(f, inp)) return;
      if (c.wallBounce) {                                        // Fang: kick off the side of the stage
        const side = wallContact(f, dirIn);
        if (side) {
          f.vx = side * 7.5; f.vy = -12.5; f.wallCD = 30; f.facing = side; f.flipT = 18; f.helpless = false; f.sx = 0.8; f.sy = 1.25;
          ring(f.x - side * 14, f.y - 40, f.color, 8, 5, 14, 3); dust(f.x - side * 10, f.y - 30, 4); G.shake = Math.max(G.shake, 2);
          break;
        }
      }
      if (c.cling) {                                             // Apex: grab onto the side of the stage
        const side = wallContact(f, dirIn);
        if (side) {
          f.state = 'wall'; f.wallSide = side; f.stateT = 0; f.vx = 0; f.vy = Math.min(f.vy, 1); f.facing = side;
          f.jumps = c.airJumps; f.helpless = false; f.specialUsed = false; f.sx = 1.2; f.sy = 0.85;
          burst(f.x - side * 14, f.y - 40, '#ffffff', 5, 4, 12);
          break;
        }
      }
      const g = f.onGround;
      if (g && tryEmote(f, inp)) break;                                                             // the taunt (G): rooted and vulnerable while it plays
      if (g && inp.shield && f.shield > 3 && f.shieldCD <= 0) { f.state = 'shield'; f.stateT = 0; f.vx *= 0.4; break; }
      if (!f.helpless) {
        if (consume(f, 'heavyP')) { startAttack(f, inp, true);  break; }
        if (consume(f, 'lightP')) { startAttack(f, inp, false); break; }
        if (f.buf.specialP > 0 && (g || !f.specialUsed || AIR_REUSE.has(c.special.type))) {
          if (startSpecial(f, inp)) { f.buf.specialP = 0; break; }
        }
      }
      if (f.buf.jumpP > 0 && !f.helpless) {
        if (g) { f.buf.jumpP = 0; f.state = 'squat'; f.stateT = 0; f.rootT = 0; f.sx = 1.14; f.sy = 0.86; f.svx = f.svy = 0; break; }   // (jumping uproots Titanis) · a little anticipation squash
        if (f.jumps > 0) {
          f.buf.jumpP = 0; f.jumps--; f.vy = -c.djump * JUMP_K; f.jumpRise = true; f.flipT = 20; gameEvent('jump', { f, air: true });
          f.vx = dirIn ? dirIn * Math.max(3.2, f.vx * dirIn) : f.vx * 0.7;
          ring(f.x, f.y - 6, f.color, 6, 3.5, 14, 3); f.sx = 0.72; f.sy = 1.38; f.svx = f.svy = 0; dust(f.x, f.y, 3);
        }
      }
      if (g && f.ground === 'plat' && inp.down) {                // drop through floating platforms
        if (++f.dropHeld >= 6) { f.dropT = 16; f.y += 2; f.onGround = false; f.ground = null; f.dropHeld = 0; }
      } else f.dropHeld = 0;
      if (!g && inp.down && f.vy > 0.5) { f.vy = PHYS.fastFall; maxFall = PHYS.fastFall; }   // fast fall (past the normal terminal velocity)
      if (!g && (c.jet || c.hover) && f.jumps <= 0) f.buf.jumpP = 0;     // no double jump: Space is held instead
      if (!g && inp.jump && !f.helpless) {
        if (c.jet && f.fuel > 0) {                                // Mecha: jetpack thrust while Space is held
          if (f.vy > -7.5) f.vy = Math.max(f.vy - 1.05, -7.5);
          f.fuel = Math.max(0, f.fuel - 1.3); f.jetT = 3;
          if (c.jetFx === 'buzz') { if (G.frame % 2 === 0) pushFx({ type: 'spark', x: f.x - f.facing * 12 + rand(-6, 6), y: f.y - 50 + rand(-6, 6), vx: -f.facing * 2, vy: rand(-1, 1), life: 6, max: 6, color: G.frame & 2 ? '#ffffff' : f.color, w: 1, len: 3, drag: 0.9, g: 0 }); }   // Vesper's wings buzz
          else if (c.jetFx === 'wind') { if (G.frame % 2 === 0) pushFx({ type: 'spark', x: f.x + rand(-14, 14), y: f.y + rand(-4, 6), vx: rand(-1, 1), vy: rand(3, 6), life: 12, max: 12, color: G.frame & 2 ? '#ffffff' : f.color, w: 1.5, len: 3, drag: 0.92, g: 0 }); }   // Gale rides the wind
          else if (G.frame % 2 === 0) burst(f.x - f.facing * 14, f.y - 30, '#ffb84d', 2, 3, 12);
        } else if (c.hover && f.hoverT > 0 && f.vy > -1) {        // Solaris: float gently down · Strix: glide silently forward
          f.vy = c.glide ? 1.3 : 0.1; f.hoverT--; f.hoverOn = 3;
          if (c.glide) f.vx = approach(f.vx, f.facing * c.airMax * 1.15, 0.35);
          if (G.frame % 4 === 0) burst(f.x, f.y + 4, f.color, 1, 2, 16, 'dot');
        }
      }
      // (v17 snappy air) real jumps rise under heavier gravity — their launch speed is scaled by JUMP_K so every apex height is
      // unchanged, the jump just gets there quicker — and falls accelerate harder to a faster terminal speed. Helpless and off-stage
      // falls stay gentle (recoveries keep their reach); hover, jetpacks and anti-gravity are untouched.
      if (!g && grav > 0 && !(f.hoverOn > 0 || f.jetT > 0 || f.antiGravT > 0)) {
        if (f.vy < 0) { if (f.jumpRise) grav *= RISE_K; }
        else { const soft = f.helpless || isOffStage(f); grav *= soft ? 1.12 : FALL_K; if (maxFall < PHYS.fastFall) maxFall = PHYS.maxFall * (soft ? 1.05 : 1.18); }
      }
      if (f.vy >= 0 || g) f.jumpRise = false;
      f.crawl = c.crawl && g && f.ground === 'stage' && inp.down;  // Chimera: low crawl
      if (g && f.rootT > 0) { f.vx = 0; if (dirIn) f.facing = dirIn; }      // Titanis rooted: can turn, can't move
      else if (g) {
        if (dirIn) {
          if (dirIn !== f.facing && Math.abs(f.vx) > 3) { f.turnT = 10; if (f.car) f.driftT = 18; }   // turning around at speed: skid (the F1 car drifts)
          if (sign(f.vx) === -dirIn && !f.car && !icy && !c.skate) f.vx *= 0.62;                 // (v17) a crisp reversal brake: no ice-skating out of a turn
          f.facing = dirIn;
          if (f.dashT > 0 && !f.crawl) f.vx = dirIn * c.dash * sl;
          else {
            const max = (f.crawl ? c.walk * 0.55 : f.runMode ? c.run * (f.car ? 1.08 : 1) : c.walk) * sl;
            const carK = f.car ? (sign(f.vx) === -dirIn && Math.abs(f.vx) > 2 ? 0.55 : 0.85) : 1;   // the car: a little slower off the line, and it slides wide when you reverse
            f.vx += dirIn * PHYS.groundAcc * (icy ? 0.45 : 1) * carK;      // icy stages (or Byte's field): slow to get going...
            if (Math.abs(f.vx) > max) f.vx = approach(f.vx, dirIn * max, 1.5);
          }
        } else { f.runMode = false; f.vx *= icy ? 0.95 : c.skate ? 0.972 : f.car ? 0.95 : PHYS.friction; if (Math.abs(f.vx) < 0.15) f.vx = 0; }   // ...and slow to stop (Zephyr glides on skates)
      } else {
        if (dirIn) f.facing = dirIn;
        const over = Math.abs(f.vx) > c.airMax * sl;
        if (over && (!dirIn || sign(f.vx) === dirIn)) f.vx *= 0.985;
        else if (dirIn) f.vx = approach(f.vx, dirIn * c.airMax * sl, c.airAcc);
        else f.vx *= 0.97;
      }
      break;
    }

    /* ---------------- JUMP SQUAT ---------------- */
    case 'squat': {
      f.stateT++; f.vx *= 0.8;
      if (consume(f, 'heavyP')) { startAttack(f, inp, true);  break; }
      if (consume(f, 'lightP')) { startAttack(f, inp, false); break; }
      if (f.stateT >= 3) {
        f.state = 'free'; f.vy = -c.jump * JUMP_K; f.jumpRise = true; f.onGround = false; f.ground = null; f.y -= 1; gameEvent('jump', { f, air: false });
        f.vx = dirIn ? dirIn * Math.max(Math.abs(f.vx), 3.5) : f.vx * 0.5; dust(f.x, f.y, 6);
        const Mo = MOTION[c.id], st = Mo ? 1.22 + (1 - Mo.sq) * 0.7 : 1.4;           // deeper crouch (motion.js sq) → bigger launch stretch (exaggerated: the spring overshoots on the way up)
        f.sx = 1 / Math.pow(st, 0.85); f.sy = st; f.svx = f.svy = 0;
      }
      break;
    }

    /* ---------------- ATTACK ---------------- */
    case 'attack': {
      const m = f.move;
      if (f.onGround) f.vx *= m.key === 'dashatk' ? 0.9 : c.skate ? 0.94 : 0.84;  // (the slide kick and skaters keep their momentum longer)
      else if (dirIn) f.vx = approach(f.vx, dirIn * c.airMax * 0.6, 0.12); else f.vx *= 0.985;
      // light combo: press light again after the hit connects
      if (m.chain && f.hitDone && f.stateT >= m.s + m.a - 1 && f.combo < c.chain && f.buf.lightP > 0) {
        f.buf.lightP = 0; f.combo++;
        if (m.air && !f.onGround) { beginMove(f, buildMove(f, m.key)); f.move.chain = true; break; }   // Sylph: aerials chain into themselves
        if (Math.abs(inp.aimX) > 8) f.facing = inp.aimX > 0 ? 1 : -1;
        beginMove(f, buildMove(f, f.combo >= c.chain ? 'jab3' : 'jab2'));
        break;
      }
      // smash charge: holding heavy freezes the wind-up near its end; release (or 1 s) to swing harder
      if (m.charge && !f.chargeDone && f.onGround && f.stateT === m.s - 3) {
        if (inp.heavy && f.chargeT < SMASH_CHARGE.max) {
          f.charging = true; f.chargeT++; f.vx *= 0.7;
          const sq = 0.1 + 0.06 * f.chargeT / SMASH_CHARGE.max, wob = Math.sin(f.chargeT * 0.9) * 0.02;   // cartoon wind-up: squashed down, trembling with stored power
          f.sx = 1 + sq + wob; f.sy = 1 - sq - wob;
          if (f.chargeT % 3 === 0) { const a = Math.random() * 6.28; pushFx({ type: 'dot', x: f.x + Math.cos(a) * 60, y: f.y - 34 + Math.sin(a) * 60, vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 4, life: 14, max: 14, color: f.color, size: 3, drag: 1, g: 0 }); }
          if (f.chargeT === SMASH_CHARGE.max) { ring(f.x, f.y - 34, '#ffffff', 10, 6, 14, 3); starFx(f.x, f.y - 34, f.color, 30); }
          break;                                                                   // (stateT stays put while charging)
        }
        f.chargeDone = true; f.charging = false;
        if (f.chargeT > 0) { f.sx = 0.86; f.sy = 1.16; }                           // ...then snaps into a stretched release
        if (f.chargeT > 0) {
          const k = f.chargeT / SMASH_CHARGE.max;
          m.dmg *= 1 + SMASH_CHARGE.dmg * k; m.base *= 1 + SMASH_CHARGE.kb * k; m.scale *= 1 + SMASH_CHARGE.kb * k; m.charged = k;
          if (k > 0.5) { ring(f.x, f.y - 34, f.color, 12, 8, 16, 4); G.shake = Math.max(G.shake, 2 + 3 * k); }
        }
      }
      if (f.stateT >= m.s && f.stateT < m.s + m.a && !f.hitDone) tryHit(f, o, m);
      if (m.multi > 1 && f.hitDone && f.stateT < m.s + m.a - 1 && (f.stateT - m.s) % 2 === 1) {   // multi-hit jab: re-arm for the next rapid hit
        m.multi--; f.hitDone = false;
        if (c.elec) { const hb = hitboxRect(f, m); boltFx(hb.x + hb.w / 2, hb.y + hb.h / 2, f.color); }
      }
      if (c.rocketSmash && m.heavy && f.stateT >= m.s - 3 && f.stateT < m.s + m.a) {           // Mecha: smashes are driven by rocket boosters
        f.jetT = 3; burst(f.x - f.facing * 22, f.y - 26, f.stateT & 1 ? '#ffb84d' : '#ff5a3d', 3, 5, 14);
        if (f.stateT === m.s && f.onGround && m.key === 'fsmash') f.vx += f.facing * 5;          // the side smash rockets forward
      }
      if (m.car) {                                                                     // Dino Nuggi's F1 car: floor it through the active frames
        if (f.stateT >= m.s - 2 && f.stateT < m.s + m.a) {
          if (f.onGround) f.vx = f.facing * m.car * (1 + (m.charged || 0) * 0.3);
          if (f.stateT % 2 === 0) pushFx({ type: 'cloud', x: f.x - f.facing * rand(30, 50), y: f.y - rand(2, 10), vx: -f.facing * rand(1, 3), vy: -rand(0.3, 1.2), life: 34, max: 34, color: 'rgba(220,220,230,0.5)', size: rand(8, 14), drag: 0.95, g: 0 });   // tyre smoke
          if (f.stateT % 3 === 0) dashSparks(f);
        } else if (f.stateT === m.s + m.a) { f.vx *= 0.4; burst(f.x + f.facing * 40, f.y - 20, '#ffffff', 10, 6, 14); dust(f.x, f.y, 8); }
      }
      if (c.quake && m.key === 'dsmash' && f.onGround && f.stateT === m.s) quake(f, 0.7);      // Quake: down-smash shockwaves
      if (c.beatWave && m.heavy && f.onGround && f.stateT === m.s) quake(f, m.onBeat ? 0.9 : 0.6);   // Pulse: smash attacks send floor beat-waves (bigger on the beat)
      if (c.guardian && m.heavy && f.stateT === m.s) {                                   // Aura: an ancestral guardian repeats the blow a step ahead
        const gx = f.x + f.facing * 70;
        G.echoes.push({ owner: f, x: gx, y: f.y - 40, at: G.frame + 12, dir: f.facing, r: 44, fx: 'guardian', m: { dmg: m.dmg * 0.5, base: m.base * 0.75, scale: m.scale * 0.85, ang: m.ang, hs: 4, echo: true } });
        pushFx({ type: 'ghost', x: gx, y: f.y, face: f.facing, rot: f.rot, snap: f.snap || null, color: '#9af0d8', life: 18, max: 18, vx: 0, vy: 0, drag: 1, g: 0 });
      }
      if (c.magmaPillars && m.heavy && f.onGround && f.stateT === m.s) {                 // Brimstone: a magma pillar explodes a step ahead
        const px = f.x + f.facing * 84;
        G.echoes.push({ owner: f, x: px, y: f.y - 40, at: G.frame + 10, dir: f.facing, r: 40, fx: 'pillar', m: { dmg: 6, base: 7, scale: 0.07, ang: 85, hs: 5, echo: true, heavy: true } });
        for (let k = 0; k < 6; k++) pushFx({ type: 'dot', x: px + rand(-20, 20), y: f.y - 2, vx: 0, vy: -rand(0.5, 2), life: 12, max: 12, color: '#ff6a1f', size: 3, drag: 1, g: 0 });   // the ground glows first
      }
      if (m.heavy && f.stateT >= m.s && f.stateT % 2 === 0) ghost(f);                 // motion-blur trail on heavy attacks
      if (c.burnout && !m.heavy && f.onGround && f.stateT === m.s) {                     // Dino Nuggi: tyre-spin burnout smoke on every light hit
        for (let k = 0; k < 4; k++) pushFx({ type: 'cloud', x: f.x - f.facing * rand(4, 20), y: f.y - rand(0, 8), vx: -f.facing * rand(0.5, 2), vy: -rand(0.2, 0.9), life: 30, max: 30, color: 'rgba(210,210,220,0.45)', size: rand(5, 9), drag: 0.96, g: 0 });
        dashSparks(f);
      }
      if (c.ink && f.stateT >= m.s && f.stateT < m.s + m.a) {                          // Ronin: the blade path leaves ink
        const hb = hitboxRect(f, m); inkFx(hb.x + hb.w * (f.facing > 0 ? 0.8 : 0.2), hb.y + hb.h / 2, 3, f.facing * 2, 0);
      }
      f.stateT++;
      if (f.stateT >= m.s + m.a + m.e) { f.state = 'free'; f.move = null; f.combo = 0; }
      break;
    }

    /* ---------------- SPECIAL ---------------- */
    case 'special': {
      const sp = f.sp; f.stateT++;
      if (sp.type === 'burst') {
        grav = 0;
        if (f.stateT <= sp.wind) {
          f.vx = f.vy = 0; if (f.stateT % 2 === 0) burst(f.x, f.y - 32, f.color, 2, 4, 12);
        } else if (f.stateT <= sp.wind + sp.dur) {
          f.vx = sp.dx * sp.speed; f.vy = sp.dy * sp.speed;
          if (sp.serpent) { const s = Math.sin((f.stateT - sp.wind) * 0.7) * 6; f.vx -= sp.dy * s; f.vy += sp.dx * s; }   // Pyre: a weaving, serpentine path
          if (!f.hitDone) tryHit(f, o, sp.m);
          if (sp.flames && f.stateT % 3 === 0) {                                                  // Blaze: burning flames left along the dash
            const F = c.special.flame;
            projs.push({ kind: 'flame', x: f.x, y: f.y - 12, vx: 0, vy: 0, r: F.r, owner: f, life: F.life, max: F.life, dmg: F.dmg, base: F.base, scale: F.scale, ang: F.ang, color: f.color, t: 0 });
          }
          if (sp.turbo || sp.up === 'inferno') {                                                  // Dino's engine exhaust / Blaze's inferno: fire trail
            burst(f.x - sp.dx * 18, f.y - 10 - sp.dy * 18, f.stateT & 1 ? '#ffd23a' : '#ff5a1f', 4, 6, 16); if (f.stateT % 2 === 0) ghost(f);
          }
          if (sp.up === 'rocket') burst(f.x + rand(-8, 8), f.y + 2, f.stateT & 1 ? '#ffb84d' : '#ff5a3d', 3, 5, 14);   // Mecha: rocket exhaust
          else if (sp.up === 'thunder' && f.stateT % 3 === 0) boltFx(f.x + rand(-14, 14), f.y - 32 + rand(-20, 20), f.color);   // Volt: crackling bolts
          else if (sp.gale || sp.boom) {                                                          // Gale's howling gust · Drift's supersonic streaks
            for (let k = 0; k < 2; k++) pushFx({ type: 'spark', x: f.x + rand(-16, 16), y: f.y - 32 + rand(-30, 30), vx: -sp.dx * rand(6, 12), vy: -sp.dy * rand(6, 12), life: 12, max: 12, color: k ? '#ffffff' : f.color, w: 1.6, len: 4, drag: 0.92, g: 0 });
          } else if (sp.wingDash) burst(f.x - sp.dx * 16, f.y - 44, '#ffffff', 2, 3, 18, 'dot');      // Valkyrie: shed feathers of light
          else if (sp.up === 'eruption' || sp.up === 'sun') burst(f.x + rand(-10, 10), f.y - 8, f.stateT & 1 ? '#ffd23a' : f.color, 3, 5, 16);   // Magma's eruption · Sol's sunrise
          else if (sp.up === 'beat' && f.stateT % 4 === 0) ring(f.x, f.y - 10, f.color, 6, 5, 12, 3);       // Pulse: bass rings
          else burst(f.x, f.y - 32, f.color, 2, 3, 16);
          if (sp.ink) inkFx(f.x - sp.dx * 20, f.y - 32, 3, -sp.dx * 3, 0);              // Ronin's draw-cut leaves a brush stroke
          if (f.stateT % 2 === 0) ghost(f);
          if (f.bonk && f.stateT > sp.wind + 1) f.stateT = sp.wind + sp.dur + 1;
          if (f.stateT > sp.wind + 2 && tryLedge(f, inp)) return;
        }
        if (f.stateT > sp.wind + sp.dur) {
          if (sp.boom && f.state === 'special') {                       // Drift: the sound barrier breaks where the dash ends
            f.sonic = { x: f.x, y: f.y - 32, r: 16, life: sp.boom.life, hit: false, S: sp.boom };
            ring(f.x, f.y - 32, '#ffffff', 12, 8, 14, 4); G.shake = Math.max(G.shake, 4);
          }
          f.state = 'free'; f.vx = sp.dx * 3; f.vy = sp.dy * 3; f.sp = null; f.helpless = !f.onGround && !sp.refund && !sp.wingDash;   // (Valkyrie's wing-dashes never leave her helpless)
          if (sp.refund && !f.onGround) f.jumps = Math.max(f.jumps, 1);      // Aether regains a jump
        }
      } else if (sp.type === 'orb') {
        grav = f.onGround ? PHYS.grav : PHYS.grav * 0.25; f.vx *= 0.88;
        if (f.stateT === sp.wind) spawnOrb(f, sp);
        if (f.stateT >= sp.wind + sp.end) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'tele') {                            // Ghost: teleport, then strike
        grav = 0; f.vx = f.vy = 0;
        if (f.stateT === sp.wind) {
          if (sp.zap) { boltFx(f.x, f.y - 32, '#ffffff'); boltFx(f.x, f.y - 40, f.color); }                       // Blitz: a crack of plasma at both ends
          doBlink(f); f.hitDone = false; f.invuln = Math.max(f.invuln, 4);
          if (sp.zap) { boltFx(f.x, f.y - 32, '#ffffff'); boltFx(f.x, f.y - 24, f.color); G.flash = Math.max(G.flash, 0.1); }
        }
        if (f.stateT > sp.wind && f.stateT <= sp.wind + 6 && !f.hitDone) tryHit(f, o, sp.m);
        if (f.stateT > sp.wind && tryLedge(f, inp)) return;
        if (f.stateT >= sp.wind + 14) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'dive') {                            // Apex: leap -> hang -> dive-kick
        const D = c.special;
        if (sp.phase === 'rise') {
          if (f.stateT >= D.rise || f.vy > 0) { sp.phase = 'wind'; sp.t0 = f.stateT; }
        } else if (sp.phase === 'wind') {
          grav = 0; f.vx *= 0.6; f.vy *= 0.6;
          if (f.stateT - sp.t0 >= D.wind) {                       // lock in the dive direction: toward the cursor, always downward
            let ddx = inp.aimX, ddy = Math.max(inp.aimY, 30); const l = Math.hypot(ddx, ddy) || 1; ddx /= l; ddy /= l;
            if (ddy < 0.5) { ddy = 0.5; ddx = (sign(ddx) || f.facing) * Math.sqrt(1 - ddy * ddy); }
            sp.dx = ddx; sp.dy = ddy; sp.phase = 'dive'; sp.t0 = f.stateT;
            if (Math.abs(ddx) > 0.1) f.facing = sign(ddx);
            sp.m.dir = f.facing;
            ring(f.x, f.y - 32, f.color, 8, 6, 16, 4); starFx(f.x, f.y - 32, f.color, 26);
          }
        } else {
          grav = 0; maxFall = 30;
          f.vx = sp.dx * D.speed; f.vy = sp.dy * D.speed;
          sp.m.ang = D.meteor ? (o.onGround ? 70 : -78) : (o.onGround ? 55 : -50);   // pops grounded targets up, spikes airborne ones (Talon: steeper, a true meteor)
          if (!f.hitDone) tryHit(f, o, sp.m);
          if (f.stateT % 2 === 0) ghost(f);
          burst(f.x, f.y - 12, f.color, 2, 3, 14);
          if (f.onGround || f.bonk) {                             // impact
            f.state = 'lag'; f.lagT = 12; f.sp = null; f.vx *= 0.15; f.vy = 0;
            dust(f.x, f.y, 10); ring(f.x, f.y, f.color, 10, 9, 20, 5); G.shake = Math.max(G.shake, 5);
            break;
          }
          if (f.stateT - sp.t0 > D.dur) { f.state = 'free'; f.sp = null; f.vx *= 0.4; f.vy = 4; }
        }
      } else if (sp.type === 'phase') {                           // Nyx: intangible dash, strike where it ends
        grav = 0;
        if (f.stateT <= sp.wind) { f.vx = f.vy = 0; }
        else if (f.stateT <= sp.wind + sp.dur) {
          f.vx = sp.dx * sp.speed; f.vy = sp.dy * sp.speed;
          if (f.stateT % 2 === 0) pushFx({ type: 'cloud', x: f.x + rand(-8, 8), y: f.y - 32 + rand(-14, 14), vx: 0, vy: -0.4, life: 26, max: 26, color: 'rgba(40,0,30,0.85)', size: 9, drag: 1, g: 0 });
          if (f.stateT % 2 === 0) ghost(f);
          if (f.stateT > sp.wind + 2 && tryLedge(f, inp)) return;
        } else {
          if (f.stateT === sp.wind + sp.dur + 1) {                 // turn on the target and strike in both directions
            f.vx *= 0.15; f.vy *= 0.15; f.facing = sign(o.x - f.x) || f.facing;
            sp.m.radial = true; delete sp.m.dir;
          }
          if (!f.hitDone && f.stateT <= sp.wind + sp.dur + 4) tryHit(f, o, sp.m);
          if (f.stateT >= sp.wind + sp.dur + 12) { f.state = 'free'; f.sp = null; f.helpless = false; }
        }
      } else if (sp.type === 'glitch') {                          // Glitch: hop, zap, hop, zap, hop, zap
        const D = c.special; grav = 0; f.vx = f.vy = 0;
        if (f.stateT % D.gap === 0 && sp.n < D.hops) {
          sp.n++; burst(f.x, f.y - 32, '#ff4dd8', 6, 5, 14, 'pixel');
          doBlink(f); f.hitDone = false; burst(f.x, f.y - 32, '#00ff9c', 8, 5, 14, 'pixel');
          if (tryLedge(f, inp)) return;
        }
        if (!f.hitDone && f.stateT % D.gap < 3 && sp.n > 0) tryHit(f, o, sp.m);
        if (f.stateT >= D.hops * D.gap + 8) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'stomp') {                           // Terra: stomp / plummet, then shockwaves
        const D = c.special;
        if (sp.phase === 'ground') {
          f.vx *= 0.7;
          if (f.stateT === D.wind) { quake(f); f.sx = 1.35; f.sy = 0.7; }
          if (f.stateT >= D.wind && f.stateT < D.wind + 4 && !f.hitDone) tryHit(f, o, sp.m);
          if (f.stateT >= D.wind + 18) { f.state = 'free'; f.sp = null; }
        } else {
          grav = 0;
          if (f.stateT < 7) { f.vx *= 0.8; f.vy = -2; }            // brief hang before the plunge
          else {
            maxFall = 30; f.vy = D.fall; f.vx *= 0.9;
            sp.m.ang = o.onGround ? 60 : -60;
            if (!f.hitDone) tryHit(f, o, sp.m);
            if (f.stateT % 2 === 0) ghost(f);
            if (f.onGround) { quake(f); f.state = 'lag'; f.lagT = 14; f.sp = null; f.sx = 1.35; f.sy = 0.7; break; }
            if (f.stateT > 90) { f.state = 'free'; f.sp = null; }
          }
        }
      } else if (sp.type === 'meditate') {                        // Zenith: hover in the barrier, then release the palm-blast
        const D = c.special, end = sp.wind + sp.active;
        grav = 0; f.vx *= 0.82; f.vy = f.stateT < end ? (f.onGround ? 0 : f.vy * 0.8 - 0.05) : f.vy;
        if (f.stateT < end && f.stateT % 4 === 0) { const a = Math.random() * 6.28; pushFx({ type: 'dot', x: f.x + Math.cos(a) * D.r, y: f.y - 36 + Math.sin(a) * D.r, vx: -Math.cos(a) * 2, vy: -Math.sin(a) * 2, life: 16, max: 16, color: '#ffc95a', size: 2.5, drag: 1, g: 0 }); }
        if (f.stateT === end) {
          const P = D.palm, k = 1 + Math.min(3, sp.absorbed) * 0.25;                                            // every absorbed hit powers the release
          ring(f.x, f.y - 36, '#ffffff', 12, 9, 18, 6); ring(f.x, f.y - 36, '#ffc95a', 10, 7, 22, 5); starFx(f.x, f.y - 36, '#ffc95a', 50); G.shake = Math.max(G.shake, 4);
          if (canBeHit(o) && Math.hypot(o.x - f.x, o.y - f.y) < P.r) deliver(f, o, { dmg: P.dmg * k, base: P.base * k, scale: P.scale, ang: 40, hs: 6, heavy: true }, sign(o.x - f.x) || f.facing, o.x, o.y - 32, o.state === 'shield');
        }
        if (f.stateT >= end + sp.end) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'sink') {                            // Umbra: melt into the shadow, glide unseen, erupt beneath the foe
        const D = c.special;
        if (sp.phase === 'down') {
          f.vx *= 0.7; f.invuln = Math.max(f.invuln, 2);
          if (f.stateT % 2 === 0) burst(f.x, f.y - 4, '#1a0a30', 2, 3, 18, 'cloud');
          if (f.stateT >= D.wind) { sp.phase = 'under'; sp.t0 = f.stateT; }
        } else if (sp.phase === 'under') {
          f.invuln = Math.max(f.invuln, 2);
          const dir = f.cpu ? (Math.abs(o.x - f.x) > 24 ? sign(o.x - f.x) : 0) : dirIn, k = f.stateT - sp.t0;
          f.vx = dir * D.speed; if (dir) f.facing = dir;
          if (G.frame % 3 === 0) pushFx({ type: 'cloud', x: f.x + rand(-10, 10), y: f.y - 4, vx: 0, vy: -0.3, life: 20, max: 20, color: 'rgba(30,10,60,0.6)', size: 8, drag: 1, g: 0 });
          const go = (!f.cpu && k > 6 && (inp.specialP || inp.lightP || inp.heavyP)) || (f.cpu && Math.abs(o.x - f.x) < 34) || k >= D.max || !f.onGround;
          if (go) { sp.phase = 'up'; sp.t0 = f.stateT; f.vx = 0; f.hitDone = false; f.invuln = Math.max(f.invuln, 6); burst(f.x, f.y - 10, '#1a0a30', 14, 7, 20, 'cloud'); ring(f.x, f.y, f.color, 10, 7, 16, 4); }
        } else {
          const k = f.stateT - sp.t0; f.vx *= 0.8;
          if (k === 1 && f.onGround) { f.vy = -7; f.onGround = false; f.ground = null; f.y -= 1; }
          if (k < 7 && !f.hitDone) tryHit(f, o, sp.m);
          if (k >= 22) { f.state = 'free'; f.sp = null; }
        }
      } else if (sp.type === 'temper') {                          // Forge: hammer into the forge-core, glowing hotter and hotter
        f.vx *= 0.8; if (!f.onGround) { grav *= 0.4; f.vy *= 0.9; }
        if (f.stateT % 2 === 0) burst(f.x + f.facing * 26, f.y - 20, f.stateT & 2 ? '#ffd23a' : '#ff6a1f', 2, 4, 14);
        if (f.stateT === sp.wind) {
          f.heatN = c.special.charges; textFx('MOLTEN!', f.x, f.y - 110, '#ffb03a');
          ring(f.x, f.y - 30, '#ffb03a', 10, 7, 18, 5); burst(f.x, f.y - 30, '#ff6a1f', 18, 8, 22); G.shake = Math.max(G.shake, 4);
        }
        if (f.stateT >= sp.wind + 10) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'hook') {                            // Strider: throw the hook → latch on and swing, or yank the opponent in
        const D = c.special;
        if (sp.phase === 'throw') {
          if (!f.onGround) { grav *= 0.3; f.vy *= 0.9; } f.vx *= 0.85;
          sp.d += D.speed; sp.hx = f.x + sp.dx * sp.d; sp.hy = f.y - 40 + sp.dy * sp.d;
          let anchor = null;
          if (canBeHit(o) && rectCircle(bodyRect(o), sp.hx, sp.hy, 12)) {
            if (D.dash) {                                                 // Rogue: ride the line straight into the foe for a cutlass strike
              sp.ax = o.x - sign(o.x - f.x) * 30; sp.ay = o.y; sp.phase = 'pull'; sp.t0 = f.stateT; sp.strike = true;
              ring(sp.hx, sp.hy, f.color, 6, 5, 12, 3); if (f.onGround) { f.onGround = false; f.ground = null; f.y -= 2; }
            } else {
              deliver(f, o, { dmg: D.dmg, base: D.base, scale: D.scale, ang: 22, hs: 4 }, sign(f.x - o.x) || -f.facing, sp.hx, sp.hy, o.state === 'shield');
              sp.phase = 'retract';
            }
          } else if ((anchor = hookAnchor(sp.hx - sp.dx * D.speed / 2, sp.hy - sp.dy * D.speed / 2) || hookAnchor(sp.hx, sp.hy))) {   // (checked at half-steps so it can't skip a thin platform)
            sp.ax = anchor[0]; sp.ay = anchor[1]; sp.phase = 'pull'; sp.t0 = f.stateT;
            ring(sp.ax, sp.ay, '#ffffff', 6, 5, 12, 3); burst(sp.ax, sp.ay, '#d8b07a', 6, 4, 12);
            if (f.onGround) { f.onGround = false; f.ground = null; f.y -= 2; }
          } else if (sp.d >= D.range) sp.phase = 'retract';
        } else if (sp.phase === 'pull') {
          grav = 0;
          const tx = sp.strike ? sp.ax : sp.ax + sign(sp.ax - f.x) * 14, ty = sp.ay - 4, ddx = tx - f.x, ddy = ty - f.y, dist = Math.hypot(ddx, ddy) || 1;
          f.vx = ddx / dist * D.pull; f.vy = ddy / dist * D.pull;
          if (f.stateT % 2 === 0) ghost(f);
          if (!sp.strike && tryLedge(f, inp)) return;
          if (sp.strike && canBeHit(o) && Math.hypot(o.x - f.x, o.y - f.y) < 70) {      // arrival: the cutlass strike
            f.facing = sign(o.x - f.x) || f.facing;
            deliver(f, o, { dmg: D.dmg, base: D.base, scale: D.scale, ang: 40, hs: 6, heavy: true }, f.facing, o.x, o.y - 32, o.state === 'shield');
            inkFx(o.x, o.y - 36, 6, f.facing * 5, 0); f.state = 'free'; f.sp = null; f.vx *= 0.25; f.vy = -4; f.helpless = false; break;
          }
          if (dist < D.pull + 6 || f.stateT - sp.t0 > 26 || f.bonk) {           // let go at the anchor with the swing's momentum
            f.state = 'free'; f.sp = null; f.vx *= 0.55; f.vy = Math.min(f.vy * 0.5, -6); f.helpless = false; f.jumps = Math.max(f.jumps, 1);
          }
        } else {                                                  // reel the hook back in
          if (!f.onGround) grav *= 0.5; f.vx *= 0.85;
          sp.d -= D.speed * 1.4; sp.hx = f.x + sp.dx * Math.max(0, sp.d); sp.hy = f.y - 40 + sp.dy * Math.max(0, sp.d);
          if (sp.d <= 0) { f.state = 'free'; f.sp = null; }
        }
      } else if (sp.type === 'warcry') {                          // Valkyrie: raise the spear and let out a Battle Cry
        const D = c.special; f.vx *= 0.8;
        if (f.stateT === sp.wind) {
          f.buffT = D.buff; textFx('BATTLE CRY!', f.x, f.y - 110, '#ffd36e');
          ring(f.x, f.y - 40, '#ffd36e', 14, 9, 22, 6); ring(f.x, f.y - 40, '#ffffff', 10, 6, 18, 4); starFx(f.x, f.y - 60, '#ffd36e', 50);
          burst(f.x, f.y - 60, '#ffffff', 16, 8, 20, 'dot'); G.shake = Math.max(G.shake, 5);
          if (canBeHit(o) && Math.hypot(o.x - f.x, o.y - f.y) < D.r)          // the shout itself shoves anyone close
            deliver(f, o, { dmg: D.dmg, base: D.base, scale: D.scale, ang: 35, hs: 4 }, sign(o.x - f.x) || f.facing, o.x, o.y - 32, o.state === 'shield');
        }
        if (f.stateT >= sp.wind + sp.end) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'flare') {                           // Sol: the sun gathers over Sol's head, then detonates as a solar flare
        const D = c.special;
        grav = f.onGround ? grav : grav * 0.15; f.vx *= 0.8; if (!f.onGround) f.vy *= 0.85;
        if (f.stateT < sp.wind && f.stateT % 2 === 0) { const a = Math.random() * 6.28;
          pushFx({ type: 'dot', x: f.x + Math.cos(a) * 80, y: f.y - 40 + Math.sin(a) * 80, vx: -Math.cos(a) * 5, vy: -Math.sin(a) * 5, life: 14, max: 14, color: f.stateT & 2 ? '#fff1b8' : f.color, size: 3, drag: 1, g: 0 }); }
        if (f.stateT === sp.wind) {
          ring(f.x, f.y - 40, '#ffffff', 16, 12, 22, 7); ring(f.x, f.y - 40, f.color, 14, 9, 26, 6); burst(f.x, f.y - 40, '#fff1b8', 28, 12, 24); starFx(f.x, f.y - 40, '#ffd36e', 90);
          G.flash = Math.max(G.flash, 0.35); G.shake = Math.max(G.shake, 8);
          if (canBeHit(o) && Math.hypot(o.x - f.x, (o.y - 32) - (f.y - 40)) < D.r + 20) {
            const blocked = o.state === 'shield';
            deliver(f, o, { dmg: D.dmg, base: D.base, scale: D.scale, ang: 50, hs: 8, heavy: true }, sign(o.x - f.x) || f.facing, o.x, o.y - 32, blocked);
          }
        }
        if (f.stateT >= sp.wind + sp.end) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'shoot') {                           // Orion's arrow · Kraken's water jet · Vex's volley
        grav = f.onGround ? grav : grav * 0.4; f.vx *= 0.88; if (!f.onGround) f.vy *= 0.92;
        if (f.stateT === sp.wind) spawnShot(f, sp);
        if (f.stateT >= sp.wind + sp.end) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'star') {                            // Nova: call the star, a marker appears where it will land
        grav = f.onGround ? grav : grav * 0.3; f.vx *= 0.85;
        if (f.stateT % 3 === 0) burst(f.x + rand(-20, 20), f.y - 70, f.color, 1, 2, 14, 'dot');
        if (f.stateT === sp.wind) { spawnStar(f, sp.tx); starFx(f.x, f.y - 80, f.color, 30); }
        if (f.stateT >= sp.wind + 12) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'laser') {                           // Lux: long focus (light gathers at the hand), then the instant beam
        grav = f.onGround ? grav : grav * 0.25; f.vx *= 0.8; if (!f.onGround) f.vy *= 0.85;
        if (f.stateT < sp.wind && f.stateT % 2 === 0) { const a = Math.random() * 6.28, hx = f.x + sp.dx * 26, hy = f.y - 40 + sp.dy * 26;
          pushFx({ type: 'dot', x: hx + Math.cos(a) * 50, y: hy + Math.sin(a) * 50, vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 4, life: 12, max: 12, color: f.color, size: 2.5, drag: 1, g: 0 }); }
        if (f.stateT === sp.wind) fireLaser(f, o);
        if (sp.beam && sp.beam.t > 0) sp.beam.t--;
        if (f.stateT >= sp.wind + 16) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'counter') {                         // Paladin: shield up; a hit during the window is countered (see deliver)
        f.vx *= 0.7;
        const endAt = sp.countered ? sp.countered + 16 : sp.wind + sp.active + sp.end;
        if (f.stateT >= endAt) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'tendril') {                         // Nyx: summon the tendril at the mark
        f.vx *= 0.8;
        if (f.stateT === sp.wind) spawnTendril(f, sp.tx, sp.ty);
        if (f.stateT >= sp.wind + 14) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'missiles') {                        // Mecha: fire the barrage one missile at a time
        const D = c.special;
        grav = f.onGround ? grav : grav * 0.3; f.vx *= 0.88; if (!f.onGround) f.vy *= 0.9;
        if (f.stateT >= D.wind && sp.n < D.count && (f.stateT - D.wind) % D.gap === 0) spawnMissile(f, sp, sp.n++);
        if (f.stateT >= D.wind + D.count * D.gap + 8) { f.state = 'free'; f.sp = null; }
      } else if (sp.type === 'rewind') {                          // Chrono: race back along the remembered path
        physicsOn = false; f.vx = f.vy = 0;
        const n = sp.path.length - 1, p = sp.path[Math.min(n, Math.round(f.stateT / 12 * n))];
        f.x = p.x; f.y = p.y; ghost(f);
        if (f.stateT % 3 === 0) ring(f.x, f.y - 32, f.color, 6, 3, 12, 2);
        if (f.stateT >= 12) {
          f.state = 'free'; f.sp = null; f.onGround = false; f.ground = null; f.helpless = false; f.invuln = Math.max(f.invuln, 6);
          ring(f.x, f.y - 32, '#ffffff', 10, 8, 20, 4); starFx(f.x, f.y - 32, f.color, 40); textFx('REWIND', f.x, f.y - 96, f.color);
          if (c.special.restoreDmg && sp.pct !== undefined && sp.pct < f.percent) {                // Chronos-II: the paradox undoes the damage too
            textFx('-' + Math.round(f.percent - sp.pct) + '%', f.x, f.y - 120, '#ffd36e'); f.percent = sp.pct; f.percentPop = 14;
          }
        }
      } else if (sp.type === 'flurry') {                          // Chimera: rapid claw swipes, the last one launches
        const D = c.special, k = f.stateT - D.wind;
        if (!f.onGround) grav *= 0.3;
        f.vx = f.facing * D.speed * (k < 0 ? 0.3 : 1);
        if (D.rise && k >= 0 && k < D.hits * D.every) f.vy = Math.min(f.vy, -D.rise);   // Sylph: the spin carries her upward
        if (k >= 0 && k % D.every === 0 && sp.n < D.hits) {
          sp.n++; f.hitDone = false;
          if (sp.n === D.hits) sp.m = Object.assign({}, sp.m, { dmg: D.last.dmg, base: D.last.base, scale: D.last.scale, ang: D.last.ang, hs: 6, heavy: true });
        }
        if (k >= 0 && k % D.every < 3 && !f.hitDone) tryHit(f, o, sp.m);
        if (k >= D.hits * D.every + 10) { f.state = 'free'; f.sp = null; }
      } else {                                                    // blink
        grav = 0; f.vx = f.vy = 0;
        if (f.stateT === sp.wind) doBlink(f);
        if (f.stateT > sp.wind && tryLedge(f, inp)) return;
        if (f.stateT >= sp.wind + 8) { f.state = 'free'; f.sp = null; }
      }
      break;
    }

    /* ---------------- SHIELD / PARRY ---------------- */
    case 'shield': {
      f.stateT++; f.vx *= 0.6; f.shield -= (c.shieldDrain || 0.34);                  // shield shrinks while held
      if (f.buf.jumpP > 0) { f.buf.jumpP = 0; f.state = 'squat'; f.stateT = 0; break; }
      if ((inp.tapL || inp.tapR) && f.stateT > 1) { startRoll(f, inp.tapR ? 1 : -1); f.shieldCD = 16; break; }   // shield + A/D = dodge roll
      if (f.shield <= 0) { breakShield(f); break; }               // held too long => shield break
      if (!inp.shield || !f.onGround) { f.state = 'free'; f.shieldCD = 12; }
      break;
    }

    /* ---------------- GRAB / HOLD (Dynamo) ---------------- */
    case 'grab': {
      f.vx *= 0.7;
      if (f.stateT >= 6 && f.stateT < 12) tryGrab(f, o);
      f.stateT++;
      if (f.state === 'grab' && f.stateT >= 28) f.state = 'free';
      break;
    }
    case 'holding': {
      const v = f.grabbing;
      if (!v || v.state !== 'grabbed') { f.state = 'free'; f.grabbing = null; break; }
      f.holdT++; f.vx *= 0.7;
      v.x = f.x + f.facing * 34; v.y = f.y; v.vx = v.vy = 0; v.facing = -f.facing;
      const l = consume(f, 'lightP'), h = consume(f, 'heavyP');
      if (l || h || f.holdT >= f.holdMax) {                    // aim a throw, or the hold ends in a crushing slam
        const d = aimDir(inp); let t = 'd';
        if (l || h) { if (d === 'u') t = 'u'; else if (d === 'd') t = 'd'; else t = (inp.aimX * f.facing >= 0) ? 'f' : 'b'; }
        throwTarget(f, v, t);
      }
      break;
    }
    case 'grabbed': {                                           // victim: mash buttons to escape
      physicsOn = false;
      if (inp.jumpP || inp.lightP || inp.heavyP || inp.specialP || inp.tapL || inp.tapR) f.escape += 9;
      f.escape += 0.12;
      if (f.escape >= 70 && f.grabber) releaseGrab(f.grabber, f, false);
      break;
    }

    /* ---------------- HITSTUN / STUN / LAG ---------------- */
    case 'hitstun': {
      if (f.ultHeld > 0) { f.ultHeld--; physicsOn = false; f.vx = f.vy = 0; break; }   // caught in an Ultimate: the attacker places us each frame
      if (f.frozenT > 0) {                                        // Rime's ice block: held in place (no DI, no tech), then the stored launch kicks in
        f.frozenT--; f.hitstun--; physicsOn = false; f.vx = f.vy = 0; f.rot = 0;
        if (f.frozenT === 0) {
          [f.vx, f.vy] = f.frozenV;
          if (f.inkTrap) { inkFx(f.x, f.y - 32, 16); f.inkTrap = false; }                      // Fable's ink bubble pops
          else { shatter(f.x, f.y - 32, '#d6fbff', 30); burst(f.x, f.y - 32, '#bfeaff', 14, 9, 18); G.shake = Math.max(G.shake, 5); }
        }
        break;
      }
      f.stateT++; f.hitstun--; grav = PHYS.hitGrav * c.grav * (crushed ? o.ch.special.mult : 1) * (f.antiGravT > 0 ? -0.3 : 1); maxFall = 24;   // heavies drop out of launches faster (combo food) · Atlas's well · Cipher's glitch
      if (dirIn) f.vx += dirIn * 0.14;                            // directional influence
      f.vx *= f.onGround ? 0.88 : 0.985;
      const spd = Math.hypot(f.vx, f.vy);
      if (f.percent > 100 && spd > 8) f.rot += (f.vx >= 0 ? 1 : -1) * Math.min(0.5, spd * 0.04);       // full 360° tumble at high damage
      else f.rot = Math.sin(f.stateT * 0.5) * Math.min(0.6, spd * 0.05);                                // light wobble otherwise
      if (shP && f.techCD <= 0) { f.techT = 14; f.techCD = 45; }                 // tech window
      if (spd > 8) { if (f.stateT % 2 === 0) ghost(f); burst(f.x, f.y - 32, f.color, 1, 2, 18, 'dot'); }   // launch trail
      if (spd > 12) speedLines(f);                                              // directional speed lines on strong launches
      if (f.hitstun <= 0) { f.state = 'free'; f.rot = 0; }
      break;
    }
    case 'stunned': {
      f.stunT--; f.vx *= 0.9;
      if (f.stunT % 12 === 0) burst(f.x, f.y - 70, '#ffe14d', 2, 3, 14, 'dot');
      if (f.stunT <= 0) { f.state = 'free'; f.shield = 40; }
      break;
    }
    case 'lag': {
      f.lagT--; f.vx *= 0.8;
      if (f.lagT <= 0) f.state = 'free';
      break;
    }
    /* ---------------- TAUNT / EMOTE (game/emotes.js · render/emotes3d.js) ---------------- */
    case 'emote': {
      f.stateT++; f.vx *= 0.75;
      if (f.stateT >= f.emoteDur || !f.onGround) { f.state = 'free'; f.emoteCD = 24; }
      break;
    }

    /* ---------------- DODGE / TECH ROLL ---------------- */
    case 'roll': {
      f.stateT++;
      f.vx = f.rollDir * (1 + 8 * (1 - f.stateT / ROLL_T));
      if (f.stateT < 15) f.invuln = Math.max(f.invuln, 1);
      if (f.stateT % 4 === 0) dust(f.x - f.rollDir * 8, f.y, 1);
      if (f.stateT >= ROLL_T) { f.state = 'free'; f.vx *= 0.3; }
      break;
    }

    /* ---------------- WALL CLING / SLIDE (Apex) ---------------- */
    case 'wall': {
      physicsOn = false; f.stateT++;
      f.x = f.wallSide < 0 ? STAGE.x - HW : STAGE.x + STAGE.w + HW;
      f.vx = 0; f.vy = Math.min(f.vy + 0.12, f.stateT > 90 ? 6 : 2.2); f.y += f.vy;       // slow slide, faster after a while
      if (f.stateT % 5 === 0) burst(f.x - f.wallSide * 14, f.y - 50, '#ffffff', 1, 2, 12, 'dot');   // scraping sparks
      if (consume(f, 'jumpP')) {                                 // wall jump
        f.state = 'free'; f.wallCD = 14; f.vy = -c.djump * 1.05 * JUMP_K; f.jumpRise = true; f.vx = f.wallSide * 4.5; f.sx = 0.8; f.sy = 1.25; f.wallKickT = 14; gameEvent('jump', { f, air: true });
        ring(f.x - f.wallSide * 10, f.y - 40, f.color, 6, 4, 14, 3); dust(f.x, f.y - 30, 4);
      } else if (f.buf.specialP > 0 || f.buf.lightP > 0 || f.buf.heavyP > 0) {          // act out of the cling next frame
        f.state = 'free'; f.wallCD = 20; f.vx = f.wallSide * 1.5;
      } else if (dirIn !== -f.wallSide || inp.down || f.y - BODY_H > STAGE.y + STAGE.h) {   // let go
        f.state = 'free'; f.wallCD = 20; f.vx = f.wallSide * 1.5;
      }
      break;
    }

    /* ---------------- LEDGE ---------------- */
    case 'ledge': {
      const L = f.ledge; f.ledgeT++; physicsOn = false;
      f.x = L.x + L.side * 20 * (f.scale || 1); f.y = L.y + 72 * (f.scale || 1); f.vx = f.vy = 0;
      if (f.ledgeT >= 18) {
        if (consume(f, 'jumpP')) {                                 // ledge jump
          L.owner = null; f.ledge = null; f.state = 'free'; f.ledgeCD = 24;
          f.vy = -12.5; f.vx = -L.side * 3.2; f.jumps = f.ch.airJumps;
        } else if (shP) {                                                                 // ledge roll: shield = roll up and well onto the stage
          f.state = 'climb'; f.stateT = 0; f.climbRoll = true; f.facing = -L.side;
        } else if (consume(f, 'lightP') || consume(f, 'heavyP') || dirIn === -L.side) {   // climb up
          f.state = 'climb'; f.stateT = 0; f.climbRoll = false;
        } else if (inp.down || dirIn === L.side || f.ledgeT > 300) {                      // let go
          L.owner = null; f.ledge = null; f.state = 'free'; f.ledgeCD = 30;
        }
      }
      break;
    }
    case 'climb': {
      const L = f.ledge; f.stateT++; physicsOn = false; f.invuln = Math.max(f.invuln, 2);
      const dur = f.climbRoll ? 28 : 20, endX = f.climbRoll ? 96 : 24;            // the roll travels much further onto the stage
      const p = clamp(f.stateT / dur, 0, 1), up = clamp(p / 0.4, 0, 1);
      if (f.climbRoll) {                                                           // pop up over the edge, then roll along the floor
        f.x = lerp(L.x + L.side * 20 * (f.scale || 1), L.x - L.side * endX, p * p * (3 - 2 * p));
        f.y = L.y + 72 * (f.scale || 1) * (1 - up) - Math.sin(Math.PI * up) * 12;
        if (f.stateT % 5 === 0 && up >= 1) dust(f.x, L.y, 1);
      } else {
        f.x = lerp(L.x + L.side * 20 * (f.scale || 1), L.x - L.side * endX, p);
        f.y = L.y + 72 * (f.scale || 1) * (1 - p) - Math.sin(Math.PI * p) * 16;
      }
      if (f.stateT >= dur) {
        f.x = L.x - L.side * endX; f.y = L.y; f.state = 'free'; f.onGround = true; f.ground = 'stage'; f.climbRoll = false;
        L.owner = null; f.ledge = null; f.ledgeCD = 20; f.vx = f.vy = 0; f.invuln = 6;
      }
      break;
    }

    /* ---------------- ULTIMATE (game/ultimate.js) ---------------- */
    case 'ultimate': {
      const r = ultUpdate(f, o);
      physicsOn = r.phys; if (r.grav !== undefined) grav = r.grav; if (r.fall) maxFall = r.fall;
      break;
    }

    /* ---------------- DEATH / RESPAWN ---------------- */
    case 'dead': {
      if (--f.deadT <= 0 && f.stocks > 0) respawn(f);
      return;
    }
    case 'respawn': {
      f.respT++; f.vx = f.vy = 0; f.x = 640;
      const t = clamp(f.respT / 40, 0, 1);
      f.y = lerp(-120, 200, 1 - Math.pow(1 - t, 3));
      f.invuln = 999;
      if (f.respT >= 50 && (anyInput(inp) || f.respT >= 200)) { f.state = 'free'; f.invuln = 110; f.vy = 0; f.onGround = false; }
      return;
    }
  }

  if (physicsOn) physics(f, grav, maxFall);
  if (f.state !== 'shield' && f.state !== 'stunned' && f.shield < 100) f.shield = Math.min(100, f.shield + 0.16 * (c.shieldRegen || 1));   // shield regen

  // ---- blastzones ----
  if (f.state !== 'dead') {
    const cy = f.y - 32;
    if (f.x < BZ.l || f.x > BZ.r || cy < BZ.t || cy > BZ.b) ko(f);
  }
}
