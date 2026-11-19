// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL REACHES THE ROUTER AT THE OFFICE'S OWN ADDRESS, AND ITS TOKEN IS CHECKED ON EVERY CALL.
 *
 * NEW: the office's route POST /api/provider-router/tool-requests carries one tool request to the router's host-only
 * control socket. The token in its Authorization header is read and checked on every call: the provider and the model
 * it names, its run, its end and its spend cap. The run's office key alone has no token and spends nothing. The office
 * never reads a provider key; the router swaps the token for a slot's key on the host.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. The router is a stand-in on
 * the control socket's path, so no real key, provider or live office is reached. Every model and token here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the Bearer read is removed: the missing-token and office-key-alone cases go red on a 200.
 *   - the per-call token check is removed: the ended and over-cap cases go red on a 200.
 *   - the exact pair check is removed: the widened-model case goes red on a 200.
 *   - the carried-path table is removed: the uncarried path case goes red on a 200.
 *   - carryTheToolRequest is removed: the carrying cases go red on a 500.
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theRouterControlSocket } from '../src/config/provider-router.mjs'
import { theSandboxesFolderNow } from '../src/config/sandbox-folder.mjs'
import { createRunTokenStore, RUN_TOKEN_REFUSALS } from '../src/server/lib/keyrouter/run-tokens.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const CAP = '1'
const RUN_AGENT = 'carry-route-run-worker'
const made = randomUUID()
const MODEL = `made-up-openrouter-model-${made}`
const OTHER_MODEL = `made-up-openrouter-other-${made}`
const A_PRICE = { input: 1000, cachedInput: 100, output: 2000 }
const PRICED = { currency: 'USD', prices: { [MODEL]: A_PRICE, [OTHER_MODEL]: A_PRICE } }

interface Carried {
  token: string
  provider: string
  path: string
  method: string
  model: string
  body: unknown
}

let t: TestDb
let app: FastifyInstance
let router: Server
let socket = ''
let carried: Carried[] = []
const before: Record<string, string | undefined> = {}
let run = ''
let token = ''
let tokenId = ''

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

const asTheOffice = (value?: string): Record<string, string> => ({
  ...theOfficesKeyHeader(), 'x-mole-office-workspace': WORKSPACE, ...(value === undefined ? {} : { authorization: `Bearer ${value}` }),
})

const ask = (body: unknown, headers: Record<string, string> = asTheOffice(token)) =>
  call('POST', '/api/provider-router/tool-requests', { 'content-type': 'application/json', ...headers }, body)

/** The run's own key, which is the only caller a tool credential is minted for. */
const asTheRunsOwnKey = (forRun: string, key: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': RUN_AGENT,
  'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key, 'x-mole-office-session': forRun,
})

