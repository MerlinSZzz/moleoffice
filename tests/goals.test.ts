// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOAL KIND, THE `serves` LINK, THE AGENT'S MARK, THE SPANS AND THE PLAN GRAPH.
 *
 * Criterion P1 of design/planning/ACCEPTANCE.md
 * (decision JN_pkWYtQhd3).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, IN SIX PARTS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A goal is written and read back at the door with its four horizons, a bad horizon is
 *      refused, and its state, its date and its reason are kept in step.
 *   2. An agent's goal is marked as the agent's until the person presses; an agent that is not a
 *      secretary may not confirm one, and no warrant opens that. A secretary confirming one on the
 *      owner's word is tests/a-secretary-confirms-a-goal-on-the-owners-word.test.ts.
 *   3. Work serves a goal through `serves`: a trajectory, an obligation, a task and a cluster (a
 *      module record) are accepted, anything else is refused in one sentence naming what may serve.
 *   4. A goal anchors the plan graph; a goal nothing serves is named through the omitted path.
 *   5. The three timed spans are settings: NULL means nobody chose and the default applies, an
 *      out-of-range number is refused with the setting named, the person sets them and an agent is
 *      refused. Distant is absent and the reply says why.
 *   6. A distant goal may be changed and the old words and the new are both readable through the
 *      existing revision ledger, with no second history built.
 *   7. The sentence of a goal the person filed or confirmed is the owner's to change, by a
 *      decision. An agent is refused, and an agent's own unconfirmed goal stays its to change.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 * Each one is a single line of product code; the test named beside it is the one that goes red.
 * They are listed in the report with the sha256 of the file before and after.
 *
 *   - `assertMayConfirmAGoal` returning for everybody → "an agent may not set the confirmation".
 *   - `theAgentMarkAsStored` returning null for an agent → "is marked as the agent's".
 *   - The `serves` clause removed from `checkLinkKinds` → "refuses a note as the work that serves".
 *   - The goal cross-check removed from `CROSS_CHECKS` → "refuses a met goal with no date".
 *   - `theGoalSpans` not consulting the row → "a value the person set is read back".
 *   - The unserved-goals block removed from `planGraphRoutes` → "names a goal nothing serves".
 *   - The `goal-what` act removed from `futureActsIn` → the two "refuses an agent" tests of part 7.
 *   - `goalIsConfirmed` inverted in `futureActsIn` → "lets the agent that filed it change it".
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function post(url: string, payload: Record<string, unknown>, headers: Record<string, string> = AS_PERSON): Promise<Reply> {
  const res = await app.inject({ method: 'POST', url, headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function patch(id: string, payload: Record<string, unknown>, headers: Record<string, string> = AS_PERSON): Promise<Reply> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function get(url: string, headers: Record<string, string> = AS_PERSON): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** The stored data of a record just written or read, without a second reader of the shape. */
function dataOf(body: Record<string, unknown>): Record<string, unknown> {
  const record = body['record'] as { data: Record<string, unknown> } | undefined
  if (record === undefined) throw new Error(`no record in ${JSON.stringify(body)}`)
  return record.data
}

/** A complete goal, ready to file. */
function aGoal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'goal',
    title: 'The export survives a large report',
    data: {
      horizon: 'short',
      what: 'A report of any size exports without the browser tab running out of memory.',
      owner: THE_TEST_OFFICES_OWNER.id,
      state: 'open',
      ...extra,
    },
  }
}

// ============================================================================ 1. the goal kind

describe('a goal is a record kind with four horizons and a state', () => {
  it('is declared, its own worked example validates, and an agent may file one', async () => {
    const { KIND_SPECS, validateData } = await import('../src/shared/kinds.ts')
    const { RECORD_KINDS } = await import('../src/shared/types.ts')
    expect(RECORD_KINDS).toContain('goal')
    expect(KIND_SPECS.goal.humanOnly, 'a goal must not be human-only').toBe(false)
    expect(validateData('goal', KIND_SPECS.goal.example).ok, JSON.stringify(KIND_SPECS.goal.example)).toBe(true)
  })

  it('writes and reads back each of the four horizons', async () => {
    for (const horizon of ['short', 'medium', 'long', 'distant']) {
      const { status, body } = await post('/api/records', {
        ...aGoal({ horizon }),
        title: `A ${horizon} goal`,
      })
      expect(status, JSON.stringify(body)).toBe(201)
      const id = (body['record'] as { id: string }).id
      const read = await get(`/api/records/${id}`)
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      expect(dataOf(read.body)['horizon'], `the ${horizon} horizon did not survive the round trip`).toBe(horizon)
    }
  })

  it('refuses a horizon that is not one of the four, and says what they are', async () => {
    const { status, body } = await post('/api/records', aGoal({ horizon: 'eventually' }))
    expect(status, JSON.stringify(body)).toBe(400)
    expect(String(body['error'])).toContain('short')
    expect(String(body['error'])).toContain('distant')
  })

  it('keeps the state, its date and its reason in step', async () => {
    // An open goal has no end to date or explain: both are refused.
    const open = await post('/api/records', aGoal({ state: 'open', state_at: '2026-09-20' }))
    expect(open.status, JSON.stringify(open.body)).toBe(400)
    expect(String(open.body['error'])).toContain('state_at')

    // Met needs both the date and the reason.
    const metNoDate = await post('/api/records', aGoal({ state: 'met', state_because: 'it holds' }))
    expect(metNoDate.status, JSON.stringify(metNoDate.body)).toBe(400)
    expect(String(metNoDate.body['error'])).toContain('state_at')

    const metNoReason = await post('/api/records', aGoal({ state: 'met', state_at: '2026-09-20' }))
    expect(metNoReason.status, JSON.stringify(metNoReason.body)).toBe(400)
    expect(String(metNoReason.body['error'])).toContain('state_because')

    // Both together are stored, and read back.
    const { status, body } = await post('/api/records', aGoal({
      state: 'met',
      state_at: '2026-09-20',
      state_because: 'The 9 MB export ran twice without the tab restarting.',
    }))
    expect(status, JSON.stringify(body)).toBe(201)
    const id = (body['record'] as { id: string }).id
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['state']).toBe('met')
    expect(dataOf(read.body)['state_at']).toBe('2026-09-20')
    expect(dataOf(read.body)['state_because']).toContain('9 MB')
  })
})

