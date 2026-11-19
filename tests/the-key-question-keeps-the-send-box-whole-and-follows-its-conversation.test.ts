// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY QUESTION KEEPS THE SEND BOX WHOLE, AND BELONGS TO THE CONVERSATION IT WAS ASKED IN (problem wk1JsoK6mdGQ; the
 * check P5YYMgqy28Lu of wave 13w round 10).
 *
 * The chat asks once before it sends words that seem to hold a key (src/web/components/AKeyQuestion.tsx). The check found
 * two faults in that question:
 *   (a) at 660 pixels in the light look, with the question open, the bottom of the send box and its Send press were cut
 *       off by the bottom of the chat panel;
 *   (b) the question stayed open when the person opened another conversation, and Send anyway there sent the first
 *       conversation's words to the first contact.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   1. with the question open and a picture held, the whole send box, its Send press and the question's two presses lie
 *      inside the chat panel, at 1440, 660 and 390 pixels, in light;
 *      MUTATION: in src/web/components/PictureToSend.tsx, take out the line that lets the picture row give up height and
 *      scroll (".px-chat-attach { flex: 0 1 auto; min-height: 0; overflow-y: auto; }"). Red.
 *   2. opening another conversation hides the question; coming back shows it again while that draft still waits, and
 *      Send anyway then sends that conversation's words to that contact;
 *      MUTATION: in `useAKeyQuestion`, read the question of every draft as one (`questions[ONE_BOX]` for `belongsTo`).
 *      Red.
 *
 * PICTURES of the open question at 1440, 660 and 390, in light, in English, when W13W_KEY_QUESTION_SHOTS names a folder
 * (chapter 6).
 *
 * Every key-like piece is made up and put together when the test runs. The database and its pictures are in a folder this
 * file makes with mkdtemp and removes.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { png } from './checker-fixtures.ts'
import { theResizeIsDrawn, liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let first = ''
let second = ''
let ours = ''
let previousRoots: string | undefined

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A made-up run of 64 hexadecimal characters: the shape `longRun`. */
const PIECE = '0123456789abcdef'.repeat(4)

/** A real picture, made when the test runs, so what is sent is a picture and this file holds no long base64. */
const A_REAL_PNG = png({ width: 1, height: 1 })

/** Start an agent the person can write to, and give back its id. */
async function anAgent(handle: string, name: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle, name, runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  return said.agent!.id
}

/** Open the chat panel at the home page, if it is not open. */
async function openThePanel(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
}

/** Go from wherever the panel is to the conversation with one agent, without reloading the page. */
async function goTo(agentId: string): Promise<void> {
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** Every message the office holds in this project, as the person reads them. */
async function everyMessage(): Promise<{ body: string; to: { kind: string; id: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: { body: string; to: { kind: string; id: string }[] }[] }).messages
}

/** Wait until the office holds a message whose body holds `words`, and give it back. */
async function storedWith(words: string): Promise<{ body: string; to: { kind: string; id: string }[] }> {
  for (let tries = 0; tries < 80; tries++) {
    const found = (await everyMessage()).find((one) => one.body.includes(words))
    if (found !== undefined) return found
    await app.page.waitForTimeout(250)
  }
  throw new Error(`no message holding "${words}" was stored`)
}

/** The question, as it is drawn now. */
const question = () => app.page.locator('.px-key-question')

/** Where a thing is on the screen, or null when it is not drawn. */
async function boxOf(selector: string): Promise<{ top: number; bottom: number; left: number; right: number } | null> {
  const box = await app.page.locator(selector).first().boundingBox()
  return box === null ? null : { top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width }
}

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-key-question-place-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'key-question-place', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  first = await anAgent('key-question-first', 'Test Rowan')
  second = await anAgent('key-question-second', 'Test Wren')
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('the key question keeps the send box whole and follows its conversation', () => {
  it('keeps the whole send box and its Send press inside the panel at 1440, 660 and 390, in light', async () => {
    await openThePanel()
    await goTo(first)
    // A PICTURE HELD AS WELL, as in the check's picture: the tallest the foot of the panel gets with the question open.
    const name = '0123456789abcdef'.repeat(2) + '.png'
    await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
    await app.page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
    await app.page.fill('.px-chat-box', `Test: the picture and the key ${PIECE}`)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })

    const shots = process.env['W13W_KEY_QUESTION_SHOTS']
    if (shots) mkdirSync(shots, { recursive: true })
    const outside: string[] = []
    for (const width of [1440, 660, 390]) {
      for (const theme of ['light'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        await theResizeIsDrawn(app.page)
        expect(await question().isVisible(), `the question is open at ${String(width)} ${theme}`).toBe(true)
        if (shots) await app.page.screenshot({ path: `${shots}/key-question-en-${String(width)}-${theme}.png`, fullPage: false })
        const panel = await boxOf('.px-chat')
        expect(panel, `the panel is drawn at ${String(width)} ${theme}`).not.toBeNull()
        for (const part of ['.px-chat-write', '.px-chat-box', '.px-chat-send', '.px-key-question-send', '.px-key-question-change']) {
          const at = await boxOf(part)
          if (at === null) {
            outside.push(`${part} is not drawn at ${String(width)} ${theme}`)
            continue
          }
          // Half a pixel either way is rounding, not a cut.
          if (at.bottom > panel!.bottom + 0.5 || at.top < panel!.top - 0.5) {
            outside.push(`${part} runs from ${at.top.toFixed(1)} to ${at.bottom.toFixed(1)}, the panel from ${panel!.top.toFixed(1)} to ${panel!.bottom.toFixed(1)}, at ${String(width)} ${theme}`)
          }
        }
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    // The whole list goes in the message, so a red run says every place that was cut.
    expect(outside.length, `the send box, its Send press and the question's presses lie inside the panel:\n${outside.join('\n')}`).toBe(0)

    await question().locator('.px-key-question-change').click()
    await app.page.fill('.px-chat-box', '')
  }, 180_000)

  it('hides the question in another conversation, shows it again on coming back, and sends to the contact it was asked about', async () => {
    await openThePanel()
    await goTo(first)
    await app.page.fill('.px-chat-box', '')
    const words = `Test: for Rowan only, the key ${PIECE}`
    await app.page.fill('.px-chat-box', words)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })

    await goTo(second)
    expect(await app.page.inputValue('.px-chat-box'), "the second conversation's box holds its own draft").toBe('')
    expect(await question().count(), 'the question is not drawn in another conversation').toBe(0)

    await goTo(first)
    expect(await app.page.inputValue('.px-chat-box'), 'the first draft still waits').toBe(words)
    await question().waitFor({ timeout: 10_000 })
    await question().locator('.px-key-question-send').click()
    const stored = await storedWith('for Rowan only')
    expect(stored.body, 'the words are sent whole').toBe(words)
    expect(stored.to.map((one) => one.id), 'to the contact the question was asked about').toEqual([first])
    expect(await question().count(), 'Send anyway asks no second question').toBe(0)
  }, 180_000)
})
