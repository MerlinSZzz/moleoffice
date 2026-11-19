// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { join } from 'node:path'
/** This finished conversation attachment predates seals and is explicitly inventoried; all recipient and sending assertions remain. */
import Database from 'better-sqlite3'
/**
 * SENDING FROM THE PANEL AND SENDING FROM THE REVIEW COLUMN ARE ONE ACT.
 *
 * One send, from the dialog or from the review column on the right. Criterion M28.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The panel's press never sent anything. With no review open it said the comments belonged to
 * none; with a review collecting it made one call to the send route, which answers 409 while a
 * review collects, and showed that sentence. So the act the panel offered could not be finished
 * from the panel. That is half of why criterion M28 was not met.
 *
 * In the column the same act is two presses: **Finish collecting**, confirmed, and then **Send this
 * review**. The panel now asks the same question in the same words and then makes the same two
 * calls in the same order.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 2. Faced with a review that is still collecting, it asks before it finishes one — the press does
 *    not quietly end a collection somebody had not finished.
 * 3. Told to go on, it finishes collecting and sends, and the comments really went.
 * 5. A refusal a person reads names a press, not an API route.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePersonsKeyHeader, liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REVIEW_STATES as REVIEW_VOCABULARY } from '../src/shared/states.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let aboutId = ''
/** The session a comment is addressed through, as the composer addresses one. */
let sessionId = ''

async function file(kind: string, title: string, data: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    // A SESSION FOR AN AGENT IS FILED WITH THE PERSON'S KEY: a claim to be the person with no key may not file one.
    headers: kind === 'session' ? { ...AS_THE_OWNER, ...thePersonsKeyHeader(app.dir + '/keys.json') } : AS_THE_OWNER,
    body: JSON.stringify({ kind, title, data }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-send-act', viewport: { width: 1440, height: 900 } })
  aboutId = await file('note', 'A page two presses could send comments from', { body: 'One paragraph.' })
  const agentRecordId = await file('agent', 'The reading agent', {
    handle: 'reading-agent',
    runtime: 'claude-code',
    state: 'active',
  })
  sessionId = await file('session', 'A run of the reading agent', {
    state: 'running',
    runtime: 'claude-code',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
  })
  const historical = new Database(join(app.dir, 'panelx.db'))
  try { historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(sessionId) } finally { historical.close() }
  // ENDED WITH THE PERSON'S KEY: a claim to be the person with no key does not end a run (problem FZQflYp1vHuY).
  const finished = await fetch(`${app.api}/api/records/${sessionId}`, { method: 'PATCH', headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(app.dir + '/keys.json') }, body: JSON.stringify({ dataPatch: { state: 'finished' } }) })
  expect(finished.status, await finished.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a review that is still collecting', () => {
  let reviewId = ''
  let commentId = ''

  beforeAll(async () => {
    const started = await fetch(`${app.api}/api/reviews`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        entry: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
      }),
    })
    expect(started.status, await started.clone().text()).toBe(201)
    reviewId = ((await started.json()) as { review: { id: string } }).review.id

    // ADDRESSED AS IT IS WRITTEN, which is what the composer does while a review collects since
    // criterion M28 was met (problem 6W833RRq8iX4). It is addressed to a NEW agent because the
    // send route refuses a run nobody recorded a transcript for, and that refusal would make the
    // 409 below about the comment rather than about the collection, which is not what this file
    // measures.
    commentId = await file('message', 'A comment collected in a review', {
      body: 'This paragraph and the one above say the same thing.',
      chosenRecipient: { kind: 'new', said: 'a new agent' },
      target: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } },
    })
  }, 120_000)

  it('refuses the send, naming a press rather than an API route', async () => {
    const sent = await fetch(`${app.api}/api/reviews/${reviewId}/send`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(app.dir + '/keys.json') },
      body: JSON.stringify({ to: [], only: [commentId] }),
    })
    expect(sent.status, await sent.clone().text()).toBe(409)
    const refusal = ((await sent.json()) as { error: string }).error
    expect(refusal, 'the refusal does not name the press to make').toContain(REVIEW_VOCABULARY.finishCollecting.word)
    expect(refusal, 'the refusal names a raw API route to somebody reading a screen').not.toContain('POST /api/')
  })

  it('is unchanged by the refusal, so nothing was finished on anybody’s behalf', async () => {
    const got = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: AS_THE_OWNER })
    expect(got.status, await got.clone().text()).toBe(200)
    const detail = (await got.json()) as { review: { state: string } }
    expect(detail.review.state, 'the refused send finished the collection anyway').toBe('collecting')
  })

  it('sends once collecting is finished — the two calls the panel now makes in order', async () => {
    const finished = await fetch(`${app.api}/api/reviews/${reviewId}/finish-collecting`, {
      method: 'POST',
      headers: AS_THE_OWNER,
    })
    expect(finished.status, await finished.clone().text()).toBe(200)

    const sent = await fetch(`${app.api}/api/reviews/${reviewId}/send`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(app.dir + '/keys.json') },
      body: JSON.stringify({ to: [], only: [commentId] }),
    })
    expect(sent.status, await sent.clone().text()).toBe(200)

    // THE COMMENT WENT, WHICH IS WHAT THE PANEL'S PRESS IS ABOUT. The review itself stays
    // `collected` here on purpose: the panel names the comments in this conversation and no
    // others, so this is a partial send and saying the whole review had gone would be false.
    const read = await fetch(`${app.api}/api/messages/${commentId}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const message = ((await read.json()) as { message: { notSentYet: boolean } }).message
    expect(message.notSentYet, 'the comment the panel sent is still drawn as unsent').toBe(false)
  }, 120_000)
})
