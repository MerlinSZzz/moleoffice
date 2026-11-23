// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER PROVES IT IS THE PERSON WITH TWO HALVES OF ONE DEVICE KEY, AND NEITHER HALF ALONE PROVES ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The pairing press, and the ask door on another machine, give a browser a device key of its own, in two halves. The
 * cookie half is a cookie the browser keeps and page JavaScript cannot read. The header half is answered once, in the
 * press's answer, and the page keeps it and sends it in its own header. A request is the person only when it carries
 * both halves of one key the office gave and still holds. So a script that reads the page's storage holds one half,
 * and a request another site makes the browser send carries the other half and not the first.
 *
 * The person's whole key is no longer put in a browser. The old cookie, which held it, is not read as a key: it only
 * moves once (tests/the-old-cookie-moves-once.test.ts). The person's key in the key header is still the person, as an
 * agent's key there is still the agent.
 *
 * The press and the ask door take a request from a page of this office or from no page, and refuse one another site's
 * page sent.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * Whether pairing is offered, whether the key window covers a keyless claim, and whether a key the office never gave
 * is refused all read the listener that carried the request, and an injected request is on no socket. So this file
 * opens the first listener with `app.listen` and the product's own second listener with `listenForOtherMachines`, as
 * tests/a-browser-on-a-trusted-machine-asks-to-pair.test.ts does, and drives both with `fetch`.
 *
 * ---------------------------------------------------------------------------------------
 * NO HALF AND NO KEY IS PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The halves are carried into the Cookie header and the header half's header without being quoted. No assertion
 * prints one: a comparison of a half says only whether it held.
 */

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_COOKIE, KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The person's headers and no key: the claim the key window covers on this computer. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** An agent's claim, so only a key can make a request the person's. */
const AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

/** A machine on the trusted list, and the address the second listener reads for it. */
const TRUSTED = '198.51.100.9'

/** The refusal of a request that carries one half of a device key and not the other. */
const ONE_HALF = 'oneHalfOfADeviceKey'

/** A page on another site, as its Origin says. */
const A_FOREIGN_ORIGIN = 'https://evil.example'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let anotherMachine: string
let otherMachines: Server

/** A new name for each browser this file pairs, so each one's row at the Embassy is found by its name. */
let browsersNamed = 0
function aBrowsersName(): string {
  browsersNamed += 1
  return `Test browser ${String(browsersNamed)}`
}

beforeAll(async () => {
  t = await freshDb()
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)
  const built = await apiApp()
  app = built.app
  await app.ready()
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE PRODUCT'S OWN SECOND LISTENER, which stamps `another machine`.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
})

/** The two halves a browser holds, as it sends them: the Cookie pair and the header half. */
interface TheHalves {
  cookie: string
  header: string
}

interface APress {
  status: number
  body: Record<string, unknown>
  /** Every Set-Cookie header of the answer, whole. */
  setCookies: string[]
  cacheControl: string | null
  /** The halves, when the answer gave both. */
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

async function answered(res: Response): Promise<APress> {
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
    setCookies,
    cacheControl: res.headers.get('cache-control'),
    halves: cookie !== null && header !== null && header !== '' ? { cookie, header } : null,
  }
}

/** The loopback press, with the name the browser gives itself, and any other headers a browser would send. */
async function press(device: string | null, headers: Record<string, string> = {}): Promise<APress> {
  const res = await fetch(`${thisMachine}/api/office/pairing`, {
    method: 'POST',
    headers: { ...THE_PERSON, ...headers },
    body: device === null ? '{}' : JSON.stringify({ device }),
  })
  return answered(res)
}

/** The ask press, from a machine the office trusts. */
async function askToPair(device: string): Promise<APress> {
  const res = await fetch(`${anotherMachine}/api/office/pairing/ask`, {
    method: 'POST',
    headers: { ...THE_PERSON, 'x-forwarded-for': TRUSTED },
    body: JSON.stringify({ device }),
  })
  return answered(res)
}

/** A pressed browser's halves, or the test fails saying the press gave none. */
function halvesOf(pressed: APress): TheHalves {
  if (pressed.halves === null) throw new Error(`the press gave no two halves (status ${String(pressed.status)})`)
  return pressed.halves
}

/** Headers carrying both halves, one of them, or neither. */
function carrying(halves: TheHalves, which: 'both' | 'the cookie half' | 'the header half'): Record<string, string> {
  if (which === 'the cookie half') return { cookie: halves.cookie }
  if (which === 'the header half') return { [DEVICE_HALF_HEADER]: halves.header }
  return { cookie: halves.cookie, [DEVICE_HALF_HEADER]: halves.header }
}

