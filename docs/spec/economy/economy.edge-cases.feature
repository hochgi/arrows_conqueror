# language: en
# Overview: docs/spec/economy/economy.md
# SPEC §7, §11 items 13, 41

Feature: Spawner economy — capture reset, double-feed, purity
  As the rules engine
  I want capture and compound feeds pinned
  So that border churn stays sterile and irregularity stays exact

  Background:
    Given a board behind GeometryPort
    And authored spawners with forces

  Rule: Reset on capture

    Scenario: Claiming an arrow clears its accumulator
      Given an arrow with a non-zero accumulator
      When a closure claims that arrow for another owner
      Then its accumulator is 0

  Rule: Double-fed arrows

    Scenario: Two spawners may add to the same arrow in one round
      Given two spawners whose round-robin both land on the same owned arrow
      When the full round accrues
      Then that arrow's accumulator gains the sum of both forces exactly

  Rule: Unowned feed

    Scenario: A feed arrow with no territory owner accrues nothing
      Given the RR lands on an unowned arrow
      When the full round accrues
      Then no head appears there
      And no accumulator is stored for that arrow

  Rule: Purity

    Scenario: Accrual does not mutate the input state
      Given a state S0 at the end of a full round
      When endTurn accrues yielding S1
      Then S0 is unchanged
