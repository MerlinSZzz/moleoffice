// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `toEntry` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `parseWorld` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `readRows` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `theProcessesTheRowsRead` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `theStarterIsAskedAbout` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `oneReadingPerListing` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `ageSince` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `reportForAReleasedRow` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `ageOrNull` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `sessionViewOf` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `TERMINAL_STATES` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `parseLocalTime` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `restampRowWrittenByTheOldReading` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `isSessionState` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `humanAge` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `gpuMemoryFor` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `processLiveness` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `endTimeFromChangeLog` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `orphanedSince` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `ORPHAN_REPORT_ALSO_COUNTS` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `whatAnEndedPidLeftRunning` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * `theContainerCalled` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ResourceType, LedgerRow, LedgerEntry, AProcessToRead, OsPort, OsGpu, OsContainers, OsProbe, Age, ResourceReport, SessionView, Liveness } from '../lib/resources.ts'
import type { World } from '@shared/runtime.ts'
import { join } from 'node:path'
import { sqlite } from './client.ts'
import { PanelError } from '../lib/panel-error.ts'
import { now } from '@shared/now.ts'
import { SESSION_STATES, type PanelRecord, type SessionState } from '@shared/types.ts'
import { getRecord } from '../lib/records/reading.ts'
import { THE_LEDGER_COUNTS_A_SESSION_OVER_IN } from '../../config/the-ledgers-ended-states.mjs'
import { parseStoredStamp } from '@shared/time.ts'
import { theRowIsAboutThisProcess } from '../../config/process-reader.mjs'
import { startedByThatStarter } from '../../config/systems/windows-groups.mjs'
import { TERMINAL_STATES } from '../lib/terminal-states.ts'

export function toEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    sessionRecordId: row.session_record_id,
    // SQLite has no enum column, and the narrow union is enforced on the way in by
    // registerResource, which is why widening here is safe.
    type: row.type as ResourceType,
    key: row.key,
    pgid: row.pgid,
    osStartedAt: row.os_started_at,
    detail: row.detail,
    registeredAt: row.registered_at,
    registeredBy: row.registered_by,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    releaseNote: row.release_note,
    world: parseWorld(row.world),
    startedByTheProduct: row.started_by_the_product === null ? null : row.started_by_the_product === 1,
  }
}
/**
 * The stored world, or null.
 *
 * A row whose JSON will not parse is a row whose world nobody can read, and that is `null` with the
 * same meaning as an absent one: nobody recorded this. It is not repaired and it is not guessed at,
 * and it never stops the row itself from being listed — a resource nobody can describe is still a
 * resource somebody is holding.
 */
export function parseWorld(stored: string | null): World | null {
  if (stored === null) return null
  try {
    return JSON.parse(stored) as World
  } catch {
    return null
  }
}
export function readRows(opts: {
  workspaceId: string
  id?: string
  sessionRecordId?: string
  includeReleased?: boolean
  type?: ResourceType
  pgid?: number
}): LedgerRow[] {
  const where = ['workspace_id = ?']
  const args: unknown[] = [opts.workspaceId]
  if (opts.id !== undefined) {
    where.push('id = ?')
    args.push(opts.id)
  }
  if (opts.sessionRecordId !== undefined) {
    where.push('session_record_id = ?')
    args.push(opts.sessionRecordId)
  }
  if (opts.type !== undefined) {
    where.push('type = ?')
    args.push(opts.type)
  }
  if (opts.pgid !== undefined) {
    where.push('pgid = ?')
    args.push(opts.pgid)
  }
  if (!opts.includeReleased) where.push('released_at IS NULL')
  return sqlite
    .prepare(`SELECT * FROM session_resources WHERE ${where.join(' AND ')} ORDER BY registered_at DESC, id DESC`)
    .all(...args) as LedgerRow[]
}
/** The processes the liveness of these rows reads, for `readFirst`. */
export function theProcessesTheRowsRead(entries: readonly LedgerEntry[]): AProcessToRead[] {
  return entries
    .filter((entry) => entry.type === 'process')
    .map((entry) => ({ pid: Number(entry.key), alsoItsStarterIfEnded: theStarterIsAskedAbout(entry) }))
}
/** Whether the liveness of a row whose pid has ended asks what a starter with that pid left running. */
export function theStarterIsAskedAbout(entry: LedgerEntry): boolean {
  return entry.startedByTheProduct === true && entry.osStartedAt !== null
}
/**
 * THE MACHINE, WITH ONE READING OF EACH OF ITS LISTS FOR A WHOLE LISTING: the listening sockets, the
 * running containers and the GPU's compute processes.
 *
 * A port row used to read /proc/net/tcp and /proc/net/tcp6 for itself, so a listing of the ledger read
 * them once per port row: 78 times for the 76 live rows of the office at the live scale, which was 209
 * of the 252 ms GET /api/resources took (wave 13y round 14). This probe takes the reading when the first
 * port row asks, with its owners, and answers every later port row of the same listing from it.
 *
 * THE CONTAINERS AND THE GPU THE SAME WAY (wave 13y round 22). A container row ran `docker ps` for itself
 * and a GPU row ran `nvidia-smi`, each a program the office's one thread waits on. The owner's office had
 * 25 container rows among its 46 live ones on 11 October 2026, so a listing ran `docker ps` 25 times:
 * GET /api/resources took a median of 1.4 s and up to 3.4 s there, with 3 ms of it in SQLite, and the
 * session hook's read of it ran out of time after a compaction. Now the first row of each list asks and
 * the rest of the listing is answered from that reading.
 *
 * EVERY LISTENING SOCKET FROM THE SAME READING (wave 13y round 67). The orphans door hands this probe to
 * its views and to its sweep of what no row claims (`unclaimedSweep`), and the sweep asks for every
 * socket. Each caller is handed its own copy of the list, so none can change what the next one reads.
 *
 * IT LIVES FOR ONE LISTING AND NO LONGER. Each caller makes one at the start of a request, so a reading
 * is never kept between requests and no report says a port is held, or a container is running, because
 * it was a request ago. Every other question goes to the machine as it did.
 */
