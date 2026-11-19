// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A 201 SAYS ABOUT THE RUN NAME IT WAS WRITTEN UNDER — the three cases, and the two of them
 * that are news.
 *
 * THE DEFECT THIS FILE PINS DOWN. A session filed under a run name that already belonged to a
 * DIFFERENT session bound nothing and said nothing: the 201 omitted `sessionBinding` entirely, so
 * the agent's change rows — including the create row of the record it had just filed — went on
 * being attributed to somebody else's session and nothing anywhere told it. The reply's own
 * documentation had promised a report; the prose was made to match the silence, and this file is
 * where the behaviour changed instead.
 *
 * THE RULE, from the product owner: only report a refusal when the reference is a RUN NAME and
 * there is a real conflict or ambiguity. Record-id binding stays quiet when it is valid.
 *
 *   reference is a session record's ID, and it exists  -> no `sessionBinding` on the reply
 *   reference is a run name nothing answers to         -> bound, rows repointed, reported
 *   reference is a run name another session holds      -> nothing written, and REPORTED
 *
 * "Holds" covers both ways a name can be spoken for: another session is BOUND to it, or another
 * session is TITLED exactly that. They are different facts — only the binding survives a rename —
 * and the message tells them apart, but neither may be taken quietly.
 *
 * THE LAST BLOCK IS ABOUT THE MESSAGES THEMSELVES. A refusal that says what to do is worth
 * nothing if the request it names is a 404, and that is exactly what the unresolved-reference
 * message used to do: it sent callers to POST /api/sessions/migrate-changes and
 * POST /api/sessions/<record id>/name, neither of which this server has ever served. So the last
 * block collects the messages this server really produces on these paths and checks every route
 * named in them against the LIVE route table — the same table GET /api describes itself from, read
 * off the router rather than retyped here, so a route that is renamed tomorrow fails this file
 * rather than a caller.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import { trackApiRoutes, type ApiRoute } from '../src/server/api/kinds.ts'
import { route } from '../src/server/lib/route.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

// ------------------------------------------------------------------------------ the harness

type SessionsLib = typeof import('../src/server/lib/sessions.ts')

interface Harness {
  db: TestDb
  app: FastifyInstance
  sessions: SessionsLib
  /** The routes the app really registered, read off the router by the same hook GET /api uses. */
  routes: () => readonly ApiRoute[]
}

let h: Harness
/** An empty machine: every session in this file is one that was FILED, never one found on disk. */
let home: string

function env(): AdapterEnv {
  return {
    homeDir: home,
    now: new Date('2026-08-08T12:00:00Z'),
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 300,
    orphanAfterSeconds: 7200,
  }
}

