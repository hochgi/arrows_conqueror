import { createHash } from 'node:crypto';

/** Total string order — never object identity or insertion luck. */
export const compareStrings = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

/** First 16 bytes of SHA-256, lowercase hex (32 characters). */
export const truncate16Sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);

export const userHashFromSub = (sub: string): string => truncate16Sha256(sub);

export const groupHashFromUserHashes = (userHashes: readonly string[]): string => {
  const sorted = [...userHashes].sort(compareStrings);
  return truncate16Sha256(sorted.join('\n'));
};

export const bytesToHex = (bytes: Uint8Array): string => {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
};

export const padGameNumber = (n: number): string => n.toString().padStart(6, '0');
