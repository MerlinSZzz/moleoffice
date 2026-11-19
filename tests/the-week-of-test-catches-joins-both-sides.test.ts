// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEEK OF TEST CATCHES JOINS BOTH SIDES AND MOVES NOTHING (wave 13n round C, approved in pkVr6rS5xZe-).
 *
 * tools/test-catches-of-the-week.mjs joins one week of the line rows (GET /api/toolset/named-tests/files) with the
 * queue rows tools/test-catches-in-the-queue.mjs wrote each day, and builds one report. What this file proves:
 *   1. the latest whole week runs from a Monday 00:00 to the next, local time;
 *   2. the daily queue files are merged by entry, step and file, keeping the earliest seconds a file had, and only
 *      the week's rows are kept;
 *   3. the old line-side count reads each checkout's named test reports in time order, counts a file red then green
 *      once per checkout, reads only reports started before lines were stored, and keeps nothing of a log but test
 *      file paths and counts;
 *   4. the report keeps queue seconds and line seconds in separate columns, lists the slow files that caught nothing
 *      on either side, at most 50, and says "not classified yet" in the class column;
 *   5. the old count stands in its own block and is never added to the catches;
 *   6. the report names no run, no folder and nothing of a log;
 *   7. the report's short forms are written from its own numbers: a level-1 name, and one part for each block,
 *      within the word limits, with the old count only in its own part.
 *
 * Every folder is made under the test's own temporary folder, and every report, row and stamp is made up.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { theLatestWholeWeek, theOldCount, theQueueRowsOfTheWeek, theWeek } from '../tools/test-catches-of-the-week.mjs'

const FROM = '2026-10-19'
const TO = '2026-10-26'
const MADE_UP_RUN = 'syntheticRun1'
const MADE_UP_LOG_LINE = 'MADE-UP LOG LINE that no report may carry'
const NOT_CLASSIFIED = 'not classified yet'
const COLUMNS = ['File', 'Class', 'Caught in the queue', 'Caught before the seal', 'Runs in the queue', 'Runs in lines', 'Queue seconds in the week', 'Median queue seconds', 'Median line seconds']

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'test-catches-week-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

interface QueueRow { entry: string; at: string; commit: string | null; file: string; ranIn: string; seconds: number | null; redInRun: boolean | null; alone: string | null; redOnMain: boolean | null; cleared: string | null; caught: boolean; flaky: boolean | null }
const queueRow = (entry: string, at: string, file: string, more: Partial<QueueRow> = {}): QueueRow => ({
  entry, at, commit: 'c'.repeat(40), file, ranIn: 'suite', seconds: 1, redInRun: false, alone: null, redOnMain: false, cleared: null, caught: false, flaky: false, ...more,
})
/** One daily file as the tick keeps it: the queue reader's whole output. */
function aDailyFile(work: string, day: string, since: string, rows: QueueRow[]): void {
  writeFileSync(join(work, `queue-${day}.json`), JSON.stringify({ queue: 'made-up-queue', since, read: { entries: 1, lines: 1, testedSteps: 1, rowsFromSteps: rows.length }, skipped: {}, rows, files: {} }))
}

interface LineFile { file: string; runs: number; reds: number; catches: number; flaky: number; testChanged: number; mutationProofs: number; notComparable: number; medianSeconds: number | null; secondsKnown: number; caught: unknown[] }
const lineFile = (file: string, more: Partial<LineFile>): LineFile => ({ file, runs: 1, reds: 0, catches: 0, flaky: 0, testChanged: 0, mutationProofs: 0, notComparable: 0, medianSeconds: null, secondsKnown: 0, caught: [], ...more })
const aCatch = { run: MADE_UP_RUN, red: { seq: 1, at: `${FROM} 10:00:00`, commit: '0'.repeat(40), change: 'none' }, green: { seq: 2, at: `${FROM} 11:00:00`, commit: '1'.repeat(40), change: 'none' } }

