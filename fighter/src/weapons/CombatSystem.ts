import * as THREE from 'three';
import { BLOOM, MAX_MATERIALS, PLAYER, SLURP, WEAPONS, type WeaponDef, type WeaponId } from '../config';
import { audio } from '../core/Audio';
import { Physics, G_ALL, type RayHit } from '../core/Physics';
import type { Actor } from '../actors/Actor';
import type { BuildingSystem } from '../building/BuildingSystem';
import type { BuildPiece } from '../building/BuildPiece';
import type { Effects } from '../fx/Effects';
import type { GameWorld } from '../world/World';

const tmpMuzzle = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

interface PendingActorHit {
  damage: number;
  headshot: boolean;
  point: THREE.Vector3;
}

/**
 * Weapons for every actor: hitscan guns with bloom, the pickaxe, Slurp Juice,
 * reloads and the damage pipeline into actors, builds and harvestable props.
 */
export class CombatSystem {
  /** Called when the player's own weapon kicks (camera recoil). */
  onPlayerRecoil: ((kick: number) => void) | null = null;
  private readonly physics: Physics;
  private readonly building: BuildingSystem;
  private readonly world: GameWorld;
  private readonly fx: Effects;

  constructor(physics: Physics, building: BuildingSystem, world: GameWorld, fx: Effects) {
    this.physics = physics;
    this.building = building;
    this.world = world;
    this.fx = fx;
  }

  /** Current bloom cone half-angle (radians) for the actor's equipped weapon. */
  spreadFor(actor: Actor): number {
    const def = actor.loadout.def;
    if (def.kind !== 'hitscan') return 0;
    let s = def.baseSpread + actor.loadout.bloom;
    const speed = actor.horizontalSpeed;
    if (!actor.grounded) s += BLOOM.airborne;
    else if (actor.sprinting && speed > 1) s += BLOOM.sprinting;
    else if (speed > 1) s += BLOOM.moving * Math.min(1, speed / 5);
    if (actor.crouching) s *= BLOOM.crouchMult;
    if (actor.ads) s *= def.adsSpreadMult;
    return s;
  }

  canFire(actor: Actor): boolean {
    const lo = actor.loadout;
    return actor.alive && lo.cooldown <= 0 && lo.equipTimer <= 0 && !lo.reloading && !lo.drinking;
  }

  /**
   * Pulls the trigger. `origin`/`dir` is the aim ray: the camera for the player
   * (shots are re-traced from the character so walls in front of you still block),
   * the eyes for bots.
   */
  fire(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (!this.canFire(actor)) return false;
    const lo = actor.loadout;
    const def = lo.def;

    if (def.kind === 'consumable') return this.startDrink(actor);
    if (def.kind === 'melee') {
      this.swing(actor, origin, dir, def);
      return true;
    }

    const ammo = lo.ammo.get(def.id)!;
    if (ammo.mag <= 0) {
      if (actor.isPlayer) audio.play('empty');
      this.reload(actor);
      lo.cooldown = 0.25;
      return false;
    }
    ammo.mag--;
    lo.cooldown = def.fireInterval;
    this.shoot(actor, origin, dir, def);
    lo.bloom = Math.min(def.maxSpread, lo.bloom + def.spreadPerShot);
    actor.sprinting = false;
    actor.avatar.recoil(def.id === 'shotgun' ? 1 : 0.4);
    if (actor.isPlayer) this.onPlayerRecoil?.(def.recoilKick);
    audio.play(def.id === 'shotgun' ? 'shotgun' : 'ar', actor.position, actor.isPlayer ? 0.7 : 0.9);
    return true;
  }

  reload(actor: Actor): void {
    const lo = actor.loadout;
    const def = lo.def;
    if (def.kind !== 'hitscan' || lo.reloading) return;
    const ammo = lo.ammo.get(def.id)!;
    if (ammo.mag >= def.magSize || ammo.reserve <= 0) return;
    lo.reloadTimer = def.reloadTime;
    if (actor.isPlayer) audio.play('reload');
  }

