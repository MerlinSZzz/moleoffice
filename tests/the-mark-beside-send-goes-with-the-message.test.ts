// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK BESIDE SEND GOES WITH THE MESSAGE, IS SHOWN ON IT, AND "MARK BROKEN" IS THE PERSON'S.
 *
 * By a decision, as wave 13n round 48 proposed it and as it was approved, a button left of Send says what the agent may
 * do with the next message: No mark, Just ask or Proposal first. Round 49 put the mark on the
 * message record and built the "mark broken" door; this is the page. A third flag, Align, came later, and a fourth,
 * Give options, after it, so the menu now has five lines.
 *
 * WHAT IS PROVED HERE, in a real browser against a test office with its own database.
 *
 * 1. The keyboard path: Shift+Tab from Send reaches the button, which stands just left of Send in the row of presses
 *    under the box (wave 13y). Enter opens the menu at the line in force, the arrows move,
 *    Enter chooses and gives focus back to the box, and Escape closes the menu and gives focus back to the button.
 *    Space opens it too.
 * 2. The button sets the mark the server stores: "just-ask", then "none" for a message sent at No mark (the composer
 *    writes none, so the record keeps the difference from a message sent where no button was offered), then
 *    "proposal-first".
 * 3. After each send the button is back at No mark.
 * 4. A sent message shows its mark in its footer, and a message marked none shows nothing.
 * 5. "Mark broken" is on the agent's reply to a marked message and not on its reply to an unmarked one. Pressing it
 *    files the problem through round 49's door. A page read as the agent draws neither the press nor the button.
 * 6. In the corner window, Escape closes only the menu and gives focus back to the button; a second Escape closes the
 *    window.
 * 7. In the corner window at 390, the row the button stands in is whole while the messages above it scroll.
 *
 * Each was proved by mutation after a control run; the runs are in the commit that added this file.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { goKeeping, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'rowan-agent' }

const ASK = 'Why does the export take a minute on big projects?'
const PLAIN = 'And the import, is that slow as well?'
const PROPOSE = 'The export should run in the background. Show me how you would do it.'
const BUILT_IT = 'I moved the export to a background job and shipped it.'

/** The registry id the office gave the agent. */
let agentId = ''

async function post(url: string, headers: Record<string, string>, body: object): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  if (reply.status >= 300) throw new Error(`${url}: ${String(reply.status)} ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

interface Said {
  id: string
  body: string
  intent?: string
}

/** The conversation with the agent, as the person reads it through the chat's own door. */
async function theConversation(): Promise<Said[]> {
  const reply = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: OWNER })
  expect(reply.status).toBe(200)
  return ((await reply.json()) as { messages: Said[] }).messages
}

/** The stored mark of the message with these words, read off the record itself. */
async function theStoredMark(words: string): Promise<unknown> {
  const one = (await theConversation()).find((said) => said.body === words)
  if (one === undefined) throw new Error(`no message says "${words}"`)
  const reply = await fetch(`${app.api}/api/records/${one.id}`, { headers: OWNER })
  expect(reply.status).toBe(200)
  const record = ((await reply.json()) as { record: { data: Record<string, unknown> } }).record
  return Object.hasOwn(record.data, 'intent') ? record.data['intent'] : 'NO FIELD'
}

/** The one bubble that says these words. */
function theBubble(page: Page, words: string) {
  return page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: words }) })
}

async function openTheConversation(page: Page, contact: string): Promise<void> {
  await goKeeping(page, `${app.site}/?lang=en#/chat`)
  await waitForThePage(page, 60_000)
  await page.locator(`.px-chat-contact:has(.px-chat-name:text-is("${contact}"))`).click()
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

/** Open the corner window over the settings page, at Rowan's conversation. */
async function openRowanInTheCorner(page: Page): Promise<void> {
  await goKeeping(page, `${app.site}/?lang=en#/settings`)
  await waitForThePage(page, 60_000)
  // DESIGN D (wave 13y) DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so the window is opened the way the page offers it.
  await openTheChat(page)
  // THE WINDOW OPENS ON THE CONVERSATION LAST READ, OR ON THE LIST. Back to the list first, whichever it is.
  await page.waitForSelector('.px-chat-contact, .px-chat-write', { timeout: 30_000 })
  const back = page.locator('.px-chat-back')
  if (await back.isVisible()) await back.click()
  await page.locator('.px-chat-contact:has(.px-chat-name:text-is("Rowan Agent"))').click()
}

/** Type and send, and wait for the box to empty, which is the press having been taken. */
async function typeAndSend(page: Page, words: string): Promise<void> {
  await page.fill('.px-chat-write textarea', words)
  await page.click('.px-chat-send')
  await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, {
    timeout: 30_000,
  })
  await theBubble(page, words).first().waitFor({ timeout: 30_000 })
}

