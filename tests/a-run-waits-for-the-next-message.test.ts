// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A RUN ENDS AFTER A QUIET TIME. Criterion M22 of design/messages/ACCEPTANCE.md, section 9.
 *
 * *A run that has answered waits for the next message for a setting's worth of minutes (default ten;
 * 5 or 10 are the owner's examples) and ends when none comes, with a line in the conversation saying so; a
 * message arriving inside the wait goes to the same run.*
 *
 * The decision is `5k2UP25NnN57`: a run ends after waiting a set time, for example 5 or 10 minutes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "THE SAME RUN" MEANS HERE, AND WHY THAT IS NOT A WEAKER READING
 * ---------------------------------------------------------------------------------------
 *
 * A run's process ends when it has answered — `claude -p` prints and exits, and so do the other two
 * tools. What outlives it is the conversation the tool made, which the tool can pick up again by its
 * own id. So the wait is on the conversation: for as long as it lasts, the next message to that
 * agent is answered inside it, and the agent still knows what was said. When it runs out, the
 * conversation ends and the next message starts a new one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The server is real and listening, and the queue, the marks, the session records, the delivery rows
 * and the lines in the conversation are all real rows. The agent tool is `tests/fake-runtime.mjs`,
 * a real process in a real group that prints a reply and exits. Nothing here spends a model call.
 *
 * TIME IS MOVED RATHER THAN WAITED FOR. A test that slept for ten minutes would not be run. The
 * deadline on the run's own record is patched into the past, which is the same fact as ten minutes
 * passing: the wait is a stamp, and nothing else about it is a clock.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: (body ?? {}) as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function patch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'PATCH', url: path, headers: AS_THE_OWNER, payload: body as object })
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
  const id = (filed['record'] as { id: string }).id
  // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: a message that would be
  // answered by starting a NEW agent — one with no conversation of its own here to pick up —
  // waits for the person's press, and every agent in this file is fresh. This file is about what a run does
  // AFTER it has answered, so the press is setup.
  await post(`/api/messages/${id}/start-an-agent`, {})
  return id
}

/** Run passes until something is true, or say it never was. */
async function until(what: () => Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (await what()) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 100))
  }
}

/** Every run of this project holding its conversation open for the next message. */
async function waits(): Promise<Record<string, unknown>[]> {
  const read = (await get('/api/worker/waits')) as { waits?: Record<string, unknown>[] }
  return read.waits ?? []
}

/** One session record's stored data. */
async function runData(session: string): Promise<Record<string, unknown>> {
  const read = (await get(`/api/records/${session}`)) as { record?: { data?: Record<string, unknown> } }
  return read.record?.data ?? {}
}

/** The session record of the run that answered this message, from the delivery row. */
async function runOf(messageId: string): Promise<string> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { run: string | null }[] }
  }
  const row = one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
  if (row.run === null) throw new Error(`No run is named on the delivery row for ${messageId}.`)
  return row.run
}

/** Everything said in the conversation between the owner and one agent, oldest first. */
async function conversation(
  agentId: string,
): Promise<{ sentBy: unknown; body: string; saidInFull: string | null }[]> {
  const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
    messages?: { sentBy: unknown; body: string; saidInFull: string | null }[]
  }
  return read.messages ?? []
}

