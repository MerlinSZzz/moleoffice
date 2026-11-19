// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITING DOOR HOLDS THE REQUEST UNTIL A MESSAGE ARRIVES, OR THIRTY SECONDS PASS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U7 of design/settings/ACCEPTANCE.md, the second half. The waiting door
 * (`GET /api/handles/:handle/waiting`) already answers at once with everything queued for an agent.
 * These cases prove the four shapes that were added around that:
 *
 *   1. WITH NO PARAMETER it answers at once, with exactly the three fields it always had. This is
 *      not a nicety: the waiters already running on other machines send no parameter and will not
 *      be updated when this merges, and a door that started holding them would stop their work.
 *   2. WITH THE PARAMETER AND SOMETHING ALREADY WAITING it answers at once too. A hold is only for
 *      an empty answer.
 *   3. WITH THE PARAMETER AND NOTHING WAITING IT HOLDS, and a delivery row written while it is held
 *      reaches it before the cap. This is the wake, and it is the case that matters.
 *   4. A HOLD THAT TIMES OUT answers the same empty shape, at the cap and not before.
 *   5. A CALLER THAT GOES AWAY is deregistered, proved by the registry being empty afterwards and
 *      by a second hold still being woken by a message.
 *   6. THE CAP CANNOT BE EXCEEDED by asking for more.
 *
 * ---------------------------------------------------------------------------------------
 * THE WAKE IS PROVED BY THE PAIR
 * ---------------------------------------------------------------------------------------
 *
 * The mutation this file is built around is deleting the one wake call in
 * `writeTheDeliveries` (src/server/lib/messages.ts). With it deleted, case 3 goes red — the held
 * request waits out its cap and never sees the message before it — and case 4 stays green, because
 * a hold that times out does not need a wake. That pairing is the proof that case 3 is about the
 * wake and case 4 is about the cap, and that case 3 could not pass with the feature deleted.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE WAKE IS REACHED IN THIS TEST
 * ---------------------------------------------------------------------------------------
 *
 * The test builds the product's own app in this process and listens on a scratch port, so the held
 * request is a real HTTP request and the message is written through the real record door in the
 * same process. That is the one-process arrangement src/server/index.ts:1546-1562 and :2063-2080
 * hold, and it is the arrangement the wake is sound in. The abort case is a real `AbortController`
 * on a real socket, which is the only honest way to prove a dropped caller is deregistered.
 *
 * ---------------------------------------------------------------------------------------
 * THE CAP IS WAITED OUT ON A FAKE CLOCK, NOT IN REAL TIME
 * ---------------------------------------------------------------------------------------
 *
 * The cap is a `setTimeout` in the server's handler (`aCapAt` in src/server/api/handles.ts), and
 * the server runs in this process. So the two cases whose subject is the cap put this process's
 * `setTimeout` on vitest's fake clock while their hold is open. The fake clock also moves with real
 * time. With it standing still, the request never reached the handler: measured on 25 September
 * 2026, the hold was not registered within five seconds. Which timer on the request's path it
 * waits on was not looked for. The case moves the clock on by hand as well: to 28 seconds, when the
 * request must still be open, then two more, when it must have answered at the cap. The real time
 * the case takes is added on top; it was about half a second when measured, well under the two
 * seconds between the checks. The request, the socket and the database
 * stay real, and so does `Date`. Every other case, and every wait this file does for itself, runs
 * on the real clock: `pause` below keeps the real `setTimeout` it was given before any case began.
 * Until 25 September 2026 these two cases waited the thirty seconds in real time, and the file took
 * about a minute.
 *
 * THE CAP'S OWN MUTATIONS, in src/server/api/handles.ts. With `LONGEST_HOLD_SECONDS` at 20, both
 * cap cases go red at the 28-second check. With it at 40, the case that asks for 9999 goes red at
 * the thirty-second check. The case that times out stays green at 40, because it asks for thirty
 * and is answered at thirty either way; it was the same when it waited in real time.
 *
 * ---------------------------------------------------------------------------------------
 * AN OPEN WAIT RECEIVES, SO A PERSON'S SEND TO IT ANSWERS 201
 * ---------------------------------------------------------------------------------------
 *
 * A person's send to an agent nothing receives for answers 409, with the letter stored and routed.
 * A request held open on the agent's waiting door does receive: it is woken by the delivery and
 * answers with the letter. So a send made while one is open answers 201, in cases 3 and 5 and the
 * counting case. Case 3 also sends the same words once the request has closed, and that answers 409,
 * and sends to a second agent while the first agent's wait is open, and that answers 409 too.
 * Delete the reach's reading of the open waits (`whyThisAgentCannotBeReached` in
 * src/server/lib/worker.ts) and the three 201s go red. Count every agent's waits instead of the
 * addressee's and the second agent's 409 goes red. Count a wait that has closed and the 409 after
 * the close goes red.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
