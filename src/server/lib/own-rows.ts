// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN SESSION ROWS ARE CLOSED WHEN THE START THEY STOOD FOR IS REPLACED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2G9jNsuJwJf4`. On the owner's own office on 12 September 2026 `GET /api/sessions?only=running`
 * answered 59 rows, and 27 of them were the office's own parts: 15 "The message worker" rows and 2
 * "The API server" rows on a machine running one pair, beside 10 "The browser app" rows. Every start
 * files a fresh session record for itself and its worker, and nothing closes the one the start
 * before it filed — the shutdown writes `finished` on the rows of the run that stops cleanly, and a
 * `tsx watch` restart or a killed terminal never reaches it.
 *
 * The existing ledger close does not cover this. `registerThisServer` closes the PROCESS rows of
 * processes that have gone, and `sayHowThisSessionEnded` then closes the session that owned one.
 * That reaches a session only while a live process row for it still exists to be found gone; once
 * that process row is closed, the session row is orphaned and nothing ever looks at it again. And
 * the session row itself carries no pid or start time, so nothing can tell the row's process from a
 * later process that reused the number.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES, AND WHY THE CAUSE IS THE OLD ROW
 * ---------------------------------------------------------------------------------------
 *
 * At start, a part closes its own earlier rows — the same title, the same port and the same
 * checkout — that still say they are going. It writes `finished` and the one cause it knows:
 * `replaced by the start of <time>`. It never writes `crashed`: the row was not found by reading a
 * process that has gone, it was found by a newer start of the same part, and inventing a crash the
 * new start did not observe is invariant 5 of USER.md.
 *
 * The new row carries its pid and its start time, so a later reading can see what the row stood for
 * rather than take its word for it. `data.startedAt` is the kind's own start field; the pid goes in
 * `data.extra.discovered` under the keys the session hook already writes, so `theRecordedProcessOf`
 * reads it with the same function it reads a hand-filed run's process with.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE IS ONE PLACE, AND THE DATABASE WORK IS THE OTHER
 * ---------------------------------------------------------------------------------------
 *
 * Which earlier rows a later start replaces is `theEarlierOwnRowsAmong` in
 * `src/config/own-rows.mjs`. It is there rather than here because the browser app's start is the
 * Vite plugin in `vite.config.ts`, which cannot import this module: this module imports
 * `./records.ts`, which opens the office database the moment it is imported, and a Vite config must
 * not open the operator's corpus while Vite is still reading the config. So the pure rule — the
 * match, the identity block, the patch an earlier row is given — is in the `.mjs`, and what stays
 * here is the database work: read the rows, and patch each one the rule returns.
 *
 * A row written by this code carries `data.extra.ownPart = { role, port, checkout }` and is matched
 * on all three. A row written before this existed records no port, so it is matched on role and
 * checkout alone — otherwise the live office's own old rows would never be closable by the next
 * start, which is the whole point of the change. A row that records a DIFFERENT port is another
 * stack of the same checkout and is left alone.
 */

import { existsSync } from 'node:fs'
import { and, inArray, sql } from 'drizzle-orm'
import { records } from '../db/schema.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { ClosedHow } from '@shared/lifecycle.ts'
import { listRecords, patchRecord, theProcessesAWriteReads, type Actor } from './records.ts'
import { ledgerRowById, osProbe, type AProcessToRead, type OsContainers, type OsContainerState } from './resources.ts'
import { theSessionIdsWhere } from './session-fields.ts'
import { theRowNamesAnotherMachine } from './machines.ts'
import { saysStillGoing, STILL_GOING_STATES } from '../../config/still-going.mjs'
import {
  THE_API_SERVER,
  THE_MESSAGE_WORKER,
  THE_TERMINAL_HOLDER,
  theDeadOwnRowPatch,
  theDirectoryGoneRowPatch,
  theEarlierOwnRowsAmong,
  theRecordedCheckoutOf,
  theRecordedProcessIsGone,
  theRecordedProcessOf,
  theReplacedOwnRowPatch,
  stillGoing,
} from '../../config/own-rows.mjs'
import { THE_OFFICES_OWN_PARTS, theRowIsOneOfTheOfficesOwn } from '@shared/offices-own-rows.ts'

/**
 * The titles and the identity block are the shared rule's, re-exported here so every caller of the
 * server's half still reads them from one module. `THE_BROWSER_APP` is not re-exported: the API
 * server and its worker do not file that role, and the Vite plugin reads it from the `.mjs`.
 */
