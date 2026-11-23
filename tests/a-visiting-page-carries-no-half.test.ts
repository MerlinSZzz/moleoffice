// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITING PAGE CARRIES NEITHER HALF, AND A WORLD'S ORIGIN IS READ WITHOUT CREDENTIALS (wave 13s, line 13s, SEC-2).
 *
 * A page on a trip sends its calls to the world it is visiting, at another address. A browser proves the person with
 * two halves of one device key: a cookie half the browser keeps by host, and a header half the page keeps and sends on
 * its own calls. Neither half goes to a trip address, and one half alone proves nothing anywhere. The visited world
 * takes the page's origin when it is exactly one origin on the office's list of its own pages, and answers it without
 * leave to send a cookie. The office writes that list into its mirror, made from the names its Host check takes. A
 * world takes no other world's origin, and with no list it takes no page's origin at all. The office itself takes no
 * other world's origin, for a read or for a write.
 *
 * Item 2 of SEC-2's design says so: a visited world admits only exact origins, without credentials, and neither half
 * goes to a trip address. Item 6 says the origins are one list with the Host check's.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. a world that is not the office answers each origin on the office's list of its pages, on a read and on a
 *      preflight, with no leave to send a cookie. It refuses another world's exact origin, and the same name on a port
 *      no list names. With no list it refuses every page, and logs that the office's list could not be read: with no
 *      mirror, a mirror it cannot read, a mirror an older office wrote without the list, and a mirror written before
 *      the office knew its listeners;
 *   2. the office refuses the exact origin of every other kind of world on a read and on a write, writes nothing, and
 *      logs each refusal in one line that names the world's kind and never its origin;
 *   3. a page on a trip sends neither half on a script call or a crossorigin load: the transport, the event stream, a
 *      terminal's stream, a file read and a portrait;
 *   4. the office's mirror holds the origins of its own pages exactly as the Host check's names make them, and the
 *      Origin check takes each of them as a page of this office. Before the office knows its listeners, the mirror
 *      names no page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT PROVED HERE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A frame and a top-level page load on the visited world's host still carry the cookie half. A browser sends a cookie
 * by host and not by port, and a page cannot stop it for those loads. The header half never goes with them, because a
 * page sends it only on its own calls. The cookie half alone proves nothing anywhere, and
 * tests/a-browser-proves-the-person-with-two-halves.test.ts pins that. So case 3 reads script calls and crossorigin
 * loads only, and leaves out a request the browser marks as a frame or a page.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE WORLDS
 * ---------------------------------------------------------------------------------------
 *
 * The world under test is this file's own app, on a real socket on 127.0.0.1, because the origin check reads the
 * listener and an injected request is on none. Which world is the office is read from the rows: the office is the
 * database holding a world of kind home, and src/server/lib/office.ts asks that in one place. Case 2 writes that row
 * for this database, and every case removes every row after.
 *
 * Cases 1 and 3 stand in for the office's mirror with a file this file writes beside its own database. A database
 * that holds a home row is the office itself, so a test world cannot also be the office. Under a test runner a world
 * reads no mirror, so the case names the file through the Origin check's own seam, `useTheOfficesMirrorAt`. The list
 * of pages in that file is the stand-in office's. The rule under test is the same for every origin on it.
 *
 * Case 4 makes this database the office and tells the Host check's file which listeners it has, as `start()` in
 * src/server/index.ts does after it binds them: this file's socket as the loopback listener, and a door for other
 * machines on the same port. The door's number is from the range kept for documentation, and the probe lists it as
 * this machine's, so it is a name the Host check holds. Every origin is then on this file's socket's port, so the case
 * asks each of them there.
 *
 * In case 3 the page's own office is a test stack, which serves the page on a port of its own, so the mirror's list
 * names the page's origin. The visited world is this file's app. Its server's own request event reads every request
 * whole, before the app does. The test answers the terminal list with a made-up terminal, because the app holds none.
 *
 * The server's logger writes into THE_LOG, which is how case 2 reads the line a refusal writes.
 */

