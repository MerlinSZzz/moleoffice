// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE ASKS WHICH AGENT EACH RUNNING ROW SERVES ONCE A PASS, and tells the worker what it told it before. Wave 13y
 * round 35, item 9.16.
 *
 * GET /api/worker/queue reads, for each agent a message is queued for, whether a run is already going for it. That
 * walked every run row of the project for each such agent, and asked the registry which agent each running row serves
 * each time. On the office copy that walk was 155 to 158 ms of a 2.5 s pass, for 422 agents. The presence roster asks
 * the same question of the same rows once for all its agents (`runningRows` on `HowTheAnsweringIsRead`, round 13). The
 * queue does that now as well.
 *
 * HOW A QUESTION IS COUNTED: the database's
 * `prepare` is replaced before the server is made, so every statement the server prepares afterwards counts each time
 * it is run. The running rows serve agents nothing is queued for, so a statement that names one of those agents asks
 * which agent a running row serves.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { theMessageWaitsForARunGoing } from '../src/shared/handles.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type WorkerLib = typeof import('../src/server/lib/worker.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface QueueRow {
  messageId: string
  to: { kind: string; id: string }
  runningAlready: string | null
  runningAlreadySays: string | null
}

let t: TestDb
let app: FastifyInstance
let worker: WorkerLib
let counting = false
const ran: string[] = []

/** The agents with runs whose messages are queued, by handle, and the registry id of each. */
const ids = new Map<string, string>()
/** The sandbox each run was made in, by the run's id. */
const sandboxOf = new Map<string, string>()
/** The message this file queued for each agent, by the agent's registry id. */
const messageFor = new Map<string, string>()

async function post(path: string, body: unknown, answers: 201 | 409 = 201): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_PERSON, payload: body as object })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(answers)
  return JSON.parse(reply.body) as Record<string, unknown>
}

async function register(handle: string): Promise<string> {
  await post('/api/agents/started', { handle, name: handle, runtime: 'claude-code' })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  return one(listed.agents.filter((agent) => agent.handle === handle), `the registry row for ${handle}`).id
}

async function aMessageFor(id: string, answers: 201 | 409): Promise<void> {
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx); a
  // send to an agent whose run is going answers 201.
  const filed = await post('/api/records', { kind: 'message', title: `A question for ${id}`, data: { body: 'A question.', to: [{ kind: 'agent', id }] } }, answers)
  messageFor.set(id, (filed['record'] as { id: string }).id)
}

/** A run serving the agent, in a sandbox of its own, with this test's own process as its process when it is `alive`. */
async function aRun(agentId: string, sandbox: string, state: 'running' | 'finished', alive: boolean): Promise<string> {
  const run = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `A run for ${agentId} in ${sandbox}`,
    data: { state, runtime: 'claude-code', servingAgentId: agentId, sandbox: { template: 'mole-office-dev', folder: `/made/up/sandboxes/${sandbox}` } },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  sandboxOf.set(run, sandbox)
  if (alive) {
    await post('/api/resources', {
      sessionRecordId: run,
      type: 'process',
      key: String(process.pid),
      detail: `this test process, as the process of the run in ${sandbox}`,
      adopting: 'this test process started before the run the test filed for it',
    })
  }
  return run
}

async function theQueue(): Promise<QueueRow[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/worker/queue', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  return (reply.json() as { queue: QueueRow[] }).queue
}


beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'run', 'iterate', 'values'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting) ran.push(`${text} ${JSON.stringify(args)}`)
        return run.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})


describe('what the queue tells the worker about a run already going', () => {
  beforeAll(async () => {
    for (const handle of ['two-runs', 'a-dead-run', 'a-finished-run', 'no-run', 'a-later-run']) ids.set(handle, await register(handle))
    const id = (handle: string): string => ids.get(handle)!
    await aRun(id('two-runs'), 'first', 'running', true)
    await aRun(id('two-runs'), 'second', 'running', true)
    await aRun(id('a-dead-run'), 'dead', 'running', false)
    await aRun(id('a-finished-run'), 'finished', 'finished', true)
    for (const handle of ids.keys()) await aMessageFor(id(handle), handle === 'two-runs' ? 201 : 409)
  })

  /** The queue's two fields for the agent's message, and what the one-agent reading says they should be. */
  async function toldAndRead(handle: string): Promise<{ told: Pick<QueueRow, 'runningAlready' | 'runningAlreadySays'>; read: Pick<QueueRow, 'runningAlready' | 'runningAlreadySays'> }> {
    const id = ids.get(handle)!
    const row = one((await theQueue()).filter((queued) => queued.messageId === messageFor.get(id)), `the message queued for ${handle}`)
    // THE ONE-AGENT READING reads this agent's own rows through the index of running rows, not the queue's list.
    const going = worker.runServing(id, WORKSPACE)
    return {
      told: { runningAlready: row.runningAlready, runningAlreadySays: row.runningAlreadySays },
      read: { runningAlready: going, runningAlreadySays: going === null ? null : theMessageWaitsForARunGoing(sandboxOf.get(going)!, false) },
    }
  }

  it('names the run the agent has going, and its sandbox, when it has two', async () => {
    const { told, read } = await toldAndRead('two-runs')
    expect(read.runningAlready, 'the one-agent reading finds a run').not.toBeNull()
    expect(told).toEqual(read)
    expect(told.runningAlreadySays).toContain(sandboxOf.get(read.runningAlready!)!)
  })

  it('names no run when the run has no live process, when the run has finished, and when there is none', async () => {
    for (const handle of ['a-dead-run', 'a-finished-run', 'no-run']) {
      const { told, read } = await toldAndRead(handle)
      expect(told, handle).toEqual({ runningAlready: null, runningAlreadySays: null })
      expect(read, handle).toEqual(told)
    }
  })

  it('names a run that started after the last pass', async () => {
    expect((await toldAndRead('a-later-run')).told.runningAlready).toBeNull()
    const run = await aRun(ids.get('a-later-run')!, 'later', 'running', true)
    const { told, read } = await toldAndRead('a-later-run')
    expect(told.runningAlready).toBe(run)
    expect(told).toEqual(read)
  })
})
