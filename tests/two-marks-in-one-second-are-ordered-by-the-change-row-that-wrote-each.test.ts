// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO MERGE TOOL MARKS WITH THE SAME STAMP ARE ORDERED BY THE CHANGE ROW THAT WROTE EACH. Wave 13p round 29,
 * piece 2.4, the queue owner's fix 2.
 *
 * A mark (`toolWanted.since`) is stamped to the second. The lane's newest bus orders an entry it passed over for a
 * check against a rider by which was marked first (`aRiderGoesFirst` in src/server/lib/merge-queue.ts). Two marks
 * written in one second used to compare equal, so neither went first. The changes table is only appended to, so the
 * `append_order` of the row that wrote each mark says which came first.
 *
 * WHAT IS PROVED, with entries written through the queue's own `moveEntry` under a fixed clock:
 *
 *   1. Two marks in the same second, a few milliseconds apart: the one written first goes first, either way round.
 *   2. Two marks in the same millisecond: the same.
 *   3. A mark taken off and written again later moves after a mark written in between, though all three stamps
 *      are the same second.
 *   4. When no change row says when one of the two marks was written, neither goes first, as before, and a warning
 *      says so in words.
 *
 * Every record here is a synthetic fixture in a throwaway database; nothing reaches the live server.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let WORKSPACE = 'two-marks-case-0'
let ROOT = '/synthetic/lane-for-the-tie'
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
  WORKSPACE = `two-marks-case-${String(caseNumber)}`
  ROOT = `/synthetic/lane-for-the-tie-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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

/** The lane's newest bus: `rider` rode it and `passedOver` was passed over for a check. */
function aBus(rider: string, passedOver: string): void {
  anEntry('driver', 'merged', { tested: { at: '2026-10-07 09:00:00', testedWith: { bus: [{ entry: rider }], passedForACheck: [passedOver] } } })
}

/** Moves an entry to judged at this moment, which writes its mark for the merge tool. */
function markAt(id: string, at: Date): void {
  vi.setSystemTime(at)
  queue.moveEntry({ id, to: 'judged', actor: office })
}

/** Takes the mark off, in the one write the merge tool's start makes for it (`recordMergeToolStarted`). */
function takeTheMark(id: string): void {
  door.asTheMergeQueue(() => t.api.patchRecord(id, { dataPatch: { toolWanted: null } }, office))
}

function sinceOf(id: string): string | null {
  return queue.readMergeEntry(t.api.getRecord(id)!).toolWanted?.since ?? null
}

/** Who the merge tool waits on before this entry, and why, or null. */
function waitsOn(id: string): { first: string; because: string } | null {
  const waits = queue.whatTheMergeToolWaitsOn(queue.readMergeEntry(t.api.getRecord(id)!))
  return waits === null ? null : { first: String((waits as { first?: string }).first), because: waits.because }
}

/** Two entries of one lane marked in this order at these moments. The first is passed over by the bus, the second rode it. */
function twoMarked(firstAt: Date, secondAt: Date, passedOverFirst: boolean): { passedOver: string; rider: string } {
  vi.useFakeTimers({ toFake: ['Date'] })
  const passedOver = anEntry('passed-over', 'submitted')
  const rider = anEntry('rider', 'submitted')
  aBus(rider, passedOver)
  const [one, two] = passedOverFirst ? [passedOver, rider] : [rider, passedOver]
  markAt(one, firstAt)
  markAt(two, secondAt)
  expect(sinceOf(passedOver)).toBe(sinceOf(rider))
  return { passedOver, rider }
}

describe('two marks for the merge tool with the same stamp', () => {
  it('in the same second: the mark written first goes first, either way round', () => {
    const early = twoMarked(new Date(2026, 9, 7, 10, 0, 0, 100), new Date(2026, 9, 7, 10, 0, 0, 900), true)
    expect(waitsOn(early.rider)).toEqual({ first: early.passedOver, because: 'an-entry-passed-over-for-a-check-goes-first' })
    expect(waitsOn(early.passedOver)).toBeNull()
  })

  it('in the same second, the rider marked first: the rider goes first', () => {
    const late = twoMarked(new Date(2026, 9, 7, 10, 0, 0, 100), new Date(2026, 9, 7, 10, 0, 0, 900), false)
    expect(waitsOn(late.rider)).toBeNull()
    expect(waitsOn(late.passedOver)).toEqual({ first: late.rider, because: 'a-rider-goes-first' })
  })

  it('in the same millisecond: the mark written first goes first, either way round', () => {
    const at = new Date(2026, 9, 7, 10, 0, 0, 500)
    const early = twoMarked(at, at, true)
    expect(waitsOn(early.rider)).toEqual({ first: early.passedOver, because: 'an-entry-passed-over-for-a-check-goes-first' })
    expect(waitsOn(early.passedOver)).toBeNull()
  })

  it('in the same millisecond, the rider marked first: the rider goes first', () => {
    const at = new Date(2026, 9, 7, 10, 0, 0, 500)
    const late = twoMarked(at, at, false)
    expect(waitsOn(late.rider)).toBeNull()
    expect(waitsOn(late.passedOver)).toEqual({ first: late.rider, because: 'a-rider-goes-first' })
  })

  it('a mark taken off and written again later moves after a mark written in between', () => {
    const { passedOver, rider } = twoMarked(new Date(2026, 9, 7, 10, 0, 0, 100), new Date(2026, 9, 7, 10, 0, 0, 300), true)
    expect(waitsOn(rider)).toEqual({ first: passedOver, because: 'an-entry-passed-over-for-a-check-goes-first' })
    takeTheMark(passedOver)
    markAt(passedOver, new Date(2026, 9, 7, 10, 0, 0, 600))
    expect(sinceOf(passedOver)).toBe(sinceOf(rider))
    expect(waitsOn(rider)).toBeNull()
    expect(waitsOn(passedOver)).toEqual({ first: rider, because: 'a-rider-goes-first' })
  })

  it('when no change row says when a mark was written, neither goes first and a warning says so', () => {
    const { passedOver, rider } = twoMarked(new Date(2026, 9, 7, 10, 0, 0, 100), new Date(2026, 9, 7, 10, 0, 0, 300), true)
    const warned: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      warned.push(String(line))
    })
    // The mark is taken off through the product, and written back round its write path on purpose, so no change row records it.
    takeTheMark(passedOver)
    writeDataBypassingTheGate(t, passedOver, { ...t.api.getRecord(passedOver)!.data, toolWanted: { since: sinceOf(rider) } })
    expect(sinceOf(passedOver)).toBe(sinceOf(rider))
    expect(waitsOn(rider)).toBeNull()
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain(`no change row says when the mark on merge entry ${passedOver} was written`)
    expect(warned[0]).toContain('the merge tool takes them in the order they were submitted')
  })
})
