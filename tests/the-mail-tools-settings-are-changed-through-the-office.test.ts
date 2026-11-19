// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S SETTINGS ARE CHANGED THROUGH THE OFFICE, BY THE PERSON ON A PAIRED DEVICE, AND THE OFFICE KEEPS
 * NOTHING BUT THE ACT. The tool answers only on 127.0.0.1 of the office's computer, so on any other device Settings
 * could not change it. The read-only half passes the tool's state on
 * (tests/the-mail-tools-state-is-read-through-the-office.test.ts). This is the changes half: picking the account, saving
 * the list of addresses and sending a test letter, each passed on to the tool by the office there, each needing a
 * paired browser, and each written down as the person's act, as Settings' other presses are. Addresses pass through the
 * office in transit; it stores none.
 *
 *   POST /api/office/mail-tool/addresses   {"addresses": what the person typed}
 *   POST /api/office/mail-tool/account     {"id": the account's id}
 *   POST /api/office/mail-tool/test        nothing
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A change from an unpaired browser is refused at each of the three doors, and the tool hears nothing: a request
 *      from another computer with no key, with a key that proves nobody, with the key of a device that asked to be
 *      paired and was not confirmed, and with the person's name and no key. On this computer an agent is refused as
 *      well, by name or with its own key. No act is written down.
 *   2. From a paired device, the person saves the list, sends a test letter and picks the account, and each answer is
 *      the tool's own; the same presses work on the office's computer. Each act the tool says it did is written down
 *      as the person's, once, naming no address, no account and nothing else the tool answered. A list the tool refused
 *      changed nothing, and nothing is written down for it.
 *   3. The office asks the tool only at the address it already knows, only at the one door of the press, and sends on
 *      only the one field the door takes, rebuilt: nothing else of the request goes to the tool. A query, a further
 *      path, a field the door does not take or a value of the wrong kind is refused, and the tool hears nothing. When
 *      the office knows no address, or the tool refuses, the reply says so, and no act is written down.
 *   4. It keeps nothing but the act: every row of every table reads the same before and after, but for the count every
 *      request makes and one change row for each act, and no row holds an address, the account's id or the secret.
 *   5. The request log holds no address: each door's line is written, and neither an address typed into the query nor
 *      one in a field the door refused is in any line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * A scratch office in process (`freshDb` and `buildApp`, with its log written into this file's own list), never the
 * live office. The second listener stands for another computer, as in the read-only half. In case 2 the tool is real
 * for the list and the test letter: tools/mail-the-summonses.mjs in a folder of this test's own, answering on a port of
 * its own; its accounts reader is a program that is not there, so it reads no account of this computer, and the test
 * letter goes to an empty list, so nothing is mailed. Picking an account needs an account the tool can read, so for
 * that press, and in cases 1, 3, 4 and 5, a recording server stands in for the tool and answers as the tool does.
 *
 * WHERE THE TOOL ANSWERS IS STOOD IN FOR, in `theMailToolAsItStands` alone, as in the read-only half. Every address
 * here is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/api/summons.ts: the list's door declared for any computer. tests/reach-declared.test.ts,
 *      tests/local-only-routes.test.ts and tests/the-person-sets-their-settings-from-another-computer.test.ts go red.
 *      Case 1 here stays green, because the person's guard refuses the same presses.
 *   2. src/server/api/summons.ts: the person's guard taken off the account's door. Case 1 goes red: the agent with its
 *      own key reaches the tool.
 *   3. src/server/api/summons.ts: the act not written down. Case 2 goes red.
 *   4. src/server/lib/the-mail-tool-through-the-office.ts: the request's body sent on as it came. Case 3 goes red.
 *   5. src/server/api/summons.ts: what the tool did kept in the act's row. Case 4 goes red.
 *   6. src/config/private-sandbox-login.mjs: the three doors left out of the private addresses of the log. Case 5 goes
 *      red.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { apiCalls, changes, headerOnlyCalls, heldKeys } from '../src/server/db/schema.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { makeTheFolder, makeTheTool, serveTheDoors, theAddresses, THE_SECRET_HEADER } from '../tools/mail-the-summonses.mjs'

/** Where the tool answers, as the office reads it from the tool's folder: null when it knows no address. */
const where = vi.hoisted(() => ({ page: null as string | null }))

vi.mock('../src/server/lib/mailtool.ts', async (real) => ({
  ...(await real<typeof import('../src/server/lib/mailtool.ts')>()),
  theMailToolAsItStands: () => ({
    key: null,
    keyWorks: true,
    unit: 'installed',
    running: where.page !== null,
    enabled: true,
    page: where.page,
    says: 'A stand-in for this test.',
  }),
}))

/** The three doors, by the tool's own door each passes a press on to. */
const DOORS = {
  addresses: '/api/office/mail-tool/addresses',
  account: '/api/office/mail-tool/account',
  test: '/api/office/mail-tool/test',
} as const
type Door = keyof typeof DOORS

const A = 'first-relay-changer@example.test'
const B = 'second-relay-changer@example.test'
/** The address of the account the stand-in sends from, and its id. Neither may be kept. */
const SENDER = 'the-sending-account@example.test'
const ACCOUNT = 'account_made_up_4471'
/** An address typed where a door takes none, which the door refuses and the log must not keep. */
const TYPED = 'typed-where-it-is-not-taken@example.test'
const SECRET = 'a-made-up-secret-of-the-tools-page-5519'

/** The body each door takes, with the given list. */
const theBodyOf = (door: Door, typed = [A, B].join('\n')): Record<string, unknown> | null =>
  door === 'addresses' ? { addresses: typed } : door === 'account' ? { id: ACCOUNT } : null

/** The person's headers on this computer, with no key: the one-version window answers the person here. */
const THE_PERSON_HERE = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** What the browser on the person's other computer sends: a device's key makes it the person's, so the claim says `agent`. */
const theOtherComputer = (key: string | null): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-laptop',
  ...(key === null ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
/** What every setting's change row is filed under, read once the database is named, since its module opens it. */
let aSettingOnTheLedger = ''
let app: FastifyInstance
let otherMachines: Server
let thisMachine = ''
let anotherMachine = ''
let deviceKey = ''
/** The key a device was given when it asked to be paired, which nobody confirmed. */
let unconfirmedKey = ''
/** The key of an agent the person started on this computer: it proves the agent, and never the person. */
let agentKey = ''
let scratch = ''
let toolDir = ''
let realTool: { port: number; close: () => Promise<void> }
let stand: Server
/** Each request the stand-in tool was sent, with its body. */
const heard: { method: string; url: string; headers: IncomingHttpHeaders; body: string }[] = []
/** How the stand-in answers the next request: as the tool does, unless a case says otherwise. */
const standAnswers: { status: number; body: unknown } = { status: 200, body: null }
const logs: string[] = []

/** The tool's answer to each door, as the tool gives it: what it did, and its state after. */
function asTheToolAnswers(door: string): unknown {
  const state = {
    addresses: [A, B],
    sender: { account: { id: ACCOUNT, address: SENDER, provider: 'Google' }, reason: null, count: 1 },
    lastTest: null,
  }
  if (door === '/addresses') return { done: { saved: true, addresses: [A, B] }, state }
  if (door === '/account') return { done: { picked: true }, state }
  if (door === '/test') return { done: { tested: true }, state: { ...state, lastTest: { at: '2026-11-02 15:00:00', outcome: 'sent', reason: null, letters: [{ to: A, outcome: 'sent' }] } } }
  return { refused: 'no such door' }
}

async function ask(base: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const sent = body === undefined || body === null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }
  const res = await fetch(`${base}${path}`, { method, headers: { ...headers, ...('body' in sent ? { 'content-type': 'application/json' } : {}) }, ...sent })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, text }
}

/** One press at one door. */
const press = (base: string, door: Door, headers: Record<string, string>, typed?: string) => ask(base, 'POST', DOORS[door], headers, theBodyOf(door, typed))

const theRealTool = (): string => `http://127.0.0.1:${String(realTool.port)}/?s=${encodeURIComponent(SECRET)}`
const theStandIn = (): string => `http://127.0.0.1:${String((stand.address() as AddressInfo).port)}/?s=${encodeURIComponent(SECRET)}`

/** Every row of every table, by table. */
function everyRow(): Record<string, unknown[]> {
  const tables = t.client.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as { name: string }[]
  return Object.fromEntries(tables.map(({ name }) => [name, t.client.db.all(`SELECT * FROM "${name}"`)]))
}

/** The rows of `table` that are in `after` and not in `before`, by id. */
function newRows(before: Record<string, unknown[]>, after: Record<string, unknown[]>, table: string): Record<string, unknown>[] {
  const ids = new Set(before[table]!.map((row) => (row as Record<string, unknown>)['id']))
  return after[table]!.filter((row) => !ids.has((row as Record<string, unknown>)['id'])) as Record<string, unknown>[]
}

/** The change rows written for a setting since `before`. */
function actsSince(before: Record<string, unknown[]>): Record<string, unknown>[] {
  return newRows(before, everyRow(), getTableName(changes))
}

/** The list the real tool keeps in its folder, as the tool reads it. */
const theToolsList = (): string[] => theAddresses(toolDir)

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-mail-tool-changed-through-the-office-'))
  toolDir = join(scratch, 'tool')
  makeTheFolder(toolDir)
  const tool = makeTheTool({ dir: toolDir, api: 'http://127.0.0.1:9', busctl: join(scratch, 'no-busctl-here'), say: () => undefined })
  realTool = await serveTheDoors(tool, { secret: SECRET, origins: [] })

  stand = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      res.writeHead(standAnswers.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(standAnswers.body ?? asTheToolAnswers(req.url ?? '')))
    })
  })
  await new Promise<void>((done) => stand.listen(0, '127.0.0.1', done))

  t = await freshDb()
  aSettingOnTheLedger = (await import('../src/server/lib/elevation.ts')).A_SETTING_ON_THE_LEDGER
  const { buildApp, listenForOtherMachines } = await import('../src/server/index.ts')
  const { settings } = await import('../src/config/settings.mjs')
  const built = await buildApp({
    production: false,
    webDir: '/invented/unused-web',
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: { write: (line: string) => { logs.push(line) } },
  })
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE PERSON'S OTHER COMPUTER, PAIRED: it asks through the credential flow's own door and the person confirms it on
  // this computer.
  const asked = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up laptop' })
  expect(asked.status, asked.text.slice(0, 300)).toBe(201)
  deviceKey = String(asked.body.token)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${String(asked.body.credential.id)}/confirm`, THE_PERSON_HERE, {})
  expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(200)
  // AND A DEVICE THAT ASKED TO BE PAIRED, which nobody confirmed.
  const unconfirmed = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up phone nobody confirmed' })
  expect(unconfirmed.status, unconfirmed.text.slice(0, 300)).toBe(201)
  unconfirmedKey = String(unconfirmed.body.token)
  // AND AN AGENT WITH ITS OWN KEY, started by the person on this computer.
  const started = await ask(thisMachine, 'POST', '/api/agents/started', THE_PERSON_HERE, { handle: 'a-worker', name: 'A worker', role: 'worker' })
  expect(started.status, started.text.slice(0, 300)).toBe(201)
  agentKey = String(started.body.whatToGiveIt?.key ?? '')
  expect(agentKey).not.toBe('')
})

afterAll(async () => {
  await new Promise<void>((done) => otherMachines.close(() => done()))
  await app.close()
  await realTool.close()
  await new Promise<void>((done) => stand.close(() => done()))
  t.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe("the mail tool's settings, changed through the office", () => {
  it('1: refuses a change from an unpaired browser at each door, and the tool hears nothing', async () => {
    where.page = theStandIn()
    heard.length = 0
    standAnswers.body = null
    const before = everyRow()
    const unpaired: [string, Record<string, string>][] = [
      ['no key', theOtherComputer(null)],
      ['a key that proves nobody', theOtherComputer('a-key-that-proves-nobody-0000000000000000000000000000000000000000')],
      ['a device asked and not confirmed', theOtherComputer(unconfirmedKey)],
      ["the person's name and no key", { ...THE_PERSON_HERE }],
    ]
    for (const door of Object.keys(DOORS) as Door[]) {
      for (const [who, headers] of unpaired) {
        const refused = await press(anotherMachine, door, headers)
        expect(refused.status, `${door}, ${who}: ${refused.text.slice(0, 200)}`).toBe(403)
        expect(refused.text, `${door}, ${who}`).not.toContain(A)
      }
    }
    // ON THIS COMPUTER, AN AGENT, by name and by its own key: the doors are the person's. The keyed agent is proved, so
    // it reaches the person's guard, and the guard is what refuses it.
    const agents: [string, Record<string, string>][] = [
      ['an agent by name', { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-made-up-agent' }],
      ['an agent with its own key', { 'x-mole-office-workspace': 'default', 'x-mole-office-key': agentKey }],
    ]
    for (const door of Object.keys(DOORS) as Door[]) {
      for (const [who, headers] of agents) {
        const agent = await press(thisMachine, door, headers)
        expect(agent.status, `${door}, ${who} here: ${agent.text.slice(0, 200)}`).toBe(403)
      }
    }
    expect(heard).toEqual([])
    expect(actsSince(before)).toEqual([])

    // THE SAME PRESS FROM THE PAIRED DEVICE REACHES THE TOOL, so what refused the others is who they are.
    const paired = await press(anotherMachine, 'test', theOtherComputer(deviceKey))
    expect(paired.status, paired.text.slice(0, 300)).toBe(200)
    expect(heard.map((one) => `${one.method} ${one.url}`)).toEqual(['POST /test'])
  })

  it("2: passes each press of the paired device on to the tool, answers as the tool did, and writes each act down as the person's", async () => {
    where.page = theRealTool()
    standAnswers.body = null
    expect(theToolsList()).toEqual([])
    const before = everyRow()

    // A TEST LETTER TO AN EMPTY LIST: the real tool says so, and mails nothing.
    const tested = await press(anotherMachine, 'test', theOtherComputer(deviceKey))
    expect(tested.status, tested.text.slice(0, 300)).toBe(200)
    expect(tested.body.answered).toBe(true)
    expect(tested.body.answer.done).toEqual({ tested: true })
    expect(tested.body.answer.state.lastTest.outcome).toBe('empty list')

    // THE LIST, SAVED INTO THE REAL TOOL'S FOLDER.
    const saved = await press(anotherMachine, 'addresses', theOtherComputer(deviceKey), [A, '', B].join('\n'))
    expect(saved.status, saved.text.slice(0, 300)).toBe(200)
    expect(saved.body.answered).toBe(true)
    expect(saved.body.answer.done).toEqual({ saved: true, addresses: [A, B] })
    expect(saved.body.answer.state.addresses).toEqual([A, B])
    expect(theToolsList()).toEqual([A, B])
    expect(saved.text).not.toContain(SECRET)
    // AS THE TOOL GAVE IT: the tool's own state, asked here directly on this computer, is the state passed on.
    const itsOwn = await fetch(`http://127.0.0.1:${String(realTool.port)}/state`, { headers: { [THE_SECRET_HEADER]: SECRET } })
    expect(saved.body.answer.state).toEqual(await itsOwn.json())

    // A LIST THE TOOL REFUSED: passed on as the tool refused it, and nothing changed, so nothing is written down.
    const wrong = await press(anotherMachine, 'addresses', theOtherComputer(deviceKey), `${A}\nnot an address`)
    expect(wrong.status, wrong.text.slice(0, 300)).toBe(200)
    expect(wrong.body.answered).toBe(true)
    expect(wrong.body.answer.done).toEqual({ saved: false, reason: 'not an address', which: 'not an address' })
    expect(theToolsList()).toEqual([A, B])

    // THE ACCOUNT, PICKED: the stand-in answers as the tool does for an account it can send from.
    where.page = theStandIn()
    heard.length = 0
    const picked = await press(anotherMachine, 'account', theOtherComputer(deviceKey))
    expect(picked.status, picked.text.slice(0, 300)).toBe(200)
    expect(picked.body.answered).toBe(true)
    expect(picked.body.answer).toEqual(asTheToolAnswers('/account'))

    // ON THE OFFICE'S COMPUTER, THE SAME PRESS.
    const here = await press(thisMachine, 'account', THE_PERSON_HERE)
    expect(here.status, here.text.slice(0, 300)).toBe(200)
    expect(here.body.answered).toBe(true)
    expect(here.body.answer).toEqual(asTheToolAnswers('/account'))
    expect(heard.map((one) => `${one.method} ${one.url}`)).toEqual(['POST /account', 'POST /account'])

    // EACH ACT THE TOOL SAID IT DID, WRITTEN DOWN ONCE AS THE PERSON'S, and the refused list not at all.
    const acts = actsSince(before)
    expect(acts.length).toBe(4)
    for (const act of acts) {
      expect(String(act[changes.recordId.name]).startsWith(aSettingOnTheLedger)).toBe(true)
      expect(act[changes.actorType.name]).toBe('human')
      expect(act[changes.actorId.name]).toBe(THE_TEST_OFFICES_OWNER.id)
      expect(act[changes.oldValue.name]).toBeNull()
    }
    // ONE SETTING, AND ONE ROW FOR EACH KIND OF PRESS: the two picks read the same, the test and the save each their own.
    expect(new Set(acts.map((act) => act[changes.recordId.name])).size).toBe(1)
    expect(new Set(acts.map((act) => `${String(act[changes.field.name])} ${String(act[changes.newValue.name])}`)).size).toBe(3)
    // FROM THE PAIRED DEVICE THE ROW SAYS A KEY PROVED THE PERSON; ON THIS COMPUTER IT DOES NOT.
    expect(acts.slice(0, 3).every((act) => act[changes.provedBy.name] !== null)).toBe(true)
    expect(acts[3]![changes.provedBy.name]).toBeNull()
    const written = JSON.stringify(acts)
    for (const kept of [A, B, SENDER, ACCOUNT, SECRET, 'not an address', 'Google']) expect(written, kept).not.toContain(kept)
  })

  it('3: asks the tool only at its one door for the press, with the one field rebuilt, whatever else the request names', async () => {
    where.page = theStandIn()
    standAnswers.body = null
    heard.length = 0
    const before = everyRow()
    const named: { method: string; path: string; body?: unknown }[] = []
    for (const door of Object.keys(DOORS) as Door[]) {
      const path = DOORS[door]
      const body = theBodyOf(door)
      named.push(
        { method: 'POST', path: `${path}?port=1`, body },
        { method: 'POST', path: `${path}?path=%2Fstate`, body },
        { method: 'POST', path: `${path}?url=${encodeURIComponent('http://127.0.0.1:9/addresses')}`, body },
        { method: 'POST', path: `${path}/state`, body },
        { method: 'POST', path, body: { ...(body ?? {}), path: '/addresses' } },
        { method: 'POST', path, body: { ...(body ?? {}), host: 'somewhere.example' } },
        { method: 'GET', path },
      )
    }
    named.push(
      { method: 'POST', path: DOORS.addresses, body: { addresses: [A, B] } },
      { method: 'POST', path: DOORS.addresses, body: {} },
      { method: 'POST', path: DOORS.addresses, body: { addresses: A.repeat(1_000) } },
      { method: 'POST', path: DOORS.account, body: { id: 7 } },
      { method: 'POST', path: DOORS.account, body: { id: '' } },
      { method: 'POST', path: DOORS.test, body: { addresses: A } },
      { method: 'POST', path: DOORS.test, body: 'not json' },
    )
    for (const one of named) {
      const refused = await ask(anotherMachine, one.method, one.path, theOtherComputer(deviceKey), one.body)
      expect(refused.status, `${one.method} ${one.path} ${JSON.stringify(one.body ?? null).slice(0, 80)}: ${refused.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400)
    }
    expect(heard).toEqual([])

    // EACH PRESS: one POST at the tool's own door, with the secret, the one field and nothing else of the request.
    const extra = { 'x-forwarded-host': 'somewhere.example', cookie: 'a=b' }
    for (const door of Object.keys(DOORS) as Door[]) {
      const answered = await ask(anotherMachine, 'POST', DOORS[door], { ...theOtherComputer(deviceKey), ...extra }, theBodyOf(door))
      expect(answered.status, `${door}: ${answered.text.slice(0, 300)}`).toBe(200)
    }
    expect(heard.map((one) => `${one.method} ${one.url}`)).toEqual(['POST /addresses', 'POST /account', 'POST /test'])
    expect(heard.map((one) => JSON.parse(one.body) as unknown)).toEqual([{ addresses: [A, B].join('\n') }, { id: ACCOUNT }, {}])
    for (const one of heard) {
      expect(one.headers[THE_SECRET_HEADER]).toBe(SECRET)
      expect(one.headers['host']).toBe(`127.0.0.1:${String((stand.address() as AddressInfo).port)}`)
      for (const header of ['origin', 'cookie', 'x-forwarded-host', 'x-mole-office-key', 'x-mole-office-actor-id']) expect(one.headers[header], header).toBeUndefined()
    }
    expect(actsSince(before).length).toBe(3)

    // NO ADDRESS KNOWN: the reply says so, nothing is asked and nothing is written down.
    heard.length = 0
    where.page = null
    const between = everyRow()
    for (const door of Object.keys(DOORS) as Door[]) {
      const none = await press(anotherMachine, door, theOtherComputer(deviceKey))
      expect(none.status, none.text.slice(0, 300)).toBe(200)
      expect(none.body).toMatchObject({ answered: false, because: 'no address' })
    }
    expect(heard).toEqual([])

    // THE TOOL REFUSES: the reply says so with the tool's status, and nothing is written down.
    where.page = theStandIn()
    standAnswers.status = 403
    standAnswers.body = { refused: 'secret', says: 'A stand-in refusal.' }
    try {
      for (const door of Object.keys(DOORS) as Door[]) {
        const refused = await press(anotherMachine, door, theOtherComputer(deviceKey))
        expect(refused.status, refused.text.slice(0, 300)).toBe(200)
        expect(refused.body).toMatchObject({ answered: false, because: 'refused', status: 403 })
        expect(refused.text).not.toContain(SECRET)
      }
    } finally {
      standAnswers.status = 200
      standAnswers.body = null
    }
    expect(actsSince(between)).toEqual([])
  })

  it('4: keeps nothing but the act: only the count every request makes and one change row an act move, and no row holds an address', async () => {
    where.page = theStandIn()
    standAnswers.body = null
    const before = everyRow()
    for (const door of Object.keys(DOORS) as Door[]) {
      const there = await press(anotherMachine, door, theOtherComputer(deviceKey))
      expect(there.status, there.text.slice(0, 300)).toBe(200)
      expect(there.body.answered).toBe(true)
    }
    const here = await press(thisMachine, 'addresses', THE_PERSON_HERE)
    expect(here.status, here.text.slice(0, 300)).toBe(200)
    const after = everyRow()

    // THE COUNT EVERY REQUEST MAKES, at any door, which no answer reaches: a row of api_calls for each request, the
    // keyless claims counted on this computer, and the device key's last use. AND THE ACT, one change row each. Every
    // other table reads the same.
    const calls = getTableName(apiCalls)
    const acts = getTableName(changes)
    const moved: Record<string, string[]> = { [getTableName(headerOnlyCalls)]: [headerOnlyCalls.lastSeen.name, headerOnlyCalls.calls.name], [getTableName(heldKeys)]: [heldKeys.lastUsedAt.name] }
    for (const name of Object.keys(after)) {
      if (name === calls || name === acts) continue
      const without = (rows: unknown[]) => rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([column]) => !(moved[name] ?? []).includes(column))))
      expect(without(after[name]!), name).toEqual(without(before[name]!))
    }
    expect(newRows(before, after, calls).map((row) => `${String(row[apiCalls.method.name])} ${String(row[apiCalls.route.name])} ${String(row[apiCalls.status.name])}`)).toEqual([
      `POST ${DOORS.addresses} 200`,
      `POST ${DOORS.account} 200`,
      `POST ${DOORS.test} 200`,
      `POST ${DOORS.addresses} 200`,
    ])
    expect(after[calls]!.length).toBe(before[calls]!.length + 4)
    expect(after[acts]!.length).toBe(before[acts]!.length + 4)
    expect(after[acts]!.slice(0, before[acts]!.length)).toEqual(before[acts])

    const stored = JSON.stringify(after)
    for (const kept of [A, B, SENDER, ACCOUNT, SECRET]) expect(stored, kept).not.toContain(kept)
  })

  it("5: the request log holds each door's line and no address, whether typed into the query or into a field the door refused", async () => {
    where.page = theStandIn()
    standAnswers.body = null
    logs.length = 0
    for (const door of Object.keys(DOORS) as Door[]) {
      const pressed = await press(anotherMachine, door, theOtherComputer(deviceKey))
      expect(pressed.status, pressed.text.slice(0, 300)).toBe(200)
      const typed = await ask(anotherMachine, 'POST', `${DOORS[door]}?${TYPED}`, theOtherComputer(deviceKey), theBodyOf(door))
      expect(typed.status, typed.text.slice(0, 300)).toBe(400)
      const field = await ask(anotherMachine, 'POST', DOORS[door], theOtherComputer(deviceKey), { ...(theBodyOf(door) ?? {}), [TYPED]: TYPED })
      expect(field.status, field.text.slice(0, 300)).toBe(400)
    }
    // THE LINES ARE WRITTEN when the reply is finished, which a fetch can see before the logger has run.
    await vi.waitFor(() => {
      for (const path of Object.values(DOORS)) expect(logs.join('')).toContain(`POST ${path}?[private] 400`)
    })
    const written = logs.join('')
    for (const path of Object.values(DOORS)) expect(written).toContain(`POST ${path} 200`)
    for (const private_ of [A, B, SENDER, ACCOUNT, TYPED, SECRET]) expect(written, private_).not.toContain(private_)
  })
})
