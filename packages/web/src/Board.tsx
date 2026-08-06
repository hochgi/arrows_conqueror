import type { ArrowId, GameState, GeometryPort, PlayerId, VertexId } from '@arrows/contracts';
import type { Point2, TilingLayout } from '@arrows/geometry-tiling';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  BOARD_BG,
  EMPTY_FILL,
  EMPTY_STROKE,
  HIGHLIGHT_STROKE,
  MOVABLE_STROKE,
  PREVIEW_STROKE,
  REACH_FILL,
  REACH_INK,
  SPAWNER_CURSOR,
  SPAWNER_HUB_IDLE,
  SPAWNER_IDLE,
  SPAWNER_RIM,
  SPAWNER_TRACK,
  styleFor,
} from './colors';
import type { InputHighlights } from './input/modes';
import { reachOpacity } from './reach';
import type { Viewport } from './viewport';
import { toScreen } from './viewport';

export interface BoardProps {
  readonly geometry: GeometryPort;
  readonly layout: TilingLayout;
  readonly state: GameState;
  readonly viewport: Viewport;
  readonly arrows: readonly ArrowId[];
  readonly vertices: ReadonlySet<VertexId>;
  readonly highlights: InputHighlights;
  /** Stacks of the active player that still have a legal step. */
  readonly movable: ReadonlySet<ArrowId>;
  readonly onPointerDown: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerLeave: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onWheel: (e: WheelEvent<SVGSVGElement>) => void;
}

const polyPoints = (viewport: Viewport, poly: readonly Point2[]): string =>
  poly
    .map((p) => {
      const s = toScreen(viewport, p.x, p.y);
      return `${String(s.x)},${String(s.y)}`;
    })
    .join(' ');

const fillFor = (arrow: ArrowId, state: GameState): { fill: string; stroke: string } => {
  const territoryOwner = state.territory.get(arrow);
  if (territoryOwner !== undefined) {
    const s = styleFor(territoryOwner);
    return { fill: s.fill, stroke: s.stroke };
  }
  for (const [player, trail] of state.trails) {
    if (trail.has(arrow)) {
      const s = styleFor(player);
      return { fill: s.trailFill, stroke: s.stroke };
    }
  }
  return { fill: EMPTY_FILL, stroke: EMPTY_STROKE };
};

const centroidScreen = (viewport: Viewport, poly: readonly Point2[]): { x: number; y: number } => {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length || 1;
  return toScreen(viewport, sx / n, sy / n);
};

