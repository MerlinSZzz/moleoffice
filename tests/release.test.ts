// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The release contract: Mole Office may only offer to kill what it can describe, and may only kill
 * what it has just re-read.
 *
 * Every test here is one clause of that:
 *
 *   - `describe` names the command, the pid, the process group and how long it has been up, so
 *     a person recognises the thing without going and checking.
 *   - `alsoAffects` names every other process in the group, because killing a group kills the
 *     children and that has to be on screen BEFORE the confirmation.
 *   - `releaseAction` is null — no button — whenever any of that cannot be filled honestly, and
 *     always for a lock.
 *   - The release re-reads the machine, rebuilds the sentence, and refuses if it differs.
 *
 * THE ONE THAT MATTERS MOST is "does not kill a pid that was recycled between the read and the
 * release". This project has already acted on a stale reading of the machine once: an orphaned
 * server holding a DELETED database served stale data into a diagnosis that was written down
 * and worked from. That is an afternoon lost. The same mistake aimed at a signal is somebody
 * else's process killed, so the test asserts not only the 409 but that NOTHING was signalled
 * and the ledger row is untouched.
 *
 * Everything runs against a fake operating system, which is the point of the OsProbe seam: a
 * recycled pid, a port changing hands and a new child joining a process group are one line each
 * here, and none of them could be produced on demand against a real machine. tests/
 * resources.test.ts covers the real Linux probe, including a real group kill.
 *
 * The fake probe implements `processesInGroup`, which OsProbe in src/server/lib/resources.ts
 * does NOT have yet — see THE SEAM GAP in src/server/api/resources.ts. Until it does, real
 * process, port and GPU orphans come back with releaseAction: null and a sentence saying so,
 * which is asserted in "offers no release when it cannot list the process group".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { Orphan, OrphansResponse, ReleaseResponse } from '../src/server/api/resources.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type LibProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<LibProbe['processById']>>
type OsPort = ReturnType<LibProbe['listeningPorts']>[number]
type OsContainers = ReturnType<LibProbe['containers']>
type OsLocks = ReturnType<LibProbe['locks']>

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/**
 * A throwaway database, the ledger loaded against it, and the routes wired to a Fastify app.
 *
 * Imported dynamically AFTER freshDb() has pointed MOLE_OFFICE_DB at a temporary file, for the
 * reason helpers.ts gives. It also matters that the route file and this file get the SAME
 * instance of lib/resources.ts, so a probe installed here is the probe the routes read.
 */
async function freshLedger(): Promise<Harness> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')

  const app = Fastify({ logger: false })
  // Without this every PanelError is a 500 with no message, and every assertion about what a
  // caller is told would be testing Fastify's default rather than Mole Office's answer.
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  return { t, res, app }
}

let h: Harness
/**
 * Real children started by the last test in this file, killed by GROUP afterwards if they
 * survived. Each one is detached into its own group, so a signal here can never reach the test
 * runner's group, and nothing is ever matched by command-line pattern.
 */
let started: ChildProcess[]

beforeEach(async () => {
  h = await freshLedger()
  started = []
})

afterEach(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      // Negative pid = the whole group. These are our own detached children and nothing else.
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the normal case after a test that released it.
    }
  }
  await h.app.close()
  h.t.close()
})

// ---------------------------------------------------------------------------- the fake machine

interface FakeOptions {
  processes?: OsProcess[]
  ports?: OsPort[]
  containers?: OsContainers
  locks?: OsLocks
  ownGroup?: number
  /**
   * Whether this probe can list a process group. False is today's real LINUX_PROBE, which
   * cannot, and which therefore gets no kill buttons at all.
   */
  groupAware?: boolean
}

interface FakeProbe {
  platform: string
  processById(pid: number): OsProcess | null
  listeningPorts(): OsPort[]
  gpu(): ReturnType<LibProbe['gpu']>
  containers(): OsContainers
  locks(paths: readonly string[]): OsLocks
  ownProcessGroup(): number
  killProcessGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): void
  stopContainer(name: string): void
  processesInGroup?(pgid: number): OsProcess[]
  /** Everything that was signalled, so a test can assert that NOTHING was. */
  signals: { pgid: number; signal: string }[]
  stopped: string[]
  live: Map<number, OsProcess>
  /** Ports as they are now, so a test can hand one to a different process mid-flight. */
  portsNow: OsPort[]
  containersNow: OsContainers
}

function fakeProbe(opts: FakeOptions = {}): FakeProbe {
  const live = new Map<number, OsProcess>()
  for (const p of opts.processes ?? []) live.set(p.pid, p)
  const probe: FakeProbe = {
    platform: 'fake',
    signals: [],
    stopped: [],
    live,
    portsNow: opts.ports ?? [],
    containersNow: opts.containers ?? { available: true, containers: [] },
    processById: (pid) => live.get(pid) ?? null,
    listeningPorts: () => probe.portsNow,
    gpu: () => ({ available: true, processes: [] }),
    containers: () => probe.containersNow,
    locks: (paths) => {
      const all = opts.locks ?? { files: [], unreadable: [] }
      return {
        files: all.files.filter((f) => paths.includes(f.path)),
        unreadable: all.unreadable.filter((u) => paths.includes(u.path)),
      }
    },
    ownProcessGroup: () => opts.ownGroup ?? 999_999,
    killProcessGroup: (pgid, signal) => {
      probe.signals.push({ pgid, signal })
      for (const [pid, p] of live) if (p.pgid === pgid) live.delete(pid)
    },
    stopContainer: (name) => {
      probe.stopped.push(name)
      const reading = probe.containersNow
      if (reading.available) {
        probe.containersNow = { available: true, containers: reading.containers.filter((c) => c.name !== name) }
      }
    },
  }
  if (opts.groupAware !== false) {
    probe.processesInGroup = (pgid) => [...live.values()].filter((p) => p.pgid === pgid)
  }
  return probe
}

