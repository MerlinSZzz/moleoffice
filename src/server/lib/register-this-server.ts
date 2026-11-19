// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THIS SERVER WRITES ITSELF INTO THE LEDGER OF WHAT IS RUNNING, WITH THE WORLD IT SERVES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * Two callers do exactly this and they must not do it two ways. `POST /api/runtime/register` is one
 * — an agent or a test asking a server to write itself down — and the server's own start is the
 * other. The registration is four decisions deep, and a second spelling of any of them would be the
 * defect CLAUDE.md names at the top of the file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SERVER REGISTERS ITSELF AT ALL, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `1urksZld8CQQ`. Act 1 of section 4 of design/ground/ACCEPTANCE.md asks for the canonical
 * server and the canonical browser app both registered and both saying the same world. On the
 * owner's own stack on 4 September 2026 the browser app's row carried a world and the API's did not:
 * the Vite plugin registers itself every time Vite starts, and nothing registered the API. Its row
 * had been written by an agent through `POST /api/resources` before servers could say anything about
 * themselves, and nothing rewrites an existing row. So the act could not be completed as written
 * without somebody registering the API by hand.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS IT DOES, AND WHY EACH
 * ---------------------------------------------------------------------------------------
 *
 * 1. **It closes rows that name a process that has gone.** A server under `tsx watch` restarts on
 *    every change under `src/`, and its own rows then name a pid that no longer exists. The ledger
 *    refuses a second live row for the same session, type and key — rightly, because two rows for
 *    one thing are reported as two orphans — so without this a stack that reloads can never register
 *    again and becomes unowned by working normally. A PORT row is closed whoever wrote it, because a
 *    port is one number on one machine and a row about it written by a session that has ended is
 *    still a claim about that number.
 *
 *    That reached only rows carrying the SAME KEY as one this server was about to write. A restart
 *    has a NEW pid, so the old process row was never looked at, and it stayed live for ever. This
 *    now also closes every live process row in the world on this server's own port whose process
 *    the machine says has ended — `theRowsLeftByProcessesThatHaveEnded` below.
 *
 *    It closes; it never signals. `closeRowThatStoppedMatching` writes the row's end and nothing
 *    else. Releasing would kill whatever holds the port NOW, which after a reload is the server
 *    that is registering.
 *
 * 2. **A live row about this very process is the row for it, whoever wrote it.** It is handed back,
 *    and a missing world is filled in — the only way a row written before servers could say
 *    anything ever gets one. It is never written beside. The guard used to compare the CALLING
 *    SESSION, and the two callers pass different ones, so one server ended up with two live rows
 *    for its pid and two for its port. Problem `LYOhZtHE97Vj`.
 *
 * 3. **It writes a row for the process and one for each port it is really listening on.** They are
 *    two different claims: a port outlives the process that took it often enough that the ledger
 *    keeps them apart. A port this server is not listening on is not registered — an unlistened port
 *    is not a resource, and a row saying otherwise would be a claim rather than a reading.
 */

import type { World } from '@shared/runtime.ts'
import { runtimeRecord, theProcessesTheRuntimeRecordReads, worldNow } from './runtime.ts'
import { portRowStillMatches } from './listeners.ts'
import {
  type AProcessToRead,
  type LedgerEntry,
  type ResourceReport,
  closeRowThatStoppedMatching,
  fillInTheWorldOn,
  listResources,
  liveRowsOfKey,
  noteASecondRegistrationOf,
  osProbe,
  registerResource,
  theProcessesAListingReads,
  theRowIsAboutThisProcess,
} from './resources.ts'
import type { Actor } from './records.ts'
import { settingValue, settings } from '../../config/settings.mjs'
import { registerWorldHere, renameWorldHere } from './office.ts'
import type { World as OfficeWorld } from '@shared/worlds.ts'
import {
  DEFAULT_HOME_WORLD_NAME,
  agentMadeWorldName,
  isTheNameAServerGaveItself,
  testWorldName,
  type WorldKind,
} from '@shared/worlds.ts'
import { installationOf } from '../db/citizenship-migration.ts'
import { sqlite } from '../db/client.ts'

