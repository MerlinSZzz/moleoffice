// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY LISTENER ON THIS MACHINE THAT LOOKS LIKE A MOLE OFFICE, NAMED — AND NEVER STOPPED.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE OBEYS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F1 of design/ground/ACCEPTANCE.md:
 *
 * Naming only. The owner sometimes starts an agent for something unrelated to this project, and a rule
 * that kills whatever is unregistered once a clock runs out is too wide.
 *
 * So: **there is no timer in this file and it sends no signal.** It reads the machine when it is
 * asked, says what each listener is and who owns it, and stops. The one door that signals is
 * `rowForStop` at the bottom, and it opens only when four things are true at once: a live ledger
 * row, a row that says Mole Office itself started the process, an owning session that has ended,
 * and a person pressing with a reason. Anything unregistered is never stopped by the product,
 * whatever else is true of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The ledger says what somebody wrote down. On 1 September 2026 a test stack held ports 29601 and
 * 29602 on a temporary database for a day and a half, nobody had written it down, and so nobody's
 * list had it; it was found and stopped by hand on 2 September. Four `tsx watch` supervisors raced
 * for one port in a single session, which changed hands three times. A worktree's Vite rewrote the
 * dependency cache the owner's own server was reading, and a verifier registered another session's
 * process as its own.
 *
 * A list that reads only the ledger cannot see any of that. This one reads the machine as well, and
 * says which of the two it heard each row from.
 */

import { nowStamp } from '@shared/time.ts'
import type { Unreadable, World } from '@shared/runtime.ts'
import { ENV_FILE, settings } from '../../config/settings.mjs'
import { getRecord } from './records.ts'
import { PanelError } from './panel-error.ts'
import {
  type LedgerEntry,
  type OsPort,
  type SessionView,
  liveKeysOfType,
  liveRowById,
  moleOfficePartOf,
  osProbe,
  registrationOfPort,
  registrationOfProcess,
  theRowIsAboutThisProcess,
  theSessionIsTheProcess,
} from './resources.ts'
import { worldNow } from './runtime.ts'
import { worldsHere } from './office.ts'
import type { World as OfficeWorld } from '@shared/worlds.ts'
import { worldKindWord } from '@shared/words.ts'
import { participantWord } from '@shared/participants.ts'
import { clientsFromOtherMachines, type ClientFromAnotherMachine } from './usage-reads.ts'

