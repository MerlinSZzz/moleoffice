// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'

/**
 * A SECRETARY'S NOTICE RULES MUTE THE AUTOMATIC NOTICES THAT ASK IT FOR NO REPLY, until it saves rules of its own.
 *
 * Before 7 November 2026 nobody had rules until they saved some, and a secretary was woken for each of these. The
 * secretary of the office this was asked in set the same list by hand. A notice a rule mutes is held, not lost: it
 * stays waiting, and the waiting list and the message worker's queue both say the rule holds it. A worker has no such
 * defaults, a person's message wakes a secretary as before, and a secretary that saves its own rules has those instead,
 * an empty list too.
 *
 * TWO RELEASES ARE NOT ON THE LIST, `released` and `checkedAndReleased`. A secretary that submits runs is woken by them
 * to submit, and in an office with no script reading the checks that is the only way such a run is submitted. Their case
 * is tests/a-release-wakes-the-one-who-submits-the-run.test.ts, whose starters are secretaries.
 */
const THE_QUIET_KINDS = [
  'groupOpened', 'memberAdded', 'memberLeft', 'theOverlapEnded',
  'claimsInConflict', 'territoriesInConflict', 'workAreasInConflict',
  'aChildSessionFinished', 'aRunWasSealed',
  'releasedAndTheStarterIsTold', 'releasedToOneThatReadsTheCheck',
  'aRunWasClosed', 'theCheckStarted', 'theCheckEnded', 'aCheckWasQueued', 'aCheckWaitsItsTurn',
  'aRunAnswered', 'aRunPickedUpItsConversation', 'theExpectedTimeHasArrived', 'anEntryWaitsForRoom', 'beforeTheSeal',
].sort()
const HELD_BY_A_RULE = 'Your notice wake rule'

let t: TestDb, app: FastifyInstance
const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

async function agent(handle: string, name: string, role: string) {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name, role } })
  expect(r.statusCode, r.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const who = agentByHandle(handle)!
  return { who, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(who.id, null) } }
}
type Agent = Awaited<ReturnType<typeof agent>>

async function theirRules(a: Agent) {
  const door = await app.inject({ method: 'GET', url: '/api/messages/notice-rules', headers: a.headers })
  expect(door.statusCode, door.body).toBe(200)
  return door.json() as { mutedKinds: string[]; defaultMutedKinds: string[]; recordId: string | null; version: string | null }
}

/** A notice that wakes its reader by the office's table, so only a rule can hold it: an overlap another agent settles. */
async function anOverlapNotice(a: Agent): Promise<string> {
  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  return writeASystemLineToOne({ kind: 'agent', id: a.who.id }, 'default', SYSTEM_LINES.claimsInConflict('a made-up file', 'made-up-one', 'made-up-two'), { type: 'system', id: moleOffice().id }).id
}

/** Why the waiting list and the message worker's queue hold one message, each `undefined` when it wakes. Both must have it. */
async function whyItIsHeld(a: Agent, messageId: string): Promise<{ waiting: string | undefined; queue: string | undefined }> {
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const { theQueue } = await import('../src/server/lib/worker.ts')
  const waiting = everythingWaitingFor(a.who.id).find((one) => one.messageId === messageId)
  expect(waiting, 'the message is not waiting for its reader').toBeDefined()
  const queued = theQueue('default').find((one) => one.messageId === messageId)
  expect(queued, 'the message is not in the message worker\'s queue').toBeDefined()
  return { waiting: waiting!.wakesNoWaiter, queue: queued!.heldByNoticeRule }
}

let secretary: Agent, worker: Agent
beforeAll(async () => {
  secretary = await agent(THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name, 'secretary')
  worker = await agent('made-up-worker', 'Made-up worker', 'worker')
})