export interface WhatThisServerWroteDown {
  /** The world every row here carries, read by this process about itself. */
  world: World
  /**
   * The office row this server's world has, or null because it could not be registered.
   *
   * Criterion C3: *a server registers its world at the office when it starts.* Null means the
   * database this server answers from has no identity at all, which is the one state a world cannot
   * be registered in — see `registerWorldHere`.
   */
  atTheOffice: OfficeWorld | null
  /** Every row that now describes this server: the ones written and the ones filled in. */
  resources: LedgerEntry[]
  /** The rows whose world was filled in rather than written fresh, by id. */
  filledIn: string[]
  /**
   * The rows that already described this process and were handed back, by id.
   *
   * A second registration of a live process writes nothing: the row that is there is the row for
   * it. This says which rows those were, so a caller can tell "already written down" from "written
   * down just now" — the two look the same in `resources`.
   */
  handedBack: string[]
  /** The rows closed because the process they named has gone, by id. */
  closed: string[]
  /**
   * THE SESSIONS THOSE CLOSED ROWS BELONGED TO, by record id, each named once.
   *
   * A closed row means the process it was about has gone. The session record that owned it is still
   * whatever it last said about itself, and nothing outlives a process to correct that — so a
   * stopped server left a row reading `running` for ever, and nine of them were on the Agent runs
   * screen when this was written. Problem `uYjxMB6JETEq`. This is what lets the caller say so
   * without probing the machine a second time and getting a second answer.
   */
  closedSessions: string[]
}

/**
 * THE LIVE ROWS LEFT BY PROCESSES THAT HAVE ENDED, IN THE WORLD ON THIS SERVER'S OWN PORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The fifth GROUND verifier counted 28 rows in its world at the end of one twenty-five minute run
 * of `npm run dev`, 27 of them processes, and three of those processes alive. Twenty-four rows named
 * pids that were gone. On the owner's own ledger on 4 September 2026 there were 181 such rows, 160
 * of them written that day.
 *
 * The cause is that a `tsx watch` restart is a NEW pid. `writeDown` below closes a row only when it
 * carries the key it is about to write, so it looks at rows for the new pid and never at the row the
 * old pid left. The port row IS closed, because the port number does not change; the process row is
 * not, because the pid does.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH ROWS, AND WHY THOSE
 * ---------------------------------------------------------------------------------------
 *
 * A live row saying a process is running when it is not is a false claim, and the row's own world
 * says which stack it was about. So: every live PROCESS row whose world names the port this
 * server's settings declare, and whose process the machine says has ended.
 *
 * IT CLOSES ROWS SOMEBODY ELSE WROTE. Both halves of one dev stack carry the same world — the
 * browser app registers itself with the world the API replied to it with — so a stack's dead Vite
 * rows are closed here too. That is right rather than an overreach: the process is gone, whoever
 * wrote the row down, and nothing else will ever come back to close it. Vite releases its own row
 * when it exits cleanly and cannot when it is killed.
 *
 * IT NEVER CLOSES A ROW IT COULD NOT READ. The liveness reading has three answers, and only `gone`
 * is acted on. `unknown` — a pid in use with no start time to compare, a port whose holder cannot be
 * read — is left exactly as it is, because "I could not look" is not "it is not there". A row with
 * no world is left alone as well: nothing says which stack it belongs to, and guessing would be
 * inventing the fact this whole function exists to read.
 *
 * IT CLOSES; IT NEVER SIGNALS. There is nothing to signal: every process named here has ended.
 */
