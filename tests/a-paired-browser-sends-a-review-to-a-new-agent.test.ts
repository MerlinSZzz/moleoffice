// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A browser pairs on the Pairing page, then sends a review to a new agent with the two halves the
 * office gave it: the cookie half and the header half the page keeps. No request is intercepted and
 * no key is copied into the browser by the test.
 * A separate browser with no pairing is refused before a conversation, agent, run or message is written.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-paired-browser-sends-a-review-to-a-new-agent.test.ts
 * After a green control, copy the changed file before each one-line mutation:
 * - In src/web/api.ts, change theRequestItself's credentials from 'include' to
 *   path.endsWith('/send') ? 'omit' : 'include'. Pairing still works, but Send loses the cookie
 *   and the paired browser's send gets 403 instead of 200.
 * - In src/server/lib/agents.ts, put the old refusal sentence back in proofForStartingANewAgent.
 *   The unpaired browser still gets 403, but the sentence assertion goes red.
 * Restore each file with cp, check it with cmp, and run this command again for green.
 * REVIEW_PAIR_SHOTS saves the refusal at the four chapter 6 widths in both themes.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE } from '../src/config/key-header.mjs'
import type { ReviewDetail, SendOutcome } from '../src/server/lib/reviews.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const REFUSAL = 'Nothing was sent. This request did not prove it comes from the person. If you are using a browser, pair it first on the Pairing page (#/pairing).'
const COMMENT = 'Synthetic review: please check the two totals.'
let app: LiveApp
let aboutId: string
let reviewId: string
let commentId: string

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return await reply.json() as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'paired-review-send', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
})
afterAll(async () => { await app?.stop() })

/** A page, a review and one comment, made by the case that is about to use them. */
beforeEach(async () => {
  // ONE OFFICE, ONE FRESH PAGE FOR EACH CASE: the page's remembered review column and paired cookie belong to the case
  // that made them, and the office and its records are what the file now shares.
  await app.context.clearCookies()
  app.page = await app.context.newPage()
  await app.page.goto(app.site)
  await app.page.evaluate(() => window.localStorage.clear())
  const note = await post<{ record: { id: string } }>('/api/records', {
    kind: 'note', title: 'Synthetic page for the browser send test', data: { body: 'Two totals to check.' },
  })
  aboutId = note.record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
  reviewId = review.review.id
  const comment = await post<{ record: { id: string } }>('/api/records', {
    kind: 'message', title: 'Synthetic comment for a new agent',
    data: { body: COMMENT, chosenRecipient: { kind: 'new', said: 'a new agent' }, target },
  })
  commentId = comment.record.id
  await post(`/api/reviews/${reviewId}/finish-collecting`, {})
})

afterEach(async () => { await app.page.close() })

/** Open the note, then the review column and the one review this case made. */
async function openReview(): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${aboutId}`)
  await waitForThePage(app.page)
  await app.page.locator('.px-review-switch').click()
  // THE LIST IS NEWEST FIRST, so the first row is the review this case made a moment ago.
  await app.page.locator('.px-pane-list .px-rev-go').first().click()
  await app.page.getByRole('button', { name: 'Send this review', exact: true }).waitFor()
}

async function pressSend() {
  const reply = app.page.waitForResponse((response) =>
    response.url() === `${app.api}/api/reviews/${reviewId}/send` && response.request().method() === 'POST')
  await app.page.getByRole('button', { name: 'Send this review', exact: true }).click()
  return await reply
}

async function readReview(): Promise<ReviewDetail> {
  const reply = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON })
  expect(reply.status).toBe(200)
  return await reply.json() as ReviewDetail
}

/** Read only this test office, and only the rows a refused send must leave alone. */
function sendRows() {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return ['agents', 'held_keys', 'agent_threads', 'agent_messages', 'agent_runs', 'message_delivery'].map((table) =>
      db.prepare(`SELECT id FROM ${table} ORDER BY id`).all())
  } finally { db.close() }
}

describe('sending a review from a browser to a new agent', () => {
  it('pairs through the page and sends with the two halves that pairing gave', async () => {
    await app.page.goto(`${app.site}/#/pairing`)
    await waitForThePage(app.page)
    await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
    await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
    const paired = (await app.context.cookies(app.api)).find((cookie) => cookie.name === DEVICE_HALF_COOKIE)
    expect(paired !== undefined && paired.httpOnly && paired.sameSite === 'Strict').toBe(true)
    const { DEVICE_HALF_KEY } = await import('../src/web/lib/the-device-half.ts')
    expect(await app.page.evaluate((key) => window.localStorage.getItem(key) !== null, DEVICE_HALF_KEY), 'the page keeps no header half').toBe(true)

    await openReview()
    const reply = await pressSend()
    expect(reply.status(), await reply.text()).toBe(200)
    const sent = await reply.json() as SendOutcome
    expect(sent.sent).toBe(1)
    // ONE MESSAGE TO THE NEW AGENT. Until round 19 of wave 13u this was one run with no session, which
    // nothing picks up; the send writes no run now, and the new agent is given one message from the person.
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0]?.to).toEqual(expect.any(String))
    expect(sent.held).toEqual([])
    await app.page.getByText('This review has gone', { exact: true }).waitFor()
    const stored = await readReview()
    expect(stored.review.state).toBe('sent')
    expect(stored.review.threadId).toBe(sent.threadId)
    expect(stored.members.find((member) => member.id === commentId)).toMatchObject({ state: 'sent' })
  })

  it('refuses an unpaired browser, names Pairing, and leaves the comment unsent', async () => {
    await openReview()
    expect((await app.context.cookies(app.api)).some((cookie) => cookie.name === DEVICE_HALF_COOKIE)).toBe(false)
    const before = sendRows()
    const reply = await pressSend()
    expect(reply.status()).toBe(403)
    expect((await reply.json() as { error: string }).error).toBe(REFUSAL)
    const refusal = app.page.getByText(REFUSAL, { exact: true })
    await refusal.waitFor()
    expect(await refusal.isVisible()).toBe(true)
    expect((await app.page.locator('body').innerText()).match(/Nothing was sent/g)).toHaveLength(1)
    expect(sendRows()).toEqual(before)
    const stored = await readReview()
    expect(stored.review.state).toBe('collected')
    expect(stored.review.threadId).toBeNull()
    expect(stored.members.find((member) => member.id === commentId)).toMatchObject({ state: 'queued', body: COMMENT })

    const shots = process.env['REVIEW_PAIR_SHOTS']
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await refusal.scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: join(shots, `review-refused-${width}-${theme}.png`) })
        }
      }
    }
  })
})
