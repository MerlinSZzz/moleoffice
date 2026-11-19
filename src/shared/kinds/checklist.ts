// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `checklist`, a list of things to tick.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM ./kind-common.ts, AND
 * `CHECKLIST_ITEM_STATES`, `CHECKLIST_ITEM_STYLES` AND `EVIDENCE_KINDS` FROM ../checklists.ts. IT
 * IMPORTS NOTHING FROM ../types.ts.
 */
import { unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { CHECKLIST_ITEM_STATES, CHECKLIST_ITEM_STYLES, EVIDENCE_KINDS } from '../checklists.ts'
export const checklistKind: KindSpec = {
    kind: 'checklist',
    purpose:
      "ONE PERSON'S OR ONE AGENT'S CHECKLIST: a title and its items, each one request kept in its own words with " +
      'the message it came in, where it stands, and what shows it was done. The office brings the open items back ' +
      'to the owner: in the brief after a compaction, in the 07:00 and 18:00 report reminders, in the idle reminder, ' +
      "and in an item's own reminder when the owner switches it on.",
    whenToRecord:
      'Never through POST /api/records: every write to this kind is refused there, the person\'s included. Make one ' +
      'with POST /api/checklists, and add an item for each request you are asked to keep, the moment it arrives: a ' +
      'request kept only in a conversation is lost at the next compaction.',
    humanOnly: false,
    fields: [
      {
        key: 'owner',
        type: 'ParticipantRef',
        required: true,
        description:
          'WHOSE CHECKLIST IT IS: whoever made it, written once by the office from the caller and refused from every ' +
          "body. Its open items are brought back to this owner, and only this owner switches an item's reminder on.",
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'items',
        type: 'ChecklistRequest[]',
        required: true,
        description: 'The items, in the order they were added. An empty list is a checklist with nothing on it yet.',
        example: [{ id: 'i-1', words: 'Put the camera calibration in my manual.', fromMessage: 'Madeup100003', state: 'open', style: 'evidence-or-words', mustBeInManual: true }],
      },
    ],
    rules: [
      'Only its own doors write a checklist. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      'An item is "done" only with evidence: a commit, a report, a manual section or a run.',
      'An item marked mustBeInManual is "done" only with a manual section among its evidence.',
      'A superseded item names the later message that replaced it, in supersededBy.',
      "An item's reminder is off until the checklist's owner switches it on, and it fires once, to the owner alone.",
      'An item has one of two styles, "plain" or "evidence-or-words", chosen by the agent that creates it and stored on the item; an item created with no style is stored "plain", and one stored before the styles existed reads as "plain".',
      "The checklist's own owner may write their own words on an item, with the press that marks the item done and the version the checklist had when it was read. The words are kept exactly as written, are read under the item, and are not evidence.",
    ],
    example: {
      owner: { kind: 'agent', id: 'secretary-1' },
      items: [
        { id: 'i-1', words: 'Put the camera calibration in my manual.', fromMessage: 'Madeup100003', state: 'open', style: 'evidence-or-words', mustBeInManual: true },
      ],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const CHECKLIST_SHAPES: Record<string, ShapeSpec> = {
  // ONE ITEM OF A CHECKLIST: one request, its words, the message it came in, where it stands and what
  // shows it was done. src/shared/checklists.ts holds its rules.
  // NOT `ChecklistItem`, which is one line of a report's checklist block, and not `ProgressItem`,
  // which is one line of a module's checklist.
  ChecklistRequest: {
    name: 'ChecklistRequest',
    description:
      'ONE ITEM OF A CHECKLIST: one request, kept in its own words with the message it came in. It is nested in ' +
      'its checklist and changed by its id: PATCH /api/checklists/<id>/items/<item id>.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'A stable id, unique within the checklist, written by the office. Items are never taken out, so an id is never given twice.', example: 'i-1' },
      { key: 'words', type: 'string', required: true, description: "The request, in the words of whoever asked.", example: 'Put the camera calibration in my manual.' },
      { key: 'fromMessage', type: 'string', required: false, description: 'The id of the message the request came in. Absent when it came some other way.', example: 'Madeup100003' },
      { key: 'state', type: unionOf(CHECKLIST_ITEM_STATES), required: true, description: 'Where it stands. "done" needs evidence unless the person marked it done; "superseded" needs supersededBy.', example: 'superseded' },
      // Wave 14a round 1, on a message.
      {
        key: 'style',
        type: unionOf(CHECKLIST_ITEM_STYLES),
        required: false,
        description:
          'WHICH OF THE TWO PRESENTATIONS THE ITEM HAS, chosen by the agent that creates it: "plain" is a blank box on the left its owner ticks directly, and is stored when none is sent; "evidence-or-words" is the special item whose left box opens the evidence picker, where evidence is picked or the owner\'s own passage is written. Absent on an item stored before the styles existed: it reads as "plain".',
        example: 'plain',
      },
      { key: 'mustBeInManual', type: 'boolean', required: false, description: "True when this must be written in the owner's manual, so an agent marks it done only with a manual section among its evidence.", example: true },
      {
        key: 'evidence',
        type: 'ChecklistEvidence[]',
        required: false,
        description: 'What shows it was done: commits, reports, manual sections and runs. As many as there are.',
        example: [{ kind: 'commit', commit: '9c0612d449e6f23d4cf4a9b33310050c64c9ccc3' }],
      },
      { key: 'supersededBy', type: 'string', required: false, description: 'The id of the later message that replaced this request. Only on a superseded item.', example: 'XEFZwmSBw8xQ' },
      { key: 'links', type: 'string[]', required: false, description: 'The ids of any records this item is about: modules, pipelines, decisions or anything else. As many as there are.', example: ['Madeup100004'] },
      {
        key: 'reminder',
        type: 'ChecklistReminder',
        required: false,
        description: 'A reminder to the checklist\'s owner at one time. Absent means off, which is the default. Only the owner switches it on.',
        example: { at: '2026-10-09 04:10:00', switchedOnBy: { kind: 'agent', id: 'secretary-1' } },
      },
      {
        key: 'addedBy',
        type: 'ParticipantRef',
        required: false,
        description: 'Who added the item. The office writes it from the caller. Absent on an item added before 13 October 2026: nobody recorded who.',
        example: { kind: 'agent', id: 'Ag1e2r3t4y5u' },
      },
      {
        key: 'tell',
        type: 'ParticipantRef[]',
        required: false,
        description: 'The agents the office tells when the person marks the item done, in place of whoever added it. Name the adder too to tell it as well. Absent means whoever added it.',
        example: [{ kind: 'agent', id: 'Ag1e2r3t4y5u' }],
      },
      {
        key: 'doneByThePerson',
        type: 'ChecklistDoneByThePerson',
        required: false,
        description: 'Present while the item is done because the person said so: by a press, by words, or under the raise. The item door writes it, and takes it away when the item leaves done.',
        example: { at: '2026-10-13 12:30:00', by: { kind: 'person', id: 'owner' }, told: [{ kind: 'agent', id: 'Ag1e2r3t4y5u' }], notice: 'Ms1e2r3t4y5u' },
        exampleWith: { state: 'done' },
      },
      // From a message, in wave 14a round 1.
      {
        key: 'response',
        type: 'string',
        required: false,
        description:
          "THE OWNER'S OWN WRITTEN WORDS on the item, kept exactly as written. The checklist's own owner alone writes them, with the press that marks the item done and the version that press read; the item door writes them and takes them away when the item leaves done. They are read under the item and carried whole by the notice the agents told receive. They are not evidence.",
        example: 'The door is painted. I used the "kiln red" tin; dry by Friday.',
        exampleWith: { state: 'done', doneByThePerson: { at: '2026-10-13 12:30:00', by: { kind: 'person', id: 'owner' }, told: [{ kind: 'agent', id: 'Ag1e2r3t4y5u' }], notice: 'Ms1e2r3t4y5u' } },
      },
      // A decision governs the `standing` field.
      {
        key: 'standing',
        type: 'boolean',
        required: false,
        description:
          "True for a standing item: an entry the owner opens every session, such as the owner's experiment manual. It has no done box, is never marked done and is never counted as open work, so it is \"open\" until a later message supersedes it. Absent for any other item; never false.",
        example: true,
      },
    ],
  },

  // HOW THE PERSON MARKED AN ITEM DONE, AND WHO WAS TOLD (wave 13j round loop-5).
  ChecklistDoneByThePerson: {
    name: 'ChecklistDoneByThePerson',
    description:
      "AN ITEM THE PERSON MARKED DONE, by the person's own press or a sentence of the person's that names it. No evidence " +
      'is asked of the person. The office tells whoever added the item, or the agents it names to tell, in one message.',
    fields: [
      { key: 'at', type: 'string', required: true, description: "When, on the office computer's clock: YYYY-MM-DD HH:MM:SS.", example: '2026-10-13 12:30:00' },
      {
        key: 'by',
        type: 'ParticipantRef',
        required: true,
        description: "Who made the write: the person, for the person's own press; the agent that read the person's words; or the agent the raise carried.",
        example: { kind: 'person', id: 'owner' },
      },
      { key: 'onThePersonsWords', type: 'string', required: false, description: "The person's message whose sentence was read as naming this item. Absent for a press.", example: 'Pw1e2r3t4y5u' },
      { key: 'underTheRaise', type: 'boolean', required: false, description: "True when the person's raise carried an agent's write. Absent otherwise; never false.", example: true },
      {
        key: 'press',
        type: 'string',
        required: false,
        description:
          "The press under the grant that made the mark, beside underTheRaise. Its reason is kept in the press's row alone, and the checklist's reading gives it in presses. Absent on a mark the person made.",
        example: 'Pr1e2r3t4y5u',
      },
      { key: 'told', type: 'ParticipantRef[]', required: true, description: 'Who the office told, in one message. Empty when nobody was told.', example: [{ kind: 'agent', id: 'Ag1e2r3t4y5u' }] },
      { key: 'notice', type: 'string', required: false, description: "The office's message that told them. Absent when nobody was told.", example: 'Ms1e2r3t4y5u' },
    ],
  },

  ChecklistEvidence: {
    name: 'ChecklistEvidence',
    description:
      'ONE PIECE OF EVIDENCE THAT A CHECKLIST ITEM WAS DONE. A commit names its hash. A report and a run name their ' +
      'record. A manual section names its record and the id of its block in that record.',
    fields: [
      { key: 'kind', type: unionOf(EVIDENCE_KINDS), required: true, description: 'Which of the four it is.', example: 'manual section' },
      { key: 'commit', type: 'string', required: false, description: "A commit's hash, 7 to 40 lowercase hexadecimal characters. The office does not check that it exists.", example: '9c0612d4' },
      { key: 'record', type: 'string', required: false, description: 'The id of the report, the run, or the record that holds the manual section.', example: 'QdOUMDQrsAfI' },
      { key: 'block', type: 'string', required: false, description: "For a manual section, the id of the section's block in that record.", example: 'b-3' },
    ],
  },

  ChecklistReminder: {
    name: 'ChecklistReminder',
    description: "ONE ITEM'S REMINDER, sent once to the checklist's owner and to nobody else.",
    fields: [
      { key: 'at', type: 'string', required: true, description: "When it fires, on the office computer's clock: YYYY-MM-DD HH:MM:SS.", example: '2026-10-09 04:10:00' },
      { key: 'switchedOnBy', type: 'ParticipantRef', required: true, description: 'Who switched it on. The office writes it.', example: { kind: 'agent', id: 'secretary-1' } },
      { key: 'firedAt', type: 'string', required: false, description: 'When it fired. The office writes it. Absent means it has not fired yet.', example: '2026-10-09 04:10:30' },
    ],
  },
}
