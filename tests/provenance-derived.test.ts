// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PROVENANCE REACHES THE ROWS A READER MEETS FIRST — checked against the SERVED BYTES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT A TYPE TEST, AND WHY IT IS THE ONLY THING THAT WOULD HAVE CAUGHT THIS
 * ---------------------------------------------------------------------------------------
 *
 * `PanelRecord.origin` is OPTIONAL. So a function that builds a projection of a record and forgets
 * to carry the mark compiles, passes every existing test, and serves a row with no provenance on it.
 * That is not hypothetical: `toRecord` declared the field for a whole wave and never filled it, so
 * 290 `fixture` stamps sat in the database and appeared in no API reply at all, and nothing failed.
 *
 * What it cost, measured on the corpus on 2026-08-12. `origin` was on every record and on none of
 * the derived rows: an attention row had 14 keys and `origin` was not one, a session row had none,
 * a link's neighbour carried id, kind, title and summary and no mark. In `robotics`, where 187 of
 * 187 records are fixture, the top visible attention row reads *"The arm keeps moving after the stop
 * button is pressed, and somebody stands next to it during transplant trials."* An agent that trusts
 * the screen it was pointed at escalates a fabricated safety incident.
 *
 * So this test asks the server for the rows and reads the JSON. A sixth builder written next month
 * is covered without this file being edited, because the assertion is over what came back rather
 * than over a list of shapes somebody remembered to name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * NOT a filter. Nothing here excludes fixture rows from anything, and `design/DECISIONS-PENDING.md`
 * §20 rules that a surface which silently filters on `origin` is out under every option. Marking a
 * row and dropping it are different acts; this is the first.
 *
 * NOT an inference. `origin` is never guessed from content: null means nobody recorded it, and the
 * rows below are allowed to carry null. What they are not allowed to do is omit the key, because an
 * absent key and a recorded absence read the same to a caller and mean opposite things.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const h = await freshApp()
  t = h.db
  app = h.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** The parsed body of a GET, insisted upon as an object. */
async function get(url: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url })
  expect(res.statusCode, `${url} → ${res.body.slice(0, 200)}`).toBe(200)
  return JSON.parse(res.body) as Record<string, unknown>
}

/**
 * THE WHOLE LIST, WHERE THIS FILE READS ONE. `GET /api/records` and `GET /api/attention` answer
 * narrow when no shape is named, and this file reads `origin` and `score`
 * off their rows, so it asks for the whole answer.
 */
function theFullListDoor(url: string): string {
  if (url === '/api/records') return '/api/records?shape=full'
  if (url === '/api/attention') return '/api/attention?shape=full'
  return url
}

/**
 * Every object anywhere in a reply that names a record, paired with the path it was found at.
 *
 * A ROW NAMES A RECORD WHEN IT CARRIES `recordId`, or when it carries `id` beside `kind` and
 * `title` — which is what a link's `other` and a records-list row look like. That second rule is
 * what makes this find shapes nobody listed here.
 */
function rowsNamingRecords(value: unknown, path = ''): { path: string; row: Record<string, unknown> }[] {
  const found: { path: string; row: Record<string, unknown> }[] = []
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...rowsNamingRecords(v, `${path}[${i}]`)))
    return found
  }
  if (typeof value !== 'object' || value === null) return found
  const row = value as Record<string, unknown>
  const namesByRecordId = typeof row['recordId'] === 'string'
  const namesByIdKindTitle =
    typeof row['id'] === 'string' && typeof row['kind'] === 'string' && typeof row['title'] === 'string'
  if (namesByRecordId || namesByIdKindTitle) found.push({ path: path === '' ? '(root)' : path, row })
  for (const [key, v] of Object.entries(row)) found.push(...rowsNamingRecords(v, `${path}.${key}`))
  return found
}

/** A small corpus with both marks in it, so a reply that carries neither would be vacuous. */
function seedBoth(): { authored: string; fixture: string } {
  const authored = t.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: 'A defect somebody really found',
    summary: 'Filed as a record of real work.',
    data: {
      state: 'open',
      symptom: 'The rig keeps moving after the stop button is pressed.',
      consequence: { bearer: 'person', what: 'Somebody stands next to it during transplant trials.' },
    },
    actor: AGENT,
  })
  // `origin: 'fixture'` is reachable in-process only — a request arriving over HTTP with an actor on
  // it is authored by definition — which is why this test writes it here rather than posting it.
  const fixture = t.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: 'A defect the fixture generator wrote',
    summary: 'Furniture, so a layout had something to draw.',
    data: {
      state: 'open',
      symptom: 'The rig keeps moving after the stop button is pressed.',
      consequence: { bearer: 'person', what: 'Somebody stands next to it during transplant trials.' },
    },
    actor: AGENT,
    origin: 'fixture',
  })
  t.api.createLink({ fromId: authored.id, toId: fixture.id, type: 'relates_to', actor: AGENT })
  return { authored: authored.id, fixture: fixture.id }
}

