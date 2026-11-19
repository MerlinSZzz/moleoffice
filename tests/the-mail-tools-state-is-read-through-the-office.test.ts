// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S SETTINGS ARE READ THROUGH THE OFFICE, FOR THE PERSON ON ANOTHER DEVICE, AND THE OFFICE KEEPS NOTHING.
 * On any device but the host, Settings > Tools showed an error for the summons mail tool, because the tool answers only
 * on 127.0.0.1 of the office's computer. By a decision with two messages, the office on that computer now asks the tool
 * for the person, returns its answer, and keeps
 * nothing. Addresses pass through the office in
 * transit; it still stores none, and the rest of another decision stands. This is the read-only
 * half: GET /api/office/mail-tool/state.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. From the product's second listener, with a paired device's key, the person reads the tool's own state as the
 *      tool gave it, with the list of addresses the tool keeps. Anybody else there is refused, and so is a request that
 *      comes with no key.
 *   2. The office asks the tool only at the address the office already knows, and only GET /state. A query, a further
 *      path or a body that names a host, a port, a path or an address is refused, and the tool hears nothing. When the
 *      office knows no address, or the tool does not answer, the reply says so and the tool is asked nothing else.
 *   3. It keeps nothing: every row of every table reads the same before and after, but for the count every request
 *      makes at any door (a row of api_calls naming the door and its status, and the last use of the key or the claim),
 *      and no row holds an address or the tool's secret.
 *   4. The request log holds no address: the door's line is written, and neither an address in the tool's answer nor
 *      one typed into the query is in any line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * A scratch office in process (`freshDb` and `buildApp`, with its log written into this file's own list), never the
 * live office. In cases 1, 3 and 4 the tool is real: tools/mail-the-summonses.mjs in a folder of this test's own,
 * answering on a port of its own; its accounts reader is a program that is not there, so it reads no account of this
 * computer. In case 2 a recording server stands in for the tool, so the test can see every request it was sent.
 *
 * WHERE THE TOOL ANSWERS IS STOOD IN FOR, in `theMailToolAsItStands` alone: the office never gives a test world the
 * tool's page, so no test can reach the person's real tool. Every address here is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/api/summons.ts: the widening for the person taken off the door. Case 1 goes red.
 *   2. src/server/lib/the-mail-tool-through-the-office.ts: the tool asked at the path the request named. Case 2 goes red.
 *   3. src/server/lib/the-mail-tool-through-the-office.ts: the tool's answer kept in a row. Case 3 goes red.
 *   4. src/config/private-sandbox-login.mjs: the door left out of the private addresses of the log. Case 4 goes red.
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
import { apiCalls, headerOnlyCalls, heldKeys } from '../src/server/db/schema.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { makeTheFolder, makeTheTool, saveTheAddresses, serveTheDoors, THE_SECRET_HEADER } from '../tools/mail-the-summonses.mjs'

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

const THE_DOOR = '/api/office/mail-tool/state'
const A = 'first-relay-reader@example.test'
const B = 'second-relay-reader@example.test'
/** An address typed into the query, which the door refuses and the log must not keep. */
const TYPED = 'typed-into-the-query@example.test'
const SECRET = 'a-made-up-secret-of-the-tools-page-7731'

/** The person's headers on this computer, with no key: the one-version window answers the person here. */
const THE_PERSON_HERE = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** What the browser on the person's other computer sends: a device's key makes it theirs, so the claim says `agent`. */
const theOtherComputer = (key: string | null): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-laptop',
  ...(key === null ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let otherMachines: Server
let thisMachine = ''
let anotherMachine = ''
let deviceKey = ''
let scratch = ''
let realTool: { port: number; close: () => Promise<void> }
let stand: Server
/** Each request the stand-in tool was sent. */
const heard: { method: string; url: string; headers: IncomingHttpHeaders }[] = []
const logs: string[] = []

async function ask(base: string, method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body }) })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, text }
}

const theRealTool = (): string => `http://127.0.0.1:${String(realTool.port)}/?s=${encodeURIComponent(SECRET)}`
const theStandIn = (): string => `http://127.0.0.1:${String((stand.address() as AddressInfo).port)}/?s=${encodeURIComponent(SECRET)}`

