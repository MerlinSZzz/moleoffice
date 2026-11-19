// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECONCILIATION OF THE BROADCAST SCHEDULES READS ONLY THE AGENTS IT CAN CHANGE, AND DOES WHAT IT DID.
 *
 * Round 107 of wave 13y, the third pass over the API's speed. A registration through POST /api/agents/started brings the
 * secretaries' broadcast schedules in step (`syncTheBroadcastSchedules` in src/server/lib/broadcast.ts), and that read
 * the agent record of every registered agent, one statement for each. On the made-up office at the 22 October scale,
 * built by tools/build-a-made-up-office.ts, a registration took 430 ms and 3,065 statements so, and takes 100 ms and 154
 * reading only the secretaries and the agents whose record could hold a schedule.
 *
 * WHAT IS HELD HERE:
 *   1. A reconciliation makes and ends the schedules the reconciliation before the change made and ended, and leaves every
 *      other agent's record as it was. That reconciliation is written out here and read before the call. The office holds
 *      a secretary with no schedule, a secretary with an open one, a worker with an open schedule, a worker with an ended
 *      one, a worker whose open schedule's key is spelt with an escape, and workers with none. Both kinds of call are
 *      held: the one that makes a missing schedule, and the one that only ends.
 *   2. A schedule whose times cannot be read, and a record whose data is not JSON, still stop it with the same error.
 *   3. In an office whose schedules are in step, as a worker's registration meets it, it does not read the record of a
 *      worker whose record holds no schedule. A schedule it writes goes through the door that writes records, which reads
 *      the project's agent records, and that is not changed here.
 *
 * Every agent, record and line here is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const AT = '2026-10-29 12:00:00'
/** A line in a worker's record that holds no schedule, which only a read of that record gives back. */
const NOBODY_CAN_CHANGE_IT = 'A made-up line of a worker whose record holds no schedule'
const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let broadcast: typeof import('../src/server/lib/broadcast.ts')
let anyRecordForAgent: typeof import('../src/server/lib/elevation.ts').anyRecordForAgent
let theSecretaries: typeof import('../src/server/lib/secretariat.ts').theSecretaries
let theRoleCardsAreRead: typeof import('../src/server/lib/roles.ts').theRoleCardsAreRead

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const SECOND_SECRETARY = 'made-up-second-secretary'
const WORKERS = ['made-up-worker-open', 'made-up-worker-ended', 'made-up-worker-escaped', 'made-up-worker-one', 'made-up-worker-two'] as const

/** Each agent's registry id and agent record, and the data its record held when it was filed, by handle. */
const filed = new Map<string, { id: string; record: string; data: Record<string, unknown> }>()

/** What one agent's record holds in a case: a schedule, a schedule whose key is spelt with an escape, none, or no JSON. */
type Holds = { schedule: Record<string, unknown> } | { escaped: Record<string, unknown> } | 'none' | 'not JSON'

const OPEN = { madeAt: '2026-10-28 09:00:00', endedAt: null }
const ENDED = { madeAt: '2026-10-28 09:00:00', endedAt: '2026-10-28 10:00:00' }

/** An office whose schedules are out of step: one secretary lacks one, and two workers hold open ones. */
const OUT_OF_STEP: Record<string, Holds> = {
  [SECRETARY]: { schedule: OPEN },
  [SECOND_SECRETARY]: 'none',
  'made-up-worker-open': { schedule: OPEN },
  'made-up-worker-ended': { schedule: ENDED },
  'made-up-worker-escaped': { escaped: OPEN },
  'made-up-worker-one': 'none',
  'made-up-worker-two': 'none',
}

/** An office whose schedules are in step. */
const IN_STEP: Record<string, Holds> = {
  ...OUT_OF_STEP,
  [SECOND_SECRETARY]: { schedule: OPEN },
  'made-up-worker-open': { schedule: ENDED },
  'made-up-worker-escaped': { escaped: ENDED },
}

