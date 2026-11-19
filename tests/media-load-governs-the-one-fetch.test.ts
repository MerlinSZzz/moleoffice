// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S MEDIA-LOAD CHOICE GOVERNS THE ONE FETCH. Criterion U5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A setting: transfer by default, do not transfer by default, or transfer and show after a press. Three choices,
 * the person's own. This test measures what each one DOES to a report with a picture in it, in a
 * real browser, by counting requests for the file rather than by looking for an element:
 *
 *   1. WITH THE PAGE. The picture is fetched and drawn, exactly as every report drew it before this
 *      setting existed.
 *   2. NEVER. Nothing is fetched at all, and the figure says which choice is in force, shows the
 *      picture's name, and says its size is not known because nothing has been loaded. There is no
 *      press, because there is nothing a press could do.
 *   3. ON A PRESS. Nothing is fetched until the press, and the press fetches it once.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE COUNT AND NOT THE ELEMENT
 * ---------------------------------------------------------------------------------------
 *
 * A build that fetched every picture and then hid the ones the setting did not want would draw the
 * right thing and do the wrong thing. The whole point of `never` is that the bytes were not asked
 * for. `tests/a-message-carries-pictures.test.ts` counts requests for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * THE ARCHIVE OF THE SETTING
 * ---------------------------------------------------------------------------------------
 *
 * The choice is on the person's registry row (people.media_load), so it is written through
 * PATCH /api/participants and the page is reloaded: what the browser has been told the owner chose reaches
 * a report's figure through the chat panel's read of the owner's row, the same path the message pictures
 * setting takes.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/** A one pixel png, so the file on disk is a real picture rather than bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * THIS FILE'S OWN FOLDER, made in beforeAll and removed in afterAll. It is a temporary folder inside
 * this checkout's .logs/, because the file door serves only from a preview root (see tests/a-message-carries-pictures.test.ts, which says why it is inside the checkout). It is
 * made by mkdtempSync, so two runs never share it (problem x25LcNeJ7RFi). `.logs/` is made first,
 * because a fresh checkout has none, and mkdtempSync does not make the folder it is given: a test
 * that skipped that step failed with ENOENT before any case ran (run 4DZRM3lSK_xc).
 */
let OURS = ''
/** The picture the report carries, in OURS. */
let PICTURE = ''
const WHAT_IT_SHOWS = 'The two arms crossed in the Handover v2 drawing'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let recordId = ''

/** Every request this page makes for a file's bytes, so "nothing was fetched" is measured. */
let askedFor = 0

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'media-load-test-'))
  PICTURE = join(OURS, 'report-picture.png')
  writeFileSync(PICTURE, A_REAL_PNG)

  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.

  // The owner's act 3a of 15 September 2026 made a record page open at the

  // conclusion, where the body holds the summary and nothing else, so a test that measures a

  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and

  // waited for a selector that would never appear. `opensAt` writes the reader's own stored

  // choice before the page loads, so this file is about its own subject again and not about the

  // level a page opens at. That level has its own test in

  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.

  app = await liveApp({ opensAt: 'full', name: 'media-load', viewport: { width: 1440, height: 1000 } })
  app.page.on('request', (req) => {
    if (req.url().includes('/api/file?path=')) askedFor += 1
  })

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a picture in it',
      summary: 'One image block, for the owner\'s media-load setting to govern.',
      data: {
        blocks: [
          { id: 'b-1', type: 'heading', text: 'What was photographed' },
          {
            id: 'b-2',
            type: 'text',
            text:
              'The report body carries a picture, and whether the bytes are fetched at all is the ' +
              'question this page answers. The picture is one pixel and real.',
          },
          { id: 'b-3', type: 'image', path: PICTURE, alt: WHAT_IT_SHOWS },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

/** Say which answer the owner has chosen, and load the report again holding it. */
async function choose(choice: string): Promise<void> {
  const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: choice }),
  })
  expect(set.status, await set.clone().text()).toBe(200)
  // A GOTO TO AN ADDRESS THAT DIFFERS ONLY IN ITS HASH DOES NOT RUN THE DOCUMENT AGAIN, so the
  // reload is what makes a fresh Chat read the row and tell the report's figure. Measured and said
  // in tests/a-message-carries-pictures.test.ts, which does the same thing for the same reason.
  await app.page.goto(`${app.site}/#${recordPath(recordId)}`, { timeout: 60_000 })
  await app.page.reload()
  await openTheReport()
}

/**
 * Wait for the picture block to settle, whichever way it went.
 *
 * SETTLED MEANS THE PERSON'S CHOICE HAS BEEN READ. The figure draws a held stand before the row is
 * read, with `data-media-load="not-read"`, and that is not a state this test may read: it is the
 * moment before the answer. So the wait ignores it and wants either a real image or a held stand
 * that names the choice in force.
 */
