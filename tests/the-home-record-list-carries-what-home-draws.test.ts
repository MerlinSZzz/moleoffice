// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/records?shape=home CARRIES, PER KIND, WHAT THE HOME PAGE DRAWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * The home page reads this list through three consumers and nothing else: `wordsAt`
 * (src/shared/detailsource.ts), which names a record in a row; `readPipelines` with
 * `PipelinesBlock` (HomePage.tsx); and `ModulesPanel` with `pickModules`/`parseModule`. Between
 * them, per kind, they read:
 *
 *   every kind  id, kind, title, summary, data
 *   pipeline    updatedAt, workspaceId, and of data only blockIds
 *   module      updatedAt, workspaceId, origin, and of data state, parts and shortForms.label
 *   block       deletedAt, and of data only state and paused
 *
 * Measured on a copy of the owner's database, 12 September 2026: `shape=home` with every top-level field
 * answered 2,622,586 bytes, most of it fields this page never reads (`summary` 569,375, `title`
 * 403,842, the two timestamps 267,414). The cut shape answers 1,368,518.
 *
 * AND THE LABEL IS A COST THAT IS PAID ON PURPOSE. Measured on the office's own corpus, 15 September
 * 2026: the home list answered 1,937,042 bytes, 22 of its 46 modules carried a level-1 label, and
 * keeping `shortForms.label` on those rows adds 4,170 bytes, about 0.2 per cent of the list.
 * A decision chose to pay it, against the roughly 1,250,000 bytes commit
 * fd70fe3b saved. The module row keeps the label ALONE: the by-part structure shares
 * `data.shortForms`, and nothing on Home draws it, so the rest of the key does not go back.
 *
 * MUTATION THAT MAKES THIS RED. Widen one kind's fields back in `HOME_FIELDS_BY_KIND` or
 * `HOME_DATA_BY_KIND` (add `createdAt` to module, or `paths` to the module body) and the per-kind
 * assertion below names the extra field. Take `shortForms` out of the module's body keys and the
 * module loses the label the home page draws.
 *
 * AND THE OTHER DIRECTION. The light, session and unshaped shapes must not move: the three guards
 * at the end fail if the per-kind cut leaks into a shape another screen reads.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PERSON = {
  'x-mole-office-workspace': 'panelx',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: PERSON, payload: body as object })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

type Row = Record<string, unknown> & { id: string; kind: string; data: Record<string, unknown> }

async function list(query: string): Promise<Row[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/records' + query, headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { records: Row[] }).records
}

/**
 * THE HOME SHAPE, ONE PAGE OF THE MOST ROWS ONE REPLY HOLDS. The door refuses the whole list in this
 * shape, so each case asks one page, and that page is every record of this office: `left` is 0.
 */
