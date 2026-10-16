/* NEON BRAWL — HTML menus: screens, settings, roster, stage/difficulty select, previews. */
'use strict';

/* ============================== HTML UI ============================= */
const $ = id => document.getElementById(id);
const wrapEl = $('wrap');
function fit() {                                                 // 1 CSS "u" = 1 logical pixel of the full-bleed view; canvas resolution follows the screen
  sizeCanvas(); wrapEl.style.setProperty('--u', VIEW.u + 'px');
  wrapEl.style.setProperty('--ox', VIEW.OX + ''); wrapEl.style.setProperty('--oy', VIEW.OY + '');
  if (typeof resetStick === 'function') resetStick();
}
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(wrapEl);
fit();

function showScreen(id) {
  G.screen = id; document.querySelectorAll('.screen').forEach(el => el.classList.toggle('show', el.id === id));
  if (id !== 'scr-select') G.tintTarget = '#7b5cff';
}
function go(id) { if (G.mode !== 'menu') leaveMatch(); showScreen(id); onShow(id); }

/* ---- intro splash → main menu. The first tap is a user gesture, so it can unlock audio, request fullscreen and
 *      lock the screen to landscape (Fullscreen + Screen Orientation APIs; both are best-effort and fail silently
 *      where unsupported, e.g. desktop browsers that refuse an orientation lock). ---- */
function enterFullscreenLandscape() {
  if (!SET.fullscreen) return;
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && req) {
      const p = req.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(lock, lock); else lock();
    } else lock();
  } catch (e) { lock(); }
}
let introLeaving = false;
function introStart() {
  if (G.screen !== 'scr-intro' || introLeaving) return;
  introLeaving = true;
  audioUnlock(); enterFullscreenLandscape();
  setTimeout(() => sfx('startup'), 30);                                    // (give a freshly created AudioContext a moment to start)
  $('scr-intro').classList.add('leaving');
  setTimeout(() => { introLeaving = false; $('scr-intro').classList.remove('leaving'); if (G.screen === 'scr-intro') go('scr-main'); }, 1700);
}
// Any later first touch also gets fullscreen + landscape (e.g. after the player left fullscreen with the back button)
window.addEventListener('pointerup', e => { if (e.pointerType === 'touch' && G.screen !== 'scr-intro' && !document.fullscreenElement && SET.fullscreen && !window.__noAutoFS) enterFullscreenLandscape(); });
function onShow(id) {
  if (id === 'scr-select') refreshSelect(); else if (id === 'scr-stage') refreshStages();
  else if (id === 'scr-setup') refreshSetup(); else if (id === 'scr-settings') buildSettings();
}

/* ---- settings (persisted when storage is available) ---- */
const SETTING_DEFS = [
  { key: 'renderer', label: 'Renderer',     hint: '3D WebGL = true 3D world with real-time lights and shadows. Canvas = the classic 2D-painted renderer.', opts: [['3D WebGL', 'webgl'], ['Canvas', 'canvas']] },
  { key: 'music',   label: 'Music',         hint: 'Procedurally synthesised soundtrack (menus + battles).', opts: [['Off', 0], ['Low', 0.35], ['Normal', 0.7], ['High', 1]] },
  { key: 'sfx',     label: 'Sound effects', hint: 'Synthesised hits, jumps, smashes and UI sounds.',      opts: [['Off', 0], ['Low', 0.35], ['Normal', 0.7], ['High', 1]] },
  { key: 'fullscreen', label: 'Auto fullscreen', hint: 'Go fullscreen + lock landscape on the first tap (phones / APK).', opts: [['Off', false], ['On', true]] },
  { key: 'shake',  label: 'Screen shake',  hint: 'Camera shake scales with knockback.',   opts: [['Off', 0], ['Low', 0.5], ['Full', 1]] },
  { key: 'hitstop', label: 'Hit-stop',      hint: 'Brief freeze frames on strong hits.',   opts: [['Off', false], ['On', true]] },
  { key: 'part',    label: 'Particles',     hint: 'Density of dust, sparks and debris.',    opts: [['Low', 0.4], ['Normal', 1], ['High', 1.7]] },
  { key: 'aim',     label: 'Aim reticle',   hint: 'Arrow around your fighter showing aim.', opts: [['Off', false], ['On', true]] },
  { key: 'flash',   label: 'Damage flash',  hint: 'HUD flash and red vignette on hits.',    opts: [['Off', false], ['On', true]] },
  { key: 'res',     label: 'Resolution',     hint: 'Sharp = full screen density (up to 4K). Balanced = faster.', opts: [['Sharp', 'high'], ['Balanced', 'balanced']] },
  { key: 'gfx',     label: 'Graphics',       hint: '3D Render = shaded, lit "official render" look. Neon = the original glowing outlines.', opts: [['3D Render', '3d'], ['Neon', 'neon']] },
  { key: 'limbs',   label: 'Fighter style',  hint: 'Jointed limbs (IK skeleton) or floating fists and feet.', opts: [['Jointed', 'jointed'], ['Floating', 'floating']] },
  { key: 'roster',  label: 'Roster',         hint: 'Featured = the 8 headline fighters and 6 stages. All = everyone.', opts: [['Featured', 'featured'], ['All', 'all']] },
  { key: 'touch',   label: 'Touch controls', hint: 'On-screen stick and buttons. Auto = on phones and tablets.', opts: [['Auto', 'auto'], ['On', 'on'], ['Off', 'off']] }
];
function loadSettings() { try { Object.assign(SET, JSON.parse(localStorage.getItem('neonbrawl.settings') || '{}')); } catch (e) { /* storage unavailable */ } }
function saveSettings() { try { localStorage.setItem('neonbrawl.settings', JSON.stringify(SET)); } catch (e) { /* storage unavailable */ } }
function buildSettings() {
  $('set-rows').innerHTML = SETTING_DEFS.map(d => `<div class="panel row"><div><b>${d.label}</b><small>${d.hint}</small></div>` +
    `<div class="seg">${d.opts.map((o, i) => `<button data-set="${d.key}" data-i="${i}" class="${SET[d.key] === o[1] ? 'on' : ''}">${o[0]}</button>`).join('')}</div></div>`).join('');
}

/* ---- fighter roster (tiles + detail panel with stat radar) / stage / difficulty cards ---- */
const STAT_DEFS = [['Speed', 'speed'], ['Power', 'power'], ['Weight', 'weight'], ['Recovery', 'recovery'], ['Special', 'special']];
// Fighter class for the metallic foil badges: [label, short tag, foil gradient]
const CLASSES = {
  Grappler: ['GR', 'linear-gradient(135deg,#7a4a1a,#e8b070,#8a5a2a,#ffd8a0,#6a3a10)'], Tank: ['TK', 'linear-gradient(135deg,#5a6070,#e8ecf4,#7a8090,#ffffff,#4a5060)'],
  Knight: ['KN', 'linear-gradient(135deg,#8a6a1a,#ffe08a,#b08a2a,#fff4c0,#7a5a10)'], Zoner: ['ZN', 'linear-gradient(135deg,#1a6a8a,#8af0ff,#2a8ab0,#e0ffff,#1a5a7a)'],
  Assassin: ['AS', 'linear-gradient(135deg,#3a1a6a,#c0a0ff,#5a3a9a,#efe0ff,#2a1050)'], Acrobat: ['AC', 'linear-gradient(135deg,#8a2a6a,#ffa0e0,#b04a8a,#ffe0f4,#6a1a50)'],
  Mage: ['MG', 'linear-gradient(135deg,#4a2a9a,#b08aff,#ff8ae0,#8af0ff,#3a1a7a)'], Beast: ['BS', 'linear-gradient(135deg,#1a6a3a,#8affb0,#2a8a50,#e0ffe8,#105a2a)'],
  Rushdown: ['RD', 'linear-gradient(135deg,#8a1a1a,#ff8a6a,#ffd23a,#ffe8b0,#7a1010)']
};
function fighterClass(ch) {
  const a = ch.arch, s = ch.special, r = ch.role.toLowerCase();
  // the role line is hand-written per fighter, so it wins when it names a class outright
  for (const [k, re] of [['Grappler', /grappl/], ['Tank', /tank|heavy|juggernaut|colossus|brute/], ['Zoner', /zoner|sniper|archer|gunner|artiller/],
    ['Assassin', /assassin|ninja|stealth/], ['Acrobat', /acrobat|aerial|floaty|skater|glider/], ['Rushdown', /rushdown|brawler|speed/],
    ['Knight', /knight|paladin|defender|samurai|sword/], ['Mage', /mage|warlock|wizard|mystic|witch|caller/], ['Beast', /beast|predator|mutant|dino/]])
    if (re.test(r)) return k;
  if (ch.grabArmor) return 'Grappler';
  if (a === 'heavy' || a === 'brute') return 'Tank';
  if (a === 'knight') return 'Knight';
  if (ch.zoner || s.ranged) return 'Zoner';
  if (a === 'ninja') return 'Assassin';
  if (a === 'acrobat' || a === 'skater') return 'Acrobat';
  if (a === 'mage' || a === 'float') return 'Mage';
  if (a === 'beast' || a === 'mutant') return 'Beast';
  return 'Rushdown';
}
const FDATA = [];                                                              // cached frameData() rows per fighter
// Real frame data, read through the same move builder the game uses (so balance clamps are included)
function frameData(ch) {
  const f = { ch }, jab = buildMove(f, 'jab'), ft = buildMove(f, 'ftilt'), sm = buildMove(f, 'fsmash'), na = buildMove(f, 'nair');
  const fr = n => n + '<i>f</i>';                                              // startup frames
  return [['Jab', fr(jab.s)], ['Tilt', fr(ft.s)], ['Smash', fr(sm.s)], ['N-air', fr(na.s)], ['Run', ch.run.toFixed(1)], ['Weight', ch.weight.toFixed(2)], ['Jumps', ch.airJumps + 1 + (ch.jet ? '+jet' : ch.hover ? '+hov' : '')]];
}
$('char-grid').innerHTML = CHARS.map((ch, i) => { const K = fighterClass(ch);
  return `<button class="tile" data-char="${i}" style="--c:${ch.color}"><span class="badge p1">P1</span><span class="badge cpu">CPU</span><span class="cls" title="${K}" style="--foil:${CLASSES[K][1]}">${CLASSES[K][0]}</span>` +
  `<canvas width="156" height="104"></canvas><b class="${ch.name.length > 8 ? 'long' : ''}">${ch.name}</b><small>${ch.role.split(' · ')[0]}</small>` +
  `<span class="skindots" data-skincycle="${i}" title="Change skin">${'<i></i>'.repeat(SKIN_COUNT)}</span></button>`; }).join('');
