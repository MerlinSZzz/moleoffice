// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `proposal`, the fork an agent may write and the one link that
 * resolves it.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, FORK_SETTLERS and ForkSettler from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts,
 * `theFourActs` FROM ../governance-acts.ts, AND `RESOLVES_PROPOSAL` FROM ../types.ts.
 * `FORK_SETTLERS` AND `ForkSettler` MOVED HERE WITH THE KIND, because its `who_settles_it` field
 * is `unionOf(FORK_SETTLERS)` and a file that imported them from kinds.ts would make the central
 * file and this one load each other. The other fork words, FORK_SETTLER_WORDS,
 * FORK_SETTLER_MEANINGS, FORK_SETTLER_UNSAID_WORD, FORK_SETTLER_UNSAID_MEANING and THE_OWNER, stay
 * in ./kind-words.ts, which imports the type.
 */
import { commonFields, unionOf, type KindSpec } from './kind-common.ts'
import { theFourActs } from '../governance-acts.ts'
import { RESOLVES_PROPOSAL } from '../types.ts'

/**
 * WHO SETTLES A FORK. Four words, and the fifth answer is no word at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FIELD EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An agent that reaches a fork has two endings today. It decides the fork itself, or it files a
 * `proposal` — and a proposal is by definition the owner's, because settling one is refused to every
 * agent. There is nothing in between. Measured on 27 August 2026: twenty-seven forks were waiting on
 * the owner and at least eight of them no longer needed the owner. A question should go up only
 * as far as it has to, and this field is where a fork says
 * how far up it went.
 *
 * ---------------------------------------------------------------------------------------
 * A ROLE, NEVER A NAME
 * ---------------------------------------------------------------------------------------
 *
 * The same rule `whose_move` gives, for the same reason. `the owner` is the role of the person whose
 * judgement the product reserves acts to, not that person's own name. Storing a name would make one
 * installation's owner part of the vocabulary. Who WROTE the fork is on its change row already.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT MEANS NOBODY HAS SAID, AND IT IS NEVER INFERRED
 * ---------------------------------------------------------------------------------------
 *
 * Leaving it out means nobody has classified this fork. It is not `the owner` and it is not
 * `an agent`. Nothing reads the question, the title or the kind to fill it in. A fork does not reach
 * the owner by nobody having thought about it: the owner's queue is the forks that SAY `the owner`, and the
 * ones nobody has classified are their own reading with their own count.
 */
export const FORK_SETTLERS = ['the owner', 'an agent', 'the parent', 'a measurement'] as const
export type ForkSettler = (typeof FORK_SETTLERS)[number]

