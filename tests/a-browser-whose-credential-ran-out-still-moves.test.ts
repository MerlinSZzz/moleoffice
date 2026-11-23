// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER WHOSE DEVICE CREDENTIAL RAN OUT STILL MOVES, ON EITHER ADDRESS (wave 13s, line 13s, after upgrade 39).
 *
 * A person's-device credential lasts a fixed number of days, and nothing renews it. Before SEC-2 that end did nothing
 * to the browser that held it: the old cookie proved the person through the device's live key alone, which never reads
 * the credential's end. So a browser paired more than that many days before an update was still the person the day
 * before it. The move door must move such a browser, or the update makes the person pair it again.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   M1. ON THIS MACHINE'S OWN ADDRESS. A confirmed device credential whose end passed, and whose key the office still
 *       holds, is in the old cookie. Before the move its token in the key header is the person. The pairing read says
 *       mayMove. The move answers 200, moves a device credential, gives two halves and ends the old cookie. Both halves
 *       are the person. At the Embassy the old credential is ended, one new credential under the same name is trusted,
 *       and the new one has not run out. The old token is no longer the person.
 *   M2. THE SAME, ON THE ADDRESS FOR OTHER MACHINES, with that door's Host and Origin on every request.
 *   M3. WHAT STILL DOES NOT MOVE, on the address for other machines. A credential whose end passed and that was also
 *       ended, one still waiting, and one whose key was revoked: for each the read does not say mayMove, and the move
 *       is refused with nothing to move, gives no half and writes no credential and no key.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ANSWERED AT MAIN, BY READING THE CODE (NOT RUN)
 * ---------------------------------------------------------------------------------------
 *
 * Before the fix, src/server/lib/the-old-cookie.ts refused a credential whose end had passed, by the same clause the
 * visitor gate refuses a visitor's header with. So M1 and M2 were red at their first move assertion: the pairing read
 * answered mayMove false, and a move answered 409 with nothing to move. M3 was green before the fix and must stay so.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE OTHER MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * The office runs in this process on 127.0.0.1. The door for other machines is bound to 127.0.0.2, as
 * tests/one-list-of-this-offices-origins.test.ts binds it. The probe's list of this machine's own addresses names a
 * made-up number, and its read of this machine's tailnet name answers none, so this machine's own tailscale is never
 * asked. Each request goes over a real socket, with the Host and the Origin a page on that address sends.
 *
 * Each old token is made as tests/the-old-cookie-moves-once.test.ts makes one: a device credential issued through the
 * visitors module, given a one-piece token, confirmed at the Embassy's own door, and then given an end in the past.
 * The key window is then closed, so a request that carries no key is nobody.
 *
 * No key, half or token is printed: each assertion says only whether a thing was held or answered.
 */

import { createHash, randomBytes } from 'node:crypto'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { WhatTheMoveMoved } from '../src/shared/pairing.ts'
import type { RefusalCode } from '../src/shared/refusal-codes.ts'
import type { VisitorStanding } from '../src/shared/visitors.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The door for other machines is bound to a second loopback address, as the other tests of that door bind it. */
const THE_DOORS_ADDRESS = '127.0.0.2'
/** This machine's own number, as the probe names it here: an address from the range kept for documentation. */
const THE_NUMBER = '198.51.100.8'
/** The machine each old credential was issued for. Made up, from the same range. */
const THE_BROWSERS_MACHINE = '198.51.100.9'
/** How long ago each old credential's end passed. Made up: about as long ago as the person's oldest had. */
const ITS_END_PASSED_DAYS_AGO = 29
const A_DAY_MS = 24 * 60 * 60 * 1000

/** What the move answers when it moves a device credential, and the refusal when it finds nothing to move. */
const A_DEVICE_CREDENTIAL: WhatTheMoveMoved = 'a-device-credential'
const NOTHING_TO_MOVE: RefusalCode = 'nothingToMove'
/** The standings a credential is read in at the Embassy. */
const TRUSTED: VisitorStanding = 'trusted'
const ENDED: VisitorStanding = 'ended'

/** The person's headers and no key, as a page of this office sends them. */
const THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

