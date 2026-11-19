// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
/**
 * A REVIEW GOES TO WHO WROTE THE PAGE, TAKES IN WHAT WAS KEPT BEFORE IT, AND LEAVES OUT WHAT WAS SENT AT ONCE.
 * The owner's first three details are in a message and in record 9BZZVKQxWV9Z.
 * The fourth detail's Discard is here too, because it is a server door.
 *
 *   1. Send in the comment box goes at once and does not enter a review. A comment written with a recipient
 *      addressed outright is not a member, and Not in it says why.
 *   2. A review goes by default to the agent that wrote the page. Change is one write. With no recorded writer it
 *      goes to nobody, and nothing is guessed.
 *   3. Comments kept before the review started, unsent and in no review, join it when it starts, in that write.
 *   4. Discard deletes the comments a collecting review holds, in one write, and the reply says they can be
 *      brought back, because the delete is a mark and not an erasure.
 *
 * These press the doors the panel presses, in a throwaway office.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

/**
 * A PROJECT OF ITS OWN FOR EACH CASE. The agents here are named by a fixed handle, and a handle is
 * unique across every agent a project has ever had. A fresh project per case lets them keep their
 * names in one office shared by the file.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const AS = (handle: string) => ({ ...HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case files its own page, agents, comments and review, so no case
 * reads another's work.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

/** Wait until the wall clock's second has moved on. */
const aSecondLater = () => new Promise((done) => setTimeout(done, 1_100))

const on = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

/** A comment kept the way the comment box keeps one: a message to nobody, about a page. */
const kept = (page: string, body: string) => file(HUMAN, 'message', body, { body, target: on(page) })

/** A comment sent the way the comment box's Send sends one: addressed outright. */
const sentAtOnce = (page: string, body: string, agent: string) =>
  file(HUMAN, 'message', body, { body, target: on(page), to: [{ kind: 'agent', id: agent }] })

interface Detail {
  review: { id: string; state: string }
  members: { id: string }[]
  saved: { id: string }[]
  goesTo: { ground: string; recipient: { agentId: string } | null; name: string | null; elsewhere: string[] }
  says: string
}

/** Start a review on a page. `says` is the start's own sentence; the rest is the review read afterwards. */
async function start(page: string): Promise<Detail> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: { entry: on(page) } })
  expect(res.statusCode, res.body).toBe(201)
  const started = res.json() as { review: { id: string }; says: string }
  return { ...(await read(started.review.id)), says: started.says }
}

async function read(id: string): Promise<Detail> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Detail
}

async function anAgent(title: string, handle: string): Promise<{ record: string; registry: string }> {
  const record = await file(HUMAN, 'agent', title, { handle, runtime: 'claude-code', state: 'active' })
  const res = await app.inject({ method: 'GET', url: '/api/participants', headers: HUMAN })
  const agents = (res.json() as { agents: { id: string; handle: string }[] }).agents
  const registry = agents.find((one) => one.handle === handle)?.id
  expect(registry, `${handle} is not registered`).toBeDefined()
  return { record, registry: registry ?? '' }
}

