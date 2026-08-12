# language: en
# See docs/spec/trails-simple/trails-simple.md (P22 beta)

Feature: Simple trails — free branching and legal dormant marks
  As a player on the P22 beta rules
  I want free joins/splits and persistent cut tails
  So that tips do not freeze and trail marks stay readable until cut or re-attach

  Background:
    Given a conformant fixture board
    And players A and B with disjoint starting territory

  Rule: Branching costs nothing

    Scenario: A lone head may create a split
      Given player A has a size-1 tip on trail arrow T1 leaving home
      And T1's target point already has one trail out-arrow of A
      When A steps the tip onto a second out-arrow T2, vacating T1
      Then the step is legal
      And A's trail includes both out-arrows
      And no head is required on T1 or T2 for the branch

    Scenario: A join may vacate the last in-arrow head
      Given player A has a join at point P with two trail in-arrows I1 and I2
      And A's only head at the join sits on I1
      When A steps that head off I1 along the grain
      Then the step is legal
      And I1 may become empty while remaining in A's trail

    Scenario: Unlimited successive forks
      Given player A has a mobile stack of size 3 on trail
      When A creates three successive splits in three steps without leaving sentries
      Then all three steps are legal
      And each new arm is in A's trail

  Rule: Dormant marks persist

    Scenario: Vacating a tip leaves headless trail
      Given player A has a size-1 tip on stack-grade trail arrow Tip
      And no other A stack shares that trail component
      When A steps the tip onto a new arrow along the grain
      Then Tip remains in A's trail
      And the component may be dormant if Tip no longer reaches a stack or territory

    Scenario: Cut evaporates between cut and firebreaks; distal marks remain
      Given player A has territory-rooted trail Home-Sentry-Tip with a sentry on Mid
      And player B cuts A's trail at a point between Home and Mid
      When evaporation resolves
      Then trail between the cut and Mid is gone
      And Mid and the distal stretch toward Tip remain in A's trail if not entered by a front

  Rule: Land on territory still paints

    Scenario: Territory-rooted land bridge claims the full path
      Given player A has a territory-rooted open trail from home to tip
      When the tip lands on A's territory
      Then every arrow on the against-grain claim walk becomes A's territory
      And no distal trail remains on that walk

    Scenario: Territory-rooted closed path fills the pocket
      Given player A has a territory-rooted trail that rings a pocket
      When the tip lands on A's territory
      Then the claim walk becomes territory
      And the enclosed pocket becomes A's territory
