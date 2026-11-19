// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE DOES NOT DECIDE WHERE A COMMENT GOES. THE THING YOU POINTED AT DOES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 20 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * With a review collecting and the review pane open, a right-click offered `Add to review`. With
 * the same review still collecting and the pane closed, the same right-click on the same heading
 * offered `Send`. The comment joined the review either way, because the server decides membership
 * from where the review collects, when it started and who wrote the comment. Nothing on the server
 * asks whether a pane is open.
 *
 * So a person writing with the pane closed was told their words were not part of the review, and
 * they were. The pane is furniture and it was deciding. This is the whole-product dogfood's worst
 * finding, in design/round-nine/step58-whole-product-dogfood.md section 3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE NOW
 * ---------------------------------------------------------------------------------------
 *
 * Criterion W4 took the pane out of that decision for good. The right-click panel is one dialog, one
 * contact chooser and three presses — send, Start review (which shape B put in place of save
 * without sending) and More — and it says the same thing whether the pane is open, shut, or unknown
 * to this browser, because it no longer reads the pane at all. Membership is still the server's,
 * derived from the thing the comment is about.
 *
 * The same right-click on the same heading, in three states of the pane, is read back off the
 * screen and the three strings are compared:
 *
 *   1. the pane open,
 *   2. the pane closed by pressing the control,
 *   3. the pane closed and this browser holding nothing about the review, which is what the
 *      contract calls the reload case and what a second window of Mole Office looks like.
 *
 * And then the outcome: a comment written in state 3 joins the review already collecting, starts no
 * second one, and is in that review after `Finish collecting`. That last one is what makes the answer
 * a fact rather than a word.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH PRESSES, SINCE WAVE 13X ROUND 22
 * ---------------------------------------------------------------------------------------
 *
 * Until round 22 the three strings each held Start review, because the box asked nothing about any
 * review. The owner then pressed Start review on a flow page, wrote a second comment, pressed the
 * box's first press, Send, and it reached the secretary at once (problem 6yMD5gal_oXz), with the words in a
 * message.
 * The answer y_Vqv-Kab1Ga: while a review collects, the box's first press is Add to review, and
 * Send stays as a second press whose words say it sends now, outside the review. So the box asks Mole
 * Office again, and the three strings each hold Add to review and Send now. The pane still decides
 * nothing: the question is put to the server, the same in all three states.
 *
 * Item 72 of wave 13y round 134 put Send back as the first press, saying "Send", and Add to review
 * second while a review collects. So the three strings each hold Send, then Add to review, then More.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { createI18n } from '../src/shared/i18n.ts'

/** The three presses as the box's words, read by their keys, in the order the box draws them while a review collects. */
const { t } = createI18n('en')
const THE_THREE_PRESSES = [t('talk.send'), t('talk.addToReview'), t('talk.more')].join(' ')

const MODULE_TITLE = 'Wrist camera mount'
const WRITTEN_WITH_THE_PANE_SHUT = 'The mount rattles at the third joint.'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let moduleId: string

interface ReviewRow {
  id: string
  state: string
}

