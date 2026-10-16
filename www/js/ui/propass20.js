/* NEON BRAWL — v20 THE PRO PASS: a premium 250-tier track bought once for exactly 10,000 Coins (the Item Shop's currency).
 *
 * It lives in the Battle Pass screen behind a "Neon Pass | Pro Pass ★" switch, on the same scrolling glass grid with live 3D
 * previews. Buying it unlocks Pro tier 1 on the spot; after that every bit of Battle Pass XP you earn (matches, KOs, wins,
 * challenges, minigames) also fills the Pro track, tier by tier on the same curve as the Neon Pass (260 + 3n XP per tier).
 *   tier 1     AXO — a brand-new fighter: a neon axolotl regenerator (data/characters.js · render/models20.js)
 *   tier 2     PRISMATIC CATHEDRAL — a brand-new stage (data/stages.js · render/stage20.js)
 *   3 … 250    30 exclusive Pro skins (legendary milestones at 50 · 100 · 150 · 200 · 250) · 78 custom KO explosions ·
 *              100 3D nameplates · 40 holographic emojis (render/rewards20.js), spread evenly by the same scheduler as the
 *              Neon Pass so every stretch of the track mixes reward types
 * Saved in localStorage (neonbrawl.pro). The Neon Pass track is untouched. Everything here is local presentation + unlocks. */
'use strict';

const PRO_PRICE = 10000, PRO_TIERS = 250;
const PRO_SECTIONS = ['Initiate', 'Gilded', 'Radiant', 'Exalted', 'Prismatic', 'Luminous', 'Sovereign', 'Celestial', 'Eternal', 'Ascendant', 'Seraphic', 'Empyrean', 'Paragon',
  'Hallowed', 'Resplendent', 'Starlit', 'Aurum', 'Sanctified', 'Transcendent', 'Divine', 'Mythic Gold', 'Archon', 'Apotheosis', 'Infinite', 'Pro Legend'];
const PRO_REWARDS = (() => {
  const milestones = { 50: 'stainedglass', 100: 'dragonlord', 150: 'phoenixascendant', 200: 'voidemperor', 250: 'seraphim' };
  const fixed = { 1: ['char', 'axo'], 2: ['map', 'cathedral'] };
  for (const t in milestones) fixed[t] = ['skin', milestones[t]];
  const shapes = ['galaxy', 'bloom', 'serpent'].concat(Object.keys(KO_SHAPES)), pals = Object.keys(PRO_PAL), kos = [];
  for (let k = 0; k < pals.length; k++) for (let s = 0; s < shapes.length; s++) kos.push(shapes[s] + '-' + pals[(k + s) % pals.length]);   // (every effect in every palette, interleaved)
  const designs = Object.keys(PLATE20), fins = Object.keys(FIN20), plates = [];
  for (let i = 0; i < designs.length * fins.length; i++) { const d = i % designs.length, k = Math.floor(i / designs.length); plates.push('p20-' + designs[d] + '-' + fins[(k + d) % fins.length]); }
  const Q = { skin: PRO_SKINS.map(s => s.id).filter(id => !Object.values(milestones).includes(id)), ko: kos, plate: plates, emoji: EMOJIS.filter(e => e.pro).map(e => e.id) };
  const total = {}, placed = {}; for (const k in Q) { total[k] = Q[k].length; placed[k] = 0; }
  const open = PRO_TIERS - Object.keys(fixed).length, out = []; let slot = 0;
  for (let t = 1; t <= PRO_TIERS; t++) {
    if (fixed[t]) { out.push([t, fixed[t][0], fixed[t][1]]); continue; }
    slot++; let best = null, bd = -1e9;                                    // the category furthest behind its even share takes the tier
    for (const k in Q) { if (placed[k] >= total[k]) continue; const d = total[k] * slot / open - placed[k]; if (d > bd + 1e-9) { bd = d; best = k; } }
    out.push([t, best, Q[best][placed[best]++]]);
  }
  return out;
})();
const proKey = r => r[1] + ':' + r[2];
const PRO_TYPE = { char: ['New Fighter', 4, '⚔'], map: ['New Stage', 4, '🏛'], skin: ['Pro Skin', 4, '◆'], ko: ['KO Explosion', 3, '💥'], plate: ['3D Nameplate', 2, '▭'], emoji: ['Holo Emoji', 2, ''] };
const proRarity = r => r[1] === 'char' || r[1] === 'map' || r[1] === 'skin' ? 4 : clamp(PRO_TYPE[r[1]][1] + (r[0] >= 190 ? 2 : r[0] >= 90 ? 1 : 0), 1, 4);
const PRO_INDEX = new Map(PRO_REWARDS.map(r => [proKey(r), r]));
Object.assign(PASS_KOS, PRO_KOS); Object.assign(PASS_PLATES, PRO_PLATES);   // (loadout + profile names; the Neon track's own lists are untouched)
for (const r of PRO_REWARDS) if (r[1] === 'emoji') { const e = EMOJIS.find(q => q.id === r[2]); if (e) e.proTier = r[0]; }

