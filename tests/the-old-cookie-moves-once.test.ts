// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER THAT HOLDS THE OLD COOKIE MOVES TO TWO HALVES ONCE, AND IS TOLD SO ONCE (wave 13s, line 13s, SEC-2).
 *
 * Before SEC-2 a paired browser held a whole key in the cookie mole-office-key: the person's own key, or a visitor's
 * one-piece token from the ask door. After SEC-2 that cookie is no key (tests/a-browser-proves-the-person-with-two-halves.test.ts
 * pins it), and a browser proves the person with two halves. So a browser that still holds the old cookie would stop
 * being the person on the day the office is updated. The move door, POST /api/office/pairing/move, lets it move once.
 *
 * Item 7 of SEC-2's design says so. The pairing read says mayMove when the request carries an old cookie whose key the
 * office still holds. The move answers the header half and sets the cookie half, as the press does, and ends the old
 * cookie in the same answer. The page moves at its start, keeps the half and tells the person once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. the person's key in the old cookie: the read says mayMove; the move answers the header half with no-store, sets
 *      the cookie half and ends the old cookie; both halves are the person, and the person's key still is;
 *   2. a move with no old cookie, or with one whose key this office never gave, is refused, writes nothing, and still
 *      ends an old cookie it was sent;
 *   3. the move writes one line in the server's log, naming what moved and holding no key and no half;
 *   4. a visitor's old one-piece token moves to a new credential under the same name, confirmed as the old one was,
 *      and the old credential is ended at the Embassy;
 *   5. a move another site's page sent is refused and sets, ends and issues nothing, as the press is; a move from a
 *      page of this office or from no page is taken;
 *   6. in a real browser that holds the old cookie and no half, the page moves once and shows the sentence once; a
 *      reload shows no sentence and sends no second move.
 *
 * The office's key window is open in every case here, as it is the day an office is installed. Under it a claim of
 * the person with no key is taken on this computer, so the read's paired is not read here, and the move must still
 * find nothing to move for such a claim (case 2).
 *
 * ---------------------------------------------------------------------------------------
 * HOW AN OLD COOKIE IS MADE HERE
 * ---------------------------------------------------------------------------------------
 *
 * The person's key is the office's own, read from where the office keeps it. A visitor's old token is made up here: the
 * ask door now gives two halves, so the case issues a device credential through the visitors module and writes the
 * hash of a one-piece token of its own in that credential's row, as an office from before SEC-2 holds it. It is then
 * confirmed at the Embassy's own door, which binds its key. No key, half or token is printed.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { Request } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_COOKIE, KEY_HEADER } from '../src/config/key-header.mjs'
import { t as say } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'

/** The person's headers and no key, as a page of this office sends them. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** An agent's claim, so only a key or two halves can make a request the person's. */
const AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

/** The refusal of a move that finds nothing to move. */
const NOTHING_TO_MOVE = 'nothingToMove'

/** A page on another site, as its Origin says. */
const A_FOREIGN_ORIGIN = 'https://evil.example'

/** The name a visitor's device was confirmed under before SEC-2. Made up. */
const THE_VISITORS_NAME = 'Test tablet'

/** Every line the server's logger writes, whole, as pino writes it: one JSON object a line. */
class TheServersLog {
  readonly lines: string[] = []
  private waiting = ''

  write(chunk: string): void {
    this.waiting += chunk
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push(line)
      end = this.waiting.indexOf('\n')
    }
  }

  clear(): void {
    this.lines.length = 0
    this.waiting = ''
  }
}
const THE_LOG = new TheServersLog()

/** The words of a line pino wrote: its `msg`. */
function theWordsOf(line: string): string {
  const parsed = JSON.parse(line) as { msg?: unknown }
  return typeof parsed.msg === 'string' ? parsed.msg : ''
}

