// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN LIST HONOURS THE ACTS THE OWNER'S WORDS AUTHORISED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The write door let an agent settle a fork on the owner's quoted words, and the reading did not
 * know it. `linkTakesThisForkOffTheQueue` asked only whether a HUMAN made the settling link, so a
 * decision an agent filed on the owner's words left the fork open — on the fork desk and on the owner's own list.
 * The same happened to a fork handed to an agent: `anAgentGaveThisForkItsClassification` read every
 * agent's write of `who_settles_it` as the agent granting itself the authority, including a write
 * that quoted the owner.
 *
 * Measured on a copy of the live database on 3 September 2026: `GET /api/waiting` held 67 rows, 50
 * of them under `settle`, and every one of the twelve forks promoted on the owner's words that evening was
 * still there. The mechanism showed no effect anywhere the owner looks. Problem
 * `hYui7zKfGchO`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The rows leave, they are counted on the way out with the reason in words, the fork desk and the
 * list say the same thing about the same fork, and the refusals that keep a fork on the owner's list are
 * untouched: an agent that classifies a fork out of its own head still cannot take it off the owner's list.
 * `design/messages/ACCEPTANCE.md` W1 and W3.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
const AS_ANOTHER_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-other',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** The owner's words, kept as the owner said them, naming the records they cover. */
function about(...ids: string[]): Record<string, unknown> {
  return {
    saidBy: THE_TEST_OFFICES_OWNER.id,
    words: '如果本身是工程中间的问题，agent应当可以决策',
    where: 'terminal',
    when: '2026-09-03 20:30',
    for: ids,
  }
}

/**
 * The office is made once for the file. The list and the fork desk answer for the whole office, so
 * each case reads the count it starts with and compares what its own act added or removed.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeAll(async () => {
  // SETTLING A FORK ON THE OWNER'S WORDS IS THE SECRETARY'S ACT since the owner decided it, so
  // the agent this file promotes with holds that card.
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_PERSON,
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
  })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

// ============================================================================ fixtures and reads

/** A fork the person filed and reserved for the owner. Settling it is a governance act. */
function theOwnersFork(question: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title: `Fork · ${question}`,
    data: { question, options: ['a — one way', 'b — the other'], who_settles_it: 'the owner' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

interface Waiting {
  items: { id: string; tier: string }[]
  counts: { settle: number; asked: number; setAside: number }
  excluded: { reason: string; count: number; sentence: string }[]
}

async function waiting(): Promise<Waiting> {
  const res = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Waiting
}

interface Desk {
  forks: { recordId: string }[]
  settled: { proposalId: string; onThePersonsWords: unknown }[]
}

async function desk(): Promise<Desk> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: AS_PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Desk
}

/** How many are in one `excluded` bucket. Zero when the bucket is not carried at all. */
function excluded(reading: Waiting, reason: string): number {
  return reading.excluded.find((group) => group.reason === reason)?.count ?? 0
}

/**
 * Settle the fork on the owner's words, and answer the act, so a test can revoke it.
 *
 * THE ACT IS ON THE DECISION AND NOT ON THE FORK. A promotion writes the decision and writes nothing
 * at all to the proposal, so the warrant is on the decision's first version — which is the record
 * the revoke is addressed to. `lib/warrants.ts` says the same at length.
 */
async function promoteOnTheOwnersWords(fork: string): Promise<{ recordId: string; seq: number }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${fork}/promote`,
    headers: AS_AGENT,
    payload: {
      title: 'Settled, on what the owner said in the terminal',
      data: { because: 'The owner said an engineering question is the agent’s.' },
      warrant: about(fork),
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const read = await app.inject({ method: 'GET', url: `/api/records/${fork}`, headers: AS_PERSON })
  const acts = (read.json() as { onThePersonsWords: { seq: number; recordId: string }[] }).onThePersonsWords
  const act = acts[0]
  expect(act, 'the promotion left no act on the owner’s words to revoke').toBeDefined()
  return { recordId: act?.recordId ?? fork, seq: act?.seq ?? 0 }
}

// ============================================================================ 1. a settled fork

describe('a fork settled on the owner’s words leaves the owner’s list, and says so on the way out', () => {
  it('takes the row off the list and counts it with the reason in words', async () => {
    const fork = theOwnersFork('Does an orphaned session count as over?')

    const before = await waiting()
    expect(before.items.map((one) => one.id), 'the fork was not on the owner’s list to begin with').toContain(fork)
    const settleBefore = before.counts.settle
    const doneBefore = excluded(before, 'done-on-your-words')

    await promoteOnTheOwnersWords(fork)

    const after = await waiting()
    expect(after.items.map((one) => one.id), 'a fork settled on the owner’s words is still on the owner’s list').not.toContain(fork)
    expect(after.counts.settle).toBe(settleBefore - 1)
    expect(excluded(after, 'done-on-your-words'), 'the row left and nothing said why').toBe(doneBefore + 1)
    expect(
      after.excluded.find((group) => group.reason === 'done-on-your-words')?.sentence,
      'the bucket has no sentence a person can read',
    ).toContain('quoting words of yours')
  })

  it('says the same thing on the fork desk as on the list', async () => {
    const fork = theOwnersFork('May Mole Office start processes on this machine?')
    await promoteOnTheOwnersWords(fork)

    const board = await desk()
    expect(board.forks.map((one) => one.recordId), 'the desk still calls it an open fork').not.toContain(fork)
    const settled = board.settled.find((one) => one.proposalId === fork)
    expect(settled, 'the desk does not list it as settled either, so it is nowhere').toBeDefined()
    expect(settled?.onThePersonsWords, 'the desk does not say whose words settled it').not.toBeNull()
  })

  it('puts the fork back on the owner’s list when the owner revokes the act', async () => {
    const fork = theOwnersFork('Does an orphaned session count as over?')
    const doneBefore = excluded(await waiting(), 'done-on-your-words')
    const act = await promoteOnTheOwnersWords(fork)
    expect((await waiting()).items.map((one) => one.id)).not.toContain(fork)

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${act.recordId}/revisions/${String(act.seq)}/revoke`,
      headers: AS_PERSON,
    })
    expect(res.statusCode, res.body).toBe(200)

    const after = await waiting()
    expect(after.items.map((one) => one.id), 'the owner took the act back and the fork did not come back').toContain(fork)
    expect(excluded(after, 'done-on-your-words'), 'a revoked act is still counted as one the owner authorised').toBe(doneBefore)
  })
})

