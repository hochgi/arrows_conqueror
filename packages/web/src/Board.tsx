import type { ArrowId, GameState, GeometryPort, PlayerId, VertexId } from '@arrows/contracts';
import type { Point2, TilingLayout } from '@arrows/geometry-tiling';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  BOARD_BG,
  COUNT_HALO,
  EMPTY_FILL,
  EMPTY_STROKE,
  HIGHLIGHT_STROKE,
  MOVABLE_STROKE,
  PATH_STROKE,
  PATH_WASH,
  PREVIEW_STROKE,
  REACH_FILL,
  REACH_INK,
  SPAWNER_CURSOR,
  SPAWNER_HUB_IDLE,
  SPAWNER_IDLE,
  SPAWNER_RIM,
  SPAWNER_TRACK,
  SPAWNER_TRACK_RIM,
  styleFor,
} from './colors';
import type { InputHighlights } from './input/modes';
import { reachOpacity } from './reach';
import { spawnerInfoAt, spawnerProminence, yieldSoonByArrow } from './spawnerInfo';
import type { YieldSoon } from './spawnerInfo';
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
  /** The spawner under the cursor, if any — ringed here, detailed in `SpawnerTip`. */
  readonly hoveredSpawner?: VertexId;
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

// ── the spawner mark ──────────────────────────────────────────────────────────

const GAP_DEG = 22;

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
 * A spawner as three short arcs — one per bordering arrow, tinted by whoever holds it and
 * filled by that share's accumulator — around a hub showing who holds the majority.
 */