import { request, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { Route } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_HEADER } from '../src/config/key-header.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ListedTerminal, TheTerminalsNow } from '../src/shared/terminals.ts'
import { WORLD_KINDS, type WorldKind } from '../src/shared/worlds.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { pairTheContext } from './a-paired-context.ts'
import { freshDb, liveApp, thePersonsKeyHeader, type LiveApp, type TestDb } from './helpers.ts'

/** This machine's own number for another machine, from the range kept for documentation. */
const THE_NUMBER = '198.51.100.8'

/** Under an agent's name, as the origin cases ask: where the page was is the question, not who asked. */
const A_CALLER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-synthetic-caller',
}

/** The person, with the person's key, for the writes this file makes to set a case up. */
function asTheOwner(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]!,
  }
}

/** The refusal's code. */
const THE_CODE = 'originIsNotThisOffice'

/** A record a page in another world might try to write. */
const A_RECORD = JSON.stringify({ kind: 'note', title: 'A note a page in another world wrote', data: { body: 'Made up by a test.' } })

/** The setting that keeps a terminal holder from being started, by its name in src/server/lib/terminals.ts. */
const THE_HOLDER_SETTING = 'MOLE_OFFICE_TERMINAL_HOLDER'
const THE_HOLDER_BEFORE = process.env[THE_HOLDER_SETTING]

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
let office: typeof import('../src/server/lib/office.ts') | undefined
let world: typeof import('../src/server/lib/world.ts') | undefined
let resources: typeof import('../src/server/lib/resources.ts') | undefined
let words: typeof import('../src/shared/i18n.ts') | undefined
/** The probe every case but case 4 runs under: it reads no tailnet name. */
let theProbe: OsProbe | undefined
/** A record in this world, which case 2's read asks for. */
let aRecord = ''

function theApp(): FastifyInstance {
  if (app === undefined) throw new Error('the app was not started, so there is nothing to ask')
  return app
}

function theOffice(): typeof import('../src/server/lib/office.ts') {
  if (office === undefined) throw new Error('the worlds were not loaded')
  return office
}

/** The origin check, imported when a case reads its log line. It is new with SEC-2. */
async function theOriginCheck(): Promise<typeof import('../src/server/lib/an-origin-that-is-not-this-office.ts')> {
  return import('../src/server/lib/an-origin-that-is-not-this-office.ts')
}

/** The Host check's file, which says which listeners the office has and which origins its pages have. */
async function theHostCheck(): Promise<typeof import('../src/server/lib/a-host-that-is-not-this-office.ts')> {
  return import('../src/server/lib/a-host-that-is-not-this-office.ts')
}

/** The port of the app's own socket on 127.0.0.1. */
function thePort(): number {
  return (theApp().server.address() as AddressInfo).port
}

/** Where this world answers: its loopback address and its own port. */
function thisWorld(): string {
  return `http://127.0.0.1:${String(thePort())}`
}

/**
 * Ports that are not this world's, that the settings name neither as the API's nor as the dev server's, and that are
 * none of `alsoTaken`. So no rule of this world could take them, and only a row can.
 */
function portsThatAreNobodys(how: number, alsoTaken: readonly number[] = []): number[] {
  const taken = new Set([thePort(), settings().apiPort, settings().webPort, ...alsoTaken])
  const ports: number[] = []
  for (let port = 20_000; ports.length < how; port += 1) if (!taken.has(port)) ports.push(port)
  return ports
}

/** Write a world into this database's own list, as a server or an agent registers one. */
function registerAWorld(kind: WorldKind, said: { databaseIdentity: string; address: string; addressForOtherMachines?: string }): void {
  theOffice().registerWorldHere({
    name: `A made-up world of kind ${kind}`,
    kind,
    startedBy: null,
    checkout: null,
    head: null,
    databaseIdentity: said.databaseIdentity,
    address: said.address,
    addressForOtherMachines: said.addressForOtherMachines ?? null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'a-made-up-installation',
  })
}

