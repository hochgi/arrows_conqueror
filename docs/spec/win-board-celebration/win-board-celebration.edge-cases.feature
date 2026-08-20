# language: en
# Overview: docs/spec/win-board-celebration/win-board-celebration.md
# SPEC §9 (read) — degenerate over states, in-play leak, purity

Feature: Win board celebration — degenerate over, in-play leak, purity
  As the board adapter
  I want match-over FX to stay a reading of frozen GameState
  So that leftover clocks, empty empires, and online boards cannot invent a second win

  Background:
    Given a GameState and a GeometryPort
    And player labels are styleFor (Player A / Player B)

  Rule: Degenerate boards at match over

    Scenario: Elimination winner with no shares
      Given A is the winner
      And only A has heads remaining
      And A owns no spawner-border territory
      And A has a group on g1
      Then shine is empty
      And pulse includes g1
      And the banner is "Player A wins"

    Scenario: Blockaded winner share still shines
      Given A is the winner
      And share s1 is A territory
      And a B group stands on s1
      Then shine includes s1

    Scenario: Winner open trail is not dimmed
      Given A is the winner
      And A's trail includes u1
      And u1 is not A territory and holds no group
      Then u1 is not dimmed
      And u1 is not in shine unless it is a share

    Scenario: Leftover starvation clock does not rename elimination
      Given A is the winner
      And only A has heads remaining
      And dominationHolder is B with dominationStreak at least dominationN
      Then the banner is "Player A wins"

  Rule: In-play must not leak victory FX

    Scenario: Unset winner never dims
      Given winner is unset
      Then no arrow is match-over dimmed
      And victory pulse is empty

    Scenario: Play highlights vanish only when over
      Given A is the winner
      And a selected stack, a reach set, and a path would otherwise paint
      Then selected, reach, path, movable, and preview washes are not rendered
      And winner groups still receive victory pulse

  Rule: Purity / adapter seams

    Scenario: Equal states list the same shine set
      Given two GameStates that differ only by Map insertion order
      And both have winner A and the same A-owned shares
      Then both shine sets contain the same arrows

    Scenario: Online finished boards use the same helper
      Given an online GET board whose GameState has winner A
      Then Board and Hud consume the same victoryFx as hot-seat
      And no online adapter field is added
      # No new fetch/ADR test — assert the helper is GameState-only.

    Scenario: No splash surface exists
      Given A is the winner
      Then the presentation has no modal, portion-backdrop, or board-covering overlay
      # Helper has no overlay flag; Board/Hud add none. Assert absence of a new
      # backdrop class, not a screenshot.

    Scenario: Rules-core victory is not reimplemented
      Then these tests import no applyElimination or tickDomination
      And packages/rules-core is not in the packet's helper