export function oneReadingPerListing(machine: OsProbe): OsProbe {
  let ports: OsPort[] | null = null
  let containers: OsContainers | null = null
  let gpu: OsGpu | null = null
  const listeningOn = (port: number): OsPort[] => {
    ports ??= machine.listeningPorts()
    return ports.filter((one) => one.port === port)
  }
  const once: Partial<OsProbe> = {
    listeningPorts: () => [...(ports ??= machine.listeningPorts())],
    listeningOn,
    containers: () => (containers ??= machine.containers()),
    gpu: () => (gpu ??= machine.gpu()),
  }
  return new Proxy(machine, {
    get: (target, name, receiver) => (Object.hasOwn(once, name) ? once[name as keyof OsProbe] : Reflect.get(target, name, receiver)),
  })
}
/**
 * The age of a timestamp this server wrote.
 *
 * An unparseable value throws rather than reporting zero: every timestamp reaching here was
 * written by `now()` above, so a broken one means the row is corrupt, and "0 seconds old" would
 * make a week-old orphan look like it had only just started.
 */
export function ageSince(ts: string, what: string): Age {
  const age = ageOrNull(ts)
  if (age === null) {
    throw new PanelError(`The stored timestamp for ${what} is "${ts}", which is not a time.`, 500)
  }
  return age
}
/**
 * THE REPORT FOR A CLOSED ROW: NOTHING IS LOOKED AT, AND IT SAYS SO.
 *
 * A released row is finished. The session gave the resource up, and when, who did it and what they
 * said about it are all stored on the row itself. So this reads nothing: no process, port,
 * container, lock or GPU is checked, and the session record is not read either. `liveness` and
 * `session` both say that nobody looked, because a closed row answering "gone" would be reporting
 * a reading that was never taken.
 *
 * WHY, MEASURED. `GET /api/resources?includeReleased=true` took 20 to 26 seconds on the owner's own
 * office on 24 September 2026, and the office answers one request at a time, so everything else
 * waited: `/api/presence` for 24.7 seconds, `/api/messages` for 24.8 (finding 67, block f-67 of
 * record EnJvvsDTF_Dx). Measured on 24 September 2026 on a ledger built to the same size — 3,433
 * rows, 3,400 of them released, 33 live: checking every row took 7.4 seconds and leaving the closed
 * rows alone took 76 ms, over the same 3 ms of SQL. Checking every row asked the machine 3,433
 * questions; leaving the closed rows alone asked it 33. Of the 7.4 seconds, the session records
 * were 0.18 and the machine was the rest. The owner's office is slower again because it runs
 * docker, and every container row spawned `docker ps` then; a listing runs it once now (`oneReadingPerListing`).
 *
 * A caller that does want the machine read for the released rows asks for it: `listResources` takes
 * `alsoCheckReleasedRows`, and one caller sends it.
 */