beforeAll(async () => {
  const db = await freshDb()
  home = mkdtempSync(join(tmpdir(), 'mole-office-session-binding-'))

  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { presentationRoutes } = await import('../src/server/api/presentation.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { sourceRoutes } = await import('../src/server/api/source.ts')
  const { exportRoutes } = await import('../src/server/api/export.ts')
  const { importRoutes } = await import('../src/server/api/import.ts')
  const { discoveryRoutes } = await import('../src/server/api/kinds.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const sessions = await import('../src/server/lib/sessions.ts')

  const app = Fastify()
  const routes = trackApiRoutes(app)
  installErrorHandling(app)

  // ---------------------------------------------------------------------------------------
  // WHY THIS FILE STILL TYPES THE REGISTRATION LIST WHEN `apiApp()` EXISTS
  // ---------------------------------------------------------------------------------------
  //
  // Every other HTTP test now asks the product what it serves, through `apiApp()` in helpers.ts,
  // and that is the right default. This file cannot: `sessionRoutes` has to be handed the empty
  // machine `env()` above, so that every session here is one that was FILED and never one this
  // workstation happens to be running. `buildApp` takes no such argument and should not grow one
  // for a test.
  //
  // The cost is stated rather than hidden. If a route group is added to `src/server/index.ts` and
  // not to this list, a message naming one of its endpoints is reported here as unserved -- a
  // FALSE FAILURE, which is the safe direction, and `tests/server-wiring.test.ts` is what catches
  // the omission itself. The list below is every group `buildApp` registers.
  // The same two declarations the real registration makes in src/server/index.ts. Every /api route
  // says what a caller is asking for and which machines may ask, and `trackApiRoutes` above refuses
  // to register one that has not — including this stand-in.
  app.get('/api/health', route('runtime.health', 'remote'), async () => ({ ok: true, records: 0 }))
  await app.register(discoveryRoutes, { prefix: '/api', listRoutes: routes, currentWorkspace: () => ({ current: 'default', stated: false }), })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(presentationRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(sourceRoutes, { prefix: '/api' })
  await app.register(exportRoutes, { prefix: '/api' })
  await app.register(importRoutes, { prefix: '/api' })
  await app.ready()

  h = { db, app, sessions, routes }
}, 60_000)

afterAll(async () => {
  await h.app.close()
  h.db.close()
  rmSync(home, { recursive: true, force: true })
})

// ------------------------------------------------------------------------------ small helpers

const AS = (session: string) => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': session,
})

const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

/** The binding report on a 201, as the wire carries it: absent is a value, not an oversight. */
interface WireBinding {
  name: string
  recordId: string
  repointed: number
  alreadyBoundTo: string | null
  note: string
}

interface Filed {
  id: string
  binding: WireBinding | undefined
  /** True when the key was on the reply at all, so "absent" and "null" cannot be confused. */
  reported: boolean
}

/** File a record over HTTP as an agent working under `reference`. Fails loudly on anything but 201. */
async function file(
  reference: string | null,
  input: { kind: string; title: string; data?: Record<string, unknown> },
): Promise<Filed> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: reference === null ? {} : AS(reference),
    payload: input,
  })
  if (res.statusCode !== 201) throw new Error(`POST ${input.title} answered ${res.statusCode}: ${res.body}`)
  const reply = body(res)
  return {
    id: String(reply['record'].id),
    binding: reply['sessionBinding'] as WireBinding | undefined,
    reported: 'sessionBinding' in reply,
  }
}

/** A session record, filed by an agent writing under `reference`. */
async function fileSession(reference: string | null, title: string): Promise<Filed> {
  return file(reference, { kind: 'session', title, data: { state: 'running', runtime: 'claude-code' } })
}

/** The binding report, or a failure that says the silence is what went wrong. */
function reportOf(filed: Filed, what: string): WireBinding {
  if (filed.binding === undefined) throw new Error(`the 201 carried no sessionBinding, so nothing said ${what}`)
  return filed.binding
}

/** Every value the change log's session column holds, with how many rows carry each. */
function storedRefs(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of h.db.api.listChanges({ workspaceId: 'default', limit: 5000 })) {
    if (row.sessionId === null) continue
    out[row.sessionId] = (out[row.sessionId] ?? 0) + 1
  }
  return out
}

/** The change row that created a record. */
function createRowOf(recordId: string) {
  return one(
    h.db.api.listChanges({ workspaceId: 'default', recordId }).filter((row) => row.op === 'create'),
    `the create row of ${recordId}`,
  )
}

// ================================================== 1. a record id that is valid says nothing

describe('a reference that is a session record id', () => {
  it('binds nothing and reports nothing, because an id already means what it says', async () => {
    const worker = await fileSession(null, 'the session doing the work')
    expect(worker.reported).toBe(false)

    // The ordinary shape of a long run: the agent holds the record id and writes under it, and at
    // some point files a second session record — a subtask, a replay, a run it is describing.
    const second = await fileSession(worker.id, 'a second session, filed while writing as the first')

    expect(second.reported).toBe(false)
    expect(second.binding).toBeUndefined()
    // Quiet because there is nothing to say: the row is already filed under the record the header
    // named, and no name was claimed by anybody.
    expect(createRowOf(second.id).sessionId).toBe(worker.id)
    expect(h.db.api.sessionNamesOf(second.id)).toEqual([])
    expect(h.db.api.sessionNamesOf(worker.id)).toEqual([])
  })

  it('stays quiet even when the record it names has been deleted, which does not unfile its work', async () => {
    const worker = await fileSession(null, 'a run that has since been deleted')
    h.db.api.deleteRecord(worker.id, h.db.api.HUMAN)

    const second = await fileSession(worker.id, 'filed afterwards, still writing as that run')
    expect(second.reported).toBe(false)
    expect(createRowOf(second.id).sessionId).toBe(worker.id)
  })
})

