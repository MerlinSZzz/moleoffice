// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The resource ledger.
 *
 * Two kinds of test live here and they are kept apart on purpose.
 *
 * The FAKE PROBE tests drive lib/resources.ts against a plain object implementing OsProbe. That
 * is the whole point of having one operating-system seam: pid reuse, a port changing hands, a
 * missing nvidia-smi and a docker daemon that is down are all one-line setups, and none of them
 * could be produced reliably against a real machine.
 *
 * The REAL PROBE tests exercise the single Linux implementation against this machine, and one of
 * them starts a real process group of three processes and kills it. That test is the proof the
 * feature works: everything else could pass with a group kill that only signalled the leader.
 *
 * Process hygiene: every child started here is detached into its OWN group (so it can never be
 * this test runner's group), its pid is remembered, and afterEach SIGKILLs the group if it
 * survived. Nothing is matched by command-line pattern.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { at, freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = ReturnType<OsProbe['processById']>

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/**
 * A throwaway database, the ledger loaded against it, and a Fastify app wired to the routes.
 *
 * Everything is imported dynamically AFTER freshDb has reset the module registry and pointed
 * MOLE_OFFICE_DB at a temporary file, for the reason helpers.ts gives: a normal top-level import
 * would have opened the wrong database before any test code ran. It also matters here that the
 * api file and this file get the SAME instance of lib/resources.ts, so a probe installed below
 * is the probe the routes use.
 */
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
/** Detached children started by a test, killed by group in afterEach if they survived. */
let started: ChildProcess[]
let servers: Server[]
let tempDirs: string[]
let savedLockPaths: string | undefined

// One office for this file; each case rolls its writes and schema changes back.
beforeAll(async () => {
  h = await freshLedger()
})

afterAll(async () => {
  await h.app.close()
  h.t.close()
})

beforeEach(() => {
  h.t.client.sqlite.exec('SAVEPOINT ledger_case')
  h.res.useOsProbe(h.res.LINUX_PROBE)
  started = []
  servers = []
  tempDirs = []
  savedLockPaths = process.env.MOLE_OFFICE_LOCK_PATHS
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
  for (const s of servers) s.close()
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
  if (savedLockPaths === undefined) delete process.env.MOLE_OFFICE_LOCK_PATHS
  else process.env.MOLE_OFFICE_LOCK_PATHS = savedLockPaths
  h.t.client.sqlite.exec('ROLLBACK TO ledger_case; RELEASE ledger_case')
})

// ---------------------------------------------------------------------------- small helpers

/** Run something that must fail with a PanelError of a given status; hand back the error. */
async function fails(fn: () => unknown, status: number): Promise<Error> {
  try {
    await fn()
  } catch (err) {
    if (!(err instanceof h.t.api.PanelError)) throw new Error(`expected a PanelError, got ${String(err)}`)
    if (err.status !== status) throw new Error(`expected status ${status}, got ${err.status} — "${err.message}"`)
    return err
  }
  throw new Error(`expected a PanelError with status ${status}, but the call returned normally`)
}

/** A session record in a given state, and its id. */
function session(state: string, title = 'session under test'): string {
  return h.t.api.createRecord({ workspaceId: 'default',
    kind: 'session',
    title,
    data: { state, runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

function endSession(id: string, state: 'finished' | 'crashed' = 'finished'): void {
  h.t.api.patchRecord(id, { dataPatch: { state } }, h.t.api.HUMAN)
}

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A directory that afterEach removes. */
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'mole-office-res-'))
  tempDirs.push(d)
  return d
}

// ---------------------------------------------------------------------------- the fake probe

interface FakeOptions {
  processes?: NonNullable<OsProcess>[]
  ports?: ReturnType<OsProbe['listeningPorts']>
  gpu?: ReturnType<OsProbe['gpu']>
  containers?: ReturnType<OsProbe['containers']>
  locks?: ReturnType<OsProbe['locks']>
  ownGroup?: number
  /** Process groups that survive SIGTERM, so the "it ignored the signal" path can be tested. */
  stubborn?: number[]
}

interface FakeProbe extends OsProbe {
  signals: { pgid: number; signal: string }[]
  stopped: string[]
  live: Map<number, NonNullable<OsProcess>>
}

/**
 * An operating system in about forty lines.
 *
 * This is the argument for the seam, stated as code: every dangerous situation the ledger has
 * to refuse can be set up here exactly, and no test has to hope that a real machine happens to
 * be in the right state.
 */
function fakeProbe(opts: FakeOptions = {}): FakeProbe {
  const live = new Map<number, NonNullable<OsProcess>>()
  for (const p of opts.processes ?? []) live.set(p.pid, p)
  const stubborn = new Set(opts.stubborn ?? [])
  const probe: FakeProbe = {
    platform: 'fake',
    // Process state is synthetic; avatar uploads still use the real bounded fixture codec.
    runAvatarCodec: input => h.res.LINUX_PROBE.runAvatarCodec!(input),
    signals: [],
    stopped: [],
    live,
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid: number) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => opts.ports ?? [],
    gpu: () => opts.gpu ?? { available: true, processes: [] },
    containers: () => opts.containers ?? { available: true, containers: [] },
    locks: () => opts.locks ?? { files: [], unreadable: [] },
    ownProcessGroup: () => opts.ownGroup ?? 999_999,
    killProcessGroup: (pgid, signal) => {
      probe.signals.push({ pgid, signal })
      if (stubborn.has(pgid) && signal !== 'SIGKILL') return
      for (const [pid, p] of live) if (p.pgid === pgid) live.delete(pid)
    },
    stopContainer: (name) => {
      probe.stopped.push(name)
    },
  }
  return probe
}

function proc(pid: number, pgid: number, command: string, startedAt = '2026-08-08 09:00:00'): NonNullable<OsProcess> {
  // A parent of 1 in every fake here: these stand for orphans and strays, which is what that means.
  return { pid, pgid, ppid: 1, command, startedAt }
}

// ============================================================ ended runs close only gone rows

describe('ended runs’ process rows (ssE_OrIgHoye)', () => {
  function runningRow(probe: FakeProbe, pid: number, state = 'running') {
    probe.live.set(pid, proc(pid, pid, 'synthetic sandbox command'))
    const run = session(state, `synthetic run ${pid}`)
    const row = h.res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: String(pid), actor: HUMAN })
    return { run, row }
  }

  function stored(id: string) {
    return h.t.client.sqlite.prepare('SELECT * FROM session_resources WHERE id = ?').get(id) as {
      released_at: string | null; release_note: string | null; released_by: string | null
    }
  }

  /** Mutation: remove closeTheGoneProcessRowsOfAnEndedRun from patchRecord's ending transaction. */
  it.each(['finished', 'crashed', 'orphaned'])('closes a gone process in the same write that records %s', (state) => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 501)
    probe.live.delete(501)

    // A failed close must roll the session write back too; an after-the-write close cannot do so.
    h.t.client.sqlite.exec(`CREATE TRIGGER refuse_this_close BEFORE UPDATE OF released_at ON session_resources
      BEGIN SELECT RAISE(ABORT, 'synthetic close failure'); END`)
    const changesBefore = h.t.api.listChanges({ workspaceId: 'default', recordId: run }).length
    expect(() => h.t.api.patchRecord(run, { dataPatch: { state } }, HUMAN)).toThrow('synthetic close failure')
    expect(h.t.api.getRecord(run)?.data['state']).toBe('running')
    expect(stored(row.id).released_at).toBeNull()
    expect(h.t.api.listChanges({ workspaceId: 'default', recordId: run })).toHaveLength(changesBefore)
    h.t.client.sqlite.exec('DROP TRIGGER refuse_this_close')

    h.t.api.patchRecord(run, { dataPatch: { state } }, HUMAN)
    expect(stored(row.id).released_at).not.toBeNull()
    expect(stored(row.id).released_by).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    // Mutation: use the standing for an ordinary end instead of the recorded state.
    expect(stored(row.id).release_note).toMatch(new RegExp(`^The run ${run} ended as ${state}\\.`))
    expect(stored(row.id).release_note).toContain('Nothing is running as pid 501')
    expect(stored(row.id).release_note).toContain('Nothing was signalled')
    expect(h.t.api.listChanges({ workspaceId: 'default', recordId: run }).some((change) => change.field === 'resource.process' && change.newValue?.includes('The row was closed'))).toBe(true)
    expect(probe.signals).toEqual([])
  })

  /** Mutation: remove the liveness catch in closeAnEndedRunsGoneProcess; the run's end is refused. */
  it('ends a run when one process cannot be checked, keeps its error, and closes its gone row', () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 505)
    probe.live.set(506, proc(506, 506, 'synthetic sandbox command'))
    const gone = h.res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: '506', actor: HUMAN })
    probe.live.delete(506)
    // Rows are read newest first: prove the gone row is reached after the throwing one.
    h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 12:00:00', row.id)
    h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 11:00:00', gone.id)
    const error = 'Synthetic /proc/505/stat could not be read: permission denied.'
    let readings = 0
    probe.processById = (pid) => {
      // The claims check reads first. This test fails the later reading in the cleanup helper.
      if (pid === 505 && readings++ > 0) throw new h.t.api.PanelError(error, 500)
      return probe.live.get(pid) ?? null
    }

    expect(() => endSession(run)).not.toThrow()
    expect(h.t.api.getRecord(run)?.data['state']).toBe('finished')
    expect(stored(row.id).released_at).toBeNull()
    expect(stored(row.id).released_by).toBeNull()
    expect(stored(row.id).release_note).toBe(
      `The run ${run} ended as finished. Its process could not be checked: ${error} The row stays open. Nothing was signalled.`,
    )
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toContain('Nothing is running as pid 506')
    expect(probe.signals).toEqual([])
    expect(probe.stopped).toEqual([])
  })

  /**
   * wNjQEfclwxjJ, lBw2WAGMOKwF, UQQeEtGCHiRn; USER.md invariants 2 and 5.
   * Mutation: remove the catch in processLivenessForRun; the first reading refuses the run's end.
   * Removing closeAnEndedRunsGoneProcess's catch also refuses the end, at the later reading.
   * Mutation: ignore unknown in howTheRunStands; R3 releases the held claim.
   * Mutation: answer unknown as the ledger; R3 calls the unchecked process alive.
   */
  it('ends a run whose process is unreadable from its first reading, revokes its key, and keeps its claim held', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 505)
    const claims = await import('../src/server/lib/claims.ts')
    const keys = await import('../src/server/lib/keys.ts')
    const key = keys.makeARunKey('synthetic-worker', null)
    h.t.api.patchRecord(run, { dataPatch: { extra: { runKeyId: key.heldKeyId } } }, HUMAN)
    const filed = claims.fileAClaim({
      workspaceId: 'default', claimant: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, run,
      things: [{ what: 'path', id: 'src/server/lib' }],
    }, HUMAN)
    expect(keys.theLiveKeyWithThisId(key.heldKeyId)).not.toBeNull()
    probe.live.set(506, proc(506, 506, 'synthetic sandbox command'))
    const gone = h.res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: '506', actor: HUMAN })
    probe.live.delete(506)
    h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 12:00:00', row.id)
    h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 11:00:00', gone.id)
    const error = 'Synthetic /proc/505/stat could not be read: permission denied.'
    probe.processById = (pid) => {
      if (pid === 505) throw new h.t.api.PanelError(error, 500)
      return probe.live.get(pid) ?? null
    }

    expect(() => endSession(run)).not.toThrow()
    expect(h.t.api.getRecord(run)?.data['state']).toBe('finished')
    expect(keys.theLiveKeyWithThisId(key.heldKeyId)).toBeNull()
    const revoked = h.t.client.sqlite.prepare('SELECT revoked_at, revoked_because FROM held_keys WHERE id = ?')
      .get(key.heldKeyId) as { revoked_at: string | null; revoked_because: string | null }
    expect(revoked.revoked_at).not.toBeNull()
    expect(revoked.revoked_because).toContain(run)
    expect(stored(row.id).released_at).toBeNull()
    expect(stored(row.id).released_by).toBeNull()
    expect(stored(row.id).release_note).toBe(
      `The run ${run} ended as finished. Its process could not be checked: ${error} The row stays open. Nothing was signalled.`,
    )
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toContain('Nothing is running as pid 506')
    const held = claims.claimsIn('default').find((one) => one.id === filed.claim.id)
    expect(held).toMatchObject({ state: 'live', from: 'a process that could not be checked', releasedAt: null, releasedBecause: null })
    expect(probe.signals).toEqual([])
    expect(probe.stopped).toEqual([])
  })

  /** Mutation: remove the liveness catch in closeAnEndedRunsGoneProcess; the sweep closes nothing. */
  it('sweeps other ended runs when one process cannot be checked and names its error in left', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const gone = ['finished', 'crashed', 'orphaned'].map((state, i) => runningRow(probe, 540 + i, state))
    for (const item of gone) probe.live.delete(Number(item.row.key))
    const { run, row } = runningRow(probe, 543, 'finished')
    // The throwing row is read before the gone rows, even if registration timestamps tie.
    h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 12:00:00', row.id)
    for (const item of gone) {
      h.t.client.sqlite.prepare('UPDATE session_resources SET registered_at = ? WHERE id = ?').run('2026-09-30 11:00:00', item.row.id)
    }
    const error = 'Synthetic /proc/543/stat is not in the expected format.'
    probe.processById = (pid) => {
      if (pid === 543) throw new h.t.api.PanelError(error, 500)
      return probe.live.get(pid) ?? null
    }

    const response = await h.app.inject({ method: 'POST', url: '/api/resources/sweep' })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json<import('../src/server/lib/resources.ts').EndedRunRows>()
    const note = `The run ${run} ended as finished. Its process could not be checked: ${error} The row stays open. Nothing was signalled.`
    expect(result.closed.map((item) => item.resource.id).sort()).toEqual(gone.map((item) => item.row.id).sort())
    for (const item of gone) expect(stored(item.row.id).released_at).not.toBeNull()
    expect(result.left).toHaveLength(1)
    expect(result.left[0]?.resource.id).toBe(row.id)
    expect(result.left[0]?.reason).toBe(note)
    expect(result.left[0]?.resource.releaseNote).toBe(note)
    expect(stored(row.id).release_note).toBe(note)
    expect(stored(row.id).released_at).toBeNull()
    expect(stored(row.id).released_by).toBeNull()
    expect(probe.signals).toEqual([])
    expect(probe.stopped).toEqual([])
  })

  /** Mutation: remove the gone check in closeAnEndedRunsGoneProcess, closing a live row. */
  it('keeps an ended run’s live process open with its reason and signals nothing', () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 502)
    endSession(run)
    expect(stored(row.id).released_at).toBeNull()
    expect(stored(row.id).release_note).toContain('ended as finished')
    expect(stored(row.id).release_note).toContain('Its process has not ended')
    expect(probe.signals).toEqual([])
    expect(probe.live.has(502)).toBe(true)
  })

  /** Mutation: remove the start-time mismatch branch in processLiveness. */
  it('closes the old row when a different process holds its pid and leaves the stranger alive', () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 503)
    probe.live.set(503, proc(503, 503, 'synthetic stranger', '2026-09-30 12:00:00'))
    endSession(run)
    expect(stored(row.id).released_at).not.toBeNull()
    expect(stored(row.id).release_note).toContain('in use again')
    expect(stored(row.id).release_note).toContain('synthetic stranger')
    expect(probe.signals).toEqual([])
    expect(probe.live.get(503)?.command).toBe('synthetic stranger')
  })

  /** Mutation: remove the gone check, treating an unknown identity as gone. */
  it('keeps a row with no start time open because a held pid cannot be identified', () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { run, row } = runningRow(probe, 504)
    h.t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(row.id)
    endSession(run)
    expect(stored(row.id).released_at).toBeNull()
    expect(stored(row.id).release_note).toContain('could not be checked')
    expect(probe.signals).toEqual([])
  })

  /** Mutation: remove the sweep's theRunHasEnded guard, closing a live run's gone row. */
  it('sweeps ended runs’ gone rows, names closed and left rows, and sends no signal', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    // These are historical rows: the runs were already recorded ended before their rows were filed.
    const gone = ['finished', 'crashed', 'orphaned'].map((state, i) => runningRow(probe, 510 + i, state))
    for (const item of gone) probe.live.delete(Number(item.row.key))
    const reused = runningRow(probe, 513, 'orphaned')
    probe.live.set(513, proc(513, 513, 'synthetic stranger', '2026-09-30 12:00:00'))
    const alive = runningRow(probe, 514, 'finished')
    const active = runningRow(probe, 515)
    probe.live.delete(515)
    const idle = runningRow(probe, 516, 'idle')
    probe.live.delete(516)
    const unknown = runningRow(probe, 517, 'unknown')
    probe.live.delete(517)
    const noAnchor = runningRow(probe, 518, 'crashed')
    h.t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(noAnchor.row.id)
    const port = h.res.registerResource({ workspaceId: 'default', sessionRecordId: alive.run, type: 'port', key: '5199', actor: HUMAN })

    const response = await h.app.inject({ method: 'POST', url: '/api/resources/sweep' })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json<import('../src/server/lib/resources.ts').EndedRunRows>()
    expect(result.closed.map((item) => item.resource.id).sort()).toEqual([...gone, reused].map((item) => item.row.id).sort())
    expect(result.left.map((item) => item.resource.id).sort()).toEqual([alive.row, active.row, idle.row, unknown.row, noAnchor.row, port].map((row) => row.id).sort())
    for (const item of result.closed) {
      expect(item.reason).toContain('The row was closed')
      expect(stored(item.resource.id).released_at).not.toBeNull()
      expect(stored(item.resource.id).release_note).toBe(item.reason)
    }
    for (const item of result.left) {
      expect(item.reason.length).toBeGreaterThan(0)
      expect(stored(item.resource.id).released_at).toBeNull()
    }
    expect(result.left.find((item) => item.resource.id === active.row.id)?.reason).toContain('has not been recorded as ended')
    expect(result.left.find((item) => item.resource.id === alive.row.id)?.reason).toContain('Its process has not ended')
    expect(probe.signals).toEqual([])
    expect(probe.stopped).toEqual([])
    expect(probe.live.get(513)?.command).toBe('synthetic stranger')
  })

  /** Mutation: remove the sweep's caller guard. */
  it('refuses an ordinary agent and other system callers, and allows a secretary and the ledger’s tending', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
    readTheRoleCards({ guardActKeys: h.t.api.GOVERNANCE_GUARDS.flatMap((guard) => [guard.actKey, guard.personAct]) })
    const { row } = runningRow(probe, 520, 'finished')
    probe.live.delete(520)
    h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic worker', data: { handle: 'sweep-worker', runtime: 'claude-code', state: 'active' }, actor: HUMAN })
    const denied = await h.app.inject({ method: 'POST', url: '/api/resources/sweep', headers: {
      'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sweep-worker',
    } })
    expect(denied.statusCode, denied.body).toBe(403)
    expect(denied.json().error).toContain('Only the person, a secretary, or the ledger')
    expect(stored(row.id).released_at).toBeNull()
    expect(() => h.res.sweepTheGoneProcessRowsOfEndedRuns('default', { type: 'system', id: 'some-other-system' })).toThrow('Only the person')

    h.t.api.throughTheCardDoor(() => h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic secretary', data: {
      handle: 'sweep-secretary', runtime: 'claude-code', state: 'active', role: 'secretary',
    }, actor: HUMAN }))
    const allowed = await h.app.inject({ method: 'POST', url: '/api/resources/sweep', headers: {
      'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sweep-secretary',
    } })
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(allowed.json().closed.map((item: { resource: { id: string } }) => item.resource.id)).toEqual([row.id])
    const historical = runningRow(probe, 521, 'crashed')
    probe.live.delete(521)
    expect(h.res.sweepTheGoneProcessRowsOfEndedRuns('default', { type: 'system', id: theOfficesOwnId(h.t) }).closed.map((item) => item.resource.id)).toEqual([historical.row.id])
    expect(probe.signals).toEqual([])
  })

  /** Mutation: call the ended-run sweep from the ledger GET handler. */
  it('leaves gone rows unchanged when the ledger and machine status are read', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const { row } = runningRow(probe, 530, 'finished')
    probe.live.delete(530)
    const before = stored(row.id)
    const changesBefore = h.t.api.listChanges({ workspaceId: 'default', recordId: row.sessionRecordId }).length
    for (const url of ['/api/resources', '/api/resources?includeReleased=true', '/api/resources/orphans', '/api/resources/servers', '/api/resources/scan']) {
      const answer = await h.app.inject({ method: 'GET', url })
      expect(answer.statusCode, answer.body).toBe(200)
      expect(stored(row.id), url).toEqual(before)
    }
    expect(h.t.api.listChanges({ workspaceId: 'default', recordId: row.sessionRecordId })).toHaveLength(changesBefore)
    expect(probe.signals).toEqual([])
  })
})

