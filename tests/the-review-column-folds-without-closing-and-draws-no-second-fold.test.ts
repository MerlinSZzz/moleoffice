// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW COLUMN FOLDS WITHOUT CLOSING, AND THE WHOLE REVIEW UNDER "MORE ABOUT THIS REVIEW" DRAWS NO FOLD OF ITS OWN.
 *
 * This file stands in for tests/the-review-column-is-narrow-on-the-right-and-folds-without-closing.test.ts, which was
 * deleted when the review tray of design D came onto main. Nothing held the fold after that. It holds two things, in a
 * browser, in a test office of its own:
 *
 *   1. THE COLUMN FOLDS TO A STRIP AND UNFOLDS BACK. The list of reviews is open at 1440. Its head's arrow folds the
 *      column to a strip that keeps it open, and the browser keeps the folded width. The strip's arrow draws the list
 *      again. It fails if the fold closes the column, or if the column does not fold.
 *   2. ONE PRESS FOR ONE ACT IN THE TRAY. A collecting review is drawn as the tray at the window's foot, which has no
 *      width to fold. With its comments shown and "More about this review" open, the whole review drawn under More has
 *      its head and no fold arrow in it. Before, that arrow stood beside the Fold under Send, so the column drew two
 *      presses for one act. It fails if the whole review under More is given the pane's width again
 *      (`PaneWidthContext.Provider value={null}` in src/web/components/agent/ReviewBar.tsx), because it then draws
 *      its arrow.
 *
 * Both cases hold fixes already on main, so they pass on main's code. Every record here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const t = createI18n('en').t
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let noteId = ''

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

/** Opens the note's page at 1440 with the review column in this stored state, unfolded. */
async function open(stored: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 900 })
  await app.page.goto(`${app.site}/#/r/${noteId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.evaluate((state) => {
    localStorage.setItem('mole-office.review', state)
    localStorage.setItem('mole-office.review.width', 'expanded')
  }, stored)
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-column-folds', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  noteId = (
    await post<{ record: { id: string } }>('/api/records', {
      kind: 'note', title: 'Made-up kiln note', data: { body: 'The left shelf sagged by two millimetres between the firings.' },
    })
  ).record.id
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the review column and its fold', () => {
  it('1. the list of reviews folds to a strip that keeps the column open, and unfolds back: a fold that closes the column, or does not fold it, is red', async () => {
    // The column's own stored state (src/web/lib/review.ts): open, showing the list, collecting nothing.
    await open('open||||')
    const pane = app.page.locator('.px-pane')
    await pane.locator('.px-pane-title', { hasText: t('review.pane.yourReviews') }).first().waitFor({ timeout: 30_000 })
    await pane.getByRole('button', { name: t('review.pane.fold'), exact: true }).click()
    await app.page.locator('.px-pane[data-folded="1"]').waitFor({ timeout: 10_000 })
    const folded = await pane.evaluate((el) => el.getBoundingClientRect().width)
    // THE STRIP IS 3rem WIDE (PANE_CSS); the open column is at least 16rem.
    expect(folded, 'the folded column is not a strip').toBeLessThanOrEqual(64)
    expect(await app.page.evaluate(() => localStorage.getItem('mole-office.review.width'))).toBe('collapsed')
    await pane.getByRole('button', { name: t('review.pane.unfold'), exact: true }).click()
    await app.page.locator('.px-pane[data-folded="0"]').waitFor({ timeout: 10_000 })
    await pane.locator('.px-pane-title', { hasText: t('review.pane.yourReviews') }).first().waitFor({ timeout: 10_000 })
  }, 180_000)

  it('2. in the tray, the whole review under More draws its head with no fold arrow: given the pane\'s width, it draws one', async () => {
    // THE COLLECTING REVIEW IS MADE HERE, after case 1, so the list in case 1 is the column and not the tray.
    const target = { target: { kind: 'record', recordId: noteId, workspaceId: 'default' }, place: { at: 'surface' } }
    const reviewId = (await post<{ review: { id: string } }>('/api/reviews', { entry: target })).review.id
    await post('/api/records', { kind: 'message', title: 'Made-up comment about the shelf', data: { body: 'Which shelf?', target } })
    await open(`open|${reviewId}|default|${reviewId}|default`)
    const bar = app.page.locator('[data-part="your-review-bar"]')
    await bar.waitFor({ timeout: 30_000 })
    await bar.getByRole('button', { name: t('review.tray.show'), exact: true }).click()
    await app.page.locator('.px-pane[data-sheet="1"]').waitFor({ timeout: 10_000 })
    await app.page.locator('.px-pane summary', { hasText: t('review.b.more') }).click()
    await app.page.locator('.px-b-more-body .px-pane-head').waitFor({ state: 'attached', timeout: 30_000 })
    expect(await app.page.locator('.px-b-more-body .px-pane-fold-button').count(), 'the whole review under More draws its own fold arrow').toBe(0)
    // THE TRAY HAS NO WIDTH TO FOLD, so no fold press of any kind is in sight.
    const folds = app.page.locator('.px-pane').getByRole('button', { name: new RegExp(`^(${t('review.b.fold')}|${t('review.pane.fold')})$`) })
    expect(await folds.filter({ visible: true }).count(), 'a fold press is drawn in the tray').toBe(0)
  }, 180_000)
})
