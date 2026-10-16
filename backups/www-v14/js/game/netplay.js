/* NEON BRAWL — Online multiplayer: peer-to-peer WebRTC data channels, no game server.
 *
 * Room codes (anywhere on the internet):
 *   1. HOST taps "Create room" and gets a 6-character code (e.g. K7Q2ZP). The game registers that code with the free
 *      public PeerJS signalling relay (wss://0.peerjs.com) — a mailbox that only passes the WebRTC connection details
 *      (session descriptions + ICE candidates) between the two players.
 *   2. GUEST types the code: an offer goes through the relay to the host, the answer comes back, ICE candidates
 *      trickle both ways. Public STUN servers (Google, Cloudflare, Twilio) let each device discover its public address,
 *      so the two connect DIRECTLY through most home routers (no TURN relay: a very strict NAT on both ends can block it).
 *   3. The data channel opens, the relay connection is closed, and from then on the two devices talk only to each other.
 * Same-Wi-Fi fallback (no internet at all): copy / paste / share the full compressed offer + answer codes by hand.
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
// public STUN servers: each device learns its public address, so peers on different networks can reach each other
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
                     { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:global.stun.twilio.com:3478' }];
function netPC() {
  if (NET.pc) try { NET.pc.close(); } catch (e) { /* already closed */ }
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });              // host (LAN / mDNS) + server-reflexive (public) candidates
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
/* ---------- room codes: signalling through the public PeerJS relay (its JSON WebSocket protocol) ---------- */
const SIG = { host: '0.peerjs.com', key: 'peerjs', prefix: 'neonbrawl-v14-', ws: null, hb: 0, peer: '', cid: '', open: false, cands: [] };   // (v14: new fighters, maps and physics tuning — older builds can't pair)
const ROOM_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRoomCode = () => Array.from({ length: 6 }, () => ROOM_ABC[(NATIVE_RANDOM() * ROOM_ABC.length) | 0]).join('');
const fmtRoom = c => c ? c.slice(0, 3) + ' ' + c.slice(3) : '— — —';
function sigOpen(id) {
  return new Promise((res, rej) => {
    sigClose();
    if (typeof WebSocket !== 'function') return rej(new Error('No WebSocket support here: use the same-Wi-Fi codes'));
    const ws = new WebSocket(`wss://${SIG.host}:443/peerjs?key=${SIG.key}&id=${encodeURIComponent(id)}&token=${NATIVE_RANDOM().toString(36).slice(2)}&version=1.5.4`);
    SIG.ws = ws; SIG.cands = [];
    const to = setTimeout(() => { rej(new Error('The room server did not answer — check your connection (or use the same-Wi-Fi codes)')); sigClose(); }, 10000);
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.type === 'OPEN') { clearTimeout(to); SIG.open = true; SIG.hb = setInterval(() => sigSend({ type: 'HEARTBEAT' }), 5000); res(); }
      else if (m.type === 'ID-TAKEN') { clearTimeout(to); sigClose(); rej(Object.assign(new Error('That room code is already in use'), { taken: true })); }
      else if (m.type === 'ERROR') { clearTimeout(to); sigClose(); rej(new Error((m.payload && m.payload.msg) || 'The room server refused the connection')); }
      else sigOnMessage(m).catch(err => netToast(err.message || String(err))); };
    ws.onerror = () => { clearTimeout(to); rej(new Error('Could not reach the room server — check your connection')); };
    ws.onclose = () => { SIG.open = false; clearInterval(SIG.hb); };
  });
}
function sigSend(m) { if (SIG.ws && SIG.ws.readyState === 1) try { SIG.ws.send(JSON.stringify(m)); } catch (e) { /* closing */ } }
function sigClose() { clearInterval(SIG.hb); if (SIG.ws) try { SIG.ws.close(); } catch (e) { /* closed */ } SIG.ws = null; SIG.open = false; }
// (the relay only forwards messages shaped like the PeerJS client's own: type 'data' + a connectionId)
const sigCand = pc => { pc.onicecandidate = e => { if (e.candidate && SIG.peer) sigSend({ type: 'CANDIDATE', dst: SIG.peer, payload: { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate, type: 'data', connectionId: SIG.cid } }); }; };
function sigFlush() { const pc = NET.pc; if (!pc || !pc.remoteDescription) return; for (const c of SIG.cands.splice(0)) pc.addIceCandidate(c).catch(() => {}); }
async function sigOnMessage(m) {
  const P = m.payload || {};
  if (m.type === 'OFFER' && NET.role === 'host' && !NET.connected) {                      // a guest knocks: answer it
    SIG.peer = m.src; SIG.cid = P.connectionId || SIG.cid; const pc = netPC(); pc.ondatachannel = e => wireDC(e.channel); sigCand(pc);
    await pc.setRemoteDescription(P.sdp); await pc.setLocalDescription(await pc.createAnswer());
    sigSend({ type: 'ANSWER', dst: SIG.peer, payload: { sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription, type: 'data', connectionId: SIG.cid } }); sigFlush();
    netStatus('A rival is connecting…');
  } else if (m.type === 'ANSWER' && NET.role === 'guest' && NET.pc && !NET.pc.remoteDescription) { await NET.pc.setRemoteDescription(P.sdp); sigFlush(); netStatus('Connecting…'); }
  else if (m.type === 'CANDIDATE' && P.candidate) { if (NET.pc && NET.pc.remoteDescription) NET.pc.addIceCandidate(P.candidate).catch(() => {}); else SIG.cands.push(P.candidate); }
  else if ((m.type === 'EXPIRE' || m.type === 'LEAVE') && NET.role === 'guest' && !NET.connected) netLost('Room ' + fmtRoom(NET.room) + ' was not found — check the code');
}
// HOST: claim a fresh room code on the relay and wait for a guest
async function netHostRoom() {
  netClose(true); NET.role = 'host'; NET.me = 0; NET.room = ''; netStatus('Opening a room…');
  for (let k = 0; k < 4 && !NET.room; k++) { const code = newRoomCode(); try { await sigOpen(SIG.prefix + code); NET.room = code; } catch (e) { if (!e.taken) { NET.role = null; throw e; } } }
  if (!NET.room) { NET.role = null; throw new Error('Could not get a free room code — try again'); }
  netStatus('Room ' + fmtRoom(NET.room) + ' · waiting for your rival'); return NET.room;
}
// GUEST: knock on the host's room with an offer; the answer + candidates come back through the relay
async function netJoinRoom(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) throw new Error('A room code has 6 letters / digits');
  netClose(true); NET.role = 'guest'; NET.me = 1; NET.room = code; netStatus('Joining room ' + fmtRoom(code) + '…');
  await sigOpen(SIG.prefix + 'g-' + newRoomCode() + newRoomCode()); SIG.peer = SIG.prefix + code; SIG.cid = 'dc_' + newRoomCode().toLowerCase() + newRoomCode().toLowerCase();
  const pc = netPC(); wireDC(pc.createDataChannel('neonbrawl', { ordered: true })); sigCand(pc);
  await pc.setLocalDescription(await pc.createOffer());
  sigSend({ type: 'OFFER', dst: SIG.peer, payload: { sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription, type: 'data', connectionId: SIG.cid, label: SIG.cid,
    serialization: 'json', reliable: true, metadata: { game: 'neonbrawl', v: 14 } } });
  clearTimeout(NET.joinTimer); NET.joinTimer = setTimeout(() => { if (!NET.connected && NET.role === 'guest') netLost('Could not reach room ' + fmtRoom(code) + ' — is the host still waiting?'); }, 25000);
}
function wireDC(dc) {
  NET.dc = dc;
  dc.onopen = () => { NET.connected = true; NET.lastRecv = performance.now(); clearTimeout(NET.joinTimer); sigClose(); netStatus('Connected'); netHello(); netUI(); sfx('select'); };
  dc.onclose = () => { if (NET.connected) netLost('Your rival left'); };
  dc.onmessage = e => { NET.lastRecv = performance.now(); try { netOnMessage(JSON.parse(e.data)); } catch (err) { console.warn('[net] bad message', err); } };
}
function netSend(m) { if (NET.dc && NET.dc.readyState === 'open') try { NET.dc.send(JSON.stringify(m)); } catch (e) { /* closing */ } }
function netClose(quiet) {
  if (NET.active) netEndMatch();
  if (NET.dc && NET.connected && !quiet) netSend({ t: 'bye' });
  try { if (NET.dc) NET.dc.close(); } catch (e) {} try { if (NET.pc) NET.pc.close(); } catch (e) {}
  sigClose(); clearTimeout(NET.joinTimer); SIG.peer = '';
  NET.dc = null; NET.pc = null; NET.connected = false; NET.peer = null; NET.role = null; NET.room = ''; netStatus('Not connected');
}
function netLost(why) {
  const wasPlaying = NET.active; NET.connected = false;
  if (wasPlaying) { netEndMatch(); go('scr-online'); }
  netClose(true); netStatus(why); netUI(); netToast(why);
}

