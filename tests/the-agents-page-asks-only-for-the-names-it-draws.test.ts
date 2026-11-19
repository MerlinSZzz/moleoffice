// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENTS PAGE ASKS FOR THE NAMES IT DRAWS, AND NOT FOR EVERY RUN AND AGENT IN THE PROJECT.
 *
 * `agentName` reads an `id` and a `title`. The page's names read used to ask
 * `GET /api/records?kind=session&shape=narrow` and `kind=agent&shape=narrow` with no limit, so a
 * project with 25,352 runs answered 5.2 MB for the handful of names one open conversation draws.
 * It now asks `GET /api/records?ids=…&shape=narrow` for the ids that conversation names, once,
 * after its detail arrives.
 *
 * WHAT IS HELD HERE
 *
 *   1. The read asks by `ids`, in the narrow shape, and never by `kind` and never for the project.
 *      On an office of 400 runs it answers two names in under 4 KB, not 400 rows.
 *   2. `idsTheThreadNames` is the whole set a thread can name: message recipients, runs'
 *      recipient sessions, and the reply box's target.
 *   3. `agentName` still gives the title, the "no longer filed" sentence, the "being read"
 *      sentence and "a new agent".
 *   4. The page wires `OneThread` to `useAgentNames(idsTheThreadNames(thread), …)`, and no longer
 *      asks at page level.
 *
 * CONTROL, MUTATION, RESTORE
 *
 * The control is the run of this file before the code: the named exports and the `ids` query do not
 * exist yet, so it is red at import and at the URL assertion. The mutation removes `ids` from
 * `recordsNamed` (the request becomes the whole project), and this file goes red on the URL, the
 * rows and the size. The logs are `out/w14c-names/test-control.log`, `test-green.log`,
 * `test-mutation.log` and `test-restore.log`; the restore is checked by sha256.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ThreadDetail } from '../src/server/lib/agents.ts'
import type { AgentNames } from '../src/web/components/agent/names.ts'
import type { PanelRecord } from '../src/shared/types.ts'

const PROJECT = 'the-names-a-thread-draws'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const HEADERS: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

type Names = typeof import('../src/web/components/agent/names.ts')

let t: TestDb
let app: FastifyInstance
let names: Names
let workspaces: typeof import('../src/server/lib/workspaces.ts')
/** Every reply the page's fetch asked for: the URL and the bytes of the body. */
let asked: { url: string; bytes: number }[]
const realFetch = globalThis.fetch

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: PROJECT, title: 'The names one thread draws' })
  app = (await apiApp()).app
  await app.ready()
  // src/web/api.ts reads window.localStorage at module scope, so the stand-in goes in before the
  // module is imported. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  // THE BROWSER'S fetch, ANSWERED BY THE PRODUCT'S OWN SERVER, as the page asks it.
  asked = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url,
      headers: HEADERS,
      ...(init?.body === undefined ? {} : { payload: init.body as string }),
    })
    asked.push({ url, bytes: Buffer.byteLength(res.body, 'utf8') })
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  names = await import('../src/web/components/agent/names.ts')
}, 60_000)

afterAll(async () => {
  globalThis.fetch = realFetch
  await app.close()
  t.close()
})

function file(kind: 'session' | 'agent', title: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind,
    title,
    data:
      kind === 'session'
        ? { state: 'running', runtime: 'claude-code' }
        : { handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), state: 'active', runtime: 'claude-code' },
    actor: PERSON,
  }).id
}

/**
 * 400 runs and two durable agents, so the old read is unmistakably bigger than the new one. The
 * page's one thread names three of them and one id nothing answers to.
 */
const RUNS = 400
let runIds: string[] = []
let agentIds: string[] = []
let noteId: string
let elsewhereId: string
let aThread: ThreadDetail

beforeAll(() => {
  runIds = Array.from({ length: RUNS }, (_, at) => file('session', `Run ${String(at + 1)}`))
  agentIds = [file('agent', 'The reviewer'), file('agent', 'The builder')]
  // A RECORD THAT ONLY THE SEARCH FINDS, and one in another project, so the two narrowings are each
  // proved to be doing work rather than agreeing by accident.
  noteId = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'note',
    title: 'A note only the search finds',
    data: { body: 'The word w14c-only-in-this-note is here.' },
    actor: PERSON,
  }).id
  workspaces.createWorkspace({ id: 'the-names-elsewhere', title: 'Another project' })
  elsewhereId = t.api.createRecord({
    workspaceId: 'the-names-elsewhere',
    kind: 'session',
    title: 'A run in another project',
    data: { state: 'running', runtime: 'claude-code' },
    actor: PERSON,
  }).id
  // The two recipients, and the run the reply box goes back to, are all this thread draws.
  aThread = {
    thread: { id: 'thread-one' },
    messages: [
      { id: 'm1', runId: null, recipient: { kind: 'session', sessionId: runIds[0]!, agentId: null } },
      { id: 'm2', runId: 'the-answer', recipient: { kind: 'agent', sessionId: null, agentId: agentIds[0]! } },
    ],
    runs: [{ id: 'the-answer', recipientSessionId: runIds[1]! }],
    says: 'The two names this conversation draws.',
  } as unknown as ThreadDetail
}, 60_000)

