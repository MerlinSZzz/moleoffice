// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE'S DETAIL GRID IS COUNTED ON THE SERVER, OVER THE RECORDS THE LIST HOLDS FOR THE SAME READER.
 *
 * Problem QAWmjqGzcG07: the grid read every record of the project, `GET /api/records` with no kind, to count in the
 * browser how many records have each length written. On the live office that read is the largest on the Settings
 * page. `GET /api/records/detail-supply` now counts on the server with `detailSupplyOf` (src/shared/detailsupply.ts),
 * the function a test can call on a list of records, and sends the counts, the first unwritten records and one
 * record per row.
 *
 * WHAT HOLDS:
 *   - for the person and for an agent, the door's answer is `detailSupplyOf` of the rows `GET /api/records` lists for
 *     that same reader, so a message the agent may not read is not counted for that agent;
 *   - an opened count lists its first 40 unwritten records and says how many there are in all;
 *   - the grid drawn from the door's answer is the grid drawn from the listed records;
 *   - the one walk that counts and chooses the previews answers what `supplyOf` and `previewRecord` answer one at a
 *     time, so keeping each record's answers for the preview choice did not change the choice.
 *
 * THE DOOR READS ONLY WHAT THE GRID SHOWS (wave 13y round 24). On a made-up office of the live counts the door read
 * every record of the project whole, 134 MB, to count a few fields of each. It now asks the database for the fields
 * of `data` that `detailSourceOf` reads (`THE_DATA_FIELDS_A_DETAIL_SOURCE_READS`), and reads whole only the records
 * the grid previews. A second made-up project, `shelf`, holds what every one of those fields is for: a report with a
 * short form written, a report whose title was cut from its prose, a module with a body, and forty problems whose
 * long symptom the grid never reads. On it:
 *   - the door's answer is still `detailSupplyOf` of the rows the list holds, previews whole;
 *   - every statement on `records` hands back no more than twice what the grid needs, and a whole read is far over it;
 *   - each record's detail source from the fields read is its detail source from the whole record.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DETAIL_ROWS } from '../src/shared/detail.ts'
import { detailSupplyOf, previewRecord, supplyOf, UNWRITTEN_LISTED, type DetailSupply } from '../src/shared/detailsupply.ts'
import { detailSourceOf, THE_DATA_FIELDS_A_DETAIL_SOURCE_READS } from '../src/shared/detailsource.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Says = typeof import('../src/web/components/DetailSays.tsx')

let t: TestDb
let app: FastifyInstance
let says: Says

const REPORTS = 45

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The second project, which holds a record for every field the grid reads, and records it never reads. */
const SHELF = 'shelf'

const IN_THE_SHELF = { ...AS_THE_PERSON, 'x-mole-office-workspace': SHELF }

/** How many problems the shelf holds, each with a symptom the grid never reads. */
const PROBLEMS = 40

/** A symptom of about three thousand characters, so that one whole read of the shelf is far over the bound. */
const A_LONG_SYMPTOM = 'The descaler bottle leaked onto the shelf again and the label came away. '.repeat(42)

/**
 * WHAT THE DOOR READS OF EVERY RECORD BESIDE THE FIELDS THE GRID SHOWS: its id, title, summary, kind and stamps. That
 * is about a hundred characters a record here; this allows two hundred.
 */
const CHARACTERS_A_RECORD = 200

function asAgent(id: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id }
}

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: JSON.stringify(body) })
  expect(reply.statusCode, reply.body).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return (reply.json() as { record: { id: string } }).record.id
}

