// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `report`, something written for a person to read.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, REPORT_READ_ANSWERS and ReportReadAnswer from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `ANSWERS_FIELD`, `THE_PROSE_CAP_SENTENCE` AND `ASK_FIRST_SENTENCE` FROM
 * THEIR DECLARING FILES. `REPORT_READ_ANSWERS` AND `ReportReadAnswer` MOVED HERE WITH THE KIND,
 * because its `read` field is `unionOf(REPORT_READ_ANSWERS)` and a file that imported them from
 * kinds.ts would make the central file and this one load each other.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { ANSWERS_FIELD } from '../answers.ts'
import { THE_PROSE_CAP_SENTENCE } from '../prose-cap.ts'
import { ASK_FIRST_SENTENCE } from '../ask-first.ts'

/**
 * Whether the person a report is for has read it. TWO WORDS, AND THE THIRD ANSWER IS NO WORD.
 *
 * `read` and `unread` are both things somebody has said. Leaving the field out is the third answer
 * — nobody has said — and it is the common one. A reader must not print an absent field as
 * `unread`: one is a gap in the record and the other is a statement about the person.
 *
 * THESE ARE NOT STATE WORDS AND THEY ARE DELIBERATELY NOT IN `STATE_MEANING`. That table says
 * whether WORK stopped short, and a report is not work — the field is not called `state`, no
 * surface asks `progressOf` about it, and a report can never reach the attention list. The words
 * are `read` and `unread` rather than anything invented because those are what the message board
 * already prints for the same fact, and one fact should read the same way twice.
 */
export const REPORT_READ_ANSWERS = ['read', 'unread'] as const
export type ReportReadAnswer = (typeof REPORT_READ_ANSWERS)[number]

