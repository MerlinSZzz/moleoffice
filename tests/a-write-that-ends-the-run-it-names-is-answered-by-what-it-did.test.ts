// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE THAT ENDS THE RUN ITS SESSION HEADER NAMES IS ANSWERED BY WHAT IT DID.
 *
 * An agent's own key holds a run it names in x-mole-office-session only while that run is running
 * (lib/the-run-a-key-holds.ts). A door reads its caller before it writes, and most doors read the caller again after
 * the write to build the reply. A write that ended the named run was judged held before the write and not held after
 * it, so it was stored and then answered 403 with "Nothing was written". The header is judged once per request now,
 * before anything is written (`refuseASessionHeaderTheKeyDoesNotHold` in src/server/lib/http.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A write that ends the run its header names, with the agent's own key, is answered 200 with the record it wrote,
 *      and the record is ended. Three shapes: a run that serves the agent, finished with a records submission; a run
 *      the agent filed for itself that serves nobody, finished with nothing else; a run that serves the agent, ended
 *      as crashed.
 *   2. A header the key does not hold is refused with 403, and nothing is stored: the run the write was to end is
 *      still running, with no new revision.
 *   3. A header naming a run that has already ended is refused with 403 before anything is written, even when an
 *      earlier request named that run and was held.
 *
 * THE STOP DOOR (`POST /api/runtime/runs/:id/stop`) reads its caller once, before it stops anything, so its answer is
 * what it did. No case here starts a process to stop.
 *
 * Every request goes through the real doors with `app.inject`. No assertion prints a key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. The header judged on every reading again, as before (src/server/lib/http.ts): claim 1 goes red on the answer,
 *      in all three shapes, while the record is ended all the same.
 *   b. A write that ends the run its header names refused before the write (src/server/lib/http.ts): claim 1 goes
 *      red on the stored state, in all three shapes, and claim 3 goes red at its own ending write.
 *   c. The header taken as held by a reading that asks only who is calling (src/server/lib/http.ts): claims 2 and 3
 *      go red on the answer, because both writes are stored and answered 200.
 *   d. The header judged only after the write, because the PATCH door's own reading asks only who is calling
 *      (src/server/api/records.ts): claims 2 and 3 go red on what was stored, while the answer is still 403, and
 *      claim 1 goes red on the answer.
 *   e. The header remembered as held by the run it names rather than by the request (src/server/lib/http.ts): claim 3
 *      goes red on the answer.
 *
 * The expects in the helpers check the setup a claim stands on, and are not claims of their own.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { ACTOR_HEADERS } from '../src/shared/request-headers.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

/** An agent's own headers: its name, its own key, and the run it names where it names one. */
function asAgent(handle: string, key: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
    ...(session === undefined ? {} : { [ACTOR_HEADERS.session]: session }),
  }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a refusal, for the assertions on what it names. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent as the person, and hand back the key it was answered. */
async function register(handle: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code', role: 'worker' })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** File a running session as the agent, with its own key, serving it or, with `servesNobody`, serving nobody. */
async function fileARun(handle: string, key: string, servesNobody = false): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(handle, key), {
    kind: 'session',
    title: `${handle} at work`,
    data: servesNobody
      ? { state: 'running', doing: 'a run filed for itself' }
      : { state: 'running', doing: 'a run that serves its agent', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle },
  })
  expect(filed.status, said(filed.body)).toBe(201)
  return String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
}

/** File a task in the run, naming it in the header, and hand back the task's id. */
async function fileATaskIn(run: string, handle: string, key: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(handle, key, run), { kind: 'task', title: `work done in ${handle}'s run`, data: {} })
  expect(filed.status, said(filed.body)).toBe(201)
  return String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
}

/** What is stored for the run now: its state, its doing line, and how many revisions it has. */
function storedOf(run: string): { state: unknown; doing: unknown; revisions: number } {
  const row = t.client.sqlite
    .prepare("SELECT json_extract(data, '$.state') AS state, json_extract(data, '$.doing') AS doing FROM records WHERE id = ?")
    .get(run) as { state: unknown; doing: unknown }
  const { n } = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(run) as { n: number }
  return { state: row.state, doing: row.doing, revisions: n }
}

/** The state of the record the reply carries, or null when it carries none. */
function answeredState(body: Record<string, unknown>): unknown {
  return (body['record'] as { data?: { state?: unknown } } | undefined)?.data?.state ?? null
}

/** A refusal of the session header: 403, and the words name the header and the run it named. */
function aHeaderRefusal(wrote: { status: number; body: Record<string, unknown> }, session: string): { status: number; namesTheHeader: boolean; namesTheRun: boolean } {
  return { status: wrote.status, namesTheHeader: said(wrote.body).includes(ACTOR_HEADERS.session), namesTheRun: said(wrote.body).includes(`"${session}"`) }
}

let agentsKey = ''
let anotherKey = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  agentsKey = await register('an-agent')
  anotherKey = await register('another-agent')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a write that ends the run its session header names', () => {
  const SHAPES = [
    { shape: 'a run that serves the agent, finished with a records submission', servesNobody: false, end: 'finished', submits: true },
    { shape: 'a run the agent filed for itself, finished with nothing else', servesNobody: true, end: 'finished', submits: false },
    { shape: 'a run that serves the agent, ended as crashed', servesNobody: false, end: 'crashed', submits: false },
  ] as const

  it.each(SHAPES)('1: $shape is answered with what it wrote, and the record is ended', async ({ servesNobody, end, submits }) => {
    const run = await fileARun('an-agent', agentsKey, servesNobody)
    const task = await fileATaskIn(run, 'an-agent', agentsKey)
    const dataPatch =
      end === 'crashed'
        ? { state: end, detail: 'its own agent ended it' }
        : submits
          ? { state: end, submission: { kind: 'records', records: [task] } }
          : { state: end }
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('an-agent', agentsKey, run), { dataPatch })
    expect(storedOf(run).state, `the run was not ended: ${said(ended.body)}`).toBe(end)
    expect({ status: ended.status, state: answeredState(ended.body) }, said(ended.body)).toEqual({ status: 200, state: end })
  })

  it('2: a header the key does not hold is refused, and nothing is stored', async () => {
    const run = await fileARun('an-agent', agentsKey)
    const othersRun = await fileARun('another-agent', anotherKey)
    const before = storedOf(run)
    const refused = await ask('PATCH', `/api/records/${run}`, asAgent('an-agent', agentsKey, othersRun), {
      dataPatch: { state: 'crashed', detail: 'ended under another agent’s run' },
    })
    expect(aHeaderRefusal(refused, othersRun), said(refused.body)).toEqual({ status: 403, namesTheHeader: true, namesTheRun: true })
    expect(storedOf(run)).toEqual(before)
  })

  it('3: a header naming a run that has ended is refused before anything is written', async () => {
    const run = await fileARun('an-agent', agentsKey)
    await fileATaskIn(run, 'an-agent', agentsKey)
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('an-agent', agentsKey, run), {
      dataPatch: { state: 'crashed', detail: 'its own agent ended it' },
    })
    expect(storedOf(run).state, said(ended.body)).toBe('crashed')
    const before = storedOf(run)
    const refused = await ask('PATCH', `/api/records/${run}`, asAgent('an-agent', agentsKey, run), {
      dataPatch: { doing: 'a line written after the end' },
    })
    expect(aHeaderRefusal(refused, run), said(refused.body)).toEqual({ status: 403, namesTheHeader: true, namesTheRun: true })
    expect(storedOf(run)).toEqual(before)
  })
})