$('detail').innerHTML =
  `<canvas id="det-canvas" width="924" height="320"></canvas>` +
  `<div class="drow"><canvas id="det-radar" width="340" height="340"></canvas><div class="dinfo">` +
  `<div class="dhead"><span class="cls big" id="det-cls"></span><h3 id="det-name"></h3><span class="pill" id="det-jumps"></span></div><p class="role" id="det-role"></p>` +
  `<div class="fdata" id="det-fdata"></div>` +
  `<div class="skinrow"><small>Skin</small><span id="det-skins"></span><b id="det-skinname"></b></div>` +
  `<div class="spec-card"><small>Special move · Q</small><b id="det-sname"></b><p id="det-sdesc"></p><p class="passive" id="det-pass"></p></div></div></div>`;
/* ---- stage features → hazard / mechanic badges, and an SVG platform diagram built straight from the stage data ---- */
const HAZ_INFO = { lava: ['🌋', 'Lava', '#ff6a2a'], flare: ['➶', 'Arrows', '#ffb347'], lightning: ['⚡', 'Lightning', '#ffe629'], icicle: ['❄', 'Icicles', '#9be8ff'],
  traffic: ['🚗', 'Traffic', '#ff4d6d'], train: ['🚆', 'Train', '#ffd23a'] };
function stageFeatures(st) {
  const out = [], P = st.plats || [];
  if (st.hazard && HAZ_INFO[st.hazard]) out.push([...HAZ_INFO[st.hazard], true]);
  if (st.grav && st.grav < 1) out.push(['🪐', 'Low gravity', '#b08aff']);
  if (P.some(p => p.crumble)) out.push(['⛓', 'Crumbling', '#d8a24a']);
  if (P.some(p => p.launch)) out.push(['⇪', 'Launch pads', '#5dffa0']);
  if (P.some(p => p.phase !== undefined)) out.push(['◌', 'Phasing', '#c08aff']);
  if (st.portals) out.push(['◎', 'Portals', '#ff5ad8']);
  if (st.clean) out.push(['▭', 'Tournament', '#22e6ff']);
  if (!out.length) out.push(['✓', P.length ? P.length + ' platforms · no hazards' : 'Flat · no hazards', '#9aa0d8', 'none']);
  return out;
}
function layoutSVG(st) {
  const m = st.main, c = st.pal.edge, pc = st.pal.plat, P = st.plats || [];
  let s = `<defs><linearGradient id="slg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity=".05"/></linearGradient></defs>`;
  s += `<rect x="${st.bz.l}" y="${st.bz.t}" width="${st.bz.r - st.bz.l}" height="${st.bz.b - st.bz.t}" fill="none" stroke="#ff4d6d" stroke-opacity=".35" stroke-dasharray="14 10" stroke-width="4"/>`;
  for (let y = 200; y < 600; y += 60) s += `<line x1="140" x2="1140" y1="${y}" y2="${y}" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>`;
  s += `<path d="M${m.x} ${m.y}h${m.w}l-${m.w * 0.08} ${m.h}h-${m.w * 0.84}z" fill="url(#slg)" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>`;
  s += `<line x1="${m.x + 6}" x2="${m.x + m.w - 6}" y1="${m.y + 3}" y2="${m.y + 3}" stroke="#fff" stroke-opacity=".8" stroke-width="3"/>`;
  for (const p of P) {
    const dash = p.crumble ? ' stroke-dasharray="16 10"' : '', op = p.phase !== undefined ? ' stroke-opacity=".45"' : '';
    s += `<line x1="${p.x}" x2="${p.x + p.w}" y1="${p.y}" y2="${p.y}" stroke="${p.launch ? '#5dffa0' : pc}" stroke-width="9" stroke-linecap="round"${dash}${op}/>`;
    if (p.launch) s += `<path d="M${p.x + p.w / 2 - 14} ${p.y - 14}l14 -20l14 20" fill="none" stroke="#5dffa0" stroke-width="5"/>`;
  }
  if (st.portals) for (const q of st.portals) if (q && q.x !== undefined) s += `<circle cx="${q.x}" cy="${q.y}" r="18" fill="none" stroke="#ff5ad8" stroke-width="5"/>`;
  (st.spawns || []).forEach((x, k) => { s += `<circle cx="${x}" cy="${m.y - 26}" r="11" fill="${k ? '#ffd36e' : '#ffffff'}"/>`; });
  return s;
}
$('stage-grid').innerHTML = STAGES.map((st, i) =>
  `<button class="card stage" data-stage="${i}" title="${st.desc}" style="--c:${st.pal.edge}"><canvas width="424" height="140"></canvas><i class="glass"></i>` +
  `<span class="hzi">${stageFeatures(st).filter(f => f[3] !== 'none').map(f => `<i style="--k:${f[2]}" title="${f[1]}">${f[0]}</i>`).join('')}</span>` +
  `<h3>${st.name}</h3><p class="role">${st.tag}</p><p class="spec">${st.desc}</p></button>`).join('');
$('hp-counts').textContent = CHARS.length + ' fighters · ' + STAGES.length + ' stages';
const charCards = [...$('char-grid').querySelectorAll('.tile')], stageCards = [...$('stage-grid').querySelectorAll('.card')];
const charCtx = charCards.map(el => el.querySelector('canvas').getContext('2d'));
const stageCtx = stageCards.map(el => el.querySelector('canvas').getContext('2d'));
let stageHover = null, siShown = -1;                                               // stage-select inspector: hovered card / stage on show
const detCtx = $('det-canvas').getContext('2d'), radarCtx = $('det-radar').getContext('2d');
const radarVals = STAT_DEFS.map(() => 0);                                     // eased radar values (animate toward the hovered fighter)

const detailIndex = () => SEL.hover !== null ? SEL.hover : (SEL.slot === 'cpu' && SEL.cpu !== null ? SEL.cpu : SEL.p1);
/* ---- roster mode: Featured (8 fighters, 6 stages) or All. Picks outside the visible set move back inside it. ---- */
function applyRoster() {
  const fp = fighterPool(), sp = stagePool();
  if (!fp.includes(SEL.p1)) SEL.p1 = fp[0];
  if (SEL.cpu !== null && !fp.includes(SEL.cpu)) SEL.cpu = null;
  if (!sp.includes(SEL.stage)) { SEL.stage = sp[0]; if (G.mode === 'menu') loadStage(SEL.stage); }
  refreshSelect(); refreshStages(); refreshSetup();
}

/* ---- costume skins: click a selected fighter's card again (or its dots / the swatches) to cycle ---- */
function loadSkins() { try { Object.assign(SEL.skins, JSON.parse(localStorage.getItem('neonbrawl.skins') || '{}')); } catch (e) { /* storage unavailable */ } }
function saveSkins() { try { localStorage.setItem('neonbrawl.skins', JSON.stringify(SEL.skins)); } catch (e) { /* storage unavailable */ } }
function setSkin(i, s) {
  const ch = CHARS[i]; SEL.skins[ch.id] = ((s % SKIN_COUNT) + SKIN_COUNT) % SKIN_COUNT; saveSkins();
  const card = charCards[i]; card.classList.remove('skinpop'); void card.offsetWidth; card.classList.add('skinpop');   // little "pop" on change
  refreshSelect();
}
const cycleSkin = i => setSkin(i, skinIdx(CHARS[i]) + 1);
function refreshSkinUI() {
  charCards.forEach((el, i) => {
    const ch = CHARS[i], s = skinOf(ch, skinIdx(ch));
    el.style.setProperty('--c', s.color);
    el.querySelectorAll('.skindots i').forEach((d, k) => { d.classList.toggle('on', k === s.i); d.style.background = skinOf(ch, k).color; });
  });
}

function refreshDetail() {
  const i = detailIndex(), ch = CHARS[i], sk = skinOf(ch, skinIdx(ch));
  $('detail').style.setProperty('--c', sk.color);
  $('det-skins').innerHTML = [0, 1, 2].map(k => { const s = skinOf(ch, k);
    return `<button class="swatch ${k === sk.i ? 'on' : ''}" data-skin="${k}" data-skinchar="${i}" title="${s.name}" style="--sc:${s.color};--sf:${s.fill}"></button>`; }).join('');
  $('det-skinname').textContent = sk.name;
  $('det-name').textContent = ch.name; $('det-jumps').textContent = ch.wclass + ' · ' + (ch.airJumps + 1) + (ch.jet ? ' jump + jetpack' : ch.hover ? ' jump + hover' : ' jumps'); $('det-role').textContent = ch.role;
  $('det-sname').textContent = ch.special.name; $('det-sdesc').textContent = ch.sdesc; $('det-pass').textContent = ch.pass;
  const K = fighterClass(ch), cl = $('det-cls'); cl.textContent = K; cl.style.setProperty('--foil', CLASSES[K][1]);
  if (!FDATA[i]) FDATA[i] = frameData(ch);
  $('det-fdata').innerHTML = FDATA[i].map(([k, v]) => `<span><small>${k}</small><b>${v}</b></span>`).join('');
  G.tintTarget = sk.color;
}

