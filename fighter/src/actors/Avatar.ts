import * as THREE from 'three';
import type { WeaponId } from '../config';

const tmp = new THREE.Vector3();

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Low-poly humanoid rig built from primitives: legs/arms are pivot groups so the
 * walk cycle, crouch, aim pitch, pickaxe swing and drink poses are simple rotations.
 * The model faces -Z (Three.js forward) and its origin is at the feet.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly aim = new THREE.Group();
  private readonly handR = new THREE.Group();
  private readonly models = new Map<WeaponId, THREE.Object3D>();
  private readonly muzzles = new Map<WeaponId, THREE.Object3D>();
  private readonly flashMats: THREE.MeshStandardMaterial[] = [];
  private weapon: WeaponId = 'pickaxe';
  private phase = 0;
  private flash = 0;
  private swing = 0;
  private kick = 0;
  private crouch = 0;

  constructor(color: number, accent: number) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 });
    const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5 });
    this.flashMats.push(suit, trim, skin);

    // Legs: pivot at the hip.
    for (const [leg, x] of [[this.legL, -0.15], [this.legR, 0.15]] as const) {
      leg.position.set(x, 0.92, 0);
      leg.add(box(0.22, 0.86, 0.24, dark, 0, -0.45, 0));
      leg.add(box(0.24, 0.12, 0.32, trim, 0, -0.86, -0.04));
      this.root.add(leg);
    }

    this.root.add(this.upper);
    this.upper.add(box(0.5, 0.22, 0.3, dark, 0, 0.98, 0)); // hips
    this.upper.add(box(0.58, 0.6, 0.34, suit, 0, 1.36, 0)); // torso
    this.upper.add(box(0.6, 0.1, 0.36, trim, 0, 1.12, 0)); // belt
    this.upper.add(box(0.4, 0.5, 0.18, trim, 0, 1.4, 0.24)); // backpack

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.y = 1.86;
    head.castShadow = true;
    this.upper.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), trim);
    hair.position.y = 1.88;
    this.upper.add(hair);
    this.upper.add(box(0.26, 0.06, 0.04, dark, 0, 1.87, -0.19)); // visor/eyes - marks the facing side

    for (const [arm, x] of [[this.armL, -0.38], [this.armR, 0.38]] as const) {
      arm.position.set(x, 1.6, 0);
      arm.add(box(0.15, 0.6, 0.16, suit, 0, -0.3, 0));
      arm.add(box(0.13, 0.12, 0.13, skin, 0, -0.64, 0));
      this.upper.add(arm);
    }
    this.handR.position.set(0, -0.66, 0);
    this.armR.add(this.handR);

    // Aim pivot carries the guns and follows look pitch.
    this.aim.position.set(0.12, 1.5, 0);
    this.upper.add(this.aim);

    this.buildWeapons(dark);
    this.setWeapon('pickaxe');
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  private buildWeapons(dark: THREE.Material): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.8 });

    const gun = (id: WeaponId, len: number, body: THREE.Material, rarity: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.06, -0.08, -0.35);
      g.add(box(0.08, 0.13, len, body, 0, 0, -len / 2));
      g.add(box(0.05, 0.05, 0.3, metal, 0, 0.02, -len - 0.12));
      g.add(box(0.07, 0.04, len * 0.6, new THREE.MeshStandardMaterial({ color: rarity, emissive: rarity, emissiveIntensity: 0.4 }), 0, 0.09, -len / 2));
      g.add(box(0.07, 0.16, 0.12, dark, 0, -0.12, -0.12));
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.02, -len - 0.3);
      g.add(muzzle);
      this.muzzles.set(id, muzzle);
      this.aim.add(g);
      return g;
    };

    const ar = gun('ar', 0.62, metal, 0x3fa2ff);
    ar.add(box(0.06, 0.2, 0.1, dark, 0, -0.14, -0.38)); // magazine
    ar.add(box(0.07, 0.07, 0.14, dark, 0, 0.12, -0.24)); // sight
    this.models.set('ar', ar);

    const sg = gun('shotgun', 0.72, wood, 0x4fd14f);
    sg.add(box(0.09, 0.08, 0.2, metal, 0, -0.08, -0.5)); // pump
    this.models.set('shotgun', sg);

    const pick = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), wood);
    handle.position.set(0, 0, -0.3);
    handle.rotation.x = Math.PI / 2;
    pick.add(handle);
    pick.add(box(0.07, 0.5, 0.07, new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.7, roughness: 0.3 }), 0, 0.05, -0.72));
    pick.rotation.x = -Math.PI / 2;
    this.handR.add(pick);
    this.models.set('pickaxe', pick);

    const slurp = new THREE.Group();
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.28, 10),
      new THREE.MeshStandardMaterial({ color: 0x7b4dff, emissive: 0x4422aa, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
    );
    bottle.position.y = -0.1;
    slurp.add(bottle);
    this.handR.add(slurp);
    this.models.set('slurp', slurp);
  }

  setWeapon(id: WeaponId): void {
    this.weapon = id;
    for (const [key, obj] of this.models) obj.visible = key === id;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  swingPickaxe(): void {
    this.swing = 1;
  }

  recoil(amount: number): void {
    this.kick = Math.min(1, this.kick + amount);
  }

  hitFlash(): void {
    this.flash = 1;
  }

  muzzleWorld(target: THREE.Vector3): THREE.Vector3 {
    const m = this.muzzles.get(this.weapon);
    if (m && m.visible !== false && this.models.get(this.weapon)?.visible) return m.getWorldPosition(target);
    return this.handR.getWorldPosition(target);
  }

  update(dt: number, opts: { yaw: number; pitch: number; speed: number; grounded: boolean; crouch: boolean; drinking: boolean }): void {
    this.root.rotation.y = opts.yaw;
    this.crouch += ((opts.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 14);

    const moving = Math.min(1, opts.speed / 6);
    this.phase += dt * (4 + opts.speed * 1.4);
    const stride = opts.grounded ? Math.sin(this.phase) * 0.75 * moving : 0.5;
    this.legL.rotation.x = stride;
    this.legR.rotation.x = opts.grounded ? -stride : -0.3;

    // Crouch: drop the upper body and shorten the legs.
    this.upper.position.y = -0.42 * this.crouch + (opts.grounded ? Math.abs(Math.sin(this.phase)) * 0.04 * moving : 0);
    const legScale = 1 - 0.46 * this.crouch;
    this.legL.scale.y = this.legR.scale.y = legScale;
    this.legL.position.y = this.legR.position.y = 0.92 * legScale;

    this.kick = Math.max(0, this.kick - dt * 8);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.aim.rotation.x = opts.pitch + this.kick * 0.25;
    this.aim.position.z = this.kick * 0.06;

    const holdGun = this.weapon === 'ar' || this.weapon === 'shotgun';
    if (holdGun) {
      this.armR.rotation.set(Math.PI / 2 + opts.pitch + this.kick * 0.2, 0, 0.12);
      this.armL.rotation.set(Math.PI / 2 + opts.pitch + this.kick * 0.2, 0, -0.55);
    } else if (this.weapon === 'pickaxe') {
      // Wind-up then a fast downward chop driven by the swing timer.
      const s = this.swing;
      const chop = s > 0.7 ? (1 - s) / 0.3 * -1.2 : s * 2.4 - 0.2;
      this.armR.rotation.set(0.6 + chop + stride * 0.3 * (1 - s), 0, 0.1);
      this.armL.rotation.set(-stride * 0.6, 0, -0.1);
    } else {
      // Slurp: raise to the mouth while drinking.
      const lift = opts.drinking ? 2.6 + Math.sin(this.phase * 0.7) * 0.1 : 0.4;
      this.armR.rotation.set(lift, 0, opts.drinking ? -0.4 : 0.1);
      this.armL.rotation.set(-stride * 0.6, 0, -0.1);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.flashMats) m.emissive.setRGB(this.flash, this.flash * 0.9, this.flash * 0.9);
    }
  }

  /** World position of the head (used for nameplates / damage numbers). */
  headWorld(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.root.position).add(tmp.set(0, 2.15 - this.crouch * 0.42, 0));
  }
}