const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement
    return el === null ? '' : `${el.className}|${el.textContent ?? ''}`
  })

beforeAll(async () => {
  app = await liveApp({ name: 'mark-beside-send', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const started = await post('/api/agents/started', OWNER, { handle: 'rowan-agent', name: 'Rowan Agent', role: 'worker' })
  agentId = String((started['agent'] as { id?: string } | undefined)?.id ?? '')
  if (agentId === '') {
    const all = await fetch(`${app.api}/api/participants`, { headers: OWNER })
    agentId = ((await all.json()) as { agents: { id: string; handle: string }[] }).agents.find((one) => one.handle === 'rowan-agent')?.id ?? ''
  }
  expect(agentId).not.toBe('')
  await openTheConversation(app.page, 'Rowan Agent')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the button left of Send', () => {
  it('is reached by Shift+Tab from Send, opened by Enter or Space, moved by the arrows, chosen by Enter, closed by Escape', async () => {
    const page = app.page
    const button = page.locator('.px-chat-write .px-chat-intent')
    await expect(button.textContent()).resolves.toContain('No mark')
    await page.fill('.px-chat-write textarea', ASK)
    await page.focus('.px-chat-write .px-chat-send')
    await page.keyboard.press('Shift+Tab')
    expect(await focused(page)).toMatch(/^px-chat-intent\|No mark/)

    await page.keyboard.press('Enter')
    await page.waitForSelector('.px-menu[aria-label="What the agent may do"]', { timeout: 10_000 })
    // IT OPENS AT THE LINE IN FORCE, with that line ticked. No mark is the last line. The menu has five lines: the four
    // flags the office ships, in the order the code gives them, and then No mark.
    expect(await focused(page)).toContain('No mark')
    expect(await page.$$eval('.px-menu .px-menu-item', (all) => all.map((el) => el.getAttribute('aria-checked')))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'true',
    ])
    expect(await page.locator('.px-menu .px-menu-item .px-chat-intent-line-name').allTextContents()).toEqual([
      'Just ask',
      'Proposal first',
      'Align',
      'Give options',
      'No mark',
    ])
    await page.keyboard.press('ArrowDown')
    expect(await focused(page)).toContain('Just ask')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.px-menu', { state: 'detached', timeout: 10_000 })
    // A CHOICE GIVES THE FOCUS BACK TO THE BOX, so the person goes on writing where they were.
    expect(await page.evaluate(() => document.activeElement === document.querySelector('.px-chat-write textarea'))).toBe(true)
    expect(await button.getAttribute('data-chosen')).toBe('yes')
    expect(await button.getAttribute('aria-label')).toBe('What the agent may do: Just ask')

    // SPACE OPENS IT TOO, AND ESCAPE CLOSES IT WITHOUT CHANGING ANYTHING, focus back on the button. The button is
    // reached again the way it was first reached, by Shift+Tab from Send.
    await page.focus('.px-chat-write .px-chat-send')
    await page.keyboard.press('Shift+Tab')
    expect(await focused(page)).toMatch(/^px-chat-intent px-label-ink\|Just ask/)
    await page.keyboard.press(' ')
    await page.waitForSelector('.px-menu', { timeout: 10_000 })
    expect(await focused(page)).toContain('Just ask')
    await page.keyboard.press('ArrowDown')
    expect(await focused(page)).toContain('Proposal first')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.px-menu', { state: 'detached', timeout: 10_000 })
    expect(await focused(page)).toMatch(/^px-chat-intent px-label-ink\|Just ask/)
  }, 120_000)

  it('sends the mark the server stores, and is back at No mark after the send', async () => {
    const page = app.page
    const button = page.locator('.px-chat-write .px-chat-intent')
    await page.click('.px-chat-send')
    await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, {
      timeout: 30_000,
    })
    expect(await button.textContent()).toContain('No mark')
    expect(await button.getAttribute('data-chosen')).toBe('no')
    await expect.poll(() => theStoredMark(ASK), { timeout: 30_000 }).toBe('just-ask')

    // AT NO MARK THE COMPOSER STILL WRITES THE FIELD, as "none".
    await typeAndSend(page, PLAIN)
    await expect.poll(() => theStoredMark(PLAIN), { timeout: 30_000 }).toBe('none')

    // AND BY THE POINTER: open, choose Proposal first, send, and the button is back at No mark.
    await page.fill('.px-chat-write textarea', PROPOSE)
    await button.click()
    await page.locator('.px-menu .px-menu-item', { hasText: 'Proposal first' }).click()
    expect(await button.textContent()).toContain('Proposal first')
    await page.click('.px-chat-send')
    await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, {
      timeout: 30_000,
    })
    expect(await button.textContent()).toContain('No mark')
    await expect.poll(() => theStoredMark(PROPOSE), { timeout: 30_000 }).toBe('proposal-first')
  }, 120_000)
})

