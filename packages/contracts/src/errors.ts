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

/**
 * Raise a {@link ContractViolation}. Internal to the package — the error type is
 * public because tests assert on it, but this shorthand is not part of the port
 * surface.
 *
 * Typed `never` so a guard can sit in an expression position without the
 * compiler losing track of the fact that control does not return.
 */
export const reject = (message: string): never => {
  throw new ContractViolation(message);
};
