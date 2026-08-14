# language: en
# Overview: docs/spec/online-shell/online-shell.md
# ADR 0002, packet P25

Feature: Pages online host
  As a Google-signed-in player
  I want the playtest page to bind GIS, hash, visibility, and WS to the P19 adapter
  So that Online is reachable on GitHub Pages without a local hot-seat

  Background:
    Given ADR 0002 is accepted
    And P19 createOnlinePages exists
    And window, GIS, fetch, and WebSocket are fakes in tests

  Rule: Env and Local

    Scenario: Missing env hides Online
      Given VITE_GOOGLE_CLIENT_ID is empty
      Then Online mode is not offered
      And Local Start still runs in-process

    Scenario: Local Start never calls the API
      Given Local mode
      And the seat plan is one human and two heuristic
      When the player Starts
      Then fetch to VITE_API_BASE was not called
      And no WebSocket was opened

  Rule: GIS and session

    Scenario: GIS yield signs in and opens a WebSocket
      Given the env vars are set
      When GIS yields A's ID token
      Then the host delivers that token to the adapter
      And one WebSocket is opened with that access_token

    Scenario: Sign-out from the host clears the session
      Given A is signed in
      When A signs out via the host
      Then sessionStorage has no conquarrow:google-id-token
      And that WebSocket is closed

  Rule: Hash and invite

    Scenario: Unsigned invite hash peeks then prompts GIS
      Given the hash is #/invite/<token>
      And the host has no session token
      When the host boots
      Then GET /invites/<token> is called
      And GIS is prompted
      And the host is in Online mode

    Scenario: Signed-in invite offers Accept and does not auto-accept
      Given A is signed in
      And the hash is #/invite/<token>
      When the host boots
      Then Accept is offered
      And accept is not POSTed

    Scenario: Online Start is offered only when humans are bound
      Given A is signed in in Online mode
      And A created an invite with a human seat still unbound
      Then Start is not offered
      When that seat binds
      Then Start is offered

  Rule: Wake-ups

    Scenario: WS onmessage GETs the open game
      Given A has #/g/<groupHash>/<gameNumber> open
      When the socket receives valid stateChanged JSON for that game
      Then the adapter GETs that game

    Scenario: visibilitychange GETs the open game
      Given A has #/g/<groupHash>/<gameNumber> open
      When the document becomes visible
      Then the adapter GETs that game

    Scenario: hashchange boots the new hash
      Given A is signed in
      When the hash changes to #/g/<groupHash>/<gameNumber>
      Then the adapter GETs that game

  Rule: Play

    Scenario: Online move uses the GET board
      Given A is to move on #/g/<groupHash>/<gameNumber> at version 0
      When A submits a legal endTurn via the host
      Then the adapter POSTs the move
      And the board is the following GET
      And the host did not apply locally
