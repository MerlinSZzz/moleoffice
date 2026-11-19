// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER CARRIES OPENAI, THE SECOND OF THE OTHER API-KEY PROVIDERS, AND STOPS BEFORE ITS CALLER.
 *
 * OLD: the key layer held DeepSeek, OpenCode Go and OpenRouter only, so an OpenAI API key had no provider entry and no
 * run token could name OpenAI.
 * NEW: THE_ROUTED_PROVIDERS names OpenAI beside them. A token that names an OpenAI provider and model sends its request
 * to the bridge under OPENAI_BASE_URL, and the bridge carries it to the router's socket for the sandbox. The office
 * admits the token for that pair, the router swaps it for the made-up key in the host-only key slots file, sends the
 * request to the OpenAI address, streams the answer back byte for byte, and settles one receipt priced at 0.104 from the
 * price table. A token that names another provider, another model, or no room under its cap is refused in the office's
 * own words, and nothing is sent.
 *
 * WHAT IS NOT BUILT. No Codex run is routed. Codex reads a custom provider from its own config and not from a base-URL
 * variable, so pointing it at the bridge is a separate caller. The entry's program is OpenAI's own program name, not
 * Codex's, so the launcher does not carry a Codex run through this provider. A case below pins that stop.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database on 127.0.0.1, with the setting
 * on only in this process. The router, the bridge and their sockets are the shipped ones. The provider is a stand-in on
 * 127.0.0.1 that records what it was sent and streams one fixed answer. The home and the key slots file are this file's
 * own, and every key is made up. No real key is read, no real provider is reached, and no live office is touched.
 *
 * WHY THE TOKEN STORE AND NOT THE OFFICE'S ISSUING DOOR: the office's issuing door takes its pairs from a Casting row,
 * and no Casting program names the OpenAI provider yet. The token store is the office's token list, and the office's
 * admissions door, the door under test, reads that list.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - THE_ROUTED_PROVIDERS loses its OpenAI entry: the slots reader refuses the OpenAI slot and the bridge cannot open.
 *   - the office's pair check is removed: the other-provider, other-model and office-token-list cases go red.
 *   - the office's cap check is removed: the over-cap case goes red.
 *   - the router prints a slot's key instead of its mark: the key-stays-out case goes red.
 *   - the OpenAI entry is given Codex's program: the no-Codex-caller case goes red.
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
  theRouterMustCarry,
} from '../src/config/provider-router.mjs'
import { createRunTokenStore, RUN_TOKEN_REFUSALS } from '../src/server/lib/keyrouter/run-tokens.ts'
import { aRouterFolderFor, theRoutedKeysLeftOut } from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const WORKER = 'openai-worker'
const made = randomUUID()
const NATIVE = `made-up-openai-${made}`
const OFFICE_MODEL = `openai/${NATIVE}`
const DEEPSEEK_NATIVE = `made-up-deepseek-${made}`
const DEEPSEEK_OFFICE_MODEL = `deepseek/${DEEPSEEK_NATIVE}`
/** A request of 100 input tokens, 40 of them cached, and 20 output tokens costs 0.104 US dollars at these prices. */
const PRICED = { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } }
const ONE_REQUEST_USD = 0.104
const OPENAI_KEY = `not-a-real-openai-key-${randomBytes(6).toString('hex')}`
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
 * The issuing door is not used because it reads a Casting row, and no Casting program can name the OpenAI tool yet.
 */
function mint(run: string, providerName: string, model: string, cap: number): string {
  return createRunTokenStore(t.client.sqlite).mint(run, 'casting', [{ provider: providerName, model }], cap).token
}

