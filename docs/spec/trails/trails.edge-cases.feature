# language: en
# Overview: docs/spec/trails/trails.md
# SPEC §5, §6.1a (trail invariants), §6.1 (grades), §11 items 21–24, 27
#
# ARCHIVE NOTE (P22): Branch-toll / mandate scenarios below are historical.
# Live branching/dormant rules: docs/spec/trails-simple/. Tests assert P22.

Feature: Trails — the anchor a move may not strip, and the states damage leaves behind
  As the author of the rules engine
  I want the branch mandate checked against what a move changes and nothing else
  So that a state combat legally produced does not make every later move illegal

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: The mandate constrains what you may leave, so it is local to the move

    This is the rule's whole subtlety. §5 says outright that it "constrains what
    you may leave, not what may exist", and that a branch point damage emptied is a
    legal state. A mandate read as a standing invariant over the trail would make
    the first such cut freeze the board — every subsequent move would be illegal
    for a violation it did not cause and cannot repair.

    Scenario: Stepping away from a branch anchor is refused
      Given point P is a join in player A's trail
      And arrow n1 is the in-arrow paying for that join
      And n1 holds exactly 1 head belonging to player A
      When player A tries a step of count 1 from n1 to any legal exit
      Then the step is refused with a contract violation
      And the message names the branch it would have stripped
      # This is where the split anchor bites. Arriving paid it; leaving must not
      # un-pay it.

    Scenario: Stepping away from a branch anchor while leaving a head is legal
      Given point P is a join in player A's trail
      And arrow n1 is the in-arrow paying for that join
      And n1 holds 2 heads belonging to player A
      When player A applies a step of count 1 from n1 to a legal exit
      Then the step succeeds
      And n1 holds 1 head belonging to player A

    Scenario: An already-unanchored branch does not freeze the board
      Given point P is a join in player A's trail
      And no head of player A's stands on either in-arrow of P
      And player A holds a group elsewhere with allowance remaining
      When player A applies a legal step with that group
      Then the step succeeds
      # The distinguishing case. Damage can empty a branch point (§5, §6.1) and the
      # resulting state is legal — it simply could not have been created
      # deliberately. Nothing needs repairing, because §6.1's spread is total with
      # or without anchors.

    Scenario: A move elsewhere is not charged for a branch it does not touch
      Given point P is a join in player A's trail, properly anchored
      And player A holds a group on an arrow that is not an anchor of any branch
      When player A applies a legal step with that group
      Then the step succeeds
      And the anchor on P's paying in-arrow is untouched

    Scenario: A singleton may leave a territory-rooted home fork
      Given point P is a live territory root for player A
      And player A's trail has two out-arrows of P
      And one of those out-arrows holds exactly 1 head belonging to player A
      And the other out-arrow holds none
      When player A applies a step of count 1 from that singleton
      Then the step succeeds
      # Territory anchors both arms — same reading as bare trail from home.

    Scenario: A mid-trail split without a territory root still demands its head
      Given point P is a split in player A's trail and is not a territory root
      And one out-arrow of P holds exactly 1 head belonging to player A
      When player A tries a step of count 1 from that out-arrow
      Then the step is refused with a contract violation

  Rule: A lone head is an anchor, not a brancher

    §5 does not contain a clause about single heads. It contains a bill a single
    cannot afford, which is a different and better thing — the same rule that
    prices a fork also answers "what if the tip is too small to pay?"

    Scenario Outline: A lone head is refused every branching move
      Given arrow n1 holds exactly 1 head belonging to player A
      And the move would make point P <branch>
      When player A tries that step
      Then the step is refused with a contract violation
      And n1 still holds 1 head belonging to player A

      Examples:
        | branch                                      |
        | a join — a second trail in-arrow            |
        | a crossover — a join and a split at once    |

    Scenario: A lone head may still lay ordinary linear trail
      Given arrow n1 holds exactly 1 head belonging to player A
      And exit n2 is neutral and makes no branch at the target of n1
      When player A applies a step of count 1 from n1 to n2
      Then the step succeeds
      And player A's trail contains n2
      # Linear trail carries no heads (§5). The bill is for branching only.

    Scenario: A pair may cross over, and arrives with nothing left to continue
      Given arrow n1 holds exactly 2 heads belonging to player A
      And the move would make point P a crossover
      When player A applies that step with count 1
      Then the step succeeds
      And one head stands on each side of P
      And no further step of player A's is legal through P this turn

  Rule: Two players' trails may share an arrow

    A crossing is legal. The trail map can represent an arrow in two trails
    (authored overlap, or the instant between mark and evaporate). P12 makes
    that overlap transient: landing on an enemy trail arrow is a cut by
    coincidence (SPEC §2).

    Scenario: Stepping onto an empty enemy trail arrow cuts it
      Given arrow x1 is in player B's trail and is empty
      And arrow n1 is in player A's trail and holds 1 head belonging to player A
      And x1 is an out-arrow of the target of n1
      When player A applies a step of count 1 from n1 to x1
      Then x1 is in player A's trail
      And x1 is no longer in player B's trail
      # P12: coincide evaporates the victim. The mover still marks the landing.

    Scenario: An arrow in two trails is still one arrow of occupancy
      Given arrow x1 is in both players' trails
      And x1 holds 1 head belonging to player A
      When player B tries a step of count 1 onto x1
      Then the step is refused with a contract violation
      # P04's rule is untouched: contact is combat (P06), and trail marking does
      # not make an occupied arrow enterable.

  Rule: Trail marking is idempotent and order-free

    Scenario: Marking an arrow already in your trail is not an error
      Given player A's trail contains n1
      And a head of player A's re-enters n1 by a legal step
      When the step is applied
      Then the step succeeds
      And player A's trail is unchanged
      And no duplicate of n1 exists anywhere in the state

    Scenario: Territory is never also your own trail
      Given arrow t1 is player A's territory
      When a head of player A's steps onto t1
      Then t1 is not in player A's trail
      And t1 is still player A's territory
      # The safety rule's one test. An arrow cannot be both safe and exposed for
      # the same player.

  Rule: Grade degeneracies

    Scenario: A trail touching your territory and a fragment touching only a stack
      Given player A's trail has two disconnected stretches
      And the first touches player A's territory
      And the second touches only a group of player A's
      When I ask the grade of an arrow in each
      Then the first is territory grade
      And the second is stack grade
      # Grades are per-stretch, not per-player. A player may hold both at once, and
      # §6.1's cut-depth rule is built on exactly that.

    Scenario: Re-attaching a fragment promotes it
      Given a stretch of player A's trail is stack grade
      And player A lays a fresh trail from their territory that meets that stretch
      When I ask the grade of the far end of the stretch
      Then it is territory grade
      # §6.1: a demoted fragment is a wall waiting for a road. No special
      # machinery — the ordinary reachability question answers it.

    Scenario: An enemy stack standing on your trail does not anchor it
      Given player A's trail runs n1, n2, n3
      And n2 holds 2 heads belonging to player B
      And none of the stretch touches player A's territory
      When I ask the grade of n3 for player A
      Then it is dormant
      # A grade is about whose heads and whose territory. An enemy standing on your
      # trail is a problem, not an anchor.

  Rule: apply is pure

    Scenario: Marking trail does not mutate the input state
      Given a state S0 with player A's group on n1
      And a legal step m from n1 onto neutral ground
      When I apply m to S0 yielding S1
      Then S0's trail set is unchanged
      And S1's trail set contains the destination

    Scenario: Two equal applies agree exactly
      Given two identical copies of a state S
      And a legal step m that marks trail and pays a branch
      When I apply m to each copy
      Then the two resulting states are equal
      And the two trail sets enumerate in the same order
      # ADR 0001: a trail is a Set, and any ordered answer derived from one must be
      # sorted on a total key. Insertion order is the realistic determinism
      # failure and it surfaces only as replay drift.
