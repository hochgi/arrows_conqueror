# language: en
# Overview: docs/spec/selection-chrome/selection-chrome.md
# SPEC §4 Galcon (read) — pointer kind, hover leak, 2^k, purity

Feature: Selection chrome — pointer kind, hover leak, unique full-speed, purity
  As the board adapter
  I want cost numerals and reach wash to follow pointer kind and commit phase
  So that touch does not spray numbers and a send dialog cannot relight the neighbourhood

  Background:
    Given a GameState, a GeometryPort, and Galcon input
    And selectionPaint reads phase, highlights, hoverArrow, and pointer kind

  Rule: Touch reveals cost only on the tapped dest

    @superseded-P34
    Scenario: Coarse pointer in source phase shows no min-count
      Given source phase with priced dest d2
      And the pointer is coarse
      And hoverArrow is d2
      Then minCountArrows is empty

    @superseded-P34
    Scenario: Coarse pointer after dest tap shows min-count on dest
      Given portion phase for priced dest d2 whose minCount is 2
      And the pointer is coarse
      Then minCountArrows is { d2 }

    @superseded-P34
    Scenario: Leave hover hides the numeral
      Given source phase, fine pointer, hoverArrow d2 with minCount 2
      And minCountArrows is { d2 }
      When hoverArrow becomes unset
      Then minCountArrows is empty

    @superseded-P34
    Scenario: Hover a non-reach arrow shows no numeral
      Given source phase and fine pointer
      And hoverArrow is an arrow not in reach
      Then minCountArrows is empty

  Rule: Commit chrome does not leak

    @superseded-P34
    Scenario: During commit, hovering another dest does not restore reach wash
      Given portion phase for dest d2
      And dest d3 is reachable but not on the path
      And the pointer is fine
      And hoverArrow is d3
      Then reachWash is empty
      And d3 is not in minCountArrows

    @superseded-P34
    Scenario: Two-to-the-k stack to distance one opens slider
      Given a stack of 4 heads on S1
      And dest d1 is one step away
      When the player clicks d1
      Then portionDialogKind is slider
      And allowed includes 1 and 4

    @superseded-P34
    Scenario: Two-to-the-k stack to distance k-plus-one confirms
      Given a stack of 4 heads on S1
      And dest d3 is three steps away so allowed portions are [4]
      When the player clicks d3
      Then portionDialogKind is confirm
      And pending is unset
      And commitKind is confirm

    @superseded-P34
    Scenario: Confirm skin when allowed length is one
      Given allowed portions [4]
      Then portionDialogKind is confirm

    @superseded-P34
    Scenario: Slider skin when allowed length is at least two
      Given allowed portions [1, 2, 4]
      Then portionDialogKind is slider

    @superseded-P34
    Scenario: One-head never opens confirm
      Given a stack of 1 head
      And every reachable dest has allowed portions [1]
      When the player clicks any such dest
      Then commitKind is apply
      And phase is idle

  Rule: Quiet fade, purity, existing packets

    Scenario: Quiet reach peak and monotone floor
      Then reachOpacity(1) is 0.22
      And reachOpacity is monotone non-increasing on distances 1..8
      And every value is at least 0.08

    @superseded-P34
    # The surviving half — equal inputs paint equally — is asserted in
    # `packages/web/test/selectionChrome.test.ts`.
    Scenario: Equal snapshots paint equal min-count sets
      Given two selectionPaint inputs that differ only by Set insertion order
      And both are source phase with the same hover and pointer
      Then both minCountArrows sets contain the same arrows
      And both reachWash sets contain the same arrows

    @superseded-P34
    # Carried forward for the route phase by P34:
    # `The refused wash still paints in the route phase`.
    Scenario: Refused self-convert wash still paints in source phase
      Given source phase with a refused grain-adjacent convert dest r1
      Then r1 is in highlights.refused
      And r1 is not in reachWash

    @superseded-P34
    # Carried forward for the route phase by P34:
    # `Match over drops the route chrome`.
    Scenario: Match-over still drops play chrome
      Given state.winner is set
      Then playHighlightsAllowed is false
      # P29 owns the drop; this packet must not re-enable reach or selected halo.
