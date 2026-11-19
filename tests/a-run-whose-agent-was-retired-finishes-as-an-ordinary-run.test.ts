// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WHOSE AGENT WAS RETIRED FINISHES AS AN ORDINARY RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON THE OWNER'S OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2plCt-8-b-pW`. Session `bO306uhlFxqZ` — Supervisor SF — Cluster F, filed 11 September
 * 2026, bound to its agent — still said running on 16 September, and PATCHing state
 * `finished` answered 409 "The run cannot finish: its agent is not registered." The agent's row was
 * in the registry the whole time, retired after the cluster's work landed.
 *
 * WHY THE ANSWER WAS NULL. The finish's seal asks `theAgentOfARun` which agent the run worked as. A
 * run that binds itself in `ranAs` (and writes no `servingAgent`) is read through that function's
 * ranAs branch, which resolves the binding with `agentForRecord` alone — the join from an agent
 * RECORD id. A binding that names the agent by the REGISTRY row id — the spelling `bO306uhlFxqZ`
 * holds, and the id of a registry row in this installation is its handle again — is the same miss
 * that run `o2RjuOUEIwpf` met with `servingAgent` (see the header of `theAgentOfARun`): three names
 * a run writes for one agent, one reader. Nothing about retirement widens that miss, so the refusal
 * said "not registered" about an agent that was registered and merely retired.
 *
 * WHAT THIS PROVES. The seal reads the agent by whatever row the binding names, whether that row is
 * retired or not. A binding naming nothing in the registry is still refused, with a sentence that
 * names the field it read and the name nothing answered to.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Delete the stored-string fallback in `theSealsReadingOfARunsAgent`
 *     (src/server/lib/inspection.ts), leaving it answering `agentForRecord` alone, and this file
 *     goes red on the first case: the finish refuses with
 *     'The run cannot finish: its record names the agent "<the row id>" in data.ranAs, and no
 *     registered agent answers to that name.'
 *     because the binding names the row by its registry id.
 *   - The never-existed case must stay refused by that same sentence WITH and WITHOUT the fallback:
 *     it is what proves the widening did not open the door to nothing.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const directories: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A checkout the seal can read: the area `work` is one folder, committed on main and finished on top. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'finish-door-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic finish-door fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

async function finish(id: string): Promise<number> {
  const reply = await app.inject({
    method: 'PATCH',
    url: '/api/records/' + id,
    headers: asAgent('starter'),
    payload: { dataPatch: { state: 'finished' } },
  })
  return reply.statusCode
}

/** The agent's registry ROW id, read the way a check reader reads it. */
async function theRowIdOf(handle: string): Promise<string> {
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: asAgent('starter') })
  const found = (listed.json() as { agents: { handle: string; id: string; record: string | null }[] }).agents.find(
    (one) => one.handle === handle,
  )
  expect(found ?? null, `no agent answers to ${handle}`).not.toBeNull()
  return found!.id
}

let workerRowId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  // The product's own doors: the person starts a starter, the starter starts the worker.
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent('starter'), payload: { handle: 'worker-retired', name: 'Synthetic retired worker', workArea: ['work', 'records'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  workerRowId = await theRowIdOf('worker-retired')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
})

