// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE CARRIES PICTURES, AND EACH BROWSER SAYS HOW THEY ARE DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M64 of design/messages/ACCEPTANCE.md sections 36 and 37: the chat can carry pictures, and a
 * setting has three answers: 1. show pictures by default; 2. show a picture after a press; 3. show only
 * the picture's path.
 *
 * Five things, all of them measured in a real browser on the real product:
 *
 *   1. A MESSAGE CARRYING A PICTURE DRAWS IT, for a reader who has chosen nothing. The bytes come
 *      through `GET /api/file`, which serves the file because this message points at it.
 *   2. `On a press` DRAWS THE ALT TEXT AND NO PICTURE, and nothing is fetched until the press.
 *      The second half is the point of the choice and is measured by counting requests for the
 *      file, not by looking for an element.
 *   3. THE PRESS THEN DRAWS IT.
 *   4. `Path only` DRAWS THE PATH AND NO PICTURE, and again asks for nothing.
 *   5. THE POOL PAGE OBEYS THE SAME CHOICE, because the setting governs it too.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PICTURE IS WRITTEN INTO THE CHECKOUT'S OWN .logs
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/file` serves a file only from inside a preview root, and with nothing configured those
 * are this checkout and `~/.cache/mole-office`. A test file writing into the second would be
 * writing into the owner's own directory, which lib/avatars.ts argues against by name. `.logs/` is
 * inside the checkout, is ignored by git, and this test removes what it made. Inside `.logs/` it
 * writes into a temporary folder of its own, never a fixed one (problem x25LcNeJ7RFi).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw no pictures at all                              → case 1
 *   draw the picture whatever the setting says           → cases 2 and 4
 *   fetch every picture and hide the ones not wanted     → the request counts in cases 2 and 4
 *   draw a blank placeholder with no alt text            → case 2
 *   let the press do nothing                             → case 3
 *   draw the path with no path in it                     → case 4
 *   read the setting again, differently, on the pool page → case 5
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import {
  MESSAGE_PICTURE_PRESS,
  MESSAGE_PICTURE_WORDS,
} from '../src/shared/messagepictures.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

/** A one pixel png, so the file on disk is a real picture rather than bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const WHAT_IT_SHOWS = 'The two arms crossed in the Handover v2 drawing'
const THE_WORDS = 'Here is the shot from loquat.'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * THIS FILE'S OWN FOLDER, made in beforeAll and removed in afterAll. It is a temporary folder inside
 * this checkout's .logs/, because the file door serves only from a preview root (see above). It is
 * made by mkdtempSync, so two runs never share it (problem x25LcNeJ7RFi). `.logs/` is made first,
 * because a fresh checkout has none, and mkdtempSync does not make the folder it is given: a test
 * that skipped that step failed with ENOENT before any case ran (run 4DZRM3lSK_xc).
 */
let OURS = ''
/** The picture the message carries, in OURS. */
let PICTURE = ''
/**
 * A SECOND FILE, WHICH ONLY THE MESSAGE IN THE OTHER PROJECT POINTS AT.
 *
 * It has to be a different file. The preview door serves a path when a live record IN THE PROJECT
 * BEING ASKED ABOUT points at it — so if both messages named one file, asking in the wrong project
 * would still find the right record and the cross-project case would prove nothing. Measured: with
 * one shared file the case passed with the fix reverted.
 */
let ELSEWHERE = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE AGENT'S CONTACT ROW, as `data-contact` names it: `agent:` and the agent's registry id. The
 * office gives a new agent an id of its own, which is not its handle, so it is read after the agent
 * is filed.
 */
let theAgentRow = ''

let app: LiveApp
let page: Page

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'message-picture-test-'))
  PICTURE = join(OURS, 'handoverv2test.png')
  ELSEWHERE = join(OURS, 'from-the-other-project.png')
  writeFileSync(PICTURE, A_REAL_PNG)
  writeFileSync(ELSEWHERE, A_REAL_PNG)

  app = await liveApp({ name: 'message-pictures', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
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
  const roster = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(roster.status, await roster.clone().text()).toBe(200)
  const registered = ((await roster.json()) as { agents: { id: string; handle: string }[] }).agents.find(
    (one) => one.handle === 'builder-x',
  )
  if (registered === undefined) throw new Error('the registry holds no agent with the handle builder-x')
  theAgentRow = `agent:${registered.id}`

  // THE MESSAGE, FROM THE AGENT TO THE PERSON, carrying one picture. Written straight through the
  // record door, which is the door the composer uses, so what is drawn is what a sent message holds.
  const sent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' },
    body: JSON.stringify({
      kind: 'message',
      title: THE_WORDS,
      data: {
        body: THE_WORDS,
        to: [{ kind: 'person', id: THE_PERSON }],
        pictures: [{ id: 'p-1', type: 'image', path: PICTURE, alt: WHAT_IT_SHOWS }],
      },
    }),
  })
  expect(sent.status, await sent.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/** Count every request this page makes for the picture's own bytes, so "nothing was fetched" is measured. */
let askedFor = 0
function countTheRequests(): void {
  page.on('request', (req) => {
    if (req.url().includes('/api/file?path=')) askedFor += 1
  })
}

/**
 * Say which of the three answers the owner has chosen, and load the page again holding it.
 *
 * IT IS WRITTEN ON THE OWNER'S REGISTRY ROW AND NOT IN THIS BROWSER'S STORAGE. It was a browser setting
 * until decision rJphPkCG3l7X of 7 September 2026 settled that it follows the person, like every
 * other choice about how the owner's chat is drawn. This wrote into localStorage until then.
 *
 * THE RELOAD IS NOT OPTIONAL AND IT IS WHY THIS IS A FUNCTION. What the browser has been told the owner
 * chose reaches everything that draws through the chat panel's read of the owner's row, and `page.goto` to
 * an address that differs only in its hash does not run that again: it is one document and the
 * router handles it. That is measured, not assumed: without the reload every case below draws
 * `shown`.
 */
async function chooseInStorage(choice: string): Promise<void> {
  const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    body: JSON.stringify({ messagePictures: choice }),
  })
  expect(set.status, await set.clone().text()).toBe(200)
  await page.reload()
  await waitForThePage(page)
}

/** Open the panel and the conversation with the agent. */
async function openTheConversation(): Promise<void> {
  await page.goto(`${app.site}/#/`)
  await waitForThePage(page)
  await openTheChat(page)
  await page.waitForSelector('.px-chat', { timeout: 15_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector(`.px-chat-contact[data-contact="${theAgentRow}"]`, { timeout: 15_000 })
  await page.click(`.px-chat-contact[data-contact="${theAgentRow}"]`)
  await page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 15_000 })
}

