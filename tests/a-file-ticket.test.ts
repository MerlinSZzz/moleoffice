// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE TICKET OPENS ONE PATH FOR A WHILE, IN ONE BROWSER, AND IS WRITTEN NOWHERE (wave 13s, line 13s, SEC-2).
 *
 * A browser proves the person with two halves of one device key: the cookie half, which the browser sends by itself,
 * and the header half, which the page sends on its own calls. A picture, a video, a frame or a saved file is loaded by
 * the browser and not by the page, so it carries the cookie half and never the header half. One half alone proves
 * nothing. So the page asks the ticket door, with both halves, for an address that opens one file, and hands that
 * address to the browser.
 *
 * Item 3 of SEC-2's design says so. The starter's decision on the names fixes the door, POST /api/file/ticket, and the
 * query parameter, ticket, on GET /api/file. It also binds a ticket to the cookie half it was made under, so a copied
 * address opens nothing in another browser.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. the door, asked with both halves, answers a ticketed address with no-store, and a GET and a HEAD of it with the
 *      cookie half alone are answered;
 *   2. the same ticket on another path, or on a write, is refused and writes nothing;
 *   3. the ticket without its cookie half, or beside another browser's, is refused;
 *   4. a ticket ends 30 minutes after its last use, and 12 hours after it was made however often it is used;
 *   5. a new app holds no ticket an old one made, as a restart ends every ticket;
 *   6. the server's log holds no ticket, for a ticketed read that is answered or refused;
 *   7. every answer of the file door tells the browser to send no referrer: the bytes, a text file opened as itself,
 *      the PDF's own answer to a frame, and a refusal;
 *   8. the door makes no ticket for a request not proved by two halves.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The app listens on a real socket on 127.0.0.1, because the press, the halves and the key window read the listener,
 * and an injected request is on none. A browser's two presses are made here, so this file holds two browsers' halves.
 * A load the browser makes is a GET or a HEAD that carries the cookie half and nothing else, and that is what is sent.
 *
 * The files are made up and written into a folder of this test's own inside the checkout, which is a preview root, and
 * a report record names them. The clock the tickets read is the module's own seam, so the halves and every other part
 * of the office keep the real time. A new app in this process stands for a restart, so the tickets live with the app.
 *
 * No half, no key and no ticket is printed: a comparison says only whether it held, and a count says how many lines
 * held one.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The person's headers and no key, as a page of this office sends them. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The refusal of a ticket the office does not honour for the request that carries it. */
const NOT_HONOURED = 'fileTicketNotHonoured'
/** The refusal of the ticket door to a request not proved by two halves. */
const NEEDS_TWO_HALVES = 'fileTicketNeedsTwoHalves'
/** The refusal of a request that carries one half of a device key and not the other. */
const ONE_HALF = 'oneHalfOfADeviceKey'

const A_MINUTE = 60_000
const AN_HOUR = 60 * A_MINUTE

/** A record a load might try to write. */
const A_RECORD = JSON.stringify({ kind: 'note', title: 'A note a ticket tried to write', data: { body: 'Made up by a test.' } })

/** The made-up files, and what each is. */
const A_PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 251, 252])
const ANOTHER_PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6, 247, 248, 249])
const A_TEXT = Buffer.from('A made-up note. Nothing in it is a real observation.\n', 'utf8')
const A_DOCUMENT = Buffer.from('%PDF-1.4\n% A made-up document, written by a test.\n%%EOF\n', 'utf8')

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

/** Give the log a moment to finish before its lines are read. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

let t: TestDb | undefined
let app: FastifyInstance | undefined
let thisMachine = ''
let folder = ''
let words: typeof import('../src/shared/i18n.ts') | undefined
let tickets: typeof import('../src/server/lib/file-tickets.ts') | undefined
/** The report that names the files. */
let report = ''

const thePicture = (): string => join(folder, 'a-made-up-picture.png')
const theOtherPicture = (): string => join(folder, 'another-made-up-picture.png')
const theText = (): string => join(folder, 'a-made-up-note.txt')
const theDocument = (): string => join(folder, 'a-made-up-document.pdf')

/** The short sha256 a file block stores, as the store works it out. */
function hashOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

