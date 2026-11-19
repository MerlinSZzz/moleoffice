// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS CLOSES THE ONE-VERSION KEY WINDOW, AND THE WINDOW READS IT. Criterion P83, point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * For one version a request that sends the person's headers and no key still does the person's acts
 * when a listener carried it from this computer or from a machine on the trusted list (P73). One
 * press beside the Settings list closes both halves at once and records when and who, and after it
 * neither half does the person's acts. The press is the person's, and a REGISTERED agent without the
 * right to press is refused with the sentence naming who may; an UNREGISTERED caller instead hears
 * the registration refusal, because that refusal comes first for it (problem ch5j4TKSlm5l). A
 * request no listener carried is the office itself and is unaffected before and after, because the
 * rule is about a request a listener carried.
 *
 * AND THE PRESS ITSELF ASKS FOR THE PERSON'S KEY. Problem OgdgFc68y3xq: the one-version window is
 * what makes a keyless browser the person, so that browser pressing the close would shut itself out
 * on the next request. The press therefore asks for a key that outlives the window, and this file's
 * press carries the person's key. The keyless refusal has its own file,
 * tests/the-press-refuses-the-browser-that-would-shut-itself-out.test.ts.
 *
 * THE PERSON'S ACT THIS FILE DRIVES IS CHANGING THE SHARED SCENE, criterion P83 point 1's own
 * example of an act whose guard asks `thePersonIsProved` and not merely whether the request came
 * from another machine. A decision write is deliberately NOT used here: `assertMayWrite` refuses a
 * decision from another machine without the person's proof, but it does not ask for the proof from
 * this machine at all, so a loopback keyless claim could write one either way and this file would
 * be measuring nothing about the window.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The window reads the listener's stamp for the loopback half and the trusted list for the other,
 * and neither can be set by a caller. An injected request is on no socket, so the rule does not
 * reach it at all. So this file opens the first listener with `app.listen` and the product's own
 * second listener with `listenForOtherMachines`, exactly as tests/local-only-routes.test.ts does,
 * and drives both with `fetch`. The trusted half sends the forwarded address the second door really
 * reads; a request that faked the arrival would measure nothing.
 *
 * THE IN-PROCESS CASE IS DRIVEN WITH `app.inject()`, because that IS the in-process caller.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER OF THE CASES IS THE ORDER OF THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * These share one app and one database, and the window is one-way: once closed it stays closed. So
 * the open cases run first, then the press, then the closed cases, and the in-process case runs
 * both before and after the press. Vitest runs the cases in the order they are written.
 *
 * MUTATION PROOF (after a green control): make `theHeaderWindowCovers` in src/server/lib/http.ts
 * ignore `theKeyWindowIsClosed()` again, and the closed cases go red because the header claim is
 * covered once more. Restoring it turns them green.
 */

import { readFileSync } from 'node:fs'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The person's headers and no key: exactly the claim the window is about. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * A REGISTERED AGENT WITHOUT THE RIGHT TO PRESS. It is registered, so the blanket
 * unregistered-writer refusal does not stand in front of the press guard, and it holds no owner's
 * authority, so `onlyThePersonMay` refuses it with the guard's own sentence. This is the caller that
 * proves the press guard's sentence is reachable (problem ch5j4TKSlm5l).
 */
const A_REGISTERED_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-registered-worker',
}

/**
 * AN UNREGISTERED AGENT. For this caller the registration refusal stays first, by the secretary's
 * decision (problem ch5j4TKSlm5l): a caller that is not registered must learn that before anything
 * else, and the blanket rule is what keeps unknown writers out.
 */
const AN_UNREGISTERED_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-worker-with-no-key',
}

/**
 * THE PERSON'S KEY, read from the file the office made at first run beside the database.
 *
 * It is never printed or asserted on. The test sends it and reads the status, which is the whole of
 * what a test may do with a real key.
 */
function thePersonsKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return held.person
}

/** The person's headers WITH the key: the proof that outlives the window the press closes. */
function thePersonWithTheKey(): Record<string, string> {
  return { ...THE_PERSON, 'x-mole-office-key': thePersonsKey() }
}

/** A machine on the trusted list, and the address the second listener reads for it. */
const TRUSTED = '198.51.100.9'

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
  // THE FIRST LISTENER, which stamps `this machine`: the loopback half of the window.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE PRODUCT'S OWN SECOND LISTENER, criterion P83's trusted half. It stamps `another machine`
  // and a proxy on this computer, so its caller address is the forwarded value it really reads.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE REGISTERED WORKER THE PRESS CASES BELOW USE. The person starts it, and leaving the role out
  // registers it as a worker — registered, and holding no owner's authority. So the registration
  // refusal does not stand in front of the press guard for this caller and the guard's own sentence
  // is reached (problem ch5j4TKSlm5l).
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    // WITH THE OWNER'S KEY, a proved path: this worker is live when the press closes the window, and the close
    // refuses while a live agent holds no proved key, a rule from a decision.
    headers: thePersonWithTheKey(),
    payload: { handle: A_REGISTERED_WORKER['x-mole-office-actor-id'], name: 'A Registered Worker' },
  })
  if (registered.statusCode !== 201) {
    throw new Error(
      `could not register the worker this file presses as: ${String(registered.statusCode)} ${registered.body}`,
    )
  }
})

async function shutTheOtherDoor(): Promise<void> {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
}

afterAll(async () => {
  await shutTheOtherDoor()
  await app.close()
  t.close()
})

interface Answer {
  status: number
  error: string
}

