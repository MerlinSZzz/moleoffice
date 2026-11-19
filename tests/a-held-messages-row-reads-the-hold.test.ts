// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HELD MESSAGE'S ROW READS WHO IS ANSWERING THE ONE WAY THE CHAT READS IT.
 *
 * Problem TRR4WT3Kl7b4. `theQueue` built `runningAlreadySays` from the run rows alone, so a row
 * could say "Nobody has this agent open in a terminal" while `heldByALiveSession` was also set. Two
 * answers about one agent at one moment is what invariant 9 forbids, and nothing draws the queue row
 * today only because `whyNotNow` happens to return `heldByALiveSession` first.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. An agent with a live sandbox run AND a handle held by a live session: the row's
 *      `runningAlreadySays` is the hold's own sentence, it never says nobody has the agent open, and
 *      it is the same sentence `GET /api/handles/<handle>` answers with, word for word. The run is
 *      still real and live; the hold simply wins, as `whoIsAnsweringAs` reads it.
 *   2. An agent with a live sandbox run and no hold: the row carries the run and the sandbox waiting
 *      sentence wave 6 made.
 *   3. An agent with nothing answering: `runningAlready` and `runningAlreadySays` are both null.
 *   5. An agent whose handle a run Mole Office started holds (criterion M79, added 27 September
 *      2026): the row names the run in `runningAlready` with the run sentence, and
 *      `heldByALiveSession` is null, because the one reading says a run is answering and not a live
 *      session. The handle door reads the same run.
 *   4. The helper in `src/shared/handles.ts` never returns one of the two fields without the other,
 *      proved both by a runtime case over each `how` and by a compile-time assertion on its return
 *      type. That is the one type the server's row and the worker's mirror both take their two
 *      fields from.
 *
 * IT DRIVES THE REAL SERVER AND THE REAL QUEUE. The live run and the live session are real process
 * rows this file starts and kills by group in `afterAll`; the transcript the hold's session points
 * at is real; the hold is written through the real door. Nothing here spends a model call.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the four cases below, all green.
 *
 * MUTATION: in src/server/lib/worker.ts, the line that reads who is answering in `theQueue` was
 * changed from `const answering = whoIsAnsweringAs(row.recipientId, message.workspaceId,
 * everyRunRows)` to
 * `const answering = { ...whoIsAnsweringAs(row.recipientId, message.workspaceId, everyRunRows),
 * how: 'a run' as const }`. That forces the hold to be read as a run, which is the hold reading
 * taken out of the pair without touching the helper. Case 1 went red: the sentence said "Nobody has
 * this agent open in a terminal" and no longer matched the handle door's answer. The original line
 * was put back.
 *
 * CONTROL AFTER THE RESTORE: the four cases, all green.
 *
 * CASE 5, 27 SEPTEMBER 2026 (problem TRR4WT3Kl7b4, the run case). CONTROL: five cases green.
 * MUTATION: in `whyALiveSessionHasThis` in src/server/lib/worker.ts, the line
 * `if (reading.answering.how === 'a run') return null` removed, which reads the bare hold again:
 * case 5 red, heldByALiveSession named the run as a live session. RESTORE: five cases green.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import {
  NO_TERMINAL_HAS_THIS_AGENT_OPEN,
  theAlreadyAnsweringOnARow,
  theMessageWaitsForARunGoing,
  type AlreadyAnsweringOnARow,
  type WhoIsAnswering,
} from '../src/shared/handles.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
/** Where the held session's transcript lives, removed with the file. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-queue-row-hold-'))
let transcriptNumber = 0

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
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
  rmSync(transcripts, { recursive: true, force: true })
})

/** Register an agent through the real door and give back its registry id. */
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

/** File a message to one agent through the real door, so its delivery row is real. */
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

/** A real process of this file's own, in its own group, registered against the session. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({
    workspaceId: 'default',
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    actor: t.api.HUMAN,
  })
}

/** A run of this agent in a sandbox, as `tools/sandbox.mjs exec` files one. */
function aSandboxRun(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, sandbox: SANDBOX },
    actor: t.api.HUMAN,
  }).id
}

/**
 * A run Mole Office started for this agent, as the message worker files one: its record names the
 * agent it serves and says the office started it, which is what makes a hold on it a run's hold.
 */
