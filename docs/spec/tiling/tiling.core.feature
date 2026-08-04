# language: en
# Overview: docs/spec/tiling/tiling.md
# SPEC §2 (the board, formal definition), §7 (specials on vertices)

Feature: Generating the arrow tiling
  As the renderer and the rules core
  I want a board generated from two integers
  So that the real tiling exists without anything having to be traced or measured

  Background:
    Given a tiling generated for a 6 x 6 board

  Rule: The counts close at 3 : 1 : 2

    SPEC §2 derives these from incidence rather than asserting them, so a
    generator that gets one wrong has a structural bug and not an off-by-one.

    Scenario: A board has nm points, 3nm arrows and 2nm vertices
      When I enumerate the board
      Then there are 36 points
      And there are 108 arrows
      And there are 216 vertices

    Scenario Outline: The ratio holds at every size
      Given a tiling generated for a <n> x <m> board
      When I enumerate the board
      Then there are <points> points
      And there are exactly 3 times as many arrows as points
      And there are exactly 2 times as many vertices as points

      Examples:
        | n | m  | points | note                       |
        | 4 | 4  | 16     | the smallest legal board   |
        | 5 | 4  | 20     | not square                 |
        | 4 | 5  | 20     | not square, transposed     |
        | 12 | 12 | 144   | a plausible playing size   |

  Rule: Adjacency follows the three out-directions

    Scenario: Every point has three out-arrows and three in-arrows
      When I enumerate every point on the board
      Then each point has exactly 3 out-arrows
      And each point has exactly 3 in-arrows

    Scenario: An arrow runs from its origin cell along one out-direction
      Given the point at cell (2, 2)
      When I take its out-arrow along direction 0
      Then that arrow's origin is the point at cell (2, 2)
      And that arrow's target is the point at cell (3, 2)

    Scenario: Adjacency agrees with arrow endpoints
      When I enumerate every arrow on the board
      Then each arrow is among the out-arrows of its origin
      And each arrow is among the in-arrows of its target

  Rule: A cell owns two triangles, and they are its spawner vertices

    SPEC §2: triangle centres are the spawner vertices, two per lattice point.
    An arrow's flanks are always one up and one down — which is why §7's cap of
    two feed slots per arrow needs no rule to enforce it.

    Scenario: Every arrow flanks one up-triangle and one down-triangle
      When I enumerate every arrow on the board
      Then each arrow has exactly 2 flank vertices
      And exactly 1 of them is an up-triangle
      And exactly 1 of them is a down-triangle

    Scenario: Every vertex borders exactly three arrows
      When I enumerate every vertex on the board
      Then each vertex has exactly 3 bordering arrows

    Scenario: Flank and border are mutually inverse
      When I enumerate every arrow and every vertex on the board
      Then each arrow appears among the bordering arrows of both its flanks
      And each vertex appears among the flanks of all three arrows it borders

  Rule: Slots alternate in and out around a point

    SPEC §11 item 29 makes alternation a conformance requirement of every board.
    The PHASE is free, and this generator happens to put in-arrows on the odd
    slots — which is exactly the fact item 29 forbids anything depending on.

    Scenario: A point's six arrows take six distinct slots
      When I enumerate every point on the board
      Then that point's 3 in-arrows and 3 out-arrows occupy 6 distinct slots

    Scenario: In-arrows and out-arrows alternate around a point
      When I enumerate every point on the board
      Then no two adjacent slots hold arrows of the same direction

    Scenario: A slot query is stable
      Given the point at cell (1, 3) and one of its out-arrows
      When I ask for that arrow's slot twice
      Then both answers are the same slot

  Rule: The board is a torus with no rim

    Scenario: Every point is indistinguishable by degree
      When I enumerate every point on the board
      Then every point reports 3 in-arrows and 3 out-arrows
      And no point reports a different degree from any other

    Scenario: Every point reaches every other point by forward movement
      When I follow out-arrows from any point
      Then every point on the board is reachable
      And every point can reach that starting point

  Rule: Generation is deterministic

    ADR 0001. A generator that varied would make every replay suspect, and
    ordering — not randomness — is the realistic way that happens.

    Scenario: Two generators for the same size agree exactly
      Given a second tiling generated for a 6 x 6 board
      When I compare the two boards
      Then their point enumerations are identical in order
      And their arrow enumerations are identical in order
      And their vertex enumerations are identical in order

    Scenario: Query history does not change adjacency order
      Given a second tiling generated for a 6 x 6 board
      When I query every point's out-arrows on the first board
      And I query one point's out-arrows on the second board
      Then both boards return that point's out-arrows in the same order
