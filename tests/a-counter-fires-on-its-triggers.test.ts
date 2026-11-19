// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY KIND OF TRIGGER FIRES, EVERY ACTION RUNS, AND THE LIMIT HOLDS THE SECOND FIRING BACK.
 *
 * Criteria CT3, CT4, CT5 and CT6 of design/counters/ACCEPTANCE.md.
 *
 * WHAT IS PROVED, one claim at a time:
 *
 *   CT3  the four triggers — a count reached, an amount reached, a merge lane quiet for T minutes,
 *        and T hours since it last fired — and the timer, which is the last of those on a counter
 *        nobody may add to.
 *   CT4  the four actions — a line to named participants, a line into a group, a task, and an office
 *        job whose answer reaches the firing row through its own door and keeps the job's name there.
 *   CT5  after a firing the count starts again from zero, and the firing row says which trigger held
 *        and what the action answered.
 *   CT6  a second firing inside the limit is written as HELD BACK with the reason, the count is
 *        kept, and it fires when the window frees; a paused counter counts and fires nothing, and on
 *        resume a trigger that holds fires ONCE.
 *
 * THE CLOCK IS THE TEST'S. `vi.setSystemTime` moves every stamp this product writes, because
 * `nowStamp` and `localStamp` read `Date`; the tick takes its `now` as an argument as well, so the
 * two never disagree inside one case.
 *
 * THE MERGE ENTRY THE QUIET TRIGGER READS IS WRITTEN THROUGH THE QUEUE'S OWN WRITE MARK, and that is
 * not a way round the guard: a real entry needs a sealed run and a git tree, which is why
 * tests/by-id-boundary.test.ts does not make one either. What is under test here is the counter's
 * reading of a lane, not how an entry gets into it.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
let jobs: typeof import('../src/server/lib/office-jobs.ts')
let records: typeof import('../src/server/lib/records.ts')
let mergeDoor: typeof import('../src/server/lib/merge-entry-door.ts')
let counterDoor: typeof import('../src/server/lib/counter-door.ts')

const START = new Date('2026-09-23T09:00:00')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asKeeper = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-keeper' }

const THE_KEEPER = { type: 'agent', id: 'counter-keeper' } as const

/** The registry id an agent of this file was given when it registered. Its handle is not its id. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row has the handle ${handle}`)
  return row.id
}

/** File a counter through its own door, and hand back its id. */
async function aCounter(body: Record<string, unknown>): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: asKeeper, payload: body })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

/** Add to a counter through its own door, and hand back what the door said. */
async function add(id: string, because: string, more: Record<string, unknown> = {}): Promise<{
  counter: { count: number; amount: number | null }
  fired: { seq: number; count: number; trigger?: number; answer?: { kind: string; job?: string; ids: string[]; says: string; finished: boolean } } | null
  heldBack: { because: string; count: number } | null
}> {
  const r = await app.inject({ method: 'POST', url: `/api/counters/${id}/add`, headers: asKeeper, payload: { by: 1, because, ...more } })
  expect(r.statusCode, r.body).toBe(201)
  return JSON.parse(r.body) as never
}

/** One counter as its own door reads it back. */
async function read(id: string): Promise<{
  counter: { count: number; amount: number | null; paused: unknown; heldBack: { reason: string; until: string } | null; nextDue: { at: string } | null; triggers: { holdsNow: boolean; since?: string | null }[] }
  rows: { seq: number; what: string; count: number; amount: number | null; because: string; trigger?: number; answer?: { kind: string; job?: string; ids: string[]; says: string; finished: boolean; answeredBy?: { id: string } } }[]
}> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as never
}

