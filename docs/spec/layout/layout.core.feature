# language: en
# Overview: docs/spec/layout/layout.md
# SPEC §2 (the chevron is a decoration of a directed edge)

Feature: Layout — the arrow tiling as drawable polygons
  As the renderer
  I want one polygon per arrow in lattice space
  So that the board can be drawn and a tile picked out under the cursor

  Background:
    Given a tiling generated for a 6 x 6 board
    And a layout at twist 87 degrees and bend 36 percent

  Rule: Every arrow gets one closed 8-vertex polygon

    Scenario: Each arrow has a polygon
      When I request a polygon for every arrow on the board
      Then every arrow yields exactly 1 polygon
      And no arrow yields an empty polygon

    Scenario: A polygon has eight vertices
      When I request the polygon for any arrow
      Then it has exactly 8 vertices
      And its first and last vertices are not the same point

    Scenario: A polygon is stable across calls
      When I request the polygon for one arrow twice
      Then both polygons are identical

  Rule: A tile is anchored to its arrow's endpoints and flanks

    This is what ties the drawing to the graph. Getting it wrong would draw a
    correct-looking tiling that does not correspond to the board.

    Scenario: Two of a tile's vertices are its arrow's endpoints
      Given the arrow from cell (2, 2) along direction 0
      When I request its polygon
      Then one vertex is at the position of its origin point
      And one vertex is at the position of its target point

    Scenario: Two of a tile's vertices are its flank centres
      Given the arrow from cell (2, 2) along direction 0
      When I request its polygon
      Then one vertex is at the centre of its up-triangle flank
      And one vertex is at the centre of its down-triangle flank

    Scenario: The three tiles around a vertex meet at its centre
      Given any vertex on the board
      When I request the polygons of its 3 bordering arrows
      Then all 3 polygons have a vertex at that vertex's centre

  Rule: The polygons tile the plane

    Scenario: Summed tile area equals board area
      When I sum the areas of every arrow's polygon
      Then the total equals the area of the board
      And no two polygons overlap

    Scenario: Neighbouring tiles agree on their shared spoke
      Given two arrows that share a flank triangle and a point
      When I request both polygons
      Then the boundary between them is the same sequence of vertices in both

  Rule: Twist zero is a rhombus, twist non-zero is an arrow

    Scenario: At twist zero a tile is a rhombus
      Given a layout at twist 0 degrees and bend 36 percent
      When I request the polygon for any arrow
      Then its 8 vertices lie on 4 distinct corners
      And those corners are the arrow's 2 endpoints and its 2 flank centres

    Scenario: At twist zero the tiling still has neither gap nor overlap
      Given a layout at twist 0 degrees and bend 36 percent
      When I sum the areas of every arrow's polygon
      Then the total equals the area of the board

    Scenario: At non-zero twist a tile has a head and a tail
      When I request the polygon for any arrow
      Then the polygon is not centrally symmetric about its arrow's midpoint

  Rule: Layout knows nothing about a viewport

    The renderer owns pan, zoom and the torus copies. Keeping pixels out of here
    is what stops the lattice maths from being duplicated in two packages.

    Scenario: Layout accepts no screen parameters
      When I inspect everything the layout exposes
      Then no method accepts a scale
      And no method accepts a pixel offset
      And every coordinate returned is in lattice space
