// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `design_reminder`, a reminder about one design's open choice.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM ./kind-common.ts,
 * AND `DESIGN_REMINDER_ANSWERS`, `DESIGN_REMINDER_VERDICTS`, `DESIGN_REMINDER_WAS` AND
 * `METHOD_WORKS` FROM ../design-reminders.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { DESIGN_REMINDER_ANSWERS, DESIGN_REMINDER_VERDICTS, DESIGN_REMINDER_WAS, METHOD_WORKS } from '../design-reminders.ts'
export const designReminderKind: KindSpec = {
    kind: 'design_reminder',
    purpose:
      'ONE REMINDER OF A MISSING REVIEWED DESIGN, OR ONE MISS: a run marked as method work was reminded before its seal ' +
      'of what its designs lack, or it sealed with no such reminder and a judge filed that it should have had one. It ' +
      'holds the run, the mark, what was named, and the one judgement. The week\'s count reads these records.',
    whenToRecord:
      'Never through POST /api/records: every write to this kind is refused there, the person\'s included. The office ' +
      'keeps a reminder before a seal. Judge one with POST /api/design-reminders/<id>/judgement, and file a miss with ' +
      'POST /api/runs/<run>/missed-design-reminder.',
    humanOnly: false,
    fields: [
      { key: 'run', type: 'string', required: true, description: 'THE RUN REMINDED, or the run a miss is about, by id.', example: 'Ru1n2i3d4x5y' },
      { key: 'work', type: unionOf(METHOD_WORKS), required: true, description: "WHAT THE RUN'S MARK SAID IT WAS: method work, or the go for a pilot.", example: 'method-work' },
      { key: 'markedBy', type: 'ParticipantRef', required: true, description: 'WHO MARKED THE RUN. The person, and the secretary this marker answers to, judge the reminder.', example: { kind: 'agent', id: 'Ag1e2n3t4i5d' } },
      { key: 'was', type: unionOf(DESIGN_REMINDER_WAS), required: true, description: 'WHETHER THE OFFICE REMINDED THE RUN, or a judge filed a miss after its seal.', example: 'reminded' },
      { key: 'named', type: 'DesignReminderNamed[]', required: true, description: 'WHAT THE REMINDER NAMED, one entry each. Empty on a miss.', example: [{ design: null, answer: 'no-design', rule: null, source: null, says: 'Run Ru1n2i3d4x5y links no design.' }] },
      { key: 'reminderLine', type: 'string | null', required: false, description: "THE OFFICE'S LINE THAT CARRIED THE REMINDER, by record id. Null on a miss.", example: 'M7lCouCY0Q8Y' },
      { key: 'afterSeal', type: 'string | null', required: false, description: "THE RUN'S SEAL BEFORE THIS REMINDER, or null because the run had not sealed. Null on a miss.", example: null },
      { key: 'missWords', type: 'string | null', required: false, description: "THE JUDGE'S WORDS ON A MISS. Null on a reminder.", example: null },
      { key: 'judgement', type: 'DesignReminderJudgement | null', required: false, description: 'THE ONE JUDGEMENT, or null because nobody judged it. A reminder nobody judged is counted as not judged; a miss is not judged.', example: null },
    ],
    rules: [
      'Only its own doors write a design reminder. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      'A reminder is judged once. A miss is filed once for a sealed run that has no reminder.',
    ],
    example: {
      run: 'a-made-up-run',
      work: 'method-work',
      markedBy: { kind: 'agent', id: 'Ag1e2n3t4i5d' },
      was: 'reminded',
      named: [{ design: null, answer: 'no-design', rule: null, source: null, designRevision: null, chapterRevision: null, review: null, says: 'Run a-made-up-run links no design.' }],
      reminderLine: 'M7lCouCY0Q8Y',
      afterSeal: null,
      missWords: null,
      judgement: null,
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const DESIGN_REMINDER_SHAPES: Record<string, ShapeSpec> = {
  DesignReminderNamed: {
    name: 'DesignReminderNamed',
    description:
      'ONE LACK A DESIGN REMINDER NAMED: the design and the revisions the check read, the answer, the project rule and ' +
      'its source where a rule answered, and the review that counted. A reminder kept before these revisions were ' +
      'declared has no such fields, and that is not a fault.',
    fields: [
      { key: 'design', type: 'string | null', required: true, description: 'The design it is about, or null because the run links no design.', example: 'De1s2i3g4n5x' },
      { key: 'answer', type: unionOf(DESIGN_REMINDER_ANSWERS), required: true, description: 'What the check answered. "no-design" is a run that links no design.', example: 'missing' },
      { key: 'rule', type: 'string | null', required: true, description: "The project's own rule that answered, or null for the review check every marked run is asked.", example: 'grasp-trials' },
      { key: 'source', type: 'string | null', required: true, description: 'The record the rule comes from, or null.', example: 'Dc1e2c3i4s5n' },
      { key: 'designRevision', type: 'number | null', required: false, description: "THE DESIGN'S REVISION THE CHECK READ, so a later revision can be told from the one the reminder was given about. Null or absent for a run that links no design, and absent on reminders kept before this field was declared.", example: 4 },
      { key: 'chapterRevision', type: 'number | null', required: false, description: "THE PROJECT CHAPTER'S REVISION THE CHECK READ. Null because the project keeps no chapter or it could not be read; absent on reminders kept before this field was declared.", example: 3 },
      { key: 'review', type: 'string | null', required: false, description: 'THE REVIEW RECORD THAT COUNTED FOR THE DESIGN, by id, or null because none counted. Absent on reminders kept before this field was declared.', example: 'a-review-one' },
      { key: 'says', type: 'string', required: true, description: 'The lack in an English sentence, for an agent.', example: 'Design De1s2i3g4n5x: it names no evidence account "grasp_trials".' },
    ],
  },

  DesignReminderJudgement: {
    name: 'DesignReminderJudgement',
    description: 'ONE JUDGEMENT OF ONE DESIGN REMINDER, written once by the person or by the secretary the marker answers to.',
    fields: [
      { key: 'verdict', type: unionOf(DESIGN_REMINDER_VERDICTS), required: true, description: 'Right, wrong because the run was not method work, or wrong because what it named was there.', example: 'right' },
      { key: 'words', type: 'string | null', required: true, description: 'What the judge said, or null because the judge said nothing more.', example: null },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who judged it, written by the office from the key.', example: { kind: 'person', id: 'owner' } },
      { key: 'at', type: 'date', required: true, description: 'When it was judged. Local wall clock.', example: '2026-11-09 09:10:00' },
    ],
  },

}
