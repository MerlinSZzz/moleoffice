// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S BROWSER ON ANOTHER MACHINE MOVES ONCE AND IS THE PERSON, RUN JOINED (wave 13s, line 13s, SEC-2).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A browser on another machine that was paired before SEC-2 holds the old cookie, and in it a visitor's confirmed
 * one-piece token from the ask door. The old cookie is no key now. Each case opens a real Chromium page at the address
 * for other machines, with the key window closed, and nothing is pressed.
 *
 *   J1. THE JOINED PATH. The page is opened with no hash. Exactly one move is sent, and the moved sentence is shown
 *       once. The old cookie is gone, the cookie half is held and the header half is stored. The pairing read the page
 *       sends says the browser is the person, and a person's act the page sends with both halves is answered 200. No
 *       answer in the load says that the page's Origin or Host is not this office, or that another site sent a press.
 *   J2. A MOVE THAT FAILS. The first move is aborted as a network error. The page says it could not move, once, with
 *       the reason. One move was sent, the old cookie is still held, and the browser is not the person. After a reload,
 *       exactly one more move is sent, the moved sentence is shown, and the browser is the person.
 *   J3. TWO TABS AT ONCE. Two tabs of one browser open at once, so both pairing reads say the browser may move and both
 *       send the move. Each move is held until both are held. The first goes, and its tab shows the moved sentence.
 *       Then the second goes, and the office answers it that there is nothing to move, because the first moved it.
 *       Neither tab says the browser could not be moved, and neither shows the words of that refusal. The second tab
 *       says nothing of the move. Both tabs are the person, and a reload of the second tab says nothing and sends no
 *       move.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE OTHER MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * The office runs in this process, built for production, so it serves the built page itself and the page calls the
 * office at its own origin. It listens on 127.0.0.1, and the product's door for other machines is bound to 127.0.0.2,
 * as tests/one-list-of-this-offices-origins.test.ts binds it. Every page is opened at that door. The probe's list of
 * this machine's own addresses names a made-up number, and its read of this machine's tailnet name answers none, so
 * this machine's own tailscale is never asked. A browser reaches 127.0.0.2 from a loopback address, which is not on the
 * probe's list, so the door stamps every request of these pages as another machine's.
 *
 * Each case's old token is made as case 4 of tests/the-old-cookie-moves-once.test.ts makes one: a person's device
 * credential issued for a visitor, given a one-piece token, and confirmed. The three are confirmed while the key window
 * is open. Then the window is closed in this process by `closeTheKeyWindow`, as case 6 of
 * tests/a-browser-proves-the-person-with-two-halves.test.ts closes it, so a request that carries no key is nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE CANNOT SHOW
 * ---------------------------------------------------------------------------------------
 *
 * Chromium takes http://127.0.0.2 as a secure context, because every 127.x address is loopback. The person's other
 * machine reaches the office at an http address that is not loopback, and Chromium does not take that as a secure
 * context. A page there sends no Sec-Fetch-Site header, and the browser's features that need a secure context are
 * missing. These cases run in a secure context, so they do not show what a page in an insecure one does. Nothing here
 * stands in for that.
 *
 * ---------------------------------------------------------------------------------------
 * NO KEY, HALF OR TOKEN IS PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The office writes no log here. The header half is read and sent inside the page, and never handed back to this
 * process. No assertion prints a cookie, a half or a token: each one says only whether a thing was held.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext, Page, Request, Response, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, DEVICE_HALF_KEY, KEY_COOKIE } from '../src/config/key-header.mjs'
import { t as say } from '../src/shared/i18n.ts'
import type { RefusalCode } from '../src/shared/refusal-codes.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, theBrowserThisWorkerShares, theBuiltPage, waitForThePage, type TestDb } from './helpers.ts'

/** The door for other machines is bound to a second loopback address, as the other tests of that door bind it. */
const THE_DOORS_ADDRESS = '127.0.0.2'
/** This machine's own number, as the probe names it here: an address from the range kept for documentation. */
const THE_NUMBER = '198.51.100.8'
/** The machine the visitor's credential was issued for before SEC-2. Made up, from the same range. */
const THE_VISITORS_MACHINE = '198.51.100.9'
/** The name the visitor's device was confirmed under before SEC-2. Made up. */
const THE_VISITORS_NAME = 'Test laptop'

