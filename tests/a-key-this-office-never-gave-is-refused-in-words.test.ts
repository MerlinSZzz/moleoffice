// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY THIS OFFICE NEVER GAVE IS REFUSED IN WORDS, WITH THE KEY WINDOW OPEN AND WITH IT CLOSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `howThisRequestProvedItself` in src/server/lib/keys.ts answers the same for a key the office does not know
 * as for no key. So a write that named a registered agent and carried a wrong key was written as that agent
 * while the window was open, as a keyless write is, and the program whose headers file held the wrong key
 * was never told. With the window closed it was refused as a write that needs a key, which does not say the
 * key is not one this office gave.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One scratch office with a real listener on this machine. The cases run in order: the window is open for
 * the first ones, the person's key closes it, and the rest run with it closed. `app.inject()` is used only
 * for the in-process caller, which is its own case. A keyless write is measured in both window states,
 * and it is answered as it was before this file.
 *
 * WHAT IS NOT A KEY THIS OFFICE NEVER GAVE, and is answered as before: a key the office gave and then
 * revoked, a waiting credential's token, a key in the cookie, a request no listener carried, and any key in
 * a test world, which is a copy of the office with its key rows emptied.
 *
 * Every key here is made up, or is the one this scratch office's registration answered. None is printed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, one line each, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * (a) In `refuseAKeyThisOfficeNeverGave`, return at the top. (a) and (e) go red.
 * (b) In the same function, throw the refusal with the key appended to its words. (a) and (e) go red.
 * (c) In `theHashOfAHeaderKeyNoKeyFileOrRowHolds`, ask `heldKeyByHash` for the row. (h) goes red.
 * (d) In the same function, read the key from the cookie as well as the header. (j) goes red.
 * (e) In `refuseAKeyThisOfficeNeverGave`, delete the waiting credential's return. (i) goes red.
 * (f) In the same function, delete `if (arrivalOf(req) === undefined) return`. (k) goes red.
 * (g) In the same function, delete the test world's return. (l) goes red.
 * (h) In `theHashOfAHeaderKeyNoKeyFileOrRowHolds`, delete the key file's return. (d) and (f) go red.
 * (i) In the same function, answer the hash whatever the rows hold. (c), (g) and (h) go red.
 * (j) In the same function, answer a hash for a request with no key header. (b), (f) and (j) go red.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { KEY_COOKIE, KEY_HEADER } from '../src/config/key-header.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_KEY_NO_OFFICE_GAVE = 'made-up-key-no-office-ever-gave'
const A_KEY_GIVEN_AND_REVOKED = 'made-up-key-given-and-then-revoked'

const WORKER = 'a-worker-with-its-own-key'

const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const THE_WORKER = { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }

let t: TestDb
let app: FastifyInstance
let thisMachine: string
/** The worker's own key, as this scratch office's registration answered it. Never printed. */
let theWorkersKey = ''

/** What a write answered, and how many notes under its title the office holds afterwards. */
interface Answered {
  status: number
  error: string
  written: number
}

function notesTitled(title: string): number {
  const row = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'note' AND title = ?").get(title) as { n: number }
  return row.n
}

