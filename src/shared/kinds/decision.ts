// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `decision`, the choice that was made and what it stands on.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, DECISION_AUTHORITIES, DecisionAuthority, DECISION_AUTHORITY_NEEDS,
 * AGENT_AUTHORITIES, DECISION_SUMMARY_BELONGS and DECISION_SUMMARY_GUIDANCE from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf`, THE `DecisionHalf` TYPE AND THE `KindSpec` AND
 * `ShapeSpec` TYPES FROM ./kind-common.ts, AND `theFourActs` FROM ../governance-acts.ts. IT
 * IMPORTS NOTHING FROM ../types.ts. THE SIX DECLARATIONS IN THIS FILE MOVED HERE WITH THE KIND, because its `authority`
 * field is `unionOf(DECISION_AUTHORITIES)` and its `summaryGuidance` is
 * `DECISION_SUMMARY_GUIDANCE`; a file that imports them from kinds.ts would make the central
 * file and this one load each other. `DecisionHalf` stays in kind-common.ts.
 */
import { commonFields, unionOf, type DecisionHalf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { theFourActs } from '../governance-acts.ts'

/**
 * WHAT MAKES A DECISION A DECISION AND NOT AN OPINION. Five words, and absence is refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FIELD EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The rule since 27 August 2026: an agent may close a question only when it can cite enough
 * authoritative evidence, and it may not claim an authority that the evidence does not hold.
 * Until then the product asked a cruder question — is the caller a person — and answered
 * every agent with 403. That kept the record honest and left an agent that KNEW the owner had
 * already decided something able to file only a note nothing queries.
 *
 * So the question moves from WHO IS ASKING to WHAT IS THIS STANDING ON. The five words below are
 * the answers Mole Office will accept, and each one carries something checkable with it.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENCE IS THE ONE ANSWER THAT IS REFUSED, AND IT IS REFUSED TO EVERY AGENT
 * ---------------------------------------------------------------------------------------
 *
 * Everywhere else in this product a missing field means nobody has said, and that is a real answer.
 * Here it is not, because a decision with nothing under it is an opinion wearing a decision's name,
 * and the whole point of the record is that somebody can go and check. A person may still write one
 * with no authority — a person deciding because they feel like it is a decision, and it is theirs.
 * `assertMayDecide` in src/server/lib/records/the-persons-own-acts.ts is the guard.
 */
export const DECISION_AUTHORITIES = [
  'the owner said so',
  'an existing decision',
  'a product invariant',
  'a measurement',
  'reversible engineering judgement',
] as const
export type DecisionAuthority = (typeof DECISION_AUTHORITIES)[number]

/** What each authority has to carry with it, in the words the refusal uses. */
export const DECISION_AUTHORITY_NEEDS: Readonly<Record<DecisionAuthority, string>> = {
  'the owner said so':
    'the durable owner record that says it — a note, an annotation or a change row they wrote — named by id in ' +
    '`authority_reference`, and their words quoted in `because` rather than paraphrased',
  'an existing decision': 'the decision it derives from, named by id in `authority_reference`',
  'a product invariant': 'which invariant, by name, from USER.md or an approved design',
  'a measurement': 'the command and its output, or the id of the record holding it',
  'reversible engineering judgement': 'what makes it reversible, and what would reopen it',
}

/**
 * THE FOUR AN AGENT MAY CLAIM FOR ITSELF, as opposed to the one it may only transcribe.
 *
 * `the owner said so` is not in here. An agent citing it is not deciding, it is writing down
 * something the person already decided, and that is a different act with a different requirement: the
 * durable record has to exist. Evidence can settle engineering and inform governance, but it
 * cannot stand in for a governance act.
 */
export const AGENT_AUTHORITIES = DECISION_AUTHORITIES.filter(
  (word) => word !== 'the owner said so',
) as readonly DecisionAuthority[]

/**
 * WHAT A DECISION'S LEVEL-3 CONTEXT IS, IN ONE SENTENCE. Criterion DC1.
 *
 * Level 3 of the reading ladder is the record's own `summary`. For a decision that summary is not a
 * restatement of the choice: it says what happened and why the choice was made, so an agent that
 * meets the decision months later does not have to obey or fight a rule whose reason has gone.
 *
 * IT IS ONE SENTENCE ON PURPOSE, because the incompleteness message for a decision filed without a
 * summary has to say in one sentence what belongs in it (criterion DC2).
 */
export const DECISION_SUMMARY_BELONGS =
  'what happened — the situation, the measurement or the words that raised the question — and why ' +
  'this was decided, written for an agent that meets the decision months later with nothing else in hand'

/**
 * THE DECISION KIND'S GUIDANCE FOR ITS `summary` — criterion DC1.
 *
 * It is longer than the one sentence above because it also says what the summary is NOT and what to
 * do when the context cannot be found. `KIND_SPECS` below appends it to the decision kind's
 * `shortForms` description, which is where the schema says level 3 is the record's own `summary`.
 */
export const DECISION_SUMMARY_GUIDANCE =
  'A DECISION\'S LEVEL-3 CONTEXT IS THIS SUMMARY: it says ' +
  `${DECISION_SUMMARY_BELONGS}. It is NOT a restatement of \`option_taken\` — that says what was ` +
  'chosen, and this says why there was a choice at all. If the context cannot be found, say so in the ' +
  'summary in words — "the context was not recorded; what is known is …" — and never invent one. ' +
  'A decision with no summary is incomplete, not refused.'