interface MemberRow {
  id: string
  body: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`)
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as T
}

/** The same headers this app's own browser sends, so the server sees one person throughout. */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as T
}

/** What the composer itself says, whitespace collapsed. Not the pane and not the rest of the page. */
async function whatTheBoxSays(): Promise<string> {
  const box = page.getByRole('dialog', { name: 'Talk about this' })
  await box.waitFor({ timeout: 30_000 })
  return (await box.innerText()).replace(/\s+/g, ' ')
}

/** Right-click the module's own heading and wait for the composer. The ordinary gesture. */
async function rightClickTheHeading(): Promise<void> {
  await page.getByRole('heading', { name: MODULE_TITLE }).first().click({ button: 'right' })
  await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
  // The composer asks Mole Office two questions when it opens, and the presses say when they have
  // answered (`aria-busy` is gone).
  await page.waitForSelector('.px-talk .px-talk-do:not([aria-busy="true"])', { timeout: 15_000 })
}

async function closeTheBox(): Promise<void> {
  await page.keyboard.press('Escape')
}

/**
 * The Reviews control in the sidebar, which is the only control that opens and closes the column.
 *
 * IT USED TO BE THE BAND ABOVE EVERY PAGE, whose button said Open or Close. The band was to go: the
 * review band at the very top is removed, and the Reviews press in the sidebar opens the right-hand
 * column instead (problem `Wa-23qH_zbPx`), and the sidebar control is what is left. It always says
 * the same word, so whether the column is open is read from `aria-pressed` rather than from its
 * text, which is where a control that toggles should carry that anyway.
 */
async function pressReviews(): Promise<void> {
  const control = page.locator('.px-review-switch')
  const was = (await control.getAttribute('aria-pressed')) === 'true'
  await control.click()
  await page.waitForFunction(
    (want) => document.querySelector('.px-review-switch')?.getAttribute('aria-pressed') === want,
    String(!was),
    { timeout: 15_000 },
  )
}

async function theColumnIsOpen(): Promise<boolean> {
  return (await page.locator('.px-review-switch').getAttribute('aria-pressed')) === 'true'
}

/**
 * START A REVIEW THE WAY A PERSON DOES, which is the pane's own press since criterion W4 took the
 * review entry out of the right-click panel. The pane opens first, then `Start a review here` writes
 * the review, and collecting has started when the press that ends it is on screen.
 */
async function startACollectingReview(): Promise<string> {
  if (!(await theColumnIsOpen())) await pressReviews()
  const start = page.getByRole('button', { name: 'Start a review here', exact: true })
  if ((await start.count()) > 0) await start.click()
  // IN THE TRAY, FINISH COLLECTING IS BEHIND "More about this review", which is opened first, inside the list
  // Show comments opens.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 15_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.getByRole('button', { name: 'Finish collecting', exact: true }).waitFor({ timeout: 15_000 })
  const listed = await get<{ reviews: ReviewRow[] }>('/api/reviews?state=collecting')
  return (listed.reviews[0] as ReviewRow).id
}

beforeAll(async () => {
  app = await liveApp({ name: 'pane-decides', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = await post<{ record: { id: string } }>('/api/records', {
    kind: 'module',
    title: MODULE_TITLE,
    summary: 'What the camera is bolted to.',
    data: { state: 'active', context: 'Holds the camera above the gripper.' },
  })
  moduleId = made.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ================================================== the same right-click, three states of the pane

describe('the same right-click while one review collects', () => {
  let paneOpen: string
  let paneShut: string
  let browserHoldingNothing: string
  let reviewId: string

  beforeAll(async () => {
    await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${moduleId}`, {
      timeout: 60_000,
    })
    await waitForThePage(page, 60_000)
    await page.locator('.px-review-switch').waitFor({ timeout: 30_000 })
    await page.evaluate(() => {
      window.localStorage.removeItem('mole-office.review')
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-review-switch').waitFor({ timeout: 30_000 })

    // START IT THE ORDINARY WAY: the pane's own press.
    reviewId = await startACollectingReview()

    // READ THE PAGE AGAIN, so every part of it has asked the server since the review started.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.getByRole('heading', { name: MODULE_TITLE }).first().waitFor({ timeout: 30_000 })

    // 1. WITH THE PANE OPEN. The Reviews control reads as pressed when the column is open.
    if (!(await theColumnIsOpen())) await pressReviews()
    expect(await theColumnIsOpen()).toBe(true)
    await rightClickTheHeading()
    paneOpen = await whatTheBoxSays()
    await closeTheBox()

    // 2. CLOSE THE PANE. Nothing is finished and nothing is sent.
    await pressReviews()
    expect(await theColumnIsOpen()).toBe(false)
    await rightClickTheHeading()
    paneShut = await whatTheBoxSays()
    await closeTheBox()

    // 3. AND WITH THIS BROWSER HOLDING NOTHING ABOUT IT. The review is still collecting on the
    // server. This is a reload after the store was cleared, and it is also what the second window
    // of Mole Office looks like on the same machine.
    await page.evaluate(() => {
      window.localStorage.removeItem('mole-office.review')
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForFunction(
      () => document.querySelector('.px-review-switch')?.getAttribute('aria-pressed') === 'false',
      undefined,
      { timeout: 30_000 },
    )
    expect(await theColumnIsOpen()).toBe(false)
    await rightClickTheHeading()
    browserHoldingNothing = await whatTheBoxSays()
    await closeTheBox()
  }, 180_000)

  it('offers Add to review with the pane open — the control for the two below', () => {
    expect(paneOpen).toContain('Add to review')
    expect(paneOpen).not.toContain('Start review')
  })

  it('offers the same Add to review with the pane closed', () => {
    expect(paneShut).toContain('Add to review')
    expect(paneShut).not.toContain('Start review')
  })

  it('offers the same Add to review when this browser holds nothing about the review', () => {
    expect(browserHoldingNothing).toContain('Add to review')
    expect(browserHoldingNothing).not.toContain('Start review')
  })

  it('offers the same contact chooser and the same presses in all three states', () => {
    // CRITERION W4. The panel is a dialog, a contact chooser and
    // three presses, and it no longer reads this browser's pane store at all — so the three strings
    // are the same string. That is the repair stated as a gesture rather than as a rule. Since round
    // 134 of wave 13y the presses are Send, then Add to review, because a review collects here.
    for (const said of [paneOpen, paneShut, browserHoldingNothing]) {
      expect(said, 'the box does not offer the contact chooser').toContain('Choose a contact')
      expect(said, 'the box does not offer the three presses').toContain(THE_THREE_PRESSES)
      // ORGANISE IS BEHIND MORE since a decision changed a criterion on 27 September 2026.
      expect(said).toContain('More')
    }
    // AND THE THREE SAY THE SAME THING, which is this file's whole subject.
    expect(paneShut, 'the box says something different with the pane shut').toBe(paneOpen)
    expect(browserHoldingNothing, 'the box says something different after a reload').toBe(paneOpen)
  })

  it('says the review is still collecting, so the pane changed no review', async () => {
    const still = await get<{ reviews: ReviewRow[] }>('/api/reviews?state=collecting')
    expect(still.reviews.map((one) => one.id)).toEqual([reviewId])
  })
})

