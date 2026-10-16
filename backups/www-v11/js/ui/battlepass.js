/* NEON BRAWL — The "Neon Tier" Battle Pass: 50 tiers of local progression (no purchases, no servers).
 *
 * XP is earned by playing: finishing a match, every % of damage dealt, each KO, winning (more for a flawless win),
 * clearing Arcade rungs and the whole ladder, and clearing Break the Targets / Board the Platforms stages (a first
 * clear or a new record pays a bonus). The first win of each day doubles its XP. Everything is saved in localStorage
 * (neonbrawl.pass), so progress survives refreshes and restarts.
 *
 * Every tier unlocks a reward:
 *   skins    4 geometric 3D skins for every fighter (data/skins.js · render/fighter3d.js passSkin3D)
 *   sparks   6 hit-spark styles for your own hits (star bursts, voxels, sakura petals, forked lightning, crystal
 *            shards, a rainbow nova)
 *   themes   6 UI colour themes for the menus and HUD glass
 *   plates   7 3D nameplate borders (render/emotes3d.js plate3D)
 *   emojis   4 extra holographic 3D emojis (game/emotes.js)
 *   titles   the line under your name on your nameplate
 * The pass screen shows the whole track, a live 3D preview of the selected reward and your loadout.             */
'use strict';

const PASS_TIERS = 50;
const passTierXP = n => 600 + n * 20;                                           // XP from tier n-1 to tier n (55 500 for the whole pass)
const PASS_SPARKS = { classic: 'Classic Impact', stars: 'Star Burst', pixel: 'Voxel Pop', sakura: 'Sakura Storm', lightning: 'Forked Lightning', shards: 'Crystal Shatter', nova: 'Rainbow Nova' };
const PASS_THEMES = { neon: ['Neon Violet', '#6d4dff', '#22e6ff', '#ff4fd8'], sunset: ['Synth Sunset', '#ff6a3d', '#ffcf3a', '#ff3d8a'], aqua: ['Deep Aqua', '#00b8c4', '#7affd8', '#3d8aff'],
  sakura: ['Sakura Bloom', '#ff5fa8', '#ffc6e0', '#b06bff'], gold: ['Royal Gold', '#c8920f', '#ffe08a', '#fff4c0'], void: ['Crimson Void', '#d0142c', '#ff6a3d', '#ffb0c0'], aurora: ['Aurora', '#18d890', '#7a5cff', '#22e6ff'] };
