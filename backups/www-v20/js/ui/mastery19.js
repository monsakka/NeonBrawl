/* NEON BRAWL — v19 FAVORITE FIGHTER + MASTERY.
 *
 *   FAVORITE   star one fighter: the ☆ on the character-select detail card (or Settings → Profile). Only your favorite
 *              earns Mastery XP — from every battle, challenge or minigame you play WITH it (offline or online).
 *   MASTERY    10 levels per fighter; the next level costs 250 + 75 × level XP (6,625 in all — about fifteen battles).
 *              A battle pays for taking part, every % of damage, each KO and the win; challenges pay for their clears.
 *              Progress is kept per fighter, so switching favorites never loses any.
 *   REWARDS    the moment a fighter's Mastery is maxed, three exclusive items unlock automatically:
 *                · a glowing PROFILE PICTURE — a 3D portrait of that fighter in its Mastery skin, rendered once into a
 *                  real image (a DOM <img>-like layer, so it can never clip through another menu) with an animated glow
 *                  ring; it goes straight onto your profile card (pick between earned ones in Settings → Profile);
 *                · its Mastery skin, ASCENDANT (render/models19.js), on that fighter's skin swatches from then on;
 *                · a title for your nameplate: "Pug Master", "Dino Master", "Blaze Master"…
 * Saved in localStorage (neonbrawl.mastery).                                                                          */
'use strict';