/** Majority of three bordering territory shares; otherwise neutral. */
const shareOwner = (
  geometry: GeometryPort,
  state: GameState,
  vertex: VertexId,
): PlayerId | undefined => {
  const counts = new Map<PlayerId, number>();
  for (const arrow of geometry.borderArrows(vertex)) {
    const owner = state.territory.get(arrow);
    if (owner === undefined) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let best: PlayerId | undefined;
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return bestN >= 2 ? best : undefined;
};

// ── the spawner gauge ─────────────────────────────────────────────────────────

const GAP_DEG = 14;

const arcPath = (
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string => {
  const rad = (d: number): number => ((d - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(fromDeg));
  const y0 = cy + r * Math.sin(rad(fromDeg));
  const x1 = cx + r * Math.cos(rad(toDeg));
  const y1 = cy + r * Math.sin(rad(toDeg));
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${String(x0)} ${String(y0)} A ${String(r)} ${String(r)} 0 ${String(large)} 1 ${String(x1)} ${String(y1)}`;
};

/**
 * A spawner as three arcs: one per bordering arrow, filled by that share's
 * accumulator, tinted by whoever holds the arrow.
 *
 * Three rather than one because §7 owns a special **in thirds** — each of the three
 * bordering arrows carries one share, with its own accumulator that carries its own
 * remainder and resets alone on capture. A single gauge would have to average that, and
 * averaging is exactly the thing a player must not be shown: shaving one arrow off a
 * rival cuts their income by a third, and the board should make that legible.
 *
 * The arcs are ordered by arrow id, which is what `Spawner.phase` indexes, so the gold
 * cursor really does point at the share that accrues next.
 */
const SpawnerGauge = ({
  geometry,
  state,
  vertex,
  cx,
  cy,
  r,
}: {
  geometry: GeometryPort;
  state: GameState;
  vertex: VertexId;
  cx: number;
  cy: number;
  r: number;
}): ReactElement => {
  const spawner = state.spawners.get(vertex);
  const shares = [...geometry.borderArrows(vertex)].toSorted((l, r2) =>
    String(l) < String(r2) ? -1 : 1,
  );
  const owner = shareOwner(geometry, state, vertex);
  const hub = owner !== undefined ? styleFor(owner).fill : SPAWNER_HUB_IDLE;
  const next = spawner === undefined ? -1 : spawner.phase % shares.length;
  // An untouched spawner on neutral ground is *background*: there are hundreds of them
  // and a bright ring on each turns the board into a field of targets. It brightens as
  // soon as it is worth looking at — owned, or carrying a share part-way to a head.
  const live =
    owner !== undefined ||
    shares.some((a) => state.territory.get(a) !== undefined) ||
    shares.some((a) => {
      const acc = state.accumulators.get(a);
      return acc !== undefined && acc.num > 0;
    });

  return (
    <g style={{ pointerEvents: 'none' }} opacity={live ? 1 : 0.5}>
      {shares.map((arrow, k) => {
        const from = k * 120 + GAP_DEG / 2;
        const to = (k + 1) * 120 - GAP_DEG / 2;
        const acc = state.accumulators.get(arrow);
        const loaded =
          acc === undefined ? 0 : Math.max(0, Math.min(1, acc.num / acc.den));
        const held = state.territory.get(arrow);
        const tint = held !== undefined ? styleFor(held).fill : SPAWNER_IDLE;
        return (
          <g key={String(arrow)}>
            <path
              d={arcPath(cx, cy, r, from, to)}
              fill="none"
              stroke={SPAWNER_TRACK}
              strokeWidth={Math.max(1.5, r * 0.34)}
              strokeLinecap="butt"
            />
            {loaded > 0.001 ? (
              <path
                d={arcPath(cx, cy, r, from, from + (to - from) * loaded)}
                fill="none"
                stroke={tint}
                strokeWidth={Math.max(1.5, r * 0.34)}
                strokeLinecap="butt"
              />
            ) : null}
            {k === next && live ? (
              // Which share accrues next turn (§7's round-robin). Only worth drawing on a
              // spawner someone is actually contesting.
              <circle
                cx={cx + r * 1.42 * Math.cos((((from + to) / 2 - 90) * Math.PI) / 180)}
                cy={cy + r * 1.42 * Math.sin((((from + to) / 2 - 90) * Math.PI) / 180)}
                r={Math.max(1, r * 0.16)}
                fill={SPAWNER_CURSOR}
              />
            ) : null}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.44} fill={hub} stroke={SPAWNER_RIM} strokeWidth={1} />
    </g>
  );
};

// ── the board ─────────────────────────────────────────────────────────────────

export const Board = ({
  geometry,
  layout,
  state,
  viewport,
  arrows,
  vertices,
  highlights,
  movable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
}: BoardProps): ReactElement => (
  <svg
    className="board"
    width={viewport.width}
    height={viewport.height}
    style={{ background: BOARD_BG, touchAction: 'none', cursor: 'grab' }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerLeave={onPointerLeave}
    onWheel={onWheel}
  >
    {arrows.map((arrow) => {
      const poly = layout.polygon(arrow);
      const base = fillFor(arrow, state);
      const isSelected = highlights.selected === arrow;
      const isPreview = highlights.preview === arrow;
      const entry = highlights.reach?.get(arrow);
      const isMovable = movable.has(arrow) && !isSelected;
      const c = centroidScreen(viewport, poly);
      const group = state.groups.get(arrow);
      const strokeWidth = isSelected || isPreview ? 2.6 : entry !== undefined || isMovable ? 1.8 : 0.7;
      const strokeColor = isSelected
        ? HIGHLIGHT_STROKE
        : isPreview
          ? PREVIEW_STROKE
          : entry !== undefined
            ? REACH_FILL
            : isMovable
              ? MOVABLE_STROKE
              : base.stroke;
      const glyph = Math.max(9, viewport.scale * 0.34);
      return (
        <g key={String(arrow)}>
          <polygon
            points={polyPoints(viewport, poly)}
            fill={base.fill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            data-arrow={String(arrow)}
          />
          {/*
            Reach is a wash *over* the ground rather than a replacement for it, so a
            player can still see whose land they are about to cross. The fade is the
            price: §3 buys one step with one head and four steps with eight, so a pale
            arrow is one you can only take by committing most of the stack.
          */}
          {entry !== undefined && !isSelected ? (
            <polygon
              points={polyPoints(viewport, poly)}
              fill={REACH_FILL}
              fillOpacity={isPreview ? 0.7 : reachOpacity(entry.distance)}
              style={{ pointerEvents: 'none' }}
            />
          ) : null}
          {group !== undefined ? (
            /*
              A token disc rather than a bare numeral. The count has to read over any
              ground — its owner's territory, an enemy's, bare lattice, or a reach wash —
              and the disc is also the only place the *stack's* colour appears when it is
              standing on someone else's land.
            */
            <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <circle
                cx={c.x}
                cy={c.y}
                r={glyph * 0.74}
                fill={styleFor(group.owner).fill}
                stroke={styleFor(group.owner).stroke}
                strokeWidth={1.2}
              />
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={glyph}
                fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                fontWeight={650}
                fill={styleFor(group.owner).ink}
              >
                {group.heads}
              </text>
            </g>
          ) : entry !== undefined && entry.minCount > 1 ? (
            // The toll for arriving here. Reading "8" on a far arrow is how §3's
            // speed curve stops being a formula in a document.
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={glyph * 0.78}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={600}
              fill={REACH_INK}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {entry.minCount}
            </text>
          ) : null}
        </g>
      );
    })}
    {[...vertices].map((vertex) => {
      if (!state.spawners.has(vertex)) return null;
      const pos = layout.vertexPosition(vertex);
      const s = toScreen(viewport, pos.x, pos.y);
      return (
        <SpawnerGauge
          key={String(vertex)}
          geometry={geometry}
          state={state}
          vertex={vertex}
          cx={s.x}
          cy={s.y}
          r={Math.max(4.5, viewport.scale * 0.17)}
        />
      );
    })}
  </svg>
);