// The registry itself, so the abort case can be proved deregistered rather than merely assumed.
let holdLib: typeof import('../src/server/lib/waiting-hold.ts')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WAIT_CAP_SECONDS = 30

/** The real `setTimeout`, kept before any case puts the process on the fake clock. */
const realSetTimeout = globalThis.setTimeout
const pause = (ms: number): Promise<void> => new Promise((go) => realSetTimeout(go, ms))

/**
 * WHETHER A HELD REQUEST HAS ANSWERED, given a real moment for an answer already sent to arrive.
 * Used only while the process's `setTimeout` is on the fake clock.
 */
async function answeredYet(settled: () => boolean): Promise<boolean> {
  await pause(300)
  return settled()
}

/**
 * HOLD ONE REQUEST WITH THE PROCESS ON THE FAKE CLOCK, and move the clock on by hand. Nothing but
 * `setTimeout` and `clearTimeout` is faked, so the socket, the database and `Date` are real. The
 * fake clock also moves with real time, so the request reaches the handler (see the head of this
 * file).
 * The hold is registered before the clock is moved by hand, and the cap's timer is armed in the
 * same step as the registration, so every move by hand is counted from the cap's start.
 */
async function aHoldOnTheFakeClock(
  handle: string,
  seconds: number,
): Promise<{ settled: () => boolean; answer: Promise<HeldAnswer>; moveOn: (ms: number) => Promise<void> }> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
  let settled = false
  const answer = aHoldOn(handle, seconds)
  void answer.then(
    () => (settled = true),
    () => (settled = true),
  )
  expect(await until(() => holdLib.waitersHeld() === 1, 5000), 'the hold is registered').toBe(true)
  return {
    settled: () => settled,
    answer,
    moveOn: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms)
    },
  }
}

