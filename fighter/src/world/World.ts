import * as THREE from 'three';
import { GRID, MAP_HALF, type MaterialType } from '../config';
import { Physics, RAPIER, G_WORLD } from '../core/Physics';
import { seeded } from '../core/Random';
import { barkTexture, groundTexture } from '../core/Textures';

export type PropKind = 'tree' | 'rock' | 'crate';

/** Harvestable scenery. Pickaxe hits yield materials; props respawn every round. */
export class Prop {
  readonly kind: PropKind;
  readonly material: MaterialType;
  readonly maxHp: number;
  hp: number;
  alive = true;
  readonly group: THREE.Group;
  colliders: RAPIER.Collider[] = [];
  wobble = 0;
  readonly build: () => void;

  constructor(kind: PropKind, group: THREE.Group, maxHp: number, build: () => void) {
    this.kind = kind;
    this.material = kind === 'tree' ? 'wood' : kind === 'rock' ? 'brick' : 'metal';
    this.group = group;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.build = build;
  }
}

const HARVEST_PER_HIT: Record<PropKind, number> = { tree: 12, rock: 10, crate: 8 };

export class GameWorld {
  readonly props: Prop[] = [];
  private readonly scene: THREE.Scene;
  private readonly physics: Physics;

  constructor(scene: THREE.Scene, physics: Physics) {
    this.scene = scene;
    this.physics = physics;
    this.buildSky();
    this.buildGround();
    this.buildBoundary();
    this.buildProps();
  }

