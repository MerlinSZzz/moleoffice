// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW GOES TO THE RECIPIENT THE PANEL SHOWED. Problem ZuhGWivnX7ug, wave 13n round 54.
 *
 * The owner right-clicked wave 13p's report, chose the secretary under "To" in the comment box, pressed Start review and then
 * Send in the review column. The review went to the report's writer. The box stored nobody: Start review wrote the
 * comment and started the review, the review's recipient stayed empty, and the send fell back to the page's writer.
 *
 * In a real browser against a Mole Office of its own, with nothing written through the API on the person's behalf
 * after the setup:
 *  1. An agent chosen under "To" in the comment box, then Start review and Send: the review goes to that agent, and the
 *     column named it before Send.
 *  2. The agent the box chose by itself, left as it was, then Start review and Send: the review goes to that agent.
 *  3. A review started from the column, so no box showed anybody: before Send the column says the review goes to the
 *     page's writer because nobody chose, and Send sends it there.
 *
 * Three-run proofs (control, mutation, restore) are in round 54's report. The first mutation: Start review stores no
 * recipient (`carryTheShownRecipient` in TalkBox.tsx answers null at once), which is the owner's symptom, and cases 1
 * and 2 fail. The second: the column's line for a writer nobody chose is the plain "going to {name}" again
 * (`goesToWords` in ReviewBar.tsx), and case 3 fails.
 *
 * With TEST_SHOTS set, the last case photographs the column's recipient line for case 1 and case 3 at 1440, 990, 660
 * and 390, light and dark, into the folder `r54-recipient` under it.
 *
 * Everything here is made up.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { testShots } from './where-shots-go.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const OTHER = { name: 'Glaze Reader', handle: 'glaze-reader' }
const RUN = '[data-text-field="data.blocks[#b-2].text"]'
const SHOTS = testShots('r54-recipient')
const t = createI18n('en').t

let app: LiveApp

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up report, filed by `by`. */
async function aReport(title: string, by: Record<string, string>): Promise<string> {
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title,
    data: {
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings, and the right one held.' },
      ],
    },
  }, by)
  return report.record.id
}

/** Who the office says a review goes to, and its state. */
async function stored(reviewId: string): Promise<{ state: string; ground: string; to: string | null }> {
  const reply = (await (await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON })).json()) as {
    review: { state: string }
    goesTo: { ground: string; name: string | null }
  }
  return { state: reply.review.state, ground: reply.goesTo.ground, to: reply.goesTo.name }
}

/** Open a report in a look, at 1440. */
async function openTheReport(reportId: string, look: 'light' | 'dark' = 'light'): Promise<void> {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${app.site}/#/`)
  await waitForThePage(page, 60_000)
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto('about:blank')
  await page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(page, 60_000)
  await page.locator(RUN).waitFor({ timeout: 30_000 })
}

/** Select words of the second paragraph, right-click them and write a comment. */
async function writeAComment(words: string): Promise<void> {
  const page = app.page
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, RUN)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk textarea').fill(words)
}

/** Start review in the box, back to reading, and answer the review's id from the column's own read. */
async function startReviewInTheBox(): Promise<string> {
  const page = app.page
  const talk = page.locator('.px-talk')
  const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/reviews' && r.request().method() === 'POST')
  await talk.getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  const reviewId = ((await (await started).json()) as { review: { id: string } }).review.id
  await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
  await talk.waitFor({ state: 'detached', timeout: 30_000 })
  return reviewId
}

/** The column's recipient line says `words`, and nothing else. It is in the tray's list. */
async function theLineSays(words: string): Promise<void> {
  await setTheReviewTraysList(app.page, 'open')
  await app.page.locator('[data-part="your-review"] [data-part="goes-to"] .px-b-chip-words').getByText(words, { exact: true }).waitFor({ timeout: 30_000 })
}

/**
 * Press the tray's Send review, once its row says the review holds its one comment, and wait for the office's answer.
 * Send N at the foot of the list is not drawn in the tray at the window's foot (wave 13y round 146, item 73a).
 */
