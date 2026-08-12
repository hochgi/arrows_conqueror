# language: en
# See docs/spec/trails-simple/trails-simple.md (P22 beta)

Feature: Simple trails — edge cases (P22 beta)
  As a rules author
  I want boundaries for dormant, convert scrub, and firebreak-capped paint
  So that the beta does not invent silent defaults

  Background:
    Given a conformant fixture board
    And players A and B with disjoint starting territory

  Rule: No size-1 freeze

    Scenario: Sole stack-grade tip may vacate
      Given player A has a size-1 stack on a stack-grade fragment with no path to A's territory
      When A lists legal moves from that stack
      Then at least one grain step that vacates the arrow is legal

  Rule: Convert strips arrow trail but does not scrub orphans

    Scenario: Converted stack loses trail on its arrow; distal dormant remains
      Given player B has heads inside A's territory with only stack-grade trail
      And that trail continues onto empty trail arrows beyond the converted stack
      When conversion resolves
      Then the converted stack becomes A's at the same head count
      And B's trail is absent from the converted arrow
      And B's trail may remain on the distal empty arrows (dormant)

  Rule: Firebreak-capped paint on unanchored reconnect

    Scenario: Unanchored tip lands home — paint stops before firebreak
      Given player A has a dormant-or-stack-grade fragment with sentry S on arrow Fire
      And tip T beyond Fire with trail arrows between Fire and T
      And the fragment has no territory-grade path before the landing
      When T steps onto A's territory and closes
      Then trail arrows from the departure back until before Fire become A's territory
      And Fire remains trail (or occupied trail)
      And trail distal beyond Fire away from the landing remains A's trail marks

    Scenario: Territory-rooted tip lands — no firebreak cap
      Given player A has a territory-rooted trail with a mid sentry
      When the tip lands on A's territory
      Then the full against-grain claim walk becomes territory
      And the mid sentry's arrow is claimed with the path if it lies on the walk

  Rule: Conversion predicate unchanged

    Scenario: Territory-grade path resists conversion
      Given player B has a head inside A's territory
      And a continuous B trail path from that head to B's territory
      When encirclement is checked
      Then that head does not convert

    Scenario: Unanchored tip inside enemy territory converts
      Given player B has a tip inside A's territory with no trail path to B's territory
      When encirclement is checked
      Then that tip converts to A

  Rule: Re-attach wakes dormant marks

    Scenario: Friendly head steps onto dormant trail
      Given player A has dormant trail marks with no A stack on them
      When an A head steps onto one of those trail arrows from territory or trail
      Then the marks remain
      And the component's grade is recomputed from reachability

  Rule: Wipe still evaporates from emptied arrow

    Scenario: Combat wipe starts evaporation; distal beyond firebreak may remain
      Given player A has trail with a sentry beyond the wipe arrow
      When combat reduces A's stack on the wipe arrow to 0 heads
      Then evaporation runs from that arrow under the halt-at-first rule
      And trail beyond the sentry firebreak remains if the front halted there
