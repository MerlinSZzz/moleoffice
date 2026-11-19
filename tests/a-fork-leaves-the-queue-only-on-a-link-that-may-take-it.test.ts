// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALL THREE WAYS OUT OF THE OWNER'S QUEUE ARE ASKED THE SAME QUESTION, AT THE DOOR AND AT THE READ.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, MEASURED ON THE LIVE CORPUS RATHER THAN ON A PROBE
 * ---------------------------------------------------------------------------------------
 *
 * `readForks` in src/server/lib/forks.ts has three exits and only one of them was guarded.
 * `assertMaySettleFork` opens with `if (type !== RESOLVES_PROPOSAL) return`, and `RESOLVES_PROPOSAL`
 * is `derived_from`. The other two are `supersedes` onto a proposal and `duplicate_of` from one, and
 * nothing asked about either: `checkLinkKinds` refuses `supersedes` only between planned things, and
 * `assertMayShapeTheFuture` fires only when the far end is a trajectory.
 *
 * Three forks were out of the owner's queue on agent-made links on 27 August 2026, in the owner's own
 * corpus:
 *
 *     MSi_zPJGt4Yh supersedes h6O_RMpeYBTD      agent claude-round-ten, 2026-08-24 17:38:47
 *     Wq2WNIJngXtd duplicate_of CUi3VI1lsM9U    agent claude-round-eleven-wave-b, 2026-08-27 14:35:26
 *     E4Tjt9D1Yvrs duplicate_of CUi3VI1lsM9U    agent claude-round-eleven-wave-b, 2026-08-27 14:35:26
 *
 * None of the three forks stores `who_settles_it`, so both the queue and the settling guard treat
 * all three as the owner's. Every one of those outcomes is right on its merits, which is why nobody noticed
 * the door.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE WRITE DOOR. `assertMayReplaceAFork` refuses an agent a `supersedes` or a `duplicate_of`
 *      on a fork that says "the owner", and on a fork nobody has classified, because absence is not
 *      permission. It allows one on a fork the corpus says an agent settles.
 *   2. THE ACTOR CLAUSES. A request that names nobody, and a request made in a name Mole Office cannot
 *      place, are both refused — the same three clauses `assertMaySettleFork` carries.
 *   3. THE READER. A link an agent made on a fork that is the owner's does not take it off the queue, even
 *      when the row is already stored. That is the half the write door cannot cover: rows written
 *      before the guard existed are in the live corpus, and an archive brings whatever it brings.
 *   4. THE SET OF EXITS IS DECLARED ONCE. The guard and the reader both read
 *      `LINKS_THAT_REPLACE_A_FORK`, so a third exit cannot be opened in one and not the other.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A ROW OLDER THAN THE GUARD IS BUILT HERE, USING ONLY THE PRODUCT'S OWN DOORS
 * ---------------------------------------------------------------------------------------
 *
 * The reader tests need an agent-made exit link on a fork that is the person's, and the write door
 * now refuses exactly that. So the fork is classified "an agent" first, the link is made, and the
 * fork is then marked "the owner" — which an agent may do, because handing a fork TO the owner is the
 * direction the owner's own rule points. That reaches the same stored state as a pre-gate row, through the
 * front door, and it pins a second thing worth pinning: an agent cannot walk around the reader by
 * classifying, linking and escalating in three requests.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'

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
/** A request that names nobody. Owner decision §36: that is not evidence a person made it. */
const namingNobody: Record<string, string> = { 'x-mole-office-workspace': PROJECT }
/** A name Mole Office has never heard of. It is a name, not somebody Mole Office knows. */
const asAStranger: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': `not-${THE_TEST_OFFICES_OWNER.id}-at-all`,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork, filed by an agent. `undefined` is the fifth answer: nobody has said. */
/**
 * A fork the PERSON filed, with whatever it says about who settles it.
 *
 * FILED BY THE OWNER SINCE 3 SEPTEMBER 2026. Two things changed that day, both from the rule that
 * an engineering question is the agent's (`design/messages/ACCEPTANCE.md` W3): a fork an AGENT files
 * says `who_settles_it: "an agent"` unless the agent names something else, and an agent may correct
 * a classification IT wrote. Every fixture below is about a fork on THE OWNER'S queue, so filing it under
 * the owner's name is what it was always meant to be — an agent-filed fixture was giving the guard the
 * agent's own sentence to defend, which is a different question. Nothing else about these tests
 * moved.
 */
