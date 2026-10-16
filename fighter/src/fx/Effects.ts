import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
}

interface Tracer {
  line: THREE.Line;
  life: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
}

const MAX_PARTICLES = 900;
const dummy = new THREE.Object3D();

/** Pooled visual effects: tracers, impact sparks, build debris, muzzle flashes. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly instanced: THREE.InstancedMesh;
  private readonly tracers: Tracer[] = [];
  private readonly flashes: Flash[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      MAX_PARTICLES,
    );
    this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instanced.count = 0;
    this.instanced.frustumCulled = false;
    this.instanced.castShadow = false;
    // Allocate the colour buffer up-front.
    this.instanced.setColorAt(0, new THREE.Color());
    scene.add(this.instanced);

    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 48; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    const flashGeo = new THREE.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
        color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.flashes.push({ mesh, life: 0 });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe9a8): void {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const attr = t.line.geometry.attributes.position as THREE.BufferAttribute;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    (t.line.material as THREE.LineBasicMaterial).color.setHex(color);
    t.line.visible = true;
    t.life = 0.06;
  }

  muzzleFlash(at: THREE.Vector3, scale = 1): void {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.mesh.position.copy(at);
    f.mesh.scale.setScalar(scale * (0.8 + Math.random() * 0.5));
    f.mesh.visible = true;
    f.life = 0.05;
  }

  /** Small sparks/chips spraying out of a surface. */
  impact(point: THREE.Vector3, normal: THREE.Vector3, color: number, count = 5): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const vel = normal.clone().multiplyScalar(2 + Math.random() * 3)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(4));
      this.spawn(point, vel, 0.05 + Math.random() * 0.05, 0.25 + Math.random() * 0.25, c, -14);
    }
  }

  /** Chunky debris when a build or prop breaks. `extent` is the half-size of the source. */
  debris(center: THREE.Vector3, extent: THREE.Vector3, color: number, count = 26): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = center.clone().add(new THREE.Vector3(
        (Math.random() * 2 - 1) * extent.x, (Math.random() * 2 - 1) * extent.y, (Math.random() * 2 - 1) * extent.z,
      ));
      const vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1, (Math.random() - 0.5) * 6);
      this.spawn(p, vel, 0.15 + Math.random() * 0.3, 0.8 + Math.random() * 0.7, c, -18);
    }
  }

  /** Upward burst for eliminations. */
  burst(center: THREE.Vector3, color: number): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 40; i++) {
      const vel = new THREE.Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 7, (Math.random() - 0.5) * 5);
      this.spawn(center.clone().add(new THREE.Vector3(0, 1, 0)), vel, 0.1 + Math.random() * 0.12, 1 + Math.random(), c, -6);
    }
  }

  private spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life: number, color: THREE.Color, gravity: number): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      pos: pos.clone(), vel, size, life, maxLife: life, color, gravity,
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      rot: new THREE.Euler(),
    });
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.06) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.mesh.visible = false;
    }

    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.size * 0.5) {
        p.pos.y = p.size * 0.5;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.maxLife) * 3));
      dummy.updateMatrix();
      this.instanced.setMatrixAt(n, dummy.matrix);
      this.instanced.setColorAt(n, p.color);
      n++;
    }
    this.instanced.count = n;
    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) this.instanced.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.particles.length = 0;
    this.instanced.count = 0;
    this.scene.updateMatrixWorld();
  }
}