/**
 * WRITE THE OFFICE'S MIRROR AS A STAND-IN OFFICE, with this database's worlds and the list of pages a case names.
 * `undefined` leaves the list out, as an office older than the list wrote it. `null` is the list of an office that did
 * not yet know its listeners.
 */
function writeAMirror(file: string, pageOrigins: readonly string[] | null | undefined): void {
  const mirror = {
    writtenAt: '2026-11-22 04:00:00',
    writtenBy: 'eeeeeeeeeeeeeeee',
    worlds: theOffice().worldsHere(),
    visits: [],
    ...(pageOrigins === undefined ? {} : { pageOrigins }),
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(mirror, null, 2)}\n`, 'utf8')
}

/** Take every world off this database's list, and the mirror an office writes, as a fresh database has. */
function forgetEveryWorld(): void {
  t?.client.sqlite.exec('DELETE FROM worlds')
  if (office !== undefined) rmSync(office.mirrorBesideThisDatabase(), { force: true })
  world?.forgetTheWorld()
}

interface Answer {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  json: Record<string, unknown> | undefined
}

/** One request to this world's own socket, with its own Host and the Origin a case names. */
function ask(input: {
  origin?: string
  path?: string
  method?: 'GET' | 'POST' | 'OPTIONS'
  headers?: Record<string, string>
  body?: string
}): Promise<Answer> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: thePort(),
        path: input.path ?? '/api/access',
        method: input.method ?? 'GET',
        headers: {
          ...A_CALLER,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(input.origin === undefined ? {} : { origin: input.origin }),
          ...input.headers,
          host: `127.0.0.1:${String(thePort())}`,
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.once('end', () => {
          done({ status: res.statusCode ?? 0, headers: res.headers, body, json: parsed(body) })
        })
      },
    )
    req.once('error', fail)
    req.end(input.body)
  })
}

function parsed(body: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(body)
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** The values the refusal carries, as an object of words, or none. */
function theValuesOf(answer: Answer): Record<string, string | number> {
  const values = answer.json?.['values']
  return values !== null && typeof values === 'object' ? values as Record<string, string | number> : {}
}

/** The answer is the coded refusal of an Origin that is not this office's, in its English, with no CORS answer. */
function expectRefused(answer: Answer, what: string): void {
  if (words === undefined) throw new Error('the words were not loaded')
  expect(answer.status, `${what}: ${answer.body.slice(0, 300)}`).toBe(403)
  expect(answer.json?.['code'], what).toBe(THE_CODE)
  expect(answer.json?.['error'], what).toBe(words.createI18n('en').t('server.originIsNotThisOffice', theValuesOf(answer)))
  expect(answer.headers['access-control-allow-origin'], what).toBeUndefined()
  expect(answer.headers['access-control-allow-credentials'], what).toBeUndefined()
  expect(answer.headers['set-cookie'], what).toBeUndefined()
}

/** The answer names the origin and gives no leave to send a cookie. */
function expectTakenWithoutCredentials(answer: Answer, origin: string, status: number, what: string): void {
  expect(answer.status, `${what}: ${answer.body.slice(0, 300)}`).toBe(status)
  expect(answer.json?.['code'], what).toBeUndefined()
  expect(answer.headers['access-control-allow-origin'], what).toBe(origin)
  expect(answer.headers['access-control-allow-credentials'], `${what}: leave to send a cookie`).toBeUndefined()
  expect(answer.headers['set-cookie'], what).toBeUndefined()
}

function count(table: 'records' | 'changes'): number {
  return (t?.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

function counted(): { records: number; changes: number } {
  return { records: count('records'), changes: count('changes') }
}

beforeAll(async () => {
  process.env[THE_HOLDER_SETTING] = 'off'
  t = await freshDb()
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
  resources = await import('../src/server/lib/resources.ts')
  words = await import('../src/shared/i18n.ts')
  // THIS MACHINE'S OWN TAILSCALE IS NEVER ASKED: the probe's read of its tailnet name answers none.
  const probe = Object.create(resources.LINUX_PROBE) as OsProbe
  probe.ownTailnetName = () => Promise.resolve(null)
  resources.useOsProbe(probe)
  theProbe = probe
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
  const written = await app.inject({ method: 'POST', url: '/api/records', headers: asTheOwner(), payload: A_RECORD })
  expect(written.statusCode, written.body.slice(0, 300)).toBe(201)
  aRecord = (JSON.parse(written.body) as { record: { id: string } }).record.id
  forgetEveryWorld()
}, 120_000)

afterEach(async () => {
  forgetEveryWorld()
  THE_LOG.clear()
  ;(await theOriginCheck()).useTheOfficesMirrorAt(undefined)
  ;(await theHostCheck()).theOfficeListensOn(null)
})

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  if (app !== undefined) await app.close()
  t?.close()
  if (THE_HOLDER_BEFORE === undefined) delete process.env[THE_HOLDER_SETTING]
  else process.env[THE_HOLDER_SETTING] = THE_HOLDER_BEFORE
})

describe('a world takes as a page\'s origin only one on the office\'s list of its pages, and never with credentials', () => {
  it('1: a world that is not the office answers each origin on the office\'s list of its pages without leave to send a cookie, refuses another world\'s exact origin, and with no list refuses every page and logs that the list could not be read', async () => {
    expect(theOffice().theOfficeIsInThisDatabase(), 'this database holds the office, so it is no visited world').toBe(false)
    const check = await theOriginCheck()
    const [itsPort, itsPortForOtherMachines, anotherWorldsPort, anotherPort] = portsThatAreNobodys(4) as [number, number, number, number]
    // ANOTHER WORLD, on this world's own list and so on the office's list of worlds below.
    const anotherWorld = `http://127.0.0.1:${String(anotherWorldsPort)}`
    registerAWorld('agent-made', { databaseIdentity: 'aaaaaaaaaaaaaaaa', address: anotherWorld })
    // THE OFFICE'S LIST OF ITS OWN PAGES, in the mirror a stand-in office wrote: the header says why.
    const address = `http://127.0.0.1:${String(itsPort)}`
    const addressForOtherMachines = `http://${THE_NUMBER}:${String(itsPortForOtherMachines)}`
    const theMirror = theOffice().mirrorBesideThisDatabase()
    writeAMirror(theMirror, [address, addressForOtherMachines])
    check.useTheOfficesMirrorAt(theMirror)

    for (const origin of [address, addressForOtherMachines]) {
      expectTakenWithoutCredentials(await ask({ origin }), origin, 200, `a read from ${origin}`)
      const preflight = await ask({
        origin,
        path: '/api/records',
        method: 'OPTIONS',
        headers: {
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, x-mole-office-actor-type',
        },
      })
      expectTakenWithoutCredentials(preflight, origin, 204, `a preflight from ${origin}`)
    }

    THE_LOG.clear()
    const before = counted()
    const elsewhere = `http://127.0.0.1:${String(anotherPort)}`
    const refusedHere: [string, string][] = [
      [anotherWorld, `another world's exact origin, ${anotherWorld}, on both lists of worlds`],
      [elsewhere, `${elsewhere}, the same name on a port no list names`],
    ]
    for (const [origin, what] of refusedHere) {
      expectRefused(await ask({ origin }), `a read from ${what}`)
      expectRefused(await ask({ origin, path: '/api/records', method: 'POST', body: A_RECORD }), `a write from ${what}`)
    }
    expect(counted(), 'a refused write wrote something').toEqual(before)
    await settle()
    expect(
      THE_LOG.lines.filter((one) => theWordsOf(one) === check.aWorldsRefusalLogLine('agent-made')),
      'the lines for another world\'s page, by that world\'s kind',
    ).toHaveLength(2)

    // WITH NO LIST, A WORLD TAKES NO PAGE OF THE OFFICE, and its log says why.
    const noList: [string, () => void][] = [
      ['no mirror', () => { rmSync(theMirror, { force: true }) }],
      ['a mirror it cannot read', () => { writeFileSync(theMirror, 'Not a mirror: words a test wrote.\n', 'utf8') }],
      ['a mirror an older office wrote without the list', () => { writeAMirror(theMirror, undefined) }],
      ['a mirror written before the office knew its listeners', () => { writeAMirror(theMirror, null) }],
    ]
    for (const [which, make] of noList) {
      make()
      THE_LOG.clear()
      const beforeThis = counted()
      for (const origin of [address, addressForOtherMachines]) {
        expectRefused(await ask({ origin }), `a read from ${origin}, with ${which}`)
        expectRefused(
          await ask({ origin, path: '/api/records', method: 'POST', body: A_RECORD }),
          `a write from ${origin}, with ${which}`,
        )
      }
      expect(counted(), `a refused write wrote something, with ${which}`).toEqual(beforeThis)
      await settle()
      // ONE LINE A REFUSAL, by the kind of its Origin: two for the loopback origin and two for the number.
      for (const kind of ['loopback', 'number'] as const) {
        const line = check.aRefusalWithoutTheOfficesListLogLine(kind)
        expect(
          THE_LOG.lines.filter((one) => theWordsOf(one) === line),
          `the lines that say the office's list could not be read, for an Origin of kind ${kind}, with ${which}`,
        ).toHaveLength(2)
      }
      for (const origin of [address, addressForOtherMachines]) {
        const host = new URL(origin).host
        expect(THE_LOG.lines.filter((one) => one.includes(host)), `a line of the log holds ${origin}, with ${which}`).toEqual([])
      }
    }
  })

  it('2: the office refuses the exact origin of every other kind of world on a read and a write, writes nothing, and logs the world\'s kind and never its origin', async () => {
    // THIS DATABASE IS THE OFFICE WHILE IT HOLDS A WORLD OF KIND HOME FOR ITSELF, by the one rule in
    // src/server/lib/office.ts.
    const itself = world?.theWorldThisDatabaseIs()
    if (itself === undefined || itself === null) throw new Error('this database has no identity, so it cannot be the office')
    registerAWorld('home', { databaseIdentity: itself, address: thisWorld() })
    expect(theOffice().theOfficeIsInThisDatabase(), 'the home row did not make this database the office').toBe(true)

    const kinds = WORLD_KINDS.filter((kind) => kind !== 'home')
    const ports = portsThatAreNobodys(kinds.length)
    const origins = new Map<WorldKind, string>()
    kinds.forEach((kind, at) => {
      const origin = `http://127.0.0.1:${String(ports[at])}`
      origins.set(kind, origin)
      registerAWorld(kind, { databaseIdentity: String.fromCharCode(98 + at).repeat(16), address: origin })
    })

    THE_LOG.clear()
    const before = counted()
    for (const [kind, origin] of origins) {
      expectRefused(await ask({ origin, path: `/api/records/${aRecord}` }), `a read of a record from a world of kind ${kind}`)
      expectRefused(
        await ask({ origin, path: '/api/records', method: 'POST', body: A_RECORD }),
        `a write of a record from a world of kind ${kind}`,
      )
    }
    expect(counted(), 'a refused write wrote something').toEqual(before)

    await settle()
    const check = await theOriginCheck()
    for (const [kind, origin] of origins) {
      const line = check.aWorldsRefusalLogLine(kind)
      expect(line, `the line for a world of kind ${kind} does not name its kind`).toContain(kind)
      expect(THE_LOG.lines.filter((one) => theWordsOf(one) === line), `the lines for a world of kind ${kind}`).toHaveLength(2)
      const host = new URL(origin).host
      expect(THE_LOG.lines.filter((one) => one.includes(host)), `a line of the log holds the origin of a world of kind ${kind}`).toEqual([])
    }
    // ONE LINE A REFUSAL: the world's line, and not also the line of the Origin's own kind.
    const theOriginsLines = new Set(check.EVERY_KIND_OF_ORIGIN.map((kind) => check.aRefusalsLogLine(kind)))
    expect(THE_LOG.lines.filter((one) => theOriginsLines.has(theWordsOf(one))), 'a world\'s refusal also wrote the line of its Origin\'s kind').toEqual([])
  })
})

