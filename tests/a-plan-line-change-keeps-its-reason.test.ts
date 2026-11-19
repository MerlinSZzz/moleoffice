// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN LINE'S ADD, REORDER AND DROP EACH KEEP A REASON. Criterion P3 of
 * design/planning/ACCEPTANCE.md, built on migration 0170 and on the secretary's decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. AN ADD WITH NO REASON IS REFUSED, in one sentence that says what is missing and why it is
 *      asked for, and an add WITH a reason is kept and reads back as `added`.
 *   2. A REORDER WITH NO REASON IS REFUSED, and one with a reason reads back as `reordered` on the
 *      lines whose place among the survivors changed.
 *   3. A DROP WITH NO REASON IS REFUSED, and one with a reason keeps its row after the line is gone
 *      and reads back as `dropped`.
 *   4. THE READ-BACK LISTS A LINE'S CHANGES OLDEST FIRST, each with who made it, when, the kind of
 *      change and the reason, from two different writers.
 *   5. A LINE WITH NO REVISION — one the ledger never saw — reads back as an empty list WITH a
 *      sentence saying the ledger starts when it starts, never as a guess.
 *   6. A TEXT EDIT IS NOT ONE OF THE THREE ACTS. Changing a line's words through the single-line door
 *      needs no reason and keeps no revision.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL RUN, BEFORE THE CODE
 * ---------------------------------------------------------------------------------------
 *
 * A throwaway test asserted today's behaviour first: `POST /api/plans/<plan>/lines` with body
 * `{"text":"- a line"}` and no reason answered 201. With the refusal, the same request answers 400
 * and the line is not written.
 *
 * PROVED BY MUTATION, one product line at a time, after this file's own green control. See the
 * worker's report for the exact mutations and the sha256 before and after each restore.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

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

/** The office's own refusal sentence, in part, so the test reads it and not a zod field error. */
const THE_REFUSAL = 'A reason is required on every add, reorder and drop of a plan line'
/** The sentence an empty read-back carries, in part. */
const THE_LEDGER_STARTS = 'The ledger starts when it starts'

const AS_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-planner' }
const AS_ANOTHER_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'another-planner' }
const AS_HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

interface Line {
  id: string
  text: string
}

/** Start a plan, with or without a body, and hand back its id and its lines. */
async function newPlan(body?: string): Promise<{ id: string; lines: Line[] }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    payload: body === undefined ? { title: `A plan about reasons ${Date.now()}` } : { title: `A plan about reasons ${Date.now()}`, body },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reply = res.json() as { plan: { id: string }; lines: Line[] }
  return { id: reply.plan.id, lines: reply.lines }
}

async function add(
  planId: string,
  text: string,
  reason: string | undefined,
  headers: Record<string, string> = AS_AGENT,
  afterLineId?: string,
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines`,
    headers,
    payload: {
      text,
      ...(reason === undefined ? {} : { reason }),
      ...(afterLineId === undefined ? {} : { afterLineId }),
    },
  })
  return { status: res.statusCode, body: res.json() }
}

async function reorder(
  planId: string,
  lines: { id: string; text: string }[],
  reason: string | undefined,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/plans/${planId}/lines`,
    headers,
    payload: { lines, ...(reason === undefined ? {} : { reason }) },
  })
  return { status: res.statusCode, body: res.json() }
}

async function drop(
  planId: string,
  lineId: string,
  reason: string | undefined,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/plans/${planId}/lines/${lineId}`,
    headers,
    payload: reason === undefined ? {} : { reason },
  })
  return { status: res.statusCode, body: res.json() }
}

/** The lines the plan holds now, in document order. */
async function lines(planId: string): Promise<Line[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}` })
  expect(res.statusCode, res.body).toBe(200)
  // The read hands each line back wrapped with the work it points at; the words are on `.line`.
  return (res.json() as { lines: { line: Line }[] }).lines.map((one) => one.line)
}

