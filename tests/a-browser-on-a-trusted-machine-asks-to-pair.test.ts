// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER ON ANOTHER MACHINE KNOCKS TO BE PAIRED, AND THE OWNER'S CONFIRMATION ON THIS COMPUTER MAKES IT THE PERSON.
 *
 * Criterion D2, the secretary's amendment of 13 September 2026 at 18:50, and a later ruling:
 * an untrusted browser may knock, and the person approves it only on the computer that runs the office.
 * A browser here was paired at 18:35 with one press, and then steps were needed for another
 * computer — and there were none, because the device flow serves a program that sends a header and a browser on
 * another machine had no way to a key. This file has two ways in: from another machine, trusted or not, the pairing
 * page asks for a person's-device credential under a name the browser gives itself; the owner confirms it from a
 * browser already paired on this computer; and the asking browser receives its key as the same HttpOnly,
 * SameSite-strict cookie the loopback press sets.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, IN THE ORDER THE BRIEF NAMES
 * ---------------------------------------------------------------------------------------
 *
 *   1. From the second listener (another machine), the press creates a person's-device credential
 *      and sets a cookie holding that credential's own token — which proves nothing yet. It never
 *      answers the token. Both halves are asserted: a credential row exists, and a request carrying
 *      only that cookie is still refused a person's act.
 *   2. A confirm from a paired loopback browser makes the asking browser's next request THE PERSON,
 *      by the cookie alone. The ACT is driven, not the cookie's presence.
 *   3. A confirm asked from the second listener is refused, and the refusal names where it may be done.
 *   4. Ending the credential from the Embassy makes that cookie prove nothing.
 *   5. The loopback press still pairs at once, with no confirmation.
 *   6. A machine the office does not trust may knock: its ask is filed as a pending credential and shows at the
 *      Embassy on this computer, where the person confirms it, and a flood from one address is bounded.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * Every fact here is about a request a LISTENER carried: `mayAsk` reads the listener's stamp and the
 * caller's address, and both the ask door and the confirm's reach read the same stamp. An injected
 * request is on no socket, so none of it reaches this rule. So this file opens the first listener with
 * `app.listen` and the product's own second listener with `listenForOtherMachines`, exactly as
 * tests/local-only-routes.test.ts does, and drives both with `fetch`. The trusted half sends the
 * forwarded address the second door really reads; a request that faked the arrival would measure
 * nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE TOKEN IS NEVER PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The ask door answers a token and this file carries it into the Cookie or x-mole-office-key header
 * without ever quoting its value. That is the same rule tests/pairing-is-one-press-on-this-machine
 * follows, and it is why `cookieOnly` returns the name-and-value pair and no assertion prints it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ASKS_TO_PAIR_ALLOWED } from '../src/shared/pairing.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The person's headers and no key: exactly the claim the one-version window is about. */
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
/** A machine the office does not trust, so the second listener really is a stranger. */
const NOT_TRUSTED = '203.0.113.7'
/** The name a browser gives itself. A made-up one; it is a label and never a secret. */
const A_BROWSER_NAME = 'Chrome on macOS 4f2a'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let anotherMachine: string
let otherMachines: Server

