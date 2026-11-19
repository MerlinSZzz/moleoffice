// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUTER CREDENTIAL TAKES ITS MODELS FROM THE CASTING ROW THE RUN WAS STARTED FROM, AND FROM NOTHING ELSE.
 *
 * OLD: the run-token store (src/server/lib/keyrouter/run-tokens.ts) could mint a credential for any pairs a caller gave
 * it, and no door reached it.
 * NEW: POST /api/provider-router/run-tokens issues a run's credential from a Casting row's native data, and refuses:
 * while MOLE_OFFICE_PROVIDER_ROUTER is off; while no run cap is set; to a caller who is not the person, the office or
 * the registered starter of the agent the run serves; for a legacy, held, changed or unrouted row; for a run that was
 * not started from the row; and while the price table cannot count the model's spend in US dollars. A second issue for
 * the same run and models replaces the first. While a Casting row in force for the inspector uses dsh, the office
 * refuses to start with the setting on, and the door refuses too, naming the row: check views and isolated execs get
 * no DeepSeek key while the router is on.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, with the setting on only in
 * this process. Every row, price and run is written through the office's own doors as the person or an agent; nothing
 * ran. Every model name is made up for each run of this file. No key of any provider is read or used.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the door takes its pairs from the request or the run rather than the row: the issue case goes red on the pairs.
 *   - the door forgets a refusal: that refusal's case goes red on a 201.
 *   - the start check is removed: the inspector case goes red on an office that starts.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CastingSelection } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const withKey = (key: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key })
const STARTER = 'router-starter'
const WORKER = 'router-worker'
const STRANGER = 'router-stranger'
const CAP = '0.15'
/** Made up for each run, so no shipped model name is relied on. */
const made = randomUUID()
const NATIVE = `made-up-deepseek-${made}`
const OFFICE_MODEL = `made-up-office-${made}`
const PRICED = { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } }

let t: TestDb
let app: FastifyInstance
const keys: Record<string, string> = {}
const before: Record<string, string | undefined> = {}
let routed: { row: number; selection: CastingSelection }
let run = ''

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
const issue = (headers: Record<string, string>, body: unknown) => call('POST', '/api/provider-router/run-tokens', headers, body)
const asked = (selection: CastingSelection, forRun = run) => ({ run: forRun, casting: { id: selection.casting!.id, revision: selection.casting!.revision } })
const tokensOf = (forRun: string) =>
  t.client.sqlite.prepare('SELECT id, allowed_pairs, spend_cap, revoked_because FROM run_tokens WHERE run_id = ? ORDER BY issued_at, rowid').all(forRun) as
    { id: string; allowed_pairs: string; spend_cap: number; revoked_because: string | null }[]

/** A Casting row for `role`, every project, written as the person. Its id. */
async function aRow(role: string, cells: Record<string, unknown>): Promise<number> {
  const reply = await call('POST', `/api/casting/${role}`, AS_THE_PERSON, { effort: { value: 'high' }, ...cells })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { casting: { id: number } }).casting.id
}
async function theSelectionOf(row: number): Promise<CastingSelection> {
  const read = await call('GET', `/api/casting/rows/${String(row)}/selection`, AS_THE_PERSON)
  expect(read.statusCode, read.body).toBe(200)
  return (read.json() as { selection: CastingSelection }).selection
}
/** A dsh row through DeepSeek's own service, with the made-up native model unless another is given. */
async function aDshRow(role = THE_WORKER, native: Record<string, unknown> = {}) {
  const row = await aRow(role, { program: { value: 'dsh' }, model: { value: OFFICE_MODEL }, native: { model: NATIVE, provider: 'deepseek-official', variant: null, ...native } })
  return { row, selection: await theSelectionOf(row) }
}
/** A running session for the worker, as the launcher files one before it asks for the credential. */
async function aRun(runtime: string, model: string, extra: Record<string, unknown> = {}): Promise<string> {
  const reply = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run the router is asked about', data: {
    runtime, model, servingAgent: WORKER, state: 'running', ...extra,
  } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}
async function setPrices(table: unknown) {
  const reply = await call('POST', '/api/office/price-table', AS_THE_PERSON, table === null ? { clear: true } : { table })
  expect(reply.statusCode, reply.body).toBe(200)
}
/** A refusal: its status, its sentence, and no credential written for the run. */
async function refused(reply: Awaited<ReturnType<typeof call>>, status: number, says: RegExp, forRun = run) {
  expect(reply.statusCode, reply.body).toBe(status)
  expect((reply.json() as { error: string }).error).toMatch(says)
  expect(reply.body).not.toMatch(/mrt_/)
  expect(tokensOf(forRun)).toEqual([])
}

