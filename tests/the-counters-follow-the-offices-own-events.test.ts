// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE OFFICE EVENTS A COUNTER MAY FOLLOW, EACH COUNTED ONCE HOWEVER MANY TICKS READ IT — AND
 * THE MERGE QUEUE'S OWN TRIGGER SET, FIRED FOUR WAYS.
 *
 * Criteria CT2, CT3 and CT10 of design/counters/ACCEPTANCE.md, on point 3 of the build decision `uLV_1NVD8jeV` and on
 * one more decision.
 *
 * WHY COUNTING ONCE IS THE WHOLE POINT. The three events are read by POLLING from the counters' own
 * minute tick, not by a hook in the write path, so the same landing, the same finished run and the
 * same message are in front of every tick for as long as they are in the window. What makes an event
 * count once is a unique index on (counter, event kind, event id), and the way to prove it is to run
 * the tick again and again and read the rows.
 *
 * CT10 IS THE FIRST REAL COUNTER'S TRIGGER SET, not the counter itself: the whole-suite run on main
 * is another agent's to build, and the secretary files the counter when the job exists. What is proved here is that
 * the four triggers of decision `6xo9KZU4kbhB` — three landings, eighty changed files under src,
 * tests and tools, twenty minutes of a quiet lane, and twelve hours — each fire that definition
 * against a job registered for this test.
 *
 * THE MERGE ENTRIES ARE WRITTEN THROUGH THE QUEUE'S OWN WRITE MARK, because a real one needs a
 * sealed run and a git tree; tests/by-id-boundary.test.ts does not make one either. What is under
 * test is what the counter makes of a landing, not how a landing gets into the queue.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
let jobs: typeof import('../src/server/lib/office-jobs.ts')
let records: typeof import('../src/server/lib/records.ts')
let mergeDoor: typeof import('../src/server/lib/merge-entry-door.ts')

const START = new Date('2026-09-23T09:00:00')
const LANE = `${THE_TEST_FIXTURE_ROOT}/PROJECTS/a-checkout`

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asKeeper = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-keeper' }
const THE_KEEPER = { type: 'agent', id: 'counter-keeper' } as const

/** The trigger set of decision 6xo9KZU4kbhB, which is CT10's counter, word for word. */
const THE_QUEUE_TRIGGERS = [
  { kind: 'count', n: 3 },
  { kind: 'amount', m: 80 },
  { kind: 'quiet', condition: 'merge-lane-idle', lane: LANE, minutes: 20 },
  { kind: 'every', hours: 12 },
]

async function aCounter(body: Record<string, unknown>): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: asKeeper, payload: body })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

async function read(id: string): Promise<{
  counter: { count: number; amount: number | null }
  rows: { seq: number; what: string; count: number; amount: number | null; because: string; event: { event: string; id: string } | null; answer?: { kind: string; finished: boolean } }[]
}> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as never
}

function tickAt(when: Date): ReturnType<typeof counters.fireTheCountersThatAreDue> {
  vi.setSystemTime(when)
  return counters.fireTheCountersThatAreDue(when)
}

/** One landing in the lane, with the paths it changed, at the moment given. */
function aLanding(name: string, paths: readonly string[], at: string): string {
  return mergeDoor.asTheMergeQueue(() =>
    records.createRecord({
      kind: 'merge_entry',
      title: `A landing: ${name}`,
      workspaceId: 'default',
      data: {
        run: `run-${name}`,
        seal: { id: `seal-${name}`, hash: 'h' },
        changeset: { adapter: 'git', root: LANE, repository: 'r', branch: name, commit: `c-${name}`, base: 'b' },
        state: 'merged',
        submittedBy: { kind: 'agent', id: 'counter-keeper' },
        integration: { result: `c-${name}`, mainAt: 'main', files: Object.fromEntries(paths.map((path) => [path, 'a-hash'])), at },
        integrated: { entry: name, mainBefore: 'main', mainAfter: 'main2', at },
      },
      actor: THE_KEEPER,
    }),
  ).id
}

/** An entry still moving in the lane, so the lane is not quiet. */
function aWaitingEntry(name: string): string {
  return mergeDoor.asTheMergeQueue(() =>
    records.createRecord({
      kind: 'merge_entry',
      title: `Waiting: ${name}`,
      workspaceId: 'default',
      data: {
        run: `run-${name}`,
        seal: { id: `seal-${name}`, hash: 'h' },
        changeset: { adapter: 'git', root: LANE, repository: 'r', branch: name, commit: `c-${name}`, base: 'b' },
        state: 'submitted',
        submittedBy: { kind: 'agent', id: 'counter-keeper' },
      },
      actor: THE_KEEPER,
    }),
  ).id
}

