// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FORK AN AGENT MAY WRITE, AND THE ONE LINK THAT SETTLES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `decision` is human-only. That is the only access control in the product and it is right: a
 * decision is a governance act, and an agent asserting one would let it launder its own choices
 * into the record where nobody could tell them from the owner's.
 *
 * What that left with nowhere to go is the FORK. Four times during this project's own development
 * an agent reached a real choice, was refused the kind, and wrote a `note` — and nothing queries
 * notes, so a later reader could not tell a question waiting on a person from a choice the person
 * had already made. `proposal` is that queue, with the boundary untouched.
 *
 * The three properties this file pins, because all three are easy to lose to a helpful edit:
 *
 *   1. AN AGENT MAY WRITE A PROPOSAL AND STILL MAY NOT WRITE A DECISION. If `proposal` ever
 *      appears in HUMAN_ONLY_KINDS the queue is pointless; if `decision` ever leaves it the guard
 *      is gone.
 *   2. RESOLUTION IS DERIVED FROM A LINK THAT ALREADY EXISTS, and there is no second stored fact
 *      to disagree with it. A `resolved` field is the thing this kind is declared without.
 *   3. IT IS A FORK, NOT A PLAN. `question` and `options` are what make it one.
 *
 * TWO HALVES. The first is a pure read of the declarations, because the kind declaration IS the
 * enforced contract: `GET /api/kinds` is served from it and a `POST` is validated against it. The
 * second drives the real server, because the two facts that matter most are not statements in a
 * declaration at all — an agent's `decision` is refused, and a fork reads as settled from one link
 * pointing one way. Both used to be checked by looking for words in the kind's own rule strings,
 * which says the product PUBLISHES the right instruction and nothing about whether it follows it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { KIND_SPECS, validateData } from '../src/shared/kinds.ts'
import { HUMAN_ONLY_KINDS, LINK_TYPES, RECORD_KINDS } from '../src/shared/types.ts'
import { familyOf } from '../src/shared/work.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.json() }
}

/** A fork an agent filed, as an agent files one. Returns its id. */
async function aForkAnAgentFiled(question: string): Promise<string> {
  const made = await post(
    '/api/records',
    { kind: 'proposal', title: question, data: { question, options: ['Keep it', 'Cut it'] } },
    AGENT,
  )
  expect(made.status, `an agent could not file a proposal: ${JSON.stringify(made.body)}`).toBeLessThan(300)
  return made.body.record.id as string
}

const proposal = KIND_SPECS.proposal
const keys = proposal.fields.map((field) => field.key)

describe('a proposal is a kind an agent may write', () => {
  it('is one of the record kinds', () => {
    expect([...RECORD_KINDS]).toContain('proposal')
  })

  it('is NOT human-only, and `decision` still is', () => {
    // Both halves in one test on purpose: the value of the kind is exactly that it moves the
    // writable line without moving the guard. Either half alone can pass while the pair is wrong.
    expect(proposal.humanOnly, 'a proposal an agent cannot write is not a queue, it is a second decision kind').toBe(false)
    expect([...HUMAN_ONLY_KINDS]).not.toContain('proposal')
    expect(KIND_SPECS.decision.humanOnly).toBe(true)
    expect([...HUMAN_ONLY_KINDS]).toContain('decision')
  })

  it('is read beside the decision it becomes, not filed under "ideas"', () => {
    expect(familyOf('proposal')).toBe('decisions')
    expect(familyOf('proposal')).toBe(familyOf('decision'))
  })
})

