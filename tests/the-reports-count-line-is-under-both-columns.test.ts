// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPORTS PAGE DRAWS ITS COUNT LINE UNDER BOTH COLUMNS, AND NO COLUMN THAT HOLDS ONLY THAT LINE (wave 13y round 129,
 * item 68, problem vBpcJrfxkF3E).
 *
 * On a wide screen Reports sets the reports waiting for the person beside the other lists. The count line was at the
 * foot of the other lists' column. In a trial the only report was waiting for the person, so that column held the count
 * line alone, and it read as the count of an empty list. Now the count line is under both columns, and a column with
 * nothing in it is not drawn, so the reports waiting for the person take the whole width.
 *
 *   1. With one report, waiting for the person: at 1440 the page draws one column, which takes the whole width, and the
 *      count line is under it. The column of the other lists is not drawn.
 *   2. With a note as well: at 1440 the page draws two columns, and the count line is under both, as wide as the two.
 *   3. At 390 the parts stand one above the other: the report waiting for the person, the note, then the count line.
 *
 * MADE-UP RECORDS in a test office of its own: one report for the test office's person, which nobody has read, filed
 * before case 1, and one note, filed before case 2.
 *
 * MUTATIONS, after a control run, in src/web/pages/family/NotesPage.tsx: put the count line back at the foot of the
 * other lists' column, and case 1 fails; give the count line no column of its own, and case 2 fails.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const REPORT = 'Made-up survey of the reed beds'
const NOTE = 'Made-up note on the sluice gate'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'reports-count-line', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // A REPORT FOR THE PERSON THAT NOBODY HAS READ, so it waits for them.
  await filed({ kind: 'report', title: REPORT, data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-11-03' } })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function filed(body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  expect(reply.status, await reply.text()).toBe(201)
}

/** A window of its own at one width, on Reports, once its rows are drawn. */
async function aWindow(width: number, rows: number) {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/notes`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await expect.poll(() => page.locator('.rpts-sides .rpts-row').count(), { timeout: 30_000 }).toBe(rows)
  await page.locator('.rpts-sides .px-pager').waitFor({ timeout: 30_000 })
  return { context, page }
}

interface Box { left: number; right: number; top: number; bottom: number; shown: boolean }

/** The two columns, the count line and the whole of the pair, as drawn. */
async function measure(page: Page): Promise<{ sides: Box; start: Box | null; end: Box | null; count: Box; countIn: string | null }> {
  return page.evaluate(() => {
    const box = (element: Element): { left: number; right: number; top: number; bottom: number; shown: boolean } => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, shown: getComputedStyle(element).display !== 'none' && rect.height > 0 }
    }
    const sides = document.querySelector('.rpts-sides')!
    const column = (which: string) => {
      const element = sides.querySelector(`:scope > [data-column="${which}"]`)
      return element === null ? null : box(element)
    }
    const count = sides.querySelector('.px-pager')!
    return {
      sides: box(sides),
      start: column('start'),
      end: column('end'),
      count: box(count),
      countIn: count.closest('.rpts-sides > *')?.getAttribute('data-column') ?? null,
    }
  })
}

describe('the Reports page and its count line', () => {
  it('1. with one report, waiting for the person, draws one column at 1440, the whole width, with the count line under it', async () => {
    const { context, page } = await aWindow(1440, 1)
    try {
      expect(await page.locator('.rpts-side .rpts-row', { hasText: REPORT }).count(), 'the report waiting for the person').toBe(1)
      const drawn = await measure(page)
      const said = JSON.stringify(drawn)
      expect(drawn.end?.shown, `the column of what waits for the person: ${said}`).toBe(true)
      expect(drawn.start === null || !drawn.start.shown, `the column of the other lists is drawn: ${said}`).toBe(true)
      expect(Math.abs(drawn.end!.left - drawn.sides.left), `the column starts at the page's left: ${said}`).toBeLessThan(2)
      expect(Math.abs(drawn.end!.right - drawn.sides.right), `the column ends at the page's right: ${said}`).toBeLessThan(2)
      expect(drawn.count.top, `the count line is under the column: ${said}`).toBeGreaterThanOrEqual(drawn.end!.bottom)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('2. with a note as well, draws two columns at 1440, and the count line under both, as wide as the two', async () => {
    await filed({ kind: 'note', title: NOTE, data: { body: 'The sluice gate sticks after rain.' } })
    const { context, page } = await aWindow(1440, 2)
    try {
      const drawn = await measure(page)
      const said = JSON.stringify(drawn)
      expect(drawn.start?.shown && drawn.end?.shown, `both columns: ${said}`).toBe(true)
      expect(drawn.end!.left, `the second column starts right of the first: ${said}`).toBeGreaterThanOrEqual(drawn.start!.right)
      expect(drawn.countIn, `the column the count line is in: ${said}`).toBe('across')
      expect(drawn.count.top, `the count line is under both columns: ${said}`).toBeGreaterThanOrEqual(Math.max(drawn.start!.bottom, drawn.end!.bottom))
      const across = await page.locator('.rpts-sides > [data-column="across"]').evaluate((one) => {
        const rect = one.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })
      expect(Math.abs(across.left - drawn.sides.left), `the count line's row starts at the page's left: ${said}`).toBeLessThan(2)
      expect(Math.abs(across.right - drawn.sides.right), `the count line's row ends at the page's right: ${said}`).toBeLessThan(2)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('3. at 390, stands the report waiting for the person, the note and the count line one above the other', async () => {
    const { context, page } = await aWindow(390, 2)
    try {
      const tops = await page.evaluate(({ report, note }) => {
        const rowOf = (title: string) => [...document.querySelectorAll('.rpts-sides .rpts-row')].find((one) => one.textContent?.includes(title))
        const top = (element: Element | null | undefined) => (element ? element.getBoundingClientRect().top : null)
        return { report: top(rowOf(report)), note: top(rowOf(note)), count: top(document.querySelector('.rpts-sides .px-pager')) }
      }, { report: REPORT, note: NOTE })
      const said = JSON.stringify(tops)
      expect(tops.report !== null && tops.note !== null && tops.count !== null, said).toBe(true)
      expect(tops.report!, said).toBeLessThan(tops.note!)
      expect(tops.note!, said).toBeLessThan(tops.count!)
    } finally {
      await context.close()
    }
  }, 120_000)
})
