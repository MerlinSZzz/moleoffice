// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A COMMENT HAS GOT TO IS STORED IN ONE PLACE, PROVED THROUGH THE DOOR A CALLER USES.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PLACES THIS REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * 1. `agent_messages.state` — the message carrying the words. This one survives.
 * 2. `records.data.state` on the comment record. Written by two things: `sendReview` on the server,
 *    and a PATCH the BROWSER sent after the send, inside a `try/catch` whose failure was reported
 *    as `notStamped` and changed nothing. Neither writes it now.
 *
 * The second could disagree with the first in both directions. It could say `queued` about a
 * comment that had gone out, because the browser call failed or was never made. And it could be put
 * back: measured 19 August 2026, three writes and three 200s took a sent comment to `queued`,
 * rewrote its body, and marked it sent again.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ADDS THAT tests/one-dispatch-door.test.ts DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * That file proves there is one WRITER, from the source and from a trigger. This one proves the one
 * store is the thing every READER uses, over HTTP, and that a SECOND ACTOR gets the same answer as
 * the first. Wave 2 shipped a rule whose escape hatch was wider than its own documentation because
 * no test drove a second actor at the first one's work, so every refusal here is driven by an agent
 * against a person's comment, and every permission is driven both ways.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'

/** Each case's own project, so the marks and comments it reads are only the ones that case wrote. */
let WORKSPACE = 'default'
let HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
let AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }
let SOMEBODY_ELSE = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': `not-${THE_TEST_OFFICES_OWNER.id}`,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance
let caseNumber = 0
/** Every message row that was already there when this case began, so a whole-table read can add up what it made. */
let messageIdsAtTheStart: ReadonlySet<string> = new Set()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})
beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `dispatch-case-${String(caseNumber)}`
  HUMAN = { ...HUMAN, 'x-mole-office-workspace': WORKSPACE }
  AGENT = { ...AGENT, 'x-mole-office-workspace': WORKSPACE }
  SOMEBODY_ELSE = { ...SOMEBODY_ELSE, 'x-mole-office-workspace': WORKSPACE }
  messageIdsAtTheStart = new Set(
    (t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]).map((one) => one.id),
  )
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: `Dispatch case ${String(caseNumber)}` } })
  expect(made.statusCode, made.body).toBe(201)
})

async function aModule(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'module', title: 'The gripper', data: {} },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A comment somebody left on something. Nothing about where it has got to is written on it. */
async function aComment(on: string, words = 'This does not match the run log.'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: 'Which of the two was measured?',
      data: { body: words, context: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } } },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A conversation, with this comment's words in it, addressed to a deliberately new agent. */
async function writeItInto(annotationId: string, words: string): Promise<{ threadId: string; messageId: string }> {
  const thread = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'Reading that comment', mode: 'direct' },
  })
  expect(thread.statusCode, thread.body).toBe(201)
  const threadId = (thread.json() as { thread: { id: string } }).thread.id
  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${threadId}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body: words, fromAnnotationId: annotationId, recipient: { kind: 'new' } },
  })
  return { threadId, messageId: (said.json() as { message?: { id: string } }).message?.id ?? '' }
}

async function press(threadId: string): Promise<number> {
  const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${threadId}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
  return sent.statusCode
}

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  return (read.json() as { record: { data: Record<string, unknown> } }).record.data
}

// ============================================================ the store, and only the store

