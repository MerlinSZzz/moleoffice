// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * TELLING A LIVE PROCESS FROM A CLAIM SOMEBODY WROTE DOWN.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO SENTENCES THIS FILE EXISTS TO KEEP APART
 * ---------------------------------------------------------------------------------------
 *
 * "This is running" and "a session once wrote down that this was running" are different
 * sentences. On 27 August 2026 the product said the first when only the second was true: seven
 * rows in the orphan report read `alive`, and every process they named was dead. What was alive
 * was the port NUMBER, taken over by a later server. Problem `jiu2AP_ZIW-m` records the same
 * fault from the other end — the orphan report calling a dead process group alive.
 *
 * "I looked and found nothing" and "I could not look" are also different sentences, and that one
 * is the fifth invariant. A report that could not read the process table must never describe the
 * machine as clear.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS TESTED WITH A FAKE MACHINE AND WHAT IS TESTED AGAINST THIS ONE
 * ---------------------------------------------------------------------------------------
 *
 * A port changing hands, a watcher whose server has died, and a probe that cannot read /proc are
 * all one-line setups against a fake `OsProbe` and none of them could be produced reliably on a
 * real machine. They are fake-probe tests.
 *
 * Reading a process's working directory, its parent and the database file it holds open cannot be
 * faked, because the thing under test IS the reading. Those run against this very process, whose
 * working directory and open database this test already knows.
 *
 * NOTHING HERE STARTS, STOPS OR SIGNALS ANY PROCESS. The session that wrote this file was not
 * permitted to, and the feature it tests has no verb.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { freshDb, one, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPort = ReturnType<OsProbe['listeningPorts']>[number]
type ProcessFacts = NonNullable<ReturnType<NonNullable<OsProbe['processFacts']>>>

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

async function freshLedger(): Promise<Harness> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')

  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  return { t, res, app }
}

let h: Harness

beforeEach(async () => {
  h = await freshLedger()
})