describe('the latest whole week', () => {
  it('1. runs from the Monday before the latest Monday 00:00 to that Monday, local time', () => {
    expect(theLatestWholeWeek(new Date('2026-10-28T10:00:00'))).toEqual({ from: FROM, to: TO })
    expect(theLatestWholeWeek(new Date('2026-10-26T00:00:00'))).toEqual({ from: FROM, to: TO })
    expect(theLatestWholeWeek(new Date('2026-10-25T23:59:59'))).toEqual({ from: '2026-10-12', to: FROM })
    expect(theLatestWholeWeek(new Date('2026-11-01T12:00:00'))).toEqual({ from: FROM, to: TO })
  })
})

describe('the daily queue files', () => {
  it('2. are merged by entry, step and file, keep the earliest seconds a file had, and keep only the week', () => {
    const work = join(root, 'work')
    mkdirSync(work)
    aDailyFile(work, '2026-10-20', '2026-10-12', [
      queueRow('e0', '2026-10-18 23:59:59', 'tests/f1.test.ts'),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/f1.test.ts', { seconds: 3.2 }),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/f2.test.ts', { seconds: null }),
    ])
    // Two days on, the step's report was written over: f1 has no seconds now, and f2's came from a later read.
    aDailyFile(work, '2026-10-22', '2026-10-12', [
      queueRow('e1', `${FROM} 10:00:00`, 'tests/f1.test.ts', { seconds: null }),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/f2.test.ts', { seconds: 4 }),
      queueRow('e2', '2026-10-21 12:00:00', 'tests/f1.test.ts', { seconds: 1, caught: true }),
      queueRow('e3', `${TO} 00:00:00`, 'tests/f1.test.ts'),
    ])
    writeFileSync(join(work, 'week-2026-10-12.json'), JSON.stringify({ rows: [queueRow('e9', `${FROM} 09:00:00`, 'tests/not-a-daily-file.test.ts')] }))
    const read = theQueueRowsOfTheWeek({ work, from: FROM, to: TO })
    expect(read.rows.map((r: QueueRow) => [r.entry, r.file, r.seconds, r.caught])).toEqual([
      ['e1', 'tests/f1.test.ts', 3.2, false],
      ['e1', 'tests/f2.test.ts', 4, false],
      ['e2', 'tests/f1.test.ts', 1, true],
    ])
    expect(read.days).toEqual(['2026-10-20', '2026-10-22'])
    expect(read.since).toBe('2026-10-12')
  })

  it('reads no rows, and says so, when the work folder holds no daily file of the week', () => {
    const work = join(root, 'empty-work')
    mkdirSync(work)
    expect(theQueueRowsOfTheWeek({ work, from: FROM, to: TO })).toEqual({ rows: [], days: [], since: null })
  })
})

