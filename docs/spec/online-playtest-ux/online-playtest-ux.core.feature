# language: en
# Overview: docs/spec/online-playtest-ux/online-playtest-ux.md
# ADR 0002, packet P26

Feature: Playtest online lobby and HUD
  As two humans on an invite
  I want to see who sat down and the same chairs on every device
  So that Start and the board match the invite we created

  Background:
    Given ADR 0002 is accepted
    And P19 createOnlinePages and P25 createOnlineHost exist
    And Google, S3, fetch, and GIS are fakes in tests

  Rule: Game GET carries seats

    Scenario: GET game includes meta seats
      Given a started game whose meta is two human and one heuristic
      When a bound human GETs that game
      Then the 200 body includes those three seats
      And no Google sub is in the body

    Scenario: Two clients show the same seat kinds
      Given GET game returns A human, B human, C heuristic
      When each client builds the HUD log from that board
      Then both summaries have C as heuristic

  Rule: Host sees the lobby

    Scenario: Creator does not need to Accept
      Given A created an invite and is bound on a human chair
      Then Accept is not offered

    Scenario: Guest may Accept until bound
      Given A created an invite with a human chair still waiting
      And B is signed in on that invite hash and is not yet seated
      Then Accept is offered

    Scenario: refreshLobby sees the other human bind
      Given A created an invite with a human seat still unbound
      Then Start is not offered
      When refreshLobby peeks and that seat is now bound
      Then Start is offered

    Scenario: 410 started opens the match for the waiting host
      Given A holds an invite token and has no open board
      When refreshLobby peeks and the invite is 410 started with group G game 000001
      Then the hash is #/g/G/000001
      And GET /games/G/000001 is called

  Rule: Exhausted online turn

    Scenario: Own turn with no steps POSTs endTurn
      Given A is to move online
      And legalMoves has no step
      When the shell auto-passes
      Then POST /moves carries endTurn
      And the client did not local-apply
