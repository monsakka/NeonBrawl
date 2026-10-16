/* NEON BRAWL — Canvas setup and shared game state (G, SEL, SET, input sets, fx, projs). */
'use strict';

/* ============================== SETUP =============================== */
const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
const mainCtx = ctx;
/* Resolution: the game is laid out in 1280 × 720 logical pixels, and the canvas backing store is sized to the
 * real on-screen size × devicePixelRatio (rounded to 0.25 steps, capped at 3× ≈ 4K), so vector shapes, glows and
 * text stay pin-sharp on phones, Retina and 4K screens. render() draws with setTransform(DPR, ...).            */
let DPR = 1;
function sizeCanvas() {
  const css = canvas.getBoundingClientRect().width || W;
  const cap = SET.res === 'balanced' ? 1.5 : 3;
  const d = Math.round(Math.min(cap, Math.max(1, css * (window.devicePixelRatio || 1) / W)) * 4) / 4;
  if (d !== DPR || canvas.width !== Math.round(W * d)) { DPR = d; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); }
}

const G = {
  mode: 'menu',            // menu | count | play | ending | over
  screen: 'scr-main',      // which HTML overlay screen is showing
  diff: 1, paused: false, frame: 0, time: 0,
  countT: 0, goT: 0, endT: 0, winner: null,
  hitstop: 0, shake: 0, flash: 0, vig: 0,
  cam: { x: 640, y: 330, z: 1 },
  echoes: []               // Chronos's pending time-echo hits
};
const SEL = { p1: 0, cpu: null, stage: 0, randStage: false, hazards: true, diff: 1, slot: 'p1', hover: null,   // menu selection (cpu null = random)
              skins: {}, justPicked: false };                                // skins: chosen costume per fighter id (0..2)
const skinIdx = ch => SEL.skins[ch.id] || 0;
const SET = { shake: 1, hitstop: true, part: 1, aim: true, flash: true, touch: 'auto', limbs: 'jointed', res: 'high', roster: 'all', gfx: '3d' };   // user settings

const keys = new Set();      // held keys
const pressed = new Set();   // pressed since last logic step ('M0' = left click, 'M2' = right click)
const mouse = { cx: 640, cy: 360 };     // cursor in canvas coordinates
const TOUCH = { using: false, seen: false, sx: 0, sy: 0 };   // touch controls: using = last input was a finger; sx/sy = stick (-1..1)
const fx = [];               // particles / effects
const projs = [];            // projectiles
