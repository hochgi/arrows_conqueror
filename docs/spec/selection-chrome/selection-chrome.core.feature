# language: en
# Overview: docs/spec/selection-chrome/selection-chrome.md
# SPEC §4 Galcon (read), §3 allowance (read)

Feature: Quieter selection chrome — reach, cost, path, selected halo
  As a player choosing where to send a stack
  I want reachable destinations to stay readable without shouting
  So that the selected stack and the path I am about to walk are the loud things

  Background:
    Given a GameState, a GeometryPort, and Galcon input
    And selectionPaint reads phase, highlights, hoverArrow, and pointer kind

  Rule: Reach marks are quiet and cost is hidden at rest

    Scenario: Source phase paints quiet reach and no min-count numerals
      Given the active player selects stack S1 that can reach dests d1 and d2
      And neither dest is hovered
      Then phase is source
      And selectionPaint.reachWash includes d1 and d2
      And selectionPaint.minCountArrows is empty

    Scenario: Fine hover on a priced dest shows that dest's min-count
      Given source phase with reach dest d2 whose minCount is 2
      And the pointer is fine
      And hoverArrow is d2
      Then minCountArrows is { d2 }
      And other reach dests are not in minCountArrows

    Scenario: Fine hover on a one-head dest shows no numeral
      Given source phase with reach dest d1 whose minCount is 1
      And the pointer is fine
      And hoverArrow is d1
      Then minCountArrows is empty

  Rule: Unique cheap trips apply; unique priced trips confirm

    Scenario: Unique one-head trip auto-applies
      Given a stack of 1 head on S1
      And dest d1 is reachable with allowed portions [1]
      When the player clicks d1
      Then phase is idle
      And pending is the trip to d1
      And no commit dialog is open

    Scenario: Unique priced trip opens confirm not slider
      Given a stack of 2 heads on S1
      And dest d2 is two steps away so allowed portions are [2]
      When the player clicks d2
      Then phase is portion
      And portionDialogKind is confirm
      And pending is unset
      And highlights.path is the route to d2

    Scenario: Confirm Send applies the unique portion
      Given a confirm dialog for dest d2 with allowed [2]
      When the player Sends 2
      Then phase is idle
      And pending is the two-step trip to d2

    Scenario: Multi-portion dest opens slider
      Given a stack of 4 heads on S1
      And dest d1 is one step away so allowed portions include 1 and 4
      When the player clicks d1
      Then phase is portion
      And portionDialogKind is slider
      And pending is unset
      And highlights.path is the route for the largest allowed portion

  Rule: A send dialog lights only the path; the selected stack is obvious

    Scenario: Commit dialog open washes only the path
      Given portion phase for dest d2 with path P
      And other reach dest d3 is not on P
      Then selectionPaint.reachWash is empty
      And selectionPaint.path equals P
      And d3 is not in reachWash

    Scenario: Selected stack uses halo emphasis
      Given source phase with selected S1
      Then selectionPaint.selected is S1
      And selectedEmphasis is true

    Scenario: Cancel confirm applies nothing
      Given a confirm dialog for dest d2
      When the player cancels
      Then phase is idle
      And pending is unset
