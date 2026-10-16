/* NEON BRAWL — Stadium announcer, using the browser's built-in speech synthesis (window.speechSynthesis; no audio files).
 * Calls the matchup at the start, "READY…" / "GO!", "GAME!", "SUDDEN DEATH!" and the winner. The voice is pitched down and
 * slowed for a booming arena feel; a deep English voice is preferred when the device has one. Settings → Announcer. */
'use strict';

const ANN = { voice: null, picked: false, last: '', lastAt: 0 };
const ANN_OK = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';

function annPickVoice() {
  if (!ANN_OK) return null;
  const vs = speechSynthesis.getVoices(); if (!vs.length) return null;
  const en = vs.filter(v => /^en/i.test(v.lang));
  const pref = [/google uk english male/i, /daniel/i, /david/i, /guy/i, /george/i, /male/i, /alex/i, /fred/i];
  for (const re of pref) { const v = en.find(x => re.test(x.name)); if (v) return v; }
  return en[0] || vs[0];
}
if (ANN_OK) { try { speechSynthesis.addEventListener('voiceschanged', () => { ANN.voice = annPickVoice(); ANN.picked = true; }); } catch (e) { /* old engines */ } }

// Say a line. o.flush: interrupt whatever is being said; o.rate / o.pitch override the stadium defaults.
function announce(text, o) {
  if (!ANN_OK || !SET.announcer || !text) return;
  o = o || {};
  const now = performance.now(); if (text === ANN.last && now - ANN.lastAt < 1200) return;      // (no stutter-repeats)
  ANN.last = text; ANN.lastAt = now;
  try {
    if (!ANN.picked) { ANN.voice = annPickVoice(); ANN.picked = !!ANN.voice; }
    if (o.flush) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (ANN.voice) u.voice = ANN.voice;
    u.lang = (ANN.voice && ANN.voice.lang) || 'en-US';
    u.pitch = o.pitch === undefined ? 0.35 : o.pitch;                                        // low and booming
    u.rate = o.rate === undefined ? 0.86 : o.rate;
    u.volume = clamp(0.35 + SET.sfx * 0.9, 0, 1);
    speechSynthesis.speak(u);
  } catch (e) { /* speech unavailable */ }
}
const sayName = ch => ch.name.toLowerCase().replace(/-/g, ' ');

// Match beats, watched once per frame (called from audioTick)
const ANNS = { mode: null, over: false, sd: false };
function announcerTick() {
  if (!ANN_OK) return;
  const m = G.mode;
  if (m === 'count' && ANNS.mode !== 'count') {
    announce(`${sayName(fighters[0].ch)}! versus! ${sayName(fighters[1].ch)}!`, { flush: true, rate: 0.9 });
    setTimeout(() => { if (G.mode === 'count') announce(G.suddenDeath ? 'Sudden death!' : 'Ready...', { rate: 0.8 }); }, 900);
  }
  if (m === 'play' && ANNS.mode === 'count') announce('Go!', { flush: true, rate: 1, pitch: 0.4 });
  if (m === 'ending' && ANNS.mode === 'play') announce('Game!', { flush: true, rate: 0.75, pitch: 0.3 });
  if (m === 'over' && !ANNS.over) { ANNS.over = true;
    const w = G.winner; setTimeout(() => announce(w ? `The winner is... ${sayName(w.ch)}!` : 'No contest!', { rate: 0.82 }), 700); }
  if (m !== 'over') ANNS.over = false;
  if (G.suddenDeath && !ANNS.sd) { ANNS.sd = true; announce('Sudden death!', { flush: true, rate: 0.78, pitch: 0.28 }); }
  if (!G.suddenDeath) ANNS.sd = false;
  if (m === 'menu' && ANNS.mode !== 'menu') { try { if (ANN_OK) speechSynthesis.cancel(); } catch (e) {} }
  ANNS.mode = m;
}