/** One note, the plainest write an agent makes, sent through the listener with these headers. */
async function writeANote(title: string, headers: Record<string, string>): Promise<Answered> {
  const res = await fetch(`${thisMachine}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ kind: 'note', title, data: { body: title } }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, error: typeof body['error'] === 'string' ? body['error'] : '', written: notesTitled(title) }
}

/** The refusal's words, read from where the code defines them. */
async function theRefusal(): Promise<string> {
  return (await import('../src/server/lib/keyheader.ts')).A_KEY_THIS_OFFICE_NEVER_GAVE
}

/** Whether an answer is the refusal this file is about, and nothing more. */
async function refusedAsNeverGiven(answer: Answered): Promise<boolean> {
  return answer.status === 401 || answer.error.includes(await theRefusal())
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // Registered in-process with the person's key, so the worker holds a proved key and the window may close.
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...PERSON, ...WORKSPACE, [KEY_HEADER]: A_MADE_UP_PERSON_KEY, 'content-type': 'application/json' },
    payload: { handle: WORKER, name: WORKER },
  })
  if (made.statusCode !== 201) throw new Error(`registering ${WORKER} answered ${String(made.statusCode)}`)
  theWorkersKey = String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  if (theWorkersKey === '') throw new Error('the registration answered no key for the worker')

  // A key the office gave the worker and then took back.
  const keys = await import('../src/server/lib/keys.ts')
  const revoked = keys.keyHash(A_KEY_GIVEN_AND_REVOKED)
  keys.holdTheKeyWhoseHashIs('agent', WORKER, revoked, null)
  if (keys.revokeTheKeyWhoseHashIs(revoked, 'the test took it back') === null) throw new Error('the made-up key was not revoked')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('while the key window is open', () => {
  it('(a) refuses a write naming a registered agent with a key this office never gave, in words, and writes nothing', async () => {
    const title = 'A note with a wrong key while the window is open'
    const answer = await writeANote(title, { ...THE_WORKER, [KEY_HEADER]: A_KEY_NO_OFFICE_GAVE })
    expect(answer).toEqual({ status: 401, error: await theRefusal(), written: 0 })
  })

  it('(b) writes the same agent write with no key, as it did before', async () => {
    const title = 'A keyless note while the window is open'
    expect(await writeANote(title, THE_WORKER)).toEqual({ status: 201, error: '', written: 1 })
  })

  it('(c) writes the same agent write with the agent’s own key', async () => {
    const title = 'A keyed note while the window is open'
    expect(await writeANote(title, { ...THE_WORKER, [KEY_HEADER]: theWorkersKey })).toEqual({ status: 201, error: '', written: 1 })
  })

  it('(d) closes the window with the person’s key', async () => {
    const res = await fetch(`${thisMachine}/api/office/key-window/close`, { method: 'POST', headers: { ...PERSON, [KEY_HEADER]: A_MADE_UP_PERSON_KEY } })
    expect(res.status, await res.text()).toBe(200)
  })
})

describe('once the key window is closed', () => {
  it('(e) refuses a write naming a registered agent with a key this office never gave, in the same words', async () => {
    const title = 'A note with a wrong key after the close'
    const answer = await writeANote(title, { ...THE_WORKER, [KEY_HEADER]: A_KEY_NO_OFFICE_GAVE })
    expect(answer).toEqual({ status: 401, error: await theRefusal(), written: 0 })
  })

  it('(f) refuses the same agent write with no key, as it did before', async () => {
    const answer = await writeANote('A keyless note after the close', THE_WORKER)
    expect({ status: answer.status, needsAKey: answer.error.startsWith('This write needs a key. Nothing was written.'), written: answer.written })
      .toEqual({ status: 403, needsAKey: true, written: 0 })
  })

  it('(g) writes the same agent write with the agent’s own key', async () => {
    const title = 'A keyed note after the close'
    expect(await writeANote(title, { ...THE_WORKER, [KEY_HEADER]: theWorkersKey })).toEqual({ status: 201, error: '', written: 1 })
  })
})

describe('what is not a key this office never gave is answered as before', () => {
  it('(h) a key the office gave and revoked', async () => {
    const answer = await writeANote('A note with a revoked key', { ...THE_WORKER, [KEY_HEADER]: A_KEY_GIVEN_AND_REVOKED })
    expect(await refusedAsNeverGiven(answer), answer.error).toBe(false)
  })

  it('(i) a waiting credential’s token, which the office gave and nobody has confirmed', async () => {
    const { issueAPersonsDeviceCredential } = await import('../src/server/lib/visitors.ts')
    const { token } = issueAPersonsDeviceCredential({ name: 'a-made-up-device', machine: null, machineHow: 'nobody could tell', runtime: null })
    const answer = await writeANote('A note with a waiting token', { ...THE_WORKER, [KEY_HEADER]: token })
    expect(await refusedAsNeverGiven(answer), answer.error).toBe(false)
  })

  it('(j) a key this office never gave, in the cookie, which a browser cannot take back', async () => {
    const answer = await writeANote('A note with a wrong key in the cookie', { ...THE_WORKER, cookie: `${KEY_COOKIE}=${A_KEY_NO_OFFICE_GAVE}` })
    expect(await refusedAsNeverGiven(answer), answer.error).toBe(false)
  })

  it('(k) a request no listener carried, which is the office itself', async () => {
    const title = 'An in-process note with a wrong key'
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...THE_WORKER, [KEY_HEADER]: A_KEY_NO_OFFICE_GAVE, 'content-type': 'application/json' },
      payload: { kind: 'note', title, data: { body: title } },
    })
    expect(res.statusCode, res.body).toBe(201)
  })

  it('(l) a key in a test world, which is a copy of the office with its key rows emptied', async () => {
    // The module the server reads, which freshDb loaded again after this file's own import.
    const theServers = await import('../src/server/lib/worldauthority.ts')
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = WORKER
    theServers.forgetTheWorldsOwnAuthority()
    try {
      const answer = await writeANote('A note with a wrong key in a test world', { ...THE_WORKER, [KEY_HEADER]: A_KEY_NO_OFFICE_GAVE })
      expect(await refusedAsNeverGiven(answer), answer.error).toBe(false)
    } finally {
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
      theServers.forgetTheWorldsOwnAuthority()
    }
  })
})