// THESE CASES HAVE A LIMIT OF THEIR OWN, because the usual 5 seconds is too close. Run alone on
// 3 November 2026, at a load of 7 on 20 cores, each case took at most 1.3 seconds, and 1.2 of them was
// its read of /api/attention, which starts the attention thread for the fresh office. At a load of
// 44 to 59, the first two cases went past 5 seconds.
describe('every derived row that names a record says how that record got here', { timeout: 30_000 }, () => {
  it('carries the key on every such row of /api/attention, /api/records/:id and /api/sessions', async () => {
    const { authored } = seedBoth()

    const missing: string[] = []
    let checked = 0
    for (const url of ['/api/attention', `/api/records/${authored}`, '/api/sessions', '/api/records', '/api/anchor']) {
      const body = await get(theFullListDoor(url))
      for (const { path, row } of rowsNamingRecords(body)) {
        checked++
        // PRESENT is the assertion, not truthy. `null` is a real answer — nobody recorded how this
        // one got here — and an absent key is a different fact that reads identically to a caller.
        if (!('origin' in row)) missing.push(`${url} ${path}`)
      }
    }

    expect(
      missing,
      'these rows name a record and do not say how it entered the corpus. A reader that trusts the ' +
        'screen it was pointed at cannot tell a generated safety incident from a real one, and ' +
        '`PanelRecord.origin` is optional so nothing else would have caught it.',
    ).toEqual([])
    // The walk found something. An empty corpus would make every assertion above vacuous.
    expect(checked).toBeGreaterThan(3)
  })

  it('reports the two marks as they are stored, on the derived rows and not only on the record', async () => {
    const { authored, fixture } = seedBoth()

    const attention = await get('/api/attention?shape=full')
    const rows = rowsNamingRecords(attention).filter((r) => typeof r.row['score'] === 'number')
    const byId = new Map(rows.map((r) => [String(r.row['recordId']), r.row['origin']]))
    // Both records are open problems with a person-bearing consequence, so both are ranked — and
    // one of them is furniture. This is the `robotics` case in miniature.
    expect(byId.get(authored)).toBe('authored')
    expect(byId.get(fixture)).toBe('fixture')

    // And on a link's neighbour, which is the other row a reader meets before the record.
    const record = await get(`/api/records/${authored}`)
    const links = record['links'] as { other: Record<string, unknown> }[]
    expect(links).toHaveLength(1)
    expect(links[0]?.other['id']).toBe(fixture)
    expect(links[0]?.other['origin']).toBe('fixture')
  })

  it('says what the RECORD says, not merely something — a wrong mark is worse than none', async () => {
    // THE HALF THE KEY-PRESENCE CHECK CANNOT SEE, and it caught a real one. `readingSinceAnchor`
    // widened its rows through the path that takes `origin: null` by default, so the first panel on
    // Home said "nobody recorded how this got here" about a record filed a second earlier and
    // stamped `authored`. The mark reached the row and was wrong, which is worse than not reaching
    // it. Found by driving the anchor cycle end to end on 2026-08-12, not by a test.
    const { authored, fixture } = seedBoth()
    const truth = new Map([
      [authored, 'authored'],
      [fixture, 'fixture'],
    ])

    // Mark a reading point, then write, so the anchor reply has rows in it.
    await app.inject({ method: 'PUT', url: '/api/anchor', payload: {} })
    t.api.patchRecord(authored, { dataPatch: { state: 'fixed' } }, AGENT)

    const wrong: string[] = []
    for (const url of ['/api/attention', `/api/records/${authored}`, '/api/records', '/api/anchor']) {
      const body = await get(theFullListDoor(url))
      for (const { path, row } of rowsNamingRecords(body)) {
        const expected = truth.get(String(row['recordId'] ?? row['id']))
        if (expected === undefined) continue
        if (row['origin'] !== expected) wrong.push(`${url} ${path}: ${String(row['origin'])} ≠ ${expected}`)
      }
    }
    expect(wrong, 'these rows carry a provenance that disagrees with the record they name').toEqual([])
  })

  it('says nothing about a run that has no record, rather than saying nobody stamped it', async () => {
    // A session row is the one shape where null means two things, and `recordId` is what tells them
    // apart. Reporting "nobody recorded how this got here" about a run that HAS no record would be
    // a statement about a row that does not exist — 35 of 58 rows in `panelx` are exactly this.
    const filed = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run somebody filed',
      data: { state: 'finished' },
      actor: AGENT,
    })

    const body = await get('/api/sessions')
    const sessions = body['sessions'] as Record<string, unknown>[]
    for (const row of sessions) {
      expect(row).toHaveProperty('origin')
      if (row['recordId'] === null) {
        expect(row['origin'], 'a run with no record cannot have a recorded provenance').toBeNull()
      }
    }
    const mine = sessions.find((row) => row['recordId'] === filed.id)
    expect(mine?.['origin']).toBe('authored')
  })
})