describe('one place says a comment has gone out, and every reader asks it', () => {
  it('does not write anything on the comment record when the words go out', async () => {
    const module = await aModule()
    const comment = await aComment(module)
    const { threadId } = await writeItInto(comment, 'This does not match the run log.')
    expect(await press(threadId)).toBe(201)

    // THE RECORD IS UNTOUCHED. There is no second place to look and nothing to keep in step.
    const data = await dataOf(comment)
    expect(data['state'], 'a second place was written when the words went out').toBeUndefined()

    // AND THE MESSAGE SAYS IT ALL: the word, when it moved, and when it went.
    const added = (
      t.client.sqlite
        .prepare('SELECT id, state, state_at, sent_at, from_annotation_id FROM agent_messages')
        .all() as { id: string; state: string; state_at: string | null; sent_at: string | null; from_annotation_id: string | null }[]
    ).filter((one) => !messageIdsAtTheStart.has(one.id))
    expect(added.length, 'this case wrote more than one message row, so there is no one row to read').toBe(1)
    const row = added[0]!
    expect(row.state).toBe('sent')
    expect(row.state_at).not.toBeNull()
    expect(row.sent_at).not.toBeNull()
    expect(row.from_annotation_id).toBe(comment)
  })

  it('fixes the words of a comment that has gone out, however the record says otherwise', async () => {
    const module = await aModule()
    const comment = await aComment(module)
    const { threadId } = await writeItInto(comment, 'This does not match the run log.')
    expect(await press(threadId)).toBe(201)

    // A SECOND ACTOR, AT THE FIRST ONE'S WORK. This is the shape the campaign keeps finding: a rule
    // proved only by the actor it was written for.
    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: AGENT,
      payload: { dataPatch: { body: 'REWRITTEN BY AN AGENT' } },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(409)
    expect((await dataOf(comment))['body']).toBe('This does not match the run log.')

    // AND WRITING THE OLD FIELD DOES NOT UNLOCK IT, which is the whole reason the gate moved.
    // It answered 200 while the field was declared and decided nothing; window B took the field off
    // the annotation kind, so it is a 400 now. Either way the words below are still refused, and
    // that is the property this case is about.
    const putBack = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: AGENT,
      payload: { dataPatch: { state: 'queued' } },
    })
    expect(putBack.statusCode, 'the field is gone, so writing it is an unknown key').toBe(400)
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: AGENT,
      payload: { dataPatch: { body: 'REWRITTEN BY AN AGENT' } },
    })
    expect(again.statusCode, 'the two-step walk-around still works').toBe(409)
    expect((await dataOf(comment))['body']).toBe('This does not match the run log.')
  })

  it('leaves the words of a comment nobody has been given alone, so the gate is not a wall', async () => {
    // THE OTHER DIRECTION, and it has to be here: a gate that refused everything would pass every
    // test above and would make the product unusable. The person who wrote it may still change it.
    const module = await aModule()
    const comment = await aComment(module)
    await writeItInto(comment, 'This does not match the run log.')
    // WRITTEN INTO A CONVERSATION AND NOT SENT. Writing is not sending, and this is where the two
    // used to be confused: the message exists and reads `queued`, so nobody has been given anything.
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Second thought, which is what I mean.' } },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect((await dataOf(comment))['body']).toBe('Second thought, which is what I mean.')
  })

  it('refuses somebody else rewriting a comment that has NOT gone out, which the old gate never asked', async () => {
    // THE WIDEST OF THE THREE RULES, and the one that had no test driving a second actor at it. A
    // comment is `queued` for most of its life, and anybody could replace another person's words.
    const module = await aModule()
    const comment = await aComment(module)
    const theirs = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: SOMEBODY_ELSE,
      payload: { dataPatch: { body: 'PUT IN SOMEBODY ELSE MOUTH' } },
    })
    expect(theirs.statusCode, theirs.body).toBe(403)
    expect((await dataOf(comment))['body']).toBe('This does not match the run log.')
  })

  it('refuses somebody else turning a comment into a note, because turning one moves its anchor', async () => {
    // THE KIND GATE USED TO ASK WHAT THE RECORD WAS BECOMING, so all three rules were skipped by a
    // write that turned the comment into something else. A kind may not be sent beside `data`, so
    // this is the bare kind change — and it is not a harmless one: turning a comment into a note
    // moves `context` into `data.extra`, which is the anchor changing, and the anchor is half of
    // what somebody said.
    const module = await aModule()
    const comment = await aComment(module)
    const out = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: SOMEBODY_ELSE,
      payload: { kind: 'note' },
    })
    expect(out.statusCode, out.body).toBe(403)
    const read = await app.inject({ method: 'GET', url: `/api/records/${comment}`, headers: HUMAN })
    expect((read.json() as { record: { kind: string } }).record.kind).toBe('annotation')

    // AND THE PERSON WHO WROTE IT MAY STILL DO IT, while nobody has been given the words. A gate
    // that refused this would be refusing an ordinary edit.
    const theirs = await app.inject({ method: 'PATCH', url: `/api/records/${comment}`, headers: HUMAN, payload: { kind: 'note' } })
    expect(theirs.statusCode, theirs.body).toBe(200)
  })
})

