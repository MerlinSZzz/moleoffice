// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIRED PAGE LOADS A FILE BY A TICKET, ASKS AGAIN ONCE WHEN THE LOAD FAILS, AND LINKS TO THE RECORD (wave 13s, line
 * 13s, SEC-2).
 *
 * A browser proves the person with two halves of one device key. Its page sends the header half on its own calls, but
 * a video, a picture, a frame or a link is loaded by the browser, which sends the cookie half alone, and one half alone
 * proves nothing. So a paired page asks the ticket door, POST /api/file/ticket, for an address that opens one file in
 * this browser for a while, and loads the file from that address. tests/a-file-ticket.test.ts pins the door and the
 * ticket; this file pins the page.
 *
 * A ticket may end while the page is open: it is unused for 30 minutes, or 12 hours old, or the office restarted. The
 * page then asks for one more ticket and loads again, once, with no reload of the page. If that load fails too, the
 * block says the file could not be loaded, and the page asks no more.
 *
 * A link is not loaded until it is pressed, and a person may copy it, so a link's address is the record's own page,
 * never a file address. A press on it goes to the file by a ticket.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, IN A REAL BROWSER PAIRED AS THE PERSON
 * ---------------------------------------------------------------------------------------
 *
 *   1. the first load of a video by a ticket is refused, and the page asks the ticket door once more and plays the
 *      video, with no reload; when every load by a ticket is refused, the block says so and the page asks no third
 *      time;
 *   2. the open and save links lead to the record's own page and to no file address, and the save link still saves
 *      the file's own bytes.
 *
 * The refusal is made by the browser's own request routing, in the words the office refuses a ticket with, so the case
 * does not wait 30 minutes. Only loads the browser makes for a video are refused, never a call of the page's own.
 *
 * A page that holds no half is not paired, its loads carry no half, and it loads a file from the door's own address as
 * before. tests/a-path-block-video-plays-from-the-door.test.ts and the other report media tests keep pinning that.
 *
 * Where the page puts the video's time back after a failed load is not pinned here: the refused load is the first,
 * at time 0.
 *
 * THE FILM AND THE ARCHIVE ARE MADE HERE: three seconds of a moving square, recorded as WebM by this browser, and an
 * empty zip archive. Both are written into a folder of this test's own inside the checkout, a preview root, which it deletes.
 * No half and no ticket is printed.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { Request, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { pairTheContext } from './a-paired-context.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LABEL = 'Demo: a square crosses the frame'
/** An empty zip archive: the end-of-archive mark and nothing else. A file that is neither shown nor played gets both presses. */
const AN_ARCHIVE = Buffer.concat([Buffer.from('PK\x05\x06', 'latin1'), Buffer.alloc(18)])
const ARCHIVE_NAME = 'a-made-up-archive.zip'

let app: LiveApp
let folder = ''
let film = ''
let archive = ''
let report = ''

/** How many loads by a ticket the browser's routing still refuses. */
let refusalsLeft = 0
/** What the page asked and loaded since the case last opened its page. */
const seen = { ticketAsksForTheFilm: 0, ticketAsksForTheArchive: 0, refusedLoads: 0, pagesLoaded: 0 }

function cleared(): void {
  seen.ticketAsksForTheFilm = 0
  seen.ticketAsksForTheArchive = 0
  seen.refusedLoads = 0
  seen.pagesLoaded = 0
}

/** The path a ticket ask names, read from the page's own request. */
function theAskedPath(request: Request): string | null {
  try {
    const body = JSON.parse(request.postData() ?? '{}') as { path?: unknown }
    return typeof body.path === 'string' ? body.path : null
  } catch {
    return null
  }
}

/** Refuse a load of a video by a ticket while refusals are left, as the office refuses a ticket it no longer holds. */
async function refuseATicketedLoad(route: Route): Promise<void> {
  const request = route.request()
  const asked = new URL(request.url())
  if (request.resourceType() === 'media' && asked.searchParams.has('ticket') && refusalsLeft > 0) {
    refusalsLeft -= 1
    seen.refusedLoads += 1
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: t('server.fileTicketNotHonoured'), code: 'fileTicketNotHonoured' }),
    })
    return
  }
  await route.continue()
}

