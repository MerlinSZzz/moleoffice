// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/waiting` — one reading, three sources, one stated scope.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH BLOCK BELOW EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE THREE SOURCES ARE THREE. A refused act, an agent's request, and the owner's own
 *    set-aside each put a row here, each row says which, and the three counts sum to the list.
 *
 * 2. TIER 1 IS ASKED OF THE GUARDS. The membership test hands `readWaiting` an act whose guard
 *    does not refuse and watches the rows disappear. If tier 1 were a hand-kept list of acts, that
 *    test would pass with the guards deleted — which is the whole failure it exists to catch.
 *
 * 3. THE DEDUP RULE, WHICH IS THE ONE WITH A MEASURED DEFECT BEHIND IT. An item that qualifies
 *    under a tier AND carries a live set-aside is ONE row, in tier `set-aside`, keeping the tier
 *    and the reason it came from. The second version of this design had the order the other way
 *    round, which made tier 3 unreachable: everything the owner set aside was promoted straight
 *    back into the tier it came from, the band read `0 set aside` for ever, and the control that
 *    wrote the two fields changed nothing anybody could see. Reversing `TIER_ORDER` in
 *    src/server/lib/waiting.ts turns the two tests named `is one row, in the set-aside tier` red.
 *
 * 4. WHAT IS NOT COUNTED IS SAID. A queued run nobody has picked up, and a deleted record
 *    something still points at, are both named with a count rather than dropped.
 *
 * 5. THE SCOPE IS THE STATED ONE. Rows come from every project, the route takes nothing, and a row
 *    carries no body, no summary and no field values.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A SET-ASIDE IS BUILT HERE, AND WHY IT GOES ROUND THE WRITE PATH
 * ---------------------------------------------------------------------------------------
 *
 * `set_aside_until` and `set_aside_because` are read off `records.data`, which is a JSON column, so
 * the reading needs no migration. They are not declared on any kind yet, and an undeclared key is a
 * 400 at the write gate — deliberately, because that gate is what stops a typo becoming a field.
 * So these tests write the state with `writeDataBypassingTheGate`, the helper this repository keeps
 * for exactly this: building a state the product's own write path will not make.
 *
 * That has one visible consequence and the tests assert it rather than hiding it: a set-aside
 * written round the write path leaves no revision, so the ledger cannot say who set it aside and
 * the row says nobody recorded who. When the two fields are declared and written through the door,
 * `by` carries the writer and these tests gain the other half.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
// TYPE ONLY, AND THEREFORE ERASED BEFORE THIS FILE RUNS. Naming these modules at the top of a test
// does not import them; both reach src/server/db/client.ts, which opens MOLE_OFFICE_DB the moment it is
// imported, so the values below are imported inside `beforeEach` after `freshDb()` has pointed that
// variable at a throwaway file. tests/helpers.ts states the rule at length.
import type { WaitingReply } from '../src/server/api/waiting.ts'
import type { Because, PendingAct, WaitingItem } from '../src/server/lib/waiting.ts'

let t: TestDb
let app: FastifyInstance
/** The reading itself, and the registry it derives tier 1 from, loaded after the database exists. */
let waiting: typeof import('../src/server/lib/waiting.ts')
let guards: (typeof import('../src/server/lib/records.ts'))['GOVERNANCE_GUARDS']

const PANELX = 'panelx'
const ROBOTICS = 'robotics'

/**
 * ONE OFFICE FOR THIS BLOCK. Each describe block of this file gets its own, and none is started at
 * the top of the file, so a block that needs an empty office can have one and closing it can never
 * leave a later block reading a folder that has gone.
 */
