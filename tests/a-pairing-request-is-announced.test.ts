// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIRING REQUEST IS ANNOUNCED WHEN IT IS ASKED, CONFIRMED OR ENDED, ONCE EACH TIME.
 *
 * Home draws a waiting pairing request at its top, from the list of what waits on the person (GET /api/waiting,
 * whose third source is every pending credential, in src/server/lib/waiting.ts). The shell reads that list again at
 * once only when the office announces a `list.changed` naming `needsYou` (src/web/components/OnePress.tsx). Until this
 * file, nothing in src/server/lib/visitors.ts announced one, so a browser that asked to pair reached an open Home only
 * at its minute's re-read, and a press elsewhere left the old card on Home for up to a minute.
 *
 * WHAT IS MEASURED. A page of the person is opened on the server's own event list, and each write below is made
 * through its real door, over a real socket, because the doors read which listener carried the request. Each case
 * counts the `list.changed` events naming `needsYou` that the page was sent while that one write ran:
 *   1. a device ask by an agent the person started (POST /api/office/visitors with `device`): exactly one;
 *   2. a visiting agent's own ask from another machine (the same door, the visitor's card): exactly one;
 *   3. a browser's ask on a machine the person trusts (POST /api/office/pairing/ask): exactly one;
 *   4. the person's confirm of a pending credential: exactly one, and the same confirm again: none;
 *   5. the person's end of a pending credential: exactly one, and the same end again: none;
 *   6. an agent of a world the person registered, which is trusted at once and waits on nobody: none.
 *
 * WHY 1 TO 5 FAIL BEFORE THE CHANGE: no write in these doors announced anything, so each count was nought. Case 6 is
 * the control, and is green before and after: a trusted write waits on nobody, so it has nothing to announce.
 *
 * Every browser, agent, machine and world here is made up by this file.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ChannelEvent, EventOnTheWire } from '../src/shared/events.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
/** The headers of an agent, under the handle its registration answered. */
const asAgent = (handle: string): Record<string, string> => ({
  ...PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** A machine on the person's trusted list, and the address the second listener reads for it. */
const TRUSTED = '198.51.100.9'
/** A world the person starts, by the identity of its database. Sixteen hex characters is what an identity is. */
const A_WORLD = 'abcdabcdabcdabcd'

let t: TestDb
let app: FastifyInstance
/** The first listener, which stamps `this machine`. */
let thisMachine: string
/** The product's own second listener, which stamps `another machine` and reads the forwarded address. */
let anotherMachine: string
/** A door that stamps `another machine` and passes the request on, as a world on another machine reaches this office. */
let aWorldsMachine: string
let otherMachines: Server
const extraDoors: Server[] = []
let heard: EventOnTheWire[] = []
/** The handle the started agent asks under. */
let asker: Record<string, string>

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

async function post(door: string, path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const res = await fetch(`${door}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** How many times a page of the person was told to read Needs you again while `write` ran. */
async function toldNeedsYouWhile(write: () => Promise<unknown>): Promise<number> {
  heard = []
  await write()
  const events: ChannelEvent[] = heard.map((one) => one.event)
  return events.filter((one) => one.name === 'list.changed' && one.lists.includes('needsYou')).length
}

/** A device ask by the started agent, as his-card-holds-his-browsers-in-the-browser.test.ts makes one. */
async function aDeviceAsks(device: string): Promise<string> {
  return String((await post(thisMachine, '/api/office/visitors', { device }, asker))['credential'].id)
}

/** A visiting agent's own ask, from another machine, with the card a visitor asks for. */
async function aVisitorAsks(handle: string, world?: string): Promise<{ id: string; standing: string }> {
  const asked = await post(aWorldsMachine, '/api/office/visitors', {
    handle,
    name: `A made-up visitor ${handle}`,
    role: 'worker',
    conversationPath: `/transcripts/${handle}`,
    startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/${handle}`,
    runtime: 'claude-code',
    ...(world === undefined ? {} : { world }),
  })
  return { id: String(asked['credential'].id), standing: String(asked['credential'].standing) }
}

beforeAll(async () => {
  t = await freshDb()
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
  const { stampArrival } = await import('../src/server/lib/http.ts')
  aWorldsMachine = await open(createServer((raw, res) => {
    stampArrival(raw, 'another machine', 'the caller')
    app.routing(raw, res)
  }))
  // THE AGENT THAT ASKS FOR A DEVICE IS REGISTERED FIRST. On a socket, a write under an agent id that no registry
  // row answers to is refused with 403. The person starts it, and it asks under the handle the registration answers.
  const started = await post(thisMachine, '/api/agents/started', { handle: 'a-made-up-asker', name: 'A made-up asker', role: 'worker' })
  asker = asAgent(String(started['whatToGiveIt'].handle))
  const events = await import('../src/server/lib/events.ts')
  events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, send: (one) => heard.push(one) })
}, 120_000)

