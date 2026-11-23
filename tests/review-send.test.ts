// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SENDING A REVIEW: the first act in Mole Office that can cause an agent to run.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHY EACH ONE IS A CLAIM SOMEBODY CAN CHECK BY HAND
 * ---------------------------------------------------------------------------------------
 *
 *   NOTHING WAS HANDED OVER BEFORE SEND. Writing a comment, finishing collecting and organising write no
 *   delivery to any agent and no row in `agent_runs`. The owner has to be able to prove that their words
 *   sat still until they handed them over, and the only honest proof is that nothing was handed to an
 *   agent until they press.
 *
 *   THE REVIEW STAYS ONE THING AND THE WORK PARTITIONS. Comments for two agents become two messages,
 *   one to each, written from ONE conversation. One review may be split into the agent work it belongs
 *   to, while the comments can reach different agents; the review stays one durable human action.
 *
 *   SINCE ROUND 19 OF WAVE 13U THE SEND WRITES NO RUN. Until then it wrote one run per recipient, and nothing in the
 *   office picks such a run up. Each recipient is now given one message from the person in the message pool, which the
 *   agent's waiter hands over and the person's chat shows. Answer yMYX20nfBuep and problem
 *   eCrK1atZOrvA are the records behind that change. The claims above were proved by counting runs; they are proved now
 *   by counting what was handed to an agent, and by the reply's `messages` where they named a run.
 *
 *   WHAT A PERSON WROTE OUTLIVES THE AGENT. A comment addressed to a run that cannot be picked up is
 *   still written into the conversation, still queued, still readable, and still re-deliverable
 *   after the address is corrected. The words are never the thing that is lost.
 *
 *   HUMAN GOVERNANCE STAYS HUMAN. A comment whose reading names a decision is not handed to an agent
 *   as though the agent could take it. It stays in the review, and the reply says whose it is. The review
 *   waits for it until the person presses "I answer this myself" on it.
 *
 *   SENDING HIDES NOTHING. Every comment is still listed afterwards, with its words and whatever was
 *   read into it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE GO THROUGH THE ROUTES
 * ---------------------------------------------------------------------------------------
 *
 * Send is only worth anything if a person can reach it, and a library test would pass with no route
 * at all. Every test here presses the same doors the browser presses.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { REVIEW_STATES as REVIEW_VOCABULARY } from '../src/shared/states.ts'

/**
 * A PROJECT OF ITS OWN FOR EACH CASE. Several cases count the conversations in their project and say
 * the count is one, so each case has a fresh project in the office the file shares. The count of
 * messages handed to an agent stays over every project, and each case reads it against its own start.
 */
let WORKSPACE = 'default'
let caseNumber = 0
/** How many messages had been handed to an agent, over every project, when this case started. */
let handedAtStart = 0
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance

/** A directory that exists and stays empty, so a stamp can name a transcript nobody wrote. */
const transcriptsGone = mkdtempSync(join(tmpdir(), 'mole-office-review-send-gone-'))

afterAll(() => {
  rmSync(transcriptsGone, { recursive: true, force: true })
})

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
  handedAtStart = handedOverEveryProject()
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ---------------------------------------------------------------------------- building things

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(HUMAN, { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

/** A run Mole Office could really pick up again: a session record carrying what discovery stamps on one. */
async function resumableSession(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath,
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

/** A run Mole Office has an id for and CANNOT pick up: the stamp is there and the transcript is not. */
async function stampedButGone(title: string, externalId: string): Promise<string> {
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath: join(transcriptsGone, `${externalId}.jsonl`),
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

/** A comment somebody left on a record, written the way the product writes one. */
async function remark(on: string, body: string, hint?: string): Promise<string> {
  return file('annotation', body.slice(0, 40), {
    body,
    context: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } },
    ...(hint === undefined ? {} : { recipientHint: hint }),
  })
}

async function startReview(on: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

async function finishCollecting(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
}

interface SendReply {
  threadId: string
  /** The one message each recipient was given, by its record and the agent it went to. */
  messages: { id: string; to: string }[]
  sent: number
  /** How many of those had already reached their agent before the press. */
  alreadyGone: number
  held: { messageId: string; quotedBody: string; why: string }[]
  yoursToAnswer: { id: string; quotedBody: string; why: string }[]
  review: { review: { state: string; sentAt: string | null; threadId: string | null } }
  says: string
}

async function send(
  reviewId: string,
  to: { commentId: string; recipient: unknown }[] = [],
  /** Send only these comments of the review. Left out, every comment that can go goes. */
  only: string[] | null = null,
): Promise<{ status: number; body: string; reply: SendReply }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${reviewId}/send`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { to, ...(only === null ? {} : { only }) },
  })
  return { status: res.statusCode, body: res.body, reply: res.json() as SendReply }
}

/** The press "Choose who it is for", which is an ordinary patch of the comment. */
async function chooseWhoItIsFor(commentId: string, recipient: Record<string, unknown> | null): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${commentId}`,
    headers: HUMAN,
    payload: { dataPatch: { chosenRecipient: recipient } },
  })
  expect(res.statusCode, res.body).toBe(200)
}

/** Every conversation in this project, which is how a second one shows up. */
async function threadsNow(): Promise<{ id: string; mode: string; title: string }[]> {
  const res = await app.inject({ method: 'GET', url: '/api/agent/threads', headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { threads: { id: string; mode: string; title: string }[] }).threads
}

/** Where every comment in a review would go, which is what the pane draws before the press. */
async function whereTheyWouldGo(reviewId: string): Promise<{
  comments: { id: string; willGo: boolean; says: string }[]
}> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Awaited<ReturnType<typeof whereTheyWouldGo>>
}

