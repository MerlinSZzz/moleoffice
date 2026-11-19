// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FRAME EVERY PAGE SHARES READS EACH THING ONCE, AND ANSWERS WHAT IT ANSWERED BEFORE. Wave 13x round 13.
 *
 * Every sidebar page asks the same frame of reads. Measured on a made-up office of 1,025 agents and 3,206 messages, four
 * of them ran a statement for every agent, sender or row: `GET /api/participants` read each agent's runtime alone,
 * `GET /api/messages/forced` built the whole message pool to keep the urgent ones, and `GET /api/waiting` counted each
 * row's `blocks` links alone. Each now reads them together. This file holds each of the four to two things:
 *
 *   1. THE SAME ANSWER. Every agent's runtime read together (`everyAgentsRuntime` through `listParticipants`, and
 *      `agentsWithTheseIds`) is the one `runtimeOfTheAgentRecord` gives that agent alone, on agents whose newest record
 *      names a runtime, names none, is deleted, or is not an agent's record at all. The forced door keeps exactly the
 *      messages the old rule kept: urgent `true`, to the reader, not seen. A stored `"true"` or `1` is not urgent, as
 *      `isUrgent` says. The `blocking` number on a waiting row counts its live `blocks` links and not a deleted one.
 *   2. NO MORE STATEMENTS FOR MORE ROWS. The participants and forced doors run the same number of statements after more
 *      agents or more messages are added. The waiting door reads the `blocks` links in one statement, and still one after
 *      more rows with links are added; it does other work for each row, which this round did not change.
 *
 * CONTROL: green with the change. RED AT 9a0932db9 (the tip before it): part 2 of the participants, forced and waiting
 * tests. MUTATIONS, each run and each red:
 *   1. `everyAgentsRuntime` orders `r.created_at ASC`: the oldest record's runtime is kept. Red in test 1.
 *   2. `everyAgentsRuntime` drops `r.deleted_at IS NULL`. Red in test 1.
 *   3. `listParticipants` builds each agent with `asAgent(row)`, one runtime read per agent. Red in test 1, part 2.
 *   4. The forced door's `json_type(...) = 'true'` becomes `= 'integer'`, so the narrowing leaves out a stored `true`. Red
 *      in test 2. (Widening it to `json_extract(...) = 1`, which lets a stored `1` through, stays green, and rightly:
 *      `isUrgent` still decides each message the narrowing lets through.)
 *   5. `blockingCounter` drops `isNull(otherEnd.deletedAt)`. Red in test 3.
 *   6. `readWaiting` makes a counter for each row, not one for the pass. Red in test 3, part 2.
 *
 * EACH COUNT OF THE PARTICIPANTS DOOR IS OF A SECOND CALL. Wave 13y round 31. The door remembers, for the life of the
 * process, whether each agent's picture is the one it was given (`isThePictureItWasGiven` in src/server/lib/avatars.ts),
 * so the first call after a picture is new reads that picture's row once. Until wave 13y round 30 each agent given the
 * default picture held its own stored copy. The first count then read the first four agents' pictures and the second
 * read the four new agents' pictures, and the two were equal only because both were four. Since round 30 those agents
 * share one copy: the first count read it and the second did not, 11 statements against 10, and the test was red. Now
 * one call that is not counted comes before each count, so each count is what a call costs once its pictures are
 * remembered. MUTATION: `isThePictureItWasGiven` no longer remembers, so every call reads each agent's picture. Red in
 * test 1, part 2.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let participants: typeof import('../src/server/lib/participants.ts')

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: object): Promise<{ status: number; body: unknown; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.statusCode < 300 ? reply.json() : null, text: reply.body }
}

/** Register an agent and give back its registry id. */
async function register(handle: string, runtime?: string): Promise<string> {
  const made = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, workArea: ['src'], ...(runtime === undefined ? {} : { runtime }) })
  expect(made.status, made.text).toBe(201)
  return (made.body as { agent: { id: string } }).agent.id
}

async function file(kind: string, title: string, data: object, headers: Record<string, string> = PERSON): Promise<string> {
  const made = await call('POST', '/api/records', headers, { kind, title, data })
  expect(made.status, made.text).toBe(201)
  return (made.body as { record: { id: string } }).record.id
}