// ============================================================================ 2. the agent's mark

describe('an agent\'s goal is marked as the agent\'s until the person confirms it', () => {
  it('is marked with the agent that filed it, from the actor and not from a claim', async () => {
    const { status, body } = await post('/api/records', aGoal(), AS_AGENT)
    expect(status, JSON.stringify(body)).toBe(201)
    const data = dataOf(body)
    expect(data['filed_by'], 'the goal was not marked as the agent\'s').toBe('claude-code')
    expect(data['confirmed_by']).toBeUndefined()

    // A person's goal carries no mark.
    const theirs = await post('/api/records', aGoal(), AS_PERSON)
    expect(dataOf(theirs.body)['filed_by']).toBeUndefined()
  })

  it('refuses an agent that tries to name a different filer', async () => {
    const { status, body } = await post('/api/records', aGoal({ filed_by: 'someone-else' }), AS_AGENT)
    expect(status, JSON.stringify(body)).toBe(403)
    expect(String(body['error'])).toContain('filed_by')
  })

  it('clears the mark when the person presses', async () => {
    const filed = await post('/api/records', aGoal(), AS_AGENT)
    const id = (filed.body['record'] as { id: string }).id
    const pressed = await patch(id, { dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' } } }, AS_PERSON)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['confirmed_by']).toEqual({ by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' })
  })

  it('refuses an agent setting the confirmation, even carrying a warrant', async () => {
    const filed = await post('/api/records', aGoal(), AS_AGENT)
    const id = (filed.body['record'] as { id: string }).id
    const refused = await patch(
      id,
      {
        dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' } },
        warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words: 'I have seen it', where: 'terminal', when: '2026-09-15 20:00', for: [id] },
      },
      AS_AGENT,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(String(refused.body['error'])).toContain('confirmed_by')
  })
})

// ============================================================================ 3. the serves link

