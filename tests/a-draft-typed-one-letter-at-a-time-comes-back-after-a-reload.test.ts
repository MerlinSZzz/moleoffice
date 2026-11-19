// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAFT TYPED ONE LETTER AT A TIME COMES BACK WHOLE AFTER A RELOAD, in wave 13w
 * round 10.
 *
 * From round 41 of wave 13n to round 9 of wave 13w the chat kept no word still being written in session storage, and
 * left out every piece that looked like a key, so a reload lost them. The owner called that leaving-out redundant: a
 * person is asked once before a send instead.
 *
 * WHAT THIS FILE PROVES, in a real browser: words with a key-shaped piece, typed one letter at a time, are in session
 * storage as typed after every letter, and after a reload the box holds them whole.
 * MUTATION: `theDraftAsTheStoreKeepsIt` (src/web/lib/the-kept-chat-draft.ts) keeps the draft only up to its last space,
 * as the rule for a word still being written did. Red at the first letter of the piece.
 *
 * The piece is made up and put together when the test runs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_DRAFTS_KEY } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agentId = ''

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PIECE = '0123456789abcdef'.repeat(4)

/** Everything this page keeps in session storage under the chat's drafts, as written. */
async function theStoredDrafts(): Promise<string> {
  return app.page.evaluate((key) => window.sessionStorage.getItem(key) ?? '', CHAT_DRAFTS_KEY)
}

/** The chat panel at the agent's conversation. */
async function openTheConversation(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'key-typed-one-letter-at-a-time', viewport: { width: 1440, height: 1000 } })
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'letter-at-a-time-agent', name: 'Test Wren', runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  agentId = said.agent!.id
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a draft typed one letter at a time', () => {
  it('is in session storage as typed after every letter, and comes back whole after a reload', async () => {
    await openTheConversation()
    await app.page.click('.px-chat-box')
    const words = 'Test: the key is '
    await app.page.keyboard.type(words)
    for (const [at, letter] of Array.from(PIECE).entries()) {
      await app.page.keyboard.type(letter)
      const typed = words + PIECE.slice(0, at + 1)
      // THE STORE IS WRITTEN AT EVERY KEY PRESS; it holds what the box holds.
      expect(await theStoredDrafts(), `after letter ${at + 1} of ${PIECE.length}`).toContain(typed)
    }
    expect(await app.page.inputValue('.px-chat-box')).toBe(`${words}${PIECE}`)

    await app.page.reload()
    await openTheConversation()
    await app.page.waitForFunction((text) => (document.querySelector('.px-chat-box') as HTMLTextAreaElement | null)?.value === text, `${words}${PIECE}`, { timeout: 10_000 })
    await app.page.fill('.px-chat-box', '')
  }, 180_000)
})
