// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M111 — A WILD MESSAGE BECOMES A DEAD LETTER, AND THE OFFICE BROADCASTS THE BACKLOG.
 *
 * design/messages/ACCEPTANCE.md, "The retire rule and dead letters": a message nobody receives is kept as a dead
 * letter, and after a time (such as a week) or a number (such as more than 10) the backlog is broadcast to
 * every secretary in a group, where each claims its own. Such a message is kept as a dead
 * letter. The thresholds come from the office settings.
 * Above either limit the standing group keeps a claim per addressee. The sweep notice is private to
 * the named secretary; with nobody qualified it is kept without recipients.
 *
 * The group holds the claim list; the private notice carries the count; a claim is per addressee — the agent the letters were
 * for — not per letter; the first broadcast after the build covers the backlog as one group. This
 * file proves the sweep and the broadcast. The claim is proved in
 * tests/a-secretary-claims-dead-letters-per-addressee.test.ts, and the press that makes the sweep run
 * in tests/the-worker-presses-the-dead-letter-sweep-each-pass.test.ts.
 *
 * A DEAD LETTER IS ITS DELIVERY ROW. Nothing here stores a letter: a message queued for an agent the
 * office's own presence reading says cannot receive it — asked directly, NOT behind M110's
 * send-door setting, because the backlog this exists to hand over (633 letters on 11 September,
 * retired or holding no live handle) is grey, and gating this on the send-door setting would leave
 * it unbroadcast for ever.
 *
 * Mutation: in src/server/lib/deadletters.ts, `sweepDeadLetters`, change
 * `if (fresh.length > countLimit || ageDays >= daysLimit) {` to `if (true) {` — the threshold can
 * never hold the broadcast back — and the under-threshold cases below go red: letters that have sat
 * a moment and number one are broadcast as if a day's worth had piled up.
 *
 * A sweep writes ONE notice, with the per-addressee counts
 * in its full sentence, and it is delivered only to the secretary the person named to take the dead
 * letters. Nobody is named in this file, so the line is delivered to nobody. The rules for a retired
 * addressee are in tests/the-message-centre-handles-the-dead-letters-itself.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { deadLetterAfterCount } from '../src/server/lib/env.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { theDeadLetterSweepInWords } from '../src/shared/dead-letter-lines.ts'
import type { MessageOnTheWire } from '../src/shared/messages.ts'

let t: TestDb
let app: FastifyInstance
// The registry ids the registrations answered. A new agent's id is not its handle, and a dead
// letter's addressee is stored by the id.
let argusId: string
let wOneId: string
let wTwoId: string
let lettersPastTheCount: number
let claimGroupId: string
let claimGroupName: string

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function get(path: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
}

/** Queue one message for the grey agent, as the person, whose sends are never refused by M110. */
async function aLetterTo(handle: string, body: string): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: handle }] } },
    AS_THE_PERSON,
  )
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.code, `the letter was refused: ${JSON.stringify(filed.said).slice(0, 300)}`).toBe(409)
  return ((filed.said as { record: { id: string } }).record).id
}

interface SweepSaid {
  groupId: string | null
  addressees: string[]
  because: string
}

async function sweep(): Promise<SweepSaid> {
  const { said } = await post('/api/dead-letters/sweep', {}, AS_THE_PERSON)
  return said as unknown as SweepSaid
}

