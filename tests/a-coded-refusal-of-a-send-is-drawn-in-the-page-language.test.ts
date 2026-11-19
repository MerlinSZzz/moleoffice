// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODED REFUSAL OF A SEND IS DRAWN IN THE PAGE'S LANGUAGE (wave 13w round 1, message -nhGaqgbMM0M).
 *
 * When the server refuses a send, the chat draws a short line under the failed letter. It drew the server's English
 * `reason` even when the refusal carried a code, so a Chinese page said it in English. Now a coded refusal is drawn
 * from the word lists, `server.<code>`, as ErrorNote draws one. A refusal with no code is drawn as before, the server's
 * own reason. The whole sentence on the red mark's hover is the server's in both cases.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · on a Chinese page, a send refused with the code `recordNotFound` draws `chat.sendError` around the Chinese
 *     `server.recordNotFound`, and keeps the English sentence on hover.
 *     MUTATION: in attemptSend in src/web/components/Chat.tsx, set `shortReason` back to `fault?.reason ?? null`.
 *     The line is then the English reason, and this case goes red.
 *   · on the same page, a send refused with no code draws `chat.sendError` around the server's English reason.
 *
 * WHY THE REFUSAL IS ANSWERED IN THE BROWSER. When this was written, no refusal a chat send could meet carried a code.
 * One did from wave 13w round 2 to round 10, a message that seemed to hold a key; that message is now stored with a
 * reminder. The test still answers
 * the one send request itself, with Playwright, so that it measures only the drawing, in the shape
 * every refusal of the server has (`error`, `reason`, `code`, `values`), with the headers of a
 * real reply of the same server, and lets every other request reach the real API. What is tested is how the chat draws the answer, which is the line that changed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agentId = ''

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const ENGLISH_ERROR = 'Test: the server refused this send, in its own English sentence.'
const ENGLISH_REASON = 'Test: the server refused this send.'

/** Answer the send of one body with a refusal, and pass every other request to the real API. */
async function refuseTheSendOf(body: string, coded: boolean): Promise<void> {
  await app.page.route('**/api/records', async (route: Route) => {
    const request = route.request()
    if (request.method() !== 'POST' || !(request.postData() ?? '').includes(body)) return route.fallback()
    const refusal: Record<string, unknown> = { error: ENGLISH_ERROR, reason: ENGLISH_REASON }
    if (coded) Object.assign(refusal, { code: 'recordNotFound', values: {} })
    // THE SERVER'S OWN HEADERS, from a harmless read of the same server: the page reads the world header and the
    // browser lets it read only what the server's cross-origin headers allow, so a reply without them is another server's.
    const real = await route.fetch({ method: 'GET', url: `${app.api}/api`, postData: '' })
    return route.fulfill({ response: real, status: 400, contentType: 'application/json', body: JSON.stringify(refusal) })
  })
}

/** The chat panel at the agent's conversation, on a page in one language. */
async function openTheConversation(lang: 'en' | 'zh'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${lang}#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** Type one body, press Send, and give back the failed letter's bubble. */
async function sendAndFail(body: string) {
  await app.page.fill('.px-chat-box', body)
  await app.page.click('.px-chat-send')
  const bubble = app.page.locator('.px-chat-one').filter({ hasText: body }).first()
  await bubble.locator('.px-chat-send-failed-why').waitFor({ timeout: 20_000 })
  return bubble
}

/** The chat spaces a Chinese line where it meets Latin letters; the words are what is compared. */
const unspaced = (text: string | null): string => (text ?? '').replace(/\s+/g, '')

beforeAll(async () => {
  app = await liveApp({ name: 'coded-send-refusal', viewport: { width: 1440, height: 1000 } })
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'coded-refusal-agent', name: 'Test Birch', runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  agentId = said.agent!.id
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a refused send says why in the page language', () => {
  it('draws a coded refusal from the Chinese word list, and keeps the English on hover', async () => {
    const body = 'Test: a letter refused with a code'
    await refuseTheSendOf(body, true)
    await openTheConversation('zh')
    const bubble = await sendAndFail(body)
    expect(unspaced(await bubble.locator('.px-chat-send-failed-why').textContent())).toBe(
      unspaced(zh['chat.sendError'].replace('{reason}', zh['server.recordNotFound'])),
    )
    expect(await bubble.locator('.px-chat-mark[data-shape="failed"]').getAttribute('title')).toBe(ENGLISH_ERROR)
  }, 120_000)

  it('draws a refusal with no code as the server wrote its reason', async () => {
    const body = 'Test: a letter refused without a code'
    await refuseTheSendOf(body, false)
    await openTheConversation('zh')
    const bubble = await sendAndFail(body)
    expect(unspaced(await bubble.locator('.px-chat-send-failed-why').textContent())).toBe(
      unspaced(zh['chat.sendError'].replace('{reason}', ENGLISH_REASON)),
    )
  }, 120_000)
})

/**
 * THE REFUSED LETTER, LOOKED AT — chapter 6: four widths, both themes, and here both languages. Gated: a run that is
 * not asked for pictures takes none.
 */
describe('the refused letter is looked at', () => {
  it.skipIf(!process.env['W13W_CODED_SEND_SHOTS'])(
    'photographs the conversation at 1440, 990, 660 and 390, light and dark, in English and Chinese',
    async () => {
      const shots = process.env['W13W_CODED_SEND_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      for (const lang of ['en', 'zh'] as const) {
        const body = `Test: a letter refused with a code, drawn in ${lang}`
        await refuseTheSendOf(body, true)
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await openTheConversation(lang)
        const bubble = await sendAndFail(body)
        const words = lang === 'en' ? en : zh
        // THE LINE IS REALLY THE CODED ONE, so a picture of the English reason cannot pass for it.
        expect(unspaced(await bubble.locator('.px-chat-send-failed-why').textContent())).toBe(
          unspaced(words['chat.sendError'].replace('{reason}', words['server.recordNotFound'])),
        )
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await app.page.waitForTimeout(150)
            await app.page.screenshot({ path: `${shots}/coded-send-refusal-${lang}-${String(width)}-${theme}.png`, fullPage: false })
          }
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