afterEach(async () => {
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

function session(state: string, title = 'the session that started it'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state, runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

function endSession(id: string, state: 'finished' | 'crashed' = 'finished'): void {
  h.t.api.patchRecord(id, { dataPatch: { state } }, h.t.api.HUMAN)
}

function proc(pid: number, pgid: number, command: string, startedAt = '2026-08-08 09:00:00'): OsProcess {
  // A parent of 1: these fakes stand for orphans, which is what that means.
  return { pid, pgid, ppid: 1, command, startedAt }
}

function listening(port: number, pid: number | null): OsPort {
  return { port, address: '127.0.0.1', protocol: 'tcp', pid }
}

// ---------------------------------------------------------------------------- the fake machine

interface FakeOptions {
  processes?: OsProcess[]
  ports?: OsPort[]
  /** What each pid's working directory, parent and open databases are. Missing pid = not read. */
  facts?: Map<number, Partial<ProcessFacts>>
  /** Left out entirely to build a probe that cannot describe a process at all. */
  withFacts?: boolean
  /** `false` builds a probe with no process table; a reason builds one that could not read it. */
  table?: false | string
  ownGroup?: number
}

/**
 * An operating system in about fifty lines, with the two readings this feature needs.
 *
 * `processTable` and `processFacts` are what tell a live dev stack from a claim, so both are here
 * and both can be taken away, because a probe that cannot answer is a case the product has to
 * handle rather than a case that cannot happen.
 */
function fakeProbe(opts: FakeOptions = {}): OsProbe {
  const live = new Map<number, OsProcess>()
  for (const p of opts.processes ?? []) live.set(p.pid, p)
  const probe: OsProbe = {
    platform: 'fake',
    processById: (pid: number) => live.get(pid) ?? null,
    processesInGroup: (pgid: number) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => opts.ports ?? [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => opts.ownGroup ?? 999_999,
    killProcessGroup: () => {
      throw new Error('this test never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test never stops anything')
    },
  }
  if (opts.table !== false) {
    probe.processTable = () =>
      typeof opts.table === 'string'
        ? { ok: false, reason: opts.table }
        : { ok: true, processes: [...live.values()].map((p) => ({ pid: p.pid, command: p.command, cwd: null })) }
  }
  if (opts.withFacts !== false) {
    probe.processFacts = (pid: number): ProcessFacts | null => {
      const p = live.get(pid)
      if (p === undefined) return null
      const given = opts.facts?.get(pid) ?? {}
      const parentPid = given.parentPid ?? 1
      return {
        pid,
        parentPid,
        parent: given.parent === undefined ? (live.get(parentPid) ?? null) : given.parent,
        workingDirectory: given.workingDirectory ?? process.cwd(),
        workingDirectoryDeleted: given.workingDirectoryDeleted ?? false,
        openDatabases: given.openDatabases ?? [],
        databaseAsked: given.databaseAsked ?? null,
        couldNotRead: given.couldNotRead ?? [],
      }
    }
  }
  return probe
}

/** The command lines of a real dev stack, so a fake table is a description of something. */
const API_SERVER = 'node --require /repo/node_modules/tsx/dist/preflight.cjs src/server/index.ts'
const WATCHER = 'node /repo/node_modules/.bin/tsx watch src/server/index.ts'
const BROWSER_APP = 'node /repo/node_modules/.bin/vite'

// ============================================================ a port row is about a server

describe('a ledger row for a port says whether the server it names is running', () => {
  /**
   * THE SEVEN ROWS OF 27 AUGUST 2026, IN FOUR LINES.
   *
   * A session registers the port its server is listening on. The server exits. Something else
   * binds the same number. The row is about the first server, and the first server is gone.
   */
  it('calls the row gone when the port has changed hands, and does not offer it as an orphan', () => {
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(500, 400, API_SERVER)], ports: [listening(8787, 500)] }),
    )
    const s = session('running')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: s,
      type: 'port',
      key: '8787',
      actor: HUMAN,
    }).id
    endSession(s, 'crashed')

    // The registered server exits; a later one takes the number.
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(900, 950, API_SERVER, '2026-08-27 14:30:02')],
        ports: [listening(8787, 900)],
      }),
    )

    const row = one(h.res.listResources({ workspaceId: 'default' }), 'the ledger row')
    expect(row.id).toBe(id)
    expect(row.liveness.state, 'a port held by a different process is not the registered server alive').toBe('gone')
    if (row.liveness.state === 'gone') {
      expect(row.liveness.detail).toContain('changed hands')
      expect(row.liveness.detail).toContain('2026-08-27 14:30:02')
    }

    const report = h.res.orphanReport('default')
    expect(report.orphans, 'nothing this session started is still running, so there is no orphan').toHaveLength(0)
    expect(one(report.goneAndNotClosed, 'the row that is still open').id).toBe(id)
  })

  it('says it cannot tell when nothing was listening at the moment the row was written', () => {
    // Registering a port before the server has finished binding is allowed, and it stores no
    // identity to compare with later.
    h.res.useOsProbe(fakeProbe({ processes: [], ports: [] }))
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN })
    endSession(s)

    h.res.useOsProbe(
      fakeProbe({ processes: [proc(700, 700, API_SERVER)], ports: [listening(8788, 700)] }),
    )
    const row = one(h.res.listResources({ workspaceId: 'default' }), 'the ledger row')
    expect(row.liveness.state, 'no recorded identity means Mole Office cannot tell, not that it is alive').toBe('unknown')
    if (row.liveness.state === 'unknown') expect(row.liveness.reason).toContain('no identity to compare')

    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    expect(one(report.unchecked, 'the row nobody could get a straight answer about').key).toBe('8788')
  })

  it('still calls the row alive when the process holding the port is the one that was registered', () => {
    // The control for the two above. Without it they would both pass with `alive` deleted.
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(500, 400, API_SERVER)], ports: [listening(8789, 500)] }),
    )
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8789', actor: HUMAN })
    endSession(s, 'crashed')

    const report = h.res.orphanReport('default')
    expect(one(report.orphans, 'the real orphan').key).toBe('8789')
    expect(report.goneAndNotClosed).toHaveLength(0)
  })
})

// ============================================================ a row that is open for nothing