/** How many runs exist, over every project, which is what a worker's queue answers. */
async function runsNow(): Promise<number> {
  const res = await app.inject({ method: 'GET', url: '/api/agent/runs' })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { runs: unknown[] }).runs.length
}

/** How many messages have been handed to an agent, over every project: one delivery row for each. */
function handedOverEveryProject(): number {
  return (
    t.client.sqlite.prepare("SELECT count(*) AS n FROM message_delivery WHERE recipient_kind = 'agent'").get() as {
      n: number
    }
  ).n
}

/**
 * How many messages have been handed to an agent since this case started, over every project. The
 * office is shared by the file, so the deliveries earlier cases made are taken off.
 */
function handedNow(): number {
  return handedOverEveryProject() - handedAtStart
}

/** One message the send gave a recipient, as the message pool holds it. */
async function readGiven(id: string): Promise<{ body: string; sentBy: { kind: string } }> {
  const res = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { message: { body: string; sentBy: { kind: string } } }).message
}

async function readReview(reviewId: string): Promise<{
  review: { state: string; sentAt: string | null; threadId: string | null }
  members: {
    id: string
    found: boolean
    body?: string
    state?: string
    interpretation?: string | null
    chosen?: { canSend: boolean; says: string } | null
  }[]
}> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Awaited<ReturnType<typeof readReview>>
}

async function readThread(threadId: string): Promise<{
  messages: {
    id: string
    body: string
    state: string
    delivery: { canSend: boolean; says: string }
    recipient: { sessionId: string | null } | null
  }[]
  runs: { id: string }[]
}> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${threadId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Awaited<ReturnType<typeof readThread>>
}

const toSession = (sessionId: string) => ({ kind: 'session', sessionId, said: null, why: null })

/** A durable agent with a handle, and its registry id. */
async function aDurableAgent(handle: string): Promise<string> {
  await file('agent', handle, { handle, state: 'active', runtime: 'claude-code' })
  const res = await app.inject({ method: 'GET', url: '/api/participants', headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const agents = (res.json() as { agents: { id: string; handle: string }[] }).agents
  const found = agents.find((one) => one.handle === handle)
  expect(found, `no registry row for the agent "${handle}"`).toBeDefined()
  return (found as { id: string }).id
}

/** Say which durable agent a run worked as, which is what makes a comment to it reach that agent. */
async function bindTheRunToTheAgent(sessionId: string, agentId: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${sessionId}`,
    headers: HUMAN,
    payload: { dataPatch: { ranAs: [{ workspaceId: WORKSPACE, agentId }] } },
  })
  expect(res.statusCode, res.body).toBe(200)
}

/**
 * Give a run an agent of its own: an agent record in this project, named in the run's `ranAs`. A comment sent to a run
 * that names no agent is refused before anything is written, so a case that sends to a run gives it one first.
 */
async function giveTheRunAnAgent(sessionId: string, handle: string): Promise<void> {
  await bindTheRunToTheAgent(sessionId, await file('agent', handle, { handle, state: 'active', runtime: 'claude-code' }))
}

/** A comment written the way the chat composer writes one: a message that says what it is about. */
async function commentTo(on: string, body: string, sessionId: string): Promise<string> {
  return file('message', body.slice(0, 40), {
    body,
    target: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } },
    chosenRecipient: { kind: 'session', sessionId },
  })
}

// ============================================================================ nothing ran before

describe('nothing is handed to an agent until somebody sends', () => {
  it('writing comments, finishing collecting and organising hand nothing over and leave the run table empty', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    const one = await remark(gripper, 'This number does not match the run log.')
    await finishCollecting(review)

    const organise = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: [{ commentId: one, reading: 'They are asking which of two numbers was measured.', intents: ['ask'], artefacts: ['problem'] }],
        groups: [],
      },
    })
    expect(organise.statusCode, organise.body).toBe(200)

    // THE WHOLE CLAIM, AND IT IS ABOUT ABSENCE. Three acts that all touch this review, and nothing
    // has been handed to anybody.
    expect(handedNow()).toBe(0)
    expect(await runsNow()).toBe(0)
  })

  it('sending is what hands one over, and it is the only thing that did', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Calibration work', 'ext-send-1')
    await giveTheRunAnAgent(agent, 'ext-send-1')
    const review = await startReview(gripper)
    const one = await remark(gripper, 'This number does not match the run log.')
    await finishCollecting(review)
    expect(handedNow()).toBe(0)

    const sent = await send(review, [{ commentId: one, recipient: toSession(agent) }])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(handedNow()).toBe(1)
    expect(sent.reply.messages).toHaveLength(1)
    expect((await readGiven(sent.reply.messages[0]?.id ?? '')).sentBy.kind).toBe('person')
    // AND NO RUN, which nothing in the office would pick up.
    expect(await runsNow()).toBe(0)
  })
})

// ============================================================================ one review, one thread

describe('one review is one conversation, and the work partitions', () => {
  it('comments for two agents become two messages, one to each, from the same conversation', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const first = await resumableSession('Calibration work', 'ext-two-1')
    const second = await resumableSession('Wrist camera work', 'ext-two-2')
    await giveTheRunAnAgent(first, 'ext-two-1')
    await giveTheRunAnAgent(second, 'ext-two-2')
    const review = await startReview(gripper)
    const a = await remark(gripper, 'The calibration number is wrong here.')
    const b = await remark(gripper, 'The camera mount drawing is out of date.')
    await finishCollecting(review)

    const sent = await send(review, [
      { commentId: a, recipient: toSession(first) },
      { commentId: b, recipient: toSession(second) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(2)
    expect(sent.reply.messages).toHaveLength(2)
    expect(new Set(sent.reply.messages.map((one) => one.to)).size, 'both messages went to one agent').toBe(2)
    // ONE CONVERSATION. It holds both comments, one to each agent, and the review says which one it is.
    expect(sent.reply.review.review.threadId).toBe(sent.reply.threadId)
    const thread = await readThread(sent.reply.threadId)
    expect(new Set(thread.messages.map((one) => one.recipient?.sessionId))).toEqual(new Set([first, second]))
    expect(await threadsNow()).toHaveLength(1)
    expect(sent.reply.review.review.state).toBe('sent')
    expect(sent.reply.review.review.sentAt).not.toBeNull()
  })

  it('routes a comment from the words the person wrote on it, without being told again', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Zetacal calibration work', 'ext-hint-1')
    await giveTheRunAnAgent(agent, 'ext-hint-1')
    await resumableSession('Something else entirely', 'ext-hint-2')
    const review = await startReview(gripper)
    await remark(gripper, 'Check this against what you measured.', 'zetacal')
    await finishCollecting(review)

    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: HUMAN })
    expect(plan.statusCode, plan.body).toBe(200)
    const said = plan.json() as { comments: { willGo: boolean; says: string }[]; going: number }
    expect(said.going).toBe(1)
    expect(said.comments[0]?.says).toContain('Zetacal calibration work')
    // THE PREVIEW WROTE NOTHING. It is read before the press and it is not the press.
    expect(handedNow()).toBe(0)

    const sent = await send(review)
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.messages).toHaveLength(1)
    expect((await readThread(sent.reply.threadId)).messages[0]?.recipient?.sessionId).toBe(agent)
  })
})

// ============================================================================ the words outlive it

describe('what a person wrote outlives the agent it was addressed to', () => {
  it('keeps a comment addressed to a run that cannot be resumed, and sends it after the address is fixed', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const alive = await resumableSession('Calibration work', 'ext-live-1')
    const gone = await stampedButGone('A run whose transcript is not here', 'ext-dead-1')
    await giveTheRunAnAgent(alive, 'ext-live-1')
    await giveTheRunAnAgent(gone, 'ext-dead-1')
    const review = await startReview(gripper)
    const good = await remark(gripper, 'The calibration number is wrong here.')
    const stranded = await remark(gripper, 'These are the words that must not be lost.')
    await finishCollecting(review)

    const sent = await send(review, [
      { commentId: good, recipient: toSession(alive) },
      { commentId: stranded, recipient: toSession(gone) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(sent.reply.held).toHaveLength(1)
    expect(sent.reply.held[0]?.why).toContain('cannot be picked up')

    // THE MESSAGE IS THERE, IT IS STILL WAITING, AND IT STILL HOLDS THE WORDS. This is the whole
    // claim: the run it was addressed to could not be served, and the sentence survived that.
    const thread = await readThread(sent.reply.threadId)
    const held = thread.messages.find((one) => one.id === sent.reply.held[0]?.messageId)
    expect(held?.body).toBe('These are the words that must not be lost.')
    expect(held?.state).toBe('queued')
    expect(held?.delivery.canSend).toBe(false)

    // AND THE REVIEW IS NOT SENT, because something is still waiting in it.
    expect(sent.reply.review.review.state).not.toBe('sent')
    const stillQueued = (await readReview(review)).members.find((one) => one.id === stranded)
    expect(stillQueued?.state).toBe('queued')

    // RE-DELIVERABLE. The address is corrected on the message that holds the words, and pressing
    // Send again hands it over. Nothing was rewritten and nothing was retyped.
    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${sent.reply.held[0]?.messageId ?? ''}`,
      headers: HUMAN,
      payload: { recipient: toSession(alive) },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)

    const again = await send(review)
    expect(again.status, again.body).toBe(200)
    expect(again.reply.sent).toBe(1)
    expect(again.reply.review.review.state).toBe('sent')
  })
})

