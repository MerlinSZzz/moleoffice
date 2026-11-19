// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT REVIEW STEP, over HTTP: facts out, advice back, and nothing changed by either.
 *
 * What these tests are about, one sentence each:
 *
 *   - `GET /api/plans/:id/context` hands over the plan's facts and holds no opinion about it, and
 *     what is STORED is kept apart from what was WORKED OUT.
 *   - The tree in that reply is read out of the Markdown, at the depths the person typed.
 *   - The words handed to an agent name this plan, name the key that puts advice on its page, and
 *     say outright that the agent may not approve anything.
 *   - `GET /api/plans/:id/reviews` finds the advice about THIS plan, from every project, and finds
 *     nothing else.
 *   - THE LINE THAT MAY NOT BE CROSSED: an agent filing advice changes no line of the plan, files no
 *     work, and cannot make its own change set happen.
 *
 * Everything goes through the real routes on a throwaway database, because the boundary being
 * proved is what a caller can and cannot make happen.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import type { Delta } from '../src/shared/delta.ts'

let t: TestDb
let app: BuiltServer['app']

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * The plan every test uses: five heading levels, a numbered list and a nested bullet, which is the
 * shape the owner's own scratch plan had.
 */
const DOCUMENT = [
  '# Robotics',
  '## Tray clamp',
  '- replace gripper',
  '  - order the part',
  '### Calibration',
  'some prose that is not an item',
  '',
  '1. run the baseline',
].join('\n')

/**
 * ONE OFFICE FOR THE FILE. Every case makes its own plan and its own proposals, and where a case
 * reads the whole corpus it takes that reading itself, so a shared database cannot make one case
 * read another's work.
 */
beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

async function makePlan(body = DOCUMENT): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

async function contextOf(id: string, query = ''): Promise<{ status: number; body: Json }> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}/context${query}` })
  return { status: res.statusCode, body: bodyOf(res) }
}

async function reviewsOf(id: string): Promise<{ status: number; body: Json }> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}/reviews` })
  return { status: res.statusCode, body: bodyOf(res) }
}

/** Everything the project holds, so "nothing was written" can be asserted rather than assumed. */
function corpus(): string {
  return JSON.stringify({
    records: t.client.sqlite.prepare('SELECT id, kind, title, data, updated_at FROM records ORDER BY id').all(),
    links: t.client.sqlite.prepare('SELECT id, from_id, to_id, type FROM links ORDER BY id').all(),
    allocations: t.client.sqlite.prepare('SELECT id FROM allocations ORDER BY id').all(),
    lines: t.client.sqlite
      .prepare('SELECT id, text, record_id, remark, updated_at FROM plan_lines ORDER BY position')
      .all(),
    plans: t.client.sqlite.prepare('SELECT id, title, state, updated_at FROM plans ORDER BY id').all(),
  })
}

/** A change set that would really do something, so a refusal is about the gate and not about size. */
function changeSet(): Delta {
  return {
    ops: [
      {
        op: 'create_record',
        says: 'Create the task "Order the gripper part"',
        kind: 'task',
        title: 'Order the gripper part',
        workspaceId: 'default',
        data: { state: 'todo', effort_hours: 2 },
      },
    ],
  }
}

/** An agent files advice about a plan, the way the words handed to it say to. */
function adviseOn(planId: string | null, opts: { delta?: Delta; title?: string } = {}): string {
  const extra: Record<string, unknown> = {}
  if (planId !== null) extra['plan'] = planId
  if (opts.delta !== undefined) extra['delta'] = opts.delta
  const proposal = t.api.createRecord({
    kind: 'proposal',
    workspaceId: 'default',
    title: opts.title ?? 'Two of these lines are the same piece of work',
    data: {
      question: 'Should "replace gripper" and "order the part" be one task or two?',
      options: ['One task, with the ordering as a step.', 'Two tasks, because the part has a lead time.'],
      recommendation: 'Option B — the lead time is the risk.',
      extra,
    },
    actor: AGENT,
  })
  return proposal.id
}

// ============================================================ the facts, going out