const PASS_PLATES = { basic: 'Smoked Glass', neon: 'Neon Rail', chevron: 'Gold Chevrons', circuit: 'Circuit Trace', crystal: 'Crystal Crest', flame: 'Flame Crown', halo: 'Halo Ring', legend: 'Legendary Frame' };
// the track: [tier, type, value]
const PASS_REWARDS = [
  [1, 'title', 'Rookie'], [2, 'plate', 'neon'], [3, 'spark', 'stars'], [4, 'emoji', 'heart'], [5, 'theme', 'sunset'], [6, 'plate', 'chevron'], [7, 'title', 'Brawler'], [8, 'spark', 'pixel'],
  [9, 'title', 'Combo Artist'], [10, 'skin', 3], [11, 'title', 'Ledge Lord'], [12, 'theme', 'aqua'], [13, 'title', 'Parry God'], [14, 'plate', 'circuit'], [15, 'spark', 'sakura'],
  [16, 'emoji', 'stareyes'], [17, 'title', 'Smash Star'], [18, 'title', 'Neon Knight'], [19, 'plate', 'crystal'], [20, 'theme', 'sakura'], [21, 'title', 'Untouchable'], [22, 'skin', 4],
  [23, 'title', 'Meteor Spiker'], [24, 'spark', 'lightning'], [25, 'title', 'Arena Ace'], [26, 'title', 'Blast Zone Boss'], [27, 'plate', 'flame'], [28, 'emoji', 'crown'], [29, 'title', 'Ultimate Master'],
  [30, 'theme', 'gold'], [31, 'spark', 'shards'], [32, 'title', 'Nebula Walker'], [33, 'title', 'Holo Hero'], [34, 'title', 'Champion'], [35, 'skin', 5], [36, 'title', 'Grandmaster'],
  [37, 'title', 'Starbreaker'], [38, 'plate', 'halo'], [39, 'title', 'Mythic'], [40, 'theme', 'void'], [41, 'title', 'Unstoppable'], [42, 'title', 'Supernova'], [43, 'spark', 'nova'],
  [44, 'emoji', 'trophy'], [45, 'title', 'Immortal'], [46, 'theme', 'aurora'], [47, 'title', 'Neon Deity'], [48, 'plate', 'legend'], [49, 'title', 'Neon Legend'], [50, 'skin', 6]
];
const passKey = r => r[1] === 'skin' ? 'skin' + r[2] : r[1] + ':' + r[2];
const PASS_TYPE = { skin: ['3D Skin', 4, '◆'], spark: ['Hit Spark', 2, '✸'], theme: ['UI Theme', 3, '◐'], plate: ['Nameplate', 2, '▭'], emoji: ['3D Emoji', 3, ''], title: ['Title', 1, '❝'] };   // label · rarity · icon
const RARITY = ['', 'common', 'rare', 'epic', 'legendary'];
function rewardName(r) {
  switch (r[1]) { case 'skin': return skinOf(CHARS[0], r[2]).name + ' skin'; case 'spark': return PASS_SPARKS[r[2]]; case 'theme': return PASS_THEMES[r[2]][0];
    case 'plate': return PASS_PLATES[r[2]]; case 'emoji': return (EMOJIS.find(e => e.id === r[2]) || {}).name; case 'title': return '“' + r[2] + '”'; }
  return '';
}
function rewardDesc(r) {
  switch (r[1]) {
    case 'skin': return { 3: 'Every fighter grows faceted crystal clusters on the shoulders, spine and crown, with a ring of floating shards.', 4: 'Chrome armour for every fighter: a chest plate with a glowing core, pauldrons, piston gauntlets and a jetpack that fires in the air.',
      5: 'A night-sky body for every fighter: a starry halo, two orbit rings and a glowing constellation across the chest.', 6: 'The final reward. A hologram body crowned in light, with wings of light and rising aura flames.' }[r[2]];
    case 'spark': return 'Your hits explode in ' + PASS_SPARKS[r[2]].toLowerCase() + ' effects, on top of the normal impact.';
    case 'theme': return 'Recolours the menus, buttons and glass panels.';
    case 'plate': return 'A new 3D border for the nameplate floating over your fighter.';
    case 'emoji': return 'A new holographic 3D emoji to pop over your head mid-match (number keys or the emoji wheel).';
    case 'title': return 'Shown under your name on your 3D nameplate.';
  }
  return '';
}

/* ---------------- state (localStorage) ---------------- */
const PASS = { xp: 0, seen: 0, equip: { spark: 'classic', theme: 'neon', plate: 'basic', title: '' }, day: '', matches: 0, wins: 0, sel: 1, last: null };
function passLoad() { try { const s = JSON.parse(localStorage.getItem('neonbrawl.pass') || 'null'); if (s) { Object.assign(PASS, s); PASS.equip = Object.assign({ spark: 'classic', theme: 'neon', plate: 'basic', title: '' }, s.equip); } } catch (e) { /* storage unavailable */ } }
function passSave() { try { localStorage.setItem('neonbrawl.pass', JSON.stringify({ xp: PASS.xp, seen: PASS.seen, equip: PASS.equip, day: PASS.day, matches: PASS.matches, wins: PASS.wins })); } catch (e) { /* storage unavailable */ } }
// tier reached for an XP total (0 … 50) and the progress into the next tier
function passTierOf(xp) { let t = 0, need = passTierXP(1); while (t < PASS_TIERS && xp >= need) { xp -= need; t++; need = passTierXP(t + 1); } return { tier: t, into: xp, need: t < PASS_TIERS ? need : 0 }; }
const passTier = () => passTierOf(PASS.xp).tier;
function passOwns(key) { const r = PASS_REWARDS.find(q => passKey(q) === key); return !!r && r[0] <= passTier(); }
const passTitle = () => PASS.equip.title || '';
const passPlate = () => PASS.equip.plate || 'basic';
function applyUITheme() { const th = PASS_THEMES[PASS.equip.theme] ? PASS.equip.theme : 'neon', T = PASS_THEMES[th], w = document.getElementById('wrap');
  w.dataset.uitheme = th; w.style.setProperty('--acc1', T[1]); w.style.setProperty('--acc2', T[2]); w.style.setProperty('--acc3', T[3]); }