/** Install a fake machine. The cast is the seam: the routes only ever see OsProbe. */
function useProbe(probe: FakeProbe): FakeProbe {
  h.res.useOsProbe(probe as unknown as LibProbe)
  return probe
}

/** Mole Office's own timestamp format, for a moment `secondsAgo` in the past. */
function startedSecondsAgo(secondsAgo: number): string {
  const d = new Date(Date.now() - secondsAgo * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/**
 * THE CLOCK THE CASES THAT SAY HOW LONG A PROCESS HAS BEEN UP READ IS SET, NOT READ.
 *
 * A start time is a local stamp with no offset, so a process that started in the hour a zone repeats
 * when its clocks go back reads as an hour older. On the real clock the uptime cases went red for
 * an hour on the days that put a start there. Measured in Europe/London with the clock set: "up 10d21h"
 * for "up 10d20h" at 21:45 GMT on 4 November 2026, and on 25 October 2026 "up 4h12m" for "up 3h12m" at
 * 04:30, "up 1h45m" for "up 45m" at 02:00 and "up 1h1m" for "up 1m" at 01:30.
 * So those cases stand at local noon on 9 August 2026, a day that Europe/London, America/New_York and
 * Australia/Sydney all keep without a change of clocks in the eleven days before it. Only Date is set;
 * timers run as they do.
 */
const A_FIXED_NOON = new Date(2026, 7, 9, 12, 0, 0)

function theClockStandsAtAFixedNoon(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(A_FIXED_NOON)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

/** Ten days and twenty hours, plus half an hour of slack so the reading cannot tick mid-test. */
const TEN_DAYS_TWENTY_HOURS = 10 * 86_400 + 20 * 3_600 + 1_800

function proc(pid: number, pgid: number, command: string, startedAt = startedSecondsAgo(TEN_DAYS_TWENTY_HOURS)): OsProcess {
  // A parent of 1 in every fake here: these stand for orphans and strays, which is what that means.
  return { pid, pgid, ppid: 1, command, startedAt }
}

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

function session(state: string, title = 'session under test'): string {
  return h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state, runtime: 'claude-code' }, actor: h.t.api.HUMAN }).id
}

function endSession(id: string): void {
  h.t.api.patchRecord(id, { dataPatch: { state: 'finished' } }, h.t.api.HUMAN)
}

// ---------------------------------------------------------------------------- talking to it

async function readOrphans(): Promise<OrphansResponse> {
  const r = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
  expect(r.statusCode).toBe(200)
  return r.json() as OrphansResponse
}

/** The single orphan the machine is reporting, or a failure naming how many there were. */
async function theOrphan(): Promise<Orphan> {
  return one((await readOrphans()).orphans, 'orphan')
}

/** The release action of the single orphan, which the test expects to exist. */
async function theAction(): Promise<NonNullable<Orphan['releaseAction']>> {
  const orphan = await theOrphan()
  if (orphan.releaseAction === null) {
    throw new Error(`expected a release action, got none: ${orphan.releaseBlockedBecause ?? 'no reason given'}`)
  }
  return orphan.releaseAction
}

interface Answer {
  status: number
  body: Record<string, unknown>
  error: string
}

async function postRelease(id: string, payload: Record<string, unknown>): Promise<Answer> {
  const r = await h.app.inject({ method: 'POST', url: `/api/resources/${id}/release`, payload })
  const body = r.json() as Record<string, unknown>
  const error = typeof body['error'] === 'string' ? body['error'] : ''
  return { status: r.statusCode, body, error }
}

/** A release that must have succeeded, with the response typed. */
async function releaseOk(id: string, payload: Record<string, unknown>): Promise<ReleaseResponse> {
  const answer = await postRelease(id, payload)
  expect(answer.status, answer.error).toBe(200)
  return answer.body as unknown as ReleaseResponse
}

/** Whether the ledger still holds this row as live — the proof that nothing was tidied away. */
async function stillInTheLedger(id: string): Promise<boolean> {
  const r = await h.app.inject({ method: 'GET', url: '/api/resources' })
  const rows = (r.json() as { resources: { id: string }[] }).resources
  return rows.some((row) => row.id === id)
}

// ---------------------------------------------------------------------------- scenarios

/** One ended session holding one process, with `children` more processes in the same group. */
function orphanedProcess(opts: { pid?: number; pgid?: number; children?: OsProcess[]; groupAware?: boolean } = {}): {
  id: string
  sessionId: string
  probe: FakeProbe
  target: OsProcess
} {
  const pid = opts.pid ?? 500
  const pgid = opts.pgid ?? 400
  const target = proc(pid, pgid, 'node dist/server.js --port 8788')
  const probe = useProbe(
    fakeProbe({
      processes: [target, ...(opts.children ?? [])],
      ...(opts.groupAware === undefined ? {} : { groupAware: opts.groupAware }),
    }),
  )
  const sessionId = session('running', 'the run that left it behind')
  const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: sessionId, type: 'process', key: String(pid), actor: HUMAN }).id
  endSession(sessionId)
  return { id, sessionId, probe, target }
}

// ============================================================================ what it can say

