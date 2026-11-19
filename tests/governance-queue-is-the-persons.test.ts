// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY NOT EMPTY THE QUEUE OF THINGS ONLY A PERSON MAY ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES, MEASURED BEFORE IT WAS CLOSED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/needs-you` is the whole of the owner's governance queue. It reads every live
 * `proposal` and nothing else — `readForks` in src/server/lib/forks.ts filters on
 * `isNull(records.deletedAt)` — so a proposal that is soft-deleted leaves the queue.
 *
 * Writing a decision was already refused to an agent, and pointing a decision at a fork was
 * refused too. DELETING THE FORK WAS NOT. `deleteRecord` asks `assertMayWrite`, which refuses
 * only `HUMAN_ONLY_KINDS`, and `proposal` is deliberately not one of those: an agent files
 * proposals, so it may write them. The consequence nobody had written down is that the same
 * agent could delete every one of them and the queue would read "Nothing is waiting on you."
 * Problem `h7Qg4zU2hqvb`.
 *
 * ---------------------------------------------------------------------------------------
 * THE GUARD IS THE NARROWEST RULE THAT COVERS THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * A non-human actor may not delete an UNSETTLED proposal. Three things are deliberately left
 * alone, and each is checked below:
 *
 *   · a SETTLED proposal — a decision the person wrote already answers it, so it is not in the
 *     queue and deleting it takes nothing away from them;
 *   · a person deleting their own fork, whatever its state — the queue is theirs;
 *   · every other kind. This is not a permission layer and must not become one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE THIS TEST WRONG
 * ---------------------------------------------------------------------------------------
 *
 * If `GET /api/needs-you` ever stops being built from live proposals — if a fork gains a stored
 * state of its own, say — then "deleted" would stop meaning "gone from the queue" and this guard
 * would be defending a fact that had moved. Change it deliberately and say why. Do not delete it
 * because a test that files a proposal wants to tidy up: an agent tidying up is exactly the act.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

const AGENT = { type: 'agent' as const, id: 'claude-code', stated: true }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id, stated: true }

const AGENT_HEADERS = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}
const HUMAN_HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

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

/** A fork an agent filed, exactly as `humanOnlyRefusal` tells an agent to file one. */
function forkFiledByAnAgent(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: {
      question: 'Position control or force control for the handover?',
      options: ['a — position', 'b — force'],
      because: 'the gripper has no force sensor on the left finger',
      // HANDED UP BY THE AGENT THAT FILED IT, which is what puts a fork on the owner's queue since
      // 3 September 2026: a fork an agent files says "an agent" unless the agent names somebody
      // else, by the rule that an engineering question is the agent's
      // (`design/messages/ACCEPTANCE.md` W3). Naming the owner here is the agent's own statement and it is
      // the case these tests are about.
      who_settles_it: 'the owner',
    },
    actor: AGENT,
  }).id
}

/** The ids the owner's governance queue is drawing right now. */
async function whatIsWaitingOnTheOwner(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/needs-you', headers: HUMAN_HEADERS })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { actions: { recordId: string }[] }).actions.map((a) => a.recordId)
}

async function askToDelete(id: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers })
  return { status: res.statusCode, body: res.body }
}

describe('the queue of forks is the person’s, and an agent cannot empty it', () => {
  it('refuses an agent deleting an open fork, and the fork is still waiting on the owner', async () => {
    const fork = forkFiledByAnAgent('Should the handover use force control?')
    expect(await whatIsWaitingOnTheOwner()).toContain(fork)

    const res = await askToDelete(fork, AGENT_HEADERS)
    expect(res.status, `an agent deleted an open fork: ${res.body}`).toBe(403)

    // AND NOTHING WAS WRITTEN. A refusal that deleted it anyway would be worse than none.
    expect(await whatIsWaitingOnTheOwner()).toContain(fork)
  })

  it('says what the agent may do instead, in the refusal itself', async () => {
    const fork = forkFiledByAnAgent('One capacity table, or capacity as a kind?')
    const res = await askToDelete(fork, AGENT_HEADERS)
    expect(res.status).toBe(403)
    // The refusal names the queue it is protecting and the act that is the agent's to make: say
    // what changed, rather than removing the question.
    expect(res.body).toContain('needs-you')
    expect(res.body).toContain('withdrawn')
  })

  it('refuses a request that sent no actor headers at all, for the same reason a decision does', async () => {
    const fork = forkFiledByAnAgent('Should the twin keep its own URDF?')
    const res = await askToDelete(fork, { 'x-mole-office-workspace': 'default' })
    expect(res.status, `a header-less delete emptied a fork out of the queue: ${res.body}`).toBe(403)
    expect(await whatIsWaitingOnTheOwner()).toContain(fork)
  })

  it('lets the person delete their own fork, because the queue is theirs', async () => {
    const fork = forkFiledByAnAgent('Should the review pane keep its own width?')
    const res = await askToDelete(fork, HUMAN_HEADERS)
    expect(res.status, res.body).toBe(200)
    expect(await whatIsWaitingOnTheOwner()).not.toContain(fork)
  })

  it('refuses an agent a fork the person has answered, because the pair is still the owner’s', async () => {
    // THIS TEST SAID THE OPPOSITE UNTIL 27 AUGUST 2026, and the sentence it made was
    // "answering a fork makes it deletable by anybody, which takes nothing from them". An adversary
    // used exactly that: it deleted a fork the owner had settled ONE REQUEST EARLIER, 200, and the
    // fork and its decision left every fork reading in Mole Office — not open, not settled, not gone from
    // the queue, nowhere. The kind change on the same record was refused in the same minute, so two
    // doors onto one act answered differently.
    //
    // A settled fork is still the owner's record. The decision beside it is the owner's. Going back to read what the owner
    // decided and why is the whole reason the settled list exists, so removing the pair is a
    // governance act and it stays the owner's. `design/round-eleven/wave-b/attack.md` section 1a is the run.
    const fork = forkFiledByAnAgent('Should marks carry a hue?')
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'Marks carry no hue',
      data: { because: 'no semantic state is carried by colour alone' },
      actor: HUMAN,
    }).id
    const linked = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: HUMAN_HEADERS,
      payload: { fromId: decision, toId: fork, type: 'derived_from' },
    })
    expect(linked.statusCode, linked.body).toBe(201)
    // It has left the queue by being answered, which is the state this clause is about.
    expect(await whatIsWaitingOnTheOwner()).not.toContain(fork)

    const res = await askToDelete(fork, AGENT_HEADERS)
    expect(res.status, `an agent deleted a fork the person had answered: ${res.body}`).toBe(403)

    // AND IT IS STILL THE OWNER'S TO DELETE, so this is a guard and not a lock.
    const byTheOwner = await askToDelete(fork, HUMAN_HEADERS)
    expect(byTheOwner.status, byTheOwner.body).toBe(200)
  })

  it('leaves every other kind alone: an agent still deletes its own note', async () => {
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'The Velodyne broadcast fix, written up',
      data: { body: 'The driver needs the broadcast address set before the nodelet loads.' },
      actor: AGENT,
    }).id
    const res = await askToDelete(note, AGENT_HEADERS)
    expect(res.status, `the guard widened past proposals: ${res.body}`).toBe(200)
  })
})
