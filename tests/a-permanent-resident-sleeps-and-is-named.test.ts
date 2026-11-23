// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT: THE FACTS AGAINST THE CRITERION, ITS SLEEP, THE MESSAGES ITS SLEEP HOLDS, AND THE REMINDER TO
 * CHOOSE ITS PICTURE AND NAME.
 *
 * Three of the person's decisions say: the criterion, and the reminder after a confirm; a
 * postponed sleep is shown and sent to nobody; and the heartbeat goes on while it sleeps, and
 * non-urgent messages are held until it wakes.
 * The doors are in src/server/api/residents.ts, the rules in src/server/lib/residents.ts and
 * src/server/lib/resident-sleep.ts, the waiter's rule in src/server/api/handles.ts (`whatTheWaiterIsHanded`).
 *
 * WHAT IS PROVED HERE (every name, path and value is made up):
 *   facts     1. compactions are counted from data.compactions on its session records, and the evidence says whether
 *                each part of the criterion is met, and the area named;
 *             2. an agent whose runs reported none reads "not reported", not 0 met, and no area reads "not named".
 *   doors     3. the resident with its own key and the person may sleep and wake it; not a resident, asleep twice and
 *                waking one that is awake are refused, and nothing is written;
 *   held      4. while it sleeps a non-urgent message is not handed to its waiter, does not end a held waiter, and starts
 *                no run; an urgent one is handed; after waking the held ones are handed, in order;
 *   postpone  5. a postponed sleep writes one row and no message, no delivery and no row of what waits on the person;
 *   seen      6. the chat's presence reading carries the sleep line for a resident, with the sleep time its proposal
 *                named, and nothing for an agent that is not one, and the resident's reading carries the sleep, the
 *                heartbeat and the compactions;
 *   naming    7. after the confirm, a row waits on the person and the agent is sent one line; after `named` it goes;
 *   who       8. another agent with its own key, the resident without its key, and the person postponing are refused.
 *
 * MUTATIONS (each after a green control run, then restored; logs in .logs/r46-*):
 *   facts     `compactionsIn` in lib/residents.ts counts 0 for every session        → 1 goes red;
 *   doors     the "already asleep" refusal in `sleepAResident` taken out           → 3 goes red;
 *   held      the asleep filter in `whatTheWaiterIsHanded` dropped (rows = every)  → 4 goes red;
 *   postpone  `postponeASleep` also writes an office line to the person            → 5 goes red;
 *   seen      the `residentSleep` line taken off `participantPresence`             → 6 goes red;
 *   naming    `residentsToBeNamed` no longer asks `resident_named_at IS NULL`      → 7 goes red;
 *   who       `theResidentOrThePerson` lets any agent with its own key act          → 8 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { RESIDENT_TO_BE_NAMED } from '../src/shared/residents.ts'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

async function started(handle: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
  return { id, key }
}
const as = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

/** A session record serving an agent, filed at a moment of the test's choosing. */
function aSession(agentId: string, createdAt: string, data: Record<string, unknown>): void {
  const id = `ses-${Math.random().toString(36).slice(2, 12)}`
  t.client.sqlite
    .prepare(
      "INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) VALUES (?, 'default', ?, ?, ?, 'session', ?, NULL, ?)",
    )
    .run(id, THE_PERSON, createdAt, createdAt, `a made-up run ${id}`, JSON.stringify({ servingAgentId: agentId, ...data }))
}

function count(sql: string, ...args: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...args) as { n: number }).n
}

async function propose(handle: string, area?: string): Promise<Reply> {
  return inject('POST', '/api/residents/proposals', as('sec-made-up'), {
    agentId: handle,
    because: 'It has done steady work here for weeks.',
    ...(area === undefined ? {} : { area }),
    sleepTime: A_SLEEP_TIME,
  })
}

async function confirm(proposalId: string): Promise<Reply> {
  return inject('POST', `/api/residents/proposals/${proposalId}/confirm`, AS_THE_PERSON)
}

/** Propose and confirm, and answer the confirm's reply. */
async function makeAResident(handle: string): Promise<Reply> {
  const proposed = await propose(handle)
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await confirm(String(proposed.json['proposal'].id))
  expect(confirmed.status, confirmed.text).toBe(200)
  return confirmed
}

