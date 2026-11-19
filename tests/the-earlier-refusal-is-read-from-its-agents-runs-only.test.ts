// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REFUSAL BEFORE THE SEAL IS READ FROM THE EARLIER RUNS THAT COULD BE THE RUN'S AGENT'S, NOT FROM EVERY RUN OF THE
 * PROJECT. Wave 13n.
 *
 * The reader finds the latest earlier run of the run's agent that has ended, and the refusal that still stands on it.
 * It used to read every session of the project joined to every `create` row of the change log. A create writes one row
 * today, but the live office holds older runs with one create row per field, so that join read about 114 thousand rows
 * and took 12 to 20 seconds inside SQLite, before every seal.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. the answer, a guard that passes before and after the change: a run with no earlier ended run of its agent gets
 *      none, and a sealing run gets the latest earlier ended run of its agent whichever way that run names the agent,
 *      with that run's check. A run that is still going is not ended, and a run filed after the seal is not earlier;
 *   2. the bound. The rows every better-sqlite3 call under the reader hands back are counted at two sizes of another
 *      agent's history. The larger size has a hundred more runs of another agent, each with the thirty create rows an old
 *      run carries; the smaller size is after those hundred runs are deleted. Deleting them changes neither the whole
 *      count nor the largest count one call hands back, and that largest count is never more than the number of runs the
 *      sealing agent has. Before the change the sessions read handed back one row for every create row of every earlier
 *      run, so both counts grew with the other agent's runs.
 *
 * The agents, the runs and the notes here are made up for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type BeforeTheSeal = typeof import('../src/server/lib/before-the-seal.ts')
type Agent = { id: string; handle: string; record: string }

const HERE = 'default'
const HUMAN = { type: 'human', id: THE_PERSON } as const
/** The agent whose earlier refusals are read, and the agent whose many runs must not be read. */
const SEALER = 'made-up-sealer'
const BUSY = 'made-up-busy'
/** The refusal's stamp, the same on every made-up refusal here. */
const REFUSED_AT = '2026-11-10 10:00:00'
/**
 * THE MOST RUNS THE SEALER HAS IN THIS FILE, so no one read may hand back more rows than that. The sealer files nine
 * runs: four sealing runs, four ended runs and one run that is still going. Named here so a read that reaches every
 * run of the project is caught by a number that comes from this made-up office and not from the read itself.
 */
const THE_SEALERS_RUNS = 9
/** How many more create rows an old run of another agent carries, and how many the sealer's runs carry. */
const BUSYS_EXTRA_CREATE_ROWS = 29
const SEALERS_EXTRA_CREATE_ROWS = 10
/** The number of runs filed in each of the other agent's two batches. */
const A_BATCH = 100

let t: TestDb
let beforeTheSeal: BeforeTheSeal
let sealer: Agent
let busy: Agent
const runIds = new Map<string, string>()
const checks = new Map<string, string>()
/** The other agent's second batch, kept so the larger size can be made smaller again by deleting them. */
const secondBatch: string[] = []