/** One tick of the counters' own watcher, at a moment this test chooses. */
function tickAt(when: Date): ReturnType<typeof counters.fireTheCountersThatAreDue> {
  vi.setSystemTime(when)
  return counters.fireTheCountersThatAreDue(when)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  jobs = await import('../src/server/lib/office-jobs.ts')
  records = await import('../src/server/lib/records.ts')
  mergeDoor = await import('../src/server/lib/merge-entry-door.ts')
  counterDoor = await import('../src/server/lib/counter-door.ts')
  for (const handle of ['counter-keeper', 'counter-reader', 'counter-second-reader']) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asPerson,
      payload: { handle, name: `Synthetic ${handle}` },
    })
    expect(r.statusCode, r.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

afterEach(() => {
  vi.setSystemTime(START)
})

// ============================================================ CT3, the four triggers

describe('a counter fires on the first of its triggers to hold', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('fires when the count reaches N, inside the add request, and starts again from zero', async () => {
    const id = await aCounter({
      title: 'Three trials',
      counts: 'Trials run on the gripper.',
      triggers: [{ kind: 'count', n: 3 }],
      action: { kind: 'task', title: 'Look at the gripper numbers' },
    })
    expect((await add(id, 'One.')).fired).toBeNull()
    expect((await add(id, 'Two.')).fired).toBeNull()
    const third = await add(id, 'Three.')
    expect(third.fired, 'the third addition did not fire it').not.toBeNull()
    expect(third.fired?.count, 'the firing row says what was reset').toBe(3)
    expect(third.fired?.trigger).toBe(0)
    expect(third.counter.count, 'it did not start again from zero').toBe(0)

    const back = await read(id)
    expect(back.rows.map((row) => row.what)).toEqual(['firing', 'addition', 'addition', 'addition'])
    expect(back.rows[0]?.because).toContain('The count reached 3')
  })

  it('fires when the amount reaches M, whatever the count is', async () => {
    const id = await aCounter({
      title: 'Eighty changed files',
      counts: 'Changed files landed since the suite last ran.',
      amountIs: 'changed files',
      triggers: [{ kind: 'amount', m: 80 }],
      action: { kind: 'task', title: 'Run the suite' },
    })
    expect((await add(id, 'A small landing.', { amount: 30 })).fired).toBeNull()
    const second = await add(id, 'A large one.', { amount: 55 })
    expect(second.fired?.count, 'two additions made it').toBe(2)
    expect(second.fired?.trigger).toBe(0)
    expect(second.counter.amount, 'the amount did not start again from zero').toBe(0)
  })

  it('fires when a merge lane has had nothing waiting for T minutes, and not while something waits', async () => {
    const lane = `${THE_TEST_FIXTURE_ROOT}/a-checkout`
    // A LANDED ENTRY IN THE LANE, so the office can say WHEN the lane went quiet. Written through the
    // queue's own write mark, for the reason the file header gives.
    const landed = mergeDoor.asTheMergeQueue(() =>
      records.createRecord({
        kind: 'merge_entry',
        title: 'A landed entry in the quiet lane',
        workspaceId: 'default',
        data: {
          run: 'a-run', seal: { id: 'a-seal', hash: 'h' },
          changeset: { adapter: 'git', root: lane, repository: 'r', branch: 'b', commit: 'c', base: 'd' },
          state: 'merged',
          submittedBy: { kind: 'agent', id: 'counter-keeper' },
          integrated: { at: '2026-09-23 09:00:00' },
        },
        actor: THE_KEEPER,
      }),
    )
    expect(landed.id).toBeTruthy()

    const id = await aCounter({
      title: 'A quiet lane',
      counts: 'Landings waiting for a quiet moment.',
      triggers: [{ kind: 'quiet', condition: 'merge-lane-idle', lane, minutes: 20 }],
      action: { kind: 'task', title: 'Run the suite on a quiet lane' },
    })
    await add(id, 'Something to count, because a quiet trigger needs at least one.')

    // Nineteen minutes: not yet — and the reading says since when the lane has been quiet, which is
    // the other half of what the trigger is watching and what the page draws under it.
    expect(tickAt(new Date('2026-09-23T09:19:00')).fired).toEqual([])
    const waiting = await read(id)
    expect(waiting.counter.triggers[0]?.holdsNow).toBe(false)
    expect(waiting.counter.triggers[0]?.since, 'the spell the trigger is counting does not start at the landing').toBe(
      '2026-09-23 09:00:00',
    )
    // Twenty-one: the lane has been quiet long enough.
    expect(tickAt(new Date('2026-09-23T09:21:00')).fired).toEqual([id])

    // AND NOT WHILE SOMETHING IS WAITING. A second entry in the same lane, still moving, and the
    // lane is not quiet at all however long ago the last one landed.
    mergeDoor.asTheMergeQueue(() =>
      records.createRecord({
        kind: 'merge_entry',
        title: 'An entry still waiting in the lane',
        workspaceId: 'default',
        data: {
          run: 'a-run-2', seal: { id: 'a-seal-2', hash: 'h' },
          changeset: { adapter: 'git', root: lane, repository: 'r', branch: 'b2', commit: 'c2', base: 'd' },
          state: 'submitted',
          submittedBy: { kind: 'agent', id: 'counter-keeper' },
        },
        actor: THE_KEEPER,
      }),
    )
    await add(id, 'Another landing to count.')
    const later = tickAt(new Date('2026-09-23T12:00:00'))
    expect(later.fired, 'it fired while something was still waiting in the lane').toEqual([])
    const back = await read(id)
    expect(back.counter.triggers[0]?.holdsNow).toBe(false)
    expect(back.counter.triggers[0]?.since, 'a lane with something in it has no quiet spell to be in').toBeNull()
  })

  it('says when a lane went quiet, and says nothing when nobody has recorded anything in it', async () => {
    // WHAT THE PAGE DRAWS UNDER A QUIET TRIGGER: since when. Two answers, and they are different
    // facts. A lane the office has watched something land in says the moment it went quiet; a lane
    // nothing has ever been recorded in says NOTHING, because the office cannot know how long it has
    // been quiet, and a reader must not be shown a moment nobody measured.
    const watched = `${THE_TEST_FIXTURE_ROOT}/a-watched-checkout`
    mergeDoor.asTheMergeQueue(() =>
      records.createRecord({
        kind: 'merge_entry',
        title: 'A landing in the watched lane',
        workspaceId: 'default',
        data: {
          run: 'a-run-3', seal: { id: 'a-seal-3', hash: 'h' },
          changeset: { adapter: 'git', root: watched, repository: 'r', branch: 'b3', commit: 'c3', base: 'd' },
          state: 'merged',
          submittedBy: { kind: 'agent', id: 'counter-keeper' },
          integrated: { at: '2026-09-23 09:00:00' },
        },
        actor: THE_KEEPER,
      }),
    )
    const known = await aCounter({
      title: 'A lane the office has watched',
      counts: 'Landings in a lane something has landed in.',
      triggers: [{ kind: 'quiet', condition: 'merge-lane-idle', lane: watched, minutes: 20 }],
      action: { kind: 'task', title: 'Look at the watched lane' },
    })
    const unknown = await aCounter({
      title: 'A lane nobody has recorded anything in',
      counts: 'Landings in a lane nothing has ever landed in.',
      triggers: [{ kind: 'quiet', condition: 'merge-lane-idle', lane: `${THE_TEST_FIXTURE_ROOT}/a-lane-with-no-history`, minutes: 20 }],
      action: { kind: 'task', title: 'Look at the empty lane' },
    })

    const watchedRead = await read(known)
    expect(watchedRead.counter.triggers[0]?.since, 'the office watched a landing and cannot say when the lane went quiet').toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    )
    const unknownRead = await read(unknown)
    expect(unknownRead.counter.triggers[0]?.since, 'a moment was invented for a lane nobody has recorded anything in').toBeNull()
    expect(unknownRead.counter.triggers[0]?.holdsNow).toBe(false)
  })

  it('fires T hours after it last fired, and T hours after it was filed when it never has', async () => {
    const id = await aCounter({
      title: 'Every two hours',
      counts: 'Anything at all, so long as there is one of it.',
      triggers: [{ kind: 'every', hours: 2 }],
      action: { kind: 'task', title: 'Look at what has come in' },
    })
    await add(id, 'One thing to look at.')

    expect(tickAt(new Date('2026-09-23T10:59:00')).fired, 'it fired before its two hours were up').toEqual([])
    expect(tickAt(new Date('2026-09-23T11:01:00')).fired).toEqual([id])

    // AND THE NEXT ONE IS COUNTED FROM THE FIRING, not from the filing.
    await add(id, 'Another thing, after the first firing.')
    expect(tickAt(new Date('2026-09-23T12:00:00')).fired).toEqual([])
    const back = await read(id)
    expect(back.counter.nextDue?.at).toBe('2026-09-23 13:01:00')
  })

  it('is a timer when nobody may add to it and it follows nothing, so it fires with a count of zero', async () => {
    const id = await aCounter({
      title: 'Every hour, on the hour',
      counts: 'Nothing: it is a timer, and it fires on the hour whatever has happened.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 1, from: '2026-09-23 09:30:00' }],
      action: { kind: 'task', title: 'The hourly look' },
    })
    expect(tickAt(new Date('2026-09-23T09:29:00')).fired).toEqual([])
    const fired = tickAt(new Date('2026-09-23T09:31:00'))
    expect(fired.fired, 'a timer with a count of zero did not fire').toEqual([id])
    const back = await read(id)
    expect(back.rows[0]?.count, 'the firing reset a count of zero').toBe(0)
    expect(back.counter.nextDue?.at, 'the next one is the next whole hour after the firing').toBe('2026-09-23 10:30:00')
  })
})

