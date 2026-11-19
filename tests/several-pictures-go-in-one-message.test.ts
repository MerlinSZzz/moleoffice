// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SEVERAL PICTURES IN ONE MESSAGE, IN A ROW, EACH WITH A CLOSE MARK AND NO BOX ASKING ABOUT IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criteria M66, M68, M69 and M70 of design/messages/ACCEPTANCE.md section 39. They come from the
 * first pictures sent in the chat. Four changes follow from it:
 *
 *   1. A second picture pushed the first one out, and only one picture could be sent.
 *   3. The box marked left empty goes: pressing a picture opens it in a floating window, and nothing asks what it shows.
 *   4. The name and size go under each picture, the pictures stand in a row, and a long name fades out, never wraps.
 *   5. A close button at a picture's top right takes it out, and the words "take it out" are not drawn there.
 *
 * Five things, one per criterion and one for the pair of them that has to hold together:
 *
 *   M66  A SECOND PICTURE IS ADDED, NOT SUBSTITUTED, and both go in one message. Proved on the
 *        message the pool hands back, so it is what a reader gets rather than what a browser drew.
 *   M69  THE PICTURES STAND IN A ROW ACROSS, side by side and on one line, with the name and the
 *        size under each on a single line that never wraps and fades out at its end.
 *   M70  A CLOSE MARK AT EACH PICTURE'S TOP-RIGHT TAKES THAT ONE OUT, and the words "take it out"
 *        are nowhere on the screen.
 *   M68  THERE IS NO BOX ASKING WHAT A PICTURE SHOWS, and pressing a picture opens a floating
 *        window holding it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   hold one picture instead of a list             → cases 1 and 2
 *   let the row wrap, or the name wrap             → case 3
 *   draw one close mark for the whole row          → case 4
 *   bring back the words box, or the press         → case 5
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PREVIEW ROOT IS NAMED
 * ---------------------------------------------------------------------------------------
 *
 * The same reason as tests/a-picture-is-sent-in-a-message.test.ts: a picture sent in a message is
 * stored beside the database, `GET /api/file` reads only inside a preview root, and a test stack's
 * database is in a temporary directory of its own. Naming that directory is what a real
 * installation gets for free by keeping its database inside the checkout.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PICTURE_WORDS } from '../src/web/components/PictureToSend.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { openTheChat } from './open-the-chat.ts'

/** A one pixel png, so what is sent is a real picture rather than bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * THE AGENT'S CONTACT ROW, as `data-contact` names it: `agent:` and the agent's registry id. The
 * office gives a new agent an id of its own, which is not its handle, so it is read after the agent
 * is filed.
 */
let theAgentRow = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A name long enough that it cannot fit under a picture, so the fade has something to do. */
const A_VERY_LONG_NAME = 'a-screenshot-of-the-left-arm-wiring-taken-on-loquat-at-two-in-the-morning.png'

let app: LiveApp
let page: Page
let ours = ''
let previousRoots: string | undefined

