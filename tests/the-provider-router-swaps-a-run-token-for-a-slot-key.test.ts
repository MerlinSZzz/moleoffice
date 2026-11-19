// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER SWAPS A RUN'S CREDENTIAL FOR A SLOT'S KEY, AND SENDS NOTHING UPSTREAM FOR A CREDENTIAL IT REFUSES.
 *
 * OLD: a dsh run held the real DeepSeek key in its env file and sent it to the provider itself.
 * NEW: with MOLE_OFFICE_PROVIDER_ROUTER on, a dsh run holds its run's router credential under DEEPSEEK_API_KEY and
 * sends its requests to a bridge on its own loopback. The bridge carries them to the router's socket for that sandbox.
 * The router asks the office to admit the credential for the request's model (POST /api/provider-router/admissions,
 * with the office's own key), swaps in the key of the first slot for the provider, sends the request on, streams the
 * answer back unchanged, and settles one receipt with the office (POST /api/provider-router/receipts), which prices it
 * from the price table, charges it to the run and keeps it under the slot. A wrong, ended, revoked, expired,
 * other-model or over-cap credential is refused in one sentence, and nothing is sent upstream.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, listening on 127.0.0.1, with
 * the setting on only in this process. The router, the bridge and their sockets are the shipped ones. The provider is
 * a stand-in on 127.0.0.1 that records what it was sent and answers as a streaming chat service does. The key slots
 * file is in a made-up home of this file's own and holds a made-up key. No real key is read and nothing reaches a real
 * provider.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the router passes the run's credential on instead of the slot's key: the swap case goes red on the header.
 *   - the router sends a request before the office admits it: the refusal cases go red on the stand-in's count.
 *   - the office settles a receipt twice: the settle case goes red on the run's spend.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CastingSelection } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { aSecretsMark, readTheKeySlots, theKeySlotsFile, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const WORKER = 'swap-worker'
const made = randomUUID()
const NATIVE = `made-up-deepseek-${made}`
const OFFICE_MODEL = `made-up-office-${made}`
/** A request of 100 input tokens, 40 of them cached, and 20 output tokens costs 0.104 US dollars at these prices. */
const PRICED = { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } }
const ONE_REQUEST_USD = 0.104
const MADE_UP_KEY = `not-a-real-deepseek-key-${randomBytes(6).toString('hex')}`

/** What the stand-in provider streams back for one request, byte for byte. */
const STREAMED = [
  'data: {"id":"made-up","choices":[{"index":0,"delta":{"content":"A made-up "}}]}\n\n',
  'data: {"id":"made-up","choices":[{"index":0,"delta":{"content":"answer."}}]}\n\n',
  'data: {"id":"made-up","choices":[],"usage":{"prompt_tokens":100,"prompt_cache_hit_tokens":40,"prompt_cache_miss_tokens":60,"completion_tokens":20,"total_tokens":120}}\n\n',
  'data: [DONE]\n\n',
]

let t: TestDb
let app: FastifyInstance
let folder = ''
let selection: CastingSelection
const before: Record<string, string | undefined> = {}
const logs: string[] = []
/** What the stand-in provider was sent. */
const upstream: { path: string; authorization: string | undefined; body: Record<string, unknown> }[] = []
let provider: Server
let router: Awaited<ReturnType<typeof createProviderRouter>>
let bridge: NonNullable<Awaited<ReturnType<typeof openTheBridge>>>
const issued: string[] = []

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
const refuse = (sentence: string): never => { throw new Error(sentence) }

/** A running dsh run for the worker, filed as the launcher files one, and its credential from the row. */
async function aRunWithACredential(): Promise<{ run: string; token: string; id: string }> {
  const filed = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run whose requests the router carries', data: {
    runtime: 'dsh', model: OFFICE_MODEL, servingAgent: WORKER, state: 'running',
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  const run = (filed.json() as { record: { id: string } }).record.id
  return { run, ...(await reissue(run)) }
}
async function reissue(run: string): Promise<{ token: string; id: string }> {
  const reply = await call('POST', '/api/provider-router/run-tokens', AS_THE_PERSON, { run, casting: { id: selection.casting!.id, revision: selection.casting!.revision } })
  expect(reply.statusCode, reply.body).toBe(201)
  const { token, id } = reply.json() as { token: string; id: string }
  issued.push(token)
  return { token, id }
}

