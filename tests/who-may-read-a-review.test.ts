// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY READ A REVIEW'S COMMENTS, option A, on the review doors.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13j put the rule on about sixty doors: an agent reads only the messages it is a party to, and
 * a secretary and the owner read every one. It left the review doors. A comment in a review is a
 * message, so GET /api/reviews/:id, its /organise and /send previews and its /not-in-it list showed
 * any agent the words of comments it was no party to.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Made-up agents in a made-up project: ada is written to in one comment of each review, bo in the
 * other, dee in none, and sam holds the secretary card. Every comment is written as the owner.
 *
 *   - Review one is still collecting. Review two has finished collecting. It also holds an old-style
 *     comment, a record of kind `annotation`, which is not a message and so is read by everybody, as
 *     on every record door. A reading was kept beside that one (a message has no place to keep one),
 *     with a group over it and bo's comment. A comment to bo written after review two finished
 *     collecting is one of the comments /not-in-it lists.
 *   - For each of the four doors: ada sees her comments and not bo's; dee sees no comment's words;
 *     sam and the owner see every one. The words, the ids, the readings and the group's sentence of a
 *     comment left out are nowhere in the reply, and the counts are over what the reader may see.
 *
 * Every word below is found in one comment and nowhere else, so a reply that holds it holds the comment.
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

// THE WORDS OF EACH COMMENT, of the readings beside them, and of the group over two of them.
const ADA_COLLECTING = 'amberwick-for-ada-while-collecting'
const BO_COLLECTING = 'bramblefen-for-bo-while-collecting'
const ADA_FROZEN = 'amberwick-for-ada-once-collected'
const BO_FROZEN = 'bramblefen-for-bo-once-collected'
const BO_LATER = 'bramblefen-for-bo-written-later'
const ED_WORDS = 'damsonfield-from-ed-to-bo'
const NOTE_WORDS = 'cloudberry-an-old-style-comment'
const NOTE_READING = 'cloudberry-reading-of-the-old-style-comment.'
const GROUP_SAYS = 'bramblefen-and-cloudberry-say-the-same-thing.'

let t: TestDb
let app: FastifyInstance

let collecting = ''
let collected = ''
let edsReview = ''
const ids: Record<string, string> = {}

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

async function anAgent(handle: string, role: string | null = null): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...OWNER, 'content-type': 'application/json' },
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', ...(role === null ? {} : { role }) } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const reviews = await import('../src/server/lib/reviews.ts')

  const ada = await anAgent('ada-reviewed')
  const bo = await anAgent('bo-reviewed')
  await anAgent('dee-bystander')
  await anAgent('sam-secretary', THE_SECRETARY)

  const one = aModule('The made-up gripper')
  const two = aModule('The made-up conveyor')

  collecting = reviews.startReview({ workspaceId: HERE, entry: onRecord(one) }, OWNER_ACTOR).review.id
  ids['adaCollecting'] = aComment(ADA_COLLECTING, one, ada)
  ids['boCollecting'] = aComment(BO_COLLECTING, one, bo)

  collected = reviews.startReview({ workspaceId: HERE, entry: onRecord(two) }, OWNER_ACTOR).review.id
  ids['adaFrozen'] = aComment(ADA_FROZEN, two, ada)
  ids['boFrozen'] = aComment(BO_FROZEN, two, bo)
  ids['note'] = t.api.createRecord({
    workspaceId: HERE,
    kind: 'annotation',
    title: NOTE_WORDS,
    data: { body: NOTE_WORDS, context: onRecord(two) },
    actor: OWNER_ACTOR,
  }).id
  const frozen = reviews.finishCollecting(collected, HERE, OWNER_ACTOR)
  expect(frozen.members.map((m) => m.id).sort()).toEqual([ids['adaFrozen'], ids['boFrozen'], ids['note']].sort())
  reviews.keepOrganised(
    collected,
    HERE,
    {
      comments: [
        { commentId: ids['adaFrozen'], reading: 'Asks something.', intents: ['ask'], artefacts: ['problem'] },
        { commentId: ids['boFrozen'], reading: 'Asks something.', intents: ['ask'], artefacts: ['problem'] },
        { commentId: ids['note'], reading: NOTE_READING, intents: ['ask'], artefacts: ['problem'] },
      ],
      groups: [{ says: GROUP_SAYS, commentIds: [ids['note'], ids['boFrozen']] }],
    },
    OWNER_ACTOR,
  )
  // WRITTEN AFTER REVIEW TWO FINISHED COLLECTING, so it is one of the comments /not-in-it lists.
  ids['boLater'] = aComment(BO_LATER, two, bo)

  // REVIEW THREE IS AN AGENT'S: ed starts it and writes one comment to bo, so the owner is no party to
  // that comment and reads it only because the office belongs to the owner. Nothing answers as bo in this test world,
  // so the office also gave the owner a copy; that one copy is taken out, as
  // tests/who-may-read-which-message.test.ts does, and the comment keeps its addressee and its words.
  await anAgent('ed-writer')
  const three = aModule('The made-up hopper')
  const ed = { type: 'agent', id: 'ed-writer' } as const
  edsReview = reviews.startReview({ workspaceId: HERE, entry: onRecord(three) }, ed).review.id
  ids['ed'] = t.api.createRecord({
    workspaceId: HERE,
    kind: 'message',
    title: 'A comment from ed',
    data: { body: ED_WORDS, to: [{ kind: 'agent', id: bo }], chosenRecipient: { kind: 'agent', agentId: bo }, target: { ...onRecord(three), place: { at: 'surface' } } },
    actor: ed as never,
  }).id
  t.client.sqlite.prepare("DELETE FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'").run(ids['ed'])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Everything of bo's that ada may not see: the words, the group's sentence and the ids. */
