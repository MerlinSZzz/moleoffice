// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROCESS START TIME BESIDE THE PID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * A process row records a pid AND the moment that pid's process started. The pid alone is not an
 * identity, because Linux reuses pids: a row whose process has exited can name a number that now
 * belongs to something else. Both the ledger's liveness reading and the orphan sweep compare the
 * two, so a reused number reads as "ended; the pid was reused" rather than "running".
 *
 * The reading is /proc/<pid>/stat field 22 — the start in clock ticks since the boot — which
 * `processById` turns into local wall-clock time. `tests/the-process-start-time-is-the-real-one.test.ts`
 * proves that reading against `ps`. This file proves what the ledger does with it.
 *
 * A caller may send the start time it read as `osStartedAt`. It is checked against the machine's
 * reading at registration and then discarded, so a pid reused between the caller's read and this
 * call is refused in one sentence rather than written down against a stranger.
 *
 * A row with no start time at all — one restored from an archive, because the export format drops
 * the column on purpose — is NOT called a recycled pid. The sweep says instead that it cannot tell,
 * and names the missing fact, which is the difference between "gone" and "not checked".
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import { parseStoredStamp } from '../src/shared/time.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/** A throwaway database, the ledger loaded against it, and the resource routes over it. */
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
  h.res.useOsProbe(h.res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

/** A session record that owns the rows here, and its id. */
function session(state = 'running'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session that started the process',
    data: { state, runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** One process as the fake machine describes it. */
function proc(pid: number, pgid: number, command: string, startedAt: string): OsProcess {
  return { pid, pgid, ppid: 1, command, startedAt }
}

interface FakeProbe extends OsProbe {
  live: Map<number, OsProcess>
}

/** An operating system whose process table the test can change between reads. */
function fakeProbe(processes: OsProcess[]): FakeProbe {
  const live = new Map<number, OsProcess>()
  for (const p of processes) live.set(p.pid, p)
  return {
    platform: 'fake',
    live,
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this test never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test never stops anything')
    },
  }
}

/**
 * A process row with no start time, written straight into the table.
 *
 * `registerResource` always stores one, so this is the row a restore from an archive produces:
 * the export format drops `os_started_at` on purpose, because restoring a weeks-old process group
 * is how a stale reading is manufactured. The row is valid and the pid is live; the missing fact
 * is only the start time.
 */
function insertProcessRowWithoutStartTime(sessionId: string, pid: number): string {
  const id = 'res-restored-without-a-start-time'
  h.t.client.sqlite
    .prepare(
      `INSERT INTO session_resources
       (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail,
        registered_at, registered_by, released_at, released_by, release_note, world,
        started_by_the_product)
       VALUES (?, 'default', ?, 'process', ?, NULL, NULL, ?, '2026-08-01 00:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}',
               NULL, NULL, NULL, NULL, NULL)`,
    )
    .run(id, sessionId, String(pid), 'a process row restored from an archive')
  return id
}

describe('a process row is read against the start time beside its pid', () => {
  it('reads a live process as running', () => {
    const s = session()
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', '2026-08-08 09:00:00')]))
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })

    const [row] = h.res.listResources({ workspaceId: 'default' })
    expect(row?.liveness.state).toBe('alive')
    expect(row?.osStartedAt).toBe('2026-08-08 09:00:00')
  })

  it('reads a pid that has been reused as ended, and says the pid was reused', () => {
    const s = session()
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', '2026-08-08 09:00:00')]))
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '500', actor: HUMAN })

    // The same number, a different program, started two and a half hours later.
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'vim notes.md', '2026-08-08 11:30:00')]))
    const [row] = h.res.listResources({ workspaceId: 'default' })
    expect(row?.liveness.state).toBe('gone')
    if (row?.liveness.state === 'gone') {
      expect(row.liveness.detail).toContain('vim notes.md')
      expect(row.liveness.detail).toContain('2026-08-08 11:30:00')
    }

    // And the sweep does not offer it as an orphan to be killed.
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    expect(report.goneAndNotClosed.map((r) => r.id)).toContain(row?.id)
  })

  it('refuses a caller start time that is not the one the machine reports', async () => {
    const s = session()
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', '2026-08-08 09:00:00')]))

    const answer = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: {
        sessionRecordId: s,
        type: 'process',
        key: '500',
        osStartedAt: '2026-08-08 07:00:00',
      },
    })
    expect(answer.statusCode).toBe(400)
    expect(String(answer.json().error)).toContain('not the same process')
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('accepts a caller start time that is the one the machine reports', async () => {
    const s = session()
    // The session started this process, so it started once the session was filed: the door refuses a
    // process older than the session that registers it (decision AOwsOHMVq6Ce).
    const started = h.t.api.getRecord(s)?.createdAt
    if (started === undefined) throw new Error(`session ${s} was not filed`)
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', started)]))

    const answer = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: {
        sessionRecordId: s,
        type: 'process',
        key: '500',
        osStartedAt: started,
      },
    })
    expect(answer.statusCode, answer.body).toBe(201)
    // The machine's own reading is what the row keeps; the caller's check is not a stored claim.
    const [row] = h.res.listResources({ workspaceId: 'default' })
    expect(row?.osStartedAt).toBe(started)
  })

  // A tool sends the start as it read it from the machine: an ISO time in UTC, with milliseconds. The data-folder
  // move registers the office it starts that way. The zone names the moment, so it is the same process.
  it('accepts a caller start time sent as an ISO time with its zone, and keeps the machine\'s own stamp', async () => {
    const s = session()
    const started = h.t.api.getRecord(s)?.createdAt
    if (started === undefined) throw new Error(`session ${s} was not filed`)
    const moment = parseStoredStamp(started)
    if (moment === null) throw new Error(`"${started}" is not a stored stamp`)
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', started)]))

    const answer = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: {
        sessionRecordId: s,
        type: 'process',
        key: '500',
        osStartedAt: new Date(moment + 250).toISOString(),
      },
    })
    expect(answer.statusCode, answer.body).toBe(201)
    const [row] = h.res.listResources({ workspaceId: 'default' })
    expect(row?.osStartedAt).toBe(started)
  })

  it('reads a row with no start time as neither alive nor recycled, and says no start time was recorded', () => {
    const s = session('finished')
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node server.js', '2026-08-08 09:00:00')]))
    insertProcessRowWithoutStartTime(s, 500)

    const [row] = h.res.listResources({ workspaceId: 'default' })
    // Not `gone`: the row is never called a recycled pid. Not `alive` either: the ledger cannot
    // prove the pid is the same process, and saying it is would be the anti-reuse check vanishing.
    expect(row?.liveness.state).toBe('unknown')
    if (row?.liveness.state === 'unknown') expect(row.liveness.reason).toContain('carries no start time')

    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    const unchecked = report.unchecked.find((u) => u.id === row?.id)
    expect(unchecked, 'the row with no start time is in no list at all').toBeDefined()
    expect(unchecked?.reason).toContain('carries no start time')
  })
})