// Glowing animated stat radar (Speed · Power · Weight · Recovery · Special)
function drawRadar(ch) {
  const col = skinOf(ch, skinIdx(ch)).color;                                   // radar glows in the chosen skin's colour
  const c2 = radarCtx, S = 170, cx = 85, cy = 88, R = 50, n = STAT_DEFS.length, t = G.time;
  c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, S, S);
  STAT_DEFS.forEach(([, k], i) => { radarVals[i] += (ch.stats[k] - radarVals[i]) * 0.12; });
  const pt = (i, r) => { const a = -Math.PI / 2 + i * Math.PI * 2 / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  c2.strokeStyle = 'rgba(255,255,255,0.12)'; c2.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) { c2.beginPath(); for (let i = 0; i <= n; i++) { const p = pt(i % n, R * ring / 4); i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]); } c2.stroke(); }
  for (let i = 0; i < n; i++) { const p = pt(i, R); c2.beginPath(); c2.moveTo(cx, cy); c2.lineTo(p[0], p[1]); c2.stroke(); }
  c2.save(); c2.globalCompositeOperation = 'lighter'; c2.shadowColor = col; c2.shadowBlur = 14;
  c2.beginPath(); radarVals.forEach((v, i) => { const p = pt(i, R * (0.08 + 0.92 * v)); i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]); }); c2.closePath();
  const rg = c2.createRadialGradient(cx, cy, 2, cx, cy, R);                    // gradient fill: hot white core → skin colour → magenta rim
  rg.addColorStop(0, rgba('#ffffff', 0.55)); rg.addColorStop(0.45, rgba(col, 0.42 + 0.08 * Math.sin(t * 0.08))); rg.addColorStop(1, rgba('#ff4fd8', 0.3));
  c2.fillStyle = rg; c2.fill(); c2.strokeStyle = col; c2.lineWidth = 2; c2.stroke();
  radarVals.forEach((v, i) => { const p = pt(i, R * (0.08 + 0.92 * v)); c2.fillStyle = '#ffffff'; c2.beginPath(); c2.arc(p[0], p[1], 2.6, 0, Math.PI * 2); c2.fill(); });
  const sw = t * 0.03; c2.strokeStyle = rgba(col, 0.5); c2.lineWidth = 1.5; c2.beginPath(); c2.moveTo(cx, cy); c2.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); c2.stroke();   // radar sweep
  c2.restore();
  STAT_DEFS.forEach(([label], i) => {
    const p = pt(i, R + 15); c2.font = `700 9px ${FONT}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#c6c9f5'; c2.fillText(label.toUpperCase(), p[0], p[1]);
    const q = pt(i, R + 25); c2.font = `900 8px ${FONT_NUM}`; c2.fillStyle = col; c2.fillText(Math.round(radarVals[i] * 10), q[0], q[1] + (i === 0 ? -2 : 2));
  });
}
$('char-grid').addEventListener('mouseover', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  const i = +t.dataset.char; if (SEL.hover !== i) { SEL.hover = i; refreshDetail(); }
});
$('char-grid').addEventListener('mouseleave', () => { SEL.hover = null; refreshDetail(); });

function refreshSelect() {
  const p = CHARS[SEL.p1], q = SEL.cpu === null ? null : CHARS[SEL.cpu];
  $('slot-p1-name').textContent = p.name; $('slot-p1-name').style.color = skinOf(p, skinIdx(p)).color;
  $('slot-cpu-name').textContent = q ? q.name : 'Random'; $('slot-cpu-name').style.color = q ? skinOf(q, skinIdx(q)).color : '#ffd36e';
  $('slot-p1').classList.toggle('active', SEL.slot === 'p1'); $('slot-cpu').classList.toggle('active', SEL.slot === 'cpu');
  const pool = fighterPool();                                                     // featured 8, or everyone (Settings → Roster)
  charCards.forEach((el, i) => { el.classList.toggle('sel-p1', SEL.p1 === i); el.classList.toggle('sel-cpu', SEL.cpu === i); el.classList.toggle('off', !pool.includes(i)); });
  $('char-grid').classList.toggle('featured', SET.roster !== 'all');
  $('roster-btn').textContent = SET.roster === 'all' ? 'Featured 8 only' : 'Show all ' + CHARS.length + ' fighters';
  refreshSkinUI(); refreshDetail(); refreshDiffPick();
}
// Glowing match-parameter chips in the VS bar (stage · stocks · CPU level · hazards)
function refreshParams() {
  const st = SEL.randStage ? '? Random' : STAGES[SEL.stage].name, dc = ['#5dffa0', '#ffd36e', '#ff8a3d', '#ff4d6d'][SEL.diff];
  $('mparams').innerHTML = `<span style="--k:#22e6ff"><small>Stage</small><b>${st}</b></span><span style="--k:#ff5ad8"><small>Stocks</small><b>3</b></span>` +
    `<span style="--k:${dc}"><small>CPU</small><b>${DIFFS[SEL.diff].name}</b></span><span style="--k:${SEL.hazards ? '#ff8a3d' : '#7f89b3'}"><small>Hazards</small><b>${SEL.hazards ? 'ON' : 'OFF'}</b></span>`;
}
function refreshDiffPick() {                                     // quick CPU-difficulty toggle on the fighter-select screen
  $('sel-diff').innerHTML = DIFFS.map((d, i) => `<button data-diff="${i}" class="${SEL.diff === i ? 'on' : ''}">${d.name}</button>`).join('');
  refreshParams();
}
function refreshStages() {
  const pool = stagePool();
  stageCards.forEach((el, i) => { el.classList.toggle('sel', !SEL.randStage && SEL.stage === i); el.classList.toggle('off', !pool.includes(i)); });
  $('stage-grid').classList.toggle('featured', SET.roster !== 'all');
  $('roster-btn2').textContent = SET.roster === 'all' ? 'Featured 6 only' : 'Show all ' + STAGES.length + ' stages';
  $('rand-stage').classList.toggle('on', SEL.randStage);
  $('hz-btn').textContent = 'Hazards: ' + (SEL.hazards ? 'On' : 'Off'); $('hz-btn').classList.toggle('on', SEL.hazards);
  refreshParams(); refreshInspector();
}
function refreshSetup() {
  const cols = ['#5dffa0', '#ffd36e', '#ff8a3d', '#ff4d6d'];
  $('diff-list').innerHTML = DIFFS.map((d, i) =>
    `<button class="card diff ${SEL.diff === i ? 'sel' : ''}" data-diff="${i}" style="--c:${cols[i]}"><h3>${d.name}</h3><p>${d.desc}</p>` +
    `<div class="pips">${[0, 1, 2, 3].map(k => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div></button>`).join('');
  $('sum-p1').textContent = CHARS[SEL.p1].name; $('sum-cpu').textContent = SEL.cpu === null ? 'Random' : CHARS[SEL.cpu].name;
  $('sum-stage').textContent = SEL.randStage ? 'Random' : STAGES[SEL.stage].name; $('sum-diff').textContent = DIFFS[SEL.diff].name;
}
function cycleSel(sc, d) {                                       // arrow keys step through the visible roster / stages
  const step = (pool, cur) => pool[((pool.indexOf(cur) + d) % pool.length + pool.length) % pool.length];
  if (sc === 'scr-select') { const k = SEL.slot, pool = fighterPool(); SEL[k] = SEL[k] === null ? pool[d > 0 ? 0 : pool.length - 1] : step(pool, SEL[k]); refreshSelect();
    charCards[SEL[k]].scrollIntoView({ block: 'nearest' }); }                       // keep the keyboard pick in view in the scrolling roster
  else if (sc === 'scr-stage') { SEL.randStage = false; SEL.stage = step(stagePool(), SEL.stage); loadStage(SEL.stage); refreshStages(); }
  else if (sc === 'scr-setup') { SEL.diff = (SEL.diff + d + DIFFS.length) % DIFFS.length; refreshSetup(); refreshDiffPick(); }
}
/* ---- cinematic victory screen: spotlit winner on a canvas + side-by-side match stats ---- */
const resCtx = $('res-canvas').getContext('2d');
const VIC = { dummy: null, loser: null, confetti: [], spray: [], smoke: [], t0: 0 };
// Every fighter's own victory: a stance (poses.js) + a signature particle effect on the results screen
const VICTORY_STYLES = {
  dino: ['champagne', 'champagne'], blaze: ['inferno', 'fire'], velocity: ['fistpump', 'speed'], spark: ['fistpump', 'lightning'],
  titan: ['flex', 'leaves'], dynamo: ['flex', 'confetti'], mecha: ['flex', 'fireworks'], terra: ['roar', 'dust'],
  apex: ['roar', 'feathers'], venom: ['roar', 'slime'], chimera: ['roar', 'bubbles'], vortex: ['hover', 'orbs'],
  solaris: ['hover', 'stars'], echo: ['hover', 'notes'], tempest: ['hover', 'wind'], aether: ['cast', 'rays'],
  frost: ['cast', 'snow'], luna: ['cast', 'shooting'], chrono: ['cast', 'clocks'], nyx: ['cast', 'shadows'], kitsune: ['cast', 'foxfire'],
  phantom: ['spin', 'smoke'], sylph: ['spin', 'sparkles'], mirage: ['bow', 'smoke'], ronin: ['bow', 'petals'],
  aegis: ['salute', 'sparkles'], void: ['salute', 'holy'], surge: ['skate', 'speed'], glitch: ['glitch', 'code'],
  pulse: ['scratch', 'equalizer'], valkyrie: ['ascend', 'feathers'], magma: ['erupt', 'fire'], sol: ['sunrise', 'sunrays'], gale: ['whirl', 'wind'], drift: ['drift', 'neon'],
  zenith: ['lotus', 'rays'], serpent: ['spin', 'slime'], blitz: ['spin', 'lightning'], umbra: ['bow', 'shadows'], fang: ['howl', 'dust'], prism: ['cast', 'sparkles'],
  smith: ['flex', 'fire'], mimic: ['hover', 'equalizer'], stormmage: ['cast', 'lightning'], strider: ['bow', 'wind'], specter: ['salute', 'smoke'],
  inferno: ['roar', 'fire'], byte: ['glitch', 'neon'], titanus: ['roar', 'fireworks'], apexx: ['pose', 'code'],
  strix: ['hover', 'feathers'], kuro: ['roar', 'shadows'], bismuth: ['flex', 'sparkles'], aura: ['lotus', 'smoke'], nox: ['cast', 'smoke'],
  helix: ['glitch', 'slime'], zealot: ['spin', 'rays'], pyre: ['spin', 'fire'], vesper: ['hover', 'lightning'], rogue: ['salute', 'code'],
  titanis: ['erupt', 'dust'], paradox: ['spin', 'clocks'], zen: ['bow', 'neon'], fable: ['cast', 'confetti'], goliath: ['flex', 'dust'],
  orin: ['sunrise', 'rays'], nyx2: ['spin', 'shadows'], kryp: ['glitch', 'smoke'], atlas: ['ascend', 'stars'], siren: ['scratch', 'notes'],
  talon: ['ascend', 'wind'], brimstone: ['erupt', 'fireworks'], gridrunner: ['pose', 'neon'], vanguard: ['salute', 'fireworks'], omega: ['ascend', 'rays']
};
const victoryStyleOf = ch => (VICTORY_STYLES[ch.id] || ['fistpump'])[0];
const victoryFxOf = ch => (VICTORY_STYLES[ch.id] || [0, 'confetti'])[1];
// Particle recipes for the victory effects: colours, shape, where they spawn and how they move
const VFX = {
  speed:     { cols: ['#22e6ff', '#ffffff'], shape: 'streak', from: 'side',   v: [-9, 0],    g: 0,     size: [2, 3],  rate: 2 },
  lightning: { cols: ['#ffe629', '#ffffff'], shape: 'bolt',   from: 'around', v: [0, 0],     g: 0,     size: [14, 26], rate: 0.35, life: 8 },
  leaves:    { cols: ['#6fcf4a', '#3f8a32', '#b8e06a'], shape: 'leaf', from: 'top', v: [0.6, 1.2], g: 0, size: [4, 6], rate: 1 },
  confetti:  { cols: ['#ffd23a', '#ff5a5a', '#5ac8ff', '#ffffff'], shape: 'rect', from: 'top', v: [0, 1.6], g: 0.02, size: [3, 6], rate: 2 },
  fireworks: { cols: ['#ff5a5a', '#ffd23a', '#5affd6', '#ffffff'], shape: 'firework', from: 'sky', v: [0, 0], g: 0.05, size: [2, 3], rate: 0.08, life: 50 },
  dust:      { cols: ['#c9a06a', '#8a6a4a'], shape: 'puff',  from: 'ground', v: [0, -0.8], g: 0,  size: [6, 12], rate: 0.8 },
  feathers:  { cols: ['#ffcf5a', '#ffffff', '#ff8a1f'], shape: 'leaf', from: 'top', v: [0.3, 0.7], g: 0, size: [3, 7], rate: 0.8 },
  slime:     { cols: ['#9dff2e', '#e2ff5a'], shape: 'drop',   from: 'top',    v: [0, 2.2],   g: 0.05, size: [2, 4], rate: 1 },
  bubbles:   { cols: ['#9ff4ff', '#ffffff'], shape: 'ring',   from: 'ground', v: [0, -1.4],  g: 0,     size: [3, 8], rate: 1.2 },
  orbs:      { cols: ['#a86bff', '#ff6bd6'], shape: 'glow',   from: 'orbit',  v: [0, 0],     g: 0,     size: [4, 7], rate: 0.4, life: 120 },
  stars:     { cols: ['#ffffff', '#ffd23a'], shape: 'star',   from: 'around', v: [0, -0.6],  g: 0,     size: [3, 6], rate: 0.8 },
  notes:     { cols: ['#5cc8ff', '#ffffff'], shape: 'wave',   from: 'center', v: [0, 0],     g: 0,     size: [8, 8], rate: 0.12, life: 40 },
  wind:      { cols: ['#a0fff0', '#ffffff'], shape: 'streak', from: 'around', v: [3, -1],    g: 0,     size: [1.5, 2.5], rate: 1.5 },
  rays:      { cols: ['#fff3a0'], shape: 'ray', from: 'center', v: [0, 0], g: 0, size: [1, 1], rate: 0.1, life: 60 },
  snow:      { cols: ['#ffffff', '#d6fbff'], shape: 'dot',    from: 'top',    v: [0.2, 0.9], g: 0,     size: [1.5, 3], rate: 2.5 },
  shooting:  { cols: ['#c0c8ff', '#ffffff'], shape: 'streak', from: 'sky',    v: [5, 3],     g: 0,     size: [2, 3], rate: 0.25, life: 40 },
  clocks:    { cols: ['#d8b26e', '#7fe0d6'], shape: 'wave',   from: 'center', v: [0, 0],     g: 0,     size: [10, 10], rate: 0.08, life: 50 },
  shadows:   { cols: ['rgba(40,0,30,0.8)', 'rgba(90,20,70,0.7)'], shape: 'puff', from: 'around', v: [0, -0.7], g: 0, size: [8, 14], rate: 0.8 },
  foxfire:   { cols: ['#7fd8ff', '#ff7b5c', '#ffd0f0'], shape: 'flame', from: 'orbit', v: [0, 0], g: 0, size: [5, 8], rate: 0.3, life: 90 },
  smoke:     { cols: ['rgba(20,24,40,0.85)', 'rgba(60,70,100,0.6)'], shape: 'puff', from: 'ground', v: [0, -0.9], g: 0, size: [10, 16], rate: 1 },
  sparkles:  { cols: ['#ffffff', '#ffaee0', '#a8d8ff'], shape: 'star', from: 'around', v: [0, -0.3], g: 0, size: [2, 4], rate: 1.2 },
  petals:    { cols: ['#ffc6e0', '#ff9ac8', '#ffffff'], shape: 'leaf', from: 'top',  v: [0.8, 1],  g: 0,     size: [3, 5], rate: 1.5 },
  holy:      { cols: ['#fff1b8', '#ffffff'], shape: 'ray',    from: 'center', v: [0, 0],     g: 0,     size: [1, 1], rate: 0.08, life: 70 },
  code:      { cols: ['#00ff9c', '#c8ffe0'], shape: 'rect',   from: 'top',    v: [0, 3],     g: 0,     size: [3, 7], rate: 3 },
  fire:      { cols: ['#ffb03a', '#ff5a1f', '#ffe08a'], shape: 'streak', from: 'ground', v: [0, -2.6], g: -0.01, size: [1.5, 2.5], rate: 1.5, life: 60 },   // embers over Blaze's flames
  champagne: { cols: ['#fff3b0', '#ffe066', '#ffffff'], shape: 'ring', from: 'ground', v: [0, -1.1], g: 0, size: [1.5, 3.5], rate: 1.2, life: 80 },     // golden fizz under the spray
  equalizer: { cols: ['#ff2ee6', '#2ef0ff', '#ffffff'], shape: 'bar',  from: 'ground', v: [0, 0], g: 0, size: [8, 26], rate: 0.6, life: 24 },       // Pulse: equalizer bars pumping from the floor
  sunrays:   { cols: ['#ffd36e', '#ff9a3d'], shape: 'ray', from: 'center', v: [0, 0], g: 0, size: [1, 1], rate: 0.12, life: 70 },                       // Sol: the rising sun's rays
  neon:      { cols: ['#59a8ff', '#ff4dd8', '#ffffff'], shape: 'streak', from: 'side', v: [-11, 0], g: 0, size: [1.5, 3], rate: 2.2 }                 // Drift: neon light-trails racing past
};
function showResult() {
  const w = G.winner, secs = Math.round((G.matchTime || G.frame) / 60);
  $('res-title').textContent = w ? (w === fighters[0] ? 'YOU WIN' : 'CPU WINS') : 'DRAW';
  $('res-title').style.color = w ? w.color : '#ffffff'; $('res-title').dataset.text = $('res-title').textContent;
  $('res-sub').textContent = w ? `${w.ch.name} · ${w.stocks} stock${w.stocks === 1 ? '' : 's'} left · ${Math.floor(w.percent)}%` : 'Both fighters were knocked out';
  const row = (label, a, b) => `<div class="vr"><b style="color:${fighters[0].color}">${a}</b><span>${label}</span><b style="color:${fighters[1].color}">${b}</b></div>`;
  const [p, q] = fighters.map(f => f.st);
  $('res-stats').innerHTML = `<div class="vr vh"><b style="color:${fighters[0].color}">${fighters[0].ch.name}</b><span>vs</span><b style="color:${fighters[1].color}">${fighters[1].ch.name}</b></div>` +
    row('KOs', p.kos, q.kos) + row('Damage dealt', Math.round(p.dmg) + '%', Math.round(q.dmg) + '%') + row('Hits landed', p.hits, q.hits) +
    row('Best combo', p.best || '–', q.best || '–') + row('Stocks left', fighters[0].stocks, fighters[1].stocks) +
    `<div class="vr"><span class="full">${ST.name} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</span></div>`;
  const ch = (w || fighters[0]).ch, col = w ? w.color : '#ffffff';
  VIC.dummy = { id: 7, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: col, fill: w ? w.fill : rgba(col, 0.2) }; resetFighter(VIC.dummy, 0);
  VIC.dummy.victory = true; VIC.dummy.victoryStyle = victoryStyleOf(ch);       // a character-specific victory stance (poses.js)
  const L = w && fighters.find(f => f !== w);                                  // the loser sits dazed beside them
  VIC.loser = L ? Object.assign({ id: 8, keys: null, cpu: false, ai: null, buf: {}, ch: L.ch, name: '', color: L.color, fill: L.fill }) : null;
  if (VIC.loser) { resetFighter(VIC.loser, 0); VIC.loser.defeat = true; }
  VIC.spray = []; VIC.vfx = []; VIC.smoke = []; VIC.acc = 0; VIC.fx = victoryFxOf(ch);
  VIC.confetti = Array.from({ length: 90 }, () => ({ x: rand(0, 450), y: rand(-250, 0), vy: rand(0.6, 1.8), vx: rand(-0.4, 0.4), r: rand(0, 6.28), vr: rand(-0.1, 0.1), c: `hsl(${rand(0, 360)},100%,65%)`, s: rand(3, 6) }));
  VIC.t0 = G.time;
  showScreen('scr-result');
}
function drawVictory() {
  const d = VIC.dummy; if (!d) return;
  const c2 = resCtx, t = G.time - VIC.t0, Wd = 450, Hd = 250, col = d.color;
  ctx = c2; c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, Wd, Hd);
  c2.save(); c2.globalCompositeOperation = 'lighter';                        // rotating god-rays + spotlight cone
  for (let i = 0; i < 12; i++) {
    const a = t * 0.004 + i * Math.PI / 6; c2.fillStyle = rgba(col, 0.05 + 0.03 * Math.sin(t * 0.05 + i));
    c2.beginPath(); c2.moveTo(Wd / 2, 150); c2.lineTo(Wd / 2 + Math.cos(a - 0.08) * 400, 150 + Math.sin(a - 0.08) * 400); c2.lineTo(Wd / 2 + Math.cos(a + 0.08) * 400, 150 + Math.sin(a + 0.08) * 400); c2.closePath(); c2.fill();
  }
  const sg = c2.createLinearGradient(0, 0, 0, Hd); sg.addColorStop(0, 'rgba(255,255,255,0.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  c2.fillStyle = sg; c2.beginPath(); c2.moveTo(Wd / 2 - 30, 0); c2.lineTo(Wd / 2 + 30, 0); c2.lineTo(Wd / 2 + 110, 222); c2.lineTo(Wd / 2 - 110, 222); c2.closePath(); c2.fill();
  const pg = c2.createRadialGradient(Wd / 2, 222, 4, Wd / 2, 222, 110); pg.addColorStop(0, rgba(col, 0.55)); pg.addColorStop(1, rgba(col, 0));
  c2.fillStyle = pg; c2.save(); c2.translate(Wd / 2, 222); c2.scale(1, 0.2); c2.beginPath(); c2.arc(0, 0, 110, 0, Math.PI * 2); c2.fill(); c2.restore();
  c2.restore();
  // loser (right): sitting dazed with stars circling its head
  const lo = VIC.loser, wx = lo ? Wd * 0.4 : Wd / 2;
  if (lo) {
    Object.assign(lo, { x: 0, y: 0, facing: -1, vx: 0, vy: 0, rot: 0, onGround: true, state: 'stunned', stunT: 99, move: null, sp: null, hitFlash: 0, invuln: 0, sx: 1, sy: 1, percent: 150 });
    c2.save(); c2.globalAlpha = 0.9; c2.translate(Wd * 0.84, 224); c2.scale(1.35, 1.35); drawFighter(lo); c2.restore();
    const DA = DEFEAT_ANIM[lo.ch.id];
    if (DA && DA.smoke && t % 4 === 0) VIC.smoke.push({ x: Wd * 0.84 + rand(-14, 14), y: 170 + rand(-8, 8), vx: rand(-0.2, 0.4), vy: -rand(0.5, 1), s: rand(5, 9), life: 70 });   // smoke rising off broken armor
    c2.save();
    for (let i = VIC.smoke.length - 1; i >= 0; i--) { const p = VIC.smoke[i]; p.x += p.vx; p.y += p.vy; p.s += 0.12; if (--p.life <= 0) { VIC.smoke.splice(i, 1); continue; }
      c2.globalAlpha = Math.min(0.5, p.life / 70); c2.fillStyle = '#5a5e6a'; c2.beginPath(); c2.arc(p.x, p.y, p.s, 0, Math.PI * 2); c2.fill(); }
    c2.restore();
  }
  // winner (left, in the spotlight): victory hop, then its own victory stance with the occasional celebratory smash
  const st = d.victoryStyle, hop = t < 40 ? Math.abs(Math.sin(t / 40 * Math.PI * 2)) * 40 : 0;
  Object.assign(d, { x: 0, y: 0, facing: 1, vx: 0, vy: t < 40 ? -4 : 0, rot: 0, onGround: t >= 40, state: 'free', move: null, sp: null, hitFlash: 0, invuln: 0, sx: 1, sy: 1, shield: 100, chill: 0, percent: 0 });
  if (t >= 40 && (st === 'fistpump' || st === 'flex') && (t % 180) > 120) { d.move = buildMove(d, 'usmash'); d.state = 'attack'; d.stateT = Math.min(d.move.s + 2, ((t % 180) - 120) >> 1); }
  const prop = (VICTORY_ANIM[d.ch.id] || {}).prop;
  if (prop === 'sunaura') {                                                    // Sol / Orin / Omega: a blinding radiant aura
    c2.save(); c2.globalCompositeOperation = 'lighter'; const R = 120 + 10 * Math.sin(t * 0.05), cy = 220 - hop - 70;
    const g = c2.createRadialGradient(wx, cy, 6, wx, cy, R); g.addColorStop(0, 'rgba(255,255,240,0.95)'); g.addColorStop(0.25, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
    c2.fillStyle = g; c2.beginPath(); c2.arc(wx, cy, R, 0, Math.PI * 2); c2.fill();
    c2.strokeStyle = 'rgba(255,250,210,0.35)'; c2.lineWidth = 3; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + t * 0.01; c2.beginPath(); c2.moveTo(wx + Math.cos(a) * 40, cy + Math.sin(a) * 40); c2.lineTo(wx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2); c2.stroke(); }
    c2.restore();
  }
  if (prop === 'car') { c2.save(); c2.translate(wx - 70, 222); c2.scale(1.15, 1.15);   // Dino Nuggi's F1 car parked beside him
    drawCar({ move: { s: 20, a: 9999 }, stateT: 17.99, facing: 1, x: 0, y: 0, color: col }); c2.restore(); }
  c2.save(); c2.translate(wx, 220 - hop); c2.scale(2.1, 2.1); drawFighter(d); c2.restore();
  if (prop === 'turntable') {                                                  // Pulse's DJ deck, records spinning under his hands
    const dx = wx + 30, dy = 220 - 58; c2.save();
    c2.fillStyle = '#1a1c26'; rr(dx - 52, dy, 104, 22, 4); c2.fill(); c2.strokeStyle = col; c2.lineWidth = 2; c2.stroke();
    for (const ox of [-26, 26]) { c2.save(); c2.translate(dx + ox, dy + 5); c2.scale(1, 0.35); c2.rotate(t * 0.2);
      c2.fillStyle = '#0a0a10'; c2.beginPath(); c2.arc(0, 0, 20, 0, Math.PI * 2); c2.fill(); c2.fillStyle = col; c2.beginPath(); c2.arc(0, 0, 7, 0, Math.PI * 2); c2.fill();
      c2.strokeStyle = 'rgba(255,255,255,0.6)'; c2.lineWidth = 2; c2.beginPath(); c2.arc(0, 0, 16, 0, 1); c2.stroke(); c2.restore(); }
    c2.globalCompositeOperation = 'lighter'; const beat = 1 - (t % 40) / 40; c2.fillStyle = rgba(col, 0.5 * beat); for (let i = 0; i < 6; i++) c2.fillRect(dx - 42 + i * 15, dy + 12, 8, 6);
    c2.restore();
  }
  if (st === 'champagne' && d.snap && t > 30) {                               // Dino Nuggi: champagne spraying from the bottle
    const bx = wx + (d.snap.fa[0] + 11) * 2.1, by = 220 - hop + (d.snap.fa[1] - 30) * 2.1;          // (the bottle's mouth, tilted forward)
    for (let k = 0; k < 3; k++) VIC.spray.push({ x: bx, y: by, vx: rand(2.5, 5.5), vy: rand(-2.6, -0.4), life: rand(35, 55), s: rand(1.2, 2.8) });   // arcs over onto the loser
  }
  if (st === 'inferno' && t % 3 === 0) VIC.spray.push({ x: wx + rand(-40, 40), y: 222, vx: rand(-0.5, 0.5), vy: rand(-3.5, -1.5), life: rand(30, 60), s: rand(2, 4), fire: true });   // Blaze: rising flames
  c2.save(); c2.globalCompositeOperation = 'lighter';
  for (let i = VIC.spray.length - 1; i >= 0; i--) {
    const p = VIC.spray[i]; p.x += p.vx; p.y += p.vy; p.vy += p.fire ? -0.02 : 0.18; if (--p.life <= 0 || p.y > Hd) { VIC.spray.splice(i, 1); continue; }
    c2.globalAlpha = Math.min(1, p.life / 20); c2.fillStyle = p.fire ? (p.life & 4 ? '#ffb03a' : '#ff5a1f') : (i % 3 ? '#fff6c8' : '#ffffff');
    c2.beginPath(); c2.arc(p.x, p.y, p.s, 0, Math.PI * 2); c2.fill();
  }
  c2.restore();
  if (VIC.fx === 'confetti') for (const p of VIC.confetti) {                  // confetti shower (Titan's championship celebration)
    p.y += p.vy; p.x += p.vx + Math.sin(t * 0.05 + p.r) * 0.4; p.r += p.vr; if (p.y > Hd + 10) { p.y = -10; p.x = rand(0, Wd); }
    c2.save(); c2.translate(p.x, p.y); c2.rotate(p.r); c2.scale(1, Math.sin(t * 0.1 + p.r)); c2.fillStyle = p.c; c2.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c2.restore();
  }
  victoryVfx(c2, t, wx, Wd, Hd);                                              // the winner's signature particle effect
  ctx = mainCtx;
}

// Spawn, move and draw the winner's signature victory particles (recipes in VFX)
function victoryVfx(c2, t, wx, Wd, Hd) {
  const R = VFX[VIC.fx]; if (!R) return;
  VIC.acc = (VIC.acc || 0) + R.rate;
  while (VIC.acc >= 1) {
    VIC.acc--;
    const sz = rand(R.size[0], R.size[1]), col = R.cols[Math.floor(Math.random() * R.cols.length)];
    let x = rand(0, Wd), y = -10;
    if (R.from === 'ground') { x = wx + rand(-70, 70); y = 224; } else if (R.from === 'around') { x = wx + rand(-80, 80); y = rand(60, 210); }
    else if (R.from === 'sky') { x = rand(20, Wd - 20); y = rand(10, 90); } else if (R.from === 'side') { x = Wd + 10; y = rand(40, 220); }
    else if (R.from === 'center' || R.from === 'orbit') { x = wx; y = 150; }
    VIC.vfx.push({ x, y, vx: R.v[0] + rand(-0.4, 0.4), vy: R.v[1] + rand(-0.3, 0.3), s: sz, col, life: R.life || 90, max: R.life || 90, a: Math.random() * 6.28, r0: rand(40, 90) });
  }
  c2.save();
  for (let i = VIC.vfx.length - 1; i >= 0; i--) {
    const p = VIC.vfx[i], k = p.life / p.max;
    if (--p.life <= 0 || p.y > Hd + 20 || p.x < -40) { VIC.vfx.splice(i, 1); continue; }
    p.x += p.vx + (R.shape === 'leaf' ? Math.sin(t * 0.06 + p.a) * 0.8 : 0); p.y += p.vy; p.vy += R.g; p.a += 0.05;
    c2.globalAlpha = Math.min(1, k * 2); c2.fillStyle = p.col; c2.strokeStyle = p.col; c2.globalCompositeOperation = R.shape === 'puff' ? 'source-over' : 'lighter';
    switch (R.shape) {
      case 'streak': c2.lineWidth = p.s; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(p.x, p.y); c2.lineTo(p.x - p.vx * 5, p.y - p.vy * 5); c2.stroke(); break;
      case 'bolt': { c2.lineWidth = 2; c2.beginPath(); let x = p.x, y = p.y - p.s; c2.moveTo(x, y); for (let j = 0; j < 4; j++) { x += rand(-6, 6); y += p.s / 2; c2.lineTo(x, y); } c2.stroke(); break; }
      case 'leaf': c2.save(); c2.translate(p.x, p.y); c2.rotate(p.a); c2.beginPath(); c2.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2); c2.fill(); c2.restore(); break;
      case 'rect': c2.save(); c2.translate(p.x, p.y); c2.rotate(p.a); c2.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c2.restore(); break;
      case 'puff': c2.globalAlpha = k * 0.7; c2.beginPath(); c2.arc(p.x, p.y, p.s * (1.6 - k * 0.6), 0, Math.PI * 2); c2.fill(); break;
      case 'drop': c2.beginPath(); c2.ellipse(p.x, p.y, p.s * 0.7, p.s * 1.3, 0, 0, Math.PI * 2); c2.fill(); break;
      case 'ring': c2.lineWidth = 1.2; c2.beginPath(); c2.arc(p.x, p.y, p.s, 0, Math.PI * 2); c2.stroke(); break;
      case 'bar': { const h = p.s * 3 * Math.sin(k * Math.PI); c2.fillRect(p.x - 3, 226 - h, 6, h); break; }   // an equalizer bar rising and falling
      case 'wave': { c2.lineWidth = 2; const r = (1 - k) * 110 + 10; c2.globalAlpha = k; c2.beginPath(); c2.arc(p.x, p.y, r, 0, Math.PI * 2); c2.stroke(); break; }
      case 'ray': { const a = p.a * 0.4 + p.r0; c2.globalAlpha = k * 0.35; c2.beginPath(); c2.moveTo(p.x, p.y); c2.lineTo(p.x + Math.cos(a - 0.1) * 300, p.y + Math.sin(a - 0.1) * 300); c2.lineTo(p.x + Math.cos(a + 0.1) * 300, p.y + Math.sin(a + 0.1) * 300); c2.closePath(); c2.fill(); break; }
      case 'glow': case 'flame': {
        const a = p.a * 2 + p.r0, x = p.x + Math.cos(a) * p.r0, y = p.y + Math.sin(a) * p.r0 * 0.35;
        const g = c2.createRadialGradient(x, y, 0, x, y, p.s * 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, p.col); g.addColorStop(1, 'rgba(0,0,0,0)');
        c2.fillStyle = g; c2.beginPath(); c2.arc(x, y, p.s * 2, 0, Math.PI * 2); c2.fill(); break;
      }
      case 'star': c2.save(); c2.translate(p.x, p.y); c2.rotate(p.a); c2.beginPath(); for (let j = 0; j < 8; j++) { const r = j % 2 ? p.s * 0.4 : p.s; c2.lineTo(Math.cos(j * Math.PI / 4) * r, Math.sin(j * Math.PI / 4) * r); } c2.closePath(); c2.fill(); c2.restore(); break;
      case 'firework': {
        if (!p.burst) { p.burst = Array.from({ length: 18 }, (_, j) => [Math.cos(j * 0.35) * rand(1.5, 3), Math.sin(j * 0.35) * rand(1.5, 3)]); }
        const age = p.max - p.life; for (const [bx, by] of p.burst) { c2.beginPath(); c2.arc(p.x + bx * age, p.y + by * age + R.g * age * age * 0.5, p.s, 0, Math.PI * 2); c2.fill(); } break;
      }
      default: c2.beginPath(); c2.arc(p.x, p.y, p.s, 0, Math.PI * 2); c2.fill();
    }
  }
  c2.restore();
}

$('ui').addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-act],[data-skincycle],[data-skin],[data-char],[data-stage],[data-diff],[data-slot],[data-set]');
  if (!t) return;
  const d = t.dataset;
  if (d.go) go(d.go);
  else if (d.act === 'intro') introStart();
  else if (d.act === 'start' || d.act === 'restart') startMatch();
  else if (d.act === 'resume') setPaused(false);
  else if (d.act === 'rand') { SEL.cpu = null; SEL.slot = 'cpu'; SEL.justPicked = false; refreshSelect(); }
  else if (d.act === 'randp1') {                                   // roll a random fighter for Player 1 (re-roll by clicking again)
    const pool = fighterPool(); let i; do { i = pickFrom(pool); } while (pool.length > 1 && i === SEL.p1);
    SEL.p1 = i; SEL.slot = 'cpu'; SEL.justPicked = true; refreshSelect();
  }
  else if (d.skincycle !== undefined) cycleSkin(+d.skincycle);                                    // the skin dots on a card
  else if (d.skin !== undefined) setSkin(+d.skinchar, +d.skin);                                   // a swatch in the detail panel
  else if (d.act === 'randstage') { SEL.randStage = true; refreshStages(); }
  else if (d.act === 'roster') { SET.roster = SET.roster === 'all' ? 'featured' : 'all'; saveSettings(); applyRoster(); }
  else if (d.act === 'hazards') { SEL.hazards = !SEL.hazards; refreshStages(); }
  else if (d.char !== undefined) {                     // pick a fighter; clicking the one you just picked (or the active slot's) cycles its skin
    const i = +d.char;
    if (SEL.slot === 'p1') { if (SEL.p1 === i) return cycleSkin(i); SEL.p1 = i; SEL.slot = 'cpu'; SEL.justPicked = true; }
    else if (SEL.cpu === i || (SEL.justPicked && SEL.p1 === i)) return cycleSkin(i);
    else { SEL.cpu = i; SEL.justPicked = false; }
    refreshSelect();
  }
  else if (d.stage !== undefined) { SEL.randStage = false; SEL.stage = +d.stage; loadStage(SEL.stage); refreshStages(); }
  else if (d.diff !== undefined) { SEL.diff = +d.diff; refreshSetup(); refreshDiffPick(); }
  else if (d.slot) { SEL.slot = d.slot; SEL.justPicked = false; refreshSelect(); }
  else if (d.set) { const def = SETTING_DEFS.find(x => x.key === d.set); SET[d.set] = def.opts[+d.i][1]; saveSettings(); buildSettings(); if (d.set === 'res') sizeCanvas(); if (d.set === 'roster') applyRoster(); }
});
// 3D tilt + a glare highlight that follow the pointer on every fighter tile and stage / difficulty card.
// Pointer events can fire far faster than the display refreshes, so the style writes are coalesced into one per animation frame.
let tiltPending = null;
$('ui').addEventListener('pointermove', e => {
  const el = e.target.closest('.tile,.card'); if (!el) return;
  const first = !tiltPending; tiltPending = { el, x: e.clientX, y: e.clientY };
  if (first) requestAnimationFrame(() => {
    const { el, x, y } = tiltPending; tiltPending = null;
    const r = el.getBoundingClientRect(), px = (x - r.left) / r.width, py = (y - r.top) / r.height;
    el.style.setProperty('--rx', ((0.5 - py) * 16).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((px - 0.5) * 16).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  });
});
$('ui').addEventListener('pointerout', e => {
  const el = e.target.closest('.tile,.card');
  if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
});
// Ripple effect on every clickable surface
$('ui').addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn,.tile,.card,.slot,.mcard'); if (!b) return;
  const r = b.getBoundingClientRect(), sz = Math.max(r.width, r.height) * 2.2, sp = document.createElement('span');
  sp.className = 'ripple'; sp.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${sz}px;height:${sz}px`;
  b.appendChild(sp); setTimeout(() => sp.remove(), 700);
});

/* ---- live previews drawn on the card canvases ---- */
const dummies = CHARS.map(ch => { const d = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2) }; resetFighter(d, 0); return d; });
const POSE_NAMES = ['Idle', 'Running', 'Light attack', 'Smash attack', 'Shielding', 'Hit-stun'];

