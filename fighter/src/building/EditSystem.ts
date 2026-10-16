import * as THREE from 'three';
import { BUILD_THICKNESS, GRID } from '../config';
import { audio } from '../core/Audio';
import { events } from '../core/Events';
import { Physics, G_SOLID } from '../core/Physics';
import type { Actor } from '../actors/Actor';
import { BuildPiece, tileCenter, tileLayout } from './BuildPiece';

const EDIT_RANGE = 6.5;
const KEEP_RANGE = 8;

// Wall masks are row-major from the bottom-left tile: index = row * 3 + col.
const WALL_SHAPES: Record<string, string> = {
  '111111111': 'Full Wall',
  '101111111': 'Door',
  '101101111': 'Tall Door',
  '111101111': 'Window',
  '111111000': 'Half Wall',
  '111000000': 'Low Wall',
  '000111111': 'Raised Wall',
  '000101111': 'Arch',
  '010111111': 'Stilts',
  '101101101': 'Split',
  '111111101': 'Notch',
};

function maskString(mask: boolean[]): string {
  return mask.map((b) => (b ? '1' : '0')).join('');
}

export function shapeName(piece: BuildPiece, mask: boolean[]): string {
  const removed = mask.filter((b) => !b).length;
  if (piece.spec.type === 'wall') return WALL_SHAPES[maskString(mask)] ?? `Custom (${removed} removed)`;
  if (removed === 0) return 'Full Floor';
  if (removed === 1) return 'Floor Hole';
  if (removed === 2) return mask[0] === mask[1] || mask[0] === mask[2] ? 'Half Floor' : 'Diagonal Floor';
  return 'Quarter Floor';
}

/**
 * Fortnite-style editing: aim at your own wall/floor, press G, paint the tiles you
 * want removed (click / drag), press G again to confirm. Right-click resets.
 */
export class EditSystem {
  active = false;
  target: BuildPiece | null = null;
  selection: boolean[] = [];
  hovered = -1;
  private paintValue: boolean | null = null;
  private readonly overlay = new THREE.Group();
  private tileMeshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly keepMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  private readonly cutMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide });
  private readonly frameMat = new THREE.LineBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.95 });
  private readonly hoverMat = new THREE.LineBasicMaterial({ color: 0xffe14d });
  private readonly physics: Physics;

  constructor(physics: Physics) {
    this.physics = physics;
    this.overlay.renderOrder = 10;
    events.on('pieceDestroyed', ({ piece }) => {
      if (piece === this.target) this.cancel();
    });
  }

  /** Piece the player is currently aiming at (within edit range), if any. */
  aimedPiece(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3): BuildPiece | null {
    const eye = actor.eye();
    const t0 = Math.max(0, eye.clone().sub(origin).dot(dir));
    const start = origin.clone().addScaledVector(dir, t0);
    const hit = this.physics.raycast(start, dir, EDIT_RANGE + 1.5, G_SOLID, actor.collider);
    if (!hit || hit.owner?.kind !== 'build') return null;
    if (hit.point.distanceTo(eye) > EDIT_RANGE) return null;
    return hit.owner.piece;
  }

  /** G pressed: start editing the aimed piece, or confirm the current edit. */
  toggle(actor: Actor, origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (this.active) {
      this.confirm();
      return;
    }
    const piece = this.aimedPiece(actor, origin, dir);
    if (!piece) return;
    if (piece.owner !== actor) {
      events.emit('toast', { text: "You can only edit your own builds", tone: 'warn' });
      audio.play('denied');
      return;
    }
    if (!piece.editable) {
      events.emit('toast', { text: 'Only walls and floors can be edited', tone: 'warn' });
      audio.play('denied');
      return;
    }
    this.begin(piece);
  }

  private begin(piece: BuildPiece): void {
    this.active = true;
    this.target = piece;
    this.selection = piece.tiles.slice();
    this.paintValue = null;
    this.hovered = -1;

    const layout = tileLayout(piece.spec.type)!;
    const size = (GRID / layout.cols) * 0.94;
    const depth = BUILD_THICKNESS + 0.12;
    const count = layout.cols * layout.rows;
    for (let t = 0; t < count; t++) {
      const geo = piece.spec.type === 'wall'
        ? new THREE.BoxGeometry(size, size, depth)
        : new THREE.BoxGeometry(size, depth, size);
      const mesh = new THREE.Mesh(geo, this.keepMat);
      tileCenter(piece.spec.type, t, mesh.position);
      mesh.userData.tile = t;
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.frameMat);
      frame.userData.frame = true;
      mesh.add(frame);
      this.overlay.add(mesh);
      this.tileMeshes.push(mesh);
    }
    piece.group.add(this.overlay);
    piece.setEditing(true);
    this.refresh();
    audio.play('edit');
  }

  private refresh(): void {
    for (const mesh of this.tileMeshes) {
      const t = mesh.userData.tile as number;
      mesh.material = this.selection[t] ? this.keepMat : this.cutMat;
      const frame = mesh.children[0] as THREE.LineSegments;
      frame.material = t === this.hovered ? this.hoverMat : this.frameMat;
    }
  }

  /** Per-frame update while editing: hover + paint selection with the mouse. */
  update(actor: Actor, camera: THREE.Camera, mouseDown: boolean, mousePressed: boolean, resetPressed: boolean): void {
    const piece = this.target;
    if (!this.active || !piece) return;
    if (!actor.alive || piece.destroyed || piece.center.distanceTo(actor.position) > KEEP_RANGE + GRID) {
      this.cancel();
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = this.raycaster.intersectObjects(this.tileMeshes, false);
    const hovered = hits.length ? (hits[0].object.userData.tile as number) : -1;

    if (resetPressed) {
      this.selection.fill(true);
      audio.play('edit');
    }
    if (mousePressed && hovered >= 0) this.paintValue = !this.selection[hovered];
    if (!mouseDown) this.paintValue = null;
    if (this.paintValue !== null && hovered >= 0 && this.selection[hovered] !== this.paintValue) {
      this.selection[hovered] = this.paintValue;
      audio.play('edit', undefined, 0.6);
    }
    this.hovered = hovered;
    this.refresh();
  }

  confirm(): void {
    const piece = this.target;
    if (!piece) return this.cancel();
    if (!this.selection.some(Boolean)) {
      events.emit('toast', { text: 'An edit must keep at least one tile', tone: 'warn' });
      audio.play('denied');
      return;
    }
    const changed = this.selection.some((v, i) => v !== piece.tiles[i]);
    if (changed) {
      piece.setTiles(this.selection);
      events.emit('toast', { text: shapeName(piece, this.selection), tone: 'good' });
      audio.play('build', piece.center);
    }
    this.cancel();
  }

  cancel(): void {
    this.target?.setEditing(false);
    for (const mesh of this.tileMeshes) {
      mesh.geometry.dispose();
      (mesh.children[0] as THREE.LineSegments).geometry.dispose();
    }
    this.tileMeshes = [];
    this.overlay.clear();
    this.overlay.parent?.remove(this.overlay);
    this.active = false;
    this.target = null;
    this.hovered = -1;
    this.paintValue = null;
  }

  get previewName(): string {
    return this.target ? shapeName(this.target, this.selection) : '';
  }
}
