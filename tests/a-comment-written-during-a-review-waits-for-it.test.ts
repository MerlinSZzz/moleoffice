// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT WRITTEN DURING A REVIEW WAITS FOR THE REVIEW. Problem 6yMD5gal_oXz, wave 13x round 22.
 *
 * Start review was pressed on a flow page and a comment was written on its stages. The comment
 * reached the secretary at once, in the secretary's translation in y_Vqv-Kab1Ga. It was meant to wait
 * for the review and be sent with the rest of it at the last press.
 *
 * The comment went out by the comment box's Send. The box offered Send first and Start review second whether or not a
 * review was collecting, so after Start review the first press of the next comment's box sent it at once. The secretary's
 * answer (y_Vqv-Kab1Ga) is that while a review collects, the box's first press is "Add to review", and Send stays as a
 * second press whose words say it sends now, outside the review (decision 9BZZVKQxWV9Z item 1 stands: a comment
 * sent directly does not enter a review; tests/start-review-takes-in-what-was-kept-and-send-stays-out.test.ts).
 *
 * Item 72 of wave 13y round 134 put Send back as the first press, and the yellow one, in every box. While a review
 * collects, Add to review is the second press, the send key does what Add to review does, and Send says on hover that
 * it sends now, outside the review. Case 3 presses the second press for that reason.
 *
 * In a real browser against a Mole Office of its own, on a flow page, with the comment box's To set to one agent as
 * the owner's was:
 *  1. Start review on a comment about the stages starts the review and sends nothing.
 *  2. Closing the column and a reload send nothing.
 *  3. Two more comments, each with the second press the box offers, send nothing: that press is Add to review, and
 *     the box says the comment is in the review.
 *  4. A fourth comment, with the send key (Shift+Enter, the key before anybody chooses), sends nothing and is in the
 *     review: the key does what Add to review does.
 *  5. Leaving the page and pressing Keep sends nothing.
 *  6. Send in the review column sends one message to the agent, holding all four comments.
 *  7. A second review, left with Discard, sends nothing.
 * Each "sends nothing" is read as the agent: GET /api/messages?only=waiting-for-me is empty.
 *
 * With TEST_SHOTS set, the last case photographs the comment box during a review and after Add to review at 1440, 990,
 * 660 and 390, light and dark, in English, into the folder `r22-review-holds` under it.
 *
 * Everything here is made up.
 */
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { keepTheCommentInAReview, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const AGENT = { name: 'Made-up Flow Keeper', handle: 'made-up-flow-keeper' }
const COMMENTS = [
  'Made-up comment one: stage two does not say who checks the glaze.',
  'Made-up comment two: stage three has no time limit.',
  'Made-up comment three: the last stage leaves nothing written down.',
  'Made-up comment four: stage one does not say what cleans the tile.',
] as const
/** The box's second press while a review collects, in the secretary's words in y_Vqv-Kab1Ga. Written out, not read from the word list, so this test is the criterion the word is checked against. */
const ADD = 'Add to review'
const SHOTS = testShots('r22-review-holds')
const t = createI18n('en').t

let app: LiveApp
let page: Page
let flowId = ''

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** What is waiting for the agent: each message's words, as the agent asks. */
async function waitingForTheAgent(): Promise<string[]> {
  const reply = await fetch(`${app.api}/api/messages?only=waiting-for-me&full=1`, { headers: AS(AGENT.handle) })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return (JSON.parse(text) as { messages: { body: string }[] }).messages.map((one) => one.body)
}

/** How many comments every collecting review holds, as the fresh read made on leaving counts them. */
async function waitingInCollectingReviews(): Promise<number> {
  const reply = await fetch(`${app.api}/api/reviews?state=collecting`, { headers: PERSON })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  const list = JSON.parse(text) as { collectingHolds: Record<string, number> }
  return Object.values(list.collectingHolds).reduce((sum, n) => sum + n, 0)
}

/** The flow page, opened fresh. */
async function openTheFlow(): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/flows/${flowId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('h2.flw-h2', { hasText: t('flows.stagesHeading') }).waitFor({ timeout: 30_000 })
}

/** Right-click the stages' heading, write `words` in the box, and choose the agent under To. Answers the box. */
async function commentOnTheStages(words: string): Promise<Locator> {
  const heading = page.locator('h2.flw-h2', { hasText: t('flows.stagesHeading') })
  await heading.scrollIntoViewIfNeeded()
  await heading.click({ button: 'right' })
  const talk = page.locator('.px-talk')
  await talk.locator('textarea').waitFor({ timeout: 20_000 })
  await talk.locator('textarea').fill(words)
  await talk.locator('.px-talk-to-btn').click()
  await talk.locator('.px-talk-contact', { hasText: AGENT.name }).first().click()
  return talk
}

/** The box's press at `place` (0 is the first), once the box has drawn its presses: it is not marked unavailable. */
async function thePress(talk: Locator, place: number): Promise<Locator> {
  const press = talk.locator('.px-talk-do > button').nth(place)
  await press.waitFor({ timeout: 30_000 })
  await expect.poll(() => press.getAttribute('aria-disabled'), { timeout: 30_000 }).toBeNull()
  return press
}

/**
 * The review's Send, which sends the review, once the review holds `n` comments. In the tray at the foot of the window
 * (wave 13y round 146, item 73a) it is the row's Send review at every width, and the row says how many comments the
 * review holds; Send N at the foot of the list is not drawn in the tray.
 */
async function theColumnsSend(n: number): Promise<Locator> {
  const row = page.locator('[data-part="your-review"] [data-part="your-review-bar"]')
  await expect.poll(async () => (await row.locator('.px-b-bar-says').textContent()) ?? '', { timeout: 30_000 }).toContain(t('review.b.comments', { n }))
  return row.getByRole('button', { name: t('review.tray.send'), exact: true })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-written-during-a-review', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await post('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } })
  const source = await post<{ record: { id: string } }>('/api/records', { kind: 'report', title: 'Made-up report: why tiles are glazed this way', data: { blocks: [] } })
  const sources = [source.record.id]
  const flow = await post<{ record: { id: string } }>('/api/records', {
    kind: 'flow',
    title: 'Made-up flow: glazing a test tile',
    data: {
      declared_in: 'tools/made-up-glazing.mjs',
      runs: 'the office itself',
      trigger: 'A made-up tile is fired once.',
      stages: [
        { n: 1, does: 'The made-up tile is cleaned.', why: 'Made-up reason: glaze does not hold on dust.', sources },
        { n: 2, does: 'The made-up glaze is mixed and checked.', why: 'Made-up reason: a glaze mixed wrong runs in the kiln.', sources },
        { n: 3, does: 'The made-up tile is fired a second time.', why: 'Made-up reason: the glaze sets only in the second firing.', sources },
      ],
      leaves_behind: 'a made-up glazed tile',
    },
  })
  flowId = flow.record.id
  // SENDING A REVIEW NEEDS THE PAIRED BROWSER.
  await page.goto(`${app.site}/#/pairing`)
  await waitForThePage(page)
  await page.getByRole('button', { name: t('g4.pairing.press'), exact: true }).click()
  await page.getByText(t('g4.pairing.paired'), { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a review started on a flow page holds every comment until its own Send', () => {
  it('Start review on a comment about the stages starts the review and sends nothing', async () => {
    await openTheFlow()
    const talk = await commentOnTheStages(COMMENTS[0])
    await talk.getByRole('button', { name: t('talk.startReview'), exact: true }).click()
    await page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
    expect(await waitingForTheAgent()).toEqual([])
    await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
    await talk.waitFor({ state: 'detached', timeout: 30_000 })
  }, 180_000)

  it('closing the column and a reload send nothing', async () => {
    const review = page.locator('[data-part="your-review"]')
    await review.waitFor({ timeout: 30_000 })
    await page.locator('.px-review-switch').click()
    await review.waitFor({ state: 'detached', timeout: 30_000 })
    expect(await waitingForTheAgent()).toEqual([])
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(await waitingForTheAgent()).toEqual([])
  }, 180_000)

  it('two more comments, each with the second press the box offers, send nothing and are in the review', async () => {
    for (const words of [COMMENTS[1], COMMENTS[2]]) {
      await openTheFlow()
      const talk = await commentOnTheStages(words)
      const second = await thePress(talk, 1)
      const name = (await second.textContent())?.trim() ?? ''
      await second.click()
      expect(name, 'the second press during a review').toBe(ADD)
      await talk.locator('[data-part="in-the-review"]').waitFor({ timeout: 30_000 })
      expect(await waitingForTheAgent()).toEqual([])
      await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
      await talk.waitFor({ state: 'detached', timeout: 30_000 })
    }
  }, 240_000)

  it('a fourth comment, with the send key, sends nothing and is in the review', async () => {
    await openTheFlow()
    const talk = await commentOnTheStages(COMMENTS[3])
    await thePress(talk, 1)
    await talk.locator('textarea').press('Shift+Enter')
    await talk.locator('[data-part="in-the-review"]').waitFor({ timeout: 30_000 })
    expect(await waitingForTheAgent()).toEqual([])
    await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
    await talk.waitFor({ state: 'detached', timeout: 30_000 })
  }, 180_000)

  it('leaving the page and pressing Keep sends nothing', async () => {
    // THE QUESTION IS SET FROM A FRESH READ MADE ON LEAVING, so wait until that read holds all four comments.
    await expect.poll(waitingInCollectingReviews, { timeout: 30_000 }).toBe(4)
    await page.evaluate(() => {
      window.location.hash = '#/'
    })
    const question = page.locator('[data-part="leave-question"]')
    await question.waitFor({ timeout: 30_000 })
    await question.getByText(t('review.leave.count', { n: 4 }), { exact: true }).waitFor({ timeout: 30_000 })
    await question.getByRole('button', { name: t('review.leave.keep'), exact: true }).click()
    await question.waitFor({ state: 'detached', timeout: 30_000 })
    expect(await waitingForTheAgent()).toEqual([])
  }, 120_000)

  it('Send in the review column sends one message to the agent, holding all four comments', async () => {
    await openTheFlow()
    // THE COLUMN, ON THE ONE REVIEW THERE IS: still open from the last press, or opened from the list.
    const review = page.locator('[data-part="your-review"]')
    if (!(await review.isVisible())) {
      await page.locator('.px-review-switch').click()
      await page.locator('.px-rev-go').first().click({ timeout: 30_000 })
    }
    await review.waitFor({ timeout: 30_000 })
    // THE COLUMN HOLDS ALL FOUR COMMENTS: the tray's row says four rather than a fixed sleep guessing when it will.
    const send = await theColumnsSend(4)
    await send.waitFor({ state: 'visible', timeout: 30_000 })
    const sent = page.waitForResponse((r) => /\/api\/reviews\/[^/]+\/send$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
    await send.click()
    expect((await sent).status()).toBe(200)
    const waiting = await waitingForTheAgent()
    expect(waiting, 'one message').toHaveLength(1)
    for (const words of COMMENTS) expect(waiting[0], 'holding each comment').toContain(words)
  }, 180_000)

  it('a second review, left with Discard, sends nothing', async () => {
    await openTheFlow()
    const talk = await commentOnTheStages('Made-up comment five: this one is discarded.')
    await talk.getByRole('button', { name: t('talk.startReview'), exact: true }).click()
    await page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
    await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
    await talk.waitFor({ state: 'detached', timeout: 30_000 })
    // THE FRESH READ MADE ON LEAVING COUNTS THE SECOND REVIEW'S ONE COMMENT.
    await expect.poll(waitingInCollectingReviews, { timeout: 30_000 }).toBe(1)
    await page.evaluate(() => {
      window.location.hash = '#/'
    })
    const question = page.locator('[data-part="leave-question"]')
    await question.waitFor({ timeout: 30_000 })
    await question.getByRole('button', { name: t('review.leave.discard'), exact: true }).click()
    await question.waitFor({ state: 'detached', timeout: 30_000 })
    const waiting = await waitingForTheAgent()
    expect(waiting, 'only the review sent before').toHaveLength(1)
    expect(waiting.join('\n')).not.toContain('Made-up comment five')
  }, 180_000)
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs the comment box during a review, and after Add to review, at four widths in both looks', async () => {
  for (const look of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 })
      await page.goto(`${app.site}/#/`)
      await waitForThePage(page, 60_000)
      await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
      await page.goto('about:blank')
      await openTheFlow()
      // A REVIEW COLLECTING HERE: the first comment of all starts it with Start review, and the others join it with Add
      // to review. Not the first press: where no review collects, that is Send, and it would send.
      const starting = await commentOnTheStages(`Made-up comment at ${String(width)} ${look}, starting or joining the review.`)
      await keepTheCommentInAReview(page)
      await starting.locator('[data-part="in-the-review"]').waitFor({ timeout: 30_000 })
      await starting.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
      await starting.waitFor({ state: 'detached', timeout: 30_000 })
      const talk = await commentOnTheStages(`Made-up comment at ${String(width)} ${look}, added to the review.`)
      await thePress(talk, 1)
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(SHOTS, `${String(width)}-${look}-1-box-during-a-review.png`) })
      await talk.getByRole('button', { name: ADD, exact: true }).click()
      await talk.locator('[data-part="in-the-review"]').waitFor({ timeout: 30_000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(SHOTS, `${String(width)}-${look}-2-added.png`) })
      await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
      await talk.waitFor({ state: 'detached', timeout: 30_000 })
    }
  }
}, 600_000)
