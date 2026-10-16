import * as THREE from 'three';
import { GRID, MAP_HALF, MATERIALS, MAX_BUILD_LEVEL, PIECE_ORDER, type MaterialType, type PieceType } from '../config';
import { audio } from '../core/Audio';
import { events } from '../core/Events';
import { Physics, G_SOLID } from '../core/Physics';
import { clamp } from '../core/Random';
import type { Effects } from '../fx/Effects';
import type { Actor } from '../actors/Actor';
import { BuildPiece, pieceGeometry } from './BuildPiece';
import {
  DIR_VEC, cellOf, dirFromVector, isGrounded, pieceAnchor, pieceKey, pieceSegments, pieceYaw, rotateDir,
  type Dir, type PieceSpec,
} from './Grid';

export interface Placement {
  spec: PieceSpec;
  ok: boolean;
  reason: string;
}

const AIM_RANGE = 9;
const FLOOR_REACH = 4.5;
const TURBO_INTERVAL = 0.05;

/**
 * Grid building: target computation, ghost preview, placement, damage and
 * structural integrity (pieces with no path to the ground collapse).
 */
export class BuildingSystem {
  readonly pieces = new Map<string, BuildPiece>();
  private readonly bySegment = new Map<string, Set<BuildPiece>>();
  private readonly scene: THREE.Scene;
  private readonly physics: Physics;
  private readonly fx: Effects;

  selected: PieceType = 'wall';
  rampRotation = 0;
  private turbo = 0;
  private integrityDirty = false;

