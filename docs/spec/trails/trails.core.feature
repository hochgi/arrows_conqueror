# language: en
# Overview: docs/spec/trails/trails.md
# SPEC §5 (safety rule, sentries, branching costs an anchor), §6.1a (trail is a set),
# §6.1 (the two grades of anchor), §11 items 21–24, 27

Feature: Trails, sentries and the anchor a branch costs
  As a player advancing heads off my own ground
  I want the board to remember where I have been, and to charge me for forking
  So that exposure, garrisoning and branch shape are real decisions before
  closure or combat enter the game

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: A step marks its destination unless that destination is already your territory

    This is SPEC §5's safety rule in one test on the destination. Everything about
    exposure follows from it, and stating it as one test is what keeps the four
    combinations below from needing four rules.

    Scenario: Stepping off your own territory starts a trail
      Given arrow t1 is player A's territory and holds 1 head belonging to player A
      And exit n1 is an out-arrow of the target of t1
      And n1 is neutral ground
      When player A applies a step of count 1 from t1 to n1
      Then player A's trail is exactly { n1 }
      And t1 is still player A's territory
      And t1 is not in player A's trail

    Scenario: A trail extends onto the next neutral arrow
      Given arrow n1 is in player A's trail and holds 1 head belonging to player A
      And exit n2 is an out-arrow of the target of n1
      And n2 is neutral ground
      When player A applies a step of count 1 from n1 to n2
      Then player A's trail is exactly { n1, n2 }
      # The arrow the head vacated stays trail. A trail is where you have been,
      # not where you are.

    Scenario: Moving inside your own territory marks nothing
      Given arrow t1 is player A's territory and holds 2 heads belonging to player A
      And exit t2 is an out-arrow of the target of t1
      And t2 is player A's territory
      When player A applies a step of count 2 from t1 to t2
      Then player A's trail is empty
      # §5: moving inside your own closed territory lays no trail and costs no
      # exposure. Free, trail-less, safe movement.

    Scenario: Stepping into enemy territory marks trail
      Given arrow n1 is in player A's trail and holds 1 head belonging to player A
      And exit e1 is an out-arrow of the target of n1
      And e1 is player B's territory and is empty
      When player A applies a step of count 1 from n1 to e1
      Then player A's trail is exactly { n1, e1 }
      And e1 is still player B's territory
      # §7: enemy territory is hostile ground — enterable, and exposing while you
      # are on it. Only your *own* territory is safe.

    Scenario: The arrow a head stands on is trail
      Given arrow t1 is player A's territory and holds 1 head belonging to player A
      And exit n1 is an out-arrow of the target of t1
      And n1 is neutral ground
      When player A applies a step of count 1 from t1 to n1
      Then n1 holds 1 head belonging to player A
      And n1 is in player A's trail
      # §6.1 halts an evaporation front "when it meets a head on the arrow it is
      # entering", and heads stand on trail. The tip is marked, not the arrow
      # behind it.

  Rule: A trail is a set

    Scenario: Re-traversing an arrow you already hold adds nothing
      Given player A's trail is exactly { n1, n2, n3 }
      And arrow n3 holds 1 head belonging to player A
      And n1 is an out-arrow of the target of n3
      When player A applies a step of count 1 from n3 to n1
      Then player A's trail is exactly { n1, n2, n3 }
      And n1 holds 1 head belonging to player A
      # §6.1a invariant 2. Legal, and it adds nothing — which is what makes fill
      # read the same boundary however many times a head walked it.

    Scenario: A lagging group standing on ground the front group laid is not re-tracing
      Given arrow n1 holds 2 heads belonging to player A
      And a path of two successive out-arrows n2, n3 each neutral
      When player A steps 1 head from n1 to n2
      And player A steps that head from n2 to n3
      And player A steps the remaining head from n1 to n2
      Then player A's trail is exactly { n1, n2, n3 }
      And n2 holds 1 head belonging to player A
      And n3 holds 1 head belonging to player A
      # §11 item 22: invariant 2 constrains the trail's arrow set, not where heads
      # walk. This is how a spearhead brings its firebreaks along.

    Scenario: Two different walks over the same arrows leave the same trail
      Given player A walks a head from territory through n1, n2, n3
      And player B walks a head from territory through n3, n2, n1 on a mirrored board
      When I compare the two trails as sets
      Then they contain the same arrows
      And neither records the order it was laid in

  Rule: Branching costs an anchor — one before a join, one after a split

    §5's mandate, and the only head the rules ever require (§11 item 23). It
    constrains what you may *leave*, so it is checked against what the move
    changes, never against the whole trail.

    Scenario: Forming a join requires a head on the arrow you arrived by
      Given point P already has one in-arrow in player A's trail
      And arrow n1 holds 2 heads belonging to player A
      And n1 is not yet in player A's trail
      And the target of n1 is P
      When player A applies a step of count 1 from n1 to a neutral out-arrow of P
      Then the step succeeds
      And n1 holds 1 head belonging to player A
      # The join is at P, and n1 is the second in-arrow. One head stays on n1.

    Scenario: Forming a join with the whole stack is refused
      Given point P already has one in-arrow in player A's trail
      And arrow n1 holds 2 heads belonging to player A
      And the target of n1 is P
      When player A tries a step of count 2 from n1 to a neutral out-arrow of P
      Then the step is refused with a contract violation
      And the message names the unpaid join

    Scenario: Forming a split requires a head on the arrow you departed onto
      Given point P already has one out-arrow in player A's trail
      And arrow n1 holds 1 head belonging to player A
      And the target of n1 is P
      And n1 is already in player A's trail
      And exit n2 is a second out-arrow of P and is neutral
      When player A applies a step of count 1 from n1 to n2
      Then the step succeeds
      And n2 holds 1 head belonging to player A
      # The movers land on the new arm, so the split's anchor is paid by arriving.
      # What it costs is the *next* move — see the edge cases.

    Scenario: A crossover pays both anchors
      Given point P is already a crossover candidate for player A
      And P has one in-arrow and one out-arrow in player A's trail
      And arrow n1 holds 2 heads belonging to player A
      And n1 is a second in-arrow of P and is not yet in player A's trail
      And exit n2 is a second out-arrow of P and is neutral
      When player A applies a step of count 1 from n1 to n2
      Then the step succeeds
      And n1 holds 1 head belonging to player A
      And n2 holds 1 head belonging to player A
      And nothing of player A's continues past P this turn
      # §5: a crossover is a join followed by a split, so it costs both. A 2-stack
      # pays its whole self and ends with one head each side.

    Scenario: A lone head cannot form a join
      Given point P already has one in-arrow in player A's trail
      And arrow n1 holds exactly 1 head belonging to player A
      And the target of n1 is P
      When player A tries a step of count 1 from n1 to a neutral out-arrow of P
      Then the step is refused with a contract violation
      And n1 still holds 1 head belonging to player A
      # §5: it pays its only head and stops there, becoming the anchor rather than
      # passing through. Too small to pay and unable to act are the same state.

  Rule: A trail is held live by territory, or by a stack, or by nothing

    §6.1's two grades. Only the reachability question lives here — what each grade
    permits is P05b's (closure) and P06's (evaporation).

    Scenario: A trail reaching your own territory is territory grade
      Given arrow t1 is player A's territory
      And player A's trail runs n1, n2, n3 with n1 adjacent to t1
      When I ask the grade of n3 for player A
      Then it is territory grade

    Scenario: A trail reaching only your own stack is stack grade
      Given player A holds no territory adjacent to their trail
      And player A's trail runs n1, n2, n3
      And n2 holds 2 heads belonging to player A
      When I ask the grade of n3 for player A
      Then it is stack grade
      # §6.1: a fragment that survived a cut is anchored on its own stack — live,
      # not dormant, and worth a land bridge if it can be driven home.

    Scenario: A trail reaching neither is dormant
      Given player A's trail runs n1, n2, n3
      And no head of player A's stands on any of them
      And none of them touches player A's territory
      When I ask the grade of n3 for player A
      Then it is dormant
      # §6.1a: headless trail is ordinary. A wall that claims nothing, charges
      # nothing, and can be walked onto again.

    Scenario: Grade ignores the grain
      Given player A's trail runs n1, n2, n3 with n1 adjacent to player A's territory
      When I ask the grade of n1 for player A
      Then it is territory grade
      When I ask the grade of n3 for player A
      Then it is territory grade
      # Connectivity is undirected. §7's pincer: enclosure is a property of the
      # curve, not of the flow along it — and §6.1 re-attaches a fragment by laying
      # a path *to* it, against the direction it was laid.

  Rule: Trail and territory outlive the turn

    Scenario: End-turn clears spent, not the board's memory
      Given player A's trail is exactly { n1, n2 }
      And arrow t1 is player A's territory
      When player A ends the turn
      Then player A's trail is exactly { n1, n2 }
      And t1 is still player A's territory
      And every spent counter is 0
      # P04 clears spent and merge overrides at the boundary. Trail and territory
      # are state, not per-turn accounting.