export const decisionKind: KindSpec = {
    kind: 'decision',
    purpose:
      'A choice that was made, who made it, what it stands on, and what would make it worth reopening.',
    whenToRecord:
      'When a choice closes off an option that costs real work to reopen. A PERSON MAY FILE ANY DECISION. AN AGENT ' +
      'MAY FILE ONE IT CAN SAY WHAT IT STANDS ON: send `authority` — one of five words — and `decided_by` holding ' +
      'your own id or handle. An agent may also write down a decision the OWNER made, with `decided_by`: "the owner", ' +
      '`authority`: "the owner said so" and an `authority_reference` naming a live record that carries their words. ' +
      'A decision with no authority is refused to every agent. THIS PARAGRAPH USED TO READ "Only the human may ' +
      'file one, and that is the one access control in the product", and it stopped governing on 27 August 2026, ' +
      'when it was settled that an agent may close a question when it can cite enough authoritative evidence, ' +
      'and may not make up authority the evidence does not hold. Deleting and restoring are ' +
      'still refused to every agent. Promoting a proposal and pointing a decision at one are refused to every ' +
      'agent except the secretary carrying the owner\'s authorization — that link is what settles a ' +
      'fork, and since 15 September 2026 the secretary may make it on the owner\'s quoted ' +
      'words or the owner\'s press. If you have no authority to cite, write the `proposal` instead: the fork, ' +
      'the options, the recommendation, and who settles it. ' +
      'SAY WHAT IT GOVERNS in `governs`: the modules, flows, pipelines and files it applies to, so an agent that asks ' +
      'GET /api/decisions/governing before it builds in one of them finds it. ' +
      `FOUR ACTS LOOK LIKE DECIDING AND ARE NOT, and each has its own door: ${theFourActs()}`,
    humanOnly: true,
    // THE SUMMARY IS THE DECISION'S LEVEL-3 CONTEXT, and this is the one sentence that says so.
    // Criterion DC1; `shortFormsField` appends it to the description that already names level 3.
    summaryGuidance: DECISION_SUMMARY_GUIDANCE,
    fields: [
      { key: 'decided_on', type: 'date', required: false, half: 'notes', description: 'The date the choice was actually made, which is often not the date it was written down.', example: '2026-07-30' },
      { key: 'because', type: 'string', required: false, half: 'core', description: 'The reasoning, in enough detail that you could argue with it in a year. This is the whole value of the record.', example: 'Changing the controller and the hardware in the same week makes any regression impossible to attribute.' },
      { key: 'revisit_when', type: 'string', required: false, half: 'notes', description: 'The condition that reopens it. A decision with no such condition is a rule.', example: 'the setting 12 reprint has been measured' },
      { key: 'alternatives_rejected', type: 'string[]', required: false, half: 'notes', description: 'What was turned down, so it is not re-proposed as if it were new.', example: ['swap to a dedicated planner service now', 'move the pot by hand'] },
      {
        key: 'option_taken',
        type: 'string',
        required: false,
        half: 'core',
        description:
          'The words of what was taken. When one of the proposal\'s own options was chosen, copy that option word ' +
          'for word from its `options` list. When none of them was chosen, write your own answer here. Leave it ' +
          'out only when the decision was not a choice between written options. Settled by the owner on ' +
          '2026-08-13: a decision selects a recorded option or an explicit custom one, and either may carry free ' +
          'text that qualifies it. Before this field the choice was stored only as its opposite, in ' +
          '`alternatives_rejected`, so a decision that deliberately took none of the options and one that never ' +
          'made a choice looked identical.',
        example: 'a — as proposed: six tasks and three directions',
      },
      {
        key: 'words_since',
        type: 'WordsAdded[]',
        required: false,
        half: 'core',
        /**
         * WORDS THE PERSON ADDED AFTER THE PRESS. Criterion M83.
         *
         * `because` is written WITH the press — the reason box sits beside the options and is saved
         * with the option pressed — so before this field there was no way to say anything about a
         * decision once it was made.
         *
         * IT IS A LIST AND NOT A SECOND `because`, and each entry carries when it was written. What
         * they thought at the moment they decided and what they thought a week later are two facts, and
         * one field holding both would let the second quietly overwrite the first.
         */
        description:
          'Words added AFTER the decision was made, each with when it was written. `because` is the reasoning ' +
          'given WITH the press; this is everything said since. Append to it — never replace it — so what was ' +
          'thought at the moment of deciding stays readable beside what was thought later.',
        example: [{ at: '2026-09-08 10:15', words: 'Still right a day later; the second option is worse than it looked.' }],
      },
      {
        key: 'option_index',
        type: 'number',
        required: false,
        half: 'core',
        // WHY THIS EXISTS BESIDE `option_taken` RATHER THAN INSTEAD OF IT.
        //
        // The two answer different questions. `option_taken` says WHAT was decided, in words a
        // person can read a year later with no fork beside them. This says WHICH of the recorded
        // options that was, so the corpus can answer "how often is the agent's pick taken" without
        // matching prose against prose.
        //
        // ITS ABSENCE IS A REAL ANSWER, which is why the pair is not one field. A decision with
        // `option_taken` and no `option_index` took none of the recorded options and wrote its own,
        // and that is exactly the case §38 was settled to make storable. A decision with neither
        // said nothing about which option it took. Those were the same record before this field.
        description:
          'Which of the proposal\'s options was taken, counted from 0 in the order the proposal lists them. Send ' +
          'it ONLY when the decision took one of those recorded options, and send `option_taken` with it holding ' +
          'that option\'s own words. LEAVE IT OUT when the person wrote their own answer instead — an absent ' +
          'index beside a filled `option_taken` is how Mole Office tells "none of these, here is what I am doing" ' +
          'apart from "I took option B". Settled by the owner on 2026-08-13.',
        example: 0,
      },
      // ------------------------------------------------------- who decided, who wrote it down, and
      //                                                          what it stands on
      //
      // THREE FACTS THAT WERE ONE. Before 27 August 2026 a decision record answered only "a person
      // filed this", because the kind was refused to every agent, so who decided and who typed were
      // the same by construction and neither was stored. Since then, MAKING a governance decision is
      // kept apart from RECORDING a decision the human already made. These three fields are that
      // separation, and `authority` is the one the guard reads.
      {
        key: 'decided_by',
        type: 'string',
        required: false,
        half: 'notes',
        description:
          'Who made the choice — "the owner" when it was theirs, or the id or the handle of the agent that made it. IT ' +
          'IS A ROLE, AN ID OR A HANDLE AND NEVER A PERSON\'S NAME, for the reason `who_settles_it` gives. An agent may write "the ' +
          'owner" here ONLY when it is writing down something the owner already decided, which means `authority` says "the ' +
          'owner said so" and `authority_reference` names the durable record that carries their words. Leave it out ' +
          'when nobody has said, and expect a screen to say so: an unattributed decision is not the owner\'s.',
        example: 'the owner',
      },
      {
        key: 'recorded_by',
        type: 'string',
        required: false,
        half: 'notes',
        description:
          'Who wrote this decision down, which is often not who made it. MOLE OFFICE FILLS THIS IN FROM THE ACTOR ON THE ' +
          'REQUEST AND REFUSES IT FROM A CALLER: sending it is a 403 that says so, on the create and on the patch, ' +
          'because a caller that could type this could sign the owner\'s name to its own choice. It is written once, ' +
          'when the record is filed, and it never changes afterwards.',
        example: 'agent claude-code',
      },
      {
        key: 'authority',
        type: unionOf(DECISION_AUTHORITIES),
        required: false,
        half: 'notes',
        description:
          'What makes this a decision rather than an opinion, in one of five words. "the owner said so" — they said ' +
          'it, and `authority_reference` names the durable record that carries their words. "an existing decision" — ' +
          'it follows from one, named by id. "a product invariant" — from USER.md or an approved design, named. ' +
          '"a measurement" — the command and its output, or the record holding it. "reversible engineering ' +
          'judgement" — say what makes it reversible and what would reopen it. AN AGENT WRITING A DECISION MUST ' +
          'SEND ONE OF THESE: a decision with no authority is refused to every agent, which is the one place in ' +
          'this product where a missing field is not a real answer. A person may leave it out, because a person ' +
          'deciding because they feel like it is a decision.',
        example: 'a measurement',
      },
      {
        key: 'authority_reference',
        type: 'string',
        required: false,
        half: 'notes',
        description:
          'The id of the record the authority lives in — the owner\'s note, the earlier decision, the measurement. ' +
          'REQUIRED WHEN AN AGENT WRITES "the owner said so", and the id has to answer to a live record in this ' +
          'project: a reference nobody can open is a claim about the owner nobody can check. Quote what they actually said ' +
          'in `because`; a paraphrase is the agent\'s words wearing the owner\'s authority.',
        example: 'quB9xxJmHWEU',
      },
      {
        key: 'replaces',
        type: 'string[]',
        required: false,
        half: 'core',
        description:
          'THE EARLIER DECISIONS THIS ONE CHANGES OR REPLACES, by id: a list, which may be empty. Every door a decision is ' +
          'made through asks for it and refuses a decision that does not say, listing the earlier decisions on the same ' +
          'subjects as candidates. The office links each one as superseded, and every normal reading ' +
          'of decisions then leaves it out; its own page keeps it, marked replaced and naming this one. A decision that ' +
          'changes only part of an earlier one names it too, and restates what stays.',
        example: ['Madeup100005'],
      },
      {
        key: 'governs',
        type: 'GovernedPlace[]',
        required: false,
        half: 'notes',
        description:
          'WHAT THIS DECISION GOVERNS: the modules, flows, pipelines and files it applies to, filled when it is recorded. ' +
          'Each entry names a record by id (`{"record": "<id>"}`) or a path in the repository (`{"path": "src/web/pages"}`). ' +
          'Before an agent builds in a place it asks GET /api/decisions/governing?path=<file> or ?record=<id>, which ' +
          'lists the decisions whose governs reaches it, so a decision with nothing here is one no such question finds. ' +
          'A rule that holds everywhere governs no single place: leave it empty rather than list everything. ' +
          'This is also what the decision CONCERNS, in the owner\'s words; there is no ' +
          'second field for it, and no limit on how many places it names.',
        example: [{ record: 'kYp1Ds8WmQ2z' }, { path: 'src/web/pages/GovernancePage.tsx' }],
      },
      {
        key: 'basis',
        type: 'string[]',
        required: false,
        half: 'notes',
        description:
          'WHAT THE DECISION WAS BASED ON, by id: a report, an earlier decision, a message, any record. It is ' +
          'there so that later anyone can confirm a decision\'s reasons and ' +
          'source, with no limit on how many. Each must be a record that is there. Absent means nobody recorded ' +
          'the basis, which is not the same as having none. Second-level content: a reply hands it to an agent ' +
          'only when asked with ?secondLevel=show.',
        example: ['Madeup100006', 'Madeup100005'],
      },
      {
        key: 'why_it_replaces_none',
        type: 'string',
        required: false,
        half: 'notes',
        description:
          'WHY IT REPLACES NO EARLIER DECISION, when nobody wrote `replaces`: written by the office when a promotion settled a fork whose ' +
          'press named no earlier decision and no earlier decision shared a subject with it.',
        example: 'Nobody named one, and no earlier decision in this project is linked to the same records as the fork it settles.',
      },
      ...commonFields('decision').map((field) => ({ ...field, half: 'notes' as DecisionHalf })),
    ],
    rules: [
      'data.recorded_by is written by Mole Office from the actor on the request and is never accepted from a caller. ' +
        'Sending it is refused on POST and on PATCH, and it cannot be changed once the record is filed. Who ' +
        'DECIDED is the caller\'s to state and that is `decided_by`.',
      'an agent writing a decision must send data.authority, and it must be one of the five words. An agent that ' +
        'sends data.decided_by "the owner" must also send authority "the owner said so" and an ' +
        'authority_reference that answers to a live record — it is then recording a choice the owner made rather than ' +
        'making one. A person may write any of them, including with no authority at all.',
      'data.option_index may only be sent with data.option_taken: an index with no words is a choice nobody can ' +
        'read without the proposal open beside it, and the words are what a decision is read for.',
      'data.option_index counts from 0 and must be a whole number: it is a position in the proposal\'s own ' +
        '`options` list.',
    ],
    example: {
      decided_on: '2026-07-30',
      because: 'Changing the controller and the hardware in the same week makes any regression impossible to attribute.',
      revisit_when: 'the setting 12 reprint has been measured',
      option_taken: 're-texture the pads',
      option_index: 0,
      alternatives_rejected: ['swap to a dedicated planner service now'],
      governs: [{ path: 'printer/profiles/pads.cfg' }],
      replaces: [],
      decided_by: '<your own id or handle>',
      authority: 'reversible engineering judgement',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const DECISION_SHAPES: Record<string, ShapeSpec> = {
  /**
   * WHICH PARTICIPANT: a person or a durable agent, by kind and id.
   *
   * Criterion M2 of design/messages/ACCEPTANCE.md: a message references a participant by (kind, id)
   * and nothing else. Not by handle, because a handle is a name somebody may change and a message
   * addressed to a name would follow the name rather than the participant.
   */
  /**
   * THE PERSON'S SAY THAT ONE SECRETARY MAY ACT FOR THEM, and until when. Criterion P59, their 代管.
   *
   * It is declared as a shape rather than left an open bag because every field of it is read by
   * something: the id by the two ledgers, `endsWhen` and `until` by the reading that decides whether
   * it still holds, and `endedAt` by both. A bag would let a grant be stored that nothing could act
   * on, which for this field means an agent believing it may act for the person when nothing says so.
   */
  /**
   * WORDS SOMEBODY ADDED TO A DECISION AFTER IT WAS MADE. Criterion M83.
   *
   * A SHAPE AND NOT AN OPEN BAG, because both fields are read: the words are drawn on the decision's
   * page and the stamp is what puts them in order beside the reasoning written with the press.
   */
  WordsAdded: {
    name: 'WordsAdded',
    description:
      'One thing the person said about a decision AFTER making it, so a comment can still be added once the ' +
      'press has landed. `because` on the decision is the reasoning ' +
      'given WITH the press; these are everything said since, each with when.',
    fields: [
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When these words were written, in local wall clock.',
        example: '2026-09-08 10:15',
      },
      {
        key: 'words',
        type: 'string',
        required: true,
        description: 'What was said. Plain words, as they were written.',
        example: 'Still right a day later; the second option is worse than it looked.',
      },
    ],
  },

  /**
   * ONE PLACE A DECISION GOVERNS. A decision says what it applies to, so an agent
   * about to build in a place can ask which decisions govern it (GET /api/decisions/governing).
   *
   * A record OR a path, never both: a module, flow or pipeline is named by its id, and a file, folder or pattern by
   * its path in the project's repository. The server checks that a named record is live, in the same project and
   * of one of those three kinds (`assertTheGovernedPlacesAreReal` in src/server/lib/governs.ts).
   */
  GovernedPlace: {
    name: 'GovernedPlace',
    description:
      'One place a decision applies to: a module, flow or pipeline by its id in `record`, or a file, a folder or a ' +
      'pattern by its path in `path`. Exactly one of the two.',
    fields: [
      {
        key: 'record',
        type: 'string',
        required: false,
        description: 'The id of a live module, flow or pipeline in the same project.',
        example: 'kYp1Ds8WmQ2z',
      },
      {
        key: 'path',
        type: 'string',
        required: false,
        description:
          'A path relative to the repository root, as a module claims one: a file, a folder (which covers every file ' +
          'under it) or a pattern with * or **.',
        example: 'src/web/pages/GovernancePage.tsx',
      },
    ],
  },

}