function shareOneOffice(): void {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    waiting = await import('../src/server/lib/waiting.ts')
    guards = (await import('../src/server/lib/records.ts')).GOVERNANCE_GUARDS
    for (const [id, title] of [
      [PANELX, 'Mole Office'],
      [ROBOTICS, 'Robotics'],
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
      expect(res.statusCode, res.body).toBe(201)
    }
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  /**
   * THE WHOLE OFFICE AS THIS CASE FOUND IT. The reading is about every project on purpose, and a
   * previous case's records stay in the office. So the counts and the list below are read as the
   * difference from these, never as an assumption that nothing else is there.
   */
  beforeEach(async () => {
    atStart = shapeOf(await read())
  })
}

let atStart: ReplyShape

interface ReplyShape {
  ids: Set<string>
  counts: WaitingReply['counts']
  excluded: Map<string, number>
}

function shapeOf(reply: WaitingReply): ReplyShape {
  return {
    ids: new Set(reply.items.map((item) => item.id)),
    counts: { ...reply.counts },
    excluded: new Map(reply.excluded.map((group) => [group.reason, group.count])),
  }
}

/** The rows this case added, so a reading over every project still sees only them. */
function addedRows(reply: WaitingReply): WaitingItem[] {
  return reply.items.filter((item) => !atStart.ids.has(item.id))
}

/** How many rows of one tier this case added. A negative answer is exported unchanged. */
function addedCount(reply: WaitingReply, tier: keyof WaitingReply['counts']): number {
  return reply.counts[tier] - atStart.counts[tier]
}

/** How many excluded objects of one reason this case added. */
function addedExcluded(reply: WaitingReply, reason: string): number {
  const before = atStart.excluded.get(reason) ?? 0
  const group = reply.excluded.find((one) => one.reason === reason)
  return (group?.count ?? 0) - before
}

const asAgent = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': workspaceId,
})

/**
 * Headers as the person sends them.
 *
 * USED WHEREVER A TEST HAS TO CLOSE OR DELETE SOMETHING THAT CARRIES A REQUEST FOR A PERSON, and
 * that is not incidental. Closing a record that asks the owner something, and deleting one, are two
 * of the three acts wave 2 refuses to an agent — so a test that did either as an agent would be
 * testing a hole rather than the reading, and would go red the day that guard lands.
 */
const asPerson = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspaceId,
})