/* ---------------- earning XP ---------------- */
// award XP: lines = [[label, amount]…]; returns { gained, from, to, unlocked: [rewards] }
function passAward(lines) {
  const gained = Math.round(lines.reduce((s, l) => s + l[1], 0)), from = passTier();
  PASS.xp = Math.min(PASS.xp + gained, passTotalXP()); const to = passTier();
  const unlocked = PASS_REWARDS.filter(r => r[0] > from && r[0] <= to);
  PASS.last = { gained, from, to, lines, unlocked }; passSave();
  if (to > from) gameEvent('tierUp', { from, to });
  return PASS.last;
}
const passTotalXP = () => { let s = 0; for (let n = 1; n <= PASS_TIERS; n++) s += passTierXP(n); return s; };
const today = () => new Date().toISOString().slice(0, 10);
// a normal match (vs the CPU or online) has just ended: score it from the local player's match stats
function passMatchXP() {
  const me = localFighter(); if (!me || me.cpu || G.training || CHAL.mode) return null;
  const o = otherOf(me), st = me.st || { dmg: 0, kos: 0 }, won = G.winner === me, lines = [['Match played', 150], ['Damage dealt · ' + Math.round(st.dmg) + '%', st.dmg * 1.5]];
  if (st.kos) lines.push(['KOs × ' + st.kos, st.kos * 60]);
  if (won) { lines.push(['Victory', 250 + (G.diff || 0) * 60]); if (me.stocks >= 3) lines.push(['Flawless', 150]); }
  if (won && PASS.day !== today()) { PASS.day = today(); lines.push(['First win of the day', 400]); }
  PASS.matches++; if (won) PASS.wins++; void o;
  const res = passAward(lines); passResultPanel(res); return res;
}
// the challenge modes (ui/challenges.js chalResult)
function passChallengeXP(mode, B) {
  if (!B || fighters[0].cpu) return null;
  const lines = [];
  if (mode === 'arcade') { if (B.state === 'clear') lines.push(['Arcade cleared!', 1500]); else if (B.state === 'won') lines.push(['Arcade stage ' + (B.idx + 1), 220 + B.idx * 40]); else lines.push(['Arcade run', 80]); }
  else if (B.failed) lines.push(['Attempt', 60]);
  else { lines.push([(mode === 'btt' ? 'Targets' : 'Platforms') + ' · stage ' + B.stage + ' clear', 200 + B.stage * 60]); if (B.record) lines.push([B.prev ? 'New record' : 'First clear', B.prev ? 120 : 250]); }
  const res = passAward(lines); passToast(`+${res.gained} XP` + (res.to > res.from ? ` · TIER ${res.to}!` : '') + (res.unlocked.length ? ' · Unlocked: ' + res.unlocked.map(rewardName).join(', ') : ''), res.to > res.from);
  return res;
}

