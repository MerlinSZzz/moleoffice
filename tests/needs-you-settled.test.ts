// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION YOU SETTLED MUST STILL BE FINDABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG AFTER THE FIRST ONE WAS SETTLED
 * ---------------------------------------------------------------------------------------
 *
 * A settled decision disappeared, and it was hard to review it or to change it.
 *
 * A decision leaving the queue the moment somebody settles it is right: nothing is waiting on
 * anybody any more. Leaving no trace on the page they were looking at is not, and the only way back
 * was to know the record had become a `decision` and go hunting for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS, AND WHY EACH PART OF IT COULD GO WRONG QUIETLY
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/needs-you` now answers both halves: what is waiting, and what has been settled. The
 * risk is that the two halves stop agreeing about what "settled" means — one definition takes a
 * proposal off the queue and a different one decides whether to name it as settled, and then a
 * proposal is on neither list, or on both. Nothing else in this repository would fail.
 *
 * So every test below checks the PAIR. A proposal is on exactly one of the two lists, always, and
 * the thing that moves it between them is the same act the governance rules are written about: a
 * link a stated human made from a live decision back to the proposal.
 *
 * NOTHING NEW IS STORED. There is no `resolved` field and there must not be one — a stored flag
 * beside a link that says otherwise is two statements of one fact. The link is the whole act, which
 * is why deleting the decision puts the proposal straight back onto the queue.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'

const HUMAN_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const AGENT_HEADERS = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }

let t: TestDb
let app: FastifyInstance
let waitingAtTheStart = new Set<string>()
let settledAtTheStart = new Set<string>()

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { needsYouRoutes } = await import('../src/server/api/needs-you.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(needsYouRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  const start = await read()
  waitingAtTheStart = new Set(start.actions.map((one) => one.recordId))
  settledAtTheStart = new Set(start.settled.map((one) => one.proposalId))
})

/** A question an agent filed, and an answer a person wrote. Not yet joined. */
function fork(over: { workspaceId?: string; title?: string } = {}): { proposal: string; decision: string } {
  const proposal = t.api.createRecord({
    workspaceId: over.workspaceId ?? 'default',
    kind: 'proposal',
    title: over.title ?? 'Should the planning layer keep its own capacity table?',
    data: {
      question: 'One capacity table, or capacity as a record kind?',
      options: ['a — its own table', 'b — a record kind'],
    },
    actor: AGENT,
  })
  // Named after the question it answers, so a person reading the two together can see which is
  // which. Not because the product requires it: titles may repeat since 17 August 2026.
  const decision = t.api.createRecord({
    workspaceId: over.workspaceId ?? 'default',
    kind: 'decision',
    title: `Decided: ${over.title ?? 'Planning capacity stays out of the record graph'}`,
    data: { because: 'a plan is person-level and a record is workspace-owned' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  })
  return { proposal: proposal.id, decision: decision.id }
}

async function settle(decision: string, proposal: string, headers: Record<string, string>): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers,
    payload: { fromId: decision, toId: proposal, type: 'derived_from' },
  })
  return res.statusCode
}

async function read(): Promise<NeedsYouReply> {
  const res = await app.inject({ method: 'GET', url: '/api/needs-you' })
  expect(res.statusCode, res.body).toBe(200)
  return JSON.parse(res.body) as NeedsYouReply
}

/**
 * THE ROUTE SPANS EVERY PROJECT, and the office is shared by the cases in this file, so this keeps the
 * whole-office reading and removes only the rows that were already there when the case began.
 */
function added(reply: NeedsYouReply): NeedsYouReply {
  return {
    ...reply,
    actions: reply.actions.filter((one) => !waitingAtTheStart.has(one.recordId)),
    settled: reply.settled.filter((one) => !settledAtTheStart.has(one.proposalId)),
  }
}

describe('what is waiting and what was settled are two halves of one answer', () => {
  it('starts on the waiting list and on neither other list', async () => {
    const { proposal } = fork()
    const reply = added(await read())
    expect(reply.actions.map((a) => a.recordId)).toEqual([proposal])
    expect(reply.settled).toEqual([])
  })

  it('moves to the settled list when a person settles it, and names the decision that answers it', async () => {
    const { proposal, decision } = fork()
    expect(await settle(decision, proposal, HUMAN_HEADERS)).toBe(201)

    const reply = added(await read())
    // OFF the waiting list, which is the behaviour that was already right.
    expect(reply.actions).toEqual([])
    // AND named on the way out, which is what was missing. Both records, so a reader can open the
    // answer or go back to the question it answers.
    expect(reply.settled.length).toBe(1)
    const one = reply.settled[0]
    expect(one?.proposalId).toBe(proposal)
    expect(one?.proposalTitle).toBe('Should the planning layer keep its own capacity table?')
    expect(one?.decisionId).toBe(decision)
    expect(one?.decisionTitle).toBe('Decided: Planning capacity stays out of the record graph')
    expect(one?.settledBy).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(one?.settledAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(one?.workspaceId).toBe('default')
  })

  it('reports the project each one is in, because this route spans every project', async () => {
    // The queue is deliberately not scoped to the project in the switcher — that is the whole
    // reason this route exists — so a settled decision may be somewhere the reader is not, and the
    // line that offers to open it has to be able to say so.
    const { proposal, decision } = fork({ workspaceId: 'default' })
    expect(await settle(decision, proposal, HUMAN_HEADERS)).toBe(201)
    expect(added(await read()).settled[0]?.workspaceId).toBe('default')
  })

  it('does not count a link an agent made, because that is not somebody deciding', async () => {
    // §36: writing a decision is refused to agents and so is the link that settles a fork. If this
    // list counted such a link, a fork would read as settled on Home with nobody having settled it
    // — and the queue, which uses the same reading, would still be showing it as waiting.
    const { proposal, decision } = fork()
    expect(await settle(decision, proposal, AGENT_HEADERS)).toBe(403)

    const reply = added(await read())
    expect(reply.settled).toEqual([])
    expect(reply.actions.map((a) => a.recordId)).toEqual([proposal])
  })

  it('puts it straight back on the waiting list if the decision is deleted', async () => {
    /**
     * A fork whose answer has been withdrawn is a fork again — `proposalResolution` says so, and it
     * is why there is no stored flag. The settled list must agree: a deleted decision named as
     * "settled" while the same proposal sits on the waiting list would be one route giving two
     * answers about one record.
     */
    const { proposal, decision } = fork()
    expect(await settle(decision, proposal, HUMAN_HEADERS)).toBe(201)
    expect(added(await read()).settled.length).toBe(1)

    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${decision}`, headers: HUMAN_HEADERS })
    expect(gone.statusCode, gone.body).toBe(200)

    const reply = added(await read())
    expect(reply.settled, 'a deleted decision is still being reported as settling something').toEqual([])
    expect(reply.actions.map((a) => a.recordId)).toEqual([proposal])
  })

  it('never has one proposal on both lists, however many there are', async () => {
    // The one invariant that makes the pair trustworthy, checked over a mixture rather than over
    // one record: every proposal is on exactly one list.
    const a = fork({ title: 'Fork A' })
    const b = fork({ title: 'Fork B' })
    const c = fork({ title: 'Fork C' })
    expect(await settle(a.decision, a.proposal, HUMAN_HEADERS)).toBe(201)
    expect(await settle(c.decision, c.proposal, HUMAN_HEADERS)).toBe(201)

    const reply = added(await read())
    const waiting = new Set(reply.actions.map((one) => one.recordId))
    const done = new Set(reply.settled.map((one) => one.proposalId))
    for (const id of [a.proposal, b.proposal, c.proposal]) {
      expect(waiting.has(id) !== done.has(id), `proposal ${id} is on both lists or on neither`).toBe(true)
    }
    expect(waiting).toEqual(new Set([b.proposal]))
    expect(done).toEqual(new Set([a.proposal, c.proposal]))
  })

  it('sends the newest first, and breaks a tie the same way on every read', async () => {
    const a = fork({ title: 'Fork A' })
    const b = fork({ title: 'Fork B' })
    expect(await settle(a.decision, a.proposal, HUMAN_HEADERS)).toBe(201)
    expect(await settle(b.decision, b.proposal, HUMAN_HEADERS)).toBe(201)

    const first = added(await read())
    const second = added(await read())
    expect(first.settled.map((one) => one.decisionId)).toEqual(second.settled.map((one) => one.decisionId))
    const stamps = first.settled.map((one) => one.settledAt)
    expect([...stamps].sort((x, y) => y.localeCompare(x))).toEqual(stamps)
  })
})
