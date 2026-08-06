import type { ReactElement } from 'react';
import { SPAWNER_IDLE, styleFor } from './colors';
import type { ShareInfo, SpawnerInfo } from './spawnerInfo';

export interface SpawnerTipProps {
  readonly info: SpawnerInfo;
  /** Cursor position within the stage, in pixels. */
  readonly x: number;
  readonly y: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
}

const TIP_W = 232;
const TIP_H = 168;

const statusNote = (share: ShareInfo): string => {
  switch (share.status) {
    case 'unclaimed':
      return 'unclaimed — pays nobody';
    case 'blockaded':
      return 'blockaded — this share is lost each round';
    case 'earning':
      return share.banked.num === 0
        ? 'earning — nothing banked yet'
        : `${String(share.banked.num)}/${String(share.banked.den)} of a head banked`;
  }
};

/**
 * The full read-out for one spawner, on hover.
 *
 * Everything here used to be on the board and could not stay there — a hundred spawners
 * each carrying three arcs, a hub and a phase cursor is a legible object repeated into an
 * illegible field. On the board a spawner now says only *who holds how much* and *roughly
 * how loaded*; the numbers that reward reading rather than glancing live here.
 *
 * §7 makes several of these distinctions matter more than they look:
 * — **unclaimed pays nobody**, so a spawner sitting in open ground is worth zero until
 *   somebody closes territory around it. That is the single most surprising rule in the
 *   economy and the board cannot express it.
 * — a **blockaded** share still burns its turn in the round-robin, so the output is gone
 *   rather than deferred.
 * — ownership is in **thirds**, and shaving one arrow off a rival cuts their income by one.
 */
export const SpawnerTip = ({
  info,
  x,
  y,
  stageWidth,
  stageHeight,
}: SpawnerTipProps): ReactElement => {
  // Flip rather than clamp: a tip that slides along the edge covers the thing it describes.
  const left = x + 18 + TIP_W > stageWidth ? Math.max(4, x - 18 - TIP_W) : x + 18;
  const top = y + 12 + TIP_H > stageHeight ? Math.max(4, y - 12 - TIP_H) : y + 12;
  const { num, den } = info.force;

  return (
    <div className="tip" style={{ left, top, width: TIP_W }} role="tooltip">
      <p className="tip-title">
        Spawner · force{' '}
        <strong>
          {num}/{den}
        </strong>
      </p>
      <p className="tip-sub">
        one head every {info.roundsPerHead} rounds if you hold all three · any one share
        fills in {info.roundsPerShare}
        {info.yielding < 1
          ? ` · ${String(Math.round(info.yielding * 100))}% of the output is live`
          : null}
      </p>

      <ul className="tip-shares">
        {info.shares.map((share) => {
          const tint = share.owner === undefined ? SPAWNER_IDLE : styleFor(share.owner).fill;
          return (
            <li key={String(share.arrow)} className={`tip-share ${share.status}`}>
              <span className="tip-swatch" style={{ background: tint }} />
              <span className="tip-share-body">
                <span className="tip-share-owner">
                  {share.owner === undefined ? 'unowned' : styleFor(share.owner).label}
                  {share.next ? <em className="tip-next"> next</em> : null}
                </span>
                <span className="tip-bar">
                  <span
                    className="tip-bar-fill"
                    style={{ width: `${String(Math.round(share.loaded * 100))}%`, background: tint }}
                  />
                </span>
                <span className="tip-share-note">{statusNote(share)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="tip-held">
        {info.held.length === 0
          ? 'held by nobody'
          : info.held
              .map((h) => `${String(h.thirds)}/3 ${styleFor(h.player).label}`)
              .join(' · ')}
      </p>
    </div>
  );
};
