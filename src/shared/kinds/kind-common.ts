// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VOCABULARY A KIND FILE UNDER src/shared/kinds/ IMPORTS.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * doc comments and helper, word for word, and the same values.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands every name on with `export *` and imports what it
 * uses itself, so every caller still imports them from kinds.ts. A kind file imports them here,
 * so no kind file depends on the central file.
 *
 * THIS FILE IMPORTS A TYPE FROM ../types.ts AND ONE VALUE, `CONSEQUENCE_BEARERS`, FROM ../work.ts,
 * because the attention fields say the bearers in a sentence. ../work.ts imports only types from
 * the central file, and the compiler erases those, so this folder makes no runtime cycle.
 */
import type { RecordKind } from '../types.ts'
// THE KEY THE PATH OF A QUESTION IS STORED UNDER. Criterion P55; ../confirming.ts holds the shape
// and the words, and imports nothing from here.
import { CONFIRMED_BY } from '../confirming.ts'
import { CONSEQUENCE_BEARERS } from '../work.ts'

// ============================================================================ the declarations

/** One field of one kind, or of one nested shape. Plain data: safe to serve as JSON. */
/**
 * THE TWO HALVES OF A DECISION. Criterion P76.
 *
 * Whoever made a decision may change it, and the
 * administrator may too. A decision has a CORE (the choice itself, the words why, the title and the
 * words added after the press) and NOTES around it (when to revisit it, what was rejected, its links
 * and its provenance). The core may be changed only by whoever made it and by the person; the notes
 * may be changed by any agent, and every such change is attributed in the change log.
 *
 * The split lives on the field declaration so the guard, the kind's own notes and the page all read
 * one answer rather than three that can disagree. `half` is optional because only a decision has
 * halves: a field with no half is not part of a decision.
 */
export const DECISION_HALVES = ['core', 'notes'] as const
export type DecisionHalf = (typeof DECISION_HALVES)[number]

export interface FieldSpec {
  key: string
  /**
   * The type, written so a person and the checker in ./type-reader.ts both understand it.
   *
   * The forms are: `string`, `number`, `boolean`, `date`; a union of quoted values written
   * `'todo' | 'doing'`; a named shape from SHAPE_SPECS such as `ProgressItem`; any of those with
   * `[]` after it, with a union of quoted values in brackets, `('todo' | 'doing')[]`; and
   * `Record<string, X>` for an open bag of X. `null` is a form only as one side of a choice,
   * `string | null`, for a field where a stored null is an answer of its own.
   */
  type: string
  /**
   * Needed for the record to be COMPLETE. NOT needed in order to create it.
   *
   * On a KIND's own field, leaving this out is allowed: the record is stored and `validateData`
   * reports an Incompleteness for it, so a stub can be filed the minute work starts and enriched
   * by PATCH as it is learned. The name is kept, because it is still the right word for what a
   * finished record has to carry; what changed is the consequence of not having it yet.
   *
   * Inside a nested ShapeSpec it means something stricter, and the difference is on purpose: an
   * object you write at all has to be written whole, because a ModulePart with no `name` renders
   * as a blank heading. You may leave `parts` out; you may not send half a part.
   */
  required: boolean
  /** Plain English, for an agent that has never seen Mole Office. Says what to write, not the type. */
  description: string
  /** A real, valid value. Every example in this file is run through the checker by the tests. */
  example: unknown
  /**
   * THE OTHER FIELDS' VALUES THIS FIELD'S EXAMPLE HOLDS ONLY BESIDE, in a nested shape whose fields exclude one another:
   * a checklist item's mark that the person did it is kept only while the item is done, and the item's own example
   * state is "superseded". The tests check such an example with the required fields and these values, and leave it out
   * of the shape's whole example. Absent for a field whose example holds beside every other field's.
   */
  exampleWith?: Record<string, unknown>
  /**
   * THE RULE BEHIND THIS FIELD'S SHAPE, ADDED TO THE 400 WHEN THE VALUE IS WRONG.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT EXISTS, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * `checkValue` in ./validation.ts writes a refusal out of the DECLARATION: *"data.blocks[0].audience must be
   * one of: everyone, but it is the string "developers". A correct value looks like: "everyone""*.
   * That sentence is right about the shape and says nothing about the rule, and for one field in
   * this product the rule is the whole point. A quote block may not be marked for developers
   * because a quote is somebody else's words; a writer told only *must be one of everyone* goes
   * looking for a typo, and `tests/audience.test.ts` says so in as many words.
   *
   * The sentence WAS authored — in the zod schema in `src/server/lib/summary.ts` — and reached
   * nobody, because `validateRecordData` refuses the write first and formats its own message.
   * `design/round-ten/verification/wave-12.json` measured it live on both doors: POST /api/records
   * and PATCH with `dataPatch` both answered the shape sentence, and `grep -c 'somebody else'` over
   * both replies returned 0.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT IS NOT
   * ---------------------------------------------------------------------------------------
   *
   * Not a second `description`. A description is read by an agent that came to LEARN the field and
   * is written in the calm voice of a reference; this is read by a caller that has just been
   * refused and needs the one sentence saying why the obvious value is not allowed. Most fields
   * have no such rule and leave this out, which is why it is optional: a refusal is not improved by
   * a paragraph restating the type it has just named.
   */
  refusal?: string
  /**
   * WHICH HALF OF A DECISION THIS FIELD IS. Criterion P76.
   *
   * `core` is the decision itself — the option taken, the words why, the title and the words added
   * after the press — and only whoever made the decision, or the person, may change it. `notes` is
   * everything around it, and any agent may change it. Only a `decision` field carries this; a field
   * with no `half` is not part of a decision at all.
   */
  half?: DecisionHalf
}

