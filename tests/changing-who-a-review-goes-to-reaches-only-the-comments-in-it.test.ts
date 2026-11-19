// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING WHO A REVIEW GOES TO REACHES THE COMMENTS IN THE REVIEW, AND NO COMMENT SENT ON ITS OWN.
 * The secretary's engineering decision, wave 13r round 16, piece 2.
 *
 *   1. Change, then one contact, says who the whole review goes to. Every comment in the review then goes there:
 *      one nobody chose for follows the review, and one that carried a choice of its own is given the new one.
 *   2. A comment sent on its own keeps its own recipient. That is a comment addressed outright with Send in the
 *      comment box: it is not a member, and Change writes nothing on it.
 *
 * NOT HERE: a kept comment chosen for in the column before the review started, whose words nobody has been handed
 * yet. The review takes it in as saved without sending, so it is in the review and Change gives it the new recipient.
 * Whether that choice should count as sending it on its own is put to the secretary in round 16's report.
 *
 * Three-run proofs (control, mutation, restore) are in round 16's report. The mutations: the loop in
 * `chooseWhoTheReviewGoesTo` taken out (case 1 red); `sentOnItsOwn` answering false (case 2 red).
 *
 * These press the doors the panel presses, in a throwaway office.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let WORKSPACE = 'default'
const theOwner = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
})

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `default-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
})

interface Member {
  id: string
}
interface Detail {
  review: { id: string; state: string }
  members: Member[]
  saved: Member[]
  goesTo: { ground: string; recipient: { agentId: string } | null }
}
interface Stored {
  data: { chosenRecipient?: { agentId?: string } | null; to?: { kind: string; id: string }[] }
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: theOwner(), payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(theOwner(), { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

async function stored(id: string): Promise<Stored> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: theOwner() })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: Stored }).record
}

const on = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

/** A comment kept the way the comment box keeps one: a message to nobody, about a page. */
const kept = (page: string, body: string) => file('message', body, { body, target: on(page) })

/** A comment sent the way the comment box's Send sends one: addressed outright. */
const sentAtOnce = (page: string, body: string, handle: string) =>
  file('message', body, { body, target: on(page), to: [{ kind: 'agent', id: handle }] })

/** The column's Send for one comment: the choice the panel writes on it. */
async function choose(comment: string, agentRecord: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${comment}`,
    headers: theOwner(),
    payload: { dataPatch: { chosenRecipient: { kind: 'agent', agentId: agentRecord } } },
  })
  expect(res.statusCode, res.body).toBe(200)
}

async function anAgent(title: string, handle: string): Promise<string> {
  return file('agent', title, { handle, runtime: 'claude-code', state: 'active' })
}

async function start(page: string): Promise<Detail> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers: theOwner(), payload: { entry: on(page) } })
  expect(res.statusCode, res.body).toBe(201)
  return read((res.json() as { review: { id: string } }).review.id)
}

async function read(id: string): Promise<Detail> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${id}`, headers: theOwner() })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Detail
}

async function change(review: string, agentRecord: string): Promise<Detail> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${review}/recipient`,
    headers: theOwner(),
    payload: { recipient: { kind: 'agent', agentId: agentRecord } },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Detail
}

/** The sentence the review's send plan says under each comment, by comment id. */
async function whatThePlanSays(review: string): Promise<Record<string, string>> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: theOwner() })
  expect(res.statusCode, res.body).toBe(200)
  const comments = (res.json() as { comments: { id: string; says: string }[] }).comments
  return Object.fromEntries(comments.map((one) => [one.id, one.says]))
}

describe('changing who a review goes to', () => {
  it('gives every comment in the review the new recipient, chosen or not', async () => {
    const first = await anAgent('Kiln Keeper', 'kiln-keeper-r16')
    const second = await anAgent('Loom Tender', 'loom-tender-r16')
    const page = await file('module', 'The gripper', { context: 'x' })
    const review = await start(page)
    const followsTheReview = await kept(page, 'The zero offset disagrees with the log.')
    const hadItsOwn = await kept(page, 'The mount drawing is out of date.')
    await choose(hadItsOwn, first)

    const changed = await change(review.review.id, second)
    expect(changed.goesTo).toMatchObject({ ground: 'chosen', recipient: { agentId: second } })
    expect([...changed.members, ...changed.saved].map((one) => one.id).sort()).toEqual([followsTheReview, hadItsOwn].sort())
    expect((await stored(hadItsOwn)).data.chosenRecipient?.agentId).toBe(second)
    const says = await whatThePlanSays(review.review.id)
    expect(says[followsTheReview], JSON.stringify(says)).toContain('Loom Tender')
    expect(says[hadItsOwn], JSON.stringify(says)).toContain('Loom Tender')
  })

  it('leaves a comment sent on its own going where it was sent', async () => {
    await anAgent('Kiln Keeper', 'kiln-keeper-r16')
    const second = await anAgent('Loom Tender', 'loom-tender-r16')
    const page = await file('module', 'The gripper', { context: 'x' })
    const review = await start(page)
    // SENT WITH THE COMMENT BOX'S SEND: addressed outright, while the review collects.
    const fromTheBox = await sentAtOnce(page, 'Sent at once from the comment box.', 'kiln-keeper-r16')
    const inIt = await kept(page, 'Kept for the review.')
    const before = await stored(fromTheBox)

    const changed = await change(review.review.id, second)
    const held = [...changed.members, ...changed.saved].map((one) => one.id)
    expect(held).toContain(inIt)
    expect(held).not.toContain(fromTheBox)
    expect((await stored(fromTheBox)).data).toEqual(before.data)
  })
})
