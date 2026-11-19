// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERIODIC MAIN-SUITE JOB IS REGISTERED, REQUESTED BY A COUNTER, AND LEFT FOR ITS RUNNER.
 *
 * These criteria use a fresh office database and its own API instance. The clock below enters the
 * counter's exported one-tick seam; it never starts the counter watcher or a producer.
 *
 * THE SCHEDULE (step 1b): the whole suite runs on main every 2 hours or every 6 landings, whichever
 * comes first, and both numbers are settings. The counter follows landings on the main checkout, so
 * its 2-hour trigger waits for at least one landing: the suite runs only when main has moved.
 * MUTATIONS: the counter made without its landing follow: the last case red. The two settings'
 * defaults swapped: the first two cases red.
 */

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { MAIN_SUITE_JOB } from '../src/config/main-suite-job.mjs'
import { readSetting } from '../src/config/settings.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const EXPECTED_MAIN_SUITE_JOB = 'main-suite.periodic' as const
const JOB_NAME = MAIN_SUITE_JOB
const START = new Date('2026-10-13T09:00:00')
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const KEEPER = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'main-suite-counter-test' }

type CounterReply = {
  counter: {
    action: { kind: string; job?: string; words: string }
    createdAt: string
    nextDue: { at: string; trigger: number; because?: string } | null
    triggers: { kind: string; hours?: number; holdsNow: boolean }[]
    heldBack: { at: string; until: string } | null
  }
  rows: {
    at: string
    what: string
    answer?: { kind: string; job?: string; ids: string[]; says: string; finished: boolean }
  }[]
}

let db: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
let jobs: typeof import('../src/server/lib/office-jobs.ts')
let records: typeof import('../src/server/lib/records.ts')
let mergeDoor: typeof import('../src/server/lib/merge-entry-door.ts')

type TheSchedule = {
  mainSuiteSchedule: (env: Record<string, string>) => { landings: number; hours: number }
  mainSuiteCounter: (lane: string, env: Record<string, string>) => Record<string, unknown>
}
// A variable import keeps this criterion compilable before the two functions land.
const jobPath = '../src/config/main-suite-job.mjs'
const theSchedule = async (): Promise<TheSchedule> => (await import(jobPath)) as TheSchedule
const LANE = `${THE_TEST_FIXTURE_ROOT}/PROJECTS/main-checkout`
const THE_KEEPER = { type: 'agent', id: 'main-suite-counter-test' } as const

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  db = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  jobs = await import('../src/server/lib/office-jobs.ts')
  records = await import('../src/server/lib/records.ts')
  mergeDoor = await import('../src/server/lib/merge-entry-door.ts')
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: PERSON,
    payload: { handle: 'main-suite-counter-test', name: 'Synthetic main-suite counter test' },
  })
  expect(started.statusCode, started.body).toBe(201)

  // Jobs fire only in the database that identifies itself as the office. Make this fresh absolute
  // database its own synthetic home office; a copied world would correctly hold its job request.
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  const identity = world.theWorldThisDatabaseIs()
  expect(identity, 'the fresh test database has no identity for its home-world row').not.toBeNull()
  office.registerWorldHere({
    name: 'synthetic main-suite test office',
    purpose: null,
    handback: null,
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    head: 'abc1234',
    databaseIdentity: identity ?? '',
    address: 'http://127.0.0.1:41700',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'this-installation',
  })
  expect(office.theOfficeIsInThisDatabase()).toBe(true)
})

afterEach(async () => {
  vi.useRealTimers()
  await app?.close()
  db?.close()
})

async function postCounter(hours = 2.5): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/counters',
    headers: KEEPER,
    payload: {
      title: `Synthetic periodic suite every ${String(hours)} hours`,
      counts: 'Periodic requests for the main-suite job.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours }],
      action: { kind: 'job', job: MAIN_SUITE_JOB },
    },
  })
  expect(response.statusCode, response.body).toBe(201)
  return (JSON.parse(response.body) as { counter: { id: string } }).counter.id
}

async function readCounter(id: string): Promise<CounterReply> {
  const response = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: PERSON })
  expect(response.statusCode, response.body).toBe(200)
  return JSON.parse(response.body) as CounterReply
}

function tickAt(when: Date): ReturnType<typeof counters.fireTheCountersThatAreDue> {
  vi.setSystemTime(when)
  return counters.fireTheCountersThatAreDue(when)
}

/** One made-up landing on main, at the moment given. */
function aLanding(name: string, at: Date): void {
  mergeDoor.asTheMergeQueue(() =>
    records.createRecord({
      kind: 'merge_entry',
      title: `A made-up landing: ${name}`,
      workspaceId: 'default',
      data: {
        run: `run-${name}`,
        seal: { id: `seal-${name}`, hash: 'h' },
        changeset: { adapter: 'git', root: LANE, repository: 'r', branch: name, commit: `c-${name}`, base: 'b' },
        state: 'merged',
        submittedBy: { kind: 'agent', id: THE_KEEPER.id },
        integration: { result: `c-${name}`, mainAt: 'main', files: { 'src/a-file.ts': 'a-hash' }, at: localStamp(at) },
        integrated: { entry: name, mainBefore: 'main', mainAfter: 'main2', at: localStamp(at) },
      },
      actor: THE_KEEPER,
    }),
  )
}

