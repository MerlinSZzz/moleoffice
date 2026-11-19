// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT DAY OF A DAILY OBLIGATION, written by the office when this day's is fulfilled. src/shared/obligations.ts
 * says when it is due; KIND_SPECS.obligation in src/shared/kinds.ts declares `repeat` and `nextDay`.
 *
 * Item 38 of wave 13s's requirements: a report owed every day at 06:30 and
 * 17:30 was a new obligation filed by hand each day.
 *
 * ASKED ON EVERY WRITE THAT LEAVES AN OBLIGATION, by `createRecordWithReport` and `patchRecord` in ./records.ts, inside
 * that write's transaction, so a day and its next are stored together or not at all, whichever door fulfilled it. A
 * day fulfilled and naming no next day has its next day written; `nextDay` then names it, so it is written once, even
 * when the day is reopened and fulfilled again. A day that is cancelled has none: cancelling stops the repeating.
 */

import { theNextDaysDue } from '@shared/obligations.ts'
import { moleOffice } from '@shared/participants.ts'
import { readFulfilment } from '@shared/work.ts'
import { createRecordWithReport, getRecord, patchRecord, type Actor } from './records.ts'

/**
 * WHAT OF A DAY IS THE DUTY, and so is carried to the next day. The rest belongs to that day: when it was due, where
 * it stands, what blocked it, a pause, and how it was fulfilled.
 */
const THE_DUTY = ['owedTo', 'why', 'what_proves_it_done', 'consequence', 'effort_hours', 'source', 'repeat'] as const

function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/** Write the next day of this obligation when it is a daily one, fulfilled, and names no next day. Its id, or null. */
export function writeTheNextDayOfADailyObligation(id: string): string | null {
  const day = getRecord(id)
  if (day === null || day.kind !== 'obligation') return null
  const data = day.data
  if (data['repeat'] !== 'daily' || data['nextDay'] !== undefined) return null
  if (!readFulfilment(data).done || data['state'] === 'cancelled') return null
  const due = typeof data['due'] === 'string' ? theNextDaysDue(data['due']) : null
  // The kind's own check refuses a daily obligation whose due is not a date, so this is a broken assumption.
  if (due === null) throw new Error(`Daily obligation ${id} was fulfilled, and its due ${JSON.stringify(data['due'])} is not a date to count the next day from.`)
  const duty: Record<string, unknown> = {}
  for (const key of THE_DUTY) if (data[key] !== undefined) duty[key] = data[key]
  const next = createRecordWithReport({
    kind: 'obligation',
    title: day.title,
    summary: day.summary,
    data: { due, ...duty, state: 'open' },
    workspaceId: day.workspaceId,
    actor: theOffice(),
  }).record
  patchRecord(id, { dataPatch: { nextDay: next.id } }, theOffice())
  return next.id
}