// Cycle through breathing idle, running, light attack, smash, shield and hit-stun poses
function poseDummy(d, t) {
  const P = Math.floor(t / 90) % 6, lt = t % 90;
  Object.assign(d, { x: 0, y: 0, facing: 1, vx: 0, vy: 0, rot: 0, onGround: true, state: 'free', move: null, sp: null, hitFlash: 0, invuln: 0, sx: 1, sy: 1, shield: 100, chill: 0, percent: 0 });
  if (P === 1) { d.vx = 6; d.runPhase = t * 0.25; }
  else if (P === 2 || P === 3) { d.move = buildMove(d, P === 2 ? 'jab' : 'fsmash'); d.state = 'attack'; d.stateT = lt % (d.move.s + d.move.a + d.move.e + 8); }
  else if (P === 4) { d.state = 'shield'; d.stateT = 20 + lt; }
  else if (P === 5) { d.state = 'hitstun'; d.onGround = false; d.rot = t * 0.15; d.hitFlash = (t >> 3) & 1; d.vx = -3; d.percent = 120; }
  return P;
}

/* Roster portraits are a render-target cache. Every tile canvas is drawn ONCE (full-quality idle portrait) and then left
 * alone: the browser just composites a static bitmap, so 75 tiles cost nothing per frame and scrolling stays smooth.
 * A tile is re-drawn only when its cache key (skin + graphics settings) changes. Only the tiles that matter right now —
 * the hovered fighter and the two picks — animate, and only while they are scrolled into view. The first fill of the
 * cache is spread over several frames (a small time budget per frame) so opening the screen never hitches.          */
