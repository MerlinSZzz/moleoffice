// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER SEND, THE PANEL SHOWS WHAT HAPPENED FROM ITS FIRST LINE, WHOLE. Wave 13r round 16, piece 1, item 4 (check
 * LKIg1xz-PjD-): the send step's first line was cut, at the top of the window or under the top bar, while the
 * words below it showed. A send pressed on this page now brings the line "This review has gone" into view once,
 * clear of the top bar.
 *
 * At 390 Send is the bar's; at 1440 it is the column's. At each width the line is drawn whole: its top and
 * its foot are inside the window, and the line itself is what is drawn at its middle (nothing lies over it).
 *
 * Three-run proof (control, mutation, restore) is in round 16's report. The mutation: the call that brings the
 * line into view taken out.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { toTheEndOfThePage } from './the-page-scroller.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const t = createI18n('en').t
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const AS_THE_WRITER = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER.handle }

let app: LiveApp

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

/** A made-up report long enough that the page scrolls, written by the agent, so the review goes to it. */
async function aReport(title: string): Promise<string> {
  const filler = Array.from({ length: 6 }, (_, i) => ({ id: `b-x${String(i)}`, type: 'text', text: `Made-up reading ${String(i + 1)} of the kiln, kept so the page is long.` }))
  return (
    await post<{ record: { id: string } }>('/api/records', {
      kind: 'report', title,
      data: { blocks: [{ id: 'b-1', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings.' }, ...filler] },
    }, AS_THE_WRITER)
  ).record.id
}

/** Writes a comment on the report's first paragraph through the right-click box and presses Start review. */
async function startAReviewOn(reportId: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  const run = '[data-text-field="data.blocks[#b-1].text"]'
  await app.page.locator(run).waitFor({ timeout: 30_000 })
  const at = await app.page.evaluate((sel) => {
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
  }, run)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  await app.page.locator('.px-talk textarea').fill('Made-up comment: which shelf sagged?')
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
  await app.page.locator('.px-talk').waitFor({ state: 'detached', timeout: 30_000 })
  await app.page.locator('[data-part="your-review"]').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'r16-send-first-line', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await post('/api/records', { kind: 'agent', title: WRITER.name, data: { handle: WRITER.handle, runtime: 'claude-code', state: 'active' } })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('after Send, the first line of what happened', () => {
  for (const width of [390, 1440]) {
    it(`is drawn whole at ${String(width)}`, async () => {
      await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await startAReviewOn(await aReport(`Made-up kiln report at ${String(width)}`))
      // THE PAGE IS SCROLLED DOWN TO THE FOOT FIRST, as a person who has read the report is.
      await toTheEndOfThePage(app.page)
      // THE TRAY'S ROW CARRIES SEND AT EVERY WIDTH (item 73a). After the send it is shut, with Show comments beside Close.
      const bar = app.page.locator('[data-part="your-review-bar"]')
      await bar.getByRole('button', { name: t('review.tray.send'), exact: true }).click()
      await bar.getByRole('button', { name: t('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
      await bar.getByRole('button', { name: t('review.tray.show'), exact: true }).click()
      const head = app.page.locator('[data-part="send-the-review"] .px-org-head', { hasText: t('review.pane.send.gone') })
      await head.waitFor({ timeout: 30_000 })
      await app.page.waitForTimeout(900)
      const seen = await head.evaluate((line) => {
        const r = line.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2)
        return { top: r.top, bottom: r.bottom, height: window.innerHeight, onTop: hit !== null && line.contains(hit) }
      })
      expect(seen.top, `the first line starts above the window: ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(0)
      expect(seen.bottom, `the first line ends below the window: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(seen.height)
      expect(seen.onTop, `something is drawn over the first line: ${JSON.stringify(seen)}`).toBe(true)
    }, 180_000)
  }
})
