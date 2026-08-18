/**
 * Fixtures for the gameplay-event layer.
 *
 * States are hand-authored rather than reached by playing, because the point of
 * each test is one *transition* — a closure, a cut, a conversion — and a
 * hand-authored pair names exactly the change under test with nothing else moving.
 * Where a test needs the real board's adjacency (the spatial staggering), it uses
 * `makeTiling()`; where it only needs a diff, it does not.
 */

import type {
  ArrowId,
  GameState,
  Group,
  PlayerId,
  Rational,
  VertexId,
} from '@conquarrow/contracts';
import { makeTiling } from '@conquarrow/geometry-tiling';

export const A = 'A' as PlayerId;
export const B = 'B' as PlayerId;
export const C = 'C' as PlayerId;

export const arrow = (id: string): ArrowId => id as ArrowId;

export const geometry = makeTiling();

/** A real tiling arrow, so undirected adjacency is the board's own. */
export const tile = (q: number, r: number, slot: number): ArrowId =>
  `tiling:a:${String(q)},${String(r)},${String(slot)}` as ArrowId;

export interface StateSpec {
  readonly activePlayer?: PlayerId;
  readonly players?: readonly PlayerId[];
  readonly groups?: readonly (readonly [ArrowId, PlayerId, number])[];
  readonly trails?: readonly (readonly [PlayerId, readonly ArrowId[]])[];
  readonly territory?: readonly (readonly [ArrowId, PlayerId])[];
  readonly winner?: PlayerId;
}

export const state = (spec: StateSpec = {}): GameState => {
  const groups = new Map<ArrowId, Group>();
  for (const [id, owner, heads] of spec.groups ?? []) {
    groups.set(id, { owner, heads, spent: 0 });
  }
  const trails = new Map<PlayerId, ReadonlySet<ArrowId>>();
  for (const [player, arrows] of spec.trails ?? []) trails.set(player, new Set(arrows));
  const territory = new Map<ArrowId, PlayerId>(spec.territory ?? []);
  return {
    players: spec.players ?? [A, B, C],
    activePlayer: spec.activePlayer ?? A,
    groups,
    trails,
    territory,
    accumulators: new Map<ArrowId, Rational>(),
    spawners: new Map<VertexId, never>(),
    dominationStreak: 0,
    dominationHolder: undefined,
    dominationN: 5,
    winner: spec.winner,
  } satisfies GameState;
};

/** Every event of one kind, so a test can assert on the shape not the position. */
export const pick = <K extends string, E extends { readonly kind: string }>(
  events: readonly E[],
  kind: K,
): readonly Extract<E, { kind: K }>[] =>
  events.filter((e): e is Extract<E, { kind: K }> => e.kind === kind);

export const kinds = (events: readonly { readonly kind: string }[]): readonly string[] =>
  events.map((e) => e.kind);
