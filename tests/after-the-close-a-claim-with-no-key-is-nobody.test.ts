// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE PERSON CLOSES THE KEY WINDOW, A CLAIM WITH NO KEY IS NOBODY: AN AGENT'S, THE OWNER'S, OR NONE.
 * Keys wave pieces 5 and 6a; findings 79 and 82; criterion P83, points 1 and 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Finding 79: `theHeaderWindowCovers` in src/server/lib/http.ts answered nothing for an agent's claim,
 * so an agent's name with no key was taken as that agent whether the window was open or closed.
 * Finding 82: after the close only the doors that ask `thePersonIsProved` refused a claim to be the owner
 * with no key. An ordinary message in the owner’s name was still written as the owner’s, and `assertMayWrite` asked
 * for the owner’s proof on a decision only from another machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One scratch office with real listeners, as tests/a-refusal-says-what-is-missing-and-the-way-on
 * does: the first stamps `this machine`, the product's second listener stamps `another machine` and
 * reads the forwarded address. The cases run in order. The window is open for the first ones, then
 * the person's key closes it, and the rest run with it closed. `app.inject()` is used only for the
 * in-process caller, which is its own case.
 *
 * The keys are made up and written into this test's own key file. No real key is read or printed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, one line each, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * (a) In `actorFrom`, pass `proof !== undefined || asserted.type !== 'human'` as the third argument of
 *     `theHeaderWindowCovers`. That is the old early return for an agent's claim. (a) and (d) go red.
 * (b) In `theHeaderWindowCovers`, delete `if (provedByAKey) return 'not asked'`. (b), (d) and (e) go red.
 * (c) In `theHeaderWindowCovers`, write `if (true) return 'closed'` for the close. (c) and the open
 *     window's read go red.
 * (d) In `actorFrom`, delete the `refuseARequestNobodyProved(req, actor)` call that refuses a keyless agent's read
 *     after the close. (d) goes red.
 * (e) In `refuseAKeylessWriteAfterTheClose`, add `if (actor.type === 'human' && actor.stated !== false)
 *     return`, which skips the person's case. (e) goes red, and (g)'s door half with it.
 * (f) In `actorFrom`, delete the `refuseAKeylessWriteAfterTheClose` call on the return for a request
 *     with no identity headers. (f) goes red.
 * (g) In `assertMayWrite`, write `actor.from === 'another machine'` in the new clause, which restores
 *     the old condition. (g) goes red.
 * (h) In `theHeaderWindowCovers`, delete `if (from === undefined) return 'not asked'`. (h) goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const THE_WORKERS_MADE_UP_KEY = 'made-up-agent-key-for-the-closed-window'
const THE_LEADS_MADE_UP_KEY = 'made-up-lead-key-for-the-closed-window'

const WORKER = 'a-keyed-worker'
/** An agent that starts another, so a read shows whether the office took the caller as it. */
const LEAD = 'a-lead-that-starts-one'
const STARTED = 'an-agent-the-lead-started'

const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const THE_WORKER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }
const THE_LEAD = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': LEAD }

const TRUSTED = '198.51.100.9'

interface Answer {
  status: number
  body: Record<string, unknown>
  error: string
}

function writeTheKeyFile(t: TestDb): void {
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
}

async function ask(door: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '' }
}

/** A note, the plainest write an agent makes. */
function aNote(title: string): unknown {
  return { kind: 'note', title, data: { body: title } }
}

/** A message to the worker, the ordinary write a person makes. */
function aMessage(body: string): unknown {
  return { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: WORKER }] } }
}

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let anotherMachine: string
let otherMachines: Server

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeTheKeyFile(t)
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)

  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // Two agents registered by the person and one started by the lead, all in-process. EACH THROUGH A
  // PROVED PATH, because by the owner's decision the close refuses while a live agent holds no proved
  // key: the person's key for the owner’s two, and the lead's own key, answered by its registration,
  // for the one it starts.
  const answered = new Map<string, string>()
  for (const [handle, as, by] of [
    [WORKER, PERSON, null],
    [LEAD, PERSON, null],
    [STARTED, THE_LEAD, LEAD],
  ] as const) {
    const key = by === null ? A_MADE_UP_PERSON_KEY : (answered.get(by) ?? '')
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...as, 'x-mole-office-key': key, 'content-type': 'application/json' },
      payload: { handle, name: handle },
    })
    if (made.statusCode !== 201) throw new Error(`registering ${handle} answered ${String(made.statusCode)}: ${made.body}`)
    answered.set(handle, String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''))
  }
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', WORKER, keys.keyHash(THE_WORKERS_MADE_UP_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', LEAD, keys.keyHash(THE_LEADS_MADE_UP_KEY), null)
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
})

