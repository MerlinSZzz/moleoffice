// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE ADDED DURING AN UPLOAD STAYS, AND THE CHANGED-DRAFT LINE SAYS WHAT CHANGED (problem BfvfcYSCa7nW; wave 13w
 * round 13).
 *
 * The chat's pictures are one row (src/web/components/PictureToSend.tsx). Until round 13 each send ended by clearing the
 * whole row, so a picture the person added while that send's upload was still running was cleared with the sent ones and
 * lost without a word. Now a send takes out only the pictures it carried.
 *
 * When Send anyway finds the draft changed since the key question was asked (src/web/components/AKeyQuestion.tsx), it
 * sends nothing. Until round 13 its line said only that the draft changed. Now it says what changed: different words, or
 * how many pictures the box holds now.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, with the picture door held open by the test so an
 * upload is still running when the person acts:
 *   1. a picture added during a send's upload stays in the row after the send, the send carries only its own picture,
 *      and the next send carries the one that stayed;
 *   2. the pictures and words added during an upload stay after it; the key question then asked about them, with one
 *      picture taken out after the asking, says on Send anyway "The box now holds 1 picture", and nothing is sent.
 *   MUTATION A: `sent` in `usePictureToSend` takes out every picture again, as `clear` did. Red on 1 and 2.
 *
 * CASE 2 CHANGED IN ROUND 14 (a criterion change). Until then the question was asked with the send key DURING the upload,
 * and that upload's send then emptied the box, so the line said "2 pictures and different words". Since round 14 the
 * send key sends and asks nothing during an upload (problem XuMbIb7HYZ_Q), and a finished send leaves words typed during
 * it (problem DpiY-sIBZoln); tests/the-send-key-and-typed-words-during-an-upload.test.ts proves both. So the question is
 * now asked after the upload, and the change it finds is a picture taken out. Round 13's mutation B, "`howItChanged`
 * reports the words as unchanged", is no longer reached here: in the chat the words of an open question no longer change
 * without the person typing, and typing closes the question.
 *
 * PICTURES of the question with its changed line at 1440, 990, 660 and 390, light and dark, in English, when
 * W13W_PICTURE_DURING_UPLOAD_SHOTS names a folder (chapter 6).
 *
 * Every key-like piece is made up and put together when the test runs. The database and its pictures are in a folder this
 * file makes with mkdtemp and removes.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { png } from './checker-fixtures.ts'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agent = ''
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

/**
 * THE PICTURE DOOR, HELD. While `held` is set, every upload waits at the door until the test lets it through, so the
 * test acts while a send's upload is still running. `arrived` counts the uploads that reached the door.
 */
const door = { held: null as Promise<void> | null, release: () => {}, arrived: 0 }

function holdTheDoor(): void {
  door.held = new Promise<void>((resolve) => {
    door.release = () => {
      door.held = null
      resolve()
    }
  })
}

async function atTheDoor(route: Route): Promise<void> {
  door.arrived += 1
  if (door.held !== null) await door.held
  await route.continue()
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

/** Open the chat panel at the home page on the conversation with the agent. */
async function openTheConversation(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agent}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agent}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** Add one picture to the row, by its file name, and wait until the row holds `count`. */
async function addAPicture(name: string, count: number): Promise<void> {
  await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
  await app.page.waitForFunction((n) => document.querySelectorAll('.px-chat-attach-held').length === n, count, { timeout: 15_000 })
}

/** The file names of the pictures in the row, in order. */
async function theRow(): Promise<string[]> {
  return app.page.locator('.px-chat-attach-shot').evaluateAll((all) => all.map((one) => one.getAttribute('alt') ?? ''))
}

