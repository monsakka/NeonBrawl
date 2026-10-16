import type * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { BuildPiece } from '../building/BuildPiece';

export interface GameEvents {
  damaged: {
    victim: Actor;
    attacker: Actor | null;
    shieldDamage: number;
    healthDamage: number;
    headshot: boolean;
    point: THREE.Vector3 | null;
    source: string;
  };
  eliminated: { victim: Actor; killer: Actor | null; source: string };
  structureHit: { piece: BuildPiece; attacker: Actor | null; amount: number; destroyed: boolean };
  pieceDestroyed: { piece: BuildPiece };
  toast: { text: string; tone?: 'info' | 'warn' | 'good' };
}

type Handler<T> = (payload: T) => void;

/** Tiny typed pub/sub used to decouple combat, HUD, round loop and AI. */
export class Emitter<M> {
  private handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<M[K]>)(payload);
  }
}

export const events = new Emitter<GameEvents>();