function theRowsLeftByProcessesThatHaveEnded(opts: {
  workspaceId: string
  /** The port this server's settings declare, which is the port its own rows carry. */
  port: number | null
  /** This process, which is alive by definition and must never be closed. */
  thisPid: number
}): { row: ResourceReport; because: string }[] {
  if (opts.port === null) return []
  const found: { row: ResourceReport; because: string }[] = []
  for (const row of listResources({ workspaceId: opts.workspaceId })) {
    if (row.type !== 'process') continue
    if (row.key === String(opts.thisPid)) continue
    if (row.world === null || row.world.port !== opts.port) continue
    if (row.liveness.state !== 'gone') continue
    found.push({ row, because: `the process ended and the next start found it gone. ${row.liveness.detail}` })
  }
  return found
}

/**
 * The processes `registerThisServer` reads, for `readFirst` in lib/resources.ts: the ones the runtime record reads,
 * this server's own among them, and the process of every live row of the project, which it lists.
 */
export function theProcessesRegisteringThisServerReads(workspaceId: string): AProcessToRead[] {
  return [...theProcessesTheRuntimeRecordReads(), ...theProcessesAListingReads({ workspaceId })]
}

export function registerThisServer(input: {
  workspaceId: string
  sessionRecordId: string
  detail?: string
  /** Whether Mole Office itself started this process. Absent means nobody recorded it. */
  startedByTheProduct?: boolean
  actor: Actor
}): WhatThisServerWroteDown {
  const { workspaceId, sessionRecordId, actor } = input
  const world = worldNow()
  const record = runtimeRecord()
  const detail =
    input.detail ??
    `the Mole Office API on port ${String(world.port ?? 0)}, ${world.standing.kind}, over ${world.database}`

  // This process, read from the machine rather than from the record, so that a row stamped by the
  // reading Mole Office used before 3 September 2026 is recognised as being about THIS process
  // instead of being closed with a note saying it has gone. `theRowIsAboutThisProcess` explains it.
  const me = osProbe().processById(record.process.pid)
  const closed: string[] = []
  const closedSessions = new Set<string>()
  const filledIn: string[] = []
  const handedBack: string[] = []
  const resources: LedgerEntry[] = []

  /** Is this row about the process answering right now? */
  const aboutThisProcess = (held: LedgerEntry): boolean =>
    held.type === 'process'
      ? held.key === String(record.process.pid) && me !== null && theRowIsAboutThisProcess(held.osStartedAt, me).same === true
      : portRowStillMatches(held, record.process.startedAt)

  const writeDown = (type: 'process' | 'port', key: string): void => {
    for (const held of liveRowsOfKey({ workspaceId, type, key })) {
      if (aboutThisProcess(held)) continue
      // A PROCESS ROW SOMEBODY ELSE HOLDS IS LEFT ALONE. A pid is this process or it is not, and a
      // live row for another session's pid on the same number cannot exist while that number is
      // ours. A PORT row is closed whoever wrote it: the process it names has gone.
      if (type === 'process' && held.sessionRecordId !== sessionRecordId) continue
      closeRowThatStoppedMatching(
        held.id,
        workspaceId,
        `the process this row was about has gone; this ${type} is held by pid ${String(record.process.pid)}, ` +
          `started ${record.process.startedAt ?? 'at a time that could not be read'}`,
        actor,
      )
      closed.push(held.id)
      closedSessions.add(held.sessionRecordId)
    }

    /**
     * A LIVE ROW ABOUT THIS VERY PROCESS IS THE ROW FOR IT, WHOEVER WROTE IT.
     *
     * ---------------------------------------------------------------------------------------
     * WHY THE OWNER OF THE ROW IS NOT PART OF THE QUESTION, MEASURED
     * ---------------------------------------------------------------------------------------
     *
     * Problem `LYOhZtHE97Vj`. `registerResource` refuses a second row only for the same session,
     * type and key, and the two callers here pass different sessions: a server's own start passes
     * the session record it files for itself, and `POST /api/runtime/register` passes the caller's.
     * So one live process ended up with two live rows for its pid and two for its port — four rows
     * for one server — and `tests/helpers.ts` makes exactly that call for every server `liveApp`
     * starts. The ledger is the answer to what is running on this machine, and it was
     * double-counting; the orphan report reads two rows for one thing as two orphans.
     *
     * The question is about the THING, and a pid with its start time and a port with its holder are
     * what identify it. `aboutThisProcess` above is that identity, and it is the same comparison
     * every other reader of this ledger uses.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT HAPPENS TO A ROW THAT IS ALREADY THERE
     * ---------------------------------------------------------------------------------------
     *
     * It is filled in and handed back, never written beside. A missing world is filled in — that is
     * the only way a row written before servers could say anything ever gets one — and the second
     * registrar is written into the change log on the owning session, so the ledger can still say
     * who else claimed this and when. Nothing else about the row changes: its owner is the session
     * that started the thing, and a second registrar did not start it.
     *
     * Every live row about this process is handed back, not just the first. There is one in the
     * ordinary case; more than one means this database still holds the duplicates the old guard
     * wrote, and hiding them behind the newest would be this reply saying there is one.
     */
    const mine = liveRowsOfKey({ workspaceId, type, key }).filter((held) => aboutThisProcess(held))
    if (mine.length > 0) {
      for (const held of mine) {
        const row = held.world === null ? fillInTheWorldOn(held.id, workspaceId, world, actor) : held
        if (held.world === null) filledIn.push(held.id)
        if (held.sessionRecordId !== sessionRecordId) noteASecondRegistrationOf(held, actor, sessionRecordId)
        resources.push(row)
        handedBack.push(held.id)
      }
      return
    }
    /**
     * NOTHING DESCRIBES THIS PROCESS YET, so a row is written. `registerResource` still refuses a
     * second row for one session, type and live key, which is the guard for everything that is not
     * a server registering itself — `POST /api/resources` reaches it directly.
     */
    resources.push(
      registerResource({
        workspaceId,
        sessionRecordId,
        type,
        key,
        detail,
        world,
        ...(input.startedByTheProduct === undefined ? {} : { startedByTheProduct: input.startedByTheProduct }),
        actor,
      }),
    )
  }

  // BEFORE ANYTHING IS WRITTEN, the rows earlier runs of this server left behind are closed. It is
  // first so that the counts this returns describe a ledger that is already telling the truth.
  for (const { row, because } of theRowsLeftByProcessesThatHaveEnded({
    workspaceId,
    port: world.port,
    thisPid: record.process.pid,
  })) {
    closeRowThatStoppedMatching(row.id, workspaceId, because, actor)
    closed.push(row.id)
  }

  writeDown('process', String(record.process.pid))
  for (const port of record.listeningOn) writeDown('port', String(port))

  return { world, resources, filledIn, handedBack, closed, closedSessions: [...closedSessions], atTheOffice: registerThisWorld(world, input) }
}

