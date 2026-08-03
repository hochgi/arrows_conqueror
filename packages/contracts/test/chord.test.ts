/**
 * One test per scenario in:
 *   docs/spec/chord-test/chord-test.core.feature
 *   docs/spec/chord-test/chord-test.edge-cases.feature
 *
 * The chord test is the only part of P01 that encodes a rule rather than a
 * shape, and the subtlest logic in the game. It is also totally specifiable, so
 * nothing here is left to inference.
 *
 * Every assertion works on cyclic slot order alone and never asks which slots
 * are in-slots — SPEC §11 item 1 is still unmeasured and the test must hold
 * under either candidate pattern.
 */

import { describe, expect, it } from 'vitest';
import { chord, chordsCross, chordsInterleave, ContractViolation, SLOTS } from '../src/index';
import type { Chord, Slot } from '../src/index';

/** All 15 distinct chords on six slots. A chord's endpoints are distinct. */
const allChords = (): Chord[] => {
  const out: Chord[] = [];
  for (let i = 0; i < SLOTS.length; i += 1) {
    for (let j = i + 1; j < SLOTS.length; j += 1) {
      out.push(chord(SLOTS[i] as Slot, SLOTS[j] as Slot));
    }
  }
  return out;
};

const rotate = (s: Slot, by: number): Slot => (((s + by) % 6) as Slot);
const reflect = (s: Slot): Slot => (((6 - s) % 6) as Slot);
const mapChord = (c: Chord, f: (s: Slot) => Slot): Chord => chord(f(c.a), f(c.b));

describe('chord test — interleaving chords cross', () => {
  it('crosses when chords alternate around the circle', () => {
    expect(chordsCross(chord(1, 4), chord(0, 3))).toBe(true);
  });

  it('crosses when a narrow chord interleaves a wide one', () => {
    expect(chordsCross(chord(1, 5), chord(0, 2))).toBe(true);
  });
});

describe('chord test — coinciding chords cross', () => {
  it('crosses when blue exits along an arrow red also uses', () => {
    expect(chordsCross(chord(1, 3), chord(0, 3))).toBe(true);
  });

  it('crosses when blue enters along an arrow red also uses', () => {
    expect(chordsCross(chord(3, 5), chord(0, 3))).toBe(true);
  });

  it('crosses a chord identical to itself', () => {
    expect(chordsCross(chord(0, 3), chord(0, 3))).toBe(true);
  });
});

describe('chord test — turning aside is not crossing', () => {
  it('does not cross with both endpoints on one side', () => {
    expect(chordsCross(chord(1, 2), chord(0, 3))).toBe(false);
  });

  it('does not cross with both endpoints on the other side', () => {
    expect(chordsCross(chord(4, 5), chord(0, 3))).toBe(false);
  });

  it('lets a head shadow an enemy trail through a shared point', () => {
    // Blue transited the very point red's trail runs through, and nothing
    // happened. It may do this point after point, choosing its moment.
    expect(chordsCross(chord(4, 5), chord(0, 3))).toBe(false);
  });

  it('lets two trails run parallel through the same corridor', () => {
    expect(chordsCross(chord(1, 2), chord(0, 3))).toBe(false);
  });
});

describe('chord test — total and symmetric', () => {
  it('returns a verdict for all 225 ordered pairs and raises for none', () => {
    const chords = allChords();
    expect(chords).toHaveLength(15);
    let verdicts = 0;
    for (const blue of chords) {
      for (const red of chords) {
        expect(typeof chordsCross(blue, red)).toBe('boolean');
        verdicts += 1;
      }
    }
    expect(verdicts).toBe(225);
  });

  it('gives the same verdict whichever chord is called blue', () => {
    for (const blue of allChords()) {
      for (const red of allChords()) {
        expect(chordsCross(blue, red)).toBe(chordsCross(red, blue));
      }
    }
  });
});

