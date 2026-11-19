// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `handbook`, the handbook a place follows.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `PLACES` FROM ../targets.ts, AND `HANDBOOK_STATES` AND
 * `THE_OPENING_MOST_WORDS` FROM ../handbooks.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { PLACES } from '../targets.ts'
import { HANDBOOK_STATES, THE_OPENING_MOST_WORDS } from '../handbooks.ts'
export const handbookKind: KindSpec = {
    kind: 'handbook',
    purpose:
      'GUIDANCE FOR WHOEVER STARTS A FLOW OR TAKES A ROLE CARD, kept as a record: whom it is for, where it stands, its ' +
      'text in one or more languages, the places it hangs on, and why each change to its text was made. The office ' +
      'sends the opening of an in-use handbook to the agent that starts a flow it hangs on, or takes a card it hangs ' +
      'on, in that agent\'s language, with the reason. Who wrote each version, and when, is the revision ledger\'s.',
    whenToRecord:
      'When somebody who starts a flow or takes a card should be told something first. File it with POST /api/records, ' +
      'kind "handbook". A write that changes its text adds one entry to the end of text_changes, saying why.',
    humanOnly: false,
    fields: [
      {
        key: 'for',
        type: 'string',
        required: true,
        description: 'WHOM IT IS FOR, in words: the reader the text is written to.',
        example: 'The agent that runs an acceptance.',
      },
      {
        key: 'state',
        type: unionOf(HANDBOOK_STATES),
        required: true,
        description:
          'WHERE IT STANDS: "draft" while it is being written, "in use" when the office sends it, "retired" when it is ' +
          'kept but no longer sent. Only an in-use handbook is sent.',
        example: 'in use',
      },
      {
        key: 'text',
        type: 'Record<string, HandbookText>',
        required: true,
        description:
          'ITS TEXT, BY LANGUAGE: one entry for each language it is written in, keyed by the language\'s code, such as ' +
          `"en" or "zh". The opening is what is sent, at most ${String(THE_OPENING_MOST_WORDS)} words; the rest is read on request.`,
        example: { en: { opening: 'Read the acceptance list before the first press.', rest: 'Each item says what it checks.' } },
      },
      {
        key: 'hangs_on',
        type: 'HandbookPlace[]',
        required: true,
        description:
          'THE PLACES IT HANGS ON: a flow, one step of a flow, a role card or a project. It is sent at a flow\'s start ' +
          'and with a card, not yet for a project. An empty list says it hangs nowhere, so it is sent to nobody.',
        example: [{ flow: 'flow-id' }],
      },
      {
        key: 'text_changes',
        type: 'HandbookTextChange[]',
        required: true,
        description:
          'WHY ITS TEXT CHANGED, oldest first. The write that files it, and every write that changes its text, adds one ' +
          'entry at the end naming the languages it changed and why. Earlier entries never change; a restore of an ' +
          'earlier version puts back that version\'s list.',
        example: [{ languages: ['en'], why: 'Two acceptances missed the list in one week.' }],
      },
      ...commonFields('handbook'),
    ],
    rules: [
      'A write that changes the text adds exactly one entry to text_changes, naming the languages whose text it changed, and a write that does not change the text adds none.',
      'An agent that puts a role card in hangs_on, or changes the text of an in-use handbook on a card, or puts one in use, needs what a change to a card\'s words needs: a warrant on a decision of the person\'s.',
      'Who wrote each version, and when, is read from the record\'s revisions.',
    ],
    example: {
      for: 'The agent that runs an acceptance.',
      state: 'in use',
      text: { en: { opening: 'Read the acceptance list before the first press.' } },
      hangs_on: [{ flow: 'flow-id' }],
      text_changes: [{ languages: ['en'], why: 'Two acceptances missed the list in one week.' }],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const HANDBOOK_SHAPES: Record<string, ShapeSpec> = {
  /** ONE LANGUAGE'S TEXT OF A HANDBOOK (src/shared/handbooks.ts). */
  HandbookText: {
    name: 'HandbookText',
    description: 'ONE LANGUAGE\'S TEXT OF A HANDBOOK: the opening, which is sent, and the rest, which is read on request.',
    fields: [
      { key: 'opening', type: 'string', required: true, description: `What is sent, at most ${String(THE_OPENING_MOST_WORDS)} words.`, example: 'Read the acceptance list before the first press.' },
      { key: 'rest', type: 'string', required: false, description: 'The rest of the text, read with GET /api/records/<id>.', example: 'Each item says what it checks.' },
    ],
  },

  /** ONE PLACE A HANDBOOK HANGS ON. Exactly one of flow, card and project; a step only beside a flow. */
  HandbookPlace: {
    name: 'HandbookPlace',
    description:
      'ONE PLACE A HANDBOOK HANGS ON: {"flow": "<flow id>"}, {"flow": "<flow id>", "step": <its number>}, ' +
      '{"card": "<card word>"} or {"project": "<project id>"}.',
    fields: [
      { key: 'flow', type: 'string', required: false, description: 'A flow, by its record id.', example: 'flow-id' },
      { key: 'step', type: 'number', required: false, description: 'One step of that flow, by its number, counted from 1.', example: 2 },
      { key: 'card', type: 'string', required: false, description: 'A role card, by its word, such as "worker".', example: 'worker' },
      { key: 'project', type: 'string', required: false, description: 'A project, by its id.', example: 'release' },
    ],
  },

  /** ONE ENTRY OF A HANDBOOK'S CHANGE RECORD. Who wrote it, and when, is the revision ledger's. */
  HandbookTextChange: {
    name: 'HandbookTextChange',
    description: 'ONE CHANGE TO A HANDBOOK\'S TEXT: the languages whose text the write changed, and why.',
    fields: [
      { key: 'languages', type: 'string[]', required: true, description: 'Each language whose text the write changed, by its code.', example: ['en'] },
      { key: 'why', type: 'string', required: true, description: 'Why the text changed, in one or two sentences.', example: 'Two acceptances missed the list in one week.' },
    ],
  },

}
