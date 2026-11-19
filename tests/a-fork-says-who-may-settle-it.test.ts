// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FORK SAYS WHO MAY SETTLE IT, AND THE LINK IS WHERE THAT IS ENFORCED.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * Two things landed on 27 August 2026 and did not meet. An agent gained the right to write a
 * `decision` that says what it stands on (`authority`, commit e058781). A fork gained a field
 * saying who settles it (`who_settles_it`, commit 48f8d29). But settling a fork IS the
 * `derived_from` link from the decision to the proposal — there is no stored flag beside it — and
 * `assertMaySettleFork` still refused that link to every agent, unconditionally. So an agent could
 * write the decision and could not point it at the fork, which means it could not close anything.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE ANSWERS, WHICH ARE WHAT THIS FILE CHECKS
 * ---------------------------------------------------------------------------------------
 *
 *   · `who_settles_it` is "the owner"        — refused to every agent, in the words it always was.
 *   · `who_settles_it` is not there          — refused, and the refusal says THAT is why.
 *   · "an agent" / "the parent" / "a measurement", decision carries an authority   — allowed.
 *   · the same forks, decision carries none  — refused. An opinion closes nothing.
 *   · a person                               — settles any of them, exactly as before.
 *
 * ABSENCE IS NOT PERMISSION, and that is the case worth having a test for. A fork nobody has
 * classified is not an agent's to close, because nobody has said it is not the owner's — their own
 * rule is that a fork you are unsure about is theirs. The easy defect here is a guard that treats a
 * missing field as "not the owner, therefore mine", and `a fork nobody has classified` below is the
 * test that goes red when somebody writes it.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFUSAL IS THE FEATURE
 * ---------------------------------------------------------------------------------------
 *
 * An agent that is refused has to be able to read what would let it through, so each refusal is
 * checked for two things: what was not written, and what to do instead. A 403 that says only "no"
 * costs the caller its next turn, and the agents reading these are the ones doing the queue sweep.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { DECISION_AUTHORITIES, FORK_SETTLERS, THE_OWNER, type ForkSettler } from '../src/shared/kinds.ts'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}
const AS_PERSON = {
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
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * A fork, classified or not. `undefined` is the fifth answer: nobody has said.
 *
 * WHO FILES IT IS PART OF THE FIXTURE SINCE 3 SEPTEMBER 2026, and the unclassified case is the
 * reason. A fork an AGENT files now says `who_settles_it: "an agent"` unless the agent names
 * something else — `design/messages/ACCEPTANCE.md` W3, under the rule that an
 * engineering question is the agent's — so an agent can no longer file a fork nobody has classified.
 * The person still can, and that is what these fixtures use for the unclassified case. It is the
 * same fork the tests were always about; only who filed it moved.
 */
const fork = (settles: ForkSettler | undefined): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: `Position or force control? (${settles ?? 'unclassified'})`,
    data: {
      question: 'Position control or force control for the handover?',
      options: ['a — position control', 'b — force control'],
      ...(settles === undefined ? {} : { who_settles_it: settles }),
    },
    actor: settles === undefined ? { type: 'human', id: THE_TEST_OFFICES_OWNER.id } : { type: 'agent', id: 'claude-code' },
  }).id

/** A decision, with or without something under it. */
const decision = (authority: string | undefined): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: `Stay on position control (${authority ?? 'nothing under it'})`,
    data: {
      because: 'The left finger has no force sensor, measured on the robot on 27 August 2026.',
      ...(authority === undefined ? {} : { authority, decided_by: 'claude-code' }),
    },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id

/** POST /api/links, which is the route that performs the act. */
const settle = async (
  decisionId: string,
  forkId: string,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ statusCode: number; json: () => unknown }> =>
  app.inject({
    method: 'POST',
    url: '/api/links',
    headers,
    payload: { fromId: decisionId, toId: forkId, type: 'derived_from' },
  })

const messageOf = (reply: { json: () => unknown }): string => {
  const body = reply.json() as { error?: string; message?: string }
  return `${body.message ?? ''} ${body.error ?? ''}`
}

/** Whether the fork reads back as settled, out of the product's own reader and not out of a query. */
const isSettled = (forkId: string): boolean => {
  const record = t.api.getRecord(forkId)
  if (record === null) return false
  return t.api.proposalResolution(record)?.resolved === true
}