async function file(workspaceId: string, kind: string, title: string, data: unknown = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(workspaceId),
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * A fork on the owner's list: a proposal nobody has settled, that the agent filing it handed up to the owner.
 *
 * `who_settles_it` IS NAMED SINCE 3 SEPTEMBER 2026, and it is what puts the fork on this list. A
 * fork an agent files says "an agent" unless the agent names somebody else — the ruling
 * that an engineering question is the agent's, `design/messages/ACCEPTANCE.md` W3 — and a fork that
 * says "an agent" is deliberately not on the owner's list. Naming the owner is the filing agent's own statement,
 * and it is the case every test below is about.
 */
async function aFork(workspaceId: string, title: string): Promise<string> {
  return file(workspaceId, 'proposal', title, {
    question: 'Which way?',
    options: ['one', 'the other'],
    who_settles_it: 'the owner',
  })
}

/** A problem an agent says the next move on is a person's. */
async function anAsk(workspaceId: string, title: string): Promise<string> {
  return file(workspaceId, 'problem', title, {
    symptom: 'something is wrong',
    state: 'open',
    whose_move: 'person',
  })
}

/**
 * The same problem, written by the PERSON, and it is a different row because a different rule holds.
 *
 * `assertMayRemoveAnAsk` lets an agent withdraw only the request it wrote itself, so what an agent
 * can do about a row depends on who asked, and the row's sentence says so. A test that only ever
 * filed asks as an agent could not tell those two sentences apart.
 */
async function anAskFromThePerson(workspaceId: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson(workspaceId),
    payload: {
      kind: 'problem',
      title,
      data: { symptom: 'something is wrong', state: 'open', whose_move: 'person' },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** One agent trying to clear the question on a record, by name. The act the row makes a promise about. */
async function withdrawAs(recordId: string, agentId: string): Promise<number> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${recordId}`,
    headers: { ...asAgent(PANELX), 'x-mole-office-actor-id': agentId },
    payload: { dataPatch: { whose_move: null } },
  })
  return res.statusCode
}

/** The record's stored `data`, as it stands, so a set-aside can be added without losing it. */
function dataOf(recordId: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(recordId) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** Push an item away, the way the owner will once the two fields are declared. */
function setAside(recordId: string, aside: { until?: string; because?: string }): void {
  writeDataBypassingTheGate(t, recordId, {
    ...dataOf(recordId),
    ...(aside.until === undefined ? {} : { set_aside_until: aside.until }),
    ...(aside.because === undefined ? {} : { set_aside_because: aside.because }),
  })
}

async function read(): Promise<WaitingReply> {
  const res = await app.inject({ method: 'GET', url: '/api/waiting' })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WaitingReply
}

const rowFor = (reply: WaitingReply, id: string): WaitingItem =>
  one(
    reply.items.filter((item) => item.id === id),
    `row for ${id} (got ${reply.items.length} rows: ${reply.items.map((i) => `${i.id}:${i.tier}`).join(', ')})`,
  )

// ============================================================================ the three sources

/**
 * AN EMPTY OFFICE KEEPS AN OFFICE OF ITS OWN, because no shared office can be empty. It is started
 * and closed inside this block, and no other block reads it.
 */
describe('an empty corpus', () => {
  let emptyT: TestDb
  let emptyApp: FastifyInstance

  beforeAll(async () => {
    emptyT = await freshDb()
    emptyApp = (await apiApp()).app
    await emptyApp.ready()
  }, 60_000)

  afterAll(async () => {
    await emptyApp.close()
    emptyT.close()
  })

  it('is empty on an empty corpus, and says so rather than saying nothing', async () => {
    const res = await emptyApp.inject({ method: 'GET', url: '/api/waiting' })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as WaitingReply
    expect(reply.items).toEqual([])
    expect(reply.counts).toEqual({ settle: 0, asked: 0, setAside: 0 })
    expect(reply.note).toContain('Nothing is waiting on you')
  })
})

describe('one reading answers what is waiting on the person', () => {
  shareOneOffice()

  it('carries a fork as a row to settle, and names every door that was refused', async () => {
    const fork = await aFork(PANELX, 'Which module boundary')
    const reply = await read()

    const row = rowFor(reply, fork)
    expect(row.tier).toBe('settle')
    expect(row.act).toBe('settle')
    expect(row.because.rule).toBe('refused-act')
    const because = row.because as Extract<Because, { rule: 'refused-act' }>
    expect(because.doors.map((door) => door.guard).sort()).toEqual([
      'assertMayRemoveAFork',
      'assertMaySettleFork',
      'assertMayWrite',
    ])
    // The route each guard stands at is on the row, because "you may not" without "and this is
    // where it would have happened" is half an answer. It is read off the registry entry, so this
    // is the registry's own sentence about that guard and not a second copy of it.
    expect(because.doors.some((door) => door.route.includes('POST /api/records/:id/promote'))).toBe(true)
  })

  it('carries a record an agent asked about, with who asked and when, off the revision ledger', async () => {
    const ask = await anAsk(PANELX, 'A block that was put down still reads as live')
    const reply = await read()

    const row = rowFor(reply, ask)
    expect(row.tier).toBe('asked')
    expect(row.act).toBe('answer')
    const because = row.because as Extract<Because, { rule: 'whose-move' }>
    expect(because.rule).toBe('whose-move')
    // The change log logs only the title on a create, so a reader that asked it would have no
    // answer at all here. The ledger stores the whole record on every write, create included.
    expect(because.writtenBy).toBe('claude-code')
    expect(because.actorType).toBe('agent')
    expect(because.at).not.toBeNull()
    expect(row.since).toBe(because.at)
  })

  it('drops a request the moment the record it is on reaches an end state', async () => {
    const ask = await anAsk(PANELX, 'A problem somebody fixed')
    expect(addedCount(await read(), 'asked')).toBe(1)

    // THE OWNER CLOSES IT, AND THAT CLOSE IS THE ANSWER. A human is refused nothing here.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${ask}`,
      headers: asPerson(PANELX),
      payload: { dataPatch: { state: 'fixed' } },
    })
    expect(res.statusCode, res.body).toBe(200)

    // The field is NOT cleared: a stale `whose_move` on a closed record is a record of what was
    // once asked. Membership is derived, so the item leaves by derivation and nothing is written.
    expect(dataOf(ask)['whose_move']).toBe('person')
    // NOTHING WAS ADDED, and the closed record's row is gone. The reading still spans the office.
    expect(addedRows(await read())).toEqual([])
  })

  it('spans projects, and every row says which project it is in', async () => {
    const here = await aFork(PANELX, 'A fork in this project')
    const there = await anAsk(ROBOTICS, 'A question in the other project')

    const reply = await read()
    expect(addedRows(reply).map((item) => item.id).sort()).toEqual([here, there].sort())
    expect(rowFor(reply, there).workspaceId).toBe(ROBOTICS)
    expect(rowFor(reply, there).workspaceTitle).toBe('Robotics')
  })

  it('carries no body, no summary and no field values — the scope it states', async () => {
    const ask = await anAsk(PANELX, 'A question with a long symptom in it')
    const reply = await read()

    // A ROW IS A FIXED SHAPE. A row that grew a `data` or a `summary` would make this reading a way
    // to read another project, which is exactly what its own scope sentence promises it is not.
    // A ROW IS A FIXED SHAPE. A row that grew a `data` or a `summary` would make this reading a way
    // to read another project, which is exactly what its own scope sentence promises it is not.
    // `said` is on the wire since problem 1LfS2wzuJerO: on the one row that is a planning intent it
    // carries the person's own words about time, and it is null on every other row. It is no
    // field value of the record and not its body — it is what the press would spend.
    expect(Object.keys(rowFor(reply, ask)).sort()).toEqual(
      [
        'act',
        'because',
        'blocking',
        // WHICH REGISTERED AGENT THE ROW CAME FROM, or which of the two kinds of none it is (round 31b of wave 13k).
        // A registry id and a word, not a field value of the record and not its body: Home's agent column marks an
        // agent as needing the person from it, so the mark and the Needs you box are one reading.
        'fromAgent',
        'id',
        'kind',
        'said',
        // WHAT AN AGENT DID HERE ON THE OWNER'S OWN QUOTED WORDS, or null, which is the ordinary answer. It
        // is not a field value of the record and it is not its body: it is the act and the owner's sentence,
        // which the row draws wherever it says who did anything. `design/messages/ACCEPTANCE.md` W2.
        'onThePersonsWords',
        // AND WHO PASSED THIS QUESTION ON TO THE OWNER, or null because nobody had to. Criterion P55. It
        // is a name and a stamp, not a field value of the record and not its body: a question an
        // agent with a starter asks is with that starter until somebody hands it over, and the row
        // says who did.
        'passedOnBy',
        // AND THE FORK DESK'S OWN SENTENCE ABOUT A STORED SUPERSEDES LINK, or null. Problem lXf2ecxwr3sk: the owner's
        // list names a fork's link as the fork desk does. It is a sentence about a link, not a field value or a body.
        'replacedButStillHere',
        'since',
        'tier',
        'title',
        'why',
        'workspaceId',
        'workspaceTitle',
      ].sort(),
    )
    expect(reply.scope).toContain('No body, no summary, no field values')
  })

  it('has three parts that sum, because they have one scope', async () => {
    await aFork(PANELX, 'One fork')
    await anAsk(PANELX, 'One question')
    const aside = await anAsk(ROBOTICS, 'One thing pushed away')
    setAside(aside, { until: '2099-01-01' })

    const reply = await read()
    expect(addedCount(reply, 'settle')).toBe(1)
    expect(addedCount(reply, 'asked')).toBe(1)
    expect(addedCount(reply, 'setAside')).toBe(1)
    expect(reply.counts.settle + reply.counts.asked + reply.counts.setAside).toBe(reply.items.length)
    // THE NOTE STATES THE SAME NUMBERS AND THE SAME TOTAL, read back from the reply rather than retyped.
    expect(reply.note).toContain(
      `${String(reply.counts.settle)} to settle, ${String(reply.counts.asked)} asked of you, ${String(reply.counts.setAside)} set aside`,
    )
    expect(reply.note).toContain(
      `${String(reply.items.length)} ${reply.items.length === 1 ? 'thing is' : 'things are'} waiting on you`,
    )
  })
})

