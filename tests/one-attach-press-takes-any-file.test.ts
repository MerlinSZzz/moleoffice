// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ATTACH PRESS IN THE WRITING BOX TAKES ANY FILE, ON THIS MACHINE AND FROM ANOTHER ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The writing box had two presses at its bottom left: the picture press above the box and the quote press in it. The
 * quote press does nothing while nothing on the page is selected, so pressing it looked like an attach press that did
 * nothing, and the picture press beside the limits line was a second one. Now:
 *
 *   1. THE WRITING BOX HAS ONE ATTACH PRESS, in the writing row, left of the quote press and level with it, and no
 *      press of any kind is drawn above the box (since wave 13y the label flag stands left of Send, not above the box,
 *      at every width). No two presses of the box overlap, and the attach press is what is under
 *      its own middle, at 1440 and at 390. The empty box is one line tall once the row is measured.
 *   2. PRESSING IT OPENS THE FILE CHOOSER, for several files at once and with no type named, so the chooser offers every
 *      file. A file that is not a picture is held as a file, with no picture drawn for it, and taken out again.
 *   3. A PICTURE AND ANOTHER FILE GO IN ONE MESSAGE. The picture is drawn; the other file is offered as a file under its
 *      own name; both are stored beside the database, the file's bytes as they were sent, under a fresh name.
 *   4. THE FILE DOOR stores any bytes under a fresh name that keeps the sent name's extension, by the rule a report's
 *      file is named by, never leaves the store's folder whatever the name says, and refuses an empty file, bytes that
 *      are not base64 and a file past the limit, naming both numbers, with nothing written. It answers on the address
 *      other machines call as well.
 *   5. FROM ANOTHER MACHINE, a browser paired through the pairing page opens the chooser from the same press and sends a
 *      file, and the file is readable on this machine.
 *   6. PICTURES of the page and its writing box, at 1440, 990, 660 and 390, light and dark, with the chat in its window
 *      and beside the page on either side, at rest and with a picture and a file held. They are taken only when
 *      W13Y_CHAT_ATTACH names a folder.
 *
 * WHICH BROWSER: the test browser here has only Chromium. Chrome on macOS is Chromium. Safari and Firefox open a file
 * chooser for a hidden file input whose click() is called inside a press's own click handler, as this press does, and
 * neither the chooser nor the press reads the page's address.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   the attach press left above the box, or a second press drawn       → case 1
 *   the attach press drawn over another press, or under one            → case 1
 *   the empty box left two lines tall beside the attach press          → case 1
 *   a press that does not open the chooser, or a chooser of pictures   → case 2
 *   a file that is not a picture refused, or drawn as a broken picture → cases 2 and 3
 *   the file dropped from the message, or stored under its own name    → case 3
 *   a name that reaches outside the store, or an empty file stored     → case 4
 *   the door answering only on loopback                                → cases 4 and 5
 *
 * Everything here is made up: the agent, the messages and every file. The servers come from `liveApp` in
 * tests/helpers.ts, on a database in this test's own folder. Nothing here touches ./data/panelx.db.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PICTURE_WORDS, inMegabytes } from '../src/web/components/PictureToSend.tsx'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { type LiveApp, liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

/** A one pixel png, so what is sent as a picture is a real picture. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
/** A made-up text file: a file that is not a picture. */
const SOME_NOTES = Buffer.from('Made-up notes for a made-up message.\n')

/** The second address this stack is also served on: the listener a call from another machine arrives on. */
const OTHER_ADDRESS = '127.0.0.2'
/** Small enough that a browser can hold it, and past a limit set low for this test. */
const LIMIT = 4096
const LABEL = 'Made-up data — an invented office, not real office data'
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const output = process.env.W13Y_CHAT_ATTACH
/**
 * WHERE A PICTURE'S LABEL GOES: above Home's heading, at the top of the page, unless the chat covers the screen; then
 * above the conversation's own head, at the top of the chat. Above the row over the writing box, the label lay over the
 * window's resize edge in the window, and against the foot of the message list beside the page: once the cases before
 * the pictures have sent files, the list scrolls at 660 and 390, and the label helper clips the list's rows at a
 * whole-pixel height, which reached 0.19 px past the list's foot and onto the label. The chat covers the screen when the
 * heading's middle is drawn under it: the window on a narrow screen, and the chat beside the page where the page is too
 * narrow to share, which says so by no mark of its own.
 */
const HOMES_HEADING = '.hm-page-head'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

