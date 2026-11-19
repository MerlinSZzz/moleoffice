// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RUN, READ BACK AS A TIMELINE: GET /api/sessions/:id/timeline.
 *
 * The rule, in design/REVIEW-2026-09-07.md: the office itself records every flow operation, an agent run from start to
 * end, which door it touched when, roles and tasks strung into one timeline. The rows are
 * already there — `api_calls` writes one per request and `changes` one per record change — so what this file proves is
 * the READING: the calls come back in time order carrying what each was, the polls fold into one line, and the run is
 * named as its own record names it.
 *
 * THE MUTATION THAT MAKES THE FOLD REAL, and the one this file is held to: make the folding code
 * stop folding, and the burst reads back as one entry per poll and this file goes red. A test that
 * would pass with the folding deleted is not a test.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { apiApp, at, freshDb, one, type TestDb } from './helpers.ts'
import { apiCalls } from '../src/server/db/schema.ts'

const WORKSPACE = 'default'
const A_RUN = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'timeline-runner',
  'x-mole-office-purpose': 'module-work',
}
const PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** File a session record the way a starter does, and hand back its id. */
async function fileARun(title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: A_RUN,
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', model: 'opus', doing: 'the fixture run' },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { record } = res.json() as { record: { id: string } }
  return record.id
}

/** Every api_calls row carrying this run's id, oldest first. */
function rowsFor(run: string) {
  return t.client.db.select().from(apiCalls).where(eq(apiCalls.sessionId, run)).all()
}

