// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** The checked-run identity fixture was an unsealed finish; it is explicitly historical. New runtime completions remain real sealed record submissions. */
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A RUN'S ANSWER TO A GROUP MESSAGE GOES TO THE GROUP, NOT PRIVATELY TO WHOEVER ASKED.
 *
 * Problem `xjL8PoDabiW8`, measured by another builder on 4 September 2026. The answered door worked
 * out who a reply was for as `[answered.sentBy]`, which is one participant, and never looked at
 * `toGroup`. So the owner wrote one question into a group of two agents, each run answered, and both
 * answers were filed as private messages to the owner. The group's own conversation held the question and
 * none of the answers, which turns one group conversation into several private ones nobody can see.
 *
 * Criterion M11 of design/messages/ACCEPTANCE.md: a message to a group goes to every subscriber.
 *
 * AND THE CONVERSATION GUARD STILL BOUNDS THE GROUP. Addressing an answer to the group is exactly
 * the change that gives every agent in it something new to answer, so the last two tests here
 * measure that the exchange still ends on its own — problem `jN0TdeawNlZZ`, which is the runaway the
 * guard was built for.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server is real and listening; the group, the messages, the
 * delivery rows and the system lines are all real rows. The agent tool is `tests/fake-runtime.mjs`,
 * a real process that prints a reply and exits. Nothing here spends a model call.
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
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
/** Every run this file's worker has going. One list, carried between passes, as the worker does. */
const watching: Parameters<typeof onePass>[1] = []
/** What `MOLE_OFFICE_AGENT_HOPS` said before this file set it, so it is put back. */
let hopsBefore: string | undefined
/**
 * The one function that decides where an answer goes, imported after the database is named.
 *
 * lib/worker.ts reaches src/server/db/client.ts, and an import at the top of a test file runs before
 * `freshDb()` can say which database to open. `tests/no-test-opens-the-live-corpus.test.ts` refuses
 * that, rightly: it would open the operator's real file with permission to write to it.
 */
let whereAnAnswerGoes: typeof import('../src/server/lib/worker.ts').whereAnAnswerGoes

/** The limit this file is written against, set in the environment below so the server reads the same. */
const ALLOWED = 3

const AS_THE_OWNER: Record<string, string> = {
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
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** One message as every screen reads it. */
interface Message {
  id: string
  body: string
  sentBy: { kind: string; id: string } | null
  to: { kind: string; id: string }[]
  toGroup: string | null
  deliveries: { to: { kind: string; id: string }; mark: string; because: string | null }[]
}

async function message(id: string): Promise<Message> {
  const read = (await get(`/api/messages/${id}`)) as { message?: Message }
  if (read.message === undefined) throw new Error(`no message ${id}`)
  return read.message
}

/** Everything said in one group, oldest first. */
async function said(groupId: string): Promise<{ id: string; body: string; sentBy: { id: string } | null }[]> {
  const read = (await get(`/api/groups/${groupId}`)) as {
    messages?: { id: string; body: string; sentBy: { id: string } | null }[]
  }
  return read.messages ?? []
}

/** Write one message into a group, as whoever the headers say. */
async function intoTheGroup(groupId: string, body: string, headers = AS_THE_OWNER): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'message', title: body.slice(0, 60), data: { body, toGroup: groupId } },
    headers,
  )
  const record = filed['record'] as { id?: string } | undefined
  if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 300)}`)
  // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: every agent in this file is
  // fresh, so a message to one waits for the owner’s press. What is measured here is where an ANSWER goes.
  await post(`/api/messages/${record.id}/start-an-agent`, {})
  return record.id
}

/** Write one message to one agent by name, as the owner. */
async function toOneAgent(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  const record = filed['record'] as { id?: string } | undefined
  if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 300)}`)
  // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: every agent in this file is
  // fresh, so a message to one waits for the owner’s press. What is measured here is where an ANSWER goes.
  await post(`/api/messages/${record.id}/start-an-agent`, {})
  return record.id
}

/**
 * Run passes until no run is going any more, so a later pass judges a still world.
 *
 * It is the whole exchange run to its end: a pass files the answers of the runs that finished and
 * then starts runs for whatever those answers reached, so this returns only on a pass that ended
 * everything and started nothing.
 */
async function untilEveryRunHasEnded(within = 30_000): Promise<void> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0) return
    if (Date.now() >= deadline) throw new Error('a run never ended')
    await new Promise((go) => setTimeout(go, 50))
  }
}

beforeAll(async () => {
  hopsBefore = process.env['MOLE_OFFICE_AGENT_HOPS']
  process.env['MOLE_OFFICE_AGENT_HOPS'] = String(ALLOWED)
  t = await freshDb()
  whereAnAnswerGoes = (await import('../src/server/lib/worker.ts')).whereAnAnswerGoes
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-group-answer-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: ALLOWED,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  if (hopsBefore === undefined) delete process.env['MOLE_OFFICE_AGENT_HOPS']
  else process.env['MOLE_OFFICE_AGENT_HOPS'] = hopsBefore
})

