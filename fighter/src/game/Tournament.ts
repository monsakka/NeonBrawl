import { ELIM_POINTS, PLACEMENT_POINTS, ROUNDS_PER_SESSION } from '../config';
import type { Actor } from '../actors/Actor';

export interface RoundResult {
  round: number;
  placement: number;
  elims: number;
  points: number;
}

export interface Standing {
  name: string;
  isPlayer: boolean;
  points: number;
  elims: number;
  wins: number;
  results: RoundResult[];
}

export function placementPoints(placement: number): number {
  return PLACEMENT_POINTS[placement] ?? 0;
}

/**
 * Tournament-style scoring across a session of Zone Wars rounds:
 * placement points (see PLACEMENT_POINTS) + ELIM_POINTS per elimination.
 */
export class Tournament {
  readonly totalRounds = ROUNDS_PER_SESSION;
  round = 0;
  /** True once the current round's results have been banked. */
  roundRecorded = false;
  private readonly standings = new Map<Actor, Standing>();

  reset(actors: readonly Actor[]): void {
    this.round = 0;
    this.standings.clear();
    for (const a of actors) {
      this.standings.set(a, { name: a.name, isPlayer: a.isPlayer, points: 0, elims: 0, wins: 0, results: [] });
    }
  }

  get finished(): boolean {
    return this.round >= this.totalRounds;
  }

  /** Records every actor's placement/elims for the round that just ended. */
  record(actors: readonly Actor[]): RoundResult[] {
    const out: RoundResult[] = [];
    this.roundRecorded = true;
    for (const a of actors) {
      const s = this.standings.get(a);
      if (!s) continue;
      const points = placementPoints(a.placement) + a.elims * ELIM_POINTS;
      const result = { round: this.round, placement: a.placement, elims: a.elims, points };
      s.results.push(result);
      s.points += points;
      s.elims += a.elims;
      if (a.placement === 1) s.wins++;
      out.push(result);
    }
    return out;
  }

  /** Live points for the current round (shown on the HUD before the round ends). */
  liveRoundPoints(a: Actor): number {
    return (a.placement ? placementPoints(a.placement) : 0) + a.elims * ELIM_POINTS;
  }

  standingOf(a: Actor): Standing | undefined {
    return this.standings.get(a);
  }

  /** Sorted leaderboard: points, then wins, then elims. */
  leaderboard(): Standing[] {
    return [...this.standings.values()].sort(
      (a, b) => b.points - a.points || b.wins - a.wins || b.elims - a.elims,
    );
  }

  rankOf(a: Actor): number {
    const s = this.standings.get(a);
    return s ? this.leaderboard().indexOf(s) + 1 : 0;
  }
}