/* ---------- messages ---------- */
// hello: your fighter + skin, and your username + equipped title (for your rival's lobby card and your 3D nameplate)
function netHello() { const ch = CHARS[SEL.p1]; netSend({ t: 'hello', c: SEL.p1, s: skinIdx(ch), n: typeof profileName === 'function' ? profileName() : '', ti: typeof passTitle === 'function' ? passTitle() : '', em: tauntSlots().slice(0, 2) }); }
// a taunt loadout received from the other device: only real emote kinds (they decide how long the taunt roots the fighter)
const cleanEmotes = a => Array.isArray(a) ? a.slice(0, 2).map(k => k === 'signature' || EMOTE_DUR[k] ? k : 'signature') : null;
function netOnMessage(m) {
  switch (m.t) {
    case 'hello': NET.peer = { c: Math.max(0, Math.min(CHARS.length - 1, m.c | 0)), s: Math.max(0, Math.min(SKIN_COUNT - 1, m.s | 0)), n: cleanName(m.n || ''), ti: cleanName(m.ti || '').slice(0, 24), em: cleanEmotes(m.em) }; netUI(); break;
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
  const stage = SEL.randStage ? pickFrom(playableStages()) : SEL.stage;
  // the input delay follows the measured round trip (one-way latency in frames + a safety margin): LAN 3 frames, far 4-9
  const delay = Math.max(3, Math.min(9, Math.ceil((NET.ping || 0) / 2 / STEP) + 2));
  const cfg = { seed: (Math.random() * 4294967296) >>> 0, stage, hazards: SEL.hazards, time: SEL.time || 0, delay,
                c0: SEL.p1, s0: skinIdx(CHARS[SEL.p1]), c1: NET.peer.c, s1: NET.peer.s, em0: tauntSlots().slice(0, 2), em1: NET.peer.em || null };
  if (cfg.c0 === cfg.c1 && cfg.s0 === cfg.s1) cfg.s1 = (cfg.s1 + 1) % SKIN_COUNT;   // mirror match: different skins
  netSend({ t: 'start', cfg }); netStart(cfg);
}
function netStart(cfg) {
  NET.cfg = cfg; NET.delay = Math.max(2, Math.min(9, cfg.delay | 0 || 3));                       // (both devices use the host's delay)
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
    fighters[0].emotes = cleanEmotes(cfg.em0); fighters[1].emotes = cleanEmotes(cfg.em1);   // both devices use the same taunt loadouts
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
const NB = ['left', 'right', 'down', 'shield', 'jump', 'heavy', 'jumpP', 'lightP', 'heavyP', 'specialP', 'tapL', 'tapR', 'ultP', 'emoteP', 'emote2P'];
const PRESS = ['jumpP', 'lightP', 'heavyP', 'specialP', 'tapL', 'tapR', 'ultP', 'emoteP', 'emote2P'];
// bits 0-13: buttons · bits 14-17: the emoji pressed (0 = none) — so taunts and emojis show on both screens
function packInput(i) { let b = 0; NB.forEach((k, n) => { if (i[k]) b |= 1 << n; }); b |= (i.emoji & 31) << 15; return [b, Math.round(i.aimX) | 0, Math.round(i.aimY) | 0]; }   // emoji: 5 bits (its EMOJIS index + 1)
function unpackInput(p) { const i = emptyInput(); NB.forEach((k, n) => { i[k] = !!(p[0] & (1 << n)); }); i.emoji = (p[0] >> 15) & 31; i.aimX = p[1]; i.aimY = p[2]; return i; }
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
  const consumes = G.mode !== 'menu' && G.mode !== 'over' && G.mode !== 'count' && !G.paused && !(G.hitstop > 0) && !(G.ultFreeze > 0);
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
  for (const f of fighters) { mix(Math.round(f.x * 10)); mix(Math.round(f.y * 10)); mix(Math.round(f.vx * 100)); mix(Math.round(f.vy * 100)); mix(Math.round(f.percent * 10)); mix(f.stocks); mix(f.state); mix(f.stateT); mix(Math.round((f.ult || 0) * 10)); }
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
    g: { frame: G.frame, time: G.time, hitstop: G.hitstop, mode: G.mode, countT: G.countT, goT: G.goT, endT: G.endT, timeLeft: G.timeLeft, suddenDeath: !!G.suddenDeath, sdNext: !!G.sdNext,
         ultFreeze: G.ultFreeze || 0, ultCine: G.ultCine ? Object.assign({}, G.ultCine) : null },
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
  const tag = (ti, n) => (ti ? '“' + ti + '” ' : '') + n;
  $n('net-me-n').textContent = tag(typeof passTitle === 'function' ? passTitle() : '', typeof profileName === 'function' ? profileName() : 'You');
  $n('net-them-n').textContent = NET.peer ? tag(NET.peer.ti, NET.peer.n || 'Rival') : '';
  $n('room-code').textContent = NET.role === 'host' && NET.room ? fmtRoom(NET.room) : '— — —';
  $n('room-code').classList.toggle('live', NET.role === 'host' && !!NET.room && !NET.connected);
  $n('net-stage').textContent = SEL.randStage ? 'Random' : STAGES[SEL.stage].name;
  $n('net-start').style.display = NET.role === 'host' ? '' : 'none';
  $n('net-wait').style.display = NET.role === 'guest' && NET.connected ? '' : 'none';
  $n('net-stagebtn').style.display = NET.role === 'host' ? '' : 'none';
  const lob = $n('net-nav-lobby'); if (lob) lob.textContent = NET.connected ? 'Connected · ' + (NET.peer ? NET.peer.n || 'Rival' : '…') : NET.role === 'host' && NET.room ? 'Waiting in ' + fmtRoom(NET.room) : 'Not connected';
  if (NET.connected !== NETHUB.conn) { NETHUB.conn = NET.connected; if (typeof hubShow === 'function') hubShow('net', NET.connected ? 'lobby' : 'host'); }   // the sub-menu jumps to the lobby on connect
}
const NETHUB = { conn: false };
(function wireOnline() {
  const scr = document.getElementById('scr-online'); if (!scr) return;
  const $n = id => document.getElementById(id);
  const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
  scr.addEventListener('click', async e => {
    const b = e.target.closest('[data-net]'); if (!b) return;
    const a = b.dataset.net;
    try {
      if (a === 'room-host') { busy(b, true); await netHostRoom(); netUI(); }
      else if (a === 'room-join') { busy(b, true); await netJoinRoom($n('room-in').value); }
      else if (a === 'room-copy' || a === 'room-share') { if (!NET.room) return netToast('Create a room first');
        const txt = 'Join my NEON BRAWL room: ' + NET.room;
        if (a === 'room-share' && navigator.share) await navigator.share({ title: 'NEON BRAWL', text: txt }); else { try { await navigator.clipboard.writeText(NET.room); } catch (err) { /* blocked */ } netToast('Room code copied: ' + fmtRoom(NET.room)); } }
      else if (a === 'host') { busy(b, true); $n('net-offer').value = await netHost(); $n('net-offer').select(); }
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
  const ri = $n('room-in');                                                       // room-code box: upper-case, Enter joins
  ri.addEventListener('input', () => { ri.value = ri.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 7); });
  ri.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') scr.querySelector('[data-net="room-join"]').click(); });
})();
