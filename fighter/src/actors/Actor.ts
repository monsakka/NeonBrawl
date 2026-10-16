import * as THREE from 'three';
import { GRAVITY, MATERIALS, MAX_MATERIALS, PLAYER, START_MATERIALS, type MaterialType } from '../config';
import { events } from '../core/Events';
import { Physics, RAPIER, G_ACTOR, G_ALL, G_SOLID, groups } from '../core/Physics';
import { Loadout } from '../weapons/Loadout';
import { Avatar } from './Avatar';

export interface DamageOptions {
  bypassShield?: boolean;
  headshot?: boolean;
  point?: THREE.Vector3 | null;
}

const KILL_CREDIT_WINDOW = 15; // seconds: storm/fall deaths credit the last attacker

/**
 * Anything that can move, fight and be eliminated: the player and every bot.
 * Movement uses a Rapier kinematic character controller on a capsule collider.
 */
export class Actor {
  private static nextId = 1;
  readonly id = Actor.nextId++;
  readonly name: string;
  readonly isPlayer: boolean;
  readonly avatar: Avatar;
  readonly loadout = new Loadout();
  readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly physics: Physics;

  health = PLAYER.maxHealth;
  shield = PLAYER.maxShield;
  alive = true;
  readonly position = new THREE.Vector3(); // feet
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  crouching = false;
  sprinting = false;
  ads = false;
  halfHeight = PLAYER.standHalfHeight;
  materials: Record<MaterialType, number> = { ...START_MATERIALS };
  selectedMaterial: MaterialType = 'wood';

  elims = 0;
  placement = 0;
  lastAttacker: Actor | null = null;
  private lastAttackerAt = -Infinity;
  clock = 0;

