# language: en
# Overview: docs/spec/crossings/crossings.md
# SPEC §2 (the chord test), §6.1a (all-to-all), §11 items 26 and 27

Feature: Crossings — degeneracies, saturation and the determinism of a verdict
  As the author of the rules engine
  I want the subtlest predicate in the game pinned at its boundaries
  So that a wrong-but-plausible reading cannot pass a casual review

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory

  Rule: A saturated point is impassable by arithmetic, not by rule

    Scenario: A triple crossover leaves no slot for an enemy to transit
      Given point P has 3 of player A's trail arrows pointing in
      And P has 3 of player A's trail arrows pointing out
      When I list the out-arrows of P that are not in player A's trail
      Then there are none
      And every traversal of P by player B coincides with one of player A's arrows
      # §2: at a full crossover all six slots are the trail's, so no enemy can
      # transit the point at all. Nothing declares it impassable — the arithmetic
      # leaves nowhere to go.

    Scenario: A crossover is more cuttable than a spine, not less
      Given point P carries a spine of player A's trail
      And point Q carries a crossover of player A's trail
      When I count the chords at each
      Then P presents 1
      And Q presents 4
      And the exits of Q that cross player A outnumber those of P
      # The right sign, and the reason all-to-all was chosen over immunity (§11
      # item 26): more strands through a point means more ways through it. Immunity
      # would have made a crossover a permanent free wall.

  Rule: A trail with nothing on one side of a point presents nothing

    Scenario Outline: No chord exists without both an in-arrow and an out-arrow
      Given point P has <i> of player A's trail arrows pointing in
      And P has <o> of player A's trail arrows pointing out
      When I ask for player A's chords at P
      Then there are <chords> of them
      And no crossing of player A is ever reported at P

      Examples:
        | i | o | chords | why                                    |
        | 1 | 0 | 0      | the tip of a trail, not yet transited  |
        | 0 | 1 | 0      | the first arrow off territory          |
        | 0 | 0 | 0      | the trail does not touch P at all      |

    Scenario: A trail that departs a point it never entered presents no chord
      Given arrow t1 is player A's territory and its target is P
      And player A's trail contains exactly one out-arrow of P and no in-arrow
      When I ask for player A's chords at P
      Then there are none
      # The safety rule (trails spec) means the arrow you departed *from* is
      # territory, not trail — so the first step off home has an out-arrow at that
      # point and no in-arrow. Nothing can cross a trail there yet.

  Rule: The two predicates differ exactly by coincidence

    Scenario: Every interleave is a crossing under both queries
      Given a traversal whose chord interleaves with a trail chord at point P
      When I ask the enemy query and the self query for that pair
      Then both report a crossing
      # chordsCross is chordsInterleave widened by coincidence (chord-test spec).
      # On interleave the two must never disagree.

    Scenario: A coincidence separates them
      Given a traversal whose chord coincides with a trail chord at point P without interleaving
      When I ask the enemy query and the self query for that pair
      Then the enemy query reports a crossing
      And the self query reports none
      # This is the whole difference, and it is the one place a single shared
      # predicate would have been wrong for §7.

  Rule: A verdict is a query — it changes nothing and depends on nothing incidental

    Scenario: Asking for a crossing leaves the state untouched
      Given a state S0 with both players' trails through point P
      When I ask every crossing query at P
      Then S0 is unchanged
      And no trail, occupancy or territory has moved

    Scenario: The verdict does not depend on the order the trail was built
      Given two states whose trail sets contain the same arrows inserted in opposite orders
      When I ask the same traversal's crossing verdict against each
      Then the two verdicts are equal
      And the two chord lists enumerate in the same order
      # ADR 0001 names ordering, not randomness, as the realistic determinism
      # failure. A chord list read straight out of a Set would pass every example
      # above and drift in replay.

    Scenario: The verdict does not depend on which board implementation answers
      Given the same trail authored on two fixture boards that are isomorphic
      When I ask the corresponding traversal's verdict on each
      Then the two verdicts are equal
      # The engine asks slotOf and nothing else, so an isomorphism it cannot see
      # must not change its answer.

  Rule: A crossing needs a traversal, and arriving is not one

    Scenario: Arriving at a point does not cross the trail through it
      Given player B's trail passes through point P
      And player A steps a head onto an in-arrow of P
      When I ask for crossings caused by that step
      Then none is reported at P
      # The step transited the point *behind* it, not P. A head arrives at a point
      # by standing on an in-arrow of it and commits only by choosing an exit.

    Scenario: The step that arrives may still cross at the point behind it
      Given player B's trail passes through point Q
      And player A steps a head across Q onto an in-arrow of P
      When I ask for crossings caused by that step
      Then a crossing is reported at Q if the chords interleave or coincide
      And nothing is reported at P
      # One step, one transited point. Which point is being asked about is the
      # thing most easily got wrong here.