/* ---------------- hit-spark styles (presentation: your own hits only) ---------------- */
GAME_EVENT_LISTENERS.push((type, d) => {
  if (type !== 'hit' || !d.att || d.att !== localFighter() || d.att.cpu) return;
  const st = PASS.equip.spark; if (!st || st === 'classic') return;
  const x = d.x, y = d.y, kb = d.kb || 8, n = 5 + Math.min(10, Math.round(kb * 0.5)), col = d.att.color;
  switch (st) {
    case 'stars': for (let i = 0; i < 3; i++) starFx(x + frand(-18, 18), y + frand(-18, 18), i % 2 ? '#ffd23a' : '#ffffff', 12 + kb); burst(x, y, '#ffe680', n, 9, 18, 'dot'); break;
    case 'pixel': burst(x, y, col, n * 2, 10, 24, 'pixel'); burst(x, y, '#ffffff', n, 7, 16, 'pixel'); break;
    case 'sakura': for (let i = 0; i < n * 2; i++) { const a = frand(0, TAU), s = frand(2, 7); pushFx({ type: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 40, max: 40, color: i % 3 ? '#ffb3d1' : '#ffffff', size: frand(2, 3.5), drag: 0.93, g: 0.06 }); } break;
    case 'lightning': for (let i = 0; i < 3; i++) boltFx(x, y, i ? '#9ad8ff' : '#ffffff'); ring(x, y, '#cfe8ff', 6, 8, 12, 3); break;
    case 'shards': shatter(x, y, '#c8f6ff', 14); ring(x, y, '#ffffff', 4, 6, 10, 2); break;
    case 'nova': for (let i = 0; i < 6; i++) ring(x, y, `hsl(${i * 60},100%,65%)`, 4 + i * 2, 6 + i, 18 + i * 2, 3); starFx(x, y, '#ffffff', 30 + kb); break;
  }
});