/** Give the log a moment to finish before its lines are read. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

let t: TestDb | undefined
let app: FastifyInstance | undefined
let thisMachine = ''
let keys: typeof import('../src/server/lib/keys.ts') | undefined
let visitors: typeof import('../src/server/lib/visitors.ts') | undefined

/** A new name for each browser this file moves, so each one's row at the Embassy is found by its name. */
let browsersNamed = 0
function aBrowsersName(): string {
  browsersNamed += 1
  return `Test browser ${String(browsersNamed)}`
}

/** The person's whole key, as the office keeps it beside its database. */
function thePersonsKey(): string {
  const key = thePersonsKeyHeader()[KEY_HEADER]
  if (key === undefined) throw new Error('the office keeps no person key')
  return key
}

function theOldCookie(key: string): Record<string, string> {
  return { cookie: `${KEY_COOKIE}=${key}` }
}

interface TheHalves {
  cookie: string
  header: string
}

interface AMove {
  status: number
  body: Record<string, unknown>
  text: string
  setCookies: string[]
  cacheControl: string | null
  halves: TheHalves | null
}

/** The cookie half's name and value from a Set-Cookie header, as a browser sends it back, or null. */
function theCookieHalfIn(setCookies: readonly string[]): string | null {
  for (const one of setCookies) {
    const pair = one.split(';')[0] ?? ''
    if (pair.startsWith(`${DEVICE_HALF_COOKIE}=`) && pair.length > DEVICE_HALF_COOKIE.length + 1) return pair
  }
  return null
}

/** The Set-Cookie headers that end the old cookie: its name, no value, and Max-Age=0. */
function theEndsOfTheOldCookie(setCookies: readonly string[]): string[] {
  return setCookies.filter((one) => one.startsWith(`${KEY_COOKIE}=;`) && /;\s*Max-Age=0(;|$)/i.test(one))
}

/** Ask the move door, with the headers a case names. */
async function move(headers: Record<string, string>, device: string): Promise<AMove> {
  const res = await fetch(`${thisMachine}/api/office/pairing/move`, {
    method: 'POST',
    headers: { ...THE_PERSON, ...headers },
    body: JSON.stringify({ device }),
  })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = { notJson: text.slice(0, 200) }
  }
  const setCookies = res.headers.getSetCookie()
  const cookie = theCookieHalfIn(setCookies)
  const header = typeof body['deviceHalf'] === 'string' ? body['deviceHalf'] : null
  return {
    status: res.status,
    body,
    text,
    setCookies,
    cacheControl: res.headers.get('cache-control'),
    halves: cookie !== null && header !== null && header !== '' ? { cookie, header } : null,
  }
}

/** The halves a move gave, or the case fails saying the move gave none. */
function halvesOf(moved: AMove): TheHalves {
  if (moved.halves === null) throw new Error(`the move gave no two halves (status ${String(moved.status)}): ${String(moved.body['error'] ?? '')}`)
  return moved.halves
}

/** What the pairing read says to a request with these headers. */
async function thePairingRead(headers: Record<string, string>): Promise<{ status: number; mayMove: unknown }> {
  const res = await fetch(`${thisMachine}/api/office/pairing`, { headers: { ...THE_PERSON, ...headers } })
  const body = (await res.json()) as { mayMove?: unknown }
  return { status: res.status, mayMove: body.mayMove }
}

/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
async function changeTheScene(headers: Record<string, string>): Promise<number> {
  const res = await fetch(`${thisMachine}/api/office/scene-settings`, { method: 'PATCH', headers, body: JSON.stringify({ motion: true }) })
  return res.status
}

interface ACredentialRow {
  id: string
  standing: string
  handle: string
}

/** The credentials the Embassy lists, read on this computer. */
async function theEmbassysList(): Promise<ACredentialRow[]> {
  const res = await fetch(`${thisMachine}/api/office/visitors`, { headers: THE_PERSON })
  expect(res.status, 'the Embassy list was not read').toBe(200)
  return ((await res.json()) as { credentials: ACredentialRow[] }).credentials
}

