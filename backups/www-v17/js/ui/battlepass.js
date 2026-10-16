/* NEON BRAWL — The "Neon Tier" Battle Pass: 250 tiers of local progression (no purchases, no servers).
 *
 * XP is earned by playing: finishing a match, every % of damage dealt, each KO, winning (more for a flawless win),
 * clearing Arcade rungs and the whole ladder, Break the Targets / Board the Platforms stages, Survive the Horde waves and
 * the monthly minigames. The first win of each day pays a bonus. Everything is saved in localStorage (neonbrawl.pass).
 *
 * v16: the 50-tier track was rebuilt into 250 tiers (a reward on every tier, rarity rising tier by tier):
 *   skins    the 4 geometric 3D skins for every fighter — milestones at tiers 50, 100, 175 and 250
 *   titles   115 titles for your nameplate ([Title] [Username]) — the 23 originals + 92 new
 *   ko       40 custom KO explosions (render/rewards16.js): 10 effects × 4 palettes
 *   trail    40 neon attack trails (render/rewards16.js): 10 styles × 4 palettes
 *   plates   23 3D nameplate borders (the 7 originals + 16 new) · emojis: 16 holographic emojis (4 + 12 new)
 *   sparks   6 hit-spark styles · themes: 6 UI colour themes
 * The track is a scrolling glass grid; every skin, emoji, nameplate, KO explosion and trail tile is a live 3D preview. */
'use strict';

const PASS_TIERS = 250;
const passTierXP = n => 260 + n * 3;                                            // XP from tier n-1 to tier n (159 125 for the whole pass)
const PASS_SPARKS = { classic: 'Classic Impact', stars: 'Star Burst', pixel: 'Voxel Pop', sakura: 'Sakura Storm', lightning: 'Forked Lightning', shards: 'Crystal Shatter', nova: 'Rainbow Nova' };
const PASS_THEMES = { neon: ['Neon Violet', '#6d4dff', '#22e6ff', '#ff4fd8'], sunset: ['Synth Sunset', '#ff6a3d', '#ffcf3a', '#ff3d8a'], aqua: ['Deep Aqua', '#00b8c4', '#7affd8', '#3d8aff'],
  sakura: ['Sakura Bloom', '#ff5fa8', '#ffc6e0', '#b06bff'], gold: ['Royal Gold', '#c8920f', '#ffe08a', '#fff4c0'], void: ['Crimson Void', '#d0142c', '#ff6a3d', '#ffb0c0'], aurora: ['Aurora', '#18d890', '#7a5cff', '#22e6ff'] };
