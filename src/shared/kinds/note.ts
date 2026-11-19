// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `note`, free writing with a date.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { commonFields, type KindSpec, type ShapeSpec } from './kind-common.ts'

export const noteKind: KindSpec = {
    kind: 'note',
    purpose: 'Free writing with a date. A diary entry is a note.',
    whenToRecord:
      'When something is worth writing down and is none of the other kinds. If you find yourself writing a note that ' +
      'contains a decision, a claim or a problem, file that instead — a note is the one kind nothing queries.',
    humanOnly: false,
    fields: [
      { key: 'date', type: 'date', required: false, description: 'The day the writing is about, which is not always the day it was written.', example: '2026-08-07' },
      { key: 'body', type: 'string', required: false, description: 'The writing itself. Prose, as long as it needs to be.', example: 'Spent the morning on the mast knock. The position error went 0.4 px to 1.9 px, so something really did move.' },
      {
        key: 'for_the_person_to_file',
        type: 'boolean',
        required: false,
        description:
          'WORDS PREPARED FOR THE PERSON TO FILE AS THEIR OWN. A secretary sets it to true on a note whose `body` copies ' +
          'what the person said somewhere the office cannot see, such as a terminal. The note stays the secretary\'s. The ' +
          'person files the words with one press, POST /api/records/<this note>/file-as-my-words, which writes a note of ' +
          'their own with the same `body`; a decision in their name then cites that note. ' +
          'Leaving it out means the note was not prepared for that.',
        example: true,
      },
      {
        key: 'filed_from',
        type: 'string',
        required: false,
        description:
          'THE PREPARED NOTE THESE WORDS WERE FILED FROM, by its id. Written by the press that files a prepared note as ' +
          'the person\'s own words, and by nothing else. It counts only on a note the person wrote.',
        example: 'aB3dE5gH7jK9',
      },
      {
        key: 'not_what_the_person_said',
        type: 'string',
        required: false,
        description:
          'THE PERSON SAID THESE WORDS ARE NOT WHAT THEY SAID: when they pressed "Not what I said" on a note prepared for ' +
          'them to file. Written by POST /api/records/<this note>/not-what-i-said, and by nothing else; only the person may ' +
          'write, change or remove it. The note is kept as it is. A note carrying it is no longer waiting for the person, ' +
          'and its words cannot be filed as theirs.',
        example: '2026-10-10 14:05:00',
      },
      {
        key: 'filed_under_the_grant',
        type: 'FiledUnderTheGrant',
        required: false,
        description:
          'A SECRETARY FILED A PREPARED NOTE UNDER THE PERSON\'S GRANT, and this note is what it wrote. It names the ' +
          'prepared note, the secretary, the grant and the press. The note is the secretary\'s, and it is never the ' +
          'person\'s own words: a decision in the person\'s name cannot cite it as theirs. The prepared note no longer ' +
          'waits for the person, and nobody may file it again. Written by POST /api/records/<the prepared note>/file-as-my-words ' +
          'and POST /api/the-persons-words/confirm-all under the grant, and by nothing else; nobody may change or remove it.',
        example: { from: 'aB3dE5gH7jK9', by: { kind: 'agent', id: 'Ag1e2r3t4y5u' }, grant: 'Gr1e2r3t4y5u', press: 'Pr1e2r3t4y5u' },
      },
      {
        key: 'not_what_they_said_under_the_grant',
        type: 'NotWhatTheySaidUnderTheGrant',
        required: false,
        description:
          'A SECRETARY SAID UNDER THE PERSON\'S GRANT THAT A PREPARED NOTE IS NOT WHAT THE PERSON SAID: when, and which ' +
          'secretary, grant and press. It is the secretary\'s mark and not the person\'s, so `not_what_the_person_said` ' +
          'stays absent. The note is kept as it is, it no longer waits for the person, and its words cannot be filed. ' +
          'Written by POST /api/records/<this note>/not-what-i-said under the grant, and by nothing else; nobody may ' +
          'change or remove it.',
        example: { at: '2026-10-21 14:05:00', by: { kind: 'agent', id: 'Ag1e2r3t4y5u' }, grant: 'Gr1e2r3t4y5u', press: 'Pr1e2r3t4y5u' },
        exampleWith: { for_the_person_to_file: true },
      },
      {
        key: 'typed_in_terminal',
        type: 'string',
        required: false,
        description:
          'WORDS THE PERSON TYPED INTO THE OFFICE\'S OWN TERMINAL: the terminal they were typed in, as its command and folder. ' +
          'Written by POST /api/terminals/<id>/keep-my-line, where `body` holds the one line the person pressed to keep, and by ' +
          'the office as it keeps every line typed into a terminal whose keeping is on, where `body` holds one line per line ' +
          '(see kept_from_terminal); by nothing else. It counts only on a note the person wrote, which is the person\'s own ' +
          'words.',
        example: 'claude --session-id 4f0c… in /srv/mole-office-fixtures/demo-project',
      },
      {
        key: 'kept_from_terminal',
        type: 'string',
        required: false,
        description:
          'THE TERMINAL WHOSE TYPING THIS NOTE KEEPS, by the holder\'s id for it, with no press. ' +
          'While that terminal\'s keeping is on, the office adds each ' +
          'line the person ends with Enter to `body`, written as the person, because the person\'s typing passed the person-only ' +
          'door. A line the screen did not show, one edited with an arrow key and one longer than 2,000 characters is never ' +
          'stored; the left_out fields count them. A line that looks like a key is kept, and the terminal view warns about ' +
          // This paragraph rests on two decisions.
          'it without blocking anything, because the terminal keeps what the person typed, even what looks like a key; a ' +
          'password typed where the screen showed nothing is still never kept. The person deletes a line by editing `body`, or the whole note; once ' +
          'the note is deleted, the next line starts a new one. A terminal opened again after the holder restarts is a new ' +
          'terminal, with a new note.',
        example: 'k3Jd9QpL2xYz',
      },
      {
        key: 'typed_to_agent',
        type: 'string',
        required: false,
        description:
          'THE AGENT THE KEPT LINES WERE TYPED TO, by its id, when the terminal was an agent\'s: the lines are the person\'s ' +
          'words to that agent, as chat is. Written with kept_from_terminal, and by nothing else.',
        example: 'HInmFKzk_efB',
      },
      {
        key: 'left_out_secret',
        type: 'number',
        required: false,
        description:
          'HOW MANY LINES TYPED INTO THE TERMINAL WERE LEFT OUT BECAUSE THEY LOOKED LIKE A KEY, until 7 October 2026. Since ' +
          // This paragraph follows a decision.
          'then such a line is kept, because a password is typed where the screen shows nothing and is left out for that, ' +
          'while a key typed on purpose is warned about and then kept. So nothing writes this field; a note written ' +
          'before then may still hold it, and the note shows it. The lines themselves were never stored.',
        example: 1,
      },
      {
        key: 'left_out_not_shown',
        type: 'number',
        required: false,
        description: 'HOW MANY LINES TYPED INTO THE TERMINAL WERE LEFT OUT BECAUSE THE SCREEN DID NOT SHOW THEM, as at a password prompt. The lines themselves are never stored.',
        example: 1,
      },
      {
        key: 'left_out_edited',
        type: 'number',
        required: false,
        description:
          'HOW MANY LINES TYPED INTO THE TERMINAL WERE LEFT OUT BECAUSE AN ARROW OR ANOTHER CONTROL KEY EDITED THEM, so the line ' +
          'on the screen can differ from the keys sent. The lines themselves are never stored.',
        example: 0,
      },
      {
        key: 'left_out_too_long',
        type: 'number',
        required: false,
        description:
          'HOW MANY LINES TYPED INTO THE TERMINAL WERE LEFT OUT BECAUSE THEY WERE LONGER THAN 2,000 CHARACTERS ' +
          '(THE_LONGEST_LINE_KEPT in src/shared/terminals.ts). The lines themselves are never stored.',
        example: 0,
      },
      {
        key: 'left_out_typed_by_another',
        type: 'number',
        required: false,
        description:
          'HOW MANY LINES IN THE TERMINAL WERE LEFT OUT BECAUSE SOMEBODY OTHER THAN THE PERSON TYPED THEM, in whole or in part ' +
          '(typeALine in src/holder/index.mjs). The lines themselves are never stored.',
        example: 0,
      },
      ...commonFields('note'),
    ],
    example: { date: '2026-08-07', body: 'Spent the morning on the mast knock. The position error went 0.4 px to 1.9 px, so something really did move.' },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const NOTE_SHAPES: Record<string, ShapeSpec> = {
  // WHAT A SECRETARY'S PRESS UNDER THE PERSON'S GRANT LEAVES ON A NOTE OF THE PERSON'S WORDS (wave 13s round 68). The
  // office writes both from the press, and `whoPressedItUnderTheGrant` in src/server/lib/the-persons-own-words.ts works
  // out the secretary, the grant and the press.
  FiledUnderTheGrant: {
    name: 'FiledUnderTheGrant',
    description:
      "A PREPARED NOTE A SECRETARY FILED UNDER THE PERSON'S GRANT. The note holding it is the secretary's, and never the person's own words.",
    fields: [
      { key: 'from', type: 'string', required: true, description: 'The prepared note these words were copied from, by its id.', example: 'aB3dE5gH7jK9' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'The secretary that pressed, as its registry id.', example: { kind: 'agent', id: 'Ag1e2r3t4y5u' } },
      { key: 'grant', type: 'string', required: true, description: "The person's grant the press went under, by its id.", example: 'Gr1e2r3t4y5u' },
      { key: 'press', type: 'string', required: true, description: "The press, by its id. Its row keeps its reason.", example: 'Pr1e2r3t4y5u' },
    ],
  },
  NotWhatTheySaidUnderTheGrant: {
    name: 'NotWhatTheySaidUnderTheGrant',
    description:
      "A SECRETARY'S MARK, UNDER THE PERSON'S GRANT, THAT A PREPARED NOTE IS NOT WHAT THE PERSON SAID. It is never the person's own mark.",
    fields: [
      { key: 'at', type: 'string', required: true, description: "When, on the office computer's clock: YYYY-MM-DD HH:MM:SS.", example: '2026-10-21 14:05:00' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'The secretary that pressed, as its registry id.', example: { kind: 'agent', id: 'Ag1e2r3t4y5u' } },
      { key: 'grant', type: 'string', required: true, description: "The person's grant the press went under, by its id.", example: 'Gr1e2r3t4y5u' },
      { key: 'press', type: 'string', required: true, description: "The press, by its id. Its row keeps its reason.", example: 'Pr1e2r3t4y5u' },
    ],
  },

}