describe('a row that is still open for something that is not running', () => {
  it('is on the report rather than nowhere', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, API_SERVER)] }))
    const s = session('running')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: s,
      type: 'process',
      key: '500',
      actor: HUMAN,
    }).id
    endSession(s, 'crashed')

    // The process exits. Nobody releases the row.
    h.res.useOsProbe(fakeProbe({ processes: [] }))

    const answer = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(answer.statusCode).toBe(200)
    const body = answer.json() as {
      orphans: unknown[]
      searched: string[]
      warning?: string
    }
    expect(body.orphans).toHaveLength(0)
    // `goneAndNotClosed` is off the wire now — the running column never read it — so the library is
    // where the row is pinned, and the door is pinned by the warning it produces below.
    expect(one(h.res.orphanReport('default').goneAndNotClosed, 'the open row').id).toBe(id)
    expect(body.warning ?? '', 'a reader of the report is told the row is open').toContain('still open')
    // Where it looked counts the row it found, which it stopped doing when the fourth list arrived.
    expect(body.searched.join(' ')).toContain('1 live row')
  })
})

// ============================================================ who owns what is running

describe('what is serving this project, and who owns each piece', () => {
  it('names the database the server answering the request is serving', () => {
    h.res.useOsProbe(fakeProbe())
    const report = h.res.serversOnThisMachine('default')
    expect(report.answering.pid).toBe(process.pid)
    // freshDb points MOLE_OFFICE_DB at a throwaway file, and this is that file, absolute.
    expect(report.answering.database).toBe(resolve(h.t.file))
    expect(report.summary, 'the first sentence says which corpus you are being answered from').toContain(
      resolve(h.t.file),
    )
  })

  it('reports a watcher whose API server is not running', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(3598705, 3598653, WATCHER), proc(3598706, 3598653, BROWSER_APP)] }))
    const report = h.res.serversOnThisMachine('default')
    const watcher = one(
      report.servers.filter((s) => s.part === 'the server watcher'),
      'the watcher',
    )
    expect(watcher.hasAServerUnderIt, 'no API server is in its group').toBe(false)
    expect(report.notes.join(' ')).toContain('no API server in its process group')
  })

  it('does not report a watcher that has a server under it', () => {
    // The control. Without it the test above would pass with `hasAServerUnderIt` hard-coded false.
    h.res.useOsProbe(fakeProbe({ processes: [proc(3598705, 3598653, WATCHER), proc(1967788, 3598653, API_SERVER)] }))
    const report = h.res.serversOnThisMachine('default')
    const watcher = one(
      report.servers.filter((s) => s.part === 'the server watcher'),
      'the watcher',
    )
    expect(watcher.hasAServerUnderIt).toBe(true)
    expect(report.notes.join(' ')).not.toContain('no API server in its process group')
  })

  it('says a process nobody wrote down is claimed by nothing, in those words', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(2593445, 2593445, BROWSER_APP)] }))
    const report = h.res.serversOnThisMachine('default')
    const row = one(report.servers, 'the unregistered browser app')
    expect(row.ownership.owner).toBe('nobody wrote it down')
    expect(row.ownership.says).toContain('No session in this project registered')
  })

  it('calls a ledger row that has stopped matching a claim, and not evidence of who owns this', () => {
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(500, 400, API_SERVER)], ports: [listening(8787, 500)] }),
    )
    const s = session('running', 'Round ten')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8787', actor: HUMAN })
    endSession(s)

    // A different server now holds the port. The row still names 8787.
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(900, 950, API_SERVER, '2026-08-27 14:30:02')],
        ports: [listening(8787, 900)],
      }),
    )
    const report = h.res.serversOnThisMachine('default')
    const row = one(report.servers, 'the server holding 8787 now')
    expect(row.pid).toBe(900)
    expect(row.ownership.owner).toBe('a ledger row that no longer matches')
    expect(row.ownership.says).toContain('a claim, not evidence')
    const claim = one(row.portClaims, 'the claim on 8787')
    expect(claim.sameProcess, 'the row was registered against a different process').toBe(false)
    expect(claim.says).toContain('changed hands')
  })

  it('names the session when the row still describes what is running', () => {
    // The control for the test above: the same shape with nothing having changed hands.
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(500, 400, API_SERVER)], ports: [listening(8787, 500)] }),
    )
    const s = session('running', 'the session still going')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8787', actor: HUMAN })

    const report = h.res.serversOnThisMachine('default')
    const row = one(report.servers, 'the server holding 8787')
    expect(row.ownership.owner).toBe('a session that is still going')
    expect(row.ownership.sessionTitle).toBe('the session still going')
    expect(one(row.portClaims, 'the claim on 8787').sameProcess).toBe(true)
  })
})