/**
 * WHY A QUOTE MAY NOT BE HIDDEN — THE SENTENCE ITSELF, WRITTEN ONCE.
 *
 * `projections.md` §9.2 rule 2. It is exported because the zod checker in
 * `src/server/lib/summary.ts` refuses the same value and must say the same thing: the two used to
 * be two strings, kept in step by a comment asking whoever edited one to remember the other. This
 * is that pair collapsed into one declaration, which is the defect CLAUDE.md names as this
 * codebase's own — the same fact worked out in two places with nothing making them agree.
 */
export const A_QUOTE_MAY_NOT_BE_HIDDEN =
  'a quote block may not be marked for developers, by anybody. A quote is somebody else\'s words, and hiding ' +
  'them from a normal reader is classifying away the original words. Put the passage in a `code` block if it ' +
  'is machinery a developer wants tucked away; a `code` block may be marked'

/**
 * A nested object shape, e.g. one checklist item.
 *
 * `discriminator` is set when the shape is really several shapes chosen by one key, which is how
 * a summary block works: `type: "chart"` means the rest of the object is a ChartBlock.
 */
export interface ShapeSpec {
  name: string
  description: string
  fields: FieldSpec[]
  discriminator?: {
    key: string
    /** Value of the discriminator key -> the name of the shape it selects. */
    variants: Record<string, string>
  }
  /**
   * Rules that need more than one key OF THIS OBJECT, in English, for the same reason a kind has
   * them: a caller reading this over HTTP cannot see the function that enforces it. Enforced by
   * SHAPE_CROSS_CHECKS in ./shape-cross-checks.ts. If you add one there, add the sentence here.
   */
  rules?: string[]
}

/** Everything there is to know about one kind of record. */
export interface KindSpec {
  kind: RecordKind
  /** What this kind is FOR, in one sentence. */
  purpose: string
  /** The trigger: when an agent should create one of these. */
  whenToRecord: string
  fields: FieldSpec[]
  /**
   * WHAT THIS KIND'S LEVEL-3 CONTEXT MUST SAY, when the kind has one beyond the record's own words.
   *
   * Level 3 of the reading ladder is the record's own `summary` for every kind, and the short-forms
   * description already says so. A kind whose summary is a FACT ABOUT THE WORK rather than a caption
   * of it can add the sentence that says what belongs there, and the assembly of `KIND_SPECS` in
   * ../kinds.ts appends it to that kind's `shortForms` description. Only `decision` declares one
   * today: its summary is the context that keeps a later agent from obeying or fighting a rule
   * whose reason has gone.
   */
  summaryGuidance?: string
  /** A complete, valid `data` object. Copy it and change the values. */
  example: Record<string, unknown>
  /** True when only the human may create or change it. An agent gets a 403. */
  humanOnly: boolean
  /**
   * Rules that involve more than one field, in English, because a caller reading this over HTTP
   * cannot see the functions that enforce them. Enforced by CROSS_CHECKS in ./cross-checks.ts.
   */
  rules?: string[]
}

