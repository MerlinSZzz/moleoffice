// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORDS LIST HAS A LIGHT SHAPE. Problem jRaiN3j1IAfz, 11 September 2026.
 *
 * GET /api/records answered 23 MB for 5,616 records on the owner's database, and the home page asked for
 * all of it on every visit to draw a count, a title per record and two panels. `?shape=light`
 * answers each record without the body of its `data`: only the state word and the short forms
 * stay, except for a pipeline and a module, whose bodies the home page reads. The full list is
 * unchanged, and `incompleteCount` is the same number in both.
 *
 * Mutation that proves it: return `rows` for the light shape too (or drop `lightRecord`), and the
 * first case goes red on the note's body; make the module lose its paths, and the second goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: PERSON, payload: body as object })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

type Row = { id: string; kind: string; data: Record<string, unknown>; incompleteCount: number }

async function list(query: string): Promise<{ status: number; records: Row[] }> {
  const reply = await app.inject({ method: 'GET', url: '/api/records' + query, headers: PERSON })
  const body = reply.json() as { records?: Row[] }
  return { status: reply.statusCode, records: body.records ?? [] }
}

let noteId = ''
let moduleId = ''
let taskId = ''
let sessionId = ''
const BODY = 'A body long enough to matter. '.repeat(40)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const note = await post('/api/records', {
    kind: 'note',
    title: 'A note with a long body',
    data: { date: '2026-09-11', body: BODY, source: 'the test' },
  })
  noteId = String((note['record'] as { id: string }).id)
  // A TASK, because `task` is a kind that really carries a `state` and can carry a short form. The
  // short form is written straight into the row, the way `writeDataBypassingTheGate` writes a state
  // the ordinary create refuses: a label names the revision it was made from, and a brand-new
  // record has none. What is under test is which body keys the two shapes serve, not that door.
  const task = await post('/api/records', {
    kind: 'task',
    title: 'A task whose state and label the home page draws',
    data: { state: 'doing' },
  })
  taskId = String((task['record'] as { id: string }).id)
  writeDataBypassingTheGate(t, taskId, {
    state: 'doing',
    shortForms: { label: { text: 'A short label', madeFrom: { seq: 6, contentHash: 'aaaa' }, writtenBy: 'agent' } },
  })
  const mod = await post('/api/records', {
    kind: 'module',
    title: 'A module whose paths the home page reads',
    summary: 'One module, for the light shape to keep whole.',
    data: { paths: [{ id: 'the-door', label: 'The records door', path: 'src/server/api/records.ts', kind: 'code' }], state: 'active' },
  })
  moduleId = String((mod['record'] as { id: string }).id)
  // A LABEL ON THE MODULE, so the home shape's own cut of `shortForms` is visible here too. The
  // label is the one whole-record form Home draws, and the by-part structure that shares the key is
  // written beside it so a shape that sent the whole key back would show the extra bytes.
  writeDataBypassingTheGate(t, moduleId, {
    paths: [{ id: 'the-door', label: 'The records door', path: 'src/server/api/records.ts', kind: 'code' }],
    state: 'active',
    shortForms: { label: { text: 'A module label', madeFrom: { seq: 6, contentHash: 'cccc' }, writtenBy: 'agent' } },
  })
  // A SESSION WITH A TITLE, A SUMMARY, A SHORT FORM AND AN ENDING. The Running now block and the
  // sessions page read only `state` and `detail` off this list, so the other four have to be
  // present for the session shape's test to show that they are left out.
  const session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A run whose ending the list draws',
    summary: 'Summary nobody lists from this reply. '.repeat(6),
    data: { state: 'crashed', detail: 'exit 137, out of memory' },
    actor: t.api.HUMAN,
  })
  sessionId = session.id
  // A SHORT FORM ON THE SESSION TOO, written past the gate the way the task's is above: the session
  // list never draws one, so the shape has to leave it out and the test has to be able to see it if
  // the shape stops cutting it.
  writeDataBypassingTheGate(t, sessionId, {
    state: 'crashed',
    detail: 'exit 137, out of memory',
    shortForms: { label: { text: 'A session label', madeFrom: { seq: 6, contentHash: 'bbbb' }, writtenBy: 'agent' } },
  })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/records?shape=light', () => {
  it('drops the body of a note but keeps a task state word and short forms; the full list still carries the body', async () => {
    const light = await list('?shape=light')
    expect(light.status).toBe(200)
    const note = light.records.find((r) => r.id === noteId)
    expect(note, 'the note is listed').toBeDefined()
    expect(note?.data).not.toHaveProperty('body')
    expect(note?.data).not.toHaveProperty('source')
    const task = light.records.find((r) => r.id === taskId)
    expect(task?.data['state'], 'the state word a list draws').toBe('doing')
    expect(task?.data, 'the short forms a list draws').toHaveProperty('shortForms')
    const full = await list('?shape=full')
    const whole = full.records.find((r) => r.id === noteId)
    expect(whole?.data['body']).toBe(BODY)
    expect(note?.incompleteCount, 'the count is worked out on the whole record').toBe(whole?.incompleteCount)
  })

  it('keeps a module whole, because the home page reads its paths', async () => {
    const light = await list('?shape=light')
    const mod = light.records.find((r) => r.id === moduleId)
    expect(mod?.data['paths']).toEqual([{ id: 'the-door', label: 'The records door', path: 'src/server/api/records.ts', kind: 'code' }])
    expect(mod?.data['state']).toBe('active')
  })

  it('answers a good deal less than the full list on the same records', async () => {
    const light = JSON.stringify((await list('?shape=light')).records).length
    const full = JSON.stringify((await list('?shape=full')).records).length
    expect(light, `light ${String(light)} bytes against full ${String(full)}`).toBeLessThan(full - BODY.length + 50)
  })

  it('refuses a shape it does not have', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/records?shape=heavy', headers: PERSON })
    expect(reply.statusCode).toBe(400)
  })
})

