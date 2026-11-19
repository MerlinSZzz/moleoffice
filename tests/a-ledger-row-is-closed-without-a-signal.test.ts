// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * THE RELEASE DOOR: WHERE IT LOOKED, AND CLOSING A ROW WITHOUT SIGNALLING ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `TzYBehtBVuNg`. A release sent without the right project header answered "No resource
 * with id X is in the ledger." The row was live, in another project. The lookup is scoped to the
 * request's project, and the sentence reported the empty result instead of the project it searched.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THE SIGNAL TESTS REST ON
 * ---------------------------------------------------------------------------------------
 *
 * A case that must signal nothing registers a REAL detached child of this test's own and asserts
 * the child is still alive afterwards. The children are in their own process groups, so a signal in
 * this file can never reach the test runner, and the cleanup stops them by group, by the pid the
 * spawn returned.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

let h: Harness
/** Every real child this file started, stopped by GROUP afterwards. */
let started: ChildProcess[]

/** A throwaway database and the resource routes on a Fastify app, sharing one instance of the lib. */
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

beforeEach(async () => {
  h = await freshLedger()
  started = []
})

afterEach(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      // Negative pid is the whole group: this file's own detached child, by the pid spawn returned.
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A running session record in a project. */
function session(workspaceId = 'default'): string {
  return h.t.api.createRecord({
    workspaceId,
    kind: 'session',
    title: 'the run under test',
    data: { state: 'running', runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** A real process of this test's own, in its own group. */
function aRealChild(): ChildProcess {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  return child
}

/** A row a session registered for a real child. */
function aRowFor(child: ChildProcess, sessionId: string, workspaceId = 'default'): string {
  return h.res.registerResource({
    workspaceId,
    sessionRecordId: sessionId,
    type: 'process',
    key: String(child.pid),
    actor: HUMAN,
  }).id
}

interface Answer {
  status: number
  body: Record<string, unknown>
  error: string
}

/** A release sent over HTTP, with the headers an agent sends. */
async function release(
  id: string,
  opts: { session?: string; workspace?: string; payload?: Record<string, unknown> } = {},
): Promise<Answer> {
  const headers: Record<string, string> = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest/release',
  }
  if (opts.session !== undefined) headers['x-mole-office-session'] = opts.session
  if (opts.workspace !== undefined) headers['x-mole-office-workspace'] = opts.workspace
  const r = await h.app.inject({ method: 'POST', url: `/api/resources/${id}/release`, headers, payload: opts.payload ?? {} })
  const body = r.json() as Record<string, unknown>
  return { status: r.statusCode, body, error: typeof body['error'] === 'string' ? body['error'] : '' }
}

describe('a release that cannot find the row says where it looked (TzYBehtBVuNg)', () => {
  it('names the project it searched and the project the row is in', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'other', title: 'Other' })
    const child = aRealChild()
    const id = aRowFor(child, session('other'), 'other')

    const answer = await release(id, { workspace: 'default' })
    expect(answer.status).toBe(404)
    expect(answer.error).toContain('project "default"')
    expect(answer.error).toContain('It is in project "other"')
    expect(answer.error).toContain('x-mole-office-workspace: other')
  })

  it('says the id is in no project at all when that is what it found', async () => {
    const answer = await release('noSuchRowHere', { workspace: 'default' })
    expect(answer.status).toBe(404)
    expect(answer.error).toContain('project "default", or of any other project')
  })
})

/** One row read back out of the ledger, released ones included. */
async function rowInTheLedger(id: string): Promise<{
  releasedAt: string | null
  releasedBy: string | null
  releaseNote: string | null
}> {
  const r = await h.app.inject({ method: 'GET', url: '/api/resources?includeReleased=true' })
  const rows = (
    r.json() as { resources: { id: string; releasedAt: string | null; releasedBy: string | null; releaseNote: string | null }[] }
  ).resources
  const found = rows.filter((row) => row.id === id)
  expect(found, `ledger row ${id}`).toHaveLength(1)
  return found[0]!
}

/**
 * Is that child still running? Not `process.kill(pid, 0)`, which succeeds on a zombie. Node reaps the
 * children it spawned and fills in `exitCode` or `signalCode`, so those say what really happened.
 */
async function stillRunning(child: ChildProcess): Promise<boolean> {
  await new Promise((ok) => setTimeout(ok, 300))
  return child.exitCode === null && child.signalCode === null
}

describe('the session that registered a row may close it without a signal (OCjvJGIE4M4H)', () => {
  it('closes the row of a running process, signals nothing, and says so on the row', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)

    const answer = await release(id, { session: sessionId, payload: { signalNothing: true, note: 'handed over' } })
    expect(answer.status, answer.error).toBe(200)
    expect(answer.body['acted']).toBe(false)
    expect(answer.body['killed']).toEqual([])
    expect(String(answer.body['outcome'])).toContain('Nothing was signalled')
    // NOTHING WAS SIGNALLED, proved against the machine.
    expect(await stillRunning(child), 'the close signalled the process it named').toBe(true)

    const row = await rowInTheLedger(id)
    expect(row.releasedAt, 'the row is still live').not.toBeNull()
    expect(row.releasedBy).toBe('agent:vitest/release')
    expect(row.releaseNote ?? '').toContain('handed over')
    expect(row.releaseNote ?? '').toContain('closed by the session that registered it, and nothing was signalled')

    // The change log says `update`, because `delete` on a resource means something was stopped.
    const changes = h.t.api.listChanges({ workspaceId: 'default', recordId: sessionId })
    expect(changes.filter((c) => c.field === 'resource.process' && c.op === 'delete')).toHaveLength(0)
    expect(changes.filter((c) => c.field === 'resource.process' && c.op === 'update')).toHaveLength(1)
  })

  it('closes a row in the group of the server answering, which a release can never do', async () => {
    // This test runner's own process stands for the server: its group is the probe's own group.
    const sessionId = session()
    const id = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: sessionId,
      type: 'process',
      key: String(process.pid),
      actor: HUMAN,
    }).id
    const answer = await release(id, { session: sessionId, payload: { signalNothing: true } })
    expect(answer.status, answer.error).toBe(200)
    expect((await rowInTheLedger(id)).releasedAt).not.toBeNull()
  })

  it('refuses any other caller while the process runs, and leaves the row and the process alone', async () => {
    const child = aRealChild()
    const id = aRowFor(child, session())
    const stranger = session()

    for (const as of [stranger, undefined]) {
      const answer = await release(id, { ...(as === undefined ? {} : { session: as }), payload: { signalNothing: true } })
      expect(answer.status, answer.error).toBe(403)
      expect(answer.error).toContain('did not come from that session')
    }
    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
    expect(await stillRunning(child)).toBe(true)
  })

  it('refuses signalNothing sent with anything about a signal, and does nothing', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)
    for (const extra of [{ expect: 'Kill it' }, { signal: 'SIGKILL' }, { force: true }]) {
      const answer = await release(id, { session: sessionId, payload: { signalNothing: true, ...extra } })
      expect(answer.status, answer.error).toBe(400)
      expect(answer.error).toContain('cannot be sent with')
    }
    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
    expect(await stillRunning(child)).toBe(true)
  })

  it('closes a lock row and leaves the lock file where it is', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-signal-nothing-'))
    const lockPathsWere = process.env['MOLE_OFFICE_LOCK_PATHS']
    process.env['MOLE_OFFICE_LOCK_PATHS'] = dir
    try {
      const path = join(dir, 'run.lock')
      writeFileSync(path, 'held')
      const sessionId = session()
      const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: sessionId, type: 'lock', key: path, actor: HUMAN }).id

      // A plain release refuses a lock whatever happens. A close with no signal deletes nothing.
      const answer = await release(id, { session: sessionId, payload: { signalNothing: true } })
      expect(answer.status, answer.error).toBe(200)
      expect((await rowInTheLedger(id)).releasedAt).not.toBeNull()
      expect(existsSync(path), 'the lock file was removed').toBe(true)
    } finally {
      if (lockPathsWere === undefined) delete process.env['MOLE_OFFICE_LOCK_PATHS']
      else process.env['MOLE_OFFICE_LOCK_PATHS'] = lockPathsWere
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a row with no start time is never signalled (HfYQOmmx97wT)', () => {
  /**
   * A row as a restore leaves it: the machine columns emptied. `keepTheGroup` keeps the process group,
   * so the start time is the ONLY thing between the release and a signal. That is the case the problem
   * is about: until now the missing group, dropped by the same restore, was what stopped the signal.
   */
  async function aRestoredRow(child: ChildProcess, keepTheGroup: boolean): Promise<string> {
    const sessionId = session()
    const id = aRowFor(child, sessionId)
    const { sqlite } = await import('../src/server/db/client.ts')
    sqlite
      .prepare(`UPDATE session_resources SET os_started_at = NULL${keepTheGroup ? '' : ', pgid = NULL'} WHERE id = ?`)
      .run(id)
    h.t.api.patchRecord(sessionId, { dataPatch: { state: 'finished' } }, h.t.api.HUMAN)
    return id
  }

  it('refuses to signal a row whose group is recorded but whose start time is not, and says what to do', async () => {
    const child = aRealChild()
    const id = await aRestoredRow(child, true)

    const answer = await release(id)
    expect(answer.status, answer.error).toBe(400)
    expect(answer.error).toContain('This row carries no start time')
    expect(answer.error).toContain('restored from an archive')
    expect(answer.error).toContain('{"signalNothing":true}')
    expect(await stillRunning(child), 'the release signalled a pid it could not identify').toBe(true)
    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
  })

  it('gives the same refusal for a row that lost its group too', async () => {
    const child = aRealChild()
    const id = await aRestoredRow(child, false)
    const answer = await release(id)
    expect(answer.status, answer.error).toBe(400)
    expect(answer.error).toContain('This row carries no start time')
    expect(await stillRunning(child)).toBe(true)
  })

  it('offers no kill sentence to confirm for such a row, and says why', async () => {
    // A row with no start time reads `unknown`, so the orphan report does not list it; the release
    // door builds the same view. A confirm phrase sent back is answered with why no kill is offered,
    // rather than with a new phrase to confirm.
    const child = aRealChild()
    const id = await aRestoredRow(child, true)
    const answer = await release(id, { payload: { expect: 'Kill process group 1 with SIGTERM.' } })
    expect(answer.status, answer.error).toBe(409)
    expect(answer.error).toContain('This row carries no start time')
    expect(await stillRunning(child)).toBe(true)
  })

  it('offers no kill sentence for a port row with no start time either', async () => {
    const { createServer } = await import('node:net')
    const server = createServer()
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('the test server has no port')
      const sessionId = session()
      const id = h.res.registerResource({
        workspaceId: 'default',
        sessionRecordId: sessionId,
        type: 'port',
        key: String(address.port),
        actor: HUMAN,
      }).id
      const { sqlite } = await import('../src/server/db/client.ts')
      sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(id)
      h.t.api.patchRecord(sessionId, { dataPatch: { state: 'finished' } }, h.t.api.HUMAN)

      const answer = await release(id, { payload: { expect: 'Kill process group 1 with SIGTERM.' } })
      expect(answer.status, answer.error).toBe(409)
      expect(answer.error).toContain('This row carries no start time')
      expect(answer.error).toContain(`which holds port ${String(address.port)}`)
    } finally {
      await new Promise<void>((ok) => server.close(() => ok()))
    }
  })
})

