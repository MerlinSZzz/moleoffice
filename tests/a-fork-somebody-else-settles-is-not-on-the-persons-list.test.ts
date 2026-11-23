// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK THE CORPUS SAYS SOMEBODY ELSE SETTLES IS NOT ON THE OWNER'S LIST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED ON 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/forks` read `who_settles_it` and `GET /api/waiting` did not, so the same fork was
 * described one way on the fork desk and the opposite way on the owner's own list. Twelve forks on
 * the owner's list said an agent settles them; the desk said of each "This fork is not yours to settle" and
 * the list said of each "Only you can settle this". The list the owner actually reads was the one that
 * ignored the field. Problem `VpL3AJ9C6ogP` has the numbers: the owner's queue was full of engineering
 * choices that should not have been theirs.
 *
 * The cause was in the probe, not in a missing filter. `GET /api/waiting` works out tier 1 by asking
 * the real guards whether an agent could perform the act. It asked `assertMaySettleFork` about a
 * decision with no fields at all, so the guard refused on the DECISION — "a decision that does not
 * say what it stands on settles nothing" — and never reached the question about the fork. The answer
 * was therefore identical on every row whatever the record said.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT CHANGED, AND IT IS THE HALF THAT WAS FOUND BY ATTACK
 * ---------------------------------------------------------------------------------------
 *
 * An agent still cannot take a fork off the owner's list by classifying it. A fork nobody had classified is
 * the owner's, and a value an agent writes onto it after it was filed is the agent granting itself the
 * authority — three requests that executed exactly that on 27 August 2026 are on
 * `anAgentGaveThisForkItsClassification`. Such a fork stays on the owner's list, and the last test below is
 * what fails if that ever stops being true.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ForksReply } from '../src/server/api/forks.ts'
import type { WaitingReply } from '../src/server/api/waiting.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'

const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}

/** The person, for the one fixture an agent can no longer produce: a fork nobody has classified. */
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

/**
 * A fork filed with whatever classification it is filed with, which is the honest case.
 *
 * WHO FILES IT MOVED ON 3 SEPTEMBER 2026 FOR THE UNCLASSIFIED CASE, and only for that one. A fork an
 * AGENT files now says `who_settles_it: "an agent"` unless the agent names something else, on the
 * owner's instruction that an engineering question is the agent's — `design/messages/ACCEPTANCE.md`
 * W3 — so an agent can no longer file a fork nobody has classified. The person still can, and that
 * is the fork the unclassified cases below are about.
 */
async function fileFork(title: string, settles: string | undefined): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: settles === undefined ? asPerson : asAgent,
    payload: {
      kind: 'proposal',
      title,
      data: {
        question: 'Should the gripper poll time out at 200ms or 500ms?',
        options: ['a — 200ms', 'b — 500ms'],
        ...(settles === undefined ? {} : { who_settles_it: settles }),
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function waiting(): Promise<WaitingReply> {
  const res = await app.inject({ method: 'GET', url: '/api/waiting', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WaitingReply
}

async function desk(): Promise<ForksReply> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ForksReply
}

describe('a fork somebody else settles is not on the owner’s list', () => {
  it('is an open fork under "an agent", is absent from the owner’s list, and the exclusion is counted', async () => {
    const engineering = await fileFork('Which timeout on the gripper poll?', 'an agent')
    const ownersFork = await fileFork('May Mole Office start processes on this machine?', 'the owner')

    // ON THE FORK DESK, BOTH, because nobody has closed either of them. Not the owner's to settle is not
    // the same fact as answered, and the desk goes on carrying it with the field it was filed with.
    const read = await desk()
    expect(read.forks.map((fork) => fork.recordId).sort()).toEqual([engineering, ownersFork].sort())
    const row = one(
      read.forks.filter((fork) => fork.recordId === engineering),
      'the engineering fork on the desk',
    )
    expect(row.fields['who_settles_it']).toBe('an agent')
    expect(row.because).toContain('not yours to settle')

    // ON THE OWNER'S LIST, ONLY THE OWNER'S. This is the one that was wrong: both were here, and the engineering
    // fork carried the sentence "Only you can settle this".
    const list = await waiting()
    const onTheirList = list.items.map((item) => item.id)
    expect(onTheirList, 'a fork an agent may settle is still on the owner’s list').not.toContain(engineering)
    expect(onTheirList, 'the owner’s own fork left the owner’s list').toContain(ownersFork)

    // AND IT IS COUNTED ON THE WAY OUT, in the reply's own words. A list that is short by one is
    // indistinguishable from a complete one unless it says so.
    const left = one(
      list.excluded.filter((group) => group.reason === 'somebody-else-settles-it'),
      'the bucket for forks somebody else settles',
    )
    expect(left.count).toBe(1)
    expect(left.sentence).toContain('somebody other than you settles it')
    expect(list.note).toContain('not counted here')
  })

  it('an agent that classifies a fork itself does NOT take it off the owner’s list, and the desk says so', async () => {
    // THE ATTACK THAT IS STILL REFUSED. The fork was filed with nothing, so it was the owner's; an agent
    // writing the field afterwards is the agent granting itself the authority it is about to use.
    const fork = await fileFork('Does an orphaned session count as over?', undefined)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${fork}`,
      headers: asAgent,
      payload: { dataPatch: { who_settles_it: 'an agent' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    // STILL THE OWNER'S, on the list the owner reads.
    const list = await waiting()
    expect(list.items.map((item) => item.id), 'an agent took a fork off the owner’s list by classifying it').toContain(fork)
    expect(list.excluded.filter((group) => group.reason === 'somebody-else-settles-it')).toEqual([])

    // AND THE DESK SAYS THE SAME THING, which is the half that was lying. It used to read "This
    // fork is not yours to settle" about a fork the guard was still refusing to every agent.
    const row = one(
      (await desk()).forks.filter((one_) => one_.recordId === fork),
      'the fork an agent classified',
    )
    expect(row.because).toContain('an agent wrote that onto it after it was filed')
    expect(row.because).toContain('still reads this one as yours')
    expect(row.because, 'the desk still claims a fork the guard refuses is not the owner’s').not.toContain(
      'This fork is not yours to settle',
    )
  })
})