/**
 * WHAT KIND OF WORLD THIS SERVER IS SERVING, and what it is called. Criteria C3 and C5.
 *
 * THE KIND FOLLOWS THE STANDING THE DECLARATION ALREADY WORKS OUT. `standing()` in lib/runtime.ts
 * answers `canonical` only when the checkout is the main one, the database is the one the
 * declaration names, the port is the declared port and nothing was started by a test runner. So a
 * server that is canonical is the home world and nothing else can become one by accident.
 *
 * A TEST WORLD IS TOLD APART FROM AN AGENT'S BY WHO STARTED IT, which is the one thing the standing
 * does not say: both are scratch. `standing.because` names being started by a test runner in its own
 * sentence, so that is what is read — the same reading, not a second one.
 *
 * THE NAME IS CRITERION C5's. A home world is "my world" until somebody renames it,
 * and anybody may rename it freely. An agent-made world is "<agent handle>'s <purpose>", from
 * the actor and the purpose the registering call carried. A test world is named after its test.
 */
function whatKindOfWorldThisIs(world: World): WorldKind {
  if (world.standing.kind === 'canonical') return 'home'
  return world.standing.because.some((why) => why.includes('test runner')) ? 'test' : 'agent-made'
}

/**
 * Register this server's world in this database's office, or answer null because it cannot be.
 *
 * EXPORTED SO A TEST CAN HAND IT A WORLD. Under a test runner every world this process registers is
 * a `test` world — that is the guard problem `JTdajUUs23_M` needed — so the agent-made path, which
 * is the one criterion C5's naming is about, cannot be reached through `registerThisServer` from
 * inside the suite at all. Handing the world in reaches it without pretending to be something else.
 *
 * IT NEVER FAILS THE START. A server whose world could not be registered is a server that still
 * serves; the office is a list, and a list that is one row short is better than a stack that will
 * not come up. What is not done is hidden: `atTheOffice` is null and the caller says so.
 */
