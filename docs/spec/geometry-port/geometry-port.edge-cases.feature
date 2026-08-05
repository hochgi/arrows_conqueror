# language: en
# Overview: docs/spec/geometry-port/geometry-port.md
# SPEC §2 (the board is unbounded, orientation pattern), §11 items 1, 4

Feature: GeometryPort conformance — boundaries and degeneracies
  As the rules core
  I want the port to be uniform, non-degenerate and order-stable
  So that no rule ever needs to special-case where it is on the board

  Background:
    Given a board obtained from a conforming GeometryPort
    And a window grown from the port's seed point

  Rule: There is no rim

    The board is unbounded specifically so that balance holds everywhere. A hard
    edge would break 3-in/3-out at the boundary, which would break the Eulerian
    argument, which would break the guarantee that no head is stranded. The
    board's extent is therefore invisible through the port — there is no seam to
    query and no "is this an edge point" to ask.

    Scenario: Every point is indistinguishable from every other by degree
      When I enumerate every point in the window
      Then no point has fewer than 3 in-arrows
      And no point has fewer than 3 out-arrows

    Scenario: The port exposes no notion of a boundary
      When I inspect the port's surface
      Then it offers no way to ask whether a point is on an edge
      And it offers no way to ask how large the board is

    Scenario: A path may return to its origin without reversing
      Given any point in the window
      When I follow arrows forward without ever repeating an arrow
      Then I can return to that point

  Rule: Degenerate boards are not conforming

    These scenarios pin failures a malformed board would produce, so that an
    implementation cannot quietly hand the rules core a board on which girth is 1
    or an arrow's two flanks are the same vertex.

    Scenario: No arrow is a self-loop
      When I enumerate every arrow in the window
      Then no arrow has the same point as its origin and its target

    Scenario: No arrow flanks the same vertex twice
      When I enumerate every arrow in the window
      Then that arrow's two flank vertices are distinct

    Scenario: No two arrows share both endpoints in the same direction
      When I enumerate every ordered pair of points in the window
      Then at most one arrow runs from the first to the second

  Rule: A window is a well-formed ball

    SPEC §11 item 4 made the board unbounded, so enumeration became a query with
    an explicit bound. These are the contract of that query — everything else in
    the suite depends on it being a ball rather than an arbitrary bag.

    Scenario: A window reports back what it was asked for
      When I grow a window from a centre and a radius
      Then it reports that centre and that radius
      And the centre is among its points

    Scenario: A window of radius zero is just its centre
      When I grow a window of radius 0
      Then its points are exactly the centre

    Scenario: A window grows monotonically with radius
      When I grow one window of radius r and another of radius r plus 1
      Then every point of the smaller is a point of the larger

    Scenario Outline: A radius that is not a whole non-negative number is refused
      When I grow a window of radius <radius>
      Then the query fails with a contract violation

      Examples:
        | radius   | why                                    |
        | -1       | a ball cannot have negative extent      |
        | 1.5      | a graph distance is a whole number      |
        | NaN      | not a number at all                     |
        | Infinity | the board is unbounded; the query is not |

    Scenario: A window is closed under the incidence a caller follows
      When I grow a window
      Then every arrow touching one of its points is among its arrows
      And every vertex flanked by one of its arrows is among its vertices
      # One direction only, deliberately. The converse is NOT asserted: on an
      # unbounded board a fringe arrow points out of the window, and on a fixture
      # small enough it does not. A caller that assumed total closure would be
      # reading a board rather than a window, so the suite refuses to promise it.

  Rule: Minimal cycles are exactly the pinwheels

    Girth 3 alone is not quite enough. It matters that the 3-cycles *are* the
    lattice triangles, because that is what makes "the smallest enclosable
    territory holds exactly one spawner" true rather than merely usually true.

    Scenario: Every directed 3-cycle encloses exactly one vertex
      When I enumerate every directed cycle of length 3 in the window
      Then each encloses exactly one vertex
      And the three arrows of that cycle are the three arrows bordering it

    Scenario: Each vertex is enclosed by exactly one 3-cycle
      When I enumerate every directed cycle of length 3 in the window
      Then each vertex is enclosed by exactly one of them
      # "Exactly", not "at most". Together with the six-cycles-per-point scenario
      # below, this is what replaces the global 3:1:2 count on an unbounded board
      # — a bijection between cycles and vertices, asserted locally.

    Scenario: Every point lies on exactly six minimal cycles
      When I enumerate the directed 3-cycles through each point in the window
      Then each point lies on exactly 6 of them
      # The six triangles it corners, all of which circulate under the
      # alternating orientation. Three points per cycle, so cycles are twice the
      # points, so vertices are twice the points — the 2:1 ratio without a count.

    Scenario: Counting cycles never counts one twice
      When I enumerate every directed cycle of length 3 in the window
      Then a cycle reached from each of its three arrows is counted once
      # Not a nicety. A 3-cycle is discoverable from each arrow it starts at, so
      # a naive enumeration reports three rotations of one triangle and every
      # vertex looks like it owns three cycles.

  Rule: Queries are order-stable

    ADR 0001 names ordering, not randomness, as the realistic determinism
    failure. A port that returns adjacency in a different order on two calls
    produces a rules engine that passes every unit test and drifts in replay.

    Scenario: Repeated adjacency queries return identical sequences
      Given any point in the window
      When I query its out-arrows twice
      Then both queries return the same arrows in the same order

    Scenario: Two ports built from the same description agree exactly
      Given two ports constructed from the same board description
      When I take the same window from each
      Then the two windows are identical in content and order
      And both report the same seed point
      # A window is built by traversal, which is exactly where insertion order
      # leaks in, so this binds harder here than on any other method.

    Scenario: Adjacency order does not depend on query history
      Given any point in the window
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
        | window         |
