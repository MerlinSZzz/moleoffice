// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROCESS LEDGER KNOWS A CLIENT, AND A CLIENT NEVER OWNS A SERVER (criterion W8 of the
 * standalone window; wave 13t's plan hp7Z-IW9JWSX, piece H3; four further points).
 *
 * A window of the office registers itself as a `client` row: its own pid, its process group and its
 * start time. It connects to the service; it is never the service's parent and never its owner.
 *
 *   1. A client row never owns a server's process group or port. Registering one refuses a process
 *      whose group is the answering server's, holds a Mole Office server, or holds a port this ledger
 *      records for a server; a port the window listens on for itself, such as Electron's debugging
 *      port, is its own. And a
 *      client row never names a running server in the servers report, even when its group later holds
 *      one.
 *   3. The supervisor reading stays true for a client: an Electron parent is named as one and never as
 *      a supervisor, and the service manager is claimed only while the server leads its own group. On
 *      Windows, which has no process groups, it is claimed only while the system layer says the server
 *      runs in the group its starter made (wave 13t, round W8, item 22). The layer is stood in for that.
 *   4. tools/stray-servers.mjs still finds a stray that only looks like a client or like the service:
 *      a server left behind with MOLE_OFFICE_STARTED_BY set and an Electron-looking command is a stray.
 *
 * The machine is a stand-in probe for 1 to 3, as in tests/telling-a-live-process-from-a-claim.test.ts,
 * and a real stand-in process for 4, as in tests/no-stray-servers.test.ts.
 *
 * MUTATIONS:
 *   - registerResource's client case does not ask what the group serves: the three refusal cases red;
 *   - rowsNaming lets a client row name a process: the ownership case red;
 *   - whatTheParentIs loses its Electron line: the Electron case red;
 *   - theServiceManagerOfThisServer does not check the group: the borrowed-setting case red;
 *   - on Windows, the mutations in the commit message of round W8 that let a server take the lock there;
 *   - the client check reads only this project's port rows: the other-project case red;
 *   - a port row counts whatever its liveness: the released-or-gone case red;
 *   - the service sentence says again that no terminal is its parent: the shell case red;
 *   - takeTheServiceClaim leaves the setting in the environment: the inheritance case red;
 *   - tools/stray-servers.mjs spares a process with MOLE_OFFICE_STARTED_BY: the stray case red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { STARTED_BY_THE_SERVICE_COMMAND } from '../src/config/settings.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import { freshDb, TEST_DATABASE_PREFIX, type TestDb } from './helpers.ts'

/** THE SYSTEM LAYER'S JOB OBJECTS, STOOD IN only while `standIn.jobObjects` is set: every other case reads the real layer. */
const standIn = vi.hoisted(() => ({ jobObjects: null as null | JobObjects }))
vi.mock('../src/config/systems/the-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/systems/the-system.mjs')>()
  return {
    ...real,
    thisSystem: () => {
      const system = real.thisSystem()
      return standIn.jobObjects === null ? system : { ...system, groups: { ...system.groups, jobObjects: standIn.jobObjects } }
    },
  }
})

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPort = ReturnType<OsProbe['listeningPorts']>[number]

const REPO = fileURLToPath(new URL('..', import.meta.url))

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

let h: Harness

beforeEach(async () => {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  h = { t, res, app }
})

afterEach(async () => {
  h.res.useOsProbe(h.res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

function session(state: string, title: string): string {
  return h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state, runtime: 'claude-code' }, actor: h.t.api.HUMAN }).id
}

function proc(pid: number, pgid: number, command: string, startedAt = '2026-10-02 09:00:00'): OsProcess {
  return { pid, pgid, ppid: 1, command, startedAt }
}

function listening(port: number, pid: number | null): OsPort {
  return { port, address: '127.0.0.1', protocol: 'tcp', pid }
}

