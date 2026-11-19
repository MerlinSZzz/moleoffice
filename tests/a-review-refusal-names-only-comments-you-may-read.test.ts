// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSAL OF THE REVIEW DOORS NAMES ONLY THE COMMENTS THE CALLER MAY READ. Option A
 * of a decision, and round 19's report ilg5BnzWQHHN, block b-5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Round 19 made the review doors show a reader only the comments it may read. It left one refusal:
 * POST /api/reviews/:id/organise, refusing a reading, listed every comment id of the review and
 * counted them. So an agent learnt the ids, though not the words, of comments it may not read. The
 * two refusals of POST /send that list the comments named only the readable ones, but called that
 * part of the list "the comments in it".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Made-up agents in a made-up project: ada is written to in one comment of each review, bo in the
 * other, dee in none, and sam holds the secretary card. The owner writes every comment.
 *
 *   - Review one has finished collecting. It holds ada's comment, bo's comment and an old-style
 *     comment (a record of kind `annotation`, which is not a message, so everybody reads it).
 *   - Review two has finished collecting and holds only ada's and bo's comments, so dee may read none.
 *   - ada's and dee's refusals name none of the comments they may not read and do not count them.
 *     The owner's and sam's refusals are the ones everybody got before, naming every comment.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import type { Context } from '../src/shared/targets.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER_ACTOR = { type: 'human', id: THE_PERSON } as const
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function asAgent(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

const STRANGER = 'no-such-comment-anywhere'

let t: TestDb
let app: FastifyInstance

let one = ''
let two = ''
const ids: Record<string, string> = {}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  return { status: reply.statusCode, body: reply.body }
}

async function anAgent(handle: string, role: string | null = null): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...OWNER, 'content-type': 'application/json' },
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', ...(role === null ? {} : { role }) } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })).json() as {
    agents?: { id: string; handle: string }[]
  }
  const row = (listed.agents ?? []).find((a) => a.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

function aModule(title: string): string {
  return t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title,
    data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'A made-up module.' }] },
    actor: OWNER_ACTOR,
  }).id
}

const onRecord = (recordId: string): Context => ({ target: { kind: 'record', recordId, workspaceId: HERE } })

/**
 * One comment by the owner on a record, kept for one agent: a message that says what it is about, with that agent
 * chosen. Since wave 13r round 15 a comment addressed outright with no choice was sent with Send, goes at once and is
 * in no review (record 9BZZVKQxWV9Z, detail 1).
 */
function aComment(body: string, recordId: string, to: string): string {
  return t.api.createRecord({
    workspaceId: HERE,
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: to }], chosenRecipient: { kind: 'agent', agentId: to }, target: { ...onRecord(recordId), place: { at: 'surface' } } },
    actor: OWNER_ACTOR as never,
  }).id
}