beforeAll(async () => {
  ours = aTestDatabaseFolder('many-pictures')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`

  app = await liveApp({
    name: 'many-pictures',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    database: join(ours, 'panelx.db'),
  })
  page = app.page

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Many',
      data: { handle: 'builder-many', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const roster = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(roster.status, await roster.clone().text()).toBe(200)
  const registered = ((await roster.json()) as { agents: { id: string; handle: string }[] }).agents.find(
    (one) => one.handle === 'builder-many',
  )
  if (registered === undefined) throw new Error('the registry holds no agent with the handle builder-many')
  theAgentRow = `agent:${registered.id}`
  // ONE LINE SO THE CONTACT ROW EXISTS AND THE CONVERSATION CAN BE OPENED.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-many' },
    body: JSON.stringify({
      kind: 'message',
      title: 'Ready',
      data: { body: 'Ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  rmSync(ours, { recursive: true, force: true })
}, 60_000)

// ---------------------------------------------------------------------------- the screen

async function openTheConversation(): Promise<void> {
  await page.goto(`${app.site}/#/`)
  await waitForThePage(page)
  await openTheChat(page)
  await page.waitForSelector('.px-chat', { timeout: 15_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector(`.px-chat-contact[data-contact="${theAgentRow}"]`, { timeout: 15_000 })
  await page.click(`.px-chat-contact[data-contact="${theAgentRow}"]`)
  await page.waitForSelector('.px-chat-said', { timeout: 15_000 })
  await page.waitForSelector('.px-chat-attach-add', { timeout: 15_000 })
}

/** Choose one picture through the composer's own chooser, exactly as a person would. */
async function choose(name: string): Promise<void> {
  const before = await page.$$eval('.px-chat-attach-held', (all) => all.length)
  await page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'image/png', buffer: A_REAL_PNG })
  await page.waitForFunction(
    (many) => document.querySelectorAll('.px-chat-attach-held').length === many,
    before + 1,
    { timeout: 15_000 },
  )
}

/**
 * Every message in this project, as the pool hands them to a screen.
 *
 * THE POOL AND NOT THE RECORD, so this reads what any reader gets rather than what was stored: a
 * picture that never reached the wire would be a picture no screen could draw.
 */
async function everyMessage(): Promise<{ body: string; pictures: { path: string; alt: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  const said = (await read.json()) as { messages: { body: string; pictures: { path: string; alt: string }[] }[] }
  return said.messages
}

// ---------------------------------------------------------------------------- the cases

describe('a message carries several pictures, chosen one after another', () => {
  it('keeps the first when a second is chosen, instead of pushing it out', async () => {
    await openTheConversation()
    // THE CONTROL: one picture is held before the second is chosen, so "there are two" cannot pass
    // on a composer that drew none at all.
    await choose('first-shot.png')
    expect(await page.$$eval('.px-chat-attach-held', (all) => all.length)).toBe(1)

    await choose('second-shot.png')
    const names = await page.$$eval('.px-chat-attach-name', (all) => all.map((el) => el.textContent ?? ''))
    expect(names, 'made-up text in place of the person’s sentence: 搬完第三箱再回来搬第一箱')
      .toEqual(['first-shot.png', 'second-shot.png'])
  }, 180_000)

  it('sends them all in one message, in the order they were chosen', async () => {
    await page.fill('.px-chat-write textarea', 'Two shots of the same arm.')
    await page.click('.px-chat-write .px-chat-send')
    await page.waitForFunction(
      () => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '',
      undefined,
      { timeout: 30_000 },
    )
    expect(await page.$('.px-chat-notice'), 'nothing was refused').toBe(null)

    // THE EMPTY BOX DOES NOT MEAN THE MESSAGE IS STORED. The composer clears it at the press, before the
    // server answers (criterion M113), so the pool is read until the message is in it. Reading it once,
    // at once, found nothing when the machine was busy (problem Dl2lTbkZWzbs).
    await expect
      .poll(async () => (await everyMessage()).some((one) => one.body.includes('Two shots of the same arm')), { timeout: 30_000 })
      .toBe(true)
    const messages = await everyMessage()
    const mine = messages.find((one) => one.body.includes('Two shots of the same arm'))
    expect(mine, 'the message that was sent').toBeDefined()
    expect(mine?.pictures.length, 'both pictures are on the one message').toBe(2)
    expect(mine?.pictures.map((one) => one.alt)).toEqual(['first-shot.png', 'second-shot.png'])

    // AND THE CONVERSATION DRAWS BOTH, which means the bytes came back through the file door.
    await page.waitForFunction(
      () => (document.querySelectorAll('.px-chat-said .px-chat-pics img').length >= 2),
      undefined,
      { timeout: 30_000 },
    )
    // AND THE COMPOSER IS EMPTY AGAIN, so the next message does not carry these two as well.
    expect(await page.$$eval('.px-chat-attach-held', (all) => all.length)).toBe(0)
  }, 180_000)

  it('stands them in a row across, with the name and the size on one line that never wraps', async () => {
    await choose('a.png')
    await choose(A_VERY_LONG_NAME)
    const row = await page.evaluate(() => {
      const held = Array.from(document.querySelectorAll('.px-chat-attach-held'))
      const boxes = held.map((el) => el.getBoundingClientRect())
      const says = document.querySelector('.px-chat-attach-says')
      const name = document.querySelectorAll('.px-chat-attach-name')[1]
      const size = document.querySelectorAll('.px-chat-attach-size')[1]
      return {
        many: held.length,
        // SIDE BY SIDE, NOT STACKED: the second starts to the right of the first and shares its line.
        sideBySide: boxes.length === 2 && boxes[1]!.left >= boxes[0]!.right - 1 && boxes[1]!.top === boxes[0]!.top,
        // THE NAME AND THE SIZE SHARE ONE LINE, which is what "on one line" means: the same top.
        onOneLine:
          name !== undefined &&
          size !== undefined &&
          Math.round(name.getBoundingClientRect().top) === Math.round(size.getBoundingClientRect().top),
        // AND UNDER THE PICTURE, not beside it.
        underThePicture:
          says !== null &&
          says.getBoundingClientRect().top >=
            (document.querySelector('.px-chat-attach-shot')?.getBoundingClientRect().bottom ?? 0) - 1,
        wraps: name === undefined ? 'no element' : getComputedStyle(name).whiteSpace,
        // THE LONG NAME FADES OUT AT ITS END rather than wrapping or being cut square.
        fades: name === undefined ? '' : getComputedStyle(name).maskImage + getComputedStyle(name).webkitMaskImage,
        tall: name === undefined ? 0 : Math.round(name.getBoundingClientRect().height),
        lineHeight: name === undefined ? 0 : Math.round(parseFloat(getComputedStyle(name).lineHeight)),
      }
    })
    expect(row.many).toBe(2)
    expect(row.sideBySide, 'made-up text in place of the person’s sentence: 先把空箱子码整齐').toBe(true)
    expect(row.onOneLine, 'made-up text in place of the person’s sentence: 标签纸贴在箱侧面').toBe(true)
    expect(row.underThePicture).toBe(true)
    expect(row.wraps, 'made-up text in place of the person’s sentence: 先不用再等/再试').toBe('nowrap')
    expect(row.fades, 'made-up text in place of the person’s sentence: 纸箱堆太高就慢慢挪开').toContain('gradient')
    // ONE LINE TALL, measured rather than assumed: a name that wrapped would be two.
    expect(row.tall).toBeLessThanOrEqual(row.lineHeight + 2)
  }, 180_000)

  it('takes one picture out by the close mark at its own top-right, and says nothing else', async () => {
    // THE CONTROL: there is one mark per picture, and they are at the top-right of their own
    // picture rather than one mark for the row.
    const marks = await page.$$eval('.px-chat-attach-held', (all) =>
      all.map((held) => {
        const out = held.querySelector('.px-chat-attach-out')
        const shot = held.querySelector('.px-chat-attach-shot')
        if (out === null || shot === null) return null
        const o = out.getBoundingClientRect()
        const s = shot.getBoundingClientRect()
        return { topRight: o.right >= s.right - 2 && o.top <= s.top + 2, label: out.getAttribute('aria-label') ?? '' }
      }),
    )
    expect(marks.length).toBe(2)
    expect(marks.every((one) => one?.topRight === true), 'made-up text in place of the person’s sentence: 木箱左上角挂一张登记卡片')
      .toBe(true)
    expect(marks[1]?.label).toBe(PICTURE_WORDS.takeOut(A_VERY_LONG_NAME))

    // THE WORDS "TAKE IT OUT" ARE NOT ON THE SCREEN. The close button at the top right says it.
    const composer = (await page.textContent('.px-chat-attach')) ?? ''
    expect(composer).not.toContain(PICTURE_WORDS.takeOutShort)

    // AND PRESSING ONE TAKES THAT ONE OUT AND LEAVES THE OTHER.
    await page.click('.px-chat-attach-held:nth-child(1) .px-chat-attach-out')
    await page.waitForFunction(
      () => document.querySelectorAll('.px-chat-attach-held').length === 1,
      undefined,
      { timeout: 15_000 },
    )
    expect(await page.$$eval('.px-chat-attach-name', (all) => all.map((el) => el.textContent ?? ''))).toEqual([
      A_VERY_LONG_NAME,
    ])
  }, 180_000)

  it('asks nothing about a picture, and opens it in a floating window when it is pressed', async () => {
    // NO BOX ASKING WHAT IT SHOWS, and none of its words anywhere: a picture needs no
    // description of what it shows.
    expect(await page.$('.px-chat-attach-alt')).toBe(null)
    expect(await page.$('.px-chat-attach input[type="text"]')).toBe(null)

    // THE CONTROL: no window is open before the press.
    expect(await page.$('.px-chat-pic-window')).toBe(null)
    await page.click('.px-chat-attach-press')
    await page.waitForSelector('.px-chat-pic-window', { timeout: 15_000 })

    // IT HOLDS THE PICTURE, decoded, and says which file it is.
    const drew = await page.evaluate(
      () => (document.querySelector('.px-chat-pic-window-shot') as HTMLImageElement | null)?.naturalWidth ?? 0,
    )
    expect(drew, 'the browser decoded the bytes').toBe(1)
    expect(await page.textContent('.px-chat-pic-window-name')).toContain(A_VERY_LONG_NAME)
    // AND IT FLOATS OVER THE PAGE rather than inside the composer, which clips and scrolls.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.px-chat-pic-window-behind')!).position,
      ),
    ).toBe('fixed')

    // AND IT SHUTS AGAIN.
    await page.click('.px-chat-pic-window-shut')
    await page.waitForFunction(() => document.querySelector('.px-chat-pic-window') === null, undefined, {
      timeout: 15_000,
    })
  }, 180_000)
})
