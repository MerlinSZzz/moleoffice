// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Problem CeWpdlseVgyE: a retired row and a live row can share a run's stored handle.
 * The finish and every revision read the live row's stored id. Both cases go red when
 * theAgentOfARunAmong calls theAgentARunServes with servingAgentId removed.
 * All records and the Git checkout here are synthetic and belong to this test office.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const handle = 'synthetic-returning-worker'
const headers = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'synthetic-starter',
}
let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let directory: string
let runId: string
let liveId: string
let retiredId: string

function git(...args: string[]): string {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  inspection = await import('../src/server/lib/inspection.ts')
  worker = await import('../src/server/lib/worker.ts')
  seals = await import('../src/server/lib/sealed-tip.ts')
  participants = await import('../src/server/lib/participants.ts')
  const starter = await app.inject({
    method: 'POST', url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    payload: { handle: 'synthetic-starter', name: 'Synthetic starter', role: 'secretary' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const earlier = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: 'Synthetic earlier worker', role: 'worker', workArea: ['earlier'] },
  })
  expect(earlier.statusCode, earlier.body).toBe(201)
  retiredId = earlier.json().agent.id
  const retired = await app.inject({
    method: 'POST', url: `/api/participants/agent/${retiredId}/retire`, headers,
    payload: { because: 'This synthetic worker has finished its task.' },
  })
  expect(retired.statusCode, retired.body).toBe(200)
  const live = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: 'Synthetic current worker', role: 'worker', workArea: ['work'] },
  })
  expect(live.statusCode, live.body).toBe(201)
  liveId = live.json().agent.id
  expect(liveId).not.toBe(retiredId)

  directory = mkdtempSync(join(tmpdir(), 'run-agent-id-'))
  git('init', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic run agent fixture')
  mkdirSync(join(directory, 'work'))
  writeFileSync(join(directory, 'work', 'a.txt'), 'before\n')
  git('add', '.')
  git('commit', '-m', 'Synthetic baseline')
  git('switch', '-c', 'work')
  writeFileSync(join(directory, 'work', 'a.txt'), 'submitted\n')
  git('add', '.')
  git('commit', '-m', 'Synthetic submission')
  const actor = { type: 'agent' as const, id: liveId }
  runId = t.api.createRecord({
    kind: 'session', title: 'Synthetic run of a newly registered worker', origin: 'fixture',
    workspaceId: 'default', actor,
    data: { state: 'running', servingAgent: handle, servingAgentId: liveId, workingDirectory: directory, cutFrom: 'main', tip: git('rev-parse', 'HEAD') },
  }).id
  for (let i = 1; i < 30; i += 1) {
    t.api.patchRecord(runId, { dataPatch: { doing: `Synthetic step ${i}` } }, actor)
  }
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

it('finishes the live row run and writes its seal despite the retired row sharing its handle', async () => {
  const reply = await app.inject({
    method: 'PATCH', url: `/api/records/${runId}`, headers,
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(t.api.getRecord(runId)?.data['state']).toBe('finished')
  const held = seals.readRunSeal(runId)
  expect(held?.seal.git?.commit).toBe(git('rev-parse', 'HEAD'))
  expect(held?.seal.area).toEqual(['work'])

  const run = t.api.getRecord(runId)!
  expect(inspection.theAgentOfARun(run)?.id).toBe(liveId)
  expect(inspection.theAgentOfARunForItsSeal(run)?.id).toBe(liveId)
  expect(worker.theAgentARunServes(run.data)?.id).toBe(liveId)
  expect(inspection.theAgentsOfTheseRuns([run]).get(runId)).toBe(liveId)
  const earlier = participants.listParticipants().agents.filter((one) => one.id === retiredId)
  expect(earlier).toHaveLength(1)
  expect(inspection.theAgentsOfTheseRuns([run], () => earlier).get(runId)).toBeNull()

  for (const data of [
    { servingAgent: handle, servingAgentId: 'absent-registry-id' },
    { servingAgentId: 'absent-registry-id', ranAs: [{ workspaceId: 'default', agentId: liveId }] },
  ]) {
    const missing = { ...run, data }
    expect(inspection.theAgentOfARun(missing)).toBeNull()
    expect(inspection.theAgentOfARunForItsSeal(missing)).toBeNull()
    expect(worker.theAgentARunServes(data)).toBeNull()
  }
  expect(inspection.theAgentOfARun({ data: { servingAgent: handle } })).toBeNull()
  expect(worker.theAgentARunServes({ servingAgent: handle })).toBeNull()
})

it('allows a check when every revision carries the reused handle and the live row id', async () => {
  const revisions = t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ?').all(runId) as { data: string }[]
  expect(revisions.length).toBeGreaterThanOrEqual(30)
  for (const revision of revisions) {
    expect(JSON.parse(revision.data)).toMatchObject({ servingAgent: handle, servingAgentId: liveId })
  }
  const run = t.api.getRecord(runId)!
  expect(inspection.resolveCheckEligibilityFacts(run).noInspector).toBe(true)
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${runId}/eligibility`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({ eligible: true, missing: [] })

  const { servingAgent: omitted, ...byId } = run.data
  expect(omitted).toBe(handle)
  expect(inspection.resolveCheckEligibilityFacts({ ...run, data: byId })).toMatchObject({ workerServed: true, noInspector: true })
  expect(inspection.resolveCheckEligibilityFacts({ ...run, data: { ...run.data, servingAgentId: 'absent-registry-id' } }))
    .toMatchObject({ workerServed: false, noInspector: null })
})
