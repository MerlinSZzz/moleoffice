// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW'S SEND SAYS WHAT IT REALLY SENT, NOT WHAT IT WAS ASKED ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/reviews/<id>/send` answered 200 and said *"Sent: 1 comment to … Nobody has picked it
 * up yet"* about a comment that already had a delivery row marked delivered, with a run on it,
 * written eight seconds earlier. Nothing moved: the delivery row was the same before and after and
 * the conversation held 41 messages either side of the press. In a browser the same press said
 * *"Sent: 2 comments … Nobody has picked it up yet"* on a screen that, three lines above, said of
 * one of them *"This comment has already gone to somebody"*.
 *
 * It is invariant 1 of USER.md: a reply that says a thing was done must mean it was done. The person is
 * told the words have just gone and that nobody has read them, when they went minutes earlier and
 * the agent has already answered. A reader deciding whether to write again can trust neither half.
 * Problem `p9enuTYIC-S6`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A send of comments that had already reached their agent does not claim it sent them now, and
 *    does not claim nobody has read them. It says how many had already gone.
 * 2. A send of comments nobody had been handed says what it always said.
 * 3. A send of a mixture counts only the new ones in "Sent: N", and says the rest had gone.
 * 4. The number on the wire says the same thing as the sentence.
 *
 * The comments here reach their agent through the delivery mark, which is what a live session
 * answering as that agent moves. That is the state the fault was found in, and it is the state that
 * remains reachable now that a review holds its comments back from the message worker.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'already-gone-agent'

let sessionId = ''

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(theAnswerToAWriteInATestOffice(HUMAN, { kind, data }))
  return (res.json() as { record: { id: string } }).record.id
}

async function post<T>(path: string, payload?: Record<string, unknown>, expected = 200): Promise<T> {
  const res = await app.inject({
    method: 'POST',
    url: path,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    ...(payload === undefined ? {} : { payload }),
  })
  expect(res.statusCode, res.body).toBe(expected)
  return res.json() as T
}

/** Mark a comment delivered, as the session answering as that agent does. */
async function theAgentTakesIt(id: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/messages/${id}/mark`,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': HANDLE,
    },
    payload: { mark: 'delivered' },
  })
  expect(res.statusCode, res.body).toBe(200)
}

async function comment(body: string, on: string): Promise<string> {
  return file('message', body.slice(0, 40), {
    body,
    chosenRecipient: { kind: 'session', sessionId, why: 'It wrote this page.' },
    target: { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } },
  })
}

interface Sent {
  sent: number
  alreadyGone: number
  says: string
}

/** Start a review on one page, put comments on it, and send it. */
async function reviewOf(page: string, bodies: string[], takenFirst: number): Promise<Sent> {
  const started = await post<{ review: { id: string } }>(
    '/api/reviews',
    { entry: { target: { kind: 'record', recordId: page, workspaceId: 'default' }, place: { at: 'surface' } } },
    201,
  )
  const ids: string[] = []
  for (const body of bodies) ids.push(await comment(body, page))
  for (const id of ids.slice(0, takenFirst)) await theAgentTakesIt(id)
  await post(`/api/reviews/${started.review.id}/finish-collecting`, undefined)
  return post<Sent>(`/api/reviews/${started.review.id}/send`, { to: [], only: ids })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  const agentRecordId = await file('agent', 'Already gone agent', {
    handle: HANDLE,
    runtime: 'claude-code',
    state: 'active',
  })
  const externalId = 'already-gone-run'
  sessionId = await file('session', 'A run of the already gone agent', {
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
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a send of comments that had already reached their agent', () => {
  let outcome: Sent

  beforeAll(async () => {
    const page = await file('note', 'A page whose comments went early', { body: 'One claim.' })
    outcome = await reviewOf(page, ['This one went before the press.', 'So did this one.'], 2)
  }, 120_000)

  it('does not say it sent them now', () => {
    expect(outcome.says, 'a send that moved nothing said it had sent something').not.toMatch(/^Sent: /)
  })

  it('does not say nobody has picked them up, when the agent already had them', () => {
    expect(outcome.says, 'the reply says nobody has read words the agent already took').not.toMatch(
      /(Not|None) picked up yet/,
    )
  })

  it('says plainly that they had already gone, and how many', () => {
    expect(outcome.says, 'the reply does not say the comments had already reached their agent').toContain(
      'already reached',
    )
    expect(outcome.says, 'the reply does not say how many there were').toContain('2')
  })

  it('says the same thing on the wire as in the words', () => {
    expect(outcome.alreadyGone, 'the number does not agree with the sentence').toBe(2)
    expect(outcome.sent, 'the review did not carry the comments it was asked about').toBe(2)
  })
})

describe('a send of comments nobody had been handed', () => {
  let outcome: Sent

  beforeAll(async () => {
    const page = await file('note', 'A page whose comments waited', { body: 'One claim.' })
    outcome = await reviewOf(page, ['This one waited for the press.'], 0)
  }, 120_000)

  it('says what it always said', () => {
    expect(outcome.says, 'a real send stopped saying it sent something').toContain('Sent: 1 comment')
    expect(outcome.says, 'a real send stopped saying nobody has read it').toContain('Not picked up yet')
  })

  it('counts nothing as already gone', () => {
    expect(outcome.alreadyGone).toBe(0)
    expect(outcome.sent).toBe(1)
  })
})

describe('a send of a mixture', () => {
  let outcome: Sent

  beforeAll(async () => {
    const page = await file('note', 'A page with one of each', { body: 'One claim.' })
    outcome = await reviewOf(page, ['This one went early.', 'This one waited.', 'So did this one.'], 1)
  }, 120_000)

  it('counts only the ones it really handed over in "Sent"', () => {
    expect(outcome.says, 'the count includes a comment that had already gone').toContain('Sent: 2 comments')
  })

  it('says the third had already gone rather than counting it in', () => {
    expect(outcome.says, 'the reply says nothing about the comment that had already gone').toContain(
      '1 of them had already reached',
    )
    expect(outcome.alreadyGone).toBe(1)
    expect(outcome.sent, 'the review carried all three either way').toBe(3)
  })
})