async function get<T>(url: string, headers: Record<string, string>): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** The listed rows without what the list adds to each one, which the grid does not read. */
function asStored(rows: readonly (PanelRecord & { incompleteCount?: number })[]): PanelRecord[] {
  return rows.map(({ incompleteCount: _count, ...record }) => record)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const store = new Map<string, string>()
  Object.assign(globalThis, {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  })
  says = await import('../src/web/components/DetailSays.tsx')
  for (let n = 1; n <= REPORTS; n += 1) {
    await file(AS_THE_PERSON, {
      kind: 'report',
      title: `Kettle descaling log, week ${String(n)}`,
      summary: `The kettle was descaled in week ${String(n)}.`,
      data: { for: 'Mara Okonkwo', date: '2026-09-28', blocks: [{ id: 'b-1', type: 'text', text: `Week ${String(n)}: the limescale came off with vinegar.` }] },
    })
  }
  await file(AS_THE_PERSON, { kind: 'module', title: 'The kitchen shelf', summary: 'Where the kettle and the vinegar are kept.' })
  // A message from the person to an agent, which another agent may not read.
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'hazel', data: { handle: 'hazel', state: 'active', runtime: 'claude-code' }, actor: { type: 'human', id: THE_PERSON } })
  await file(AS_THE_PERSON, { kind: 'message', title: 'Shelf labels', data: { to: [{ kind: 'agent', id: 'hazel' }], body: 'The vinegar label has come off.' } })

  // THE SHELF: a record for each field the grid reads, and problems whose symptom it never reads.
  t.client.sqlite
    .prepare(`INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, 'Shelf', '2026-09-28 09:00:00', '2026-09-28 09:00:00')`)
    .run(SHELF)
  const reports: string[] = []
  for (let n = 1; n <= 6; n += 1) {
    reports.push(
      await file(IN_THE_SHELF, {
        kind: 'report',
        title: `Shelf stock count, week ${String(n)}`,
        summary: `What was on the kitchen shelf in week ${String(n)}.`,
        data: { for: 'Mara Okonkwo', date: '2026-09-28', blocks: [{ id: 'b-1', type: 'text', text: `Week ${String(n)}: two bottles of vinegar and one cloth.` }] },
      }),
    )
  }
  const revisions = await get<{ revisions: { seq: number; contentHash: string }[] }>(`/api/records/${reports[0]!}/revisions`, IN_THE_SHELF)
  const newest = [...revisions.revisions].sort((a, b) => b.seq - a.seq)[0]!
  const wrote = await app.inject({
    method: 'POST',
    url: `/api/records/${reports[0]!}/short-forms`,
    headers: IN_THE_SHELF,
    payload: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Shelf count, week one' } }),
  })
  expect(wrote.statusCode, wrote.body).toBeLessThan(300)
  // No door writes `titleDerived` yet, so the made-up record is given it in the database.
  t.client.sqlite.prepare(`UPDATE records SET data = json_set(data, '$.titleDerived', json('true')) WHERE id = ?`).run(reports[1]!)
  await file(IN_THE_SHELF, {
    kind: 'module',
    title: 'The kitchen shelf, counted',
    summary: 'Where the stock counts of the shelf are kept.',
    data: { summaryBlocks: [{ id: 's-1', type: 'text', text: 'The shelf holds the kettle, the vinegar and the cloths.' }] },
  })
  for (let n = 1; n <= PROBLEMS; n += 1) {
    await file(IN_THE_SHELF, { kind: 'problem', title: `The shelf leaked, time ${String(n)}`, data: { symptom: A_LONG_SYMPTOM } })
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the detail grid counted on the server', () => {
  for (const [who, headers] of [
    ['the person', AS_THE_PERSON],
    ['an agent the message is not for', asAgent('rowan')],
  ] as const) {
    it(`answers, for ${who}, the counting of the rows the list holds for them`, async () => {
      const listed = await get<{ records: PanelRecord[] }>('/api/records?shape=full', headers)
      const { counted, positions, samples } = await get<DetailSupply>('/api/records/detail-supply', headers)
      expect({ counted, positions, samples }).toEqual(detailSupplyOf(asStored(listed.records)))
    })
  }

  it('does not count the message for the agent who may not read it', async () => {
    const forThePerson = await get<DetailSupply>('/api/records/detail-supply', AS_THE_PERSON)
    const forRowan = await get<DetailSupply>('/api/records/detail-supply', asAgent('rowan'))
    expect(forThePerson.counted - forRowan.counted).toBe(1)
  })

  it(`lists the first ${String(UNWRITTEN_LISTED)} unwritten records of a count and says how many there are`, async () => {
    const answer = await get<DetailSupply>('/api/records/detail-supply', AS_THE_PERSON)
    const label = answer.positions.find((one) => one.rung === 'label')
    expect(label?.unwritten).toBe(REPORTS)
    expect(label?.listed).toHaveLength(UNWRITTEN_LISTED)
    expect(label?.listed[0]?.title).toMatch(/^Kettle descaling log, week \d+$/)
  })

  it('draws the same grid from its answer as from the listed records', async () => {
    const listed = await get<{ records: PanelRecord[] }>('/api/records?shape=full', AS_THE_PERSON)
    const answer = await get<DetailSupply>('/api/records/detail-supply', AS_THE_PERSON)
    const fromTheDoor = renderToStaticMarkup(h(says.DetailGrid, { answer }))
    expect(fromTheDoor).toBe(renderToStaticMarkup(h(says.DetailGrid, { answer: detailSupplyOf(asStored(listed.records)) })))
    expect(fromTheDoor).toContain(`/${String(REPORTS)}`)
  })

  it('counts and chooses the previews in one walk as supplyOf and previewRecord do one at a time', async () => {
    const listed = asStored((await get<{ records: PanelRecord[] }>('/api/records?shape=full', AS_THE_PERSON)).records)
    // An agent, which answers every position with its name, under an id that sorts before every other. The row
    // that draws every kind previews it only if the walk loses how many different answers each record gives.
    const agent = listed.find((record) => record.kind === 'agent')!
    const records = [...listed, { ...agent, id: '0000000000aa' }]
    const answer = detailSupplyOf(records)
    expect(answer.positions.map(({ rung, written, possible, unwritten, listed: first }) => ({ rung, written, possible, unwritten, first }))).toEqual(
      supplyOf(records).map((one) => ({
        rung: one.rung,
        written: one.written,
        possible: one.possible,
        unwritten: one.unwritten.length,
        first: one.unwritten.slice(0, UNWRITTEN_LISTED).map((record) => ({ id: record.id, title: record.title })),
      })),
    )
    expect(answer.samples).toEqual(Object.fromEntries(DETAIL_ROWS.map((row) => [row, previewRecord(records, row)])))
    expect(answer.samples.everywhere?.id).not.toBe('0000000000aa')
  })
})