/** The move door, which the page asks once a load. */
const THE_MOVE = '/api/office/pairing/move'
/** The pairing read. */
const THE_PAIRING_READ = '/api/office/pairing'
/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
const A_PERSONS_ACT = '/api/office/scene-settings'

/** The person's headers and no key, as a page of this office sends them. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The refusals no answer in J1's load may carry: a page on an address that is not this office's, or another site. */
const A_PAGE_ON_THE_WRONG_ADDRESS: readonly RefusalCode[] = ['originIsNotThisOffice', 'hostIsNotThisOffice', 'aPressFromAnotherSite']

/** The sentence a tab shows when it moved. */
const MOVED = say('w13s.pairing.moved')
/** The words every sentence of a failed move opens with, whatever its reason. */
const NOT_MOVED_OPENING = say('w13s.pairing.notMoved', { reason: '' }).trim()
/** The words of the move door's refusal when it finds nothing to move. */
const NOTHING_TO_MOVE_WORDS = say('server.nothingToMove')

let t: TestDb | undefined
let app: FastifyInstance | undefined
let door: Server | undefined
let resources: typeof import('../src/server/lib/resources.ts') | undefined
let thisMachine = ''
let anotherMachine = ''
/** Each case's old token, made and confirmed before the key window closed. */
const OLD_TOKENS = new Map<'J1' | 'J2' | 'J3', string>()

/** Wait so long. */
const aMoment = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A visitor's confirmed person's device credential with a one-piece token, as an office from before SEC-2 holds it. */
async function aVisitorsOldToken(): Promise<string> {
  if (t === undefined) throw new Error('the test office was not made')
  const visitors = await import('../src/server/lib/visitors.ts')
  const { credential } = visitors.issueAPersonsDeviceCredential({
    name: THE_VISITORS_NAME,
    machine: THE_VISITORS_MACHINE,
    machineHow: 'made up by a test',
    runtime: null,
  })
  const token = randomBytes(32).toString('base64url')
  t.client.sqlite.prepare('UPDATE visitor_credentials SET token_hash = ? WHERE id = ?').run(createHash('sha256').update(token).digest('hex'), credential.id)
  const confirmed = await fetch(`${thisMachine}/api/office/visitors/${credential.id}/confirm`, { method: 'POST', headers: THE_PERSON, body: '{}' })
  expect(confirmed.status, 'a visitor\'s credential from before SEC-2 was not confirmed').toBe(200)
  return token
}

function theOldToken(of: 'J1' | 'J2' | 'J3'): string {
  const token = OLD_TOKENS.get(of)
  if (token === undefined) throw new Error(`no old token was made for ${of}`)
  return token
}