// ============================================================================ governance

describe('a comment only a person may answer is not handed to an agent', () => {
  /** Organise a review so that one comment's reading names a decision. */
  async function readAs(
    review: string,
    comments: { commentId: string; artefacts: string[] }[],
  ): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: comments.map((one) => ({
          commentId: one.commentId,
          reading: 'What this comment is asking for.',
          intents: ['discuss'],
          artefacts: one.artefacts,
        })),
        groups: [],
      },
    })
    expect(res.statusCode, res.body).toBe(200)
  }

  it('holds it back, names it, files nothing, and sends the rest', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Calibration work', 'ext-gov-1')
    await giveTheRunAnAgent(agent, 'ext-gov-1')
    const review = await startReview(gripper)
    const work = await remark(gripper, 'Please check this number against the run log.')
    const choice = await remark(gripper, 'Decide for me whether we drop the printed mount.')
    await finishCollecting(review)
    await readAs(review, [
      { commentId: work, artefacts: ['problem'] },
      { commentId: choice, artefacts: ['decision'] },
    ])

    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: HUMAN })
    const said = plan.json() as { comments: { id: string; willGo: boolean; yoursToAnswer: boolean; says: string }[] }
    const line = said.comments.find((one) => one.id === choice)
    expect(line?.yoursToAnswer).toBe(true)
    expect(line?.willGo).toBe(false)
    expect(line?.says).toContain('yours to answer')

    const sent = await send(review, [
      { commentId: work, recipient: toSession(agent) },
      { commentId: choice, recipient: toSession(agent) },
    ])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    expect(sent.reply.yoursToAnswer.map((one) => one.id)).toEqual([choice])

    // NOTHING OF IT WENT ANYWHERE. Not as a message in the conversation, not inside the message the
    // agent is given. Until round 19 the second half read the request a worker was given when it
    // claimed the run; the send writes no run now, and the agent is given this one message.
    const thread = await readThread(sent.reply.threadId)
    expect(thread.messages.map((one) => one.body)).toEqual(['Please check this number against the run log.'])
    expect(sent.reply.messages).toHaveLength(1)
    const given = await readGiven(sent.reply.messages[0]?.id ?? '')
    expect(given.body).toBe('Please check this number against the run log.')
    expect(JSON.stringify(given)).not.toContain('drop the printed mount')

    // AND NOTHING WAS FILED FROM IT. Naming a decision is not taking one, and it is not filing one
    // either: the corpus holds no new record of any kind because of this comment.
    const decisions = await app.inject({ method: 'GET', url: '/api/records?kind=decision', headers: HUMAN })
    expect((decisions.json() as { records: unknown[] }).records).toHaveLength(0)
    const proposals = await app.inject({ method: 'GET', url: '/api/records?kind=proposal', headers: HUMAN })
    expect((proposals.json() as { records: unknown[] }).records).toHaveLength(0)

    // IT IS STILL IN THE REVIEW, STILL WAITING, AND STILL READABLE.
    const after = await readReview(review)
    const kept = after.members.find((one) => one.id === choice)
    expect(kept?.body).toBe('Decide for me whether we drop the printed mount.')
    expect(kept?.state).toBe('queued')

    // AND THE REVIEW IS NOT SENT YET, because it still waits for that comment. What stayed is named, in the reply
    // and here, and the comment has a press of its own: "I answer this myself" takes it out of what the review
    // waits for, and then nothing is left waiting, so the review reads as sent.
    expect(after.review.state).not.toBe('sent')
    expect(sent.reply.says).toContain('yours to answer')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/take-out`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { comment: choice, because: 'the-person-answers-it' },
    })
    expect(answered.statusCode, answered.body).toBe(200)
    const taken = await readReview(review)
    expect(taken.review.state).toBe('sent')
    expect(taken.members.find((one) => one.id === choice)?.body).toBe('Decide for me whether we drop the printed mount.')
  })
})

// ============================================================================ what it refuses

describe('the refusals name what is missing and what to do about it', () => {
  it('refuses a review that is still collecting, and says which press writes the membership down', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    await remark(gripper, 'Something worth saying.')

    const refused = await send(review)
    expect(refused.status).toBe(409)
    expect(refused.body).toContain('still collecting')
    // THE PRESS, NOT THE ROUTE. This asked for the route until 5 September 2026, which is this
    // test's own name being contradicted by its own assertion: a person reading a screen is told
    // what to press, and naming an API route to them is USER.md's seventh invariant broken. The
    // word is read from the one place that holds it, so it cannot drift from the press itself.
    expect(refused.body).toContain(REVIEW_VOCABULARY.finishCollecting.word)
    expect(refused.body, 'a person reading this is shown a raw API route').not.toContain('POST /api/')
    expect(handedNow()).toBe(0)
  })

  it('refuses a second send of a review that has gone, and names when it went', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Calibration work', 'ext-twice-1')
    await giveTheRunAnAgent(agent, 'ext-twice-1')
    const review = await startReview(gripper)
    const one = await remark(gripper, 'The calibration number is wrong here.')
    await finishCollecting(review)
    const first = await send(review, [{ commentId: one, recipient: toSession(agent) }])
    expect(first.status, first.body).toBe(200)

    const again = await send(review)
    expect(again.status).toBe(409)
    expect(again.body).toContain('was sent at')
    // ONE MESSAGE HANDED OVER, NOT TWO. The refusal is what stops the same words going twice.
    expect(handedNow()).toBe(1)
  })

  it('still refuses the word "sent" on the patch route, and now names the act that does it', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/reviews/${review}`,
      headers: HUMAN,
      payload: { state: 'sent' },
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.body).toContain(`POST /api/reviews/${review}/send`)
    // THE OLD SENTENCE SAID SENDING WAS NOT BUILT. It is, and a refusal that still said otherwise
    // would send somebody looking for a route they think they have missed.
    expect(refused.body).not.toContain('not built')
  })

  it('refuses when not one comment can go, names every one of them, and writes nothing', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    await remark(gripper, 'Nobody has been chosen for this one.')
    await finishCollecting(review)

    const refused = await send(review)
    expect(refused.status).toBe(409)
    expect(refused.body).toContain('No recipient chosen yet')
    expect(handedNow()).toBe(0)
    // AND NO CONVERSATION EITHER. A thread nobody said anything in would be litter with a name on it.
    const threads = await app.inject({ method: 'GET', url: '/api/agent/threads', headers: HUMAN })
    expect((threads.json() as { threads: unknown[] }).threads).toHaveLength(0)
  })
})