/** One chat request through the OpenAI bridge, as the launcher's run sends one. */
async function ask(token: string, model: string = NATIVE): Promise<{ status: number; text: string; type: string | null }> {
  const reply = await fetch(`${env.OPENAI_BASE_URL!}/chat/completions`, {
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
    receipts: { id: string; slot: string; status: number; model: string; kind: string; inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; priceUsd: number | null }[]
    slots: { slot: string; requests: number; usd: number; unpriced: number }[]
    kinds: { casting: string | null; tool: string | null }
  }
}

/** The router's control socket, asked one GET. */
function askTheControlSocket(path: string): Promise<{ status: number; text: string }> {
  return new Promise((done, failed) => {
    const asked = request({ socketPath: theRouterControlSocket(sandboxes), method: 'GET', path }, (answer) => {
      const parts: Buffer[] = []
      answer.on('data', (part: Buffer) => parts.push(part))
      answer.on('end', () => done({ status: answer.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }))
    })
    asked.on('error', failed)
    asked.end()
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
      const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>
      upstream.push({ path: req.url ?? '', authorization: req.headers.authorization, body })
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const chunk of STREAMED) res.write(chunk)
      res.end()
    })
  })
  await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done))

  // A MADE-UP HOME, never the machine's own: the slots file the router reads, at the modes it requires.
  folder = aTestDatabaseFolder('openai')
  home = join(folder, 'home')
  mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
  chmodSync(join(home, '.config', 'mole-office'), 0o700)
  writeFileSync(theKeySlotsFile(home), JSON.stringify({ version: 1, slots: [
    { id: 'oa-main', provider: 'openai', label: 'Made-up OpenAI key', key: OPENAI_KEY },
    { id: 'ds-main', provider: 'deepseek', label: 'Made-up DeepSeek key', key: DEEPSEEK_KEY },
  ] }), { mode: 0o600 })
  chmodSync(theKeySlotsFile(home), 0o600)

  sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  router = createProviderRouter({
    sandboxes, slots: () => readTheKeySlots(theKeySlotsFile(home)), office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! },
    upstreams: { openai: `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}` }, log: (line: string) => logs.push(line),
  })
  await router.start()
  await router.open('a')

  // THE ONE RUN THE BRIDGE IS OPENED FOR, as the launcher opens a run: its token, never a key, in the env.
  const run = await aRun('openai', OFFICE_MODEL)
  const token = mint(run, 'openai', NATIVE, 0.15)
  carried = { run, token }
  env.OPENAI_API_KEY = token
  const opened = await openTheBridge(JSON.stringify({ provider: 'openai', socket: join(sandboxes, '.run', 'a', 'provider-router', 'router.sock') }), env, refuse)
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

describe('the router carries OpenAI', () => {
  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenAI entry.
  it('carries a token that names OpenAI and its model, with the key from the slots file', async () => {
    const sent = upstream.length
    const answered = await ask(carried.token)
    expect(answered.status, answered.text).toBe(200)
    expect(answered.type).toMatch(/^text\/event-stream/)
    expect(answered.text).toBe(STREAMED.join(''))
    expect(upstream.length).toBe(sent + 1)
    const seen = upstream.at(-1)!
    expect(seen.path).toBe('/chat/completions')
    expect(seen.authorization).toBe(`Bearer ${OPENAI_KEY}`)
    expect(JSON.stringify(seen)).not.toContain(carried.token)
    expect(seen.body).toMatchObject({ model: NATIVE, stream: true, stream_options: { include_usage: true } })
    const read = await receiptsOf(carried.run)
    expect(read.receipts).toEqual([expect.objectContaining({ slot: 'oa-main', status: 200, model: NATIVE, inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 })])
    expect(read.receipts[0]!.priceUsd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.receipts[0]!.kind).toBe('casting')
    expect(read.kinds.casting).toBe(createRunTokenStore(t.client.sqlite).current(carried.run, 'casting')?.id)
    expect(read.kinds.tool).toBeNull()
    expect(read.slots).toEqual([expect.objectContaining({ slot: 'oa-main', requests: 1, unpriced: 0 })])
    expect(read.slots[0]!.usd).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spent).toBeCloseTo(ONE_REQUEST_USD, 10)
    expect(read.spendCap).toBe(0.15)
  })
})

