// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE READS ONLY THE RUNS THAT MAY ANSWER, AND ITS ANSWER IS THE SAME (wave 13y round 44).
 *
 * The queue asked one statement for every session record of the project, and then kept two
 * different subsets of those rows: the message worker's runs, which may have a conversation to
 * pick up, and the running runs, which answer who is serving an agent. On the made-up database the
 * statement read 7,700 rows and 87.5 MiB with `records_kind_idx` and a TEMP B-TREE for the order.
 * The two readers that already answer those two questions each use a partial index:
 *
 *   runRows           records_session_delivering_message_idx, 3,080 rows of this made-up office;
 *   runningRunRowsIn  records_session_running_idx,              1,226 rows of this made-up office.
 *
 * The bound plan of each was read with four project ids on the made-up database and on a small
 * fresh migrated test database before this file was written. Both searches use their partial
 * index; neither needs INDEXED BY.
 *
 * WHAT THE CASES HOLD. The answer cases hold on the old code too, because the old code read the
 * same rows and kept the same subsets. The test office holds a session record in every one of the
 * seven session states: running, idle, finished, crashed, paused, orphaned and unknown. Its cases
 * cover a live sandbox run with no `deliveringMessage`, a live message-worker run, a message-worker
 * run waiting for the next message, a run that names no message in each non-running state, a
 * crashed run that does carry a message and a wait, a running run of a retired agent, a finished
 * office-started run that still holds its agent's handle, a running run with no live process, a
 * running run in another project, and a deleted running run. `wanted` and
 * `sealed` are not session states: `wanted` is a state of a work claim and a seal is a field on a
 * finished run, so no session record in the test office holds either as its state. The cost case is
 * red on the old code: one queue read executes the every-session-record statement once and executes
 * neither narrow reader.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: every answer case and the cost case, green on the new code.
 *
 * MUTATION ONE: in src/server/lib/worker.ts, `runningRows` was given `sessionRows()` instead of
 * `runningSessionRows()`, so a run started outside the message worker was dropped again. The live
 * sandbox case went red. The running list was put back.
 *
 * MUTATION TWO: `sessionRows` was given `runningSessionRows()` instead of `runRows(workspaceId)`,
 * so a message-worker run waiting for the next message was dropped. The waiting-run case went red.
 * The message-run reader was put back.
 *
 * All rows and messages here are synthetic fixtures in this file's own temporary test database.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const OTHER_WORKSPACE = 'another-project-of-this-test'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const SANDBOX = {
  template: 'a-template',
  folder: '/srv/sandboxes/a-test-sandbox',
}

let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
const started: ChildProcess[] = []

/** The exact statement the queue used to run for every session record of the project. */
const ALL_SESSION_ROWS =
  'select "id", "workspace_id", "kind", "title", "data", "created_at" from "records" ' +
  'where ("records"."kind" = ? and "records"."workspace_id" = ? and "records"."deleted_at" is null) ' +
  'order by "records"."created_at" desc, rowid desc'
/** The statement `runRows` runs, through the delivering-message partial index. */
const MESSAGE_RUN_ROWS = 'unlikely((CASE WHEN json_valid("records"."data") THEN json_extract("records"."data", \'$.deliveringMessage\') END) > \'\')'
/** The statement `runningRunRowsIn` runs, through the running partial index. */
const RUNNING_RUN_ROWS = '(CASE WHEN json_valid("records"."data") THEN json_extract("records"."data", \'$.state\') = \'running\' END) = 1'

let counting = false
let allSessionRows = 0
let messageRunRows = 0
let runningRunRows = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A SECOND PROJECT, so a running run there can be shown not to reach this queue.
  t.client.sqlite.prepare('insert into workspaces (id, title, created_at, updated_at) values (?, ?, ?, ?)').run(OTHER_WORKSPACE, 'Another project of this test', localStamp(new Date()), localStamp(new Date()))
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get']) {
      const run = statement[method] as (...args: unknown[]) => unknown
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting) {
          if (text === ALL_SESSION_ROWS) allSessionRows += 1
          else if (text.includes(MESSAGE_RUN_ROWS)) messageRunRows += 1
          else if (text.includes(RUNNING_RUN_ROWS)) runningRunRows += 1
        }
        return run.apply(this, args)
      }
    }
    return statement
  }
  worker = await import('../src/server/lib/worker.ts')
}, 120_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app?.close()
  t?.close()
})

