// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `problem`, something wrong or blocking, with what it costs
 * and what makes it stop.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, PROBLEM_STATES and ProblemState from kinds.ts.
 *
 * THIS FILE IMPORTS `MAIN_SUITE_FIX_EXAMPLE` FROM ../main-suite-fix.ts, AND `attentionFields`,
 * `commonFields`, `passedItOnField`, `unionOf`, `whoseMoveField` AND THE `KindSpec` AND
 * `ShapeSpec` TYPES FROM ./kind-common.ts. The two whose-move helpers live in kind-common.ts
 * because this file and kinds.ts would otherwise load each other; moving them changes no behaviour.
 */
import { attentionFields, commonFields, passedItOnField, unionOf, whoseMoveField, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { MAIN_SUITE_FIX_EXAMPLE } from '../main-suite-fix.ts'

/** Where a problem has got to. `open` and absent are different: absent means nobody has said. */
export const PROBLEM_STATES = ['open', 'fixed', 'worked_around', 'accepted'] as const
export type ProblemState = (typeof PROBLEM_STATES)[number]

export const problemKind: KindSpec = {
    kind: 'problem',
    purpose: 'Something wrong or blocking, with what it costs and what makes it stop.',
    whenToRecord:
      'The moment something goes wrong and you have spent more than a few minutes on it. A problem you have already ' +
      'fixed is still worth filing: `state: "fixed"` with a `fix` is what stops the next person losing the same hour.',
    humanOnly: false,
    fields: [
      { key: 'mainSuiteFix', type: 'MainSuiteFix', required: false, description: 'Strict original main-suite receipt correlation, one own-run secretary claim, pending dispatch/repair/take-out, and proved terminal evidence. Ordinary cause remains prose. The example is made up and is not a fileable machine claim.', example: MAIN_SUITE_FIX_EXAMPLE },
      { key: 'symptom', type: 'string', required: false, description: 'What you see when it happens, in the words you would search for six months from now.', example: 'Killed the server, saw "Terminated", but the port was still held.' },
      { key: 'cause', type: 'string', required: false, description: 'Why it happens, once that is known. Leave it out while it is still a guess.', example: 'tsx starts a child process. Killing the parent leaves the child holding the listening socket.' },
      { key: 'fix', type: 'string', required: false, description: 'What makes it stop, precisely enough to follow without thinking.', example: 'Start with setsid and kill the process group: kill -TERM -$(ps -o pgid= -p PID | tr -d " ")' },
      { key: 'why_it_hurts', type: 'string', required: false, description: 'What it costs while it is unfixed. This is the field that decides whether anyone spends a day on it.', example: 'An orphan served a deleted database, so the page showed records that were not on disk and the diagnosis drawn from it was wrong.' },
      { key: 'how_to_tell_it_is_back', type: 'string', required: false, description: 'The check that says it has returned. A problem with no such check comes back unnoticed.', example: 'ss -ltn | grep -E ":(8787|5173) " after you think you stopped it.' },
      { key: 'seen_in', type: 'string[]', required: false, description: 'Where it shows up: projects, machines, files.', example: ['greenhouse', 'seedling-trays'] },
      { key: 'options', type: 'string[]', required: false, description: 'Ways out that have been considered and not chosen. Writing them down stops them being rediscovered.', example: ['call the recipe planner directly', 'move the pot by hand and release it at contact'] },
      // WHAT WAS ALREADY TRIED, which `options` above cannot hold: that field is roads NOT taken.
      // See the Attempt shape for why the five facts are five fields.
      {
        key: 'attempts',
        type: 'Attempt[]',
        required: false,
        description:
          'What has already been tried on this problem, one entry each: what was done, what was seen, why it ' +
          'failed if that is known, what is still worth keeping from it, and whether nobody should try it ' +
          'again. THIS IS WHERE TROUBLESHOOTING LIVES. Without it the only record of a dead end is a chat ' +
          'transcript nobody else has, and the next agent spends the same hour. It is not `options`: that ' +
          'field is ways out nobody took, and this one is things somebody did.',
        example: [
          {
            id: 'a-kill-parent',
            tried: 'Killed the tsx parent process with kill -TERM on its pid.',
            result: 'The shell printed "Terminated", and ss -ltn still showed 8787 held.',
            failed_because: 'tsx runs the server in a child process, and killing the parent leaves the child holding the socket.',
            do_not_repeat: 'Do not kill the parent by pid again: it looks like it worked and leaves the port held.',
          },
        ],
      },
      { key: 'state', type: unionOf(PROBLEM_STATES), required: false, description: 'Where it has got to. Leaving it out means nobody has said, which is different from `open`.', example: 'open' },
      { key: 'found_by', type: 'string', required: false, description: 'How it came to light — a test, a page, a person, a run.', example: 'dogfooding, stage Z1' },
      whoseMoveField('problem'),
      passedItOnField('problem'),
      ...attentionFields('problem'),
      ...commonFields('problem'),
    ],
    example: {
      symptom: 'POST /api/records with a misspelt key returns 201 and the text is never seen again.',
      cause: 'The request body schema checks four outer fields and types `data` as any JSON object.',
      why_it_hurts: 'The house rule the project states most loudly is enforced on the fields that carry no content and not on the one that carries all of it.',
      state: 'open',
      found_by: 'dogfooding, stage Z1',
      attempts: [
        {
          id: 'a-strict-outer',
          tried: 'Made the four outer fields strict and re-sent the misspelt key.',
          result: 'Still 201. The strictness is on the envelope and the text goes into `data`, which was typed as any object.',
          still_useful: 'The envelope check is right and stays; it is simply not where the content goes.',
        },
      ],
      whose_move: 'agent',
      consequence: {
        bearer: 'property',
        what: 'Text an author wrote is accepted, stored under a key nothing reads, and never seen again — and they are told it worked.',
      },
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const PROBLEM_SHAPES: Record<string, ShapeSpec> = {
  /**
   * ONE THING SOMEBODY ALREADY TRIED ON A PROBLEM, AND WHAT CAME OF IT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY `options` COULD NOT HOLD THIS
   * ---------------------------------------------------------------------------------------
   *
   * `problem.options` is "ways out that have been considered and not chosen" — a list of strings
   * about things nobody did. Troubleshooting is the opposite record: things somebody DID, what was
   * seen when they did it, and which of them must not be done again. None of those five facts fits
   * in a string that means "an option we passed over", and writing them there would make a reader
   * of `options` unable to tell a road not taken from a road that ended in a wall.
   *
   * ---------------------------------------------------------------------------------------
   * WHY FIVE FIELDS AND NOT ONE PARAGRAPH
   * ---------------------------------------------------------------------------------------
   *
   * The whole point is that a later reader can answer one question — "what must I not repeat?" —
   * without reading everything. A paragraph makes that a reading job. `do_not_repeat` makes it a
   * query, and it is the field the open-loop reader hands to a fresh agent.
   *
   * `result` is required and `failed_because` is not, on purpose: what you SAW is a fact you have
   * as soon as you have run the thing, and why it failed is often still a guess. A guess written as
   * a cause is the fifth engineering rule broken in the place it costs most.
   */
  Attempt: {
    name: 'Attempt',
    description:
      'One thing that was already tried on this problem, what happened when it was tried, and whether anybody ' +
      'should try it again. It is what stops the next person — or the next agent — spending the same hour twice.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description:
          'Unique within this problem. It is what lets the history say which attempt changed rather than ' +
          'printing the whole list twice.',
        example: 'a-kill-parent',
      },
      {
        key: 'tried',
        type: 'string',
        required: true,
        description: 'What was actually done, precisely enough for somebody else to do it or to avoid doing it.',
        example: 'Killed the tsx parent process with kill -TERM on its pid.',
      },
      {
        key: 'result',
        type: 'string',
        required: true,
        description:
          'What was SEEN when it was done: the error, the measurement, the output. The evidence, not the ' +
          'conclusion drawn from it. Required, because an attempt with no result is a rumour.',
        example: 'The shell printed "Terminated", and ss -ltn still showed 8787 held.',
      },
      {
        key: 'failed_because',
        type: 'string',
        required: false,
        description:
          'Why it did not work, once that is known. LEAVE IT OUT while it is still a guess — a guess written ' +
          'here reads as a finding to everybody who comes after.',
        example: 'tsx runs the server in a child process, and killing the parent leaves the child holding the socket.',
      },
      {
        key: 'still_useful',
        type: 'string',
        required: false,
        description:
          'What is worth keeping from it even though it did not work: a measurement, a narrowing, a tool that ' +
          'turned out to be the right one.',
        example: 'ss -ltn is the check that says whether the port is really free; it was right both times.',
      },
      {
        key: 'do_not_repeat',
        type: 'string',
        required: false,
        description:
          'Say this when nobody should try this again, and say why in the same sentence. This is the one field ' +
          'a fresh agent is handed before it starts, so write it as an instruction to somebody who has not read ' +
          'the rest. Leave it out when the attempt is simply one that did not work — not every failure is a ' +
          'dead end.',
        example: 'Do not kill the parent by pid again: it looks like it worked and leaves the port held.',
      },
      // AN AGENT'S CHOICE AMONG THE PROBLEM'S OPTIONS IS AN ATTEMPT THAT TAKES ONE. By item 3 of a decision, a wave may
      // choose among the options a problem carries, with its evidence, and says which and why.
      // The choice lives here and not in sections of its own, because a problem's seven sections are agreed.
      // `assertOptionsForThemAreTheirMove` in src/server/lib/records/planning-guards.ts holds the option, `tried` and `result` together.
      {
        key: 'takes_option',
        type: 'string',
        required: false,
        description:
          'Set this when the attempt is an agent taking one of the problem\'s `options`: that option, copied word ' +
          'for word. Write the same words in `tried`, with why this option and not the others, because `tried` is ' +
          'the line the problem\'s page draws, and that is how the person sees the choice. `result` is the evidence ' +
          'the choice rests on. While such an attempt has no `failed_because`, an open problem may keep its options ' +
          'and say the next move is an agent\'s. Leave it out on an attempt that took none of the options.',
        example: 'move the pot by hand and release it at contact',
      },
    ],
  },

}