/** Whether the lead may retire the agent it started, as the read of that agent answers it. */
async function mayTheLeadRetire(headers: Record<string, string>): Promise<{ may: boolean; whyNot: string | null }> {
  const read = await ask(thisMachine, 'GET', `/api/participants/agent/${STARTED}/profile`, { ...WORKSPACE, ...headers })
  expect(read.status, read.error).toBe(200)
  return read.body['mayRetire'] as { may: boolean; whyNot: string | null }
}

describe('while the window is open', () => {
  it('(c) writes a keyless agent write from this machine, and puts the agent on the list of callers with no key', async () => {
    const wrote = await ask(thisMachine, 'POST', '/api/records', { ...WORKSPACE, ...THE_WORKER }, aNote('A note while the window is open'))
    expect(wrote.status, wrote.error).toBe(201)

    // The list is written after the answer goes out, so it is read until the row is there.
    let listed = false
    for (let tries = 0; tries < 50 && !listed; tries += 1) {
      const list = await ask(thisMachine, 'GET', '/api/office/header-only-calls', {})
      const callers = list.body['callers'] as { actorType: string; actorId: string }[]
      listed = callers.some((one) => one.actorType === 'agent' && one.actorId === WORKER)
      if (!listed) await new Promise((done) => setTimeout(done, 20))
    }
    expect(listed, 'the keyless agent is on the Settings list').toBe(true)
  })

  it('takes a keyless read under the lead’s name as the lead', async () => {
    expect((await mayTheLeadRetire(THE_LEAD)).may).toBe(true)
  })

  it('closes the window with the owner’s key', async () => {
    const closed = await ask(thisMachine, 'POST', '/api/office/key-window/close', {
      ...PERSON,
      'x-mole-office-key': A_MADE_UP_PERSON_KEY,
    })
    expect(closed.status, closed.error).toBe(200)
  })
})

