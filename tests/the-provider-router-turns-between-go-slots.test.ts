// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER TURNS BETWEEN THE OPENCODE GO SUBSCRIPTIONS, AND MOVES A REQUEST OFF ONE THAT HIT ITS LIMIT. Item 12
 * of the key layer (step 3), on two decisions: the Go subscriptions are used in turn,
 * each run takes the next subscription's key when it starts, and a key refused for its usage limit hands the run to the
 * next one.
 *
 * OLD: the router carried DeepSeek only, always through the provider's first slot, and passed back whatever the
 * provider answered.
 * NEW: the router carries OpenCode Go as well. Each Go run takes the next Go slot in turn at its first request, and keeps
 * it. When Go answers 429 with GoUsageLimitError, the router reads the whole refusal before it writes a byte back, marks
 * the slot used up until the reset the refusal names (retry-after, in seconds) or for Go's five-hour window when it names
 * none, keeps a receipt for that attempt, and sends the same request through the next slot that is not used up. A slot
 * that is used up is not tried again before its reset. When every Go slot is used up, the run is refused with 429, a
 * retry-after of the earliest reset, and one sentence that names that slot and its reset and says the run is not handed
 * to dsh. A Go request is paid by a subscription: its receipt has no price, and nothing is charged against the run's cap.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, listening on 127.0.0.1, with the
 * setting on only in this process. The router, the bridge and their sockets are the shipped ones. Go is a stand-in on
 * 127.0.0.1 that answers each key as the case sets it: a streamed answer, 429 with GoUsageLimitError and a retry-after,
 * or another 429. Every key is made up, and nothing reaches a real provider. The router's clock is a number the cases
 * move, so no case waits for a reset.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the router passes Go's limit back instead of moving the request: the move case goes red on the status.
 *   - the router forgets a slot it marked used up: the before-the-reset case goes red on the keys the stand-in saw.
 *   - the router answers the latest reset, or the first slot's: the all-used-up case goes red on retry-after.
 *   - every run takes the first slot: the in-turn case goes red on the keys.
 *   - the control socket answers the first slot's reset, or leaves a slot out of its sentence: the slots case goes red
 *     on the sentence.
 *
 * SINCE ITEM 25 the router's control socket also answers GET /slots: each slot by its id and label, whether it is used
 * up and until when, and, when every Go slot is used up, the start of the very sentence the run's refusal gives. The
 * launcher asks it before a run on Go is filed, and starts the run on dsh instead, as decided.
 * No key is in that answer.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CastingSelection } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import { clockStamp } from '../src/shared/time.ts'
