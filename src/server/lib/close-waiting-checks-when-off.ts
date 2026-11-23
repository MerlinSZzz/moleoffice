// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { NEEDS_NO_CHECK, NEEDS_NO_CHECK_RULES } from '@shared/releasing.ts'
import { MERGE_STATE_SPECS } from '@shared/merge-queue.ts'
import { nowStamp } from '@shared/time.ts'
import { stateWord } from '@shared/words.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { asTheDoorOf } from './check-field-doors.ts'
import { whetherThisOfficesChecksAreSwitchedOff } from './checks-in-merges-only.ts'
import { aRefusalStandsOn, runsThatSaidTheyAreFinished, theCheckAskedFor } from './inspection.ts'
import { readMergeEntry, theMergeEntriesACheckOfThisRunIsFor } from './merge-queue.ts'
import { patchRecord } from './records.ts'
import { listRecordIdsKindsAndProjects } from './records/reading.ts'
import { THE_OFFICE } from './the-office.ts'
import { inspectorAnswersRun } from './inspector-answers-lines.ts'

export interface ARunLookedAtWhenChecksAreOff { run: string; why: string }

/** How many runs the start's sweep works out, and how many it closes or skips, between two turns of the event loop. */
export interface RunsAtATime { workedOut: number; closedOrSkipped: number }

/**
 * THE SWEEP'S BATCHES: 500 runs worked out at a time, and 5 runs closed or skipped at a time. The figures were read
 * from a server's log over several starts. Working out which runs wait took about 0.12 ms a session record, so a batch
 * of 500 holds the thread for about 60 ms. A closure took about 10 to 30 ms, so a batch of 5 holds it for 50 to 150 ms.
 * The sweep gives the thread back between two batches, so the server answers its requests during the sweep, however
 * many runs wait.
 */
export const RUNS_AT_A_TIME: Readonly<RunsAtATime> = { workedOut: 500, closedOrSkipped: 5 }

type AFinishedRun = ReturnType<typeof runsThatSaidTheyAreFinished>[number]

/**
 * Close finished runs still waiting for a check when this office starts with checks deliberately off.
 *
 * IT WORKS IN BATCHES AND GIVES THE THREAD BACK BEFORE EACH ONE. At one start it went over about 21,700 waiting runs
 * in one piece and held the server's one thread for minutes. The start tool gives a new server 60 seconds to answer,
 * so it stopped the server at each start, and nine starts were needed to close the runs. Now the call returns before it
 * reads anything. Before each batch the sweep waits for one turn of the event loop and reads the review level and the
 * switch again. When a project's checks are no longer off at the full level, the sweep writes nothing more there. A
 * run worked out as waiting is read again before it is closed, because another door may have changed it between two
 * batches.
 */
export async function closeWaitingRunsWhileChecksAreOff(
  atATime: Readonly<RunsAtATime> = RUNS_AT_A_TIME,
): Promise<{ closed: ARunLookedAtWhenChecksAreOff[]; skipped: ARunLookedAtWhenChecksAreOff[] }> {
  const closed: ARunLookedAtWhenChecksAreOff[] = []
  const skipped: ARunLookedAtWhenChecksAreOff[] = []
  await aTurnOfTheLoop()
  for (const project of listWorkspaces()) {
    const waiting = await theRunsWaitingIn(project.id, atATime.workedOut)
    if (waiting === null) continue
    for (let from = 0; from < waiting.length; from += atATime.closedOrSkipped) {
      if (!(await theChecksAreStillOffAfterATurn(project.id))) break
      for (const one of runsThatSaidTheyAreFinished(project.id, waiting.slice(from, from + atATime.closedOrSkipped))) {
        const { record } = one
        if (!itWaitsForACheck(one)) continue
        if (inspectorAnswersRun(record.id, project.id)) continue
        if (theCheckAskedFor(record)?.execution !== undefined) {
          skipped.push({ run: record.id, why: 'Its check is running or has an execution recorded.' })
          continue
        }
        const live = theMergeEntriesACheckOfThisRunIsFor(record.id, project.id)
          .map(readMergeEntry).find((entry) => !MERGE_STATE_SPECS[entry.state].final)
        if (live !== undefined) {
          skipped.push({ run: record.id, why: `Merge entry ${live.id} has not ended: it is ${stateWord(live.state).text}.` })
          continue
        }
        const because = "The office closed this waiting run at its start because its checks were switched off."
        asTheDoorOf(NEEDS_NO_CHECK, () => patchRecord(record.id, { dataPatch: { [NEEDS_NO_CHECK]: {
          rule: NEEDS_NO_CHECK_RULES[1], at: nowStamp(), because,
        } } }, THE_OFFICE))
        closed.push({ run: record.id, why: because })
      }
    }
  }
  return { closed, skipped }
}

/** One turn of the event loop: what waits for the thread runs before the sweep goes on. */
async function aTurnOfTheLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

/** After one turn of the loop, whether this project's checks are still switched off at the full review level. */
async function theChecksAreStillOffAfterATurn(project: string): Promise<boolean> {
  await aTurnOfTheLoop()
  return theReviewLevel(project) === 'full' && whetherThisOfficesChecksAreSwitchedOff(project)
}

/** The first test: a finish nobody released, with no mark that it needs no check and no refusal standing on it. */
function itWaitsForACheck({ record, stands }: AFinishedRun): boolean {
  return stands.unreleasedFinish && stands.needsNoCheck === null && !aRefusalStandsOn(record)
}

/**
 * The ids of this project's runs that pass the first test, worked out `atATime` session records at a time. Null when the
 * project's checks are not off at the full level before one of the batches.
 */
async function theRunsWaitingIn(project: string, atATime: number): Promise<string[] | null> {
  if (!(await theChecksAreStillOffAfterATurn(project))) return null
  const ids = listRecordIdsKindsAndProjects({ workspaceId: project, kind: 'session' }).map((one) => one.id)
  const waiting: string[] = []
  for (let from = 0; from < ids.length; from += atATime) {
    if (!(await theChecksAreStillOffAfterATurn(project))) return null
    for (const one of runsThatSaidTheyAreFinished(project, ids.slice(from, from + atATime))) {
      if (itWaitsForACheck(one)) waiting.push(one.record.id)
    }
  }
  return waiting
}