describe('the names read', () => {
  it('asks by id in the narrow shape, and answers only the names the thread draws', async () => {
    const ids = names.idsTheThreadNames(aThread)
    expect(ids).toEqual([runIds[0], agentIds[0], runIds[1]])

    asked = []
    const rows = await names.readAgentNames([...ids, 'no-such-record'])
    const url = asked.at(-1)?.url ?? ''

    expect(url).toContain('/api/records?')
    expect(url).toContain('shape=narrow')
    expect(url).toContain(`ids=${encodeURIComponent(ids.join(','))}`)
    expect(url).not.toContain('kind=')
    expect(url).not.toContain('limit=')
    expect(rows.map((one) => one.id).sort()).toEqual([...ids].sort())
    expect(rows).toHaveLength(3)
    expect(rows.some((one) => one.id === 'no-such-record')).toBe(false)
  })

  it('is sized by the rows it carries, not by the project', async () => {
    asked = []
    const ids = names.idsTheThreadNames(aThread)
    const rows = await names.readAgentNames(ids)
    const narrowBytes = asked.at(-1)?.bytes ?? 0
    // THE SIZE WORKED OUT FROM THE ROW IT CARRIES: one narrow row for each id, a reply envelope, and
    // nothing per run in the project. A whole project of 400 runs is > 80 KB.
    const largestRow = rows.length === 0 ? 0 : Math.max(...rows.map((one) => Buffer.byteLength(JSON.stringify(one), 'utf8')))
    const envelope = 512
    const bound = ids.length * largestRow + envelope
    expect(narrowBytes).toBeLessThan(bound)
    expect(bound).toBeLessThan(1_000_000)

    asked = []
    await (await import('../src/web/api.ts')).api.listRecords('session', 'narrow')
    const projectBytes = asked.at(-1)?.bytes ?? 0
    expect(projectBytes).toBeGreaterThan(narrowBytes * 10)
  }, 20_000)

  it('asks nothing for a thread that names nobody', async () => {
    asked = []
    expect(await names.readAgentNames([])).toEqual([])
    expect(asked).toEqual([])
  })
})

describe('agentName keeps its four answers', () => {
  it('gives the title, the no-longer-filed sentence, the being-read sentence and a new agent', async () => {
    const rows = await names.readAgentNames([runIds[0]!, agentIds[0]!])
    const ready: AgentNames = { status: 'ready', value: rows as PanelRecord[] }
    expect(names.agentName(ready, runIds[0]!)).toBe('Run 1')
    expect(names.agentName(ready, agentIds[0]!)).toBe('The reviewer')
    expect(names.agentName(ready, 'no-such-record')).toBe(names.AN_AGENT_NO_LONGER_FILED)
    expect(names.agentName({ status: 'loading' }, runIds[0]!)).toBe('the agent this is addressed to')
    expect(names.agentName(ready, null)).toBe('a new agent')
  })
})

describe('the ids query itself', () => {
  async function answer(path: string): Promise<{ status: number; body: { records: { id: string }[]; matched: number; returned: number } }> {
    const res = await app.inject({ method: 'GET', url: path, headers: HEADERS })
    return { status: res.statusCode, body: JSON.parse(res.body) as { records: { id: string }[]; matched: number; returned: number } }
  }

  it('keeps the named rows when a search would find another, and reads no row when both narrow to nothing', async () => {
    // THE SEARCH DOES FIND THE NOTE, so the case below is about the ids and not about a search that found nothing.
    const found = await answer(`/api/records?kind=note&q=w14c-only-in-this-note&shape=narrow`)
    expect(found.status).toBe(200)
    expect(found.body.records.map((one) => one.id)).toContain(noteId)

    const none = await answer(`/api/records?ids=${runIds[0]},${agentIds[0]}&q=w14c-only-in-this-note&shape=narrow`)
    expect(none.status).toBe(200)
    expect(none.body.records).toEqual([])
    expect(none.body.returned).toBe(0)
    expect(none.body.matched).toBe(0)
  })

  it('does not answer an id from another project', async () => {
    const other = await answer(`/api/records?ids=${elsewhereId}&shape=narrow`)
    expect(other.status).toBe(200)
    expect(other.body.records).toEqual([])
    expect(other.body.returned).toBe(0)
  })
})

