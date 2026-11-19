// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER CARRIES OPENROUTER, THE FIRST OF THE OTHER API-KEY PROVIDERS, AS ONE WHOLE PROVIDER.
 *
 * OLD: the key layer held DeepSeek and OpenCode Go only, so an OpenRouter model could not go through the router at all.
 * NEW: THE_ROUTED_PROVIDERS names OpenRouter beside them. A run whose token names an OpenRouter provider and model sends
 * its request to the bridge under OPENROUTER_BASE_URL, and the bridge carries it to the router's socket for the sandbox.
 * The office admits the token for that pair, the router swaps it for the made-up key in the host-only key slots file,
 * sends the request to the OpenRouter address, streams the answer back byte for byte, and settles one receipt priced at
 * 0.104 from the price table. A token that names another provider, another model, or no room under its cap is refused
 * in the office's own words, and nothing is sent.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database on 127.0.0.1, with the setting
 * on only in this process. The router, the bridge and their sockets are the shipped ones. The provider is a stand-in on
 * 127.0.0.1 that records what it was sent and streams one fixed answer. The home and the key slots file are this file's
 * own, and every key is made up. No real key is read, no real provider is reached, and no live office is touched.
 *
 * WHY THE TOKEN STORE AND NOT THE OFFICE'S ISSUING DOOR: the office's issuing door takes its pairs from a Casting row,
 * and this round stops before a Casting program can name the OpenRouter tool. The token store is the office's token
 * list, and the office's admissions door, the door under test, reads that list.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - THE_ROUTED_PROVIDERS loses its OpenRouter entry: the slots reader refuses the OpenRouter slot, the route is not
 *     routed, and the table expectation in the bridge-and-launcher-lines file goes red.
 *   - the office's pair check is removed: the other-provider, other-model and office-token-list cases go red.
 *   - the office's cap check is removed: the over-cap case goes red.
 *   - the router prints a slot's key instead of its mark: the key-stays-out case goes red.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import {
  THE_ROUTED_PROVIDERS,
  aSecretsMark,
  readTheKeySlots,
  theKeySlotsFile,
  theRouterControlSocket,
} from '../src/config/provider-router.mjs'
import { createRunTokenStore, RUN_TOKEN_REFUSALS } from '../src/server/lib/keyrouter/run-tokens.ts'
import { aRouterFolderFor, theRoutedKeysLeftOut } from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const WORKER = 'openrouter-worker'
const made = randomUUID()
const NATIVE = `made-up-openrouter-${made}`
const OFFICE_MODEL = `made-up-office-openrouter-${made}`
const DEEPSEEK_NATIVE = `made-up-deepseek-${made}`
const DEEPSEEK_OFFICE_MODEL = `made-up-office-deepseek-${made}`
/** A request of 100 input tokens, 40 of them cached, and 20 output tokens costs 0.104 US dollars at these prices. */
const PRICED = { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } }
const ONE_REQUEST_USD = 0.104
const OPENROUTER_KEY = `not-a-real-openrouter-key-${randomBytes(6).toString('hex')}`
const DEEPSEEK_KEY = `not-a-real-deepseek-key-${randomBytes(6).toString('hex')}`

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
let home = ''
let sandboxes = ''
const before: Record<string, string | undefined> = {}
const logs: string[] = []
/** What the stand-in provider was sent. */
const upstream: { path: string; authorization: string | undefined; body: Record<string, unknown> }[] = []
let provider: Server
let router: Awaited<ReturnType<typeof createProviderRouter>>
let bridge: NonNullable<Awaited<ReturnType<typeof openTheBridge>>>
/** The one run the bridge was opened for, as the launcher would have opened it with that run's token in its env. */
let carried: { run: string; token: string }
const env: NodeJS.ProcessEnv = {}

const ON = { MOLE_OFFICE_PROVIDER_ROUTER: 'on' }
const OFF = { MOLE_OFFICE_PROVIDER_ROUTER: 'off' }
const refuse = (sentence: string): never => { throw new Error(sentence) }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