function count(table: 'visitor_credentials' | 'held_keys' | 'records'): number {
  return (t?.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

function counted(): Record<string, number> {
  return {
    credentials: count('visitor_credentials'),
    keys: count('held_keys'),
    records: count('records'),
  }
}

/** The lines the log holds that hold one of these values. */
function linesHolding(values: readonly string[]): number {
  return THE_LOG.lines.filter((line) => values.some((value) => line.includes(value))).length
}

describe('the move door', () => {
  beforeAll(async () => {
    t = await freshDb()
    keys = await import('../src/server/lib/keys.ts')
    visitors = await import('../src/server/lib/visitors.ts')
    // THE APP AS tests/helpers.ts BUILDS IT, not for production, with the logger on and writing into THE_LOG.
    const { buildApp } = await import('../src/server/index.ts')
    app = (await buildApp({
      production: false,
      webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
      webAppUrl: settings().webAddress,
      logLevel: 'info',
      logStream: THE_LOG,
    })).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  }, 120_000)

  beforeEach(() => {
    THE_LOG.clear()
  })

  afterAll(async () => {
    if (app !== undefined) await app.close()
    t?.close()
  })

  it('1: moves the person\'s key in the old cookie to two halves, with no-store, and ends the old cookie; the person\'s key still works', async () => {
    const read = await thePairingRead(theOldCookie(thePersonsKey()))
    expect([read.status, read.mayMove], 'the read with the old cookie').toEqual([200, true])
    expect((await thePairingRead({})).mayMove, 'the read with no old cookie said mayMove').toBe(false)

    const name = aBrowsersName()
    const moved = await move(theOldCookie(thePersonsKey()), name)
    expect(moved.status, moved.text.slice(0, 300)).toBe(200)
    expect(moved.body['moved'], 'what moved').toBe('the-person-key')
    expect(moved.cacheControl ?? '', 'the answer holding a half may be kept').toContain('no-store')
    const halves = halvesOf(moved)
    expect(moved.setCookies.length, 'the move set more or fewer cookies than the half and the end of the old one').toBe(2)
    expect(theEndsOfTheOldCookie(moved.setCookies).length, 'the move did not end the old cookie').toBe(1)
    expect(theEndsOfTheOldCookie(moved.setCookies)[0] ?? '', 'the old cookie is ended on another path').toMatch(/;\s*Path=\/(;|$)/i)
    expect(moved.text.includes(thePersonsKey()), 'the move answered the person\'s key').toBe(false)

    expect(await changeTheScene({ ...AN_AGENT, cookie: halves.cookie, [DEVICE_HALF_HEADER]: halves.header }), 'both halves are the person').toBe(200)
    expect(await changeTheScene({ ...AN_AGENT, [KEY_HEADER]: thePersonsKey() }), 'the person\'s key is still the person').toBe(200)
    const row = (await theEmbassysList()).find((one) => one.handle === name)
    expect(row?.standing, 'the moved browser is not at the Embassy, confirmed, under its name').toBe('trusted')
  })

  it('2: refuses a move with no old cookie, or with a key this office never gave, writes nothing, and still ends an old cookie it was sent', async () => {
    const before = counted()
    const none = await move({}, aBrowsersName())
    expect([none.status, none.body['code']], none.text.slice(0, 300)).toEqual([409, NOTHING_TO_MOVE])
    expect(none.setCookies, 'a move with no old cookie set a cookie').toEqual([])
    expect(none.body['deviceHalf'], 'a refused move answered a half').toBeUndefined()

    const madeUp = randomBytes(32).toString('base64url')
    expect((await thePairingRead(theOldCookie(madeUp))).mayMove, 'the read with a key this office never gave said mayMove').toBe(false)
    const unknown = await move(theOldCookie(madeUp), aBrowsersName())
    expect([unknown.status, unknown.body['code']], unknown.text.slice(0, 300)).toEqual([409, NOTHING_TO_MOVE])
    expect(theCookieHalfIn(unknown.setCookies), 'a refused move set the cookie half').toBeNull()
    expect(theEndsOfTheOldCookie(unknown.setCookies).length, 'a refused move left the old cookie it was sent').toBe(1)
    expect(unknown.body['deviceHalf'], 'a refused move answered a half').toBeUndefined()
    expect(counted(), 'a refused move wrote something').toEqual(before)
  })

  it('3: writes one line in the server\'s log naming what moved, and no key and no half', async () => {
    if (keys === undefined) throw new Error('the keys module was not loaded')
    const moved = await move(theOldCookie(thePersonsKey()), aBrowsersName())
    const halves = halvesOf(moved)
    await settle()
    const said = keys.aMovesLogLine('the-person-key')
    expect(THE_LOG.lines.filter((line) => theWordsOf(line) === said).length, 'lines that name the move').toBe(1)
    const values = [thePersonsKey(), halves.header, halves.cookie.slice(DEVICE_HALF_COOKIE.length + 1)]
    expect(linesHolding(values), 'lines of the log that hold the key or a half').toBe(0)
  })

  it('4: moves a visitor\'s old token to a new credential under the same name, confirmed, and ends the old one at the Embassy', async () => {
    if (visitors === undefined || keys === undefined || t === undefined) throw new Error('the modules were not loaded')
    // A VISITOR'S DEVICE AS AN OFFICE FROM BEFORE SEC-2 HOLDS IT: one credential whose token is one piece.
    const { credential } = visitors.issueAPersonsDeviceCredential({
      name: THE_VISITORS_NAME,
      machine: '198.51.100.9',
      machineHow: 'made up by a test',
      runtime: null,
    })
    const oldToken = randomBytes(32).toString('base64url')
    t.client.sqlite.prepare('UPDATE visitor_credentials SET token_hash = ? WHERE id = ?').run(createHash('sha256').update(oldToken).digest('hex'), credential.id)
    const confirmed = await fetch(`${thisMachine}/api/office/visitors/${credential.id}/confirm`, { method: 'POST', headers: THE_PERSON, body: '{}' })
    expect(confirmed.status, 'the old credential was not confirmed').toBe(200)
    expect((await thePairingRead(theOldCookie(oldToken))).mayMove, 'the read with a visitor\'s old token').toBe(true)

    THE_LOG.clear()
    const moved = await move(theOldCookie(oldToken), 'A name the page gives')
    expect(moved.status, moved.text.slice(0, 300)).toBe(200)
    expect(moved.body['moved'], 'what moved').toBe('a-device-credential')
    const halves = halvesOf(moved)
    expect(theEndsOfTheOldCookie(moved.setCookies).length, 'the move did not end the old cookie').toBe(1)

    const rows = (await theEmbassysList()).filter((one) => one.handle === THE_VISITORS_NAME)
    expect(rows.find((one) => one.id === credential.id)?.standing, 'the old credential').toBe('ended')
    const now = rows.filter((one) => one.id !== credential.id)
    expect(now.map((one) => one.standing), 'the credentials under the old name, other than the old one').toEqual(['trusted'])
    expect((await theEmbassysList()).some((one) => one.handle === 'A name the page gives'), 'the move took the page\'s name for a visitor').toBe(false)
    expect(await changeTheScene({ ...AN_AGENT, cookie: halves.cookie, [DEVICE_HALF_HEADER]: halves.header }), 'the new halves are the person').toBe(200)
    expect((await thePairingRead(theOldCookie(oldToken))).mayMove, 'the old token can move again').toBe(false)

    await settle()
    const said = keys.aMovesLogLine('a-device-credential')
    expect(THE_LOG.lines.filter((line) => theWordsOf(line) === said).length, 'lines that name the move').toBe(1)
    expect(linesHolding([oldToken, halves.header]), 'lines of the log that hold the token or a half').toBe(0)
  })

  it('5: refuses a move another site\'s page sent, and sets, ends and issues nothing; takes none, same-origin and no header', async () => {
    const before = counted()
    for (const [what, headers] of [
      ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }],
      ['Sec-Fetch-Site: same-site', { 'sec-fetch-site': 'same-site' }],
      ['a foreign Origin', { origin: A_FOREIGN_ORIGIN }],
    ] as const) {
      const refused = await move({ ...theOldCookie(thePersonsKey()), ...headers }, aBrowsersName())
      expect(refused.status, `a move with ${what} was taken`).toBe(403)
      expect(refused.setCookies, `a move with ${what} set or ended a cookie`).toEqual([])
      expect(refused.body['deviceHalf'], `a move with ${what} answered a half`).toBeUndefined()
    }
    expect(counted(), 'a refused move wrote something').toEqual(before)
    for (const [what, headers] of [
      ['Sec-Fetch-Site: none', { 'sec-fetch-site': 'none' }],
      ['Sec-Fetch-Site: same-origin', { 'sec-fetch-site': 'same-origin' }],
      ['no Sec-Fetch-Site', {}],
    ] as const) {
      const taken = await move({ ...theOldCookie(thePersonsKey()), ...headers }, aBrowsersName())
      expect(taken.status, `a move with ${what} was refused: ${String(taken.body['error'] ?? '')}`).toBe(200)
      expect(taken.halves, `a move with ${what} gave no two halves`).not.toBeNull()
    }
  })
})