// ============================================================ a comment is not sent twice

describe('a comment that has gone out is not written into a second conversation', () => {
  it('refuses the second write by name, and creates nothing', async () => {
    const module = await aModule()
    const comment = await aComment(module)
    const first = await writeItInto(comment, 'This does not match the run log.')
    expect(await press(first.threadId)).toBe(201)

    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Reading that comment again', mode: 'direct' },
    })
    const second = (thread.json() as { thread: { id: string } }).thread.id
    const again = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${second}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'This does not match the run log.',
        fromAnnotationId: comment,
        recipient: { kind: 'new' },
      },
    })
    expect(again.statusCode, again.body).toBe(409)
    const { A_COMMENT_ALREADY_SENT } = await import('../src/server/lib/agents.ts')
    expect((again.json() as { error: string }).error).toContain(A_COMMENT_ALREADY_SENT)

    const added = (
      t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]
    ).filter((one) => !messageIdsAtTheStart.has(one.id))
    expect(added.length, 'the same words were written into a conversation twice').toBe(1)
  })

  it('refuses a claim that names something that is not a comment, or is in another project', async () => {
    const module = await aModule()
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Reading that comment', mode: 'direct' },
    })
    const threadId = (thread.json() as { thread: { id: string } }).thread.id

    const wrongKind = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'x', fromAnnotationId: module, recipient: { kind: 'new' } },
    })
    expect(wrongKind.statusCode, wrongKind.body).toBe(409)
    expect((wrongKind.json() as { error: string }).error).toContain('module')

    const missing = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'x', fromAnnotationId: 'nosuchrecord', recipient: { kind: 'new' } },
    })
    expect(missing.statusCode, missing.body).toBe(404)
  })
})

// ============================================================ the browser is told, not left to guess

/**
 * THE BROWSER CANNOT OPEN THE STORE, SO THE ROUTE CARRIES THE ANSWER.
 *
 * The page that draws a comment on the thing it was left on has to know which comments have gone
 * out. It read `annotation.data.state` until 25 August 2026 — a second store, which the schema says
 * nothing decides anything from and which nothing writes `sent` to any more. GET /api/agent/marks
 * now names the comments that have gone, from `agent_messages`, which is the same fact the gate on
 * somebody's words reads.
 */
async function goneOutIn(headers: Record<string, string>): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/agent/marks', headers })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { goneOut: string[] }).goneOut
}