async function homeList(): Promise<Row[]> {
  const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
  const reply = await app.inject({ method: 'GET', url: `/api/records?shape=home&limit=${String(RECORD_LIST_MAX_LIMIT)}`, headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const page = reply.json() as { records: Row[]; left: number }
  expect(page.left, 'the page left records out, so the cut is not checked on every record').toBe(0)
  return page.records
}

let noteId = ''
let taskId = ''
let moduleId = ''
let pipelineId = ''
let blockId = ''
let sessionId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })

  const note = await post('/api/records', {
    kind: 'note',
    title: 'A note the title map names',
    summary: 'One line the gist draws.',
    data: { date: '2026-09-12', body: 'A body nobody on Home reads. '.repeat(30), source: 'the test' },
  })
  noteId = String((note['record'] as { id: string }).id)

  const task = await post('/api/records', { kind: 'task', title: 'A task the title map names', data: { state: 'doing' } })
  taskId = String((task['record'] as { id: string }).id)

  const mod = await post('/api/records', {
    kind: 'module',
    title: 'A module the in-progress panel draws',
    summary: 'One line the gist draws.',
    data: {
      state: 'active',
      parts: [{ id: 'part-1', name: 'The door', items: [{ id: 'item-1', text: 'Open it', state: 'todo' }] }],
    },
  })
  moduleId = String((mod['record'] as { id: string }).id)

  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'A pipeline the block draws', data: { blockIds: [] } })
  pipelineId = String((pipeline['record'] as { id: string }).id)
  const added = await post(`/api/records/${pipelineId}/blocks`, { name: 'Sense the pot', state: 'todo' })
  blockId = String((added['record'] as { id: string }).id)

  const session = t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'session',
    title: 'A run the sessions block draws',
    data: { state: 'crashed', detail: 'exit 137, out of memory' },
    actor: t.api.HUMAN,
  })
  sessionId = session.id
  // THE TWO SHAPES THE HOME LIST MUST NOT TOUCH: a short form the light shape keeps and the session
  // shape drops; a body the light shape drops and the home shape drops; a path only light keeps.
  // AND A SHORT-FORMS KEY THAT CARRIES MORE THAN THE LABEL. `data.shortForms` also holds the by-part
  // structure (`parts`) and the retired keys a record may still keep (`gist`). Home draws only the
  // label through `wordsAt`, so the module keeps `shortForms.label` and leaves the rest behind.
  writeDataBypassingTheGate(t, moduleId, {
    state: 'active',
    parts: [{ id: 'part-1', name: 'The door', items: [{ id: 'item-1', text: 'Open it', state: 'todo' }] }],
    paths: [{ id: 'the-door', label: 'The records door', path: 'src/server/api/records.ts', kind: 'code' }],
    context: 'a context the modules panel never reads',
    summaryBlocks: [{ id: 's-1', type: 'text', text: 'A summary block the panel never reads.' }],
    shortForms: {
      label: { text: 'A module label the title map draws', madeFrom: { seq: 6, contentHash: 'cccc' }, writtenBy: 'agent' },
      parts: {
        madeFrom: { seq: 6, contentHash: 'cccc' },
        writtenBy: 'agent',
        parts: [
          { id: 'p-1', heading: 'The door', text30: 'The door is open.', text120: 'The door is open and stays open.', covers: [] },
        ],
      },
      gist: { text: 'A retired conclusion nothing draws.', madeFrom: { seq: 6, contentHash: 'cccc' }, writtenBy: 'agent' },
    },
  })
  writeDataBypassingTheGate(t, pipelineId, { blockIds: [blockId], source: 'the test' })
  writeDataBypassingTheGate(t, blockId, { state: 'todo', measured: 'p50 42 ms', method: 'the canonical method', paused: BLOCK_PAUSE })
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

/** What the home page draws, per kind. Typed here rather than imported, so a widened shape fails. */
const HOME_FIELDS: Readonly<Record<string, readonly string[]>> = {
  pipeline: ['id', 'kind', 'title', 'summary', 'data', 'updatedAt', 'workspaceId'],
  module: ['id', 'kind', 'title', 'summary', 'data', 'updatedAt', 'workspaceId', 'origin'],
  block: ['id', 'kind', 'title', 'summary', 'data', 'deletedAt'],
}
const HOME_FIELDS_OTHER = ['id', 'kind', 'title', 'summary', 'data']
const HOME_DATA: Readonly<Record<string, readonly string[]>> = {
  pipeline: ['blockIds'],
  module: ['state', 'parts', 'shortForms'],
  block: ['state', 'paused'],
}

/** A made-up pause on the block, which Home's pipeline sentence reads. */
const BLOCK_PAUSE = { since: '2026-08-12 10:00:00', why: 'The test workshop is closed.' }

/** The one key Home draws under a module's `data.shortForms`: the level-1 label. */
const MODULE_LABEL = 'A module label the title map draws'