describe('what a proposal holds', () => {
  it('holds the fork: what must be decided, and the options', () => {
    expect(keys).toContain('question')
    expect(keys).toContain('options')
    for (const key of ['question', 'options']) {
      const field = proposal.fields.find((f) => f.key === key)
      expect(field?.required, `data.${key} is what makes this a fork rather than a note, so a proposal without it is incomplete`).toBe(true)
    }
  })

  it('holds a recommendation, its reasoning and its evidence, and asks for none of them', () => {
    // Optional on purpose. A recommendation invented to look decisive is worse than none, because
    // the reader cannot tell it from one that came out of the evidence.
    for (const key of ['recommendation', 'because', 'evidence']) {
      const field = proposal.fields.find((f) => f.key === key)
      expect(field, `a proposal cannot say ${key}`).toBeDefined()
      expect(field?.required, `${key} must not be demanded: a proposal with no view is an honest proposal`).toBe(false)
    }
  })

  it('holds what would reopen the question, under the same name the decision uses', () => {
    // The promotion is then a copy rather than a translation: the human who settles it carries the
    // sentence straight across into the decision's own `revisit_when`.
    expect(keys).toContain('revisit_when')
    expect(KIND_SPECS.decision.fields.map((f) => f.key)).toContain('revisit_when')
  })

  it('HAS NO `resolved` FIELD, AND NO STATE, because whether it is settled is derived', () => {
    // The one that matters. A stored `resolved` beside a link that says otherwise is two statements
    // of one fact with nothing making them agree — the defect this codebase keeps producing — and
    // the one that would go stale is the stored one, because the link is what other queries read.
    expect(keys).not.toContain('resolved')
    expect(keys).not.toContain('state')
    expect(keys).not.toContain('decided')
    expect(keys).not.toContain('status')
  })

  it('has no consequence and no pause, because it can never reach the attention list', () => {
    // A proposal has no state word, so nothing can say it stopped short, so the attention rule can
    // never select one. A `consequence` on it would be a stored field nothing reads. What is urgent
    // about a fork is the WORK waiting on it, which is its own record with its own consequence.
    expect(keys).not.toContain('consequence')
    expect(keys).not.toContain('paused')
  })
})

