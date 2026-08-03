# language: en
# Overview: docs/spec/move/move.md
# SPEC §4 (turn structure), §5 (sentries are counts), §11 items 19 and 21

Feature: The move DTO
  As a player
  I want to send a portion of an arrow's heads one step along an out-arrow
  So that splitting, merging, forking and garrisoning are one manoeuvre I can
  make at every step rather than four mechanics I invoke at authored moments

  Rule: A step names a source, an exit and a count

    No unit identity appears anywhere. A stack is the count standing on an
    arrow, so there is no unit to name.

    Scenario: A step carries exactly three fields
      When I construct a step move
      Then it names a source arrow
      And it names an exit arrow
      And it names a count
      And it names nothing else

    Scenario Outline: One move type expresses every stack manoeuvre
      Given arrow a1 holds <held> heads belonging to player A
      When player A constructs a step move from a1 with count <count>
      Then the move is well-formed
      And it expresses <manoeuvre>

      Examples:
        | held | count | manoeuvre                           |
        | 1    | 1     | moving a lone head                  |
        | 3    | 3     | moving the whole stack              |
        | 3    | 1     | sending a scout, leaving a 2-sentry |
        | 3    | 2     | advancing, leaving one head behind  |

    Scenario: A fork is two moves from the same source
      Given arrow a1 holds 3 heads belonging to player A
      When player A constructs a step move from a1 with count 1 to out-arrow a2
      And player A constructs a step move from a1 with count 1 to out-arrow a3
      Then both moves are well-formed
      And no fork-specific move variant is required
      # The pincer therefore needs no special case in the DTO.

  Rule: A count must be a positive portion of what is there

    Scenario Outline: Degenerate counts are rejected
      Given arrow a1 holds 2 heads belonging to player A
      When player A constructs a step move from a1 with count <count>
      Then the move is rejected as malformed

      Examples:
        | count | why                             |
        | 0     | a step must move something      |
        | -1    | counts are not signed           |
        | 3     | cannot send heads that are not there |

  Rule: Skip and end-turn are first-class

    Skipping is a choice. A rearguard head on an open trail is doing its job by
    standing still — stepping forward would only lengthen the trail it is there
    to guard — so a typical turn moves a minority of the stacks on the board.

    Scenario: A skip names the arrow that declined to move
      When I construct a skip move for arrow a1
      Then it is well-formed
      And it names a source arrow
      And it names no exit and no count

    Scenario: A turn ends explicitly
      When I construct an end-turn move
      Then it is well-formed
      And it names no arrow

  Rule: A turn is an ordered list

    Scenario: Move order is preserved
      Given a turn composed of several moves in a chosen order
      When I read the turn back
      Then the moves appear in the order they were made

    Scenario: Structurally identical moves are equal
      Given two step moves with the same source, exit and count
      When I compare them
      Then they are equal
      # Replay comparison depends on this not falling back on object identity.