function aRunTheOfficeStarted(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run the office started',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, startedByMoleOffice: true },
    actor: t.api.HUMAN,
  }).id
}

/**
 * The sandbox a run names, with the template and the folder deliberately different.
 *
 * The same fixture `a-sandbox-run-counts-as-going.test.ts` uses: a record's `sandbox` field always
 * carries the template, so a test whose template and folder are the same string cannot tell the
 * instance from the template. The sentence must name the instance.
 */
const SANDBOX = {
  template: 'a-template',
  container: 'a-container-resource',
  folder: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/a-test-sandbox`,
}

/**
 * A session record for a terminal somebody opened, with a transcript it can be read from.
 *
 * Criterion M126: a live process alone is not a session that can answer, so the record points at a
 * transcript written now, exactly as the hook writes one.
 */
function aLiveSession(doing: string): string {
  transcriptNumber += 1
  const logPath = join(transcripts, `queue-row-hold-${String(transcriptNumber)}.jsonl`)
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
          externalId: `queue-row-hold-${String(transcriptNumber)}`,
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

/** The session takes the agent's handle through the real door. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The one queued row for one message. */
async function theQueuedRow(messageId: string): Promise<Record<string, unknown>> {
  const { theQueue } = await import('../src/server/lib/worker.ts')
  return one(
    theQueue('default').filter((row) => row.messageId === messageId),
    `the queued row for ${messageId}`,
  ) as unknown as Record<string, unknown>
}

describe('the queue row reads the hold the chat reads', () => {
  it('a held handle beats a live run, and the sentence is the handle door’s own answer', async () => {
    const handle = 'held-and-running'
    const agentId = await anAgent(handle)
    // A LIVE SANDBOX RUN FOR THE SAME AGENT.
    const run = aSandboxRun(agentId)
    await aLiveProcessFor(run)
    // AND A LIVE SESSION HOLDING THE HANDLE.
    const session = aLiveSession('a terminal answering as held-and-running')
    await aLiveProcessFor(session)
    await hold(handle, session)
    // A MESSAGE WAITING ON THE AGENT.
    const messageId = await messageTo(agentId, 'Is the piece done?')

    const row = await theQueuedRow(messageId)
    const pair = row as unknown as AlreadyAnsweringOnARow
    // THE HOLD WINS, and the run is not named instead of it.
    expect(pair.runningAlready).toBe(session)
    // NEVER THE SENTENCE THAT CONTRADICTS heldByALiveSession BELOW.
    expect(pair.runningAlreadySays).not.toContain(NO_TERMINAL_HAS_THIS_AGENT_OPEN)
    expect(pair.runningAlreadySays).toContain('Answering from')
    // AND THE ROW CARRIES THE OTHER HOLD REASON TOO, which is what made the old row contradictory.
    expect(String(row['heldByALiveSession'])).toContain(session)
    expect(String(row['heldByALiveSession'])).toContain('no run was started')

    // THE HANDLE DOOR'S OWN WORDS, WORD FOR WORD. `GET /api/handles/<handle>` answers with
    // `whoIsAnsweringAs(...).says`, so this is the one reading, not a copy of it.
    const read = await app.inject({ method: 'GET', url: `/api/handles/${handle}`, headers: AS_THE_OWNER })
    expect(read.statusCode, read.body).toBe(200)
    const answering = (JSON.parse(read.body) as { answering: { how: string; session: string; says: string } }).answering
    expect(answering.how).toBe('a live session')
    expect(answering.session).toBe(session)
    expect(pair.runningAlreadySays).toBe(answering.says)
  })

  it('a live sandbox run with no hold keeps the sandbox waiting sentence wave 6 made', async () => {
    const agentId = await anAgent('running-with-no-hold')
    const run = aSandboxRun(agentId)
    await aLiveProcessFor(run)
    const messageId = await messageTo(agentId, 'Any word from the sandbox?')

    const row = await theQueuedRow(messageId)
    expect(row['runningAlready']).toBe(run)
    expect(String(row['runningAlreadySays'])).toContain('A run is going for this agent')
    // THE INSTANCE, NOT THE TEMPLATE.
    expect(String(row['runningAlreadySays'])).toContain('a-test-sandbox')
    expect(String(row['runningAlreadySays'])).not.toContain('a-template')
    // AND WHAT HAPPENS TO THE MESSAGE, READ FROM THE CODE.
    expect(String(row['runningAlreadySays'])).toContain('can read the message in the conversation')
    expect(String(row['runningAlreadySays'])).toContain('The message waits here until that run reads it or ends')
  })

  it('a run holding the handle is named as a run, and heldByALiveSession is null (M79)', async () => {
    // EVERY RUN HOLDS ITS AGENT'S HANDLE SINCE CRITERION M79. The row used to read the bare hold for
    // heldByALiveSession and name the run as "a session", while runningAlreadySays named the same
    // record as a run with nobody at a terminal: two answers about one agent (problem TRR4WT3Kl7b4).
    const handle = 'held-by-a-run'
    const agentId = await anAgent(handle)
    const run = aRunTheOfficeStarted(agentId)
    await hold(handle, run)
    const messageId = await messageTo(agentId, 'Is the run done?')

    const row = await theQueuedRow(messageId)
    const pair = row as unknown as AlreadyAnsweringOnARow
    expect(pair.runningAlready).toBe(run)
    expect(pair.runningAlreadySays).toContain('A run Mole Office started is answering')
    // THE ONE READING SAYS A RUN, SO NOTHING ON THE ROW SAYS A LIVE SESSION HAS IT.
    expect(row['heldByALiveSession'], 'the row names the run as a live session too').toBeNull()

    // AND THE HANDLE DOOR READS THE SAME RUN.
    const read = await app.inject({ method: 'GET', url: `/api/handles/${handle}`, headers: AS_THE_OWNER })
    expect(read.statusCode, read.body).toBe(200)
    const answering = (JSON.parse(read.body) as { answering: { how: string; session: string } }).answering
    expect(answering.how).toBe('a run')
    expect(answering.session).toBe(run)
  })

  it('an agent with nothing answering has both fields null', async () => {
    const agentId = await anAgent('nothing-answering')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const messageId = await messageTo(agentId, 'Are you there?', 409)

    const row = await theQueuedRow(messageId)
    expect(row['runningAlready']).toBeNull()
    expect(row['runningAlreadySays']).toBeNull()
  })
})

describe('the pair is one type, both set or both null', () => {
  it('the helper never returns one field without the other', () => {
    const cases: WhoIsAnswering[] = [
      { how: 'nobody', session: null, says: 'nobody is answering', hold: null },
      { how: 'a live session', session: 'a-session', says: 'the hold sentence', hold: null },
      { how: 'a run', session: 'a-run', says: 'the run sentence', hold: null },
    ]
    for (const answering of cases) {
      const pair = theAlreadyAnsweringOnARow(answering, 'a-test-sandbox', false)
      expect(pair.runningAlready === null).toBe(pair.runningAlreadySays === null)
    }
    // AND EACH BRANCH CARRIES THE SENTENCE IT SHOULD: nobody gives both null, a hold gives the hold's
    // own sentence, and a run gives the waiting sentence wave 6 made.
    expect(theAlreadyAnsweringOnARow(cases[0]!, 'a-test-sandbox', false)).toEqual({
      runningAlready: null,
      runningAlreadySays: null,
    })
    expect(theAlreadyAnsweringOnARow(cases[1]!, 'a-test-sandbox', false)).toEqual({
      runningAlready: 'a-session',
      runningAlreadySays: 'the hold sentence',
    })
    expect(theAlreadyAnsweringOnARow(cases[2]!, 'a-test-sandbox', false)).toEqual({
      runningAlready: 'a-run',
      runningAlreadySays: theMessageWaitsForARunGoing('a-test-sandbox', false),
    })
  })
})

/**
 * A COMPILE-TIME ASSERTION. The helper's return type must be exactly the pair: both fields set, or
 * both null. A type widened to `{ runningAlready: string | null; runningAlreadySays: string | null }`
 * fails this file's type check, which is what keeps the rule one type instead of two copies.
 */
type Assert<T extends true> = T
type BothOrNeither =
  | { runningAlready: string; runningAlreadySays: string }
  | { runningAlready: null; runningAlreadySays: null }
type TheHelperReturnsThePair = Assert<
  ReturnType<typeof theAlreadyAnsweringOnARow> extends BothOrNeither
    ? BothOrNeither extends ReturnType<typeof theAlreadyAnsweringOnARow>
      ? true
      : false
    : false
>