// ============================================================ CT4, the four actions

describe('each action the closed list allows, and what it answers', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('writes one line from the office to each named participant, and keeps where each went', async () => {
    const id = await aCounter({
      title: 'Two readers',
      counts: 'Trials, after which two people are told.',
      triggers: [{ kind: 'count', n: 1 }],
      action: {
        kind: 'message',
        to: [
          { kind: 'agent', id: 'counter-reader' },
          { kind: 'agent', id: 'counter-second-reader' },
        ],
      },
    })
    const done = await add(id, 'The one trial it takes.')
    const answer = done.fired?.answer
    expect(answer?.kind).toBe('message')
    expect(answer?.ids.length, 'a line each, because the office writes to one participant at a time').toBe(2)
    expect(answer?.finished).toBe(true)
    expect(answer?.says).toContain('Synthetic counter-reader')

    // WHERE THE LINE REALLY WENT, read off the stored message rather than off where it was aimed.
    for (const messageId of answer?.ids ?? []) {
      const message = records.getRecord(messageId)
      expect(message?.kind).toBe('message')
      expect(String(message?.data['body']), 'the line does not name the counter').toContain('Two readers')
      expect((message?.data['sentBy'] as { id: string }).id, 'the line is not the office speaking').toBe(theOfficesOwnId(t))
      expect((message?.data['to'] as { id: string }[]).length).toBe(1)
    }
  })

  it('writes one line into a group, and says so when the group has nobody in it', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asPerson,
      payload: {
        name: 'The counter room',
        because: 'Somewhere for a counter to say what it counted.',
        members: [{ who: { kind: 'agent', id: 'counter-reader' }, because: 'It reads what the counter says.' }],
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const group = (JSON.parse(made.body) as { group: { id: string } }).group.id

    const id = await aCounter({
      title: 'The room teller',
      counts: 'Trials, after which the room is told.',
      triggers: [{ kind: 'count', n: 1 }],
      action: { kind: 'message', group },
    })
    const done = await add(id, 'The one trial it takes.')
    expect(done.fired?.answer?.ids.length).toBe(1)
    const line = records.getRecord(done.fired?.answer?.ids[0] ?? '')
    expect(line?.data['toGroup']).toBe(group)
    expect(done.fired?.answer?.says).toContain('The counter room')
  })

  it('files a task with the title it was given, linked about the counter', async () => {
    const id = await aCounter({
      title: 'The task filer',
      counts: 'Trials, after which a task is filed.',
      triggers: [{ kind: 'count', n: 1 }],
      action: { kind: 'task', title: 'Look at the gripper numbers' },
    })
    const done = await add(id, 'The one trial it takes.')
    const taskId = done.fired?.answer?.ids[0] ?? ''
    const task = records.getRecord(taskId)
    expect(task?.kind).toBe('task')
    expect(task?.title).toBe('Look at the gripper numbers')
    expect(task?.data['state']).toBe('todo')
    const links = t.client.sqlite
      .prepare('SELECT type, to_id AS toId FROM links WHERE from_id = ?')
      .all(taskId) as { type: string; toId: string }[]
    expect(links.map((link) => `${link.type}:${link.toId}`), 'the task is not linked to the counter that filed it').toContain(`about:${id}`)
  })

  it('asks for an office job, waits for whoever runs it, and puts their answer on the firing row', async () => {
    // THE OFFICE HAS TO BE IN THIS DATABASE FOR A JOB TO FIRE. A world is a copy of the office's
    // database, counters and all, and a copy that fired the office's jobs would run them twice.
    const office = await import('../src/server/lib/office.ts')
    const world = await import('../src/server/lib/world.ts')
    const here = world.theWorldThisDatabaseIs()
    expect(here, 'this test database has no identity, so it cannot be made the office').not.toBeNull()
    office.registerWorldHere({
      name: 'my world',
      purpose: null,
      handback: null,
      kind: 'home',
      startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      head: 'abc1234',
      databaseIdentity: here ?? '',
      address: 'http://127.0.0.1:41700',
      addressForOtherMachines: null,
      standing: 'canonical',
      parentWorld: null,
      installation: 'this-installation',
    })
    expect(office.theOfficeIsInThisDatabase()).toBe(true)
    jobs.registerAnOfficeJob({ name: 'test.the-whole-suite', what: 'Stands in for the whole-suite run on main, for this test.' })

    const id = await aCounter({
      title: 'The job asker',
      counts: 'Trials, after which the office asks for a job.',
      triggers: [{ kind: 'count', n: 1 }],
      action: { kind: 'job', job: 'test.the-whole-suite' },
    })
    const done = await add(id, 'The one trial it takes.')
    const seq = done.fired?.seq ?? 0
    expect(done.fired?.answer?.finished, 'a job nobody has run is not finished').toBe(false)
    expect(done.fired?.answer?.ids, 'a job nobody has run has no result').toEqual([])
    expect(done.fired?.answer?.says).toContain('test.the-whole-suite')

    const answered = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/firings/${String(seq)}/answer`,
      headers: { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-reader' },
      payload: { says: 'The suite ran on main and every test passed.', result: 'green' },
    })
    expect(answered.statusCode, answered.body).toBe(200)

    const back = await read(id)
    const firing = back.rows.find((row) => row.seq === seq)
    expect(firing?.answer?.finished).toBe(true)
    expect(firing?.answer?.says).toBe('The suite ran on main and every test passed.')
    expect(firing?.answer?.ids).toEqual(['green'])
    expect(firing?.answer?.answeredBy?.id).toBe(idOf('counter-reader'))
    expect(firing?.answer?.job, 'the finished row lost the job the firing asked for').toBe('test.the-whole-suite')

    // AND ONCE ONLY. A second answer would rewrite what the first runner said.
    const again = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/firings/${String(seq)}/answer`,
      headers: { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-reader' },
      payload: { says: 'A second runner saying something else.' },
    })
    expect(again.statusCode, again.body).toBe(409)
    jobs.forgetAnOfficeJob('test.the-whole-suite')
  })
})

