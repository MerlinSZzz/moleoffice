// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE ORDERS AND MEASURES BY WHEN THINGS HAPPENED, NOT BY ITS TIMES IN WORDS, IN THE HOUR THE CLOCKS GO BACK.
 *
 * A stored stamp is the office's local time in words, with no offset. On 25 October 2026 the hour from 01:00 comes twice
 * in Europe/London: 01:50 summer time is followed, twenty minutes later, by 01:10 winter time. Four places in the queue
 * compared or measured such stamps:
 *
 *   - the lane's newest bus, by each bus's `tested.at`;
 *   - which of two entries was marked for the merge tool first, by `toolWanted.since`;
 *   - whether the secretary was told in the last hour that an entry waits for room, by `waitingForRoom.toldAt`;
 *   - when an entry boarded the bus it drives, which the bus counts its wait from, by `verdict.at`.
 *
 * The two orders are read from the change log, whose `append_order` is the order its rows were written in. The two ages
 * are read from the clock observation stored beside the stamp: `waitingForRoom.toldTime`, and the release's `time`,
 * which the verdict copies. An old stamp with nothing beside it is read as its one moment in the office's zone; in the
 * repeated hour or the skipped one it has none, and the queue says it cannot tell instead of guessing.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here:
 *
 *   1. Bus A is tested at 01:50 summer time and bus B twenty minutes later, at 01:10 winter time, in one lane. B is the
 *      lane's newest: an entry that rode neither waits for B's rider, and the queue page draws B.
 *   2. Control, green before and after: buses tested across the skipped hour of 28 March 2027, and one second apart.
 *   3. In a lane of two buses where nothing recorded when one was tested, nobody is held behind a rider, a warning says
 *      so, and the page draws no bus. A lane with one such bus still has it as its newest.
 *   4. Entry P, passed over for a check, is marked at 01:50 summer time and rider R at 01:10 winter time: R waits for P.
 *      Marked the other way round, P waits for R. Controls across the skipped hour and one second apart.
 *   5. An entry whose mark nobody recorded the writing of is held behind nobody and holds nobody, whatever its stamp
 *      says, and a warning says so.
 *   6. The secretary is told that an entry waits for room again after 60 minutes, measured between the two moments,
 *      across the repeated hour: not after 50 minutes, and not 60 minutes late. Controls across the skipped hour and
 *      one second either side of the hour.
 *   7. A wait told before the clock observation was stored is read from `toldAt` as its one moment, and told again when
 *      `toldAt` falls in the repeated hour.
 *   8. The merge tool counts a bus's wait from the instant beside the verdict, says so in its waiting line, and when no
 *      moment can be read it counts from now and says that instead.
 *
 * MUTATION PROOF (each after a green control; each turns the cases named red, and restoring it turns them green):
 *
 *   - In src/server/lib/merge-queue.ts, `theNewestBusOfEachLane`, take the bus with the greatest `tested.at` instead of the
 *     greatest change row. Case 1 goes red.
 *   - In the same function, leave out a bus with no change row instead of answering null for its lane. Case 3 goes red.
 *   - In `aRiderGoesFirst`, compare two marks' stamps again before their change rows. Cases 4 and 5 go red.
 *   - In src/server/lib/merge-state-machine.ts, measure the hour from `toldAt` read as local time again. Cases 6 and 7
 *     go red.
 *   - In tools/merge-tool/pairs.mjs, `whenItBoarded`, read `verdict.at` as local time again. Case 8 goes red.
 *
 * Every record here is a synthetic fixture in a throwaway database, written through the records door as the queue writes
 * it. The two that stand for records written before a change row or a clock observation was kept are written with their
 * field in the create, which records no change row for it.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-repeated-hour'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const MINUTE = 60_000

/** 01:50 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)
/** Noon summer time on an ordinary day, the day before the clocks go back. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

/** The launcher's sentence for a wait for room. Synthetic. */
const NO_ROOM = 'sandbox: synthetic sentence for a launcher that had no room.'
/** What the office decides when the secretary was told within the hour, and so is not told again. */
const NOT_TOLD_AGAIN = 'The secretary was told within the last hour.'

