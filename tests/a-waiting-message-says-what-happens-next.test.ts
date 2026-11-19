// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WAITING FOR AN AGENT SAYS WHAT HAPPENS TO IT NEXT. Criterion M86, wave 13u round 18.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 12 OCTOBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A message the person sent to an agent nothing was answering as showed one tick, and the tick's
 * label was the word *Waiting*. Its hover sentence was the delivery row's own reason only once the
 * message worker had held the message and written one. Before that pass, or with no worker running,
 * the hover said only that the message was written down and nobody had read it. Nothing said whether
 * a run would start, whether the message waited behind a run, or whether it waited for a session.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, ON THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The conversation door now answers `whatHappensToAWaitingMessage`, one sentence read from who is
 * answering as the agent. In each case below it is the sentence the queue row for a waiting message
 * carries for the message worker, so the chat and the worker cannot say two things:
 *
 * 1. Nothing answering: the row's `nobodyIsAnsweringAsIt`, which says the message waits for a press.
 * 2. A live session holds the handle: the row's `heldByALiveSession`.
 * 3. A run Mole Office started holds the handle: the row's `runningAlreadySays`, which says the
 *    message goes to the run when it ends.
 * 4. A sandbox run with a live process and no hold: the row's `runningAlreadySays`, which says the
 *    message waits until that run reads it or ends.
 *
 * The chat's drawing of it is tests/a-waiting-message-says-what-happens-next-in-the-chat.test.ts.
 *
 * Fixtures are copied from tests/a-held-messages-row-reads-the-hold.test.ts: real process rows this
 * file starts and kills by group in `afterAll`, a real transcript, and the hold written through the
 * real door. Nothing here spends a model call.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-what-happens-next-'))
let transcriptNumber = 0

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

async function anAgent(handle: string): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
  const agents = (JSON.parse(listed.body) as { agents: { id: string; handle: string }[] }).agents
  return one(agents.filter((row) => row.handle === handle), `the registry row for ${handle}`).id
}

async function messageTo(agentId: string, body: string, answers: 201 | 409 = 201): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } },
  })
  expect(reply.statusCode, reply.body).toBe(answers)
  return (JSON.parse(reply.body) as { record: { id: string } }).record.id
}

async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

const SANDBOX = {
  template: 'a-template',
  container: 'a-container-resource',
  folder: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/a-test-sandbox`,
}

function aSandboxRun(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, sandbox: SANDBOX },
    actor: t.api.HUMAN,
  }).id
}

function aRunTheOfficeStarted(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run the office started',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, startedByMoleOffice: true },
    actor: t.api.HUMAN,
  }).id
}

/** A terminal session with a transcript written now, so it reads as a session that can answer. */
function aLiveSession(doing: string): string {
  transcriptNumber += 1
  const logPath = join(transcripts, `what-happens-next-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    logPath,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'answering as the held agent' }] },
    })}\n`,
  )
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: doing,
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing,
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: `what-happens-next-${String(transcriptNumber)}`,
          logPath,
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
        },
      },
    },
    actor: t.api.HUMAN,
  }).id
}

async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function theQueuedRow(messageId: string): Promise<Record<string, unknown>> {
  const { theQueue } = await import('../src/server/lib/worker.ts')
  return one(theQueue('default').filter((row) => row.messageId === messageId), `the queued row for ${messageId}`) as unknown as Record<
    string,
    unknown
  >
}

/** What the person's conversation with the agent says a waiting message waits for, and who it says is answering. */
async function theConversationSays(agentId: string): Promise<{ next: string | null; answering: { how: string; says: string } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${agentId}`, headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { whatHappensToAWaitingMessage: string | null; answering: { how: string; says: string } }
  return { next: body.whatHappensToAWaitingMessage, answering: body.answering }
}

describe('the conversation says what the queue row says a waiting message waits for', () => {
  it('nothing answering: the message waits for the person to press', async () => {
    const agentId = await anAgent('nothing-answers-yet')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await messageTo(agentId, 'Is the second firing done?', 409)
    const row = await theQueuedRow(messageId)
    const said = await theConversationSays(agentId)
    expect(said.answering.how).toBe('nobody')
    expect(row['nobodyIsAnsweringAsIt'], 'the queue row says nothing about a message nobody answers').not.toBeNull()
    expect(said.next).toBe(row['nobodyIsAnsweringAsIt'])
    expect(said.next).toContain('waiting for the person to press')
  })

  it('a live session holds the handle: the message goes to that session', async () => {
    const handle = 'a-terminal-has-it'
    const agentId = await anAgent(handle)
    const session = aLiveSession('a terminal answering as a-terminal-has-it')
    await aLiveProcessFor(session)
    await hold(handle, session)
    const messageId = await messageTo(agentId, 'Read the kiln log when you can.')
    const row = await theQueuedRow(messageId)
    const said = await theConversationSays(agentId)
    expect(said.answering.how).toBe('a live session')
    expect(said.next).toBe(row['heldByALiveSession'])
    expect(said.next).toContain('so this message goes to it')
  })

  it('a run Mole Office started holds the handle: the message goes to it when the run ends', async () => {
    const handle = 'a-run-has-it'
    const agentId = await anAgent(handle)
    const run = aRunTheOfficeStarted(agentId)
    await hold(handle, run)
    const messageId = await messageTo(agentId, 'Add the third shelf to the table.')
    const row = await theQueuedRow(messageId)
    const said = await theConversationSays(agentId)
    expect(said.answering.how).toBe('a run')
    expect(said.next).toBe(row['runningAlreadySays'])
    // NOT THE ANSWERING SENTENCE ALONE, which says a run is going and nothing of the message.
    expect(said.next).not.toBe(said.answering.says)
    expect(said.next).toContain('This message goes to it when that run ends.')
  })

  it('a sandbox run with no hold: the message waits until that run reads it or ends', async () => {
    const agentId = await anAgent('a-sandbox-run-has-it')
    const run = aSandboxRun(agentId)
    await aLiveProcessFor(run)
    const messageId = await messageTo(agentId, 'Any word from the sandbox?')
    const row = await theQueuedRow(messageId)
    const said = await theConversationSays(agentId)
    expect(said.answering.how).toBe('a run')
    expect(said.next).toBe(row['runningAlreadySays'])
    expect(said.next).toContain('a-test-sandbox')
    expect(said.next).toContain('The message waits here until that run reads it or ends.')
  })
})
