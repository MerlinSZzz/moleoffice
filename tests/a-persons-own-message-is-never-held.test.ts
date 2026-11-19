// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * THE LOOP GUARD NEVER HOLDS A MESSAGE A PERSON WROTE.
 *
 * Problem `Oa-URN8oEQbZ`, found by the verifier of messages part 2e on 4 September 2026. The guard
 * that bounds a conversation counted the messages agents had written by the time the queue was read,
 * and never asked who had written the message it was judging. The worker starts a bounded number of
 * runs at once, so a person's message waits in the queue while runs started before it are still
 * writing. By the time it was looked at, those runs had said enough to trip the guard, and the person's own
 * message was held with *Agents have written 4 messages in this conversation since a person last
 * wrote … Nothing more is started here until a person writes something* beside it. A person had written it.
 *
 * WHY IT MATTERS MORE THAN ITS SIZE. A person's message is the only thing that sets the count back
 * to nothing, so a guard that can hold one can make the way out of a stopped conversation
 * unreachable. And the sentence a person then reads on their own row is false about that row, which
 * is invariant 1 of USER.md at the place they are actually reading.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server is real and listening; the group, the messages, the
 * delivery rows and the system lines are all real rows, and the worker is the real one. The agent
 * tool is `tests/fake-runtime.mjs`, a real process that prints a reply and exits. Nothing here
 * spends a model call.
 *
 * HOW THE RACE IS MADE TO HAPPEN ON PURPOSE. On the stack where this was measured, the messages that
 * landed after the owner's came from runs that were already going. Here the two agents write them
 * straight into the group, which is the same rows in the same order and needs no timing to hold.
 *
 * Criteria M9 and M11 of design/messages/ACCEPTANCE.md.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
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

/** The limit this file is written against, set in the environment below so the server reads the same. */
const ALLOWED = 3

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * The headers one agent writes with. They name the agent by its handle, which the office reads as
 * that agent. Its registry id is a different string, given to it when it was registered.
 */
function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
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

/** What the queue says about every message waiting for a run. */
interface QueueEntry {
  messageId: string
  to: { kind: string; id: string }
  needsNoRun: string | null
  conversationIsWaiting: string | null
}

async function theQueue(): Promise<QueueEntry[]> {
  const read = (await get('/api/worker/queue')) as { queue?: QueueEntry[] }
  return read.queue ?? []
}

/** How far one message got with one recipient, and what the row says about it. */
async function delivery(messageId: string, who: string): Promise<{ mark: string; because: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { to: { id: string }; mark: string; because: string | null }[] }
  }
  return one(
    (read.message?.deliveries ?? []).filter((row) => row.to.id === who),
    `a delivery row of ${messageId} for ${who}`,
  )
}

/** Everything said in one group, oldest first. */
async function said(groupId: string): Promise<{ id: string; body: string; sentBy: { id: string } | null }[]> {
  const read = (await get(`/api/groups/${groupId}`)) as {
    messages?: { id: string; body: string; sentBy: { id: string } | null }[]
  }
  return read.messages ?? []
}

/** Write one message into a group, as whoever the headers say. */
/**
 * AND THE PERSON PRESSES TO START AN AGENT FOR IT, because these cases are about something else.
 *
 * Criterion M78: a message that would be answered by starting a NEW agent — one with no
 * conversation of its own here to pick up — waits for the person's press. Every agent in this file
 * is fresh, so the first message to each of them is one of those. The press is what the chat offers
 * the person; here it is done in the setup so that what is measured below is the rule each case is about
 * and not the press. It is sent as the person because it is refused to an agent.
 */