/** A machine of a few processes and ports, as the ledger reads one. */
function fakeProbe(processes: OsProcess[], ports: OsPort[] = [], ownGroup = 999_999): OsProbe {
  const live = new Map(processes.map((p) => [p.pid, p] as const))
  return {
    platform: 'fake',
    processById: (pid: number) => live.get(pid) ?? null,
    processesInGroup: (pgid: number) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => ports,
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => ownGroup,
    killProcessGroup: () => {
      throw new Error('this test never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test never stops anything')
    },
    processTable: () => ({ ok: true, processes: [...live.values()].map((p) => ({ pid: p.pid, command: p.command, cwd: null })) }),
    processFacts: (pid: number) => {
      const p = live.get(pid)
      if (p === undefined) return null
      return { pid, parentPid: 1, parent: null, workingDirectory: process.cwd(), workingDirectoryDeleted: false, openDatabases: [], databaseAsked: null, couldNotRead: [] }
    },
  }
}

const A_WINDOW = '/opt/mole-office/node_modules/electron/dist/electron --no-sandbox main.cjs'
const API_SERVER = 'node --require /repo/node_modules/tsx/dist/preflight.cjs src/server/index.ts'

function registerAClient(pid: number, sessionRecordId: string): { id: string; pgid: number | null } {
  const row = h.res.registerResource({ workspaceId: 'default', sessionRecordId, type: 'client', key: String(pid), actor: HUMAN })
  return { id: row.id, pgid: row.pgid }
}

// ============================================================ 1. a client never owns a server

describe('a client row never owns a server\'s process group or port', () => {
  it('records a window alone in its own group, with its group and start time', () => {
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)]))
    const s = session('running', 'a window of the office')
    const row = registerAClient(700, s)
    expect(row.pgid).toBe(700)
  })

  it('refuses a process whose group holds a Mole Office server', () => {
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW), proc(701, 700, API_SERVER)]))
    const s = session('running', 'a window of the office')
    expect(() => registerAClient(700, s)).toThrow(/holds a Mole Office .*pid 701.*A client never owns a server's process group or port/)
  })

  it('records a window that listens on a port of its own, which no server registered', () => {
    // Electron listens on a debugging port when Playwright drives it. That port is the window's.
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)], [listening(41234, 700)]))
    const s = session('running', 'a window of the office')
    expect(registerAClient(700, s).pgid).toBe(700)
  })

  it('refuses a process whose group holds a port this ledger records for a server', () => {
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)], [listening(28799, 700)]))
    const server = session('running', 'The API server')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: server, type: 'port', key: '28799', actor: HUMAN })
    const s = session('running', 'a window of the office')
    expect(() => registerAClient(700, s)).toThrow(/holds port 28799, as pid 700, which the ledger records as a server's port/)
  })

  it('refuses a group holding a server\'s port recorded in another project\'s ledger', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'robotics', title: 'Robotics' })
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)], [listening(28799, 700)]))
    const elsewhere = h.t.api.createRecord({ workspaceId: 'robotics', kind: 'session', title: 'The API server', data: { state: 'running' }, actor: h.t.api.HUMAN }).id
    h.res.registerResource({ workspaceId: 'robotics', sessionRecordId: elsewhere, type: 'port', key: '28799', actor: HUMAN })
    const s = session('running', 'a window of the office')
    expect(() => registerAClient(700, s)).toThrow(/holds port 28799, as pid 700, which the ledger records as a server's port/)
  })

  it('records a window over a port whose row is released, or whose server has gone', () => {
    // Released: the row records nobody holding the port now.
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)], [listening(28799, 700)]))
    const server = session('running', 'The API server')
    const released = h.res.registerResource({ workspaceId: 'default', sessionRecordId: server, type: 'port', key: '28799', actor: HUMAN })
    h.res.closeRowThatStoppedMatching(released.id, 'default', 'this test released it', HUMAN)
    expect(registerAClient(700, session('running', 'a window of the office')).pgid).toBe(700)
    // Gone: the row was written while another server held the port; the window holds it now.
    h.res.useOsProbe(fakeProbe([proc(702, 702, API_SERVER), proc(710, 710, A_WINDOW)], [listening(28800, 702)]))
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: server, type: 'port', key: '28800', actor: HUMAN })
    // The window started later than the server that held the port, as a real one would.
    h.res.useOsProbe(fakeProbe([proc(710, 710, A_WINDOW, '2026-10-02 10:00:00')], [listening(28800, 710)]))
    expect(registerAClient(710, session('running', 'a second window')).pgid).toBe(710)
  })

  it('refuses the group of the server answering this request', () => {
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)], [], 700))
    const s = session('running', 'a window of the office')
    expect(() => registerAClient(700, s)).toThrow(/is the group of the server answering this request/)
  })

  it('never names a server in the servers report, even when the client\'s group later holds one', () => {
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW)]))
    const s = session('running', 'a window of the office')
    registerAClient(700, s)
    // Later the same group holds an API server: a client row must not make it the window's.
    h.res.useOsProbe(fakeProbe([proc(700, 700, A_WINDOW), proc(701, 700, API_SERVER)]))
    const report = h.res.serversOnThisMachine('default')
    const server = report.servers.find((one) => one.pid === 701)
    expect(server, JSON.stringify(report.servers.map((one) => one.pid))).toBeDefined()
    expect(server?.ownership.owner).toBe('nobody wrote it down')
    expect(server?.ownership.sessionRecordId).toBeNull()
  })
})