describe('the route that draws the marks says which comments have gone out', () => {
  it('names a comment whose words went out, and does not name one nobody has sent', async () => {
    const module = await aModule()
    const waiting = await aComment(module, 'Nobody has sent this one.')
    const gone = await aComment(module, 'This does not match the run log.')
    const { threadId } = await writeItInto(gone, 'This does not match the run log.')
    expect(await press(threadId)).toBe(201)

    expect(await goneOutIn(HUMAN)).toEqual([gone])

    // AND THE RECORD SAYS NOTHING, which is the point: the two answers cannot come apart, because
    // there is only one of them.
    expect((await dataOf(gone))['state'], 'the record is not the store').toBeUndefined()
    expect((await dataOf(waiting))['state']).toBeUndefined()
  })

  it('names it when no conversation is open at all, which is what a project looks like after a send', async () => {
    const module = await aModule()
    const comment = await aComment(module)
    const { threadId } = await writeItInto(comment, 'This does not match the run log.')
    expect(await press(threadId)).toBe(201)
    // A CONVERSATION EVERYTHING WENT OUT OF IS `dispatched` AND NOT `open`, so the marks half of
    // this reply takes its early way out. The comments that have gone are read whichever way it
    // goes: a conversation ending does not un-send what went out of it, and a comment drawn as
    // still waiting for ever is the exact fault this reply exists to prevent.
    const abandoned = await app.inject({
      method: 'PATCH',
      url: `/api/agent/threads/${threadId}`,
      headers: HUMAN,
      payload: { state: 'abandoned' },
    })
    expect(abandoned.statusCode, abandoned.body).toBe(200)

    const res = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as { marks: unknown[]; goneOut: string[]; covers: string }
    expect(reply.marks, 'nothing is waiting on anything').toEqual([])
    expect(reply.goneOut).toEqual([comment])
  })

  it('answers about one project only, so a send in another cannot mark a comment here', async () => {
    const workspaces = await import('../src/server/lib/workspaces.ts')
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the arm' })
    const elsewhere = { ...HUMAN, 'x-mole-office-workspace': 'robotics' }

    const module = await aModule()
    const comment = await aComment(module)
    const { threadId } = await writeItInto(comment, 'This does not match the run log.')
    expect(await press(threadId)).toBe(201)

    expect(await goneOutIn(HUMAN)).toEqual([comment])
    expect(await goneOutIn(elsewhere), 'a comment in one project was reported as sent in another').toEqual([])
  })
})

// ================================================ the sentence and the data in one reply agree

/**
 * ONE REPLY MAY NOT SAY TWO THINGS.
 *
 * THE FAULT THIS WAS WRITTEN FOR, MEASURED ON 25 AUGUST 2026. `GET /api/agent/marks` answered
 * `covers: "No conversation about \"panelx\" is open, so nothing has a comment waiting on it."` in
 * the same reply whose data drew six waiting comments on screen. The sentence was a fixed string:
 * nothing in it was read off what was being sent, so it could not be right except by luck.
 *
 * HOW THIS HOLDS IT. Every number is taken back OUT of the sentence with a regular expression and
 * held against the arrays in the same reply. That is what makes it a test of agreement rather than
 * a test of wording — a sentence that says a number the data does not say fails here, whatever the
 * words around it are.
 *
 * The one number that is not in the arrays is how many conversations were LOOKED IN, which is scope
 * rather than data. It is held to what the arrays can prove about it: it cannot be fewer than the
 * conversations the marks name.
 */
