# language: en
# Overview: docs/spec/combat/combat.md
# SPEC §6.2, §11 item 37

Feature: Contact combat — boundaries, arithmetic, and purity
  As the rules engine
  I want the floor rule and the non-triggers pinned as scenarios
  So that contested-point combat cannot quietly return

  Background:
    Given a fixture board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: Floor tie-break and caps

    Scenario: When both floors are 0 and weights are positive, the larger weight takes 1
      # Defensive clause of §6.2 step 4. Under the max=D magnitude step with positive
      # integer A,D, one pre-floor loss is always D ≥ 1, so both-zero is unreachable in
      # ordinary play — keep the rule as written for degenerate inputs; do not invent a
      # second magnitude step to make this reachable.
      Given A and D such that scaled losses floor to 0 for both sides
      And the loss weights are positive
      When combat resolves
      Then exactly one side loses 1 head
      And if the weights were equal, the defender takes that 1

    Scenario: Attacker loss never exceeds A; defender loss never exceeds D
      Given any positive A and D
      When combat resolves
      Then attacker heads lost ≤ A
      And defender heads lost ≤ D

  Rule: Partial step counts and stay-behind

    Scenario: Only the stepping count fights — remainder on the source is untouched by losses
      Given player A has 4 heads on arrow from1
      And player A steps 2 of them onto an enemy of 2 heads
      When combat resolves
      Then losses are computed with A = 2
      And any heads left on from1 were not part of the exchange
      # Stay-behind is satisfied (2 remain ≥ 1).

    Scenario: legalMoves omits emptying attacks and lone-head attacks
      Given player A has 1 head beside an enemy
      When legalMoves is asked
      Then no step onto that enemy is offered for that head
      Given player A has 3 heads beside an enemy
      When legalMoves is asked
      Then steps of count 1 and 2 onto the enemy are offered
      And a step of count 3 onto the enemy is not
  Rule: Purity and determinism

    Scenario: Applying combat does not mutate the input state
      Given a state S0 in which player A can attack
      When I apply the attacking step to S0 yielding S1
      Then S0's groups are unchanged
      And S1 shows the post-combat occupancy

    Scenario: Equal inputs yield equal combat outcomes
      Given the same A, D and geometry
      When I resolve the attack twice
      Then both resulting states have equal group maps in the same order

    Scenario: Loss arithmetic uses no floating point and no randomness
      Given any A and D
      When combat resolves
      Then the losses equal the exact floor rule of §6.2
      # ADR 0001. Integer cross-products or rationals — never Math.random, never float.
