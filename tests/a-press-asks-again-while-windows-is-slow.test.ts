// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS OR A PAGE CHANGE IS ASKED AGAIN WHILE WINDOWS IS SLOW TO SAY WHO SENT IT. Wave 13t, round W40.
 *
 * Inside the installed Windows app the office asks Windows which program sent a request, and waits only so long. Just
 * after an install the answer can come late, and the office then refuses the request with the code
 * `senderNotReadInTime` (src/server/lib/from-a-sandbox.ts). It reads the sender before a door does anything, so a
 * request refused this way was not done. Round W37 made the page's first reads ask again. A press or a page change made
 * after the page had drawn still showed the refusal at once, though sending the same request again was all it asked for.
 * The page's transport now asks such a request again a few times (src/web/api.ts), and shows the refusal's sentence
 * only when the last ask is refused too.
 *
 *   Q1 a page change refused once is drawn, and was asked twice;
 *   Q2 a press refused once is done once, and was asked twice;
 *   Q3 a press refused every time is asked four times in all, is not done, and the page then says the refusal's sentence.
 *
 * THE REFUSAL IS THIS TEST'S, NOT THE OFFICE'S. No server here reads who sent a request by the way that waits, so the
 * browser answers the request itself (`page.route`) in the shape the server sends, with the server's own headers, as
 * tests/a-talk-box-refusal-is-drawn-in-the-page-language.test.ts does. tests/the-windows-window-is-the-person.test.ts T5
 * holds that the server sends this code. NOTHING HERE RAN ON WINDOWS: the page is the built app in Chromium on Linux.
 *
 * MUTATION, after a control run: src/web/api.ts does not ask a refused request again (red: Q1 and Q2 show the refusal,
 * and Q3 was asked once).
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every name here is made up.
 */

import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let reportId = ''
const REPORT_TITLE = 'Synthetic report about loam drainage'
/** A second report, for the press refused every time: once a comment is kept on a report, its talk box no longer offers Start review. */
let otherReportId = ''
const OTHER_REPORT_TITLE = 'Synthetic report about clay drainage'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The server's refusal of a request whose sender was not read within 10 seconds, as the server sends it. */
const THE_CODED_REFUSAL = {
  error:
    'This request was refused, and nothing was done. The operating system did not say within 10 seconds which program on ' +
    'this computer sent it, so Mole Office does not know who sent it. Send the request again.',
  code: 'senderNotReadInTime',
  values: { seconds: 10 },
}

/** Answer the request with the coded refusal, carrying the server's own headers from a harmless read of the same server. */
async function refuse(route: Route): Promise<void> {
  const real = await route.fetch({ method: 'GET', url: `${app.api}/api`, postData: '' })
  await route.fulfill({ response: real, status: 503, contentType: 'application/json', body: JSON.stringify(THE_CODED_REFUSAL) })
}

/** A page of the app, drawn, at the records list. */
async function aDrawnPage(): Promise<Page> {
  const page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return page
}

/** The comments this test wrote with these words, read from the office. */
async function theCommentsSaying(body: string): Promise<number> {
  const listed = await fetch(`${app.api}/api/records?kind=message&shape=full`, { headers: AS_THE_OWNER })
  expect(listed.status, await listed.clone().text()).toBe(200)
  const { records } = (await listed.json()) as { records: { data: { body?: unknown } }[] }
  return records.filter((record) => record.data.body === body).length
}

/** File a report as the owner, and return its id. */
async function aReport(title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title,
      data: { for: 'Robin Vale', date: '2026-11-06', blocks: [{ id: 'b-1', type: 'text', heading: 'Drainage', text: 'One field to drain.' }] },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** Open the talk box on the report's heading, write `body` and press Start review, with each POST to /api/records answered by `answer`. */
async function pressStartReview(
  page: Page,
  report: { id: string; title: string },
  body: string,
  answer: (asked: number, route: Route) => Promise<void>,
): Promise<{ asked: () => number }> {
  const words = createI18n('en').t
  await page.goto(`${app.site}/#/r/${report.id}`)
  await waitForThePage(page, 60_000)
  await page.getByRole('heading', { name: report.title }).first().click({ button: 'right' })
  const box = page.locator('.px-talk')
  await box.locator('textarea').first().waitFor({ timeout: 30_000 })
  await box.locator('textarea').first().fill(body)
  let asked = 0
  await page.route('**/api/records', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    asked += 1
    await answer(asked, route)
  })
  await box.getByRole('button', { name: words('talk.startReview'), exact: true }).click()
  return { asked: () => asked }
}

