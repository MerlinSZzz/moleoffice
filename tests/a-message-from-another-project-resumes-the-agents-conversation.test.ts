// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Fake-runtime exits need submitted work, so this file uses the same fixture as the M22 and M89 tests: it registers a record area when absent and submits an explicit completion note through the real sealer. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A MESSAGE WRITTEN IN ANOTHER PROJECT RESUMES THE AGENT'S CONVERSATION IN THE WORKER'S PROJECT (wave 13y round 112, item
 * 46).
 *
 * WHAT THE PRODUCT DID BEFORE. The office's one message worker watches one project. Its queue held only the messages written
 * in that project, about it, or commenting on its records, and it looked for an agent's conversation only among that
 * project's runs. So a message written in a second project to a supervisor with no live hold waited until the person pressed
 * "Start a new agent?", although the supervisor's own conversation was there to pick up.
 *
 * THE RULES, as approved on 30 October 2026:
 *
 * 1. The worker's queue also holds a message written in another project when the agent it is for has a conversation that a
 *    message picks up in the worker's project. The worker resumes it.
 * 2. For a message from another project to an agent with no such conversation, the worker starts nothing, as before.
 * 3. A check's ask about another project's run, and a comment on another project's record, stay out. Every line the
 *    office itself wrote in another project stays out too, a check's ask among them (approved the same day).
 * 4. Before it resumes or starts anything, the worker reads the agent's running runs in every project, so it never starts a
 *    second conversation. This holds for its own project's messages too.
 *
 * ONLY MESSAGES WRITTEN AFTER THE CHANGE ARE TAKEN (approved the same day). The moment is written down once, in
 * `installation.other_projects_messages_since`, by the first reading of the worker's whole queue under the new rule, and is
 * never written again. A message written in another project at or before that second is not taken. Both sides are proved
 * here: an old message is not taken, and a new one is.
 *
 * WHAT IS PROVED HERE, against a real server and the real message worker, with the fake runtime. The worker watches the
 * project `default`. A second project, `second-desk`, has no worker.
 *
 * 1. On a fresh database the moment is NULL; the first reading of the worker's queue writes it once, and a second reading
 *    leaves it as it was. A message written in the second project before that moment is not handed over.
 * 2. The chat opened from the second project reads the supervisor the way it reads from the first: its own conversation,
 *    and so no "Cannot reach".
 * 3. A message written in the second project after the moment resumes the supervisor's conversation: the queue row names
 *    the conversation and asks for no press, and the one run started carries the same conversation id, in the worker's
 *    project. The old message is still not handed over.
 * 4. That message is listed once, and no second run carries it.
 * 5. A message written in the second project to a supervisor with no conversation is not in the worker's queue, and no run
 *    is started for it.
 * 6. A comment written in the second project on a record of that project is not in the worker's queue.
 * 7. A line the office wrote in the second project, to the supervisor whose conversation is picked up, is not in the
 *    worker's queue.
 * 8. A supervisor whose run is going in the second project gets no second run for a message written in the worker's project:
 *    the queue row names the run that is going.
 *
 * RED ON MAIN: the column is not there, so case 1 cannot read it; from the second project the chat reads nobody; the queue
 * of the worker's project does not list the second project's message, which waits; and the message in case 8 starts a run
 * beside the one that is going. Cases 5, 6 and 7 are green on main, because nothing from another project was taken then;
 * they are here so that the change takes no more than rules 1 and 4 say.
 *
 * MADE-UP RECORDS: three supervisors, their runs and their messages are invented here. Each conversation that is picked up
 * is a run written by this file, with a made-up conversation id the fake runtime gives back.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SUPERVISOR } from '../src/shared/roles.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

/** The project the worker watches, and the second project, which no worker watches. */
const HERE = 'default'
const OTHER = 'second-desk'
/** The made-up conversation ids of the two supervisors that have one in the worker's project. */
const KEPT = 'made-up-conversation-of-the-far-supervisor'
const BUSY_KEPT = 'made-up-conversation-of-the-busy-supervisor'

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
const ids = { far: '', lone: '', busy: '', busyRun: '' }
let old = ''
let moment = ''

