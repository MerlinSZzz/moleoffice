// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * `GET /api/work` — every piece of work in every project, with its level, its size and its hours.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS, AND HOW EACH PART COULD GO WRONG QUIETLY
 * ---------------------------------------------------------------------------------------
 *
 * The route answers a question no other route answers: what has this person got to do, in every
 * project at once. Five of its promises would fail SILENTLY — the reply would still be a 200 with
 * rows in it, and nothing else in this repository would notice:
 *
 *   1. IT COULD ANSWER ABOUT ONE PROJECT. `listRecords` takes a workspace id, and the sentinel that
 *      asks for all of them is one character. A reply about `default` looks exactly like a reply
 *      about everything, because `default` holds nothing.
 *   2. IT COULD DROP THE LEVEL. A row with no parent chain still reads as a piece of work; it just
 *      cannot be drawn at its level or flattened, which is the whole reason the route exists.
 *   3. IT COULD HIDE A PARENT IN ANOTHER PROJECT. Dropping the odd-looking step is the tidy thing to
 *      do and it would make the work look as if it sat under nothing.
 *   4. IT COULD TURN "NOBODY SIZED IT" INTO ZERO. Zero is a number every total will happily add, and
 *      a week that fits because half its work is unsized is a plan that is wrong and looks right.
 *   5. IT COULD CUT THE LIST IN SILENCE. A short list is not visibly a short list.
 *
 * So every test below asks the running route, over a corpus filed through the product's own write
 * paths, and checks the fact that would otherwise disappear.
 *
 * THE KINDS ARE NOT RETYPED HERE. `WORK_KINDS` is an expression over `KIND_FAMILIES.work` and
 * `ALLOCATABLE_KINDS`, and the test that covers it files one record of every kind in BOTH of those
 * lists — read from the lists themselves — and requires every one of them to come back. A list
 * typed out here would be a third statement of what work is, which is the defect this repository
 * keeps producing.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import { nowStamp } from '../src/shared/time.ts'
import { KIND_FAMILIES } from '../src/shared/work.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import type { WorkListReply, WorkRow } from '../src/server/lib/worklist.ts'

const PANELX = 'panelx'
const ROBOTICS = 'robotics'

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THIS BLOCK. Each describe block gets its own, and none is started at the top of the
 * file, so a block whose answer is about an empty office can have one and closing it can never leave
 * a later block reading a folder that has gone.
 */
function shareOneOffice(): void {
  beforeAll(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: PANELX, title: 'Mole Office' })
    createWorkspace({ id: ROBOTICS, title: 'Robotics' })
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })
}

// ============================================================================ the harness

/** File a record through the product's own write path. */
function file(
  workspaceId: string,
  kind: RecordKind,
  title: string,
  data: Record<string, unknown> = {},
): PanelRecord {
  return t.api.createRecord({ workspaceId, kind, title, data, actor: AGENT })
}

/** Ask the route, and refuse to go on if it did not answer. */
async function readWork(): Promise<WorkListReply> {
  const res = await app.inject({ method: 'GET', url: '/api/work' })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WorkListReply
}

const rowFor = (reply: WorkListReply, id: string): WorkRow | undefined => reply.rows.find((row) => row.id === id)

/** The one row with this id, or a failure naming what did come back. */
function oneRow(reply: WorkListReply, id: string): WorkRow {
  const row = rowFor(reply, id)
  expect(row, `no row for ${id}. The reply holds: ${reply.rows.map((r) => `${r.id} ${r.title}`).join(', ')}`).toBeDefined()
  return row!
}

// ============================================================================ every project