/** Every row of every table, by table. */
function everyRow(): Record<string, unknown[]> {
  const tables = t.client.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as { name: string }[]
  return Object.fromEntries(tables.map(({ name }) => [name, t.client.db.all(`SELECT * FROM "${name}"`)]))
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-mail-tool-through-the-office-'))
  const dir = join(scratch, 'tool')
  makeTheFolder(dir)
  saveTheAddresses(dir, [A, B].join('\n'))
  const tool = makeTheTool({ dir, api: 'http://127.0.0.1:9', busctl: join(scratch, 'no-busctl-here'), say: () => undefined })
  realTool = await serveTheDoors(tool, { secret: SECRET, origins: [] })

  stand = createServer((req, res) => {
    heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ addresses: [], standIn: true }))
  })
  await new Promise<void>((done) => stand.listen(0, '127.0.0.1', done))

  t = await freshDb()
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

  // THE PERSON'S OTHER COMPUTER, PAIRED: it asks through the credential flow's own door and the person confirms it on this computer.
  const asked = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, JSON.stringify({ device: 'A made-up laptop' }))
  expect(asked.status, asked.text.slice(0, 300)).toBe(201)
  deviceKey = String(asked.body.token)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${String(asked.body.credential.id)}/confirm`, THE_PERSON_HERE, '{}')
  expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(200)
})

afterAll(async () => {
  await new Promise<void>((done) => otherMachines.close(() => done()))
  await app.close()
  await realTool.close()
  await new Promise<void>((done) => stand.close(() => done()))
  t.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe("the mail tool's state, read through the office", () => {
  it('1: answers the person on another computer with the tool\'s own state, and refuses anybody else there', async () => {
    where.page = theRealTool()
    const read = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(deviceKey))
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    expect(read.body.answered).toBe(true)
    expect(read.body.state.addresses).toEqual([A, B])
    expect(read.text).not.toContain(SECRET)
    // AS THE TOOL GAVE IT: the tool's own answer to its own question, asked here directly on this computer.
    const itsOwn = await fetch(`http://127.0.0.1:${String(realTool.port)}/state`, { headers: { [THE_SECRET_HEADER]: SECRET } })
    expect(itsOwn.status).toBe(200)
    expect(read.body.state).toEqual(await itsOwn.json())

    // THE SAME DOOR ON THIS COMPUTER, for the person at the machine.
    const here = await ask(thisMachine, 'GET', THE_DOOR, THE_PERSON_HERE)
    expect(here.status, here.text.slice(0, 300)).toBe(200)
    expect(here.body.state.addresses).toEqual([A, B])

    // ANYBODY ELSE THERE: a claim with no key, and a key that proves nobody.
    for (const key of [null, 'a-key-that-proves-nobody-0000000000000000000000000000000000000000']) {
      const refused = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(key))
      expect(refused.status, `${String(key)}: ${refused.text.slice(0, 200)}`).toBe(403)
      expect(refused.text).not.toContain(A)
    }
  })

  it('2: asks the tool only GET /state at the address the office knows, whatever the request names', async () => {
    where.page = theStandIn()
    heard.length = 0
    const named = [
      { method: 'GET', path: `${THE_DOOR}?port=1` },
      { method: 'GET', path: `${THE_DOOR}?path=%2Faddresses` },
      { method: 'GET', path: `${THE_DOOR}?host=somewhere.example` },
      { method: 'GET', path: `${THE_DOOR}?url=${encodeURIComponent('http://127.0.0.1:9/addresses')}` },
      { method: 'GET', path: `${THE_DOOR}?${TYPED}` },
      { method: 'GET', path: `${THE_DOOR}/addresses` },
      { method: 'GET', path: `${THE_DOOR}/test` },
      { method: 'POST', path: THE_DOOR, body: JSON.stringify({ path: '/addresses', addresses: TYPED }) },
    ] as const
    for (const one of named) {
      const headers = { ...theOtherComputer(deviceKey), ...('body' in one ? { 'content-type': 'application/json' } : {}) }
      const refused = await ask(anotherMachine, one.method, one.path, headers, 'body' in one ? one.body : undefined)
      expect(refused.status, `${one.method} ${one.path}: ${refused.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400)
    }
    expect(heard).toEqual([])

    // ITS OWN QUESTION: one GET /state, with the secret, and no origin of a page.
    const read = await ask(anotherMachine, 'GET', THE_DOOR, { ...theOtherComputer(deviceKey), 'x-forwarded-host': 'somewhere.example' })
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    expect(read.body.answered).toBe(true)
    expect(read.body.state).toEqual({ addresses: [], standIn: true })
    expect(heard.map((one) => `${one.method} ${one.url}`)).toEqual(['GET /state'])
    expect(heard[0]!.headers[THE_SECRET_HEADER]).toBe(SECRET)
    expect(heard[0]!.headers['origin']).toBeUndefined()
    expect(heard[0]!.headers['host']).toBe(`127.0.0.1:${String((stand.address() as AddressInfo).port)}`)

    // NO ADDRESS KNOWN: the reply says so, and nothing is asked.
    heard.length = 0
    where.page = null
    const none = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(deviceKey))
    expect(none.status, none.text.slice(0, 300)).toBe(200)
    expect(none.body.answered).toBe(false)
    expect(none.body.because).toBe('no address')
    expect(heard).toEqual([])

    // A TOOL THAT DOES NOT ANSWER: a port nothing listens on.
    const closed = createServer()
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((done) => closed.close(() => done()))
    where.page = `http://127.0.0.1:${String(port)}/?s=${encodeURIComponent(SECRET)}`
    const silent = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(deviceKey))
    expect(silent.status, silent.text.slice(0, 300)).toBe(200)
    expect(silent.body.answered).toBe(false)
    expect(silent.body.because).toBe('no answer')
    expect(silent.text).not.toContain(SECRET)
  })

  it('3: keeps nothing: only the count every request makes moves, and no row holds an address', async () => {
    where.page = theRealTool()
    const before = everyRow()
    const there = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(deviceKey))
    expect(there.status, there.text.slice(0, 300)).toBe(200)
    expect(there.body.state.addresses).toEqual([A, B])
    const here = await ask(thisMachine, 'GET', THE_DOOR, THE_PERSON_HERE)
    expect(here.status, here.text.slice(0, 300)).toBe(200)
    const after = everyRow()

    // THE COUNT EVERY REQUEST MAKES, at any door, which no answer reaches: a row of api_calls for each request, the
    // keyless claims counted on this computer, and the device key's last use. Every other table reads the same.
    const calls = getTableName(apiCalls)
    const moved: Record<string, string[]> = { [getTableName(headerOnlyCalls)]: [headerOnlyCalls.lastSeen.name, headerOnlyCalls.calls.name], [getTableName(heldKeys)]: [heldKeys.lastUsedAt.name] }
    for (const name of Object.keys(after)) {
      if (name === calls) continue
      const without = (rows: unknown[]) => rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([column]) => !(moved[name] ?? []).includes(column))))
      expect(without(after[name]!), name).toEqual(without(before[name]!))
    }
    const beforeIds = new Set(before[calls]!.map((row) => (row as Record<string, unknown>)[apiCalls.id.name]))
    const newCalls = after[calls]!.filter((row) => !beforeIds.has((row as Record<string, unknown>)[apiCalls.id.name])) as Record<string, unknown>[]
    expect(newCalls.map((row) => `${String(row[apiCalls.method.name])} ${String(row[apiCalls.route.name])} ${String(row[apiCalls.status.name])}`)).toEqual([`GET ${THE_DOOR} 200`, `GET ${THE_DOOR} 200`])
    expect(after[calls]!.length).toBe(before[calls]!.length + 2)

    const stored = JSON.stringify(after)
    for (const kept of [A, B, SECRET]) expect(stored).not.toContain(kept)
  })

  it('4: the request log holds the door\'s line and no address, whether answered or typed into the query', async () => {
    where.page = theRealTool()
    logs.length = 0
    const read = await ask(anotherMachine, 'GET', THE_DOOR, theOtherComputer(deviceKey))
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    expect(read.body.state.addresses).toEqual([A, B])
    const typed = await ask(anotherMachine, 'GET', `${THE_DOOR}?${TYPED}`, theOtherComputer(deviceKey))
    expect(typed.status, typed.text.slice(0, 300)).toBe(400)
    // THE LINES ARE WRITTEN when the reply is finished, which a fetch can see before the logger has run.
    await vi.waitFor(() => expect(logs.join('')).toContain(`GET ${THE_DOOR}?[private] 400`))
    const written = logs.join('')
    expect(written).toContain(`GET ${THE_DOOR} 200`)
    for (const private_ of [A, B, TYPED, SECRET]) expect(written).not.toContain(private_)
  })
})
