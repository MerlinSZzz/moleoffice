// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A COUNTER IS WRITTEN ONLY THROUGH ITS OWN DOORS, AND EACH DOOR SAYS WHO MAY KNOCK.
 *
 * Criteria CT1, CT2, CT4 and CT6 of design/counters/ACCEPTANCE.md.
 *
 * WHAT IS BEING PROVED HERE, and it is four separate claims:
 *
 *   1. The general record doors refuse a counter outright, whoever asks — the person included —
 *      because they carry neither the guard on who may change one nor the reason every change keeps.
 *   2. Who filed a counter is the office's own stamp from whoever asked, and a caller that sends one
 *      is refused rather than believed.
 *   3. An addition by somebody the counter does not allow is refused in words that NAME WHO MAY, and
 *      writes nothing.
 *   4. A counter whose action would add to a counter that could add back to it is refused when it is
 *      filed and when it is changed, with the loop named.
 *
 * EVERY REFUSAL IS CHECKED FOR WHAT IT WROTE, not only for its status. A 403 that had already
 * written the row is the failure this file exists to catch, so each refusal reads the rows back.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let jobs: typeof import('../src/server/lib/office-jobs.ts')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The counter every case in a describe block starts from, filed by the keeper. */
/** The registry id an agent of this file was given when it registered. Its handle is not its id. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row has the handle ${handle}`)
  return row.id
}

async function fileACounter(body: Record<string, unknown>, who: Record<string, string> = asAgent('counter-keeper')): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: who, payload: body })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, unknown> }
}

/** Every row of every counter, so a refusal can be checked for having written nothing. */
function everyRow(): unknown[] {
  return t.client.sqlite.prepare('SELECT * FROM counter_rows').all()
}

/** How many counters there are, for the same reason. */
function howManyCounters(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'counter'").get() as { n: number }).n
}

const A_PLAIN_COUNTER = {
  title: 'Gripper trials',
  counts: 'Trials run on the gripper since somebody last looked at the numbers.',
  triggers: [{ kind: 'count', n: 3 }],
  action: { kind: 'task', title: 'Look at the gripper numbers' },
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  jobs = await import('../src/server/lib/office-jobs.ts')
  // A SECOND PROJECT, so that "a project with no counters says so" is asked of a project that
  // really holds none rather than of the one every case below files counters into.
  const another = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'robotics', title: 'Robotics' } })
  expect(another.statusCode, another.body).toBe(201)
  for (const handle of ['counter-keeper', 'counter-adder', 'counter-stranger']) {
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
  await app?.close()
  t?.close()
})

// ============================================================ 1. only its own doors

describe('the general record doors refuse a counter, whoever asks', () => {
  it('refuses POST /api/records to the person, and names the doors that do write one', async () => {
    const before = howManyCounters()
    const r = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asPerson,
      payload: { kind: 'counter', title: 'A counter by the back door', data: { counts: 'Nothing, because this is refused.' } },
    })
    expect(r.statusCode, r.body).toBe(403)
    const said = JSON.parse(r.body) as { error: string; detail?: string }
    expect(`${said.error} ${said.detail ?? ''}`).toContain('POST /api/counters')
    expect(said.error).toContain('Nothing was written.')
    expect(howManyCounters(), 'the refused write filed a counter anyway').toBe(before)
  })

  it('refuses a change and a delete through the record doors, once one really exists', async () => {
    const made = await fileACounter(A_PLAIN_COUNTER)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const id = (made.body.counter as { id: string }).id

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: asPerson,
      payload: { dataPatch: { atMostOnceEvery: 1 } },
    })
    expect(changed.statusCode, changed.body).toBe(403)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asPerson })
    expect(deleted.statusCode, deleted.body).toBe(403)

    const still = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
    expect(still.statusCode, still.body).toBe(200)
    expect((JSON.parse(still.body) as { counter: { atMostOnceEvery: number } }).counter.atMostOnceEvery).toBe(30)
  })
})

// ============================================================ 2. who filed it