/**
 * THE SESSION LIST IS NARROWER AGAIN, AND IT MUST STAY THAT WAY.
 *
 * `readSessionRecordFacts` — the one reader the Running now block and the sessions page both use —
 * takes each run's `data.state` and `data.detail` and its record `id`, and nothing else. On a copy
 * of the owner's database (7,891 records) `?kind=session&shape=light` answered 1,090,413 bytes; the session
 * shape is about 540,000, most of it `detail`, and the rest of the light row — `title`, `summary`,
 * the two timestamps, `shortForms` — was bytes neither screen drew.
 *
 * MUTATION. Widen `SESSION_KEEPS_KEYS` in src/server/api/records.ts, or return the record whole,
 * and the top-level or body-key case below goes red.
 */
describe('GET /api/records?shape=session', () => {
  async function sessionRows(): Promise<Record<string, unknown>[]> {
    const reply = await app.inject({ method: 'GET', url: '/api/records?kind=session&shape=session', headers: PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    return (reply.json() as { records: Record<string, unknown>[] }).records
  }

  it('keeps only id, kind and the two body keys a session reader draws', async () => {
    const records = await sessionRows()
    expect(records.length, 'the session list is empty, so its cut proves nothing').toBeGreaterThan(0)
    for (const record of records) {
      expect(
        Object.keys(record).filter((key) => !['id', 'kind', 'data'].includes(key)),
        `${String(record['id'])} carried a top-level field no session reader draws`,
      ).toEqual([])
      expect(
        Object.keys(record['data'] as object).filter((key) => !['state', 'detail'].includes(key)),
        `${String(record['id'])} carried a body key no session reader draws`,
      ).toEqual([])
    }
    const mine = records.find((record) => record['id'] === sessionId)
    expect(mine, 'the session the test made is not in the list').toBeDefined()
    const data = mine?.['data'] as Record<string, unknown>
    expect(data['state'], 'the written state the list draws is gone').toBe('crashed')
    expect(data['detail'], 'the ending the list draws is gone').toBe('exit 137, out of memory')
    expect(mine).not.toHaveProperty('title')
    expect(mine).not.toHaveProperty('summary')
  })

  it('answers a good deal less than the light shape on the same sessions', async () => {
    const session = JSON.stringify(await sessionRows()).length
    const light = JSON.stringify((await list('?kind=session&shape=light')).records).length
    expect(session, `session ${String(session)} bytes against light ${String(light)}`).toBeLessThan(light)
  })
})

/**
 * THE HOME PAGE'S OWN LIST IS NARROWER THAN `light`, PER KIND, AND IT MUST STAY THAT WAY.
 *
 * The home page draws a title map and one line of words per record, a pipeline's ordered steps and
 * a module's checklist. Its readers (`wordsAt`, `readPipelines` with `PipelinesBlock`, and
 * `ModulesPanel` with `pickModules`/`parseModule`) read `id`, `kind`, `title`, `summary` and `data`
 * on every row; `updatedAt`, `workspaceId` and `origin` on a module; `updatedAt` and `workspaceId`
 * on a pipeline; `deletedAt` on a block; and of `data` only `blockIds` (pipeline), `state`, `parts`
 * and `shortForms.label` (module), and `state` (block).
 *
 * Measured on a copy of the owner's database, 12 September 2026: `shape=light` answered 4,133,420 bytes,
 * `shape=home` with every top-level field 2,622,586, and this per-kind cut 1,368,518. The module's
 * level-1 label was put back on 15 September 2026 by a decision, measured on the office's own corpus at 4,170
 * bytes on a home list of 1,937,042. The by-part forms that share `data.shortForms` stay off
 * this shape.
 *
 * MUTATION. Widen a kind's fields back in `HOME_FIELDS_BY_KIND` or `HOME_DATA_BY_KIND` in
 * src/server/api/records.ts — add `paths` to the module body, or `createdAt` to a row — and the
 * body-key or top-level assertion below goes red. Take `shortForms` off the module's body keys and
 * the module loses the label the home page draws. The full proof, with one assertion per kind, is
 * tests/the-home-record-list-carries-what-home-draws.test.ts.
 *
 * THE WHOLE LIST IN THIS SHAPE IS REFUSED, so the first two cases ask one page of the most rows one
 * reply holds, which on this office is every record. The last case pins the refusal.
 */
describe('GET /api/records?shape=home', () => {
  /** One page of the most rows, and that page is every record of this office. */
  const homePage = async (): Promise<{ status: number; records: Row[] }> => {
    const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
    const reply = await app.inject({ method: 'GET', url: `/api/records?shape=home&limit=${String(RECORD_LIST_MAX_LIMIT)}`, headers: PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const body = reply.json() as { records?: Row[]; left?: number }
    expect(body.left, 'the page left records out, so the cut is not checked on every record').toBe(0)
    return { status: reply.statusCode, records: body.records ?? [] }
  }

  it('keeps no body key outside what the home readers draw, per kind', async () => {
    const home = await homePage()
    expect(home.status).toBe(200)
    const allowedFor = (kind: string): string[] =>
      kind === 'pipeline' ? ['blockIds'] : kind === 'module' ? ['state', 'parts', 'shortForms'] : kind === 'block' ? ['state'] : []
    for (const record of home.records) {
      const unexpected = Object.keys(record.data ?? {}).filter((key) => !allowedFor(record.kind).includes(key))
      expect(unexpected, `${record.kind} ${record.id} carried a body key the home page does not draw`).toEqual([])
    }
    // THE TASK'S STATE IS NOT DRAWN: only a pipeline's steps, a module's checklist and a block's
    // state are, and all three are covered above. The note's body and its source are gone.
    const task = home.records.find((r) => r.id === taskId)
    expect(task?.data).toEqual({})
    const note = home.records.find((r) => r.id === noteId)
    expect(note?.data).toEqual({})
    // AND THE MODULE KEEPS ONLY WHAT `parseModule` READS: its state, and its checklist (which this
    // fixture does not carry). The `paths` the light shape kept are not read on Home.
    const mod = home.records.find((r) => r.id === moduleId)
    expect(mod?.data).toHaveProperty('state', 'active')
    expect(mod?.data).not.toHaveProperty('paths')
    // AND THE ONE KEY HOME DRAWS UNDER `shortForms`: the level-1 label. The by-part structure that
    // shares the key is not part of this fixture, so an extra key here would be a widened shape.
    expect((mod?.data as { shortForms?: unknown }).shortForms, 'the module lost the label Home draws').toEqual({
      label: { text: 'A module label', madeFrom: { seq: 6, contentHash: 'cccc' }, writtenBy: 'agent' },
    })
    // THE TOP-LEVEL FIELDS NO HOME READER DRAWS ARE GONE TOO.
    expect(task).not.toHaveProperty('createdAt')
    expect(task).not.toHaveProperty('incompleteCount')
  })

  it('answers less again than the light shape on the same records', async () => {
    const home = JSON.stringify((await homePage()).records).length
    const light = JSON.stringify((await list('?shape=light')).records).length
    expect(home, `home ${String(home)} bytes against light ${String(light)}`).toBeLessThan(light)
  })

  /**
   * THE WHOLE LIST IN THE HOME SHAPE IS REFUSED before anything is read, and its words say what to ask
   * instead. A read that names no kind and no limit is refused, whatever else it names. A read that names
   * a kind or a limit is answered, and the light shape is answered whole as before.
   *
   * MUTATION. In the refusal's condition in the list door of src/server/api/records.ts, change
   * `q.limit === undefined` to `q.limit !== undefined`: the whole list is answered 200 and the page of the
   * most rows is refused, and this case goes red on the first status.
   */
  it('refuses the whole list with words that name kind and limit, and answers a kind or a page', async () => {
    const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
    const refused = await app.inject({ method: 'GET', url: '/api/records?shape=home', headers: PERSON })
    expect(refused.statusCode, refused.body).toBe(400)
    const body = refused.json() as { error?: string; records?: unknown }
    expect(body.error, 'the refusal does not say to ask for one kind').toContain('kind=')
    expect(body.error, 'the refusal does not say to ask for one page').toContain('limit')
    expect(body.error, 'the refusal does not name the most rows one page holds').toContain(String(RECORD_LIST_MAX_LIMIT))
    expect(body.error, 'the refusal does not say how to ask for the next page').toContain('offset')
    expect(body, 'the refusal carried records').not.toHaveProperty('records')
    // NO KIND AND NO LIMIT IS REFUSED, whatever else the read names.
    for (const also of ['&family=structure', `&ids=${moduleId}`, '&q=module']) {
      expect((await list(`?shape=home${also}`)).status, `?shape=home${also} was answered`).toBe(400)
    }
    expect((await list('?shape=home&kind=module')).status, 'the home shape of one kind was refused').toBe(200)
    expect((await list(`?shape=home&limit=${String(RECORD_LIST_MAX_LIMIT)}`)).status, 'a page of the home shape was refused').toBe(200)
    expect((await list('?shape=light')).status, 'the whole list in the light shape was refused').toBe(200)
  })
})