const PASS_PLATES = Object.assign({ basic: 'Smoked Glass', neon: 'Neon Rail', chevron: 'Gold Chevrons', circuit: 'Circuit Trace', crystal: 'Crystal Crest', flame: 'Flame Crown', halo: 'Halo Ring', legend: 'Legendary Frame' }, PLATE16);
const PASS_KOS = Object.assign({ classic: 'Classic Blast' }, ...Object.keys(RW_PAL).flatMap(p => Object.keys(KO_SHAPES).map(s => ({ [s + '-' + p]: KO_SHAPES[s] + ' · ' + RW_PAL[p][0] }))));
const PASS_TRAILS = Object.assign({ none: 'No trail' }, ...Object.keys(RW_PAL).flatMap(p => Object.keys(TRAIL_SHAPES).map(s => ({ [s + '-' + p]: TRAIL_SHAPES[s] + ' Trail · ' + RW_PAL[p][0] }))));
// ---- the track: [tier, type, value], built deterministically ----
const PASS_REWARDS = (() => {
  const early = ['Rookie', 'Brawler', 'Combo Artist', 'Ledge Lord', 'Parry God', 'Smash Star', 'Neon Knight'];
  const late = ['Untouchable', 'Meteor Spiker', 'Arena Ace', 'Blast Zone Boss', 'Ultimate Master', 'Nebula Walker', 'Holo Hero', 'Champion', 'Grandmaster', 'Starbreaker', 'Mythic', 'Unstoppable', 'Supernova', 'Immortal', 'Neon Deity', 'Neon Legend'];
  const A = ['Chrome', 'Plasma', 'Quantum', 'Cyber', 'Solar', 'Lunar', 'Void', 'Prism', 'Turbo', 'Hyper', 'Crimson', 'Azure', 'Golden', 'Shadow', 'Thunder', 'Frost', 'Inferno', 'Velvet', 'Static', 'Phantom', 'Iron', 'Neon', 'Astral'];
  const N = ['Striker', 'Duelist', 'Warlord', 'Ronin', 'Valkyrie', 'Titan', 'Comet', 'Specter', 'Sovereign', 'Outlaw', 'Paladin', 'Maverick', 'Tactician', 'Juggernaut'];
  const gen = [], used = new Set(early.concat(late));
  for (let i = 0; gen.length < 92 && i < 4000; i++) { const t = A[i % A.length] + ' ' + N[(i * 5 + Math.floor(i / A.length)) % N.length]; if (!used.has(t)) { used.add(t); gen.push(t); } }
  const titles = early.concat(gen, late);                                      // (Rookie first … Neon Legend last)
  const pals = Object.keys(RW_PAL);
  const kos = pals.flatMap(p => Object.keys(KO_SHAPES).map(s => s + '-' + p)), trails = pals.flatMap(p => Object.keys(TRAIL_SHAPES).map(s => s + '-' + p));
  const Q = { title: titles.slice(1), ko: kos, trail: trails, plate: ['neon', 'chevron', 'circuit', 'crystal', 'flame', 'halo'].concat(Object.keys(PLATE16), ['legend']),
    emoji: ['heart', 'star', 'moon', 'stareyes', 'snow', 'note', 'sun', 'crown', 'swords', 'shield', 'flag', 'zzz', 'question', 'bang', 'target', 'trophy'],
    spark: ['stars', 'pixel', 'sakura', 'lightning', 'shards', 'nova'], theme: ['sunset', 'aqua', 'sakura', 'gold', 'void', 'aurora'] };
  const fixed = { 1: ['title', 'Rookie'], 50: ['skin', 3], 100: ['skin', 4], 175: ['skin', 5], 250: ['skin', 6] };
  const total = {}, placed = {}; for (const k in Q) { total[k] = Q[k].length; placed[k] = 0; }
  const open = PASS_TIERS - Object.keys(fixed).length, out = [];
  let slot = 0;
  for (let t = 1; t <= PASS_TIERS; t++) {
    if (fixed[t]) { out.push([t, fixed[t][0], fixed[t][1]]); continue; }
    slot++; let best = null, bd = -1e9;                                        // the category furthest behind its even share takes the tier
    for (const k in Q) { if (placed[k] >= total[k]) continue; const d = total[k] * slot / open - placed[k]; if (d > bd + 1e-9) { bd = d; best = k; } }
    out.push([t, best, Q[best][placed[best]++]]);
  }
  return out;
})();
const passKey = r => r[1] === 'skin' ? 'skin' + r[2] : r[1] + ':' + r[2];
const PASS_SECTIONS = ['Rookie', 'Contender', 'Challenger', 'Veteran', 'Elite', 'Master', 'Grandmaster', 'Champion', 'Mythic', 'Immortal', 'Legend', 'Neon Deity', 'Ascendant', 'Celestial', 'Eternal',
  'Paragon', 'Titan', 'Sovereign', 'Apex', 'Overdrive', 'Hyperion', 'Infinity', 'Singularity', 'Zenith', 'Neon Legend'];   // 25 sections of ten tiers
const PASS_TYPE = { skin: ['3D Skin', 4, '◆'], spark: ['Hit Spark', 2, '✸'], theme: ['UI Theme', 3, '◐'], plate: ['Nameplate', 2, '▭'], emoji: ['3D Emoji', 2, ''], title: ['Title', 1, '❝'],
  ko: ['KO Explosion', 3, '💥'], trail: ['Neon Trail', 2, '〰'] };                // label · base rarity · icon
