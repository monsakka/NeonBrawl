/* NEON BRAWL — Coins and the Item Shop (v13, v14). Everything here is bought with Coins earned by playing — no real money.
 * v14: + MOCHI the Japanese Pug and PANDAMONIUM · + the Japanese Garden, the Runaway Train and the Giant Pinball Machine ·
 *      + the Griddy emote. Fixed: the Skins tab (45 cards) overflowed the screen and pushed the tabs + coin counter away,
 *      and its collection filters collided with the Settings click handler (data-set) and threw on every click.
 *
 *   Coins     earned only by playing: every battle (vs the CPU or online) pays for taking part, every % of damage dealt,
 *             each KO and the win (more on higher CPU levels, a flawless bonus), plus a first-battle-of-the-day bonus;
 *             the Retro Challenges pay for Arcade rungs and clears and for Break the Targets / Board the Platforms stage
 *             clears and new records. Saved in localStorage (neonbrawl.wallet) with everything you own.
 *   The shop  5 fighters · 2 maps · 45 3D skins (nine collections, data/skins.js + render/skins3d.js) · 10 animated 3D
 *             emotes · 12 holographic emojis, with four daily deals at 25 % off. Every item has a live 3D preview (the
 *             fighter on a pedestal, a skin on any fighter you pick, the emote performed, the emoji spinning, the map
 *             itself live behind the menu and in the preview window). Buying takes two clicks (Buy → Confirm).
 * v19:        the grid is a wall of glass DISPLAY CARDS — every fighter, skin, emote and emoji card holds its own live 3D model
 *             turning on a pedestal (map cards: a real 3D render of the arena), with a rarity foil, a glare that follows the
 *             pointer and a parallax tilt that leans the card and turns the model with it. Each card's 3D is scissored to the
 *             scrolling grid, so nothing ever draws over the tabs, the side panel or another menu.                         */
'use strict';

/* ---------------- the wallet ---------------- */
const WALLET = { coins: 0, lifetime: 0, owned: [], day: '', spent: 0 };
function walletLoad() {
  try { const s = JSON.parse(localStorage.getItem('neonbrawl.wallet') || 'null');
    if (s) { WALLET.coins = Math.max(0, Math.floor(+s.coins || 0)); WALLET.lifetime = Math.max(0, Math.floor(+s.lifetime || 0)); WALLET.spent = Math.max(0, Math.floor(+s.spent || 0));
      WALLET.owned = Array.isArray(s.owned) ? s.owned.filter(k => typeof k === 'string') : []; WALLET.day = typeof s.day === 'string' ? s.day : ''; } } catch (e) { /* storage unavailable */ }
}
function walletSave() { try { localStorage.setItem('neonbrawl.wallet', JSON.stringify({ coins: WALLET.coins, lifetime: WALLET.lifetime, owned: WALLET.owned, day: WALLET.day, spent: WALLET.spent })); } catch (e) { /* storage unavailable */ } }
const shopOwns = key => WALLET.owned.includes(key);
// pay out: lines = [[label, amount]…] → { gained, lines }
function coinAward(lines) {
  const gained = Math.max(0, Math.round(lines.reduce((s, l) => s + l[1], 0)));
  WALLET.coins += gained; WALLET.lifetime += gained; walletSave(); coinUI();
  if (gained) gameEvent('coins', { n: gained });
  return { gained, lines };
}
// a normal match (vs the CPU or online) has just ended: score it from the local player's stats
function coinMatchReward() {
  const me = localFighter(); if (!me || me.cpu || G.training || CHAL.mode) return null;
  const st = me.st || { dmg: 0, kos: 0 }, won = G.winner === me, lines = [['Battle played', 20], ['Damage dealt · ' + Math.round(st.dmg) + '%', Math.round(st.dmg * 0.15)]];
  if (st.kos) lines.push(['KOs × ' + st.kos, st.kos * 10]);
  if (won) { lines.push([NET.active ? 'Online victory' : 'Victory', NET.active ? 70 : 40 + (G.diff || 0) * 15]); if (me.stocks >= 3) lines.push(['Flawless', 25]); }
  if (WALLET.day !== today()) { WALLET.day = today(); lines.push(['First battle of the day', 50]); }
  if (G.party) { lines.push([G.party.name, 30]); if (G.party.featured) lines.push(["This month's party · ×2", lines.reduce((s, l) => s + l[1], 0)]); }   // v14 monthly party modes
  const r = coinAward(lines); coinResultPanel(r); return r;
}
// the Retro Challenges (ui/challenges.js chalResult)
function coinChallengeReward(mode, B) {
  if (!B || fighters[0].cpu) return null;
  const lines = [];
  if (mode === 'arcade') { if (B.state === 'clear') lines.push(['Arcade cleared!', 300]); else if (B.state === 'won') lines.push(['Arcade stage ' + (B.idx + 1), 30 + B.idx * 8]); else lines.push(['Arcade run', 10]); }
  else if (mode === 'horde') { lines.push(['Survive the Horde', 15], ['Waves cleared × ' + B.cleared, B.cleared * 22], ['Enemies KO\'d × ' + B.kills, B.kills * 2]); if (B.record) lines.push(['New record', 50]); }   // v16
  else if (mode === 'coins') { lines.push(['Coin Scramble', 25], ['Coins collected × ' + B.score[0], B.score[0] * 3]); if (B.won) lines.push(['Victory · ' + DIFFS[G.diff].name, 70 + G.diff * 25]); }   // v16
  else if (mode === 'volley') { lines.push(['Volley Brawl', 30], ['Points scored × ' + B.score[0], B.score[0] * 6]); if (B.won) lines.push(['Victory · ' + DIFFS[G.diff].name, 80 + G.diff * 25]); if (B.spikes[0]) lines.push(['Spikes × ' + B.spikes[0], B.spikes[0] * 5]); }
  else if (mode === 'bowl') { lines.push(['Brawler Bowling', 30], ['Pins · ' + (B.mine || 0) + ' points', Math.round((B.mine || 0) * 0.6)]); if (B.strikes[0]) lines.push(['Strikes × ' + B.strikes[0], B.strikes[0] * 15]); if (B.won) lines.push(['Victory · ' + DIFFS[G.diff].name, 80 + G.diff * 25]); }   // v19
  else if (mode === 'lava') { lines.push(['The Floor is Lava', 30]); if (B.won) lines.push(['Victory · ' + DIFFS[G.diff].name, 80 + G.diff * 25]); if (B.won && !B.burns[0]) lines.push(['Never touched the lava', 40]); }   // v19
  else if (B.failed) lines.push(['Attempt', 5]);
  else { lines.push([(mode === 'btt' ? 'Targets' : 'Platforms') + ' · stage ' + B.stage + ' clear', 40 + B.stage * 15]); if (B.record) lines.push([B.prev ? 'New record' : 'First clear', B.prev ? 25 : 60]); }
  const r = coinAward(lines);
  setTimeout(() => passToast('◎ +' + r.gained + ' Coins'), 2800);
  return r;
}
// the "+Coins" block on the results screen
function coinResultPanel(r) {
  const el = document.getElementById('res-coins'); if (!el || !r) return;
  el.innerHTML = `<div class="rc-head"><i class="coin"></i><b>+${r.gained.toLocaleString()}</b><span>COINS · ${WALLET.coins.toLocaleString()} total</span></div>` +
    `<ul class="rp-lines">${r.lines.map(l => `<li><span>${l[0]}</span><b>+${Math.round(l[1])}</b></li>`).join('')}</ul>`;
  el.classList.add('show');
}
// every coin counter on screen
function coinUI() { document.querySelectorAll('.coin-n').forEach(el => { el.textContent = WALLET.coins.toLocaleString(); }); }

