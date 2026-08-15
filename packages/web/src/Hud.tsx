import type { GameState } from '@conquarrow/contracts';
import type { ReactElement } from 'react';
import { styleFor } from './colors';
import { controlsLocked, type VictoryFx } from './fx/victory';
import type { InputPhase } from './input/modes';
import { PORTION_PHASE_HINT, SOURCE_PHASE_HINT } from './selectionChrome';

export interface HudProps {
  readonly state: GameState;
  readonly victory: VictoryFx;
  readonly phase: InputPhase;
  readonly movableCount: number;
  readonly vsBot: boolean;
  readonly byokActive: boolean;
  readonly byokStatus: string | undefined;
  readonly botBusy: boolean;
  readonly seatSummary: string;
  readonly moveCount: number;
  readonly onEndTurn: () => void;
  readonly onSkip: () => void;
  readonly onDownloadLog: () => void;
  readonly onNewMatch: () => void;
  readonly illegal: string | undefined;
}

const phaseHint = (
  phase: InputPhase,
  movableCount: number,
  botBusy: boolean,
  vsBot: boolean,
  byokActive: boolean,
): string => {
  if (botBusy) return byokActive ? 'LLM seat is thinking…' : 'AI seat is moving…';
  switch (phase.kind) {
    case 'idle':
      if (movableCount === 0) {
        return 'No steps left — passing…';
      }
      return vsBot
        ? 'Your turn — gold-outlined stacks can still move'
        : 'Gold-outlined stacks can still move';
    case 'source':
      return SOURCE_PHASE_HINT;
    case 'blocked':
      return 'This stack has nowhere to go. Another gold stack is auto-selected when one finishes';
    case 'portion':
      return PORTION_PHASE_HINT;
  }
};

export const Hud = ({
  state,
  victory,
  phase,
  movableCount,
  vsBot,
  byokActive,
  byokStatus,
  botBusy,
  seatSummary,
  moveCount,
  onEndTurn,
  onSkip,
  onDownloadLog,
  onNewMatch,
  illegal,
}: HudProps): ReactElement => {
  const active = styleFor(state.activePlayer);
  const locked = controlsLocked(victory);
  return (
    <aside className="hud">
      <h1>Conquarrow</h1>
      {victory.kind === 'over' ? (
        <p className="banner win">{victory.banner}</p>
      ) : (
        <p className="banner" style={{ borderColor: active.fill }}>
          Turn: <strong style={{ color: active.fill }}>{active.label}</strong>
          {vsBot ? (botBusy ? (byokActive ? ' · llm' : ' · ai') : ' · you') : null}
          {state.dominationHolder !== undefined
            ? ` · starvation ${String(state.dominationStreak)}/${String(state.dominationN)} (${styleFor(state.dominationHolder).label})`
            : null}
        </p>
      )}
      <p className="hint">
        {victory.kind === 'over'
          ? victory.hint
          : phaseHint(phase, movableCount, botBusy, vsBot, byokActive)}
      </p>
      {byokStatus !== undefined ? <p className="hint byok-status">{byokStatus}</p> : null}
      {illegal !== undefined ? <p className="hint lobby-byok-warn">{illegal}</p> : null}
      <p className="meta">Seats: {seatSummary}</p>
      <p className="meta">Moves logged: {moveCount}</p>

      <div className="actions">
        <button type="button" onClick={onSkip} disabled={locked || phase.kind === 'idle' || botBusy}>
          Skip group
        </button>
        <button type="button" onClick={onEndTurn} disabled={locked || botBusy}>
          End turn
        </button>
        <button type="button" onClick={onDownloadLog}>
          Download log
        </button>
        <button type="button" onClick={onNewMatch}>
          Lobby
        </button>
      </div>

      <p className="help">
        Drag to pan · pinch or wheel to zoom · gold outline = movable this turn
        (auto-selects and pans to the next after you finish or skip one) · cream
        halo = selected · quiet cyan = reachable · hover or tap a dest for the
        cost · path-only while sending · refused (not-allowed) grain = would
        convert with no trail home · hover a reach tile to pulse the path · bold
        tile edge = occupied · trail chords stay visible under enemy stacks
        (overlap is legal until a cut) · solid fill = territory, thin fill = open
        trail · turn passes when nothing can step · pan stays live while an LLM
        seat thinks
      </p>
      <p className="help">
        Ringed dots are spawners — three arcs with a dark rim, one per bordering arrow.
        <strong> Hover for force, shares and holders.</strong> A share only pays as
        territory. Shine on a tile means that share births a head on the next full
        round (half-shine = the round after). The centre runs four times faster than
        the rim and is packed far denser.
      </p>
      {vsBot ? (
        <p className="help">
          Non-human seats auto-play. BYOK seats use your keys in this tab; illegal LLM
          replies fall back to the heuristic. Download the match log when done.
        </p>
      ) : null}
    </aside>
  );
};
