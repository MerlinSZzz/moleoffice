// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT FINISHES A REVIEW FITS INSIDE THE REVIEW PANE (wave 13y round 129, item 65's last page).
 *
 * Round 129 turned the confirm press's words from "1 note" into "1 comment". The pane beside the page is narrow, and
 * its confirm row is one line, with Cancel at one end and the press at the other. In the pictures the press was then
 * wider than the pane at 1440, and its last word was cut. At 990 and 660 it was already cut before round 129. Now the
 * press's own words wrap, so the two presses keep their places on one row and the press stays inside the pane.
 *
 *   1. At 1440, 990 and 660, with Finish collecting pressed once on a review that holds two comments: the press that
 *      finishes it ends inside the pane, and its words inside the press. Cancel is on the same row, at the left of it.
 *
 * MADE-UP RECORDS in a test office of its own: one report, a review started on it, and two comments on it written after.
 *
 * MUTATION, after a control run, in src/web/components/agent/ReviewBar.tsx: take away the rule that lets the press's
 * words wrap, and case 1 fails.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const OWNER = THE_TEST_OFFICES_OWNER.id
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': OWNER,
}
const WIDTHS = [1440, 990, 660] as const
const COMMENTS = ['Made-up comment: the first hinge has no count of openings.', 'Made-up comment: which printer made the second hinge?']

let app: LiveApp
let reportId = ''

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.ok, `POST ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-confirm-fits', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.addInitScript(({ person }) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person })), { person: OWNER })
  const made = (await post('/api/records', {
    kind: 'report',
    title: 'Made-up report: the hinge trials',
    summary: 'A made-up report of two printed hinges opened until they wore loose.',
    data: { date: '2026-11-03', blocks: [{ id: 'b-1', type: 'text', text: 'Two printed hinges were opened until they wore loose.' }] },
  })) as { record: { id: string } }
  reportId = made.record.id
  const target = { kind: 'record', recordId: reportId, workspaceId: 'default' }
  await post('/api/reviews', { entry: { target } })
  for (const body of COMMENTS) {
    await post('/api/records', { kind: 'annotation', title: body, data: { body, context: { target } } })
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Waits for two drawings, so what a change of width moved is on the screen before it is measured. */
const twoDrawings = (page: Page) => page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))))

/** Opens the review pane on the report, opens the review there, and presses Finish collecting once. */
async function theConfirmRow(page: Page): Promise<void> {
  if (!(await page.locator('.px-pane').isVisible())) await page.locator('.px-review-switch').click()
  const pane = page.locator('.px-pane')
  await pane.waitFor({ timeout: 30_000 })
  if ((await pane.locator('.px-pane-ends').count()) === 0) {
    const go = pane.locator('.px-pane-list .px-rev-go').first()
    await go.waitFor({ timeout: 30_000 })
    await go.click()
  }
  // FINISH COLLECTING IS BEHIND SHOW COMMENTS AND THEN "MORE ABOUT THIS REVIEW" while the review collects. The
  // review is still being read, so the row is waited for rather than counted on the frame after the press.
  const bar = pane.locator('[data-part="your-review-bar"]')
  await bar.waitFor({ timeout: 30_000 })
  const showComments = bar.getByRole('button', { name: 'Show comments', exact: true })
  if ((await showComments.count()) > 0) await showComments.click()
  const more = pane.locator('details.px-b-more')
  await more.waitFor({ timeout: 20_000 })
  if (!(await more.evaluate((one) => (one as HTMLDetailsElement).open))) await more.locator('summary').click()
  await pane.locator('.px-pane-ends button').first().click()
  await pane.locator('.px-pane-confirm').waitFor({ timeout: 20_000 })
}

describe('the press that finishes a review', () => {
  it('1. ends inside the pane at 1440, 990 and 660, on one row with Cancel at its left', async () => {
    const page = app.page
    await page.goto(`${app.site}/?lang=en#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await theConfirmRow(page)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 })
      await twoDrawings(page)
      if ((await page.locator('.px-pane-confirm').count()) === 0) await theConfirmRow(page)
      await page.locator('.px-pane-confirm').scrollIntoViewIfNeeded()
      await twoDrawings(page)
      const drawn = await page.evaluate(() => {
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        }
        const row = document.querySelector('.px-pane-confirm')!
        const [cancel, press] = [...row.querySelectorAll('button')]
        return {
          pane: box(document.querySelector('.px-pane')!),
          area: box(row.closest('.px-pane-do')!),
          cancel: box(cancel!),
          press: box(press!),
          pressWords: { scroll: press!.scrollWidth, client: press!.clientWidth },
          presses: row.querySelectorAll('button').length,
        }
      })
      const said = `at ${width}: ${JSON.stringify(drawn)}`
      expect(drawn.presses, `the presses in the confirm row ${said}`).toBe(2)
      expect(drawn.press.right, `the press ends inside the pane's bottom area ${said}`).toBeLessThanOrEqual(drawn.area.right + 0.5)
      expect(drawn.press.right, `the press ends inside the pane ${said}`).toBeLessThanOrEqual(drawn.pane.right + 0.5)
      expect(drawn.pressWords.scroll, `the press's words are inside the press ${said}`).toBeLessThanOrEqual(drawn.pressWords.client + 1)
      expect(drawn.cancel.right, `Cancel is at the left of the press ${said}`).toBeLessThanOrEqual(drawn.press.left)
      expect(drawn.cancel.top < drawn.press.bottom && drawn.press.top < drawn.cancel.bottom, `Cancel and the press on one row ${said}`).toBe(true)
    }
  }, 180_000)
})
