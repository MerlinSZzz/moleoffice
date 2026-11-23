// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TERMINAL MANAGEMENT FOLLOWS THE HOLDER WHILE IT IS OPEN, WITHOUT A RELOAD. Item 102, added, of wave 13y, round 147.
 *
 * On the owner's Mac the old terminal holder ended while Terminal management was open. The page kept saying that a
 * program answers where the holder should be and the office cannot use it, and its Start and Open a shell appeared only
 * after the owner changed tabs and came back. The page read where the holder stands once, and again only after a press
 * on the page. This is the class of fault item 87 fixed for the other pages, and item 102 for the Embassy
 * (tests/the-embassy-follows-changes-while-it-is-open.test.ts).
 *
 * A scratch office with its holder meant to run serves the page's every request. Each case opens Terminal management
 * afresh, marks the window so a reload would be seen, changes the holder from outside the page, and waits up to eight
 * seconds for the change to be drawn. Eight seconds is well under any timed read, so no timer can pass a case. The mark
 * must still be there afterwards.
 *
 * 1. A HOLDER THAT ENDS IS DRAWN AS NOT RUNNING, WITH THE START PRESS. A real holder is stopped by its process group.
 * 2. A NEW HOLDER STARTED ELSEWHERE IS DRAWN AS RUNNING, WITH OPEN A SHELL. It is started through the office's start
 *    door, as a press on another page or another tab starts one.
 * 3. A PROGRAM THAT ANSWERS AS ANOTHER OFFICE'S HOLDER, AND THEN ENDS, IS DRAWN AS NOT RUNNING. This is the owner's own
 *    case: the page said the program could not be used, and kept saying it after the program had gone.
 *
 * A holder started outside the office, by a command typed in a shell, is not in this file. Nothing tells the office
 * that one started until a door next asks the holder.
 *
 * Case names name the source mutation tried against each.
 *
 * Set W13Y_HOLDER_FOLLOWS_SHOTS to a folder outside the checkout, and W13Y_HOLDER_FOLLOWS_LOOK to light or dark, and
 * case 4 photographs Terminal management with the holder not running and then running, at 1440, 990, 660 and 390 in
 * that look (wave 13y round 148). One run takes one look, so each look is taken in a scratch office of its own. The
 * ordinary run takes none. The scratch office holds no records, and every picture says it is made up above the page.
 */

import { mkdirSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { THE_HOLDER_PROTOCOL } from '../src/config/the-terminal-holder.mjs'
import { t } from '../src/shared/i18n.ts'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { notReloaded, open, type HeardOffice } from './a-page-that-hears-changes.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, startAServer, stopEverything, stopTheGroup, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

/** How long a change may take to be drawn. */
const DRAWN_WITHIN_MS = 8_000
const shots = process.env['W13Y_HOLDER_FOLLOWS_SHOTS']
/** The one look a picture run takes. */
const look = process.env['W13Y_HOLDER_FOLLOWS_LOOK']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'

let place: Place
let server: ScratchServer
let app: LiveApp
let context: BrowserContext
let page: Page
let office: HeardOffice
/** The stand-in that answers as another office's holder, while it listens. */
let standIn: { stop: () => Promise<void> } | null = null

beforeAll(async () => {
  place = aPlace('follows')
  // THE PAGE IS SERVED BY A LIVE APP OF ITS OWN, and every request it sends to that app's API goes to the scratch office.
  // It starts first, so the scratch office can be told its web port: the scratch office refuses a page on a loopback
  // port that is not its own unless it is told that port is its dev page's.
  app = await liveApp({ name: 'holder-follows', viewport: { width: 1440, height: 900 }, database: join(place.dir, 'page.db') })
  server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_WEB_PORT: String(app.webPort) })
  const personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const thePagesApiPort = String(app.apiPort)
  const theScratchPort = String(server.port)
  await context.route(
    (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
    (route) => {
      const to = new URL(route.request().url())
      to.port = theScratchPort
      return route.continue({ url: to.toString() })
    },
  )
  page = await context.newPage()
  office = { api: server.api, site: app.site, headers: { ...AS_THE_PERSON, ...personsKey } }
}, 300_000)

afterAll(async () => {
  try {
    await standIn?.stop()
    await context?.close()
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 120_000)

/** Where the holder stands, as the scratch office reads it now. */
async function theHolderNow(): Promise<{ state: string; pid?: number }> {
  return (await ask(server.api, '/api/terminals', { headers: office.headers })).body['holder'] as { state: string; pid?: number }
}

/** Stop every holder the office reads as running, by its process group, and wait until none is read. */
async function noHolderRuns(): Promise<void> {
  const now = await theHolderNow()
  if (now.state === 'running' && typeof now.pid === 'number') {
    groups.add(now.pid)
    await stopTheGroup(now.pid)
  }
  expect((await until(theHolderNow, (one) => one.state === 'not running', 15_000)).state).toBe('not running')
}

const theHeadline = (): ReturnType<Page['locator']> => page.locator('.tm-holder-headline')
const theStartPress = (): ReturnType<Page['locator']> => page.getByRole('button', { name: t('terminals.holder.start') })
const theShellPress = (): ReturnType<Page['locator']> => page.getByRole('button', { name: t('terminals.shell.openHome') })

/** Wait until the page draws the holder as not running, with the start press and no shell press. */
async function drawnAsNotRunning(): Promise<void> {
  await theHeadline().filter({ hasText: t('terminals.holder.notRunning') }).waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await theStartPress().count()).toBe(1)
  expect(await theShellPress().count()).toBe(0)
  expect(await page.locator('.tm-holder-running').count()).toBe(0)
}

/** Wait until the page draws the holder as running, with the shell press and no headline. */
async function drawnAsRunning(): Promise<void> {
  await page.locator('.tm-holder-running').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  await theShellPress().waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await theHeadline().count()).toBe(0)
  expect(await theStartPress().count()).toBe(0)
}