/** Wait until `n` uploads have reached the door. */
async function untilArrived(n: number): Promise<void> {
  for (let tries = 0; tries < 80 && door.arrived < n; tries++) await app.page.waitForTimeout(125)
  expect(door.arrived, 'the upload reached the picture door').toBeGreaterThanOrEqual(n)
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
  ours = mkdtempSync(join(tmpdir(), 'mole-office-picture-during-upload-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'picture-during-upload', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  agent = await anAgent('picture-during-upload', 'Test Rowan')
  await app.page.route('**/api/messages/pictures', atTheDoor)
}, 240_000)

afterAll(async () => {
  door.release()
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('a picture added during an upload stays', () => {
  it('keeps a picture added while a send uploads, and the next send carries it', async () => {
    await openTheConversation()
    await addAPicture('sent-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the first send')
    holdTheDoor()
    const before = door.arrived
    await app.page.click('.px-chat-send')
    await untilArrived(before + 1)

    // THE UPLOAD IS STILL RUNNING: the door holds it. The person adds a second picture now.
    await addAPicture('added-during-upload.png', 2)
    door.release()

    const first = await storedWith('the first send')
    expect(first.pictures.map((one) => one.alt), 'the send carries only the picture it was pressed with').toEqual(['sent-shot.png'])
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 1, undefined, { timeout: 15_000 })
    expect(await theRow(), 'the picture added during the upload stays in the row').toEqual(['added-during-upload.png'])

    await app.page.fill('.px-chat-box', 'Test: the next send')
    await app.page.click('.px-chat-send')
    const next = await storedWith('the next send')
    expect(next.pictures.map((one) => one.alt), 'the next send carries the picture that stayed').toEqual(['added-during-upload.png'])
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 0, undefined, { timeout: 15_000 })
  }, 180_000)

  it('says the box now holds 1 picture when a picture is taken out after the asking', async () => {
    await addAPicture('uploading-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the uploading send')
    holdTheDoor()
    const before = door.arrived
    await app.page.click('.px-chat-send')
    await untilArrived(before + 1)

    // WHILE THE UPLOAD RUNS: two more pictures, and new words with a key typed on after the sent ones.
    await addAPicture('kept-one.png', 2)
    await addAPicture('kept-two.png', 3)
    await app.page.click('.px-chat-box')
    await app.page.press('.px-chat-box', 'End')
    await app.page.keyboard.type(` and the asked draft, the key ${PIECE}`)

    // THE UPLOAD FINISHES: its send takes out its own words and its own picture, and leaves what was added.
    door.release()
    const sent = await storedWith('the uploading send')
    expect(sent.body).toBe('Test: the uploading send')
    expect(sent.pictures.map((one) => one.alt)).toEqual(['uploading-shot.png'])
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 2, undefined, { timeout: 15_000 })
    expect(await theRow(), 'the two pictures added during the upload stay').toEqual(['kept-one.png', 'kept-two.png'])
    expect(await app.page.inputValue('.px-chat-box'), 'the words typed during the upload stay').toBe(`and the asked draft, the key ${PIECE}`)

    // THE SEND KEY NOW ASKS, and a picture is taken out of the row after the asking.
    await app.page.press('.px-chat-box', 'Shift+Enter')
    await question().waitFor({ timeout: 10_000 })
    expect(await question().locator('.px-key-question-changed').count(), 'no line before the press').toBe(0)
    await app.page.locator('.px-chat-attach-out').nth(1).click()
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 1, undefined, { timeout: 15_000 })

    await question().locator('.px-key-question-send').click()
    await question().locator('.px-key-question-changed').waitFor({ timeout: 10_000 })
    expect(await question().locator('.px-key-question-changed').innerText(), 'the line says what changed').toBe(
      'The message changed after this question was asked, so nothing was sent. The box now holds 1 picture.',
    )
    // A send would reach the office within this; the round 11 send did in well under a second.
    await app.page.waitForTimeout(2_000)
    expect((await everyMessage()).filter((one) => one.body.includes('the asked draft')), 'nothing was sent').toEqual([])
    expect(await theRow(), 'the picture left in the row stays').toEqual(['kept-one.png'])

    const shots = process.env['W13W_PICTURE_DURING_UPLOAD_SHOTS']
    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(200)
          await app.page.screenshot({ path: `${shots}/changed-line-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }
  }, 180_000)
})