/* ---------------- the catalog ---------------- */
const SHOP_RARITY = ['', 'common', 'rare', 'epic', 'legendary'];
const FIGHTER_PRICE = { djinn: 3000, scarab: 2600, lumen: 2400, totem: 2800, hive: 2200, pug: 2600, panda: 2800 };
const MAP_PRICE = { dragonspine: 2000, horizon: 2400, garden: 2000, train: 2600, pinball: 2400 };
const SKIN_PRICE = { 2: 450, 3: 900, 4: 1600 };
const EMOTE_PRICE = { robot: 600, breakdance: 700, guitar: 700, meditate: 500, juggle: 500, shadowbox: 400, nap: 400, hype: 600, wave: 300, magic: 700, griddy: 800 };
const EMOTE_DESC = { robot: 'Snap through four servo-perfect poses on a light-up dance floor, a laser scanning the beat.', breakdance: 'Drop into a spinning windmill on your hands, then hit the freeze.',
  guitar: 'Shred a neon flying-V under a spotlight while the notes blast out.', meditate: 'Rise into a floating lotus as rings of light climb around you.', juggle: 'Juggle three glowing orbs in perfect arcs.',
  shadowbox: 'A lightning flurry of jabs with after-image fists.', nap: 'Lie down on a fluffy pillow for a power nap — Zzz and all.', hype: 'Crouch, launch into a huge spinning jump and land to confetti cannons.',
  wave: 'A big friendly wave and a speech bubble with a heart.', magic: 'Tap your wand on a top hat… and a rabbit pops out.',
  griddy: 'The Griddy: heel-toe taps on the beat, arms pumping, hands snapped into goggles — on a strobing dance floor that lights up under every step.' };
const EMOJI_PRICE = { thumbsup: 200, rocket: 250, bolt: 250, ghost: 300, hundred: 250, controller: 300, rage: 250, cry: 250, cool: 300, popcorn: 250, clown: 300, diamond: 350 };
const SET_ICON = { 'Samurai Dynasty': '⛩', 'Cyber Grid': '⌬', 'Mythic Olympus': '⚡', 'Elemental Forge': '🜂', 'Cosmic Voyager': '🪐', 'Beast Kingdom': '🐾', 'Royal Court': '♛', 'Mech Works': '⚙', 'Spectral Night': '☾' };
const PART_WORD = { helm: 'helm', hat: 'hat', crown: 'crown', horns: 'horns', ears: 'ears', mask: 'mask', visor: 'visor', snakes: 'snake hair', headRing: 'planetary ring', halo: 'halo', backWeapon: '', pack: 'pack', tail: 'tail',
  wings: 'wings', cape: 'cape', shoulders: 'pauldrons', chest: '', limbs: '', cracks: 'molten cracks', ring: 'ring', orbit: 'in orbit', aura: 'aura', trail: 'comet trail' };