// ============================================================ CT6, the limit

describe('a counter fires at most once in its own window', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('writes one held-back row with the reason, keeps the count, and fires when the window frees', async () => {
    const id = await aCounter({
      title: 'Twice an hour at most',
      counts: 'Trials, which come in faster than anybody can look at them.',
      triggers: [{ kind: 'count', n: 1 }],
      action: { kind: 'task', title: 'Look at the trial' },
    })
    const first = await add(id, 'The first trial.')
    expect(first.fired).not.toBeNull()

    vi.setSystemTime(new Date('2026-09-23T09:05:00'))
    const second = await add(id, 'The second trial, five minutes later.')
    expect(second.fired, 'it fired twice inside its own limit').toBeNull()
    expect(second.heldBack, 'nothing was written to say the firing was held back').not.toBeNull()
    expect(second.heldBack?.because).toContain('at most once every 30 minutes')
    expect(second.counter.count, 'the held-back firing reset the count').toBe(1)

    // ONE ROW PER HELD SPELL, however many more additions reach the trigger.
    vi.setSystemTime(new Date('2026-09-23T09:10:00'))
    const third = await add(id, 'A third trial, still inside the window.')
    expect(third.heldBack, 'a second held-back row for one held spell').toBeNull()
    const held = (await read(id)).rows.filter((row) => row.what === 'held back')
    expect(held.length).toBe(1)

    // AND IT FIRES WHEN THE WINDOW FREES, with the count it kept.
    const freed = tickAt(new Date('2026-09-23T09:31:00'))
    expect(freed.fired).toEqual([id])
    const back = await read(id)
    expect(back.counter.count, 'it did not start again from zero when it finally fired').toBe(0)
    expect(back.rows[0]?.count, 'the firing kept the count that was held').toBe(2)
    expect(back.counter.heldBack, 'the held spell is over and the reading still says it is held').toBeNull()
  })
})