// ============================================================================ nothing is hidden

describe('sending hides nothing and deletes nothing', () => {
  it('still lists every comment, its words, and what was read into it', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Calibration work', 'ext-keep-1')
    await giveTheRunAnAgent(agent, 'ext-keep-1')
    const review = await startReview(gripper)
    const one = await remark(gripper, 'The calibration number is wrong here.')
    await finishCollecting(review)
    const organise = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: [{ commentId: one, reading: 'They think two numbers disagree.', intents: ['verify'], artefacts: ['problem'] }],
        groups: [],
      },
    })
    expect(organise.statusCode, organise.body).toBe(200)

    const sent = await send(review, [{ commentId: one, recipient: toSession(agent) }])
    expect(sent.status, sent.body).toBe(200)

    const after = await readReview(review)
    expect(after.members).toHaveLength(1)
    const kept = after.members[0]
    expect(kept?.body).toBe('The calibration number is wrong here.')
    // STAMPED SENT, WHICH IS A FACT ABOUT IT AND NOT A DISAPPEARANCE.
    expect(kept?.state).toBe('sent')
    expect(kept?.interpretation).toContain('two numbers disagree')
  })
})

// ============================================================================ who it is for is stored

/**
 * WHO A COMMENT IS FOR IS A DECISION SOMEBODY MADE, AND A DECISION IS STORED.
 *
 * WHAT WENT WRONG. The review pane held every choice in React state and nowhere else. A first-time
 * user chose agents for two comments, reloaded the page, and both said nobody had been chosen —
 * with no "not stored yet" mark anywhere, on the one screen where the comments, the review's state,
 * the readings and even unsent composer text all survive a reload. Point 18 of
 * design/ROUND-EIGHT-DOGFOOD.md, 19 August 2026.
 *
 * The choice is a declared field of the comment now, `annotation.chosenRecipient`, and these are
 * the three things that has to mean: it comes back on a fresh read, the preview a person reads is
 * about it, and the send obeys it without being told again.
 */