  private shoot(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef): void {
    const spread = this.spreadFor(actor);
    const eye = actor.eye();
    const t0 = Math.max(0, eye.clone().sub(origin).dot(dir));
    const start = origin.clone().addScaledVector(dir, t0);
    const muzzle = actor.avatar.muzzleWorld(tmpMuzzle).clone();
    this.fx.muzzleFlash(muzzle, def.id === 'shotgun' ? 1.6 : 1);

    const actorHits = new Map<Actor, PendingActorHit>();
    const pieceHits = new Map<BuildPiece, number>();

    for (let p = 0; p < def.pellets; p++) {
      const d = this.perturb(dir, spread, def.pellets > 1);
      // 1) Where is the crosshair pointing?
      const aimHit = this.physics.raycast(start, d, def.range, G_ALL, actor.collider);
      const target = aimHit ? aimHit.point : start.clone().addScaledVector(d, def.range);
      // 2) Can the gun actually reach that point from the character?
      const from = eye;
      const v = target.clone().sub(from);
      const len = v.length();
      if (len < 0.01) continue;
      v.divideScalar(len);
      const hit = this.physics.raycast(from, v, len + 0.05, G_ALL, actor.collider);
      const end = hit ? hit.point : target;
      if (p < 4) this.fx.tracer(muzzle, end, actor.isPlayer ? 0xfff2b0 : 0xffb070);
      if (!hit) continue;

      const travelled = hit.point.distanceTo(from);
      const falloff = this.falloff(def, travelled);
      this.resolveHit(actor, def, hit, falloff, actorHits, pieceHits);
    }

    for (const [victim, h] of actorHits) {
      victim.takeDamage(Math.round(h.damage), actor, def.id, { headshot: h.headshot, point: h.point });
    }
    for (const [piece, dmg] of pieceHits) this.building.damagePiece(piece, Math.round(dmg), actor);
  }

  private resolveHit(
    actor: Actor,
    def: WeaponDef,
    hit: RayHit,
    falloff: number,
    actorHits: Map<Actor, PendingActorHit>,
    pieceHits: Map<BuildPiece, number>,
  ): void {
    const owner = hit.owner;
    if (!owner) return;
    switch (owner.kind) {
      case 'actor': {
        const victim = owner.actor;
        if (!victim.alive || victim === actor) return;
        const head = hit.point.y - victim.position.y > victim.headLine;
        const dmg = def.damage * (head ? def.headMult : 1) * falloff;
        const prev = actorHits.get(victim);
        if (prev) {
          prev.damage += dmg;
          prev.headshot ||= head;
        } else {
          actorHits.set(victim, { damage: dmg, headshot: head, point: hit.point.clone() });
        }
        this.fx.impact(hit.point, hit.normal, victim.shield > 0 ? 0x6fc8ff : 0xffffff, 4);
        break;
      }
      case 'build': {
        pieceHits.set(owner.piece, (pieceHits.get(owner.piece) ?? 0) + def.structureDamage * falloff);
        this.fx.impact(hit.point, hit.normal, 0xd9b48a, 3);
        break;
      }
      case 'prop': {
        if (def.kind === 'melee') this.harvest(actor, owner.prop, def.structureDamage);
        else this.world.harvest(owner.prop, def.structureDamage * falloff * 0.5);
        this.fx.impact(hit.point, hit.normal, owner.prop.kind === 'tree' ? 0x8a5a2b : 0xaaaaaa, 3);
        break;
      }
      case 'ground':
        this.fx.impact(hit.point, hit.normal, 0x9c8b6a, 3);
        break;
    }
  }

  private harvest(actor: Actor, prop: Parameters<GameWorld['harvest']>[0], damage: number): void {
    const gained = this.world.harvest(prop, damage);
    if (gained > 0) {
      actor.materials[prop.material] = Math.min(MAX_MATERIALS, actor.materials[prop.material] + gained);
    }
  }

