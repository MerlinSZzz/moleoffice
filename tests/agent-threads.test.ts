// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW ACCUMULATES: comments are stored the moment they are written, and can be changed or
 * removed until they go.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The owner: *"Do not lose review comments on navigation or ordinary reload. These are meaningful
 * human inputs and should be durable enough that a browser accident does not erase an hour of
 * review."* So a comment is a row on the server from the moment it is written, and:
 *
 *   · it can be inspected, changed and removed WHILE IT IS STILL WAITING, and not after — a
 *     question that changes after the answer was given is a question nobody can check;
 *   · every object with a comment waiting can be found in ONE request, because the browser draws
 *     a mark on each of them and must not ask once per object;
 *   · a comment says who wrote it, and the role is the writer's own actor type rather than
 *     something the request may claim.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/**
 * A PROJECT OF ITS OWN FOR EACH CASE, so a conversation list and the marks see only what this case
 * wrote in the office the file shares. The readings of the message table stay over the whole table,
 * and each case reads them against the rows that were there when it started.
 */
let WORKSPACE = 'default'
let HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
let AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance
let caseNumber = 0
/** The ids of every row in the message table when this case started. */
let messagesAtStart = new Set<string>()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN = { ...HUMAN, 'x-mole-office-workspace': WORKSPACE }
  AGENT = { ...AGENT, 'x-mole-office-workspace': WORKSPACE }
  const at = '2026-08-14 09:00:00'
  t.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(WORKSPACE, `A test project ${String(caseNumber)}`, at, at)
  messagesAtStart = new Set((t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]).map((r) => r.id))
})

/**
 * Every row of the message table, in any conversation and any project, that was not there when this
 * case started, in position order. The office is shared by the file, so earlier cases' rows are left out.
 */
