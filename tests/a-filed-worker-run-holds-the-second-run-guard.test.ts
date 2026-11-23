// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A filed worker run holds the second-run guard until it ends or gets a process row.
 * a and b: the door and hand refusals preserve the asking run; removing either filed-run refusal makes its case red.
 * c: an ended run does not hold the guard; removing the ended-state exclusion makes it red.
 *    Its ended state is written into the stored run, because the office refuses to file a finished run that declares no submission.
 * d: a released process row leaves the run to the live-process reading; ignoring released rows makes it red.
 * e: another worker's filed run does not hold this worker; removing the served-agent comparison makes it red.
 * f: a run under another asking run does not hold this ask; removing the parent comparison makes it red.
 * All records, agents, process rows, and sandbox contents in this file are made up.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let previousMode: string | undefined
let folder = ''
let brief = ''
let bossKey = ''
let bossId = ''
let asking = ''
let otherAsking = ''
const bossHandle = ['made', 'up', 'guard', 'supervisor'].join('-')
const handle = (n: number) => ['made', 'up', 'guard', 'worker', String(n)].join('-')
const workers = new Map<number, string>()
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asBoss = () => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': bossHandle, 'x-mole-office-key': bossKey, 'x-mole-office-session': asking })
async function call(url: string, payload: object, headers: Record<string, string> = asBoss()) {
  const r = await app.inject({ method: 'POST', url, headers, payload })
  return { status: r.statusCode, body: r.json() as Record<string, any> }
}
const dataOf = (id: string): Record<string, any> => JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
const written = () => ['records', 'revisions', 'held_keys', 'session_resources'].map(table => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
const ask = (n: number) => call(`/api/agents/${handle(n)}/worker-run`, { brief })
function filed(n: number, parent = asking, state = 'running'): string {
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'A made-up filed worker run', origin: 'fixture', actor: { type: 'agent', id: bossId },
    data: { state, runtime: 'claude-code', servingAgent: handle(n), servingAgentId: workers.get(n)!, parentAttachment: parent },
  }).id
}

beforeAll(async () => {
  previousMode = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const supervisor = await call('/api/agents/started', { handle: bossHandle, name: 'Made-up supervisor', role: 'supervisor' }, person)
  expect(supervisor.status, supervisor.body.error).toBe(201)
  bossId = String(supervisor.body.agent.id)
  bossKey = String(supervisor.body.whatToGiveIt.key)
  for (let n = 0; n < 7; n++) {
    const worker = await call('/api/agents/started', { handle: handle(n), name: 'Made-up worker', noKey: true }, { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': bossHandle, 'x-mole-office-key': bossKey })
    expect(worker.status, worker.body.error).toBe(201)
    workers.set(n, String(worker.body.agent.id))
  }
  folder = join(dirname(t.file), 'made-up-guard-sandbox')
  mkdirSync(folder, { recursive: true })
  const repo = aMadeUpSandboxRepo(folder, fileURLToPath(new URL('..', import.meta.url)))
  brief = join(folder, 'brief.md')
  writeFileSync(brief, 'A made-up brief.\n')
  const container = `made-up-${randomBytes(5).toString('hex')}`
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-11-22 09:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-made-up-guard-sandbox', `Sandbox made-up-guard-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  const supervisorRun = () => t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up asking run', origin: 'fixture', actor: t.api.HUMAN,
    data: { state: 'running', servingAgent: bossHandle, servingAgentId: bossId, runtime: 'claude-code', workingDirectory: repo.repo, sandbox: { folder, container, template: 'mole-office-dev' } },
  }).id
  asking = supervisorRun()
  otherAsking = supervisorRun()
  const model = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find(name => !name.includes('/') && name !== 'gpt-6-luna' && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS['claude-code'])}/${name}`))
  expect(model).toBeDefined()
  const cast = await call('/api/casting/worker', { program: { value: 'claude-code' }, model: { value: model }, effort: { value: 'high' } }, person)
  expect(cast.status, cast.body.error).toBe(201)
}, 60_000)

afterAll(async () => {
  if (previousMode === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = previousMode
  await app?.close()
  t?.close()
})

it('a: refuses a door ask while the filed run has no process row and preserves the ask', async () => {
  const run = filed(0)
  const before = dataOf(asking).workerRuns
  const counts = written()
  const r = await ask(0)
  expect(r.status, r.body.error).toBe(409)
  expect(r.body.error).toContain(`Run ${run} was filed for ${handle(0)} under run ${asking} and has not ended, so a worker run would be a second run of it. Ask again when that run has ended. Nothing was written.`)
  expect(dataOf(asking).workerRuns).toEqual(before)
  expect(written()).toEqual(counts)
})

it('b: refuses a hand ask while the filed run has no process row and writes nothing', async () => {
  const run = filed(1)
  const before = dataOf(asking).workerRuns
  const counts = written()
  const r = await call(`/api/agents/${handle(1)}/hand-run`, { askedBy: asking, brief })
  expect(r.status, r.body.error).toBe(409)
  expect(r.body.error).toContain(`Run ${run} was filed for ${handle(1)} under run ${asking} and has not ended, so wait for it to end before starting it with --asked-by (askedBy) and --brief (brief), or through the worker-run door; nothing was started.`)
  expect(dataOf(asking).workerRuns).toEqual(before)
  expect(written()).toEqual(counts)
})

it('c: takes an ask after the filed run ended', async () => {
  const run = filed(2)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  const r = await ask(2)
  expect(r.status, r.body.error).toBe(202)
})

it('d: takes an ask when the running record has a released process row', async () => {
  const run = filed(3)
  const row = await call('/api/resources', { sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'A made-up process', adopting: 'The test process stands for the made-up worker.' }, person)
  expect(row.status, row.body.error).toBe(201)
  t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE id = ?').run('2026-11-22 09:01:00', row.body.resource.id)
  const r = await ask(3)
  expect(r.status, r.body.error).toBe(202)
})

it('e: takes an ask when the filed run serves another worker', async () => {
  filed(4)
  const r = await ask(5)
  expect(r.status, r.body.error).toBe(202)
})

it('f: takes an ask when the worker is filed under another run of the supervisor', async () => {
  filed(6, otherAsking)
  const r = await ask(6)
  expect(r.status, r.body.error).toBe(202)
})
