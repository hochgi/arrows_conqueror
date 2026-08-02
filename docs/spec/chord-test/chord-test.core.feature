# language: en
# Overview: docs/spec/chord-test/chord-test.md
# SPEC §2 — "Trails own points, not just arrows", "The chord test"

Feature: The chord test
  As the rules core
  I want one test that decides whether a traversal crosses a trail
  So that enclosures cannot leak through the gap between two trail arrows

  Background:
    Given a point with six arrow slots numbered 0 to 5 in cyclic order

  Rule: Interleaving chords cross

    Blue's endpoints separate red's around the circle, so the two paths cannot
    both pass without meeting. This is blue threading between two of red's
    arrows without touching either — the case the naive "did you land on a trail
    tile" rule would miss entirely, and the reason the tile rule was rejected.

    Scenario: Chords that alternate around the circle cross
      Given red draws a chord between slots 0 and 3
      And blue draws a chord between slots 1 and 4
      When I apply the chord test
      Then blue crosses red

    Scenario: A narrow chord interleaving a wide one crosses
      Given red draws a chord between slots 0 and 2
      And blue draws a chord between slots 1 and 5
      When I apply the chord test
      Then blue crosses red

  Rule: Coinciding chords cross

    Blue's arrow *is* one of red's trail arrows. The chord test subsumes the
    tile rule rather than special-casing it: an enemy cannot stand on a trail
    arrow without entering through a point the trail also uses.

    Scenario: Blue exits along an arrow red also uses
      Given red draws a chord between slots 0 and 3
      And blue draws a chord between slots 1 and 3
      When I apply the chord test
      Then blue crosses red

    Scenario: Blue enters along an arrow red also uses
      Given red draws a chord between slots 0 and 3
      And blue draws a chord between slots 3 and 5
      When I apply the chord test
      Then blue crosses red

  Rule: Turning aside is not crossing

    Both of blue's endpoints lie on the same side of red's chord. This is what
    makes crossing a decision rather than a tripwire — a head standing where an
    enemy trail runs has crossed nothing until it picks an exit.

    Scenario: Both endpoints on one side of red's chord
      Given red draws a chord between slots 0 and 3
      And blue draws a chord between slots 1 and 2
      When I apply the chord test
      Then blue does not cross red

    Scenario: Both endpoints on the other side of red's chord
      Given red draws a chord between slots 0 and 3
      And blue draws a chord between slots 4 and 5
      When I apply the chord test
      Then blue does not cross red