describe('who filed a counter is the office’s own stamp', () => {
  it('writes the caller as the one who filed it, and defaults who may add to that party', async () => {
    const made = await fileACounter(A_PLAIN_COUNTER)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const counter = made.body.counter as {
      createdBy: { kind: string; id: string }
      mayAdd: { anyone: boolean; who: { id: string }[] }
      count: number
      mayChange: string
    }
    expect(counter.createdBy).toMatchObject({ kind: 'agent', id: idOf('counter-keeper') })
    expect(counter.mayAdd.anyone).toBe(false)
    expect(counter.mayAdd.who.map((one) => one.id)).toEqual([idOf('counter-keeper')])
    expect(counter.count, 'a counter that has counted nothing').toBe(0)
    expect(counter.mayChange).toContain('secretary')
  })

  it('refuses a body that says who filed it, and says why that is not the caller’s to write', async () => {
    const before = howManyCounters()
    const made = await fileACounter({ ...A_PLAIN_COUNTER, createdBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    expect(made.status, JSON.stringify(made.body)).toBe(403)
    expect(String(made.body.error)).toContain('written by the office')
    expect(String(made.body.error)).toContain('Nothing was written.')
    expect(howManyCounters(), 'the refused write filed a counter anyway').toBe(before)
  })

  it('refuses a caller no registry holds, and names the way on', async () => {
    const before = howManyCounters()
    const made = await fileACounter(A_PLAIN_COUNTER, asAgent('nobody-has-registered-this-one'))
    expect(made.status, JSON.stringify(made.body)).toBe(403)
    expect(String(made.body.error)).toContain('POST /api/agents/started')
    expect(howManyCounters()).toBe(before)
  })
})

// ============================================================ 3. who may add (CT2)

describe('an addition by an allowed caller, and by one the counter does not allow', () => {
  it('counts the allowed caller’s addition, with the reason they gave', async () => {
    const made = await fileACounter({
      ...A_PLAIN_COUNTER,
      title: 'Trials the adder may count',
      mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'counter-adder' }] },
    })
    const id = (made.body.counter as { id: string }).id

    const added = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/add`,
      headers: asAgent('counter-adder'),
      payload: { by: 1, because: 'One trial on the reprinted jaw.' },
    })
    expect(added.statusCode, added.body).toBe(201)
    const said = JSON.parse(added.body) as { row: { by: { id: string }; because: string; count: number }; counter: { count: number }; fired: unknown }
    expect(said.row.by.id).toBe(idOf('counter-adder'))
    expect(said.row.because).toBe('One trial on the reprinted jaw.')
    expect(said.counter.count).toBe(1)
    expect(said.fired, 'it fired at one, and its trigger is three').toBeNull()
  })

  it('refuses a caller the counter does not allow, names who may, and writes nothing', async () => {
    const made = await fileACounter({
      ...A_PLAIN_COUNTER,
      title: 'Trials only the adder may count',
      mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'counter-adder' }] },
    })
    const id = (made.body.counter as { id: string }).id
    const before = everyRow().length

    const refused = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/add`,
      headers: asAgent('counter-stranger'),
      payload: { by: 1, because: 'A trial by somebody this counter does not allow.' },
    })
    expect(refused.statusCode, refused.body).toBe(403)
    const said = JSON.parse(refused.body) as { error: string }
    expect(said.error, 'the refusal does not name who may add').toContain('Synthetic counter-adder')
    expect(said.error).toContain('Nothing was written.')
    expect(everyRow().length, 'the refused addition was counted anyway').toBe(before)
  })

  it('lets anybody registered add when the counter says so, and still refuses a stranger to the registry', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials anybody may count', mayAdd: { anyone: true, who: [] } })
    const id = (made.body.counter as { id: string }).id

    const byAnother = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/add`,
      headers: asAgent('counter-stranger'),
      payload: { by: 1, because: 'Anybody registered may count this one.' },
    })
    expect(byAnother.statusCode, byAnother.body).toBe(201)

    const before = everyRow().length
    const byNobody = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/add`,
      headers: asAgent('not-in-the-registry'),
      payload: { by: 1, because: 'Nobody has registered this caller.' },
    })
    expect(byNobody.statusCode, byNobody.body).toBe(403)
    expect(everyRow().length).toBe(before)
  })
})