export { THE_API_SERVER, THE_MESSAGE_WORKER, THE_TERMINAL_HOLDER, theOwnPartBlock, theOwnPartUsageReceipt } from '../../config/own-rows.mjs'

/**
 * One part of the office, as the rows that describe it identify it.
 *
 * `port` is the port the part answers on — the API's port for the server and for its worker, the
 * browser app's for the browser. It is null only when the machine could not say, and a null port
 * falls back to role and checkout.
 */
export interface OwnPart {
  role: string
  port: number | null
  checkout: string
}

/**
 * THE LIVE SESSION ROWS AN EARLIER RUN OF ONE PART LEFT BEHIND.
 *
 * Exported so a test can ask what the close would act on without writing anything; `keep` is the
 * row filed by this start, which is never its own predecessor.
 */
export function theEarlierOwnRows(workspaceId: string, part: OwnPart, keep: string | null = null): PanelRecord[] {
  return theEarlierOwnRowsAmong(listRecords({ workspaceId, kind: 'session' }), part, keep) as PanelRecord[]
}

/**
 * CLOSE THE EARLIER ROWS OF THIS PART, with the one cause this start knows.
 *
 * It returns the ids it closed so the caller can say how many. A row the patch refuses is left
 * exactly as it is and named in the log by the caller; this never throws into a start.
 */
export function closeTheEarlierOwnRows(input: {
  workspaceId: string
  part: OwnPart
  actor: Actor
  now: Date
  keep?: string | null
}): string[] {
  const stamp = localStamp(input.now)
  const dataPatch = theReplacedOwnRowPatch(stamp)
  const closed: string[] = []
  for (const row of theEarlierOwnRows(input.workspaceId, input.part, input.keep ?? null)) {
    patchRecord(row.id, { dataPatch }, input.actor)
    closed.push(row.id)
  }
  return closed
}

/**
 * The processes `closeTheEarlierOwnRows` reads, for `readFirst`: the process rows each close would close
 * (`theProcessesAWriteReads`).
 */
export function theProcessesTheEarlierOwnRowsCloseReads(input: { workspaceId: string; part: OwnPart; now: Date; keep?: string | null }): AProcessToRead[] {
  const dataPatch = theReplacedOwnRowPatch(localStamp(input.now))
  return theEarlierOwnRows(input.workspaceId, input.part, input.keep ?? null).flatMap((row) => theProcessesAWriteReads(row.id, { dataPatch }))
}

export { theRowIsOneOfTheOfficesOwn }

/**
 * CLOSE AN OFFICE ROW WHOSE PROCESS IS GONE, with the one cause this reading knows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The replaced-rows close above only reaches a row when the SAME part starts again on the same port
 * and checkout. A browser app a check worktree started is never started again — a check works in a
 * worktree it discards — so its row said running for ever. A browser app started from a worktree
 * that never runs again is the same shape, and so is any of the three parts whose process was
 * killed. Problem `1p-pQxYe0RLB`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, AND WHAT IT WILL NOT GUESS
 * ---------------------------------------------------------------------------------------
 *
 * It reads the process each row recorded, `data.extra.discovered.pid`, against the machine. Nothing
 * under that pid means the row's process is gone. Something under it whose recorded `pidStartedAt`
 * is not its start time means the number was reused and the row's process is gone too. A row that
 * records no pid is left alone: nothing can be said about it. A row whose process is alive is left
 * running, so a live API server, worker or browser app is never closed by this.
 *
 * It never writes `crashed`. The row was found by reading a process that is not there, not by
 * seeing how it ended, and invariant 5 of USER.md forbids inventing that.
 *
 * The rule for what "gone" means is `theRecordedProcessIsGone` in `src/config/own-rows.mjs`, so a
 * later reading of the same fact cannot disagree with this one.
 */
export function closeTheOwnRowsWhoseProcessIsGone(input: {
  workspaceId: string
  actor: Actor
  now: Date
  /** A superset shared by the minute pass. The row's own state is checked again below. */
  sessionIds?: string[]
}): string[] {
  const probe = osProbe()
  const stamp = localStamp(input.now)
  const closed: string[] = []
  for (const { row, recorded, pid } of theOwnRowsToAsk(input.workspaceId, input.sessionIds)) {
    const live = probe.processById(pid)
    if (theRecordedProcessIsGone(recorded, live) !== 'gone') continue
    patchRecord(row.id, { dataPatch: theDeadOwnRowPatch(pid, stamp) }, input.actor)
    closed.push(row.id)
  }
  return closed
}