describe('who a comment is for survives being written down', () => {
  it('comes back on a fresh read, drives the preview, and routes the send with no choices in the request', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    const chosen = await remark(gripper, 'This one is addressed to somebody.')
    const nobody = await remark(gripper, 'Nobody has been chosen for this one.')
    await finishCollecting(review)

    await chooseWhoItIsFor(chosen, { kind: 'new' })

    // A FRESH READ IS WHAT A RELOAD IS. Nothing of this request knows what the last one chose.
    const read = await readReview(review)
    const one = read.members.find((m) => m.id === chosen)
    expect(one?.chosen, 'the choice did not survive being read again').not.toBeNull()
    expect(one?.chosen?.canSend).toBe(true)
    expect(one?.chosen?.says).toContain('new agent')
    expect(read.members.find((m) => m.id === nobody)?.chosen ?? null).toBeNull()

    // THE PREVIEW IS THE SERVER'S ANSWER ABOUT THE CHOICE, not a sentence the browser wrote over it.
    const would = await whereTheyWouldGo(review)
    expect(would.comments.find((c) => c.id === chosen)?.willGo).toBe(true)
    expect(would.comments.find((c) => c.id === nobody)?.says).toContain('No recipient chosen')

    // AND THE SEND OBEYS IT WITH AN EMPTY REQUEST, which is what the pane now posts.
    const sent = await send(review)
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    const after = await readReview(review)
    expect(after.members.find((m) => m.id === chosen)?.state).toBe('sent')
    expect(after.members.find((m) => m.id === nobody)?.state).toBe('queued')
  })

  it('a choice beats the words somebody wrote, because one is a decision and the other is a hint', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agent = await resumableSession('Calibration work', 'ext-choice-beats-hint')
    const review = await startReview(gripper)
    // THE WORDS NAME NOBODY PANELX CAN FIND, so routing from them alone holds the comment back.
    const one = await remark(gripper, 'Fix this.', 'whoever was on the bench last Tuesday')
    await finishCollecting(review)

    const before = await whereTheyWouldGo(review)
    expect(before.comments[0]?.willGo, 'the hint resolved, so this proves nothing about the choice').toBe(false)

    await chooseWhoItIsFor(one, { kind: 'session', sessionId: agent })
    const after = await whereTheyWouldGo(review)
    expect(after.comments[0]?.willGo, 'the agent somebody picked was overruled by the words they wrote').toBe(true)
  })

  it('unchoosing takes it away and says nobody again', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    const one = await remark(gripper, 'This one is addressed to somebody.')
    await finishCollecting(review)

    await chooseWhoItIsFor(one, { kind: 'new' })
    expect((await readReview(review)).members[0]?.chosen).not.toBeNull()
    await chooseWhoItIsFor(one, null)
    expect((await readReview(review)).members[0]?.chosen ?? null).toBeNull()
    expect((await whereTheyWouldGo(review)).comments[0]?.says).toContain('No recipient chosen')
  })
})

// ============================================================================ sending one comment

/**
 * SENDING ONE COMMENT IS SENDING THAT MUCH OF THE REVIEW, IN THE REVIEW'S OWN CONVERSATION.
 *
 * WHAT WENT WRONG. The press on a comment's own row opened a fresh conversation through the agent
 * routes. The comment went out in a thread nothing tied to the review; the review's own
 * conversation went on listing that comment as "Not sent yet", addressed to a dead run, printing
 * the reason it could not go; and the pane's heading said "4 comments, 3 sent" over it. Two
 * authoritative screens, two answers about one comment. Point 26 of
 * design/ROUND-EIGHT-DOGFOOD.md, 19 August 2026.
 */