type Where = 'this machine' | 'the address for other machines'

let t: TestDb | undefined
let app: FastifyInstance | undefined
let door: Server | undefined
let resources: typeof import('../src/server/lib/resources.ts') | undefined
let visitors: typeof import('../src/server/lib/visitors.ts') | undefined
let names: typeof import('../src/config/key-header.mjs') | undefined
let appsPort = 0
let doorsPort = 0

/** One old credential, as a browser paired before SEC-2 holds it in the old cookie. */
interface AnOldCredential {
  id: string
  name: string
  token: string
}
const OLD = new Map<'M1' | 'M2' | 'ended' | 'waiting' | 'revoked', AnOldCredential>()

function theNames(): typeof import('../src/config/key-header.mjs') {
  if (names === undefined) throw new Error('the header and cookie names were not loaded')
  return names
}

function theOld(of: 'M1' | 'M2' | 'ended' | 'waiting' | 'revoked'): AnOldCredential {
  const one = OLD.get(of)
  if (one === undefined) throw new Error(`no old credential was made for ${of}`)
  return one
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

interface Answer {
  status: number
  setCookies: string[]
  body: Record<string, unknown>
  text: string
}

/** One request over a real socket to one address, with the Host and the Origin a page on that address sends. */
function ask(where: Where, input: { method?: 'GET' | 'POST' | 'PATCH'; path: string; headers?: Record<string, string>; body?: unknown }): Promise<Answer> {
  const address = where === 'this machine' ? '127.0.0.1' : THE_DOORS_ADDRESS
  const port = where === 'this machine' ? appsPort : doorsPort
  const host = `${address}:${String(port)}`
  const payload = input.body === undefined ? undefined : JSON.stringify(input.body)
  return new Promise((done, fail) => {
    const req = request(
      {
        host: address,
        port,
        path: input.path,
        method: input.method ?? 'GET',
        headers: {
          ...THE_PERSON,
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
          ...input.headers,
          origin: `http://${host}`,
          host,
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
        })
        res.once('end', () => {
          let body: Record<string, unknown> = {}
          try {
            const value: unknown = JSON.parse(text)
            if (value !== null && typeof value === 'object') body = value as Record<string, unknown>
          } catch {
            body = {}
          }
          const cookies = res.headers['set-cookie']
          done({ status: res.statusCode ?? 0, setCookies: cookies ?? [], body, text })
        })
      },
    )
    req.once('error', fail)
    req.end(payload)
  })
}

function theOldCookie(token: string): Record<string, string> {
  return { cookie: `${theNames().KEY_COOKIE}=${token}` }
}

/** The cookie half's name and value from the Set-Cookie headers, as a browser sends it back, or null. */
function theCookieHalfIn(setCookies: readonly string[]): string | null {
  const half = theNames().DEVICE_HALF_COOKIE
  for (const one of setCookies) {
    const pair = one.split(';')[0] ?? ''
    if (pair.startsWith(`${half}=`) && pair.length > half.length + 1) return pair
  }
  return null
}

/** The Set-Cookie headers that end the old cookie: its name, no value, and Max-Age=0. */
function theEndsOfTheOldCookie(setCookies: readonly string[]): number {
  const old = theNames().KEY_COOKIE
  return setCookies.filter((one) => one.startsWith(`${old}=;`) && /;\s*Max-Age=0(;|$)/i.test(one)).length
}

async function thePairingRead(where: Where, token: string): Promise<{ status: number; mayMove: unknown }> {
  const read = await ask(where, { path: '/api/office/pairing', headers: theOldCookie(token) })
  return { status: read.status, mayMove: read.body['mayMove'] }
}

async function move(where: Where, token: string): Promise<Answer> {
  return ask(where, { method: 'POST', path: '/api/office/pairing/move', headers: theOldCookie(token), body: { device: 'A name the page gives' } })
}

/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
async function aPersonsAct(where: Where, headers: Record<string, string>): Promise<number> {
  return (await ask(where, { method: 'PATCH', path: '/api/office/scene-settings', headers, body: { motion: true } })).status
}