import { aSecretsMark, readTheKeySlots, theKeySlotsFile, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { A_GO_LIMIT_WITH_NO_RESET_MS } from '../src/config/stopped-run-cause.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const WORKER = 'go-turn-worker'
const made = randomUUID()
const GO_MODEL = `made-up-go-model-${made}`
const OFFICE_MODEL = `opencode-go/${GO_MODEL}`
/** The made-up moment the router's clock starts at. */
const START = Date.UTC(2026, 9, 30, 12, 0, 0)

/** What the stand-in Go streams back for one request it serves, byte for byte. */
const STREAMED = [
  'data: {"id":"made-up","choices":[{"index":0,"delta":{"content":"A made-up "}}]}\n\n',
  'data: {"id":"made-up","choices":[{"index":0,"delta":{"content":"answer."}}]}\n\n',
  'data: {"id":"made-up","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}\n\n',
  'data: [DONE]\n\n',
]
/** Go's refusal for its usage limit, in the shape OpenCode reads it: the body names GoUsageLimitError. */
const GO_LIMIT = JSON.stringify({ type: 'error', error: { type: 'GoUsageLimitError', message: 'A made-up usage limit. It will reset in 2 hours.' } })
/** A 429 that is not Go's usage limit. */
const ANOTHER_429 = JSON.stringify({ error: { type: 'made_up_rate_limit', message: 'A made-up rate limit.' } })

type Slot = { id: string; provider: string; label: string; key: string }
/** How the stand-in answers a key: a streamed answer, Go's limit with a retry-after (or none), or another 429. */
type Answer = 'stream' | 'another-429' | { limit: string | null }

let t: TestDb
let app: FastifyInstance
let office = ''
let folder = ''
let selection: CastingSelection
let clock = START
const before: Record<string, string | undefined> = {}
const logs: string[] = []
const answers = new Map<string, Answer>()
/** The key and body of each request the stand-in was sent. */
const upstream: { key: string; body: Record<string, unknown> }[] = []
let provider: Server
const closing: { close(): unknown }[] = []

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
const refuse = (sentence: string): never => { throw new Error(sentence) }

/** Three made-up Go slots of a case's own, so no case reads another's keys. */
function goSlots(tag: string, count = 3): Slot[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `go-${String(at + 1)}`, provider: 'opencode-go', label: `Made-up Go ${String(at + 1)}`, key: `not-a-real-go-key-${tag}-${String(at + 1)}-${randomBytes(4).toString('hex')}`,
  }))
}
/** The ids of the slots, among these, whose keys the stand-in was sent from the given request on. */
function slotsSeen(slots: Slot[], from: number): string[] {
  return upstream.slice(from).map((one) => slots.find((slot) => slot.key === one.key)?.id ?? 'a key of no slot here')
}

