# language: en
# Overview: docs/spec/online-web/online-web.md
# ADR 0002, packet P19

Feature: Online Pages adapter — boundaries
  As the operator
  I want Local play billed to nobody and stale tabs not clobbering moves
  So that a dropped socket or a missing env cannot surprise the API

  Background:
    Given ADR 0002 is accepted
    And GIS, fetch, WebSocket, and sessionStorage are fakes in tests

  Rule: Mode and env

    Scenario: Missing env disables Online
      Given VITE_API_BASE is empty
      Then Online mode is not offered
      And fetch to the API was not called

    Scenario: Online mode does not offer BYOK
      Given the env vars are set
      And A is signed in in Online mode
      Then the seat kind options are human and heuristic
      And BYOK is not offered

    Scenario: Online create requires two human seats
      Given A is signed in in Online mode
      And the seat plan is one human and two heuristic
      Then Create is not offered
      And POST /invites is not called

    Scenario: Local all-AI never calls the API
      Given Local mode
      And the seat plan is three heuristic
      When the player Starts
      Then fetch to VITE_API_BASE was not called

  Rule: Invite edges

    Scenario: Full lobby shows game full
      Given an invite with every human seat bound
      And the hash is #/invite/<token>
      And C is signed in and not seated
      When C accepts
      Then the adapter shows the lobby is full
      And no game hash is set

    Scenario: Dead invite is not accepted
      Given the hash is #/invite/<token>
      And GET invite returns 410 with reason started
      Then accept is not POSTed
      And the adapter shows started

  Rule: Move errors

    Scenario: Stale If-Match refreshes and drops the move
      Given A is to move at version 0
      When A submits a move
      And POST returns 412
      Then the adapter GETs the game
      And the in-flight move is not POSTed again
      And the board is the GET body

    Scenario: Illegal move keeps the last GET
      Given A is to move at version 0 with board S
      When A submits a move
      And POST returns 422
      Then the board is still S
      And the adapter did not apply locally

    Scenario: POST after winner becomes view-only
      Given A is to move
      When A submits a move
      And POST returns 409 with reason finished
      Then the adapter GETs the game
      And further moves are not POSTed

    Scenario: Not to move does not POST
      Given the open game's active seat is not A
      And A is signed in
      When A attempts a move
      Then POST /moves is not called

  Rule: Library

    Scenario: Library resume does not apply a previous lobby's seats
      Given A created an invite (A on seat 0)
      And A opens a different my-games row whose active player is B
      When A submits a move
      Then POST /moves is called
      And invite seats are unset

  Rule: Auth and refresh

    Scenario: 401 keeps the hash and prompts Sign-In
      Given the hash is #/g/<groupHash>/<gameNumber>
      When GET returns 401
      Then GIS is prompted
      And the hash is unchanged

    Scenario: Refresh restores the session token
      Given sessionStorage holds A's ID token
      And the hash is #/g/<groupHash>/<gameNumber>
      When the adapter starts
      Then a WebSocket is opened with that access_token
      And the adapter GETs that game

  Rule: Wake-ups

    Scenario: visibilitychange GETs the open game
      Given A has #/g/<groupHash>/<gameNumber> open
      When the document becomes visible
      Then the adapter GETs that game

    Scenario: stateChanged for another game does not replace the board
      Given A has #/g/G1/000001 open at version 0
      When a stateChanged arrives for G2 game 000001
      Then the board is still G1 000001 version 0
      And the adapter GETs /my-games
