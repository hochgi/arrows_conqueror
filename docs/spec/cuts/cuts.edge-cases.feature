# language: en
# Overview: docs/spec/cuts/cuts.md
# SPEC §6.1, §6.1a, §11 items 24, 26, 27, 28

Feature: Cuts — firebreak sieges, headless trail, and seams
  As the rules engine
  I want the shapes that look like special cases to resolve as ordinary evaporation
  So that §6.1's claim — forks need no rule of their own — is testable

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: Halt is per arrow, never per point

    Scenario: A head on another arrow of the cut point does not shield against fire
      Given point P has player B's trail on one out-arrow o1
      And a head of player B's stands on a different arrow of P
      And a forward front enters o1
      When the front resolves on o1
      Then the head on the other arrow does not halt that front
      # §6.1 / item 27: combat and fire sit on different axes; point-wide shield withdrawn.

  Rule: Headless trail is ordinary

    Scenario: A mid-trail cut leaves a headless stretch behind the cut
      Given player B's trail runs past point P with no head on the stretch behind P
      When player A cuts at P
      Then the surviving stretch behind the destroyed region remains in player B's trail
      And it may have no head on it
      # §6.1a: no cleanup pass; a head may walk onto it later.

  Rule: Interactions

    Scenario: A cut mid-closure destroys the trail before it can claim
      Given player A's trail is one step from landing on their own territory
      And player B cuts that trail
      When the cut resolves
      Then the destroyed arrows are no longer in player A's trail
      And no new territory of player A's appears from that path
      # P05b's claim needs the trail; evaporation removes it.

    Scenario: Cut after combat on the same step uses the post-combat trail
      Given player A's step onto arrow e1 both contacts an enemy group and crosses that player's trail
      When the step resolves
      Then contact combat is applied first
      And then the cut evaporates against the trail set
      # Trail is independent of heads (§6.1a). Order settled for P06.

  Rule: Purity and determinism

    Scenario: Applying a cut does not mutate the input state
      Given a state S0 in which player A can cut player B
      When I apply the cutting step to S0 yielding S1
      Then S0's trails and groups are unchanged
      And S1's trails differ where the cut destroyed arrows

    Scenario: Equal inputs yield equal ordered trail removals
      Given two states differing only in the insertion order of player B's trail set
      When I apply the same cutting step to each
      Then the two resulting trail sets enumerate equal contents in the same order

    Scenario: No vertex is enumerated
      Given any cut on a fixture board
      When it resolves
      Then no vertex identifier is requested beyond what an idle move requests