export function reportForAReleasedRow(entry: LedgerEntry, releasedAt: string): ResourceReport {
  const closed = `This row was released at ${releasedAt}`
  return {
    ...entry,
    liveness: {
      state: 'unknown',
      // Short on purpose, and said on every released row. The whole history of a busy ledger comes
      // back in one reply, so a paragraph here is megabytes of the same paragraph.
      reason: `${closed}, so nothing on this machine was checked for it.`,
    },
    age: ageSince(entry.registeredAt, `resource ${entry.id}`),
    session: {
      recordId: entry.sessionRecordId,
      title: null,
      state: null,
      ended: 'unknown',
      endedAt: null,
      endedAtSource: null,
      note: `${closed}, so its session record was not read.`,
    },
    orphanedFor: null,
    gpuMemory:
      entry.type !== 'gpu' ? null : { unknown: `${closed}, so nvidia-smi was not read for it.` },
  }
}
/**
 * The age of a timestamp, or null when the text is not one.
 *
 * Null rather than zero, everywhere: "0 seconds old" is a reading, and a reading is what a
 * person acts on. This is the shared half of the two callers below — one of which must refuse an
 * unreadable time and one of which must survive it.
 */
export function ageOrNull(ts: string): Age | null {
  const then = parseLocalTime(ts)
  if (then === null) return null
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  return { seconds, human: humanAge(seconds) }
}
// THE RECORD MAY BE HANDED IN, read with the records of the other rows of one listing (`listResources`). Undefined is
// "not read yet"; null is "read, and there is none".
export function sessionViewOf(recordId: string, read?: PanelRecord | null): SessionView {
  const record = read === undefined ? getRecord(recordId) : read
  if (!record) {
    return {
      recordId,
      title: null,
      state: null,
      ended: 'unknown',
      endedAt: null,
      endedAtSource: null,
      note:
        `The session record ${recordId} is not in the database any more, so whether it ended cannot be read. ` +
        'Whatever it started is unowned either way.',
    }
  }
  if (record.deletedAt) {
    return {
      recordId,
      title: record.title,
      state: isSessionState(record.data.state) ? record.data.state : null,
      ended: true,
      // deleteRecord writes deletedAt and updatedAt in the same breath, so this is exactly the
      // moment the record was last written, and saying so is more accurate than claiming the
      // change log was read for a state transition that never happened.
      endedAt: record.deletedAt,
      endedAtSource: 'the session record was last written then',
      note: 'The session record was deleted, so nothing owns what it started.',
    }
  }
  const state = record.data.state
  if (!isSessionState(state)) {
    return {
      recordId,
      title: record.title,
      state: null,
      ended: 'unknown',
      endedAt: null,
      endedAtSource: null,
      note:
        `The session record "${record.title}" has no readable state (${JSON.stringify(state)}), so whether it ` +
        `ended cannot be told. Set one of: ${SESSION_STATES.join(', ')}.`,
    }
  }
  if (!TERMINAL_STATES.includes(state)) {
    return { recordId, title: record.title, state, ended: false, endedAt: null, endedAtSource: null, note: null }
  }
  const fromLog = endTimeFromChangeLog(recordId)
  return {
    recordId,
    title: record.title,
    state,
    ended: true,
    // updatedAt is a weaker answer than the change log — a later edit to any field moves it —
    // so which one was used is reported rather than hidden behind one field name.
    endedAt: fromLog ?? record.updatedAt,
    endedAtSource: fromLog ? 'the change log' : 'the session record was last written then',
    note:
      fromLog === null
        ? 'No change row records this session reaching a terminal state, so the time it was last written is used instead.'
        : null,
  }
}
export { TERMINAL_STATES } from '../lib/terminal-states.ts'
/**
 * Read one of our own timestamps back into milliseconds.
 *
 * Never handed to `new Date(string)`, because the stored form has a space rather than a T and
 * engines disagree about whether that is local or UTC. An hour's error in an age reading is the
 * difference between "just now" and "left overnight" — and that is not hypothetical: the browser
 * copy of this rule had that exact bug for two months.
 *
 * One line, because the rule now lives once in `@shared/time.ts`. The strict variant is the right
 * one here: everything this file reads was written by `localStamp`, so a value that is merely
 * date-shaped means something is wrong and should be reported rather than accommodated.
 */