/** A router of a case's own, with its bridge, carrying OpenCode Go to the stand-in. Answers the bridge's base URL. */
async function aRouter(name: string, slots: Slot[] | (() => Slot[])): Promise<string> {
  const sandboxes = join(folder, name)
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  const router = createProviderRouter({
    sandboxes, slots, office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! },
    upstreams: { 'opencode-go': `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}` },
    log: (line: string) => logs.push(line), now: () => clock,
  })
  closing.push(router)
  await router.start()
  await router.open('a')
  const env: NodeJS.ProcessEnv = { OPENCODE_API_KEY: `mrt_${randomBytes(32).toString('base64url')}` }
  const bridge = await openTheBridge(JSON.stringify({ provider: 'opencode-go', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse)
  closing.unshift(bridge!)
  return bridge!.baseUrl
}

/** A running OpenCode run on Go for the worker, filed as the launcher files one, and its credential from the row. */
async function aGoRun(): Promise<{ run: string; token: string }> {
  const filed = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: an OpenCode run on Go that the router carries', data: {
    runtime: 'opencode', model: OFFICE_MODEL, servingAgent: WORKER, state: 'running',
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  const run = (filed.json() as { record: { id: string } }).record.id
  const issued = await call('POST', '/api/provider-router/run-tokens', AS_THE_PERSON, { run, casting: { id: selection.casting!.id, revision: selection.casting!.revision } })
  expect(issued.statusCode, issued.body).toBe(201)
  return { run, token: (issued.json() as { token: string }).token }
}

/** One chat request through a bridge, as OpenCode sends one to its opencode-go provider. */
async function ask(baseUrl: string, token: string): Promise<{ status: number; text: string; retryAfter: string | null }> {
  const reply = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: GO_MODEL, stream: true, messages: [{ role: 'user', content: 'A made-up question.' }] }),
  })
  return { status: reply.status, text: await reply.text(), retryAfter: reply.headers.get('retry-after') }
}
/** What the router's control socket answers to GET /slots, for the router of a case's own. */
function theSlotsTheRouterHolds(name: string): Promise<{ status: number; text: string }> {
  return new Promise((done, failed) => {
    const asked = request({ socketPath: theRouterControlSocket(join(folder, name)), method: 'GET', path: '/slots' }, (answer) => {
      const parts: Buffer[] = []
      answer.on('data', (c: Buffer) => parts.push(c))
      answer.on('end', () => done({ status: answer.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }))
    })
    asked.on('error', failed)
    asked.end()
  })
}
type SlotsRead = { slots: { id: string; label: string; usedUpUntil: string | null; resetFrom: string | null }[]; everyUsedUp: boolean; says: string | null }
async function receiptsOf(run: string) {
  const reply = await call('GET', `/api/provider-router/receipts?run=${run}`, AS_THE_PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as {
    spent: number
    receipts: { slot: string; status: number; model: string; inputTokens: number | null; outputTokens: number | null; priceUsd: number | null; priceSays: string | null }[]
  }
}

beforeAll(async () => {
  for (const name of ['MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) before[name] = process.env[name]
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = '0.15'
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  office = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const registered = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'opencode', workArea: ['src'] })
  expect(registered.statusCode, registered.body).toBe(201)
  // NO PRICE TABLE IS SET: a Go request is paid by a subscription, so the office prices none and needs no table to issue.
  const row = await call('POST', `/api/casting/${THE_WORKER}`, AS_THE_PERSON, {
    program: { value: 'opencode' }, model: { value: OFFICE_MODEL }, effort: { value: 'high' }, native: { model: GO_MODEL, provider: 'opencode-go', variant: null },
  })
  expect(row.statusCode, row.body).toBe(201)
  const read = await call('GET', `/api/casting/rows/${String((row.json() as { casting: { id: number } }).casting.id)}/selection`, AS_THE_PERSON)
  selection = (read.json() as { selection: CastingSelection }).selection

  provider = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => parts.push(c))
    req.on('end', () => {
      const key = (req.headers.authorization ?? '').replace(/^Bearer /u, '')
      upstream.push({ key, body: JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown> })
      const answer = answers.get(key) ?? 'stream'
      if (answer === 'stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const chunk of STREAMED) res.write(chunk)
        res.end()
      } else if (answer === 'another-429') {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '5' }).end(ANOTHER_429)
      } else {
        res.writeHead(429, { 'content-type': 'application/json', ...(answer.limit === null ? {} : { 'retry-after': answer.limit }) }).end(GO_LIMIT)
      }
    })
  })
  await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done))
  // A unix socket's path holds at most 108 bytes on Linux: one of 108 is made at its name, one of 109 under a name cut
  // short. The router's control socket sits 35 bytes under a case's folder, and the test folder's usual name is 39 bytes
  // long, so from a TMPDIR over 26 characters the path did not fit. A short one is made here, which fits from a TMPDIR of
  // up to 55 characters.
  // It is not in the list the process-end sweep reads, so a process that dies before afterAll leaves it in TMPDIR.
  folder = mkdtempSync(join(tmpdir(), 'gs-'))
}, 60_000)
afterAll(async () => {
  for (const one of closing) await one.close()
  await new Promise((done) => provider?.close(done))
  await app?.close()
  t?.close()
  if (folder !== '') removeThisTestFolder(folder)
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
})

describe('the turn', () => {
  // MUTATION: every run takes the first Go slot.
  it("gives each run the next Go slot's key at its first request, keeps the run on it, and prices nothing", async () => {
    clock = START
    const slots = goSlots('turn')
    const bridge = await aRouter('turn', slots)
    const runs = [await aGoRun(), await aGoRun(), await aGoRun(), await aGoRun()]
    const from = upstream.length
    for (const one of runs) expect((await ask(bridge, one.token)).status).toBe(200)
    expect((await ask(bridge, runs[1]!.token)).status).toBe(200)
    expect(slotsSeen(slots, from)).toEqual(['go-1', 'go-2', 'go-3', 'go-1', 'go-2'])
    const read = await receiptsOf(runs[1]!.run)
    expect(read.receipts).toEqual([
      expect.objectContaining({ slot: 'go-2', status: 200, model: GO_MODEL, inputTokens: 100, outputTokens: 20, priceUsd: null }),
      expect.objectContaining({ slot: 'go-2', status: 200, priceUsd: null }),
    ])
    expect(read.receipts[0]!.priceSays).toMatch(/subscription/)
    expect(read.spent).toBe(0)
  })
})