describe('a secretary that has saved no rules', () => {
  it('reads the quiet kinds as its rules, and as its defaults, with nothing saved', async () => {
    const rules = await theirRules(secretary)
    expect(rules.recordId, 'the secretary has saved rules').toBeNull()
    expect([...rules.defaultMutedKinds].sort(), 'a secretary\'s defaults are not the quiet kinds').toEqual(THE_QUIET_KINDS)
    expect([...rules.mutedKinds].sort(), 'a secretary\'s rules do not mute the quiet kinds').toEqual(THE_QUIET_KINDS)
  })

  it('is not woken by an overlap notice, which still waits for it where it can be read', async () => {
    const id = await anOverlapNotice(secretary)
    const held = await whyItIsHeld(secretary, id)
    expect(held.waiting ?? '', 'the waiting list wakes the secretary for the notice').toContain(HELD_BY_A_RULE)
    expect(held.queue ?? '', 'the worker\'s queue wakes the secretary for the notice').toContain(HELD_BY_A_RULE)
    const inbox = await app.inject({ method: 'GET', url: `/api/handles/${secretary.handle}/waiting`, headers: secretary.headers })
    expect(inbox.statusCode, inbox.body).toBe(200)
    expect(inbox.body, 'the held notice is not in the secretary\'s waiting list').toContain(id)
  })

  it('is woken by a person\'s message as before', async () => {
    const sent = await app.inject({ method: 'POST', url: '/api/records', headers: owner, payload: { kind: 'message', title: 'A made-up question', data: { to: [{ kind: 'agent', id: secretary.who.id }], body: 'Is the made-up page ready?' } } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(sent.statusCode, sent.body).toBe(409)
    const held = await whyItIsHeld(secretary, (sent.json() as { record: { id: string } }).record.id)
    expect(held, 'a person\'s message to the secretary was held').toEqual({ waiting: undefined, queue: undefined })
  })
})

describe('an agent that is not a secretary', () => {
  it('has no defaults, and is woken by an overlap notice', async () => {
    const rules = await theirRules(worker)
    expect(rules.defaultMutedKinds).toEqual([])
    expect(rules.mutedKinds).toEqual([])
    const held = await whyItIsHeld(worker, await anOverlapNotice(worker))
    expect(held, 'a worker was not woken for an overlap notice').toEqual({ waiting: undefined, queue: undefined })
  })
})

describe('a secretary that saves rules of its own', () => {
  it('has those instead, an empty list too, and is woken by an overlap notice again', async () => {
    const before = await theirRules(secretary)
    const saved = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: secretary.headers, payload: { mutedKinds: [], batchedKinds: [], because: 'Made-up choice: wake me for everything.', ifVersion: before.version } })
    expect(saved.statusCode, saved.body).toBe(200)
    const after = await theirRules(secretary)
    expect(after.recordId, 'the secretary\'s own rules were not saved').not.toBeNull()
    expect(after.mutedKinds, 'the secretary\'s own empty list did not replace its defaults').toEqual([])
    expect([...after.defaultMutedKinds].sort(), 'the defaults are no longer named once the secretary saved its own').toEqual(THE_QUIET_KINDS)
    const held = await whyItIsHeld(secretary, await anOverlapNotice(secretary))
    expect(held, 'the secretary\'s defaults still held a notice after it saved its own rules').toEqual({ waiting: undefined, queue: undefined })
  })

  it('goes back to its defaults by saving them', async () => {
    const before = await theirRules(secretary)
    const saved = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: secretary.headers, payload: { mutedKinds: before.defaultMutedKinds, batchedKinds: [], because: 'Made-up choice: back to the defaults.', ifVersion: before.version } })
    expect(saved.statusCode, saved.body).toBe(200)
    expect([...(await theirRules(secretary)).mutedKinds].sort()).toEqual(THE_QUIET_KINDS)
    const held = await whyItIsHeld(secretary, await anOverlapNotice(secretary))
    expect(held.waiting ?? '').toContain(HELD_BY_A_RULE)
  })
})
