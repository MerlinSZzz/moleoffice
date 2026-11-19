// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON IS ASKED ONCE BEFORE WHAT LOOKS LIKE A KEY IS SENT, AND THE WORDS ARE THEN SENT WHOLE. Two decisions
 * and problems __4iR4FkFAGS and UioLZafhORc4.
 *
 * Until wave 13w round 10 the office refused a message whose words seemed to hold a key, the chat offered Edit on the
 * refused letter, and the browser kept its draft with the piece left out. Now the office stores the message
 * and only reminds, and a person on a page is asked once, before the send: the question names what was seen, the piece's
 * first four characters and its length, and offers Send anyway and Change it (src/web/components/AKeyQuestion.tsx).
 *
 * WHAT THIS FILE PROVES, against the real records door, in a real browser:
 *   1. the draft is kept in session storage whole, the piece included;
 *      MUTATION: `theDraftAsTheStoreKeepsIt` in src/web/lib/the-kept-chat-draft.ts leaves out what `whatLooksLikeASecret`
 *      finds. Red.
 *   2. Send on words that hold a piece that looks like a key draws the question and sends nothing; Send anyway sends
 *      the words with no second question, and the office holds them whole;
 *      MUTATION: in `send` in src/web/components/Chat.tsx, ask whatever `askedAboutAKey` says. Send anyway then asks
 *      again, nothing is stored, and this goes red.
 *   3. Change it closes the question, sends nothing, and selects the piece in the box;
 *   4. words with an agent's run names, written split here, are sent at once with no question;
 *   5. a picture whose file name is 32 hexadecimal characters, as QQ names one, is asked about once as the picture's
 *      name, and Send anyway sends it with that name as its alt text (problem UioLZafhORc4).
 *
 * PICTURES of the question at 1440, 990, 660 and 390, light and dark, in English, when W13W_KEY_QUESTION_SHOTS names a
 * folder (chapter 6).
 *
 * Every key-like piece is made up and put together when the test runs. The database and its pictures are in a folder
 * this file makes with mkdtemp and removes.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { png } from './checker-fixtures.ts'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_DRAFTS_KEY } from '../src/shared/messages.ts'
import { en } from '../src/shared/words/en.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agentId = ''
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

/** The chat panel at the agent's conversation, with an empty box and no picture held. */
async function openTheConversation(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
  await app.page.fill('.px-chat-box', '')
}

/** Everything this page keeps in session storage under the chat's drafts, as written. */
async function theStoredDrafts(): Promise<string> {
  return app.page.evaluate((key) => window.sessionStorage.getItem(key) ?? '', CHAT_DRAFTS_KEY)
}

/** Every message the office holds in this project, as the person reads them. */
async function everyMessage(): Promise<{ body: string; pictures?: { alt: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: { body: string; pictures?: { alt: string }[] }[] }).messages
}

/** The question, as it is drawn now. */
const question = () => app.page.locator('.px-key-question')

