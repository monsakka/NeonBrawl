import { LOADOUT, SLURP, WEAPONS, type WeaponDef, type WeaponId } from '../config';

export interface AmmoState {
  mag: number;
  reserve: number;
}

/** Per-actor weapon state: slots, ammo, cooldowns, bloom, reload and slurp timers. */
export class Loadout {
  readonly slots: WeaponId[] = LOADOUT.slice();
  index = 1;
  ammo = new Map<WeaponId, AmmoState>();
  slurps = SLURP.count;
  cooldown = 0;
  equipTimer = 0;
  reloadTimer = 0;
  /** Extra bloom accumulated by firing (radians); decays over time. */
  bloom = 0;
  drinkTimer = 0;
  healPool = 0;
  healTick = 0;
  triggerHeld = false;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.index = 1;
    this.cooldown = this.equipTimer = this.reloadTimer = this.bloom = 0;
    this.drinkTimer = this.healPool = this.healTick = 0;
    this.slurps = SLURP.count;
    for (const id of this.slots) {
      const def = WEAPONS[id];
      if (def.magSize > 0) this.ammo.set(id, { mag: def.magSize, reserve: def.reserve });
    }
  }

  get current(): WeaponId {
    return this.slots[this.index];
  }

  get def(): WeaponDef {
    return WEAPONS[this.current];
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  get drinking(): boolean {
    return this.drinkTimer > 0;
  }

  /** Switching cancels reloads and drinking (like Fortnite) and applies a short equip delay. */
  select(index: number): boolean {
    const i = ((index % this.slots.length) + this.slots.length) % this.slots.length;
    if (i === this.index) return false;
    this.index = i;
    this.reloadTimer = 0;
    this.drinkTimer = 0;
    this.equipTimer = this.def.kind === 'hitscan' ? 0.22 : 0.1;
    return true;
  }
}
