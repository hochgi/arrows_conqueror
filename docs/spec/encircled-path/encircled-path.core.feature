# language: en
# Overview: docs/spec/encircled-path/encircled-path.md
# SPEC §6.3, §6.1, §11 item 40 (P33)

Feature: Encircled path — convert wipes the victim's trail
  As the rules engine
  I want conversion to evaporate the trail that tied encircled stacks together
  So that a winning enclosure does not leave enemy path paint on the claimer's land

  Background:
    Given a board behind GeometryPort
    And a game state of occupancy, trails and territory
    And it is player A's turn

  Rule: Convert wipe clears the encircled path

    Scenario: A converted stack-grade raider loses its empty trail on the claimer's land
      Given player B has a stack on player A's territory with only stack-grade trail
      And that trail continues onto empty arrows that are also A's territory
      When an apply resolves and the stack converts
      Then the group on that arrow is owned by A at the same head count
      And B's trail is absent from the converted arrow
      And B's trail is absent from those empty arrows the wipe reached

    Scenario: Two converted stacks leave no connecting victim trail
      Given player B has two stacks on player A's territory on one stack-grade trail
      And empty B trail arrows lie between them on A's territory
      And neither stack has a territory-grade path home
      When an apply resolves and both stacks convert
      Then both groups are owned by A
      And B's trail is absent from both converted arrows
      And B's trail is absent from the arrows that connected them

    Scenario: Closing around a garrison leaves no enemy trail on claimed tiles
      Given player B occupies an arrow that player A's closure will claim
      And B has trail on that arrow or on other arrows the closure takes
      And B has no territory-grade trail from that occupation
      When player A completes the closure
      Then those taken arrows are player A's territory
      And B's trail is absent from every taken arrow

    Scenario: A converted fork loses both arms
      Given player B has stack-grade trail that forks at a point on A's territory
      And both arms lie on A's territory
      And B's stacks on that component convert
      When conversion resolves
      Then B's trail is absent from the stem
      And B's trail is absent from both arms