/** The rows `closeTheOwnRowsWhoseProcessIsGone` asks about, each with the process it recorded. */
function theOwnRowsToAsk(
  workspaceId: string,
  sessionIds: string[] | undefined,
): { row: PanelRecord; recorded: ReturnType<typeof theRecordedProcessOf>; pid: number }[] {
  const asked: { row: PanelRecord; recorded: ReturnType<typeof theRecordedProcessOf>; pid: number }[] = []
  // ONLY THE ROWS TITLED AS ONE OF THE OFFICE'S OWN PARTS ARE READ, by the title column and with no JSON parsed. Reading
  // every session row for these few was 90 ms of every minute at the live counts (wave 13y round 16).
  // AND ONLY THE ROWS WHOSE KEPT STATE IS ONE `stillGoing` ACCEPTS ARE ASKED ABOUT (lib/session-fields.ts). The title alone
  // still read every session row of the project, by the kind index, about 18 ms a minute over every project on the copy
  // at the live counts (wave 13y round 17).
  const ids = sessionIds ?? theSessionIdsWhere(workspaceId, (one) => saysStillGoing(one.state))
  for (const row of listRecords({ workspaceId, kind: 'session', ids, alsoWhere: inArray(records.title, [...THE_OFFICES_OWN_PARTS]) })) {
    if (!theRowIsOneOfTheOfficesOwn(row.title)) continue
    if (!stillGoing(row)) continue
    if (theRowNamesAnotherMachine(row)) continue
    const recorded = theRecordedProcessOf(row)
    if (recorded.pid === null) continue
    asked.push({ row, recorded, pid: recorded.pid })
  }
  return asked
}

/**
 * The processes `closeTheOwnRowsWhoseProcessIsGone` reads, for `readFirst`: each row's recorded process, and the process
 * rows its close would close (`theProcessesAWriteReads`).
 */
export function theProcessesTheOwnRowsCloseReads(input: { workspaceId: string; now: Date }): AProcessToRead[] {
  const stamp = localStamp(input.now)
  return theOwnRowsToAsk(input.workspaceId, undefined).flatMap(({ row, pid }) => [
    { pid, alsoItsStarterIfEnded: false },
    ...theProcessesAWriteReads(row.id, { dataPatch: theDeadOwnRowPatch(pid, stamp) }),
  ])
}

/**
 * CLOSE A RUNNING SESSION ROW WHOSE WORKING DIRECTORY IS GONE AND WHICH RECORDED NO PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND FUNCTION BESIDE THE ONE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * The closer above reaches only the office's own parts, matched by title, and closes a row on the
 * strength of its RECORDED PID. Problem `2plCt-8-b-pW` holds a row of neither kind: a supervisor's
 * run whose agent was retired after the work landed, which recorded no process at all and whose
 * working directory — a worktree that was removed — is not on the disk any more. Nothing above can
 * close a row that recorded no process, and nothing anywhere else looks at the directory.
 *
 * THIS ONE READS EVERY RUNNING SESSION ROW, not the office's own three. Its condition is the pair
 * of facts the problem names: the row records no process, so nothing the process closer reads can
 * speak for it, and its working directory no longer exists, so nothing behind the word `running`
 * can be found — the directory is what the run would be sealed from, so a finish through the door
 * could not produce a hole that says the run was still going.
 *
 * WHAT IT WILL NOT GUESS. A row whose directory is absent but which DID record a process is the
 * closer above's question, not this one's: the directory being gone does not say the process is.
 * A row that records no working directory at all is left alone: nothing can be asked of it. A row
 * whose directory is still on the disk is left alone: something may still be behind it. A row that
 * names another machine is left alone: the path is a path on that machine, not here.
 *
 * It never writes `crashed`. The directory's absence is what was observed; how the run itself ended
 * was not. The rule for the words written is `theDirectoryGoneRowPatch` in `src/config/own-rows.mjs`,
 * beside the other two closes, so the three cannot drift apart.
 */
