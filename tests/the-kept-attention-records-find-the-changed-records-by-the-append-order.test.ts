// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WARM READ OF THE KEPT ATTENTION RECORDS FINDS THE CHANGED RECORDS BY THE APPEND ORDER.
 *
 * After its first reading, src/server/lib/attention-kept-records.ts keeps the records it read. At each reading after
 * that, it asks the change log which records changed since the place it read up to, and reads only those again. Left
 * to choose, SQLite answers that question by walking the whole change log in record order, so that the ids come out
 * distinct without a sort, and by reading every row to test its place. So the statement names the index on the
 * append order, and reads only the rows written since. This file fails when the warm read walks the change log.
 *
 * HOW THE READS ARE CAUGHT: while the warm read runs, `all`, `get`, `iterate` and `run` are wrapped on the prototype of
 * better-sqlite3's statements. So a statement prepared before the wrapper is caught too, as the kept records prepare
 * theirs when they are made. Each caught statement is asked `EXPLAIN QUERY PLAN` with the values it was given, so the
 * plan is of the read that gave the answer.
 *
 * WHAT THIS FILE HOLDS, in its own empty office, where every record is made up:
 *   1. The warm read asks the change log for the records changed since its place through `changes_append_order_idx`,
 *      and no step of that plan scans the change log.
 *   2. No statement of the warm read scans the change log, with one step allowed. The read of the last place has no
 *      condition: it takes the first row of the append-order index from its end (`ORDER BY append_order DESC
 *      LIMIT 1`). So its plan step is `SCAN changes USING INDEX changes_append_order_idx`, and it reads one row. That
 *      exact step is allowed for a statement of that shape and for no other.
 *   3. The warm read gives the changed record as it now is, and the same records in the same order as a whole read.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'

type Records = typeof import('../src/server/lib/records.ts')

let t: TestDb
let R: Records

/** One statement the warm read ran, with the values it was given and how. */
interface ACaughtStatement {
  text: string
  args: unknown[]
  how: 'all' | 'get' | 'iterate' | 'run'
}

/** Every statement that runs during `work`, caught on the statements' prototype. */
function theStatementsDuring<T>(work: () => T): { answer: T; caught: ACaughtStatement[] } {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const originals = new Map<ACaughtStatement['how'], (...args: unknown[]) => unknown>()
  const caught: ACaughtStatement[] = []
  for (const how of ['all', 'get', 'iterate', 'run'] as const) {
    const original = prototype[how] as (...args: unknown[]) => unknown
    originals.set(how, original)
    prototype[how] = function (this: { source: string }, ...args: unknown[]) {
      caught.push({ text: this.source, args, how })
      return original.apply(this, args)
    }
  }
  try {
    return { answer: work(), caught }
  } finally {
    for (const [how, original] of originals) prototype[how] = original
  }
}

function thePlanOf(statement: ACaughtStatement): string[] {
  const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.text}`).all(...(statement.args as never[])) as { detail: string }[]
  return plan.map((step) => step.detail)
}

/** The read of the records changed since a place in the log. */
const THE_READ_OF_WHAT_CHANGED = /\bFROM changes\b.*\bappend_order > \?/u

/** The one step that walks the change log and is allowed: the last place, the first row of the append-order index from its end. */
const THE_LAST_PLACE_STEP = 'SCAN changes USING INDEX changes_append_order_idx'

/** A plan step that walks the change log, unless it is the last place's one row. */
function aScanOfTheChangeLog(text: string, step: string): boolean {
  if (!/^SCAN changes\b/u.test(step)) return false
  return !(step === THE_LAST_PLACE_STEP && /ORDER BY append_order DESC LIMIT 1$/u.test(text))
}

const RENAMED = 'A made-up note, the second, renamed'

/** The records made here, in the order they were filed. */
const made: string[] = []
/** What the kept records said during the warm read: a line only if it read every record again. */
let saidByTheWarmRead: string[] = []
let warm: { answer: PanelRecord[]; caught: ACaughtStatement[] }
let whole: PanelRecord[]

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  const K = await import('../src/server/lib/attention-kept-records.ts')
  for (const which of ['first', 'second', 'third']) {
    made.push(R.createRecord({ workspaceId: HERE, kind: 'note', title: `A made-up note, the ${which}`, origin: 'fixture', actor: R.HUMAN }).id)
  }
  const said: string[] = []
  const kept = K.keptAttentionRecords((line) => said.push(line))
  // THE FIRST READ reads every record of the project, and keeps them.
  kept.read(HERE)
  R.updateRecord(made[1]!, { title: RENAMED }, R.HUMAN)
  // THE WARM READ reads again only the records the change log names since the first.
  const before = said.length
  warm = theStatementsDuring(() => kept.read(HERE))
  saidByTheWarmRead = said.slice(before)
  whole = R.listRecordsForTheAttentionRule(HERE)
}, 60_000)

afterAll(() => {
  t?.close()
})

describe('the kept attention records find the changed records by the append order', () => {
  it('1. the warm read asks the change log for what changed through changes_append_order_idx', () => {
    expect(saidByTheWarmRead, 'the warm read read every record again, so it did not ask the change log').toEqual([])
    const since = warm.caught.filter((statement) => THE_READ_OF_WHAT_CHANGED.test(statement.text))
    expect(since.map((statement) => statement.text), 'the warm read asked the change log once for what changed').toHaveLength(1)
    const plan = thePlanOf(since[0]!)
    expect(plan, plan.join(' | ')).toContain('SEARCH changes USING INDEX changes_append_order_idx (append_order>?)')
    expect(plan.filter((step) => /^SCAN changes\b/u.test(step)), plan.join(' | ')).toEqual([])
  })

  it('2. no statement of the warm read scans the change log', () => {
    const ofTheLog = warm.caught.filter((statement) => /\bchanges\b/u.test(statement.text))
    expect(ofTheLog.some((statement) => THE_READ_OF_WHAT_CHANGED.test(statement.text)), 'the warm read asked the change log for what changed').toBe(true)
    const scans = ofTheLog
      .map((statement) => ({ text: statement.text, steps: thePlanOf(statement).filter((step) => aScanOfTheChangeLog(statement.text, step)) }))
      .filter((one) => one.steps.length > 0)
    expect(scans, JSON.stringify(scans, null, 1)).toEqual([])
  })

  it('3. the warm read gives the changed record as it now is, and the records of a whole read in its order', () => {
    expect(whole.map((one) => one.id), 'the made-up notes are in the project').toEqual(expect.arrayContaining(made))
    const now = warm.answer.find((one) => one.id === made[1])
    expect(now?.title).toBe(RENAMED)
    expect(now).toEqual(whole.find((one) => one.id === made[1]))
    expect(warm.answer.map((one) => one.id)).toEqual(whole.map((one) => one.id))
  })
})