export const parseLocalTime = parseStoredStamp
/**
 * Write the real start time onto a row that was stamped by the old reading.
 *
 * ONE COLUMN, ON A ROW THAT IS ALREADY ABOUT THIS PROCESS. It corrects a reading of the machine,
 * not anything a person or an agent wrote, so it is not a change worth a change-log entry and
 * there is no actor to attribute one to. It IS said out loud: every caller that takes this branch
 * prints the sentence `theRowIsAboutThisProcess` returned.
 *
 * It happens on a read because there is nowhere else to put it. A migration cannot do it — the
 * corrected start time is a fact about a process running now, which is not in the database — and a
 * row nobody reads does not need correcting.
 */
export function restampRowWrittenByTheOldReading(rowId: string, realStartedAt: string): void {
  sqlite
    .prepare(`UPDATE session_resources SET os_started_at = ? WHERE id = ? AND released_at IS NULL`)
    .run(realStartedAt, rowId)
}
export function isSessionState(v: unknown): v is SessionState {
  return typeof v === 'string' && (SESSION_STATES as readonly string[]).includes(v)
}
export function humanAge(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (seconds < 60) return plural(seconds, 'second')
  if (seconds < 3600) return plural(Math.floor(seconds / 60), 'minute')
  if (seconds < 86400) return plural(Math.floor(seconds / 3600), 'hour')
  return plural(Math.floor(seconds / 86400), 'day')
}
export function gpuMemoryFor(entry: LedgerEntry, probe: OsProbe): ResourceReport['gpuMemory'] {
  if (entry.type !== 'gpu') return null
  const reading = probe.gpu()
  if (!reading.available) return { unknown: reading.reason }
  const held = reading.processes.find((p) => p.pid === Number(entry.key))
  if (!held) return { unknown: `nvidia-smi lists no compute process with pid ${entry.key}.` }
  return { usedMib: held.usedMib }
}
export function processLiveness(entry: LedgerEntry, probe: OsProbe): Liveness {
  const pid = Number(entry.key)
  const live = probe.processById(pid)
  if (!live) return whatAnEndedPidLeftRunning(entry, pid, probe)
  // No anchor, no verdict. `registerResource` refuses a process or GPU row whose pid is not
  // running and stores the start time in the same breath, so a row that reaches here without one
  // came back from an import -- and FORMAT.md 2.2 drops `os_started_at` on purpose, because
  // restoring a three-week-old process group is precisely how a stale reading is manufactured.
  // Without it, Mole Office can see that the number is in use and cannot see whether it is in use by
  // the same program. Saying `alive` here would be the anti-reuse check disappearing and the word
  // that means "checked, and it is the one you started" being returned in its place.
  if (entry.osStartedAt === null) {
    return {
      state: 'unknown',
      reason:
        `Pid ${pid} is in use — "${live.command}", started ${live.startedAt} — but this ledger row carries no ` +
        `start time to compare that with, so Mole Office cannot tell whether it is the process this session started ` +
        `or a different program that has since been given the same number. A row with no start time was ` +
        `restored from an archive, which does not carry one. Check it by hand. A release will not signal it, and ` +
        `the session that registered it can close the row with {"signalNothing":true}.`,
    }
  }
  const match = theRowIsAboutThisProcess(entry.osStartedAt, live)
  if (match.same === false) {
    // The number came back round. This is a different program that happens to have the same
    // pid, and calling it alive would put a stranger on the kill list.
    return {
      state: 'gone',
      detail:
        `Pid ${pid} is in use again, but by a process that started at ${live.startedAt} rather than ` +
        `${entry.osStartedAt}: "${live.command}". The one this session started has exited.`,
    }
  }
  const alive = `pid ${pid}, process group ${live.pgid} — ${live.command}`
  if (match.same === true && match.stampedTheOldWay) {
    restampRowWrittenByTheOldReading(entry.id, live.startedAt)
    return { state: 'alive', detail: `${alive}. ${match.says}` }
  }
  return { state: 'alive', detail: alive }
}
/**
 * When a session record reached a terminal state, read from the change log.
 *
 * Two shapes have to be handled because both are written today: `patchRecord` logs one row per
 * JSON path for a merge patch (`data.state`), and one row holding the whole object for a
 * wholesale `data` write, which is what the browser sends. Looking only at `data.state` would
 * silently miss every session ended from the browser and date it from `updatedAt` instead.
 */
