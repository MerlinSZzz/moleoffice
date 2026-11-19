// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISHED REVIEW STILL SAYS WHY EACH COMMENT WAS LEFT OUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 20 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * While a review was collecting, the pane listed two comments under `Not in it` with the reason
 * `Earlier`. After `Finish collecting`, the same two rows read `Not known`. Mole Office knew why and
 * then stopped knowing. It is section 3 of design/round-nine/step58-whole-product-dogfood.md.
 *
 * THE CAUSE. Freezing wrote down who was IN the review and nothing about who was out. Afterwards
 * the only honest answer left was `Not known`, because working the reason out again would have
 * meant running the collecting rule over a world that had moved on — a claim about the past Mole Office
 * cannot make. The rule was right. The missing part was writing the answer down at the one moment
 * it was still true.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The words on the screen, before and after, character for character. And that the answer is KEPT
 * rather than worked out again: between the two readings this test moves the record one of the
 * comments is about INTO the review's scope. Nothing that ran the collecting rule again could still
 * answer `Elsewhere` about that comment, so a build that recomputes goes red here.
 *
 * A review frozen before this was built holds no reasons, and those rows still read `Not known`.
 * That is not a gap in this proof. Nobody wrote the reason down, and `Not known` is what Mole Office
 * says when nobody has.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MODULE_TITLE = 'Torque sensor'
const OUTSIDE_TITLE = 'Cable loom'
const WRITTEN_BEFORE = 'The zero drifts overnight.'
const WRITTEN_OUTSIDE = 'The loom is too short.'
const IN_THE_REVIEW = 'The reading lags the motion.'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let moduleId: string
let outsideId: string
let reviewId: string

/** One row of the pane's `Not in it` group: the words somebody wrote, and the reason word beside. */
interface DrawnRow {
  words: string
  why: string
}

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

async function writeComment(body: string, recordId: string): Promise<string> {
  const made = await post<{ record: { id: string } }>('/api/records', {
    kind: 'annotation',
    title: body,
    data: { body, context: { target: { kind: 'record', recordId, workspaceId: 'default' } } },
  })
  return made.record.id
}

/** What the pane draws under `Not in it`, read off the screen. */
async function whatThePaneDraws(): Promise<DrawnRow[]> {
  return page.evaluate(() => {
    const group = [...document.querySelectorAll<HTMLElement>('.px-pane-group')].find(
      (one) => one.getAttribute('data-in') === '0',
    )
    if (group === undefined) return []
    return [...group.querySelectorAll<HTMLElement>('.px-rev-item')].map((item) => ({
      words: (item.querySelector('.px-rev-words')?.textContent ?? '').trim(),
      why: (item.querySelector('.px-rev-why')?.textContent ?? '').trim(),
    }))
  })
}

function reasonFor(rows: DrawnRow[], words: string): string {
  const found = rows.find((row) => row.words.startsWith(words.slice(0, 20)))
  if (found === undefined) {
    throw new Error(`no row under "Not in it" for "${words}". Rows drawn: ${JSON.stringify(rows)}`)
  }
  return found.why
}

