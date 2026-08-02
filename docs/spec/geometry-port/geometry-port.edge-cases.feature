# language: en
# Overview: docs/spec/geometry-port/geometry-port.md
# SPEC §2 (torus topology, orientation pattern), §11 item 1

Feature: GeometryPort conformance — boundaries and degeneracies
  As the rules core
  I want the port to be uniform, non-degenerate and order-stable
  So that no rule ever needs to special-case where it is on the board

  Background:
    Given a board obtained from a conforming GeometryPort

  Rule: There is no rim

    The board is a torus specifically so that balance holds everywhere. A hard
    edge would break 3-in/3-out at the boundary, which would break the Eulerian
    argument, which would break the guarantee that no head is stranded. Wrap is
    therefore invisible through the port — there is no seam to query and no
    "is this an edge point" to ask.

    Scenario: Every point is indistinguishable from every other by degree
      When I enumerate every point on the board
      Then no point has fewer than 3 in-arrows
      And no point has fewer than 3 out-arrows

    Scenario: The port exposes no notion of a boundary
      When I inspect the port's surface
      Then it offers no way to ask whether a point is on an edge
      And it offers no way to ask whether an arrow crosses a seam

    Scenario: A path may return to its origin without reversing
      Given any point on the board
      When I follow arrows forward without ever repeating an arrow
      Then I can return to that point

  Rule: Degenerate boards are not conforming

    A torus can be made too small to be a lattice. These scenarios pin the
    failures that a 1x1 or 1x2 modulus would produce, so that an implementation
    cannot quietly hand the rules core a board on which girth is 1 and an
    arrow's two flanks are the same vertex.

    Scenario: No arrow is a self-loop
      When I enumerate every arrow on the board
      Then no arrow has the same point as its origin and its target

    Scenario: No arrow flanks the same vertex twice
      When I enumerate every arrow on the board
      Then that arrow's two flank vertices are distinct

    Scenario: No two arrows share both endpoints in the same direction
      When I enumerate every ordered pair of points on the board
      Then at most one arrow runs from the first to the second

    Scenario: A board too small to satisfy the above is rejected
      When a board is constructed below the minimum modulus
      Then construction fails
      And the failure names which invariant could not hold

  Rule: Minimal cycles are exactly the pinwheels

    Girth 3 alone is not quite enough. It matters that the 3-cycles *are* the
    lattice triangles, because that is what makes "the smallest enclosable
    territory holds exactly one spawner" true rather than merely usually true.

    Scenario: Every directed 3-cycle encloses exactly one vertex
      When I enumerate every directed cycle of length 3 on the board
      Then each encloses exactly one vertex
      And the three arrows of that cycle are the three arrows bordering it

    Scenario: No two distinct 3-cycles enclose the same vertex
      When I enumerate every directed cycle of length 3 on the board
      Then each vertex is enclosed by at most one of them

  Rule: Queries are order-stable

    ADR 0001 names ordering, not randomness, as the realistic determinism
    failure. A port that returns adjacency in a different order on two calls
    produces a rules engine that passes every unit test and drifts in replay.

    Scenario: Repeated adjacency queries return identical sequences
      Given any point on the board
      When I query its out-arrows twice
      Then both queries return the same arrows in the same order

    Scenario: Two ports built from the same description agree exactly
      Given two ports constructed from the same board description
      When I enumerate every point, arrow and vertex from each
      Then the two enumerations are identical in content and order

    Scenario: Adjacency order does not depend on query history
      Given any point on the board
      When I query many other points' adjacency first
      And I then query that point's out-arrows
      Then the result is the same as querying it first

  Rule: Foreign identifiers are rejected, not guessed

    Opaque ids mean the rules core cannot construct one — but a fixture board
    and a generated board coexist in the same test run, and an id from one must
    never silently resolve against the other.

    Scenario Outline: A query with an unknown identifier fails loudly
      When I query <query> with an identifier from a different board
      Then the query fails
      And it does not return a plausible-looking result

      Examples:
        | query          |
        | out-arrows     |
        | in-arrows      |
        | origin         |
        | target         |
        | flank vertices |
        | border arrows  |