export function closeTheRunningRowsWhoseDirectoryIsGone(input: {
  workspaceId: string
  actor: Actor
  now: Date
  /** A superset shared by the minute pass. The database and stillGoing check it again. */
  sessionIds?: string[]
}): string[] {
  const stamp = localStamp(input.now)
  const closed: string[] = []
  // ONLY THE ROWS WHOSE STORED STATE IS ONE `stillGoing` ACCEPTS ARE READ WHOLE; `stillGoing` still decides. Reading
  // every session row for them was 90 ms of every minute at the live counts (wave 13y round 16).
  // AND ONLY THE ROWS WHOSE KEPT FIELDS SAY SO ARE ASKED ABOUT AT ALL (lib/session-fields.ts), so no session row is parsed
  // to find them (wave 13y round 17). The stored state is still asked here, of those rows.
  const mayStillBeGoing = inArray(sql`json_extract(${records.data}, '$.state')`, [...STILL_GOING_STATES])
  const ids = input.sessionIds ?? theSessionIdsWhere(input.workspaceId, (one) => saysStillGoing(one.state))
  for (const row of listRecords({ workspaceId: input.workspaceId, kind: 'session', ids, alsoWhere: mayStillBeGoing })) {
    if (!stillGoing(row)) continue
    if (theRowNamesAnotherMachine(row)) continue
    if (theRecordedProcessOf(row).pid !== null) continue
    const directory = theRecordedCheckoutOf(row)
    if (directory === null || existsSync(directory)) continue
    patchRecord(row.id, { dataPatch: theDirectoryGoneRowPatch(directory, stamp) }, input.actor)
    closed.push(row.id)
  }
  return closed
}

/** One lazy docker listing and one inspection per missing name, shared by every project in this pass. */
export function theSandboxContainerReadingsForAPass(): (name: string) => OsContainerState {
  const probe = osProbe()
  let listing: OsContainers | undefined
  const readings = new Map<string, OsContainerState>()
  return (name) => {
    const kept = readings.get(name)
    if (kept !== undefined) return kept
    listing ??= probe.containers()
    let reading: OsContainerState
    if (!listing.available) reading = { ok: false, reason: listing.reason }
    else if (listing.containers.some(one => one.name === name)) reading = { ok: true, state: 'running' }
    else if (probe.containerState === undefined) reading = { ok: false, reason: `the ${probe.platform} probe cannot inspect container ${name}` }
    else reading = probe.containerState(name)
    readings.set(name, reading)
    return reading
  }
}

/** Close runs whose sandbox stopped. An unreadable container leaves the run unchanged and names the reason. */
export function closeTheRunsWhoseSandboxContainerStopped(input: {
  workspaceId: string
  actor: Actor
  now: Date
  readContainer: (name: string) => OsContainerState
  /** A superset shared by the minute pass. Each candidate still has to match the database filter. */
  sessionIds?: string[]
}): { closed: string[]; problems: string[] } {
  const result: { closed: string[]; problems: string[] } = { closed: [], problems: [] }
  const ids = input.sessionIds ?? theSessionIdsWhere(input.workspaceId, one => saysStillGoing(one.state))
  const candidates = and(
    inArray(sql`json_extract(${records.data}, '$.state')`, [...STILL_GOING_STATES]),
    sql`json_type(${records.data}, '$.sandbox.container') = 'text' AND json_extract(${records.data}, '$.sandbox.container') <> ''`,
  )
  for (const row of listRecords({ workspaceId: input.workspaceId, kind: 'session', ids, alsoWhere: candidates })) {
    if (!stillGoing(row)) continue
    // A RUN ON ANOTHER COMPUTER names a container this computer's docker does not have, as the two closers above skip it.
    if (theRowNamesAnotherMachine(row)) continue
    const sandbox = row.data['sandbox'] as { container: string }
    const container = ledgerRowById(sandbox.container, input.workspaceId)
    if (container === null || container.type !== 'container') {
      result.problems.push(`run ${row.id} has no container row for its sandbox ${sandbox.container}`)
      continue
    }
    const reading = input.readContainer(container.key)
    if (!reading.ok) {
      result.problems.push(`run ${row.id}: ${reading.reason}`)
      continue
    }
    if (reading.state === 'running') continue
    const closedBecause = reading.state === 'stopped'
      ? `its sandbox container ${container.key} stopped at ${localStamp(new Date(reading.finishedAt))} with exit ${reading.exitCode}`
      : `docker no longer has its sandbox container ${container.key}, so how it ended is not known`
    patchRecord(row.id, { dataPatch: {
      state: 'crashed', closedAt: localStamp(input.now), closedBecause,
      closedHow: 'went-stale' satisfies ClosedHow,
    } }, input.actor)
    result.closed.push(row.id)
  }
  return result
}
