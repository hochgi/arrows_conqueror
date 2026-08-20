# language: en
# Overview: docs/spec/immediate-loss/immediate-loss.md
# SPEC §6.1 cuts, §6.3 conversion, §7 closure, §9 victory

Feature: Immediate loss at the boundaries
  As a rules engine that must not change an outcome by resolving sooner
  I want the edges of the new timing pinned
  So that only the moment of a loss moved, never its result

  Background:
    Given a GameState, a GeometryPort and a RulesPort

  Rule: Every way a seat can lose its last territory resolves at once

    Scenario: A cut that strands the last territory
      Given C's last territory is claimed by a closure following a cut
      When that closure is applied
      Then C is lost in the state it returns

    Scenario: A conversion inside a claim
      Given C's last heads stand inside a loop A closes
      And C owns no territory outside that loop
      When A closes the loop
      Then C is lost in the state it returns

    Scenario: A land bridge that takes the last arrow
      Given C's last territory is the arrow A's land bridge claims
      When A lands
      Then C is lost in the state it returns

    Scenario: Combat that empties the last stack of a landless seat
      Given C owns no territory and holds one head
      When that head is destroyed in combat
      Then C is lost in the state it returns

  Rule: Resolving sooner cannot change who loses

    Scenario: One seat's removal never qualifies another
      Given two seats each own territory, no share and heads
      When one of them is removed
      Then the other's territory, shares and heads are unchanged

    Scenario: A vanished seat's land is unowned, not the mover's
      Given C is lost while A is moving
      Then C's former territory belongs to nobody

    Scenario: Resolution order follows the player list
      Given two seats qualify to be lost on one move
      Then they are resolved in player list order

    Scenario: Two seats lost on one move both go
      Given two seats qualify to be lost on the same step
      When that step is applied
      Then both are lost in the state it returns

  Rule: The win check runs after every seat is resolved

    Scenario: The second to last seat is not crowned
      Given the last two seats other than A both qualify to be lost on one move
      When that move is applied
      Then the winner is A
      And the winner is not either of the removed seats

    Scenario: No winner while two seats remain
      Given three seats are playing and one qualifies to be lost
      When that move is applied
      Then that seat is lost
      And there is no winner

  Rule: A lost seat is inert

    Scenario: A lost seat is offered no move
      Given C is lost
      When legal moves are asked for on C's turn
      Then none are offered

    Scenario: A lost seat cannot be the winner
      Given C is lost
      Then the winner is never C

    Scenario: A lost seat has no starvation streak
      Given C is lost
      When the round closes
      Then C has no starvation streak

    Scenario: Ten rounds after a loss change nothing
      Given C is lost
      When ten rounds close
      Then C is still lost
      And nothing further is removed

  Rule: Item 44's chain is pinned, not merely argued

    Scenario: No engine path removes a share from ownership
      Given any state reachable by play
      Then every spawner-border arrow that had an owner still has one

    Scenario: A zero-survivor state is unreachable
      Given any state reachable by play
      Then at least one player is not lost

    Scenario: The vacuous guard is stated so it cannot pass silently
      Given a state in which every player is lost
      Then that state is unreachable by play

  Rule: Determinism and cost

    Scenario: Equal states lose equal seats on equal moves
      Given two equal states
      When the same move is applied to each
      Then the same seats are lost

    Scenario: The outcome ignores every map's insertion order
      Given two states equal but for the insertion order of their maps
      When the same move is applied to each
      Then the resulting states are identical

    Scenario: Counts are read in one pass, not once per player
      Given a state with several players and a large territory
      Then resolving losses reads territory and groups a bounded number of times

    Scenario: No clock and no randomness
      Then victory.ts references neither a clock nor a random source