describe('GET /api/records?shape=home, per kind', () => {
  it('keeps exactly the top-level fields and body keys the home readers draw, for every kind it lists', async () => {
    const rows = await homeList()
    expect(rows.length, 'the home list is empty, so its cut proves nothing').toBeGreaterThan(0)
    for (const row of rows) {
      const allowed = HOME_FIELDS[row.kind] ?? HOME_FIELDS_OTHER
      expect(
        Object.keys(row).filter((key) => !allowed.includes(key)),
        `${row.kind} ${row.id} carried a top-level field the home page does not draw`,
      ).toEqual([])
      expect(
        Object.keys(row.data ?? {}).filter((key) => !(HOME_DATA[row.kind] ?? []).includes(key)),
        `${row.kind} ${row.id} carried a body key the home page does not draw`,
      ).toEqual([])
    }
    // THE FIELDS EACH READER REALLY NEEDS ARE STILL THERE, or the cut would be a loss.
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get(moduleId)?.updatedAt, 'the module lost the stamp pickModules orders by').toBeTruthy()
    expect(byId.get(moduleId)?.workspaceId, 'the module lost the project its row opens').toBe('panelx')
    expect(byId.get(pipelineId)?.data, 'the pipeline lost the ordered steps').toEqual({ blockIds: [blockId] })
    expect(byId.get(blockId)?.deletedAt, 'the block lost the deletion check readPipelineBlocks makes').toBeNull()
    // THE PAUSE, because the row's sentence says a pipeline stands still when every unfinished step
    // is paused. `measured` and `method` stay behind.
    expect(byId.get(blockId)?.data, 'the block lost its state or its pause').toEqual({ state: 'todo', paused: BLOCK_PAUSE })
    expect(byId.get(moduleId)?.data, 'the module lost its checklist').toHaveProperty('parts')
    // THE LABEL, AND ONLY THE LABEL. It shares `data.shortForms` with the by-part structure and the
    // retired key the fixture wrote, and Home draws none of those, so only `label` comes back.
    expect(
      (byId.get(moduleId)?.data as { shortForms?: unknown } | undefined)?.shortForms,
      'the module lost the level-1 label Home draws in a row, or sent the rest of the key back',
    ).toEqual({
      label: { text: MODULE_LABEL, madeFrom: { seq: 6, contentHash: 'cccc' }, writtenBy: 'agent' },
    })
    expect(byId.get(noteId)?.summary, 'the gist the title map draws is gone').toBe('One line the gist draws.')
  })

  it('drops the fields it names as not drawn: paths, context, summary blocks, a note body, a task state', async () => {
    const rows = await homeList()
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get(moduleId)?.data).not.toHaveProperty('paths')
    expect(byId.get(moduleId)?.data).not.toHaveProperty('context')
    expect(byId.get(moduleId)?.data).not.toHaveProperty('summaryBlocks')
    // THE SHORT-FORMS KEY IS CUT TO THE LABEL. These two keys were in the fixture's write and are
    // not on the wire; the exact set that is on the wire is asserted in the case above.
    const forms = (byId.get(moduleId)?.data as { shortForms?: Record<string, unknown> } | undefined)?.shortForms
    expect(forms, 'the module sent no short forms at all, so the label was lost with them').toHaveProperty('label')
    expect(forms, 'the module sent its by-part forms back').not.toHaveProperty('parts')
    expect(forms, 'the module sent a retired form back').not.toHaveProperty('gist')
    expect(byId.get(noteId)?.data).not.toHaveProperty('body')
    expect(byId.get(noteId)?.data).not.toHaveProperty('source')
    expect(byId.get(taskId)?.data).toEqual({})
    for (const row of rows) {
      expect(row, `${row.kind} ${row.id} carried createdAt`).not.toHaveProperty('createdAt')
      expect(row, `${row.kind} ${row.id} carried ownerId`).not.toHaveProperty('ownerId')
      expect(row, `${row.kind} ${row.id} carried incompleteCount`).not.toHaveProperty('incompleteCount')
    }
  })

  it('answers less than the light shape on the same records', async () => {
    const home = JSON.stringify(await homeList()).length
    const light = JSON.stringify(await list('?shape=light')).length
    expect(home, `home ${String(home)} bytes against light ${String(light)}`).toBeLessThan(light)
  })
})

/**
 * THE OTHER SHAPES DO NOT MOVE. The cut is a selection the home page asks for, and the light,
 * session and unshaped replies are read by the records list, the sessions block and the sessions
 * page. Each guard below would go red if a per-kind home cut leaked into it.
 */
describe('the other shapes are unchanged', () => {
  it('light still keeps a module whole and drops a note body', async () => {
    const rows = await list('?shape=light')
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get(moduleId)?.data).toHaveProperty('paths')
    expect(byId.get(moduleId)?.data).toHaveProperty('summaryBlocks')
    expect(byId.get(noteId)?.data).not.toHaveProperty('body')
    expect(byId.get(noteId)?.data).not.toHaveProperty('source')
  })

  it('session still keeps exactly id, kind and the two body keys its reader draws', async () => {
    const rows = await list('?kind=session&shape=session')
    expect(rows.length, 'no session was listed, so its cut proves nothing').toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).filter((key) => !['id', 'kind', 'data'].includes(key))).toEqual([])
      expect(Object.keys(row.data ?? {}).filter((key) => !['state', 'detail'].includes(key))).toEqual([])
    }
    const mine = rows.find((row) => row.id === sessionId)
    expect(mine?.data, 'the session shape lost the state and ending').toEqual({ state: 'crashed', detail: 'exit 137, out of memory' })
  })

  it('the whole list still carries every top-level field', async () => {
    const rows = await list('?shape=full')
    const moduleRow = rows.find((row) => row.id === moduleId)
    expect(moduleRow, 'the module is not in the full list').toBeDefined()
    expect(moduleRow).toHaveProperty('createdAt')
    expect(moduleRow).toHaveProperty('ownerId')
    expect(moduleRow).toHaveProperty('incompleteCount')
    expect(moduleRow?.data).toHaveProperty('paths')
  })
})