// ============================================================================ derived, not listed

describe('tier 1 is derived from the guard functions', () => {
  shareOneOffice()

  it('is built from the acts, and every one of them has a door to ask', () => {
    // THE CONTROL. If this list were empty the tests below would pass with the derivation deleted.
    // Five acts today: settling a fork, putting kept words about time on the calendar, accepting a
    // relationship a machine guessed about which code a record owns, confirming a returned task,
    // and confirming an agent-filed goal. Each arrived the same way — a guard registered with a
    // queue behind it — and the assertion three cases below makes ignoring one a failing build
    // rather than a short queue. `confirm-goal` and `confirm-return` keep those acts apart from
    // `confirm`, which means "let this visitor in".
    expect(waiting.PENDING_ACTS.map((act) => act.act).sort()).toEqual([
      'accept',
      'confirm-goal',
      'confirm-return',
      'schedule',
      'settle',
    ])
    expect(waiting.PENDING_ACTS.every((act) => act.doors.length > 0)).toBe(true)
  })

  it('names each door with the guard and the route the registry holds, never with its own copy', () => {
    const asked = waiting.PENDING_ACTS.flatMap((act) => act.doors)
    for (const door of asked) {
      const entry = one(
        guards.filter((registered) => registered.guard.name === door.guard),
        `registry entry for ${door.guard}`,
      )
      expect(door.route).toBe(entry.route)
    }
  })

  /**
   * THE RECONNECT, HELD BY A TEST RATHER THAN BY SOMEBODY REMEMBERING.
   *
   * A registered guard whose `pendingWhen` is not null has a queue of objects the owner has to act
   * on. If this reading does not ask that guard, those objects are waiting on the person and are on
   * no list — the queue is short and nothing says so, which is the failure the whole design exists
   * to end. Wave 2 step 3 registers a fifth guard on `commitIntent`; the day it arrives with a
   * pending clause, this goes red naming it.
   */
  it('asks every registered guard that has a queue of objects pending on it', () => {
    const asked = new Set(waiting.PENDING_ACTS.flatMap((act) => act.doors.map((door) => door.guard)))
    const withAQueue = guards.filter((entry) => entry.pendingWhen !== null)
    expect(withAQueue.length).toBeGreaterThan(0)
    expect(withAQueue.filter((entry) => !asked.has(entry.guard.name)).map((entry) => entry.guard.name)).toEqual([])
  })

  it('carries kept words about time that only a person may put on the calendar', async () => {
    const work = await file(PANELX, 'task', 'Rebuild the arm mount')
    const kept = await app.inject({
      method: 'POST',
      url: '/api/planning/intents',
      headers: asPerson(PANELX),
      payload: { said: 'about 6h next week', recordId: work, period: '2026-W36', hours: 6 },
    })
    expect(kept.statusCode, kept.body).toBe(201)
    const intentId = (kept.json() as { intent: { id: string } }).intent.id

    const reply = await read()
    const row = rowFor(reply, intentId)
    expect(row.tier).toBe('settle')
    expect(row.act).toBe('schedule')
    expect(row.title).toBe('Rebuild the arm mount')
    // THE WORK THE TIME IS FOR. Problem 1LfS2wzuJerO: the row used to be titled `intent.said`,
    // which put the owner's own estimate "around 1.5 maybe more" on the owner's screen with no name on it. The
    // words are kept in `said` beside the title; the eighth rule keeps them unparsed wherever they
    // are drawn, and the interface shows a label and the words, never a parse.
    expect(row.said).toBe('about 6h next week')
    expect(row.kind).toBe('planning intent')
    expect(row.workspaceId).toBe(PANELX)
    const because = row.because as Extract<Because, { rule: 'refused-act' }>
    expect(because.doors.map((door) => door.guard)).toEqual(['assertMayCommitAnIntent'])
    expect(row.why).toContain('put this time on your calendar')
  })

  it('holds no row for an act whose guards do not refuse an agent', async () => {
    const fork = await aFork(PANELX, 'A fork the guards protect')
    expect(waiting.readWaiting().counts.settle).toBe(atStart.counts.settle + 1)

    // The same pending objects, the same route, the same words — and a guard that allows. Nothing
    // about the record changed. If membership came from a list of acts rather than from asking the
    // guards, this would still be a row.
    const openDoor: PendingAct = {
      ...one([...waiting.PENDING_ACTS].filter((act) => act.act === 'settle'), 'act that settles a fork'),
      doors: [
        {
          guard: 'aGuardThatAllows',
          route: 'POST /api/records/:id/promote',
          what: 'settle it',
          ask: () => {
            /* refuses nothing */
          },
        },
      ],
    }
    const reading = waiting.readWaiting([openDoor])
    expect(reading.counts.settle).toBe(0)
    expect(reading.items.map((item) => item.id)).not.toContain(fork)
  })
})