const KIND_WORD = { katana2: 'twin katanas', yari: 'yari spear', kanabo: 'spiked kanabo', saber: 'energy saber', aspis: 'bronze aspis shield', labrys: 'double axe', scepter: 'royal scepter', ankh: 'golden ankh', scythe: 'reaper scythe', broom: 'witch broom',
  fox9: 'nine', pom: 'pom-pom', vfin: 'V-fin', galea: 'crested galea', greathelm: 'great', space: 'space', phones: 'headphone', top: 'top', nemes: 'nemes', hood: 'reaper hood', jingasa: 'jingasa', cables: 'data-cable', astro: 'life-support',
  gears: 'clockwork-gear', rocket: 'twin rocket', cannon: 'shoulder cannon', glowlines: 'glowing circuit lines', greaves: 'bronze greaves', vines: 'climbing vines', constellation: 'constellation marks', claws: 'claws', chains: 'spectral chains',
  plate: 'chest plate', bell: 'bell collar', sash: 'silk sash', core: 'glowing core', goldcollar: 'gold collar', emblem: 'star emblem', flag: 'mission patch', leafcollar: 'leaf collar', ermine: 'ermine collar', tabard: 'tabard',
  ruffle: 'ruffled collar', shell: 'seashell crest', scarf: 'flying scarf', highcollar: 'high collar', scan: 'scanning', wind: 'wind', accretion: 'accretion', shards: 'crystal shards', cubes: 'data cubes', bolts: 'lightning bolts',
  water: 'water drops', moons: 'moons', stars: 'stars', juggle: 'juggling balls', jewels: 'jewels', drone: 'a camera drone', souls: 'lost souls', potion: 'a bubbling potion', wisps: 'will-o-wisps', mempo: 'mempo', ring: 'nose-ring',
  whiskers: 'neon whiskers', gaze: 'glowing-eyed', goggles: 'brass goggles', headset: 'pilot headset', band: 'visor band', shades: 'shades', petals: 'sakura petal', snow: 'snowfall', bubbles: 'bubble', nebula: 'nebula', leaves: 'falling-leaf',
  branch: 'cherry-branch', storm: 'storm-cloud', void: 'void' };
const skinPartsText = s => s.parts.map(([p, o]) => p === 'orbit' ? (KIND_WORD[o.k] || o.k) + ' in orbit' : ((KIND_WORD[o.k] || o.k || '') + ' ' + (PART_WORD[p] || '')).trim()).join(' · ');
const SHOP_CATALOG = [];
function buildCatalog() {
  SHOP_CATALOG.length = 0;
  for (const ch of CHARS.filter(c => c.shop)) SHOP_CATALOG.push({ key: 'char:' + ch.id, type: 'fighter', id: ch.id, name: ch.name, price: FIGHTER_PRICE[ch.id] || 2500, r: 4, col: ch.color,
    desc: `${ch.role}. Special · ${ch.special.name}: ${ch.sdesc} Ultimate · ${ULTS[ch.id] ? ULTS[ch.id].name : '—'}. ${ch.pass}.` });
  for (const st of STAGES.filter(s => s.shop)) SHOP_CATALOG.push({ key: 'map:' + st.id, type: 'map', id: st.id, name: st.name, price: MAP_PRICE[st.id] || 2000, r: 4, col: st.pal.edge, desc: st.desc + ' ' + st.tag.replace('Shop map · ', '') + '.' });
  SHOP_SKINS.forEach((s, i) => SHOP_CATALOG.push({ key: 'skin:' + s.id, type: 'skin', id: s.id, idx: SHOP_SKIN0 + i, set: s.set, name: s.name, price: SKIN_PRICE[s.r], r: s.r, col: s.glow.startsWith('#') ? s.glow : '#ffffff',
    desc: `${s.set} collection — ${skinPartsText(s)}. A real 3D outfit that fits every fighter.` }));
  for (const k of SHOP_EMOTES) SHOP_CATALOG.push({ key: 'emote:' + k, type: 'emote', id: k, name: EMOTE_NAMES[k], price: EMOTE_PRICE[k], r: EMOTE_PRICE[k] >= 700 ? 3 : 2, col: '#7af0ff', desc: EMOTE_DESC[k] + ' Map it to a taunt button in Settings → Profile.' });
  for (const e of EMOJIS.filter(q => q.shop)) SHOP_CATALOG.push({ key: 'emoji:' + e.id, type: 'emoji', id: e.id, name: e.name, price: EMOJI_PRICE[e.id] || 250, r: (EMOJI_PRICE[e.id] || 0) >= 300 ? 3 : 2, col: '#ffd36e',
    desc: 'A holographic 3D emoji to pop over your head mid-match. Map it to a number key in Settings → Profile.' });
}
const shopItem = key => SHOP_CATALOG.find(it => it.key === key);
// four daily deals at 25 % off, picked fresh each day (seeded by the date) from what you don't own yet
function dailyDeals() {
  const day = today(); if (SHOPV.dealDay === day && SHOPV.deals) return SHOPV.deals;
  const R = strSeed('deals/' + day), pool = SHOP_CATALOG.filter(it => !shopOwns(it.key)), out = [];
  for (const want of [['skin'], ['fighter', 'map'], ['emote', 'emoji'], ['skin']]) { const c = pool.filter(it => want.includes(it.type) && !out.includes(it)); if (c.length) out.push(c[Math.floor(R() * c.length)]); }
  SHOPV.dealDay = day; SHOPV.deals = out; return out;
}
const isDeal = it => dailyDeals().includes(it) && !shopOwns(it.key);
const priceOf = it => isDeal(it) ? Math.round(it.price * 0.75 / 10) * 10 : it.price;
const typeLabel = it => ({ fighter: 'Fighter', map: 'Map', skin: '3D Skin', emote: '3D Emote', emoji: '3D Emoji' })[it.type];
function shopBuy(it) {
  if (!it || shopOwns(it.key)) return false;
  const p = priceOf(it); if (WALLET.coins < p) return false;
  WALLET.coins -= p; WALLET.spent += p; WALLET.owned.push(it.key); walletSave(); coinUI();
  gameEvent('purchase', { key: it.key }); passToast('🛍 Unlocked: ' + it.name + '!', true);
  if (it.type === 'fighter' || it.type === 'map') { if (typeof applyRoster === 'function') applyRoster(); }
  if (typeof refreshSkinUI === 'function') refreshSkinUI();
  if (typeof refreshLocks === 'function') refreshLocks();
  return true;
}

