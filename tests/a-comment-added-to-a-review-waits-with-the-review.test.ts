// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT ADDED TO A COLLECTING REVIEW WAITS WITH THE REVIEW, EVEN WHEN NOBODY HAS CHOSEN WHO THE REVIEW GOES TO.
 * Wave 13y round 134.
 *
 * The problem as it was found: a review collected on a report and nobody had chosen who it goes to. The person wrote a
 * comment in the right-click panel with an agent shown under To and pressed Add to review. The box wrote the comment
 * and then stored the shown agent on it as the comment's own recipient. The server reads a recipient stored on a
 * comment as an address, so it queued a delivery, and the agent's waiting list held the comment at once, before the
 * review was sent. The review counted the comment as held all the same.
 *
 * What the line's secretary set: a comment added to a collecting review stores no recipient of its own. It belongs to
 * the review and goes when the review goes. The server's side, which reads any stored recipient as an address, is a
 * problem of its own and is not changed here.
 *
 * In a real browser against a Mole Office of its own, with made-up records, a review collects over the report and
 * nobody has chosen who it goes to. Each case right-clicks words of the report, writes a comment, chooses the agent
 * under To, and keeps the comment in the review:
 *  1. with the Add to review press;
 *  2. with the send key, which does what Add to review does while the review collects here.
 * In both, the review counts one more comment, and the agent's waiting list, read four times over three seconds, does
 * not hold the comment.
 *
 * Everything here is made up.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const AGENT = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper' }
/** The press's own word, read by its key. */
const ADD = createI18n('en').t('talk.addToReview')

let app: LiveApp
let page: Page
let reportId = ''
let reviewId = ''

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** What is waiting for the agent: each message's words, as the agent asks. */
async function waitingForTheAgent(): Promise<string[]> {
  const reply = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: AS(AGENT.handle) })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return (JSON.parse(text) as { messages: { body: string }[] }).messages.map((one) => one.body)
}

/** How many comments every collecting review holds. */
async function heldInCollectingReviews(): Promise<number> {
  const reply = await fetch(`${app.api}/api/reviews?state=collecting`, { headers: PERSON })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return Object.values((JSON.parse(text) as { collectingHolds: Record<string, number> }).collectingHolds).reduce((sum, n) => sum + n, 0)
}

/** Open the report fresh, right-click the first words of its second paragraph, and wait for the presses. */
async function rightClickTheWords(): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/r/${reportId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await page.locator(run).waitFor({ timeout: 30_000 })
  await page.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 24)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const talk = page.locator('.px-talk')
  await talk.waitFor({ timeout: 20_000 })
  await talk.getByRole('button', { name: ADD, exact: true }).waitFor({ timeout: 30_000 })
}

/** Write words in the open panel and choose the agent under To, then put the cursor back in the box. */
async function writeToTheAgent(words: string): Promise<void> {
  const talk = page.locator('.px-talk')
  await talk.locator('textarea').fill(words)
  await talk.locator('.px-talk-to-btn').click()
  await talk.locator('.px-talk-contact', { hasText: AGENT.name }).first().click()
  await talk.locator('textarea').click()
}

/** The review counts one more comment than `before`, and the agent's waiting list never holds `words` over three seconds. */
async function expectHeldAndNotHandedOver(before: number, words: string): Promise<void> {
  await expect.poll(heldInCollectingReviews, { timeout: 30_000 }).toBe(before + 1)
  for (let reading = 0; reading < 4; reading += 1) {
    expect(await waitingForTheAgent(), `reading ${String(reading + 1)} of the agent's waiting list`).not.toContain(words)
    if (reading < 3) await page.waitForTimeout(1_000)
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-added-to-a-review-waits', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await post('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } })
  reportId = (
    await post<{ record: { id: string } }>('/api/records', {
      kind: 'report',
      title: 'Made-up report: the second firing',
      data: {
        for: 'A made-up reader',
        date: '2026-11-04',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: 'The made-up kiln holds its heat through a second firing.' },
          { id: 'b-2', type: 'text', heading: 'What moved', text: 'The made-up glaze ran at the foot of the tile. Nothing else moved.' },
        ],
      },
    })
  ).record.id
  // A REVIEW NOBODY CHOSE A RECIPIENT FOR, which is the path this file is about.
  reviewId = (
    await post<{ review: { id: string } }>('/api/reviews', {
      entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } },
    })
  ).review.id
  const reply = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  expect((JSON.parse(text) as { goesTo: { ground: string } }).goesTo.ground, 'somebody chose who the review goes to').not.toBe('chosen')
}, 240_000)

afterAll(async () => {
  // LEFT FINISHED RATHER THAN COLLECTING, so nothing after this file inherits an open review.
  if (reviewId !== '') await post(`/api/reviews/${reviewId}/finish-collecting`, {})
  await app?.stop()
}, 60_000)

describe('with a review collecting that nobody chose a recipient for, and an agent shown under To', () => {
  it('1. Add to review keeps the comment in the review, and the agent is not handed it', async () => {
    await rightClickTheWords()
    const before = await heldInCollectingReviews()
    const words = 'Made-up comment one: the glaze ran at the foot.'
    await writeToTheAgent(words)
    await page.locator('.px-talk').getByRole('button', { name: ADD, exact: true }).click()
    await expectHeldAndNotHandedOver(before, words)
  }, 180_000)

  it('2. the send key keeps the comment in the review, and the agent is not handed it', async () => {
    await rightClickTheWords()
    const before = await heldInCollectingReviews()
    const words = 'Made-up comment two: the second firing ran long.'
    await writeToTheAgent(words)
    await page.keyboard.press('Shift+Enter')
    await expectHeldAndNotHandedOver(before, words)
  }, 180_000)
})