/* ---------------- state (localStorage) ---------------- */
const PRO = { owned: false, xp: 0, seen: 0, since: '' };
const PROV = { track: 'free', sel: 1, confirm: 0, confirmT: 0, store: {}, burstT: -999 };
function proLoad() { try { const s = JSON.parse(localStorage.getItem('neonbrawl.pro') || 'null'); if (s) Object.assign(PRO, { owned: !!s.owned, xp: +s.xp || 0, seen: +s.seen || 0, since: s.since || '' }); } catch (e) { /* storage unavailable */ } }
function proSave() { try { localStorage.setItem('neonbrawl.pro', JSON.stringify({ owned: PRO.owned, xp: PRO.xp, seen: PRO.seen, since: PRO.since })); } catch (e) { /* storage unavailable */ } }
const proTotalXP = () => { let s = 0; for (let n = 2; n <= PRO_TIERS; n++) s += passTierXP(n); return s; };
// the Pro tier for an XP total: 0 until bought; tier 1 comes with the purchase, tiers 2 … 250 are earned (n → passTierXP(n))
function proTierOfXP(xp, owned) { if (!owned) return { tier: 0, into: 0, need: 0 }; let t = 1, need = passTierXP(2); while (t < PRO_TIERS && xp >= need) { xp -= need; t++; need = passTierXP(t + 1); } return { tier: t, into: xp, need: t < PRO_TIERS ? need : 0 }; }
const proTier = () => proTierOfXP(PRO.xp, PRO.owned).tier;
function proOwns(key) { const r = PRO_INDEX.get(key); return !!r && PRO.owned && r[0] <= proTier(); }
const proTierOf = key => (PRO_INDEX.get(key) || [0])[0];
const proOwnedOf = type => PRO_REWARDS.filter(r => r[1] === type && proOwns(proKey(r))).map(r => r[2]);
function proName(r) {
  switch (r[1]) { case 'char': return (CHARS.find(c => c.id === r[2]) || {}).name; case 'map': return (STAGES.find(s => s.id === r[2]) || {}).name;
    case 'skin': return (PRO_SKINS.find(s => s.id === r[2]) || {}).name + ' skin'; case 'ko': return PRO_KOS[r[2]]; case 'plate': return PRO_PLATES[r[2]]; case 'emoji': return (EMOJIS.find(e => e.id === r[2]) || {}).name; }
  return '';
}
function proDesc(r) {
  switch (r[1]) {
    case 'char': { const c = CHARS.find(q => q.id === r[2]); return c.role + '. ' + c.sdesc + ' Passive: ' + c.pass + '. Ultimate: ' + ULTS[c.id].name + '.'; }
    case 'map': return STAGES.find(s => s.id === r[2]).desc;
    case 'skin': return (PRO_SKINS.find(s => s.id === r[2]) || {}).desc + ' Works on every fighter.';
    case 'ko': return 'Every stock you take detonates in a ' + PRO_KO_SHAPES[rwShape(r[2])].toLowerCase() + ' in ' + rwPal(r[2])[0] + ' colours — a custom 3D KO explosion on top of the normal blast.';
    case 'plate': return 'A ' + PRO_PLATES[r[2]] + ' 3D nameplate border, floating over your fighter in every match.';
    case 'emoji': return 'A holographic 3D emoji in a gold Pro projector ring — pop it over your head mid-match (map it to a number key in Settings → Profile).';
  }
  return '';
}
function proIcon(r) { return r[1] === 'emoji' ? (EMOJIS.find(e => e.id === r[2]) || {}).glyph || '?' : PRO_TYPE[r[1]][2]; }