  private readonly ghost = new THREE.Group();
  private readonly ghostMesh: THREE.Mesh;
  private readonly ghostEdges: THREE.LineSegments;
  private readonly ghostMat = new THREE.MeshBasicMaterial({
    color: 0x5ab4ff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  });
  private readonly ghostLineMat = new THREE.LineBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.9 });
  private readonly ghostGeos = new Map<PieceType, { mesh: THREE.BufferGeometry; edges: THREE.BufferGeometry }>();
  current: Placement | null = null;

  constructor(scene: THREE.Scene, physics: Physics, fx: Effects) {
    this.scene = scene;
    this.physics = physics;
    this.fx = fx;
    for (const type of PIECE_ORDER) {
      const mesh = pieceGeometry(type);
      this.ghostGeos.set(type, { mesh, edges: new THREE.EdgesGeometry(mesh, 25) });
    }
    const g = this.ghostGeos.get('wall')!;
    this.ghostMesh = new THREE.Mesh(g.mesh, this.ghostMat);
    this.ghostMesh.renderOrder = 5;
    this.ghostEdges = new THREE.LineSegments(g.edges, this.ghostLineMat);
    this.ghost.add(this.ghostMesh, this.ghostEdges);
    this.ghost.visible = false;
    scene.add(this.ghost);
  }

  // ------------------------------------------------------------------ targeting

  /**
   * Picks the grid slot for `type` from where the actor stands and looks.
   * `origin`/`dir` is the aim ray (camera for the player, eyes for bots).
   */
  computeSpec(type: PieceType, actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3): PieceSpec {
    const feet = actor.position;
    const ci = cellOf(feet.x);
    const ck = cellOf(feet.z);
    const cj = Math.max(0, cellOf(feet.y + 0.25));
    const facing: Dir = dirFromVector(dir.x, dir.z);
    const [dx, dz] = DIR_VEC[facing];
    const minJ = Math.max(0, cj - 1);
    const maxJ = Math.min(MAX_BUILD_LEVEL, cj + 2);

    // Start the aim ray level with the actor so a third-person camera never targets
    // things behind the character.
    const eye = actor.eye();
    const t0 = Math.max(0, eye.clone().sub(origin).dot(dir));
    const start = origin.clone().addScaledVector(dir, t0);

    if (type === 'wall') {
      // Wall on the edge of the current cell, in the facing direction.
      let i = ci;
      let k = ck;
      let axis: 'x' | 'z';
      let planeCoord: number;
      if (dx !== 0) {
        axis = 'x';
        i = dx > 0 ? ci + 1 : ci;
        planeCoord = i * GRID;
      } else {
        axis = 'z';
        k = dz > 0 ? ck + 1 : ck;
        planeCoord = k * GRID;
      }
      const along = dx !== 0 ? dir.x : dir.z;
      const startAlong = dx !== 0 ? start.x : start.z;
      let y: number;
      if (Math.abs(along) > 0.08) {
        const t = (planeCoord - startAlong) / along;
        y = t > 0 ? start.y + dir.y * t : eye.y;
      } else {
        y = eye.y;
      }
      const j = clamp(Math.floor(y / GRID), minJ, maxJ);
      return { type, i, j, k, axis };
    }

    if (type === 'ramp') {
      const px = feet.x + dx * 2;
      const pz = feet.z + dz * 2;
      const pi = cellOf(px);
      const pk = cellOf(pz);
      // Continue the slope we are standing on so ramp-rushing stacks correctly.
      let slope = 0;
      if (actor.grounded) {
        const hit = this.physics.raycast(actor.chest(), new THREE.Vector3(0, -1, 0), 3, G_SOLID, actor.collider);
        if (hit && hit.normal.y > 0.5) slope = -(hit.normal.x * dx + hit.normal.z * dz) / hit.normal.y;
      }
      const lowEdge = dx !== 0 ? (dx > 0 ? pi : pi + 1) * GRID : (dz > 0 ? pk : pk + 1) * GRID;
      const dist = dx !== 0 ? (lowEdge - feet.x) * dx : (lowEdge - feet.z) * dz;
      const surfaceY = feet.y + slope * dist;
      const j = clamp(Math.round(surfaceY / GRID), 0, MAX_BUILD_LEVEL);
      return { type, i: pi, j, k: pk, dir: rotateDir(facing, this.rampRotation) };
    }

    // Floors and cones: grid cell under the aim point, limited to arm's reach.
    let t = AIM_RANGE;
    const hit = this.physics.raycast(start, dir, AIM_RANGE, G_SOLID, actor.collider);
    if (hit) t = Math.max(0, hit.distance - 0.05);
    const horiz = Math.hypot(dir.x, dir.z) * t;
    if (horiz > FLOOR_REACH) t *= FLOOR_REACH / horiz;
    const a = start.clone().addScaledVector(dir, t);
    const i = cellOf(a.x);
    const k = cellOf(a.z);
    const j = type === 'floor'
      ? clamp(Math.round(a.y / GRID), minJ, maxJ)
      : clamp(Math.floor((a.y + 1) / GRID), minJ, maxJ);
    return { type, i, j, k };
  }

  validate(spec: PieceSpec, actor: Actor, material: MaterialType = actor.selectedMaterial): Placement {
    const anchor = pieceAnchor(spec);
    if (Math.abs(anchor.x) > MAP_HALF || Math.abs(anchor.z) > MAP_HALF) return { spec, ok: false, reason: 'Out of bounds' };
    if (spec.j < 0 || spec.j > MAX_BUILD_LEVEL) return { spec, ok: false, reason: 'Too high' };
    if (this.pieces.has(pieceKey(spec))) return { spec, ok: false, reason: 'Occupied' };
    if (!actor.canAfford(material)) return { spec, ok: false, reason: `Not enough ${MATERIALS[material].label}` };
    return { spec, ok: true, reason: '' };
  }

  // ------------------------------------------------------------------ placement

  place(spec: PieceSpec, actor: Actor | null, material: MaterialType): BuildPiece | null {
    const key = pieceKey(spec);
    if (this.pieces.has(key)) return null;
    if (actor) {
      if (!actor.canAfford(material)) return null;
      actor.materials[material] -= MATERIALS[material].cost;
    }
    const piece = new BuildPiece(spec, material, actor, this.physics);
    this.scene.add(piece.group);
    this.pieces.set(key, piece);
    for (const seg of pieceSegments(spec)) {
      let set = this.bySegment.get(seg);
      if (!set) this.bySegment.set(seg, (set = new Set()));
      set.add(piece);
    }
    audio.play('build', piece.center, actor?.isPlayer ? 0.8 : 0.5);
    return piece;
  }

  /** Player-facing: refresh the ghost and place on click / hold (turbo build). */
  updatePlayer(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3, active: boolean, fire: boolean, firePressed: boolean, dt: number): void {
    this.turbo -= dt;
    if (!active || !actor.alive) {
      this.ghost.visible = false;
      this.current = null;
      return;
    }
    const spec = this.computeSpec(this.selected, actor, origin, dir);
    const placement = this.validate(spec, actor);
    this.current = placement;
    this.showGhost(spec, placement.ok);

    if ((firePressed || (fire && this.turbo <= 0)) && placement.ok) {
      this.place(spec, actor, actor.selectedMaterial);
      this.turbo = TURBO_INTERVAL;
    } else if (firePressed && !placement.ok && placement.reason.startsWith('Not enough')) {
      audio.play('denied');
      events.emit('toast', { text: placement.reason, tone: 'warn' });
    }
  }

  private showGhost(spec: PieceSpec, ok: boolean): void {
    const geos = this.ghostGeos.get(spec.type)!;
    if (this.ghostMesh.geometry !== geos.mesh) {
      this.ghostMesh.geometry = geos.mesh;
      this.ghostEdges.geometry = geos.edges;
    }
    pieceAnchor(spec, this.ghost.position);
    this.ghost.rotation.set(0, pieceYaw(spec), 0);
    this.ghostMat.color.setHex(ok ? 0x5ab4ff : 0xff5a5a);
    this.ghostLineMat.color.setHex(ok ? 0xd8f0ff : 0xffc0c0);
    this.ghost.visible = true;
  }

  hideGhost(): void {
    this.ghost.visible = false;
    this.current = null;
  }

  select(type: PieceType): void {
    this.selected = type;
  }

  rotate(): void {
    this.rampRotation = (this.rampRotation + 1) % 4;
  }

  // ------------------------------------------------------------------ damage

  damagePiece(piece: BuildPiece, amount: number, attacker: Actor | null): void {
    if (piece.destroyed) return;
    const destroyed = piece.damage(amount);
    events.emit('structureHit', { piece, attacker, amount, destroyed });
    if (destroyed) this.destroyPiece(piece);
  }

  destroyPiece(piece: BuildPiece, collapse = false): void {
    if (piece.destroyed) return;
    this.pieces.delete(piece.key);
    for (const seg of pieceSegments(piece.spec)) this.bySegment.get(seg)?.delete(piece);
    const extent = piece.spec.type === 'wall'
      ? new THREE.Vector3(1.8, 1.8, 0.4)
      : piece.spec.type === 'ramp' ? new THREE.Vector3(1.8, 1.8, 1.8) : new THREE.Vector3(1.8, 0.4, 1.8);
    this.fx.debris(piece.center, extent, MATERIALS[piece.material].tint, collapse ? 12 : 26);
    audio.play('break', piece.center, collapse ? 0.5 : 0.9);
    piece.dispose();
    events.emit('pieceDestroyed', { piece });
    this.integrityDirty = true;
  }

  /** Flood-fills from grounded pieces through shared edges; anything unreached falls. */
  private checkIntegrity(): void {
    const supported = new Set<BuildPiece>();
    const queue: BuildPiece[] = [];
    for (const piece of this.pieces.values()) {
      if (isGrounded(piece.spec)) {
        supported.add(piece);
        queue.push(piece);
      }
    }
    while (queue.length) {
      const piece = queue.pop()!;
      for (const seg of pieceSegments(piece.spec)) {
        const neighbours = this.bySegment.get(seg);
        if (!neighbours) continue;
        for (const n of neighbours) {
          if (!supported.has(n)) {
            supported.add(n);
            queue.push(n);
          }
        }
      }
    }
    const falling = [...this.pieces.values()].filter((p) => !supported.has(p));
    for (const p of falling) this.destroyPiece(p, true);
  }

  update(dt: number): void {
    for (const piece of this.pieces.values()) piece.update(dt);
    if (this.integrityDirty) {
      this.integrityDirty = false;
      this.checkIntegrity();
    }
  }

  /** Removes every structure (round reset). */
  clear(): void {
    for (const piece of this.pieces.values()) piece.dispose();
    this.pieces.clear();
    this.bySegment.clear();
    this.integrityDirty = false;
    this.hideGhost();
  }

  pieceFromObject(obj: THREE.Object3D | null): BuildPiece | null {
    while (obj) {
      if (obj.userData.piece instanceof BuildPiece) return obj.userData.piece;
      obj = obj.parent;
    }
    return null;
  }
}