beforeAll(async () => {
  t = await freshDb()
  // A MACHINE THE PERSON TRUSTED. P73: the list is written by a press, and the test writes the same
  // row a press would.
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

/** The trusted machine's headers: the forwarded address the second listener's door really reads. */
function atATrustedMachine(): Record<string, string> {
  return { ...THE_PERSON, 'x-forwarded-for': TRUSTED }
}

/** A stranger's headers: the second listener, an address the office does not trust. */
function atAStranger(): Record<string, string> {
  return { ...THE_PERSON, 'x-forwarded-for': NOT_TRUSTED }
}

interface PairingRead {
  status: number
  paired: boolean
  offered: boolean
  mayAsk: boolean
  waiting: { device: string; askedAt: string; standing: string } | null
  error: string
}

async function readPairing(door: string, headers: Record<string, string>): Promise<PairingRead> {
  const res = await fetch(`${door}/api/office/pairing`, { headers })
  const body = (await res.json()) as Record<string, unknown>
  return {
    status: res.status,
    paired: body['paired'] === true,
    offered: body['offered'] === true,
    mayAsk: body['mayAsk'] === true,
    waiting: (body['waiting'] ?? null) as PairingRead['waiting'],
    error: String(body['error'] ?? ''),
  }
}

interface Ask {
  status: number
  credentialId: string
  device: string
  waitingForConfirmation: boolean
  token: unknown
  setCookie: string | null
  error: string
}

/** The one press on a trusted machine: ask for a person's-device credential under a name. */
async function askToPair(door: string, headers: Record<string, string>): Promise<Ask> {
  const res = await fetch(`${door}/api/office/pairing/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ device: A_BROWSER_NAME }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return {
    status: res.status,
    credentialId: String(body['credentialId'] ?? ''),
    device: String(body['device'] ?? ''),
    waitingForConfirmation: body['waitingForConfirmation'] === true,
    token: body['token'],
    setCookie: res.headers.get('set-cookie'),
    error: String(body['error'] ?? ''),
  }
}

/** The loopback press: the person's key as a cookie, in one press, with no confirmation. */
async function pairOnThisMachine(): Promise<{ status: number; setCookie: string | null; error: string }> {
  const res = await fetch(`${thisMachine}/api/office/pairing`, { method: 'POST', headers: THE_PERSON })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, setCookie: res.headers.get('set-cookie'), error: String(body['error'] ?? '') }
}

/**
 * THE COOKIE TO SEND BACK: the name and value only, never the whole header and never printed.
 *
 * A browser sends exactly this pair on the next request. Keeping the attributes out of it is not
 * tidiness — sending `HttpOnly` back as if it were part of the value is how a test fails to notice
 * that the attribute is missing from the reply.
 */
function cookieOnly(setCookie: string | null): string {
  if (setCookie === null) throw new Error('the ask reply set no cookie')
  const pair = setCookie.split(';')[0]
  if (pair === undefined || !pair.startsWith('mole-office-key=')) {
    throw new Error('the ask reply set no mole-office-key cookie')
  }
  return pair
}

/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
async function changeTheScene(door: string, headers: Record<string, string>): Promise<number> {
  const res = await fetch(`${door}/api/office/scene-settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ motion: true }),
  })
  return res.status
}

/** Confirm or end a credential, both kept on this machine and both the person's. */
async function pressOnThisMachine(path: string): Promise<number> {
  const res = await fetch(`${thisMachine}${path}`, { method: 'POST', headers: THE_PERSON, body: '{}' })
  return res.status
}

describe('the offer reads the listener and the trusted list, and nothing a caller can set', () => {
  it('offers the loopback press on this computer and no ask press there', async () => {
    const read = await readPairing(thisMachine, THE_PERSON)
    expect(read.status).toBe(200)
    expect(read.offered, 'this computer was not offered the loopback press').toBe(true)
    expect(read.mayAsk, 'this computer was offered the ask press as well as the loopback one').toBe(false)
  })

  it('offers the ask press on another machine, trusted or not, and never on this computer', async () => {
    const trusted = await readPairing(anotherMachine, atATrustedMachine())
    expect(trusted.status).toBe(200)
    expect(trusted.offered, 'a machine other than this one was offered the loopback press').toBe(false)
    expect(trusted.mayAsk, 'a machine the office trusts was not offered the ask press').toBe(true)

    const stranger = await readPairing(anotherMachine, atAStranger())
    expect(stranger.status).toBe(200)
    expect(stranger.mayAsk, 'a machine the office does not trust was not allowed to knock').toBe(true)

    const here = await readPairing(thisMachine, THE_PERSON)
    expect(here.mayAsk, 'this computer was offered the ask press as well as the loopback press').toBe(false)
  })
})

