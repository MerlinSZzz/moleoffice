// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW THAT HAS BEEN FINISHED CAN BE FOUND AGAIN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Pressing "Put this away" on a finished review ended it. Nothing in the browser ever called
 * `GET /api/reviews` — the client function existed and no screen used it — no route in the app drew
 * a review, and the only handle on one was an id in this browser's own storage, which that press
 * dropped. Thirteen pages were searched for a finished review's id and for the words *Collecting
 * finished*: none showed either. Pressing the rail control again made a NEW review, because
 * `startReview` on the server only ever resumes a collecting one.
 *
 * So the collection Phase 4 exists to build was on the server and on no screen, for good. That is
 * design/UX-CONTRACT.md's *the value works in one view and disappears from the other*, on the value
 * this phase is about.
 *
 * The same press also CREATED a review every time the column was opened, and there is no route that
 * deletes one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   1. Opening the column writes nothing. It shows the reviews there are.
 *   2. A review started from the column is about the thing the page is about, not the project.
 *   3. Collecting finishes, the column keeps showing that review, and no press offered on it can
 *      fail by design — "Send review" is not there, because nothing sends a review.
 *   4. Closing the column and opening it again finds the finished review, with its comment in it.
 *
 * A BROWSER, BECAUSE THE DEFECT WAS THAT NO SCREEN DREW THE THING. A library test that read the
 * review back would have passed on the day the owner could not reach the owner’s own review at all — the
 * failure design/UX-CONTRACT.md names by hand: *a test proves storage semantics while the owner
 * still cannot perform the action naturally*.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const REPORT_TITLE = 'What the gripper did on Tuesday'
const COMMENT = 'These two numbers disagree and the paragraph does not say which is right.'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

interface ReviewRow {
  id: string
  state: string
  entry: { target: { kind: string; recordId?: string; route?: string } }
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function reviewsNow(): Promise<ReviewRow[]> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/reviews`)
  if (!res.ok) throw new Error(`GET /api/reviews answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { reviews: ReviewRow[] }).reviews
}

/** What the review column says, whitespace collapsed, or nothing while it is not drawn. */
async function column(): Promise<string> {
  const pane = page.getByRole('complementary', { name: 'Your reviews' })
  if ((await pane.count()) === 0) return ''
  const said = await pane.innerText()
  return said.replace(/\s+/g, ' ')
}

const railControl = () => page.locator('.px-review-switch')

/**
 * OPENS "MORE ABOUT THIS REVIEW" IF IT IS SHUT. Since wave 13r round 15 a collecting review is drawn in shape B: your
 * review, who it goes to and Send, with the whole pane, Finish collecting among it, behind More.
 */
async function openMore(): Promise<void> {
  // THE TRAY'S LIST OPENS FIRST, which is where More about this review lives. The review may still be being read,
  // so the row or the More itself is waited for rather than counted on the frame after the press.
  await page.waitForFunction(() => {
    const more = document.querySelector('details.px-b-more')
    return document.querySelector('[data-part="your-review-bar"]') !== null || (more !== null && more.checkVisibility())
  }, undefined, { timeout: 30_000 })
  const bar = page.locator('[data-part="your-review-bar"]')
  if ((await bar.count()) > 0) {
    const show = bar.getByRole('button', { name: 'Show comments', exact: true })
    if ((await show.count()) > 0) await show.click()
  }
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
}

