import * as THREE from 'three';
import { MATERIAL_ORDER, PIECE_ORDER, PLAYER, type PieceType } from '../config';
import type { Input } from '../core/Input';
import { Physics, G_SOLID } from '../core/Physics';
import { clamp, damp } from '../core/Random';
import type { Actor } from '../actors/Actor';
import type { BuildingSystem } from '../building/BuildingSystem';
import type { EditSystem } from '../building/EditSystem';
import type { CombatSystem } from '../weapons/CombatSystem';

export type PlayerMode = 'combat' | 'build' | 'edit';

const PIECE_KEYS: Record<string, PieceType> = { KeyZ: 'wall', KeyX: 'floor', KeyC: 'ramp', KeyV: 'cone' };
const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const JUMP_BUFFER = 0.15;

/**
 * Third-person controller: pointer-lock mouse look, over-the-shoulder camera with
 * collision, WASD / sprint / jump / crouch movement and routing of the player's
 * combat, build and edit inputs. Health/shield live on the wrapped Actor.
 */
export class PlayerController {
  readonly actor: Actor;
  readonly camera: THREE.PerspectiveCamera;
  mode: PlayerMode = 'combat';
  private modeBeforeEdit: PlayerMode = 'combat';
  readonly aimOrigin = new THREE.Vector3();
  readonly aimDir = new THREE.Vector3(0, 0, -1);
  spectate: Actor | null = null;
  enabled = false;

  private yaw = 0;
  private pitch = 0;
  private recoil = 0;
  private jumpBuffer = 0;
  private eyeSmooth: number = PLAYER.eyeStand;
  private camDist = 3.4;
  private fov = 78;

  private readonly input: Input;
  private readonly physics: Physics;
  private readonly building: BuildingSystem;
  private readonly edit: EditSystem;
  private readonly combat: CombatSystem;

  constructor(
    actor: Actor, camera: THREE.PerspectiveCamera, input: Input, physics: Physics,
    building: BuildingSystem, edit: EditSystem, combat: CombatSystem,
  ) {
    this.actor = actor;
    this.camera = camera;
    this.input = input;
    this.physics = physics;
    this.building = building;
    this.edit = edit;
    this.combat = combat;
    combat.onPlayerRecoil = (kick) => {
      this.recoil += kick;
    };
  }

  // Convenience accessors for the HUD.
  get health(): number { return this.actor.health; }
  get shield(): number { return this.actor.shield; }

  resetView(yaw: number): void {
    this.yaw = yaw;
    this.pitch = -0.08;
    this.recoil = 0;
    this.mode = 'combat';
    this.spectate = null;
    this.edit.cancel();
    this.building.hideGhost();
  }

