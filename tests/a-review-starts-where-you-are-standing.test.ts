// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW IS STARTED FROM THE THING UNDER THE POINTER, AND IT COLLECTS THAT THING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED 18 AND 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Phase 4's central claim is that what a review collects is DERIVED from where the person was
 * standing when they started it: from a module, the module's context; from the project rail, a wider
 * one. The server does that work carefully — a total map over the thirteen kinds of thing that can
 * be pointed at, containment as the only relationship that counts.
 *
 * Nothing a person could do reached any of it. The only control that started a review passed the
 * PAGE, and a page derives the widest scope there is, so every review anybody could start covered
 * the whole project. Reading a report, the fold saying what the review collected read: *"Everything
 * in this project. This review was started from a page, where nothing more precise was under the
 * pointer…"* — measured on a record page, which is as precise a place as this product has.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE PRESS LIVES NOW
 * ---------------------------------------------------------------------------------------
 *
 * Criterion W4 left the right-click panel a dialog, a contact chooser and three presses — send, save
 * without sending, organise — and took out the second panel that started a review. The review is
 * still startable, from the review column's own `Start a review here`, and that press reads the page
 * the ordinary way: the one addressable element inside `#main` that contains every other. On a
 * record page that element is the record, so a review started there is the record's.
 *
 * WHAT IS PROVED HERE, AND WHY IN A REAL BROWSER. The capability was hidden once, and a test that
 * called the library with a record entry would have passed on the day the owner could not start a
 * module review at all — the failure design/UX-CONTRACT.md names by hand: *a test proves storage
 * semantics while the owner still cannot perform the action naturally*. So this opens the column,
 * presses what a person presses, and then reads what Mole Office stored.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keepTheCommentInAReview, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MODULE_TITLE = 'Tray clamp controller'
const PART_TITLE = 'Calibrate the gripper before the handover'
const ELSEWHERE_TITLE = 'Supplier lead times'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let moduleId: string
let elsewhereId: string

/** What a review row says about itself, straight from the product's own route. */
interface ReviewRow {
  id: string
  entry: { target: { kind: string; recordId?: string; route?: string } }
  /** How wide it is. A project-wide review is asked for; nothing derives one from where you stood. */
  reach: string
}

async function reviewsNow(): Promise<ReviewRow[]> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/reviews`)
  if (!res.ok) throw new Error(`GET /api/reviews answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { reviews: ReviewRow[] }).reviews
}

/** Nothing is collecting in this browser. This file starts its own review from its own place. */
async function forgetTheReview(): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem('mole-office.review')
  })
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return res.json()
}

/**
 * START A REVIEW THE WAY A PERSON DOES. The Reviews control opens the column; `Start a review here`
 * writes the review; collecting has started when the press that ends it is on screen. Since wave 13r
 * round 15 that press is behind "More about this review", so More is opened first.
 */
async function startACollectingReview(): Promise<string> {
  const open = await page.locator('.px-review-switch[aria-pressed="true"]').count()
  if (open === 0) await page.locator('.px-review-switch').click()
  await page.waitForSelector('.px-review-switch[aria-pressed="true"]', { timeout: 10_000 })
  const start = page.getByRole('button', { name: 'Start a review here', exact: true })
  if ((await start.count()) > 0) await start.click()
  // THE TRAY'S LIST IS SHUT AT FIRST, so Show comments opens it before the pane's own rows are read.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 15_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.getByRole('button', { name: 'Finish collecting', exact: true }).waitFor({ timeout: 15_000 })
  const listed = await reviewsNow()
  const collecting = listed.find((row) => row.reach !== undefined)
  if (collecting === undefined) throw new Error('the press left no review collecting')
  return collecting.id
}

/** The server's own sentence about what this review collects, read off the pane it is drawn in. */
async function theScopeThePaneNames(): Promise<string> {
  const details = page.locator('.px-pane-scope')
  await details.waitFor({ timeout: 15_000 })
  const open = await details.evaluate((el) => (el as HTMLDetailsElement).open)
  if (!open) await details.locator('summary').click()
  await sleep(200)
  return (await details.innerText()).replace(/\s+/g, ' ')
}

/**
 * Write one comment through the panel's keep press, on whatever the box is open on. Since wave 13r round 15 that
 * press is Start review, which keeps the comment and puts it in the review of the page it is on. Since wave 13x round
 * 22, where a review already collects, it is Add to review, which keeps the comment in that review.
 */