/** A place to collect what a read could not answer, so that null is never bare. */
class Gaps {
  readonly list: Unreadable[] = []
  note(what: string, why: string): null {
    this.list.push({ what, why })
    return null
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** One listener on this machine that looks like a Mole Office, and who owns it. */
export interface Listener {
  port: number
  /** The address it is bound to, as the kernel reports it. */
  address: string
  pid: number | null
  pgid: number | null
  /** The command line, when this user may read it. Null when it could not be read. */
  command: string | null
  /** When the process started, local wall-clock. Null when it could not be read. */
  startedAt: string | null
  /** Why this listener is in the list at all. Every reason that applies. */
  caughtBy: string[]
  /** True when a live ledger row names this process or this port. */
  registered: boolean
  /** One sentence a person reads: who owns it and what it serves, or that nobody claims it. */
  says: string
  /** The world the ledger row records, when a row does. Null when unregistered or unrecorded. */
  world: World | null
  sessionRecordId: string | null
  sessionTitle: string | null
  /** Whether the owning session has ended. Null when unregistered. */
  ownerEnded: boolean | 'unknown' | null
  /** The ledger row, when there is one. */
  resourceId: string | null
  /**
   * Every live world in the list of worlds this server keeps whose loopback address is on this port.
   * Empty when no world says it answers here. A world's row is what the world said when it
   * registered; it is not a ledger row, and it does not make the listener registered.
   */
  worldsOnThisPort: WorldOnAPort[]
  /**
   * Whether this row could be stopped from the product by a press. False for everything the
   * product did not start, whatever else is true of it.
   */
  stoppable: boolean
  /** Why it cannot be stopped. Null exactly when `stoppable` is true. */
  notStoppableBecause: string | null
}

/** A live world that says it answers on a listener's port, as its row in the list of worlds records it. */
export interface WorldOnAPort {
  id: string
  name: string
  kind: string
  /** Who the row says started it, as stored. Null because nobody recorded who. */
  startedBy: OfficeWorld['startedBy']
  address: string
}

/** Every Mole Office-looking listener, named. Nothing here signals anything. */
export interface ListenerReport {
  readAt: string
  /** This server's own world, so a reader can tell which stack answered the question. */
  answeredBy: World
  listeners: Listener[]
  /** How a listener came to be in the list. Stated so an empty list can be read honestly. */
  lookedFor: string[]
  /**
   * WHO HAS REACHED THIS API FROM OFF THIS MACHINE, one entry per address.
   *
   * Beside the listeners because it is the other half of the same question. The list above says
   * which doors are open; this says who has come through one of them from somewhere else. An empty
   * list means nobody has, which is the ordinary state and is a reading rather than a gap.
   *
   * It is derived from the call log the API already keeps, so nothing about anybody is stored to
   * make it. `clientsFromOtherMachines` in src/server/lib/usage-reads.ts is the one place it is
   * worked out, and `GET /api/runtime` reports the same list from the same function rather than
   * from a second query that could come to disagree with this one.
   */
  fromOtherMachines: ClientFromAnotherMachine[]
  couldNotRead: Unreadable[]
}

/**
 * EVERY LISTENER ON THIS MACHINE THAT LOOKS LIKE A MOLE OFFICE, NAMED AND NEVER STOPPED.
 *
 * FOUR THINGS MAKE A LISTENER "LOOK LIKE" ONE, and each row says which caught it:
 *
 * 1. **A port this checkout's settings declare** — the API port and the browser app's port.
 * 2. **A port some live ledger row names.** A scratch stack on 29601 is a Mole Office because a
 *    session said so, whatever its port number is.
 * 3. **A process on loopback whose command line is this repository's server or its Vite.** This is
 *    the one that catches the case the ledger cannot: on 1 September 2026 a test stack held 29601
 *    and 29602 over a temporary database for a day and a half and nobody's list had it.
 *
 * 4. **A live world records a loopback address on this port.** Its record supplies its name and starter.
 *
 * IT NAMES, IT NEVER STOPS. The owner's F1 answer of 3 September 2026: naming only, because the owner
 * sometimes starts an agent for something unrelated and a rule that kills whatever is unregistered
 * after a timeout is too wide. There is no timer in this function and it sends no signal.
 */
export function listenersOnThisMachine(workspaceId: string): ListenerReport {
  const gaps = new Gaps()
  const probe = osProbe()
  // THE CHECKOUT'S SETTINGS, NOT THIS PROCESS'S. `settings()` reads the environment this server was
  // started with, so a scratch server on 38675 would have called 38675 "the port this checkout's
  // settings declare" — a sentence that is false, and one `standing` in runtime.ts disagreed with,
  // because it reads the file. Measured on 3 September 2026 on this builder's own stack. The file
  // is what "this checkout declares" means; what this process was told is the fourth reason below.
  const declared = settings({}, ENV_FILE)
  const mine = settings()
  const lookedFor = [
    `the ports this checkout's .env declares: ${String(declared.apiPort)} (the API) and ` +
      `${String(declared.webPort)} (the browser app)`,
    `the ports the server answering you was told to take: ${String(mine.apiPort)} (its API) and ` +
      `${String(mine.webPort)} (its browser app)`,
    'every port a live row in the “Running on this machine” list names, in any project',
    "every process listening on 127.0.0.1 whose command line is this repository's server or its Vite",
    'every port a live world in the list of worlds this server keeps says it answers on',
  ]

  let ports: OsPort[] = []
  try {
    ports = probe.listeningPorts()
  } catch (err) {
    gaps.note('the listening sockets', `They could not be read (${messageOf(err)}), so this list may be short.`)
  }

  const registeredPorts = new Set(livePortKeys())
  const worldsByPort = liveWorldsByPort(gaps)
  const listeners: Listener[] = []
  for (const p of ports) {
    const caughtBy: string[] = []
    if (p.port === declared.apiPort) caughtBy.push("it is the API port this checkout's .env declares")
    if (p.port === declared.webPort) caughtBy.push("it is the browser app's port this checkout's .env declares")
    if (p.port === mine.apiPort && p.port !== declared.apiPort) {
      caughtBy.push('it is the API port the server answering you was told to take')
    }
    if (p.port === mine.webPort && p.port !== declared.webPort) {
      caughtBy.push("it is the browser app's port the server answering you was told to take")
    }
    if (registeredPorts.has(String(p.port))) caughtBy.push('a live row in the “Running on this machine” list names this port')
    const worldsOnThisPort = worldsByPort.get(p.port) ?? []
    if (worldsOnThisPort.length > 0) caughtBy.push('a live world in the list of worlds this server keeps says it answers on this port')

    let proc = null
    if (p.pid !== null) {
      try {
        proc = probe.processById(p.pid)
      } catch (err) {
        gaps.note(`the process holding port ${String(p.port)}`, `It could not be read (${messageOf(err)}).`)
      }
    }
    const part = proc === null ? null : moleOfficePartOf(proc.command)
    const onLoopback = p.address === '127.0.0.1' || p.address === '::1' || p.address === 'localhost'
    if (part !== null && onLoopback) caughtBy.push(`its command line is ${part}`)
    if (caughtBy.length === 0) continue

    const registration = p.pid === null ? null : registrationOfProcess(p.pid, proc?.pgid ?? null)
    // A PORT ROW OWNS A LISTENER ONLY WHILE IT IS STILL ABOUT THE SAME PROCESS.
    //
    // Measured on 3 September 2026: a row registered on 2 September claimed port 5173 with pid
    // 4047726, that process was long gone, and something else held the port — and this list said
    // "registered by ..." over it. That is worse than saying nothing, because the whole point of
    // the list is to tell an owned listener from an unowned one.
    //
    // The test is the ledger's own, from `serversOnThisMachine`: a row is about this process when
    // the start time it recorded is the start time the process reports now. A pid is reused; a pid
    // and a start time together are not.
    const portRow = registrationOfPort(p.port)
    const portRowMatches = portRow !== null && portRowStillMatches(portRow.entry, proc?.startedAt ?? null)
    const staleClaim = portRow !== null && !portRowMatches ? portRow : null
    const row =
      registration ??
      (portRowMatches && portRow !== null
        ? { entry: portRow.entry, session: portRow.session, startedByTheProduct: portRow.entry.startedByTheProduct }
        : null)
    const stop =
      row === null && worldsOnThisPort.length > 0
        ? 'no live ledger row names it, and a world’s row is not a ledger row; Mole Office never stops what it did not start'
        : whyNotStoppable(row)
    listeners.push({
      port: p.port,
      address: p.address,
      pid: p.pid,
      pgid: proc?.pgid ?? null,
      command: proc?.command ?? null,
      startedAt: proc?.startedAt ?? null,
      caughtBy,
      registered: row !== null,
      says: sentenceFor(p.port, proc?.pid ?? p.pid, row, staleClaim, worldsOnThisPort),
      world: row?.entry.world ?? null,
      sessionRecordId: row?.entry.sessionRecordId ?? null,
      sessionTitle: row?.session.title ?? null,
      ownerEnded: row?.session.ended ?? null,
      resourceId: row?.entry.id ?? null,
      worldsOnThisPort,
      stoppable: stop === null,
      notStoppableBecause: stop,
    })
  }
  // The workspace is taken and not used to filter: a listener registered by another project is
  // still registered, and reporting it as UNOWNED because the question was asked from the wrong
  // project would be the worst possible wrong answer.
  void workspaceId
  return {
    readAt: nowStamp(),
    answeredBy: worldNow(),
    listeners: listeners.sort((a, b) => a.port - b.port),
    lookedFor,
    fromOtherMachines: clientsFromOtherMachines(),
    couldNotRead: gaps.list,
  }
}

/** One sentence about a listener: what owns it and what it serves, or that nobody claims it. */
function sentenceFor(
  port: number,
  pid: number | null,
  row: { entry: LedgerEntry; session: SessionView } | null,
  staleClaim: { entry: LedgerEntry; session: SessionView } | null,
  worlds: readonly WorldOnAPort[],
): string {
  const where = `port ${String(port)}${pid === null ? '' : `, pid ${String(pid)}`}`
  if (row === null) {
    const claim =
      staleClaim === null
        ? ''
        : ` A row registered at ${staleClaim.entry.registeredAt} by ` +
          `${staleClaim.session.title ?? staleClaim.session.recordId} still names this port, and it has stopped ` +
          'matching: the process holding it now is not the one that row was written about.'
    if (worlds.length > 0) {
      return `world ${worlds.map(aWorldSaid).join('; ')} — ${where}. ` +
        `No live ledger row claims this listener, so Mole Office will not stop it.${claim}`
    }
    return (
      `UNOWNED — ${where} is held by something no live ledger row claims. Mole Office names it and ` +
      `will not stop it.${claim}`
    )
  }
  const what = whatTheRowSaysItServes(row.entry.world)
  const who = row.session.title ?? row.session.recordId
  const ended = row.session.ended === true ? ', whose session has ended' : row.session.ended === 'unknown' ? ', whose session cannot say whether it has ended' : ''
  return `registered by ${who}${ended} — ${where}, ${what}.` +
    (worlds.length === 0 ? '' : ` Worlds recorded on this port: ${worlds.map(aWorldSaid).join('; ')}.`)
}

/** One world on a port, in a phrase: its name, its kind, who its row says started it, and its address. */
function aWorldSaid(world: WorldOnAPort): string {
  const who =
    world.startedBy === null ? 'nobody recorded who started it' : `started by the ${participantWord(world.startedBy.kind)} ${world.startedBy.id}`
  return `${world.name} (${worldKindWord(world.kind).text}; ${who}; ${world.address})`
}

/**
 * EVERY LIVE WORLD IN THE LIST OF WORLDS THIS SERVER KEEPS, BY THE PORT OF ITS LOOPBACK ADDRESS.
 *
 * Only recorded HTTP addresses on loopback are used to name local ports. Other addresses say
 * nothing about a listener here. A list that cannot be read is named in `gaps`.
 */
function liveWorldsByPort(gaps: Gaps): Map<number, WorldOnAPort[]> {
  const out = new Map<number, WorldOnAPort[]>()
  let worlds: OfficeWorld[]
  try {
    worlds = worldsHere()
  } catch (err) {
    gaps.note('the list of worlds', `It could not be read (${messageOf(err)}), so no world is named on a port.`)
    return out
  }
  for (const world of worlds) {
    if (world.diedAt !== null || world.address === null) continue
    let url: URL
    try {
      url = new URL(world.address)
    } catch {
      continue
    }
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) continue
    const port = Number(url.port || (url.protocol === 'https:' ? '443' : '80'))
    const one: WorldOnAPort = { id: world.id, name: world.name, kind: world.kind, startedBy: world.startedBy, address: world.address }
    out.set(port, [...(out.get(port) ?? []), one])
  }
  return out
}

/**
 * WHAT A ROW SAYS THE THING IT NAMES IS SERVING.
 *
 * A row may carry the database as a PATH or as an IDENTITY, and which one it has says how the world
 * was come by. A process that read its own world has the path. A process that read the world off a
 * reply has the identity, because the header carries an identity on purpose — the top of
 * src/config/world-header.mjs says why. Both are real answers and this prints whichever is there.
 *
 * A row with no world at all says so. That sentence used to be printed for every row on the
 * canonical ledger, because `POST /api/resources` recorded no world at all; problem `oRrML6lgPNnr`.
 * It is still printed, and it still means the same thing: nobody recorded one.
 *
 * A ROW WRITTEN BEFORE 4 SEPTEMBER 2026 HAS NEITHER FIELD SPELLED THE NEW WAY. Its stored JSON was
 * written against the older shape, which had `database` and no `databaseIdentity`, so both are read
 * defensively rather than trusted to be there.
 */
export function whatTheRowSaysItServes(world: World | null): string {
  if (world === null) return 'and the row does not record which world it serves'
  const database =
    world.database !== null && world.database !== undefined
      ? world.database
      : world.databaseIdentity !== null && world.databaseIdentity !== undefined
        ? `the database whose identity is ${world.databaseIdentity}`
        : 'a database nobody could read'
  const at = world.head === null || world.head === undefined ? '' : ` at ${world.head}`
  return `serving ${database} from ${world.repository}${at} (${world.standing.kind})`
}

/**
 * Whether a port row is still about the process holding that port.
 *
 * A pid is reused. A pid AND a start time together are not, which is why the ledger records the
 * start time when the row is written. A row registered when nothing was listening has no start time
 * to compare with, and the honest answer there is no: it identifies nothing.
 *
 * The same rule `serversOnThisMachine` uses for a port claim, written once so the two lists cannot
 * disagree about whose a port is.
 */
export function portRowStillMatches(entry: LedgerEntry, holderStartedAt: string | null): boolean {
  if (holderStartedAt === null) return false
  // `theRowIsAboutThisProcess` is the one comparison, in src/config/process-reader.mjs. It is given
  // no `directoryChangedAt` here because the caller has a time and not a process, so a row stamped
  // by the reading used before 3 September 2026 reads as a different process until something that
  // holds the whole process re-stamps it — which `livenessOf` does the first time the row is read.
  return theRowIsAboutThisProcess(entry.osStartedAt, { startedAt: holderStartedAt }).same === true
}

/** Why a row may not be stopped from the product, or null when it may. */
function whyNotStoppable(
  row: { entry: LedgerEntry; session: SessionView } | null,
): string | null {
  if (row === null) {
    return 'nothing registered it, and Mole Office never stops what it did not start'
  }
  if (row.entry.startedByTheProduct !== true) {
    return 'the row does not say Mole Office started it, and "nobody wrote it down" is not permission'
  }
  if (row.session.ended !== true && !theSessionIsTheProcess(row.entry.sessionRecordId)) {
    return row.session.ended === 'unknown'
      ? 'its session record cannot say whether the session has ended'
      : 'the session that started it is still going, and its own server is its own business'
  }
  return null
}

/** True when this row is one Mole Office started and its session is still going, so a stop must force. */
export function stoppingThisInterruptsItsOwnSession(row: { entry: LedgerEntry; session: SessionView }): boolean {
  return row.session.ended !== true && theSessionIsTheProcess(row.entry.sessionRecordId)
}

/** Every port key a live ledger row names, in any project. */
function livePortKeys(): string[] {
  return liveKeysOfType('port')
}

/**
 * THE ROW A PRESS MAY STOP, or a refusal saying which of the four things was not true.
 *
 * The four, from the owner's F1 answer: the row is live, the row says Mole Office started the
 * process, the owning session has ended, and a person pressed. The fourth is the caller's
 * business; the first three are asked here.
 */
export function rowForStop(resourceId: string, workspaceId: string): { entry: LedgerEntry; session: SessionView } {
  const found = liveRowById(resourceId, workspaceId)
  if (found === null) {
    throw new PanelError(
      `No live resource ${resourceId} in this project. A stop names a ledger row, never a pid: Mole Office ` +
        'will not signal a process it has no record of starting.',
      404,
    )
  }
  const why = whyNotStoppable(found)
  if (why !== null) {
    throw new PanelError(
      `Mole Office will not stop ${resourceId}: ${why}. The rule is that the product ` +
        'names what it did not start and never stops it. Stop it yourself by process group if it is yours.',
      409,
    )
  }
  return found
}
