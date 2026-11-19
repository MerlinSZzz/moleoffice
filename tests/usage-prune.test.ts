// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PRUNE DELETES, WHAT IT KEEPS, AND THE ONE RULE THAT STOPS THE SUMMARY BEING A SECOND COPY.
 *
 * A trace is in exactly one of two states: its rows exist and no summary does, or a summary exists
 * and no rows do. The fact MOVES; it is never in two places at once. That is what this file holds,
 * and the mutation that proves it is writing the summary without deleting the rows.
 *
 * Without the summary at all, a before-and-after comparison would answer `before = 0` six months
 * after a fix and read as though the change had created the problem — a fabricated conclusion
 * produced by a window that moved silently.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { apiCalls, hourlyCalls, outsideReads, usageStretches } from '../src/server/db/schema.ts'

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

function writeCall(atMs: number, traceId: string | null, purpose: string | null = 'cold-recovery') {
  t.client.db
    .insert(apiCalls)
    .values({
      id: `c${String(atMs)}${traceId ?? 'x'}${String(Math.random()).slice(2, 8)}`,
      atMs,
      operation: 'record.read',
      effect: 'read',
      route: '/api/records/:id',
      method: 'GET',
      waits: 0,
      status: 200,
      ms: 4,
      bytes: 900,
      listLen: null,
      workspaceId: 'default',
      workspaceStated: 1,
      actorType: 'agent',
      actorId: 'claude-code',
      sessionId: 'sess-1',
      identitySource: 'header',
      traceId,
      purpose,
      targetId: null,
      targetKind: null,
      clientAddr: '127.0.0.1',
      clientOrigin: 'local',
    })
    .run()
}

const prune = async () => (await import('../src/server/lib/usage-reads.ts')).pruneUsage

const counts = () => ({
  calls: t.client.db.select().from(apiCalls).all().length,
  summaries: t.client.db.select().from(usageStretches).all(),
  outside: t.client.db.select().from(outsideReads).all().length,
})

describe('the two windows', () => {
  it('takes an untraced row past seven days and leaves a traced one of the same age', async () => {
    writeCall(NOW - 20 * DAY, null, null)
    writeCall(NOW - 20 * DAY, 'run-old-but-traced')
    const result = (await prune())(NOW)
    expect(result.untracedDeleted).toBe(1)
    expect(counts().calls).toBe(1)
    // A TRACED ROW IS PART OF A PIECE OF WORK and is kept for the whole traced window. An untraced
    // one is a browser polling, which is noise a week later — criterion U6's default.
    expect(t.client.db.select().from(apiCalls).all()[0]!.traceId).toBe('run-old-but-traced')
  })

  it('leaves an untraced row that is inside the seven days', async () => {
    writeCall(NOW - 3 * DAY, null, null)
    ;(await prune())(NOW)
    expect(counts().calls).toBe(1)
  })

  it('takes a counted hourly row past the untraced window and leaves a fresh one', async () => {
    // A COUNTED ROW STANDS WHERE UNTRACED REQUEST ROWS STOOD, so it goes on the same window.
    // Criterion U6: without this the folded counts would grow for ever, one row per hour per
    // listener per operation.
    const hour = (ms: number): string => {
      const date = new Date(ms)
      const two = (n: number): string => String(n).padStart(2, '0')
      return `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}`
    }
    const writeCounted = (atMs: number, listener: string): void => {
      t.client.db
        .insert(hourlyCalls)
        .values({
          id: `h${String(atMs)}${listener}`,
          hour: hour(atMs),
          operation: 'handle.waiting',
          workspaceId: 'default',
          listener,
          calls: 4,
        })
        .run()
    }
    writeCounted(NOW - 20 * DAY, 'gone')
    writeCounted(NOW - 3 * DAY, 'here')
    const result = (await prune())(NOW)
    expect(result.foldedDeleted, 'a counted row past the window was kept').toBe(1)
    const left = t.client.db.select().from(hourlyCalls).all()
    expect(left.map((row) => row.listener)).toEqual(['here'])
  })

  it('takes a whole trace once its LAST row is past the traced window, and not before', async () => {
    // THE MAX AND NOT THE MIN. A trace that started in March and is still being written in September
    // is live work, and pruning it on its first row would delete the piece of work being measured.
    writeCall(NOW - 200 * DAY, 'still-going')
    writeCall(NOW - 2 * DAY, 'still-going')
    ;(await prune())(NOW)
    expect(counts().calls).toBe(2)

    writeCall(NOW - 200 * DAY, 'long-finished')
    writeCall(NOW - 199 * DAY, 'long-finished')
    const result = (await prune())(NOW)
    expect(result.tracesPruned).toBe(1)
    expect(t.client.db.select().from(apiCalls).all().every((r) => r.traceId === 'still-going')).toBe(true)
  })
})