describe('a run whose agent was retired', () => {
  it('finishes once the starter has retired the agent through the retire door', async () => {
    // The binding names the registry ROW, the spelling run `bO306uhlFxqZ` holds on the owner’s office.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('starter'),
      payload: {
        kind: 'session',
        title: 'Cluster fixture run, bound by the registry row id',
        data: {
          state: 'running',
          ranAs: [{ workspaceId: WORKSPACE, agentId: workerRowId }],
          workingDirectory: tree(),
          cutFrom: 'main',
        },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id

    const retired = await app.inject({ method: 'POST', url: '/api/participants/agent/worker-retired/retire', headers: asAgent('starter'), payload: { because: 'the work it was started for has landed' } })
    expect(retired.statusCode, retired.body).toBe(200)
    expect((retired.json() as { agent: { retired: boolean } }).agent.retired).toBe(true)

    expect(await finish(id), 'the finish refused a run whose agent is registered and retired').toBe(200)
    expect(t.api.getRecord(id)?.data['state']).toBe('finished')
    expect(seals.readRunSeal(id)).not.toBeNull()
  })

  it("also finishes the product's own binding, by the agent record id, a run started for the agent before it was retired", async () => {
    // A run started FOR the agent, through the attachments door, which writes `ranAs` with the
    // agent RECORD id — the spelling every run the office files today carries. The agent is
    // already retired by the case above.
    const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: asAgent('starter') })
    const record = (listed.json() as { agents: { handle: string; record: string | null }[] }).agents.find((one) => one.handle === 'worker-retired')?.record
    expect(record ?? '', 'the agent record could not be read').not.toBe('')
    const opened = await app.inject({ method: 'POST', url: '/api/attachments', headers: asAgent('starter'), payload: { title: 'Cluster fixture attachment', agentId: record, workingDirectory: tree() } })
    expect(opened.statusCode, opened.body).toBe(200)
    const id = (opened.json() as { attachment: { id: string } }).attachment.id
    expect(await finish(id)).toBe(200)
    expect(t.api.getRecord(id)?.data['state']).toBe('finished')
  })

  it("is still refused, naming the field and the name, when the binding names an agent that never existed", async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('starter'),
      payload: {
        kind: 'session',
        title: 'Cluster fixture run, bound by a name nothing answers to',
        data: {
          state: 'running',
          ranAs: [{ workspaceId: WORKSPACE, agentId: 'no-such-agent-ever' }],
          workingDirectory: tree(),
          cutFrom: 'main',
        },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/records/' + id,
      headers: asAgent('starter'),
      payload: { dataPatch: { state: 'finished' } },
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { error: string }).error).toBe(
      'The run cannot finish: its record names the agent "no-such-agent-ever" in data.ranAs, and no registered agent answers to that name.',
    )
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('is refused, saying its record names no agent, when it names none in any of the three fields', async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('starter'),
      payload: {
        kind: 'session',
        title: 'Cluster fixture run, naming no agent at all',
        data: { state: 'running' },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/records/' + id,
      headers: asAgent('starter'),
      payload: { dataPatch: { state: 'finished', submission: { kind: 'records', records: [] } } },
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { error: string }).error).toBe(
      'The run cannot finish: its record names no agent. A run names its agent in data.servingAgent (a handle), data.servingAgentId (a registry id) or one data.ranAs binding in its project, and this record names an agent in none of them.',
    )
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('is refused, naming servingAgent, when that handle names no agent', async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('starter'),
      payload: {
        kind: 'session',
        title: 'Cluster fixture run, serving a handle nothing answers to',
        data: {
          state: 'running',
          servingAgent: 'no-such-handle-ever',
          workingDirectory: tree(),
          cutFrom: 'main',
        },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/records/' + id,
      headers: asAgent('starter'),
      payload: { dataPatch: { state: 'finished' } },
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { error: string }).error).toBe(
      'The run cannot finish: its record names the agent "no-such-handle-ever" in data.servingAgent, and no registered agent answers to that name.',
    )
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(seals.readRunSeal(id)).toBeNull()
  })
})

describe('the reader the seal reads', () => {
  it('answers a registry row the plain reading cannot reach, whether it is retired or not', async () => {
    const inspection = await import('../src/server/lib/inspection.ts')
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('starter'),
      payload: {
        kind: 'session',
        title: 'Cluster fixture run for the reader itself',
        data: { state: 'running', ranAs: [{ workspaceId: WORKSPACE, agentId: workerRowId }] },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const run = t.api.getRecord((filed.json() as { record: { id: string } }).record.id)!
    expect(inspection.theAgentOfARun(run), 'the plain reading is what answered null on the owner’s office').toBeNull()
    const read = inspection.theAgentOfARunForItsSeal(run)
    expect(read?.handle).toBe('worker-retired')
    expect(read?.retired, 'retirement is the row this widens').toBe(true)
  })
})
