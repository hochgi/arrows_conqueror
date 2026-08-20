# language: en
# Overview: docs/spec/losing-conditions/losing-conditions.md
# SPEC §6.1 cuts, §6.3 conversion, §7 closure and accrual, §9 victory, §11 items 44-45

Feature: Losing at the boundaries
  As a rules engine that must never invent a winner
  I want the edge of every losing condition pinned down
  So that a six seat match cannot end by array order or hang forever

  Background:
    Given a GameState, a GeometryPort and a RulesPort
    And every assertion reads the state after endTurn closed a full round

  Rule: The predicate is exactly the decided table

    Scenario Outline: Each cell of the table
      Given a player with <territory> territory, <shares> shares and <heads> heads
      When the round closes
      Then that player is <outcome>

      Examples:
        | territory | shares | heads | outcome                    |
        | none      | none   | none  | lost                       |
        | none      | none   | two   | lost                       |
        | some      | none   | none  | lost                       |
        | some      | none   | two   | not lost, on the clock     |
        | some      | one    | none  | not lost, clock at zero    |
        | some      | one    | two   | not lost, clock at zero    |

    Scenario: A share implies territory, so no case is missed
      Given any state
      Then no player owns a spawner share without owning territory

    Scenario: Territory away from every spawner still counts as territory
      Given A owns territory that borders no spawner vertex
      And A holds heads
      When the round closes
      Then A is not lost
      And A is on the starvation clock

  Rule: Loss is idempotent and stable

    Scenario: A lost seat stays lost
      Given A is lost
      When ten rounds close
      Then A is still lost
      And nothing further is removed

    Scenario: A lost seat is not recorded twice
      Given A is lost
      When the round closes
      Then no head, trail mark or territory arrow changes owner

    Scenario: A lost seat's starvation streak is not advanced
      Given A is lost
      When the round closes
      Then A has no starvation streak

  Rule: Removal cleans up everything the seat owned

    Scenario: Trail marks go, including those overlapping an enemy trail
      Given A's trail marks an arrow that B's trail also marks
      And A becomes lost
      When the round closes
      Then that arrow is no longer in A's trail
      And it is still in B's trail

    Scenario: A stack co-located under an enemy trail is removed
      Given A holds a stack on an arrow marked by B's trail
      And A becomes lost
      When the round closes
      Then A has no heads there
      And B's trail mark remains

    Scenario: Accumulators on vacated territory reset rather than carrying
      Given A owns a spawner-border arrow with a part-filled accumulator
      And A becomes lost
      When the round closes
      Then that arrow is unowned
      And its accumulator is zero

    Scenario: A spawner whose shares are all vacated keeps its round-robin phase
      Given all three border arrows of a spawner belonged to A
      And A becomes lost
      When the round closes
      Then the spawner's phase advanced exactly once for that round

  Rule: The boundary order cannot remove a seat that was about to be paid

    Scenario: Accrual saves a headless seat on the same boundary
      Given A owns a share, holds no heads, and its accumulator crosses a head this round
      When the round closes
      Then A holds a head
      And A is not lost

    Scenario: Accrual on the last round of a streak clears rather than loses
      Given A is destitute with a streak one below the threshold
      And A captures a share before the round closes
      When the round closes
      Then A's starvation streak is 0
      And A is not lost

    Scenario: An enemy blockade does not pay the owner
      Given A owns a share with an enemy head standing on it
      And A holds no heads elsewhere and owns no other share
      When the round closes
      Then A is not lost
      And A's starvation streak is 0

  Rule: Nobody wins by position in the player list

    Scenario: A six seat match with one starving seat sets no winner
      Given six seats, of which one starves out
      When that seat is lost
      Then five seats remain
      And there is no winner

    Scenario: The old two-player shortcut is gone
      Given a six seat match in which A starves out
      When A is lost
      Then the winner is not the first remaining seat in the player list

    Scenario: A seat removed by starvation while four contest sets no winner
      Given six seats and two simultaneous losses
      When the round closes
      Then four seats remain
      And there is no winner

  Rule: A match with no surviving seat is recorded, not invented

    # SPEC §11 item 44. This packet does not invent a draw: the seats are removed,
    # `winner` stays unset, and the state is terminal-but-unwon. The adapter will
    # read that as still playing, which is wrong and is recorded as wrong.
    Scenario: Every remaining seat lost on one boundary leaves no winner
      Given the only two seats left both own territory, no share and no heads
      When the round closes
      Then both seats are lost
      And there is no winner
      And no seat's pieces remain on the board

  Rule: Headless seats cannot deadlock the round

    Scenario: Every remaining seat headless at once still closes rounds
      Given every seat not lost owns a share and holds no heads
      When play continues
      Then the round boundary fires
      And spawners accrue
      And the first seat to be paid resumes play

    Scenario: A headless first seat does not stop the boundary
      Given the first seat in the player list owns a share and holds no heads
      When play continues
      Then the round boundary still fires

    Scenario: Accrual reads territory, not liveness
      Given a player with a share and no heads anywhere on the board
      When the round closes
      Then that share's accumulator advanced

  Rule: Determinism

    Scenario: Equal states lose equal seats
      Given two equal states in which three seats qualify to be lost
      When the round closes on each
      Then the same seats are lost, in the same order

    Scenario: Losses resolve in player order
      Given seats B and A both qualify to be lost, with A earlier in the list
      When the round closes
      Then A is resolved before B

    Scenario: Streaks are read through the player list, not the map
      Given starvation streaks inserted in an order that differs from the player list
      Then the resolution order follows the player list

    Scenario: A replay loses the same seats at the same boundaries
      Given a match log that eliminates two seats
      When the log is replayed
      Then the same seats are lost at the same round boundaries
      And the final state is identical

    Scenario: No clock and no randomness
      Then victory.ts references neither a clock nor a random source
