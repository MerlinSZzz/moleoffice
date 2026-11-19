// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAFT → CRITIQUE → PROPOSAL → HUMAN APPROVAL → APPLY, and every gate on the way.
 *
 * The chain the requirement describes ends in the only step that writes to the project, so the
 * assertions here are mostly about what is REFUSED. Four things must be impossible:
 *
 *   applying without a person saying so         — an agent, or a request that named nobody
 *   applying without the fork being settled     — and settled by a HUMAN, not by an agent's link
 *   applying a change set with an open question — the agent said it could not tell; leaving it out
 *                                                 would answer it silently
 *   applying HALF of one                        — a project meaning something nobody approved
 *
 * The last is the one worth the transaction: the test below plants a bad operation in the middle of
 * a good change set and asserts the corpus is byte-identical afterwards.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, settleLinkBypassingTheGate, type TestDb } from './helpers.ts'
import type { Delta } from '../src/shared/delta.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** A proposal carrying a change set, and whether a human has settled it. */
function proposalWith(delta: Delta, settled: 'by-human' | 'by-agent' | 'not-at-all'): string {
  const proposal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: 'What this draft would mean as project structure',
    data: {
      question: 'Should the project take this shape?',
      options: ['a — yes, as written', 'b — no'],
      // HANDED UP BY THE AGENT THAT FILED IT, which is what puts a fork on the owner’s queue since
      // 3 September 2026: a fork an agent files says "an agent" unless the agent names somebody
      // else, because an engineering question is the agent's
      // (`design/messages/ACCEPTANCE.md` W3). Naming the owner here is the agent's own statement and it is
      // the case these tests are about.
      who_settles_it: 'the owner',
      extra: { delta },
    },
    actor: AGENT,
  })
  if (settled !== 'not-at-all') {
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'Yes, as written',
      data: { because: 'it is right' },
      actor: HUMAN,
    })
    if (settled === 'by-human') {
      t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: HUMAN })
    } else {
      // An agent can no longer MAKE this link — `assertMaySettleFork` refuses it at the write path
      // under §36 — so the row is written straight into the tables, which is how one arrives now:
      // from before the gate existed, or out of a restored archive. The apply gate must still
      // refuse it, and that is what this builds the state to prove.
      settleLinkBypassingTheGate(t, {
        fromId: decision.id,
        toId: proposal.id,
        actorType: 'agent',
        actorId: AGENT.id,
      })
    }
  }
  return proposal.id
}

/** Everything the project holds, so "nothing was written" can be asserted rather than assumed. */
function corpus(): string {
  const rows = t.client.sqlite
    .prepare('SELECT id, kind, title, data, updated_at FROM records ORDER BY id')
    .all()
  const links = t.client.sqlite.prepare('SELECT id, from_id, to_id, type FROM links ORDER BY id').all()
  const allocations = t.client.sqlite.prepare('SELECT id FROM allocations ORDER BY id').all()
  return JSON.stringify({ rows, links, allocations })
}

