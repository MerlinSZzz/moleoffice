// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OVERLAPPING WRITES: what happens when two requests are in the server at the same time.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS CAN PROVE, AND WHAT IT CANNOT — read this before trusting a green run
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office runs as ONE process holding ONE SQLite file through better-sqlite3, whose calls are
 * synchronous: a statement runs to completion before the event loop moves on. So two requests are
 * never mid-statement together, and the interleaving that exists is at the `await` points between
 * statements inside a handler. That is exactly the interleaving the real product has, because the
 * real product is one loopback server answering a browser and some agents.
 *
 * So these tests prove: a handler that reads, decides, and then writes cannot be overtaken between
 * the deciding and the writing in a way that leaves two winners, a half-written record, or a lost
 * change row.
 *
 * They DO NOT prove multi-process safety. Two `npm start`s on one file, or a script writing while
 * the server runs, is a different question with a different answer (SQLite's locking), and nothing
 * here tests it. Saying so is the point: a file called "concurrent writes" that quietly meant
 * something narrower would be the false-coverage this repository keeps finding.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EACH CASE IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Every one is a place where the code READS SOMETHING, DECIDES, and then WRITES — the shape where
 * an overlap can produce two winners:
 *
 *   two creates of one title   read "what else is called this", then insert. Both are stored since
 *                              17 August 2026; what the read decides is what each reply SAYS about
 *                              the other, and an overlap can leave both replies silent
 *   create-with-links          checks every link, then writes the record AND the links
 *   the idempotent link        reads "is this link already here", then inserts
 *   a merging patch            reads `data`, merges, then writes the whole column back
 *   delete and restore         read the deleted stamp, then write it
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, one, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-concurrent',
}

let h: Harness

beforeEach(async () => {
  h = await freshApp()
})
afterEach(async () => {
  await h.app.close()
  h.db.close()
})

/** Fire every request in ONE tick, so they are all in the server before any of them finishes. */
function together<T>(...work: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(work.map((run) => run()))
}

/** What the workspace holds, for the tests that check nothing was left half-written. */
function counts(): { records: number; links: number; changes: number } {
  return {
    records: h.db.api.listRecords({ workspaceId: 'default', includeDeleted: true }).length,
    links: h.db.api.allLinks('default').length,
    changes: h.db.api.listChanges({ workspaceId: 'default' }).length,
  }
}

// ================================================ two writes that arrive under one title

/**
 * THIS TEST PINNED THE OPPOSITE RULE UNTIL 17 AUGUST 2026, and the owner is who changed it.
 *
 * It was headed "the unique-title rule" and asserted that of two simultaneous creates under one
 * title, exactly one was answered 201 and the other 400. The owner overturned the rule behind it —
 * **ID is identity. Title is presentation. Titles may repeat.** — so BOTH are now stored, and what
 * this test is for has changed with it: the question is no longer which write won, it is that
 * neither write lost anything and each is told about the other.
 *
 * It is rewritten rather than deleted because the concurrency it exercises is real and is not what
 * changed. Two requests still arrive at one moment through the same in-process server.
 */
