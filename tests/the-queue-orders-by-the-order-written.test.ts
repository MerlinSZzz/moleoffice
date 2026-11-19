// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-repeated-hour'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }

/** 01:50 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)

describe('the queue in the hour the clocks go back', () => {
  let t: TestDb
  let queue: typeof import('../src/server/lib/merge-queue.ts')
  let door: typeof import('../src/server/lib/merge-entry-door.ts')
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  let pushes: typeof import('../src/server/lib/emergency-push.ts')
  let shared: typeof import('../src/shared/merge-queue.ts')
  let theZoneBefore: string | undefined

  beforeEach(async () => {
    theZoneBefore = process.env.TZ
    process.env.TZ = 'Europe/London'
    t = await freshDb()
    queue = await import('../src/server/lib/merge-queue.ts')
    door = await import('../src/server/lib/merge-entry-door.ts')
    machine = await import('../src/server/lib/merge-state-machine.ts')
    pushes = await import('../src/server/lib/emergency-push.ts')
    shared = await import('../src/shared/merge-queue.ts')
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS })
  })

  afterEach(() => {
    vi.useRealTimers()
    t.close()
    if (theZoneBefore === undefined) delete process.env.TZ
    else process.env.TZ = theZoneBefore
  })

  /** A merge entry written at this moment, as the queue writes it. Synthetic. */
  function anEntryAt(at: number, name: string, state = 'submitted', more: Record<string, unknown> = {}): string {
    vi.setSystemTime(at)
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

  /** An emergency push that stopped, written at this moment, as the push door writes it. Synthetic. */
  function aPushAt(at: number, name: string): string {
    vi.setSystemTime(at)
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'emergency_push',
        title: `Synthetic emergency push ${name}`,
        workspaceId: WORKSPACE,
        actor: office,
        origin: 'fixture',
        data: {
          state: 'stopped',
          root: ROOT,
          repository: 'synthetic-repository',
          commit: 'a'.repeat(40),
          mainBefore: 'b'.repeat(40),
          message: { id: `synthetic-message-${name}`, seq: 1, contentHash: `synthetic-hash-${name}` },
          switch: { value: '1', unreadable: null, chosen: null, ranOut: null, lastChange: null },
          by: { kind: 'agent', id: 'synthetic-secretary' },
          line: null,
          startedAt: t.api.now(),
          ended: { at: t.api.now(), mainAfter: 'b'.repeat(40), says: 'Synthetic: stopped.', onward: null },
        },
      }),
    ).id
  }

  const createdAtOf = (id: string): string => t.api.getRecord(id)!.createdAt
  const theLane = (): string[] => queue.listMergeQueue({ workspaceId: WORKSPACE, lane: ROOT }).lanes.find((one) => one.lane === ROOT)!.entries.map((one) => one.id)

  it('lists a lane, hands the merge tool its entries and keeps the lane order in the order written', () => {
    const a = anEntryAt(FIRST_PASS, 'a')
    const b = anEntryAt(SECOND_PASS, 'b')
    // THE CASE MEANS SOMETHING ONLY IF B'S WORDS SORT BEFORE A'S.
    expect(createdAtOf(b) < createdAtOf(a), `${createdAtOf(a)} then ${createdAtOf(b)}`).toBe(true)
    expect(theLane()).toEqual([a, b])

    vi.setSystemTime(SECOND_PASS + 5 * 60_000)
    queue.moveEntry({ id: a, to: 'judged', actor: office })
    vi.setSystemTime(SECOND_PASS + 6 * 60_000)
    queue.moveEntry({ id: b, to: 'judged', actor: office })
    expect(queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)).toEqual([a, b])

    // THE LANE'S ORDER KEEPS THE ORDER IT IS HANDED for entries not moved to the front, as the merge tool reads the
    // office's reply (`theLane` in tools/merge-tool/office-keeper.mjs).
    const reply = queue.listMergeQueue({ workspaceId: WORKSPACE, lane: ROOT }).lanes.find((one) => one.lane === ROOT)!.entries
    expect(shared.inTheLanesOrder(reply).map((one) => one.id)).toEqual([a, b])
  })

  it("reads the later of a run's two entries as its newest, and a check of the run as for both in the order written", () => {
    const a = anEntryAt(FIRST_PASS, 'a', 'submitted', { run: 'synthetic-run-of-both' })
    const b = anEntryAt(SECOND_PASS, 'b', 'submitted', { run: 'synthetic-run-of-both' })
    expect(createdAtOf(b) < createdAtOf(a)).toBe(true)
    expect(queue.theNewestEntryOfARun('synthetic-run-of-both', WORKSPACE)?.id).toBe(b)
    expect(queue.theMergeEntriesACheckOfThisRunIsFor('synthetic-run-of-both', WORKSPACE).map((one) => one.id)).toEqual([a, b])
  })

  it('lists emergency pushes newest first in the order written', () => {
    const a = aPushAt(FIRST_PASS, 'a')
    const b = aPushAt(SECOND_PASS, 'b')
    expect(createdAtOf(b) < createdAtOf(a)).toBe(true)
    expect(pushes.theEmergencyPushes({ workspaceId: WORKSPACE, lane: ROOT }).map((one) => one.id)).toEqual([b, a])
  })

  it('lists resolving entries in the order written', () => {
    // NEITHER HOLDS AN END OF ITS TIME TO RESOLVE, so both are listed among those whose end cannot be read.
    const a = anEntryAt(FIRST_PASS, 'a', 'resolving')
    const b = anEntryAt(SECOND_PASS, 'b', 'resolving')
    expect(createdAtOf(b) < createdAtOf(a)).toBe(true)
    expect(machine.resolvingEntriesWhoseHourIsOver(WORKSPACE).cannotTell.map((one) => one.entry)).toEqual([a, b])
  })

  it('keeps two entries written in one second of the repeated hour in the order written (control)', () => {
    const first = anEntryAt(SECOND_PASS, 'first', 'submitted', { run: 'synthetic-run-of-one-second' })
    const second = anEntryAt(SECOND_PASS, 'second', 'submitted', { run: 'synthetic-run-of-one-second' })
    expect(createdAtOf(first)).toBe(createdAtOf(second))
    expect(theLane()).toEqual([first, second])
    expect(queue.theNewestEntryOfARun('synthetic-run-of-one-second', WORKSPACE)?.id).toBe(second)
  })

  it('keeps the order across the hour skipped in March (control)', () => {
    const before = anEntryAt(BEFORE_THE_GAP, 'before', 'submitted', { run: 'synthetic-run-across-the-gap' })
    const after = anEntryAt(AFTER_THE_GAP, 'after', 'submitted', { run: 'synthetic-run-across-the-gap' })
    expect([createdAtOf(before), createdAtOf(after)]).toEqual(['2027-03-28 00:59:59', '2027-03-28 02:00:00'])
    expect(theLane()).toEqual([before, after])
    expect(queue.theNewestEntryOfARun('synthetic-run-across-the-gap', WORKSPACE)?.id).toBe(after)
  })

  it('answers 500 naming an entry that has no place in the order written, and lists nothing by guess', () => {
    anEntryAt(FIRST_PASS, 'with-a-create-row')
    // WRITTEN STRAIGHT INTO THE TABLE, past the records door, so the change log holds no create row for it.
    const unplaced = 'synthetic-entry-with-no-create-row'
    t.client.sqlite
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
          "VALUES (?, ?, ?, ?, ?, 'merge_entry', 'Synthetic merge entry with no create row', ?, 'fixture')",
      )
      .run(
        unplaced,
        WORKSPACE,
        THE_PERSON,
        '2026-10-25 01:20:00',
        '2026-10-25 01:20:00',
        JSON.stringify({
          run: 'synthetic-run-no-create-row',
          seal: { id: 'synthetic-seal-no-create-row', hash: 'synthetic-hash-no-create-row' },
          changeset: { adapter: 'files', root: ROOT, operations: [] },
          state: 'submitted',
          submittedBy: { kind: 'agent', id: 'synthetic-worker' },
        }),
      )
    let thrown: unknown = null
    try {
      theLane()
    } catch (error) {
      thrown = error
    }
    expect(thrown, 'the lane was listed').not.toBeNull()
    expect((thrown as { status?: number }).status).toBe(500)
    expect(String((thrown as Error).message)).toContain(unplaced)
  })
})
