import { useState, type ReactElement } from 'react';
import { styleFor } from './colors';
import { testByokConnection } from './byokBot';
import { DEFAULT_BYOK, isByokReady } from './byokConfig';
import {
  PLAYTEST_PLAYER_COUNTS,
  byokConfigForSeat,
  resizeSeatPlan,
  seatPlanReady,
  seatPlayerId,
  updateSeat,
  type PlaytestPlayerCount,
  type SeatKind,
  type SeatPlan,
} from './seatPlan';

export interface LobbyProps {
  readonly plan: SeatPlan;
  readonly onPlan: (next: SeatPlan) => void;
  readonly onStart: () => void;
}

const PLACEMENT_BLURB: Record<PlaytestPlayerCount, string> = {
  3: 'Every alternating corner — order-3 rotational symmetry (fair grain)',
  6: 'All six corners — full hexagon of homes',
};

const KIND_OPTIONS: readonly { value: SeatKind; label: string }[] = [
  { value: 'human', label: 'Human' },
  { value: 'heuristic', label: 'Heuristic AI' },
  { value: 'byok', label: 'BYOK LLM' },
];

export const Lobby = ({ plan, onPlan, onStart }: LobbyProps): ReactElement => {
  const incomplete = !seatPlanReady(plan);
  const [probeSeat, setProbeSeat] = useState<number | undefined>(undefined);
  const [probeMsg, setProbeMsg] = useState<string | undefined>(undefined);
  const [probeOk, setProbeOk] = useState<boolean | undefined>(undefined);

  const runProbe = (index: number): void => {
    const seat = plan.seats[index];
    if (seat === undefined || seat.kind !== 'byok') return;
    const config = byokConfigForSeat(seat);
    if (!isByokReady(config) || probeSeat !== undefined) return;
    setProbeSeat(index);
    setProbeMsg(`Testing seat ${PLAYER_LABEL(index)}…`);
    setProbeOk(undefined);
    void (async () => {
      const result = await testByokConnection(config);
      setProbeSeat(undefined);
      if (result.ok) {
        setProbeOk(true);
        setProbeMsg(`Seat ${PLAYER_LABEL(index)} OK · ${JSON.stringify(result.sample)}`);
      } else {
        setProbeOk(false);
        setProbeMsg(`Seat ${PLAYER_LABEL(index)}: ${result.reason}`);
      }
    })();
  };

  return (
    <div className="lobby">
      <div className="lobby-card lobby-card-wide">
        <h1>Conquarrow</h1>
        <p className="lobby-lead">Playtest match on the arrow tiling</p>

        <label className="lobby-count">
          Players (3 or 6 — rotationally fair)
          <select
            value={plan.playerCount}
            onChange={(e) => {
              const n = Number(e.target.value) as PlaytestPlayerCount;
              onPlan(resizeSeatPlan(plan, n));
              setProbeMsg(undefined);
              setProbeOk(undefined);
            }}
          >
            {PLAYTEST_PLAYER_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <p className="lobby-blurb">{PLACEMENT_BLURB[plan.playerCount]}</p>

        <fieldset className="lobby-seats">
          <legend>Seats — each can be human or a different AI</legend>
          {plan.seats.map((seat, index) => {
            const player = seatPlayerId(index);
            const color = styleFor(player).fill;
            const byokIncomplete = seat.kind === 'byok' && !isByokReady(byokConfigForSeat(seat));
            return (
              <div key={String(player)} className="lobby-seat">
                <div className="lobby-seat-head">
                  <span className="lobby-seat-swatch" style={{ background: color }} />
                  <strong style={{ color }}>{styleFor(player).label}</strong>
                  <select
                    value={seat.kind}
                    aria-label={`${styleFor(player).label} driver`}
                    onChange={(e) => {
                      const kind = e.target.value as SeatKind;
                      onPlan(updateSeat(plan, index, { kind }));
                      setProbeMsg(undefined);
                      setProbeOk(undefined);
                    }}
                  >
                    {KIND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {seat.kind === 'byok' ? (
                  <div className="lobby-seat-byok">
                    <label className="lobby-count">
                      Base URL
                      <input
                        type="url"
                        autoComplete="off"
                        spellCheck={false}
                        value={seat.byok.baseUrl}
                        placeholder={DEFAULT_BYOK.baseUrl}
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, baseUrl: e.target.value },
                            }),
                          );
                          setProbeMsg(undefined);
                          setProbeOk(undefined);
                        }}
                      />
                    </label>
                    <label className="lobby-count">
                      API key
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={seat.byok.apiKey}
                        placeholder="sk-… (this browser only)"
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, apiKey: e.target.value },
                            }),
                          );
                          setProbeMsg(undefined);
                          setProbeOk(undefined);
                        }}
                      />
                    </label>
                    <label className="lobby-count">
                      Model
                      <input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={seat.byok.model}
                        placeholder={DEFAULT_BYOK.model}
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, model: e.target.value },
                            }),
                          );
                          setProbeMsg(undefined);
                          setProbeOk(undefined);
                        }}
                      />
                    </label>
                    <label className="lobby-check">
                      <input
                        type="checkbox"
                        checked={seat.byok.reasoning}
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, reasoning: e.target.checked },
                            }),
                          );
                        }}
                      />
                      Longer rationale budget (API thinking stays off — required for JSON picks)
                    </label>
                    <label className="lobby-count">
                      Proxy URL (optional)
                      <input
                        type="url"
                        autoComplete="off"
                        spellCheck={false}
                        value={seat.byok.proxyUrl}
                        placeholder="empty — local pnpm dev uses /__byok"
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, proxyUrl: e.target.value },
                            }),
                          );
                          setProbeMsg(undefined);
                          setProbeOk(undefined);
                        }}
                      />
                    </label>
                    <label className="lobby-check">
                      <input
                        type="checkbox"
                        checked={seat.byok.useTurnRunner}
                        onChange={(e) => {
                          onPlan(
                            updateSeat(plan, index, {
                              byok: { ...seat.byok, useTurnRunner: e.target.checked },
                            }),
                          );
                          setProbeMsg(undefined);
                          setProbeOk(undefined);
                        }}
                      />
                      Turn runner (local plan→commit — run <code>pnpm byok-turn</code>)
                    </label>
                    {seat.byok.useTurnRunner ? (
                      <label className="lobby-count">
                        Turn runner URL
                        <input
                          type="url"
                          autoComplete="off"
                          spellCheck={false}
                          value={seat.byok.turnRunnerUrl}
                          placeholder="empty — Vite uses /__turn → :4010"
                          onChange={(e) => {
                            onPlan(
                              updateSeat(plan, index, {
                                byok: { ...seat.byok, turnRunnerUrl: e.target.value },
                              }),
                            );
                            setProbeMsg(undefined);
                            setProbeOk(undefined);
                          }}
                        />
                      </label>
                    ) : null}
                    <div className="lobby-byok-actions">
                      <button
                        type="button"
                        className="lobby-byok-test"
                        disabled={byokIncomplete || probeSeat !== undefined}
                        onClick={() => {
                          runProbe(index);
                        }}
                      >
                        {probeSeat === index ? 'Testing…' : 'Test connection'}
                      </button>
                    </div>
                    {byokIncomplete ? (
                      <p className="lobby-byok-warn">
                        Fill base URL, API key, and model for this seat.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {probeMsg !== undefined ? (
          <p
            className={
              probeOk === true
                ? 'lobby-byok-ok'
                : probeOk === false
                  ? 'lobby-byok-warn'
                  : 'lobby-byok-note'
            }
          >
            {probeMsg}
          </p>
        ) : null}

        <p className="lobby-byok-note">
          OpenAI blocks browser CORS. Local play: <code>pnpm --filter @arrows/web dev</code>{' '}
          (auto <code>/__byok</code>). Point different seats at different models to watch
          AIs fight. Keys stay in this browser.
        </p>

        {incomplete ? (
          <p className="lobby-byok-warn">Complete every BYOK seat before Start.</p>
        ) : null}

        <button type="button" className="lobby-start" disabled={incomplete} onClick={onStart}>
          Start match
        </button>
      </div>
    </div>
  );
};

const PLAYER_LABEL = (index: number): string => String(seatPlayerId(index));