function bosTraces(): string[] {
  return [BO_COLLECTING, BO_FROZEN, BO_LATER, GROUP_SAYS, ids['boCollecting']!, ids['boFrozen']!, ids['boLater']!]
}

/** Everything of every message comment. */
function everyTrace(): string[] {
  return [...bosTraces(), ADA_COLLECTING, ADA_FROZEN, ids['adaCollecting']!, ids['adaFrozen']!]
}

function expectNone(body: string, traces: readonly string[]): void {
  for (const trace of traces) expect(body, `the reply holds ${trace}`).not.toContain(trace)
}

function expectAll(body: string, traces: readonly string[]): void {
  for (const trace of traces) expect(body, `the reply lacks ${trace}`).toContain(trace)
}

describe('GET /api/reviews/:id', () => {
  it('a party to one comment of a collecting review sees that one and not the other, and the count is one', async () => {
    const read = await get(`/api/reviews/${collecting}`, asAgent('ada-reviewed'))
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(ADA_COLLECTING)
    expectNone(read.body, bosTraces())
    expect(read.json['count']).toBe(1)
  })

  it('a party to one comment of a collected review sees that one and the old-style one, and no group over the other', async () => {
    const read = await get(`/api/reviews/${collected}`, asAgent('ada-reviewed'))
    expect(read.status, read.body).toBe(200)
    expectAll(read.body, [ADA_FROZEN, NOTE_WORDS, NOTE_READING])
    expectNone(read.body, bosTraces())
    expect(read.json['count']).toBe(2)
    expect((read.json['readiness'] as { from: { members: number } }).from.members).toBe(2)
  })

  it('an agent party to none still reads the review, with no message comment in it', async () => {
    const one = await get(`/api/reviews/${collecting}`, asAgent('dee-bystander'))
    expect(one.status, one.body).toBe(200)
    expect((one.json['review'] as { id: string }).id).toBe(collecting)
    expect(one.json['members']).toEqual([])
    expect(one.json['count']).toBe(0)
    expectNone(one.body, everyTrace())
    const two = await get(`/api/reviews/${collected}`, asAgent('dee-bystander'))
    expect(two.status, two.body).toBe(200)
    expect((two.json['members'] as { id: string }[]).map((m) => m.id)).toEqual([ids['note']])
    expect(two.json['count']).toBe(1)
    expectNone(two.body, everyTrace())
  })

  it('a secretary and the owner see every comment, reading and group', async () => {
    for (const who of [asAgent('sam-secretary'), OWNER]) {
      const one = await get(`/api/reviews/${collecting}`, who)
      expect(one.status, one.body).toBe(200)
      expectAll(one.body, [ADA_COLLECTING, BO_COLLECTING])
      const two = await get(`/api/reviews/${collected}`, who)
      expect(two.status, two.body).toBe(200)
      expectAll(two.body, [ADA_FROZEN, BO_FROZEN, NOTE_WORDS, NOTE_READING, GROUP_SAYS])
      expect(two.json['count']).toBe(3)
    }
  })
})

describe('GET /api/reviews/:id, a review an agent started', () => {
  it('the owner reads a comment they are no party to, and so does a secretary', async () => {
    for (const who of [OWNER, asAgent('sam-secretary')]) {
      const read = await get(`/api/reviews/${edsReview}`, who)
      expect(read.status, read.body).toBe(200)
      expect(read.body).toContain(ED_WORDS)
    }
  })

  it('the addressee reads it and an agent party to none does not', async () => {
    const bo = await get(`/api/reviews/${edsReview}`, asAgent('bo-reviewed'))
    expect(bo.body).toContain(ED_WORDS)
    const dee = await get(`/api/reviews/${edsReview}`, asAgent('dee-bystander'))
    expect(dee.status, dee.body).toBe(200)
    expect(dee.body).not.toContain(ED_WORDS)
    expect(dee.body).not.toContain(ids['ed'])
    expect(dee.json['count']).toBe(0)
  })
})