// ============================================================ CT6, pause and resume

describe('a paused counter keeps counting and fires nothing', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('counts what is added while it is paused, and fires once on resume', async () => {
    const id = await aCounter({
      title: 'Paused for the evening',
      counts: 'Trials run while nobody is watching.',
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'task', title: 'Look at the evening trials' },
    })
    const paused = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/pause`,
      headers: asKeeper,
      payload: { because: 'The rig is off for the evening and nobody would read the task.' },
    })
    expect(paused.statusCode, paused.body).toBe(200)
    expect((JSON.parse(paused.body) as { counter: { paused: { because: string; by: { id: string } } } }).counter.paused.by.id).toBe(idOf('counter-keeper'))

    const first = await add(id, 'A trial while it is paused.')
    expect(first.counter.count).toBe(1)
    const second = await add(id, 'A second trial, which reaches the trigger.')
    expect(second.counter.count, 'a paused counter stopped counting').toBe(2)
    expect(second.fired, 'a paused counter fired').toBeNull()
    expect(tickAt(new Date('2026-09-23T10:00:00')).fired, 'the tick fired a paused counter').toEqual([])

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/resume`,
      headers: asKeeper,
      payload: { because: 'The rig is back on and somebody is watching again.' },
    })
    expect(resumed.statusCode, resumed.body).toBe(200)
    const said = JSON.parse(resumed.body) as { counter: { count: number; paused: unknown }; fired: { count: number } | null }
    expect(said.fired, 'the trigger held while it was paused and nothing fired on resume').not.toBeNull()
    expect(said.fired?.count, 'the firing did not carry the count it kept while paused').toBe(2)
    expect(said.counter.count).toBe(0)
    expect(said.counter.paused).toBeNull()

    // AND ONCE, NOT ONCE PER TICK AFTERWARDS.
    expect(tickAt(new Date('2026-09-23T10:05:00')).fired).toEqual([])
    const firings = (await read(id)).rows.filter((row) => row.what === 'firing')
    expect(firings.length, 'resuming fired it more than once').toBe(1)
  })

  it('refuses a second pause and a resume of a counter that is not paused', async () => {
    const id = await aCounter({
      title: 'Paused twice over',
      counts: 'Nothing much.',
      triggers: [{ kind: 'count', n: 5 }],
      action: { kind: 'task', title: 'Nothing much either' },
    })
    const resumeFirst = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/resume`,
      headers: asKeeper,
      payload: { because: 'It is not paused, so this should be refused.' },
    })
    expect(resumeFirst.statusCode, resumeFirst.body).toBe(409)

    for (const attempt of [1, 2]) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/counters/${id}/pause`,
        headers: asKeeper,
        payload: { because: `Pause attempt ${String(attempt)}.` },
      })
      expect(r.statusCode, r.body).toBe(attempt === 1 ? 200 : 409)
    }
  })
})

