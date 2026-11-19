// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE SAYS A MISSING SUMMARY ONCE, JOINS ITS HISTORY LINE IN THE PAGE'S OWN PUNCTUATION, AND
 * SAYS "NOT JOINED" WHERE IT MEANS JOINED RECORDS. Wave 13k round 36, from the secretary's review of round 35's
 * pictures and the round's brief.
 *
 *   1. A decision with no summary said so twice: "No summary was written for this record." under the
 *      title, and "Not filled in yet: summary." in the missing-details panel. The panel says it now, and
 *      the line under the title is not drawn.
 *   2. The history fold's line put a spaced English dash between two Chinese phrases. It is drawn from
 *      the word lists: " — " in English and "——" with no spaces in Chinese. The change-log fold below
 *      it had the same spaced dash between "刚刚由 … 更改" and 查看哪些内容发生了变化, and takes the same word.
 *   3. The links panel said "no links yet" / 还没有链接 under text that held working links. The panel
 *      means records joined to this one, so it says "not joined to any record yet" / 还没有连接到其他记录.
 *   4. (Round 37, the secretary's review of round 36's pictures.) A report that does not say who it is for said so
 *      twice: "Not filled in yet: who it is for." in the panel and "nobody said who it is for" on the report's
 *      line below. The panel says it now, and the report's line does not.
 *   5. (Round 38, the secretary's review of round 37's pictures, AEczCyDHb-Xu.) The count of missing details was said
 *      three times: by a chip in the page's header, by the chip in the missing-details box, and by the box's
 *      heading ("此决定缺少 1 项信息"). It is said once now, by the chip in the box. The header draws no chip,
 *      and the heading names what is missing without the number.
 *   6. (Round 38, the same review.) At 390 the corner chat button covered most of the report's 区域 button. The
 *      regions button keeps out of the chat button's column at every width, so no scroll position hides it.
 *
 * PICTURES (round 37): only when TEST_SHOTS names a folder, the decision with no summary and the report, at
 * 1440, 990, 660 and 390, light and dark, in English and Chinese, so the first and fourth points can be seen.
 *
 * tests/record-words-and-office-addresses.test.ts holds the words and reads the source; this file holds
 * what the page actually draws, in a browser, in both languages.
 *
 * MADE-UP RECORDS: one decision filed through the API with no summary, by the test office's person
 * (only a decision owes a summary, envelopeIncompleteness in src/shared/kinds.ts), and one report with a
 * day and no "for", labelled made-up in its own summary and text.
 *
 * MUTATIONS, each after a control run, each red for the reason its case states, then restored green:
 *   - src/web/pages/RecordPage.tsx: draw the line under the title whenever the summary is empty again
 *     (drop the `incomplete.some(... 'summary')` condition). The first case goes red: the page says
 *     record.noSummary as well as the panel's line.
 *   - src/web/components/RecordHistory.tsx: put back the literal {' — '} for the joint. The second case
 *     goes red in Chinese: the fold's line holds " — " and no "——".
 *   - src/web/pages/RecordPage.tsx: put back the literal " — " between the change-log fold's last change
 *     and record.seeChanges. The change-log case goes red in Chinese: its line holds " — " and no "——".
 *   - src/shared/words/zh.ts and en.ts: put back 还没有链接 / "no links yet" for record.links.noneWord.
 *     The third case goes red: the panel's words are the old ones.
 *   - (Round 37) src/web/pages/RecordPage.tsx: draw the report's "nobody said who it is for" whether or not
 *     the panel names it. The fourth case goes red in both languages.
 *   - (Round 38) src/web/pages/RecordPage.tsx: put the <IncompleteMark> back in the header's kind line. The
 *     fifth case goes red: two chips, one of them in the header.
 *   - (Round 38) src/shared/words/en.ts and zh.ts: put {n} back in sheet.incomplete.heading. The fifth case
 *     goes red: the heading holds the number.
 *   - (Round 38) src/web/components/SummaryBlocks.tsx: take away the regions button's room for the chat button.
 *     The sixth case goes red at the first width it reads, 1440: the regions button reaches under the chat button.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { join } from 'node:path'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LANGUAGES = ['en', 'zh'] as const