describe('work serves a goal through a serves link', () => {
  const make = async (kind: string, title: string, data: Record<string, unknown>): Promise<string> => {
    const { status, body } = await post('/api/records', { kind, title, data })
    expect(status, JSON.stringify(body)).toBe(201)
    return (body['record'] as { id: string }).id
  }
  const aGoalId = async (): Promise<string> => make('goal', 'A goal', {
    horizon: 'medium',
    what: 'The thing is true.',
    owner: THE_TEST_OFFICES_OWNER.id,
    state: 'open',
  })

  it('accepts a trajectory, an obligation, a task and a cluster (a module)', async () => {
    const goal = await aGoalId()
    const work = {
      trajectory: await make('trajectory', 'The intended future', { plannedStateIds: [] }),
      obligation: await make('obligation', 'The report is owed', { due: '2026-09-30', owedTo: 'the reviewer' }),
      task: await make('task', 'Draft the figures', { state: 'doing' }),
      module: await make('module', 'The export subsystem', {}),
    }
    for (const [kind, id] of Object.entries(work)) {
      const { status, body } = await post('/api/links', { fromId: id, toId: goal, type: 'serves' })
      expect(status, `${kind} should be allowed to serve a goal: ${JSON.stringify(body)}`).toBe(201)
    }
  })

  it('refuses a note as the work that serves, in one sentence naming what may serve', async () => {
    const goal = await aGoalId()
    const note = await make('note', 'A note about nothing', {})
    const { status, body } = await post('/api/links', { fromId: note, toId: goal, type: 'serves' })
    expect(status, JSON.stringify(body)).toBe(400)
    const said = String(body['error'])
    for (const allowed of ['trajectory', 'obligation', 'task', 'module']) expect(said).toContain(allowed)
    expect(said).toContain('Nothing was written')
  })

  it('refuses a serves link that points at something that is not a goal', async () => {
    const task = await make('task', 'Draft the figures', { state: 'doing' })
    const module = await make('module', 'Not a goal', {})
    const { status, body } = await post('/api/links', { fromId: task, toId: module, type: 'serves' })
    expect(status, JSON.stringify(body)).toBe(400)
    expect(String(body['error'])).toContain('goal')
  })
})

// ============================================================================ 4. the plan graph