describe('the facts an agent needs to review one plan, and no review', () => {
  it('keeps what is stored apart from what was worked out', async () => {
    const plan = await makePlan()
    const { status, body } = await contextOf(plan.id)
    expect(status, JSON.stringify(body)).toBe(200)

    const facts = body['facts'] as Json
    const calculated = body['calculated'] as Json

    // STORED: the document, line for line, exactly as typed.
    const lines = facts['lines'] as { line: { text: string } }[]
    expect(lines.map((row) => row.line.text).join('\n')).toBe(DOCUMENT)

    // WORKED OUT: the tree. It is not in `facts`, because nothing stores it.
    // `structure`, `allocatedThisMonth` and `capacity` are stored rows too: what the drafts context handed an agent,
    // moved here when migration 0196 made every draft a plan.
    expect(Object.keys(facts).sort()).toEqual(['allocatedThisMonth', 'capacity', 'lines', 'nearby', 'plan', 'structure', 'work'])
    expect(calculated['outline']).toBeDefined()
    expect(facts['outline']).toBeUndefined()
  })

  it('reads the tree at the depths the person typed, and leaves prose out of it', async () => {
    const plan = await makePlan()
    const { body } = await contextOf(plan.id)
    const outline = (body['calculated'] as Json)['outline'] as { text: string; depth: number; under: string[] }[]

    const at = (text: string) => outline.find((item) => item.text === text)
    expect(at('Robotics')?.depth).toBe(0)
    expect(at('Tray clamp')?.depth).toBe(1)
    expect(at('replace gripper')?.depth).toBe(2)
    expect(at('order the part')?.depth).toBe(3)
    expect(at('order the part')?.under).toEqual(['Robotics', 'Tray clamp', 'replace gripper'])
    // A numbered item is an item; a paragraph is the writing between items and is not one.
    expect(at('run the baseline')).toBeDefined()
    expect(at('some prose that is not an item')).toBeUndefined()
  })

  it('says which items are already real work and what those records say', async () => {
    const plan = await makePlan()
    const line = plan.lines.find((one) => one.text === '- replace gripper')
    expect(line).toBeDefined()
    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line?.id}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default', data: { state: 'todo', effort_hours: 5 } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const recordId = (bodyOf(filed)['recordId'] as string)

    const { body } = await contextOf(plan.id)
    const work = (body['facts'] as Json)['work'] as { id: string; estimateHours: number | null }[]
    expect(work.map((row) => row.id)).toEqual([recordId])
    expect(work[0]?.estimateHours).toBe(5)

    const outline = (body['calculated'] as Json)['outline'] as { text: string; recordId: string | null }[]
    expect(outline.find((item) => item.text === 'replace gripper')?.recordId).toBe(recordId)
    expect(outline.find((item) => item.text === 'Tray clamp')?.recordId).toBeNull()
    expect((body['calculated'] as Json)['itemsAlreadyWork']).toBe(1)
  })

  it('carries the hours that exist, from the same reader the work list uses', async () => {
    const plan = await makePlan()
    const line = plan.lines.find((one) => one.text === '- replace gripper')
    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line?.id}/file-as-work`,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const given = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line?.id}/give-time`,
      payload: { horizon: 'week', period: '2026-W36', plannedHours: 4 },
    })
    expect(given.statusCode, given.body).toBe(201)

    const { body } = await contextOf(plan.id)
    const work = (body['facts'] as Json)['work'] as { hoursGiven: { period: string; plannedHours: number }[] }[]
    expect(work[0]?.hoursGiven).toEqual([
      { horizon: 'week', period: '2026-W36', plannedHours: 4, actualHours: null, state: 'planned' },
    ])
  })

  it('reads no project until one is named, and says so rather than reading them all', async () => {
    t.api.createRecord({
      kind: 'task',
      workspaceId: 'default',
      title: 'Something already filed',
      data: { state: 'todo' },
      actor: HUMAN,
    })
    const plan = await makePlan()

    const bare = await contextOf(plan.id)
    expect((bare.body['calculated'] as Json)['projectsRead']).toEqual([])
    expect((bare.body['facts'] as Json)['nearby']).toEqual([])
    expect(String(bare.body['note'])).toContain('NO PROJECT WAS READ')

    const asked = await contextOf(plan.id, '?projects=default')
    const nearby = (asked.body['facts'] as Json)['nearby'] as { title: string }[]
    expect(nearby.map((row) => row.title)).toContain('Something already filed')
    expect((asked.body['calculated'] as Json)['projectsRead']).toEqual([
      { workspaceId: 'default', because: 'the request asked for it' },
    ])
  })

  it('refuses a project nobody has rather than reading it as empty', async () => {
    const plan = await makePlan()
    const { status, body } = await contextOf(plan.id, '?projects=no-such-project')
    // `requireWorkspace` is the product's own refusal and it answers 404, naming what does exist.
    // The point of the test is that the name is refused rather than read as a project holding
    // nothing, which would answer "there is no work like that there" about a project nobody has.
    expect(status).toBe(404)
    expect(String(body['error'])).toContain('no-such-project')
  })

  it('changes nothing at all', async () => {
    const plan = await makePlan()
    const before = corpus()
    expect((await contextOf(plan.id, '?projects=default')).status).toBe(200)
    expect(corpus()).toBe(before)
  })
})

// ============================================================ the words handed to an agent