/* ---------------- the shop screen ---------------- */
const SHOP_TABS = [['featured', 'Featured', '★'], ['fighter', 'Fighters', '⚔'], ['map', 'Maps', '🗺'], ['skin', 'Skins', '◆'], ['emote', 'Emotes', '🕺'], ['emoji', 'Emojis', '😀']];
const SHOPV = { tab: 'featured', sel: null, set: 'all', tryChar: null, confirm: 0, musicPreview: null, store: {}, deals: null, dealDay: '', burst: -999, icons: {}, tilt: {}, mapImg: {} };
function shopTabItems(tab) {
  if (tab === 'featured') { const fresh = SHOP_CATALOG.filter(it => (it.type === 'fighter' || it.type === 'map') && !shopOwns(it.key)); return dailyDeals().concat(fresh.filter(it => !dailyDeals().includes(it))); }
  return SHOP_CATALOG.filter(it => it.type === tab && (tab !== 'skin' || SHOPV.set === 'all' || it.set === SHOPV.set));
}
function showShop() { buildCatalog(); if (!SHOPV.sel || !shopItem(SHOPV.sel)) SHOPV.sel = (shopTabItems(SHOPV.tab)[0] || SHOP_CATALOG[0]).key; buildShop(); coinUI(); }
function buildShop() {
  const tabs = document.getElementById('shop-tabs'), grid = document.getElementById('shop-grid'); if (!tabs || !grid) return;
  tabs.innerHTML = SHOP_TABS.map(([id, label, ico]) => { const all = id === 'featured' ? null : SHOP_CATALOG.filter(it => it.type === id), own = all ? all.filter(it => shopOwns(it.key)).length : 0;
    return `<button class="shop-tab${SHOPV.tab === id ? ' on' : ''}" data-act="shop-tab" data-tab="${id}"><i>${ico}</i>${label}${all ? `<small>${own}/${all.length}</small>` : ''}</button>`; }).join('');
  const items = shopTabItems(SHOPV.tab);
  let head = '';
  if (SHOPV.tab === 'featured') head = `<div class="shop-sec">Daily deals · 25% off<small id="shop-reset">${dealCountdown()}</small></div>`;
  if (SHOPV.tab === 'skin') head = `<div class="shop-sets">${['all'].concat(SKIN_SETS).map(s => `<button class="shop-set${SHOPV.set === s ? ' on' : ''}" data-act="shop-set" data-coll="${s}">${s === 'all' ? 'All ' + SHOP_SKINS.length : (SET_ICON[s] || '') + ' ' + s}</button>`).join('')}</div>`;   // (data-coll: data-set belongs to the Settings pills)
  // (v19) a display card: a clear 3D window (the live model is drawn behind it — maps show a cached render of the arena), the
  // rarity foil + tag, the deal / owned badges, a glass info plate, a glare layer that follows the pointer, and a frame on top
  const deals = dailyDeals(), card = it => { const own = shopOwns(it.key), deal = isDeal(it), p = priceOf(it), live = it.type !== 'map';
    return `<button class="shop-card ${SHOP_RARITY[it.r]}${own ? ' owned' : ''}${SHOPV.sel === it.key ? ' sel' : ''}${deal ? ' deal' : ''}" data-act="shop-pick" data-key="${it.key}" style="--c:${it.col}">` +
      `<span class="sc-win${live ? '' : ' sc-map'}" ${live ? `data-w3="${it.key}"` : `data-mapimg="${it.id}"${SHOPV.mapImg[it.id] ? ` style="background-image:url(${SHOPV.mapImg[it.id]})"` : ''}`}><span class="sc-ico">${shopIcon(it)}</span></span>` +
      `<span class="sc-rar">${SHOP_RARITY[it.r]}</span>` + (deal ? '<span class="sc-deal">−25%</span>' : '') + (own ? '<span class="sc-own">✓ Owned</span>' : '') +
      `<span class="sc-info"><b>${it.name}</b><small>${typeLabel(it)}${it.set ? ' · ' + it.set : ''}</small>` +
      (own ? '' : `<span class="sc-price">${deal ? `<s>${it.price.toLocaleString()}</s>` : ''}<i class="coin"></i>${p.toLocaleString()}</span>`) + `</span>` +
      `<span class="sc-glare"></span><span class="sc-frame"></span></button>`; };
  let body = items.map(card).join('');
  if (SHOPV.tab === 'featured') { const n = deals.length; body = items.slice(0, n).map(card).join('') + (items.length > n ? '<div class="shop-sec">New in the shop</div>' + items.slice(n).map(card).join('') : '') + (n === 0 && items.length === 0 ? '<p class="shop-empty">You own everything in the shop. Legend.</p>' : ''); }
  grid.innerHTML = head + body;
  for (const cv of grid.querySelectorAll('canvas[data-icon]')) shopDrawIcon(cv);
  shopDetail();
}
function dealCountdown() { const now = new Date(), next = new Date(now); next.setHours(24, 0, 0, 0); const m = Math.round((next - now) / 60000); return `new deals in ${Math.floor(m / 60)}h ${m % 60}m`; }
function shopIcon(it) {
  if (it.type === 'fighter' || it.type === 'map') return `<canvas data-icon="${it.key}" width="156" height="104"></canvas>`;
  if (it.type === 'emoji') return `<i class="sc-glyph">${(EMOJIS.find(e => e.id === it.id) || {}).glyph}</i>`;
  if (it.type === 'emote') return `<i class="sc-glyph">${EMOTE_ICON[it.id] || '🕺'}</i>`;
  return `<i class="sc-glyph sc-set">${SET_ICON[it.set] || '◆'}</i>`;
}
// fighter / map card art: a 2D render drawn once into the card's canvas (the 3D preview is in the detail window)
function shopDrawIcon(cv) {
  const it = shopItem(cv.dataset.icon), c2 = cv.getContext('2d'); if (!it) return;
  const saveCtx = ctx;
  try {
    if (it.type === 'fighter') { const ch = CHARS.find(c => c.id === it.id), d = SHOPV.icons[it.id] || (SHOPV.icons[it.id] = { id: 9, keys: null, cpu: false, ai: null, buf: {}, ch, name: '', color: ch.color, fill: ch.fill || rgba(ch.color, 0.2) });
      resetFighter(d, 0); applySkin(d, ch, 0); poseDummy(d, 30); d.rig = null; d.trail = null;
      ctx = c2; c2.setTransform(2, 0, 0, 2, 0, 0); c2.clearRect(0, 0, 78, 52);
      const g = c2.createRadialGradient(39, 30, 3, 39, 30, 42); g.addColorStop(0, rgba(ch.color, 0.35)); g.addColorStop(1, rgba(ch.color, 0)); c2.fillStyle = g; c2.fillRect(0, 0, 78, 52);
      c2.save(); c2.translate(39, 46); c2.scale(0.5, 0.5); drawFighter(d); c2.restore(); }
    else if (it.type === 'map') { const st = STAGES.find(s => s.id === it.id), save = { ST, STAGE, PLATS, BZ, cam: G.cam };
      try { renderStageTo(c2, st, 156, 200, 0, 0); } finally { ({ ST, STAGE, PLATS, BZ } = save); G.cam = save.cam; } }
  } catch (e) { /* the 2D art is optional */ } finally { ctx = saveCtx; }
}
function shopDetail() {
  const it = shopItem(SHOPV.sel); if (!it) return;
  const own = shopOwns(it.key), p = priceOf(it), el = document.getElementById('shop-detail'); el.className = 'shop-detail ' + SHOP_RARITY[it.r]; el.style.setProperty('--c', it.col);
  document.getElementById('shop-dname').innerHTML = `<span class="shop-rar">${SHOP_RARITY[it.r].toUpperCase()} · ${typeLabel(it).toUpperCase()}${it.set ? ' · ' + it.set.toUpperCase() : ''}</span>${it.name}`;
  document.getElementById('shop-ddesc').textContent = it.desc;
  const tr = document.getElementById('shop-try'), tc = CHARS[SHOPV.tryChar !== null ? SHOPV.tryChar : SEL.p1];
  tr.innerHTML = it.type === 'skin' || it.type === 'emote' ? `<small>Preview on</small><button class="btn small" data-act="shop-try" data-d="-1">‹</button><b style="color:${tc.color}">${tc.name}</b><button class="btn small" data-act="shop-try" data-d="1">›</button>` : '';
  const b = document.getElementById('shop-buy'); b.disabled = false; b.classList.remove('confirm');
  if (own) { b.textContent = ({ fighter: 'Play as ' + it.name + ' →', map: 'Fight on this map →', skin: 'Wear it →', emote: 'Map it to a taunt →', emoji: 'Map it to a key →' })[it.type]; b.dataset.mode = 'use'; b.classList.add('primary'); }
  else if (WALLET.coins < p) { b.innerHTML = `<i class="coin"></i>${p.toLocaleString()} · need ${(p - WALLET.coins).toLocaleString()} more`; b.disabled = true; b.dataset.mode = ''; b.classList.remove('primary'); }
  else if (SHOPV.confirm && G.time - SHOPV.confirm < 240) { b.innerHTML = `Confirm · <i class="coin"></i>${p.toLocaleString()}`; b.dataset.mode = 'confirm'; b.classList.add('primary', 'confirm'); }
  else { b.innerHTML = `Buy · <i class="coin"></i>${p.toLocaleString()}`; b.dataset.mode = 'buy'; b.classList.add('primary'); }
  SHOPV.musicPreview = it.type === 'map' ? it.id : null;
}
// use something you own: straight to where it lives
function shopUse(it) {
  if (it.type === 'fighter') { SEL.p1 = CHARS.findIndex(c => c.id === it.id); go('scr-select'); }
  else if (it.type === 'map') { SEL.stage = STAGES.findIndex(s => s.id === it.id); SEL.randStage = false; loadStage(SEL.stage); go('scr-stage'); }
  else if (it.type === 'skin') { const ci = SHOPV.tryChar !== null ? SHOPV.tryChar : SEL.p1; if (charUnlocked(ci)) SEL.p1 = ci; SEL.skins[CHARS[SEL.p1].id] = it.idx; saveSkins(); go('scr-select'); }
  else { setTab = 'profile'; go('scr-settings'); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act^="shop-"]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'shop-tab') { SHOPV.tab = t.dataset.tab; const first = shopTabItems(SHOPV.tab)[0]; if (first) SHOPV.sel = first.key; SHOPV.confirm = 0; buildShop(); document.getElementById('shop-grid').scrollTop = 0; sfx('click'); }
  else if (a === 'shop-set') { SHOPV.set = t.dataset.coll; const first = shopTabItems('skin')[0]; if (first && !shopTabItems('skin').some(it => it.key === SHOPV.sel)) SHOPV.sel = first.key; SHOPV.confirm = 0; buildShop(); document.getElementById('shop-grid').scrollTop = 0; sfx('click'); }
  else if (a === 'shop-pick') { SHOPV.sel = t.dataset.key; SHOPV.confirm = 0; document.querySelectorAll('.shop-card').forEach(c => c.classList.toggle('sel', c.dataset.key === SHOPV.sel)); shopDetail(); sfx('click'); }
  else if (a === 'shop-try') { const pool = playablePool(), cur = SHOPV.tryChar !== null ? SHOPV.tryChar : SEL.p1, i = pool.indexOf(cur); SHOPV.tryChar = pool[((i < 0 ? 0 : i) + (+t.dataset.d) + pool.length) % pool.length]; shopDetail(); sfx('click'); }
  else if (a === 'shop-buy') { const it = shopItem(SHOPV.sel), m = t.dataset.mode; if (!it) return;
    if (m === 'use') shopUse(it);
    else if (m === 'buy') { SHOPV.confirm = G.time; shopDetail(); sfx('click'); }
    else if (m === 'confirm') { if (shopBuy(it)) { SHOPV.burst = G.time; sfx('select'); } SHOPV.confirm = 0; buildShop(); } }
  else if (a === 'shop-open') { const k = t.dataset.key; if (k) { SHOPV.sel = k; const it = shopItem(k); if (it) SHOPV.tab = it.type; } go('scr-shop'); }
});
// the confirm step times out
setInterval(() => { if (G.screen === 'scr-shop' && SHOPV.confirm && G.time - SHOPV.confirm >= 240) { SHOPV.confirm = 0; shopDetail(); } const r = document.getElementById('shop-reset'); if (r && G.screen === 'scr-shop') r.textContent = dealCountdown(); }, 1000);