/** A made-up agent with a record and a registry row in this project. */
function anAgent(handle: string): Agent {
  const record = t.api.createRecord({
    workspaceId: HERE,
    kind: 'agent',
    title: `Made-up agent ${handle}`,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id?: unknown } | undefined
  expect(typeof row?.id, `the registry holds ${handle}`).toBe('string')
  return { id: String(row!.id), handle, record }
}

/**
 * THE CREATE ROWS AN OLD RUN CARRIES BESIDES ITS FIRST ONE: one row per field, written in one statement with no
 * append_order, so the table's trigger gives each its place in the order. This is the shape the live office's old runs
 * have, and the shape that made the join slow.
 */
function moreCreateRows(recordId: string, count: number): void {
  expect(count).toBeGreaterThan(0)
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < ?)
       INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at, field, old_value, new_value)
       SELECT 'made-up-change-' || ? || '-' || k, ?, ?, 'create', 'agent', 'made-up', NULL,
              strftime('%Y-%m-%d %H:%M:%S', '2026-09-01 00:00:00', '+' || k || ' seconds'),
              'made-up-field-' || k, NULL, 'made-up-value-' || k
       FROM n`,
    )
    .run(count - 1, recordId, recordId, HERE)
}

/** A run of this project, filed in the given order, with the extra create rows an old run carries. */
function aRun(label: string, agent: Agent, binding: Record<string, unknown>, options: { ended: boolean; refused?: boolean }): string {
  const record = t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: `A made-up run ${label}`,
    data: { state: 'running', ...binding },
    actor: HUMAN,
  })
  runIds.set(label, record.id)
  if (options.refused === true) {
    const check = `a-made-up-note-${label}`
    checks.set(label, check)
    writeDataBypassingTheGate(t, record.id, {
      ...record.data,
      state: options.ended ? 'crashed' : 'running',
      refused: { by: { kind: 'agent', id: 'a-made-up-inspector' }, at: REFUSED_AT, check },
    })
  } else if (options.ended) {
    writeDataBypassingTheGate(t, record.id, { ...record.data, state: 'crashed' })
  }
  moreCreateRows(record.id, agent === sealer ? SEALERS_EXTRA_CREATE_ROWS : BUSYS_EXTRA_CREATE_ROWS)
  return record.id
}

const anEndedRun = (label: string, agent: Agent, binding: Record<string, unknown>): string =>
  aRun(label, agent, binding, { ended: true, refused: true })
const aRunningRun = (label: string, agent: Agent, binding: Record<string, unknown>): string =>
  aRun(label, agent, binding, { ended: false })

/** The facts of one run, read the way the record door reads them before a seal. */
function theFactsOf(label: string): ReturnType<BeforeTheSeal['theFactsBeforeTheSealOf']> {
  const id = runIds.get(label)
  expect(id, `the run ${label} was filed`).toBeDefined()
  const record = t.api.getRecord(id!)
  expect(record, `the run ${label} is stored`).not.toBeNull()
  return beforeTheSeal.theFactsBeforeTheSealOf(record!)
}

/** The answer to the only question this file asks, as the run labels it names. */
function theEarlierRefusal(label: string): { run: string; check: string | null } | null {
  const answer = theFactsOf(label).earlierRefusal
  if (answer === null || answer === undefined || 'couldNotRead' in answer) {
    expect(answer, `the reader answers an earlier refusal for ${label}`).toBeNull()
    return null
  }
  return { run: answer.run, check: answer.check ?? null }
}

/** A label's run id, as the answer stores it. */
function idOf(label: string): string {
  const id = runIds.get(label)
  expect(id, `the run ${label} was filed`).toBeDefined()
  return id!
}

/**
 * EVERY ROW EACH CALL UNDER THE READER HANDS BACK. The function's name is on the stack, so only the calls the reader
 * makes are counted, and every statement's `get`, `all` and `iterate` is wrapped for the duration. `iterate` is wrapped
 * where it is handed over, so the rows it yields are counted as they are read. Everything is put back in `finally`.
 */
function theRowsTheEarlierRefusalReads(work: () => void): { source: string; rows: number }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, (...args: unknown[]) => unknown> }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const counted: { source: string; rows: number }[] = []
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = Infinity
  const underTheReader = (): boolean => (new Error().stack ?? '').includes('theEarlierRefusalOf')
  for (const name of ['get', 'all', 'iterate'] as const) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      const handed = original.apply(this, args)
      if (!underTheReader()) return handed
      if (name === 'get') {
        counted.push({ source: this.source, rows: handed === undefined ? 0 : 1 })
        return handed
      }
      if (name === 'all') {
        counted.push({ source: this.source, rows: (handed as unknown[]).length })
        return handed
      }
      const entry = { source: this.source, rows: 0 }
      counted.push(entry)
      const iterator = handed as Iterator<unknown>
      const wrapped: IterableIterator<unknown> = {
        next() {
          const one = iterator.next()
          if (!one.done) entry.rows++
          return one
        },
        return(value?: unknown) {
          return iterator.return?.(value) ?? { done: true, value: undefined }
        },
        throw(error?: unknown) {
          if (iterator.throw !== undefined) return iterator.throw(error)
          throw error
        },
        [Symbol.iterator]() {
          return wrapped
        },
      }
      return wrapped
    }
  }
  try {
    work()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
    Error.stackTraceLimit = limit
  }
  return counted
}

const theWholeCount = (counts: readonly { rows: number }[]): number => counts.reduce((sum, one) => sum + one.rows, 0)
const theLargestCount = (counts: readonly { rows: number }[]): number => counts.reduce((largest, one) => Math.max(largest, one.rows), 0)

beforeAll(async () => {
  t = await freshDb()
  // THE ROLE CARDS A SERVER READS AT ITS START, read here directly: the facts reader asks them for the chapters a run's
  // agent must read. Nothing about that answer is under test in this file.
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  beforeTheSeal = await import('../src/server/lib/before-the-seal.ts')
  sealer = anAgent(SEALER)
  busy = anAgent(BUSY)

  // THE MADE-UP OFFICE, filed in this order. The sealer's runs name it by its registry id unless a run is here to show
  // another way of naming it. Every ended run carries its own refusal.
  aRunningRun('seal-0', sealer, { servingAgentId: sealer.id })
  anEndedRun('a-by-id', sealer, { servingAgentId: sealer.id })
  for (let i = 0; i < A_BATCH; i++) anEndedRun(`b-first-${i}`, busy, { servingAgent: busy.handle, servingAgentId: busy.id })
  aRunningRun('seal-1', sealer, { servingAgentId: sealer.id })
  anEndedRun('a-by-handle', sealer, { servingAgent: sealer.handle })
  aRunningRun('seal-2', sealer, { servingAgentId: sealer.id })
  anEndedRun('a-by-record', sealer, { ranAs: [{ workspaceId: HERE, agentId: sealer.record }] })
  // STILL GOING AND REFUSED: not ended, so the reader may not choose it.
  aRun('a-still-going', sealer, { servingAgentId: sealer.id }, { ended: false, refused: true })
  anEndedRun('b-latest', busy, { servingAgent: busy.handle, servingAgentId: busy.id })
  // THE OTHER AGENT'S SECOND HUNDRED, before the seal, so every one of them is an earlier run of the project.
  for (let i = 0; i < A_BATCH; i++) {
    secondBatch.push(anEndedRun(`b-second-${i}`, busy, { servingAgent: busy.handle, servingAgentId: busy.id }))
  }
  aRunningRun('seal-3', sealer, { servingAgentId: sealer.id })
  anEndedRun('a-after', sealer, { servingAgentId: sealer.id })
}, 300_000)

afterAll(() => {
  t.close()
})

describe('the earlier refusal before the seal', () => {
  it('1. is the latest earlier ended run of the sealing agent, with the check that stands on it', () => {
    expect(theEarlierRefusal('seal-0'), 'no earlier run of the agent has ended').toBeNull()

    expect(theEarlierRefusal('seal-1'), 'the earlier run naming the registry id').toEqual({
      run: idOf('a-by-id'),
      check: checks.get('a-by-id'),
    })
    expect(theEarlierRefusal('seal-2'), 'the earlier run naming the handle').toEqual({
      run: idOf('a-by-handle'),
      check: checks.get('a-by-handle'),
    })
    expect(theEarlierRefusal('seal-3'), 'the earlier run naming the agent record in its binding').toEqual({
      run: idOf('a-by-record'),
      check: checks.get('a-by-record'),
    })
    expect(theEarlierRefusal('a-after'), 'the latest earlier ended run is still the one before the seal').toEqual({
      run: idOf('a-by-record'),
      check: checks.get('a-by-record'),
    })
  })

  it("2. is read from the sealer's runs only, whatever another agent's history holds", () => {
    // READ ONCE FIRST, so prepared statements and any one-time reading are behind us before a count is taken.
    expect(theEarlierRefusal('seal-3')).toEqual({ run: idOf('a-by-record'), check: checks.get('a-by-record') })

    // THE LARGER SIZE: both batches of the other agent's runs are here.
    const larger = theRowsTheEarlierRefusalReads(() => {
      expect(theEarlierRefusal('seal-3'), 'the answer at the larger size').toEqual({
        run: idOf('a-by-record'),
        check: checks.get('a-by-record'),
      })
    })
    const largerWhole = theWholeCount(larger)
    const largerLargest = theLargestCount(larger)
    expect(largerWhole, 'the reader read some rows').toBeGreaterThan(0)

    // THE SMALLER SIZE: the other agent's second hundred runs are deleted, as a run is.
    for (const id of secondBatch) t.api.deleteRecord(id, HUMAN)

    const smaller = theRowsTheEarlierRefusalReads(() => {
      expect(theEarlierRefusal('seal-3'), 'the answer at the smaller size').toEqual({
        run: idOf('a-by-record'),
        check: checks.get('a-by-record'),
      })
    })
    const smallerWhole = theWholeCount(smaller)
    const smallerLargest = theLargestCount(smaller)

    expect(smallerWhole, `the whole count does not grow with another agent’s runs (larger ${largerWhole}, smaller ${smallerWhole})`).toBe(largerWhole)
    expect(smallerWhole, 'the reader read some rows').toBeGreaterThan(0)
    expect(largerLargest, `no one call read more rows than the sealer has runs (larger ${largerLargest}, smaller ${smallerLargest})`).toBeLessThanOrEqual(THE_SEALERS_RUNS)
    expect(smallerLargest, `no one call read more rows than the sealer has runs (larger ${largerLargest}, smaller ${smallerLargest})`).toBeLessThanOrEqual(THE_SEALERS_RUNS)
  })
})