type Where = 'window' | 'left' | 'right'

let app: LiveApp
let ours = ''
let agentId = ''
let previousRoots: string | undefined
let previousLimit: string | undefined

beforeAll(async () => {
  ours = aTestDatabaseFolder('one-attach-press')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  previousLimit = process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES']
  // THIS TEST'S OWN FOLDER IS A ROOT, because the database and so the stored files are there; the checkout stays one.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES'] = String(LIMIT)

  app = await liveApp({
    name: 'one-attach-press',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    addressForOtherMachines: OTHER_ADDRESS,
    database: join(ours, 'panelx.db'),
  })

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Builder', data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // THE OTHER MACHINE IS TRUSTED, as tests/a-picture-is-sent-in-a-message.test.ts says why.
  await trustTheMachineThatCallsThroughTheOtherDoor({ api: app.api, keysFile: join(ours, 'keys.json') }, `http://${OTHER_ADDRESS}:${String(app.apiPort)}`)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  // ONE LINE SO THE CONVERSATION EXISTS.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-builder' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (previousLimit === undefined) delete process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES']
  else process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES'] = previousLimit
  if (ours !== '') rmSync(ours, { recursive: true, force: true })
}, 60_000)

// ---------------------------------------------------------------------------- the screen

/** A browser window of its own, with the chat in its window or beside the page on one side, on Home. */
async function aWindow(width: number, theme: 'light' | 'dark', where: Where, site = app.site): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
  await context.addInitScript(([look, open, side]) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', open)
    localStorage.setItem('mole-office.chat.split-side', side)
  }, [theme, where === 'window' ? 'yes' : 'split', where === 'left' ? 'left' : 'right'] as const)
  const page = await context.newPage()
  await page.goto(`${site}/#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return { context, page }
}

/** Open the conversation with the made-up agent and wait for its writing box. */
async function openTheConversation(page: Page): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-them', { timeout: 30_000 })
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

/** Press the attach press and hand the chooser it opens these files. */
async function choose(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), page.click('.px-chat-write .px-chat-attach-add')])
  await chooser.setFiles(files)
}

/** What the writing box draws: the attach presses, where the presses are, which of them overlap, and how many lines tall the box is. */
async function theWritingBox(page: Page) {
  return page.evaluate(() => {
    const named = (one: Element): string => (one.getAttribute('class') ?? '').split(' ')[0] || one.tagName.toLowerCase()
    const place = (one: Element | null | undefined) => {
      if (one === null || one === undefined) return null
      const r = one.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    const write = document.querySelector('.px-chat-write')
    const press = write?.querySelector('.px-chat-attach-add') ?? null
    let atTheMiddle = false
    if (press !== null) {
      const r = press.getBoundingClientRect()
      const there = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      atTheMiddle = there !== null && press.contains(there)
    }
    // HOW MANY LINES THE BOX IS TALL INSIDE ITS PADDING. An empty box is one line.
    const box = write?.querySelector('textarea') ?? null
    let lines: number | null = null
    if (box !== null) {
      const style = getComputedStyle(box)
      lines = (box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight)
    }
    const drawn = [...(write?.querySelectorAll('button, textarea') ?? [])].filter((one) => {
      const r = one.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(one).visibility !== 'hidden'
    })
    const overlaps: string[] = []
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < drawn.length; j++) {
        const a = drawn[i]!.getBoundingClientRect()
        const b = drawn[j]!.getBoundingClientRect()
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (across > 0.5 && down > 0.5) overlaps.push(`${named(drawn[i]!)} and ${named(drawn[j]!)}`)
      }
    }
    return {
      inThePage: document.querySelectorAll('.px-chat-attach-add').length,
      inTheBox: write?.querySelectorAll('.px-chat-attach-add').length ?? 0,
      // EVERY PRESS ABOVE THE BOX, but the presses of a held file.
      pressesAbove: [...document.querySelectorAll('.px-chat-attach button')]
        .filter((one) => one.closest('.px-chat-attach-held') === null)
        .map(named),
      press: place(press),
      quote: place(write?.querySelector('.px-chat-quote-press')),
      typing: place(write?.querySelector('textarea')),
      lines,
      atTheMiddle,
      overlaps,
    }
  })
}

/** Every message in this project, as the pool hands them to a screen. */
async function everyMessage(): Promise<{ body: string; pictures: { path: string; alt: string; type: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: { body: string; pictures: { path: string; alt: string; type: string }[] }[] }).messages
}

/** Send bytes under a name to the file door, at loopback or at another address. */
async function sendAFile(bytes: string, name: string, api = app.api): Promise<Response> {
  return fetch(`${api}/api/messages/files`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ bytes, name }) })
}

async function storedPath(sent: Response): Promise<string> {
  expect(sent.status, await sent.clone().text()).toBe(201)
  const said = (await sent.json()) as { file: { path: string; bytes: number } }
  return said.file.path
}

// ---------------------------------------------------------------------------- the cases

describe('one attach press in the writing box takes any file', () => {
  for (const [width, where] of [[1440, 'window'], [1440, 'right'], [390, 'window']] as const) {
    it(`draws one attach press in the box's row, left of the quote press, over nothing, at ${String(width)} with the chat ${where === 'window' ? 'in its window' : 'beside the page'}`, async () => {
      const { context, page } = await aWindow(width, 'light', where)
      try {
        const limitRead = page.waitForResponse((response) => response.url().includes('/api/messages/pictures') && response.request().method() === 'GET' && response.ok(), { timeout: 30_000 })
        await openTheConversation(page)
        await limitRead
        const box = await theWritingBox(page)
        expect(box.inTheBox, 'the attach presses in the writing box').toBe(1)
        expect(box.inThePage, 'the attach presses in the page').toBe(1)
        expect(box.pressesAbove, 'a press is still drawn above the writing box').toEqual([])
        expect(box.overlaps, 'presses of the writing box overlap').toEqual([])
        expect(box.atTheMiddle, 'something else is drawn over the attach press').toBe(true)
        const press = box.press
        const quote = box.quote
        const typing = box.typing
        if (press === null || quote === null || typing === null) throw new Error(`the writing box lacks a part: ${JSON.stringify(box)}`)
        expect(press.right, 'the attach press is not left of the quote press').toBeLessThanOrEqual(quote.left + 0.5)
        expect(Math.abs(press.bottom - quote.bottom), 'the attach press is not level with the quote press').toBeLessThanOrEqual(1)
        expect(press.left, 'the attach press is not at the box\'s left').toBeLessThanOrEqual(typing.left)
        // THE EMPTY BOX IS ONE LINE TALL ONCE THE ROW IS MEASURED. Until wave 13y the mark's button moved
        // above the box after the first draw in a narrow row, and the box grew wider; fitted only on that
        // first draw, the box kept two lines in the window at 1440.
        await expect.poll(async () => (await theWritingBox(page)).lines, { message: 'the empty box is taller than one line', timeout: 5_000 }).toBeLessThan(1.5)
        // A refusal proves the composer has applied the limit, rather than only received its response.
        const name = 'made-up-too-large.bin'
        await expect.poll(async () => {
          await page.setInputFiles('.px-chat-attach-file', { name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(LIMIT + 1) })
          return (await page.locator('.px-chat-attach-fault').allTextContents())[0] ?? null
        }, { timeout: 10_000 }).toBe(PICTURE_WORDS.tooBig(name, inMegabytes(LIMIT + 1), inMegabytes(LIMIT)))
        expect(await page.locator('.px-chat-attach-limits').count(), 'the size line is still drawn').toBe(0)
      } finally {
        await context.close()
      }
    }, 120_000)
  }

  it('opens the chooser for several files of any kind, and holds a file that is not a picture', async () => {
    const { context, page } = await aWindow(1440, 'light', 'window')
    try {
      await openTheConversation(page)
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), page.click('.px-chat-write .px-chat-attach-add')])
      expect(chooser.isMultiple(), 'the chooser takes one file only').toBe(true)
      expect(await page.locator('.px-chat-attach-file').getAttribute('accept'), 'the chooser names the types it offers').toBeNull()
      await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: SOME_NOTES })
      await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
      expect(await page.locator('.px-chat-attach-fault').count(), 'the file was refused').toBe(0)
      expect(await page.textContent('.px-chat-attach-held .px-chat-attach-name')).toBe('notes.txt')
      expect(await page.locator('.px-chat-attach-held img').count(), 'a picture is drawn for a file that is not one').toBe(0)
      await page.click('.px-chat-attach-held .px-chat-attach-out')
      await expect.poll(() => page.locator('.px-chat-attach-held').count(), { timeout: 10_000 }).toBe(0)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('sends a picture and another file in one message; the picture is drawn and the file is offered under its name', async () => {
    const { context, page } = await aWindow(1440, 'light', 'window')
    try {
      await openTheConversation(page)
      await choose(page, [
        { name: 'made-up-shot.png', mimeType: 'image/png', buffer: A_REAL_PNG },
        { name: 'notes.txt', mimeType: 'text/plain', buffer: SOME_NOTES },
      ])
      await expect.poll(() => page.locator('.px-chat-attach-held').count(), { timeout: 15_000 }).toBe(2)
      await page.fill('.px-chat-write textarea', 'Made-up line: the shot and the notes.')
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(
        () => [...document.querySelectorAll('.px-chat-said .px-chat-file .px-chat-pic-alt')].some((one) => one.textContent === 'notes.txt'),
        undefined,
        { timeout: 20_000 },
      )
      await page.waitForFunction(
        () => ((document.querySelector('.px-chat-said .px-chat-pics img') as HTMLImageElement | null)?.naturalWidth ?? 0) > 0,
        undefined,
        { timeout: 20_000 },
      )
      expect(await page.locator('.px-chat-attach-held').count(), 'the composer still holds what was sent').toBe(0)

      const mine = (await everyMessage()).find((one) => one.body.includes('the shot and the notes'))
      expect(mine, 'the message that was sent').toBeDefined()
      const [shot, notes] = mine?.pictures ?? []
      expect(mine?.pictures.length).toBe(2)
      expect(shot?.alt).toBe('made-up-shot.png')
      expect(shot?.path.endsWith('.png'), String(shot?.path)).toBe(true)
      expect(notes?.alt).toBe('notes.txt')
      const path = String(notes?.path)
      expect(path.startsWith(ours), `stored in ${path}`).toBe(true)
      expect(path.endsWith('.txt'), path).toBe(true)
      expect(basename(path), 'the file is stored under the name it was sent with').not.toBe('notes.txt')
      expect(readFileSync(path).equals(SOME_NOTES), 'the stored bytes are not the bytes sent').toBe(true)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('stores any file under a fresh name with its extension, stays in its folder, and refuses empty, unreadable and too big', async () => {
    const bytes = SOME_NOTES.toString('base64')
    const first = await storedPath(await sendAFile(bytes, 'plan.pdf'))
    const second = await storedPath(await sendAFile(bytes, 'plan.pdf'))
    expect(first.startsWith(ours), first).toBe(true)
    expect(first.endsWith('.pdf'), first).toBe(true)
    expect(second, 'two files sent under one name are stored apart').not.toBe(first)
    expect(readFileSync(first).equals(SOME_NOTES)).toBe(true)
    const folder = dirname(first)
    expect(basename(await storedPath(await sendAFile(bytes, 'README'))), 'a name with no extension').not.toContain('.')
    expect((await storedPath(await sendAFile(bytes, 'logs.tar.gz'))).endsWith('.gz')).toBe(true)
    expect((await storedPath(await sendAFile(bytes, 'NOTES.TXT'))).endsWith('.txt')).toBe(true)
    expect((await storedPath(await sendAFile(bytes, 'odd.t x"t'))).endsWith('.txt'), 'an extension keeps letters and digits only').toBe(true)
    const away = await storedPath(await sendAFile(bytes, '../../made-up-away.txt'))
    expect(dirname(away), 'a name with slashes leaves the store').toBe(folder)

    // EACH REFUSAL WRITES NOTHING: the folder holds as many files after them as before.
    const before = readdirSync(folder).length
    const empty = await sendAFile('', 'empty.txt')
    expect(empty.status, await empty.clone().text()).toBe(400)
    const unreadable = await sendAFile('this is not base64!', 'notes.txt')
    expect(unreadable.status, await unreadable.clone().text()).toBe(400)
    expect(((await unreadable.json()) as { error: string }).error).toContain('Nothing was written')
    const tooBig = await sendAFile(Buffer.alloc(LIMIT + 1, 7).toString('base64'), 'big.bin')
    expect(tooBig.status).toBe(413)
    const why = ((await tooBig.json()) as { error: string }).error
    expect(why).toContain(String(LIMIT + 1))
    expect(why).toContain(String(LIMIT))
    expect(readdirSync(folder).length, 'a refused file was written').toBe(before)

    // AND ON THE ADDRESS OTHER MACHINES CALL.
    const there = await storedPath(await sendAFile(bytes, 'from-there.txt', `http://${OTHER_ADDRESS}:${String(app.apiPort)}`))
    expect(dirname(there)).toBe(folder)
  }, 120_000)

  it('sends a file from a browser on another machine, and the file is readable here', async () => {
    const other = `http://${OTHER_ADDRESS}:${String(app.webPort)}`
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'yes')
    })
    const page = await context.newPage()
    try {
      // THE BROWSER PAIRS THROUGH THE PRODUCT'S OWN PAGE, and the owner confirms on loopback, as
      // tests/a-reports-pictures-and-files-are-saved-from-another-machine.test.ts does.
      await page.goto(`${other}/#/pairing`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const askPress = page.getByRole('button', { name: 'Ask to pair this browser' })
      await askPress.waitFor({ timeout: 30_000 })
      const name = (await page.locator('.pair-device').first().textContent())?.trim() ?? ''
      await askPress.click()
      const deadline = Date.now() + 30_000
      let waiting: { id: string } | undefined
      while (waiting === undefined && Date.now() < deadline) {
        const listed = (await (await fetch(`${app.api}/api/office/visitors`, { headers: AS_THE_OWNER })).json()) as {
          credentials: { id: string; handle: string; standing: string }[]
        }
        waiting = listed.credentials.find((one) => one.handle === name && one.standing === 'pending')
        if (waiting === undefined) await new Promise((resolve) => setTimeout(resolve, 250))
      }
      expect(waiting, `no pending credential was issued for "${name}"`).toBeDefined()
      const confirmed = await fetch(`${app.api}/api/office/visitors/${String(waiting?.id)}/confirm`, { method: 'POST', headers: AS_THE_OWNER, body: '{}' })
      expect(confirmed.status, await confirmed.clone().text()).toBe(200)

      await page.goto(`${other}/#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await openTheConversation(page)
      await choose(page, [{ name: 'from-the-other-machine.txt', mimeType: 'text/plain', buffer: SOME_NOTES }])
      await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
      await page.fill('.px-chat-write textarea', 'Made-up line: sent from the other machine.')
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(
        () => [...document.querySelectorAll('.px-chat-said .px-chat-file .px-chat-pic-alt')].some((one) => one.textContent === 'from-the-other-machine.txt'),
        undefined,
        { timeout: 20_000 },
      )
    } finally {
      await context.close()
    }
    const mine = (await everyMessage()).find((one) => one.body.includes('sent from the other machine'))
    const path = String(mine?.pictures[0]?.path)
    expect(path.startsWith(ours), `stored in ${path}`).toBe(true)
    const read = await fetch(`${app.api}/api/file?path=${encodeURIComponent(path)}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    expect(Buffer.from(await read.arrayBuffer()).equals(SOME_NOTES)).toBe(true)
  }, 240_000)

  for (const width of [1440, 990, 660, 390]) {
    it.runIf(output)(`photographs the page and its writing box at ${String(width)}, light and dark, in the window and on either side`, async () => {
      if (output === undefined) throw new Error('the pictures need W13Y_CHAT_ATTACH')
      const dir = join(output, 'pictures')
      mkdirSync(dir, { recursive: true })
      for (const theme of ['light', 'dark'] as const) {
        for (const where of ['window', 'left', 'right'] as const) {
          const { context, page } = await aWindow(width, theme, where)
          try {
            await openTheConversation(page)
            const name = `${where}-${String(width)}-${theme}`
            const covers = await page.evaluate((heading) => {
              const head = document.querySelector(heading)?.getBoundingClientRect()
              if (head === undefined) return true
              return (document.elementFromPoint(head.left + head.width / 2, head.top + head.height / 2)?.closest('.px-chat') ?? null) !== null
            }, HOMES_HEADING)
            const above = page.locator(covers ? '.px-chat-them' : HOMES_HEADING).first()
            await putTheMadeUpLabelIn(page, LABEL, above, name)
            await page.waitForTimeout(400)
            await page.screenshot({ path: join(dir, `${name}-at-rest.png`) })
            if (width === 1440 || width === 390) {
              await page.setInputFiles('.px-chat-attach-file', [
                { name: 'made-up-shot.png', mimeType: 'image/png', buffer: A_REAL_PNG },
                { name: 'notes.txt', mimeType: 'text/plain', buffer: SOME_NOTES },
              ])
              await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
              await putTheMadeUpLabelIn(page, LABEL, above, `${name} held`)
              await page.waitForTimeout(400)
              await page.screenshot({ path: join(dir, `${name}-held.png`) })
            }
          } finally {
            await context.close()
          }
        }
      }
    }, 600_000)
  }
})