async function aFreshAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: `A session for ${handle}`,
    data: { handle, runtime: 'claude-code', state: 'active' },
  })
  // THE REGISTRY ROW'S ID, which is what a delivery row keys on and what the waiting door works
  // from. It is not the record's own id, and sending the record id is refused by name.
  const listed = await get('/api/participants')
  const found = ((listed.body['agents'] ?? []) as { id: string; handle: string }[]).find(
    (one) => one.handle === handle,
  )
  if (found === undefined) throw new Error(`the agent ${handle} is not in the participant registry`)
  return found.id
}

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${api}${path}`, { headers: AS_THE_OWNER })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function post(
  path: string,
  body: unknown,
  answers: number = theAnswerToAWriteInATestOffice(AS_THE_OWNER, body),
): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify(body),
  })
  const said = (await res.json()) as Record<string, unknown>
  expect(res.status, `POST ${path}: ${JSON.stringify(said)}`).toBe(answers)
  return said
}

/**
 * THE PERSON'S LETTER TO ONE AGENT, and what the send answers. With nothing given it is the answer of a test office
 * where nothing receives for any agent, 409. A case that sends while a wait is open on the agent says 201. A 409 still
 * stores the letter, so its id is read the same way.
 */
async function sendTheAgent(body: string, agentId: string, answers?: 201 | 409): Promise<string> {
  const letter = {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  }
  const filed = await post('/api/records', letter, answers)
  return (filed['record'] as { id: string }).id
}

interface HeldAnswer {
  status: number
  at: number
  body: Record<string, unknown>
}

/** One waiting-door request with `?wait=`, and the moment it settled. Never times out on its own. */
function aHoldOn(handle: string, seconds: number, signal?: AbortSignal): Promise<HeldAnswer> {
  return fetch(`${api}/api/handles/${encodeURIComponent(handle)}/waiting?wait=${String(seconds)}`, {
    headers: AS_THE_OWNER,
    ...(signal === undefined ? {} : { signal }),
  }).then(async (res) => ({
    status: res.status,
    at: Date.now(),
    body: (await res.json()) as Record<string, unknown>,
  }))
}

async function until(what: () => boolean, within = 10_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await pause(50)
  }
  return what()
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  holdLib = await import('../src/server/lib/waiting-hold.ts')
}, 60_000)

afterEach(async () => {
  // THE REAL CLOCK AGAIN, whatever a case left, before anything below waits on it.
  vi.useRealTimers()
  // A HOLD LEFT BEHIND WOULD BLEED INTO THE NEXT CASE. Every case below ends with the registry
  // empty; if one does not, that is a leak this file should say out loud rather than hide.
  expect(await until(() => holdLib.waitersHeld() === 0, 5000), 'no hold is left registered').toBe(true)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the waiting door holds only when it is asked to', () => {
  it('answers at once with no parameter, and its body is exactly the three fields it had', async () => {
    const handle = 'waiting-no-parameter'
    await aFreshAgent(handle)
    const started = Date.now()
    const answer = await get(`/api/handles/${handle}/waiting`)
    expect(answer.status, 'the unparameterised door answers 200').toBe(200)
    expect(Date.now() - started, 'it does not hold').toBeLessThan(2000)
    // THE THREE FIELDS IT ALWAYS HAD, and none of the hold fields the parameter adds. The server
    // adds `narrowedByPermission` to every reply, so the check is the door's own shape rather than
    // the whole JSON object.
    expect(answer.body['waiting']).toEqual([])
    expect(answer.body['workspaceId']).toBe('default')
    expect(answer.body['note']).toBe(`Nothing is waiting for "${handle}" in any project.`)
    for (const never of ['held', 'heldForSeconds', 'endedBecause', 'capped', 'askedForSeconds']) {
      expect(answer.body[never], `no parameter means no ${never}`).toBeUndefined()
    }
  }, 30_000)

  it('with the parameter and a message already queued, answers at once and says so', async () => {
    const handle = 'waiting-already-queued'
    const agentId = await aFreshAgent(handle)
    const messageId = await sendTheAgent('已经等着的消息', agentId)
    const started = Date.now()
    const answer = await aHoldOn(handle, WAIT_CAP_SECONDS)
    expect(Date.now() - started, 'a hold is only for an empty answer').toBeLessThan(2000)
    expect(answer.body['held']).toBe(false)
    expect(answer.body['endedBecause']).toBe('something was already waiting')
    expect((answer.body['waiting'] as { messageId: string }[]).map((one) => one.messageId)).toContain(messageId)
    expect(answer.body['capped']).toBe(false)
  }, 30_000)

  it('with the parameter and nothing queued, a message written while it is held reaches it', async () => {
    const handle = 'waiting-woken'
    const agentId = await aFreshAgent(handle)
    const started = Date.now()
    const held = aHoldOn(handle, WAIT_CAP_SECONDS)
    // THE HOLD IS REGISTERED BEFORE THE MESSAGE IS WRITTEN, or the message would be an answer to the
    // first read rather than a wake. `waitersHeld` is the registry speaking for itself.
    expect(await until(() => holdLib.waitersHeld() === 1, 5000)).toBe(true)
    // A WAIT OPEN FOR ONE AGENT RECEIVES FOR THAT AGENT ALONE. A second agent with no wait of its own receives nothing,
    // so the person's send to it answers 409, and the letter does not wake the first agent's wait.
    const anotherAgent = await aFreshAgent('waiting-woken-not-this-one')
    await sendTheAgent('这封信不是给正在等的那个', anotherAgent, 409)
    // THE OPEN WAIT RECEIVES, so the person's send answers 201 and not the 409 of an agent nothing receives for.
    const messageId = await sendTheAgent('在你收到消息后', agentId, 201)
    const answer = await held
    expect(answer.status).toBe(200)
    expect(answer.body['held'], 'the server really waited').toBe(true)
    expect(answer.body['endedBecause']).toBe('a message arrived')
    expect((answer.body['waiting'] as { messageId: string }[]).map((one) => one.messageId)).toContain(messageId)
    expect(Date.now() - started, 'and it was woken, not timed out').toBeLessThan(WAIT_CAP_SECONDS * 1000 - 2000)
    // AND ONCE THE REQUEST HAS CLOSED, NOTHING RECEIVES FOR THE AGENT. The same send answers 409.
    expect(await until(() => holdLib.waitersHeld() === 0, 5000), 'the answered wait is let go').toBe(true)
    await sendTheAgent('在你收到消息后', agentId, 409)
  }, 45_000)

  it('a hold that times out answers the empty shape at the cap, and not before', async () => {
    const handle = 'waiting-timed-out'
    await aFreshAgent(handle)
    const held = await aHoldOnTheFakeClock(handle, WAIT_CAP_SECONDS)
    // NOT BEFORE. Twenty-eight seconds in, the request is still open. The cap is thirty.
    await held.moveOn(WAIT_CAP_SECONDS * 1000 - 2000)
    expect(await answeredYet(held.settled), 'the door does not answer before the cap').toBe(false)
    // AT THE CAP. Two seconds more, and the request has answered.
    await held.moveOn(2000)
    expect(await until(held.settled, 5000), 'the door did not answer at the cap').toBe(true)
    const answer = await held.answer
    expect(answer.status).toBe(200)
    expect(answer.body['held']).toBe(true)
    expect(answer.body['endedBecause']).toBe('the cap passed')
    expect(answer.body['waiting'], 'the empty shape it answered before').toEqual([])
    expect(answer.body['note']).toBe(`Nothing is waiting for "${handle}" in any project.`)
  }, 60_000)

  it('a hold whose caller goes away is deregistered, and the next hold still works', async () => {
    const handle = 'waiting-abandoned'
    const agentId = await aFreshAgent(handle)
    const abandoning = new AbortController()
    const first = aHoldOn(handle, WAIT_CAP_SECONDS, abandoning.signal)
    expect(await until(() => holdLib.waitersHeld() === 1, 5000), 'the first hold is registered').toBe(true)
    // THE CALLER GOES AWAY. The request is aborted, the socket closes, and nothing will ever read
    // the answer. The registry must let it go on its own; there is no sweeper that would.
    abandoning.abort()
    await expect(first).rejects.toThrow()
    expect(await until(() => holdLib.waitersHeld() === 0, 5000), 'the abandoned hold was deregistered').toBe(true)

    // AND A SECOND HOLD STILL WORKS, which is the shape of the defect this case exists for: a
    // registry that leaked the abandoned request would still answer this one, but it would grow by
    // one entry per dropped connection until the process held nothing but the dead.
    const second = aHoldOn(handle, WAIT_CAP_SECONDS)
    expect(await until(() => holdLib.waitersHeld() === 1, 5000)).toBe(true)
    const messageId = await sendTheAgent('the second hold still gets this', agentId, 201)
    const answer = await second
    expect(answer.body['endedBecause']).toBe('a message arrived')
    expect((answer.body['waiting'] as { messageId: string }[]).map((one) => one.messageId)).toContain(messageId)
  }, 45_000)

  it('counts every waiting-door call by the hour, so no waiting row is stored one at a time', async () => {
    // PIECE 5 CHANGED THIS CASE, AND IT SAYS SO RATHER THAN PRETENDING OTHERWISE. Criterion U6 makes
    // handle.waiting a folded operation: no waiting-door call writes an `api_calls` row any more, so
    // the old assertion — two instant answers at waits 0 and one hold at waits 1 — can no longer be
    // true. What IS still true is the thing piece 1 built: the door answers at once when nobody asks
    // it to hold and really waits when they do, and both calls are counted where the rows used to be.
    const countFor = (): number =>
      (
        t.client.sqlite
          .prepare("SELECT coalesce(sum(calls), 0) AS n FROM hourly_calls WHERE operation = 'handle.waiting' AND listener = ?")
          .get(THE_PERSON) as { n: number }
      ).n
    const before = countFor()

    const handle = 'waiting-usage-mark'
    const agentId = await aFreshAgent(handle)
    // TWO INSTANT ANSWERS: one with no parameter, one with the parameter but something waiting.
    await get(`/api/handles/${handle}/waiting`)
    await sendTheAgent('this one is answered at once', agentId)
    await aHoldOn(handle, WAIT_CAP_SECONDS)
    // AND ONE THAT REALLY HELD, woken by a message so the case stays short.
    const wokenHandle = 'waiting-usage-mark-woken'
    const wokenAgent = await aFreshAgent(wokenHandle)
    const held = aHoldOn(wokenHandle, WAIT_CAP_SECONDS)
    expect(await until(() => holdLib.waitersHeld() === 1, 5000)).toBe(true)
    await sendTheAgent('wake the hold so its row is written', wokenAgent, 201)
    const answer = await held
    expect(answer.body['held'], 'the server really waited').toBe(true)

    // THE COUNT THE PRODUCT WROTE, read out of hourly_calls. All three calls are counted once an
    // hour for this listener, so the count grows by exactly three.
    expect(await until(() => countFor() === before + 3, 5000)).toBe(true)
    // AND THE OLD ROWS ARE GONE, which is the fold and not an accident of the count above.
    const stored = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM api_calls WHERE operation = 'handle.waiting'")
      .get() as { n: number }
    expect(stored.n, 'a folded waiting call was stored one row each').toBe(0)
  }, 30_000)

  it('the cap cannot be exceeded by asking for more', async () => {
    const handle = 'waiting-over-cap'
    await aFreshAgent(handle)
    const held = await aHoldOnTheFakeClock(handle, 9999)
    // THE TIMER THE SERVER ARMED, not the number the caller asked for and not arithmetic from it:
    // still open two seconds before the cap, and answered at it.
    await held.moveOn(WAIT_CAP_SECONDS * 1000 - 2000)
    expect(await answeredYet(held.settled), 'the door answered before the cap').toBe(false)
    await held.moveOn(2000)
    expect(await until(held.settled, 5000), 'the cap, not the asked-for number').toBe(true)
    const answer = await held.answer
    expect(answer.body['capped'], 'the reply says the number was clamped').toBe(true)
    expect(answer.body['askedForSeconds']).toBe(9999)
    expect(answer.body['endedBecause']).toBe('the cap passed')
  }, 60_000)

  /**
   * THE SECONDS ARE THE CALLER'S, AND THIS IS THE CASE THAT PROVES IT.
   *
   * Every other case above asks for the cap, so all of them would still pass if the server ignored
   * the number and always held for thirty. One agent's bridge gives up on its own request after twelve
   * seconds, so a hold it did not choose would time out or delay its replies: it has to be able to
   * ask for ten and be answered at ten. A short hold measured against the cap is the only thing
   * that tells "the caller chose two" apart from "the server always waits thirty".
   */
  it("holds for the number of seconds the CALLER asked for, and not for the cap", async () => {
    const handle = 'waiting-short-hold'
    await aFreshAgent(handle)
    const started = Date.now()
    const answer = await aHoldOn(handle, 2)
    const took = answer.at - started
    expect(answer.status).toBe(200)
    expect(answer.body['held'], 'it really held').toBe(true)
    expect(answer.body['endedBecause']).toBe('the cap passed')
    expect(answer.body['askedForSeconds'], "the caller's own number").toBe(2)
    expect(answer.body['capped'], 'two seconds is under the cap, so nothing was clamped').toBe(false)
    expect(answer.body['waiting'], 'the empty shape it answered before').toEqual([])
    // MEASURED WALL TIME. It did hold, so it is not an instant answer; and it answered at the
    // caller's two seconds, nowhere near the server's thirty.
    expect(took, 'it did hold').toBeGreaterThanOrEqual(1500)
    expect(took, "it answered at the caller's number and not at the cap").toBeLessThan(10_000)
  }, 30_000)

  /**
   * A BAD `wait` COSTS THE CALLER A HELD ANSWER, NEVER ITS REPLY.
   *
   * The bridges that will send this parameter are other people's programs. A 400 over a query
   * string would stop a waiter dead, which is the opposite of what criterion U7 is for, so anything
   * this door cannot read as a whole number of seconds from one upwards is answered at once — the
   * same three fields a caller sending no parameter has always had.
   */
  it('answers at once, and does not refuse, when wait is not a number of seconds it can use', async () => {
    const handle = 'waiting-bad-parameter'
    await aFreshAgent(handle)
    for (const sent of ['-1', 'abc', '0', '', '1.5']) {
      const started = Date.now()
      const answer = await get(`/api/handles/${handle}/waiting?wait=${encodeURIComponent(sent)}`)
      expect(answer.status, `?wait=${sent} is answered, not refused`).toBe(200)
      expect(Date.now() - started, `?wait=${sent} does not hold`).toBeLessThan(2000)
      expect(answer.body['waiting']).toEqual([])
      expect(answer.body['note']).toBe(`Nothing is waiting for "${handle}" in any project.`)
      for (const never of ['held', 'heldForSeconds', 'endedBecause', 'capped', 'askedForSeconds']) {
        expect(answer.body[never], `?wait=${sent} means no ${never}`).toBeUndefined()
      }
    }
  }, 30_000)
})