describe('sending one comment stays inside one review and one conversation', () => {
  /** Three comments on one module, each addressed to a new agent, collecting finished. */
  async function three(): Promise<{ review: string; ids: string[] }> {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const review = await startReview(gripper)
    const ids = [
      await remark(gripper, 'The first thing that is wrong.'),
      await remark(gripper, 'The second thing that is wrong.'),
      await remark(gripper, 'The third thing that is wrong.'),
    ]
    await finishCollecting(review)
    for (const id of ids) await chooseWhoItIsFor(id, { kind: 'new' })
    return { review, ids }
  }

  it('sends the one that was asked for, leaves the others exactly where they were, and makes no second conversation', async () => {
    const { review, ids } = await three()
    const [first] = ids

    const sent = await send(review, [], [first as string])
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent, 'sending one comment sent more than one').toBe(1)

    // ONE CONVERSATION, AND IT IS THE REVIEW'S OWN.
    const threads = await threadsNow()
    expect(threads, 'a second conversation was made for one comment').toHaveLength(1)
    expect(threads[0]?.mode).toBe('review')
    const read = await readReview(review)
    expect(read.review.threadId).toBe(sent.reply.threadId)
    expect(threads[0]?.id).toBe(sent.reply.threadId)

    // THE OTHERS ARE UNTOUCHED, and the reply says why rather than going quiet about them.
    expect(read.members.filter((m) => m.state === 'queued')).toHaveLength(2)
    expect(sent.body).toContain('You asked to send one particular comment')

    // AND THE REVIEW IS NOT MARKED SENT, because two comments are still waiting to go.
    expect(read.review.state).not.toBe('sent')
  })

  it('leaves the review and its conversation saying the same thing about that comment', async () => {
    const { review, ids } = await three()
    const [first] = ids
    const sent = await send(review, [], [first as string])
    expect(sent.status, sent.body).toBe(200)

    const read = await readReview(review)
    const thread = await readThread(sent.reply.threadId)
    // THE TWO SCREENS. The pane counts comments its own records say have gone; the conversation
    // lists messages and marks the ones still waiting. They are two readings of one act and they
    // have to agree — this is exactly what disagreed, and it is what a person was shown.
    const goneInTheReview = read.members.filter((m) => m.found && m.state !== 'queued').map((m) => m.id)
    const goneInTheConversation = thread.messages.filter((m) => m.state !== 'queued').map((m) => m.body)
    expect(goneInTheReview).toHaveLength(1)
    expect(goneInTheConversation).toHaveLength(1)
    expect(goneInTheConversation[0]).toBe('The first thing that is wrong.')
    // AND THE CONVERSATION HOLDS NOTHING FOR THE COMMENTS NOBODY SENT. A message written for one
    // that nobody asked to send would be words handed over that the review still calls waiting.
    expect(thread.messages).toHaveLength(1)
  })

  it('refuses a comment that is not in this review, and sends nothing', async () => {
    const { review } = await three()
    const elsewhere = await file('module', 'Another module', { context: 'x' })
    const stranger = await remark(elsewhere, 'Not part of that review.')
    const refused = await send(review, [], [stranger])
    expect(refused.status).toBe(400)
    expect(refused.body).toContain('not one of the comments in this review')
    expect(handedNow()).toBe(0)
  })

  it('refuses an empty list rather than reading it as "send everything"', async () => {
    const { review } = await three()
    const refused = await send(review, [], [])
    expect(refused.status).toBe(400)
    expect(refused.body).toContain('asked to send none of the comments')
    expect(handedNow()).toBe(0)
  })
})

// ==================================== the Organise screen and the reply read one fact

/**
 * A COMMENT CAN REACH ITS AGENT BEFORE THE REVIEW HOLDING IT IS SENT.
 *
 * A live session answering as that agent takes the words straight from the door, and that is
 * written on the comment's own delivery row. Nothing about the review changes.
 *
 * The Organise screen used to work "has this gone out" out from the review's own messages alone, so
 * it drew "This goes to the run …" under a comment a session had already taken, and the sentence
 * one press later said the opposite. Both read `alreadyHandedOver` now. Problem `-4GypldN_XMS`.
 *
 * THE REVIEW STILL CARRIES IT, and that is not a compromise. A review that held a comment back
 * would be wrong about its own membership — problem `p9enuTYIC-S6` — so what changes is only what
 * the line claims, not what the press does.
 */