// ============================================================ one counter's failure is not the tick's

/**
 * A COUNTER THIS TICK CANNOT FINISH DOES NOT STOP THE COUNTERS AFTER IT.
 *
 * The docstring on `fireTheCountersThatAreDue` promises this, and until the wave's second round the
 * code did not do it: one loop with no try, so the first counter that threw ended the tick and every
 * counter after it went unasked, in that tick and in every tick after. The inspector's refusal of
 * run mmlBVQcrmiUM found it (check y8DRtDpZ9dA1, point 4).
 *
 * HOW THE FIRST COUNTER IS MADE TO FAIL, and why it is this way and not another. Its stored action
 * is a message that names nobody, which is what a row written by another version of this feature or
 * brought in by a restore of another shape looks like: the action runs, reaches its last branch and
 * asks a list of recipients that is not there, and throws. Two failures the docstring names as
 * examples were tried first and neither is reachable from a test today, which is worth writing down
 * rather than leaving for the next person to find again: a group cannot go while somebody is still
 * in it, because `group_members.group_id` is a foreign key onto `groups.id` and the database refuses
 * the delete; and the office's own lines are exempt from the one refusal, criterion M110, that would
 * stop a line to an agent nobody is answering as. What is proved is the tick's own behaviour, and
 * that is the same whichever way one counter fails.
 *
 * THE BROKEN ROW IS WRITTEN THROUGH THE COUNTER DOORS' OWN MARK, the way this file already writes a
 * merge entry through the queue's: the guard in `assertMayWrite` refuses every other writer, and
 * what is under test is the tick, not the guard.
 */
