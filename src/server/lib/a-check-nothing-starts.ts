// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUEUED CHECK THAT NOTHING IN THE OFFICE WILL START: THE RUN'S STARTER IS TOLD, ONCE. Wave 13n round DP.
 *
 * WHY. When the office queues a check that nothing in the office would start, the run's stored sentence says so
 * (`theOfficeStartsTheCheck` in ./inspection.ts), and the run keeps the mark @shared/whether-a-check-would-start.ts
 * describes. A run's sentence is read only by somebody who looks at the run. So an hour after the ask, the minute pass
 * (`sendTheRemindersThatAreDue` in ./reminders.ts) tells the run's starter, once, if the check still stands where it
 * stood: not started, no verdict, the ask neither replaced nor answered, and nothing in the office would start it now.
 * Otherwise the mark is let go with the reason, and nobody is told.
 *
 * WHAT IT READS. Only the runs whose mark is due and is neither told nor let go, through the index of migration 0329
 * (`STORED_FIELDS.sessionTellsOfACheckNothingStartsAfter` in src/server/db/schema.ts), so a pass with none due reads no
 * run. A run asked before the mark existed has none, so the runs queued before this round tell nobody.
 */
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { howARunStands } from '@shared/releasing.ts'
import { localStamp } from '@shared/time.ts'
import {
  A_CHECK_NOTHING_STARTS, A_MARK_IS_LET_GO_BECAUSE, theMarkAsStored, theOfficeStartedNoCheckOf, theOfficeStartedNoCheckSays,
} from '@shared/whether-a-check-would-start.ts'
import type { PanelRecord } from '@shared/types.ts'
import { whetherThisOfficeWouldStartThisRunCheck } from './checks-in-merges-only.ts'
import { theAgentOfARun, theCheckAskedFor, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { getRecord, patchRecord } from './records.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'

/** The stored field in the words of the index's expression, so SQLite reads the index. */
const TELL_AFTER = theWordsOfAStoredField(STORED_FIELDS.sessionTellsOfACheckNothingStartsAfter, 'data')

/**
 * `INDEXED BY` HOLDS THE READ TO THE INDEX OF MIGRATION 0329, and makes a read SQLite cannot answer from it an error.
 * Without it SQLite took `records_kind_idx` for `kind = 'session'` and read every run.
 */
const THE_INDEX = 'records_session_check_nothing_starts_idx'

/** Tell the starter of each run whose mark is due, or let the mark go and say why. The runs whose starter was told. */
export function tellTheStartersOfChecksNothingStarts(now: Date): string[] {
  const due = sqlite
    .prepare(`SELECT id FROM records INDEXED BY ${THE_INDEX} WHERE kind = 'session' AND ${TELL_AFTER} IS NOT NULL AND ${TELL_AFTER} <= ? AND deleted_at IS NULL ORDER BY ${TELL_AFTER}, id`)
    .all(now.getTime()) as { id: string }[]
  const told: string[] = []
  for (const { id } of due) {
    const run = getRecord(id)
    if (run === null) continue
    if (tellOrLetGo(run, now)) told.push(run.id)
  }
  return told
}

/** Tell the run's starter, true, or write why nobody was told, false. */
function tellOrLetGo(run: PanelRecord, now: Date): boolean {
  const mark = theMarkAsStored(run.data[A_CHECK_NOTHING_STARTS])
  // THE RECORD DOOR REFUSES A MARK OF ANOTHER SHAPE (src/shared/kind-fields/session-wave-13n.ts), so one here was written
  // past it. Nothing is guessed from it.
  if (mark === null) throw new Error(`Run ${run.id} holds ${A_CHECK_NOTHING_STARTS} in a shape the office does not write, so its starter was not told and the mark was left as it is.`)
  const at = localStamp(now)
  const letGo = (because: string): false => {
    patchRecord(run.id, { dataPatch: { [A_CHECK_NOTHING_STARTS]: { notTold: { at, because } } } }, THE_OFFICE)
    return false
  }
  const ask = theCheckAskedFor(run)
  if (ask === null || ask.message !== mark.message) return letGo(A_MARK_IS_LET_GO_BECAUSE.aNewerAskReplacedIt)
  if (ask.execution !== undefined) return letGo(A_MARK_IS_LET_GO_BECAUSE.theCheckStarted)
  const stands = howARunStands(run.data)
  if (stands.released !== null) return letGo(A_MARK_IS_LET_GO_BECAUSE.theRunHasItsVerdict('released'))
  if (stands.refused !== null) return letGo(A_MARK_IS_LET_GO_BECAUSE.theRunHasItsVerdict('refused'))
  if (!stands.unreleasedFinish || stands.landedByHand !== null) return letGo(A_MARK_IS_LET_GO_BECAUSE.theAskWasAnsweredWithoutACheck(stands.says))
  const reading = whetherThisOfficeWouldStartThisRunCheck(run.workspaceId, run.id)
  if (reading.starts) return letGo(A_MARK_IS_LET_GO_BECAUSE.theOfficeWouldStartItNow)
  const agent = theAgentOfARun(run)
  if (agent === null) return letGo(A_MARK_IS_LET_GO_BECAUSE.theRunServesNoAgentItCanName)
  const starter = whoIsToldOfTheRun(agent)
  if (!('to' in starter)) return letGo(A_MARK_IS_LET_GO_BECAUSE.theStarterCannotBeNamed(starter.because))
  sqlite.transaction(() => {
    const message = writeAMessage({
      workspaceId: run.workspaceId,
      to: [starter.to],
      title: theOfficeStartedNoCheckOf(run.id),
      body: theOfficeStartedNoCheckSays(run.id, mark.inspector, mark.askedAt, at, reading),
      aboutRun: run.id,
      actor: THE_OFFICE,
      onlyThem: true,
      notice: 'theOfficeStartedNoCheck',
    })
    patchRecord(run.id, { dataPatch: { [A_CHECK_NOTHING_STARTS]: { told: { at, message } } } }, THE_OFFICE)
  })()
  return true
}