// ============================================================ never a clean bill of health

describe('the difference between finding nothing and not being able to look', () => {
  it('says it could not look when the process table cannot be read, and does not describe the machine', () => {
    h.res.useOsProbe(fakeProbe({ table: '/proc could not be listed (EACCES)' }))
    const report = h.res.serversOnThisMachine('default')
    expect(report.servers).toHaveLength(0)
    expect(report.couldNotLook.join(' ')).toContain('/proc could not be listed')
    expect(report.summary).toContain('could not look')
    expect(report.summary, 'a reading that did not happen is never reported as a reading').not.toContain(
      'read every process on this machine',
    )
  })

  it('says the probe cannot describe a process table at all rather than reporting an empty machine', () => {
    h.res.useOsProbe(fakeProbe({ table: false }))
    const report = h.res.serversOnThisMachine('default')
    expect(report.couldNotLook.join(' ')).toContain('does not describe a process table')
    expect(report.couldNotLook.join(' ')).toContain('not a reading that nothing is running')
    expect(report.summary).toContain('could not look')
  })

  it('describes the machine when it really did read it', () => {
    // The control for both of the above. They would pass with the summary permanently saying
    // "could not look", which would be the same fault in the other direction.
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, API_SERVER)] }))
    const report = h.res.serversOnThisMachine('default')
    expect(report.summary).toContain('read every process on this machine')
    expect(report.summary).not.toContain('could not look')
    expect(report.couldNotLook).toHaveLength(0)
  })

  it('does not report "no database, no parent" about a process it could not describe', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, API_SERVER)], withFacts: false }))
    const report = h.res.serversOnThisMachine('default')
    const row = one(report.servers, 'the API server')
    expect(row.databases, 'null is "could not look", and [] would read as "it holds none"').toBeNull()
    expect(row.nobodyIsWaiting, 'null is "could not tell", and false would read as "somebody is waiting"').toBeNull()
    expect(row.inThisCheckout).toBeNull()
    expect(row.couldNotRead.join(' ')).toContain('cannot describe where a process is running')
    expect(row.byHand, 'a process whose owner is unknown gets no command').toBeNull()
    expect(row.byHandBlockedBecause ?? '').toContain('owner is unknown')
  })
})

// ============================================================ what a person may be told to run

describe('what Mole Office will and will not write out a command against', () => {
  it('refuses to write a command that would end the server answering the request', () => {
    const me = proc(process.pid, 4242, API_SERVER)
    h.res.useOsProbe(fakeProbe({ processes: [me], ownGroup: 4242 }))
    const report = h.res.serversOnThisMachine('default')
    const mine = one(
      report.servers.filter((s) => s.pid === process.pid),
      'the row for this process',
    )
    expect(mine.ownership.owner).toBe('the server answering you')
    expect(mine.byHand).toBeNull()
    expect(mine.byHandBlockedBecause ?? '').toContain('reading this from')
  })

  it('refuses to write a command against a process running in somebody else’s directory', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(2024164, 2024153, API_SERVER)],
        facts: new Map([[2024164, { workingDirectory: `${THE_TEST_FIXTURE_ROOT}/px-verify-id` }]]),
      }),
    )
    const row = one(h.res.serversOnThisMachine('default').servers, 'the other checkout’s server')
    expect(row.inThisCheckout).toBe(false)
    expect(row.byHand).toBeNull()
    expect(row.byHandBlockedBecause ?? '').toContain(`${THE_TEST_FIXTURE_ROOT}/px-verify-id`)
  })

  it('does write one against a process whose directory has been deleted, and names what it would end', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(2593445, 2593445, BROWSER_APP)],
        facts: new Map([
          [2593445, { workingDirectory: `${THE_TEST_FIXTURE_ROOT}/px-w5grid`, workingDirectoryDeleted: true }],
        ]),
      }),
    )
    const report = h.res.serversOnThisMachine('default')
    const row = one(report.servers, 'the browser app in a deleted directory')
    expect(row.workingDirectoryDeleted).toBe(true)
    expect(row.byHand?.command).toBe('kill -TERM -2593445')
    expect(row.byHand?.ends, 'every process the command would end is named first').toHaveLength(1)
    expect(report.notes.join(' ')).toContain('has been DELETED')
  })
})

