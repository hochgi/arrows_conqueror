# language: en
# Overview: docs/spec/online-moves-ws/online-moves-ws.md
# ADR 0002, packet P18

Feature: Online moves and notify — boundaries
  As the operator
  I want illegal callers refused and partial writes retry-safe
  So that a double-tab or a dropped socket cannot clobber history

  Background:
    Given ADR 0002 is accepted
    And Google ID tokens verify against a fake verifier in tests
    And S3 is a fake store
    And the heuristic chooser is injected
    And PostToConnection is a fake sink

  Rule: Authz

    Scenario: Unauthenticated GET game is 401
      Given a started game
      When GET /games/:groupHash/:gameNumber without a bearer
      Then the response is 401
      And fake S3 still has no state.json

    Scenario: Unauthenticated POST moves is 401
      Given a started game at version 0
      When POST /games/:groupHash/:gameNumber/moves without a bearer
      Then the response is 401
      And the stored version is still 0

    Scenario: WebSocket connect without a token is 401
      When a client opens the WebSocket without access_token
      Then the connect result is 401
      And fake S3 holds no connections keys

    Scenario: Non-member GET does not materialise
      Given A and B have started a game
      And C has a valid Google token and is not seated
      When GET /games/:groupHash/:gameNumber with C's bearer
      Then the response is 403
      And fake S3 has no state.json

    Scenario: Bound human who is not to move is 403
      Given an all-human 3-seat game with A to move at version 0
      When POST /games/:groupHash/:gameNumber/moves with B's bearer
      And If-Match is "0"
      And the body move is endTurn
      Then the response is 403
      And the stored version is still 0
      And log.jsonl is unchanged

    Scenario: Unknown game is 404
      When GET /games/deadbeefdeadbeefdeadbeefdeadbeef/000001 with A's bearer
      Then the response is 404
      When POST /games/deadbeefdeadbeefdeadbeefdeadbeef/000001/moves with A's bearer
      And If-Match is "0"
      And the body move is endTurn
      Then the response is 404

  Rule: Concurrency and legality

    Scenario: Missing If-Match is 428
      Given A is to move at version 0
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is omitted
      And the body move is endTurn
      Then the response is 428
      And the stored version is still 0

    Scenario: Stale If-Match is 412
      Given A is to move at version 1
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is endTurn
      Then the response is 412
      And the stored version is still 1

    Scenario: Illegal move is 422
      Given A is to move at version 0
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is a step the rules reject
      Then the response is 422
      And the stored version is still 0
      And log.jsonl has no new line

    Scenario: POST after winner is 409 finished
      Given a started game whose state.winner is already set
      When POST /games/:groupHash/:gameNumber/moves with a bound human's bearer
      And If-Match is the current version
      And the body move is endTurn
      Then the response is 409
      And the body reason is finished
      And S3 is unchanged

    Scenario: Member GET of a finished game is 200
      Given a started game whose state.winner is set
      When GET /games/:groupHash/:gameNumber with a bound human's bearer
      Then the response is 200
      And the body state winner matches meta.winner

    Scenario: POST without a prior GET still ensures then applies
      Given A and B have started a game with A in the first human seat
      And fake S3 has no state.json
      When POST /games/:groupHash/:gameNumber/moves with A's bearer
      And If-Match is "0"
      And the body move is endTurn
      Then the response is 200
      And the body version is 1
      And fake S3 holds state.json and log.jsonl

  Rule: Notify hygiene

    Scenario: Gone connection id is dropped
      Given B has a stored connection id
      And PostToConnection reports that id gone
      When A posts a successful move
      Then B's connection key is deleted
      And the persist still succeeded
      And C still received stateChanged if C is a bound human with a live connection

    Scenario: Heuristic seats are not notified
      Given a 3-seat game with seats human, human, heuristic
      When A posts a successful move
      Then stateChanged was sent only to B's connections
      And no notify targeted a missing userHash

  Rule: P17 follow-on races

    Scenario: Concurrent accept does not share a chair
      Given an open 3-seat invite by A with seats human, human, human
      And seats 1 and 2 are unbound
      When B and C POST accept on that token at the same time
      Then one response is 200 with B on one human seat
      And the other is 200 with C on a different human seat
      And no seat lists both userHashes

    Scenario: Last chair concurrent accept is 409 for the loser
      Given an open 3-seat invite with two humans bound and one human seat left
      When B and C POST accept on that token at the same time
      Then exactly one response is 200
      And the other is 409
      And the invite has exactly three seats

    Scenario: Start does not overwrite an existing game number
      Given group G already has games/000001/meta.json
      When a new invite of the same two humans Starts
      Then the new game number is 000002
      And games/000001/meta.json is unchanged

    Scenario: Retry Start finishes the same game
      Given Start has written games/000001/meta.json
      And the invite is still open
      When POST /invites/:token/start with a bound human's bearer again
      Then the response is 200
      And the body gameNumber is 000001
      And fake S3 has no games/000002
      And the invite status is started

    Scenario: After completed Start the token is still 410
      Given A and B have completed Start
      When POST /invites/:token/start with A's bearer again
      Then the response is 410
      And the body reason is started

  Rule: Stub retirement

    Scenario: P16 POST /moves stub is gone
      When POST /moves with A's bearer
      Then the response is not 501
      And the response is 404
