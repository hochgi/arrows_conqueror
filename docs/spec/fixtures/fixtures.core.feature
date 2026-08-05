# language: en
# Overview: docs/spec/fixtures/fixtures.md
# SPEC §2 (the board, orientation pattern), §7 (specials live on vertices), §11 items 4, 29

Feature: Fixture geometry — a hand-authored board behind the port
  As the rules core under test
  I want a small finite board that satisfies the same port contract as the tiling
  So that a rules failure is readable and the port's interchangeability is demonstrated

  Background:
    Given a board authored as a rotation system, one line of six arrows per point
    And its vertices derived rather than authored

  Rule: A fixture satisfies the conformance suite unedited

    This is the interchangeability claim made concrete. The suite that the tiling
    passes (SPEC §11 item 4) passes here too, against a board built a completely
    different way, with not one assertion changed.

    Scenario: The minimal board passes the conformance suite
      Given the 7-point board "minimal"
      When I run the GeometryPort conformance suite against it
      Then every assertion passes
      And the suite is unedited from the one the tiling passes

    Scenario: The spacious board passes the conformance suite
      Given the 8-point board "spacious"
      When I run the GeometryPort conformance suite against it
      Then every assertion passes
      And the suite is unedited from the one the tiling passes

  Rule: The vertex lattice is derived, not authored

    SPEC §7's spawner vertices are a consequence of the arrow graph, not a second
    input: each minimal directed 3-cycle carries exactly one. Deriving them keeps
    the authored data to the arrows alone, and makes the one-vertex-per-triangle
    fact impossible to author wrongly.

    Scenario: Each minimal cycle yields exactly one vertex
      When I enumerate every minimal directed 3-cycle on the board
      Then each cycle has exactly one derived vertex
      And no vertex is derived from anything that is not a minimal cycle

    Scenario: Every arrow flanks exactly two derived vertices
      When I enumerate every arrow on the board
      Then each arrow flanks exactly 2 distinct derived vertices

    Scenario: Flank and border are mutually inverse over derived vertices
      When I enumerate every arrow on the board
      Then every vertex that arrow flanks is bordered by that arrow
      And every arrow bordering a vertex flanks that vertex

  Rule: A finite board is its own window

    On the unbounded tiling a window is always a proper part of the board. A
    fixture is finite, so past a certain radius the window simply is the whole
    board — which is the sharpest difference between the two implementations
    (SPEC §11 item 4).

    Scenario: A radius at least the diameter yields the whole board
      Given the board has undirected diameter d
      When I grow a window of radius d from any point
      Then the window contains every point of the board
      And it contains every arrow and every vertex of the board

    Scenario: Growing past the diameter changes nothing
      Given the board has undirected diameter d
      When I grow one window of radius d and another of radius d plus 1
      Then the two windows contain the same points

  Rule: Two builds of the same board agree exactly

    Derived ids are minted from canonical keys, never from map-insertion order, so
    the board is a pure function of its description. ADR 0001 names insertion
    order — not randomness — as the realistic determinism failure, and a finite
    board that enumerates its cycles is exactly where that leak would live.

    Scenario: Two ports from the same description are identical
      Given two ports built from the same board description
      When I take the same window from each
      Then the two windows are identical in content and order
      And both mint the same identifier for the same derived vertex