// ============================================================================ the OS seam

describe('the Linux probe — the one implementation that touches the OS', () => {
  it('reads this very process, with its process group and command line', () => {
    const self = h.res.LINUX_PROBE.processById(process.pid)
    expect(self).not.toBeNull()
    expect(self?.pid).toBe(process.pid)
    expect(self?.command).toContain('node')
    expect(self?.pgid).toBe(h.res.LINUX_PROBE.ownProcessGroup())
    expect(self?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('reads the whole process table, including this process and its working directory', () => {
    // A WHOLE TABLE AND NOT ONE PROCESS, since a single-entry answer would pass every other check
    // here. It is held to three processes this test knows are there: itself, its parent, and a
    // child it starts before it reads. It used to be held to "more than 10", reasoning that a
    // desktop has several hundred, and a quiet sandbox has 8 (acceptance finding 75, 24 September
    // 2026). MUTATION PROOF, that day, alone in src/server/lib/resources.ts: processTable answering
    // with this process only, and this goes red on the parent.
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    started.push(child)
    const childPid = child.pid
    if (childPid === undefined) throw new Error('sleep could not be started, so there is no child of this test to find')

    // The method GET /api/sessions is built on. It is here, on the probe, rather than in the
    // session adapters, because two readers of one operating system is what A7 exists to stop.
    const table = h.res.LINUX_PROBE.processTable?.()
    if (table === undefined) throw new Error('the Linux probe does not implement processTable, so nothing can read what is running')
    if (!table.ok) throw new Error(`/proc could not be read on this machine: ${table.reason}`)

    const self = one(table.processes.filter((p) => p.pid === process.pid), 'this process in the table')
    expect(self.command).toContain('node')
    // The working directory is the reason this method exists rather than a loop over processById:
    // a running agent is joined to the project it is working in by its cwd, and nothing else.
    expect(self.cwd).not.toBeNull()

    one(table.processes.filter((p) => p.pid === process.ppid), 'the parent of this process in the table')
    one(table.processes.filter((p) => p.pid === childPid), 'the child this test started, in the table')
  })

  it('returns null for a pid that has exited, rather than inventing one', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    started.push(child)
    const pid = child.pid
    expect(pid).toBeDefined()
    if (pid === undefined) return
    expect(h.res.LINUX_PROBE.processById(pid)).not.toBeNull()

    process.kill(-pid, 'SIGKILL')
    for (let i = 0; i < 20 && h.res.LINUX_PROBE.processById(pid) !== null; i += 1) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(h.res.LINUX_PROBE.processById(pid)).toBeNull()
  })

  it('finds a port this process is listening on, and attributes it to this process', async () => {
    const port = await listenOnAFreePort()
    const found = h.res.LINUX_PROBE.listeningPorts().filter((p) => p.port === port)
    expect(found.length).toBeGreaterThan(0)
    expect(found.some((p) => p.pid === process.pid)).toBe(true)
    expect(one(found.filter((p) => p.address === '127.0.0.1'), 'loopback listener').protocol).toBe('tcp')
  })

  it('never reports the GPU as zero: either a reading, or a sentence saying it could not look', () => {
    const gpu = h.res.LINUX_PROBE.gpu()
    if (gpu.available) {
      for (const p of gpu.processes) expect(Number.isFinite(p.usedMib)).toBe(true)
    } else {
      expect(gpu.reason).toContain('NOT a reading of zero')
      expect(gpu.reason.length).toBeGreaterThan(20)
    }
  })

  it('says why containers could not be listed, rather than reporting none', () => {
    const c = h.res.LINUX_PROBE.containers()
    if (!c.available) expect(c.reason).toContain('not a reading of none')
    else expect(Array.isArray(c.containers)).toBe(true)
  })

  it('finds lock files by name, ignores other files, and reports paths it could not read', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'run.lock'), 'pid 1')
    writeFileSync(join(dir, 'notes.txt'), 'not a lock')
    const missing = join(dir, 'gone-away')

    const reading = h.res.LINUX_PROBE.locks([dir, missing])
    expect(reading.files.map((f) => f.path)).toEqual([join(dir, 'run.lock')])
    expect(one(reading.unreadable, 'unreadable path')).toEqual({ path: missing, reason: 'ENOENT' })
  })

  it('refuses a relative path in MOLE_OFFICE_LOCK_PATHS instead of guessing a directory', async () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = 'tmp/locks'
    const err = await fails(() => h.res.configuredLockPaths(), 500)
    expect(err.message).toContain('not an absolute path')
  })

  it('honours MOLE_OFFICE_LOCK_PATHS set to nothing rather than falling back to the defaults', () => {
    process.env.MOLE_OFFICE_LOCK_PATHS = ''
    expect(h.res.configuredLockPaths()).toEqual([])
  })
})

