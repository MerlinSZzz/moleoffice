// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Four holes in the SERVER SURFACE — the part of Mole Office an agent meets before it has read any
 * source — and the fixes for them. Every test below fails on the code as it was found.
 *
 *   1. THE SEED SHIPPED THE DEFECT THE MIGRATION EXISTS TO CLEAN UP. scripts/seed.ts writes its
 *      back-dated checklist rows straight into `changes`, and it put the raw run name ("touch",
 *      "obj") in the session column, bypassing the resolution logChange does for every other
 *      write. So `npm run db:reset` produced a database whose change log spoke two languages on
 *      day one, and only POST /api/sessions/discover could repair it. The test asks the strongest
 *      version of the question: after a fresh seed, is there ANY row whose session reference is
 *      not a session record's id — and does the migration find anything left to do.
 *
 *   2. THE 201 DROPPED THE ONE SENTENCE NOBODY ELSE COULD SEE. `createRecordWithReport` reports a
 *      session binding — "filing this session also repointed 3 earlier change rows" — and the
 *      create route destructured `record` and `incomplete` and threw it away. Rows the caller did
 *      not name were moved and the caller was told nothing.
 *
 *   3. GET /api HAD PATHS WITHOUT BODIES. Every registered route now carries a sentence, so this
 *      file does not re-check that (tests/surface-fixes.test.ts owns it). It checks the harder
 *      property: that the sentences are TRUE. Every parameter and field named below is exercised
 *      against the live server in the same test, so a note cannot be padded into passing.
 *
 *   4. REGISTERING A RESOURCE COST A FIELD IT DID NOT NEED. `x-mole-office-session` already says which
 *      session is writing; `sessionRecordId` demanded the same id again in the body. Registration
 *      has to be cheap or it gets skipped, and a process nobody registered cannot be reported as
 *      an orphan — which is the whole of what the ledger is for.
 *
 * WHY THE SEED BLOCK COMES LAST. freshDb() resets the module registry and repoints MOLE_OFFICE_DB, and
 * importing the seed RUNS it. Doing that after the API block has finished with its own database
 * keeps the two from sharing anything: the app built above holds its own module instances and its
 * own file, and neither is touched by the second database appearing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { endpointsDescribedTwice, type ApiIndex, type ApiRoute } from '../src/server/api/kinds.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type SessionsLib = typeof import('../src/server/lib/sessions.ts')

// ============================================================================ the API surface

let t: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]
let res: ResourcesLib

/**
 * A probe that sees an empty machine.
 *
 * Every registration in this file is a `port`, which is the one type that does not have to find
 * a live process — a server registered the moment it starts has not finished binding yet. So the
 * ledger tests here are about WHO OWNS the row, which is what changed, and not about the process
 * table, which did not.
 */
function emptyProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: () => null,
    processesInGroup: () => [],
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this file never kills anything')
    },
    stopContainer: () => {
      throw new Error('this file never stops anything')
    },
  }
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')

  // The product's own surface, from `buildApp()`. This block used to be nine hand-written
  // registrations and it was missing one, which is how eight endpoints shipped with no description
  // while this file's own assertion passed.
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()

  res.useOsProbe(emptyProbe())
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ---------------------------------------------------------------------------- small helpers

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

/** Headers for a write made by an agent working under a run name. */
function asRun(session: string): Record<string, string> {
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-session': session }
}

async function post(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await app.inject({ method: 'POST', url, payload, headers })
  return { status: r.statusCode, body: bodyOf(r) }
}

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await app.inject({ method: 'GET', url })
  return { status: r.statusCode, body: bodyOf(r) }
}

async function index(): Promise<ApiIndex> {
  return bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
}

/** The sentence GET /api serves for one endpoint, or a failure naming the endpoint. */
async function noteFor(method: string, path: string): Promise<string> {
  const listed = (await index()).endpoints.find((e) => e.method === method && e.path === path)
  if (!listed) throw new Error(`GET /api does not list ${method} ${path} at all`)
  if (listed.description === null) throw new Error(`GET /api lists ${method} ${path} with no description`)
  return listed.description
}

let seq = 0
const uniqueTitle = (what: string) => `server-surface ${what} ${++seq}`

// ================================================ 2. the 201 reports the binding it just made

