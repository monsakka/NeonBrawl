/* NEON BRAWL — Canvas setup and shared game state (G, SEL, SET, input sets, fx, projs). */
'use strict';

/* ============================== SETUP =============================== */
const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
const mainCtx = ctx;
/* Resolution + full-bleed viewport. The game is designed in a 1280 × 720 "safe area", but the screen is never
 * letterboxed: the logical view VIEW.LW × VIEW.LH always has the screen's real aspect ratio and fully contains the
 * safe area (wider phones see more of the arena left/right, 4:3 tablets see more above/below). VIEW.OX / OY is
 * where the safe area sits inside the view, VIEW.u is CSS pixels per logical pixel. The canvas backing store is
 * the on-screen size × devicePixelRatio (0.25 steps, capped at 3× ≈ 4K), so everything stays pin-sharp.         */
let DPR = 1;
const VIEW = { LW: W, LH: H, OX: 0, OY: 0, u: 1, cssW: W, cssH: H };
function computeView(cw, ch) {
  const a = cw / Math.max(1, ch);
  if (a >= W / H) { VIEW.LH = H; VIEW.LW = Math.round(H * a); } else { VIEW.LW = W; VIEW.LH = Math.round(W / a); }
  VIEW.OX = (VIEW.LW - W) / 2; VIEW.OY = (VIEW.LH - H) / 2; VIEW.u = cw / VIEW.LW; VIEW.cssW = cw; VIEW.cssH = ch;
}
function sizeCanvas() {
  const r = canvas.getBoundingClientRect(), cw = r.width || W, ch = r.height || H;
  computeView(cw, ch);
  const cap = SET.res === 'balanced' ? 1.5 : 3;
  const d = Math.round(Math.min(cap, Math.max(1, cw * (window.devicePixelRatio || 1) / VIEW.LW)) * 4) / 4;
  const bw = Math.round(VIEW.LW * d), bh = Math.round(VIEW.LH * d);
  if (d !== DPR || canvas.width !== bw || canvas.height !== bh) { DPR = d; canvas.width = bw; canvas.height = bh; }
  if (typeof GL3D !== 'undefined' && GL3D.ok) GL3D.resize();
}

const G = {
  mode: 'menu',            // menu | count | play | ending | over
  screen: 'scr-intro',     // which HTML overlay screen is showing (the game opens on the intro splash)
  diff: 1, paused: false, frame: 0, time: 0,
  countT: 0, goT: 0, endT: 0, winner: null,
  hitstop: 0, shake: 0, flash: 0, vig: 0,
  cam: { x: 640, y: 330, z: 1 },
  echoes: []               // Chronos's pending time-echo hits
};
const SEL = { p1: 0, cpu: null, stage: 0, randStage: false, hazards: true, diff: 1, slot: 'p1', hover: null, time: 0,   // menu selection (cpu null = random; time = limit in seconds, 0 = none)
              skins: {}, justPicked: false };                                // skins: chosen costume per fighter id (0..2)
const skinIdx = ch => SEL.skins[ch.id] || 0;
const TRAIN = { ai: 'stand', hitboxes: true };                     // Training mode: dummy behaviour + hitbox overlay (ui/training.js)
const NET = { active: false };                                       // online (LAN) match state (game/netplay.js)
const SET = { shake: 1, hitstop: true, part: 1, aim: true, flash: true, touch: 'auto', limbs: 'jointed', res: 'high', roster: 'all', gfx: '3d',
              renderer: 'webgl', music: 0.7, sfx: 0.7, fullscreen: true, haptics: true, hitboxes: false };   // user settings

/* Game events: gameplay code announces what happened (hits, jumps, KOs…) and presentation layers (audio, camera)
 * listen. Listeners never change the simulation, so the gameplay stays deterministic. */
const GAME_EVENT_LISTENERS = [];
// (listeners always see the browser's own Math.random: during online play the sim runs on a shared seeded RNG, and a
//  listener that only exists on one device — audio, haptics — must never consume numbers from it)
const NATIVE_RANDOM = Math.random;
function gameEvent(type, data) {
  const r = Math.random; Math.random = NATIVE_RANDOM;
  try { for (const fn of GAME_EVENT_LISTENERS) { try { fn(type, data || {}); } catch (e) { /* presentation must never break the sim */ } } }
  finally { Math.random = r; }
}

const keys = new Set();      // held keys
const pressed = new Set();   // pressed since last logic step ('M0' = left click, 'M2' = right click)
const mouse = { cx: 640, cy: 360 };     // cursor in canvas coordinates
const TOUCH = { using: false, seen: false, sx: 0, sy: 0 };   // touch controls: using = last input was a finger; sx/sy = stick (-1..1)
const fx = [];               // particles / effects
const projs = [];            // projectiles