describe('the old line-side count', () => {
  const at = (day: string): number => new Date(`${day}T10:00:00`).getTime()
  function aReport(folder: string, name: string, startTime: number, results: [string, 'passed' | 'failed'][]): void {
    mkdirSync(folder, { recursive: true })
    const testResults = results.map(([file, status]) => ({ name: `/work/${file}`, status, startTime, endTime: startTime + 1000, message: '', assertionResults: [{ fullName: 'a made-up test', status, failureMessages: status === 'failed' ? [MADE_UP_LOG_LINE] : [] }] }))
    writeFileSync(join(folder, name), JSON.stringify({ numTotalTests: results.length, startTime, success: results.every(([, s]) => s === 'passed'), testResults }))
  }
  function madeUpSandboxes(): string {
    const sandboxes = join(root, 'sandboxes')
    const one = join(sandboxes, 'alpha', 'worktrees', 'one', '.logs')
    // The names run against the times, so only the report's own start time can give the order.
    aReport(one, 'named-tests-d.json', at('2026-10-01'), [['tests/x.test.ts', 'failed'], ['tests/y.test.ts', 'passed']])
    aReport(one, 'named-tests-c.json', at('2026-10-02'), [['tests/x.test.ts', 'passed'], ['tests/y.test.ts', 'failed']])
    aReport(one, 'named-tests-b.json', at('2026-10-03'), [['tests/y.test.ts', 'passed'], ['tests/x.test.ts', 'failed']])
    aReport(one, 'named-tests-a.json', at('2026-10-04'), [['tests/x.test.ts', 'passed']])
    const two = join(sandboxes, 'alpha', 'repo', '.claude', 'worktrees', 'two', '.logs')
    // In name order the green comes first here, so read that way z would not count.
    aReport(two, 'named-tests-2.json', at('2026-10-05'), [['tests/z.test.ts', 'failed']])
    aReport(two, 'named-tests-1.json', at('2026-10-06'), [['tests/z.test.ts', 'passed']])
    const repo = join(sandboxes, 'alpha', 'repo', '.logs')
    aReport(repo, 'named-tests-1.json', at('2026-10-07'), [['tests/w.test.ts', 'failed']])
    aReport(repo, 'named-tests-2.json', at('2026-10-08'), [['tests/w.test.ts', 'passed']])
    const three = join(sandboxes, 'beta', 'worktrees', 'three', '.logs')
    aReport(three, 'named-tests-1.json', at('2026-10-09'), [['tests/x.test.ts', 'failed']])
    aReport(three, 'named-tests-2.json', at('2026-10-10'), [['tests/x.test.ts', 'passed']])
    aReport(three, 'named-tests-3.json', at('2026-10-11'), [['tests/v.test.ts', 'failed']])
    // Started after lines were first stored: read only when nothing was stored yet.
    aReport(three, 'named-tests-4.json', at('2026-10-20'), [['tests/v.test.ts', 'passed']])
    writeFileSync(join(three, 'named-tests-5.json'), '{"testResults": [')
    writeFileSync(join(three, 'timing-1.json'), JSON.stringify({ status: 'passed', testResults: [{ name: '/work/tests/t.test.ts', status: 'failed' }] }))
    writeFileSync(join(three, 'whole-tree-parts-1.json'), JSON.stringify({ files: ['tests/t.test.ts'] }))
    // Not a checkout of a sandbox: never read.
    const elsewhere = join(sandboxes, 'beta', 'elsewhere', '.logs')
    aReport(elsewhere, 'named-tests-1.json', at('2026-10-12'), [['tests/u.test.ts', 'failed']])
    aReport(elsewhere, 'named-tests-2.json', at('2026-10-13'), [['tests/u.test.ts', 'passed']])
    return sandboxes
  }

  it('3. counts a file red then green once per checkout, in time order, before lines were stored, and keeps only paths and counts', () => {
    const sandboxes = madeUpSandboxes()
    const old = theOldCount({ sandboxes, before: '2026-10-19 08:00:00' })
    expect(old).toEqual({
      total: 5,
      files: { 'tests/w.test.ts': 1, 'tests/x.test.ts': 2, 'tests/y.test.ts': 1, 'tests/z.test.ts': 1 },
      reports: 11,
      unreadable: 1,
      checkouts: 4,
      first: '2026-10-01 10:00:00',
      last: '2026-10-11 10:00:00',
    })
    const kept = JSON.stringify(old)
    expect(kept).not.toContain(MADE_UP_LOG_LINE)
    expect(kept).not.toContain('/work/')
    expect(kept).not.toContain(sandboxes)

    const everything = theOldCount({ sandboxes, before: null })
    expect([everything.total, everything.files['tests/v.test.ts'], everything.reports, everything.last]).toEqual([6, 1, 12, '2026-10-20 10:00:00'])
  })
})