describe('POST /api/records hands back the session binding it made', () => {
  it('says how many earlier rows moved when a session files itself', async () => {
    const run = 'checkpoint3'

    // Two writes under a run name nothing is filed as yet. Their change rows carry the NAME,
    // because that is the only thing known about who wrote them.
    const note = await post('/api/records', { kind: 'note', title: uniqueTitle('a note'), data: { body: 'x' } }, asRun(run))
    expect(note.status).toBe(201)
    const noteId = (note.body['record'] as { id: string }).id
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${noteId}`,
      payload: { summary: 'a second row under the same name' },
      headers: asRun(run),
    })
    expect(patched.statusCode).toBe(200)

    const before = bodyOf(await app.inject({ method: 'GET', url: `/api/changes?session=${run}` }))
    const rowsUnderTheName = (before['changes'] as unknown[]).length
    expect(rowsUnderTheName).toBe(2)

    // Now the session files itself, under the same name. Filing it binds the name and repoints
    // every row that carried it — a write to rows this request never named.
    const filed = await post(
      '/api/records',
      { kind: 'session', title: uniqueTitle('the run filing itself'), data: { state: 'running', runtime: 'claude-code' } },
      asRun(run),
    )
    expect(filed.status).toBe(201)

    const binding = filed.body['sessionBinding'] as
      | { name: string; recordId: string; repointed: number; alreadyBoundTo: string | null; note: string }
      | undefined
    if (binding === undefined) {
      throw new Error('the 201 carries no sessionBinding, so nothing told the caller its rows had moved')
    }
    expect(binding.name).toBe(run)
    expect(binding.recordId).toBe((filed.body['record'] as { id: string }).id)
    expect(binding.alreadyBoundTo).toBeNull()
    // The two rows above, plus two more written moments earlier under the same name: the session
    // record's own `create` row, and the row that records the binding itself, which is written
    // before the repoint precisely so that it is carried by it.
    expect(binding.repointed).toBe(rowsUnderTheName + 2)
    expect(binding.note).toContain(String(binding.repointed))
    expect(binding.note).toContain('carried the raw name')

    // And the report is true: asking by name now finds the same rows under the record's id.
    const after = bodyOf(await app.inject({ method: 'GET', url: `/api/changes?session=${run}` }))
    const filter = after['session'] as { recordId: string; matchedBy: string; storedByName: number }
    expect(filter.recordId).toBe(binding.recordId)
    expect(filter.storedByName).toBe(0)
  })

  it('leaves the key out entirely when nothing was bound', async () => {
    // A note is not a session, so no name is claimed; and the key is absent rather than null,
    // because an empty binding report beside a 201 reads as "nothing was moved" said twice.
    const plain = await post('/api/records', { kind: 'note', title: uniqueTitle('unbound'), data: { body: 'x' } }, asRun('some-run'))
    expect(plain.status).toBe(201)
    expect('sessionBinding' in plain.body).toBe(false)

    // A session filed by a person typing has no run name to claim either.
    const typed = await post('/api/records', {
      kind: 'session',
      title: uniqueTitle('typed in by hand'),
      data: { state: 'idle', runtime: 'claude-code' },
    })
    expect(typed.status).toBe(201)
    expect('sessionBinding' in typed.body).toBe(false)
  })

  it('reports the refusal when a name that already belongs to another session was not taken', async () => {
    const run = 'reused-name'
    const first = await post(
      '/api/records',
      { kind: 'session', title: uniqueTitle('the first run'), data: { state: 'finished', runtime: 'claude-code' } },
      asRun(run),
    )
    expect(first.status).toBe(201)
    const firstId = (first.body['record'] as { id: string }).id

    const second = await post(
      '/api/records',
      { kind: 'session', title: uniqueTitle('a later run of the same name'), data: { state: 'running', runtime: 'claude-code' } },
      asRun(run),
    )
    expect(second.status).toBe(201)

    // createRecordWithReport in lib/records.ts still does not attempt the binding: the name
    // already means another session, and moving it would move that session's history with it.
    // What changed is that it no longer keeps that to itself. This test used to assert the key
    // was ABSENT here, which pinned the defect rather than the rule: the caller walked off with a
    // 201 while every row it had written — the create row below among them — stayed filed under
    // the first session, and nothing on the reply said so.
    const secondId = (second.body['record'] as { id: string }).id
    const binding = second.body['sessionBinding'] as
      | { name: string; recordId: string; repointed: number; alreadyBoundTo: string | null; note: string }
      | undefined
    if (binding === undefined) {
      throw new Error('the 201 carries no sessionBinding, so nothing told the caller whose session its rows went to')
    }
    expect(binding.alreadyBoundTo).toBe(firstId)
    expect(binding.repointed).toBe(0)
    expect(binding.note).toContain(firstId)
    expect(binding.note).toContain(`x-mole-office-session: ${secondId}`)

    // The refusal is honest: nothing moved, and the caller is still writing as the FIRST session,
    // which is what its header said. tests/session-binding.test.ts is where the whole rule lives.
    const createRow = one(
      t.api.listChanges({ workspaceId: 'default', recordId: secondId }).filter((row) => row.op === 'create'),
      'the create row of the second session',
    )
    expect(createRow.sessionId).toBe(firstId)
  })
})

// ======================================== 4. registering a resource costs one field, not two

describe('POST /api/resources takes its owner from the session header', () => {
  /** A filed session, bound to a run name, as an agent working under that name would file it. */
  async function fileSession(run: string): Promise<string> {
    const filed = await post(
      '/api/records',
      { kind: 'session', title: uniqueTitle(`owner ${run}`), data: { state: 'running', runtime: 'claude-code' } },
      asRun(run),
    )
    expect(filed.status).toBe(201)
    return (filed.body['record'] as { id: string }).id
  }

  it('registers with no sessionRecordId at all when the header names a filed session', async () => {
    const run = 'ledger-run'
    const recordId = await fileSession(run)

    const created = await post('/api/resources', { type: 'port', key: '8788' }, asRun(run))
    expect(created.status).toBe(201)
    const resource = created.body['resource'] as { id: string; sessionRecordId: string; registeredBy: string }
    expect(resource.sessionRecordId).toBe(recordId)
    expect(resource.registeredBy).toBe('agent:claude-code')

    // And the ledger really owns it: the row comes back under that session's filter.
    const ledger = await get(`/api/resources?sessionRecordId=${recordId}`)
    expect(ledger.status).toBe(200)
    expect((ledger.body['resources'] as { id: string }[]).map((r) => r.id)).toContain(resource.id)
  })

  it('accepts the record id in the header as readily as the run name', async () => {
    const recordId = await fileSession('by-id-run')
    const created = await post('/api/resources', { type: 'port', key: '8789' }, asRun(recordId))
    expect(created.status).toBe(201)
    expect((created.body['resource'] as { sessionRecordId: string }).sessionRecordId).toBe(recordId)
  })

  it('lets the body name a different session, because a supervisor may register for another run', async () => {
    const mine = await fileSession('supervisor-run')
    const theirs = await fileSession('the-other-run')

    const created = await post('/api/resources', { sessionRecordId: theirs, type: 'port', key: '8790' }, asRun('supervisor-run'))
    expect(created.status).toBe(201)
    // The body is the more specific statement, so it wins. Nothing is inferred from the header.
    expect((created.body['resource'] as { sessionRecordId: string }).sessionRecordId).toBe(theirs)
    expect(theirs).not.toBe(mine)
  })

  it('refuses with a sentence when neither the body nor a header says who owns it', async () => {
    const r = await post('/api/resources', { type: 'port', key: '8791' })
    expect(r.status).toBe(400)
    const error = String(r.body['error'])
    expect(error).toContain('sessionRecordId')
    expect(error).toContain('x-mole-office-session')
    // No guessing: a row filed against an invented owner would answer "has the owner ended"
    // about the wrong session, which is the only question this ledger is read for.
    expect(res.listResources({ workspaceId: 'default' }).some((row) => row.key === '8791')).toBe(false)
  })

  it('refuses when the header names a session nothing is filed as, and says how to file it', async () => {
    const r = await post('/api/resources', { type: 'port', key: '8792' }, asRun('never-filed-run'))
    expect(r.status).toBe(404)
    const error = String(r.body['error'])
    expect(error).toContain('never-filed-run')
    expect(error).toContain('POST /api/records')
    expect(res.listResources({ workspaceId: 'default' }).some((row) => row.key === '8792')).toBe(false)
  })
})

// ============================================ 3. the sentences in GET /api are true sentences

describe('GET /api describes what these endpoints really do', () => {

  it('says GET /api/changes takes a session filter, and the filter works as described', async () => {
    const note = await noteFor('GET', '/api/changes')
    expect(note).toContain('?session=')
    expect(note).toContain('?sessionId=')
    // Both halves of what makes the filter usable: either spelling, either form of reference.
    expect(note).toContain('run name')
    expect(note).toContain('sessions')

    const run = 'documented-filter'
    const recordId = await (async () => {
      const filed = await post(
        '/api/records',
        { kind: 'session', title: uniqueTitle('filter demo'), data: { state: 'running', runtime: 'claude-code' } },
        asRun(run),
      )
      return (filed.body['record'] as { id: string }).id
    })()

    // Every claim the sentence makes, exercised: both spellings, both forms of reference, and
    // the `session` and `sessions` blocks it promises.
    for (const url of [
      `/api/changes?session=${run}`,
      `/api/changes?sessionId=${run}`,
      `/api/changes?session=${recordId}`,
      `/api/changes?sessionId=${recordId}`,
    ]) {
      const answer = await get(url)
      expect(answer.status, url).toBe(200)
      const filter = answer.body['session'] as { recordId: string } | undefined
      expect(filter?.recordId, url).toBe(recordId)
      expect(Array.isArray(answer.body['sessions']), url).toBe(true)
    }
    // Sending both spellings with different values is refused rather than one being picked.
    expect((await get('/api/changes?session=a&sessionId=b')).status).toBe(400)
  })

  it('says GET /api/changes has two ends, and both of them really bound the answer', async () => {
    const note = await noteFor('GET', '/api/changes')
    expect(note).toContain('?until=')
    // The sentence this replaced called `?since=` "a day". It was not one: with no upper end it is
    // everything from that moment until now, and an audit measured four days and 105 rows coming
    // back from a filter the API called a day. Both halves of the correction are checked.
    expect(note).toContain('INCLUSIVE')
    expect(note).toMatch(/midnight/i)

    const written = await post(
      '/api/records',
      { kind: 'note', title: uniqueTitle('inside the window'), data: { body: 'x' } },
      asRun('window-run'),
    )
    expect(written.status).toBe(201)
    const recordId = (written.body['record'] as { id: string }).id

    /** The ids GET /api/changes answers with for one query string. */
    async function idsFor(query: string): Promise<string[]> {
      const answer = await get(`/api/changes?recordId=${recordId}${query}`)
      expect(answer.status, query).toBe(200)
      return (answer.body['changes'] as { id: string }[]).map((row) => row.id)
    }

    // The row's own stamp, read back rather than guessed, so the boundary below is the real one.
    const row = one(t.api.listChanges({ workspaceId: 'default', recordId }), 'the create row of the record just written')
    const at = row.at
    const asMillis = parseLocalStamp(at)
    if (asMillis === null) throw new Error(`the change log stored "${at}", which is not a local stamp`)
    const oneSecondEarlier = localStamp(new Date(asMillis - 1000))

    expect(await idsFor(''), 'the row exists at all').toContain(row.id)
    // Inclusive, at the exact second. This is the assertion that fails if `until` is accepted and
    // then not passed down to the query, which is the state the endpoint shipped in.
    expect(await idsFor(`&until=${encodeURIComponent(at)}`)).toContain(row.id)
    expect(await idsFor(`&until=${encodeURIComponent(oneSecondEarlier)}`)).toEqual([])
    // And a real day, which is the pair together — the thing that could not be asked for before.
    const day = at.slice(0, 10)
    expect(await idsFor(`&since=${day}&until=${encodeURIComponent(`${day} 23:59:59`)}`)).toContain(row.id)

    // A window that ends before it starts is refused, naming both values. Answering it with an
    // empty list would be indistinguishable from a quiet week.
    const backwards = await get(`/api/changes?since=${day} 23:59:59&until=${day} 00:00:00`)
    expect(backwards.status).toBe(400)
    expect(String(backwards.body['error'])).toContain('later than')
    expect(String(backwards.body['error'])).toContain('23:59:59')

    // The refusal names the parameter the caller sent. A shared schema saying "since must look
    // like…" to somebody who sent `until` costs a round trip to work out.
    const nonsense = await get('/api/changes?until=lunchtime')
    expect(nonsense.status).toBe(400)
    expect(String(nonsense.body['error'])).toContain('until must look like')
  })

  it('says GET /api/sessions/:id carries the work block, and it does', async () => {
    const note = await noteFor('GET', '/api/sessions/:id')
    expect(note).toContain('work')
    expect(note).toContain('wrote')
    expect(note).toContain('touched')
    expect(note).toContain('lines')

    const run = 'work-block'
    const filed = await post(
      '/api/records',
      { kind: 'session', title: uniqueTitle('a session with work'), data: { state: 'running', runtime: 'claude-code' } },
      asRun(run),
    )
    const recordId = (filed.body['record'] as { id: string }).id
    await post('/api/records', { kind: 'note', title: uniqueTitle('written by the session'), data: { body: 'x' } }, asRun(run))

    const detail = await get(`/api/sessions/${recordId}`)
    expect(detail.status).toBe(200)
    const work = detail.body['work'] as {
      wrote: { title: string }[]
      touched: unknown[]
      counts: { changes: number; storedByName: number }
    } | null
    if (work === null) throw new Error('the session detail carries no work block, so the sentence is a promise it does not keep')
    expect(work.wrote.length).toBeGreaterThan(0)
    expect(Array.isArray(work.touched)).toBe(true)
    expect(work.counts.changes).toBeGreaterThan(0)
    // Nothing is left under the raw name, because filing the session repointed it.
    expect(work.counts.storedByName).toBe(0)
  })

  it('says POST /api/sessions/discover migrates the change log and takes dryRun, and both are true', async () => {
    const note = await noteFor('POST', '/api/sessions/discover')
    expect(note).toContain('dryRun')
    expect(note).toContain('changeLog')
    expect(note).toContain('repointed')

    const dry = await post('/api/sessions/discover', { dryRun: true })
    expect(dry.status).toBe(200)
    const changeLog = dry.body['changeLog'] as { applied: boolean; note: string; dangling: unknown[] }
    expect(changeLog.applied).toBe(false)
    expect(changeLog.note).toContain('dry run')
    expect(dry.body['report']).toBeDefined()

    const wet = await post('/api/sessions/discover', {})
    expect(wet.status).toBe(200)
    expect((wet.body['changeLog'] as { applied: boolean }).applied).toBe(true)
  })

  it('says POST /api/resources takes its owner from the header, which is the body it now accepts', async () => {
    const note = await noteFor('POST', '/api/resources')
    expect(note).toContain('x-mole-office-session')
    expect(note).toContain('sessionRecordId')
    // The documented minimal body is the one the route really accepts — see the block above.
    expect(note).toContain('{"type":…,"key":…')
  })

  it('describes the endpoints this app actually registered, and only those', async () => {
    const listed = (await index()).endpoints.map((e) => `${e.method} ${e.path}`).sort()
    expect(listed).toEqual(listRoutes().map((r) => `${r.method} ${r.path}`).sort())
    expect((await index()).endpoints.filter((e) => e.description === null)).toEqual([])
  })
})

// ==================================== 3b. the surface cannot outgrow the sentences describing it

/**
 * The property the four "the index cannot drift" tests were all supposed to have, and none did.
 *
 * Each of them registered the plugins its author knew about, so "every endpoint is described" was
 * true of that author's idea of the server and said nothing about the server. `presentationRoutes`
 * was added, none of the four heard about it, eight endpoints shipped answering `description: null`
 * and all four stayed green.
 *
 * The app under test here is `buildApp()` itself, so the only way to add a route group without a
 * sentence is to add one that fails this block.
 *
 * WHETHER EVERY ROUTE GROUP IS REGISTERED AT ALL is tests/server-wiring.test.ts's question, not
 * this one. That file compares the endpoints `buildApp()` serves against every plugin it finds by
 * reading src/server/api, in both directions. This file takes the surface as given and asks
 * whether it explains itself.
 */
describe('every endpoint the server registers says what it is for', () => {
  async function index(): Promise<ApiIndex> {
    return bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
  }

  it('has a sentence for every one of them — this is the assertion that was passing blind', async () => {
    const undescribed = (await index()).endpoints
      .filter((e) => e.description === null)
      .map((e) => `${e.method} ${e.path}`)
    expect(
      undescribed,
      'these endpoints are registered by src/server/index.ts and nobody has said what they are for. Declare the ' +
        "sentence beside the route as config: { note: '…' }, the way src/server/api/presentation.ts does.",
    ).toEqual([])
  })

  it('describes each endpoint once, beside its route or in the map, never both', () => {
    // BACK SINCE 23 NOVEMBER 2026, after a cut on 17 November that took it for a case catching no real fault.
    // The fault it catches happened in between: a commit gave POST /api/records a sentence beside its route.
    // GET /api serves that sentence in place of the route's line in ROUTE_NOTES, so agents reading GET /api
    // lost the block limit and the meaning of the envelope summary, and only two tests that read those words
    // noticed. This case names the route at the commit that does it.
    expect(
      endpointsDescribedTwice(listRoutes()),
      'these endpoints carry a note beside the route AND have a line in ROUTE_NOTES; one of the two is prose ' +
        'nobody serves and nobody will correct',
    ).toEqual([])
    // And the check is a check: GET /api/health has a line in the map, so a route claiming to
    // describe itself as well is the collision this reports.
    expect(
      endpointsDescribedTwice([
        { method: 'GET', path: '/api/health', note: 'a second sentence', operation: 'runtime.health', reach: 'remote' },
      ]),
    ).toEqual(['GET /api/health'])
  })
})

// ============================================== 1. a fresh seed leaves nothing for the migration

describe('a fresh database from the seed', () => {
  let seeded: TestDb
  let sessions: SessionsLib

  beforeAll(async () => {
    seeded = await freshDb()
    // Importing the seed RUNS it, which is what `npm run db:reset` does after migrating. It
    // throws if its own check fails, so a seed that shipped an unresolved name would fail here
    // before any assertion below ran.
    await import('../scripts/seed.ts')
    // Imported after the seed so it is bound to the same freshly loaded database client.
    sessions = await import('../src/server/lib/sessions.ts')
  })

  afterAll(() => {
    seeded.close()
  })

  it('stores a session record id in every change row that names a session', () => {
    const unresolved = seeded.api
      .storedSessionRefs('default')
      .map((ref) => ({ ...ref, match: seeded.api.resolveSessionRef(ref.stored, 'default') }))
      .filter((ref) => ref.match.matchedBy !== 'recordId')

    expect(
      unresolved.map((r) => `${r.stored} (${r.rows} rows, ${r.match.matchedBy})`),
      'these change rows carry a run name rather than the id of the session record it means',
    ).toEqual([])
    // And it is testing something: the seed does attribute work to sessions.
    expect(seeded.api.storedSessionRefs('default').length).toBeGreaterThan(0)
  })

  it('files the back-dated checklist rows against the session record, not the run name', () => {
    // The rows fabricateHistory INSERTs directly. They are addressed by their fixed ids, which is
    // how a rerun recognises them, and are exactly the rows that used to hold "touch" and "obj".
    const rows = seeded.api.listChanges({ workspaceId: 'default', limit: 5000 }).filter((row) => row.id.startsWith('seed-hist-'))
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      if (row.sessionId === null) continue // a transition a person made carries no session at all
      const ref = seeded.api.resolveSessionRef(row.sessionId, 'default')
      expect(ref.matchedBy, `${row.id} stores "${row.sessionId}"`).toBe('recordId')
      const record = seeded.api.getRecord(row.sessionId)
      expect(record?.kind).toBe('session')
    }
    // At least one of them IS an agent run, so the loop above is not passing on nulls alone.
    expect(rows.some((row) => row.sessionId !== null)).toBe(true)
  })

  it('leaves the change-log migration with nothing to do and nothing dangling', () => {
    // The migration is what used to clean up after the seed. A dry run reports what it WOULD do
    // without writing, so this asks the question without changing the answer.
    const dry = sessions.migrateChangeSessions(seeded.api.HUMAN, 'default', { apply: false })
    expect(dry.migrated).toEqual([])
    expect(dry.dangling).toEqual([])
    expect(dry.rowsRepointed).toBe(0)
    expect(dry.alreadyRecordIds).toBe(dry.scanned)
  })

  it('still attributes the seeded work to the runs that did it', () => {
    // The fix must not have quietly emptied the session column instead of resolving it: the
    // demo's whole point is that "which run changed this" has an answer.
    const scanRun = seeded.api.getRecordByTitle('scan-1923b · scanned reel R-1923-02 and timed it', 'default')
    if (!scanRun) throw new Error('the seed no longer files the scan-1923b session')
    const rows = seeded.api.listChanges({ workspaceId: 'default', session: [scanRun.id], limit: 5000 })
    expect(rows.length).toBeGreaterThan(0)
    const historyRow = one(
      rows.filter((row) => row.id === 'seed-hist-sc-3'),
      'the back-dated transition of the scanner checklist item sc-3',
    )
    expect(historyRow.sessionId).toBe(scanRun.id)
  })
})
