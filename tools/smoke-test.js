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
                    'MATRIX', 'VANGUARD', 'OMEGA', 'AXIOM', 'RIPTIDE', 'MONOLITH', 'ORIGAMI', 'COMET', 'DJINN', 'SCARAB', 'LUMEN', 'TOTEM', 'HIVE'];
      const names = B.CHARS.map(c => c.name); if (names.length !== 88) fail('roster has ' + names.length + ' fighters');
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
    setupDummy('titan', 'velocity', 0); B.fighters[1].x = 900;                                  // (on the stage: off it, the v17 snappier fall KOs the dummy mid-test)
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
    for (const ch of B.CHARS) { const cols = new Set([0, 1, 2, 3, 4, 5, 6].map(k => B.skinOf(ch, k).color + B.skinOf(ch, k).fill)); if (cols.size !== 7) fail(ch.id + ' does not have 7 distinct skins'); }
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
                      'Cyber Colosseum', 'Starfighter Dock', 'Quantum Citadel', 'Magma Caldera', 'Celestial Shrine', 'Neon Subways', 'Astral Void', 'Nebula Apex', "Dragon's Spine", 'Event Horizon',
                      'Japanese Garden', 'The Runaway Train', 'The Giant Pinball Machine'];
      if (B.STAGES.length !== 42) fail('there should be 42 stages'); for (const n of wantSt) if (!B.STAGES.some(s => s.name === n)) fail('stage missing: ' + n);
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
        v.y -= 60; v.onGround = false; v.vy = 0; run(10); const vyIn = v.vy; v.x = 920; v.y = 200; v.vy = 0; v.onGround = false; run(10); const vyOut = v.vy; done();   // (both falls over the stage: same v17 fall gravity)
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
      run(40);
      // forgiving hit zones: a near-miss just outside the Jump button still jumps
      const pad = document.getElementById('t-pad'), jb = document.querySelector('.t-jump').getBoundingClientRect(), jr = jb.width / 2;
      B.pressed.clear(); pe(pad, 'pointerdown', jb.left + jr, jb.top + jr - jr * 1.35, 9);   // (just above it: the open side)
      if (!B.keys.has('Space')) fail('a near-miss beside the Jump button did not press it'); pe(pad, 'pointerup', jb.left + jr, jb.top + jr - jr * 1.35, 9);
      if (B.keys.has('Space')) fail('releasing the Jump button did not let go of it');
      // slides: Attack → Jump presses Jump; Attack → Smash never fires Smash
      const lb = document.querySelector('.t-light').getBoundingClientRect(), hb = document.querySelector('.t-heavy').getBoundingClientRect();
      pe(pad, 'pointerdown', lb.left + lb.width / 2, lb.top + lb.height / 2, 10); pe(pad, 'pointermove', jb.left + jr, jb.top + jr, 10);
      if (!B.keys.has('Space')) fail('sliding from Attack onto Jump did not jump'); pe(pad, 'pointerup', jb.left + jr, jb.top + jr, 10);
      B.pressed.clear(); pe(pad, 'pointerdown', lb.left + lb.width / 2, lb.top + lb.height / 2, 11); B.pressed.clear(); pe(pad, 'pointermove', hb.left + hb.width / 2, hb.top + hb.height / 2, 11);
      if (B.pressed.has('M2') || B.keys.has('M2')) fail('sliding from Attack onto Smash fired a smash'); pe(pad, 'pointerup', hb.left + hb.width / 2, hb.top + hb.height / 2, 11); B.pressed.clear(); run(30);
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
        if (B.GL3D.n < 35) fail('3D frame for ' + B.CHARS[i].id + ' drew only ' + B.GL3D.n + ' items');            // (limbs + chains are single smooth tubes now: fewer, richer items)
        if (!B.GL3D.items.slice(0, B.GL3D.n).some(it => it.mesh && it.mesh.tube)) fail('3D frame for ' + B.CHARS[i].id + ' has no smooth tube limbs');
      }
      if (!document.getElementById('game').classList.contains('overlay') || !document.getElementById('gl').classList.contains('on')) fail('WebGL canvas / overlay not shown in a 3D match');
      B.SET.renderer = 'canvas'; B.render(); if (B.RENDER3D.on || document.getElementById('gl').classList.contains('on')) fail('Canvas renderer did not take over from WebGL');
      B.SET.renderer = saved;
    }
    // 41. game events reach the presentation layers without breaking anything; the smash camera punches in on a big smash
    { B.gameEvent('hit', { m: { heavy: true }, kb: 22, x: 640, y: 400, dir: 1 }); const v = typeof CAMFX !== 'undefined' ? CAMFX.k : 0;
      if (!(v > 0)) fail('smash camera did not react to a big smash'); for (const t of ['block', 'parry', 'shieldBreak', 'ko', 'jump', 'land']) B.gameEvent(t, { x: 640, y: 400, impact: 9, f: B.fighters[0] }); }
    // 42. the game opens on the intro splash, which credits the lead designer
    if (!/MANSOUR\s*SAKKA/i.test(document.getElementById('scr-intro').textContent.replace(/\s+/g, ' ').replace(/(\w) (?=\w\b)/g, '$1')) &&
        !/Mansour Sakka/i.test(document.querySelector('.intro-credit').getAttribute('aria-label') || '')) fail('intro splash credit missing');
    // 43. skins: Base / Gold Edition / Void, and the 3D renderer gives Gold a metallic material and Void glowing eyes
    { const ch = B.CHARS[0]; if (B.skinOf(ch, 1).fx !== 'gold' || B.skinOf(ch, 2).fx !== 'void' || B.skinOf(ch, 1).name !== 'Gold Crusader') fail('skins are not Base / Gold Crusader / Void Reaver');
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
      if (typeof announce !== 'undefined' || typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) fail('the speech announcer should be gone'); }
    // 48. v6: everything in the WebGL frame is 3D — the 2D canvas stays empty; weather, battle damage, rage aura,
    //     3D effects / projectiles / the F1 car, the DOM text layer and the 3D menus all work
    if (!B.GL3D.failed) {
      const saved = B.SET.renderer; B.SET.renderer = 'webgl';
      const stIdx = id => B.STAGES.findIndex(s => s.id === id), ci = id => B.CHARS.findIndex(c => c.id === id);
      B.SEL.stage = stIdx('storm'); B.SEL.p1 = ci('blaze'); B.SEL.cpu = ci('vortex'); B.startMatch(); B.render();
      const banner = document.querySelector('.fxu-banner'); if (!banner || banner.style.display === 'none' || !/READY/.test(banner.textContent)) fail('the READY banner is not shown by the DOM text layer');
      for (let i = 0; i < 160; i++) B.step();
      B.fighters[0].percent = 160; B.fighters[1].percent = 20; B.render();
      const cv = document.getElementById('game'), px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let ink = 0;
      for (let i = 3; i < px.length; i += 4 * 97) if (px[i]) ink++;
      if (ink) fail('the 2D canvas was painted during a WebGL match (' + ink + ' samples)');
      if (!WEATHER3D.sys.length) fail('Ruined Castle has no 3D rain');
      let dmg = 0, rage = 0; for (let i = 0; i < B.GL3D.frameN; i++) { const it = B.GL3D.items[i]; if (it.dmg && it.dmg[0] > 0.8) dmg++; if (it.glow && it.col && it.col[0] > 0.9 && it.col[1] < 0.2 && it.glowPow < 0) rage++; }
      if (!dmg) fail('a fighter at 160% shows no battle damage'); if (!rage) fail('no rage aura at 160%');
      const f = B.fighters[0]; f.x = 640; f.y = B.currentStage().main.y; B.TOUCH.using = false; B.mouse.cx = 1100; B.mouse.cy = 420; f.cpu = false; f.spCD = 0; B.pressed.add('KeyQ');
      for (let i = 0; i < 12; i++) B.step(); B.render();
      if (!(BAT.lit.nv + BAT.glow.nv + BAT.flat.nv > 200)) fail('effects / projectiles produced no 3D geometry');
      B.SEL.p1 = ci('dino'); B.SEL.cpu = ci('titan'); B.SEL.stage = 0; B.startMatch(); for (let i = 0; i < 140; i++) B.step();
      const d = B.fighters[0]; d.cpu = false; B.mouse.cx = 1100; B.mouse.cy = 420; B.pressed.add('M2'); let car = false;
      for (let i = 0; i < 26 && !car; i++) { B.step(); B.render(); if (d.move && d.move.car) { let n = 0; for (let k = 0; k < B.GL3D.frameN; k++) if (B.GL3D.items[k].mesh === B.GL3D.mesh.rbox) n++; car = n >= 3; } }
      if (!car) fail('Dino Nuggi\\'s F1 car is not a modelled 3D vehicle');
      B.go('scr-select'); B.render(); if (!B.RENDER3D.on) fail('the character select is not rendered in 3D');
      B.go('scr-stage'); B.render(); B.go('scr-main'); B.render(); if (!B.RENDER3D.on || !(B.GL3D.n > 50)) fail('the main menu has no 3D world');
      B.SET.renderer = saved; B.render();
    }
    // 49. soundtrack: every one of the 36 stages has its own distinct procedural track, and every track schedules cleanly
    { const sigs = new Set(); for (const st of B.STAGES) { if (!STAGE_MUSIC[st.id]) fail(st.id + ' has no music track'); sigs.add(trackFor(st.id).sig); }
      if (sigs.size !== B.STAGES.length) fail('stage tracks are not all distinct (' + sigs.size + ' of ' + B.STAGES.length + ')');
      const save = { ctx: AUDIO.ctx, ok: AUDIO.ok, timer: AUDIO.timer, pump: AUDIO.pump, mode: AUDIO.mode, track: AUDIO.track, key: AUDIO.trackKey }, AC = window.AudioContext;
      window.AudioContext = function () { return new OfflineAudioContext(2, 44100, 44100); }; AUDIO.ctx = null; AUDIO.ok = false; AUDIO.pump = null; audioUnlock(); clearInterval(AUDIO.timer);
      AUDIO.mode = 'battle'; AUDIO.intensity = 0.9;
      try { for (const st of B.STAGES) { const T = trackFor(st.id); for (let s = 0; s < 64; s++) playStep(T, s, 0.01 + s * 0.001, 0.4); } } catch (e) { fail('music step failed: ' + e.message); }
      window.AudioContext = AC; AUDIO.ctx = save.ctx; AUDIO.ok = save.ok; AUDIO.timer = save.timer; AUDIO.pump = save.pump; AUDIO.mode = save.mode; AUDIO.track = save.track; AUDIO.trackKey = save.key; }
    // 50. Ultimates: every fighter has its own (unique name + choreography); each fires from a full meter, freezes the world
    //     for the cinematic, connects, lands its flurry, launches the victim and hands control back — in both renderers
    { const ids = B.CHARS.map(c => c.id), names = new Set(), choreo = new Set();
      for (const id of ids) { const u = ULTS[id]; if (!u) { fail('no Ultimate for ' + id); continue; } names.add(u.name); choreo.add(JSON.stringify(u.k)); }
      if (names.size !== ids.length) fail('Ultimate names are not unique (' + names.size + ' of ' + ids.length + ')');
      if (choreo.size !== ids.length) fail('Ultimate choreographies are not unique (' + choreo.size + ' of ' + ids.length + ')');
      const savedR = B.SET.renderer, savedHz = B.SEL.hazards, OFF = { uppercut: 36, vortex: 175, rush: 200 }; let bad = 0; B.SEL.hazards = false;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], U = ULTS[id]; if (!U) continue;
        B.SET.renderer = i % 3 === 2 ? 'canvas' : 'webgl';
        setup(id, 'titan', i % 2 ? 0 : 3);
        const f = B.fighters[0], v = B.fighters[1]; f.cpu = false; v.cpu = false;
        const x0 = STAGE.x + STAGE.w * 0.3;
        Object.assign(f, { x: x0, y: STAGE.y, vx: 0, vy: 0, onGround: true, ground: 'stage', state: 'free', invuln: 0, facing: 1 });
        Object.assign(v, { x: x0 + (OFF[U.fam] || 220), y: STAGE.y, vx: 0, vy: 0, onGround: true, ground: 'stage', state: 'free', invuln: 0, facing: -1, percent: 40 });
        f.ult = 100; B.pressed.add('KeyR'); B.step();
        if (f.state !== 'ultimate' || !(B.G.ultFreeze > 0)) { fail(id + ': R with a full meter did not start the Ultimate (state ' + f.state + ')'); bad++; continue; }
        const p0 = v.percent, poseSeen = new Set(); let cine = false, launched = 0, n = 0, pMax = p0;
        while (f.state === 'ultimate' && n++ < 420) { B.step(); if (n % 5 === 0) B.render(); poseSeen.add(B.computePose(f)[1]); if (f.ultPh === 'cine') cine = true; pMax = Math.max(pMax, v.percent);
          if (f.ultPh === 'recover' && !launched) launched = Math.hypot(v.vx, v.vy); }
        if (!cine) { fail(id + ' (' + U.fam + '): the Ultimate never connected (victim ' + v.state + ' at ' + v.x.toFixed(0) + ',' + v.y.toFixed(0) + ', user ' + f.x.toFixed(0) + ',' + f.y.toFixed(0) + ')'); bad++; }
        else if (!(pMax >= p0 + U.p.hits * U.p.dmg)) { fail(id + ': the flurry did not land (' + p0 + ' -> ' + pMax.toFixed(1) + ')'); bad++; }
        else if (!(launched > 8)) { fail(id + ': the final blow did not launch the victim (speed ' + launched.toFixed(1) + ')'); bad++; }
        if (f.state === 'ultimate') { fail(id + ': the Ultimate never ended'); bad++; }
        for (const tag of ['charge', 'strike', 'finale']) if (!poseSeen.has('ult:' + tag + ':' + id)) { fail(id + ': no own Ultimate ' + tag + ' pose'); bad++; break; }
        if (bad > 6) break;
      }
      B.SET.renderer = savedR; B.SEL.hazards = savedHz;
      // whiffing is punishable; the CPU uses its Ultimate; online play carries the Ultimate button
      setup('aegis', 'titan', 0); { const f = B.fighters[0], v = B.fighters[1]; v.x = f.x - 900; v.cpu = false; f.ult = 100; f.facing = 1; B.pressed.add('KeyR'); run(140);
        if (f.state === 'ultimate') fail('a whiffed Ultimate never ended'); }
      setup('velocity', 'titan', 0); { const f = B.fighters[0], v = B.fighters[1]; f.cpu = true; B.G.diff = 3; v.cpu = false; v.x = f.x + 160; v.y = f.y; f.ult = 100; let used = false;
        for (let k = 0; k < 240 && !used; k++) { B.step(); if (f.state === 'ultimate') used = true; } if (!used) fail('the CPU never used its Ultimate with a full meter'); }
      { const i = B.emptyInput(); i.ultP = true; if (!unpackInput(packInput(i)).ultP) fail('online input packing drops the Ultimate button'); }
      // the real keyboard path: a KeyR keydown fires the Ultimate — pressed mid-attack (buffered), behind a shield, in Training;
      // pressed with an uncharged meter it says so instead of failing silently
      { const key = (code, up) => window.dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code, bubbles: true }));
        const fresh = () => { setup('velocity', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; v.cpu = false; v.x = f.x + 260; v.y = f.y; f.ult = 100; return f; };
        let f = fresh(); B.pressed.add('M0'); B.step(); if (f.state !== 'attack') fail('R test setup: no attack (' + f.state + ')');
        key('KeyR'); key('KeyR', true); let fired = false; for (let k = 0; k < 40 && !fired; k++) { B.step(); fired = f.state === 'ultimate'; }
        if (!fired) fail('R pressed during an attack never fired the Ultimate (state ' + f.state + ')'); run(420);
        f = fresh(); B.keys.add('KeyE'); run(4); if (f.state !== 'shield') fail('R test setup: no shield (' + f.state + ')');
        key('KeyR'); key('KeyR', true); B.step(); B.keys.clear(); if (f.state !== 'ultimate') fail('R behind a shield did not fire the Ultimate (' + f.state + ')'); run(420);
        f = fresh(); f.ult = 30; key('KeyR'); key('KeyR', true); B.step(); if (f.state === 'ultimate' || !(f.ultDenyT > 0)) fail('R with an uncharged meter gave no feedback'); run(10);
        if (f.state === 'ultimate') fail('a press with an uncharged meter fired later anyway');
        startTraining(); f = B.fighters[0]; run(3); const x0 = f.x; f.x += 40; key('KeyR'); key('KeyR', true); B.step();
        if (f.state !== 'ultimate') fail('R in Training did not fire the Ultimate (' + f.state + ')'); if (Math.abs(f.x - (x0 + 40)) > 30) fail('R in Training still resets positions'); run(420); B.go('scr-main'); }
      // the meter fills ONLY from landed punches + combos: never passively, never from projectiles, parries or damage taken
      setup('blaze', 'titan', 0); { const f = B.fighters[0], v = B.fighters[1]; v.cpu = false; f.cpu = false; const m = { dmg: 3, base: 2, scale: 0.01, ang: 45 };
        f.ult = 0; v.ult = 0; v.state = 'free'; deliver(f, v, m, 1, v.x, v.y - 32, false); const one = f.ult;
        if (!(one > 0 && one < 4)) fail('a landed punch should charge a little of the meter (' + one + ')'); if (v.ult !== 0) fail('taking a hit charged the victim\\'s meter');
        deliver(f, v, m, 1, v.x, v.y - 32, false); deliver(f, v, m, 1, v.x, v.y - 32, false); deliver(f, v, m, 1, v.x, v.y - 32, false);
        const combo = f.ult - one; if (!(combo > one * 3.5)) fail('combo hits should charge more than single punches (' + combo.toFixed(1) + ' for hits 2-4)');
        if (!(ULT_MAX / ULT_EARN.hit >= 25)) fail('a full meter is too quick to earn');
        f.ult = 0; v.state = 'free'; deliver(f, v, Object.assign({ proj: true }, m), 1, v.x, v.y - 32, false); if (f.ult !== 0) fail('a projectile hit charged the meter');
        v.ult = 0; Object.assign(v, { state: 'shield', stateT: 0 }); doParry(v, f, v.x, v.y - 32); if (v.ult !== 0) fail('a parry charged the meter (it should only fill from punches)');
        setup('blaze', 'titan', 0); const a = B.fighters[0]; B.fighters[1].cpu = false; B.fighters[1].x = 1100; a.ult = 0; a.percent = 40; run(120); if (a.ult !== 0) fail('the meter fills by itself at low damage');
        a.percent = 200; run(160); if (a.ult !== 0) fail('the meter fills passively at high damage (' + a.ult.toFixed(1) + ')'); } }
    // 51. bespoke animation + faces: every fighter idles and punches in its own way; 3D faces track the opponent and
    //     change expression (X eyes when hit, spirals when dazed, a scowl while charging); heavy landings squash flat for two frames
    { const ids = B.CHARS.map(c => c.id), idles = new Set(), punches = new Set(), r = v => Math.round(v * 10) / 10, sig = P => JSON.stringify([P.fa, P.ba, P.ff, P.bf, P.hd, P.lean, P.sx, P.sy, P.oy, P.spin].flat().map(r));
      setupDummy('titan', 'velocity', 0); const f = B.fighters[0]; B.fighters[1].x = 1100; const t0 = B.G.time;
      for (const id of ids) {
        f.ch = B.CHARS.find(c => c.id === id); Object.assign(f, { state: 'free', onGround: true, vx: 0, vy: 0, crawl: false, landT: 0, turnT: 0, dashT: 0, idleT: 10, percent: 0, move: null, victory: false, defeat: false });
        B.G.time = t0 + 37; const [Pi, ni] = B.computePose(f); if (ni !== 'idle:' + id) fail(id + ' idles with a shared cycle (' + ni + ')'); idles.add(sig(Pi));
        f.state = 'attack'; f.move = buildMove(f, 'jab'); f.stateT = f.move.s; f.charging = false; f.combo = 0;
        const [Pp, np] = B.computePose(f); if (np !== 'jab:strike:' + id) fail(id + ' punches with a shared animation (' + np + ')'); punches.add(sig(Pp));
        f.state = 'free'; f.move = null;
      }
      B.G.time = t0;
      if (idles.size !== ids.length) fail('idle animations are not all unique (' + idles.size + ' of ' + ids.length + ')');
      if (punches.size !== ids.length) fail('punch animations are not all unique (' + punches.size + ' of ' + ids.length + ')');
      f.ch = B.CHARS.find(c => c.id === 'titan'); f.state = 'free'; run(10);
      // pancake landing
      Object.assign(f, { y: STAGE.y - 200, onGround: false, ground: null, vy: 18, state: 'free' }); let flat = 0; B.keys.add('KeyS');   // fast-falling
      for (let k = 0; k < 20; k++) { B.step(); if (f.sy < 0.5) flat++; } B.keys.clear();
      if (flat < 2) fail('a heavy landing did not squash flat for two frames (' + flat + ')');
      if (!B.GL3D.failed) {
        const savedR = B.SET.renderer; B.SET.renderer = 'webgl';
        setup('blaze', 'titan', 0); const a = B.fighters[0], o = B.fighters[1]; o.cpu = false; a.cpu = false; run(5);
        o.x = a.x + 300; B.render(); const lx = a.rig && a.rig.eye3 ? a.rig.eye3.x : 0; o.x = a.x - 300; for (let k = 0; k < 20; k++) B.render();
        if (!(a.rig && a.rig.eye3 && a.rig.eye3.x < 0 && lx > 0)) fail('3D eyes do not follow the opponent (' + lx + ' -> ' + (a.rig && a.rig.eye3 && a.rig.eye3.x) + ')');
        a.state = 'hitstun'; a.hitstun = 30; B.render(); if (a.expr !== 'x') fail('a hit fighter does not show X eyes (' + a.expr + ')');
        a.state = 'stunned'; a.stunT = 30; B.render(); if (a.expr !== 'dizzy') fail('a dazed fighter does not show spiral eyes (' + a.expr + ')');
        a.state = 'attack'; a.move = buildMove(a, 'fsmash'); a.charging = true; B.render(); if (a.expr !== 'scowl') fail('a charging fighter does not scowl (' + a.expr + ')');
        a.state = 'free'; a.move = null; a.charging = false; B.SET.renderer = savedR; B.render();
      }
      // verlet capes / scarves whip around during attacks
      setupDummy('mirage', 'titan', 0); const k = B.fighters[0]; B.fighters[1].x = 1100; run(5);
      const tip = () => { const tr = k.trail; return tr ? [tr[tr.length - 1].x - k.x, tr[tr.length - 1].y - k.y] : [0, 0]; };
      // A/B: the same strike over the same frames, with the whip on and with it switched off
      const T0 = B.G.time, swing = () => { k.trail = null; k.rig = null; B.G.time = T0; k.state = 'free'; k.move = null;
        for (let i = 0; i < 40; i++) { B.G.time++; solveRig(k); } const a0 = tip(); let d = 0;
        k.state = 'attack'; k.move = buildMove(k, 'fsmash'); k.stateT = k.move.s; k.charging = false;
        for (let i = 0; i < 16; i++) { B.G.time++; solveRig(k); const q = tip(); d = Math.max(d, Math.hypot(q[0] - a0[0], q[1] - a0[1])); }
        k.state = 'free'; k.move = null; return d; };
      const whipped = swing(), realWhip = window.trailWhip; window.trailWhip = () => 0; const still = swing(); window.trailWhip = realWhip; B.G.time = T0 + 100; run(5);
      if (!(whipped > still + 8)) fail('capes / scarves do not whip around during attacks (' + whipped.toFixed(1) + ' with the whip vs ' + still.toFixed(1) + ' without)'); }
    // 52. Classic Arcade: 6 rivals Easy → Extreme, then GIANT OMEGA at 300 % (scaled hurtbox, attacks, collision, model);
    //     winning advances the ladder, losing offers a continue, the giant survives a Sudden Death reset, leaving clears the mode
    { const ci = id => B.CHARS.findIndex(c => c.id === id), untilOver = () => { for (let k = 0; k < 2400 && B.G.mode !== 'over'; k++) B.step(); };
      B.go('scr-main'); B.SEL.p1 = ci('blaze'); B.SEL.challenge = 'arcade'; chalGo(); const A = CHAL.arc;
      if (!A || A.rungs.length !== 8 || A.rungs[6].boss !== 'giant' || A.rungs[7].boss !== 'hand' || B.G.screen !== 'scr-ladder') fail('the Arcade ladder did not open (' + B.G.screen + ')');
      else {
        if (JSON.stringify(A.rungs.slice(0, 6).map(r => r.diff)) !== '[0,1,1,2,2,3]') fail('the Arcade difficulty does not ramp up');
        const riv = A.rungs.slice(0, 6).map(r => r.ci);
        if (new Set(riv).size !== 6 || riv.includes(B.SEL.p1) || riv.includes(ci('omega'))) fail('Arcade rivals repeat or include your own fighter / the boss');
        arcadeFight(); B.G.mode = 'play'; const o = B.fighters[1];
        const live = f => { for (let k = 0; k < 400 && f.state !== 'free'; k++) B.step(); };   // (wait out the respawn platform)
        for (let k = 0; k < 2; k++) { live(o); o.x = BZ.r + 200; o.y = 300; B.step(); run(5); }
        untilOver(); if (A.idx !== 1 || A.state !== 'won' || B.G.screen !== 'scr-ladder') fail('beating an Arcade rival did not advance the ladder (idx ' + A.idx + ', ' + A.state + ', ' + B.G.screen + ')');
        A.idx = 6; arcadeFight(); const g = B.fighters[1];
        if (g.scale !== 3 || g.ch.name !== 'GIANT OMEGA') fail('the final rung is not the 300% Giant Boss (scale ' + g.scale + ', ' + g.ch.name + ')');
        if (Math.abs(bodyRect(g).h - BODY_H * 3) > 0.01 || Math.abs(bodyRect(g).w - BODY_W * 3) > 0.01) fail('the giant\\'s hurtbox is not 300%');
        const m = buildMove(g, 'fsmash'), hb = hitboxRect(g, m), hb1 = hitboxRect(Object.assign({}, g, { scale: 1 }), m); if (!(hb.w > hb1.w * 2.9)) fail('the giant\\'s attacks are not scaled');
        B.G.mode = 'play'; B.fighters[0].cpu = true; const savedR = B.SET.renderer;
        for (let k = 0; k < 360; k++) { B.step(); if (k % 30 === 0) { B.SET.renderer = k % 60 ? 'canvas' : 'webgl'; B.render(); } }
        B.SET.renderer = savedR;
        if (g.state !== 'dead' && g.onGround && !(Math.abs(g.y - STAGE.y) < 1 || PLATS.some(p => Math.abs(p.y - g.y) < 1))) fail('the giant is not standing on the stage (y ' + g.y + ')');
        startSuddenDeath(); if (B.fighters[1].scale !== 3) fail('Sudden Death shrank the Giant Boss');
        // the final boss: OMNI HAND — floats, attacks, takes HP damage without knockback, a parry stuns it, 0 HP clears the Arcade
        A.idx = 7; arcadeFight(); B.G.mode = 'play'; const h = B.fighters[1], me = B.fighters[0];
        if (!h.hand || h.hpMax !== HAND_HP || h.onGround) fail('the final rung is not the floating hand boss');
        else {
          me.cpu = true; const seenSt = new Set(), savedR2 = B.SET.renderer;
          for (let k = 0; k < 1500; k++) { B.step(); seenSt.add(h.bs.st); if (k % 40 === 0) { B.SET.renderer = k % 80 ? 'canvas' : 'webgl'; B.render(); } if (B.G.mode !== 'play') break; }
          B.SET.renderer = savedR2;
          const atk = ['slam', 'poke', 'sweep', 'fist', 'gun'].filter(s => seenSt.has(s)); if (atk.length < 3) fail('the hand boss used only ' + atk.join(', ') + ' in 25 s');
          arcadeFight(); B.G.mode = 'play'; const h2 = B.fighters[1], p2 = B.fighters[0]; p2.cpu = false; run(80);
          const x0 = h2.x, hp0 = h2.percent; deliver(p2, h2, { dmg: 12, base: 20, scale: 0.2, ang: 45, heavy: true }, 1, h2.x, h2.y - 50, false);
          if (!(h2.percent > hp0)) fail('hitting the hand boss did no damage'); if (Math.abs(h2.vx || 0) > 0.01 || h2.state === 'hitstun') fail('the hand boss was knocked back');
          if (document.querySelector('.hp.p2 .hp-pct em').textContent !== 'HP') { B.render(); updateHUD(); } if (document.querySelector('.hp.p2 .hp-pct em').textContent !== 'HP') fail('the HUD does not show the boss\\'s HP');
          doParry(p2, h2, p2.x, p2.y - 32); for (let k = 0; k < 20 && h2.bs.st !== 'stun'; k++) B.step(); if (h2.bs.st !== 'stun') fail('a parry did not stagger the hand boss (' + h2.bs.st + ')');
          h2.percent = h2.hpMax - 1; deliver(p2, h2, { dmg: 5, base: 5, scale: 0.05, ang: 45 }, 1, h2.x, h2.y - 50, false); untilOver();
          if (A.state !== 'clear' || document.getElementById('lad-title').textContent !== 'ARCADE CLEAR!') fail('defeating the hand boss did not clear the Arcade (' + A.state + ')');
          A.idx = 7; A.state = 'fight';
        }
        arcadeFight(); B.G.mode = 'play'; const p = B.fighters[0]; p.cpu = false; B.fighters[1].cpu = false;
        for (let k = 0; k < 3; k++) { live(p); p.x = BZ.l - 200; p.y = 300; B.step(); run(5); }
        untilOver(); if (A.state !== 'lost' || !document.querySelector('#lad-menu [data-act="chal-continue"]')) fail('losing an Arcade rung did not offer a continue (' + A.state + ')');
        B.go('scr-main'); if (CHAL.mode || B.fighters[1].bossScale) fail('leaving the Arcade did not clear it');
        B.SEL.boss = false; B.startMatch(); if (B.fighters[1].scale !== 1) fail('a normal match after the Arcade still has a giant'); B.go('scr-main');
      } }
    // 53. Break the Targets: each fighter's own seeded course with 10 targets; real attacks break them; the speedrun clock
    //     runs; finishing shows COMPLETE! + the time and saves the record
    { const ci = id => B.CHARS.findIndex(c => c.id === id);
      const a1 = JSON.stringify(bttCourse(B.CHARS[ci('velocity')]).plats), a2 = JSON.stringify(bttCourse(B.CHARS[ci('velocity')]).plats), b1 = JSON.stringify(bttCourse(B.CHARS[ci('titan')]).plats);
      if (a1 !== a2) fail('a fighter\\'s target course is not stable'); if (a1 === b1) fail('two fighters share the same target course');
      B.SEL.p1 = ci('velocity'); B.SEL.challenge = 'btt'; chalGo();
      if (B.G.screen !== 'scr-ladder' || document.querySelectorAll('#lad-list li').length !== 5) fail('Break the Targets did not open its 5-stage list');
      bttStart(1); const T = CHAL.btt;
      if (!T || T.targets.length !== 10 || B.fighters[1].state !== 'dead') fail('Break the Targets did not start (' + (T && T.targets.length) + ' targets)');
      else {
        for (const t of T.targets) if (t.x < BZ.l + 40 || t.x > BZ.r - 40 || t.y < BZ.t + 40 || t.y > BZ.b - 40) fail('a target sits outside the blast zones (' + t.x + ',' + t.y + ')');
        run(140); B.render(); const f = B.fighters[0]; f.cpu = false; B.TOUCH.using = true; B.TOUCH.sx = 1; B.TOUCH.sy = 0;
        for (const t of T.targets) for (let tries = 0; tries < 4 && !t.hit; tries++) {
          Object.assign(f, { x: t.x - 34, y: t.y + 36, vx: 0, vy: -4, state: 'free', onGround: false, ground: null, facing: 1, move: null, helpless: false, hitDone: false });
          B.pressed.add('M0'); for (let k = 0; k < 12 && !t.hit; k++) B.step();
        }
        B.TOUCH.using = false; B.TOUCH.sx = 0;
        if (T.broke !== 10) fail('attacks broke only ' + T.broke + ' of 10 targets');
        if (!(T.t > 60)) fail('the speedrun clock did not run (' + T.t + ')');
        for (let k = 0; k < 400 && B.G.mode !== 'over'; k++) B.step();
        if (B.G.screen !== 'scr-ladder' || document.getElementById('lad-title').textContent !== 'STAGE 1 CLEAR!') fail('finishing the course did not show STAGE 1 CLEAR! (' + B.G.screen + ')');
        let rec = {}; try { rec = JSON.parse(localStorage.getItem('neonbrawl.btt')) || {}; } catch (e) {}
        if (!rec['velocity/1']) fail('the course record was not saved');
        if (!(stageProgress().btt >= 2)) fail('clearing Stage 1 did not unlock Stage 2');
        B.go('scr-main');
      } }
    // 54. Board the Platforms: 10 tiny platforms per fighter (stable per fighter, different between fighters); boarding all
    //     of them completes the course; running out of time ends it with TIME UP
    { const ci = id => B.CHARS.findIndex(c => c.id === id);
      const c1 = btpCourse(B.CHARS[ci('sylph')]), c2 = btpCourse(B.CHARS[ci('sylph')]), c3 = btpCourse(B.CHARS[ci('titan')]);
      if (JSON.stringify(c1.plats) !== JSON.stringify(c2.plats)) fail('a platform course is not stable'); if (JSON.stringify(c1.plats) === JSON.stringify(c3.plats)) fail('two fighters share a platform course');
      if (c1.plats.length !== 10 || c1.plats.some(p => p.w > 46)) fail('the platform course should have 10 tiny platforms (' + c1.plats.length + ')');
      B.SEL.p1 = ci('sylph'); B.SEL.challenge = 'btp'; chalGo(); btpStart(1); const P = CHAL.btp; run(140); const f = B.fighters[0]; f.cpu = false;
      for (const p of P.plats) { Object.assign(f, { x: p.x + p.w / 2, y: p.y - 30, vx: 0, vy: 2, state: 'free', onGround: false, ground: null, helpless: false }); for (let k = 0; k < 30 && !p.boarded; k++) B.step(); }
      if (P.boarded !== 10) fail('landing on the platforms boarded only ' + P.boarded + ' of 10');
      for (let k = 0; k < 400 && B.G.mode !== 'over'; k++) B.step();
      if (document.getElementById('lad-title').textContent !== 'STAGE 1 CLEAR!') fail('boarding every platform did not complete the course');
      btpStart(1); run(140); CHAL.btp.t = CHAL.btp.limit - 2; for (let k = 0; k < 400 && B.G.mode !== 'over'; k++) B.step();
      if (document.getElementById('lad-title').textContent !== 'TIME UP!') fail('running out of time did not end the course');
      B.go('scr-main'); }
    // 54b. every fighter gets all 5 stages of both solo challenges, fully populated (reach-clamped walks never run dry)
    { let thin = 0;
      for (const ch of B.CHARS) for (let s = 1; s <= 5; s++) {
        const a = bttCourse(ch, s), b = btpCourse(ch, s);
        if (a.targets.length !== BTT_STAGES[s - 1].targets || a.plats.length < BTT_STAGES[s - 1].plats - 1 || b.plats.length < BTP_STAGES[s - 1].plats - 1) { thin++; if (thin < 4) fail(ch.id + ' stage ' + s + ' course is under-populated (' + a.plats.length + ' / ' + b.plats.length + ')'); }
      } }
    // 55. skins are real geometry: for every fighter, skin 2 (a helmet) and skin 3 (spiked armour + a different weapon or
    //     claws) build different 3D models from the base skin and from each other
    if (!B.GL3D.failed && B.GL3D.ok) {
      const sig = (ch, k) => { const d = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill }; resetFighter(d, 640); applySkin(d, ch, k);
        const n0 = B.GL3D.n; collectFighter3D(d, solveRig(d)); const meshes = []; for (let i = n0; i < B.GL3D.n; i++) meshes.push(Object.keys(B.GL3D.mesh).find(m => B.GL3D.mesh[m] === B.GL3D.items[i].mesh) || '?');
        B.GL3D.n = n0; return meshes.length + ':' + meshes.sort().join(','); };
      let same = 0;
      for (const ch of B.CHARS) { const S = [0, 1, 2, 3, 4, 5, 6].map(k => sig(ch, k)); if (new Set(S).size !== S.length) { same++; if (same < 4) fail(ch.name + '\\'s skins do not all change its 3D geometry'); } }
      B.render(); }
    // 56. v11 engine: a WebGL 2 context, the post-FX scene drawn into a hardware-multisampled target, the scene graph
    if (!B.GL3D.failed && B.GL3D.ok) {
      if (!B.GL3D.gl2) fail('the renderer is not running on WebGL 2');
      const savedFx = B.SET.fx; B.SET.fx = 'comic'; B.SET.aa = 'msaa'; setup('blaze', 'dino', B.STAGES.findIndex(s => s.id === 'nebula')); B.SET.renderer = 'webgl'; run(5); B.render(); B.render();
      if (B.GL3D.gl2 && !(FX.t.ms && FX.t.ms.ms >= 2)) fail('post FX is not rendering into a multisampled (MSAA) target');
      const ge = B.GL3D.gl.getError(); if (ge) fail('GL error ' + ge + ' after an MSAA frame');
      if (!(STAGE3D.main && STAGE3D.main.count > 20000)) fail('Nebula Apex has no smooth high-poly hull (' + (STAGE3D.main && STAGE3D.main.count) + ' indices)');
      if (!NEB_SG || !NEB_SG.platform.find('monolith3') || !NEB_SG.giant.find('moon')) fail('the Nebula Apex scene graph is incomplete');
      const root = new SceneNode('r', { pos: [100, 0, 0], rot: [0, Math.PI / 2, 0] }), kid = new SceneNode('k', { pos: [0, 0, 10] }); root.add(kid); root.update(null, 0);
      if (Math.abs(kid.world[12] - 110) > 1e-3 || Math.abs(kid.world[14]) > 1e-3) fail('scene graph world matrices do not compose (' + kid.world[12].toFixed(2) + ', ' + kid.world[14].toFixed(2) + ')');
      for (const g of [GEO.mobius(), GEO.surfboard(), GEO.hull(300, 100, 200), GEO.superellipsoid(), GEO.bezierPatch([[[0,0,0],[1,0,0],[2,0,0],[3,0,0]],[[0,1,0],[1,1,1],[2,1,1],[3,1,0]],[[0,2,0],[1,2,1],[2,2,1],[3,2,0]],[[0,3,0],[1,3,0],[2,3,0],[3,3,0]]])])
        for (let i = 0; i < g.nor.length; i += 3) { const l = Math.hypot(g.nor[i], g.nor[i + 1], g.nor[i + 2]); if (!(Math.abs(l - 1) < 1e-3)) { fail('smooth geometry has a non-unit normal (' + l + ')'); break; } }
      B.SET.fx = savedFx;
    }
    // 57. the 5 newcomers: own data, motion profile, gait, punch, victory / defeat, Ultimate, emote and a distinct 3D model
    for (const id of ['axiom', 'riptide', 'monolith', 'origami', 'comet']) {
      const ch = B.CHARS.find(c => c.id === id); if (!ch) { fail('missing newcomer ' + id); continue; }
      for (const [k, T] of [['MOTION', B.MOTION], ['VICTORY_ANIM', B.VICTORY_ANIM], ['DEFEAT_ANIM', B.DEFEAT_ANIM], ['ULTS', ULTS], ['ACC3D', B.ACC3D]]) if (!T[id]) fail(id + ' has no ' + k + ' entry');
      if (!PUNCH[B.MOTION[id].arm] || !GAIT_PUNCH[B.MOTION[id].g]) fail(id + ' has no punch style for its arm / gait');
      setupDummy(id, 'titan', 0); B.fighters[1].x = 1200; const f = B.fighters[0]; run(20); B.keys.add('KeyD'); run(30); const pr = B.computePose(f)[1]; B.keys.clear(); run(45);
      if (pr !== 'run:' + id && pr !== 'walk:' + id) fail(id + ' does not use its own gait (' + pr + ')');
      if (!B.computePose(f)[1].startsWith('idle:' + id)) fail(id + ' does not use its own idle (' + B.computePose(f)[1] + ')');
    }
    // 57b. every quake fighter's down-smash shockwaves fire (Riptide's waves come from its own quakeWave, not a special)
    for (const ch of B.CHARS.filter(c => c.quake)) { setupDummy(ch.id, 'titan', 0); const n0 = B.projs.length; try { quake(B.fighters[0]); } catch (e) { fail(ch.id + ' quake threw: ' + e.message); }
      if (B.projs.length !== n0 + 2) fail(ch.id + ' quake made no shockwaves'); }
    // 58. taunts + emojis: G starts the fighter's emote (rooted, vulnerable, its own pose), it ends by itself; 1-4 pop an
    //     emoji, Battle Pass emojis stay locked until earned; both travel in the online input packets
    { const savedPass = localStorage.getItem('neonbrawl.pass'), savedXP = PASS.xp;
      setupDummy('origami', 'titan', 0); const f = B.fighters[0]; run(30); B.pressed.add('KeyG'); B.step();
      if (f.state !== 'emote' || f.emoteK !== 'bow') fail('G did not start the emote (state ' + f.state + ', ' + f.emoteK + ')');
      if (B.computePose(f)[1] !== 'emote:bow') fail('the emote has no pose of its own');
      run(f.emoteDur + 2); if (f.state !== 'free') fail('the emote did not end (' + f.state + ')');
      B.pressed.add('KeyG'); B.step(); const v = B.fighters[1]; v.x = f.x + 40; v.facing = -1; v.state = 'attack'; v.move = buildMove(v, 'jab'); v.stateT = v.move.s; v.hitDone = false; run(4);
      if (f.state !== 'hitstun') fail('a taunting fighter was not open to attack (' + f.state + ')');
      EMOJI_FX.length = 0; PASS.xp = 0; f.emojiCD = 0; B.pressed.add('Digit1'); B.step(); if (!EMOJI_FX.some(e => e.f === f && e.i === 0)) fail('key 1 did not pop an emoji');
      f.emojiCD = 0; EMOJI_FX.length = 0; B.pressed.add('Digit5'); B.step(); if (EMOJI_FX.length) fail('a locked Battle Pass emoji could be used');
      PASS.xp = 1e6; f.emojiCD = 0; B.pressed.add('Digit5'); B.step(); if (!EMOJI_FX.some(e => e.i === 4)) fail('an unlocked Battle Pass emoji could not be used');
      const pk = unpackInput(packInput(Object.assign(emptyInput(), { emoteP: true, emoji: 6, aimX: 3, aimY: -4 }))); if (!pk.emoteP || pk.emoji !== 6 || pk.aimX !== 3) fail('emotes / emojis do not survive the online input packet');
      if (!document.querySelector('#touch .t-emote') || !document.querySelector('#touch .t-emoji')) fail('the touch controls have no Emote / emoji buttons');
      // 59. 3D nameplates: a lettering atlas + a billboard per fighter, drawn in the WebGL frame
      if (!B.GL3D.failed && B.GL3D.ok) { B.SET.renderer = 'webgl'; B.SET.plates = true; B.G.mode = 'play'; B.render(); if (!(B.GL3D.sprN >= 2) || NP.slots.size < 2) fail('no 3D nameplates were drawn (' + B.GL3D.sprN + ')'); }
      // 60. the Battle Pass: 250 tiers (v16), XP → tiers → unlocks, saved to localStorage and read back; locked skins fall back to Base
      if (PASS_REWARDS.length !== 250 || new Set(PASS_REWARDS.map(r => r[0])).size !== 250 || PASS_TIERS !== 250) fail('the Battle Pass does not have 250 tiers with a reward each');
      PASS.xp = 0; passSave(); const ch0 = B.CHARS[0]; B.SEL.skins[ch0.id] = 3; if (skinIdx(ch0) !== 0) fail('a locked pass skin was usable');
      const r = passAward([['test', passTierXP(1) + passTierXP(2) + 5]]); if (r.to !== 2 || !passOwns(passKey(PASS_REWARDS[1])) || passOwns(passKey(PASS_REWARDS[2]))) fail('XP did not unlock exactly tiers 1-2 (' + r.to + ')');
      PASS.xp = 0; passLoad(); if (passTier() !== 2) fail('Battle Pass progress was not saved / reloaded (' + passTier() + ')');
      PASS.xp = passTotalXP(); if (passTier() !== 250 || !passOwns('skin6') || skinIdx(ch0) !== 3) fail('the whole pass did not unlock every reward');
      PASS.equip.theme = 'gold'; applyUITheme(); if (document.getElementById('wrap').dataset.uitheme !== 'gold') fail('UI themes do not apply');
      PASS.equip.spark = 'pixel'; const n0 = fx.length; setupDummy('blaze', 'titan', 0); const a = B.fighters[0], b2 = B.fighters[1]; b2.x = a.x + 40; a.facing = 1; a.state = 'attack'; a.move = buildMove(a, 'jab'); a.stateT = a.move.s; a.hitDone = false; run(3);
      if (!fx.some(p => p.type === 'pixel')) fail('the equipped hit-spark style did not fire on a hit'); void n0;
      setupDummy('blaze', 'titan', 0); B.fighters[0].st.dmg = 120; B.fighters[0].st.kos = 2; B.G.winner = B.fighters[0]; const x0 = PASS.xp = 0; const res = passMatchXP();
      if (!res || !(PASS.xp > x0 + 500) || !document.getElementById('res-pass').innerHTML.includes('XP')) fail('a won match gave no Battle Pass XP');
      B.go('scr-pass'); B.render(); if (document.querySelectorAll('#bp-track .bp-card').length !== 250) fail('the Battle Pass screen does not show 250 tiers');
      PASS.equip = { spark: 'classic', theme: 'neon', plate: 'basic', title: '' }; applyUITheme(); B.SEL.skins[ch0.id] = 0; delete B.SEL.skins[ch0.id];
      PASS.xp = savedXP; if (savedPass === null) localStorage.removeItem('neonbrawl.pass'); else localStorage.setItem('neonbrawl.pass', savedPass); passLoad(); }
    // 61. v12 gamepad: a pad presses the same virtual keys as the keyboard (stick moves, A attacks, the right stick aims,
    //     Start pauses + resumes) and drives the menus with spatial focus
    { const pad = { id: 'Smoke Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true, writable: true });
      try {
        setupDummy('blaze', 'titan', 0); const f = B.fighters[0]; run(20); const x0 = f.x;
        pad.axes[0] = 1; for (let i = 0; i < 30; i++) { pollGamepad(); B.step(); }
        if (!B.keys.has('KeyD') || !(f.x > x0 + 20)) fail('the gamepad stick did not move the fighter (' + (f.x - x0).toFixed(1) + ')');
        pad.axes[0] = 0; pollGamepad(); if (B.keys.has('KeyD')) fail('letting go of the stick did not release its key');
        pad.axes[2] = -1; pollGamepad(); if (!(GP.aimX < -50) || !GP.using) fail('the right stick does not aim (' + GP.aimX + ')');
        pad.axes[2] = 0; pad.buttons[0].pressed = true; pollGamepad(); if (!B.pressed.has('M0')) fail('A did not press light attack'); B.step();
        pad.buttons[0].pressed = false; pollGamepad();
        pad.buttons[9].pressed = true; pollGamepad(); if (!B.G.paused) fail('Start did not pause the match'); pad.buttons[9].pressed = false; pollGamepad();
        pad.buttons[9].pressed = true; pollGamepad(); if (B.G.paused) fail('Start did not resume from the pause menu'); pad.buttons[9].pressed = false; pollGamepad();
        B.go('scr-main'); pad.axes[1] = 1; pollGamepad(); pad.axes[1] = 0; pollGamepad(); pad.axes[1] = 1; pollGamepad(); pad.axes[1] = 0; pollGamepad();
        if (!document.querySelector('#scr-main .gp-focus')) fail('the gamepad cannot move the focus in the menus');
      } finally { delete navigator.getGamepads; gpRelease(); GP.using = false; document.querySelectorAll('.gp-focus').forEach(e => e.classList.remove('gp-focus')); if (document.activeElement) document.activeElement.blur(); B.keys.clear(); B.pressed.clear(); }
    }
    // 62. v12 profile: the main menu username is cleaned + saved; challenge results unlock titles (the first is equipped),
    //     CPUs earn nothing, and the nameplate reads [Title] [Username]
    { const savedProf = localStorage.getItem('neonbrawl.profile'), savedPass = localStorage.getItem('neonbrawl.pass'), savedName = PROFILE.name, savedEarned = PROFILE.earned.slice(), savedTitle = PASS.equip.title;
      try {
        B.go('scr-main'); const nm = document.getElementById('pf-name'); nm.value = '   Mansour   '; nm.dispatchEvent(new Event('change'));
        if (PROFILE.name !== 'Mansour') fail('the username input was not applied (' + PROFILE.name + ')');
        PROFILE.name = ''; profileLoad(); if (PROFILE.name !== 'Mansour') fail('the username was not saved (' + PROFILE.name + ')');
        profileUI(); if (document.getElementById('pf-avatar').textContent !== 'M') fail('the profile card does not show the username');
        const dirty = cleanName('<img src=x onerror=1>' + 'z'.repeat(30)); if (/[<>]/.test(dirty) || dirty.length > 16) fail('usernames are not sanitised (' + dirty + ')');
        PROFILE.earned = []; PASS.equip.title = ''; setupDummy('blaze', 'titan', 0);
        challengeTitles('btt', { done: true, failed: false, stage: 5, final: 15 * 60 });
        for (const id of ['sharpshooter', 'targetMaster', 'speedDemon']) if (!PROFILE.earned.includes(id)) fail('a fast Break the Targets stage 5 clear did not earn ' + id);
        if (PASS.equip.title !== 'Sharpshooter') fail('the first title earned was not equipped (' + PASS.equip.title + ')');
        challengeTitles('arcade', { state: 'clear', rungs: [{ boss: 'hand' }], idx: 1, continues: 0 });
        if (!ownedTitles().includes('The Unstoppable') || !PROFILE.earned.includes('ironWill') || !PROFILE.earned.includes('handBreaker')) fail('clearing the Classic Arcade did not earn its titles');
        B.fighters[0].cpu = true; const n = PROFILE.earned.length; challengeTitles('btp', { done: true, failed: false, stage: 5 }); if (PROFILE.earned.length !== n) fail('a CPU earned a title'); B.fighters[0].cpu = false;
        B.fighters[0].st.best = 10; comboTitle(); if (!PROFILE.earned.includes('comboKing')) fail('a 10-hit combo did not earn Combo King');
        PASS.equip.title = 'Combo King'; const pi = plateInfo(B.fighters[0], 0);
        if (pi.title !== 'Combo King' || pi.name !== 'Mansour') fail('the nameplate does not read [Title] [Username] (' + pi.title + ' / ' + pi.name + ')');
        const s = plateSlot(pi.title, pi.name, pi.sub, B.fighters[0].color); if (!s || !(s.w > 0)) fail('the nameplate lettering was not drawn');
      } finally {
        PROFILE.name = savedName; PROFILE.earned = savedEarned; PASS.equip.title = savedTitle;
        if (savedProf === null) localStorage.removeItem('neonbrawl.profile'); else localStorage.setItem('neonbrawl.profile', savedProf);
        if (savedPass === null) localStorage.removeItem('neonbrawl.pass'); else localStorage.setItem('neonbrawl.pass', savedPass); passLoad(); }
    }
    // 63. v12 settings: a tabbed overlay (Audio · Graphics · Controls · Gameplay); switches, sliders and pills apply instantly
    { const savedSet = localStorage.getItem('neonbrawl.settings'), saved = { haptics: SET.haptics, touchScale: SET.touchScale, fx: SET.fx };
      try {
        B.go('scr-settings'); const tabs = document.querySelectorAll('#set-tabs [data-settab]');
        if (tabs.length !== 6) fail('the settings overlay does not have its 6 categories (' + tabs.length + ')');
        document.querySelector('#set-tabs [data-settab="controls"]').click();
        if (!document.querySelector('#set-rows [data-slide="touchScale"]')) fail('the Controls tab does not show the touch size slider');
        const h0 = !!SET.haptics; document.querySelector('#set-rows .switch[data-set="haptics"]').click();
        if (!!SET.haptics === h0) fail('a settings switch did not change its setting');
        const sl = document.querySelector('#set-rows [data-slide="touchScale"]'); sl.value = '1.2'; sl.dispatchEvent(new Event('input', { bubbles: true }));
        if (Math.abs(SET.touchScale - 1.2) > 1e-6 || document.getElementById('wrap').style.getPropertyValue('--ts').trim() !== '1.2') fail('the touch size slider did not apply');
        document.querySelector('#set-tabs [data-settab="graphics"]').click(); document.querySelector('#set-rows [data-set="fx"][data-i="1"]').click();
        if (SET.fx !== 'bloom') fail('a segmented setting did not apply (' + SET.fx + ')');
      } finally { Object.assign(SET, saved); applySettingsCSS(); setTab = 'audio'; if (savedSet === null) localStorage.removeItem('neonbrawl.settings'); else localStorage.setItem('neonbrawl.settings', savedSet); }
    }
    // 64. v12 online: 6-character room codes; the guest's OFFER goes through the public PeerJS relay PeerJS-shaped (a fake
    //     socket here) on a peer connection with public STUN; hello carries the username + title; the delay follows the ping
    { const RealWS = window.WebSocket, sent = [], savedName = PROFILE.name;
      class FakeWS { constructor(url) { this.url = url; this.readyState = 1; FakeWS.last = this; setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: 'OPEN' }) }), 5); }
        send(m) { sent.push(JSON.parse(m)); } close() { this.readyState = 3; } }
      const codes = Array.from({ length: 40 }, () => newRoomCode());
      if (!codes.every(c => /^[A-HJ-NP-Z2-9]{6}$/.test(c))) fail('room codes are not 6 unambiguous letters / digits (' + codes[0] + ')');
      if (fmtRoom('ABC234') !== 'ABC 234') fail('room codes are not shown as ABC 234');
      window.WebSocket = FakeWS;
      try {
        await netJoinRoom('abc-234');
        const url = (FakeWS.last && FakeWS.last.url) || '';
        if (!url.startsWith('wss://0.peerjs.com') || !url.includes('key=peerjs')) fail('room codes do not use the public PeerJS relay (' + url + ')');
        const off = sent.find(m => m.type === 'OFFER'), P = (off && off.payload) || {};
        if (!off || off.dst !== 'neonbrawl-v20-ABC234' || P.type !== 'data' || !P.connectionId || !P.sdp || P.sdp.type !== 'offer') fail('the room OFFER is not PeerJS-shaped (' + JSON.stringify(Object.keys(P)) + ')');
        if (!(NET.pc && NET.pc.getConfiguration().iceServers.some(s => [].concat(s.urls).some(u => u.startsWith('stun:'))))) fail('the peer connection has no public STUN servers');
      } catch (e) { fail('joining a room threw: ' + e.message); }
      finally { netClose(true); window.WebSocket = RealWS; }
      const dsent = [];
      NET.dc = { readyState: 'open', send: m => dsent.push(JSON.parse(m)), close() {} }; NET.role = 'host'; NET.me = 0; NET.connected = true; NET.ping = 120;
      try {
        PROFILE.name = 'Host'; netHello(); const h = dsent.find(m => m.t === 'hello'); if (!h || h.n !== 'Host' || !('ti' in h)) fail('hello does not carry the username + title');
        netOnMessage({ t: 'hello', c: 3, s: 1, n: 'Ri<val>', ti: 'Target Master' });
        if (!NET.peer || NET.peer.n !== 'Rival' || NET.peer.ti !== 'Target Master') fail('the rival name / title was not read (' + JSON.stringify(NET.peer) + ')');
        netSendStart(); const st = dsent.find(m => m.t === 'start'), want = Math.max(3, Math.min(9, Math.ceil(120 / 2 / STEP) + 2));
        if (!st || st.cfg.delay !== want || NET.delay !== want || want < 5) fail('the input delay does not follow the ping (' + (st && st.cfg.delay) + ' vs ' + want + ')');
        const pr = plateInfo(B.fighters[1], 1); if (pr.name !== 'Rival' || pr.title !== 'Target Master') fail('the online rival nameplate does not show their name + title');
      } finally { netEndMatch(); netClose(true); NET.ping = 0; PROFILE.name = savedName; }
    }
    // 65. v12 stage lighting: each arena's light rig feeds cel point lights; the desert sun casts god rays; no GL errors
    if (!B.GL3D.failed && B.GL3D.ok) {
      const savedFx = B.SET.fx; B.SET.fx = 'comic'; B.SET.renderer = 'webgl';
      setup('blaze', 'titan', B.STAGES.findIndex(s => s.id === 'volcano')); run(5); B.render();
      B.GL3D.plN = 0; stageLights3D(); if (!(B.GL3D.plN >= 2)) fail('the volcano light rig made no point lights (' + B.GL3D.plN + ')');
      const realRays = fxSunRays; let rays = 0; window.fxSunRays = sky => { const r = realRays(sky); if (r) rays++; return r; };
      try { setup('blaze', 'titan', B.STAGES.findIndex(s => s.id === 'desert')); run(5); B.render(); B.render(); } finally { window.fxSunRays = realRays; }
      if (!rays) fail('the desert sun casts no god rays');
      const ge = B.GL3D.gl.getError(); if (ge) fail('GL error ' + ge + ' after a lit, god-rayed frame');
      B.SET.fx = savedFx;
    }
    // 66. v12 platform: iOS web-app meta tags, a full-bleed viewport, no page gestures / text selection, the rotate card
    { if (!document.querySelector('meta[name="apple-mobile-web-app-capable"][content="yes"]')) fail('no apple-mobile-web-app-capable meta tag');
      if (!/viewport-fit=cover/.test(document.querySelector('meta[name="viewport"]').content)) fail('the viewport is not viewport-fit=cover');
      const bs = getComputedStyle(document.body); if (bs.touchAction !== 'none' || (bs.webkitUserSelect || bs.userSelect) !== 'none') fail('the page allows touch gestures / text selection');
      const rot = document.getElementById('rotate'); if (!rot || getComputedStyle(rot).display !== 'none') fail('the rotate-your-device card is missing or showing in landscape');
      if (typeof PLATFORM !== 'object' || !('ios' in PLATFORM)) fail('no PLATFORM flags');
      B.go('scr-pass'); const tr = document.getElementById('bp-track');
      if (getComputedStyle(tr).overflowY !== 'auto' || document.querySelectorAll('#bp-track .bp-sec').length !== 25 || !(tr.scrollHeight > tr.clientHeight)) fail('the Battle Pass track is not a scrollable list with 25 sections'); }
    // ======================= v13 =======================
    const savedWallet = localStorage.getItem('neonbrawl.wallet'), savedProfile = localStorage.getItem('neonbrawl.profile'), savedSettings = localStorage.getItem('neonbrawl.settings'), savedSkins = localStorage.getItem('neonbrawl.skins'), savedMini = localStorage.getItem('neonbrawl.minigames');
    const savedPro = localStorage.getItem('neonbrawl.pro'), PRO0 = JSON.parse(JSON.stringify(PRO)), EQ0 = JSON.parse(JSON.stringify(PASS.equip));
    const W0 = JSON.parse(JSON.stringify(WALLET));
    try {
      // 67. no video anywhere; the intro credits the lead designer; the main menu shows Coins + the Item Shop
      if (document.querySelector('video')) fail('there is still a <video> element');
      if (!/A Game by Lead Designer/i.test(document.getElementById('scr-intro').textContent) || !/MANSOUR\\s*SAKKA/.test(document.querySelector('.credit-name').textContent)) fail('the intro credit is missing');
      if (!document.querySelector('#scr-main .coinchip .coin-n') || !document.querySelector('#scr-main [data-go="scr-shop"]')) fail('the main menu has no Coins / Item Shop');
      // 68. Coins: earned only by playing — a won match pays, the daily bonus pays once, challenges pay; saved and reloaded
      WALLET.coins = 0; WALLET.owned = []; WALLET.day = ''; walletSave();
      setupDummy('blaze', 'titan', 0); B.fighters[0].st.dmg = 120; B.fighters[0].st.kos = 2; B.G.winner = B.fighters[0];
      const r1 = coinMatchReward(); if (!r1 || !(r1.gained >= 20 + 18 + 20 + 40 + 50)) fail('a won match paid too few coins (' + (r1 && r1.gained) + ')');
      const r2 = coinMatchReward(); if (r2.lines.some(l => /day/.test(l[0]))) fail('the first-battle-of-the-day bonus paid twice');
      const r3 = coinChallengeReward('btt', { done: true, failed: false, stage: 3, record: true, prev: 0 }); if (!(r3.gained >= 85)) fail('a challenge clear paid too few coins');
      const have = WALLET.coins; WALLET.coins = 0; walletLoad(); if (WALLET.coins !== have) fail('coins were not saved (' + WALLET.coins + ' vs ' + have + ')');
      B.G.training = true; if (coinMatchReward()) fail('Training paid coins'); B.G.training = false;
      // 69. the Item Shop: 5 fighters, 2 maps, 45 skins, 10 emotes, 12 emojis; nothing without coins; buying unlocks for good
      buildCatalog(); const cnt = t => SHOP_CATALOG.filter(it => it.type === t).length;
      if (cnt('fighter') !== 7 || cnt('map') !== 5 || cnt('skin') !== 45 || cnt('emote') !== 11 || cnt('emoji') !== 12) fail('the shop catalog is wrong (' + ['fighter', 'map', 'skin', 'emote', 'emoji'].map(cnt).join('/') + ')');
      const dj = shopItem('char:djinn'), djI = B.CHARS.findIndex(c => c.id === 'djinn');
      WALLET.coins = 10; if (shopBuy(dj) || shopOwns('char:djinn')) fail('a fighter was bought without enough coins');
      if (charUnlocked(djI) || playablePool().includes(djI)) fail('a shop fighter is playable before it is bought');
      B.SEL.cpu = null; for (let k = 0; k < 30; k++) { B.startMatch(); if (B.fighters[1].ch.shop) { fail('a random CPU picked a locked shop fighter'); break; } }
      WALLET.coins = 99999; const cost = priceOf(dj); if (!shopBuy(dj) || !charUnlocked(djI) || WALLET.coins !== 99999 - cost) fail('buying a fighter did not unlock it / charge the price');
      const hz = shopItem('map:horizon'), hzI = B.STAGES.findIndex(s => s.id === 'horizon'); if (stageUnlocked(hzI) || playableStages().includes(hzI)) fail('a shop map is playable before it is bought');
      shopBuy(hz); if (!stageUnlocked(hzI)) fail('buying a map did not unlock it');
      const sk = shopItem('skin:shogun'); if (skinUnlocked(sk.idx)) fail('a shop skin is usable before it is bought');
      shopBuy(sk); if (!skinUnlocked(sk.idx)) fail('buying a skin did not unlock it');
      shopBuy(shopItem('emote:guitar')); shopBuy(shopItem('emoji:rocket')); if (!emoteOwned('guitar') || !emojiUnlocked(emojiIndex('rocket'))) fail('buying an emote / emoji did not unlock it');
      WALLET.owned = []; walletLoad(); if (!shopOwns('char:djinn') || !shopOwns('skin:shogun')) fail('purchases were not saved');
      const deals = dailyDeals(); if (deals.length && !(priceOf(deals[0]) < deals[0].price)) fail('daily deals are not discounted');
      B.go('scr-shop'); for (const tab of ['featured', 'fighter', 'map', 'skin', 'emote', 'emoji']) { document.querySelector('[data-act="shop-tab"][data-tab="' + tab + '"]').click(); const c = document.querySelector('.shop-card'); if (!c) { fail('the ' + tab + ' tab is empty'); continue; } c.click(); B.render(); }
      if (getComputedStyle(document.getElementById('shop-grid')).overflowY !== 'auto') fail('the shop grid does not scroll');
      // 70. the 5 shop fighters: own data, motion, animations, model, emote and Ultimate; their specials work
      for (const id of ['djinn', 'scarab', 'lumen', 'totem', 'hive', 'pug', 'panda']) { const ch = B.CHARS.find(c => c.id === id);
        for (const [k, T] of [['MOTION', B.MOTION], ['VICTORY_ANIM', B.VICTORY_ANIM], ['DEFEAT_ANIM', B.DEFEAT_ANIM], ['ULTS', ULTS], ['ACC3D', B.ACC3D], ['EMOTE_OVERRIDE', EMOTE_OVERRIDE]]) if (!T[id]) fail(id + ' has no ' + k + ' entry');
        setupDummy(id, 'titan', 0); B.fighters[1].x = 1200; const f = B.fighters[0]; run(20); B.keys.add('KeyD'); run(30); const pr = B.computePose(f)[1]; B.keys.clear(); run(45);
        if (pr !== 'run:' + id && pr !== 'walk:' + id) fail(id + ' does not use its own gait (' + pr + ')'); void ch; }
      setupDummy('hive', 'titan', 0); { const f = B.fighters[0]; f.x = 500; B.fighters[1].x = 900; B.mouse.cx = 900; B.mouse.cy = 330; const n0 = B.projs.length; B.pressed.add('KeyQ'); run(14);
        if (!B.projs.some(p => p.kind === 'drone')) fail('Hive\\'s Drone Swarm fired no drones (' + (B.projs.length - n0) + ')'); }
      // 71. 52 skins: every one is different 3D geometry (also on the new fighters); maps: set pieces, the black hole, own music
      if (!B.GL3D.failed && B.GL3D.ok) { B.SET.renderer = 'webgl';
        const H = (a, n) => { let h = 0; for (let i = 0; i < n; i++) h = (h * 31 + Math.round(a[i] * 4)) | 0; return h; };
        for (const id of ['velocity', 'totem', 'djinn']) { const ch = B.CHARS.find(c => c.id === id), sigs = new Set();
          for (let k = 0; k < SKIN_COUNT; k++) { const d = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill }; resetFighter(d, 640); applySkin(d, ch, k); poseDummy(d, 30);
            glResetDraw(studioEnv([1, 1, 1])); const n0 = B.GL3D.n; collectFighter3D(d, solveRig(d)); let hi = 0; for (let j = n0; j < B.GL3D.n; j++) hi = (hi * 17 + H(B.GL3D.items[j].m, 16)) | 0;
            sigs.add(hi + '/' + ['lit', 'glow', 'flat', 'alpha'].map(q => H(BAT[q].p, BAT[q].nv * 3)).join('/')); }
          const want = SKIN_COUNT - Object.keys(EXCL_SKINS).filter(k => !skinValid(ch, +k)).length; if (sigs.size !== want) fail(id + ': only ' + sigs.size + ' of ' + want + ' skins are distinct 3D models'); }
        setup('djinn', 'titan', B.STAGES.findIndex(s => s.id === 'dragonspine')); run(5); B.render(); if (!DRAGON_SG) fail("Dragon's Spine built no dragon");
        setup('djinn', 'titan', hzI); run(5); B.render(); if (!HORIZON_SG || !(STAGE3D.sky && STAGE3D.sky.bh)) fail('Event Horizon has no black hole / debris');
        const ge = B.GL3D.gl.getError(); if (ge) fail('GL error ' + ge + ' on the shop maps');
        B.SET.renderer = 'canvas'; B.render(); B.SET.renderer = 'webgl'; }
      // 72. taunts + emojis: the loadout maps G / H and keys 1-8; shop emotes play and end; packets carry slot 2 + emoji ids up to 20
      PROFILE.loadout = { taunts: ['guitar', 'robot'], emojis: ['rocket', 'fire', 'skull', 'sweat', 'heart', 'stareyes', 'crown', 'trophy'] };
      setupDummy('blaze', 'titan', 0); { const f = B.fighters[0]; run(20); B.pressed.add('KeyG'); B.step(); if (f.state !== 'emote' || f.emoteK !== 'guitar') fail('G did not play the mapped emote (' + f.emoteK + ')');
        run(EMOTE_DUR.guitar + 2); if (f.state !== 'free') fail('the shop emote did not end'); run(30); B.pressed.add('KeyH'); B.step(); if (f.emoteK !== 'robot') fail('H did not play taunt slot 2 (' + f.emoteK + ')');
        run(EMOTE_DUR.robot + 2); EMOJI_FX.length = 0; f.emojiCD = 0; B.pressed.add('Digit1'); B.step(); if (!EMOJI_FX.some(e => EMOJIS[e.i].id === 'rocket')) fail('key 1 did not pop the mapped (bought) emoji'); }
      for (const k of SHOP_EMOTES) { const f = B.fighters[0]; f.state = 'emote'; f.emoteK = k; f.emoteDur = EMOTE_DUR[k]; for (let T = 0; T < EMOTE_DUR[k]; T += 17) { f.stateT = T; B.computePose(f); } B.render(); }
      { const pk = unpackInput(packInput(Object.assign(emptyInput(), { emote2P: true, emoji: 20 }))); if (!pk.emote2P || pk.emoji !== 20) fail('slot 2 / emoji ids do not survive the online packet'); }
      // 73. the sub-menus, Settings → Theme / Profile
      B.go('scr-online'); for (const p of ['host', 'join', 'lobby', 'lan']) { document.querySelector('#scr-online [data-hubpane="' + p + '"]').click(); if (!document.querySelector('#scr-online .hub-pane.on[data-pane="' + p + '"]')) fail('the Multiplayer sub-menu cannot show ' + p); }
      B.go('scr-challenge'); for (const p of ['arcade', 'btt', 'btp', 'titles']) { document.querySelector('#scr-challenge [data-hubpane="' + p + '"]').click(); if (!document.querySelector('#scr-challenge .hub-pane.on[data-pane="' + p + '"]')) fail('the Challenges sub-menu cannot show ' + p); }
      if (document.querySelectorAll('#chal-btt-rows li').length !== 5 || document.querySelectorAll('#chal-title-grid .tcard').length !== CHAL_TITLES.length || CHAL_TITLES.length < 17) fail('the Challenges sub-menu has no stage list / titles');
      B.go('scr-settings'); document.querySelector('[data-settab="theme"]').click();
      const cp = document.querySelector('[data-themecol="1"]'); cp.value = '#12ab34'; cp.dispatchEvent(new Event('input', { bubbles: true }));
      if (document.getElementById('wrap').style.getPropertyValue('--acc2').trim().toLowerCase() !== '#12ab34') fail('custom theme colours do not apply');
      document.querySelector('[data-act="theme-reset"]').click(); if (B.SET.themeCustom) fail('the theme did not reset');
      document.querySelector('[data-settab="profile"]').click(); PROFILE.earned = ['sharpshooter'];
      buildSettings(); const tc = document.querySelector('#set-rows [data-act="title-equip"][data-title="Sharpshooter"]'); tc.click(); if (PASS.equip.title !== 'Sharpshooter') fail('a title could not be equipped from Settings → Profile');
      document.querySelector('#set-rows [data-act="taunt-slot"][data-slot="1"]').click(); document.querySelector('#set-rows [data-act="taunt-pick"][data-k="wave"]') && fail('a locked emote could be mapped');
      document.querySelector('#set-rows [data-act="taunt-pick"][data-k="flex"]').click(); if (tauntSlots()[1] !== 'flex') fail('taunt slot 2 could not be remapped');
      if (document.querySelectorAll('#set-rows .lslot').length !== 10) fail('the Profile tab does not show 2 taunt + 8 emoji slots');
      // ======================= v14 =======================
      // 74. the Skin shop fix: 45 skin cards scroll INSIDE the grid (the tabs + coin counter stay on screen), the collection
      //     filters work without errors, Buy → Confirm charges the price, "Wear it" equips the skin and it survives a reload
      B.go('scr-shop'); document.querySelector('[data-act="shop-tab"][data-tab="skin"]').click();
      { const tabs = document.getElementById('shop-tabs').getBoundingClientRect(), grid = document.getElementById('shop-grid'), body = document.querySelector('#scr-shop .shop-body').getBoundingClientRect(), main = document.querySelector('#scr-shop .shop-main').getBoundingClientRect();
        if (document.querySelectorAll('#shop-grid .shop-card').length !== 45) fail('the Skins tab does not list 45 skins');
        if (tabs.top < 0 || main.height > body.height + 2 || !(grid.scrollHeight > grid.clientHeight)) fail('the Skins tab overflows the screen instead of scrolling (tabs at ' + Math.round(tabs.top) + ')'); }
      { const n0 = errs.length; let threw = null; const onErr = e => { threw = e.message; }; window.addEventListener('error', onErr);
        document.querySelector('[data-act="shop-set"][data-coll="Cyber Grid"]').click(); window.removeEventListener('error', onErr);
        if (threw) fail('a skin collection filter threw: ' + threw); if (document.querySelectorAll('#shop-grid .shop-card').length !== 5) fail('the collection filter does not filter'); void n0; }
      { WALLET.coins = 5000; WALLET.owned = []; walletSave(); coinUI(); const key = document.querySelectorAll('#shop-grid .shop-card')[1].dataset.key, it = shopItem(key), price = priceOf(it);
        document.querySelector('.shop-card[data-key="' + key + '"]').click(); const bb = document.getElementById('shop-buy'); bb.click(); bb.click();
        if (!shopOwns(key) || WALLET.coins !== 5000 - price) fail('buying a skin through the shop UI failed (' + WALLET.coins + ')');
        if (document.getElementById('shop-buy').dataset.mode !== 'use') fail('an owned skin does not offer "Wear it"');
        SHOPV.tryChar = B.CHARS.findIndex(c => c.id === 'velocity'); document.getElementById('shop-buy').click();
        if (B.SEL.skins.velocity !== it.idx || skinIdx(B.CHARS[SHOPV.tryChar]) !== it.idx) fail('"Wear it" did not equip the skin');
        const stored = JSON.parse(localStorage.getItem('neonbrawl.skins') || '{}'); B.SEL.skins.velocity = 0; loadSkins(); if (B.SEL.skins.velocity !== it.idx || stored.velocity !== it.idx) fail('the equipped skin was not saved');
        SHOPV.tryChar = null; SHOPV.set = 'all'; }
      // 75. MOCHI (the Japanese Pug: 80 % size — smaller hurtbox + attack boxes) and PANDAMONIUM (black limbs, a rolling special)
      { const pug = B.CHARS.find(c => c.id === 'pug'), panda = B.CHARS.find(c => c.id === 'panda');
        if (!pug || !panda || !pug.shop || !panda.shop || pug.role.indexOf('Japanese Pug') < 0) fail('the v14 shop fighters are missing');
        setupDummy('pug', 'velocity', 0); const bp = bodyRect(B.fighters[0]), bv = bodyRect(B.fighters[1]);
        if (!(B.fighters[0].scale === 0.8 && bp.w < bv.w && bp.h < bv.h)) fail('MOCHI is not smaller than a normal fighter (' + bp.w + 'x' + bp.h + ')');
        const mp = buildMove(B.fighters[0], 'jab'), mv = buildMove(B.fighters[1], 'jab'); if (!(hitboxRect(B.fighters[0], mp).h < hitboxRect(B.fighters[1], mv).h)) fail("MOCHI's attack boxes are not scaled down");
        setupDummy('panda', 'titan', 0); const f = B.fighters[0]; f.x = 400; B.fighters[1].x = 1100; B.mouse.cx = 900; B.mouse.cy = 330; run(10); B.pressed.add('KeyQ'); let rolled = false, x0 = f.x;
        for (let i = 0; i < 24; i++) { B.step(); if (B.computePose(f)[1] === 'roll:panda') rolled = true; }
        if (!rolled || !(f.x > x0 + 80)) fail("PANDAMONIUM's Barrel Roll does not roll forward (" + Math.round(f.x - x0) + ')');
        if (!panda.limbAlt || !B.ACC3D.panda || !B.ACC3D.pug.some(r => r[0] === 'pugFace')) fail('the v14 fighters lack their 3D accents'); }
      // 76. the Griddy: a shop emote with its own procedural animation (the feet + hands really move) and set dressing
      { if (!SHOP_EMOTES.includes('griddy') || !shopItem('emote:griddy') || !EMOTE_DUR.griddy) fail('the Griddy is not in the shop');
        const f = B.fighters[0]; f.state = 'emote'; f.emoteK = 'griddy'; f.emoteDur = EMOTE_DUR.griddy; const P = []; for (const T of [0, 13, 26, 40]) { f.stateT = T; P.push(JSON.stringify(emotePose(f, 20))); }
        if (new Set(P).size < 4) fail('the Griddy does not animate'); if (B.GL3D.ok) { glResetDraw(studioEnv([1, 1, 1])); const n0 = BAT.glow.nv + BAT.flat.nv; emoteFX3D(f); if (!(BAT.glow.nv + BAT.flat.nv > n0)) fail('the Griddy has no 3D set dressing'); }
        f.state = 'free'; }
      // 77. the 3 new maps: their set pieces, the pinball bumpers, the low bridge, MULTIBALL and the train's slipstream
      { for (const id of ['garden', 'train', 'pinball']) { const i = B.STAGES.findIndex(s => s.id === id); if (i < 0 || !B.STAGES[i].shop || !MAP_PRICE[id]) { fail('map ' + id + ' is missing or not in the shop'); continue; }
          setupDummy('velocity', 'titan', i); run(3); if (B.GL3D.ok) { B.SET.renderer = 'webgl'; B.render(); } }
        if (B.GL3D.ok && !(GARDEN_SG && TRAIN_SG && PINBALL_SG)) fail('the v14 maps built no set pieces');
        const pi = B.STAGES.findIndex(s => s.id === 'pinball'); setupDummy('velocity', 'titan', pi); const f = B.fighters[0], bm = ST.bumpers[1], sc0 = BUMP.score;
        f.x = bm.x + bm.r + 4; f.y = bm.y + 32 + 2; f.vx = -2; f.vy = 0; f.onGround = false; run(2);
        if (f.state !== 'hitstun' || !(f.vx > 4) || BUMP.score <= sc0) fail('a pinball bumper did not fire the fighter back toward the middle (' + f.state + ', vx ' + f.vx.toFixed(1) + ')');
        const ti = B.STAGES.findIndex(s => s.id === 'train'); setupDummy('velocity', 'titan', ti); B.SEL.hazards = true;
        const hi = B.fighters[0], lo = B.fighters[1], top = PLATS.find(p => p.y < 400); hi.x = top.x + top.w / 2; hi.y = top.y; hi.onGround = true; hi.ground = 'plat'; lo.x = hi.x + 40; lo.y = STAGE.y; lo.onGround = true;
        spawnHazard('bridge'); const h = HZ.list[HZ.list.length - 1]; h.phase = 'active'; h.t = 0; const p0 = hi.percent, q0 = lo.percent;
        for (let k = 0; k < HAZARDS.bridge.dur; k++) { hi.x = top.x + top.w / 2; hi.y = top.y; lo.x = top.x + top.w / 2 + 40; lo.y = STAGE.y; run(1); }
        if (!(hi.percent > p0) || lo.percent !== q0) fail('the low bridge should hit fighters up high and miss those on the main roof (' + (hi.percent - p0) + ' / ' + (lo.percent - q0) + ')');
        setupDummy('velocity', 'titan', ti); const a = B.fighters[0]; a.x = 640; a.y = 300; a.vx = 0; a.vy = 0; a.onGround = false; run(10); if (!(a.vx < -0.1)) fail("the train's slipstream does not push airborne fighters");
        setupDummy('velocity', 'titan', pi); B.SEL.hazards = true; spawnHazard('multiball'); const mb = HZ.list[HZ.list.length - 1]; mb.phase = 'active'; mb.t = 0; mb.dir = 1; const v = B.fighters[1]; v.x = STAGE.x + 120; const vp = v.percent;
        for (let k = 0; k < 30; k++) { v.x = STAGE.x + 120; run(1); } if (!(v.percent > vp)) fail('MULTIBALL did not hit a fighter in its lane'); B.SEL.hazards = false; HZ.list.length = 0; }
      // 78. Volley Brawl: nobody can hurt anybody, attacks hit the ball (a forward jab lobs it over the net), points + a full CPU game + results + rewards
      { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); B.SEL.cpu = B.CHARS.findIndex(c => c.id === 'titan'); B.SEL.diff = 2; B.SEL.challenge = 'volley'; volleyStart(); B.G.mode = 'play';
        const V = G.volley, f = B.fighters[0], o = B.fighters[1]; o.cpu = false; o.x = 1000; run(2);
        if (!V || ST.id !== 'volleycourt' || CHAL.mode !== 'volley') fail('Volley Brawl did not start on its court');
        if (deliver(f, o, { dmg: 20, base: 10, scale: 0.2, ang: 45 }, 1, o.x, o.y - 30, false) !== 'volley' || o.percent > 0) fail('fighters can hurt each other in Volley Brawl');
        f.x = 300; f.facing = 1; V.ball.hidden = false; V.ball.x = 300 + 40; V.ball.y = f.y - 40; V.ball.vx = 0; V.ball.vy = 0; V.pauseT = 0; V.started = true;
        volleyStrike(f, buildMove(f, 'jab')); let crossed = false; for (let k = 0; k < 140 && !crossed; k++) { V.ball.vy = Math.min(V.ball.vy, 30); run(1); if (V.ball.x > 660) crossed = true; }
        if (!crossed) fail('a forward jab did not send the ball over the net');
        const s0 = V.score[0]; V.ball.hidden = false; V.ball.x = 900; V.ball.y = STAGE.y - 40; V.ball.vx = 0; V.ball.vy = 6; o.x = 1100; run(4); if (V.score[0] !== s0 + 1) fail('a ball landing on the right side did not score for the left player');
        f.cpu = true; o.cpu = true; let n = 0; while (B.G.mode !== 'over' && n < 60 * 60 * 5) { B.step(); n++; } f.cpu = false;
        if (B.G.mode !== 'over' || Math.max(...V.score) !== 7 || G.screen !== 'scr-ladder') fail('a CPU-vs-CPU Volley Brawl game did not finish properly (' + V.score.join('-') + ' after ' + Math.round(n / 60) + ' s)');
        const r = coinChallengeReward('volley', Object.assign({}, V, { won: true })); if (!(r && r.gained >= 100)) fail('Volley Brawl paid too few coins');
        chalExit(); leaveMatch(); }
      // 79. the monthly party modes: the rotation, their rules (Sumo: 1 stock + the ring + harder launches · Mega: 150 % · Feather: low gravity + jumps), the hub
      { if (featuredParty(new Date(2026, 9, 5)) === featuredParty(new Date(2026, 10, 5))) fail('the monthly party mode does not rotate');
        B.SEL.p1 = 0; B.SEL.cpu = 1; partyStart('sumo'); if (!G.party || G.party.id !== 'sumo' || ST.id !== 'sumoring' || B.fighters[0].stocks !== 1) fail('Sumo Showdown rules not applied');
        const kbS = knockbackOf({ base: 8, scale: 0.1 }, B.fighters[1]) * G.party.kb; partyStart('mega'); if (!(Math.abs(B.fighters[0].scale - 1.5) < 0.01)) fail('Mega Mayhem did not supersize the fighters'); void kbS;
        partyStart('feather'); const f = B.fighters[0]; if (f.jumps !== f.ch.airJumps + 2) fail('Feather Fall did not add air jumps'); f.x = 640; f.y = 200; f.vy = 0; f.onGround = false; run(10); if (!(f.vy < 10 * PHYS.grav * 0.8)) fail('Feather Fall gravity is not lower');
        B.SEL.challenge = null; leaveMatch(); B.go('scr-challenge'); document.querySelector('#scr-challenge [data-hubpane="mini"]').click();
        if (document.querySelectorAll('#mini-grid .mini-card').length !== 7 || document.querySelectorAll('#mini-grid .mini-card.off button[disabled]').length !== 2) fail('the Monthly Minigames pane is wrong'); }   // (v19: + Brawler Bowling + The Floor is Lava)
      // 80. engine + game feel: high-poly tubes, adaptive resolution steps down on slow frames, heavier hits freeze longer, combo sparks, jelly squash
      { if (B.GL3D.ok && !GL3D.mobile && TUBE.ready && TUBE.sides < 24) fail('limb tubes are still low-poly (' + TUBE.sides + ' sides)');
        if (B.GL3D.ok) { const d0 = GL3D.dyn; B.SET.renderer = 'webgl'; RENDER3D.show(true); DYNRES.cool = 0; DYNRES.slow = 0; for (let k = 0; k < 140; k++) glAdaptRes(40); if (!(GL3D.dyn < 1)) fail('adaptive resolution did not step down on slow frames');
          GL3D.dyn = d0; GL3D.resize(); DYNRES.ema = 16.7; DYNRES.slow = DYNRES.fast = 0; }
        setupDummy('velocity', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; v.x = f.x + 40;
        deliver(f, v, { dmg: 3, base: 3, scale: 0.03, ang: 40 }, 1, v.x, v.y - 30, false); const light = B.G.hitstop; B.G.hitstop = 0; v.percent = 120;
        const nfx = fx.length; deliver(f, v, { dmg: 18, base: 10, scale: 0.15, ang: 40, heavy: true }, 1, v.x, v.y - 30, false); const heavy = B.G.hitstop;
        if (!(heavy > light + 3)) fail('heavy impacts do not hold the hit-pause longer (' + light + ' vs ' + heavy + ')');
        if (!fx.some((p, i) => i >= nfx && p.type === 'flare')) fail('no glowing hit-spark flare on impact');
        B.G.hitstop = 0; setupDummy('velocity', 'titan', 0); const g = B.fighters[0]; run(5); g.sx = 1.6; g.sy = 0.5; g.svx = g.svy = 0; let under = false; for (let k = 0; k < 14; k++) { run(1); if (g.sx < 0.99) under = true; } if (!under) fail('squash & stretch does not wobble past rest (jelly spring)'); }
      // 81. v15 DINO NUGGI F1: an exclusive skin (dino only) that drives a modelled F1 car — a long, low hurtbox, drift physics, tyre smoke
      { const dino = B.CHARS.find(c => c.id === 'dino'), velo = B.CHARS.find(c => c.id === 'velocity');
        if (typeof F1_SKIN !== 'number' || skinOf(dino, F1_SKIN).name !== 'Dino Nuggi F1') fail('the Dino Nuggi F1 skin is missing');
        if (skinOf(velo, F1_SKIN).i !== 0 || skinValid(velo, F1_SKIN)) fail('the F1 skin is not exclusive to Dino Nuggi');
        setupDummy('dino', 'titan', 0); const f = B.fighters[0]; applySkin(f, dino, F1_SKIN); run(3);
        if (!f.car) fail('the F1 skin does not put Dino in the car'); const r = bodyRect(f); if (!(r.w > BODY_W * 1.8 && r.h < BODY_H)) fail('the F1 car hurtbox is not long and low (' + r.w + 'x' + r.h + ')');
        f.onGround = true; f.state = 'free'; f.facing = 1; f.vx = 6; B.keys.add('KeyA'); run(2); B.keys.clear(); if (!(f.driftT > 0)) fail('reversing the F1 car at speed does not drift');
        if (B.GL3D.ok) { const d0 = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch: dino, name: '', color: dino.color, fill: dino.fill }; resetFighter(d0, 0); applySkin(d0, dino, 0); poseDummy(d0, 30);
          glResetDraw(studioEnv([1, 1, 1])); let n0 = B.GL3D.n; collectFighter3D(d0, solveRig(d0)); const plain = B.GL3D.n - n0;
          applySkin(d0, dino, F1_SKIN); poseDummy(d0, 30); n0 = B.GL3D.n; collectFighter3D(d0, solveRig(d0)); const car = B.GL3D.n - n0;
          if (!(car > plain + 50)) fail('the F1 car is not a detailed 3D model (' + plain + ' -> ' + car + ' parts)'); glResetDraw(studioEnv([1, 1, 1])); } }
      // 82. v15 animation layer: weight, anticipation, squash & stretch on top of every fighter's own style (pose names unchanged)
      { setupDummy('dynamo', 'titan', 0); const f = B.fighters[0]; Object.assign(f, { state: 'free', onGround: true, vx: 5, runPhase: 1.3, move: null, landT: 0, turnT: 0, dashT: 0, crawl: false });
        const on = B.computePose(f); B.SET.anim15 = false; const off = B.computePose(f); B.SET.anim15 = true;
        if (on[1] !== off[1] || on[1].indexOf('run:') !== 0) fail('the v15 animation layer renamed the run pose (' + on[1] + ')');
        if (JSON.stringify([on[0].ff, on[0].sy, on[0].oy]) === JSON.stringify([off[0].ff, off[0].sy, off[0].oy])) fail('the v15 locomotion layer does not change the run');
        f.state = 'attack'; f.move = buildMove(f, 'fsmash'); f.stateT = Math.max(1, f.move.s - 1); const w = B.computePose(f)[0]; B.SET.anim15 = false; const w0 = B.computePose(f)[0]; B.SET.anim15 = true;
        if (!(w.sy < w0.sy - 0.01 && w.lean < w0.lean)) fail('attacks have no coiled, squashed anticipation (' + w0.sy.toFixed(3) + ' -> ' + w.sy.toFixed(3) + ')');
        f.state = 'free'; f.move = null; }
      // 83. v15 stage unification: every legacy arena has a hero set piece + the premium platform kit, drawn in 3D
      { const miss = [...STAGE15_LEGACY].filter(id => !HERO15[id]); if (miss.length) fail('legacy stages without a v15 hero set piece: ' + miss.join(','));
        if (STAGE15_LEGACY.size < 35) fail('only ' + STAGE15_LEGACY.size + ' legacy stages are rebuilt');
        if (B.GL3D.ok) { const saved = B.SET.renderer; B.SET.renderer = 'webgl'; for (const id of ['speedway', 'clockwork', 'subway']) { setup('velocity', 'titan', B.STAGES.findIndex(s => s.id === id)); run(2);
            glResetDraw(STAGE3D.env || studioEnv([1, 1, 1])); const n0 = B.GL3D.n; collectStage15(); if (!(B.GL3D.n - n0 > 25)) fail(id + ': the v15 set piece drew only ' + (B.GL3D.n - n0) + ' parts'); }
          glResetDraw(studioEnv([1, 1, 1])); B.SET.renderer = saved; } }
      // 84. v15 Battle Pass: a scrollable glass track whose skins, emojis and nameplates are live 3D tiles
      { B.go('scr-pass'); showPass(); const tiles = document.querySelectorAll('#bp-track .bp-card.has3d .bp-3d').length, want = PASS_REWARDS.filter(r => TILE3D.has(r[1])).length;
        if (tiles !== want || want < 12) fail('the Battle Pass track has ' + tiles + ' 3D tiles (want ' + want + ')');
        const tr = document.getElementById('bp-track'); if (getComputedStyle(tr).overflowY !== 'auto' || !(tr.scrollHeight > tr.clientHeight)) fail('the Battle Pass track does not scroll');
        if (!/blur/.test(getComputedStyle(document.querySelector('.bp-glass')).backdropFilter || '')) fail('the Battle Pass tiles are not glass (no backdrop blur)'); B.go('scr-main'); }
      // 85. v15 intro: the 3D cold open + the credit
      { if (typeof intro15 !== 'function') fail('no v15 intro cinematic'); const cr = document.querySelector('#scr-intro .intro-credit');
        if (!cr || !/A Game by Lead Designer/.test(cr.textContent) || cr.querySelector('.credit-name').textContent.replace(/\\s/g, '') !== 'MANSOURSAKKA') fail('the intro credit is wrong'); if (document.querySelector('#scr-intro video')) fail('the intro uses a video'); }
      // 86. v15 settings: ink weight + the animation layer
      { const g = SETTING_GROUPS.find(q => q.id === 'graphics').items; if (!g.some(i => i.key === 'ink') || !g.some(i => i.key === 'anim15')) fail('Settings is missing the v15 ink / animation options');
        const k0 = B.SET.ink; B.SET.ink = 'heavy'; const hk = INK15.k; B.SET.ink = 'fine'; const fk = INK15.k; B.SET.ink = k0; if (!(hk > 1.3 && fk < 0.8)) fail('the ink setting does not change the outline weight'); }
      // 87. v16 UI layer: the HUD's band is measured and the camera frames the fight above it; a panel with a fighter behind it fades;
      //     dense menu screens draw a studio backdrop (no arena geometry between their panels)
      { setup('velocity', 'titan', 0); run(30); B.SET.renderer = 'webgl'; B.render(); updateHUD(); HUD.rT = -99; updateHUD();
        if (!(HUD_SAFE.b > 0.08 || HUD_SAFE.t > 0.08)) fail('the HUD safe band was not measured (' + HUD_SAFE.b + ')');
        const P0 = HUD.panels[0], r = P0.root.getBoundingClientRect(), g = document.getElementById('game').getBoundingClientRect(), c = B.G.cam;
        const f = B.fighters[1]; f.x = c.x + ((r.left + r.width / 2 - g.left) / g.width * VIEW.LW - VIEW.LW / 2) / c.z; f.y = c.y + ((r.top + r.height / 2 - g.top) / g.height * VIEW.LH - VIEW.LH / 2) / c.z + 32;
        updateHUD(); if (!P0.root.classList.contains('behind')) fail('a HUD panel does not fade when a fighter is behind it');
        leaveMatch(); B.go('scr-select'); const n0 = B.GL3D.n; renderMenu3D(); if (!MENU_STUDIO.has('scr-select')) fail('the select screen still renders the arena behind its panels'); void n0; B.go('scr-main'); }
      // 88. v16 roster: Dino's F1 car + driver scaled to fit the stage and the car hurtbox; MOCHI's paws clear of the face
      { if (!(F1C.k < 0.9 && CAR_W >= 80 && CAR_W <= 90)) fail('the F1 car is not scaled to its hurtbox (' + F1C.k + ', ' + CAR_W + ')');
        const S = B.STAGES.map(s => s.plats).flat().filter(p => p && p.w); if (S.some(p => p.w < CAR_W * 1.3)) {} }
      // 89. v16 Battle Pass rewards: 40 KO explosions + 40 trails + 23 nameplates + 16 emojis + 115 titles; KO blasts + trails draw in 3D
      { const n = k => PASS_REWARDS.filter(r => r[1] === k).length;
        if (n('ko') !== 40 || n('trail') !== 40 || n('plate') < 23 || n('emoji') < 16 || n('title') < 100 || n('skin') !== 4 || PASS_REWARDS[249][1] !== 'skin') fail('the 250-tier track is missing reward types');
        if (B.GL3D.ok) { glResetDraw(studioEnv([1, 1, 1])); const b0 = BAT.glow.ni; for (const id of ['nova-neon', 'pillar-royal', 'blackhole-frost', 'phoenix-inferno']) koDraw3D(id, 640, 300, 0, 20, 1);
          trailDraw3D('comet-neon', trailDemoPts(100, 640, -300, 50), 100, 1); if (!(BAT.glow.ni > b0)) fail('the KO explosions / trails drew nothing'); glResetDraw(studioEnv([1, 1, 1])); }
        PASS.xp = passTotalXP(); PASS.equip.ko = 'nova-neon'; setupDummy('velocity', 'titan', 0); const a = B.fighters[0], o = B.fighters[1]; o.lastHitBy = a; o.x = 2000; KO16.length = 0; run(4);
        if (!KO16.length) fail('your equipped KO explosion did not fire on a KO'); PASS.equip.ko = 'classic'; PASS.xp = 0; }
      // 90. v16 the cinematic finisher: a lethal hit on the last stock drops the game to 10 % speed + punches the camera in
      { setup('velocity', 'titan', 0); run(5); const a = B.fighters[0], v = B.fighters[1]; v.stocks = 1; v.percent = 220; v.x = a.x + 30; v.y = a.y; FIN16.on = false;
        deliver(a, v, { dmg: 20, base: 14, scale: 0.18, ang: 40, heavy: true }, 1, v.x, v.y - 30, false);
        if (!FIN16.on) fail('a lethal final blow did not trigger the cinematic finisher');
        // (v18) the hit-pause plays at real speed first, THEN the launch runs at 10 % — the sim never sits frozen in slow-mo
        if (finisherTick(16) !== 1 || FIN16.ph !== 'impact') fail('the finisher slowed the hit-pause down (it would freeze the game)');
        const vx0 = v.x; run(B.G.hitstop + 1); const sp = finisherTick(16); if (FIN16.ph !== 'slow' || !(sp <= 0.11)) fail('the finisher does not drop to 10 % speed once the hit-pause ends (' + sp + ')');
        if (v.x === vx0) fail('the victim did not fly during the finisher');
        for (let i = 0; i < 25; i++) finisherTick(16); const v0 = { x: B.G.cam.x, y: B.G.cam.y, z: 1, roll: 0, k: 0 }, vz = finisherCam(v0); if (!(vz.z > 1.3)) fail('the finisher camera does not zoom');
        for (let i = 0; i < 120; i++) finisherTick(16); if (!(finisherState()[0] > 0.99)) fail('the finisher never ramps back to full speed');
        Object.assign(FIN16, { on: true, ph: 'slow', c: 0.3, cs: 0.2, ck: 0 }); gameEvent('ko', { f: v, x: v.x, y: v.y }); for (let i = 0; i < 20; i++) finisherTick(16);
        if (!(finisherState()[0] > 0.99)) fail('a KO during the slow-mo does not snap back to full speed'); FIN16.on = false; leaveMatch(); }
      // 91. v16 Survive the Horde: waves spawn, your hitboxes KO the enemies, they hurt you, a wave clears
      { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); hordeStart(); B.G.mode = 'play'; const H = CHAL.horde, f = B.fighters[0]; f.cpu = false; run(120);
        if (H.wave < 1 || !H.mobs.length) fail('Survive the Horde spawned no wave (' + H.wave + ', ' + H.mobs.length + ')');
        const m = H.mobs[0]; m.x = f.x + 20; m.y = f.y; m.iframe = 0; m.spawnT = 0; HITBOX_LOG.push({ x: m.x - 30, y: m.y - 60, w: 60, h: 60, kind: 'hit', owner: 0 }); f.move = buildMove(f, 'fsmash');
        const k0 = H.kills; m.hp = 1; hordeStep(); if (!(H.kills > k0)) fail('your hitbox did not KO a horde enemy');
        Object.assign(f, { x: STAGE.x + STAGE.w / 2, y: STAGE.y, onGround: true, invuln: 0, state: 'free', vx: 0, vy: 0 }); const p0 = f.percent;
        H.mobs = [{ id: 999, kind: 'grunt', x: f.x + 12, y: STAGE.y, vx: 0, vy: 0, hp: 50, max: 50, face: -1, ground: STAGE, hurt: 0, iframe: 0, atk: 0, cd: 0, born: 0, spd: 1 }];
        for (let i = 0; i < 30; i++) hordeStep(); if (!(f.percent > p0)) fail('the horde enemies never hurt you');
        H.mobs.length = 0; H.toSpawn = 0; H.breakT = 0; hordeStep(); if (H.cleared !== H.wave) fail('clearing the horde did not clear the wave');
        if (!/HORDE|WAVE/.test(chalHudText())) fail('no Horde HUD text'); chalExit(); leaveMatch(); }
      // 92. v16 Coin Scramble: coins rain, touching one scores, a hit knocks coins loose, the bell picks the winner
      { coinStart(); B.G.mode = 'play'; const C = G.coins16, [a, b] = B.fighters; a.cpu = false; run(90); if (!C.coins.length && !C.score[0] && !C.score[1]) fail('Coin Scramble rained no coins');
        coinDrop(a.x, a.y - 10, 5); coinsStep(); if (C.score[0] < 5) fail('touching a coin did not score (' + C.score[0] + ')');
        b.x = a.x + 30; deliver(b, a, { dmg: 12, base: 10, scale: 0.12, ang: 40, heavy: true }, 1, a.x, a.y - 30, false); if (!(C.score[0] < 5)) fail('a solid hit did not knock coins loose');
        C.t = COINS_LIMIT - 1; C.score = [9, 3]; coinsStep(); if (B.G.mode !== 'ending' || B.G.winner !== a) fail('the Coin Scramble bell did not crown the coin leader');
        if (!/COIN SCRAMBLE/.test(document.querySelector('.vb-board') ? (updateHUD(), document.querySelector('.vb-board').textContent) : '')) fail('no Coin Scramble scoreboard'); chalExit(); leaveMatch(); }
      // 93. v16 menus: a dedicated Minigames tile + the Horde pane
      { B.go('scr-main'); const t = document.querySelector('[data-act="minigames-open"]'); if (!t) fail('no Minigames tile on the main menu'); else { t.click(); if (!document.querySelector('#scr-challenge .hub-pane.on[data-pane="mini"]')) fail('the Minigames tile does not open the minigames tab'); }
        document.querySelector('#scr-challenge [data-hubpane="horde"]').click(); if (!document.querySelector('#scr-challenge .hub-pane.on[data-pane="horde"]')) fail('no Survive the Horde pane'); B.go('scr-main'); }
      // 94. v17 hit-pause: a heavy connect freezes both fighters for exactly 0.1 s (6 fixed 60 Hz steps) and stops their animation
      //     clock; a light connect pauses 2-4 steps
      { const hs0 = B.SET.hitstop; B.SET.hitstop = true; setupDummy('velocity', 'titan', 0); run(5); const a = B.fighters[0], v = B.fighters[1];
        v.x = a.x + 40; v.y = a.y; B.G.hitstop = 0; deliver(a, v, { dmg: 3, base: 3, scale: 0.02, ang: 40 }, 1, v.x, v.y - 30, false);
        if (!(B.G.hitstop >= 2 && B.G.hitstop <= 4)) fail('a light connect does not pause 2-4 steps (' + B.G.hitstop + ')'); run(30);
        Object.assign(v, { x: a.x + 40, y: a.y, vx: 0, vy: 0, state: 'free', hitstun: 0, onGround: true }); B.G.hitstop = 0;
        deliver(a, v, { dmg: 14, base: 9, scale: 0.12, ang: 40, heavy: true }, 1, v.x, v.y - 30, false);
        if (HEAVY_PAUSE !== 6 || B.G.hitstop !== 6) fail('a heavy connect does not hit-pause for exactly 6 steps = 0.1 s (' + B.G.hitstop + ')');
        const pos = [a.x, a.y, v.x, v.y], clk = B.G.time - B.G.hsLag; run(6);
        if (a.x !== pos[0] || a.y !== pos[1] || v.x !== pos[2] || v.y !== pos[3]) fail('the fighters moved during the hit-pause');
        if (B.G.time - B.G.hsLag !== clk) fail('the fighter animation clock kept running through the hit-pause');
        run(1); if (B.G.hitstop !== 0 || (v.x === pos[2] && v.y === pos[3])) fail('the launch did not resume right after the hit-pause');
        B.SET.hitstop = hs0; leaveMatch(); }
      // 95. v17 trauma camera shake: a jab is a tiny rattle, a smash shakes violently, the shake decays in real time, Screen shake 0 kills it
      { setupDummy('velocity', 'titan', 0); run(5); const a = B.fighters[0], v = B.fighters[1], c = B.G.cam;
        const tr = m => { SHAKE.trauma = 0; Object.assign(v, { x: a.x + 40, y: a.y, vx: 0, vy: 0, percent: 0, state: 'free', hitstun: 0 }); deliver(a, v, m, 1, v.x, v.y - 30, false); return SHAKE.trauma; };
        const tj = tr({ dmg: 3, base: 3, scale: 0.02, ang: 40 }), tsm = tr({ dmg: 18, base: 14, scale: 0.2, ang: 40, heavy: true });
        if (!(tj > 0 && tj <= 0.26 && tsm >= 0.5)) fail('hit trauma does not scale with the hit (jab ' + tj.toFixed(2) + ', smash ' + tsm.toFixed(2) + ')');
        const pn = performance.now; let fake = pn.call(performance); performance.now = () => fake; const sk0 = B.SET.shake;
        try { B.G.shake = 0; B.G.ultCine = null; CAMFX.k = 0; FIN16.on = false;
          const amp = T => { let m = 0; for (let i = 0; i < 90; i++) { SHAKE.last = fake; fake += 16.7; SHAKE.trauma = T; const w = viewCam(); m = Math.max(m, Math.hypot(w.x - c.x, w.y - c.y)); } return m; };
          B.SET.shake = 1; const aj = amp(0.2), ab = amp(0.9); B.SET.shake = 0; const a0 = amp(0.9); B.SET.shake = 1;
          if (!(aj < 2 && ab > 12 && a0 < 0.01)) fail('the shake is not a tiny rattle for jabs + violent for smashes (' + aj.toFixed(1) + ' / ' + ab.toFixed(1) + ' / off ' + a0.toFixed(2) + ' px)');
          SHAKE.trauma = 1; SHAKE.last = fake; for (let k = 0; k < 5; k++) { fake += 100; viewCam(); } if (!(SHAKE.trauma > 0.2 && SHAKE.trauma < 0.5)) fail('the trauma does not decay over real time (' + SHAKE.trauma.toFixed(2) + ' after 0.5 s)');
        } finally { performance.now = pn; B.SET.shake = sk0; SHAKE.trauma = 0; SHAKE.last = 0; }
        leaveMatch(); }
      // 96. v17 snappy physics: the jump apex is unchanged (a sqrt-scaled launch under heavier rise gravity) but reached sooner, and
      //     the fall is quicker than the rise
      { setupDummy('velocity', 'titan', 0); run(40); const f = B.fighters[0], g = PHYS.grav * (f.ch.grav || 1), y0 = f.y;
        if (!f.onGround) fail('the jumper is not standing'); B.pressed.add('Space'); let top = y0, tUp = 0, tStart = -1, i = 0;
        for (; i < 120; i++) { B.step(); if (tStart < 0 && !f.onGround) tStart = i; if (f.y < top) { top = f.y; tUp = i; } if (tStart >= 0 && f.onGround) break; }
        const h = y0 - top, hRef = f.ch.jump * f.ch.jump / (2 * g), rise = tUp - tStart, fall = i - tUp;
        if (!(Math.abs(h - hRef) / hRef < 0.12)) fail('the v17 jump apex moved (' + h.toFixed(0) + ' vs ' + hRef.toFixed(0) + ' px)');
        if (!(rise < f.ch.jump / g)) fail('the jump is not snappier (apex after ' + rise + ' frames)');
        if (!(fall <= rise)) fail('the fall is not quicker than the rise (' + rise + ' up, ' + fall + ' down)'); leaveMatch(); }
      // 97. v17 juice: a real connect reports the exact impact point (inside the hurtbox), explodes 3D geometry there (+ a floor ring
      //     on heavies), and the striking limb leaves a kinetic trail
      { const r0 = B.SET.renderer, p0 = B.SET.part; B.SET.renderer = 'webgl'; B.SET.part = 1; setupDummy('velocity', 'titan', 0); run(5); B.render(); const f = B.fighters[0], v = B.fighters[1];
        if (RENDER3D.on) { B.TOUCH.using = false; B.G.cam = { x: 640, y: 330, z: 1 }; let ev = null, inside = false;
          const L = (type, d) => { if (type === 'hit' && d.vic === v && !ev) { ev = d; const r = bodyRect(v); inside = d.x >= r.x - 6 && d.x <= r.x + r.w + 6 && d.y >= r.y - 6 && d.y <= r.y + r.h + 6; } };
          GAME_EVENT_LISTENERS.push(L); f.x = 560; v.x = 610; JUICE.parts.length = 0; f._k17 = null;
          try { B.mouse.cx = 1000; B.mouse.cy = f.y - 34; B.step(); B.pressed.add('M0'); for (let k = 0; k < 24 && !ev; k++) { B.step(); B.render(); } }
          finally { GAME_EVENT_LISTENERS.splice(GAME_EVENT_LISTENERS.indexOf(L), 1); }
          if (!ev) fail('the juice test jab never connected'); else if (!inside) fail('the hit event is not at the impact point inside the hurtbox (' + ev.x.toFixed(0) + ',' + ev.y.toFixed(0) + ')');
          if (JUICE.parts.length < 8) fail('a connect did not burst into 3D particles (' + JUICE.parts.length + ')');
          if (!f._k17 || f._k17.fist.length < 2) fail('the striking limb left no kinetic trail');
          JUICE.parts.length = 0; spawnBurst3D(640, 400, 16, '#ff4060', { heavy: true }); if (!JUICE.parts.some(p => p.k === 'ring') || !JUICE.parts.some(p => p.k === 'shard')) fail('a heavy burst has no floor ring / shards'); }
        B.SET.renderer = r0; B.SET.part = p0; leaveMatch(); }
      // 98. v17 camera: the follow spring never jumps - when both fighters cross the stage the frame moves at most 1700 px/s per axis
      //     and settles
      { setupDummy('velocity', 'titan', 0); run(90); const c = B.G.cam, [a, b] = B.fighters; let x = c.x, y = c.y, mx = 0, moved = 0;
        a.x = STAGE.x + STAGE.w - 30; b.x = STAGE.x + STAGE.w - 70;
        for (let i = 0; i < 120; i++) { B.step(); mx = Math.max(mx, Math.abs(c.x - x), Math.abs(c.y - y)); moved += Math.abs(c.x - x); x = c.x; y = c.y; }
        if (!(mx <= 1700 / 60 + 0.01)) fail('the camera jumped ' + mx.toFixed(1) + ' px in one step'); if (!(moved > 5)) fail('the camera did not follow the fighters');
        if (!(Math.abs(CAMV.vx) < 5 && Math.abs(CAMV.vy) < 5)) fail('the camera did not settle (' + CAMV.vx.toFixed(1) + ' px/s)'); leaveMatch(); }
      // 99. v17 roster pass: the refined models (Titan, Pandamonium, Smith, Luna, MOCHI, Dino F1) build clean geometry through idle,
      //     attacks and hit-pause - every matrix finite (no stray vertices)
      { const r0 = B.SET.renderer; B.SET.renderer = 'webgl'; const sk = B.SEL.skins.dino;
        for (const id of ['titan', 'panda', 'smith', 'luna', 'pug', 'dino']) { B.SEL.skins.dino = id === 'dino' ? F1_SKIN : sk; setupDummy(id, 'velocity', 0); run(5);
          const f = B.fighters[0]; let bad = 0; B.mouse.cx = 900; B.mouse.cy = 560; B.render(); if (!RENDER3D.on) { leaveMatch(); continue; }
          for (let k = 0; k < 40; k++) { if (k === 4) B.pressed.add('M0'); if (k === 20) B.pressed.add('M2'); B.step(); B.render(); if (k % 4) continue;
            for (let i = 0; i < GL3D.n; i++) { const m = GL3D.items[i].m; for (let j = 0; j < 16; j++) if (!Number.isFinite(m[j])) { bad++; break; } } }
          if (bad) fail(id + ' built ' + bad + ' non-finite 3D parts'); if (!f._k17) fail(id + ' recorded no kinetic trail data'); leaveMatch(); }
        B.SEL.skins.dino = sk; B.SET.renderer = r0; }
      // 100. v18 lighting: the key / ambient / glow are calibrated down, lit surfaces + the sky + the composite roll highlights
      //      off with a soft shoulder instead of clipping, and daylight arenas no longer get a blown-out fog
      { if (!(LIGHT_CAL.key < 1 && LIGHT_CAL.amb < 1 && LIGHT_CAL.glow < 1 && LIGHT_CAL.knee < 0.8)) fail('the light calibration is missing');
        if (!SH.litF.includes('shoulder(col, uCal.y)') || !SH.skyF.includes('uSkyX') || !FX_SH.comp.includes('soft shoulder')) fail('the soft-shoulder tonemap is missing from a shader');
        const E = stageEnv(B.STAGES.find(s => s.id === 'sanctuary')); if (!(Math.max(...E.fog) <= 0.8 && Math.max(...E.light) < 1)) fail('a daylight arena is still over-lit (' + E.fog + ')'); }
      // 101. v18 Survive the Horde rewrite: grounded enemies stay ON the floor (the v16 goons sank through it), drones dive,
      //      a KO counts exactly once, an enemy that falls out untouched is refunded to the wave
      { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); hordeStart(); B.G.mode = 'play'; const H = CHAL.horde, f = B.fighters[0]; f.cpu = false; H.breakT = 0; H.wave = 1; H.toSpawn = 0;
        const mk = (kind, o) => Object.assign({ id: H.nextId++, kind, x: 300, y: STAGE.y, vx: 0, vy: 0, hp: 50, max: 50, face: 1, ground: STAGE, hurt: 0, iframe: 0, atk: 0, cd: 0, born: 0, spd: 1.9, spawnT: 0, recover: 0, touched: 0, dive: null, dropFrom: null, pounce: false }, o);
        HITBOX_LOG.length = 0; Object.assign(f, { x: 900, y: STAGE.y, onGround: true, state: 'free', invuln: 0 }); const g = mk('grunt'); H.mobs = [g, mk('grunt', { x: 1060 })];
        let sank = 0; for (let i = 0; i < 180; i++) { hordeStep(); if (g.ground === STAGE && Math.abs(g.y - STAGE.y) > 0.5) sank++; }
        if (sank) fail('a grounded horde enemy sank through the floor (' + sank + ' steps)'); if (!(g.x > 400)) fail('the grunt did not walk toward you (' + g.x.toFixed(0) + ')');
        const d = mk('flyer', { x: f.x, y: f.y - 150, ground: null, cd: 0 }); H.mobs = [d]; let dove = false; for (let i = 0; i < 90 && !dove; i++) { hordeStep(); dove = !!(d.dive && d.dive.ph === 'dive') || f.percent > 0; }
        if (!dove) fail('a horde drone never dived at you');
        HITBOX_LOG.length = 0; const k0 = H.kills, t0 = H.toSpawn, s0 = H.spawned, a = mk('grunt', { touched: 5, x: BZ.r + 50 }), b = mk('grunt', { x: BZ.r + 50 }); H.mobs = [a, b]; hordeStep();
        const ref = H.toSpawn - t0 + H.spawned - s0;                                   // (a refund may be re-spawned by the director straight away)
        if (H.kills !== k0 + 1 || ref !== 1 || H.mobs.includes(a) || H.mobs.includes(b)) fail('horde kill accounting is wrong (kills +' + (H.kills - k0) + ', refunds +' + ref + ')');
        chalExit(); leaveMatch(); }
      // 102. v18 key binds: a rebound key drives the action, the old key goes dead, a taken key swaps, it all persists
      { const map0 = Object.assign({}, KEYBINDS.map);
        bindAssign('jump', 'KeyW'); if (bindCode('KeyW') !== 'Space' || bindCode('Space') !== null) fail('rebinding Jump to W did not take');
        B.keys.clear(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); if (!B.keys.has('Space')) fail('pressing the rebound key did not press the action');
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); if (B.keys.has('Space')) fail('releasing the rebound key did not release the action');
        bindAssign('left', 'KeyD'); if (bindCode('KeyD') !== 'KeyA' || bindCode('KeyA') !== 'KeyD') fail('binding a taken key did not swap the two actions');
        if (!/KeyW/.test(localStorage.getItem('neonbrawl.keybinds') || '')) fail('the key binds were not saved');
        if (!/W/.test(keyHintLine())) fail('the match key hint does not show your binds'); bindAssign('special', 'Escape'); if (bindOf('special') !== 'KeyQ') fail('a reserved key could be bound');
        KEYBINDS.map = map0; bindsCompile(); bindsSave(); refreshKeyHints(); B.keys.clear(); B.pressed.clear(); }
      // 103. v18 touch layout: the editor drags a button to a new spot, it is hit-tested there and saved
      { const L0 = JSON.stringify(TLAYOUT); B.go('scr-settings'); tlEditOpen(); const el = document.querySelector('#touch .t-light'), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const pe = (t, x, y, tg) => (tg || el).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, pointerType: 'touch' }));
        pe('pointerdown', cx, cy); pe('pointermove', cx - 120, cy - 40); pe('pointerup', cx - 120, cy - 40);
        const o = TLAYOUT.btn.light; if (!o || !(o.r > 112)) fail('dragging a touch button did not move it (' + JSON.stringify(o) + ')');
        const r2 = el.getBoundingClientRect(); if (!(r2.left < r.left - 20)) fail('the moved touch button did not move on screen');
        tlEditClose(); if (!/"light"/.test(localStorage.getItem('neonbrawl.touchlayout') || '')) fail('the touch layout was not saved');
        const L = JSON.parse(L0); TLAYOUT.btn = L.btn; TLAYOUT.stick = L.stick; tlSave(); tlApply(); B.go('scr-main'); }
      // 104. v18 main menu: the live 3D map behind the glass menu is a showcase arena, captioned
      { B.go('scr-main'); const st = menuStage(); if (!MENU_SHOW.ids.includes(st.id)) fail('the main menu backdrop is not the live showcase (' + st.id + ')');
        if (!/Live/.test(document.getElementById('mm-map').textContent)) fail('the live map caption is missing'); }
      // 105. v19 models: Dino Nuggi's one-piece F1 helmet (a windowed shell, a see-through visor, the crest) and MOCHI's face-frame pug
      //      head: the face frame is centred between the eyes, the shell never covers its window, every triangle faces out, and both
      //      heads build finite geometry facing either way, through attacks and a hit flash
      { const r0 = B.SET.renderer; B.SET.renderer = 'webgl';
        const FR = faceFrame19(1), mid = (FR.eyes[0][0] + FR.eyes[1][0]) / 2, ea = Math.abs(FR.eyes[0][0]);
        if (Math.abs(mid) > 0.02) fail('the face frame is not centred between the eyes (' + mid.toFixed(3) + ')');
        if (!(ea + 0.2 < HELM19.wa)) fail('the helmet visor window does not frame the eyes');
        const g = GEO.helmShell19(HELM19.wa, HELM19.wc, HELM19.wh, HELM19.bf, HELM19.bb); let inWin = 0, badV = 0, inward = 0;
        for (let i = 0; i < g.pos.length; i += 3) { const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2], a = Math.atan2(x, z), e = Math.asin(Math.max(-1, Math.min(1, y)));
          if (Math.abs(a) < HELM19.wa * 0.8 && Math.abs(e - HELM19.wc) < HELM19.wh * 0.8) inWin++; if (!Number.isFinite(x + y + z)) badV++; }
        for (let t = 0; t < g.idx.length; t += 3) { const P = g.pos, a = g.idx[t] * 3, b = g.idx[t + 1] * 3, c = g.idx[t + 2] * 3;
          const n = V3.cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]); if (n[0] * (P[a] + P[b] + P[c]) + n[1] * (P[a + 1] + P[b + 1] + P[c + 1]) + n[2] * (P[a + 2] + P[b + 2] + P[c + 2]) < -1e-9) inward++; }
        if (inWin || badV || inward) fail('the helmet shell is wrong (window covered ' + inWin + ', bad vertices ' + badV + ', inward triangles ' + inward + ')');
        for (const id of ['dino', 'pug']) for (const face of [1, -1]) { setupDummy(id, 'velocity', 0); run(4); const f = B.fighters[0]; f.facing = face; B.render(); if (!RENDER3D.on) { leaveMatch(); continue; }
          let bad = 0, helm = 0, glass = 0, band = 0;
          for (let k = 0; k < 24; k++) { if (k === 4) B.pressed.add('M0'); if (k === 12) f.hitFlash = 4; f.facing = face; B.step(); B.render(); if (k % 6) continue;
            for (let i = 0; i < GL3D.n; i++) { const it = GL3D.items[i]; for (let j = 0; j < 16; j++) if (!Number.isFinite(it.m[j])) { bad++; break; }
              if (it.mesh === SG_MESH.get('h19:helm')) helm++; if (it.mesh === SG_MESH.get('h19:visor') && it.alpha < 1) glass++; if (it.mesh === SG_MESH.get('h19:band')) band++; } }
          if (bad) fail(id + ' (facing ' + face + ') built ' + bad + ' non-finite 3D parts');
          if (id === 'dino' && (!helm || !glass)) fail('Dino Nuggi is missing his F1 shell or see-through visor (' + helm + ', ' + glass + ')');
          if (id === 'pug' && !band) fail('MOCHI is missing the hachimaki that wraps the skull');
          leaveMatch(); }
        B.SET.renderer = r0; }
      // 106. v19 Favorite + Mastery: only the favorite earns XP, the levels add up, max Mastery unlocks the glowing PFP, the Mastery skin
      //      (for that fighter only) and the title at once — all saved; a battle with the favorite pays Mastery on the results card
      { const M0 = JSON.stringify({ fav: MASTERY.fav, xp: MASTERY.xp, done: MASTERY.done, pfp: MASTERY.pfp }), T0 = PASS.equip.title, S0 = B.SEL.skins.pug;
        const pug = B.CHARS.find(c => c.id === 'pug'), blaze = B.CHARS.find(c => c.id === 'blaze');
        MASTERY.fav = null; MASTERY.xp = {}; MASTERY.done = []; MASTERY.pfp = ''; PASS.equip.title = '';
        if (masteryAward('pug', [['x', 500]])) fail('a fighter that is not your favorite earned Mastery XP');
        masterySetFav('pug'); masteryAward('pug', [['x', 400]]);
        if (masteryXP('pug') !== 400 || masteryLevelOf(400).lvl !== 1 || masteryLevelOf(masteryNeed(1) + masteryNeed(2)).lvl !== 2) fail('Mastery XP / levels are wrong (' + masteryXP('pug') + ')');
        if (skinUnlocked(MASTERY_SKIN, pug) || masteryDone('pug')) fail('the Mastery rewards unlocked before max Mastery');
        const r = masteryAward('pug', [['x', MASTERY_TOTAL]]);
        if (!r || !r.mastered || !masteryDone('pug') || masteryLevelOf(masteryXP('pug')).lvl !== MASTERY_MAX) fail('maxing Mastery did not master the fighter');
        if (!skinUnlocked(MASTERY_SKIN, pug) || skinUnlocked(MASTERY_SKIN, blaze)) fail('the Mastery skin is not unlocked for exactly the mastered fighter');
        if (!ownedTitles().includes('Pug Master') || PASS.equip.title !== 'Pug Master') fail('the Mastery title "Pug Master" was not earned + worn');
        if (MASTERY.pfp !== 'pug') fail('the glowing profile picture was not equipped');
        if (!/"done":\\["pug"\\]/.test(localStorage.getItem('neonbrawl.mastery') || '')) fail('Mastery was not saved');
        B.SEL.skins.pug = MASTERY_SKIN; if (skinIdx(pug) !== MASTERY_SKIN || skinOf(pug, MASTERY_SKIN).fx !== 'mastery') fail('the mastered fighter cannot wear its Mastery skin');
        profileUI(); if (!document.getElementById('pf-avatar').classList.contains('pfp')) fail('the profile card does not wear the glowing PFP');
        // the Mastery skin itself builds clean geometry, glowing rings included
        { const r1 = B.SET.renderer; B.SET.renderer = 'webgl'; setupDummy('blaze', 'velocity', 0); run(3); const f = B.fighters[0]; applySkin(f, blaze, MASTERY_SKIN); B.render();
          if (RENDER3D.on) { let bad = 0, rings = 0; for (let k = 0; k < 12; k++) { B.step(); applySkin(f, blaze, MASTERY_SKIN); B.render(); }
            for (let i = 0; i < GL3D.n; i++) { const it = GL3D.items[i]; for (let j = 0; j < 16; j++) if (!Number.isFinite(it.m[j])) { bad++; break; } if (it.mesh === SG_MESH.get('h19:ring')) rings++; }
            if (bad || rings < 3) fail('the Mastery skin built bad geometry (' + bad + ' non-finite, ' + rings + ' rings)'); }
          leaveMatch(); B.SET.renderer = r1; }
        // a real battle with the favorite → Mastery XP on the results card
        MASTERY.done = []; MASTERY.xp = {}; MASTERY.pfp = ''; B.SEL.skins.pug = S0;
        setup('pug', 'velocity', 0); run(5); B.fighters[0].st.dmg = 40; const v = B.fighters[1]; v.stocks = 1; B.ko(v); run(220);
        if (!(masteryXP('pug') > 200) || !document.getElementById('res-mast').classList.contains('show')) fail('a battle with your favorite paid no Mastery XP (' + masteryXP('pug') + ')');
        leaveMatch(); B.go('scr-main');
        Object.assign(MASTERY, JSON.parse(M0)); masterySave(); PASS.equip.title = T0; B.SEL.skins.pug = S0; profileUI(); }
      // 107. v19 Item Shop display cards: every fighter / skin / emote / emoji card has a live 3D window, drawn scissored to the scrolling
      //      grid (never over the tabs, the side panel or another menu); map cards get a cached 3D render; the pointer tilts a card + its model
      { const r0 = B.SET.renderer; B.SET.renderer = 'webgl'; B.go('scr-shop'); SHOPV.tab = 'skin'; buildShop();
        const grid = document.getElementById('shop-grid'), wins = grid.querySelectorAll('.sc-win[data-w3]');
        if (wins.length !== SHOP_SKINS.length) fail('the Skins tab has ' + wins.length + ' live 3D card windows (want ' + SHOP_SKINS.length + ')');
        grid.scrollTop = 160; const clips = [], f0 = window.glFlush; window.glFlush = o => { if (o && o.clip) clips.push(o.clip.slice()); return f0(o); };
        try { B.render(); } finally { window.glFlush = f0; }
        if (RENDER3D.on) {
          const gr = GL3D.canvas.getBoundingClientRect(), g0 = grid.getBoundingClientRect(), sy = GL3D.canvas.height / gr.height, top = (gr.bottom - g0.top) * sy, bot = (gr.bottom - g0.bottom) * sy;
          if (clips.length < 4) fail('the shop drew only ' + clips.length + ' live 3D cards');
          if (clips.some(c => c[1] < bot - 1.5 || c[1] + c[3] > top + 1.5)) fail('a shop card drew 3D outside the scrolling grid');
          SHOPV.tab = 'map'; buildShop(); for (let i = 0; i < 8; i++) shopSnapshots();
          if (!STAGES.filter(s => s.shop).every(s => SHOPV.mapImg[s.id])) fail('the map cards have no 3D render');
        }
        SHOPV.tab = 'fighter'; buildShop(); const c = grid.querySelector('.shop-card'), rc = c.getBoundingClientRect();
        grid.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rc.left + rc.width * 0.9, clientY: rc.top + rc.height * 0.1, pointerType: 'mouse' }));
        c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rc.left + rc.width * 0.9, clientY: rc.top + rc.height * 0.1, pointerType: 'mouse' }));
        const T = SHOPV.tilt[c.dataset.key]; if (!c.classList.contains('tilt') || !/deg/.test(c.style.getPropertyValue('--rx')) || !T || !(T.tx > 0.5)) fail('the pointer does not tilt a shop card');
        grid.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' })); if (c.classList.contains('tilt')) fail('a tilted shop card did not settle back');
        SHOPV.tab = 'featured'; B.go('scr-main'); B.SET.renderer = r0; }
      // 108. v19 Brawler Bowling: classic scoring (strike / spare bonuses, the fifth frame's bonus balls), the frame flow, a centred
      //      thunderball knocks the rack down while a wide one drops into the gutter, a light attack only nudges it, nobody gets hurt,
      //      and the CPU bowls its own frames
      { if (bowlScore([10, 10, 10, 10, 10, 10, 10]).score !== 150) fail('a perfect 5-frame game should score 150 (' + bowlScore([10, 10, 10, 10, 10, 10, 10]).score + ')');
        if (bowlScore([7, 3, 5, 2, 0, 0, 10, 4, 6, 3]).score !== 55) fail('bowling scoring is wrong (' + bowlScore([7, 3, 5, 2, 0, 0, 10, 4, 6, 3]).score + ', want 55)');
        if (bowlScore([10, 4]).frames[0].total !== null) fail('a strike was totalled before its bonus balls');
        const nx = (r, f) => JSON.stringify(bowlNext(r, f));
        if (nx([10], 0) !== '[false,false]' || nx([7], 0) !== '[true,false]' || nx([10, 10, 10, 10], 4) !== '[true,true]' || nx([10, 10, 10, 10, 10, 3], 4) !== '[true,false]' || nx([10, 10, 10, 10, 4, 6], 4) !== '[true,true]' || nx([10, 10, 10, 10, 4, 5], 4) !== '[false,false]')
          fail('the frame flow (which ball comes next) is wrong');
        const go = (aim, m) => { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); B.SEL.cpu = B.CHARS.findIndex(c => c.id === 'titan'); bowlStart(); B.G.mode = 'play'; const W = G.bowl;
          for (let i = 0; i < 120 && W.ph !== 'aim'; i++) B.step(); W.lockA = aim; bowlLaunch(B.fighters[0], m); for (let i = 0; i < 900 && W.ph !== 'count'; i++) B.step(); return W; };
        let W = go(0, { base: 9, dmg: 16, heavy: true, ang: 30 }); if (!(W.rolls[0][0] >= 7)) fail('a centred thunderball knocked only ' + W.rolls[0][0] + ' pins');
        W = go(0.32, { base: 9, dmg: 16, heavy: true, ang: 30 }); if (W.rolls[0][0] !== 0 || !W.ball3.gutter) fail('a wide ball did not drop into the gutter (' + W.rolls[0][0] + ' pins)');
        bowlStart(); B.G.mode = 'play'; W = G.bowl; for (let i = 0; i < 120 && W.ph !== 'aim'; i++) B.step(); bowlLaunch(B.fighters[0], { base: 3, dmg: 3, ang: 20 });
        if (!(Math.hypot(W.ball3.vx, W.ball3.vz) <= 8)) fail('a light attack launched the ball instead of nudging it');
        const a = B.fighters[0], v = B.fighters[1], p0 = a.percent; if (deliver(v, a, { dmg: 12, base: 8, scale: 0.1, ang: 40 }, 1, a.x, a.y - 30, false) !== 'volley' || a.percent !== p0) fail('a fighter got hurt in Brawler Bowling');
        bowlStart(); B.G.mode = 'play'; W = G.bowl; W.p = 1; bowlBall(); bowlPlace(); B.fighters[1].cpu = true; let cpuRolled = false;
        for (let i = 0; i < 1500 && !cpuRolled; i++) { B.step(); cpuRolled = W.rolls[1].length > 0; }
        if (!cpuRolled) fail('the CPU never bowled its frame'); chalExit(); leaveMatch(); }
      // 109. v19 The Floor is Lava: the lava rises, the floor (and its ledges) sink under it, a dip scorches you and pops you up, the
      //      platforms crack → sink → resurface (never fewer than three safe spots), and the CPU gets off a cracking platform
      { const start = () => { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); B.SEL.cpu = B.CHARS.findIndex(c => c.id === 'titan'); lavaStart(); B.G.mode = 'play'; return G.lava; };
        let L = start(); const y0 = lavaY(); run(900); if (!(lavaY() < y0 - 20)) fail('the lava did not rise (' + Math.round(y0) + ' to ' + Math.round(lavaY()) + ', t ' + L.t + ')');
        L.t = LAVA.SINK_AT; run(520); if (!(STAGE.y > L.floor0 + 100) || LEDGES[0].y !== STAGE.y || STAGE.y <= lavaY()) fail('the floor did not sink under the lava (' + Math.round(STAGE.y) + ' vs ' + Math.round(lavaY()) + ')');
        B.G.mode = 'play'; B.G.hitstop = 0; B.G.ultFreeze = 0; B.G.ultCine = null; L.burns = [0, 0]; for (const q of B.fighters) q.stocks = 3;
        const f = B.fighters[0]; Object.assign(f, { x: 640, y: lavaY() + 20, vx: 0, vy: 2, state: 'free', invuln: 0, lavaCD: 0, onGround: false, hitstun: 0 }); const p0 = f.percent; for (let i = 0; i < 3 && !L.burns[0]; i++) B.step();
        if (!(f.percent > p0 + 5 && f.vy < -5 && L.burns[0] >= 1)) fail('touching the lava did not scorch + launch (' + Math.round(f.percent - p0) + '%, vy ' + f.vy.toFixed(1) + ')');
        L = start(); const seen = new Set(); let minSafe = 9;
        for (let i = 0; i < 2600; i++) { L.t = Math.max(L.t, 600); for (const q of B.fighters) { q.stocks = 3; q.percent = Math.min(q.percent, 60); } B.step(); if (B.G.mode !== 'play') break;
          for (const s of L.slots) seen.add(s.st); minSafe = Math.min(minSafe, L.slots.filter(s => s.st === 'up').length + (STAGE.y < lavaY() - 20 ? 1 : 0)); }
        if (!['warn', 'sink', 'down', 'rise'].every(s => seen.has(s))) fail('the platforms never went through crack → sink → resurface (' + [...seen].join(',') + ')');
        if (minSafe < 3) fail('the safe spots dropped to ' + minSafe);
        L = start(); const c = B.fighters[1], s = L.slots[2]; c.cpu = true; B.fighters[0].x = 150; B.fighters[0].y = 410;
        Object.assign(c, { x: s.p.x + s.p.w / 2, y: s.p.y, vx: 0, vy: 0, onGround: true, ground: 'plat', state: 'free' }); s.st = 'warn'; s.t = 0; L.nextCyc = 1e9;
        run(150); const still = Math.abs(c.y - s.p.y) < 2 && c.x > s.p.x && c.x < s.p.x + s.p.w;
        if (still) fail('the CPU stayed on a cracking platform'); chalExit(); leaveMatch(); }
      // 110. v19 the juice holds in the new modes: a heavy bowling launch hit-pauses, a clean pocket strike drops into slow motion,
      //      and the last stock in The Floor is Lava still gets the FINAL BLOW
      { B.SEL.p1 = B.CHARS.findIndex(c => c.id === 'velocity'); bowlStart(); B.G.mode = 'play'; const W = G.bowl; for (let i = 0; i < 120 && W.ph !== 'aim'; i++) B.step();
        B.G.hitstop = 0; W.lockA = 0; bowlLaunch(B.fighters[0], { base: 9, dmg: 16, heavy: true, ang: 30 }); if (!(B.G.hitstop >= 6)) fail('a heavy bowling launch did not hit-pause');
        let slow = false; for (let i = 0; i < 400 && W.ph !== 'count'; i++) { B.step(); if (B.G.slowmo > 0) slow = true; } if (!slow) fail('a clean pocket hit on a full rack did not drop into slow motion');
        chalExit(); leaveMatch();
        lavaStart(); B.G.mode = 'play'; run(5); const a = B.fighters[0], v = B.fighters[1]; v.stocks = 1; v.percent = 230; v.x = a.x + 30; v.y = a.y; FIN16.on = false;
        deliver(a, v, { dmg: 20, base: 14, scale: 0.18, ang: 40, heavy: true }, 1, v.x, v.y - 30, false);
        if (!FIN16.on) fail('a lethal last-stock hit in The Floor is Lava did not trigger the FINAL BLOW'); FIN16.on = false; chalExit(); leaveMatch(); }
      // 111. v20 THE PRO PASS: exactly 10,000 Coins; exactly 250 tiers with a reward on every one (tier 1 = a brand-new fighter, tier
      //      2 = a brand-new stage, then skins · KO explosions · nameplates · emojis, every one distinct); the Neon Pass track is untouched;
      //      buying needs the coins + a confirm, charges exactly 10,000, unlocks tier 1 at once, and is saved
      { const k = PRO_REWARDS.map(proKey);
        if (PRO_PRICE !== 10000) fail('the Pro Pass does not cost exactly 10,000 Coins (' + PRO_PRICE + ')');
        if (PRO_REWARDS.length !== 250 || PRO_TIERS !== 250 || new Set(PRO_REWARDS.map(r => r[0])).size !== 250 || PRO_REWARDS[249][0] !== 250) fail('the Pro Pass does not have 250 tiers with a reward each');
        if (new Set(k).size !== 250) fail('the Pro Pass repeats a reward');
        const t1 = PRO_REWARDS[0], t2 = PRO_REWARDS[1], axo = B.CHARS.find(c => c.id === t1[2]), cat = B.STAGES.find(s => s.id === t2[2]);
        if (t1[1] !== 'char' || !axo || !axo.pro || t2[1] !== 'map' || !cat || !cat.pro) fail('Pro tier 1 / 2 are not a new fighter / a new stage (' + t1 + ' / ' + t2 + ')');
        if (B.CHARS.filter(c => c.pro).length !== 1 || B.STAGES.filter(s => s.pro).length !== 1 || axo.shop || cat.shop) fail('the Pro fighter / stage are not exclusive to the Pro Pass');
        const n = ty => PRO_REWARDS.filter(r => r[1] === ty).length;
        if (n('skin') !== 30 || n('ko') !== 78 || n('plate') !== 100 || n('emoji') !== 40) fail('the Pro reward mix is wrong (' + ['skin', 'ko', 'plate', 'emoji'].map(t => t + ' ' + n(t)).join(', ') + ')');
        for (const r of PRO_REWARDS) if (!proName(r) || !proDesc(r)) { fail('Pro reward ' + proKey(r) + ' has no name / description'); break; }
        for (let a = 0; a < 230; a += 20) { const w = PRO_REWARDS.slice(a, a + 25).map(r => r[1]); if (new Set(w).size < 3) { fail('Pro tiers ' + (a + 1) + '-' + (a + 25) + ' are not a mix of reward types'); break; } }
        if (PRO_REWARDS[249][1] !== 'skin' || proRarity(PRO_REWARDS[249]) !== 4) fail('the final Pro tier is not a legendary skin');
        if (PASS_REWARDS.length !== 250 || PASS_REWARDS.some(r => r[1] === 'char' || r[1] === 'map' || (r[1] === 'ko' && !RW_PAL[r[2].split('-')[1]]) || (r[1] === 'plate' && /^p20-/.test(r[2])))) fail('the Neon Pass track changed');
        PRO.owned = false; PRO.xp = 0; PRO.seen = 0; proSave();
        const axI = B.CHARS.indexOf(axo), caI = B.STAGES.indexOf(cat);
        if (charUnlocked(axI) || stageUnlocked(caI) || playablePool().includes(axI) || proOwns('char:axo') || skinUnlocked(PRO_SKIN0, axo) || emojiUnlocked(emojiIndex('party'))) fail('Pro rewards are usable before buying the Pro Pass');
        B.SEL.cpu = null; for (let q = 0; q < 20; q++) { B.startMatch(); if (B.fighters[1].ch.pro) { fail('a random CPU picked the locked Pro fighter'); break; } } leaveMatch();
        WALLET.coins = 9999; if (proBuy() || PRO.owned || WALLET.coins !== 9999) fail('the Pro Pass was bought without 10,000 Coins');
        WALLET.coins = 25000; PROV.track = 'pro'; B.go('scr-pass');
        if (!document.querySelector('.pp-banner') || !document.querySelector('[data-act="pp-track"][data-track="pro"].on')) fail('the Pass screen does not show the Pro track + its purchase banner');
        document.getElementById('pp-buy').click(); if (PRO.owned || WALLET.coins !== 25000) fail('one tap bought the Pro Pass (no confirm)');
        document.getElementById('pp-buy').click(); if (!PRO.owned || WALLET.coins !== 15000) fail('confirming did not buy the Pro Pass for exactly 10,000 Coins (' + WALLET.coins + ')');
        if (proTier() !== 1 || !proOwns('char:axo') || !charUnlocked(axI) || proOwns('map:cathedral') || stageUnlocked(caI)) fail('buying unlocked the wrong tiers (tier ' + proTier() + ')');
        if (!/"owned":true/.test(localStorage.getItem('neonbrawl.pro') || '')) fail('the Pro Pass purchase was not saved');
        PRO.owned = false; proLoad(); if (!PRO.owned) fail('the Pro Pass purchase did not reload');
        if (proBuy()) fail('the Pro Pass could be bought twice'); B.go('scr-main'); }
      // 112. v20 earning: every Battle Pass award fills the Pro track too (tier 2 = the Cathedral), the tiers climb to 250, the loadout
      //      cycles through Pro KO explosions + nameplates, Pro skins / emojis unlock, and the Settings profile lists what you own
      { const xp0 = PASS.xp; passAward([['test', passTierXP(2) + 5]]);
        if (proTier() < 2 || !proOwns('map:cathedral') || !stageUnlocked(B.STAGES.findIndex(s => s.id === 'cathedral'))) fail('Battle Pass XP did not reach Pro tier 2 (the Cathedral)');
        PRO.xp = proTotalXP(); proSave(); if (proTier() !== 250 || !PRO_REWARDS.every(r => proOwns(proKey(r)))) fail('the Pro track does not climb to tier 250');
        if (!skinUnlocked(PRO_SKIN0 + 5, B.CHARS[0]) || !emojiUnlocked(emojiIndex('volcano'))) fail('Pro skins / emojis did not unlock');
        PASS.equip.ko = 'classic'; let seenKo = false; for (let i = 0; i < 140 && !seenKo; i++) { passCycle('ko'); seenKo = !!PRO_KOS[PASS.equip.ko]; } if (!seenKo) fail('the KO loadout slot never offers a Pro KO explosion');
        PASS.equip.plate = 'basic'; let seenPl = false; for (let i = 0; i < 160 && !seenPl; i++) { passCycle('plate'); seenPl = /^p20-/.test(PASS.equip.plate); } if (!seenPl) fail('the nameplate slot never offers a Pro nameplate');
        setTab = 'profile'; B.go('scr-settings'); if (!document.querySelector('[data-act="plate-pick"][data-plate^="p20-"]') || !document.querySelector('.pchip.emo.pro')) fail('Settings → Profile does not list the owned Pro nameplates / emojis');
        B.go('scr-main'); PASS.xp = xp0; passSave(); }
      // 113. v20 the Pro track UI: the glass grid lists all 250 tiers (+ sections), each with a live 3D window drawn inside the scrolling
      //      track; picking a tier fills the detail panel; Equip / Play / Fight-here route correctly; the switch flips back to the Neon Pass
      { const r0 = B.SET.renderer; B.SET.renderer = 'webgl'; PROV.track = 'pro'; B.go('scr-pass');
        const cards = document.querySelectorAll('#bp-track .bp-card.pro'), wins = document.querySelectorAll('#bp-track .bp-3d[data-p3]');
        if (cards.length !== 250 || wins.length !== 250 || document.querySelectorAll('#bp-track .bp-sec.pro').length !== 25) fail('the Pro track grid is incomplete (' + cards.length + ' cards, ' + wins.length + ' 3D windows)');
        const tr = document.getElementById('bp-track'); tr.scrollTop = 300; const clips = [], f0 = window.glFlush; window.glFlush = o => { clips.push(o && o.vp ? o.vp.slice() : null); return f0(o); };
        try { B.render(); } finally { window.glFlush = f0; }
        if (RENDER3D.on && clips.filter(Boolean).length < 6) fail('the Pro track drew only ' + clips.filter(Boolean).length + ' live 3D previews');
        let bad = 0; for (let i = 0; i < GL3D.n; i++) for (let j = 0; j < 16; j++) if (!Number.isFinite(GL3D.items[i].m[j])) { bad++; break; } if (bad) fail('the Pro previews built ' + bad + ' non-finite parts');
        for (const tier of [1, 2, 7, 50, 250]) { document.querySelector('.bp-card.pro[data-tier="' + tier + '"]').click(); if (PROV.sel !== tier || !document.getElementById('bp-dname').textContent.includes(proName(PRO_REWARDS[tier - 1]))) fail('picking Pro tier ' + tier + ' did not fill the detail panel'); B.render(); }
        const koT = PRO_REWARDS.find(r => r[1] === 'ko'); document.querySelector('.bp-card.pro[data-tier="' + koT[0] + '"]').click(); document.getElementById('bp-equip').click();
        if (PASS.equip.ko !== koT[2]) fail('equipping a Pro KO explosion did not work');
        document.querySelector('.bp-card.pro[data-tier="1"]').click(); document.getElementById('bp-equip').click();
        if (B.G.screen !== 'scr-select' || B.CHARS[B.SEL.p1].id !== 'axo') fail('"Play as AXO" did not pick AXO'); B.go('scr-pass');
        document.querySelector('[data-act="pp-track"][data-track="free"]').click(); if (PROV.track !== 'free' || document.querySelectorAll('#bp-track .bp-card.pro').length || !document.querySelectorAll('#bp-track .bp-card').length) fail('the switch did not flip back to the Neon Pass');
        B.go('scr-main'); B.SET.renderer = r0; }
      // 114. v20 AXO: the Bubble Snare floats up toward the cursor, seals whoever it touches in a bubble that rises, then pops them
      //      skyward; AXO regenerates after a few seconds unhurt (never while being hit); its own gait / punch / air / Ultimate / model
      { setupDummy('axo', 'titan', 0); const f = B.fighters[0], v = B.fighters[1]; v.cpu = false; f.x = 520; v.x = 700; v.y = f.y; run(10);
        B.mouse.cx = 700; B.mouse.cy = f.y - 60; B.pressed.add('KeyQ'); run(14);
        const bub = B.projs.find(p => p.kind === 'bubble'); if (!bub) fail('AXO\\'s Bubble Snare fired no bubble');
        else { const y0 = bub.y; run(12); if (!(bub.y < y0 - 2 || !B.projs.includes(bub))) fail('the bubble does not drift upward'); }
        Object.assign(v, { state: 'free', invuln: 0, vx: 0, vy: 0 }); const pr = { kind: 'bubble', x: v.x, y: v.y - 40, vx: 1, vy: 0, r: 17, owner: f, life: 50, dmg: 4, base: 4.5, scale: 0.06, ang: 78, color: f.color, t: 0, trap: 32 };
        B.projs.length = 0; B.projs.push(pr); B.step();
        if (!v.bubbleTrap || !(v.frozenT > 0)) fail('the bubble did not trap the opponent');
        const yT = v.y; for (let i = 0; i < 20; i++) B.step(); if (!(v.y < yT - 10)) fail('the trapped opponent does not float up in the bubble');
        for (let i = 0; i < 20 && v.frozenT > 0; i++) B.step(); B.step(); if (v.bubbleTrap || !(v.vy < -5)) fail('the bubble did not pop the opponent skyward (vy ' + v.vy.toFixed(1) + ')');
        setupDummy('axo', 'titan', 0); const a = B.fighters[0]; B.fighters[1].x = 1200; a.percent = 40; a._regP = 40; a.regenCD = 0; run(70);
        if (!(a.percent < 40)) fail('AXO did not regenerate while unhurt (' + a.percent + ')');
        a.percent = 40; a._regP = 40; deliver(B.fighters[1], a, { dmg: 5, base: 3, scale: 0.02, ang: 45 }, 1, a.x, a.y - 30, false); const p1 = a.percent; run(100);
        if (a.percent < p1 - 0.01) fail('AXO regenerated right after being hit');
        run(160); if (!(a.percent < p1)) fail('AXO never resumed regenerating');
        const M = B.MOTION.axo; if (!M || M.g !== 'swim' || M.arm !== 'fin' || M.air !== 'swim' || !PUNCH.fin || !GAIT_PUNCH.swim) fail('AXO has no own swim gait / fin arms / swim air style');
        if (!ULTS.axo || ULTS.axo.p.beast !== 'axolotl' || !EMOTE_OVERRIDE.axo || !B.VICTORY_STYLES.axo) fail('AXO is missing its Ultimate beast / emote / victory style');
        { const r0 = B.SET.renderer; B.SET.renderer = 'webgl'; setupDummy('axo', 'velocity', 0); run(4); B.render();
          if (RENDER3D.on) { const gills = []; let bad = 0; for (let k = 0; k < 16; k++) { if (k === 4) B.pressed.add('M0'); B.step(); B.render(); }
            for (let i = 0; i < GL3D.n; i++) for (let j = 0; j < 16; j++) if (!Number.isFinite(GL3D.items[i].m[j])) { bad++; break; }
            if (bad) fail('AXO built ' + bad + ' non-finite 3D parts'); if (!faceKindOf('axo').mouth) fail('AXO\\'s grin does not replace the default mouth'); void gills; }
          leaveMatch(); B.SET.renderer = r0; } }
      // 115. v20 Prismatic Cathedral: its own sky, scenery, deco, light rig, weather, music and a living scene graph (rose window +
      //      god rays + bells + prisms) that builds clean geometry; the canvas renderer draws its fallback background
      { const ci = B.STAGES.findIndex(s => s.id === 'cathedral');
        if (THEME3D.cathedral !== 'cathedral' || !SKY_EXT.cathedral || !SCENERY_EXT.cathedral || !DECO_EXT.cathedral || !MAP3D.cathedral || !LIGHT_EXT[LIGHT_RIG.cathedral] || !WX_STAGE.cathedral || !STAGE_MUSIC.cathedral || !BACKGROUNDS.cathedral) fail('the Prismatic Cathedral is missing one of its hooks');
        const r0 = B.SET.renderer; B.SET.renderer = 'webgl'; setup('axo', 'titan', ci); run(20); B.render(); B.render();
        if (RENDER3D.on) { if (!CATH_SG || !CATH_SG.root.find('rose') || !CATH_SG.root.find('petal11') || !CATH_SG.root.find('bell1') || !CATH_SG.root.find('prism5')) fail('the Cathedral scene graph is incomplete');
          let bad = 0; for (let i = 0; i < GL3D.n; i++) for (let j = 0; j < 16; j++) if (!Number.isFinite(GL3D.items[i].m[j])) { bad++; break; } if (bad) fail('the Cathedral built ' + bad + ' non-finite parts');
          const ge = B.GL3D.gl.getError(); if (ge) fail('GL error ' + ge + ' on the Prismatic Cathedral'); }
        B.SET.renderer = 'canvas'; B.render(); B.SET.renderer = r0; leaveMatch(); }
      // 116. v20 Pro rewards render: every Pro skin is its own 3D model on three body types, every Pro KO explosion / nameplate / emoji
      //      builds finite geometry through its whole animation, and the 7-bit emoji packing carries the last (72nd) emoji online
      { if (B.GL3D.ok && !B.GL3D.failed) { const H = (a, n) => { let h = 0; for (let i = 0; i < n; i++) h = (h * 31 + Math.round(a[i] * 4)) | 0; return h; };
          for (const id of ['axo', 'panda', 'monolith']) { const ch = B.CHARS.find(c => c.id === id), sigs = new Set(); let bad = 0;
            for (let k = PRO_SKIN0; k < SKIN_COUNT; k++) { const d = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill }; resetFighter(d, 640); applySkin(d, ch, k); poseDummy(d, 30);
              glResetDraw(studioEnv([1, 1, 1])); const n0 = B.GL3D.n; collectFighter3D(d, solveRig(d)); let hi = 0; for (let j = n0; j < B.GL3D.n; j++) { hi = (hi * 17 + H(B.GL3D.items[j].m, 16)) | 0; for (let q = 0; q < 16; q++) if (!Number.isFinite(B.GL3D.items[j].m[q])) { bad++; break; } }
              sigs.add(hi + '/' + ['lit', 'glow', 'flat', 'alpha'].map(q => H(BAT[q].p, BAT[q].nv * 3)).join('/')); }
            if (sigs.size !== PRO_SKINS.length || bad) fail(id + ': ' + sigs.size + ' of ' + PRO_SKINS.length + ' Pro skins are distinct 3D models (' + bad + ' non-finite)'); }
          let bad = 0; const chk = () => { for (const q of ['lit', 'glow', 'flat', 'alpha']) for (let i = 0; i < BAT[q].nv * 3; i++) if (!Number.isFinite(BAT[q].p[i])) { bad++; return; } };
          for (const r of PRO_REWARDS) { glResetDraw(studioEnv([1, 1, 1]));
            for (const age of [0, 9, 30, 70]) { if (r[1] === 'ko') koDraw3D(r[2], 0, 0, 0, age, 1); else if (r[1] === 'plate') plate3D(r[2], 0, 0, 0, 120, 40, [1, 0.5, 1], age * 7); else if (r[1] === 'emoji') emoji3D(r[2], 0, 0, 0, 30, age * 5); }
            chk(); if (bad) { fail('Pro reward ' + proKey(r) + ' built non-finite geometry'); break; } } }
        const i = B.emptyInput(); i.emoji = EMOJIS.length; const u = unpackInput(packInput(i)); if (EMOJIS.length !== 72 || u.emoji !== 72) fail('the online packets cannot carry the 72nd emoji (' + u.emoji + ')'); }
      // 117. v20 the juice still holds: a heavy smash by the new fighter hit-pauses + shakes, and a last-stock KO still plays the slow-mo FINAL BLOW
      { setup('axo', 'titan', 0); run(5); const a = B.fighters[0], v = B.fighters[1]; v.cpu = false; B.G.hitstop = 0; v.x = a.x + 40; v.y = a.y; v.percent = 60; v.invuln = 0; v.state = 'free';
        deliver(a, v, { dmg: 18, base: 12, scale: 0.16, ang: 40, heavy: true }, 1, v.x, v.y - 30, false); if (!(B.G.hitstop >= 4)) fail('AXO\\'s heavy hit did not hit-pause (' + B.G.hitstop + ')');
        run(40); v.stocks = 1; v.percent = 240; v.state = 'free'; v.invuln = 0; v.x = a.x + 30; v.y = a.y; FIN16.on = false;
        deliver(a, v, { dmg: 20, base: 14, scale: 0.18, ang: 40, heavy: true }, 1, v.x, v.y - 30, false); if (!FIN16.on) fail('a lethal last-stock hit by AXO did not trigger the slow-mo FINAL BLOW'); FIN16.on = false; leaveMatch(); }
      Object.assign(PRO, PRO0); proSave(); Object.assign(PASS.equip, EQ0); passSave(); PROV.track = 'free';
    } finally {
      Object.assign(WALLET, W0); PASS.equip.title = ''; PROFILE.loadout = null; PROFILE.earned = [];
      for (const [k, v] of [['neonbrawl.wallet', savedWallet], ['neonbrawl.profile', savedProfile], ['neonbrawl.settings', savedSettings], ['neonbrawl.skins', savedSkins], ['neonbrawl.minigames', savedMini], ['neonbrawl.pro', savedPro]]) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
      proLoad();
      walletLoad(); profileLoad(); B.SET.themeCustom = false; B.SET.themeCols = null; applyUITheme(); setTab = 'audio';
    }
    B.keys.clear(); B.go('scr-main');
    return { errs, mode: B.G.mode, seen: Object.keys(seen).sort().join(' '), poses: Object.keys(poses).length + ' of ' + B.RIG_POSES.length };
  })()`).catch(e => ({ errs: [String(e)] }));

  const all = [...errors, ...(result.errs || [])];
  if (all.length) { console.error('SMOKE TEST FAILED:\n' + all.join('\n')); app.exit(1); }
  else { console.log('Smoke test passed - every stage and fighter played, no errors.\nStates/mechanics seen: ' + result.seen + '\nNamed poses shown: ' + result.poses); app.exit(0); }
});