beforeAll(async () => {
  app = await liveApp({ name: 'press-asks-again', viewport: { width: 1440, height: 1000 } })
  reportId = await aReport(REPORT_TITLE)
  otherReportId = await aReport(OTHER_REPORT_TITLE)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a press or a page change, when Windows did not say in time who sent it', () => {
  it('Q1: a page change refused once is drawn, and was asked twice', async () => {
    const page = await aDrawnPage()
    try {
      let asked = 0
      await page.route(`**/api/records/${reportId}`, async (route) => {
        asked += 1
        await (asked === 1 ? refuse(route) : route.fallback())
      })
      await page.evaluate((id) => {
        window.location.hash = `#/r/${id}`
      }, reportId)
      // THE RECORD'S OWN PAGE, drawn or refused: the list this page was on names the report too.
      await page.waitForFunction(
        (title) =>
          [...document.querySelectorAll('h1.rp-title')].some((heading) => (heading as HTMLElement).innerText.trim() === title) ||
          (document.getElementById('root')?.innerText ?? '').includes('did not say within'),
        REPORT_TITLE,
        { timeout: 60_000 },
      )
      const text = await page.evaluate(() => document.getElementById('root')?.innerText ?? '')
      expect(text, 'the page change shows the refusal').not.toContain('did not say within')
      expect(asked, 'the report was not asked again exactly once').toBe(2)
    } finally {
      await page.close()
    }
  }, 120_000)

  it('Q2: a press refused once is done once, and was asked twice', async () => {
    const page = await aDrawnPage()
    const body = 'Synthetic comment on the loam, refused once.'
    try {
      const pressed = await pressStartReview(page, { id: reportId, title: REPORT_TITLE }, body, (n, route) => (n === 1 ? refuse(route) : route.fallback()))
      const filed = await page.waitForFunction(
        () => (document.querySelector('.px-talk .px-error .px-error-msg') as HTMLElement | null)?.innerText ?? null,
        undefined,
        { timeout: 2_000 },
      ).then((handle) => handle.jsonValue()).catch(() => null)
      expect(filed, 'the press showed an error').toBeNull()
      const kept = await (async () => {
        const deadline = Date.now() + 30_000
        for (;;) {
          const n = await theCommentsSaying(body)
          if (n > 0 || Date.now() > deadline) return n
          await new Promise((later) => setTimeout(later, 500))
        }
      })()
      expect(kept, 'the comment was not kept exactly once').toBe(1)
      expect(pressed.asked(), 'the comment was not asked again exactly once').toBe(2)
      const drawn = await page.evaluate(() => document.getElementById('root')?.innerText ?? '')
      expect(drawn, 'the page shows the refusal').not.toContain('did not say within')
    } finally {
      await page.close()
    }
  }, 120_000)

  it('Q3: a press refused every time is asked four times, is not done, and the page says the refusal', async () => {
    const page = await aDrawnPage()
    const body = 'Synthetic comment on the clay, refused every time.'
    try {
      const pressed = await pressStartReview(page, { id: otherReportId, title: OTHER_REPORT_TITLE }, body, (_n, route) => refuse(route))
      const note = page.locator('.px-talk .px-error .px-error-msg')
      await note.waitFor({ timeout: 60_000 })
      expect((await note.innerText()).trim()).toBe(createI18n('en').t('server.senderNotReadInTime', THE_CODED_REFUSAL.values))
      expect(pressed.asked(), `the comment was asked ${String(pressed.asked())} times`).toBe(4)
      expect(await theCommentsSaying(body), 'a refused comment was kept').toBe(0)
    } finally {
      await page.close()
    }
  }, 120_000)
})