async function fileFork(title: string, settles?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title,
      data: {
        question: `${title}?`,
        options: ['a — one way', 'b — the other'],
        ...(settles === undefined ? {} : { who_settles_it: settles }),
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function fileNote(title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent,
    payload: { kind: 'note', title, data: { body: title } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function link(
  fromId: string,
  toId: string,
  type: string,
  headers: Record<string, string> = asAgent,
): Promise<{ statusCode: number; message: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/links', headers, payload: { fromId, toId, type } })
  let message = res.body
  try {
    const parsed = res.json() as { error?: string; message?: string; detail?: string }
    message = `${parsed.message ?? ''} ${parsed.error ?? ''} ${parsed.detail ?? ''}`
  } catch {
    /* the body is not JSON; the raw body is the message */
  }
  return { statusCode: res.statusCode, message }
}

/** Who is still waiting on somebody, and who left without being answered. */
async function queue(): Promise<{ open: string[]; left: { proposalId: string; why: string; linkedBy: string }[] }> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  const body = res.json() as {
    forks: { recordId: string }[]
    leftTheQueue: { proposalId: string; why: string; linkedBy: string }[]
  }
  return { open: body.forks.map((one) => one.recordId), left: body.leftTheQueue }
}

describe('the write door: an agent may not take one of the owner’s forks off the queue', () => {
  it('refuses `supersedes` onto a fork marked "the owner"', async () => {
    const ownersFork = await fileFork('Is a module card a boundary', THE_OWNER)
    const other = await fileNote('The record that would replace it')
    const refused = await link(other, ownersFork, 'supersedes')
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('takes that fork out of the queue without answering it')
    expect(refused.message).toContain(THE_OWNER)
    expect((await queue()).open, 'the owner’s fork left the queue anyway').toContain(ownersFork)
  })

  it('refuses `duplicate_of` from a fork marked "the owner"', async () => {
    const ownersFork = await fileFork('Is a module card a boundary', THE_OWNER)
    const other = await fileFork('The same question, asked once already', 'an agent')
    const refused = await link(ownersFork, other, 'duplicate_of')
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('is the same question as')
    expect((await queue()).open).toContain(ownersFork)
  })

  it('refuses both on a fork nobody has classified, because absence is not permission', async () => {
    const unclassified = await fileFork('Should the tailnet hop be issued at all')
    const other = await fileNote('The record that would replace it')

    const superseded = await link(other, unclassified, 'supersedes')
    expect(superseded.statusCode, superseded.message).toBe(403)
    expect(superseded.message).toContain('nobody has classified')
    expect(superseded.message).toContain('An empty field is not permission')

    const duplicate = await link(unclassified, other, 'duplicate_of')
    expect(duplicate.statusCode, duplicate.message).toBe(403)
    expect(duplicate.message).toContain('nobody has classified')

    expect((await queue()).open).toContain(unclassified)
  })

  it('names the request that would let it through, and it is a different act', async () => {
    const unclassified = await fileFork('Should the tailnet hop be issued at all')
    const other = await fileNote('The record that would replace it')
    const refused = await link(other, unclassified, 'supersedes')
    expect(refused.message).toContain(`PATCH /api/records/${unclassified}`)
    expect(refused.message).toContain('who_settles_it')
  })

  it('allows it on a fork the corpus says an agent settles, and the fork leaves the queue', async () => {
    const mine = await fileFork('Which repository are the module claims relative to', 'an agent')
    const other = await fileFork('Which repository do the module claims belong to', 'an agent')
    const made = await link(mine, other, 'duplicate_of')
    expect(made.statusCode, made.message).toBe(201)

    const read = await queue()
    expect(read.open, 'the repeat is still being asked').not.toContain(mine)
    expect(read.open, 'the one to answer must stay').toContain(other)
    expect(read.left.find((one) => one.proposalId === mine)?.why).toBe('duplicate')
  })

  it('leaves the person free to do all of it', async () => {
    const ownersFork = await fileFork('Is a module card a boundary', THE_OWNER)
    const other = await fileNote('The record that replaces it')
    const made = await link(other, ownersFork, 'supersedes', asPerson)
    expect(made.statusCode, made.message).toBe(201)
    expect((await queue()).open).not.toContain(ownersFork)
  })

  it('does not touch a link that is not one of the three ways out', async () => {
    // `relates_to` between the same two records says the two are connected and settles nothing, so
    // it is not this guard's business. A rule that refused it would be a permission layer.
    const ownersFork = await fileFork('Is a module card a boundary', THE_OWNER)
    const other = await fileNote('Something about the same subject')
    const made = await link(other, ownersFork, 'relates_to')
    expect(made.statusCode, made.message).toBe(201)
    expect((await queue()).open, 'a relates_to took a fork off the queue').toContain(ownersFork)
  })

  it('does not touch a supersedes between two records where neither is a fork', async () => {
    const older = await fileNote('The first draft of the recipe')
    const newer = await fileNote('The recipe as it stands')
    const made = await link(newer, older, 'supersedes')
    expect(made.statusCode, made.message).toBe(201)
  })
})

describe('the three actor clauses, which are the ones the settling link carries', () => {
  it('refuses a request that sent no actor headers', async () => {
    const unclassified = await fileFork('Should the tailnet hop be issued at all')
    const other = await fileNote('The record that would replace it')
    const refused = await link(other, unclassified, 'supersedes', namingNobody)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('sent no actor headers')
    expect((await queue()).open).toContain(unclassified)
  })

  it('refuses a name Mole Office cannot place, however human it says it is', async () => {
    // THROUGH A REAL SOCKET AND NOT THROUGH `inject`, because the clause is deliberately silent
    // when there is no door: `isSomebodyMoleOfficeCannotPlace` returns false when `actor.from` is
    // undefined, which is what an in-process caller is. A test on `inject` would be green with the
    // clause deleted, which is the same thing as no test.
    const unclassified = await fileFork('Should the tailnet hop be issued at all')
    const other = await fileNote('The record that would replace it')
    await app.listen({ host: '127.0.0.1', port: 0 })
    const { port } = app.server.address() as { port: number }
    const answer = await fetch(`http://127.0.0.1:${String(port)}/api/links`, {
      method: 'POST',
      headers: { ...asAStranger, 'content-type': 'application/json' },
      body: JSON.stringify({ fromId: other, toId: unclassified, type: 'supersedes' }),
    })
    const body = (await answer.json()) as { error?: string; detail?: string }
    const said = `${body.error ?? ''} ${body.detail ?? ''}`
    expect(answer.status, said).toBe(403)
    expect(said).toContain('not somebody Mole Office can place')
    expect((await queue()).open).toContain(unclassified)
  })
})

describe('the reader: a link already stored is asked the same question', () => {
  /**
   * The state a pre-gate row leaves behind, reached through the product's own doors: classify the
   * fork "an agent", make the link as an agent, then hand the fork to the owner.
   */
  async function anAgentsLinkOnTheirFork(type: 'supersedes' | 'duplicate_of'): Promise<{ fork: string; other: string }> {
    const fork = await fileFork('Is a module card a boundary', 'an agent')
    const other = await fileFork('The module-label question, untangled', 'an agent')
    const made = type === 'supersedes' ? await link(other, fork, 'supersedes') : await link(fork, other, 'duplicate_of')
    expect(made.statusCode, made.message).toBe(201)
    expect((await queue()).open, 'the setup itself did not take the fork off the queue').not.toContain(fork)

    const handed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${fork}`,
      headers: asAgent,
      payload: { dataPatch: { who_settles_it: THE_OWNER } },
    })
    expect(handed.statusCode, handed.body).toBe(200)
    return { fork, other }
  }

  it('does not let an agent-made `supersedes` take a fork that is the owner’s off the queue', async () => {
    const { fork } = await anAgentsLinkOnTheirFork('supersedes')
    const read = await queue()
    expect(read.open, 'an agent-made supersedes took one of the owner’s forks off the queue').toContain(fork)
    expect(read.left.map((one) => one.proposalId)).not.toContain(fork)
  })

  it('does not let an agent-made `duplicate_of` take a fork that is the owner’s off the queue', async () => {
    const { fork } = await anAgentsLinkOnTheirFork('duplicate_of')
    const read = await queue()
    expect(read.open, 'an agent-made duplicate_of took one of the owner’s forks off the queue').toContain(fork)
    expect(read.left.map((one) => one.proposalId)).not.toContain(fork)
  })

  it('lets the same link count once the person makes it', async () => {
    // The repair a person makes: the link an agent wrote is not counted, and the one the owner writes is.
    const ownersFork = await fileFork('Is a module card a boundary', THE_OWNER)
    const other = await fileNote('The record that replaces it')
    expect((await link(other, ownersFork, 'supersedes', asPerson)).statusCode).toBe(201)
    const read = await queue()
    expect(read.open).not.toContain(ownersFork)
    expect(read.left.find((one) => one.proposalId === ownersFork)?.linkedBy).toBe(THE_TEST_OFFICES_OWNER.id)
  })

  it('counts an agent-made link on a fork the corpus says an agent settles', async () => {
    const mine = await fileFork('Which repository are the module claims relative to', 'an agent')
    const other = await fileFork('Which repository do the module claims belong to', 'an agent')
    expect((await link(mine, other, 'duplicate_of')).statusCode).toBe(201)
    const read = await queue()
    expect(read.open).not.toContain(mine)
    expect(read.left.find((one) => one.proposalId === mine)?.linkedBy).toBe('claude-code')
  })
})

describe('the set of exits is declared once, so the guard and the reader cannot disagree', () => {
  it('holds both link types, with the end the fork is on', async () => {
    const { LINKS_THAT_REPLACE_A_FORK } = await import('../src/server/lib/records.ts')
    expect(LINKS_THAT_REPLACE_A_FORK).toEqual([
      { type: 'supersedes', forkEnd: 'to', why: 'superseded' },
      { type: 'duplicate_of', forkEnd: 'from', why: 'duplicate' },
    ])
  })

})
