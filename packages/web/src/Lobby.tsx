import type { ReactElement } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@arrows/contracts';

export interface LobbyProps {
  readonly playerCount: number;
  readonly vsBot: boolean;
  readonly onPlayerCount: (n: number) => void;
  readonly onVsBot: (v: boolean) => void;
  readonly onStart: () => void;
}

const PLACEMENT_BLURB: Record<number, string> = {
  2: 'Opposite corners of the home hexagon',
  3: 'Every alternating corner',
  4: 'Four corners — one opposite pair left free',
  5: 'Equal span around the ring (best effort)',
  6: 'All six corners',
  7: 'Equal span around the ring (best effort)',
  8: 'Equal span around the ring (best effort)',
};

export const Lobby = ({
  playerCount,
  vsBot,
  onPlayerCount,
  onVsBot,
  onStart,
}: LobbyProps): ReactElement => (
  <div className="lobby">
    <div className="lobby-card">
      <h1>Arrows Conqueror</h1>
      <p className="lobby-lead">Playtest match on the arrow tiling</p>

      <label className="lobby-check">
        <input
          type="checkbox"
          checked={vsBot}
          onChange={(e) => {
            onVsBot(e.target.checked);
          }}
        />
        Play against bot (seat B)
      </label>

      <label className="lobby-count">
        Players
        <select
          value={vsBot ? 2 : playerCount}
          disabled={vsBot}
          onChange={(e) => {
            onPlayerCount(Number(e.target.value));
          }}
        >
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
            (n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ),
          )}
        </select>
      </label>

      <p className="lobby-blurb">
        {vsBot
          ? 'You are A · smarter playtest bot is B · match log autosaves'
          : (PLACEMENT_BLURB[playerCount] ?? 'Spaced around the origin')}
      </p>

      <button type="button" className="lobby-start" onClick={onStart}>
        Start match
      </button>
    </div>
  </div>
);