/** Eighty-two paths, of which eighty are under the three directories the queue counts. */
const EIGHTY_UNDER_THE_THREE = [
  ...Array.from({ length: 40 }, (_, n) => `src/server/lib/file-${String(n)}.ts`),
  ...Array.from({ length: 30 }, (_, n) => `tests/a-test-${String(n)}.test.ts`),
  ...Array.from({ length: 10 }, (_, n) => `tools/a-tool-${String(n)}.mjs`),
  'design/a-document.md',
  'README.md',
]

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  jobs = await import('../src/server/lib/office-jobs.ts')
  records = await import('../src/server/lib/records.ts')
  mergeDoor = await import('../src/server/lib/merge-entry-door.ts')
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asPerson,
    payload: { handle: 'counter-keeper', name: 'Synthetic counter-keeper' },
  })
  expect(started.statusCode, started.body).toBe(201)

  // THE OFFICE IS IN THIS DATABASE, which is what lets a counter fire an office job at all: a world
  // is a copy of the office's database, counters included, and a copy must not fire the office's
  // jobs a second time.
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  office.registerWorldHere({
    name: 'my world',
    purpose: null,
    handback: null,
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    head: 'abc1234',
    databaseIdentity: world.theWorldThisDatabaseIs() ?? '',
    address: 'http://127.0.0.1:41700',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'this-installation',
  })
  expect(office.theOfficeIsInThisDatabase()).toBe(true)
  jobs.registerAnOfficeJob({ name: 'test.the-whole-suite-on-main', what: 'Stands in for the whole-suite run on main, for this test.' })

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
}, 60_000)

