import * as THREE from 'three';
import { ELIM_POINTS, STORM_START_RADIUS } from '../config';
import { audio } from '../core/Audio';
import { events } from '../core/Events';
import type { Actor } from '../actors/Actor';
import type { BotManager } from '../ai/BotManager';
import type { BuildingSystem } from '../building/BuildingSystem';
import type { Effects } from '../fx/Effects';
import type { PlayerController } from '../player/PlayerController';
import type { StormManager } from '../storm/StormManager';
import type { HUD } from '../ui/HUD';
import type { GameWorld } from '../world/World';
import { placementPoints, type Tournament } from './Tournament';

export type RoundState = 'menu' | 'countdown' | 'live' | 'ended';

const COUNTDOWN = 3;

export interface RoundDeps {
  player: PlayerController;
  bots: BotManager;
  building: BuildingSystem;
  storm: StormManager;
  world: GameWorld;
  fx: Effects;
  hud: HUD;
  tournament: Tournament;
  requestLock: () => void;
}

/**
 * Zone Wars round loop: spawn everyone on a ring inside the first circle, count
 * down, run the round until one player is left, bank tournament points and show
 * the summary. A session is ROUNDS_PER_SESSION rounds.
 */
export class RoundManager {
  state: RoundState = 'menu';
  timeScale = 1;
  private countdown = 0;
  private lastBeep = 0;
  private endDelay = 0;
  private readonly d: RoundDeps;

  constructor(deps: RoundDeps) {
    this.d = deps;
    events.on('eliminated', (e) => this.onEliminated(e.victim, e.killer));
  }

  get allActors(): Actor[] {
    return [this.d.player.actor, ...this.d.bots.actors];
  }

  get aliveActors(): Actor[] {
    return this.allActors.filter((a) => a.alive);
  }

  /** True while the world should simulate. */
  get simulating(): boolean {
    return this.state === 'countdown' || this.state === 'live' || (this.state === 'ended' && this.endDelay > 0);
  }

  startSession(): void {
    this.d.tournament.reset(this.allActors);
    this.startRound();
  }

  startRound(): void {
    const { player, building, storm, world, fx, hud, tournament, bots } = this.d;
    tournament.round++;
    tournament.roundRecorded = false;
    building.clear();
    fx.clear();
    world.resetProps();
    storm.reset();

    // Zone Wars spawn: evenly around a ring inside the first circle, facing the centre.
    const actors = this.allActors;
    const offset = Math.random() * Math.PI * 2;
    actors.forEach((a, i) => {
      const ang = offset + (i / actors.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const r = STORM_START_RADIUS * (0.55 + Math.random() * 0.2);
      const pos = new THREE.Vector3(storm.center.x + Math.cos(ang) * r, 0.2, storm.center.y + Math.sin(ang) * r);
      const yaw = Math.atan2(-(storm.center.x - pos.x), -(storm.center.y - pos.z));
      a.spawn(pos, yaw);
    });
    player.resetView(player.actor.yaw);
    for (const b of bots.bots) b.reset();

    this.timeScale = 1;
    this.state = 'countdown';
    this.countdown = COUNTDOWN;
    this.lastBeep = COUNTDOWN + 1;
    player.enabled = false;
    hud.hideMenu();
    hud.setScoreboard(false);
    hud.center(`ROUND ${tournament.round}`, `of ${tournament.totalRounds} · ${actors.length} players`, COUNTDOWN);
  }

  private onEliminated(victim: Actor, killer: Actor | null): void {
    if (this.state !== 'live') return;
    const { player, hud } = this.d;
    const alive = this.aliveActors;
    victim.placement = alive.length + 1;

    if (victim === player.actor) {
      player.spectate = killer && killer.alive ? killer : alive[0] ?? null;
      const pts = placementPoints(victim.placement) + victim.elims * ELIM_POINTS;
      hud.center(`#${victim.placement}`, `${killer ? `Eliminated by ${killer.name}` : 'Eliminated'} · +${pts} pts`, 4);
    } else if (player.spectate === victim) {
      player.spectate = killer && killer.alive ? killer : alive[0] ?? null;
    }

    if (alive.length <= 1) {
      const winner = alive[0];
      if (winner) winner.placement = 1;
      else victim.placement = 1; // simultaneous storm deaths: last processed wins
      this.finishRound(winner ?? victim);
    }
  }

  private finishRound(winner: Actor): void {
    const { player, hud } = this.d;
    this.state = 'ended';
    this.endDelay = 2.5;
    this.timeScale = 1;
    if (winner === player.actor) {
      hud.center('VICTORY ROYALE', `#1 · ${winner.elims} elims`, 3);
      audio.play('victory');
    } else {
      hud.center(`${winner.name} WINS`, `You placed #${player.actor.placement}`, 3);
    }
  }

  private showSummary(): void {
    const { player, hud, tournament } = this.d;
    tournament.record(this.allActors);
    document.exitPointerLock();
    player.enabled = false;
    const me = player.actor;
    const pts = placementPoints(me.placement) + me.elims * ELIM_POINTS;
    const rank = tournament.rankOf(me);
    const last = tournament.finished;
    const title = last ? 'Session complete' : `Round ${tournament.round} complete`;
    const body = `
      <div class="summary">
        <div><b>#${me.placement}</b><small>Placement</small></div>
        <div><b>${me.elims}</b><small>Elims</small></div>
        <div><b>+${pts}</b><small>Points</small></div>
        <div><b>${rank}${['', 'st', 'nd', 'rd'][rank] ?? 'th'}</b><small>Overall</small></div>
      </div>
      ${hud.leaderboardHtml(true)}`;
    const buttons = last
      ? [{ label: 'New session', primary: true, onClick: () => this.begin(() => this.startSession()) }]
      : [{ label: `Next round (${tournament.round + 1}/${tournament.totalRounds})`, primary: true, onClick: () => this.begin(() => this.startRound()) }];
    hud.showMenu(title, body, buttons);
  }

  private begin(fn: () => void): void {
    this.d.requestLock();
    audio.unlock();
    fn();
  }

  toggleFastForward(): void {
    if (this.state === 'live' && !this.d.player.actor.alive) this.timeScale = this.timeScale > 1 ? 1 : 4;
  }

  update(dt: number): void {
    const { player, hud } = this.d;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const sec = Math.ceil(this.countdown);
      if (sec < this.lastBeep && sec > 0) {
        this.lastBeep = sec;
        audio.play('countdown');
        hud.center(String(sec), 'Get ready', 1);
      }
      if (this.countdown <= 0) {
        this.state = 'live';
        player.enabled = true;
        audio.play('go');
        hud.center('GO!', 'Survive the storm', 0.8);
      }
    } else if (this.state === 'ended' && this.endDelay > 0) {
      this.endDelay -= dt;
      if (this.endDelay <= 0) this.showSummary();
    }
  }
}
