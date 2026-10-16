/* NEON BRAWL — Same-network multiplayer over WebRTC data channels. No server of any kind.
 *
 * Connecting ("signalling" by copy / paste / share):
 *   1. HOST taps "Create host code": a WebRTC offer (its full SDP, LAN candidates only, deflate-compressed + base64url).
 *   2. GUEST pastes it and gets a reply code (the answer), which goes back to the host the same way (WhatsApp, Messages…).
 *   3. HOST pastes the reply → the peer-to-peer data channel opens directly between the two devices on the Wi-Fi.
 *
 * Netcode: deterministic lockstep. Both devices run the same 60 Hz simulation from the same start (same fighters,
 * skins, stage, seed). Each frame a device samples its own player's input for frame F + DELAY and sends it; frame F is
 * simulated only once both players' inputs for F are in. During the step Math.random is a shared seeded generator, so
 * every random roll (hazards, respawns, launch variance…) matches. Presses that land during hit-stop carry over to
 * the next frame that reads input (exactly like local play). Every 60 frames both sides exchange a state hash; on a
 * mismatch the host sends a snapshot that the guest adopts at the same frame. Host = fighter 0, guest = fighter 1. */
'use strict';

Object.assign(NET, {
  pc: null, dc: null, role: null, me: 0, connected: false, status: 'idle',
  frame: 0, delay: 3, inputs: [new Map(), new Map()], carry: [null, null], cur: [null, null],
  rng: null, saved: null, peer: null, lastRecv: 0, hashes: new Map(), theirHashes: new Map(), desyncs: 0, resyncs: 0, pending: null,
  ping: 0, pingSent: 0, cfg: null, hashLog: []
});

/* ---------- seeded RNG (mulberry32), with a readable / settable state for resyncs ---------- */
function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.state = () => a; r.set = v => { a = v >>> 0; };
  return r;
}