interface ACredentialRow {
  id: string
  handle: string
  standing: string
  endsAt: string
}

/** The credentials the Embassy lists, read on this machine with the person's key. */
async function theEmbassysList(): Promise<ACredentialRow[]> {
  const read = await ask('this machine', { path: '/api/office/visitors', headers: thePersonsKeyHeader() })
  expect(read.status, 'the Embassy list was not read').toBe(200)
  return (read.body['credentials'] ?? []) as ACredentialRow[]
}

function hasRunOut(row: { endsAt: string }): boolean {
  if (visitors === undefined) throw new Error('the visitors module was not loaded')
  return visitors.hasRunOut(row)
}

function count(table: 'visitor_credentials' | 'held_keys'): number {
  return (t?.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

/**
 * A device credential with a one-piece token, as an office from before SEC-2 holds it, confirmed at the Embassy's own
 * door unless the case wants one still waiting, and then given an end in the past.
 */
async function anOldCredential(name: string, confirm: boolean): Promise<AnOldCredential> {
  if (t === undefined || visitors === undefined) throw new Error('the test office was not made')
  const time = await import('../src/shared/time.ts')
  const { credential } = visitors.issueAPersonsDeviceCredential({
    name,
    machine: THE_BROWSERS_MACHINE,
    machineHow: 'made up by a test',
    runtime: null,
  })
  const token = randomBytes(32).toString('base64url')
  t.client.sqlite.prepare('UPDATE visitor_credentials SET token_hash = ? WHERE id = ?').run(sha256(token), credential.id)
  if (confirm) {
    const confirmed = await ask('this machine', {
      method: 'POST',
      path: `/api/office/visitors/${credential.id}/confirm`,
      headers: thePersonsKeyHeader(),
      body: {},
    })
    expect(confirmed.status, `the old credential "${name}" was not confirmed: ${confirmed.text.slice(0, 300)}`).toBe(200)
  }
  const ended = time.localStamp(new Date(Date.now() - ITS_END_PASSED_DAYS_AGO * A_DAY_MS))
  t.client.sqlite.prepare('UPDATE visitor_credentials SET ends_at = ? WHERE id = ?').run(ended, credential.id)
  return { id: credential.id, name, token }
}

beforeAll(async () => {
  t = await freshDb()
  names = await import('../src/config/key-header.mjs')
  visitors = await import('../src/server/lib/visitors.ts')
  // THIS MACHINE'S OWN ADDRESSES AND ITS TAILNET NAME, made up, so the office never asks this machine's own tailscale.
  resources = await import('../src/server/lib/resources.ts')
  const probe = Object.create(resources.LINUX_PROBE) as OsProbe
  probe.ownAddresses = () => [THE_NUMBER]
  probe.ownTailnetName = () => Promise.resolve(null)
  resources.useOsProbe(probe)
  const { settings } = await import('../src/config/settings.mjs')
  const { buildApp, serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
  app = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: false,
  })).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  appsPort = (app.server.address() as AddressInfo).port
  door = await serveTheAddressForOtherMachines(app, 0, THE_DOORS_ADDRESS)
  doorsPort = (door.address() as AddressInfo).port

  OLD.set('M1', await anOldCredential('Test laptop on this machine', true))
  OLD.set('M2', await anOldCredential('Test laptop on another machine', true))
  OLD.set('ended', await anOldCredential('Test laptop that was ended', true))
  OLD.set('waiting', await anOldCredential('Test laptop still waiting', false))
  OLD.set('revoked', await anOldCredential('Test laptop whose key was revoked', true))
  visitors.endACredential(theOld('ended').id, 'Ended by a test.')
  const keys = await import('../src/server/lib/keys.ts')
  expect(keys.revokeTheKeyWhoseHashIs(sha256(theOld('revoked').token), 'Revoked by a test.'), 'no key was revoked').not.toBeNull()

  // THE KEY WINDOW CLOSES, as an office has it once every agent holds a key. A request with no key is then nobody.
  const { closeTheKeyWindow } = await import('../src/server/lib/keywindow.ts')
  expect(closeTheKeyWindow({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }).open, 'the key window did not close').toBe(false)
}, 120_000)

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

