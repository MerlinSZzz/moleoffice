// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS THAT TAKE AN ACT ONLY WITH A KEY. Keys wave piece 7, built on a decision.
 *
 * `refuseAnActWithNoKey` in src/server/lib/keyheader.ts refuses a request a listener carried with no
 * key this office knows. Since this piece it guards merge.tool (three doors), check.assembled (three
 * doors: assembled, tool-started, tool-ended), handle.hold, handle.took, handle.process and
 * handle.release, beside check.answer, which tests/a-verdict-comes-with-a-key.test.ts proves. A fresh
 * count of seven days (25 September 2026, 22:16) found every answered call of these doors carried a
 * key, so asking for one takes nothing from a caller that works today.
 *
 * WHAT IS PROVED FOR EACH DOOR, through a real listener, because the rule is about a request a
 * listener carried and an injected request is on no socket:
 *   (a) a call with a name and no key is refused with 403 and the words that say what is missing and
 *       the way on, and the database holds exactly what it held before;
 *   (b) the same call with a key the office knows gets past the refusal: the agent's own key, or the
 *       office's key, which the office's own programs send;
 * and with `app.inject()`, which IS the in-process caller:
 *   (c) the same call with a name alone gets past the refusal, because a request no listener carried
 *       is the office itself.
 * Where the door's own rules can be met here (hold, took, release, assembled), (b) and (c) are the
 * door's success. Where they cannot without a merge tool, a check tool or a claude process (the merge
 * tool's three doors, the check tool's two, and process), (b) and (c) are the door's own answer, which
 * is not the key refusal; each case names the answer it expects.
 *
 * MUTATION PROOF, 25 September 2026, each alone, after a green control: removing one door's call to
 * `refuseAnActWithNoKey` turns that door's (a) red, because the keyless call is then taken or answered
 * with the door's own words. The commit message names each run and its log.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { settings } from '../src/config/settings.mjs'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER } from '../src/config/key-header.mjs'

const WORKSPACE = 'default'
const KEY_HEADER = 'x-mole-office-key'
/**
 * A KEY THAT PROVES NOBODY, as the two halves of a device key the office gave and then took back. A key the office never
 * gave is refused before any door, in its own words, in the header and as two halves alike; the old cookie is no key.
 */
const A_REVOKED_COOKIE_HALF = 'a-made-up-cookie-half-of-a-revoked-key'
const A_REVOKED_HEADER_HALF = 'a-made-up-header-half-of-a-revoked-key'
const TWO_HALVES_THAT_PROVE_NOBODY = { cookie: `${DEVICE_HALF_COOKIE}=${A_REVOKED_COOKIE_HALF}`, [DEVICE_HALF_HEADER]: A_REVOKED_HEADER_HALF }
const THE_MESSAGE_WORKER = 'mole-office/the-message-worker'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** The words every refusal of this kind carries, and the door's own act at the front. */
function expectTheKeyRefusal(said: Answer, act: string, nothing: string): void {
  expect(said.status, said.error).toBe(403)
  expect(said.error).toContain(`${act} came with no key, so it was not taken.`)
  expect(said.error).toContain(nothing)
  expect(said.error).toContain('A name in the headers alone proves nothing')
  expect(said.error).toContain(`Send a key this office knows on the ${KEY_HEADER} header.`)
}

/** Not the key refusal: the door went on to its own rules. */
function expectPastTheKeyRefusal(said: Answer): void {
  expect(said.error).not.toContain('so it was not taken')
}

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
/** The agent key the registration door answered for the agent this file holds a handle as. Never printed. */
let theHoldersKey = ''
let holderId = ''
let session = ''

interface Answer {
  status: number
  error: string
  body: Record<string, unknown>
}