async function intoTheGroup(groupId: string, body: string, headers: Record<string, string>): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'message', title: body.slice(0, 60), data: { body, toGroup: groupId } },
    headers,
  )
  const record = filed['record'] as { id?: string } | undefined
  if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 300)}`)
  await post(`/api/messages/${record.id}/start-an-agent`, {})
  return record.id
}

/** Run passes until nothing is going any more, so a later pass judges a still world. */
async function untilEveryRunHasEnded(within = 20_000): Promise<void> {
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
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-person-held-'))
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

describe('the owner writes into a group whose agents have already said as much as they may', () => {
  let groupId: string
  let alpha: string
  let beta: string
  let their = ''

  it('stops the two agents once they have said more than this installation allows', async () => {
    alpha = await anAgent('held-alpha')
    beta = await anAgent('held-beta')
    const opened = await post('/api/groups', {
      name: 'The gripper module',
      because: 'two agents are changing the same file',
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

    // FOUR MESSAGES FROM THE AGENTS, one past the three allowed. They are written straight into the
    // group, which is what a run's answer is: a message record with `toGroup` on it.
    for (const round of [1, 2]) {
      await intoTheGroup(groupId, `Alpha, round ${String(round)}.`, asAgent('held-alpha'))
      await intoTheGroup(groupId, `Beta, round ${String(round)}.`, asAgent('held-beta'))
    }
    const byAgents = (await said(groupId)).filter((line) => line.sentBy !== null && [alpha, beta].includes(line.sentBy.id))
    expect(byAgents.length, 'the exchange this block is about').toBe(4)

    const here = new Set((await said(groupId)).map((line) => line.id))
    const waiting = (await theQueue()).filter((entry) => here.has(entry.messageId) && entry.needsNoRun === null)
    expect(waiting.length, 'each agent is waiting on what the other said').toBeGreaterThan(0)
    for (const entry of waiting) {
      expect(entry.conversationIsWaiting, `the queue entry for ${entry.messageId}`).toContain(
        'Nothing more is started here until a person writes something',
      )
    }
    const report = await onePass(settings, watching)
    expect(report.started, 'the guard is on before the owner writes anything').toEqual([])
  }, 60_000)

  /**
   * THE RACE, MADE TO HAPPEN ON PURPOSE. The owner's message is written, and then four more agent
   * messages land in the group behind it — which on a real stack is the runs that were already going
   * finishing their work. The owner's message is still queued for both agents while that happens.
   */
  it('leaves the count at four, because the person’s message set it back and the agents filled it again', async () => {
    their = await intoTheGroup(groupId, 'The owner, reading this and asking them both to carry on.', AS_THE_OWNER)
    for (const round of [3, 4]) {
      await intoTheGroup(groupId, `Alpha, round ${String(round)}.`, asAgent('held-alpha'))
      await intoTheGroup(groupId, `Beta, round ${String(round)}.`, asAgent('held-beta'))
    }
    const byAgents = (await said(groupId)).filter((line) => line.sentBy !== null && [alpha, beta].includes(line.sentBy.id))
    expect(byAgents.length, 'eight messages from the agents in all, four of them after the person’s message').toBe(8)

    const mine = (await theQueue()).filter((entry) => entry.messageId !== their && entry.needsNoRun === null)
    const held = mine.filter((entry) => entry.conversationIsWaiting !== null)
    expect(held.length, 'the agents are still held, since the guard is about what they wrote').toBeGreaterThan(0)
    for (const entry of held) {
      expect(entry.conversationIsWaiting, 'the person’s message set the count back to nothing').toContain(
        'Agents have written 4 messages in this conversation since a person last wrote',
      )
    }
  }, 60_000)

  it('says nothing about waiting on the rows of the message the person wrote', async () => {
    const mine = (await theQueue()).filter((entry) => entry.messageId === their)
    expect(mine.map((entry) => entry.to.id).sort(), 'the person’s message is queued for both agents').toEqual(
      [alpha, beta].sort(),
    )
    for (const entry of mine) {
      expect(entry.conversationIsWaiting, `the queue entry for the person’s message, for ${entry.to.id}`).toBeNull()
    }
  })

  it('starts a run of each agent for it, and the marks move to delivered', async () => {
    const report = await onePass(settings, watching)
    // A PASS REPORT NAMES EACH AGENT IT STARTED BY ITS HANDLE, not by its registry id.
    expect(report.started.map((r) => r.agent).sort(), 'a person writing to a group reaches every agent in it').toEqual(
      ['held-alpha', 'held-beta'],
    )
    expect(report.started.every((r) => r.messageId === their), 'the only thing started is the person’s message').toBe(true)
    for (const who of [alpha, beta]) {
      const stands = await delivery(their, who)
      expect(stands.mark, 'the person’s message reached both of them').toBe('delivered')
      expect(String(stands.because ?? '')).not.toContain('until a person writes something')
    }
    await untilEveryRunHasEnded()
  }, 60_000)

  /**
   * AND THE ANNOUNCING HALF OF THE GUARD ASKS THE SAME QUESTION.
   *
   * `POST /worker/messages/:id/held` writes the sentence on the row and then asks whether the group
   * should be told its agents are waiting. It asks the stored conversation rather than the caller,
   * so a guard that held a person's message would also write a line into the group saying the agents
   * had said as much as they may — because the person wrote something.
   */
  it('tells the group nothing when a message the person wrote is put to the door that holds one', async () => {
    const before = (await said(groupId)).filter((line) => line.body === SYSTEM_LINES.agentsAreWaitingForAPerson.line).length
    const second = await intoTheGroup(groupId, 'The owner again, a second time.', AS_THE_OWNER)
    // AND THE SAME RACE AGAIN, so the question this door asks is a real one: without these the count
    // would stand at nothing because the owner's message is the newest thing in the group.
    for (const round of [5, 6]) {
      await intoTheGroup(groupId, `Alpha, round ${String(round)}.`, asAgent('held-alpha'))
      await intoTheGroup(groupId, `Beta, round ${String(round)}.`, asAgent('held-beta'))
    }
    const answer = await post(`/api/worker/messages/${second}/held`, {
      to: { kind: 'agent', id: alpha },
      because: 'The worker asking what to say about a message a person wrote.',
    })
    const group = answer['group'] as { written?: boolean; because?: string } | undefined
    expect(group?.written, 'a message a person wrote is not held, so there is nothing to announce').toBe(false)
    expect(String(group?.because)).toContain('This conversation may still run')
    const after = (await said(groupId)).filter((line) => line.body === SYSTEM_LINES.agentsAreWaitingForAPerson.line).length
    expect(after, 'no line about waiting may be written because a person wrote something').toBe(before)
  }, 60_000)
})
