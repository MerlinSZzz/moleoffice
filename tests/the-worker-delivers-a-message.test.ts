// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** The three stored provider-conversation examples describe historical finishes and are explicitly inventoried. Their original runtime-ID assertions remain. */
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { historicalSession, supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * THE WORKER DELIVERS A MESSAGE BY STARTING A RUN. Criterion M9 of design/messages/ACCEPTANCE.md.
 *
 * *A message to an agent is queued. A worker the product starts takes the queue … the worker starts
 * or resumes a run of that agent's runtime with the message as the prompt. Every run is registered
 * as a resource under the session it serves before it is used, can be stopped from the product by
 * group, works only inside the project's checkout or a worktree of it, reaches the database only
 * through the API, and has its prompt and its result stored in the conversation. The mark goes from
 * clock to tick when a run has taken the message.*
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server is real and listening; the queue, the marks, the
 * session records, the ledger rows and the reply are all real rows. The agent tool is
 * `tests/fake-runtime.mjs`, which is a real process in a real group that prints a reply and exits.
 * Nothing here spends a model call, and nothing here presents a faked run as a real one.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theMessageWaitsForARunGoing } from '../src/shared/handles.ts'
import { localStamp } from '../src/shared/time.ts'
import {
  onePass,
  refuseAWorkingDirectory,
  whyNotNow,
  workerSettingsFrom,
  worldOfTheApi,
  type WorkerSettings,
} from '../src/worker/index.ts'
import { envFor } from '../src/worker/runtimes/adapter.ts'
import { apiApp, freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRuntimeWordsSaid } from '../src/shared/participants.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
/** Every run this file's worker has going. One list, carried between passes, as the worker does. */
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Register a durable agent and give back its registry id. */
async function anAgent(handle: string, runtime: string | null): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', ...(runtime === null ? {} : { runtime }) },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** Send a message to an agent, and give back the message id. */
/**
 * AND THE PERSON PRESSES TO START AN AGENT FOR IT, because these cases are about something else.
 *
 * Criterion M78: a message that would be answered by starting a NEW agent — one with no
 * conversation of its own here to pick up — waits for the person's press. Every agent in this file
 * is fresh, so the first message to each of them is one of those. The press is what the chat offers
 * the owner; here it is done in the setup so that what is measured below is the rule each case is about
 * and not the press. It is sent as the person because it is refused to an agent.
 */
async function messageTo(agentId: string, body: string, extra: Record<string, unknown> = {}): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }], ...extra },
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

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-worker-runs-'))
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

afterAll(async () => {
  for (const run of [...watching]) {
    try {
      run.adapter.stop(run.handle, 'the test file has finished')
    } catch {
      continue
    }
  }
  const deadline = Date.now() + 2_000
  while (watching.some((run) => run.adapter.alive(run.handle)) && Date.now() < deadline) {
    await new Promise((go) => setTimeout(go, 20))
  }
  await new Promise((go) => setTimeout(go, 50))
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a message to an agent that is not running becomes a run, and the run answers', () => {
  let agentId: string
  let messageId: string
  let runSession: string

  it('shows a clock the moment it is sent, because nothing has taken it yet', async () => {
    agentId = await anAgent('builder-x', 'claude-code')
    messageId = await messageTo(agentId, 'Please look at the gripper calibration and say what you find.')
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('queued')
    expect(stands.run).toBeNull()
  })

  it('is in the queue the worker reads, with everything a run needs', async () => {
    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const waiting = one(queue.queue ?? [], 'the message waiting for a run')
    expect(waiting['messageId']).toBe(messageId)
    expect(waiting['handle']).toBe('builder-x')
    expect(waiting['runtime']).toBe('claude-code')
    expect(waiting['hops']).toBe(0)
    expect(waiting['runningAlready']).toBeNull()
  })

  it('starts a run, files a session record for it, and marks the message taken', async () => {
    const report = await onePass(settings, watching)
    expect(report.held).toEqual([])
    const started = one(report.started, 'the run that was started')
    expect(started.messageId).toBe(messageId)
    runSession = started.session

    // THE CLOCK IS NOW A TICK, and the row says which run took it.
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    expect(stands.run).toBe(runSession)
    expect(stands.because).toContain('run was started')
  })

  it('registered the run in the ledger before it was used, and said the product started it', async () => {
    const listed = (await get('/api/resources')) as { resources?: { sessionRecordId: string; type: string; startedByTheProduct: boolean | null }[] }
    const row = one(
      (listed.resources ?? []).filter((r) => r.sessionRecordId === runSession && r.type === 'process'),
      'the ledger row for the run',
    )
    expect(row.startedByTheProduct).toBe(true)
  })

  it('files what the run said as a message from the agent, naming the run it came out of', async () => {
    const answered = await until(async () => {
      const pool = (await get('/api/messages')) as { messages?: { id: string }[] }
      return (pool.messages ?? []).length > 1
    })
    expect(answered, 'the run never answered').toBe(true)

    const pool = (await get('/api/messages?full=1')) as {
      messages?: { id: string; body: string; sentBy: { kind: string; id: string } | null }[]
    }
    // A LINE MOLE OFFICE WROTE IS NOT THE REPLY. Since criterion H3 the conversation also carries a
    // short line saying a run answered, and that is a message like any other in the pool. This test
    // is about what the AGENT said, so the writer is what picks it out.
    const reply = one(
      (pool.messages ?? []).filter((m) => m.id !== messageId && m.sentBy?.id !== theOfficesOwnId(t)),
      'the reply the run produced',
    )
    const whole = (await get(`/api/records/${reply.id}`)) as { record?: { data?: Record<string, unknown> } }
    const data = whole.record?.data ?? {}
    expect(data['sentBy']).toEqual({ kind: 'agent', id: agentId })
    expect(data['inReplyTo']).toBe(messageId)
    expect(data['fromRun']).toBe(runSession)
    // AND IT IS ADDRESSED BACK TO WHOEVER SENT THE MESSAGE IT ANSWERS.
    expect(data['to']).toEqual([{ kind: 'person', id: THE_PERSON }])
    // AND THE REPLY NAMES A RECORD, so the panel draws a link the reader follows with one press.
    expect(String(data['body'])).toContain(messageId)
  })

  it('marks the run finished and keeps the provider id, so the next message picks it up again', async () => {
    const whole = (await get(`/api/records/${runSession}`)) as { record?: { data?: Record<string, unknown> } }
    const data = whole.record?.data ?? {}
    expect(data['state']).toBe('finished')
    expect(String(data['providerSession'])).toMatch(/^fake-/)
    // THE RUN NAMES ITS AGENT BY HANDLE AND BY REGISTRY ID, which since criterion I1 are two strings.
    expect(data['servingAgent']).toBe('builder-x')
    expect(data['servingAgentId']).toBe(agentId)
    expect(data['deliveringMessage']).toBe(messageId)
    expect(data['startedByMoleOffice']).toBe(true)
  })

  it('records the model the runtime itself says served the run, and "not reported" for what it does not say (HB1)', async () => {
    const whole = (await get(`/api/records/${runSession}`)) as { record?: { data?: Record<string, unknown> } }
    // The fake script names itself, so no real model's name is put on a run nothing served.
    expect(whole.record?.data?.['served']).toEqual({
      model: 'fake-runtime',
      temperature: 'not reported',
      briefBytes: 'not reported',
      contextTokens: { largestTurn: 'not reported', total: 'not reported' },
    })
  })

  it('picks that conversation up again for the next message rather than starting a new one', async () => {
    const second = await messageTo(agentId, 'And the second thing, please.')
    const queue = (await get('/api/worker/queue?full=1')) as { queue?: Record<string, unknown>[] }
    const waiting = one((queue.queue ?? []).filter((w) => w['messageId'] === second), 'the second message')
    const pickUp = waiting['resume'] as { id: string; runtime: string }
    expect(pickUp.id).toMatch(/^fake-/)
    // AND IT SAYS WHICH TOOL MADE THAT ID, so only a run of the same tool ever picks it up.
    expect(pickUp.runtime).toBe('fake')

    const report = await onePass(settings, watching)
    const started = one(report.started, 'the run for the second message')
    const whole = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['providerSession']).toBe(pickUp.id)
    expect((await delivery(second)).because).toContain('picked up')
    await until(async () => (await delivery(second)).mark === 'delivered')
  })
})