describe("Go's usage limit", () => {
  // MUTATION: the router passes Go's limit back instead of moving the request.
  it('moves the same request from Go 1 to Go 2 before any byte reaches the harness, and keeps a receipt for each try', async () => {
    clock = START
    const slots = goSlots('move')
    answers.set(slots[0]!.key, { limit: '600' })
    const bridge = await aRouter('move', slots)
    const { run, token } = await aGoRun()
    const from = upstream.length
    const answered = await ask(bridge, token)
    expect(answered.status, answered.text).toBe(200)
    expect(answered.text).toBe(STREAMED.join(''))
    expect(answered.text).not.toContain('GoUsageLimitError')
    expect(slotsSeen(slots, from)).toEqual(['go-1', 'go-2'])
    expect(upstream[from + 1]!.body).toEqual(upstream[from]!.body)
    const read = await receiptsOf(run)
    expect(read.receipts).toEqual([
      expect.objectContaining({ slot: 'go-1', status: 429, model: GO_MODEL, priceUsd: null }),
      expect.objectContaining({ slot: 'go-2', status: 200, model: GO_MODEL, priceUsd: null }),
    ])
    const said = logs.join('\n')
    expect(said).toContain(`go-1 ${aSecretsMark(slots[0]!.key)}`)
    for (const one of slots) expect(said).not.toContain(one.key)
  })

  // MUTATION: the router forgets a slot it marked used up.
  it('does not try a used-up slot again before its reset, and tries it again from its reset on', async () => {
    clock = START
    const slots = goSlots('reset')
    answers.set(slots[0]!.key, { limit: '600' })
    const bridge = await aRouter('reset', slots)
    const first = await aGoRun()
    expect((await ask(bridge, first.token)).status).toBe(200)
    // One second before the reset: three new runs, which between them take every turn, and the first run again.
    clock = START + 599_000
    let from = upstream.length
    for (let i = 0; i < 3; i++) expect((await ask(bridge, (await aGoRun()).token)).status).toBe(200)
    expect((await ask(bridge, first.token)).status).toBe(200)
    expect(slotsSeen(slots, from)).not.toContain('go-1')
    expect(slotsSeen(slots, from).at(-1)).toBe('go-2')
    // From the reset on, Go 1 takes its turn again.
    answers.set(slots[0]!.key, 'stream')
    clock = START + 600_000
    from = upstream.length
    for (let i = 0; i < 3; i++) expect((await ask(bridge, (await aGoRun()).token)).status).toBe(200)
    expect(slotsSeen(slots, from)).toContain('go-1')
  })

  // MUTATION: the router answers the latest reset, or the first slot's.
  it('with every slot used up, refuses with the earliest reset in one sentence that names its slot, and sends nothing more before it', async () => {
    clock = START
    const slots = goSlots('all')
    answers.set(slots[0]!.key, { limit: '7200' })
    answers.set(slots[1]!.key, { limit: '1800' })
    answers.set(slots[2]!.key, { limit: null })
    const bridge = await aRouter('all', slots)
    const { run, token } = await aGoRun()
    let from = upstream.length
    const refused = await ask(bridge, token)
    expect(refused.status).toBe(429)
    expect(refused.retryAfter).toBe('1800')
    expect(slotsSeen(slots, from)).toEqual(['go-1', 'go-2', 'go-3'])
    const error = (JSON.parse(refused.text) as { error: { type: string; code: string; message: string } }).error
    expect(error.type).toBe('GoUsageLimitError')
    expect(error.code).toBe('every-go-slot-used-up')
    expect(error.message).toContain('Made-up Go 2')
    expect(error.message).toContain(clockStamp(() => new Date(START + 1_800_000)).instant)
    expect(error.message).toMatch(/dsh/)
    expect(error.message.match(/[.;!?](\s|$)/gu)).toHaveLength(1)
    expect((await receiptsOf(run)).receipts.map((one) => [one.slot, one.status])).toEqual([['go-1', 429], ['go-2', 429], ['go-3', 429]])
    // A minute on, nothing is sent: the run is told the same reset, a minute nearer.
    clock = START + 60_000
    from = upstream.length
    const again = await ask(bridge, token)
    expect(again.status).toBe(429)
    expect(again.retryAfter).toBe('1740')
    expect(upstream.length).toBe(from)
    // At Go 2's reset, the run is carried through it.
    answers.set(slots[1]!.key, 'stream')
    clock = START + 1_800_000
    from = upstream.length
    expect((await ask(bridge, token)).status).toBe(200)
    expect(slotsSeen(slots, from)).toEqual(['go-2'])
  })

  it("says an assumed reset is assumed, and counts Go's five-hour window when the limit named no reset", async () => {
    clock = START
    const slots = goSlots('assumed', 1)
    answers.set(slots[0]!.key, { limit: null })
    const bridge = await aRouter('assumed', slots)
    const refused = await ask(bridge, (await aGoRun()).token)
    expect(refused.status).toBe(429)
    expect(refused.retryAfter).toBe(String(A_GO_LIMIT_WITH_NO_RESET_MS / 1000))
    expect((JSON.parse(refused.text) as { error: { message: string } }).error.message).toMatch(/assumed/)
  })

  it('passes back a 429 that is not the usage limit as it came, and does not mark the slot used up', async () => {
    clock = START
    const slots = goSlots('other')
    answers.set(slots[0]!.key, 'another-429')
    const bridge = await aRouter('other', slots)
    const { token } = await aGoRun()
    const from = upstream.length
    const passed = await ask(bridge, token)
    expect(passed.status).toBe(429)
    expect(passed.text).toBe(ANOTHER_429)
    answers.set(slots[0]!.key, 'stream')
    expect((await ask(bridge, token)).status).toBe(200)
    expect(slotsSeen(slots, from)).toEqual(['go-1', 'go-1'])
  })
})

