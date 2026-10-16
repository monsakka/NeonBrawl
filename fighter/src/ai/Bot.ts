import * as THREE from 'three';
import { PLAYER } from '../config';
import { Physics, G_ALL } from '../core/Physics';
import { angleDelta, clamp, rand } from '../core/Random';
import type { Actor } from '../actors/Actor';
import type { BuildingSystem } from '../building/BuildingSystem';
import type { StormManager } from '../storm/StormManager';
import type { CombatSystem } from '../weapons/CombatSystem';

const SIGHT_RANGE = 75;
const SLOT_PICKAXE = 0;
const SLOT_AR = 1;
const SLOT_SHOTGUN = 2;
const SLOT_SLURP = 3;

export interface BotServices {
  physics: Physics;
  building: BuildingSystem;
  combat: CombatSystem;
  storm: StormManager;
  actors: () => readonly Actor[];
}

/**
 * Simple utility AI: rotate into the safe zone, pick the nearest visible enemy,
 * strafe + shoot (shotgun up close, AR at range), wall up when shot, break builds
 * that block it and drink Slurp when it is safe.
 */
export class Bot {
  readonly actor: Actor;
  private readonly s: BotServices;
  /** 0..1: scales reaction time, aim error and how often it builds. */
  readonly skill: number;

  private target: Actor | null = null;
  private lastSeen = -Infinity;
  private readonly lastKnown = new THREE.Vector3();
  private thinkTimer = 0;
  private reaction = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private buildCooldown = 0;
  private stuckTimer = 0;
  private readonly lastPos = new THREE.Vector3();
  private readonly destination = new THREE.Vector3();
  private destPhase = -1;
  private wantJump = false;
  private time = 0;
  private aimYaw = 0;
  private aimPitch = 0;

  constructor(actor: Actor, services: BotServices, skill: number) {
    this.actor = actor;
    this.s = services;
    this.skill = skill;
  }

  reset(): void {
    this.target = null;
    this.lastSeen = -Infinity;
    this.destPhase = -1;
    this.reaction = 0;
    this.buildCooldown = rand(0, 2);
    this.stuckTimer = 0;
    this.aimYaw = this.actor.yaw;
    this.aimPitch = 0;
    this.lastPos.copy(this.actor.position);
  }

  /** Reacts to incoming fire: turn towards the shooter and maybe throw up a wall. */
  onDamaged(attacker: Actor | null): void {
    if (!attacker || !this.actor.alive) return;
    if (!this.target || !this.canSee(this.target)) {
      this.target = attacker;
      this.lastSeen = this.time;
      this.lastKnown.copy(attacker.position);
      this.reaction = 0.25;
    }
    if (this.buildCooldown <= 0 && Math.random() < 0.45 + this.skill * 0.4) {
      this.buildCover(attacker.position);
      this.buildCooldown = rand(1.5, 3.5) - this.skill;
    }
  }

  private buildCover(threat: THREE.Vector3): void {
    const a = this.actor;
    if (!a.canAfford()) return;
    const eye = a.eye();
    const dir = threat.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(eye).normalize();
    const mats = (['brick', 'wood', 'metal'] as const).find((m) => a.canAfford(m));
    if (!mats) return;
    const wall = this.s.building.computeSpec('wall', a, eye, dir);
    this.s.building.place(wall, a, mats);
    // Higher-skill bots also cone/ramp to take height.
    if (this.skill > 0.6 && Math.random() < 0.35) {
      const ramp = this.s.building.computeSpec('ramp', a, eye, dir);
      if (this.s.building.validate(ramp, a, mats).ok) this.s.building.place(ramp, a, mats);
    }
  }

  private canSee(other: Actor): boolean {
    if (!other.alive) return false;
    const eye = this.actor.eye();
    const to = other.chest().sub(eye);
    const dist = to.length();
    if (dist > SIGHT_RANGE) return false;
    to.divideScalar(dist);
    const hit = this.s.physics.raycast(eye, to, dist + 0.5, G_ALL, this.actor.collider);
    return !!hit && hit.owner?.kind === 'actor' && hit.owner.actor === other;
  }

  private think(): void {
    const me = this.actor;
    let best: Actor | null = null;
    let bestDist = Infinity;
    for (const other of this.s.actors()) {
      if (other === me || !other.alive) continue;
      const d = other.position.distanceTo(me.position);
      if (d < bestDist && d < SIGHT_RANGE && this.canSee(other)) {
        best = other;
        bestDist = d;
      }
    }
    if (best) {
      if (best !== this.target) this.reaction = clamp(0.7 - this.skill * 0.45, 0.2, 0.7);
      this.target = best;
      this.lastSeen = this.time;
      this.lastKnown.copy(best.position);
    } else if (this.target && (!this.target.alive || this.time - this.lastSeen > 4)) {
      this.target = null;
    }

    // Choose a destination inside the next safe circle once per storm phase.
    const storm = this.s.storm;
    if (this.destPhase !== storm.phase) {
      this.destPhase = storm.phase;
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * storm.nextRadius * 0.6;
      this.destination.set(storm.nextCenter.x + Math.cos(ang) * r, 0, storm.nextCenter.y + Math.sin(ang) * r);
    }
  }

  fixedUpdate(dt: number): void {
    const me = this.actor;
    if (!me.alive) return;
    this.time += dt;
    this.buildCooldown -= dt;
    this.reaction -= dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.25 + Math.random() * 0.1;
      this.think();
    }