describe('one run, rewound', () => {
  it('names the run as its record holds it and totals what is stored', async () => {
    const run = await fileARun('the fixture run')

    // A dozen calls the run really made, each one its own question.
    await app.inject({ method: 'GET', url: '/api/records', headers: { ...PERSON, 'x-mole-office-session': run } })
    await app.inject({ method: 'GET', url: '/api/usage/summary', headers: { ...PERSON } }) // writes no row: it is the telemetry read
    await app.inject({ method: 'GET', url: '/api/kinds/session', headers: { ...PERSON, 'x-mole-office-session': run } })
    await app.inject({ method: 'GET', url: '/api/nope', headers: { ...PERSON, 'x-mole-office-session': run } })
    await app.inject({ method: 'GET', url: '/api/records/does-not-exist', headers: { ...PERSON, 'x-mole-office-session': run } })
    const created = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...A_RUN, 'x-mole-office-session': run },
      payload: { kind: 'note', title: 'the note the run wrote' },
    })
    expect(created.statusCode).toBe(201)
    const noteId = (created.json() as { record: { id: string } }).record.id
    await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: { ...PERSON, 'x-mole-office-session': run } })
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: { ...A_RUN, 'x-mole-office-session': run },
      payload: { dataPatch: { doing: 'the run is merging' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    await app.inject({ method: 'GET', url: '/api/sessions', headers: { ...PERSON, 'x-mole-office-session': run } })
    await app.inject({
      method: 'POST',
      url: '/api/usage/outside-reads',
      headers: { ...A_RUN, 'x-mole-office-session': run },
      payload: { source: 'shell', what: 'git log -1', wanted: 'last commit', verdict: 'outside' },
    })

    const res = await app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: PERSON })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as {
      run: { recordId: string; title: string; runtime: string; model: string; state: string; started: string | null }
      entries: { type: string; operation: string | null; target: { id: string; kind: string; title: string | null } | null; status: number; count?: number }[]
      changes: { op: string; recordTitle: string | null }[]
      totals: { calls: number; folded: number; bytes: number; ms: number }
      note: string
    }

    expect(reply.run.recordId).toBe(run)
    expect(reply.run.title).toBe('the fixture run')
    expect(reply.run.runtime).toBe('claude-code')
    expect(reply.run.model).toBe('opus')

    // THE ROWS ARE THE STORED ROWS. The total is exactly the count a query holds, and no entry
    // invents a call that was not answered or hides one that was.
    expect(reply.totals.calls).toBe(rowsFor(run).length)

    // ONE UPLOAD, ONE REFUSAL, ONE CALL THAT MATCHED NO ROUTE — each carried whole, because none
    // of them is a poll.
    const refusal = reply.entries.find((e) => e.operation === 'record.read' && e.target?.id === 'does-not-exist')
    expect(refusal?.type).toBe('call')
    expect(refusal?.target?.kind).toBeNull()
    expect(reply.entries.find((e) => e.type === 'call' && e.operation === null)).toBeDefined()
    const outside = reply.entries.find((e) => e.type === 'call' && e.operation === 'usage.report-outside')
    expect(outside).toBeDefined()

    // THE WRITES THE RUN MADE ARE IN THE CHANGE LOG WITH ITS ID, and the timeline carries them with
    // the record they changed.
    expect(reply.changes.length).toBeGreaterThanOrEqual(2)
    expect(one(reply.changes.filter((c) => c.recordTitle === 'the note the run wrote'), 'the note create').op).toBe('create')
  })

  it('folds a burst of identical polls into one entry with a count and a span', async () => {
    const run = await fileARun('the run that polls')

    // A burst of real polls of one operation, each answered, one after another with nothing between
    // them — the shape that gave the live office 1.15 million worker.held rows.
    for (let i = 0; i < 40; i += 1) {
      const poll = await app.inject({ method: 'GET', url: '/api/resources', headers: { ...A_RUN, 'x-mole-office-session': run } })
      expect(poll.statusCode).toBe(200)
    }

    const res = await app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: PERSON })
    expect(res.statusCode).toBe(200)
    const reply = res.json() as {
      entries: { type: string; operation?: string; count?: number; first?: string; last?: string }[]
      totals: { calls: number; folded: number }
    }
    expect(reply.entries.length).toBe(1)
    const fold = at(reply.entries, 0, 'the folded poll line')
    expect(fold.type).toBe('folded')
    expect(fold.operation).toBe('runtime.resources')
    expect(fold.count).toBe(40)
    expect(reply.totals.calls).toBe(40)
    expect(reply.totals.folded).toBe(40)
    expect(reply.totals.calls).toBe(rowsFor(run).length)
  })

  it('breaks a fold at anything that happened between two polls, and carries that thing whole', async () => {
    const run = await fileARun('the run interrupted')

    // Eight polls, one different question, thirty-two more polls. The different question is a
    // refused call, the exact thing folding must not hide.
    for (let i = 0; i < 8; i += 1) {
      await app.inject({ method: 'GET', url: '/api/resources', headers: { ...A_RUN, 'x-mole-office-session': run } })
    }
    await app.inject({ method: 'GET', url: '/api/nope', headers: { ...A_RUN, 'x-mole-office-session': run } })
    for (let i = 0; i < 32; i += 1) {
      await app.inject({ method: 'GET', url: '/api/resources', headers: { ...A_RUN, 'x-mole-office-session': run } })
    }

    const res = await app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: PERSON })
    const reply = res.json() as { entries: { type: string; operation: string | null; count?: number }[] }
    expect(reply.entries.length).toBe(3)
    expect(at(reply.entries, 0, 'first burst').type).toBe('folded')
    expect(at(reply.entries, 0, 'first burst').count).toBe(8)
    const interruption = at(reply.entries, 1, 'the refused call between the bursts')
    expect(interruption.type).toBe('call')
    expect(interruption.operation).toBeNull()
    expect(at(reply.entries, 2, 'second burst').type).toBe('folded')
    expect(at(reply.entries, 2, 'second burst').count).toBe(32)
  })

  it('names the flow the starter wrote on the run, and null when nobody said', async () => {
    // THE FLOW IS WRITTEN ON THE FIELD THE KIND ALREADY HAS — the session record's summary, the
    // field discovery seeds once and never overwrites and GET /api/sessions serves as
    // `recordedPurpose`. No new field, because one fits already.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: A_RUN,
      payload: {
        kind: 'session',
        title: 'a merge run',
        summary: 'merge',
        data: { state: 'running', runtime: 'codex-cli' },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const run = (filed.json() as { record: { id: string } }).record.id
    await app.inject({ method: 'GET', url: '/api/resources', headers: { ...A_RUN, 'x-mole-office-session': run } })

    const res = await app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: PERSON })
    expect(res.statusCode).toBe(200)
    const reply = res.json() as { run: { flow: string | null } }
    expect(reply.run.flow).toBe('merge')

    // AND THE LIST RETURNS IT TOO, under the name the kind gives that field.
    const listed = await app.inject({ method: 'GET', url: '/api/sessions', headers: PERSON })
    expect(listed.statusCode).toBe(200)
    const row = (listed.json() as { sessions: { recordId: string | null; recordedPurpose: string | null }[] })
      .sessions.find((s) => s.recordId === run)
    expect(row?.recordedPurpose).toBe('merge')

    const bare = await fileARun('the run nobody named a flow for')
    const bareGet = await app.inject({ method: 'GET', url: `/api/sessions/${bare}/timeline`, headers: PERSON })
    expect(((bareGet.json() as { run: { flow: string | null } }).run).flow).toBeNull()
  })

  it('refuses an id nothing in this project answers, in the same words as the session door', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/not-a-session/timeline', headers: PERSON })
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('not-a-session')
    expect(res.body).toContain('no session record anywhere has the id')
  })

  it('proves the fold by rows, not only by entries', async () => {
    const run = await fileARun('the run the totals watch')
    for (let i = 0; i < 12; i += 1) {
      await app.inject({ method: 'GET', url: '/api/resources', headers: { ...A_RUN, 'x-mole-office-session': run } })
    }
    const stored = t.client.db
      .select({ total: sql<number>`sum(${apiCalls.ms})`, bytes: sql<number>`sum(${apiCalls.bytes})` })
      .from(apiCalls)
      .where(eq(apiCalls.sessionId, run))
      .get()
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${run}/timeline`, headers: PERSON })
    const reply = res.json() as { totals: { calls: number; folded: number; bytes: number; ms: number }; entries: { type: string; count?: number; ms?: number }[] }
    expect(reply.totals.calls).toBe(12)
    expect(reply.totals.folded).toBe(12)
    // THE FOLD HIDES NO ARITHMETIC. The one entry carries the bytes of every poll it stands for.
    const fold = at(reply.entries, 0, 'the folded line')
    expect(fold.type).toBe('folded')
    expect(fold.count).toBe(12)
    expect(reply.totals.bytes).toBe(Math.trunc(Number(stored?.bytes ?? 0)))
  })
})
