import type { InviteSeat, PlannedSeatKind } from '@conquarrow/contracts';

export type InviteStatus = 'open' | 'revoked' | 'started';

export interface InviteRecord {
  readonly status: InviteStatus;
  readonly creatorUserHash: string;
  readonly seats: readonly InviteSeat[];
}

export const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

export const parseKinds = (seats: readonly unknown[]): PlannedSeatKind[] | undefined => {
  const kinds: PlannedSeatKind[] = [];
  for (const seat of seats) {
    if (seat !== 'human' && seat !== 'heuristic' && seat !== 'byok') {
      return undefined;
    }
    kinds.push(seat);
  }
  return kinds;
};

export const firstHumanIndex = (kinds: readonly PlannedSeatKind[]): number => {
  for (let i = 0; i < kinds.length; i += 1) {
    if (kinds[i] === 'human') return i;
  }
  return -1;
};

export const validatePlan = (
  kinds: readonly PlannedSeatKind[],
  hostSeatIndex: number | undefined,
): { readonly host: number } | undefined => {
  if (kinds.length !== 3 && kinds.length !== 6) return undefined;
  let humans = 0;
  for (const kind of kinds) {
    if (kind === 'byok') return undefined;
    if (kind === 'human') humans += 1;
  }
  if (humans < 2) return undefined;
  const host = hostSeatIndex ?? firstHumanIndex(kinds);
  if (kinds[host] !== 'human') return undefined;
  return { host };
};

export const seatsFromPlan = (
  kinds: readonly PlannedSeatKind[],
  host: number,
  userHash: string,
): InviteSeat[] =>
  kinds.map((kind, index) => {
    if (kind === 'heuristic') return { kind: 'heuristic' };
    if (index === host) return { kind: 'human', userHash };
    return { kind: 'human' };
  });

const parseSeat = (value: unknown): InviteSeat | undefined => {
  const rec = asRecord(value);
  if (rec === undefined) return undefined;
  const kind = rec['kind'];
  if (kind === 'heuristic') return { kind: 'heuristic' };
  if (kind !== 'human') return undefined;
  const userHash = rec['userHash'];
  if (typeof userHash === 'string') return { kind: 'human', userHash };
  return { kind: 'human' };
};

export const parseInvite = (raw: string): InviteRecord | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const rec = asRecord(parsed);
  if (rec === undefined) return undefined;
  const status = rec['status'];
  if (status !== 'open' && status !== 'revoked' && status !== 'started') {
    return undefined;
  }
  const creatorUserHash = rec['creatorUserHash'];
  if (typeof creatorUserHash !== 'string') return undefined;
  const seatsRaw = rec['seats'];
  if (!Array.isArray(seatsRaw)) return undefined;
  const seats: InviteSeat[] = [];
  for (const item of seatsRaw) {
    const seat = parseSeat(item);
    if (seat === undefined) return undefined;
    seats.push(seat);
  }
  return { status, creatorUserHash, seats };
};

export const serializeInvite = (invite: InviteRecord): string =>
  JSON.stringify({
    status: invite.status,
    creatorUserHash: invite.creatorUserHash,
    seats: invite.seats.map((seat) => {
      if (seat.kind === 'heuristic') return { kind: 'heuristic' };
      const userHash = seat.userHash;
      if (userHash === undefined) return { kind: 'human' };
      return { kind: 'human', userHash };
    }),
  });

export const boundUserHash = (seat: InviteSeat): string | undefined =>
  seat.kind === 'human' ? seat.userHash : undefined;

export const indexOfBoundUser = (
  seats: readonly InviteSeat[],
  userHash: string,
): number => {
  for (let i = 0; i < seats.length; i += 1) {
    const seat = seats[i];
    if (seat !== undefined && boundUserHash(seat) === userHash) return i;
  }
  return -1;
};

export const nextUnboundHumanIndex = (seats: readonly InviteSeat[]): number => {
  for (let i = 0; i < seats.length; i += 1) {
    const seat = seats[i];
    if (seat !== undefined && seat.kind === 'human' && seat.userHash === undefined) {
      return i;
    }
  }
  return -1;
};

export const allHumanSeatsBound = (seats: readonly InviteSeat[]): boolean => {
  for (const seat of seats) {
    if (seat.kind === 'human' && seat.userHash === undefined) return false;
  }
  return true;
};

export const boundHumanHashes = (seats: readonly InviteSeat[]): string[] => {
  const hashes: string[] = [];
  for (const seat of seats) {
    const hash = boundUserHash(seat);
    if (hash !== undefined) hashes.push(hash);
  }
  return hashes;
};