async function saveAComment(words: string): Promise<void> {
  await page.locator('.px-talk textarea').first().fill(words)
  await sleep(200)
  await keepTheCommentInAReview(page)
  await page.getByRole('button', { name: 'Back to reading', exact: true }).waitFor({ timeout: 15_000 })
  await page.keyboard.press('Escape')
  await sleep(300)
}

beforeAll(async () => {
  app = await liveApp({ name: 'entry', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = (await post('/api/records', {
    kind: 'module',
    title: MODULE_TITLE,
    summary: 'The hand, and everything that drives it.',
    data: { state: 'active', context: 'What holds and releases the part.' },
  })) as { record: { id: string } }
  moduleId = made.record.id

  // SOMETHING INSIDE IT, so a record scope has more than one record in it and its sentence says so.
  const inside = (await post('/api/records', {
    kind: 'task',
    title: PART_TITLE,
    data: { state: 'todo' },
  })) as { record: { id: string } }
  await post('/api/links', { fromId: inside.record.id, toId: moduleId, type: 'part_of' })

  // AND SOMETHING THAT IS NOT, so "the whole project" and "this module" are different answers.
  const outside = (await post('/api/records', {
    kind: 'task',
    title: ELSEWHERE_TITLE,
    data: { state: 'todo' },
  })) as { record: { id: string } }
  elsewhereId = outside.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================================ the module's own review

describe('opening the review column on a module and starting a review there', () => {
  let scope = ''
  let stored: ReviewRow[] = []
  let reviewId = ''
  const ON_THE_MODULE = 'The mount is bolted to the wrong face.'
  const OUTSIDE = 'The supplier quoted six weeks from the order.'

  beforeAll(async () => {
    await page.goto(`http://127.0.0.1:${webPort}/#/r/${moduleId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(900)
    await forgetTheReview()
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(900)

    // THE ORDINARY GESTURE: open the column and press its own start control on the module's page.
    reviewId = await startACollectingReview()
    scope = await theScopeThePaneNames()
    stored = await reviewsNow()

    // A comment left on the module joins the module's review.
    await page.getByRole('heading', { name: MODULE_TITLE }).first().click({ button: 'right' })
    await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
    await sleep(1_200)
    await saveAComment(ON_THE_MODULE)

    // AND ONE LEFT OUTSIDE IT DOES NOT. The scope is the server's answer, not the page's.
    // LEAVING THE MODULE'S PAGE WITH A COMMENT NOT SENT ASKS WHAT TO DO (wave 13r round 15), and Keep is the answer
    // that leaves the review as it is.
    await page.goto(`http://127.0.0.1:${webPort}/#/r/${elsewhereId}`, { timeout: 60_000 })
    const question = page.locator('[data-part="leave-question"]')
    await question.waitFor({ timeout: 15_000 })
    await question.getByRole('button', { name: 'Keep', exact: true }).click()
    await waitForThePage(page, 60_000)
    await sleep(1_000)
    await page.getByRole('heading', { name: ELSEWHERE_TITLE }).first().click({ button: 'right' })
    await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
    await sleep(1_200)
    await saveAComment(OUTSIDE)
  }, 180_000)

  it('stores the module as where the review was started from, not the page', () => {
    expect(stored).toHaveLength(1)
    const entry = (stored[0] as ReviewRow).entry.target
    expect(entry.kind).toBe('record')
    expect(entry.recordId).toBe(moduleId)
    expect((stored[0] as ReviewRow).reach, 'a record review is not a project-wide one').not.toBe('global')
  })

  it('says what it collects, and what it collects is that module', () => {
    expect(scope).toContain(MODULE_TITLE)
    expect(scope).toContain('everything inside it')
    expect(scope).toContain('1 record is stored as being part of it')
  })

  it('does not claim the whole project', () => {
    // The exact sentence every review used to answer with, however precise the thing being read.
    expect(scope).not.toContain('Everything in this project.')
  })

  it('takes the comment written inside it and leaves the one written outside it', async () => {
    await post(`/api/reviews/${reviewId}/finish-collecting`, undefined)
    const got = await fetch(`http://127.0.0.1:${apiPort}/api/reviews/${reviewId}`)
    if (!got.ok) throw new Error(`GET the review answered ${String(got.status)}`)
    const detail = (await got.json()) as { members: { body: string }[] }
    const bodies = detail.members.map((one) => one.body)
    expect(bodies, 'the comment on the module did not join its review').toContain(ON_THE_MODULE)
    expect(bodies, 'a comment from outside the module joined it').not.toContain(OUTSIDE)
  })
})