interface AnAct {
  status: number
  code: string | undefined
  text: string
}

/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
async function changeTheScene(door: string, headers: Record<string, string>): Promise<AnAct> {
  const res = await fetch(`${door}/api/office/scene-settings`, { method: 'PATCH', headers, body: JSON.stringify({ motion: true }) })
  const text = await res.text()
  let code: string | undefined
  try {
    const parsed = JSON.parse(text) as { code?: unknown }
    code = typeof parsed.code === 'string' ? parsed.code : undefined
  } catch {
    code = undefined
  }
  return { status: res.status, code, text: text.slice(0, 300) }
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

/** Confirm or end a credential, on this computer. */
async function pressOnThisMachine(path: string): Promise<number> {
  const res = await fetch(`${thisMachine}${path}`, { method: 'POST', headers: THE_PERSON, body: '{}' })
  return res.status
}

/** The person's whole key, as the office keeps it beside its database. */
function thePersonsKey(): string {
  const key = thePersonsKeyHeader()[KEY_HEADER]
  if (key === undefined) throw new Error('the office keeps no person key')
  return key
}

describe('the press gives a browser two halves, and both together are the person', () => {
  it('1: answers the header half with no-store, and sets the cookie half HttpOnly, SameSite strict, on the whole site', async () => {
    const pressed = await press(aBrowsersName())
    expect(pressed.status, JSON.stringify(pressed.body['error'] ?? '')).toBe(200)
    expect(pressed.cacheControl, 'the answer holding a half may be kept by a cache').toContain('no-store')
    const halves = halvesOf(pressed)
    const header = pressed.setCookies.find((one) => one.startsWith(`${DEVICE_HALF_COOKIE}=`)) ?? ''
    expect(header, 'the cookie half is not HttpOnly').toContain('HttpOnly')
    expect(header, 'the cookie half is not SameSite strict').toMatch(/SameSite=Strict/i)
    expect(header, 'the cookie half is not on the whole site').toContain('Path=/')
    // ON PLAIN HTTP, as this office is served: a Secure cookie would never come back.
    expect(header, 'the cookie half is Secure on plain http').not.toMatch(/;\s*Secure/i)
    // NO HALF IS THE PERSON'S KEY, AND THE TWO DIFFER.
    const cookieValue = halves.cookie.slice(DEVICE_HALF_COOKIE.length + 1)
    expect(cookieValue === thePersonsKey(), 'the cookie half is the person’s key').toBe(false)
    expect(halves.header === thePersonsKey(), 'the header half is the person’s key').toBe(false)
    expect(cookieValue === halves.header, 'the two halves are the same').toBe(false)
    // AND THE OLD COOKIE IS NOT SET.
    expect(pressed.setCookies.some((one) => one.startsWith(`${KEY_COOKIE}=`) && !/Max-Age=0/i.test(one)), 'the press set the old cookie').toBe(false)
  })

  it('2: does the person’s act with both halves', async () => {
    const halves = halvesOf(await press(aBrowsersName()))
    // THE ACT IS DRIVEN. The actor header says `agent`, so only the key the halves make can make this the person's.
    const act = await changeTheScene(thisMachine, { ...AN_AGENT, ...carrying(halves, 'both') })
    expect(act.status, act.text).toBe(200)
  })

  it('3: refuses the cookie half alone, even where the key window lets a keyless claim in', async () => {
    const halves = halvesOf(await press(aBrowsersName()))
    // CONTROL: the window is open, and the person's keyless claim from this computer is let in.
    const keyless = await changeTheScene(thisMachine, THE_PERSON)
    expect(keyless.status, keyless.text).toBe(200)
    const act = await changeTheScene(thisMachine, { ...THE_PERSON, ...carrying(halves, 'the cookie half') })
    expect(act.status, act.text).toBe(401)
    expect(act.code).toBe(ONE_HALF)
  })

  it('4: refuses the header half alone, in the same words', async () => {
    const halves = halvesOf(await press(aBrowsersName()))
    const act = await changeTheScene(thisMachine, { ...THE_PERSON, ...carrying(halves, 'the header half') })
    expect(act.status, act.text).toBe(401)
    expect(act.code).toBe(ONE_HALF)
  })

  it('5: refuses the halves of two browsers put together, as a key this office never gave', async () => {
    const first = halvesOf(await press(aBrowsersName()))
    const second = halvesOf(await press(aBrowsersName()))
    // CONTROL: each browser's own two halves are the person.
    expect((await changeTheScene(thisMachine, { ...AN_AGENT, ...carrying(first, 'both') })).status).toBe(200)
    expect((await changeTheScene(thisMachine, { ...AN_AGENT, ...carrying(second, 'both') })).status).toBe(200)
    const mixed = await changeTheScene(thisMachine, { ...THE_PERSON, cookie: first.cookie, [DEVICE_HALF_HEADER]: second.header })
    expect(mixed.status, mixed.text).toBe(401)
    expect(mixed.code, 'two halves of two keys were read as one half alone').not.toBe(ONE_HALF)
  })

  it('7: is still the person with the person’s key in the key header', async () => {
    const act = await changeTheScene(thisMachine, { ...AN_AGENT, [KEY_HEADER]: thePersonsKey() })
    expect(act.status, act.text).toBe(200)
  })

  it('8: refuses a press that names no browser, naming the field, and sets no cookie', async () => {
    const named = await press(null)
    expect(named.status, JSON.stringify(named.body)).toBe(400)
    expect(String(named.body['error'] ?? ''), 'the refusal does not name the field').toContain('device')
    expect(named.setCookies, 'a refused press set a cookie').toEqual([])
    expect(named.body['deviceHalf'], 'a refused press answered a half').toBeUndefined()
    // AND A PRESS WITH NO BODY AT ALL, as the window's press is sent today.
    const res = await fetch(`${thisMachine}/api/office/pairing`, { method: 'POST', headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id } })
    const empty = await answered(res)
    expect(empty.status, JSON.stringify(empty.body)).toBe(400)
    expect(empty.setCookies, 'a press with no body set a cookie').toEqual([])
  })

  it('9: lists the pressed browser at the Embassy, confirmed, and ending it there ends both halves', async () => {
    const name = aBrowsersName()
    const halves = halvesOf(await press(name))
    const row = (await theEmbassysList()).find((one) => one.handle === name)
    expect(row, 'the press issued no credential the Embassy lists').toBeDefined()
    expect(row?.standing, 'the pressed browser is not confirmed').toBe('trusted')
    // CONTROL: while it stands, the two halves are the person.
    expect((await changeTheScene(thisMachine, { ...AN_AGENT, ...carrying(halves, 'both') })).status).toBe(200)
    expect(await pressOnThisMachine(`/api/office/visitors/${row?.id ?? ''}/end`), 'the end at the Embassy failed').toBe(200)
    const after = await changeTheScene(thisMachine, { ...AN_AGENT, ...carrying(halves, 'both') })
    expect(after.status, 'an ended browser’s halves proved the person').toBe(403)
  })
})

