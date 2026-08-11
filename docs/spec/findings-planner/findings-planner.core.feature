# language: en
# Adapter playtest planner — see docs/design/packets/P21-findings-planner.md
Feature: Deterministic findings planner
  As a playtest AI seat
  I want ranked goal-directed findings
  So that expansion, cuts, and closes beat aimless milling

  Background:
    Given a generated tiling match with three players
    And seat B is to move

  Rule: Findings are pure and capped
    Scenario: Opening yields at least one approach or leave-home finding
      When findings are collected for seat B with maxFindings 8
      Then every finding move is a legal step for B
      And findings length is at most 8
      And findings are sorted by descending score then ascending move key

    Scenario: Deterministic across repeated calls
      When findings are collected twice on the same state
      Then both lists are deeply equal

  Rule: Heuristic consumes findings
    Scenario: chooseMove never passes while a step exists
      When seat B has at least one legal step
      Then chooseMove returns a step
