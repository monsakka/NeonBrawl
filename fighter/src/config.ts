// Central tuning table. Everything gameplay-relevant lives here so balance passes
// never require touching system code.

export const GRID = 4; // build grid cell size in metres (x, y and z)
export const BUILD_THICKNESS = 0.2;
export const CONE_HEIGHT = 1.8;
export const MAP_HALF = 150; // playable area is [-MAP_HALF, MAP_HALF] on x/z
export const MAX_BUILD_LEVEL = 30;

export const FIXED_DT = 1 / 60;
export const GRAVITY = -24;

export type PieceType = 'wall' | 'floor' | 'ramp' | 'cone';
export type MaterialType = 'wood' | 'brick' | 'metal';
export const MATERIAL_ORDER: MaterialType[] = ['wood', 'brick', 'metal'];
export const PIECE_ORDER: PieceType[] = ['wall', 'floor', 'ramp', 'cone'];

export interface MaterialDef {
  label: string;
  maxHp: number;
  /** Fraction of max HP a piece spawns with; it grows to full over buildTime. */
  startHpFrac: number;
  buildTime: number;
  cost: number;
  tint: number;
}

export const MATERIALS: Record<MaterialType, MaterialDef> = {
  wood: { label: 'Wood', maxHp: 150, startHpFrac: 0.6, buildTime: 1.5, cost: 10, tint: 0xc8925a },
  brick: { label: 'Brick', maxHp: 300, startHpFrac: 0.3, buildTime: 4, cost: 10, tint: 0xb0614a },
  metal: { label: 'Metal', maxHp: 500, startHpFrac: 0.2, buildTime: 7, cost: 10, tint: 0x9aa6b2 },
};

export const START_MATERIALS: Record<MaterialType, number> = { wood: 500, brick: 400, metal: 300 };
export const MAX_MATERIALS = 999;

export const PIECE_KEYS: Record<PieceType, string> = { wall: 'Z', floor: 'X', ramp: 'C', cone: 'V' };

// ---------------------------------------------------------------- player
export const PLAYER = {
  maxHealth: 100,
  maxShield: 100,
  radius: 0.38,
  standHalfHeight: 0.55, // capsule total height = 2 * (hh + r) = 1.86 m
  crouchHalfHeight: 0.17, // 1.1 m - fits through a one-tile wall edit
  eyeStand: 1.62,
  eyeCrouch: 0.95,
  walkSpeed: 5.4,
  sprintSpeed: 7.6,
  crouchSpeed: 2.9,
  adsSpeed: 3.6,
  groundAccel: 70,
  airAccel: 14,
  jumpVelocity: 8.4,
  fallDamageSpeed: 17, // impact speed (m/s) above which fall damage starts
  fallDamagePerMs: 6,
  siphon: 50, // health/shield restored on elimination (Zone Wars default)
  siphonMaterials: 50,
};

