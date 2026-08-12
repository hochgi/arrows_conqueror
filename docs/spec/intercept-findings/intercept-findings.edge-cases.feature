# language: en
# See docs/spec/intercept-findings/intercept-findings.md (P23)

Feature: Intercept findings — edge cases (P23)
  As a findings author
  I want gates and exclusions explicit
  So that intercept does not invent futile or mislabelled goals

  Background:
    Given a tiling geometry with layout positions
    And the findings planner collecting for player Bot

  Rule: Eligibility

    Scenario: Stack-grade or short trails do not get intercept
      Given enemy E has only a stack-grade trail tip
      When Bot collects findings
      Then no intercept finding targets that tip

    Scenario: Territory-grade trail shorter than 3 does not get intercept
      Given enemy E has a territory-grade trail of length 2
      When Bot collects findings
      Then no intercept finding targets that trail

  Rule: Degenerate triangles

    Scenario: Colinear or zero-area frontier pairs are skipped
      Given a tip whose candidate frontier pairs all have near-zero triangle area
      When the planner scores that tip
      Then no intercept is emitted for want of a usable triangle

  Rule: Cut approach bounds

    Scenario: No cut within distCap means no intercept
      Given an eligible tip with positive x and favourable ETAs on paper
      And no Bot stack can reach a cutting step within distCap grain steps
      When Bot collects findings
      Then no intercept finding is emitted for that tip

  Rule: Determinism and purity

    Scenario: Same state yields the same intercept set
      Given a fixed match state where intercepts exist
      When Bot collects findings twice
      Then both results are deeply equal
      And neither collection uses time or randomness

  Rule: Scoring schedule

    Scenario Outline: Reward clamps
      Given x and n that yield raw ratio R = 160 * x / n
      When an intercept is emitted with that x and n
      Then reward equals clamp of R between 25 and 105 rounded
      And score equals reward times 100 minus max(1, n) times 10

      Examples:
        | x   | n | note           |
        | 0.5 | 2 | mid ratio      |
        | 2   | 1 | hits high clamp|
        | 0.1 | 8 | hits low clamp |