describe('the work list, one office for the file', () => {
  shareOneOffice()

describe('the work list is about the person, not about one project', () => {

  it('carries work from every project in one reply, each row naming its own', async () => {
    const before = await readWork()
    const here = file(PANELX, 'task', 'Write the cross-project work list')
    const there = file(ROBOTICS, 'task', 'Calibrate the wrist camera')

    const reply = await readWork()

    expect(oneRow(reply, here.id).workspaceId).toBe(PANELX)
    expect(oneRow(reply, there.id).workspaceId).toBe(ROBOTICS)
    // THE WHOLE OFFICE, as a difference: this case added exactly two pieces of work.
    expect(reply.counted).toBe(before.counted + 2)
  })

  it('leaves out what is not work, and carries every kind both declarations call work', async () => {
    // Read from the two lists rather than typed out here — see the header. `block` is filed through
    // its pipeline, which is the only way a block can be filed at all.
    const { ALLOCATABLE_KINDS } = await import('../src/server/lib/planning.ts')
    const kinds = [...new Set<string>([...KIND_FAMILIES.work.kinds, ...ALLOCATABLE_KINDS])].sort()

    const pipeline = file(PANELX, 'pipeline', 'Wave 5', { blockIds: [] })
    const filed = new Map<string, string>()
    for (const kind of kinds) {
      if (kind === 'block') {
        const made = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'todo' }, AGENT)
        filed.set(kind, made.block.id)
        continue
      }
      // A checklist is written only through its own doors, so it is made the way they make one.
      if (kind === 'checklist') {
        const { makeAChecklist } = await import('../src/server/lib/checklists.ts')
        filed.set(kind, makeAChecklist({ workspaceId: PANELX, said: { title: 'A checklist to do' }, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id)
        continue
      }
      // The one required field each of these kinds declares, and nothing else.
      const data: Record<string, unknown> =
        kind === 'obligation' ? { due: '2026-09-01' } : kind === 'direction' ? { depth: 'noticed' } : {}
      filed.set(kind, file(PANELX, kind as RecordKind, `A ${kind} to do`, data).id)
    }
    // Two things that are not work: one container and one piece of writing.
    const aNote = file(PANELX, 'note', 'A note about the work', { body: 'not work' })

    const reply = await readWork()

    for (const [kind, id] of filed) {
      expect(rowFor(reply, id), `no row for the ${kind}, which both declarations call work`).toBeDefined()
    }
    expect(rowFor(reply, aNote.id), 'a note is not work and must not be a row').toBeUndefined()
    expect(rowFor(reply, pipeline.id), 'a pipeline is a container, not work, and must not be a row').toBeUndefined()
    expect(reply.kinds).toEqual(kinds)
  })
})

// ============================================================================ the level

describe('every row says what it is part of, so it can be drawn at its level or flattened', () => {

  it('gives a pipeline step the pipeline above it, with the store and the place it sits', async () => {
    const pipeline = file(PANELX, 'pipeline', 'Handover v3', { blockIds: [] })
    const first = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'todo' }, AGENT)
    const second = t.blocks.addBlock(pipeline.id, { name: 'Take the cube', state: 'todo' }, AGENT)

    const reply = await readWork()

    const step = oneRow(reply, second.block.id)
    expect(step.above).toHaveLength(1)
    expect(step.above[0]?.id).toBe(pipeline.id)
    expect(step.above[0]?.title).toBe('Handover v3')
    expect(step.above[0]?.workspaceId).toBe(PANELX)
    expect(step.above[0]?.via).toBe('pipeline order')
    expect(step.above[0]?.position).toBe(2)
    expect(step.aboveStopped, 'the chain is whole, so nothing should be reported as missing').toBeNull()
    // The block's own name rather than its qualified title, which is what a plan row already shows.
    expect(step.name).toBe('Take the cube')
    expect(step.within).toBe('Handover v3')
    expect(oneRow(reply, first.block.id).above[0]?.position).toBe(1)
  })

  it('reads the whole chain outermost first, so its length is how deep the work sits', async () => {
    const goal = file(PANELX, 'module', 'The gripper', { context: 'it drops the cube', parts: [] })
    const middle = file(PANELX, 'task', 'Replace the gripper')
    const small = file(PANELX, 'task', 'Order the new fingers')
    const { createLink } = await import('../src/server/lib/records.ts')
    createLink({ fromId: middle.id, toId: goal.id, type: 'part_of', actor: AGENT })
    createLink({ fromId: small.id, toId: middle.id, type: 'part_of', actor: AGENT })

    const reply = await readWork()

    expect(oneRow(reply, small.id).above.map((s) => s.title)).toEqual(['The gripper', 'Replace the gripper'])
    expect(oneRow(reply, middle.id).above.map((s) => s.title)).toEqual(['The gripper'])
    expect(oneRow(reply, small.id).above[0]?.via).toBe('part of link')
  })

  it('says in words when the chain above is not the whole chain', async () => {
    // Two parents. `ancestorsOf` refuses to choose between them and says so, and the row has to
    // carry that sentence rather than reporting a chain it could not finish walking.
    const one = file(PANELX, 'module', 'The gripper', { context: 'x', parts: [] })
    const two = file(PANELX, 'module', 'The wrist', { context: 'y', parts: [] })
    const task = file(PANELX, 'task', 'Replace the fingers')
    const { createLink } = await import('../src/server/lib/records.ts')
    createLink({ fromId: task.id, toId: one.id, type: 'part_of', actor: AGENT })
    // The second link is written straight into the store: `createLink` refuses a second parent, and
    // what is being tested here is what the READER does with data that already holds one.
    t.client.sqlite
      .prepare(
        'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
          `VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, 'part_of', 0, 'agent:test')`,
      )
      .run('lnk-second-parent', PANELX, nowStamp(), nowStamp(), task.id, two.id)

    const row = oneRow(await readWork(), task.id)

    expect(row.aboveStopped, 'a chain that could not be walked has to say so').not.toBeNull()
    expect(row.aboveStopped).toContain('The gripper')
    expect(row.aboveStopped).toContain('The wrist')
  })
})

