// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK THE CORPUS SAYS AN AGENT SETTLES LEAVES THE OWNER'S QUEUE WHEN AN AGENT SETTLES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND IT MADE THE WHOLE CLASSIFICATION A NO-OP
 * ---------------------------------------------------------------------------------------
 *
 * `who_settles_it` landed on 27 August 2026 and the write gate learned to read it the same day, so
 * an agent could settle a fork the corpus said was an agent's. The QUEUE did not learn. It asked
 * one question — did a HUMAN make the settling link — so an agent-made link failed it and the fork
 * stayed in `readForks().open`, which is what `GET /api/needs-you` reads.
 *
 * That left two readers of one fact able to disagree: `proposalResolution` said the fork was
 * resolved and the owner's queue said it was waiting on them. This repository's named recurring
 * defect, on the one access control in the product.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT CHANGED, AND IT IS THE HALF THAT WAS FOUND BY ATTACK
 * ---------------------------------------------------------------------------------------
 *
 * An independent reviewer executed both directions against a fork that is the OWNER'S: an agent
 * pointing an unrelated human decision at it so it vanished, and deleting the link of a genuinely
 * settled fork to put it back. On the owner's forks — and on forks nobody has classified, because absence
 * is not permission — only a link a human made counts, and both directions below prove it still.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ASYMMETRY IS SAFE, SAID ONCE HERE AND ONCE IN THE CODE
 * ---------------------------------------------------------------------------------------
 *
 * The reason the owner's forks demand a human link is legacy rows: `assertMaySettleFork` refuses the write
 * now, but rows older than the gate are in the live corpus and an archive can bring more. A fork
 * marked `an agent` cannot be in that position. The FIELD is younger than the gate, so no such fork
 * can carry a settling link made before the gate stood.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, settleLinkBypassingTheGate, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_OWNER, type ForkSettler } from '../src/shared/kinds.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'
import type { ForksReply } from '../src/server/api/forks.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'

const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE PROJECT IS MADE ONCE: every case reads the owner's queue whole and asks only whether its own
  // fork is in it, so one office and one project hold every case without narrowing a reading.
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * A fork the PERSON filed, with whatever they said about who settles it.
 *
 * FILED BY THE OWNER SINCE 3 SEPTEMBER 2026. Two things changed that day, both from the rule that
 * an engineering question is the agent's (`design/messages/ACCEPTANCE.md` W3): a fork an AGENT files
 * says `who_settles_it: "an agent"` unless the agent names something else, and an agent may correct
 * a classification IT wrote. Every fixture below is about a fork on THE OWNER'S queue, so filing it under
 * the owner's name is what it was always meant to be — an agent-filed fixture was giving the guard the
 * agent's own sentence to defend, which is a different question. Nothing else about these tests
 * moved.
 */
async function fileFork(settles: ForkSettler | undefined): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title: `Which timeout on the gripper poll? (${settles ?? 'unclassified'})`,
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

/** A decision an AGENT writes, saying what it stands on, which is what `authority` is for. */
async function agentDecision(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent,
    payload: {
      kind: 'decision',
      title: 'Poll the gripper at 500ms',
      data: { ...governsTheWholeProject(), replaces: [],
        because: 'The bus drops a frame at 200ms on four runs out of five, measured on 27 August 2026.',
        authority: 'a measurement',
        decided_by: 'claude-code',
        option_taken: 'b — 500ms',
        option_index: 1,
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A decision the PERSON writes. */
async function personDecision(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'decision',
      title: 'Poll the gripper at 200ms',
      data: { ...governsTheWholeProject(), replaces: [], because: 'Latency matters more than the dropped frame.' },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function settle(
  decision: string,
  fork: string,
  headers: Record<string, string> = asAgent,
): Promise<{ statusCode: number; body: string; linkId: string | null }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers,
    payload: { fromId: decision, toId: fork, type: 'derived_from' },
  })
  // `id` on the reply is what the delete route takes — see tests/links.test.ts, which pins that.
  const linkId = res.statusCode === 201 ? ((res.json() as { id?: string }).id ?? null) : null
  return { statusCode: res.statusCode, body: res.body, linkId }
}

/** The short list an agent reads to find out what only the person can do. */
async function waitingOnTheOwner(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/needs-you', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as NeedsYouReply).actions.map((one) => one.recordId)
}

/** The desk, which carries enough of each fork to settle it, out of the same one reading. */
async function desk(): Promise<ForksReply> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ForksReply
}