  constructor(name: string, physics: Physics, scene: THREE.Scene, opts: { isPlayer: boolean; color: number; accent: number }) {
    this.name = name;
    this.isPlayer = opts.isPlayer;
    this.physics = physics;
    this.avatar = new Avatar(opts.color, opts.accent);
    scene.add(this.avatar.root);

    this.collider = physics.addCollider(
      RAPIER.ColliderDesc.capsule(PLAYER.standHalfHeight, PLAYER.radius).setTranslation(0, 5, 0),
      { kind: 'actor', actor: this },
      G_ACTOR,
    );
    this.kcc = physics.world.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.enableAutostep(0.45, 0.2, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setSlideEnabled(true);
  }

  get eyeHeight(): number {
    return this.crouching ? PLAYER.eyeCrouch : PLAYER.eyeStand;
  }

  eye(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  chest(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + this.eyeHeight - 0.35, this.position.z);
  }

  /** Height above the feet at which a hit counts as a headshot. */
  get headLine(): number {
    return this.crouching ? 0.95 : 1.62;
  }

  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  spawn(pos: THREE.Vector3, yaw: number): void {
    this.alive = true;
    this.health = PLAYER.maxHealth;
    this.shield = PLAYER.maxShield;
    this.materials = { ...START_MATERIALS };
    this.selectedMaterial = 'wood';
    this.elims = 0;
    this.placement = 0;
    this.lastAttacker = null;
    this.lastAttackerAt = -Infinity;
    this.loadout.reset();
    this.avatar.setWeapon(this.loadout.current);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.crouching = false;
    this.halfHeight = PLAYER.standHalfHeight;
    this.collider.setHalfHeight(this.halfHeight);
    this.collider.setEnabled(true);
    this.teleport(pos);
    this.avatar.setVisible(true);
  }

  teleport(feet: THREE.Vector3): void {
    this.position.copy(feet);
    this.collider.setTranslation({ x: feet.x, y: feet.y + this.halfHeight + PLAYER.radius, z: feet.z });
    this.avatar.root.position.copy(feet);
  }

  /** Attempts to change stance; standing up is refused if there is no headroom. */
  setCrouch(want: boolean): void {
    if (want === this.crouching) return;
    const hh = want ? PLAYER.crouchHalfHeight : PLAYER.standHalfHeight;
    const center = new THREE.Vector3(this.position.x, this.position.y + hh + PLAYER.radius + 0.02, this.position.z);
    if (!want && this.physics.capsuleOverlap(center, hh, PLAYER.radius - 0.04, G_SOLID, this.collider)) return;
    this.crouching = want;
    this.halfHeight = hh;
    this.collider.setHalfHeight(hh);
    this.collider.setTranslation({ x: this.position.x, y: this.position.y + hh + PLAYER.radius, z: this.position.z });
  }

  /**
   * Integrates one movement step. `wish` is the desired horizontal velocity (m/s).
   */
  move(dt: number, wish: THREE.Vector3, jump: boolean): void {
    if (!this.alive) return;
    this.clock += dt;
    this.depenetrate();

    const accel = this.grounded ? PLAYER.groundAccel : PLAYER.airAccel;
    const dvx = wish.x - this.velocity.x;
    const dvz = wish.z - this.velocity.z;
    const dvLen = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    const k = dvLen > maxDv ? maxDv / dvLen : 1;
    this.velocity.x += dvx * k;
    this.velocity.z += dvz * k;

    if (jump && this.grounded) {
      this.velocity.y = PLAYER.jumpVelocity * (this.crouching ? 0.8 : 1);
      this.grounded = false;
    }
    this.velocity.y = Math.max(this.velocity.y + GRAVITY * dt, -55);

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.kcc.computeColliderMovement(
      this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(G_ALL, G_SOLID | G_ACTOR),
    );
    const mv = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();

    const c = this.collider.translation();
    this.collider.setTranslation({ x: c.x + mv.x, y: c.y + mv.y, z: c.z + mv.z });
    this.position.set(c.x + mv.x, c.y + mv.y - this.halfHeight - PLAYER.radius, c.z + mv.z);

    if (this.grounded && this.velocity.y < 0) {
      if (!wasGrounded) this.landed(-this.velocity.y);
      this.velocity.y = 0;
    } else if (this.velocity.y > 0 && mv.y < desired.y * 0.5) {
      this.velocity.y = 0; // bonked a ceiling
    }
    if (dt > 0) {
      this.velocity.x = mv.x / dt;
      this.velocity.z = mv.z / dt;
    }
  }

  private landed(impactSpeed: number): void {
    if (impactSpeed <= PLAYER.fallDamageSpeed) return;
    const dmg = Math.round((impactSpeed - PLAYER.fallDamageSpeed) * PLAYER.fallDamagePerMs);
    this.takeDamage(dmg, null, 'fall', { bypassShield: true });
  }

  /** Builds can be placed through characters; nudge them out instead of trapping them. */
  private depenetrate(): void {
    const c = this.collider.translation();
    const center = new THREE.Vector3(c.x, c.y, c.z);
    for (let i = 0; i < 4; i++) {
      const hit = this.physics.capsuleOverlap(center, this.halfHeight, PLAYER.radius - 0.08, G_SOLID, this.collider);
      if (!hit) break;
      const owner = this.physics.ownerOf(hit);
      if (owner?.kind === 'build' && owner.piece.spec.type === 'wall') {
        // Push sideways out of the wall plane, towards the side we are already on.
        const n = owner.piece.wallNormal();
        const side = Math.sign(center.clone().sub(owner.piece.center).dot(n)) || 1;
        center.addScaledVector(n, side * 0.2);
      } else {
        center.y += 0.25;
      }
    }
    if (center.x !== c.x || center.y !== c.y || center.z !== c.z) {
      this.collider.setTranslation({ x: center.x, y: center.y, z: center.z });
      this.position.set(center.x, center.y - this.halfHeight - PLAYER.radius, center.z);
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  takeDamage(amount: number, attacker: Actor | null, source: string, opts: DamageOptions = {}): void {
    if (!this.alive || amount <= 0) return;
    let remaining = amount;
    let shieldDamage = 0;
    if (!opts.bypassShield) {
      shieldDamage = Math.min(this.shield, remaining);
      this.shield -= shieldDamage;
      remaining -= shieldDamage;
    }
    const healthDamage = Math.min(this.health, remaining);
    this.health -= healthDamage;
    if (attacker && attacker !== this) {
      this.lastAttacker = attacker;
      this.lastAttackerAt = this.clock;
    }
    this.avatar.hitFlash();
    events.emit('damaged', {
      victim: this, attacker, shieldDamage, healthDamage,
      headshot: !!opts.headshot, point: opts.point ?? null, source,
    });
    if (this.health <= 0) {
      const credited = attacker && attacker !== this
        ? attacker
        : this.clock - this.lastAttackerAt < KILL_CREDIT_WINDOW ? this.lastAttacker : null;
      this.eliminate(credited, source);
    }
  }

  private eliminate(killer: Actor | null, source: string): void {
    this.alive = false;
    this.health = 0;
    this.shield = 0;
    this.velocity.set(0, 0, 0);
    this.collider.setEnabled(false);
    this.avatar.setVisible(false);
    if (killer && killer.alive) {
      killer.elims++;
      killer.siphon();
    }
    events.emit('eliminated', { victim: this, killer, source });
  }

  /** Removes the actor from play without counting as an elimination (round reset). */
  despawn(): void {
    this.alive = false;
    this.collider.setEnabled(false);
    this.avatar.setVisible(false);
  }

  /** Heals health first, overflow goes to shield (Zone Wars siphon / slurp behaviour). */
  heal(amount: number): void {
    const h = Math.min(PLAYER.maxHealth - this.health, amount);
    this.health += h;
    this.shield = Math.min(PLAYER.maxShield, this.shield + (amount - h));
  }

  private siphon(): void {
    this.heal(PLAYER.siphon);
    for (const m of Object.keys(this.materials) as MaterialType[]) {
      this.materials[m] = Math.min(MAX_MATERIALS, this.materials[m] + PLAYER.siphonMaterials);
    }
  }

  canAfford(mat: MaterialType = this.selectedMaterial): boolean {
    return this.materials[mat] >= MATERIALS[mat].cost;
  }
}