// ============================================================================ 2. a fork handed over

describe('a fork handed to an agent on the owner’s words leaves the owner’s list', () => {
  /** Another agent classifies it first, so moving it off that classification needs the owner's words. */
  async function handedOverOnTheOwnersWords(fork: string): Promise<void> {
    const first = await app.inject({
      method: 'PATCH',
      url: `/api/records/${fork}`,
      headers: AS_AGENT,
      payload: { dataPatch: { who_settles_it: 'an agent' }, warrant: about(fork) },
    })
    expect(first.statusCode, first.body).toBe(200)
  }

  it('takes the row off the list and counts it as done on the owner’s words, not as somebody else’s fork', async () => {
    const fork = theOwnersFork('Should the block retitle restamp each block’s own age?')
    const start = await waiting()
    expect(start.items.map((one) => one.id)).toContain(fork)
    const doneBefore = excluded(start, 'done-on-your-words')
    const somebodyBefore = excluded(start, 'somebody-else-settles-it')

    await handedOverOnTheOwnersWords(fork)

    const after = await waiting()
    expect(after.items.map((one) => one.id), 'a fork handed over on the owner’s words is still on the owner’s list').not.toContain(fork)
    expect(excluded(after, 'done-on-your-words')).toBe(doneBefore + 1)
    // THE TWO BUCKETS SAY DIFFERENT THINGS AND MUST NOT BE MERGED. "Somebody else settles it" is a
    // fact about how the fork was always classified; this one is an act the owner can take back.
    expect(excluded(after, 'somebody-else-settles-it'), 'the owner’s own act was counted as somebody else’s fork').toBe(somebodyBefore)
  })

  it('leaves it on the desk as an open fork, because nobody has answered it yet', async () => {
    const fork = theOwnersFork('Should the block retitle restamp each block’s own age?')
    await handedOverOnTheOwnersWords(fork)
    const board = await desk()
    expect(board.forks.map((one) => one.recordId), 'a fork nobody has answered vanished from the desk').toContain(fork)
  })
})

// ============================================================================ 3. what did not move

describe('the refusals that keep a fork on the owner’s list are exactly as they were', () => {
  it('keeps a fork an agent classified out of its own head', async () => {
    // FILED BY THE PERSON AND LEFT UNCLASSIFIED, which is the owner's: absence is not permission. A fork an
    // AGENT files defaults to `an agent` at filing, and a classification a fork was filed with is
    // not one an agent wrote onto it later — so it would leave the owner's list for a different reason
    // entirely, and would not test this.
    const doneBefore = excluded(await waiting(), 'done-on-your-words')
    const fork = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'proposal',
      title: 'Fork · a question the owner filed and nobody classified',
      data: { question: 'a or b?', options: ['a — one way', 'b — the other'] },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id

    // Classifying an unclassified fork needs no warrant and is allowed. It does not make the fork
    // the agent's, because the agent wrote its own permission.
    const classified = await app.inject({
      method: 'PATCH',
      url: `/api/records/${fork}`,
      headers: AS_ANOTHER_AGENT,
      payload: { dataPatch: { who_settles_it: 'an agent' } },
    })
    expect(classified.statusCode, classified.body).toBe(200)

    const after = await waiting()
    expect(after.items.map((one) => one.id), 'an agent took a fork off the owner’s list with no words of the owner’s').toContain(fork)
    expect(excluded(after, 'done-on-your-words')).toBe(doneBefore)
  })

  it('keeps a fork whose settling link an agent made with no words of the owner’s', async () => {
    const fork = theOwnersFork('Does an orphaned session count as over?')
    const doneBefore = excluded(await waiting(), 'done-on-your-words')
    const refused = await app.inject({
      method: 'POST',
      url: `/api/records/${fork}/promote`,
      headers: AS_AGENT,
      payload: { title: 'Settled with nobody’s words', data: { because: 'I decided' } },
    })
    expect(refused.statusCode).toBe(403)

    const after = await waiting()
    expect(after.items.map((one) => one.id)).toContain(fork)
    expect(excluded(after, 'done-on-your-words')).toBe(doneBefore)
  })
})