describe('the summary, and the rule that keeps it from being a second copy', () => {
  it('leaves one summary per stretch, carrying what the deleted rows cost', async () => {
    writeCall(NOW - 200 * DAY, 'gone', 'cold-recovery')
    writeCall(NOW - 200 * DAY + 60_000, 'gone', 'cold-recovery')
    writeCall(NOW - 200 * DAY + 120_000, 'gone', 'module-work')
    const result = (await prune())(NOW)
    expect(result.stretchesWritten).toBe(2)
    const summaries = counts().summaries
    expect(summaries.length).toBe(2)
    const recovery = summaries.find((s) => s.purpose === 'cold-recovery')!
    expect(recovery.calls).toBe(2)
    expect(recovery.reads).toBe(2)
    expect(recovery.bytes).toBe(1800)
    // THE STATISTICS THE PATTERNS ARE DEFINED ON, and not an approximation of them. A per-operation
    // refusal count cannot be split out of a stretch total, and a median cannot be recovered from a
    // sum, so keeping only totals would change what a six-month series was made of at the window's
    // edge, silently.
    const perOperation = JSON.parse(recovery.perOperation) as Record<string, { calls: number; bytes_median: number }>
    expect(perOperation['record.read']!.calls).toBe(2)
    expect(perOperation['record.read']!.bytes_median).toBe(900)
  })

  it('leaves no trace holding both rows and a summary', async () => {
    writeCall(NOW - 200 * DAY, 'gone')
    writeCall(NOW - 2 * DAY, 'here')
    ;(await prune())(NOW)
    const summarised = new Set(counts().summaries.map((s) => s.traceId))
    const withRows = new Set(t.client.db.select().from(apiCalls).all().map((r) => r.traceId))
    // THE INTERSECTION IS EMPTY. That single assertion is the whole rule: the fact moves, it is
    // never in two places, and nothing has to keep two copies agreeing.
    expect([...summarised].filter((id) => withRows.has(id))).toEqual([])
  })

  it('counts the machines a pruned stretch ran from as three numbers, not one word', async () => {
    writeCall(NOW - 200 * DAY, 'mixed')
    t.client.db
      .insert(apiCalls)
      .values({
        id: 'remote-one',
        atMs: NOW - 200 * DAY + 1000,
        operation: 'record.read',
        effect: 'read',
        route: '/api/records/:id',
        method: 'GET',
        waits: 0,
        status: 200,
        ms: 4,
        bytes: 900,
        listLen: null,
        workspaceId: 'default',
        workspaceStated: 1,
        actorType: 'agent',
        actorId: 'claude-code',
        sessionId: 'sess-1',
        identitySource: 'header',
        traceId: 'mixed',
        purpose: 'cold-recovery',
        targetId: null,
        targetKind: null,
        clientAddr: '127.0.0.1',
        clientOrigin: 'remote',
      })
      .run()
    ;(await prune())(NOW)
    const summary = counts().summaries[0]!
    expect(summary.localCalls).toBe(1)
    expect(summary.remoteCalls).toBe(1)
    expect(summary.unknownCalls).toBe(0)
  })
})

