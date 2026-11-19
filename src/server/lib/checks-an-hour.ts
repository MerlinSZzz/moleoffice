// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { gateMet } from './gate-counts.ts'
/**
 * AT MOST SIX CHECKS AN HOUR IN ONE LANE, as the office reads it: the second part of a decision
 * , and the answer on the decision record. The cap counts per lane (one
 * repository row per project), is
 * a setting, and only paces, with one sentence to the secretary.
 *
 * The office counts the checks started in each lane in the last hour and hands each check row on the worker's queue its
 * pace. The worker holds a check whose lane is full, with the sentence in @shared/checks-an-hour.ts, and the held door
 * tells the secretary once. Nothing here refuses a check.
 */
import { realpathSync } from 'node:fs'
import { CHECKS_AN_HOUR_SETTING, whyACheckWaitsItsTurn, type ThePaceOfACheck } from '@shared/checks-an-hour.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import { localStamp } from '@shared/time.ts'
import { CHECKS_AN_HOUR_BOUNDS, mergedEnvironment, gatePosition } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { theCheckAskedFor, whoHoldsTheSecretaryCard, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { theNewestEntryIdsOfRuns, theNewestEntryOfARun, whyACheckOfThisRunWaitsForItsReport } from './merge-queue.ts'
import { getRecord } from './records.ts'
import { listRepositories } from '../db/list-repositories.ts'

const AN_HOUR_MS = 60 * 60 * 1000

/**
 * THE LANE OF A CHECK'S RUN: the root its newest merge entry lands in, or the checkout of the project's one registered
 * repository when the run has no merge entry yet. A project with no such repository, or with several, gives no lane, and
 * the sentence says why. A caller that read the run's newest entry already hands it in.
 */
export function theLaneOfACheckOf(
  runId: string,
  workspaceId: string,
  newest: PanelRecord | null = theNewestEntryOfARun(runId, workspaceId),
): { lane: string } | { notPaced: string } {
  const changeset = newest?.data['changeset']
  const root = typeof changeset === 'object' && changeset !== null && !Array.isArray(changeset) ? (changeset as Record<string, unknown>)['root'] : undefined
  if (typeof root === 'string' && root !== '') return { lane: root }
  const checkouts = listRepositories(workspaceId).flatMap((one) => {
    if (one.root === null) return []
    try {
      return [realpathSync(one.root)]
    } catch {
      return []
    }
  })
  if (checkouts.length === 1) return { lane: checkouts[0]! }
  return {
    notPaced:
      `No lane can be told for run ${runId}: it has no merge entry, and its project has ${String(checkouts.length)} registered ` +
      'repositories with a checkout on this machine, not exactly one. So the hourly cap on checks in one lane does not pace ' +
      'this check.',
  }
}

/**
 * HOW MANY CHECKS STARTED IN EACH LANE IN THE LAST HOUR, in every project: every check session filed in that hour, by the
 * lane of the run it checked. A check whose run gives no lane is in no lane's count. The newest merge entries of the runs
 * are read in one query for each project.
 */
export function theChecksStartedInTheLastHour(): Map<string, number> {
  const since = localStamp(new Date(Date.now() - AN_HOUR_MS))
  // UPDATED_AT FIRST, because it has the index and a session is never updated before it is created.
  const rows = sqlite
    .prepare(
      "SELECT workspace_id AS workspaceId, json_extract(data, '$.extra.inspectionRun') AS run FROM records WHERE updated_at >= @since " +
        "AND +kind = 'session' AND created_at >= @since AND json_extract(data, '$.extra.purpose') = 'inspection'",
    )
    .all({ since }) as { workspaceId: string; run: unknown }[]
  const runsOf = new Map<string, Set<string>>()
  for (const row of rows) {
    if (typeof row.run !== 'string' || row.run === '') continue
    runsOf.set(row.workspaceId, (runsOf.get(row.workspaceId) ?? new Set<string>()).add(row.run))
  }
  const lanes = new Map<string, string | null>()
  for (const [workspaceId, runs] of runsOf) {
    for (const [run, entry] of theNewestEntryIdsOfRuns([...runs], workspaceId)) {
      const reading = theLaneOfACheckOf(run, workspaceId, entry === null ? null : getRecord(entry))
      lanes.set(`${workspaceId}\n${run}`, 'lane' in reading ? reading.lane : null)
    }
  }
  const counted = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.run !== 'string' || row.run === '') continue
    const lane = lanes.get(`${row.workspaceId}\n${row.run}`)
    if (lane === null || lane === undefined) continue
    counted.set(lane, (counted.get(lane) ?? 0) + 1)
  }
  return counted
}