beforeAll(async () => {
  app = await liveApp({ name: 'findable', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = (await post('/api/records', {
    kind: 'report',
    title: REPORT_TITLE,
    summary: 'One run in three dropped the part.',
    data: {
      date: '2026-08-18',
      blocks: [{ id: 'b-prose', type: 'text', text: 'The gripper let go of the part on every run.' }],
    },
  })) as { record: { id: string } }
  reportId = made.record.id

  await page.goto(`http://127.0.0.1:${webPort}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await railControl().waitFor({ timeout: 30_000 })
  await page.evaluate(() => {
    window.localStorage.removeItem('mole-office.review')
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await railControl().waitFor({ timeout: 30_000 })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a review, from the column that holds them', () => {
  it('opens the column without creating anything', async () => {
    // THE PRESS USED TO WRITE A REVIEW ROW, and no route deletes one. An accidental press left a
    // review in the corpus for ever.
    await railControl().click()
    await expect.poll(column, { timeout: 15_000 }).toContain('none yet')
    const said = await column()
    expect(said, 'the column did not open on the reviews there are').toContain('Your reviews')
    expect(said).toContain('Start a review here')
    // A PROJECT WITH NO REVIEWS SAYS SO IN TWO WORDS AND A MARK. It was a sentence; the sentence is
    // on the mark's tooltip, and `none yet` is what a reader sees.
    expect(said, 'a project with no reviews did not say so').toContain('none yet')
    expect(await reviewsNow(), 'opening the column created a review').toHaveLength(0)
  })

  it('starts one about the thing the page is about, rather than the whole project', async () => {
    await page.getByRole('button', { name: 'Start a review here', exact: true }).click()
    await openMore()
    await page.getByRole('button', { name: 'Finish collecting', exact: true }).waitFor({ timeout: 30_000 })
    const stored = await reviewsNow()
    expect(stored).toHaveLength(1)
    const entry = (stored[0] as ReviewRow).entry.target
    expect(entry.kind, 'the review was started from the page, so it collects the whole project').toBe('record')
    expect(entry.recordId).toBe(reportId)
  })

  it('holds the comment somebody wrote, and says how many', async () => {
    await post('/api/records', {
      kind: 'annotation',
      title: COMMENT.slice(0, 40),
      data: {
        body: COMMENT,
        context: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
      },
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await expect.poll(
      () => page.getByRole('complementary', { name: 'Your reviews' }).count(),
      { timeout: 20_000 },
    ).toBe(1)
    await openMore()
    await expect.poll(column, { timeout: 20_000 }).toContain('1 comment · none sent')
    await expect.poll(column, { timeout: 20_000 }).toContain('These two numbers disagree')
    const said = await column()
    expect(said).toContain('1 comment · none sent')
    expect(said).toContain('These two numbers disagree')
  })

  it('offers a press that really sends, once collecting has finished, and says where each comment goes', async () => {
    // TWO PRESSES, AND THE SECOND ONE IS NOT WHERE THE FIRST ONE WAS. Step 31 made the one
    // irreversible press in this pane confirm with a row that stays until it is answered. What this
    // test demands is unchanged — after collecting has finished, a press that really sends is
    // offered — and how it gets there is the product's new shape, not a weaker assertion.
    await page.getByRole('button', { name: 'Finish collecting', exact: true }).click()
    const withCount = page.getByRole('button', { name: /^Finish collecting · /, exact: false })
    await withCount.waitFor({ timeout: 30_000 })
    await withCount.click()
    await expect.poll(column, { timeout: 15_000 }).toContain('Collecting finished')
    await expect.poll(column, { timeout: 15_000 }).toContain('No recipient chosen yet')
    const said = await column()
    expect(said).toContain('Collecting finished')
    // THE PRESS THAT COULD ONLY EVER FAIL IS STILL GONE. It sent PATCH {"state":"sent"}, which is
    // refused by name, and it was drawn as the primary thing to do next.
    expect(said, 'the press that could only ever fail is back').not.toContain('Send review<')
    // WHAT IS OFFERED NOW IS AN ACT THAT WORKS, and the line under each comment says where it would
    // go before anybody presses anything.
    expect(said).toContain('Send this review')
    expect(said).toContain('No recipient chosen yet')
  })

  /** THE ONE THIS FILE IS FOR. */
  it('is still there after the column is closed and opened again', async () => {
    await railControl().click()
    await expect.poll(
      () => page.getByRole('complementary', { name: 'Your reviews' }).count(),
      { timeout: 15_000 },
    ).toBe(0)

    await railControl().click()
    await expect.poll(column, { timeout: 15_000 }).toContain('Collecting finished')
    const said = await column()
    expect(said, 'the finished review is not in the list').toContain('Collecting finished')
    expect(said, 'opening the column again started a second review instead').toContain('Start a review here')

    await page.getByText('Collecting finished', { exact: false }).first().click()
    await expect.poll(column, { timeout: 15_000 }).toContain('These two numbers disagree')
    const open = await column()
    expect(open, 'pressing the finished review did not open it').toContain('These two numbers disagree')
    expect(open).toContain('1 comment · none sent')

    // AND NOTHING WAS CREATED BY LOOKING. One review, the one that was started.
    const stored = await reviewsNow()
    expect(stored).toHaveLength(1)
    expect((stored[0] as ReviewRow).state).toBe('collected')
  })
})

/**
 * THE COLUMN'S EDITING AND NARROW-SCREEN PARTS WERE TAKEN OUT WITH ITEM 73a. A collecting review is a tray at the foot
 * of the window now, and the column they measured is gone. Editing and Save in the tray are held by
 * tests/the-review-tray-at-the-foot-of-the-window.test.ts, Finish collecting by
 * tests/the-review-confirm-press-fits-its-pane.test.ts, and the narrow foot by the tray test at 390.
 */