/** A running session the office files for itself, so its own key is minted and answers `key`. */
async function aRun(): Promise<{ run: string; key: string }> {
  const reply = await call('POST', '/api/records', asTheOffice(), {
    kind: 'session',
    title: 'Synthetic: a run a tool carries a request for',
    data: { state: 'running', runtime: 'dsh', servingAgent: RUN_AGENT, startedByMoleOffice: true },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as { record: { id: string }; runKey?: { key?: string } }
  expect(typeof body.runKey?.key, 'the office filed the run without minting its key').toBe('string')
  return { run: body.record.id, key: String(body.runKey?.key) }
}

async function aToken(forRun: string, key: string, model = MODEL): Promise<{ token: string; id: string }> {
  const reply = await call('POST', '/api/provider-router/tool-tokens', asTheRunsOwnKey(forRun, key), { run: forRun, provider: 'openrouter', model })
  expect(reply.statusCode, reply.body).toBe(201)
  const one = reply.json() as { token: string; id: string; kind: string; pairs: { provider: string; model: string }[]; spendCap: number }
  expect(one.kind).toBe('tool')
  expect(one.pairs).toEqual([{ provider: 'openrouter', model }])
  expect(one.spendCap).toBe(1)
  return { token: one.token, id: one.id }
}

beforeAll(async () => {
  for (const name of ['HOME', 'MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) before[name] = process.env[name]
  // A SHORT HOME, because a unix socket's path may be at most about 100 characters and the control socket's path is
  // built under it.
  process.env['HOME'] = mkdtempSync(join(tmpdir(), 'mo-carry-'))
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = CAP
  socket = theRouterControlSocket(theSandboxesFolderNow())
  mkdirSync(dirname(socket), { recursive: true, mode: 0o700 })
  router = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as Carried
      carried.push(body)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ from: 'the stand-in router', path: body.path, method: body.method }))
    })
  })
  await new Promise<void>((done) => router.listen(socket, done))
  // THE SOCKET FILE IS MADE A MOMENT AFTER listen() ANSWERS, so the mode is set once it is there.
  for (let tries = 0; tries < 100 && !existsSync(socket); tries++) await new Promise((done) => setTimeout(done, 10))
  chmodSync(socket, 0o600)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const priced = await call('POST', '/api/office/price-table', AS_THE_PERSON, { table: PRICED })
  expect(priced.statusCode, priced.body).toBe(200)
  const worker = await call('POST', '/api/agents/started', AS_THE_PERSON, {
    handle: RUN_AGENT, name: RUN_AGENT, role: THE_WORKER, runtime: 'dsh', workArea: ['src'],
  })
  expect(worker.statusCode, worker.body).toBe(201)
  const made = await aRun()
  run = made.run
  const one = await aToken(run, made.key)
  token = one.token
  tokenId = one.id
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => router?.close(() => done()))
  rmSync(socket, { force: true })
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
  rmSync(process.env['HOME'] ?? '', { recursive: true, force: true })
})

describe('a carried request', () => {
  it('carries the model list with a GET and answers the router’s own bytes', async () => {
    carried = []
    const answer = await ask({ provider: 'openrouter', path: '/models' })
    expect(answer.statusCode, answer.body).toBe(200)
    expect(answer.json()).toEqual({ from: 'the stand-in router', path: '/models', method: 'GET' })
    expect(carried).toHaveLength(1)
    expect(carried[0]).toMatchObject({ token, provider: 'openrouter', path: '/models', method: 'GET', model: MODEL })
  })

  it('carries a chat completion with its model in the body, and a picture request with its model', async () => {
    carried = []
    const chat = await ask({ provider: 'openrouter', path: '/chat/completions', body: { model: MODEL, messages: [{ role: 'user', content: 'hi' }] } })
    expect(chat.statusCode, chat.body).toBe(200)
    expect(carried[0]).toMatchObject({ path: '/chat/completions', method: 'POST', model: MODEL })
    expect((carried[0] as Carried).body).toEqual({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] })

    carried = []
    const image = await ask({ provider: 'openrouter', path: '/images', body: { model: MODEL, prompt: 'a made-up picture' } })
    expect(image.statusCode, image.body).toBe(200)
    expect(carried[0]).toMatchObject({ path: '/images', method: 'POST', model: MODEL })
  })
})