describe('a fork the owner settles is refused to every agent', () => {
  it('refuses it in the words it has always been refused in, and says what the agent’s part was', async () => {
    const reply = await settle(decision('a measurement'), fork(THE_OWNER))
    expect(reply.statusCode).toBe(403)
    const said = messageOf(reply)
    expect(said, 'the refusal no longer says the link IS the act').toContain(
      'the link is the governance act, there is no stored flag beside it',
    )
    expect(said, 'the refusal no longer names who asked').toContain('agent "claude-code"')
    expect(said, 'the refusal no longer tells the agent what its part was').toContain(
      'Filing the proposal was your part and it is done',
    )
    expect(said).toContain('Nothing was written')
  })

  it('refuses it even when the decision cites the owner’s own words', async () => {
    // The strongest authority an agent can carry, on a fork that says the owner settles it. Authority is
    // what makes a decision a decision; it is not what makes a governance fork somebody else's.
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'What the owner said about the handover',
      data: { body: 'Stay on position control until the finger has a sensor.' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'Stay on position control',
      data: { authority: 'the owner said so', decided_by: THE_OWNER, authority_reference: note },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id
    const forkId = fork(THE_OWNER)
    expect((await settle(id, forkId)).statusCode).toBe(403)
    expect(isSettled(forkId)).toBe(false)
  })
})

describe('a fork nobody has classified is refused, and the refusal says that is why', () => {
  it('refuses it, and does not read the empty field as permission', async () => {
    const forkId = fork(undefined)
    const reply = await settle(decision('a measurement'), forkId)
    expect(reply.statusCode).toBe(403)
    expect(isSettled(forkId), 'an unclassified fork was settled by an agent').toBe(false)
  })

  it('says which field is empty, and that an empty field is not permission', async () => {
    const said = messageOf(await settle(decision('a measurement'), fork(undefined)))
    expect(said, 'the refusal does not name the field that is empty').toContain('`who_settles_it`')
    expect(said, 'the refusal does not say nobody has classified it').toContain('nobody has classified')
    expect(said, 'the refusal does not say that absence is not permission').toContain(
      'An empty field is not permission',
    )
    expect(said, 'the refusal does not give the owner’s rule for an unsure fork').toContain(
      'a fork you are unsure about is theirs',
    )
  })

  it('is a different refusal from the one a fork the owner settles gets', async () => {
    // Both are 403 and both are correct, and an agent that could not tell them apart would go and
    // fix the wrong thing. One says the answer is the owner's; the other says nobody has said whose it is.
    const theOwnersRefusal = messageOf(await settle(decision('a measurement'), fork(THE_OWNER)))
    const unsaid = messageOf(await settle(decision('a measurement'), fork(undefined)))
    expect(unsaid).not.toBe(theOwnersRefusal)
    expect(theOwnersRefusal, 'the owner’s refusal now talks about classification').not.toContain('nobody has classified')
    expect(unsaid, 'the unclassified refusal now reads as an actor-type refusal').not.toContain(
      'Filing the proposal was your part',
    )
  })

  it('names the act that would let it through, which is classifying the fork and not settling it', async () => {
    const forkId = fork(undefined)
    const said = messageOf(await settle(decision('a measurement'), forkId))
    expect(said).toContain('WHAT WOULD LET THIS THROUGH')
    expect(said, 'the refusal does not name the route that classifies a fork').toContain(
      `PATCH /api/records/${forkId}`,
    )
    // All four words, so the agent can pick without a second request.
    for (const word of FORK_SETTLERS) expect(said, `the refusal does not offer "${word}"`).toContain(word)
  })

  it('lets the same fork through once THE PERSON says an agent settles it', async () => {
    // The repair the refusal describes, performed exactly as it is written, end to end.
    //
    // THE CLASSIFYING REQUEST IS THE PERSON'S, AND THAT CHANGED ON 27 AUGUST 2026. It used to be the
    // agent's own, and an adversary ran the three steps against the live server: classify an
    // unclassified fork as an agent's, point your own decision at it, delete it. All three answered
    // 200 or 201 and the fork left every fork reading in Mole Office. An agent writing the field that
    // decides whether an agent may close a fork is the agent granting itself the authority, so a
    // classification an agent wrote onto an already-filed fork is no longer read as permission.
    // `design/round-eleven/wave-b/attack.md` section 1b has the run.
    const forkId = fork(undefined)
    const decisionId = decision('a measurement')
    expect((await settle(decisionId, forkId)).statusCode).toBe(403)
    const classified = await app.inject({
      method: 'PATCH',
      url: `/api/records/${forkId}`,
      headers: AS_PERSON,
      payload: { dataPatch: { who_settles_it: 'an agent' } },
    })
    expect(classified.statusCode).toBe(200)
    expect((await settle(decisionId, forkId)).statusCode).toBe(201)
    expect(isSettled(forkId)).toBe(true)
  })

  it('does not let the fork through when the AGENT is the one that classified it', async () => {
    // THE SAME THREE STEPS WITH ONE HEADER CHANGED, which is the whole of the difference.
    const forkId = fork(undefined)
    const decisionId = decision('a measurement')
    const classified = await app.inject({
      method: 'PATCH',
      url: `/api/records/${forkId}`,
      headers: AS_AGENT,
      payload: { dataPatch: { who_settles_it: 'an agent' } },
    })
    expect(classified.statusCode, 'classifying a fork is still open to agents').toBe(200)
    const refused = await settle(decisionId, forkId)
    expect(refused.statusCode, messageOf(refused)).toBe(403)
    expect(messageOf(refused)).toContain('an agent wrote that onto the fork AFTER it was filed')
    expect(isSettled(forkId)).toBe(false)
  })
})

describe('a fork an agent may settle, with a decision that says what it stands on', () => {
  for (const settles of FORK_SETTLERS.filter((word) => word !== THE_OWNER)) {
    it(`goes through on a fork marked "${settles}"`, async () => {
      const forkId = fork(settles)
      const reply = await settle(decision('reversible engineering judgement'), forkId)
      expect(reply.statusCode, messageOf(reply)).toBe(201)
      expect(isSettled(forkId), 'the fork does not read back as settled').toBe(true)
    })
  }

  it('accepts every one of the five authorities', async () => {
    for (const word of DECISION_AUTHORITIES) {
      const forkId = fork('an agent')
      const reply = await settle(decision(word), forkId)
      expect(reply.statusCode, `"${word}" was refused: ${messageOf(reply)}`).toBe(201)
    }
  })
})

describe('a decision with no authority settles nothing', () => {
  it('is refused on a fork an agent may otherwise settle', async () => {
    const forkId = fork('an agent')
    const reply = await settle(decision(undefined), forkId)
    expect(reply.statusCode).toBe(403)
    expect(isSettled(forkId), 'a decision standing on nothing settled a fork').toBe(false)
  })

  it('says the fork IS open to the agent, and that the decision is what is missing something', async () => {
    const said = messageOf(await settle(decision(undefined), fork('an agent')))
    expect(said, 'the refusal does not say what the fork says').toContain('this fork IS open to')
    expect(said, 'the refusal does not name the empty field').toContain('carries no `authority`')
    expect(said, 'the refusal does not say why the field matters').toContain(
      'the field that makes a decision different from an opinion',
    )
    expect(said, 'the refusal does not list the five').toContain('THE FIVE ARE')
    for (const word of DECISION_AUTHORITIES) expect(said, `"${word}" is not offered`).toContain(word)
  })

  it('names the decision it is talking about, so the agent knows which record to fix', async () => {
    const decisionId = decision(undefined)
    const said = messageOf(await settle(decisionId, fork('a measurement')))
    expect(said).toContain(decisionId)
    expect(said).toContain(`PATCH /api/records/${decisionId}`)
  })

  it('refuses an authority word that is not one of the five', async () => {
    // Written straight into the row, because the write door already refuses this word. The reader
    // still has to defend itself: rows written before the field existed, and rows arriving through
    // an archive, are not covered by any write gate that was not standing when they were made.
    const decisionId = decision('a measurement')
    writeDataBypassingTheGate(t, decisionId, { authority: 'it seemed right', decided_by: 'claude-code' })
    const forkId = fork('an agent')
    const reply = await settle(decisionId, forkId)
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('which is not one of the five')
    expect(isSettled(forkId)).toBe(false)
  })
})

describe('a person settles any of them, and the clauses about a person did not move', () => {
  for (const settles of [...FORK_SETTLERS, undefined]) {
    it(`settles a fork marked "${settles ?? 'nothing at all'}"`, async () => {
      const forkId = fork(settles)
      const reply = await settle(decision('a measurement'), forkId, AS_PERSON)
      expect(reply.statusCode, messageOf(reply)).toBe(201)
      expect(isSettled(forkId)).toBe(true)
    })
  }

  it('settles one with a decision that stands on nothing, because a person deciding is a decision', async () => {
    const forkId = fork(THE_OWNER)
    const reply = await settle(decision(undefined), forkId, AS_PERSON)
    expect(reply.statusCode, messageOf(reply)).toBe(201)
    expect(isSettled(forkId)).toBe(true)
  })

  it('still refuses a request that sent no actor headers', async () => {
    const forkId = fork('an agent')
    const reply = await settle(decision('a measurement'), forkId, { 'x-mole-office-workspace': 'default' })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('sent no actor headers')
    expect(isSettled(forkId)).toBe(false)
  })

  it('still refuses a name Mole Office cannot place', async () => {
    // The clause that closed §8.11: `human:` plus any name at all used to be a person here.
    const { assertMaySettleFork } = await import('../src/server/lib/records.ts')
    expect(() =>
      assertMaySettleFork(
        { kind: 'decision', title: 'a decision', data: { authority: 'a measurement' } },
        { id: fork('an agent'), kind: 'proposal', title: 'a fork' },
        'derived_from',
        { type: 'human', id: `not-${THE_TEST_OFFICES_OWNER.id}-at-all`, stated: true, from: 'this machine' },
      ),
    ).toThrow(/not somebody Mole Office can place/)
  })

  it('still refuses a person asking from another machine, in the words it always used', async () => {
    const { assertMaySettleFork } = await import('../src/server/lib/records.ts')
    expect(() =>
      assertMaySettleFork(
        { kind: 'decision', title: 'a decision', data: { authority: 'a measurement' } },
        { id: fork('an agent'), kind: 'proposal', title: 'a fork' },
        'derived_from',
        { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true, from: 'another machine' },
      ),
    ).toThrow(/Settling a fork is the person's own act/)
  })

  it('refuses an agent from another machine too, and does not tell it settling is the person’s act', async () => {
    // An agent can reach the arrival clause now, which it never could before. The condition is
    // unchanged; what it says has to be true of whoever is in front of it.
    const { assertMaySettleFork } = await import('../src/server/lib/records.ts')
    let said = ''
    try {
      assertMaySettleFork(
        { kind: 'decision', title: 'a decision', data: { authority: 'a measurement' } },
        { id: fork('an agent'), kind: 'proposal', title: 'a fork' },
        'derived_from',
        { type: 'agent', id: 'claude-code', stated: true, from: 'another machine' },
      )
    } catch (error) {
      said = (error as Error).message
    }
    expect(said, 'a remote agent settled an engineering fork').toContain('came from another machine')
    expect(said, 'the refusal tells an agent that settling is the person’s own act').not.toContain(
      "the person's own act",
    )
    expect(said, 'the refusal tells an agent the fork is the person’s to answer').not.toContain(
      "still the person's to answer",
    )
  })
})

describe('the guard is registered where every guard is listed', () => {

  it('reads who settles a fork off the stored record and calls an unknown word nobody', async () => {
    const { whoSettlesThisFork } = await import('../src/server/lib/records.ts')
    expect(whoSettlesThisFork(fork('the parent'))).toBe('the parent')
    expect(whoSettlesThisFork(fork(undefined)), 'an absent field is not one of the four').toBeNull()
    expect(whoSettlesThisFork('no-such-record'), 'a fork that is not there is not classified').toBeNull()
    const odd = fork(undefined)
    writeDataBypassingTheGate(t, odd, { question: 'q', options: ['a', 'b'], who_settles_it: 'me' })
    expect(whoSettlesThisFork(odd), 'a word that is not one of the four read as a classification').toBeNull()
  })
})
