import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import { DEFAULT_MATCH_CONFIG, type GameState } from '@arrows/contracts';
import { makeLayout, makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import { hasLegalStep, passIfExhausted } from './autoEndTurn';
import { Board } from './Board';
import { cullArrows, cullVertices } from './cull';
import { hitArrow, hitSpawnerVertex } from './hit';
import { Hud } from './Hud';
import type { InputMode, InputSnapshot } from './input/modes';
import { createInputMode } from './input/modes';
import { Lobby } from './Lobby';
import { PortionSlider } from './PortionSlider';
import { spawnerInfoAt } from './spawnerInfo';
import { SpawnerTip } from './SpawnerTip';
import type { Viewport } from './viewport';
import { createViewport, panBy, resize, zoomAt } from './viewport';

const geometry = makeTiling();
const layout = makeLayout();
const rules = makeRules(geometry);

const beginMatch = (playerCount: number): GameState =>
  makeMatch({ ...DEFAULT_MATCH_CONFIG, playerCount });

/**
 * Apply a whole trip, one step at a time.
 *
 * A reach destination several steps away is several `step` moves — the engine has one
 * move kind and this adapter does not get to invent a compound one, which is also what
 * keeps a replay honest (P10). If a step is refused the trip stops there and the heads
 * stay where they got to: the reach preview was computed by simulating this same engine,
 * so that should not happen, and swallowing it silently would hide it if it did.
 */
const applyPending = (state: GameState, snap: InputSnapshot): GameState => {
  if (snap.pending === undefined || state.winner !== undefined) return state;
  let at = state;
  for (const move of snap.pending) {
    if (at.winner !== undefined) break;
    try {
      at = rules.apply(at, move);
    } catch {
      break;
    }
  }
  return passIfExhausted(rules, at);
};

const idleSnap = (): InputSnapshot => ({
  phase: { kind: 'idle' },
  highlights: { targets: new Set() },
});

/** The hover read-out, or nothing when the vertex turns out to carry no spawner. */
const SpawnerTipFor = ({
  state,
  hover,
  viewport,
}: {
  state: GameState;
  hover: { readonly vertex: import('@arrows/contracts').VertexId; readonly x: number; readonly y: number };
  viewport: Viewport;
}): ReactElement | null => {
  const info = spawnerInfoAt(geometry, state, hover.vertex);
  if (info === undefined) return null;
  return (
    <SpawnerTip
      info={info}
      x={hover.x}
      y={hover.y}
      stageWidth={viewport.width}
      stageHeight={viewport.height}
    />
  );
};

export const App = (): ReactElement => {
  const [playerCount, setPlayerCount] = useState(DEFAULT_MATCH_CONFIG.playerCount);
  const [state, setState] = useState<GameState | undefined>(undefined);
  const [mode, setMode] = useState<InputMode>(() => createInputMode('galcon', geometry));
  const [snap, setSnap] = useState<InputSnapshot>(idleSnap);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport(800, 600));
  const [hover, setHover] = useState<
    { readonly vertex: import('@arrows/contracts').VertexId; readonly x: number; readonly y: number } | undefined
  >(undefined);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shellRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setViewport((v) => resize(v, Math.max(320, width), Math.max(240, height)));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [state]);

  const softLockKey = useRef<string | null>(null);
  useEffect(() => {
    if (state === undefined) return;
    if (state.winner !== undefined) {
      softLockKey.current = null;
      return;
    }
    if (snap.phase.kind === 'portion') return;
    if (hasLegalStep(rules, state)) {
      softLockKey.current = null;
      return;
    }
    const next = passIfExhausted(rules, state);
    if (Object.is(next, state)) return;
    if (!hasLegalStep(rules, next) && next.winner === undefined) {
      const key = `${String(next.activePlayer)}:${String(next.groups.size)}:${String(next.dominationStreak)}`;
      if (softLockKey.current === key) return;
      softLockKey.current = key;
    } else {
      softLockKey.current = null;
    }
    setState(next);
    setSnap(mode.reset());
  }, [state, snap.phase.kind, mode]);

  const arrows = useMemo(
    () => (state === undefined ? [] : cullArrows(geometry, viewport)),
    [state, viewport],
  );
  const vertices = useMemo(
    () =>
      state === undefined
        ? new Set<import('@arrows/contracts').VertexId>()
        : cullVertices(geometry, viewport),
    [state, viewport],
  );
  /**
   * Only the vertices that carry a spawner are hover candidates.
   *
   * Two reasons, and the second is a bug rather than a cost: the culled set runs to several
   * hundred vertices and this is re-scanned on every pointer move, and *nearest vertex*
   * over all of them would let a bare pinwheel centre a few pixels closer win the hover
   * from the spawner the cursor is plainly on.
   */
  const spawnerVertices = useMemo(() => {
    const set = new Set<import('@arrows/contracts').VertexId>();
    if (state === undefined) return set;
    for (const vertex of vertices) if (state.spawners.has(vertex)) set.add(vertex);
    return set;
  }, [state, vertices]);

  const movable = useMemo(() => {
    const set = new Set<import('@arrows/contracts').ArrowId>();
    if (state === undefined) return set;
    for (const m of rules.legalMoves(state)) {
      if (m.kind === 'step') set.add(m.from);
    }
    return set;
  }, [state]);

  const commitSnap = useCallback(
    (next: InputSnapshot) => {
      setSnap(next);
      if (next.pending !== undefined) {
        setState((s) => (s === undefined ? s : applyPending(s, next)));
        setSnap(mode.reset());
      }
    },
    [mode],
  );

  const switchMode = (id: string): void => {
    const next = createInputMode(id, geometry);
    setMode(next);
    setSnap(next.reset());
  };

  const returnToLobby = (): void => {
    setState(undefined);
    setSnap(mode.reset());
    softLockKey.current = null;
  };

  if (state === undefined) {
    return (
      <Lobby
        playerCount={playerCount}
        onPlayerCount={setPlayerCount}
        onStart={() => {
          setState(beginMatch(playerCount));
          setSnap(mode.reset());
        }}
      />
    );
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    if (snap.phase.kind === 'portion') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) {
      // Hover the spawner read-out. Proximity in screen space, not a polygon hit: a vertex
      // is not a tile (§7), so it has no polygon to be inside.
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const vertex = hitSpawnerVertex(layout, viewport, sx, sy, spawnerVertices, 16);
      setHover(vertex === undefined ? undefined : { vertex, x: sx, y: sy });
      return;
    }
    setHover(undefined);
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
    if (!drag.current.moved) return;
    setViewport((v) => panBy(v, dx, dy));
    drag.current = { x: e.clientX, y: e.clientY, moved: true };
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>): void => {
    const wasDrag = drag.current?.moved === true;
    const hadPointer = drag.current !== null;
    drag.current = null;
    if (!hadPointer || wasDrag || state.winner !== undefined) return;
    if (snap.phase.kind === 'portion') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const arrow = hitArrow(layout, viewport, sx, sy, arrows);
    if (arrow === undefined) {
      commitSnap(mode.onBackgroundClick());
      return;
    }
    commitSnap(mode.onArrowClick(arrow, state, rules));
  };

  const onPointerLeave = (): void => {
    drag.current = null;
    setHover(undefined);
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setViewport((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
  };

  return (
    <div className="app">
      <Hud
        state={state}
        mode={mode}
        phase={snap.phase}
        movableCount={movable.size}
        onModeChange={switchMode}
        onEndTurn={() => {
          commitSnap(mode.requestEndTurn());
        }}
        onSkip={() => {
          commitSnap(mode.requestSkip(state, rules));
        }}
        onNewMatch={returnToLobby}
      />
      <div className="stage" ref={shellRef}>
        <Board
          geometry={geometry}
          layout={layout}
          state={state}
          viewport={viewport}
          arrows={arrows}
          vertices={vertices}
          highlights={snap.highlights}
          movable={movable}
          {...(hover === undefined ? {} : { hoveredSpawner: hover.vertex })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
        />
        {hover !== undefined && snap.phase.kind !== 'portion' ? (
          <SpawnerTipFor state={state} hover={hover} viewport={viewport} />
        ) : null}
        {snap.phase.kind === 'portion' ? (
          <PortionSlider
            allowed={snap.phase.allowed}
            steps={snap.phase.steps}
            onConfirm={(n) => {
              commitSnap(mode.choosePortion(n));
            }}
            onCancel={() => {
              commitSnap(mode.reset());
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
