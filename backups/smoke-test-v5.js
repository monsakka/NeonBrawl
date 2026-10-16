// Smoke test: loads www/index.html in a hidden Electron window, plays a few
// seconds of CPU-vs-CPU on every stage, and fails on any JavaScript error.
// Run with:  npm test
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720 });
  const errors = [];
  win.webContents.on('console-message', e => { if (e.level === 'error') errors.push(e.message); });
  win.webContents.on('render-process-gone', () => errors.push('renderer crashed'));
  const arg = process.argv.find(a => a.endsWith('.html'));            // optional: test another build, e.g. the single-file bundle
  const page = arg ? path.resolve(arg) : path.join(__dirname, '..', 'www', 'index.html');
  await win.loadFile(page);
  console.log('Testing ' + path.relative(process.cwd(), page));

  const result = await win.webContents.executeJavaScript(`(async () => {
    const errs = [];
    window.addEventListener('error', e => errs.push(e.message));
    const B = window.__brawl;
    if (!B) return { errs: ['window.__brawl missing - game did not start'] };
    for (const s of ['scr-how', 'scr-settings', 'scr-select', 'scr-stage', 'scr-setup', 'scr-main']) { B.go(s); B.render(); B.drawPreviews(); }
    for (let st = 0; st < B.STAGES.length; st++) {
      B.SEL.stage = st; B.SEL.p1 = st % B.CHARS.length; B.SEL.cpu = (st + 1) % B.CHARS.length; B.SEL.diff = B.DIFFS.length - 1;
      B.startMatch();
      B.fighters[0].cpu = true;   // let the AI play both sides
      for (let i = 0; i < 60 * 15; i++) { B.step(); if (i % 10 === 0) B.render(); }
    }
    // Button-masher: a "human" P1 pressing random keys with every fighter, to exercise specials, rolls, wall-cling...
    const KEYS = ['KeyA', 'KeyD', 'KeyS', 'KeyE', 'Space'], TAPS = ['Space', 'M0', 'M2', 'KeyQ', 'KeyA', 'KeyD'];
    const seen = {}, poses = {};
    for (let ci = 0; ci < B.CHARS.length; ci++) {
      B.SEL.p1 = ci; B.SEL.cpu = (ci * 5 + 3) % B.CHARS.length; B.SEL.stage = ci % B.STAGES.length; B.SEL.randStage = ci % 3 === 0;
      B.startMatch(); B.G.mode = 'play';
      for (let i = 0; i < 60 * 12; i++) {
        if (i % 20 === 0) { B.keys.clear(); for (const k of KEYS) if (Math.random() < 0.3) B.keys.add(k); }
        if (Math.random() < 0.15) B.pressed.add(TAPS[Math.floor(Math.random() * TAPS.length)]);
        B.mouse.cx = 640 + Math.sin(i * 0.05) * 400; B.mouse.cy = 360 + Math.cos(i * 0.07) * 250;
        B.step(); if (i % 10 === 0) B.render();
        for (const f of B.fighters) { poses[B.computePose(f)[1]] = 1; }
        for (const f of B.fighters) { seen[f.state] = 1; if (f.sp) seen['sp:' + f.sp.type] = 1; if (f.poison) seen.poison = 1; if (f.decoy) seen.decoy = 1; if (f.wall) seen.aegisWall = 1; }
        if (B.G.mode === 'over') B.startMatch();
      }
    }
    // Targeted checks for specific mechanics
    const fail = msg => errs.push('CHECK FAILED: ' + msg);
    const run = n => { for (let i = 0; i < n; i++) B.step(); };
    const setup = (p1, cpu, stage) => { B.SEL.p1 = B.CHARS.findIndex(c => c.id === p1); B.SEL.cpu = B.CHARS.findIndex(c => c.id === cpu); B.SEL.stage = stage; B.SEL.randStage = false; B.startMatch(); B.G.mode = 'play'; B.keys.clear(); B.pressed.clear(); };
    // 1. Apex wall-cling + wall-jump
    setup('apex', 'titan', 0);
    { const f = B.fighters[0], S = B.STAGES[0].main; B.fighters[1].x = 900;
      Object.assign(f, { x: S.x - 14, y: S.y + 112, vx: 0, vy: 1, onGround: false, state: 'free' });      // low enough that it can't grab the ledge
      B.keys.add('KeyD'); run(4);
      if (f.state !== 'wall') fail('Apex did not cling to the wall (state=' + f.state + ')');
      B.pressed.add('Space'); run(1); B.keys.clear();
      if (f.state !== 'free' || f.vy >= 0) fail('Apex wall-jump did not launch upward'); }
    // 2. Shield + direction = dodge roll
    setup('titan', 'velocity', 2); B.fighters[1].x = 1000;
    { const f = B.fighters[0]; run(5); B.keys.add('KeyE'); run(4); B.pressed.add('KeyD'); run(1);
      if (f.state !== 'roll') fail('shield + D did not start a roll (state=' + f.state + ')'); B.keys.clear(); run(30); }
    // 3. CPU Apex (no recovery special) gets back from off-stage, using its jump + the wall
    let survived = 0;
    for (let k = 0; k < 6; k++) {
      setup('titan', 'apex', k); B.SEL.diff = 2; B.G.diff = 2;
      const c = B.fighters[1], S = B.STAGES[k].main;
      Object.assign(c, { x: S.x - 140, y: S.y + 40, vx: -2, vy: 2, onGround: false, state: 'free', jumps: 1 });
      Object.assign(B.fighters[0], { x: S.x + S.w - 40 });
      let ok = false; for (let i = 0; i < 400 && !ok; i++) { B.step(); if (c.onGround) ok = true; if (c.state === 'dead') break; }
      if (ok) survived++;
    }
    if (survived < 5) fail('CPU Apex recovered only ' + survived + '/6 times');
    const S0 = B.STAGES[0].main, airborne = (f, x, y) => Object.assign(f, { x, y, vx: 0, vy: 0, onGround: false, ground: null, state: 'free', jumps: 0 });
    // 4. Mecha jetpack climbs while Space is held
    setup('mecha', 'titan', 0); B.fighters[1].x = 1000;
    { const f = B.fighters[0]; airborne(f, 640, 300); B.keys.add('Space'); run(20); B.keys.clear();
      if (!(f.y < 300)) fail('Mecha jetpack did not climb (y=' + f.y.toFixed(0) + ')'); if (!(f.fuel < 100)) fail('Mecha jetpack used no fuel'); }
    // 5. Solaris hover slows the fall
    setup('solaris', 'titan', 0); B.fighters[1].x = 1000;
    { const f = B.fighters[0]; airborne(f, 640, 100); B.keys.add('Space'); run(30); B.keys.clear();
      if (!(f.y < 140)) fail('Solaris hover did not slow the fall (y=' + f.y.toFixed(0) + ')'); }
    // 6. Orion's light-arrow flies in a parabola (rises, then falls)
    setup('luna', 'titan', 0); B.fighters[1].x = 1100; B.fighters[1].cpu = false;
    { B.mouse.cx = 1000; B.mouse.cy = 200; run(3); B.pressed.add('KeyQ'); run(12);
      const a = B.projs.find(p => p.kind === 'arrow'); if (!a) fail('Orion did not loose an arrow');
      else { const vy0 = a.vy; run(30); if (!(a.vy > vy0 + 4)) fail('Orion arrow does not arc under gravity (vy ' + vy0.toFixed(1) + ' -> ' + a.vy.toFixed(1) + ')'); } run(60); }
    // 7. Paladin's counter stance negates a hit and strikes back
    setup('void', 'titan', 0); B.fighters[1].cpu = false;
    { const p = B.fighters[0], v = B.fighters[1]; p.x = 600; v.x = 660; v.facing = -1; p.facing = 1; B.mouse.cx = 900; B.mouse.cy = 560; run(1); B.pressed.add('KeyQ'); run(6);
      const p0 = p.percent, v0 = v.percent; B.G.hitstop = 0; v.facing = -1; v.state = 'attack'; v.move = buildMove(v, 'jab3'); v.stateT = v.move.s; v.hitDone = false; run(3);
      if (p.percent > p0) fail('Paladin counter stance did not negate the hit (' + p0 + ' -> ' + p.percent + ')');
      if (!(v.percent > v0)) fail('Paladin counter did not strike back (paladin ' + p.state + ' ' + JSON.stringify(p.sp) + ' t' + p.stateT + ', attacker ' + v.state + ' t' + v.stateT + ' hitDone ' + v.hitDone + ', x ' + p.x.toFixed(0) + '/' + v.x.toFixed(0) + ')'); run(40); }
    // 8. Chrono's rewind returns to an earlier position
    setup('chrono', 'titan', 0); B.fighters[1].x = 1100; B.fighters[1].cpu = false;     // (passive opponent so it can't interfere)
    { const f = B.fighters[0]; const x0 = f.x; B.keys.add('KeyD'); run(80); B.keys.clear(); const x1 = f.x; B.pressed.add('KeyQ'); run(20);
      if (!(Math.abs(f.x - x0) < Math.abs(x1 - x0) - 40)) fail('Chrono rewind did not move back (start ' + x0.toFixed(0) + ', moved to ' + x1.toFixed(0) + ', now ' + f.x.toFixed(0) + ')'); }
    // 9. Terra's stomp sends shockwaves; 10. Chimera's crawl lowers the hurtbox; 11. Tempest's updraft lifts it off-stage
    setup('terra', 'titan', 0); B.fighters[1].x = 1100; run(3); B.pressed.add('KeyQ'); run(12);
    if (B.projs.filter(p => p.kind === 'wave').length < 2) fail('Terra stomp made no shockwaves');
    setup('chimera', 'titan', 0); B.fighters[1].x = 1100; run(3); B.keys.add('KeyS'); run(3);
    if (!B.fighters[0].crawl) fail('Chimera did not crawl'); B.keys.clear();
    setup('tempest', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; airborne(f, S0.x - 90, S0.y + 60); f.vy = 3; run(1); B.mouse.cx = 640; B.mouse.cy = 360; B.pressed.add('KeyQ'); run(12);
      if (!(f.vy < -5 || f.y < S0.y + 40)) fail('Tempest updraft did not lift it (vy=' + f.vy.toFixed(1) + ')'); }
    // From here on the opponent is a passive dummy (no AI) so it can't interfere with the measurements
    const setupDummy = (p1, cpu, stage) => { setup(p1, cpu, stage); B.fighters[1].cpu = false; };
    // 12. Surge stores kinetic energy by running
    setupDummy('surge', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; f.x = 400; B.keys.add('KeyD'); run(50); B.keys.clear(); if (!(f.kin > 20)) fail('Surge stored no kinetic energy (' + f.kin.toFixed(0) + ')'); }
    // 13. Echo's soundwave confuses the opponent
    setupDummy('echo', 'titan', 0); B.fighters[0].x = 560; B.fighters[1].x = 680; run(3); B.pressed.add('KeyQ'); run(25);
    if (!(B.fighters[1].confuse > 0)) fail('Echo soundwave did not confuse');
    // 14. the roster is the prompt's 35 fighters
    { const want = ['DINO NUGGI', 'SYLPH', 'MECHA', 'VORTEX', 'STRIKER', 'GHOST', 'VOLT', 'BLAZE', 'AEGIS', 'TOXIN', 'KAGE', 'TITAN', 'ORION', 'NYX', 'CHRONOS',
                    'GAIA', 'AETHER', 'KRAKEN', 'CIPHER', 'PALADIN', 'BANSHEE', 'RONIN', 'VEX', 'APEX', 'NOVA', 'QUAKE', 'ZEPHYR', 'RIME', 'LUX',
                    'PULSE', 'VALKYRIE', 'MAGMA', 'SOL', 'GALE', 'DRIFT', 'ZENITH', 'VENOM', 'BLITZ', 'UMBRA', 'FANG', 'PRISM', 'FORGE', 'ECHO', 'TEMPEST',
                    'STRIDER', 'SPECTER', 'INFERNO', 'BYTE', 'TITANUS', 'APEX-X', 'STRIX', 'KURO', 'BISMUTH', 'AURA', 'NOX', 'HELIX', 'ZEALOT', 'PYRE',
                    'VESPER', 'ROGUE', 'TITANIS', 'CHRONOS-II', 'ZEN', 'FABLE', 'GOLIATH', 'ORIN', 'NYX-II', 'KRYP', 'ATLAS', 'SIREN', 'TALON', 'BRIMSTONE',
                    'MATRIX', 'VANGUARD', 'OMEGA'];
      const names = B.CHARS.map(c => c.name); if (names.length !== 75) fail('roster has ' + names.length + ' fighters');
      if (new Set(B.CHARS.map(c => c.id)).size !== B.CHARS.length) fail('duplicate fighter ids');
      for (const n of want) if (!names.includes(n)) fail('roster is missing ' + n); }
    // 15. Nyx backstab bonus
    setupDummy('nyx', 'titan', 0);
    { const n = B.fighters[0], v = B.fighters[1]; v.x = 640; v.facing = -1; n.x = 700; n.facing = -1; run(1); const p0 = v.percent; B.mouse.cx = 0; B.pressed.add('M0'); run(15);
      if (!(v.percent - p0 > 3.3)) fail('Nyx backstab did no bonus damage (' + (v.percent - p0).toFixed(1) + ')'); }
    // 16. every hazard spawns, telegraphs and hits someone standing in it
    for (const [sid, kind] of [['volcano', 'lava'], ['storm', 'lightning'], ['forge', 'flare'], ['peak', 'icicle']]) {
      setupDummy('titan', 'titan', B.STAGES.findIndex(s => s.id === sid)); B.SEL.hazards = true;
      const v = B.fighters[1]; v.cpu = false; B.fighters[0].x = 200;
      B.HZ.list.length = 0; B.HZ.t = 99999; B.spawnHazard(kind); const h = B.HZ.list[0];
      const spot = kind === 'icicle' ? 400 : 640;                                                    // (platforms shelter you from icicles)
      if (kind === 'flare') h.y = B.STAGES.find(s => s.id === sid).main.y - 26; else h.x = spot;    // aim it at an open spot on the main stage
      v.x = spot;
      const p0 = v.percent; run(kind === 'icicle' ? 90 : 120);
      if (!(v.percent > p0)) fail('hazard ' + kind + ' never hit (' + p0 + ' -> ' + v.percent + ', v at ' + v.x.toFixed(0) + ',' + v.y.toFixed(0) + ' ' + v.state + ', hazard ' + JSON.stringify(h) + ', stage ' + B.G.mode + ')');
    }
    // 17. finishing a match: FINISH! freeze, then the victory screen renders
    setupDummy('velocity', 'glitch', 13);
    { const v = B.fighters[1]; v.stocks = 1; B.ko(v); run(200); B.render(); B.drawVictory();
      if (B.G.mode !== 'over') fail('match did not reach the victory screen (mode=' + B.G.mode + ')'); }
    // 19. aerials: forward / back / down attacks in the air pick fair / bair / dair, and bair hits behind
    for (const [cx, cy, key] of [[900, 340, 'fair'], [380, 340, 'bair'], [640, 600, 'dair'], [640, 330, 'nair'], [640, 100, 'uair']]) {
      setupDummy('aether', 'titan', 0); B.fighters[1].x = 1100;
      const f = B.fighters[0]; airborne(f, 640, 300); f.facing = 1; B.TOUCH.using = false; B.mouse.cx = cx; B.mouse.cy = cy;
      B.G.cam = { x: 640, y: 330, z: 1 }; B.pressed.add('M0'); run(1);
      if (!f.move || f.move.key !== key) fail('aimed light attack in the air should be ' + key + ' (got ' + (f.move && f.move.key) + ')');
      if (key === 'bair' && (f.facing !== 1 || f.move.dir !== -1)) fail('bair turned around or hits forward');
    }
    // 20. dash attack: light attack out of a dash = slide kick
    setupDummy('velocity', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; f.x = 400; B.mouse.cx = 1200; B.mouse.cy = 600; B.pressed.add('KeyD'); run(2); B.pressed.add('KeyD'); B.keys.add('KeyD'); run(3);
      B.pressed.add('M0'); run(1); B.keys.clear();
      if (!f.move || f.move.key !== 'dashatk') fail('light attack while dashing should be a dash attack (got ' + (f.move && f.move.key) + ', dashT ' + f.dashT + ')'); }
    // 21. smash charge: holding heavy freezes the wind-up, then releases a stronger smash
    setupDummy('titan', 'velocity', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; B.mouse.cx = 1200; B.mouse.cy = 520; B.keys.add('M2'); B.pressed.add('M2'); run(40);
      const t0 = f.stateT; run(5);
      if (!f.charging || f.stateT !== t0) fail('holding heavy did not charge the smash (charging=' + f.charging + ', stateT ' + t0 + ' -> ' + f.stateT + ')');
      const dmg0 = B.MOVES.fsmash.dmg * f.ch.heavyDmg; B.keys.delete('M2'); run(2);         // (uncharged damage for this fighter)
      if (f.charging || !(f.move && f.move.charged > 0.3 && f.move.dmg > dmg0 * 1.1)) fail('released charge did not power up the smash (' + JSON.stringify(f.move && { c: f.move.charged, d: f.move.dmg }) + ')');
      run(60); }
    // 22. balance patch: Paladin gone, Sylph buffed, Mecha slower
    { const sy = B.CHARS.find(c => c.id === 'sylph'), me = B.CHARS.find(c => c.id === 'mecha');
      if (sy.airJumps !== 2 || sy.lightSpd > 0.75) fail('Sylph buff missing'); if (me.heavySpd < 1.15 || me.jump > 12.5 || !me.endLag) fail('Mecha rebalance missing'); }
    // 23. pose library: 100+ named poses, and the match play above showed a good spread of them
    if (B.RIG_POSES.length < 100) fail('only ' + B.RIG_POSES.length + ' named poses');
    { const unknown = Object.keys(poses).filter(p => !B.RIG_POSES.includes(p)); if (unknown.length) fail('poses missing from RIG_POSES: ' + unknown.join(', ')); }
    if (Object.keys(poses).length < 60) fail('only ' + Object.keys(poses).length + ' different poses seen during play');
    // 24. forward tilt: side light attack while walking forward is a thrust, standing still is a jab
    setupDummy('aether', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; f.x = 500; B.TOUCH.using = false; B.mouse.cx = 1000; B.mouse.cy = 560; B.G.cam = { x: 640, y: 330, z: 1 };
      B.keys.add('KeyD'); run(4); B.pressed.add('M0'); run(1); B.keys.clear();
      if (!f.move || f.move.key !== 'ftilt') fail('walking side attack should be ftilt (got ' + (f.move && f.move.key) + ')');
      run(40); B.G.hitstop = 0; B.fighters[1].x = 1100; run(20); B.pressed.add('M0'); run(1); if (!f.move || f.move.key !== 'jab') fail('standing side attack should be jab (got ' + (f.move && f.move.key) + ', state ' + f.state + ', hitstop ' + B.G.hitstop + ')'); run(30); }
    // 25. ledge roll: shield while hanging rolls far onto the stage, invulnerable
    setupDummy('aether', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0], S = B.STAGES[0].main; airborne(f, S.x - 20, S.y + 70); f.vy = 2; run(4);
      if (f.state !== 'ledge') fail('did not grab the ledge for the roll test (state=' + f.state + ')');
      else { run(20); B.keys.add('KeyE'); run(1); B.keys.clear(); if (f.state !== 'climb' || !f.climbRoll) fail('shield on ledge did not start a ledge roll');
             run(50); if (f.state !== 'free' || !(f.x > S.x + 80)) fail('ledge roll did not end well onto the stage (x=' + f.x.toFixed(0) + ', S.x=' + S.x + ', state=' + f.state + ', t=' + f.stateT + ', hitstop=' + B.G.hitstop + ')'); } }
    // 26. up-specials: Mecha's rockets and Spark's thunder burst go up when Q is aimed up; Spark's side Q is still the flat dash
    for (const id of ['mecha', 'spark']) {
      setupDummy(id, 'titan', 0); B.fighters[1].x = 1100;
      const f = B.fighters[0]; airborne(f, 640, 300); f.fuel = 0; B.TOUCH.using = false; B.G.cam = { x: 640, y: 330, z: 1 }; B.mouse.cx = 645; B.mouse.cy = 60;
      run(1); B.pressed.add('KeyQ'); run(1);
      if (!(f.sp && f.sp.up)) fail(id + ' up-special did not start (sp=' + JSON.stringify(f.sp && f.sp.type) + ')');
      run(22); if (!(f.y < 220)) fail(id + ' up-special did not climb (y=' + f.y.toFixed(0) + ')');
    }
    setupDummy('spark', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; B.mouse.cx = 1100; B.mouse.cy = 560; run(1); B.pressed.add('KeyQ'); run(1);
      if (!f.sp || f.sp.up || Math.abs(f.sp.dy) > 0.31) fail('Spark side Q should still be the flat Volt Rush'); run(40); }
    // 27. resolution follows the screen and the view is full-bleed: the logical view has the window's own aspect ratio and always
    //     contains the 1280 × 720 design area (no letterbox), and a 2× display gets a 2× backing store; rendering still works
    { const cv = document.getElementById('game'), real = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio'), V = B.VIEW;
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true }); B.sizeCanvas();
      const r = cv.getBoundingClientRect(), want = Math.round(Math.min(3, Math.max(1, r.width * 2 / V.LW)) * 4) / 4;      // on-screen width × 2, in 0.25 steps
      const bleed = Math.abs(V.LW / V.LH - r.width / r.height) < 0.01 && V.LW >= 1280 && V.LH >= 720 && (V.LW === 1280 || V.LH === 720);
      if (!bleed) fail('view is not full-bleed (' + V.LW + 'x' + V.LH + ' for a ' + r.width + 'x' + r.height + ' screen)');
      if (want < 1.5 || cv.width !== Math.round(V.LW * want) || cv.height !== Math.round(V.LH * want)) fail('canvas did not scale to a 2x screen (' + cv.width + 'x' + cv.height + ', expected ' + want + 'x of ' + V.LW + 'x' + V.LH + ')');
      const wr = document.getElementById('wrap').getBoundingClientRect();
      if (Math.abs(wr.width - innerWidth) > 1 || Math.abs(wr.height - innerHeight) > 1) fail('the game does not fill the window (letterboxed: ' + wr.width + 'x' + wr.height + ')');
      B.render();
      if (real) Object.defineProperty(window, 'devicePixelRatio', real); else delete window.devicePixelRatio; B.sizeCanvas(); }
    // 28. skins: every fighter has 3 distinct skins; clicking your picked fighter's card again cycles its skin; mirror matches never share a skin
    for (const ch of B.CHARS) { const cols = new Set([0, 1, 2].map(k => B.skinOf(ch, k).color + B.skinOf(ch, k).fill)); if (cols.size !== 3) fail(ch.id + ' does not have 3 distinct skins'); }
    { B.go('scr-select'); B.SEL.slot = 'p1'; const ci = B.CHARS.findIndex(c => c.id === 'dino'), card = document.querySelector('.tile[data-char="' + ci + '"]');
      delete B.SEL.skins.dino; card.click();
      if (B.SEL.p1 !== ci) fail('clicking a card did not pick the fighter');
      card.click(); if ((B.SEL.skins.dino || 0) !== 1) fail('clicking the picked card again did not cycle its skin (' + B.SEL.skins.dino + ')');
      card.querySelector('.skindots').click(); if (B.SEL.skins.dino !== 2) fail('skin dots did not cycle the skin');
      B.SEL.cpu = ci; B.startMatch();
      if (B.fighters[0].color === B.fighters[1].color) fail('mirror match: both fighters wear the same skin');
      if (B.fighters[0].skin !== 2) fail('P1 is not wearing the chosen skin');
      delete B.SEL.skins.dino; try { localStorage.setItem('neonbrawl.skins', JSON.stringify(B.SEL.skins)); } catch (e) {} B.go('scr-main'); }   // leave no saved skin behind
    // 29. Dino Nuggi's Turbo Engine Boost launches upward; Blaze's fire dash leaves flames that burn
    setupDummy('dino', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0], y0 = f.y; B.mouse.cx = 700; B.mouse.cy = 120; run(1); B.pressed.add('KeyQ'); run(16);
      if (!(f.y < y0 - 60)) fail('Dino turbo boost did not launch upward (' + y0 + ' -> ' + f.y.toFixed(0) + ')'); run(60); }
    setupDummy('blaze', 'titan', 0);
    { const f = B.fighters[0], v = B.fighters[1]; f.x = 420; v.x = 760; B.mouse.cx = 1200; B.mouse.cy = 560; run(1); B.pressed.add('KeyQ'); run(12);
      const n = B.projs.filter(p => p.kind === 'flame').length; if (n < 2) fail('Blaze fire dash left no flames (' + n + ')'); run(60); }
    // 30. results screen: the winner celebrates, the loser sits dazed
    setupDummy('dino', 'blaze', 0); { const v = B.fighters[1]; v.stocks = 1; B.ko(v); run(200);
      if (!B.VIC.loser || !B.VIC.loser.defeat) fail('results screen has no defeated fighter');
      if (B.VIC.dummy.victoryStyle !== 'champagne') fail('Dino should celebrate with champagne'); for (let i = 0; i < 60; i++) { B.step(); B.drawVictory(); }
      if (B.computePose(B.VIC.loser)[1] !== 'defeat:blaze') fail("loser is not in Blaze's own defeat pose (" + B.computePose(B.VIC.loser)[1] + ')'); }
    // 38. bespoke motion: every fighter has its own gait profile, run / air poses and a unique victory + defeat animation pair
    { const ids = B.CHARS.map(c => c.id), sig = o => JSON.stringify(o);
      for (const id of ids) { if (!B.MOTION[id]) fail('no motion profile for ' + id); if (!B.VICTORY_ANIM[id]) fail('no victory animation for ' + id); if (!B.DEFEAT_ANIM[id]) fail('no defeat animation for ' + id); }
      const gaits = new Set(ids.map(id => sig(B.MOTION[id]))), wins = new Set(ids.map(id => sig(B.VICTORY_ANIM[id]))), losses = new Set(ids.map(id => sig(B.DEFEAT_ANIM[id])));
      if (gaits.size !== ids.length) fail('motion profiles are not all unique (' + gaits.size + ' of ' + ids.length + ')');
      if (wins.size !== ids.length) fail('victory animations are not all unique (' + wins.size + ')');
      if (losses.size !== ids.length) fail('defeat animations are not all unique (' + losses.size + ')');
      setupDummy('titan', 'velocity', 0); B.fighters[1].x = 1100;
      for (const id of ids) {                                            // each fighter, running and in the air, shows its own named pose
        const f = B.fighters[0]; f.ch = B.CHARS.find(c => c.id === id); f.state = 'free'; f.onGround = true; f.vx = f.ch.run; f.runMode = true; f.dashT = 0; f.turnT = 0; f.landT = 0; f.crawl = false;
        const run = B.computePose(f)[1]; if (run !== 'run:' + id) fail(id + ' runs with a shared cycle (' + run + ')');
        f.onGround = false; f.vy = -8; f.flipT = 0; f.jetT = 0; f.hoverOn = 0; f.helpless = false; f.wallKickT = 0;
        const air = B.computePose(f)[1]; if (air !== 'air:' + id) fail(id + ' has no own air pose (' + air + ')');
        f.flipT = 10; if (B.computePose(f)[1] !== 'air:double:' + id) fail(id + ' has no own double jump'); f.flipT = 0;
      }
      B.fighters[0].ch = B.CHARS.find(c => c.id === 'titan'); B.fighters[0].onGround = true; B.fighters[0].vy = 0; run(30); }
    // 30b. every fighter has its own victory celebration + particle effect, and all of them render
    { const w = B.fighters[0], savedCh = w.ch, styles = new Set();
      for (const ch of B.CHARS) {
        const vs = B.VICTORY_STYLES[ch.id]; if (!vs) { fail('no victory style for ' + ch.name); continue; }
        if (!B.VFX[vs[1]]) fail('unknown victory effect ' + vs[1] + ' for ' + ch.name);
        w.ch = ch; B.G.winner = w; B.showResult(); styles.add(vs.join('+'));
        for (let i = 0; i < 40; i++) { B.G.time++; B.drawVictory(); }
        const pose = B.computePose(B.VIC.dummy)[1]; if (!/^victory/.test(pose)) fail(ch.name + ' is not celebrating (' + pose + ')');
      }
      w.ch = savedCh; if (styles.size < 25) fail('victory celebrations are not individual enough (' + styles.size + ' unique)'); }
    // 31. the prompt's names, and the Featured roster (8 fighters, 6 stages) as the default with a Show-all toggle
    { const name = id => B.CHARS.find(c => c.id === id).name, sname = id => B.STAGES.find(s => s.id === id).name;
      if (name('velocity') !== 'STRIKER' || name('phantom') !== 'GHOST' || name('spark') !== 'VOLT') fail('fighter renames missing');
      const wantSt = ['Grand Prix Speedway', 'Grand Coliseum', 'Aetherial Peak', 'Cyber Metropolis', 'Sunset Sanctuary', 'Cosmic Zenith', 'Volcanic Core', 'Matrix Vault', 'Crystal Caverns', 'Floating Archipelago', 'Abyssal Trench',
                      'Clockwork Tower', 'Ruined Castle', 'Neon Dojo', 'Frozen Tundra', 'Toxic Wasteland', 'Orbital Station', "Shogun's Palace", 'Desert Mirage', 'Enchanted Forest', 'Haunted Manor', 'Final Destination',
                      'Neon Stadium', 'Sky Sanctuary', 'Neon Highway', 'Stellar Observatory', 'Neon Skyline Expressway', 'Forgotten Temple',
                      'Cyber Colosseum', 'Starfighter Dock', 'Quantum Citadel', 'Magma Caldera', 'Celestial Shrine', 'Neon Subways', 'Astral Void'];
      if (B.STAGES.length !== 35) fail('there should be 35 stages'); for (const n of wantSt) if (!B.STAGES.some(s => s.name === n)) fail('stage missing: ' + n);
      const saved = B.SET.roster; B.SET.roster = 'featured'; B.go('scr-stage'); B.go('scr-select');      // (refresh both select screens)
      const shown = [...document.querySelectorAll('#char-grid .tile')].filter(el => !el.classList.contains('off')).length;
      const shownSt = [...document.querySelectorAll('#stage-grid .card')].filter(el => !el.classList.contains('off')).length;
      if (shown !== 8) fail('featured roster shows ' + shown + ' fighters, not 8');
      if (B.STAGES.filter(s => ['speedway', 'neon', 'shrine', 'space', 'volcano', 'vault'].includes(s.id)).length !== 6 || shownSt !== 6) fail('featured stages show ' + shownSt + ', not 6');
      const ids = new Set(), stIds = new Set(); B.SEL.cpu = null; B.SEL.randStage = true;
      for (let k = 0; k < 40; k++) { B.startMatch(); ids.add(B.fighters[1].ch.id); stIds.add(B.currentStage().id); }
      for (const id of ids) if (!['dino', 'sylph', 'mecha', 'vortex', 'velocity', 'phantom', 'spark', 'blaze'].includes(id)) fail('random CPU picked ' + id + ' outside the featured roster');
      for (const id of stIds) if (!['speedway', 'neon', 'shrine', 'space', 'volcano', 'vault'].includes(id)) fail('random stage picked ' + id + ' outside the featured stages');
      document.getElementById('roster-btn').click();
      if (B.SET.roster !== 'all' || [...document.querySelectorAll('#char-grid .tile')].some(el => el.classList.contains('off'))) fail('"Show all" did not reveal every fighter');
      document.getElementById('roster-btn').click();                               // toggle back (this also saves the setting)
      if (B.SET.roster !== saved) document.getElementById('roster-btn').click();
      B.SEL.randStage = false; B.go('scr-main'); }
    // 32. Vortex's orb ricochets off the stage; Volt's jab hits several times; Mecha's side smash rockets forward
    setupDummy('vortex', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; airborne(f, 640, 330); B.mouse.cx = 700; B.mouse.cy = 700; B.G.cam = { x: 640, y: 330, z: 1 }; B.TOUCH.using = false; run(1); B.pressed.add('KeyQ'); run(30);
      const orb = B.projs.find(p => p.kind === 'orb'); if (!orb || orb.bounces > 1 || orb.vy >= 0) fail('Vortex orb did not ricochet off the stage (' + JSON.stringify(orb && { b: orb.bounces, vy: orb.vy }) + ')'); run(90); }
    setupDummy('spark', 'titan', 0);
    { const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 645; f.facing = 1; B.mouse.cx = 1000; B.mouse.cy = 560; run(1); const h0 = f.st.hits; B.pressed.add('M0'); run(14);
      if (f.st.hits - h0 < 2) fail('Volt jab did not multi-hit (' + (f.st.hits - h0) + ' hits)'); run(40); }
    setupDummy('mecha', 'titan', 0); B.fighters[1].x = 1100;
    { const f = B.fighters[0]; f.x = 500; B.mouse.cx = 1200; B.mouse.cy = 560; run(1); B.pressed.add('M2'); let fast = 0;
      for (let i = 0; i < 30; i++) { B.step(); fast = Math.max(fast, Math.abs(f.vx)); } if (!(fast > 5)) fail('Mecha side smash did not rocket forward (max vx ' + fast.toFixed(1) + ')'); run(40); }
    // 33. signature mechanics of the reworked roster
    const hitBy = (atk, def, fn, frames) => { setupDummy(atk, def, 0); const f = B.fighters[0], v = B.fighters[1]; B.TOUCH.using = false; B.G.cam = { x: 640, y: 330, z: 1 };
      fn(f, v); const p0 = v.percent; for (let i = 0; i < frames; i++) B.step(); return { f, v, dmg: v.percent - p0 }; };
    const Q = (f, cx, cy) => { B.mouse.cx = cx; B.mouse.cy = cy; B.step(); B.pressed.add('KeyQ'); };
    { const r = hitBy('titan', 'velocity', (f, v) => { f.x = 560; v.x = 620; Q(f, 900, 560); }, 10);              // Gaia: pillar erupts under the opponent
      if (!(r.dmg > 0 && r.v.vy < 0) || !r.f.wall || !r.f.wall.pillar) fail('Gaia pillar did not launch the opponent upward'); }
    { const r = hitBy('aether', 'titan', (f, v) => { f.x = 380; v.x = 900; Q(f, 1000, f.y - 34); }, 40);         // Lux: slow-starting laser hits across the stage
      if (!(r.dmg > 5)) fail('Lux laser did not hit at long range (' + r.dmg.toFixed(1) + ')'); }
    { const r = hitBy('solaris', 'titan', (f, v) => { f.x = 450; v.x = 800; Q(f, 800, 560); }, 80);              // Nova: a star falls on the mark
      if (!(r.dmg > 5)) fail('Nova star strike did not hit (' + r.dmg.toFixed(1) + ')'); }
    { const r = hitBy('nyx', 'titan', (f, v) => { f.x = 500; v.x = 700; Q(f, 700, 560); }, 40);                  // Nyx: tendril at mid range
      if (!(r.dmg > 5)) fail('Nyx tendril did not hit (' + r.dmg.toFixed(1) + ')'); }
    { const r = hitBy('chimera', 'titan', (f, v) => { f.x = 500; v.x = 680; Q(f, 900, 520); }, 30);              // Kraken: water jet shoves
      if (!(r.dmg > 2 && r.v.x > 690)) fail('Kraken water jet did not hit and shove (' + r.dmg.toFixed(1) + ', x ' + r.v.x.toFixed(0) + ')'); }
    { setupDummy('kitsune', 'titan', 0); const f = B.fighters[0]; Q(f, 1100, 520); for (let i = 0; i < 12; i++) B.step();   // Vex: one real orb, the rest fake
      const orbs = B.projs.filter(p => p.kind === 'foxorb'); if (orbs.length !== 3 || orbs.filter(p => !p.fake).length !== 1) fail('Vex volley should be 3 orbs with exactly 1 real'); }
    { const r = hitBy('frost', 'titan', (f, v) => { f.x = 600; v.x = 660; f.facing = 1; B.mouse.cx = 1000; B.mouse.cy = 520; B.step(); B.pressed.add('M2'); }, 22);   // Rime: smash freezes
      if (!(r.v.frozenT > 0) || Math.abs(r.v.vx) > 0.01) fail('Rime smash did not freeze the opponent in place (frozenT ' + r.v.frozenT + ')');
      for (let i = 0; i < 40; i++) B.step(); if (r.v.frozenT > 0) fail('Rime ice block never shattered'); }
    { const r = hitBy('chrono', 'titan', (f, v) => { f.x = 600; v.x = 650; f.facing = 1; B.mouse.cx = 1000; B.mouse.cy = 520; B.step(); B.pressed.add('M0'); }, 6);   // Chronos: delayed echo
      const n = B.G.echoes.length; if (n < 1) fail('Chronos hit did not schedule a time-echo'); }
    { const r = hitBy('venom', 'titan', (f, v) => { f.x = 450; v.x = 600; Q(f, 900, 520); }, 14);                // Toxin: long-range snare
      if (r.v.state !== 'grabbed' && r.v.state !== 'hitstun') fail('Toxin snare did not grab from range (state ' + r.v.state + ')'); for (let i = 0; i < 90; i++) B.step(); }
    { setupDummy('mirage', 'titan', 0); const f = B.fighters[0]; B.keys.add('KeyE'); run(4); B.pressed.add('KeyD'); run(1); B.keys.clear();   // Kage: clone on dodge
      if (!f.decoy) fail('Kage dodge did not leave a shadow clone'); run(30); }
    { setupDummy('surge', 'titan', 0); const f = B.fighters[0]; f.x = 500; B.keys.add('KeyD'); run(30); B.keys.clear(); const v0 = Math.abs(f.vx); run(10);   // Zephyr glides
      if (!(Math.abs(f.vx) > v0 * 0.5)) fail('Zephyr did not glide on skates (' + v0.toFixed(1) + ' -> ' + Math.abs(f.vx).toFixed(1) + ')'); }
    { const r = hitBy('dino', 'titan', (f, v) => { f.x = 450; v.x = 620; f.facing = 1; B.mouse.cx = 1100; B.mouse.cy = 520; B.step(); B.pressed.add('M2'); }, 40);   // Dino: F1 car smash
      if (!(r.dmg > 12)) fail('Dino car smash did not land hard (' + r.dmg.toFixed(1) + ')'); }
    // 34. the six newest fighters' signature mechanics
    { const r = hitBy('pulse', 'titan', (f, v) => { f.x = 450; v.x = 760; Q(f, 900, f.y - 34); }, 50);            // Pulse: sound-disk at range
      if (!(r.dmg > 3)) fail('Pulse sound-disk did not hit (' + r.dmg.toFixed(1) + ')'); }
    { setupDummy('pulse', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 500; B.mouse.cx = 900; B.mouse.cy = 520; run(1); B.pressed.add('M2');   // Pulse: smashes send beat-waves
      let waves = 0; for (let i = 0; i < 40; i++) { B.step(); waves = Math.max(waves, B.projs.filter(p => p.kind === 'wave' && p.owner === f).length); }
      if (waves < 2) fail('Pulse smash sent no floor beat-waves'); run(30); }
    { setupDummy('valkyrie', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 500;            // Valkyrie: Battle Cry buff, then two (and only two) air dashes
      Q(f, 900, 520); run(30); if (!(f.buffT > 0)) fail('Valkyrie Battle Cry did not power her up');
      B.pressed.add('Space'); run(12); let dashes = 0;
      for (let k = 0; k < 3; k++) { Q(f, f.x + 200, f.y - 200); B.step(); if (f.state === 'special' && f.sp && f.sp.wingDash) dashes++; run(16); }
      if (dashes !== 2) fail('Valkyrie should get exactly 2 aerial wing-dashes per jump (got ' + dashes + ')'); run(80); }
    { setupDummy('magma', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 450; Q(f, 700, f.y - 160);   // Magma: lob lands as a lava pool
      let pool = 0; for (let i = 0; i < 90; i++) { B.step(); pool = Math.max(pool, B.projs.filter(p => p.pool).length); }
      if (pool < 3) fail('Magma lob did not spread into a lava pool (' + pool + ')'); }
    { setupDummy('magma', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 400; B.keys.add('KeyD'); run(4); B.pressed.add('KeyD'); run(40); B.keys.clear();   // ...and a burning trail
      if (!B.projs.some(p => p.trail && p.owner === f)) fail('Magma running left no magma trail'); run(60); }
    { const r = hitBy('sol', 'titan', (f, v) => { f.x = 600; v.x = 700; Q(f, 900, 520); }, 40);                    // Sol: solar flare all around
      if (!(r.dmg > 8)) fail('Sol solar flare did not hit (' + r.dmg.toFixed(1) + ')'); }
    { setupDummy('gale', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0];                              // Gale: flies on the wind while Space is held
      f.y -= 120; f.onGround = false; f.ground = null; f.jumps = 0; f.vy = 2; B.keys.add('Space'); let rose = false;
      for (let i = 0; i < 25; i++) { B.step(); if (f.vy < -2) rose = true; } B.keys.clear();
      if (!rose || !(f.fuel < 100)) fail('Gale did not fly on the wind (fuel ' + f.fuel.toFixed(0) + ')'); run(60); }
    { setupDummy('drift', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 400; Q(f, 900, f.y - 34);   // Drift: sonic boom where the dash ends
      let boom = false; for (let i = 0; i < 30; i++) { B.step(); if (f.sonic && f.sonic.S) boom = true; }
      if (!boom) fail('Drift sonic dash made no sonic boom'); run(30); }
    // 36. fighters 36-50: signature mechanics (aimed with the touch stick's direction, which is camera-independent)
    { const AQ = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; B.TOUCH.using = true; B.TOUCH.sx = dx / l; B.TOUCH.sy = dy / l; B.step(); B.pressed.add('KeyQ'); };
      const S0 = B.STAGES[0].main, done = () => { B.TOUCH.using = false; B.keys.clear(); };
      const freeze = v => { v.state = 'lag'; v.lagT = 9999; v.vx = 0; };      // (the dummy is human-controlled too: hold it still so the test's inputs don't move it)
      { setupDummy('zenith', 'velocity', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 660;          // Zenith: barrier absorbs + reflects, then the palm-blast
        AQ(1, 0); run(8); B.projs.push({ kind: 'orb', x: f.x + 160, y: f.y - 36, vx: -9, vy: 0, r: 12, owner: v, life: 60, dmg: 6, base: 5, scale: 0.08, ang: 30, color: '#ffffff', t: 0 });
        run(60); done();
        if (f.percent > 0) fail('Zenith took damage through the meditation barrier (' + f.percent.toFixed(1) + ')');
        if (!(v.percent > 0)) fail('Zenith palm-blast / reflected orb never hit'); }
      { setupDummy('serpent', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 450; AQ(1, -0.2);   // Venom: spit splashes into slime
        let puddle = false; for (let i = 0; i < 90; i++) { B.step(); if (B.projs.some(p => p.kind === 'slime' && !p.trail)) puddle = true; } done();
        if (!puddle) fail('Venom acid spit left no slime puddle'); }
      { setupDummy('blitz', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 450; const x0 = f.x; AQ(1, 0); run(12); done();   // Blitz: plasma blink
        if (!(f.x > x0 + 150)) fail('Blitz plasma blink did not teleport (' + x0 + ' -> ' + f.x.toFixed(0) + ')'); }
      { setupDummy('umbra', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 640; freeze(v);   // Umbra: sink, glide under, erupt
        AQ(1, 0); run(12); if (!(f.sp && f.sp.type === 'sink')) fail('Umbra did not sink into the shadow');
        B.TOUCH.using = false; B.keys.add('KeyD'); run(26); B.keys.clear(); v.x = f.x + 20; B.pressed.add('KeyQ'); run(16); done();
        if (!(v.percent > 0)) fail('Umbra did not erupt under the opponent (x ' + f.x.toFixed(0) + ')'); run(30); }
      { setupDummy('fang', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0];                              // Fang: wall bounce
        f.x = S0.x - 22; f.y = S0.y + 80; f.onGround = false; f.ground = null; f.vy = 0; f.jumps = 0; f.ledgeCD = 60; B.keys.add('KeyD'); let up = false;
        for (let i = 0; i < 30; i++) { B.step(); if (f.vy < -8) up = true; } done();
        if (!up) fail('Fang did not kick off the stage wall'); run(60); }
      { setupDummy('prism', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 800; AQ(1, -1);   // Prism: crystal turret
        run(160); done(); if (!(v.percent > 0)) fail('Prism crystal never hit the opponent'); }
      { setupDummy('smith', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; AQ(1, 0); run(26); done();   // Forge: molten charges
        if (f.heatN !== 3) fail('Forge Molten Temper did not charge the hammer (' + f.heatN + ')');
        B.mouse.cx = 1000; B.mouse.cy = 520; B.step(); B.pressed.add('M2'); run(40); if (f.heatN !== 2) fail('molten charge not spent on a heavy (' + f.heatN + ')'); }
      { setupDummy('mimic', 'luna', 0); const f = B.fighters[0]; B.fighters[1].x = 1100; AQ(1, 0); let arrow = false;   // Echo copies Orion's arrow
        for (let i = 0; i < 16; i++) { B.step(); if (B.projs.some(p => p.kind === 'arrow' && p.owner === f)) arrow = true; } done();
        if (!arrow) fail("Echo did not replicate the opponent's projectile"); }
      { setupDummy('stormmage', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 500; v.x = 610; AQ(1, -1);   // Tempest: thundercloud
        run(3); done(); const cl = f.cloud; if (!cl) fail('Tempest summoned no thundercloud');
        else { v.x = cl.x + cl.w / 2; freeze(v); run(120); if (!(v.percent > 0)) fail('thundercloud lightning never struck the opponent beneath it');
          if (f.cloud) { f.x = f.cloud.x + f.cloud.w / 2; f.y = f.cloud.y - 30; f.vy = 0; f.onGround = false; run(12); if (!(f.onGround && Math.abs(f.y - f.cloud.y) < 1)) fail('could not stand on the thundercloud'); } } }
      { setupDummy('strider', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0];                           // Strider: grapple back to the stage from below the ledge
        f.x = S0.x - 140; f.y = S0.y + 70; f.onGround = false; f.ground = null; f.vy = 0; f.jumps = 0; f.specialUsed = false;
        AQ(S0.x + 30 - f.x, S0.y - (f.y - 32)); let back = false;
        for (let i = 0; i < 50; i++) { B.step(); if (f.state === 'ledge' || (f.x > S0.x && f.y <= S0.y + 1)) back = true; } done();
        if (!back) fail('Strider grapple did not swing back to the stage (x ' + f.x.toFixed(0) + ', y ' + f.y.toFixed(0) + ')'); run(40); }
      { setupDummy('specter', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 660; f.facing = 1;   // Specter: blade through the shield
        v.shield = 100; v.state = 'shield'; v.stateT = 30; B.mouse.cx = 1000; B.mouse.cy = 520; B.step(); B.pressed.add('M0'); const p0 = v.percent;
        for (let i = 0; i < 14; i++) { if (v.state !== 'hitstun') { v.state = 'shield'; v.stateT = 30; v.shield = 100; } B.step(); } done();
        if (!(v.percent > p0)) fail('Specter blade did not pierce the shield'); }
      { setupDummy('byte', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 680;              // Byte: corruption field lightens the opponent's gravity
        v.y -= 60; v.onGround = false; v.vy = 0; run(10); const vyIn = v.vy; v.x = 1100; v.y = 200; v.vy = 0; v.onGround = false; run(10); const vyOut = v.vy; done();
        if (!(vyIn < vyOut * 0.8)) fail('Byte corruption field did not change the opponent\\'s gravity (' + vyIn.toFixed(2) + ' vs ' + vyOut.toFixed(2) + ')'); run(80); }
      { setupDummy('apexx', 'luna', 0); const f = B.fighters[0]; B.fighters[1].x = 1100; AQ(1, 0); run(12);         // Apex-X adapts: vs a floaty it fires the rail
        const rail = B.projs.some(p => p.kind === 'bolt' && p.owner === f); done(); if (!rail) fail('Apex-X did not adapt to a floaty opponent with its rail-shot'); run(40);
        setupDummy('apexx', 'titan', 0); const g = B.fighters[0]; B.fighters[1].x = 1100; const x0 = g.x; AQ(1, 0); run(14); done();
        if (!(g.x > x0 + 120)) fail('Apex-X did not adapt to a heavy opponent with its teleport strike'); }
    }
    // 37. fighters 51-75: signature mechanics
    { const AQ = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; B.TOUCH.using = true; B.TOUCH.sx = dx / l; B.TOUCH.sy = dy / l; B.step(); B.pressed.add('KeyQ'); };
      const done = () => { B.TOUCH.using = false; B.keys.clear(); }, freeze = v => { v.state = 'lag'; v.lagT = 9999; v.vx = 0; };
      const smash = (f) => { B.TOUCH.using = false; B.mouse.cx = 1000; B.mouse.cy = 520; f.facing = 1; B.step(); B.pressed.add('M2'); };
      { setupDummy('strix', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.y -= 200; f.onGround = false; f.ground = null; f.jumps = 0; f.vy = 0; f.facing = 1; f.vx = 0;   // Strix glides forward
        B.keys.add('Space'); const x0 = f.x; let maxVy = 0; for (let i = 0; i < 30; i++) { B.step(); maxVy = Math.max(maxVy, f.vy); } done();
        if (!(f.x > x0 + 60 && maxVy < 3)) fail('Strix did not glide (dx ' + (f.x - x0).toFixed(0) + ', max vy ' + maxVy.toFixed(1) + ')'); run(60); }
      { setupDummy('kuro', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 660; freeze(v); smash(f); let hits = 0, last = v.percent;   // Kuro: multi-hit smash
        for (let i = 0; i < 40; i++) { B.step(); if (v.percent > last + 0.01) { hits++; last = v.percent; } if (v.state === 'hitstun') freeze(v); } done();
        if (hits < 2) fail('Kuro kanabo smash did not hit several times (' + hits + ')'); }
      { setupDummy('bismuth', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; freeze(f);   // Bismuth refracts weak projectiles
        B.projs.push({ kind: 'orb', x: f.x + 120, y: f.y - 36, vx: -9, vy: 0, r: 10, owner: v, life: 60, dmg: 4, base: 4, scale: 0.05, ang: 30, color: '#fff', t: 0 }); run(20);
        if (f.percent > 0) fail('Bismuth was hurt by a weak projectile instead of refracting it'); }
      { setupDummy('aura', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 690; freeze(v); smash(f); let guard = false;   // Aura: guardian repeats the smash
        for (let i = 0; i < 30; i++) { B.step(); if (B.G.echoes.some(e => e.fx === 'guardian')) guard = true; } done();
        if (!guard) fail('Aura smash summoned no ancestral guardian'); run(30); }
      { setupDummy('nox', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 1100; freeze(v); AQ(1, -0.25); let mist = false;   // Nox: flask → plague mist
        for (let i = 0; i < 160; i++) { B.step(); if (B.projs.some(p => p.kind === 'mist')) mist = true; } done();
        if (!mist) fail('Nox flask did not burst into plague mist'); }
      { setupDummy('titanis', 'velocity', 0); const f = B.fighters[0]; f.x = 600; AQ(1, 0); run(14); done();   // Titanis roots: half damage, no knockback
        if (!(f.rootT > 0)) fail('Titanis did not root'); else { const v = B.fighters[1]; v.x = 650; v.facing = -1; freeze(v);
          B.projs.push({ kind: 'orb', x: f.x + 60, y: f.y - 36, vx: -9, vy: 0, r: 12, owner: v, life: 30, dmg: 10, base: 9, scale: 0.1, ang: 40, color: '#fff', t: 0 }); run(8);
          if (!(f.percent > 0 && f.percent < 7 && Math.abs(f.vx) < 0.5 && f.state !== 'hitstun')) fail('rooted Titanis was launched or took full damage (' + f.percent.toFixed(1) + '%, ' + f.state + ')'); } run(20); }
      { setupDummy('paradox', 'titan', 0); const f = B.fighters[0]; f.x = 600; run(70); f.percent = 40; run(2); AQ(0, -1); run(20); done();   // Chronos-II undoes damage
        if (!(f.percent < 5)) fail('Chronos-II rewind did not restore the earlier damage (' + f.percent.toFixed(1) + ')'); }
      { setupDummy('fable', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 680; freeze(v); AQ(1, 0); let inked = false;   // Fable traps in ink
        for (let i = 0; i < 40; i++) { B.step(); if (v.inkTrap) inked = true; } done(); if (!inked) fail('Fable ink blot did not trap the opponent'); }
      { setupDummy('goliath', 'titan', 0); const f = B.fighters[0]; B.fighters[1].x = 1100; f.x = 450; AQ(1, -0.6); let waves = false;   // Goliath boulder → shockwaves
        for (let i = 0; i < 120; i++) { B.step(); if (B.projs.some(p => p.kind === 'wave' && p.owner === f)) waves = true; } done();
        if (!waves) fail('Goliath boulder did not shatter into shockwaves'); }
      { setupDummy('orin', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 640; freeze(v); AQ(1, 0); run(30); done();   // Orin blinds
        if (!(v.blindT > 0)) fail('Orin sun lance did not blind the opponent'); }
      { setupDummy('atlas', 'velocity', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 500; v.x = 760; AQ(0.3, -1); run(4); done();   // Atlas gravity well
        if (!f.gfield) fail('Atlas planted no gravity well'); else { v.x = f.gfield.x; v.y = f.gfield.y + 32; v.onGround = false; v.vy = 0; v.state = 'free'; run(6); const vin = v.vy;
          v.x = 1100; v.y = 200; v.vy = 0; v.onGround = false; run(6); if (!(vin > v.vy * 1.3)) fail('gravity well did not pull harder (' + vin.toFixed(2) + ' vs ' + v.vy.toFixed(2) + ')'); } run(60); }
      { setupDummy('siren', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 600; v.x = 660; AQ(1, 0); let maxStun = 0;   // Siren stuns
        for (let i = 0; i < 30; i++) { B.step(); maxStun = Math.max(maxStun, v.hitstun || 0); } done(); if (!(maxStun > 28)) fail('Siren resonance did not stun (' + maxStun + ')'); run(60); }
      { setupDummy('vanguard', 'velocity', 0); const f = B.fighters[0]; f.shield = 1; f.state = 'shield'; f.stateT = 30; run(3);   // Vanguard's shield never breaks
        if (f.state === 'stunned') fail("Vanguard's unbreakable shield broke"); run(30); }
      { setupDummy('rogue', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 680; freeze(v); AQ(1, 0); run(40); done();   // Rogue: grapple raid
        if (!(v.percent > 0) || !(f.x > 560)) fail('Rogue grapple raid did not pull in and strike (x ' + f.x.toFixed(0) + ', ' + v.percent.toFixed(1) + '%)'); }
    }
    // 39. reworked kits from the latest roster brief
    { const AQ = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; B.TOUCH.using = true; B.TOUCH.sx = dx / l; B.TOUCH.sy = dy / l; B.step(); B.pressed.add('KeyQ'); };
      const done = () => { B.TOUCH.using = false; B.keys.clear(); }, freeze = v => { v.state = 'lag'; v.lagT = 9999; v.vx = 0; };
      { setupDummy('mirage', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; AQ(1, 0); let n = 0;   // Kage: shuriken volley
        for (let i = 0; i < 12; i++) { B.step(); n = Math.max(n, B.projs.filter(p => p.kind === 'shuriken' && p.owner === f).length); } done();
        if (n !== 3) fail('Kage should throw 3 shuriken (' + n + ')'); run(40); }
      { setupDummy('frost', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 640; freeze(v); AQ(1, 0); let fz = false;   // Rime: ice shard freezes
        for (let i = 0; i < 30; i++) { B.step(); if (v.frozenT > 0) fz = true; } done(); if (!fz) fail('Rime ice shard did not freeze'); run(40); }
      { setupDummy('frost', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; f.x = 450; AQ(1, 0.5); let trap = false;   // ...and lands as a frost trap
        for (let i = 0; i < 90; i++) { B.step(); if (B.projs.some(p => p.kind === 'frost')) trap = true; } done(); if (!trap) fail('Rime shard left no frost trap'); }
      { setupDummy('nyx', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 450; v.x = 650; freeze(v); B.TOUCH.using = false; B.mouse.cx = 650; B.mouse.cy = 560; B.step(); B.pressed.add('KeyQ');   // Nyx: snare pull
        let pulled = false; for (let i = 0; i < 40; i++) { B.step(); if (v.state === 'hitstun' && v.vx < -1) pulled = true; } done();
        if (!pulled) fail('Nyx tendril did not pull the opponent toward her'); }
      { setupDummy('phantom', 'titan', 0); B.fighters[1].x = 1100; const f = B.fighters[0]; AQ(1, 0); run(3); done();   // Ghost: phantom decoy
        if (!f.decoy) fail('Ghost phase step left no phantom decoy'); run(30); }
      { setupDummy('titanus', 'velocity', 0); const f = B.fighters[0]; B.fighters[1].x = 1100; AQ(1, -0.3); let n = 0;
        for (let i = 0; i < 40; i++) { B.step(); n = Math.max(n, B.projs.filter(p => p.kind === 'missile' && p.owner === f).length); } done();
        if (n < 5) fail('Titanus fired no micro-missile barrage (' + n + ')'); run(60); }
      { setupDummy('atlas', 'velocity', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 500; AQ(0.3, -1); run(4); done();   // Atlas: controls inverted inside the well
        if (f.gfield) { v.x = f.gfield.x; v.y = f.gfield.y + 32; v.onGround = false; v.state = 'free'; run(2); if (!(v.confuse > 0)) fail('Atlas gravity well did not invert the opponent\\'s controls'); } run(40); }
      { setupDummy('kitsune', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; f.x = 500; v.x = 560; freeze(v); const p0 = v.percent;   // Vex: decoy holograms explode
        B.projs.push({ kind: 'foxorb', fake: true, x: v.x - 40, y: v.y - 36, vx: 6, vy: 0, r: 13, owner: f, life: 40, dmg: 8, base: 6, scale: 0.09, ang: 40, color: f.color, t: 0 }); run(14);
        if (!(v.percent > p0)) fail('Vex decoy hologram did not explode on contact'); }
    }
    // 35. the newest stages: Forgotten Temple's ledges crumble and rebuild, the Observatory has low gravity, the Highway's traffic hits
    { const si = id => B.STAGES.findIndex(s => s.id === id);
      setupDummy('titan', 'velocity', si('ruins')); B.fighters[1].x = 1100; const f = B.fighters[0], p = B.STAGES[si('ruins')].plats[2];
      f.x = p.x + p.w / 2; f.y = p.y; f.vy = 0; f.onGround = true; f.ground = 'plat'; let fell = false;
      for (let i = 0; i < 140; i++) { B.step(); if (f.y > p.y + 20) fell = true; }
      if (!(p.downT > 0) || !fell) fail('Forgotten Temple ledge did not crumble under a fighter (downT ' + p.downT + ')');
      for (let i = 0; i < 260; i++) B.step(); if (p.downT > 0) fail('crumbled ledge never rebuilt');
      const jumpPeak = id => { setupDummy('velocity', 'titan', si(id)); B.fighters[1].x = 1100; const g = B.fighters[0]; run(5); const y0 = g.y; B.pressed.add('Space'); let top = y0; for (let i = 0; i < 60; i++) { B.step(); top = Math.min(top, g.y); } return y0 - top; };
      const normal = jumpPeak('starlight'), low = jumpPeak('observatory');
      if (!(low > normal * 1.1)) fail('Stellar Observatory gravity is not lower (jump ' + normal.toFixed(0) + ' vs ' + low.toFixed(0) + ')');
      setupDummy('titan', 'velocity', si('highway')); B.SEL.hazards = true; const v = B.fighters[1]; v.x = 640; const p0 = v.percent;
      B.spawnHazard('traffic'); for (let i = 0; i < 110; i++) B.step();
      if (!(v.percent > p0)) fail('Neon Highway traffic did not hit the fighter in its lane');
      // stages 29-35: Starfighter Dock launch pads, Quantum Citadel phasing ledges, Astral Void portals, Neon Subways trains
      setupDummy('velocity', 'titan', si('dock')); B.fighters[1].x = 1100;
      { const f = B.fighters[0], pad = B.STAGES[si('dock')].plats[0]; f.x = pad.x + pad.w / 2; f.y = pad.y - 40; f.vy = 2; f.onGround = false; f.ground = null; let launched = false;
        for (let i = 0; i < 20; i++) { B.step(); if (f.vy < -15) launched = true; } if (!launched) fail('Starfighter Dock launch pad did not fling the fighter upward'); }
      setupDummy('velocity', 'titan', si('citadel')); B.fighters[1].x = 1100;
      { const p = B.STAGES[si('citadel')].plats[0]; let seenDown = false, seenUp = false; for (let i = 0; i < 430; i++) { B.step(); if (p.downT > 0) seenDown = true; else seenUp = true; }
        if (!seenDown || !seenUp) fail('Quantum Citadel ledge never phased out and back'); }
      setupDummy('velocity', 'titan', si('astral')); B.fighters[1].x = 1100;
      { const f = B.fighters[0], P = B.STAGES[si('astral')].portals; f.x = P[0].x; f.y = P[0].y + 32; f.vy = 0; f.onGround = false; f.ground = null; B.step();
        if (!(Math.abs(f.x - P[1].x) < 60)) fail('Astral Void portal did not warp the fighter (x ' + f.x.toFixed(0) + ')'); }
      setupDummy('titan', 'velocity', si('subway')); B.SEL.hazards = true;
      { const v = B.fighters[1]; v.x = 640; v.state = 'lag'; v.lagT = 9999; const p0 = v.percent; B.spawnHazard('train'); for (let i = 0; i < 130; i++) B.step();
        if (!(v.percent > p0)) fail('Neon Subways train did not hit the fighter on the line'); } }
    // 18. touch controls: the stick moves the fighter, the Attack button attacks, letting go releases everything
    setupDummy('titan', 'velocity', 0); B.fighters[1].x = 1100; B.SET.touch = 'on'; B.updateTouch();
    { const f = B.fighters[0], tz = document.getElementById('t-zone'), r = tz.getBoundingClientRect(), u = r.width / (1280 * 0.45);
      if (!document.getElementById('touch').classList.contains('show')) fail('touch controls not shown during a match');
      const pe = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
      const ox = r.left + 150 * u, oy = r.top + 400 * u, x0 = f.x;
      pe(tz, 'pointerdown', ox, oy, 7); pe(tz, 'pointermove', ox + 60 * u, oy, 7); run(30);
      if (!(f.x > x0 + 20)) fail('touch stick did not move the fighter right (' + x0.toFixed(0) + ' -> ' + f.x.toFixed(0) + ')');
      pe(tz, 'pointerup', ox + 60 * u, oy, 7); run(20);
      if (B.keys.has('KeyD')) fail('touch stick release did not let go of right');
      const ab = document.querySelector('.t-light'), br = ab.getBoundingClientRect();
      pe(ab, 'pointerdown', br.left + 10, br.top + 10, 8);
      let attacked = false; for (let i = 0; i < 15 && !attacked; i++) { B.step(); attacked = f.state === 'attack'; }     // (input waits out any hit-stop)
      pe(ab, 'pointerup', br.left + 10, br.top + 10, 8);
      if (!attacked) fail('touch Attack button did not attack (state=' + f.state + ')');
      B.setPaused(true); B.updateTouch();
      if (document.getElementById('touch').classList.contains('show')) fail('touch controls still shown while paused');
      B.SET.touch = 'auto'; B.TOUCH.using = false; }
    // 40. 2.5D WebGL renderer: every fighter has a 3D accent recipe; a match frame builds 3D geometry for every fighter without
    //     errors; the 2D canvas becomes the transparent effects overlay; switching to the Canvas renderer takes over cleanly
    if (!B.GL3D.failed) {
      for (const ch of B.CHARS) if (!(ch.id in B.ACC3D)) fail(ch.id + ' has no 3D accent recipe');
      const saved = B.SET.renderer; B.SET.renderer = 'webgl';
      for (let i = 0; i < B.CHARS.length; i += 2) {
        setupDummy(B.CHARS[i].id, B.CHARS[(i + 1) % B.CHARS.length].id, i % B.STAGES.length); run(4); B.render();
        if (!B.RENDER3D.on) { fail('WebGL renderer not active in a match'); break; }
        if (B.GL3D.n < 60) fail('3D frame for ' + B.CHARS[i].id + ' drew only ' + B.GL3D.n + ' items');
      }
      if (!document.getElementById('game').classList.contains('overlay') || !document.getElementById('gl').classList.contains('on')) fail('WebGL canvas / overlay not shown in a 3D match');
      B.SET.renderer = 'canvas'; B.render(); if (B.RENDER3D.on || document.getElementById('gl').classList.contains('on')) fail('Canvas renderer did not take over from WebGL');
      B.SET.renderer = saved;
    }
    // 41. game events reach the presentation layers without breaking anything; the smash camera punches in on a big smash
    { B.gameEvent('hit', { m: { heavy: true }, kb: 22, x: 640, y: 400, dir: 1 }); const v = typeof CAMFX !== 'undefined' ? CAMFX.k : 0;
      if (!(v > 0)) fail('smash camera did not react to a big smash'); for (const t of ['block', 'parry', 'shieldBreak', 'ko', 'jump', 'land']) B.gameEvent(t, { x: 640, y: 400, impact: 9, f: B.fighters[0] }); }
    // 42. the game opens on the intro splash, which credits the lead designer
    if (!/dino nuggi/i.test(document.getElementById('scr-intro').textContent)) fail('intro splash credit missing');
    // 43. skins: Base / Gold Edition / Void, and the 3D renderer gives Gold a metallic material and Void glowing eyes
    { const ch = B.CHARS[0]; if (B.skinOf(ch, 1).fx !== 'gold' || B.skinOf(ch, 2).fx !== 'void' || B.skinOf(ch, 1).name !== 'Gold Edition') fail('skins are not Base / Gold Edition / Void');
      if (!B.GL3D.failed) { const saved = { ...B.SEL.skins }; B.SEL.skins[B.CHARS[3].id] = 1; B.SEL.skins[B.CHARS[4].id] = 2; setupDummy(B.CHARS[3].id, B.CHARS[4].id, 0); run(3); B.render();
        let metal = 0, glow = 0; for (let i = 0; i < B.GL3D.n; i++) { const it = B.GL3D.items[i]; if (it.metal >= 1) metal++; if (it.glow > 1.5 && it.col && it.col[0] > 0.9 && it.col[1] < 0.2) glow++; }
        if (!metal) fail('Gold Edition skin has no metallic material in 3D'); if (!glow) fail('Void skin has no glowing red eyes in 3D');
        B.SEL.skins = saved; for (const k of Object.keys(B.SEL.skins)) if (!(k in saved)) delete B.SEL.skins[k]; } }
    // 44. KO cinematics: a KO through the top starts a Star / Screen KO that renders without errors
    { setupDummy('velocity', 'titan', 0); const v = B.fighters[1]; Object.assign(v, { x: 700, y: B.STAGES[0].bz.t - 30, vy: -12, vx: 2, state: 'hitstun', hitstun: 99, onGround: false });
      for (let i = 0; i < 30 && v.state !== 'dead'; i++) B.step();
      if (!KOFX.length) fail('top KO did not start a Star / Screen KO'); for (let i = 0; i < 100; i += 10) { run(10); B.render(); } }
    // 45. Sudden Death: a timed match ending level on stocks goes to Sudden Death at 300%, and the next KO wins in slow motion
    { B.SEL.time = 1; setup('blaze', 'prism', 5); for (const f of B.fighters) f.cpu = false; let s = 0;
      while (!B.G.suddenDeath && s++ < 900) B.step();
      if (!B.G.suddenDeath || B.fighters.some(f => f.percent !== 300 || f.stocks !== 1)) fail('timeout tie did not start Sudden Death at 300% / 1 stock');
      s = 0; while (B.G.mode !== 'play' && s++ < 400) B.step(); B.render();
      const v = B.fighters[1]; Object.assign(v, { x: 700, y: B.currentStage().bz.t - 30, vy: -12, state: 'hitstun', hitstun: 99, onGround: false });
      s = 0; while (v.state !== 'dead' && s++ < 30) B.step();
      if (B.G.mode !== 'ending' || !B.G.winner || !(B.G.slowmo > 0)) fail('Sudden Death KO did not end the match in slow motion');
      B.SEL.time = 0; B.G.slowmo = 0; }
    // 46. Training: the holo grid, every dummy behaviour runs, attacks record hitboxes, and stocks never run out
    { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); B.SEL.cpu = B.CHARS.findIndex(c => c.id === 'titan'); startTraining();
      if (B.currentStage().id !== 'training' || B.G.mode !== 'play') fail('training did not open on the holo grid');
      let logged = false;
      for (const ai of ['stand', 'walk', 'jump', 'shield', 'attack', 'cpu']) { TRAIN.ai = ai; for (let i = 0; i < 90; i++) { B.step(); if (ai === 'attack' && HITBOX_LOG.length) logged = true; } B.render(); }
      if (!logged) fail('training dummy attacks recorded no hitboxes');
      const v = B.fighters[1]; Object.assign(v, { x: 700, y: B.currentStage().bz.t - 30, vy: -12, state: 'hitstun', hitstun: 99, onGround: false }); for (let i = 0; i < 30 && v.state !== 'dead'; i++) B.step();
      if (v.stocks < 3 || B.G.mode !== 'play') fail('training KO used up a stock / ended the match');
      B.go('scr-main'); if (B.G.training) fail('leaving training did not clear training mode'); TRAIN.ai = 'stand'; }
    // 47. online building blocks: codes round-trip, inputs pack losslessly, the shared RNG is deterministic; announcer is safe
    { const sdp = 'v=0\\r\\no=- 1 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\na=group:BUNDLE 0\\r\\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\\r\\nc=IN IP4 0.0.0.0\\r\\na=ice-ufrag:abcd\\r\\na=mid:0\\r\\n';
      const code = await packSDP({ type: 'offer', sdp }), back = await unpackSDP(code);
      if (back.type !== 'offer' || back.sdp !== sdp) fail('online codes do not round-trip');
      const i = B.emptyInput(); i.left = true; i.jumpP = true; i.specialP = true; i.aimX = -77; i.aimY = 41;
      const u = unpackInput(packInput(i)); if (!u.left || !u.jumpP || !u.specialP || u.right || u.aimX !== -77 || u.aimY !== 41) fail('online input packing is lossy');
      const r1 = makeRng(99), r2 = makeRng(99); for (let k = 0; k < 50; k++) if (r1() !== r2()) { fail('seeded RNG is not deterministic'); break; }
      announce('test'); }
    B.keys.clear(); B.go('scr-main');
    return { errs, mode: B.G.mode, seen: Object.keys(seen).sort().join(' '), poses: Object.keys(poses).length + ' of ' + B.RIG_POSES.length };
  })()`).catch(e => ({ errs: [String(e)] }));

  const all = [...errors, ...(result.errs || [])];
  if (all.length) { console.error('SMOKE TEST FAILED:\n' + all.join('\n')); app.exit(1); }
  else { console.log('Smoke test passed - every stage and fighter played, no errors.\nStates/mechanics seen: ' + result.seen + '\nNamed poses shown: ' + result.poses); app.exit(0); }
});