/** The app as tests/helpers.ts builds it, not for production, with the logger writing into a log of this file's. */
async function anApp(log: TheServersLog): Promise<FastifyInstance> {
  const { buildApp } = await import('../src/server/index.ts')
  const built = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: log,
  })).app
  await built.listen({ host: '127.0.0.1', port: 0 })
  return built
}

function whereItListens(one: FastifyInstance): string {
  return `http://127.0.0.1:${String((one.server.address() as AddressInfo).port)}`
}

/** The two halves a browser holds, as it sends them: the Cookie pair and the header half. */
interface TheHalves {
  cookie: string
  header: string
}

/** A browser's press on this computer, and the two halves it gave. */
async function aPairedBrowser(device: string): Promise<TheHalves> {
  const res = await fetch(`${thisMachine}/api/office/pairing`, { method: 'POST', headers: THE_PERSON, body: JSON.stringify({ device }) })
  const body = (await res.json()) as { deviceHalf?: unknown }
  const cookie = res.headers.getSetCookie().map((one) => one.split(';')[0] ?? '').find((pair) => pair.startsWith(`${DEVICE_HALF_COOKIE}=`) && pair.length > DEVICE_HALF_COOKIE.length + 1)
  if (res.status !== 200 || cookie === undefined || typeof body.deviceHalf !== 'string' || body.deviceHalf === '') {
    throw new Error(`the press gave no two halves (status ${String(res.status)})`)
  }
  return { cookie, header: body.deviceHalf }
}

interface ATicket {
  status: number
  cacheControl: string | null
  code: string | undefined
  /** The ticketed address, whole, against the listener that answered. */
  address: URL | null
}

/** Ask the ticket door for one file, with the headers a case names. */
async function askForATicket(path: string, headers: Record<string, string>, at = thisMachine): Promise<ATicket> {
  const res = await fetch(`${at}/api/file/ticket`, {
    method: 'POST',
    headers: { ...THE_PERSON, ...headers },
    body: JSON.stringify({ path, record: report, workspace: 'default' }),
  })
  const body = (await res.json()) as { address?: unknown; code?: unknown }
  return {
    status: res.status,
    cacheControl: res.headers.get('cache-control'),
    code: typeof body.code === 'string' ? body.code : undefined,
    address: typeof body.address === 'string' ? new URL(body.address, at) : null,
  }
}

/** A ticketed address for one file, made with both of a browser's halves, or the case fails saying why. */
async function aTicketFor(path: string, halves: TheHalves, at = thisMachine): Promise<URL> {
  const made = await askForATicket(path, { cookie: halves.cookie, [DEVICE_HALF_HEADER]: halves.header }, at)
  if (made.status !== 200 || made.address === null) throw new Error(`the ticket door answered ${String(made.status)} ${made.code ?? ''}`)
  return made.address
}

/** The ticket an address carries. */
function theTicketIn(address: URL): string {
  const ticket = address.searchParams.get('ticket')
  if (ticket === null || ticket === '') throw new Error('the address the door answered carries no ticket')
  return ticket
}

/** The same address on another listener, or with another path or more words, as a copy of it would be. */
function theAddress(address: URL, change: { at?: string; path?: string; more?: Record<string, string> } = {}): string {
  const copy = new URL(`${address.pathname}${address.search}`, change.at ?? address.origin)
  if (change.path !== undefined) copy.searchParams.set('path', change.path)
  for (const [name, value] of Object.entries(change.more ?? {})) copy.searchParams.set(name, value)
  return copy.toString()
}

interface ALoad {
  status: number
  code: string | undefined
  error: string | undefined
  headers: Headers
  bytes: Buffer
}

/**
 * A load as a browser makes it: the cookie half, if the case names one, and nothing else. A case that names the
 * header half too sends it, which a browser's own load never does.
 */
async function load(address: string, method: 'GET' | 'HEAD' | 'POST' = 'GET', halves: Partial<TheHalves> = {}, body?: string): Promise<ALoad> {
  const res = await fetch(address, {
    method,
    headers: {
      ...(halves.cookie === undefined ? {} : { cookie: halves.cookie }),
      ...(halves.header === undefined ? {} : { [DEVICE_HALF_HEADER]: halves.header }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body }),
  })
  const bytes = Buffer.from(await res.arrayBuffer())
  let code: string | undefined
  let error: string | undefined
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    const parsed = JSON.parse(bytes.toString('utf8')) as { code?: unknown; error?: unknown }
    code = typeof parsed.code === 'string' ? parsed.code : undefined
    error = typeof parsed.error === 'string' ? parsed.error : undefined
  }
  return { status: res.status, code, error, headers: res.headers, bytes }
}