describe('chord test — depends only on cyclic order', () => {
  it('is unchanged by rotating every slot label', () => {
    for (const blue of allChords()) {
      for (const red of allChords()) {
        expect(chordsCross(mapChord(blue, (s) => rotate(s, 1)), mapChord(red, (s) => rotate(s, 1)))).toBe(
          chordsCross(blue, red),
        );
      }
    }
  });

  it('is unchanged by reflecting the cyclic order', () => {
    for (const blue of allChords()) {
      for (const red of allChords()) {
        expect(chordsCross(mapChord(blue, reflect), mapChord(red, reflect))).toBe(
          chordsCross(blue, red),
        );
      }
    }
  });

  it.each([
    { pattern: 'alternating', inSlots: [0, 2, 4] as Slot[], outSlots: [1, 3, 5] as Slot[] },
    { pattern: 'three-consecutive', inSlots: [0, 1, 2] as Slot[], outSlots: [3, 4, 5] as Slot[] },
  ])('realizes exactly 9 chords and 81 reachable pairs under $pattern', ({ inSlots, outSlots }) => {
    const realizable: Chord[] = [];
    for (const i of inSlots) for (const o of outSlots) realizable.push(chord(i, o));
    expect(realizable).toHaveLength(9);

    let pairs = 0;
    for (const blue of realizable) {
      for (const red of realizable) {
        expect(typeof chordsCross(blue, red)).toBe('boolean');
        pairs += 1;
      }
    }
    expect(pairs).toBe(81);
  });
});

describe('chord test — the predicate takes chords and nothing else', () => {
  it('never asks which slots are in-slots', () => {
    // SPEC §11 item 1 is unmeasured, so the test must not depend on it. Pinned
    // as arity: two chords in, no orientation argument, no direction flag. If
    // this ever has to grow a parameter, the rule was misunderstood, not the
    // hedge (chord-test.md, "The last invariant is a hedge").
    expect(chordsCross).toHaveLength(2);
    expect(chordsInterleave).toHaveLength(2);
    expect(chord).toHaveLength(2);
  });

  it('cannot be asked about a head that arrived without choosing an exit', () => {
    // "A defender may hold a contested point without committing." Holding is
    // not a chord — there is no partial chord to hand the test, so the answer
    // is not "no crossing", it is unaskable. Crossing is a decision (§2).
    expect(() => chord(0, undefined as unknown as Slot)).toThrow(ContractViolation);
    expect(() => chord(0, 6 as unknown as Slot)).toThrow(ContractViolation);
  });
});

describe('chord test — §7 reads the interleave half alone', () => {
  // The cut check (§6.1) and combat location (§6.2) want interleave OR coincide.
  // Even-odd fill wants interleave alone: fill reads the trail's arrow set
  // (§6.1a invariant 2), so re-traversing an arrow the trail already holds
  // changes nothing and must not invert. A fill written against chordsCross
  // would invert on a lagging group walking its own ground — ordinary play.
  it('inverts on an interleave', () => {
    expect(chordsInterleave(chord(1, 4), chord(0, 3))).toBe(true);
  });

  it('does not invert on coincidence alone', () => {
    expect(chordsCross(chord(0, 2), chord(0, 3))).toBe(true);
    expect(chordsInterleave(chord(0, 2), chord(0, 3))).toBe(false);
  });

  it('does not invert on a chord identical to itself', () => {
    expect(chordsCross(chord(0, 3), chord(0, 3))).toBe(true);
    expect(chordsInterleave(chord(0, 3), chord(0, 3))).toBe(false);
  });

  it('does not invert when the chord turns aside', () => {
    expect(chordsInterleave(chord(4, 5), chord(0, 3))).toBe(false);
  });

  it('keeps crossing exactly interleave-or-coincide across all 225 pairs', () => {
    // The relationship is the invariant, not the two predicates separately —
    // they can never disagree, so neither can drift from the other in phase 3.
    const coincides = (blue: Chord, red: Chord): boolean =>
      blue.a === red.a || blue.a === red.b || blue.b === red.a || blue.b === red.b;
    for (const blue of allChords()) {
      for (const red of allChords()) {
        expect(chordsCross(blue, red)).toBe(chordsInterleave(blue, red) || coincides(blue, red));
      }
    }
  });
});
