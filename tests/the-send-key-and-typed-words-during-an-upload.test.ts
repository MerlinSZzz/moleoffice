// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEND KEY WAITS FOR AN UPLOAD, AND WORDS TYPED DURING IT STAY (problems XuMbIb7HYZ_Q and DpiY-sIBZoln; wave 13w
 * round 14).
 *
 * While a picture's upload runs, the chat's Send button is disabled. The send key follows a decision and is in
 * `src/web/lib/send-key.ts`. Until round 14 it did not ask the button's rule, so it started a
 * second send of the same words with the uploading picture again. Now the button and the send key ask one rule,
 * `canSendNow` in src/web/components/Chat.tsx. (Inject asked it too, until wave 13y took Inject out of the person's
 * writing row.)
 *
 * Until round 14 a finished send also emptied the whole box, so words the person typed while its upload ran were lost.
 * Now a finished send takes out of the box only the words it carried (`takeTheSentWordsOut`), the way round 13 made it
 * take out only the pictures it carried.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, with the picture door held open by the test so an
 * upload is still running when the person acts:
 *   1. the send key pressed during an upload sends nothing and starts no second upload; the one send then
 *      stores its words and its picture once;
 *   2. words typed on after the sent words during an upload stay in the box after the send, and the stored message
 *      holds only the sent words; words typed over the box during an upload stay whole;
 *   3. the same for a group: words typed on during the group send's upload stay.
 *   MUTATION A: `send` and `sendToTheGroup` skip `canSendNow` for a press. Red on 1; 2 and 3 then fail as well, because
 *      the extra sends of 1 leave its words in the box.
 *   MUTATION B: `takeTheSentWordsOut` empties the whole box again. Red on 2 and 3.
 *
 * PICTURES of the chat during an upload, with new words in the box, at 1440, 990, 660 and 390, light and dark, in
 * English, when W13W_TYPED_DURING_UPLOAD_SHOTS names a folder (chapter 6).
 *
 * The database and its pictures are in a folder this file makes with mkdtemp and removes.
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
import { openTheChat as openTheChatFromTheShell } from './open-the-chat.ts'

let app: LiveApp
let agent = ''
let ours = ''
let previousRoots: string | undefined

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const GROUP = 'Test: the upload group'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A real picture, made when the test runs, so what is sent is a picture and this file holds no long base64. */
const A_REAL_PNG = png({ width: 1, height: 1 })

