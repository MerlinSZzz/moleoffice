// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE MOVES ASIDE FOR THE REVIEW COLUMN, SO NOTHING IT SHOWS IS UNDER THE COLUMN, AT 1440, 990 AND 660.
 *
 * Shape B: on a wide screen the review is a narrow column to the right of the page, and the page moves
 * aside for it. Wave 13r round 15 drew it as a flex item of the page's row (PANE_CSS in
 * src/web/components/agent/ReviewBar.tsx), so the page is narrowed instead of drawn under it.
 *
 * The page is the records list with 40 long rows, because a table is the widest thing a page draws. At each width the
 * test asks two things with the column open:
 *  - the page's own box ends where the column begins;
 *  - no element of the page that can be seen, cut to the boxes that clip it, has any part under the column.
 * A thing drawn fixed to the window, such as the corner chat button, is not part of the page and is left out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  app = await liveApp({ name: 'page-moves-aside', viewport: { width: 1440, height: 800 } })
  for (let i = 1; i <= 40; i++) {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ kind: 'task', title: `Test task ${String(i)} · wind the brass clocks in the long hall before the visitors come`, data: { state: 'todo' } }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

interface Seen {
  paneLeft: number
  paneWidth: number
  pageRight: number
  under: string[]
}

describe('the review column on a wide screen', () => {
  for (const width of [1440, 990, 660]) {
    it(`leaves every part of the page in sight at ${String(width)} wide`, async () => {
      const context = await app.browser.newContext({ viewport: { width, height: 800 } })
      // The review column's own stored state (src/web/lib/review.ts): open, showing the list.
      await context.addInitScript(() => localStorage.setItem('mole-office.review', 'open||||'))
      const page = await context.newPage()
      try {
        await page.goto(`${app.site}/#/records`)
        await waitForThePage(page, 30_000)
        await page.getByText('Test task 40 ·').first().waitFor()
        await page.locator('.px-pane .px-pane-title').first().waitFor()
        const seen: Seen = await page.evaluate(() => {
          const pane = document.querySelector<HTMLElement>('.px-pane')
          const main = pane?.parentElement
          if (!pane || !main) throw new Error('no review column on this page')
          const box = pane.getBoundingClientRect()
          const pageParts = [...main.children].filter((one) => one !== pane) as HTMLElement[]
          const pageRight = Math.max(...pageParts.map((one) => one.getBoundingClientRect().right))
          const fixed = (one: Element): boolean => {
            for (let at: Element | null = one; at !== null && at !== main; at = at.parentElement) {
              if (getComputedStyle(at).position === 'fixed') return true
            }
            return false
          }
          const under: string[] = []
          for (const part of pageParts) {
            for (const one of [part, ...part.querySelectorAll('*')]) {
              const style = getComputedStyle(one)
              if (style.display === 'none' || style.visibility === 'hidden' || fixed(one)) continue
              const r = one.getBoundingClientRect()
              let left = r.left
              let right = r.right
              let top = r.top
              let bottom = r.bottom
              // CUT TO EVERY BOX THAT CLIPS IT, so a wide table inside a box that scrolls sideways counts only what shows.
              for (let at = one.parentElement; at !== null && at !== main; at = at.parentElement) {
                const clip = getComputedStyle(at)
                const c = at.getBoundingClientRect()
                if (clip.overflowX !== 'visible') { left = Math.max(left, c.left); right = Math.min(right, c.right) }
                if (clip.overflowY !== 'visible') { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom) }
              }
              if (right - left < 1 || bottom - top < 1) continue
              const overlaps = right > box.left + 1 && left < box.right - 1 && bottom > box.top + 1 && top < box.bottom - 1
              if (overlaps && under.length < 10) under.push(`${one.tagName.toLowerCase()}.${String(one.className)} ${String(Math.round(left))}–${String(Math.round(right))}`)
            }
          }
          return { paneLeft: box.left, paneWidth: box.width, pageRight, under }
        })
        expect(seen.paneWidth, 'the column is drawn').toBeGreaterThan(200)
        expect(seen.pageRight, `the page ends where the column begins at ${String(seen.paneLeft)}`).toBeLessThanOrEqual(seen.paneLeft + 1)
        expect(seen.under).toEqual([])
      } finally {
        await context.close()
      }
    }, 120_000)
  }
})
