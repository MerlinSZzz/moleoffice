// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLAIM TO BE THE PERSON, WITH NO KEY, DOES NOT WRITE A RUN'S SERVED CONDITIONS, over a real listener.
 *
 * `assertMayWriteServed` asks `theProvedPerson`, as the rule on a run's end does: the person's key, or a call no
 * listener carried. While the key window is open, a request from this computer's own program that names the person and
 * carries no key reaches the guard as the person's claim, and the guard refuses it. A request from a sandbox or from a
 * machine the office does not trust, and every keyless request after the close, is refused before the guard, at the
 * door, by actorFrom in src/server/lib/http.ts; this file does not ask those again.
 *
 * THE GATE. Every case runs at the gate's default position, block, except the one that sets it to off: at any position
 * but block the guard only marks the gate met and lets the write through. Its positions are block and off.
 *
 * Every key here is made up, and the office is a fresh test office.
 *
 * Three-run proof: control, then each mutation below with the file copied first, then restore, then the control
 * command again.
 *   node tools/run-named-tests.mjs tests/a-claim-to-be-the-person-writes-no-served-conditions.test.ts
 * Mutations, one line each in src/server/lib/records.ts, and the case each turns red:
 *   A. `assertMayWriteServed`: the `theProvedPerson` line made `if (actor.type === 'human') return`. Cases 1 and 3.
 *   B. `aClaimToBeThePerson` answers '' for every caller. Case 1.
 *   C. `theProvedPerson`: ` || actor.from === undefined` removed. Case 2.
 *   D. `assertMayWriteServed`: `return void met()` made `return`. Case 3.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const SERVED = { model: 'a-made-up-model', temperature: 0.1, briefBytes: 10, contextTokens: { largestTurn: 1, total: 2 } }
const GATE = 'who-writes-a-runs-conditions'
const GATE_SETTING = 'MOLE_OFFICE_GATE_WHO_WRITES_A_RUNS_CONDITIONS'

let t: TestDb
let app: FastifyInstance
let thisMachine = ''

/** A running run, filed from inside the office. */
async function aRun(): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...WORKSPACE, ...PERSON, 'content-type': 'application/json' },
    payload: { kind: 'session', title: 'a made-up run', data: { state: 'running', runtime: 'dsh' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function servedIsStoredOn(run: string): Promise<boolean> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: { ...WORKSPACE, ...PERSON } })
  return Object.hasOwn((read.json() as { record: { data: Record<string, unknown> } }).record.data, 'served')
}

/** The gate's counts so far, all days together. */
function theGatesCounts(): { wouldStop: number; stopped: number } {
  const row = t.client.sqlite
    .prepare('SELECT coalesce(sum(would_stop), 0) AS wouldStop, coalesce(sum(stopped), 0) AS stopped FROM gate_counts WHERE gate = ?')
    .get(GATE) as { wouldStop: number; stopped: number }
  return { wouldStop: row.wouldStop, stopped: row.stopped }
}

/** The run's `served` written over the listener with these headers, on a connection of its own. */
async function servedSentOverTheListener(run: string, headers: Record<string, string>): Promise<{ status: number; error: string }> {
  const r = await fetch(`${thisMachine}/api/records/${run}`, {
    method: 'PATCH',
    headers: { ...WORKSPACE, ...headers, 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify({ dataPatch: { served: SERVED } }),
  })
  const text = await r.text()
  return { status: r.status, error: r.status < 400 ? '' : String((JSON.parse(text) as { error?: unknown }).error ?? '') }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

it("1: refuses this computer's own program that names the person with no key while the key window is open, and stores nothing", async () => {
  const { ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM } = await import('../src/server/lib/records.ts')
  const run = await aRun()
  const sent = await servedSentOverTheListener(run, PERSON)
  expect({ status: sent.status, saysTheKeyCounts: sent.error.includes(ONLY_THE_PERSONS_KEY_PROVES_A_CLAIM), stored: await servedIsStoredOn(run) })
    .toEqual({ status: 403, saysTheKeyCounts: true, stored: false })
})

it('2: still writes it for a call no listener carried that names the person with no key, which is the office itself', async () => {
  const run = await aRun()
  const inside = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: { ...WORKSPACE, ...PERSON, 'content-type': 'application/json' },
    payload: { dataPatch: { served: SERVED } },
  })
  expect({ status: inside.statusCode, stored: await servedIsStoredOn(run) }).toEqual({ status: 200, stored: true })
})

it('3: with the gate off, writes the same claim and only marks the gate met', async () => {
  const run = await aRun()
  const before = theGatesCounts()
  t.client.sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?)').run(GATE_SETTING, 'off')
  try {
    const sent = await servedSentOverTheListener(run, PERSON)
    const after = theGatesCounts()
    expect({ status: sent.status, stored: await servedIsStoredOn(run), met: after.wouldStop - before.wouldStop, stopped: after.stopped - before.stopped })
      .toEqual({ status: 200, stored: true, met: 1, stopped: 0 })
  } finally {
    t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(GATE_SETTING)
  }
})
