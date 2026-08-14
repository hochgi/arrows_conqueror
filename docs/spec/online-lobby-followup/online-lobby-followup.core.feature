# language: en
# Overview: docs/spec/online-lobby-followup/online-lobby-followup.md
# ADR 0002, packet P27

Feature: Online lobby follow-up
  As two humans sitting down
  I want Create to show it is working, Online to start with two Player seats, and Sign-In to survive a dismissed popup
  So that the first minute of an invite is usable

  Background:
    Given ADR 0002 is accepted
    And P25 createOnlineHost and P19 createOnlinePages exist
    And Google, S3, fetch, and GIS are fakes in tests

  Rule: Create invite wait

    Scenario: Create in flight shows pending and withholds Create
      Given A is signed in in Online mode with two Player chairs
      When A starts Create invite and POST /invites has not settled
      Then createInvitePending is true
      And Create is not offered
      And POST /invites was called once

    Scenario: Create success clears pending and copies the invite URL
      Given A is signed in in Online mode with two Player chairs
      When Create invite POST /invites settles 201 with a token
      Then createInvitePending is false
      And the copied invite URL is present

  Rule: Online Player floor

    Scenario: Switching to Online makes the first two seats Player
      Given a Local plan whose seats are Player, AI, AI
      When the plan is coerced for Online
      Then seats 0 and 1 are human
      And seat 2 is heuristic

    Scenario: Two Player chairs cannot become AI
      Given an Online plan with two human chairs and one heuristic
      When a human chair is changed to heuristic
      Then that change is not allowed

    Scenario: Three Player chairs can become two Player and one AI
      Given an Online plan with three human chairs
      When a human chair is changed to heuristic
      Then that change is allowed

  Rule: Sign-In after One Tap

    Scenario: Sign-In click offers the chooser
      Given Online mode and A is not signed in
      When the host prompts Sign-In
      Then GIS offerChooser was called
