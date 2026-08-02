# language: en
# Overview: docs/spec/rational/rational.md
# SPEC §3 (harmonic speed, banking), §7 (accumulators, carry)

Feature: Exact rational arithmetic
  As the rules core
  I want allowance and accrual computed exactly
  So that the spawner rhythm a player can work out in their head is the one the
  engine actually produces

  Rule: Addition is exact across coprime denominators

    The case the design deliberately creates. Overlapping spawner
    neighbourhoods are the norm, so mismatched denominators are the ordinary
    situation rather than the exotic one.

    Scenario: A double-fed arrow accrues exactly
      Given a rational 1/9
      And a rational 1/12
      When I add them
      Then the result is exactly 7/36

    Scenario: Repeated addition does not drift
      Given a rational 7/36
      When I add it to itself 6 times
      Then the result is exactly 7/6
      # Five additions fall short of 1 and six overshoot it. An implementation
      # that drifts by an epsilon lands on the wrong side of that boundary.

    Scenario Outline: Harmonic allowance is exact
      When I compute the movement allowance of a stack of <heads>
      Then the result is exactly <allowance>

      Examples:
        | heads | allowance |
        | 1     | 1/1       |
        | 2     | 3/2       |
        | 3     | 11/6      |
        | 4     | 25/12     |

  Rule: Values are normalized and compared by value

    A comparison that falls back on representation, identity or insertion order
    is the determinism failure ADR 0001 names as the realistic one — it passes
    every unit test and surfaces only as replay drift.

    Scenario Outline: Equal values compare equal regardless of representation
      Given a rational <left>
      And a rational <right>
      When I compare them
      Then they compare equal

      Examples:
        | left | right |
        | 2/4  | 1/2   |
        | 6/9  | 2/3   |
        | 0/5  | 0/1   |
        | 4/2  | 2/1   |

    Scenario: Ordering is total
      Given a collection of rationals with mixed denominators
      When I sort it
      Then the result is in ascending order by value

  Rule: Banking and carry keep the remainder

    SPEC §7 is explicit that nothing is wasted, which matters precisely because
    two spawners feeding one arrow overshoot routinely.

    Scenario: A whole step is spent and the fraction is kept
      Given an allowance of exactly 3/2
      When one whole step is spent
      Then the remaining allowance is exactly 1/2

    Scenario: An accumulator reaching one carries the overshoot
      Given an accumulator holding exactly 11/12
      When it gains 1/4
      Then one head is produced
      And the accumulator holds exactly 1/6

    Scenario: An accumulator landing exactly on one carries nothing
      Given an accumulator holding exactly 2/3
      When it gains 1/3
      Then one head is produced
      And the accumulator holds exactly 0
