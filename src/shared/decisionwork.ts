// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK A DECISION CREATES: the words the task gets, worked out in one place.
 *
 * ---------------------------------------------------------------------------------------
 * WHO OWES THE WORK A DECISION MAKES
 * ---------------------------------------------------------------------------------------
 *
 * The work a decision creates belongs to the project. Whoever that part is given to is whose it is.
 * It is not the proposer's for having asked the question. Design: `design/permissions/ACCEPTANCE.md`
 * section 3.7, criteria P32 to P35.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TASK AND NOT AN OBLIGATION
 * ---------------------------------------------------------------------------------------
 *
 * The `obligation` kind says it itself, in `src/shared/kinds.ts`, on its own `owedTo` field: *an
 * obligation with nobody at the other end is a task*. Nobody is at the other end here, because the
 * work is the project's. So the kind is `task`, which has no `owedTo` and no `due` at all — there is
 * no field on it that could name a person, and that is the enforcement rather than a convention.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE WORDS COME FROM, AND WHERE THEY DO NOT
 * ---------------------------------------------------------------------------------------
 *
 * A proposal may carry `resultWillBeUsedTo` — what the answer will be used to do, written by whoever
 * filed the fork. Where it is there, it IS the work, so the task's title is those words unchanged.
 * Where it is not, nothing here invents a description of work nobody has described: the task says
 * that nobody wrote it down and that writing it down is the first step. Measured on a copy of the
 * corpus on 7 September 2026: of 113 decisions that settle a fork, 65 forks carry the field and 48
 * do not, so both halves of this are the ordinary case and neither is an edge.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORDS ARE HERE AND NOT WHERE THE RECORD IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Two callers write this task: the promote route, for a fork settled from now on, and
 * `tools/file-the-work-each-decision-created.mjs`, for the 113 settled before it existed. Written
 * twice, the backfilled tasks and the new ones would say different things about the same rule, and
 * nothing would fail. The ninth invariant: one fact is worked out in one place.
 */

/** What a proposal's `resultWillBeUsedTo` is called, named once so no caller spells it again. */
export const RESULT_WILL_BE_USED_TO = 'resultWillBeUsedTo'

/** The words on the task, and whether the fork is where they came from. */
export interface TheWorkADecisionCreates {
  /** The task's title. The fork's own words where it wrote them, and never invented where it did not. */
  title: string
  /** What the task is, who owes it — nobody — and how it becomes somebody's. */
  summary: string
  /**
   * Did the fork say what its answer would be used to do?
   *
   * `true` means `title` is the fork's own sentence. `false` means nobody wrote one, which is a real
   * answer and is what the task says on its face. A caller reporting what it filed says which.
   */
  fromTheFork: boolean
}

/** One sentence, on every one of these tasks, saying who owes it and how it becomes somebody's. */
const NOBODY_OWES_IT =
  'Nobody owes this task: the work a decision creates belongs to the project. Whoever takes that part ' +
  'of the work claims it, and the claim is the assignment — POST /api/claims naming this record. The ' +
  'agent that filed the fork is not named here and is not being asked.'

/** Trim a value that may be anything, and say whether a person actually wrote something in it. */
function whatWasWritten(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const words = value.trim()
  return words === '' ? null : words
}

/**
 * The words for the task one decision creates.
 *
 * `forkData` is the proposal's own `data` object, whatever shape it is in — a record read back from
 * the API, a row out of the database, or nothing at all. Nothing is assumed about it beyond the one
 * key, so a caller never has to prove it holds a proposal before asking.
 */
export function theWorkADecisionCreates(input: {
  decisionTitle: string
  forkData: unknown
}): TheWorkADecisionCreates {
  const held =
    typeof input.forkData === 'object' && input.forkData !== null
      ? (input.forkData as Record<string, unknown>)[RESULT_WILL_BE_USED_TO]
      : undefined
  const written = whatWasWritten(held)
  const decision = input.decisionTitle.trim()

  if (written !== null) {
    return {
      title: written,
      summary:
        `This is the work the decision "${decision}" creates, in the fork's own words: whoever filed the ` +
        `fork wrote them under what the answer would be used to do. Nothing here was added to them. ` +
        NOBODY_OWES_IT,
      fromTheFork: true,
    }
  }

  return {
    title: `Say what this decision requires: ${decision}`,
    summary:
      `This is the work the decision "${decision}" creates, and nobody has written what that work is. ` +
      `The fork it settled says nothing about what its answer would be used to do, so writing that down ` +
      `is this task's first step. Nothing was invented to fill it in. ` +
      NOBODY_OWES_IT,
    fromTheFork: false,
  }
}
