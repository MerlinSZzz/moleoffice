// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RUN MAY FILE ONLY SO MANY MESSAGES, AND THE NEXT ONE IS REFUSED IN WORDS.
 *
 * Problem `JZ2CrNUlVoll`. The conversation guard bounds how many RUNS are started, because a run is
 * what costs a model call. It bounds nothing a run does once it is going. A run of an agent tool
 * holds the API address and its own name, so one run can file message after message, and every one
 * of them is a stored row that announces itself to every open page — the browser made unusable in
 * the way problem `jN0TdeawNlZZ` describes, with nothing spent on it.
 *
 * So the worker's answered door counts what each run has filed. `MOLE_OFFICE_RUN_MESSAGES` is how
 * many one run may file; this file sets it to five and answers ten times.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server is real, and so are the agent, the run's session
 * record, the messages and the delivery rows. Nothing starts a process: the stand-in is this file
 * calling the door a run's worker calls, ten times, which is what a run writing in a loop looks like
 * from the server's side.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** What `MOLE_OFFICE_RUN_MESSAGES` said before this file set it, so it is put back. */
let allowedBefore: string | undefined

/** The limit this file is written against, set in the environment so the server reads the same. */
const ALLOWED = 5
/** How many times the stand-in answers. */
const ANSWERS = 10

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Register a durable agent and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** Send a message to an agent, and give back the message id. */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

/**
 * A session record shaped exactly as the worker files one for a run it starts.
 *
 * No process is started. What the door checks is that the run exists, is a session record of this
 * project, and was serving this agent, and all three of those are facts on the record.
 */
async function aRunServing(agentId: string, messageId: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'a run answering a message',
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgent: agentId,
      deliveringMessage: messageId,
    },
  })
  return (filed['record'] as { id: string }).id
}

