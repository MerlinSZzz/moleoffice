// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL GETS ITS OWN ROUTER CREDENTIAL, FOR THE PROVIDER AND MODEL IT NAMES AND NOTHING ELSE.
 *
 * OLD (before the kind change): the provider router issued a credential only from a Casting row, so a tool that needed
 * a model its run was not cast for had no token to hold. The tool door then let the person, the office or the run's
 * registered starter mint one, and a second kind of credential could not live beside the run's Casting credential.
 * NEW: POST /api/provider-router/tool-tokens mints a row of kind `tool` for exactly the provider and model the tool
 * names. Only the run's own key may ask: the person, the office and the run's registered starter are refused. The tool
 * row lives beside the run's `casting` row, and both are checked at their own doors. It refuses: while
 * MOLE_OFFICE_PROVIDER_ROUTER is off; while no run cap is set; a caller who is not the run's own key; a body that is
 * not {run, provider, model} and a run that is not there; a provider the router does not route; a token-paid model the
 * price table cannot price in US dollars; and a pair other than the pair the run's tool credential already holds. A
 * subscription provider needs no price. The issued token is admitted by the existing admissions door for its exact
 * provider and model and refused for every other pair, and the admissions door refuses it as a tool credential at the
 * Casting door.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, with the setting on only in
 * this process. Every run, agent, price and Casting row is written through the office's own doors; nothing ran. Every
 * model name is made up for this file. No key of any provider is read or used, and every agent key here is the test
 * office's own.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - refuseWhileOff is removed from the tool door: the off case goes red on a 201.
 *   - the cap refusal is removed: the no-cap case goes red.
 *   - the run-key check is removed: the person, office and starter cases go red on a 201.
 *   - the provider check is removed: the unrouted-provider case goes red on a 201.
 *   - the price check is removed: the unpriced-model cases go red on a 201.
 *   - the one-tool-row rule is removed: the widening case goes red on a 201.
 *   - the kind is not stored: the coexistence case goes red on the row's kind.
 *   - the expiry is not taken from the Casting row: the expiry case goes red on a later instant.
 *   - the inspector check is removed: the inspector case goes red on a 201.
 *   - the provider comes from the run or a constant rather than the body: the issue cases go red on pairs.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RUN_TOKEN_REFUSALS } from '../src/server/lib/keyrouter/run-tokens.ts'
import { THE_ROUTED_PROVIDERS } from '../src/config/provider-router.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const withKey = (key: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key })
const asAgent = (handle: string, key: string) => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key,
})
const asTheOffice = () => ({ ...theOfficesKeyHeader(), 'x-mole-office-workspace': WORKSPACE })
const STARTER = 'tool-token-starter'
const WORKER = 'tool-token-worker'
const STRANGER = 'tool-token-stranger'
const CAP = '0.15'
/** Made up for this run, so no shipped model name is relied on. */
const made = randomUUID()
const MODEL = `made-up-tool-deepseek-${made}`
const OTHER_MODEL = `made-up-tool-deepseek-other-${made}`
const GO_MODEL = `made-up-tool-go-${made}`
const A_PRICE = { input: 1000, cachedInput: 100, output: 2000 }
const PRICED = { currency: 'USD', prices: { [MODEL]: A_PRICE, [OTHER_MODEL]: A_PRICE } }

interface TokenAnswer {
  token: string
  id: string
  run: string
  kind: 'tool'
  expiresAt: number
  pairs: { provider: string; model: string }[]
  spendCap: number
}

let t: TestDb
let app: FastifyInstance
const keys: Record<string, string> = {}
const before: Record<string, string | undefined> = {}
let run = ''
let runKey = ''
/** Every token this file was answered, so the last case can prove none of them was stored. */
const issued: string[] = []

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
const issue = (headers: Record<string, string>, body: unknown) => call('POST', '/api/provider-router/tool-tokens', headers, body)
const asked = (model = MODEL, forRun = run, provider = 'deepseek') => ({ run: forRun, provider, model })
const tokensOf = (forRun: string) =>
  t.client.sqlite.prepare('SELECT id, kind, allowed_pairs, spend_cap, revoked_because FROM run_tokens WHERE run_id = ? ORDER BY issued_at, rowid').all(forRun) as
    { id: string; kind: string; allowed_pairs: string; spend_cap: number; revoked_because: string | null }[]