/**
 * Turn a list of allowed values into the type string, e.g. `'todo' | 'doing'`.
 *
 * Written this way round so the human-readable type and the values the checker accepts are the
 * same string. A hand-typed union would be one more thing that can quietly disagree with
 * ITEM_STATES, and disagreement about a vocabulary is invisible until a chip renders blank.
 */
export const unionOf = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(' | ')

/**
 * HOW LONG THIS IS EXPECTED TO TAKE — the one number planning cannot be built without.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ON THE WORK AND NOT ON THE PLAN
 * ---------------------------------------------------------------------------------------
 *
 * How big a piece of work is, is a fact about the work. If the estimate lived on an allocation
 * instead — "this week I will spend 6 hours on it" — then two allocations of the same task could
 * disagree about its size, nothing could say what the task was estimated at, and the sum of a week
 * would be the sum of somebody's intentions rather than of anything real. That is the recurring
 * defect in this repository: two places that must agree, with nothing making them agree.
 *
 * So the estimate is here, once, and a plan POINTS at it. Planning is allocation, not duplication.
 *
 * ---------------------------------------------------------------------------------------
 * WHY HOURS, AND WHY A NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * Capacity arithmetic has to be deterministic — a week either fits or it does not, and the answer
 * may not depend on how a word was read. Hours add up. "Days" do not: a day is however many working
 * hours the person actually has, which is the thing being planned, so measuring work in days and
 * capacity in days makes the sum circular and always true.
 *
 * Fractions are allowed and mean what they say: 0.5 is half an hour. There is deliberately no
 * small/medium/large: those are comparisons rather than quantities, and nothing can be added up
 * from them without inventing the numbers this field is asking for directly.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS AN ESTIMATE AND IT IS NEVER INFERRED
 * ---------------------------------------------------------------------------------------
 *
 * Absent means nobody has estimated this, which is a real answer and the common one — not zero, and
 * not a guess Mole Office makes from the length of a title. A capacity report that treated absent as zero
 * would say a week fits when the truth is that nobody has looked, so every surface that adds these
 * up reports how many of its items carry one.
 */
export const effortField = (kind: string): FieldSpec => ({
  key: 'effort_hours',
  type: 'number',
  required: false,
  description:
    `Roughly how many hours of work this ${kind} is, as a number — 0.5 is half an hour, 6 is a long ` +
    'day\'s work. It is an ESTIMATE and it is the only thing capacity arithmetic can add up, so it lives ' +
    'here on the work rather than on any plan that allocates time to it: an estimate on the plan would let ' +
    'two weeks disagree about how big the same task is. Leave it out when nobody has estimated it — that is ' +
    'the honest answer and nothing infers a number from anything else. Absent is NOT zero, and every ' +
    'surface that totals these says how many of its items had one.',
  example: 3,
})

/**
 * The two fields every kind has, written once.
 *
 * `source` is here because an audit that filed thirty records reached for it unprompted on four
 * different kinds: where a record came from is part of the record, whatever the record is.
 *
 * `extra` is the declared escape hatch. Research records grow fields nobody anticipated, and the
 * alternative to a named bag is an agent that cannot file what it measured and writes a markdown
 * file instead. It is declared rather than implied so that putting something in it is a choice.
 * `moreOfExtra` is a sentence one kind adds about its own `extra`: the session kind says which
 * older copies the office still reads there.
 */
