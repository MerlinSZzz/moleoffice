// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT CANNOT TURN SOMEBODY'S WORDS ABOUT TIME INTO HOURS ON THE CALENDAR.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS FILE CLOSES, IN THE NUMBERS THAT MEASURED IT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office keeps three layers apart: what a person wrote about time, what Mole Office made of those words,
 * and what was committed. Only the third is read by arithmetic — it is a row in the allocations
 * table, and every total, every capacity check and every "this week is full" is computed from it.
 *
 * `commitIntent` took an actor and never looked at it. Measured on 25 August 2026 over real HTTP
 * against a copy of the corpus, as `x-mole-office-actor-type: agent`:
 * `POST /api/planning/intents/JeYItSlU1uSg/commit` answered **HTTP 201** and wrote allocation
 * `uQ4wIifPNijC` — a week of the owner's time — into the canonical table. The allocation count went
 * from 10 to 11. `remote-access.md` §6.7 found it; owner decision §36 had said since before then
 * that planning approval and apply need an explicit person, and for apply it had been built.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH DIRECTIONS, BECAUSE A GUARD THAT REFUSES EVERYBODY IS NOT A GUARD
 * ---------------------------------------------------------------------------------------
 *
 * The person still commits, and an agent may still write down what somebody said about time and have
 * Mole Office offer a reading of it. Only the last step is refused. A file that proved refusals alone
 * would pass with the planning screen dead.
 *
 * The arrival half is in tests/governance-from-another-machine.test.ts, driven through a real second
 * listener beside the other four guards.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** The owner, as the browser sends the owner on every request. */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
/** An agent, saying so. */
const AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }

beforeAll(async () => {
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
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

async function post(
  url: string,
  payload: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<Reply> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers,
    ...(payload === undefined ? {} : { payload }),
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

const wrong = (reply: Reply): string => String(reply.body['error'] ?? JSON.stringify(reply.body))

/** Rows in the allocations table, read straight from SQLite. Nothing can hide behind a reply here. */
const allocationRows = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM allocations').get() as { n: number }).n

/** Words about time on a real piece of work, kept and read, waiting for somebody to commit them. */
async function offered(said = '3h next week'): Promise<{ id: string; period: string | null }> {
  const work = t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title: 'Bring the second listener up',
    data: { state: 'todo' },
    actor: { type: 'agent', id: 'claude-code' },
  }).id
  const made = await post('/api/planning/intents', { said, recordId: work }, PERSON)
  expect(made.status, wrong(made)).toBe(201)
  const intent = made.body['intent'] as { id: string; period: string | null }
  return intent
}

describe('committing words into hours', () => {
  it('is refused to an agent, and no allocation is written', async () => {
    const allocations = allocationRows()
    const intent = await offered()
    expect(allocationRows()).toBe(allocations)

    const refused = await post(`/api/planning/intents/${intent.id}/commit`, undefined, AN_AGENT)
    expect(refused.status, wrong(refused)).toBe(403)
    expect(wrong(refused)).toContain('the person’s own act')
    expect(wrong(refused)).toContain('claude-code')
    // AND THE REFUSAL IS THE WHOLE OF IT. A 403 that wrote the row anyway would be worse than no
    // guard: the reply and the calendar would disagree about who scheduled the week.
    expect(allocationRows()).toBe(allocations)
  })

  it('says what was not written and where the words still are', async () => {
    const intent = await offered('3h next week')
    const refused = await post(`/api/planning/intents/${intent.id}/commit`, undefined, AN_AGENT)
    expect(wrong(refused)).toContain('Nothing was scheduled')
    expect(wrong(refused)).toContain('3h next week')
    // The way out an agent can actually take, rather than a refusal it can only report.
    expect(wrong(refused)).toContain('POST /api/planning/intents')
    // And where the person does it, named as the press on the screen rather than as a route.
    expect(wrong(refused)).toContain('Give it that time')
  })

  it('is refused to a request that said who nobody is', async () => {
    // Owner decision §36: an absent header is not evidence that a person made the act, and this is
    // one of the acts it names. Ordinary writes still take silence as the person typing by hand.
    const allocations = allocationRows()
    const intent = await offered()
    const refused = await post(`/api/planning/intents/${intent.id}/commit`, undefined, {})
    expect(refused.status, wrong(refused)).toBe(403)
    expect(wrong(refused)).toContain('sent no actor headers')
    expect(allocationRows()).toBe(allocations)
  })

  it('is refused in a name Mole Office cannot place, and allowed in the one it can', async () => {
    // `type` and `stated` are both the caller's own word for itself, so until the third actor clause
    // existed a caller that typed `human` and any name at all scheduled the owner's week.
    //
    // ASKED OF THE GUARD DIRECTLY, because the clause only fires on a request that came through a
    // door and `app.inject()` comes through none — an injected request is on no socket, so `from` is
    // undefined and the rule does not apply, which is the honest answer for a migration or a script.
    // The version of this driven through real listeners is tests/governance-from-another-machine.
    const intent = await offered()
    const stranger = { type: 'human' as const, id: `not-${THE_TEST_OFFICES_OWNER.id}-at-all`, from: 'this machine' as const }
    let refusal: Error | null = null
    try {
      t.api.assertMayCommitAnIntent({ id: intent.id, said: '3h next week', period: intent.period }, stranger)
    } catch (err) {
      refusal = err as Error
    }
    expect(refusal, 'a name Mole Office cannot place committed hours').not.toBeNull()
    expect((refusal as { status?: number }).status).toBe(403)
    expect(String(refusal?.message)).toContain('not somebody Mole Office can place')

    // AND THE PERSON PANELX DOES HAVE ON FILE IS NOT REFUSED, from the same door. Without this the
    // clause above would pass with "refuse every human" behind it.
    t.api.assertMayCommitAnIntent({ id: intent.id, said: '3h next week', period: intent.period }, {
      type: 'human',
      id: t.api.HUMAN.id,
      from: 'this machine',
    })
  })
})

describe('and the planning screen still works', () => {
  it('lets the person commit, and the hours are written', async () => {
    const allocations = allocationRows()
    const intent = await offered()
    const done = await post(`/api/planning/intents/${intent.id}/commit`, undefined, PERSON)
    expect(done.status, wrong(done)).toBe(201)
    expect((done.body['intent'] as { state: string }).state).toBe('committed')
    expect(allocationRows()).toBe(allocations + 1)
  })

  it('lets an agent write down what somebody said about time, and Mole Office reads it', async () => {
    // THE HALF THAT WOULD BE EASY TO LOSE. An agent translating somebody's words into a kept intent
    // is the eighth rule working as written; what it may not do is the third layer.
    const allocations = allocationRows()
    const work = t.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Photograph every page at four widths',
      data: { state: 'todo' },
      actor: { type: 'agent', id: 'claude-code' },
    }).id
    const made = await post('/api/planning/intents', { said: '2h next week', recordId: work }, AN_AGENT)
    expect(made.status, wrong(made)).toBe(201)
    const kept = made.body['intent'] as { said: string; period: string | null }
    // The words are kept exactly as they arrived, and Mole Office's reading of them is offered beside.
    expect(kept.said).toBe('2h next week')
    expect(kept.period).not.toBeNull()
    // AND STILL NOTHING IS SCHEDULED. That is the whole of the eighth rule's third layer.
    expect(allocationRows()).toBe(allocations)
  })
})