/** What is on the screen where a picture would be. */
interface Drawn {
  /** How many pictures are actually drawn. */
  images: number
  /** The alt text on the placeholder, when there is one. */
  waiting: string | null
  /** The path drawn as text, when it is drawn. */
  path: string | null
  /** What the wrapper says this browser asked for, read off the element rather than off the store. */
  says: string | null
}

async function whatIsDrawn(): Promise<Drawn> {
  return page.evaluate(() => {
    const box = document.querySelector('.px-chat-said .px-chat-pics')
    if (box === null) return { images: 0, waiting: null, path: null, says: null }
    const wait = box.querySelector('.px-chat-pic-wait')
    const path = box.querySelector('.px-chat-pic-path code')
    return {
      images: box.querySelectorAll('img').length,
      waiting: wait === null ? null : (wait.textContent ?? ''),
      path: path === null ? null : (path.textContent ?? ''),
      says: box.getAttribute('data-pictures'),
    }
  })
}

// ---------------------------------------------------------------------------- the cases

describe('a message carries pictures, and this browser says how they are drawn', () => {
  it('draws the picture for a reader who has chosen nothing', async () => {
    countTheRequests()
    await openTheConversation()
    await page.waitForSelector('.px-chat-said .px-chat-pics img', { timeout: 15_000 })
    const drawn = await whatIsDrawn()
    expect(drawn.says, 'what a browser that has chosen nothing does').toBe('shown')
    expect(drawn.images).toBe(1)
    expect(drawn.waiting).toBe(null)
    // AND THE WORDS ARE STILL THERE. A picture is drawn WITH the message, not instead of it.
    expect(await page.textContent('.px-chat-said .px-chat-words')).toContain(THE_WORDS)
    // AND THE BYTES REALLY CAME THROUGH THE FILE DOOR, which is what makes the confinement the
    // criterion asks for the confinement this picture actually has.
    expect(askedFor).toBeGreaterThan(0)
    // WAIT FOR THE BYTES, NOT MERELY FOR THE ELEMENT, like the last case in this file does. The img
    // element exists the moment the panel draws it and carries a naturalWidth only once its bytes
    // have arrived and been decoded, and it is the decode this assertion is about. Read the width
    // the instant the selector resolves and the read loses the race against the fetch: measured
    // twice alone on 12 September 2026 at load 5 to 6, the width read 0 and the case went red with
    // nothing wrong in the product — the same test-side race ELQNsGOWey-q recorded on
    // a-picture-is-sent-in-a-message. A build that breaks the bytes still goes red here: the wait
    // then times out at twenty seconds instead of passing.
    await page.waitForFunction(
      () => (document.querySelector('.px-chat-pics img') as HTMLImageElement | null)?.naturalWidth === 1,
      undefined,
      { timeout: 20_000 },
    )
    const drew = await page.evaluate(
      () => (document.querySelector('.px-chat-pics img') as HTMLImageElement | null)?.naturalWidth ?? 0,
    )
    expect(drew, 'the browser decoded the bytes it was handed').toBe(1)
  }, 120_000)

  it('draws the alt text and asks for nothing, when this browser said on a press', async () => {
    await chooseInStorage('pressed')
    askedFor = 0
    await openTheConversation()
    await page.waitForSelector('.px-chat-said .px-chat-pic-wait', { timeout: 15_000 })
    const drawn = await whatIsDrawn()
    expect(drawn.says).toBe('pressed')
    expect(drawn.images, 'no picture is drawn until it is pressed').toBe(0)
    expect(drawn.waiting).toContain(WHAT_IT_SHOWS)
    expect(drawn.waiting).toContain(MESSAGE_PICTURE_PRESS.show)
    // THE HALF THAT MATTERS: nothing was fetched. A build that downloads every picture and then
    // hides it would pass every assertion above and fail this one.
    expect(askedFor, 'nothing was asked for before the press').toBe(0)
  }, 120_000)

  it('draws it when the placeholder is pressed', async () => {
    await page.click('.px-chat-said .px-chat-pic-wait')
    await page.waitForSelector('.px-chat-said .px-chat-pics img', { timeout: 15_000 })
    expect((await whatIsDrawn()).images).toBe(1)
    expect(askedFor, 'the press is what asked for it').toBeGreaterThan(0)
  }, 120_000)

  it('draws the path and asks for nothing, when this browser said path only', async () => {
    await chooseInStorage('path')
    askedFor = 0
    await openTheConversation()
    await page.waitForSelector('.px-chat-said .px-chat-pic-path', { timeout: 15_000 })
    const drawn = await whatIsDrawn()
    expect(drawn.says).toBe('path')
    expect(drawn.images).toBe(0)
    expect(drawn.path).toBe(PICTURE)
    // AND WHAT IT SHOWS IS STILL SAID. A path with nothing saying what is at the end of it is a
    // string rather than a picture.
    expect(await page.textContent('.px-chat-said .px-chat-pic-path')).toContain(WHAT_IT_SHOWS)
    expect(askedFor, 'the path is text, and text is not fetched').toBe(0)
  }, 120_000)

  it('draws the same answer on the pool page', async () => {
    // STILL `path`, from the case above, and this page is a different one reading the same choice.
    await page.goto(`${app.site}/#/messages`)
    await waitForThePage(page)
    await page.waitForSelector('.px-ms-one', { timeout: 15_000 })
    const drawn = await page.evaluate(() => {
      const box = document.querySelector('.px-ms-one .px-chat-pics')
      return box === null
        ? null
        : {
            images: box.querySelectorAll('img').length,
            path: box.querySelector('.px-chat-pic-path code')?.textContent ?? null,
            says: box.getAttribute('data-pictures'),
          }
    })
    expect(drawn, 'the pool draws the pictures a message carries').not.toBe(null)
    expect(drawn?.says).toBe('path')
    expect(drawn?.images).toBe(0)
    expect(drawn?.path).toBe(PICTURE)
  }, 120_000)

  /**
   * A MESSAGE WRITTEN IN ANOTHER PROJECT STILL DRAWS ITS PICTURE.
   *
   * MEASURED, NOT IMAGINED. On 7 September 2026, on a copy of the owner's corpus, every picture in a message
   * from another project drew a refusal instead: *Nothing in this project points at this file;
   * something in "panelx" does.* The refusal was right. The request was wrong. The chat is the
   * person's in every project (criterion M55), so a message from one project is drawn beside this
   * one's — and the preview door serves a file on the authority of a record in the project being
   * ASKED ABOUT. The picture is therefore asked for where its own message lives.
   */
  it('draws a picture on a message written in another project', async () => {
    const elsewhere = await fetch(`${app.api}/api/workspaces`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ id: 'another', title: 'Another project' }),
    })
    expect([200, 201]).toContain(elsewhere.status)

    const sent = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: {
        ...AS_THE_OWNER,
        'x-mole-office-workspace': 'another',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'builder-x',
      },
      body: JSON.stringify({
        kind: 'message',
        title: 'From the other project',
        data: {
          body: 'This one was written in the other project.',
          to: [{ kind: 'person', id: THE_PERSON }],
          pictures: [{ id: 'p-1', type: 'image', path: ELSEWHERE, alt: 'A shot filed in the other project' }],
        },
      }),
    })
    expect(sent.status, await sent.clone().text()).toBe(201)

    // BACK TO PICTURES SHOWN, and standing in `default` while the message lives in `another`.
    await chooseInStorage('shown')
    await openTheConversation()
    // WAIT FOR BOTH TO HAVE DECODED, not merely to be in the document. An `img` element exists the
    // moment it is drawn and carries a width only once the bytes are there, and it is the bytes
    // this case is about.
    await page.waitForFunction(
      () => {
        const drawn = [...document.querySelectorAll('.px-chat-said .px-chat-pics img')]
        return drawn.length >= 2 && drawn.every((one) => (one as HTMLImageElement).naturalWidth > 0)
      },
      undefined,
      { timeout: 20_000 },
    )
    const decoded = await page.evaluate(() =>
      [...document.querySelectorAll('.px-chat-said .px-chat-pics img')].map(
        (one) => (one as HTMLImageElement).naturalWidth,
      ),
    )
    expect(decoded, 'both pictures decoded, whichever project their message is in').toEqual([1, 1])
  }, 180_000)

  it('names its three answers where a person reads them', () => {
    // THE NAMES ARE NAMES AND NOT SENTENCES, which is the rule for every label in this product.
    for (const word of Object.values(MESSAGE_PICTURE_WORDS)) {
      expect(word.split(' ').length).toBeLessThanOrEqual(3)
      expect(word.endsWith('.')).toBe(false)
    }
  })
})