async function apply(id: string, who: 'human' | 'agent' | 'nobody'): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers =
    who === 'nobody'
      ? {}
      : who === 'human'
        ? { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
        : { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }
  const res = await app.inject({ method: 'POST', url: `/api/planning/proposals/${id}/apply`, headers })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

/** A change set that would really do something: a task, an estimate on it, and time next week. */
function goodDelta(): Delta {
  return {
    ops: [
      {
        op: 'create_record',
        says: 'Create the task "Run the baseline"',
        kind: 'task',
        title: 'Run the baseline',
        workspaceId: 'default',
        data: { state: 'todo', effort_hours: 6 },
      },
      {
        op: 'allocate',
        says: 'Give it four hours in week 2026-W36',
        recordId: 'new:0',
        horizon: 'week',
        period: '2026-W36',
        plannedHours: 4,
      },
    ],
  }
}

describe('nothing is applied without a person saying so', () => {
  it('refuses an agent, naming it', async () => {
    const id = proposalWith(goodDelta(), 'by-human')
    const before = corpus()
    const res = await apply(id, 'agent')
    expect(res.status).toBe(403)
    expect(String(res.body['error'])).toContain('claude-code')
    expect(corpus()).toBe(before)
  })

  it('refuses a request that named nobody at all', async () => {
    // Owner decision §36. Silence is not evidence of a person, and this is a governance act.
    const id = proposalWith(goodDelta(), 'by-human')
    const before = corpus()
    const res = await apply(id, 'nobody')
    expect(res.status).toBe(403)
    expect(String(res.body['error'])).toContain('x-mole-office-actor-type')
    expect(corpus()).toBe(before)
  })

  it('refuses a fork nobody has settled', async () => {
    const id = proposalWith(goodDelta(), 'not-at-all')
    const before = corpus()
    const res = await apply(id, 'human')
    expect(res.status).toBe(409)
    expect(String(res.body['error'])).toContain('not been settled')
    expect(corpus()).toBe(before)
  })

  it('refuses a fork settled by an AGENT pointing a decision at it', async () => {
    // The same hole an independent reviewer found in the human queue: writing a decision is refused
    // to agents, but the LINK was not, so an agent could make a fork look settled. Approval means
    // a person made the link, here and on the queue, through one function.
    const id = proposalWith(goodDelta(), 'by-agent')
    const before = corpus()
    const res = await apply(id, 'human')
    expect(res.status).toBe(409)
    expect(String(res.body['error'])).toContain('not been settled')
    expect(corpus()).toBe(before)
  })
})

describe('an open question is not answered by leaving it out', () => {
  it('refuses a change set carrying an unresolved operation, and says which', async () => {
    const delta = goodDelta()
    delta.ops.push({
      op: 'unresolved',
      says: 'Which module carries the baseline?',
      why: 'Two modules mention the baseline and nothing says which owns it.',
    })
    const id = proposalWith(delta, 'by-human')
    const before = corpus()
    const res = await apply(id, 'human')
    expect(res.status).toBe(409)
    expect(String(res.body['error'])).toContain('Which module carries the baseline?')
    expect(corpus()).toBe(before)
  })
})

describe('an approved change set applies, whole, and is attributed', () => {
  it('creates the record, links the allocation to it, and says what it did', async () => {
    const id = proposalWith(goodDelta(), 'by-human')
    const res = await apply(id, 'human')
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const ops = res.body['ops'] as { did: string; id: string }[]
    expect(ops).toHaveLength(2)
    expect(ops[0]?.did).toContain('created task "Run the baseline"')
    expect(ops[1]?.did).toContain('4 hours in 2026-W36')

    // The record really exists, with the estimate the change set asked for.
    const made = t.api.getRecord(ops[0]?.id ?? '')
    expect(made?.title).toBe('Run the baseline')
    expect((made?.data as { effort_hours?: number }).effort_hours).toBe(6)

    // ATTRIBUTED AS THE PERSON, through the ordinary write path — the change log reads like any
    // other work rather than like a machine that wrote records nobody can account for.
    const changes = t.client.sqlite
      .prepare('SELECT actor_type, actor_id FROM changes WHERE record_id = ?')
      .all(ops[0]?.id) as { actor_type: string; actor_id: string }[]
    expect(changes.length).toBeGreaterThan(0)
    for (const row of changes) {
      expect(row.actor_type).toBe('human')
      expect(row.actor_id).toBe(THE_TEST_OFFICES_OWNER.id)
    }
  })
})

describe('half of a change set is never applied', () => {
  it('rolls the whole thing back when one operation in the middle refuses', async () => {
    const delta = goodDelta()
    // Good, good, then one that cannot be made. The corpus must look untouched afterwards.
    delta.ops.push({
      op: 'link',
      says: 'Join it to something that does not exist',
      from: 'new:0',
      to: 'no-such-record',
      type: 'relates_to',
    })
    const id = proposalWith(delta, 'by-human')
    const before = corpus()

    const res = await apply(id, 'human')
    expect(res.status).toBe(409)
    // The refusal names WHICH operation, because a change set is a list and "it failed" is not an
    // answer a person can act on.
    expect(String(res.body['error'])).toContain('Operation 3')
    expect(String(res.body['error'])).toContain('Join it to something that does not exist')

    // THE ASSERTION THIS FILE EXISTS FOR. The task from operation 1 was created before operation 3
    // refused; if the transaction did not hold, it would still be here.
    expect(corpus(), 'part of the change set survived, so the project means something nobody approved').toBe(
      before,
    )
  })

  it('refuses a stale change set rather than writing over newer work', async () => {
    const target = t.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Something already here',
      data: { state: 'todo', effort_hours: 3 },
      actor: AGENT,
    })
    const { versionOf } = await import('../src/server/lib/records.ts')
    const readAt = versionOf(target)

    // Somebody works on it after the change set was proposed.
    t.api.patchRecord(target.id, { dataPatch: { state: 'doing' } }, AGENT)

    const id = proposalWith(
      {
        ops: [
          {
            op: 'set_field',
            says: 'Estimate "Something already here" at 8 hours',
            recordId: target.id,
            field: 'effort_hours',
            value: 8,
            expectVersion: readAt,
          },
        ],
      },
      'by-human',
    )
    const before = corpus()
    const res = await apply(id, 'human')
    expect(res.status).toBe(409)
    expect(String(res.body['error'])).toContain('has changed since this was proposed')
    expect(corpus()).toBe(before)
    // And the newer work is exactly as it was left.
    expect((t.api.getRecord(target.id)?.data as { state?: string }).state).toBe('doing')
  })
})