describe('the sentence in a marks reply says what the data in the same reply says', () => {
  /** An open conversation. */
  async function aConversation(): Promise<string> {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Reading the gripper', mode: 'direct' },
    })
    expect(made.statusCode, made.body).toBe(201)
    return (made.json() as { thread: { id: string } }).thread.id
  }

  /**
   * A COMMENT QUEUED IN THAT CONVERSATION, POINTING AT A RECORD.
   *
   * The context is written on the message itself. `writeItInto` above hands over an annotation id
   * instead, and a message made that way carries no target of its own — so it never becomes a mark,
   * which is why this helper exists rather than reusing that one.
   */
  async function queueComment(threadId: string, recordId: string, body: string): Promise<void> {
    const wrote = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body,
        context: { target: { kind: 'record', recordId, workspaceId: WORKSPACE } },
        recipient: { kind: 'new' },
      },
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
  }

  /** The whole numbers in the sentence, by the phrase each one sits in. */
  function numbersIn(covers: string): Record<string, number | undefined> {
    const one = (re: RegExp): number | undefined => {
      const hit = re.exec(covers)
      return hit?.[1] === undefined ? undefined : Number(hit[1])
    }
    return {
      waiting: one(/(\d+) still queued/),
      conversations: one(/in (\d+) open conversation/),
      marks: one(/into (\d+) mark/),
      leftOut: one(/and (\d+) more marks not sent back/),
      goneOut: one(/(\d+) already went out/),
    }
  }

  it('counts every number in its sentence off the arrays it ships beside', async () => {
    const module = await aModule()
    const task = await aModule()
    // TWO COMMENTS ON ONE OBJECT AND ONE ON ANOTHER, so `waiting` (3) and `marks` (2) are different
    // numbers and a sentence printing one where the other belongs cannot pass by coincidence.
    const a = await aConversation()
    await queueComment(a, module, 'Which of the two rigs was this?')
    await queueComment(a, module, 'The tolerance is not stated.')
    const b = await aConversation()
    await queueComment(b, task, 'This one is not started.')

    // AND ONE THAT HAS GONE, out of a third conversation, so `goneOut` is not zero either.
    const gone = await aComment(module, 'This does not match the run log.')
    const c = await writeItInto(gone, 'This does not match the run log.')
    expect(await press(c.threadId)).toBe(201)

    const res = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as {
      marks: { key: string; waiting: number; threads: { id: string }[] }[]
      leftOut: number
      goneOut: string[]
      covers: string
    }

    // The fixture, stated, so a failure below says whether the data or the sentence moved.
    expect(reply.marks.map((m) => m.waiting).sort()).toEqual([1, 2])
    expect(reply.goneOut).toEqual([gone])
    expect(new Set([a, b, c.threadId]).size, 'the fixture wrote three conversations').toBe(3)

    const said = numbersIn(reply.covers)
    const waiting = reply.marks.reduce((n, mark) => n + mark.waiting, 0)
    const named = new Set(reply.marks.flatMap((mark) => mark.threads.map((one) => one.id)))

    expect(said.waiting, 'the sentence does not say how many comments are waiting').toBe(waiting)
    expect(said.marks, 'the sentence does not say how many marks it is sending').toBe(reply.marks.length)
    expect(said.goneOut, 'the sentence does not say how many comments have gone out').toBe(reply.goneOut.length)
    expect(said.leftOut, 'nothing was left out, so the sentence must not say a number for it').toBeUndefined()
    expect(reply.leftOut).toBe(0)
    expect(
      said.conversations,
      'the sentence says it looked in fewer conversations than its own marks name',
    ).toBeGreaterThanOrEqual(named.size)
  })

  /**
   * THE MEASURED FAULT ITSELF: a comment waiting on a record with no conversation open.
   *
   * The reply's marks list is empty and that is correct — marks are comments queued in an open
   * CONVERSATION. What was wrong was the sentence beside it, which turned an empty list into
   * "nothing has a comment waiting on it" about the whole project. The comment below is waiting,
   * it is what the browser draws a mark from, and the reply never looked at it.
   */
  it('does not say the project has nothing waiting, because it did not look', async () => {
    const module = await aModule()
    const waiting = await aComment(module, 'Nobody has sent this one.')

    const res = await app.inject({ method: 'GET', url: '/api/agent/marks', headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as { marks: unknown[]; goneOut: string[]; covers: string }
    expect(reply.marks, 'no conversation is open, so nothing is queued in one').toEqual([])
    expect(reply.goneOut).toEqual([])

    // THE DATA THE SENTENCE WOULD HAVE CONTRADICTED. The comment exists, nothing has sent it, and
    // the page draws a mark for it from the record list — a different read from this one.
    const list = await app.inject({
      method: 'GET',
      url: '/api/records?kind=annotation',
      headers: HUMAN,
    })
    expect(list.statusCode, list.body).toBe(200)
    const comments = (list.json() as { records: { id: string }[] }).records
    expect(comments.map((one) => one.id), 'the fixture wrote no waiting comment').toContain(waiting)

    expect(
      reply.covers,
      'the reply claims the project has nothing waiting while a waiting comment is in the store',
    ).not.toContain('nothing has a comment waiting on it')
    expect(reply.covers, 'the sentence does not say why the list is empty').toContain('is open')
    expect(numbersIn(reply.covers).goneOut, 'the sentence does not count what did go out').toBe(0)
  })
})

