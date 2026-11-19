// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERSEDED FORK AND A DUPLICATE FORK LEAVE THE QUEUE, AND NEITHER LEAVES SILENTLY.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS IS BUILT FROM
 * ---------------------------------------------------------------------------------------
 *
 * On 27 August 2026 the owner's queue held 27 forks. `MSi_zPJGt4Yh supersedes h6O_RMpeYBTD` was
 * stored in the live corpus and `h6O_RMpeYBTD` was still item 1 of the 27, because nothing in
 * `src/server/lib/forks.ts` read a `supersedes` link. Three more of the 27 — `Wq2WNIJngXtd`,
 * `CUi3VI1lsM9U` and `E4Tjt9D1Yvrs` — asked one question about which repository 152 module claims
 * belong to, and there was no link type that could say two records are the same question.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST STAY TRUE
 * ---------------------------------------------------------------------------------------
 *
 *   1. It leaves the queue. Nobody has to answer it.
 *   2. It is NOT reported as settled. Nobody decided anything.
 *   3. It is still readable, with WHY it left and WHICH record replaced it. A row that disappears
 *      with no account is worse than a row that stays.
 *   4. A link to a DELETED record is not an exit — that is a fact about the archive, and the fork
 *      is waiting on somebody again.
 *   5. Being answered outranks being replaced: a fork a person settled is settled.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED IN THIS FILE ON 27 AUGUST 2026, AND WHY IT IS NOT A WEAKENING
 * ---------------------------------------------------------------------------------------
 *
 * EVERY EXIT LINK BELOW IS NOW MADE BY THE PERSON. It used to be made by an agent, and that is the
 * hole this file was written on top of without seeing: these forks are the OWNER'S — none of them
 * says `who_settles_it` — and until that day an agent's `supersedes` or `duplicate_of` took one of
 * the owner's forks off the owner's queue while an agent's `derived_from` on the same fork did not. Both the write
 * door and the reader now ask the same question of all three links, so an agent's link on one of
 * the owner's forks is refused by `assertMayReplaceAFork` and, for rows written before that guard, is not
 * counted by `leftTheQueueBecause`.
 *
 * NOT ONE ASSERTION BELOW WAS REMOVED OR RELAXED. The five things that must stay true are the same
 * five, asserted the same way. What moved is who made the link, and the fork's `linkedBy` therefore
 * reads the owner's id where it read `claude-code`.
 *
 * AN AGENT'S LINK STILL TAKES A FORK OUT OF THE QUEUE WHEN THE FORK SAYS IT MAY, and that half is
 * proved in `tests/a-fork-leaves-the-queue-only-on-a-link-that-may-take-it.test.ts`, beside the
 * refusals.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

const AGENT = { type: 'agent' as const, id: 'claude-code', stated: true }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id, stated: true }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { needsYouRoutes } = await import('../src/server/api/needs-you.ts')
  const { forkRoutes } = await import('../src/server/api/forks.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(needsYouRoutes, { prefix: '/api' })
  await app.register(forkRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const fork = (title: string): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: { question: `${title}?`, options: ['a — one way', 'b — the other'] },
    actor: AGENT,
  }).id

const read = async (): Promise<{
  open: string[]
  settled: string[]
  leftTheQueue: { proposalId: string; why: string; sentence: string; insteadId: string; linkedBy: string }[]
}> => {
  const reply = await app.inject({ method: 'GET', url: '/api/forks' })
  const body = reply.json() as {
    forks: { recordId: string }[]
    settled: { proposalId: string }[]
    leftTheQueue: { proposalId: string; why: string; sentence: string; insteadId: string; linkedBy: string }[]
  }
  return {
    open: body.forks.map((f) => f.recordId),
    settled: body.settled.map((f) => f.proposalId),
    leftTheQueue: body.leftTheQueue,
  }
}


