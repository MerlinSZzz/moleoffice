// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORDS ARE MARKED IN THE BOX AND DRAWN WHERE THE MESSAGE IS SENT (wave 14d, DB-2).
 *
 * The person selects words in the writing box and chooses a flag on the flag left of Send. The run becomes a marked
 * part: it is drawn in that flag's words colour while it is still being written, it is sent as `markedParts`, and the
 * sent bubble draws it in the same colour and says in its foot how many parts the message has. A message either has
 * parts or one flag on the whole, never both.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   (a) one message carries two parts with two different flags, each part `from`, `to`, `quote` and its flag.
 *   (b) the marked words are drawn in their flag's words colour while the person writes, and again in the bubble.
 *   (c) the bubble's foot says how many marked parts the message has.
 *   (d) a part is kept with the draft: opening another conversation and coming back keeps the words and their marks.
 *   (e) choosing No mark over a marked run takes the mark off those words and leaves the other part.
 *   (f) a refusal from the office is said, and the words and their marks stay in the box.
 *   (g) with nothing selected, the flag still marks the whole message: `intent`, with no parts.
 *   (h) typing before a part moves it; typing inside it drops it and says its words and its flag under the box.
 *
 * The words are read from the word lists, never copied. Everything here is made up: the agent, its one line and the
 * person's flags. The servers come from `liveApp` in tests/helpers.ts, on a database in its own temporary folder.
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

const SETTINGS = {
  'just-ask': { colour: 'purple', wordsColour: 'green' },
  'proposal-first': { colour: 'amber', wordsColour: 'red' },
}
const JUST_ASK = enWave13n['message.intent.name.justAsk'] as string
const PLAN_FIRST = enWave13n['message.intent.name.proposalFirst'] as string
const NO_MARK = enWave13n['chat.intent.name.none'] as string