describe('what the server can say about an orphan', () => {
  theClockStandsAtAFixedNoon()

  it('describes the command, the pid, the process group and how long it has been up', async () => {
    const { target } = orphanedProcess()
    const orphan = await theOrphan()

    expect(orphan.describe).toBe(`node dist/server.js --port 8788 — pid 500, group 400, up 10d20h`)
    expect(orphan.kind).toBe('process')
    expect(orphan.sessionTitle).toBe('the run that left it behind')
    expect(orphan.sessionId).not.toBeNull()
    // Registered and orphaned in the same breath by the test, so the age is small — what matters
    // is that it is a number of seconds and not the ten days the process has been up.
    expect(typeof orphan.ageSeconds).toBe('number')
    expect(orphan.describe).toContain(String(target.pid))
  })

  it('lists every other process in the group under alsoAffects, and never the target itself', async () => {
    orphanedProcess({
      children: [
        proc(501, 400, 'esbuild --watch', startedSecondsAgo(3 * 3_600 + 12 * 60)),
        proc(502, 400, 'tsx watch src/server/index.ts', startedSecondsAgo(45 * 60)),
        // A different group entirely: it must NOT appear, or the confirmation would name a
        // casualty that is not one.
        proc(600, 700, 'code --unity-launch', startedSecondsAgo(60)),
      ],
    })
    const action = await theAction()

    expect(action.verb).toBe('kill')
    expect(action.target).toBe('process group 400')
    expect(action.signal).toBe('SIGTERM')
    expect(action.alsoAffects).toEqual([
      'esbuild --watch — pid 501, group 400, up 3h12m',
      'tsx watch src/server/index.ts — pid 502, group 400, up 45m',
    ])
    expect(action.alsoAffects.join(' ')).not.toContain('pid 500')
    expect(action.alsoAffects.join(' ')).not.toContain('code --unity-launch')
  })

  it('writes a confirm phrase out of facts that do not change on their own', async () => {
    const { target } = orphanedProcess()
    const action = await theAction()

    // Start time, not uptime. A sentence carrying "up 10d20h" would go stale while somebody read
    // it, and a 400 for nothing teaches people that these refusals are noise.
    expect(action.confirmPhrase).toBe(
      `Kill process group 400 with SIGTERM, ending node dist/server.js --port 8788 — pid 500, group 400, ` +
        `started ${target.startedAt}, and nothing else is in that group.`,
    )
    expect(action.confirmPhrase).not.toContain('up 10d20h')
  })

  it('describes a port orphan by what is holding it, and aims the kill at the group', async () => {
    const holder = proc(500, 400, 'node dist/server.js')
    const probe = useProbe(
      fakeProbe({
        processes: [holder],
        ports: [{ port: 8788, address: '127.0.0.1', protocol: 'tcp', pid: 500 }],
      }),
    )
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN })
    endSession(s)

    const orphan = await theOrphan()
    expect(orphan.kind).toBe('port')
    expect(orphan.describe).toBe(
      'node dist/server.js — pid 500, group 400, up 10d20h, holding port 8788 (127.0.0.1:8788/tcp)',
    )
    expect(orphan.releaseAction?.target).toBe('process group 400')
    expect(orphan.releaseAction?.confirmPhrase).toContain('freeing port 8788')
    expect(probe.signals).toHaveLength(0)
  })

  it('offers no release for a lock file, and says what to do instead', async () => {
    const path = '/tmp/mole-office-release-test.lock'
    useProbe(
      fakeProbe({
        locks: { files: [{ path, sizeBytes: 12, modifiedAt: startedSecondsAgo(120) }], unreadable: [] },
      }),
    )
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: path, actor: HUMAN })
    endSession(s)

    const orphan = await theOrphan()
    expect(orphan.kind).toBe('lock')
    expect(orphan.describe).toContain('12 bytes')
    expect(orphan.releaseAction).toBeNull()
    expect(orphan.releaseBlockedBecause).toContain('will not delete lock files')
    expect(orphan.releaseBlockedBecause).toContain(`rm ${path}`)
  })

  it('offers no release when it cannot list the process group, and names what is missing', async () => {
    // NOT THE REAL LINUX_PROBE. This comment used to say it was, and that was true until
    // `processesInGroup` was implemented; the real probe lists a group and does offer the button,
    // which the `against the real operating system` block below proves against real processes.
    // What is exercised here is a probe handed in at run time that does not implement the method —
    // a fake machine, or a future port that has not written it yet.
    orphanedProcess({ groupAware: false })
    const orphan = await theOrphan()

    expect(orphan.describe).toContain('pid 500, group 400')
    expect(orphan.releaseAction).toBeNull()
    expect(orphan.releaseBlockedBecause).toContain('cannot list the other processes in group 400')
    expect(orphan.releaseBlockedBecause).toContain('processesInGroup')
    expect(orphan.releaseBlockedBecause).toContain('kill -TERM -400')
    // The refusal must name the probe that is installed, not the interface. Blaming the interface
    // is what the old sentence did, and it told every reader a working feature was missing.
    expect(orphan.releaseBlockedBecause).toContain('probe installed in this server')
    expect(orphan.releaseBlockedBecause).toContain('The Linux probe does implement it')
  })

  it('offers no release for Mole Office’s own process group', async () => {
    const probe = useProbe(fakeProbe({ processes: [proc(500, 400, 'node src/server/index.ts')], ownGroup: 400 }))
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    endSession(s)

    const orphan = await theOrphan()
    expect(orphan.releaseAction).toBeNull()
    expect(orphan.releaseBlockedBecause).toContain("Mole Office's own")
    expect(probe.signals).toHaveLength(0)
  })

  it('offers no release once the process has moved into a different group', async () => {
    const { probe } = orphanedProcess()
    // Same pid, same start time — so it is the same process — but it has left the group the
    // ledger recorded. Signalling the recorded group would hit strangers.
    const moved = probe.live.get(500)
    expect(moved).toBeDefined()
    if (moved) probe.live.set(500, { ...moved, pgid: 401 })

    const orphan = await theOrphan()
    expect(orphan.releaseAction).toBeNull()
    expect(orphan.releaseBlockedBecause).toContain('registered in process group 400')
    expect(orphan.releaseBlockedBecause).toContain('group 401 now')
  })

  it('never leaves a missing button unexplained, whatever the ledger holds', async () => {
    const path = '/tmp/mole-office-release-mixed.lock'
    useProbe(
      fakeProbe({
        processes: [proc(500, 400, 'node dist/server.js')],
        locks: { files: [{ path, sizeBytes: 1, modifiedAt: startedSecondsAgo(60) }], unreadable: [] },
        containers: {
          available: true,
          containers: [{ id: 'c0ffee1234567890', name: 'isaac-sim', image: 'nvcr.io/isaac', status: 'Up 11 days' }],
        },
      }),
    )
    const s = session('running')
    for (const [type, key] of [
      ['process', '500'],
      ['lock', path],
      ['container', 'isaac-sim'],
    ] as const) {
      h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type, key, actor: HUMAN })
    }
    endSession(s)

    const report = await readOrphans()
    expect(report.orphans).toHaveLength(3)
    for (const orphan of report.orphans) {
      expect(orphan.describe.trim()).not.toBe('')
      // The invariant the whole contract rests on: an action, or a sentence saying why not.
      // Never neither, and never both.
      expect(orphan.releaseAction === null).toBe(orphan.releaseBlockedBecause !== null)
    }
  })

  it('says where it looked, and warns when a row could not be checked at all', async () => {
    useProbe(
      fakeProbe({
        processes: [proc(500, 400, 'node dist/server.js')],
        containers: { available: false, reason: 'docker is not installed on this machine' },
      }),
    )
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN })
    endSession(s)

    const report = await readOrphans()
    expect(report.searched.join(' ')).toContain('the “Running on this machine” list — 2 live rows')
    expect(report.searched.join(' ')).toContain('the process table on fake, for pid 500')
    expect(report.searched.join(' ')).toContain('the running containers (docker), for isaac-sim')
    // "No orphans" from a report that could not look is not the same sentence as "no orphans",
    // and the difference has to survive to the wire.
    expect(report.warning).toContain('docker is not installed')
    // The unchecked row is off the wire now — the running column never read it — so the library is
    // where the row is pinned, and the door is pinned by the warning it produced above.
    expect(h.res.orphanReport('default').unchecked).toHaveLength(1)
  })

  it('says nothing when there is nothing to warn about', async () => {
    orphanedProcess()
    const report = await readOrphans()
    expect(report.warning).toBeUndefined()
    expect(one(report.orphans, 'orphan').releaseAction).not.toBeNull()
  })
})