describe('a superseded fork', () => {
  it('leaves the queue, is not called settled, and says what replaced it', async () => {
    const old = fork('Is a module card a boundary')
    const fresh = fork('The module-label question, without the two concerns tangled together')
    t.api.createLink({ fromId: fresh, toId: old, type: 'supersedes', actor: HUMAN })

    const answer = await read()
    expect(answer.open, 'the superseded fork is still in the queue').not.toContain(old)
    expect(answer.open, 'the fork that replaced it should still be waiting').toContain(fresh)
    expect(answer.settled, 'nobody decided anything, so nothing was settled').not.toContain(old)

    const row = answer.leftTheQueue.find((one) => one.proposalId === old)
    expect(row, 'the fork vanished with no account').toBeDefined()
    expect(row?.why).toBe('superseded')
    expect(row?.insteadId).toBe(fresh)
    // The sentence is what a person reads. It has to name the other record and say nobody decided.
    expect(row?.sentence).toContain('replaced it')
    const { whyItLeft } = await import('../src/server/lib/forks.ts')
    expect(row?.sentence).toContain(whyItLeft('superseded', 'The module-label question, without the two concerns tangled together', fresh))
    expect(row?.linkedBy).toBe(THE_TEST_OFFICES_OWNER.id)
  })

  it('comes back if the record that replaced it is deleted', async () => {
    // A link whose other end is deleted is a fact about the archive rather than a live claim, and
    // the honest answer is that this fork is waiting on somebody again.
    const old = fork('Is a module card a boundary')
    const fresh = fork('The module-label question, asked again')
    t.api.createLink({ fromId: fresh, toId: old, type: 'supersedes', actor: HUMAN })
    expect((await read()).open).not.toContain(old)

    t.api.deleteRecord(fresh, HUMAN)
    const after = await read()
    expect(after.open, 'a fork whose replacement was deleted is waiting on somebody again').toContain(old)
    expect(after.leftTheQueue.map((one) => one.proposalId)).not.toContain(old)
  })
})

describe('a duplicate fork', () => {
  it('leaves the queue, and the one it duplicates stays', async () => {
    const canonical = fork('Which repository do the 152 module claims belong to')
    const again = fork('Which repository are the 152 module claims relative to')
    t.api.createLink({ fromId: again, toId: canonical, type: 'duplicate_of', actor: HUMAN })

    const answer = await read()
    expect(answer.open).toContain(canonical)
    expect(answer.open).not.toContain(again)
    const row = answer.leftTheQueue.find((one) => one.proposalId === again)
    expect(row?.why).toBe('duplicate')
    expect(row?.insteadId).toBe(canonical)
    expect(row?.sentence).toContain('the same question as')
  })

  it('reads in one direction only: the canonical fork is not taken off by its own backlink', async () => {
    // `A duplicate_of B` says A is the repeat. If this read both ends, marking a duplicate would
    // take BOTH forks off the queue and the question would be answered by nobody.
    const canonical = fork('Which repository do the 152 module claims belong to')
    const again = fork('Which repository are the 152 module claims relative to')
    t.api.createLink({ fromId: again, toId: canonical, type: 'duplicate_of', actor: HUMAN })
    expect((await read()).open).toContain(canonical)
  })
})

describe('what did not change', () => {
  it('a settled fork is still settled, even when something also supersedes it', async () => {
    const old = fork('Is a module card a boundary')
    const answer = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'A module card is a boundary',
      data: { authority: 'a product invariant', decided_by: 'the owner' },
      actor: HUMAN,
    }).id
    t.api.createLink({ fromId: answer, toId: old, type: 'derived_from', actor: HUMAN })
    const fresh = fork('The same question, asked later')
    t.api.createLink({ fromId: fresh, toId: old, type: 'supersedes', actor: HUMAN })

    const got = await read()
    expect(got.settled, 'being answered outranks being replaced').toContain(old)
    expect(got.leftTheQueue.map((one) => one.proposalId)).not.toContain(old)
  })

  it('an ordinary fork with no such link is untouched', async () => {
    const started = await read()
    const plain = fork('Should the tailnet hop be issued at all')
    const got = await read()
    expect(got.open).toContain(plain)
    const wasThere = new Set(started.leftTheQueue.map((one) => one.proposalId))
    expect(got.leftTheQueue.filter((one) => !wasThere.has(one.proposalId))).toEqual([])
  })
})

describe('GET /api/needs-you says it too, because it is the same reading', () => {
  it('drops the superseded fork from the actions and names it on the way out', async () => {
    const old = fork('Is a module card a boundary')
    const fresh = fork('The module-label question, untangled')
    t.api.createLink({ fromId: fresh, toId: old, type: 'supersedes', actor: HUMAN })

    const reply = await app.inject({ method: 'GET', url: '/api/needs-you' })
    const body = reply.json() as {
      actions: { recordId: string }[]
      leftTheQueue: { proposalId: string; why: string }[]
    }
    expect(body.actions.map((a) => a.recordId)).not.toContain(old)
    expect(body.leftTheQueue.find((one) => one.proposalId === old)?.why).toBe('superseded')
  })
})