describe('what the office refuses before OpenAI is reached', () => {
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
    const run = await aRun('openai', OFFICE_MODEL)
    const token = mint(run, 'openai', NATIVE, 0)
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
    const run = await aRun('openai', OFFICE_MODEL)
    const token = mint(run, 'openai', NATIVE, 0.15)
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
    expect(env.OPENAI_API_KEY).toBe(carried.token)
    expect(env.OPENAI_API_KEY).not.toBe(OPENAI_KEY)
    expect(env.OPENAI_BASE_URL).toBe(bridge.baseUrl)
    expect(JSON.stringify(env)).not.toContain(OPENAI_KEY)
    const logged = logs.join('\n')
    expect(logged).toContain(aSecretsMark(OPENAI_KEY))
    expect(logged).not.toContain(OPENAI_KEY)
    const stored = [t.client.sqlite.prepare('SELECT * FROM run_tokens').all(), t.client.sqlite.prepare('SELECT * FROM router_receipts').all()]
    expect(JSON.stringify(stored)).not.toContain(OPENAI_KEY)
    expect(JSON.stringify(stored)).not.toContain(DEEPSEEK_KEY)
    const read = await receiptsOf(carried.run)
    expect(JSON.stringify(read)).not.toContain(OPENAI_KEY)
    expect(answered.text).not.toContain(OPENAI_KEY)
    const slots = await askTheControlSocket('/slots')
    expect(slots.status, slots.text).toBe(200)
    expect(slots.text).not.toContain(OPENAI_KEY)
  })

  // MUTATION: the OpenAI entry is given Codex's program.
  it('names OpenAI as a provider of its own and routes no Codex run yet', () => {
    expect(THE_ROUTED_PROVIDERS.openai).toMatchObject({
      upstream: 'https://api.openai.com/v1',
      program: 'openai',
      nativeProvider: 'openai',
      modelPrefix: 'openai/',
      keyName: 'OPENAI_API_KEY',
      baseUrlName: 'OPENAI_BASE_URL',
      named: 'OpenAI',
      paidBy: 'tokens',
    })
    expect(theRouterMustCarry('openai', OFFICE_MODEL, 'openai')).toBe(true)
    expect(theRouterMustCarry('codex', 'gpt-6.1-terra', 'openai')).toBe(false)
    expect(theRouterMustCarry('codex', undefined, undefined)).toBe(false)
  })
})

describe("the office's own words", () => {
  // MUTATION: the office's pair check is removed.
  it('refuses, in words, an office token list that does not name OpenAI', async () => {
    const run = await aRun('dsh', DEEPSEEK_OFFICE_MODEL)
    const token = mint(run, 'deepseek', DEEPSEEK_NATIVE, 0.15)
    const reply = await call('POST', '/api/provider-router/admissions', theOfficesKeyHeader(), { token, provider: 'openai', model: NATIVE })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ admitted: false, code: 'pair-not-allowed', says: RUN_TOKEN_REFUSALS['pair-not-allowed'] })
  })

  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenAI entry.
  it('leaves OPENAI_API_KEY out of a sandbox env file while the router is on, and refuses an exec that names it', () => {
    const selection = {
      lines: [`OPENAI_API_KEY=${OPENAI_KEY}`, 'ANOTHER_MADE_UP=kept'],
      says: 'Read from a made-up secrets file.', file: '/made-up/secrets.env', quiet: true, warning: null,
    }
    const routed = theRoutedKeysLeftOut(selection, undefined, ON)
    expect(routed.refusal).toBeNull()
    expect(routed.selection.lines).toEqual(['ANOTHER_MADE_UP=kept'])
    expect(routed.selection.says).toContain(selection.says)
    expect(routed.selection.says).toMatch(/OPENAI_API_KEY/)
    expect(JSON.stringify(routed)).not.toContain(OPENAI_KEY)
    const named = theRoutedKeysLeftOut(selection, ['OPENAI_API_KEY'], ON)
    expect(named.refusal).toMatch(/OPENAI_API_KEY/)
    expect(named.refusal).toMatch(/router/)
    expect(JSON.stringify(named)).not.toContain(OPENAI_KEY)
    expect(theRoutedKeysLeftOut(selection, undefined, OFF).selection).toBe(selection)
  })

  // MUTATION: THE_ROUTED_PROVIDERS loses its OpenAI entry.
  it('reads a slot only from a file of mode 0600 in a folder of 0700, and names every provider it routes', () => {
    const real = readTheKeySlots(theKeySlotsFile(home))
    expect(real).toContainEqual({ id: 'oa-main', provider: 'openai', label: 'Made-up OpenAI key', key: OPENAI_KEY })
    const slotsFolder = join(home, '.config', 'mole-office')
    const loose = join(slotsFolder, 'loose.json')
    writeFileSync(loose, readFileSync(theKeySlotsFile(home), 'utf8'), { mode: 0o644 })
    chmodSync(loose, 0o644)
    expect(() => readTheKeySlots(loose)).toThrow(/may be read by others/)
    const unrouted = join(slotsFolder, 'unrouted.json')
    writeFileSync(unrouted, JSON.stringify({ version: 1, slots: [{ id: 'x-main', provider: 'a-provider-it-does-not-route', label: 'Made-up slot', key: OPENAI_KEY }] }), { mode: 0o600 })
    chmodSync(unrouted, 0o600)
    let said = ''
    try { readTheKeySlots(unrouted) } catch (error) { said = (error as Error).message }
    expect(said).not.toBe('')
    for (const providerName of Object.keys(THE_ROUTED_PROVIDERS)) expect(said).toContain(providerName)
    expect(said).not.toContain(OPENAI_KEY)
  })
})