describe('the plan graph starts from goals', () => {
  const WEEK = '2026-W36'

  const make = (kind: string, title: string, data: Record<string, unknown>): string =>
    t.api.createRecord({ workspaceId: PROJECT, kind: kind as never, title, data, actor: t.api.HUMAN }).id

  /**
   * HOW MANY GOALS THE DRAWING SAYS NOTHING SERVES. It is read over the whole project, because that
   * is what the drawing is, and compared with the count this case found before it wrote anything.
   */
  const unservedGoalsIn = (body: Record<string, unknown>): number => {
    const omitted = (body['omitted'] as { what: string; count: number }[] | undefined) ?? []
    return omitted
      .filter((one) => one.what.includes('goal') && one.what.includes('nothing serves'))
      .reduce((n, one) => n + one.count, 0)
  }

  it('draws a goal as an anchor', async () => {
    const goal = make('goal', 'The export survives', {
      horizon: 'short',
      what: 'The export survives a large report.',
      owner: THE_TEST_OFFICES_OWNER.id,
      state: 'open',
    })
    const { status, body } = await get(`/api/plan-graph/week/${WEEK}`)
    expect(status, JSON.stringify(body)).toBe(200)
    const node = (body['nodes'] as { recordId: string; kind: string; drawn: string }[]).find((n) => n.recordId === goal)
    expect(node, 'the goal was not on the drawing').toBeDefined()
    expect(node?.kind).toBe('goal')
    expect(node?.drawn, 'the goal was not an anchor').toBe('anchor')
  })

  it('names a goal nothing serves through the omitted path, and stops naming it once work serves it', async () => {
    const before = unservedGoalsIn((await get(`/api/plan-graph/week/${WEEK}`)).body)
    const goal = make('goal', 'The export survives', {
      horizon: 'short',
      what: 'The export survives a large report.',
      owner: THE_TEST_OFFICES_OWNER.id,
      state: 'open',
    })
    const alone = await get(`/api/plan-graph/week/${WEEK}`)
    const omissions = alone.body['omitted'] as { what: string; count: number }[]
    const named = omissions.find((o) => o.what.includes('goal') && o.what.includes('nothing serves'))
    expect(named, `nothing named the unserved goal: ${JSON.stringify(omissions)}`).toBeDefined()
    expect(unservedGoalsIn(alone.body)).toBe(before + 1)

    const task = make('task', 'Fix the export', { state: 'doing' })
    t.api.createLink({ fromId: task, toId: goal, type: 'serves', actor: t.api.HUMAN })
    const served = await get(`/api/plan-graph/week/${WEEK}`)
    // THIS GOAL LEFT THE COUNT, and no other goal did, so the whole-project count is where it was.
    expect(unservedGoalsIn(served.body)).toBe(before)
    const ids = (served.body['nodes'] as { recordId: string }[]).map((n) => n.recordId)
    expect(ids, 'the work that serves the goal was not drawn').toContain(task)
  })

  it('says role goal for a goal, and draws the trajectory that serves it', async () => {
    const unservedBefore = unservedGoalsIn((await get(`/api/plan-graph/week/${WEEK}`)).body)
    const goal = make('goal', 'The export survives', {
      horizon: 'short',
      what: 'The export survives a large report.',
      owner: THE_TEST_OFFICES_OWNER.id,
      state: 'open',
    })
    const trajectory = make('trajectory', 'The intended future', { plannedStateIds: [] })
    const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
    t.api.createLink({ fromId: trajectory, toId: goal, type: 'serves', actor: t.api.HUMAN })

    const { status, body } = await get(`/api/plan-graph/week/${WEEK}`)
    expect(status, JSON.stringify(body)).toBe(200)
    const nodes = new Map(
      (body['nodes'] as { recordId: string; kind: string; role: string; drawn: string }[]).map((n) => [n.recordId, n]),
    )
    // THE ROLE IS THE GOAL'S OWN. Before criterion P1's drawing half it was drawn as work, which is
    // what the control run for this test measured.
    expect(nodes.get(goal)?.role, 'the goal was drawn as work rather than as a goal').toBe('goal')
    expect(nodes.get(goal)?.kind).toBe('goal')
    expect(nodes.get(owed)?.role).toBe('deadline')
    // THE TRAJECTORY THAT SERVES IT IS DRAWN, though a trajectory is not one of the kinds the
    // ordinary one-link rule calls work: a goal whose serving work was counted would read as a goal
    // with nothing under it.
    expect(nodes.get(trajectory)?.kind, 'the trajectory that serves the goal was not drawn').toBe('trajectory')
    expect(nodes.get(trajectory)?.drawn).toBe('one link from an anchor')
    // And it is served, so the omitted path does not name it as a goal nothing serves: the
    // whole-project count is where this case found it.
    expect(unservedGoalsIn(body)).toBe(unservedBefore)
  })
})

// ============================================================================ 5. the spans

describe('the goal spans are the person\'s setting', () => {
  it('reads NULL as nobody has chosen, and the default applies', async () => {
    const { status, body } = await get('/api/office/goal-spans')
    expect(status, JSON.stringify(body)).toBe(200)
    const spans = body['spans'] as { key: string; inForce: number; nobodyChose: boolean; from: string }[]
    const byKey = new Map(spans.map((s) => [s.key, s]))
    expect(byKey.get('shortGoalDays')?.inForce).toBe(14)
    expect(byKey.get('mediumGoalDays')?.inForce).toBe(60)
    expect(byKey.get('longGoalDays')?.inForce).toBe(365)
    for (const span of spans) {
      expect(span.nobodyChose).toBe(true)
      expect(span.from).toBe('the default')
    }
    // Distant has no control, and the reply says why.
    expect(String(body['distantHasNoLimit'])).toContain('no time limit')
  })

  it('lets the person set one and reads it back, and refuses a number out of range naming the setting', async () => {
    try {
      const set = await post('/api/office/goal-spans', { shortGoalDays: 10 })
      expect(set.status, JSON.stringify(set.body)).toBe(200)
      const short = (set.body['spans'] as { key: string; inForce: number; from: string }[]).find((s) => s.key === 'shortGoalDays')
      expect(short?.inForce).toBe(10)
      expect(short?.from).toBe("the person's setting")

      const tooBig = await post('/api/office/goal-spans', { longGoalDays: 100_001 })
      expect(tooBig.status, JSON.stringify(tooBig.body)).toBe(400)
      expect(String(tooBig.body['error'])).toContain('longGoalDays')

      const tooSmall = await post('/api/office/goal-spans', { mediumGoalDays: 0 })
      expect(tooSmall.status, JSON.stringify(tooSmall.body)).toBe(400)
      expect(String(tooSmall.body['error'])).toContain('mediumGoalDays')
    } finally {
      // THE SPANS ARE THE OFFICE'S, and this case changed one. Put all three back to nobody-chosen
      // so the case about the default sees the office as it found it.
      const putBack = await post('/api/office/goal-spans', { shortGoalDays: null, mediumGoalDays: null, longGoalDays: null })
      expect(putBack.status, JSON.stringify(putBack.body)).toBe(200)
    }
  })

  it('refuses an agent the write, by name', async () => {
    const { status, body } = await post('/api/office/goal-spans', { shortGoalDays: 10 }, AS_AGENT)
    expect(status, JSON.stringify(body)).toBe(403)
    expect(String(body['error'])).toContain('owner')
  })
})

