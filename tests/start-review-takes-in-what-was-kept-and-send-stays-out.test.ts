// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START REVIEW KEEPS THE COMMENT IN THIS PAGE'S REVIEW, WITH THE COMMENTS KEPT BEFORE IT, GOING TO THE PAGE'S WRITER.
 * SEND GOES AT ONCE AND ENTERS NO REVIEW.
 *
 * The owner's first and second details for wave 13r round 15 (record 9BZZVKQxWV9Z), pressed in the browser:
 *  - The right-click panel offers Start review where it offered Save without sending. Pressing it starts this page's
 *    review, which takes in the comment kept on the page earlier, and sends nothing.
 *  - The review goes, by default, to the agent that wrote the page, and the column's chip says so. Since wave 13n round
 *    54 (problem ZuhGWivnX7ug) the panel shows that agent under To before the press, so the review stores it as chosen
 *    and the chip says the plain "going to"; the case waits for the panel's default before it presses.
 *  - Send in the same panel goes to the chosen contact at once, and the message is in no review. Since wave 13x round
 *    22 (problem 6yMD5gal_oXz; y_Vqv-Kab1Ga), while a review collects the page, that press is the second one and
 *    says so: "Send now, outside the review". The first press is "Add to review", which sends nothing. Since wave 13y
 *    round 134 (item 72), Send is the first press again and says "Send", Add to review is the second, and Send says on
 *    hover that it sends now, outside the review.
 * Each is read back from the server: GET /api/reviews/:id for what the review holds and who it goes to.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let page: Page
let reportId = ''
let keptEarlier = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function write(headers: Record<string, string>, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`${app.api}${path}`, { headers: AS_THE_PERSON })
  const text = await res.text()
  expect(res.status, text).toBe(200)
  return JSON.parse(text) as T
}

interface Detail {
  review: { id: string; state: string }
  members: { id: string; found: boolean }[]
  saved: { id: string }[]
  goesTo: { ground: string; name: string | null }
}

/** The collecting review on the report, or null. */
async function theReview(): Promise<Detail | null> {
  const list = await read<{ reviews: { id: string; entry: { target: { recordId?: string } } }[] }>('/api/reviews?state=collecting')
  const one = list.reviews.find((each) => each.entry.target.recordId === reportId)
  return one === undefined ? null : read<Detail>(`/api/reviews/${one.id}`)
}

/** Open the report fresh, select words of its second paragraph, right-click them and write a comment. */
async function writeOnTheReport(words: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await page.locator(run).waitFor({ timeout: 30_000 })
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 20)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk textarea').waitFor({ timeout: 20_000 })
  await page.locator('.px-talk textarea').fill(words)
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'start-review', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await write(AS_THE_PERSON, { kind: 'agent', title: 'Calibration agent', data: { handle: 'calib-agent', runtime: 'claude-code', state: 'active' } })
  reportId = await write(AS('calib-agent'), {
    kind: 'report',
    title: 'What the second calibration run showed',
    data: {
      for: 'Robin Vale',
      date: '2026-09-27',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration through a full handover.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The mast is the part that moved. Nothing was re-machined between the two runs.' },
      ],
    },
  })
  // A COMMENT KEPT ON THE PAGE BEFORE ANY REVIEW, addressed to nobody.
  keptEarlier = await write(AS_THE_PERSON, {
    kind: 'message',
    title: 'Kept earlier',
    data: { body: 'Synthetic kept comment: the mast clamp torque is not written down.', target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
  })
  await page.goto(`${app.site}/#/pairing`)
  await waitForThePage(page)
  await page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the right-click panel on a page an agent wrote', () => {
  it('Start review starts the page\'s review with this comment and the one kept earlier, going to the writer, and sends nothing', async () => {
    expect(await theReview(), 'no review before the press').toBeNull()
    await writeOnTheReport('Synthetic comment: say which bolt moved.')
    // THE PANEL'S DEFAULT IS WAITED FOR BY THE NAME UNDER TO. Since wave 13y round 169 (point RC-3 of the right-click
    // box) no words stand beside it to say why it was chosen.
    await page.locator('.px-talk .px-talk-to-btn', { hasText: 'Calibration agent' }).waitFor({ timeout: 30_000 })
    await page.locator('.px-talk').getByRole('button', { name: en['talk.startReview'], exact: true }).click()
    await page.getByText(en['talk.state.reviewStarted'], { exact: true }).waitFor({ timeout: 30_000 })
    // THE TRAY'S LIST IS SHUT AT FIRST (wave 13y round 146, item 73a), and the recipient line is in it.
    await setTheReviewTraysList(page, 'open')
    await page.locator('[data-part="goes-to"]').getByText(en['review.b.goingTo'].replace('{name}', 'Calibration agent'), { exact: true }).waitFor({ timeout: 30_000 })
    const detail = await theReview()
    if (detail === null) throw new Error('Start review left no review collecting on the page')
    const held = [...detail.members.filter((one) => one.found), ...detail.saved].map((one) => one.id)
    expect(held, 'the comment kept earlier is in the review').toContain(keptEarlier)
    expect(held, 'with the one just written').toHaveLength(2)
    expect(detail.goesTo).toMatchObject({ ground: 'chosen', name: 'Calibration agent' })
    const messages = await read<{ messages: { body: string; notSentYet?: boolean }[] }>('/api/messages?full=1')
    const written = messages.messages.find((one) => one.body === 'Synthetic comment: say which bolt moved.')
    expect(written?.notSentYet, 'nothing was sent').not.toBe(false)
  }, 180_000)

  it('Send, while a review collects, goes to the chosen contact at once and enters the collecting review not at all', async () => {
    await writeOnTheReport('Synthetic message: is the second arm labelled?')
    await page.locator('.px-talk-to-btn').click()
    await page.locator('.px-talk-contact', { hasText: 'Calibration agent' }).first().click()
    // The review the first case started collects this page. Send is the first press all the same, and says "Send";
    // tests/the-right-click-panel-draws-its-presses-once.test.ts holds what it says on hover.
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx),
    // so the box does not say Sent; the letter is in the pool all the same.
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/records' && r.request().method() === 'POST')
    await page.locator('.px-talk').getByRole('button', { name: en['talk.send'], exact: true }).click()
    const reply = await answered
    expect(reply.status()).toBe(409)
    // THE BOX SAYS WHERE THE LETTER WENT, AND NEVER THAT NOTHING WAS WRITTEN. The 409 stored the letter and routed it, and
    // its `error` is the routed line, which names who was given it; the box's heading is that line.
    const said = (await reply.json()) as { error: string; record?: { id?: string } }
    expect(said.record?.id, 'the 409 still carries the stored letter').toBeTruthy()
    const heading = page.locator('.px-talk .px-error-mark strong')
    await heading.waitFor()
    expect(await heading.textContent()).toBe(said.error)
    const messages = await read<{ messages: { id: string; body: string }[] }>('/api/messages?full=1')
    const sent = messages.messages.find((one) => one.body === 'Synthetic message: is the second arm labelled?')
    if (sent === undefined) throw new Error('the message was not written')
    const detail = await theReview()
    if (detail === null) throw new Error('the review started by the first case is gone')
    const held = [...detail.members.filter((one) => one.found), ...detail.saved].map((one) => one.id)
    expect(held, 'a message sent with Send is in no review').not.toContain(sent.id)
    expect(held).toHaveLength(2)
  }, 180_000)
})