async function openTheReport(): Promise<void> {
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.sb-image', { timeout: 30_000 })
  await app.page.waitForFunction(
    () => {
      const box = document.querySelector('.sb-image')
      if (box === null) return false
      const held = box.querySelector('.sb-image-held')
      if (held !== null) return held.getAttribute('data-media-load') !== 'not-read'
      const media = box.querySelector('img, video')
      if (media !== null) return true
      const stand = box.querySelector('.sb-image-stand')
      if (stand === null) return false
      const phase = stand.getAttribute('data-preview')
      return phase !== 'asking' && phase !== 'not-asked'
    },
    undefined,
    { timeout: 30_000 },
  )
}

/** What the picture block drew. */
async function whatIsDrawn(): Promise<{
  media: string | null
  held: boolean
  choice: string | null
  said: string | null
  size: string | null
  alt: string | null
  press: number
}> {
  return app.page.$eval('.sb-image', (box) => {
    const media = box.querySelector('img, video')
    const held = box.querySelector('.sb-image-held')
    return {
      media: media === null ? null : media.tagName,
      held: held !== null,
      choice: held?.getAttribute('data-media-load') ?? null,
      said: held?.querySelector('.sb-image-held-said')?.textContent ?? null,
      size: held?.querySelector('.sb-image-size')?.textContent ?? null,
      alt: held?.querySelector('.sb-image-alt')?.textContent ?? null,
      press: held?.querySelectorAll('.sb-image-press').length ?? 0,
    }
  })
}

describe("the person's media-load choice governs the one fetch", () => {
  it('with the page, fetches and draws the picture, exactly as before', async () => {
    askedFor = 0
    await choose('with-page')
    await app.page.waitForSelector('.sb-image img', { timeout: 20_000 })
    const drawn = await whatIsDrawn()
    expect(drawn.media).toBe('IMG')
    expect(drawn.held, 'the held stand was drawn for a picture the person asked to load').toBe(false)
    expect(askedFor, 'the bytes were fetched').toBeGreaterThan(0)
    // AND IT IS THE BYTES MOLE OFFICE SERVED, not the file path left to the browser.
    const src = await app.page.$eval('.sb-image img', (img) => img.getAttribute('src') ?? '')
    expect(src.startsWith('blob:')).toBe(true)
  }, 180_000)

  it('with never, fetches nothing at all and says which choice is in force', async () => {
    askedFor = 0
    await choose('never')
    const drawn = await whatIsDrawn()
    expect(drawn.media, 'a picture was fetched and drawn for a person who chose never').toBe(null)
    expect(drawn.held).toBe(true)
    expect(drawn.choice, 'the figure does not say which choice is in force').toBe('never')
    // THE LINE NAMES THE CHOICE AS A PERSON WOULD SAY IT, which is the word on the control and not
    // the stored word and not the mechanism. Criterion U5's last sentence.
    expect(drawn.said ?? '', 'the figure does not name the choice in plain words').toContain('Never')
    // THE HALF THAT MATTERS: nothing was asked for. A build that fetched it and hid it would pass
    // every other assertion here and fail this one.
    expect(askedFor, 'nothing was asked for under never').toBe(0)
    // AND WHAT IT CAN SAY WITHOUT THE BYTES: the name and the honest absence of a size.
    expect(drawn.alt).toBe(WHAT_IT_SHOWS)
    expect(drawn.size ?? '', 'the figure does not say the size is unknown').toContain('not known')
    // AND NO PRESS, because there is nothing a press could do.
    expect(drawn.press).toBe(0)
  }, 180_000)

  it('with on a press, fetches nothing until the press, and the press fetches it once', async () => {
    askedFor = 0
    await choose('on-press')
    const before = await whatIsDrawn()
    expect(before.media).toBe(null)
    expect(before.held).toBe(true)
    expect(before.choice).toBe('on-press')
    expect(before.said ?? '', 'the figure does not name the choice in plain words').toContain('On a press')
    expect(before.press, 'the press is offered').toBe(1)
    expect(askedFor, 'nothing was asked for before the press').toBe(0)

    await app.page.click('.sb-image-press')
    await app.page.waitForSelector('.sb-image img', { timeout: 20_000 })
    const after = await whatIsDrawn()
    expect(after.media).toBe('IMG')
    expect(after.held).toBe(false)
    expect(askedFor, 'the press is what asked for it').toBeGreaterThan(0)
  }, 180_000)

  // PUT IT BACK, so a run of this file twice starts from the same place.
  it('takes the choice away again, and the default is with the page', async () => {
    const cleared = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mediaLoad: '' }),
    })
    expect(cleared.status, await cleared.clone().text()).toBe(200)
  })
})