async function sendTo(handle: string, body: string, urgent = false): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: body.slice(0, 30),
    data: { body, to: [{ kind: 'agent', id: idOf(handle) }], ...(urgent ? { urgent: true } : {}) },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, filed.text).toBe(409)
  return String(filed.json['record'].id)
}

async function theWaiterReads(handle: string, wait?: number): Promise<Reply> {
  return inject('GET', `/api/handles/${handle}/waiting${wait === undefined ? '' : `?wait=${String(wait)}`}`, as(handle))
}

async function waitingOnThePerson(): Promise<{ id: string; kind: string; title: string; act: string }[]> {
  const reply = await inject('GET', '/api/waiting', AS_THE_PERSON)
  expect(reply.status, reply.text).toBe(200)
  return (reply.json['items'] ?? []) as { id: string; kind: string; title: string; act: string }[]
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-made-up', 'secretary')
  for (const handle of ['res-counted', 'res-quiet', 'res-sleeper', 'res-held', 'res-postpone', 'res-seen', 'res-named', 'res-retired', 'res-who', 'not-resident', 'other-one']) {
    await started(handle, 'worker')
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the facts against the decided criterion', () => {
  it('1: counts the compactions its runs reported and says whether each part is met, with the area named', async () => {
    const id = idOf('res-counted')
    aSession(id, '2026-09-01 10:00:00', { compactions: [{ at: '2026-09-01 11:00:00', what: 'auto' }, { at: '2026-09-01 12:00:00' }] })
    aSession(id, '2026-09-02 10:00:00', { compactions: [{ at: '2026-09-02 11:00:00' }, { at: '2026-09-02 12:00:00' }] })
    aSession(id, '2026-09-03 10:00:00', { compactions: [{ at: '2026-09-03 11:00:00' }, { what: 'no moment, so not counted' }] })
    const reply = await propose('res-counted', 'The made-up billing pages')
    expect(reply.status, reply.text).toBe(201)
    const proposal = reply.json['proposal']
    expect(proposal.facts.compactionsReported).toBe(5)
    expect(proposal.area).toBe('The made-up billing pages')
    expect(proposal.criterion).toEqual({
      days: { needed: 3, have: 3, part: 'met' },
      compactions: { needed: 5, have: 5, part: 'met' },
      area: { named: 'The made-up billing pages', part: 'named' },
    })
    const evidence = (t.api.getRecord(proposal.id)!.data['evidence'] as string[]).join(' ')
    expect(evidence).toContain('Days with a run: 3 of 3 needed, met.')
    expect(evidence).toContain('Compactions reported: 5 of 5 needed, met.')
    expect(evidence).toContain('Area of responsibility: The made-up billing pages.')
  })

  it('2: an agent whose runs reported none reads "not reported", below the days is "not met", and no area is "not named"', async () => {
    aSession(idOf('res-quiet'), '2026-09-01 10:00:00', { runtime: 'claude-code' })
    const reply = await propose('res-quiet')
    expect(reply.status, reply.text).toBe(201)
    const proposal = reply.json['proposal']
    expect(proposal.facts.compactionsReported).toBe(0)
    expect(proposal.criterion.days.part).toBe('not-met')
    expect(proposal.criterion.compactions).toEqual({ needed: 5, have: null, part: 'not-reported' })
    expect(proposal.criterion.area).toEqual({ named: null, part: 'not-named' })
    const evidence = (t.api.getRecord(proposal.id)!.data['evidence'] as string[]).join(' ')
    expect(evidence).toContain('No compaction has been reported for its runs.')
    expect(evidence).toContain('No area of responsibility was named.')
    // NOTHING IS REFUSED FOR FALLING SHORT: the person judges with one press.
    expect((await confirm(String(proposal.id))).status).toBe(200)
  })
})