async function throughTheListener(url: string, headers: Record<string, string>, payload: unknown): Promise<Answer> {
  const res = await fetch(`${thisMachine}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, error: typeof body.error === 'string' ? body.error : '', body }
}

async function inProcess(url: string, headers: Record<string, string>, payload: unknown): Promise<Answer> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  const body = reply.json() as Record<string, unknown>
  return { status: reply.statusCode, error: typeof body.error === 'string' ? body.error : '', body }
}

/** The office's own key, read from the file the office made beside the database. Never printed or asserted on. */
function theOfficesKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office?: unknown }
  if (typeof held.office !== 'string') throw new Error('the office made no key of its own beside the database')
  return held.office
}

/**
 * WHAT THE DATABASE HOLDS, in the tables these doors write: the records and their history, the
 * holds, the deliveries and the links. Compared before and after a refusal.
 */
function whatTheOfficeHolds(): string {
  const q = (sql: string): unknown => t.client.sqlite.prepare(sql).all()
  return JSON.stringify({
    records: q('SELECT id, updated_at, data FROM records ORDER BY id'),
    changes: q('SELECT count(*) AS n FROM changes'),
    revisions: q('SELECT count(*) AS n FROM revisions'),
    holds: q('SELECT * FROM handle_holds ORDER BY rowid'),
    deliveries: q('SELECT * FROM message_delivery ORDER BY rowid'),
    links: q('SELECT count(*) AS n FROM links'),
  })
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ whatToGiveIt?: { key?: string }; agent?: { id?: string } }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as { whatToGiveIt?: { key?: string }; agent?: { id?: string } }
}

async function aRecord(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** A message from the person to the holder, filed in-process. */
async function aMessageToTheHolder(words: string): Promise<string> {
  return aRecord(AS_THE_PERSON, { kind: 'message', title: words, data: { body: words, to: [{ kind: 'agent', id: holderId }] } })
}

/** A finished run the named worker filed for itself, as tests/a-verdict-comes-with-a-key.test.ts makes one. */
async function aFinishedRun(handle: string, title: string): Promise<string> {
  const run = await aRecord(asAgent(handle), {
    kind: 'session',
    title,
    data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd(), doing: 'the work under check' },
  })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  return run
}

/** Whether the holder's handle is held by this file's session now. */
function theHoldIsLive(): boolean {
  const rows = t.client.sqlite.prepare('SELECT * FROM handle_holds').all() as Record<string, unknown>[]
  return rows.some((row) => Object.values(row).includes(session) && Object.entries(row).some(([k, v]) => /released/i.test(k) && v === null))
}

/** The same limits as tests/a-verdict-comes-with-a-key.test.ts, which starts the same kind of server. */
const SETUP_LIMIT_MS = 180_000
const CASE_LIMIT_MS = 60_000

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-one', name: 'Worker One', role: 'worker', workArea: ['src'] })
  const holder = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'holder-one', name: 'Holder One', role: 'worker', workArea: ['src'] })
  theHoldersKey = holder.whatToGiveIt?.key ?? ''
  expect(theHoldersKey, 'the registration answered no key for the holder').not.toBe('')
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as {
    agents?: { id: string; handle: string }[]
  }
  holderId = (listed.agents ?? []).find((one) => one.handle === 'holder-one')?.id ?? ''
  expect(holderId, 'the roster holds no holder-one').not.toBe('')
  session = await aRecord(asAgent('holder-one'), {
    kind: 'session',
    title: 'A terminal answering as holder-one',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as holder-one' },
  })
  const keys = await import('../src/server/lib/keys.ts')
  const revoked = keys.keyHash(`${A_REVOKED_COOKIE_HALF}.${A_REVOKED_HEADER_HALF}`)
  keys.holdTheKeyWhoseHashIs('person-device', THE_PERSON, revoked, null)
  if (keys.revokeTheKeyWhoseHashIs(revoked, 'the test took it back') === null) throw new Error('the made-up halves were not revoked')
}, SETUP_LIMIT_MS)

afterAll(async () => {
  await app.close()
  t.close()
}, CASE_LIMIT_MS)

const HOLD = (): { url: string; payload: unknown } => ({
  url: '/api/handles/holder-one/hold',
  payload: { session, machine: 'the-test-machine', runtime: 'claude-code' },
})

describe('handle.hold', () => {
  it('(a) refuses a hold with a name and no key, and writes nothing', async () => {
    const before = whatTheOfficeHolds()
    const said = await throughTheListener(HOLD().url, asAgent('holder-one'), HOLD().payload)
    expectTheKeyRefusal(said, 'This hold on a handle', 'Nothing was written.')
    expect(whatTheOfficeHolds()).toBe(before)
  }, CASE_LIMIT_MS)

  it('(a) says a key that proves nobody is not "no key", and writes nothing', async () => {
    const before = whatTheOfficeHolds()
    const said = await throughTheListener(HOLD().url, { ...asAgent('holder-one'), ...TWO_HALVES_THAT_PROVE_NOBODY }, HOLD().payload)
    expect(said.status, said.error).toBe(403)
    expect(said.error).toContain('This hold on a handle came with a key that proves nobody here, so it was not taken.')
    expect(said.error).not.toContain('came with no key')
    expect(whatTheOfficeHolds()).toBe(before)
  }, CASE_LIMIT_MS)

  it("(b) takes the hold with the agent's own key", async () => {
    const said = await throughTheListener(HOLD().url, { ...asAgent('holder-one'), [KEY_HEADER]: theHoldersKey }, HOLD().payload)
    expect(said.status, said.error).toBe(201)
    expect(theHoldIsLive()).toBe(true)
  }, CASE_LIMIT_MS)

  it('(c) takes the same hold with a name alone from inside the office', async () => {
    const said = await inProcess(HOLD().url, asAgent('holder-one'), HOLD().payload)
    expect(said.status, said.error).toBe(201)
  }, CASE_LIMIT_MS)
})

describe('handle.took', () => {
  it('(a) refuses a hand-over with a name and no key, and marks nothing', async () => {
    const message = await aMessageToTheHolder('Synthetic: a message nobody may take without a key.')
    const before = whatTheOfficeHolds()
    const said = await throughTheListener('/api/handles/holder-one/took', asAgent('holder-one'), { session, message })
    expectTheKeyRefusal(said, 'This hand-over of a message', 'Nothing was marked.')
    expect(whatTheOfficeHolds()).toBe(before)
  }, CASE_LIMIT_MS)

  it("(b) takes the hand-over with the agent's own key", async () => {
    const message = await aMessageToTheHolder('Synthetic: a message taken with the key.')
    const said = await throughTheListener('/api/handles/holder-one/took', { ...asAgent('holder-one'), [KEY_HEADER]: theHoldersKey }, { session, message })
    expect(said.status, said.error).toBe(200)
  }, CASE_LIMIT_MS)

  it('(c) takes a hand-over with a name alone from inside the office', async () => {
    const message = await aMessageToTheHolder('Synthetic: a message taken from inside the office.')
    const said = await inProcess('/api/handles/holder-one/took', asAgent('holder-one'), { session, message })
    expect(said.status, said.error).toBe(200)
  }, CASE_LIMIT_MS)
})

describe('handle.process', () => {
  // SYNTHETIC: a process number and start time that name no claude process. The door's own rule
  // refuses it first because the hold names another machine, which is the answer (b) and (c) expect;
  // the key refusal comes before that rule.
  const PROCESS = (): unknown => ({ session, pid: 2_147_483_000, pidStartedAt: '2026-09-25T00:00:00.000Z' })

  it('(a) refuses a process record with a name and no key, and writes nothing', async () => {
    const before = whatTheOfficeHolds()
    const said = await throughTheListener('/api/handles/holder-one/process', asAgent('holder-one'), PROCESS())
    expectTheKeyRefusal(said, "This record of a session's process", 'Nothing was written.')
    expect(whatTheOfficeHolds()).toBe(before)
  }, CASE_LIMIT_MS)

  it("(b) goes past the key with the agent's own key, to the door's own check of the process", async () => {
    const said = await throughTheListener('/api/handles/holder-one/process', { ...asAgent('holder-one'), [KEY_HEADER]: theHoldersKey }, PROCESS())
    expectPastTheKeyRefusal(said)
    expect(said.status, said.error).toBe(409)
    expect(said.error).toContain('A process number means something only on its own machine.')
  }, CASE_LIMIT_MS)

  it("(c) goes past the key from inside the office, to the door's own check of the process", async () => {
    const said = await inProcess('/api/handles/holder-one/process', asAgent('holder-one'), PROCESS())
    expectPastTheKeyRefusal(said)
    expect(said.status, said.error).toBe(409)
    expect(said.error).toContain('A process number means something only on its own machine.')
  }, CASE_LIMIT_MS)
})

describe('handle.release', () => {
  const RELEASE = (): unknown => ({ session, because: 'Synthetic: the test is done with the handle.' })

  it('(a) refuses a release with a name and no key, and the hold stays', async () => {
    expect(theHoldIsLive()).toBe(true)
    const before = whatTheOfficeHolds()
    const said = await throughTheListener('/api/handles/holder-one/release', asAgent('holder-one'), RELEASE())
    expectTheKeyRefusal(said, 'This release of a handle', 'Nothing was written.')
    expect(whatTheOfficeHolds()).toBe(before)
    expect(theHoldIsLive()).toBe(true)
  }, CASE_LIMIT_MS)

  it("(b) takes the release with the agent's own key", async () => {
    const said = await throughTheListener('/api/handles/holder-one/release', { ...asAgent('holder-one'), [KEY_HEADER]: theHoldersKey }, RELEASE())
    expect(said.status, said.error).toBe(200)
    expect(theHoldIsLive()).toBe(false)
  }, CASE_LIMIT_MS)

  it('(c) takes a release with a name alone from inside the office', async () => {
    const held = await inProcess(HOLD().url, asAgent('holder-one'), HOLD().payload)
    expect(held.status, held.error).toBe(201)
    const said = await inProcess('/api/handles/holder-one/release', asAgent('holder-one'), RELEASE())
    expect(said.status, said.error).toBe(200)
    expect(theHoldIsLive()).toBe(false)
  }, CASE_LIMIT_MS)
})

describe('check.assembled: the assembly', () => {
  let run = ''

  it("(a) refuses an assembly with the inspector's name and no key, and writes nothing", async () => {
    run = await aFinishedRun('worker-one', 'A run somebody assembles with a name alone')
    const before = whatTheOfficeHolds()
    const said = await throughTheListener(`/api/checks/${run}/assembled`, asAgent('inspector-one'), { changes: [] })
    expectTheKeyRefusal(said, 'This record of what a check would read', 'Nothing was written.')
    expect(whatTheOfficeHolds()).toBe(before)
  }, CASE_LIMIT_MS)

  it("(b) takes the assembly with the office's key the check tool sends under the inspector's name", async () => {
    const said = await throughTheListener(`/api/checks/${run}/assembled`, { ...asAgent('inspector-one'), [KEY_HEADER]: theOfficesKey() }, { changes: [] })
    expect(said.status, said.error).toBe(201)
  }, CASE_LIMIT_MS)

  it('(c) takes an assembly with a name alone from inside the office', async () => {
    const own = await aFinishedRun('worker-one', 'A run assembled from inside the office')
    const said = await inProcess(`/api/checks/${own}/assembled`, asAgent('inspector-one'), { changes: [] })
    expect(said.status, said.error).toBe(201)
  }, CASE_LIMIT_MS)
})

/**
 * THE DOORS ONLY THE OFFICE'S OWN PROGRAMS KNOCK ON. With a key, or from inside the office, each goes
 * on to its own rules, and here those answer about a run the check tool never started or an entry
 * the queue does not hold.
 */
const THE_TOOL_DOORS: { name: string; url: () => string; payload: unknown; act: string; answered: number; says: string }[] = [
  { name: 'check.assembled: a check tool starts', url: () => `/api/checks/${session}/tool-started`, payload: { session: 'no-such-tool-run', log: '/nowhere.log', model: 'claude-opus-5-5', minutes: 1 }, act: "This record of a check tool's start", answered: 409, says: 'This is not the office tool run for this check.' },
  { name: 'check.assembled: a check tool ends', url: () => `/api/checks/${session}/tool-ended`, payload: { session: 'no-such-tool-run', reason: 'Synthetic: it ended.' }, act: "This record of a check tool's end", answered: 409, says: 'This tool run was not recorded for this check.' },
  { name: 'merge.tool: a step', url: () => '/api/merge-queue/no-such-entry/step', payload: { step: 'pinned', facts: {} }, act: "This report of a merge tool's step", answered: 404, says: 'There is no record at this address.' },
  { name: 'merge.tool: a merge tool starts', url: () => '/api/merge-queue/no-such-entry/tool-started', payload: { session: 'no-such-tool-run', log: '/nowhere.log' }, act: "This record of a merge tool's start", answered: 404, says: 'There is no record at this address.' },
  { name: 'merge.tool: a merge tool ends', url: () => '/api/merge-queue/no-such-entry/tool-ended', payload: { session: 'no-such-tool-run', reason: 'Synthetic: it ended.' }, act: "This record of a merge tool's end", answered: 404, says: 'There is no record at this address.' },
]

for (const door of THE_TOOL_DOORS) {
  describe(door.name, () => {
    it("(a) refuses the message worker's name with no key, and writes nothing", async () => {
      const before = whatTheOfficeHolds()
      const said = await throughTheListener(door.url(), asAgent(THE_MESSAGE_WORKER), door.payload)
      expectTheKeyRefusal(said, door.act, 'Nothing was written.')
      expect(whatTheOfficeHolds()).toBe(before)
    }, CASE_LIMIT_MS)

    it("(b) goes past the key with the office's key, to the door's own rules", async () => {
      const said = await throughTheListener(door.url(), { ...asAgent(THE_MESSAGE_WORKER), [KEY_HEADER]: theOfficesKey() }, door.payload)
      expectPastTheKeyRefusal(said)
      expect(said.status, said.error).toBe(door.answered)
      expect(said.error).toContain(door.says)
    }, CASE_LIMIT_MS)

    it("(c) goes past the key from inside the office, to the door's own rules", async () => {
      const said = await inProcess(door.url(), asAgent(THE_MESSAGE_WORKER), door.payload)
      expectPastTheKeyRefusal(said)
      expect(said.status, said.error).toBe(door.answered)
      expect(said.error).toContain(door.says)
    }, CASE_LIMIT_MS)
  })
}