/** What a page sends to the world it is visiting, by the address it asks. */
type WhatThePageSent = 'the transport' | 'the event stream' | 'a terminal\'s stream' | 'a file read' | 'a portrait'
const EVERYTHING_CASE_3_READS: readonly WhatThePageSent[] = ['the transport', 'the event stream', 'a terminal\'s stream', 'a file read', 'a portrait']

function whatItIs(pathname: string): WhatThePageSent {
  if (pathname === '/api/events') return 'the event stream'
  if (/^\/api\/terminals\/[^/]+\/stream$/.test(pathname)) return 'a terminal\'s stream'
  if (pathname === '/api/file') return 'a file read'
  if (/^\/api\/portraits\/[^/]+\/[^/]+\/[^/]+$/.test(pathname)) return 'a portrait'
  return 'the transport'
}

/** What the browser marks a frame or a page load with. The header says why case 3 leaves these out. */
const A_FRAME_OR_A_PAGE = new Set(['document', 'iframe', 'frame', 'embed', 'object'])

/**
 * One request the visited world received, as its server read it. The halves are never kept: only the cookies' names,
 * and whether the header half was there.
 */
interface ARequestReceived {
  method: string
  pathname: string
  dest: string | undefined
  cookieNames: string[]
  theHeaderHalf: boolean
}

function oneHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value
}

/** THE TERMINAL THE TEST MAKES UP. The test answers the terminal list with it, and no holder holds it. */
const A_MADE_UP_TERMINAL: ListedTerminal = {
  id: 'a-made-up-terminal',
  who: { kind: 'person', id: THE_PERSON },
  agent: null,
  project: 'default',
  command: '/bin/sh',
  args: [],
  folder: '/srv/made-up/terminal-folder',
  envNames: [],
  state: 'running',
  pid: 4243,
  cols: 80,
  rows: 24,
  openedAt: '2026-11-22 01:00:00',
  endedAt: null,
  exit: null,
  keeping: false,
  paneView: null,
}

const A_MADE_UP_TERMINAL_LIST: TheTerminalsNow = {
  holder: { state: 'running', pid: 4244, startedAt: '2026-11-22 01:00:00' },
  terminals: [A_MADE_UP_TERMINAL],
}

describe('a page on a trip', () => {
  let live: LiveApp | undefined

  function theLiveApp(): LiveApp {
    if (live === undefined) throw new Error('the page\'s own office was not started')
    return live
  }

  beforeAll(async () => {
    live = await liveApp({ name: 'a-visiting-page', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  }, 300_000)

  afterAll(async () => {
    await live?.stop()
  }, 60_000)

  it('3: sends neither half to the world it visits, on the transport, both streams, a file read or a portrait', async () => {
    const home = theLiveApp()
    const { VISIT_KEY } = await import('../src/web/lib/visiting.ts')
    const { pathFor } = await import('../src/web/components/router.tsx')
    if (words === undefined) throw new Error('the words were not loaded')
    const en = words.createI18n('en')
    expect(theOffice().theOfficeIsInThisDatabase(), 'this database holds the office, so it is no visited world').toBe(false)

    // THE PAGE'S OFFICE, AS THE OFFICE'S MIRROR NAMES ITS PAGES: the page's origin is on the list. The header says why.
    const theMirror = theOffice().mirrorBesideThisDatabase()
    writeAMirror(theMirror, [home.site])
    ;(await theOriginCheck()).useTheOfficesMirrorAt(theMirror)
    // A REPORT IN THE VISITED WORLD WITH A PICTURE, so the page reads a file there. The file is made up, and the
    // world's answer to the read does not matter here: only what the page sent. Its path is absolute, as a report's
    // image path must be.
    const report = await theApp().inject({
      method: 'POST',
      url: '/api/records',
      headers: asTheOwner(),
      payload: {
        kind: 'report',
        title: 'A test report with a made-up picture',
        data: {
          blocks: [
            { id: 'b1', type: 'text', text: 'A test report. Nothing in it is a real observation.' },
            { id: 'i1', type: 'image', path: '/srv/made-up-office/report-files/a-made-up-picture.png', alt: 'A made-up picture' },
          ],
        },
      },
    })
    expect(report.statusCode, report.body.slice(0, 300)).toBe(201)
    const theReport = (JSON.parse(report.body) as { record: { id: string } }).record.id

    // THE HEADERS THE VISITED WORLD ANSWERS THE PAGE'S ORIGIN WITH, which the made-up terminal list is answered with.
    const answered = await ask({ origin: home.site })
    expect(answered.status, answered.body.slice(0, 300)).toBe(200)
    const itsHeaders: Record<string, string> = { 'content-type': 'application/json' }
    for (const [name, value] of Object.entries(answered.headers)) {
      if (typeof value === 'string' && (name.startsWith('access-control-') || name === 'vary' || name === WORLD_HEADER.toLowerCase())) {
        itsHeaders[name] = value
      }
    }

    // THE BROWSER IS PAIRED, so it holds the cookie half for this host, and its pages keep the header half.
    await pairTheContext(home.context, home.api)
    expect(
      (await home.context.cookies(thisWorld())).some((cookie) => cookie.name === DEVICE_HALF_COOKIE),
      'the browser holds no cookie half for the visited world\'s host, so nothing here could carry one',
    ).toBe(true)
    // THE TRIP, as Enter leaves it in the page's storage.
    const itself = world?.theWorldThisDatabaseIs()
    if (itself === undefined || itself === null) throw new Error('the visited world has no identity')
    const trip = {
      worldId: 'a-made-up-world',
      worldName: 'A made-up visited world',
      databaseIdentity: itself,
      address: thisWorld(),
      head: null,
      visitId: 'a-made-up-visit',
    }
    await home.context.addInitScript(({ key, said }) => {
      window.localStorage.setItem(key, said)
    }, { key: VISIT_KEY, said: JSON.stringify(trip) })

    const received: ARequestReceived[] = []
    const read = (req: IncomingMessage): void => {
      const cookie = oneHeader(req, 'cookie')
      received.push({
        method: req.method ?? '',
        pathname: new URL(req.url ?? '/', thisWorld()).pathname,
        dest: oneHeader(req, 'sec-fetch-dest'),
        cookieNames: cookie === undefined ? [] : cookie.split(';').map((one) => one.split('=')[0]!.trim()).filter((one) => one !== ''),
        theHeaderHalf: oneHeader(req, DEVICE_HALF_HEADER) !== undefined,
      })
    }
    const underTest = (): ARequestReceived[] =>
      received.filter((one) => one.pathname.startsWith('/api/') && !A_FRAME_OR_A_PAGE.has(one.dest ?? ''))
    const kindsReceived = (): WhatThePageSent[] =>
      [...new Set(underTest().filter((one) => one.method !== 'OPTIONS').map((one) => whatItIs(one.pathname)))]
    const until = async (kind: WhatThePageSent): Promise<void> => {
      await expect.poll(() => kindsReceived().includes(kind), {
        timeout: 30_000,
        message: `the visited world received no ${kind} from the page`,
      }).toBe(true)
    }

    theApp().server.on('request', read)
    const page = await home.context.newPage()
    try {
      await page.route(
        (url) => url.origin === thisWorld() && url.pathname === '/api/terminals',
        async (route: Route) => {
          if (route.request().method() !== 'GET') return route.fallback()
          return route.fulfill({ status: 200, headers: itsHeaders, body: JSON.stringify(A_MADE_UP_TERMINAL_LIST) })
        },
      )
      await page.goto(`${home.site}/?lang=en#/r/${theReport}`, { timeout: 60_000 })
      await until('the transport')
      await until('the event stream')
      await until('a file read')
      await page.goto(`${home.site}/?lang=en#/roles`, { timeout: 60_000 })
      // A PORTRAIT BELOW THE FOLD WAITS TO BE LOADED, so each is loaded now, as the portrait's own test does.
      await page.waitForSelector('.rol-portrait', { timeout: 30_000 })
      await page.evaluate(() => {
        for (const img of document.querySelectorAll('.rol-portrait')) (img as HTMLImageElement).loading = 'eager'
      })
      await until('a portrait')
      await page.goto(`${home.site}/?lang=en#${pathFor('terminals')}`, { timeout: 60_000 })
      await page.getByRole('button', { name: en.t('terminals.open'), exact: true }).click({ timeout: 30_000 })
      await until('a terminal\'s stream')
    } finally {
      theApp().server.off('request', read)
      await page.close()
    }

    expect(kindsReceived().sort()).toEqual([...EVERYTHING_CASE_3_READS].sort())
    const carried = underTest()
      .filter((one) => one.cookieNames.length > 0 || one.theHeaderHalf)
      .map((one) => `${one.method} ${one.pathname} (${whatItIs(one.pathname)}): cookies ${one.cookieNames.join(', ') || 'none'}, header half ${one.theHeaderHalf ? 'sent' : 'not sent'}`)
    expect(carried, 'a script call or a crossorigin load to the visited world carried a cookie or the header half').toEqual([])
  }, 240_000)
})

describe('the office names the origins of its own pages to its worlds', () => {
  it('4: the office\'s mirror holds the origins of its pages as the Host check\'s names make them, the Origin check takes each, and before the office knows its listeners the mirror names none', async () => {
    const hostCheck = await theHostCheck()
    // THIS DATABASE IS THE OFFICE WHILE IT HOLDS A WORLD OF KIND HOME FOR ITSELF, as in case 2.
    const itself = world?.theWorldThisDatabaseIs()
    if (itself === undefined || itself === null) throw new Error('this database has no identity, so it cannot be the office')
    registerAWorld('home', { databaseIdentity: itself, address: thisWorld() })
    expect(theOffice().theOfficeIsInThisDatabase(), 'the home row did not make this database the office').toBe(true)
    const theMirror = theOffice().mirrorBesideThisDatabase()

    // BEFORE THE OFFICE KNOWS ITS LISTENERS its mirror names no page, so no world takes a page from it.
    theOffice().writeTheMirror()
    expect(theOffice().readTheMirror(theMirror)?.pageOrigins, 'a mirror written before the listeners were known').toBeNull()

    // THE LISTENERS AS start() TELLS THEM AFTER IT BINDS THEM. The header says why the door's number is this machine's.
    if (resources === undefined || theProbe === undefined) throw new Error('the probe was not set up')
    const probe = Object.create(theProbe) as OsProbe
    probe.ownAddresses = () => [THE_NUMBER]
    resources.useOsProbe(probe)
    try {
      hostCheck.theOfficeListensOn([
        { listener: 'the loopback listener', address: '127.0.0.1', port: thePort() },
        { listener: 'the door for other machines', address: THE_NUMBER, port: thePort() },
      ])
      theOffice().writeTheMirror()
      const origins = hostCheck.theOriginsOfThisOfficesPages()
      if (origins === null) throw new Error('the office was told its listeners and still names no page')
      expect(
        theOffice().readTheMirror(theMirror)?.pageOrigins,
        'the mirror\'s list is not the one the Host check\'s names make',
      ).toEqual(origins)
      expect(origins, 'the loopback listener\'s own origin is not on the list').toContain(thisWorld())
      expect(origins, 'the door\'s number, which the probe lists as this machine\'s, is not on the list').toContain(
        `http://${THE_NUMBER}:${String(thePort())}`,
      )
      // ONE LIST FOR BOTH CHECKS: the Origin check takes every origin on it as a page of this office.
      for (const origin of origins) {
        const answer = await ask({ origin })
        expect(answer.status, `${origin}: ${answer.body.slice(0, 300)}`).toBe(200)
        expect(answer.json?.['code'], origin).toBeUndefined()
        expect(answer.headers['access-control-allow-origin'], origin).toBe(origin)
      }
    } finally {
      resources.useOsProbe(theProbe)
    }
  })
})