/* ---------------- buying + earning ---------------- */
function proBuy() {
  if (PRO.owned) return false;
  if (WALLET.coins < PRO_PRICE) { passToast(`The Pro Pass costs ${PRO_PRICE.toLocaleString()} Coins — you have ${WALLET.coins.toLocaleString()}`); sfx('click'); return false; }
  WALLET.coins -= PRO_PRICE; WALLET.spent = (WALLET.spent || 0) + PRO_PRICE; walletSave(); if (typeof coinUI === 'function') coinUI();
  PRO.owned = true; PRO.xp = 0; PRO.seen = 0; PRO.since = today(); proSave(); PROV.sel = 1; PROV.confirm = 0; PROV.burstT = G.time;
  passToast('★ PRO PASS UNLOCKED · Tier 1: AXO the Neon Axolotl joins the roster!', true); sfx('tierUp'); gameEvent('proBuy', {});
  if (typeof refreshLocks === 'function') refreshLocks();
  return true;
}
// every Battle Pass award also fills the Pro track once it is owned
function proAddXP(gained) {
  if (!PRO.owned || !(gained > 0)) return null;
  const from = proTier(); PRO.xp = Math.min(PRO.xp + gained, proTotalXP()); const to = proTier(); proSave();
  const unlocked = PRO_REWARDS.filter(r => r[0] > from && r[0] <= to); return { gained, from, to, unlocked };
}
const _passAward = passAward;
passAward = function (lines) {                                             // (wraps ui/battlepass.js: the Neon award, then the Pro share)
  const res = _passAward(lines); res.pro = proAddXP(res.gained);
  if (res.pro && res.pro.to > res.pro.from) { const p = res.pro; setTimeout(() => passToast(`★ PRO TIER ${p.to}` + (p.unlocked.length ? ' · Unlocked: ' + p.unlocked.slice(0, 3).map(proName).join(', ') + (p.unlocked.length > 3 ? '…' : '') : ''), true), 2800); }
  return res;
};
const _passResultPanel = passResultPanel;
passResultPanel = function (res) {                                         // + a Pro progress line on the results screen
  _passResultPanel(res); const el = document.getElementById('res-pass'); if (!el || !res || !PRO.owned) return;
  const T = proTierOfXP(PRO.xp, true), pct = T.need ? Math.round(T.into / T.need * 100) : 100, p = res.pro;
  el.insertAdjacentHTML('beforeend', `<div class="rp-pro"><span>★ PRO TIER ${T.tier}${p && p.to > p.from ? ' <em>TIER UP!</em>' : ''}</span><div class="bp-bar pro"><i style="width:${pct}%"></i></div>` +
    (p && p.unlocked.length ? `<p class="rp-unlock">Pro unlocked: ${p.unlocked.map(r => `<b>${proName(r)}</b>`).join(' · ')}</p>` : '') + `</div>`);
};
const _passMenuLine = passMenuLine;
passMenuLine = function () { _passMenuLine(); const el = document.getElementById('mc-pass'); if (el && PRO.owned) el.textContent += ` · ★ Pro ${proTier()}`; };

/* ---------------- loadout: the KO / nameplate slots cycle through Pro rewards too ---------------- */
const _passCycle = passCycle;
passCycle = function (k) {
  if (k !== 'ko' && k !== 'plate') return _passCycle(k);
  const own = [k === 'ko' ? 'classic' : 'basic'].concat(PASS_REWARDS.filter(r => r[1] === k && r[0] <= passTier()).map(r => r[2]), proOwnedOf(k));
  const i = own.indexOf(PASS.equip[k]); PASS.equip[k] = own[(i + 1) % own.length]; passSave(); buildPass();
};

