import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  DEFAULT_MATCH_CONFIG,
  type GameState,
  type MatchConfig,
  type Move,
  type PlayerId,
} from '@arrows/contracts';
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
import {
  appendMoves,
  createMatchLog,
  downloadMatchLog,
  saveMatchLog,
  withWinner,
  type MatchLog,
} from './matchLog';
import { playBotTurn } from './opponent';
import { PortionSlider } from './PortionSlider';
import { spawnerInfoAt } from './spawnerInfo';
import { SpawnerTip } from './SpawnerTip';
import type { Viewport } from './viewport';
import { createViewport, panBy, resize, zoomAt } from './viewport';

const geometry = makeTiling();
const layout = makeLayout();
const rules = makeRules(geometry);

/**
 * Apply a whole trip, one step at a time.
 *
 * A reach destination several steps away is several `step` moves — the engine has one
 * move kind and this adapter does not get to invent a compound one, which is also what
 * keeps a replay honest (P10). If a step is refused the trip stops there and the heads
 * stay where they got to: the reach preview was computed by simulating this same engine,
 * so that should not happen, and swallowing it silently would hide it if it did.
 */
const applyMoves = (
  state: GameState,
  moves: readonly Move[],
): { readonly state: GameState; readonly applied: readonly Move[] } => {
  let at = state;
  const applied: Move[] = [];
  for (const move of moves) {
    if (at.winner !== undefined) break;
    try {
      at = rules.apply(at, move);
      applied.push(move);
    } catch {
      break;
    }
  }
  const passed = passIfExhausted(rules, at);
  return { state: passed.state, applied: [...applied, ...passed.moves] };
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
  const [vsBot, setVsBot] = useState(true);
  const [state, setState] = useState<GameState | undefined>(undefined);
  const [log, setLog] = useState<MatchLog | undefined>(undefined);
  const [mode, setMode] = useState<InputMode>(() => createInputMode('galcon', geometry));
  const [snap, setSnap] = useState<InputSnapshot>(idleSnap);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport(800, 600));
  const [hover, setHover] = useState<
    { readonly vertex: import('@arrows/contracts').VertexId; readonly x: number; readonly y: number } | undefined
  >(undefined);
  const [botBusy, setBotBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const botSeatRef = useRef<PlayerId | undefined>(undefined);
  const botEpoch = useRef(0);
  const stateRef = useRef<GameState | undefined>(undefined);
  const passEpoch = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

  const record = useCallback((moves: readonly Move[], nextState: GameState): void => {
    if (moves.length === 0) return;
    setLog((prev) => {
      if (prev === undefined) return prev;
      const updated = withWinner(appendMoves(prev, moves), nextState.winner);
      saveMatchLog(updated);
      return updated;
    });
  }, []);

  /** Apply + log outside React updater functions (Strict Mode double-invokes those). */
  const commitApplied = useCallback(
    (moves: readonly Move[], next: GameState): void => {
      stateRef.current = next;
      record(moves, next);
      setState(next);
      setSnap(mode.reset());
    },
    [mode, record],
  );

  const softLockKey = useRef<string | null>(null);
  useEffect(() => {
    if (state === undefined) return;
    if (state.winner !== undefined) {
      softLockKey.current = null;
      return;
    }
    if (snap.phase.kind === 'portion') return;
    if (botSeatRef.current !== undefined && state.activePlayer === botSeatRef.current) {
      // Bot owns exhaustion via playBotTurn / chooseMove — avoid racing auto-pass.
      return;
    }
    if (hasLegalStep(rules, state)) {
      softLockKey.current = null;
      return;
    }
    const { state: next, moves } = passIfExhausted(rules, state);
    if (Object.is(next, state) || moves.length === 0) return;
    if (!hasLegalStep(rules, next) && next.winner === undefined) {
      const key = `${String(next.activePlayer)}:${String(next.groups.size)}:${String(next.dominationStreak)}`;
      if (softLockKey.current === key) return;
      softLockKey.current = key;
    } else {
      softLockKey.current = null;
    }
    const epoch = ++passEpoch.current;
    const handle = window.setTimeout(() => {
      if (epoch !== passEpoch.current) return;
      if (stateRef.current !== state) return;
      commitApplied(moves, next);
    }, 0);
    return () => {
      window.clearTimeout(handle);
      passEpoch.current += 1;
    };
  }, [state, snap.phase.kind, commitApplied]);

  // Bot seat: greedy turn when it is their chair.
  useEffect(() => {
    if (state === undefined || log === undefined) return;
    const bot = botSeatRef.current;
    if (bot === undefined) return;
    if (state.winner !== undefined || state.activePlayer !== bot) {
      setBotBusy(false);
      return;
    }
    setBotBusy(true);
    const epoch = ++botEpoch.current;
    const handle = window.setTimeout(() => {
      if (epoch !== botEpoch.current) return;
      if (stateRef.current !== state) return;
      const { state: next, moves } = playBotTurn(geometry, rules, state, bot);
      if (epoch !== botEpoch.current) return;
      if (moves.length === 0) {
        setBotBusy(false);
        return;
      }
      commitApplied(moves, next);
      setBotBusy(false);
    }, 30);
    return () => {
      window.clearTimeout(handle);
      botEpoch.current += 1;
    };
  }, [state, log, commitApplied]);

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
  const spawnerVertices = useMemo(() => {
    const set = new Set<import('@arrows/contracts').VertexId>();
    if (state === undefined) return set;
    for (const vertex of vertices) if (state.spawners.has(vertex)) set.add(vertex);
    return set;
  }, [state, vertices]);

  const movable = useMemo(() => {
    const set = new Set<import('@arrows/contracts').ArrowId>();
    if (state === undefined) return set;
    if (botSeatRef.current !== undefined && state.activePlayer === botSeatRef.current) {
      return set;
    }
    for (const m of rules.legalMoves(state)) {
      if (m.kind === 'step') set.add(m.from);
    }
    return set;
  }, [state]);

  const commitSnap = useCallback(
    (next: InputSnapshot) => {
      setSnap(next);
      if (next.pending === undefined) return;
      const s = stateRef.current;
      if (s === undefined) return;
      const { state: applied, applied: moves } = applyMoves(s, next.pending);
      commitApplied(moves, applied);
    },
    [commitApplied],
  );

  const previewPortion = useCallback(
    (n: number) => {
      setSnap(mode.previewPortion(n));
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
    stateRef.current = undefined;
    setLog(undefined);
    botSeatRef.current = undefined;
    setBotBusy(false);
    setSnap(mode.reset());
    softLockKey.current = null;
  };

  const startMatch = (count: number, againstBot: boolean): void => {
    const config: MatchConfig = {
      ...DEFAULT_MATCH_CONFIG,
      playerCount: againstBot ? 2 : count,
    };
    const opening = makeMatch(config);
    const human = opening.players[0];
    const bot = againstBot ? opening.players[1] : undefined;
    if (human === undefined) return;
    botSeatRef.current = bot;
    const nextLog = createMatchLog({
      config,
      vsBot: againstBot,
      humanSeat: human,
      botSeat: bot,
    });
    saveMatchLog(nextLog);
    setLog(nextLog);
    setVsBot(againstBot);
    setPlayerCount(config.playerCount);
    stateRef.current = opening;
    setState(opening);
    setSnap(mode.reset());
    softLockKey.current = null;
  };

  if (state === undefined || log === undefined) {
    return (
      <Lobby
        playerCount={playerCount}
        vsBot={vsBot}
        onPlayerCount={setPlayerCount}
        onVsBot={setVsBot}
        onStart={() => {
          startMatch(playerCount, vsBot);
        }}
      />
    );
  }

  const inputLocked =
    botBusy ||
    (botSeatRef.current !== undefined && state.activePlayer === botSeatRef.current) ||
    state.winner !== undefined;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    if (snap.phase.kind === 'portion' || inputLocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) {
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
    if (!hadPointer || wasDrag || inputLocked) return;
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
        vsBot={log.vsBot}
        botBusy={botBusy}
        moveCount={log.moves.length}
        onModeChange={switchMode}
        onEndTurn={() => {
          if (inputLocked) return;
          commitSnap(mode.requestEndTurn());
        }}
        onSkip={() => {
          if (inputLocked) return;
          commitSnap(mode.requestSkip(state, rules));
        }}
        onDownloadLog={() => {
          downloadMatchLog(withWinner(log, state.winner));
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
        {snap.phase.kind === 'portion' && !inputLocked ? (
          <PortionSlider
            allowed={snap.phase.allowed}
            steps={snap.phase.steps}
            onConfirm={(n) => {
              commitSnap(mode.choosePortion(n));
            }}
            onCancel={() => {
              commitSnap(mode.reset());
            }}
            onPreview={previewPortion}
          />
        ) : null}
      </div>
    </div>
  );
};
