// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A COMMENT IN A REVIEW WAITS FOR THE REVIEW'S SEND. NAMING THE AGENT IS NOT SENDING IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * From that morning a comment gets its delivery rows the moment its recipient is known, which is
 * what puts it in the conversation (problem `fhxBfI7wb1nz`). But `theQueue` takes every delivery row
 * for an agent still marked `queued` and never asked whether the message belonged to a review. So
 * naming the agent WAS sending the comment: verifier 5 polled the pool every 400 ms after the press
 * and read unsent at 40 ms, unsent at 1040 ms, and **delivered with a run on it at 1813 ms**.
 *
 * Each comment went on its own, each starting its own run, and by the time the person reached the send press
 * there was nothing left to send. So this state could not be reached: when a review leaves several
 * comments for one agent, all of them are shown as not sent yet, and they can be sent together from the
 * conversation box or the review column. Criterion M28, problem `g4M_z6965R5o`.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRIVES THE REAL WORKER PASS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `onePass` is what decides whether a run starts, so this file calls it rather than watching a
 * clock and hoping. A test that only read the delivery rows would pass with the hold deleted,
 * because nothing in it would ever have started a run — measured on 5 September 2026, when the
 * first writing of this file did exactly that and its mutation came back green.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. Two comments addressed to one agent while a review collects are HELD by a worker pass: no run
 *    is started, the delivery rows stay queued, they stay `notSentYet`, and both are in that
 *    agent's conversation. That is the state described above.
 * 2. The pass says why, in a sentence a person can read that names what to press.
 * 3. Finishing collecting does not release them. In the review column that is a separate press
 *    minutes before the send, and a hold that lifted there would send what the person had not sent.
 * 4. The review's send releases them, and then a pass starts the run.
 * 5. A comment in no review is not held. Writing one is still sending it.
 * 6. An abandoned review holds nothing.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let outputs = ''
let watching: Parameters<typeof onePass>[1] = []

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'held-comment-agent'
const FIRST = 'This claim needs the repository it was written against.'
const SECOND = 'The second paragraph says the same thing as the first.'

let agentRegistryId = ''
let sessionId = ''
let aboutId = ''
let elsewhereId = ''

async function file(kind: string, title: string, data: Record<string, unknown>, answers: 201 | 409 = 201): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(answers)
  return (res.json() as { record: { id: string } }).record.id
}

async function get<T>(path: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url: path, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as T
}

async function post<T>(path: string, payload?: Record<string, unknown>, expected = 200): Promise<T> {
  const res = await app.inject({
    method: 'POST',
    url: path,
    headers: HUMAN,
    ...(payload === undefined ? {} : { payload }),
  })
  expect(res.statusCode, res.body).toBe(expected)
  return res.json() as T
}

/** A comment on a record, addressed to the agent the way the composer addresses one. */
async function comment(body: string, on: string, answers: 201 | 409 = 409): Promise<string> {
  return file('message', body.slice(0, 40), {
    body,
    chosenRecipient: { kind: 'session', sessionId, why: 'It wrote this page.' },
    target: { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } },
  }, answers)
}

/**
 * WHY A REVIEW IS HOLDING THIS COMMENT IN THIS PASS, or null because no review is.
 *
 * IT IS NOT THE SAME QUESTION AS "IS IT HELD AT ALL". The worker holds a message for several
 * reasons, and one of them is ordinary and expected here: an agent gets one run at a time, so a
 * comment released by the send is often held one pass longer because the run for the comment beside
 * it is still going. Asking "is it held" instead made this file fail one run in two, with the
 * sentence "held-comment-agent already has a run going" — which is not this file's subject.
 */
function whyAReviewHoldsIt(pass: { held: { messageId: string; because: string }[] }, id: string): string | null {
  const row = pass.held.find((one) => one.messageId === id)
  if (row === undefined) return null
  return row.because.includes(CHAT_WORDS.sendThemAll) ? row.because : null
}

interface Message {
  id: string
  notSentYet: boolean
  to: { kind: string; id: string }[]
  deliveries: { mark: string; run: string | null }[]
}

async function readMessage(id: string): Promise<Message> {
  return (await get<{ message: Message }>(`/api/messages/${id}`)).message
}