// ============================================================ against this machine

describe('reading a real process on this machine', () => {
  it('reads this process’s own working directory, parent and open database', () => {
    const probe = h.res.LINUX_PROBE
    if (probe.processFacts === undefined) {
      throw new Error('the Linux probe does not describe a process, so nothing can read where one is running')
    }
    const facts = probe.processFacts(process.pid)
    expect(facts, 'this process is running, so it has facts').not.toBeNull()
    if (facts === null) return
    expect(facts.pid).toBe(process.pid)
    expect(facts.workingDirectory).toBe(process.cwd())
    expect(facts.workingDirectoryDeleted).toBe(false)
    expect(facts.parentPid).toBeGreaterThan(0)
    expect(facts.parent, 'the process that started this test runner is still running').not.toBeNull()
    // The database this test opened, held by descriptor and read back out of /proc.
    expect(facts.openDatabases, `open databases were ${JSON.stringify(facts.openDatabases)}`).toContain(
      resolve(h.t.file),
    )
    expect(facts.couldNotRead).toHaveLength(0)
  })

  /**
   * THE DELETED-DIRECTORY RULE, TESTED WHERE IT CAN BE TESTED.
   *
   * Making a process whose working directory has been removed means starting a process and
   * deleting a directory under it, and the session that wrote this file was not permitted to start
   * one. So the rule is tested here and the whole path was checked BY HAND, on 27 August 2026,
   * against pid 2593445 on this machine — a Vite left behind in a removed worktree under the
   * home folder. `LINUX_PROBE.processFacts(2593445)` answered that worktree's path as
   * `workingDirectory`, with `workingDirectoryDeleted: true`.
   *
   * That is a measurement, not a test: it depends on a process nobody should keep alive on purpose.
   * What is owed, and cannot be paid by a session that may not start a process, is a test that
   * spawns a child in a temporary directory, removes the directory and reads the child back.
   */
  it('separates a deleted working directory from the path itself', () => {
    expect(h.res.directoryFromLink(`${THE_TEST_FIXTURE_ROOT}/px-w5grid (deleted)`)).toEqual({
      path: `${THE_TEST_FIXTURE_ROOT}/px-w5grid`,
      deleted: true,
    })
    expect(h.res.directoryFromLink(`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`)).toEqual({
      path: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      deleted: false,
    })
    // A directory a person really did call this keeps its name. The mark is a suffix on the LINK,
    // and dropping it from a path that merely ends that way would rename somebody's directory.
    expect(h.res.directoryFromLink('/tmp/notes (deleted) /x')).toEqual({
      path: '/tmp/notes (deleted) /x',
      deleted: false,
    })
  })

  it('answers null for a pid that is not running rather than inventing an empty description', () => {
    const probe = h.res.LINUX_PROBE
    if (probe.processFacts === undefined) {
      throw new Error('the Linux probe does not describe a process, so nothing can read where one is running')
    }
    // One above the default largest pid on Linux, so it is never a process here.
    expect(probe.processFacts(2 ** 22 - 1)).toBeNull()
  })
})

// ============================================================ one judgement, made in one place

/**
 * `moleOfficePartOf` IS WRITTEN ONCE, in src/server/lib/mole-office-parts.ts (problem zn-9EYTTt7cJ).
 *
 * src/server/lib/resources.ts and tools/stray-servers.mjs both import it from there. The first
 * two tests below check that each of them hands out that very function, so a second copy in either
 * file turns one of them red. The sweeper is checked under plain node, with no test runner between,
 * because plain node is what runs it. The third checks the judgement itself against command lines
 * from a real machine.
 *
 * The command lines below were measured on this machine with `ps -eo args` on 27 August 2026.
 */
