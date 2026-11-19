// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DELIVERY ROW'S CLOCK AND ITS SENTENCE DESCRIBE ONE EVENT. Problem JRjR0HGrOpGU.
 *
 * A row of `message_delivery` holds a mark, a clock (`at`), a sentence (`because`) and a run, and the
 * message page draws all four side by side. Until this change no statement wrote the clock and the
 * sentence together. `sayWhereADeliveryStands` wrote the sentence and never the clock; `markDelivery`
 * wrote the mark and the clock, and nothing at all when the mark did not move. So a second take of a
 * delivered message, by another session or by a run resuming a conversation, moved the sentence and
 * left the clock at the first take. The row then named a session at a time when it did not exist.
 *
 * WHAT IS PROVED HERE, each on a message of its own, in a test office of its own. The clock is
 * faked (only `Date`), so two events are seconds apart without anybody waiting.
 *
 *   (a) The problem's own how-to-tell. Session A takes a message; the hold passes to session B and B
 *       takes it again. The sentence names B, and the clock is B's time, not A's.
 *   (b) A run resuming a conversation takes a message that is already delivered: the run, the
 *       sentence and the clock all describe the resuming run.
 *   (c) A mark moved by the mark door after a sentence was written empties the sentence, so the row
 *       reads with the new mark's own words. The run that took the message stays named. The same
 *       holds for `markManyDelivered`, the conversation-open path.
 *   (d) A legacy take with seen:true still marks delivered and explains why. The recipient's own
 *       seen mark keeps the hand-over sentence and clock. Other seen values are refused.
 *       Already-seen rows stay seen when taken; a new session moves the sentence and clock.
 *       A person's conversation read uses the same preservation rule; an explicit sentence replaces.
 *   (e) A write with nothing new writes nothing, and the clock stays where it was.
 *   (f) Because a sentence now moves the clock, the clock is no longer when a message was queued.
 *       The worker's queue and the waiter's list are ordered by when the message was written, so a
 *       queued message whose held sentence is rewritten keeps its place before one written after it.
 *       A dead letter's age (criterion M111's week) is counted from when the message was written, so
 *       a rewritten held sentence does not make an old dead letter look new.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED (each proved after a control run; see the commit message)
 * ---------------------------------------------------------------------------------------
 *
 *   drop `at` from the one UPDATE in writeTheMarkAndTheSentenceTogether   → (a) to (e); (f) stops at its setup
 *   keep `because` when a mark moves with no sentence                     → both (c) cases
 *   drop hand-over preservation on a seen mark                            → (d), recipient and person read
 *   theLiveSessionTookIt always marks seen                                 → (a), (d), without seen
 *   the took door accepts any value of `seen`                              → (d), the refusal
 *   write even when the mark, sentence and run would all stay the same  → (e)
 *   order theQueue by the delivery row's clock again                      → (f), the worker's queue
 *   order everythingWaitingFor by the delivery row's clock again          → (f), the waiter's list
 *   order deadLettersInTheQueue by the delivery row's clock again         → (f), the deleted messages
 *   date a dead letter by the delivery row's clock again (deadLettersNow) → (f), the dead letter
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { deliveryReading, deliveryWord } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nowStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type Worker = typeof import('../src/server/lib/worker.ts')
type Messages = typeof import('../src/server/lib/messages.ts')
type Handles = typeof import('../src/server/lib/handles.ts')
type DeadLetters = typeof import('../src/server/lib/deadletters.ts')

const HANDLE = 'pair-agent'
const WORKSPACE = 'default'

let t: TestDb
let app: FastifyInstance
let worker: Worker
let messages: Messages
let handles: Handles
let deadLetters: DeadLetters
let agentId = ''