describe('the sleep doors', () => {
  it('3: the resident and the person sleep and wake it; not a resident, asleep twice and awake already are refused', async () => {
    await makeAResident('res-sleeper')
    const id = idOf('res-sleeper')
    const rows = (): number => count('SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ?', id)

    const ofANonResident = await inject('POST', `/api/residents/${idOf('not-resident')}/sleep`, AS_THE_PERSON, {})
    expect(ofANonResident.status, ofANonResident.text).toBe(409)
    expect(ofANonResident.json['error']).toContain('is not a permanent resident')
    expect(count('SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ?', idOf('not-resident'))).toBe(0)

    const awakeAlready = await inject('POST', `/api/residents/${id}/wake`, AS_THE_PERSON)
    expect(awakeAlready.status, awakeAlready.text).toBe(409)

    const slept = await inject('POST', `/api/residents/${id}/sleep`, as('res-sleeper'), { because: 'A made-up night.' })
    expect(slept.status, slept.text).toBe(201)
    expect(slept.json['sleep'].asleep.because).toBe('A made-up night.')
    expect(slept.json['sleep'].asleep.by).toEqual({ kind: 'agent', id })
    expect(rows()).toBe(1)

    const twice = await inject('POST', `/api/residents/${id}/sleep`, AS_THE_PERSON, {})
    expect(twice.status, twice.text).toBe(409)
    expect(twice.json['error']).toContain('is already asleep')
    expect(rows()).toBe(1)

    // WHAT WAS QUEUED FOR IT ALREADY (the office's lines to a new agent and a new resident) is held as well.
    const queued = ((await theWaiterReads('res-sleeper')).json['keptBack'] as number) ?? 0
    await sendTo('res-sleeper', 'A made-up note that can wait.')
    const woke = await inject('POST', `/api/residents/${id}/wake`, AS_THE_PERSON)
    expect(woke.status, woke.text).toBe(200)
    expect(woke.json['held']).toBe(queued + 1)
    expect(woke.json['said']).toContain(`${String(queued + 1)} messages were held for it`)
    expect(woke.json['sleep'].asleep).toBeNull()
    expect(woke.json['sleep'].lastSleepEndedAt).not.toBeNull()

    // THE PERSON MAY PUT IT TO SLEEP TOO.
    const byThePerson = await inject('POST', `/api/residents/${id}/sleep`, AS_THE_PERSON, {})
    expect(byThePerson.status, byThePerson.text).toBe(201)
    expect(byThePerson.json['sleep'].asleep.by).toEqual({ kind: 'person', id: THE_PERSON })
    expect((await inject('POST', `/api/residents/${id}/wake`, as('res-sleeper'))).status).toBe(200)
  })
})

describe('the messages a sleep holds', () => {
  it('4: asleep, a non-urgent message is kept back and starts no run; an urgent one is handed; awake, the kept ones come in order', async () => {
    await makeAResident('res-held')
    const id = idOf('res-held')
    // THE CONFIRM'S OWN LINE TO IT is already queued, and is not urgent, so the sleep keeps it back too.
    const earlier = ((await theWaiterReads('res-held')).json['waiting'] as { messageId: string }[]).map((one) => one.messageId)
    expect(earlier.length, 'the office\u2019s lines to it wait for it').toBeGreaterThan(0)

    expect((await inject('POST', `/api/residents/${id}/sleep`, AS_THE_PERSON, {})).status).toBe(201)
    const first = await sendTo('res-held', 'The first made-up note that can wait.')
    await new Promise((go) => setTimeout(go, 1_100))
    const second = await sendTo('res-held', 'The second made-up note that can wait.')

    const asleep = await theWaiterReads('res-held')
    expect(asleep.status, asleep.text).toBe(200)
    expect(asleep.json['waiting']).toEqual([])
    expect(asleep.json['keptBack']).toBe(earlier.length + 2)
    expect(typeof asleep.json['asleepSince']).toBe('string')
    expect(asleep.json['note']).toContain('is asleep since')

    // A HELD WAITER IS NOT ENDED BY THEM: it answers at its cap, with nothing handed.
    const held = await theWaiterReads('res-held', 2)
    expect(held.json['waiting']).toEqual([])
    expect(held.json['held']).toBe(true)
    expect(held.json['heldForSeconds']).toBeGreaterThanOrEqual(2)

    // THE WORKER STARTS NO RUN FOR THEM: each row says why, and nothing asks the person to start one.
    const queue = (await inject('GET', '/api/worker/queue', AS_THE_PERSON)).json['queue'] as Record<string, unknown>[]
    const mine = queue.filter((one) => one['messageId'] === first || one['messageId'] === second)
    expect(mine).toHaveLength(2)
    for (const one of mine) {
      expect(String(one['heldWhileAsleep'])).toContain('held, unread, until it wakes')
      expect(one['nobodyIsAnsweringAsIt']).toBeNull()
    }

    const urgent = await sendTo('res-held', 'A made-up note that cannot wait.', true)
    const handed = await theWaiterReads('res-held')
    expect((handed.json['waiting'] as { messageId: string }[]).map((one) => one.messageId)).toEqual([urgent])
    expect(handed.json['keptBack']).toBe(earlier.length + 2)
    const urgentRow = ((await inject('GET', '/api/worker/queue', AS_THE_PERSON)).json['queue'] as Record<string, unknown>[]).find(
      (one) => one['messageId'] === urgent,
    )
    expect(urgentRow?.['heldWhileAsleep']).toBeUndefined()

    expect((await inject('POST', `/api/residents/${id}/wake`, AS_THE_PERSON)).status).toBe(200)
    const awake = await theWaiterReads('res-held')
    const order = (awake.json['waiting'] as { messageId: string }[]).map((one) => one.messageId)
    // NOTHING WAS DROPPED OR MARKED READ BY SLEEPING: every kept message is handed now. The door orders by priority
    // as ever (the person's messages before the office's lines), and the two the person sent come in the order sent.
    expect([...order.filter((one) => one !== urgent)].sort()).toEqual([...earlier, first, second].sort())
    expect(order.filter((one) => one === first || one === second)).toEqual([first, second])
    expect(awake.json['asleepSince']).toBeUndefined()
    expect(awake.json['keptBack']).toBeUndefined()
  })
})

