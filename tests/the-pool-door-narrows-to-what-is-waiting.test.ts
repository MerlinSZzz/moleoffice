// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE POOL DOOR LEAVES THE WORDS OUT UNLESS THEY ARE ASKED FOR, AND NARROWS TO WHAT A READER IS
 * WAITING ON WHEN ASKED.
 *
 * MEASURED FIRST, 11 September 2026, on the live server's log (problem 9UeL9VeVPn33): the lead
 * pop-up read the whole pool — 2.4 MB, every message of the project — on every delivery change,
 * 447 times in two hours, to draw a handful of offers; the start-a-new-agent press read it to find
 * which agents still had a queued message. `GET /api/messages?only=waiting-for-me` answers the
 * messages with a delivery to the reader not marked seen; `?only=queued-for-agents` the messages
 * with a delivery to an agent still queued. Both are the same rows the whole pool carries, fewer of
 * them, and a narrowing the door does not know is refused.
 *
 * A PLAIN CALL ANSWERS EVERY ENTRY WITHOUT ITS `body`. `?full=1` answers the
 * whole entry, `?narrow=1` stays accepted and answers the same as no shape, and a call that asks for
 * both is refused.
 *
 * MUTATION: make the default answer bodies and the no-body case is red; make `full=1` answer narrow
 * and the whole-entry case is red; answer the whole pool whatever `only` says, and the two counts
 * below are red.
 *
 * THE TWO AGENTS HERE CAN BE REACHED, AND THAT IS PART OF THE FIXTURE. Since the responsibility
 * routing landed, a letter to an agent nothing is answering as is also
 * delivered to the first participant up its chain of starters who can be reached, and these two are
 * started by the person, so that is the person. The person's waiting list would then hold a letter between two
 * agents, and the case below says it holds only what was written to the person. Decision murJ5IMWDOXR is
 * what settles that: a letter between agents that reach each other is never the person's, and a routed copy
 * that reaches the person is. So each agent gets a running session record and a live process of this test's
 * own, the shape tests/a-sandbox-run-counts-as-going.test.ts builds, and the letter between them
 * stays between them.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** Every real child this file started, stopped by its own group afterwards. */
const started: ChildProcess[] = []
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** One agent's registry id, which is what a session record names as the agent it serves. */
function theRegistryIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row for ${handle}`)
  return row.id
}

/**
 * A RUNNING SESSION SERVING THIS AGENT, AND A REAL PROCESS OF THIS TEST'S OWN REGISTERED AGAINST IT.
 *
 * That pair is what the office's one reach reading asks for, so this agent reads as one somebody is
 * answering as and a letter to it is not copied up its chain of starters.
 */
async function makeReachable(handle: string): Promise<void> {
  const sessionRecordId = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `A run answering as ${handle}`,
    data: { state: 'running', runtime: 'claude-code', servingAgent: theRegistryIdOf(handle) },
    actor: t.api.HUMAN,
  }).id
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below would be measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({
    workspaceId: 'default',
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    actor: t.api.HUMAN,
  })
}

/** The messages waiting for one agent, through the door the waiter uses. */
async function waitingIdsFor(handle: string): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: PERSON })
  const body = reply.json() as { waiting?: { messageId: string }[] }
  return (body.waiting ?? []).map((one) => one.messageId)
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return reply.json() as Record<string, unknown>
}
async function pool(query: string, headers: Record<string, string>): Promise<{ status: number; ids: string[]; messages: { id: string; [key: string]: unknown }[]; only?: string; error?: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages${query}`, headers })
  const body = reply.json() as { messages?: { id: string; [key: string]: unknown }[]; only?: string; error?: string }
  return { status: reply.statusCode, ids: (body.messages ?? []).map((one) => one.id), messages: body.messages ?? [], only: body.only, error: body.error }
}