let app: LiveApp
let page: Page
let decisionId = ''
let reportId = ''
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('record-page')

async function open(language: 'en' | 'zh', id = decisionId, look = 'light'): Promise<void> {
  await page.goto(`${app.site}/?lang=${language}&look=${look}#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-inc-title').waitFor({ timeout: 30_000 })
  await page.locator('.rh-fold > summary').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'missing-summary-once', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_PERSON, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  page = app.page
  // DESIGN D DRAWS THE CORNER CIRCLE AT 1440 ONLY WHILE A MESSAGE WAITS, so one waits for this file.
  const keeper = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'agent', title: 'Region Keeper', data: { handle: 'region-keeper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(keeper.status, await keeper.clone().text()).toBe(201)
  const waiting = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'region-keeper' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line for the regions button', data: { body: 'A made-up line for the regions button.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(waiting.status, await waiting.clone().text()).toBe(201)
  // The page keeps its theme in local storage, so the address's look is put there before the page reads it.
  await page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'decision',
      title: 'The lantern archive keeps its scans for a year',
      data: { replaces: [] },
    }),
  })
  const body = (await res.json()) as { record?: { id: string }; error?: string }
  expect(res.status, JSON.stringify(body)).toBe(201)
  decisionId = body.record!.id
  // A made-up report that says on which day it is about and not who it is for.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'report',
      title: 'The lantern archive counted its scans',
      summary: 'A made-up report for this test: the archive holds 412 scans, and nobody said who reads this.',
      data: { date: '2026-10-04', blocks: [{ id: 'b-1', type: 'text', heading: 'The count', text: 'A made-up count of 412 scans.' }] },
    }),
  })
  const report = (await filed.json()) as { record?: { id: string }; error?: string }
  expect(filed.status, JSON.stringify(report)).toBe(201)
  reportId = report.record!.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
})




describe('the regions button on a report page', () => {
  // Round 38 (the secretary's review of round 37's pictures, point 4): at 390 the corner chat button covered most of the
  // 区域 button. Design D draws no corner circle below the width at which the page turns wide (THE_SHELL_WIDTH), so there the check is that no floating button
  // is drawn and the regions button stays inside the window; at 1440 the regions button is clear of the circle.
  it.each(['en'] as const)('%s: keeps the regions button clear of the chat press at every width', async (language) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('about:blank')
      await open(language, reportId)
      const regions = page.locator('.sb-regions')
      await regions.scrollIntoViewIfNeeded()
      const button = await regions.boundingBox()
      expect(button, `${language} ${String(width)}: no regions button`).not.toBeNull()
      if (width < THE_SHELL_WIDTH) {
        expect(await page.locator('.px-chat-circle').count(), `${language} ${String(width)}: the corner circle was drawn below ${String(THE_SHELL_WIDTH)}`).toBe(0)
        expect(button!.x + button!.width, `${language} ${String(width)}: the regions button reaches past the window`).toBeLessThanOrEqual(width)
      } else {
        const chat = await page.locator('.px-chat-circle').boundingBox()
        expect(chat, `${language} ${String(width)}: no chat button`).not.toBeNull()
        expect(button!.x + button!.width, `${language} ${String(width)}: the regions button reaches under the chat button`).toBeLessThanOrEqual(chat!.x)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 300_000)
})

describe('pictures', () => {
  // Round 37: a record with no summary is photographed, so round 36's point 10 can be seen, with a report's page.
  it('photographs the decision with no summary and the report at four widths, light and dark, in both languages', async () => {
    if (!KEEP) return
    for (const [name, id] of [['no-summary', decisionId], ['report', reportId]] as const) {
      for (const language of LANGUAGES) {
        for (const look of ['light', 'dark']) {
          for (const width of [1440, 990, 660, 390]) {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto('about:blank')
            await open(language, id, look)
            await page.screenshot({ path: join(SHOTS, `${name}-${language}-${width}-${look}.png`), fullPage: true })
          }
        }
      }
    }
  }, 1_200_000)
})
