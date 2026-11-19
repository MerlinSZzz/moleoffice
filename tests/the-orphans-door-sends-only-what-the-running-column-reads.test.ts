// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ORPHANS DOOR SENDS ONLY WHAT THE RUNNING COLUMN READS.
 *
 * Problem aHdrneS3NBGF. `GET /api/resources/orphans` used to spread the whole `OrphanReport` onto
 * the wire: `checkedAt`, `platform`, `stillOwned`, `goneAndNotClosed` and the top-level `unchecked`
 * as well as the four fields the running column reads. On the owner's live office that made every answer
 * about 76 KB on every visible page. It now sends `orphans`, `searched`, `unclaimed` and — only
 * when there is something to say — `warning`.
 *
 * WHAT IS READ HERE. The page's own reader, `readOrphansPayload`, is run against this exact answer,
 * so the two halves are pinned together: the door sends no field the column never reads, and the
 * fields the column does read survive the narrowing and are still drawn by the reader.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THIS CASE CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   a dropped field added back   Put `stillOwned` (or `checkedAt`) back in the return in
 *                                `orphansResponse` and the key-set assertion goes red.
 *   a read field removed         Drop `unclaimed` (or `orphans`) from the return and the reader
 *                                assertion goes red: `readOrphansPayload` returns no sweep, or
 *                                prints a problem saying the reply had no `orphans`.
 *
 * Each is run against a control first and then restored with `cp` and `cmp`; the report records
 * what was seen.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, one, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type SP = typeof import('../src/web/components/SessionPanel.tsx')

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/**
 * A throwaway database, the ledger loaded against it, and a Fastify app wired to the routes.
 *
 * Imported dynamically after `freshDb()` has reset the module registry and pointed MOLE_OFFICE_DB
 * at a temporary file, for the reason helpers.ts gives, and so the probe installed here is the
 * probe the routes read.
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
/** The page's reader, loaded once behind the smallest window the module needs. */
let sp: SP

beforeAll(async () => {
  const store = new Map<string, string>([['mole-office.mode', 'inspect']])
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  sp = await import('../src/web/components/SessionPanel.tsx')
})

beforeEach(async () => {
  h = await freshLedger()
})

afterEach(async () => {
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

function session(state: string): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a session under test',
    data: { state, runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

function proc(pid: number, pgid: number, command: string): OsProcess {
  return { pid, pgid, ppid: 1, command, startedAt: '2026-08-01 09:00:00' }
}

/**
 * An operating system in a few lines, so the same test office always holds one orphan, one
 * still-owned row, one row open for a process that is gone, and one row nobody can check.
 */
function fakeProbe(processes: OsProcess[]): OsProbe {
  const live = new Map<number, OsProcess>()
  for (const p of processes) live.set(p.pid, p)
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    // Docker is not installed, so the container row below cannot be checked at all and the answer
    // carries a warning. That is what makes the `warning` field present to be read.
    containers: () => ({ available: false, reason: 'docker is not installed on this machine' }),
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

describe('the orphans door sends only what the running column reads', () => {
  it('carries the four page fields and none of the lists the column never drew, and the page reader still reads it', async () => {
    const alive = [proc(500, 400, 'node small-server.js'), proc(501, 401, 'node owned.js'), proc(502, 402, 'node gone.js')]
    h.res.useOsProbe(fakeProbe(alive))
    const running = session('running')
    const ended = session('finished')

    // An orphan (its session ended, the process is alive).
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'process', key: '500', actor: HUMAN })
    // A still-owned row (its session is still running).
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: running, type: 'process', key: '501', actor: HUMAN })
    // A row that will be open for nothing once the process exits.
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'process', key: '502', actor: HUMAN })
    // A row the probe cannot check at all, so the answer carries a warning.
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'container', key: 'isaac-sim', actor: HUMAN })
    // 502 exits. Nothing releases its row, so it is goneAndNotClosed rather than an orphan.
    h.res.useOsProbe(fakeProbe([proc(500, 400, 'node small-server.js'), proc(501, 401, 'node owned.js')]))

    const answer = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(answer.statusCode).toBe(200)
    const body = answer.json() as Record<string, unknown>

    // NON-VACUOUS: there really is an orphan and a warning in the answer, so "no extra fields" is
    // not a statement about an empty report.
    expect((body['orphans'] as unknown[]).length).toBe(1)
    expect(body).toHaveProperty('warning')

    // THE WHOLE ASSERTION: every top-level key is one the column reads.
    const theColumnsFields = ['orphans', 'searched', 'warning', 'unclaimed']
    expect(
      Object.keys(body).filter((key) => !theColumnsFields.includes(key)),
      'the door sent a field the running column never reads',
    ).toEqual([])
    for (const needed of ['orphans', 'searched', 'unclaimed']) {
      expect(body, `the door dropped ${needed}, which the column reads`).toHaveProperty(needed)
    }
    // The lists the column never drew are gone by name, so the assertion can fail loudly rather
    // than only through the set arithmetic above.
    for (const dropped of ['checkedAt', 'platform', 'stillOwned', 'goneAndNotClosed', 'unchecked']) {
      expect(body, `the door still sends ${dropped}, which the column never reads`).not.toHaveProperty(dropped)
    }

    // AND THE PAGE STILL DRAWS THE COLUMN: the page's own reader reads this exact answer.
    const read = sp.readOrphansPayload(body)
    expect(read.problems, `the page could not read the door's answer: ${read.problems.join('; ')}`).toEqual([])
    expect(read.orphans, 'the page read no orphan from the answer').toHaveLength(1)
    expect(one(read.orphans, 'the orphan the page read').describe).toContain('small-server.js')
    expect(read.unclaimed, 'the page was handed no unclaimed sweep').not.toBeNull()
  })
})
