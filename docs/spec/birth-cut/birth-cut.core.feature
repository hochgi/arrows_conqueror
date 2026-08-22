# language: en
# Overview: docs/spec/birth-cut/birth-cut.md
# SPEC §6.1, §7, §11 item 47 (P40)

Feature: Birth on open trail is a cut
  As the rules engine
  I want a spawner birth onto another player's trail to evaporate that trail
  So that the economy cannot place an enemy head on open trail without paying the cut price

  Background:
    Given a board behind GeometryPort
    And a spawner whose round-robin lands on a feed arrow this full round
    And that feed arrow's accumulator plus this tick's force will emit a head

  Rule: Enemy birth on bare trail cuts

    Scenario: An enemy head spawning onto bare open trail evaporates the region
      Given the feed arrow is player B's territory
      And player A's trail includes the feed arrow and a continuation, with no A stack on either
      When the full round accrues
      Then a head owned by B stands on the feed arrow
      And A's trail is absent from the feed arrow
      And A's trail is absent from the continuation the wipe reached

    Scenario: A garrison further along the trail is a firebreak
      Given the feed arrow is player B's territory and is in player A's trail
      And player A has a stack on a further trail arrow of that component
      When the full round accrues
      Then a head owned by B stands on the feed arrow
      And A's trail is absent from the feed arrow
      And A's trail still includes the garrisoned arrow

    Scenario: A birth on a fork stem evaporates both arms
      Given the feed arrow is player B's territory and is the stem of player A's forked trail
      And both arms are empty of A's stacks
      When the full round accrues
      Then A's trail is absent from the stem
      And A's trail is absent from both arms

    Scenario: The newborn remains
      Given an enemy birth-cut as above
      When the full round accrues
      Then the born head is still on the feed arrow
      And no existing head count besides the birth has decreased
