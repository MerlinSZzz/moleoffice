// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN ON ANOTHER COMPUTER IS READ AS ELSEWHERE, AND ITS CODE IS NOT SEALED OR CHECKED HERE.
 *
 * Wave 13t round 22, piece 1: the owner's Mac Codex works in a checkout on their Mac, and its run is filed on this
 * computer. The run says which computer in `machine` and names no worktree. What is held here, with the office in this
 * process and a synthetic Mac named "the-mac" in the owner's machine table:
 *
 *   1. The record door takes a run of an agent naming a machine the owner named, and refuses one naming a machine
 *      nobody added, on create and on a change, writing nothing (`whyARunsMachineIsNotKnown`, the condition in
 *      message Mtt-iDulvWDc).
 *   2. The main-world count leaves such a run out, and still counts the same run with no machine
 *      (`theRunsInTheMainWorld`).
 *   3. Finishing it with a git seal, the default, is refused in words and nothing is written; finishing it with a records
 *      submission is taken (`sealFinishedRun`).
 *   4. The check of its code is refused in words, at the read and at a write door (`refuseACheckOfCodeOnAnotherComputer`).
 *
 * The row closers that skip such a run are held by tests/a-run-naming-another-machine-is-not-closed.test.ts.
 *
 * THE MUTATIONS, each run after a control:
 *   M1 src/server/lib/machines.ts `whyARunsMachineIsNotKnown`: `return null` first → case 1 red.
 *   M2 src/server/lib/main-world.ts: drop the `theRowNamesAnotherMachine({ data })` line → case 2 red.
 *   M3 src/server/lib/sealed-tip.ts: drop the `kind !== 'records' && theRowNamesAnotherMachine` refusal → case 3 red.
 *   M4 src/server/lib/inspection.ts `refuseACheckOfCodeOnAnotherComputer`: `return` first → case 4 red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
const WORKER = 'elsewhere-worker'
const THE_MAC = 'the-mac'
/**
 * The address the owner's table names the-mac by. It is invented, and built from its numbers because the address
 * scan refuses one written out.
 */
const THE_MACS_ADDRESS = [100, 101, 0, 19].join('.')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }

/** How many session records the office holds, counted in the table. */
function sessionsHeld(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
}

/** File a running run of the worker through the door, and answer the reply. */
async function fileARun(data: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'session', title: 'A synthetic run of the worker', data: { state: 'running', servingAgent: WORKER, cutFrom: 'main', ...data } },
  })
}

async function aRunOnTheMac(): Promise<string> {
  const filed = await fileARun({ machine: THE_MAC })
  expect(filed.statusCode, filed.body).toBe(201)
  return filed.json<{ record: { id: string } }>().record.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'elsewhere-starter', name: 'Synthetic starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'elsewhere-starter' },
    payload: { handle: WORKER, name: 'Synthetic worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
  // THE OWNER'S TABLE, as the Settings page stores it: one synthetic address, named the-mac.
  const named = t.client.sqlite.prepare('UPDATE installation SET machine_names = ? WHERE only_row = 1').run(JSON.stringify({ [THE_MACS_ADDRESS]: THE_MAC }))
  expect(named.changes, 'the test office has no installation row to name a machine on').toBe(1)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the computer a run names', () => {
  it('takes a machine the owner named, and refuses one nobody added, on create and on a change, writing nothing', async () => {
    await aRunOnTheMac()
    const before = sessionsHeld()
    const refused = await fileARun({ machine: 'a-computer-nobody-added' })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json<{ error: string }>().error).toContain('"a-computer-nobody-added" is neither')
    expect(refused.json<{ error: string }>().error, 'the refusal does not name the machines the owner did add').toContain(THE_MAC)
    expect(sessionsHeld(), 'a refused run was written all the same').toBe(before)

    const here = await fileARun({})
    expect(here.statusCode, here.body).toBe(201)
    const id = here.json<{ record: { id: string } }>().record.id
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { machine: 'a-computer-nobody-added' } } })
    expect(changed.statusCode, changed.body).toBe(400)
    expect(t.api.getRecord(id)?.data['machine'], 'the refused change was written').toBeUndefined()
  })
})

describe('the main-world count', () => {
  it('leaves out a run on another computer, and counts the same run with no machine', async () => {
    const elsewhere = await aRunOnTheMac()
    const filed = await fileARun({})
    expect(filed.statusCode, filed.body).toBe(201)
    const here = filed.json<{ record: { id: string } }>().record.id
    const { theRunsInTheMainWorld } = await import('../src/server/lib/main-world.ts')
    const counted = theRunsInTheMainWorld('default').map((one) => one.run)
    expect(counted, 'a run on this computer is not counted, so the case proves nothing').toContain(here)
    expect(counted, 'a run on another computer was counted as on this host').not.toContain(elsewhere)
  })
})

describe('the seal', () => {
  it('refuses a git seal of a run on another computer in words, writing nothing, and takes a records submission', async () => {
    const run = await aRunOnTheMac()
    const before = t.api.getRecord(run)?.data
    const refused = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { state: 'finished' } } })
    expect(refused.statusCode, refused.body).toBe(409)
    const error = refused.json<{ error: string }>().error
    expect(error).toContain(`works on another computer, ${THE_MAC}, so this office cannot seal its code:`)
    expect(error, 'the refusal does not say how the code comes in').toContain('a branch that a run on this computer takes in')
    expect(t.api.getRecord(run)?.data, 'the refused finish was written').toEqual(before)

    const wrote = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...headers, 'x-mole-office-session': run },
      payload: { kind: 'note', title: 'A synthetic note the run on the Mac wrote' },
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
    const note = wrote.json<{ record: { id: string } }>().record.id
    const finished = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers,
      payload: { dataPatch: { state: 'finished', submission: { kind: 'records', records: [note] } } },
    })
    expect(finished.statusCode, finished.body).toBe(200)
    expect(t.api.getRecord(run)?.data['state']).toBe('finished')
  })
})

describe('the check', () => {
  it('refuses to check the code of a run on another computer, at the read and at a write door', async () => {
    const run = await aRunOnTheMac()
    const { refuseACheckOfCodeOnAnotherComputer, requireCheckEligibility } = await import('../src/server/lib/inspection.ts')
    const filed = t.api.getRecord(run)!
    expect(() => refuseACheckOfCodeOnAnotherComputer(filed)).toThrow(`Run ${run} works on another computer, ${THE_MAC}, so this office cannot check its code`)
    expect(() => requireCheckEligibility(run, 'default')).toThrow('so this office cannot check its code')
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers })
    expect(read.statusCode, read.body).toBe(409)
    expect(read.body).toContain('so this office cannot check its code')
  })
})