let toMe = ''
let seenByMe = ''
let toAnAgent = ''
let toTheOtherAgent = ''
let inAnotherProject = ''
/** The card message each registration writes to its new agent, which a decision introduced. */
let cardToPoolOne = ''
let cardToPoolTwo = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['pool-one', 'pool-two']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  // BOTH AGENTS CAN BE REACHED BEFORE ANY LETTER IS WRITTEN, so nothing between them is routed.
  for (const handle of ['pool-one', 'pool-two']) await makeReachable(handle)
  const oneCards = await waitingIdsFor('pool-one')
  const twoCards = await waitingIdsFor('pool-two')
  expect(oneCards.length, 'the registration wrote pool-one no card message').toBe(1)
  expect(twoCards.length, 'the registration wrote pool-two no card message').toBe(1)
  cardToPoolOne = oneCards[0]!
  cardToPoolTwo = twoCards[0]!
  const id = (filed: Record<string, unknown>) => (filed['record'] as { id: string }).id
  toMe = id(await post('/api/records', { kind: 'message', title: 'to the person, unread', data: { body: 'for the person, not yet read', to: [{ kind: 'person', id: THE_PERSON }] } }, asAgent('pool-one')))
  seenByMe = id(await post('/api/records', { kind: 'message', title: 'to the person, read', data: { body: 'for the person, read', to: [{ kind: 'person', id: THE_PERSON }] } }, asAgent('pool-one')))
  const marked = await post(`/api/messages/${seenByMe}/mark`, { mark: 'seen' }, PERSON)
  expect(marked['error'], JSON.stringify(marked).slice(0, 200)).toBeUndefined()
  toAnAgent = id(await post('/api/records', { kind: 'message', title: 'to an agent', data: { body: 'for pool-one, queued', to: [{ kind: 'agent', id: 'pool-one' }] } }, PERSON))
  toTheOtherAgent = id(await post('/api/records', { kind: 'message', title: 'to the other agent', data: { body: 'for pool-two, queued', to: [{ kind: 'agent', id: 'pool-two' }] } }, asAgent('pool-one')))
  // A MESSAGE IN ANOTHER PROJECT, WAITING FOR THE SAME READER. The narrowing answers about one
  // project, so this one is never in the answer here (acceptance finding 26: the reader's own
  // unseen messages are now asked for by name, and a delivery row does not say which project its
  // message is in).
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'elsewhere', title: 'Another project' } })
  expect(made.statusCode, made.body).toBe(201)
  inAnotherProject = id(await post('/api/records', { kind: 'message', title: 'to the person, elsewhere', data: { body: 'for the person, in another project', to: [{ kind: 'person', id: THE_PERSON }] } }, { ...asAgent('pool-one'), 'x-mole-office-workspace': 'elsewhere' }))
})
afterAll(async () => {
  // BY THE GROUP ID THIS TEST WROTE DOWN, never by a command-line pattern (chapter 2, rule 1).
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file measures.
    }
  }
  await app.close()
  t.close()
})