/** The characters of stored text every statement on `records` handed back while one request ran. */
async function textReadBy(url: string, headers: Record<string, string>): Promise<{ characters: number; answer: DetailSupply }> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  let characters = 0
  const count = (value: unknown): void => {
    if (typeof value === 'string') characters += value.length
    else if (Array.isArray(value)) value.forEach(count)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(count)
  }
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (/\bfrom\s+"?records"?/i.test(text)) {
      for (const method of ['all', 'get'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          const out = read.apply(this, args)
          count(out)
          return out
        }
      }
    }
    return statement
  }
  try {
    // The answer first: an object's fields are worked out in order, and `characters` grows while the request runs.
    const answer = await get<DetailSupply>(url, headers)
    return { characters, answer }
  } finally {
    sqlite.prepare = original
  }
}

describe('the detail grid reads of each record only what it shows', () => {
  it('answers, in a project with a short form written, the counting of the listed rows, with each preview whole', async () => {
    const listed = await get<{ records: PanelRecord[] }>('/api/records?shape=full', IN_THE_SHELF)
    const answer = await get<DetailSupply>('/api/records/detail-supply', IN_THE_SHELF)
    expect(answer.positions.find((one) => one.rung === 'label')?.written, 'the shelf holds one report with a label').toBe(1)
    expect({ counted: answer.counted, positions: answer.positions, samples: answer.samples }).toEqual(detailSupplyOf(asStored(listed.records)))
  })

  it('takes out of the database no more than twice what the grid needs, and far less than one whole read', async () => {
    const db = t.client.sqlite
    const sum = (text: string, ...args: unknown[]): number => (db.prepare(text).get(...args) as { n: number | null }).n ?? 0
    // WHAT THE GRID NEEDS, worked out with this file's own query: the fields it reads of every record of the shelf,
    // and the records it previews whole.
    const fields = `coalesce(length(json_extract(data, '$.blocks')), 0) + coalesce(length(json_extract(data, '$.summaryBlocks')), 0) + coalesce(length(json_extract(data, '$.shortForms')), 0) + coalesce(length(json_extract(data, '$.titleDerived')), 0)`
    const { characters, answer } = await textReadBy('/api/records/detail-supply', IN_THE_SHELF)
    const previewed = [...new Set(Object.values(answer.samples).flatMap((sample) => (sample === null ? [] : [sample.id])))]
    const needs =
      sum(`SELECT sum(${fields}) AS n FROM records WHERE workspace_id = ?`, SHELF) +
      previewed.reduce((all, id) => all + sum('SELECT length(data) AS n FROM records WHERE id = ?', id), 0)
    const bound = 2 * needs + CHARACTERS_A_RECORD * sum('SELECT count(*) AS n FROM records')
    const whole = sum('SELECT sum(length(data)) AS n FROM records WHERE workspace_id = ?', SHELF)
    expect(bound, 'the shelf is built so that one whole read of it is over the bound').toBeLessThan(whole)
    expect(characters, `characters read; the bound is ${String(bound)}, and the shelf holds ${String(whole)}`).toBeLessThanOrEqual(bound)
  })

  it('gives every record the same detail source from the fields it reads as from the whole record', async () => {
    // Imported here, after `freshDb`, because the module opens the database it reads.
    const { listRecords, listRecordsWithDataAs, onlyTheseFieldsOf } = await import('../src/server/lib/records.ts')
    const narrow = new Map(listRecordsWithDataAs({ workspaceId: SHELF }, onlyTheseFieldsOf(THE_DATA_FIELDS_A_DETAIL_SOURCE_READS)).map((record) => [record.id, record]))
    const whole = listRecords({ workspaceId: SHELF })
    expect(whole.length).toBe(narrow.size)
    const sources = whole.map((record) => detailSourceOf(record))
    expect(sources.filter((source) => source.shortForms !== undefined).length, 'a record holds a short form').toBeGreaterThan(0)
    expect(sources.filter((source) => source.titleDerived === true).length, 'a record says its title was cut from its prose').toBe(1)
    expect(sources.filter((source) => source.body?.field === 'data.summaryBlocks' && source.body.written).length, 'a module has a body').toBe(1)
    for (const record of whole) {
      expect(detailSourceOf(narrow.get(record.id)!), `${record.kind} ${record.title}`).toEqual(detailSourceOf(record))
    }
  })
})