export const proposalKind: KindSpec = {
    kind: 'proposal',
    purpose:
      'A fork that somebody has to settle: what must be decided, the defensible options, and — where there ' +
      'is one — the writer\'s recommendation and what it rests on. WHO settles it is a field on the fork, ' +
      '`who_settles_it`, and it may say the owner, an agent, the parent agent or a measurement. THIS SENTENCE ' +
      'USED TO READ "A fork that has to be settled by a person", and it stopped governing on 27 August 2026, ' +
      'when it was settled that a fork is not governance by default, and that not every fork a subagent finds ' +
      'is for a person to settle. The old sentence is kept here because it is what every fork filed before ' +
      'that date was filed under.',
    whenToRecord:
      'The moment you are about to make a choice that closes off an option somebody would want a say in. File the ' +
      'fork instead of taking it, and say who settles it if you know. An agent may write this. It may also write ' +
      'the `decision` that settles one, but only by citing authority it already has — see the `decision` kind. ' +
      `FOUR ACTS LOOK LIKE DECIDING AND ARE NOT, so write the one that is exactly true: ${theFourActs()}`,
    humanOnly: false,
    fields: [
      {
        key: 'question',
        type: 'string',
        required: true,
        description:
          'What has to be decided, written as a question somebody could answer yes, no or "the second one" to. ' +
          'Needed before the proposal is complete: it is the fork, and a proposal without it is a piece of ' +
          'reasoning with nothing at stake. Write the choice, not the background — the background goes in ' +
          '`because`.',
        example: 'Should a module carry a lifecycle word of its own, or should its condition be computed from its checklist?',
      },
      {
        key: 'options',
        type: 'string[]',
        required: true,
        description:
          'The defensible answers, one entry each, each saying what it costs. Fit the number to the case: several ' +
          'where there is a real fork, each with its cost, and one where there is a plan to approve — one option ' +
          'is allowed. Write the ones you would defend, including the one you are not recommending — an ' +
          'option nobody wrote down is one the reader has to rediscover. These are what become ' +
          '`alternatives_rejected` on the decision that settles this; with one option there is nothing to reject, ' +
          'and the decision leaves that field empty.',
        example: [
          'Store a lifecycle word on the module: honest and coarse, and somebody has to keep it current.',
          'Compute the condition from the checklist: never stale, and it cannot say "we have put this down on purpose".',
        ],
      },
      {
        key: 'recommendation',
        type: 'string',
        required: false,
        description:
          'Which option you would take, if you have a view. LEAVE IT OUT when you genuinely do not — a ' +
          'recommendation invented to look decisive is worse than none, because the reader cannot tell it from one ' +
          'that came out of the evidence. Name the option; do not restate all of them.',
        example: 'Store the word. The checklist cannot express "deliberately put down", and that is the case this is for.',
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description:
          'The reasoning: why this fork exists, and why the recommendation follows — in enough detail that ' +
          'somebody could argue with it rather than having to take it on trust. This is what a decision made from ' +
          'this proposal will carry as its own `because`.',
        example:
          'Twenty-six of twenty-seven modules land in "no state recorded" today, and the one that does not is there ' +
          'only because it is paused. The reader is told nothing by that bucket.',
      },
      {
        key: 'evidence',
        type: 'string[]',
        required: false,
        description:
          'What was actually observed that the reasoning rests on, one entry per piece — a count, a measurement, a ' +
          'quoted reply, a file and line. Quote it rather than summarising it. A proposal whose reasoning rests on ' +
          'nothing observable is an opinion, which is worth filing and worth being able to see is one.',
        example: ['26 of 27 module records carry no state field at all, measured on the working database on 2026-08-11.'],
      },
      {
        key: 'revisit_when',
        type: 'string',
        required: false,
        description:
          'What would reopen this question after it is settled — the observation, the change or the date that ' +
          'would make the answer wrong. It is carried straight into the decision\'s `revisit_when`, so writing it ' +
          'here is how a decision comes with its own expiry rather than becoming a rule nobody remembers agreeing ' +
          'to.',
        example: 'A module page that shows condition computed from parts, which would make the stored word a second copy.',
      },
      // ------------------------------------------------------------------ what the answer is for
      //
      // THE ONE FIELD THAT ASKS WHAT THE ANSWER WILL BE USED TO DO. A proposal should make the human
      // say, outright or by its shape, what the result will be used to do.
      // It is the anti-waste half of the person's Phase 9, and it is the whole of what round
      // ten builds from it.
      //
      // WHY IT IS OPTIONAL. A fork somebody has already reached is worth filing whether or not the
      // writer can say what the answer will be spent on, and a required field would make the queue
      // shorter by refusing the ones nobody could phrase — which is the failure this queue exists
      // to prevent, arriving as a validation rule. It is asked for in the composer and drawn on the
      // card whether or not it is there, so an absent one is visible rather than invisible.
      {
        key: 'resultWillBeUsedTo',
        type: 'string',
        required: false,
        description:
          'What the answer will be USED to do, once it is given. Not why the question matters — what changes the ' +
          'moment it is settled, and who does it. A fork whose answer nobody would act on is a fork worth not ' +
          'asking, and this is the field that makes that visible before somebody spends an afternoon on it. Write ' +
          'the act, not the benefit: "unblock the mount rebuild", not "improve clarity".',
        example: 'Unblock the module drawing: whichever way this goes, the boundary is drawn that way and the two open pipelines stop waiting.',
      },
      // -------------------------------------------------------------------------- the owner's pin
      //
      // THE PERSON'S OWN ACT AND NOBODY ELSE'S. An explicit pin is one of the facts a priority is
      // built from, and a pinned item is meant to carry a light visual mark, such as a star in the
      // card corner. A pin an agent could write is
      // not a pin: it would be one more thing arguing for its own place in the person's queue.
      //
      // `assertMayPinAFork` in src/server/lib/records/the-persons-own-acts.ts refuses it to every agent, on both write
      // doors, and refuses a request that names nobody. Absent means the person has not pinned it, which is
      // the common answer and is not "unimportant".
      {
        key: 'pinned',
        type: 'boolean',
        required: false,
        description:
          'True when the OWNER has pinned this fork: their own statement that it matters more than its other facts ' +
          'say. ONLY A PERSON MAY WRITE IT — an agent sending it is refused on POST and on PATCH, because a pin an ' +
          'agent could write is one more thing arguing for its own place in their queue. Leave it out when they have ' +
          'not pinned it, which is the ordinary answer and does not mean unimportant. It is one of the several ' +
          'facts the queue is ordered by and it is never the only one.',
        example: true,
      },
      // ------------------------------------------------------------------------ who settles it
      //
      // See `FORK_SETTLERS` above for the whole argument. It is declared here and on no other kind:
      // a fork is the only record that has to be SETTLED, and a field of this name on a task would
      // be a second, coarser answer to `whose_move`.
      {
        key: 'who_settles_it',
        type: unionOf(FORK_SETTLERS),
        required: false,
        description:
          'Who may settle this fork: "the owner" when only they may — that is what puts it in their queue; "an agent" ' +
          'when whoever picks it up may settle it by citing evidence; "the parent" when it goes up one level, to the ' +
          'agent that spawned the one that filed it; "a measurement" when nobody has to judge it and a named ' +
          'experiment answers it. IT IS A ROLE AND NEVER A NAME, because responsibility is not identity — who WROTE ' +
          'this is already on the change row. LEAVE IT OUT when nobody has said, which is the honest answer and the ' +
          'common one: absent is NOT "the owner", and nothing infers a value from the question, the title or the ' +
          'kind. A fork does not reach the owner by nobody having thought about it.',
        example: 'an agent',
      },
      ...commonFields('proposal'),
    ],
    rules: [
      `a proposal is RESOLVED when a \`decision\` links to it with \`${RESOLVES_PROPOSAL}\` — POST /api/links ` +
        `{"fromId":"<the decision>","toId":"<this proposal>","type":"${RESOLVES_PROPOSAL}"} — so the proposal reads back as ` +
        '"source of" that decision. There is no `resolved` field and there must not be one: two statements of one ' +
        'fact eventually disagree, and the link is the one that other queries already read.',
      'an agent may write the `decision` that settles this only when it can cite authority — see the `decision` ' +
        'kind, whose `authority` field is the whole rule. WHETHER IT MAY POINT THAT DECISION AT THIS PROPOSAL ' +
        `IS ANSWERED BY \`who_settles_it\` ON THIS RECORD, because the \`${RESOLVES_PROPOSAL}\` link is what settles a fork ` +
        'and there is no stored flag beside it. "the owner" — refused to every agent except the secretary ' +
        'carrying the owner\'s authorization. Not filled in — refused to ' +
        'every agent except the secretary carrying the owner\'s authorization, because an empty field is not ' +
        'permission and a fork nobody has classified is treated as ' +
        'the owner\'s. "an agent", "the parent" or "a measurement" — allowed, and only with a decision that carries an ' +
        '`authority`. An agent may also SAY who settles a fork nobody has classified; it may not change one that ' +
        'says "the owner", which is refused as the same act as settling it. POST /api/records/<this ' +
        'proposal>/promote still answers 403 to every agent except the secretary carrying the owner\'s ' +
        'authorization, whatever this field says, because promoting writes ' +
        'the decision without asking what it stands on. THIS RULE USED TO READ "only ' +
        'the human may write the `decision`", and it stopped governing on 27 August 2026, when it was ' +
        'settled that an agent may close a question it can cite sufficient authoritative evidence for. It ' +
        'then read "only a person may make the link", and that stopped governing the same day, when the guard ' +
        'was taught to read this field.',
      'a proposal is not a task. If work is waiting on the answer, that work is its own record and says so with a ' +
        '`blocks` link from this proposal to it — that is what makes the queue visible as a cost rather than as a ' +
        'list of open questions.',
    ],
    example: {
      question: 'Should a module carry a lifecycle word of its own, or should its condition be computed from its checklist?',
      options: [
        'Store a lifecycle word on the module: honest and coarse, and somebody has to keep it current.',
        'Compute the condition from the checklist: never stale, and it cannot say "we have put this down on purpose".',
      ],
      recommendation: 'Store the word. The checklist cannot express "deliberately put down", and that is the case this is for.',
      because: 'Twenty-six of twenty-seven modules land in "no state recorded" today, and that bucket tells the reader nothing.',
      evidence: ['26 of 27 module records carry no state field at all, measured on the working database on 2026-08-11.'],
      revisit_when: 'A module page that shows condition computed from parts, which would make the stored word a second copy.',
      resultWillBeUsedTo: 'Unblock the module page: whichever way this goes, the condition is drawn that way and the reader stops seeing an empty bucket.',
    },
}
