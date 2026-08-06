# language: en
# Overview: docs/spec/fill/fill.md
# SPEC §7 (the fill needs a plane, self-crossings claim what they ring), §2 (the chord
# test), §6.1a invariant 3, §11 items 4, 16, 30, 36

Feature: Fill — the pockets your own ground rings
  As the author of the rules engine
  I want enclosure decided by whether a pocket can reach infinity
  So that a self-loop claims what it rings and no enclosure leaks at a point

  Background:
    Given the generated tiling behind GeometryPort
    And a set of arrows held by player A as territory

  Rule: Enclosed means cannot reach infinity

    §11 item 36. The wall is the player's ground, not a curve through it — which is
    why there is no parity, no outline arc and no degenerate probe.

    Scenario: An arrow ringed by territory is enclosed
      Given player A's territory forms a ring around at least one arrow
      When I ask which arrows it encloses
      Then the ringed arrow is enclosed

    Scenario: An arrow beside an open arc is not enclosed
      Given player A's territory forms an arc that does not close
      When I ask which arrows it encloses
      Then it encloses none
      # A strip has no inside. This is §7's land bridge from fill's side: nothing was
      # ringed, so nothing is claimed beyond the path itself.

    Scenario: Every arrow of a pocket is enclosed, and nothing outside it
      Given player A's territory rings a pocket of several arrows
      When I ask the verdict for every arrow within the claim's window
      Then exactly the arrows of that pocket are enclosed

    Scenario: The minimal closure rings no arrow at all
      Given the three arrows bordering one vertex, forming a directed cycle, are player A's territory
      When I ask which arrows they enclose
      Then they enclose none
      # §11 item 16: the lattice triangle is the *minimum enclosable territory* and its
      # three arrows **are** the ring — zero tiles inside is correct. §7 is what makes
      # it worth taking anyway: the spawner comes from the three bordering arrows in
      # thirds, and nothing here enumerates the vertex to find that out (§11 item 34).

  Rule: A pocket does not leak at a point

    §2's chord test, and the one piece of the withdrawn even-odd formulation that
    survives intact. Without it every enclosure in the game leaks.

    Scenario: A walk cannot escape between two territory arrows meeting at a point
      Given two of player A's territory arrows meet at point P without being tile-adjacent
      And an arrow inside the ring whose only route out transits P
      When I ask whether that arrow is enclosed
      Then it is enclosed
      # **The scenario that separates this from a tile-only flood fill.** If it fails,
      # every enclosure leaks through the seam between two trail arrows and nothing
      # else in the suite reports it.

    Scenario: A walk may pass a territory point it does not cross
      Given player A's territory presents one chord at point P
      And a walk that transits P without interleaving with it
      When I take that step
      Then it is not blocked
      # §2's other half: a chord that stays on one side is turning aside rather than
      # through. Without it a pocket would be sealed by ground it merely runs past.

  Rule: A self-loop claims what it rings

    §7, corrected by §11 item 36: crossing your own trail doesn't close anything on
    the spot, but once the path is claimed the loop is a ring of the player's own
    ground with a bounded inside.

    Scenario: A crossover on an otherwise bare bridge claims the loop
      Given player A's claim runs from one holding to another and crosses itself once
      When I ask which arrows it encloses
      Then the arrows the loop rings are enclosed
      # The consequence that decided item 36. Under the withdrawn parity reading this
      # trail was a bare strip; under reachability the loop is ground and the inside
      # is surrounded.

    Scenario: Two separate rings around one region claim the whole interior
      Given player A's claim rings the same region with two separate loops
      When I ask whether an arrow in that region is enclosed
      Then it is enclosed
      # **The shape that told the two readings apart.** Parity called this core
      # *outside* — two crossings, even — and reachability calls it surrounded, which
      # is what a player would predict. Re-walking one ring cannot produce the shape:
      # a trail is a set and re-traversal adds nothing (§6.1a invariant 2).

  Rule: The verdict does not depend on the route

    Scenario: Two different escape attempts agree
      Given an arrow outside player A's claim
      When I search for an escape by two different routes
      Then both find one

    Scenario: An arrow with no route out is enclosed
      Given a pocket whose every exit point is sealed by player A's own arrows
      When I ask whether an arrow in it is enclosed
      Then it is enclosed
      # Saturation is already impassable by arithmetic (crossings): all six slots are
      # the claim's, so no walk can transit at all. Enclosed is the right answer and
      # no rule had to say so.

  Rule: The sweep is bounded by the ground that rings, not by the board

    Scenario: The sweep looks no further than the ring can reach
      Given a claim of L arrows
      When it is filled
      Then the region examined is bounded by a window derived from that run of L
      And no board extent was read
      # §7: a closed run of L arrows cannot surround more than O(L²), so the sweep is
      # finite though the board is not — and §11 item 4 means there is no extent to read.

    Scenario: A holding elsewhere on the board does not move the sweep
      Given player A's ground rings a pocket
      And player A also holds an arrow far away, which rings nothing
      When I ask which arrows it encloses
      Then the pocket is still enclosed
      # The bound belongs to the run of arrows that actually rings the pocket. Sizing and
      # centring one window on the player's whole ground instead let a distant second
      # holding drag the sweep off the closure, and the pocket read as escaping — a wrong
      # answer rather than a crash, which is this rule's whole reason for existing.

    Scenario: An arrow far outside a small claim is never examined
      Given a claim of three arrows
      When it is filled
      Then an arrow many steps away is not enclosed
      And it was not examined