describe('a comment a live session has already taken says so before the press, not after it', () => {
  it('says so on the screen, and the reply after the press says the same about the same comment', async () => {
    const gripper = await file('module', 'The gripper', { context: 'x' })
    const agentId = await aDurableAgent('open-in-a-terminal')
    const answering = await resumableSession('The terminal answering as open-in-a-terminal', 'ext-already-taken')
    await bindTheRunToTheAgent(answering, agentId)
    const review = await startReview(gripper)
    const taken = await commentTo(gripper, 'This one is taken before the review is sent.', answering)
    const other = await commentTo(gripper, 'This one is not taken by anybody.', answering)
    await finishCollecting(review)

    // BEFORE ANYTHING TAKES IT, the screen offers to send both.
    const before = await whereTheyWouldGo(review)
    expect(before.comments.find((c) => c.id === taken)?.willGo, before.comments.map((c) => c.says).join(' | ')).toBe(true)
    expect(before.comments.find((c) => c.id === other)?.willGo).toBe(true)

    // A LIVE SESSION HOLDS THE AGENT'S HANDLE AND IS GIVEN ONE OF THE TWO.
    const held = await app.inject({
      method: 'POST',
      url: '/api/handles/open-in-a-terminal/hold',
      headers: HUMAN,
      payload: { session: answering, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)
    const took = await app.inject({
      method: 'POST',
      url: '/api/handles/open-in-a-terminal/took',
      headers: HUMAN,
      payload: { session: answering, message: taken },
    })
    expect(took.statusCode, took.body).toBe(200)

    // THE SENTENCE THE OWNER READS BEFORE THEY PRESS. This is the line that used to say
    // "This goes to the run …" about a comment that had already arrived.
    const after = await whereTheyWouldGo(review)
    const line = after.comments.find((c) => c.id === taken)
    expect(line?.says, 'the screen still said the words were about to go somewhere they had reached').toContain(
      'This comment has already reached its agent',
    )
    expect(line?.says, 'the sentence the owner read under a comment that had already arrived').not.toContain(
      'This goes to the run',
    )
    // THE REVIEW STILL CARRIES IT, which is problem p9enuTYIC-S6's answer: a review that held a
    // comment back would be wrong about its own membership.
    expect(line?.willGo, 'the review stopped carrying a comment it holds').toBe(true)
    expect(after.comments.find((c) => c.id === other)?.says).toContain('This goes to the run')

    // AND THE REPLY AFTER THE PRESS READS THE SAME ROWS. Both went, and one of them had already
    // reached its agent — the two screens agree because they ask one function.
    const sent = await send(review)
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(2)
    expect(sent.reply.alreadyGone, 'the reply and the screen disagreed about the same comment').toBe(1)
  })
})

// ============================================================================ a choice taken back

/**
 * A COMMENT WHOSE CHOICE IS TAKEN BACK HAS NOT BEEN SENT.
 *
 * WHAT WENT WRONG. Choosing who a comment is for writes the agent the choice names into `to`, beside the choice. Taking
 * the choice back took `chosenRecipient` away and left `to`. A message with a `to` and no choice is one its writer sent
 * as it was written, so the comment read as sent: the review stopped listing it, the message pool said it had gone, and
 * nobody had been handed it.
 *
 * WHAT EACH CASE HOLDS:
 *
 *   1. A comment written to nobody, chosen by a later press and then unchosen, has no `to` and no choice. The pool says
 *      it is not sent yet, its review still lists it as waiting with nobody chosen, and no delivery row of it is past
 *      queued.
 *   2. A comment chosen when it was written and then unchosen says the same four things.
 *   3. A comment that went out keeps what it went to. Before this change the door accepted taking its choice back and
 *      left its `to` as it was, so this case holds that: the change is accepted, `to` stays, and it is still not "not
 *      sent yet". It is the control, and it passes before the change and after it.
 *   4. A person its writer added to `to` before the choice was taken back stays. Only the agent the choice named goes.
 *   5. A comment chosen for one agent and then for another is addressed to the second alone, as a comment chosen only
 *      for the second is, and it still waits to be sent.
 *   6. A comment to an agent nothing answers as has a copy routed to the agent's owner. The copy is kept in `routed` and
 *      never written into `to`. Unchosen, and then with its words changed, the comment still waits for a choice.
 */
describe('a comment whose choice is taken back has not been sent', () => {
  /** A module, a durable agent, a run that worked as it, and a review of the module that is still collecting. */
  async function aReviewAndARunToChoose(handle: string, externalId: string): Promise<{ on: string; review: string; run: string }> {
    const on = await file('module', 'The gripper', { context: 'x' })
    const agentId = await aDurableAgent(handle)
    const run = await resumableSession(`The run answering as ${handle}`, externalId)
    await bindTheRunToTheAgent(run, agentId)
    const review = await startReview(on)
    return { on, review, run }
  }

  /** A comment written the way the chat composer writes one, to nobody yet: no choice and no `to`. */
  async function commentToNobody(on: string, body: string): Promise<string> {
    return file('message', body.slice(0, 40), {
      body,
      target: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } },
    })
  }

  /** The comment's data, read back from the record. */
  async function storedData(id: string): Promise<Record<string, unknown>> {
    const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as { record: { data: Record<string, unknown> } }).record.data
  }

  /** What the message pool says of the comment: whether it has not been sent yet. */
  async function notSentYet(id: string): Promise<boolean> {
    const res = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as { message: { notSentYet: boolean } }).message.notSentYet
  }

  /** The `to` a comment holds, which must name somebody before the choice is taken back, or the case proves nothing. */
  async function itIsAddressed(id: string): Promise<unknown[]> {
    const to = (await storedData(id))['to']
    expect(Array.isArray(to) && to.length > 0, `the comment names nobody in to: ${JSON.stringify(to)}`).toBe(true)
    return to as unknown[]
  }

  /** The four things a comment that waits for somebody to be chosen says. */
  async function itWaitsForAChoice(comment: string, review: string): Promise<void> {
    const data = await storedData(comment)
    expect(data['to'], 'the agent the choice named is still in to').toBeUndefined()
    expect(data['chosenRecipient'] ?? null).toBeNull()

    expect(await notSentYet(comment), 'the message pool says the comment has gone').toBe(true)

    const member = (await readReview(review)).members.find((one) => one.id === comment)
    expect(member, 'the review no longer lists the comment').toBeDefined()
    expect(member?.state).toBe('queued')
    expect(member?.chosen ?? null).toBeNull()
    expect((await whereTheyWouldGo(review)).comments.find((one) => one.id === comment)?.says).toContain('No recipient chosen')

    const marks = t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ?').all(comment) as { mark: string }[]
    expect(marks.filter((row) => row.mark !== 'queued'), 'somebody was handed the comment').toEqual([])
  }

  it('chosen by a later press and then unchosen, it waits in its review for a choice', async () => {
    const { on, review, run } = await aReviewAndARunToChoose('unchosen-after-a-press', 'ext-unchosen-after-a-press')
    const comment = await commentToNobody(on, 'Chosen by a later press, then unchosen.')
    await finishCollecting(review)

    await chooseWhoItIsFor(comment, { kind: 'session', sessionId: run })
    await itIsAddressed(comment)
    await chooseWhoItIsFor(comment, null)
    await itWaitsForAChoice(comment, review)
  })

  it('chosen when it was written and then unchosen, it waits in its review for a choice', async () => {
    const { on, review, run } = await aReviewAndARunToChoose('unchosen-when-written', 'ext-unchosen-when-written')
    const comment = await commentTo(on, 'Chosen when it was written, then unchosen.', run)
    await finishCollecting(review)

    await itIsAddressed(comment)
    await chooseWhoItIsFor(comment, null)
    await itWaitsForAChoice(comment, review)
  })

  it('a comment that went out keeps what it went to when its choice is taken back afterwards', async () => {
    const { on, review, run } = await aReviewAndARunToChoose('unchosen-after-it-went', 'ext-unchosen-after-it-went')
    const comment = await commentTo(on, 'Sent with the review, then unchosen.', run)
    await finishCollecting(review)
    // THE SEND NEEDS A LIVE SESSION HOLDING THE AGENT'S HANDLE, as in the describe above, or it hands the comment to nobody.
    const held = await app.inject({
      method: 'POST',
      url: '/api/handles/unchosen-after-it-went/hold',
      headers: HUMAN,
      payload: { session: run, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)
    const sent = await send(review)
    expect(sent.status, sent.body).toBe(200)
    expect(sent.reply.sent).toBe(1)
    const went = await itIsAddressed(comment)
    expect(await notSentYet(comment), 'the send did not carry the comment').toBe(false)

    // THE DOOR ITSELF, with no helper. Before the change it accepted this, because the choice is a field its writer
    // may change at any time, and it left `to` as it was. That is what this case holds.
    const unchosen = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: HUMAN,
      payload: { dataPatch: { chosenRecipient: null } },
    })
    expect(unchosen.statusCode, unchosen.body).toBe(200)
    expect((await storedData(comment))['to']).toEqual(went)
    expect(await notSentYet(comment)).toBe(false)
  })

  it('keeps a person its writer added before the choice was taken back, and only the agent goes', async () => {
    const { on, review, run } = await aReviewAndARunToChoose('unchosen-beside-the-person', 'ext-unchosen-beside-the-person')
    const comment = await commentToNobody(on, 'Chosen, given to the person too, then unchosen.')
    await finishCollecting(review)

    await chooseWhoItIsFor(comment, { kind: 'session', sessionId: run })
    const theAgent = await itIsAddressed(comment)
    const thePerson = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
    const added = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: HUMAN,
      payload: { dataPatch: { to: [...theAgent, thePerson] } },
    })
    expect(added.statusCode, added.body).toBe(200)

    await chooseWhoItIsFor(comment, null)
    const data = await storedData(comment)
    expect(data['to']).toEqual([thePerson])
    expect(data['chosenRecipient'] ?? null).toBeNull()
  })

  it('chosen for one agent and then for another, it is addressed to the second alone and still waits to be sent', async () => {
    const { on, review, run } = await aReviewAndARunToChoose('chosen-first', 'ext-chosen-first')
    const second = await resumableSession('The run answering as chosen-second', 'ext-chosen-second')
    await bindTheRunToTheAgent(second, await aDurableAgent('chosen-second'))
    const comment = await commentToNobody(on, 'Chosen for one agent, then for another.')
    // WHAT CHOOSING THE SECOND AGENT GIVES A COMMENT THAT WAS NEVER CHOSEN, which is the `to` the first must end with.
    const onlyTheSecond = await commentToNobody(on, 'Chosen for the second agent only.')
    await finishCollecting(review)

    await chooseWhoItIsFor(comment, { kind: 'session', sessionId: run })
    const theFirst = await itIsAddressed(comment)
    await chooseWhoItIsFor(onlyTheSecond, { kind: 'session', sessionId: second })
    const theSecond = await itIsAddressed(onlyTheSecond)
    expect(theSecond, 'the two runs answer as one agent, so the case proves nothing').not.toEqual(theFirst)

    await chooseWhoItIsFor(comment, { kind: 'session', sessionId: second })
    expect((await storedData(comment))['to'], 'the first agent is still in to').toEqual(theSecond)
    expect(await notSentYet(comment), 'the message pool says the comment has gone').toBe(true)
    expect((await readReview(review)).members.find((one) => one.id === comment), 'the review no longer lists the comment').toBeDefined()
  })

  it('unchosen, it keeps the copy routed to an owner out of `to` when its words change afterwards', async () => {
    const { on, review } = await aReviewAndARunToChoose('routed-first-owner', 'ext-routed-first-owner')
    // AN AGENT NOTHING ANSWERS AS, AND AN OWNER A RUN IS WAITING FOR. The owner holds the secretary card and owns nobody,
    // so the create door routes a copy of the comment to it, as tests/a-message-follows-the-owners-of-an-unheld-agent.test.ts
    // routes a message.
    const target = await aDurableAgent('routed-unheld')
    const owner = await aDurableAgent('routed-owner')
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const { localStamp } = await import('../src/shared/time.ts')
    const { setFixtureOwner } = await import('./agent-owner-fixture.ts')
    t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(theRoleCards().elevation.onlyThisCardCanHoldIt, owner)
    setFixtureOwner(t.client.sqlite, owner, target, 'id')
    setFixtureOwner(t.client.sqlite, null, owner, 'id')
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'A run waiting as the owner',
      data: {
        state: 'finished',
        runtime: 'claude-code',
        servingAgentId: owner,
        deliveringMessage: 'test-message',
        providerSession: `test-conversation-${owner}`,
        waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)),
      },
      actor: t.api.HUMAN,
    })

    // CHOSEN WHEN IT WAS WRITTEN. The door answers a person's send to an agent nothing answers as with its own status,
    // which this case does not hold, and stores the comment either way.
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'message',
        title: 'Chosen for an agent nobody holds.',
        data: {
          body: 'Chosen for an agent nobody holds, then unchosen.',
          target: { target: { kind: 'record', recordId: on, workspaceId: WORKSPACE } },
          chosenRecipient: { kind: 'agent', agentId: target },
        },
      },
    })
    const written = (made.json() as { record?: { id: string } }).record
    expect(written, made.body).toBeDefined()
    const comment = (written as { id: string }).id
    await finishCollecting(review)

    const routed = (await storedData(comment))['routed'] as { to: unknown }[] | undefined
    expect(routed?.map((one) => one.to), 'no copy was routed, so the case proves nothing').toEqual([{ kind: 'agent', id: owner }])
    expect(await itIsAddressed(comment)).toEqual([{ kind: 'agent', id: target }])

    await chooseWhoItIsFor(comment, null)
    await itWaitsForAChoice(comment, review)

    const reworded = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Chosen for an agent nobody holds, unchosen, and then reworded.' } },
    })
    expect(reworded.statusCode, reworded.body).toBe(200)
    expect((await storedData(comment))['to'], 'the copy routed to the owner was written into to').toBeUndefined()
    await itWaitsForAChoice(comment, review)
  })
})
