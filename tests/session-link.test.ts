// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH SESSION PRODUCED THIS — the question Mole Office exists to answer, tested end to end.
 *
 * THE DEFECT THIS FILE PINS DOWN, in the auditor's own words: "all 28 of my change rows carry
 * sessionId 'checkpoint3' while the session record's id is 'Hl3FyKvW1GHd' — 0 rows match the
 * record id, 28 match the string. And GET /api/changes rejects both ?session= and ?sessionId=
 * with 400."
 *
 * Both halves of that are silences rather than errors. The column LOOKED populated, so a page
 * drawing it would show something that reads like an answer and joins to nothing; and the obvious
 * way to check — ask the API which changes a session made — was a 400, so nobody would find out.
 *
 * The tests below are therefore mostly about the JOIN rather than about the string: a row is only
 * right if `changes.session_id` is the id of a real session record, and the tests read the raw
 * rows out of the library to make sure the endpoint is not merely pretty-printing a name.
 *
 * THE OTHER HALF, which is easy to miss: nothing here may invent a session. A run name that no
 * session record answers to is kept exactly as sent and REPORTED as unresolved. That boundary is
 * tested as hard as the happy path, because "Mole Office quietly filed a session for a typo" would be
 * the same class of failure pointing the other way.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance, type InjectOptions } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

// ------------------------------------------------------------------------------ the harness

type SessionsLib = typeof import('../src/server/lib/sessions.ts')

interface Harness {
  db: TestDb
  app: FastifyInstance
  sessions: SessionsLib
}

let h: Harness
let home: string
/** The project this case files into, made fresh so no case meets another's run names or rows. */
let WORKSPACE = 'default'
let caseNumber = 0
let makeWorkspace: (input: { id: string; title: string }) => unknown

/**
 * A machine with no transcripts on it at all.
 *
 * Deliberate: this file is about the change log's session column, not about discovery. With an
 * empty home directory every session in these tests is one that was FILED, which is the only kind
 * a change row can belong to, and the sweep in POST /api/sessions/discover has nothing to add.
 */
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
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const sessions = await import('../src/server/lib/sessions.ts')
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.ready()

  h = { db, app, sessions }
}, 60_000)