/** Answer once, as the worker does, and say what came back. */
async function answerOnce(
  messageId: string,
  agentId: string,
  run: string,
  n: number,
): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/worker/messages/${messageId}/answered`,
    headers: AS_THE_OWNER,
    payload: {
      to: { kind: 'agent', id: agentId },
      agent: { kind: 'agent', id: agentId },
      fromRun: run,
      body: `Answer number ${String(n)} from a run that will not stop.`,
      because: 'a stand-in answering over and over',
    },
  })
  return { status: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  allowedBefore = process.env['MOLE_OFFICE_RUN_MESSAGES']
  process.env['MOLE_OFFICE_RUN_MESSAGES'] = String(ALLOWED)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (allowedBefore === undefined) delete process.env['MOLE_OFFICE_RUN_MESSAGES']
  else process.env['MOLE_OFFICE_RUN_MESSAGES'] = allowedBefore
})

describe('a stand-in that answers ten times files five messages and is told why the sixth is refused', () => {
  let agentId: string
  let messageId: string
  let run: string
  const answers: { status: number; body: string }[] = []

  it('answers ten times', async () => {
    agentId = await anAgent('run-that-will-not-stop')
    messageId = await messageTo(agentId, 'One question, and this run answers it ten times.')
    run = await aRunServing(agentId, messageId)
    for (let n = 1; n <= ANSWERS; n += 1) answers.push(await answerOnce(messageId, agentId, run, n))
    expect(answers.length).toBe(ANSWERS)
  })

  it('files the first five and refuses every one after them', () => {
    expect(
      answers.map((a) => a.status),
      'five filed, five refused: the limit is about the run, not about how hard it tries',
    ).toEqual([200, 200, 200, 200, 200, 400, 400, 400, 400, 400])
  })

  it('names the limit and the run in the refusal', () => {
    const refused = answers[ALLOWED]
    if (refused === undefined) throw new Error('nothing was refused')
    expect(refused.body).toContain(`Run ${run} has filed ${String(ALLOWED)} messages`)
    expect(refused.body).toContain(`this installation allows one run ${String(ALLOWED)}`)
    expect(refused.body, 'a refusal says where the words went').toContain('nothing was written into the conversation')
  })

  it('stores five messages from that run and no more', async () => {
    const pool = ((await get('/api/messages?full=1')) as { messages?: { id: string; sentBy: { id: string } | null }[] })
      .messages ?? []
    const fromTheAgent = pool.filter((m) => m.sentBy !== null && m.sentBy.id === agentId)
    expect(fromTheAgent.length, 'the rows are what the guard is protecting').toBe(ALLOWED)
  })

  it('writes the refusal on the run s own session record', async () => {
    const read = (await get(`/api/records/${run}`)) as { record?: { data?: Record<string, unknown> } }
    const said = read.record?.data?.['filingRefused']
    expect(typeof said, 'a run that was cut short says so where a reader finds the run').toBe('string')
    expect(String(said)).toContain(`Run ${run} has filed ${String(ALLOWED)} messages`)
  })

  /**
   * The worker retries a refused answer, so this sentence is written again with the same words. What
   * keeps that from filling the record's history is `patchRecord`, which makes no revision for a
   * patch that changes nothing. This test is here because that is the thing being relied on.
   */
  it('leaves no new revision when the run is refused again with the same words', async () => {
    const read = (await get(`/api/records/${run}`)) as { revisionSeq?: number }
    const again = await answerOnce(messageId, agentId, run, ANSWERS + 1)
    expect(again.status).toBe(400)
    const after = (await get(`/api/records/${run}`)) as { revisionSeq?: number }
    expect(after.revisionSeq, 'a record nobody edited gets no revision').toBe(read.revisionSeq)
  })

  it('lets a different run of the same agent file its own five', async () => {
    const second = await aRunServing(agentId, messageId)
    const filed = await answerOnce(messageId, agentId, second, 1)
    expect(filed.status, 'the limit is one run s, not one agent s for ever').toBe(200)
  })
})

/**
 * THE SAME LIMIT HOLDS AT POST /api/records. Problem `0WNMf6-hqt1x`.
 *
 * A run holds the API address and its agent's name, so it can skip the answered door and write
 * messages itself. Such a write names the run in `x-mole-office-session`, which is how the office
 * already stamps `fromRun` on it; the count is asked there as well. The stand-in is this file
 * writing ten messages as the agent, naming the run, which is what such a run looks like from the
 * server's side.
 */
describe('a run that writes messages straight to POST /api/records is held to the same five', () => {
  let agentId: string
  let run: string
  const writes: { status: number; body: string }[] = []

  async function writeAsTheRun(runId: string, n: number): Promise<{ status: number; body: string }> {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'run-that-writes-directly',
        'x-mole-office-session': runId,
      },
      payload: {
        kind: 'message',
        title: `Direct message number ${String(n)}`,
        data: { body: `Direct message number ${String(n)} from a run that will not stop.`, to: [{ kind: 'person', id: THE_PERSON }] },
      },
    })
    return { status: reply.statusCode, body: reply.body }
  }

  it('writes ten times', async () => {
    agentId = await anAgent('run-that-writes-directly')
    const messageId = await messageTo(agentId, 'One question, and this run writes ten messages about it.')
    run = await aRunServing(agentId, messageId)
    for (let n = 1; n <= ANSWERS; n += 1) writes.push(await writeAsTheRun(run, n))
    expect(writes.length).toBe(ANSWERS)
  })

  it('stores the first five and refuses every one after them, naming the run and the limit', () => {
    expect(writes.map((w) => w.status), writes.map((w) => w.body.slice(0, 200)).join('\n')).toEqual([201, 201, 201, 201, 201, 400, 400, 400, 400, 400])
    expect(writes[ALLOWED]!.body).toContain(`Run ${run} has filed ${String(ALLOWED)} messages`)
  })

  it('stores five messages that name the run, and no more', () => {
    const stored = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.fromRun') = ?")
      .get(run) as { n: number }
    expect(stored.n).toBe(ALLOWED)
  })
})
