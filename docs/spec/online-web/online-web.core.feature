# language: en
# Overview: docs/spec/online-web/online-web.md
# ADR 0002, packet P19

Feature: Online Pages adapter
  As a Google-signed-in player
  I want the playtest client to create invites, sit, and play over REST
  So that two humans can meet without a local hot-seat

  Background:
    Given ADR 0002 is accepted
    And GIS, fetch, WebSocket, and sessionStorage are fakes in tests
    And VITE_API_BASE, VITE_WS_URL, and VITE_GOOGLE_CLIENT_ID are set

  Rule: Invite link

    Scenario: Signed-out invite link Sign-In then accept
      Given an open invite created by A with a human seat unbound
      And the hash is #/invite/<token>
      And the adapter has no session token
      When GIS yields B's ID token
      Then the adapter POSTs accept with that bearer
      And B is bound on a human seat
      And the session token is stored under conquarrow:google-id-token

  Rule: Lobby

    Scenario: Online lobby copies an invite hash link
      Given A is signed in in Online mode
      When A creates an invite with seats human, human, heuristic
      Then the copied URL ends with #/invite/<token>
      And the copied URL does not contain A's Google sub

    Scenario: Online Start opens the game hash
      Given A and B are bound on an open invite
      And A is signed in in Online mode
      When A Starts
      Then the hash is #/g/<groupHash>/<gameNumber>
      And the adapter GETs that game
      And the board version is 0

  Rule: Local stays local

    Scenario: Local 1-human plus AI never calls the API
      Given Local mode
      And the seat plan is one human and two heuristic
      When the player Starts
      Then fetch to VITE_API_BASE was not called
      And no WebSocket was opened

  Rule: Play

    Scenario: Human move POSTs then GETs server state
      Given A is to move on #/g/<groupHash>/<gameNumber> at version 0
      When A submits a legal endTurn
      Then the adapter POSTs the move with If-Match "0"
      And the adapter GETs the game
      And the board is that GET body
      And the adapter did not apply the move locally

    Scenario: WS wake-up GETs the open game
      Given A has #/g/<groupHash>/<gameNumber> open at version 0
      When a stateChanged arrives for that groupHash and gameNumber at version 1
      Then the adapter GETs that game
      And the board version is 1

  Rule: Library

    Scenario: My-games resume opens the stored game hash
      Given A is signed in
      And GET /my-games lists group G game 000001
      When A opens that row
      Then the hash is #/g/G/000001
      And the adapter GETs that game

    Scenario: Finished game is view-only
      Given A opens #/g/<groupHash>/<gameNumber>
      And GET returns a state with winner set
      Then the board shows that terminal state
      And a further move is not POSTed

  Rule: Session socket

    Scenario: Sign-In opens a WebSocket and Sign-out closes it
      Given GIS yields A's ID token
      When A signs in
      Then one WebSocket is opened with access_token equal to that token
      When A signs out
      Then that WebSocket is closed
      And sessionStorage has no conquarrow:google-id-token
