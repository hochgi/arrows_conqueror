# language: en
# Overview: docs/spec/layout/layout.md
# SPEC §2 (orientation pattern), §11 item 29

Feature: Layout edge cases — parity, the seam, and the skew check
  As the renderer
  I want the silhouette to depend on triangle parity and nothing else
  So that retuning the artwork cannot change which arrow a pixel belongs to

  Background:
    Given a tiling generated for a 6 x 6 board

  Rule: Up and down triangles must twist oppositely

    The finding this packet exists to record. Same-direction twisting still
    tiles, so no gap-or-overlap test catches it — it just silently produces a
    symmetric zigzag with two points and no arrowhead.

    Scenario: Opposite twist makes the tile asymmetric
      Given a layout whose up and down triangles twist oppositely
      When I request the polygon for any arrow
      Then the polygon is not centrally symmetric about its arrow's midpoint

    Scenario: Same-direction twist makes the tile symmetric
      Given a layout whose up and down triangles twist the same way
      When I request the polygon for any arrow
      Then the polygon is centrally symmetric about its arrow's midpoint
      # Recorded as the WRONG configuration, kept as a scenario because it is
      # indistinguishable from the right one by area, vertex count or tiling.

    Scenario: Both twist conventions tile the plane
      When I sum the tile areas under each twist convention
      Then both totals equal the area of the board
      # Which is exactly why this needs its own assertion: tiling does not
      # discriminate, so only symmetry does.

  Rule: The silhouette parameters are tunable without moving a tile

    SPEC §7 imposes the same discipline on spawner force: values are data, and no
    logic branches on them.

    Scenario Outline: Changing twist and bend never changes which arrows exist
      Given a layout at twist <twist> degrees and bend <bend> percent
      When I request a polygon for every arrow on the board
      Then every arrow still yields exactly 1 polygon
      And the summed area still equals the area of the board

      Examples:
        | twist | bend | note                          |
        | 0     | 36   | rhombus, the debugging view   |
        | 87    | 36   | the measured POC values       |
        | 100   | 20   | a deeper, thinner arm         |
        | -87   | 36   | mirrored handedness           |

    Scenario: No layout method branches on a particular twist value
      When I inspect the layout implementation
      Then no comparison against a specific twist or bend value appears in it

  Rule: Tiles that cross the seam are returned unwrapped

    Layout returns one polygon per arrow at its canonical cell, and the renderer
    draws translated copies. Clipping at the seam would make the torus visible,
    which is the thing GeometryPort exists to hide.

    Scenario: A seam-crossing arrow still yields one polygon
      Given the arrow from cell (5, 0) along direction 0
      When I request its polygon
      Then it yields exactly 1 polygon
      And that polygon has 8 vertices
      And its vertices are not clipped to the board's bounds

    Scenario: A seam-crossing tile is congruent to an interior one
      Given the arrow from cell (5, 0) along direction 0
      And the arrow from cell (2, 2) along direction 0
      When I request both polygons
      Then the two polygons are congruent by translation

  Rule: Layout is the only check on the out-direction constant

    A set of out-directions summing to zero but not 120 degrees apart passes
    every GeometryPort assertion. Only geometry catches it.

    Scenario: The three tiles around a vertex are congruent by 120 degree rotation
      Given any vertex on the board
      When I request the polygons of its 3 bordering arrows
      Then each is the previous one rotated 120 degrees about that vertex's centre

    Scenario: A skewed out-direction set fails the rotation check
      Given a layout built from out-directions that sum to zero but sit at 0, 60 and 210 degrees
      When I request the polygons of a vertex's 3 bordering arrows
      Then they are not congruent by 120 degree rotation
      # The graph is isomorphic and every rule behaves identically on it, so this
      # scenario is the only place the mistake is detectable.

  Rule: Degenerate parameters are refused

    Scenario Outline: A bend outside the open unit interval is rejected
      When I build a layout at twist 87 degrees and bend <bend> percent
      Then the layout raises a contract violation

      Examples:
        | bend | why                                          |
        | 0    | the spoke collapses to the triangle centre    |
        | 100  | the spoke collapses onto the corner           |
        | -10  | a bend is a fraction of the way out           |
        | 140  | past the corner, so tiles would self-intersect |
