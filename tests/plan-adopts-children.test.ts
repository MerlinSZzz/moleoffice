// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILING A PARENT LINE ADOPTS THE WORK ALREADY FILED UNDER IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * Filing a line writes a "part of" link to the item above it only when that item is ALREADY work.
 * Somebody planning coarse to fine files the detail first as often as the other way round, and
 * nothing ever went back to write the link once the parent line was filed. The child's receipt was
 * honest at the time — no link was written — and then the truth quietly changed underneath it.
 *
 * The plan then looked nested on the screen and was FLAT to every total that adds up a tree. One
 * reader's week came out 28.5 hours where the plan said 37.5. Nothing failed: no type error, no
 * failing test, no visible symptom. That is the defect this repository names as its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST STAY TRUE
 * ---------------------------------------------------------------------------------------
 *
 *   1. Filing a parent joins the work already filed directly under it, in the same transaction.
 *   2. The reply SAYS SO. A caller cannot see a link it did not ask for.
 *   3. The arithmetic changes. The tree contributes its envelope, not the sum of its rows — which
 *      is the whole reason the link matters.
 *   4. NOTHING DEEPER IS ADOPTED. The plan says a grandchild is part of its own parent, and linking
 *      it here would be Mole Office inventing structure the document does not state. Filing the middle
 *      item adopts it in turn, and the reply names what is still outside meanwhile.
 *   5. A child that cannot be adopted does not undo the filing, and the reason is in the reply.
 *   6. Nothing is linked where nothing was filed. That is the control: it stops every assertion
 *      above being satisfied by code that links whatever it can reach.
 *
 * Everything goes through the real routes on a throwaway database, because what is being proved is
 * what a caller can make happen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: BuiltServer['app']

const WEEK = '2026-W36'

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

interface Adopted {
  text: string
  recordId: string | null
  linkId: string | null
  why: string | null
}

async function newPlan(body: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

async function fileAsWork(
  planId: string,
  lineId: string,
): Promise<{ status: number; recordId: string; adopted: Adopted[]; note: string; under: Json }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind: 'task', workspaceId: 'default' },
  })
  const body = bodyOf(res)
  return {
    status: res.statusCode,
    recordId: (body['recordId'] ?? '') as string,
    adopted: (body['adopted'] ?? []) as Adopted[],
    note: (body['note'] ?? '') as string,
    under: (body['under'] ?? {}) as Json,
  }
}

