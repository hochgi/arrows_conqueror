import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  DEFAULT_MATCH_CONFIG,
  type ArrowId,
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
import type { ByokRunStats, MatchLog, SeatDriverLog } from './matchLog';
import {
  appendMoves,
  createMatchLog,
  downloadMatchLog,
  saveMatchLog,
  withByokStats,
  withWinner,
} from './matchLog';
import { playLlmBotTurn } from './byokBot';
import { isByokReady } from './byokConfig';
import { clearTargetLocks } from './targets';
import {
  aiSeatIds,
  byokConfigForSeat,
  firstHumanSeat,
  hasAiSeat,
  hasByokSeat,
  loadSeatPlan,
  saveSeatPlan,
  seatPlanReady,
  seatPlayerId,
  summarizeDrivers,
  type SeatConfig,
  type SeatPlan,
} from './seatPlan';
import { playBotTurn } from './opponent';
import {
  burstLifetimeMs,
  createEvaporationBurst,
  pruneBursts,
  type EvaporationBurst,
} from './fx/evaporation';
import { PortionSlider } from './PortionSlider';
import { pathForDestination } from './reach';
import { spawnerInfoAt } from './spawnerInfo';
import { SpawnerTip } from './SpawnerTip';
import type { Viewport } from './viewport';
import { ZOOM, centerOn, createViewport, panBy, resize, zoomAt } from './viewport';

const geometry = makeTiling();
const layout = makeLayout();
const rules = makeRules(geometry);

