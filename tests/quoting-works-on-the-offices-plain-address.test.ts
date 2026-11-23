// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOTH WAYS OF QUOTING PUT THE QUOTE INTO THE CHAT'S WRITING BOX ON THE OFFICE'S PLAIN ADDRESS (wave 13y).
 *
 * The person quoted in two ways and neither did anything. One way selects words and then presses the quote press. The
 * other presses the quote press and then picks a part of the page. Both ways stored the quote with an id from
 * `crypto.randomUUID`. A browser gives `randomUUID` only to a secure context: a page served over https, or from the
 * machine the browser runs on. The person also reaches the office over plain http from another machine, and a page
 * there has no `randomUUID`. The call threw, no quote was stored, and the second way also stayed pressed.
 *
 * WHY THE EARLIER TESTS DID NOT SEE IT. Every test of the press opens the page on http://127.0.0.1, and Chromium counts
 * that address as a secure context, so `randomUUID` was there. The tests that came with the press's new drawing read
 * only its look: the tip, the shape, the edge, the ground and the outline.
 *
 * THE PAGE HERE HAS NO `randomUUID`, as the page on the plain address has none. The test opens the page on 127.0.0.1,
 * which is a secure context, so a script takes `randomUUID` off before the page loads. Each case first checks it is gone.
 *
 * In a real browser, with the chat beside the page at 1440 and open at a made-up agent, on a made-up report:
 *   1. Words selected on the report, then the quote press: the writing box holds one quote of exactly those words.
 *   2. The quote press, then a part of the report: the writing box holds one quote of that part, and the press is no
 *      longer pressed.
 *
 * Everything here is made up: the agent and the report. The servers come from `liveApp` in tests/helpers.ts, on a
 * database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributeValue } from '../src/shared/targets.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, openRecordPagesAt, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const SELECTED = 'kiln for part 2 ran for six hours'
const PICKED = 'kiln for part 3 ran for six hours'

let app: LiveApp
let agentKey = ''
let report = ''

/** File one record, and say the answer when it is not 201. */
async function file(body: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'quote-on-the-plain-address', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  await file({ kind: 'agent', title: 'Made-up Plain Quoter', data: { handle: 'made-up-plain-quoter', runtime: 'claude-code', state: 'active' } })
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  const agentId = agents.find((one) => one.handle === 'made-up-plain-quoter')?.id ?? ''
  expect(agentId, 'made-up-plain-quoter has no registry row').not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
  const blocks = [1, 2, 3].map((n) => ({
    id: `b-${String(n)}`,
    type: 'text',
    heading: `Made-up part ${String(n)}`,
    text: `Made-up paragraph ${String(n)}. The kiln for part ${String(n)} ran for six hours.`,
  }))
  report = await file({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-21', blocks } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * A browser window of its own, with no `crypto.randomUUID`, and the chat beside the page, open at the made-up agent.
 * Every error the page throws is kept, so a red case says what the page said.
 */
async function aWindow(): Promise<{ context: BrowserContext; page: Page; thrown: string[] }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(() => {
    // AS ON THE PLAIN ADDRESS: a page that is not a secure context has no randomUUID at all.
    delete (Crypto.prototype as { randomUUID?: unknown }).randomUUID
  })
  await context.addInitScript((chatWith) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
    localStorage.setItem('mole-office.chat.with', chatWith)
  }, agentKey)
  const page = await context.newPage()
  const thrown: string[] = []
  page.on('pageerror', (error) => { thrown.push(error.message) })
  await page.goto(`${app.site}/?lang=en#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: 'b-3' })}"]`).waitFor({ timeout: 30_000 })
  await page.waitForSelector('.px-chat-write .px-chat-box', { timeout: 30_000 })
  expect(await page.evaluate(() => 'randomUUID' in crypto), 'the page still has crypto.randomUUID').toBe(false)
  return { context, page, thrown }
}

/** Select these words inside the page, as a person drags across them. */
async function select(page: Page, words: string): Promise<void> {
  const found = await page.locator('#main').evaluate((within, wanted) => {
    const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = (node.textContent ?? '').indexOf(wanted)
      if (at < 0 || node.parentElement === null || node.parentElement.getClientRects().length === 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + wanted.length)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return true
    }
    return false
  }, words)
  expect(found, `the page draws no "${words}"`).toBe(true)
}

/** Each quote in the writing box, as the person reads it: its words and the line under them. */
async function theQuotes(page: Page): Promise<string[]> {
  return page.locator('.px-chat-write .px-chat-quote-chip').evaluateAll((all) => all.map((one) => (one as HTMLElement).innerText.replace(/\s+/g, ' ').trim()))
}

const PRESS = '.px-chat-write .px-chat-quote-press'

describe('quoting on a page with no crypto.randomUUID', () => {
  it('1. words selected, then the quote press: the writing box holds those words', async () => {
    const { context, page, thrown } = await aWindow()
    try {
      expect(await theQuotes(page)).toEqual([])
      await select(page, SELECTED)
      await page.click(PRESS)
      await expect.poll(() => page.locator('.px-chat-write .px-chat-quote-chip-words').allInnerTexts(), {
        timeout: 5_000,
        message: `no quote in the writing box; the page threw: ${JSON.stringify(thrown)}`,
      }).toEqual([SELECTED])
    } finally {
      await context.close()
    }
  }, 120_000)

  it('2. the quote press, then a part of the report: the writing box holds that part, and the press is let go', async () => {
    const { context, page, thrown } = await aWindow()
    try {
      expect(await theQuotes(page)).toEqual([])
      await page.click(PRESS)
      await expect.poll(() => page.locator(PRESS).getAttribute('aria-pressed'), { message: 'the press did not start picking' }).toBe('true')
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      await page.getByText(PICKED, { exact: false }).first().click()
      await expect.poll(async () => {
        const quotes = await theQuotes(page)
        return quotes.length === 1 && quotes[0]!.includes('part 3')
      }, {
        timeout: 5_000,
        message: `no quote of part 3 in the writing box; the page threw: ${JSON.stringify(thrown)}`,
      }).toBe(true)
      await expect.poll(() => page.locator(PRESS).getAttribute('aria-pressed'), { message: 'the press is still pressed' }).toBe('false')
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
    } finally {
      await context.close()
    }
  }, 120_000)
})
