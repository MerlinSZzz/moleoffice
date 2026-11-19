// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A MESSAGE TO AN AGENT SOMEBODY HAS OPEN GOES TO THAT SESSION, AND NO RUN IS STARTED.
 *
 * Criterion H2 of design/messages/ACCEPTANCE.md section 10: while the agent is plainly open, starting a second one
 * beside it does not make sense.
 *
 * WHAT IS PROVED HERE. The queue tells the worker a live session has the agent, and one pass of the
 * real worker starts no run and writes that sentence on the row. The live session then says it was
 * given the message and the clock becomes a tick, with the row naming the session and no run. When
 * the hold goes quiet, the very next pass starts a run for the same message — so the guard is a
 * guard and not a way of losing messages. And the session that does not hold the handle cannot say
 * it was given anything.
 *
 * IT DRIVES THE REAL WORKER, not a copy of its rules: `onePass` from src/worker/index.ts against a
 * server this file listens on, with the fake runtime, which is how every other worker test is
 * written. A test that re-implemented the decision would pass while the worker did the opposite.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
// A HANDLE IS NOT FREE UNTIL THE GRACE WINDOW IS PAST TOO. Criterion M81.
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
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

/** File a session record, as the hook does for a terminal somebody opened. */
async function aSession(title: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
  })
  return (filed['record'] as { id: string }).id
}

/**
 * Send the owner's message to an agent, and give back the message id.
 *
 * AND PRESS TO START AN AGENT FOR IT. Criterion M78: a message that would be answered by starting a
 * NEW agent — one with no conversation of its own here to pick up — waits for the person's press,
 * and every agent in this file is fresh. This file is about the HOLD, so the press is done in the
 * setup and what is measured is the hold. It is sent as the person because it is refused to an agent.
 */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  const id = (filed['record'] as { id: string }).id
  await post(`/api/messages/${id}/start-an-agent`, {})
  return id
}

/** How far a message got with one recipient, and what the row says about it. */
async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

async function hold(handle: string, session: string) {
  return await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
}

/**
 * THE SESSION'S LAST WORD IS MOVED BACK, RATHER THAN WAITED FOR IN WALL TIME.
 *
 * Until 9 October 2026 the case below slept 3.5 seconds for the hold to go quiet, inside a test
 * budget of five. On the merge queue's loaded machine the two passes and the setup around that sleep
 * took the rest and more, and the case died at 5002 ms (full-suite-2026-10-09.json). Going quiet
 * means one thing to the server: `last_heard_at` is further back than the lapse and grace windows
 * (`quietFor` and `stateOf` in src/server/lib/handles.ts). So the stamp is written as if the session
 * last spoke `ms` ago, in the format the hold door writes it, and every reader still works the state
 * out from the real clock. No beat runs in this file, so nothing writes the stamp forward again.
 *
 * IT FAILS rather than moving nothing: a hold this file did not make, or two, would prove nothing.
 */
function theSessionLastSpoke(session: string, msAgo: number): void {
  const moved = t.client.sqlite
    .prepare('UPDATE handle_holds SET last_heard_at = ? WHERE session_record_id = ? AND released_at IS NULL')
    .run(localStamp(new Date(Date.now() - msAgo)), session)
  if (moved.changes !== 1) {
    throw new Error(`Expected one live hold for session ${session} to move back, and ${String(moved.changes)} moved.`)
  }
}

/**
 * RUN PASSES UNTIL NO RUN THIS FILE STARTED IS STILL GOING.
 *
 * A run is a detached process (src/worker/runtimes/os.ts). Left going, it outlived the file: it
 * wrote its exit code into a folder `afterAll` had already removed (the ENOENT line in the merge
 * log XE5VI_6J-1gX-pair-suite.log), while `afterAll` closed the server under it.
 */
async function untilEveryRunHasEnded(within = 20_000): Promise<void> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0) return
    if (Date.now() >= deadline) throw new Error('a run this file started never ended')
    await new Promise((go) => setTimeout(go, 50))
  }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  // THE RUNS THIS FILE STARTS ARE NOW WAITED FOR TO THE END (`untilEveryRunHasEnded`), so the worker
  // seals each one, and a fake-runtime run has nothing to submit. The fixture names a completion
  // note as its submission, as every other file that runs the fake runtime to its end does.
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-held-handle-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterEach(() => {
  delete process.env[BEAT]
  delete process.env[LAPSE]
  delete process.env[GRACE]
})

afterAll(async () => {
  await untilEveryRunHasEnded()
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
}, 60_000)

describe('a message to an agent a live session is answering as', () => {
  let agentId: string
  let session: string
  let messageId: string

  it('is in the queue saying a live session has it, so the worker knows why', async () => {
    agentId = await anAgent('open-in-a-terminal')
    session = await aSession('The terminal answering as open-in-a-terminal')
    await hold('open-in-a-terminal', session)
    messageId = await messageTo(agentId, 'Please look at the gripper calibration.')

    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const waiting = one(queue.queue ?? [], 'the message waiting')
    expect(waiting['messageId']).toBe(messageId)
    expect(String(waiting['heldByALiveSession'])).toContain(session)
    expect(String(waiting['heldByALiveSession'])).toContain('no run was started')
  })

  it('starts no run, and the row says a live session has it rather than leaving a clock nobody can explain', async () => {
    const report = await onePass(settings, watching)

    expect(report.started).toEqual([])
    expect(one(report.held, 'the message the worker held')).toEqual({
      messageId,
      because: expect.stringContaining(session) as unknown as string,
    })
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('queued')
    expect(String(stands.because)).toContain('one mind answers')
  })

  it('becomes a tick when the live session says it was given the message, with no run on the row', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/handles/open-in-a-terminal/took',
      headers: AS_THE_OWNER,
      payload: { session, message: messageId },
    })

    expect(reply.statusCode).toBe(200)
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    expect(stands.run).toBeNull()
    expect(String(stands.because)).toContain(session)
    expect(String(stands.because)).toContain('was waiting for this')
  })

  it('refuses a session that does not hold the handle, so nothing can mark a message taken with nothing behind it', async () => {
    const other = await aSession('A different terminal')
    const second = await messageTo(agentId, 'A second message.')

    const reply = await app.inject({
      method: 'POST',
      url: '/api/handles/open-in-a-terminal/took',
      headers: AS_THE_OWNER,
      payload: { session: other, message: second },
    })

    expect(reply.statusCode).toBe(409)
    expect(String(reply.json().error)).toContain('Only the session that is answering as an agent')
    expect((await delivery(second)).mark).toBe('queued')
  })
})

describe('when the hold goes quiet, the same message gets a run', () => {
  it('starts a run for a message that was held while the session was answering', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '2'
    process.env[GRACE] = '3'
    const agentId = await anAgent('went-away')
    const session = await aSession('The terminal that went away')
    await hold('went-away', session)
    const messageId = await messageTo(agentId, 'Anybody there?')

    // WHILE IT IS HELD: nothing is started.
    expect((await onePass(settings, watching)).started).toEqual([])

    // AND ONCE IT HAS GONE QUIET: the next pass starts a run for the same message. Quiet for four
    // seconds is one past the three-second grace window set above.
    theSessionLastSpoke(session, 4_000)
    const after = await onePass(settings, watching)

    // FILTERED BY MESSAGE, because the pass may also pick up messages the tests above left queued
    // if their holds have gone quiet too by the clock. What is proved here is about this message.
    const started = one(
      after.started.filter((run) => run.messageId === messageId),
      'the run started once the hold went quiet',
    )
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    expect(stands.run).toBe(started.session)
  })
})
