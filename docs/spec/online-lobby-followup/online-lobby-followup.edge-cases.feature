# language: en
# Overview: docs/spec/online-lobby-followup/online-lobby-followup.md
# ADR 0002, packet P27

Feature: Online lobby follow-up — boundaries
  As the operator
  I want Create failure, Local hot-seat, and auto One Tap unchanged except the dismiss recovery
  So that P27 cannot surprise Local play or the unsigned invite peek

  Background:
    Given ADR 0002 is accepted
    And window, GIS, fetch, and S3 are fakes in tests

  Rule: Create settle and single flight

    Scenario: Create failure clears pending and has no invite URL
      Given A is signed in in Online mode with two Player chairs
      When Create invite POST /invites settles 500
      Then createInvitePending is false
      And the copied invite URL is absent

    Scenario: A second Create while pending does not POST again
      Given A is signed in in Online mode with two Player chairs
      And Create invite POST /invites has not settled
      When A starts Create invite again
      Then POST /invites was called once

  Rule: Local and extra chairs

    Scenario: Local still allows one Player
      Given the default Local 3-seat plan
      Then seat 0 is human
      And seats 1 and 2 are heuristic

    Scenario: Online coerce maps leftover BYOK to AI
      Given a Local plan whose seats are BYOK, BYOK, BYOK
      When the plan is coerced for Online
      Then seats 0 and 1 are human
      And seat 2 is heuristic

    Scenario: Online AI to Player is always allowed
      Given an Online plan with two human chairs and one heuristic
      When the heuristic chair is changed to human
      Then that change is allowed

  Rule: GIS One Tap vs chooser

    Scenario: One Tap skip still offers a chooser
      Given GIS One Tap reports skipped
      When the GIS adapter prompts
      Then a Sign-In chooser is offered

    Scenario: Unsigned invite hash still One Taps
      Given an unsigned invite hash
      When the host boots
      Then GIS prompt was called
      And GIS offerChooser was not required for that boot
