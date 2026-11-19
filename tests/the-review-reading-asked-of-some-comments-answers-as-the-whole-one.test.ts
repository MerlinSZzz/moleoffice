// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH REVIEW HOLDS A COMMENT, AND WHETHER ITS WORDS HAVE GONE OUT, ASKED OF SOME COMMENTS, ANSWER FOR EACH OF THEM
 * WHAT THE WHOLE PROJECT'S READING ANSWERS. Wave 13y round 34, item 1.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with seven reviews still able to send: the message
 * worker's queue asked `commentsAReviewHasNotSentYet` (src/server/lib/reviews.ts) about the whole project on every
 * pass, 255 to 281 ms and 320 MB read, to look up the one comment it had queued. Inside it, `commentsGoneOut`
 * (src/server/lib/dispatch.ts) read 109 MB to find the markers of words already gone out, of which the copy had none.
 * Now the queue names the comments it has queued, and each reading is asked about those alone.
 *
 * WHAT THIS HOLDS, in one office with a comment of every shape these readings tell apart (all made up):
 *   1. the whole reading holds the comments it should and no other, so the comparison below is not of two empty maps;
 *   2. asked about one id at a time, for every comment, a message that is not a comment, and an id nothing has, the
 *      review reading answers that id with what the whole one answers, and nothing for any other id; asked about all
 *      of them at once, the same;
 *   3. `commentsGoneOut`, asked the same way, answers the ids of the whole answer that were asked; the whole answer
 *      has a comment a conversation's message carried and the marker of a comment in the project, and not a marker
 *      whose record is in another project or not stored;
 *   4. with one review's written-down membership made unreadable, the whole reading holds nothing, because each other
 *      review that lists a comment saved before it started says it cannot tell; and asked about one comment, it holds
 *      nothing either.
 *
 * WHAT IT DOES NOT HOLD. How long a reading takes; the times are in the round's report. Which comments the queue
 * names.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AGENT = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'asked-reading-agent' }
const BEFORE = '2026-10-01 09:00:00'

/** Every id this file asks about, by what it is. */
const id: Record<string, string> = {}
const review: Record<string, string> = {}

async function call(method: 'POST' | 'GET', path: string, body: unknown, headers: Record<string, string>, expected: number): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  expect(reply.statusCode, `${method} ${path}: ${reply.body.slice(0, 300)}`).toBe(expected)
  return reply.json() as Record<string, unknown>
}

async function file(kind: string, data: Record<string, unknown>, headers: Record<string, string> = PERSON): Promise<string> {
  const body = { kind, title: `A made-up ${kind}`, data }
  const filed = await call('POST', '/api/records', body, headers, theAnswerToAWriteInATestOffice(headers, body))
  return (filed['record'] as { id: string }).id
}

const on = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } })

async function startAReview(recordId: string): Promise<string> {
  const made = await call('POST', '/api/reviews', { entry: on(recordId) }, PERSON, 201)
  return (made['review'] as { id: string }).id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await call('POST', '/api/agents/started', { handle: 'asked-reading-agent', name: 'asked-reading-agent', workArea: ['src'] }, PERSON, 201)
  const participant = await call('GET', '/api/participants/agent/asked-reading-agent', undefined, PERSON, 200)
  const agentRecord = (participant['participant'] as { record?: string | null }).record ?? ''
  expect(agentRecord, 'the agent has a record').not.toBe('')
  const chosen = { chosenRecipient: { kind: 'agent', agentId: agentRecord } }
  for (const page of ['one', 'two', 'three', 'four', 'outside']) id[`page ${page}`] = await file('note', { body: `A made-up page ${page}.` })

  // SAVED BEFORE ANY REVIEW STARTED. The first is the person's and is taken in by the review on page one when it
  // starts. The second is an agent's, on the same page, so no review takes it in. The third is the person's, on page
  // two; the review there forgets what it took in, below, so it lists the comment as saved without sending instead.
  id['taken in'] = await file('message', { body: 'A made-up comment taken in.', target: on(id['page one'] ?? ''), ...chosen })
  id['an agent saved before'] = await file('message', { body: 'A made-up comment an agent saved.', target: on(id['page one'] ?? '') }, AGENT)
  id['saved before'] = await file('message', { body: 'A made-up comment saved before.', target: on(id['page two'] ?? ''), ...chosen })
  const backdate = t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?')
  backdate.run(BEFORE, id['an agent saved before'])
  backdate.run(BEFORE, id['saved before'])

  review['one'] = await startAReview(id['page one'] ?? '')
  review['two'] = await startAReview(id['page two'] ?? '')
  // A REVIEW STARTED BEFORE IT RECORDED WHAT IT TOOK IN, as one written before that column existed reads.
  t.client.sqlite.prepare('UPDATE reviews SET taken_in = NULL WHERE id = ?').run(review['two'])

  // WRITTEN WHILE THE REVIEW ON PAGE ONE COLLECTS.
  id['written'] = await file('message', { body: 'A made-up comment written in the review.', target: on(id['page one'] ?? ''), ...chosen })
  id['gone out'] = await file('message', { body: 'A made-up comment whose words went out.', target: on(id['page one'] ?? ''), ...chosen })
  id['an agent wrote'] = await file('message', { body: 'A made-up comment an agent wrote.', target: on(id['page one'] ?? '') }, AGENT)
  id['sent on its own'] = await file('message', { body: 'A made-up comment sent at once.', target: on(id['page one'] ?? ''), to: [{ kind: 'agent', id: 'asked-reading-agent' }] })
  id['outside'] = await file('message', { body: 'A made-up comment on another page.', target: on(id['page outside'] ?? ''), ...chosen })
  id['carried'] = await file('message', { body: 'A made-up comment a conversation carried.', target: on(id['page one'] ?? ''), ...chosen })

  // A REVIEW WHOSE MEMBERSHIP IS WRITTEN DOWN, and a comment written after that.
  review['three'] = await startAReview(id['page three'] ?? '')
  id['frozen'] = await file('message', { body: 'A made-up comment in a collected review.', target: on(id['page three'] ?? ''), ...chosen })
  await call('POST', `/api/reviews/${review['three'] ?? ''}/finish-collecting`, undefined, PERSON, 200)
  id['after collecting'] = await file('message', { body: 'A made-up comment after collecting.', target: on(id['page three'] ?? ''), ...chosen })

  // A REVIEW NOBODY IS GOING TO SEND.
  review['four'] = await startAReview(id['page four'] ?? '')
  id['abandoned'] = await file('message', { body: 'A made-up comment in an abandoned review.', target: on(id['page four'] ?? ''), ...chosen })
  await call('POST', `/api/reviews/${review['four'] ?? ''}/abandon`, undefined, PERSON, 200)

  id['not a comment'] = await file('message', { body: 'A made-up message.', to: [{ kind: 'agent', id: 'asked-reading-agent' }] })
  id['nothing has it'] = 'no-such-record'

  // THE MARKERS OF WORDS THAT WENT OUT BEFORE ANY CONVERSATION RECORDED THEM: one for a comment in the project, one
  // whose record is filed in another project, and one whose record is not stored.
  id['elsewhere'] = 'asked-elsewhere'
  t.client.sqlite
    .prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES (?, 'elsewhere', 'owner', ?, ?, 'annotation', 'A made-up comment in another project', NULL, '{"body":"x"}', NULL, 'fixture')`,
    )
    .run(id['elsewhere'], BEFORE, BEFORE)
  const marker = t.client.sqlite.prepare("INSERT INTO annotation_words_fixed (annotation_id, fixed_at, because) VALUES (?, ?, 'A made-up marker.')")
  for (const one of [id['gone out'], id['elsewhere'], id['nothing has it']]) marker.run(one, BEFORE)
  // AND A MESSAGE IN A CONVERSATION OF THE PROJECT THAT CARRIED A COMMENT'S WORDS, past `queued`.
  t.client.sqlite
    .prepare("INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) VALUES ('asked-thread', 'default', 'A made-up conversation', 'direct', 'open', ?, ?, 'human:owner')")
    .run(BEFORE, BEFORE)
  t.client.sqlite
    .prepare(
      "INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by, from_annotation_id) VALUES ('asked-carrier', 'asked-thread', 1, 'human', 'ask', 'The made-up words', 'sent', ?, 'human:owner', ?)",
    )
    .run(BEFORE, id['carried'])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function readings() {
  const { commentsAReviewHasNotSentYet } = await import('../src/server/lib/reviews.ts')
  const { commentsGoneOut } = await import('../src/server/lib/dispatch.ts')
  const { justThisProject } = await import('../src/shared/which-projects.ts')
  return {
    held: (only?: ReadonlySet<string>) => commentsAReviewHasNotSentYet('default', ...(only === undefined ? [] : [only])),
    gone: (only?: readonly string[]) => commentsGoneOut(justThisProject('default'), ...(only === undefined ? [] : [only])),
  }
}

/** For every id, the reading asked of that id alone, and asked of all of them. */
async function expectEachAnswersAsTheWhole(): Promise<void> {
  const { held } = await readings()
  const whole = held()
  const every = Object.values(id)
  for (const [what, one] of Object.entries(id)) {
    const asked = held(new Set([one]))
    expect([...asked.keys()], `${what}: asked of it alone, only it is answered`).toEqual(whole.has(one) ? [one] : [])
    expect(asked.get(one), `${what}: asked of it alone`).toEqual(whole.get(one))
  }
  const all = held(new Set(every))
  expect([...all.keys()].sort(), 'asked of every id').toEqual([...whole.keys()].filter((one) => every.includes(one)).sort())
  for (const one of every) expect(all.get(one), `asked of every id: ${one}`).toEqual(whole.get(one))
}

describe('an office with a comment of every shape', () => {
  it('1: the whole reading holds the comments it should and no other', async () => {
    const { held } = await readings()
    const whole = held()
    const names = Object.fromEntries(Object.entries(id).map(([what, one]) => [one, what]))
    expect([...whole.keys()].map((one) => names[one] ?? one).sort()).toEqual(['frozen', 'saved before', 'taken in', 'written'])
  })

  it('2: asked of some comments, the review reading answers each as the whole one does', async () => {
    await expectEachAnswersAsTheWhole()
  })

  it('3: asked of some comments, the gone-out reading answers each as the whole one does', async () => {
    const { gone } = await readings()
    const whole = gone()
    expect(whole, 'the carried comment and the marker in the project count, and the other two markers do not').toEqual([id['carried'], id['gone out']].sort())
    for (const [what, one] of Object.entries(id)) expect(gone([one]), what).toEqual(whole.filter((each) => each === one))
    expect(gone(Object.values(id)), 'asked of every id').toEqual(whole)
    expect(gone([]), 'asked of none').toEqual([])
  })
})

describe('with one review whose written-down membership cannot be read', () => {
  it('4: holds nothing, asked of the whole project or of one comment', async () => {
    t.client.sqlite.prepare("UPDATE reviews SET frozen = '{not JSON' WHERE id = ?").run(review['three'])
    const { held } = await readings()
    expect([...held().keys()], 'each review that lists a comment saved before it says it cannot tell').toEqual([])
    await expectEachAnswersAsTheWhole()
  })
})