const MASTERY = { fav: null, xp: {}, done: [], pfp: '', last: null };
const MASTERY_MAX = 10;
const masteryNeed = n => 250 + 75 * n;                                          // XP from level n − 1 to level n
const MASTERY_TOTAL = Array.from({ length: MASTERY_MAX }, (_, i) => masteryNeed(i + 1)).reduce((a, b) => a + b, 0);
function masteryLevelOf(xp) {
  let l = 0, need = masteryNeed(1); xp = Math.max(0, xp || 0);
  while (l < MASTERY_MAX && xp >= need) { xp -= need; l++; need = masteryNeed(l + 1); }
  return { lvl: l, into: l < MASTERY_MAX ? xp : 0, need: l < MASTERY_MAX ? need : 0 };
}
const masteryXP = id => MASTERY.xp[id] || 0;
const masteryDone = id => MASTERY.done.includes(id);
const masteryPct = id => { if (masteryDone(id)) return 100; const L = masteryLevelOf(masteryXP(id)); return L.need ? Math.round(L.into / L.need * 100) : 100; };
const charById = id => CHARS.find(c => c.id === id);
// titles: a species word where the fighter is an animal, else the fighter's own name ("Blaze Master")
const MASTERY_TITLE = { pug: 'Pug Master', dino: 'Dino Master', panda: 'Panda Master', scarab: 'Scarab Master', hive: 'Hive Master', totem: 'Totem Master' };
const titleCase19 = s => String(s).toLowerCase().replace(/(^|[\s\-'])(\S)/g, (m, a, b) => a + b.toUpperCase());
function masteryTitleOf(id) { const ch = charById(id); return MASTERY_TITLE[id] || (ch ? titleCase19(ch.name) + ' Master' : 'Master'); }
const masteryTitles = () => MASTERY.done.map(masteryTitleOf);
// the Settings → Profile title list: every mastered fighter's title + your favorite's, still to earn
function masteryTitleRows() {
  const rows = MASTERY.done.map(id => [masteryTitleOf(id), true, '']);
  if (MASTERY.fav && !masteryDone(MASTERY.fav)) rows.push([masteryTitleOf(MASTERY.fav), false, 'Max out ' + (charById(MASTERY.fav) || {}).name + '\'s Mastery']);
  return rows;
}

function masteryLoad() {
  try { const s = JSON.parse(localStorage.getItem('neonbrawl.mastery') || 'null'); if (!s) return;
    MASTERY.fav = typeof s.fav === 'string' && charById(s.fav) ? s.fav : null;
    MASTERY.xp = {}; if (s.xp && typeof s.xp === 'object') for (const k of Object.keys(s.xp)) if (charById(k)) MASTERY.xp[k] = Math.max(0, Math.min(MASTERY_TOTAL, Math.floor(+s.xp[k] || 0)));
    MASTERY.done = Array.isArray(s.done) ? s.done.filter(id => charById(id) && masteryXP(id) >= MASTERY_TOTAL) : [];
    MASTERY.pfp = typeof s.pfp === 'string' && masteryDone(s.pfp) ? s.pfp : '';
  } catch (e) { /* storage unavailable */ }
}
function masterySave() { try { localStorage.setItem('neonbrawl.mastery', JSON.stringify({ fav: MASTERY.fav, xp: MASTERY.xp, done: MASTERY.done, pfp: MASTERY.pfp })); } catch (e) { /* storage unavailable */ } }

/* ---------------- earning ---------------- */
// award Mastery XP to fighter `id` (only ever your favorite): lines = [[label, amount]…] → { id, gained, from, to, mastered }
function masteryAward(id, lines) {
  if (!id || id !== MASTERY.fav) return null;
  const gained = Math.max(0, Math.round(lines.reduce((s, l) => s + l[1], 0))), from = masteryLevelOf(masteryXP(id)).lvl;
  MASTERY.xp[id] = Math.min(MASTERY_TOTAL, masteryXP(id) + gained);
  const to = masteryLevelOf(MASTERY.xp[id]).lvl, mastered = to >= MASTERY_MAX && !masteryDone(id);
  if (mastered) MASTERY.done.push(id);
  MASTERY.last = { id, gained, from, to, lines, mastered }; masterySave();
  if (mastered) masteryUnlocked(id);
  else if (to > from) { gameEvent('tierUp', { mastery: id, from, to }); setTimeout(() => passToast('★ ' + charById(id).name + ' · Mastery level ' + to + '!', true), 2000); }
  return MASTERY.last;
}
// the three rewards, all at once
function masteryUnlocked(id) {
  const ch = charById(id), title = masteryTitleOf(id);
  if (!MASTERY.pfp || !masteryDone(MASTERY.pfp)) MASTERY.pfp = id;                // the portrait goes straight onto your profile card
  if (typeof PASS !== 'undefined' && !PASS.equip.title) { PASS.equip.title = title; passSave(); }   // (and the title onto your nameplate, if it has none)
  masterySave(); pfpURL(id);
  gameEvent('tierUp', { mastery: id, mastered: true });
  setTimeout(() => passToast('🏆 ' + ch.name + ' MASTERED! Unlocked: a glowing profile picture · the Ascendant skin · “' + title + '”', true), 1800);
  if (typeof refreshSkinUI === 'function') refreshSkinUI();
  if (typeof profileUI === 'function') profileUI();
}
// a normal battle (vs the CPU or online) — from the local player's stats
function masteryMatchXP() {
  const el = document.getElementById('res-mast'); if (el) { el.classList.remove('show'); el.innerHTML = ''; }
  const me = typeof localFighter === 'function' ? localFighter() : fighters[0]; if (!me || me.cpu || G.training || CHAL.mode) return null;
  if (me.ch.id !== MASTERY.fav) { masteryHint(me.ch); return null; }
  const st = me.st || { dmg: 0, kos: 0 }, won = G.winner === me, lines = [['Battle played', 120], ['Damage dealt · ' + Math.round(st.dmg) + '%', Math.round(st.dmg)]];
  if (st.kos) lines.push(['KOs × ' + st.kos, st.kos * 70]);
  if (won) { lines.push([NET.active ? 'Online victory' : 'Victory', 180 + (G.diff || 0) * 40]); if (me.stocks >= 3) lines.push(['Flawless', 80]); }
  if (G.party) lines.push([G.party.name, 40]);
  const r = masteryAward(me.ch.id, lines); masteryResultPanel(r); return r;
}
// the challenges + minigames (ui/challenges.js chalResult)
const MASTERY_MODE = { volley: 'Volley Brawl', coins: 'Coin Scramble', bowl: 'Brawler Bowling', lava: 'The Floor is Lava' };
function masteryChallengeXP(mode, B) {
  const me = fighters[0]; if (!B || !me || me.cpu || me.ch.id !== MASTERY.fav) return null;
  const lines = [];
  if (mode === 'arcade') lines.push(B.state === 'clear' ? ['Arcade cleared', 900] : B.state === 'won' ? ['Arcade stage won', 220] : ['Arcade run', 60]);
  else if (mode === 'horde') lines.push(['Survive the Horde · ' + B.cleared + ' waves', 80 + B.cleared * 45 + (B.kills || 0) * 4]);
  else if (MASTERY_MODE[mode]) { lines.push([MASTERY_MODE[mode], 140]); if (B.won) lines.push(['Victory', 200]); }
  else if (B.failed) lines.push(['Attempt', 30]);
  else lines.push(['Stage ' + (B.stage || 1) + ' clear', 160 + (B.stage || 1) * 25]);
  const r = masteryAward(me.ch.id, lines);
  if (r && !r.mastered) setTimeout(() => passToast('★ +' + r.gained + ' Mastery XP · ' + me.ch.name + ' Lv ' + r.to + '/' + MASTERY_MAX), 4300);
  return r;
}

/* ---------------- the profile pictures ---------------- */
// a mastered fighter's portrait in its Mastery skin: rendered once (in the menu frame, one per frame) and cached as an image
const PFP = { cache: {}, queue: [] };
function pfpURL(id) { if (PFP.cache[id]) return PFP.cache[id]; if (id && !PFP.queue.includes(id)) PFP.queue.push(id); return ''; }
function pfpSnapshots() {
  const id = PFP.queue.shift(); if (!id || PFP.cache[id]) return; const ch = charById(id); if (!ch || typeof glSnapshot !== 'function') return;
  const d = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill }; resetFighter(d, 0); applySkin(d, ch, MASTERY_SKIN);
  d.rig = null; d.trail = null; poseDummy(d, 30); d.facing = 1; d.percent = 0;
  const sc = ch.scale || 1, col = col3(d.color);
  const img = glSnapshot(176, 176, o => { glViewCamera([10, 66 * sc, 150 * sc], [0, 60 * sc, 0], 0.5, o.aspect, studioEnv(col), 5, 3000);
    collectFighter3D(d, solveRig(d)); glFlush({ fbo: o.fbo, vp: o.vp, shadow: false, sky: studioSky(col) }); });
  if (!img) return;
  try { PFP.cache[id] = img.toDataURL('image/png'); } catch (e) { return; }
  pfpApply();
}
// every element showing a portrait (data-pfpid) picks it up as soon as it is ready
function pfpApply() { document.querySelectorAll('[data-pfpid]').forEach(el => { const u = PFP.cache[el.dataset.pfpid]; if (u) el.style.backgroundImage = `url(${u})`; else if (el.dataset.pfpid) pfpURL(el.dataset.pfpid); }); }
const pfpTag = (id, cls) => { const ch = charById(id); return `<span class="pfp-img ${cls || ''}" data-pfpid="${id}" style="--c:${ch ? ch.color : '#fff'};${PFP.cache[id] ? `background-image:url(${PFP.cache[id]})` : ''}"></span>`; };

/* ---------------- UI ---------------- */
const MR_ICON = { pfp: '◉', skin: '◆', title: '❝' };
// the character-select detail card: the ☆ toggle + this fighter's Mastery bar and the three rewards
function masteryDetailUI(i) {
  const ch = CHARS[i], el = document.getElementById('det-mast'), star = document.getElementById('det-fav'); if (!el || !ch) return;
  const fav = MASTERY.fav === ch.id, L = masteryLevelOf(masteryXP(ch.id)), done = masteryDone(ch.id), pct = masteryPct(ch.id);
  star.textContent = fav ? '★' : '☆'; star.classList.toggle('on', fav);
  star.title = fav ? ch.name + ' is your Favorite Fighter (tap to unstar)' : 'Make ' + ch.name + ' your Favorite Fighter — it earns Mastery XP';
  el.style.setProperty('--c', ch.color); el.classList.toggle('max', done); el.classList.toggle('fav', fav);
  const rw = [['pfp', 'Glowing profile picture'], ['skin', 'Ascendant skin'], ['title', '“' + masteryTitleOf(ch.id) + '”']];
  el.innerHTML = `<span class="mr-lv">${done ? '★ MASTERED' : 'Mastery ' + L.lvl + '/' + MASTERY_MAX}</span><span class="mr-bar"><i style="width:${pct}%"></i></span>` +
    `<span class="mr-rw">${rw.map(([k, t]) => k === 'pfp' && done ? pfpTag(ch.id, 'xs') : `<i class="${k}${done ? ' ok' : ''}" title="${t}${done ? ' — unlocked' : ' — unlocks at Mastery ' + MASTERY_MAX}">${MR_ICON[k]}</i>`).join('')}</span>` +
    `<small>${done ? 'Mastered — glowing PFP, the Ascendant skin and “' + masteryTitleOf(ch.id) + '” unlocked' : fav ? 'Your favorite — battles with ' + ch.name + ' earn Mastery XP' : MASTERY.fav ? 'Star to make ' + ch.name + ' your favorite (progress is kept)' : 'Star a Favorite Fighter to start earning Mastery'}</small>`;
}
// the main-menu profile card: the equipped glowing portrait + your favorite's Mastery
function masteryProfileUI() {
  const av = document.getElementById('pf-avatar'), m = document.getElementById('pf-mast'); if (!av) return;
  const id = MASTERY.pfp && masteryDone(MASTERY.pfp) ? MASTERY.pfp : '';
  av.classList.toggle('pfp', !!id);
  if (id) { av.dataset.pfpid = id; av.textContent = ''; av.style.setProperty('--c', charById(id).color); const u = pfpURL(id); av.style.backgroundImage = u ? `url(${u})` : ''; av.title = masteryTitleOf(id); }
  else { delete av.dataset.pfpid; av.style.backgroundImage = ''; av.title = 'Your fighter'; }
  if (!m) return;
  const f = MASTERY.fav && charById(MASTERY.fav);
  if (!f) { m.className = 'pf-mast none'; m.innerHTML = '☆ Pick a Favorite Fighter · earn Mastery rewards'; return; }
  const L = masteryLevelOf(masteryXP(f.id)), done = masteryDone(f.id);
  m.className = 'pf-mast' + (done ? ' max' : ''); m.style.setProperty('--c', f.color);
  m.innerHTML = `<b>★ ${f.name}</b><span class="mr-bar"><i style="width:${masteryPct(f.id)}%"></i></span><em>${done ? 'MASTERED' : 'Lv ' + L.lvl + '/' + MASTERY_MAX}</em>`;
}
// Settings → Profile: your favorite + its progress and rewards, every fighter you've trained, the profile-picture picker
function masteryTabHTML() {
  const fav = MASTERY.fav && charById(MASTERY.fav), ini = (typeof profileName === 'function' ? profileName() : 'P').charAt(0).toUpperCase();
  let h = `<div class="srow col mast-set"><div class="sl"><b>Favorite Fighter · Mastery</b><small>Star a fighter on the character-select screen (or tap one below). Every battle, challenge and minigame you play with your favorite earns Mastery XP. At Mastery ${MASTERY_MAX} it unlocks a glowing profile picture, its Ascendant skin and a title — automatically.</small></div>`;
  if (fav) { const L = masteryLevelOf(masteryXP(fav.id)), done = masteryDone(fav.id);
    h += `<div class="mast-card${done ? ' max' : ''}" style="--c:${fav.color}">${done ? pfpTag(fav.id, 'lg') : `<span class="pfp-img lg lock"><i>🔒</i></span>`}<div class="mc-txt"><b>★ ${fav.name}</b>` +
      `<span class="mr-bar big"><i style="width:${masteryPct(fav.id)}%"></i></span><small>${done ? 'MASTERED · every reward unlocked' : 'Mastery ' + L.lvl + ' / ' + MASTERY_MAX + ' · ' + L.into.toLocaleString() + ' / ' + L.need.toLocaleString() + ' XP to the next level'}</small>` +
      `<p class="mc-rw"><span class="${done ? 'ok' : ''}">◉ Glowing PFP</span><span class="${done ? 'ok' : ''}">◆ Ascendant skin</span><span class="${done ? 'ok' : ''}">❝ ${masteryTitleOf(fav.id)}</span></p></div></div>`; }
  const trained = CHARS.filter(c => masteryXP(c.id) > 0 || c.id === MASTERY.fav);
  h += `<div class="chip-grid">${trained.map(c => `<button class="tchip${c.id === MASTERY.fav ? ' on' : ''}" data-act="fav-set" data-id="${c.id}" style="--c:${c.color}">${c.id === MASTERY.fav ? '★' : masteryDone(c.id) ? '🏆' : '☆'} ${c.name} · ${masteryDone(c.id) ? 'MASTERED' : 'Lv ' + masteryLevelOf(masteryXP(c.id)).lvl}</button>`).join('')}` +
    `<button class="tchip" data-go="scr-select">Choose a favorite on the roster →</button></div></div>`;
  h += `<div class="srow col"><div class="sl"><b>Profile picture</b><small>Shown on your profile card. Every fighter you master adds its glowing 3D portrait.</small></div><div class="pfp-grid">` +
    `<button class="pfp-pick${!MASTERY.pfp ? ' on' : ''}" data-act="pfp-pick" data-id=""><span class="pfp-ini">${ini}</span><small>Initial</small></button>` +
    MASTERY.done.map(id => `<button class="pfp-pick${MASTERY.pfp === id ? ' on' : ''}" data-act="pfp-pick" data-id="${id}">${pfpTag(id, 'md')}<small>${charById(id).name}</small></button>`).join('') +
    (fav && !masteryDone(fav.id) ? `<button class="pfp-pick lock" disabled title="Max out ${fav.name}'s Mastery"><span class="pfp-img md lock" style="--c:${fav.color}"><i>🔒</i></span><small>${fav.name}</small></button>` : '') + `</div></div>`;
  return h;
}
// the results card: + Mastery XP for your favorite (or a nudge to star the fighter you just played)
function masteryResultPanel(r) {
  const el = document.getElementById('res-mast'); if (!el || !r) return;
  const ch = charById(r.id), L = masteryLevelOf(masteryXP(r.id)), done = masteryDone(r.id);
  el.style.setProperty('--c', ch.color);
  el.innerHTML = `<div class="rm-head">${done ? pfpTag(r.id, 'sm') : ''}<b>+${r.gained.toLocaleString()} MASTERY</b><span>★ ${ch.name} · ${done ? 'MASTERED' : 'Lv ' + L.lvl + '/' + MASTERY_MAX}${r.to > r.from && !r.mastered ? ' <em>LEVEL UP!</em>' : ''}</span></div>` +
    `<span class="mr-bar big"><i style="width:${masteryPct(r.id)}%"></i></span>` +
    (r.mastered ? `<p class="rm-unlock">🏆 ${ch.name} MASTERED — unlocked <b>a glowing profile picture</b> · <b>the Ascendant skin</b> · <b>“${masteryTitleOf(r.id)}”</b></p>` : '');
  el.classList.add('show');
}
function masteryHint(ch) {
  const el = document.getElementById('res-mast'); if (!el || masteryDone(ch.id)) return;
  el.style.setProperty('--c', ch.color);
  el.innerHTML = `<p class="rm-hint">${MASTERY.fav ? '☆ Only your Favorite Fighter (' + charById(MASTERY.fav).name + ') earns Mastery XP.' : '☆ Star a Favorite Fighter on the character-select screen to earn Mastery XP.'} <button class="btn small" data-act="fav-set" data-id="${ch.id}">★ Make ${ch.name} my favorite</button></p>`;
  el.classList.add('show', 'hint');
}
function masterySetFav(id) {
  MASTERY.fav = id && charById(id) ? id : null; masterySave(); sfx(MASTERY.fav ? 'select' : 'click');
  if (MASTERY.fav) { const n = charById(id).name; passToast('★ ' + n + ' is your Favorite Fighter — battles with ' + n + ' earn Mastery XP'); }
  if (typeof refreshSelect === 'function') refreshSelect();
  if (G.screen === 'scr-settings' && typeof buildSettings === 'function') buildSettings();
  if (typeof profileUI === 'function') profileUI();
  const rm = document.getElementById('res-mast'); if (rm && rm.classList.contains('hint') && G.screen === 'scr-result') { rm.innerHTML = `<p class="rm-hint">★ ${charById(id).name} is your Favorite Fighter — your next battle with it earns Mastery XP.</p>`; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const A = b.dataset.act;
  if (A === 'fav-toggle') { const ch = CHARS[typeof detailIndex === 'function' ? detailIndex() : SEL.p1]; masterySetFav(MASTERY.fav === ch.id ? null : ch.id); }
  else if (A === 'fav-set') masterySetFav(b.dataset.id || null);
  else if (A === 'pfp-pick') { MASTERY.pfp = b.dataset.id && masteryDone(b.dataset.id) ? b.dataset.id : ''; masterySave(); if (typeof buildSettings === 'function') buildSettings(); if (typeof profileUI === 'function') profileUI(); sfx('click'); }
});

masteryLoad();
for (const id of MASTERY.done) pfpURL(id);                                       // (the portraits render in the first menu frames)
if (typeof profileUI === 'function') profileUI();
