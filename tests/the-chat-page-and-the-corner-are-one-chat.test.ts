// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PAGE AND THE CORNER PANEL ARE ONE CHAT.
 *
 * Plan row C1: the sidebar's Chat opens a full chat page, and the corner panel and the page show the
 * same conversations. Both are drawn by one component from the same doors, so
 * a message sent in one is in the other. The corner is not drawn on the chat page, because the page
 * is the chat already.
 *
 * WHAT THIS FILE DOES. In a test office with a made-up agent it sends a message from the corner panel
 * on Home, presses the sidebar's Chat, and reads the page: the corner is gone, and the conversation
 * holds the message. It sends a second message from the page, goes back to Home, and reads the corner
 * panel: the second message is there. It also checks that the page draws a pointed message's quote
 * and gives each message its own target, the same as the corner.
 *
 * Set CHAT_PAGE_SHOTS to a folder to photograph the page at 1440, 990, 660 and 390 in both looks,
 * at 1440 in Chinese and at 1440 in the test language. The ordinary run takes no picture.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat, openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const FROM_THE_CORNER = 'Sent from the corner, about the gripper.'
const FROM_THE_PAGE = 'Sent from the page, about the camera.'
const POINTED_WORDS = 'the camera lost focus at noon'
const POINTING_SAYS = 'This is the part I mean.'

let recordId = ''
let pointedId = ''

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** Write in the open conversation's box and press Send, inside whichever chat `within` names. */
async function sendIn(within: string, words: string): Promise<void> {
  await app.page.locator(`${within} textarea.px-chat-box`).fill(words)
  await app.page.locator(`${within} .px-chat-send`).last().click()
  await app.page.waitForSelector(`${within} .px-chat-words:has-text("${words}")`, { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-page', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Page Agent',
    data: { handle: 'page-agent', runtime: 'claude-code', state: 'active' },
  })
  recordId = await file(AS_THE_OWNER, {
    kind: 'note',
    title: 'Camera bench notes',
    data: { body: 'At noon the camera lost focus at noon and came back after a minute.' },
  })
  pointedId = await file(
    { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'page-agent' },
    {
      kind: 'message',
      title: POINTING_SAYS,
      data: {
        body: POINTING_SAYS,
        to: [{ kind: 'person', id: THE_PERSON }],
        target: {
          target: { kind: 'record', recordId, workspaceId: 'default' },
          place: { at: 'quote', words: POINTED_WORDS },
        },
      },
    },
  )
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a message sent in one shows in the other', () => {
  it('a message sent in the corner is on the chat page', async () => {
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 30_000)
    await openTheChatWindow(app.page)
    await app.page.waitForSelector('.px-chat[data-where="corner"] .px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat[data-where="corner"] .px-chat-contact:has(.px-chat-name:text-is("Page Agent"))')
    await sendIn('.px-chat[data-where="corner"]', FROM_THE_CORNER)

    // THE CHAT PAGE, by its address. Design D's sidebar row opens the split rather than this page, so the page is
    // reached the way the address still reaches it.
    await app.page.goto(`${app.site}/#/chat`)
    await app.page.waitForSelector('.px-chat[data-where="page"]', { timeout: 20_000 })
    expect(await app.page.evaluate(() => window.location.hash)).toBe('#/chat')
    expect(await app.page.$('.px-chat-circle'), 'the corner is still drawn over the chat page').toBeNull()
    expect(await app.page.$('.px-chat[data-where="corner"]'), 'the corner panel is still drawn over the chat page').toBeNull()

    // THE PAGE OPENS ON THE CONVERSATION THE CORNER HAD OPEN, which it remembers the same way.
    const page = '.px-chat[data-where="page"]'
    if ((await app.page.$(`${page} .px-chat-said`)) === null) {
      await app.page.click(`${page} .px-chat-contact:has(.px-chat-name:text-is("Page Agent"))`)
    }
    await app.page.waitForSelector(`${page} .px-chat-words:has-text("${FROM_THE_CORNER}")`, { timeout: 20_000 })
    // AND THE LISTS STAY BESIDE IT at this width.
    expect(await app.page.isVisible(`${page} .px-chat-page-lists .px-chat-tabs`)).toBe(true)
  }, 120_000)

  it('a message sent on the page is in the chat beside it', async () => {
    await sendIn('.px-chat[data-where="page"]', FROM_THE_PAGE)
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 30_000)
    // THE CHAT PAGE IS PUT AWAY BEFORE THE SPLIT OPENS, or the helper would find it still drawn and do nothing.
    await app.page.waitForSelector('.px-chat[data-where="page"]', { state: 'detached', timeout: 20_000 })
    await openTheChat(app.page)
    const beside = '.px-chat[data-where="split"]'
    // THE FIRST CASE LEFT THE WINDOW OPEN, and the browser remembers it; the sidebar's row is how a person puts the
    // chat beside the page from the window, so the test presses it when the split is not already drawn.
    if ((await app.page.locator(beside).count()) === 0) await app.page.click('.shell-side .shell-chat')
    await app.page.waitForSelector(beside, { timeout: 20_000 })
    if ((await app.page.$(`${beside} .px-chat-said`)) === null) {
      await app.page.click(`${beside} .px-chat-contact:has(.px-chat-name:text-is("Page Agent"))`)
    }
    await app.page.waitForSelector(`${beside} .px-chat-words:has-text("${FROM_THE_PAGE}")`, { timeout: 20_000 })
  }, 120_000)
})