afterAll(async () => {
  await new Promise<void>((done) => otherMachines.close(() => done()))
  for (const server of extraDoors) await new Promise<void>((done) => server.close(() => done()))
  await app.close()
  t.close()
})

describe('an ask that waits on the person is announced once', () => {
  it('announces a device ask by an agent the person started', async () => {
    expect(await toldNeedsYouWhile(() => aDeviceAsks('Made-up hall tablet'))).toBe(1)
  })

  it('announces a visiting agent\'s own ask', async () => {
    let standing = ''
    expect(await toldNeedsYouWhile(async () => { standing = (await aVisitorAsks('made-up-wren')).standing })).toBe(1)
    expect(standing, 'the ask did not wait on the person, so it measured nothing').toBe('pending')
  })

  it('announces a browser\'s ask on a machine the person trusts', async () => {
    let waits = false
    expect(await toldNeedsYouWhile(async () => {
      waits = (await post(anotherMachine, '/api/office/pairing/ask', { device: 'Made-up attic laptop' }, { ...PERSON, 'x-forwarded-for': TRUSTED }))['waitingForConfirmation'] === true
    })).toBe(1)
    expect(waits, 'the ask did not wait for the person\'s confirm').toBe(true)
  })
})

describe('an answer is announced once, and the same answer again is not', () => {
  it('announces the confirm of a pending credential, and not the same confirm again', async () => {
    const id = await aDeviceAsks('Made-up porch phone')
    expect(await toldNeedsYouWhile(() => post(thisMachine, `/api/office/visitors/${id}/confirm`, {}))).toBe(1)
    expect(await toldNeedsYouWhile(() => post(thisMachine, `/api/office/visitors/${id}/confirm`, {}))).toBe(0)
  })

  it('announces the end of a pending credential, and not the same end again', async () => {
    const device = await aDeviceAsks('Made-up shed phone')
    expect(await toldNeedsYouWhile(() => post(thisMachine, `/api/office/visitors/${device}/end`, {}))).toBe(1)
    expect(await toldNeedsYouWhile(() => post(thisMachine, `/api/office/visitors/${device}/end`, {}))).toBe(0)
    const visitor = (await aVisitorAsks('made-up-finch')).id
    expect(await toldNeedsYouWhile(() => post(thisMachine, `/api/office/visitors/${visitor}/end`, {}))).toBe(1)
  })
})

describe('a write that waits on nobody is not announced', () => {
  it('announces nothing for an agent of a world the person registered, which is trusted at once', async () => {
    // THE WORLD IS REGISTERED BEFORE THE MEASURED WRITE. Registering it ends the visits of its earlier agents, and
    // an end is announced (case 5); only the citizen's own ask is measured here.
    const { theHeadersThisWorldReportsUnder } = await import('../src/server/lib/office.ts')
    await post(aWorldsMachine, '/api/office/worlds', {
      name: 'A made-up world',
      kind: 'remote',
      startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      databaseIdentity: A_WORLD,
      standing: 'canonical',
      installation: 'a-made-up-installation',
    }, { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() })
    let standing = ''
    expect(await toldNeedsYouWhile(async () => { standing = (await aVisitorAsks('made-up-citizen', A_WORLD)).standing })).toBe(0)
    expect(standing, 'the citizen was made to wait, so this measured no trusted write').toBe('trusted')
  })
})