// ============================================================================ confirming

describe('confirming before killing', () => {
  theClockStandsAtAFixedNoon()

  it('will not kill something it could have named when no phrase was sent', async () => {
    const { id, probe } = orphanedProcess()
    const action = await theAction()

    const answer = await postRelease(id, {})
    expect(answer.status).toBe(400)
    // The sentence to confirm comes back, so a caller with curl can act on the refusal rather
    // than guess at it.
    expect(answer.error).toContain(action.confirmPhrase)
    expect(probe.signals).toHaveLength(0)
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('will not kill on a phrase that is not the current one', async () => {
    const { id, probe } = orphanedProcess()
    const action = await theAction()

    const answer = await postRelease(id, { expect: `${action.confirmPhrase} ` })
    expect(answer.status).toBe(400)
    expect(answer.error).toContain('not the one this release would act on now')
    expect(probe.signals).toHaveLength(0)
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('kills the group on the right phrase, and reports every process that went', async () => {
    const { id, probe } = orphanedProcess({
      children: [proc(501, 400, 'esbuild --watch'), proc(502, 400, 'tsx watch src/server/index.ts')],
    })
    const action = await theAction()

    const released = await releaseOk(id, { expect: action.confirmPhrase })
    expect(released.released).toBe(true)
    expect(released.acted).toBe(true)
    expect(released.stillAlive).toBe(false)
    expect(released.description).toContain('node dist/server.js --port 8788')
    expect(released.confirmed).toBe(action.confirmPhrase)
    // Three processes were in the group and all three are checked individually. Assuming the
    // children died because the leader did is the assumption that leaves a port held.
    expect(released.killed).toHaveLength(3)
    expect(released.killed.join(' ')).toContain('pid 501')
    expect(released.killed.join(' ')).toContain('pid 502')
    expect(released.survived).toEqual([])
    expect(one(probe.signals, 'signal')).toEqual({ pgid: 400, signal: 'SIGTERM' })
    expect(await stillInTheLedger(id)).toBe(false)
  })

  it('records the kill and the confirmed sentence in the change log, attributed to whoever asked', async () => {
    const { id, sessionId } = orphanedProcess()
    // As item 2 of a decision says, the caller is the registering agent, in a later
    // session.
    // Keep this case about attribution; an unrelated agent may no longer stop an ended run's process.
    h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic release caller',
      data: { handle: 'claude-code', state: 'active', runtime: 'claude-code' }, actor: HUMAN })
    h.t.api.patchRecord(sessionId, { dataPatch: { servingAgent: 'claude-code' } }, HUMAN)
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
    readTheRoleCards({ guardActKeys: h.t.api.GOVERNANCE_GUARDS.flatMap((guard) => [guard.actKey, guard.personAct]) })
    const action = await theAction()

    const r = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${id}/release`,
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-session': 'sess-42' },
      payload: { expect: action.confirmPhrase },
    })
    expect(r.statusCode, r.body).toBe(200)

    const row = one(h.t.api.listChanges({ workspaceId: 'default', recordId: sessionId }).filter((c) => c.op === 'delete'), 'release change row')
    expect(row.actorType).toBe('agent')
    expect(row.actorId).toBe('claude-code')
    expect(row.sessionId).toBe('sess-42')
    expect(row.oldValue).toContain('node dist/server.js')
    expect(row.newValue).toContain('SIGTERM was sent')
    // What was on the screen when somebody said yes, kept with the kill.
    expect(row.newValue).toContain(action.confirmPhrase)
  })

  it('does not let a SIGTERM confirmation authorise a SIGKILL', async () => {
    const { id, probe, target } = orphanedProcess()
    const termPhrase = (await theAction()).confirmPhrase

    const refused = await postRelease(id, { expect: termPhrase, signal: 'SIGKILL' })
    expect(refused.status).toBe(400)
    expect(probe.signals).toHaveLength(0)

    // Escalating is a second decision, so it needs its own sentence — the one the refusal above
    // handed back, which names SIGKILL.
    const killPhrase =
      `Kill process group 400 with SIGKILL, ending node dist/server.js --port 8788 — pid 500, group 400, ` +
      `started ${target.startedAt}, and nothing else is in that group.`
    expect(refused.error).toContain(killPhrase)

    const released = await releaseOk(id, { expect: killPhrase, signal: 'SIGKILL' })
    expect(released.killed).toHaveLength(1)
    expect(one(probe.signals, 'signal')).toEqual({ pgid: 400, signal: 'SIGKILL' })
  })

  it('refuses the old phrase once another process has joined the group', async () => {
    const { id, probe } = orphanedProcess()
    const before = await theAction()
    expect(before.alsoAffects).toEqual([])

    // A child appears between the read and the confirmation. Nothing about the target changed,
    // but the blast radius did, and the person confirming never saw it.
    probe.live.set(777, proc(777, 400, 'python train.py', startedSecondsAgo(90)))

    const refused = await postRelease(id, { expect: before.confirmPhrase })
    expect(refused.status).toBe(400)
    expect(refused.error).toContain('python train.py')
    expect(probe.signals).toHaveLength(0)

    const after = await theAction()
    expect(after.alsoAffects).toEqual(['python train.py — pid 777, group 400, up 1m'])
    const released = await releaseOk(id, { expect: after.confirmPhrase })
    expect(released.killed).toHaveLength(2)
    expect(one(probe.signals, 'signal').pgid).toBe(400)
  })
})

// ============================================================================ stale readings

describe('a reading that has gone stale', () => {
  /**
   * The test this whole file is for.
   *
   * The orphan is read, the phrase is taken, and then the operating system gives pid 500 to
   * something else. Acting on the reading in the caller's hand would send SIGTERM to a stranger's
   * process group. Nothing may be signalled, and the ledger row must survive so the real orphan
   * is still reported.
   */
  it('DOES NOT kill a pid that was recycled between the read and the release', async () => {
    const { id, probe } = orphanedProcess()
    const action = await theAction()

    probe.live.set(500, proc(500, 900, 'python -m http.server 9000', startedSecondsAgo(30)))

    const answer = await postRelease(id, { expect: action.confirmPhrase })

    expect(answer.status).toBe(409)
    expect(answer.error).toContain('recycled')
    expect(answer.error).toContain('python -m http.server 9000')
    // The only assertion that actually matters: no signal reached the machine.
    expect(probe.signals).toEqual([])
    // And the stranger is still running.
    expect(probe.live.get(500)?.command).toBe('python -m http.server 9000')
    // The row stays in the ledger. A release that refused must not tidy away the evidence.
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('does not kill a port that changed hands between the read and the release', async () => {
    const holder = proc(500, 400, 'node dist/server.js')
    const probe = useProbe(
      fakeProbe({ processes: [holder], ports: [{ port: 8788, address: '127.0.0.1', protocol: 'tcp', pid: 500 }] }),
    )
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN }).id
    endSession(s)
    const action = await theAction()

    // The registered server exits and somebody else's takes the port.
    probe.live.delete(500)
    probe.live.set(900, proc(900, 950, 'python -m http.server 8788', startedSecondsAgo(20)))
    probe.portsNow = [{ port: 8788, address: '127.0.0.1', protocol: 'tcp', pid: 900 }]

    const answer = await postRelease(id, { expect: action.confirmPhrase })
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('changed hands')
    expect(probe.signals).toEqual([])
    expect(probe.live.get(900)).toBeDefined()
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('signals nothing when the session came back to life between the read and the release', async () => {
    const { id, sessionId, probe } = orphanedProcess()
    const action = await theAction()

    h.t.api.patchRecord(sessionId, { dataPatch: { state: 'running' } }, h.t.api.HUMAN)

    const answer = await postRelease(id, { expect: action.confirmPhrase })
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('still running')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('will not act on a phrase for something that has already gone', async () => {
    const { id, probe } = orphanedProcess()
    const action = await theAction()

    probe.live.delete(500)

    const answer = await postRelease(id, { expect: action.confirmPhrase })
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('Nothing is running as pid 500 now')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('tidies the ledger row for something that has already gone, when no phrase is claimed', async () => {
    const { id, probe } = orphanedProcess()
    probe.live.delete(500)

    const released = await releaseOk(id, {})
    expect(released.released).toBe(true)
    expect(released.acted).toBe(false)
    expect(released.killed).toEqual([])
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(false)
  })

  it('refuses a lock even when a phrase is invented for it', async () => {
    const path = '/tmp/mole-office-release-invented.lock'
    const probe = useProbe(
      fakeProbe({ locks: { files: [{ path, sizeBytes: 4, modifiedAt: startedSecondsAgo(60) }], unreadable: [] } }),
    )
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: path, actor: HUMAN }).id
    endSession(s)

    const answer = await postRelease(id, { expect: 'Kill the lock, it is fine' })
    expect(answer.status).toBe(400)
    expect(answer.error).toContain('will not delete lock files')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(true)
  })
})

// ============================================================================ containers

describe('containers', () => {
  function orphanedContainer(): { id: string; probe: FakeProbe } {
    const probe = useProbe(
      fakeProbe({
        containers: {
          available: true,
          containers: [{ id: 'c0ffee1234567890', name: 'isaac-sim', image: 'nvcr.io/isaac', status: 'Up 11 days' }],
        },
      }),
    )
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN }).id
    endSession(s)
    return { id, probe }
  }

  it('describes the container and says that stopping it affects nothing else on the host', async () => {
    orphanedContainer()
    const orphan = await theOrphan()

    expect(orphan.describe).toBe('container isaac-sim (nvcr.io/isaac) — Up 11 days, id c0ffee123456')
    expect(orphan.releaseAction?.verb).toBe('stop')
    expect(orphan.releaseAction?.target).toBe('container isaac-sim')
    // A container stop is not a signal Mole Office chooses, so there is no signal field to show.
    expect(orphan.releaseAction?.signal).toBeUndefined()
    expect(orphan.releaseAction?.alsoAffects).toEqual([])
    expect(orphan.releaseAction?.confirmPhrase).toContain('nothing else on this host')
  })

  it('stops it only when the phrase comes back', async () => {
    const { id, probe } = orphanedContainer()
    const action = await theAction()

    const refused = await postRelease(id, {})
    expect(refused.status).toBe(400)
    expect(probe.stopped).toEqual([])

    const released = await releaseOk(id, { expect: action.confirmPhrase })
    expect(released.released).toBe(true)
    expect(released.acted).toBe(true)
    expect(released.killed).toEqual([released.description])
    expect(probe.stopped).toEqual(['isaac-sim'])
  })
})

// ============================================================================ the real machine

describe('against the real operating system', () => {
  /**
   * Everything above runs on a fake machine, so one test runs on this one.
   *
   * It proves two things a fake cannot. First, that `describe` is built from a real command
   * line, a real process group and a real start time — the parts most likely to be wrong on a
   * machine rather than in a fixture. Second, what today's LINUX_PROBE actually does with the
   * contract: it cannot enumerate a process group, so it offers NO release action and says so,
   * while the older un-confirmed path still kills the group it was always able to kill.
   *
   * A detached shell with two background sleeps is three processes in ONE group. Hygiene: it is
   * spawned detached so it can never share this runner's group, and afterEach kills the group
   * by pid if the test left it alive.
   */
  it('describes a real process exactly, and refuses the button it cannot explain', async () => {
    const child = spawn('sh', ['-c', 'sleep 300 & echo $!; sleep 300 & echo $!; wait'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    started.push(child)
    const leader = child.pid
    expect(leader).toBeDefined()
    if (leader === undefined) return

    let out = ''
    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString()
    })
    for (let i = 0; i < 40 && out.trim().split('\n').length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 50))
    }
    const children = out
      .trim()
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
    expect(children).toHaveLength(2)

    const s = session('running', 'a real run that left a real process')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: String(leader), actor: HUMAN }).id
    endSession(s)

    const orphan = await theOrphan()
    // The real command line, the real group (a detached child leads its own), a real uptime.
    expect(orphan.describe).toMatch(new RegExp(`^sh -c sleep 300 .* — pid ${leader}, group ${leader}, up \\d+[dhms]`))
    // THE SEAM IS CLOSED. OsProbe.processesInGroup walks /proc, so the two sleeps that would
    // die with the leader can be named — and because they can be named, the button is offered.
    // This assertion used to be the opposite, and inverting it is the proof that a real kill on
    // this machine can now state its own consequences before it happens.
    const action = orphan.releaseAction
    // Narrowed rather than asserted with a bang: if this is ever null again the test should say
    // so here, not fail three lines later on a property of nothing.
    if (action === null) throw new Error('expected a release action, got null — the seam reopened')
    expect(action.verb).toBe('kill')
    expect(action.target).toContain(String(leader))
    // Every other process in the group, by name, so nobody confirms a kill and then discovers
    // what else went with it.
    expect(action.alsoAffects).toHaveLength(children.length)
    for (const pid of children) {
      expect(action.alsoAffects.join(' ')).toContain(String(pid))
    }
    expect(action.confirmPhrase.length).toBeGreaterThan(0)

    // A release with no phrase is now refused, because a phrase CAN be built. The guard only
    // ever stood down when the machine could not be described.
    const unconfirmed = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${id}/release`,
      payload: {},
    })
    expect(unconfirmed.statusCode).toBe(400)

    // With the phrase the caller was shown, it releases, and it releases the whole group.
    const released = await releaseOk(id, {
      expect: action.confirmPhrase,
      note: 'left running by a dead session',
    })
    expect(released.acted).toBe(true)
    expect(released.stillAlive).toBe(false)
    expect(h.res.LINUX_PROBE.processById(leader)).toBeNull()
    for (const pid of children) expect(h.res.LINUX_PROBE.processById(pid)).toBeNull()
  }, 20_000)
})