/** Listen on a free loopback port, closed by afterEach, and hand back the port number. */
function listenOnAFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    servers.push(server)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('no port'))
      resolvePort(address.port)
    })
  })
}

// ============================================================================ registering

describe('registering what a session started', () => {
  it('refuses a resource with no session record, and says how to make one', async () => {
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: 'nope', type: 'process', key: '1', actor: HUMAN }),
      404,
    )
    expect(err.message).toContain('POST /api/records')
    expect(err.message).toContain('"kind":"session"')
  })

  it('refuses a resource owned by something that is not a session', async () => {
    const module = h.t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', actor: h.t.api.HUMAN }).id
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: module, type: 'process', key: '1', actor: HUMAN }),
      400,
    )
    expect(err.message).toContain('is a module, not a session')
  })

  it('refuses a pid that is not running, so the ledger cannot hold a row that was never true', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '4242', actor: HUMAN }),
      400,
    )
    expect(err.message).toContain('Nothing is running as pid 4242')
  })

  it('captures the process group, the command line and the start time at registration', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node dist/server.js --port 8788')] }))
    const s = session('running')
    const entry = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    expect(entry.pgid).toBe(400)
    expect(entry.osStartedAt).toBe('2026-08-08 09:00:00')
    expect(entry.detail).toBe('node dist/server.js --port 8788')
    expect(entry.registeredBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
  })

  it('refuses the same thing twice for one session rather than reporting two orphans', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('running')
    const first = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }),
      409,
    )
    expect(err.message).toContain(first.id)
  })

  it('refuses a lock file outside the configured paths, and names the list', async () => {
    const dir = tempDir()
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: '/etc/passwd', actor: HUMAN }),
      400,
    )
    expect(err.message).toContain(dir)
    expect(err.message).toContain('MOLE_OFFICE_LOCK_PATHS')
  })

  it('refuses a relative lock path and accepts one inside a configured directory', async () => {
    const dir = tempDir()
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: 'run.lock', actor: HUMAN }),
      400,
    )
    const entry = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: s,
      type: 'lock',
      key: join(dir, 'run.lock'),
      actor: HUMAN,
    })
    expect(entry.key).toBe(join(dir, 'run.lock'))
  })

  it('refuses a port number that is not one', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    await fails(() => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '70000', actor: HUMAN }), 400)
    const err = await fails(
      () => h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: 'eight', actor: HUMAN }),
      400,
    )
    expect(err.message).toContain('must be a whole number')
  })

  it('records a port nothing is listening on yet, and says so rather than refusing', () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const entry = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN })
    expect(entry.pgid).toBeNull()
    expect(entry.detail).toContain('nothing listening on it when it was registered')
  })

  it('puts the registration in the session’s change log', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    const row = one(
      h.t.api.listChanges({ workspaceId: 'default', recordId: s }).filter((c) => c.field === 'resource.process'),
      'registration change row',
    )
    expect(row.op).toBe('create')
    expect(row.newValue).toContain('node server.js')
    expect(row.actorId).toBe(THE_TEST_OFFICES_OWNER.id)
  })
})