/* ---------------- the live 3D: the big preview (#shop-view) + every display card ---------------- */
function shopPreview3D() {
  const it = shopItem(SHOPV.sel), w = domViewport(document.getElementById('shop-view')), t = G.time;
  if (w && it && it.type === 'map') {                                          // the arena itself, from a slow orbit (it is also live behind the menu)
    const st = STAGES.find(s => s.id === it.id);
    withStage(st, () => { if (STAGE3D.key !== st.id || !STAGE3D.main) buildStage3D();
      const S = STAGE, cx = S.x + S.w / 2, cy = -S.y + 40, a = Math.sin(t * 0.004) * 0.5, R = 1150;
      glViewCamera([cx + Math.sin(a) * R, cy + 300, Math.cos(a) * R], [cx, cy - 40, 0], 0.62, w.aspect, Object.assign({}, STAGE3D.env, { fogNear: R + 300, fogFar: R + 5000 }), 20, 9000, true);
      collectStage3D(); stageLights3D(); glFlush({ vp: w.vp, shadow: false, sky: STAGE3D.sky }); });
  } else if (w && it) shopScene3D(it, w, t, { key: 'p' });
  shopCards3D(t);
}
/* one item's studio scene in a 3D window w = { vp, aspect, clip }: a fighter or skin turning on a pedestal, the emote performed,
 * the emoji spinning. o.card: the smaller display-card framing · o.key: its private dummy · o.off: a phase offset so the cards
 * don't move in lockstep · o.tx / o.ty: the card's parallax tilt (−1…1), which turns the model with the card              */