// ============================================================ 4. who may change (CT6)

describe('only whoever filed it, a secretary or the owner may change what a counter does', () => {
  it('refuses a change by somebody else, names who may, and changes nothing', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials with a trigger of three' })
    const id = (made.body.counter as { id: string }).id

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asAgent('counter-stranger'),
      payload: { triggers: [{ kind: 'count', n: 1 }], because: 'I would like it to fire sooner.' },
    })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(String((JSON.parse(refused.body) as { error: string }).error)).toContain('Synthetic counter-keeper')

    const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
    const counter = (JSON.parse(read.body) as { counter: { triggers: { n?: number }[] } }).counter
    expect(counter.triggers[0]?.n, 'the refused change moved the trigger anyway').toBe(3)
  })

  it('lets whoever filed it change it, and keeps who, when and why on the record', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials that grow a longer limit' })
    const id = (made.body.counter as { id: string }).id

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asAgent('counter-keeper'),
      payload: { atMostOnceEvery: 120, because: 'The whole suite takes an hour, so twice an hour is too often.' },
    })
    expect(changed.statusCode, changed.body).toBe(200)

    const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
    const said = JSON.parse(read.body) as {
      counter: { atMostOnceEvery: number }
      changes: { at: string; by: { id: string }; because: string }[]
    }
    expect(said.counter.atMostOnceEvery).toBe(120)
    const change = said.changes.at(-1)
    expect(change?.because).toBe('The whole suite takes an hour, so twice an hour is too often.')
    expect(change?.by.id).toBe('counter-keeper')
    expect(change?.at, 'a change with no moment on it').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('lets the owner change it as well, because it is the owner’s office', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials the owner retunes' })
    const id = (made.body.counter as { id: string }).id
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asPerson,
      payload: { triggers: [{ kind: 'count', n: 5 }], because: 'Five trials is a better batch.' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
  })

  it('refuses a change that says nothing about why', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials nobody says why about' })
    const id = (made.body.counter as { id: string }).id
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asAgent('counter-keeper'),
      payload: { atMostOnceEvery: 60 },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('says why')
  })

  it('refuses a limit that would let it fire more often than twice an hour', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials with too short a limit', atMostOnceEvery: 5 })
    expect(made.status, JSON.stringify(made.body)).toBe(400)
    expect(String(made.body.error)).toContain('only be made LONGER')
  })
})

// ============================================================ 4a. it is a record like any other

describe('a counter is listed, read and linked like any record', () => {
  it('appears in the records list, reads back through the record doors, and takes a link', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials something else is about' })
    const id = (made.body.counter as { id: string }).id

    // CT1: it is a record. The general doors refuse WRITING one and refuse nothing else.
    const listed = await app.inject({ method: 'GET', url: '/api/records?kind=counter', headers: asPerson })
    expect(listed.statusCode, listed.body).toBe(200)
    expect((JSON.parse(listed.body) as { records: { id: string }[] }).records.map((one) => one.id)).toContain(id)

    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: asPerson })
    expect(read.statusCode, read.body).toBe(200)

    const note = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asPerson,
      payload: { kind: 'note', title: 'What the trials are for', data: {} },
    })
    expect(note.statusCode, note.body).toBe(201)
    const linked = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asPerson,
      payload: { fromId: (JSON.parse(note.body) as { record: { id: string } }).record.id, toId: id, type: 'about' },
    })
    expect(linked.statusCode, linked.body).toBe(201)
  })
})

// ============================================================ 4b. the name at reading level 1