describe('a run that prints an answer and exits with an error', () => {
  it('crashes the session and does not file the printed words as an agent reply', async () => {
    const agentId = await anAgent('builder-failed-output', 'claude-code')
    const messageId = await messageTo(agentId, 'please answer then exit nonzero')
    const started = await onePass(settings, watching)
    const run = one(started.started.filter((one) => one.messageId === messageId), 'the run for the failing message')

    let lastData: Record<string, unknown> = {}
    const ended = await until(async () => {
      const whole = (await get(`/api/records/${run.session}`)) as { record?: { data?: Record<string, unknown> } }
      lastData = whole.record?.data ?? {}
      const stands = await delivery(messageId)
      return whole.record?.data?.['state'] !== 'running' || stands.because?.includes('exited with code 23') === true
    })
    expect(ended, `the worker never said the run crashed; the run says ${JSON.stringify(lastData)}`).toBe(true)

    const whole = (await get(`/api/records/${run.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['state']).toBe('crashed')
    expect(String(whole.record?.data?.['doing'])).toContain('exited with code 23')
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    expect(stands.because).toContain('exited with code 23')

    const pool = (await get('/api/messages?full=1')) as {
      messages?: { id: string; sentBy: { kind: string; id: string } | null }[]
    }
    const agentWords = (pool.messages ?? []).filter(
      (one) => one.id !== messageId && one.sentBy?.kind === 'agent' && one.sentBy.id === agentId,
    )
    expect(agentWords, 'the failed output must not be filed as the agent\'s words').toEqual([])
  }, 60_000)

  it('does not call a parsed answer successful when the exit file is absent', async () => {
    const outputPath = join(outputs, 'missing-exit-code.out')
    const exitCodePath = `${outputPath}.exit-code`
    writeFileSync(outputPath, JSON.stringify({ reply: 'printed words', conversation: 'fake-no-exit' }), 'utf8')
    const { FakeAdapter } = await import('../src/worker/runtimes/fake.ts')
    const result = new FakeAdapter(FAKE).readResult({
      runtime: 'fake',
      pid: 1,
      pgid: 1,
      startedAt: '2026-09-29 00:00:00',
      providerSession: null,
      outputPath,
      exitCodePath,
    })
    expect(result.endedHow).toBe('failed')
    expect(result.because).toContain('no recorded exit code')
  })
})

describe('the worker knows where the API is', () => {
  it('reads the address this server answers on, not the sentence the settings declare', () => {
    /**
     * MEASURED ON 4 SEPTEMBER 2026, on the scratch stack the human act was run on. The worker was
     * reading MOLE_OFFICE_API with `settingValue`, which gives back what the declaration says when
     * nobody has set one — the template `http://127.0.0.1:<MOLE_OFFICE_PORT>`. It polled that forty
     * times, wrote "Failed to parse URL" into its log, and the message sat in the queue with its
     * clock while the panel showed nothing wrong. And measured again the same day on the live
     * checkout, whose .env names the canonical API: the derived address was the canonical one, so a
     * scratch server's worker would have delivered to the owner's API. The server now tells the
     * worker where it answers, with `--api`, and that wins over anything the declaration says.
     */
    const wasApi = process.env['MOLE_OFFICE_API']
    process.env['MOLE_OFFICE_API'] = 'http://127.0.0.1:39017'
    try {
      const told = workerSettingsFrom(['--api', 'http://127.0.0.1:29958'])
      expect(told.api).toBe('http://127.0.0.1:29958')
      expect(() => new URL(`${told.api}/api/worker/queue`)).not.toThrow()
      const fallback = workerSettingsFrom([])
      expect(fallback.api).not.toContain('<')
      expect(() => new URL(`${fallback.api}/api/worker/queue`)).not.toThrow()
    } finally {
      if (wasApi === undefined) delete process.env['MOLE_OFFICE_API']
      else process.env['MOLE_OFFICE_API'] = wasApi
    }
  })

  it('takes the session record and the process to watch off its own command line', () => {
    const read = workerSettingsFrom(['--session', 'abcdefghijkl', '--stop-with-pid=4321'])
    expect(read.session).toBe('abcdefghijkl')
    expect(read.stopWithPid).toBe(4321)
    const bare = workerSettingsFrom([])
    expect(bare.session).toBeNull()
    expect(bare.stopWithPid).toBeNull()
  })
})

describe('a run works inside the checkout and nowhere else', () => {
  it('allows the checkout itself and a directory inside it', () => {
    expect(refuseAWorkingDirectory(CHECKOUT, CHECKOUT)).toBeNull()
    expect(refuseAWorkingDirectory(join(CHECKOUT, 'src'), CHECKOUT)).toBeNull()
  })

  it('refuses somewhere else, and names the checkout in the refusal', () => {
    const said = refuseAWorkingDirectory(tmpdir(), CHECKOUT)
    expect(said).toContain('neither this checkout nor a worktree of it')
    expect(said).toContain(CHECKOUT)
  })

  it('refuses a directory that is not there rather than starting a run in nothing', () => {
    expect(refuseAWorkingDirectory(join(tmpdir(), 'no-such-place-at-all'), CHECKOUT)).toContain('not a directory')
  })
})

describe('a run reaches the database only through the API', () => {
  it('is given the API address and never the database file', () => {
    const env = envFor(
      { session: 'a-session-id', agent: 'builder-x', prompt: 'x', cwd: CHECKOUT, api, workspace: 'default', outputPath: '/tmp/x' },
      { MOLE_OFFICE_DB: t.file, PATH: '/usr/bin' },
    )
    expect(env['MOLE_OFFICE_API']).toBe(api)
    expect(env['MOLE_OFFICE_DB']).toBeUndefined()
    expect(JSON.stringify(env)).not.toContain(t.file)
  })
})

describe('the two limits, and the sentence each one writes on the row', () => {
  const waiting = {
    messageId: 'x',
    workspaceId: 'default',
    to: { kind: 'agent', id: 'a' },
    handle: 'builder-y',
    runtime: 'claude-code',
    retired: false,
    body: 'hello',
    sentBy: { kind: 'agent', id: 'b' },
    sentAt: '2026-09-04 10:00',
    resume: null,
    hops: 0,
    needsNoRun: null,
    conversationIsWaiting: null,
    runningAlready: null,
    heldByALiveSession: null,
    heldByAReview: null,
    urgent: false,
    // NOTHING IS ANSWERING IS ITS OWN REASON SINCE M78, and these cases are about the two limits.
    // Null here says the person has already pressed, so what is measured below is the limit and not
    // the press.
    nobodyIsAnsweringAsIt: null,
  }

  it('holds a message when the runs already going are as many as are allowed', () => {
    const said = whyNotNow(waiting, settings, 2)
    expect(said).toMatchObject({because: expect.stringContaining('2 runs are already going')})
    expect(said).toMatchObject({because: expect.stringContaining('as soon as one of them ends')})
  })

  it('starts one when there is room', () => {
    expect(whyNotNow(waiting, settings, 1)).toBeNull()
  })

  it('stops a chain of agents answering each other, and says a person has to speak', () => {
    const said = whyNotNow({ ...waiting, hops: 3 }, settings, 0)
    expect(said).toMatchObject({because: expect.stringContaining('answered each other 3 times')})
    expect(said).toMatchObject({because: expect.stringContaining('until somebody writes in this conversation')})
  })

  it('does not count hops against a person, because a person can say what they like', () => {
    expect(whyNotNow({ ...waiting, hops: 9, sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } }, settings, 0)).toBeNull()
  })

  it('gives one agent one run at a time, and says what happens to the message', () => {
    const said = whyNotNow({ ...waiting, runningAlready: 'a-run' }, settings, 0)
    expect(said).toMatchObject({because: expect.stringContaining('A run Mole Office started is answering')})
    expect(said).toMatchObject({because: expect.stringContaining('This message goes to it when that run ends')})
  })

  it('says what happens to the message for a run the office did not start', () => {
    // A sandbox run's row reaches the worker with the server's one waiting sentence already on it.
    const theRunSays = theMessageWaitsForARunGoing('a-test-sandbox', false)
    const said = whyNotNow(
      { ...waiting, runningAlready: 'a-run', runningAlreadySays: theRunSays },
      settings,
      0,
    )
    expect(said).toEqual({because: theRunSays})
    expect(said).toMatchObject({because: expect.stringContaining('a-test-sandbox')})
    expect(said).toMatchObject({because: expect.stringContaining('can read the message in the conversation')})
    expect(said).not.toMatchObject({because: expect.stringContaining('Start a new agent')})
    expect(said).toMatchObject({because: expect.stringContaining('The message waits here until that run reads it or ends')})
  })

  it('says which tool is missing rather than starting a different one', () => {
    const said = whyNotNow(waiting, { ...settings, env: { PATH: '/nowhere' } }, 0)
    expect(said).toMatchObject({because: expect.stringContaining('is not installed on this machine')})
    expect(said).toMatchObject({because: expect.stringContaining('Nothing else was started in its place')})
  })

  it('says so when nobody set a runtime word, instead of guessing one', () => {
    const said = whyNotNow({ ...waiting, runtime: null }, settings, 0)
    expect(said).toMatchObject({because: expect.stringContaining('Nobody set a runtime word')})
    // READ FROM THE ONE PLACE THE WORDS ARE DECLARED. This assertion used to type the list out
    // again, so a fourth runtime word left the sentence telling a reader to use one of three and
    // this test green.
    expect(said).toMatchObject({because: expect.stringContaining(theRuntimeWordsSaid())})
  })

  it('starts nothing for a retired agent', () => {
    expect(whyNotNow({ ...waiting, retired: true }, settings, 0)).toMatchObject({because: expect.stringContaining('has been retired')})
  })
})

describe('a run that ends before anything can write it down is not thrown away', () => {
  /**
   * MEASURED ON 4 SEPTEMBER 2026, on the scratch stack the human act was run on. The run answered
   * in a few milliseconds; the ledger then refused to register a pid that was no longer running;
   * the worker stopped a process that had already gone, which threw; and the whole pass fell over
   * with a perfectly good reply sitting on disk. Three things were wrong and all three are here.
   */
  it('keeps the answer, and the row says nothing on any list ever held that run', async () => {
    const agentId = await anAgent('builder-quick', 'claude-code')
    const messageId = await messageTo(agentId, 'answer this as fast as you can')
    const report = await onePass(settings, watching)
    const started = report.started.find((one) => one.messageId === messageId)
    const held = report.held.find((one) => one.messageId === messageId)
    // Either it was registered or it had already finished; what must never happen is that the run
    // is lost. Both paths mark the message taken and lead to a reply.
    expect(started ?? held, 'the message was neither started nor held').toBeDefined()
    const answered = await until(async () => {
      const stands = await delivery(messageId)
      return stands.mark === 'delivered'
    })
    expect(answered).toBe(true)
  })

  it('stopping a run that has already gone is not a failure', async () => {
    const { FakeAdapter } = await import('../src/worker/runtimes/fake.ts')
    const adapter = new FakeAdapter(FAKE)
    const handle = adapter.start({
      session: 'a-session-id',
      agent: 'builder-x',
      prompt: 'answer and go',
      cwd: CHECKOUT,
      api,
      workspace: 'default',
      outputPath: join(outputs, 'gone.out'),
    })
    for (let i = 0; i < 100 && adapter.alive(handle); i += 1) await new Promise((go) => setTimeout(go, 25))
    expect(adapter.alive(handle)).toBe(false)
    // It answers rather than throwing: a run that has already finished is what a stop wanted.
    expect(() => {
      adapter.stop(handle, 'this test asked it to stop after it had ended')
    }).not.toThrow()
  })
})

describe('a run whose process has gone does not block the agent for ever', () => {
  it('a session record still marked running is not a run, unless a process of it is alive', async () => {
    const { runServing } = await import('../src/server/lib/worker.ts')
    const agentId = await anAgent('builder-stuck', 'claude-code')
    // A session record shaped exactly like a run the worker filed, with no process behind it. This
    // is what a worker that was restarted leaves behind.
    const filed = await post('/api/records', {
      kind: 'session',
      title: 'a run whose worker was restarted',
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: agentId,
        deliveringMessage: 'abcdefghijkl',
      },
    })
    expect((filed['record'] as { id: string }).id).toBeTruthy()
    expect(runServing(agentId, 'default')).toBeNull()
  })
})