beforeAll(async () => {
  app = await liveApp({ name: 'remembers-why', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = await post<{ record: { id: string } }>('/api/records', {
    kind: 'module',
    title: MODULE_TITLE,
    summary: 'What the arm feels.',
    data: { state: 'active', context: 'Reads the force at the wrist.' },
  })
  moduleId = made.record.id

  const other = await post<{ record: { id: string } }>('/api/records', {
    kind: 'module',
    title: OUTSIDE_TITLE,
    summary: 'What carries the current.',
    data: { state: 'active', context: 'Runs from the base to the wrist.' },
  })
  outsideId = other.record.id

  // ONE COMMENT BEFORE THE REVIEW STARTS. A stored stamp holds whole seconds, so the wait is what
  // makes "before" a fact Mole Office can read rather than a tie.
  await writeComment(WRITTEN_BEFORE, moduleId)
  await sleep(1_500)

  const begun = await post<{ review: { id: string } }>('/api/reviews', {
    entry: { target: { kind: 'record', recordId: moduleId, workspaceId: 'default' } },
  })
  reviewId = begun.review.id
  await sleep(1_500)

  // ONE COMMENT ON SOMETHING THE REVIEW DOES NOT REACH, and one inside it so the review is not
  // empty. Only the first two are `Not in it`.
  await writeComment(WRITTEN_OUTSIDE, outsideId)
  await writeComment(IN_THE_REVIEW, moduleId)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the reason a comment was left out, before and after Finish collecting', () => {
  let whileCollecting: DrawnRow[]
  let afterFinishing: DrawnRow[]

  beforeAll(async () => {
    await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${moduleId}`, {
      timeout: 60_000,
    })
    await waitForThePage(page, 60_000)
    await sleep(1_200)

    // OPEN THE COLUMN ON THE REVIEW THAT IS COLLECTING. The Reviews control in the sidebar is the
    // only way in: the band above every page carried one until 5 September 2026, when the owner
    // asked for the band to go (problem `Wa-23qH_zbPx`). The control always says the same word, so
    // whether the column is open is read from `aria-pressed`.
    const reviews = page.locator('.px-review-switch')
    if ((await reviews.getAttribute('aria-pressed')) !== 'true') await reviews.click()
    // THEN THE REVIEW ITSELF. The control opens the column on the LIST of reviews; the band's press
    // went straight to the one that was collecting. That is one press more than before and it is
    // what was asked for. The list's own head says which review is collecting, and its row is the
    // way into that review — and the only way back to a finished one.
    await page.locator('.px-rev-go').first().click()
    // AND THE WHOLE PANE, which since wave 13r round 15 is behind "More about this review" while the review collects.
    // The tray's list is shut at first, so Show comments opens it before the pane's own rows are read.
    await setTheReviewTraysList(page, 'open')
    const more = page.locator('details.px-b-more')
    await more.waitFor({ timeout: 30_000 })
    if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
    await page.getByRole('heading', { name: 'Not in it' }).waitFor({ timeout: 30_000 })
    await sleep(1_500)
    whileCollecting = await whatThePaneDraws()

    // FINISH COLLECTING. Two presses, and the second one is at the other end of the row.
    await page.getByRole('button', { name: 'Finish collecting', exact: true }).click()
    await sleep(400)
    await page.getByRole('button', { name: /^Finish collecting · / }).click()
    await sleep(2_000)

    // MOVE THE WORLD. The record the second comment is about becomes part of the module the review
    // was started from. Anything working the reason out again would now have to say something else
    // about that comment, so this is what tells a kept answer from a recomputed one.
    await post('/api/links', { fromId: outsideId, toId: moduleId, type: 'part_of' })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1_200)
    const again = page.locator('.px-review-switch')
    if ((await again.getAttribute('aria-pressed')) !== 'true') await again.click()
    await sleep(800)
    // Nothing is collecting now, so the pane opens on the list of reviews. Press the one this test
    // finished.
    const row = page.getByRole('button', { name: new RegExp(MODULE_TITLE) }).first()
    if (await row.isVisible()) await row.click()
    await page.getByRole('heading', { name: 'Not in it' }).waitFor({ timeout: 30_000 })
    await sleep(1_500)
    afterFinishing = await whatThePaneDraws()
  }, 240_000)

  it('draws both comments under "Not in it" while collecting, each with its own reason', () => {
    expect(whileCollecting).toHaveLength(2)
    expect(reasonFor(whileCollecting, WRITTEN_BEFORE)).toBe('Earlier')
    expect(reasonFor(whileCollecting, WRITTEN_OUTSIDE)).toBe('Elsewhere')
  })

  it('draws the same two comments after collecting finished', () => {
    expect(afterFinishing).toHaveLength(2)
  })

  it('says "Earlier" after finishing, which is what it said before', () => {
    expect(reasonFor(afterFinishing, WRITTEN_BEFORE)).toBe(reasonFor(whileCollecting, WRITTEN_BEFORE))
    expect(reasonFor(afterFinishing, WRITTEN_BEFORE)).toBe('Earlier')
  })

  it('says "Elsewhere" after finishing, about a record that is now inside the review', () => {
    // The record moved after the review was frozen. `Elsewhere` is the answer that was true when
    // collecting finished, and it is kept. Working it out again cannot reach it.
    expect(reasonFor(afterFinishing, WRITTEN_OUTSIDE)).toBe(reasonFor(whileCollecting, WRITTEN_OUTSIDE))
    expect(reasonFor(afterFinishing, WRITTEN_OUTSIDE)).toBe('Elsewhere')
  })

  it('never says "Not known" about a comment Mole Office had a reason for', () => {
    expect(afterFinishing.map((row) => row.why)).not.toContain('Not known')
  })
})