export const commonFields = (kind: string, moreOfExtra = ''): FieldSpec[] => [
  {
    key: 'source',
    type: 'string',
    required: false,
    description:
      'Where this came from, when it was taken from somewhere else: a file and section, a thread, a paper, ' +
      'a run. It is what makes the record checkable by someone who was not there.',
    example: 'design/explore.md, section 4',
  },
  {
    key: 'extra',
    type: kind === 'note' ? 'StableBootstrapNoteExtra | Record<string, unknown>' : kind === 'decision' ? 'StableBootstrapDecisionExtra | Record<string, unknown>' : kind === 'message' ? 'StableOfficeMessageExtra | Record<string, unknown>' : 'Record<string, unknown>',
    required: false,
    description:
      kind === 'message'
        ? 'The reserved stableUpgradeNotice entry carries the strict original upgrade, first handoff or data folder move event, written only by POST /api/office/upgrades/notice. StableOfficeMessageExtra and its nested shapes declare it. Other entries stay open extra data.'
        : kind === 'problem' ? 'Open hand-backs keep redOnMainFamily and strict handBack facts: entry, repository, files, commits, line, landedAt, deadline, timeZone and hours. The office alone records extra.takeBack.aPersonMustLook with at and says, once, when an overdue take-back needs a person. Other extra data stays open.'
        : kind === 'note' ? 'The reserved stableBootstrapPrepared entry follows StableBootstrapPrepared and its nested scope, receipt and state digest. It records preparation, not a release or stop. Other extra entries remain allowed.'
        : kind === 'decision' ? 'The reserved stableBootstrapStop entry follows StableBootstrapStopScope. An original direct secretary decision and its recorded owner warrant may supply stop authority; notice approval does not. The reserved stableBootstrapEvidence entry follows StableBootstrapEvidenceWaiver: such a decision may stand for the whole-suite receipt of that one first handoff. Other extra entries remain allowed.'
        : `Anything a ${kind} needs that this kind has no field for. It is stored and shown as key/value, and ` +
          'its keys are declared nowhere, so a field you want a page to draw belongs in KIND_SPECS instead — ask ' +
          'for it rather than hiding it here.' + moreOfExtra,
    example: { rig: 'bench jig 2', operator: 'owner' },
  },
]

/**
 * `consequence` and `paused`, given to every kind that can need somebody's attention.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH ARE STORED FIELDS RATHER THAN SOMETHING WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * A thing needs attention when it is owed to somebody outside this project, or when its own
 * recorded state says the work stopped short of finishing. Both halves of that rule need
 * something the record does not otherwise carry.
 *
 *   `consequence` — HOW BAD it is if nothing is done, which no state word says. A measurement of
 *   the real database found a software emergency stop that does nothing, filed three times, open
 *   for twenty-one days, reaching no screen. Every ranking that put it anywhere sensible did so by
 *   accident, because nothing stored said a person could be hurt. The only alternative to storing
 *   it is reading the title, and a rule that reads titles is a rule a title can fool.
 *
 *   `paused` — that the work is waiting ON PURPOSE. Without it, "stopped short" cannot tell work
 *   that fell over from work somebody consciously put down, and a list that cannot tell those
 *   apart stops being read.
 *
 * WRITTEN ONCE, HERE. The two fields are identical on all eight kinds that take them. Eight copies
 * of these sentences would be eight things that must agree with nothing making them agree, which
 * is the defect this codebase keeps producing.
 */
