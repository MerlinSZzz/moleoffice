// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `obligation`, something owed to somebody else by a date.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, OBLIGATION_STATES and ObligationState from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `effortField`, `unionOf` AND THE `KindSpec`
 * TYPE FROM ./kind-common.ts, AND `OBLIGATION_REPEATS` FROM ../obligations.ts. `OBLIGATION_STATES`
 * AND `ObligationState` moved here with the kind, because its `state` field is
 * `unionOf(OBLIGATION_STATES)` and a file that imported them from kinds.ts would make the central
 * file and this one load each other.
 */
import { attentionFields, commonFields, effortField, unionOf, type KindSpec } from './kind-common.ts'
import { OBLIGATION_REPEATS } from '../obligations.ts'

/**
 * Where an obligation stands.
 *
 * These three words and no others, because `readFulfilment` in shared/work.ts is what reads them
 * and it treats `fulfilled` and `cancelled` as discharged and `open` as still owed. A fourth word
 * added here without being added there would come back from `progressOf` as `unclassified`, which
 * is a question put in front of a person rather than a verdict — honest, but not what anybody
 * wants for a word this file invented. tests/kinds.test.ts pins the two together.
 *
 * `cancelled` is not the same as `fulfilled` and both are kept: an obligation that stopped being
 * owed was not met, and the record has to be able to say which of the two happened.
 */
export const OBLIGATION_STATES = ['open', 'fulfilled', 'cancelled'] as const
export type ObligationState = (typeof OBLIGATION_STATES)[number]

