// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENTRY TESTED ALONE IS NOT STARVED BY A STREAM OF NEW BUSES. Problem gYWdWJQcxyuZ, wave 13p round
 * M8UvviWBU-IS, item 2.
 *
 * A bus never seats an entry that is tested alone: a plugin-only change, one that names its own suite workers, one
 * that changes the queue's own code, or one adding a migration behind the bus's newest (`board` in
 * tools/merge-tool/pairs.mjs). The lane's newest bus orders the lane (`aRiderGoesFirst` in
 * src/server/lib/merge-queue.ts), and it used to hand the lane to every judged and marked rider before such an entry,
 * whenever the rider was marked. Each new bus passed the entry over again and seated riders marked after it, so while
 * entries kept coming it waited for ever: merge entry mSzWWkTIDzIu waited from 12:04 to 17:13 on 15 October 2026.
 *
 * Now the bus names the entries it passed over because they are tested alone (`passedAlone`), and the office lets
 * each take the lane ahead of every rider marked for the merge tool after it, as it already did for an entry passed
 * over for a check (round 27). A rider marked before it still goes first, and those are a set fixed when it was
 * marked, so its wait has an end.
 *
 * WHAT IS PROVED, with entries written through the queue's own `moveEntry` under a fixed clock:
 *
 *   1. Bus after bus, each seating new riders marked after the entry tested alone: the entry waits for nobody, and
 *      each rider, and an entry marked after it that rode no bus, waits for it, for the reason in its own words.
 *   2. A rider marked before the entry tested alone still goes first, and once that rider is no longer judged, the
 *      entry tested alone waits for nobody.
 *   3. Of two entries tested alone that one bus passed over, the one marked first goes first.
 *
 * Every record here is a synthetic fixture in a throwaway database; nothing reaches the live server.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let WORKSPACE = 'an-entry-alone-case-0'
let ROOT = '/synthetic/lane-with-an-entry-tested-alone'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }

let t: TestDb
let queue: typeof import('../src/server/lib/merge-queue.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  queue = await import('../src/server/lib/merge-queue.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `an-entry-alone-case-${String(caseNumber)}`
  ROOT = `/synthetic/lane-with-an-entry-tested-alone-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` })
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

/** A merge entry record in the shape the queue writes, in `state`, written as the queue writes. Synthetic. */
function anEntry(name: string, state: string, more: Record<string, unknown> = {}): string {
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

/**
 * A bus that landed: its driver's tested step, written at `at`, names its riders and the entries it passed over as tested
 * alone. The step is written in an update, as the state machine writes it, so the lane's newest bus can be told by the
 * change row that wrote it.
 */
function aBusThatLanded(name: string, at: string, riders: string[], passedAlone: string[]): string {
  const driver = anEntry(name, 'merged')
  const tested = { at, green: true, testedWith: { entry: riders[0], tree: `synthetic-tree-${name}`, bus: riders.map((entry) => ({ entry })), passedAlone } }
  door.asTheMergeQueue(() => t.api.patchRecord(driver, { dataPatch: { tested } }, office))
  return driver
}

/** Moves an entry to judged at this moment, which writes its mark for the merge tool. */
function markAt(id: string, at: Date): void {
  vi.setSystemTime(at)
  queue.moveEntry({ id, to: 'judged', actor: office })
}

/** Who the merge tool waits on before this entry, and why, or null. */
function waitsOn(id: string): { first: string; because: string } | null {
  const waits = queue.whatTheMergeToolWaitsOn(queue.readMergeEntry(t.api.getRecord(id)!))
  return waits === null ? null : { first: String((waits as { first?: string }).first), because: waits.because }
}

/** The office's sentence for why the merge tool waits on this entry. */
function saysFor(id: string): string {
  return queue.whatTheMergeToolWaitsOn(queue.readMergeEntry(t.api.getRecord(id)!))!.says
}

const minute = (n: number): Date => new Date(2026, 9, 15, 12, n, 0)

describe('an entry tested alone in a lane where new buses keep coming', () => {
  it('waits for no rider marked after it, bus after bus, and each of them waits for it', () => {
    const alone = anEntry('plugin-only', 'submitted')
    markAt(alone, minute(4))
    const everyRider: string[] = []
    for (let bus = 1; bus <= 5; bus++) {
      const riders = [anEntry(`rider-${String(bus)}-a`, 'submitted'), anEntry(`rider-${String(bus)}-b`, 'submitted')]
      for (const [i, rider] of riders.entries()) markAt(rider, minute(4 + bus * 10 + i))
      everyRider.push(...riders)
      const driver = aBusThatLanded(`driver-${String(bus)}`, `2026-10-15 12:${String(9 + bus * 10)}:00`, riders, [alone])
      expect(waitsOn(alone), `bus ${String(bus)}: the entry tested alone waits for nobody`).toBeNull()
      for (const rider of everyRider) {
        expect(waitsOn(rider), `bus ${String(bus)}: a rider of this bus or an earlier one waits for the entry tested alone`).toEqual({
          first: alone,
          because: 'an-entry-tested-alone-goes-first',
        })
      }
      expect(saysFor(riders[0]!)).toBe(
        `The bus merge entry ${driver} ran passed over merge entry ${alone} because it is tested alone, so ${alone} takes the lane ahead of every entry ` +
          `marked for the merge tool after it, and the next bus cannot keep passing it over; merge entry ${riders[0]!} waits while ${alone} is judged and marked for the merge tool.`,
      )
    }
    const later = anEntry('rode-no-bus', 'submitted')
    markAt(later, minute(59))
    expect(waitsOn(later), 'an entry that rode no bus waits for it too').toEqual({ first: alone, because: 'an-entry-tested-alone-goes-first' })
  })

  it('still lets a rider marked before it go first, and then waits for nobody', () => {
    const before = anEntry('rider-marked-before', 'submitted')
    markAt(before, minute(1))
    const alone = anEntry('plugin-only', 'submitted')
    markAt(alone, minute(4))
    const after = anEntry('rider-marked-after', 'submitted')
    markAt(after, minute(6))
    const driver = aBusThatLanded('driver', '2026-10-15 12:10:00', [before, after], [alone])
    expect(waitsOn(alone)).toEqual({ first: before, because: 'a-rider-goes-first' })
    expect(waitsOn(before)).toBeNull()
    expect(waitsOn(after)).toEqual({ first: alone, because: 'an-entry-tested-alone-goes-first' })
    expect(driver).not.toBe(alone)
    vi.setSystemTime(minute(12))
    queue.moveEntry({ id: before, to: 'withdrawn', actor: office })
    expect(waitsOn(alone), 'the rider marked before it has left judged').toBeNull()
  })

  it('of two entries tested alone, lets the one marked first go first', () => {
    // SUBMITTED IN THE OTHER ORDER, so the order the marks were written in decides, not the order the entries were submitted in.
    const second = anEntry('plugin-only-second', 'submitted')
    const first = anEntry('plugin-only-first', 'submitted')
    markAt(first, minute(2))
    markAt(second, minute(3))
    const rider = anEntry('rider', 'submitted')
    markAt(rider, minute(5))
    aBusThatLanded('driver', '2026-10-15 12:10:00', [rider], [second, first])
    expect(waitsOn(first)).toBeNull()
    expect(waitsOn(second)).toEqual({ first, because: 'an-entry-tested-alone-goes-first' })
    expect(waitsOn(rider)).toEqual({ first: second, because: 'an-entry-tested-alone-goes-first' })
  })
})