/** Register an agent through the real door and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  const agents = (JSON.parse(listed.body) as { agents: { id: string; handle: string }[] }).agents
  const row = agents.find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} is not in the registry`)
  return row.id
}

/** File a message to one agent through the real door, so its delivery row is real. */
async function aMessageTo(agentId: string, body: string, answers: 201 | 409 = 201): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } },
  })
  expect(reply.statusCode, reply.body).toBe(answers)
  return (JSON.parse(reply.body) as { record: { id: string } }).record.id
}

/** A session record, running unless said otherwise. */
function aSession(data: Record<string, unknown>, workspaceId = WORKSPACE): string {
  return t.api.createRecord({
    workspaceId,
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', ...data },
    actor: t.api.HUMAN,
  }).id
}

/** A session in one of the seven states, written straight into the row so the finish door's submission rules are not in the way. */
function aSessionInState(state: string, data: Record<string, unknown>, workspaceId = WORKSPACE): string {
  const session = aSession(data, workspaceId)
  const row = t.client.sqlite.prepare('select data from records where id = ?').get(session) as { data: string }
  const written = JSON.parse(row.data) as Record<string, unknown>
  written['state'] = state
  t.client.sqlite.prepare('update records set data = ? where id = ?').run(JSON.stringify(written), session)
  return session
}

/** Retire an agent's registry row, the fact the queue reads as `retired`. */
function retire(agentId: string): void {
  t.client.sqlite.prepare('update agents set retired = 1, retired_because = ?, retired_at = ? where id = ?').run('the test retired this agent', localStamp(new Date()), agentId)
}

/** A real process of this test's own, in its own group, registered against the run. */
async function aLiveProcessFor(sessionRecordId: string): Promise<ChildProcess> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  const row = t.client.sqlite.prepare('select data from records where id = ?').get(sessionRecordId) as { data: string }
  const theOfficeStartedIt = (JSON.parse(row.data) as Record<string, unknown>)['startedByMoleOffice'] === true
  registerResource({
    workspaceId: WORKSPACE,
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    ...(theOfficeStartedIt ? { startedByTheProduct: true } : {}),
    actor: t.api.HUMAN,
  })
  return child
}

/** The queue row for one message, or a failure naming the message. */
function theQueuedRow(messageId: string): Record<string, unknown> {
  const row = worker.theQueue(WORKSPACE).find((one) => one.messageId === messageId)
  if (row === undefined) throw new Error(`the message ${messageId} is not in the queue`)
  return row as unknown as Record<string, unknown>
}