afterAll(async () => {
  jobs?.forgetAnOfficeJob('test.the-whole-suite-on-main')
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

// ============================================================ CT2, the three events

describe('each office event a counter follows is counted once, however many ticks read it', () => {
  it('counts a landing once, with its changed files under the named directories as the amount', async () => {
    const id = await aCounter({
      title: 'Landings in this checkout',
      counts: 'Landings in this repository since the suite last ran on main.',
      amountIs: 'changed files under src, tests and tools',
      follows: [{ event: 'landing', lane: LANE, paths: ['src/', 'tests/', 'tools/'] }],
      triggers: [{ kind: 'count', n: 99 }],
      action: { kind: 'task', title: 'Run the suite' },
    })
    aLanding('one', ['src/a.ts', 'tests/b.test.ts', 'design/c.md'], '2026-09-23 09:05:00')

    expect(tickAt(new Date('2026-09-23T09:06:00')).added.length).toBe(1)
    const after = await read(id)
    expect(after.counter.count).toBe(1)
    expect(after.counter.amount, 'design/c.md was counted, and the follow named three directories').toBe(2)
    expect(after.rows[0]?.event?.event).toBe('landing')

    // AND AGAIN, AND AGAIN. The same landing is in front of every tick from now on.
    for (const minute of [7, 8, 9]) tickAt(new Date(`2026-09-23T09:0${String(minute)}:00`))
    const later = await read(id)
    expect(later.counter.count, 'one landing was counted more than once').toBe(1)
    expect(later.rows.filter((row) => row.what === 'addition').length).toBe(1)
  })

  it('does not count a landing outside the paths a counter follows', async () => {
    const id = await aCounter({
      title: 'Only review changes', counts: 'Review panel changes.',
      follows: [{ event: 'landing', lane: LANE, paths: ['src/web/components/agent/ReviewBar.tsx'] }],
      triggers: [{ kind: 'count', n: 99 }], action: { kind: 'task', title: 'Measure the review panel' },
    })
    aLanding('unrelated', ['src/server/lib/another.ts'], '2026-09-23 09:10:00')
    tickAt(new Date('2026-09-23T09:11:00'))
    expect((await read(id)).counter.count).toBe(0)
    aLanding('review', ['src/web/components/agent/ReviewBar.tsx'], '2026-09-23 09:12:00')
    tickAt(new Date('2026-09-23T09:13:00'))
    expect((await read(id)).counter.count).toBe(1)
  })

  it('counts a run that reached finished in the named pipeline, once, and never one that stopped', async () => {
    const pipeline = records.createRecord({
      kind: 'pipeline',
      title: 'The gripper pipeline',
      workspaceId: 'default',
      data: { blockIds: [] },
      actor: THE_KEEPER,
    })
    const id = await aCounter({
      title: 'Runs finished in the gripper pipeline',
      counts: 'Runs that finished in the gripper pipeline.',
      follows: [{ event: 'run-finished', pipeline: 'The gripper pipeline' }],
      triggers: [{ kind: 'count', n: 99 }],
      action: { kind: 'task', title: 'Look at what the runs said' },
    })

    const runOf = (title: string): string => {
      const run = records.createRecord({
        kind: 'session',
        title,
        workspaceId: 'default',
        data: { state: 'running', runtime: 'claude-code' },
        actor: THE_KEEPER,
      })
      records.createLink({ fromId: run.id, toId: pipeline.id, type: 'part_of', actor: THE_KEEPER })
      return run.id
    }
    const finished = runOf('A run that finishes')
    const crashed = runOf('A run that crashes')
    records.patchRecord(finished, { dataPatch: { state: 'finished' } }, THE_KEEPER)
    // `crashed` AND NOT `stopped`, because the session kind's own state words are running, idle,
    // finished, crashed, orphaned and unknown. What this case is about is that only `finished`
    // counts: a run that did not do the work is not an experiment, and counting it would make
    // "ten runs" mean "ten attempts, some of which fell over".
    records.patchRecord(crashed, { dataPatch: { state: 'crashed' } }, THE_KEEPER)

    expect(tickAt(new Date('2026-09-23T09:20:00')).added.length).toBe(1)
    tickAt(new Date('2026-09-23T09:21:00'))
    const after = await read(id)
    expect(after.counter.count, 'a crashed run was counted, or a finished one was counted twice').toBe(1)
    expect(after.rows[0]?.event?.event).toBe('run-finished')
    expect(after.rows[0]?.because).toContain('A run that finishes')
  })

  it('counts a message in the group it follows, once, the office’s own lines included', async () => {
    vi.setSystemTime(new Date('2026-09-23T09:25:00'))
    const made = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asPerson,
      payload: {
        name: 'The watched room',
        because: 'A group a counter follows.',
        members: [{ who: { kind: 'agent', id: 'counter-keeper' }, because: 'It is in the room.' }],
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const group = (JSON.parse(made.body) as { group: { id: string } }).group.id

    // THE COUNTER IS FILED AFTER THE GROUP IS OPENED, so the line the office writes when a group is
    // opened is before the counting begins. It is a message in the group like any other and would be
    // counted; this case is about counting ONE message once, and the office's own lines have a case
    // of their own below.
    vi.setSystemTime(new Date('2026-09-23T09:26:00'))
    const id = await aCounter({
      title: 'Messages in the watched room',
      counts: 'Messages in the watched room.',
      follows: [{ event: 'group-message', group }],
      triggers: [{ kind: 'count', n: 99 }],
      action: { kind: 'task', title: 'Read the room' },
    })

    vi.setSystemTime(new Date('2026-09-23T09:30:00'))
    const said = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asKeeper,
      payload: { kind: 'message', title: 'A word in the room', data: { body: 'Something said in the room.', toGroup: group } },
    })
    expect(said.statusCode, said.body).toBe(201)

    expect(tickAt(new Date('2026-09-23T09:31:00')).added.length).toBe(1)
    for (const minute of [32, 33]) tickAt(new Date(`2026-09-23T09:${String(minute)}:00`))
    const after = await read(id)
    expect(after.counter.count, 'one message was counted more than once').toBe(1)
    expect(after.rows[0]?.event?.event).toBe('group-message')

    // AND AN OFFICE LINE IN THAT GROUP IS A MESSAGE IN IT. Another counter writes into the room when
    // it fires, which is the same row a person's message is with Mole Office as its sender, so the
    // counter that follows the room counts it. This is why a counter may not write into a group it
    // follows — the loop check refuses that pairing, and tests/counter-doors.test.ts proves it.
    const teller = await aCounter({
      title: 'The one that says something in the room',
      counts: 'Anything, after which the room is told.',
      triggers: [{ kind: 'count', n: 1 }],
      action: { kind: 'message', group },
    })
    vi.setSystemTime(new Date('2026-09-23T09:40:00'))
    const pushed = await app.inject({
      method: 'POST',
      url: `/api/counters/${teller}/add`,
      headers: asKeeper,
      payload: { by: 1, because: 'The one thing it takes to make the office say something.' },
    })
    expect(pushed.statusCode, pushed.body).toBe(201)

    tickAt(new Date('2026-09-23T09:41:00'))
    const withTheLine = await read(id)
    expect(withTheLine.counter.count, 'the office’s own line in the room was not counted').toBe(2)
    const counted = withTheLine.rows.find((row) => row.event?.id === (JSON.parse(pushed.body) as { fired: { answer: { ids: string[] } } }).fired.answer.ids[0])
    expect(counted, 'the line the office wrote is not the row that was counted').toBeDefined()
  })
})

// ============================================================ CT10, the queue's trigger set

describe('the merge queue’s trigger set fires four ways against a registered job', () => {
  /** A counter with the queue's own definition, filed at the moment given. */
  async function theQueuesCounter(title: string): Promise<string> {
    return aCounter({
      title,
      counts: 'Landings in this repository since the whole suite last ran on main.',
      amountIs: 'changed files under src, tests and tools',
      follows: [{ event: 'landing', lane: LANE, paths: ['src/', 'tests/', 'tools/'] }],
      triggers: THE_QUEUE_TRIGGERS,
      action: { kind: 'job', job: 'test.the-whole-suite-on-main' },
    })
  }

  it('fires on three landings', async () => {
    vi.setSystemTime(new Date('2026-09-23T10:00:00'))
    const id = await theQueuesCounter('The queue counter, by landings')
    for (const [n, name] of ['a', 'b', 'c'].entries()) {
      aLanding(`count-${name}`, [`src/file-${String(n)}.ts`], `2026-09-23 10:0${String(n + 1)}:00`)
    }
    const pass = tickAt(new Date('2026-09-23T10:10:00'))
    expect(pass.fired, 'three landings did not fire the queue counter').toContain(id)
    const after = await read(id)
    const firing = after.rows.find((row) => row.what === 'firing')
    expect(firing?.because).toContain('The count reached 3')
    expect(firing?.answer?.kind, 'the firing did not ask for the office job').toBe('job')
    expect(firing?.answer?.finished, 'a job nobody has run yet was recorded as finished').toBe(false)
    expect(after.counter.count).toBe(0)
  })

  it('fires on eighty changed files under src, tests and tools, from fewer than three landings', async () => {
    vi.setSystemTime(new Date('2026-09-23T11:00:00'))
    const id = await theQueuesCounter('The queue counter, by changed files')
    aLanding('big-one', EIGHTY_UNDER_THE_THREE, '2026-09-23 11:01:00')
    const pass = tickAt(new Date('2026-09-23T11:02:00'))
    expect(pass.fired).toContain(id)
    const firing = (await read(id)).rows.find((row) => row.what === 'firing')
    expect(firing?.because).toContain('The amount reached 80')
    expect(firing?.count, 'one landing, not three').toBe(1)
    expect(firing?.amount, 'the two files outside src, tests and tools were counted').toBe(80)
  })

  it('fires after twenty minutes of a quiet lane with a landing not yet covered', async () => {
    vi.setSystemTime(new Date('2026-09-23T12:00:00'))
    const id = await theQueuesCounter('The queue counter, by a quiet lane')
    aLanding('quiet-one', ['src/one-file.ts'], '2026-09-23 12:01:00')
    // Something still moving in the lane: quiet is about what is WAITING, not about time alone.
    const waiting = aWaitingEntry('still-going')
    expect(tickAt(new Date('2026-09-23T12:30:00')).fired, 'it fired while an entry was still in the lane').not.toContain(id)

    // The waiting entry lands, and twenty minutes later the lane has been quiet long enough.
    mergeDoor.asTheMergeQueue(() =>
      records.patchRecord(waiting, { dataPatch: { state: 'merged', integrated: { at: '2026-09-23 12:31:00' } } }, THE_KEEPER),
    )
    expect(tickAt(new Date('2026-09-23T12:45:00')).fired, 'it fired before the lane had been quiet for twenty minutes').not.toContain(id)
    expect(tickAt(new Date('2026-09-23T12:55:00')).fired).toContain(id)
    const firing = (await read(id)).rows.find((row) => row.what === 'firing')
    expect(firing?.because).toContain('Nothing has been waiting')
  })

  it('fires after twelve hours with a landing not yet covered', async () => {
    vi.setSystemTime(new Date('2026-09-23T13:00:00'))
    const id = await theQueuesCounter('The queue counter, by twelve hours')
    aLanding('slow-one', ['src/a-single-file.ts'], '2026-09-23 13:01:00')
    // The lane is quiet as well, so the twelve-hour trigger is proved by being the one that holds
    // LAST: the quiet trigger is read first and would fire it at twenty minutes. Twelve hours is
    // what this case is about, so the lane is kept busy until then.
    const waiting = aWaitingEntry('holding-the-lane')
    expect(tickAt(new Date('2026-09-23T20:00:00')).fired).not.toContain(id)
    const pass = tickAt(new Date('2026-09-24T01:02:00'))
    expect(pass.fired, 'twelve hours passed and it did not fire').toContain(id)
    const firing = (await read(id)).rows.find((row) => row.what === 'firing')
    expect(firing?.because).toContain('12 hours have passed')
    expect(waiting).toBeTruthy()
  })
})