/** One line's read-back, exactly as the read-back door answers it. */
async function revisions(
  planId: string,
  lineId: string,
): Promise<{ status: number; revisions: Record<string, unknown>[]; note: string }> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}/lines/${lineId}/revisions` })
  const body = res.json() as { revisions?: Record<string, unknown>[]; note?: string }
  return { status: res.statusCode, revisions: body.revisions ?? [], note: body.note ?? '' }
}

describe('an add keeps its reason, and is refused without one', () => {
  it('refuses the add in one sentence and writes nothing', async () => {
    const plan = await newPlan()
    const refused = await add(plan.id, '- a line', undefined)
    expect(refused.status, refused.body).toBe(400)
    expect(refused.body.error as string).toContain(THE_REFUSAL)
    expect(refused.body.error as string).toContain('Nothing was written')
    expect(await lines(plan.id)).toEqual([])
  })

  it('keeps the reason on an add and reads it back as added', async () => {
    const plan = await newPlan()
    const added = await add(plan.id, '- a line', 'the README was asked for on 4 September')
    expect(added.status, added.body).toBe(201)
    const lineId = (added.body.line as Line).id

    const read = await revisions(plan.id, lineId)
    expect(read.status, read.note).toBe(200)
    expect(read.revisions).toHaveLength(1)
    expect(read.revisions[0]?.['op']).toBe('added')
    expect(read.revisions[0]?.['reason']).toBe('the README was asked for on 4 September')
    expect(read.revisions[0]?.['changedBy']).toBe('agent:a-planner')
    expect(String(read.revisions[0]?.['at'] ?? '').length).toBeGreaterThan(0)
    expect(read.revisions[0]?.['seq']).toBe(1)
  })
})

describe('a reorder keeps its reason, and is refused without one', () => {
  it('refuses the reorder without a reason and leaves the order alone', async () => {
    const plan = await newPlan('one\ntwo')
    const [first, second] = plan.lines
    const refused = await reorder(plan.id, [{ id: second!.id, text: 'two' }, { id: first!.id, text: 'one' }], undefined)
    expect(refused.status, refused.body).toBe(400)
    expect(refused.body.error as string).toContain(THE_REFUSAL)
    expect((await lines(plan.id)).map((line) => line.text)).toEqual(['one', 'two'])
  })

  it('keeps the reason on a reorder and reads it back as reordered', async () => {
    const plan = await newPlan('one\ntwo')
    const [first, second] = plan.lines
    const done = await reorder(
      plan.id,
      [{ id: second!.id, text: 'two' }, { id: first!.id, text: 'one' }],
      'the second part has to come first',
    )
    expect(done.status, done.body).toBe(200)
    expect((await lines(plan.id)).map((line) => line.text)).toEqual(['two', 'one'])

    for (const line of [first!, second!]) {
      const read = await revisions(plan.id, line.id)
      expect(read.revisions, `${line.text} has no reorder revision`).toHaveLength(1)
      expect(read.revisions[0]?.['op']).toBe('reordered')
      expect(read.revisions[0]?.['reason']).toBe('the second part has to come first')
    }
  })
})

describe('a drop keeps its reason, and is refused without one', () => {
  it('refuses the drop without a reason and leaves the line alone', async () => {
    const plan = await newPlan('one\ntwo')
    const refused = await drop(plan.id, plan.lines[0]!.id, undefined)
    expect(refused.status, refused.body).toBe(400)
    expect(refused.body.error as string).toContain(THE_REFUSAL)
    expect((await lines(plan.id)).map((line) => line.text)).toEqual(['one', 'two'])
  })

  it('keeps the reason on a drop, and the line reads it back after it is gone', async () => {
    const plan = await newPlan('one\ntwo')
    const dropped = plan.lines[0]!
    const done = await drop(plan.id, dropped.id, 'this half was folded into the other line')
    expect(done.status, done.body).toBe(200)
    expect((await lines(plan.id)).map((line) => line.text)).toEqual(['two'])

    // THE LINE IS GONE AND ITS REASON IS NOT. That is why `line_id` is not a foreign key.
    const read = await revisions(plan.id, dropped.id)
    expect(read.status, read.note).toBe(200)
    expect(read.revisions).toHaveLength(1)
    expect(read.revisions[0]?.['op']).toBe('dropped')
    expect(read.revisions[0]?.['reason']).toBe('this half was folded into the other line')
  })
})

describe('the read-back lists a line\'s changes oldest first, with who, when and why', () => {
  it('keeps the add before the reorder, from the two writers, in order', async () => {
    const plan = await newPlan('one')
    const first = plan.lines[0]!
    const added = await add(plan.id, '- two', 'the second part', AS_AGENT)
    const second = added.body.line as Line

    const moved = await reorder(
      plan.id,
      [{ id: second.id, text: '- two' }, { id: first.id, text: 'one' }],
      'the new part goes first',
      AS_ANOTHER_AGENT,
    )
    expect(moved.status, moved.body).toBe(200)

    const read = await revisions(plan.id, second.id)
    expect(read.revisions.map((one) => one['op'])).toEqual(['added', 'reordered'])
    expect(read.revisions.map((one) => one['reason'])).toEqual(['the second part', 'the new part goes first'])
    expect(read.revisions.map((one) => one['changedBy'])).toEqual(['agent:a-planner', 'agent:another-planner'])
    expect(read.revisions.map((one) => one['seq'])).toEqual([1, 2])
    for (const one of read.revisions) {
      expect(typeof one['at']).toBe('string')
      expect(String(one['at']).length).toBeGreaterThan(0)
    }
    expect(read.note).toContain('oldest first')
  })
})

describe('a line the ledger never saw', () => {
  it('reads back empty, with the sentence that says the ledger starts when it starts', async () => {
    // A line written with the plan. `createPlan` is the plan's own writing and writes no revision,
    // which is the shape of a line that was already there before migration 0170 existed.
    const plan = await newPlan('one')
    const read = await revisions(plan.id, plan.lines[0]!.id)
    expect(read.status, read.note).toBe(200)
    expect(read.revisions).toEqual([])
    expect(read.note).toContain(THE_LEDGER_STARTS)
    expect(read.note).toContain('will not invent one')
  })

  it('answers 404 for a line id that never existed, rather than inventing an empty ledger', async () => {
    const plan = await newPlan('one')
    const read = await revisions(plan.id, 'a-line-that-never-existed')
    expect(read.status).toBe(404)
  })
})

describe('a text edit is not one of the three acts', () => {
  it('needs no reason and keeps no revision', async () => {
    const plan = await newPlan('one')
    const line = plan.lines[0]!
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      headers: AS_AGENT,
      payload: { text: 'one, revised' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect((await lines(plan.id))[0]!.text).toBe('one, revised')

    const read = await revisions(plan.id, line.id)
    expect(read.revisions).toEqual([])
    expect(read.note).toContain(THE_LEDGER_STARTS)
  })

  it('lets a whole-document save that only edits words through with no reason and no revision', async () => {
    const plan = await newPlan('one\ntwo')
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      headers: AS_HUMAN,
      payload: { body: 'one revised\ntwo' },
    })
    expect(saved.statusCode, saved.body).toBe(200)
    // The edited line is a different row (the words changed), so its own history is genuinely empty:
    // an edit is not an add, a reorder or a drop.
    const now = await lines(plan.id)
    expect(now.map((line) => line.text)).toEqual(['one revised', 'two'])
    const read = await revisions(plan.id, now[0]!.id)
    expect(read.revisions).toEqual([])
    expect(read.note).toContain(THE_LEDGER_STARTS)
  })
})
