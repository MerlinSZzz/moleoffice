// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISIONS PAGE SAYS ITS COUNTS AND PLACES IN WORDS (wave 13q's round 31, piece 5; the review of round 30).
 *
 * In a real browser, on a scratch office holding one made-up proposal that holds up one task:
 *   - the count line gives each part its measure word, and uses the tiers' own nouns, the ones the headings say:
 *     "1 项待决定 · 0 个向你提出的问题 · 0 项已暂放" (round 32; round 31 had 0 项需要你处理), where it read "1 待决定 · 0 向你提出的请求 · 0 已搁置";
 *   - the card says what it holds up: "holding up 1 piece of work" (it read "holding up 1"); 阻碍 1 项工作 in Chinese;
 *   - the opened card says where the decision will be recorded, where it showed the bare project name "Default";
 *   - the take-none card gives a screen reader no "Option —." / "选项 —。" before its own words.
 * "< 1d" stays, as message PkQGujZzYyXK asks.
 *
 * MUTATIONS, each after a control run and a build:
 *   - the count line drawing a bare number before each tier's noun again: the count cases go red;
 *   - `decisions.holdingUp` back to "holding up {n}": the English card case goes red;
 *   - the meta line drawing the bare name: the place cases go red;
 *   - the screen-reader label drawn on the take-none card: the label cases go red.
 *
 * AN EMPTY PART SAYS WHAT IS MISSING (wave 13q round 41, decision WdlQ2ADlhZUu). The decisions made, the messages not
 * read and the lookup's answer for a place nothing governs each say their sentence where they drew a dash. Mutation:
 * `say` dropped from the Absence of decisionsAsks.none in src/web/components/MessagesYouHaveNotRead.tsx turns the
 * empty-parts case red.
 *
 * THE COUNT LINE HAS FOUR PARTS (8 November 2026). The messages the person has not read are counted in a part of
 * their own, between the asked part and the set-aside part, as the page lists them on their own. A new word is written
 * in English first, and a Chinese page shows that English until the translation round writes the Chinese. So the
 * Chinese case reads that part's words from the Chinese word list, and stays right when its Chinese is written.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const AS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const KEEPER = { ...AS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-kite-keeper' }

async function post(path: string, body: unknown, headers: Record<string, string> = AS): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, text).toBeLessThan(300)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'decisions-counts-in-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: 'test-kite-keeper', name: 'Test kite keeper' })
  const task = await post('/api/records', { kind: 'task', title: 'Test mend the kite spar', data: { state: 'todo' } })
  await post('/api/records', {
    kind: 'proposal',
    title: 'Test which glue for the spar',
    data: { question: 'Which glue should mend the spar?', options: ['a — wood glue', 'b — epoxy'], recommendation: 'Take (b).', because: 'A made-up reason.', who_settles_it: 'the owner' },
    links: [{ toId: task.record.id, type: 'blocks' }],
  }, KEEPER)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The Decisions page in a language, with the one card opened. */
async function opened(language: 'en' | 'zh'): Promise<{ count: string; card: string; meta: string; labels: string[] }> {
  const page = app.page
  await page.goto(`${app.site}/?lang=${language}#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.dq-count').first().waitFor({ timeout: 30_000 })
  const card = (await page.locator('main').first().innerText()).replace(/\s+/g, ' ')
  await page.getByText(language === 'zh' ? '作出决定' : 'Decide it').first().click()
  await page.locator('.dq-decide-meta').first().waitFor({ timeout: 30_000 })
  return {
    count: ((await page.locator('.dq-count').first().textContent()) ?? '').replace(/\s+/g, ' ').trim(),
    card,
    meta: ((await page.locator('.dq-decide-meta').first().textContent()) ?? '').trim(),
    labels: (await page.locator('.px-gov-opt .px-sr').allTextContents()).map((one) => one.trim()),
  }
}

it('says the counts, what the card holds up and where the decision goes, in English', async () => {
  const seen = await opened('en')
  expect(seen.count).toBe('1 waiting on you · 1 to settle · 0 asked of you · 0 to read · 0 set aside')
  expect(seen.card).toContain('holding up 1 piece of work')
  expect(seen.meta).toBe('Your decision will be recorded in “Default”')
  expect(seen.labels).toEqual(['Option A.', 'Option B.'])
})


it('keeps each part of the Chinese count line whole on a phone (round 32)', async () => {
  // At 390 the line wrapped inside a part, "0 项已 / 暂放" (round 32's pictures). A part may move to the next line whole.
  const page = app.page
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto(`${app.site}/?lang=zh#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.dq-count').first().waitFor({ timeout: 30_000 })
  const lines = await page.locator('.dq-count .dq-count-part').evaluateAll((parts) => parts.map((part) => {
    const range = document.createRange()
    range.selectNodeContents(part)
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
  }))
  expect(lines.length).toBe(4)
  expect(lines, 'a part of the count line is broken across two lines').toEqual([1, 1, 1, 1])
  await page.setViewportSize({ width: 1440, height: 1000 })
})

