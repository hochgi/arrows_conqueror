# language: en
# Overview: docs/spec/online-moves-ws/online-moves-ws.md
# ADR 0002, packet P18

Feature: Online moves, heuristic burst, and notify
  As a Google-signed-in player seated in a started game
  I want to submit one move and have heuristic seats finish in the same request
  So that the other humans can refresh from S3 without a poll loop

  Background:
    Given ADR 0002 is accepted
    And Google ID tokens verify against a fake verifier in tests
    And S3 is a fake store
    And the heuristic chooser is injected
    And PostToConnection is a fake sink

  Rule: Ensure opening

    Scenario: First member GET materialises opening at version 0
      Given A and B have started a 3-seat invite with seats human, human, heuristic
      And fake S3 has game meta and no state.json
      When GET /games/:groupHash/:gameNumber with A's bearer
      Then the response is 200
      And the body version is 0
      And the body state has three players
      And the body state activePlayer is the first seat
      And fake S3 holds state.json and log.jsonl
      And the body does not contain a Google sub

    Scenario: Opening GET runs heuristic seats before the first human
      Given a started 3-seat game with seats heuristic, human, human
      And A is bound at seat 1
      And the heuristic chooser always endTurns
      When GET /games/:groupHash/:gameNumber with A's bearer
      Then the response is 200
      And the body version is 0
      And the body state activePlayer is A's player
      And log.jsonl contains exactly one endTurn
      And other bound humans received stateChanged for version 0
      And A did not receive stateChanged for this GET

  Rule: Human move then next human

    Scenario: Human move with next seat human is one apply
      Given an all-human 3-seat started game with A to move at version 0
      And B and C are the other seats
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is a legal step for A
      Then the response is 200
      And the body version is 1
      And fake S3 state.json version is 1
      And log.jsonl contains exactly that one move
      And B and C received stateChanged for version 1
      And A did not receive stateChanged for this POST

  Rule: Heuristic burst

    Scenario: Human endTurn then four heuristic seats persist once
      Given a started 6-seat game with seats human, heuristic, heuristic, heuristic, heuristic, human
      And A is seat 0 to move at version 0
      And F is seat 5
      And the heuristic chooser always endTurns
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is endTurn
      Then the response is 200
      And the body version is 1
      And log.jsonl contains five moves
      And the body of GET with F's bearer has activePlayer F
      And fake S3 has a single state.json persist at version 1

    Scenario: Burst that ends the game mid-AI persists terminal state
      Given a started game whose next heuristic apply will set a winner
      And A is the active human at version 0
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is a legal move that leaves a heuristic seat active
      Then the response is 200
      And GET with A's bearer has state.winner set
      And game meta has winner equal to that player
      And the heuristic chooser is not asked after winner is set
      And log.jsonl stops at the move that set the winner

  Rule: Library refresh

    Scenario: Member GET after a move returns the new version
      Given A has just posted a successful move to version 1
      When GET /games/:groupHash/:gameNumber with A's bearer
      Then the response is 200
      And the body version is 1
      And the body state matches the persisted position

  Rule: WebSocket registry

    Scenario: Connect stores a pointer and disconnect deletes it
      Given A has a valid Google ID token
      When A opens the WebSocket with that access_token
      Then the connect result is 200
      And fake S3 holds connections/<A userHash>/<connectionId>
      When A disconnects
      Then that connection key is gone
      And no group or game object was written by connect or disconnect