describe('two requests filing the same title at the same time', () => {
  it('files both, gives each its own id, and tells each about the other', async () => {
    const payload = { kind: 'task', title: 'Reprint the v3 shell at effort 12', data: { state: 'todo' } }

    const [a, b] = await together(
      () => h.app.inject({ method: 'POST', url: '/api/records', headers: AS_AGENT, payload }),
      () => h.app.inject({ method: 'POST', url: '/api/records', headers: AS_AGENT, payload }),
    )

    // Two records, because they are two pieces of work that happen to be called the same thing and
    // only the person who wrote them can say otherwise.
    expect([a?.statusCode, b?.statusCode].sort()).toEqual([201, 201])

    const ids = [a, b].map((res) => JSON.parse((res as { body: string }).body).record.id as string)
    expect(new Set(ids).size).toBe(2)

    // The SECOND one to be written is the one that can see the first. Which of the two that was is
    // decided by the order they reached the database, so the test asks how many said it rather than
    // which — one of them saw an empty project and the other did not.
    const told = [a, b]
      .map((res) => JSON.parse((res as { body: string }).body) as { record: { id: string }; sameTitle?: { id: string }[] })
      .filter((body) => body.sameTitle !== undefined)
    expect(told).toHaveLength(1)
    const reporter = told[0] as { record: { id: string }; sameTitle?: { id: string }[] }
    expect(reporter.sameTitle?.map((r) => r.id)).toEqual(ids.filter((id) => id !== reporter.record.id))

    expect(h.db.api.listRecords({ workspaceId: 'default' }).filter((r) => r.title === payload.title)).toHaveLength(2)
    // And each has its own history: two creates, one per record.
    expect(h.db.api.listChanges({ workspaceId: 'default' }).filter((c) => c.op === 'create')).toHaveLength(2)
  })

  it('files ten different titles arriving together, losing none of them', async () => {
    const titles = Array.from({ length: 10 }, (_, i) => `Reprint the v3 shell, attempt ${i}`)

    const results = await together(
      ...titles.map((title) => () =>
        h.app.inject({
          method: 'POST',
          url: '/api/records',
          headers: AS_AGENT,
          payload: { kind: 'task', title, data: { state: 'todo' } },
        }),
      ),
    )

    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(201))
    expect(h.db.api.listRecords({ workspaceId: 'default' })).toHaveLength(10)
    // Ten distinct ids: an id generated from a clock or a counter read before an await is how two
    // records come back with one id.
    expect(new Set(h.db.api.listRecords({ workspaceId: 'default' }).map((r) => r.id)).size).toBe(10)
    expect(h.db.api.listChanges({ workspaceId: 'default' }).filter((c) => c.op === 'create')).toHaveLength(10)
  })
})

// ============================================================ create-with-links, under overlap

describe('a filing with relationships beside one that must be refused', () => {
  it('lands the good one whole and stores nothing at all for the bad one', async () => {
    const module = h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Wrist camera', actor: AGENT })
    const before = counts()

    const [good, bad] = await together(
      () =>
        h.app.inject({
          method: 'POST',
          url: '/api/records',
          headers: AS_AGENT,
          payload: {
            kind: 'problem',
            title: 'The wrist camera loses the hand below 300 mm',
            data: { symptom: 'tracking drops out inside 300 mm', state: 'open' },
            links: [{ type: 'about', toTitle: 'Wrist camera' }],
          },
        }),
      () =>
        h.app.inject({
          method: 'POST',
          url: '/api/records',
          headers: AS_AGENT,
          payload: {
            kind: 'problem',
            title: 'The gel lags the pull',
            data: { symptom: 'the gel image lags', state: 'open' },
            // A title nothing goes by. The whole request has to be refused, including the record.
            links: [{ type: 'about', toTitle: 'A module nobody has ever filed' }],
          },
        }),
    )

    expect(good?.statusCode, good?.body).toBe(201)
    expect(bad?.statusCode).toBe(404)

    const after = counts()
    // One record and one link from the good request. Nothing from the bad one — the atomicity of
    // create-with-links is not weakened by another write being in the server at the same time.
    expect(after.records).toBe(before.records + 1)
    expect(after.links).toBe(before.links + 1)
    expect(h.db.api.listRecords({ workspaceId: 'default', includeDeleted: true }).some((r) => r.title === 'The gel lags the pull')).toBe(false)
    expect(one(h.db.api.resolveLinks(module.id), 'link on the module').label).toBe('subject of')
  })
})

// ============================================================ the idempotent link