describe('the ask press from another machine', () => {
  it('issues a credential, sets only its token, and proves nothing yet', async () => {
    const asked = await askToPair(anotherMachine, atATrustedMachine())
    expect(asked.status, asked.error).toBe(201)
    expect(asked.credentialId, 'the ask door named no credential').not.toBe('')
    expect(asked.device).toBe(A_BROWSER_NAME)
    expect(asked.waitingForConfirmation, 'the ask door did not say the owner\'s confirmation is needed').toBe(true)
    // IT NEVER ANSWERS THE TOKEN, in a field or anywhere else.
    expect(asked.token, 'the ask door answered a token').toBeUndefined()
    expect(JSON.stringify(asked)).not.toContain('"token"')

    // THE COOKIE IS THE SAME ONE THE LOOPBACK PRESS SETS.
    const header = asked.setCookie ?? ''
    expect(header, 'the ask reply set no cookie').toContain('mole-office-key=')
    expect(header, 'the cookie is not HttpOnly').toContain('HttpOnly')
    expect(header, 'the cookie is not SameSite strict').toMatch(/SameSite=Strict/i)
    expect(header, 'the cookie is not scoped to the whole site').toContain('Path=/')

    // A CREDENTIAL ROW EXISTS, and it is pending.
    const list = (await (await fetch(`${thisMachine}/api/office/visitors`, { headers: THE_PERSON })).json()) as {
      credentials: { id: string; standing: string; handle: string }[]
    }
    const row = list.credentials.find((one) => one.id === asked.credentialId)
    expect(row, 'the ask door issued no credential row').toBeDefined()
    expect(row?.standing).toBe('pending')
    expect(row?.handle).toBe(A_BROWSER_NAME)

    // AND THE COOKIE PROVES NOTHING YET. A person-only act carrying only that cookie is refused, and
    // the refusal is not the window's: this request carried no forwarded address, so the window does
    // not cover it and the cookie is the only thing that could have proved anything.
    const refused = await changeTheScene(anotherMachine, { ...THE_PERSON, cookie: cookieOnly(asked.setCookie) })
    expect(refused, 'an unconfirmed credential’s cookie was the person').toBe(403)
  })

  it('tells the asking browser it is waiting, read from the cookie', async () => {
    const asked = await askToPair(anotherMachine, atATrustedMachine())
    const read = await readPairing(anotherMachine, {
      ...atATrustedMachine(),
      cookie: cookieOnly(asked.setCookie),
    })
    expect(read.paired, 'an unconfirmed credential read as paired').toBe(false)
    expect(read.waiting, 'the read lost the credential the cookie belongs to').not.toBeNull()
    expect(read.waiting?.device).toBe(A_BROWSER_NAME)
    expect(read.waiting?.standing).toBe('pending')
  })

  it('files a stranger’s ask and shows it at the Embassy, and never answers the token', async () => {
    const asked = await askToPair(anotherMachine, atAStranger())
    expect(asked.status, `a stranger's knock was refused: ${asked.error}`).toBe(201)
    expect(asked.credentialId, 'the ask door named no credential').not.toBe('')
    expect(asked.token, 'the ask door answered a token').toBeUndefined()
    expect(asked.setCookie, 'the ask reply set no cookie').not.toBeNull()
    // THE MAIN COMPUTER IS TOLD: the request is a pending row at the Embassy, where the person confirms it.
    const list = (await (await fetch(`${thisMachine}/api/office/visitors`, { headers: THE_PERSON })).json()) as {
      credentials: { id: string; standing: string; handle: string }[]
    }
    const row = list.credentials.find((one) => one.id === asked.credentialId)
    expect(row, 'the knock did not reach the Embassy on this computer').toBeDefined()
    expect(row?.standing).toBe('pending')
  })

  it('bounds a flood of knocks from one address, and a refused knock sets no cookie', async () => {
    const flooder = '203.0.113.11'
    const knock = () => askToPair(anotherMachine, { ...THE_PERSON, 'x-forwarded-for': flooder })
    for (let n = 0; n < ASKS_TO_PAIR_ALLOWED.most; n++) {
      const asked = await knock()
      expect(asked.status, `knock ${String(n + 1)} was refused: ${asked.error}`).toBe(201)
    }
    const refused = await knock()
    expect(refused.status, 'a flood of knocks was not bounded').toBe(429)
    expect(refused.setCookie, 'a refused knock set a cookie anyway').toBeNull()
    expect(refused.error, 'the refusal does not say to try again').toMatch(/try again/i)
  })

  it('makes a stranger’s confirmed browser the person, and refuses its confirm anywhere but this computer', async () => {
    const asked = await askToPair(anotherMachine, atAStranger())
    const cookie = cookieOnly(asked.setCookie)
    const elsewhere = await fetch(`${anotherMachine}/api/office/visitors/${asked.credentialId}/confirm`, {
      method: 'POST',
      headers: atAStranger(),
      body: '{}',
    })
    expect(elsewhere.status, 'a stranger’s credential was confirmed from another machine').toBe(403)
    expect(await pressOnThisMachine(`/api/office/visitors/${asked.credentialId}/confirm`), 'the confirm on this computer failed').toBe(200)
    expect(await changeTheScene(anotherMachine, { ...AN_AGENT, cookie }), 'the confirmed stranger was not the person').toBe(200)
  })
})