export const reportKind: KindSpec = {
    kind: 'report',
    purpose:
      'Something written for a person to read: a review, a report, a write-up. It carries its own prose, charts, ' +
      'equations, tables and pictures, so it is read inside Mole Office rather than as a file somewhere else.',
    whenToRecord:
      'When you write something up for somebody rather than recording one fact — a review of a piece of work, a ' +
      'report on what a run showed, the write-up somebody asked you for. Not a note: a note is free writing that ' +
      'nothing queries, and a report is addressed to somebody and is about something. Not a module\'s summary ' +
      'either: that says where a subsystem stands now and is rewritten as the subsystem changes, while a report is ' +
      'about a day and stays as it was written.',
    humanOnly: false,
    fields: [
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description:
          'The report itself: prose, charts, equations, tables and pictures, in the order they should be read. These ' +
          'are the SAME blocks a module\'s curated summary is made of — see the SummaryBlock shape for what each type ' +
          'needs — so a chart here is drawn by what draws a chart there. ON A MODULE THE FIELD IS CALLED ' +
          '`summaryBlocks` AND HERE IT IS `blocks`, because on a report this is not a summary of anything: it is the ' +
          'report. Send `summaryBlocks` here and the write is refused with a 400 naming this key, and nothing is ' +
          'stored. Needed before the report is complete: a report with no blocks is a title with nothing under it. ' +
          THE_PROSE_CAP_SENTENCE +
          ' ' +
          ASK_FIRST_SENTENCE,
        example: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration through a full transplant. What moved was the mast.' },
          {
            id: 'b-2',
            type: 'chart',
            spec: {
              kind: 'line',
              x: { label: 'trial' },
              y: { label: 'position error', unit: 'px' },
              series: [{ id: 's1', name: 'second camera', points: [{ x: 1, y: 0.4 }, { x: 2, y: 1.9 }] }],
            },
            caption: 'Two runs, before and after the mast was knocked.',
          },
        ],
      },
      {
        key: 'for',
        type: 'string',
        required: true,
        description:
          'Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report ' +
          'is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. ' +
          'Write who reads it, not what you want them to do about it.',
        example: 'The person who asked for the review',
      },
      {
        key: 'date',
        type: 'date',
        required: true,
        description:
          'The day the report is ABOUT, which is not always the day it was written: a review written on Friday about ' +
          'Wednesday\'s run carries Wednesday. Needed before the report is complete, because a report is a statement ' +
          'about a day — one with no day reads as a statement about now, and stops being true the moment the work ' +
          'moves on. Nothing infers it from the record\'s own stamps: those say when it was filed and last edited.',
        example: '2026-08-14',
      },
      {
        key: 'read',
        type: unionOf(REPORT_READ_ANSWERS),
        required: false,
        description:
          'Whether the person it is for has read it: "read" once they have, "unread" while they have not. LEAVE IT ' +
          'OUT when nobody has said — that is the third answer and it is the honest one until somebody looks. Absent ' +
          'is NOT "unread": one is a gap in the record and the other is somebody saying the reader has not got to it ' +
          'yet. It is not a state word and says nothing about work: a report is not work and never reaches the list ' +
          'of things that need somebody today.',
        example: 'unread',
      },
      {
        key: 'chaptersRead',
        type: 'number[]',
        required: false,
        description:
          'WHICH CHAPTERS OF THE OFFICE REGULATIONS THIS RUN READ, by number. An agent that starts another may tell it ' +
          'at the start which parts of the regulations to learn. A starter names the chapters when it ' +
          'registers the agent; the agent says here which of them it actually read, and GET /api/checks/<run> ' +
          'sets the two lists against each other. ABSENT IS NOT "IT READ NONE": it is a report nobody can check ' +
          'against the brief, and the reading says exactly that. Saying it read one it did not is the same lie ' +
          'as any other false report, and nothing here prevents it.',
        example: [1, 4, 5, 9],
      },
      {
        key: ANSWERS_FIELD,
        type: 'Record<string, AnswersOfABlock>',
        required: false,
        description:
          'THE PERSON\'S ANSWERS TO THE QUESTIONS IN THIS REPORT, one entry for each choice, fill-in box or button, under ' +
          'its block id. WRITTEN ONLY BY THE ANSWER DOOR, as the person answers and sends: a write that sets or changes ' +
          'it by hand is refused, and a whole `data` write must carry it unchanged. Read it to learn what was answered: ' +
          '`sent` is the answer last sent, with who sent it, when, to which agent, in which message, and the decision a ' +
          'choice was recorded as; `draft` is an answer kept and not sent yet. An earlier answer that was replaced stays ' +
          'in the report\'s history.',
        example: {
          'q-licence': {
            sent: { answer: { chosen: ['a'], words: 'Keep it short' }, by: 'the-person', at: '2026-10-02 19:30:00', to: 'agent-id', message: 'Xq3vB7yT2kLm', decision: 'Yr4wC8zU3mNn' },
          },
        },
      },
      ...commonFields('report'),
    ],
    rules: [
      'a report may ASK THE PERSON: a `choice`, a `fillin` box and a `button` are blocks like any other, and a `box` ' +
        'groups questions under one title. The person answers in the report and presses ONE submit for the whole ' +
        'report, which sends ONE message to each agent named, with a lead back to the report, and records each choice ' +
        'as the person\'s decision. A button is still sent by its own press. ' +
        'Only the person may answer. The SummaryBlock shapes say how to write each one, and ' +
        'docs/questions-in-reports.md has a whole report as an example.',
      'what a report is ABOUT is an `about` link and never a field: POST /api/links ' +
        '{"fromId":"<this report>","toId":"<the record it is about>","type":"about"}, after which the module or ' +
        'block it reviews reads back as "subject of" it. There is no `about` field and there must not be one — the ' +
        'link is what every reader of "what is this about" already reads, and a second stored copy would be free to ' +
        'disagree with it.',
      'a report never rewrites the record it is about. A module\'s `summary` and `summaryBlocks` say where that ' +
        'subsystem stands now; a report is dated and stays as written. Filing one leaves the module alone, and the ' +
        'two are read together through the link above.',
      'filing a report is its TITLE, its SUMMARY and its BLOCKS. The title is level 2 of the reading ladder and ' +
        'the summary is level 3, so aim at a title of at most 15 words and a summary of 20 to 60 words — those ' +
        'are targets and nothing is refused for its length. Then write its LABEL and its BY-PART STRUCTURE with ' +
        'POST /api/records/<id>/short-forms, which is levels 1 and 4 to 6; each names the revision of this ' +
        'report it was written from, so it can only be written once the record is filed, and the reply says ' +
        'which lengths are still unwritten. A reader chooses how much the report says, from the whole thing ' +
        'down to a few words. A LENGTH NOBODY WROTE IS NOT FILLED IN BY ANOTHER: the report body says, in the ' +
        'place that length would have been, that this level has not been written for this report, and draws ' +
        'nothing under it. A report with no summary has no level 3 and says so. Leaving any of them out does ' +
        'NOT make the report incomplete, and it never will: whether a summary of a given length exists and ' +
        'whether the record is complete are two different questions with two different answers.',
    ],
    example: {
      for: 'The person who asked for the review',
      date: '2026-08-14',
      read: 'unread',
      blocks: [
        {
          id: 'b-1',
          type: 'text',
          heading: 'What I found',
          text: 'The mount holds calibration through a full transplant. What moved was the mast, and the knock is in the log.',
        },
        {
          id: 'b-2',
          type: 'table',
          columns: [{ label: 'run' }, { label: 'position error (px)', align: 'right' }],
          rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9], state: 'failed' }],
          caption: 'Forty test frames each.',
        },
      ],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const REPORT_SHAPES: Record<string, ShapeSpec> = {
  AnswersOfABlock: {
    name: 'AnswersOfABlock',
    description: 'WHAT IS KEPT FOR ONE QUESTION OF A REPORT: the answer kept and not sent yet, and the answer last sent.',
    fields: [
      { key: 'draft', type: 'AnswerDraft', required: false, description: 'The answer kept and not sent yet. Gone once it is sent.', example: { answer: { chosen: ['b'] }, at: '2026-10-02 19:20:00' } },
      {
        key: 'sent',
        type: 'AnswerSent',
        required: false,
        description: 'The answer last sent. A later send of a changed answer replaces it here, and the report\'s history keeps the earlier one.',
        example: { answer: { chosen: ['a'] }, by: 'the-person', at: '2026-10-02 19:30:00', to: 'agent-id', message: 'Xq3vB7yT2kLm' },
      },
    ],
  },

  AnswerDraft: {
    name: 'AnswerDraft',
    description: 'An answer kept and not sent yet, with who chose it when recorded.',
    fields: [
      { key: 'answer', type: 'AnAnswer', required: true, description: 'What was answered.', example: { chosen: ['b'] } },
      { key: 'chosenBy', type: 'ParticipantRef', required: false, description: 'Who kept the answer: the person, or the secretary by registry id. Absent on older drafts means nobody recorded who chose it.', example: { kind: 'agent', id: 'secretary-id' } },
      { key: 'at', type: 'date', required: true, description: 'When it was last changed, local time.', example: '2026-10-02 19:20:00' },
    ],
  },

  AnswerSent: {
    name: 'AnswerSent',
    description: 'The answer last sent for one question, and what carried it.',
    fields: [
      { key: 'answer', type: 'AnAnswer', required: true, description: 'What was sent.', example: { chosen: ['a'], words: 'Keep it short' } },
      { key: 'by', type: 'string', required: true, description: 'Who sent it: the person\'s id, or the secretary\'s registry id when underTheGrant is present. Older answers keep their original by.', example: 'the-person' },
      { key: 'underTheGrant', type: 'string', required: false, description: 'The grant under which the secretary sent it. When present, by names an agent by registry id. Absent for the person\'s send and older answers.', example: 'grant-id' },
      { key: 'chosenBy', type: 'ParticipantRef', required: false, description: 'Who chose it, copied from the draft; for a button, who sent it. Absent means nobody recorded who chose it, never an inferred person.', example: { kind: 'person', id: 'the-person' } },
      { key: 'at', type: 'date', required: true, description: 'When it was sent, local time.', example: '2026-10-02 19:30:00' },
      { key: 'to', type: 'string', required: true, description: 'The agent it was sent to, by registry id.', example: 'agent-id' },
      { key: 'message', type: 'string', required: true, description: 'The message that carried it.', example: 'Xq3vB7yT2kLm' },
      { key: 'decision', type: 'string', required: false, description: 'The decision a choice\'s answer was recorded as. Absent for a fill-in box and a button.', example: 'Yr4wC8zU3mNn' },
    ],
  },

  AnAnswer: {
    name: 'AnAnswer',
    description: 'What was answered: the options chosen and any words with them for a choice, the words for a fill-in box, the press for a button. The answer carrying it says who chose it, when that was recorded.',
    fields: [
      { key: 'chosen', type: 'string[]', required: false, description: 'The ids of the options chosen.', example: ['a'] },
      { key: 'words', type: 'string', required: false, description: 'The words written with a choice, or in a fill-in box.', example: 'Keep it short' },
      { key: 'pressed', type: 'boolean', required: false, description: 'True once a button was pressed.', example: true },
    ],
  },

}
