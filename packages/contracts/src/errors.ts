/**
 * The error a contract raises when it is handed something it forbids.
 *
 * Distinct from a plain `Error` on purpose. Phase-2 skeletons throw plain
 * `Error('not implemented')`, so a rejection test asserting merely `.toThrow()`
 * would pass against an empty skeleton and go on passing in phase 3 whether or
 * not the validation was ever written — a green test that never tested
 * anything.
 *
 * Asserting `toThrow(ContractViolation)` closes that: it is red until the real
 * check exists.
 */
export class ContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractViolation';
  }
}
