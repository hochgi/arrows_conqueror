# language: en
# Overview: docs/spec/move/move.md
# SPEC §4 (order is data), §5 (sentries), §11 items 19, 20, 22

Feature: The move DTO — boundaries and the cases that must stay expressible
  As the rules core
  I want the DTO to make illegal shapes unrepresentable and legal play total
  So that no mechanic has to be added later to express something §4 already allows

  Rule: Order is data, because order changes outcomes

    Reinforcing a stack before another commits to a crossing is a legal and
    intended play. So a turn is a sequence, not a set — and a replay that
    reproduced the set would reproduce a different match.

    Scenario: Two turns differing only in order are not equal
      Given two turns containing the same moves in different orders
      When I compare them
      Then they are not equal

    Scenario: A stack may act more than once in a turn
      Given arrow a1 holds 3 heads belonging to player A
      When player A constructs two step moves originating from a1's advance
      Then both moves are well-formed
      And the DTO imposes no limit on how many moves name the same stack
      # Allowance is what limits this, and allowance is P04's business.

    Scenario: Moves from different stacks may be interleaved
      Given player A holds stacks on arrows a1 and a2
      When player A constructs a move from a1, then from a2, then from a1 again
      Then the turn is well-formed
      And the moves appear in that order
      # A 3-stack at 11/6 does not have to spend its steps consecutively.

  Rule: A skip is distinguishable from having nothing to do

    A replay that could not record a skip could not tell "declined to move" from
    "had no whole step left". Those are different positions and they lead to
    different games.

    Scenario: An explicit skip is recorded
      Given player A has a stack on arrow a1 with a whole step available
      When player A skips a1
      Then the turn contains a skip move naming a1
      And it is distinguishable from a turn in which a1 was never named

    Scenario: A turn may contain nothing but skips
      When player A skips every stack and ends the turn
      Then the turn is well-formed
      # The turtle position (§9) is a legal, accepted state of the game.

    Scenario: A turn may be empty but for its ending
      When player A ends the turn without moving anything
      Then the turn is well-formed

  Rule: Illegal shapes are unrepresentable, not merely invalid

    The DTO should make a whole class of bug impossible rather than detectable.

    Scenario Outline: A step cannot be constructed without all three fields
      When I construct a step move omitting the <field>
      Then construction fails

      Examples:
        | field  |
        | source |
        | exit   |
        | count  |

    Scenario: A skip cannot carry a count
      When I construct a skip move with a count
      Then construction fails

    Scenario: A step's source and exit may not be the same arrow
      Given arrow a1 holds 2 heads belonging to player A
      When player A constructs a step move from a1 to a1
      Then the move is rejected as malformed
      # A step goes somewhere. Staying put is a skip, and it is a different move.

    Scenario: There is no fourth move variant
      When I enumerate the move variants the DTO admits
      Then there are exactly 3
      And they are step, skip and end-turn

  Rule: Counts at the boundary of a stack

    Scenario Outline: Counts spanning the whole range of a stack are well-formed
      Given arrow a1 holds 6 heads belonging to player A
      When player A constructs a step move from a1 with count <count>
      Then the move is well-formed

      Examples:
        | count | note                                  |
        | 1     | the smallest split                    |
        | 5     | leaving a single sentry               |
        | 6     | taking everything, leaving the arrow empty |

    Scenario: Taking every head is well-formed
      Given arrow a1 holds 1 head belonging to player A
      When player A constructs a step move from a1 with count 1
      Then the move is well-formed
      # Moving a lone head off an arrow is the ordinary case, not an edge one.
      # Whether the vacated arrow stays territory is P07's business, not the DTO's.
