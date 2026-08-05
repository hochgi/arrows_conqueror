# language: en
# Overview: docs/spec/fill/fill.md
# SPEC §7 (even-odd is correct because the board is a plane, self-crossings invert),
# §2 (the chord test), §6.1a invariant 3, §11 items 4, 16, 30

Feature: Fill — which arrows a closed curve contains
  As the author of the rules engine
  I want even-odd parity taken against the claimed curve alone
  So that a self-crossing inverts without a special case and no enclosure ever leaks

  Background:
    Given the generated tiling behind GeometryPort
    And a closed boundary of arrows with territory at both ends

  Rule: A candidate is enclosed when an escaping probe crosses oddly

    §7's Jordan argument, and it needs the probe to *leave* — which is why this suite
    cannot run on a fixture board (§11 items 4 and 30).

    Scenario: An arrow inside a loop is enclosed
      Given a boundary that encircles at least one arrow
      When I ask whether an encircled arrow is enclosed
      Then it is enclosed
      And its escaping probe crossed the boundary an odd number of times

    Scenario: An arrow outside a loop is not enclosed
      Given a boundary that encircles at least one arrow
      When I ask whether an arrow well clear of it is enclosed
      Then it is not enclosed
      And its escaping probe crossed the boundary an even number of times

    Scenario: The minimal closure encloses no arrow at all
      Given the three arrows bordering one vertex, forming a directed cycle, as the boundary
      When I ask which arrows it encloses
      Then it encloses none
      # §11 item 16: the lattice triangle is the *minimum enclosable territory* and its
      # three arrows **are** the path. Zero tiles inside is the correct answer, and §7
      # is what makes it still worth taking — the spawner comes from the three
      # bordering arrows in thirds, not from anything inside (§11 item 34).

    Scenario: Every arrow of a region is enclosed, and nothing beyond it
      Given a boundary enclosing a region of several arrows
      When I ask the verdict for every arrow within the boundary's window
      Then exactly the arrows of that region are enclosed

  Rule: A crossing is an interleave, never a coincidence

    Coincidence means the probe is running *along* the curve rather than through it.
    crossings shipped the two predicates separately for this caller, and §6.1a says
    why: re-traversal leaves the arrow set unchanged, so there is nothing to flip.

    Scenario: A probe that shares an arrow with the boundary counts no crossing there
      Given a boundary and a candidate whose straight-ahead probe would enter a boundary arrow
      When I ask whether that candidate is enclosed
      Then the verdict is the one an escaping probe that avoids the boundary gives
      # The degenerate ray of every even-odd implementation. There are no coordinates
      # to perturb (GeometryPort exposes none), so the probe routes around instead —
      # which is sound because parity is a topological invariant.

    Scenario: The probe is tested against every chord the boundary presents
      Given a boundary that passes through one point twice, presenting four chords there
      And a probe that transits that point
      When I ask whether it crossed
      Then the verdict accounts for every chord, not only the first
      # The failure crossings exists to catch: an engine that tested one chord passes
      # every spine and quietly fails every knot.

  Rule: Self-crossings invert, with no special case

    §7: crossing your own trail doesn't close anything on the spot — it flips which
    lobes count as enclosed when you finally land. Formally: even-odd. Figure-eights
    resolve without a rule of their own.

    Scenario: A figure-eight claims the lobes parity says it claims
      Given a boundary that departs territory, crosses itself once, and returns
      When I ask which arrows it encloses
      Then each lobe's verdict is the parity of its own escaping probe
      And no clause anywhere named the crossing as a case

    Scenario: A boundary of two concentric rings encloses only the ring between them
      Given a boundary of two separate concentric loops around the same region, in one trail
      When I ask whether an arrow in that region is enclosed
      Then it is not enclosed
      And its escaping probe crossed the boundary twice
      # **The scenario that decides the algorithm — SPEC §11 item 36, open.** Even-odd
      # puts the core outside (two crossings); flood-from-outside puts it inside
      # (unreachable). Re-walking one ring cannot produce this shape, because a trail is
      # a set and re-traversal adds nothing (§6.1a invariant 2) — it takes two distinct
      # rings. Do not write this test until the item is answered.

  Rule: The verdict does not depend on the probe

    Parity is a topological invariant: two probes from one candidate differ by a
    closed loop, which crosses a closed curve an even number of times.

    Scenario: Two different escaping probes agree
      Given a candidate inside a boundary
      When I take its verdict along two different escaping routes
      Then the two verdicts are equal

    Scenario: A candidate with no escaping route is enclosed
      Given a boundary whose every crossing point is saturated by the boundary's own arrows
      When I ask whether an arrow inside it is enclosed
      Then it is enclosed
      # Saturation is already impassable by arithmetic (crossings): all six slots are
      # the curve's, so no probe can transit at all. Enclosed is the right answer and
      # no rule had to say so.

  Rule: The sweep is bounded by the boundary, not by the board

    Scenario: The sweep looks no further than the boundary can reach
      Given a boundary of L arrows
      When it is filled
      Then the region examined is bounded by a window derived from L
      And no board extent was read
      # §7: a trail of L arrows cannot enclose more than O(L²), so the sweep is finite
      # though the board is not — and §11 item 4 means there is no extent to read.

    Scenario: An arrow far outside a small boundary is never examined
      Given a boundary of three arrows
      When it is filled
      Then an arrow many steps away is not enclosed
      And it was not examined
