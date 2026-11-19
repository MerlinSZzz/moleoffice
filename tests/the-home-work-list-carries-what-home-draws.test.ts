// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/work?shape=home CARRIES WHAT THE HOME PAGE DRAWS, AND THE WHOLE LIST KEEPS ITS ROW FIELDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * The home page's first band draws one standing count from `GET /api/work`. HomePage.tsx's
 * `workStanding` reads, per row, `state` (through `progressOf`), `workspaceId` (how many projects
 * the unfinished work sits in) and `hoursGiven` (whether the row was ever given hours), and draws `leftOut`
 * under the count. The reply also declares its row-ceiling arithmetic and omitted identities.
 * The other work-list fields are drawn by `#/work`
 * and `#/plan`, not by Home.
 *
 * Measured on a copy of the owner’s database, 12 September 2026: the whole list is 702,267 bytes, of which
 * `summary` is 230,759, `title` and `name` 95,166 each and `above` 23,441. `?shape=home` answers
 * 62,642.
 *
 * MUTATION THAT MAKES THIS RED. Ignore `shape` in src/server/api/work.ts so the home page is sent
 * the whole list again: the home shape's rows then carry sixteen fields, the per-row assertion
 * below names the extras, and the size guard goes the wrong way.
 *
 * AND THE OTHER DIRECTION. If `readWorkList` itself started dropping a field the whole list needs,
 * the unshaped-reply guard at the end goes red, so the narrowing cannot be bought by changing the
 * list every screen reads.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import type { RecordKind } from '../src/shared/types.ts'
import type { WorkListReply } from '../src/server/lib/worklist.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** File a record through the product's own write path. */
function file(kind: RecordKind, title: string, data: Record<string, unknown> = {}, summary?: string) {
  return t.api.createRecord({ workspaceId: 'panelx', kind, title, summary, data, actor: AGENT })
}

/** Ask the route, shaped or whole, and refuse to go on if it did not answer. */
async function readWork(query = ''): Promise<WorkListReply> {
  const res = await app.inject({ method: 'GET', url: `/api/work${query}` })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WorkListReply
}

/** The fields Home reads and the disclosure every cut reply carries. */
const HOME_TOP = ['rows', 'leftOut', 'subtraction', 'leftOutGroups', 'narrowedByPermission']
const HOME_ROW = ['hoursGiven', 'state', 'workspaceId']

/**
 * Every field the whole list carries. Copied from what `GET /api/work` answers, not from a type, so
 * a field silently dropped from the list every other screen reads is named here.
 */
const WHOLE_TOP = [
  'rows',
  'counted',
  'returned',
  'cap',
  'leftOut',
  'subtraction',
  'leftOutGroups',
  'order',
  'kinds',
  'kindsBecause',
  'note',
  'narrowedByPermission',
]
// Criterion before the provenance DTO ships (yBoxl5bOrJf8):
// OLD: the unshaped work row held exactly the fields below except stateSource.
// NEW: the same fields plus stateSource; HOME_ROW and every prior key stay unchanged.
// WHY: work progress can be derived, so its existing consumers need the canonical reader's source.
const WHOLE_ROW = [
  'above',
  'aboveStopped',
  'due',
  'estimateHours',
  'hoursGiven',
  'id',
  'incompleteCount',
  'kind',
  'name',
  'origin',
  'parentsInOtherProjects',
  'state',
  'stateSource',
  'summary',
  'title',
  'within',
  'workspaceId',
]

describe('GET /api/work?shape=home', () => {
  it('keeps the standing count fields and row-ceiling disclosure, with no extra row fields', async () => {
    // A TASK WITH HOURS, so `hoursGiven` is a real array rather than an empty one, and a second
    // piece so `rows` has more than one member.
    const task = file('task', 'Rewrite the standing count', { effort_hours: 12, state: 'doing' })
    file('obligation', 'A promise owed outside', { due: '2020-03-01', state: 'open' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning/allocations',
      payload: { horizon: 'week', period: '2026-W37', recordId: task.id, plannedHours: 8 },
    })
    expect(res.statusCode, res.body).toBe(201)

    const home = await readWork('?shape=home')
    expect(
      Object.keys(home).sort(),
      'the home shape must keep its count and disclosure fields',
    ).toEqual([...HOME_TOP].sort())
    const whole = await readWork()
    expect(home.subtraction).toEqual(whole.subtraction)
    expect(home.leftOutGroups).toEqual(whole.leftOutGroups)
    expect(home.rows.length, 'the home shape answered no rows, so its cut proves nothing').toBeGreaterThan(0)
    for (const [at, row] of home.rows.entries()) {
      expect(
        Object.keys(row).sort(),
        `home row ${String(at)} carried a row field the standing count does not draw`,
      ).toEqual(HOME_ROW)
    }
    // NON-VACUOUS: the hours really are there for the band's `withHours` count to read.
    const sized = home.rows.find((row) => row.hoursGiven.length > 0)
    expect(sized, 'no row kept the hours it was given').toBeDefined()
  })

  it('answers a good deal less than the whole list on the same records', async () => {
    file(
      'task',
      'Rewrite the standing count',
      { effort_hours: 12, state: 'doing' },
      'A summary nobody on the band draws. '.repeat(20),
    )
    file('obligation', 'A promise owed outside', { due: '2020-03-01', state: 'open' })
    const home = JSON.stringify(await readWork('?shape=home')).length
    const whole = JSON.stringify(await readWork()).length
    expect(home, `home ${String(home)} bytes against whole ${String(whole)}`).toBeLessThan(whole)
  })

  it('refuses a shape it does not have', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/work?shape=everything' })
    expect(res.statusCode).toBe(400)
  })
})

/**
 * THE WHOLE LIST IS THE OTHER HALF OF THE SAME PROMISE. `#/work`, `#/plan` and the pane beside
 * the writing box all draw the whole reply, so narrowing must be a selection the home page asks for
 * and never a change to what the door answers by default.
 */
describe('GET /api/work without a shape', () => {
  it('still carries every top-level field and every row field it carried before', async () => {
    file('task', 'Rewrite the standing count', { effort_hours: 12, state: 'doing' }, 'A summary the work page draws.')

    const whole = await readWork()
    expect(Object.keys(whole).sort(), 'the unshaped reply lost or gained a top-level field').toEqual([...WHOLE_TOP].sort())
    expect(whole.rows.length).toBeGreaterThan(0)
    for (const row of whole.rows) {
      expect(
        Object.keys(row).sort(),
        `${String(row['id'])} lost or gained a field on the unshaped reply`,
      ).toEqual(WHOLE_ROW)
    }
  })
})
