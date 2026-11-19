// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A SESSION IS A STOPPED CHECK'S, and in what words: the one reading the doors a check's inspector writes through
 * ask, so none of them can disagree about it.
 *
 * A session has stopped when its run key was revoked, which is what the stop door does to a run, or when it was minted no
 * run key and its state says it has ended. A session with a live run key, or with no key and a state that has not ended,
 * has not. An id that names no session of this project answers null, as it did at the verdict door: that door, the
 * assembled door and the record door each say for themselves what an id naming nothing means to them.
 *
 * The answer is the session and the clause that says why, which each door puts in its own sentence: "its run key was
 * revoked at <when>. <the recorded reason>" or "its state is <state> and it has no run key. <its doing line>".
 */
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theAgentOfARun } from './inspection.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { theRunKeyRecordedOn } from './keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import type { PanelRecord } from '@shared/types.ts'
import { getRecord, type Actor } from './records.ts'

export function theStopOfThisSession(sessionId: string | null | undefined, workspaceId: string): { session: PanelRecord; said: string } | null {
  const id = sessionId?.trim()
  if (!id) return null
  const session = getRecord(id)
  if (session === null || session.kind !== 'session' || session.deletedAt !== null || session.workspaceId !== workspaceId) return null
  const key = theRunKeyRecordedOn(session.data as Record<string, unknown>)
  if (key !== null && key.revokedAt !== null) {
    // A ROW WITH NO REASON SAYS SO: every writer sets one, but the column allows none, and a placeholder quoted as
    // the reason would be a reason nobody recorded.
    const because = key.revokedBecause === null
      ? 'No reason was recorded for it.'
      : `The recorded reason is ${JSON.stringify(key.revokedBecause)}.`
    return { session, said: `its run key was revoked at ${key.revokedAt}. ${because}` }
  }
  // AN ID NAMING NO ROW IS READ AS NO RUN KEY: there is no key row whose standing could establish a live run.
  if (key === null && theRunHasEnded(session.data['state'])) {
    const doing = session.data['doing']
    const said = typeof doing === 'string' && doing.trim() !== ''
      ? `Its doing line is ${JSON.stringify(doing)}.`
      : 'Its doing line is empty.'
    return { session, said: `its state is ${String(session.data['state'])} and it has no run key. ${said}` }
  }
  return null
}

/**
 * THE RUNS A SESSION WAS CHECKING: those whose check was assembled in it, as the change ledger records each assembly (the
 * office's own write of whatTheCheckWouldRead, under the session the inspector named). A session that assembled no check is
 * no check, and answers none.
 */
function theRunsThisSessionWasChecking(sessionId: string): string[] {
  return (sqlite.prepare(
    "SELECT DISTINCT record_id AS run FROM changes WHERE session_id = ? AND actor_type = 'agent' " +
      "AND actor_id = 'mole-office/the-api-server' AND field LIKE 'data.whatTheCheckWouldRead%'",
  ).all(sessionId) as { run: string }[]).map((row) => row.run)
}

/**
 * TELL THE STARTER OF EACH RUN THIS STOPPED SESSION WAS CHECKING, ONCE, that the check was stopped and its verdict will not
 * count. The stop door calls it when the stop revoked the session's key or signalled its
 * process, so a second stop that does neither says nothing more. A run whose agent no starter is recorded for is told nobody.
 */
export function tellTheStarterACheckWasStopped(check: PanelRecord, by: Actor, why: string, workspaceId: string): void {
  for (const runId of theRunsThisSessionWasChecking(check.id)) {
    const run = getRecord(runId)
    if (run === null || run.deletedAt !== null) continue
    const agent = theAgentOfARun(run)
    const told = agent === null ? null : whoIsToldOfTheRun(agent)
    const starter = told !== null && 'to' in told ? told.to : null
    if (starter === null) continue
    writeASystemLineToOne(
      starter,
      workspaceId,
      SYSTEM_LINES.aCheckWasStopped(check.id, run.id, by.id, why),
      { type: 'system', id: moleOffice().id },
      { run: run.id },
      { aCheckWasStopped: { check: check.id, run: run.id, by: by.id, why } },
    )
  }
}
