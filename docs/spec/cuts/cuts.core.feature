# language: en
# Overview: docs/spec/cuts/cuts.md
# SPEC §6.1, §6.1a, §2, §11 items 24, 26, 27, 28

Feature: Cuts — evaporating a trail from a crossing
  As the rules engine
  I want a crossing of an enemy trail to destroy one region of it
  So that sentries price cuts and ambition stays survivable

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: A cut is an ordinary step that crosses an enemy trail

    Scenario: Crossing a spine mid-trail evaporates the region
      Given player B's trail is a run of arrows from their territory through point P
      And no head of player B's stands on that run except possibly at its ends
      And a head of player A's stands on an in-arrow of P
      And exit e1 is an out-arrow of P whose chord crosses player B's trail at P
      When player A steps that head onto e1
      Then the arrows of player B's trail in the destroyed region are no longer in player B's trail
      And player A's trail is unmarked by player B's loss

    Scenario: Landing on a trail arrow is a cut by coincidence
      Given player B's trail uses out-arrow e1 of point P
      And a head of player A's stands on an in-arrow of P
      When player A steps that head onto e1
      Then player B's trail is cut at P
      # §2: coinciding with a trail arrow is a crossing.

    Scenario: Turning aside is not a cut
      Given player B's trail passes through point P
      And a head of player A's stands on an in-arrow of P
      And exit e1 is an out-arrow of P whose chord does not cross player B's trail
      When player A steps that head onto e1
      Then player B's trail is unchanged

    Scenario: A cut does not evaporate the cutter's own trail
      Given player A has a trail of their own
      And player A cuts player B's trail at point P
      When the cut resolves
      Then player A's trail still holds the arrows it held before the cut
      # Exposure is laying trail, not a reflexive cut.

  Rule: One kill per front — a lone head bleeds, a pair is a firebreak

    Scenario: A lone sentry bleeds and the front continues
      Given player B's trail runs past a single head of player B's on arrow s1
      And a cut's front reaches s1 with its kill unspent
      When the front enters s1
      Then that head is destroyed
      And the front continues past s1 with no kill left
      # §6.1 / item 24: the first head spends the kill; it does not halt the front.

    Scenario: A pair of heads halts the front
      Given player B's trail has two heads of player B's on consecutive arrows f1 then f2
      And a cut's front reaches f1 with its kill unspent
      When the front resolves through f1 and f2
      Then one head is destroyed on f1
      And at least one head remains on f2
      And trail beyond f2 is not destroyed by this front
      # The second head is the firebreak.

    Scenario: A second cut on the surviving firebreak rolls on
      Given a firebreak of one remaining head on arrow f2 after a prior cut
      When a later cut's front reaches f2 with a fresh kill
      Then that head is destroyed
      And the front continues into the region beyond

  Rule: All-to-all — a front per branch

    Scenario: A cut behind a fork floods both arms
      Given player B's trail forks at point P into arms X and Y
      And a cut's forward front reaches P
      When the front spreads
      Then a front continues into arm X
      And a front continues into arm Y
      # §6.1a / item 26: every out is fed; each branch carries the parent's remaining kill.

    Scenario: A cut at a join spreads backward into every in-arrow
      Given point P has two of player B's trail in-arrows
      And a cut's backward front reaches P
      When the front spreads
      Then a front continues into each of those in-arrows

  Rule: Territory is a wall; survivors demote

    Scenario: Backward evaporation stops at the victim's territory
      Given player B's trail departs their territory and runs to point P
      And a cut at P sends a backward front toward that territory
      When the front reaches a territory arrow of player B's
      Then it stops
      And no territory arrow is removed from player B's territory

    Scenario: A deep cut demotes the far fragment to stack grade
      Given player B's trail runs from territory through a firebreak to a far tip
      And a cut destroys the territory-side region up to the firebreak
      When the cut resolves
      Then the far fragment remains in player B's trail
      And its anchor grade is stack
      # §6.1 / item 28. Conversion of heads on it is P07 — they keep standing here.