describe('the owner\u2019s confirmation makes the asking browser the person', () => {
  it('does the person’s act by the cookie alone after a loopback confirm', async () => {
    const asked = await askToPair(anotherMachine, atATrustedMachine())
    const cookie = cookieOnly(asked.setCookie)
    expect(await pressOnThisMachine(`/api/office/visitors/${asked.credentialId}/confirm`), 'the confirm failed').toBe(
      200,
    )

    // THE ACT IS DRIVEN, NOT THE COOKIE'S PRESENCE. The actor header says `agent` and names somebody
    // who is not the person, so only the key the cookie carries can make this theirs.
    const allowed = await changeTheScene(anotherMachine, { ...AN_AGENT, cookie })
    expect(allowed, 'the confirmed device key was refused the person’s act').toBe(200)

    // AND THE READ NOW SAYS PAIRED, with nothing waiting.
    const read = await readPairing(anotherMachine, { ...atATrustedMachine(), cookie })
    expect(read.paired).toBe(true)
    expect(read.waiting).toBeNull()
  })

  it('refuses a confirm asked from the second listener, and names where it may be done', async () => {
    const asked = await askToPair(anotherMachine, atATrustedMachine())
    const res = await fetch(`${anotherMachine}/api/office/visitors/${asked.credentialId}/confirm`, {
      method: 'POST',
      headers: atATrustedMachine(),
      body: '{}',
    })
    const body = (await res.json()) as { error?: string }
    expect(res.status, 'a confirm from another machine was allowed').toBe(403)
    expect(body.error, 'the refusal does not say where it may be done').toContain(
      'at the computer Mole Office is running on',
    )
    expect(body.error, 'the refusal does not say the request came from elsewhere').toContain('another computer')
  })

  it('ends the key with the credential, so the cookie proves nothing', async () => {
    const asked = await askToPair(anotherMachine, atATrustedMachine())
    const cookie = cookieOnly(asked.setCookie)
    expect(await pressOnThisMachine(`/api/office/visitors/${asked.credentialId}/confirm`)).toBe(200)
    // CONTROL: while the credential stands, the cookie is the person.
    expect(await changeTheScene(anotherMachine, { ...AN_AGENT, cookie })).toBe(200)

    expect(await pressOnThisMachine(`/api/office/visitors/${asked.credentialId}/end`)).toBe(200)
    expect(await changeTheScene(anotherMachine, { ...AN_AGENT, cookie }), 'an ended credential’s cookie proved the person').toBe(
      403,
    )

    // AND THE READ SAYS THE PAIRING WAS ENDED, so the page can offer the press again.
    const read = await readPairing(anotherMachine, { ...atATrustedMachine(), cookie })
    expect(read.paired).toBe(false)
    expect(read.waiting?.standing).toBe('ended')
  })
})

describe('the loopback press is unchanged', () => {
  it('pairs this browser in one press, with no confirmation anywhere', async () => {
    const pressed = await pairOnThisMachine()
    expect(pressed.status, `the loopback press was refused: ${pressed.error}`).toBe(200)
    const cookie = cookieOnly(pressed.setCookie)
    // No confirm was ever asked for. The key was set by the press itself.
    expect(await changeTheScene(thisMachine, { ...AN_AGENT, cookie })).toBe(200)
  })
})