describe('the control socket', () => {
  // MUTATION: the control socket answers the first slot's reset, or leaves a slot out of its sentence.
  it("answers which Go slots are used up and until when, in the refusal's own words, and no key", async () => {
    clock = START
    const slots = goSlots('slots')
    answers.set(slots[0]!.key, { limit: '7200' })
    answers.set(slots[1]!.key, { limit: '1800' })
    answers.set(slots[2]!.key, { limit: null })
    const bridge = await aRouter('slots', slots)
    let read = await theSlotsTheRouterHolds('slots')
    expect(read.status, read.text).toBe(200)
    expect((JSON.parse(read.text) as { providers: Record<string, SlotsRead> }).providers['opencode-go']).toEqual({
      slots: slots.map((one) => ({ id: one.id, label: one.label, usedUpUntil: null, resetFrom: null })), everyUsedUp: false, says: null,
    })
    const refused = await ask(bridge, (await aGoRun()).token)
    expect(refused.status).toBe(429)
    clock = START + 60_000
    read = await theSlotsTheRouterHolds('slots')
    expect(read.status, read.text).toBe(200)
    const providers = (JSON.parse(read.text) as { providers: Record<string, SlotsRead> }).providers
    const go = providers['opencode-go']!
    expect(go.everyUsedUp).toBe(true)
    expect(go.slots).toEqual([
      { id: 'go-1', label: 'Made-up Go 1', usedUpUntil: clockStamp(() => new Date(START + 7_200_000)).instant, resetFrom: expect.stringMatching(/retry-after: 7200/) },
      { id: 'go-2', label: 'Made-up Go 2', usedUpUntil: clockStamp(() => new Date(START + 1_800_000)).instant, resetFrom: expect.stringMatching(/retry-after: 1800/) },
      { id: 'go-3', label: 'Made-up Go 3', usedUpUntil: clockStamp(() => new Date(START + A_GO_LIMIT_WITH_NO_RESET_MS)).instant, resetFrom: expect.stringMatching(/assumed/) },
    ])
    // EVERY SLOT BY ITS LABEL, AND THE FIRST TO RESET WITH ITS RESET, in the words the run's refusal begins with.
    for (const one of slots) expect(go.says).toContain(one.label)
    expect(go.says).toContain(`the first to reset is Made-up Go 2 at ${clockStamp(() => new Date(START + 1_800_000)).instant}`)
    const message = (JSON.parse(refused.text) as { error: { message: string } }).error.message
    expect(message.startsWith(go.says!), message).toBe(true)
    expect(providers['deepseek']).toEqual({ slots: [], everyUsedUp: false, says: null })
    for (const one of slots) expect(read.text).not.toContain(one.key)
    // At Go 2's reset, not every slot is used up, and nothing is said.
    clock = START + 1_800_000
    const after = (JSON.parse((await theSlotsTheRouterHolds('slots')).text) as { providers: Record<string, SlotsRead> }).providers['opencode-go']!
    expect(after.everyUsedUp).toBe(false)
    expect(after.slots[1]).toEqual({ id: 'go-2', label: 'Made-up Go 2', usedUpUntil: null, resetFrom: null })
    expect(after.says).toBeNull()
  })
})

