// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLAG GOES WITH ITS WORDS, AND NOTHING IS SAID ABOUT IT.
 *
 * The person marks words in the writing box with a flag, then deletes them. The flag goes with them. Before, a line
 * under the box said "The mark ... was dropped: those words are no longer in the message." The person asked for that
 * line to go: the words losing their colour already shows the flag is gone.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   (a) deleting the flagged words of a message leaves the rest unmarked, says nothing, and sends no part.
 *   (b) deleting the whole of a flagged message says nothing.
 *   (c) typing inside flagged words that also stand elsewhere in the message drops the flag and says nothing.
 *
 * "Says nothing" is read as no line on the page quoting the flagged words, so it holds whatever class or sentence a
 * notice would use. The flag's name is read from the word list, never copied. Everything here is made up: the agent,
 * its one line and the words. The servers come from `liveApp` in tests/helpers.ts, on a database in its own
 * temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const JUST_ASK = enWave13n['message.intent.name.justAsk'] as string

let app: LiveApp
let agentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'flag-goes-quietly', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Deleter', data: { handle: 'made-up-deleter', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-deleter')?.id ?? ''
  expect(agentId, 'made-up-deleter has no registry row').not.toBe('')
  // ONE LINE FROM THE AGENT, so the person's next message is a reply in a conversation that exists.
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-deleter' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function aWindow(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

/** Select `from`..`to` in the plain box, so the flag's menu sees the same selection the person made. */
async function selectInTheBox(page: Page, from: number, to: number): Promise<void> {
  await page.locator('.px-chat-write textarea').evaluate((el, [a, b]) => {
    const box = el as HTMLTextAreaElement
    box.focus()
    box.setSelectionRange(a as number, b as number)
    box.dispatchEvent(new Event('select', { bubbles: true }))
  }, [from, to] as const)
}

async function chooseTheFlag(page: Page, name: string): Promise<void> {
  await page.locator('.px-chat-write .px-chat-intent').click()
  await page.locator('.px-menu .px-menu-item', { hasText: name }).click()
}

/** The words drawn marked in the writing box, in order. */
async function theMarkedWordsInTheBox(page: Page): Promise<string[]> {
  return page.$$eval('.px-chat-mark-paint .px-chat-marked', (spans) => spans.map((span) => span.textContent ?? ''))
}

/** Wait until the box draws no marked words, which is the render a typed change that drops a flag ends in. */
async function untilNothingIsMarked(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.px-chat-mark-paint .px-chat-marked').length === 0, undefined, { timeout: 15_000 })
}

/** Every line the page shows that quotes these words, as a notice of a dropped flag would. */
async function linesQuoting(page: Page, words: string): Promise<string[]> {
  return page.evaluate((quoted) => document.body.innerText.split('\n').filter((line) => line.includes(quoted)), `"${words}"`)
}

describe('a flag goes with its words', () => {
  it('(a) deleting the flagged words leaves the rest, says nothing, and sends no part', async () => {
    const { context, page } = await aWindow()
    const kept = 'Keep these words. '
    const flagged = 'Ask about these.'
    try {
      await page.fill('.px-chat-write textarea', kept + flagged)
      await selectInTheBox(page, kept.length, kept.length + flagged.length)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarkedWordsInTheBox(page)).toEqual([flagged])

      await selectInTheBox(page, kept.length, kept.length + flagged.length)
      await page.locator('.px-chat-write textarea').press('Backspace')
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe(kept)
      await untilNothingIsMarked(page)
      expect(await linesQuoting(page, flagged), 'a line under the box still speaks of the dropped flag').toEqual([])

      // THE FLAG WENT WITH ITS WORDS: the message sent from what is left carries no part and no flag.
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
      const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: AS_THE_OWNER })
      expect(read.status, await read.clone().text()).toBe(200)
      const messages = ((await read.json()) as { messages: { body: string; intent?: string; markedParts?: unknown }[] }).messages
      const sent = messages.find((one) => one.body.trim() === kept.trim())
      expect(sent, 'the message was not stored').toBeDefined()
      expect(sent?.markedParts).toBeUndefined()
      expect(sent?.intent ?? 'none').toBe('none')
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(b) deleting the whole of a flagged message says nothing', async () => {
    const { context, page } = await aWindow()
    const flagged = 'Ask about all of this.'
    try {
      await page.fill('.px-chat-write textarea', flagged)
      await selectInTheBox(page, 0, flagged.length)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarkedWordsInTheBox(page)).toEqual([flagged])

      await selectInTheBox(page, 0, flagged.length)
      await page.locator('.px-chat-write textarea').press('Backspace')
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe('')
      await untilNothingIsMarked(page)
      expect(await linesQuoting(page, flagged), 'a line under the box still speaks of the dropped flag').toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(c) typing inside flagged words that stand elsewhere too drops the flag and says nothing', async () => {
    const { context, page } = await aWindow()
    const twice = 'Ask this. '
    const flagged = 'Ask this.'
    try {
      await page.fill('.px-chat-write textarea', twice + flagged)
      await selectInTheBox(page, 0, flagged.length)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarkedWordsInTheBox(page)).toEqual([flagged])

      await page.locator('.px-chat-write textarea').evaluate((el) => {
        ;(el as HTMLTextAreaElement).focus()
        ;(el as HTMLTextAreaElement).setSelectionRange(2, 2)
      })
      await page.locator('.px-chat-write textarea').press('X')
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe('AsXk this. ' + flagged)
      await untilNothingIsMarked(page)
      expect(await linesQuoting(page, flagged), 'a line under the box still speaks of the dropped flag').toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)
})
