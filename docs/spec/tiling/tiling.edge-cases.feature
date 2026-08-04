# language: en
# Overview: docs/spec/tiling/tiling.md
# SPEC §2 (torus, orientation pattern), §11 items 11, 16, 29

Feature: Tiling edge cases — the seam, the size floor, and the skew trap
  As the rules core
  I want degenerate boards refused and the seam invisible
  So that no rule ever has to special-case where the board wraps

  Rule: The seam is unobservable

    SPEC §2: the wrap is not on the port, and there is no seam to query, because
    a rule that could ask where the seam is would be a rule that could
    special-case it.

    Scenario: An arrow leaving the last cell wraps to the first
      Given a tiling generated for a 4 x 4 board
      And the point at cell (3, 0)
      When I take its out-arrow along direction 0
      Then that arrow's target is the point at cell (0, 0)

    Scenario: A wrapped arrow is an ordinary arrow
      Given a tiling generated for a 4 x 4 board
      When I enumerate every arrow that crosses the seam
      Then each has exactly 2 flank vertices
      And each is among the out-arrows of its origin
      And nothing distinguishes it from an arrow that does not cross the seam

    Scenario: No query reveals the board's size or coordinates
      Given a tiling generated for a 4 x 4 board
      When I inspect everything the GeometryPort exposes
      Then no method returns a lattice coordinate
      And no method returns a board dimension
      And no method reports whether an arrow crosses the seam

  Rule: Boards below 4 x 4 are refused

    Not a tuning limit — the geometry genuinely breaks. A 3 x 3 board looks like
    a board and violates "the smallest territory holds exactly one spawner"
    (SPEC §7), which the economy depends on.

    Scenario Outline: A board too small to be conformant is rejected
      When I generate a tiling for a <n> x <m> board
      Then the generator raises a contract violation
      And the message names the 4 x 4 floor

      Examples:
        | n | m | why it would fail                                            |
        | 1 | 1 | self-loops; a point is its own target                         |
        | 1 | 2 | three arrows between the same ordered pair of points          |
        | 2 | 1 | the same, transposed                                          |
        | 2 | 2 | 4 triangles against 8 vertices — wrap merges triangles        |
        | 3 | 3 | 27 triangles against 18 vertices — wrap invents a straight one |
        | 2 | 5 | one dimension below the floor is still below the floor        |
        | 3 | 8 | at n = 3, three steps of one out-direction wrap to zero       |

    Scenario Outline: A board size that is not a positive integer is rejected
      When I generate a tiling for a <n> x <m> board
      Then the generator raises a contract violation

      Examples:
        | n   | m  |
        | 0   | 4  |
        | 4   | 0  |
        | -4  | 4  |
        | 4.5 | 4  |

    Scenario: The smallest legal board is fully conformant
      When I generate a tiling for a 4 x 4 board
      Then the board satisfies every GeometryPort conformance assertion
      And there are 16 points, 48 arrows and 32 vertices
      And there are exactly 32 directed 3-cycles

  Rule: Girth 3, and each minimal cycle holds exactly one spawner

    SPEC §11 item 16, resolved and load-bearing: this is what makes the atomic
    unit of conquest and the atomic unit of value the same object.

    Scenario: No cycle is shorter than three
      When I enumerate every arrow on the board
      Then no arrow's origin equals its target
      And no two-arrow path returns to where it started

    Scenario: Every directed 3-cycle encloses exactly one vertex
      When I enumerate every directed 3-cycle on the board
      Then the three arrows of each cycle share exactly 1 flank vertex

    Scenario: Every vertex is enclosed by exactly one minimal cycle
      When I enumerate every directed 3-cycle on the board
      Then the number of cycles equals the number of vertices
      And no vertex is enclosed by two different cycles

  Rule: The out-directions must be 120 degrees apart, not merely sum to zero

    The trap this packet exists to document. {(1,0), (0,1), (-1,-1)} sums to zero
    and passes EVERY assertion above — it is the same graph under a change of
    basis — while sitting at 0/60/210 degrees and rendering skewed. No rule can
    tell the difference; only layout can.

    Scenario: The three out-directions sum to zero
      When I sum the three out-directions in lattice coordinates
      Then the result is the zero vector

    Scenario: The three out-directions are 120 degrees apart in world space
      When I convert the three out-directions to world space
      Then their angles are 0, 120 and 240 degrees
      And no two of them are 60 degrees apart

  Rule: Foreign and malformed identifiers fail loudly

    Fixture boards (P02) and the generated tiling coexist in one test run. An id
    minted against one must never silently resolve against the other.

    Scenario Outline: A query given an identifier from another board raises
      Given an identifier minted against a different board
      When I call <query> with it
      Then the generator raises a contract violation

      Examples:
        | query          |
        | out-arrows     |
        | in-arrows      |
        | origin         |
        | target         |
        | flank-vertices |
        | border-arrows  |

    Scenario: Asking for the slot of an arrow that is not at a point raises
      Given the point at cell (0, 0)
      And an arrow that is neither an in-arrow nor an out-arrow of it
      When I ask for that arrow's slot at that point
      Then the generator raises a contract violation