describe('the page draws each message as the corner does', () => {
  it('draws a pointed message’s quote and gives each message its own target', async () => {
    await app.page.goto(`${app.site}/#/chat`)
    await waitForThePage(app.page, 30_000)
    const page = '.px-chat[data-where="page"]'
    await app.page.waitForSelector(`${page} .px-chat-words:has-text("${POINTING_SAYS}")`, { timeout: 20_000 })
    const bubble = `${page} .px-chat-one:has(.px-chat-words:has-text("${POINTING_SAYS}"))`
    await app.page.locator(`${bubble} .px-chat-quote-name:has-text("Camera bench notes")`).waitFor({ timeout: 20_000 })
    const seen = await app.page.$eval(bubble, (row) => ({
      target: row.getAttribute('data-target'),
      words: row.querySelector('.px-chat-quote-words')?.textContent ?? '',
      link: row.querySelector('.px-chat-quote a')?.getAttribute('href') ?? '',
    }))
    // A MESSAGE'S OWN TARGET NAMES WHERE IT IS KEPT, the message centre.
    expect(seen.target).toBe(`record/${pointedId}/message-centre`)
    expect(seen.words).toBe(POINTED_WORDS)
    expect(seen.link).toBe(`#/r/${recordId}`)
  }, 120_000)
})

describe('pictures, only when asked', () => {
  it('photographs the chat page at four widths, in both looks, in Chinese and in the test language', async () => {
    const shots = process.env['CHAT_PAGE_SHOTS']
    if (!shots) return
    mkdirSync(shots, { recursive: true })
    const takes: { width: number; theme: 'light' | 'dark'; lang: string | null }[] = []
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) takes.push({ width, theme, lang: null })
    }
    takes.push({ width: 1440, theme: 'light', lang: 'zh' }, { width: 1440, theme: 'light', lang: 'xx' })
    for (const take of takes) {
      await app.page.setViewportSize({ width: take.width, height: 1000 })
      await app.page.evaluate((theme) => {
        localStorage.setItem('mole-office.preset.theme', theme)
      }, take.theme)
      // A GOTO THAT CHANGES ONLY THE HASH DOES NOT LOAD THE PAGE AGAIN, so the reload is what makes
      // the stored look count.
      await app.page.goto(`${app.site}/${take.lang === null ? '' : `?lang=${take.lang}`}#/chat`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.waitForSelector('.px-chat[data-where="page"] .px-chat-words', { timeout: 20_000 })
      await app.page.waitForTimeout(400)
      const name = `chat-page-${String(take.width)}-${take.theme}${take.lang === null ? '' : `-${take.lang}`}.png`
      await app.page.screenshot({ path: `${shots}/${name}` })
      // AND AT THE NARROW WIDTH, THE LISTS, which that width shows instead of the conversation.
      if (take.width === 390) {
        await app.page.click('.px-chat[data-where="page"] .px-chat-back')
        await app.page.waitForSelector('.px-chat[data-where="page"] .px-chat-tabs', { timeout: 20_000 })
        await app.page.screenshot({ path: `${shots}/chat-page-390-${take.theme}-lists.png` })
        await app.page.click('.px-chat[data-where="page"] .px-chat-contact:has(.px-chat-name:text-is("Page Agent"))')
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 300_000)
})