const portraitKey = CHARS.map(() => ''), tileVisible = CHARS.map(() => true);
const DET = { i: -1, t0: 0 };                                                       // the big preview's spin-in state
const PORTRAIT_BUDGET_MS = 3;                                                       // max time per frame spent filling the cache
if (typeof IntersectionObserver !== 'undefined') {                                   // which tiles are scrolled into view in the grid
  const io = new IntersectionObserver(es => { for (const e of es) tileVisible[+e.target.dataset.char] = e.isIntersecting; }, { root: $('char-grid'), rootMargin: '80px' });
  charCards.forEach(el => io.observe(el));
}
function renderTile(i, live, t) {
  const ch = CHARS[i], d = dummies[i], c2 = charCtx[i];
  applySkin(d, ch, skinIdx(ch)); const col = d.color;
  ctx = c2; c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, 78, 52);         // 78 × 52 logical px (canvas is 2× for sharpness)
  const g = c2.createRadialGradient(39, 30, 3, 39, 30, 42); g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0));
  c2.fillStyle = g; c2.fillRect(0, 0, 78, 52);
  c2.fillStyle = rgba(col, 0.35); c2.beginPath(); c2.ellipse(39, 47, 14, 3, 0, 0, Math.PI * 2); c2.fill();
  if (live) poseDummy(d, t + i * 30);
  else { poseDummy(d, 30); d.rig = null; d.trail = null; }                          // static portrait: a settled idle pose (springs start at rest)
  c2.save(); c2.translate(39, 46); c2.scale(0.5, 0.5); drawFighter(d); c2.restore();
}
function drawCharPreviews() {
  const t = G.time, live = [SEL.hover, SEL.p1, SEL.cpu].filter(i => i !== null && i !== undefined);
  const gfxKey = '|' + SET.gfx + SET.limbs, t0 = performance.now();
  for (let i = 0; i < CHARS.length; i++) {
    if (charCards[i].classList.contains('off')) continue;                           // hidden by the Featured filter
    if (live.includes(i)) {                                                          // animated tiles: cheap shading, 30 fps is plenty at this size
      if (tileVisible[i] && (t & 1) === 0) { SHADE.lite = true; renderTile(i, true, t); SHADE.lite = false; portraitKey[i] = 'live'; }
      continue;
    }
    const key = skinIdx(CHARS[i]) + gfxKey;
    if (portraitKey[i] === key) continue;                                            // cached: nothing to do
    if (performance.now() - t0 > PORTRAIT_BUDGET_MS && portraitKey[i] !== 'live') continue;   // out of budget this frame (a tile that just stopped animating is always restored)
    renderTile(i, false, t); portraitKey[i] = key;
  }
  drawShowcase(t);
  if ((t & 1) === 1) { drawPlate('p1', SEL.p1, t); drawPlate('cpu', SEL.cpu, t); }
  ctx = mainCtx;
}