describe('a reply that cannot show the run its words came from is refused', () => {
  it('refuses a caller naming a run that does not exist', async () => {
    const agentId = await anAgent('builder-z', 'claude-code')
    const messageId = await messageTo(agentId, 'anything')
    const reply = await app.inject({
      method: 'POST',
      url: `/api/worker/messages/${messageId}/answered`,
      // AS THE MESSAGE WORKER, this door's one caller. Since a decision an agent
      // that is no party to the message is refused before the run is looked at, so a stranger would
      // meet that refusal and not this one.
      headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' },
      payload: {
        to: { kind: 'agent', id: agentId },
        agent: { kind: 'agent', id: agentId },
        fromRun: 'nosuchrun123',
        body: 'words this agent never said',
        because: 'a test',
      },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('cannot show the run')
  })
})

describe('two messages to one agent in the same pass start one run, not two', () => {
  /**
   * MEASURED ON 4 SEPTEMBER 2026 by the verifier of part 2d, problem `06PmdNHD0JMa`. Two messages
   * two seconds apart to one agent both started a run: two session records made in the same second,
   * both handed the same provider conversation id, both processes alive at once. The cause is that
   * the server works `runningAlready` out when the queue is READ, so the second message is judged
   * against the world as it was before the first run of the same pass existed.
   *
   * The test that already named this rule calls `whyNotNow` with `runningAlready` handed in, so it
   * proves the sentence and not the caller. This one queues both messages before the pass and reads
   * what the pass did.
   */
  it('starts one and holds the other with the one waiting sentence', async () => {
    // THIS TEST'S OWN LIST OF RUNS AND ITS OWN LIMIT. The limit is high so that the concurrency cap
    // can never be the reason one of the two was held: the only rule left to hold it is this one.
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-twice', 'claude-code')
    const first = await messageTo(agentId, 'the first thing, please')
    const second = await messageTo(agentId, 'and the second thing, in the same pass')

    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const both = (queue.queue ?? []).filter((w) => w['messageId'] === first || w['messageId'] === second)
    expect(both.length, 'both messages have to be waiting before the pass').toBe(2)
    // BOTH LOOK FREE TO THE SERVER, which is the state the defect needed and is not itself wrong.
    expect(both.every((w) => w['runningAlready'] === null)).toBe(true)

    const report = await onePass(roomy, mine)
    const ours = (id: string): boolean => id === first || id === second
    const started = report.started.filter((s) => ours(s.messageId))
    const held = report.held.filter((h) => ours(h.messageId))
    expect(started.length, 'exactly one of the two may start a run').toBe(1)
    expect(held.length, 'the other one waits').toBe(1)
    expect(held[0]?.because).toContain('A run Mole Office started is answering')
    expect(held[0]?.because).toContain('This message goes to it when that run ends')

    // AND THE ROW A PERSON READS SAYS IT: a clock on the one that waited, with that sentence.
    const waited = held[0]?.messageId ?? ''
    const stands = await delivery(waited)
    expect(stands.mark).toBe('queued')
    expect(stands.because).toContain('This message goes to it when that run ends')

    // It still gets its run once the first has ended, on a later pass. The passes are run over this
    // test's own list, so the shared one never starts a second run of this agent.
    let delivered = false
    for (let i = 0; i < 100 && !delivered; i += 1) {
      await onePass(roomy, mine)
      delivered = (await delivery(waited)).mark === 'delivered'
      if (!delivered) await new Promise((go) => setTimeout(go, 100))
    }
    expect(delivered, 'the message that waited never got its run').toBe(true)
    for (const run of mine.splice(0, mine.length)) run.adapter.stop(run.handle, 'the test is over')
  }, 40_000)
})

describe('a reply the API refuses is never dropped in silence', () => {
  /**
   * PROBLEM `4DK_cvyAc5Ri`, measured by the verifier of part 2d on 4 September 2026. A run really
   * answered, the API refused the reply, the worker put the refusal in `report.failed`, and the loop
   * that calls `onePass` threw the report away. Nothing was written on the row, nothing in the log
   * and nothing on the page: the person saw a tick and no answer, and the words were only on disk.
   */

  /** Patch a run's session record so that the reply it is about to file is refused. */
  async function makeTheReplyRefused(session: string): Promise<void> {
    // The wrong worker is registered, so finish can seal while reply attribution still fails. The run
    // names its agent by handle and by registry id, and the id is the one read, so both are changed.
    const other =
      (await import('../src/server/lib/participants.ts')).agentByHandle('somebody-else-entirely')?.id ??
      (await anAgent('somebody-else-entirely', 'claude-code'))
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${session}`,
      headers: AS_THE_OWNER,
      payload: { dataPatch: { servingAgent: 'somebody-else-entirely', servingAgentId: other } },
    })
  }

  it('writes the refusal where a person reads it, and files the answer when the retry works', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-refused', 'claude-code')
    const messageId = await messageTo(agentId, 'say something that will be refused the first time')

    const first = await onePass(roomy, mine)
    const started = one(
      first.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )
    const run = one(mine.filter((w) => w.messageId === messageId), 'the run this test is watching')
    await makeTheReplyRefused(started.session)

    // The run has ended by now, so this pass reads its answer and is refused when it files it.
    let refused = false
    for (let i = 0; i < 100 && !refused; i += 1) {
      const pass = await onePass(roomy, mine)
      refused = pass.failed.some((f) => f.messageId === messageId)
      if (!refused) await new Promise((go) => setTimeout(go, 50))
    }
    expect(refused, 'the reply was never refused, so this test proved nothing').toBe(true)

    // THE ROW A PERSON READS SAYS IT, which is the whole point.
    const stands = await delivery(messageId)
    expect(stands.because).toContain('could not be filed')
    expect(stands.because).toContain('was serving somebody-else-entirely')
    expect(stands.because).toContain('tried once more')
    // AND THE ANSWER IS KEPT, rather than thrown away with the pass report.
    expect(mine.some((w) => w.messageId === messageId), 'the run was dropped with its answer').toBe(true)
    expect(String(run.said?.text ?? '')).not.toBe('')

    // THE RETRY FILES IT once whatever refused it has been put right.
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${started.session}`,
      headers: AS_THE_OWNER,
      payload: { dataPatch: { servingAgent: 'builder-refused', servingAgentId: agentId } },
    })
    run.tryAgainAt = 0
    const again = await onePass(roomy, mine)
    const answered = one(
      again.answered.filter((a) => a.messageId === messageId),
      'the answer, filed on the retry',
    )
    expect(answered.reply).not.toBe('')
    const whole = (await get(`/api/records/${answered.reply}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['inReplyTo']).toBe(messageId)
    expect(whole.record?.data?.['fromRun']).toBe(started.session)
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)

  it('gives up after the second refusal and says where the words are', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-refused-twice', 'claude-code')
    const messageId = await messageTo(agentId, 'say something that will be refused twice')

    const first = await onePass(roomy, mine)
    const started = one(
      first.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )
    const run = one(mine.filter((w) => w.messageId === messageId), 'the run this test is watching')
    await makeTheReplyRefused(started.session)

    let refusals = 0
    for (let i = 0; i < 100 && refusals < 2; i += 1) {
      const pass = await onePass(roomy, mine)
      if (pass.failed.some((f) => f.messageId === messageId)) {
        refusals += 1
        run.tryAgainAt = 0
      } else await new Promise((go) => setTimeout(go, 50))
    }
    expect(refusals, 'the reply was not refused twice, so this test proved nothing').toBe(2)

    const stands = await delivery(messageId)
    expect(stands.because).toContain('It was tried twice')
    expect(stands.because).toContain(run.handle.outputPath)
    expect(stands.because).toContain('nothing was written into this conversation')
    // AND THE RUN IS LET GO, so the worker does not try for ever.
    expect(mine.some((w) => w.messageId === messageId)).toBe(false)
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)

  it('answers a message nobody signed, because the reply goes to the owner', async () => {
    /**
     * A MESSAGE WITH NO SENDER IS A ROW WRITTEN BEFORE THE RULE CHANGED. Since 24 September 2026 no
     * door makes a new one: chapter 7 rule 1 refuses a write from an agent id no registry holds, to an agent as
     * to a person, which a decision put in force. So the writer this fixture used to borrow
     * is turned away and nothing is stored. The refusal itself is proved in
     * tests/who-may-write-to-the-person-and-what-the-message-says.test.ts and tests/one-message-pool.test.ts;
     * this case is about the ANSWER to such a row, so it rebuilds one the only honest way left.
     *
     * Until 4 September the reply to one was addressed to nobody, which record validation refuses —
     * "A message with nobody to send it to is not a message" — so the answer was thrown away. The
     * comment in src/server/api/worker.ts already said the owner was the answer; the code returned
     * an empty list. That is what the assertions below still guard.
     */
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-unsigned', 'claude-code')
    // A REBUILT OLD ROW, NOT A NEW ONE: written by the owner, who may write it, and then stripped of
    // its sender, which is the shape the rows written before the refusal have on disk.
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'from nobody the registries know',
      data: { body: 'answer this, please', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(messageId)
    const whole = (await get(`/api/records/${messageId}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['sentBy'], 'this test needs a message with no sender').toBeUndefined()
    // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: builder-unsigned is fresh and
    // has no conversation here to pick up, so nothing starts until the owner presses. This case is about
    // where the ANSWER goes when nobody signed the message, so the press is setup.
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    let answered: { messageId: string; reply: string } | undefined
    for (let i = 0; i < 100 && answered === undefined; i += 1) {
      const pass = await onePass(roomy, mine)
      answered = pass.answered.find((a) => a.messageId === messageId)
      if (answered === undefined) await new Promise((go) => setTimeout(go, 50))
    }
    expect(answered, 'the answer to an unsigned message was thrown away').toBeDefined()
    const reply = (await get(`/api/records/${answered?.reply ?? ''}`)) as { record?: { data?: Record<string, unknown> } }
    expect(reply.record?.data?.['to']).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(reply.record?.data?.['sentBy']).toEqual({ kind: 'agent', id: agentId })
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)
})

/**
 * A CONVERSATION THESE FIXTURES SAY IS STILL OPEN.
 *
 * Criterion M22: a run that has answered holds its conversation open for the next message for
 * `MOLE_OFFICE_RUN_WAITS_MINUTES` minutes, and only a conversation still inside that wait may be
 * picked up. These runs are hand-built rather than started, so they carry the deadline a real run
 * would have been given when its answer was filed. Without it they are conversations that have
 * ended, and what is under test here is which TOOL an id belongs to, not whether it is still open.
 */
function stillOpen(): string {
  return localStamp(new Date(Date.now() + 9 * 60_000))
}

describe('a conversation is picked up only by the tool that made it', () => {
  /**
   * PROBLEM `QLYp6AG-Dnbw`, measured by the verifier of part 2d on 4 September 2026. A `claude-code`
   * run was started with a conversation id the fake runtime had made, and Claude Code refused the
   * argument in its own words: *Provided value "fake-neeq7qm2" is not a UUID and does not match any
   * session title.* The message had already been marked taken, and the run died at its first
   * argument having answered nothing. An agent whose runtime word is changed reaches this, and so
   * does any machine where the fake runtime was on and is then off.
   */
  it('says which tool made an id, and refuses to supply one nobody can attribute', async () => {
    const { conversationToPickUp } = await import('../src/server/lib/worker.ts')
    const agentId = await anAgent('builder-two-tools', 'claude-code')
    const made = historicalSession(t, { workspaceId: 'default', actor: { type: 'human', id: THE_PERSON },
      kind: 'session',
      title: 'a run of a different tool',
      data: {
        state: 'finished',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: agentId,
        deliveringMessage: 'abcdefghijkl',
        providerSession: '5d92360c-d868-40c5-a165-f9de5ad8d83c',
        waitsUntil: stillOpen(),
      },
    })
    // AND WHICH RUN MADE IT, so a resumed run's receipt can take that run's total off its own (wave 13s round 43).
    expect(conversationToPickUp(agentId, 'default')).toEqual({
      id: '5d92360c-d868-40c5-a165-f9de5ad8d83c',
      runtime: 'claude-code',
      run: made.id,
    })

    // A RUN RECORD THAT CANNOT SAY WHICH TOOL MADE ITS ID SUPPLIES NONE, rather than a guess.
    const other = await anAgent('builder-no-tool-word', 'claude-code')
    historicalSession(t, { workspaceId: 'default', actor: { type: 'human', id: THE_PERSON },
      kind: 'session',
      title: 'a run that never wrote down which tool it was',
      data: {
        state: 'finished',
        startedByMoleOffice: true,
        servingAgent: other,
        deliveringMessage: 'abcdefghijkl',
        providerSession: 'nobody-can-say-who-made-this',
        waitsUntil: stillOpen(),
      },
    })
    expect(conversationToPickUp(other, 'default')).toBeNull()
  })

  it('starts a new conversation rather than handing one tool another tool"s id, and says so', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-wrong-id', 'claude-code')
    historicalSession(t, { workspaceId: 'default', actor: { type: 'human', id: THE_PERSON },
      kind: 'session',
      title: 'a claude-code run for this agent',
      data: {
        state: 'finished',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: agentId,
        deliveringMessage: 'abcdefghijkl',
        providerSession: '5d92360c-d868-40c5-a165-f9de5ad8d83c',
        waitsUntil: stillOpen(),
      },
    })
    const messageId = await messageTo(agentId, 'this run is a fake one, and that id is claude-code"s')

    const report = await onePass(roomy, mine)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )
    // NOTHING WAS RESUMED: the run has no provider id of its own until it says one.
    const whole = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['providerSession']).not.toBe('5d92360c-d868-40c5-a165-f9de5ad8d83c')
    // AND THE ROW A PERSON READS SAYS WHY, rather than leaving a started conversation unexplained.
    const stands = await delivery(messageId)
    expect(stands.because).toContain('was started for')
    expect(stands.because).toContain('was made by claude-code')
    expect(stands.because).toContain('starts a new one')
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)
})

