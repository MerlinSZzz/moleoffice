// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/records ANSWERS IDS, KINDS, TITLES AND STAMPS WHEN NO SHAPE IS ASKED, AND
 * ?shape=full ANSWERS EVERY FIELD.
 *
 * There is a decision on this. Measured before: record.list answered 20.6 GB in 5,421
 * answered calls since 27 August, about 3.8 MB each; the door answered every record with its whole `data` however
 * much of it the caller reads. The narrow row is what a caller that reads only names needs, and no
 * shape is the narrow answer: `?shape=full` is how a caller asks for the whole row, and `?shape=narrow`
 * stays accepted and answers the same as no shape. This cannot be bought by changing the list every
 * other screen reads — the whole-answer case below pins that.
 *
 * WHO IS MOVED. `useAgentNames` in src/web/components/agent/names.ts, which reads a title and
 * nothing else per row (proved at the bottom by running `agentName` over a narrow row). The
 * conversations page's list of work, which this shape was first made for, now asks
 * `GET /api/records/work-to-talk-about`, whose rows are in this shape.
 *
 * MUTATION THAT MAKES THIS RED (control run first, then revert byte-identical): make the default
 * whole rather than narrow and the no-shape case is red; make `shape=full` answer the narrow row and
 * the full-answer case is red. Give `narrow` the `light` record instead of the narrow one and the
 * exact-fields case is red — a light row carries `shortForms`, `summary` and the whole data of a
 * module or pipeline, none of which a name needs. Leave `origin` out of the narrow keys and the exact-fields case, the
 * provenance case and the note case are red: a caller that tells a made-up row from a real one by its mark would read
 * every narrow row as unmarked. Leave `origin` out of the note GET /api publishes for this door (RECORD_LIST_NOTE in
 * src/server/api/records.ts) and the note case is red: a caller that reads the note and not a row would not know the
 * mark is there.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const NOTE_TITLE = 'A note a name answers from'
