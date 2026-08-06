import type { ArrowId, GameState, GeometryPort, PlayerId, VertexId } from '@arrows/contracts';
import type { Point2, TilingLayout } from '@arrows/geometry-tiling';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  BOARD_BG,
  EMPTY_FILL,
  EMPTY_STROKE,
  HIGHLIGHT_STROKE,
  PREVIEW_STROKE,
  styleFor,
} from './colors';
import type { InputHighlights } from './input/modes';
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
  readonly onPointerDown: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
  readonly onWheel: (e: WheelEvent<SVGSVGElement>) => void;
}

const polyPoints = (viewport: Viewport, poly: readonly Point2[]): string =>
  poly
    .map((p) => {
      const s = toScreen(viewport, p.x, p.y);
      return `${String(s.x)},${String(s.y)}`;
    })
    .join(' ');

const fillFor = (
  arrow: ArrowId,
  state: GameState,
): { fill: string; stroke: string } => {
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
const shareOwner = (geometry: GeometryPort, state: GameState, vertex: VertexId): PlayerId | undefined => {
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

export const Board = ({
  geometry,
  layout,
  state,
  viewport,
  arrows,
  vertices,
  highlights,
  onPointerDown,
  onPointerMove,
  onPointerUp,
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
    onPointerLeave={onPointerUp}
    onWheel={onWheel}
  >
    {arrows.map((arrow) => {
      const poly = layout.polygon(arrow);
      const { fill, stroke } = fillFor(arrow, state);
      const isSelected = highlights.selected === arrow;
      const isTarget = highlights.targets.has(arrow);
      const isPreview = highlights.preview === arrow;
      const strokeWidth = isSelected || isPreview ? 2.5 : isTarget ? 2 : 0.8;
      const strokeColor = isSelected
        ? HIGHLIGHT_STROKE
        : isPreview || isTarget
          ? PREVIEW_STROKE
          : stroke;
      const c = centroidScreen(viewport, poly);
      const group = state.groups.get(arrow);
      return (
        <g key={String(arrow)}>
          <polygon
            points={polyPoints(viewport, poly)}
            fill={fill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            data-arrow={String(arrow)}
          />
          {group !== undefined ? (
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.max(10, viewport.scale * 0.35)}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={600}
              fill="#1a1a1a"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {group.heads}
            </text>
          ) : null}
        </g>
      );
    })}
    {[...vertices].map((vertex) => {
      if (!state.spawners.has(vertex)) return null;
      const pos = layout.vertexPosition(vertex);
      const s = toScreen(viewport, pos.x, pos.y);
      const owner = shareOwner(geometry, state, vertex);
      const color = owner !== undefined ? styleFor(owner).fill : '#6b5c45';
      return (
        <circle
          key={String(vertex)}
          cx={s.x}
          cy={s.y}
          r={Math.max(3, viewport.scale * 0.12)}
          fill={color}
          stroke="#2a2418"
          strokeWidth={1}
          opacity={0.85}
        />
      );
    })}
  </svg>
);