afterAll(async () => {
  await h.app.close()
  h.db.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `session-link-case-${String(caseNumber)}`
  makeWorkspace({ id: WORKSPACE, title: `Session link case ${String(caseNumber)}` })
  home = mkdtempSync(join(tmpdir(), 'mole-office-session-link-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

// ------------------------------------------------------------------------------ small helpers

/** Every request goes to this case's project, unless it names one of its own. */
function inject(options: InjectOptions) {
  return h.app.inject({ ...options, headers: { 'x-mole-office-workspace': WORKSPACE, ...(options.headers ?? {}) } })
}

const AS = (session: string) => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': session,
  'x-mole-office-workspace': WORKSPACE,
})

const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

/** POST a record as the named run, and hand back its id. Fails loudly on anything but a 201. */
async function post(
  session: string,
  input: { kind: string; title: string; data?: Record<string, unknown> },
): Promise<string> {
  const res = await inject({ method: 'POST', url: '/api/records', headers: AS(session), payload: input })
  if (res.statusCode !== 201) throw new Error(`POST ${input.title} answered ${res.statusCode}: ${res.body}`)
  return String(body(res)['record'].id)
}

/** File the session record a run has been writing under. */
async function fileSession(session: string, title: string): Promise<string> {
  return post(session, { kind: 'session', title, data: { state: 'running' } })
}

/** Every stored value in the session column, with how many rows carry it. */
function storedRefs(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of h.db.api.listChanges({ workspaceId: WORKSPACE, limit: 5000 })) {
    if (row.sessionId === null) continue
    out[row.sessionId] = (out[row.sessionId] ?? 0) + 1
  }
  return out
}

// ============================================================ the audit's case, end to end

describe('a run that writes first and files its session afterwards', () => {
  it('ends with every one of its change rows joined to the session record, and none to the name', async () => {
    // Exactly the shape of the audit: work first, under a run name, because an agent does not
    // hold a record id it has not created yet.
    const gripper = await post('checkpoint3', { kind: 'module', title: 'Tray clamp', data: { parts: [] } })
    await post('checkpoint3', { kind: 'note', title: 'what broke', data: { body: 'the v3 shell cracked' } })
    await inject({
      method: 'PATCH',
      url: `/api/records/${gripper}`,
      headers: AS('checkpoint3'),
      payload: { dataPatch: { context: 'reprinting at effort 15' } },
    })

    // Before the session is filed there is nothing to join to, so the name is kept. That is the
    // honest state, and it is the one the migration below exists for.
    expect(storedRefs()['checkpoint3']).toBeGreaterThan(0)

    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    // THE ASSERTION THE AUDIT WOULD HAVE MADE. Every row, including the ones written before the
    // session record existed, now names the record.
    const refs = storedRefs()
    expect(refs['checkpoint3'], 'no row may still carry the raw run name').toBeUndefined()
    expect(refs[sessionId]).toBe(h.db.api.listChanges({ workspaceId: WORKSPACE, limit: 5000 }).filter((c) => c.sessionId !== null).length)

    // ...and the join is real: every stored value is the id of a live session record.
    for (const row of h.db.api.listChanges({ workspaceId: WORKSPACE, limit: 5000 })) {
      if (row.sessionId === null) continue
      const record = h.db.api.getRecord(row.sessionId)
      expect(record?.kind, `${row.sessionId} should be a session record`).toBe('session')
    }
  })

  it('keeps what the caller actually said, so the name still works as a way in', async () => {
    await post('checkpoint3', { kind: 'note', title: 'a finding', data: { body: 'the sweep stalled' } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    // The name is not stored on the record — a rename would lose it — it is a dated, attributed
    // change row of its own, which is why it survives everything.
    expect(h.db.api.sessionNamesOf(sessionId)).toEqual(['checkpoint3'])

    // And a rename does not break the way back in.
    h.db.api.updateRecord(sessionId, { title: 'the audit run, renamed' }, h.db.api.HUMAN)
    const ref = h.db.api.resolveSessionRef('checkpoint3', WORKSPACE)
    expect(ref.recordId).toBe(sessionId)
    expect(ref.matchedBy).toBe('name')
    expect(ref.title).toBe('the audit run, renamed')
  })

  it('attributes the writes it makes after filing to the same record, without being told the id', async () => {
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')
    const later = await post('checkpoint3', { kind: 'note', title: 'after', data: { body: 'carried on' } })

    const rows = h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: later })
    expect(one(rows, 'create row').sessionId).toBe(sessionId)
  })
})

// ============================================================ asking the question over HTTP

describe('GET /api/changes takes a session filter and says what it matched', () => {
  it('answers ?session= by run name, where it used to answer 400', async () => {
    const noteId = await post('checkpoint3', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    const res = await inject({ method: 'GET', url: '/api/changes?session=checkpoint3' })
    expect(res.statusCode, res.body).toBe(200)
    const out = body(res)

    expect(out['session']['matchedBy']).toBe('name')
    expect(out['session']['recordId']).toBe(sessionId)
    expect(out['session']['title']).toBe('checkpoint3 · audit run')
    expect(out['session']['param']).toBe('session')
    expect(out['changes'].map((c: { recordId: string }) => c.recordId)).toContain(noteId)
    // Nothing dangling is being hidden: the count of rows still holding a name is stated.
    expect(out['session']['storedByName']).toBe(0)
  })

  it('answers ?sessionId= by record id, and says it matched an id', async () => {
    await post('checkpoint3', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    const out = body(await inject({ method: 'GET', url: `/api/changes?sessionId=${sessionId}` }))
    expect(out['session']['matchedBy']).toBe('recordId')
    expect(out['session']['recordId']).toBe(sessionId)
    expect(out['session']['param']).toBe('sessionId')
    expect(out['changes'].length).toBeGreaterThan(0)
  })

  it('takes either spelling for either form, because a caller should not have to guess', async () => {
    await post('checkpoint3', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    const byName = body(await inject({ method: 'GET', url: '/api/changes?sessionId=checkpoint3' }))
    const byId = body(await inject({ method: 'GET', url: `/api/changes?session=${sessionId}` }))

    expect(byName['session']['recordId']).toBe(sessionId)
    expect(byId['session']['recordId']).toBe(sessionId)
    expect(byName['changes'].length).toBe(byId['changes'].length)
  })

  it('refuses only the one case with no honest answer: two different filters at once', async () => {
    const res = await inject({ method: 'GET', url: '/api/changes?session=a&sessionId=b' })
    expect(res.statusCode).toBe(400)
    expect(String(body(res)['error'])).toContain('two spellings of one filter')
  })

  it('reports an unresolved name as unresolved, and still returns its rows', async () => {
    await post('never-filed', { kind: 'note', title: 'orphan work', data: { body: 'x' } })

    const out = body(await inject({ method: 'GET', url: '/api/changes?session=never-filed' }))
    expect(out['session']['matchedBy']).toBe('unresolved')
    expect(out['session']['recordId']).toBeNull()
    expect(out['changes'].length).toBe(1)
    // Every returned row stores the NAME — there is no record id for any of them to be storing.
    // This reported 0 while the note in the same object said "these 1 rows are the ones written
    // under that exact name", so the field that exists to say how much repair is owed said none.
    expect(out['session']['storedByName']).toBe(1)
    // The sentence has to say what to do, not just that it failed — and the request it hands out
    // has to be one this server answers. It used to name POST /api/sessions/migrate-changes, which
    // has never been registered; tests/session-binding.test.ts now checks every route these
    // messages name against the live route table, so this only pins the one that matters here.
    expect(String(out['session']['note'])).toContain('POST /api/sessions/discover')
  })

  it('finds a session by both spellings at once while the log holds both', async () => {
    // The state during a migration: some rows carry the id, some still carry the name. A filter
    // that matched only one of them would answer "what did this session do" with half of it.
    const sessionId = await fileSession('mixed', 'mixed · run')
    await post('mixed', { kind: 'note', title: 'after filing', data: { body: 'x' } })
    // A row written straight into the log under the raw name, the way scripts/seed.ts does.
    h.db.client.sqlite
      .prepare('update changes set session_id = ? where record_id = ?')
      .run('mixed', sessionId)

    const out = body(await inject({ method: 'GET', url: '/api/changes?session=mixed' }))
    expect(out['session']['matchedValues']).toContain(sessionId)
    expect(out['session']['matchedValues']).toContain('mixed')
    expect(out['session']['storedByName']).toBeGreaterThan(0)
    expect(String(out['session']['note'])).toContain('still hold a name')
  })
})

// ============================================================ the two directions of the question

describe('a session says what it did, and a record says which session did it', () => {
  it('lists the records a session wrote and the ones it only touched', async () => {
    const gripper = await post('checkpoint3', { kind: 'module', title: 'Tray clamp', data: { parts: [] } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    // A record this session did NOT create, only changed.
    const other = h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'somebody else wrote this', actor: h.db.api.HUMAN })
    await inject({
      method: 'PATCH',
      url: `/api/records/${other.id}`,
      headers: AS('checkpoint3'),
      payload: { summary: 'the agent added a line' },
    })

    const out = body(await inject({ method: 'GET', url: `/api/sessions/${sessionId}` }))
    const work = out['work']
    expect(work['ref']['recordId']).toBe(sessionId)
    expect(work['wrote'].map((r: { id: string }) => r.id)).toContain(gripper)
    expect(work['touched'].map((r: { id: string }) => r.id)).toEqual([other.id])
    expect(work['counts']['storedByName']).toBe(0)
    expect(work['changes'].length).toBe(work['counts']['changes'])
  })

  it('says nothing rather than "it did nothing" for a session with no record', async () => {
    // There is no session record here at all, so there is no work to attribute — and an empty
    // list would be a claim about a session Mole Office has never filed.
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')
    const out = body(await inject({ method: 'GET', url: `/api/sessions/${sessionId}` }))
    expect(out['work']).not.toBeNull()

    const missing = await inject({ method: 'GET', url: '/api/sessions/claude-code:nothing-here' })
    expect(missing.statusCode).toBe(404)
  })

  it('answers "which session did this" from the record end', async () => {
    const gripper = await post('checkpoint3', { kind: 'module', title: 'Tray clamp', data: { parts: [] } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')

    const out = body(await inject({ method: 'GET', url: `/api/changes?recordId=${gripper}` }))
    const session = one(out['sessions'] as { recordId: string; title: string; unresolved: boolean }[], 'session')
    expect(session.recordId).toBe(sessionId)
    expect(session.title).toBe('checkpoint3 · audit run')
    expect(session.unresolved).toBe(false)
  })

  it('leaves a record written by hand with no session at all, rather than an unresolved one', async () => {
    const note = h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: `typed by ${THE_TEST_OFFICES_OWNER.id}`, actor: h.db.api.HUMAN })
    const out = body(await inject({ method: 'GET', url: `/api/changes?recordId=${note.id}` }))
    expect(out['sessions']).toEqual([])
  })
})

// ============================================================ migrating what is already stored

describe('the rows that are already in the log', () => {
  /** A run that wrote under a name, whose session record was filed by something else entirely. */
  async function legacyRun(name: string, title: string): Promise<string> {
    await post(name, { kind: 'note', title: `${name} finding`, data: { body: 'x' } })
    // Filed with no session header at all, so nothing binds the name — this is the seeded and
    // hand-written case, where the record and the rows have never met.
    const res = await inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'session', title, data: { state: 'finished' } },
    })
    return String(body(res)['record'].id)
  }

  it('resolves a name that is the first segment of a session title, and says so', async () => {
    const sessionId = await legacyRun('baseline', 'baseline · transplant replay sweep')
    expect(storedRefs()['baseline']).toBe(1)

    const out = body(await inject({ method: 'POST', url: '/api/sessions/discover', payload: {} }))
    const migrated = one(
      (out['changeLog']['migrated'] as { name: string; recordId: string; matchedBy: string; rows: number }[]).filter(
        (m) => m.name === 'baseline',
      ),
      'migration',
    )
    expect(migrated.recordId).toBe(sessionId)
    expect(migrated.matchedBy).toBe('titlePrefix')
    expect(out['changeLog']['applied']).toBe(true)
    expect(out['changeLog']['rowsRepointed']).toBeGreaterThan(0)

    expect(storedRefs()['baseline']).toBeUndefined()
    expect(storedRefs()[sessionId]).toBeGreaterThan(0)
  })

  it('works out the whole migration and writes none of it when asked for a dry run', async () => {
    await legacyRun('baseline', 'baseline · transplant replay sweep')

    const out = body(
      await inject({ method: 'POST', url: '/api/sessions/discover', payload: { dryRun: true } }),
    )
    expect(out['changeLog']['applied']).toBe(false)
    expect(out['changeLog']['rowsRepointed']).toBeGreaterThan(0)
    expect(String(out['changeLog']['note'])).toContain('dry run')

    // The point of a dry run: nothing moved.
    expect(storedRefs()['baseline']).toBe(1)

    // AND THE SWEEP HALF WROTE NOTHING EITHER (problem kDKj9iXd4Vft). `dryRun` used to hold back only
    // the change-log migration, and the sweep still filed session records: on a machine with
    // transcripts on it, one dry run filed dozens into the caller's project. A dry run now writes
    // nothing at all, and the reply says so where it begins.
    expect(out['report']['dryRun']).toBe(true)
    expect(out['report']['created']).toBe(0)
    expect(String(out['note'])).toContain('A dry run: nothing was written.')
  })

  it('names what it cannot resolve instead of leaving it dangling and quiet', async () => {
    await post('seed-2026-07-30', { kind: 'note', title: 'written by a script', data: { body: 'x' } })

    const out = body(await inject({ method: 'POST', url: '/api/sessions/discover', payload: {} }))
    const dangling = one(
      out['changeLog']['dangling'] as { name: string; rows: number; why: string }[],
      'dangling name',
    )
    expect(dangling.name).toBe('seed-2026-07-30')
    expect(dangling.rows).toBe(1)
    expect(dangling.why).toContain('no session record')
    // Not rewritten, not dropped: the name is the only thing known about who wrote that row.
    expect(storedRefs()['seed-2026-07-30']).toBe(1)
  })

  it('refuses an ambiguous name and offers the candidates rather than tossing a coin', async () => {
    await post('dup', { kind: 'note', title: 'ambiguous work', data: { body: 'x' } })
    h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'dup · one', data: { state: 'finished' }, actor: h.db.api.HUMAN })
    h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'dup · two', data: { state: 'finished' }, actor: h.db.api.HUMAN })

    const out = body(await inject({ method: 'POST', url: '/api/sessions/discover', payload: {} }))
    const dangling = one(out['changeLog']['dangling'] as { name: string; candidates: unknown[] }[], 'dangling name')
    expect(dangling.name).toBe('dup')
    expect(dangling.candidates).toHaveLength(2)
    expect(storedRefs()['dup']).toBe(1)
  })

  it('is idempotent: a second sweep finds nothing left to move', async () => {
    await legacyRun('baseline', 'baseline · transplant replay sweep')
    await inject({ method: 'POST', url: '/api/sessions/discover', payload: {} })

    const second = body(await inject({ method: 'POST', url: '/api/sessions/discover', payload: {} }))
    expect(second['changeLog']['migrated']).toEqual([])
    expect(second['changeLog']['rowsRepointed']).toBe(0)
    expect(second['changeLog']['dangling']).toEqual([])
  })
})

