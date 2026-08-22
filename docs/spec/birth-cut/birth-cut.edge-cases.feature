# language: en
# Overview: docs/spec/birth-cut/birth-cut.md
# SPEC §6.1, §7, §11 item 47 (P40)

Feature: Birth-cut edges — blockade, friendly, unowned, purity
  As the rules engine
  I want birth-cut to reuse halt-at-first and leave P08 blockade alone
  So that marks are not occupation and a friendly spawn is not a self-cut

  Background:
    Given a board behind GeometryPort

  Rule: Blockade still prevents the birth

    Scenario: An enemy stack on the feed arrow still halts accrual
      Given the feed arrow is player B's territory
      And player A's stack occupies it
      And the arrow is in player A's trail
      When the full round accrues
      Then no additional head appears
      And A's trail still includes the feed arrow
      And the accumulator is unchanged

  Rule: Friendly and unowned births are not cuts

    Scenario: A birth onto the owner's own trail merges and does not cut
      Given the feed arrow is player A's territory and is in player A's trail
      And a continuation of that trail is empty
      When the full round accrues
      Then a head owned by A stands on or has merged on the feed arrow
      And A's trail still includes the feed arrow
      And A's trail still includes the continuation

    Scenario: An unowned feed arrow neither spawns nor cuts
      Given the RR lands on an unowned arrow that is in player A's trail
      When the full round accrues
      Then no head appears there
      And A's trail still includes that arrow

    Scenario: A birth on an owned arrow with no foreign trail does not strip anyone
      Given the feed arrow is player B's territory
      And no other player's trail contains it
      When the full round accrues
      Then a head owned by B stands on the feed arrow
      And every other player's trail is unchanged

  Rule: Distal beyond a firebreak and double-feed

    Scenario: Trail beyond a firebreak remains
      Given a birth-cut whose front halts at player A's garrison
      And A's trail continues past that garrison
      When the full round accrues
      Then A's trail still includes the garrisoned arrow
      And A's trail still includes the distal continuation beyond it

    Scenario: Two spawners emitting on the same arrow in one tick cut once
      Given two spawners whose round-robin both land on the same B-owned feed arrow
      And that arrow is in player A's bare trail
      And the combined forces this tick emit at least one head
      When the full round accrues
      Then A's trail is absent from the feed arrow
      And a B head stands there

  Rule: Purity

    Scenario: Accrual with a birth-cut does not mutate the input state
      Given a state S0 whose next endTurn will birth-cut
      When endTurn accrues yielding S1
      Then S0 is unchanged