// =================================================== 2. a free run name is claimed, and said so

describe('a reference that is a run name nothing answers to yet', () => {
  it('binds the name, repoints the rows written before the record existed, and says how many', async () => {
    await file('checkpoint3', { kind: 'note', title: 'what broke', data: { body: 'the v3 shell cracked' } })
    await file('checkpoint3', { kind: 'note', title: 'what I tried', data: { body: 'reprint at effort 15' } })
    expect(storedRefs()['checkpoint3']).toBe(2)

    const filed = await fileSession('checkpoint3', 'checkpoint3 · the audit run')
    const report = reportOf(filed, 'that the run had been joined up')

    expect(report.name).toBe('checkpoint3')
    expect(report.recordId).toBe(filed.id)
    expect(report.alreadyBoundTo).toBeNull()
    // The two rows above, plus this record's own create row and the binding row itself, which is
    // written before the repoint precisely so the repoint carries it.
    expect(report.repointed).toBe(4)
    expect(report.note).toContain('4 change rows')

    expect(storedRefs()['checkpoint3']).toBeUndefined()
    expect(h.db.api.sessionNamesOf(filed.id)).toEqual(['checkpoint3'])
  })
})

// ============================== 3. a run name somebody else holds: nothing written, and REPORTED

describe('a reference that is a run name another session already holds', () => {
  it('refuses the binding and says so — the case that used to answer 201 and nothing else', async () => {
    const first = await fileSession('run1', 'run1 · monday')
    expect(reportOf(first, 'that the name was bound').alreadyBoundTo).toBeNull()
    await file('run1', { kind: 'note', title: 'written on monday', data: { body: 'x' } })

    const second = await fileSession('run1', 'run1 · tuesday')
    const report = reportOf(second, 'that its rows were going to another session')

    expect(report.name).toBe('run1')
    expect(report.recordId).toBe(second.id)
    expect(report.repointed).toBe(0)
    // The whole point of the report: the session that has the name is NAMED, by title and by id,
    // so the caller can go and look at it rather than guess.
    expect(report.alreadyBoundTo).toBe(first.id)
    expect(report.note).toContain('run1 · monday')
    expect(report.note).toContain(first.id)
    // What happened to the caller's own rows, which is what it cannot see from here...
    expect(report.note).toContain('create row')
    expect(report.note).toContain(second.id)
    // ...and what to do about it, in two requests that both work.
    expect(report.note).toContain(`x-mole-office-session: ${second.id}`)
    expect(report.note).toContain('POST /api/sessions/discover')

    // The report is true: nothing was bound, nothing moved, and the caller's rows are filed under
    // the session it SAID it was writing as. That silence is what this test exists to end.
    expect(h.db.api.sessionNamesOf(second.id)).toEqual([])
    expect(h.db.api.sessionNamesOf(first.id)).toEqual(['run1'])
    expect(h.db.api.resolveSessionRef('run1', 'default').recordId).toBe(first.id)
    expect(createRowOf(second.id).sessionId).toBe(first.id)
  })

  it('reports the ambiguity when the name is another session title, and calls it a title', async () => {
    // Nothing is BOUND to "baseline" here — a session record simply carries it as its exact title,
    // which is enough for every write under that reference to be filed there. Taking the name
    // would move that session's history; saying nothing would leave the caller believing this one
    // owns it.
    const titled = await fileSession(null, 'baseline-of-the-ambiguity-case')

    const second = await fileSession('baseline-of-the-ambiguity-case', 'the run also calling itself baseline')
    const report = reportOf(second, 'that the name was already a session title')

    expect(report.alreadyBoundTo).toBe(titled.id)
    expect(report.repointed).toBe(0)
    // Told apart from a binding on purpose: only a binding survives a rename, so a caller deciding
    // what to do next has to know which of the two it has run into.
    expect(report.note).toContain('exact title')
    expect(report.note).toContain('POST /api/sessions/discover')

    // Nothing was written on either side, so the title is still just a title.
    expect(h.db.api.sessionNamesOf(titled.id)).toEqual([])
    expect(h.db.api.sessionNamesOf(second.id)).toEqual([])
    expect(h.db.api.resolveSessionRef('baseline-of-the-ambiguity-case', 'default').matchedBy).toBe('title')
    expect(createRowOf(second.id).sessionId).toBe(titled.id)
  })

  it('leaves the key off when there was no reference at all, so absent still means nothing happened', async () => {
    const typed = await fileSession(null, 'typed in by a person')
    expect(typed.reported).toBe(false)

    // A note is not a session, so no name is claimed however the write is addressed.
    const note = await file('some-run', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    expect(note.reported).toBe(false)
  })
})

// ============================================ 4. every route these messages name is a real route

/**
 * A route as a message writes it, picked out of prose.
 *
 * `<record id>` and friends are how a message writes a parameter to a person, and one can contain
 * a space, so they are turned into a single segment before the paths are picked out. Anything
 * after the path — a JSON body, a query string, a full stop — is not part of the route.
 */
function routesNamedIn(text: string): string[] {
  const found: string[] = []
  const withParams = text.replace(/<[^>]*>/g, ':param')
  for (const m of withParams.matchAll(/\b(GET|POST|PATCH|PUT|DELETE)\s+(\/api[^\s"'`,;)]*)/g)) {
    const method = m[1] ?? ''
    const path = (m[2] ?? '').split('?')[0]?.replace(/[.]+$/, '') ?? ''
    found.push(`${method} ${path}`)
  }
  return found
}

/**
 * Which of the routes a message names this server does not serve.
 *
 * Compared segment by segment against the LIVE route table rather than a list typed here: a
 * table segment that starts with ":" is a parameter and matches any one segment the message
 * wrote there, which is what lets "PATCH /api/records/:id" and "POST /api/sessions/<record id>"
 * be checked against the same table the router built.
 */
function unservedRoutesIn(text: string, table: readonly ApiRoute[]): string[] {
  const served = (named: string) => {
    const [method, path] = named.split(' ')
    const want = (path ?? '').split('/')
    return table.some((route) => {
      if (route.method !== method) return false
      const have = route.path.split('/')
      if (have.length !== want.length) return false
      return have.every((seg, i) => (seg.startsWith(':') ? (want[i] ?? '') !== '' : seg === want[i]))
    })
  }
  return routesNamedIn(text).filter((named) => !served(named))
}

/** One thing this server said to a caller, and where it said it. */
interface Message {
  where: string
  text: string
}

/**
 * The messages these paths really produce, taken from real replies rather than from the source.
 *
 * Read out of running code on purpose: a scan of the files would also find the comments that name
 * a route in order to say it does NOT exist ("POST /api/records/propose and /api/proposals are
 * both 404"), and a check that had to be taught about exceptions is a check nobody trusts.
 */
async function messagesThisServerSays(): Promise<Message[]> {
  const api = h.db.api
  const said: Message[] = []
  const say = (where: string, text: unknown) => said.push({ where, text: String(text ?? '') })

  // A reference nothing answers to, and one that names a record of the wrong kind.
  say('resolveSessionRef(unknown).why', api.resolveSessionRef('never-filed', 'default').why)
  const note = api.createRecord({ workspaceId: 'default', kind: 'note', title: 'not a session', actor: api.HUMAN })
  say('resolveSessionRef(a note id).why', api.resolveSessionRef(note.id, 'default').why)

  // The same sentence as a caller meets it, wrapped in the changes filter.
  await file('never-filed', { kind: 'note', title: 'orphan work', data: { body: 'x' } })
  const unresolved = body(await h.app.inject({ method: 'GET', url: '/api/changes?session=never-filed' }))
  say('GET /api/changes?session=<unresolved>', unresolved['session'].note)

  // A session whose rows still carry the raw name: the branch that offers the migration.
  const mixed = await fileSession('mixed', 'mixed · a run part way through')
  h.db.client.sqlite.prepare('update changes set session_id = ? where record_id = ?').run('mixed', mixed.id)
  const half = body(await h.app.inject({ method: 'GET', url: '/api/changes?session=mixed' }))
  say('GET /api/changes?session=<half migrated>', half['session'].note)
  const detail = body(await h.app.inject({ method: 'GET', url: `/api/sessions/${mixed.id}` }))
  say('GET /api/sessions/:id work.note', detail['session'] ? detail['work']?.note : '')

  // The three binding reports.
  say('sessionBinding.note (bound)', reportOf(mixed, 'that the name was bound').note)
  const clash = await fileSession('mixed', 'a later run of the same name')
  say('sessionBinding.note (name held)', reportOf(clash, 'that the name was held').note)
  const titled = await fileSession(null, 'baseline')
  const ambiguous = await fileSession('baseline', 'another run calling itself baseline')
  say('sessionBinding.note (title held)', reportOf(ambiguous, 'that the title was held').note)
  say(
    'bindSessionName refusal',
    api.bindSessionName(titled.id, 'mixed', api.HUMAN).note,
  )

  // The refusals and the sweep, which are the other messages that hand out requests to make.
  const refused = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS('some-run'),
    payload: { kind: 'decision', title: 'Stay on position control', data: { because: 'attribution' } },
  })
  say('POST /api/records 403 (human-only kind)', body(refused)['error'])
  const missing = await h.app.inject({ method: 'GET', url: '/api/sessions/no-such-session' })
  say('GET /api/sessions/:id 404', body(missing)['error'])
  const swept = body(await h.app.inject({ method: 'POST', url: '/api/sessions/discover', payload: { dryRun: true } }))
  say('POST /api/sessions/discover note', swept['note'])
  say('POST /api/sessions/discover changeLog.note', swept['changeLog'].note)

  return said
}

describe('the routes these messages tell a caller to use', () => {
  it('are all routes this server serves', async () => {
    const table = h.routes()
    const said = await messagesThisServerSays()

    for (const message of said) {
      expect(message.text, `${message.where} said nothing at all`).not.toBe('')
      expect(
        unservedRoutesIn(message.text, table),
        `${message.where} tells a caller to call a route this server does not serve`,
      ).toEqual([])
    }

    // Not vacuous: these messages really are full of instructions. If a rewrite ever leaves them
    // naming no routes at all, this number falls and the check above stops meaning anything.
    const named = said.flatMap((m) => routesNamedIn(m.text))
    expect(named.length).toBeGreaterThan(8)
    expect(named).toContain('POST /api/sessions/discover')
  })

  it('would have failed on the two routes the old messages named', () => {
    // The defect, verbatim, run through the same checker: both of these were printed to callers
    // and neither has ever been registered. Without this the check above could pass by being
    // blind rather than by being right.
    const table = h.routes()
    expect(
      unservedRoutesIn('POST /api/sessions/migrate-changes will resolve it once a record exists.', table),
    ).toEqual(['POST /api/sessions/migrate-changes'])
    expect(unservedRoutesIn('or POST /api/sessions/<record id>/name binds it by hand.', table)).toEqual([
      'POST /api/sessions/:param/name',
    ])
    // And it is not simply refusing everything: the route that does the job passes.
    expect(unservedRoutesIn('POST /api/sessions/discover {"dryRun":true} shows it first.', table)).toEqual([])
    expect(unservedRoutesIn('PATCH /api/records/:id {"dataPatch":{"state":"done"}}', table)).toEqual([])
  })

  it('no longer sends anyone to a route that does not exist for an unresolved name', async () => {
    const why = h.db.api.resolveSessionRef('a-typo-in-my-header', 'default').why ?? ''
    expect(why).not.toContain('migrate-changes')
    expect(why).not.toContain('/name')
    expect(why).toContain('POST /api/sessions/discover')

    // And the route it does name answers, with the body the message shows.
    const res = await h.app.inject({ method: 'POST', url: '/api/sessions/discover', payload: { dryRun: true } })
    expect(res.statusCode).toBe(200)
  })
})
