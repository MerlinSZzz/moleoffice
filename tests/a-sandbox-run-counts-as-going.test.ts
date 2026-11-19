// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN GOING IN A SANDBOX IS A RUN GOING.
 *
 * A run started with `tools/sandbox.mjs exec` is a real run of the agent: it serves the agent, its
 * session record says `running`, and its process is alive. But the message worker did not start it,
 * so its record carries no `deliveringMessage`. The reader that asks "is a run going for this agent"
 * used to read only the rows the message worker had started, so it dropped such a run before it
 * looked at it — and the chat drew "Cannot reach" for an agent that was working.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. a live run in a sandbox, with no `deliveringMessage`, IS serving its agent — through
 *      `runServing`, and through `whoIsAnsweringAs`, whose sentence names the sandbox INSTANCE (the
 *      folder's last segment) and never the template the sandbox was made from;
 *   2. a live run on the host, which does carry `deliveringMessage`, still counts, and its sentence
 *      does not invent a sandbox;
 *   3. a run whose record says `finished` does not count, even with a live process;
 *   4. a run whose record says `running` but which has no live process does not count;
 *   5. `runsWaitingForTheNextMessage`, which reads through `runRows`, still ignores a run the message
 *      worker did not start;
 *   6. a live host run with no `deliveringMessage` and no sandbox field, whose record does not say
 *      the office started it, draws the honest sentence: a run is going for this agent, and not that
 *      Mole Office started it;
 *   7. a live host run whose record does say the office started it draws the "Mole Office started"
 *      sentence;
 *   8. the message queue itself sees a live sandbox run: its row carries the run and the one waiting
 *      sentence, names the instance and not the template, does not carry the "press Start a new agent"
 *      reason, is not offered a resume, and the worker holds the message with that one sentence; a
 *      message to an agent with nothing going still gets the Start offer. (The last describe block
 *      below, with its own mutation.)
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the eight cases below, all green.
 *
 * MUTATION ONE: in src/server/lib/worker.ts, `everyRunRow` was given the message-worker filter that
 * `runRows` already had — `.filter((row) => said(dataOf(row)['deliveringMessage']) !== null)` — so
 * the reader was the old filtered one again. Cases 1 and 2 went red; the finished-run, no-process
 * and waiting-run cases stayed green, because those do not turn on the filter. The filter line was
 * removed.
 *
 * MUTATION TWO: in src/shared/handles.ts, `whoIsAnsweringSays` was given back the old unconditional
 * wording for a run with no sandbox — the `if (startedByMoleOffice)` was deleted and the function
 * always returned 'A run Mole Office started is answering. ...'. Case 6 went red, because its
 * record does not say the office started it. The `if` was put back.
 *
 * MUTATION THREE (round 4): in src/server/lib/worker.ts, `theSandboxNameIn` was given back the
 * template-first reading — `const template = said(record['template']); if (template !== null) return
 * template` before the folder — so a run's sentence named the template. Case 1 and the queue case
 * below went red: their sentence held "a-template" and not "a-test-sandbox". The instance reading was
 * put back.
 *
 * CONTROL AFTER THE RESTORES: the eight cases, all green.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []

beforeAll(async () => {
  t = await freshDb()
  // THE ROLE CARDS ARE READ BY THE SERVER'S OWN START. A finished run is checked against them, and a
  // test that wrote one without them would be measuring a product that never started.
  const built = await apiApp()
  app = built.app
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
})

/** Register a durable agent and give back its registry id. */
/**
 * Register an agent, and give back its REGISTRY id, which is what `runServing` and
 * `whoIsAnsweringAs` take. Since criterion I1 that id is minted and is neither the handle nor the id
 * of the agent's own record, so the record's id is mapped to its registry row.
 */
function anAgent(handle: string): string {
  const record = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
  return (t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record) as { id: string }).id
}

/**
 * A session record, running unless said otherwise.
 *
 * `startedByMoleOffice` is not put here by default, because it is not true of every run: the office
 * writes it on the runs its message worker starts, and `tools/register-a-run.mjs` does not write it
 * at all. A case that means one of those passes the field itself.
 */
function aSession(data: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', ...data },
    actor: t.api.HUMAN,
  }).id
}

/**
 * Mark a session record finished without going through the finish door.
 *
 * The door seals a run's work, which is a different subject; this file measures only what
 * `runServing` does with a record whose state is not `running`. Writing the state straight into the
 * row is the smallest way to put that record in front of the reader.
 */
function saidTheRunFinished(session: string): void {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(session) as
    | { data: string }
    | undefined
  if (row === undefined) throw new Error('the session record went missing')
  const data = JSON.parse(row.data) as Record<string, unknown>
  data['state'] = 'finished'
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), session)
}

/**
 * A real process of this test's own, in its own group, registered against the run.
 *
 * Registered the way the run's own starter registers it. The office's worker marks the row of a run it
 * starts `startedByTheProduct: true` (`startOne` and `startTheMergeTool` in src/worker/index.ts), and a
 * run the office started is read by that row alone. A run the office did not start, such as one
 * started with `tools/sandbox.mjs exec`, has its row registered without the mark.
 */