    const lo = me.loadout;
    const storm = this.s.storm;
    const outside = storm.distanceOutside(me.position) > -2;
    const toDest = this.destination.clone().sub(me.position).setY(0);
    const hp = me.health + me.shield;
    const target = this.target && this.target.alive ? this.target : null;
    const visible = !!target && this.time - this.lastSeen < 0.6;

    const wish = new THREE.Vector3();
    let lookAt: THREE.Vector3 | null = null;

    if (target && !(outside && hp < 80)) {
      const dist = target.position.distanceTo(me.position);
      lookAt = (visible ? target.chest() : this.lastKnown.clone().add(new THREE.Vector3(0, 1.2, 0)));
      // Weapon choice by range.
      const wantSlot = dist < 11 ? SLOT_SHOTGUN : SLOT_AR;
      if (lo.index !== wantSlot) lo.select(wantSlot);
      me.ads = lo.index === SLOT_AR && dist > 25;

      // Strafe while keeping a preferred distance.
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.5, 1.4);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.15 + this.skill * 0.15) this.wantJump = true;
      }
      const to = target.position.clone().sub(me.position).setY(0).normalize();
      const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafeDir);
      const preferred = wantSlot === SLOT_SHOTGUN ? 4 : 22;
      const approach = clamp((dist - preferred) / 8, -1, 1);
      wish.addScaledVector(to, approach).addScaledVector(side, 0.8);
      if (outside) wish.add(toDest.clone().normalize().multiplyScalar(1.5));
    } else if (hp < 150 && lo.slurps > 0 && !outside && !target) {
      // Heal up while nobody is around.
      if (lo.current !== 'slurp') lo.select(SLOT_SLURP);
      me.ads = false;
      if (!lo.drinking && lo.equipTimer <= 0) this.s.combat.fire(me, me.eye(), me.forward());
    } else {
      me.ads = false;
      if (lo.current === 'slurp' && !lo.drinking) lo.select(SLOT_AR);
      if (toDest.length() > 3) wish.copy(toDest).normalize();
    }

    if (wish.lengthSq() > 1) wish.normalize();
    const sprint = !target && wish.lengthSq() > 0.5;
    me.sprinting = sprint;
    let speed = sprint ? PLAYER.sprintSpeed : me.ads ? PLAYER.adsSpeed : PLAYER.walkSpeed;
    if (lo.drinking) speed = PLAYER.crouchSpeed;
    wish.multiplyScalar(speed);

    // Unstick: jump, then pickaxe whatever build is in the way.
    const moved = me.position.distanceTo(this.lastPos);
    this.lastPos.copy(me.position);
    if (wish.lengthSq() > 4 && moved < speed * dt * 0.25) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    let breakBuild = false;
    if (this.stuckTimer > 0.4) this.wantJump = true;
    if (this.stuckTimer > 1.0) {
      const fwd = wish.clone().normalize();
      const hit = this.s.physics.raycast(me.chest(), fwd, 2.5, G_ALL, me.collider);
      if (hit?.owner?.kind === 'build') {
        breakBuild = true;
        lookAt = hit.point;
        if (lo.index !== SLOT_PICKAXE && !target) lo.select(SLOT_PICKAXE);
      }
      if (this.stuckTimer > 3) {
        // Hard stuck: pick a new destination.
        this.destPhase = -1;
        this.stuckTimer = 0;
      }
    }

    // Face movement when not fighting.
    if (!lookAt && wish.lengthSq() > 0.1) {
      lookAt = me.eye().add(wish.clone().normalize().multiplyScalar(10));
    }
    if (lookAt) {
      const d = lookAt.clone().sub(me.eye());
      const yaw = Math.atan2(-d.x, -d.z);
      const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const turn = (4 + this.skill * 6) * dt;
      this.aimYaw += clamp(angleDelta(this.aimYaw, yaw), -turn, turn);
      this.aimPitch += clamp(pitch - this.aimPitch, -turn, turn);
    }
    me.yaw = this.aimYaw;
    me.pitch = this.aimPitch;

    me.move(dt, wish, this.wantJump);
    this.wantJump = false;

    // Shooting.
    if (target && this.reaction <= 0 && lo.def.kind === 'hitscan') {
      const aimErr = Math.abs(angleDelta(this.aimYaw, Math.atan2(-(target.position.x - me.position.x), -(target.position.z - me.position.z))));
      const recentlySeen = this.time - this.lastSeen < 2.5;
      if (aimErr < 0.15 && recentlySeen) {
        const aimPoint = (visible ? target.chest() : this.lastKnown.clone().add(new THREE.Vector3(0, 1.2, 0)));
        if (visible && Math.random() < 0.12 + this.skill * 0.12) aimPoint.y += 0.5; // occasional headshot
        // Aim error grows with distance / target speed, shrinks with skill.
        const dist = aimPoint.distanceTo(me.eye());
        const err = (0.025 + target.horizontalSpeed * 0.004 + dist * 0.0008) * (1.6 - this.skill);
        aimPoint.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(err * dist));
        const dir = aimPoint.sub(me.eye()).normalize();
        const def = lo.def;
        if (def.auto || lo.cooldown <= 0) this.s.combat.fire(me, me.eye(), dir);
      }
    } else if (breakBuild && lo.current === 'pickaxe') {
      this.s.combat.fire(me, me.eye(), me.forward().setY(-0.15).normalize());
    }

    // Reload in lulls.
    const ammo = lo.ammo.get(lo.current);
    if (ammo && !target && ammo.mag < lo.def.magSize * 0.5) this.s.combat.reload(me);
  }
}
