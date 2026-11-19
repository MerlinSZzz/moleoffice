// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY NUMBER THE AGENT USE PAGE PUBLISHES ABOUT HOW AGENTS READ THIS PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13 built five aggregate readers — `operationReadings`, `followedByAReadOfTheSameThing`,
 * `gapReadings`, `patternReadings` and `sequenceReadings` — and not one reference to any of them
 * existed anywhere under tests/. Its verifier proved that by changing three of their numbers into
 * different numbers and watching the whole suite of 8,804 tests stay green: the same-trace
 * requirement deleted, the refusal threshold dropped from ten to one, and the two `gap` outcomes
 * swapped with each other.
 *
 * Those three mutations are named in the tests below, each on the assertion that catches it, because
 * a test whose control nobody wrote down is a test nobody can check.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURES ARE WRITTEN OUT, AND SOME READERS READ THEM FROM A DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * The fixtures are hand-written rows with the times, traces and sizes chosen to sit on one side of a
 * threshold or the other. `gapReadings` and `sequenceReadings` take the rows as an array.
 * `operationReadings`, `followedByAReadOfTheSameThing` and `patternReadings` count in SQL, because
 * fetching every row into JavaScript was too slow (problem `Hy13YXeH7xHL`), so for those `write`
 * puts the rows into the fresh test database first and the reader is asked about the whole of it.
 * `freshDb()` is what makes that database, and it also keeps a top-level import of the module under
 * test from opening the operator's real corpus.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE: whether these numbers are worth publishing. That is the
 * page's question and `tests/usage-page.test.ts` asks it. This file asks only whether each number
 * means what the function's own docstring says it means.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { CallRow } from '../src/server/lib/usage-reads.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

let t: TestDb
let reads: typeof import('../src/server/lib/usage-reads.ts')