/* ---------------- UI ---------------- */
let passToastT = 0;
function passToast(msg, big) {
  const el = document.getElementById('pass-toast'); if (!el) return;
  el.textContent = msg; el.classList.toggle('big', !!big); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(passToastT); passToastT = setTimeout(() => el.classList.remove('show'), big ? 4200 : 2600);
}
// the "+XP" panel on the results screen
function passResultPanel(res) {
  const el = document.getElementById('res-pass'); if (!el || !res) return;
  const T = passTierOf(PASS.xp), pct = T.need ? Math.round(T.into / T.need * 100) : 100;
  el.innerHTML = `<div class="rp-head"><b>+${res.gained.toLocaleString()} XP</b><span>NEON TIER ${T.tier}${res.to > res.from ? ' <em>TIER UP!</em>' : ''}</span></div>` +
    `<div class="bp-bar"><i style="width:${pct}%"></i></div>` +
    `<ul class="rp-lines">${res.lines.map(l => `<li><span>${l[0]}</span><b>+${Math.round(l[1])}</b></li>`).join('')}</ul>` +
    (res.unlocked.length ? `<p class="rp-unlock">Unlocked: ${res.unlocked.map(r => `<b>${rewardName(r)}</b>`).join(' · ')}</p>` : '');
  el.classList.add('show');
}
function rewardIcon(r) {
  if (r[1] === 'emoji') return (EMOJIS.find(e => e.id === r[2]) || {}).glyph || '?';
  if (r[1] === 'theme') { const T = PASS_THEMES[r[2]]; return `<i class="bp-sw" style="background:conic-gradient(${T[1]},${T[2]},${T[3]},${T[1]})"></i>`; }
  return PASS_TYPE[r[1]][2];
}
const isEquipped = r => r[1] === 'skin' ? false : r[1] === 'emoji' ? false : PASS.equip[r[1]] === r[2];
function buildPass() {
  const T = passTierOf(PASS.xp), tier = T.tier;
  document.getElementById('bp-tier').textContent = tier;
  document.getElementById('bp-xp').textContent = T.need ? `${Math.floor(T.into).toLocaleString()} / ${T.need.toLocaleString()} XP` : 'PASS COMPLETE';
  document.getElementById('bp-fill').style.width = (T.need ? T.into / T.need * 100 : 100) + '%';
  document.getElementById('bp-stats').innerHTML = `<span><small>Total XP</small><b>${Math.floor(PASS.xp).toLocaleString()}</b></span><span><small>Matches</small><b>${PASS.matches}</b></span><span><small>Wins</small><b>${PASS.wins}</b></span>`;
  const next = PASS_REWARDS.find(r => r[0] > tier);
  document.getElementById('bp-next').innerHTML = next ? `<small>Next reward · tier ${next[0]}</small><b>${rewardIcon(next)} ${rewardName(next)}</b>` : '<small>Every reward unlocked</small><b>★ Neon Legend</b>';
  document.getElementById('bp-track').innerHTML = PASS_REWARDS.map(r => { const own = r[0] <= tier, ty = PASS_TYPE[r[1]], fresh = own && r[0] > PASS.seen;
    return `<button class="bp-card ${RARITY[ty[1]]}${own ? ' own' : ' lock'}${PASS.sel === r[0] ? ' sel' : ''}${isEquipped(r) ? ' eq' : ''}${fresh ? ' new' : ''}${r[0] === tier ? ' cur' : ''}" data-act="bp-pick" data-tier="${r[0]}">` +
      `<span class="bp-n">${r[0]}</span><span class="bp-ico">${rewardIcon(r)}</span><b>${rewardName(r)}</b><small>${ty[0]}</small>${own ? '' : '<i class="bp-lk">🔒</i>'}</button>`; }).join('');
  passDetail();
  passLoadout();
}
function passDetail() {
  const r = PASS_REWARDS.find(q => q[0] === PASS.sel) || PASS_REWARDS[0], own = r[0] <= passTier(), ty = PASS_TYPE[r[1]];
  const el = document.getElementById('bp-detail'); el.className = 'bp-detail ' + RARITY[ty[1]];   // (not a .panel: no glass blur over the 3D preview)
  document.getElementById('bp-dname').innerHTML = `<span class="bp-rar">${RARITY[ty[1]].toUpperCase()} · ${ty[0].toUpperCase()} · TIER ${r[0]}</span>${rewardName(r)}`;
  document.getElementById('bp-ddesc').textContent = rewardDesc(r);
  const b = document.getElementById('bp-equip');
  if (!own) { b.textContent = '🔒 Reach tier ' + r[0]; b.disabled = true; b.classList.remove('primary'); }
  else if (r[1] === 'skin') { b.textContent = 'Wear it in character select'; b.disabled = false; b.classList.add('primary'); b.dataset.mode = 'skin'; }
  else if (r[1] === 'emoji') { b.textContent = 'In your emoji wheel ✓'; b.disabled = true; b.classList.remove('primary'); }
  else if (isEquipped(r)) { b.textContent = r[1] === 'title' ? 'Remove title' : 'Equipped ✓'; b.disabled = r[1] !== 'title'; b.classList.remove('primary'); b.dataset.mode = 'unequip'; }
  else { b.textContent = 'Equip'; b.disabled = false; b.classList.add('primary'); b.dataset.mode = 'equip'; }
}
function passLoadout() {
  const rows = [['spark', 'Hit spark', PASS_SPARKS[PASS.equip.spark]], ['theme', 'UI theme', PASS_THEMES[PASS.equip.theme][0]], ['plate', 'Nameplate', PASS_PLATES[PASS.equip.plate]], ['title', 'Title', PASS.equip.title || '—']];
  document.getElementById('bp-load').innerHTML = rows.map(([k, l, v]) => `<button class="bp-lrow" data-act="bp-cycle" data-k="${k}"><small>${l}</small><b>${v}</b><i>⟳</i></button>`).join('') +
    `<div class="bp-emo"><small>Emojis · keys 1-8</small><div>${EMOJIS.map((e, i) => `<span class="${emojiUnlocked(i) ? '' : 'lk'}" title="${e.name}${e.tier ? ' · tier ' + e.tier : ''}">${e.glyph}<u>${i + 1}</u></span>`).join('')}</div></div>`;
}
// cycle a loadout slot through everything owned of that type (+ the default)
function passCycle(k) {
  const own = [k === 'spark' ? 'classic' : k === 'theme' ? 'neon' : k === 'plate' ? 'basic' : ''].concat(PASS_REWARDS.filter(r => r[1] === k && r[0] <= passTier()).map(r => r[2]));
  const i = own.indexOf(PASS.equip[k]); PASS.equip[k] = own[(i + 1) % own.length]; passSave(); if (k === 'theme') applyUITheme(); buildPass();
}
function passEquip() {
  const r = PASS_REWARDS.find(q => q[0] === PASS.sel); if (!r || r[0] > passTier()) return;
  const b = document.getElementById('bp-equip');
  if (r[1] === 'skin') { const ch = CHARS[SEL.p1]; SEL.skins[ch.id] = r[2]; saveSkins(); go('scr-select'); return; }
  if (b.dataset.mode === 'unequip') PASS.equip.title = ''; else PASS.equip[r[1]] = r[2];
  passSave(); if (r[1] === 'theme') applyUITheme(); buildPass(); sfx('click');
}
function showPass() {
  const T = passTier(); if (!PASS_REWARDS.some(r => r[0] === PASS.sel)) PASS.sel = 1;
  if (PASS.seen < T) { const first = PASS_REWARDS.find(r => r[0] > PASS.seen && r[0] <= T); if (first) PASS.sel = first[0]; }
  buildPass(); PASS.seen = T; passSave();
  requestAnimationFrame(() => { const c = document.querySelector('.bp-card.sel'); if (c) c.scrollIntoView({ block: 'nearest', inline: 'center' }); });
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act^="bp-"]'); if (!t) return;
  if (t.dataset.act === 'bp-pick') { PASS.sel = +t.dataset.tier; document.querySelectorAll('.bp-card').forEach(c => c.classList.toggle('sel', +c.dataset.tier === PASS.sel)); passDetail(); sfx('click'); }
  else if (t.dataset.act === 'bp-cycle') { passCycle(t.dataset.k); sfx('click'); }
  else if (t.dataset.act === 'bp-equip') passEquip();
});
// main-menu card subtitle
function passMenuLine() { const el = document.getElementById('mc-pass'); if (!el) return; const T = passTierOf(PASS.xp); el.textContent = `Neon Tier ${T.tier} / ${PASS_TIERS}` + (T.need ? ` · ${Math.round(T.into / T.need * 100)}% to tier ${T.tier + 1}` : ' · complete!'); }