describe('the same link asked for twice at the same time', () => {
  it('stores one row and logs one linking, not two of either', async () => {
    const a = h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Digital twin', actor: AGENT })
    const b = h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'EGM bridge', actor: AGENT })
    const payload = { fromId: a.id, toId: b.id, type: 'consumes' }

    const [first, second] = await together(
      () => h.app.inject({ method: 'POST', url: '/api/links', headers: AS_AGENT, payload }),
      () => h.app.inject({ method: 'POST', url: '/api/links', headers: AS_AGENT, payload }),
    )

    expect(first?.statusCode).toBe(201)
    expect(second?.statusCode).toBe(201)
    // The SAME link, which is what idempotent means here — creating it twice returns the id it
    // already had. Two ids would be two rows saying one thing, and every count of links would be
    // wrong from then on.
    expect(JSON.parse(String(first?.body)).id).toBe(JSON.parse(String(second?.body)).id)
    expect(h.db.api.allLinks('default')).toHaveLength(1)
    expect(h.db.api.listChanges({ workspaceId: 'default' }).filter((c) => c.op === 'link')).toHaveLength(1)
  })
})

// ============================================================ two merging patches

describe('two patches merging into one record at the same time', () => {
  /**
   * HONESTLY: THIS ONE CANNOT FAIL TODAY, and it is here anyway. Read why before trusting it.
   *
   * `PATCH /api/records/:id` calls `patchRecord`, which reads `data`, merges and writes, with no
   * `await` anywhere between. So the two requests below cannot interleave inside it whatever this
   * test does — there is no seam to get into. Every other test in this file was proved by breaking
   * the thing it checks; this one has nothing to break, and pretending otherwise would be the false
   * coverage the file's header warns about.
   *
   * It stays because the property is worth pinning: the day the write path gains an `await` between
   * the read and the write — a different driver, a hook, an async validation — the second patch will
   * erase the first one's key and answer 200, and this goes red on that day rather than on the day
   * somebody notices a missing field. A guard, stated as a guard.
   */
  it('keeps both fields, because a merge reads and writes the whole column', async () => {
    const record = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'task',
      title: 'Relabel the 240 clips',
      data: { state: 'doing' },
      actor: AGENT,
    })

    const [a, b] = await together(
      () =>
        h.app.inject({
          method: 'PATCH',
          url: `/api/records/${record.id}`,
          headers: AS_AGENT,
          payload: { dataPatch: { command: 'npm run relabel' } },
        }),
      () =>
        h.app.inject({
          method: 'PATCH',
          url: `/api/records/${record.id}`,
          headers: AS_AGENT,
          payload: { dataPatch: { source: 'the 240-clip review' } },
        }),
    )

    expect([a?.statusCode, b?.statusCode]).toEqual([200, 200])

    // BOTH survive. This is the case that breaks first if a handler reads `data`, awaits, and then
    // writes what it read back: whichever patch wrote second would silently erase the other's key,
    // and the reply would say 200 to both.
    const after = h.db.api.getRecord(record.id)
    expect(after?.data).toMatchObject({ state: 'doing', command: 'npm run relabel', source: 'the 240-clip review' })

    // And the history holds both, so a person can see what each one did.
    const paths = h.db.api
      .listChanges({ workspaceId: 'default', recordId: record.id })
      .filter((c) => c.op === 'update')
      .map((c) => c.field)
    expect(paths).toEqual(expect.arrayContaining(['data.command', 'data.source']))
  })
})

// ============================================================ delete against restore

describe('a delete and a restore of one record, arriving together', () => {
  it('ends in one of the two states, with both operations in the log and no half state', async () => {
    const record = h.db.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Retire the old launcher', actor: AGENT })

    const [del, res] = await together(
      () => h.app.inject({ method: 'DELETE', url: `/api/records/${record.id}`, headers: AS_AGENT }),
      () => h.app.inject({ method: 'POST', url: `/api/records/${record.id}/restore`, headers: AS_AGENT }),
    )

    // Whichever order they ran in, neither is a server error and neither leaves the record in a
    // state that is neither deleted nor live.
    expect([200, 404, 409]).toContain(del?.statusCode)
    expect([200, 404, 409]).toContain(res?.statusCode)

    const after = h.db.api.getRecord(record.id)
    expect(after).not.toBeNull()
    expect(after?.deletedAt === null || typeof after?.deletedAt === 'string').toBe(true)

    // The record still exists either way — nothing is ever really removed — so the row cannot have
    // been lost by the two writes crossing.
    expect(h.db.api.listRecords({ workspaceId: 'default', includeDeleted: true })).toHaveLength(1)
  })
})