describe('a postponed sleep', () => {
  it('5: writes one row, and no message, no delivery and no row of what waits on the person', async () => {
    await makeAResident('res-postpone')
    const id = idOf('res-postpone')
    const messages = (): number => count("SELECT count(*) AS n FROM records WHERE kind = 'message'")
    const deliveries = (): number => count('SELECT count(*) AS n FROM message_delivery')
    const before = { messages: messages(), deliveries: deliveries(), waiting: (await waitingOnThePerson()).length }

    const postponed = await inject('POST', `/api/residents/${id}/sleep/postpone`, as('res-postpone'), { because: 'A made-up deadline tonight.' })
    expect(postponed.status, postponed.text).toBe(201)
    expect(postponed.json['sleep'].postponedInAll).toBe(1)
    expect(postponed.json['sleep'].postponements[0].because).toBe('A made-up deadline tonight.')
    expect(count("SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ? AND what = 'postponed'", id)).toBe(1)

    expect(messages()).toBe(before.messages)
    expect(deliveries()).toBe(before.deliveries)
    expect((await waitingOnThePerson()).length).toBe(before.waiting)

    const noReason = await inject('POST', `/api/residents/${id}/sleep/postpone`, as('res-postpone'), { because: '  ' })
    expect(noReason.status, noReason.text).toBe(400)
  })
})

describe('where its sleep is seen', () => {
  it('6: the chat reads the sleep line on the presence it already reads, and the resident reading carries the rest', async () => {
    await makeAResident('res-seen')
    const id = idOf('res-seen')
    const presence = async (who: string): Promise<Record<string, any>> =>
      (await inject('GET', `/api/presence/agent/${who}`, AS_THE_PERSON)).json['presence'] as Record<string, any>

    expect(await presence(id)).toHaveProperty('residentSleep', { asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: A_SLEEP_TIME })
    expect(await presence(idOf('not-resident'))).not.toHaveProperty('residentSleep')

    const slept = await inject('POST', `/api/residents/${id}/sleep`, AS_THE_PERSON, {})
    const since = String(slept.json['sleep'].asleep.since)
    expect((await presence(id))['residentSleep']).toEqual({ asleepSince: since, lastSleptAt: null, wakesAt: null, sleepTime: A_SLEEP_TIME })
    const listed = (await inject('GET', `/api/presence?of=agent:${id}`, AS_THE_PERSON)).json['presence'] as Record<string, any>[] | Record<string, any>
    expect(JSON.stringify(listed)).toContain(since)

    const woke = await inject('POST', `/api/residents/${id}/wake`, AS_THE_PERSON)
    const ended = String(woke.json['sleep'].lastSleepEndedAt)
    expect((await presence(id))['residentSleep']).toEqual({ asleepSince: null, lastSleptAt: ended, wakesAt: null, sleepTime: A_SLEEP_TIME })

    aSession(id, '2026-09-04 10:00:00', { compactions: [{ at: '2026-09-04 11:00:00' }] })
    const reading = await inject('GET', `/api/residents/${id}`, AS_THE_PERSON)
    expect(reading.status, reading.text).toBe(200)
    expect(reading.json['resident'].sleep.lastSleepEndedAt).toBe(ended)
    expect(reading.json['resident'].sleep.recorded).toBe(true)
    expect(reading.json['resident'].compactionsReported).toBe(1)
    expect(reading.json['resident'].heartbeat.state).toBeTypeOf('string')
  })
})