describe('a fork an agent may settle leaves the queue when an agent settles it', () => {
  it('is waiting before the link and gone after it, on both surfaces at once', async () => {
    const fork = await fileFork('an agent')
    const decision = await agentDecision()

    expect(await waitingOnTheOwner(), 'the fork should be on the list before anybody settles it').toContain(fork)

    const made = await settle(decision, fork)
    expect(made.statusCode, made.body).toBe(201)

    // THE ONE THAT MATTERS. Before this fix the fork was still here while `proposalResolution` said
    // it was resolved: the queue and the record disagreeing about the same fact.
    expect(await waitingOnTheOwner(), 'an agent settled it and it is still on the owner’s list').not.toContain(fork)

    // AND THE TWO SURFACES AGREE, because they come out of one reading. A fork that left the queue
    // is named on the way out, with the decision that answers it, so it can be gone back to.
    const read = await desk()
    expect(read.forks.map((one) => one.recordId)).not.toContain(fork)
    const settled = read.settled.find((one) => one.proposalId === fork)
    expect(settled?.decisionId, 'the settled pair is not reported').toBe(decision)
  })

  it('does the same for "the parent" and for "a measurement"', async () => {
    for (const word of ['the parent', 'a measurement'] as const) {
      const fork = await fileFork(word)
      const decision = await agentDecision()
      const made = await settle(decision, fork)
      expect(made.statusCode, `${word}: ${made.body}`).toBe(201)
      expect(await waitingOnTheOwner(), `a fork marked "${word}" stayed on the owner’s list`).not.toContain(fork)
    }
  })

  it('leaves it on the queue while nobody has settled it, however it is classified', async () => {
    // NOT THE OWNER'S TO ANSWER IS NOT THE SAME AS ANSWERED. The row stays until somebody closes it, and
    // it says on the row that it is not waiting on them.
    const fork = await fileFork('an agent')
    expect(await waitingOnTheOwner()).toContain(fork)
    const row = (await desk()).forks.find((one) => one.recordId === fork)
    expect(row?.because).toContain('not yours to settle')
    expect(row?.priority.governance).toBe(false)
  })
})

describe('a fork that is the person’s still needs a person, and both attacks stay closed', () => {
  it('does not leave the queue when an agent points a human decision at one marked "the owner"', async () => {
    // THE ATTACK, EXECUTED. The write door refuses it now, so the row is written the way a corpus
    // older than the gate holds one — which is exactly the case the reader exists for.
    const fork = await fileFork(THE_OWNER)
    const decision = await personDecision()

    const refusedAtTheDoor = await settle(decision, fork)
    expect(refusedAtTheDoor.statusCode, refusedAtTheDoor.body).toBe(403)

    settleLinkBypassingTheGate(t, { fromId: decision, toId: fork, actorType: 'agent', actorId: 'claude-code' })
    expect(await waitingOnTheOwner(), 'an agent’s link took one of the owner’s forks off the owner’s list').toContain(fork)
  })

  it('does not leave the queue when nobody has classified it either', async () => {
    // ABSENCE IS NOT PERMISSION. The easy wrong fix reads a missing field as "not the owner,
    // therefore anybody", and this is the test that goes red when somebody writes it.
    const fork = await fileFork(undefined)
    const decision = await personDecision()
    settleLinkBypassingTheGate(t, { fromId: decision, toId: fork, actorType: 'agent', actorId: 'claude-code' })
    expect(await waitingOnTheOwner(), 'an unclassified fork left the owner’s list on an agent’s link').toContain(fork)
  })

  it('leaves the queue when the person makes the link, and comes back when it is deleted', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await personDecision()

    const made = await settle(decision, fork, asPerson)
    expect(made.statusCode, made.body).toBe(201)
    expect(await waitingOnTheOwner()).not.toContain(fork)

    // THE OTHER DIRECTION THE REVIEWER EXECUTED: unlinking a genuinely settled fork puts it back,
    // which is correct, and it is here so that a change to the reading cannot lose it silently.
    expect(made.linkId).not.toBeNull()
    const removed = await app.inject({ method: 'DELETE', url: `/api/links/${made.linkId ?? ''}`, headers: asPerson })
    expect(removed.statusCode, removed.body).toBe(200)
    expect(await waitingOnTheOwner()).toContain(fork)
  })
})

describe('the queue and the apply door read the same definition', () => {
  it('answers the same question through the one exported function', async () => {
    const fork = await fileFork('an agent')
    const decision = await agentDecision()
    await settle(decision, fork)

    const { forkIsSettled } = await import('../src/server/api/needs-you.ts')
    const { getRecord, proposalResolution } = await import('../src/server/lib/records.ts')
    const record = getRecord(fork)
    expect(record).not.toBeNull()
    const resolution = proposalResolution(record!)
    expect(resolution).not.toBeNull()

    // ONE FUNCTION, TWO CALLERS. `GET /api/needs-you` and the apply gate in api/planning.ts both
    // ask this, so "decided" cannot mean one thing on the queue and another at the door.
    expect(forkIsSettled(fork, resolution!)).toBe(true)
    expect(await waitingOnTheOwner()).not.toContain(fork)
  })
})