async function aLiveProcessFor(sessionRecordId: string): Promise<ChildProcess> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(sessionRecordId) as { data: string }
  const theOfficeStartedIt = (JSON.parse(row.data) as Record<string, unknown>)['startedByMoleOffice'] === true
  registerResource({
    workspaceId: 'default',
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    ...(theOfficeStartedIt ? { startedByTheProduct: true } : {}),
    actor: t.api.HUMAN,
  })
  return child
}

/**
 * The sandbox a run names, as its launcher wrote it.
 *
 * THE TEMPLATE AND THE FOLDER DELIBERATELY DIFFER. A record's `sandbox` field always carries the template
 * the sandbox was made from, and every sandbox on this machine comes from one template. So a test whose
 * template and folder are the same string cannot tell the template from the instance, and passes whichever
 * one the reader picks. Here the template is "a-template" and the folder ends in "a-test-sandbox", which is
 * the instance name `tools/sandbox.mjs` accepts.
 */
const SANDBOX = {
  template: 'a-template',
  container: 'a-container-resource',
  folder: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/a-test-sandbox`,
}

describe('a run going in a sandbox counts as going', () => {
  it('is serving its agent through runServing, though it carries no deliveringMessage', async () => {
    const agentId = anAgent('a-sandbox-runner')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)

    const { runServing } = await import('../src/server/lib/worker.ts')
    expect(runServing(agentId, 'default')).toBe(session)
  })

  it('answers who is answering with a run, and its sentence names the sandbox instance', async () => {
    const agentId = anAgent('a-sandbox-runner-with-a-sentence')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)

    const { whoIsAnsweringAs } = await import('../src/server/lib/worker.ts')
    const answering = whoIsAnsweringAs(agentId, 'default')
    expect(answering.how).toBe('a run')
    expect(answering.session).toBe(session)
    expect(answering.says).toContain('A run is going for this agent')
    // THE INSTANCE, NOT THE TEMPLATE. The folder's last segment is the name the launcher takes; the
    // template is shared by every sandbox on this machine and would name none of them.
    expect(answering.says).toContain('a-test-sandbox')
    expect(answering.says).not.toContain('a-template')
  })

  it('a live host run, which does carry deliveringMessage, still counts and names no sandbox', async () => {
    const agentId = anAgent('a-host-runner')
    const session = aSession({ servingAgent: agentId, deliveringMessage: 'a-message-record', startedByMoleOffice: true })
    await aLiveProcessFor(session)

    const { runServing, whoIsAnsweringAs } = await import('../src/server/lib/worker.ts')
    expect(runServing(agentId, 'default')).toBe(session)
    const answering = whoIsAnsweringAs(agentId, 'default')
    expect(answering.how).toBe('a run')
    expect(answering.says).not.toContain('a-test-sandbox')
    expect(answering.says).not.toContain(SANDBOX.template)
  })

  it('a live host run the office did not start says only that a run is going, not that the office started it', async () => {
    const agentId = anAgent('a-runner-started-elsewhere')
    // NO `startedByMoleOffice`, which is what `tools/register-a-run.mjs` writes: the record does not
    // say the office started this run, and the sentence may not claim it did.
    const session = aSession({ servingAgent: agentId })
    await aLiveProcessFor(session)

    const { whoIsAnsweringAs } = await import('../src/server/lib/worker.ts')
    const answering = whoIsAnsweringAs(agentId, 'default')
    expect(answering.how).toBe('a run')
    expect(answering.session).toBe(session)
    expect(answering.says).toContain('A run is going for this agent')
    expect(answering.says).not.toContain('Mole Office started')
  })

  it('a live host run the office did start says the office started it', async () => {
    const agentId = anAgent('a-runner-started-by-the-office')
    const session = aSession({ servingAgent: agentId, startedByMoleOffice: true })
    await aLiveProcessFor(session)

    const { whoIsAnsweringAs } = await import('../src/server/lib/worker.ts')
    const answering = whoIsAnsweringAs(agentId, 'default')
    expect(answering.how).toBe('a run')
    expect(answering.session).toBe(session)
    expect(answering.says).toContain('A run Mole Office started is answering')
  })

  it('a run whose record says finished does not count, even with a live process', async () => {
    const agentId = anAgent('a-finished-runner')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    saidTheRunFinished(session)

    const { runServing } = await import('../src/server/lib/worker.ts')
    expect(runServing(agentId, 'default')).toBeNull()
  })

  it('a run whose record says running but has no live process does not count', async () => {
    const agentId = anAgent('a-runner-with-no-process')
    aSession({ servingAgent: agentId, sandbox: SANDBOX })

    const { runServing } = await import('../src/server/lib/worker.ts')
    expect(runServing(agentId, 'default')).toBeNull()
  })

  it('runsWaitingForTheNextMessage still ignores a run the message worker did not start', async () => {
    const agentId = anAgent('a-waiting-runner')
    const until = localStamp(new Date(Date.now() + 3_600_000))
    const waitingForTheWorker = aSession({
      servingAgent: agentId,
      deliveringMessage: 'a-message-record',
      startedByMoleOffice: true,
      providerSession: 'a-provider-session',
      waitsUntil: until,
    })
    const aSandboxRun = aSession({
      servingAgent: agentId,
      sandbox: SANDBOX,
      providerSession: 'another-provider-session',
      waitsUntil: until,
    })

    const { runsWaitingForTheNextMessage } = await import('../src/server/lib/worker.ts')
    const waiting = runsWaitingForTheNextMessage('default').map((one) => one.session)
    expect(waiting).toContain(waitingForTheWorker)
    expect(waiting).not.toContain(aSandboxRun)
  })
})

/**
 * THE QUEUE ASKS THE SAME QUESTION THE CHAT ASKS.
 *
 * The chat's answering mark reads every run row, so a run started in a sandbox counts. The queue
 * read only the runs the message worker started, so a message to the same agent was held with the
 * "press Start a new agent" sentence while the chat said a run was going. These cases measure the
 * queue row itself and the sentence the worker returns for it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: both cases below, green, and the eight cases above.
 *
 * MUTATION: in src/server/lib/worker.ts the queue was given the message-worker list for the two
 * readings again — `everyRunRows` was replaced with `sessionRows` in the call to `theRunRowServing`
 * and in the argument to `whyNobodyIsAnsweringAsIt`. The sandbox case went red: `runningAlreadySays`
 * was null and `nobodyIsAnsweringAsIt` was the Start offer. The every-run list was put back.
 */
describe('the queue counts the sandbox run the chat counts', () => {
  const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
  const workerSettings = {
    checkout: fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, ''),
    runs: 2,
    hops: 3,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  } as unknown as WorkerSettings

  const AS_THE_OWNER = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }

  /** Register an agent through the real door, so the registry the message door reads has it. */
  async function anAgentRegistered(handle: string): Promise<string> {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
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
      headers: AS_THE_OWNER,
      payload: { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } },
    })
    expect(reply.statusCode, reply.body).toBe(answers)
    return (JSON.parse(reply.body) as { record: { id: string } }).record.id
  }

  /** The queue row for one message, or a failure naming the message. */
  async function theQueuedRow(messageId: string): Promise<Record<string, unknown>> {
    const { theQueue } = await import('../src/server/lib/worker.ts')
    const row = theQueue('default').find((one) => one.messageId === messageId)
    if (row === undefined) throw new Error(`the message ${messageId} is not in the queue`)
    return row as unknown as Record<string, unknown>
  }

  it('holds a message for a live sandbox run with the one waiting sentence for a run the office did not start', async () => {
    const agentId = await anAgentRegistered('a-sandbox-runner-in-the-queue')
    const session = aSession({ servingAgent: agentId, sandbox: SANDBOX })
    await aLiveProcessFor(session)
    const messageId = await aMessageTo(agentId, 'Is the piece done?')

    const row = await theQueuedRow(messageId)
    // ONE ANSWER WITH THE CHAT. The chat draws whoIsAnsweringAs; the queue carries the one waiting sentence.
    expect(row['runningAlready']).toBe(session)
    expect(String(row['runningAlreadySays'])).toContain('A run is going for this agent')
    // THE INSTANCE, NOT THE TEMPLATE.
    expect(String(row['runningAlreadySays'])).toContain('a-test-sandbox')
    expect(String(row['runningAlreadySays'])).not.toContain('a-template')
    // AND WHAT HAPPENS TO THE MESSAGE, READ FROM THE CODE: the run can read it, and until it does or ends
    // the message waits. The sentence does not predict what happens after the run ends.
    expect(String(row['runningAlreadySays'])).toContain('can read the message in the conversation')
    expect(String(row['runningAlreadySays'])).toContain('The message waits here until that run reads it or ends')
    // NOT HELD AS "NOBODY IS ANSWERING", AND NOT RESUMED INTO A RUN IT CANNOT CONTINUE.
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    expect(row['resume']).toBeNull()

    // AND THE SENTENCE THE WORKER WRITES ON THE DELIVERY ROW IS THE SAME ONE.
    const { whyNotNow } = await import('../src/worker/index.ts')
    const because = whyNotNow(row as unknown as Parameters<typeof whyNotNow>[0], workerSettings, 0)
    expect(because, 'the worker would start a second run for an agent that has one going').toEqual({
      because: row['runningAlreadySays'],
    })
  })

  it('still offers the Start press to an agent with nothing going', async () => {
    const agentId = await anAgentRegistered('a-runner-with-nothing-going')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await aMessageTo(agentId, 'Are you there?', 409)

    const row = await theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(row['runningAlreadySays']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent')
  })
})
