/**
 * Opaque, branded identities for the three things on a board.
 *
 * SPEC §2. Decision D1 of the P01 packet: ids are opaque, never lattice
 * coordinates. Geometry is pluggable (ADR 0001) and hand-authored fixture
 * boards have no coordinates to expose — a structured id would leak the
 * generator's representation through the port and make P02 impossible.
 *
 * There is deliberately no `UnitId`. A stack is the count of heads standing on
 * an arrow (SPEC §5), not an entity, so there is nothing to identify — and
 * therefore no question about which unit survives attrition, carries the
 * movement bank, or becomes a converted stack.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

/** One tile; a node in the movement graph; an oriented lattice edge. */
export type ArrowId = Brand<string, 'ArrowId'>;

/** A movement junction, 3 arrows in and 3 out; a lattice vertex. */
export type PointId = Brand<string, 'PointId'>;

/** A pinwheel centre bordered by 3 arrows. Holds specials. Never occupied. */
export type VertexId = Brand<string, 'VertexId'>;

export type PlayerId = Brand<string, 'PlayerId'>;

/**
 * One of the six arrow positions around a point, in cyclic order.
 *
 * Which of the six are in-slots is deliberately not encoded. SPEC §11 item 1 —
 * alternating versus three-consecutive — is the last unmeasured geometric fact,
 * and the chord test must be correct under either.
 */
export type Slot = 0 | 1 | 2 | 3 | 4 | 5;

export const SLOTS: readonly Slot[] = [0, 1, 2, 3, 4, 5];

/**
 * Mint identities.
 *
 * These exist for **geometry implementations** to construct their own boards.
 * The rules core must never call them: it receives ids from the port and passes
 * them back, and an id it invented would not resolve against any board.
 */
export const mintArrowId = (raw: string): ArrowId => raw as ArrowId;
export const mintPointId = (raw: string): PointId => raw as PointId;
export const mintVertexId = (raw: string): VertexId => raw as VertexId;
export const mintPlayerId = (raw: string): PlayerId => raw as PlayerId;