export const obligationKind: KindSpec = {
    kind: 'obligation',
    purpose: 'Something owed to somebody else by a date.',
    whenToRecord:
      'When a person or a body outside your own plan is waiting on something from you. If nobody is waiting, it is a ' +
      'task, not an obligation — the difference is who is disappointed when it slips.',
    humanOnly: false,
    fields: [
      {
        key: 'due',
        type: 'date | PauseUntil',
        required: true,
        description:
          'When it is owed. Either a date — "2026-08-14" or "2026-08-14 17:00", and a bare date means the END of ' +
          'that day — or the same object a pause takes for what ends it: {"condition":"the reprint is on the ' +
          'bench"} for a trigger in words, or {"recordId":"rec_…"} for the record whose finishing makes this due. ' +
          'IT IS THE SHAPE `Pause.until` ALREADY USES, deliberately: "what has to happen before this matters ' +
          'again" is one idea and Mole Office has one shape for it. WHAT THE THREE MEAN FOR LATENESS, which is the ' +
          'whole reason to pick carefully: only a DATE can make this overdue. An obligation due on a condition or ' +
          'on another record is WAITING — nobody is late, and Mole Office will not turn your condition into a date so ' +
          'that it can be ranked. When the condition does become true, send the date it is then owed by. Needed ' +
          'before the obligation is complete: one with nothing here can never come due, so until you set it this ' +
          'record will never appear on the alarm panel.',
        example: '2026-08-14',
      },
      { key: 'owedTo', type: 'string', required: false, description: 'Who is waiting. An obligation with nobody at the other end is a task.', example: 'the trial review' },
      { key: 'why', type: 'string', required: false, description: 'What happens if it is late. This is what makes it worth putting first.', example: 'milestone 2 payment is gated on it' },
      { key: 'what_proves_it_done', type: 'string', required: false, description: 'The check that settles it, so "done" is not a matter of opinion.', example: 'The two pages are in the shared drive and the reviewer has acknowledged them.' },
      { key: 'blocked_by', type: 'string', required: false, description: 'What is stopping it, as a record title or as prose.', example: 'the setting 15 print cracked before the force table was finished' },
      {
        key: 'state',
        type: unionOf(OBLIGATION_STATES),
        required: false,
        description:
          'Where it stands. open = still owed. fulfilled = it was delivered. cancelled = it stopped being owed, ' +
          'which is not the same as being met and is worth saying out loud. Leaving it out means nobody has ' +
          'said, which is different from "open". Either of the last two discharges the obligation exactly as ' +
          '`done: true` does, so if you send both they have to agree — see the rules below.',
        example: 'fulfilled',
      },
      {
        key: 'done',
        type: 'boolean',
        required: false,
        description:
          'True once it is discharged. It stays in the record — an obligation that vanished when it was met leaves no ' +
          'proof it ever was. WHAT WRITES IT: whoever discharged it, by hand, with ' +
          'PATCH /api/records/<id> {"dataPatch":{"done":true,"fulfilledAt":"2026-08-12 16:40"}} from an agent or from ' +
          'the browser. Nothing sets it for you and nothing infers it, so an obligation with neither `done` nor a ' +
          '`state` goes on being owed forever. That is not hypothetical: this field was declared and read from the ' +
          'start and NOTHING EVER WROTE IT, so every obligation in the database looked permanent and an analysis ' +
          'concluded there was no way to record that a promise had been kept.',
        example: true,
      },
      {
        key: 'fulfilledAt',
        type: 'date',
        required: false,
        description:
          'When it was discharged, as "2026-08-12" or "2026-08-12 16:40". Send it with `done` or with a `state` that ' +
          'says the same; on its own it is refused, because a discharge date on an obligation nothing marks as ' +
          'discharged reads as still owed everywhere it appears. A boolean cannot say WHEN a promise was kept, and ' +
          'when it was kept is the part somebody asks about a year later.',
        example: '2026-08-12 16:40',
      },
      {
        key: 'fulfilledNote',
        type: 'string',
        required: false,
        description:
          'What settled it, in one line — the thing that would satisfy whoever was waiting. Send it with `done` or ' +
          'with a `state` that says the same, for the same reason as `fulfilledAt`. This is the answer to ' +
          '`what_proves_it_done` rather than a repeat of it: that field says what WOULD settle it, this one says ' +
          'what DID.',
        example: 'Both pages are in the shared drive and the reviewer acknowledged them on the 12th.',
      },
      // A DUTY OWED EVERY DAY (item 38 of wave 13s's requirements): each day is its own obligation, and the office
      // writes the next day's when this day's is fulfilled. src/server/lib/daily-obligations.ts writes it.
      {
        key: 'repeat',
        type: unionOf(OBLIGATION_REPEATS),
        required: false,
        description:
          '"daily": the same thing is owed every day at the same time. When this day\'s obligation is fulfilled, ' +
          'the office writes the next day\'s, due at the same time on the day after this one\'s `due`, and names ' +
          'it in `nextDay`. It carries the duty: the title, the summary, `owedTo`, `why`, `what_proves_it_done`, ' +
          '`consequence`, `effort_hours`, `source` and the repeat. Cancelling a day stops the repeating. `due` ' +
          'has to be a date.',
        example: 'daily',
      },
      { key: 'nextDay', type: 'string', required: false, description: "The next day's obligation, once the office has written it.", example: 'p7Rk2LmQ0vXa' },
      effortField('obligation'),
      ...attentionFields('obligation'),
      ...commonFields('obligation'),
    ],
    rules: [
      '`done` and `state` must not disagree. `state` of "fulfilled" or "cancelled" discharges the obligation, so ' +
        '`done: false` beside either of them is refused; so is `done: true` beside `state: "open"`. The two are read ' +
        'together, and a record that contradicts itself is read as whichever half the reader happened to look at.',
      '`fulfilledAt` and `fulfilledNote` need something that says the obligation is discharged — `done: true`, or a ' +
        '`state` of "fulfilled" or "cancelled". On their own they are refused: a discharge nothing marks as discharged ' +
        'leaves the obligation reading as owed on every panel while the proof sits in a field nobody reads.',
      'An obligation owed every day has `repeat`: "daily" and is due on a date, such as "2026-10-29 06:30": a ' +
        'condition or a record has no next day. When a day is fulfilled, the office writes the next day\'s, due at ' +
        'the same time the day after, so nobody files it by hand. A day that is cancelled stops the repeating.',
    ],
    example: {
      due: '2026-08-14',
      owedTo: 'the trial review',
      why: 'milestone 2 payment is gated on it',
      what_proves_it_done: 'The section is in the shared drive.',
      state: 'open',
      consequence: { bearer: 'outside', what: 'The trial review has nothing to assess, and the milestone 2 payment is held.' },
    },
}
