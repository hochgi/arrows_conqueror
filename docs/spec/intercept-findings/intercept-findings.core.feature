# language: en
# See docs/spec/intercept-findings/intercept-findings.md (P23)

Feature: Intercept findings — in-time cuts against projected closes
  As a playtest bot using the findings planner
  I want to race enemy tips that are closing valuable triangles
  So that large early enclosures get contested before they land

  Background:
    Given a tiling geometry with layout positions
    And the findings planner collecting for player Bot
    And an enemy player E with territory-grade trail length at least 3

  Rule: Imagined triangle and value x

    Scenario: x sums force of spawners inside the tip-frontier triangle
      Given E has a tip T whose apex and two frontier points form a triangle
      And spawners S_in lie strictly inside that triangle with total force X
      And spawners S_out lie outside it
      When the planner scores tip T
      Then x equals X
      And force from S_out is not included in x

  Rule: In-time intercept emission

    Scenario: Bot in time emits intercept toward a cut
      Given E's tip needs enemyETA turns to reach E territory at its speed
      And Bot has a steppable stack that can cut E's existing trail in n grain steps
      And botETA is ceil of n over that stack's speed
      And botETA is less than or equal to enemyETA
      And x is positive
      When Bot collects findings
      Then an intercept finding exists whose move reduces grain distance to a cut
      And that finding's cost is max(1, n)
      And its reward is the clamped x/n schedule from the packet

    Scenario: Bot too late emits no intercept for that tip
      Given the same tip with positive x
      And botETA is greater than enemyETA
      When Bot collects findings
      Then no intercept finding is emitted for that tip

  Rule: Priority with existing findings

    Scenario: Immediate cut stays classified as cut
      Given Bot has a legal step that shrinks E's trail this ply
      When Bot collects findings
      Then that step is a cut finding
      And it is not labelled intercept
