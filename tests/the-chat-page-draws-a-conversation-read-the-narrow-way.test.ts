// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PAGE DRAWS A CONVERSATION READ THE NARROW WAY, AS IT DREW IT BEFORE.
 *
 * Round 33 of wave 13n made GET /api/messages/conversation and GET /api/messages/contacts read only
 * the messages and runs that concern the reader (tests/the-chat-reads-only-what-it-needs.test.ts
 * holds the counts). This file opens the chat in a real browser against a real server, with a
 * conversation of forty messages both ways, and checks that the panel draws the contact and the
 * newest message of the conversation.
 *
 * THE PICTURES. With `TEST_SHOTS` set, the last case keeps the contacts and the open conversation at
 * 1440, 990, 660 and 390 pixels wide, light and dark, in English and Chinese, so a person can see that nothing
 * changed for the reader. Without it, that case is skipped and the other cases run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Pictures are taken only when somebody asked to keep them; the other cases run either way. */
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('chat-read-the-narrow-way')

const AGENT = 'the-narrow-read-agent'
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT,
}
const THE_LAST_LINE = 'Line 39, the newest one, from the agent.'

let app: LiveApp

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text.slice(0, 300)).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return JSON.parse(text) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-read-the-narrow-way', viewport: { width: 1440, height: 1000 } })
  const made = await post('/api/agents/started', AS_THE_PERSON, { handle: AGENT, name: AGENT, workArea: ['src'] })
  const agentId = String((made['agent'] as { id?: string } | undefined)?.id ?? AGENT)
  for (let i = 0; i < 40; i += 1) {
    const last = i === 39
    if (i % 2 === 0) {
      await post('/api/records', AS_THE_PERSON, {
        kind: 'message',
        title: `line ${String(i)}`,
        data: { body: `Line ${String(i)} from the person.`, to: [{ kind: 'agent', id: agentId }] },
      })
    } else {
      await post('/api/records', AS_THE_AGENT, {
        kind: 'message',
        title: `line ${String(i)}`,
        data: { body: last ? THE_LAST_LINE : `Line ${String(i)} from the agent.`, to: [{ kind: 'person', id: THE_PERSON }] },
      })
    }
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page in one language and theme at one width, and open the chat's contacts. */
async function openTheContacts(language: 'en' | 'zh', width: number, theme: 'light' | 'dark'): Promise<void> {
  const page = app.page
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if ((await page.$('.px-chat')) === null) {
    await page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await page.click('.px-chat-circle')
  }
  await page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

/** Press the agent's contact row and wait for the newest line. */
async function openTheConversation(): Promise<void> {
  const page = app.page
  const row = page.locator('.px-chat-contact', { hasText: AGENT }).first()
  await row.click()
  await page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
  await page.locator('.px-chat-bubble', { hasText: THE_LAST_LINE }).first().waitFor({ timeout: 20_000 })
}

describe('the chat page, with a conversation of forty messages', () => {
  it('draws the agent as a contact and opens the conversation at its newest line', async () => {
    await openTheContacts('en', 1440, 'light')
    expect(await app.page.locator('.px-chat-contact', { hasText: AGENT }).count()).toBeGreaterThan(0)
    await openTheConversation()
    expect(await app.page.locator('.px-chat-bubble', { hasText: THE_LAST_LINE }).count()).toBe(1)
  }, 120_000)

  it.runIf(KEEP)('keeps pictures at 1440, 990, 660 and 390, light and dark, in English and Chinese', async () => {
    for (const language of ['en', 'zh'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          await openTheContacts(language, width, theme)
          expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
          await app.page.screenshot({ path: join(SHOTS, `contacts-${String(width)}-${theme}-${language}.png`) })
          await openTheConversation()
          await app.page.screenshot({ path: join(SHOTS, `conversation-${String(width)}-${theme}-${language}.png`) })
        }
      }
    }
  }, 600_000)
})