// ============================================================================ the dedup rule

describe('an item that qualifies twice is one row', () => {
  shareOneOffice()

  it('is one row, in the set-aside tier, when a request is also set aside', async () => {
    const ask = await anAsk(PANELX, 'A question the owner pushed away')
    setAside(ask, { until: '2099-01-01' })

    const reply = await read()
    // ONE ROW. Dedup is on the underlying object id, across every source.
    expect(addedRows(reply)).toHaveLength(1)
    const row = rowFor(reply, ask)
    expect(row.tier).toBe('set-aside')
    expect(addedCount(reply, 'setAside')).toBe(1)
    expect(addedCount(reply, 'asked')).toBe(0)
    // AND IT KEEPS WHY IT QUALIFIED. Pushing something away never loses where it came from.
    expect(row.setAsideFrom?.tier).toBe('asked')
    expect(row.setAsideFrom?.because.rule).toBe('whose-move')
    expect(row.setAsideFrom?.why).toContain('claude-code')
  })

  it('is one row, in the settle tier, when a fork also carries a request', async () => {
    const fork = await aFork(PANELX, 'A fork an agent also asked about')
    // A PROPOSAL DOES NOT DECLARE `whose_move`, so the write gate refuses it and this state can only
    // be built the way an old corpus or an import carries it. The rule being tested is what happens
    // when one object arrives through two sources, and this is how that state exists at all.
    writeDataBypassingTheGate(t, fork, { ...dataOf(fork), whose_move: 'person' })

    const reply = await read()
    expect(addedRows(reply)).toHaveLength(1)
    // A REFUSED ACT IS A STRONGER STATEMENT THAN A REQUEST, so an agent writing `whose_move` on a
    // fork cannot demote it out of the tier the guards put it in.
    expect(rowFor(reply, fork).tier).toBe('settle')
    expect(addedCount(reply, 'settle')).toBe(1)
    expect(addedCount(reply, 'asked')).toBe(0)
    expect(addedCount(reply, 'setAside')).toBe(0)
  })

  it('is one row, in the set-aside tier, when a fork to settle is also set aside', async () => {
    const fork = await aFork(PANELX, 'A fork the owner pushed away')
    setAside(fork, { because: 'after the robot arm is back together' })

    const reply = await read()
    expect(addedRows(reply)).toHaveLength(1)
    const row = rowFor(reply, fork)
    expect(row.tier).toBe('set-aside')
    expect(row.setAsideFrom?.tier).toBe('settle')
    expect(row.setAsideFrom?.because.rule).toBe('refused-act')
    expect(row.setAsideFrom?.why).toContain('Only you can settle this')
  })

  it('keeps a condition in the owner’s own words and never decides it has been met', async () => {
    const ask = await anAsk(PANELX, 'A question waiting on a delivery')
    setAside(ask, { because: 'when the second machine is on the network' })

    const row = rowFor(await read(), ask)
    const because = row.because as Extract<Because, { rule: 'set-aside' }>
    expect(because.condition).toBe('when the second machine is on the network')
    expect(because.until).toBeNull()
    expect(row.why).toContain('when the second machine is on the network')
    expect(row.why).toContain('never decides')
  })

  it('lets a date that has passed return the item to the tier it came from, writing nothing', async () => {
    const ask = await anAsk(PANELX, 'A question that came back')
    setAside(ask, { until: '2020-03-01' })

    const reply = await read()
    expect(rowFor(reply, ask).tier).toBe('asked')
    expect(addedCount(reply, 'setAside')).toBe(0)
    // NOTHING WAS WRITTEN. The field is still there; the reading simply stopped counting it live.
    expect(dataOf(ask)['set_aside_until']).toBe('2020-03-01')
  })

  it('keeps an item set aside when the date cannot be read, rather than guessing it has passed', async () => {
    const ask = await anAsk(PANELX, 'A question set aside until something unreadable')
    setAside(ask, { until: 'sometime after the summer' })

    const row = rowFor(await read(), ask)
    expect(row.tier).toBe('set-aside')
    expect((row.because as Extract<Because, { rule: 'set-aside' }>).untilRead).toBe(false)
    expect(row.why).toContain('could not read that as a date')
  })

  it('says nobody recorded who set it aside, when nothing recorded it', async () => {
    const ask = await anAsk(PANELX, 'A question set aside by nobody in particular')
    setAside(ask, { until: '2099-01-01' })

    const row = rowFor(await read(), ask)
    expect((row.because as Extract<Because, { rule: 'set-aside' }>).by).toBeNull()
    expect(row.why).toContain('Somebody set this aside')
  })
})