/** Writes what each agent's record holds, past the door, from the data it was filed with. */
function theOfficeHolds(holds: Record<string, Holds>): void {
  for (const [handle, one] of Object.entries(holds)) {
    const { record, data } = filed.get(handle)!
    const extra = { ...(data['extra'] as Record<string, unknown> | undefined) }
    delete extra['broadcastSchedule']
    if (one === 'not JSON') {
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{"extra": not JSON', record)
    } else if (one === 'none') {
      writeDataBypassingTheGate(t, record, { ...data, extra })
    } else if ('schedule' in one) {
      writeDataBypassingTheGate(t, record, { ...data, extra: { ...extra, broadcastSchedule: one.schedule } })
    } else {
      const text = JSON.stringify({ ...data, extra: { ...extra, broadcastSchedule: one.escaped } }).replace('"broadcastSchedule"', '"broadcast\\u0053chedule"')
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(text, record)
    }
  }
}

/** Each agent's first agent record's data as stored, by agent id. */
function theStoredRecords(): Map<string, string> {
  const ids = t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id').all() as { id: string }[]
  return new Map(
    ids.flatMap(({ id }) => {
      const found = anyRecordForAgent(id)
      return found === null ? [] : [[id, (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(found.record) as { data: string }).data] as const]
    }),
  )
}

/** What a reconciliation did: the agents it made and ended a schedule for, in id order, or the error that stopped it. */
type WhatItDid = { added: string[]; ended: string[] } | { threw: string }

/**
 * THE RECONCILIATION BEFORE THE CHANGE, written out as it was and read only: every registered agent in id order, its
 * first agent record, and the schedule that record holds. It says what the reconciliation made and ended, and what each
 * schedule it wrote reads afterwards. A schedule written before an error stays written, so those are kept as well.
 */
function theReconciliationBeforeTheChange(createIfMissing: boolean): { did: WhatItDid; after: Map<string, unknown> } {
  const added: string[] = []
  const ended: string[] = []
  const after = new Map<string, unknown>()
  if (!theRoleCardsAreRead()) return { did: { added, ended }, after }
  const wanted = new Set(theSecretaries().map((who) => who.id))
  try {
    for (const row of t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id').all() as { id: string }[]) {
      const found = anyRecordForAgent(row.id)
      if (found === null) continue
      if (t.api.getRecord(found.record) === null) continue
      const held = broadcast.theBroadcastScheduleOf(row.id)
      const isSecretary = wanted.has(row.id)
      if (held === null) {
        if (isSecretary && createIfMissing) {
          added.push(row.id)
          after.set(row.id, { madeAt: AT, endedAt: null })
        }
        continue
      }
      if (!isSecretary && held.endedAt === null) {
        ended.push(row.id)
        after.set(row.id, { ...held, endedAt: AT })
      }
    }
  } catch (error) {
    return { did: { threw: (error as Error).message }, after }
  }
  return { did: { added, ended }, after }
}

function theReconciliationNow(createIfMissing: boolean): WhatItDid {
  try {
    return createIfMissing ? broadcast.syncTheBroadcastSchedules(AT) : broadcast.bringTheBroadcastSchedulesInStep(AT)
  } catch (error) {
    return { threw: (error as Error).message }
  }
}

/** Holds one reconciliation of the office as it stands to the one before the change, and gives back what it did. */
function asTheReconciliationBeforeTheChange(createIfMissing: boolean): WhatItDid {
  const stored = theStoredRecords()
  const before = theReconciliationBeforeTheChange(createIfMissing)
  const now = theReconciliationNow(createIfMissing)
  expect(now).toEqual(before.did)
  const storedAfter = theStoredRecords()
  for (const [id, data] of stored) {
    if (before.after.has(id)) expect(broadcast.theBroadcastScheduleOf(id), id).toEqual(before.after.get(id))
    else expect(storedAfter.get(id), id).toBe(data)
  }
  return now
}

/** Each statement run while `run` runs, with what it gave back, kept statements too. */
function theStatementsOf(run: () => unknown): { sql: string; gave: string }[] {
  type Run = (this: { source: string }, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get', Run>
  const originals = { all: proto.all, get: proto.get }
  const ran: { sql: string; gave: string }[] = []
  for (const method of ['all', 'get'] as const) {
    proto[method] = function (...args) {
      const gave = originals[method].apply(this, args)
      ran.push({ sql: this.source, gave: JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '' })
      return gave
    }
  }
  try {
    run()
  } finally {
    proto.all = originals.all
    proto.get = originals.get
  }
  return ran
}

const idOf = (handle: string) => filed.get(handle)!.id

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  broadcast = await import('../src/server/lib/broadcast.ts')
  anyRecordForAgent = (await import('../src/server/lib/elevation.ts')).anyRecordForAgent
  theSecretaries = (await import('../src/server/lib/secretariat.ts')).theSecretaries
  theRoleCardsAreRead = (await import('../src/server/lib/roles.ts')).theRoleCardsAreRead
  for (const [handle, role] of [[SECRETARY, 'secretary'], [SECOND_SECRETARY, 'secretary'], ...WORKERS.map((one) => [one, 'worker'])] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
    expect(reply.statusCode, `registering ${handle} as ${role}: ${reply.body.slice(0, 300)}`).toBe(201)
    const id = (reply.json() as { agent: { id: string } }).agent.id
    const record = anyRecordForAgent(id)!.record
    filed.set(handle, { id, record, data: t.api.getRecord(record)!.data as Record<string, unknown> })
  }
  const one = filed.get('made-up-worker-one')!
  one.data = { ...one.data, extra: { ...(one.data['extra'] as Record<string, unknown> | undefined), madeUpLine: NOBODY_CAN_CHANGE_IT } }
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a reconciliation of the broadcast schedules', () => {
  it('1a. makes and ends what the reconciliation before the change made and ended, when it makes a missing schedule', () => {
    theOfficeHolds(OUT_OF_STEP)
    expect(theSecretaries().map((who) => who.id).sort()).toEqual([idOf(SECRETARY), idOf(SECOND_SECRETARY)].sort())
    // THE ESCAPE IS READ AS THE KEY: the stored text does not hold the key's name, and the schedule is read through it.
    expect(theStoredRecords().get(idOf('made-up-worker-escaped'))).not.toContain('broadcastSchedule')
    expect(broadcast.theBroadcastScheduleOf(idOf('made-up-worker-escaped'))).toEqual(OPEN)
    const did = asTheReconciliationBeforeTheChange(true)
    expect(did).toEqual({ added: [idOf(SECOND_SECRETARY)], ended: [idOf('made-up-worker-open'), idOf('made-up-worker-escaped')].sort() })
  })

  it('1b. ends what the reconciliation before the change ended, when it only ends', () => {
    theOfficeHolds(OUT_OF_STEP)
    const did = asTheReconciliationBeforeTheChange(false)
    expect(did).toEqual({ added: [], ended: [idOf('made-up-worker-open'), idOf('made-up-worker-escaped')].sort() })
  })

  it('1c. does nothing to an office in step, as the reconciliation before the change did nothing', () => {
    theOfficeHolds(IN_STEP)
    expect(asTheReconciliationBeforeTheChange(true)).toEqual({ added: [], ended: [] })
    expect(asTheReconciliationBeforeTheChange(false)).toEqual({ added: [], ended: [] })
  })

  it('2a. is stopped by a schedule whose times cannot be read, with the same error', () => {
    theOfficeHolds({ ...IN_STEP, 'made-up-worker-ended': { schedule: { ...ENDED, times: ['25:99'] } } })
    expect(asTheReconciliationBeforeTheChange(true)).toMatchObject({ threw: expect.stringContaining('25:99') })
    expect(asTheReconciliationBeforeTheChange(false)).toMatchObject({ threw: expect.stringContaining('25:99') })
  })

  it('2b. is stopped by a record whose data is not JSON, with the same error', () => {
    theOfficeHolds({ ...IN_STEP, 'made-up-worker-two': 'not JSON' })
    expect(asTheReconciliationBeforeTheChange(true)).toHaveProperty('threw')
    expect(asTheReconciliationBeforeTheChange(false)).toHaveProperty('threw')
  })

  it('3. in an office in step, does not read the record of a worker whose record holds no schedule', () => {
    theOfficeHolds(IN_STEP)
    let did: unknown
    const ran = theStatementsOf(() => (did = broadcast.syncTheBroadcastSchedules(AT)))
    expect(did).toEqual({ added: [], ended: [] })
    expect(ran.filter((one) => one.gave.includes(NOBODY_CAN_CHANGE_IT)).map((one) => one.sql)).toEqual([])
    // CONTROL: the reconciliation before the change reads that worker's record and gives the line back.
    const walked = theStatementsOf(() => theReconciliationBeforeTheChange(true))
    expect(walked.filter((one) => one.gave.includes(NOBODY_CAN_CHANGE_IT))).not.toEqual([])
  })
})