describe('the queue in the hour the clocks go back', () => {
  let t: TestDb
  let queue: typeof import('../src/server/lib/merge-queue.ts')
  let page: typeof import('../src/server/lib/merge-queue-page.ts')
  let door: typeof import('../src/server/lib/merge-entry-door.ts')
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  let time: typeof import('../src/shared/time.ts')
  let theZoneBefore: string | undefined

  beforeEach(async () => {
    theZoneBefore = process.env.TZ
    process.env.TZ = 'Europe/London'
    t = await freshDb()
    queue = await import('../src/server/lib/merge-queue.ts')
    page = await import('../src/server/lib/merge-queue-page.ts')
    door = await import('../src/server/lib/merge-entry-door.ts')
    machine = await import('../src/server/lib/merge-state-machine.ts')
    time = await import('../src/shared/time.ts')
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS - 60 * MINUTE })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    t.close()
    if (theZoneBefore === undefined) delete process.env.TZ
    else process.env.TZ = theZoneBefore
  })

  /** A merge entry written at the clock's time now, as the queue writes it. Synthetic. */
  function anEntry(name: string, state = 'submitted', more: Record<string, unknown> = {}): string {
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: `Synthetic merge entry ${name}`,
        workspaceId: WORKSPACE,
        actor: office,
        origin: 'fixture',
        data: {
          run: `synthetic-run-${name}`,
          seal: { id: `synthetic-seal-${name}`, hash: `synthetic-hash-${name}` },
          changeset: { adapter: 'files', root: ROOT, operations: [] },
          state,
          submittedBy: { kind: 'agent', id: 'synthetic-worker' },
          ...more,
        },
      }),
    ).id
  }

  /** A bus's tested step as the state machine writes it at `at`: its stamp, its riders and whom it passed over for a check. */
  function testedStep(at: number, riders: string[], passedForACheck: string[] = []): Record<string, unknown> {
    return { at: time.localStamp(new Date(at)), green: true, testedWith: { entry: riders[0], tree: 'synthetic-tree', bus: riders.map((entry) => ({ entry })), passedForACheck } }
  }

  /** A bus that landed, its tested step written at `at` in an update, as the state machine writes it. */
  function aBusTestedAt(name: string, at: number, riders: string[], passedForACheck: string[] = []): string {
    const driver = anEntry(name, 'merged')
    vi.setSystemTime(at)
    door.asTheMergeQueue(() => t.api.patchRecord(driver, { dataPatch: { tested: testedStep(at, riders, passedForACheck) } }, office))
    return driver
  }

  /** Moves an entry to judged at `at`, which writes its mark for the merge tool. */
  function markAt(id: string, at: number): void {
    vi.setSystemTime(at)
    queue.moveEntry({ id, to: 'judged', actor: office })
  }

  /** Who the merge tool waits on before this entry, why, and the bus that decided it, or null. */
  function waitsOn(id: string): { first: string; because: string; driver?: string } | null {
    const waits = queue.whatTheMergeToolWaitsOn(queue.readMergeEntry(t.api.getRecord(id)!)) as { first?: string; because: string; driver?: string } | null
    return waits === null ? null : { first: String(waits.first), because: waits.because, ...(waits.driver === undefined ? {} : { driver: waits.driver }) }
  }

  /** The bus the queue page draws for the one lane. */
  function thePagesBus(): { driver: string } | null {
    const listed = queue.listMergeQueue({ workspaceId: WORKSPACE })
    const reading = page.theQueuePageReading({ workspaceId: WORKSPACE, lanes: listed.lanes, now: new Date() })
    expect(reading.page.lanes).toHaveLength(1)
    return reading.page.lanes[0]!.bus
  }

  const stampOf = (id: string, field: 'tested' | 'toolWanted'): unknown => {
    const value = t.api.getRecord(id)!.data[field] as Record<string, unknown>
    return field === 'tested' ? value['at'] : value['since']
  }

  describe("the lane's newest bus", () => {
    /** Two buses of one lane, A tested at `atA` and then B at `atB`, each seating one rider, and an entry that rode neither. */
    function twoBuses(atA: number, atB: number): { a: string; b: string; neither: string; busA: string; busB: string } {
      const a = anEntry('rider-of-a')
      const b = anEntry('rider-of-b')
      const neither = anEntry('rode-neither')
      markAt(a, atA - 30 * MINUTE)
      markAt(b, atA - 29 * MINUTE)
      markAt(neither, atA - 28 * MINUTE)
      const busA = aBusTestedAt('driver-a', atA, [a])
      const busB = aBusTestedAt('driver-b', atB, [b])
      return { a, b, neither, busA, busB }
    }

    it('is the bus tested last, when its stamp in words is earlier in the repeated hour', () => {
      const lane = twoBuses(FIRST_PASS, SECOND_PASS)
      // THE WORDS SORT THE WRONG WAY: B was tested twenty minutes after A.
      expect(stampOf(lane.busA, 'tested')).toBe('2026-10-25 01:50:00')
      expect(stampOf(lane.busB, 'tested')).toBe('2026-10-25 01:10:00')
      expect(waitsOn(lane.neither)).toEqual({ first: lane.b, because: 'a-rider-goes-first', driver: lane.busB })
      expect(thePagesBus()).toMatchObject({ driver: lane.busB, riders: [lane.b] })
    })

    it('is the bus tested last across the skipped hour and one second apart (controls)', () => {
      const gap = twoBuses(BEFORE_THE_GAP, AFTER_THE_GAP)
      expect([stampOf(gap.busA, 'tested'), stampOf(gap.busB, 'tested')]).toEqual(['2027-03-28 00:59:59', '2027-03-28 02:00:00'])
      expect(waitsOn(gap.neither)).toEqual({ first: gap.b, because: 'a-rider-goes-first', driver: gap.busB })
      expect(thePagesBus()).toMatchObject({ driver: gap.busB })
    })

    it('is the bus tested last of two tested one second apart (control)', () => {
      const second = twoBuses(AN_ORDINARY_NOON, AN_ORDINARY_NOON + 1000)
      expect(waitsOn(second.neither)).toEqual({ first: second.b, because: 'a-rider-goes-first', driver: second.busB })
      expect(thePagesBus()).toMatchObject({ driver: second.busB })
    })

    it('is unknown when nothing recorded when one of two buses was tested: nobody is held, a warning says so, and the page draws none', () => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const a = anEntry('rider-of-a')
      const b = anEntry('rider-of-b')
      const neither = anEntry('rode-neither')
      markAt(a, AN_ORDINARY_NOON - 3 * MINUTE)
      markAt(b, AN_ORDINARY_NOON - 2 * MINUTE)
      markAt(neither, AN_ORDINARY_NOON - MINUTE)
      vi.setSystemTime(AN_ORDINARY_NOON)
      // WRITTEN WITH ITS TESTED STEP IN THE CREATE, which records no change row for it, as an old record would hold it.
      const busA = anEntry('driver-a-with-no-row', 'merged', { tested: testedStep(AN_ORDINARY_NOON, [a]) })
      aBusTestedAt('driver-b', AN_ORDINARY_NOON + MINUTE, [b])
      expect(waitsOn(neither)).toBeNull()
      expect(thePagesBus()).toBeNull()
      const said = warned.mock.calls.map((call) => String(call[0]))
      expect(said.some((line) => line.includes(`no change row says when merge entry ${busA} was tested`) && line.includes("which bus is the lane's newest is unknown")), said.join('\n')).toBe(true)
    })

    it('is the one bus of a lane, when nothing recorded when it was tested', () => {
      const a = anEntry('rider-of-a')
      const neither = anEntry('rode-neither')
      markAt(a, AN_ORDINARY_NOON - 2 * MINUTE)
      markAt(neither, AN_ORDINARY_NOON - MINUTE)
      vi.setSystemTime(AN_ORDINARY_NOON)
      const busA = anEntry('driver-a-with-no-row', 'merged', { tested: testedStep(AN_ORDINARY_NOON, [a]) })
      expect(waitsOn(neither)).toEqual({ first: a, because: 'a-rider-goes-first', driver: busA })
      expect(thePagesBus()).toMatchObject({ driver: busA })
    })
  })

  describe('which of two entries was marked for the merge tool first', () => {
    /** One bus that seated R and passed P over for a check; then each mark is written at its moment, in the order given. */
    function aRiderAndOnePassedOver(marks: (who: { p: string; r: string }) => [string, number][]): { p: string; r: string } {
      const p = anEntry('passed-over')
      const r = anEntry('rider')
      const [, firstAt] = marks({ p, r })[0]!
      aBusTestedAt('driver', firstAt - 10 * MINUTE, [r], [p])
      for (const [id, at] of marks({ p, r })) markAt(id, at)
      return { p, r }
    }

    it('is the one marked first, when its stamp in words is later in the repeated hour', () => {
      const lane = aRiderAndOnePassedOver(({ p, r }) => [[p, FIRST_PASS], [r, SECOND_PASS]])
      expect(stampOf(lane.p, 'toolWanted')).toBe('2026-10-25 01:50:00')
      expect(stampOf(lane.r, 'toolWanted')).toBe('2026-10-25 01:10:00')
      expect(waitsOn(lane.r)).toEqual({ first: lane.p, because: 'an-entry-passed-over-for-a-check-goes-first', driver: expect.any(String) })
      expect(waitsOn(lane.p)).toBeNull()
    })

    it('is the one marked first the other way round in the repeated hour', () => {
      const lane = aRiderAndOnePassedOver(({ p, r }) => [[r, FIRST_PASS], [p, SECOND_PASS]])
      expect(waitsOn(lane.r)).toBeNull()
      expect(waitsOn(lane.p)).toEqual({ first: lane.r, because: 'a-rider-goes-first', driver: expect.any(String) })
    })

    it('is the one marked first across the skipped hour and one second apart (controls)', () => {
      const gap = aRiderAndOnePassedOver(({ p, r }) => [[p, BEFORE_THE_GAP], [r, AFTER_THE_GAP]])
      expect([stampOf(gap.p, 'toolWanted'), stampOf(gap.r, 'toolWanted')]).toEqual(['2027-03-28 00:59:59', '2027-03-28 02:00:00'])
      expect(waitsOn(gap.r)).toMatchObject({ first: gap.p, because: 'an-entry-passed-over-for-a-check-goes-first' })
      expect(waitsOn(gap.p)).toBeNull()
    })

    it('is the one marked first of two marked one second apart (control)', () => {
      const second = aRiderAndOnePassedOver(({ p, r }) => [[r, AN_ORDINARY_NOON], [p, AN_ORDINARY_NOON + 1000]])
      expect(waitsOn(second.r)).toBeNull()
      expect(waitsOn(second.p)).toMatchObject({ first: second.r, because: 'a-rider-goes-first' })
    })

    it('is unknown when nothing recorded when one mark was written, whatever its stamp says: neither is held, and a warning says so', () => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      vi.setSystemTime(AN_ORDINARY_NOON - 60 * MINUTE)
      // MARKED IN THE CREATE, which records no change row for the mark, as an old record would hold it. Its stamp is an
      // hour before the rider's, and it is still not taken as marked first.
      const p = anEntry('passed-over-with-no-row', 'judged', { toolWanted: { since: time.localStamp(new Date()) } })
      const r = anEntry('rider')
      aBusTestedAt('driver', AN_ORDINARY_NOON - 30 * MINUTE, [r], [p])
      markAt(r, AN_ORDINARY_NOON)
      expect(waitsOn(r)).toBeNull()
      expect(waitsOn(p)).toBeNull()
      const said = warned.mock.calls.map((call) => String(call[0]))
      expect(said.some((line) => line.includes(`no change row says when the mark on merge entry ${p} was written`) && line.includes('the merge tool takes them in the order they were submitted')), said.join('\n')).toBe(true)
    })
  })

  describe('the line to the secretary about an entry waiting for room', () => {
    // THE ROLE CARDS ARE READ WHEN THE OFFICE STARTS, and the step asks who holds the secretary card.
    let app: Awaited<ReturnType<typeof apiApp>>['app'] | null = null
    beforeEach(async () => {
      app = (await apiApp()).app
    })
    afterEach(async () => {
      await app?.close()
    })

    let lanes = 0
    /** An entry being tested in a lane of its own, since one entry at a time holds a lane, with what more it holds. */
    function anEntryBeingTested(more: Record<string, unknown> = {}): string {
      lanes += 1
      const root = `${ROOT}/room-${String(lanes)}`
      return anEntry(`waits-for-room-${String(lanes)}`, 'testing', { changeset: { adapter: 'files', root, operations: [] }, occupies: root, ...more })
    }

    /** The launcher refuses the entry's test at `at`; whether the secretary was told again, and what is stored. */
    function noRoomAt(id: string, at: number): { told: boolean; stored: Record<string, unknown> } {
      vi.setSystemTime(at)
      const step = machine.stepAMergeEntry({ workspaceId: WORKSPACE, id, step: 'no-room-to-test', facts: { says: NO_ROOM }, actor: office })
      return { told: !step.decided.includes(NOT_TOLD_AGAIN), stored: t.api.getRecord(id)!.data['waitingForRoom'] as Record<string, unknown> }
    }

    it('is written again after 60 minutes across the repeated hour, not after 50, and not 60 minutes late', () => {
      const late = anEntryBeingTested()
      expect(noRoomAt(late, FIRST_PASS).told).toBe(true)
      expect(noRoomAt(late, FIRST_PASS + 59 * MINUTE).told, '01:49 winter time is 59 minutes after 01:50 summer time').toBe(false)
      const again = noRoomAt(late, FIRST_PASS + 60 * MINUTE)
      expect(again.told, '01:50 winter time is 60 minutes after 01:50 summer time').toBe(true)
      expect(again.stored).toMatchObject({ toldAt: '2026-10-25 01:50:00', toldTime: { stamp: '2026-10-25 01:50:00', instant: '2026-10-25T01:50:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' } })
      const early = anEntryBeingTested()
      expect(noRoomAt(early, SECOND_PASS).told).toBe(true)
      expect(noRoomAt(early, SECOND_PASS + 50 * MINUTE).told, '02:00 winter time is 50 minutes after 01:10 winter time').toBe(false)
      expect(noRoomAt(early, SECOND_PASS + 60 * MINUTE).told).toBe(true)
    })

    it('is written again 60 minutes later across the skipped hour and on an ordinary day, and not one second before (controls)', () => {
      for (const start of [BEFORE_THE_GAP, AN_ORDINARY_NOON]) {
        const id = anEntryBeingTested()
        expect(noRoomAt(id, start).told).toBe(true)
        expect(noRoomAt(id, start + 60 * MINUTE - 1000).told).toBe(false)
        expect(noRoomAt(id, start + 60 * MINUTE).told).toBe(true)
      }
    })

    it('reads a wait told before the clock observation was stored from its time in words, and tells again when those words fall in the repeated hour', () => {
      vi.setSystemTime(AN_ORDINARY_NOON - 60 * MINUTE)
      const wait = (toldAt: string) => ({ since: toldAt, at: toldAt, says: NO_ROOM, message: null, toldAt })
      const unique = anEntryBeingTested({ waitingForRoom: wait('2026-10-24 12:00:00') })
      expect(noRoomAt(unique, AN_ORDINARY_NOON + 30 * MINUTE).told).toBe(false)
      expect(noRoomAt(unique, AN_ORDINARY_NOON + 60 * MINUTE).told).toBe(true)
      // 01:30 COMES TWICE THAT NIGHT, so how long ago it was cannot be told. Twenty minutes after the first 01:30, the
      // secretary is told again rather than not told on a guess.
      const repeated = anEntryBeingTested({ waitingForRoom: wait('2026-10-25 01:30:00') })
      const told = noRoomAt(repeated, FIRST_PASS)
      expect(told.told).toBe(true)
      expect(told.stored).toMatchObject({ toldAt: '2026-10-25 01:50:00', toldTime: { instant: '2026-10-25T01:50:00.000+01:00' } })
    })
  })

  describe('when an entry boarded the bus it drives', () => {
    type Boarded = { at: number; released: boolean }
    let whenItBoarded: (entry: unknown) => Boarded
    let theLatestItLeaves: (boarded: Boarded, seconds: number) => string

    let workdir = ''

    beforeEach(async () => {
      // THE MERGE TOOL READS ITS ARGUMENTS WHEN IT IS LOADED, and writes its log into the folder they name.
      workdir = mkdtempSync(join(tmpdir(), 'the-repeated-hour-merge-tool-'))
      const savedArgv = process.argv
      let pairs: Record<string, unknown>
      try {
        process.argv = ['node', 'the-merger.mjs', '--entry', 'a-made-up-entry', '--session', 'a-made-up-run', '--api', 'http://127.0.0.1:0', '--workspace', 'default', '--workdir', workdir]
        pairs = (await import('../tools/merge-tool/pairs.mjs')) as Record<string, unknown>
      } finally {
        process.argv = savedArgv
      }
      whenItBoarded = Reflect.get(pairs, 'whenItBoarded') as typeof whenItBoarded
      theLatestItLeaves = Reflect.get(pairs, 'theLatestItLeaves') as typeof theLatestItLeaves
      expect(typeof whenItBoarded, 'tools/merge-tool/pairs.mjs exports whenItBoarded').toBe('function')
      expect(typeof theLatestItLeaves, 'tools/merge-tool/pairs.mjs exports theLatestItLeaves').toBe('function')
    })

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true })
    })

    /** An entry as the merge tool reads it, with its verdict's stamp and the clock observation beside it, both read at `at`. */
    function releasedAt(at: number): unknown {
      vi.setSystemTime(at)
      const clock = time.clockStamp()
      return { machine: { verdict: { at: clock.stamp, time: clock } } }
    }

    it('is the instant beside the verdict, in either pass of the repeated hour', () => {
      for (const at of [FIRST_PASS, SECOND_PASS]) {
        const entry = releasedAt(at)
        vi.setSystemTime(at + 30_000)
        expect(whenItBoarded(entry)).toEqual({ at, released: true })
      }
      vi.setSystemTime(SECOND_PASS + 30_000)
      expect(theLatestItLeaves(whenItBoarded(releasedAt(SECOND_PASS)), 600)).toBe('at 2026-10-25 01:20:00, 600 s after this entry was released')
    })

    it('is the instant beside the verdict across the skipped hour and one second apart (controls)', () => {
      for (const at of [BEFORE_THE_GAP, AFTER_THE_GAP, AN_ORDINARY_NOON, AN_ORDINARY_NOON + 1000]) {
        const entry = releasedAt(at)
        vi.setSystemTime(at + 5000)
        expect(whenItBoarded(entry)).toEqual({ at, released: true })
      }
    })

    it('reads a verdict with only its time in words as its one moment, and counts from now, saying so, when the words have none', () => {
      vi.setSystemTime(SECOND_PASS)
      expect(whenItBoarded({ machine: { verdict: { at: '2026-10-24 12:00:00' } } })).toEqual({ at: AN_ORDINARY_NOON, released: true })
      for (const at of ['2026-10-25 01:10:00', '2027-03-28 01:30:00', 'not a time']) {
        expect(whenItBoarded({ machine: { verdict: { at } } }), at).toEqual({ at: SECOND_PASS, released: false })
      }
      expect(whenItBoarded({ machine: {} })).toEqual({ at: SECOND_PASS, released: false })
      expect(theLatestItLeaves({ at: SECOND_PASS, released: false }, 600)).toBe(
        'at 2026-10-25 01:20:00, 600 s after the bus started to wait, because when this entry was released cannot be read',
      )
    })
  })
})