/** The statements run while `act` runs, or only those whose SQL `matches`, counted on the prototype every statement shares. */
async function statementsDuring(act: () => Promise<unknown>, matches: (sql: string) => boolean = () => true): Promise<number> {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  let runs = 0
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  for (const name of ['get', 'all', 'run', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (matches(this.source)) runs += 1
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return runs
}

/** Link `recordId` to the agent as one more of its records, the newest unless it was made earlier. */
function asTheAgentsRecord(recordId: string, agentId: string): void {
  t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(recordId, agentId)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
}, 90_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the frame every page shares', () => {
  it('reads every agent’s runtime together, and each is the one its own read gives', async () => {
    const declared = await register('frame-declared', 'codex')
    const none = await register('frame-none')
    const newerNote = await register('frame-newer-note', 'codex')
    const deletedNewest = await register('frame-deleted-newest', 'codex')
    // A NEWER RECORD THAT NAMES NO RUNTIME is the newest, so it is the answer: none.
    asTheAgentsRecord(await file('note', 'A newer record of this agent', {}), newerNote)
    // A NEWER RECORD THAT IS DELETED is passed over, so the older one's runtime stands.
    const gone = await file('note', 'A deleted newer record of this agent', {})
    writeDataBypassingTheGate(t, gone, { runtime: 'opencode' })
    asTheAgentsRecord(gone, deletedNewest)
    expect((await call('DELETE', `/api/records/${gone}`, PERSON)).status).toBe(200)

    const listed = new Map(participants.listParticipants().agents.map((one) => [one.id, one.runtime]))
    const together = participants.agentsWithTheseIds([declared, none, newerNote, deletedNewest, 'no-agent-has-this-id'])
    for (const id of [declared, none, newerNote, deletedNewest]) {
      expect(listed.get(id), `listParticipants: ${id}`).toBe(participants.runtimeOfTheAgentRecord(id))
      expect(together.get(id)?.runtime, `agentsWithTheseIds: ${id}`).toBe(participants.runtimeOfTheAgentRecord(id))
      expect(together.get(id), `agentsWithTheseIds is readParticipant: ${id}`).toEqual(participants.readParticipant({ kind: 'agent', id }))
    }
    expect(together.has('no-agent-has-this-id')).toBe(false)
    // NOT FOUR NULLS AGREEING: the four agents give three different answers.
    expect([listed.get(declared), listed.get(none), listed.get(newerNote), listed.get(deletedNewest)]).toEqual(['codex', null, null, 'codex'])

    // EACH COUNT IS OF A SECOND CALL: the first call after a picture is new reads that picture once. The header says why.
    await call('GET', '/api/participants', PERSON)
    const fewer = await statementsDuring(() => call('GET', '/api/participants', PERSON))
    for (const handle of ['frame-more-a', 'frame-more-b', 'frame-more-c', 'frame-more-d']) await register(handle, 'claude-code')
    await call('GET', '/api/participants', PERSON)
    const more = await statementsDuring(() => call('GET', '/api/participants', PERSON))
    expect(more, 'four more agents cost no more statements').toBe(fewer)
  })

  it('answers the forced messages the old rule answered, without building the pool', async () => {
    // ONE SENDER FOR EACH URGENT MESSAGE: an agent may not send a second while its first is unread.
    let senders = 0
    const say = async (title: string, urgent: boolean): Promise<string> => {
      const sender = await register(`frame-sender-${String((senders += 1))}`, 'claude-code')
      return file('message', title, { body: title, to: [{ kind: 'person', id: THE_PERSON }], ...(urgent ? { urgent: true } : {}) }, asAgent(sender))
    }
    const urgent = await say('Urgent and unread', true)
    const seen = await say('Urgent and seen', true)
    const asText = await say('Urgent stored as the text true', true)
    const asOne = await say('Urgent stored as the number 1', true)
    const ordinary = await say('Not urgent', false)
    expect((await call('POST', `/api/messages/${seen}/mark`, PERSON, { mark: 'seen' })).status).toBe(200)
    for (const [id, value] of [[asText, 'true'], [asOne, 1]] as const) {
      const stored = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
      writeDataBypassingTheGate(t, id, { ...stored, urgent: value })
    }

    const forced = async (): Promise<string[]> => {
      const reply = await call('GET', '/api/messages/forced', PERSON)
      expect(reply.status, reply.text).toBe(200)
      return (reply.body as { messages: { id: string }[] }).messages.map((one) => one.id)
    }
    // THE OLD RULE, read off the whole pool: urgent, to this reader, not seen.
    const pool = await call('GET', '/api/messages?only=waiting-for-me&full=1', PERSON)
    const theOldRule = (pool.body as { messages: { id: string; urgent: boolean }[] }).messages.filter((one) => one.urgent).map((one) => one.id)
    expect(theOldRule).toEqual([urgent])
    expect(await forced()).toEqual(theOldRule)
    void ordinary

    const fewer = await statementsDuring(forced)
    for (let i = 0; i < 6; i++) await say(`Not urgent ${String(i)}`, false)
    const more = await statementsDuring(forced)
    expect(more, 'six more ordinary messages cost no more statements').toBe(fewer)
  })

  it('counts a waiting row’s live blocks links, in one read for the whole list', async () => {
    const ask = (title: string) => file('problem', title, { symptom: 'something is wrong', state: 'open', whose_move: 'person' }, asAgent('frame-asker'))
    const holdsUp = await ask('A question that holds things up')
    const blocks = async (from: string): Promise<string> => {
      const to = await file('note', 'Something held up', {})
      const link = await call('POST', '/api/links', PERSON, { fromId: from, toId: to, type: 'blocks' })
      expect(link.status, link.text).toBe(201)
      return to
    }
    await blocks(holdsUp)
    await blocks(holdsUp)
    const deleted = await blocks(holdsUp)
    expect((await call('DELETE', `/api/records/${deleted}`, PERSON)).status).toBe(200)
    const other = await ask('A question that holds one thing up')
    await blocks(other)

    const waiting = async (): Promise<Map<string, number>> => {
      const reply = await call('GET', '/api/waiting', PERSON)
      expect(reply.status, reply.text).toBe(200)
      return new Map((reply.body as { items: { id: string; blocking: number }[] }).items.map((one) => [one.id, one.blocking]))
    }
    const counted = await waiting()
    expect(counted.get(holdsUp), 'two live links; the deleted one is not counted').toBe(2)
    expect(counted.get(other)).toBe(1)

    // THE READ OF THE LINKS ALONE: the reading does other work for each row, which this round did not change.
    const readsOfTheLinks = (sql: string): boolean => /from "links" inner join "records" "waiting_other_end"/.test(sql)
    const fewer = await statementsDuring(waiting, readsOfTheLinks)
    for (let i = 0; i < 4; i++) await blocks(await ask(`One more question ${String(i)}`))
    const more = await statementsDuring(waiting, readsOfTheLinks)
    expect(fewer, 'the links are read once for the list').toBe(1)
    expect(more, 'and still once with four more rows').toBe(1)
  })
})
