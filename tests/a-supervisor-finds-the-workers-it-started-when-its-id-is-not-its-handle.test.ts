// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STOP HOOK FINDS THE WORKERS A SUPERVISOR STARTED, even when the supervisor's registry id is
 * not its handle.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I9: *nothing running has to restart on the day.* After the id is split from the handle,
 * an agent still sends its HANDLE in `x-mole-office-agent` and its handle addresses every door. The
 * worker registry row it started stores `startedBy.id`, which is the starter's registry ID. So the
 * reading cannot compare that stored id with this session's handle any more: for an agent whose id
 * differs from its handle, the comparison silently stops matching and the Stop hook lets a
 * supervisor go while its workers still run.
 *
 * The fix resolves the arriving handle to the agent the door names, and compares `startedBy.id`
 * with that agent's registry id. The reading is `theRunningWorkersOf` in
 * src/server/lib/running-workers.ts, behind GET /api/handles/:handle/running-workers, and
 * `runningWorkers` in tools/dsh-hooks/office.mjs only asks that door. A legacy row, whose id is
 * its handle, matches exactly as before.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THIS IS WRITTEN AGAINST, run after a control
 * ---------------------------------------------------------------------------------------
 *
 *   In `theRunningWorkersOf` in src/server/lib/running-workers.ts, compare `started_by_id` with the
 *   arriving handle again (the old line). The worker below was started by a minted id, so the
 *   filter matches nothing and the case is red. Comparing with the resolved agent's registry id
 *   again makes it green.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SERVER AND NOT app.inject()
 * ---------------------------------------------------------------------------------------
 *
 * `runningWorkers` is a function of the office's HTTP surface: it fetches one door over a socket,
 * and the test drives the very same function. A real listener makes that request the one the hook
 * really makes.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runningWorkers } from '../tools/dsh-hooks/office.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The supervisor this file is about: a minted-shaped id, and a handle that is not it. */
const SUPERVISOR_ID = 'Sup3rV1s0rId'
const SUPERVISOR_HANDLE = 'hook-sup-whose-id-is-not-its-handle'
/** A second supervisor, so a worker it started can be told apart from the first one's. */
const OTHER_SUPERVISOR_ID = '0th3rSup3rId'
const OTHER_SUPERVISOR_HANDLE = 'hook-other-sup'

const WORKER_HANDLE = 'hook-worker-under-a-minted-supervisor'
const OTHER_WORKER_HANDLE = 'hook-worker-under-the-other'

async function ask(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

/** One agent row written straight at the table: a minted id, and a handle that is not it. */
function aMintedSupervisor(id: string, handle: string, name: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-23 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, started_by_kind, started_by_id, created_at) ' +
        'VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
    )
    .run(id, name, handle, `avatar-default-agent-${id}`, 'person', THE_PERSON, '2026-09-23 10:00:00')
}

/** The registry row of one agent, as the roster answers it. */
async function theRow(handle: string): Promise<Record<string, unknown>> {
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  expect(listed.status, JSON.stringify(listed.json)).toBe(200)
  const found = ((listed.json['agents'] ?? []) as Record<string, unknown>[]).find((one) => one['handle'] === handle)
  expect(found, `no roster row for ${handle}`).toBeDefined()
  return found as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  aMintedSupervisor(SUPERVISOR_ID, SUPERVISOR_HANDLE, 'The Minted Supervisor')
  aMintedSupervisor(OTHER_SUPERVISOR_ID, OTHER_SUPERVISOR_HANDLE, 'The Other Supervisor')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a supervisor whose id is not its handle still finds the workers it started', () => {
  it('finds its own worker and not another supervisor’s, with an id that is not its handle', async () => {
    // THE WORKER IS REGISTERED AS THE MINTED SUPERVISOR, by its handle: the door resolves the
    // arriving handle to the minted id and stores that id in `startedBy`. This is the state a
    // worker registered after the identity change is in.
    const mine = await ask('POST', '/api/agents/started', { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SUPERVISOR_HANDLE }, {
      handle: WORKER_HANDLE,
      name: 'The Worker',
    })
    expect(mine.status, JSON.stringify(mine.json)).toBe(201)
    const worker = await theRow(WORKER_HANDLE)
    // THE STORED STAMP IS THE MINTED ID, which is what the fix has to compare against.
    expect(worker['startedBy']).toEqual({ kind: 'agent', id: SUPERVISOR_ID })
    expect(worker['record']).toBeTruthy()

    // A RUN STILL IN STATE running, bound to the worker's own agent record.
    const opened = await ask('POST', '/api/attachments', AS_THE_PERSON, {
      title: 'the worker run',
      agentId: worker['record'],
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/cache/worktrees/dsh-hooks`,
      runtime: 'dsh',
    })
    expect(opened.status, JSON.stringify(opened.json)).toBe(200)

    // AND A WORKER UNDER A DIFFERENT MINTED SUPERVISOR, so the answer is proved to be filtered and
    // not merely "every live agent".
    const theirs = await ask('POST', '/api/agents/started', { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': OTHER_SUPERVISOR_HANDLE }, {
      handle: OTHER_WORKER_HANDLE,
      name: 'The Other Worker',
    })
    expect(theirs.status, JSON.stringify(theirs.json)).toBe(201)
    const other = await theRow(OTHER_WORKER_HANDLE)
    const otherRun = await ask('POST', '/api/attachments', AS_THE_PERSON, {
      title: 'the other worker run',
      agentId: other['record'],
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/cache/worktrees/dsh-hooks`,
      runtime: 'dsh',
    })
    expect(otherRun.status, JSON.stringify(otherRun.json)).toBe(200)

    // THE HOOK RUNS AS THE SUPERVISOR, WHICH KNOWS ONLY ITS HANDLE.
    // The children door checks that the supervisor's session exists in this project.
    const parent = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'session', title: 'the supervisor session', data: { state: 'running' },
    })
    expect(parent.status, JSON.stringify(parent.json)).toBe(201)
    const workers = await runningWorkers(api, { handle: SUPERVISOR_HANDLE, session: (parent.json['record'] as { id: string }).id, workspace: 'default' })

    expect('failed' in workers, 'the roster or a profile could not be read').toBe(false)
    expect((workers as { running: { handle: string }[] }).running.map((one) => one.handle)).toEqual([WORKER_HANDLE])
  })
})