const REAL_COMMAND_LINES: { command: string; part: string | null; why: string }[] = [
  {
    command:
      `${THE_TEST_FIXTURE_ROOT}/.nvm/versions/node/v22.23.2/bin/node --require ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/tsx/dist/preflight.cjs --import file://${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/tsx/dist/loader.mjs src/server/index.ts`,
    part: 'the API server',
    why: 'the process that actually holds 8787',
  },
  {
    command: `node ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/.bin/tsx watch src/server/index.ts`,
    part: 'the server watcher',
    why: 'it starts the API server and starts it again; it is not the server',
  },
  {
    command: `node ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/.bin/tsx src/server/index.ts --stop-with-pid=1981253`,
    part: 'the server watcher',
    why: 'a test server is launched through tsx too, and the launcher is not the server either',
  },
  {
    command: `node ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/.bin/vite`,
    part: 'the browser app',
    why: 'the process that holds 5173',
  },
  {
    command: `node ${THE_TEST_FIXTURE_ROOT}/px-w5grid/node_modules/.bin/vite --strictPort --host 127.0.0.1`,
    part: 'the browser app',
    why: 'what it IS does not depend on whose checkout it is running in',
  },
  {
    command:
      `node ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/.bin/concurrently --kill-others -n server,web -c blue,green npm:dev:server npm:dev:web`,
    part: 'the dev supervisor',
    why: 'the process that holds both halves of the dev stack together',
  },
  {
    command: 'sh -c tsx watch src/server/index.ts',
    part: null,
    why: 'a shell holding the whole command in one argument is not the watcher; the process it runs is',
  },
  {
    command: 'sh -c concurrently --kill-others -n server,web -c blue,green "npm:dev:server" "npm:dev:web"',
    part: null,
    why: 'the same rule, one level up',
  },
  {
    command: `node ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/node_modules/.bin/vitest run --maxWorkers=2`,
    part: null,
    why: 'the test runner is not part of a dev stack',
  },
  { command: 'node /tmp/judge8/driver.mjs', part: null, why: 'a Playwright driver that answers ok:true to anything' },
  { command: 'npm run dev', part: null, why: 'npm is not matched; the group it starts is' },
]

describe('the sweeper and the product use one judgement about a process', () => {
  it('the product uses the function in mole-office-parts.ts', async () => {
    const theOne = (await import('../src/server/lib/mole-office-parts.ts')).moleOfficePartOf
    const { moleOfficePartOf: theProducts } = await import('../src/server/lib/resources.ts')
    expect(theProducts, 'src/server/lib/resources.ts hands out the one in mole-office-parts.ts').toBe(theOne)
  })

  it('the sweeper, run by plain node, uses the function in mole-office-parts.ts', () => {
    // Importing the sweeper does not sweep: it sweeps only when it is the command node was asked to run.
    const sweeper = pathToFileURL(resolve(import.meta.dirname, '..', 'tools', 'stray-servers.mjs')).href
    const theOne = pathToFileURL(resolve(import.meta.dirname, '..', 'src', 'server', 'lib', 'mole-office-parts.ts')).href
    const script =
      `const sweeper = await import(${JSON.stringify(sweeper)})\n` +
      `const theOne = await import(${JSON.stringify(theOne)})\n` +
      `console.log(sweeper.moleOfficePartOf === theOne.moleOfficePartOf ? 'the same function' : 'another function')\n`
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    if (run.error !== undefined) throw run.error
    expect({ status: run.status, said: run.stdout.trim(), stderr: run.stderr }).toEqual({
      status: 0,
      said: 'the same function',
      stderr: '',
    })
  })

  it('judges every command line measured on this machine as the table says', async () => {
    const { moleOfficePartOf } = await import('../src/server/lib/mole-office-parts.ts')
    for (const row of REAL_COMMAND_LINES) {
      expect(moleOfficePartOf(row.command), `on: ${row.command} — ${row.why}`).toBe(row.part)
    }
  })

  it('offers the same four names for a part', async () => {
    const { DEV_STACK_PARTS } = await import('../src/server/lib/mole-office-parts.ts')
    const fromTheTable = new Set(REAL_COMMAND_LINES.map((r) => r.part).filter((p): p is string => p !== null))
    expect(
      [...DEV_STACK_PARTS].sort(),
      'every part the product can report has a real command line in the table above',
    ).toEqual([...fromTheTable].sort())
  })
})
