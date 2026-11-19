// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE DOOR READS ONLY ITS OWN PROJECT'S QUEUED DELIVERIES, NOT EVERY PROJECT'S.
 *
 * MEASURED FIRST, 11 September 2026, on a copy of the owner's database: 670 queued
 * agent deliveries exist across every project, and `GET /api/worker/queue` for ONE project used to
 * read all 670 in its first select and drop the ones from other projects only inside the loop that
 * does the expensive per-row work. 158 of the 670 point at records marked deleted and can never
 * clear; they were re-read on every one of the 28,115 calls a day and silently skipped.
 *
 * HOW IT IS PROVED. The statements are counted at the database: `sqlite.prepare` is
 * wrapped for the length of one call and the SQL of each statement is kept. IT COUNTS PREPARES, NOT
 * EXECUTIONS, so the statement counted has to be one whose SQL text changes shape with the data —
 * a statement whose text is the same every call can be prepared once and remembered, and counting
 * it proves nothing. The one counted is the queue's OWN read of the message records behind its
 * queued deliveries, the read `theQueue` makes after its first select: `records.id in (?, ?, …)`
 * over the six record columns, with no `rowid`. Drizzle writes ONE PLACEHOLDER PER MESSAGE ID the
 * first read handed it, so its text says how many queued deliveries the first read returned, and
 * that number is exactly what the workspace narrowing decides. Of every prepared statement whose
 * text has `"records"."id" in (`, it is picked by its select list ending `"created_at" from
 * "records"`; the guard's read below adds `rowid` after `created_at`, so it does not have that part.
 * If the queue's read ever loses that part of its text, the filter finds nothing and the count
 * below fails rather than passing quietly.
 *
 * THE GUARD'S CONVERSATION READS CARRY THE SAME `"records"."id" in (` AND ARE NOT COUNTED HERE.
 * Since 18 November the queue asks its conversation guard once a pass for each conversation an
 * agent wrote in (`whyThisConversationIsWaiting`, through `agentTurnsInTheConversation`), and
 * `theConversationBackTo` and `theNextOfThePair` read that conversation back through `rowsByIds`
 * and `rowsWhere`. Each of those statements selects the same six columns and then `rowid`, so its
 * text says `"created_at", rowid from "records"`, and each walk reads the queued agent message
 * again, because that message is the newest one in its conversation. The fixture's three live agent
 * messages to three agents make three such walks; counting every statement with `"records"."id" in
 * (` counts those three beside the queue's one.
 *
 * The database holds eight queued deliveries in `default` — the four card messages the
 * registrations write, three live messages and one whose message has since been deleted — and six
 * in `other` (three cards, two live and one deleted). Narrowed, the records read for `default`
 * carries this project's eight ids and no project filter, so eight placeholders. With the narrowing
 * undone, the first read would hand the records read fourteen ids from both projects, so fourteen
 * placeholders. That second number is worked out from the fixture and was NOT measured again; the
 * old header's nine and fifteen were measured when the read still carried a ninth placeholder for a
 * project filter that a decision has since taken out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgentIn = (workspace: string, id: string) => ({ 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** The messages waiting for one agent, through the door the waiter uses. */
async function waitingIdsFor(handle: string, headers: Record<string, string>): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers })
  const body = reply.json() as { waiting?: { messageId: string }[] }
  return (body.waiting ?? []).map((one) => one.messageId)
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return reply.json() as Record<string, unknown>
}