const RARITY = ['', 'common', 'rare', 'epic', 'legendary'];
const rewardRarity = r => r[1] === 'skin' ? 4 : clamp(PASS_TYPE[r[1]][1] + (r[0] >= 200 ? 2 : r[0] >= 110 ? 1 : 0), 1, 4);   // (rarer as the track climbs)
// the Battle Pass skins / emojis learn their tiers from the track
Object.assign(SKIN_TIER, Object.fromEntries(PASS_REWARDS.filter(r => r[1] === 'skin').map(r => [r[2], r[0]])));
for (const r of PASS_REWARDS) if (r[1] === 'emoji') { const e = EMOJIS.find(q => q.id === r[2]); if (e) { e.tier = r[0]; e.pass = true; } }
function rewardName(r) {
  switch (r[1]) { case 'skin': return skinOf(CHARS[0], r[2]).name + ' skin'; case 'spark': return PASS_SPARKS[r[2]]; case 'theme': return PASS_THEMES[r[2]][0];
    case 'plate': return PASS_PLATES[r[2]]; case 'emoji': return (EMOJIS.find(e => e.id === r[2]) || {}).name; case 'title': return '“' + r[2] + '”';
    case 'ko': return PASS_KOS[r[2]]; case 'trail': return PASS_TRAILS[r[2]]; }
  return '';
}
function rewardDesc(r) {
  switch (r[1]) {
    case 'skin': return { 3: 'Every fighter grows faceted crystal clusters on the shoulders, spine and crown, with a ring of floating shards.', 4: 'Chrome armour for every fighter: a chest plate with a glowing core, pauldrons, piston gauntlets and a jetpack that fires in the air.',
      5: 'A night-sky body for every fighter: a starry halo, two orbit rings and a glowing constellation across the chest.', 6: 'The final reward. A hologram body crowned in light, with wings of light and rising aura flames.' }[r[2]];
    case 'spark': return 'Your hits explode in ' + PASS_SPARKS[r[2]].toLowerCase() + ' effects, on top of the normal impact.';
    case 'theme': return 'Recolours the menus, buttons and glass panels.';
    case 'plate': return 'A new 3D border for the nameplate floating over your fighter.';
    case 'emoji': return 'A new holographic 3D emoji to pop over your head mid-match — map it to a number key in Settings → Profile.';
    case 'title': return 'Shown before your username on your 3D nameplate.';
    case 'ko': return 'Every stock you take detonates in a ' + KO_SHAPES[rwShape(r[2])].toLowerCase() + ' in ' + rwPal(r[2])[0] + ' colours — a custom 3D KO explosion on top of the normal blast.';
    case 'trail': return 'A ' + rwPal(r[2])[0] + ' ' + TRAIL_SHAPES[rwShape(r[2])].toLowerCase() + ' trail follows your striking fist or foot through every attack.';
  }
  return '';
}