/** The person's act: change whether the office map moves. Its guard asks `thePersonIsProved` unconditionally. */
async function changeTheScene(door: string, headers: Record<string, string>): Promise<Answer> {
  const res = await fetch(`${door}/api/office/scene-settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ motion: true }),
  })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, error: body.error ?? '' }
}

/** The loopback half: the first listener, which stamps this machine. */
function fromThisMachine(): Promise<Answer> {
  return changeTheScene(thisMachine, THE_PERSON)
}

/** The trusted half: the second listener, whose forwarded address is on the trusted list. */
function fromATrustedMachine(): Promise<Answer> {
  return changeTheScene(anotherMachine, { ...THE_PERSON, 'x-forwarded-for': TRUSTED })
}

/** The office's own one installation row, as the press writes it. */
function theWindowRow(): {
  window_closed_at: string | null
  window_closed_by_kind: string | null
  window_closed_by_id: string | null
} {
  return t.client.sqlite
    .prepare(
      'SELECT window_closed_at, window_closed_by_kind, window_closed_by_id FROM installation WHERE only_row = 1',
    )
    .get() as { window_closed_at: string | null; window_closed_by_kind: string | null; window_closed_by_id: string | null }
}

/** The in-process caller: no socket, so no listener carried it and the rule does not reach it. */
async function changeTheSceneInProcess(): Promise<number> {
  const injected = await app.inject({
    method: 'PATCH',
    url: '/api/office/scene-settings',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { motion: true },
  })
  return injected.statusCode
}

/** Press the close door. Kept on this machine, so it is driven through the first listener. */
async function pressToClose(headers: Record<string, string>): Promise<Answer> {
  const res = await fetch(`${thisMachine}/api/office/key-window/close`, { method: 'POST', headers })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, error: body.error ?? '' }
}

describe('while the window is open', () => {
  it('does the person’s act from this computer and from a trusted machine, and in-process', async () => {
    const here = await fromThisMachine()
    expect(here.status, `loopback was refused while the window was open: ${here.error}`).toBe(200)

    const there = await fromATrustedMachine()
    expect(there.status, `a trusted machine was refused while the window was open: ${there.error}`).toBe(200)

    // THE OFFICE ITSELF, before the press: an in-process caller is on no socket and the rule does
    // not reach it. `from` is absent, and that is what says so.
    expect(await changeTheSceneInProcess(), 'the office itself was refused while the window was open').toBe(200)
  })

  it('refuses a registered agent the press, with the guard’s own sentence naming who may', async () => {
    // THE REGISTERED CALLER REACHES THE PRESS GUARD. It is registered, so the blanket
    // unregistered-writer refusal does not come first for it, and it holds no owner's authority, so
    // the press guard refuses it in its own words (problem ch5j4TKSlm5l).
    const answer = await pressToClose(A_REGISTERED_WORKER)
    expect(answer.status, `a registered agent closed the window: ${answer.error}`).toBe(403)
    // THE SENTENCE NAMES WHO MAY, because a refusal that does not is one the reader has to research.
    expect(answer.error, 'the refusal does not name who may').toContain('The owner does it')
  })

  it('still tells an unregistered caller it is unregistered, before the guard’s own sentence', async () => {
    // THE ORDER IS DECIDED, and this is the other half of it (problem ch5j4TKSlm5l): for a caller no
    // registry holds, the registration refusal stays first. It is a different refusal about a
    // different thing, and it is the one that keeps unknown writers out.
    const answer = await pressToClose(AN_UNREGISTERED_AGENT)
    expect(answer.status, `an unregistered agent closed the window: ${answer.error}`).toBe(403)
    expect(answer.error, 'the registration refusal did not arrive').toContain(
      'Nothing is registered as the agent "a-worker-with-no-key"',
    )
    expect(answer.error, 'the press guard’s sentence arrived for an unregistered caller').not.toContain(
      'The owner does it',
    )
  })

  it('has recorded no close: all three columns are null', () => {
    expect(theWindowRow()).toEqual({
      window_closed_at: null,
      window_closed_by_kind: null,
      window_closed_by_id: null,
    })
  })
})

describe('the press', () => {
  it('closes it, records the moment and the who, and the window says so', async () => {
    const answer = await pressToClose(thePersonWithTheKey())
    expect(answer.status, `the owner's own press was refused: ${answer.error}`).toBe(200)

    // THE THREE COLUMNS TAKE THE TIME AND THE WHO. The kind and the id are the same pair
    // trusted_machines writes, and a browser person is `person` and the person's id.
    const row = theWindowRow()
    expect(row.window_closed_at, 'the press recorded no moment').not.toBeNull()
    expect(row.window_closed_by_kind).toBe('person')
    expect(row.window_closed_by_id).toBe(THE_TEST_OFFICES_OWNER.id)

    // AND THE WINDOW READS IT, through the door the page uses, with the owner's key as the owner's paired page sends it. After the
    // close a request that names nobody and carries no key is refused.
    const read = await fetch(`${thisMachine}/api/office/key-window`, { headers: thePersonWithTheKey() })
    expect(read.status).toBe(200)
    const said = (await read.json()) as {
      open: boolean
      closedAt: string | null
      closedBy: { kind: string; id: string } | null
    }
    expect(said.open, 'the window still says it is open after the press').toBe(false)
    expect(said.closedAt).toBe(row.window_closed_at)
    expect(said.closedBy).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
  })
})

describe('once the window is closed', () => {
  it('does the person’s act from neither this computer nor a trusted machine', async () => {
    const here = await fromThisMachine()
    expect(here.status, `loopback still changed the scene: ${here.error}`).toBe(403)

    const there = await fromATrustedMachine()
    expect(there.status, `a trusted machine still changed the scene: ${there.error}`).toBe(403)
  })

  it('is unaffected for an in-process caller, because it is the office itself', async () => {
    expect(await changeTheSceneInProcess(), 'the office itself was refused after the press').toBe(200)
  })
})
