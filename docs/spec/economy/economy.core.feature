# language: en
# Overview: docs/spec/economy/economy.md
# SPEC §7, §11 item 41

Feature: Spawner economy — full-round accrual
  As the rules engine
  I want spawners to feed owned arrows once per full round
  So that production is exact, deterministic, and blockade-aware

  Background:
    Given a board behind GeometryPort
    And authored spawners with forces
    And it is player A's turn

  Rule: Accrual ticks once per full round

    Scenario: endTurn by the first player does not accrue
      Given a spawner with force 1/3 and phase 0
      And its first border arrow is owned by A
      When player A ends the turn
      Then no accumulator advances
      And the spawner phase is unchanged

    Scenario: Completing a full round advances every spawner once
      Given a spawner with force 1/3 and phase 0
      And its first border arrow is owned by A
      When player A ends the turn and player B ends the turn
      Then that arrow's accumulator gains 1/3
      And the spawner phase advances by 1

  Rule: Carry remainder and spawn

    Scenario: Accumulator at or above 1 emits a head and carries the rest
      Given an owned feed arrow whose accumulator plus this tick's force reaches or exceeds 1
      When the full round accrues
      Then a head of the territory owner appears or merges on that arrow
      And the accumulator equals the fractional remainder

    Scenario: Spawn onto a friendly stack does not set speedOverride
      Given the feed arrow already holds a friendly stack with spent 0 and no override
      When a head spawns onto it
      Then the stack grows by the born heads
      And speedOverride remains absent
      # §11 item 41.

  Rule: Enemy blockade

    Scenario: An enemy head on the feed arrow loses that share's force
      Given the RR lands on an arrow owned by A but occupied by B
      When the full round accrues
      Then that arrow's accumulator is unchanged
      And the spawner phase still advances
