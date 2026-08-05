# language: en
# Overview: docs/spec/fixtures/fixtures.md
# SPEC §2 (orientation pattern), §7 (specials live on vertices), §11 items 4, 29

Feature: Fixture geometry — validation, windows and the finite-board limit
  As the author of a board
  I want a malformed board to fail loudly where it is written
  So that a wrong board never reaches the rules core disguised as a rule bug

  Background:
    Given boards authored as rotation systems, one line of six arrows per point

  Rule: A malformed board is rejected at construction, and the message locates the fault

    Every flaw here is one the conformance suite would also catch turns later, as
    "this board is not conformant". Catching it at construction, with the offending
    point or arrow named, is the difference between a fix that takes a minute and a
    hunt through a rules test's output. The validator is a deliverable, not a
    convenience.

    Scenario Outline: Construction refuses an ill-formed board
      Given a board description in which <flaw>
      When I construct the port from it
      Then construction fails with a contract violation
      And the message names <locus>

      Examples:
        | flaw                                                        | locus                    |
        | a point lists other than six arrows                         | that point               |
        | a point's in-arrows and out-arrows do not alternate         | that point               |
        | an arrow's origin or target is not a declared point         | that arrow               |
        | an arrow appears at a point that is not one of its endpoints | that point and arrow     |
        | an arrow or point is referenced but never declared          | the dangling identifier  |
        | an arrow has the same point as origin and target            | that arrow               |
        | two arrows run between the same ordered pair of points      | the duplicated pair      |
        | two arrows form a directed 2-cycle                          | those two arrows         |

    Scenario: A board putting a point on the wrong number of cycles is refused
      Given a board that is 3-in / 3-out and alternating at every point
      But some point lies on other than six minimal directed cycles
      When I construct the port from it
      Then construction fails with a contract violation
      And the message names that point
      # 3-regular and alternating is not sufficient — a conformant-looking board
      # can still miscount triangles at a point, and the derived vertex lattice
      # would silently be wrong. The validator checks the derived structure too.

    Scenario: A board whose incidence does not close at 3:1:2 is refused
      Given a board that is 3-in / 3-out and alternating at every point
      But some arrow borders other than two minimal directed cycles
      When I construct the port from it
      Then construction fails with a contract violation
      And the message names the offending arrow
      # SPEC §2: an edge borders exactly two triangles. An arrow on three cycles
      # cannot give its cycle a single vertex, so the derived vertex lattice — and
      # the whole 3:1:2 incidence — fails to close. This is the arrow-side of the
      # same requirement the previous scenario checks point-side. On any realizable
      # small board the two faults co-occur, so the validator must report EVERY
      # incidence fault it finds, not only the first — D2 ("names the offending
      # point or arrow") read strictly.

  Rule: Identifiers from another board are rejected, not guessed

    A fixture, a second fixture and the generated tiling all coexist in one test
    run. An id minted against one must never silently resolve against another — a
    plausible-looking wrong answer is an adjacency bug that surfaces turns later as
    a replay mismatch.

    Scenario Outline: A foreign identifier fails loudly
      Given the board "minimal"
      When I query it with <identifier>
      Then the query fails with a contract violation
      And it does not return a plausible-looking result

      Examples:
        | identifier                                  |
        | a point identifier minted by the tiling      |
        | a point identifier minted by "spacious"      |
        | an arrow identifier minted by "spacious"     |

    Scenario: A well-formed identifier for an absent point is refused
      Given the board "minimal"
      When I query a point identifier that is well-formed for this board but names no point it has
      Then the query fails with a contract violation
      # Opaque ids stop the rules core constructing one, but the fixture builder
      # can, so the board must recognise its own ids specifically — not merely
      # accept anything shaped like one.

  Rule: Windows on a finite board

    A window is a graph-distance ball whatever the board (SPEC §11 item 4). On a
    finite board the degenerate cases are the interesting ones: the ball smaller
    than the board, and the ball that has swallowed it.

    Scenario: A window of radius zero is just its centre
      When I grow a window of radius 0 from a point
      Then its points are exactly that point

    Scenario: On spacious, a radius-1 window is a proper part of the board
      Given the 8-point board "spacious"
      When I grow a window of radius 1 from any point
      Then the window omits at least one point of the board
      # "spacious" exists for exactly this: on "minimal", which is K7, every point
      # is a neighbour of every other, so no window is ever a proper part and
      # "outside the window" cannot be expressed.

    Scenario: A window that is the whole board is still closed under incidence
      Given the board has undirected diameter d
      When I grow a window of radius d
      Then every arrow touching one of its points is among its arrows
      And every vertex flanked by one of its arrows is among its vertices

  Rule: The board exposes no extent

    A fixture knows it is finite; the port must not let that knowledge leak. A rule
    that could ask a board's size is a rule that could special-case the fixture and
    then behave differently on the tiling.

    Scenario: The port offers no way to ask how large the board is
      Given a fixture port
      When I inspect its surface
      Then it offers no way to ask the board's size, diameter or extent
      And it offers no way to enumerate the board except through a window

  Rule: Every straight-ahead ray closes on itself

    This is the finite-board limit as an executable statement rather than a
    comment. It is the reason closure and fill (P05) and encirclement (P07) test
    against the tiling and not a fixture: on any finite board a ray cannot escape,
    so even-odd fill counts zero crossings for every enclosure. The limit is
    invisible and expensive, so it is pinned here on purpose.

    Scenario: Following the opposite slot out of every point returns to the start
      Given any arrow on the board
      When I repeatedly enter a point by an arrow and leave by the slot opposite it
      Then I return to the starting arrow after finitely many steps
      # Straight-ahead is a bijection on arrows, and every orbit of a bijection on
      # a finite set is a cycle. On the unbounded tiling the same walk never
      # returns — which is precisely why the tiling can host fill and a fixture
      # cannot.