async function giveTime(planId: string, lineId: string, hours: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/give-time`,
    payload: { horizon: 'week', period: WEEK, plannedHours: hours },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** What one record is part of, read through the route a reader uses. */
async function partOf(recordId: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/links' })
  expect(res.statusCode, res.body).toBe(200)
  const rows = bodyOf(res)['links'] as { type: string; fromId: string; toId: string }[]
  return rows.filter((row) => row.type === 'part_of' && row.fromId === recordId).map((row) => row.toId)
}

/** The week's total, and the plain sum of its rows beside it. */
async function weekTotal(): Promise<{ plannedHours: number; rowHours: number }> {
  const res = await app.inject({ method: 'GET', url: `/api/planning/week/${WEEK}` })
  expect(res.statusCode, res.body).toBe(200)
  const fit = bodyOf(res)['fit'] as { load: { plannedHours: number; rowHours: number } }
  const load = fit.load
  return { plannedHours: load.plannedHours, rowHours: load.rowHours }
}

const lineOf = (lines: { id: string; text: string }[], text: string): string => {
  const found = lines.find((one) => one.text === text)
  if (found === undefined) throw new Error(`The plan has no line reading ${JSON.stringify(text)}.`)
  return found.id
}

// ============================================================ the child filed before its parent

describe('a child filed before its parent', () => {
  const BODY = ['# Robotics', '## Tray clamp', '- replace the mount'].join('\n')

  it('is made part of the parent when the parent is filed, and the reply says so', async () => {
    const plan = await newPlan(BODY)
    const childLine = lineOf(plan.lines, '- replace the mount')
    const parentLine = lineOf(plan.lines, '## Tray clamp')

    const child = await fileAsWork(plan.id, childLine)
    expect(child.status).toBe(201)
    // AS IT WAS. Filing a child under an unfiled item writes no link, and says why.
    expect(child.under['linkId']).toBeNull()
    expect(await partOf(child.recordId)).toEqual([])

    const parent = await fileAsWork(plan.id, parentLine)
    expect(parent.status).toBe(201)

    // THE LINK IS REAL, read back through the route rather than believed from the reply.
    expect(await partOf(child.recordId)).toEqual([parent.recordId])

    // AND THE REPLY SAID IT. A person who filed the detail first cannot see the join otherwise.
    const took = parent.adopted.filter((one) => one.linkId !== null)
    expect(took).toHaveLength(1)
    expect(took[0]?.recordId).toBe(child.recordId)
    expect(took[0]?.text).toBe('replace the mount')
    expect(parent.note).toContain('replace the mount')
    expect(parent.note).toContain('now part of it')
  })

  it('changes the week, which is the whole reason the link matters', async () => {
    const plan = await newPlan(BODY)
    const childLine = lineOf(plan.lines, '- replace the mount')
    const parentLine = lineOf(plan.lines, '## Tray clamp')

    const before = await weekTotal()
    await fileAsWork(plan.id, childLine)
    await fileAsWork(plan.id, parentLine)
    await giveTime(plan.id, parentLine, 15)
    await giveTime(plan.id, childLine, 5)

    // THE TREE CONTRIBUTES ITS ENVELOPE, NOT THE SUM. Without the link these are two unrelated
    // rows and the week reads 20 — the shape of 28.5 against 37.5, in small numbers.
    //
    // NOTHING IS ASSERTED ABOUT THE LINK HERE, on purpose. The test above proves the link exists;
    // this one has to fail on the ARITHMETIC, so that a link of the wrong type — written, visible,
    // and invisible to every total — cannot pass it.
    const total = await weekTotal()
    expect(total.rowHours - before.rowHours).toBe(20)
    expect(total.plannedHours - before.plannedHours).toBe(15)
  })
})

// ============================================================ what it deliberately does not adopt

describe('what filing does not reach for', () => {
  it('leaves a grandchild to its own parent, and names what is still outside', async () => {
    const plan = await newPlan(['# Robotics', '## Tray clamp', '- replace the mount'].join('\n'))
    const childLine = lineOf(plan.lines, '- replace the mount')
    const middleLine = lineOf(plan.lines, '## Tray clamp')
    const topLine = lineOf(plan.lines, '# Robotics')

    const child = await fileAsWork(plan.id, childLine)
    const top = await fileAsWork(plan.id, topLine)

    // NOT ADOPTED. The plan says the mount is part of the gripper, not of Robotics.
    expect(await partOf(child.recordId)).toEqual([])
    expect(top.adopted.filter((one) => one.linkId !== null)).toHaveLength(0)

    // AND THE REPLY SAYS THE TREE IS NOT WHOLE YET, naming the item that has to be filed.
    const said = top.adopted.filter((one) => one.recordId === null)
    expect(said).toHaveLength(1)
    expect(said[0]?.text).toBe('Tray clamp')
    expect(said[0]?.why).toContain('1 item under IT is filed')
    expect(top.note).toContain('Tray clamp')

    // FILING THE MIDDLE ITEM FINISHES IT, so any order of filing ends with the same tree.
    const middle = await fileAsWork(plan.id, middleLine)
    expect(await partOf(child.recordId)).toEqual([middle.recordId])
    expect(await partOf(middle.recordId)).toEqual([top.recordId])
  })

  it('does not take a record that is already part of something, and still files the line', async () => {
    const first = await newPlan(['# One', '- the wheel'].join('\n'))
    const wheelLine = lineOf(first.lines, '- the wheel')
    const wheel = await fileAsWork(first.id, wheelLine)
    const one = await fileAsWork(first.id, lineOf(first.lines, '# One'))
    expect(await partOf(wheel.recordId)).toEqual([one.recordId])

    // A SECOND PLAN NAMING THE SAME WORK. Pointing a line at work that exists writes no link, so
    // this is a child of "# Two" in the document and part of "One" in the graph.
    const second = await newPlan(['# Two', '- also the wheel'].join('\n'))
    const pointed = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${second.id}/lines/${lineOf(second.lines, '- also the wheel')}`,
      payload: { recordId: wheel.recordId },
    })
    expect(pointed.statusCode, pointed.body).toBe(200)

    const two = await fileAsWork(second.id, lineOf(second.lines, '# Two'))
    // THE FILING HAPPENED. Losing it because of a link written earlier would throw away the thing
    // the person pressed.
    expect(two.status).toBe(201)
    expect(two.recordId).not.toBe('')
    // AND THE WHEEL DID NOT MOVE. It is still part of One, and only of One.
    expect(await partOf(wheel.recordId)).toEqual([one.recordId])
    const refused = two.adopted.filter((row) => row.recordId === wheel.recordId)
    expect(refused).toHaveLength(1)
    expect(refused[0]?.linkId).toBeNull()
    expect(refused[0]?.why).toContain('already part of')
    expect(two.note).toContain('already part of')
  })

  it('links nothing where nothing was filed, and says nothing about it', async () => {
    const plan = await newPlan(['# Robotics', '- replace the mount', '- measure the offset'].join('\n'))
    const top = await fileAsWork(plan.id, lineOf(plan.lines, '# Robotics'))
    expect(top.status).toBe(201)
    // THE CONTROL. Two items are written under this line and neither is work, so there is nothing
    // to join and nothing to report. A reply that named them here would be furniture.
    expect(top.adopted).toEqual([])
    expect(top.note).not.toContain('now part of it')
  })
})
