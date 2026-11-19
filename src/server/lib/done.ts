// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD MARKED DONE IN ONE CALL. The door is POST /api/records/:id/done, in src/server/api/done.ts.
 *
 * Item 38 of wave 13s's requirements: marking a record done took a nested
 * body, and a secretary closes dozens a day.
 *
 * A task and a backlog item are left "done". An obligation is discharged as its fulfil door discharges it, by
 * `dischargeObligation` in ./records.ts, with the note saying what settled it, and a daily one has its next day written
 * in the same write (./daily-obligations.ts). Any other kind is refused rather than given a word for done: a watch that
 * stopped is not one whose end came, and this door cannot tell which was meant.
 */

import type { BacklogItemState } from '@shared/backlog.ts'
import type { Incompleteness, ObligationState } from '@shared/kinds.ts'
import type { ItemState, PanelRecord } from '@shared/types.ts'
import { kindWord, stateWord } from '@shared/words.ts'
import { dischargeObligation, patchRecord, type Actor } from './records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { PanelError } from './panel-error.ts'

/** THE KINDS THIS DOOR MARKS DONE, and the state it leaves each in. */
const THE_DONE_STATE = {
  task: 'done',
  backlog_item: 'done',
  obligation: 'fulfilled',
} as const satisfies { task: ItemState; backlog_item: BacklogItemState; obligation: ObligationState }

type AKindMarkedDone = keyof typeof THE_DONE_STATE

const THE_KINDS = Object.keys(THE_DONE_STATE) as AKindMarkedDone[]

/** "a task, a backlog item or an obligation", from the list above. */
export const THE_KINDS_MARKED_DONE = THE_KINDS.map((kind) => {
  const word = kindWord(kind).text
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`
}).reduce((said, one, i, all) => (i === 0 ? one : `${said}${i === all.length - 1 ? ' or ' : ', '}${one}`), '')

function isAKindMarkedDone(kind: string): kind is AKindMarkedDone {
  return (THE_KINDS as string[]).includes(kind)
}

export interface DoneResult {
  record: PanelRecord
  incomplete: Incompleteness[]
  /** True when it was done already, and this call wrote nothing. */
  alreadyDone: boolean
  /** The sentence: what was written, or why nothing was. */
  note: string
}

/** Mark this record done. Only an obligation takes a note, and it must have one. */
export function markDone(record: PanelRecord, note: string | undefined, actor: Actor): DoneResult {
  const { id, kind, title } = record
  if (!isAKindMarkedDone(kind)) {
    throw new PanelError(
      `${id} is ${/^[aeiou]/.test(kindWord(kind).text) ? 'an' : 'a'} ${kindWord(kind).text}, and this door marks done ` +
        `only ${THE_KINDS_MARKED_DONE}. Nothing was written. Change its state with PATCH /api/records/${id} ` +
        '{"dataPatch":{"state":"<a state>"}}; GET /api/kinds/<its kind> lists its states.',
    )
  }

  if (kind === 'obligation') {
    if (note === undefined || note.trim() === '') {
      throw new PanelError(
        `An obligation is marked done with a note saying what settled it: {"note":"The report is in the chat."}. ` +
          `"${title}" was sent with none, so nothing was written.`,
      )
    }
    const discharged = dischargeObligation(id, { note, state: THE_DONE_STATE.obligation }, actor)
    const nextDay = discharged.record.data['nextDay']
    return {
      record: discharged.record,
      incomplete: discharged.incomplete,
      alreadyDone: discharged.alreadyDischarged,
      note:
        discharged.note +
        (discharged.alreadyDischarged || typeof nextDay !== 'string' ? '' : ` It repeats daily, and the next day's is ${nextDay}.`),
    }
  }

  if (note !== undefined) {
    throw new PanelError(
      `A ${kindWord(kind).text} keeps no note when it is done, so "${title}" was not changed. Send the call with no ` +
        'note. To say what happened, file a note and link it to this record.',
    )
  }

  const before = record.data['state']
  const state = THE_DONE_STATE[kind]
  if (before === state) {
    return {
      record,
      incomplete: incompletenessOf(record),
      alreadyDone: true,
      note: `"${title}" was already ${stateWord(state, 'normal', kind).text}. Nothing was written.`,
    }
  }
  const result = patchRecord(id, { dataPatch: { state } }, actor)
  return {
    record: result.record,
    incomplete: result.incomplete,
    alreadyDone: false,
    note:
      `"${title}" is ${stateWord(state, 'normal', kind).text}. ` +
      (typeof before === 'string' ? `It was ${stateWord(before, 'normal', kind).text}.` : 'It had no state before.'),
  }
}