// ============================================================================ 6. the distant revision

describe('a distant goal may be changed and every change is kept', () => {
  it('shows the old words and the new through the existing revision ledger', async () => {
    const filed = await post('/api/records', {
      kind: 'goal',
      title: 'Have a good PhD',
      data: {
        horizon: 'distant',
        what: 'The thesis is defended and the corrections are in.',
        owner: THE_TEST_OFFICES_OWNER.id,
        state: 'open',
      },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const id = (filed.body['record'] as { id: string }).id

    const changed = await patch(id, { dataPatch: { what: 'The thesis is defended, the corrections are in, and the viva is passed.' } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)

    const old = await get(`/api/records/${id}/revisions/1`)
    const next = await get(`/api/records/${id}/revisions/2`)
    expect(old.status, JSON.stringify(old.body)).toBe(200)
    expect(next.status, JSON.stringify(next.body)).toBe(200)
    expect((old.body['content'] as { data: Record<string, unknown> }).data['what']).toBe('The thesis is defended and the corrections are in.')
    expect((next.body['content'] as { data: Record<string, unknown> }).data['what']).toBe(
      'The thesis is defended, the corrections are in, and the viva is passed.',
    )
  })
})

// ============================================================================ 7. a confirmed goal's sentence

describe('the sentence of a goal the person filed or confirmed is the owner’s to change', () => {
  const REFUSAL = 'rewrite the sentence of a goal the person filed or confirmed'
  const OLD_WHAT = (aGoal()['data'] as Record<string, unknown>)['what']
  const NEW_WHAT = 'A report of any size exports in under ten seconds.'

  const idOf = (reply: Reply): string => {
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)
    return (reply.body['record'] as { id: string }).id
  }

  it('refuses an agent rewriting the sentence of an agent-filed goal after the person confirmed it', async () => {
    const id = idOf(await post('/api/records', aGoal(), AS_AGENT))
    const pressed = await patch(id, { dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' } } }, AS_PERSON)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)

    const refused = await patch(id, { dataPatch: { what: NEW_WHAT } }, AS_AGENT)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(String(refused.body['error'])).toContain(REFUSAL)
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['what']).toBe(OLD_WHAT)
  })

  it('refuses an agent rewriting the sentence of a goal the person filed themselves', async () => {
    const id = idOf(await post('/api/records', aGoal(), AS_PERSON))

    const refused = await patch(id, { dataPatch: { what: NEW_WHAT } }, AS_AGENT)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(String(refused.body['error'])).toContain(REFUSAL)
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['what']).toBe(OLD_WHAT)
  })

  it('lets the agent that filed it change it while the person has not confirmed it', async () => {
    const id = idOf(await post('/api/records', aGoal(), AS_AGENT))

    const changed = await patch(id, { dataPatch: { what: NEW_WHAT } }, AS_AGENT)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['what']).toBe(NEW_WHAT)
  })

  it('lets the person change the sentence of a goal they confirmed', async () => {
    const id = idOf(await post('/api/records', aGoal(), AS_AGENT))
    const pressed = await patch(id, { dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' } } }, AS_PERSON)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)

    const changed = await patch(id, { dataPatch: { what: NEW_WHAT } }, AS_PERSON)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const read = await get(`/api/records/${id}`)
    expect(dataOf(read.body)['what']).toBe(NEW_WHAT)
  })
})
