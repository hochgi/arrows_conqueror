# language: en
# Overview: docs/spec/online-shell/online-shell.md
# ADR 0002, packet P25

Feature: Pages online host — boundaries
  As the operator
  I want the shell not to leak Local BYOK into Online or accept dead invites
  So that Pages cannot surprise the API

  Background:
    Given ADR 0002 is accepted
    And window, GIS, fetch, and WebSocket are fakes in tests

  Rule: Lobby chrome

    Scenario: Online mode does not offer BYOK
      Given the env vars are set
      And Online mode is selected
      Then the seat kind options are human and heuristic

    Scenario: Online create requires two human seats
      Given A is signed in in Online mode
      And the seat plan is one human and two heuristic
      Then Create is not offered

    Scenario: Online create requires Sign-In
      Given Online mode
      And the seat plan is two human and one heuristic
      And the host has no session token
      Then Create is not offered

    Scenario: Copy-invite uses the Pages pathname
      Given A is signed in in Online mode
      When A creates an invite
      Then the copied URL contains #/invite/<token>
      And the copied URL does not contain A's Google sub

    Scenario: Library row opens the game hash
      Given A is signed in
      And GET /my-games lists group G game 000001
      When A opens that row via the host
      Then the hash is #/g/G/000001

  Rule: Invite 410

    Scenario: 410 without reason still blocks accept
      Given the hash is #/invite/<token>
      And GET invite returns 410 with an empty body
      Then accept is not POSTed
      And the host treats the invite as gone

  Rule: Move errors

    Scenario: 422 surfaces illegal and keeps the GET board
      Given A is to move at version 0 with board S
      When A submits a move via the host
      And POST returns 422
      Then the board is still S
      And the host surfaces illegal

    Scenario: Invalid WS payload does not replace the board
      Given A has #/g/G1/000001 open at version 0
      When the socket receives "{not-json"
      Then the board is still G1 000001 version 0