/**
 * THE PRUNE IS REACHED BY THE SERVER, WHICH IS THE HALF THAT WAS MISSING.
 *
 * `pruneUsage` was written, tested and mutation-proven, and for a fortnight ITS ONLY CALLER ANYWHERE
 * WAS LINE 60 OF THIS FILE. `design/round-ten/design/telemetry.md:1447` names the call site exactly —
 * *called once from `start()` in `src/server/index.ts` after `prepareToServe` and before `listen`* —
 * and `start()` went straight from one to the other. Every test in this file called the function
 * directly, so no test could tell a wired feature from an unwired one.
 *
 * The cases below are ordinary behaviour: what the call does, and the line the operator reads
 * afterwards. A deletion nobody is told about is what this repository refuses everywhere else.
 */
describe('the prune is called, and says what it did', () => {
  it('prints one line naming both windows and what went', async () => {
    writeCall(NOW - 20 * DAY, null, null)
    writeCall(NOW - 200 * DAY, 'gone')
    const { pruneAtStart } = await import('../src/server/lib/usage-reads.ts')
    const { result, line } = pruneAtStart(NOW)
    expect(result.untracedDeleted).toBe(1)
    expect(result.tracesPruned).toBe(1)
    // BOTH WINDOWS ARE IN THE LINE, with where each came from. An operator reading `0 rows` has to
    // know which windows produced that zero, and since criterion U6 a window that moved has to say
    // whether it was the person's setting or the default.
    expect(line).toContain('7 days')
    expect(line).toContain('180 days')
    expect(line).toContain('(the default)')
    expect(line).toContain('1 untraced request row deleted')
    expect(line).toContain('1 whole trace deleted')
  })

  it('publishes the last prune, and null before one has run, which is not a row of zeroes', async () => {
    const { lastPruneReport, pruneAtStart } = await import('../src/server/lib/usage-reads.ts')
    // NOT ASSERTED NULL HERE: this module holds its reading for the life of the process and the
    // tests above have already pruned. What matters is the DIFFERENCE the type carries — a reader
    // told `null` knows nobody has enforced the windows, and a reader told zero knows somebody did
    // and found nothing past them. A field that could only be zero could not say the first thing.
    pruneAtStart(NOW)
    const after = lastPruneReport()
    expect(after).not.toBeNull()
    expect(after?.untracedDeleted).toBe(0)
    expect(after?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('the number of rows past the window', () => {
  it('deletes every untraced row past fourteen days however many there are, more than SQLite binds variables for', async () => {
    // THE OWNER'S LIVE OFFICE, 13 September 2026 02:20: the untraced rows past the window had grown past
    // SQLite's limit on bound variables, the delete named each one as `?`, and the server died at
    // start with "too many SQL variables" seven restarts in a row. A delete by the window's own
    // condition binds two variables whatever the count. 33,000 rows is past the default limit of
    // 32,766 and past the older limit of 999 by a long way.
    const HOW_MANY = 33_000
    const rows: (typeof apiCalls.$inferInsert)[] = []
    for (let i = 0; i < HOW_MANY; i += 1) {
      rows.push({
        id: `many-${String(i)}`,
        atMs: NOW - 20 * DAY - i,
        operation: 'record.read',
        effect: 'read',
        route: '/api/records/:id',
        method: 'GET',
        waits: 0,
        status: 200,
        ms: 4,
        bytes: 900,
        listLen: null,
        workspaceId: 'default',
        workspaceStated: 1,
        actorType: 'agent',
        actorId: 'claude-code',
        sessionId: 'sess-1',
        identitySource: 'header',
        traceId: null,
        purpose: null,
        targetId: null,
        targetKind: null,
        clientAddr: '127.0.0.1',
        clientOrigin: 'local',
      })
    }
    // INSERTED IN SLICES, because an insert binds variables per row as well.
    t.client.db.transaction((tx) => {
      for (let at = 0; at < rows.length; at += 400) tx.insert(apiCalls).values(rows.slice(at, at + 400)).run()
    })
    expect(counts().calls).toBe(HOW_MANY)
    const result = (await prune())(NOW)
    expect(result.untracedDeleted).toBe(HOW_MANY)
    expect(counts().calls).toBe(0)
  })
})