describe('who stopped a run and why is not overwritten by the worker a moment later', () => {
  /**
   * PROBLEM `BGEX4JjSouCL`, measured by the verifier of part 2d on 4 September 2026. A person stops
   * a run from the product. The row says *the agent X stopped the run serving this message: <why>*
   * for about two seconds, and then reads *The run ended without answering. The fake run printed
   * nothing where its answer should be.* Both writers write that one field and the later one wins,
   * so a person who stopped a run is told the tool printed nothing, which reads as a fault in the
   * tool. It is the one case where the row already knew the true reason and gave it up.
   */
  it('keeps the sentence the person who stopped it wrote', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-stopped', 'claude-code')
    // "please hang" makes the fake runtime wait for ever, so there is a run in flight to stop.
    const messageId = await messageTo(agentId, 'please hang until somebody stops you')

    const report = await onePass(roomy, mine)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )
    const listed = (await get('/api/resources')) as { resources?: { id: string; sessionRecordId: string; type: string }[] }
    const row = one(
      (listed.resources ?? []).filter((r) => r.sessionRecordId === started.session && r.type === 'process'),
      'the ledger row for the run',
    )

    const stopped = (await post('/api/runtime/stop', {
      resourceId: row.id,
      why: 'this test is checking that the reason a person gives survives the worker',
    })) as { stopped?: boolean; message?: { because?: string } | null }
    expect(stopped.stopped).toBe(true)
    expect(String(stopped.message?.because ?? '')).toContain('stopped the run serving this message')

    // THE WORKER'S NEXT PASS FINDS A RUN THAT ENDED HAVING PRINTED NOTHING, which is true and is
    // the weaker of the two sentences. The row keeps the one a person asked for.
    let sawItEnd = false
    for (let i = 0; i < 100 && !sawItEnd; i += 1) {
      const pass = await onePass(roomy, mine)
      sawItEnd = pass.failed.some((f) => f.messageId === messageId)
      if (!sawItEnd) await new Promise((go) => setTimeout(go, 50))
    }
    expect(sawItEnd, 'the worker never noticed the run had ended').toBe(true)

    const stands = await delivery(messageId)
    expect(stands.because).toContain('stopped the run serving this message')
    expect(stands.because).toContain('the reason a person gives survives the worker')
    expect(stands.because).not.toContain('ended without answering')
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)
})