/** Wait until the office holds a message whose body holds `words`, and give it back. */
async function storedWith(words: string): Promise<{ body: string; pictures?: { alt: string }[] }> {
  for (let tries = 0; tries < 80; tries++) {
    const found = (await everyMessage()).find((one) => one.body.includes(words))
    if (found !== undefined) return found
    await app.page.waitForTimeout(250)
  }
  throw new Error(`no message holding "${words}" was stored`)
}

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-key-question-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'key-question', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'key-question-agent', name: 'Test Rowan', runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  agentId = said.agent!.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('a person is asked once before what looks like a key is sent', () => {
  it('keeps the draft in session storage whole, the piece included', async () => {
    await openTheConversation()
    const body = `Test: the draft key is ${PIECE} and nothing else`
    await app.page.fill('.px-chat-box', body)
    await app.page.waitForFunction(
      ([key, piece]) => (window.sessionStorage.getItem(key) ?? '').includes(piece),
      [CHAT_DRAFTS_KEY, PIECE] as const,
      { timeout: 10_000 },
    ).catch(() => undefined)
    expect(await theStoredDrafts(), 'the draft is kept as it was typed').toContain(body)
    await app.page.fill('.px-chat-box', '')
  }, 120_000)

  it('asks before the send, sends nothing until Send anyway, and then sends the words whole without asking again', async () => {
    await openTheConversation()
    const body = `Test: here is the key you asked for: ${PIECE}`
    await app.page.fill('.px-chat-box', body)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })
    expect(await question().getAttribute('data-shape')).toBe('longRun')
    const says = (await question().locator('.px-key-question-says').textContent()) ?? ''
    expect(says, 'it names the first four characters and the length').toContain(PIECE.slice(0, 4))
    expect(says).toContain(String(PIECE.length))
    expect(says, 'it never shows the piece').not.toContain(PIECE)
    expect(await question().locator('.px-key-question-send').textContent()).toBe(en['w13w.keyQuestion.sendAnyway'])
    expect(await question().locator('.px-key-question-change').textContent()).toBe(en['w13w.keyQuestion.changeIt'])
    expect((await everyMessage()).some((one) => one.body.includes('here is the key you asked for')), 'nothing is sent while asked').toBe(false)

    await question().locator('.px-key-question-send').click()
    const stored = await storedWith('here is the key you asked for')
    expect(stored.body, 'the office holds the words whole').toBe(body)
    expect(await question().count(), 'Send anyway asks no second question').toBe(0)
  }, 120_000)

  it('closes on Change it, sends nothing, and selects the piece in the box', async () => {
    await openTheConversation()
    const body = `Test: change this one ${PIECE} please`
    await app.page.fill('.px-chat-box', body)
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })
    await question().locator('.px-key-question-change').click()
    expect(await question().count()).toBe(0)
    await app.page.waitForFunction(
      (piece) => {
        const box = document.querySelector('.px-chat-box') as HTMLTextAreaElement | null
        return box !== null && box.value.slice(box.selectionStart, box.selectionEnd) === piece && document.activeElement === box
      },
      PIECE,
      { timeout: 10_000 },
    )
    expect(await app.page.inputValue('.px-chat-box'), 'the words stay in the box').toBe(body)
    expect((await everyMessage()).some((one) => one.body.includes('change this one')), 'nothing was sent').toBe(false)
    await app.page.fill('.px-chat-box', '')
  }, 120_000)

  it("sends an agent's run names at once, with no question", async () => {
    await openTheConversation()
    // WRITTEN SPLIT, as the brief asks: a time stamp and the name after it.
    const names = [`results/${'20261006T191226Z' + '_prl_v4'}/out.json`, '20261006T190300Z' + '_finished', '20261006T1810Z' + '_prl_v2']
    const body = `Test: the runs are ${names.join(', ')}`
    await app.page.fill('.px-chat-box', body)
    await app.page.click('.px-chat-send')
    const stored = await storedWith('Test: the runs are')
    expect(stored.body).toBe(body)
    expect(await question().count(), 'no question was drawn').toBe(0)
  }, 120_000)

  it("asks once about a picture named by a 32-character hash, as the picture's name, and Send anyway sends it", async () => {
    await openTheConversation()
    const name = '0123456789abcdef'.repeat(2) + '.png'
    await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
    await app.page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
    await app.page.fill('.px-chat-box', 'Test: the picture from QQ')
    await app.page.click('.px-chat-send')
    await question().waitFor({ timeout: 10_000 })
    expect(await question().getAttribute('data-where')).toBe('data.pictures[0].alt')
    expect(await question().locator('.px-key-question-says').textContent(), "it says it is the picture's name").toContain('name')

    if (process.env['W13W_KEY_QUESTION_SHOTS']) {
      const shots = process.env['W13W_KEY_QUESTION_SHOTS']
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          expect(await question().isVisible(), `the question is on the screen at ${String(width)} ${theme}`).toBe(true)
          await app.page.screenshot({ path: `${shots}/key-question-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }

    await question().locator('.px-key-question-send').click()
    const stored = await storedWith('Test: the picture from QQ')
    expect(stored.pictures?.map((one) => one.alt)).toEqual([name])
    expect(await question().count(), 'Send anyway asks no second question').toBe(0)
  }, 180_000)
})