export const attentionFields = (kind: string): FieldSpec[] => [
  {
    key: 'consequence',
    type: 'Consequence',
    required: false,
    description:
      `Who is hurt if this ${kind} is left alone, and what happens to them: ` +
      '{"bearer":"person","what":"one sentence in your own words"}. ' +
      'THIS IS HOW A SAFETY-CRITICAL ITEM IS RECORDED. A bearer of "person" is the only thing in Mole Office that ' +
      'marks one, and Mole Office will NEVER work it out from the title — a rule that reads titles is a rule a title ' +
      `can fool, so nothing is inferred and a ${kind} whose title says "E-STOP" is treated exactly like one that ` +
      'does not. Leaving this out is not neutral and is not safe: the record is then ranked as though nothing ' +
      `depended on it, which is how a software emergency stop that does nothing sat open for three weeks and ` +
      `reached no screen. The bearers are ${CONSEQUENCE_BEARERS.join(', ')}, worst first; "none" is a real ` +
      'answer worth writing, because it is what makes a list shorter honestly. See the Consequence shape for ' +
      'what each word claims.',
    example: {
      bearer: 'person',
      what: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it during transplant trials.',
    },
  },
  {
    key: 'paused',
    type: 'Pause',
    required: false,
    description:
      `This ${kind} has been deliberately put down: {"since":"2026-08-01","why":"…"}, and where there is one, ` +
      '{"until":{…}} for what should bring it back. A paused record has NOT stopped short — it is waiting on ' +
      'purpose — so it is kept off the list of things that need you today WITHOUT being hidden from anything ' +
      'else. `why` is required inside the object, and that is the whole point of the field: a pause with no ' +
      'reason is indistinguishable from abandonment a month later. Leave `until` out when there is no idea ' +
      'when, which is honest and common; the pause is then reported as open-ended rather than as though it ' +
      'were still waiting on something. See the Pause shape.',
    example: {
      since: '2026-08-01',
      why: 'The force gauge went back to the metrology lab, so nothing can be measured until the replacement arrives.',
      until: { condition: 'the replacement 50 N gauge is on the bench' },
    },
  },
]

/**
 * WHOSE MOVE IT IS. Three words, and the fourth answer is no word at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FIELD EXISTS: 78 FIELDS MENTION AN ACTOR AND NONE OF THEM SAYS THIS
 * ---------------------------------------------------------------------------------------
 *
 * Claim `AcqvS9oO1Hf7` read all 18 kinds and all 78 fields that name a person or an agent, and
 * every one of them is about something else. `obligation.owedTo` is who is WAITING.
 * `consequence.bearer` is who is HURT. `session.agent` is which agent a run is.
 * `annotation.chosenRecipient` is where a comment goes. Who has to act NEXT was stored nowhere, so
 * an agent picking up a project could not tell work waiting on it from work waiting on the owner.
 *
 * ---------------------------------------------------------------------------------------
 * A ROLE, NEVER A NAME
 * ---------------------------------------------------------------------------------------
 *
 * The words are `person`, `agent` and `either` — what somebody has to BE to make the next move,
 * not who they are. Storing a name would make one installation's owner part of the vocabulary and
 * would put identity where responsibility belongs. Who wrote a record is already recorded, on the
 * change row, from the actor headers; this is the other question.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT IS NOT `either`, AND IT IS THE COMMON ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * Leaving it out means NOBODY HAS SAID. `either` means somebody looked and decided it does not
 * matter who. 116 problems and 34 tasks in the live corpus have no value here and none of them is
 * a record of a decision that either could do it. That is why this field is never required and why
 * nothing infers it from a title, a kind or a state word.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT `GET /api/needs-you`, AND THE SEPARATION IS A PERMISSION BOUNDARY
 * ---------------------------------------------------------------------------------------
 *
 * `needs-you` answers "what only the human can do" from the KIND and the resolution — settling a
 * fork, which the server refuses to every agent except the secretary carrying the person's authorization —
 * with no caller-supplied filter reaching it. This
 * field is agent-writable. Routing it into that queue would let an agent push work into the
 * owner's governance list, or take work out of it by writing `whose_move: "agent"`. So this gets
 * its own projection, `GET /api/whose-move`, and `needs-you` reads nothing here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT CALLED `needs`, WHICH IS WHAT THE PLAN ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * `needs` is a taken word in this product. Until the migration that turned a pipeline step into a
 * record, `pipeline.data.steps[].needs[]` was a step's DEPENDENCY ARRAY — what it waits on, with a
 * gate — and it was the second representation of a dependency that the `blocks` link is now the
 * only one of. `tests/kinds.test.ts` still holds a group of tests whose whole job is that the old
 * shape can never come back: no kind may declare a field called `needs`, and an agent that sends
 * the old array is answered with the link to write instead. Declaring a field with that name on
 * four kinds would have meant editing those tests to let the word back in, and a test is not
 * edited to make a new field fit.
 *
 * The word would also have carried two meanings at once — what a piece of work WAITS ON, and who
 * must MOVE it — which is the collision this campaign already refused twice, once for `checkpoint`
 * and once for `envelope`. `whose_move` has one meaning and it is the question it answers.
 */