// ============================================================ what must never happen

describe('the boundaries, which are the point', () => {
  it('never invents a session record for a name nobody has filed', async () => {
    await post('a-typo-in-my-header', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    expect(h.db.api.listRecords({ workspaceId: WORKSPACE, kind: 'session' })).toEqual([])
    expect(storedRefs()['a-typo-in-my-header']).toBe(1)
  })

  it('does not let one run take a name another session already answers to', async () => {
    const first = await fileSession('run1', 'run1 · monday')
    const second = await post('run1', { kind: 'session', title: 'run1 · tuesday', data: { state: 'running' } })

    // The name still means the first session, and the second session's rows are attributed to the
    // session the caller SAID it was — which is the first one.
    expect(h.db.api.resolveSessionRef('run1', WORKSPACE).recordId).toBe(first)
    expect(h.db.api.sessionNamesOf(second)).toEqual([])
    expect(one(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: second }), 'create row').sessionId).toBe(first)

    // And asking for it by hand is refused in words rather than by silently moving history.
    const attempt = h.db.api.bindSessionName(second, 'run1', h.db.api.HUMAN)
    expect(attempt.alreadyBoundTo).toBe(first)
    expect(attempt.repointed).toBe(0)
    expect(attempt.note).toContain('already belongs to')
  })

  it('does not hand the caller\'s run name to a session filed on somebody else\'s behalf', async () => {
    // This is the flag lib/sessions.ts passes when discovery files a transcript it found on disk.
    // Without it, a sweep run under a name would file that whole run's history under a stranger.
    const created = h.db.api.createRecordWithReport({ workspaceId: WORKSPACE,
      kind: 'session',
      title: 'somebody else · found on disk',
      data: { state: 'running' },
      actor: { type: 'agent', id: 'claude-code', sessionId: 'checkpoint3' },
      bindCallerSession: false,
    })
    expect(created.sessionBinding).toBeUndefined()
    expect(h.db.api.resolveSessionRef('checkpoint3', WORKSPACE).matchedBy).toBe('unresolved')
    expect(h.db.api.sessionNamesOf(created.record.id)).toEqual([])
  })

  it('does not guess on the write path what only a person should approve', async () => {
    // "baseline" is the first segment of a session's title, which the MIGRATION will match — and
    // which the write path deliberately will not, because nobody is watching it happen.
    h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'session',
      title: 'baseline · transplant replay sweep',
      data: { state: 'running' },
      actor: h.db.api.HUMAN,
    })
    await post('baseline', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    expect(storedRefs()['baseline']).toBe(1)
  })

  it('does not report a title match as a name binding, however many times it is asked', () => {
    // Two different facts: "a session happens to be titled that" and "a session answers to that
    // name". Only the second survives a rename, so a reader deciding whether the link is durable
    // has to be told which one they have — including on the second call, from the cache.
    const id = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'session',
      title: 'exactly-this',
      data: { state: 'running' },
      actor: h.db.api.HUMAN,
    }).id

    expect(h.db.api.resolveSessionRef('exactly-this', WORKSPACE).matchedBy).toBe('title')
    expect(h.db.api.resolveSessionRef('exactly-this', WORKSPACE).matchedBy).toBe('title')
    expect(h.db.api.sessionNamesOf(id)).toEqual([])

    h.db.api.bindSessionName(id, 'exactly-this', h.db.api.HUMAN)
    expect(h.db.api.resolveSessionRef('exactly-this', WORKSPACE).matchedBy).toBe('name')
  })

  it('refuses to make a record that is not a session answer to a run name', async () => {
    const note = h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'not a session', actor: h.db.api.HUMAN })
    expect(() => h.db.api.bindSessionName(note.id, 'checkpoint3', h.db.api.HUMAN)).toThrow(/not a session/)

    const ref = h.db.api.resolveSessionRef(note.id, WORKSPACE)
    expect(ref.matchedBy).toBe('unresolved')
    expect(ref.why).toContain('not a session')
  })

  it('keeps a deleted session as the owner of what it did', async () => {
    await post('checkpoint3', { kind: 'note', title: 'a finding', data: { body: 'x' } })
    const sessionId = await fileSession('checkpoint3', 'checkpoint3 · audit run')
    h.db.api.deleteRecord(sessionId, h.db.api.HUMAN)

    const ref = h.db.api.resolveSessionRef('checkpoint3', WORKSPACE)
    expect(ref.recordId).toBe(sessionId)
    expect(ref.deleted).toBe(true)
    const work = h.sessions.sessionWork(sessionId, WORKSPACE)
    expect(work.counts.changes).toBeGreaterThan(0)
  })
})