// ============================================================================ closing a row for something that has already stopped

/**
 * A SESSION CLOSING ITS OWN ROWS FOR PROCESSES THAT HAVE ALREADY STOPPED.
 *
 * Problem `EAjKf12JSZCn`. A session that stopped its own servers by process group could not then
 * close their rows. The refusal named the session and offered `force`, and both of those describe a
 * kill — of a process that had already gone. Every builder this week had to mark its own session
 * finished first, or send force, and the change log then recorded a forced kill that never
 * happened. Problem `KoKwVVg5F8zW` is that false log entry, stated exactly.
 *
 * The rule now: a row whose process is GONE, verified by the probe at the moment of the request,
 * may be released by ITS OWN SESSION with no force and no signal. A row whose process is alive
 * keeps the refusal, and so does a caller who is not the owning session.
 */
describe('a session closes its own rows for processes that have already stopped', () => {
  /** One RUNNING session holding one process row, with the process alive on the fake machine. */
  function runningSessionWithAProcess(): { id: string; sessionId: string; probe: FakeProbe } {
    const target = proc(700, 600, 'node dist/server.js --port 29901')
    const probe = useProbe(fakeProbe({ processes: [target] }))
    const sessionId = session('running', 'the run that is still going')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: sessionId,
      type: 'process',
      key: '700',
      actor: HUMAN,
    }).id
    return { id, sessionId, probe }
  }

  /** A release sent AS a session, which is how an agent tidying up after itself sends one. */
  async function releaseAsSession(id: string, sessionRef: string, payload: Record<string, unknown>): Promise<Answer> {
    const r = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${id}/release`,
      headers: {
        'x-mole-office-session': sessionRef,
        // Claiming a session means claiming an identity, and the server refuses one without the
        // other. lib/http.ts says so in the refusal.
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest/release',
      },
      payload,
    })
    const body = r.json() as Record<string, unknown>
    const error = typeof body['error'] === 'string' ? body['error'] : ''
    return { status: r.statusCode, body, error }
  }

  /** The released row, read back out of the ledger with the released ones included. */
  async function releasedRow(id: string): Promise<{ releasedAt: string | null; releaseNote: string | null }> {
    const r = await h.app.inject({ method: 'GET', url: '/api/resources?includeReleased=true' })
    const rows = (r.json() as { resources: { id: string; releasedAt: string | null; releaseNote: string | null }[] }).resources
    return one(rows.filter((row) => row.id === id), 'released row')
  }

  it('closes the row when the process is gone, with no force, no signal and no session to end', async () => {
    const { id, sessionId, probe } = runningSessionWithAProcess()
    // Stopped by its own process group, which is what the session did before it asked.
    probe.live.delete(700)

    const answer = await releaseAsSession(id, sessionId, {})
    expect(answer.status, answer.error).toBe(200)
    const released = answer.body as unknown as ReleaseResponse
    expect(released.released).toBe(true)
    // NOTHING WAS SIGNALLED. This is bookkeeping, and a kill would have hit whatever holds that
    // number now.
    expect(released.acted).toBe(false)
    expect(probe.signals).toEqual([])
    expect(released.killed).toEqual([])
    expect(await stillInTheLedger(id)).toBe(false)

    // AND THE ROW SAYS WHAT HAPPENED. "Released" alone reads as "something was stopped".
    const row = await releasedRow(id)
    expect(row.releasedAt).not.toBeNull()
    expect(row.releaseNote).toContain('closed after the process was found gone')
    // The change log does not say this was forced, because it was not.
    expect(row.releaseNote).not.toContain('forced')
  })

  it('still refuses while the process is alive, and still names the session', async () => {
    const { id, sessionId, probe } = runningSessionWithAProcess()

    const answer = await releaseAsSession(id, sessionId, {})
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('still running')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('closes a gone row for a caller who is not the session that registered it', async () => {
    const { id, probe } = runningSessionWithAProcess()
    // THE PROCESS HAS STOPPED while the session that registered the row is still running. Problem
    // 3d1d1pmydN5Y: a maintainer had no honest way to close the old row, because the refusal below
    // demands a forced signal for a process that is already gone.
    probe.live.delete(700)
    const somebodyElse = session('running', 'a different run entirely')

    const answer = await releaseAsSession(id, somebodyElse, {})
    expect(answer.status, answer.error).toBe(200)
    const released = answer.body as unknown as ReleaseResponse
    expect(released.released).toBe(true)
    // NOTHING WAS SIGNALLED. Closing a row whose process is gone is bookkeeping, and a signal would
    // have hit whatever holds that number now.
    expect(released.acted).toBe(false)
    expect(released.outcome).toContain('a caller other than the session that registered it')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(false)

    // AND THE ROW SAYS WHO CLOSED IT AND WHY. "Released" alone reads as "something was stopped".
    const row = await releasedRow(id)
    expect(row.releaseNote).toContain('closed after the process was found gone')
    expect(row.releaseNote).toContain('by a caller other than the session that registered it')
    expect(row.releaseNote).not.toContain('forced')
  })

  it('still refuses a caller who is not the session that registered it while the process is alive', async () => {
    const { id, probe } = runningSessionWithAProcess()
    const somebodyElse = session('running', 'a different run entirely')

    // THE PROCESS IS ALIVE, so this is not bookkeeping: a signal would interrupt work in progress.
    // The gone branch does not apply, and the refusal below still names the session and offers
    // `force`, whatever caller asked.
    const answer = await releaseAsSession(id, somebodyElse, {})
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('still running')
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(true)
  })

  it('closes a port row whose listener has gone, for the session that registered it', async () => {
    const target = proc(701, 601, 'node dist/server.js --port 29902')
    const probe = useProbe(fakeProbe({
      processes: [target],
      ports: [{ port: 29902, address: '127.0.0.1', protocol: 'tcp', pid: 701 }],
    }))
    const sessionId = session('running', 'the run holding a port')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: sessionId,
      type: 'port',
      key: '29902',
      actor: HUMAN,
    }).id

    // The server went, so nothing is listening on the number any more.
    probe.live.delete(701)
    probe.portsNow = []

    const answer = await releaseAsSession(id, sessionId, {})
    expect(answer.status, answer.error).toBe(200)
    expect(probe.signals).toEqual([])
    expect(await stillInTheLedger(id)).toBe(false)
    expect((await releasedRow(id)).releaseNote).toContain('closed after the process was found gone')
  })
})

/**
 * A ROW WHOSE PID OR PORT IS NOW HELD BY A DIFFERENT PROCESS IS CLOSED, AND NOTHING IS SIGNALLED.
 *
 * Problem kmdLJ_7HADfN. Five port rows stayed open for weeks: the process each row named had exited
 * and a later server had taken the port. The release door refused every one of them. For a row whose
 * session had ended it said to tidy the row "by hand", which no door does; for a row whose session
 * read `orphaned` it said closing it would interrupt work in progress. Withdrawing is only for the
 * session that wrote the row. So nobody could close them.
 *
 * Now the release door closes such a row when no confirm phrase is sent. The process now holding
 * the number is left alone, and the row's note says the number is held by a different process. A
 * row whose own process is still running keeps the refusal.
 */
describe('a row whose number is now held by a different process', () => {
  /** A port row for a server that has exited, with a later server now holding the same port. */
  function aPortThatChangedHands(sessionStateAfter: 'finished' | 'orphaned'): { id: string; probe: FakeProbe } {
    const registered = proc(510, 410, 'node vite --port 5174')
    const probe = useProbe(
      fakeProbe({ processes: [registered], ports: [{ port: 5174, address: '127.0.0.1', protocol: 'tcp', pid: 510 }] }),
    )
    const s = session('running', 'the run that started the first server')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '5174', actor: HUMAN }).id
    h.t.api.patchRecord(s, { dataPatch: { state: sessionStateAfter } }, h.t.api.HUMAN)

    // The registered server exits, and a later one takes the port.
    probe.live.delete(510)
    probe.live.set(920, proc(920, 960, 'node tools/serve-dev.mjs --built', startedSecondsAgo(600)))
    probe.portsNow = [{ port: 5174, address: '127.0.0.1', protocol: 'tcp', pid: 920 }]
    return { id, probe }
  }

  async function releaseAsAnotherSession(id: string): Promise<Answer> {
    const somebodyElse = session('running', 'a maintainer tidying the ledger')
    const r = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${id}/release`,
      headers: {
        'x-mole-office-session': somebodyElse,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest/release',
      },
      payload: { note: 'tidying the ledger' },
    })
    const body = r.json() as Record<string, unknown>
    return { status: r.statusCode, body, error: typeof body['error'] === 'string' ? body['error'] : '' }
  }

  async function noteOf(id: string): Promise<string | null> {
    const r = await h.app.inject({ method: 'GET', url: '/api/resources?includeReleased=true' })
    const rows = (r.json() as { resources: { id: string; releaseNote: string | null }[] }).resources
    return one(rows.filter((row) => row.id === id), 'released row').releaseNote
  }

  it('closes a port row whose session ended, and signals nothing', async () => {
    const { id, probe } = aPortThatChangedHands('finished')

    const answer = await releaseAsAnotherSession(id)
    expect(answer.status, answer.error).toBe(200)
    const released = answer.body as unknown as ReleaseResponse
    expect(released.acted).toBe(false)
    expect(released.killed).toEqual([])
    expect(released.outcome).toContain('Nothing was signalled')
    expect(released.outcome).toContain('changed hands')
    // NOTHING WAS SIGNALLED, and the later server is still running.
    expect(probe.signals).toEqual([])
    expect(probe.live.get(920)?.command).toBe('node tools/serve-dev.mjs --built')
    expect(await stillInTheLedger(id)).toBe(false)

    const note = await noteOf(id)
    expect(note).toContain('closed after the process was found gone')
    expect(note).toContain('the port is now held by a different process, which was not signalled')
    expect(note).not.toContain('forced')
  })

  it('closes a port row whose session reads orphaned, without marking the session finished', async () => {
    const { id, probe } = aPortThatChangedHands('orphaned')

    const answer = await releaseAsAnotherSession(id)
    expect(answer.status, answer.error).toBe(200)
    expect(probe.signals).toEqual([])
    expect(probe.live.get(920)).toBeDefined()
    expect(await stillInTheLedger(id)).toBe(false)
    expect(await noteOf(id)).toContain('by a caller other than the session that registered it')
  })

  it('closes a process row whose pid was given to a different process, and signals nothing', async () => {
    const { id, probe } = orphanedProcess()
    probe.live.set(500, proc(500, 900, 'python -m http.server 9000', startedSecondsAgo(30)))

    const released = await releaseOk(id, {})
    expect(released.acted).toBe(false)
    expect(probe.signals).toEqual([])
    expect(probe.live.get(500)?.command).toBe('python -m http.server 9000')
    expect(await stillInTheLedger(id)).toBe(false)
    expect(await noteOf(id)).toContain('the pid is now held by a different process, which was not signalled')
  })

  it('still refuses a port row whose own server is running, while its session reads orphaned', async () => {
    const registered = proc(511, 411, 'node vite --port 5175')
    const probe = useProbe(
      fakeProbe({ processes: [registered], ports: [{ port: 5175, address: '127.0.0.1', protocol: 'tcp', pid: 511 }] }),
    )
    const s = session('running', 'the run that started the server')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '5175', actor: HUMAN }).id
    h.t.api.patchRecord(s, { dataPatch: { state: 'orphaned' } }, h.t.api.HUMAN)

    const answer = await releaseAsAnotherSession(id)
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('would interrupt work in progress')
    expect(probe.signals).toEqual([])
    expect(probe.live.get(511)).toBeDefined()
    expect(await stillInTheLedger(id)).toBe(true)
  })
})