const asTheOwnerIn = (project: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

async function send(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, project = HERE): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({
    method,
    url: path,
    headers: asTheOwnerIn(project),
    ...(body === undefined ? {} : { payload: body as object }),
  })
  return { status: reply.statusCode, body: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}

/** Register a supervisor, and prove the registry row holds the card. */
async function aSupervisor(handle: string): Promise<string> {
  const filed = await send('POST', '/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', role: THE_SUPERVISOR } })
  expect(filed.status, JSON.stringify(filed.body).slice(0, 300)).toBe(201)
  const listed = (await send('GET', '/api/participants')).body as { agents?: { id: string; handle: string; role: string | null }[] }
  const row = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`)
  expect(row.role).toBe(THE_SUPERVISOR)
  return row.id
}

/**
 * A made-up run of the message worker in the worker's project that answered and ended, carrying a conversation id. Its
 * runtime word is the fake runtime's, which this file's worker runs: the worker picks up only a conversation its own
 * runtime made.
 */
function aKeptConversation(agentId: string, conversation: string): string {
  return t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: 'An earlier answer (made-up)',
    data: {
      state: 'finished',
      runtime: 'fake',
      startedByMoleOffice: true,
      servingAgentId: agentId,
      deliveringMessage: `made-up-message-for-${conversation}`,
      providerSession: conversation,
      startedAt: localStamp(new Date(Date.now() - 3_600_000)),
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/** A message from the person to one agent, written in `project`, and its id. */
async function messageTo(agentId: string, body: string, project: string, also: Record<string, unknown> = {}, answers: 201 | 409 = 409): Promise<string> {
  const filed = await send('POST', '/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }], ...also } }, project)
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx). A
  // send to an agent with a run going answers 201.
  expect(filed.status, JSON.stringify(filed.body).slice(0, 300)).toBe(answers)
  return (filed.body['record'] as { id: string }).id
}

/** Where a message was written and when, as stored. */
function stored(messageId: string): { project: string | null; at: string } {
  const row = t.client.sqlite
    .prepare("SELECT json_extract(data, '$.writtenIn.project') AS project, created_at AS at FROM records WHERE id = ?")
    .get(messageId) as { project: string | null; at: string } | undefined
  if (row === undefined) throw new Error(`No record ${messageId} is stored.`)
  return row
}

/** The moment the worker first took messages written in another project, as the installation row holds it. */
function theMoment(): unknown {
  const row = t.client.sqlite.prepare('SELECT other_projects_messages_since AS since FROM installation WHERE only_row = 1').get() as { since: unknown } | undefined
  if (row === undefined) throw new Error('This database has no installation row.')
  return row.since
}

/** Wait until the clock reads a later second than `stamp`, so a message written now is after it. */
async function untilTheClockHasPassed(stamp: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (localStamp(new Date()) <= stamp) {
    if (Date.now() >= deadline) throw new Error(`The clock did not pass ${stamp} within 5 seconds.`)
    await new Promise((go) => setTimeout(go, 50))
  }
}

/** Run passes until something is true, or say it never was. */
async function until(what: () => Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0 && (await what())) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 100))
  }
}

/** The worker's queue, as the worker reads it, from its own project. */
async function theQueueRows(): Promise<Record<string, unknown>[]> {
  const queue = await send('GET', '/api/worker/queue?full=1')
  expect(queue.status, JSON.stringify(queue.body).slice(0, 300)).toBe(200)
  return (queue.body['queue'] as Record<string, unknown>[] | undefined) ?? []
}

async function rowsOf(messageId: string): Promise<Record<string, unknown>[]> {
  return (await theQueueRows()).filter((r) => r['messageId'] === messageId)
}

/** The one delivery of a message: its mark and the run it names. */
async function deliveryOf(messageId: string): Promise<{ mark: string; run: string | null }> {
  const read = (await send('GET', `/api/messages/${messageId}`)).body as { message?: { deliveries?: { mark: string; run: string | null }[] } }
  const { mark, run } = one(read.message?.deliveries ?? [], `the delivery of ${messageId}`)
  return { mark, run }
}

async function runData(session: string): Promise<Record<string, unknown>> {
  const read = (await send('GET', `/api/records/${session}`)).body as { record?: { data?: Record<string, unknown> } }
  return read.record?.data ?? {}
}

/** Every run that carries a message, with its project and its conversation id. */
function runsCarrying(messageId: string): { project: string; conversation: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT workspace_id AS project, json_extract(data, '$.providerSession') AS conversation FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.deliveringMessage') = ?")
    .all(messageId) as { project: string; conversation: string | null }[]
}

/** Who the chat says is answering as an agent, opened from one project. */
async function theChatReads(agentId: string, project: string): Promise<{ how: string; says: string } | null> {
  const read = (await send('GET', `/api/messages/conversation?kind=agent&id=${agentId}`, undefined, project)).body as { answering?: { how: string; says: string } | null }
  return read.answering ?? null
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-another-projects-message-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: HERE,
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  const made = await send('POST', '/api/workspaces', { id: OTHER, title: 'Second desk (made-up)' })
  expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
  ids.far = await aSupervisor('far-supervisor')
  ids.lone = await aSupervisor('lone-supervisor')
  ids.busy = await aSupervisor('busy-supervisor')
  aKeptConversation(ids.far, KEPT)
  aKeptConversation(ids.busy, BUSY_KEPT)
  // THE BUSY SUPERVISOR'S RUN IN THE SECOND PROJECT, going: a run the office started, whose own process row is this test's
  // process, written in that project.
  const transcript = join(outputs, 'busy-supervisor.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'A made-up answer.' }] } })}\n`)
  ids.busyRun = t.api.createRecord({
    workspaceId: OTHER,
    kind: 'session',
    title: 'The busy supervisor at work in the second project (made-up)',
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgentId: ids.busy,
      extra: { discovered: { tool: 'claude-code', externalId: 'made-up-busy-run', logPath: transcript, resumeCommand: null, startedAt: null, entryPoint: null } },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const process_ = await send('POST', '/api/resources', {
    sessionRecordId: ids.busyRun,
    type: 'process',
    key: String(process.pid),
    detail: 'this test process, standing for the busy supervisor run in the second project',
    startedByTheProduct: true,
    adopting: 'this test process started before the session the test filed for it',
  }, OTHER)
  expect((process_.body['resource'] as { id?: string } | undefined)?.id, JSON.stringify(process_.body).slice(0, 300)).toBeDefined()
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app?.close()
  t?.close()
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
})

