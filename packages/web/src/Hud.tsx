import type { GameState, PlayerId } from '@arrows/contracts';
import type { ReactElement } from 'react';
import { styleFor } from './colors';
import type { InputMode, InputPhase } from './input/modes';
import { INPUT_MODE_OPTIONS } from './input/modes';

export interface HudProps {
  readonly state: GameState;
  readonly mode: InputMode;
  readonly phase: InputPhase;
  readonly onModeChange: (id: string) => void;
  readonly onEndTurn: () => void;
  readonly onSkip: () => void;
  readonly onPortion: (count: number) => void;
  readonly onNewMatch: () => void;
}

const phaseHint = (phase: InputPhase, modeLabel: string): string => {
  switch (phase.kind) {
    case 'idle':
      return `${modeLabel}: click one of your stacks`;
    case 'source':
      return 'Click a highlighted destination';
    case 'preview':
      return 'Click the destination again to confirm';
    case 'portion':
      return `Send how many heads? (1–${String(phase.max)})`;
  }
};

export const Hud = ({
  state,
  mode,
  phase,
  onModeChange,
  onEndTurn,
  onSkip,
  onPortion,
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
      <p className="hint">{phaseHint(phase, mode.label)}</p>

      {phase.kind === 'portion' ? (
        <div className="portion">
          {Array.from({ length: phase.max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                onPortion(n);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      <div className="actions">
        <button type="button" onClick={onSkip} disabled={phase.kind === 'idle'}>
          Skip group
        </button>
        <button type="button" onClick={onEndTurn} disabled={winner !== undefined}>
          End turn
        </button>
        <button type="button" onClick={onNewMatch}>
          New match
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
        Drag to pan · wheel to zoom · trail is half-opacity, territory is solid
      </p>
    </aside>
  );
};