describe('where an answer goes is decided in one place', () => {
  it("goes to the starter of the run it is about when the office wrote the message, not to the person", async () => {
    // CRITERION M93, measured on 8 September 2026: 131 messages reached the owner from the inspector
    // in one day, because a check the office asks for is a message with nobody recorded as its
    // sender, and an answer to such a message fell through to the person. The office's request names
    // the run it is about; its answer goes to whoever started that run's agent.
    const asArgus = {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
    }
    // THE CHAIN STARTS WITH THE OWNER: the person registers the secretary, and the secretary registers the agent it starts.
    const argusRegistered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...asArgus, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name },
    })
    expect(argusRegistered.statusCode, argusRegistered.body).toBe(201)
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asArgus,
      payload: { handle: 'checked-one', name: 'Checked One' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...asArgus, 'x-mole-office-actor-id': 'checked-one' },
      payload: { kind: 'session', title: 'A run the office asked a check of', data: { state: 'running', servingAgent: 'checked-one' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const run = (filed.json() as { record: { id: string } }).record.id
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)

    const fromTheOffice = whereAnAnswerGoes({ toGroup: null, sentBy: null, aboutRun: run })
    // THE STARTER IS STORED AS THE SECRETARY'S REGISTRY ID, which since criterion I1 is not its handle.
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const secretary = one((listed.agents ?? []).filter((a) => a.handle === THE_TEST_OFFICES_SECRETARY.handle), `the registry row for ${THE_TEST_OFFICES_SECRETARY.handle}`).id
    expect(fromTheOffice).toEqual({ to: [{ kind: 'agent', id: secretary }], toGroup: null })
    // A PERSON WHO WROTE STILL GETS THE ANSWER, run or no run.
    const fromTheOwner = whereAnAnswerGoes({ toGroup: null, sentBy: { kind: 'person', id: THE_PERSON }, aboutRun: run })
    expect(fromTheOwner).toEqual({ to: [{ kind: 'person', id: THE_PERSON }], toGroup: null })
    // AND A MESSAGE ABOUT NO RUN, FROM NOBODY, STILL GOES TO THE OWNER, as before.
    const aboutNothing = whereAnAnswerGoes({ toGroup: null, sentBy: null })
    expect(aboutNothing).toEqual({ to: [{ kind: 'person', id: THE_PERSON }], toGroup: null })
  })

  it('sends an answer to a group message to that group and names nobody', () => {
    const where = whereAnAnswerGoes({ toGroup: 'aB3dEf7hIjKl', sentBy: { kind: 'person', id: THE_PERSON } })
    expect(where.toGroup, 'an answer to a group message goes to the group').toBe('aB3dEf7hIjKl')
    expect(where.to, 'a group message names a group or people, never both').toEqual([])
  })

  it('sends an answer to a message between two participants back to whoever sent it', () => {
    const where = whereAnAnswerGoes({ toGroup: null, sentBy: { kind: 'agent', id: 'someAgentId1' } })
    expect(where.toGroup).toBeNull()
    expect(where.to).toEqual([{ kind: 'agent', id: 'someAgentId1' }])
  })

  it('sends an answer to a message that names nobody to the owner', () => {
    const where = whereAnAnswerGoes({ toGroup: null, sentBy: null })
    expect(where.toGroup).toBeNull()
    expect(where.to).toEqual([{ kind: 'person', id: THE_PERSON }])
  })
})