describe('a counter gets its name at reading level 1 through its own door', () => {
  it('writes the label when it is filed, because the ordinary short-forms door refuses this kind', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials with a name of their own', label: 'Gripper trial count' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const id = (made.body.counter as { id: string }).id

    const read = await app.inject({ method: 'GET', url: `/api/records/${id}/short-forms`, headers: asPerson })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.body).toContain('Gripper trial count')

    // AND THE ORDINARY DOOR IS STILL REFUSED, which is why the label has to come through this one.
    const revisions = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: asPerson })
    const newest = (JSON.parse(revisions.body) as { revisions: { seq: number; contentHash: string }[] }).revisions.at(-1)
    const byTheOtherDoor = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/short-forms`,
      headers: asPerson,
      payload: { madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash }, forms: { label: 'A name by the back door' } },
    })
    expect(byTheOtherDoor.statusCode, byTheOtherDoor.body).toBe(403)
  })

  it('writes a new name on a change, with the reason for the change', async () => {
    const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Trials renamed later', label: 'The first name' })
    const id = (made.body.counter as { id: string }).id
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asAgent('counter-keeper'),
      payload: { label: 'The better name', because: 'The first name said nothing about what it counts.' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}/short-forms`, headers: asPerson })
    expect(read.body).toContain('The better name')
  })
})

// ============================================================ 5. the loop (CT6)

describe('a counter that would add to itself is refused, with the loop named', () => {
  /** A group with the keeper in it, so a line written into it has somebody to reach. */
  async function aGroup(name: string): Promise<string> {
    const r = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: asPerson,
      payload: {
        name,
        because: 'A group for the counter loop test.',
        members: [{ who: { kind: 'agent', id: 'counter-keeper' }, because: 'It reads the lines the counter writes.' }],
      },
    })
    expect(r.statusCode, r.body).toBe(201)
    return (JSON.parse(r.body) as { group: { id: string } }).group.id
  }

  it('refuses the direct ring: it writes into the group it follows', async () => {
    const group = await aGroup('The direct ring')
    const before = howManyCounters()
    const made = await fileACounter({
      title: 'Messages in the ring',
      counts: 'Messages in a group this counter also writes into.',
      follows: [{ event: 'group-message', group }],
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'message', group },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(409)
    expect(String(made.body.error)).toContain('would add to itself')
    expect(String(made.body.error)).toContain('The direct ring')
    expect(howManyCounters(), 'the refused counter was filed anyway').toBe(before)
  })

  it('refuses the ring that runs through another counter', async () => {
    const one = await aGroup('The first room')
    const two = await aGroup('The second room')
    // A counter that follows the second room and writes into the first. On its own it loops nothing.
    const bridge = await fileACounter({
      title: 'The bridge',
      counts: 'Messages in the second room.',
      follows: [{ event: 'group-message', group: two }],
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'message', group: one },
    })
    expect(bridge.status, JSON.stringify(bridge.body)).toBe(201)

    // And one that follows the first room and writes into the second, which closes the ring.
    const before = howManyCounters()
    const closes = await fileACounter({
      title: 'The one that closes it',
      counts: 'Messages in the first room.',
      follows: [{ event: 'group-message', group: one }],
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'message', group: two },
    })
    expect(closes.status, JSON.stringify(closes.body)).toBe(409)
    expect(String(closes.body.error)).toContain('The bridge')
    expect(howManyCounters()).toBe(before)
  })

  it('refuses a CHANGE that would close a ring, as well as a filing', async () => {
    const group = await aGroup('The room a change closes')
    const made = await fileACounter({
      title: 'Safe until it is changed',
      counts: 'Messages in a group it does not write into yet.',
      follows: [{ event: 'group-message', group }],
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'task', title: 'Read the room' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const id = (made.body.counter as { id: string }).id

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: asAgent('counter-keeper'),
      payload: { action: { kind: 'message', group }, because: 'A line in the room would be easier to notice.' },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.body).toContain('would add to itself')

    const read = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
    expect((JSON.parse(read.body) as { counter: { action: { kind: string } } }).counter.action.kind).toBe('task')
  })
})

// ============================================================ 6. the office jobs (CT4c)

