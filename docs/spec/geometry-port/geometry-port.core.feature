# language: en
# Overview: docs/spec/geometry-port/geometry-port.md
# SPEC §2 (the board), §7 (specials live on vertices)

Feature: GeometryPort conformance — the arrow graph
  As the rules core
  I want the board exposed as adjacency, incidence and a crossing test
  So that I can be built and tested before the real tiling has been measured

  Background:
    Given a board obtained from a conforming GeometryPort

  Rule: Points are 3-in / 3-out

    The load-bearing property of the whole design. It buys strong connectivity,
    so no head is ever stranded, and it independently makes self-trap impossible
    (SPEC §6.1a). Balance pays twice.

    Scenario: Every point has exactly three in-arrows and three out-arrows
      When I enumerate every point on the board
      Then each point has exactly 3 in-arrows
      And each point has exactly 3 out-arrows

    Scenario: Adjacency agrees with arrow endpoints
      When I enumerate every arrow on the board
      Then each arrow is among the out-arrows of its origin point
      And each arrow is among the in-arrows of its target point

    Scenario: A point's six arrow slots are distinct
      When I enumerate every point on the board
      Then that point's 3 in-arrows and 3 out-arrows are 6 distinct arrows

  Rule: Every arrow flanks exactly two spawner vertices

    An arrow touches exactly four interesting things: its origin point, its
    target point, and the two vertices on its left and right. Two is a hard
    limit, so a triple-fed arrow is impossible and the economy never has to
    consider one.

    Scenario: Every vertex is bordered by exactly three arrows
      When I enumerate every vertex on the board
      Then each vertex is bordered by exactly 3 arrows

    Scenario: Every arrow flanks exactly two distinct vertices
      When I enumerate every arrow on the board
      Then each arrow flanks exactly 2 distinct vertices

    Scenario: Flank and border are mutually inverse
      When I enumerate every arrow on the board
      Then every vertex that arrow flanks is bordered by that arrow
      And every arrow bordering a vertex flanks that vertex

  Rule: The incidence counts close at 3:1:2

    Derived, not measured. A board violating these is not a lattice, and every
    count the economy quotes depends on them.

    Scenario: Arrows, points and vertices stand in a 3:1:2 ratio
      When I count the points, arrows and vertices on the board
      Then there are exactly 3 arrows for every point
      And there are exactly 2 vertices for every point

  Rule: The graph is strongly connected with girth 3

    Strong connectivity is why movement needs no backwards step. Girth 3 is why
    the minimum enclosable territory costs 3 arrows and holds exactly one
    spawner.

    Scenario: Every point can reach every other point
      Given any point on the board
      When I compute the set of points reachable by following arrows forward
      Then that set contains every point on the board

    Scenario: The shortest directed cycle has length three
      When I compute the girth of the arrow graph
      Then the girth is exactly 3

    Scenario: A minimal cycle encloses exactly one spawner vertex
      Given a directed cycle of length 3
      When I ask which vertices lie inside it
      Then exactly one vertex lies inside it

  Rule: Enumeration is total and duplicate-free

    Even-odd fill sweeps the board through this port and must not know how the
    board is represented.

    Scenario Outline: Enumeration yields each element exactly once
      When I enumerate every <element> on the board
      Then no <element> appears twice
      And every <element> named by any adjacency query is in that enumeration

      Examples:
        | element |
        | point   |
        | arrow   |
        | vertex  |