/* ---- 3D hero showcase: a glass pedestal under a volumetric spotlight, a real-time floor reflection and a fighter that
 *      idles through several camera angles (slow 3/4 sway, a 180° turn every 8 s, the turntable spin-in on change).
 *      The fighter is drawn ONCE per frame into figBuf; the reflection is a mirrored, faded blit of that same bitmap. ---- */
const figBuf = makeLayer(924, 320), figCtx = figBuf.getContext('2d'), reflBuf = makeLayer(924, 320), reflCtx = reflBuf.getContext('2d');
const DW = 462, DH = 160, PED_Y = 126;                                           // showcase canvas, logical px (2× backing store)
function drawShowcase(t) {
  const i = detailIndex(), ch = CHARS[i], d = dummies[i], dc = d.color, pulse = 0.5 + 0.5 * Math.sin(t * 0.06), cx = DW / 2, c2 = detCtx;
  c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, DW, DH);
  // stage backdrop: skin-tinted bloom + a dark floor with a horizon glow line
  const g = c2.createRadialGradient(cx, 70, 10, cx, 70, 150 + 30 * pulse); g.addColorStop(0, rgba(dc, 0.26)); g.addColorStop(1, rgba(dc, 0));
  c2.fillStyle = g; c2.fillRect(0, 0, DW, DH);
  const fl = c2.createLinearGradient(0, PED_Y - 6, 0, DH); fl.addColorStop(0, 'rgba(10,12,34,0)'); fl.addColorStop(0.25, 'rgba(10,12,34,0.75)'); fl.addColorStop(1, 'rgba(4,5,16,0.95)');
  c2.fillStyle = fl; c2.fillRect(0, PED_Y - 6, DW, DH);
  const hz = c2.createLinearGradient(0, 0, DW, 0); hz.addColorStop(0, rgba(dc, 0)); hz.addColorStop(0.5, rgba(dc, 0.55)); hz.addColorStop(1, rgba(dc, 0));
  c2.fillStyle = hz; c2.fillRect(0, PED_Y - 7, DW, 1.2);
  for (let k = -6; k <= 6; k++) { c2.strokeStyle = rgba(dc, 0.08); c2.lineWidth = 1; c2.beginPath(); c2.moveTo(cx + k * 22, PED_Y - 6); c2.lineTo(cx + k * 70, DH); c2.stroke(); }   // perspective floor grid
  // volumetric spotlight: additive cone with a soft core, plus dust motes drifting through it
  c2.save(); c2.globalCompositeOperation = 'lighter';
  const flick = 0.9 + 0.1 * Math.sin(t * 0.21) * Math.sin(t * 0.07);
  const cone = (hw, a) => { const cg = c2.createLinearGradient(0, -10, 0, PED_Y + 8); cg.addColorStop(0, `rgba(255,255,255,${a})`); cg.addColorStop(0.55, rgba(lighten(dc, 0.5), a * 0.6)); cg.addColorStop(1, rgba(dc, a * 0.25));
    c2.fillStyle = cg; c2.beginPath(); c2.moveTo(cx - 9, -10); c2.lineTo(cx + 9, -10); c2.lineTo(cx + hw, PED_Y + 4); c2.lineTo(cx - hw, PED_Y + 4); c2.closePath(); c2.fill(); };
  cone(88, 0.07 * flick); cone(58, 0.09 * flick); cone(30, 0.08 * flick);
  for (let k = 0; k < 16; k++) {
    const h = Math.sin(k * 91.7) * 0.5 + 0.5, y = ((k * 41 + t * (0.18 + h * 0.2)) % (PED_Y + 10)) - 10, hw = 9 + (y + 10) * 0.6;
    const x = cx + (Math.sin(k * 12.9 + t * 0.01) * 0.85) * hw, a = 0.35 * Math.sin(Math.PI * (y + 10) / (PED_Y + 10)) * (0.6 + 0.4 * Math.sin(t * 0.1 + k));
    c2.fillStyle = `rgba(255,255,255,${Math.max(0, a).toFixed(3)})`; c2.beginPath(); c2.arc(x, y, 0.6 + h * 0.9, 0, TAU); c2.fill();
  }
  c2.restore();
  // pedestal: metallic side band, glass top, glowing rim and a pool of light where the spotlight lands
  const PR = 74, PT = 9, side = c2.createLinearGradient(cx - PR, 0, cx + PR, 0);
  side.addColorStop(0, '#1a1c34'); side.addColorStop(0.3, '#5a5f8a'); side.addColorStop(0.5, '#c8cdf0'); side.addColorStop(0.7, '#4a4f78'); side.addColorStop(1, '#141628');
  c2.fillStyle = side; c2.beginPath(); c2.ellipse(cx, PED_Y + PT, PR, PR * 0.15, 0, 0, Math.PI); c2.lineTo(cx - PR, PED_Y); c2.ellipse(cx, PED_Y, PR, PR * 0.15, 0, Math.PI, 0, true); c2.closePath(); c2.fill();
  c2.strokeStyle = rgba(dc, 0.85); c2.lineWidth = 1.4; c2.beginPath(); c2.ellipse(cx, PED_Y + PT * 0.55, PR, PR * 0.15, 0, 0, Math.PI); c2.stroke();   // neon belt
  const top = c2.createRadialGradient(cx, PED_Y, 4, cx, PED_Y, PR); top.addColorStop(0, 'rgba(255,255,255,0.32)'); top.addColorStop(0.5, rgba(dc, 0.2)); top.addColorStop(1, 'rgba(20,22,50,0.75)');
  c2.fillStyle = top; c2.beginPath(); c2.ellipse(cx, PED_Y, PR, PR * 0.15, 0, 0, TAU); c2.fill();
  c2.save(); c2.shadowColor = dc; c2.shadowBlur = 10; c2.strokeStyle = lighten(dc, 0.3); c2.lineWidth = 1.6; c2.beginPath(); c2.ellipse(cx, PED_Y, PR, PR * 0.15, 0, 0, TAU); c2.stroke(); c2.restore();
  for (let k = 0; k < 3; k++) { const r = ((t * 0.8 + k * 33) % 100) / 100; c2.strokeStyle = rgba(dc, 0.5 * (1 - r)); c2.lineWidth = 1; c2.beginPath(); c2.ellipse(cx, PED_Y, PR * r, PR * 0.15 * r, 0, 0, TAU); c2.stroke(); }
  // camera angle: spin-in on change → slow 3/4 sway → a half turn every 480 frames
  const P = poseDummy(d, t);
  if (i !== DET.i) { DET.i = i; DET.t0 = t; }
  const lt = t - DET.t0, k = clamp(lt / 26, 0, 1), turns = Math.floor(lt / 480) + smooth(clamp((lt % 480 - 440) / 40, 0, 1));
  const ang = (1 - smooth(k)) * TAU + turns * Math.PI + Math.sin(lt * 0.013) * 0.42, turn = Math.cos(ang), pop = 0.85 + 0.15 * smooth(k);
  d.facing = turn < 0 ? -1 : 1;                                                  // the far side of the turn shows the fighter's back (mirror)
  if (k < 1) { const r = 30 + 90 * k; c2.strokeStyle = rgba(dc, 0.6 * (1 - k)); c2.lineWidth = 3; c2.beginPath(); c2.ellipse(cx, PED_Y, r, r * 0.16, 0, 0, TAU); c2.stroke(); }
  // fighter → figBuf once; reflection = the same bitmap mirrored about the pedestal top and faded out
  figCtx.setTransform(1, 0, 0, 1, 0, 0); figCtx.clearRect(0, 0, 924, 320);
  ctx = figCtx; figCtx.setTransform(2, 0, 0, 2, 0, 0); figCtx.translate(cx, PED_Y - 1); figCtx.scale(1.18 * pop * Math.max(0.06, Math.abs(turn)), 1.18 * pop); drawFighter(d);
  reflCtx.setTransform(1, 0, 0, 1, 0, 0); reflCtx.globalCompositeOperation = 'copy'; reflCtx.clearRect(0, 0, 924, 320);
  reflCtx.setTransform(1, 0, 0, -1, 0, PED_Y * 4); reflCtx.drawImage(figBuf, 0, 0); reflCtx.setTransform(1, 0, 0, 1, 0, 0);
  const rf = reflCtx.createLinearGradient(0, PED_Y * 2, 0, PED_Y * 2 + 68); rf.addColorStop(0, 'rgba(0,0,0,0.7)'); rf.addColorStop(0.4, 'rgba(0,0,0,0.3)'); rf.addColorStop(1, 'rgba(0,0,0,0)');
  reflCtx.globalCompositeOperation = 'destination-in'; reflCtx.fillStyle = rf; reflCtx.fillRect(0, 0, 924, 320); reflCtx.globalCompositeOperation = 'source-over';
  c2.drawImage(reflBuf, 0, 0, DW, DH);
  c2.drawImage(figBuf, 0, 0, DW, DH);
  ctx = c2;
  txt(POSE_NAMES[P], 10, DH - 8, 11, '#9aa0d8', 'left', 700);
  txt(fighterClass(ch).toUpperCase() + ' CLASS', DW - 10, DH - 8, 10, rgba(dc, 0.9), 'right', 800);
  drawRadar(ch);
}