  private buildSky(): void {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fd8) },
        horizon: { value: new THREE.Color(0xbfe3ff) },
        bottom: { value: new THREE.Color(0x8fb7d9) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
  }

  private buildGround(): void {
    // Half-size is a whole number of cells so texture tiles line up with the build grid.
    const size = Math.ceil((MAP_HALF + 120) / GRID) * GRID * 2;
    const tex = groundTexture();
    tex.repeat.set(size / GRID, size / GRID);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.physics.addCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, 5, size / 2).setTranslation(0, -5, 0),
      { kind: 'ground' },
      G_WORLD,
    );
  }

  private buildBoundary(): void {
    const h = 120;
    const t = 2;
    const L = MAP_HALF + t;
    const walls: [number, number, number, number][] = [
      [L, 0, t, L], [-L, 0, t, L], [0, L, L, t], [0, -L, L, t],
    ];
    for (const [x, z, hx, hz] of walls) {
      this.physics.addCollider(
        RAPIER.ColliderDesc.cuboid(hx, h, hz).setTranslation(x, h, z), { kind: 'ground' }, G_WORLD,
      );
    }
    // Visual: low glowing fence at the map edge.
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    for (const [x, z, hx, hz] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(hx, hz) * 2, 6), mat);
      m.position.set(x, 3, z);
      if (hx < hz) m.rotation.y = Math.PI / 2;
      this.scene.add(m);
    }
  }

  private buildProps(): void {
    const rnd = seeded(1337);
    const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });
    const leafMats = [0x3d7a35, 0x4f8f3a, 0x2f6b3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.9, flatShading: true });
    const crateMats = [0xc0392b, 0x2e86c1, 0xd4ac0d].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4 }));

    const spots: THREE.Vector2[] = [];
    const tryPlace = (minGap: number): THREE.Vector2 | null => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const p = new THREE.Vector2((rnd() * 2 - 1) * (MAP_HALF - 8), (rnd() * 2 - 1) * (MAP_HALF - 8));
        if (spots.every((s) => s.distanceTo(p) > minGap)) {
          spots.push(p);
          return p;
        }
      }
      return null;
    };

    for (let i = 0; i < 110; i++) {
      const p = tryPlace(9);
      if (!p) continue;
      const scale = 0.8 + rnd() * 0.6;
      const leaf = leafMats[Math.floor(rnd() * leafMats.length)];
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.y);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.42 * scale, 3.6 * scale, 8), bark);
      trunk.position.y = 1.8 * scale;
      const crownA = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * scale, 0), leaf);
      crownA.position.y = 4.6 * scale;
      const crownB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * scale, 0), leaf);
      crownB.position.set(0.4 * scale, 6.1 * scale, -0.2 * scale);
      for (const m of [trunk, crownA, crownB]) {
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }
      const prop: Prop = new Prop('tree', group, 260, () => {
        prop.colliders.push(this.physics.addCollider(
          RAPIER.ColliderDesc.cylinder(1.8 * scale, 0.42 * scale).setTranslation(p.x, 1.8 * scale, p.y),
          { kind: 'prop', prop }, G_WORLD,
        ));
        prop.colliders.push(this.physics.addCollider(
          RAPIER.ColliderDesc.ball(1.9 * scale).setTranslation(p.x, 4.8 * scale, p.y),
          { kind: 'prop', prop }, G_WORLD,
        ));
      });
      this.props.push(prop);
    }

    for (let i = 0; i < 45; i++) {
      const p = tryPlace(10);
      if (!p) continue;
      const s = 1.2 + rnd() * 1.6;
      const geo = new THREE.DodecahedronGeometry(1, 0);
      geo.scale(s * (1 + rnd() * 0.5), s * 0.75, s * (1 + rnd() * 0.5));
      geo.rotateY(rnd() * Math.PI);
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.castShadow = mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.position.set(p.x, s * 0.35, p.y);
      group.add(mesh);
      const points = new Float32Array(geo.attributes.position.array);
      const prop: Prop = new Prop('rock', group, 400, () => {
        const desc = RAPIER.ColliderDesc.convexHull(points);
        if (!desc) return;
        prop.colliders.push(this.physics.addCollider(
          desc.setTranslation(p.x, s * 0.35, p.y), { kind: 'prop', prop }, G_WORLD,
        ));
      });
      this.props.push(prop);
    }

    for (let i = 0; i < 16; i++) {
      const p = tryPlace(14);
      if (!p) continue;
      const rotY = rnd() > 0.5 ? 0 : Math.PI / 2;
      const group = new THREE.Group();
      group.position.set(p.x, 1.3, p.y);
      group.rotation.y = rotY;
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6), crateMats[Math.floor(rnd() * crateMats.length)]);
      box.castShadow = box.receiveShadow = true;
      group.add(box);
      for (let r = -2; r <= 2; r++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        rib.position.z = r * 1.3;
        group.add(rib);
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      const prop: Prop = new Prop('crate', group, 600, () => {
        prop.colliders.push(this.physics.addCollider(
          RAPIER.ColliderDesc.cuboid(1.3, 1.3, 3).setTranslation(p.x, 1.3, p.y).setRotation(q),
          { kind: 'prop', prop }, G_WORLD,
        ));
      });
      this.props.push(prop);
    }

    this.resetProps();
  }

  /** Restores every prop (called at the start of each round). */
  resetProps(): void {
    for (const prop of this.props) {
      if (!prop.alive || prop.colliders.length === 0) {
        for (const c of prop.colliders) this.physics.removeCollider(c);
        prop.colliders = [];
        prop.build();
      }
      prop.alive = true;
      prop.hp = prop.maxHp;
      prop.group.scale.setScalar(1);
      if (!prop.group.parent) this.scene.add(prop.group);
    }
  }

  /** Applies harvesting damage. Returns the materials gained by the attacker. */
  harvest(prop: Prop, damage: number): number {
    if (!prop.alive) return 0;
    prop.hp -= damage;
    prop.wobble = 1;
    let gained = HARVEST_PER_HIT[prop.kind];
    if (prop.hp <= 0) {
      prop.alive = false;
      gained += 20;
      for (const c of prop.colliders) this.physics.removeCollider(c);
      prop.colliders = [];
      this.scene.remove(prop.group);
    }
    return gained;
  }

  update(dt: number): void {
    for (const prop of this.props) {
      if (prop.wobble <= 0) continue;
      prop.wobble = Math.max(0, prop.wobble - dt * 4);
      const s = 1 + Math.sin(prop.wobble * 18) * 0.04 * prop.wobble;
      prop.group.scale.set(s, 1, s);
    }
  }
}