/** THE MOST CHECKS THAT MAY START IN ONE LANE IN AN HOUR, from the setting, or why the setting cannot be used. */
export function howManyChecksAnHour(env: Record<string, string | undefined>): { most: number } | { cannotPace: string } {
  const raw = gatePosition('checks-an-hour', env)
  const most = raw === null ? Number.NaN : Number(raw)
  if (raw !== null && /^\d+$/.test(raw.trim()) && most >= CHECKS_AN_HOUR_BOUNDS.fewest && most <= CHECKS_AN_HOUR_BOUNDS.most) return { most }
  return {
    cannotPace:
      `The check waits: ${CHECKS_AN_HOUR_SETTING} is "${String(raw)}", and it has to be a whole number from ` +
      `${String(CHECKS_AN_HOUR_BOUNDS.fewest)} to ${String(CHECKS_AN_HOUR_BOUNDS.most)}, because ${String(CHECKS_AN_HOUR_BOUNDS.most)} an hour ` +
      "in one lane is the most the office allows. It is not refused, and it starts once the setting can be used.",
  }
}

/**
 * THE PACE OF ONE CHECK for the worker's queue row, from the counts read once for the pass, and from the run's newest merge
 * entry when the caller read it already.
 */
export function thePaceOfACheckOf(
  runId: string,
  workspaceId: string,
  env: Record<string, string | undefined>,
  started: ReadonlyMap<string, number>,
  newest?: PanelRecord | null,
): ThePaceOfACheck {
  const most = howManyChecksAnHour(env)
  if ('cannotPace' in most) return most
  const lane = theLaneOfACheckOf(runId, workspaceId, newest)
  if ('notPaced' in lane) return lane
  return { lane: lane.lane, started: started.get(lane.lane) ?? 0, most: most.most }
}

/**
 * THE SECRETARY IS TOLD ONCE THAT A CHECK WAITS ITS TURN, in the sentence the worker's row says. Called by the held door,
 * which the worker asks each time its sentence for a message changes. The office reads the pace again rather than taking
 * the caller's sentence, and writes one message for each check message: a further held sentence for the same check finds
 * the message already written. A check held for its report, or for a setting the office cannot use, is not this.
 */
export function tellTheSecretaryACheckWaitsItsTurn(
  messageId: string,
  workspaceId: string,
): { message: string | null; says: string } | null {
  const asked = getRecord(messageId)?.data['aboutRun']
  const run = typeof asked === 'string' ? getRecord(asked) : null
  const check = run === null ? null : theCheckAskedFor(run)
  if (run === null || run.workspaceId !== workspaceId || check === null || check.message !== messageId || check.execution !== undefined) return null
  if (whyACheckOfThisRunWaitsForItsReport(run.id, workspaceId) !== null) return null
  const pace = thePaceOfACheckOf(run.id, workspaceId, mergedEnvironment(), theChecksStartedInTheLastHour())
  if (!('lane' in pace)) return null
  const because = whyACheckWaitsItsTurn(pace, 0)
  if (because === null) return null
  const already = sqlite
    .prepare(
      "SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'aCheckWaitsItsTurn' AND json_extract(data, '$.aboutRun') = ? " +
        'AND rowid > (SELECT rowid FROM records WHERE id = ?) ORDER BY rowid LIMIT 1',
    )
    .get(run.id, messageId) as { id: string } | undefined
  if (already !== undefined) return { message: already.id, says: `The secretary was already told in message ${already.id}.` }
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary === null) return { message: null, says: `Nobody holds the secretary card, so nobody was told that the check of run ${run.id} waits its turn.` }
  const to: ParticipantRef[] = [{ kind: 'agent', id: secretary.id }]
  gateMet('checks-an-hour', String(pace.most))
  const message = writeAMessage({
    workspaceId,
    to,
    onlyThem: true,
    notice: 'aCheckWaitsItsTurn',
    aboutRun: run.id,
    actor: THE_OFFICE,
    title: `The check of run ${run.id} waits its turn`,
    body: `The check of run ${run.id} (message ${messageId}) is held and not started. ${because}`,
  })
  return { message, says: `${secretary.handle} was told in one message, ${message}.` }
}