async function open(): Promise<void> {
  await app.page.goto('about:blank')
  cleared()
  await app.page.goto(`${app.site}/#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** The path block with the film. */
function theFilmsBlock() {
  return app.page.locator('.sb-pathblock', { has: app.page.locator('.sb-path-label', { hasText: LABEL }) })
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

beforeAll(async () => {
  mkdirSync(resolve('.logs'), { recursive: true })
  // INSIDE THE CHECKOUT, which is a preview root, so the door may serve the film and the archive.
  folder = aTestDatabaseFolder('a-ticketed-load', resolve('.logs'))
  app = await liveApp({ name: 'a-ticketed-load', viewport: { width: 1440, height: 1000 }, workspace: 'default' })

  const setting = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  // This browser records the film, so it is one this browser can play.
  await app.page.goto(`${app.site}/`)
  const bytes = await app.page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(20)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      recorder.onerror = () => reject(new Error('Could not record the test film'))
    })
    recorder.start()
    for (let frame = 0; frame < 60; frame++) {
      context.fillStyle = '#16304d'
      context.fillRect(0, 0, 320, 180)
      context.fillStyle = '#ffd166'
      context.fillRect(10 + frame * 4, 60, 50, 50)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    recorder.stop()
    const blob = await done
    for (const track of stream.getTracks()) track.stop()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  film = join(folder, 'a-square-crosses.webm')
  writeFileSync(film, Buffer.from(bytes))
  archive = join(folder, ARCHIVE_NAME)
  writeFileSync(archive, AN_ARCHIVE)

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a made-up film and a made-up archive',
      summary: 'A path block of kind video and a file block of an archive. The test made both files.',
      data: {
        for: 'The ticketed load test',
        date: '2026-11-22',
        blocks: [
          { id: 'b-1', type: 'text', text: 'The film and the archive below were made by the test. Neither is a real observation.' },
          { id: 'b-film', type: 'path', label: LABEL, path: film, kind: 'video' },
          {
            id: 'b-archive', type: 'file', path: archive, name: ARCHIVE_NAME, size: AN_ARCHIVE.length,
            hash: createHash('sha256').update(AN_ARCHIVE).digest('hex').slice(0, 16),
          },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  report = ((await filed.json()) as { record: { id: string } }).record.id

  // PAIRED AS THE PERSON, so the page holds the header half and the browser the cookie half.
  await pairTheContext(app.context, app.api)
  await app.page.route('**/api/file?**', refuseATicketedLoad)
  app.page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === app.page.mainFrame() && request.url().startsWith(app.site)) {
      seen.pagesLoaded += 1
    }
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/file/ticket') {
      const path = theAskedPath(request)
      if (path === film) seen.ticketAsksForTheFilm += 1
      if (path === archive) seen.ticketAsksForTheArchive += 1
    }
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (folder) rmSync(folder, { recursive: true, force: true })
}, 60_000)

describe('a paired page loads a file by a ticket', () => {
  it('1: asks the ticket door once more when a load by its ticket is refused, and plays with no reload; a second refusal is shown and asks no third time', async () => {
    refusalsLeft = 1
    await open()
    const player = theFilmsBlock().locator('video')
    await player.waitFor({ timeout: 30_000 })
    await app.page.waitForFunction(
      (label) => {
        const block = [...document.querySelectorAll('.sb-pathblock')].find((one) => one.querySelector('.sb-path-label')?.textContent === label)
        const media = block?.querySelector('video') as HTMLVideoElement | null | undefined
        if (media === null || media === undefined) return false
        if (media.paused && media.error === null) {
          media.muted = true
          void media.play().catch(() => undefined)
        }
        return media.currentTime > 0.3
      },
      LABEL,
      { timeout: 30_000, polling: 100 },
    )
    const src = new URL((await player.getAttribute('src')) ?? '', app.page.url())
    expect(src.pathname, 'the video is loaded from the file door').toBe('/api/file')
    expect(src.searchParams.has('ticket'), 'the video is loaded by a ticket').toBe(true)
    await wait(2_000)
    expect(seen.ticketAsksForTheFilm, 'asks of the ticket door for the film').toBe(2)
    expect(seen.refusedLoads, 'loads by a ticket the routing refused').toBe(1)
    expect(seen.pagesLoaded, 'pages loaded').toBe(1)

    refusalsLeft = Number.POSITIVE_INFINITY
    await open()
    await theFilmsBlock().getByText(t('w13s.file.notLoaded')).waitFor({ timeout: 30_000 })
    await wait(3_000)
    expect(seen.ticketAsksForTheFilm, 'asks of the ticket door for the film').toBe(2)
    expect(seen.refusedLoads, 'loads by a ticket the routing refused').toBe(2)
    expect(seen.pagesLoaded, 'pages loaded').toBe(1)
    expect(await theFilmsBlock().locator('video').evaluateAll((all) => all.some((one) => (one as HTMLVideoElement).currentTime > 0)), 'a refused video played').toBe(false)
    refusalsLeft = 0
  }, 180_000)

  it('2: links the open and save presses to the record\'s own page, never to a file address, and a press saves the file', async () => {
    refusalsLeft = 0
    await open()
    await theFilmsBlock().locator('a.sb-video-save').waitFor({ timeout: 30_000 })
    const links = app.page.locator('a.sb-file-open, a.sb-file-save, a.sb-video-save, a.sb-picture-save')
    for (const press of ['a.sb-file-open', 'a.sb-file-save', 'a.sb-video-save']) {
      expect(await app.page.locator(press).count(), `${press} is drawn`).toBeGreaterThan(0)
    }
    const hrefs = await links.evaluateAll((all) => all.map((one) => one.getAttribute('href') ?? ''))
    for (const href of hrefs) {
      expect(href, 'a link holds a file address').not.toContain('/api/file')
      expect(href, 'a link holds a ticket').not.toContain('ticket')
      expect(new URL(href, app.page.url()).hash, 'a link leads to another page').toBe(`#${recordPath(report)}`)
    }

    const saving = app.page.waitForEvent('download', { timeout: 30_000 })
    await app.page.locator('.sb-file', { hasText: ARCHIVE_NAME }).locator('a.sb-file-save').click()
    const saved = await saving
    expect(readFileSync(await saved.path()).equals(AN_ARCHIVE), 'the saved bytes are not the archive\'s').toBe(true)
    expect(seen.ticketAsksForTheArchive, 'the save press asked the ticket door for the archive').toBeGreaterThan(0)
    expect(seen.pagesLoaded, 'pages loaded').toBe(1)
  }, 120_000)
})
