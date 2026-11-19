// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BETWEEN-AGENTS LIST'S PREVIEW SPEAKS THE PAGE'S LANGUAGE (round 41 of wave 13n).
 *
 * The opened conversation words a line Mole Office wrote from its facts in the page's language (`theWordsOfAnOfficeLine`
 * in src/shared/dead-letter-lines.ts). The row in the "between agents" list drew the same message's body as stored, so
 * on a Chinese page the row said English and the conversation it opened said Chinese.
 *
 * WHAT THIS FILE PROVES, in a real browser against the real doors: starting an agent writes an office line to it, so
 * the list holds a conversation between that agent and Mole Office whose last line is the office's. On an English page
 * and on a Chinese page, the row's preview is the words the opened conversation draws for that line. On the Chinese
 * page those words are not the stored English body, which is what shows the line was worded at all.
 * MUTATION: the row draws `one.last.body` again in src/web/components/Chat.tsx. The Chinese case goes red.
 *
 * Everybody here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agentId = ''
const AGENT_NAME = 'Test Linnet'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The last line of the agent's conversation with Mole Office, as the office stores it. */
async function theStoredLastLine(): Promise<string> {
  const reply = await fetch(`${app.api}/api/messages/between/${agentId}~${moleOffice().id}`, { headers: AS_THE_OWNER })
  expect(reply.status).toBe(200)
  const said = (await reply.json()) as { messages: { body: string }[] }
  const last = said.messages[said.messages.length - 1]
  expect(last, 'the conversation holds the office line').toBeDefined()
  return last!.body
}

/** The row's preview, and the words the opened conversation draws for its last line, on a page in this language. */
async function thePreviewAndTheOpenedLine(lang: 'en' | 'zh'): Promise<{ preview: string; opened: string }> {
  await app.page.goto(`${app.site}/?lang=${lang}#/`)
  await app.page.reload()
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="between"]')
  const row = app.page.locator('.px-chat-list .px-chat-contact').filter({ hasText: AGENT_NAME }).first()
  await row.waitFor({ timeout: 20_000 })
  const preview = (await row.locator('.px-chat-last').innerText()).trim()
  await row.click()
  await app.page.waitForSelector('.px-chat-system .px-chat-system-block', { timeout: 20_000 })
  const lines = await app.page.locator('.px-chat-system .px-chat-system-block').allInnerTexts()
  return { preview, opened: (lines[lines.length - 1] ?? '').trim() }
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-agents-preview-language', viewport: { width: 1440, height: 1000 } })
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'preview-linnet', name: AGENT_NAME, runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  agentId = said.agent!.id
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe("the between-agents list's preview speaks the page's language", () => {
  it('draws, on an English page, the words the opened conversation draws', async () => {
    const seen = await thePreviewAndTheOpenedLine('en')
    expect(seen.opened, 'the opened conversation draws the office line').not.toBe('')
    expect(seen.preview).toBe(seen.opened)
  }, 120_000)

  it('draws, on a Chinese page, the words the opened conversation draws, and not the stored English', async () => {
    const stored = await theStoredLastLine()
    const seen = await thePreviewAndTheOpenedLine('zh')
    expect(seen.opened, 'the opened conversation words the office line in Chinese').not.toBe(stored)
    expect(seen.preview).toBe(seen.opened)
  }, 120_000)
})