describe('handing the plan to an agent is one press, and the words come from the server', () => {
  it('names this plan, the key that puts advice on its page, and the address just reached', async () => {
    const plan = await makePlan()
    const { body } = await contextOf(plan.id)
    const ask = String(body['ask'])
    expect(ask).toContain('Robotics week')
    expect(ask).toContain(`/api/plans/${plan.id}/context`)
    // The key an agent must write and the key Mole Office looks for are one constant, so this is the
    // whole join between the two ends of the loop.
    expect(ask).toContain(`"plan": "${plan.id}"`)
  })

  it('says outright that the agent may not approve anything', async () => {
    const plan = await makePlan()
    const ask = String((await contextOf(plan.id)).body['ask'])
    expect(ask).toContain('advising and editing with me, not approving on my behalf')
    expect(ask).toContain('Do not write a decision')
  })
})

// ============================================================ the advice, coming back

describe('the advice an agent left about this plan', () => {
  it('finds a proposal that names this plan, and says nothing has changed', async () => {
    const plan = await makePlan()
    const id = adviseOn(plan.id)
    const { status, body } = await reviewsOf(plan.id)
    expect(status, JSON.stringify(body)).toBe(200)
    const reviews = body['reviews'] as { proposal: { id: string }; resolved: boolean }[]
    expect(reviews.map((review) => review.proposal.id)).toEqual([id])
    expect(reviews[0]?.resolved).toBe(false)
    expect(body['waiting']).toBe(1)
    expect(String(body['note'])).toContain('NONE OF IT HAS CHANGED ANYTHING')
  })

  it('leaves out a proposal about a different plan, and one about no plan at all', async () => {
    const mine = await makePlan()
    const other = await makePlan('# Another plan')
    adviseOn(other.id, { title: 'About the other plan' })
    adviseOn(null, { title: 'About the project, not a plan' })
    const wanted = adviseOn(mine.id, { title: 'About this plan' })

    const { body } = await reviewsOf(mine.id)
    const reviews = body['reviews'] as { proposal: { id: string } }[]
    expect(reviews.map((review) => review.proposal.id)).toEqual([wanted])
  })

  it('says what a change set would do before anybody presses anything', async () => {
    const plan = await makePlan()
    adviseOn(plan.id, { delta: changeSet() })
    const { body } = await reviewsOf(plan.id)
    const review = (body['reviews'] as { summary: { creates: number; writes: number } | null }[])[0]
    expect(review?.summary).toMatchObject({ creates: 1, writes: 1, unresolved: 0 })
  })

  it('says when nobody has filed anything, and does not call that a clean bill of health', async () => {
    const plan = await makePlan()
    const { body } = await reviewsOf(plan.id)
    expect(body['reviews']).toEqual([])
    expect(body['waiting']).toBe(0)
    expect(String(body['note'])).toContain('NOT A REVIEW SAYING THE PLAN IS FINE')
  })
})

// ============================================================ the line that may not be crossed

describe('nothing an agent leaves changes the plan or files work on its own', () => {
  it('filing advice with a whole change set on it touches no line and creates no work', async () => {
    const plan = await makePlan()
    const linesBefore = t.client.sqlite
      .prepare('SELECT id, text, record_id, updated_at FROM plan_lines ORDER BY position')
      .all()
    const tasksBefore = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'task'").get()

    adviseOn(plan.id, { delta: changeSet() })

    expect(
      t.client.sqlite.prepare('SELECT id, text, record_id, updated_at FROM plan_lines ORDER BY position').all(),
    ).toEqual(linesBefore)
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'task'").get()).toEqual(
      tasksBefore,
    )
  })

  it('the agent that filed it cannot apply it, and neither can a person until it is settled', async () => {
    const plan = await makePlan()
    const id = adviseOn(plan.id, { delta: changeSet() })
    const before = corpus()

    const byAgent = await app.inject({
      method: 'POST',
      url: `/api/planning/proposals/${id}/apply`,
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(byAgent.statusCode).toBe(403)

    const byPerson = await app.inject({
      method: 'POST',
      url: `/api/planning/proposals/${id}/apply`,
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(byPerson.statusCode).toBe(409)
    expect(String(bodyOf(byPerson)['error'])).toContain('not been settled')

    expect(corpus()).toBe(before)
  })

  it('once the person settles it, the review says so and the change set can be applied', async () => {
    const plan = await makePlan()
    const id = adviseOn(plan.id, { delta: changeSet() })

    const settled = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/promote`,
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { title: 'Two tasks, because the part has a lead time', data: { because: 'the lead time is the risk' } },
    })
    expect(settled.statusCode, settled.body).toBe(201)

    const { body } = await reviewsOf(plan.id)
    const review = (body['reviews'] as { resolved: boolean; settledBy: { id: string }[] }[])[0]
    expect(review?.resolved).toBe(true)
    expect(review?.settledBy).toHaveLength(1)
    expect(body['waiting']).toBe(0)

    const applied = await app.inject({
      method: 'POST',
      url: `/api/planning/proposals/${id}/apply`,
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(applied.statusCode, applied.body).toBe(200)
    expect(
      t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE title = 'Order the gripper part'").get(),
    ).toEqual({ n: 1 })
  })
})