describe('how a proposal is resolved', () => {
  it('uses a relationship that already exists', () => {
    expect(Object.keys(LINK_TYPES)).toContain('derived_from')
    expect(LINK_TYPES.derived_from.forward).toBe('derived from')
    expect(LINK_TYPES.derived_from.reverse).toBe('source of')
    expect(LINK_TYPES.derived_from.symmetric).toBe(false)
  })

  /**
   * SETTLED IS READ OFF THE LINK, AND THIS DRIVES THE SERVER TO SHOW IT.
   *
   * What this replaces defined a four-line `resolved()` function inside the test and then asserted
   * that function's answers. It proved that the test could write the rule, not that the product
   * had. The same three states are now asked of `GET /api/records/<the fork>`, whose `resolution`
   * key is computed from the stored links every time it is read.
   */
  it('reads as open until a decision links to it, and as settled the moment one does', async () => {
    const fork = await aForkAnAgentFiled('Do we keep the second listener?')
    const before = await get(`/api/records/${fork}`)
    expect(before.body.resolution.resolved, before.body.resolution?.note).toBe(false)

    // The person settles it. `POST /api/records/<fork>/promote` is the human act; it writes the
    // decision and the one link in a transaction.
    const settled = await post(`/api/records/${fork}/promote`, {
      title: 'Keep the second listener',
      data: { because: 'The other machine has no other way in.' },
    })
    expect(settled.status, JSON.stringify(settled.body)).toBeLessThan(300)

    const after = await get(`/api/records/${fork}`)
    expect(after.body.resolution.resolved).toBe(true)
    expect(after.body.resolution.by.map((one: { id: string }) => one.id)).toContain(settled.body.decision.id)

    // NOTHING ON THE PROPOSAL CHANGED. The answer moved and no field of the record did, which is
    // what "derived" means and what a stored `resolved` would have broken.
    expect(Object.keys(after.body.record.data ?? {}).sort()).toEqual(Object.keys(before.body.record.data ?? {}).sort())
    expect(after.body.record.data.question).toBe(before.body.record.data.question)
  })

  /**
   * THE DIRECTION, PROVED BY DOING IT BOTH WAYS ROUND.
   *
   * A directional link read the wrong way round says the proposal was derived from the decision,
   * which reverses which record is the governance act. What this replaces asserted that the kind's
   * rule string contained `"fromId":"<the decision>"` — the product PUBLISHING the right
   * instruction, which is not the product following it. Here the wrong direction is written to the
   * real link route and the fork stays open.
   */
  it('is settled by a link from the decision, and not by the same link the other way round', async () => {
    const fork = await aForkAnAgentFiled('Do we cache the merged environment?')
    const decision = await post('/api/records', {
      kind: 'decision',
      title: 'Cache it for one process',
      data: { replaces: [], because: 'It is read on every request.' },
    })
    expect(decision.status).toBeLessThan(300)
    const decisionId = decision.body.record.id as string

    // BACKWARDS FIRST: the proposal derived from the decision. A real link, accepted by the route,
    // and it settles nothing.
    const backwards = await post('/api/links', { fromId: fork, toId: decisionId, type: 'derived_from' })
    expect(backwards.status, JSON.stringify(backwards.body)).toBeLessThan(300)
    const stillOpen = await get(`/api/records/${fork}`)
    expect(stillOpen.body.resolution.resolved, 'a backwards link settled the fork').toBe(false)

    // AND THE WAY THE PUBLISHED RULE SAYS: from the decision, to the proposal.
    const forwards = await post('/api/links', { fromId: decisionId, toId: fork, type: 'derived_from' })
    expect(forwards.status, JSON.stringify(forwards.body)).toBeLessThan(300)
    const nowSettled = await get(`/api/records/${fork}`)
    expect(nowSettled.body.resolution.resolved).toBe(true)
  })

  /**
   * THE REFUSAL AN AGENT ACTUALLY MEETS.
   *
   * What this replaces looked for the characters `403` in the kind's rule prose. That is the
   * product describing its own guard. This asks the guard.
   */
  it('still refuses to let the agent write the decision itself, and lets it write the fork', async () => {
    const refused = await post('/api/records', { kind: 'decision', title: 'An agent deciding' }, AGENT)
    expect(refused.status).toBe(403)
    // THE REFUSAL SAYS WHAT TO DO INSTEAD, because an agent that only learns "no" files a note and
    // the fork is lost, which is the failure `proposal` was added for.
    const said = JSON.stringify(refused.body).toLowerCase()
    expect(said, `the refusal reads: ${JSON.stringify(refused.body)}`).toContain('proposal')

    const allowed = await post(
      '/api/records',
      { kind: 'proposal', title: 'Which listener?', data: { question: 'Which listener?', options: ['a', 'b'] } },
      AGENT,
    )
    expect(allowed.status, JSON.stringify(allowed.body)).toBeLessThan(300)
    expect(allowed.body.record.kind).toBe('proposal')
  })

  it('publishes the instruction it follows, so an agent reading the schema is not guessing', async () => {
    // THE PROSE IS STILL CHECKED, AND ONLY FOR THE TWO FACTS THE CASES ABOVE DRIVE: which link
    // settles a fork, and that there is no field to set. Four assertions on the exact JSON of the
    // example request used to stand here; they went red when the sentence was rewritten and stayed
    // green when the behaviour changed, which is the wrong way round.
    const kinds = await get('/api/kinds')
    const served = (kinds.body.kinds as { kind: string; rules?: string[] }[]).find((one) => one.kind === 'proposal')
    expect(served, 'the schema an agent reads no longer publishes `proposal` at all').toBeDefined()
    const rules = (served?.rules ?? []).join(' ')
    expect(rules).toContain('derived_from')
    expect(rules).toContain('resolved')
    // AND THE LINE THAT TELLS AN AGENT WHICH WALL IT WILL MEET, served from the same declaration
    // the 403 above comes out of.
    expect(kinds.body.humanOnly).toContain('decision')
    expect(kinds.body.humanOnly).not.toContain('proposal')
  })
})

describe('what the checker does with one', () => {
  it('accepts the example it publishes', () => {
    const result = validateData('proposal', proposal.example)
    expect(result.ok, result.ok ? '' : result.errors.map((e) => `${e.path}: ${e.message}`).join(' | ')).toBe(true)
  })

  it('stores a stub and reports the fork as the part that is missing', () => {
    const result = validateData('proposal', {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.incomplete.map((i) => i.path).sort()).toEqual(['data.options', 'data.question'])
  })

  it('refuses a `resolved` key rather than storing a second answer to the link\'s question', () => {
    const result = validateData('proposal', { question: 'Which one?', options: ['a', 'b'], resolved: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.path)).toContain('data.resolved')
  })
})