describe('a counter naming an office job nobody has registered is refused in words', () => {
  it('says there is no such job without pretending it exists', async () => {
    const before = howManyCounters()
    const made = await fileACounter({
      ...A_PLAIN_COUNTER,
      title: 'The counter that wants a job nobody has built',
      action: { kind: 'job', job: 'merge-queue.whole-suite-on-main' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(400)
    expect(String(made.body.error)).toContain('no office job called "merge-queue.whole-suite-on-main"')
    expect(String(made.body.error)).toContain('Nothing was written.')
    expect(howManyCounters()).toBe(before)
  })

  it('takes the job once something registers it, and refuses it again once it is gone', async () => {
    jobs.registerAnOfficeJob({ name: 'test.a-job-for-this-test', what: 'Does nothing at all, for a test.' })
    const made = await fileACounter({
      ...A_PLAIN_COUNTER,
      title: 'The counter that wants the test job',
      action: { kind: 'job', job: 'test.a-job-for-this-test' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    jobs.forgetAnOfficeJob('test.a-job-for-this-test')

    const after = await fileACounter({
      ...A_PLAIN_COUNTER,
      title: 'The counter that wants it after it is gone',
      action: { kind: 'job', job: 'test.a-job-for-this-test' },
    })
    expect(after.status, JSON.stringify(after.body)).toBe(400)
  })
})

// ============================================================ 7. the list, and what it says when empty

describe('the list says what it holds, and says so in words when it holds nothing', () => {
  it('says a project with no counters has none, rather than answering an empty list and stopping', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/counters',
      headers: { ...asPerson, 'x-mole-office-workspace': 'robotics' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const said = JSON.parse(r.body) as { counters: unknown[]; says: string }
    expect(said.counters).toEqual([])
    expect(said.says).toContain('no counters')
  })

  it('counts the ones it holds, and says how many are running', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/counters', headers: asPerson })
    const said = JSON.parse(r.body) as { counters: { title: string }[]; says: string }
    expect(said.counters.length).toBeGreaterThan(1)
    expect(said.says).toMatch(/\d+ counters?, of which \d+ (is|are) running/)
    const titles = said.counters.map((one) => one.title)
    expect([...titles].sort((a, b) => a.localeCompare(b)), 'the list is not sorted by title').toEqual(titles)
  })
})

it('readOneCounter names every row beyond its limit, within the before cursor', async () => {
  const made = await fileACounter({ ...A_PLAIN_COUNTER, title: 'Synthetic capped counter rows' })
  expect(made.status).toBe(201)
  const id = (made.body.counter as { id: string }).id
  for (let i = 0; i < 7; i++) {
    const added = await app.inject({
      method: 'POST', url: `/api/counters/${id}/add`, headers: asAgent('counter-keeper'),
      payload: { by: 1, because: 'Synthetic row for the cap proof.' },
    })
    expect(added.statusCode, added.body).toBe(201)
  }
  const stored = t.client.sqlite.prepare('SELECT id, seq FROM counter_rows WHERE counter_id = ? ORDER BY seq DESC').all(id) as { id: string; seq: number }[]
  for (const before of [undefined, stored[1]!.seq]) {
    const eligible = stored.filter((row) => before === undefined || row.seq < before)
    const response = await app.inject({
      method: 'GET', url: `/api/counters/${id}?limit=2${before === undefined ? '' : `&before=${before}`}`, headers: asPerson,
    })
    expect(response.statusCode, response.body).toBe(200)
    const body = response.json()
    expect(body.rows.map((row: { seq: number }) => row.seq)).toEqual(eligible.slice(0, 2).map((row) => row.seq))
    expect(body.more).toBe(true)
    expect(body.subtraction).toEqual({ candidates: eligible.length, carried: 2, leftOut: eligible.length - 2, shortened: 0 })
    expect(body.leftOutGroups).toEqual([{
      cause: 'budget', bucket: 'row_limit', count: eligible.length - 2, ids: eligible.slice(2).map((row) => row.id),
    }])
    expect(body.says).toBe(`Rows of this counter left out beyond this reply’s row limit: ${String(eligible.length - 2)}.`)
  }
  // ONE ROW LEFT OUT reads as a sentence too, and a reply that carries every row says nothing about it.
  const oneShort = (await app.inject({ method: 'GET', url: `/api/counters/${id}?limit=${String(stored.length - 1)}`, headers: asPerson })).json()
  expect(oneShort.says).toBe('Rows of this counter left out beyond this reply’s row limit: 1.')
  const whole = (await app.inject({ method: 'GET', url: `/api/counters/${id}?limit=${String(stored.length)}`, headers: asPerson })).json()
  expect(whole.subtraction.leftOut).toBe(0)
  expect(whole.says).toBeNull()
})
