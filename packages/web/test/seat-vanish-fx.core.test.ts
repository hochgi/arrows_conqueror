/**
 * docs/spec/seat-vanish-fx/seat-vanish-fx.core.feature
 * One it() per Gherkin scenario. Hand-authored diffs — no rules.apply.
 */

import { describe, expect, it } from 'vitest';
import {
  A,
  B,
  C,
  C_CONVERT,
  C_HEAD,
  C_TRAIL,
  CAPTURED,
  cutLivingB,
  hadPieces,
  namedSeatVanished,
  presentOf,
  resolveOf,
  seatVanishedFor,
  seatVanishOverlay,
  starveC,
  trailCutFor,
  vanishCConverted,
  vanishCEmptyRemnant,
  vanishCLastLandCaptured,
  vanishCLeavingRemnants,
  vanishCMidMatch,
} from './seat-vanish-fx.support';

describe('A vanished seat is named, not inferred as a cut', () => {
  it('Losing last territory names the loser as vanished', () => {
    const pair = vanishCLeavingRemnants();
    const events = resolveOf(pair);
    expect(seatVanishedFor(events, C)?.player).toBe(C);
  });

  it("The vanished player's remaining trail is not a cut", () => {
    const pair = vanishCLeavingRemnants();
    expect(pair.before.trails.get(C)?.has(C_TRAIL[0])).toBe(true);
    expect(pair.after.territory.get(C_TRAIL[0])).toBeUndefined();
    expect(hadPieces(pair.after, C)).toBe(false);

    const events = resolveOf(pair);
    expect(trailCutFor(events, C)).toBeUndefined();
  });

  it('Disappeared heads are remnant cells', () => {
    const pair = vanishCLeavingRemnants();
    expect(pair.before.groups.get(C_HEAD)?.owner).toBe(C);
    expect(pair.after.groups.get(C_HEAD)).toBeUndefined();

    const events = resolveOf(pair);
    const vanished = seatVanishedFor(events, C);
    expect(vanished).toBeDefined();
    expect(vanished?.arrows ?? []).toContain(C_HEAD);
  });

  it('Captured arrows are not remnant cells', () => {
    const pair = vanishCLastLandCaptured();
    const events = resolveOf(pair);

    const captured = events.filter((event) => event.kind === 'territoryCaptured');
    const taken = new Set(captured.flatMap((event) => (event.player === A ? event.arrows : [])));
    expect(taken.has(CAPTURED[0])).toBe(true);
    expect(taken.has(CAPTURED[1])).toBe(true);

    const remnant = new Set(seatVanishedFor(events, C)?.arrows ?? []);
    expect(remnant.has(CAPTURED[0])).toBe(false);
    expect(remnant.has(CAPTURED[1])).toBe(false);
    expect(seatVanishedFor(events, C)).toBeDefined();
  });

  it('Converted stacks stay conversion', () => {
    const pair = vanishCConverted();
    const events = resolveOf(pair);

    const converted = events.filter((event) => event.kind === 'unitsConverted');
    expect(converted).toEqual([
      expect.objectContaining({ arrow: C_CONVERT, from: C, to: A, heads: 3 }),
    ]);
    expect(seatVanishedFor(events, C)?.arrows.includes(C_CONVERT) ?? false).toBe(false);
    expect(seatVanishedFor(events, C)).toBeDefined();
  });
});

describe('Flicker-then-fade is the overlay', () => {
  it('A named vanish with remnants presents as seatVanish', () => {
    const arrows = [...C_TRAIL, C_HEAD];
    const overlays = presentOf([namedSeatVanished(C, arrows)]);
    const overlay = seatVanishOverlay(overlays, C);

    expect(overlays.filter((item) => item.kind === 'seatVanish')).toHaveLength(1);
    expect(overlay?.cells.map((cell) => cell.arrow)).toEqual(arrows);
    expect(overlay?.offsetMs).toBe(360);
    expect(overlay?.durationMs).toBe(520);
    expect(overlay?.tier).toBe(1);
  });

  it('Every remnant cell flickers together', () => {
    const overlays = presentOf([namedSeatVanished(C, [...C_TRAIL, C_HEAD])]);
    const overlay = seatVanishOverlay(overlays, C);
    expect(overlay).toBeDefined();
    expect(overlay?.cells.map((cell) => cell.delayMs)).toEqual([0, 0, 0]);
  });

  it('The overlay names the vanished player', () => {
    const overlays = presentOf([namedSeatVanished(C, [C_HEAD])]);
    expect(seatVanishOverlay(overlays, C)?.player).toBe(C);
  });

  it('An empty remnant is an event without an overlay', () => {
    const pair = vanishCEmptyRemnant();
    const events = resolveOf(pair);
    const vanished = seatVanishedFor(events, C);

    expect(vanished).toBeDefined();
    expect(vanished?.arrows).toEqual([]);
    expect(seatVanishOverlay(presentOf(events), C)).toBeUndefined();
  });
});

describe('Starvation and a living cut stay distinct', () => {
  it('A starvation end of turn names vanish, not a cut', () => {
    const pair = starveC();
    const events = resolveOf(pair);
    expect(seatVanishedFor(events, C)?.player).toBe(C);
    expect(trailCutFor(events, C)).toBeUndefined();
  });

  it('Mid-match vanish still flickers', () => {
    const pair = vanishCMidMatch();
    const events = resolveOf(pair);
    const overlays = presentOf(events);

    expect(seatVanishOverlay(overlays, C)).toBeDefined();
    expect(pair.after.winner).toBeUndefined();
    expect(events.some((event) => event.kind === 'matchWon')).toBe(false);
  });

  it('A genuine cut of a living player still evaporates', () => {
    const pair = cutLivingB();
    const events = resolveOf(pair);
    const overlays = presentOf(events);

    expect(trailCutFor(events, B)?.victim).toBe(B);
    expect(overlays.some((overlay) => overlay.kind === 'evaporate' && overlay.victim === B)).toBe(
      true,
    );
    expect(seatVanishedFor(events, B)).toBeUndefined();
  });
});
