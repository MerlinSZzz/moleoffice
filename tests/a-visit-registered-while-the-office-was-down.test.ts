// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C8: WHEN THE MAIN WORLD IS DOWN.
 *
 * `design/messages/ACCEPTANCE.md` section 8: *a world records a visit locally and reports it to the
 * office when the main world answers again; the office marks it as registered late.*
 *
 * What is proved here:
 *
 *   1. a visit registered in a world that is not the office is kept there, unreported;
 *   2. a visit registered AT the office is reported the moment it is written, because that is where
 *      it landed;
 *   3. the office keeps when a visit BEGAN and records when it LEARNT, and "registered late" is
 *      those two stamps and not a third column;
 *   4. saying a visit reached the office marks it once and never moves an earlier mark;
 *   5. a world holding nothing the office has not seen says so rather than reporting nothing
 *      silently.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { HOME_HEADER } from '../src/config/visit-headers.mjs'

type VisitsLib = typeof import('../src/server/lib/visits.ts')
type OfficeLib = typeof import('../src/server/lib/office.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let app: FastifyInstance
let visits: VisitsLib
let office: OfficeLib
let world: WorldLib
let here: string

const ELSEWHERE = 'ffffffffffffffff'

const WHO = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-au',
  'x-mole-office-workspace': 'default',
}

/**
 * ONE OFFICE FOR THE FILE. The visits and the worlds they are filed against are the whole office
 * rather than a project, so each case starts with none of them: the reset after every case removes
 * what it wrote. That is the empty office the first case measures and the state the cases about a
 * visit at an office and about "the office is not here" both assume.
 */
beforeAll(async () => {
  t = await freshDb()
  visits = await import('../src/server/lib/visits.ts')
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
  app = (await apiApp()).app
  const said = world.theWorldThisDatabaseIs()
  if (said === null) throw new Error('this test database has no identity')
  here = said
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  world.forgetTheWorld()
})

afterEach(() => {
  world.forgetTheWorld()
  t.client.sqlite.prepare('DELETE FROM visits').run()
  t.client.sqlite.prepare('DELETE FROM worlds').run()
})

/** Make this database the office, which is what holding the home world means. */
function makeThisTheOffice(): void {
  office.registerWorldHere({
    name: 'my world',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    head: '905d1df',
    databaseIdentity: here,
    address: 'http://127.0.0.1:41700',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'this-installation',
  })
}

describe('a world that is not the office keeps the visit until the office answers', () => {
  it('writes it with nothing saying it reached the office', () => {
    expect(office.theOfficeIsInThisDatabase()).toBe(false)
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'reading the citizens work while the main world was down',
    })
    expect(visit.reportedAt, 'nothing has told the office about this visit yet').toBeNull()
  })

  it('still lets the visitor write, because the world that has to check it is the one holding it', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { fromWorld: ELSEWHERE, why: 'working while the main world is down' },
    })
    expect(registered.statusCode).toBe(201)
    const said = registered.json<{ visit: { reportedAt: string | null }; toldTheOffice: { reported: number } }>()
    expect(said.visit.reportedAt).toBeNull()
    expect(said.toldTheOffice.reported).toBe(0)

    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { kind: 'note', title: 'Written on a held visit', data: { body: 'x' } },
    })
    expect(made.statusCode).toBe(201)
  })

  it('says it is holding nothing, rather than reporting nothing without saying so', async () => {
    const said = await visits.reportHeldVisitsToTheOffice()
    expect(said.reported).toBe(0)
    expect(said.why).toContain('test runner')
  })
})

describe('a visit registered at the office is at the office', () => {
  it('says so on the row the moment it is written', () => {
    makeThisTheOffice()
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'bbbbbbbbbbbbbbbb',
      why: 'reading the citizens work',
    })
    expect(visit.reportedAt).not.toBeNull()
  })
})

describe('registered late is the two stamps and not a third column', () => {
  it('marks a visit whose beginning is older than the moment the office heard about it', () => {
    makeThisTheOffice()
    const began = '2026-09-04 09:00:00'
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'bbbbbbbbbbbbbbbb',
      why: 'working while the main world was down',
      since: began,
    })
    expect(visit.since).toBe(began)
    expect(visit.registeredAt > began, 'the office learnt about it after it began').toBe(true)
    expect(visit.registeredLate).toBe(true)
  })

  it('does not mark one the office heard about as it began', () => {
    makeThisTheOffice()
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'bbbbbbbbbbbbbbbb',
      why: 'reading the citizens work',
    })
    expect(visit.registeredLate).toBe(false)
  })

  it('takes the beginning the reporting world gives it, through the route the report uses', async () => {
    makeThisTheOffice()
    const began = '2026-09-04 09:00:00'
    const reported = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO },
      payload: {
        visitor: { kind: 'agent', id: 'builder-au' },
        fromWorld: ELSEWHERE,
        toWorld: 'bbbbbbbbbbbbbbbb',
        why: 'working while the main world was down',
        since: began,
      },
    })
    expect(reported.statusCode).toBe(201)
    const visit = reported.json<{ visit: { since: string; registeredLate: boolean; toWorld: string } }>().visit
    expect(visit.since).toBe(began)
    expect(visit.registeredLate).toBe(true)
    // THE WORLD THE VISITOR ACTUALLY WENT TO, and not the office. A report is one world telling the
    // office about a trip made somewhere else; an office that wrote its own identity here would
    // record a visit to itself that nobody made.
    expect(visit.toWorld).toBe('bbbbbbbbbbbbbbbb')
    expect(visit.toWorld).not.toBe(here)
  })
})