describe('a run"s ledger row carries a world and is released when the run ends', () => {
  /**
   * PROBLEM `2s-QFF4Tm-VY`, measured by the verifier of part 2d on 4 September 2026. Every run the
   * worker started left a ledger row that was never released: nine rows for runs that had all ended
   * were still open on one stack after half an hour. The orphan sweep is how this project finds
   * processes nobody claims, and a row for every run that ever ran makes that list useless. Each row
   * also carried no world, so nothing could tell a run of this installation from a scratch stack's.
   *
   * Problem ssE_OrIgHoye: the run's end now closes a gone process row before the worker releases it.
   * If the process outlives that write, the worker's release closes it instead. Either note must say
   * the run ended.
   * Mutation: remove the run-end close from patchRecord together with the worker's ledger release
   * in done(). With both closers gone, this case must fail because the row stays open.
   */
  it('registers the run with the world the API reports, and closes the row when the run ends', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-tidy', 'claude-code')
    const messageId = await messageTo(agentId, 'answer and end, please')

    const report = await onePass(roomy, mine)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )

    // THE WORLD CAME OFF THE API'S OWN REPLIES. The worker holds no database path, so this is the
    // only way it can know, and it is what GET /api/runtime says about the server it talks to.
    expect(worldOfTheApi(), 'no reply carried a world header').not.toBeNull()
    expect(String(worldOfTheApi())).toContain('standing=')

    let released: { releasedAt: string | null; releaseNote: string | null; world: unknown } | undefined
    for (let i = 0; i < 100 && released?.releasedAt == null; i += 1) {
      await onePass(roomy, mine)
      const listed = (await get('/api/resources?includeReleased=true')) as {
        resources?: { sessionRecordId: string; type: string; releasedAt: string | null; releaseNote: string | null; world: unknown }[]
      }
      released = (listed.resources ?? []).find((r) => r.sessionRecordId === started.session && r.type === 'process')
      if (released?.releasedAt == null) await new Promise((go) => setTimeout(go, 50))
    }
    expect(released, 'the run was never registered at all').toBeDefined()
    expect(released?.releasedAt, 'the ledger row for a finished run was left open').not.toBeNull()
    expect(String(released?.releaseNote ?? '')).toMatch(/ended as finished|the run ended on its own/)
    // AND THE ROW SAYS WHICH WORLD IT SERVED, so a scratch stack's run is not read as this one's.
    expect(released?.world, 'the row carries no world').not.toBeNull()
    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)
})

