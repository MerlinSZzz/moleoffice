// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROGRAM THAT SENDS NO KEY IS NOT THE OWNER. A decision on problem VTzfQgA0ZgP4.
 *
 * A request that a listener carried, with no key and none of the three actor headers, is the person only while the key
 * window is open and this computer's own program sent it. Any other is refused with 403, and the refusal names the key
 * and the headers to send. After the close, a read under an agent's name with no key is refused the same way. A request
 * no listener carried (an in-process call) is the office itself and is unchanged, and so are the doors a caller uses to
 * get a key. The owner's paired browser, the owner's devices and the office's own programs carry keys and keep reading.
 *
 * The message here is between two agents, so the only readers who may see it are those two, the person, the secretary
 * and the office's own programs.
 *
 * Three-run proof: control, then each mutation below with the file copied first, then restore with cp and cmp, then
 * the control command again.
 *   node tools/run-named-tests.mjs tests/a-program-with-no-key-is-not-the-owner.test.ts
 * Mutations, one line each, and the case each turns red:
 *   A. src/server/lib/http.ts, actorFrom's keyless branch: `!(window === 'covered' && sentBy === THEIR_OWN_PROGRAM)` to
 *      `!(window === 'covered')`. Case 2 (a sandbox while the window is open) is answered 200.
 *   B. the same line removed. Cases 2, 3 and 4 are answered 200.
 *   C. src/server/lib/http.ts, the agent turn after the close: `refuseARequestNobodyProved(req, actor)` removed. Case 5.
 *   D. src/server/lib/not-proved-the-person.ts: the line naming the key header and the two actor headers removed. Case 6.
 *   E. src/server/lib/keys.ts, keyOn: the cookie is no longer read. Case 7.
 *   F. src/server/lib/http.ts, actorFrom's keyless branch: `from !== undefined && ` removed. Case 8.
 *   G. src/server/lib/http.ts: `'office.pairing'` taken out of THE_DOORS_NOBODY_NEEDS_A_KEY_FOR. Case 9.
 *   H. retired: case 10 recorded a gap, and item 1 of a decision closed it.
 *
 * A REQUEST THAT NAMES THE PERSON WITH NO KEY follows the same rule since that decision: it is the person only while the open window
 * covers it and this computer's own program sent it. Its mutations, one line each, in actorFrom's named return:
 *   I. the condition `!(window === 'covered' && sentBy === THEIR_OWN_PROGRAM)` to `false`. Cases 2b and 10 are answered 200.
 *   J. `proof === undefined && ` removed. A request that carries the person's key is refused too, so closing the window
 *      with the person's key fails first, and cases 4, 5, 6, 10 and 11 after it.
 *   K. `from !== undefined && ` removed. Case 8b (a call inside the office in the person's name) is refused.
 *   L. src/server/lib/not-proved-the-person.ts: the sentence for a request that named the person made the one for a
 *      request that named nobody. Case 11.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_DEVICE_KEY = randomBytes(32).toString('hex')
const THE_LEADS_MADE_UP_KEY = 'made-up-lead-key-for-keyless-reads'

const LEAD = 'a-synthetic-lead'
const WORKER = 'a-synthetic-worker'
const BYSTANDER = 'a-synthetic-bystander'
const WORDS = 'Synthetic words only the lead and the worker may read.'

const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const NOT_TRUSTED = '203.0.113.77'

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let thisMachine = ''
let anotherMachine = ''
let otherMachines: Server
let messageId = ''

interface Answer {
  status: number
  text: string
  cookie: string | null
}

/** One request on a connection of its own, so an answer kept on an earlier connection is not what is read. */
async function ask(door: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const r = await fetch(`${door}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers, connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, text: await r.text(), cookie: r.headers.get('set-cookie') }
}

/** The message by its id, and the list of messages, read with these headers from this door. */
async function readTheMessage(headers: Record<string, string>, door = thisMachine): Promise<{ one: Answer; list: Answer }> {
  return {
    one: await ask(door, 'GET', `/api/records/${messageId}`, { ...WORKSPACE, ...headers }),
    list: await ask(door, 'GET', '/api/records?kind=message', { ...WORKSPACE, ...headers }),
  }
}

/** A stand-in for the machine that answers who sent a connection, and nothing else differently. */
function aSandboxSendsIt(): ResourcesLib['LINUX_PROBE'] {
  const probe = Object.create(res.LINUX_PROBE) as ResourcesLib['LINUX_PROBE']
  Object.assign(probe, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: true }) })
  return probe
}

function expectRefusedAndSilent(answer: { one: Answer; list: Answer }): void {
  expect(answer.one.status, answer.one.text.slice(0, 300)).toBe(403)
  expect(answer.list.status, answer.list.text.slice(0, 300)).toBe(403)
  expect(answer.one.text).not.toContain(WORDS)
  expect(answer.list.text).not.toContain(WORDS)
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
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THREE AGENTS, EACH REGISTERED BY THE PERSON'S KEY, because the close refuses while a live agent holds no proved key.
  for (const handle of [LEAD, WORKER, BYSTANDER]) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...WORKSPACE, ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY, 'content-type': 'application/json' },
      payload: { handle, name: handle },
    })
    if (made.statusCode !== 201) throw new Error(`registering ${handle} answered ${String(made.statusCode)}: ${made.body}`)
  }
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', LEAD, keys.keyHash(THE_LEADS_MADE_UP_KEY), null)
  // A DEVICE OF THE OWNER'S THE OWNER CONFIRMED: its key proves the person, and a paired browser there holds it as the cookie.
  keys.holdTheKeyWhoseHashIs('person-device', THE_TEST_OFFICES_OWNER.id, keys.keyHash(A_MADE_UP_DEVICE_KEY), null)

  const sent = await ask(thisMachine, 'POST', '/api/records',
    { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': LEAD, 'x-mole-office-key': THE_LEADS_MADE_UP_KEY },
    { kind: 'message', title: 'Synthetic lead to worker', data: { body: WORDS, to: [{ kind: 'agent', id: WORKER }] } })
  // NOTHING HOLDS THE WORKER IN THIS TEST OFFICE, so the office stores the message, routes it and answers 409 rather
  // than 201. The message is stored all the same, and the cases below read it.
  if (sent.status !== 409) throw new Error(`the message answered ${String(sent.status)}: ${sent.text}`)
  messageId = (JSON.parse(sent.text) as { record: { id: string } }).record.id
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  res?.useOsProbe(res.LINUX_PROBE)
  await new Promise<void>((done) => { otherMachines.close(() => { done() }) })
  await app.close()
  t.close()
})

describe('while the key window is open', () => {
  it('1: answers this computer\'s own program that sends nothing as the person, as before', async () => {
    const read = await readTheMessage({})
    expect(read.one.status, read.one.text.slice(0, 300)).toBe(200)
    expect(read.one.text).toContain(WORDS)
  })

  it('2: refuses a program in a sandbox that sends nothing, and it cannot read a message it is no party to', async () => {
    res.useOsProbe(aSandboxSendsIt())
    const read = await readTheMessage({})
    expectRefusedAndSilent(read)
    expect(read.one.text).toContain('a program inside a container, which is a sandbox')
    expect(read.one.text).toContain('x-mole-office-key')
  })

  it('2b: refuses a program in a sandbox that names the person with no key, and it cannot read a message it is no party to', async () => {
    res.useOsProbe(aSandboxSendsIt())
    const read = await readTheMessage(PERSON)
    expectRefusedAndSilent(read)
    expect(read.one.text).toContain('This request named the person, and it carried no key.')
    expect(read.one.text).toContain('a program inside a container, which is a sandbox')
  })

  it("2c: still answers this computer's own program that names the person with no key, as before", async () => {
    const read = await readTheMessage(PERSON)
    expect(read.one.status, read.one.text.slice(0, 300)).toBe(200)
    expect(read.one.text).toContain(WORDS)
  })

  it('3: refuses a machine this office does not trust that sends nothing', async () => {
    const read = await readTheMessage({ 'x-forwarded-for': NOT_TRUSTED }, anotherMachine)
    expectRefusedAndSilent(read)
    expect(read.one.text).toContain('does not trust the machine this request came from')
  })

  it('closes the window with the person\'s key', async () => {
    const closed = await ask(thisMachine, 'POST', '/api/office/key-window/close', { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY })
    expect(closed.status, closed.text).toBe(200)
  })
})

describe('once the key window is closed', () => {
  it('4: refuses this computer\'s own program that sends no key and no name, and it cannot read a message it is no party to', async () => {
    expectRefusedAndSilent(await readTheMessage({}))
  })

  it('5: refuses a read under an agent\'s name with no key, and names the key and the two headers to send', async () => {
    const read = await readTheMessage({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': BYSTANDER })
    expectRefusedAndSilent(read)
    expect(read.one.text).toContain(`This request named the agent \\"${BYSTANDER}\\", and it carried no key.`)
    expect(read.one.text).toContain('x-mole-office-key')
    expect(read.one.text).toContain('x-mole-office-actor-type')
    expect(read.one.text).toContain('x-mole-office-actor-id')
  })

  it('6: tells a request that named nobody what to send', async () => {
    const { error } = JSON.parse((await ask(thisMachine, 'GET', `/api/records/${messageId}`, WORKSPACE)).text) as { error: string }
    expect(error).toContain('Mole Office does not know who sent this request, so it was not answered. Nothing was read or written.')
    expect(error).toContain('The key window is closed, so a request that names nobody is answered only with a key.')
    expect(error).toContain('An agent sends its own key in the x-mole-office-key header, with its name in x-mole-office-actor-type and x-mole-office-actor-id.')
    expect(error).toContain("A program of the office sends the office's key the same way.")
    expect(error).toContain("A browser on this computer gets the person's key at #/pairing, with one press.")
  })

  it('7: still answers the person\'s paired browser and the person\'s confirmed device, which carry the person\'s key as the cookie', async () => {
    const paired = await ask(thisMachine, 'POST', '/api/office/pairing', {}, {})
    expect(paired.status, paired.text.slice(0, 300)).toBe(200)
    const cookie = (paired.cookie ?? '').split(';')[0] ?? ''
    expect(cookie).toContain('mole-office-key=')
    const browser = await readTheMessage({ cookie })
    expect(browser.one.status, browser.one.text.slice(0, 300)).toBe(200)
    expect(browser.one.text).toContain(WORDS)
    const device = await readTheMessage({ cookie: `mole-office-key=${A_MADE_UP_DEVICE_KEY}`, 'x-forwarded-for': NOT_TRUSTED }, anotherMachine)
    expect(device.one.status, device.one.text.slice(0, 300)).toBe(200)
    expect(device.one.text).toContain(WORDS)
  })

  it('8: still answers the office\'s own programs: its key under the worker\'s name, and a call inside the office', async () => {
    const worker = await readTheMessage({
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office/the-message-worker',
      'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
    })
    expect(worker.one.status, worker.one.text.slice(0, 300)).toBe(200)
    expect(worker.one.text).toContain(WORDS)
    const inside = await app.inject({ method: 'GET', url: `/api/records/${messageId}`, headers: WORKSPACE })
    expect(inside.statusCode, inside.body.slice(0, 300)).toBe(200)
    expect(inside.body).toContain(WORDS)
  })

  it('8b: still answers a call inside the office that names the person with no key, which is the office itself', async () => {
    const inside = await app.inject({ method: 'GET', url: `/api/records/${messageId}`, headers: { ...WORKSPACE, ...PERSON } })
    expect(inside.statusCode, inside.body.slice(0, 300)).toBe(200)
    expect(inside.body).toContain(WORDS)
  })

  it('9: still answers the pairing page\'s read, which tells a browser how to get the person\'s key', async () => {
    const read = await ask(thisMachine, 'GET', '/api/office/pairing', WORKSPACE)
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    expect(JSON.parse(read.text)).toMatchObject({ paired: false, offered: true })
  })

  /**
   * THE GAP CASE 10 USED TO RECORD IS CLOSED. Item 1 of a decision says a request that names
   * the person with no key counts as the person only where a request that names nobody would, so after the
   * close it is refused.
   */
  it('10: refuses a program that names the person with no key, and it cannot read a message it is no party to', async () => {
    expectRefusedAndSilent(await readTheMessage(PERSON))
  })

  it('11: tells a request that named the person with no key what to send', async () => {
    const { error } = JSON.parse((await ask(thisMachine, 'GET', `/api/records/${messageId}`, { ...WORKSPACE, ...PERSON })).text) as { error: string }
    expect(error).toContain('Mole Office does not know who sent this request, so it was not answered. Nothing was read or written.')
    expect(error).toContain('This request named the person, and it carried no key.')
    expect(error).toContain('The key window is closed, so a request that names the person is answered only with a key.')
    expect(error).toContain("A browser on this computer gets the person's key at #/pairing, with one press.")
  })

  it('12: still lets a browser that names the person with no key pair, so it can get the person\'s key', async () => {
    const read = await ask(thisMachine, 'GET', '/api/office/pairing', { ...WORKSPACE, ...PERSON })
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    const paired = await ask(thisMachine, 'POST', '/api/office/pairing', { ...WORKSPACE, ...PERSON }, {})
    expect(paired.status, paired.text.slice(0, 300)).toBe(200)
    expect(paired.cookie ?? '').toContain('mole-office-key=')
  })
})