beforeAll(async () => {
  for (const name of ['MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) before[name] = process.env[name]
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = CAP
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, headers] of [[STARTER, AS_THE_PERSON], [STRANGER, AS_THE_PERSON]] as const) {
    const reply = await call('POST', '/api/agents/started', headers, { handle, name: handle, role: THE_WORKER, runtime: 'dsh', workArea: ['src'] })
    expect(reply.statusCode, reply.body).toBe(201)
    keys[handle] = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  }
  // THE WORKER IS THE STARTER'S: registered with the starter's own key, so the starter is its registered starter.
  const worker = await call('POST', '/api/agents/started', withKey(keys[STARTER]!), { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'dsh', workArea: ['src'] })
  expect(worker.statusCode, worker.body).toBe(201)
  await setPrices(PRICED)
  routed = await aDshRow()
  run = await aRun('dsh', OFFICE_MODEL)
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
})

describe('what the door refuses, with nothing issued', () => {
  // MUTATION: the doors no longer read the setting.
  it('refuses every door while MOLE_OFFICE_PROVIDER_ROUTER is off, naming the setting', async () => {
    process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'off'
    try {
      await refused(await issue(AS_THE_PERSON, asked(routed.selection)), 409, /MOLE_OFFICE_PROVIDER_ROUTER/)
      for (const [method, url] of [['POST', '/api/provider-router/admissions'], ['POST', '/api/provider-router/receipts'], ['GET', `/api/provider-router/receipts?run=${run}`]] as const) {
        const reply = await call(method, url, theOfficesKeyHeader(), method === 'POST' ? {} : undefined)
        expect(reply.statusCode, `${url}: ${reply.body}`).toBe(409)
        expect(reply.body, url).toMatch(/MOLE_OFFICE_PROVIDER_ROUTER/)
      }
    } finally { process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on' }
  })

  it('refuses while no run cap is set, naming the cap setting', async () => {
    delete process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP
    try { await refused(await issue(AS_THE_PERSON, asked(routed.selection)), 409, /MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP/) }
    finally { process.env.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP = CAP }
  })

  it("refuses a caller who is not the person, the office, or the registered starter of the run's agent", async () => {
    await refused(await issue(withKey(keys[STRANGER]!), asked(routed.selection)), 403, /starter/)
  })

  it('refuses a request that is not a run and a Casting row, and a run that is not there', async () => {
    await refused(await issue(AS_THE_PERSON, { run }), 400, /casting/)
    await refused(await issue(AS_THE_PERSON, asked(routed.selection, 'no-such-run')), 404, /no-such-run/, 'no-such-run')
  })

  // MUTATION: the door reads a legacy row's compatibility data instead of refusing it.
  it('refuses a legacy row, which carries no native model', async () => {
    const legacy = await aRow(THE_WORKER, { program: { value: 'dsh' }, model: { value: OFFICE_MODEL } })
    const listed = (await call('GET', '/api/casting', AS_THE_PERSON)).json() as { roles: { scopes: { castings: { id: number; selectionRevision: string }[] }[] }[] }
    const revision = listed.roles.flatMap((role) => role.scopes.flatMap((scope) => scope.castings)).find((one) => one.id === legacy)!.selectionRevision
    await refused(await issue(AS_THE_PERSON, { run, casting: { id: legacy, revision } }), 409, new RegExp(`Casting ${String(legacy)} has no native`))
  })

  it('refuses a row changed after it was selected, with the Casting door’s own sentence', async () => {
    const changed = await aDshRow()
    const patched = await call('PATCH', `/api/casting/rows/${String(changed.row)}`, AS_THE_PERSON, { effort: { value: 'low' } })
    expect(patched.statusCode, patched.body).toBe(200)
    await refused(await issue(AS_THE_PERSON, asked(changed.selection)), 409, new RegExp(`Casting ${String(changed.row)} changed after it was selected`))
  })

  it('refuses a held row, with the hold’s own sentence', async () => {
    const held = await aDshRow()
    const heldRun = await aRun('dsh', OFFICE_MODEL, { extra: { launcherSelection: held.selection } })
    const reply = await call('POST', `/api/casting/rows/${String(held.row)}/hold`, AS_THE_PERSON, {
      revision: held.selection.casting!.revision, run: heldRun, refusal: { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    await refused(await issue(AS_THE_PERSON, asked(held.selection, heldRun)), 409, new RegExp(`Casting ${String(held.row)} is held`), heldRun)
  })

  it('refuses a row through another provider or another program, naming what it routes', async () => {
    const other = await aDshRow(THE_WORKER, { provider: 'another-made-up-provider' })
    await refused(await issue(AS_THE_PERSON, asked(other.selection)), 409, /routes only dsh through deepseek-official/)
    const claude = await aRow(THE_WORKER, { program: { value: 'claude-code' }, model: { value: OFFICE_MODEL }, native: { model: NATIVE, provider: null, variant: null } })
    await refused(await issue(AS_THE_PERSON, asked(await theSelectionOf(claude))), 409, /routes only dsh through deepseek-official/)
  })

  // MUTATION: the door takes the row the caller names without comparing it with the run.
  it('refuses a run that was not started from the row', async () => {
    const elsewhere = await aRun('dsh', `another-${OFFICE_MODEL}`)
    await refused(await issue(AS_THE_PERSON, asked(routed.selection, elsewhere)), 409, new RegExp(`not started from Casting ${String(routed.row)}`), elsewhere)
  })

  it('refuses while the price table cannot count the model’s spend in US dollars', async () => {
    try {
      await setPrices(null)
      await refused(await issue(AS_THE_PERSON, asked(routed.selection)), 409, /No price table is set/)
      await setPrices({ ...PRICED, currency: 'GBP' })
      await refused(await issue(AS_THE_PERSON, asked(routed.selection)), 409, /US dollars/)
      await setPrices({ currency: 'USD', prices: { [`another-${NATIVE}`]: PRICED.prices[NATIVE] } })
      await refused(await issue(AS_THE_PERSON, asked(routed.selection)), 409, new RegExp(`names no price for ${NATIVE}`))
    } finally { await setPrices(PRICED) }
  })
})

describe('what the door issues', () => {
  // MUTATION: the pairs come from the run's model instead of the row's native data.
  it("issues to the person, the starter's key and the office, from the row's native model, and each issue replaces the last", async () => {
    const first = await issue(AS_THE_PERSON, asked(routed.selection))
    expect(first.statusCode, first.body).toBe(201)
    const one = first.json() as { token: string; id: string; run: string; kind: string; expiresAt: number; pairs: unknown; spendCap: number }
    expect(one).toEqual({ token: expect.stringMatching(/^mrt_[A-Za-z0-9_-]{43}$/), id: expect.stringMatching(/^rt_/), run, kind: 'casting', expiresAt: expect.any(Number), pairs: [{ provider: 'deepseek', model: NATIVE }], spendCap: 0.15, narrowedByPermission: null })
    const second = await issue(withKey(keys[STARTER]!), asked(routed.selection))
    expect(second.statusCode, second.body).toBe(201)
    const third = await issue(theOfficesKeyHeader(), asked(routed.selection))
    expect(third.statusCode, third.body).toBe(201)
    const tokens = new Set([one.token, (second.json() as { token: string }).token, (third.json() as { token: string }).token])
    expect(tokens.size).toBe(3)
    const rows = tokensOf(run)
    expect(rows.map((row) => [row.id, row.revoked_because])).toEqual([[one.id, 'replaced'], [(second.json() as { id: string }).id, 'replaced'], [(third.json() as { id: string }).id, null]])
    for (const row of rows) {
      expect(JSON.parse(row.allowed_pairs)).toEqual([{ provider: 'deepseek', model: NATIVE }])
      expect(row.spend_cap).toBe(0.15)
    }
    // The store keeps a hash of each credential, never the credential.
    const stored = JSON.stringify(t.client.sqlite.prepare('SELECT * FROM run_tokens').all())
    for (const token of tokens) expect(stored).not.toContain(token)
  })

  it('refuses a run whose credential allows other models, rather than widening it', async () => {
    const wider = await aRun('dsh', OFFICE_MODEL)
    const first = await issue(AS_THE_PERSON, asked(routed.selection, wider))
    expect(first.statusCode, first.body).toBe(201)
    const otherModel = await aRow(THE_WORKER, { program: { value: 'dsh' }, model: { value: OFFICE_MODEL }, native: { model: `another-${NATIVE}`, provider: 'deepseek-official', variant: null } })
    const reply = await issue(AS_THE_PERSON, asked(await theSelectionOf(otherModel), wider))
    expect(reply.statusCode, reply.body).toBe(409)
    expect((reply.json() as { error: string }).error).toMatch(/already has a router credential for other models/)
    expect(tokensOf(wider).map((row) => row.revoked_because)).toEqual([null])
  })
})

describe('the inspector', () => {
  // The second condition. MUTATION: the start check is removed.
  it('refuses to start the office, and to issue, while a Casting row in force for the inspector uses dsh, naming the row', async () => {
    const inspector = await aRow(THE_INSPECTOR, { program: { value: 'dsh' }, model: { value: OFFICE_MODEL } })
    const named = new RegExp(`Casting ${String(inspector)} gives the inspector dsh`)
    const later = await aRun('dsh', OFFICE_MODEL)
    await refused(await issue(AS_THE_PERSON, asked(routed.selection, later)), 409, named, later)
    await expect(apiApp()).rejects.toThrow(named)
    // With the setting off the same office starts, so the refusal is the setting's and not the row's.
    process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'off'
    try {
      const started = await apiApp()
      await started.app.ready()
      await started.app.close()
    } finally { process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on' }
  })
})