// ============================================================================ what is not counted

describe('what the owner might expect here and will not find is said, with a count', () => {
  shareOneOffice()

  it('puts a queued run nobody has picked up in `excluded`, not in the list', async () => {
    await anAsk(PANELX, 'A real question')
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_runs (id, thread_id, runtime, state, claimed_by, request, created_at) ' +
          "VALUES ('run-1', 'thread-1', 'claude-code', 'queued', NULL, '{}', '2026-08-20 10:00:00')",
      )
      .run()

    const reply = await read()
    expect(addedRows(reply)).toHaveLength(1)
    expect(addedExcluded(reply, 'waiting-on-a-worker')).toBe(1)
    expect(addedExcluded(reply, 'record-deleted')).toBe(0)
    const queued = one(
      reply.excluded.filter((group) => group.reason === 'waiting-on-a-worker'),
      'queued-run group',
    )
    expect(queued.sentence).toContain('nobody has picked up')
    // THE NOTE COUNTS THE SAME EXCLUDED OBJECTS IT LISTS, read back from the reply.
    const left = reply.excluded.reduce((n, group) => n + group.count, 0)
    expect(reply.note).toContain(`${String(left)} more ${left === 1 ? 'thing is' : 'things are'} not counted here`)
  })

  it('puts a deleted record something still points at in `excluded`', async () => {
    const gone = await anAsk(PANELX, 'A question whose record was deleted')
    const report = await file(PANELX, 'note', 'Something that mentions it')
    const link = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asAgent(PANELX),
      payload: { fromId: report, toId: gone, type: 'relates_to' },
    })
    expect(link.statusCode, link.body).toBe(201)

    // THE OWNER DELETES IT. An agent may not take a record that asks them something out of the
    // corpus, which is the guard beside this one; the reading is what this test is about.
    const removed = await app.inject({ method: 'DELETE', url: `/api/records/${gone}`, headers: asPerson(PANELX) })
    expect(removed.statusCode, removed.body).toBe(200)

    const reply = await read()
    // The deleted record's row is gone and nothing was added. Counted as a difference, because the
    // reading spans every project and other cases share the office.
    expect(reply.items.map((item) => item.id)).not.toContain(gone)
    expect(addedRows(reply)).toEqual([])
    expect(addedExcluded(reply, 'record-deleted')).toBe(1)
    const deleted = one(
      reply.excluded.filter((group) => group.reason === 'record-deleted'),
      'deleted-record group',
    )
    expect(deleted.sentence).toContain('nothing left to open')
  })
})