describe('what it refuses before anything reaches the router', () => {
  it('refuses a missing token and the run’s office key alone', async () => {
    carried = []
    const noToken = await ask({ provider: 'openrouter', path: '/models' }, { 'x-mole-office-workspace': WORKSPACE, ...theOfficesKeyHeader() })
    expect(noToken.statusCode, noToken.body).toBe(401)
    expect((noToken.json() as { error: string }).error).toMatch(/not valid/)
    const madeUp = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice('mrt_not-a-real-token'))
    expect(madeUp.statusCode, madeUp.body).toBe(401)
    expect(carried).toHaveLength(0)
  })

  it('refuses a widened pair rather than carrying another model', async () => {
    carried = []
    const widened = await ask({ provider: 'openrouter', path: '/chat/completions', body: { model: OTHER_MODEL } })
    expect(widened.statusCode, widened.body).toBe(403)
    expect((widened.json() as { error: string }).error).toMatch(/does not allow this provider and model/)
    expect(carried).toHaveLength(0)
  })

  it('refuses a path the router does not carry, by name', async () => {
    carried = []
    const uncarried = await ask({ provider: 'openrouter', path: '/embeddings', body: { model: MODEL } })
    expect(uncarried.statusCode, uncarried.body).toBe(400)
    expect((uncarried.json() as { error: string }).error).toContain('does not carry openrouter /embeddings')
    expect(carried).toHaveLength(0)
  })

  it('refuses an ended token and an over-cap token on the next call', async () => {
    carried = []
    const ended = await aRun()
    const endedToken = await aToken(ended.run, ended.key)
    createRunTokenStore(t.client.sqlite).revoke(endedToken.id)
    const revoked = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice(endedToken.token))
    expect(revoked.statusCode, revoked.body).toBe(403)
    expect((revoked.json() as { error: string }).error).toMatch(/has been revoked/)

    const capped = await aRun()
    const cappedToken = await aToken(capped.run, capped.key)
    t.client.sqlite.prepare('UPDATE run_tokens SET spent = spend_cap WHERE id = ?').run(cappedToken.id)
    const over = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice(cappedToken.token))
    expect(over.statusCode, over.body).toBe(403)
    expect((over.json() as { error: string }).error).toMatch(/reached its spending cap/)
    expect(carried).toHaveLength(0)
  })

  it('refuses an expired token on the next call', async () => {
    carried = []
    const expiredRun = await aRun()
    const expired = await aToken(expiredRun.run, expiredRun.key)
    // THE ROW'S CHECK ASKS expires_at > issued_at, so both are put in the past; the token is expired either way.
    t.client.sqlite.prepare('UPDATE run_tokens SET issued_at = 0, expires_at = 1 WHERE id = ?').run(expired.id)
    // THE POST PATH READS THE TOKEN THROUGH `authorize`, whose expiry check this proves.
    const answer = await ask({ provider: 'openrouter', path: '/chat/completions', body: { model: MODEL } }, asTheOffice(expired.token))
    expect(answer.statusCode, answer.body).toBe(403)
    expect((answer.json() as { error: string }).error).toMatch(/has expired/)
    expect(carried).toHaveLength(0)
  })

  it('refuses a Casting credential at the tool route, and a tool credential at the Casting door', async () => {
    carried = []
    const made = await aRun()
    const casting = createRunTokenStore(t.client.sqlite).mint(made.run, 'casting', [{ provider: 'openrouter', model: MODEL }], 1)
    const atTheToolDoor = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice(casting.token))
    expect(atTheToolDoor.statusCode, atTheToolDoor.body).toBe(403)
    expect((atTheToolDoor.json() as { error: string }).error).toContain(RUN_TOKEN_REFUSALS['casting-token-at-tool-door'])
    expect(carried).toHaveLength(0)

    const tool = await aToken(made.run, made.key)
    const atTheCastingDoor = await call('POST', '/api/provider-router/admissions', theOfficesKeyHeader(), { token: tool.token, provider: 'openrouter', model: MODEL })
    expect(atTheCastingDoor.statusCode, atTheCastingDoor.body).toBe(200)
    expect(atTheCastingDoor.json()).toMatchObject({
      admitted: false,
      code: 'tool-token-at-casting-door',
      says: RUN_TOKEN_REFUSALS['tool-token-at-casting-door'],
      kind: 'tool',
    })
  })

  it('keeps a tool receipt’s kind and charges it to the run’s one total', async () => {
    const made = await aRun()
    const tool = await aToken(made.run, made.key)
    const casting = createRunTokenStore(t.client.sqlite).mint(made.run, 'casting', [{ provider: 'openrouter', model: MODEL }], 1)
    const id = `rr_${randomUUID().replaceAll('-', '').slice(0, 24)}`
    const settled = await call('POST', '/api/provider-router/receipts', theOfficesKeyHeader(), {
      id, token: tool.id, slot: 'a-made-up-tool-slot', status: 200, model: MODEL,
      usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 },
    })
    expect(settled.statusCode, settled.body).toBe(201)
    const receipt = (settled.json() as { receipt: { kind: string; priceUsd: number | null } }).receipt
    expect(receipt.kind).toBe('tool')
    expect(receipt.priceUsd).toBeGreaterThan(0)
    const read = await call('GET', `/api/provider-router/receipts?run=${made.run}`, AS_THE_PERSON)
    const answer = read.json() as { receipts: { kind: string }[]; kinds: { casting: string | null; tool: string | null } }
    expect(answer.receipts.map((one) => one.kind)).toEqual(['tool'])
    expect(answer.kinds).toEqual({ casting: casting.id, tool: tool.id })
    expect(t.client.sqlite.prepare('SELECT DISTINCT spent FROM run_tokens WHERE run_id = ?').all(made.run)).toEqual([{ spent: receipt.priceUsd }])
  })

  it('refuses a tool token after its run has ended', async () => {
    carried = []
    const made = await aRun()
    const tool = await aToken(made.run, made.key)
    const ended = await call('PATCH', `/api/records/${made.run}`, AS_THE_PERSON, { dataPatch: { state: 'crashed' } })
    expect(ended.statusCode, ended.body).toBe(200)
    const answer = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice(tool.token))
    expect(answer.statusCode, answer.body).toBe(403)
    expect((answer.json() as { error: string }).error).toContain(RUN_TOKEN_REFUSALS['revoked-token'])
    expect(carried).toHaveLength(0)
  })

  it('charges both kinds against one run total, so neither can spend the cap again', async () => {
    carried = []
    const made = await aRun()
    const tool = await aToken(made.run, made.key)
    const store = createRunTokenStore(t.client.sqlite)
    const casting = store.mint(made.run, 'casting', [{ provider: 'openrouter', model: MODEL }], 1)
    store.charge(casting.id, 0.6)
    store.charge(tool.id, 0.4)
    expect(t.client.sqlite.prepare('SELECT DISTINCT spent FROM run_tokens WHERE run_id = ?').all(made.run)).toEqual([{ spent: 1 }])
    const answer = await ask({ provider: 'openrouter', path: '/models' }, asTheOffice(tool.token))
    expect(answer.statusCode, answer.body).toBe(403)
    expect((answer.json() as { error: string }).error).toContain(RUN_TOKEN_REFUSALS['cap-reached'])
    expect(carried).toHaveLength(0)
  })

  it("refuses a run's own key with no token, as a key header and as a Bearer token", async () => {
    carried = []
    const own = await aRun()
    const asAKeyHeader = await ask(
      { provider: 'openrouter', path: '/models' },
      { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': own.key },
    )
    expect(asAKeyHeader.statusCode, asAKeyHeader.body).toBe(401)
    expect((asAKeyHeader.json() as { error: string }).error).toMatch(/not valid/)

    const asABearer = await ask(
      { provider: 'openrouter', path: '/models' },
      { ...theOfficesKeyHeader(), 'x-mole-office-workspace': WORKSPACE, authorization: `Bearer ${own.key}` },
    )
    expect(asABearer.statusCode, asABearer.body).toBe(401)
    expect((asABearer.json() as { error: string }).error).toMatch(/not valid/)
    expect(carried).toHaveLength(0)
  })

  it('refuses every carrying request while MOLE_OFFICE_PROVIDER_ROUTER is off', async () => {
    process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'off'
    try {
      const off = await ask({ provider: 'openrouter', path: '/models' })
      expect(off.statusCode, off.body).toBe(409)
      expect((off.json() as { error: string }).error).toContain('MOLE_OFFICE_PROVIDER_ROUTER is off')
    } finally {
      process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
    }
  })
})