describe('a sent message', () => {
  it('shows its mark in its footer, and a message marked none shows nothing', async () => {
    const page = app.page
    await expect
      .poll(() => theBubble(page, ASK).locator('.px-chat-foot .px-chat-intent-mark').textContent(), { timeout: 30_000 })
      .toBe('Just ask')
    await expect
      .poll(() => theBubble(page, PROPOSE).locator('.px-chat-foot .px-chat-intent-mark').textContent(), { timeout: 30_000 })
      .toBe('Proposal first')
    expect(await theBubble(page, PLAIN).locator('.px-chat-intent-mark').count()).toBe(0)
  }, 60_000)
})

describe('"mark broken"', () => {
  let builtIt = ''

  beforeAll(async () => {
    // THE AGENT ANSWERS THE PROPOSAL-FIRST MESSAGE, the person's last, by building instead of proposing.
    const toPerson = { to: [{ kind: 'person', id: THE_PERSON }] }
    builtIt = String(
      ((await post('/api/records', AGENT, { kind: 'message', title: BUILT_IT, data: { body: BUILT_IT, ...toPerson } }))['record'] as {
        id: string
      }).id,
    )
  }, 60_000)

  it('is on the agent\'s reply to a marked message, and pressing it files the problem', async () => {
    const page = app.page
    const reply = theBubble(page, BUILT_IT)
    await reply.waitFor({ timeout: 30_000 })
    const press = reply.getByRole('button', { name: t('chat.intent.markBroken') })
    await expect.poll(() => press.count(), { timeout: 30_000 }).toBe(1)
    await press.click()
    await reply.locator('.px-chat-mark-broken-said[data-filed="yes"]').waitFor({ timeout: 30_000 })

    // THE DOOR FILED ONE PROBLEM ABOUT THIS REPLY AND THE PROPOSAL-FIRST MESSAGE.
    const problems = await fetch(`${app.api}/api/records?kind=problem&limit=25&shape=full`, { headers: OWNER })
    const held = (await problems.json()) as { records: { data: { extra?: { intentMarkBroken?: { reply?: string; intent?: string } } } }[] }
    const filed = held.records.filter((one) => one.data.extra?.intentMarkBroken?.reply === builtIt)
    expect(filed).toHaveLength(1)
    expect(filed[0]?.data.extra?.intentMarkBroken?.intent).toBe('proposal-first')
  }, 90_000)

  it('is not on a reply to an unmarked message', async () => {
    // THE SAME AGENT'S REPLY UNDER A NEW MESSAGE OF THE PERSON'S, SENT AT NO MARK.
    const page = app.page
    const again = 'One more thing: is the export log kept?'
    await typeAndSend(page, again)
    const answer = 'Yes, for thirty days.'
    await post('/api/records', AGENT, { kind: 'message', title: answer, data: { body: answer, to: [{ kind: 'person', id: THE_PERSON }] } })
    const reply = theBubble(page, answer)
    await reply.waitFor({ timeout: 30_000 })
    expect(await reply.locator('.px-chat-mark-broken').count()).toBe(0)
    // AND THE EARLIER REPLY STILL CARRIES ITS PRESS'S ANSWER, so the absence above is not the page drawing no presses.
    expect(await theBubble(page, BUILT_IT).locator('.px-chat-mark-broken-said').count()).toBe(1)
  }, 90_000)

  it('is not drawn for a page read as the agent, and neither is the button', async () => {
    const page = await app.context.newPage()
    try {
      await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
      await page.evaluate(() => {
        localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'rowan-agent' }))
      })
      await goKeeping(page, `${app.site}/?lang=en#/chat`)
      await waitForThePage(page, 60_000)
      await page.locator('.px-chat-contact').first().click()
      await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      await theBubble(page, BUILT_IT).waitFor({ timeout: 30_000 })
      // THE MARKED MESSAGE IS THERE, WITH ITS MARK, so this page did read the conversation the press would be in.
      await theBubble(page, PROPOSE).locator('.px-chat-intent-mark').waitFor({ timeout: 30_000 })
      expect(await page.locator('.px-chat-mark-broken, .px-chat-mark-broken-said').count()).toBe(0)
      expect(await page.locator('.px-chat-intent').count()).toBe(0)
    } finally {
      await page.evaluate(() => {
        localStorage.removeItem('mole-office.actor')
      })
      await page.close()
    }
  }, 120_000)
})