// ============================================================================ the orphan report

describe('what is alive whose session has ended', () => {
  function registerLiveProcess(sessionId: string, pid = 500, pgid = 400): string {
    return h.res.registerResource({ workspaceId: 'default', sessionRecordId: sessionId, type: 'process', key: String(pid), actor: HUMAN }).id
  }

  it('does not call a live session’s server an orphan, and does not hide it either', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('running')
    registerLiveProcess(s)
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    expect(one(report.stillOwned, 'still-owned resource').key).toBe('500')
    expect(report.unchecked).toHaveLength(0)
  })

  it('keeps the live office supervisor visible with its finished session, including at the orphans door', async () => {
    const supervisor = proc(process.ppid, 400, 'node tools/serve-dev.mjs --built')
    const supervisorProbe = fakeProbe({
      processes: [supervisor],
      ports: [{ port: 47123, address: '127.0.0.1', protocol: 'tcp', pid: null }],
    })
    h.res.useOsProbe(supervisorProbe)
    const s = session('running', 'The dev supervisor')
    const id = registerLiveProcess(s, process.ppid)
    expect(one(h.res.orphanReport('default').officeSupervisors, 'running office supervisor').session.state).toBe('running')
    endSession(s)
    const report = h.res.orphanReport('default')
    expect(report.orphans).toEqual([])
    const owned = one(report.officeSupervisors, 'office supervisor')
    expect(owned.id).toBe(id)
    expect(owned.session.state).toBe('finished')
    expect(owned.session.ended).toBe(true)
    expect(owned.liveness.state).toBe('alive')
    expect(report.unclaimed.skipped).toContainEqual({
      what: `process ${process.ppid}: Mole Office's own dev supervisor`,
      reason: expect.stringContaining('is recorded as finished.'),
    })
    expect(report.unclaimed.summary).toContain("Mole Office's own dev supervisor is alive")
    expect(report.unclaimed.summary).toContain('2 groups of live things were left out on purpose')
    const reply = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().orphans).toEqual([])
    expect(reply.json().unclaimed.summary).toContain('is recorded as finished.')
    expect(h.t.api.getRecord(s)?.data.state).toBe('finished')
    supervisorProbe.live.set(process.ppid, proc(process.ppid, 400, `node ${join(process.cwd(), 'tools/serve-dev.mjs')} --built`))
    supervisorProbe.processFacts = (asked) => ({
      pid: asked, parentPid: 1, parent: null, workingDirectory: '/another/directory',
      workingDirectoryDeleted: false, openDatabases: [], databaseAsked: null, couldNotRead: [],
    })
    expect(h.res.orphanReport('default').officeSupervisors).toHaveLength(1)
    delete supervisorProbe.processFacts
    supervisorProbe.live.set(process.ppid, proc(process.ppid, 400, 'node tools/serve-dev.mjs --built', '2026-08-09 09:00:00'))
    expect(h.res.orphanReport('default').officeSupervisors).toEqual([])
    expect(h.res.orphanReport('default').goneAndNotClosed).toHaveLength(1)
    h.t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL').run()
    expect(h.res.orphanReport('default').officeSupervisors).toEqual([])
    expect(h.res.orphanReport('default').unchecked).toHaveLength(1)
    supervisorProbe.live.set(process.ppid, supervisor)
    h.t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = ?').run(supervisor.startedAt)
    h.t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.state') WHERE id = ?").run(s)
    const unknownSession = h.res.orphanReport('default')
    expect(one(unknownSession.officeSupervisors, 'supervisor with unknown session state').session.state).toBeNull()
    expect(unknownSession.unclaimed.summary).toContain('has no readable recorded state.')
    expect(unknownSession.orphans).toEqual([])
    h.t.api.deleteRecord(s, h.t.api.HUMAN)
    const deletedSession = h.res.orphanReport('default')
    expect(one(deletedSession.officeSupervisors, 'supervisor with deleted session').session.note).toContain('The session record was deleted.')
    expect(deletedSession.unclaimed.summary).toContain('has no readable recorded state.')
    expect(JSON.stringify(deletedSession)).not.toContain('nothing owns what it started')
  })

  it.each([
    ['another parent', 500, 'node tools/serve-dev.mjs --built', null],
    ['a shell mentioning the script', process.ppid, 'bash -c node tools/serve-dev.mjs --built', null],
    ['another relative script', process.ppid, 'node ../other/tools/serve-dev.mjs --built', null],
    ['another absolute script', process.ppid, 'node /another/checkout/tools/serve-dev.mjs --built', null],
    ['another working directory', process.ppid, 'node tools/serve-dev.mjs --built', '/another/checkout'],
  ])('keeps %s in the orphan list', (_name, pid, command, directory) => {
    const probe = fakeProbe({ processes: [proc(pid, 400, command)] })
    if (directory !== null) {
      probe.processFacts = (asked) => ({
        pid: asked, parentPid: 1, parent: null, workingDirectory: directory,
        workingDirectoryDeleted: false, openDatabases: [], databaseAsked: null, couldNotRead: [],
      })
    }
    h.res.useOsProbe(probe)
    const s = session('running', 'The dev supervisor')
    registerLiveProcess(s, pid)
    endSession(s)
    expect(one(h.res.orphanReport('default').orphans, 'other supervisor').key).toBe(String(pid))
  })


  it('reports an orphan with its age once the session is finished', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js --port 8788')] }))
    const s = session('running')
    registerLiveProcess(s)
    endSession(s, 'crashed')

    const report = h.res.orphanReport('default')
    const orphan = one(report.orphans, 'orphan')
    expect(orphan.liveness.state).toBe('alive')
    expect(orphan.session.state).toBe('crashed')
    expect(orphan.session.ended).toBe(true)
    expect(orphan.session.endedAtSource).toBe('the change log')
    expect(orphan.orphanedFor?.human).toMatch(/second|minute/)
    expect(orphan.age.seconds).toBeGreaterThanOrEqual(0)
    if (orphan.liveness.state === 'alive') expect(orphan.liveness.detail).toContain('process group 400')
  })

  it('lists an orphaned session’s live process as an orphan, and a release of it still needs force (P-0jFzJuFC19)', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js --port 8788')] }))
    const s = session('running')
    const id = registerLiveProcess(s)
    h.t.api.patchRecord(s, { dataPatch: { state: 'orphaned' } }, h.t.api.HUMAN)

    const report = h.res.orphanReport('default')
    const orphan = one(report.orphans, 'orphan of an orphaned session')
    expect(report.stillOwned).toHaveLength(0)
    expect(orphan.session.state).toBe('orphaned')
    expect(orphan.session.ended).toBe(false)
    // Counted from when the change log says the session was marked orphaned.
    expect(orphan.orphanedFor?.human).toMatch(/second|minute/)

    const refused = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 409)
    expect(refused.message).toContain('still orphaned')
  })

  it('dates a session that was filed already finished from its record, and says that is where it came from', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('finished')
    registerLiveProcess(s)
    const orphan = one(h.res.orphanReport('default').orphans, 'orphan')
    expect(orphan.session.endedAtSource).toBe('the session record was last written then')
    expect(orphan.session.note).toContain('No change row records this session reaching a terminal state')
  })

  it('treats a recycled pid as gone, not as an orphan to be killed', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js', '2026-08-08 09:00:00')] }))
    const s = session('running')
    registerLiveProcess(s)
    endSession(s)

    // Same pid, different program, started later. This is the case that would otherwise get a
    // stranger killed.
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'vim notes.md', '2026-08-08 11:30:00')] }))
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    const all = one(h.res.listResources({ workspaceId: 'default' }), 'ledger row')
    expect(all.liveness.state).toBe('gone')
    if (all.liveness.state === 'gone') expect(all.liveness.detail).toContain('vim notes.md')
  })

  it('puts a container it could not look for in unchecked, never in gone', () => {
    h.res.useOsProbe(
      fakeProbe({ containers: { available: false, reason: 'docker is not installed on this machine' } }),
    )
    const s = session('finished')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN })
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    const unchecked = one(report.unchecked, 'unchecked row')
    expect(unchecked.key).toBe('isaac-sim')
    expect(unchecked.reason).toContain('docker is not installed')
  })

  it('says GPU memory is unknown when nvidia-smi is absent, and never says zero', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(700, 700, 'python train.py')],
        gpu: {
          available: false,
          reason: 'nvidia-smi is not installed on this machine, so GPU memory could not be read. This is NOT a reading of zero.',
        },
      }),
    )
    const s = session('finished')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'gpu', key: '700', actor: HUMAN })
    const orphan = one(h.res.orphanReport('default').orphans, 'gpu orphan')
    expect(orphan.gpuMemory).toEqual({
      unknown: 'nvidia-smi is not installed on this machine, so GPU memory could not be read. This is NOT a reading of zero.',
    })
    expect(JSON.stringify(orphan.gpuMemory)).not.toContain('usedMib')
  })

  it('reports how much GPU memory an orphan is holding when nvidia-smi answers', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(700, 700, 'python isaac_sim.py')],
        gpu: { available: true, processes: [{ pid: 700, usedMib: 14_336, name: 'python' }] },
      }),
    )
    const s = session('crashed')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'gpu', key: '700', actor: HUMAN })
    expect(one(h.res.orphanReport('default').orphans, 'gpu orphan').gpuMemory).toEqual({ usedMib: 14_336 })
  })

  it('will not call a session ended when its state is unreadable', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'stateless', actor: h.t.api.HUMAN }).id
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    expect(report.stillOwned).toHaveLength(0)
    expect(one(report.unchecked, 'unchecked row').reason).toContain('no readable state')
  })

  it('treats a deleted session record as ended, because nothing owns what it started', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })
    h.t.api.deleteRecord(s, h.t.api.HUMAN)
    const orphan = one(h.res.orphanReport('default').orphans, 'orphan of a deleted session')
    expect(orphan.session.note).toContain('was deleted')
  })

  it('lists the oldest orphan first, which is the one worth looking at', () => {
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(500, 400, 'node a.js'), proc(600, 600, 'python b.py')] }),
    )
    const older = session('running', 'older session')
    const newer = session('running', 'newer session')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: older, type: 'process', key: '500', actor: HUMAN })
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: newer, type: 'process', key: '600', actor: HUMAN })
    endSession(older)
    endSession(newer)

    // Both ended in the same second, so the order is made deterministic by moving the older
    // session's end back by an hour in the change log — the same row the report reads.
    h.t.client.sqlite
      .prepare("UPDATE changes SET at = '2026-08-08 08:00:00' WHERE record_id = ? AND field = 'data.state'")
      .run(older)

    const report = h.res.orphanReport('default')
    expect(report.orphans.map((o) => o.key)).toEqual(['500', '600'])
    expect(report.orphans[0]?.orphanedFor?.seconds).toBeGreaterThan(report.orphans[1]?.orphanedFor?.seconds ?? 0)
  })

  it('leaves a released row out of the live ledger but keeps it in the history', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('finished')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id
    await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
    expect(one(h.res.listResources({ workspaceId: 'default', includeReleased: true }), 'history row').releasedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
  })
})