describe('the slots file', () => {
  it('is read again at each request, so a slot added or removed counts from the next request, and an unsafe file sends nothing', async () => {
    clock = START
    const home = join(folder, 'home')
    mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
    chmodSync(join(home, '.config', 'mole-office'), 0o700)
    const file = theKeySlotsFile(home)
    const slots = goSlots('file', 2)
    const write = (kept: Slot[], mode = 0o600) => { writeFileSync(file, JSON.stringify({ version: 1, slots: kept }), { mode }); chmodSync(file, mode) }
    write([slots[0]!])
    const bridge = await aRouter('file', () => readTheKeySlots(file))
    const first = await aGoRun()
    let from = upstream.length
    expect((await ask(bridge, first.token)).status).toBe(200)
    write([slots[1]!])
    expect((await ask(bridge, (await aGoRun()).token)).status).toBe(200)
    expect((await ask(bridge, first.token)).status).toBe(200)
    expect(slotsSeen(slots, from)).toEqual(['go-1', 'go-2', 'go-2'])
    write([slots[1]!], 0o644)
    from = upstream.length
    const refused = await ask(bridge, first.token)
    expect(refused.status).toBe(503)
    expect(refused.text).toMatch(/0600/)
    for (const one of slots) expect(refused.text).not.toContain(one.key)
    expect(upstream.length).toBe(from)
  })
})

describe('the inspector', () => {
  // Last, as its row stays in force for the rest of the file.
  it('refuses to issue while a Casting row in force for the inspector uses OpenCode Go, naming the row', async () => {
    const row = await call('POST', `/api/casting/${THE_INSPECTOR}`, AS_THE_PERSON, {
      program: { value: 'opencode' }, model: { value: OFFICE_MODEL }, effort: { value: 'high' }, native: { model: GO_MODEL, provider: 'opencode-go', variant: null },
    })
    expect(row.statusCode, row.body).toBe(201)
    const id = (row.json() as { casting: { id: number } }).casting.id
    const filed = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a Go run while the inspector uses Go', data: {
      runtime: 'opencode', model: OFFICE_MODEL, servingAgent: WORKER, state: 'running',
    } })
    const run = (filed.json() as { record: { id: string } }).record.id
    const issued = await call('POST', '/api/provider-router/run-tokens', AS_THE_PERSON, { run, casting: { id: selection.casting!.id, revision: selection.casting!.revision } })
    expect(issued.statusCode, issued.body).toBe(409)
    expect((issued.json() as { error: string }).error).toMatch(new RegExp(`Casting ${String(id)} gives the inspector opencode through opencode-go`))
    expect((issued.json() as { error: string }).error).toMatch(/OpenCode Go key/)
  })
})