function shopScene3D(it, w, t, o) {
  const card = !!o.card, tryCh = CHARS[SHOPV.tryChar !== null ? SHOPV.tryChar : SEL.p1], ch = it.type === 'fighter' ? CHARS.find(c => c.id === it.id) : tryCh;
  const col = col3(it.type === 'skin' ? skinOf(ch, it.idx).color : it.type === 'fighter' ? ch.color : it.col), far = it.type === 'emoji', tx = o.tx || 0, ty = o.ty || 0, off = o.off || 0;
  glViewCamera(far ? [0, 50, card ? 200 : 220] : card ? [0, 56, 232] : [0, 62, 250], far ? [0, 50, 0] : [0, card ? 41 : 44, 0], 0.5, w.aspect, studioEnv(col), 10, 3000, true);
  const pr = card ? 50 : 64, ped = glItem(GL3D.mesh.cylCap); xf(ped.m, 0, -10, 0, pr, 10, pr); ped.col = mix3(col, [0.05, 0.06, 0.14], 0.84); ped.spec = 1; ped.shin = 90; ped.metal = 0.6; ped.outline = 1.2; ped.shadow = false;
  BAT.glow.add(BAT.T.ring, xf(SM, 0, -0.5, 0, pr, 4, pr), col[0], col[1], col[2], 1.2);
  if (card) { const u = ((t * 0.01 + off) % 1); BAT.glow.add(BAT.T.ring1, xf(SM, 0, 0.5, 0, pr * u + 4, 2, pr * u + 4), col[0], col[1], col[2], 0.8 * (1 - u)); }   // a ripple across the pedestal
  else { const bk = t - SHOPV.burst; if (bk >= 0 && bk < 60) for (let i = 0; i < 3; i++) { const u = (bk + i * 8) / 60; if (u < 1) BAT.glow.add(BAT.T.ring3, xf(SM, 0, 2, 0, 20 + u * 140, 3, 20 + u * 140), 1, 0.85, 0.3, 1.4 * (1 - u)); } }   // a purchase flash
  if (it.type === 'emoji') { emoji3D(it.id, 0, -60, 0, card ? 34 : 30, (t + off * 600) % 600); glFlush({ vp: w.vp, clip: w.clip, shadow: false, sky: studioSky(col) }); return; }
  const skin = it.type === 'skin' ? it.idx : it.type === 'fighter' ? 0 : skinIdx(ch), d = dummyFor(SHOPV.store, o.key || 'p', ch, skin);
  if (it.type === 'emote') { const dur = EMOTE_DUR[it.id], lt = (t + Math.floor(off * 400)) % (dur + 30); poseDummy(d, 30); d.state = lt < dur ? 'emote' : 'free'; d.emoteK = it.id; d.emoteDur = dur; d.stateT = lt; }
  else poseDummy(d, card ? (t + Math.floor(off * 90)) % 90 : t % 360);         // (the cards idle · the big preview cycles idle · run · jab · smash)
  d.facing = 1; d.x = 0; d.y = 0; d.percent = 0;
  // the turn: the big preview sways, the cards spin slowly; both lean with the card's tilt (an emote's set dressing is batched in place, so the dancer only leans)
  const yaw = (it.type === 'emote' ? 0 : card ? t * 0.014 + off * TAU : Math.sin(t * 0.012) * 0.6 + (it.type === 'skin' ? t * 0.006 : 0)) + tx * 0.5, pitch = ty * 0.16;
  const n0 = GL3D.n; collectFighter3D(d, solveRig(d)); const Rm = xf(new Float32Array(16), 0, 0, 0, 1, 1, 1, yaw, 0, pitch), tmp = new Float32Array(16);
  for (let j = n0; j < GL3D.n; j++) { const q = GL3D.items[j]; M4.mul(tmp, Rm, q.m); q.m.set(tmp); q.shadow = false; }
  if (it.type === 'emote' && d.state === 'emote') emoteFX3D(d);
  glFlush({ vp: w.vp, clip: w.clip, shadow: false, sky: studioSky(col) });
}
// every display card on screen, each scissored to the part of it inside the scrolling grid (so a card sliding under the tabs
// or the bottom edge is cut cleanly, and nothing 3D ever draws outside the grid — over the tabs, the side panel or a toast)
const SHOP_CARD_MAX = () => SHOPV.cardMax !== undefined ? SHOPV.cardMax : GL3D.mobile ? 10 : 16;
const shopOff = key => (([...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000) / 1000);
function shopCards3D(t) {
  const grid = document.getElementById('shop-grid'); if (!grid || !GL3D.canvas) return;
  const g0 = grid.getBoundingClientRect(), gr = GL3D.canvas.getBoundingClientRect(); if (!gr.width || !g0.height) return;
  const sx = GL3D.canvas.width / gr.width, sy = GL3D.canvas.height / gr.height; let n = 0;
  for (const el of grid.querySelectorAll('.sc-win[data-w3]')) {
    const r = el.getBoundingClientRect(); if (r.bottom <= g0.top + 1 || r.top >= g0.bottom - 1 || r.width < 4 || r.height < 4) continue;
    if (++n > SHOP_CARD_MAX()) break;
    const it = shopItem(el.dataset.w3); if (!it) continue;
    const L = Math.max(r.left, g0.left), T = Math.max(r.top, g0.top), Rr = Math.min(r.right, g0.right), Bb = Math.min(r.bottom, g0.bottom);
    const vp = [Math.round((r.left - gr.left) * sx), Math.round((gr.bottom - r.bottom) * sy), Math.round(r.width * sx), Math.round(r.height * sy)];
    const clip = [Math.round((L - gr.left) * sx), Math.round((gr.bottom - Bb) * sy), Math.max(1, Math.round((Rr - L) * sx)), Math.max(1, Math.round((Bb - T) * sy))];
    const tl = SHOPV.tilt[it.key] || (SHOPV.tilt[it.key] = { x: 0, y: 0, tx: 0, ty: 0 }); tl.x += (tl.tx - tl.x) * 0.16; tl.y += (tl.ty - tl.y) * 0.16;
    shopScene3D(it, { vp, clip, aspect: r.width / r.height }, t, { card: true, key: 'card:' + it.key, off: shopOff(it.key), tx: tl.x, ty: tl.y });
  }
}
// the map cards show a real 3D render of their arena — taken once (one per frame) and kept as an image
function shopSnapshots() {
  if (G.screen !== 'scr-shop' || typeof glSnapshot !== 'function') return;
  for (const el of document.querySelectorAll('#shop-grid .sc-map[data-mapimg]')) {
    const id = el.dataset.mapimg; if (SHOPV.mapImg[id]) continue; const st = STAGES.find(s => s.id === id); if (!st) continue;
    const img = glSnapshot(300, 230, o => withStage(st, () => { buildStage3D(); const S = st.main, cx = S.x + S.w / 2, cy = -S.y + 40;
      glViewCamera([cx + 170, cy + 250, 900], [cx, cy - 30, 0], 0.62, o.aspect, Object.assign({}, STAGE3D.env, { fogNear: 1300, fogFar: 6400 }), 20, 9000);
      glLight(cx, -(S.y - 160), 900); collectStage3D(); glFlush({ fbo: o.fbo, vp: o.vp, sky: STAGE3D.sky }); }));
    if (img) { try { SHOPV.mapImg[id] = img.toDataURL('image/jpeg', 0.88); } catch (e) { SHOPV.mapImg[id] = 'none'; } document.querySelectorAll(`#shop-grid .sc-map[data-mapimg="${id}"]`).forEach(m => { m.style.backgroundImage = `url(${SHOPV.mapImg[id]})`; }); }
    break;
  }
}
/* the parallax tilt: the card under the pointer (or finger) leans toward it — up to 7° — while a glare follows the pointer and the
 * model inside turns with the card. (Small angles keep the 3D window's drawn rectangle on the card.) */
(function shopTilt() {
  const grid = document.getElementById('shop-grid'); if (!grid) return; let cur = null;
  const reset = c => { if (!c) return; c.classList.remove('tilt'); for (const k of ['--rx', '--ry', '--mx', '--my']) c.style.removeProperty(k); const T = SHOPV.tilt[c.dataset.key]; if (T) { T.tx = 0; T.ty = 0; } };
  const lean = e => {
    const c = e.target.closest && e.target.closest('.shop-card'); if (c !== cur) { reset(cur); cur = c; } if (!c) return;
    if (document.getElementById('wrap').classList.contains('nomotion')) return;
    const r = c.getBoundingClientRect(), nx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), ny = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
    c.classList.add('tilt'); c.style.setProperty('--rx', (nx * 7).toFixed(2) + 'deg'); c.style.setProperty('--ry', (-ny * 7).toFixed(2) + 'deg');
    c.style.setProperty('--mx', ((nx + 1) * 50).toFixed(1) + '%'); c.style.setProperty('--my', ((ny + 1) * 50).toFixed(1) + '%');
    const T = SHOPV.tilt[c.dataset.key] || (SHOPV.tilt[c.dataset.key] = { x: 0, y: 0, tx: 0, ty: 0 }); T.tx = nx; T.ty = ny;
  };
  grid.addEventListener('pointermove', lean); grid.addEventListener('pointerdown', lean);
  grid.addEventListener('pointerleave', () => { reset(cur); cur = null; });
  grid.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(() => { reset(cur); cur = null; }, 280); });
  grid.addEventListener('scroll', () => { reset(cur); cur = null; }, { passive: true });
})();

// the main menu's Item Shop card line
function shopMenuLine() { const el = document.getElementById('mc-shop'); if (!el) return; buildCatalog(); const own = SHOP_CATALOG.filter(it => shopOwns(it.key)).length;
  el.textContent = `${own} / ${SHOP_CATALOG.length} owned · ${dailyDeals().length} daily deals`; }

walletLoad(); buildCatalog();