// ============================================================================ the closed rows

/**
 * WHAT IS LOOKED AT WHEN THE WHOLE HISTORY IS LISTED.
 *
 * `GET /api/resources?includeReleased=true` took 20 to 26 seconds on the owner's own office on 24
 * September 2026, and the office answers one request at a time, so `/api/presence` waited 24.7
 * seconds behind it and `/api/messages` 24.8 (finding 67, block f-67 of record EnJvvsDTF_Dx). The
 * ledger held 3,433 rows and nearly all of them were released.
 *
 * These tests count the questions asked of the operating system rather than the seconds taken,
 * because a count cannot flake. The timing case at the end is here as well, with a bound loose
 * enough that only the old behaviour can cross it.
 */
describe('a row the ledger has closed is history, so nothing is looked at for it', () => {
  interface Counts {
    processById: number
    listeningPorts: number
    locks: number
    containers: number
    gpu: number
  }

  /** The fake operating system above, with a tally of every question asked of it. */
  function countingProbe(opts: FakeOptions = {}): { probe: FakeProbe; counts: Counts } {
    const under = fakeProbe(opts)
    const counts: Counts = { processById: 0, listeningPorts: 0, locks: 0, containers: 0, gpu: 0 }
    const probe: FakeProbe = {
      ...under,
      processById: (pid) => {
        counts.processById += 1
        return under.processById(pid)
      },
      listeningPorts: () => {
        counts.listeningPorts += 1
        return under.listeningPorts()
      },
      locks: (paths) => {
        counts.locks += 1
        return under.locks(paths)
      },
      containers: () => {
        counts.containers += 1
        return under.containers()
      },
      gpu: () => {
        counts.gpu += 1
        return under.gpu()
      },
    }
    return { probe, counts }
  }

  /**
   * Released rows written straight into the table.
   *
   * `registerResource` refuses a process row whose pid is not running, and a thousand live pids
   * cannot be had, so the history a real ledger accumulates is written as rows. That is what these
   * rows are: history. Nothing here registers or releases anything.
   */
  function writeReleasedRows(sessionId: string, howMany: number): void {
    const types = ['process', 'port', 'lock', 'container'] as const
    const insert = h.t.client.sqlite.prepare(
      `INSERT INTO session_resources
       (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at,
        registered_by, released_at, released_by, release_note, world, started_by_the_product)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    const all = h.t.client.sqlite.transaction(() => {
      for (let i = 0; i < howMany; i += 1) {
        const type = types[i % types.length] ?? 'process'
        const key =
          type === 'port' ? String(20_000 + (i % 3_000)) : type === 'lock' ? `/tmp/lock-${i}` : type === 'container' ? `c${i}` : String(700_000 + i)
        insert.run(
          `closed${String(i).padStart(6, '0')}`,
          'default',
          sessionId,
          type,
          key,
          type === 'process' ? 700_000 + i : null,
          type === 'process' ? '2026-09-20 10:00:00' : null,
          `what row ${i} was about`,
          '2026-09-20 10:00:00',
          'agent:somebody',
          '2026-09-21 11:00:00',
          'agent:somebody',
          'the run ended',
          null,
          1,
        )
      }
    })
    all()
  }

  it('asks the operating system about the live rows only, however many closed rows there are', () => {
    const { probe, counts } = countingProbe({ processes: [proc(500, 400, 'node server.js'), proc(501, 400, 'node worker.js')] })
    h.res.useOsProbe(probe)
    const closed = session('finished', 'a session that has finished')
    writeReleasedRows(closed, 2_000)
    const live = session('running', 'a session still going')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: live, type: 'process', key: '500', actor: HUMAN })
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: live, type: 'process', key: '501', actor: HUMAN })

    // From here, and not from the registrations above, which read the machine themselves.
    counts.processById = 0
    counts.listeningPorts = 0
    counts.locks = 0
    counts.containers = 0
    counts.gpu = 0

    const rows = h.res.listResources({ workspaceId: 'default', includeReleased: true })
    expect(rows).toHaveLength(2_002)
    // Two live process rows, so two reads of a pid and nothing else. The closed rows hold ports,
    // locks and containers, and none of those was looked at.
    expect(counts).toEqual({ processById: 2, listeningPorts: 0, locks: 0, containers: 0, gpu: 0 })
  })

  it('reads no session record for a closed row, and says so on the row instead of guessing', () => {
    h.res.useOsProbe(fakeProbe())
    const closed = session('finished', 'a session that has finished')
    writeReleasedRows(closed, 4)

    const row = at(h.res.listResources({ workspaceId: 'default', includeReleased: true }), 0, 'a closed row')
    expect(row.releasedAt).toBe('2026-09-21 11:00:00')
    expect(row.liveness.state).toBe('unknown')
    if (row.liveness.state === 'unknown') expect(row.liveness.reason).toContain('nothing on this machine was checked for it')
    // The session really did finish. The row says the record was not read rather than repeating
    // what it would have found, which is the difference between an answer and a look.
    expect(row.session.state).toBeNull()
    expect(row.session.ended).toBe('unknown')
    expect(row.session.note).toContain('its session record was not read')
    expect(row.orphanedFor).toBeNull()
  })

  it('keeps every reading on the live rows', () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const live = session('running', 'a session still going')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: live, type: 'process', key: '500', actor: HUMAN })
    writeReleasedRows(session('finished', 'a session that has finished'), 10)

    const row = one(
      h.res.listResources({ workspaceId: 'default', includeReleased: true }).filter((r) => r.releasedAt === null),
      'the live row',
    )
    expect(row.liveness.state).toBe('alive')
    expect(row.session.state).toBe('running')
    expect(row.session.ended).toBe(false)
  })

  it('reads the machine for the closed rows when a caller asks it to', () => {
    // What `theWorkerThatStartedItIsGone` in lib/worker.ts asks for. It decides a worker has ended
    // from whether every process row it holds is gone, and a server restart is what closed those
    // rows, so those are the rows that carry the answer.
    const { probe, counts } = countingProbe()
    h.res.useOsProbe(probe)
    const closed = session('finished', 'a session that has finished')
    writeReleasedRows(closed, 4)

    const asked = h.res.listResources({ workspaceId: 'default', includeReleased: true, alsoCheckReleasedRows: true })
    expect(asked).toHaveLength(4)
    expect(counts.processById).toBe(1)
    const row = one(asked.filter((r) => r.type === 'process'), 'the closed process row')
    expect(row.liveness.state).toBe('gone')
    expect(row.session.ended).toBe(true)
  })

  /**
   * AND THE CALLER REALLY ASKS. The case above proves `listResources` honours the ask; this one
   * proves the one reader that needs it sends it, which is a second fact and needs its own case.
   *
   * `theWorkerThatStartedItIsGone` in lib/worker.ts is that reader. It decides whether the worker
   * that started a run has ended, and one of its three answers is "every process row that worker
   * holds is gone". A worker that has ended usually leaves RELEASED rows behind, because the next
   * server start closes the rows of processes it finds gone — so the released rows are the evidence,
   * and a reader that is told "nothing was checked" about them cannot see it. Without the ask, this
   * returns false where it returns true today, and runs whose worker has ended stop being closed.
   *
   * The wave-10 supervisor measured on 24 September 2026 that deleting the ask from that call left
   * every test in this repository green, which is why this case is here.
   */
  it('sends the ask from lib/worker.ts, so a worker whose closed rows are all gone reads as ended', async () => {
    // Nothing is running, so any process row reads as gone.
    h.res.useOsProbe(fakeProbe())
    // Still `running`: the record itself says nothing about having ended, so the only thing that
    // can answer this question is the reading of its released process row.
    const worker = session('running', 'a worker whose process has gone')
    writeReleasedRows(worker, 4)
    const run = session('running', 'a run that worker started')

    // IMPORTED HERE AND NOT AT THE TOP OF THE FILE, for the reason tests/a-restart-never-loses-a-run.test.ts
    // gives: src/server/lib/worker.ts opens the database when it loads, so it is imported after
    // `freshDb` has named one. It is the same instance of lib/resources.ts that the probe above went into.
    const { theWorkerThatStartedItIsGone } = await import('../src/server/lib/worker.ts')
    expect(theWorkerThatStartedItIsGone({ parentAttachment: worker }, '2026-09-24 12:00:00', 'default')).toBe(true)

    // And it is the released rows that answered: the worker's record never said it had ended.
    expect(h.t.api.getRecord(worker)?.data.state).toBe('running')
    expect(h.res.listResources({ workspaceId: 'default', sessionRecordId: worker, includeReleased: true }).every((r) => r.releasedAt !== null)).toBe(true)
  })

  /**
   * THE SAME THING IN SECONDS, against the real operating system.
   *
   * Every case above counts questions, because a count cannot flake. This one is the fact the
   * office actually needs — the read finishes quickly — and it is here with a bound loose enough
   * that only the old behaviour can cross it. Measured on 24 September 2026 on a ledger of this
   * size: 76 ms with the closed rows left alone, and 7,407 ms with every row checked. Mutated, this
   * very case took 7,020 and 7,570 ms in two runs. The bound is two seconds, which is 26 times the
   * measured time and a third of the mutated one. Run this case on its own: a machine doing
   * something else makes it slower, and that headroom is what stands between that and a false red.
   */
  it('lists a ledger the size of the office’s own in well under two seconds', () => {
    h.res.useOsProbe(h.res.LINUX_PROBE)
    // The number of rows the owner's ledger held on 22 September 2026, as it was measured.
    writeReleasedRows(session('finished', 'a session that has finished'), 3_433)
    const live = session('running', 'a session still going')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: live, type: 'process', key: String(process.pid), actor: HUMAN })

    const started = Date.now()
    const rows = h.res.listResources({ workspaceId: 'default', includeReleased: true })
    const took = Date.now() - started
    expect(rows).toHaveLength(3_434)
    expect(took).toBeLessThan(2_000)
  })
})

// ============================================================================ releasing

describe('releasing — the only thing here that kills', () => {
  function liveOrphan(pid = 500, pgid = 400): { id: string; sessionId: string; probe: FakeProbe } {
    const probe = fakeProbe({ processes: [proc(pid, pgid, 'node dist/server.js')] })
    h.res.useOsProbe(probe)
    const sessionId = session('running')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: sessionId,
      type: 'process',
      key: String(pid),
      actor: HUMAN,
    }).id
    endSession(sessionId)
    return { id, sessionId, probe }
  }

  it('kills by process GROUP, not by pid', async () => {
    const { id, probe } = liveOrphan(500, 400)
    const result = await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(one(probe.signals, 'signal')).toEqual({ pgid: 400, signal: 'SIGTERM' })
    expect(result.acted).toBe(true)
    expect(result.stillAlive).toBe(false)
    expect(result.outcome).toContain('process group 400')
  })

  it('records who asked, in the change log', async () => {
    const { id, sessionId } = liveOrphan()
    // As item 2 of a decision says, the attribution case stops the registering agent's
    // resource.
    h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic release caller',
      data: { handle: 'claude-code', state: 'active', runtime: 'claude-code' }, actor: HUMAN })
    h.t.api.patchRecord(sessionId, { dataPatch: { servingAgent: 'claude-code' } }, HUMAN)
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
    readTheRoleCards({ guardActKeys: h.t.api.GOVERNANCE_GUARDS.flatMap((guard) => [guard.actKey, guard.personAct]) })
    await h.res.releaseResource(id, {
      actor: { type: 'agent', id: 'claude-code', sessionId: 'sess-9' },
      note: 'holding 8788 after the run',
    }, 'default')
    const row = one(
      h.t.api.listChanges({ workspaceId: 'default', recordId: sessionId }).filter((c) => c.op === 'delete'),
      'release change row',
    )
    expect(row.actorType).toBe('agent')
    expect(row.actorId).toBe('claude-code')
    expect(row.sessionId).toBe('sess-9')
    expect(row.oldValue).toContain('node dist/server.js')
    expect(row.newValue).toContain('SIGTERM was sent')
    expect(row.newValue).toContain('holding 8788 after the run')
  })

  it('refuses while the session is still running, and says how to go ahead anyway', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')] })
    h.res.useOsProbe(probe)
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 409)
    expect(err.message).toContain('still running')
    expect(err.message).toContain('"force":true')
    expect(probe.signals).toHaveLength(0)
  })

  it('goes ahead on force, and writes down that it was forced', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')] })
    h.res.useOsProbe(probe)
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id

    const result = await h.res.releaseResource(id, { actor: HUMAN, force: true }, 'default')
    expect(result.acted).toBe(true)
    expect(result.resource.releaseNote).toContain('forced while the session was still running')
    expect(one(probe.signals, 'signal').pgid).toBe(400)
  })

  it('refuses to signal Mole Office’s own process group', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')], ownGroup: 400 })
    h.res.useOsProbe(probe)
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id
    endSession(s)

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain("Mole Office's own group")
    expect(probe.signals).toHaveLength(0)
  })

  it('refuses to signal group 1', async () => {
    const probe = fakeProbe({ processes: [proc(500, 1, 'some init child')] })
    h.res.useOsProbe(probe)
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id
    endSession(s)

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain('That is init')
    expect(probe.signals).toHaveLength(0)
  })

  // Problem kmdLJ_7HADfN: this used to be a 409 that told the caller to tidy the row "by hand",
  // which no door does. The process the row named has exited, so the row is closed, and the
  // different program now holding the pid is not signalled.
  it('closes the row without signalling anything when the pid has been recycled by a different program', async () => {
    const { id } = liveOrphan(500, 400)
    const after = fakeProbe({ processes: [proc(500, 400, 'vim notes.md', '2026-08-08 12:00:00')] })
    h.res.useOsProbe(after)

    const result = await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(result.acted).toBe(false)
    expect(result.outcome).toContain('Nothing was signalled')
    expect(result.outcome).toContain('vim notes.md')
    expect(result.resource.releaseNote).toContain('the pid is now held by a different process, which was not signalled')
    expect(after.signals).toHaveLength(0)
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('refuses when the process has moved into a different group since it was registered', async () => {
    const { id } = liveOrphan(500, 400)
    const after = fakeProbe({ processes: [proc(500, 777, 'node dist/server.js')] })
    h.res.useOsProbe(after)

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 409)
    expect(err.message).toContain('group 777')
    expect(after.signals).toHaveLength(0)
  })

  it('marks a resource that had already exited as released, without signalling anything', async () => {
    const { id } = liveOrphan()
    const after = fakeProbe({ processes: [] })
    h.res.useOsProbe(after)

    const result = await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(result.acted).toBe(false)
    expect(result.outcome).toContain('Nothing is running as pid 500')
    expect(after.signals).toHaveLength(0)
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('reports a process that ignored SIGTERM instead of escalating on its own', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')], stubborn: [400] })
    h.res.useOsProbe(probe)
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id
    endSession(s)

    const result = await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(result.stillAlive).toBe(true)
    expect(result.outcome).toContain('SIGKILL')
    expect(probe.signals.map((s2) => s2.signal)).toEqual(['SIGTERM'])
  })

  it('sends SIGKILL only when it is asked for', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')], stubborn: [400] })
    h.res.useOsProbe(probe)
    const s = session('crashed')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id

    const result = await h.res.releaseResource(id, { actor: HUMAN, signal: 'SIGKILL' }, 'default')
    expect(one(probe.signals, 'signal').signal).toBe('SIGKILL')
    expect(result.stillAlive).toBe(false)
  })

  it('will not delete a lock file, and names the command to do it by hand', async () => {
    const dir = tempDir()
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    const path = join(dir, 'run.lock')
    h.res.useOsProbe(fakeProbe({ locks: { files: [{ path, sizeBytes: 5, modifiedAt: '2026-08-08 09:00:00' }], unreadable: [] } }))
    const s = session('finished')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: path, actor: HUMAN }).id

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain(`rm ${path}`)
    expect(err.message).toContain('lets a second copy start on the same data')
  })

  it('refuses a lock the same way while the session is still running, rather than sending them round a loop', async () => {
    const dir = tempDir()
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    const path = join(dir, 'run.lock')
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'lock', key: path, actor: HUMAN }).id

    // Not "mark the session finished first", which would be a wasted step: this endpoint never
    // deletes a lock, whatever the session is doing.
    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain(`rm ${path}`)
  })

  it('stops a container by name', async () => {
    const probe = fakeProbe({
      containers: { available: true, containers: [{ id: 'abc', name: 'isaac-sim', image: 'nvcr.io/isaac', status: 'Up 11 days' }] },
    })
    h.res.useOsProbe(probe)
    const s = session('crashed')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN }).id

    const result = await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(probe.stopped).toEqual(['isaac-sim'])
    expect(result.acted).toBe(true)
  })

  it('refuses to release a container when docker cannot be reached, rather than calling it gone', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('crashed')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN }).id
    h.res.useOsProbe(fakeProbe({ containers: { available: false, reason: 'docker exited 1: daemon not running' } }))

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 503)
    expect(err.message).toContain('daemon not running')
  })

  // A port row registered while nothing listened on it carries no start time and no group. Since
  // problem HfYQOmmx97wT the missing start time is the refusal given: it is the one that says why the
  // holder cannot be told from a stranger, and a restored row, which has neither, gets the same one.
  it('refuses to signal when nothing was listening at registration, because the row has no start time', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('finished')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN }).id
    const after = fakeProbe({ processes: [proc(900, 900, 'node other.js')], ports: [{ port: 8788, address: '127.0.0.1', protocol: 'tcp', pid: 900 }] })
    h.res.useOsProbe(after)

    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain('This row carries no start time')
    expect(err.message).toContain('node other.js')
    expect(after.signals).toHaveLength(0)
  })

  it('refuses a second release, naming when the first one happened', async () => {
    const { id } = liveOrphan()
    await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    const err = await fails(() => h.res.releaseResource(id, { actor: HUMAN }, 'default'), 409)
    expect(err.message).toContain('already released')
  })

  it('404s on a resource that is not in the ledger', async () => {
    h.res.useOsProbe(fakeProbe())
    await fails(() => h.res.releaseResource('missing', { actor: HUMAN }, 'default'), 404)
  })
})

// ============================================================================ the HTTP surface

describe('over HTTP', () => {
  it('registers, reports the orphan, and releases it, attributing each step', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node dist/server.js --port 8788')] }))
    const s = session('running')

    const created = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { sessionRecordId: s, type: 'process', key: '500', adopting: 'the stand-in process started on 8 August, before this test filed its session' },
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().resource.id as string
    expect(created.json().resource.registeredBy).toBe('agent:claude-code')

    const stillOwned = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(stillOwned.json().orphans).toHaveLength(0)
    // `stillOwned` is off the door now — the running column never read it — so the report under the
    // door is where the still-owned row is pinned.
    expect(h.res.orphanReport('default').stillOwned).toHaveLength(1)

    endSession(s)
    const orphans = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(orphans.statusCode).toBe(200)
    expect(h.res.orphanReport('default').platform).toBe('fake')
    expect(orphans.json().orphans[0].key).toBe('500')

    // The orphan is describable now that the probe can enumerate a process group, so the
    // contract requires the confirmation phrase back. An empty body is refused on purpose:
    // a kill that nobody was shown the consequences of is the thing this guard exists for.
    const phrase = orphans.json().orphans[0].releaseAction.confirmPhrase
    const released = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${id}/release`,
      payload: { expect: phrase },
    })
    expect(released.statusCode).toBe(200)
    expect(released.json().acted).toBe(true)
    expect(released.json().outcome).toContain('process group 400')
  })

  it('lists an orphaned session’s process on the orphans door with no release button, and says force is needed', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node dist/server.js --port 8788')] }))
    const s = session('running')
    const created = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { sessionRecordId: s, type: 'process', key: '500', adopting: 'the stand-in process started on 8 August, before this test filed its session' },
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().resource.id as string
    h.t.api.patchRecord(s, { dataPatch: { state: 'orphaned' } }, h.t.api.HUMAN)

    const orphans = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(orphans.statusCode).toBe(200)
    const orphan = orphans.json().orphans[0]
    expect(orphan.key).toBe('500')
    expect(orphan.releaseAction).toBeNull()
    expect(orphan.releaseBlockedBecause).toContain('marked orphaned')
    expect(orphan.releaseBlockedBecause).toContain(`/api/resources/${id}/release`)
    expect(orphans.json().warning ?? '').not.toContain('has no end time')
  })

  it('a GET never kills anything, whatever it is asked', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')] })
    h.res.useOsProbe(probe)
    const s = session('crashed')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })

    for (const url of ['/api/resources', '/api/resources/orphans', '/api/resources/scan', '/api/resources?includeReleased=true']) {
      expect((await h.app.inject({ method: 'GET', url })).statusCode).toBe(200)
    }
    expect(probe.signals).toHaveLength(0)
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(1)
  })

  it('refuses an unknown field on the register body rather than dropping it', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { sessionRecordId: s, type: 'port', key: '8788', pgid: 400 },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('pgid')
  })

  it('names the five types when given a sixth', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { sessionRecordId: s, type: 'socket', key: '1' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('process, port, gpu, container, lock')
  })

  it('refuses a blank detail rather than storing a gap', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { sessionRecordId: s, type: 'port', key: '8788', detail: '   ' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('leave the key out instead')
  })

  /**
   * THE ONE ROUND TRIP THE SKILL PROMISES.
   *
   * .claude/skills/mole-office/reference.md tells an agent to POST an empty body because "the refusal
   * names every field it wanted and lists the kinds of thing it accepts, in one round trip". It
   * named `type` and `key` and said nothing about who owns the row — so an agent that had not yet
   * filed its session (the common case, since registering is meant to happen the moment something
   * starts) paid three requests and two different failure shapes for what is documented as one.
   */
  it('names the owner requirement in the same refusal as the missing fields', async () => {
    h.res.useOsProbe(fakeProbe())
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: {},
    })
    expect(r.statusCode).toBe(400)
    const error = String(r.json().error)
    expect(error).toContain('process, port, gpu, container, lock')
    expect(error).toContain('key is required')
    expect(error).toContain('x-mole-office-session')
  })

  it('says the same about a run name no session answers to', async () => {
    h.res.useOsProbe(fakeProbe())
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
        'x-mole-office-session': 'never-filed',
      },
      payload: {},
    })
    expect(r.statusCode).toBe(400)
    const error = String(r.json().error)
    expect(error).toContain('process, port, gpu, container, lock')
    expect(error).toContain('File the session first')
  })

  it('keeps the field list to itself once the owner is settled', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session('running')
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { sessionRecordId: s },
    })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).not.toContain('x-mole-office-session')
  })

  /**
   * The change row a registration writes has to JOIN, like every other change row.
   *
   * lib/resources.ts had its own copy of `logChange`, and the copy stored `actor.sessionId`
   * unresolved. So registering under a run name that was already bound to a session record wrote
   * a row carrying the NAME, next to rows from the same run carrying the id — the difference
   * between "this joins to the session" and "this happens to be a matching string". The copy is
   * gone; this is what would notice a new one.
   */
  it('files its change row against the session RECORD, not the run name it was given', async () => {
    h.res.useOsProbe(fakeProbe({ processes: [proc(500, 400, 'node server.js')] }))
    const s = session('running', 'the bound run')
    // Bind a run name to that session record the way filing a session under one does.
    h.t.api.bindSessionName(s, 'bound-run', h.t.api.HUMAN)

    const r = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
        'x-mole-office-session': 'bound-run',
      },
      payload: { type: 'process', key: '500', adopting: 'the stand-in process started on 8 August, before this test filed its session' },
    })
    expect(r.statusCode, r.body).toBe(201)

    const row = one(
      h.t.api.listChanges({ workspaceId: 'default', recordId: s }).filter((c) => c.field?.startsWith('resource.')),
      'the registration change row',
    )
    expect(row.sessionId).toBe(s)
  })

  it('refuses a signal that is not one of the two', async () => {
    const probe = fakeProbe({ processes: [proc(500, 400, 'node server.js')] })
    h.res.useOsProbe(probe)
    const s = session('crashed')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN }).id
    const r = await h.app.inject({ method: 'POST', url: `/api/resources/${id}/release`, payload: { signal: 'SIGHUP' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toContain('SIGTERM or SIGKILL')
    expect(probe.signals).toHaveLength(0)
  })

  it('scans the machine and says which lock paths it was allowed to look in', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'run.lock'), 'held')
    process.env.MOLE_OFFICE_LOCK_PATHS = dir
    const port = await listenOnAFreePort()

    const r = await h.app.inject({ method: 'GET', url: '/api/resources/scan' })
    expect(r.statusCode).toBe(200)
    const scan = r.json()
    expect(scan.platform).toBe('linux')
    expect(scan.lockPaths).toEqual([dir])
    expect(scan.locks.files.map((f: { path: string }) => f.path)).toEqual([join(dir, 'run.lock')])

    const mine = scan.ports.find((p: { port: number }) => p.port === port)
    expect(mine).toBeDefined()
    expect(mine.holder.pid).toBe(process.pid)
    expect(typeof mine.holder.pgid).toBe('number')
    // Either a real GPU reading or a sentence saying why not — never a silent zero.
    expect(scan.gpu.available === true || typeof scan.gpu.reason === 'string').toBe(true)
  })
})

