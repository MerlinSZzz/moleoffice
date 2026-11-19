// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SEND ANYWAY SENDS WHAT WAS HELD WHEN THE KEY QUESTION WAS ASKED, OR NOTHING (found by the check of wave 13w round 11,
 * in message SxOEtUS4QV5B; no problem was filed for it).
 *
 * The chat asks once before it sends words that seem to hold a key (src/web/components/AKeyQuestion.tsx). The pictures
 * waiting to go are one row for the whole panel, so a picture added in another conversation is in the asked draft too.
 * Until round 12, Send anyway pressed after that sent the pictures held at the asking, and then cleared the row, so the
 * newer picture was dropped unsent.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   1. with the question open, a picture added in another conversation changes the asked draft; Send anyway then sends
 *      nothing, the question stays with one line saying what changed (since round 13, "The box now holds 2 pictures"),
 *      and the words and both pictures stay unsent;
 *   2. Send pressed then asks about the newer draft, and Send anyway sends its words and both pictures;
 *   3. with nothing changed, Send anyway sends the words and exactly the picture held at the asking.
 *   MUTATION: in `useAKeyQuestion`, Send anyway skips its comparison and sends what was held. Red on 1 and 2.
 *
 * PICTURES of the question with its changed line at 1440, 990, 660 and 390, light and dark, in English, when
 * W13W_SEND_ANYWAY_SHOTS names a folder (chapter 6).
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
import { liveApp, type LiveApp } from './helpers.ts'
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

interface Stored {
  body: string
  to: { kind: string; id: string }[]
  pictures: { alt: string }[]
}

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

/** Add one picture to the row, by its file name, and wait until the row holds `count`. */
async function addAPicture(name: string, count: number): Promise<void> {
  await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
  await app.page.waitForFunction((n) => document.querySelectorAll('.px-chat-attach-held').length === n, count, { timeout: 15_000 })
}

/** Every message the office holds in this project, as the person reads them. */
async function everyMessage(): Promise<Stored[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: Stored[] }).messages
}

/** Wait until the office holds a message whose body holds `words`, and give it back. */
async function storedWith(words: string): Promise<Stored> {
  for (let tries = 0; tries < 80; tries++) {
    const found = (await everyMessage()).find((one) => one.body.includes(words))
    if (found !== undefined) return found
    await app.page.waitForTimeout(250)
  }
  throw new Error(`no message holding "${words}" was stored`)
}

/** The question, as it is drawn now. */
const question = () => app.page.locator('.px-key-question')

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-send-anyway-held-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'send-anyway-held', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  first = await anAgent('send-anyway-first', 'Test Rowan')
  second = await anAgent('send-anyway-second', 'Test Wren')
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('Send anyway sends what was held when the key question was asked', () => {
  const words = `Test: the changed draft, the key ${PIECE}`

  it('sends nothing and says so when a picture was added in another conversation after the asking', async () => {
    await openThePanel()
    await goTo(first)
    await addAPicture('asked-shot.png', 1)
    await app.page.fill('.px-chat-box', words)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })

    // THE DRAFT CHANGES BETWEEN THE QUESTION AND THE PRESS: the picture row is the panel's, so this is in the first draft.
    await goTo(second)
    await addAPicture('newer-shot.png', 2)
    await goTo(first)
    await question().waitFor({ timeout: 10_000 })
    expect(await question().locator('.px-key-question-changed').count(), 'no line before the press').toBe(0)

    await question().locator('.px-key-question-send').click()
    await question().locator('.px-key-question-changed').waitFor({ timeout: 10_000 })
    expect(await question().locator('.px-key-question-changed').innerText(), 'one line says what changed').toBe(
      'The message changed after this question was asked, so nothing was sent. The box now holds 2 pictures.',
    )
    // A send would reach the office within this; the round 11 send did in well under a second.
    await app.page.waitForTimeout(2_000)
    expect((await everyMessage()).filter((one) => one.body.includes('the changed draft')), 'nothing was sent').toEqual([])
    expect(await app.page.inputValue('.px-chat-box'), 'the words stay in the box').toBe(words)
    expect(await app.page.locator('.px-chat-attach-held').count(), 'both pictures stay in the row').toBe(2)

    const shots = process.env['W13W_SEND_ANYWAY_SHOTS']
    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(200)
          await app.page.screenshot({ path: `${shots}/send-anyway-changed-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }
  }, 180_000)

  it('asks again about the newer draft on Send, and Send anyway then sends its words and both pictures', async () => {
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })
    expect(await question().locator('.px-key-question-changed').count(), 'a new asking has no changed line').toBe(0)
    await question().locator('.px-key-question-send').click()
    const stored = await storedWith('the changed draft')
    expect(stored.body, 'the words are sent whole').toBe(words)
    expect(stored.to.map((one) => one.id), 'to the contact the question was asked about').toEqual([first])
    expect(stored.pictures.map((one) => one.alt), 'with both pictures, in the order they were chosen').toEqual(['asked-shot.png', 'newer-shot.png'])
    expect(await question().count(), 'the question is closed').toBe(0)
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 0, undefined, { timeout: 15_000 })
  }, 180_000)

  it('sends the words and exactly the picture held at the asking when nothing changed', async () => {
    const same = `Test: the same draft, the key ${PIECE}`
    await addAPicture('only-shot.png', 1)
    await app.page.fill('.px-chat-box', same)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })
    await question().locator('.px-key-question-send').click()
    const stored = await storedWith('the same draft')
    expect(stored.body).toBe(same)
    expect(stored.pictures.map((one) => one.alt), 'exactly the picture held at the asking').toEqual(['only-shot.png'])
    expect(await question().count(), 'Send anyway asks no second question').toBe(0)
  }, 180_000)
})