describe('GET /api/reviews/:id/organise', () => {
  it('asks about the comments the reader may read and no other', async () => {
    const ada = await get(`/api/reviews/${collected}/organise`, asAgent('ada-reviewed'))
    expect(ada.status, ada.body).toBe(200)
    expect(ada.body).toContain(ADA_FROZEN)
    expectNone(ada.body, bosTraces())
  })

  it('an agent party to none is shown no comment’s words', async () => {
    const dee = await get(`/api/reviews/${collected}/organise`, asAgent('dee-bystander'))
    expectNone(dee.body, everyTrace())
  })

  it('a secretary and the owner are asked about every comment', async () => {
    for (const who of [asAgent('sam-secretary'), OWNER]) {
      const asked = await get(`/api/reviews/${collected}/organise`, who)
      expect(asked.status, asked.body).toBe(200)
      expectAll(asked.body, [ADA_FROZEN, BO_FROZEN])
    }
  })
})

describe('GET /api/reviews/:id/send', () => {
  it('lists where the reader’s own comments would go, and counts only those', async () => {
    const ada = await get(`/api/reviews/${collected}/send`, asAgent('ada-reviewed'))
    expect(ada.status, ada.body).toBe(200)
    expect(ada.body).toContain(ids['adaFrozen'])
    expectNone(ada.body, bosTraces())
    expect((ada.json['comments'] as unknown[]).length).toBe(2)
    expect(Number(ada.json['going']) + Number(ada.json['staying'])).toBe(2)
  })

  it('an agent party to none is shown no comment', async () => {
    const dee = await get(`/api/reviews/${collected}/send`, asAgent('dee-bystander'))
    expect(dee.status, dee.body).toBe(200)
    expect((dee.json['comments'] as { id: string }[]).map((one) => one.id)).toEqual([ids['note']])
    expectNone(dee.body, everyTrace())
  })

  it('a secretary and the owner see every comment', async () => {
    for (const who of [asAgent('sam-secretary'), OWNER]) {
      const all = await get(`/api/reviews/${collected}/send`, who)
      expect(all.status, all.body).toBe(200)
      expectAll(all.body, [ids['adaFrozen']!, ids['boFrozen']!])
      expect((all.json['comments'] as unknown[]).length).toBe(3)
    }
  })
})

describe('GET /api/reviews/:id/not-in-it', () => {
  it('leaves out a comment the reader may not read, and does not count it', async () => {
    const ada = await get(`/api/reviews/${collected}/not-in-it`, asAgent('ada-reviewed'))
    expect(ada.status, ada.body).toBe(200)
    expectNone(ada.body, bosTraces())
    // ada's own comment on review one is outside review two, and she may read it.
    expect(ada.body).toContain(ADA_COLLECTING)
    expect(ada.json['total']).toBe((ada.json['rows'] as unknown[]).length)
  })

  it('a secretary and the owner see the comment written later', async () => {
    for (const who of [asAgent('sam-secretary'), OWNER]) {
      const all = await get(`/api/reviews/${collected}/not-in-it`, who)
      expect(all.status, all.body).toBe(200)
      expectAll(all.body, [BO_LATER, BO_COLLECTING, ADA_COLLECTING])
    }
  })

  it('bo sees the comment written to bo later', async () => {
    const bo = await get(`/api/reviews/${collected}/not-in-it`, asAgent('bo-reviewed'))
    expect(bo.body).toContain(BO_LATER)
    expect(bo.body).not.toContain(ADA_COLLECTING)
  })
})

describe('the two review doors that write, as an agent meets them', () => {
  async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: string }> {
    const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
    return { status: reply.statusCode, body: reply.body }
  }

  it('POST /api/reviews/:id/send refuses a review nothing in which can go, naming only what the caller may read', async () => {
    const ada = await post(`/api/reviews/${collected}/send`, {}, asAgent('ada-reviewed'))
    expect(ada.status, ada.body).toBe(409)
    expect(ada.body).toContain(ids['adaFrozen'])
    expectNone(ada.body, bosTraces())
    const owner = await post(`/api/reviews/${collected}/send`, {}, OWNER)
    expect(owner.status, owner.body).toBe(409)
    expectAll(owner.body, [ids['adaFrozen']!, ids['boFrozen']!])
  })

  it('POST /api/reviews/:id/organise answers with the review as the caller may see it', async () => {
    const reading = {
      comments: [ids['adaFrozen'], ids['boFrozen'], ids['note']].map((commentId) => ({
        commentId,
        reading: commentId === ids['note'] ? NOTE_READING : 'Asks something.',
        intents: ['ask'],
        artefacts: ['problem'],
      })),
      groups: [{ says: GROUP_SAYS, commentIds: [ids['note'], ids['boFrozen']] }],
    }
    const ada = await post(`/api/reviews/${collected}/organise`, reading, asAgent('ada-reviewed'))
    expect(ada.status, ada.body).toBe(200)
    const review = JSON.stringify((JSON.parse(ada.body) as { review: unknown }).review)
    expect(review).toContain(ADA_FROZEN)
    expectNone(review, bosTraces())
  })
})
