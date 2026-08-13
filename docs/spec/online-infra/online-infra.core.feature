# language: en
# Overview: docs/spec/online-infra/online-infra.md
# ADR 0002, packet P16

Feature: Cheap online edge — SAM, DNS mapping, CI
  As the operator of a hobby game on personal AWS
  I want HTTP and WebSocket APIs under shared games hostnames
  So that conquarrow can ship without a per-game subdomain or idle database

  Background:
    Given ADR 0002 is accepted
    And the deploy target is the owner's personal AWS account

  Rule: Shared hostnames, game in the path

    Scenario: HTTP health is reachable under the game path
      When the HTTP API is deployed with base-path mapping conquarrow
      Then GET https://api.games.hochgi.com/conquarrow/health returns a success
      And the response does not require a Google token

    Scenario: WebSocket URL uses the shared ws host and the game path
      When the WebSocket API is deployed with base-path mapping conquarrow
      Then a client may open wss://ws.games.hochgi.com/conquarrow

  Rule: Private store sized for a heuristic burst

    Scenario: Match bucket is not public
      When the stack is deployed
      Then the match bucket denies public access
      And Lambdas in the stack may read and write keys under conquarrow/

    Scenario: Move Lambda has the burst budget
      When the stack is deployed
      Then the move function is configured for 60 seconds timeout
      And the move function is configured for 1024 MB memory

  Rule: Deploy from the owner's fork

    Scenario: API workflow deploys from hochgi main
      Given a push to hochgi/conquarrow main that touches infra or online-api
      Then GitHub Actions assumes the personal-account OIDC role
      And sam deploy runs

    Scenario: Docs-only push does not deploy the API
      Given a push that only changes SPEC.md or docs/**
      Then the API deploy workflow does not run sam deploy
