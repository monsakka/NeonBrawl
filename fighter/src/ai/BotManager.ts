import type * as THREE from 'three';
import { BOT_COUNT } from '../config';
import { events } from '../core/Events';
import type { Physics } from '../core/Physics';
import { Actor } from '../actors/Actor';
import { Bot, type BotServices } from './Bot';

const NAMES = ['Blaze', 'Vortex', 'Echo', 'Kairo', 'Nova', 'Raptor', 'Jinx', 'Ghost', 'Mako', 'Rift', 'Onyx', 'Volt'];
const COLORS: [number, number][] = [
  [0xd94141, 0x222222], [0x3fae49, 0xf2d64b], [0x8e44ad, 0x1abc9c], [0xe67e22, 0x2c3e50], [0x2c3e50, 0xe74c3c],
  [0xf1c40f, 0x8e44ad], [0x16a085, 0xecf0f1], [0x7f8c8d, 0xd35400], [0xc0392b, 0xf39c12], [0x34495e, 0x1abc9c],
];

export class BotManager {
  readonly bots: Bot[] = [];

  constructor(scene: THREE.Scene, physics: Physics, services: BotServices) {
    for (let i = 0; i < BOT_COUNT; i++) {
      const [color, accent] = COLORS[i % COLORS.length];
      const actor = new Actor(`${NAMES[i % NAMES.length]}`, physics, scene, { isPlayer: false, color, accent });
      actor.despawn();
      // Spread skill across the lobby so fights feel varied.
      const skill = 0.25 + (i / Math.max(1, BOT_COUNT - 1)) * 0.6;
      this.bots.push(new Bot(actor, services, skill));
    }
    events.on('damaged', ({ victim, attacker }) => {
      const bot = this.bots.find((b) => b.actor === victim);
      bot?.onDamaged(attacker);
    });
  }

  get actors(): Actor[] {
    return this.bots.map((b) => b.actor);
  }

  fixedUpdate(dt: number): void {
    for (const bot of this.bots) bot.fixedUpdate(dt);
  }
}