  private swing(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef): void {
    const lo = actor.loadout;
    lo.cooldown = def.fireInterval;
    actor.avatar.swingPickaxe();
    const eye = actor.eye();
    const t0 = Math.max(0, eye.clone().sub(origin).dot(dir));
    const start = origin.clone().addScaledVector(dir, t0);
    const hit = this.physics.raycast(start, dir, def.range, G_ALL, actor.collider);
    if (!hit) {
      audio.play('pickaxe', actor.position, actor.isPlayer ? 0.6 : 0.4);
      return;
    }
    const actorHits = new Map<Actor, PendingActorHit>();
    const pieceHits = new Map<BuildPiece, number>();
    this.resolveHit(actor, def, hit, 1, actorHits, pieceHits);
    for (const [victim, h] of actorHits) victim.takeDamage(h.damage, actor, def.id, { point: h.point });
    for (const [piece, dmg] of pieceHits) this.building.damagePiece(piece, dmg, actor);
    audio.play('pickaxeHit', hit.point, actor.isPlayer ? 0.8 : 0.5);
  }

  private startDrink(actor: Actor): boolean {
    const lo = actor.loadout;
    if (lo.slurps <= 0) return false;
    if (actor.health >= PLAYER.maxHealth && actor.shield >= PLAYER.maxShield) return false;
    lo.drinkTimer = SLURP.drinkTime;
    audio.play('slurp', actor.position, actor.isPlayer ? 0.8 : 0.4);
    return true;
  }

  private falloff(def: WeaponDef, dist: number): number {
    if (!def.falloff) return 1;
    const [full, zero] = def.falloff;
    if (dist <= full) return 1;
    const t = Math.min(1, (dist - full) / (zero - full));
    return 1 - t * (1 - (def.minFalloff ?? 0));
  }

  /** Random direction inside a cone of half-angle `spread` around `dir`. */
  private perturb(dir: THREE.Vector3, spread: number, uniformRing: boolean): THREE.Vector3 {
    if (spread <= 0) return dir.clone();
    const right = new THREE.Vector3().crossVectors(dir, up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
    const ang = Math.random() * Math.PI * 2;
    // Shotgun pellets spread evenly over the cone; single bullets cluster to the centre.
    const r = spread * (uniformRing ? Math.sqrt(Math.random()) : Math.random());
    return dir.clone()
      .addScaledVector(right, Math.cos(ang) * Math.tan(r))
      .addScaledVector(upv, Math.sin(ang) * Math.tan(r))
      .normalize();
  }

  /** Timers: cooldowns, bloom recovery, reloads, drinking and heal-over-time. */
  update(dt: number, actors: readonly Actor[]): void {
    for (const a of actors) {
      if (!a.alive) continue;
      const lo = a.loadout;
      const def = lo.def;
      lo.cooldown = Math.max(0, lo.cooldown - dt);
      lo.equipTimer = Math.max(0, lo.equipTimer - dt);
      lo.bloom = Math.max(0, lo.bloom - def.spreadRecovery * dt);

      if (lo.reloadTimer > 0) {
        lo.reloadTimer -= dt;
        if (lo.reloadTimer <= 0) {
          lo.reloadTimer = 0;
          const ammo = lo.ammo.get(def.id);
          if (ammo) {
            const take = Math.min(def.magSize - ammo.mag, ammo.reserve);
            ammo.mag += take;
            ammo.reserve -= take;
          }
        }
      }

      if (lo.drinkTimer > 0) {
        lo.drinkTimer -= dt;
        if (lo.drinkTimer <= 0) {
          lo.drinkTimer = 0;
          lo.slurps--;
          lo.healPool += SLURP.total;
          lo.healTick = 0;
          if (lo.slurps <= 0 && lo.current === 'slurp') lo.select(1);
        }
      }

      if (lo.healPool > 0) {
        if (a.health >= PLAYER.maxHealth && a.shield >= PLAYER.maxShield) {
          lo.healPool = 0;
        } else {
          lo.healTick -= dt;
          while (lo.healTick <= 0 && lo.healPool > 0) {
            a.heal(1);
            lo.healPool--;
            lo.healTick += SLURP.tickInterval;
          }
        }
      }
      a.avatar.setWeapon(lo.current);
    }
  }

  weaponLabel(id: WeaponId): string {
    return WEAPONS[id].name;
  }
}
