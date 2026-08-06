/**
 * Everything a player needs to know about one spawner, read off the state.
 *
 * Split out of the renderer because the board can no longer afford to *show* this. A
 * gauge per spawner was legible at three spawners and a field of noise at a hundred; the
 * board keeps the one thing worth seeing at a glance — who holds how much, and roughly
 * how loaded it is — and everything else moves to hover.
 *
 * Pure and derived, so it cannot disagree with the engine: every rule below is read from
 * `accrueRound`, not restated from the prose.
 */

import type { ArrowId, GameState, GeometryPort, PlayerId, Rational, VertexId } from '@arrows/contracts';

/** Why a share is not accruing this round, when it is not. */
export type ShareStatus =
  /** Nobody holds the arrow as territory. §7 pays only owned ground — this earns nothing. */
  | 'unclaimed'
  /** Owned, but an enemy head stands on it: the round-robin advances and *f* is lost (§7). */
  | 'blockaded'
  /** Owned and clear. Accruing. */
  | 'earning';

export interface ShareInfo {
  readonly arrow: ArrowId;
  readonly owner?: PlayerId;
  readonly status: ShareStatus;
  /** Progress toward the next head, in `[0, 1)`. */
  readonly loaded: number;
  readonly banked: Rational;
  /** True when this share is the one the next full round feeds (§7 round-robin). */
  readonly next: boolean;
}

export interface SpawnerInfo {
  readonly vertex: VertexId;
  readonly force: Rational;
  /** Full rounds for the whole spawner to produce one head, all three shares held: `1/f`. */
  readonly roundsPerHead: number;
  /** Full rounds for one *particular* share to fill: `3/f`, since the round-robin thirds it. */
  readonly roundsPerShare: number;
  /** Border arrows in the round-robin order the engine uses (sorted by id). */
  readonly shares: readonly ShareInfo[];
  /** Thirds held, descending, then by player id — ownership is fractional (§7). */
  readonly held: readonly { readonly player: PlayerId; readonly thirds: number }[];
  /** Fraction of the spawner's output actually reaching someone right now. */
  readonly yielding: number;
}

const ZERO: Rational = { num: 0, den: 1 };

export const spawnerInfoAt = (
  geometry: GeometryPort,
  state: GameState,
  vertex: VertexId,
): SpawnerInfo | undefined => {
  const spawner = state.spawners.get(vertex);
  if (spawner === undefined) return undefined;

  const borders = [...geometry.borderArrows(vertex)].toSorted((l, r) =>
    String(l) < String(r) ? -1 : 1,
  );
  const phase = ((spawner.phase % borders.length) + borders.length) % borders.length;

  const shares: ShareInfo[] = borders.map((arrow, k) => {
    const owner = state.territory.get(arrow);
    const standing = state.groups.get(arrow);
    const banked = state.accumulators.get(arrow) ?? ZERO;
    const status: ShareStatus =
      owner === undefined
        ? 'unclaimed'
        : standing !== undefined && standing.owner !== owner
          ? 'blockaded'
          : 'earning';
    return {
      arrow,
      ...(owner === undefined ? {} : { owner }),
      status,
      loaded: Math.max(0, Math.min(1, banked.num / banked.den)),
      banked,
      next: k === phase,
    };
  });

  const thirds = new Map<string, { player: PlayerId; thirds: number }>();
  for (const share of shares) {
    if (share.owner === undefined) continue;
    const key = String(share.owner);
    const seat = thirds.get(key) ?? { player: share.owner, thirds: 0 };
    seat.thirds += 1;
    thirds.set(key, seat);
  }

  return {
    vertex,
    force: spawner.force,
    // Total output is *f* per full round (§7), so the spawner pays a head every `1/f`
    // rounds — but the round-robin gives each share only a third of the ticks, so any one
    // arrow takes three times as long to fill. Both numbers are worth showing: the first
    // is what the spawner is worth, the second is how long a raid has to hold.
    roundsPerHead: spawner.force.den / spawner.force.num,
    roundsPerShare: (3 * spawner.force.den) / spawner.force.num,
    shares,
    held: [...thirds.values()].toSorted(
      (l, r) => r.thirds - l.thirds || (String(l.player) < String(r.player) ? -1 : 1),
    ),
    yielding: shares.filter((s) => s.status === 'earning').length / shares.length,
  };
};

/**
 * How bright to draw a spawner on the board.
 *
 * An untouched spawner on neutral ground is *background*: there are around a hundred of
 * them and a bright mark on each turns the board into a field of targets. It lifts as soon
 * as it is worth looking at — held by somebody, or carrying a share part-way to a head.
 *
 * The floor is not much of a fade on purpose. Spawners are the objective, so *where they
 * are* has to survive the damping even when *what they are doing* is nothing; a first pass
 * at 0.4 against a 0.13-alpha track multiplied out to invisible, which reads as an empty
 * board rather than a quiet one.
 */
export const spawnerProminence = (info: SpawnerInfo): number =>
  info.held.length > 0 || info.shares.some((s) => s.loaded > 0) ? 1 : 0.72;