/** The answer is the ticket's refusal, in its English, and carries none of the file's bytes. */
function expectNotHonoured(answer: ALoad, what: string): void {
  if (words === undefined) throw new Error('the words were not loaded')
  expect(answer.status, `${what}: ${answer.bytes.toString('utf8').slice(0, 300)}`).toBe(403)
  expect(answer.code, what).toBe(NOT_HONOURED)
  expect(answer.error, what).toBe(words.createI18n('en').t('server.fileTicketNotHonoured'))
  expect(answer.bytes.includes(A_PICTURE), `${what}: the refusal carries the file`).toBe(false)
}

function countRecords(): number {
  return (t?.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  words = await import('../src/shared/i18n.ts')
  tickets = await import('../src/server/lib/file-tickets.ts')
  // INSIDE THE CHECKOUT, which is a preview root, so the door may serve the files.
  mkdirSync(resolve('.logs'), { recursive: true })
  folder = aTestDatabaseFolder('a-file-ticket', resolve('.logs'))
  writeFileSync(thePicture(), A_PICTURE)
  writeFileSync(theOtherPicture(), ANOTHER_PICTURE)
  writeFileSync(theText(), A_TEXT)
  writeFileSync(theDocument(), A_DOCUMENT)
  app = await anApp(THE_LOG)
  thisMachine = whereItListens(app)
  const file = (id: string, path: string, name: string, bytes: Buffer) => ({ id, type: 'file', path, name, size: bytes.length, hash: hashOf(bytes) })
  const filed = await fetch(`${thisMachine}/api/records`, {
    method: 'POST',
    headers: { ...THE_PERSON, [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]! },
    body: JSON.stringify({
      kind: 'report',
      title: 'A test report that names four made-up files',
      summary: 'Two pictures, a note and a document. The test made every one of them up.',
      data: {
        for: 'The file ticket test',
        date: '2026-11-22',
        blocks: [
          { id: 'b1', type: 'text', text: 'A test report. Every file in it was made up by the test.' },
          file('f1', thePicture(), 'a-made-up-picture.png', A_PICTURE),
          file('f2', theOtherPicture(), 'another-made-up-picture.png', ANOTHER_PICTURE),
          file('f3', theText(), 'a-made-up-note.txt', A_TEXT),
          file('f4', theDocument(), 'a-made-up-document.pdf', A_DOCUMENT),
        ],
      },
    }),
  })
  expect(filed.status, (await filed.clone().text()).slice(0, 300)).toBe(201)
  report = ((await filed.json()) as { record: { id: string } }).record.id
}, 120_000)

afterEach(() => {
  tickets?.useAClockForTickets(Date.now)
  THE_LOG.clear()
})