export function registerThisWorld(world: World, input: { actor: Actor; detail?: string }): OfficeWorld | null {
  const identity = world.databaseIdentity
  if (identity === null || identity === '') return null
  const kind = whatKindOfWorldThisIs(world)
  /**
   * WHO REALLY STARTED THIS WORLD, WHEN THE TOOL THAT STARTED IT SAID.
   *
   * A world's own server registers it at boot and the actor on that call is this server, so every
   * world a tool started read `startedBy: mole-office/the-api-server` — the thing that carried the
   * process, not the agent that asked for it. `tools/isolated-mole-office.mjs` knows the run, reads
   * the agent it is working as from the office, and writes that handle into
   * `MOLE_OFFICE_WORLD_STARTED_BY` (the same value rule 5 of chapter 8 already uses to say who holds
   * the owner's authority inside the world). It is read here and never invented: a world started
   * with no run keeps the api server, which is the honest answer for a server somebody started.
   */
  const starterSaid = settingValue('MOLE_OFFICE_WORLD_STARTED_BY')
  const starter = typeof starterSaid === 'string' && starterSaid.trim() !== '' ? starterSaid.trim() : null
  const startedBy =
    starter !== null
      ? ({ kind: 'agent', id: starter } as const)
      : input.actor.type === 'human'
        ? ({ kind: 'person', id: input.actor.id } as const)
        : ({ kind: 'agent', id: input.actor.id } as const)
  /**
   * WHAT THE WORLD IS FOR, WHEN THE TOOL THAT STARTED IT SAID. NULL IS A REAL ANSWER: a world whose
   * starter said nothing is not an error, and the page says nobody recorded what it is for.
   */
  const purposeSaid = settingValue('MOLE_OFFICE_WORLD_PURPOSE')
  const purpose = typeof purposeSaid === 'string' && purposeSaid.trim() !== '' ? purposeSaid.trim() : null
  /**
   * WHICH HANDBACK THIS WORLD BELONGS TO, WHEN THE TOOL THAT STARTED IT SAID. Read exactly the way
   * the purpose above is read, and null for the same reason: a world nobody tied to a handback says
   * so on its own page. Criterion C33.
   */
  const handbackSaid = settingValue('MOLE_OFFICE_WORLD_HANDBACK')
  const handback = typeof handbackSaid === 'string' && handbackSaid.trim() !== '' ? handbackSaid.trim() : null
  const name =
    kind === 'home'
      ? DEFAULT_HOME_WORLD_NAME
      : kind === 'test'
        ? testWorldName(input.detail ?? '')
        : agentMadeWorldName(input.actor.id, input.detail ?? null)
  // THE NAME IS ONLY EVER USED FOR A WORLD THAT IS NOT REGISTERED YET. `registerWorldHere` never
  // renames a live row, which is what keeps a name somebody chose across a restart, and repeating
  // that rule here would be the same rule in two places — with nothing making them agree.
  const row = registerWorldHere({
    name,
    purpose,
    handback,
    kind,
    startedBy,
    checkout: world.repository === '' ? null : world.repository,
    head: world.head,
    databaseIdentity: identity,
    address: world.port === null ? null : `http://127.0.0.1:${String(world.port)}`,
    /**
     * AND WHERE ANOTHER MACHINE REACHES IT, when this server declares one and so binds a second
     * door. The office held only the loopback address, so a person opening Mole Office from their
     * other machine read a list of worlds every one of which said 127.0.0.1, and Enter answered
     * "Failed to fetch". Problem `5mG-KxUAXObJ`.
     *
     * THIS PROCESS'S OWN SETTINGS, not the declaration alone: the question is what THIS server
     * really bound, and a scratch stack started without the setting binds nothing but loopback even
     * in a checkout whose `.env` declares one.
     */
    addressForOtherMachines: settings().otherMachines?.apiAddress ?? null,
    standing: world.standing.kind,
    parentWorld: null,
    installation: installationOf(sqlite) ?? '',
  })
  return theNameTheWorldWasStartedFor(row, input)
}