// ============================================================================ the words

describe('every row says why it is here, in words a person can read', () => {
  shareOneOffice()

  it('names the three doors on a row to settle', async () => {
    const fork = await aFork(PANELX, 'A fork')
    const row = rowFor(await read(), fork)
    expect(row.why).toContain('write the decision that settles it')
    expect(row.why).toContain('point an existing decision at it')
    expect(row.why).toContain('delete the question instead of answering it')
  })

  it('names who asked and when on a row somebody asked about', async () => {
    const ask = await anAsk(PANELX, 'A question')
    const row = rowFor(await read(), ask)
    const because = row.because as Extract<Because, { rule: 'whose-move' }>
    expect(row.why).toContain('claude-code')
    expect(row.why).toContain('an agent')
    expect(row.why).toContain(because.at ?? 'no date')
  })

  it('builds the words from the facts and from nothing else', async () => {
    const ask = await anAsk(PANELX, 'A question')
    const row = rowFor(await read(), ask)
    // One function, so a surface that draws its own row says the same sentence. A second copy of
    // these words somewhere else is what this asserts against.
    expect(row.why).toBe(waiting.whyInWords(row.because, row.kind, row.act))
  })
})

// ============================================================================ and the words are true

/**
 * THE SENTENCE THIS READING PUTS IN FRONT OF THE OWNER IS A PROMISE, SO IT IS CHECKED AGAINST THE DOOR.
 *
 * The row used to end *"an agent may withdraw its own request but may not close this or delete it
 * while the question stands"* on every row of this tier. It said nothing about WHICH agent, and the
 * guard behind it did not check: any agent could withdraw any other agent's request and then delete
 * the record, 200 and 200 — `design/round-ten/verification/wave-2.json`, `newFaults` entry 1. So the
 * one surface built to make governance visible was the surface misreporting it.
 *
 * Each test below reads the sentence AND drives the act it describes through the real route, in the
 * same test. Asserting the words alone would go green again the day the guard changes underneath
 * them, which is how this came apart the first time.
 */