/* ---------- codes: SDP ⇄ compact shareable text ---------- */
const b64u = {
  enc: bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
};
async function zip(bytes, dir) {
  const S = dir ? window.CompressionStream : window.DecompressionStream; if (!S) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new S('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function packSDP(desc) {
  const lines = desc.sdp.split(/\r?\n/).filter(l => l && !/^a=candidate:.* tcp /i.test(l) && !/^a=(extmap-allow-mixed|msid-semantic)/.test(l));
  const text = desc.type + '\n' + lines.join('\n'), raw = new TextEncoder().encode(text), z = await zip(raw, true).catch(() => null);
  return 'NB1' + (z ? 'Z' + b64u.enc(z) : 'P' + b64u.enc(raw));
}
async function unpackSDP(code) {
  code = String(code || '').trim().replace(/\s+/g, '');
  const m = code.match(/NB1([ZP])([A-Za-z0-9_-]+)/); if (!m) throw new Error('That does not look like a NEON BRAWL code.');
  let bytes = b64u.dec(m[2]); if (m[1] === 'Z') { bytes = await zip(bytes, false); if (!bytes) throw new Error('This device cannot read compressed codes.'); }
  const text = new TextDecoder().decode(bytes), nl = text.indexOf('\n');
  return { type: text.slice(0, nl), sdp: text.slice(nl + 1).split('\n').join('\r\n') + '\r\n' };
}

/* ---------- connection ---------- */
function netPC() {
  if (NET.pc) try { NET.pc.close(); } catch (e) { /* already closed */ }
  const pc = new RTCPeerConnection({ iceServers: [] });                       // same network only: host (LAN / mDNS) candidates
  NET.pc = pc;
  pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && NET.connected) netLost('Connection lost'); };
  return pc;
}
const iceDone = pc => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res();
  const t = setTimeout(res, 2500);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
});
async function netHost() {
  netClose(true); NET.role = 'host'; NET.me = 0; netStatus('Creating host code…');
  const pc = netPC(); wireDC(pc.createDataChannel('neonbrawl', { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
  netStatus('Send the host code, then paste the reply'); return packSDP(pc.localDescription);
}
async function netAcceptAnswer(code) {
  if (!NET.pc || NET.role !== 'host') throw new Error('Create a host code first.');
  await NET.pc.setRemoteDescription(await unpackSDP(code)); netStatus('Connecting…');
}
async function netJoin(code) {
  netClose(true); NET.role = 'guest'; NET.me = 1; netStatus('Reading host code…');
  const pc = netPC(); pc.ondatachannel = e => wireDC(e.channel);
  await pc.setRemoteDescription(await unpackSDP(code));
  await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
  netStatus('Send your reply code to the host'); return packSDP(pc.localDescription);
}
function wireDC(dc) {
  NET.dc = dc;
  dc.onopen = () => { NET.connected = true; NET.lastRecv = performance.now(); netStatus('Connected'); netHello(); netUI(); sfx('select'); };
  dc.onclose = () => { if (NET.connected) netLost('Your rival left'); };
  dc.onmessage = e => { NET.lastRecv = performance.now(); try { netOnMessage(JSON.parse(e.data)); } catch (err) { console.warn('[net] bad message', err); } };
}
function netSend(m) { if (NET.dc && NET.dc.readyState === 'open') try { NET.dc.send(JSON.stringify(m)); } catch (e) { /* closing */ } }
function netClose(quiet) {
  if (NET.active) netEndMatch();
  if (NET.dc && NET.connected && !quiet) netSend({ t: 'bye' });
  try { if (NET.dc) NET.dc.close(); } catch (e) {} try { if (NET.pc) NET.pc.close(); } catch (e) {}
  NET.dc = null; NET.pc = null; NET.connected = false; NET.peer = null; NET.role = null; netStatus('Not connected');
}
function netLost(why) {
  const wasPlaying = NET.active; NET.connected = false;
  if (wasPlaying) { netEndMatch(); go('scr-online'); }
  netClose(true); netStatus(why); netUI(); netToast(why);
}

/* ---------- messages ---------- */
function netHello() { const ch = CHARS[SEL.p1]; netSend({ t: 'hello', c: SEL.p1, s: skinIdx(ch) }); }
function netOnMessage(m) {
  switch (m.t) {
    case 'hello': NET.peer = { c: m.c | 0, s: m.s | 0 }; netUI(); break;
    case 'start': netStart(m.cfg); break;
    case 'i': NET.inputs[NET.me ^ 1].set(m.f, m.d); break;
    case 'h': netCheckHash(m.f, m.h, false); break;
    case 'sync': NET.pending = m; break;
    case 'rematch': if (NET.role === 'host' && !NET.active) netSendStart(); break;
    case 'ping': netSend({ t: 'pong', k: m.k }); break;
    case 'pong': if (m.k === NET.pingSent) NET.ping = performance.now() - NET.pingSent; break;
    case 'bye': netLost('Your rival left'); break;
    case 'quit': if (NET.active) { netEndMatch(); go('scr-online'); netToast('Your rival left the match'); } break;
  }
}

/* ---------- match start (host decides, both start from the same config) ---------- */
function netSendStart() {
  if (NET.role !== 'host' || !NET.connected || !NET.peer) return;
  const stage = SEL.randStage ? pickFrom(stagePool()) : SEL.stage;
  const cfg = { seed: (Math.random() * 4294967296) >>> 0, stage, hazards: SEL.hazards, time: SEL.time || 0,
                c0: SEL.p1, s0: skinIdx(CHARS[SEL.p1]), c1: NET.peer.c, s1: NET.peer.s };
  if (cfg.c0 === cfg.c1 && cfg.s0 === cfg.s1) cfg.s1 = (cfg.s1 + 1) % SKIN_COUNT;   // mirror match: different skins
  netSend({ t: 'start', cfg }); netStart(cfg);
}
function netStart(cfg) {
  NET.cfg = cfg;
  if (!NET.saved) NET.saved = { part: SET.part, hitstop: SET.hitstop, sel: { p1: SEL.p1, cpu: SEL.cpu, stage: SEL.stage, rand: SEL.randStage, hz: SEL.hazards, time: SEL.time } };
  SET.hitstop = true;                                                          // (a sim setting: must match on both devices)
  NET.rng = makeRng(cfg.seed);
  const nat = Math.random; Math.random = NET.rng;
  try {
    G.training = false;
    SEL.p1 = cfg.c0; SEL.cpu = cfg.c1; SEL.stage = cfg.stage; SEL.randStage = false; SEL.hazards = cfg.hazards; SEL.time = cfg.time;
    startMatch();
    setChar(fighters[0], CHARS[cfg.c0], cfg.s0); setChar(fighters[1], CHARS[cfg.c1], cfg.s1);
    resetFighter(fighters[0], ST.spawns[0]); resetFighter(fighters[1], ST.spawns[1]);
    fighters[0].facing = 1; fighters[1].facing = -1; fighters[0].cpu = false; fighters[1].cpu = false;
    fighters[0].name = NET.me === 0 ? 'YOU' : 'RIVAL'; fighters[1].name = NET.me === 1 ? 'YOU' : 'RIVAL';
  } finally { Math.random = nat; }
  NET.active = true; NET.frame = 0; NET.inputs = [new Map(), new Map()]; NET.carry = [null, null]; NET.cur = [null, null];
  NET.hashes.clear(); NET.theirHashes.clear(); NET.pending = null; NET.desyncs = 0; NET.resyncs = 0; NET.hashLog = [];
  for (let f = 0; f < NET.delay; f++) for (const p of [0, 1]) NET.inputs[p].set(f, [0, 0, 0]);   // the first DELAY frames: no input
  acc = 0; NET.stallSince = 0;
}
function netEndMatch() {
  if (!NET.active) return;
  NET.active = false;
  if (NET.saved) { SET.part = NET.saved.part; SET.hitstop = NET.saved.hitstop; const s = NET.saved.sel;
    SEL.p1 = s.p1; SEL.cpu = s.cpu; SEL.stage = s.stage; SEL.randStage = s.rand; SEL.hazards = s.hz; SEL.time = s.time; NET.saved = null; }
  fighters[0].name = 'P1'; fighters[1].name = 'CPU';
}

/* ---------- inputs ---------- */
const NB = ['left', 'right', 'down', 'shield', 'jump', 'heavy', 'jumpP', 'lightP', 'heavyP', 'specialP', 'tapL', 'tapR'];
const PRESS = ['jumpP', 'lightP', 'heavyP', 'specialP', 'tapL', 'tapR'];
function packInput(i) { let b = 0; NB.forEach((k, n) => { if (i[k]) b |= 1 << n; }); return [b, Math.round(i.aimX) | 0, Math.round(i.aimY) | 0]; }
function unpackInput(p) { const i = emptyInput(); NB.forEach((k, n) => { i[k] = !!(p[0] & (1 << n)); }); i.aimX = p[1]; i.aimY = p[2]; return i; }
function netInput(f) { return NET.cur[f.id] || emptyInput(); }
const localFighter = () => NET.active ? fighters[NET.me] : fighters[0];

// Can frame NET.frame be simulated? (both players' inputs for it have arrived)
const netCanStep = () => NET.inputs[0].has(NET.frame) && NET.inputs[1].has(NET.frame);
function netStep() {
  const F = NET.frame, me = NET.me;
  if (NET.pending && NET.pending.f <= F) { netApplySnapshot(NET.pending); NET.pending = null; }
  // 1. this device's input for F + DELAY: sample, store, send
  const pk = packInput(readHuman(fighters[me])); pressed.clear();
  NET.inputs[me].set(F + NET.delay, pk); netSend({ t: 'i', f: F + NET.delay, d: pk });
  // 2. both inputs for F; presses carry over hit-stop frames (when the sim doesn't read input), dropped during READY
  const consumes = G.mode !== 'menu' && G.mode !== 'over' && G.mode !== 'count' && !G.paused && !(G.hitstop > 0);
  for (const p of [0, 1]) {
    const i = unpackInput(NET.inputs[p].get(F)); NET.inputs[p].delete(F);
    if (!consumes) { if (G.mode !== 'count') { const c = NET.carry[p] || (NET.carry[p] = {}); for (const k of PRESS) if (i[k]) c[k] = true; } }
    else if (NET.carry[p]) { for (const k of PRESS) if (NET.carry[p][k]) i[k] = true; NET.carry[p] = null; }
    NET.cur[p] = i;
  }
  // 3. the step itself, on the shared seeded RNG
  const nat = Math.random; Math.random = NET.rng;
  try { step(); } finally { Math.random = nat; }
  NET.frame++;
  // 4. state hash every 60 frames
  if (F % 60 === 0) { const h = stateHash(); NET.hashes.set(F, h); NET.hashLog.push([F, h]); if (NET.hashLog.length > 400) NET.hashLog.shift(); netSend({ t: 'h', f: F, h }); netCheckHash(F, null, true); }
}
// called by the main loop instead of the plain step loop while an online match runs
function netLoopSteps() {
  let n = 0;
  while (acc >= STEP && n < 5) {
    if (!netCanStep()) { acc = Math.min(acc, STEP * 2); if (!NET.stallSince) NET.stallSince = performance.now(); break; }
    NET.stallSince = 0; netStep(); acc -= STEP; n++;
  }
  if (NET.stallSince && performance.now() - NET.stallSince > 8000) netLost('Connection timed out');
}

/* ---------- desync detection + resync ---------- */
function stateHash() {
  let h = 2166136261;
  const mix = v => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  for (const f of fighters) { mix(Math.round(f.x * 10)); mix(Math.round(f.y * 10)); mix(Math.round(f.vx * 100)); mix(Math.round(f.vy * 100)); mix(Math.round(f.percent * 10)); mix(f.stocks); mix(f.state); mix(f.stateT); }
  mix(NET.rng ? NET.rng.state() : 0); mix(G.frame);
  return (h >>> 0).toString(36);
}
function netCheckHash(f, theirs, mine) {
  if (theirs !== null && theirs !== undefined) NET.theirHashes.set(f, theirs);
  const a = NET.hashes.get(f), b = NET.theirHashes.get(f);
  if (a === undefined || b === undefined) return;
  NET.hashes.delete(f); NET.theirHashes.delete(f);
  if (a !== b) { NET.desyncs++; if (NET.role === 'host') netSend({ t: 'sync', f: NET.frame + NET.delay * 2, snap: null, req: true }), NET.syncAt = NET.frame + NET.delay * 2; }
}
// The host snapshots its state at an agreed future frame; the guest applies it when it reaches that frame
const SNAP_SKIP = new Set(['rig', 'ai', 'snap', 'poseName', '_smoke', 'ch', 'keys', 'buf', 'trail', 'trail1', 'trail2', 'lastHitBy', 'grabbing', 'grabber']);
function snapFighter(f) {
  const o = {};
  for (const k of Object.keys(f)) { if (SNAP_SKIP.has(k)) continue; const v = f[k]; if (typeof v === 'function') continue;
    try { o[k] = v === undefined ? null : JSON.parse(JSON.stringify(v, (kk, vv) => (vv && typeof vv === 'object' && vv.ch && 'stocks' in vv) ? undefined : vv)); } catch (e) { /* cyclic: skip */ } }
  o._lh = f.lastHitBy ? f.lastHitBy.id : -1; o._gi = f.grabbing ? f.grabbing.id : -1; o._gr = f.grabber ? f.grabber.id : -1;
  return o;
}
function netMaybeSnapshot() {
  if (NET.role !== 'host' || NET.syncAt === undefined || NET.frame !== NET.syncAt) return;
  NET.syncAt = undefined; NET.resyncs++;
  netSend({ t: 'sync', f: NET.frame, snap: { fighters: fighters.map(snapFighter), rng: NET.rng.state(),
    g: { frame: G.frame, time: G.time, hitstop: G.hitstop, mode: G.mode, countT: G.countT, goT: G.goT, endT: G.endT, timeLeft: G.timeLeft, suddenDeath: !!G.suddenDeath, sdNext: !!G.sdNext },
    cam: G.cam, carry: NET.carry } });
}
function netApplySnapshot(m) {
  if (!m.snap) return;                                                        // (a resync request: the host follows up with the data)
  const s = m.snap;
  s.fighters.forEach((o, i) => { const f = fighters[i]; for (const k of Object.keys(o)) if (k[0] !== '_') f[k] = o[k];
    f.lastHitBy = o._lh >= 0 ? fighters[o._lh] : null; f.grabbing = o._gi >= 0 ? fighters[o._gi] : null; f.grabber = o._gr >= 0 ? fighters[o._gr] : null; });
  Object.assign(G, s.g); G.cam = s.cam; NET.rng.set(s.rng); NET.carry = s.carry; NET.resyncs++;
}

/* ---------- per-frame upkeep (ping, lobby status) ---------- */
function netTick() {
  if (!NET.connected) return;
  const now = performance.now();
  if (now - NET.pingSent > 2000) { NET.pingSent = now; netSend({ t: 'ping', k: now }); }
  if (NET.active) netMaybeSnapshot();
  if (G.screen === 'scr-online' && (G.time & 31) === 0) { const p = document.getElementById('net-ping'); if (p) p.textContent = NET.ping ? `Latency ${NET.ping.toFixed(0)} ms` : ''; }
}

/* ---------- Online screen ---------- */
function netStatus(s) { NET.status = s; const el = document.getElementById('net-status'); if (el) el.textContent = s; }
function netToast(s) { const el = document.getElementById('net-toast'); if (!el) return; el.textContent = s; el.classList.add('show'); clearTimeout(netToast.t); netToast.t = setTimeout(() => el.classList.remove('show'), 3200); }
function openOnline() { go('scr-online'); netUI(); }
function netUI() {
  const $n = id => document.getElementById(id); if (!$n('scr-online')) return;
  const ok = typeof RTCPeerConnection === 'function';
  $n('net-unsupported').style.display = ok ? 'none' : 'block';
  $n('scr-online').classList.toggle('connected', NET.connected);
  const me = CHARS[SEL.p1], them = NET.peer ? CHARS[NET.peer.c] : null;
  $n('net-me').textContent = me.name; $n('net-me').style.color = skinOf(me, skinIdx(me)).color;
  $n('net-them').textContent = them ? them.name : (NET.connected ? '…' : '–'); if (them) $n('net-them').style.color = skinOf(them, NET.peer.s).color;
  $n('net-stage').textContent = SEL.randStage ? 'Random' : STAGES[SEL.stage].name;
  $n('net-start').style.display = NET.role === 'host' ? '' : 'none';
  $n('net-wait').style.display = NET.role === 'guest' && NET.connected ? '' : 'none';
  $n('net-stagebtn').style.display = NET.role === 'host' ? '' : 'none';
}
(function wireOnline() {
  const scr = document.getElementById('scr-online'); if (!scr) return;
  const $n = id => document.getElementById(id);
  const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
  scr.addEventListener('click', async e => {
    const b = e.target.closest('[data-net]'); if (!b) return;
    const a = b.dataset.net;
    try {
      if (a === 'host') { busy(b, true); $n('net-offer').value = await netHost(); $n('net-offer').select(); }
      else if (a === 'accept') { busy(b, true); await netAcceptAnswer($n('net-answer-in').value); }
      else if (a === 'join') { busy(b, true); $n('net-answer').value = await netJoin($n('net-offer-in').value); $n('net-answer').select(); }
      else if (a === 'copy') { const t = $n(b.dataset.src); t.select(); try { await navigator.clipboard.writeText(t.value); } catch (err) { document.execCommand('copy'); } netToast('Code copied'); }
      else if (a === 'paste') { try { $n(b.dataset.dst).value = await navigator.clipboard.readText(); } catch (err) { netToast('Paste it in by hand'); } }
      else if (a === 'share') { const v = $n(b.dataset.src).value; if (navigator.share) await navigator.share({ title: 'NEON BRAWL', text: v }); else { await navigator.clipboard.writeText(v); netToast('Code copied'); } }
      else if (a === 'fighter') { SEL.selectReturn = 'online'; go('scr-select'); }
      else if (a === 'stage') { SEL.selectReturn = 'online'; go('scr-stage'); }
      else if (a === 'start') netSendStart();
      else if (a === 'leave') { netClose(); netUI(); }
      else if (a === 'back') { if (!NET.connected) netClose(true); go('scr-main'); }
    } catch (err) { netToast(err.message || String(err)); netStatus('Something went wrong — try again'); }
    finally { busy(b, false); netUI(); }
  });
})();