export function endTimeFromChangeLog(recordId: string, states: readonly SessionState[] = TERMINAL_STATES): string | null {
  const rows = sqlite
    .prepare(
      `SELECT field, new_value, at FROM changes
       WHERE record_id = ? AND (field = 'data.state' OR field = 'data')
       ORDER BY at DESC, rowid DESC`,
    )
    .all(recordId) as { field: string; new_value: string | null; at: string }[]

  let latest: string | null = null
  for (const row of rows) {
    const value = row.new_value
    if (value === null) continue
    let state: unknown = null
    if (row.field === 'data.state') {
      state = value
    } else {
      try {
        const parsed: unknown = JSON.parse(value)
        if (typeof parsed === 'object' && parsed !== null) state = (parsed as Record<string, unknown>).state
      } catch {
        continue
      }
    }
    if (isSessionState(state) && states.includes(state)) {
      // Rows come back newest first, so the first match is the moment it ended.
      latest = row.at
      break
    }
  }
  return latest
}
/**
 * When the session stopped owning what it started: when it ended, or, for a session the office marked
 * orphaned, when the change log says it was marked so. Null when neither is known.
 */
export function orphanedSince(session: SessionView): string | null {
  if (session.endedAt !== null) return session.endedAt
  return session.state === ORPHAN_REPORT_ALSO_COUNTS ? endTimeFromChangeLog(session.recordId, [ORPHAN_REPORT_ALSO_COUNTS]) : null
}
/**
 * The one state whose resources the orphan report lists as orphans although the session is not over
 * (decision P-0jFzJuFC19). Its age as an orphan is counted from when the change log says the session
 * was marked so.
 */
export const ORPHAN_REPORT_ALSO_COUNTS: SessionState = 'orphaned'
/**
 * A ROW THIS OFFICE STARTED, WHOSE PID HAS ENDED, IS ALIVE WHILE THE PROGRAM ITS STARTER STARTED RUNS. Windows only.
 *
 * On Windows the pid a row records is a starter's, and the starter ends before its program can
 * (`programsOfAnEndedStarter` on OsProbe says how). On a Windows 11 machine the message worker's run outlived the
 * server and the worker; at the next start the starter's pid read as gone, the row was released and the run was marked
 * as crashed while it ran. So a probe that can read a Job Object is asked, for a row this office started, whether a
 * child of the starter still runs in it. A child that started more than a second before the row's process is not the
 * one the row is about: the stamps hold whole seconds, as in `aProcessOlderThanItsSession`. That rule is
 * `startedByThatStarter` in src/config/systems/windows-groups.mjs, which the worker asks about a run it picks up.
 *
 * WHAT THIS DOES NOT TELL APART: a later starter given the same number, which has also ended, and whose program still
 * runs in a Job Object of the same name. Its program started after the row's, so it is read as the row's. Each such
 * reading costs one PowerShell more on Windows, for each read of the row until it is released.
 */
export function whatAnEndedPidLeftRunning(entry: LedgerEntry, pid: number, probe: OsProbe): Liveness {
  const gone: Liveness = { state: 'gone', detail: `Nothing is running as pid ${pid}.` }
  if (!theStarterIsAskedAbout(entry) || entry.osStartedAt === null || probe.programsOfAnEndedStarter === undefined) return gone
  const read = probe.programsOfAnEndedStarter(pid)
  if (!read.read) {
    return {
      state: 'unknown',
      reason: `Nothing is running as pid ${pid}, the starter this office ran, and whether the program it started still runs is unknown: ${read.reason}`,
    }
  }
  const rowMs = parseStoredStamp(entry.osStartedAt)
  if (rowMs === null) {
    return { state: 'unknown', reason: `Nothing is running as pid ${pid}, and the row's start time "${entry.osStartedAt}" cannot be read.` }
  }
  const program = read.programs.find((one) => {
    const ms = parseStoredStamp(one.startedAt)
    return ms !== null && startedByThatStarter(ms, rowMs)
  })
  if (program === undefined) return gone
  return {
    state: 'alive',
    detail:
      `Pid ${pid}, the starter this office ran, has ended, and the program it started runs on in the starter's Job Object: ` +
      `pid ${program.pid}, started ${program.startedAt} — ${program.command}`,
  }
}
/**
 * THE RUNNING CONTAINER A LEDGER KEY OR A CALLER NAMES, worked out in one place.
 *
 * A container is named by its name or by its full id, exactly: the two things `docker ps --no-trunc`
 * prints. A container row's liveness, its release, and a process named by its pid inside a container
 * all find their container this way, so a name that finds a container for one of them finds the same
 * container for the others.
 */
export function theContainerCalled<C extends { id: string; name: string }>(containers: readonly C[], ref: string): C | undefined {
  return containers.find((c) => c.name === ref || c.id === ref)
}
