// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The page remains reachable while a narrow chat asks for a quote. */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const quotedWords = 'Made-up words on the source page.'
const heldWords = 'Made-up words kept in the draft.'
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let app: LiveApp
let agent = ''
let note = ''
let inspectPoint = ''

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(response.status, await response.clone().text()).toBe(201)
  return ((await response.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  inspectPoint = `(() => {
    window.placeMadeUpTarget = () => {
      const target = [...document.querySelectorAll('#main *')].find(e => e.textContent?.trim() === 'Made-up words on the source page.');
      if (!target) throw new Error('Made-up target is missing');
      const spacer = document.createElement('div');
      spacer.style.height = '900px';
      target.before(spacer);
      target.scrollIntoView({ block: 'center' });
      const windowBox = document.querySelector('.px-chat').getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      window.scrollBy(0, (targetBox.top + targetBox.bottom - windowBox.top - windowBox.bottom) / 2);
    };
    window.madeUpTargetIsReachable = () => {
      const target = [...document.querySelectorAll('#main *')].find(e => e.textContent?.trim() === 'Made-up words on the source page.');
      if (!target) return false;
      const r = target.getBoundingClientRect();
      const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return found === target || target.contains(found);
    }
  })()`
  app = await liveApp({ name: 'narrow-quote-picking', viewport: { width: 390, height: 844 }, workspace: 'default', opensAt: 'full' })
  await file('agent', 'Made-up quote recipient', { handle: 'made-up-narrow-quote', runtime: 'claude-code', state: 'active' })
  const people = await (await fetch(`${app.api}/api/participants`, { headers })).json() as { agents: { id: string; handle: string }[] }
  const recipient = people.agents.find((one) => one.handle === 'made-up-narrow-quote')
  if (!recipient) throw new Error('The made-up quote recipient was not created')
  agent = recipient.id
  note = await file('note', 'Made-up quote page', { body: quotedWords })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function open(where: 'split' | 'window'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ where, key }) => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', where === 'window' ? 'yes' : 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
    localStorage.setItem('mole-office.chat.with', key)
  }, { where, key: participantKey({ kind: 'agent', id: agent }) })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#${recordPath(note)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: t('chat.quote.press') }).waitFor({ timeout: 30_000 })
  await page.addScriptTag({ content: inspectPoint })
  return { context, page }
}

describe('quote picking at phone width', () => {
  for (const where of ['split', 'window'] as const) {
    it(`lets the page be pointed at with the chat ${where}`, async () => {
      const { context, page } = await open(where)
      try {
        const press = page.getByRole('button', { name: t('chat.quote.press') })
        const target = page.getByText(quotedWords, { exact: true })
        const chips = page.locator('.px-chat-write .px-chat-quote-chip')
        await page.locator('.px-chat-write textarea').fill(heldWords)
        await page.evaluate(() => (window as unknown as { placeMadeUpTarget: () => void }).placeMadeUpTarget())
        expect(await page.evaluate(() => (window as unknown as { madeUpTargetIsReachable: () => boolean }).madeUpTargetIsReachable())).toBe(false)
        await press.click()
        await expect.poll(() => press.getAttribute('aria-pressed')).toBe('true')
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
        await expect.poll(() => page.evaluate(() => (window as unknown as { madeUpTargetIsReachable: () => boolean }).madeUpTargetIsReachable())).toBe(true)
        await target.click({ timeout: 5_000 })
        await expect.poll(() => chips.count()).toBe(1)
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
        expect(await page.locator('.px-chat-write [contenteditable=true]').innerText()).toContain(heldWords)
        await page.locator('.px-chat-write').getByRole('button', { name: t('chat.quote.remove') }).click()
        await press.click()
        await expect.poll(() => press.getAttribute('aria-pressed')).toBe('true')
        await page.keyboard.press('Escape')
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
        await expect.poll(() => chips.count()).toBe(0)
        expect(await page.locator('.px-chat-write textarea').inputValue()).toBe(heldWords)
        await press.click()
        await expect.poll(() => press.getAttribute('aria-pressed')).toBe('true')
        await press.click()
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).not.toBe('1')
        expect(await page.locator('.px-chat-write textarea').inputValue()).toBe(heldWords)
      } finally { await context.close() }
    }, 120_000)
  }
})