/** A live run for the worker, filed as the launcher files one. The runtime is a free word on a session record. */
async function aRun(runtime: string, model: string): Promise<string> {
  const filed = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run the router carries', data: {
    runtime, model, servingAgent: WORKER, state: 'running',
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/**
 * A token from the office's own token list, for the exact provider and model pair a Casting row would have given it.
 * The issuing door is not used because it reads a Casting row, and no Casting program can name the OpenRouter tool yet.
 */
function mint(run: string, providerName: string, model: string, cap: number): string {
  return createRunTokenStore(t.client.sqlite).mint(run, 'casting', [{ provider: providerName, model }], cap).token
}

/** One chat request through the OpenRouter bridge, as the launcher's run sends one. */
async function ask(token: string, model: string = NATIVE): Promise<{ status: number; text: string; type: string | null }> {
  const reply = await fetch(`${env.OPENROUTER_BASE_URL!}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'A made-up question.' }] }),
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

/** The router's control socket, asked one request, with a body when it takes one. */
function askTheControlSocket(path: string, method = 'GET', payload?: unknown): Promise<{ status: number; text: string }> {
  const body = payload === undefined ? '' : JSON.stringify(payload)
  return new Promise((done, failed) => {
    const asked = request({
      socketPath: theRouterControlSocket(sandboxes), method, path,
      ...(payload === undefined ? {} : { headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } }),
    }, (answer) => {
      const parts: Buffer[] = []
      answer.on('data', (part: Buffer) => parts.push(part))
      answer.on('end', () => done({ status: answer.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }))
    })
    asked.on('error', failed)
    asked.end(body)
  })
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

  provider = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => parts.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(parts).toString('utf8')
      const body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown>
      upstream.push({ path: req.url ?? '', authorization: req.headers.authorization, body })
      if (req.method === 'GET') {
        const answer = req.url === '/models' ? { data: [{ id: NATIVE }] } : { data: { limit: null, limit_remaining: 10, usage: 0 } }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const chunk of STREAMED) res.write(chunk)
      res.end()
    })
  })
  await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done))

  // A MADE-UP HOME, never the machine's own: the slots file the router reads, at the modes it requires.
  folder = aTestDatabaseFolder('openrouter')
  home = join(folder, 'home')
  mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
  chmodSync(join(home, '.config', 'mole-office'), 0o700)
  writeFileSync(theKeySlotsFile(home), JSON.stringify({ version: 1, slots: [
    { id: 'or-main', provider: 'openrouter', label: 'Made-up OpenRouter key', key: OPENROUTER_KEY },
    { id: 'ds-main', provider: 'deepseek', label: 'Made-up DeepSeek key', key: DEEPSEEK_KEY },
  ] }), { mode: 0o600 })
  chmodSync(theKeySlotsFile(home), 0o600)

  sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  router = createProviderRouter({
    sandboxes, slots: () => readTheKeySlots(theKeySlotsFile(home)), office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! },
    upstreams: { openrouter: `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}` }, log: (line: string) => logs.push(line),
  })
  await router.start()
  await router.open('a')

  // THE ONE RUN THE BRIDGE IS OPENED FOR, as the launcher opens a run: its token, never a key, in the env.
  const run = await aRun('openrouter', OFFICE_MODEL)
  const token = mint(run, 'openrouter', NATIVE, 0.15)
  carried = { run, token }
  env.OPENROUTER_API_KEY = token
  const opened = await openTheBridge(JSON.stringify({ provider: 'openrouter', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse)
  expect(opened, 'the bridge did not open').not.toBeNull()
  bridge = opened!
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

describe('the router carries OpenRouter', () => {
  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenRouter entry.
  it('carries a token that names OpenRouter and its model, with the key from the slots file', async () => {
    const sent = upstream.length
    const answered = await ask(carried.token)
    expect(answered.status, answered.text).toBe(200)
    expect(answered.type).toMatch(/^text\/event-stream/)
    expect(answered.text).toBe(STREAMED.join(''))
    expect(upstream.length).toBe(sent + 1)
    const seen = upstream.at(-1)!
    expect(seen.path).toBe('/chat/completions')
    expect(seen.authorization).toBe(`Bearer ${OPENROUTER_KEY}`)
    expect(JSON.stringify(seen)).not.toContain(carried.token)
    expect(seen.body).toMatchObject({ model: NATIVE, stream: true, stream_options: { include_usage: true } })
    const read = await receiptsOf(carried.run)
    expect(read.receipts).toEqual([expect.objectContaining({ slot: 'or-main', status: 200, model: NATIVE, inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 })])
    expect(read.receipts[0]!.priceUsd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.slots).toEqual([expect.objectContaining({ slot: 'or-main', requests: 1, unpriced: 0 })])
    expect(read.slots[0]!.usd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spent).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spendCap).toBe(0.15)
  })

  it('carries a tool request on the control socket for the paths the OpenRouter tools use, with the slot key and no token', async () => {
    const run = await aRun('openrouter', OFFICE_MODEL)
    const token = mint(run, 'openrouter', NATIVE, 0.15)
    const sent = upstream.length
    const models = await askTheControlSocket('/carry', 'POST', { token, provider: 'openrouter', path: '/models', method: 'GET', model: NATIVE, body: null })
    expect(models.status, models.text).toBe(200)
    expect(JSON.parse(models.text)).toMatchObject({ data: [{ id: NATIVE }] })
    const key = await askTheControlSocket('/carry', 'POST', { token, provider: 'openrouter', path: '/key', method: 'GET', model: NATIVE, body: null })
    expect(key.status, key.text).toBe(200)
    const images = await askTheControlSocket('/carry', 'POST', { token, provider: 'openrouter', path: '/images', method: 'POST', model: NATIVE, body: { model: NATIVE, prompt: 'a made-up picture' } })
    expect(images.status, images.text).toBe(200)
    expect(upstream.length).toBe(sent + 3)
    expect(upstream.slice(sent).map((one) => `${one.path} ${one.authorization}`)).toEqual([
      `/models Bearer ${OPENROUTER_KEY}`,
      `/key Bearer ${OPENROUTER_KEY}`,
      `/images Bearer ${OPENROUTER_KEY}`,
    ])
    for (const one of upstream.slice(sent)) expect(JSON.stringify(one)).not.toContain(token)
    expect((upstream.at(-1) as { body: unknown }).body).toEqual({ model: NATIVE, prompt: 'a made-up picture' })
    expect((await receiptsOf(run)).receipts.map((one) => one.model)).toEqual([NATIVE, NATIVE, NATIVE])
  })
})

describe('what the office refuses before OpenRouter is reached', () => {
  // MUTATION: the office's pair check is removed.
  it('refuses a token that names another provider, before anything is sent', async () => {
    const run = await aRun('dsh', DEEPSEEK_OFFICE_MODEL)
    const token = mint(run, 'deepseek', DEEPSEEK_NATIVE, 0.15)
    const sent = upstream.length
    const answered = await ask(token)
    expect(answered.status, answered.text).toBe(403)
    const error = (JSON.parse(answered.text) as { error: { message: string; code: string } }).error
    expect(error.code).toBe('pair-not-allowed')
    expect(error.message).toBe(RUN_TOKEN_REFUSALS['pair-not-allowed'])
    expect(upstream.length).toBe(sent)
    expect((await receiptsOf(run)).receipts).toEqual([])
  })

  // MUTATION: the office's cap check is removed.
  it('refuses a token over its spend cap, before anything is sent', async () => {
    const run = await aRun('openrouter', OFFICE_MODEL)
    const token = mint(run, 'openrouter', NATIVE, 0)
    const sent = upstream.length
    const answered = await ask(token)
    expect(answered.status, answered.text).toBe(403)
    const error = (JSON.parse(answered.text) as { error: { message: string; code: string } }).error
    expect(error.code).toBe('cap-reached')
    expect(error.message).toBe(RUN_TOKEN_REFUSALS['cap-reached'])
    expect(upstream.length).toBe(sent)
    expect((await receiptsOf(run)).receipts).toEqual([])
  })

  // MUTATION: the office's pair check is removed.
  it('refuses a model the token does not name, because a token names its models and not only its provider', async () => {
    const run = await aRun('openrouter', OFFICE_MODEL)
    const token = mint(run, 'openrouter', NATIVE, 0.15)
    const sent = upstream.length
    const answered = await ask(token, `another-${NATIVE}`)
    expect(answered.status, answered.text).toBe(403)
    const error = (JSON.parse(answered.text) as { error: { message: string; code: string } }).error
    expect(error.code).toBe('pair-not-allowed')
    expect(error.message).toBe(RUN_TOKEN_REFUSALS['pair-not-allowed'])
    expect(upstream.length).toBe(sent)
    expect((await receiptsOf(run)).receipts).toEqual([])
  })
})

describe('what the router keeps to itself', () => {
  // MUTATION: the router prints a slot's key instead of its mark.
  it('keeps the key out of the sandbox, the logs, the records, the receipts and the bridge answers', async () => {
    const answered = await ask(carried.token)
    expect(answered.status, answered.text).toBe(200)
    expect(env.OPENROUTER_API_KEY).toBe(carried.token)
    expect(env.OPENROUTER_API_KEY).not.toBe(OPENROUTER_KEY)
    expect(env.OPENROUTER_BASE_URL).toBe(bridge.baseUrl)
    expect(JSON.stringify(env)).not.toContain(OPENROUTER_KEY)
    const logged = logs.join('\n')
    expect(logged).toContain(aSecretsMark(OPENROUTER_KEY))
    expect(logged).not.toContain(OPENROUTER_KEY)
    const stored = [t.client.sqlite.prepare('SELECT * FROM run_tokens').all(), t.client.sqlite.prepare('SELECT * FROM router_receipts').all()]
    expect(JSON.stringify(stored)).not.toContain(OPENROUTER_KEY)
    expect(JSON.stringify(stored)).not.toContain(DEEPSEEK_KEY)
    const read = await receiptsOf(carried.run)
    expect(JSON.stringify(read)).not.toContain(OPENROUTER_KEY)
    expect(answered.text).not.toContain(OPENROUTER_KEY)
    const slots = await askTheControlSocket('/slots')
    expect(slots.status, slots.text).toBe(200)
    expect(slots.text).not.toContain(OPENROUTER_KEY)
  })
})

describe("the office's own words", () => {
  // MUTATION: the office's pair check is removed.
  it('refuses, in words, an office token list that does not name OpenRouter', async () => {
    const run = await aRun('dsh', DEEPSEEK_OFFICE_MODEL)
    const token = mint(run, 'deepseek', DEEPSEEK_NATIVE, 0.15)
    const reply = await call('POST', '/api/provider-router/admissions', theOfficesKeyHeader(), { token, provider: 'openrouter', model: NATIVE })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ admitted: false, code: 'pair-not-allowed', says: RUN_TOKEN_REFUSALS['pair-not-allowed'] })
  })

  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenRouter entry.
  it('leaves OPENROUTER_API_KEY out of a sandbox env file while the router is on, and refuses an exec that names it', () => {
    const selection = {
      lines: [`OPENROUTER_API_KEY=${OPENROUTER_KEY}`, 'ANOTHER_MADE_UP=kept'],
      says: 'Read from a made-up secrets file.', file: '/made-up/secrets.env', quiet: true, warning: null,
    }
    const routed = theRoutedKeysLeftOut(selection, undefined, ON)
    expect(routed.refusal).toBeNull()
    expect(routed.selection.lines).toEqual(['ANOTHER_MADE_UP=kept'])
    expect(routed.selection.says).toContain(selection.says)
    expect(routed.selection.says).toMatch(/OPENROUTER_API_KEY/)
    expect(JSON.stringify(routed)).not.toContain(OPENROUTER_KEY)
    const named = theRoutedKeysLeftOut(selection, ['OPENROUTER_API_KEY'], ON)
    expect(named.refusal).toMatch(/OPENROUTER_API_KEY/)
    expect(named.refusal).toMatch(/router/)
    expect(JSON.stringify(named)).not.toContain(OPENROUTER_KEY)
    expect(theRoutedKeysLeftOut(selection, undefined, OFF).selection).toBe(selection)
  })

  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenRouter entry.
  it('reads a slot only from a file of mode 0600 in a folder of 0700, and names every provider it routes', () => {
    const real = readTheKeySlots(theKeySlotsFile(home))
    expect(real).toContainEqual({ id: 'or-main', provider: 'openrouter', label: 'Made-up OpenRouter key', key: OPENROUTER_KEY })
    const slotsFolder = join(home, '.config', 'mole-office')
    const loose = join(slotsFolder, 'loose.json')
    writeFileSync(loose, readFileSync(theKeySlotsFile(home), 'utf8'), { mode: 0o644 })
    chmodSync(loose, 0o644)
    expect(() => readTheKeySlots(loose)).toThrow(/may be read by others/)
    const unrouted = join(slotsFolder, 'unrouted.json')
    writeFileSync(unrouted, JSON.stringify({ version: 1, slots: [{ id: 'x-main', provider: 'a-provider-it-does-not-route', label: 'Made-up slot', key: OPENROUTER_KEY }] }), { mode: 0o600 })
    chmodSync(unrouted, 0o600)
    let said = ''
    try { readTheKeySlots(unrouted) } catch (error) { said = (error as Error).message }
    expect(said).not.toBe('')
    for (const providerName of Object.keys(THE_ROUTED_PROVIDERS)) expect(said).toContain(providerName)
    expect(said).not.toContain(OPENROUTER_KEY)
  })
})