/** Layout-space centroid of an arrow tile — same space as `viewport.cx/cy`. */
const arrowCentroid = (arrow: ArrowId): { x: number; y: number } => {
  const poly = layout.polygon(arrow);
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length === 0 ? 1 : poly.length;
  return { x: sx / n, y: sy / n };
};

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
  const [seatPlan, setSeatPlan] = useState<SeatPlan>(() => loadSeatPlan());
  const [state, setState] = useState<GameState | undefined>(undefined);
  const [log, setLog] = useState<MatchLog | undefined>(undefined);
  const [mode] = useState<InputMode>(() => createInputMode(geometry));
  const [snap, setSnap] = useState<InputSnapshot>(idleSnap);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport(800, 600));
  const [hover, setHover] = useState<
    { readonly vertex: import('@arrows/contracts').VertexId; readonly x: number; readonly y: number } | undefined
  >(undefined);
  /** Reach destination under the cursor — drives the pulsed path preview. */
  const [hoverPath, setHoverPath] = useState<ReadonlySet<ArrowId> | undefined>(undefined);
  const [botBusy, setBotBusy] = useState(false);
  const [byokStatus, setByokStatus] = useState<string | undefined>(undefined);
  const [evaporation, setEvaporation] = useState<readonly EvaporationBurst[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /** Active pointers for pinch-zoom (phone has no wheel). */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<
    { dist: number; midX: number; midY: number; moved: boolean } | null
  >(null);
  const shellRef = useRef<HTMLDivElement>(null);
  /** Non-human seats for the live match. */
  const aiSeatsRef = useRef<ReadonlySet<string>>(new Set());
  const seatConfigsRef = useRef<ReadonlyMap<string, SeatConfig>>(new Map());
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
      const w = Math.max(320, width);
      const h = Math.max(240, height);
      setViewport((v) => {
        // Phone stage is short — start a bit zoomed out so homes fit.
        const scale =
          h < 520 && v.scale === ZOOM.default ? Math.min(v.scale, 34) : v.scale;
        return { ...resize(v, w, h), scale };
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [state]);

  const record = useCallback(
    (
      moves: readonly Move[],
      nextState: GameState,
      byokDelta?: ByokRunStats,
      byokSeat?: PlayerId,
    ): void => {
      if (moves.length === 0) return;
      setLog((prev) => {
        if (prev === undefined) return prev;
        let updated = withWinner(appendMoves(prev, moves), nextState.winner);
        if (byokDelta !== undefined) updated = withByokStats(updated, byokDelta, byokSeat);
        saveMatchLog(updated);
        return updated;
      });
    },
    [],
  );

  /** Apply + log outside React updater functions (Strict Mode double-invokes those). */
  const commitApplied = useCallback(
    (
      moves: readonly Move[],
      next: GameState,
      byokDelta?: ByokRunStats,
      byokSeat?: PlayerId,
    ): void => {
      const before = stateRef.current;
      if (before !== undefined) {
        const burst = createEvaporationBurst(before, next, moves);
        if (burst !== undefined) {
          setEvaporation((prev) => pruneBursts([...prev, burst]));
        }
      }
      stateRef.current = next;
      record(moves, next, byokDelta, byokSeat);
      setState(next);
      setSnap(mode.reset());
    },
    [mode, record],
  );

  // Drop finished evaporation bursts so the overlay list stays short.
  useEffect(() => {
    if (evaporation.length === 0) return;
    const latest = evaporation[evaporation.length - 1]!;
    const wait = burstLifetimeMs(latest) + 30;
    const handle = window.setTimeout(() => {
      setEvaporation((prev) => pruneBursts(prev));
    }, wait);
    return () => {
      window.clearTimeout(handle);
    };
  }, [evaporation]);

  const softLockKey = useRef<string | null>(null);
  useEffect(() => {
    if (state === undefined) return;
    if (state.winner !== undefined) {
      softLockKey.current = null;
      return;
    }
    if (snap.phase.kind === 'portion') return;
    if (aiSeatsRef.current.has(String(state.activePlayer))) {
      // AI owns exhaustion via playBotTurn / chooseMove — avoid racing auto-pass.
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

  // Any AI seat: heuristic or BYOK when it is their chair.
  useEffect(() => {
    if (state === undefined || log === undefined) return;
    const active = state.activePlayer;
    const seatKey = String(active);
    if (state.winner !== undefined || !aiSeatsRef.current.has(seatKey)) {
      setBotBusy(false);
      return;
    }
    const seatConfig = seatConfigsRef.current.get(seatKey);
    if (seatConfig === undefined || seatConfig.kind === 'human') {
      setBotBusy(false);
      return;
    }
    setBotBusy(true);
    const epoch = ++botEpoch.current;
    const run = async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 30);
      });
      if (epoch !== botEpoch.current) return;
      if (stateRef.current !== state) return;
      if (seatConfig.kind === 'byok') {
        const config = byokConfigForSeat(seatConfig);
        const turn = await playLlmBotTurn(geometry, rules, state, active, config);
        if (epoch !== botEpoch.current) return;
        if (turn.moves.length === 0) {
          setBotBusy(false);
          return;
        }
        if (turn.llmFallbacks > 0 && turn.lastError !== undefined) {
          setByokStatus(
            `${seatKey} LLM fallback ×${String(turn.llmFallbacks)} (hits ${String(turn.llmHits)}): ${turn.lastError}`,
          );
        } else if (turn.llmHits > 0) {
          setByokStatus(`${seatKey} LLM ok · ${String(turn.llmHits)} picks this turn`);
        }
        commitApplied(
          turn.moves,
          turn.state,
          {
            llmHits: turn.llmHits,
            llmFallbacks: turn.llmFallbacks,
            lastError: turn.lastError,
          },
          active,
        );
        setBotBusy(false);
        return;
      }
      const { state: next, moves } = playBotTurn(geometry, rules, state, active);
      if (epoch !== botEpoch.current) return;
      if (moves.length === 0) {
        setBotBusy(false);
        return;
      }
      commitApplied(moves, next);
      setBotBusy(false);
    };
    void run();
    return () => {
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
    if (aiSeatsRef.current.has(String(state.activePlayer))) {
      return set;
    }
    for (const m of rules.legalMoves(state)) {
      if (m.kind === 'step') set.add(m.from);
    }
    return set;
  }, [state]);

  const boardHighlights = useMemo(() => {
    // Portion / confirm owns the path via the slider. Otherwise hover a blue tile
    // to pulse the route that would be walked.
    if (snap.phase.kind === 'portion' && snap.highlights.path !== undefined) {
      return snap.highlights;
    }
    if (hoverPath !== undefined && hoverPath.size > 0) {
      return { ...snap.highlights, path: hoverPath };
    }
    return snap.highlights;
  }, [snap, hoverPath]);

  const commitSnap = useCallback(
    (next: InputSnapshot) => {
      setSnap(next);
      if (next.pending === undefined) return;
      const s = stateRef.current;
      if (s === undefined) return;
      const { state: applied, applied: moves } = applyMoves(s, next.pending);
      commitApplied(moves, applied);

      // Auto-pick the next stack that can still step — after a trip *or* a skip.
      if (applied.winner !== undefined) return;
      if (aiSeatsRef.current.has(String(applied.activePlayer))) return;
      if (!hasLegalStep(rules, applied)) return;
      if (!moves.some((m) => m.kind === 'step' || m.kind === 'skip')) return;

      let lastFrom: ArrowId | undefined;
      for (const m of moves) {
        if (m.kind === 'step' || m.kind === 'skip') lastFrom = m.from;
      }
      const froms: ArrowId[] = [];
      const seen = new Set<string>();
      for (const m of rules.legalMoves(applied)) {
        if (m.kind !== 'step') continue;
        const key = String(m.from);
        if (seen.has(key)) continue;
        seen.add(key);
        froms.push(m.from);
      }
      froms.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
      const pick =
        froms.find((arrow) => arrow !== lastFrom) ?? froms[0];
      if (pick === undefined) return;
      setSnap(mode.onArrowClick(pick, applied, rules));
      // Skip / exhaust already picked the next stack — don't make the player hunt it.
      const focus = arrowCentroid(pick);
      setViewport((v) => centerOn(v, focus.x, focus.y));
    },
    [commitApplied, mode],
  );

  const previewPortion = useCallback(
    (n: number) => {
      setSnap(mode.previewPortion(n));
    },
    [mode],
  );

  const returnToLobby = (): void => {
    setState(undefined);
    stateRef.current = undefined;
    setLog(undefined);
    aiSeatsRef.current = new Set();
    seatConfigsRef.current = new Map();
    setBotBusy(false);
    setByokStatus(undefined);
    setEvaporation([]);
    clearTargetLocks();
    setSnap(mode.reset());
    softLockKey.current = null;
  };

  const startMatch = (plan: SeatPlan): void => {
    if (!seatPlanReady(plan)) return;
    const config: MatchConfig = {
      ...DEFAULT_MATCH_CONFIG,
      playerCount: plan.playerCount,
    };
    const opening = makeMatch(config);
    const configs = new Map<string, SeatConfig>();
    const aiKeys = new Set<string>();
    const seatLogs: SeatDriverLog[] = [];
    for (let i = 0; i < plan.seats.length; i += 1) {
      const seat = plan.seats[i];
      const player = opening.players[i] ?? seatPlayerId(i);
      if (seat === undefined) continue;
      configs.set(String(player), seat);
      if (seat.kind !== 'human') aiKeys.add(String(player));
      seatLogs.push({
        player,
        kind: seat.kind,
        ...(seat.kind === 'byok' ? { model: seat.byok.model.trim() } : {}),
      });
    }
    aiSeatsRef.current = aiKeys;
    seatConfigsRef.current = configs;
    clearTargetLocks();
    const human = firstHumanSeat(plan) ?? opening.players[0];
    if (human === undefined) return;
    const bots = aiSeatIds(plan);
    const botMode = summarizeDrivers(plan);
    const nextLog = createMatchLog({
      config,
      vsBot: hasAiSeat(plan),
      botMode,
      seats: seatLogs,
      humanSeat: human,
      botSeat: bots[0],
    });
    saveMatchLog(nextLog);
    setLog(nextLog);
    setByokStatus(hasByokSeat(plan) ? 'BYOK seat(s) armed' : undefined);
    stateRef.current = opening;
    setState(opening);
    setSnap(mode.reset());
    softLockKey.current = null;
  };

  if (state === undefined || log === undefined) {
    return (
      <Lobby
        plan={seatPlan}
        onPlan={(next) => {
          setSeatPlan(next);
          saveSeatPlan(next);
        }}
        onStart={() => {
          startMatch(seatPlan);
        }}
      />
    );
  }

  const activeIsAi = aiSeatsRef.current.has(String(state.activePlayer));
  const activeSeat = seatConfigsRef.current.get(String(state.activePlayer));
  const byokActive = activeSeat?.kind === 'byok' && isByokReady(byokConfigForSeat(activeSeat));

  const inputLocked = botBusy || activeIsAi || state.winner !== undefined;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    if (snap.phase.kind === 'portion') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointers.current.set(e.pointerId, { x, y });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a !== undefined && b !== undefined) {
        pinch.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          moved: false,
        };
      }
      drag.current = null;
      return;
    }
    // Pan/zoom stay live during LLM waits — only arrow clicks / HUD actions are locked.
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x, y });
    }

    if (pointers.current.size >= 2 && pinch.current !== null) {
      const pts = [...pointers.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a === undefined || b === undefined) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const prev = pinch.current;
      if (prev.dist > 4 && dist > 4) {
        const factor = dist / prev.dist;
        if (Math.abs(factor - 1) > 0.001 || Math.hypot(midX - prev.midX, midY - prev.midY) > 1) {
          pinch.current = { dist, midX, midY, moved: true };
          setHover(undefined);
          setHoverPath(undefined);
          setViewport((v) => {
            const zoomed = zoomAt(v, prev.midX, prev.midY, factor);
            return panBy(zoomed, midX - prev.midX, midY - prev.midY);
          });
        }
      } else {
        pinch.current = { dist, midX, midY, moved: prev.moved };
      }
      return;
    }

    if (drag.current === null) {
      const vertex = hitSpawnerVertex(layout, viewport, x, y, spawnerVertices, 16);
      setHover(vertex === undefined ? undefined : { vertex, x, y });

      const reach = snap.highlights.reach;
      if (
        reach !== undefined &&
        snap.phase.kind !== 'portion' &&
        snap.phase.kind !== 'idle' &&
        snap.phase.kind !== 'blocked'
      ) {
        const over = hitArrow(layout, viewport, x, y, arrows);
        if (over !== undefined && reach.has(over) && over !== snap.highlights.selected) {
          setHoverPath(pathForDestination(reach, over));
        } else {
          setHoverPath(undefined);
        }
      } else if (hoverPath !== undefined) {
        setHoverPath(undefined);
      }
      return;
    }
    setHover(undefined);
    setHoverPath(undefined);
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
    if (!drag.current.moved) return;
    setViewport((v) => panBy(v, dx, dy));
    drag.current = { x: e.clientX, y: e.clientY, moved: true };
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>): void => {
    pointers.current.delete(e.pointerId);
    const pinched = pinch.current?.moved === true;
    if (pointers.current.size < 2) pinch.current = null;

    const wasDrag = drag.current?.moved === true;
    const hadPointer = drag.current !== null;
    drag.current = null;
    if (pinched || !hadPointer || wasDrag || inputLocked) return;
    if (snap.phase.kind === 'portion') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const arrow = hitArrow(layout, viewport, sx, sy, arrows);
    if (arrow === undefined) {
      setHoverPath(undefined);
      commitSnap(mode.onBackgroundClick());
      return;
    }
    // Drop capture so the portion dialog owns the next events (and the ghost
    // tap from this finger-up cannot bounce back into the board).
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointers.current.clear();
    commitSnap(mode.onArrowClick(arrow, state, rules));
  };

  const onPointerLeave = (): void => {
    drag.current = null;
    pointers.current.clear();
    pinch.current = null;
    setHover(undefined);
    setHoverPath(undefined);
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
        phase={snap.phase}
        movableCount={movable.size}
        vsBot={log.vsBot}
        byokActive={byokActive}
        byokStatus={byokStatus ?? log.byokStats?.lastError}
        botBusy={botBusy}
        seatSummary={log.seats.map((s) => `${String(s.player)}=${s.kind}`).join(' · ')}
        moveCount={log.moves.length}
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
          highlights={boardHighlights}
          movable={movable}
          evaporation={evaporation}
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
