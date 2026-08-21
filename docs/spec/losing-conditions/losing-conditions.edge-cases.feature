# language: en
# Overview: docs/spec/losing-conditions/losing-conditions.md
# SPEC §6.1 cuts, §6.3 conversion, §7 closure and accrual, §9 victory, §11 items 44-45

Feature: Losing at the boundaries
  As a rules engine that must never invent a winner
  I want the edge of every losing condition pinned down
  So that a six seat match cannot end by array order or hang forever

  Background:
    Given a GameState, a GeometryPort and a RulesPort
    # P37: "every assertion reads the state after endTurn closed a full round"
    # stood here and is no longer true of this suite — a loss resolves on the move
    # that causes it, so each scenario below reads the state its own When returns.
    # Where a scenario still says "when the round closes", that is because the
    # thing it measures (a starvation streak) genuinely counts rounds.

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

    # A lost seat never owned a share, so the arrow here is share-free territory.
    # A part-filled accumulator on non-share territory is still reachable, because
    # accumulators outlive the capture that zeroed them.
    Scenario: Accumulators on vacated territory reset rather than carrying
      Given A owns share-free territory with a part-filled accumulator
      And A becomes lost
      When the round closes
      Then that arrow is unowned
      And its accumulator is zero

    # Not "a spawner whose shares were all A's" — that board cannot exist. The
    # point under test is that the cursor is ownership-blind.
    Scenario: A spawner's round-robin phase ignores who owns its shares
      Given a spawner whose border arrows are unowned
      When the round closes
      Then the spawner's phase advanced exactly once

    Scenario: No lost seat ever owned a spawner share
      Given any state in which some seat is lost
      Then that seat owned no spawner-border territory

  Rule: The boundary order cannot remove a seat that was about to be paid

    # Not a rescue from loss — A owns a share, so A was never a candidate. What
    # this pins is that a headless share-owner is paid and stays in the match.
    Scenario: A headless share owner is paid and stays in
      Given A owns a share, holds no heads, and its accumulator crosses a head this round
      When the round closes
      Then A holds a head
      And A is not lost

    # A streak is cleared by *capturing* a share during a turn — closure, not
    # accrual. Accrual pays only share owners and a destitute seat owns none.
    Scenario: Capturing a share on the last round of a streak clears it
      Given A is destitute with a streak one below the threshold
      And A captures a share before the round closes
      When the round closes
      Then A's starvation streak is 0
      And A is not lost

    Scenario: A seat is lost on the round its streak reaches the threshold
      Given the starvation threshold is 3
      And A is destitute from the first round
      Then A is not lost after two rounds
      And A is lost after three rounds

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

    # SPEC §11 item 44, **resolved by dissolution in P37**: play cannot reach a
    # board with no surviving seat, because no path un-owns a spawner share and a
    # share owner is never lost. The state below is therefore *authored*, not
    # reachable — kept as a totality guard on the resolution pass rather than as a
    # claim about a game anyone can play. It is still true that `winner` stays
    # unset and that an adapter would read that as playing; nothing represents the
    # state because nothing reaches it. See
    # `docs/spec/immediate-loss/immediate-loss.md`.
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

    Scenario: The winner is checked only after every seat is resolved
      Given the last three seats all qualify to be lost on one boundary
      When the round closes
      Then no winner is set for the second-to-last seat resolved

    Scenario: The outcome ignores every map's insertion order
      Given two states equal but for the insertion order of their maps
      When the round closes on each
      Then the resulting states are identical
      And lost seats are reported in player list order

    Scenario: A replay loses the same seats at the same boundaries
      Given a match log that eliminates two seats
      When the log is replayed
      Then the same seats are lost at the same round boundaries
      And the final state is identical

    Scenario: No clock and no randomness
      Then victory.ts references neither a clock nor a random source