/** One chat request through the bridge, as dsh sends one with its env file's two lines. */
async function ask(token: string | null, body: Record<string, unknown> = {}): Promise<{ status: number; text: string; type: string | null }> {
  const reply = await fetch(`${bridge.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ model: NATIVE, stream: true, messages: [{ role: 'user', content: 'A made-up question.' }], ...body }),
  })
  return { status: reply.status, text: await reply.text(), type: reply.headers.get('content-type') }
}
async function receiptsOf(run: string) {
  const reply = await call('GET', `/api/provider-router/receipts?run=${run}`, AS_THE_PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as {
    run: string; spent: number; spendCap: number
    receipts: { id: string; slot: string; status: number; model: string; inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; priceUsd: number | null }[]
    slots: { slot: string; requests: number; usd: number; unpriced: number }[]
  }
}

beforeAll(async () => {
  for (const name of ['MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) before[name] = process.env[name]
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = '0.15'
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  const office = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const registered = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'dsh', workArea: ['src'] })
  expect(registered.statusCode, registered.body).toBe(201)
  const prices = await call('POST', '/api/office/price-table', AS_THE_PERSON, { table: PRICED })
  expect(prices.statusCode, prices.body).toBe(200)
  const row = await call('POST', `/api/casting/${THE_WORKER}`, AS_THE_PERSON, {
    program: { value: 'dsh' }, model: { value: OFFICE_MODEL }, effort: { value: 'high' }, native: { model: NATIVE, provider: 'deepseek-official', variant: null },
  })
  expect(row.statusCode, row.body).toBe(201)
  const read = await call('GET', `/api/casting/rows/${String((row.json() as { casting: { id: number } }).casting.id)}/selection`, AS_THE_PERSON)
  selection = (read.json() as { selection: CastingSelection }).selection

  provider = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => parts.push(c))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>
      upstream.push({ path: req.url ?? '', authorization: req.headers.authorization, body })
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const chunk of STREAMED) res.write(chunk)
      res.end()
    })
  })
  await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done))

  // A MADE-UP HOME, never the machine's own: the slots file the router reads, at the modes it requires.
  folder = aTestDatabaseFolder('ps')
  const home = join(folder, 'home')
  mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
  chmodSync(join(home, '.config', 'mole-office'), 0o700)
  writeFileSync(theKeySlotsFile(home), JSON.stringify({ version: 1, slots: [{ id: 'slot-a', provider: 'deepseek', label: 'Made-up slot A', key: MADE_UP_KEY }, { id: 'slot-b', provider: 'deepseek', label: 'Made-up slot B', key: `${MADE_UP_KEY}-b` }] }), { mode: 0o600 })
  const sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  router = createProviderRouter({
    sandboxes, slots: readTheKeySlots(theKeySlotsFile(home)), office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! },
    upstreams: { deepseek: `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}` }, log: (line: string) => logs.push(line),
  })
  await router.start()
  await router.open('a')
  const env: NodeJS.ProcessEnv = {}
  const opened = await openTheBridge(JSON.stringify({ provider: 'deepseek', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse)
  bridge = { ...opened!, baseUrl: env.DEEPSEEK_BASE_URL! } as typeof bridge
}, 60_000)
afterAll(async () => {
  await bridge?.close()
  await router?.close()
  await new Promise((done) => provider?.close(done))
  await app?.close()
  t?.close()
  if (folder !== '') removeThisTestFolder(folder)
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
})

describe('the swap', () => {
  // MUTATION: the router passes the run's credential on instead of the slot's key.
  it("sends the first slot's key and never the credential, streams the answer back unchanged, and keeps one priced receipt under the slot", async () => {
    const { run, token } = await aRunWithACredential()
    const sent = upstream.length
    const answered = await ask(token)
    expect(answered.status, answered.text).toBe(200)
    expect(answered.type).toMatch(/^text\/event-stream/)
    expect(answered.text).toBe(STREAMED.join(''))
    expect(upstream.length).toBe(sent + 1)
    const seen = upstream.at(-1)!
    expect(seen.path).toBe('/chat/completions')
    expect(seen.authorization).toBe(`Bearer ${MADE_UP_KEY}`)
    expect(JSON.stringify(seen)).not.toContain(token)
    expect(seen.body).toMatchObject({ model: NATIVE, stream: true, stream_options: { include_usage: true } })
    const read = await receiptsOf(run)
    expect(read.receipts).toEqual([expect.objectContaining({ slot: 'slot-a', status: 200, model: NATIVE, inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 })])
    expect(read.receipts[0]!.priceUsd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.slots).toEqual([expect.objectContaining({ slot: 'slot-a', requests: 1, unpriced: 0 })])
    expect(read.slots[0]!.usd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spent).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spendCap).toBe(0.15)
  })
})

describe('what the router refuses, sending nothing upstream', () => {
  /** A refusal: its status and code, one sentence, nothing sent upstream and no receipt kept. */
  async function refused(run: string, token: string | null, status: number, code: string, says: RegExp, body: Record<string, unknown> = {}) {
    const sent = upstream.length
    const receipts = (await receiptsOf(run)).receipts.length
    const answered = await ask(token, body)
    expect(answered.status, answered.text).toBe(status)
    const error = (JSON.parse(answered.text) as { error: { message: string; type: string; code: string } }).error
    expect(error).toEqual({ message: expect.stringMatching(says), type: 'mole_office_provider_router', code })
    expect(error.message).toMatch(/^[^.]+\.$/)
    expect(upstream.length).toBe(sent)
    expect((await receiptsOf(run)).receipts.length).toBe(receipts)
  }

  // MUTATION: the router sends a request before the office admits it.
  it('refuses a wrong credential and a request with none', async () => {
    const { run } = await aRunWithACredential()
    await refused(run, `mrt_${randomBytes(32).toString('base64url')}`, 401, 'invalid-token', /not valid/)
    await refused(run, null, 401, 'invalid-token', /not valid/)
    await refused(run, 'not-a-credential', 401, 'invalid-token', /not valid/)
  })

  it('refuses a model the Casting row did not give the run', async () => {
    const { run, token } = await aRunWithACredential()
    await refused(run, token, 403, 'pair-not-allowed', /does not allow this provider and model/, { model: `another-${NATIVE}` })
  })

  it('refuses a credential replaced by a newer one, and one past its expiry', async () => {
    const { run, token, id } = await aRunWithACredential()
    const newer = await reissue(run)
    await refused(run, token, 403, 'revoked-token', /has been revoked/)
    expect(id).not.toBe(newer.id)
    t.client.sqlite.prepare('UPDATE run_tokens SET issued_at = 0, expires_at = 1 WHERE id = ?').run(newer.id)
    await refused(run, newer.token, 403, 'expired-token', /has expired/)
  })

  it('refuses the request after the one that took the run past its cap', async () => {
    const { run, token } = await aRunWithACredential()
    for (let i = 0; i < 2; i++) expect((await ask(token)).status).toBe(200)
    expect((await receiptsOf(run)).spent).toBeCloseTo(2 * ONE_REQUEST_USD, 10)
    await refused(run, token, 403, 'cap-reached', /spending cap/)
  })

  it('refuses the credential of a run that has ended', async () => {
    const { run, token } = await aRunWithACredential()
    const ended = await call('PATCH', `/api/records/${run}`, AS_THE_PERSON, { dataPatch: { state: 'crashed' } })
    expect(ended.statusCode, ended.body).toBe(200)
    await refused(run, token, 403, 'revoked-token', /has been revoked/)
  })
})

describe('the office’s two doors for the router', () => {
  it('admit and settle only for the office’s own key', async () => {
    for (const url of ['/api/provider-router/admissions', '/api/provider-router/receipts']) {
      const reply = await call('POST', url, AS_THE_PERSON, {})
      expect(reply.statusCode, `${url}: ${reply.body}`).toBe(403)
    }
  })

  // MUTATION: the office settles a receipt twice.
  it('settles a receipt once: the same receipt again changes nothing, and another under its id is refused', async () => {
    const { run, token } = await aRunWithACredential()
    const admitted = await call('POST', '/api/provider-router/admissions', theOfficesKeyHeader(), { token, provider: 'deepseek', model: NATIVE })
    expect(admitted.statusCode, admitted.body).toBe(200)
    const admission = admitted.json() as { admitted: boolean; id: string; run: string }
    expect(admission).toMatchObject({ admitted: true, run })
    const receipt = { id: `rr_${randomBytes(18).toString('base64url')}`, token: admission.id, slot: 'slot-a', status: 200, model: NATIVE, usage: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 } }
    for (const expected of [201, 200]) {
      const settled = await call('POST', '/api/provider-router/receipts', theOfficesKeyHeader(), receipt)
      expect(settled.statusCode, settled.body).toBe(expected)
    }
    const other = await call('POST', '/api/provider-router/receipts', theOfficesKeyHeader(), { ...receipt, usage: { ...receipt.usage, outputTokens: 21 } })
    expect(other.statusCode, other.body).toBe(409)
    const read = await receiptsOf(run)
    expect(read.receipts).toHaveLength(1)
    expect(read.spent).toBeCloseTo(ONE_REQUEST_USD, 10)
  })
})

describe('what the router keeps to itself', () => {
  it('answers 502 in one sentence, keeping no receipt and charging nothing, when the provider cannot be reached', async () => {
    const sandboxes = join(folder, 'u')
    mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
    aRouterFolderFor(join(sandboxes, '.run', 'a'))
    const closed = createServer()
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
    const nowhere = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
    await new Promise((done) => closed.close(done))
    const office = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    const lost = createProviderRouter({ sandboxes, slots: [{ id: 'slot-a', provider: 'deepseek', label: 'Made-up slot A', key: MADE_UP_KEY }], office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! }, upstreams: { deepseek: nowhere }, log: (line: string) => logs.push(line) })
    await lost.start()
    await lost.open('a')
    const env: NodeJS.ProcessEnv = {}
    const opened = (await openTheBridge(JSON.stringify({ provider: 'deepseek', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse))!
    try {
      const { run, token } = await aRunWithACredential()
      const reply = await fetch(`${env.DEEPSEEK_BASE_URL!}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ model: NATIVE, stream: true, messages: [] }) })
      expect(reply.status).toBe(502)
      const error = ((await reply.json()) as { error: { message: string; code: string } }).error
      expect(error.code).toBe('provider-unreachable')
      expect(error.message).toMatch(/^[^.]+\.$/)
      const read = await receiptsOf(run)
      expect(read.receipts).toEqual([])
      expect(read.spent).toBe(0)
    } finally {
      await opened.close()
      await lost.close()
    }
  })

  it('answers 503 in one sentence, sending nothing, when it holds no slot for the provider', async () => {
    const sandboxes = join(folder, 'n')
    mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
    aRouterFolderFor(join(sandboxes, '.run', 'a'))
    const empty = createProviderRouter({ sandboxes, slots: [], office: { api: 'http://127.0.0.1:9', key: 'not-a-real-office-key' }, log: (line: string) => logs.push(line) })
    await empty.start()
    await empty.open('a')
    const env: NodeJS.ProcessEnv = {}
    const opened = (await openTheBridge(JSON.stringify({ provider: 'deepseek', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse))!
    try {
      const sent = upstream.length
      const reply = await fetch(`${env.DEEPSEEK_BASE_URL!}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${issued[0]!}` }, body: '{}' })
      expect(reply.status).toBe(503)
      const error = ((await reply.json()) as { error: { message: string; code: string } }).error
      expect(error.code).toBe('no-slot')
      expect(error.message).toMatch(/^[^.]+\.$/)
      expect(upstream.length).toBe(sent)
    } finally {
      await opened.close()
      await empty.close()
    }
  })

  // Conditions 3 and 4.
  it('opens its sockets at mode 0600 in folders of mode 0700, only for a sandbox folder that exists', async () => {
    const sandboxes = join(folder, 's')
    expect(lstatSync(theRouterControlSocket(sandboxes)).mode & 0o777).toBe(0o600)
    expect(lstatSync(join(sandboxes, '.run', '.provider-router')).mode & 0o777).toBe(0o700)
    expect(lstatSync(join(sandboxes, '.run', 'a', 'provider-router', 'router.sock')).mode & 0o777).toBe(0o600)
    expect(lstatSync(join(sandboxes, '.run', 'a', 'provider-router')).mode & 0o777).toBe(0o700)
    await expect(router.open('no-such-sandbox')).rejects.toThrow(/start the sandbox again/)
    await expect(router.open('../a')).rejects.toThrow(/sandbox name/)
  })

  it('names a key only by its sha256 prefix, in its log, its receipts and its answers', async () => {
    expect(issued.length).toBeGreaterThan(0)
    const everything = [logs.join('\n'), JSON.stringify(t.client.sqlite.prepare('SELECT * FROM router_receipts').all())].join('\n')
    expect(logs.length).toBeGreaterThan(0)
    expect(everything).not.toContain(MADE_UP_KEY)
    for (const token of issued) expect(everything).not.toContain(token)
    expect(logs.join('\n')).toContain(aSecretsMark(MADE_UP_KEY))
  })
})
