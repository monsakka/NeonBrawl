import type * as THREE from 'three';

export type Sfx =
  | 'ar' | 'shotgun' | 'pickaxe' | 'pickaxeHit' | 'build' | 'edit' | 'break'
  | 'hit' | 'headshot' | 'hurt' | 'shieldHit' | 'elim' | 'slurp' | 'reload' | 'empty'
  | 'storm' | 'countdown' | 'go' | 'victory' | 'denied';

/**
 * Every sound is synthesised with WebAudio so the prototype ships with zero assets.
 * Positional sounds are attenuated by distance to the listener.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listener: THREE.Vector3 | null = null;
  private lastPlay = new Map<Sfx, number>();
  volume = 0.5;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setListener(pos: THREE.Vector3): void {
    this.listener = pos;
  }

  play(name: Sfx, at?: THREE.Vector3, gain = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    // Throttle identical sounds stacking within the same few ms (shotgun pellets, turbo build).
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.025) return;
    this.lastPlay.set(name, now);

    let g = gain;
    if (at && this.listener) {
      const d = at.distanceTo(this.listener);
      g *= 1 / (1 + d * 0.06);
      if (g < 0.02) return;
    }
    const out = ctx.createGain();
    out.gain.value = g;
    out.connect(this.master);

    switch (name) {
      case 'ar': this.burst(out, 0.09, 1800, 0.7); this.tone(out, 110, 55, 0.08, 0.6, 'square'); break;
      case 'shotgun': this.burst(out, 0.28, 900, 1.0); this.tone(out, 80, 35, 0.2, 0.9, 'sine'); break;
      case 'pickaxe': this.burst(out, 0.06, 3000, 0.25); break;
      case 'pickaxeHit': this.tone(out, 420, 180, 0.09, 0.5, 'triangle'); this.burst(out, 0.05, 2500, 0.4); break;
      case 'build': this.tone(out, 200, 120, 0.08, 0.5, 'triangle'); this.burst(out, 0.04, 1200, 0.25); break;
      case 'edit': this.tone(out, 660, 880, 0.07, 0.25, 'sine'); break;
      case 'break': this.burst(out, 0.35, 700, 0.8); this.tone(out, 140, 50, 0.25, 0.4, 'sawtooth'); break;
      case 'hit': this.tone(out, 1500, 1200, 0.05, 0.25, 'square'); break;
      case 'headshot': this.tone(out, 1900, 2400, 0.12, 0.3, 'sine'); this.tone(out, 2800, 2800, 0.1, 0.15, 'sine'); break;
      case 'hurt': this.tone(out, 160, 70, 0.18, 0.6, 'sawtooth'); break;
      case 'shieldHit': this.tone(out, 900, 500, 0.1, 0.35, 'triangle'); break;
      case 'elim': this.tone(out, 520, 1040, 0.25, 0.4, 'triangle'); this.tone(out, 780, 1560, 0.3, 0.25, 'sine'); break;
      case 'slurp': this.tone(out, 300, 500, 0.3, 0.25, 'sine'); break;
      case 'reload': this.burst(out, 0.05, 2200, 0.3); this.tone(out, 700, 600, 0.05, 0.2, 'square'); break;
      case 'empty': this.tone(out, 1200, 1100, 0.03, 0.2, 'square'); break;
      case 'storm': this.tone(out, 55, 45, 0.5, 0.5, 'sawtooth'); break;
      case 'countdown': this.tone(out, 660, 660, 0.15, 0.35, 'square'); break;
      case 'go': this.tone(out, 990, 990, 0.35, 0.4, 'square'); break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(out, f, f, 0.3, 0.35, 'triangle', i * 0.12));
        break;
      case 'denied': this.tone(out, 220, 180, 0.12, 0.3, 'square'); break;
    }
  }

  private tone(out: AudioNode, f0: number, f1: number, dur: number, vol: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(out: AudioNode, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new Audio();