// ============================================================================ across a boundary

describe('a parent in another project is shown, never hidden', () => {

  it('names the other project on the step and on the row', async () => {
    const parent = file(ROBOTICS, 'module', 'The gripper', { context: 'it drops the cube', parts: [] })
    const child = file(PANELX, 'task', 'Order the new fingers')
    // Written straight into the store because `createLink` refuses a link whose ends are in two
    // projects. Rows like this exist: lib/move.ts names five of them, written before that refusal.
    t.client.sqlite
      .prepare(
        'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
          `VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, 'part_of', 0, 'agent:test')`,
      )
      .run('lnk-crossing', PANELX, nowStamp(), nowStamp(), child.id, parent.id)

    const row = oneRow(await readWork(), child.id)

    expect(row.above.map((s) => s.id)).toEqual([parent.id])
    expect(row.above[0]?.workspaceId).toBe(ROBOTICS)
    expect(row.parentsInOtherProjects).toEqual([ROBOTICS])
    // And a row whose parents are all its own says so with an empty list rather than with nothing.
    const same = file(PANELX, 'task', 'A task with no parent at all')
    expect(oneRow(await readWork(), same.id).parentsInOtherProjects).toEqual([])
  })
})

// ============================================================================ size and hours

describe('how big it is, and the hours it already has', () => {

  it('reports an unsized piece of work as null, never as zero', async () => {
    const sized = file(PANELX, 'task', 'Rewrite the table', { effort_hours: 4 })
    const unsized = file(PANELX, 'task', 'Read the audit')

    const reply = await readWork()

    expect(oneRow(reply, sized.id).estimateHours).toBe(4)
    expect(oneRow(reply, unsized.id).estimateHours).toBeNull()
    expect(oneRow(reply, unsized.id).estimateHours, 'zero would mean somebody sized it at nothing').not.toBe(0)
  })

  it('carries every allocation the work has, by horizon and period, month before week before day', async () => {
    const task = file(PANELX, 'task', 'Rewrite the table', { effort_hours: 12 })
    for (const [horizon, period, hours] of [
      ['day', '2026-09-07', 3],
      ['month', '2026-09', 12],
      ['week', '2026-W37', 8],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/planning/allocations',
        payload: { horizon, period, recordId: task.id, plannedHours: hours },
      })
      expect(res.statusCode, res.body).toBe(201)
    }

    const row = oneRow(await readWork(), task.id)

    expect(row.hoursGiven.map((h) => `${h.horizon} ${h.period} ${String(h.plannedHours)}`)).toEqual([
      'month 2026-09 12',
      'week 2026-W37 8',
      'day 2026-09-07 3',
    ])
    // The hours are listed and never added: 12, 8 and 3 answer three different questions.
    expect(row.estimateHours).toBe(12)
  })

  it('gives work with no hours an empty list rather than a zero', async () => {
    const task = file(PANELX, 'task', 'Nobody has scheduled this')
    expect(oneRow(await readWork(), task.id).hoursGiven).toEqual([])
  })
})

// ============================================================================ the three marks

/**
 * THE THREE THINGS A ROW SAYS ABOUT THE RECORD ITSELF, AND THE EMPTY ANSWER EACH OF THEM HAS.
 *
 * The cross-project work page asked for all three by name and said on screen that it could not draw
 * them, which was the honest thing to do and not a thing to leave standing: without `origin` it
 * cannot mark a made-up fixture record, and 290 of one project's 385 records came in that way.
 *
 * ALL THREE FAIL QUIETLY IF THEY ARE GOT WRONG, and in the same direction — an absence read as a
 * fact somebody established:
 *
 *   origin          null read as `authored` makes fixture content read as observed work.
 *   incompleteCount a record with unfilled fields drawn as a complete one.
 *   due             "this kind has no due date" drawn as "nothing is owed by any date".
 */