describe('who a review goes to', () => {
  it('goes to the agent that wrote the page, and one write changes it', async () => {
    const secretary = await anAgent(`${THE_TEST_OFFICES_SECRETARY.name} the reviewer`, `${THE_TEST_OFFICES_SECRETARY.handle}-r15`)
    const vela = await anAgent('Vela the wiring agent', 'vela-r15')
    const page = await file(AS(`${THE_TEST_OFFICES_SECRETARY.handle}-r15`), 'report', 'What the run showed', { for: 'Robin', date: '2026-10-01', blocks: [] })
    const review = await start(page)
    expect(review.goesTo).toMatchObject({ ground: 'wrote-the-page', recipient: { agentId: secretary.record }, name: `${THE_TEST_OFFICES_SECRETARY.name} the reviewer` })

    const changed = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.review.id}/recipient`,
      headers: HUMAN,
      payload: { recipient: { kind: 'agent', agentId: vela.record } },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect((changed.json() as Detail).goesTo).toMatchObject({ ground: 'chosen', recipient: { agentId: vela.record }, name: 'Vela the wiring agent' })

    // ONLY THE PERSON WHO STARTED IT MAY SAY.
    const byAnother = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.review.id}/recipient`,
      headers: AS(`${THE_TEST_OFFICES_SECRETARY.handle}-r15`),
      payload: { recipient: { kind: 'agent', agentId: secretary.record } },
    })
    expect(byAnother.statusCode, byAnother.body).toBe(403)
  })

  it('goes to nobody when nobody is recorded as writing the page, and says so', async () => {
    const page = await file(HUMAN, 'module', 'The gripper', { context: 'x' })
    const review = await start(page)
    expect(review.goesTo).toEqual({ ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] })
  })

  it('sends a kept comment to the agent that wrote the page when nobody chose anybody', async () => {
    const secretary = await anAgent(`${THE_TEST_OFFICES_SECRETARY.name} the reviewer`, `${THE_TEST_OFFICES_SECRETARY.handle}-r15`)
    const page = await file(AS(`${THE_TEST_OFFICES_SECRETARY.handle}-r15`), 'report', 'What the run showed', { for: 'Robin', date: '2026-10-01', blocks: [] })
    const review = await start(page)
    const comment = await kept(page, 'The second figure has no units.')
    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${review.review.id}/send`, headers: HUMAN })
    expect(plan.statusCode, plan.body).toBe(200)
    const one = (plan.json() as { comments: { id: string; willGo: boolean }[] }).comments.find((c) => c.id === comment)
    expect(one?.willGo, plan.body).toBe(true)
    const done = await app.inject({ method: 'POST', url: `/api/reviews/${review.review.id}/finish-collecting`, headers: HUMAN })
    expect(done.statusCode, done.body).toBe(200)
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.review.id}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    expect(sent.statusCode, sent.body).toBe(200)
    expect((sent.json() as { sent: number }).sent, sent.body).toBe(1)
    expect(secretary.registry).not.toBe('')
  })
})

describe('what a review holds', () => {
  it('takes in the comments kept before it started, in the write that starts it', async () => {
    const page = await file(HUMAN, 'module', 'The gripper', { context: 'x' })
    const first = await kept(page, 'The zero offset disagrees with the log.')
    const second = await kept(page, 'The mount drawing is out of date.')
    // A SECOND LATER, because stamps are to the second and a comment written in the second the review starts is a
    // member by the ordinary rule. These two are only in it if the start took them in.
    await aSecondLater()
    const review = await start(page)
    expect(review.members.map((one) => one.id).sort()).toEqual([first, second].sort())
    expect(review.saved).toEqual([])
    expect(review.says).toContain('It took in 2 comments you kept here before it started.')
  })

  it('leaves out a comment sent at once, and says why', async () => {
    await anAgent(`${THE_TEST_OFFICES_SECRETARY.name} the reviewer`, `${THE_TEST_OFFICES_SECRETARY.handle}-r15`)
    const page = await file(HUMAN, 'module', 'The gripper', { context: 'x' })
    const review = await start(page)
    const keptOne = await kept(page, 'Kept for the review.')
    const sentOne = await sentAtOnce(page, 'Sent at once.', `${THE_TEST_OFFICES_SECRETARY.handle}-r15`)
    const now = await read(review.review.id)
    expect(now.members.map((one) => one.id)).toEqual([keptOne])
    const res = await app.inject({ method: 'GET', url: `/api/reviews/${review.review.id}/not-in-it`, headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const row = (res.json() as { rows: { id: string; clause: string }[] }).rows.find((one) => one.id === sentOne)
    expect(row?.clause, res.body).toBe('sent-on-its-own')
  })

  it('discards what it holds in one write, and says the comments can be brought back', async () => {
    const page = await file(HUMAN, 'module', 'The gripper', { context: 'x' })
    const before = await kept(page, 'Kept before it started.')
    await aSecondLater()
    const review = await start(page)
    const after = await kept(page, 'Written while it collected.')
    const res = await app.inject({ method: 'POST', url: `/api/reviews/${review.review.id}/discard`, headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as { deleted: string[]; says: string; review: Detail }
    expect(reply.deleted.sort()).toEqual([before, after].sort())
    expect(reply.review.members).toEqual([])
    expect(reply.review.review.state).toBe('collecting')
    expect(reply.says).toContain('restore')
    for (const id of [before, after]) {
      const gone = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
      expect(gone.statusCode, gone.body).toBe(200)
      expect((gone.json() as { record: { deletedAt: string | null } }).record.deletedAt, `${id} was not deleted`).not.toBeNull()
    }
  })
})
