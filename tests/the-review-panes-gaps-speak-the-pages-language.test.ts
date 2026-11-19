// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REVIEW COULD NOT WORK OUT IS SAID IN THE PAGE'S LANGUAGE. Wave 13r round 17, piece 1: on a Chinese page
 * the review pane drew the server's English sentence about comments written in the same second the review started,
 * and its two neighbours, comments with no recorded writer and comments that could not be read, were the same kind.
 * By decision z_A0xVMbWOzh each gap now comes from the server as a code with its values (`ReviewGap` in
 * src/server/lib/reviews.ts) and the pane draws it from the word lists, `review.gap.<code>`. The server's own
 * sentence, ids and all, is drawn in Developer mode only.
 *
 * One review with all three gaps. The database is changed under the running server the way
 * tests/a-review-loses-nothing-quietly.test.ts changes it in process: a comment's time set to the review's start,
 * a comment's ledger rows deleted, and a comment's stored place taken away.
 *
 * With TEST_SHOTS set, the last case photographs the gaps at 1440, 990, 660 and 390, light and dark, in English and
 * in Chinese, into the folder `r17-gaps` under it.
 *
 * Three-run proof (control, mutation, restore) is in round 17's report. The mutation: the pane draws `gap.says` in
 * every mode again.
 */

import type { Page } from 'playwright'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { testShots } from './where-shots-go.ts'
import { join } from 'node:path'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the kiln log said about the third firing'
const BLOCKS = [{ id: 'b-1', type: 'text', text: 'The left shelf sagged by two millimetres between the firings.' }]
const CODES = ['sameSecond', 'noWriter', 'unreadable'] as const

let app: LiveApp
let page: Page
let reportId: string
let reviewId: string
const ids: Record<(typeof CODES)[number], string> = { sameSecond: '', noWriter: '', unreadable: '' }

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: HUMAN, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

async function open(lang: 'en' | 'zh', mode: 'normal' | 'inspect'): Promise<void> {
  await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([id, how]) => {
      window.localStorage.setItem('mole-office.review', `open|${String(id)}|default||`)
      window.localStorage.setItem('mole-office.mode', String(how))
    },
    [reviewId, mode],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // THE TRAY'S LIST IS SHUT AT FIRST, so Show comments opens it before the pane's own rows are read.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.locator('[data-part="review-gap"]').first().waitFor({ timeout: 30_000 })
}

/** Every gap the pane drew, by its code. */
async function gaps(): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {}
    for (const one of document.querySelectorAll('[data-part="review-gap"]')) {
      out[one.getAttribute('data-code') ?? ''] = (one.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    return out
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'pane-gaps-in-the-pages-language', viewport: { width: 1440, height: 1200 } })
  page = app.page
  reportId = (await post<{ record: { id: string } }>('/api/records', { kind: 'report', title: TITLE, data: { blocks: BLOCKS } })).record.id
  reviewId = (
    await post<{ review: { id: string } }>('/api/reviews', {
      entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
    })
  ).review.id
  for (const code of CODES) {
    ids[code] = (
      await post<{ record: { id: string } }>('/api/records', {
        kind: 'annotation',
        title: `the ${code} comment`,
        data: { body: `A remark that will be ${code}.`, context: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } } },
      })
    ).record.id
  }

  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const changed = [
      db.prepare('UPDATE records SET created_at = (SELECT started_at FROM reviews WHERE id = ?) WHERE id = ?').run(reviewId, ids.sameSecond),
      db.prepare('DELETE FROM revisions WHERE record_id = ?').run(ids.noWriter),
      db.prepare("UPDATE records SET data = json_remove(data, '$.context') WHERE id = ?").run(ids.unreadable),
    ]
    for (const one of changed) if (one.changes === 0) throw new Error('a gap was not set up: nothing was changed')
  } finally {
    db.close()
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the review pane draws each gap in the page language', () => {

  it('in Developer mode, draws the server’s own sentence, which names the comment', async () => {
    await open('zh', 'inspect')
    const said = await gaps()
    for (const code of CODES) expect(said[code], `${code}: ${JSON.stringify(said)}`).toContain(ids[code])
  })
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs the gaps at four widths, in both looks and both languages', async () => {
  const shots = testShots('r17-gaps')
  for (const lang of ['en', 'zh'] as const) {
    for (const look of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate((one) => {
          localStorage.setItem('mole-office.preset.theme', one)
          localStorage.setItem('mole-office.mode', 'normal')
        }, look)
        await page.goto('about:blank')
        await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await setTheReviewTraysList(page, 'open')
        const more = page.locator('details.px-b-more')
        await more.waitFor({ timeout: 30_000 })
        if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
        const gap = page.locator('[data-part="review-gap"]').first()
        await gap.waitFor({ timeout: 30_000 })
        await gap.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await new Promise((r) => setTimeout(r, 500))
        await page.screenshot({ path: join(shots, `gaps-${String(width)}-${look}-${lang}.png`) })
      }
    }
  }
}, 300_000)
