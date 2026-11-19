// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPEN CONVERSATION BETWEEN TWO AGENTS DRAWS A NEW MESSAGE WITHOUT A RELOAD.
 *
 * Problem 0g-GBzZAkfEk: the owner's page is sent every agent-to-agent message
 * live, and while the owner has such a conversation open, its new messages appear without a
 * reload. The conversation is drawn by one component in the corner panel and on the chat page
 * (#/chat), so both places are measured.
 *
 * WHAT THIS FILE DOES. In a test office with two made-up agents it opens their conversation, marks
 * the window so a reload would be seen, has one agent write to the other through the records door,
 * and waits up to eight seconds for the words to be drawn. The mark must still be there afterwards.
 * Eight seconds is well under the panel's thirty-second automatic read, so that read cannot pass
 * this test on its own.
 *
 * THE CONTROL is the first message, which is on screen before anything is sent: the conversation is
 * open and drawn. A message the two agents write about something else, to a third agent, must not be
 * drawn in it.
 *
 * Set W13Q_CHAT_LIVE_SHOTS to a folder to photograph the open conversation on the chat page at 1440,
 * 990, 660 and 390 in both looks and at 1440 in Chinese. The ordinary run takes no picture.
 *
 * MUTATION: in src/web/components/Chat.tsx, the handler `heard` stops reading the open conversation
 * between two agents again (`if (inIt) void readTheOpenPairAgain()` taken out). Both cases go red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function say(from: string, to: string, body: string, expected: number): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(from),
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: to }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(expected)
}

const FIRST = 'The hinge test is booked for Tuesday.'

beforeAll(async () => {
  app = await liveApp({ name: 'between-agents-live', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['welder-q', 'Welder Q'],
    ['tester-r', 'Tester R'],
    ['painter-s', 'Painter S'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
  // NOTHING HOLDS ANY OF THE THREE AGENTS IN THIS TEST OFFICE, so the office stores each message they write to each
  // other, routes it and answers 409 rather than 201; every message is stored all the same, and drawn.
  await say('welder-q', 'tester-r', FIRST, 409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

/** Open the conversation between Welder Q and Tester R inside the chat `within` names. */
async function openThePair(within: string): Promise<void> {
  if ((await app.page.$(`${within} .px-chat-back`)) !== null) await app.page.click(`${within} .px-chat-back`)
  await app.page.click(`${within} .px-chat-tab[data-tab="between"]`)
  const row = `${within} .px-chat-contact:has(.px-chat-name:has-text("Welder Q")):has(.px-chat-name:has-text("Tester R"))`
  await app.page.waitForSelector(row, { timeout: 20_000 })
  await app.page.click(row)
  await app.page.waitForSelector(`${within} .px-chat-side`, { timeout: 20_000 })
  // THE CONTROL: the conversation is open and draws what was already said.
  await app.page.waitForSelector(`${within} .px-chat-said:has-text("${FIRST}")`, { timeout: 20_000 })
}

/** Send one message between the pair and one elsewhere, then wait for the pair's to be drawn. */
async function aNewMessageAppears(within: string, words: string): Promise<void> {
  await app.page.evaluate(() => {
    ;(window as unknown as { notReloaded?: boolean }).notReloaded = true
  })
  const elsewhere = `${words} (to somebody else)`
  // NOTHING HOLDS EITHER ADDRESSEE, so both sends answer 409 and both messages are stored, as above.
  await say('tester-r', 'painter-s', elsewhere, 409)
  await say('tester-r', 'welder-q', words, 409)
  await app.page.waitForSelector(`${within} .px-chat-said:has-text("${words}")`, { timeout: 8_000 })
  expect(
    await app.page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded),
    'the page was reloaded, so this is not a live update',
  ).toBe(true)
  expect(await app.page.locator(`${within} .px-chat-said`).textContent()).not.toContain(elsewhere)
}

describe('an open conversation between two agents draws a new message by itself', () => {
  it('in the corner panel', async () => {
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 30_000)
    const corner = '.px-chat[data-where="corner"]'
    await openTheChatWindow(app.page)
    await app.page.waitForSelector(corner, { timeout: 20_000 })
    await openThePair(corner)
    await aNewMessageAppears(corner, 'The hinge held at 40 cycles.')
  }, 120_000)

  it('on the chat page', async () => {
    await app.page.goto(`${app.site}/#/chat`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const page = '.px-chat[data-where="page"]'
    await app.page.waitForSelector(page, { timeout: 20_000 })
    await openThePair(page)
    await aNewMessageAppears(page, 'The hinge held at 80 cycles.')
  }, 120_000)

  it('is photographed when a folder is named', async () => {
    const shots = process.env['W13Q_CHAT_LIVE_SHOTS']
    if (!shots) return
    mkdirSync(shots, { recursive: true })
    const page = '.px-chat[data-where="page"]'
    const takes: { lang: string | null; look: 'light' | 'dark'; width: number }[] = []
    for (const look of ['light', 'dark'] as const) for (const width of [1440, 990, 660, 390]) takes.push({ lang: null, look, width })
    takes.push({ lang: 'zh', look: 'light', width: 1440 }, { lang: 'zh', look: 'dark', width: 1440 })
    for (const take of takes) {
      await app.page.setViewportSize({ width: take.width, height: 900 })
      await app.page.goto(`${app.site}/`)
      await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), take.look)
      await app.page.goto(`${app.site}/${take.lang === null ? '' : `?lang=${take.lang}`}#/chat`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.waitForSelector(page, { timeout: 20_000 })
      await openThePair(page)
      await app.page.screenshot({ path: join(shots, `between-${take.lang ?? 'en'}-${take.look}-${String(take.width)}.png`) })
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 240_000)
})