describe('two agents answer a question in the group it was asked in', () => {
  let groupId: string
  let alpha: string
  let beta: string
  let asked: string

  it('starts one run for each agent when the owner writes into the group', async () => {
    alpha = await anAgent('answer-alpha')
    beta = await anAgent('answer-beta')
    const opened = await post('/api/groups', {
      name: 'The gripper module',
      because: 'a question for both of them',
      members: [
        { who: { kind: 'agent', id: alpha }, because: 'one of the two' },
        { who: { kind: 'agent', id: beta }, because: 'the other' },
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner watches' },
      ],
    })
    const group = opened['group'] as { id?: string } | undefined
    if (group?.id === undefined) throw new Error(`the group was refused: ${JSON.stringify(opened).slice(0, 400)}`)
    groupId = group.id
    // The lines the opening wrote start no run, and this clears them out of the queue.
    await onePass(settings, watching)

    asked = await intoTheGroup(groupId, 'What do the two of you make of this?')
    const report = await onePass(settings, watching)
    // THE PASS REPORT NAMES EACH STARTED RUN BY ITS AGENT'S HANDLE, which since criterion I1 is not its id.
    expect(report.started.map((r) => r.agent).sort(), 'a person writing to a group reaches every agent in it').toEqual(
      ['answer-alpha', 'answer-beta'].sort(),
    )
    await untilEveryRunHasEnded()
  })

  it('holds every answer in the group, so the question and the answers are one conversation', async () => {
    const lines = await said(groupId)
    const replies = lines.filter((line) => line.sentBy !== null && [alpha, beta].includes(line.sentBy.id))
    expect(
      [...new Set(replies.map((r) => r.sentBy?.id))].sort(),
      'the group must hold an answer from each agent, and until 4 September 2026 it held neither',
    ).toEqual([alpha, beta].sort())
  })

  it('gives each answer one delivery row per member, the agent that answered excepted', async () => {
    const lines = await said(groupId)
    // THE FIRST OF ALPHA'S ANSWERS. Alpha answers the owner's question and then beta's answer to it,
    // which is the whole of what the conversation guard allows; every one of them is addressed the
    // same way, and this reads the first.
    const fromAlpha = lines.filter((line) => line.sentBy?.id === alpha)
    const first = fromAlpha[0]
    if (first === undefined) throw new Error('alpha wrote no answer into the group')
    const reply = await message(first.id)
    expect(reply.toGroup, 'an answer to a group message is addressed to the group').toBe(groupId)
    expect(
      reply.deliveries.map((row) => row.to.id).sort(),
      'every member reads it except whoever wrote it',
    ).toEqual([beta, THE_PERSON].sort())
    expect(reply.deliveries.some((row) => row.to.id === alpha), 'a mark is about somebody else reading').toBe(false)
  })

  it('files no private message to the owner instead', async () => {
    // THE WHOLE POOL, WHICH WRITES NOTHING. A person reading a conversation moves every row in it queued
    // for them to delivered, and a test that changed the marks it is about to read would be measuring itself.
    const read = (await get('/api/messages?full=1')) as { messages?: Message[] }
    const privately = (read.messages ?? []).filter(
      (m) => m.sentBy !== null && [alpha, beta].includes(m.sentBy.id) && m.toGroup === null,
    )
    expect(
      privately.map((m) => m.body),
      'the whole defect was that this answer arrived here, addressed to the one member who asked',
    ).toEqual([])
  })

  it('says on the question the run answered', async () => {
    const question = await message(asked)
    for (const who of [alpha, beta]) {
      const row = one(question.deliveries.filter((d) => d.to.id === who), `the delivery row for ${who}`)
      expect(row.mark).toBe('delivered')
      expect(row.because).toContain('answered')
    }
  })
})

describe('the exchange the group answers start still ends on its own', () => {
  it('runs to a stop and stays stopped, with nobody writing anything', async () => {
    // MEASURED, NOT ASSUMED. The passes above ran the whole exchange to its end. Every pass from
    // here starts nothing, which is the guard of problem `jN0TdeawNlZZ` holding after the change.
    let started = 0
    for (let i = 0; i < 5; i += 1) started += (await onePass(settings, watching)).started.length
    expect(started, 'nothing may start once the agents have said as much as they may without a person').toBe(0)
  })

  it('leaves a group whose whole contents can be counted', async () => {
    const groups = (await get('/api/groups')) as { groups?: { id: string; name: string }[] }
    const gripper = one(
      (groups.groups ?? []).filter((g) => g.name === 'The gripper module'),
      'the group the question was asked in',
    )
    const lines = await said(gripper.id)
    const fromAgents = lines.filter(
      (line) => line.sentBy !== null && line.sentBy.id !== THE_PERSON && line.sentBy.id !== moleOffice().id,
    )
    // FOUR AGENT MESSAGES AND NO MORE, with `MOLE_OFFICE_AGENT_HOPS` at 3. The owner's question
    // reaches both agents, so two answers are written; each of those reaches the other agent, and at
    // that point two agents have spoken twice, which is four — one over the three this installation
    // allows, so the next pass starts nothing. Before the guard this number did not stop rising.
    expect(fromAgents.length, 'the agents answering each other in a group must not run away').toBe(4)
  })

  it('tells the group once that its agents are waiting for a person', async () => {
    const groups = (await get('/api/groups')) as { groups?: { id: string; name: string }[] }
    const gripper = one(
      (groups.groups ?? []).filter((g) => g.name === 'The gripper module'),
      'the group the question was asked in',
    )
    const lines = await said(gripper.id)
    const waiting = lines.filter((line) => line.body === SYSTEM_LINES.agentsAreWaitingForAPerson.line)
    expect(waiting.length, 'the group is told exactly once that its agents are waiting').toBe(1)
    expect(one(waiting, 'the line saying the agents are waiting').sentBy).toEqual(moleOffice())
  })
})

describe('an answer to a message between two participants still goes back to whoever sent it', () => {
  it('addresses the reply to the sender and to no group', async () => {
    const gamma = await anAgent('answer-gamma')
    const asked = await toOneAgent(gamma, 'A question for you alone.')
    await onePass(settings, watching)
    await untilEveryRunHasEnded()

    const read = (await get('/api/messages?full=1')) as { messages?: Message[] }
    const reply = one(
      (read.messages ?? []).filter((m) => m.sentBy?.id === gamma),
      "gamma's answer to the owner",
    )
    expect(reply.toGroup, 'a message between two participants belongs to no group').toBeNull()
    expect(reply.to.map((who) => who.id), 'the reply goes back to whoever asked').toEqual([THE_PERSON])
    expect(asked).not.toBe(reply.id)
  })
})