function messagesSinceStart(): { id: string; body: string; state: string }[] {
  return (
    t.client.sqlite.prepare('SELECT id, body, state FROM agent_messages ORDER BY position').all() as {
      id: string
      body: string
      state: string
    }[]
  ).filter((r) => !messagesAtStart.has(r.id))
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function startReview(title = 'Round six, read again'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title, mode: 'review' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

interface MessageShape {
  id: string
  role: string
  intent: string
  body: string
  state: string
  createdBy: string
  context: Record<string, unknown> | null
  reading: { state: string; about: string; says: string } | null
  recipient: { kind: string; sessionId: string | null; said: string | null; why: string | null } | null
}

async function say(thread: string, payload: Record<string, unknown>, headers = HUMAN): Promise<MessageShape> {
  const res = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/messages`, headers, payload })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { message: MessageShape }).message
}

// ====================================================== the conversation

describe('a conversation holds what was said, in order, with who wrote it', () => {
  it('keeps every comment on the server from the moment it is written', async () => {
    const thread = await startReview()
    await say(thread, { intent: 'review', body: 'The second table has no units.' })
    await say(thread, { intent: 'ask', body: 'Where did the 0.2 mm come from?' })

    // Read back through a different request, which is what a reload is.
    const read = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const detail = read.json() as { thread: { state: string; mode: string }; messages: MessageShape[]; says: string }
    expect(detail.messages.map((m) => m.body)).toEqual(['The second table has no units.', 'Where did the 0.2 mm come from?'])
    expect(detail.messages.every((m) => m.state === 'queued')).toBe(true)
    expect(detail.thread.state).toBe('open')
    // WHAT IS HERE, AND THAT IT HAS NOT GONE. It used to also assert "Finish review", and the
    // language audit of 19 August 2026 found that sentence naming a button captioned "Finish
    // collecting" and saying finishing sends — which is the opposite of the design. The sentence no
    // longer names any button; the button is on screen and carries its own name.
    expect(detail.says).toContain('2 comments')
    const { whatIsWaitingInAConversation } = await import('../src/server/lib/agents.ts')
    expect(detail.says).toContain(whatIsWaitingInAConversation(2))
    expect(detail.says).not.toContain('Finish review')
  })

  it('files a comment under the actor type of whoever wrote it, and does not take a role from the body', async () => {
    const thread = await startReview()
    // THE AGENT IS A PARTY TO THE CONVERSATION: the owner's comment is addressed to it. An agent writes only
    // into a conversation it may read, by a decision of round 8.
    const agentRecord = await file('agent', 'claude-code', { handle: 'claude-code', state: 'active', runtime: 'claude-code' })
    const mine = await say(thread, { intent: 'review', body: 'Mine.', recipient: { kind: 'agent', agentId: agentRecord } })
    expect(mine.role).toBe('human')
    expect(mine.createdBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)

    const theirs = await say(thread, { intent: 'discuss', body: 'Theirs.' }, AGENT)
    expect(theirs.role).toBe('agent')
    expect(theirs.createdBy).toBe('agent:claude-code')

    const claimed = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: AGENT,
      payload: { intent: 'review', body: 'Written by an agent, claiming to be a person.', role: 'human' },
    })
    expect(claimed.statusCode, claimed.body).toBe(400)
    expect((claimed.json() as { error: string }).error).toContain('role')
  })

  it('refuses a word outside the vocabulary and prints the ones it takes', async () => {
    const thread = await startReview()
    const bad = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: { intent: 'complain', body: 'x' },
    })
    expect(bad.statusCode, bad.body).toBe(400)
    expect((bad.json() as { error: string }).error).toContain('ask, discuss, review, change, start')
  })

  it('lists conversations narrowed by state and by mode, with the counts beside them', async () => {
    await startReview('One')
    const direct = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Two', mode: 'direct' },
    })
    expect(direct.statusCode, direct.body).toBe(201)

    const all = await app.inject({ method: 'GET', url: '/api/agent/threads', headers: HUMAN })
    const list = all.json() as { threads: { title: string }[]; counts: Record<string, number> }
    expect(list.threads.length).toBe(2)
    expect(list.counts['open']).toBe(2)
    expect(list.counts['dispatched']).toBe(0)

    const reviews = await app.inject({ method: 'GET', url: '/api/agent/threads?mode=review', headers: HUMAN })
    expect((reviews.json() as { threads: { title: string }[] }).threads.map((x) => x.title)).toEqual(['One'])
  })

  it('will not let a conversation be marked sent by hand', async () => {
    const thread = await startReview()
    const faked = await app.inject({
      method: 'PATCH',
      url: `/api/agent/threads/${thread}`,
      headers: HUMAN,
      payload: { state: 'dispatched' },
    })
    expect(faked.statusCode, faked.body).toBe(409)
    const why = (faked.json() as { error: string }).error
    expect(why).toContain('dispatch')
    expect(why).toContain('look sent when nothing was')

    const abandoned = await app.inject({
      method: 'PATCH',
      url: `/api/agent/threads/${thread}`,
      headers: HUMAN,
      payload: { state: 'abandoned' },
    })
    expect(abandoned.statusCode, abandoned.body).toBe(200)
  })
})

// ====================================================== changing and removing

describe('a comment can be changed and removed while it is still waiting, and not after', () => {
  it('changes a comment, its context and who it is for', async () => {
    const report = await file('note', 'Round six', { body: 'The mount tolerance is 0.2 mm.' })
    const thread = await startReview()
    const first = await say(thread, { intent: 'review', body: 'This is unclear.' })

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${first.id}`,
      headers: HUMAN,
      payload: {
        intent: 'change',
        body: 'Say where the 0.2 mm came from.',
        context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
        recipient: { kind: 'new', why: 'nothing has worked on this yet' },
      },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const message = (changed.json() as { message: MessageShape }).message
    expect(message.intent).toBe('change')
    expect(message.body).toBe('Say where the 0.2 mm came from.')
    expect((message.context?.['target'] as { recordId?: string } | undefined)?.recordId).toBe(report)
    expect(message.recipient?.kind).toBe('new')
    expect(message.reading?.state).toBe('there')
    expect(message.reading?.about).toContain('Round six')
  })

  it('removes one and says what is left waiting', async () => {
    const thread = await startReview()
    const one = await say(thread, { intent: 'review', body: 'First.' })
    await say(thread, { intent: 'review', body: 'Second.' })

    const removed = await app.inject({ method: 'DELETE', url: `/api/agent/messages/${one.id}`, headers: HUMAN })
    expect(removed.statusCode, removed.body).toBe(200)
    const reply = removed.json() as { removed: MessageShape; stillQueued: number; note: string }
    expect(reply.removed.body).toBe('First.')
    expect(reply.stillQueued).toBe(1)
    expect(reply.note).toContain('nothing was sent')

    const left = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    expect((left.json() as { messages: MessageShape[] }).messages.map((m) => m.body)).toEqual(['Second.'])
  })

  it('refuses to change or remove a comment that has already been sent, saying where it went', async () => {
    const thread = await startReview()
    const one = await say(thread, { intent: 'review', body: 'First.', recipient: { kind: 'new' } })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${one.id}`,
      headers: HUMAN,
      payload: { body: 'Actually, never mind.' },
    })
    expect(changed.statusCode, changed.body).toBe(409)
    expect((changed.json() as { error: string }).error).toContain('already been sent')

    const removed = await app.inject({ method: 'DELETE', url: `/api/agent/messages/${one.id}`, headers: HUMAN })
    expect(removed.statusCode, removed.body).toBe(409)

    // And nothing moved. The stored comment is the one the run was given.
    const rows = messagesSinceStart().map((r) => ({ body: r.body, state: r.state }))
    expect(rows).toEqual([{ body: 'First.', state: 'sent' }])
  })

  it('refuses a comment pointing at a record in another project, saying where that record is', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: 'robotics', title: 'Robotics' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const elsewhere = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...HUMAN, 'x-mole-office-workspace': 'robotics' },
      payload: { kind: 'note', title: 'A robotics note', data: { body: 'x' } },
    })
    expect(elsewhere.statusCode, elsewhere.body).toBe(201)
    const id = (elsewhere.json() as { record: { id: string } }).record.id

    const thread = await startReview()
    const refused = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'review',
        body: 'About that other project.',
        context: { target: { kind: 'record', recordId: id, workspaceId: 'robotics' } },
      },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect((refused.json() as { error: string }).error).toContain('robotics')
    expect({ n: messagesSinceStart().length }).toEqual({ n: 0 })
  })

  it('refuses a comment pointing at a record nobody has', async () => {
    const thread = await startReview()
    const refused = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'review',
        body: 'About nothing.',
        context: { target: { kind: 'record', recordId: 'nDx9NOTHINGHERE', workspaceId: WORKSPACE } },
      },
    })
    expect(refused.statusCode, refused.body).toBe(404)
  })
})

// ====================================================== the marks

describe('which objects have a comment waiting, in one request', () => {
  it('answers every marked object at once, grouped, with the quoted words for a span', async () => {
    const report = await file('note', 'Round six', { body: 'The mount tolerance is 0.2 mm and nobody measured it.' })
    const task = await file('task', 'Measure the mount tolerance')
    const thread = await startReview()

    await say(thread, {
      intent: 'change',
      body: 'Say where this came from.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    await say(thread, {
      intent: 'ask',
      body: 'Which rig?',
      context: {
        target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
        span: {
          quote: 'nobody measured it',
          from: 34,
          to: 52,
          field: 'data.body',
        },
      },
    })
    await say(thread, {
      intent: 'start',
      body: 'Do this one next.',
      context: { target: { kind: 'record', recordId: task, workspaceId: WORKSPACE } },
    })

    const marks = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    expect(marks.statusCode, marks.body).toBe(200)
    const reply = marks.json() as {
      marks: {
        key: string
        waiting: number
        spans: { quote: string; from: number; to: number; field?: string }[]
        threads: { id: string }[]
      }[]
      covers: string
    }
    expect(reply.marks.length, 'a comment on a span should mark the object it is inside').toBe(2)
    const onReport = reply.marks.find((m) => m.key === `record/${report}/${WORKSPACE}`)
    expect(onReport?.waiting).toBe(2)
    // THE WORDS AND WHERE THEY WERE, because a page lights the exact characters rather than
    // searching the paragraph for the words. See Mark in src/server/lib/agents.ts.
    expect(onReport?.spans.map((s) => s.quote)).toEqual(['nobody measured it'])
    expect(onReport?.threads.map((x) => x.id)).toEqual([thread])
    expect(reply.marks.find((m) => m.key === `record/${task}/${WORKSPACE}`)?.waiting).toBe(1)
    expect(reply.covers).toContain('still queued')
  })

  it('drops a mark the moment its comment is sent, because it is no longer waiting', async () => {
    const report = await file('note', 'Round six', { body: 'x' })
    const thread = await startReview()
    await say(thread, {
      intent: 'review',
      body: 'One thing.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
      recipient: { kind: 'new' },
    })
    expect(((await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })).json() as { marks: unknown[] }).marks.length).toBe(1)

    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)

    const after = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    const reply = after.json() as { marks: unknown[]; covers: string }
    expect(reply.marks).toEqual([])
    expect(reply.covers, 'an empty answer has to say what it looked at').toContain('open')
  })

  it('drops the marks of a review somebody abandoned, because nobody is waiting for those', async () => {
    const report = await file('note', 'Round six', { body: 'x' })
    const thread = await startReview()
    await say(thread, {
      intent: 'review',
      body: 'One thing.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    expect(((await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })).json() as { marks: unknown[] }).marks.length).toBe(1)

    const walked = await app.inject({
      method: 'PATCH',
      url: `/api/agent/threads/${thread}`,
      headers: HUMAN,
      payload: { state: 'abandoned' },
    })
    expect(walked.statusCode, walked.body).toBe(200)

    // The comment is still queued — it was never sent, and it is still there to read. It is just
    // not something waiting for anybody, so nothing is marked with it.
    const rows = messagesSinceStart().map((r) => ({ state: r.state }))
    expect(rows).toEqual([{ state: 'queued' }])
    expect(((await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })).json() as { marks: unknown[] }).marks).toEqual([])
  })

  it('marks a comment still waiting and not one already sent, in a conversation holding both', async () => {
    // The reachable way to get a comment that has been SENT sitting in a conversation that is
    // OPEN: dispatch it, walk away from the conversation, then pick it up again. What is marked
    // then is what is still waiting, and the comment that went is not.
    const gone = await file('note', 'Round six', { body: 'x' })
    const waiting = await file('task', 'Measure the mount tolerance')
    const thread = await startReview()
    await say(thread, {
      intent: 'review',
      body: 'This one went.',
      context: { target: { kind: 'record', recordId: gone, workspaceId: WORKSPACE } },
      recipient: { kind: 'new' },
    })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)

    for (const state of ['abandoned', 'open']) {
      const moved = await app.inject({
        method: 'PATCH',
        url: `/api/agent/threads/${thread}`,
        headers: HUMAN,
        payload: { state },
      })
      expect(moved.statusCode, moved.body).toBe(200)
    }
    await say(thread, {
      intent: 'review',
      body: 'And this one has not.',
      context: { target: { kind: 'record', recordId: waiting, workspaceId: WORKSPACE } },
    })

    const states = messagesSinceStart().map((r) => r.state)
    expect(states, 'the fixture did not produce a sent comment beside a waiting one').toEqual(['sent', 'queued'])

    const marks = (await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })).json() as {
      marks: { key: string }[]
    }
    expect(marks.marks.map((m) => m.key)).toEqual([`record/${waiting}/${WORKSPACE}`])
  })

  /**
   * WHAT THIS TEST USED TO DEMAND, AND WHY IT WAS CHANGED ON 25 AUGUST 2026.
   *
   * It required `covers` to contain the words *"nothing has a comment waiting on it"*. That is a
   * claim about the whole project, and this reply does not know it: `marksIn` takes its early way
   * out when no CONVERSATION is open, and a comment somebody wrote and never put into a
   * conversation is still waiting. Wave 4's verification served that sentence out of a copy of the
   * owner's corpus in the same reply whose data drew six waiting comments on screen.
   *
   * So the criterion was wrong rather than unmet, and the honest one is narrower: say the list is
   * empty and say WHY, and do not turn that into a statement about the project. An empty list still
   * has to be explained — that half of the old test is kept, because an empty array with no
   * sentence is what it was written against.
   */
  it('says why the list is empty, and does not turn that into a claim about the project', async () => {
    const marks = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    const reply = marks.json() as { marks: unknown[]; covers: string }
    expect(reply.marks).toEqual([])
    expect(reply.covers, 'an empty list came back with no explanation').not.toBe('')
    expect(reply.covers, 'the sentence does not say why the list is empty').toContain('is open')
    expect(
      reply.covers,
      'the reply says the project has nothing waiting, which it did not look at and cannot know',
    ).not.toContain('nothing has a comment waiting on it')
  })
})