// ============================================================================ the real thing

describe('against the real operating system', () => {
  /**
   * The proof.
   *
   * A detached shell with two background sleeps is three processes in ONE process group. If
   * release signalled the leader only, the two sleeps would survive and this test would fail —
   * which is exactly the orphan that held a port through four incidents on this project.
   */
  it('kills a real process group: the leader and both of its children', async () => {
    const child = spawn('sh', ['-c', 'sleep 300 & echo $!; sleep 300 & echo $!; wait'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    started.push(child)
    const leader = child.pid
    expect(leader).toBeDefined()
    if (leader === undefined) return

    // Read the two background pids the shell prints, so every check below goes through the
    // probe rather than through this test poking at /proc itself.
    let out = ''
    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString()
    })
    for (let i = 0; i < 40 && out.trim().split('\n').length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 50))
    }
    const children = out.trim().split('\n').map((line) => Number(line.trim())).filter((n) => Number.isInteger(n) && n > 0)
    expect(children).toHaveLength(2)

    const probe = h.res.LINUX_PROBE
    const leaderProc = probe.processById(leader)
    expect(leaderProc?.pgid).toBe(leader)
    for (const pid of children) expect(probe.processById(pid)?.pgid).toBe(leader)

    const s = session('running')
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: s,
      type: 'process',
      key: String(leader),
      actor: HUMAN,
    }).id
    endSession(s, 'crashed')

    const orphan = one(h.res.orphanReport('default').orphans, 'real orphan')
    expect(orphan.id).toBe(id)
    expect(orphan.liveness.state).toBe('alive')

    const result = await h.res.releaseResource(id, { actor: HUMAN, note: 'left running by a dead session' }, 'default')
    expect(result.acted).toBe(true)
    expect(result.stillAlive).toBe(false)

    expect(probe.processById(leader)).toBeNull()
    for (const pid of children) expect(probe.processById(pid)).toBeNull()
    expect(h.res.orphanReport('default').orphans).toHaveLength(0)
  }, 20_000)

  it('refuses to kill the group this test runner is in, when its own port is registered', async () => {
    const port = await listenOnAFreePort()
    const s = session('running')
    const entry = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: String(port), actor: HUMAN })
    expect(entry.pgid).toBe(h.res.LINUX_PROBE.ownProcessGroup())
    endSession(s)

    const err = await fails(() => h.res.releaseResource(entry.id, { actor: HUMAN }, 'default'), 400)
    expect(err.message).toContain("Mole Office's own group")
    // Still here to assert it.
    expect(h.res.LINUX_PROBE.processById(process.pid)).not.toBeNull()
  })
})