/** Move a run's deadline into the past, which is the fact that its wait has run out. */
async function itsWaitRunsOut(session: string): Promise<void> {
  await patch(`/api/records/${session}`, {
    dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) },
  })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-run-waits-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
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

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a run that has answered waits for the next message', () => {
  let agentId: string
  let firstMessage: string
  let firstRun: string

  it('answers, and then holds its conversation open with a deadline written down', async () => {
    agentId = await anAgent('waiter-x')
    firstMessage = await messageTo(agentId, 'Please read record aaaaaaaaaaaa and say what it is.')
    expect(await until(async () => (await conversation(agentId)).length >= 2)).toBe(true)

    firstRun = await runOf(firstMessage)
    const data = await runData(firstRun)
    expect(data['providerSession']).toBeTypeOf('string')
    expect(data['waitsUntil']).toBeTypeOf('string')
  }, 40_000)

  it('says so on the runtime page, with how long is left', async () => {
    const runtime = (await get('/api/runtime')) as {
      worker?: { runs?: { waitingForTheNextMessage?: { session: string; says: string }[] } }
    }
    const waiting = one(runtime.worker?.runs?.waitingForTheNextMessage ?? [], 'the run waiting for the next message')
    expect(waiting.session).toBe(firstRun)
    expect(waiting.says).toContain('waiter-x')
    expect(waiting.says).toContain('waiting for the next message')
    // THE TIME LEFT, which is the half of this the criterion names. Ten minutes is the built-in
    // default and the whole wait has just started, so what is left is the whole of it.
    expect(waiting.says).toMatch(/another 10 minutes/)
  })

  it('is in the list the worker reads, and is not over yet', async () => {
    const waiting = one(await waits(), 'the run waiting for the next message')
    expect(waiting['session']).toBe(firstRun)
    expect(waiting['over']).toBe(false)
    expect(waiting['minutesLeft']).toBe(10)
  })

  it('refuses to be ended while it is still waiting, and says until when', async () => {
    // WHAT THIS IS ABOUT IS THAT THE REFUSAL WROTE NOTHING, so it counts the conversation before and
    // after rather than against a fixed number. Since criterion H3 the conversation also carries a
    // short line saying a run answered, so a fixed number here was counting a line this test has no
    // view about.
    const before = (await conversation(agentId)).length
    const refused = await post(`/api/worker/waits/${firstRun}/over`, {})
    expect(String(refused['error'])).toContain('still waiting for the next message')
    expect((await conversation(agentId)).length).toBe(before)
  })

  it('answers a message that arrives inside the wait in the same conversation', async () => {
    const inside = await messageTo(agentId, 'One more thing, about record bbbbbbbbbbbb.')
    expect(await until(async () => (await conversation(agentId)).length >= 4)).toBe(true)

    const secondRun = await runOf(inside)
    expect(secondRun).not.toBe(firstRun)
    // THE SAME CONVERSATION, PICKED UP BY ITS OWN ID. The second run was started with the id the
    // first one made, which is what "goes to the same run" means for a tool that prints and exits.
    const first = await runData(firstRun)
    const second = await runData(secondRun)
    expect(second['providerSession']).toBe(first['providerSession'])

    // AND THE FIRST RUN IS NO LONGER WAITING, because the message it was waiting for came.
    expect((await waits()).map((one_) => one_['session'])).not.toContain(firstRun)
  }, 40_000)
})

describe('and it ends when no message comes', () => {
  let agentId: string
  let theRun: string

  it('is over once its moment has passed, and nothing has said so yet', async () => {
    agentId = await anAgent('quiet-x')
    const asked = await messageTo(agentId, 'Please read record cccccccccccc.')
    expect(await until(async () => (await conversation(agentId)).length >= 2)).toBe(true)
    theRun = await runOf(asked)

    await itsWaitRunsOut(theRun)
    const waiting = one(
      (await waits()).filter((one_) => one_['session'] === theRun),
      'the run whose wait has run out',
    )
    expect(waiting['over']).toBe(true)
    expect(waiting['minutesLeft']).toBe(0)
  }, 40_000)

  it('writes a line in the conversation saying it ended after waiting', async () => {
    expect(await until(async () => (await conversation(agentId)).some((m) => m.body.includes('run ended')))).toBe(true)
    const said = (await conversation(agentId)).filter((m) => m.body === SYSTEM_LINES.aRunWaitedAndEnded(10).line)
    expect(said).toHaveLength(1)
    // MOLE OFFICE SAYS IT, NOT THE AGENT. Criterion M11: a line the product writes has a sender of
    // its own and is never faked as an agent's words.
    expect(said[0]?.sentBy).toEqual(moleOffice())
    // THE FEW WORDS ARE THE BODY AND THE SENTENCE IS BESIDE IT, criterion M34. The minutes are a
    // setting a reader has to be able to see, so they stay — in the sentence, which the panel draws
    // as the block's hover text.
    expect(said[0]?.body).toBe('Agent run ended')
    expect(said[0]?.saidInFull).toContain('10 minutes')
    expect(said[0]?.saidInFull).toContain('will not remember')
  }, 40_000)

  it('says it once, however many passes run', async () => {
    await onePass(settings, watching)
    await onePass(settings, watching)
    const said = (await conversation(agentId)).filter((m) => m.body === SYSTEM_LINES.aRunWaitedAndEnded(10).line)
    expect(said).toHaveLength(1)
    expect((await waits()).filter((one_) => one_['session'] === theRun)).toHaveLength(0)
  }, 40_000)

  it('starts a new conversation for the next message, because the old one has ended', async () => {
    const after = await messageTo(agentId, 'Are you still there? This is about record dddddddddddd.')
    expect(await until(async () => (await conversation(agentId)).some((m) => m.body.includes('dddddddddddd')))).toBe(
      true,
    )
    const newRun = await runOf(after)
    const before = await runData(theRun)
    const now = await runData(newRun)
    expect(now['providerSession']).not.toBe(before['providerSession'])
    // AND THE ROW A PERSON READS SAYS A RUN WAS STARTED, not that one was picked up.
    const read = (await get(`/api/messages/${after}`)) as {
      message?: { deliveries?: { because: string | null }[] }
    }
    const row = one(read.message?.deliveries ?? [], `a delivery row for ${after}`)
    expect(row.because).toContain('was started')
  }, 40_000)
})