describe('saying a visit reached the office', () => {
  it('marks it once and never moves an earlier mark', () => {
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working while the main world was down',
    })
    expect(visits.visitById(visit.id)?.reportedAt).toBeNull()
    visits.thisVisitReachedTheOffice(visit.id, '2026-09-04 12:00:00')
    expect(visits.visitById(visit.id)?.reportedAt).toBe('2026-09-04 12:00:00')
    visits.thisVisitReachedTheOffice(visit.id, '2026-09-04 13:00:00')
    expect(visits.visitById(visit.id)?.reportedAt, 'the first report is when it reached the office').toBe(
      '2026-09-04 12:00:00',
    )
  })
})

/**
 * THE VISITS LIST READS A MIRROR THE SAME WAY THE WORLDS LIST DOES, and refuses one the same way.
 *
 * It is the same rule and the same function behind both — `theMirrorThisWorldMayRead` — because a
 * world either belongs to the office the declaration names or it does not, and a world that may not
 * read that office's list of worlds must not read its list of visitors either. Problem
 * `JTdajUUs23_M` was the worlds half; this is the half beside it.
 */
describe('the visits a world can see come from the same mirror rule', () => {
  it('reads a mirror it is handed, and says both lists are in the answer', async () => {
    const { writeFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const mine = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working while the main world was down',
    })
    const theirs = { ...mine, id: 'a-visit-elsewhere', why: 'a trip the office knows about' }
    const file = join(dirname(office.mirrorBesideThisDatabase()), 'the-visits-mirror.json')
    writeFileSync(
      file,
      JSON.stringify({ writtenAt: '2026-09-04 12:00:00', writtenBy: ELSEWHERE, worlds: [], visits: [theirs] }),
      'utf8',
    )
    const seen = visits.openVisitsThisWorldCanSee({ file, why: 'this test handed the reading its own file' })
    expect(seen.from).toBe('the mirror')
    expect(seen.note).toBe('this test handed the reading its own file')
    expect(seen.visits.map((one) => one.id).sort()).toEqual([theirs.id, mine.id].sort())
  })

  it('reads no mirror at all when a test runner started this world, and says so is why', () => {
    const mine = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working while the main world was down',
    })
    expect(office.theMirrorThisWorldMayRead().file).toBeNull()
    const seen = visits.openVisitsThisWorldCanSee()
    expect(seen.from).toBe('this world alone')
    // THE DEFAULT IS THE GUARDED ANSWER AND NOT A BARE NULL, which is the whole of the rule here:
    // a null with no reason beside it reads as "there was no mirror", and this is "there is one and
    // it is not this world's to read".
    expect(seen.note).toBe(office.whyTheDeclaredOfficeIsNotThisWorlds())
    expect(seen.visits.map((one) => one.id)).toEqual([mine.id])
  })
})

/**
 * A REPORTED VISIT IS THE SAME VISIT, NOT A SECOND ONE.
 *
 * The office used to give a reported visit a fresh id of its own, so it held a copy under an id the
 * world that took the visit had never heard of. Ending the trip at that world ended nothing at the
 * office: after four Enter-and-Return-home rounds the citizens verifier found the office listing
 * eleven people away from home and nobody being away. Problem `vFrn8Z7VZLhD`.
 */