async function send(reviewId: string): Promise<void> {
  const page = app.page
  const sent = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/reviews/${reviewId}/send` && r.request().method() === 'POST')
  const row = page.locator('[data-part="your-review"] [data-part="your-review-bar"]')
  expect(await row.locator('.px-b-bar-says').textContent()).toContain(t('review.b.comments', { n: 1 }))
  await row.getByRole('button', { name: t('review.tray.send'), exact: true }).click()
  const answered = await sent
  expect(answered.status(), await answered.text()).toBe(200)
}

/** Case 1 up to Send: a report by the writer, the other agent chosen under To, Start review. */
async function chooseTheOtherAndStart(look: 'light' | 'dark'): Promise<string> {
  await openTheReport(await aReport(`Made-up kiln report, chosen, ${look}`, AS(WRITER.handle)), look)
  await writeAComment('A made-up comment: which shelf sagged?')
  const talk = app.page.locator('.px-talk')
  await talk.locator('.px-talk-to-btn').click()
  await talk.locator('.px-talk-contact', { hasText: OTHER.name }).first().click()
  await talk.locator('.px-talk-to-btn').getByText(OTHER.name).waitFor({ timeout: 30_000 })
  return startReviewInTheBox()
}

/** Case 3 up to Send: a comment kept on a report by the writer, and the review started from the column. */
async function startFromTheColumn(look: 'light' | 'dark'): Promise<string> {
  const reportId = await aReport(`Made-up kiln report, nobody chose, ${look}`, AS(WRITER.handle))
  await post('/api/records', {
    kind: 'message',
    title: 'A kept comment',
    data: { body: 'A made-up kept comment: the shelf was not measured.', target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
  })
  await openTheReport(reportId, look)
  const page = app.page
  // THE LIST OF REVIEWS, where the column's own start press is. A column this browser left open on a review is closed
  // first, so the switch opens the list rather than closing the column.
  if ((await page.$('.px-pane')) !== null) {
    await page.click('.px-review-switch')
    await page.locator('.px-pane').waitFor({ state: 'detached', timeout: 30_000 })
  }
  await page.click('.px-review-switch')
  const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/reviews' && r.request().method() === 'POST')
  await page.locator('.px-pane').getByRole('button', { name: t('review.pane.start'), exact: true }).click()
  const answer = (await (await started).json()) as { review: { id: string } }
  return answer.review.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-review-goes-to-the-recipient-shown', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const agent of [WRITER, OTHER]) {
    await post('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${agent.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(agent.handle))
  }
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the review goes to the recipient the panel showed', () => {
  it('1. an agent chosen under To in the comment box: the column names it, and Send sends the review to it', async () => {
    const reviewId = await chooseTheOtherAndStart('light')
    await theLineSays(t('review.b.goingTo', { name: OTHER.name }))
    expect(await stored(reviewId)).toEqual({ state: 'collecting', ground: 'chosen', to: OTHER.name })
    await send(reviewId)
    expect(await stored(reviewId)).toEqual({ state: 'sent', ground: 'chosen', to: OTHER.name })
  }, 240_000)

  it('2. the agent the box chose by itself, left as it was: Send sends the review to that agent', async () => {
    // FILED BY THE PERSON AND WRITTEN TO BY THE OTHER AGENT, so the box's own choice is the other agent and the page
    // has no agent writer for the review to fall back on.
    const reportId = await aReport('Made-up kiln report, the box chose', PERSON)
    const reply = await fetch(`${app.api}/api/records/${reportId}`, {
      method: 'PATCH',
      headers: AS(OTHER.handle),
      body: JSON.stringify({
        dataPatch: {
          blocks: [
            { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour, as the other agent read it.' },
            { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings, and the right one held.' },
          ],
        },
      }),
    })
    expect(reply.ok, await reply.text()).toBe(true)
    await openTheReport(reportId)
    await writeAComment('A made-up comment: was the right shelf measured?')
    const talk = app.page.locator('.px-talk')
    // THE NAME UNDER TO IS THE BOX'S DEFAULT. Since wave 13y round 169 (point RC-3 of the right-click box) no words
    // stand beside it to say why it was chosen, so the name is what is waited for.
    await talk.locator('.px-talk-to-btn').getByText(OTHER.name).waitFor({ timeout: 30_000 })
    const reviewId = await startReviewInTheBox()
    await theLineSays(t('review.b.goingTo', { name: OTHER.name }))
    await send(reviewId)
    expect(await stored(reviewId)).toEqual({ state: 'sent', ground: 'chosen', to: OTHER.name })
  }, 240_000)

  it('3. a review nobody chose a recipient for: before Send the column says it goes to the writer, and Send sends it there', async () => {
    const reviewId = await startFromTheColumn('light')
    await theLineSays(t('review.b.goingToTheWriter', { name: WRITER.name }))
    expect(await stored(reviewId)).toEqual({ state: 'collecting', ground: 'wrote-the-page', to: WRITER.name })
    await send(reviewId)
    expect(await stored(reviewId)).toEqual({ state: 'sent', ground: 'wrote-the-page', to: WRITER.name })
  }, 240_000)
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs the recipient line at four widths, in both looks', async () => {
  const page = app.page
  for (const look of ['light', 'dark'] as const) {
    for (const [name, upToSend] of [['chosen', chooseTheOtherAndStart], ['nobody-chose', startFromTheColumn]] as const) {
      await upToSend(look)
      // THE RECIPIENT LINE IS IN THE TRAY'S LIST, WHICH IS SHUT AT FIRST.
      await setTheReviewTraysList(page, 'open')
      await page.locator('[data-part="your-review"] [data-part="goes-to"]').waitFor({ timeout: 30_000 })
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 })
        await page.waitForTimeout(600)
        await page.screenshot({ path: join(SHOTS, `${name}-${String(width)}-${look}.png`) })
      }
    }
  }
}, 600_000)
