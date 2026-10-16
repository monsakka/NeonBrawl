/* NEON BRAWL — The player profile: your username and the titles you earn.
 *
 * Your username is set on the main menu's profile card and saved locally (neonbrawl.profile). Titles come from two
 * places: the Battle Pass track, and the stage-based Retro Challenges — clear the stages, beat the bosses, finish the
 * ladder and you earn titles like "Target Master" and "The Unstoppable" (one more, "Combo King", for a 10-hit combo in
 * any match). The equipped title is shown on your 3D nameplate in front of your name — "Combo King Mansour" — and is
 * sent to your rival in online matches along with your username.                                                   */
'use strict';

const PROFILE = { name: '', earned: [] };
const CHAL_TITLES = [
  { id: 'sharpshooter', name: 'Sharpshooter',    how: 'Clear any Break the Targets stage' },
  { id: 'targetMaster', name: 'Target Master',   how: 'Clear Break the Targets stage 5' },
  { id: 'speedDemon',   name: 'Speed Demon',     how: 'Clear a Break the Targets stage in under 20 seconds' },
  { id: 'hopper',       name: 'Platform Hopper', how: 'Clear any Board the Platforms stage' },
  { id: 'skyWalker',    name: 'Sky Walker',      how: 'Clear Board the Platforms stage 5' },
  { id: 'giantSlayer',  name: 'Giant Slayer',    how: 'Defeat GIANT OMEGA in the Classic Arcade' },
  { id: 'handBreaker',  name: 'Hand Breaker',    how: 'Defeat OMNI HAND, the final boss' },
  { id: 'unstoppable',  name: 'The Unstoppable', how: 'Clear the Classic Arcade' },
  { id: 'ironWill',     name: 'Iron Will',       how: 'Clear the Classic Arcade without using a continue' },
  { id: 'comboKing',    name: 'Combo King',      how: 'Land a 10-hit combo in any match' }
];
function profileLoad() { try { const p = JSON.parse(localStorage.getItem('neonbrawl.profile') || 'null'); if (p) { PROFILE.name = String(p.name || '').slice(0, 16); PROFILE.earned = Array.isArray(p.earned) ? p.earned.filter(id => CHAL_TITLES.some(t => t.id === id)) : []; } } catch (e) { /* storage unavailable */ } }
function profileSave() { try { localStorage.setItem('neonbrawl.profile', JSON.stringify({ name: PROFILE.name, earned: PROFILE.earned })); } catch (e) { /* storage unavailable */ } }
// a username: printable, no markup, 16 characters, never empty on screen
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const profileName = () => PROFILE.name || 'Player';
// every title you own: the challenge titles you've earned + the Battle Pass titles you've reached
function ownedTitles() {
  const pass = typeof PASS_REWARDS !== 'undefined' ? PASS_REWARDS.filter(r => r[1] === 'title' && r[0] <= passTier()).map(r => r[2]) : [];
  return CHAL_TITLES.filter(t => PROFILE.earned.includes(t.id)).map(t => t.name).concat(pass);
}
function earnTitle(id) {
  const t = CHAL_TITLES.find(q => q.id === id); if (!t || PROFILE.earned.includes(id)) return false;
  PROFILE.earned.push(id); profileSave();
  if (typeof PASS !== 'undefined' && !PASS.equip.title) { PASS.equip.title = t.name; passSave(); }        // your first title goes straight on your nameplate
  setTimeout(() => { if (typeof passToast === 'function') passToast('🏆 Title unlocked: “' + t.name + '”', true); }, 1400);
  gameEvent('tierUp', { title: t.name }); profileUI();
  return true;
}
// the Retro Challenges award titles from their results (ui/challenges.js chalResult)
function challengeTitles(mode, B) {
  if (!B || fighters[0].cpu) return;
  if (mode === 'btt' && B.done && !B.failed) { earnTitle('sharpshooter'); if (B.stage >= 5) earnTitle('targetMaster'); if (B.final < 20 * 60) earnTitle('speedDemon'); }
  if (mode === 'btp' && B.done && !B.failed) { earnTitle('hopper'); if (B.stage >= 5) earnTitle('skyWalker'); }
  if (mode === 'arcade' && (B.state === 'won' || B.state === 'clear')) {
    const R = B.rungs[B.idx - 1]; if (R && R.boss === 'giant') earnTitle('giantSlayer'); if (R && R.boss === 'hand') earnTitle('handBreaker');
    if (B.state === 'clear') { earnTitle('unstoppable'); if (!B.continues) earnTitle('ironWill'); }
  }
  comboTitle();
}
function comboTitle() { const me = typeof localFighter === 'function' ? localFighter() : fighters[0]; if (me && !me.cpu && me.st && me.st.best >= 10) earnTitle('comboKing'); }

/* ---------------- the main-menu profile card ---------------- */
function profileUI() {
  const nm = document.getElementById('pf-name'); if (!nm) return;
  if (document.activeElement !== nm) nm.value = PROFILE.name;
  const ch = CHARS[SEL.p1], col = skinOf(ch, skinIdx(ch)).color, T = typeof passTierOf === 'function' ? passTierOf(PASS.xp) : { tier: 0 };
  const av = document.getElementById('pf-avatar'); av.textContent = profileName().charAt(0).toUpperCase(); av.style.setProperty('--c', col);
  const tt = document.getElementById('pf-title'), title = typeof PASS !== 'undefined' ? PASS.equip.title : '';
  tt.textContent = title ? '“' + title + '”' : ownedTitles().length ? 'Pick a title ›' : 'No title yet — win challenges';
  tt.classList.toggle('none', !title);
  document.getElementById('pf-meta').textContent = ch.name + ' · Neon Tier ' + T.tier + ' · ' + PROFILE.earned.length + '/' + CHAL_TITLES.length + ' challenge titles';
}
(function wireProfile() {
  const nm = document.getElementById('pf-name'); if (!nm) return;
  const commit = () => { const v = cleanName(nm.value); PROFILE.name = v; nm.value = v; profileSave(); profileUI(); if (NET.connected) netHello(); };
  nm.addEventListener('change', commit); nm.addEventListener('blur', commit);
  nm.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') nm.blur(); });
  document.getElementById('pf-title').addEventListener('click', () => {                                        // cycle through the titles you own
    const own = [''].concat(ownedTitles()); if (own.length < 2) { passToast('Earn titles in the Retro Challenges and the Battle Pass'); return; }
    const i = own.indexOf(PASS.equip.title); PASS.equip.title = own[(i + 1) % own.length]; passSave(); profileUI(); sfx('click');
  });
  document.getElementById('pf-avatar').addEventListener('click', () => go('scr-select'));
})();
profileLoad();