const AS_THE_OWNER = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers the waiter sends when it marks a message, as the agent and from its session. */
const asTheAgent = (session: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
})

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_OWNER) {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

interface Row {
  mark: string
  at: string
  because: string | null
  run: string | null
}

/** The one delivery row on a message, as a reader of the message is given it. */
async function rowOf(messageId: string): Promise<Row> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/${messageId}`, headers: AS_THE_OWNER })
  const read = reply.json() as { message?: { deliveries?: Row[] } }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

/**
 * Move the faked clock forward by whole seconds and give back the stamp the office now writes. A stamp
 * is whole seconds, so one second apart is two different stamps. The steps stay well inside the 90
 * seconds after which a hold that has not beaten lapses.
 */
let clock = 0
function aLater(seconds: number): string {
  clock += seconds * 1000
  vi.setSystemTime(clock)
  return nowStamp()
}

async function aSession(title: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', doing: title },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return (filed.body['record'] as { id: string }).id
}

async function aMessage(body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return (filed.body['record'] as { id: string }).id
}

async function hold(session: string): Promise<void> {
  const held = await post(`/api/handles/${HANDLE}/hold`, { session, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, JSON.stringify(held.body)).toBe(201)
}

/** The waiter's take, after the beat it sends every twenty seconds, so the faked clock does not lapse the hold. */
async function took(session: string, messageId: string, extra: Record<string, unknown> = {}) {
  const beat = await post(`/api/handles/${HANDLE}/beat`, { session })
  expect(beat.status, JSON.stringify(beat.body)).toBe(200)
  return post(`/api/handles/${HANDLE}/took`, { session, message: messageId, ...extra })
}

const to = () => ({ kind: 'agent' as const, id: agentId })

let sessionA = ''
let sessionB = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  messages = await import('../src/server/lib/messages.ts')
  handles = await import('../src/server/lib/handles.ts')
  deadLetters = await import('../src/server/lib/deadletters.ts')

  // ONLY `Date` IS FAKED, so the server's own timers and the request plumbing run as they do.
  clock = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(clock)

  await post('/api/records', {
    kind: 'agent',
    title: 'Pair Agent',
    data: { handle: HANDLE, runtime: 'claude-code', state: 'active' },
  })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as {
    agents?: { id: string; handle: string }[]
  }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === HANDLE), 'the registry row').id
  sessionA = await aSession('The first terminal')
  sessionB = await aSession('The second terminal')
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

describe('a delivery row is written as one event', () => {
  it('(a) a second take by another session moves the clock with the sentence', async () => {
    await hold(sessionA)
    const messageId = await aMessage('Are you there?')

    const first = aLater(1)
    const byA = await took(sessionA, messageId)
    expect(byA.status, JSON.stringify(byA.body)).toBe(200)
    const afterA = await rowOf(messageId)
    expect(afterA.because).toContain(sessionA)
    expect(afterA.at).toBe(first)

    // THE HOLD PASSES TO B: A lets go, and B holds the handle some seconds later.
    const released = await post(`/api/handles/${HANDLE}/release`, { session: sessionA, because: 'restarted' })
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    const second = aLater(5)
    await hold(sessionB)
    const byB = await took(sessionB, messageId)
    expect(byB.status, JSON.stringify(byB.body)).toBe(200)

    const afterB = await rowOf(messageId)
    expect(afterB.because).toContain(sessionB)
    expect(afterB.because).not.toContain(sessionA)
    expect(afterB.at, 'the clock is the second take, not the first').toBe(second)
    expect(afterB.at).not.toBe(first)
    expect(afterB.mark, 'a take that does not say seen marks delivered').toBe('delivered')
  })

  it('(b) a run resuming a conversation moves the run, the sentence and the clock together', async () => {
    const messageId = await aMessage('Please carry on where you stopped.')
    const firstRun = await aSession('The run a restart cut off')
    const resumingRun = await aSession('The run that resumed the conversation')

    const first = aLater(1)
    worker.aRunTookIt(
      messageId,
      to(),
      { session: firstRun, runtime: 'claude-code', because: `Run ${firstRun} took this message.` },
      WORKSPACE,
    )
    expect((await rowOf(messageId)).at).toBe(first)

    const second = aLater(7)
    const said = `Run ${resumingRun} resumed the conversation and took this message.`
    const answer = worker.aRunTookIt(messageId, to(), { session: resumingRun, runtime: 'claude-code', because: said }, WORKSPACE)
    expect(answer.mark).toBe('delivered')

    const row = await rowOf(messageId)
    expect(row.mark).toBe('delivered')
    expect(row.run).toBe(resumingRun)
    expect(row.because).toBe(said)
    expect(row.at, 'the clock is the resuming run, not the first').toBe(second)
  })

  it('(c) a mark moved with no sentence empties the old sentence and keeps the run', async () => {
    const messageId = await aMessage('A message a run took and the agent then read.')
    const run = await aSession('The run that took it')

    aLater(1)
    worker.aRunTookIt(messageId, to(), { session: run, runtime: 'claude-code', because: `Run ${run} took this message.` }, WORKSPACE)

    const marked = aLater(3)
    const reply = await post(`/api/messages/${messageId}/mark`, { mark: 'seen' }, asTheAgent(run))
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(reply.body['changed']).toBe(true)

    const row = await rowOf(messageId)
    expect(row.mark).toBe('seen')
    expect(row.because, 'no sentence about the earlier take stays beside the new mark').toBeNull()
    expect(deliveryReading(row).sentence).toBe(deliveryWord('seen').sentence)
    expect(row.run, 'the run that took it is still the run that took it').toBe(run)
    expect(row.at).toBe(marked)
  })

  it('(c) opening the conversation marks a held message delivered and empties the held sentence', async () => {
    const messageId = await aMessage('A message the worker held.')

    aLater(1)
    messages.sayWhereADeliveryStands(messageId, to(), { because: 'Held because two runs are already going.' })
    expect((await rowOf(messageId)).mark).toBe('queued')

    const opened = aLater(2)
    expect(messages.markManyDelivered([messageId], to())).toEqual([messageId])

    const row = await rowOf(messageId)
    expect(row.mark).toBe('delivered')
    expect(row.because).toBeNull()
    expect(deliveryReading(row).sentence).toBe(deliveryWord('delivered').sentence)
    expect(row.at).toBe(opened)
  })

  it('(d) a legacy take asking for seen writes delivered and explains the recipient own mark', async () => {
    const messageId = await aMessage('Handed straight to the terminal.')
    const handed = aLater(1)
    const byB = await took(sessionB, messageId, { seen: true })
    expect(byB.status, JSON.stringify(byB.body)).toBe(200)
    expect(byB.body['mark']).toBe('delivered')
    expect(byB.body['seenNotWritten']).toBe(
      "Handing a message over marks it delivered. Read is the recipient's own mark: " +
      `POST /api/messages/${messageId}/mark {"mark":"seen"} once the session has read it.`,
    )
    const taken = await rowOf(messageId)
    expect(taken.mark).toBe('delivered')
    expect(taken.because).toContain(sessionB)
    expect(taken.at).toBe(handed)
    aLater(3)
    const seen = await post(`/api/messages/${messageId}/mark`, { mark: 'seen' }, asTheAgent(sessionB))
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body['changed']).toBe(true)
    expect(await rowOf(messageId)).toEqual({ ...taken, mark: 'seen' })
  })

  it('(d) taking an already-seen message and taking it in another session move sentence and clock', async () => {
    const messageId = await aMessage('Read before the hand-over.')
    messages.markDelivery(messageId, to(), 'seen')
    const first = aLater(2)
    await took(sessionB, messageId)
    expect(await rowOf(messageId)).toMatchObject({ mark: 'seen', at: first, because: expect.stringContaining(sessionB) })
    await post(`/api/handles/${HANDLE}/release`, { session: sessionB, because: 'restarted' })
    await hold(sessionA)
    const second = aLater(2)
    await took(sessionA, messageId)
    expect(await rowOf(messageId)).toMatchObject({ mark: 'seen', at: second, because: expect.stringContaining(sessionA) })
    await post(`/api/handles/${HANDLE}/release`, { session: sessionA, because: 'restarted' })
    await hold(sessionB)
  })

  it('(d) a person opening the conversation keeps a hand-over clock and sentence', async () => {
    const { theLiveSessionTookIt } = await import('../src/shared/handles.ts')
    const filed = await post('/api/records', {
      kind: 'message', title: 'For the person',
      data: { body: 'For the person', to: [{ kind: 'person', id: THE_PERSON }] },
    }, asTheAgent(sessionB))
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const messageId = (filed.body['record'] as { id: string }).id
    const person = { kind: 'person' as const, id: THE_PERSON }
    aLater(1)
    messages.sayWhereADeliveryStands(messageId, person, { mark: 'delivered', because: theLiveSessionTookIt(sessionB) })
    const taken = await rowOf(messageId)
    aLater(3)
    const seen = await post(`/api/messages/${messageId}/mark`, { mark: 'seen' })
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(await rowOf(messageId)).toEqual({ ...taken, mark: 'seen' })
  })

  it('(d) an explicit archived sentence replaces a hand-over sentence and clock', async () => {
    const messageId = await aMessage('A row with a sentence of its own.')
    const { theLiveSessionTookIt } = await import('../src/shared/handles.ts')
    messages.sayWhereADeliveryStands(messageId, to(), { because: theLiveSessionTookIt(sessionB) })
    const archived = aLater(3)
    expect(messages.archiveADelivery(messageId, to(), 'Nobody will be woken for this message.')).toBe(true)
    expect(await rowOf(messageId)).toMatchObject({ mark: 'archived', at: archived, because: 'Nobody will be woken for this message.' })
  })

  it('(d) a take without seen marks delivered', async () => {
    const messageId = await aMessage('Taken into a queue nobody has read yet.')

    const handed = aLater(1)
    const byB = await took(sessionB, messageId)
    expect(byB.status, JSON.stringify(byB.body)).toBe(200)
    const row = await rowOf(messageId)
    expect(row.mark).toBe('delivered')
    expect(row.because).toContain(sessionB)
    expect(row.at).toBe(handed)
  })

  it('(d) a take with any other value of seen is refused and writes nothing', async () => {
    const messageId = await aMessage('Sent with a seen that means nothing.')
    const before = await rowOf(messageId)

    aLater(1)
    for (const value of [false, 'yes', 1]) {
      const refused = await took(sessionB, messageId, { seen: value })
      expect(refused.status, JSON.stringify(refused.body)).toBe(400)
      expect(String(refused.body['error'])).toContain('seen')
    }
    expect(await rowOf(messageId)).toEqual(before)
  })

  it('(e) a write with nothing new writes nothing, and the clock stays', async () => {
    const messageId = await aMessage('Held for a while.')
    const because = 'Held because the agent is answering somewhere else.'

    const said = aLater(1)
    expect(messages.sayWhereADeliveryStands(messageId, to(), { because }).written).toBe(true)
    expect((await rowOf(messageId)).at).toBe(said)

    aLater(1)
    expect(messages.sayWhereADeliveryStands(messageId, to(), { because }).written).toBe(false)
    const row = await rowOf(messageId)
    expect(row.at, 'the same sentence again does not move the clock').toBe(said)
    expect(row.because).toBe(because)

    // AND THE SAME TAKE BY THE SAME SESSION AGAIN, which the waiter does after a half-read message.
    const handed = aLater(1)
    expect((await took(sessionB, messageId)).status).toBe(200)
    expect((await rowOf(messageId)).at).toBe(handed)
    aLater(1)
    expect((await took(sessionB, messageId)).status).toBe(200)
    expect((await rowOf(messageId)).at, 'a second identical take does not move the clock').toBe(handed)
  })

  describe('(f) a rewritten held sentence does not move a message back in the queue', () => {
    let first = ''
    let second = ''

    beforeAll(async () => {
      aLater(1)
      first = await aMessage('Written first and held.')
      messages.sayWhereADeliveryStands(first, to(), { because: 'Held because two runs are already going.' })
      aLater(1)
      second = await aMessage('Written second.')
      // THE FIRST MESSAGE'S REASON CHANGES AFTER THE SECOND WAS WRITTEN, so its clock is now later.
      aLater(1)
      messages.sayWhereADeliveryStands(first, to(), { because: 'Held because the agent is answering somewhere else.' })
      expect((await rowOf(first)).at > (await rowOf(second)).at, 'the held row really has the later clock').toBe(true)
    })

    const inOrder = (ids: readonly string[]): string[] => ids.filter((id) => id === first || id === second)

    it("keeps its place in the worker's queue", () => {
      expect(inOrder(worker.theQueue(WORKSPACE).map((one) => one.messageId))).toEqual([first, second])
    })

    it("keeps its place in the waiter's list of what is waiting", () => {
      expect(inOrder(handles.everythingWaitingFor(agentId).map((one) => one.messageId))).toEqual([first, second])
    })

    it('keeps its place among queued messages whose record was deleted', async () => {
      for (const id of [first, second]) {
        const gone = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: AS_THE_OWNER })
        expect(gone.statusCode, gone.body).toBe(200)
      }
      expect(inOrder(worker.deadLettersInTheQueue(WORKSPACE).map((one) => one.messageId))).toEqual([first, second])
    })

    it('keeps its age as a dead letter', async () => {
      // AN AGENT NOTHING ANSWERS AS, so a message to it is a dead letter.
      const filed = await post('/api/records', {
        kind: 'agent',
        title: 'Nobody Holds',
        data: { handle: 'nobody-holds', runtime: 'claude-code', state: 'active' },
      })
      expect(filed.status, JSON.stringify(filed.body)).toBe(201)
      const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as {
        agents?: { id: string; handle: string }[]
      }
      const nobody = one((listed.agents ?? []).filter((a) => a.handle === 'nobody-holds'), 'the registry row').id
      const written = aLater(1)
      const letter = await post('/api/records', {
        kind: 'message',
        title: 'A letter nobody will read',
        data: { body: 'A letter nobody will read.', to: [{ kind: 'agent', id: nobody }] },
      })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(letter.status, JSON.stringify(letter.body)).toBe(409)
      const letterId = (letter.body['record'] as { id: string }).id

      aLater(3)
      messages.sayWhereADeliveryStands(letterId, { kind: 'agent', id: nobody }, { because: 'Held because nothing answers.' })
      expect((await rowOf(letterId)).at, 'the held row really has the later clock').not.toBe(written)

      const dead = one(
        deadLetters.deadLettersNow(new Date(clock)).filter((one) => one.messageId === letterId),
        'the dead letter',
      )
      expect(dead.at, 'the letter is as old as its message').toBe(written)
    })
  })
})