afterAll(async () => {
  if (app !== undefined) await app.close()
  t?.close()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

describe('a file ticket', () => {
  it('1: is answered with no-store to both halves, and opens its file to a GET and a HEAD with the cookie half alone', async () => {
    const browser = await aPairedBrowser('Test browser 1')
    const made = await askForATicket(thePicture(), { cookie: browser.cookie, [DEVICE_HALF_HEADER]: browser.header })
    expect([made.status, made.code], 'the ticket door').toEqual([200, undefined])
    expect(made.cacheControl ?? '', 'the ticket door\'s answer may be kept').toContain('no-store')
    if (made.address === null) throw new Error('the ticket door answered no address')
    expect(made.address.pathname).toBe('/api/file')
    expect(made.address.searchParams.get('path')).toBe(thePicture())
    theTicketIn(made.address)

    const read = await load(made.address.toString(), 'GET', { cookie: browser.cookie })
    expect(read.status, read.bytes.toString('utf8').slice(0, 300)).toBe(200)
    expect(read.bytes.equals(A_PICTURE), 'the bytes are not the file\'s').toBe(true)
    const head = await load(made.address.toString(), 'HEAD', { cookie: browser.cookie })
    expect(head.status).toBe(200)
  })

  it('2: opens nothing on another path, and writes nothing when it is sent with a write', async () => {
    const browser = await aPairedBrowser('Test browser 2')
    const address = await aTicketFor(thePicture(), browser)
    expectNotHonoured(await load(theAddress(address, { path: theOtherPicture() }), 'GET', { cookie: browser.cookie }), 'the ticket on another path a record names')

    const before = countRecords()
    expectNotHonoured(await load(address.toString(), 'POST', { cookie: browser.cookie }, A_RECORD), 'the ticketed address asked with a POST')
    const ticket = theTicketIn(address)
    expectNotHonoured(
      await load(`${thisMachine}/api/records?ticket=${encodeURIComponent(ticket)}`, 'POST', { cookie: browser.cookie }, A_RECORD),
      'a write of a record with the ticket',
    )
    expect(countRecords(), 'a refused write wrote something').toBe(before)
  })

  it('3: opens nothing without the cookie half it was made under, or beside another browser\'s', async () => {
    const browser = await aPairedBrowser('Test browser 3')
    const another = await aPairedBrowser('Test browser 4')
    const address = await aTicketFor(thePicture(), browser)
    expectNotHonoured(await load(address.toString(), 'GET'), 'the ticket with no cookie half')
    expectNotHonoured(await load(address.toString(), 'GET', { cookie: another.cookie }), 'the ticket beside another browser\'s cookie half')
    // ANOTHER BROWSER'S TWO HALVES are the person, and still do not make this browser's ticket theirs.
    expectNotHonoured(await load(address.toString(), 'GET', another), 'the ticket beside another browser\'s two halves')
  })

  it('4: ends 30 minutes after its last use, and 12 hours after it was made however often it is used', async () => {
    if (tickets === undefined) throw new Error('the tickets were not loaded')
    const browser = await aPairedBrowser('Test browser 5')
    let now = Date.parse('2026-11-22T09:00:00')
    tickets.useAClockForTickets(() => now)

    // UNUSED FOR 29 MINUTES IT OPENS, AND THE 30 MINUTES COUNT AGAIN FROM THAT USE.
    const kept = await aTicketFor(thePicture(), browser)
    now += 29 * A_MINUTE
    expect((await load(kept.toString(), 'GET', { cookie: browser.cookie })).status, 'used 29 minutes after it was made').toBe(200)
    now += 29 * A_MINUTE
    expect((await load(kept.toString(), 'GET', { cookie: browser.cookie })).status, 'used 29 minutes after its last use').toBe(200)
    now += 31 * A_MINUTE
    expectNotHonoured(await load(kept.toString(), 'GET', { cookie: browser.cookie }), 'unused for 31 minutes')

    // USED EVERY 20 MINUTES, IT OPENS UNTIL 12 HOURS AFTER IT WAS MADE, AND NOT AT 12 HOURS.
    const made = now
    const used = await aTicketFor(thePicture(), browser)
    for (let minutes = 20; minutes < 12 * 60; minutes += 20) {
      now = made + minutes * A_MINUTE
      expect((await load(used.toString(), 'GET', { cookie: browser.cookie })).status, `used ${String(minutes)} minutes after it was made`).toBe(200)
    }
    now = made + 12 * AN_HOUR
    expectNotHonoured(await load(used.toString(), 'GET', { cookie: browser.cookie }), 'used 12 hours after it was made, 20 minutes after its last use')
  }, 60_000)

  it('5: opens nothing in a new app, as a restart ends every ticket', async () => {
    const browser = await aPairedBrowser('Test browser 6')
    const address = await aTicketFor(thePicture(), browser)
    expect((await load(address.toString(), 'GET', { cookie: browser.cookie })).status, 'the ticket in the app that made it').toBe(200)
    const restarted = await anApp(new TheServersLog())
    try {
      const there = whereItListens(restarted)
      expectNotHonoured(await load(theAddress(address, { at: there }), 'GET', { cookie: browser.cookie }), 'the old ticket in a new app')
      // THE HALVES STILL PROVE THE PERSON THERE: only the ticket is gone.
      const again = await aTicketFor(thePicture(), browser, there)
      expect((await load(again.toString(), 'GET', { cookie: browser.cookie })).status, 'a ticket the new app made').toBe(200)
    } finally {
      await restarted.close()
    }
  })

  it('6: is written in no line of the server\'s log, for a read that is answered or refused', async () => {
    const browser = await aPairedBrowser('Test browser 7')
    const another = await aPairedBrowser('Test browser 8')
    const address = await aTicketFor(thePicture(), browser)
    const ticket = theTicketIn(address)
    THE_LOG.clear()
    expect((await load(address.toString(), 'GET', { cookie: browser.cookie })).status, 'the ticketed read').toBe(200)
    expectNotHonoured(await load(address.toString(), 'GET', { cookie: another.cookie }), 'the ticketed read beside another browser\'s cookie half')
    await settle()
    expect(THE_LOG.lines.filter((line) => line.includes('/api/file')).length, 'the log holds no line of a file read, so this case reads nothing').toBeGreaterThan(0)
    expect(THE_LOG.lines.filter((line) => line.includes(ticket)).length, 'lines of the log that hold the ticket').toBe(0)
    expect(THE_LOG.lines.filter((line) => line.includes(encodeURIComponent(ticket))).length, 'lines of the log that hold the ticket, encoded').toBe(0)
  })

  it('7: tells the browser to send no referrer, on the bytes, the opened text file, the PDF\'s answer to its frame and a refusal', async () => {
    const browser = await aPairedBrowser('Test browser 9')
    const theBytes = await load((await aTicketFor(thePicture(), browser)).toString(), 'GET', { cookie: browser.cookie })
    expect(theBytes.status).toBe(200)
    // A TEXT FILE OPENED FOR THE REPORT IS ANSWERED AS ITSELF, as text/plain. Since 632ba0176 the door builds no page
    // for it, and the page asks words=1 for its words.
    const theOpenedText = await load(theAddress(await aTicketFor(theText(), browser), { more: { open: '1', shown: '1' } }), 'GET', { cookie: browser.cookie })
    expect([theOpenedText.status, theOpenedText.headers.get('content-type') ?? ''].join(' '), 'the opened text file').toContain('text/plain')
    const theFrame = await load(theAddress(await aTicketFor(theDocument(), browser), { more: { open: '1', shown: '1' } }), 'GET', { cookie: browser.cookie })
    expect([theFrame.status, theFrame.headers.get('content-type') ?? ''].join(' '), 'the PDF\'s answer to its frame').toContain('application/pdf')
    const nobodyNamesIt = join(folder, 'a-file-no-record-names.png')
    const res = await fetch(`${thisMachine}/api/file?path=${encodeURIComponent(nobodyNamesIt)}&workspace=default`, {
      headers: { cookie: browser.cookie, [DEVICE_HALF_HEADER]: browser.header },
    })
    expect(res.status, 'a read of a path no record names').toBeGreaterThanOrEqual(400)
    for (const [what, headers] of [
      ['the bytes', theBytes.headers],
      ['the opened text file', theOpenedText.headers],
      ['the PDF\'s answer to its frame', theFrame.headers],
      ['a refusal', res.headers],
    ] as const) {
      expect(headers.get('referrer-policy'), what).toBe('no-referrer')
    }
  })

  it('8: is made for no request that is not proved by two halves', async () => {
    if (words === undefined) throw new Error('the words were not loaded')
    const browser = await aPairedBrowser('Test browser 10')
    for (const [what, headers, status, code] of [
      ['the cookie half alone', { cookie: browser.cookie }, 401, ONE_HALF],
      ['the header half alone', { [DEVICE_HALF_HEADER]: browser.header }, 401, ONE_HALF],
      ['the person\'s claim with no key, which the key window lets in on this computer', {}, 403, NEEDS_TWO_HALVES],
      ['the person\'s key in the key header', { [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]! }, 403, NEEDS_TWO_HALVES],
    ] as const) {
      const made = await askForATicket(thePicture(), headers)
      expect([made.status, made.code], what).toEqual([status, code])
      expect(made.address, `${what}: an address was answered`).toBeNull()
    }
    const refused = await fetch(`${thisMachine}/api/file/ticket`, {
      method: 'POST',
      headers: { ...THE_PERSON, [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]! },
      body: JSON.stringify({ path: thePicture(), record: report, workspace: 'default' }),
    })
    expect(((await refused.json()) as { error?: unknown }).error, 'the refusal\'s words').toBe(words.createI18n('en').t('server.fileTicketNeedsTwoHalves'))
  })
})