/**
 * WHICH DURABLE IDENTITY A COMMENT IS FILED UNDER, AND WHEN THAT COLUMN MAY HOLD ONE.
 *
 * `src/server/lib/agents.ts` says this invariant is asserted here. Until 31 August 2026 it was not:
 * nothing in this file, or in any other, ever read `recipient_agent_id`. The sentence it named was
 * also false of the product — a queued comment addressed to a durable agent stores `kind = 'agent'`
 * with that column NULL — so the attribution and the claim were both wrong, and the only thing
 * checking anything was a line inside a migration that made a server start throw when it fired.
 *
 * The invariant is one-directional and it is about which fact each column carries. `recipient_kind`
 * and `recipient_session_id` are WHO SOMEBODY CHOSE. `recipient_agent_id` is WHERE THE COMMENT IS
 * FILED. So the rule is: that column holds an identity only on a row whose recipient HAS one.
 */
describe('a comment is filed under a durable identity only when its recipient has one', () => {
  /** Every row of the message store, as the columns this invariant is about. */
  const rows = (): { id: string; kind: string | null; agent: string | null }[] =>
    t.client.sqlite
      .prepare('SELECT id, recipient_kind AS kind, recipient_agent_id AS agent FROM agent_messages')
      .all() as { id: string; kind: string | null; agent: string | null }[]

  /** The rows added since the case began that break it, by id, so a failure names them rather than counting them. */
  const breaking = (before: ReadonlySet<string>): string[] =>
    rows()
      .filter((row) => !before.has(row.id) && row.agent !== null && row.kind !== 'agent' && row.kind !== 'session')
      .map((row) => row.id)

  async function aThread(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the gripper', mode: 'direct' },
    })
    expect(res.statusCode, res.body).toBe(201)
    return (res.json() as { thread: { id: string } }).thread.id
  }

  it('holds over every kind of recipient a person can choose', async () => {
    const before = new Set(rows().map((row) => row.id))
    const threadId = await aThread()
    const agent = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'agent',
        title: 'Round ten (agent)',
        data: { handle: 'round-ten', state: 'active', runtime: 'claude-code' },
      },
    })
    expect(agent.statusCode, agent.body).toBe(201)
    const agentId = (agent.json() as { record: { id: string } }).record.id
    // THE RUN SAYS WHICH AGENT IT WORKED AS, in its `ranAs` for this project. A comment addressed to a
    // run that names no agent is refused before anything is written, and this walk needs the row.
    const session = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'session',
        title: 'Round ten run',
        data: { state: 'idle', runtime: 'claude-code', ranAs: [{ workspaceId: WORKSPACE, agentId }] },
      },
    })
    expect(session.statusCode, session.body).toBe(201)
    const sessionId = (session.json() as { record: { id: string } }).record.id

    const every = [
      { kind: 'agent', agentId },
      { kind: 'session', sessionId },
      { kind: 'new' },
      { kind: 'unresolved', said: 'whoever ran the calibration' },
      null,
    ]
    for (const recipient of every) {
      const said = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${threadId}/messages`,
        headers: HUMAN,
        payload: { intent: 'ask', body: 'Which of the two was measured?', recipient },
      })
      expect(said.statusCode, `${JSON.stringify(recipient)}: ${said.body}`).toBe(201)
    }
    // THE WALK REALLY RAN. Five recipients, five rows; a walk that wrote nothing would otherwise
    // pass this test by having nothing to break the rule.
    expect(rows().filter((row) => !before.has(row.id)).length, 'the walk wrote no messages').toBe(every.length)
    expect(breaking(before), 'rows filed under an identity their recipient does not have').toEqual([])
  })

  it('and a row nobody chose for is filed under nobody, which is a real answer', async () => {
    const before = new Set(rows().map((row) => row.id))
    const threadId = await aThread()
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which of the two was measured?' },
    })
    expect(said.statusCode, said.body).toBe(201)
    const one = rows().find((row) => !before.has(row.id))
    expect(one?.kind, 'a comment nobody chose for says somebody was chosen').toBeNull()
    expect(one?.agent, 'a comment nobody chose for is filed under somebody').toBeNull()
  })
})