export const MOVE_ACTORS = ['person', 'agent', 'either'] as const
export type MoveActor = (typeof MOVE_ACTORS)[number]

/*
 * THE WORD AND THE MEANING FOR EACH VALUE, and for the fourth answer, the field not being there,
 * are in src/shared/words/en.ts under `g2b.move.*`, with their Chinese in zh.ts. The record page
 * draws them through `t()`. There is no English copy here: the one this file held was read by
 * nothing and was a second place for the same eight phrases (problem qdtawpOHQh-B).
 */

/**
 * WHOSE MOVE IT IS, on one piece of work. See `NEEDS_ACTORS` above for the whole argument.
 *
 * Written once and given to the four kinds an open loop can be — `task`, `problem`, `idea` and
 * `direction`. Four copies of these sentences would be four things that must agree with nothing
 * making them agree, which is the defect this codebase keeps producing.
 *
 * IT IS NOT ON A CONTAINER. A module, a pipeline and a claim do not take it: "whose move is the
 * potting rig module" has no answer, and a container that carried one would be a second, coarser
 * answer free to disagree with the pieces inside it.
 */
export const whoseMoveField = (kind: string): FieldSpec => ({
  key: 'whose_move',
  type: unionOf(MOVE_ACTORS),
  required: false,
  description:
    `Whose move it is on this ${kind}: "person" when the next step needs a judgement, an approval, a hand on ` +
    'the hardware or money; "agent" when it is work an agent can do on its own; "either" when somebody looked ' +
    'and decided it does not matter which. IT IS A ROLE AND NEVER A NAME, because responsibility is not ' +
    'identity — who WROTE this is already recorded on the change row. LEAVE IT OUT when nobody has said: absent ' +
    'is NOT "either", and nothing infers a value from the title, the kind or the state. ONE EXCEPTION, on a ' +
    '`problem`, and it is an agent SAYING something rather than Mole Office inferring it: a problem an AGENT files ' +
    'with this key absent is stored saying "agent", because since 3 September 2026 an ' +
    'engineering question is the agent\'s. Naming a value — "person" included, which is how you hand a question ' +
    'up — is stored exactly as sent, and a problem a PERSON files with the key absent is stored without it. ' +
    'Read it back at GET /api/whose-move, which is a separate queue from ' +
    'GET /api/needs-you — that one answers what an agent is REFUSED and this field cannot add to it or take ' +
    'anything out of it. It is NOT what this work waits on: a dependency is a `blocks` link, which is the one ' +
    'thing every reader of a dependency reads.',
  example: 'agent',
})

/**
 * WHO HAS PASSED THIS QUESTION UP, one entry per rung. Criterion P55.
 *
 * It sits on the same four kinds as `whose_move`, because it is only ever about a `whose_move` of
 * "person". Everything else this rule needs is worked out rather than stored: who marked it comes
 * from the revision ledger and who started them comes from the registry, and a stored copy of
 * either would be free to fall out of step with it.
 *
 * IT IS APPENDED AND NEVER REWRITTEN. A write that changes or removes an entry already here is
 * refused, so the list is the path the question took and not a claim somebody can edit afterwards.
 */
export const passedItOnField = (kind: string): FieldSpec => ({
  key: CONFIRMED_BY,
  type: 'PassedItOn[]',
  required: false,
  description:
    `WHO HAS PASSED THIS ${kind.toUpperCase()}'S QUESTION UP, oldest first. When an agent with a starter says ` +
    '`whose_move: "person"`, the question is with that starter and NOT with the person; the starter passes it on, ' +
    'closes it, or takes the question off the record. Passing it on moves it one rung, until an agent the person ' +
    'started passes it on, and that is what puts it on the person\'s list. Absent means nobody has passed it on ' +
    'yet, which for a question an agent with no recorded starter asked is also how it reaches the person — ' +
    'GET /api/records/<id> says which. Written with POST /api/records/<id>/pass-the-question-on, by whoever the ' +
    'question is with; anybody else is refused, and an entry already here can never be changed or removed.',
  example: [{ who: { kind: 'agent', id: 'secretary-1' }, at: '2026-09-06 20:15:00' }],
})