beforeAll(async () => {
  t = await freshDb()
  lettersPastTheCount = deadLetterAfterCount() + 1
  const built = await apiApp()
  app = built.app
  await app.ready()
  // The test office's secretary holds the secretary card; w-one is registered and nothing is serving it, so its letters
  // are dead from the moment they are queued.
  // The secretary is registered BY THE PERSON, as every first registration is; the rest are registered by
  // the secretary, which is the ordinary shape of a supervisor starting a worker.
  const idOf = (said: Record<string, unknown>): string => (said as { agent: { id: string } }).agent.id
  argusId = idOf((await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }, AS_THE_PERSON)).said)
  wOneId = idOf((await post('/api/agents/started', { handle: 'w-one', name: 'Worker One', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).said)
  wTwoId = idOf((await post('/api/agents/started', { handle: 'w-two', name: 'Worker Two', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).said)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the threshold is measured before anything is broadcast', () => {
  it('one fresh letter is below the current age and count thresholds, so nothing was broadcast', async () => {
    await aLetterTo('w-one', 'A wild message nobody received')
    const said = await sweep()
    expect(said.groupId).toBeNull()
    expect(said.addressees).toEqual([])
    expect(said.because).toContain('dead letter')
    expect(said.because).toContain('nothing was broadcast yet')
  })

  it('GET /api/dead-letters lists the letter and its addressee, with when and to whom', async () => {
    const listed = (await get('/api/dead-letters', AS_THE_PERSON)) as {
      letters: { messageId: string; at: string; to: { id: string }; because: string }[]
      addressees: { agentId: string; count: number }[]
      claims: unknown[]
    }
    expect(listed.letters).toHaveLength(1)
    expect(listed.letters[0]?.to.id).toBe(wOneId)
    expect(listed.letters[0]?.at).toBeTruthy()
    expect(listed.letters[0]?.because).toContain('No process of this agent is running')
    expect(listed.addressees).toEqual([{ agentId: wOneId, count: 1, oldestAt: listed.letters[0]?.at }])
    expect(listed.claims).toEqual([])
  })
})

describe('past the threshold, the group keeps the claims and the sweep notice is private', () => {
  it('letters cross the current count, and claims belong to the one standing group', async () => {
    for (let n = 2; n <= lettersPastTheCount; n++) await aLetterTo('w-one', `Wild message ${String(n)}`)
    const said = await sweep()
    expect(said.groupId).not.toBeNull()
    expect(said.addressees).toEqual([wOneId])
    const groups = (await get('/api/groups', AS_THE_PERSON)) as {
      groups: { id: string; name: string; members: { who: { id: string } }[]; openedBy: { id: string } }[]
    }
    const group = (groups.groups ?? []).find((one) => one.id === said.groupId)
    // THE ONE STANDING GROUP, not a group opened for the occasion. The rule:
    // an office-wide notice is said in the Secretariat group, once.
    expect(group).toBeDefined()
    claimGroupId = group!.id
    claimGroupName = group!.name
    expect(group?.openedBy.id).toBe(moleOffice().id)
    expect((group?.members ?? []).map((one) => one.who.id)).toContain(argusId)
  })

  it('the sweep keeps one recipientless notice when no secretary is named, with the count and each addressee', async () => {
    const groups = (await get('/api/groups', AS_THE_PERSON)) as { groups: { id: string; name: string }[] }
    const group = groups.groups.find((one) => one.id === claimGroupId)!
    expect(group.name).toBe(claimGroupName)
    const read = (await get(`/api/groups/${group.id}`, AS_THE_PERSON)) as { messages: MessageOnTheWire[] }
    expect(read.messages.filter((one) => one.notice === 'deadLetterSweep')).toEqual([])
    const listed = (await get('/api/messages?full=1', AS_THE_PERSON)) as { messages: MessageOnTheWire[] }
    const lines = listed.messages.filter((one) => one.notice === 'deadLetterSweep')
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect(line.sentBy?.id).toBe(moleOffice().id)
    expect(line.toGroup).toBeNull()
    expect(line.to).toEqual([])
    const facts = line.deadLetterSweepSaid!
    expect(facts.broadcast).toMatchObject({ letters: lettersPastTheCount, addressees: [{ name: 'w-one', count: lettersPastTheCount }] })
    expect(facts.deliveredTo).toMatchObject({ why: { no: 'nobody named', because: 'nobody chose' } })
    expect(line.saidInFull).toBe(theDeadLetterSweepInWords(facts, sayInEnglish))
    const rows = t.client.sqlite.prepare('SELECT recipient_id FROM message_delivery WHERE message_id = ?').all(line.id)
    expect(rows, 'no secretary was named, so the retained explanation reaches nobody').toEqual([])
  })

  it('each addressee is named once, unclaimed, and the letters themselves are not moved', async () => {
    const listed = (await get('/api/dead-letters', AS_THE_PERSON)) as {
      letters: { messageId: string; at: string }[]
      claims: { agentId: string; groupId: string; claimedAt: string | null; claimedBy: string | null }[]
    }
    expect(listed.claims).toHaveLength(1)
    expect(listed.claims[0]?.agentId).toBe(wOneId)
    expect(listed.claims[0]?.groupId).toBeTruthy()
    expect(listed.claims[0]?.claimedAt).toBeNull()
    expect(listed.claims[0]?.claimedBy).toBeNull()
    expect(listed.letters).toHaveLength(lettersPastTheCount)
  })

  it('a second sweep broadcast nothing more: an addressee is named once, ever', async () => {
    const said = await sweep()
    expect(said.groupId).toBeNull()
    expect(said.addressees).toEqual([])
    expect(said.because).toContain('No dead letter is waiting to be broadcast')
  })

  it('new letters for an addressee already named are not broadcast again', async () => {
    await aLetterTo('w-one', 'One more, after the broadcast')
    const said = await sweep()
    expect(said.groupId).toBeNull()
    expect(said.addressees).toEqual([])
  })

  it('new letters for a NEW addressee are named in the same group, never a second one', async () => {
    for (let n = 1; n <= lettersPastTheCount; n++) await aLetterTo('w-two', `Another agent's wild message ${String(n)}`)
    const said = await sweep()
    expect(said.groupId).toBeTruthy()
    expect(said.addressees).toContain(wTwoId)
    const groups = (await get('/api/groups', AS_THE_PERSON)) as { groups: { id: string; name: string }[] }
    expect(said.groupId).toBe(claimGroupId)
    expect((groups.groups ?? []).filter((one) => one.id === claimGroupId).map(one => one.name)).toEqual([claimGroupName])
    const claims = (await get('/api/dead-letters', AS_THE_PERSON)) as { claims: { agentId: string }[] }
    expect((claims.claims ?? []).map((one) => one.agentId).sort()).toEqual([wOneId, wTwoId].sort())
  })
})