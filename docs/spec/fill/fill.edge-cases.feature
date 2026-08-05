# language: en
# Overview: docs/spec/fill/fill.md
# SPEC §7 (even-odd, land bridges), §2 (a trail owns points, not just arrows),
# §6.1a invariant 3, §11 items 4, 26, 34

Feature: Fill — the leaks, the degeneracies and the determinism
  As the author of the rules engine
  I want the shapes that would leak an enclosure to be scenarios rather than hopes
  So that the one rule whose failure is a wrong answer instead of a crash is pinned

  Background:
    Given the generated tiling behind GeometryPort
    And a closed boundary of arrows with territory at both ends

  Rule: A boundary is a curve through points, so it cannot be threaded

    §2: a trail owns the points it passes through, not merely its arrows. Two arrows
    touching at a single point do not leave a gap — that is the diagonal-leak problem
    from flood fill, and under a "did you land on a boundary tile" rule an enemy could
    thread between two boundary arrows without touching either, making every
    enclosure in the game leak.

    Scenario: A probe cannot escape between two boundary arrows meeting at a point
      Given a boundary whose two arrows meet at point P without being tile-adjacent
      And a candidate inside the boundary whose probe transits P
      When I ask whether that candidate is enclosed
      Then it is enclosed
      And the transit of P counted as a crossing
      # The scenario that separates this implementation from a tile-only flood fill.
      # If it fails, every enclosure on the board leaks and nothing else reports it.

    Scenario: A probe that turns aside at a boundary point does not cross there
      Given a boundary presenting one chord at point P
      And a probe that transits P without interleaving with it
      When I count that transit
      Then it is not a crossing
      # §2's other half: a chord that stays on one side is turning aside rather than
      # through. Without it, a probe running alongside the curve would count crossings
      # it never made.

  Rule: Concave and nested shapes

    Scenario: A concave region encloses its whole interior
      Given a boundary with an inward-pointing lobe
      When I ask which arrows it encloses
      Then every arrow of the interior is enclosed, including those in the lobe's shadow
      # Where a straight-probe implementation with a fixed direction would go wrong,
      # and where parity does not.

    Scenario: An arrow inside a hole inside a region is not enclosed
      Given a boundary that encircles a region and then encircles a hole within it
      When I ask whether an arrow in the hole is enclosed
      Then it is not enclosed
      And its escaping probe crossed the boundary twice

  Rule: A boundary that is not closed has no interior

    Scenario Outline: An open boundary encloses nothing
      Given a boundary that is <shape>
      When I ask which arrows it encloses
      Then it encloses none

      Examples:
        | shape                                                  |
        | a path with one end on territory and one end dangling  |
        | a path with neither end on territory                   |
        | a single arrow                                         |

      # A land bridge never reaches this file at all — closure's walk dead-ended, so
      # there is no closed curve to take a parity of. The question is not askable
      # rather than the answer being empty, and these cases exist so that an
      # implementation handed one fails loudly instead of guessing.

  Rule: Queries only

    Scenario: Asking for a verdict changes nothing
      Given a boundary and a state
      When I ask the verdict for every arrow in the boundary's window
      Then the state is unchanged

    Scenario: The verdict does not depend on the order the boundary set was built
      Given two boundary sets containing the same arrows inserted in opposite orders
      When I fill each
      Then the two results contain the same arrows
      And they enumerate in the same order
      # ADR 0001. The boundary is a Set and the result is an ordered answer derived
      # from one, which is exactly where insertion order hides — it passes every
      # example above and surfaces only as replay drift.

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

    Scenario: A finite board reports nothing enclosed, and that is the theorem
      Given a fixture board instead of the tiling
      And a boundary on it that plainly encircles an arrow
      When I ask whether that arrow is enclosed
      Then no escaping probe exists, because straight-ahead is a bijection on a finite board
      # Recorded as a scenario rather than a comment because it is the reason this
      # packet's harness differs from every earlier one (§11 items 4 and 30, and P02's
      # finiteness measurement). It is also a live guard: if someone later points this
      # suite at a fixture to make it faster, this is what tells them why not.