describe('two workers on one checkout do not write into one log file', () => {
  /**
   * PROBLEM `8aHsfRuQ5B8G`, found on 4 September 2026. The path was built from the checkout alone,
   * so every server started from this checkout appended to `.logs/the-message-worker.log`. The lines
   * of two workers were interleaved with nothing saying which wrote which, and a verifier reading it
   * could not find its own worker's lines. Diagnosing a worker means reading its log.
   */
  it('names the file after the port, so two stacks on one checkout keep their lines apart', async () => {
    const { theWorkerLogPath } = await import('../src/server/lib/worker.ts')
    const canonical = theWorkerLogPath(CHECKOUT, 39017, 'aaaaaaaaaaaa')
    const scratch = theWorkerLogPath(CHECKOUT, 29940, 'bbbbbbbbbbbb')
    expect(canonical).toContain('39017')
    expect(scratch).toContain('29940')
    expect(canonical).not.toBe(scratch)
    expect(canonical.startsWith(`${CHECKOUT}/.logs/`)).toBe(true)
  })

  it('names it after the worker"s session record when no port has been bound', async () => {
    const { theWorkerLogPath } = await import('../src/server/lib/worker.ts')
    const one = theWorkerLogPath(CHECKOUT, null, 'aaaaaaaaaaaa')
    const other = theWorkerLogPath(CHECKOUT, null, 'bbbbbbbbbbbb')
    expect(one).toContain('aaaaaaaaaaaa')
    expect(one).not.toBe(other)
  })
})