interface Stored {
  body: string
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

/** Open the chat panel at the home page, on its list of contacts or of groups. */
async function openTheChat(tab: 'contacts' | 'groups'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChatFromTheShell(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click(`.px-chat-tab[data-tab="${tab}"]`)
}

async function openTheConversation(): Promise<void> {
  await openTheChat('contacts')
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agent}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agent}"]`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

async function openTheGroup(): Promise<void> {
  await openTheChat('groups')
  await app.page.click(`.px-chat-contact:has-text("${GROUP}")`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** Add one picture to the row, by its file name, and wait until the row holds `count`. */
async function addAPicture(name: string, count: number): Promise<void> {
  await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
  await app.page.waitForFunction((n) => document.querySelectorAll('.px-chat-attach-held').length === n, count, { timeout: 15_000 })
}

/** Press Send with what is in the box and the row, hold its upload at the door, and wait until it is there. */
async function startASendThatUploads(): Promise<void> {
  holdTheDoor()
  const before = door.arrived
  await app.page.click('.px-chat-send')
  for (let tries = 0; tries < 80 && door.arrived < before + 1; tries++) await app.page.waitForTimeout(125)
  expect(door.arrived, 'the upload reached the picture door').toBe(before + 1)
}

/** Every message the office holds whose body holds `words`, as the person reads them. */
async function messagesWith(words: string): Promise<Stored[]> {
  const read = await fetch(`${app.api}/api/messages?limit=25&full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: Stored[] }).messages.filter((one) => one.body.includes(words))
}

/** Wait until the office holds a message whose body holds `words`, and give it back. */
async function storedWith(words: string): Promise<Stored> {
  for (let tries = 0; tries < 80; tries++) {
    const found = await messagesWith(words)
    if (found.length > 0) return found[0]!
    await app.page.waitForTimeout(250)
  }
  throw new Error(`no message holding "${words}" was stored`)
}

/** Wait until the box holds exactly `words`, and say what it holds if it never does. */
async function theBoxHolds(words: string): Promise<void> {
  await app.page
    .waitForFunction((w) => (document.querySelector('.px-chat-box') as HTMLTextAreaElement | null)?.value === w, words, { timeout: 15_000 })
    .catch(() => undefined)
  expect(await app.page.inputValue('.px-chat-box'), 'what the box holds after the send').toBe(words)
}

/** Type at the end of what the box holds, as a person does. */
async function typeOn(words: string): Promise<void> {
  await app.page.click('.px-chat-box')
  await app.page.press('.px-chat-box', 'End')
  await app.page.keyboard.type(words)
}

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-typed-during-upload-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'typed-during-upload', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  agent = await anAgent('typed-during-upload', 'Test Rowan')
  const made = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: GROUP,
      because: 'Test: a group to send a picture to.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'Test: the person opened it.' },
        { who: { kind: 'agent', id: agent }, because: 'Test: the agent reads it.' },
      ],
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  await app.page.route('**/api/messages/pictures', atTheDoor)
}, 240_000)

afterAll(async () => {
  door.release()
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('the send key and typed words during an upload', () => {
  it('sends nothing on the send key while an upload runs', async () => {
    await openTheConversation()
    await addAPicture('uploading-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the words at the press')
    await startASendThatUploads()
    const arrived = door.arrived

    // THE UPLOAD IS STILL RUNNING. The button says a send cannot start, and the key must agree with it.
    expect(await app.page.isDisabled('.px-chat-send'), 'the button is disabled during the upload').toBe(true)
    await app.page.press('.px-chat-box', 'Shift+Enter')
    // A second send would reach the door within this; the round 13 upload did in well under a second.
    await app.page.waitForTimeout(2_000)
    expect(door.arrived, 'no second upload was started').toBe(arrived)
    expect(await app.page.locator('.px-key-question').count(), 'no question was asked').toBe(0)

    door.release()
    const sent = await storedWith('the words at the press')
    expect(sent.pictures.map((one) => one.alt)).toEqual(['uploading-shot.png'])
    await app.page.waitForTimeout(2_000)
    expect(await messagesWith('the words at the press'), 'the words were sent once').toHaveLength(1)
    expect(door.arrived, 'the picture was uploaded once').toBe(arrived)
  }, 180_000)

  it('keeps the words typed while a send uploads, and sends only the words it was pressed with', async () => {
    await theBoxHolds('')
    await addAPicture('second-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the sent words')
    await startASendThatUploads()
    await typeOn(' and then the words typed during the upload')

    const shots = process.env['W13W_TYPED_DURING_UPLOAD_SHOTS']
    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(200)
          await app.page.screenshot({ path: `${shots}/typed-during-upload-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }

    door.release()
    const sent = await storedWith('the sent words')
    expect(sent.body, 'the message holds only the words it was pressed with').toBe('Test: the sent words')
    await theBoxHolds('and then the words typed during the upload')

    // WORDS TYPED OVER THE WHOLE BOX during an upload stay whole: none of them was carried.
    await addAPicture('third-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the third send')
    await startASendThatUploads()
    await app.page.fill('.px-chat-box', 'Test: other words, typed over the box')
    door.release()
    await storedWith('the third send')
    await app.page.waitForTimeout(1_000)
    await theBoxHolds('Test: other words, typed over the box')
  }, 180_000)

  it('keeps the words typed while a group send uploads', async () => {
    await openTheGroup()
    await app.page.fill('.px-chat-box', '')
    await addAPicture('group-shot.png', 1)
    await app.page.fill('.px-chat-box', 'Test: the group words')
    await startASendThatUploads()
    await typeOn(' and the group words typed during the upload')
    door.release()
    await storedWith('the group words')
    await theBoxHolds('and the group words typed during the upload')
  }, 180_000)
})
