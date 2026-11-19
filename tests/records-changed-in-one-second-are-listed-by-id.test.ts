// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RECORDS CHANGED IN THE SAME SECOND ARE LISTED BY THEIR ID, so GET /api/records gives one order every time it is
 * asked. Wave 13y round 35, item 9.15 (b).
 *
 * `updated_at` is kept to the second, and the seed writes most of its records within a second or two. The list was
 * ordered by `updated_at` alone, so the records of one second came in whatever order SQLite's sort left them in. On
 * the two seeds measured in round 35 that was the order they were stored in, which SQLite does not promise. The
 * review's pictures changed from one review to the next with that order (round 34's report, block "915").
 *
 * THE ID BREAKS THE TIE, A TO Z, as it already does when the door is asked for an order (`sortCatalogue` in
 * src/shared/catalogue.ts). So the list with no `sort` is the list sorted by `updated`, newest first. The readers that
 * say they give `listRecords`' order give this one, and so does a list read in pieces.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IDS_AT_ONCE } from '../src/server/db/in-pieces.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Row = { id: string; kind: string; updatedAt: string }

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']

beforeAll(async () => {
  t = await freshDb()
  // Importing the seed RUNS it, into the throwaway database `freshDb` pointed the connection at.
  await import('../scripts/seed.ts')
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function listed(query = ''): Promise<Row[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/records${query}` })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { records: Row[] }).records
}

/** Each pair of neighbours changed in the same second whose ids are not A to Z. */
function outOfOrder(rows: readonly Row[]): string[] {
  return rows.slice(1).flatMap((row, i) => {
    const before = rows[i]!
    return row.updatedAt === before.updatedAt && !(before.id < row.id) ? [`${before.id} before ${row.id}, both at ${row.updatedAt}`] : []
  })
}

const ids = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id)

describe('records changed in the same second', () => {
  it('the seed stores many of them in an order that is not the order of their ids, so this file can tell the two apart', () => {
    const rows = t.api.listRecords({ workspaceId: 'default' })
    const stored = new Map(
      (t.client.sqlite.prepare('SELECT id, rowid AS stored FROM records').all() as { id: string; stored: number }[]).map((row) => [row.id, row.stored]),
    )
    const seconds = new Map<string, typeof rows>()
    for (const row of rows) seconds.set(row.updatedAt, [...(seconds.get(row.updatedAt) ?? []), row])
    const largest = [...seconds.values()].sort((one, other) => other.length - one.length)[0]!
    expect(largest.length, 'the largest group of records changed in one second').toBeGreaterThanOrEqual(20)
    const byId = ids(largest).sort()
    const byStoring = [...largest].sort((one, other) => stored.get(one.id)! - stored.get(other.id)!).map((row) => row.id)
    expect(byStoring, 'stored first to last').not.toEqual(byId)
    expect([...byStoring].reverse(), 'stored last to first').not.toEqual(byId)
  })

  it('GET /api/records lists them by id, A to Z, for one kind, for a group of kinds, and for one project or every project asked by name', async () => {
    for (const query of ['', '?kind=session', '?family=work', '?projects=default', '?projects=all']) {
      const rows = await listed(query)
      expect(rows.length, `GET /api/records${query}`).toBeGreaterThan(20)
      expect(outOfOrder(rows), `GET /api/records${query}`).toEqual([])
    }
  })

  it('the list with no sort is the list sorted by updated, newest first, and asking twice gives the same order', async () => {
    const first = ids(await listed())
    expect(ids(await listed('?sort=updated&direction=desc'))).toEqual(first)
    expect(ids(await listed())).toEqual(first)
  })

  it("the readers that say they give listRecords' order give it, record for record", () => {
    const all = t.api.listRecords({ workspaceId: 'default' })
    const order = ids(all)
    expect(ids(t.api.listRecordsWithDataAs({ workspaceId: 'default' }, t.api.onlyTheseFieldsOf(['state']))), 'listRecordsWithDataAs').toEqual(order)
    expect(ids(t.api.listRecordNamesWithDataAs({ workspaceId: 'default' }, t.api.onlyTheseFieldsOf(['state']))), 'listRecordNamesWithDataAs').toEqual(order)
    // THE ATTENTION RULE'S READER MAY HOLD RECORDS THE LIST DOES NOT, so the two are compared over the records both hold.
    const attention = ids(t.api.listRecordsForTheAttentionRule('default'))
    const inBoth = new Set(attention.filter((id) => order.includes(id)))
    expect(inBoth.size, 'records both readers hold').toBeGreaterThan(20)
    expect(attention.filter((id) => inBoth.has(id)), 'listRecordsForTheAttentionRule').toEqual(order.filter((id) => inBoth.has(id)))
    const kinds = [...new Set(all.map((record) => record.kind))].filter((kind): kind is Exclude<typeof kind, 'message'> => kind !== 'message')
    expect(ids(t.api.liveRecordsOfKinds('default', kinds)), 'liveRecordsOfKinds').toEqual(ids(all.filter((record) => record.kind !== 'message')))
  })

  it("a record page's other records come in the order GET /api/records gives them, as its door says", async () => {
    const order = ids(await listed())
    let largest = 0
    for (const id of order) {
      const reply = await app.inject({ method: 'GET', url: `/api/records/${id}/around` })
      expect(reply.statusCode, reply.body).toBe(200)
      const around = ids((reply.json() as { records: Row[] }).records)
      const held = new Set(around)
      expect(around, `GET /api/records/${id}/around`).toEqual(order.filter((one) => held.has(one)))
      largest = Math.max(largest, around.length)
    }
    expect(largest, 'the most records one page reads').toBeGreaterThan(20)
  })

  it('a list read in pieces comes back in the order of one statement', () => {
    const order = ids(t.api.listRecords({ workspaceId: 'default' }))
    // EVERY RECORD, LAST FIRST, each followed by an id that names nothing, so the ids fill more than one piece and the
    // records of one second are split between the pieces.
    const asked = [...order].reverse().flatMap((id, i) => [id, `names-nothing-${String(i)}`])
    expect(asked.length).toBeGreaterThan(IDS_AT_ONCE)
    expect(ids(t.api.listRecords({ workspaceId: 'default', ids: asked }))).toEqual(order)
  })
})