describe('the ask door gives a browser on another machine two halves, which prove nothing until confirmed', () => {
  it('10: answers the header half and waits; after a confirm both halves are the person; after the end, nothing', async () => {
    const name = aBrowsersName()
    const asked = await askToPair(name)
    expect(asked.status, JSON.stringify(asked.body['error'] ?? '')).toBe(201)
    expect(asked.body['waitingForConfirmation'], 'the ask door did not say it waits for a confirm').toBe(true)
    expect(asked.cacheControl, 'the answer holding a half may be kept by a cache').toContain('no-store')
    expect(asked.body['token'], 'the ask door answered a whole token').toBeUndefined()
    const halves = halvesOf(asked)
    const credentialId = String(asked.body['credentialId'] ?? '')
    expect((await theEmbassysList()).find((one) => one.id === credentialId)?.standing).toBe('pending')

    // BEFORE THE CONFIRM, both halves prove nothing.
    const early = await changeTheScene(anotherMachine, { ...AN_AGENT, ...carrying(halves, 'both') })
    expect(early.status, 'an unconfirmed browser’s halves were the person').toBe(403)

    expect(await pressOnThisMachine(`/api/office/visitors/${credentialId}/confirm`), 'the confirm failed').toBe(200)
    const confirmed = await changeTheScene(anotherMachine, { ...AN_AGENT, ...carrying(halves, 'both') })
    expect(confirmed.status, confirmed.text).toBe(200)
    // ONE HALF IS STILL NOTHING, after the confirm as before it.
    const cookieAlone = await changeTheScene(anotherMachine, { ...AN_AGENT, ...carrying(halves, 'the cookie half') })
    expect(cookieAlone.status, cookieAlone.text).toBe(401)
    expect(cookieAlone.code).toBe(ONE_HALF)

    expect(await pressOnThisMachine(`/api/office/visitors/${credentialId}/end`)).toBe(200)
    const ended = await changeTheScene(anotherMachine, { ...AN_AGENT, ...carrying(halves, 'both') })
    expect(ended.status, 'an ended browser’s halves proved the person').toBe(403)
  })
})