/* ---------------- state (localStorage) ---------------- */
const PASS = { xp: 0, seen: 0, equip: { spark: 'classic', theme: 'neon', plate: 'basic', title: '', ko: 'classic', trail: 'none' }, day: '', matches: 0, wins: 0, sel: 1, last: null };
function passLoad() { try { const s = JSON.parse(localStorage.getItem('neonbrawl.pass') || 'null'); if (s) { Object.assign(PASS, s); PASS.equip = Object.assign({ spark: 'classic', theme: 'neon', plate: 'basic', title: '', ko: 'classic', trail: 'none' }, s.equip); } } catch (e) { /* storage unavailable */ } }
function passSave() { try { localStorage.setItem('neonbrawl.pass', JSON.stringify({ xp: PASS.xp, seen: PASS.seen, equip: PASS.equip, day: PASS.day, matches: PASS.matches, wins: PASS.wins })); } catch (e) { /* storage unavailable */ } }
// tier reached for an XP total (0 … 50) and the progress into the next tier
function passTierOf(xp) { let t = 0, need = passTierXP(1); while (t < PASS_TIERS && xp >= need) { xp -= need; t++; need = passTierXP(t + 1); } return { tier: t, into: xp, need: t < PASS_TIERS ? need : 0 }; }
const passTier = () => passTierOf(PASS.xp).tier;
function passOwns(key) { const r = PASS_REWARDS.find(q => passKey(q) === key); return !!r && r[0] <= passTier(); }
const passTitle = () => PASS.equip.title || '';
const passPlate = () => PASS.equip.plate || 'basic';
function applyUITheme() { const th = PASS_THEMES[PASS.equip.theme] ? PASS.equip.theme : 'neon', w = document.getElementById('wrap'), custom = SET.themeCustom && Array.isArray(SET.themeCols) && SET.themeCols.length === 3;
  const T = custom ? [null].concat(SET.themeCols) : PASS_THEMES[th];                                        // (v13: Settings → Theme can override with your own three colours)
  w.dataset.uitheme = custom ? 'custom' : th; w.style.setProperty('--acc1', T[1]); w.style.setProperty('--acc2', T[2]); w.style.setProperty('--acc3', T[3]); }

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
  else if (mode === 'horde') { lines.push(['Survive the Horde · ' + B.cleared + ' waves', 120 + B.cleared * 110], ['Enemies KO\'d', B.kills * 12]); if (B.record) lines.push(['New record', 250]); }   // v16
  else if (mode === 'coins') { lines.push(['Coin Scramble', 150 + B.score[0] * 12]); if (B.won) lines.push(['Coin Scramble victory', 300]); }   // v16
  else if (mode === 'volley') { lines.push(['Volley Brawl', 150 + B.score[0] * 25]); if (B.won) lines.push(['Volley victory', 300]); }
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
const TILE3D = new Set(['skin', 'emoji', 'plate', 'ko', 'trail']);
const isEquipped = r => r[1] === 'skin' ? false : r[1] === 'emoji' ? false : PASS.equip[r[1]] === r[2];
function buildPass() {
  const T = passTierOf(PASS.xp), tier = T.tier;
  document.getElementById('bp-tier').textContent = tier;
  document.getElementById('bp-xp').textContent = T.need ? `${Math.floor(T.into).toLocaleString()} / ${T.need.toLocaleString()} XP` : 'PASS COMPLETE';
  document.getElementById('bp-fill').style.width = (T.need ? T.into / T.need * 100 : 100) + '%';
  document.getElementById('bp-stats').innerHTML = `<span><small>Total XP</small><b>${Math.floor(PASS.xp).toLocaleString()}</b></span><span><small>Matches</small><b>${PASS.matches}</b></span><span><small>Wins</small><b>${PASS.wins}</b></span>`;
  const next = PASS_REWARDS.find(r => r[0] > tier);
  document.getElementById('bp-next').innerHTML = next ? `<small>Next reward · tier ${next[0]}</small><b>${rewardIcon(next)} ${rewardName(next)}</b>` : '<small>Every reward unlocked</small><b>★ Neon Legend</b>';
  // the track: a vertical grid in five sections of ten tiers (it scrolls; see .bp-track in the CSS)
  document.getElementById('bp-track').innerHTML = PASS_REWARDS.map(r => { const own = r[0] <= tier, ty = PASS_TYPE[r[1]], fresh = own && r[0] > PASS.seen;
    const sec = (r[0] - 1) % 10 === 0 ? `<div class="bp-sec${tier >= r[0] + 9 ? ' done' : ''}">${PASS_SECTIONS[(r[0] - 1) / 10]}<small>tiers ${r[0]}–${r[0] + 9}</small></div>` : '';
    const t3 = TILE3D.has(r[1]);                                                      // (v15: skins, emojis and nameplates get a live rotating 3D window in the tile)
    return sec + `<button class="bp-card ${RARITY[rewardRarity(r)]}${t3 ? ' has3d' : ''}${own ? ' own' : ' lock'}${PASS.sel === r[0] ? ' sel' : ''}${isEquipped(r) ? ' eq' : ''}${fresh ? ' new' : ''}${r[0] === tier ? ' cur' : ''}" data-act="bp-pick" data-tier="${r[0]}">` +
      `<span class="bp-glass"></span>` + (t3 ? `<i class="bp-3d" data-t3="${r[0]}"></i>` : `<span class="bp-ico">${rewardIcon(r)}</span>`) +
      `<span class="bp-n">${r[0]}</span><b>${rewardName(r)}</b><small>${ty[0]}</small>${own ? '' : '<i class="bp-lk">🔒</i>'}</button>`; }).join('');
  passDetail();
  passLoadout();
}
function passDetail() {
  const r = PASS_REWARDS.find(q => q[0] === PASS.sel) || PASS_REWARDS[0], own = r[0] <= passTier(), ty = PASS_TYPE[r[1]];
  const rar = RARITY[rewardRarity(r)], el = document.getElementById('bp-detail'); el.className = 'bp-detail ' + rar;   // (not a .panel: no glass blur over the 3D preview)
  document.getElementById('bp-dname').innerHTML = `<span class="bp-rar">${rar.toUpperCase()} · ${ty[0].toUpperCase()} · TIER ${r[0]}</span>${rewardName(r)}`;
  document.getElementById('bp-ddesc').textContent = rewardDesc(r);
  const b = document.getElementById('bp-equip');
  if (!own) { b.textContent = '🔒 Reach tier ' + r[0]; b.disabled = true; b.classList.remove('primary'); }
  else if (r[1] === 'skin') { b.textContent = 'Wear it in character select'; b.disabled = false; b.classList.add('primary'); b.dataset.mode = 'skin'; }
  else if (r[1] === 'emoji') { b.textContent = 'In your emoji wheel ✓'; b.disabled = true; b.classList.remove('primary'); }
  else if (isEquipped(r)) { b.textContent = r[1] === 'title' ? 'Remove title' : 'Equipped ✓'; b.disabled = r[1] !== 'title'; b.classList.remove('primary'); b.dataset.mode = 'unequip'; }
  else { b.textContent = 'Equip'; b.disabled = false; b.classList.add('primary'); b.dataset.mode = 'equip'; }
}
function passLoadout() {
  const rows = [['spark', 'Hit spark', PASS_SPARKS[PASS.equip.spark]], ['ko', 'KO explosion', PASS_KOS[PASS.equip.ko] || 'Classic Blast'], ['trail', 'Attack trail', PASS_TRAILS[PASS.equip.trail] || 'No trail'],
    ['theme', 'UI theme', PASS_THEMES[PASS.equip.theme][0]], ['plate', 'Nameplate', PASS_PLATES[PASS.equip.plate]], ['title', 'Title', PASS.equip.title || '—']];
  document.getElementById('bp-load').innerHTML = rows.map(([k, l, v]) => `<button class="bp-lrow" data-act="bp-cycle" data-k="${k}"><small>${l}</small><b>${v}</b><i>⟳</i></button>`).join('') +
    `<div class="bp-emo" data-act="profile-open" title="Change them in Settings → Profile"><small>Emojis · keys 1-8</small><div>${emojiKeys().map((id, s) => { const i = emojiIndex(id), e = EMOJIS[i] || {};
      return `<span class="${emojiUnlocked(i) ? '' : 'lk'}" title="${e.name}${e.tier ? ' · tier ' + e.tier : ''}">${e.glyph}<u>${s + 1}</u></span>`; }).join('')}</div></div>`;
}
// cycle a loadout slot through everything owned of that type (+ the default)
function passCycle(k) {
  const own = k === 'title' ? [''].concat(ownedTitles())                                                    // (titles also come from the Retro Challenges: ui/profile.js)
    : [{ spark: 'classic', theme: 'neon', ko: 'classic', trail: 'none' }[k] || 'basic'].concat(PASS_REWARDS.filter(r => r[1] === k && r[0] <= passTier()).map(r => r[2]));
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
  requestAnimationFrame(() => { const c = document.querySelector('.bp-card.sel'), tr = document.getElementById('bp-track');   // scroll the selected tier into view (inside the track only)
    if (c && tr) tr.scrollTop = Math.max(0, c.offsetTop - tr.offsetTop - tr.clientHeight / 2 + c.offsetHeight / 2); });
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
    case 'plate': { const s = plateSlot(passTitle(), profileName(), ch.name + ' · P1', skinOf(ch, 0).color); plate3D(r[2], 0, -62, 0, Math.max(84, s.w / 512 * 160 + 26), 44, col, t);
      if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; } glSprite(NP.tex, 0, 62, 3.4, 160, 40, s.uv, [1, 1, 1, 1]); break; }
    case 'spark': { fighterOn(skinIdx(ch)); const u = (t % 70) / 70, x = 26, y = -46;
      ringG(x, y, 0, 6 + u * 40, 3, [1, 1, 1], 1 - u, 0, 0); bG('sph', x, y, 0, 12 * (1 - u), 12 * (1 - u), 12 * (1 - u), col, 1.5 * (1 - u));
      passSparkDemo(r[2], x, y, u); break; }
    case 'theme': { const T = PASS_THEMES[r[2]]; [T[1], T[2], T[3]].forEach((h, i) => { const c = col3(h), a = t * 0.02 + i * TAU / 3; bL('sph', Math.cos(a) * 46, 40 + Math.sin(a * 2) * 6, Math.sin(a) * 46, 16, 16, 16, c, 0.5); bG('sph', Math.cos(a) * 46, 40, Math.sin(a) * 46, 30, 30, 30, c, 0.35); }); break; }
    case 'title': { const s = plateSlot(r[2], profileName(), ch.name + ' · P1', skinOf(ch, 0).color); plate3D(passPlate(), 0, -62, 0, Math.max(84, s.w / 512 * 160 + 26), 44, col, t);
      if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; } glSprite(NP.tex, 0, 62, 3.4, 160, 40, s.uv, [1, 1, 1, 1]); break; }
    case 'ko': koDraw3D(r[2], 0, -52, 0, t % 100, 0.42); break;                                                           // (v16) the KO explosion, looping
    case 'trail': { fighterOn(skinIdx(ch)); trailDraw3D(r[2], trailDemoPts(t, 6, 50, 52), t, 1.4); break; }               // (v16) the trail sweeping round the fighter
  }
  glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
  passTiles3D(t);
}
/* (v15) every visible 3D reward tile in the track: a small studio render of the reward turning on its pedestal, drawn into the
 * tile's clear window (only tiles fully inside the scrolled track, so nothing spills over the rest of the UI) */