describe('once the window is closed', () => {
  it('(a) refuses a keyless agent write from this machine, and names the agent’s own key as what is missing', async () => {
    const refused = await ask(thisMachine, 'POST', '/api/records', { ...WORKSPACE, ...THE_WORKER }, aNote('A keyless note after the close'))
    expect(refused.status, refused.error).toBe(403)
    expect(refused.error).toContain('This write needs a key. Nothing was written.')
    expect(refused.error).toContain(`This request named the agent "${WORKER}" and carried no key.`)
    expect(refused.error).toContain("The key window is closed, so an agent's name counts only with that agent's own key.")
    expect(refused.error).toContain("Send the key the agent's registration answered, as the x-mole-office-key header.")
    expect(refused.error).toContain('asks its starter or the person for a new one')
    expect(refused.error, 'an agent is not sent to pair').not.toContain('#/pairing')
  })

  it('(b) writes the same agent write when it carries the agent’s own key', async () => {
    const wrote = await ask(
      thisMachine,
      'POST',
      '/api/records',
      { ...WORKSPACE, ...THE_WORKER, 'x-mole-office-key': THE_WORKERS_MADE_UP_KEY },
      aNote('A keyed note after the close'),
    )
    expect(wrote.status, wrote.error).toBe(201)
  })

  it('(d) refuses a keyless read under the lead’s name, and names the key and the headers to send', async () => {
    // Such a read used to be answered as a request that named nobody, which was the person.
    const keyless = await ask(thisMachine, 'GET', `/api/participants/agent/${STARTED}/profile`, { ...WORKSPACE, ...THE_LEAD })
    expect(keyless.status, keyless.error).toBe(403)
    expect(keyless.error).toContain(`This request named the agent "${LEAD}", and it carried no key.`)
    expect(keyless.error).toContain("The key window is closed, so an agent's name counts only with that agent's own key.")
    expect(keyless.error).toContain('x-mole-office-key')
    // The same read with the lead's key is the lead, which may retire what it started.
    expect((await mayTheLeadRetire({ ...THE_LEAD, 'x-mole-office-key': THE_LEADS_MADE_UP_KEY })).may).toBe(true)
  })

  it('(e) refuses a keyless message in the owner’s name from this machine and from a trusted machine', async () => {
    const here = await ask(thisMachine, 'POST', '/api/records', { ...WORKSPACE, ...PERSON }, aMessage('A keyless message from here'))
    expect(here.status, here.error).toBe(403)
    expect(here.error).toContain('This write needs a key. Nothing was written.')
    expect(here.error).toContain(`This request named "${THE_TEST_OFFICES_OWNER.id}", but it carried no key that proves the person.`)
    expect(here.error).toContain("The window in which a request without the person's key still counts as theirs is closed.")
    expect(here.error).toContain("A browser on this computer gets the person's key at #/pairing, with one press.")

    const there = await ask(
      anotherMachine,
      'POST',
      '/api/records',
      { ...WORKSPACE, ...PERSON, 'x-forwarded-for': TRUSTED },
      aMessage('A keyless message from a trusted machine'),
    )
    expect(there.status, there.error).toBe(403)
    expect(there.error).toContain(`This request named "${THE_TEST_OFFICES_OWNER.id}", but it carried no key that proves the person.`)
    expect(there.error).toContain("A browser on another machine asks for the person's key at #/pairing, with one press.")

    // And with the owner’s key the same message is the owner’s.
    const keyed = await ask(
      thisMachine,
      'POST',
      '/api/records',
      { ...WORKSPACE, ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
      aMessage('A message with the owner’s key'),
    )
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(keyed.status, keyed.error).toBe(409)
  })

  it('(f) refuses a write that sent no identity headers and no key', async () => {
    const refused = await ask(thisMachine, 'POST', '/api/records', WORKSPACE, aMessage('A message that named nobody'))
    expect(refused.status, refused.error).toBe(403)
    expect(refused.error).toContain('This write needs a key. Nothing was written.')
    const { A_REQUEST_WITH_NO_NAME_SAYS } = await import('../src/server/lib/not-proved-the-person.ts')
    expect(refused.error).toContain(A_REQUEST_WITH_NO_NAME_SAYS.noNameAndNoKey)
  })

  it('(g) refuses a keyless decision from this machine, at the door and in the guard itself', async () => {
    const decision = {
      kind: 'decision',
      title: 'A decision with no key after the close',
      data: { chosen: 'a', why: 'written by a request that holds no key' },
    }
    const refused = await ask(thisMachine, 'POST', '/api/records', { ...WORKSPACE, ...PERSON }, decision)
    expect(refused.status, refused.error).toBe(403)
    expect(refused.error).toContain('This write needs a key.')

    // OVER HTTP THE WRITE IS REFUSED BEFORE ANY GUARD RUNS, so the guard's own clause is asked here
    // with the actor a listener on this machine stamps for that request once the window is closed:
    // a claim to be the owner, from this machine, with no key and no window to cover it.
    const { assertMayWrite } = await import('../src/server/lib/records.ts')
    const { PanelError } = await import('../src/server/lib/panel-error.ts')
    let thrown: unknown = null
    try {
      assertMayWrite('decision', 'create', { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, from: 'this machine' }, 'new')
    } catch (err) {
      thrown = err
    }
    expect(thrown, 'the guard refuses a keyless decision from this machine').toBeInstanceOf(PanelError)
    const message = (thrown as Error).message
    expect(message).toContain("Writing a decision is the person's own act. Nothing was written.")
    expect(message).toContain(`This request named "${THE_TEST_OFFICES_OWNER.id}", but it carried no key that proves the person.`)
  })

  it('(h) leaves an in-process call the office itself, with or without a name', async () => {
    const asTheWorker = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WORKSPACE, ...THE_WORKER, 'content-type': 'application/json' },
      payload: aNote('An in-process note after the close') as Record<string, unknown>,
    })
    expect(asTheWorker.statusCode, asTheWorker.body).toBe(201)
    const namedNobody = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WORKSPACE, 'content-type': 'application/json' },
      payload: aMessage('An in-process message after the close') as Record<string, unknown>,
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(namedNobody.statusCode, namedNobody.body).toBe(409)
  })

  it('still lets a browser on this computer pair, which is how it gets the owner’s key', async () => {
    const paired = await ask(thisMachine, 'POST', '/api/office/pairing', {})
    expect(paired.status, paired.error).toBe(200)
  })
})