  /** Mouse look + discrete key actions. Call once per rendered frame before simulation. */
  handleFrameInput(): void {
    const input = this.input;
    this.yaw -= input.mouseDX * input.sensitivity * (this.actor.ads ? 0.6 : 1);
    this.pitch -= input.mouseDY * input.sensitivity * (this.actor.ads ? 0.6 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    if (!this.enabled || !this.actor.alive) return;

    if (input.wasPressed('Space')) this.jumpBuffer = JUMP_BUFFER;
    const lo = this.actor.loadout;

    // --- mode switching
    for (const [code, piece] of Object.entries(PIECE_KEYS)) {
      if (input.wasPressed(code)) {
        this.edit.cancel();
        this.building.select(piece);
        this.mode = 'build';
      }
    }
    if (input.wasPressed('KeyQ')) {
      this.edit.cancel();
      this.mode = this.mode === 'build' ? 'combat' : 'build';
    }
    SLOT_KEYS.forEach((code, i) => {
      if (input.wasPressed(code)) {
        this.edit.cancel();
        this.mode = 'combat';
        lo.select(i);
      }
    });
    const wheel = input.consumeWheel();
    if (wheel !== 0 && this.mode === 'combat') lo.select(lo.index + wheel);
    if (wheel !== 0 && this.mode === 'build') {
      const i = PIECE_ORDER.indexOf(this.building.selected);
      this.building.select(PIECE_ORDER[(i + wheel + PIECE_ORDER.length) % PIECE_ORDER.length]);
    }

    if (input.wasPressed('KeyR')) {
      if (this.mode === 'build') this.building.rotate();
      else if (this.mode === 'combat') this.combat.reload(this.actor);
    }

    if (input.wasPressed('KeyG')) {
      const wasActive = this.edit.active;
      if (!wasActive) this.modeBeforeEdit = this.mode === 'edit' ? 'combat' : this.mode;
      this.edit.toggle(this.actor, this.aimOrigin, this.aimDir);
      this.mode = this.edit.active ? 'edit' : this.modeBeforeEdit;
    }
    if (this.mode === 'edit' && !this.edit.active) this.mode = this.modeBeforeEdit;

    if (this.mode === 'build' && input.mousePressed(2)) {
      const idx = MATERIAL_ORDER.indexOf(this.actor.selectedMaterial);
      this.actor.selectedMaterial = MATERIAL_ORDER[(idx + 1) % MATERIAL_ORDER.length];
    }
  }

  /** Fixed-step movement. */
  fixedUpdate(dt: number): void {
    const a = this.actor;
    if (!a.alive) return;
    const input = this.input;
    const active = this.enabled;
    const lo = a.loadout;

    a.setCrouch(active && (input.isDown('ControlLeft') || input.isDown('ControlRight')));
    a.ads = active && this.mode === 'combat' && input.mouseDown(2) && lo.def.kind === 'hitscan';

    let fx = 0;
    let fz = 0;
    if (active) {
      if (input.isDown('KeyW')) fz += 1;
      if (input.isDown('KeyS')) fz -= 1;
      if (input.isDown('KeyD')) fx += 1;
      if (input.isDown('KeyA')) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (len > 0) wish.addScaledVector(forward, fz / len).addScaledVector(right, fx / len);

    const firing = this.mode === 'combat' && input.mouseDown(0) && lo.def.kind === 'hitscan';
    a.sprinting = active && input.isDown('ShiftLeft') && fz > 0 && !a.crouching && !a.ads && !firing && !lo.drinking;
    let speed = PLAYER.walkSpeed;
    if (a.sprinting) speed = PLAYER.sprintSpeed;
    if (a.ads) speed = PLAYER.adsSpeed;
    if (a.crouching || lo.drinking) speed = PLAYER.crouchSpeed;
    wish.multiplyScalar(speed);

    const jump = this.jumpBuffer > 0;
    a.move(dt, wish, jump);
    if (jump && a.velocity.y > 0) this.jumpBuffer = 0;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    a.yaw = this.yaw;
    a.pitch = this.pitch;
  }

  /** Building / combat / edit actions (after movement + camera so the aim ray is fresh). */
  handleActions(dt: number): void {
    const a = this.actor;
    const input = this.input;
    const live = this.enabled && a.alive;

    this.building.updatePlayer(
      a, this.aimOrigin, this.aimDir, live && this.mode === 'build',
      input.mouseDown(0), input.mousePressed(0), dt,
    );

    if (live && this.mode === 'edit') {
      this.edit.update(a, this.camera, input.mouseDown(0), input.mousePressed(0), input.mousePressed(2));
    }

    if (live && this.mode === 'combat') {
      const def = a.loadout.def;
      const trigger = def.auto ? input.mouseDown(0) : input.mousePressed(0);
      if (trigger) this.combat.fire(a, this.aimOrigin, this.aimDir);
    }
  }

  updateCamera(dt: number): void {
    const a = this.actor;
    const target = a.alive ? a : this.spectate;
    if (!a.alive && target && target !== a) this.yaw += dt * 0.15; // slow orbit while spectating
    const focus = target ?? a;

    this.recoil = damp(this.recoil, 0, 9, dt);
    this.eyeSmooth = damp(this.eyeSmooth, focus.eyeHeight, 14, dt);
    const ads = a.alive && a.ads;
    this.camDist = damp(this.camDist, ads ? 1.8 : a.alive ? 3.4 : 6, 12, dt);
    this.fov = damp(this.fov, ads ? 56 : a.sprinting ? 84 : 78, 10, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    const pivot = new THREE.Vector3(focus.position.x, focus.position.y + this.eyeSmooth + 0.1, focus.position.z);
    const rot = new THREE.Euler(this.pitch + this.recoil, this.yaw, 0, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(rot);
    const shoulder = ads ? 0.55 : a.alive ? 0.78 : 0;
    const offset = new THREE.Vector3(shoulder, 0.22, this.camDist).applyQuaternion(q);
    const len = offset.length();
    const dir = offset.clone().divideScalar(len);
    const hit = this.physics.raycast(pivot, dir, len + 0.25, G_SOLID, focus.collider);
    const dist = hit ? Math.max(0.2, hit.distance - 0.25) : len;
    this.camera.position.copy(pivot).addScaledVector(dir, dist);
    this.camera.quaternion.copy(q);
    this.camera.updateMatrixWorld();

    this.aimOrigin.copy(this.camera.position);
    this.aimDir.set(0, 0, -1).applyQuaternion(q);
  }
}