describe('GET /api/messages with ?only=', () => {
  it('answers every message with no narrowing, and leaves the words out', async () => {
    const whole = await pool('', PERSON)
    expect(whole.status).toBe(200)
    expect(whole.only).toBeUndefined()
    for (const one of whole.messages) {
      expect('body' in one, `row ${String(one['id'])} with no ask carries words`).toBe(false)
      expect(Object.keys(one).sort()).toEqual(['id', 'title', 'wordsMayChangeUntil'].sort())
    }
    // ACROSS PROJECTS, the one written in the other project with them: every message is kept in the message centre and
    // belongs to no project.
    expect(new Set(whole.ids)).toEqual(
      new Set([toMe, seenByMe, toAnAgent, toTheOtherAgent, cardToPoolOne, cardToPoolTwo, inAnotherProject]),
    )
  })

  it('waiting-for-me is the messages with a delivery to the reader not marked seen', async () => {
    const mine = await pool('?only=waiting-for-me', PERSON)
    expect(mine.status).toBe(200)
    expect(mine.only).toBe('waiting-for-me')
    expect(new Set(mine.ids)).toEqual(new Set([toMe, inAnotherProject]))
    const theirs = await pool('?only=waiting-for-me', asAgent('pool-two'))
    // AND THE CARD MESSAGE THE REGISTRATION WROTE IS ONE OF THEM: it is waiting for that agent too.
    expect(new Set(theirs.ids), 'an agent asking reads what waits for it').toEqual(
      new Set([cardToPoolTwo, toTheOtherAgent]),
    )
    // THE ONE WRITTEN IN THE OTHER PROJECT WAITS TOO, wherever the person's request comes from, because a message
    // belongs to no project now. One project's view is asked with ?projects=<id>, and the
    // other project's holds only that one.
    const there = await pool('?only=waiting-for-me&projects=elsewhere', PERSON)
    expect(there.ids, 'the other project\u2019s view does not hold the message written there').toEqual([inAnotherProject])
    const here = await pool('?only=waiting-for-me&projects=default', PERSON)
    expect(here.ids, 'this project\u2019s view holds a message written in another').toEqual([toMe])
  })

  it('queued-for-agents is the messages with a delivery to an agent nothing has taken', async () => {
    const queued = await pool('?only=queued-for-agents', PERSON)
    expect(queued.status).toBe(200)
    expect(new Set(queued.ids)).toEqual(
      new Set([toAnAgent, toTheOtherAgent, cardToPoolOne, cardToPoolTwo]),
    )
  })

  it('refuses a narrowing it does not know', async () => {
    const asked = await pool('?only=everything-but-mine', PERSON)
    expect(asked.status).toBe(400)
    expect(asked.error).toContain('narrowing')
  })

  /**
   * NARROW FIRST, BY A DECISION. The start-a-new-agent press reads who a queue is waiting
   * for, not what anybody said, and it was paying every row's words. `narrow=1` is the second thing
   * the door takes: the same rows with id, title and when their words may still change. Measured
   * before this (GET /api/usage/operations, 16 September 2026): message.pool answered 6.32 GB in
   * 11,310 calls, about 556 KB each, much of it the words.
   */
  describe('GET /api/messages with ?narrow=1', () => {
    it('answers the words off and the small fields on, exactly as `only` narrows the rows', async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/messages?only=queued-for-agents&narrow=1', headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      const read = reply.json() as { messages?: Record<string, unknown>[]; only?: string }
      const ids = (read.messages ?? []).map((one) => one.id)
      expect(read.only).toBe('queued-for-agents')
      expect(new Set(ids)).toEqual(new Set([toAnAgent, toTheOtherAgent, cardToPoolOne, cardToPoolTwo]))
      // THE NARROW DECLARATION IS THE POINT: ids, titles and when words may still change.
      for (const one of read.messages ?? []) {
        expect('body' in one, `row ${String(one['id'])} on a narrow reply carries words`).toBe(false)
        expect(Object.keys(one).sort()).toEqual(['id', 'title', 'wordsMayChangeUntil'].sort())
      }
    })

    it('answers the whole entry, words and all, when full=1 is asked', async () => {
      const whole = await app.inject({ method: 'GET', url: '/api/messages?only=queued-for-agents&full=1', headers: PERSON })
      expect(whole.statusCode, whole.body).toBe(200)
      const read = whole.json() as { messages?: { id: string; body: string }[] }
      const mine = (read.messages ?? []).find((one) => one.id === toAnAgent)
      expect(mine?.body, 'full=1 still carries the words').toBe('for pool-one, queued')
      // AND IT IS EXACTLY WHAT THE DOOR ANSWERED BEFORE THE DEFAULT CHANGED: every entry, words and all.
      expect(read.messages).toHaveLength(4)
    })

    it('refuses narrow=1 with full=1, naming both', async () => {
      const asked = await pool('?narrow=1&full=1', PERSON)
      expect(asked.status).toBe(400)
      expect(asked.error).toContain('narrow=1')
      expect(asked.error).toContain('full=1')
    })

    it('refuses a full value that is not exactly 1', async () => {
      expect((await pool('?full=0', PERSON)).status).toBe(400)
      expect((await pool('?full=2', PERSON)).status).toBe(400)
      expect((await pool('?full=true', PERSON)).status).toBe(400)
    })

    it('refuses a value that is not exactly 1, so two spellings of full cannot both read as bodies', async () => {
      expect((await pool('?narrow=0', PERSON)).status).toBe(400)
      expect((await pool('?narrow=2', PERSON)).status).toBe(400)
      expect((await pool('?narrow=true', PERSON)).status).toBe(400)
    })
  })
})
