import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILD_THICKNESS, CONE_HEIGHT, GRID, MATERIALS, type MaterialType } from '../config';
import { Physics, RAPIER, G_BUILD } from '../core/Physics';
import { buildTexture } from '../core/Textures';
import type { Actor } from '../actors/Actor';
import { pieceAnchor, pieceKey, pieceYaw, type PieceSpec } from './Grid';

const T = BUILD_THICKNESS;
const RAMP_LEN = GRID * Math.SQRT2;
const RAMP_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);

/** Tile layout used by the edit system: walls are 3x3, floors 2x2, others are not editable. */
export function tileLayout(type: PieceSpec['type']): { cols: number; rows: number } | null {
  if (type === 'wall') return { cols: 3, rows: 3 };
  if (type === 'floor') return { cols: 2, rows: 2 };
  return null;
}

/**
 * Local-space centre of an edit tile. Walls live in the local XY plane (row 0 = bottom),
 * floors in the local XZ plane.
 */
export function tileCenter(type: PieceSpec['type'], index: number, target = new THREE.Vector3()): THREE.Vector3 {
  const layout = tileLayout(type)!;
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  const size = GRID / layout.cols;
  const a = (col + 0.5) * size - GRID / 2;
  const b = (row + 0.5) * size - GRID / 2;
  return type === 'wall' ? target.set(a, b, 0) : target.set(a, 0, b);
}

/** Box geometry whose UVs are planar-mapped over the whole piece so textures stay continuous. */
function tileGeometry(type: PieceSpec['type'], index: number, size: number): THREE.BufferGeometry {
  const c = tileCenter(type, index);
  const geo = type === 'wall'
    ? new THREE.BoxGeometry(size, size, T)
    : new THREE.BoxGeometry(size, T, size);
  geo.translate(c.x, c.y, c.z);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let v = 0; v < pos.count; v++) {
    const u = (pos.getX(v) + GRID / 2) / GRID;
    const w = ((type === 'wall' ? pos.getY(v) : pos.getZ(v)) + GRID / 2) / GRID;
    uv.setXY(v, u, w);
  }
  return geo;
}

function coneGeometry(): THREE.BufferGeometry {
  const h = GRID / 2;
  const apex = [0, CONE_HEIGHT, 0];
  const c = [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h]];
  const pos: number[] = [];
  const uv: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = c[s];
    const b = c[(s + 1) % 4];
    pos.push(...b, ...a, ...apex);
    uv.push(1, 0, 0, 0, 0.5, 1);
  }
  // underside
  pos.push(...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3]);
  uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Geometry for a piece with the given tile mask (shared by real pieces and ghosts). */
export function pieceGeometry(type: PieceSpec['type'], tiles?: boolean[]): THREE.BufferGeometry {
  const layout = tileLayout(type);
  if (layout) {
    const size = GRID / layout.cols;
    const parts: THREE.BufferGeometry[] = [];
    const count = layout.cols * layout.rows;
    for (let t = 0; t < count; t++) {
      if (!tiles || tiles[t]) parts.push(tileGeometry(type, t, size));
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }
  if (type === 'ramp') {
    const geo = new THREE.BoxGeometry(GRID, T, RAMP_LEN);
    geo.applyQuaternion(RAMP_TILT);
    return geo;
  }
  return coneGeometry();
}

const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1b1206, transparent: true, opacity: 0.45 });

export class BuildPiece {
  private static nextId = 1;
  readonly id = BuildPiece.nextId++;
  readonly spec: PieceSpec;
  readonly key: string;
  readonly material: MaterialType;
  readonly owner: Actor | null;
  readonly maxHp: number;
  hp: number;
  tiles: boolean[];
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3();
  colliders: RAPIER.Collider[] = [];
  destroyed = false;
  private buildLeft: number;
  private readonly growRate: number;
  private mesh: THREE.Mesh | null = null;
  private edges: THREE.LineSegments | null = null;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly physics: Physics;
  private flash = 0;
  private pop = 0;
  private editing = false;

  constructor(spec: PieceSpec, material: MaterialType, owner: Actor | null, physics: Physics) {
    this.spec = spec;
    this.key = pieceKey(spec);
    this.material = material;
    this.owner = owner;
    this.physics = physics;
    const def = MATERIALS[material];
    this.maxHp = def.maxHp;
    this.hp = Math.round(def.maxHp * def.startHpFrac);
    this.buildLeft = def.buildTime;
    this.growRate = (def.maxHp - this.hp) / def.buildTime;
    const layout = tileLayout(spec.type);
    this.tiles = new Array(layout ? layout.cols * layout.rows : 1).fill(true);

    this.mat = new THREE.MeshStandardMaterial({
      map: buildTexture(material),
      roughness: material === 'metal' ? 0.45 : 0.85,
      metalness: material === 'metal' ? 0.35 : 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });

    pieceAnchor(spec, this.center);
    this.group.position.copy(this.center);
    this.group.rotation.y = pieceYaw(spec);
    this.group.updateMatrixWorld(true);
    this.pop = 1;
    this.rebuild();
  }

