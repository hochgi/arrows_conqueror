# language: en
# Overview: docs/spec/fill/fill.md
# SPEC §7, §2 (a trail owns points, not just arrows), §6.1a invariant 3,
# §11 items 4, 26, 34, 36

Feature: Fill — the leaks, the degeneracies and the determinism
  As the author of the rules engine
  I want the shapes that would leak an enclosure to be scenarios rather than hopes
  So that the one rule whose failure is a wrong answer instead of a crash is pinned

  Background:
    Given the generated tiling behind GeometryPort
    And a set of arrows held by player A as territory

  Rule: Concave, nested and multiply-ringed shapes

    Scenario: A concave pocket is enclosed to its last arrow
      Given player A's claim rings a pocket with an inward-pointing lobe
      When I ask which arrows it encloses
      Then every arrow of the pocket is enclosed, including those in the lobe's shadow
      # Where a fixed-direction probe would have gone wrong and reachability does not.

    Scenario: An arrow in a hole ringed inside a pocket is enclosed as well
      Given player A's claim rings a pocket, and a second ring inside it fences off a hole
      And the hole's ground is not player A's
      When I ask whether an arrow in the hole is enclosed
      Then it is enclosed
      And every arrow of the pocket between the two rings is enclosed
      # Both rings are player A's ground, so no walk out of the hole escapes — the inner
      # ring stops it before the outer one is reached, and *enclosed* asks nothing else
      # (§11 item 36). This is the same shape as fill.core's "two separate rings around
      # one region": the withdrawn even-odd reading called the hole *outside* on the
      # second crossing, and that reading is exactly what item 36 removed.

  Rule: A claim that rings nothing encloses nothing

    Scenario Outline: An unclosed claim encloses nothing
      Given player A's claim is <shape>
      When I ask which arrows it encloses
      Then it encloses none

      Examples:
        | shape                                     |
        | a single arrow                            |
        | a straight run of arrows                  |
        | a run with a spur, closing nothing        |

      # §7's land bridge, and it needs no branch of its own: the path is claimed by
      # closure either way, and fill simply finds nothing surrounded.

  Rule: Queries only

    Scenario: Asking for a verdict changes nothing
      Given a claim and a state
      When I ask the verdict for every arrow in the claim's window
      Then the state is unchanged

    Scenario: The verdict does not depend on the order the claim was built
      Given two claims containing the same arrows inserted in opposite orders
      When I fill each
      Then the two results contain the same arrows
      And they enumerate in the same order
      # ADR 0001. The claim is a Set and the result is an ordered answer derived from
      # one, which is exactly where insertion order hides — it passes every example
      # above and surfaces only as replay drift.

    Scenario: No vertex is enumerated
      Given any fill on the generated tiling
      When it resolves
      Then no vertex identifier was requested from GeometryPort
      # §11 item 34: a special's ownership is a *reading* of its three bordering
      # arrows. A fill that touched a vertex would be a second copy of a fact it is
      # supposed to derive, and the two could drift.

    Scenario: Every chord endpoint came from slotOf
      Given any fill on the generated tiling
      When it resolves
      Then every chord it built read its slots from GeometryPort
      And no slot was inferred from an arrow identifier
      # Identifiers are opaque (P01 D1). An engine that parsed one would pass on the
      # tiling — where ids are structured — and fail on any other board.

  Rule: This suite cannot run on a fixture board

    Scenario: A finite board has no infinity to fail to reach
      Given a fixture board instead of the tiling
      And a claim on it that plainly rings an arrow
      When I ask whether that arrow is enclosed
      Then the question is not answerable, because the board has no outside
      # Recorded as a scenario rather than a comment because it is the reason this
      # packet's harness differs from every earlier one (§11 items 4, 30 and 36, and
      # P02's finiteness measurement). It is also a live guard: if someone later points
      # this suite at a fixture to make it faster, this is what tells them why not.