let liveDefaultIds: string[] = []
let deletedDefaultId = ''
let liveOtherIds: string[] = []
let deletedOtherId = ''
/** The registry id each agent was given when it registered, by handle. It is not the handle. */
const registryIdOf = new Map<string, string>()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: PERSON, payload: { id: 'other', title: 'The other project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of ['q-sender', 'q-one', 'q-two', 'q-three']) {
    const madeAgent = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(madeAgent.statusCode, madeAgent.body).toBe(201)
    registryIdOf.set(handle, (madeAgent.json() as { agent: { id: string } }).agent.id)
    // THE CARD MESSAGE THE REGISTRATION WRITES IS A QUEUED DELIVERY TOO. A decision is why the registration writes
    // it.
    const cards = await waitingIdsFor(handle, PERSON)
    expect(cards.length, 'the registration wrote a card message').toBe(1)
    liveDefaultIds.push(cards[0]!)
  }
  const OTHER = { ...PERSON, 'x-mole-office-workspace': 'other' }
  for (const handle of ['o-sender', 'o-one', 'o-two']) {
    const madeAgent = await app.inject({ method: 'POST', url: '/api/agents/started', headers: OTHER, payload: { handle, name: handle, workArea: ['src'] } })
    expect(madeAgent.statusCode, madeAgent.body).toBe(201)
    const cards = await waitingIdsFor(handle, OTHER)
    expect(cards.length, 'the registration wrote a card message').toBe(1)
    liveOtherIds.push(cards[0]!)
  }
  // THREE LIVE MESSAGES AND ONE DELETED ONE IN `default`.
  for (const to of ['q-one', 'q-two', 'q-three']) {
    const filed = await post('/api/records', { kind: 'message', title: `to ${to}`, data: { body: `a message for ${to}`, to: [{ kind: 'agent', id: to }] } }, asAgentIn('default', 'q-sender'))
    const id = (filed['record'] as { id?: string } | undefined)?.id
    expect(id, JSON.stringify(filed).slice(0, 200)).toBeDefined()
    liveDefaultIds.push(id as string)
  }
  const toDelete = await post('/api/records', { kind: 'message', title: 'dead letter', data: { body: 'a message whose record will be deleted', to: [{ kind: 'agent', id: 'q-one' }] } }, asAgentIn('default', 'q-sender'))
  deletedDefaultId = ((toDelete['record'] as { id?: string } | undefined)?.id ?? '')
  expect(deletedDefaultId).not.toBe('')
  // ITS WRITER DELETES IT, because only the writer may delete a message.
  const gone = await app.inject({ method: 'DELETE', url: `/api/records/${deletedDefaultId}`, headers: asAgentIn('default', 'q-sender') })
  expect(gone.statusCode, gone.body).toBe(200)
  // TWO LIVE MESSAGES AND ONE DELETED ONE IN `other`.
  for (const to of ['o-one', 'o-two']) {
    const filed = await post('/api/records', { kind: 'message', title: `to ${to}`, data: { body: `a message for ${to}`, to: [{ kind: 'agent', id: to }] } }, asAgentIn('other', 'o-sender'))
    const id = (filed['record'] as { id?: string } | undefined)?.id
    expect(id, JSON.stringify(filed).slice(0, 200)).toBeDefined()
    liveOtherIds.push(id as string)
  }
  const otherToDelete = await post('/api/records', { kind: 'message', title: 'other dead letter', data: { body: 'a message whose record will be deleted', to: [{ kind: 'agent', id: 'o-one' }] } }, asAgentIn('other', 'o-sender'))
  deletedOtherId = ((otherToDelete['record'] as { id?: string } | undefined)?.id ?? '')
  expect(deletedOtherId).not.toBe('')
  const goneOther = await app.inject({ method: 'DELETE', url: `/api/records/${deletedOtherId}`, headers: asAgentIn('other', 'o-sender') })
  expect(goneOther.statusCode, goneOther.body).toBe(200)
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** Every statement prepared while `act` runs, by its SQL. */
async function statementsDuring(act: () => Promise<void>): Promise<string[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  if (process.env.MOLE_QUEUE_TEST_DEBUG !== undefined) console.log('PREPARED:\n' + seen.join('\n---\n'))
  return seen
}