describe('a message written in another project', () => {
  it('is taken only after the moment the first reading of the queue writes once', async () => {
    expect(theMoment(), 'on a fresh database nobody has written the moment').toBeNull()
    old = await messageTo(ids.far, 'An old message from the second project, about record aaaaaaaaaaaa.', OTHER)
    expect(stored(old).project).toBe(OTHER)
    expect(await rowsOf(old), 'the old message is in the worker\'s queue').toEqual([])
    const first = theMoment()
    expect(first, 'the first reading of the queue wrote no moment').toBeTypeOf('string')
    moment = first as string
    expect(moment >= stored(old).at, 'the moment is before the old message was written').toBe(true)
    await untilTheClockHasPassed(moment)
    await theQueueRows()
    expect(theMoment(), 'a second reading wrote the moment again').toBe(moment)
    await onePass(settings, watching)
    await onePass(settings, watching)
    expect(theMoment(), 'the worker\'s own readings wrote the moment again').toBe(moment)
    expect(await deliveryOf(old)).toEqual({ mark: 'queued', run: null })
    expect(runsCarrying(old)).toEqual([])
  }, 60_000)

  it('the chat opened from the second project reads the supervisor as the first project does', async () => {
    const here = await theChatReads(ids.far, HERE)
    expect(here?.how).toBe('its own conversation')
    expect(await theChatReads(ids.far, OTHER)).toEqual(here)
    expect((await theChatReads(ids.lone, OTHER))?.how, 'a supervisor with no conversation reads nobody from the second project').toBe('nobody')
  }, 30_000)

  it('written after the moment, resumes the supervisor\'s conversation in the worker\'s project', async () => {
    await untilTheClockHasPassed(moment)
    const later = await messageTo(ids.far, 'A message from the second project, about record bbbbbbbbbbbb.', OTHER)
    expect(stored(later).project).toBe(OTHER)
    const row = one(await rowsOf(later), `the queue row of ${later}`)
    expect((row['resume'] as { id?: string } | null)?.id).toBe(KEPT)
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    expect(row['runningAlready']).toBeNull()
    const answered = await until(async () => {
      const { run } = await deliveryOf(later)
      return run !== null && typeof (await runData(run))['waitsUntil'] === 'string'
    })
    expect(answered, JSON.stringify(await deliveryOf(later))).toBe(true)
    expect(runsCarrying(later)).toEqual([{ project: HERE, conversation: KEPT }])
    expect(await deliveryOf(old), 'the old message was handed over with it').toEqual({ mark: 'queued', run: null })
    expect(runsCarrying(old)).toEqual([])

    // NEVER A SECOND RUN FOR ONE MESSAGE: once taken it leaves the queue, and more passes start nothing for it.
    expect(await rowsOf(later)).toEqual([])
    await onePass(settings, watching)
    await onePass(settings, watching)
    expect(runsCarrying(later)).toEqual([{ project: HERE, conversation: KEPT }])
  }, 60_000)

  it('to a supervisor with no conversation in the worker\'s project, is not taken', async () => {
    await untilTheClockHasPassed(moment)
    const lone = await messageTo(ids.lone, 'A message from the second project to a supervisor nobody has started.', OTHER)
    expect(await rowsOf(lone)).toEqual([])
    await onePass(settings, watching)
    await onePass(settings, watching)
    expect(await deliveryOf(lone)).toEqual({ mark: 'queued', run: null })
    expect(runsCarrying(lone)).toEqual([])
  }, 30_000)

  it('as a comment on a record of the second project, stays out of the worker\'s queue', async () => {
    await untilTheClockHasPassed(moment)
    const comment = await messageTo(ids.far, 'A comment on the busy run, written in the second project.', OTHER, {
      target: { target: { kind: 'record', recordId: ids.busyRun, workspaceId: OTHER }, place: { at: 'surface' } },
    })
    expect(await rowsOf(comment)).toEqual([])
  }, 30_000)

  it('as a line the office wrote there, stays out of the worker\'s queue', async () => {
    await untilTheClockHasPassed(moment)
    // THE SUPERVISOR'S CONVERSATION IS PICKED UP NOW: its run of case 3 is inside its wait. So only the rule about the
    // office's own lines keeps this one out.
    const groups = await import('../src/server/lib/groups.ts')
    const line = groups.writeASystemLineToOne(
      { kind: 'agent', id: ids.far },
      OTHER,
      SYSTEM_LINES.groupOpened('A made-up group', 'It was opened for this test.'),
      { type: 'system', id: moleOffice().id },
    ).id
    expect(stored(line).project).toBe(OTHER)
    expect(await rowsOf(line)).toEqual([])
  }, 30_000)
})

describe('a supervisor whose run is going in another project', () => {
  it('gets no second run for a message written in the worker\'s project', async () => {
    const here = await messageTo(ids.busy, 'A message in the first project while the run in the second is going.', HERE, {}, 201)
    const row = one(await rowsOf(here), `the queue row of ${here}`)
    expect(row['runningAlready'], 'the queue row does not name the run that is going').toBe(ids.busyRun)
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    await onePass(settings, watching)
    await onePass(settings, watching)
    expect(await deliveryOf(here)).toEqual({ mark: 'queued', run: null })
    expect(runsCarrying(here)).toEqual([])
  }, 30_000)
})
