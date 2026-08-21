# language: en
# Overview: docs/spec/seat-vanish-fx/seat-vanish-fx.md
# Adapter only — vanish still clears in the engine; this names and presents it

Feature: Flicker-then-fade when a seat vanishes
  As a player watching a seat leave the match
  I want that seat's remnants to flicker and fade, not to look like a cut
  So that evaporation keeps meaning someone crossed a trail

  Background:
    Given a GameState before and after one applied move
    And a GeometryPort

  Rule: A vanished seat is named, not inferred as a cut

    Scenario: Losing last territory names the loser as vanished
      Given C holds territory, a trail and heads
      And a step of A's leaves C with no pieces
      When events are resolved
      Then a seatVanished names C

    Scenario: The vanished player's remaining trail is not a cut
      Given C holds a trail that the step does not promote to anyone's territory
      And that step leaves C with no pieces
      When events are resolved
      Then no trailCut names C as victim

    Scenario: Disappeared heads are remnant cells
      Given C holds a group on arrow h that is gone after the step
      And no group stands on h after
      And the step leaves C with no pieces
      When events are resolved
      Then seatVanished for C includes h

    Scenario: Captured arrows are not remnant cells
      Given A's step takes C's last territory arrows as A's territory
      And the step leaves C with no pieces
      When events are resolved
      Then those captured arrows are in territoryCaptured for A
      And they are not in seatVanished for C

    Scenario: Converted stacks stay conversion
      Given a C group on arrow k changes owner to A in place
      And the step leaves C with no pieces
      When events are resolved
      Then unitsConverted names k from C to A
      And k is not in seatVanished for C

  Rule: Flicker-then-fade is the overlay

    Scenario: A named vanish with remnants presents as seatVanish
      Given seatVanished for C with at least one remnant arrow
      When those events are presented
      Then there is one seatVanish overlay for C
      And its cells are those remnant arrows

    Scenario: Every remnant cell flickers together
      Given a seatVanish overlay for C with several remnant arrows
      Then every cell has delayMs 0

    Scenario: The overlay names the vanished player
      Given seatVanished for C
      When it is presented
      Then the seatVanish overlay's player is C

    Scenario: An empty remnant is an event without an overlay
      Given seatVanished for C with no remnant arrows
      When it is presented
      Then there is no seatVanish overlay

  Rule: Starvation and a living cut stay distinct

    Scenario: A starvation end of turn names vanish, not a cut
      Given C holds share-free territory, a trail and heads
      And an end of turn leaves C with no pieces
      When events are resolved
      Then a seatVanished names C
      And no trailCut names C as victim

    Scenario: Mid-match vanish still flickers
      Given players A, B and C
      And a step leaves C with no pieces
      And A and B still hold pieces
      When events are resolved and presented
      Then there is a seatVanish overlay for C
      And winner stays unset

    Scenario: A genuine cut of a living player still evaporates
      Given B holds territory, heads and a trail after the step
      And A's step drops some of B's trail
      When events are resolved and presented
      Then a trailCut names B as victim
      And an evaporate overlay names B
      And there is no seatVanished for B
