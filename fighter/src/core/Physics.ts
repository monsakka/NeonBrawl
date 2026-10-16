import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { BuildPiece } from '../building/BuildPiece';
import type { Prop } from '../world/World';

export { RAPIER };

// Collision membership bits.
export const G_WORLD = 0x0001; // ground, boundary, props
export const G_BUILD = 0x0002; // player-made structures
export const G_ACTOR = 0x0004; // character capsules
export const G_ALL = 0xffff;
export const G_SOLID = G_WORLD | G_BUILD;

/** Rapier packs membership in the high 16 bits and the filter in the low 16 bits. */
export function groups(membership: number, filter: number): number {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

export type ColliderOwner =
  | { kind: 'ground' }
  | { kind: 'prop'; prop: Prop }
  | { kind: 'build'; piece: BuildPiece }
  | { kind: 'actor'; actor: Actor };

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  owner: ColliderOwner | undefined;
}

/**
 * Thin wrapper around a Rapier world. There are no dynamic bodies: characters are
 * kinematic capsules moved by a KinematicCharacterController, everything else is
 * static. Rapier is used for collision, ground snapping and fast ray queries.
 */
export class Physics {
  readonly world: RAPIER.World;
  private owners = new Map<number, ColliderOwner>();
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  addCollider(desc: RAPIER.ColliderDesc, owner: ColliderOwner, membership: number): RAPIER.Collider {
    desc.setCollisionGroups(groups(membership, G_ALL));
    const collider = this.world.createCollider(desc);
    this.owners.set(collider.handle, owner);
    return collider;
  }

  removeCollider(collider: RAPIER.Collider): void {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, false);
  }

  ownerOf(collider: RAPIER.Collider): ColliderOwner | undefined {
    return this.owners.get(collider.handle);
  }

  /** Refreshes the broad-phase so queries see colliders that moved or were added. */
  step(): void {
    this.world.step();
  }

  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    mask: number = G_ALL,
    exclude?: RAPIER.Collider,
  ): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(
      this.ray, maxDist, true, undefined, groups(G_ALL, mask), exclude,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
    };
  }

  /** First solid collider overlapping a capsule (used to pop characters out of fresh builds). */
  capsuleOverlap(
    center: THREE.Vector3,
    halfHeight: number,
    radius: number,
    mask: number,
    exclude?: RAPIER.Collider,
  ): RAPIER.Collider | null {
    const shape = new RAPIER.Capsule(halfHeight, radius);
    return this.world.intersectionWithShape(
      { x: center.x, y: center.y, z: center.z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      undefined,
      groups(G_ALL, mask),
      exclude,
    );
  }
}
