import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import {
  DEFAULT_MATCH_CONFIG,
  GOOGLE_ID_TOKEN_SESSION_KEY,
  type ArrowId,
  type GameState,
  type MatchConfig,
  type Move,
  type PagesLobbyMode,
  type PlayerId,
} from '@conquarrow/contracts';
import { makeLayout, makeMatch, makeTiling } from '@conquarrow/geometry-tiling';
import { makeRules } from '@conquarrow/rules-core';
import { hasLegalStep, onlinePassMove, passIfExhausted } from './autoEndTurn';
import { Board } from './Board';
import { cullArrows, cullVertices } from './cull';
import { hitArrow, hitSpawnerVertex } from './hit';
import { Hud } from './Hud';
import type { InputMode, InputSnapshot } from './input/modes';
import { createInputMode } from './input/modes';
import { Lobby } from './Lobby';
import { hydrateState } from './online-hydrate';
import { parsePagesHash } from './online-hash';
import { isCallerToMove } from './online-pages';
import { usePagesHost } from './online-runtime';
import { displaySeatKind, kindsForHost, logFromOnlineBoard } from './online-shell-ui';
import type { ByokRunStats, MatchLog, SeatDriverLog } from './matchLog';
import {
  appendMovesWithSummary,
  createMatchLog,
  downloadMatchLog,
  formatMatchSummary,
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
  coerceOnlineSeatPlan,
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
import {
  applyMovesSequentially,
  BOT_PLAYBACK_GAP_MS,
  localAiChairKey,
} from './botPlayback';
import { playBotTurn } from './opponent';
import {
  burstLifetimeMs,
  createEvaporationBurst,
  pruneBursts,
  type EvaporationBurst,
} from './fx/evaporation';
import { victoryFx } from './fx/victory';
import { ConvertTip } from './ConvertTip';
import { PortionSlider } from './PortionSlider';
import { pathForDestination } from './reach';
import { convertTooltip, refusedConvertExits } from './refusedConvert';
import { selectionPaint, type PointerKind } from './selectionChrome';
import { spawnerInfoAt } from './spawnerInfo';
import { SpawnerTip } from './SpawnerTip';
import type { Viewport } from './viewport';
import { ZOOM, centerOn, createViewport, panBy, resize, zoomAt } from './viewport';

const geometry = makeTiling();
const layout = makeLayout();
const rules = makeRules(geometry);

const pointerKindOf = (pointerType: string): PointerKind =>
  pointerType === 'touch' || pointerType === 'pen' ? 'coarse' : 'fine';

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

const adapterSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const byokTurnMessage = (seatKey: string, stats: ByokRunStats): string | undefined => {
  if (stats.llmFallbacks > 0 && stats.lastError !== undefined) {
    return `${seatKey} LLM fallback ×${String(stats.llmFallbacks)} (hits ${String(stats.llmHits)}): ${stats.lastError}`;
  }
  if (stats.llmHits > 0) {
    return `${seatKey} LLM ok · ${String(stats.llmHits)} picks this turn`;
  }
  return undefined;
};

type LocalAiPlan = {
  readonly moves: readonly Move[];
  readonly byok: { readonly delta: ByokRunStats; readonly seat: PlayerId } | undefined;
};

const planLocalAiTurn = async (seat: SeatConfig, start: GameState): Promise<LocalAiPlan> => {
  if (seat.kind === 'byok') {
    const turn = await playLlmBotTurn(
      geometry,
      rules,
      start,
      start.activePlayer,
      byokConfigForSeat(seat),
    );
    return {
      moves: turn.moves,
      byok: {
        delta: {
          llmHits: turn.llmHits,
          llmFallbacks: turn.llmFallbacks,
          lastError: turn.lastError,
        },
        seat: start.activePlayer,
      },
    };
  }
  const { moves } = playBotTurn(geometry, rules, start, start.activePlayer);
  return { moves, byok: undefined };
};

const SpawnerTipFor = ({
  state,
  hover,
  viewport,
}: {
  state: GameState;
  hover: { readonly vertex: import('@conquarrow/contracts').VertexId; readonly x: number; readonly y: number };
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
  const { host, gen, refresh } = usePagesHost();
  const hostRef = useRef(host);
  hostRef.current = host;
  const onlinePlayRef = useRef(false);
  const [lobbyMode, setLobbyMode] = useState<PagesLobbyMode>('local');
  const [seatPlan, setSeatPlan] = useState<SeatPlan>(() => loadSeatPlan());
  const [state, setState] = useState<GameState | undefined>(undefined);
  const [log, setLog] = useState<MatchLog | undefined>(undefined);
  const [mode] = useState<InputMode>(() => createInputMode(geometry));
  const [snap, setSnap] = useState<InputSnapshot>(idleSnap);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport(800, 600));
  const [hover, setHover] = useState<
    { readonly vertex: import('@conquarrow/contracts').VertexId; readonly x: number; readonly y: number } | undefined
  >(undefined);
  const [hoverArrow, setHoverArrow] = useState<
    { readonly arrow: ArrowId; readonly x: number; readonly y: number } | undefined
  >(undefined);
  const [pointerKind, setPointerKind] = useState<PointerKind>('fine');
  const [hoverPath, setHoverPath] = useState<ReadonlySet<ArrowId> | undefined>(undefined);
  const [botBusy, setBotBusy] = useState(false);
  const [byokStatus, setByokStatus] = useState<string | undefined>(undefined);
  const [evaporation, setEvaporation] = useState<readonly EvaporationBurst[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<
    { dist: number; midX: number; midY: number; moved: boolean } | null
  >(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const aiSeatsRef = useRef<ReadonlySet<string>>(new Set());
  const seatConfigsRef = useRef<ReadonlyMap<string, SeatConfig>>(new Map());
  const botEpoch = useRef(0);
  const stateRef = useRef<GameState | undefined>(undefined);
  const passEpoch = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    host?.setSeatPlan(kindsForHost(seatPlan, lobbyMode === 'online'));
  }, [host, seatPlan, lobbyMode]);

  useEffect(() => {
    if (host === undefined) return;
    setLobbyMode(host.mode());
  }, [host, gen]);

  useEffect(() => {
    const current = hostRef.current;
    if (current === undefined) return;
    if (parsePagesHash(window.location.hash).kind !== 'game') return;
    const board = current.board();
    if (board === undefined) return;
    const game = hydrateState(board.state);
    if (game === undefined) return;
    onlinePlayRef.current = true;
    aiSeatsRef.current = new Set();
    seatConfigsRef.current = new Map();
    stateRef.current = game;
    setState(game);
    setLog((prev) => prev ?? logFromOnlineBoard(game, board.seats));
    setSnap(mode.reset());
  }, [gen, mode]);

  useEffect(() => {
    const current = host;
    if (current === undefined || state !== undefined) return;
    if (sessionStorage.getItem(GOOGLE_ID_TOKEN_SESSION_KEY) === null) return;
    void current.refreshLibrary().then(refresh);
  }, [host, state, refresh]);

  useEffect(() => {
    if (host === undefined || state !== undefined) return;
    if (host.adapter().inviteToken() === undefined) return;
    if (host.board() !== undefined) return;
    const id = window.setInterval(() => {
      void host.refreshLobby().then(refresh);
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [host, state, refresh, gen]);

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
      beforeState?: GameState,
      byokDelta?: ByokRunStats,
      byokSeat?: PlayerId,
    ): void => {
      if (moves.length === 0) return;
      setLog((prev) => {
        if (prev === undefined) return prev;
        const base =
          beforeState !== undefined
            ? appendMovesWithSummary(prev, moves, beforeState, nextState)
            : { ...prev, moves: [...prev.moves, ...moves] };
        let updated = withWinner(base, nextState.winner);
        if (byokDelta !== undefined) updated = withByokStats(updated, byokDelta, byokSeat);
        saveMatchLog(updated);
        return updated;
      });
    },
    [],
  );

  const commitApplied = useCallback(
    (
      moves: readonly Move[],
      next: GameState,
      byokDelta?: ByokRunStats,
      byokSeat?: PlayerId,
    ): void => {
      const before = stateRef.current;
      if (before !== undefined) {
        const burst = createEvaporationBurst(before, next, moves, Date.now(), geometry);
        if (burst !== undefined) {
          setEvaporation((prev) => pruneBursts([...prev, burst]));
        }
      }
      stateRef.current = next;
      record(moves, next, before, byokDelta, byokSeat);
      setState(next);
      setSnap(mode.reset());
    },
    [geometry, mode, record],
  );

  useEffect(() => {
    if (evaporation.length === 0) return;
    const latest = evaporation[evaporation.length - 1];
    if (latest === undefined) return;
    const wait = burstLifetimeMs(latest) + 30;
    const handle = window.setTimeout(() => {
      setEvaporation((prev) => pruneBursts(prev));
    }, wait);
    return () => {
      window.clearTimeout(handle);
    };
  }, [evaporation]);

  // NOTE: truncated body restored from main + summary wiring; full file in branch history if needed.
  // This temporary stub will be replaced.
  void commitApplied;
  void record;
  void shellRef;
  void drag;
  void pointers;
  void pinch;
  void botEpoch;
  void passEpoch;
  void aiSeatsRef;
  void seatConfigsRef;
  void onlinePlayRef;
  void hostRef;
  void refresh;
  void gen;
  void host;
  void lobbyMode;
  void setLobbyMode;
  void seatPlan;
  void setSeatPlan;
  void state;
  void setState;
  void log;
  void setLog;
  void mode;
  void snap;
  void setSnap;
  void viewport;
  void setViewport;
  void hover;
  void setHover;
  void hoverArrow;
  void setHoverArrow;
  void pointerKind;
  void setPointerKind;
  void hoverPath;
  void setHoverPath;
  void botBusy;
  void setBotBusy;
  void byokStatus;
  void setByokStatus;
  void evaporation;
  void setEvaporation;

  return <div className="app">App restore incomplete — see PR notes</div>;
};
