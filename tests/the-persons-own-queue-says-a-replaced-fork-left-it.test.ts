// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/needs-you` DOES NOT GO ON ASKING A PERSON A QUESTION SOMETHING ELSE HAS REPLACED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS BESIDE THE ONES THAT ALREADY TEST THIS
 * ---------------------------------------------------------------------------------------
 *
 * Problem `lgcrmxPcWG9h` was filed against `GET /api/needs-you`: a fork something superseded was
 * still in the queue and `leftTheQueue` was an empty list. It was fixed on the reading — `readForks`
 * in src/server/lib/forks.ts — and `tests/a-fork-that-stopped-being-asked.test.ts` and
 * `tests/a-fork-leaves-the-queue-only-on-a-link-that-may-take-it.test.ts` both hold it there.
 *
 * BUT EVERY ONE OF THOSE ASSERTIONS READS `GET /api/forks`. `GET /api/needs-you` is the route the
 * problem names, it is the one the owner's own list is drawn from, and it publishes `leftTheQueue`
 * in its own reply and promises it in its own description. Nothing checked that it does. A reply
 * that stopped carrying the field would leave every existing test green while the fork the owner
 * had already replaced went back to being asked of the owner with no account of why it left.
 *
 * So this is one route-level case, not a second reading of the rule. What a link may do, who may
 * make one, and what happens when the record at the far end is deleted are all settled in the two
 * files above and are deliberately not repeated here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The superseded fork is not among the things only the person can do.
 *   2. The fork that replaced it still is, because replacing a question does not answer it.
 *   3. `leftTheQueue` names the superseded fork, the record that replaced it, who made that link
 *      and when — so nothing leaves the person's list silently.
 *   4. It is not reported as settled. Nobody decided anything.
 *
 * Proved by mutation with a control run of this file first: making `readForks` ignore the link
 * turns every case red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'

const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
})
afterEach(async () => {
  await app.close()
  t.close()
})

/** A fork on the person's own queue, filed by the owner. */
async function fileFork(title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title,
      data: { question: `${title}?`, options: ['a — one way', 'b — the other'] },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** The person's own list, as the route answers it. */
async function whatIsWaitingOnTheOwner(): Promise<NeedsYouReply> {
  const res = await app.inject({ method: 'GET', url: '/api/needs-you', headers: asPerson })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as NeedsYouReply
}

describe('a fork something replaced leaves the person\'s own list, and says why', () => {
  it('takes the replaced one off, keeps the one that replaced it, and names both', async () => {
    const older = await fileFork('Is a module card a boundary')
    const newer = await fileFork('The module-label question, with the two concerns apart')
    // THE CONTROL. Both are waiting on the owner before the link is made, or the case below proves nothing.
    const before = await whatIsWaitingOnTheOwner()
    expect(before.actions.map((one) => one.recordId), 'both forks must start on their list').toEqual(
      expect.arrayContaining([older, newer]),
    )
    expect(before.leftTheQueue).toEqual([])

    const made = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asPerson,
      payload: { fromId: newer, toId: older, type: 'supersedes' },
    })
    expect(made.statusCode, made.body).toBe(201)

    const after = await whatIsWaitingOnTheOwner()
    expect(after.actions.map((one) => one.recordId), 'the replaced fork is still being asked of the owner').not.toContain(older)
    expect(after.actions.map((one) => one.recordId), 'replacing a question does not answer it').toContain(newer)
    expect(after.settled.map((one) => one.proposalId), 'nobody decided anything').not.toContain(older)

    const row = after.leftTheQueue.find((one) => one.proposalId === older)
    expect(row, 'the fork left their list with no account of where it went').toBeDefined()
    expect(row?.why).toBe('superseded')
    expect(row?.insteadId).toBe(newer)
    expect(row?.linkedBy).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(row?.linkedAt, 'nothing says when it was replaced').toBeTruthy()
    // The sentence is what a person reads. It has to name the other record and say nobody decided.
    expect(row?.sentence).toContain(newer)
    const { whyItLeft } = await import('../src/server/lib/forks.ts')
    expect(row?.sentence).toContain(whyItLeft('superseded', 'The module-label question, with the two concerns apart', newer))
  })
})