describe('every row says how the record got here, what is unfilled, and when it is owed', () => {

  it('carries the origin stamp, and leaves an unstamped record unstamped', async () => {
    const authored = file(PANELX, 'task', 'Filed by somebody doing the work')
    const fixture = t.api.createRecord({
      workspaceId: PANELX,
      kind: 'task',
      title: 'Filed by the generated fixture',
      data: {},
      origin: 'fixture',
      actor: AGENT,
    })
    // A row nobody has stamped. Written straight into the column because `createRecord` stamps
    // every record it makes; the rows that carry nothing were written before the column existed,
    // and the live corpus has them.
    const unstamped = file(PANELX, 'task', 'Filed before anybody was asked')
    t.client.sqlite.prepare('UPDATE records SET origin = NULL WHERE id = ?').run(unstamped.id)

    const reply = await readWork()

    expect(oneRow(reply, authored.id).origin).toBe('authored')
    expect(oneRow(reply, fixture.id).origin).toBe('fixture')
    expect(oneRow(reply, unstamped.id).origin, 'null is nobody having said, and it is not "authored"').toBeNull()
  })

  it('counts the fields its kind says it should have and nobody has filled in', async () => {
    // An obligation declares `due` as required. Filing one without it is allowed and reported as
    // incomplete — the record exists and something is missing from it, which are both true.
    const missing = file(PANELX, 'obligation', 'Send the reviewers the video')
    const whole = file(PANELX, 'obligation', 'Return the borrowed gauge', { due: '2026-09-01' })

    const reply = await readWork()

    expect(oneRow(reply, missing.id).incompleteCount).toBeGreaterThan(0)
    expect(oneRow(reply, whole.id).incompleteCount, 'nothing is unfilled, and zero is a real answer').toBe(0)
    // The same count the record's own page shows, from the same reader.
    const { incompletenessOf } = await import('../src/server/lib/records.ts')
    expect(oneRow(reply, missing.id).incompleteCount).toBe(incompletenessOf(missing).length)
  })

  it('carries a due date, tells "nobody wrote one" from "this kind has none", and works out no lateness', async () => {
    const dated = file(PANELX, 'obligation', 'Return the borrowed gauge', { due: '2026-09-01' })
    const undated = file(PANELX, 'obligation', 'Send the reviewers the video')
    const aTask = file(PANELX, 'task', 'Rewrite the table')

    const reply = await readWork()

    expect(oneRow(reply, dated.id).due).toEqual({ when: 'date', date: '2026-09-01' })
    // The field exists on this kind and nobody filled it in. That is about the RECORD.
    expect(oneRow(reply, undated.id).due).toEqual({ when: 'unstated' })
    // A task has no due date field at all. That is about the KIND, and a page drawing "no due date"
    // over it would be claiming somebody looked.
    expect(oneRow(reply, aTask.id).due, 'a kind with no due field must not report an unstated one').toBeNull()
    // Lateness is not in the row: it needs a "now", and every row on one screen has to measure
    // against the reader's clock rather than against a server clock that is stale on arrival.
    expect(Object.keys(oneRow(reply, dated.id))).not.toContain('lateMs')
  })

  it('says all three in the reply\'s own words, so a caller reads them before drawing them', async () => {
    file(PANELX, 'task', 'One small thing')
    const reply = await readWork()
    const { WORK_ROW_MARKS } = await import('../src/server/lib/worklist.ts')
    expect(reply.note).toContain(WORK_ROW_MARKS)
    expect(WORK_ROW_MARKS).toContain('ORIGIN IS NULL WHEN NOBODY HAS SAID')
    expect(WORK_ROW_MARKS).toContain('NULL WHEN THE KIND HAS NO DUE DATE FIELD')
  })
})

// ============================================================================ the order

describe('the rows are in a stated order, and it is not a ranking', () => {

  it('orders by project, then by what each is part of, then by title', async () => {
    // Filed in a scrambled order on purpose: what comes back must not depend on what was written
    // first, or on `listRecords` answering newest-changed first.
    const before = await readWork()
    const robotics = file(ROBOTICS, 'task', 'Calibrate the wrist camera')
    const pipeline = file(PANELX, 'pipeline', 'Wave 5', { blockIds: [] })
    const second = t.blocks.addBlock(pipeline.id, { name: 'Second', state: 'todo' }, AGENT)
    const loose = file(PANELX, 'task', 'Middle of the alphabet')
    const first = t.blocks.addBlock(pipeline.id, { name: 'First', state: 'todo' }, AGENT)

    const reply = await readWork()

    // THE WHOLE REPLY, read before this case filed anything, and only the rows this case added: they
    // appear in the stated order among themselves. The reading is not narrowed to a kind or a field.
    const heldBefore = new Set(before.rows.map((row) => row.id))
    expect(reply.rows.filter((row) => !heldBefore.has(row.id)).map((row) => row.id)).toEqual([
      // panelx before robotics; inside panelx, "Middle of the alphabet" before "Wave 5", and the
      // two steps under the same pipeline together, in the order of their own titles.
      loose.id,
      first.block.id,
      second.block.id,
      robotics.id,
    ])
    expect(reply.order, 'the order has to be stated, or a reader takes it for a ranking').toContain('NOT A RANKING')
  })
})