// ============================================================ 2. SERVER_OWNERS stays the one list

/** Every source file under a folder of the checkout. */
function everySourceFile(folder: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(folder)) {
    const full = join(folder, name)
    if (statSync(full).isDirectory()) out.push(...everySourceFile(full))
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full)
  }
  return out
}

// ============================================================ 3. the supervisor words stay true

describe('the supervisor reading stays true for a client', () => {
  it('names an Electron parent for what it is, and never as a supervisor', async () => {
    const runtime = await import('../src/server/lib/runtime.ts')
    expect(runtime.whatTheParentIs(A_WINDOW)).toBe('an Electron program, such as a window of the office, which does not restart it')
    expect(runtime.whichSupervisor(A_WINDOW)).toBe('nothing that restarts it')
  })

  it('names the service manager only while the server leads its own group', async () => {
    const runtime = await import('../src/server/lib/runtime.ts')
    runtime.takeTheServiceClaim({ MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND })
    try {
      // Leading its own group, with its starter gone: the service, named.
      h.res.useOsProbe(fakeProbe([], [], process.pid))
      const theService = runtime.supervisorOf(4_000_001, new runtime.Gaps())
      expect(theService.serviceManager).toBe('mole-office start')
      expect(theService.says).toContain('This server runs as the Mole Office service: `mole-office start` started it')
      expect(theService.says).toContain('The process that started it (4000001) has ended, as it does.')
      // The same claim, in a server of somebody else's group: not the service.
      h.res.useOsProbe(fakeProbe([], [], process.pid + 1))
      const borrowed = runtime.supervisorOf(4_000_001, new runtime.Gaps())
      expect(borrowed.serviceManager).toBeNull()
      expect(borrowed.says).not.toContain('Mole Office service')
    } finally {
      runtime.takeTheServiceClaim({})
    }
  })

  it('names the service manager on Windows only while the layer says the server runs in the group its starter made', async () => {
    const runtime = await import('../src/server/lib/runtime.ts')
    runtime.takeTheServiceClaim({ MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND })
    let startedIn: ReturnType<JobObjects['theOneThisProgramWasStartedIn']> = { group: 4_000_003 }
    standIn.jobObjects = {
      theOneThisProgramWasStartedIn: () => startedIn,
      readTheOneThisProgramWasStartedIn: () => Promise.resolve(startedIn),
      holds: () => {
        throw new Error('no case here asks whether a group holds a process')
      },
      readHolds: () => Promise.reject(new Error('no case here asks whether a group holds a process')),
      programsOfAStarter: () => {
        throw new Error('no case here asks what a starter started')
      },
      readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
    }
    try {
      // The process table's group is not asked on Windows: here it is a group the server does not lead.
      h.res.useOsProbe(fakeProbe([], [], process.pid + 1))
      const theService = runtime.supervisorOf(4_000_001, new runtime.Gaps())
      expect(theService.serviceManager).toBe('mole-office start')
      expect(theService.says).toContain('This server runs as the Mole Office service: `mole-office start` started it')
      // The same claim, where the layer cannot say the starter made this server's group: not the service.
      startedIn = { unknown: 'This program was not started by the starter (a stand-in answer).' }
      h.res.useOsProbe(fakeProbe([], [], process.pid))
      const borrowed = runtime.supervisorOf(4_000_001, new runtime.Gaps())
      expect(borrowed.serviceManager).toBeNull()
      expect(borrowed.says).not.toContain('Mole Office service')
    } finally {
      standIn.jobObjects = null
      runtime.takeTheServiceClaim({})
    }
  })

  it('says only what it read about the process above the service, a shell included', async () => {
    const runtime = await import('../src/server/lib/runtime.ts')
    runtime.takeTheServiceClaim({ MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND })
    try {
      h.res.useOsProbe(fakeProbe([proc(4_000_002, 4_000_002, '/bin/bash')], [], process.pid))
      const read = runtime.supervisorOf(4_000_002, new runtime.Gaps())
      expect(read.serviceManager).toBe('mole-office start')
      expect(read.says).toContain('The process above it now is a shell.')
      expect(read.says).not.toMatch(/no window|no terminal/)
    } finally {
      runtime.takeTheServiceClaim({})
    }
  })

  it('takes the claim out of the server\'s own environment, so nothing it starts inherits it', async () => {
    const runtime = await import('../src/server/lib/runtime.ts')
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND }
    try {
      expect(runtime.takeTheServiceClaim(env)).toBe(STARTED_BY_THE_SERVICE_COMMAND)
      expect(env['MOLE_OFFICE_STARTED_BY']).toBeUndefined()
      // A child started with that environment, as the message worker is, does not carry the claim.
      const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.env.MOLE_OFFICE_STARTED_BY))'], { env, encoding: 'utf8' })
      expect(child.stdout).toBe('undefined')
    } finally {
      runtime.takeTheServiceClaim({})
    }
  })
})