const RAR_COL = { common: [0.6, 0.64, 0.85], rare: [0.24, 0.84, 1], epic: [0.77, 0.42, 1], legendary: [1, 0.81, 0.23] };
function passTiles3D(t) {
  const tr = document.getElementById('bp-track'); if (!tr) return; const R0 = tr.getBoundingClientRect(), tier = passTier(); let n = 0;
  for (const el of tr.querySelectorAll('.bp-3d')) {
    const rc = el.getBoundingClientRect(); if (rc.top < R0.top - 1 || rc.bottom > R0.bottom + 1) continue;
    const w = domViewport(el); if (!w || ++n > 18) continue;
    const r = PASS_REWARDS.find(q => q[0] === +el.dataset.t3); if (!r) continue;
    const ch = CHARS[SEL.p1], col = RAR_COL[RARITY[rewardRarity(r)]] || [0.6, 0.6, 0.9], lock = r[0] > tier, spin = t * 0.025 + r[0] * 0.7;
    const plate = r[1] === 'plate';
    glViewCamera(plate ? [0, 64, 250] : r[1] === 'emoji' ? [0, 62, 240] : [0, 52, 255], plate ? [0, 60, 0] : r[1] === 'emoji' ? [0, 52, 0] : [0, 44, 0], 0.5, w.aspect, studioEnv(col), 10, 3000, true);
    const n0 = GL3D.n;
    if (r[1] === 'skin') { const d = dummyFor(PASSV.store, 'tile' + r[0], ch, r[2]); poseDummy(d, (t + r[0] * 7) % 90); d.facing = 1; d.x = 0; d.y = 0; d.percent = 0; collectFighter3D(d, solveRig(d)); }
    else if (r[1] === 'emoji') emoji3D(r[2], 0, -58, 0, 34, (t + r[0] * 40) % 600);
    else if (r[1] === 'ko') koDraw3D(r[2], 0, -46, 0, (t * 0.8 + r[0] * 13) % 62, 0.34);
    else if (r[1] === 'trail') trailDraw3D(r[2], trailDemoPts(t + r[0] * 5, 0, 46, 52), t + r[0] * 5, 2.4);
    else plate3D(r[2], 0, -60, 0, 120, 40, col3(skinOf(ch, 0).color), t);
    const Rm = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, plate ? Math.sin(spin) * 0.7 : spin), tmp = new Float32Array(16);
    for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, Rm, it.m); it.m.set(tmp); it.shadow = false; if (lock && it.col && !it.glow) it.col = it.col.map(v => v * 0.45); }
    const ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -8, 0, 40, 8, 40); ped.col = mix3(col, [0.05, 0.05, 0.12], 0.75); ped.spec = 1; ped.shin = 90; ped.metal = 0.6; ped.outline = 1; ped.shadow = false;
    BAT.glow.add(BAT.T.ring, xf(SM, 0, 0.5, 0, 40, 3, 40), col[0], col[1], col[2], 1.1);
    glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
  }
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