/* ---- VS bar nameplate portraits: a live head-and-shoulders crop of each pick (own dummy, so its springs run once) ---- */
const plateCtx = { p1: $('port-p1').getContext('2d'), cpu: $('port-cpu').getContext('2d') }, plateDummy = { p1: null, cpu: null };
function drawPlate(slot, i, t) {
  const c2 = plateCtx[slot]; c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, 56, 56);
  if (i === null || i === undefined) {                                           // random CPU: a pulsing question mark
    ctx = c2; txt('?', 28, 30, 30 + 2 * Math.sin(t * 0.1), '#ffd36e', 'center', 900); ctx = mainCtx; return;
  }
  const ch = CHARS[i];
  let d = plateDummy[slot];
  if (!d || d.ch !== ch) { d = plateDummy[slot] = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2) }; resetFighter(d, 0); }
  applySkin(d, ch, skinIdx(ch)); poseDummy(d, t % 90); d.facing = slot === 'p1' ? 1 : -1;   // breathing-idle slot of the pose cycle, facing the VS mark
  const g = c2.createRadialGradient(28, 22, 2, 28, 28, 34); g.addColorStop(0, rgba(d.color, 0.45)); g.addColorStop(1, rgba(d.color, 0));
  c2.fillStyle = g; c2.fillRect(0, 0, 56, 56);
  SHADE.lite = true; ctx = c2; c2.save(); c2.translate(28, 76 + Math.sin(t * 0.05) * 1.2); c2.scale(0.78, 0.78); drawFighter(d); c2.restore(); SHADE.lite = false;
  ctx = mainCtx;
}