describe('the main-suite job registration', () => {
  it('registers the canonical job and only requests work', async () => {
    expect(MAIN_SUITE_JOB).toBe(EXPECTED_MAIN_SUITE_JOB)
    const registered = jobs.theOfficeJobNamed(JOB_NAME)
    expect(registered).toMatchObject({ name: EXPECTED_MAIN_SUITE_JOB, what: expect.any(String) })
    expect(registered?.what).toMatch(/whole suite.*main/i)

    const id = await postCounter()
    expect(tickAt(new Date('2026-10-13T11:30:00')).fired).toEqual([id])
    const requested = await readCounter(id)
    expect(requested.rows).toHaveLength(1)
    expect(requested.rows[0]).toMatchObject({
      what: 'firing',
      at: localStamp(new Date('2026-10-13T11:30:00')),
      answer: {
        kind: 'job',
        job: MAIN_SUITE_JOB,
        ids: [],
        finished: false,
      },
    })
    expect(requested.rows[0]?.answer?.says).toBe(counters.aJobWaitsForItsRunner(MAIN_SUITE_JOB))

    // With every registered job removed, the refusal describes the empty list and says how to add one.
    for (const job of jobs.theOfficeJobs()) jobs.forgetAnOfficeJob(job.name)
    const refused = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: KEEPER,
      payload: {
        title: 'Synthetic counter for an empty job list',
        counts: 'Requests that need an office job.',
        triggers: [{ kind: 'count', n: 1 }],
        action: { kind: 'job', job: MAIN_SUITE_JOB },
      },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.body).toContain('The office has no registered jobs.')
    expect(refused.body).toContain('Register the job with registerAnOfficeJob')
  })
})

describe('a 2.5-hour periodic counter', () => {
  it('is accepted through POST and reads back its hours and original job name', async () => {
    const absent = readSetting('MOLE_OFFICE_MAIN_SUITE_COUNTER', {})
    expect(absent.value).toBeNull()
    expect(absent.setting.absentMeans).toMatch(/no periodic main-suite counter is activated/i)
    expect(absent.setting.emptyMeans).toMatch(/no periodic main-suite counter is activated/i)
    expect(absent.setting.inTemplate).toBe(false)
    expect(readSetting('MOLE_OFFICE_MAIN_SUITE_COUNTER', { MOLE_OFFICE_MAIN_SUITE_COUNTER: '' }).value).toBe('')

    const id = await postCounter(2.5)
    const read = await readCounter(id)
    expect(read.counter.triggers[0]).toMatchObject({ kind: 'every', hours: 2.5, holdsNow: false })
    expect(read.counter.action).toEqual({ kind: 'job', job: EXPECTED_MAIN_SUITE_JOB, words: expect.any(String) })
    expect(read.counter.nextDue).toMatchObject({ at: localStamp(new Date('2026-10-13T11:30:00')), trigger: 0 })
  })

  it('does not fire before its due time', async () => {
    const id = await postCounter(2.5)
    expect(tickAt(new Date('2026-10-13T11:29:00')).fired).toEqual([])
    const early = await readCounter(id)
    expect(early.counter.triggers[0]?.holdsNow).toBe(false)
    expect(early.counter.nextDue?.at).toBe(localStamp(new Date('2026-10-13T11:30:00')))
    expect(tickAt(new Date('2026-10-13T11:30:00')).fired).toEqual([id])
  })

  it('fires once after downtime and spaces the next firing from the actual firing', async () => {
    const id = await postCounter(2.5)
    expect(tickAt(new Date('2026-10-13T14:00:00')).fired).toEqual([id])
    expect(tickAt(new Date('2026-10-13T14:00:00')).fired).toEqual([])

    const afterDowntime = await readCounter(id)
    expect(afterDowntime.rows).toHaveLength(1)
    expect(afterDowntime.rows[0]?.at).toBe(localStamp(new Date('2026-10-13T14:00:00')))
    expect(afterDowntime.counter.nextDue?.at).toBe(localStamp(new Date('2026-10-13T16:30:00')))
    expect(tickAt(new Date('2026-10-13T16:29:00')).fired).toEqual([])
    expect(tickAt(new Date('2026-10-13T16:30:00')).fired).toEqual([id])
  })
})

