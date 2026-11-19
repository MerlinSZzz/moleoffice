// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IN A GROUP, SEND WAITS UNTIL THE MESSAGE IS STORED (problem SO3kM_TLlKaR; wave 13w round 15).
 *
 * A group's send stores its pictures first and the group message second. Until round 15, Send came back as soon as the
 * pictures were stored, while the box still held the sent words and the row still held the sent pictures. A second
 * press of Send or the send key in that gap sent the same words and pictures to the group twice. Now `canSendNow` in
 * src/web/components/Chat.tsx also asks whether the open group's send is still going, from the press until the group
 * message is stored or the send fails.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, with the group message held at its door by the test
 * after the picture has been stored:
 *   1. in that gap Send is disabled, and two presses of the send key send nothing more: the office stores one message,
 *      with its picture once, and the box and the row are empty after it;
 *   2. when the group send fails, the words and the picture stay and Send is available again.
 *   MUTATION: take the group's "send still going" state out of `canSendNow`. Red on 1.
 *
 * PICTURES of the group chat in that gap at 1440, 990, 660 and 390, light and dark, in English, when
 * W13W_GROUP_SEND_GAP_SHOTS names a folder (chapter 6).
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
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let agent = ''
let ours = ''
let previousRoots: string | undefined

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const GROUP = 'Test: the group that waits'

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
 * THE GROUP MESSAGE'S DOOR. A group message is a POST to /api/records with `data.toGroup`. While `held` is set, it
 * waits there until the test lets it through, or is refused when `refuse` is set. `arrived` counts the group messages
 * that reached the door, and `uploads` counts the pictures that went up.
 */
const door = { held: null as Promise<void> | null, release: () => {}, arrived: 0, refuse: false, uploads: 0 }

function holdTheDoor(): void {
  door.held = new Promise<void>((resolve) => {
    door.release = () => {
      door.held = null
      resolve()
    }
  })
}

async function atTheRecordsDoor(route: Route): Promise<void> {
  const request = route.request()
  const toGroup = request.method() === 'POST' && (request.postDataJSON() as { data?: { toGroup?: string } } | null)?.data?.toGroup
  if (!toGroup) return route.continue()
  door.arrived += 1
  if (door.held !== null) await door.held
  if (door.refuse) {
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test: the test refused this group message.' }) })
  }
  return route.continue()
}

async function atThePictureDoor(route: Route): Promise<void> {
  if (route.request().method() === 'POST') door.uploads += 1
  await route.continue()
}

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

async function openTheGroup(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.click(`.px-chat-contact:has-text("${GROUP}")`)
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

async function addAPicture(name: string): Promise<void> {
  await app.page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
  await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-attach-held').length === 1, undefined, { timeout: 15_000 })
}

/** Press Send, and wait until its group message is held at the door: the picture is stored and the message is not. */
async function sendIntoTheGap(): Promise<void> {
  holdTheDoor()
  const before = door.arrived
  await app.page.click('.px-chat-send')
  for (let tries = 0; tries < 80 && door.arrived < before + 1; tries++) await app.page.waitForTimeout(125)
  expect(door.arrived, 'the group message reached its door').toBe(before + 1)
}

async function messagesWith(words: string): Promise<Stored[]> {
  const read = await fetch(`${app.api}/api/messages?limit=25&full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: Stored[] }).messages.filter((one) => one.body.includes(words))
}

async function storedWith(words: string): Promise<Stored> {
  for (let tries = 0; tries < 80; tries++) {
    const found = await messagesWith(words)
    if (found.length > 0) return found[0]!
    await app.page.waitForTimeout(250)
  }
  throw new Error(`no message holding "${words}" was stored`)
}

async function theBoxHolds(words: string): Promise<void> {
  await app.page
    .waitForFunction((w) => (document.querySelector('.px-chat-box') as HTMLTextAreaElement | null)?.value === w, words, { timeout: 15_000 })
    .catch(() => undefined)
  expect(await app.page.inputValue('.px-chat-box'), 'what the box holds').toBe(words)
}

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-group-send-waits-'))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  // A PICTURE IS STORED BESIDE THE DATABASE and is kept only inside a preview root, as in
  // tests/a-picture-is-sent-in-a-message.test.ts.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = await liveApp({ name: 'group-send-waits', viewport: { width: 1440, height: 1000 }, database: join(ours, 'panelx.db') })
  agent = await anAgent('group-send-waits', 'Test Rowan')
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
  await app.page.route('**/api/records', atTheRecordsDoor)
  await app.page.route('**/api/messages/pictures', atThePictureDoor)
}, 240_000)

afterAll(async () => {
  door.release()
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

describe('in a group, Send waits until the message is stored', () => {
  it('stores one message after two presses of the send key between the stored picture and the stored message', async () => {
    await openTheGroup()
    await addAPicture('group-gap-shot.png')
    await app.page.fill('.px-chat-box', 'Test: the words sent once')
    await sendIntoTheGap()
    const uploads = door.uploads
    expect(uploads, 'the picture went up once').toBe(1)

    // THE PICTURE IS STORED AND THE MESSAGE IS NOT. Send says a send cannot start, and the send key must agree.
    await app.page.press('.px-chat-box', 'Shift+Enter')
    await app.page.press('.px-chat-box', 'Shift+Enter')
    // A second send would reach a door within this; it reached the picture door in well under a second in round 14.
    await app.page.waitForTimeout(2_000)
    expect(door.uploads, 'no second upload was started').toBe(uploads)
    expect(door.arrived, 'no second group message was sent').toBe(1)
    expect(await app.page.isDisabled('.px-chat-send'), 'Send is disabled until the message is stored').toBe(true)

    const shots = process.env['W13W_GROUP_SEND_GAP_SHOTS']
    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(200)
          await app.page.screenshot({ path: `${shots}/group-send-gap-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    }

    door.release()
    const sent = await storedWith('the words sent once')
    expect(sent.pictures.map((one) => one.alt)).toEqual(['group-gap-shot.png'])
    await app.page.waitForTimeout(2_000)
    expect(await messagesWith('the words sent once'), 'the office stored one message').toHaveLength(1)
    await theBoxHolds('')
    expect(await app.page.locator('.px-chat-attach-held').count(), 'the row is empty after the send').toBe(0)
  }, 180_000)

  it('keeps the words and the picture when the group send fails, and offers Send again', async () => {
    await addAPicture('group-refused-shot.png')
    await app.page.fill('.px-chat-box', 'Test: the words of a refused send')
    door.refuse = true
    await sendIntoTheGap()
    expect(await app.page.isDisabled('.px-chat-send'), 'Send is disabled until the send ends').toBe(true)
    door.release()
    await app.page.waitForFunction(() => !(document.querySelector('.px-chat-send') as HTMLButtonElement | null)?.disabled, undefined, { timeout: 15_000 })
    door.refuse = false
    await theBoxHolds('Test: the words of a refused send')
    expect(await app.page.locator('.px-chat-attach-held').count(), 'the picture stays in the row').toBe(1)
    expect(await messagesWith('the words of a refused send'), 'nothing was stored').toHaveLength(0)
  }, 180_000)
})
