import type { GameState, PlayerId } from '@arrows/contracts';
import type { ReactElement } from 'react';
import { styleFor } from './colors';
import type { InputMode, InputPhase } from './input/modes';
import { INPUT_MODE_OPTIONS } from './input/modes';

export interface HudProps {
  readonly state: GameState;
  readonly mode: InputMode;
  readonly phase: InputPhase;
  readonly movableCount: number;
  readonly onModeChange: (id: string) => void;
  readonly onEndTurn: () => void;
  readonly onSkip: () => void;
  readonly onNewMatch: () => void;
}

const phaseHint = (phase: InputPhase, modeLabel: string, movableCount: number): string => {
  switch (phase.kind) {
    case 'idle':
      if (movableCount === 0) {
        return 'No steps left — passing…';
      }
      return `${modeLabel}: click a gold-outlined stack`;
    case 'source':
      return 'Click a blue destination';
    case 'blocked':
      return 'Branch toll — this stack cannot leave. Click another gold stack';
    case 'preview':
      return 'Click the destination again to confirm';
    case 'portion':
      return 'Choose how many heads to send';
  }
};

export const Hud = ({
  state,
  mode,
  phase,
  movableCount,
  onModeChange,
  onEndTurn,
  onSkip,
  onNewMatch,
}: HudProps): ReactElement => {
  const active = styleFor(state.activePlayer);
  const winner: PlayerId | undefined = state.winner;
  return (
    <aside className="hud">
      <h1>Arrows Conqueror</h1>
      {winner !== undefined ? (
        <p className="banner win">{styleFor(winner).label} wins</p>
      ) : (
        <p className="banner" style={{ borderColor: active.fill }}>
          Turn: <strong style={{ color: active.fill }}>{active.label}</strong>
          {state.dominationHolder !== undefined
            ? ` · domination ${String(state.dominationStreak)}/${String(state.dominationN)}`
            : null}
        </p>
      )}
      <p className="hint">{phaseHint(phase, mode.label, movableCount)}</p>

      <div className="actions">
        <button
          type="button"
          onClick={onSkip}
          disabled={phase.kind === 'idle'}
        >
          Skip group
        </button>
        <button type="button" onClick={onEndTurn} disabled={winner !== undefined}>
          End turn
        </button>
        <button type="button" onClick={onNewMatch}>
          Lobby
        </button>
      </div>

      <label className="mode">
        Input
        <select
          value={mode.id}
          onChange={(e) => {
            onModeChange(e.target.value);
          }}
        >
          {INPUT_MODE_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <p className="help">
        Drag to pan · wheel to zoom · gold = can move · blue = destination · turn
        passes automatically when nothing can step · End turn ends early
      </p>
    </aside>
  );
};
