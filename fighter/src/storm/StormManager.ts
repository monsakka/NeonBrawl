import * as THREE from 'three';
import {
  MAP_HALF, STORM_IGNORES_SHIELD, STORM_PHASES, STORM_START_RADIUS, STORM_TICK, type StormPhaseDef,
} from '../config';
import type { Actor } from '../actors/Actor';

export type StormState = 'waiting' | 'shrinking' | 'closed';

export interface StormStatus {
  state: StormState;
  phase: number; // 1-based for display
  phases: number;
  timeLeft: number;
  damage: number;
}

const WALL_HEIGHT = 260;

/**
 * Moving storm: each phase waits (next circle shown), then lerps the centre and
 * radius towards a random circle that lies entirely inside the current one.
 * Actors outside the safe circle take ticking damage.
 */
export class StormManager {
  readonly center = new THREE.Vector2();
  radius = STORM_START_RADIUS;
  readonly nextCenter = new THREE.Vector2();
  nextRadius = STORM_START_RADIUS;
  private readonly fromCenter = new THREE.Vector2();
  private fromRadius = STORM_START_RADIUS;
  phase = 0;
  state: StormState = 'waiting';
  timer = 0;
  private tickTimer = 0;
  private time = 0;

  private readonly wall: THREE.Mesh;
  private readonly wallMat: THREE.ShaderMaterial;
  private readonly nextRing: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.wallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uHeight: { value: WALL_HEIGHT } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vY;
        void main() {
          vUv = uv; vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uHeight;
        varying vec2 vUv; varying float vY;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = vec2(vUv.x * 90.0, vY * 0.08);
          float n = noise(p + vec2(uTime * 0.6, -uTime * 0.9)) * 0.6 + noise(p * 2.3 - vec2(uTime, uTime * 0.4)) * 0.4;
          float bands = 0.5 + 0.5 * sin(vY * 0.35 + vUv.x * 300.0 + uTime * 2.0 + n * 6.0);
          vec3 col = mix(vec3(0.33, 0.08, 0.62), vec3(0.75, 0.35, 1.0), n * 0.7 + bands * 0.3);
          float base = 1.0 - smoothstep(0.0, 6.0, vY);
          col += vec3(0.9, 0.6, 1.0) * base * 0.6;
          float a = 0.3 + n * 0.22 + base * 0.3;
          a *= 1.0 - smoothstep(uHeight * 0.7, uHeight, vY);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const geo = new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 128, 1, true);
    geo.translate(0, WALL_HEIGHT / 2, 0);
    this.wall = new THREE.Mesh(geo, this.wallMat);
    this.wall.renderOrder = 20;
    this.wall.frustumCulled = false;
    scene.add(this.wall);

    this.nextRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.nextRing.rotation.x = -Math.PI / 2;
    this.nextRing.position.y = 0.08;
    scene.add(this.nextRing);
  }

  get currentPhase(): StormPhaseDef {
    return STORM_PHASES[Math.min(this.phase, STORM_PHASES.length - 1)];
  }

  /** New round: random first circle fully inside the map, then queue phase 1. */
  reset(): void {
    const margin = MAP_HALF - STORM_START_RADIUS;
    this.center.set((Math.random() * 2 - 1) * margin * 0.6, (Math.random() * 2 - 1) * margin * 0.6);
    this.radius = STORM_START_RADIUS;
    this.phase = 0;
    this.tickTimer = 0;
    this.beginPhase();
    this.syncVisuals();
  }

  private beginPhase(): void {
    const def = this.currentPhase;
    this.state = 'waiting';
    this.timer = def.wait;
    this.fromCenter.copy(this.center);
    this.fromRadius = this.radius;
    // Shift: the next circle may land anywhere that keeps it inside the current one.
    const slack = Math.max(0, this.radius - def.radius);
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * slack * 0.9;
    this.nextCenter.set(this.center.x + Math.cos(ang) * dist, this.center.y + Math.sin(ang) * dist);
    const lim = MAP_HALF - def.radius - 2;
    this.nextCenter.clampScalar(-lim, lim);
    this.nextRadius = def.radius;
    // Rebuild the ring so its painted width stays 0.5 m regardless of radius.
    this.nextRing.geometry.dispose();
    const r = Math.max(0.6, def.radius);
    this.nextRing.geometry = new THREE.RingGeometry(r - 0.5, r, 160);
  }

  isInside(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.y;
    return dx * dx + dz * dz <= this.radius * this.radius;
  }

  /** Distance from `pos` to the safe circle edge (negative = inside). */
  distanceOutside(pos: THREE.Vector3): number {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) - this.radius;
  }

  update(dt: number, actors: readonly Actor[]): void {
    this.time += dt;
    this.wallMat.uniforms.uTime.value = this.time;

    if (this.state !== 'closed') {
      this.timer -= dt;
      if (this.state === 'waiting' && this.timer <= 0) {
        this.state = 'shrinking';
        this.timer = this.currentPhase.shrink;
      } else if (this.state === 'shrinking') {
        const def = this.currentPhase;
        const t = 1 - Math.max(0, this.timer) / def.shrink;
        this.center.lerpVectors(this.fromCenter, this.nextCenter, t);
        this.radius = THREE.MathUtils.lerp(this.fromRadius, this.nextRadius, t);
        if (this.timer <= 0) {
          this.center.copy(this.nextCenter);
          this.radius = this.nextRadius;
          if (this.phase >= STORM_PHASES.length - 1) {
            this.state = 'closed';
            this.timer = 0;
          } else {
            this.phase++;
            this.beginPhase();
          }
        }
      }
    }

    this.tickTimer += dt;
    if (this.tickTimer >= STORM_TICK) {
      this.tickTimer -= STORM_TICK;
      const dmg = this.currentPhase.damage;
      for (const a of actors) {
        if (a.alive && !this.isInside(a.position)) {
          a.takeDamage(dmg, null, 'storm', { bypassShield: STORM_IGNORES_SHIELD });
        }
      }
    }
    this.syncVisuals();
  }

  private syncVisuals(): void {
    const r = Math.max(0.05, this.radius);
    this.wall.scale.set(r, 1, r);
    this.wall.position.set(this.center.x, 0, this.center.y);
    const showNext = this.state === 'waiting' || this.state === 'shrinking';
    this.nextRing.visible = showNext && this.nextRadius > 0.5;
    this.nextRing.position.set(this.nextCenter.x, 0.08, this.nextCenter.y);
  }

  status(): StormStatus {
    return {
      state: this.state,
      phase: Math.min(this.phase + 1, STORM_PHASES.length),
      phases: STORM_PHASES.length,
      timeLeft: Math.max(0, this.timer),
      damage: this.currentPhase.damage,
    };
  }
}
