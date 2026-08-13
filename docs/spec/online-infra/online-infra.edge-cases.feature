# language: en
# Overview: docs/spec/online-infra/online-infra.md
# ADR 0002, packet P16

Feature: Cheap online edge — boundaries
  As the operator
  I want the skeleton to refuse the wrong account and the wrong GitHub repo
  So that a hobby deploy cannot land on employer AWS or the Pages fork

  Background:
    Given ADR 0002 is accepted

  Rule: Personal AWS only

    Scenario: Template does not name an employer account
      When I read the SAM template and the API workflow
      Then neither file contains an employer or Versatile account id
      And the OIDC trust is scoped to repo hochgi/conquarrow

    Scenario: Son's fork is not trusted to deploy AWS
      When I read the API workflow and IAM trust
      Then shalevhoch/conquarrow is not a trusted OIDC subject

  Rule: DNS stays on Namecheap

    Scenario: Checklist does not NS-delegate games
      When I read the infra operator README
      Then it lists CNAMEs for api.games and ws.games
      And it lists ACM validation CNAMEs
      And it does not instruct creating a Route53 hosted zone for games.hochgi.com

  Rule: Stub handlers do not invent product behaviour

    Scenario: Health is the only HTTP product route in this packet
      When the HTTP API is deployed
      Then /health is defined
      And invite and move routes are absent or return not implemented

    Scenario: Connect stubs do not require a finished game
      When a client connects to the WebSocket mapping
      Then the connect integration succeeds or fails closed without writing a group or game object