describe('the event stream reads the two halves as every other door does', () => {
  it('11: counts a stream opened with both halves as proved by a key, and refuses one opened with one half', async () => {
    const halves = halvesOf(await press(aBrowsersName()))
    const provedByAKey = async (): Promise<number> => {
      const res = await fetch(`${thisMachine}/api/events/state`, { headers: AN_AGENT })
      return ((await res.json()) as { pagesProvedByAKey: number }).pagesProvedByAKey
    }
    const before = await provedByAKey()
    const stop = new AbortController()
    try {
      const stream = await fetch(`${thisMachine}/api/events`, {
        headers: { ...AN_AGENT, 'x-mole-office-workspace': 'default', accept: 'text/event-stream', ...carrying(halves, 'both') },
        signal: stop.signal,
      })
      expect(stream.status).toBe(200)
      expect(await provedByAKey(), 'the stream opened with both halves was not counted as proved by a key').toBe(before + 1)
    } finally {
      stop.abort()
    }
    const oneHalf = await fetch(`${thisMachine}/api/events`, {
      headers: { ...AN_AGENT, 'x-mole-office-workspace': 'default', accept: 'text/event-stream', ...carrying(halves, 'the header half') },
    })
    const body = (await oneHalf.json()) as { code?: string }
    expect(oneHalf.status).toBe(401)
    expect(body.code).toBe(ONE_HALF)
  })
})

describe('the press takes a request from a page of this office, or from no page, and no other', () => {
  it('12: refuses a press another site’s page sent, sets nothing and issues nothing; takes none, same-origin and no header', async () => {
    const before = (await theEmbassysList()).length
    for (const [what, headers] of [
      ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }],
      ['Sec-Fetch-Site: same-site', { 'sec-fetch-site': 'same-site' }],
      ['a foreign Origin', { origin: A_FOREIGN_ORIGIN }],
    ] as const) {
      const refused = await press(aBrowsersName(), headers)
      expect(refused.status, `a press with ${what} was taken`).toBe(403)
      expect(refused.setCookies, `a press with ${what} set a cookie`).toEqual([])
      expect(refused.body['deviceHalf'], `a press with ${what} answered a half`).toBeUndefined()
    }
    expect((await theEmbassysList()).length, 'a refused press issued a credential').toBe(before)
    for (const [what, headers] of [
      ['Sec-Fetch-Site: none', { 'sec-fetch-site': 'none' }],
      ['Sec-Fetch-Site: same-origin', { 'sec-fetch-site': 'same-origin' }],
      ['no Sec-Fetch-Site', {}],
    ] as const) {
      const taken = await press(aBrowsersName(), headers)
      expect(taken.status, `a press with ${what} was refused: ${JSON.stringify(taken.body['error'] ?? '')}`).toBe(200)
      expect(taken.halves, `a press with ${what} gave no two halves`).not.toBeNull()
    }
  })
})

/**
 * LAST IN THE FILE, because it closes the key window for the rest of this office: every case above asks with the
 * window open, as an office is the day it is installed.
 */
describe('the old cookie is no key', () => {
  it('6: refuses the person’s key in the old cookie, on a write and on a read, once the window is closed, and still answers the pairing read', async () => {
    const { closeTheKeyWindow } = await import('../src/server/lib/keywindow.ts')
    closeTheKeyWindow({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    const act = await changeTheScene(thisMachine, { ...THE_PERSON, cookie: `${KEY_COOKIE}=${thePersonsKey()}` })
    // A WRITE WITH NO KEY IS REFUSED AFTER THE CLOSE BEFORE ANYTHING READS WHOM IT NAMED, so its answer carries no code.
    expect(act.status, 'the person’s key in the old cookie was the person on a write').toBe(403)
    // A READ IS LET PAST THAT REFUSAL, so the refusal of a request that names the person with no key answers it.
    const sceneRead = await fetch(`${thisMachine}/api/office/scene-settings`, { headers: { ...THE_PERSON, cookie: `${KEY_COOKIE}=${thePersonsKey()}` } })
    expect(sceneRead.status, 'the person’s key in the old cookie was the person on a read').toBe(403)
    expect(((await sceneRead.json()) as { code?: unknown }).code).toBe('identityNotProved')
    const read = await fetch(`${thisMachine}/api/office/pairing`, { headers: { ...THE_PERSON, cookie: `${KEY_COOKIE}=${thePersonsKey()}` } })
    expect(read.status, 'the pairing read was refused to a browser holding the old cookie').toBe(200)
    const said = (await read.json()) as { paired?: boolean }
    expect(said.paired, 'the old cookie read as paired').toBe(false)
  })
})