// ============================================================================ the cut

describe('a list that was cut says so, and by how much', () => {

  it('carries the first rows of the stated order and names how many are missing', async () => {
    const tasks = ['A', 'B', 'C', 'D'].map((title) => file(PANELX, 'task', `Task ${title}`))
    const { readWorkList, MAX_WORK_ROWS } = await import('../src/server/lib/worklist.ts')

    // THE TOTAL IS THE WHOLE OFFICE'S, read with a cap nothing here can reach, so the count below is
    // the count of the work and not of any reply.
    const whole = readWorkList(MAX_WORK_ROWS)
    const cut = readWorkList(2)

    for (const task of tasks) expect(whole.rows.map((row) => row.id), `the work ${task.id} was filed`).toContain(task.id)
    expect(whole.counted).toBe(whole.returned)
    expect(whole.leftOut).toBe(0)
    expect(whole.note, 'nothing was cut, so nothing should say it was').not.toContain('CUT')

    expect(cut.counted, 'the count is of the work, not of the reply').toBe(whole.counted)
    expect(cut.returned).toBe(2)
    expect(cut.rows).toHaveLength(2)
    expect(cut.leftOut).toBe(whole.counted - 2)
    expect(cut.cap).toBe(2)
    expect(cut.note).toContain('CUT')
    expect(cut.note).toContain(`Pieces of work left out beyond this reply’s row limit: ${String(whole.counted - 2)}.`)
    // The rows kept are the front of the same order, so the cut is at a place a reader can point at.
    expect(cut.rows.map((row) => row.title)).toEqual(whole.rows.slice(0, 2).map((row) => row.title))
  })

  it('answers the route with the cap the route declares, and says so in the reply', async () => {
    const { MAX_WORK_ROWS } = await import('../src/server/lib/worklist.ts')
    file(PANELX, 'task', 'One small thing')
    const reply = await readWork()
    expect(reply.cap).toBe(MAX_WORK_ROWS)
    expect(reply.leftOut).toBe(0)
  })

  it('refuses a cap that is not a number of rows rather than answering something else', async () => {
    const { readWorkList } = await import('../src/server/lib/worklist.ts')
    expect(() => readWorkList(0)).toThrow(/whole number, one or more/)
  })
})

// ============================================================================ the empty answer


// ============================================================================ the front door

describe('GET /api describes this endpoint in the words the route itself declares', () => {

  it("lists it with a sentence, and the sentence is the route's own declaration", async () => {
    const res = await app.inject({ method: 'GET', url: '/api' })
    expect(res.statusCode, res.body).toBe(200)
    const index = res.json() as { endpoints: { method: string; path: string; description: string | null }[] }

    // LOADED HERE AND NOT AT THE TOP OF THE FILE. src/server/api/work.ts reaches the database
    // client, which opens its file the moment it is imported — before freshDb() can say which
    // file. tests/helpers.ts is written around that and this follows it, as WORK_ROW_MARKS
    // above already does.
    const { WORK_NOTE } = await import('../src/server/api/work.ts')
    const entry = index.endpoints.find((e) => e.method === 'GET' && e.path === '/api/work')
    expect(entry, 'GET /api does not list /api/work at all').toBeDefined()
    expect(entry?.description).toBe(WORK_NOTE)
    // The declaration has to say the three things a caller would otherwise have to find out by
    // trying: that it spans projects, that an unsized piece of work is null, and that it can cut.
    expect(WORK_NOTE).toContain('every project')
    expect(WORK_NOTE).toContain('NULL WHEN NOBODY HAS SIZED IT')
    expect(WORK_NOTE).toContain('leftOut')
  })
})
})

describe('an empty work list is an answer', () => {
  shareOneOffice()

  it('says nothing is filed anywhere, rather than handing back a bare empty list', async () => {
    const reply = await readWork()
    expect(reply.rows).toEqual([])
    expect(reply.counted).toBe(0)
    expect(reply.note).toContain('No work is filed in any project')
  })
})