async function startAReview(on: string): Promise<string> {
  const made = await post<{ review: { id: string } }>(
    '/api/reviews',
    { entry: { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } } },
    201,
  )
  return made.review.id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-review-holds-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }

  const agentRecordId = await file('agent', 'Held comment agent', {
    handle: HANDLE,
    runtime: 'claude-code',
    state: 'active',
  })
  agentRegistryId = (
    await get<{ participant: { id: string } }>(`/api/participants/agent/${HANDLE}`)
  ).participant.id

  // A RUN MOLE OFFICE COULD REALLY PICK UP AGAIN. The review's send refuses a run nobody recorded a
  // transcript for, and that refusal would make the send below fail for a reason this file is not
  // about. The stamps are the ones discovery writes on a run it found.
  const externalId = 'held-comment-run'
  sessionId = await file('session', 'A run of the held comment agent', {
    state: 'idle',
    runtime: 'claude-code',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath: fakeTranscript(externalId),
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-09-05 05:00:00',
      },
    },
  })

  aboutId = await file('note', 'The page a review collects from', { body: 'Two claims and a table.' })
  elsewhereId = await file('note', 'A page no review covers', { body: 'One paragraph.' })
}, 120_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('two comments left for one agent while a review collects', () => {
  let reviewId = ''
  let first = ''
  let second = ''
  let held: { messageId: string; because: string }[] = []
  let started: unknown[] = []

  beforeAll(async () => {
    reviewId = await startAReview(aboutId)
    first = await comment(FIRST, aboutId)
    second = await comment(SECOND, aboutId)
    // TWO PASSES, because one pass proving nothing started could be one pass that did nothing.
    const one = await onePass(settings, watching)
    const two = await onePass(settings, watching)
    held = [...one.held, ...two.held]
    started = [...one.started, ...two.started]
  }, 120_000)

  it('starts no run for either of them, however many passes go by', () => {
    expect(started, 'a run was started for a comment nobody had sent').toEqual([])
  })

  it('is held by the worker, which says why in words a person can read', () => {
    for (const id of [first, second]) {
      const row = held.find((one) => one.messageId === id)
      expect(row, `${id} was not held by anything, so a run would start for it`).toBeDefined()
      expect(row?.because, `${id} is held, but for some other reason than the review`).toContain(
        CHAT_WORDS.sendThemAll,
      )
      // WHAT IT HAS TO SAY: what is holding it, what lets it go, and that nothing is lost.
      expect(row?.because, 'the sentence does not say a review is holding it').toContain('review')
      expect(row?.because, 'the sentence does not name a press').toContain(CHAT_WORDS.sendThemAll)
      expect(row?.because, 'the sentence does not say the words are safe').toContain('Nothing is lost')
      expect(row?.because, 'the sentence names a raw API route').not.toContain('POST /api/')
    }
  })

  it('leaves both waiting, with nothing handed to anybody', async () => {
    for (const id of [first, second]) {
      const one = await readMessage(id)
      expect(one.deliveries.map((row) => row.mark), `${id} was handed over`).toEqual(['queued'])
      expect(one.deliveries.map((row) => row.run), `${id} had a run started for it`).toEqual([null])
      expect(one.notSentYet, `${id} is drawn as sent`).toBe(true)
    }
  })

  it('draws both in that agent’s conversation, which is the other half of the person\'s words', async () => {
    const conversation = await get<{ messages: { id: string }[] }>(
      `/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentRegistryId)}`,
    )
    expect(conversation.messages.map((row) => row.id), 'the comments are in no conversation').toEqual(
      expect.arrayContaining([first, second]),
    )
  })

  it('is not released by finishing collecting, which is a separate press', async () => {
    await post(`/api/reviews/${reviewId}/finish-collecting`, undefined)
    const pass = await onePass(settings, watching)
    expect(pass.started, 'finishing collecting sent the person\'s comments, before anybody pressed send').toEqual([])
    expect(
      whyAReviewHoldsIt(pass, first),
      'the review stopped holding the comment between the two presses',
    ).not.toBeNull()
  }, 120_000)

  it('is released by the review’s send, and then a run starts', async () => {
    const sent = await app.inject({
      method: 'POST', url: `/api/reviews/${reviewId}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() }, payload: { to: [], only: [first, second] },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    // AND THE PERSON PRESSES TO START AN AGENT FOR EACH. Criterion M78: the agent these comments
    // are for is fresh and has no conversation here to pick up, so a message to it waits for the person's
    // press. What this case is about is the REVIEW letting the comments go, so the press is setup.
    for (const one of [first, second]) await post(`/api/messages/${one}/start-an-agent`, {})
    const pass = await onePass(settings, watching)
    expect(whyAReviewHoldsIt(pass, first), 'a comment the review sent is still held by the review').toBeNull()
    expect(pass.started.length, 'the send released the comments and nothing took them').toBeGreaterThan(0)
  }, 120_000)
})

describe('a comment in no review', () => {
  it('is not held: writing one is still sending it', async () => {
    // A run of this agent is going, started by the case above, so this send is answered 201.
    const id = await comment('This one belongs to no review at all.', elsewhereId, 201)
    const pass = await onePass(settings, watching)
    expect(whyAReviewHoldsIt(pass, id), 'a comment belonging to no review was held by a review').toBeNull()
  }, 120_000)
})

describe('a review nobody is going to send', () => {
  it('holds nothing once it is abandoned', async () => {
    const page = await file('note', 'The page of an abandoned review', { body: 'One claim.' })
    const reviewId = await startAReview(page)
    // A run of this agent is going, started by the case above, so this send is answered 201.
    const id = await comment('This one is in a review that gets abandoned.', page, 201)
    expect(
      whyAReviewHoldsIt(await onePass(settings, watching), id),
      'a collecting review is not holding its comment',
    ).not.toBeNull()

    await post(`/api/reviews/${reviewId}/abandon`, undefined)
    expect(
      whyAReviewHoldsIt(await onePass(settings, watching), id),
      'an abandoned review is still swallowing the words',
    ).toBeNull()
  }, 120_000)
})