describe('a page that holds the old cookie', () => {
  let live: LiveApp | undefined
  const moves: string[] = []
  const callsWithTheHalf: string[] = []

  beforeAll(async () => {
    live = await liveApp({ name: 'the-old-cookie-moves', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
    const key = thePersonsKeyHeader(join(live.dir, 'keys.json'))[KEY_HEADER]
    if (key === undefined) throw new Error('the live office keeps no person key')
    // THE OLD COOKIE, as a browser paired before SEC-2 holds it, and no half.
    await live.context.addCookies([{ name: KEY_COOKIE, value: key, domain: '127.0.0.1', path: '/' }])
    const api = live.api
    live.page.on('request', (request: Request) => {
      if (!request.url().startsWith(api)) return
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/office/pairing/move') moves.push(request.url())
      if (request.headers()[DEVICE_HALF_HEADER] !== undefined) callsWithTheHalf.push(new URL(request.url()).pathname)
    })
  }, 300_000)

  afterAll(async () => {
    await live?.stop()
  }, 120_000)

  it('6: moves once and says so once; a reload says nothing and sends no second move', async () => {
    if (live === undefined) throw new Error('the live office was not started')
    const sentence = say('w13s.pairing.moved')
    await live.page.goto(`${live.site}/`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    await live.page.getByText(sentence).first().waitFor({ timeout: 30_000 })
    expect(await live.page.getByText(sentence).count(), 'the sentence is shown').toBe(1)
    expect(moves.length, 'moves sent').toBe(1)
    const cookies = await live.context.cookies(live.api)
    expect(cookies.some((one) => one.name === KEY_COOKIE), 'the old cookie is still held').toBe(false)
    expect(cookies.filter((one) => one.name === DEVICE_HALF_COOKIE).length, 'the cookie half is held').toBe(1)

    callsWithTheHalf.length = 0
    await live.page.reload({ timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    await new Promise((done) => setTimeout(done, 2_000))
    expect(await live.page.getByText(sentence).count(), 'the sentence is shown again').toBe(0)
    expect(moves.length, 'moves sent').toBe(1)
    expect(callsWithTheHalf.length, 'the page\'s own calls after the reload carry the header half').toBeGreaterThan(0)
  }, 180_000)
})