/** A reading of the named comments and no others. */
function aReadingOf(commentIds: readonly string[]): unknown {
  return {
    comments: commentIds.map((commentId) => ({ commentId, reading: 'Asks something.', intents: ['ask'], artefacts: ['problem'] })),
    groups: [],
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const reviews = await import('../src/server/lib/reviews.ts')

  const ada = await anAgent('ada-organised')
  const bo = await anAgent('bo-organised')
  await anAgent('dee-organised')
  await anAgent('sam-organised', THE_SECRETARY)

  const gripper = aModule('The made-up gripper')
  one = reviews.startReview({ workspaceId: HERE, entry: onRecord(gripper) }, OWNER_ACTOR).review.id
  ids['ada'] = aComment('amberwick for ada', gripper, ada)
  ids['bo'] = aComment('bramblefen for bo', gripper, bo)
  ids['note'] = t.api.createRecord({
    workspaceId: HERE,
    kind: 'annotation',
    title: 'cloudberry, an old-style comment',
    data: { body: 'cloudberry, an old-style comment', context: onRecord(gripper) },
    actor: OWNER_ACTOR,
  }).id
  expect(reviews.finishCollecting(one, HERE, OWNER_ACTOR).members.map((m) => m.id).sort()).toEqual(
    [ids['ada'], ids['bo'], ids['note']].sort(),
  )

  const conveyor = aModule('The made-up conveyor')
  two = reviews.startReview({ workspaceId: HERE, entry: onRecord(conveyor) }, OWNER_ACTOR).review.id
  ids['ada2'] = aComment('amberwick again for ada', conveyor, ada)
  ids['bo2'] = aComment('bramblefen again for bo', conveyor, bo)
  expect(reviews.finishCollecting(two, HERE, OWNER_ACTOR).members.map((m) => m.id).sort()).toEqual([ids['ada2'], ids['bo2']].sort())
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function expectNone(body: string, traces: readonly string[]): void {
  for (const trace of traces) expect(body, `the reply holds ${trace}`).not.toContain(trace)
}

function expectAll(body: string, traces: readonly string[]): void {
  for (const trace of traces) expect(body, `the reply lacks ${trace}`).toContain(trace)
}

describe('POST /api/reviews/:id/organise refuses a reading, as an agent party to some comments meets it', () => {
  it('a reading that leaves comments out names only the one ada may read, and counts no comment of the review', async () => {
    const ada = await post(`/api/reviews/${one}/organise`, aReadingOf([ids['ada']!]), asAgent('ada-organised'))
    expect(ada.status, ada.body).toBe(400)
    expect(ada.body).toContain(`This reading says nothing about one comment you may read: ${ids['note']!}.`)
    expect(ada.body).toContain('It also says nothing about one or more comments in this review that you may not read.')
    expect(ada.body).toContain('They are not named or counted here.')
    expectNone(ada.body, [ids['bo']!, 'of the 3', 'of the 2'])
  })

  it('a reading of every comment ada may read is still refused, and names nothing', async () => {
    const ada = await post(`/api/reviews/${one}/organise`, aReadingOf([ids['ada']!, ids['note']!]), asAgent('ada-organised'))
    expect(ada.status, ada.body).toBe(400)
    expect(ada.body).toContain('This reading says nothing about one or more comments in this review that you may not read.')
    expectNone(ada.body, [ids['bo']!, ids['ada']!, ids['note']!, 'of the'])
  })

  it('a reading naming a comment outside the review lists only the comments ada may read', async () => {
    const ada = await post(`/api/reviews/${one}/organise`, aReadingOf([STRANGER]), asAgent('ada-organised'))
    expect(ada.status, ada.body).toBe(400)
    expect(ada.body).toContain('The comments in this review that you may read are:')
    expect(ada.body).toContain('Comments you may not read are not named here.')
    expectAll(ada.body, [ids['ada']!, ids['note']!])
    expectNone(ada.body, [ids['bo']!, 'handed over were'])
  })

  it('an agent that may read no comment of the review is told so, with no id and no count', async () => {
    const left = await post(`/api/reviews/${two}/organise`, aReadingOf([]), asAgent('dee-organised'))
    expect(left.status, left.body).toBe(400)
    expect(left.body).toContain(
      'This reading says nothing about one or more comments in this review that you may not read. They are not named or counted here.',
    )
    expectNone(left.body, [ids['ada2']!, ids['bo2']!, 'of the', 'you may read:'])
    const stranger = await post(`/api/reviews/${two}/organise`, aReadingOf([STRANGER]), asAgent('dee-organised'))
    expect(stranger.status, stranger.body).toBe(400)
    expect(stranger.body).toContain('You may read none of the comments in this review, so none is named here.')
    expectNone(stranger.body, [ids['ada2']!, ids['bo2']!])
  })
})

describe('POST /api/reviews/:id/organise refuses a reading, as the owner and a secretary meet it', () => {
  it('a reading that leaves comments out names every comment left out and counts them, as before', async () => {
    for (const who of [OWNER, asAgent('sam-organised')]) {
      const all = await post(`/api/reviews/${one}/organise`, aReadingOf([ids['ada']!]), who)
      expect(all.status, all.body).toBe(400)
      expect(all.body).toContain('This reading covers 1 of the 3 comments it was given and says nothing about 2 of them:')
      expectAll(all.body, [ids['bo']!, ids['note']!])
      expectNone(all.body, ['may not read'])
    }
  })

  it('a reading naming a comment outside the review lists every comment handed over, as before', async () => {
    for (const who of [OWNER, asAgent('sam-organised')]) {
      const all = await post(`/api/reviews/${one}/organise`, aReadingOf([STRANGER]), who)
      expect(all.status, all.body).toBe(400)
      expect(all.body).toContain('The comments handed over were:')
      expectAll(all.body, [ids['ada']!, ids['bo']!, ids['note']!])
      expectNone(all.body, ['may not read'])
    }
  })
})

describe('POST /api/reviews/:id/send refuses a comment outside the review', () => {
  for (const [what, body] of [
    ['named in `only`', { only: [STRANGER] }],
    ['given a recipient in `to`', { to: [{ commentId: STRANGER, recipient: null }] }],
  ] as const) {
    it(`${what}: ada is told which comments she may read, and that the others are not named`, async () => {
      const ada = await post(`/api/reviews/${one}/send`, body, asAgent('ada-organised'))
      expect(ada.status, ada.body).toBe(400)
      expect(ada.body).toContain('The comments in this review that you may read are:')
      expectAll(ada.body, [ids['ada']!, ids['note']!])
      expectNone(ada.body, [ids['bo']!, 'The comments in it are'])
    })

    it(`${what}: the owner and a secretary are told every comment in it, as before`, async () => {
      for (const who of [OWNER, asAgent('sam-organised')]) {
        const all = await post(`/api/reviews/${one}/send`, body, who)
        expect(all.status, all.body).toBe(400)
        expect(all.body).toContain('The comments in it are:')
        expectAll(all.body, [ids['ada']!, ids['bo']!, ids['note']!])
      }
    })
  }
})