// ============================================================ 4. a stray that looks like a client is a stray

describe('tools/stray-servers.mjs still finds a stray that only looks like a client or the service', () => {
  it('reports a server left behind with MOLE_OFFICE_STARTED_BY set and an Electron-looking command', () => {
    const scratch = mkdtempSync(`${TEST_DATABASE_PREFIX}looks-like-a-client-`)
    // A stand-in the tool takes for a server: its command line names the API, its working directory is
    // this checkout, and its MOLE_OFFICE_DB is under the suite's prefix. It also carries the two marks
    // a client or the service would: the service's setting, and electron on its command line. The shell
    // that starts it under setsid leaves at once, so nobody is waiting for it. Its group is the shell's,
    // read from the process itself right after it starts and recorded, so it is stopped by that group.
    const started = spawnSync(
      'setsid',
      ['sh', '-c', `${JSON.stringify(process.execPath)} -e 'setTimeout(() => {}, 120000)' src/server/index.ts electron >/dev/null 2>&1 & echo $!`],
      {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, MOLE_OFFICE_DB: join(scratch, 'office.db'), MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND },
      },
    )
    const pid = Number(started.stdout.trim())
    expect(Number.isInteger(pid) && pid > 0, started.stdout + started.stderr).toBe(true)
    const reading = theProcessAt(pid)
    const group = reading.here ? reading.pgid : null
    try {
      expect(group, `the stand-in ${String(pid)} could not be read`).not.toBeNull()
      const swept = spawnSync(process.execPath, [join(REPO, 'tools', 'stray-servers.mjs'), '--verbose', `--database-prefix=${TEST_DATABASE_PREFIX}`], {
        cwd: REPO,
        encoding: 'utf8',
        env: { ...process.env, MOLE_OFFICE_STRAY_GRACE: '0' },
      })
      const said = `${swept.stdout}${swept.stderr}`
      expect(said, said).toContain(`group ${String(group)}`)
      expect(said, said).toContain(join(scratch, 'office.db'))
    } finally {
      // Stopped by the group recorded at its start, and only while the stand-in is still in it.
      const now = theProcessAt(pid)
      if (group !== null && now.here && now.pgid === group) {
        try {
          process.kill(-group, 'SIGKILL')
        } catch {
          // Ended between the look and the signal.
        }
      }
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 30_000)
})