beforeAll(async () => {
  t = await freshDb()
  // THIS MACHINE'S OWN ADDRESSES AND ITS TAILNET NAME, made up, so the office never asks this machine's own tailscale.
  resources = await import('../src/server/lib/resources.ts')
  const probe = Object.create(resources.LINUX_PROBE) as OsProbe
  probe.ownAddresses = () => [THE_NUMBER]
  probe.ownTailnetName = () => Promise.resolve(null)
  resources.useOsProbe(probe)
  const page = await theBuiltPage()
  const { buildApp, serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
  app = (await buildApp({ production: true, webDir: page, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  door = await serveTheAddressForOtherMachines(app, 0, THE_DOORS_ADDRESS)
  anotherMachine = `http://${THE_DOORS_ADDRESS}:${String((door.address() as AddressInfo).port)}`
  for (const one of ['J1', 'J2', 'J3'] as const) OLD_TOKENS.set(one, await aVisitorsOldToken())
  // THE KEY WINDOW CLOSES, as an office has it once every agent holds a key. A request with no key is then nobody.
  const { closeTheKeyWindow } = await import('../src/server/lib/keywindow.ts')
  expect(closeTheKeyWindow({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }).open, 'the key window did not close').toBe(false)
}, 240_000)

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  if (door !== undefined) {
    const closing = door
    await new Promise<void>((done) => {
      closing.close(() => {
        done()
      })
    })
  }
  if (app !== undefined) await app.close()
  t?.close()
}, 120_000)

/** A browser that holds the old cookie with this token, and no half, as the person's browser was before SEC-2. */
async function aBrowserWithTheOldCookie(token: string): Promise<BrowserContext> {
  const browser = await theBrowserThisWorkerShares()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addCookies([{ name: KEY_COOKIE, value: token, url: anotherMachine, httpOnly: true, sameSite: 'Strict' }])
  return context
}

/** What one tab sent and was answered, counted from the moment it is watched. */
interface WhatATabSent {
  moves: number
  /** The codes of the office's refusals in the answers to this tab's requests. */
  codes: string[]
  /** The paths of refusals whose answer could not be read, so their codes are not known. */
  unread: string[]
  reading: Promise<void>[]
}

function watch(page: Page): WhatATabSent {
  const sent: WhatATabSent = { moves: 0, codes: [], unread: [], reading: [] }
  page.on('request', (request: Request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === THE_MOVE) sent.moves += 1
  })
  page.on('response', (response: Response) => {
    const path = new URL(response.url()).pathname
    if (response.status() < 400 || !path.startsWith('/api/')) return
    sent.reading.push(
      response.text().then(
        (text) => {
          try {
            const code = (JSON.parse(text) as { code?: unknown }).code
            if (typeof code === 'string') sent.codes.push(code)
          } catch {
            sent.unread.push(path)
          }
        },
        () => {
          sent.unread.push(path)
        },
      ),
    )
  })
  return sent
}

/** The pairing read, sent from the page with the halves the page holds: the cookie half by the browser, the header half from its storage. */
async function thePairingReadFrom(page: Page): Promise<{ status: number; paired: unknown }> {
  return page.evaluate(
    async ({ key, header, path, person }) => {
      const headers = new Headers({ accept: 'application/json', ...person })
      headers.delete('content-type')
      const half = window.localStorage.getItem(key)
      if (half !== null && half !== '') headers.set(header, half)
      const res = await fetch(path, { headers, credentials: 'same-origin' })
      const body = (await res.json()) as { paired?: unknown }
      return { status: res.status, paired: body.paired }
    },
    { key: DEVICE_HALF_KEY, header: DEVICE_HALF_HEADER, path: THE_PAIRING_READ, person: THE_PERSON },
  )
}

/** A person's act, sent from the page as the page sends one: its own headers, with the header half beside the cookie half. */
async function aPersonsActFrom(page: Page): Promise<number> {
  return page.evaluate(
    async ({ key, header, path, person }) => {
      const headers = new Headers(person)
      const half = window.localStorage.getItem(key)
      if (half !== null && half !== '') headers.set(header, half)
      const res = await fetch(path, { method: 'PATCH', headers, credentials: 'same-origin', body: JSON.stringify({ motion: true }) })
      return res.status
    },
    { key: DEVICE_HALF_KEY, header: DEVICE_HALF_HEADER, path: A_PERSONS_ACT, person: THE_PERSON },
  )
}

/** Whether the page keeps a header half. The half itself stays in the page. */
async function theHeaderHalfIsStored(page: Page): Promise<boolean> {
  return page.evaluate((key) => {
    const half = window.localStorage.getItem(key)
    return half !== null && half !== ''
  }, DEVICE_HALF_KEY)
}

/** The cookies the browser holds for the door, by name only. */
async function theCookiesHeld(context: BrowserContext): Promise<{ oldCookie: number; cookieHalf: number }> {
  const cookies = await context.cookies(anotherMachine)
  return {
    oldCookie: cookies.filter((one) => one.name === KEY_COOKIE).length,
    cookieHalf: cookies.filter((one) => one.name === DEVICE_HALF_COOKIE).length,
  }
}

/** How many times a sentence is shown on the page. */
async function shown(page: Page, words: string): Promise<number> {
  return page.getByText(words).count()
}

/** What a tab shows of the move, and whether it is the person, read in one document. */
interface WhatATabShows {
  moved: boolean
  notMoved: boolean
  nothingToMove: boolean
  isThePerson: boolean
}

/** One reading of a tab, or null while it is between two documents and cannot be read. */
async function aReadingOf(page: Page): Promise<{ document: number; shows: WhatATabShows } | null> {
  try {
    const opened = await page.evaluate(() => performance.timeOrigin)
    const shows: WhatATabShows = {
      moved: (await shown(page, MOVED)) > 0,
      notMoved: (await shown(page, NOT_MOVED_OPENING)) > 0,
      nothingToMove: (await shown(page, NOTHING_TO_MOVE_WORDS)) > 0,
      isThePerson: (await thePairingReadFrom(page)).paired === true,
    }
    const after = await page.evaluate(() => performance.timeOrigin)
    return after === opened ? { document: opened, shows } : null
  } catch {
    return null
  }
}

/**
 * WHAT A TAB SETTLES AT, read once a second: as soon as it says a failed move, or once it is the person in the same
 * document twice running. A tab that reloads itself in between is read again in its new document. At the end of the
 * time the last reading is answered, and the case's assertions say what it shows.
 */
async function whatTheTabSettlesAt(page: Page, within: number): Promise<WhatATabShows> {
  const until = Date.now() + within
  let before: { document: number; shows: WhatATabShows } | null = null
  let last: WhatATabShows = { moved: false, notMoved: false, nothingToMove: false, isThePerson: false }
  while (Date.now() < until) {
    const now = await aReadingOf(page)
    if (now !== null) {
      last = now.shows
      if (now.shows.notMoved || now.shows.nothingToMove) return now.shows
      if (before !== null && before.document === now.document && before.shows.isThePerson && now.shows.isThePerson) return now.shows
    }
    before = now
    await aMoment(1_000)
  }
  return last
}

/** A move held on a route until the case lets it go. */
interface AHeldMove {
  held: Promise<void>
  letItGo: () => Promise<void>
}

async function holdTheMove(page: Page): Promise<AHeldMove> {
  let route: Route | null = null
  let markHeld = (): void => undefined
  const held = new Promise<void>((done) => {
    markHeld = () => done()
  })
  await page.route(
    (url) => url.pathname === THE_MOVE,
    async (one: Route) => {
      if (route !== null) {
        await one.continue()
        return
      }
      route = one
      markHeld()
    },
  )
  return {
    held,
    letItGo: async () => {
      if (route === null) throw new Error('the move was let go before it was held')
      await route.continue()
    },
  }
}

/** The promise's answer, or a failure that says what did not happen within the time. */
async function within<T>(promise: Promise<T>, ms: number, said: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, fail) => {
        timer = setTimeout(() => {
          fail(new Error(said))
        }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

describe('the person\'s browser on another machine, with the old cookie and the key window closed', () => {
  it('J1: moves once on its own, says so once, and is the person, with both halves held', async () => {
    const context = await aBrowserWithTheOldCookie(theOldToken('J1'))
    try {
      const page = await context.newPage()
      const sent = watch(page)
      await page.goto(`${anotherMachine}/`, { timeout: 60_000 })
      await page.getByText(MOVED).first().waitFor({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await aMoment(2_000)
      expect(sent.moves, 'J1: the page did not send exactly one move').toBe(1)
      expect(await shown(page, MOVED), 'J1: the moved sentence was not shown exactly once').toBe(1)
      const held = await theCookiesHeld(context)
      expect(held.oldCookie, 'J1: the old cookie was still held after the move').toBe(0)
      expect(held.cookieHalf, 'J1: the cookie half was not held after the move').toBe(1)
      expect(await theHeaderHalfIsStored(page), 'J1: the page stored no header half after the move').toBe(true)
      const read = await thePairingReadFrom(page)
      expect(read.status, 'J1: the pairing read from the page was refused').toBe(200)
      expect(read.paired, 'J1: the pairing read from the page did not say the browser is the person').toBe(true)
      expect(await aPersonsActFrom(page), 'J1: a person\'s act from the page, with both halves, was not answered 200').toBe(200)
      await Promise.all(sent.reading)
      expect(sent.unread, 'J1: refusals in the load whose answers could not be read, so their codes are not known').toEqual([])
      expect(
        sent.codes.filter((code) => (A_PAGE_ON_THE_WRONG_ADDRESS as readonly string[]).includes(code)),
        'J1: an answer in the load refused the page\'s Origin or Host, or took its press for another site\'s',
      ).toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('J2: a move that fails is said once with its reason and changes nothing; a reload moves once and is the person', async () => {
    const context = await aBrowserWithTheOldCookie(theOldToken('J2'))
    try {
      const page = await context.newPage()
      const sent = watch(page)
      let aborted = false
      await page.route(
        (url) => url.pathname === THE_MOVE,
        async (route: Route) => {
          if (!aborted) {
            aborted = true
            await route.abort('failed')
            return
          }
          await route.continue()
        },
      )
      // A FETCH THAT NOTHING ANSWERED is said with the page's sentence for an office it cannot reach.
      const failed = say('w13s.pairing.notMoved', { reason: say('frameFiles.api.cannotReach') })
      await page.goto(`${anotherMachine}/`, { timeout: 60_000 })
      await page.getByText(failed).first().waitFor({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await aMoment(2_000)
      expect(await shown(page, NOT_MOVED_OPENING), 'J2: the failed move was not said exactly once').toBe(1)
      expect(await shown(page, failed), 'J2: the failed move was not said with its reason').toBe(1)
      expect(sent.moves, 'J2: the page did not send exactly one move').toBe(1)
      expect((await theCookiesHeld(context)).oldCookie, 'J2: the old cookie was not held after the move failed').toBe(1)
      expect((await thePairingReadFrom(page)).paired, 'J2: the browser was the person after its move failed').toBe(false)

      await page.reload({ timeout: 60_000 })
      await page.getByText(MOVED).first().waitFor({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await aMoment(2_000)
      expect(sent.moves, 'J2: the reload did not send exactly one more move').toBe(2)
      expect(await shown(page, MOVED), 'J2: the moved sentence was not shown after the reload').toBe(1)
      expect((await thePairingReadFrom(page)).paired, 'J2: the browser was not the person after the reload moved it').toBe(true)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('J3: two tabs open at once both move; the second, answered that nothing is left to move, says nothing, and both are the person', async () => {
    const context = await aBrowserWithTheOldCookie(theOldToken('J3'))
    try {
      const first = await context.newPage()
      const second = await context.newPage()
      const sentFirst = watch(first)
      const sentSecond = watch(second)
      const heldFirst = await holdTheMove(first)
      const heldSecond = await holdTheMove(second)
      await Promise.all([
        first.goto(`${anotherMachine}/`, { timeout: 60_000, waitUntil: 'commit' }),
        second.goto(`${anotherMachine}/`, { timeout: 60_000, waitUntil: 'commit' }),
      ])
      await within(
        Promise.all([heldFirst.held, heldSecond.held]),
        60_000,
        'J3: the two tabs did not both send their move within 60 s, so their pairing reads did not both say the browser may move',
      )

      await heldFirst.letItGo()
      await first.getByText(MOVED).first().waitFor({ timeout: 60_000 })
      await waitForThePage(first, 60_000)

      const answered = second.waitForResponse((response) => new URL(response.url()).pathname === THE_MOVE, { timeout: 60_000 })
      await heldSecond.letItGo()
      await answered
      const secondShows = await whatTheTabSettlesAt(second, 30_000)
      const firstShows = await whatTheTabSettlesAt(first, 30_000)

      expect(sentFirst.moves, 'J3: the first tab did not send exactly one move').toBe(1)
      expect(sentSecond.moves, 'J3: the second tab did not send exactly one move').toBe(1)
      expect(secondShows.notMoved, 'J3: the second tab said the browser could not be moved, though the first tab had moved it').toBe(false)
      expect(secondShows.nothingToMove, 'J3: the second tab showed the words of the refusal that found nothing to move').toBe(false)
      expect(secondShows.moved, 'J3: the second tab said a move it did not make').toBe(false)
      expect(firstShows.notMoved, 'J3: the first tab said the browser could not be moved').toBe(false)
      expect(firstShows.nothingToMove, 'J3: the first tab showed the words of the refusal that found nothing to move').toBe(false)
      expect(firstShows.isThePerson, 'J3: the first tab was not the person').toBe(true)
      expect(secondShows.isThePerson, 'J3: the second tab was not the person').toBe(true)

      const movesBefore = sentSecond.moves
      await second.reload({ timeout: 60_000 })
      await waitForThePage(second, 60_000)
      await aMoment(2_000)
      const afterTheReload = await whatTheTabSettlesAt(second, 30_000)
      expect(sentSecond.moves, 'J3: the reload of the second tab sent a move').toBe(movesBefore)
      expect(afterTheReload.moved, 'J3: the reload of the second tab said the browser moved').toBe(false)
      expect(afterTheReload.notMoved, 'J3: the reload of the second tab said the browser could not be moved').toBe(false)
      expect(afterTheReload.nothingToMove, 'J3: the reload of the second tab showed the words of the refusal that found nothing to move').toBe(false)
      expect(afterTheReload.isThePerson, 'J3: the second tab was not the person after its reload').toBe(true)
    } finally {
      await context.close()
    }
  }, 240_000)
})