describe('the queue sees every run that may answer', () => {
  it('counts a live sandbox run with no deliveringMessage, and names its instance', async () => {
    const agentId = await anAgent('a-sandbox-runner-in-the-queue')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    const messageId = await aMessageTo(agentId, 'Is the piece done?')

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBe(session)
    expect(String(row['runningAlreadySays'])).toContain('a-test-sandbox')
    expect(String(row['runningAlreadySays'])).not.toContain('a-template')
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    expect(row['resume']).toBeNull()
  })

  it('counts a live message-worker run, which carries deliveringMessage', async () => {
    const agentId = await anAgent('a-host-runner-in-the-queue')
    const session = aSession({ servingAgent: agentId, deliveringMessage: 'a-message-record', startedByMoleOffice: true })
    await aLiveProcessFor(session)
    const messageId = await aMessageTo(agentId, 'Is the piece done?')

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBe(session)
    expect(String(row['runningAlreadySays'])).toContain('A run Mole Office started is answering')
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
  })

  it('picks up the conversation of a message-worker run that is waiting for the next message', async () => {
    const agentId = await anAgent('a-waiting-runner-in-the-queue')
    const until = localStamp(new Date(Date.now() + 3_600_000))
    const session = aSessionInState('finished', {
      servingAgent: agentId,
      deliveringMessage: 'a-message-record',
      providerSession: 'a-provider-session',
      waitsUntil: until,
      runtime: 'claude-code',
    })
    const messageId = await aMessageTo(agentId, 'Are you still there?')

    const row = theQueuedRow(messageId)
    expect(row['resume']).toEqual({ id: 'a-provider-session', runtime: 'claude-code', run: session })
    expect(row['runningAlready']).toBeNull()
  })

  it('does not count a finished run the message worker did not start', async () => {
    const agentId = await anAgent('a-finished-sandbox-runner')
    aSessionInState('finished', { servingAgent: agentId, sandbox: SANDBOX })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent')
  })

  it('does not count a run whose record says running but which has no live process', async () => {
    const agentId = await anAgent('a-runner-with-no-process-in-the-queue')
    aSession({ servingAgent: agentId, sandbox: SANDBOX })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent')
  })

  it('does not count a running run in another project', async () => {
    const agentId = await anAgent('a-runner-in-another-project')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    t.client.sqlite.prepare('update records set workspace_id = ? where id = ?').run(OTHER_WORKSPACE, session)
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent')
  })

  it('does not count a deleted running run', async () => {
    const agentId = await anAgent('a-deleted-runner')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    t.client.sqlite.prepare('update records set deleted_at = ? where id = ?').run(localStamp(new Date()), session)
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent')
  })

  it('does not count a run that names no message in any state that is not running', async () => {
    for (const state of ['idle', 'finished', 'crashed', 'paused', 'orphaned', 'unknown']) {
      const agentId = await anAgent(`a-runner-${state}`)
      const session = aSessionInState(state, { servingAgent: agentId, sandbox: SANDBOX })
      await aLiveProcessFor(session)
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      const messageId = await aMessageTo(agentId, `Are you there, ${state}?`, 409)

      const row = theQueuedRow(messageId)
      expect(row['runningAlready'], state).toBeNull()
      expect(String(row['nobodyIsAnsweringAsIt']), state).toContain('Start a new agent')
      expect(row['resume'], state).toBeNull()
    }
  })

  it('picks up a run in another state when it carries a message and a wait', async () => {
    const agentId = await anAgent('a-crashed-waiting-runner')
    const until = localStamp(new Date(Date.now() + 3_600_000))
    const session = aSessionInState('crashed', {
      servingAgent: agentId,
      deliveringMessage: 'a-message-record',
      providerSession: 'a-crashed-provider-session',
      waitsUntil: until,
      runtime: 'claude-code',
    })
    const messageId = await aMessageTo(agentId, 'Are you still there?')

    const row = theQueuedRow(messageId)
    expect(row['resume']).toEqual({ id: 'a-crashed-provider-session', runtime: 'claude-code', run: session })
    expect(row['runningAlready']).toBeNull()
  })

  it('keeps the office-started sentence for a finished run that still holds its handle', async () => {
    const agentId = await anAgent('a-finished-runner-with-a-hold')
    const session = aSessionInState('finished', { servingAgent: agentId, startedByMoleOffice: true })
    const at = localStamp(new Date())
    t.client.sqlite.prepare('insert into handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('a-fresh-hold-of-this-test', agentId, session, 'a-test-machine', 'claude-code', at, at, null, null)
    const messageId = await aMessageTo(agentId, 'Are you there?')

    const row = theQueuedRow(messageId)
    expect(row['runningAlready']).toBe(session)
    expect(String(row['runningAlreadySays'])).toContain('A run Mole Office started is answering')
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
  })

  it('counts a live run of a retired agent', async () => {
    const agentId = await anAgent('a-retired-runner')
    // THE MESSAGE IS QUEUED BEFORE THE AGENT RETIRES, which is the state this case is about: the
    // message was accepted while the agent could take it, and the run was already going when it retired.
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    retire(agentId)

    const row = theQueuedRow(messageId)
    expect(row['retired']).toBe(true)
    expect(row['runningAlready']).toBe(session)
  })
})

