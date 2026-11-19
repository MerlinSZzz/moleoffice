// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every check, message and office here is made up. No worker or check tool starts. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let t: TestDb, app: FastifyInstance, folder: string, secretary: string, secretaryHandle: string
let workspace = 'panelx-case-0'
let caseNumber = 0
const person = {type: 'human', id: THE_TEST_OFFICES_OWNER.id} as const
let headers: Record<string, string> = {}
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
}, 60_000)
afterAll(async () => { await app.close(); t.close() })
beforeEach(async () => {
  caseNumber += 1
  workspace = `panelx-case-${String(caseNumber)}`
  folder = mkdtempSync(join(tmpdir(), 'gate-pace-'))
  vi.stubEnv('HOME', folder)
  vi.stubEnv('MOLE_OFFICE_CHECKS_AN_HOUR', '6')
  execFileSync('git', ['init', '-q', '-b', 'main', folder])
  const madeWorkspace = await app.inject({method: 'POST', url: '/api/workspaces', headers: {'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id}, payload: {id: workspace, title: `Mole Office case ${String(caseNumber)}`}})
  expect(madeWorkspace.statusCode, madeWorkspace.body).toBe(201)
  headers = {'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id}
  secretaryHandle = `made-up-cap-secretary-${String(caseNumber)}`
  const made = await app.inject({method: 'POST', url: '/api/agents/started', headers, payload: {handle: secretaryHandle, name: 'Made-up cap secretary', role: 'secretary'}})
  expect(made.statusCode, made.body).toBe(201)
  secretary = made.json().agent.id
  const {registerRepository} = await import('../src/server/lib/repositories.ts')
  registerRepository({workspaceId: workspace, name: 'made-up-pace-lane', root: folder, actor: person})
})
afterEach(async () => {
  t.client.sqlite.prepare("DELETE FROM gate_counts WHERE gate = 'checks-an-hour'").run()
  const retired = await app.inject({method: 'POST', url: `/api/participants/agent/${secretaryHandle}/retire`, headers, payload: {because: 'The case is over.'}})
  expect(retired.statusCode, retired.body).toBe(200)
  vi.unstubAllEnvs()
  rmSync(folder, {recursive: true, force: true})
})
function file(kind: 'session' | 'message', data: Record<string, unknown>) {
  return t.api.createRecord({workspaceId: workspace, kind, title: 'Made-up check pacing record', origin: 'fixture', actor: person, data}).id
}
function count() { return t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'checks-an-hour'").get() }
it('counts just before the one secretary message, and neither queue pace reads nor repeated held sentences count', async () => {
  const run = file('session', {state: 'crashed'})
  const check = file('message', {body: 'Made-up check request', to: [{kind: 'agent', id: secretary}], aboutRun: run})
  // A synthetic pending check, as the inspection door stores it; no real inspection is asked for.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck', json(?)) WHERE id = ?").run(JSON.stringify({message: check}), run)
  for (let i = 0; i < 6; i++) file('session', {state: 'crashed', extra: {purpose: 'inspection', inspectionRun: run}})
  const {tellTheSecretaryACheckWaitsItsTurn, thePaceOfACheckOf, theChecksStartedInTheLastHour} = await import('../src/server/lib/checks-an-hour.ts')
  const {mergedEnvironment} = await import('../src/config/settings.mjs')
  const paced = () => thePaceOfACheckOf(run, workspace, mergedEnvironment(), theChecksStartedInTheLastHour())
  expect(paced()).toMatchObject({started: 6, most: 6})
  expect(paced()).toMatchObject({started: 6, most: 6})
  expect(count()).toBeUndefined()
  const first = tellTheSecretaryACheckWaitsItsTurn(check, workspace)
  expect(first?.message).toEqual(expect.any(String))
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  const again = tellTheSecretaryACheckWaitsItsTurn(check, workspace)
  expect(again?.message).toBe(first?.message)
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
})
it('does not count an ordinary held message or a check below the cap', async () => {
  const {tellTheSecretaryACheckWaitsItsTurn} = await import('../src/server/lib/checks-an-hour.ts')
  const ordinary = file('message', {body: 'Made-up ordinary held message', to: [{kind: 'agent', id: secretary}]})
  expect(tellTheSecretaryACheckWaitsItsTurn(ordinary, workspace)).toBeNull()
  const run = file('session', {state: 'crashed'})
  const check = file('message', {body: 'Made-up check below the cap', to: [{kind: 'agent', id: secretary}], aboutRun: run})
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck', json(?)) WHERE id = ?").run(JSON.stringify({message: check}), run)
  expect(tellTheSecretaryACheckWaitsItsTurn(check, workspace)).toBeNull()
  expect(count()).toBeUndefined()
})