describe('a periodic counter', () => {
  it('keeps the 30-minute minimum between firings', async () => {
    // Synthetic test input with a 15-minute trigger; production cadence remains the producer's own.
    const id = await postCounter(0.25)
    expect(tickAt(new Date('2026-10-13T09:15:00')).fired).toEqual([id])
    const tooSoon = tickAt(new Date('2026-10-13T09:30:00'))
    expect(tooSoon.fired).toEqual([])
    expect(tooSoon.heldBack).toEqual([id])

    const held = await readCounter(id)
    expect(held.counter.heldBack).toMatchObject({
      at: localStamp(new Date('2026-10-13T09:30:00')),
      until: localStamp(new Date('2026-10-13T09:45:00')),
    })
    expect(tickAt(new Date('2026-10-13T09:45:00')).fired).toEqual([id])
  })
})

describe('the schedule the two settings name', () => {
  it('reads 6 landings and 2 hours when nothing is set, and refuses a value that is not a count or a number of hours', async () => {
    const { mainSuiteSchedule } = await theSchedule()
    const landings = readSetting('MOLE_OFFICE_MAIN_SUITE_LANDINGS', {})
    const hours = readSetting('MOLE_OFFICE_MAIN_SUITE_HOURS', {})
    expect([landings.value, hours.value]).toEqual(['6', '2'])
    expect([landings.setting.inTemplate, hours.setting.inTemplate]).toEqual([false, false])
    expect(mainSuiteSchedule({})).toEqual({ landings: 6, hours: 2 })
    expect(mainSuiteSchedule({ MOLE_OFFICE_MAIN_SUITE_LANDINGS: '3', MOLE_OFFICE_MAIN_SUITE_HOURS: '1.5' })).toEqual({ landings: 3, hours: 1.5 })
    for (const value of ['0', '2.5', 'six', '101', ' ']) {
      expect(() => mainSuiteSchedule({ MOLE_OFFICE_MAIN_SUITE_LANDINGS: value }), value).toThrow('MOLE_OFFICE_MAIN_SUITE_LANDINGS')
    }
    for (const value of ['0', '-1', '24.5', 'two', '1e1']) {
      expect(() => mainSuiteSchedule({ MOLE_OFFICE_MAIN_SUITE_HOURS: value }), value).toThrow('MOLE_OFFICE_MAIN_SUITE_HOURS')
    }
  })

  it('makes one counter that follows landings on main and asks for the job at the settings\' landings or hours', async () => {
    const { mainSuiteCounter } = await theSchedule()
    expect(mainSuiteCounter(LANE, {})).toEqual({
      title: expect.any(String),
      label: expect.any(String),
      counts: expect.any(String),
      mayAdd: { anyone: false, who: [] },
      follows: [{ event: 'landing', lane: LANE }],
      triggers: [{ kind: 'count', n: 6 }, { kind: 'every', hours: 2 }],
      action: { kind: 'job', job: EXPECTED_MAIN_SUITE_JOB },
    })
    const other = mainSuiteCounter(LANE, { MOLE_OFFICE_MAIN_SUITE_LANDINGS: '4', MOLE_OFFICE_MAIN_SUITE_HOURS: '3' })
    expect(other.triggers).toEqual([{ kind: 'count', n: 4 }, { kind: 'every', hours: 3 }])
  })

  it('asks after 2 hours only when main has moved, and at the sixth landing whatever the hour', async () => {
    const { mainSuiteCounter } = await theSchedule()
    const made = await app.inject({ method: 'POST', url: '/api/counters', headers: KEEPER, payload: mainSuiteCounter(LANE, {}) })
    expect(made.statusCode, made.body).toBe(201)
    const id = (JSON.parse(made.body) as { counter: { id: string } }).counter.id

    // Two hours and no landing: main has not moved, so nothing is asked.
    expect(tickAt(new Date('2026-10-13T11:00:00')).fired).toEqual([])
    const quiet = await readCounter(id)
    expect(quiet.counter.nextDue).toMatchObject({ at: localStamp(new Date('2026-10-13T11:00:00')), trigger: 1 })
    expect(quiet.counter.nextDue?.because).toMatch(/count is 0/)

    // One landing after the 2 hours: the job is asked for at once.
    aLanding('first', new Date('2026-10-13T11:10:00'))
    expect(tickAt(new Date('2026-10-13T11:15:00')).fired).toEqual([id])

    // Five landings within the hour do not ask again; the sixth does, long before 2 hours.
    for (const minute of [50, 52, 54, 56, 58]) aLanding(`at-${String(minute)}`, new Date(`2026-10-13T11:${String(minute)}:00`))
    expect(tickAt(new Date('2026-10-13T11:59:00')).fired).toEqual([])
    aLanding('sixth', new Date('2026-10-13T12:00:00'))
    expect(tickAt(new Date('2026-10-13T12:01:00')).fired).toEqual([id])

    const read = await readCounter(id)
    expect(read.rows.filter((one) => one.what === 'firing').map((one) => one.at).sort()).toEqual([
      localStamp(new Date('2026-10-13T11:15:00')),
      localStamp(new Date('2026-10-13T12:01:00')),
    ])
  })
})