// ============================== a comment written with the pane closed is in the finished review

describe('writing a comment with the pane closed and then finishing collecting', () => {
  let afterThePress: string
  let collectingAfterThePress: string[]
  let members: MemberRow[]
  let reviewId: string

  beforeAll(async () => {
    const listed = await get<{ reviews: ReviewRow[] }>('/api/reviews?state=collecting')
    reviewId = (listed.reviews[0] as ReviewRow).id

    // The pane is shut and this browser was made to hold nothing about the review by the block
    // above. Write the comment from there, which is the situation the dogfood measured.
    expect(await theColumnIsOpen()).toBe(false)
    await rightClickTheHeading()
    await page.getByRole('textbox', { name: 'What you want to say' }).fill(WRITTEN_WITH_THE_PANE_SHUT)
    await page.getByRole('button', { name: 'Add to review', exact: true }).click()
    await page.getByRole('button', { name: 'Back to reading' }).waitFor({ timeout: 30_000 })
    // THE FRAME SAYS WHAT BECAME OF THE REVIEW once the review has answered, so that is waited for.
    await page
      .locator('.px-talk :is(.px-talk-said [data-part="in-the-review"], .px-talk-note, [role="alert"])')
      .first()
      .waitFor({ timeout: 30_000 })
    afterThePress = await page.getByRole('dialog', { name: 'Written down' }).innerText()
    afterThePress = afterThePress.replace(/\s+/g, ' ')
    await closeTheBox()
    collectingAfterThePress = (await get<{ reviews: ReviewRow[] }>('/api/reviews?state=collecting')).reviews.map((one) => one.id)

    await post(`/api/reviews/${reviewId}/finish-collecting`, undefined)
    const detail = await get<{ members: MemberRow[] }>(`/api/reviews/${reviewId}`)
    members = detail.members
  }, 180_000)

  it('says the words are written down, in the review already collecting, and sent to nobody', () => {
    // THE STATE, NOT A PROMISE. The dialog is titled `Written down`. Add to review reads back which
    // review holds the comment after the write, so the sentence below is a reading and not a guess.
    // The membership read further down is what says it stayed there.
    expect(afterThePress).toContain('Written down')
    expect(afterThePress).toContain('This comment is in your review. Nothing has been sent.')
  })

  it('starts no second review, because the pane being shut did not hide the one collecting', () => {
    expect(collectingAfterThePress).toEqual([reviewId])
  })

  it('holds that comment in the review after collecting finished', () => {
    expect(members.map((one) => one.body)).toContain(WRITTEN_WITH_THE_PANE_SHUT)
  })
})
