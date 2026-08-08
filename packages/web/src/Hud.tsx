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
  readonly vsBot: boolean;
  readonly botBusy: boolean;
  readonly moveCount: number;
  readonly onModeChange: (id: string) => void;
  readonly onEndTurn: () => void;
  readonly onSkip: () => void;
  readonly onDownloadLog: () => void;
  readonly onNewMatch: () => void;
}

const phaseHint = (
  phase: InputPhase,
  modeLabel: string,
  movableCount: number,
  botBusy: boolean,
  vsBot: boolean,
): string => {
  if (botBusy) return 'Bot is moving…';
  switch (phase.kind) {
    case 'idle':
      if (movableCount === 0) {
        return 'No steps left — passing…';
      }
      return vsBot
        ? `${modeLabel}: your turn — gold-outlined stacks can still move`
        : `${modeLabel}: gold-outlined stacks can still move`;
    case 'source':
      return 'Hover blue to pulse the path · click to send · fainter = further';
    case 'blocked':
      return 'Branch toll — this stack cannot leave. Another gold stack is auto-selected when one finishes';
    case 'preview':
      return 'Pulsing path = the route taken · click again to confirm, or an intermediate for another path';
    case 'portion':
      return 'Pulsing path = the route for this portion · change the slider or cancel and re-click';
  }
};

export const Hud = ({
  state,
  mode,
  phase,
  movableCount,
  vsBot,
  botBusy,
  moveCount,
  onModeChange,
  onEndTurn,
  onSkip,
  onDownloadLog,
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
          {vsBot ? (botBusy ? ' · bot' : ' · you') : null}
          {state.dominationHolder !== undefined
            ? ` · starvation ${String(state.dominationStreak)}/${String(state.dominationN)} (${styleFor(state.dominationHolder).label})`
            : null}
        </p>
      )}
      <p className="hint">{phaseHint(phase, mode.label, movableCount, botBusy, vsBot)}</p>
      <p className="meta">Moves logged: {moveCount}</p>

      <div className="actions">
        <button type="button" onClick={onSkip} disabled={phase.kind === 'idle' || botBusy}>
          Skip group
        </button>
        <button type="button" onClick={onEndTurn} disabled={winner !== undefined || botBusy}>
          End turn
        </button>
        <button type="button" onClick={onDownloadLog}>
          Download log
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
        Drag to pan · pinch or wheel to zoom · gold outline = movable this turn
        (auto-selects and pans to the next after you finish or skip one) · blue =
        reachable · red = branch toll · amber = singleton merge onto own trail ·
        fade with distance · hover a reach tile to pulse the path · bold tile edge =
        occupied · trail chords stay visible under enemy stacks (overlap is legal until
        a cut) · solid fill = territory, thin fill = open trail · turn passes when
        nothing can step
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
          The bot spends its allowance (never idles with a legal step), steers tips
          home by grain-distance, and biases cuts / tempo pairs — still not a real AI
          packet. Download the match log when done.
        </p>
      ) : null}
    </aside>
  );
};