const SpawnerMark = ({
  geometry,
  state,
  vertex,
  cx,
  cy,
  r,
  hovered,
}: {
  geometry: GeometryPort;
  state: GameState;
  vertex: VertexId;
  cx: number;
  cy: number;
  r: number;
  hovered: boolean;
}): ReactElement => {
  const info = spawnerInfoAt(geometry, state, vertex);
  const owner = shareOwner(geometry, state, vertex);
  const hub = owner !== undefined ? styleFor(owner).fill : SPAWNER_HUB_IDLE;
  const shares = info?.shares ?? [];
  const width = Math.max(1.4, r * 0.3);

  return (
    <g style={{ pointerEvents: 'none' }} opacity={hovered ? 1 : (info ? spawnerProminence(info) : 0.4)}>
      {hovered ? (
        <circle cx={cx} cy={cy} r={r * 1.7} fill="none" stroke={SPAWNER_CURSOR} strokeWidth={1.2} />
      ) : null}
      {shares.map((share, k) => {
        const from = k * 120 + GAP_DEG / 2;
        const to = (k + 1) * 120 - GAP_DEG / 2;
        const tint = share.owner === undefined ? SPAWNER_IDLE : styleFor(share.owner).fill;
        const d = arcPath(cx, cy, r, from, to);
        return (
          <g key={String(share.arrow)}>
            {/* Rim first so the track does not melt into tile fill. */}
            <path
              d={d}
              fill="none"
              stroke={SPAWNER_TRACK_RIM}
              strokeWidth={width + 1.6}
              strokeLinecap="butt"
            />
            <path
              d={d}
              fill="none"
              stroke={share.owner === undefined ? SPAWNER_TRACK : tint}
              strokeOpacity={share.owner === undefined ? 1 : 0.34}
              strokeWidth={width}
              strokeLinecap="butt"
            />
            {share.loaded > 0.001 ? (
              <path
                d={arcPath(cx, cy, r, from, from + (to - from) * share.loaded)}
                fill="none"
                stroke={tint}
                strokeWidth={width}
                strokeLinecap="butt"
              />
            ) : null}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.4} fill={hub} stroke={SPAWNER_RIM} strokeWidth={0.9} />
    </g>
  );
};

/** Diagonal shine clipped to the tile — full strength next accrual, half the one after. */
const YieldShine = ({
  clipId,
  points,
  soon,
  bounds,
}: {
  clipId: string;
  points: string;
  soon: YieldSoon;
  bounds: { x: number; y: number; w: number; h: number };
}): ReactElement => {
  const pad = Math.max(bounds.w, bounds.h) * 0.85;
  return (
    <g style={{ pointerEvents: 'none' }} opacity={soon === 1 ? 1 : 0.5}>
      <clipPath id={clipId}>
        <polygon points={points} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect
          className="yield-shine-band"
          x={bounds.x - pad}
          y={bounds.y - pad}
          width={bounds.w + pad * 2}
          height={bounds.h + pad * 2}
          fill="url(#yieldShineGrad)"
        />
      </g>
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
  hoveredSpawner,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
}: BoardProps): ReactElement => {
  const yieldSoon = yieldSoonByArrow(geometry, state);
  const path = highlights.path;

  return (
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
      <defs>
        <linearGradient id="yieldShineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {arrows.map((arrow) => {
        const poly = layout.polygon(arrow);
        const points = polyPoints(viewport, poly);
        const base = fillFor(arrow, state);
        const isSelected = highlights.selected === arrow;
        const isPreview = highlights.preview === arrow;
        const onPath = path?.has(arrow) === true;
        const entry = highlights.reach?.get(arrow);
        const isMovable = movable.has(arrow) && !isSelected;
        const c = centroidScreen(viewport, poly);
        const group = state.groups.get(arrow);
        const soon = yieldSoon.get(arrow);
        const ownerStroke = group !== undefined ? styleFor(group.owner).stroke : base.stroke;
        let strokeWidth = 0.7;
        if (group !== undefined) strokeWidth = 2.55;
        else if (isSelected || isPreview || onPath) strokeWidth = 2.6;
        else if (entry !== undefined || isMovable) strokeWidth = 1.8;
        const strokeColor = isSelected
          ? HIGHLIGHT_STROKE
          : isPreview || onPath
            ? onPath
              ? PATH_STROKE
              : PREVIEW_STROKE
            : entry !== undefined
              ? REACH_FILL
              : isMovable
                ? MOVABLE_STROKE
                : group !== undefined
                  ? ownerStroke
                  : base.stroke;
        const glyph = Math.max(9, viewport.scale * 0.34);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of poly) {
          const s = toScreen(viewport, p.x, p.y);
          minX = Math.min(minX, s.x);
          minY = Math.min(minY, s.y);
          maxX = Math.max(maxX, s.x);
          maxY = Math.max(maxY, s.y);
        }
        return (
          <g key={String(arrow)}>
            <polygon
              points={points}
              fill={base.fill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              data-arrow={String(arrow)}
            />
            {entry !== undefined && !isSelected ? (
              <polygon
                points={points}
                fill={onPath ? PATH_WASH : REACH_FILL}
                fillOpacity={onPath ? 0.85 : isPreview ? 0.7 : reachOpacity(entry.distance)}
                style={{ pointerEvents: 'none' }}
              />
            ) : onPath ? (
              <polygon
                points={points}
                fill={PATH_WASH}
                fillOpacity={0.75}
                style={{ pointerEvents: 'none' }}
              />
            ) : null}
            {soon !== undefined ? (
              <YieldShine
                clipId={`yield-clip-${String(arrow)}`}
                points={points}
                soon={soon}
                bounds={{ x: minX, y: minY, w: maxX - minX, h: maxY - minY }}
              />
            ) : null}
            {group !== undefined ? (
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={glyph}
                fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                fontWeight={700}
                fill={styleFor(group.owner).ink}
                stroke={COUNT_HALO}
                strokeWidth={glyph * 0.28}
                paintOrder="stroke fill"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {group.heads}
              </text>
            ) : entry !== undefined && entry.minCount > 1 ? (
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
          <SpawnerMark
            key={String(vertex)}
            geometry={geometry}
            state={state}
            vertex={vertex}
            cx={s.x}
            cy={s.y}
            r={Math.max(4, viewport.scale * 0.15)}
            hovered={hoveredSpawner === vertex}
          />
        );
      })}
    </svg>
  );
};