/** A running session for the worker, as the launcher files one before it asks for any credential. */
async function aRun(runtime: string, model: string, extra: Record<string, unknown> = {}): Promise<string> {
  const reply = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run a tool asks for its own credential', data: {
    runtime, model, servingAgent: WORKER, state: 'running', ...extra,
  } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** As the run's own key: the only caller a tool credential is minted for. */
const asTheRunsOwnKey = (forRun: string, key: string) => ({ ...asAgent(WORKER, key), 'x-mole-office-session': forRun })

/** A running session the office files for itself, so its own key is minted and answers `runKey`. */
async function aRunTheOfficeFiledForItself(): Promise<{ run: string; key: string }> {
  const reply = await call('POST', '/api/records', asTheOffice(), {
    kind: 'session',
    title: 'Synthetic: a run whose own key asks for a tool credential',
    data: { state: 'running', runtime: 'dsh', servingAgent: WORKER, startedByMoleOffice: true },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as { record: { id: string }; runKey?: { key?: string } }
  expect(typeof body.runKey?.key, 'the office filed the run without minting its key').toBe('string')
  return { run: body.record.id, key: String(body.runKey?.key) }
}

async function setPrices(table: unknown) {
  const reply = await call('POST', '/api/office/price-table', AS_THE_PERSON, table === null ? { clear: true } : { table })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** A Casting row for `role`, every project, written as the person. Its id. */
async function aRow(role: string, cells: Record<string, unknown>): Promise<number> {
  const reply = await call('POST', `/api/casting/${role}`, AS_THE_PERSON, { effort: { value: 'high' }, ...cells })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { casting: { id: number } }).casting.id
}

/** A refusal: its status, its sentence, and no credential written for the run. Answers the sentence. */
async function refused(reply: Awaited<ReturnType<typeof call>>, status: number, says: RegExp, forRun = run): Promise<string> {
  expect(reply.statusCode, reply.body).toBe(status)
  const error = (reply.json() as { error: string }).error
  expect(error).toMatch(says)
  expect(reply.body).not.toMatch(/mrt_/)
  expect(tokensOf(forRun)).toEqual([])
  return error
}

beforeAll(async () => {
  for (const name of ['MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) before[name] = process.env[name]
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = CAP
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of [STARTER, STRANGER]) {
    const reply = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role: THE_WORKER, runtime: 'dsh', workArea: ['src'] })
    expect(reply.statusCode, reply.body).toBe(201)
    keys[handle] = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  }
  // THE WORKER IS THE STARTER'S: registered with the starter's own key, so the starter is its registered starter.
  const worker = await call('POST', '/api/agents/started', withKey(keys[STARTER]!), { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'dsh', workArea: ['src'] })
  expect(worker.statusCode, worker.body).toBe(201)
  await setPrices(PRICED)
  const own = await aRunTheOfficeFiledForItself()
  run = own.run
  runKey = own.key
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
})

describe('what the door refuses, with nothing issued', () => {
  // MUTATION: the tool door no longer reads the setting.
  it('refuses while MOLE_OFFICE_PROVIDER_ROUTER is off, naming the setting', async () => {
    const untouchable = await aRunTheOfficeFiledForItself()
    process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'off'
    try {
      await refused(await issue(asTheRunsOwnKey(untouchable.run, untouchable.key), asked(MODEL, untouchable.run)), 409, /MOLE_OFFICE_PROVIDER_ROUTER/, untouchable.run)
    } finally { process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on' }
  })

  // MUTATION: the tool door no longer refuses while no cap is set.
  it('refuses while no run cap is set, naming the cap setting', async () => {
    delete process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP
    try { await refused(await issue(asTheRunsOwnKey(run, runKey), asked()), 409, /MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP/) }
    finally { process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = CAP }
  })

  // MUTATION: the run-key check is removed, and the person, the office, the starter or a stranger is issued a credential.
  it("refuses every caller except the run's own key: the person, the office, the registered starter and a key the office never gave", async () => {
    const strangerRun = await aRun('dsh', MODEL)
    await refused(await issue(withKey(keys[STRANGER]!), asked(MODEL, strangerRun)), 403, /run's own key/, strangerRun)
    const refusedRun = await aRunTheOfficeFiledForItself()
    for (const headers of [AS_THE_PERSON, asTheOffice(), withKey(keys[STARTER]!)]) {
      await refused(await issue(headers, asked(MODEL, refusedRun.run)), 403, /run's own key/, refusedRun.run)
    }
    // THE RUN'S OWN NAME IS NOT ENOUGH: the key must be the one that proves it.
    const madeUpRun = await aRun('dsh', MODEL)
    await refused(await issue({ ...asAgent(WORKER, `not-a-real-run-key-${made}`), 'x-mole-office-session': madeUpRun }, asked(MODEL, madeUpRun)), 403, /run's own key/, madeUpRun)
  })

  it('refuses a body that is not a run, a provider and a model, and a run that is not there', async () => {
    const bodyRun = await aRunTheOfficeFiledForItself()
    const asBodyRun = asTheRunsOwnKey(bodyRun.run, bodyRun.key)
    await refused(await issue(asBodyRun, { run: bodyRun.run }), 400, /provider/, bodyRun.run)
    await refused(await issue(asBodyRun, { ...asked(MODEL, bodyRun.run), casting: {} }), 400, /Unrecognized key/, bodyRun.run)
    await refused(await issue(AS_THE_PERSON, asked(MODEL, 'no-such-run')), 404, /no-such-run/, 'no-such-run')
  })

  // MUTATION: the provider check is removed, and an unrouted provider is minted a credential.
  it('refuses a provider the router does not route, naming the providers it routes', async () => {
    const error = await refused(await issue(asTheRunsOwnKey(run, runKey), asked(MODEL, run, 'a-provider-it-does-not-route')), 400, /does not route a-provider-it-does-not-route/)
    for (const provider of Object.keys(THE_ROUTED_PROVIDERS)) expect(error).toContain(provider)
  })

  // MUTATION: the price check is removed, and an unpriced model is minted a credential.
  it('refuses a token-paid model the price table cannot price in US dollars, with no table, a GBP table and a missing price', async () => {
    const unpriced = await aRunTheOfficeFiledForItself()
    try {
      await setPrices(null)
      await refused(await issue(asTheRunsOwnKey(unpriced.run, unpriced.key), asked(MODEL, unpriced.run)), 409, /No price table is set/, unpriced.run)
      await setPrices({ ...PRICED, currency: 'GBP' })
      await refused(await issue(asTheRunsOwnKey(unpriced.run, unpriced.key), asked(MODEL, unpriced.run)), 409, /US dollars/, unpriced.run)
      await setPrices({ currency: 'USD', prices: { [OTHER_MODEL]: A_PRICE } })
      await refused(await issue(asTheRunsOwnKey(unpriced.run, unpriced.key), asked(MODEL, unpriced.run)), 409, new RegExp(`names no price for ${MODEL}`), unpriced.run)
    } finally { await setPrices(PRICED) }
  })
})

describe('what the door issues', () => {
  it("issues only to the run's own key, and the same pair again replaces that run's tool credential", async () => {
    const first = await issue(asTheRunsOwnKey(run, runKey), asked())
    expect(first.statusCode, first.body).toBe(201)
    const one = first.json() as TokenAnswer
    issued.push(one.token)
    expect(one.kind).toBe('tool')
    expect(one.pairs).toEqual([{ provider: 'deepseek', model: MODEL }])
    expect(one.spendCap).toBe(0.15)
    expect(one.run).toBe(run)
    expect(one.token).toMatch(/^mrt_/)
    expect(one.id).toMatch(/^rt_/)
    expect(typeof one.expiresAt).toBe('number')

    const second = await issue(asTheRunsOwnKey(run, runKey), asked())
    expect(second.statusCode, second.body).toBe(201)
    issued.push((second.json() as TokenAnswer).token)

    const rows = tokensOf(run)
    expect(rows.map((row) => [row.id, row.kind, row.revoked_because])).toEqual([
      [one.id, 'tool', 'replaced'],
      [(second.json() as TokenAnswer).id, 'tool', null],
    ])
    for (const row of rows) {
      expect(JSON.parse(row.allowed_pairs)).toEqual([{ provider: 'deepseek', model: MODEL }])
      expect(row.spend_cap).toBe(0.15)
    }
  })

  // MUTATION: the one-tool-row rule is removed, and a different pair widens the credential.
  it('refuses a different pair rather than widening the run’s tool credential', async () => {
    const wider = await aRunTheOfficeFiledForItself()
    const first = await issue(asTheRunsOwnKey(wider.run, wider.key), asked(MODEL, wider.run))
    expect(first.statusCode, first.body).toBe(201)
    issued.push((first.json() as TokenAnswer).token)
    const reply = await issue(asTheRunsOwnKey(wider.run, wider.key), asked(OTHER_MODEL, wider.run))
    expect(reply.statusCode, reply.body).toBe(409)
    expect((reply.json() as { error: string }).error).toMatch(/already has a router credential for other models/)
    expect(tokensOf(wider.run).map((row) => [row.kind, row.revoked_because])).toEqual([['tool', null]])
    expect(JSON.parse(tokensOf(wider.run)[0]!.allowed_pairs)).toEqual([{ provider: 'deepseek', model: MODEL }])
  })

  // MUTATION: the tool row is not kept apart from the Casting row.
  it('lets a Casting row and a tool row live together, one of each, and gives the tool the shorter expiry', async () => {
    const both = await aRunTheOfficeFiledForItself()
    const now = Date.now()
    const castingExpiry = now + 60_000
    t.client.sqlite.prepare(
      'INSERT INTO run_tokens (id, run_id, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at, kind) ' +
        'VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
    ).run('rt_madeUpCastingRow000000', both.run, 'a-made-up-casting-hash', JSON.stringify([{ provider: 'deepseek', model: MODEL }]), 0.15, now, castingExpiry, 'casting')
    const reply = await issue(asTheRunsOwnKey(both.run, both.key), asked(MODEL, both.run))
    expect(reply.statusCode, reply.body).toBe(201)
    const one = reply.json() as TokenAnswer
    issued.push(one.token)
    expect(one.kind).toBe('tool')
    expect(one.expiresAt).toBeLessThanOrEqual(castingExpiry)
    expect(tokensOf(both.run).map((row) => row.kind)).toEqual(['casting', 'tool'])
    const second = await issue(asTheRunsOwnKey(both.run, both.key), asked(OTHER_MODEL, both.run))
    expect(second.statusCode, second.body).toBe(409)
    expect(tokensOf(both.run).map((row) => [row.kind, row.revoked_because])).toEqual([
      ['casting', null],
      ['tool', null],
    ])
  })

  it('issues for a subscription provider with no price table, and stores no token secret', async () => {
    const go = await aRunTheOfficeFiledForItself()
    try {
      await setPrices(null)
      const reply = await issue(asTheRunsOwnKey(go.run, go.key), { run: go.run, provider: 'opencode-go', model: GO_MODEL })
      expect(reply.statusCode, reply.body).toBe(201)
      const one = reply.json() as TokenAnswer
      issued.push(one.token)
      expect(one.kind).toBe('tool')
      expect(one.pairs).toEqual([{ provider: 'opencode-go', model: GO_MODEL }])
      expect(one.spendCap).toBe(0.15)
    } finally { await setPrices(PRICED) }

    expect(issued.length).toBeGreaterThanOrEqual(5)
    const stored = JSON.stringify(t.client.sqlite.prepare('SELECT * FROM run_tokens').all())
    for (const token of issued) expect(stored.includes(token), 'a router credential was stored in a run_tokens row').toBe(false)
  })
})

describe('a tool token is a tool credential and not a Casting one', () => {
  // MUTATION: the admissions door stops checking the credential's kind.
  it('is refused at the Casting admissions door, and the refusal names its kind', async () => {
    const credential = await aRunTheOfficeFiledForItself()
    const reply = await issue(asTheRunsOwnKey(credential.run, credential.key), asked(MODEL, credential.run))
    expect(reply.statusCode, reply.body).toBe(201)
    const one = reply.json() as TokenAnswer
    issued.push(one.token)
    const admitted = await call('POST', '/api/provider-router/admissions', theOfficesKeyHeader(), { token: one.token, provider: 'deepseek', model: MODEL })
    expect(admitted.statusCode, admitted.body).toBe(200)
    expect(admitted.json()).toMatchObject({
      admitted: false,
      code: 'tool-token-at-casting-door',
      says: RUN_TOKEN_REFUSALS['tool-token-at-casting-door'],
      kind: 'tool',
    })
  })
})

describe('the inspector', () => {
  // MUTATION: the tool door no longer asks the inspector check.
  it('refuses while a Casting row in force for the inspector is one the router must carry, naming the row', async () => {
    const inspector = await aRow(THE_INSPECTOR, { program: { value: 'dsh' }, model: { value: MODEL } })
    const later = await aRunTheOfficeFiledForItself()
    await refused(await issue(asTheRunsOwnKey(later.run, later.key), asked(MODEL, later.run)), 409, new RegExp(`Casting ${String(inspector)} gives the inspector dsh`), later.run)
  })
})
