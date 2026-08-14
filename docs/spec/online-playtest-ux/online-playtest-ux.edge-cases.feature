# language: en
# Overview: docs/spec/online-playtest-ux/online-playtest-ux.md
# ADR 0002, packet P26

Feature: Playtest online UX — boundaries
  As the operator
  I want dead invites and Local hot-seat unchanged
  So that P26 cannot surprise the rules core or revoke copy

  Background:
    Given ADR 0002 is accepted
    And window, GIS, fetch, and S3 are fakes in tests

  Rule: 410 bodies

    Scenario: Revoke 410 has no game ids
      Given the creator revoked the invite
      When anyone GETs that token
      Then the status is 410
      And the body reason is revoked
      And the body has no groupHash

    Scenario: Started 410 without ids still blocks accept
      Given a 410 started body with reason only
      Then Accept is not offered
      And accept is not POSTed

  Rule: Frozen roster

    Scenario: Live invite does not offer seat-kind edits
      Given A created an invite
      Then seat-kind edits are not offered

    Scenario: Online create still requires two Player chairs
      Given A is signed in in Online mode
      And the seat plan is one human and two heuristic
      Then Create is not offered

  Rule: Visibility and Local

    Scenario: Becoming visible peeks a held invite
      Given A holds an invite token and is not on a game hash
      When the document becomes visible
      Then GET /invites/<token> is called

    Scenario: Local exhausted turn still does not fetch
      Given Local mode
      When auto-pass applies endTurn in-process
      Then fetch to VITE_API_BASE was not called