describe('the picture-and-name reminder', () => {
  it('7: after the confirm a row waits on the person and the agent is sent one line; after `named` the row goes', async () => {
    const confirmed = await makeAResident('res-named')
    const id = idOf('res-named')
    expect(confirmed.json['reminder'].person).toBe('waiting')
    expect(confirmed.json['reminder'].agent.sent).toBe(true)
    const line = t.api.getRecord(String(confirmed.json['reminder'].agent.messageId))!
    expect(JSON.stringify(line.data)).toContain(`/api/participants/agent/${id}/avatar`)
    expect(count('SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_id = ?', line.id, id)).toBe(1)

    const row = (await waitingOnThePerson()).find((one) => one.kind === RESIDENT_TO_BE_NAMED && one.id === id)
    expect(row, 'the reminder row is on the person’s list').toBeDefined()
    expect(row!.title).toBe('Choose a picture and a name for res-named, now a permanent resident')
    expect(row!.act).toBe('name-resident')

    const byAnother = await inject('POST', `/api/residents/${id}/named`, as('other-one'))
    expect(byAnother.status, byAnother.text).toBe(403)
    expect((await waitingOnThePerson()).some((one) => one.kind === RESIDENT_TO_BE_NAMED && one.id === id)).toBe(true)

    const named = await inject('POST', `/api/residents/${id}/named`, as('res-named'))
    expect(named.status, named.text).toBe(200)
    expect(named.json['naming'].namedBy).toEqual({ kind: 'agent', id })
    expect((await waitingOnThePerson()).some((one) => one.kind === RESIDENT_TO_BE_NAMED && one.id === id)).toBe(false)

    const again = await inject('POST', `/api/residents/${id}/named`, AS_THE_PERSON)
    expect(again.status, again.text).toBe(409)

    // A RETIRED RESIDENT IS NO LONGER "NOW A PERMANENT RESIDENT": its reminder leaves the list, though nobody named it.
    await makeAResident('res-retired')
    const retiredId = idOf('res-retired')
    expect((await waitingOnThePerson()).some((one) => one.kind === RESIDENT_TO_BE_NAMED && one.id === retiredId)).toBe(true)
    const retired = await inject('POST', '/api/participants/agent/res-retired/retire', AS_THE_PERSON, { because: 'A made-up reason.' })
    expect(retired.status, retired.text).toBe(200)
    expect((await waitingOnThePerson()).some((one) => one.kind === RESIDENT_TO_BE_NAMED && one.id === retiredId)).toBe(false)
  })
})

describe('who may act on a resident', () => {
  it('8: another agent with its own key, the resident without its key, and the person postponing are refused', async () => {
    await makeAResident('res-who')
    const id = idOf('res-who')
    const rows = (): number => count('SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ?', id)

    const byAnother = await inject('POST', `/api/residents/${id}/sleep`, as('other-one'), {})
    expect(byAnother.status, byAnother.text).toBe(403)
    const noKey = await inject('POST', `/api/residents/${id}/sleep`, asAgent('res-who'), {})
    expect(noKey.status, noKey.text).toBe(403)
    const postponedByThePerson = await inject('POST', `/api/residents/${id}/sleep/postpone`, AS_THE_PERSON, { because: 'A made-up reason.' })
    expect(postponedByThePerson.status, postponedByThePerson.text).toBe(403)
    const postponedByAnother = await inject('POST', `/api/residents/${id}/sleep/postpone`, as('other-one'), { because: 'A made-up reason.' })
    expect(postponedByAnother.status, postponedByAnother.text).toBe(403)
    expect(rows()).toBe(0)

    expect((await inject('POST', `/api/residents/${id}/sleep`, as('res-who'), {})).status).toBe(201)
    const wokenByAnother = await inject('POST', `/api/residents/${id}/wake`, as('other-one'))
    expect(wokenByAnother.status, wokenByAnother.text).toBe(403)
    expect(count('SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ? AND ended_at IS NULL', id)).toBe(1)
  })
})