describe("one counter that cannot finish does not stop the counters after it", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  it('fires the healthy counter, and keeps the sick one with its reason', async () => {
    // THE SICK ONE IS FILED FIRST, so that a tick with no try reaches it before the healthy one.
    const sick = await aCounter({
      title: 'Its stored action is one this version cannot run',
      counts: 'Nothing: it is a timer.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 1, from: '2026-09-23 09:30:00' }],
      action: { kind: 'task', title: 'Whatever it wanted' },
    })
    const well = await aCounter({
      title: 'An ordinary counter, filed after it',
      counts: 'Nothing: it is a timer too.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 1, from: '2026-09-23 09:30:00' }],
      action: { kind: 'task', title: 'The hourly look, again' },
    })

    // ITS STORED ACTION BECOMES ONE THIS VERSION CANNOT RUN: a message that names nobody to write
    // to. `runTheAction` reaches its last branch and asks a list that is not there, which throws
    // when the counter fires. Written through the counter doors' own mark.
    counterDoor.asTheCounterDoors(() => {
      records.patchRecord(sick, { data: { ...records.getRecord(sick)!.data, action: { kind: 'message' } } }, { type: 'agent', id: 'counter-keeper' })
    })

    const pass = tickAt(new Date('2026-09-23T09:31:00'))

    expect(pass.failed.map((one) => one.counter), 'the counter that could not be read was not kept').toEqual([sick])
    expect(pass.failed[0]?.because, 'the reason was thrown away instead of being kept').toBeTruthy()
    expect(pass.fired, 'a counter after the failed one went unasked').toEqual([well])

    // AND THE NEXT TICK ASKS THE SICK ONE AGAIN rather than writing it off: it is still unreadable,
    // so it is kept again with its reason, and the healthy one is asked as usual.
    const again = tickAt(new Date('2026-09-23T10:31:00'))
    expect(again.failed.map((one) => one.counter), 'the failed counter was dropped from later ticks').toEqual([sick])
  })
})
