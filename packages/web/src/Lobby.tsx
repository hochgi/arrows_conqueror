import type { ReactElement } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@arrows/contracts';
import type { ByokConfig } from './byokConfig';
import { DEFAULT_BYOK, isByokReady } from './byokConfig';

export interface LobbyProps {
  readonly playerCount: number;
  readonly vsBot: boolean;
  readonly byok: ByokConfig;
  readonly onPlayerCount: (n: number) => void;
  readonly onVsBot: (v: boolean) => void;
  readonly onByok: (next: ByokConfig) => void;
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
  byok,
  onPlayerCount,
  onVsBot,
  onByok,
  onStart,
}: LobbyProps): ReactElement => {
  const byokIncomplete = vsBot && byok.enabled && !isByokReady(byok);
  return (
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

        {vsBot ? (
          <fieldset className="lobby-byok">
            <legend>BYOK LLM opponent (optional)</legend>
            <label className="lobby-check">
              <input
                type="checkbox"
                checked={byok.enabled}
                onChange={(e) => {
                  onByok({ ...byok, enabled: e.target.checked });
                }}
              />
              Use OpenAI-compatible API for seat B
            </label>
            {byok.enabled ? (
              <>
                <label className="lobby-count">
                  Base URL
                  <input
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={byok.baseUrl}
                    placeholder={DEFAULT_BYOK.baseUrl}
                    onChange={(e) => {
                      onByok({ ...byok, baseUrl: e.target.value });
                    }}
                  />
                </label>
                <label className="lobby-count">
                  API key
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={byok.apiKey}
                    placeholder="sk-… (stored in this browser only)"
                    onChange={(e) => {
                      onByok({ ...byok, apiKey: e.target.value });
                    }}
                  />
                </label>
                <label className="lobby-count">
                  Model
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={byok.model}
                    placeholder={DEFAULT_BYOK.model}
                    onChange={(e) => {
                      onByok({ ...byok, model: e.target.value });
                    }}
                  />
                </label>
                {byokIncomplete ? (
                  <p className="lobby-byok-warn">
                    Fill base URL, API key, and model — otherwise Start stays disabled
                    (avoids silently running the heuristic).
                  </p>
                ) : null}
                <p className="lobby-byok-note">
                  Key never leaves this browser and is never written to the match log.
                  Calls go from your browser to the base URL. Failures fall back to the
                  heuristic and show in the HUD / log stats. Some providers block browser
                  CORS.
                </p>
              </>
            ) : null}
          </fieldset>
        ) : null}

        <p className="lobby-blurb">
          {vsBot
            ? byok.enabled
              ? 'You are A · LLM seat B (BYOK) · match log records botMode + llm hit/fallback counts'
              : 'You are A · smarter playtest bot is B · match log autosaves'
            : (PLACEMENT_BLURB[playerCount] ?? 'Spaced around the origin')}
        </p>

        <button
          type="button"
          className="lobby-start"
          disabled={byokIncomplete}
          onClick={onStart}
        >
          Start match
        </button>
      </div>
    </div>
  );
};