let app: LiveApp
let agentId = ''
let otherAgentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'marked-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags: SETTINGS }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Marker', data: { handle: 'made-up-marker', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-marker')?.id ?? ''
  expect(agentId, 'made-up-marker has no registry row').not.toBe('')
  const other = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Other', data: { handle: 'made-up-other', runtime: 'claude-code', state: 'active' } }),
  })
  expect(other.status, await other.clone().text()).toBe(201)
  const listedAgain = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const moreAgents = ((await listedAgain.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  otherAgentId = moreAgents.find((one) => one.handle === 'made-up-other')?.id ?? ''
  expect(otherAgentId, 'made-up-other has no registry row').not.toBe('')
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-marker' },
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
  await openTheMarker(page)
  return { context, page }
}

async function openTheMarker(page: Page): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
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

/** The marked runs drawn in the writing box, in order: their words and the colours they ask for. */
async function theMarksInTheBox(page: Page): Promise<{ words: string; wordsColour: string | null; flagColour: string | null }[]> {
  return page.$$eval('.px-chat-mark-paint .px-chat-marked', (spans) => spans.map((span) => ({
    words: span.textContent ?? '',
    wordsColour: span.getAttribute('data-words-colour'),
    flagColour: span.getAttribute('data-flag-colour'),
  })))
}

async function theConversation(agent: string): Promise<{ id: string; body: string; markedParts?: { from: number; to: number; quote: string; intent?: string; name?: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agent)}`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: { id: string; body: string; markedParts?: { from: number; to: number; quote: string; intent?: string; name?: string }[] }[] }).messages
}

describe('marked words', () => {
  it('(a, b, c) two parts with two flags are sent, painted in the box and drawn in the bubble', async () => {
    const { context, page } = await aWindow()
    const body = 'Mark these words. And these too. And leave this.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await selectInTheBox(page, 0, 'Mark these words.'.length)
      await chooseTheFlag(page, JUST_ASK)
      await selectInTheBox(page, 'Mark these words. '.length, 'Mark these words. And these too.'.length)
      await chooseTheFlag(page, PLAN_FIRST)

      expect(await theMarksInTheBox(page)).toEqual([
        { words: 'Mark these words.', wordsColour: 'green', flagColour: 'purple' },
        { words: 'And these too.', wordsColour: 'red', flagColour: 'amber' },
      ])

      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })

      const words = await theConversation(agentId)
      const sent = words.find((one) => one.body === body)
      expect(sent?.markedParts?.map((one) => ({ from: one.from, to: one.to, quote: one.quote, intent: one.intent, name: one.name }))).toEqual([
        { from: 0, to: 17, quote: 'Mark these words.', intent: 'just-ask', name: JUST_ASK },
        { from: 18, to: 32, quote: 'And these too.', intent: 'proposal-first', name: PLAN_FIRST },
      ])

      await page.waitForSelector(`.px-chat-one[data-mine="yes"] .px-chat-words .px-chat-marked`, { timeout: 30_000 })
      const drawn = await page.$$eval('.px-chat-one[data-mine="yes"] .px-chat-words .px-chat-marked', (spans) => spans.map((span) => ({
        words: span.textContent ?? '',
        wordsColour: span.getAttribute('data-words-colour'),
        flagColour: span.getAttribute('data-flag-colour'),
      })))
      expect(drawn).toEqual([
        { words: 'Mark these words.', wordsColour: 'green', flagColour: 'purple' },
        { words: 'And these too.', wordsColour: 'red', flagColour: 'amber' },
      ])
      expect(await page.locator('.px-chat-one[data-mine="yes"] .px-chat-marked-count').last().textContent()).toBe('2 marked parts')
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(d) a draft keeps its marks when the person opens another conversation and comes back', async () => {
    const { context, page } = await aWindow()
    const body = 'Keep this mark while I look elsewhere.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await selectInTheBox(page, 0, 'Keep this mark'.length)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'Keep this mark', wordsColour: 'green', flagColour: 'purple' }])
      // ANOTHER CONVERSATION, THEN BACK TO THIS ONE. The draft and the marks are this conversation's own.
      await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: otherAgentId })] as const)
      await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      await openTheMarker(page)
      await page.waitForFunction((words) => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === words, body, { timeout: 30_000 })
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'Keep this mark', wordsColour: 'green', flagColour: 'purple' }])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(e) No mark over a marked run takes that mark off and leaves the other part', async () => {
    const { context, page } = await aWindow()
    const body = 'First marked run. Second marked run.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await selectInTheBox(page, 0, 'First marked run.'.length)
      await chooseTheFlag(page, JUST_ASK)
      await selectInTheBox(page, 'First marked run. '.length, body.length)
      await chooseTheFlag(page, PLAN_FIRST)
      expect((await theMarksInTheBox(page)).length).toBe(2)
      await selectInTheBox(page, 0, 'First marked run.'.length)
      await chooseTheFlag(page, NO_MARK)
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'Second marked run.', wordsColour: 'red', flagColour: 'amber' }])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(g) with nothing selected the flag marks the whole message, as before', async () => {
    const { context, page } = await aWindow()
    const body = 'This whole message asks a question.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarksInTheBox(page)).toEqual([])
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
      const sent = (await theConversation(agentId)).find((one) => one.body === body) as { intent?: string; markedParts?: unknown } | undefined
      expect(sent?.intent).toBe('just-ask')
      expect(sent?.markedParts).toBeUndefined()
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(h) typing before a part moves it, and typing inside it drops it and says so', async () => {
    const { context, page } = await aWindow()
    const body = 'Keep this. Change that.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await selectInTheBox(page, 0, 'Keep this.'.length)
      await chooseTheFlag(page, JUST_ASK)
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'Keep this.', wordsColour: 'green', flagColour: 'purple' }])
      // TYPING BEFORE THE PART: its words stay marked, at their new place.
      await page.locator('.px-chat-write textarea').evaluate((el) => {
        ;(el as HTMLTextAreaElement).focus()
        ;(el as HTMLTextAreaElement).setSelectionRange(0, 0)
      })
      await page.locator('.px-chat-write textarea').pressSequentially('New ')
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe('New ' + body)
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'Keep this.', wordsColour: 'green', flagColour: 'purple' }])
      // TYPING INSIDE THE PART: it is dropped, and the line under the box names its words and its flag.
      const inside = ('New ' + body).indexOf('this') + 1
      await page.locator('.px-chat-write textarea').evaluate((el, at) => {
        ;(el as HTMLTextAreaElement).focus()
        ;(el as HTMLTextAreaElement).setSelectionRange(at as number, at as number)
      }, inside)
      await page.locator('.px-chat-write textarea').press('X')
      expect(await theMarksInTheBox(page)).toEqual([])
      expect(await page.locator('.px-chat-dropped-mark').textContent()).toContain('"Keep this."')
      expect(await page.locator('.px-chat-dropped-mark').textContent()).toContain(JUST_ASK)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(f) a refusal is said and the words and marks stay in the box', async () => {
    const { context, page } = await aWindow()
    const body = 'This run will be refused.'
    const refusal = 'A made-up refusal sentence for this test.'
    try {
      await page.fill('.px-chat-write textarea', body)
      await selectInTheBox(page, 0, 'This run'.length)
      await chooseTheFlag(page, JUST_ASK)
      await page.route('**/api/records', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: refusal, reason: refusal }) })
      })
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForSelector('.px-chat-send-failed', { timeout: 30_000 })
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe(body)
      expect(await theMarksInTheBox(page)).toEqual([{ words: 'This run', wordsColour: 'green', flagColour: 'purple' }])
    } finally {
      await page.unroute('**/api/records')
      await context.close()
    }
  }, 180_000)
})