/* ---------------- the live 3D preview of the selected reward (inside #bp-view) ---------------- */
const PASSV = { store: {} };
function passPreview3D() {
  const w = domViewport(document.getElementById('bp-view')); if (!w) return;
  const r = PASS_REWARDS.find(q => q[0] === PASS.sel) || PASS_REWARDS[0], t = G.time, ch = CHARS[SEL.p1], col = col3(skinOf(ch, 0).color);
  const far = r[1] === 'plate' || r[1] === 'title' || r[1] === 'theme';                       // (nameplates need a wider shot than a fighter)
  glViewCamera(far ? [0, 70, 330] : [0, 60, 230], far ? [0, 50, 0] : [0, 46, 0], 0.5, w.aspect, studioEnv(col), 10, 3000, true);
  const ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -10, 0, 60, 10, 60); ped.col = [0.08, 0.09, 0.18]; ped.spec = 1; ped.shin = 90; ped.metal = 0.6; ped.outline = 1.2; ped.shadow = false;
  BAT.glow.add(BAT.T.ring, xf(SM, 0, -0.5, 0, 60, 4, 60), col[0], col[1], col[2], 1.2);
  const fighterOn = (skin, extra) => { const d = dummyFor(PASSV.store, 'f', ch, skin); poseDummy(d, (t % 90)); d.facing = 1; d.x = 0; d.y = 0; d.percent = 0; if (extra) extra(d);
    const n0 = GL3D.n; collectFighter3D(d, solveRig(d)); const Rm = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, Math.sin(t * 0.012) * 0.6), tmp = new Float32Array(16);
    for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, Rm, it.m); it.m.set(tmp); it.shadow = false; } return d; };
  switch (r[1]) {
    case 'skin': fighterOn(r[2]); break;
    case 'emoji': emoji3D(r[2], 0, -60, 0, 30, t % 600); break;
    case 'plate': { const s = plateSlot(ch.name, passTitle() || 'PLAYER 1', skinOf(ch, 0).color); plate3D(r[2], 0, -62, 0, Math.max(84, s.w / 512 * 160 + 26), 44, col, t);
      if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; } glSprite(NP.tex, 0, 62, 3.4, 160, 40, s.uv, [1, 1, 1, 1]); break; }
    case 'spark': { fighterOn(skinIdx(ch)); const u = (t % 70) / 70, x = 26, y = -46;
      ringG(x, y, 0, 6 + u * 40, 3, [1, 1, 1], 1 - u, 0, 0); bG('sph', x, y, 0, 12 * (1 - u), 12 * (1 - u), 12 * (1 - u), col, 1.5 * (1 - u));
      passSparkDemo(r[2], x, y, u); break; }
    case 'theme': { const T = PASS_THEMES[r[2]]; [T[1], T[2], T[3]].forEach((h, i) => { const c = col3(h), a = t * 0.02 + i * TAU / 3; bL('sph', Math.cos(a) * 46, 40 + Math.sin(a * 2) * 6, Math.sin(a) * 46, 16, 16, 16, c, 0.5); bG('sph', Math.cos(a) * 46, 40, Math.sin(a) * 46, 30, 30, 30, c, 0.35); }); break; }
    case 'title': { const s = plateSlot(ch.name, r[2].toUpperCase(), skinOf(ch, 0).color); plate3D(passPlate(), 0, -62, 0, Math.max(84, s.w / 512 * 160 + 26), 44, col, t);
      if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; } glSprite(NP.tex, 0, 62, 3.4, 160, 40, s.uv, [1, 1, 1, 1]); break; }
  }
  glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
}
const hue3 = h => { const f = n => { const k = (n + h / 30) % 12; return 0.65 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };   // hue → bright rgb
// a looping 3D demo of a spark style in the preview window (game coords: y down)
function passSparkDemo(st, x, y, u) {
  const k = 1 - u, R = 10 + u * 70;
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.3, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
    switch (st) {
      case 'stars': bL('star', px, py, 8, 6 * k + 1, 6 * k + 1, 3, i % 2 ? [1, 0.85, 0.2] : [1, 1, 1], 0.8, 0, a + u * 4); break;
      case 'pixel': bF('box', px, py, 8, 5 * k + 1, 5 * k + 1, 5 * k + 1, i % 2 ? [0.4, 1, 1] : [1, 1, 1], 1, u * 5, u * 3); break;
      case 'sakura': bF('sph', px, py + u * u * 30, 8, 4, 2.2, 1.2, [1, 0.7, 0.85], 1, u * 6 + i, u * 4); break;
      case 'lightning': if (i % 3 === 0) sG('tube', x, y, 8, px, py, 8, 1.6, [0.7, 0.9, 1], 1.3 * k); break;
      case 'shards': bL('octa', px, py, 8, 6 * k + 1, 3, 2, [0.8, 1, 1], 0.4, a, u * 6); break;
      case 'nova': ringG(x, y, 8, R * (0.4 + i * 0.06), 2, hue3(i * 36), 0.8 * k, 0, 0); break;
      default: bF('cone', px, py, 8, 3, 6 * k + 1, 3, [1, 1, 1], 1, 0, -a + Math.PI / 2);
    }
  }
}

passLoad(); applyUITheme();