/* ---- stage select: the 35 card previews are a render-target cache (drawn once, within a per-frame time budget). Only the
 *      hovered card animates, with a mouse-driven camera offset so its 4 background layers slide in parallax behind the
 *      platforms; the inspector panel shows the hovered (or picked) stage live at full size with the same parallax. ---- */
const stageKey = STAGES.map(() => ''), PAR = { x: 0, y: 0, sx: 0, sy: 0 }, siCtx = $('si-canvas').getContext('2d');
const STAGE_BUDGET_MS = 4;
window.addEventListener('pointermove', e => { PAR.x = e.clientX / innerWidth - 0.5; PAR.y = e.clientY / innerHeight - 0.5; }, { passive: true });
$('stage-grid').addEventListener('mouseover', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const i = +c.dataset.stage; if (stageHover !== i) { if (stageHover !== null) stageKey[stageHover] = ''; stageHover = i; refreshInspector(); }
});
$('stage-grid').addEventListener('mouseleave', () => { if (stageHover !== null) stageKey[stageHover] = ''; stageHover = null; refreshInspector(); });
function refreshInspector() {
  const i = stageHover !== null ? stageHover : SEL.stage, st = STAGES[i];
  $('sinspect').style.setProperty('--c', st.pal.edge);
  $('si-name').textContent = st.name; $('si-tag').textContent = st.tag; $('si-desc').textContent = st.desc;
  $('si-haz').innerHTML = stageFeatures(st).map(f => { const off = f[3] === true && !SEL.hazards;
    return `<span class="hz${off ? ' off' : ''}" style="--k:${f[2]}"><i>${f[0]}</i>${f[1]}${off ? ' · off' : ''}</span>`; }).join('');
  $('si-map').innerHTML = layoutSVG(st);
}
// Draw one stage (background layers + stage body) into a preview context. dx / dy shift the camera for parallax.
function renderStageTo(c2, st, devW, top, dx, dy) {
  const k = devW / W;
  ctx = c2; ST = st; STAGE = st.main; PLATS = st.plats; BZ = st.bz; G.cam = { x: 640 + dx, y: 330 + dy, z: 1 };
  c2.setTransform(k, 0, 0, k, 0, -k * top); c2.globalAlpha = 1; c2.shadowBlur = 0; c2.setLineDash([]); c2.globalCompositeOperation = 'source-over';
  drawBackground();
  drawStageBody();
}
function drawStagePreviews() {
  const save = { ST, STAGE, PLATS, BZ, cam: G.cam }, t0 = performance.now(), key = SET.gfx + '|' + SET.limbs;
  PAR.sx += (PAR.x - PAR.sx) * 0.12; PAR.sy += (PAR.y - PAR.sy) * 0.12;
  const dx = PAR.sx * 260, dy = PAR.sy * 120;
  for (let i = 0; i < STAGES.length; i++) {
    if (stageCards[i].classList.contains('off')) continue;
    if (i === stageHover) { if ((G.time & 1) === 0) { renderStageTo(stageCtx[i], STAGES[i], 424, 210, dx, dy); stageKey[i] = 'live'; } continue; }
    if (stageKey[i] === key) continue;                                             // cached bitmap: nothing to do
    if (performance.now() - t0 > STAGE_BUDGET_MS) continue;                        // out of budget: finish the cache next frame
    renderStageTo(stageCtx[i], STAGES[i], 424, 210, 0, 0); stageKey[i] = key;
  }
  const si = stageHover !== null ? stageHover : SEL.stage;                         // inspector: the full-size live preview
  if (si !== siShown) { siShown = si; refreshInspector(); }
  renderStageTo(siCtx, STAGES[si], 832, 190, dx, dy);
  ctx = mainCtx; ({ ST, STAGE, PLATS, BZ } = save); G.cam = save.cam;
}

function drawPreviews() {
  if (G.screen === 'scr-select') drawCharPreviews();
  else if (G.screen === 'scr-stage') drawStagePreviews();
  else if (G.screen === 'scr-result') drawVictory();
}