const NOTE_BODY = 'The words of a note, long enough on purpose that their presence would not hide in a reply.'.repeat(8)
const NARROW_KEYS = ['createdAt', 'data', 'id', 'kind', 'origin', 'title', 'updatedAt', 'workspaceId']

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: { kind: 'note', title: NOTE_TITLE, data: { body: NOTE_BODY } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: { kind: 'obligation', title: 'An obligation the narrow list still ranks', data: { state: 'open', owedTo: 'the narrow test', due: '2020-01-01' } },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The rows of one read of the door: the narrow answer, the whole one, or the light one. */
async function read(query: string): Promise<{ status: number; rows: Record<string, unknown>[] }> {
  const res = await app.inject({ method: 'GET', url: `/api/records${query}` })
  const body = res.json() as { records?: Record<string, unknown>[]; error?: string }
  return { status: res.statusCode, rows: body.records ?? [] }
}

/** The note this file made, out of one answer. */
function theNote(rows: Record<string, unknown>[]): Record<string, unknown> {
  const mine = rows.filter((one) => one.title === NOTE_TITLE)
  expect(mine).toHaveLength(1)
  return mine[0]!
}

describe('GET /api/records with no shape or ?shape=narrow', () => {
  it('answers the narrow row when no shape is named: four fields a name or a card reads and nothing else', async () => {
    const narrow = await read('')
    expect(narrow.status).toBe(200)
    const row = theNote(narrow.rows)
    expect(Object.keys(row).sort()).toEqual(NARROW_KEYS.sort())
    // THE `data` IS THE STATE WORD AND NOTHING ELSE. A note has none, so it is the empty object
    // that says so rather than the key vanishing.
    expect(row.data).toEqual({})
    expect(row.kind).toBe('note')
    expect(row.createdAt).toBeTruthy()
    expect(row.updatedAt).toBeTruthy()
    expect(row.workspaceId).toBeTruthy()
    expect(row.title).toBe(NOTE_TITLE)
    // NO WORDS AND NO RECORD: narrow is not light or session, which each keep whole kinds on purpose.
    expect('body' in row, `a narrow row ${JSON.stringify(row).slice(0, 200)} carries a body`).toBe(false)
    expect('summary' in row, `a narrow row carries a summary`).toBe(false)
  })

  it('carries the provenance mark the whole row carries, so a made-up row is still labelled', async () => {
    const narrow = theNote((await read('')).rows)
    const whole = theNote((await read('?shape=full')).rows)
    expect('origin' in whole, 'the control: the whole row carries its provenance mark').toBe(true)
    expect(narrow.origin).toBe(whole.origin)
  })

  it('is the row the door publishes: GET /api names every field a narrow row carries, and no other', async () => {
    // THE NOTE IS WHERE A CALLER LEARNS THE ROW WITHOUT READING ONE. When `origin` joined the narrow row the note went on
    // naming the fields without it, and nothing failed. The names are read off the note's own list of the narrow row and
    // compared with a row the door answers, so the two cannot drift apart again in silence.
    const index = (await app.inject({ method: 'GET', url: '/api' })).json() as { endpoints: { method: string; path: string; description: string | null }[] }
    const note = index.endpoints.find((one) => one.method === 'GET' && one.path === '/api/records')?.description ?? ''
    const list = /the narrow row: (.*?), and nothing else in `data`/.exec(note)?.[1]
    expect(list, `the note GET /api publishes for GET /api/records lists no narrow row: ${note}`).toBeTruthy()
    const named = [...list!.matchAll(/`([A-Za-z][A-Za-z0-9_.]*)`/g)].map(([, name]) => String(name)).sort()
    const row = (await read('')).rows.find((one) => one.kind === 'obligation')
    expect(row, 'the obligation, which has a state word, is not in the narrow list').toBeTruthy()
    const carried = [
      ...Object.keys(row!).filter((key) => key !== 'data'),
      ...Object.keys(row!['data'] as Record<string, unknown>).map((key) => `data.${key}`),
    ].sort()
    expect(named, 'the fields the note names, beside the fields a narrow row carries').toEqual(carried)
  })

  it('keeps the state word, stamps included, and reads nothing else off data', async () => {
    const narrow = await read('')
    const mine = narrow.rows.find((one) => one.kind === 'obligation')
    expect(mine).toBeTruthy()
    expect((mine!['data'] as Record<string, unknown>).state).toBe('open')
    expect((mine!['data'] as Record<string, unknown>).owedTo).toBeUndefined()
    expect((mine!['data'] as Record<string, unknown>).due).toBeUndefined()
  })

  it('answers exactly the same row when shape=narrow is asked for', async () => {
    const plain = await read('')
    const asked = await read('?shape=narrow')
    expect(asked.status).toBe(200)
    expect(asked.rows).toEqual(plain.rows)
  })

  it('combines with a kind filter, as a caller asks it with one', async () => {
    const narrow = await read('?kind=note')
    expect(narrow.rows.length, 'the note list is empty, so its kind check proves nothing').toBeGreaterThan(0)
    for (const one of narrow.rows) expect(one.kind).toBe('note')
  })
})

describe('GET /api/records?shape=full', () => {
  it('answers the whole entry, with the words of a note', async () => {
    const whole = await read('?shape=full')
    const note = theNote(whole.rows)
    expect(note.data, JSON.stringify(note).slice(0, 200)).toEqual({ body: NOTE_BODY })
    // AND THE COUNT A PAGE DRAWS IS BACK, which a cut row does not carry.
    expect(note).toHaveProperty('incompleteCount')
    expect(note.title).toBe(NOTE_TITLE)
  })

  it('answers the whole obligation, so the fields a narrow row leaves out are back', async () => {
    const whole = await read('?shape=full')
    const mine = whole.rows.find((one) => one.kind === 'obligation')
    expect(mine).toBeTruthy()
    expect((mine!['data'] as Record<string, unknown>).state).toBe('open')
    expect((mine!['data'] as Record<string, unknown>).owedTo).toBe('the narrow test')
    expect((mine!['data'] as Record<string, unknown>).due).toBe('2020-01-01')
  })

  it('leaves the light shape and its own cut alone', async () => {
    const light = await read('?shape=light')
    const lit = light.rows.find((one) => one.kind === 'obligation')
    expect((lit!['data'] as Record<string, unknown>).state).toBe('open')
    expect((lit!['data'] as Record<string, unknown>).owedTo).toBeUndefined()
  })
})

describe('the narrow row still names a person', () => {
  it('agentName over it answers the title and nothing else', async () => {
    // THE MOVED CALLER. `useAgentNames` asks narrow now; `agentName` reads `title` off what comes
    // back. This row is exactly what that read produces, whole data dropped, and the one sentence
    // the name hook draws proves the fields it needs arrived.
    const { agentName, AN_AGENT_NO_LONGER_FILED } = await import('../src/web/components/agent/names.ts')
    // An agentName's argument is typed over the whole rows; the object here is a narrow row as the
    // door answers it, cast to the hook's type because the hook keeps PanelRecord. Only the title
    // is read, which is the point being proved.
    const narrowRow = { status: 'ready' as const, value: [{ id: 'abcdef123456', kind: 'agent', workspaceId: 'default', title: 'named from the narrow row', createdAt: '2026-09-16 11:00:00', updatedAt: '2026-09-16 11:00:00', ownerId: THE_TEST_OFFICES_OWNER.id, data: {} } as never] }
    expect(agentName(narrowRow, 'abcdef123456')).toBe('named from the narrow row')
    expect(agentName(narrowRow, 'zzzzzzzzzzzz')).toBe(AN_AGENT_NO_LONGER_FILED)
  })
})