describe('one visit, one row, however many places hold it', () => {
  it('keeps the id the world holding it gave it, when that world reports it here', () => {
    makeThisTheOffice()
    // A REPORT: a visit to somewhere else, carrying the id it already has.
    const said = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'cccccccccccccccc',
      why: 'a run answering the message m1',
      since: '2026-09-04 12:00:00',
      id: 'the-id-it-already-has',
    })
    expect(said.id).toBe('the-id-it-already-has')
    expect(said.since).toBe('2026-09-04 12:00:00')
    expect(visits.visitById('the-id-it-already-has')?.toWorld).toBe('cccccccccccccccc')
  })

  it('counts a visit reported twice as one visit', () => {
    makeThisTheOffice()
    const once = {
      visitor: { kind: 'agent' as const, id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'cccccccccccccccc',
      why: 'a run answering the message m1',
      since: '2026-09-04 12:00:00',
      id: 'reported-twice',
    }
    const first = visits.registerVisitHere(once)
    const again = visits.registerVisitHere(once)
    expect(again.id).toBe(first.id)
    expect(visits.visitsHere().filter((one) => one.id === 'reported-twice')).toHaveLength(1)
  })

  it('does not bring an ended trip back to life when it is reported again', () => {
    // A WORLD THAT REPORTED AND DID NOT HEAR BACK REPORTS AGAIN, and by then the office may know
    // more about that trip than the world does — it may have been ended here. A second report that
    // wrote over the row would put the visitor back on the list of people away from home.
    makeThisTheOffice()
    const once = {
      visitor: { kind: 'agent' as const, id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'cccccccccccccccc',
      why: 'a run answering the message m1',
      id: 'reported-then-ended',
    }
    visits.registerVisitHere(once)
    visits.endVisitHere('reported-then-ended')
    expect(visits.visitById('reported-then-ended')?.until).not.toBeNull()
    visits.registerVisitHere(once)
    expect(visits.visitById('reported-then-ended')?.until, 'a second report brought the trip back to life').not.toBeNull()
    expect(visits.openVisitsHere().map((one) => one.id)).not.toContain('reported-then-ended')
  })

  it('never lets a caller choose the id of a trip into this world', () => {
    // A VISIT REGISTERED WHERE IT IS BEING MADE GETS A FRESH ID. Letting a caller name the id of a
    // row about their own trip is a caller writing over somebody else's.
    const said = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working here for a while',
      id: 'an-id-i-picked',
    })
    expect(said.id).not.toBe('an-id-i-picked')
    expect(visits.visitById('an-id-i-picked')).toBeNull()
  })

  it('ends the visit the office holds, because it is the row the world that took it ended', () => {
    makeThisTheOffice()
    const reported = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: 'cccccccccccccccc',
      why: 'a run answering the message m1',
      id: 'the-trip',
    })
    expect(visits.openVisitsHere().map((one) => one.id)).toContain(reported.id)
    visits.endVisitHere('the-trip')
    expect(visits.openVisitsHere().map((one) => one.id)).not.toContain('the-trip')
  })
})

/**
 * AND A HELD VISIT IS TRIED AGAIN WHILE THE OFFICE IS DOWN.
 *
 * Criterion C8 says a world *reports it to the office when the main world answers again*. Nothing
 * noticed that the office was back: a held visit moved only when the NEXT visit was registered at
 * that world, so a world with one visitor and no more arrivals held its row for ever. The verifier
 * watched the office come back and the row still be unreported twelve seconds later.
 */
describe('a world holding a visit keeps asking', () => {
  it('tries again on every turn of the clock, and stops when it is told to', async () => {
    const { vi } = await import('vitest')
    vi.useFakeTimers()
    try {
      let tries = 0
      const said: string[] = []
      const stop = visits.keepTryingHeldVisits(
        1000,
        async () => {
          tries += 1
          return { reported: tries === 2 ? 1 : 0, why: 'a stand-in' }
        },
        (line) => said.push(line),
      )
      expect(tries, 'it reported before a single turn of the clock').toBe(0)
      await vi.advanceTimersByTimeAsync(3000)
      expect(tries).toBe(3)
      expect(said, 'a turn that reported nothing said something anyway').toEqual([
        '1 visit(s) this world was holding reached the office',
      ])
      stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(tries, 'it went on trying after it was stopped').toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * ENDING A TRIP SAYS WHETHER THE OFFICE WAS TOLD.
 *
 * The office holds its own copy of the row, and a trip ended only at the world being visited left
 * that copy open. The route now reports the ending as it reports the beginning, and the reply says
 * in words what happened — which under a test runner is that the declared office is not this
 * world's to write to.
 */
describe('the end of a visit reaches the office too', () => {
  it('says whether the office was told, in the same words the beginning uses', async () => {
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working here for a while',
    })
    const said = await app.inject({
      method: 'POST',
      url: `/api/office/visits/${visit.id}/end`,
      headers: {
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
    })
    expect(said.statusCode).toBe(200)
    const body = said.json() as { visit: { until: string | null }; toldTheOffice: { told: boolean; why: string } }
    expect(body.visit.until).not.toBeNull()
    expect(body.toldTheOffice.told).toBe(false)
    expect(body.toldTheOffice.why, 'the reply did not say why the office was not told').not.toBe('')
  })

  it('says the row is the office’s own when this world holds the office', async () => {
    makeThisTheOffice()
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'working here for a while',
    })
    const said = await visits.reportThisVisitEndedToTheOffice(visit.id)
    expect(said.told).toBe(false)
    expect(said.why).toContain('holds the office')
  })
})