describe('GET /api/worker/queue with queued deliveries in two projects', () => {
  it('lists only this project\'s queue, names its dead letters, and prepares the records read for this project\'s deliveries only', async () => {
    let body: { queue?: { messageId: string }[]; deadLetters?: { count: number; rows: { deliveryId: string; messageId: string; recipientId: string; deletedAt: string }[]; note: string } } = {}
    const statements = await statementsDuring(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      body = reply.json() as typeof body
    })
    const listed = (body.queue ?? []).map((one) => one.messageId)
    expect(listed.slice().sort(), 'every live message of this project is listed').toEqual([...liveDefaultIds].sort())
    expect(listed, 'nothing from the other project is listed').not.toContain(deletedOtherId)
    for (const id of liveOtherIds) expect(listed, 'nothing from the other project is listed').not.toContain(id)
    // THE DEAD LETTER IS NAMED, NOT SILENTLY SKIPPED. One delivery in this project is queued for a
    // message that has been deleted; the other project's dead letter must not be counted here.
    const dead = body.deadLetters
    expect(dead, 'the reply carries a deadLetters block').toBeDefined()
    expect(dead?.count, 'this project\'s one dead letter is counted').toBe(1)
    expect(dead?.rows?.length).toBe(1)
    expect(dead?.rows?.[0]?.messageId).toBe(deletedDefaultId)
    expect(dead?.rows?.[0]?.recipientId).toBe(registryIdOf.get('q-one') ?? 'q-one was never registered')
    expect(dead?.rows?.[0]?.deletedAt ?? '', 'the row says when the message was deleted').not.toBe('')
    expect(dead?.note ?? '').toContain('deleted')
    expect(dead?.note ?? '').toContain('default')
    // THE STATEMENT THAT PROVES THE NARROWING. The records read behind the queued deliveries
    // carries one placeholder per message id the first read handed it, so eight queued deliveries in this project's view —
    // four cards the registrations wrote, three live messages and one deleted — prepare it with eight. Until a
    // decision it carried a ninth for a project filter; every message is kept in the message centre
    // now, the first read is narrowed to this project's view, and the ids it hands on are already this
    // project's. Its text changes shape with that count, which is why counting it says
    // something; the first read's own text is the same every call and could be prepared once and remembered, so it
    // proves nothing.
    // THE QUEUE'S OWN READ, PICKED BY THE END OF ITS SELECT LIST. It asks for the six record columns
    // and stops at `created_at` (`db.select(ROW)` under `theQueue`'s queued deliveries), so its text
    // has `"created_at" from "records"`. The guard's conversation walk selects the same six columns
    // and then `rowid`, so its text has `"created_at", rowid from "records"` and not this part; its
    // reads carry the same `"records"."id" in (` and are left out here, as the header says. If the
    // queue's read changes its select list, nothing matches and the count below fails.
    const recordReads = statements.filter(
      (sql) => /"records"\."id" in \(/.test(sql) && /"created_at" from "records"/.test(sql),
    )
    expect(recordReads.length, 'the records behind the queued deliveries are read once').toBe(1)
    expect((recordReads[0]?.match(/\?/g) ?? []).length, 'the records read carries THIS project\'s ids only').toBe(8)
  })

  it('counts the other project\'s queue and its dead letter from that project\'s own headers', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: { ...PERSON, 'x-mole-office-workspace': 'other' } })
    expect(reply.statusCode, reply.body).toBe(200)
    const body = reply.json() as { queue: { messageId: string }[]; deadLetters: { count: number; rows: { messageId: string }[] } }
    expect(body.queue.map((one) => one.messageId).sort(), 'the other project\'s live messages are listed from its own headers').toEqual([...liveOtherIds].sort())
    expect(body.queue.map((one) => one.messageId), 'nothing from `default` is listed here').not.toContain(deletedDefaultId)
    expect(body.deadLetters.count, 'the other project\'s one dead letter is counted, and not `default`\'s').toBe(1)
    expect(body.deadLetters.rows[0]?.messageId).toBe(deletedOtherId)
  })
})