  get editable(): boolean {
    return tileLayout(this.spec.type) !== null;
  }

  get building(): boolean {
    return this.buildLeft > 0;
  }

  /** World-space normal of a wall's plane. */
  wallNormal(target = new THREE.Vector3()): THREE.Vector3 {
    return this.spec.axis === 'x' ? target.set(1, 0, 0) : target.set(0, 0, 1);
  }

  setTiles(mask: boolean[]): void {
    this.tiles = mask.slice();
    this.rebuild();
  }

  /** Rebuilds render mesh + colliders from the current tile mask. */
  rebuild(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    if (this.edges) {
      this.group.remove(this.edges);
      this.edges.geometry.dispose();
    }
    for (const c of this.colliders) this.physics.removeCollider(c);
    this.colliders = [];

    const geo = pieceGeometry(this.spec.type, this.tiles);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.piece = this;
    this.group.add(this.mesh);
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMaterial);
    this.group.add(this.edges);

    const q = this.group.quaternion;
    const owner = { kind: 'build' as const, piece: this };
    const layout = tileLayout(this.spec.type);
    if (layout) {
      const half = GRID / layout.cols / 2;
      const local = new THREE.Vector3();
      this.tiles.forEach((present, t) => {
        if (!present) return;
        tileCenter(this.spec.type, t, local);
        const world = local.applyMatrix4(this.group.matrixWorld);
        const desc = this.spec.type === 'wall'
          ? RAPIER.ColliderDesc.cuboid(half, half, T / 2)
          : RAPIER.ColliderDesc.cuboid(half, T / 2, half);
        desc.setTranslation(world.x, world.y, world.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        this.colliders.push(this.physics.addCollider(desc, owner, G_BUILD));
      });
    } else if (this.spec.type === 'ramp') {
      const rq = q.clone().multiply(RAMP_TILT);
      const desc = RAPIER.ColliderDesc.cuboid(GRID / 2, T / 2, RAMP_LEN / 2)
        .setTranslation(this.center.x, this.center.y, this.center.z)
        .setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w });
      this.colliders.push(this.physics.addCollider(desc, owner, G_BUILD));
    } else {
      const h = GRID / 2;
      const { x, y, z } = this.center;
      const pts = new Float32Array([
        x - h, y, z - h, x + h, y, z - h, x + h, y, z + h, x - h, y, z + h, x, y + CONE_HEIGHT, z,
      ]);
      const desc = RAPIER.ColliderDesc.convexHull(pts);
      if (desc) this.colliders.push(this.physics.addCollider(desc, owner, G_BUILD));
    }
  }

  /** Returns true when the piece should be destroyed. */
  damage(amount: number): boolean {
    this.hp -= amount;
    this.flash = 1;
    return this.hp <= 0;
  }

  /** While editing, the real piece fades so the tile selector reads clearly. */
  setEditing(on: boolean): void {
    this.editing = on;
  }

  update(dt: number): void {
    if (this.buildLeft > 0) {
      this.buildLeft -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.growRate * dt);
    }
    const opacity = this.editing
      ? 0.18
      : 1 - 0.4 * Math.max(0, this.buildLeft) / MATERIALS[this.material].buildTime;
    this.mat.opacity = opacity;
    const transparent = opacity < 1;
    if (transparent !== this.mat.transparent) {
      this.mat.transparent = transparent;
      this.mat.depthWrite = !this.editing;
      this.mat.needsUpdate = true;
    }
    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 7);
      this.group.scale.setScalar(1 - this.pop * 0.12);
    }
    // Damage feedback: flash white on hit, darken as HP drops.
    const frac = Math.max(0, this.hp / this.maxHp);
    const shade = 0.55 + 0.45 * frac;
    this.mat.color.setRGB(shade, shade, shade);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    const blue = this.building ? 0.25 : 0;
    this.mat.emissive.setRGB(this.flash * 0.6, this.flash * 0.6 + blue * 0.5, this.flash * 0.6 + blue);
  }

  dispose(): void {
    this.destroyed = true;
    for (const c of this.colliders) this.physics.removeCollider(c);
    this.colliders = [];
    this.group.parent?.remove(this.group);
    this.mesh?.geometry.dispose();
    this.edges?.geometry.dispose();
    this.mat.dispose();
  }
}