/**
 * A PROGRAM AT THE PLACE'S SOCKET THAT ANSWERS HELLO AS THE HOLDER OF ANOTHER OFFICE'S DATABASE, so the office reads it
 * as unusable. It listens in this test's process. Its stop closes it and every connection it holds, as a program that
 * ends does, and Node removes the socket file.
 */
async function anotherOfficesHolder(): Promise<{ stop: () => Promise<void> }> {
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  const held = new Set<Socket>()
  const listener: Server = createServer((socket) => {
    held.add(socket)
    socket.once('close', () => held.delete(socket))
    socket.on('error', () => undefined)
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      pending += chunk
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const request = JSON.parse(pending.slice(0, newline)) as Record<string, unknown>
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        const answer =
          request['op'] === 'hello'
            ? { ok: true, id: request['id'], protocol: THE_HOLDER_PROTOCOL, pid: process.pid, startedAt: null, database: join(place.dir, 'another-office.db') }
            : { ok: true, id: request['id'], terminals: [] }
        socket.write(`${JSON.stringify(answer)}\n`)
      }
    })
  })
  await new Promise<void>((done) => listener.listen(place.socket, () => done()))
  return {
    stop: async () => {
      const closed = new Promise<void>((done) => listener.close(() => done()))
      for (const socket of held) socket.destroy()
      await closed
    },
  }
}

it('1. a holder that ends is drawn as not running, with the start press (no announcement when the holder ends; the page follows nothing)', async () => {
  const holder = await startAHolder(place)
  await open(office, page, '/terminals', '.tm-holder-running')
  await theShellPress().waitFor({ state: 'visible', timeout: 15_000 })

  await stopTheGroup(holder.pid)
  await drawnAsNotRunning()
  expect(await notReloaded(page), 'the page was loaded again').toBe(true)
}, 180_000)

it('2. a new holder started elsewhere is drawn as running, with Open a shell (no announcement when a new holder is recorded; the page follows nothing)', async () => {
  await noHolderRuns()
  await open(office, page, '/terminals', '.tm-holder-headline')
  expect(await theHeadline().innerText()).toBe(t('terminals.holder.notRunning'))

  const started = await ask(server.api, '/api/terminals/holder/start', { method: 'POST', headers: office.headers, body: {} })
  const theNewOne = (started.body['holder'] as { pid?: number } | undefined)?.pid
  if (typeof theNewOne === 'number') groups.add(theNewOne)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  expect(started.body['started']).toBe(true)
  await drawnAsRunning()
  expect(await notReloaded(page), 'the page was loaded again').toBe(true)
}, 180_000)

it("3. a program that answers as another office's holder, and then ends, is drawn as not running (the office watches only a holder it can use; no announcement when the holder ends; the page follows nothing)", async () => {
  await noHolderRuns()
  standIn = await anotherOfficesHolder()
  expect((await theHolderNow()).state).toBe('unusable')
  await open(office, page, '/terminals', '.tm-holder-headline')
  expect(await theHeadline().innerText()).toBe(t('terminals.holder.unusable'))
  expect(await theStartPress().count()).toBe(0)

  await standIn.stop()
  standIn = null
  await drawnAsNotRunning()
  expect(await notReloaded(page), 'the page was loaded again').toBe(true)
}, 180_000)

it.runIf(shots)('4. photographs Terminal management with the holder not running and then running, at four widths in one look', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_HOLDER_FOLLOWS_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_HOLDER_FOLLOWS_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  await page.goto(`${app.site}/`)
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  /** Photograph the page as it is drawn now at the four widths, with the label above the page. */
  async function fourWidths(name: string): Promise<void> {
    for (const width of [1440, 990, 660, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.waitForTimeout(300)
      const called = `${name}-${look}-${String(width)}`
      await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), called)
      await page.screenshot({ path: join(shots!, `${called}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await noHolderRuns()
  await open(office, page, '/terminals', '.tm-holder-headline')
  // THE PAGE IS DRAWN IN THE LOOK THIS RUN NAMES, so a dark picture is never a light page by another name.
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(look)
  await drawnAsNotRunning()
  await fourWidths('holder-not-running')

  const started = await ask(server.api, '/api/terminals/holder/start', { method: 'POST', headers: office.headers, body: {} })
  const theNewOne = (started.body['holder'] as { pid?: number } | undefined)?.pid
  if (typeof theNewOne === 'number') groups.add(theNewOne)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  await drawnAsRunning()
  await fourWidths('holder-running')
}, 300_000)