describe('what the row tells the owner about agents is what the door does', () => {
  shareOneOffice()

  it('names the agent that asked, and only that agent may withdraw it', async () => {
    const ask = await anAsk(PANELX, 'A question an agent asked')
    const row = rowFor(await read(), ask)
    expect(row.why).toContain('Only claude-code can withdraw its own question.')
    expect(row.why).toContain('No other agent can')

    // THE DOOR, ASKED RATHER THAN ASSUMED. A second agent, differing from the asker in its id and in
    // nothing else, so no other clause of the guard can be what refuses it.
    expect(await withdrawAs(ask, 'another-agent')).toBe(403)
    expect(dataOf(ask)['whose_move']).toBe('person')

    // AND THE ASKER STILL CAN, which is the half that says this is a rule and not a lock.
    expect(await withdrawAs(ask, 'claude-code')).toBe(200)
    expect(dataOf(ask)['whose_move']).toBeUndefined()
  })

  it('says no agent may withdraw a question the person wrote, and none may', async () => {
    const ask = await anAskFromThePerson(PANELX, 'A question the owner wrote')
    const row = rowFor(await read(), ask)
    expect(row.why).toContain('a person,')
    expect(row.why).toContain('No agent can withdraw it, close this problem or delete it.')

    expect(await withdrawAs(ask, 'claude-code')).toBe(403)
    expect(await withdrawAs(ask, 'another-agent')).toBe(403)
    expect(dataOf(ask)['whose_move']).toBe('person')
  })

  it('no longer tells the owner something true of one agent as if it were true of all of them', async () => {
    // THE EXACT WORDS THAT WERE UNTRUE, on both kinds of row, so neither can come back by itself.
    const agentAsk = await anAsk(PANELX, 'A question an agent asked')
    const personAsk = await anAskFromThePerson(PANELX, 'A question the owner wrote')
    const reply = await read()
    for (const row of [rowFor(reply, agentAsk), rowFor(reply, personAsk)]) {
      expect(row.why).not.toContain('an agent may withdraw its own request')
    }
  })
})