/**
 * FILL IN WHAT AN AGENT-MADE WORLD IS FOR, ONCE, AND ONLY OVER THE NAME NOBODY CHOSE.
 *
 * Criterion C5 asks that an agent-made world be named after its handle AND its purpose, and
 * `agentMadeWorldName` has always been able to make that name. Nothing ever handed it one. A server
 * names its own world on the way up and has no purpose to give, so every agent-made world in the
 * product was `<handle>'s world`; the only caller that CAN give one — `POST /api/runtime/register`,
 * with `detail` — arrives after the row exists, and `registerWorldHere` never renames a live row.
 * The citizens verifier measured a register call carrying `{"detail":"checking the citizens work"}`
 * changing nothing. Problem `0wPbeU5pdYW5`.
 *
 * IT ONLY EVER WRITES OVER THE NAME THE SERVER GAVE ITSELF, and the placeholder is what says which
 * that is. "Never rename a live row" is there to keep a name a PERSON chose across a restart, and
 * the un-purposed default is not one of those: it is the placeholder this function exists to
 * replace. A row whose name is anything else is left alone — a name somebody chose, a test world's
 * test name, the home world's, and an agent-made world that already took a purpose, so the name
 * cannot move under a reader every time anything registers.
 *
 * ONE PLACE DECIDES WHAT THE NAME IS. `agentMadeWorldName` makes both the placeholder and the
 * purposed name, so there is no second idea here of what an empty purpose is: a detail of nothing
 * but spaces makes the placeholder again, which is the same name the row already has.
 */
function theNameTheWorldWasStartedFor(row: OfficeWorld, input: { actor: Actor; detail?: string }): OfficeWorld {
  if (!isTheNameAServerGaveItself(row.name, input.actor.id)) return row
  return renameWorldHere(row.id, agentMadeWorldName(input.actor.id, input.detail ?? null))
}

/**
 * AND THE OFFICE IS TOLD, because the world's own row is not a list anybody reads.
 *
 * A world that is not the office answers `GET /api/office/worlds` from the mirror, so a purpose
 * written only in its own table is written where nothing shows it: every agent-made world on every
 * list a person reads was still `<handle>'s world` after the first fix. Problem `0wPbeU5pdYW5`,
 * reopened by the citizens verifier.
 *
 * THE SAME RULE IS APPLIED TO THE OFFICE'S COPY as to this world's row, and it is the same function
 * that answers it — `isTheNameAServerGaveItself`, asked inside `tellTheOfficeThisWorldIsCalled` from
 * the handle this passes. The office's row is a different row in a different database and may have
 * been renamed there by a person, and writing over that would be this server taking a name off
 * somebody. The rule is not a callback this could get wrong: there is nowhere here to pass a
 * different one.
 *
 * IT IS NOT AWAITED BY THE REGISTRATION ITSELF. Registering a server is what a caller asked for; a
 * name reaching a list is not, and neither a slow office nor a refusing one may hold it up. The
 * sentence goes to the log.
 */
export async function tellTheOfficeWhatThisWorldIsFor(
  world: OfficeWorld,
  actor: Actor,
): Promise<{ told: boolean; why: string }> {
  const { tellTheOfficeThisWorldIsCalled } = await import('./office.ts')
  return tellTheOfficeThisWorldIsCalled(world.databaseIdentity, world.name, actor.id)
}
