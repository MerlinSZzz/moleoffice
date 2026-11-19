// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Quotes keep their places in the writing box, its conversation, and the sent message. */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const firstQuote = 'made-up first quoted phrase'
const secondQuote = 'made-up second quoted phrase'
const longQuote = 'made-up long quoted words that need more room than the entire writing box can give them at a narrow window'
const firstWords = 'Made-up first sentence. '
const secondWords = 'Made-up second sentence.'
const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let app: LiveApp
let agents: string[] = []
let note = ''
let selectWordsCode = ''
let readChipCode = ''

async function file(body: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers: asPerson, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBe(201)
  return ((await response.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  readChipCode = `(() => {
    window.readMadeUpChip = () => {
      const chip = document.querySelector('.px-chat-write .px-chat-quote-chip');
      const read = selector => {
        const node = chip.querySelector(selector);
        return { client: node.clientWidth, scroll: node.scrollWidth };
      };
      return { words: read('.px-chat-quote-chip-words'), from: read('.px-chat-quote-chip-from') };
    };
  })()`
  selectWordsCode = `(() => {
    window.selectMadeUpWords = words => {
      const walker = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = (node.textContent || '').indexOf(words);
        if (at < 0 || !node.parentElement?.getClientRects().length) continue;
        const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + words.length);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return true;
      }
      return false;
    }
  })()`
  app = await liveApp({ name: 'quote-composer-order', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  for (const handle of ['made-up-quote-a', 'made-up-quote-b']) await file({ kind: 'agent', title: `Made-up ${handle}`, data: { handle, runtime: 'claude-code', state: 'active' } })
  const people = await (await fetch(`${app.api}/api/participants`, { headers: asPerson })).json() as { agents: { id: string; handle: string }[] }
  agents = ['made-up-quote-a', 'made-up-quote-b'].map((handle) => people.agents.find((one) => one.handle === handle)?.id ?? '')
  expect(agents.every(Boolean)).toBe(true)
  note = await file({ kind: 'note', title: 'Made-up quote source', data: { body: `A ${firstQuote}. A ${secondQuote}. A ${longQuote}. Made-up extra words to make the source line long enough to be cut in the narrow writing box.` } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function open(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((key) => { localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.chat.open', 'split'); localStorage.setItem('mole-office.chat.split-side', 'right'); localStorage.setItem('mole-office.chat.with', key) }, participantKey({ kind: 'agent', id: agents[0]! }))
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#${recordPath(note)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByText(firstQuote, { exact: false }).first().waitFor({ timeout: 30_000 })
  await page.locator('.px-chat-quote-press').waitFor({ timeout: 30_000 })
  await page.addScriptTag({ content: selectWordsCode })
  return { context, page }
}

async function choose(page: Page, words: string): Promise<void> {
  expect(await page.evaluate((text) => (window as unknown as { selectMadeUpWords: (text: string) => boolean }).selectMadeUpWords(text), words)).toBe(true)
  await page.getByRole('button', { name: t('chat.quote.press') }).click()
}
const box = (page: Page) => page.locator('.px-chat-write [contenteditable="true"]')
const quotes = (page: Page) => box(page).locator('.px-chat-quote-chip')
async function append(page: Page, words: string): Promise<void> {
  const editor = box(page)
  await editor.focus()
  await editor.press('End')
  await editor.pressSequentially(words)
}

async function enter(page: Page, id: string): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id })] as const)
}

describe('quotes in a conversation draft', () => {
  it.each([[firstQuote, false], [longQuote, true]] as const)('gives selected words room at 390: %s', async (words, long) => {
    const { context, page } = await open()
    try {
      await choose(page, words)
      await quotes(page).first().waitFor({ timeout: 5_000 })
      await page.setViewportSize({ width: 390, height: 900 })
      // The source can overflow at the old width too. Wait for the viewport and the writing box to reach 390 together.
      await expect.poll(async () => page.evaluate(() => ({
        viewport: window.innerWidth,
        writing: document.querySelector<HTMLElement>('.px-chat-write')?.clientWidth ?? 0,
      })), { timeout: 10_000 }).toEqual({ viewport: 390, writing: 390 })
      await page.addScriptTag({ content: readChipCode })
      const read = () => page.evaluate(() => (window as unknown as { readMadeUpChip: () => { words: { client: number; scroll: number }; from: { client: number; scroll: number } } }).readMadeUpChip())
      await expect.poll(async () => (await read()).from.scroll > (await read()).from.client).toBe(true)
      const chip = await read()
      if (long) {
        expect(chip.words.scroll).toBeGreaterThan(chip.words.client)
        expect(chip.words.client).toBeGreaterThan(chip.from.client)
        expect(chip.from.client).toBe(0)
      } else {
        expect(chip.words.scroll).toBeLessThanOrEqual(chip.words.client)
      }
      await expect.poll(() => box(page).getByRole('button', { name: t('chat.quote.remove') }).isVisible()).toBe(true)
    } finally { await context.close() }
  }, 120_000)

  it('sends two quotes and two pieces of writing in their composed order', async () => {
    const { context, page } = await open()
    try {
      await choose(page, firstQuote)
      await expect.poll(() => quotes(page).count(), { timeout: 5_000 }).toBe(1)
      await append(page, firstWords)
      await choose(page, secondQuote)
      await expect.poll(() => quotes(page).count()).toBe(2)
      await append(page, secondWords)
      const draft = await box(page).innerText()
      expect(draft.indexOf(firstQuote)).toBeLessThan(draft.indexOf(firstWords.trim()))
      expect(draft.indexOf(firstWords.trim())).toBeLessThan(draft.indexOf(secondQuote))
      expect(draft.indexOf(secondQuote)).toBeLessThan(draft.indexOf(secondWords))
      await page.locator('.px-chat-send').click()
      const sent = page.locator('.px-chat-one', { hasText: secondWords }).last()
      await sent.waitFor({ timeout: 30_000 })
      await expect.poll(async () => {
        const text = await sent.innerText()
        const at = [firstQuote, firstWords.trim(), secondQuote, secondWords].map((part) => text.indexOf(part))
        return at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1]!))
      }, { timeout: 30_000 }).toBe(true)
      await expect.poll(async () => {
        const response = await fetch(`${app.api}/api/records?kind=message&shape=full`, { headers: asPerson })
        const listed = await response.json() as { records: { data: { body?: string; quotePositions?: number[] } }[] }
        return listed.records.find((one) => one.data.body === firstWords + secondWords)?.data.quotePositions
      }, { timeout: 30_000 }).toEqual([0, firstWords.length])
      const text = await sent.innerText()
      const positions = [firstQuote, firstWords.trim(), secondQuote, secondWords].map((part) => text.indexOf(part))
      expect(positions.every((n) => n >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    } finally { await context.close() }
  }, 120_000)

  it('keeps an unsent quote with the conversation and restores it on return', async () => {
    const { context, page } = await open()
    try {
      await choose(page, firstQuote)
      await expect.poll(() => quotes(page).count(), { timeout: 5_000 }).toBe(1)
      await enter(page, agents[1]!)
      await expect.poll(() => quotes(page).count()).toBe(0)
      await enter(page, agents[0]!)
      await expect.poll(() => quotes(page).count()).toBe(1)
      expect(await quotes(page).first().innerText()).toContain(firstQuote)
    } finally { await context.close() }
  }, 120_000)

  it('shows the picking frame, quotes a pointed item, and cancels with Escape', async () => {
    const { context, page } = await open()
    try {
      await page.getByRole('button', { name: t('chat.quote.press') }).click()
      await expect.poll(() => page.getByRole('button', { name: t('chat.quote.press') }).getAttribute('aria-pressed')).toBe('true')
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      await page.getByText(firstQuote, { exact: false }).first().click()
      await expect.poll(() => quotes(page).count(), { timeout: 5_000 }).toBe(1)
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
      await box(page).getByRole('button', { name: t('chat.quote.remove') }).click()
      await expect.poll(() => quotes(page).count()).toBe(0)
      await page.getByRole('button', { name: t('chat.quote.press') }).click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      await page.keyboard.press('Escape')
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
      await expect.poll(() => quotes(page).count()).toBe(0)
    } finally { await context.close() }
  }, 120_000)
})