/* ---------------- the Pass screen: the track switch + the Pro track ---------------- */
function proSwitchUI() {
  document.querySelectorAll('[data-act="pp-track"]').forEach(b => b.classList.toggle('on', b.dataset.track === PROV.track));
  const scr = document.getElementById('scr-pass'); if (scr) scr.classList.toggle('pro', PROV.track === 'pro');
  const h = document.querySelector('#scr-pass .hd h2'); if (h) h.innerHTML = PROV.track === 'pro' ? 'Pro <span class="bp-h pro-h">Pass ★</span>' : 'Neon Tier <span class="bp-h">Battle Pass</span>';
  const st = document.querySelector('#scr-pass .hd .step'); if (st) st.textContent = PROV.track === 'pro' ? (PRO.owned ? 'Premium · 250 tiers' : PRO_PRICE.toLocaleString() + ' Coins · 250 tiers') : 'Season 1 · 250 tiers';
}
const _buildPass = buildPass;
buildPass = function () { if (PROV.track === 'pro') buildProPass(); else { _buildPass(); } proSwitchUI(); };
const _passDetail = passDetail;
passDetail = function () { if (PROV.track === 'pro') proDetail(); else _passDetail(); };
const _passEquip = passEquip;
passEquip = function () { if (PROV.track === 'pro') proEquip(); else _passEquip(); };
const _showPass = showPass;
showPass = function () {
  if (PROV.track !== 'pro') { _showPass(); proSwitchUI(); return; }
  const T = proTier(); if (!PRO_REWARDS.some(r => r[0] === PROV.sel)) PROV.sel = 1;
  if (PRO.owned && PRO.seen < T) { const first = PRO_REWARDS.find(r => r[0] > PRO.seen && r[0] <= T); if (first) PROV.sel = first[0]; }
  buildPass(); if (PRO.owned) { PRO.seen = T; proSave(); }
  requestAnimationFrame(() => { const c = document.querySelector('.bp-card.sel'), tr = document.getElementById('bp-track'); if (!tr) return;
    tr.scrollTop = !PRO.owned || !c ? 0 : Math.max(0, c.offsetTop - tr.offsetTop - tr.clientHeight / 2 + c.offsetHeight / 2); });   // (locked: the purchase banner first)
};
function proBannerHTML() {
  const can = WALLET.coins >= PRO_PRICE, conf = PROV.confirm && G.time - PROV.confirmT < 360;
  return `<div class="pp-banner"><div class="pp-bl"><small>PREMIUM TRACK</small><h3>Unlock the Pro Pass</h3>` +
    `<p>250 more tiers of AAA rewards: <b>AXO</b> instantly (tier 1), the <b>Prismatic Cathedral</b> stage (tier 2), 30 exclusive skins, 78 KO explosions, 100 3D nameplates and 40 holographic emojis. Every bit of XP you earn fills it.</p></div>` +
    `<div class="pp-br"><span class="pp-price"><i class="coin"></i>${PRO_PRICE.toLocaleString()}</span><button class="btn primary pp-buy${conf ? ' confirm' : ''}" id="pp-buy" data-act="pp-buy"${can ? '' : ' disabled'}>` +
    `${!can ? `Need ${(PRO_PRICE - WALLET.coins).toLocaleString()} more Coins` : conf ? 'Tap again to confirm' : 'Buy the Pro Pass'}</button><small>You have <i class="coin"></i><b class="coin-n">${WALLET.coins.toLocaleString()}</b> · earn Coins by playing</small></div></div>`;
}
function buildProPass() {
  const T = proTierOfXP(PRO.xp, PRO.owned), tier = T.tier;
  document.getElementById('bp-tier').textContent = tier;
  document.getElementById('bp-xp').textContent = !PRO.owned ? `LOCKED · ${PRO_PRICE.toLocaleString()} Coins` : T.need ? `${Math.floor(T.into).toLocaleString()} / ${T.need.toLocaleString()} XP` : 'PRO PASS COMPLETE';
  document.getElementById('bp-fill').style.width = (!PRO.owned ? 0 : T.need ? T.into / T.need * 100 : 100) + '%';
  const owned = PRO_REWARDS.filter(r => r[0] <= tier).length;
  document.getElementById('bp-stats').innerHTML = `<span><small>Pro XP</small><b>${Math.floor(PRO.xp).toLocaleString()}</b></span><span><small>Unlocked</small><b>${owned} / ${PRO_TIERS}</b></span><span><small>Status</small><b>${PRO.owned ? '★ Pro' : 'Locked'}</b></span>`;
  const next = PRO_REWARDS.find(r => r[0] > tier);
  document.getElementById('bp-next').innerHTML = next ? `<small>Next Pro reward · tier ${next[0]}</small><b>${proIcon(next)} ${proName(next)}</b>` : '<small>Every Pro reward unlocked</small><b>★ Pro Legend</b>';
  document.getElementById('bp-track').innerHTML = (PRO.owned ? '' : proBannerHTML()) + PRO_REWARDS.map(r => { const own = r[0] <= tier, fresh = own && r[0] > PRO.seen;
    const sec = (r[0] - 1) % 10 === 0 ? `<div class="bp-sec pro${tier >= r[0] + 9 ? ' done' : ''}">${PRO_SECTIONS[(r[0] - 1) / 10]}<small>Pro tiers ${r[0]}–${r[0] + 9}</small></div>` : '';
    const eq = (r[1] === 'ko' || r[1] === 'plate') && PASS.equip[r[1]] === r[2];
    return sec + `<button class="bp-card pro has3d ${RARITY[proRarity(r)]}${own ? ' own' : ' lock'}${PROV.sel === r[0] ? ' sel' : ''}${eq ? ' eq' : ''}${fresh ? ' new' : ''}${r[0] === tier ? ' cur' : ''}${r[0] <= 2 ? ' hero' : ''}" data-act="pp-pick" data-tier="${r[0]}">` +
      `<span class="bp-glass"></span><i class="bp-3d" data-p3="${r[0]}"></i><span class="bp-n">${r[0]}</span><b>${proName(r)}</b><small>${PRO_TYPE[r[1]][0]}</small>${own ? '' : '<i class="bp-lk">🔒</i>'}<i class="pp-star">★</i></button>`; }).join('');
  proDetail(); passLoadout();
}
function proDetail() {
  const r = PRO_REWARDS.find(q => q[0] === PROV.sel) || PRO_REWARDS[0], own = proOwns(proKey(r)), ty = PRO_TYPE[r[1]], rar = RARITY[proRarity(r)];
  const el = document.getElementById('bp-detail'); el.className = 'bp-detail pro ' + rar;
  document.getElementById('bp-dname').innerHTML = `<span class="bp-rar">${rar.toUpperCase()} · ${ty[0].toUpperCase()} · PRO TIER ${r[0]}</span>${proName(r)}`;
  document.getElementById('bp-ddesc').textContent = proDesc(r);
  const b = document.getElementById('bp-equip'); b.classList.remove('primary'); b.disabled = false; b.dataset.mode = '';
  if (!PRO.owned) { b.textContent = '🔒 Buy the Pro Pass (' + PRO_PRICE.toLocaleString() + ' Coins)'; b.dataset.mode = 'buy'; b.classList.add('primary'); b.disabled = WALLET.coins < PRO_PRICE; }
  else if (!own) { b.textContent = '🔒 Reach Pro tier ' + r[0]; b.disabled = true; }
  else if (r[1] === 'char') { b.textContent = 'Play as ' + proName(r); b.dataset.mode = 'char'; b.classList.add('primary'); }
  else if (r[1] === 'map') { b.textContent = 'Fight here'; b.dataset.mode = 'map'; b.classList.add('primary'); }
  else if (r[1] === 'skin') { b.textContent = 'Wear it in character select'; b.dataset.mode = 'skin'; b.classList.add('primary'); }
  else if (r[1] === 'emoji') { b.textContent = 'Map it to a key ›'; b.dataset.mode = 'emoji'; }
  else if (PASS.equip[r[1]] === r[2]) { b.textContent = 'Equipped ✓'; b.disabled = true; }
  else { b.textContent = 'Equip'; b.dataset.mode = 'equip'; b.classList.add('primary'); }
}
function proEquip() {
  const r = PRO_REWARDS.find(q => q[0] === PROV.sel), b = document.getElementById('bp-equip'), m = b && b.dataset.mode; if (!r) return;
  if (m === 'buy') { proConfirmBuy(); return; }
  if (!proOwns(proKey(r))) return;
  if (m === 'char') { const i = CHARS.findIndex(c => c.id === r[2]); SEL.p1 = i; SEL.slot = 'cpu'; go('scr-select'); return; }
  if (m === 'map') { const i = STAGES.findIndex(s => s.id === r[2]); SEL.stage = i; SEL.randStage = false; loadStage(i); go('scr-select'); return; }
  if (m === 'skin') { const ch = CHARS[SEL.p1]; SEL.skins[ch.id] = PRO_SKIN0 + PRO_SKINS.findIndex(s => s.id === r[2]); saveSkins(); go('scr-select'); return; }
  if (m === 'emoji') { if (typeof LOADOUT_UI !== 'undefined') { const ek = loadoutOf().emojis; if (!ek.includes(r[2])) { ek[LOADOUT_UI.emoji] = r[2]; LOADOUT_UI.emoji = (LOADOUT_UI.emoji + 1) % 8; profileSave(); passToast(EMOJIS[emojiIndex(r[2])].glyph + ' mapped to an emoji key'); } } setTab = 'profile'; go('scr-settings'); return; }
  if (m === 'equip') { PASS.equip[r[1]] = r[2]; passSave(); buildPass(); sfx('click'); }
}
function proConfirmBuy() {
  if (PRO.owned) return;
  if (WALLET.coins < PRO_PRICE) { proBuy(); return; }
  if (PROV.confirm && G.time - PROV.confirmT < 360) { if (proBuy()) { PROV.track = 'pro'; showPass(); } return; }
  PROV.confirm = 1; PROV.confirmT = G.time; sfx('click'); buildPass();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act^="pp-"],[data-act="pro-open"]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'pp-track') { const k = t.dataset.track === 'pro' ? 'pro' : 'free'; if (PROV.track !== k) { PROV.track = k; PROV.confirm = 0; showPass(); sfx('click'); } }
  else if (a === 'pp-pick') { PROV.sel = +t.dataset.tier; document.querySelectorAll('.bp-card').forEach(c => c.classList.toggle('sel', +c.dataset.tier === PROV.sel)); proDetail(); sfx('click'); }
  else if (a === 'pp-buy') proConfirmBuy();
  else if (a === 'pro-open') { e.stopPropagation(); proOpen(+t.dataset.tier || 1); }
});
// jump to the Pro track (from a locked Pro fighter / stage in the select screens)
function proOpen(tier) { PROV.track = 'pro'; PROV.sel = tier || 1; go('scr-pass'); }