/** M1 and M2: the whole move of one old credential whose end passed, through one address. */
async function theMoveOfACredentialThatRanOut(where: Where, old: AnOldCredential, label: string): Promise<void> {
  const before = (await theEmbassysList()).find((one) => one.id === old.id)
  expect(before?.standing, `${label}: the old credential is not trusted before the move`).toBe(TRUSTED)
  expect(before !== undefined && hasRunOut(before), `${label}: the old credential has not run out before the move`).toBe(true)
  const keyHeader = { [theNames().KEY_HEADER]: old.token }
  expect(await aPersonsAct(where, keyHeader), `${label}: the old token in the key header is not the person before the move`).toBe(200)

  const read = await thePairingRead(where, old.token)
  expect([read.status, read.mayMove], `${label}: the pairing read with the old cookie`).toEqual([200, true])

  const moved = await move(where, old.token)
  expect(moved.status, `${label}: the move was refused: ${moved.text.slice(0, 300)}`).toBe(200)
  expect(moved.body['moved'], `${label}: what moved`).toBe(A_DEVICE_CREDENTIAL)
  const cookieHalf = theCookieHalfIn(moved.setCookies)
  const headerHalf = moved.body['deviceHalf']
  expect(cookieHalf, `${label}: the move set no cookie half`).not.toBeNull()
  expect(typeof headerHalf === 'string' && headerHalf !== '', `${label}: the move answered no header half`).toBe(true)
  expect(theEndsOfTheOldCookie(moved.setCookies), `${label}: the move did not end the old cookie`).toBe(1)
  const halves = { cookie: cookieHalf ?? '', [theNames().DEVICE_HALF_HEADER]: String(headerHalf) }
  expect(await aPersonsAct(where, halves), `${label}: both halves are not the person`).toBe(200)

  const rows = (await theEmbassysList()).filter((one) => one.handle === old.name)
  expect(rows.find((one) => one.id === old.id)?.standing, `${label}: the old credential after the move`).toBe(ENDED)
  const now = rows.filter((one) => one.id !== old.id)
  expect(now.map((one) => one.standing), `${label}: the credentials under the old name, other than the old one`).toEqual([TRUSTED])
  expect(now.map(hasRunOut), `${label}: the new credential has run out`).toEqual([false])
  expect(await aPersonsAct(where, keyHeader), `${label}: the old token in the key header is still the person`).not.toBe(200)
}

describe('a browser whose device credential ran out, with the old cookie and the key window closed', () => {
  it('M1: on this machine\'s own address, moves to two halves and a new credential that has not run out', async () => {
    await theMoveOfACredentialThatRanOut('this machine', theOld('M1'), 'M1')
  }, 60_000)

  it('M2: on the address for other machines, with its Host and Origin, moves the same way', async () => {
    await theMoveOfACredentialThatRanOut('the address for other machines', theOld('M2'), 'M2')
  }, 60_000)

  it('M3: on the address for other machines, an ended, a waiting and a revoked one still do not move', async () => {
    for (const which of ['ended', 'waiting', 'revoked'] as const) {
      const old = theOld(which)
      const before = { credentials: count('visitor_credentials'), keys: count('held_keys') }
      const read = await thePairingRead('the address for other machines', old.token)
      expect([read.status, read.mayMove], `M3: the pairing read with the ${which} one's old cookie`).toEqual([200, false])
      const refused = await move('the address for other machines', old.token)
      expect([refused.status, refused.body['code']], `M3: the move of the ${which} one: ${refused.text.slice(0, 300)}`).toEqual([409, NOTHING_TO_MOVE])
      expect(theCookieHalfIn(refused.setCookies), `M3: the refused move of the ${which} one set a cookie half`).toBeNull()
      expect(refused.body['deviceHalf'], `M3: the refused move of the ${which} one answered a half`).toBeUndefined()
      const after = { credentials: count('visitor_credentials'), keys: count('held_keys') }
      expect(after, `M3: the refused move of the ${which} one wrote a credential or a key`).toEqual(before)
    }
  }, 60_000)
})
