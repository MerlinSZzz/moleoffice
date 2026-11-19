// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `draft`, writing not sent yet.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts,
 * AND ITS DRAFT CONSTANTS FROM ../drafts.ts AND ../turn-drafts.ts. IT IMPORTS NOTHING FROM
 * ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, unionOf, type KindSpec } from './kind-common.ts'
// A DRAFT'S WORDS AND WHAT IT MAY BECOME, from the one place they are declared.
import { DEFAULT_REMIND_AFTER_MINUTES, DRAFT_BECOMES, SENT_AS, SENT_AT } from '../drafts.ts'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES, TURN } from '../turn-drafts.ts'

export const draftKind: KindSpec = {
    kind: 'draft',
    purpose:
      'Writing you are not ready to send yet: a message, a report or a note you keep in Mole Office while you work ' +
      'on it. One press sends it, and the draft is kept afterwards, linked to what it became. Any caller in this ' +
      'project can read a draft: no rule limits who may read one. GET /api/drafts lists your own drafts; another agent\'s draft is reached only by its id or ' +
      'a general list of records.',
    whenToRecord:
      'When you are writing something you mean to send later and want to keep it safe, look at it again and change ' +
      'it while you work. Not for the person\'s unsent chat text, which stays in the browser. Send it with ' +
      'POST /api/drafts/<id>/send; nothing sends it by itself.',
    humanOnly: false,
    fields: [
      {
        key: 'body',
        type: 'string',
        required: true,
        description:
          'The words themselves. When the draft is sent they become the message\'s body, the note\'s body, or one ' +
          'text block of the report. Needed before the draft is complete.',
        example: 'The mount held its calibration through the transplant. What moved was the mast.',
      },
      {
        key: 'for',
        type: 'ParticipantRef[]',
        required: true,
        description:
          'WHO IT IS FOR, one entry per person or agent, in the shape a message\'s `to` takes. A message made from ' +
          'this draft is addressed to exactly these, and a draft that becomes a message cannot be sent while this ' +
          'is empty. A report made from it names them in its own `for`. A note has nobody it is for, so a note ' +
          'made from it does not carry this. Needed before the draft is complete.',
        example: [{ kind: 'person', id: 'owner' }],
      },
      {
        key: 'becomes',
        type: unionOf(DRAFT_BECOMES),
        required: true,
        description:
          'WHAT IT BECOMES WHEN IT IS SENT: "message", "report" or "note". Needed before the draft is complete, ' +
          'because the send door has to know which record to make.',
        example: 'message',
      },
      {
        key: 'remindAfterMinutes',
        type: 'number',
        required: false,
        description:
          'HOW LONG AFTER THE LAST CHANGE MOLE OFFICE REMINDS YOU that the draft is not sent, in whole minutes, at ' +
          `least 1. Leave it out for ${String(DEFAULT_REMIND_AFTER_MINUTES)} minutes. Set a longer time for a long ` +
          'draft you expect to work on for a while. The reminder goes to you, or to whoever started you once your ' +
          'run has ended. When Mole Office can name neither, it goes to the person and says why. It is said once ' +
          'for each version of the draft, and it never sends the draft.',
        example: 120,
      },
      {
        key: SENT_AS,
        type: 'string',
        required: false,
        description:
          'THE RECORD THIS DRAFT BECAME, written by the send door and by nothing else. A write that sets it by hand ' +
          'is refused. Once it is set, the draft cannot be changed, deleted or moved.',
        example: 'Xq3vB7yT2kLm',
      },
      {
        key: SENT_AT,
        type: 'date',
        required: false,
        description: 'WHEN THE DRAFT WAS SENT, local time, written by the send door and by nothing else.',
        example: '2026-09-25 21:10:00',
      },
      {
        key: TURN,
        type: 'Record<string, unknown>',
        required: false,
        description:
          'WHAT MAKES THIS A TURN DRAFT, written by Mole Office and by nothing else. A message an agent\'s run writes is ' +
          'held in a turn draft for its readers, and Mole Office sends it: at the end of the turn, first when the run ' +
          'reads its inbox or finishes, and to a person, or to a group with a person among its members, within ' +
          `${String(A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES)} minutes. ` +
          'It holds the run, the agent, the readers and the message\'s other fields. A write that sets it, or changes a ' +
          'turn draft, is refused.',
        example: { run: 'Xq3vB7yT2kLm', readers: 'person:owner', writes: 2 },
      },
      ...commonFields('draft'),
    ],
    rules: [
      'sending is POST /api/drafts/<id>/send, and only the draft\'s writer may send it. It files the new record ' +
        'through the same door POST /api/records uses, so a message made from a draft is checked, addressed and ' +
        'delivered exactly as any message is. In the same write it links the new record to the draft with ' +
        // derived_from in its general sense: the record a draft becomes was made from that draft.
        '`derived_from` and writes `sentAs` and `sentAt` on the draft.',
      'a draft that has been sent stays as it was sent. Changing it, deleting it, moving it or changing its kind is ' +
        'refused. Its short forms may still be written.',
      'GET /api/drafts lists your own drafts, the ones not sent first, each with when it was last changed and when ' +
        'its reminder is due. The person sees every draft in the project.',
      `a turn draft (data.${TURN}) is the one draft Mole Office sends by itself, and Mole Office alone writes it. A ` +
        'draft you write yourself is never sent by Mole Office.',
    ],
    example: {
      body: 'The mount held its calibration through the transplant. What moved was the mast.',
      for: [{ kind: 'person', id: 'owner' }],
      becomes: 'message',
    },
}