/* ---------------- live 3D: the selected Pro reward + every visible Pro tile ---------------- */
// the Prismatic Cathedral's emblem: a turning rose window with floating prisms (the stage reward's preview)
function cathedralEmblem3D(x, y, z, S, t) {
  bL('torus', x, y, z, S, S, S * 0.7, [0.95, 0.9, 0.98], 0.15, 0, 0, Math.PI / 2); bF('disc', x, y, z - 2, S * 0.96, 2, S * 0.96, [0.1, 0.08, 0.16], 0.1, 0, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.004, c = col3(CATH_GLASS[i % 6]); bG('sph', x + Math.cos(a) * S * 0.62, y + Math.sin(a) * S * 0.62, z + 1, S * 0.22, S * 0.1, S * 0.06, c, 0.9 + 0.3 * Math.sin(t * 0.05 + i), 0, -a);
    bG('sph', x + Math.cos(a + 0.26) * S * 0.32, y + Math.sin(a + 0.26) * S * 0.32, z + 1, S * 0.06, S * 0.06, S * 0.04, col3(CATH_GLASS[(i + 3) % 6]), 1.1); }
  bG('sph', x, y, z + 2, S * 0.15, S * 0.15, S * 0.08, [1, 0.9, 0.55], 1.5); bG('sph', x, y, z - 4, S * 1.3, S * 1.3, S * 0.3, [1, 0.8, 0.55], 0.14);
  for (let i = 0; i < 3; i++) { const a = t * 0.02 + i * TAU / 3; bL('wedge', x + Math.cos(a) * S * 1.4, y + Math.sin(a * 2) * S * 0.2 - S * 0.2, z + Math.sin(a) * S * 0.6, S * 0.14, S * 0.4, S * 0.14, [0.92, 0.97, 1], 0.4, t * 0.03 + i, 0.3); }
}
const proCharOf = () => CHARS.find(c => c.id === 'axo');
function proReward3D(r, x, y, z, S, t, store, key) {
  switch (r[1]) {
    case 'char': { const d = dummyFor(store, key, proCharOf(), 0); poseDummy(d, (t + r[0] * 7) % 90); d.facing = 1; d.x = 0; d.y = 0; d.percent = 0; collectFighter3D(d, solveRig(d)); return 'fighter'; }
    case 'skin': { const ch = CHARS[SEL.p1], i = PRO_SKIN0 + PRO_SKINS.findIndex(s => s.id === r[2]), d = dummyFor(store, key + i, ch, i); poseDummy(d, (t + r[0] * 7) % 90); d.facing = 1; d.x = 0; d.y = 0; d.percent = 0; collectFighter3D(d, solveRig(d)); return 'fighter'; }
    case 'map': cathedralEmblem3D(x, y, z, S * 30, t); return 'emblem';
    case 'emoji': emoji3D(r[2], x, y, z, S * 34, (t + r[0] * 40) % 600); return 'emoji';
    case 'ko': koDraw3D(r[2], x, y + 12, z, (t * 0.8 + r[0] * 13) % 62, S * 0.34); return 'ko';
    case 'plate': plate3D(r[2], x, y, z, 120, 40, col3(skinOf(CHARS[SEL.p1], 0).color), t); return 'plate';
  }
  return '';
}
const _passPreview3D = passPreview3D;
passPreview3D = function () { if (PROV.track === 'pro') proPreview3D(); else _passPreview3D(); };
function proPreview3D() {
  const w = domViewport(document.getElementById('bp-view')); if (!w) { proTiles3D(G.time); return; }
  const r = PRO_REWARDS.find(q => q[0] === PROV.sel) || PRO_REWARDS[0], t = G.time, col = RAR_COL[RARITY[proRarity(r)]] || [1, 0.8, 0.3];
  const far = r[1] === 'plate';
  glViewCamera(far ? [0, 70, 330] : r[1] === 'map' ? [0, 30, 260] : [0, 60, 230], far ? [0, 50, 0] : r[1] === 'map' ? [0, 30, 0] : [0, 46, 0], 0.5, w.aspect, studioEnv(col), 10, 3000, true);
  const ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -10, 0, 60, 10, 60); ped.col = [0.14, 0.11, 0.06]; ped.spec = 1.4; ped.shin = 110; ped.metal = 0.9; ped.outline = 1.2; ped.shadow = false;
  BAT.glow.add(BAT.T.ring, xf(SM, 0, -0.5, 0, 60, 4, 60), 1, 0.8, 0.3, 1.3);                                  // (a gold Pro pedestal)
  const n0 = GL3D.n;
  if (r[1] === 'plate') { const s = plateSlot(passTitle(), profileName(), CHARS[SEL.p1].name + ' · P1', skinOf(CHARS[SEL.p1], 0).color); plate3D(r[2], 0, -62, 0, Math.max(84, s.w / 512 * 160 + 26), 44, col, t);
    if (NP.dirty) { NP.tex = glCanvasTex(NP.cv, NP.tex); NP.dirty = false; } glSprite(NP.tex, 0, 62, 3.4, 160, 40, s.uv, [1, 1, 1, 1]); }
  else if (r[1] === 'emoji') emoji3D(r[2], 0, -60, 0, 30, t % 600);
  else if (r[1] === 'ko') koDraw3D(r[2], 0, -52, 0, t % 100, 0.42);
  else if (r[1] === 'map') cathedralEmblem3D(0, -40, 0, 46, t);
  else proReward3D(r, 0, 0, 0, 1, t, PROV.store, 'pv');
  if (r[1] === 'char' || r[1] === 'skin') { const Rm = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, Math.sin(t * 0.012) * 0.6), tmp = new Float32Array(16);
    for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, Rm, it.m); it.m.set(tmp); it.shadow = false; }
    if (r[1] === 'char') for (let i = 0; i < 5; i++) { const q = ((t * 0.01 + i / 5) % 1); bA('sph', Math.sin(i * 2.3) * 40, -10 - q * 120, Math.cos(i * 1.7) * 30, 5 + q * 6, 5 + q * 6, 5 + q * 6, [0.8, 0.97, 1], 0.4 * (1 - q)); } }   // (AXO's bubbles)
  if (G.time - PROV.burstT < 120) { const u = (G.time - PROV.burstT) / 120; for (let i = 0; i < 3; i++) ringG(0, -40, 0, 20 + u * (120 + i * 40), 3, [1, 0.82, 0.3], 1.4 * (1 - u), 0, 0); }   // (the purchase burst)
  glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
  proTiles3D(t);
}
function proTiles3D(t) {
  const tr = document.getElementById('bp-track'); if (!tr) return; const R0 = tr.getBoundingClientRect(), tier = proTier(); let n = 0;
  for (const el of tr.querySelectorAll('.bp-3d[data-p3]')) {
    const rc = el.getBoundingClientRect(); if (rc.top < R0.top - 1 || rc.bottom > R0.bottom + 1) continue;
    const w = domViewport(el); if (!w || ++n > 18) continue;
    const r = PRO_REWARDS.find(q => q[0] === +el.dataset.p3); if (!r) continue;
    const col = RAR_COL[RARITY[proRarity(r)]] || [1, 0.8, 0.3], lock = r[0] > tier, spin = t * 0.025 + r[0] * 0.7, plate = r[1] === 'plate';
    glViewCamera(plate ? [0, 64, 250] : r[1] === 'emoji' ? [0, 62, 240] : r[1] === 'map' ? [0, 44, 240] : [0, 52, 255], plate ? [0, 60, 0] : r[1] === 'emoji' ? [0, 52, 0] : [0, 44, 0], 0.5, w.aspect, studioEnv(col), 10, 3000, true);
    const n0 = GL3D.n;
    if (r[1] === 'emoji') emoji3D(r[2], 0, -58, 0, 34, (t + r[0] * 40) % 600);
    else if (r[1] === 'ko') koDraw3D(r[2], 0, -46, 0, (t * 0.8 + r[0] * 13) % 62, 0.34);
    else if (r[1] === 'plate') plate3D(r[2], 0, -60, 0, 120, 40, col3(skinOf(CHARS[SEL.p1], 0).color), t);
    else if (r[1] === 'map') cathedralEmblem3D(0, -44, 0, 34, t);
    else proReward3D(r, 0, 0, 0, 1, t, PROV.store, 'tile' + r[0]);
    const Rm = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, plate || r[1] === 'map' ? Math.sin(spin) * 0.6 : spin), tmp = new Float32Array(16);
    for (let j = n0; j < GL3D.n; j++) { const it = GL3D.items[j]; M4.mul(tmp, Rm, it.m); it.m.set(tmp); it.shadow = false; if (lock && it.col && !it.glow) it.col = it.col.map(v => v * 0.45); }
    const ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -8, 0, 40, 8, 40); ped.col = mix3(col, [0.12, 0.09, 0.04], 0.72); ped.spec = 1.3; ped.shin = 110; ped.metal = 0.85; ped.outline = 1; ped.shadow = false;
    BAT.glow.add(BAT.T.ring, xf(SM, 0, 0.5, 0, 40, 3, 40), 1, 0.8, 0.3, 1.1);
    glFlush({ vp: w.vp, shadow: false, sky: studioSky(col) });
  }
}

proLoad();
