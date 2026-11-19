// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON SENDS A PICTURE IN A MESSAGE, FROM THIS MACHINE OR FROM ANOTHER ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M65 of design/messages/ACCEPTANCE.md section 38: a person on another machine can upload a
 * picture in the chat and send it. Before, a screenshot could only be copied over with scp.
 *
 * Six things:
 *
 *   1. THE COMPOSER DRAWS NO SIZE LINE, even after it has read the server's limit.
 *   2. A FILE THAT IS NOT A PICTURE IS HELD AS A FILE, under its name with no picture drawn, and is
 *      taken out again. The writing box has one attach press, and it takes any file.
 *   3. A FILE PAST THE LIMIT IS REFUSED IN THE COMPOSER, before anything is sent, naming both
 *      numbers.
 *   4. A PICTURE CHOSEN AND SENT ARRIVES AS AN IMAGE BLOCK ON THE MESSAGE, and the conversation
 *      draws it — which means the bytes came back through `GET /api/file`, whose confinement is the
 *      one the criterion asks for: a live record in this project points at the file.
 *   5. THE ALT TEXT IS THE FILE'S NAME WHEN NOBODY WROTE ONE. The owner's criterion says exactly that.
 *   6. IT WORKS THROUGH THE OTHER-MACHINES DOOR. The picture is sent on the second address — the
 *      listener a call from another machine arrives on — and the message that carries it is written there
 *      too, and the file is then readable here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PREVIEW ROOT IS NAMED, AND WHY THAT IS NOT WEAKENING ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * A picture sent in a message is stored beside the database, and `GET /api/file` reads only inside
 * a preview root. A test stack's database is in a temporary directory of its own, so without this
 * the upload door would REFUSE — which is the door being right rather than the test being wrong:
 * it will not store a picture nothing could ever draw. So this test makes its own directory, serves
 * the database from it, and names it as a root, which is what a real installation gets for free by
 * keeping its database inside the checkout.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw the size line again                           → case 1
 *   refuse a file that is not a picture, or draw it    → case 2
 *   take a file past the limit                         → case 3
 *   send the words and drop the picture                → case 4
 *   store an empty alt, or invent one                  → case 5
 *   answer the picture door only on loopback           → case 6
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PICTURE_WORDS, inMegabytes } from '../src/web/components/PictureToSend.tsx'
import { type LiveApp, liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { openTheChat } from './open-the-chat.ts'

/** A one pixel png, so what is sent is a real picture rather than bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** The second address this stack is also served on: the listener a call from another machine arrives on. */
const OTHER_ADDRESS = '127.0.0.2'

/** Small enough that a browser can hold it and past a limit set low for this test. */
const LIMIT = 4096

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * The chat's key for the agent's contact row. A row is keyed by the agent's registry id, which is
 * not its handle, so it is set once the agent is registered.
 */
let THE_AGENT_ROW = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let page: Page
let ours = ''
let previousRoots: string | undefined
let previousLimit: string | undefined

beforeAll(async () => {
  ours = aTestDatabaseFolder('picture-sent')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  previousLimit = process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES']
  // THE CHECKOUT STAYS A ROOT so that everything else a page previews still works; this test's own
  // directory is added because that is where this stack's database, and therefore its pictures, are.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  // A LOW LIMIT, so the refusal can be met with a small file instead of a ten megabyte one.
  process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES'] = String(LIMIT)

  app = await liveApp({
    name: 'picture-sent',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    addressForOtherMachines: OTHER_ADDRESS,
    database: join(ours, 'panelx.db'),
  })
  page = app.page

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // THE OTHER DOOR IS THE OWNER'S OTHER COMPUTER, WHICH THEY TRUST. What they send from there carries their name and no key,
  // and since item 1 of a decision, that counts as the owner only from a machine the office trusts while the window
  // is open; `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says how.
  await trustTheMachineThatCallsThroughTheOtherDoor(
    { api: app.api, keysFile: join(ours, 'keys.json') },
    `http://${OTHER_ADDRESS}:${String(app.apiPort)}`,
  )
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  const agentId = agents.find((one) => one.handle === 'builder-x')?.id ?? ''
  expect(agentId, 'builder-x has no registry row').not.toBe('')
  THE_AGENT_ROW = `agent:${agentId}`
  // ONE LINE SO THE CONTACT ROW EXISTS AND THE CONVERSATION CAN BE OPENED.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' },
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
  if (previousLimit === undefined) delete process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES']
  else process.env['MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES'] = previousLimit
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
  await page.waitForSelector(`.px-chat-contact[data-contact="${THE_AGENT_ROW}"]`, { timeout: 15_000 })
  await page.click(`.px-chat-contact[data-contact="${THE_AGENT_ROW}"]`)
  await page.waitForSelector('.px-chat-said', { timeout: 15_000 })
  await page.waitForSelector('.px-chat-attach-add', { timeout: 15_000 })
}

/**
 * Every message in this project, as the pool hands them to a screen.
 *
 * THE POOL AND NOT THE RECORD, so this reads what any reader gets rather than what was stored: a
 * picture that never reached the wire would be a picture no screen could draw.
 */
async function everyMessage(): Promise<{ body: string; pictures: { path: string; alt: string; type: string }[] }[]> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  const said = (await read.json()) as {
    messages: { body: string; pictures: { path: string; alt: string; type: string }[] }[]
  }
  return said.messages
}

// ---------------------------------------------------------------------------- the cases

describe('a person sends a picture in a message', () => {
  it('does not draw a size line in the composer', async () => {
    const limitRead = page.waitForResponse((response) => response.url().includes('/api/messages/pictures') && response.request().method() === 'GET' && response.ok(), { timeout: 30_000 })
    await openTheConversation()
    await limitRead
    await page.locator('.px-chat-attach-file').waitFor({ state: 'attached', timeout: 15_000 })
    expect(await page.locator('.px-chat-attach-limits').count()).toBe(0)
  }, 120_000)

  it('holds a file that is not a picture under its name, draws no picture of it, and takes it out again', async () => {
    await page.setInputFiles('.px-chat-attach-file', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('these are not a picture'),
    })
    await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
    expect(await page.textContent('.px-chat-attach-held .px-chat-attach-name')).toContain('notes.txt')
    expect(await page.$('.px-chat-attach-held img')).toBe(null)
    expect(await page.$('.px-chat-attach-fault')).toBe(null)
    // AND IT COMES OUT AGAIN, so the cases after this one start with nothing held.
    await page.click('.px-chat-attach-held .px-chat-attach-out')
    await page.waitForFunction(() => document.querySelector('.px-chat-attach-held') === null, undefined, { timeout: 15_000 })
  }, 120_000)

  it('refuses a picture past the limit, naming both numbers', async () => {
    await page.setInputFiles('.px-chat-attach-file', {
      name: 'whole-screen.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(LIMIT + 1, 7),
    })
    await page.waitForFunction(
      (name) => (document.querySelector('.px-chat-attach-fault')?.textContent ?? '').includes(String(name)),
      'whole-screen.png',
      { timeout: 15_000 },
    )
    const fault = await page.textContent('.px-chat-attach-fault')
    expect(fault).toBe(PICTURE_WORDS.tooBig('whole-screen.png', inMegabytes(LIMIT + 1), inMegabytes(LIMIT)))
    expect(await page.$('.px-chat-attach-held')).toBe(null)
  }, 120_000)

  it('sends the picture with the words, and the conversation draws it', async () => {
    await page.setInputFiles('.px-chat-attach-file', {
      name: 'handoverv2test.png',
      mimeType: 'image/png',
      buffer: A_REAL_PNG,
    })
    await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
    expect(await page.textContent('.px-chat-attach-name')).toContain('handoverv2test.png')
    // WHILE THERE ARE NO WORDS, THE COMPOSER SAYS WHY SEND IS DARK rather than leaving a dead press.
    expect(await page.textContent('.px-chat-attach-need')).toContain(PICTURE_WORDS.wordsToo)

    await page.fill('.px-chat-write textarea', 'Look at the wiring on the left arm.')
    // NOBODY IS ASKED WHAT THE PICTURE SHOWS ANY MORE. Criterion M68: a press on the picture opens it in a
    // floating window, and no "what it shows" description is wanted. The box this line used to
    // fill is gone, and the alt text a message carries is the file's own name.
    expect(await page.$('.px-chat-attach-alt')).toBe(null)
    await page.click('.px-chat-write .px-chat-send')

    // THE PICTURE IS DRAWN IN THE CONVERSATION, which means the bytes came back through the file
    // door — and that door serves a path only because this message points at it.
    await page.waitForSelector('.px-chat-said .px-chat-pics img', { timeout: 20_000 })
    // WAIT FOR THE DECODE AND NOT ONLY FOR THE ELEMENT. The <img> is in the document as soon as the
    // message is drawn; its bytes arrive from the file door a moment later. Reading naturalWidth
    // straight after waitForSelector read it before the decode and called that a failure, which is
    // a race in this test rather than anything about the door: it passed or failed on how busy the
    // machine was. Measured 12 September 2026, when wave 1's extra pages made the app heavy enough
    // to lose the race almost every time. The assertion below is unchanged and no weaker.
    await page.waitForFunction(
      () => ((document.querySelector('.px-chat-said .px-chat-pics img') as HTMLImageElement | null)?.naturalWidth ?? 0) > 0,
      { timeout: 20_000 },
    )
    const drew = await page.evaluate(
      () => (document.querySelector('.px-chat-said .px-chat-pics img') as HTMLImageElement | null)?.naturalWidth ?? 0,
    )
    expect(drew, 'the browser decoded the bytes the door served').toBe(1)

    // AND THE COMPOSER IS EMPTY AGAIN, so the next message does not carry this picture too.
    expect(await page.$('.px-chat-attach-held')).toBe(null)

    const messages = await everyMessage()
    const mine = messages.find((one) => one.body.includes('the wiring on the left arm'))
    expect(mine, 'the message that was sent').toBeDefined()
    const pictures = mine?.pictures
    expect(pictures?.length).toBe(1)
    expect(pictures?.[0]?.type).toBe('image')
    expect(pictures?.[0]?.alt).toBe('handoverv2test.png')
    // THE FILE REALLY IS ON DISK, AND IT IS THE BYTES THAT WERE SENT rather than a file of the right
    // size. Nothing here reads the browser's copy: this is the file the server wrote.
    expect(pictures?.[0]?.path.startsWith(ours), `stored in ${String(pictures?.[0]?.path)}`).toBe(true)
    expect(readFileSync(String(pictures?.[0]?.path)).equals(A_REAL_PNG)).toBe(true)
  }, 180_000)

  it("uses the file's name as what the picture shows, nobody being asked for one", async () => {
    await page.setInputFiles('.px-chat-attach-file', {
      name: 'second-shot.png',
      mimeType: 'image/png',
      buffer: A_REAL_PNG,
    })
    await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
    await page.fill('.px-chat-write textarea', 'And this one.')
    await page.click('.px-chat-write .px-chat-send')
    await page.waitForFunction(
      () => document.querySelectorAll('.px-chat-said .px-chat-pics').length >= 2,
      undefined,
      { timeout: 20_000 },
    )
    const messages = await everyMessage()
    const mine = messages.find((one) => one.body.includes('And this one'))
    expect(mine, 'the second message that was sent').toBeDefined()
    expect(mine?.pictures[0]?.alt, 'the file name stands in for words nobody wrote').toBe('second-shot.png')
  }, 180_000)

  it('takes a picture through the door other machines call, and the file is readable here', async () => {
    const other = `http://${OTHER_ADDRESS}:${String(app.apiPort)}`
    const sent = await fetch(`${other}/api/messages/pictures`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: A_REAL_PNG.toString('base64') }),
    })
    expect(sent.status, await sent.clone().text()).toBe(201)
    const stored = (await sent.json()) as { picture: { path: string; mime: string; bytes: number } }
    expect(stored.picture.mime).toBe('image/png')
    expect(stored.picture.bytes).toBe(A_REAL_PNG.length)

    // AND THE MESSAGE CARRYING IT, WRITTEN THROUGH THE SAME DOOR, as a browser on another machine would.
    const filed = await fetch(`${other}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'message',
        title: 'From the other machine',
        data: {
          body: 'Sent from the other machine.',
          to: [{ kind: 'agent', id: 'builder-x' }],
          pictures: [{ id: 'p-1', type: 'image', path: stored.picture.path, alt: 'handoverv2test' }],
        },
      }),
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, await filed.clone().text()).toBe(409)
    const record = (await filed.json()) as { record: { data: { writtenFrom?: { how?: string } } } }
    // IT REALLY CAME IN ON THE OTHER LISTENER, which is what makes this the other-machine case rather than
    // a second name for loopback. Criterion M63 is what records it.
    expect(record.record.data.writtenFrom?.how).not.toBe('this machine')

    // AND THE PICTURE IS READABLE ON THIS MACHINE, through the ordinary preview door, because the
    // message now points at it. This is the whole of what criterion M65 asks for: no scp.
    const read = await fetch(`${app.api}/api/file?path=${encodeURIComponent(stored.picture.path)}`, {
      headers: AS_THE_OWNER,
    })
    expect(read.status, await read.clone().text()).toBe(200)
    expect(read.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await read.arrayBuffer()).equals(A_REAL_PNG)).toBe(true)
  }, 120_000)

  it('refuses bytes that are not a picture, and an empty file, at the door itself', async () => {
    const notOne = await fetch(`${app.api}/api/messages/pictures`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: Buffer.from('hello world').toString('base64') }),
    })
    expect(notOne.status).toBe(415)
    expect(((await notOne.json()) as { error: string }).error).toContain('Nothing was written')

    const nothing = await fetch(`${app.api}/api/messages/pictures`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: '====' }),
    })
    expect(nothing.status).toBe(400)

    const tooBig = await fetch(`${app.api}/api/messages/pictures`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: Buffer.alloc(LIMIT + 1, 7).toString('base64') }),
    })
    expect(tooBig.status).toBe(413)
    const why = ((await tooBig.json()) as { error: string }).error
    // BOTH NUMBERS, so somebody who meets it knows by how much.
    expect(why).toContain(String(LIMIT + 1))
    expect(why).toContain(String(LIMIT))
  }, 120_000)
})