beforeAll(async () => {
  t = await freshDb()
  reads = await import('../src/server/lib/usage-reads.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

let caseNumber = 0

beforeEach(() => {
  caseNumber += 1
  // EVERY CASE HAS ITS PROJECT. The readers count rows in SQL over one project, so a project of
  // this case's own makes the count see only the rows this case wrote.
  PROJECT = `usage-case-${String(caseNumber)}`
})

/** A fixed clock, so a fixture that depends on "seven days ago" means the same thing every run. */
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0)
const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE

/** The project every fixture row is written into, and the one every reader is asked about. */
let PROJECT = 'default'

/** Every reader that counts in SQL is asked about everything since the start of time. */
const ALL_OF_IT = 0

/**
 * PUT FIXTURE ROWS INTO THE TEST DATABASE, for the readers that count in SQL. The columns a reader
 * never looks at get the values any stored call would have.
 */
function write(rows: readonly CallRow[]): void {
  const insert = t.client.sqlite.prepare(
    'insert into api_calls (id, at_ms, operation, effect, method, waits, status, ms, bytes, list_len, workspace_id, ' +
      'actor_type, actor_id, session_id, identity_source, trace_id, purpose, target_id, target_kind, client_origin) ' +
      "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'header', ?, ?, ?, ?, ?)",
  )
  for (const r of rows) {
    insert.run(r.id, r.atMs, r.operation, r.effect, r.effect === 'write' ? 'POST' : 'GET', r.waits, r.status, r.ms, r.bytes,
      r.listLen, r.workspaceId, r.actorType, r.actorId, r.sessionId, r.traceId, r.purpose, r.targetId, r.targetKind, r.clientOrigin)
  }
}

/** Write the rows, then read the per-operation table over all of them. */
function operationsOver(rows: readonly CallRow[]) {
  write(rows)
  return reads.operationReadings(ALL_OF_IT, PROJECT).readings
}

/** Write the rows, then ask how often a write of `operation` was read straight back. */
function readBackOver(operation: string, rows: readonly CallRow[]) {
  write(rows)
  return reads.followedByAReadOfTheSameThing(operation, ALL_OF_IT, PROJECT)
}

/** Write the rows, then read every pattern over all of them. */
function patternsOver(rows: readonly CallRow[], claims: Parameters<typeof reads.patternReadings>[2], now: number) {
  write(rows)
  return reads.patternReadings(ALL_OF_IT, PROJECT, claims, now)
}

/**
 * ONE ROW, WITH EVERYTHING A CALLER DOES NOT CARE ABOUT FILLED IN.
 *
 * The readers touch eleven of the nineteen columns. Writing all nineteen at every call site would
 * bury the one that matters in each fixture, which is the thing each test is about.
 */
function row(over: Partial<CallRow> & { atMs: number }): CallRow {
  return {
    id: `row-${String(over.atMs)}-${over.operation ?? 'none'}-${over.targetId ?? 'none'}-${String(Math.random()).slice(2, 8)}`,
    operation: 'record.list',
    effect: 'read',
    status: 200,
    ms: 5,
    bytes: 100,
    listLen: null,
    waits: 0,
    purpose: null,
    traceId: null,
    actorType: 'agent',
    actorId: 'claude-code',
    sessionId: null,
    workspaceId: PROJECT,
    targetId: null,
    targetKind: null,
    clientOrigin: null,
    ...over,
  }
}

// ============================================================== what one operation cost, per operation

describe('what each operation cost over a window', () => {
  it('counts calls, sums bytes and takes the median time, per operation', () => {
    const rows = [
      row({ atMs: NOW - 5 * MINUTE, operation: 'record.list', bytes: 1000, ms: 10 }),
      row({ atMs: NOW - 4 * MINUTE, operation: 'record.list', bytes: 2000, ms: 30 }),
      row({ atMs: NOW - 3 * MINUTE, operation: 'record.list', bytes: 3000, ms: 20 }),
      row({ atMs: NOW - 2 * MINUTE, operation: 'record.read', bytes: 10, ms: 1 }),
    ]
    const list = operationsOver(rows)
    const listing = list.find((r) => r.operation === 'record.list')
    expect(listing?.calls).toBe(3)
    expect(listing?.bytes).toBe(6000)
    // THE MIDDLE VALUE OF 10, 20, 30 AND NOT THE MEAN, which the docstring of `medianOf` says and
    // which one slow call would otherwise dominate.
    expect(listing?.msMedian).toBe(20)
  })

  it('counts a refusal as a refusal and a server error as neither', () => {
    const rows = [
      row({ atMs: NOW - 3 * MINUTE, status: 400 }),
      row({ atMs: NOW - 2 * MINUTE, status: 404 }),
      row({ atMs: NOW - MINUTE, status: 500 }),
      row({ atMs: NOW, status: 200 }),
    ]
    // FOUR HUNDREDS ONLY. A 500 is Mole Office failing, not an agent asking for something it may not
    // have; counting the two together would report this product's own faults as agent behaviour.
    expect(operationsOver(rows)[0]?.refused).toBe(2)
  })

  it('leaves a held listen out of the time figure, so a wait is not a cost', () => {
    const rows = [
      row({ atMs: NOW - 2 * MINUTE, ms: 10, waits: 0 }),
      row({ atMs: NOW - MINUTE, ms: 250_000, waits: 1 }),
    ]
    expect(operationsOver(rows)[0]?.msMedian).toBe(10)
  })

  it('orders by bytes, largest first, because that is what the table is for', () => {
    const rows = [
      row({ atMs: NOW - 2 * MINUTE, operation: 'small.one', bytes: 10 }),
      row({ atMs: NOW - MINUTE, operation: 'big.one', bytes: 90_000 }),
    ]
    expect(operationsOver(rows).map((r) => r.operation)).toEqual(['big.one', 'small.one'])
  })

  // THE TWO TESTS BELOW HOLD THE ORDER OF A TIE. The table used to be grouped in JavaScript in the
  // order the rows came out of `order by at_ms`, and the sort kept ties in that order. SQLite now
  // groups by operation name, so without `inFirstCalledOrder` a tie would come out in name order.
  it('keeps two operations that tie on bytes and calls in the order they were first called', () => {
    const rows = [
      row({ atMs: NOW - 3 * MINUTE, operation: 'zeta.first', bytes: 50 }),
      row({ atMs: NOW - 2 * MINUTE, operation: 'alpha.second', bytes: 50 }),
    ]
    expect(operationsOver(rows).map((r) => r.operation)).toEqual(['zeta.first', 'alpha.second'])
  })

  it('keeps two operations first called in the same millisecond in the order their rows were written', () => {
    // THE SAME MILLISECOND. `order by at_ms` walks the time index, which lists rows of one
    // millisecond by rowid, so the row written first comes first.
    const rows = [
      row({ atMs: NOW - MINUTE, operation: 'zeta.written-first', bytes: 50 }),
      row({ atMs: NOW - MINUTE, operation: 'alpha.written-second', bytes: 50 }),
    ]
    expect(operationsOver(rows).map((r) => r.operation)).toEqual(['zeta.written-first', 'alpha.written-second'])
  })

  it('gives a read no read-back share at all, because the question is about writes', () => {
    const rows = [row({ atMs: NOW - MINUTE, operation: 'record.list', effect: 'read' })]
    const reading = operationsOver(rows)[0]
    // NULL AND NOT ZERO. Zero would say no read ever came back for this write; null says it is not
    // a write, which is the fifth invariant in one field.
    expect(reading?.readBackShare).toBeNull()
    expect(reading?.readBackOf).toBe(0)
  })
})

// ================================================== a write, and whether a read came straight back for it

describe('how often a write is followed by a read of the same thing', () => {
  /**
   * A write of `rec-1` in trace `a`, and one in trace `b`, ten seconds apart. Made afresh for each
   * case, so no two cases write the same row id into the one database they now share.
   */
  const writes = (): CallRow[] => [
    row({ atMs: NOW - 60 * SECOND, operation: 'record.update', effect: 'write', targetId: 'rec-1', traceId: 'a' }),
    row({ atMs: NOW - 50 * SECOND, operation: 'record.update', effect: 'write', targetId: 'rec-1', traceId: 'b' }),
  ]

  it('counts a read of the same thing, in the same trace, inside ten seconds', () => {
    const rows = [
      ...writes(),
      row({ atMs: NOW - 58 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'a' }),
      row({ atMs: NOW - 48 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'b' }),
    ]
    const reading = readBackOver('record.update', rows)
    expect(reading.share).toBe(1)
    expect(reading.of).toBe(2)
    expect(reading.traces).toBe(2)
  })

  it('does not count a read from another trace, because two agents at once are not one sequence', () => {
    // THE VERIFIER'S MUTATION 0A.9 IS THIS ASSERTION. Deleting `r.trace_id = w.trace_id` from the
    // query in `followedWritesSince` makes both reads below count, the share go to 1, and this
    // line go red. Before this file existed the whole suite stayed green when it was deleted.
    const rows = [
      ...writes(),
      row({ atMs: NOW - 58 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'somebody-else' }),
      row({ atMs: NOW - 48 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'somebody-else' }),
    ]
    const reading = readBackOver('record.update', rows)
    expect(reading.share).toBe(0)
    expect(reading.traces).toBe(0)
  })

  it('does not count a read of something else that merely happened next', () => {
    const rows = [
      writes()[0]!,
      row({ atMs: NOW - 58 * SECOND, operation: 'record.read', effect: 'read', targetId: 'a-different-record', traceId: 'a' }),
    ]
    expect(readBackOver('record.update', rows).share).toBe(0)
  })

  it('does not count a read eleven seconds later, so the ten-second window is a window', () => {
    const rows = [
      writes()[0]!,
      row({ atMs: NOW - 60 * SECOND + 11 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'a' }),
    ]
    expect(readBackOver('record.update', rows).share).toBe(0)
  })

  it('does not count a read BEFORE the write, which is the other request that happened to be near', () => {
    const rows = [
      writes()[0]!,
      row({ atMs: NOW - 62 * SECOND, operation: 'record.read', effect: 'read', targetId: 'rec-1', traceId: 'a' }),
    ]
    expect(readBackOver('record.update', rows).share).toBe(0)
  })

  it('answers zero of zero for an operation that never wrote, rather than dividing by nothing', () => {
    expect(readBackOver('never.happened', [])).toEqual({ share: 0, of: 0, traces: 0 })
  })

  it('states the threshold that would justify building a continuation hint, and it is three numbers', () => {
    // THE THRESHOLD IS THE POINT OF THE MEASUREMENT. A share with no threshold beside it leaves
    // whoever reads the table to invent one, which is how a number becomes a decision nobody made.
    expect(reads.HINT_THRESHOLD).toEqual({ share: 0.3, occurrences: 20, traces: 3 })
  })
})

// ======================================================= what agents went outside Mole Office for, in five outcomes

describe('what agents went outside Mole Office for, in the five outcomes and never four', () => {
  /** One claim, as the outside-read table stores the parts these readings look at. */
  const claim = (over: Partial<{ wanted: string; verdict: string; traceId: string | null; remote: boolean }>) => ({
    wanted: 'file-contents',
    verdict: 'boundary',
    traceId: 'a',
    remote: false,
    ...over,
  })

  it('separates a boundary Mole Office cannot answer from one it can', () => {
    // THE VERIFIER'S THIRD MUTATION IS THE PAIR BELOW. `file-contents` has no operation, so a
    // `gap` verdict on it is a capability gap; `what-remains` HAS one, so the same verdict there is
    // an agent that did not find it. Swapping the two leaves both counts non-zero and both wrong,
    // and before this file existed nothing anywhere noticed.
    const readings = reads.gapReadings([
      claim({ wanted: 'file-contents', verdict: 'gap' }),
      claim({ wanted: 'what-remains', verdict: 'gap' }),
    ])
    const noOperation = readings.find((r) => r.wanted === 'file-contents')
    const hasOne = readings.find((r) => r.wanted === 'what-remains')

    expect(noOperation?.capabilityGap).toBe(1)
    expect(noOperation?.notFound).toBe(0)
    expect(hasOne?.notFound).toBe(1)
    expect(hasOne?.capabilityGap).toBe(0)
    expect(hasOne?.answeredBy).toBe('project.open-loops')
  })

  it('separates a boundary claimed about something Mole Office answers from one it does not', () => {
    const readings = reads.gapReadings([
      claim({ wanted: 'file-contents', verdict: 'boundary' }),
      claim({ wanted: 'what-remains', verdict: 'boundary' }),
    ])
    expect(readings.find((r) => r.wanted === 'file-contents')?.boundary).toBe(1)
    expect(readings.find((r) => r.wanted === 'what-remains')?.boundaryDisputed).toBe(1)
  })

  it('puts a remote processes-and-ports claim in the fifth outcome and in none of the other four', () => {
    // WHICH MACHINE WAS MEANT IS NOT RECORDED. `runtime.resources` answers about the machine Mole Office
    // runs on, so a claim filed from another machine may be about that machine or about this one,
    // and folding it into `boundary` would decide for the agent which it meant.
    const readings = reads.gapReadings([claim({ wanted: 'processes-and-ports', verdict: 'boundary', remote: true })])
    const reading = readings.find((r) => r.wanted === 'processes-and-ports')
    expect(reading?.machineNotRecorded).toBe(1)
    expect(reading?.boundary).toBe(0)
    expect(reading?.boundaryDisputed).toBe(0)
    expect(reading?.capabilityGap).toBe(0)
    expect(reading?.notFound).toBe(0)
    expect(reading?.unsure).toBe(0)
  })

  it('puts the identical claim from a local arrival in Boundary, disputed', () => {
    const readings = reads.gapReadings([claim({ wanted: 'processes-and-ports', verdict: 'boundary', remote: false })])
    const reading = readings.find((r) => r.wanted === 'processes-and-ports')
    expect(reading?.boundaryDisputed).toBe(1)
    expect(reading?.machineNotRecorded).toBe(0)
  })

  it('counts the traces a question was met in, so one loud run is not five', () => {
    const readings = reads.gapReadings([
      claim({ traceId: 'a' }),
      claim({ traceId: 'a' }),
      claim({ traceId: 'b' }),
      claim({ traceId: null }),
    ])
    expect(readings.find((r) => r.wanted === 'file-contents')?.traces).toBe(2)
  })

  it('leaves out a question nobody has met, rather than drawing eleven rows of zero', () => {
    const readings = reads.gapReadings([claim({ wanted: 'file-contents' })])
    expect(readings.map((r) => r.wanted)).toEqual(['file-contents'])
  })
})

// ================================================================= what has crossed a threshold, and what has not

describe('what has crossed a threshold, and what is only approaching one', () => {
  /** Rows that call one operation `n` times inside one stretch of one trace. */
  function stretchOf(traceId: string, operation: string, n: number, startMs: number, over: Partial<CallRow> = {}): CallRow[] {
    return Array.from({ length: n }, (_unused, i) => row({ atMs: startMs + i * SECOND, operation, traceId, purpose: 'cold-recovery', ...over }))
  }

  it('says a chain crossed only when it is five in one stretch AND three separate traces', () => {
    const crossed = [
      ...stretchOf('a', 'record.read', 5, NOW - 5 * DAY),
      ...stretchOf('b', 'record.read', 5, NOW - 4 * DAY),
      ...stretchOf('c', 'record.read', 5, NOW - 3 * DAY),
    ]
    const chain = patternsOver(crossed, [], NOW).find((p) => p.key === 'chain:record.read')
    expect(chain?.crossed).toBe(true)
    expect(chain?.saw).toBe(5)
    expect(chain?.needs).toBe(5)
    expect(chain?.traces).toBe(3)
  })

  it('reports a chain seen in two traces as NOT crossed, and still reports it', () => {
    const nearly = [...stretchOf('a', 'record.read', 5, NOW - 5 * DAY), ...stretchOf('b', 'record.read', 5, NOW - 4 * DAY)]
    const chain = patternsOver(nearly, [], NOW).find((p) => p.key === 'chain:record.read')
    // BOTH HALVES MATTER. Not crossed, because two traces is one agent's habit rather than a
    // pattern; and still in the list, because a reader has to see one approaching.
    expect(chain?.crossed).toBe(false)
    expect(chain?.traces).toBe(2)
  })

  it('says a refusal pattern crossed at ten in seven days, and not at nine', () => {
    // THE VERIFIER'S SECOND MUTATION IS THIS PAIR. Dropping the ten to a one made every operation
    // with a single refusal read as a crossing, and the whole suite stayed green.
    const nine = Array.from({ length: 9 }, (_u, i) => row({ atMs: NOW - i * 60 * MINUTE, operation: 'record.restore', status: 403 }))
    const tenth = row({ atMs: NOW - 10 * 60 * MINUTE, operation: 'record.restore', status: 403 })
    expect(patternsOver(nine, [], NOW).find((p) => p.key === 'refused:record.restore')?.crossed).toBe(false)
    // The tenth joins the nine already written.
    const crossed = patternsOver([tenth], [], NOW).find((p) => p.key === 'refused:record.restore')
    expect(crossed?.crossed).toBe(true)
    expect(crossed?.saw).toBe(10)
    expect(crossed?.needs).toBe(10)
  })

  it('counts a refusal from eight days ago in neither, because the window is seven days', () => {
    const old = Array.from({ length: 12 }, (_u, i) => row({ atMs: NOW - 8 * DAY - i * MINUTE, operation: 'record.restore', status: 403 }))
    expect(patternsOver(old, [], NOW).find((p) => p.key === 'refused:record.restore')).toBeUndefined()
  })

  it('says a read is too big at a hundred kilobytes over three traces', () => {
    const rows = ['a', 'b', 'c'].flatMap((traceId, i) =>
      stretchOf(traceId, 'record.list', 2, NOW - (5 - i) * DAY, { bytes: 120_000 }),
    )
    const cost = patternsOver(rows, [], NOW).find((p) => p.key === 'cost:record.list')
    expect(cost?.crossed).toBe(true)
    expect(cost?.needs).toBe(100_000)
    expect(cost?.saw).toBe(120_000)
  })

  it('turns a question met in three traces into a crossing, from the claims and not from the calls', () => {
    const claims = [
      {
        wanted: 'file-contents',
        question: 'what a particular file says',
        answeredBy: null,
        boundary: 0,
        boundaryDisputed: 0,
        capabilityGap: 4,
        notFound: 0,
        machineNotRecorded: 0,
        unsure: 0,
        traces: 3,
      },
    ]
    const gap = patternsOver([], claims, NOW).find((p) => p.key === 'gap:file-contents')
    expect(gap?.crossed).toBe(true)
    expect(gap?.says).toBe('Mole Office lacks something recovery needs')
  })

  it('says the other thing about a question Mole Office does answer, so the sentence is not one sentence', () => {
    const claims = [
      {
        wanted: 'what-remains',
        question: 'what unfinished work there is',
        answeredBy: 'project.open-loops',
        boundary: 0,
        boundaryDisputed: 0,
        capabilityGap: 0,
        notFound: 3,
        machineNotRecorded: 0,
        unsure: 0,
        traces: 3,
      },
    ]
    expect(patternsOver([], claims, NOW).find((p) => p.key === 'gap:what-remains')?.says).toBe(
      sayInEnglish('devWords.said.usagePatternGapUnfound'),
    )
  })

  it('marks the polling pattern as one that does NOT survive the prune, and the others as ones that do', () => {
    const polling = Array.from({ length: 30 }, (_u, i) => row({ atMs: NOW - i * MINUTE, operation: 'health.read', bytes: 44 }))
    const poll = patternsOver(polling, [], NOW).find((p) => p.key === 'poll:health.read')
    // A 24-HOUR COUNT OVER UNTRACED ROWS. Those go at fourteen days with no summary, so the reading
    // cannot be recomputed later, and saying it can would be a promise the prune breaks.
    expect(poll?.survivesPrune).toBe(false)
    expect(reads.patternReadings(ALL_OF_IT, PROJECT, [], NOW).find((p) => p.key === 'cost:health.read')?.survivesPrune).toBe(true)
  })

  it('gives each actor that polls one operation its own reading, in the order each first called it', () => {
    // TWO READINGS WITH ONE KEY. The sort by key cannot separate them, so their order is the order
    // each actor first called in the last 24 hours. Without `inFirstCalledOrder` it would be the
    // order of the actors' names, and `amy` would come first.
    const zed = Array.from({ length: 25 }, (_u, i) => row({ atMs: NOW - 60 * MINUTE + i * MINUTE, operation: 'health.read', actorId: 'zed' }))
    const amy = Array.from({ length: 30 }, (_u, i) => row({ atMs: NOW - 30 * MINUTE + i * SECOND, operation: 'health.read', actorId: 'amy' }))
    const polls = patternsOver([...zed, ...amy], [], NOW).filter((p) => p.key === 'poll:health.read')
    expect(polls.map((p) => p.saw)).toEqual([25, 30])
  })

  it('puts what has crossed above what has not', () => {
    const rows = [
      ...['a', 'b', 'c'].flatMap((traceId, i) => stretchOf(traceId, 'crossed.one', 5, NOW - (5 - i) * DAY)),
      ...stretchOf('d', 'approaching.one', 5, NOW - 2 * DAY),
    ]
    const keys = patternsOver(rows, [], NOW).map((p) => p.key)
    expect(keys.indexOf('chain:crossed.one')).toBeLessThan(keys.indexOf('chain:approaching.one'))
  })
})

// ================================================================================ the middle value

describe('the middle value, from how many times each value occurs', () => {
  it('is the one middle value of an odd list and the mean of the two middle values of an even one', () => {
    // 10, 20, 20, 30: the two middle values are 20 and 20.
    expect(reads.medianOfCounts(new Map([[30, 1], [10, 1], [20, 2]]))).toBe(20)
    // 1, 2: the mean of the two.
    expect(reads.medianOfCounts(new Map([[2, 1], [1, 1]]))).toBe(1.5)
    // 5, 5, 9: the one in the middle.
    expect(reads.medianOfCounts(new Map([[9, 1], [5, 2]]))).toBe(5)
    expect(reads.medianOfCounts(new Map())).toBeNull()
  })

  it('agrees with the middle of the same list written out and sorted, on lists of every length', () => {
    // A SECOND WAY TO WORK IT OUT, kept only here. Every median the usage pages draw comes through
    // `medianOfCounts`, so this writes the list out, sorts it and takes the middle, for lists of one
    // to forty values with repeats, and asks that the two agree.
    let seed = 7
    const next = () => (seed = (seed * 48_271) % 2_147_483_647)
    for (let length = 1; length <= 40; length += 1) {
      const values = Array.from({ length }, () => (next() % 9) * 2.5)
      const sorted = [...values].sort((a, b) => a - b)
      const mid = Math.floor(length / 2)
      const expected = length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2
      expect(reads.medianOf(values), `the list ${values.join(', ')}`).toBe(expected)
    }
  })
})

// ================================================================================ what agents do next

describe('which operation follows which', () => {
  it('counts an ordered pair once per adjacency inside one stretch', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'project.bootstrap', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + SECOND, operation: 'record.read', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 4 * DAY, operation: 'project.bootstrap', traceId: 'b', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 4 * DAY + SECOND, operation: 'record.read', traceId: 'b', purpose: 'cold-recovery' }),
    ]
    const pair = reads.sequenceReadings(rows, NOW).find((s) => s.from === 'project.bootstrap' && s.to === 'record.read')
    expect(pair?.occurrences).toBe(2)
    expect(pair?.stretches).toBe(2)
    expect(pair?.traces).toBe(2)
  })

  it('is ordered, so A then B is not the same row as B then A', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'a.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + SECOND, operation: 'b.one', traceId: 'a', purpose: 'cold-recovery' }),
    ]
    const out = reads.sequenceReadings(rows, NOW)
    expect(out.some((s) => s.from === 'a.one' && s.to === 'b.one')).toBe(true)
    expect(out.some((s) => s.from === 'b.one' && s.to === 'a.one')).toBe(false)
  })

  it('never pairs two rows from different traces, however close in time they are', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'a.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + SECOND, operation: 'b.one', traceId: 'somebody-else', purpose: 'cold-recovery' }),
    ]
    // TWO AGENTS WORKING AT THE SAME MOMENT ARE NOT ONE SEQUENCE, which is the same rule the
    // segmentation is built on. Without it, interleaved rows read as one agent's habit.
    expect(reads.sequenceReadings(rows, NOW)).toEqual([])
  })

  it('never pairs across the gap that ended a stretch', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'a.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + 30 * MINUTE, operation: 'b.one', traceId: 'a', purpose: 'cold-recovery' }),
    ]
    expect(reads.sequenceReadings(rows, NOW)).toEqual([])
  })

  it('leaves an untraced row out entirely, because it belongs to no stretch', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'a.one', traceId: null }),
      row({ atMs: NOW - 5 * DAY + SECOND, operation: 'b.one', traceId: null }),
    ]
    expect(reads.sequenceReadings(rows, NOW)).toEqual([])
  })

  it('puts the commonest pair first', () => {
    const rows = [
      row({ atMs: NOW - 5 * DAY, operation: 'a.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + SECOND, operation: 'b.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + 2 * SECOND, operation: 'a.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + 3 * SECOND, operation: 'b.one', traceId: 'a', purpose: 'cold-recovery' }),
      row({ atMs: NOW - 5 * DAY + 4 * SECOND, operation: 'c.one', traceId: 'a', purpose: 'cold-recovery' }),
    ]
    expect(reads.sequenceReadings(rows, NOW)[0]).toMatchObject({ from: 'a.one', to: 'b.one', occurrences: 2 })
  })
})