// ============================================================ a run name that is not ASCII

/**
 * A CHINESE RUN NAME, END TO END.
 *
 * HTTP header values arrive as bytes and Node decodes every one of them as latin-1. So
 * `x-mole-office-session: 夹具标定-run` reached the change log as mojibake, and every consequence
 * followed from that one byte-level fact: filing the session bound the MANGLED name, the binding
 * note printed the mangled name back at the agent, POST /api/sessions/discover listed the row
 * under `dangling` where no title will ever match it, and asking
 * `GET /api/changes?session=夹具标定-run` — the same name the agent had used — answered
 * "nothing is filed as that" with zero rows, about the agent's own work.
 *
 * Nothing about it looked wrong from the inside: the record's title was fine, because a JSON body
 * is UTF-8. Only the attribution was wrong, and attribution is the one thing this table is for.
 * This repository already carries Chinese titles, so it was never hypothetical.
 */
describe('a run name with non-ASCII characters in it', () => {
  const RUN = '夹具标定-run'

  /**
   * The header value EXACTLY as Node hands it over on a real request.
   *
   * `app.inject` passes header strings straight through, so it cannot reproduce the defect on its
   * own — the bytes never touch a socket. This is the one line that does: it is what
   * `req.headers[…]` holds after Node has read UTF-8 bytes off the wire and decoded them as
   * latin-1, which is the whole of the bug.
   */
  const overTheWire = (s: string) => Buffer.from(s, 'utf8').toString('latin1')

  it('survives Node reading the header bytes as latin-1', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...AS(overTheWire(RUN)), 'x-mole-office-actor-id': overTheWire('夹爪-agent') },
      payload: { kind: 'note', title: 'filed over a real socket', data: { body: 'x' } },
    })
    expect(res.statusCode, res.body).toBe(201)
    const row = one(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: String(body(res)['record'].id) }), 'change row')
    expect(row.sessionId).toBe(RUN)
    expect(row.actorId).toBe('夹爪-agent')
  })

  it('leaves a value already decoded alone, which is how it arrives in-process', async () => {
    // "夹爪-agent" is above U+00FF, so it cannot be a latin-1 reading of anything. Its low bytes
    // are plain ASCII, so a naive re-decode round-trips cleanly and silently gives "9*-agent".
    await post(RUN, { kind: 'note', title: 'filed in process', data: { body: 'x' } })
    expect(Object.keys(storedRefs())).toContain(RUN)
  })

  it('is stored as it was written, not as latin-1 bytes', async () => {
    await post(RUN, { kind: 'note', title: 'a finding written under a Chinese run name', data: { body: 'x' } })
    expect(Object.keys(storedRefs())).toContain(RUN)
  })

  it('attributes the actor by the name it sent', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...AS(RUN), 'x-mole-office-actor-id': '夹爪-agent' },
      payload: { kind: 'note', title: 'written by an agent with a Chinese name', data: { body: 'x' } },
    })
    expect(res.statusCode, res.body).toBe(201)
    const row = one(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: String(body(res)['record'].id) }), 'change row')
    expect(row.actorId).toBe('夹爪-agent')
  })

  it('binds when the session is filed, and is findable by the name the agent used', async () => {
    await post(RUN, { kind: 'note', title: 'work filed before the session was', data: { body: 'x' } })
    const sessionId = await fileSession(RUN, '夹具标定 · calibration run')

    const url = `/api/changes?session=${encodeURIComponent(RUN)}`
    const out = body(await inject({ method: 'GET', url }))
    expect(out['session']['matchedBy']).toBe('name')
    expect(out['session']['recordId']).toBe(sessionId)
    expect(out['changes'].length).toBeGreaterThan(0)
  })

  it('leaves nothing dangling for the migration to give up on', async () => {
    await post(RUN, { kind: 'note', title: 'work filed before the session was', data: { body: 'x' } })
    await fileSession(RUN, '夹具标定 · calibration run')

    const out = body(
      await inject({ method: 'POST', url: '/api/sessions/discover', headers: AS(RUN), payload: {} }),
    )
    expect(out['changeLog']['dangling']).toEqual([])
  })
})