describe('the report of the week', () => {
  const OLD = { total: 777, files: { 'tests/x.test.ts': 777 }, reports: 12, unreadable: 1, checkouts: 3, first: '2026-09-01 10:00:00', last: '2026-10-18 22:00:00' }
  function aWeek() {
    const candidates = Array.from({ length: 52 }, (_, i) => `tests/candidate-${String(i).padStart(2, '0')}.test.ts`)
    const rows: QueueRow[] = [
      queueRow('e1', `${FROM} 10:00:00`, 'tests/caught-in-queue.test.ts', { seconds: 10, redInRun: true, caught: true }),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/caught-in-both.test.ts', { seconds: 5, redInRun: true, caught: true }),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/caught-in-lines.test.ts', { seconds: 500 }),
      queueRow('e1', `${FROM} 10:00:00`, 'tests/slow-a.test.ts', { seconds: 100, redInRun: true, alone: 'green', flaky: true }),
      queueRow('e2', '2026-10-20 10:00:00', 'tests/slow-a.test.ts', { seconds: 50 }),
      queueRow('e2', '2026-10-20 10:00:00', 'tests/tie-b.test.ts', { seconds: 120 }),
      queueRow('e2', '2026-10-20 10:00:00', 'tests/tie-a.test.ts', { seconds: 120 }),
      queueRow('e3', '2026-10-21 10:00:00', 'tests/borrowed.test.ts', { ranIn: 'borrowed', commit: null, seconds: null, redInRun: null, redOnMain: null, flaky: null, caught: true }),
      ...candidates.map((file, i) => queueRow('e2', '2026-10-20 10:00:00', file, { seconds: i < 50 ? 100 - i : 1 })),
    ]
    const door = {
      workspaceId: 'default', from: FROM, to: TO, linesStoredSince: '2026-10-19 08:00:00', read: { runs: 3, uses: 9, rows: 20 },
      files: [
        lineFile('tests/caught-in-both.test.ts', { runs: 2, reds: 1, catches: 1, medianSeconds: 1, secondsKnown: 2, caught: [aCatch] }),
        lineFile('tests/caught-in-lines.test.ts', { runs: 4, reds: 1, catches: 1, medianSeconds: 2.5, secondsKnown: 4, caught: [aCatch] }),
        lineFile('tests/slow-a.test.ts', { runs: 3, reds: 1, flaky: 1, medianSeconds: 40, secondsKnown: 3 }),
      ],
    }
    return theWeek({ from: FROM, to: TO, door, queue: { rows, days: ['2026-10-20', '2026-10-22', '2026-10-26'], since: '2026-10-12' }, old: OLD })
  }
  const blockOf = (week: ReturnType<typeof aWeek>, id: string) => {
    const block = week.data.blocks.find((b: { id: string }) => b.id === id)
    expect(block, `block ${id}`).toBeDefined()
    return block
  }
  const words = (text: string): number => text.trim().split(/\s+/).length

  it('4. keeps queue and line seconds apart, and lists the files that caught something, most catches first', () => {
    const week = aWeek()
    expect(week.data.date).toBe(FROM)
    expect(typeof week.data.for).toBe('string')
    expect(week.data.for.length).toBeGreaterThan(0)
    expect(words(week.title)).toBeLessThanOrEqual(15)
    expect(words(week.summary)).toBeLessThanOrEqual(60)
    expect(week.data.blocks.map((b: { id: string }) => b.id)).toEqual(['totals', 'caught', 'candidates', 'old-count', 'limits'])
    const caught = blockOf(week, 'caught')
    expect(caught.type).toBe('table')
    expect(caught.columns.map((c: { label: string }) => c.label)).toEqual(COLUMNS)
    expect(caught.rows.map((r: { cells: unknown[] }) => r.cells)).toEqual([
      ['tests/caught-in-both.test.ts', NOT_CLASSIFIED, 1, 1, 1, 2, 5, 5, 1],
      ['tests/caught-in-lines.test.ts', NOT_CLASSIFIED, 0, 1, 1, 4, 500, 500, 2.5],
      ['tests/caught-in-queue.test.ts', NOT_CLASSIFIED, 1, 0, 1, 0, 10, 10, 'not known'],
    ])
    // The full table stays for the work folder: every file either side saw.
    expect(week.table.map((r: { file: string }) => r.file)).toHaveLength(7 + 52)
  })

  it('5. lists at most 50 slow files that caught nothing on either side, by queue seconds, ties by path', () => {
    const week = aWeek()
    const candidates = blockOf(week, 'candidates')
    expect(candidates.type).toBe('table')
    expect(candidates.columns.map((c: { label: string }) => c.label)).toEqual(COLUMNS)
    const files = candidates.rows.map((r: { cells: unknown[] }) => r.cells[0])
    expect(files).toHaveLength(50)
    expect(files.slice(0, 4)).toEqual(['tests/slow-a.test.ts', 'tests/tie-a.test.ts', 'tests/tie-b.test.ts', 'tests/candidate-00.test.ts'])
    expect(files.at(-1)).toBe('tests/candidate-46.test.ts')
    expect(files).not.toContain('tests/caught-in-lines.test.ts')
    expect(files).not.toContain('tests/borrowed.test.ts')
    expect(candidates.rows[0].cells).toEqual(['tests/slow-a.test.ts', NOT_CLASSIFIED, 0, 0, 2, 3, 150, 75, 40])
    expect(candidates.rows.every((r: { cells: unknown[] }) => r.cells[1] === NOT_CLASSIFIED)).toBe(true)
  })

  it('6. shows the old count on its own, never added to the catches, and names no run, folder or log line', () => {
    const week = aWeek()
    const old = blockOf(week, 'old-count')
    expect(old.type).toBe('text')
    expect(old.heading).toBe('Red then green, cause not known')
    for (const said of ['777', '12 reports', '3 checkouts', '2026-09-01', '2026-10-18']) expect(old.text).toContain(said)
    const totals = blockOf(week, 'totals')
    expect(totals.type).toBe('text')
    // Each side's catches are its own number, so the old count added to either one shows here.
    expect(totals.text).toContain('The queue caught 2, and the lines caught 2 before the seal.')
    expect(week.summary).toContain('the merge queue caught 2 and the lines caught 2 before the seal')
    for (const block of week.data.blocks.filter((b: { id: string }) => b.id !== 'old-count')) {
      const shown = JSON.stringify(block)
      expect(shown, block.id).not.toContain('777')
      expect(shown, block.id).not.toContain('781')
    }
    const limits = blockOf(week, 'limits')
    for (const said of ['2026-10-20', '2026-10-22', '2026-10-26', '2026-10-19 08:00:00']) expect(limits.text).toContain(said)
    const everything = JSON.stringify({ title: week.title, summary: week.summary, data: week.data })
    expect(everything).not.toContain(MADE_UP_RUN)
    expect(everything).not.toContain(root)
  })

  it('7. writes its short forms from its own numbers: a level-1 name, and one part for each block, within the limits', () => {
    interface Part { id: string; heading: string; text30: string; text120: string; covers: string[] }
    const partsOf = (week: ReturnType<typeof aWeek>): Part[] => week.shortForms.parts
    const within = (week: ReturnType<typeof aWeek>) => {
      expect(words(week.shortForms.label)).toBeGreaterThanOrEqual(2)
      expect(words(week.shortForms.label)).toBeLessThanOrEqual(5)
      // One part for each block, in the blocks' order, so every block is covered once.
      expect(partsOf(week).map((p) => p.covers)).toEqual(week.data.blocks.map((b: { id: string }) => [b.id]))
      for (const p of partsOf(week)) {
        expect(words(p.heading), `${p.id} heading`).toBeLessThanOrEqual(10)
        expect(words(p.text30), `${p.id} text30`).toBeLessThanOrEqual(30)
        expect(words(p.text120), `${p.id} text120`).toBeLessThanOrEqual(120)
        expect(p.text30.length, `${p.id} text30`).toBeGreaterThan(0)
        expect(words(p.text120), `${p.id} says more at 120 than at 30`).toBeGreaterThan(words(p.text30))
      }
    }
    const week = aWeek()
    expect(week.shortForms.label).toBe(`Test catches, week of ${FROM}`)
    within(week)
    const part = (id: string): Part => partsOf(week).find((p) => p.covers[0] === id) as Part
    expect(part('totals').heading).toBe('Queue caught 2, lines caught 2 before the seal')
    // Each side's catches as exact text, so the old count added to either side shows, whatever the sum.
    expect(part('totals').text120).toContain('the queue caught 2 and the lines caught 2 before the seal, counted apart')
    expect(part('caught').heading).toBe('3 files caught something this week')
    expect(part('caught').text120).toContain('tests/caught-in-both.test.ts')
    expect(part('candidates').heading).toBe('55 slow files caught nothing this week')
    expect(part('candidates').text120).toContain('tests/slow-a.test.ts, with 150 queue seconds over 2 runs')
    expect(part('old-count').heading).toBe('777 older red then green results, cause not known')
    for (const said of ['12 named test reports', '3 checkouts', '2026-09-01', '2026-10-18', 'never added']) expect(part('old-count').text120).toContain(said)
    // The old count stays in its own part, as it stays in its own block.
    for (const p of partsOf(week).filter((one) => one.covers[0] !== 'old-count')) {
      expect(JSON.stringify(p), p.id).not.toContain('777')
      expect(JSON.stringify(p), p.id).not.toContain('781')
    }
    for (const said of ['2026-10-20', '2026-10-26', '2026-10-19 08:00:00', '50 slowest of 55']) expect(part('limits').text120).toContain(said)
    expect(JSON.stringify(week.shortForms)).not.toContain(MADE_UP_RUN)
    expect(JSON.stringify(week.shortForms)).not.toContain(root)

    // A week whose two sides differ, so a part that swaps them, or counts one pair kind as another, shows.
    const lopsided = theWeek({
      from: FROM, to: TO,
      door: { workspaceId: 'default', from: FROM, to: TO, linesStoredSince: '2026-10-19 08:00:00', read: { runs: 3, uses: 3, rows: 9 }, files: [lineFile('tests/caught-in-lines.test.ts', { runs: 3, reds: 3, catches: 3, testChanged: 2, mutationProofs: 1, notComparable: 4, secondsKnown: 3, medianSeconds: 2, caught: [aCatch, aCatch, aCatch] })] },
      queue: { rows: [queueRow('e1', `${FROM} 10:00:00`, 'tests/caught-in-queue.test.ts', { seconds: 2, redInRun: true, caught: true })], days: ['2026-10-20'], since: FROM },
      old: { ...OLD, total: 0, files: {} },
    })
    within(lopsided)
    const totals = (lopsided.shortForms.parts as Part[])[0]!
    expect(totals.heading).toBe('Queue caught 1, lines caught 3 before the seal')
    expect(totals.text120).toContain('the queue caught 1 and the lines caught 3 before the seal, counted apart')
    expect(totals.text120).toContain('0 flaky, 2 with a changed test, 1 mutation proof and 4 that could not be compared')

    const empty = theWeek({ from: FROM, to: TO, door: { workspaceId: 'default', from: FROM, to: TO, linesStoredSince: null, read: { runs: 0, uses: 0, rows: 0 }, files: [] }, queue: { rows: [], days: [], since: null }, old: { ...OLD, total: 0, files: {}, reports: 0 } })
    within(empty)
    expect((empty.shortForms.parts as Part[]).map((p) => p.heading)).toEqual([
      'Queue caught 0, lines caught 0 before the seal',
      'No file caught anything this week',
      'No slow file to read about',
      'No older named test report was read',
      "Limits of this week's reading",
    ])
  })

  it('says in words when nothing was caught and nothing is a candidate, because a table needs a row', () => {
    const week = theWeek({ from: FROM, to: TO, door: { workspaceId: 'default', from: FROM, to: TO, linesStoredSince: null, read: { runs: 0, uses: 0, rows: 0 }, files: [] }, queue: { rows: [], days: [], since: null }, old: { ...OLD, total: 0, files: {} } })
    expect(week.data.blocks.map((b: { id: string; type: string }) => [b.id, b.type])).toEqual([['totals', 'text'], ['caught', 'text'], ['candidates', 'text'], ['old-count', 'text'], ['limits', 'text']])
    expect(week.table).toEqual([])
  })
})