describe('the button in the corner window', () => {
  it('closes only its menu on Escape and gives focus back; a second Escape closes the window', async () => {
    // THE CORNER WINDOW CLOSES ON ESCAPE FROM ANYWHERE ON THE PAGE. An Escape the menu has already taken must not
    // close it as well, or the person loses the window, the conversation and what they were writing.
    const page = await app.context.newPage()
    try {
      await openRowanInTheCorner(page)
      // THE BUTTON STANDS IN THE ROW OF PRESSES UNDER THE BOX, left of Send, in the corner window as beside the page.
      const button = page.locator('.px-chat-presses .px-chat-intent')
      await button.waitFor({ timeout: 30_000 })
      await page.fill('.px-chat-write textarea', 'Kept while the menu closes')
      await button.click()
      await page.waitForSelector('.px-menu', { timeout: 10_000 })
      await page.keyboard.press('Escape')
      await page.waitForSelector('.px-menu', { state: 'detached', timeout: 10_000 })
      expect(await page.locator('.px-chat-write textarea').inputValue()).toBe('Kept while the menu closes')
      expect(await focused(page)).toMatch(/^px-chat-intent\|No mark/)
      // AND ESCAPE STILL CLOSES THE WINDOW when nothing inside it has taken the press.
      await page.keyboard.press('Escape')
      await page.waitForSelector('.px-chat-write', { state: 'detached', timeout: 10_000 })
    } finally {
      await page.close()
    }
  }, 120_000)

  it('is whole at a phone\'s width, in the row of presses left of Send, while the messages above it scroll', async () => {
    // THE CORNER WINDOW AT 390 HAS NO SET HEIGHT, ONLY A CAP. The message list must give up the height, not the row the
    // button stands in: that row was cut short by a quarter, and the button with it.
    const page = await app.context.newPage()
    try {
      await page.setViewportSize({ width: 390, height: 900 })
      await openRowanInTheCorner(page)
      await page.locator('.px-chat-presses .px-chat-intent').waitFor({ timeout: 30_000 })
      // IN THE LIST, NOT NECESSARILY IN VIEW: the list opens scrolled to its newest message.
      await theBubble(page, BUILT_IT).waitFor({ state: 'attached', timeout: 30_000 })
      const seen = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
        const list = document.querySelector('.px-chat-said')!
        const row = document.querySelector('.px-chat-presses')!
        const [r, b, send] = [box('.px-chat-presses'), box('.px-chat-presses .px-chat-intent'), box('.px-chat-presses .px-chat-send')]
        return {
          listScrolls: list.scrollHeight > list.clientHeight,
          rowCut: row.scrollHeight - row.clientHeight,
          buttonInside: b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5,
          leftOfSend: b.right <= send.left + 0.5,
        }
      })
      expect(seen).toEqual({ listScrolls: true, rowCut: 0, buttonInside: true, leftOfSend: true })
    } finally {
      await page.close()
    }
  }, 120_000)
})