// ---------------------------------------------------------------- weapons
export type WeaponId = 'pickaxe' | 'ar' | 'shotgun' | 'slurp';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  kind: 'hitscan' | 'melee' | 'consumable';
  damage: number; // per pellet / swing
  headMult: number;
  structureDamage: number; // per pellet / swing against builds
  fireInterval: number;
  auto: boolean;
  magSize: number;
  reserve: number;
  reloadTime: number;
  pellets: number;
  range: number;
  /** distance band [full, zero] used for linear damage falloff (shotgun). */
  falloff?: [number, number];
  minFalloff?: number;
  // bloom (radians)
  baseSpread: number;
  spreadPerShot: number;
  maxSpread: number;
  spreadRecovery: number;
  adsSpreadMult: number;
  recoilKick: number;
  rarity: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    id: 'pickaxe', name: 'Harvesting Tool', short: 'Pickaxe', kind: 'melee',
    damage: 20, headMult: 1, structureDamage: 50, fireInterval: 0.55, auto: true,
    magSize: 0, reserve: 0, reloadTime: 0, pellets: 1, range: 3.4,
    baseSpread: 0, spreadPerShot: 0, maxSpread: 0, spreadRecovery: 1, adsSpreadMult: 1, recoilKick: 0,
    rarity: '#9aa3ad',
  },
  ar: {
    id: 'ar', name: 'Assault Rifle', short: 'AR', kind: 'hitscan',
    damage: 30, headMult: 1.5, structureDamage: 22, fireInterval: 0.18, auto: true,
    magSize: 30, reserve: 240, reloadTime: 2.2, pellets: 1, range: 220,
    baseSpread: 0.012, spreadPerShot: 0.011, maxSpread: 0.075, spreadRecovery: 0.16, adsSpreadMult: 0.35,
    recoilKick: 0.012, rarity: '#3fa2ff',
  },
  shotgun: {
    id: 'shotgun', name: 'Tactical Shotgun', short: 'Tac', kind: 'hitscan',
    damage: 8, headMult: 1.6, structureDamage: 9, fireInterval: 0.82, auto: false,
    magSize: 8, reserve: 48, reloadTime: 3.6, pellets: 10, range: 45,
    falloff: [7, 32], minFalloff: 0.35,
    baseSpread: 0.06, spreadPerShot: 0.03, maxSpread: 0.11, spreadRecovery: 0.09, adsSpreadMult: 0.75,
    recoilKick: 0.05, rarity: '#4fd14f',
  },
  slurp: {
    id: 'slurp', name: 'Slurp Juice', short: 'Slurp', kind: 'consumable',
    damage: 0, headMult: 1, structureDamage: 0, fireInterval: 0.3, auto: false,
    magSize: 0, reserve: 0, reloadTime: 0, pellets: 0, range: 0,
    baseSpread: 0, spreadPerShot: 0, maxSpread: 0, spreadRecovery: 1, adsSpreadMult: 1, recoilKick: 0,
    rarity: '#b45cff',
  },
};

export const LOADOUT: WeaponId[] = ['pickaxe', 'ar', 'shotgun', 'slurp'];

export const SLURP = {
  count: 2,
  drinkTime: 2.0,
  total: 75,
  tickInterval: 0.2, // +1 health (or shield once health is full) per tick -> 15 s
};

// Moving-air / shooting bloom penalties (radians added to the current spread).
export const BLOOM = {
  moving: 0.018,
  sprinting: 0.03,
  airborne: 0.05,
  crouchMult: 0.7,
};

// ---------------------------------------------------------------- storm
export interface StormPhaseDef {
  wait: number; // seconds before the shrink starts (next circle visible)
  shrink: number; // seconds the shrink/shift takes
  radius: number; // radius at the end of this phase
  damage: number; // damage per tick while outside during this phase
}

export const STORM_START_RADIUS = 95;
export const STORM_TICK = 1.0;
/** Fortnite storm damage ignores shields; flip to false to drain shield first. */
export const STORM_IGNORES_SHIELD = true;

export const STORM_PHASES: StormPhaseDef[] = [
  { wait: 25, shrink: 25, radius: 62, damage: 2 },
  { wait: 18, shrink: 20, radius: 40, damage: 3 },
  { wait: 14, shrink: 18, radius: 24, damage: 5 },
  { wait: 12, shrink: 15, radius: 13, damage: 8 },
  { wait: 10, shrink: 14, radius: 5, damage: 10 },
  { wait: 8, shrink: 20, radius: 0, damage: 10 },
];

// ---------------------------------------------------------------- tournament
export const ROUNDS_PER_SESSION = 5;
export const BOT_COUNT = 9;
export const ELIM_POINTS = 2;
/** Index = placement (1-based). Anything beyond the table scores 0. */
export const PLACEMENT_POINTS = [0, 10, 7, 5, 4, 3, 2, 1, 1, 0, 0];