describe('a worker that is restarted picks the runs back up', () => {
  /**
   * PROBLEM `wrtc5jmjIVpM`, the builder's own, reproduced by the verifier of part 2d on 4 September
   * 2026. The worker keeps the runs it is watching in a list in memory. When it stops, that list
   * goes: the processes carry on, their session records stay marked running, and nothing reads their
   * output. The run really answers, the answer sits in its output file, and no reply is ever filed —
   * the person who wrote to the agent sees a tick and nothing else. The API server restarts on every
   * merge under `tsx watch`, so this is not a rare state.
   *
   * A NEW LIST OF RUNS IS EXACTLY WHAT A RESTARTED WORKER HAS, so that is how this is reproduced.
   */
  it('files the answer of a run whose worker had forgotten it', async () => {
    const mine: Parameters<typeof onePass>[1] = []
    const roomy = { ...settings, runs: 8 }
    const agentId = await anAgent('builder-forgotten', 'claude-code')
    const messageId = await messageTo(agentId, 'answer this while nobody is watching')

    const report = await onePass(roomy, mine)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run for this message',
    )
    // THE WORKER STOPS. Its list of runs goes with it, and the run carries on.
    mine.length = 0

    // A NEW WORKER, with an empty list, over the same records.
    const fresh: Parameters<typeof onePass>[1] = []
    let pickedUp = false
    let answered = false
    for (let i = 0; i < 200 && !answered; i += 1) {
      const pass = await onePass(roomy, fresh)
      if (pass.pickedUp.includes(started.session)) pickedUp = true
      answered = pass.answered.some((a) => a.messageId === messageId)
      if (!answered) await new Promise((go) => setTimeout(go, 50))
    }
    expect(pickedUp, 'the new worker never took the run over').toBe(true)
    expect(answered, 'the answer of a forgotten run was never filed').toBe(true)

    const whole = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(whole.record?.data?.['state']).toBe('finished')
    const stands = await delivery(messageId)
    expect(stands.because).toContain('answered')
    for (const left of fresh.splice(0, fresh.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)

  it('lists a run that is going with everything a worker needs to take it over', async () => {
    const { runsToPickUp } = await import('../src/server/lib/worker.ts')
    const mine: Parameters<typeof onePass>[1] = []
    // THE RUN THIS CASE STARTS IS TOLD TO HANG, SO IT IS STOPPED IN A finally. Problem yJcOgCt6QecS:
    // the stop used to be the last line, so a failed expect left the fake runtime running after the
    // test had ended. Six such processes were found on 25 September 2026.
    try {
      const roomy = { ...settings, runs: 8 }
      const agentId = await anAgent('builder-in-flight', 'claude-code')
      const messageId = await messageTo(agentId, 'please hang while somebody reads the list of runs')
      const report = await onePass(roomy, mine)
      const started = one(
        report.started.filter((s) => s.messageId === messageId),
        'the run for this message',
      )

      const going = runsToPickUp('default').find((r) => r.session === started.session)
      expect(going, 'a run that is going is not in the list').toBeDefined()
      expect(going?.messageId).toBe(messageId)
      expect(going?.agentId).toBe(agentId)
      expect(going?.handle).toBe('builder-in-flight')
      expect(going?.runtime).toBe('fake')
      expect(going?.pid).toBeGreaterThan(0)
      // AND WHAT THE ROW SAYS NOW, so the worker that takes it over writes over those words and no
      // others — the sentence a person who stopped the run wrote is kept.
      expect(going?.says).toContain('was started for builder-in-flight')
    } finally {
      for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
    }
  }, 40_000)
})

/**
 * A RUN WORKING AWAY FROM HOME HOLDS A VISIT WHILE IT RUNS, AND THE VISIT ENDS WITH IT.
 *
 * Criterion C6. The worker registers one and, until 4 September 2026, never ended one: visit
 * `ImA3BZkS-2dp` was registered at 17:34:37, the run was stopped, `GET /api/worker/runs` said no run
 * was going, and the trip was still open. *Away from home* is where a person reads who is working
 * where, so it fills up with people who are not; and a stale visit weakens C4 while it is open — the
 * citizens verifier's own probe of the refusal was let through by a trip a browser had left open
 * seven minutes earlier. Problem `NYeGrR8IfY-7`.
 *
 * THE ORDINARY SHAPE, NOT A CONTRIVANCE. An agent registered somewhere else and messaged here is
 * exactly what a corpus copied from another world produces, which is how the verifier met it.
 */
describe('the visit a run is on ends when the run does', () => {
  it('holds it while the run is going and ends it when the run ends', async () => {
    const agentId = await anAgent('builder-away', 'claude-code')
    // A CITIZEN OF ANOTHER WORLD. The registry row is written by this world, so its home is this
    // world; a copied corpus carries rows whose home is wherever they were registered.
    t.client.sqlite.prepare("UPDATE agents SET home_world = ? WHERE id = ?").run('ffffffffffffffff', agentId)

    const messageId = await messageTo(agentId, 'do something here for a moment')
    const started = await until(async () => {
      const going = (await get('/api/worker/runs')) as { runs?: { session: string }[] }
      return (going.runs ?? []).length > 0 || (await delivery(messageId)).run !== null
    })
    expect(started, 'no run was ever started for the message').toBe(true)

    const open = (await get('/api/office/visits')) as { visits?: { id: string; visitor?: { id: string } }[] }
    const mine = (open.visits ?? []).filter((one) => one.visitor?.id === agentId)
    expect(mine, 'the worker registered no visit for a run working away from home').toHaveLength(1)

    const ended = await until(async () => {
      const now = (await get('/api/office/visits')) as { visits?: { visitor?: { id: string } }[] }
      return (now.visits ?? []).filter((one) => one.visitor?.id === agentId).length === 0
    })
    expect(ended, 'the run ended and the visit it was on is still open').toBe(true)

    // AND THE ROW IS ENDED, NOT GONE. Nothing is deleted; a trip that happened stays readable.
    const all = (await get('/api/office/visits')) as { all?: { visitor?: { id: string }; until: string | null }[] }
    const theirs = (all.all ?? []).filter((one) => one.visitor?.id === agentId)
    expect(theirs).toHaveLength(1)
    expect(theirs[0]?.until).not.toBeNull()
  }, 60_000)
})

/**
 * A RUN THE WORKER STARTS SAYS WHICH RUN STARTED IT.
 *
 * Criterion P11, problem `pcEzep3-FHck`. The other half of P11 was built first: an agent's first run
 * names the run that registered it. A run the worker starts is registered by nobody, so nothing
 * wrote a parent for it — measured before this cluster, 0 of 904 runs in the owner's project carried
 * one — and an inspector following a chain of runs upward stopped there with nothing saying why.
 *
 * THE PARENT IS THIS WORKER'S OWN RUN, and it is observed rather than worked out: the worker process
 * is what starts the tool, and the API server hands it the id of its own session record as
 * `--session`. The run of whoever wrote the message is deliberately NOT written: that run caused a
 * message to exist, which is a different fact, and the delivery row already holds it.
 */
describe('a run the worker starts names the run that started it', () => {
  /** This worker's own run, filed the way src/server/index.ts files it before starting a worker. */
  let workerRun: string
  let withARunOfItsOwn: WorkerSettings
  /** Its own list, so this block's run is not mixed into the one the passes above are carrying. */
  const mine: Parameters<typeof onePass>[1] = []

  it('writes the worker run on the session record of the run it starts', async () => {
    // FILED BY THE API SERVER, as src/server/index.ts files the worker's own session. The message worker may name a
    // session the office's own writers filed as a parent (problem NlOyicZP_Jjt); the person filed it here before.
    const filed = await post('/api/records', {
      kind: 'session',
      title: 'The message worker',
      data: {
        state: 'running',
        runtime: 'mole-office',
        doing: 'taking the message queue and starting a run of an agent tool for each message to an agent',
        startedByMoleOffice: true,
      },
    }, { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-api-server' })
    workerRun = (filed['record'] as { id: string }).id
    withARunOfItsOwn = { ...settings, session: workerRun }

    const agentId = await anAgent('builder-under-the-worker', 'claude-code')
    const messageId = await messageTo(agentId, 'say who started you')
    const report = await onePass(withARunOfItsOwn, mine)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run started for this message',
    )

    const read = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(read.record?.data?.['parentAttachment']).toBe(workerRun)
    // AND IT IS STILL THE RUN IT WAS. The parent is written beside what the run already said about
    // itself, not instead of it.
    expect(read.record?.data?.['servingAgent']).toBe('builder-under-the-worker')
    expect(read.record?.data?.['servingAgentId']).toBe(agentId)
    expect(read.record?.data?.['deliveringMessage']).toBe(messageId)

    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)

  it('writes nothing when the worker has no run of its own, rather than inventing a parent', async () => {
    // A worker somebody started by hand has no `--session`, so nothing observed which run started
    // the runs it starts. Absence says nobody recorded one. `settings` in this file is that worker:
    // every run above was started by it, and none of them carries a parent.
    expect(settings.session).toBeNull()
    const agentId = await anAgent('builder-with-no-parent', 'claude-code')
    const messageId = await messageTo(agentId, 'nobody wrote down who started this one')
    const report = await onePass(settings, watching)
    const started = one(
      report.started.filter((s) => s.messageId === messageId),
      'the run started for this message',
    )
    const read = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(read.record?.data?.['parentAttachment']).toBeUndefined()
  }, 40_000)
})

/**
 * THE SESSION A RUN WRITES NAMES THE AGENT BY HANDLE AND BY REGISTRY ID.
 *
 * Criterion I7: every session record's `data.servingAgent` gets the id written beside the handle.
 * The wave agreed the field name `servingAgentId` for the id, and `servingAgent` stays the handle.
 * An agent whose id is not its handle is what makes the two fields tell apart; before piece I-1b
 * mints ids, a test can only make one by writing the registry row directly.
 */
describe('the session a run writes carries the agent id beside the handle', () => {
  /** Its own list, so this run is not mixed into the passes above. */
  const mine: Parameters<typeof onePass>[1] = []

  it('writes servingAgent as the handle and servingAgentId as the registry id', async () => {
    const handleAtRegistration = 'builder-with-a-minted-id'
    const registryId = await anAgent(handleAtRegistration, 'claude-code')
    // The registry id is fixed at registration and the handle is not: renaming the handle leaves the
    // id alone, which is the shape piece I-1b will mint and the shape these two fields must tell
    // apart. (The front door sets id to the handle today, so an id that differs from its handle can
    // only be made by changing the handle after the row exists.)
    const handle = 'builder-renamed-after-registration'
    t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(handle, registryId)

    const messageId = await messageTo(registryId, 'say which id you serve')
    const report = await onePass(settings, mine)
    const started = one(report.started.filter((s) => s.messageId === messageId), 'the run for the renamed agent')

    const read = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(read.record?.data?.['servingAgent']).toBe(handle)
    expect(read.record?.data?.['servingAgentId']).toBe(registryId)

    for (const left of mine.splice(0, mine.length)) left.adapter.stop(left.handle, 'the test is over')
  }, 40_000)
})
