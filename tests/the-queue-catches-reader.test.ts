// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH TEST FILE RAN, HOW LONG IT TOOK AND WHAT IT CAUGHT, READ FROM THE MERGE QUEUE'S OWN STEPS.
 *
 * The tool is tools/test-catches-in-the-queue.mjs. Every case here writes made-up entry folders into a
 * temporary folder of its own, writes each entry's steps.jsonl and vitest reports, and runs the tool
 * as a process of its own. Nothing here reads the real ~/.cache/mole-office/merge-queue.
 *
 * The shapes copied are the ones the merge tool itself records: a tested step's facts at
 * tools/merge-tool/testing.mjs:103 and the report naming at tools/merge-tool/testing.mjs:414, a
 * borrowed result at tools/merge-tool/pairs.mjs:493, a documentation entry at
 * tools/merge-tool/testing.mjs:117, a plugin entry at tools/merge-tool/plugin-lane.mjs:132, a fix round
 * at tools/merge-tool/testing.mjs:261, a build that failed at tools/merge-tool/testing.mjs:177, and a
 * main that moved while testing at tools/merge-tool/testing.mjs:245.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const TOOL = fileURLToPath(new URL('../tools/test-catches-in-the-queue.mjs', import.meta.url))
const MADE: string[] = []
afterAll(() => {
  for (const folder of MADE.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A commit that is forty lower-case hex characters, as a tested step records it. */
const COMMIT = '0123456789abcdef0123456789abcdef01234567'
const AT = '2026-10-20 10:00:00'
const REASONS = [
  'before since',
  'borrowed',
  'documentation',
  'plugin',
  'fix round',
  'build red',
  'older shape',
  'report written over',
  'carried count mismatch',
  'a command, not a file',
  'a red the detail does not explain',
  'a file outside the tree',
  'no steps file',
  'unreadable line',
  'unreadable time',
] as const

/** A fresh temporary root holding a queue folder, so a made-up tree can sit beside it rather than inside it. */
function aWorkspace(): { root: string; queue: string } {
  const root = mkdtempSync(join(tmpdir(), 'queue-catches-'))
  MADE.push(root)
  const queue = join(root, 'queue')
  mkdirSync(queue)
  return { root, queue }
}

/** The local milliseconds of a stored stamp, as parseStoredStamp reads one. */
function localMs(stamp: string): number {
  return new Date(stamp.replace(' ', 'T')).getTime()
}

function aTested(at: string, detail: Record<string, any>): Record<string, any> {
  return { at, step: 'tested', facts: {}, detail }
}

function aMoved(at: string): Record<string, any> {
  return { at, step: 'main-moved-while-testing', facts: {}, detail: {} }
}

/** A tested step's detail with the fields every read step carries, then this case's own. */
function aDetail(tree: string, overrides: Record<string, any> = {}): Record<string, any> {
  return {
    commit: COMMIT,
    tree,
    ran: {},
    red: [],
    stillRed: [],
    redOnMainToo: [],
    clearedByThePair: [],
    green: true,
    ...overrides,
  }
}

function writeEntry(queue: string, name: string, lines: (Record<string, any> | string)[]): string {
  const folder = join(queue, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'steps.jsonl'), `${lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')}\n`)
  return folder
}

/** A vitest report with top-level startTime, as keepTheReport copies one into the entry's folder. */
function writeReport(folder: string, name: string, startTime: number, files: { name: string; seconds: number }[]): void {
  const testResults = files.map((file) => ({
    name: file.name,
    status: 'passed',
    startTime,
    endTime: startTime + Math.round(file.seconds * 1000),
    assertionResults: [],
  }))
  writeFileSync(join(folder, name), JSON.stringify({ startTime, testResults }))
}

type Ran = ReturnType<typeof runTheTool>

function runTheTool(queue: string, args: string[] = []): { status: number | null; stdout: string; stderr: string; json: any; error: Error | undefined } {
  const ran = spawnSync(process.execPath, [TOOL, '--queue', queue, ...args], { encoding: 'utf8', timeout: 30_000 })
  let json: any = null
  if (ran.status === 0 && ran.stdout.trim() !== '') json = JSON.parse(ran.stdout)
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, json, error: ran.error }
}

function noSkips(ran: Ran): void {
  expect(ran.json.skipped).toEqual(Object.fromEntries(REASONS.map((reason) => [reason, 0])))
}

function totalsFor(ran: Ran, file: string): Record<string, any> {
  return ran.json.files[file]
}

/** Every file under a folder with its size and modification time, for the case that must write nothing. */
function aListing(folder: string): string[] {
  const out: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name)
      const info = statSync(path)
      if (info.isDirectory()) walk(path)
      else out.push(`${path}:${info.size}:${info.mtimeMs}`)
    }
  }
  walk(folder)
  return out
}

describe('what a read tested step becomes', () => {
  it('gives three suite rows with their seconds for a green suite, and nothing caught', () => {
    // The shape is a green tested step: facts at testing.mjs:103, the suite report named at :414.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const folder = writeEntry(queue, 'entry-green', [
      aTested(AT, aDetail(tree, { ran: { test: { exit: 0, report: '/old/suite.json' } } })),
    ])
    const start = localMs(AT)
    writeReport(folder, 'suite.json', start, [
      { name: join(tree, 'tests/charlie.test.ts'), seconds: 3 },
      { name: join(tree, 'tests/alpha.test.ts'), seconds: 1 },
      { name: join(tree, 'tests/bravo.test.ts'), seconds: 2 },
    ])

    const ran = runTheTool(queue)

    expect(ran.status).toBe(0)
    expect(ran.json.read).toEqual({ entries: 1, lines: 1, testedSteps: 1, rowsFromSteps: 3 })
    expect(ran.json.since).toBe('2026-10-18')
    expect(ran.json.queue).toBe(queue)
    noSkips(ran)
    expect(ran.json.rows.map((row: any) => [row.file, row.ranIn, row.seconds])).toEqual([
      ['tests/alpha.test.ts', 'suite', 1],
      ['tests/bravo.test.ts', 'suite', 2],
      ['tests/charlie.test.ts', 'suite', 3],
    ])
    for (const [file, seconds] of [['tests/alpha.test.ts', 1], ['tests/bravo.test.ts', 2], ['tests/charlie.test.ts', 3]] as const) {
      expect(totalsFor(ran, file)).toEqual({
        runs: 1,
        secondsTotal: seconds,
        secondsKnown: 1,
        redInRun: 0,
        flaky: 0,
        redOnMain: 0,
        cleared: { pair: 0, modal: 0, bus: 0, notKnown: 0 },
        caught: 0,
        borrowedCaught: 0,
      })
      expect(ran.json.rows.find((row: any) => row.file === file)).toMatchObject({ caught: false, flaky: false, redInRun: false, alone: null, redOnMain: false, cleared: null })
    }
    expect(ran.stderr.trim().split('\n')).toHaveLength(1)
    expect(ran.stderr).toContain('1 tested steps read')
    expect(ran.stderr).toContain('0 catches')
  })

  it('marks a file red in the run and green alone as flaky, not caught', () => {
    // The shape is a rerun alone at testing.mjs:455 and the green flag at :483.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/red.test.ts'
    const folder = writeEntry(queue, 'entry-flaky', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 1, report: '/old/suite.json' } },
        red: [{ file, alone: 'green' }],
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 0.5 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows).toHaveLength(1)
    expect(ran.json.rows[0]).toMatchObject({ file, ranIn: 'suite', seconds: 0.5, redInRun: true, alone: 'green', caught: false, flaky: true })
    expect(totalsFor(ran, file)).toMatchObject({ runs: 1, redInRun: 1, flaky: 1, caught: 0 })
  })

  it('marks a file red alone and red on main too, and does not catch it', () => {
    // The shape is a comparison with main at testing.mjs:473.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/also-main.test.ts'
    const folder = writeEntry(queue, 'entry-main-red', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json' } },
        red: [{ file, alone: 'red' }],
        redOnMainToo: [{ file, mainAt: COMMIT, failing: ['a test'] }],
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 1 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows[0]).toMatchObject({ file, redInRun: true, alone: 'red', redOnMain: true, caught: false, cleared: null })
    expect(totalsFor(ran, file)).toMatchObject({ redOnMain: 1, caught: 0 })
  })

  it('says pair and modal for the two kinds of cleared red', () => {
    // The shapes are the pair's clearing at testing.mjs:475 and Modal's at :480.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const pair = 'tests/pair.test.ts'
    const modal = 'tests/modal.test.ts'
    const folder = writeEntry(queue, 'entry-cleared', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json' } },
        red: [{ file: pair, alone: 'red' }, { file: modal, alone: 'red' }],
        clearedByThePair: [{ file: pair, why: 'green together' }],
        loadTimeouts: [{ file: modal, mainAt: COMMIT }],
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [
      { name: join(tree, pair), seconds: 1 },
      { name: join(tree, modal), seconds: 2 },
    ])

    const ran = runTheTool(queue)

    expect(ran.json.rows.map((row: any) => [row.file, row.cleared])).toEqual([[modal, 'modal'], [pair, 'pair']])
    expect(totalsFor(ran, pair).cleared).toEqual({ pair: 1, modal: 0, bus: 0, notKnown: 0 })
    expect(totalsFor(ran, modal).cleared).toEqual({ pair: 0, modal: 1, bus: 0, notKnown: 0 })
  })

  it('catches a file still red with the entry and not red on main', () => {
    // The shape is stillRed with a green flag of false, at testing.mjs:502 and :483.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/caught.test.ts'
    const folder = writeEntry(queue, 'entry-caught', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 1, report: '/old/suite.json' } },
        red: [{ file, alone: 'red' }],
        stillRed: [file],
        green: false,
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 1.25 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows[0]).toMatchObject({ file, ranIn: 'suite', seconds: 1.25, redInRun: true, alone: 'red', caught: true, cleared: null })
    expect(totalsFor(ran, file)).toMatchObject({ runs: 1, caught: 1, borrowedCaught: 0 })
    expect(ran.stderr).toContain('1 catches')
  })

  it('does not catch a still-red file when the step says the run was green', () => {
    // The shape is stillRed with a green flag of true, from the bus's decision at testing.mjs:483.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/green-with-still-red.test.ts'
    const folder = writeEntry(queue, 'entry-green-still-red', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json' } },
        red: [{ file, alone: 'red' }],
        stillRed: [file],
        green: true,
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 1 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows[0]).toMatchObject({ file, redInRun: true, alone: 'red', caught: false })
    expect(totalsFor(ran, file)).toMatchObject({ caught: 0, borrowedCaught: 0 })
  })

  it('says the bus cleared a red when the step names a pair', () => {
    // The shape is a bus's facts at testing.mjs:407, with a red alone and no stillRed.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/bus.test.ts'
    const folder = writeEntry(queue, 'entry-bus', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json' } },
        red: [{ file, alone: 'red' }],
        pair: { with: 'another-entry', bus: ['another-entry'], commit: COMMIT, tree },
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 1 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows[0]).toMatchObject({ file, cleared: 'bus', caught: false })
    expect(totalsFor(ran, file).cleared).toEqual({ pair: 0, modal: 0, bus: 1, notKnown: 0 })
    expect(ran.json.skipped['a red the detail does not explain']).toBe(0)
  })

  it('says a red is not known, and counts it, when no pair explains it', () => {
    // The same shape without detail.pair, which is the shape at testing.mjs:455 for a lone entry.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const file = 'tests/unexplained.test.ts'
    const folder = writeEntry(queue, 'entry-unexplained', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json' } },
        red: [{ file, alone: 'red' }],
      })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, file), seconds: 1 }])

    const ran = runTheTool(queue)

    expect(ran.json.rows[0]).toMatchObject({ file, cleared: 'not known', caught: false })
    expect(totalsFor(ran, file).cleared).toEqual({ pair: 0, modal: 0, bus: 0, notKnown: 1 })
    expect(ran.json.skipped['a red the detail does not explain']).toBe(1)
  })

  it('reads related tests that went red before the suite, and catches the red one there', () => {
    // The shape is the related-tests-first bounce at testing.mjs:365-377: detail.ran.related, no detail.ran.test.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const red = 'tests/related-red.test.ts'
    const green = 'tests/related-green.test.ts'
    const folder = writeEntry(queue, 'entry-related-red', [
      aTested(AT, aDetail(tree, {
        ran: { related: { files: 2, exit: 1, report: '/old/related.json' } },
        red: [{ file: red, alone: 'red' }],
        stillRed: [red],
        green: false,
      })),
    ])
    writeReport(folder, 'related.json', localMs(AT), [
      { name: join(tree, green), seconds: 0.7 },
      { name: join(tree, red), seconds: 0.9 },
    ])

    const ran = runTheTool(queue)

    expect(ran.json.rows.map((row: any) => [row.file, row.ranIn, row.seconds, row.caught])).toEqual([
      [green, 'related', 0.7, false],
      [red, 'related', 0.9, true],
    ])
    expect(totalsFor(ran, red)).toMatchObject({ runs: 1, caught: 1 })
  })

  it('carries the related files the suite left out, and refuses a carried count that does not match', () => {
    // The shape is a carried suite at testing.mjs:418: detail.ran.test.carried.files and the related report.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const a = 'tests/carried-a.test.ts'
    const b = 'tests/both.test.ts'
    const c = 'tests/suite-only.test.ts'
    const good = writeEntry(queue, 'entry-carried', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json', carried: { files: 1 } }, related: { files: 2, report: '/old/related.json' } },
      })),
    ])
    writeReport(good, 'related.json', localMs(AT), [
      { name: join(tree, a), seconds: 0.4 },
      { name: join(tree, b), seconds: 0.6 },
    ])
    writeReport(good, 'suite.json', localMs(AT), [
      { name: join(tree, b), seconds: 1.1 },
      { name: join(tree, c), seconds: 1.2 },
    ])
    const bad = writeEntry(queue, 'entry-carried-mismatch', [
      aTested(AT, aDetail(tree, {
        ran: { test: { exit: 0, report: '/old/suite.json', carried: { files: 2 } }, related: { files: 2, report: '/old/related.json' } },
      })),
    ])
    writeReport(bad, 'related.json', localMs(AT), [
      { name: join(tree, a), seconds: 0.4 },
      { name: join(tree, b), seconds: 0.6 },
    ])
    writeReport(bad, 'suite.json', localMs(AT), [
      { name: join(tree, b), seconds: 1.1 },
      { name: join(tree, c), seconds: 1.2 },
    ])

    const ran = runTheTool(queue)

    expect(ran.json.rows.filter((row: any) => row.entry === 'entry-carried').map((row: any) => [row.file, row.ranIn])).toEqual([
      [b, 'suite'],
      [a, 'related'],
      [c, 'suite'],
    ])
    expect(ran.json.rows.filter((row: any) => row.entry === 'entry-carried-mismatch').map((row: any) => [row.file, row.ranIn])).toEqual([
      [b, 'suite'],
      [c, 'suite'],
    ])
    expect(ran.json.skipped['carried count mismatch']).toBe(1)
  })

  it('reads a borrowed result as red rows only, keeps borrowed catches apart, and counts a command', () => {
    // The shape is a borrowed result at pairs.mjs:493: borrowedFrom, decided.green and decided.redTests.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    writeEntry(queue, 'entry-borrowed', [
      aTested(AT, {
        borrowedFrom: 'entry-theirs',
        tree,
        decided: { green: false, redTests: ['tests/borrowed-a.test.ts', 'npm test', 'tests/borrowed-b.test.ts'] },
      }),
    ])

    const ran = runTheTool(queue)

    expect(ran.json.rows.map((row: any) => [row.file, row.ranIn, row.caught, row.commit, row.seconds])).toEqual([
      ['tests/borrowed-a.test.ts', 'borrowed', true, null, null],
      ['tests/borrowed-b.test.ts', 'borrowed', true, null, null],
    ])
    expect(ran.json.skipped.borrowed).toBe(1)
    expect(ran.json.skipped['a command, not a file']).toBe(1)
    // A borrowed step is read, not skipped, and its catches are not the step's own; the command is counted apart.
    expect(ran.stderr).toContain('0 tested steps read, 1 borrowed results read, 0 skipped, 0 catches and 2 borrowed catches.')
    expect(ran.stderr).toContain('1 item read was counted apart')
    expect(totalsFor(ran, 'tests/borrowed-a.test.ts')).toEqual({
      runs: 0,
      secondsTotal: 0,
      secondsKnown: 0,
      redInRun: 0,
      flaky: 0,
      redOnMain: 0,
      cleared: { pair: 0, modal: 0, bus: 0, notKnown: 0 },
      caught: 0,
      borrowedCaught: 1,
    })
  })

  it('counts a report written over, gives its red rows null seconds, and reads the later step', () => {
    // The shape is two tested steps of one entry, both naming suite.json, whose later report keepTheReport overwrote.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const red = 'tests/red.test.ts'
    const other = 'tests/other.test.ts'
    const folder = writeEntry(queue, 'entry-twice', [
      aTested('2026-10-20 10:00:00', aDetail(tree, {
        ran: { test: { exit: 1, report: '/old/suite.json' } },
        red: [{ file: red, alone: 'red' }],
        stillRed: [red],
        green: false,
      })),
      aTested('2026-10-20 11:00:00', aDetail(tree, { ran: { test: { exit: 0, report: '/old/suite.json' } } })),
    ])
    writeReport(folder, 'suite.json', localMs('2026-10-20 11:00:00'), [
      { name: join(tree, other), seconds: 1 },
      { name: join(tree, red), seconds: 1.2 },
    ])

    const ran = runTheTool(queue)

    expect(ran.json.skipped['report written over']).toBe(1)
    expect(ran.json.rows.map((row: any) => [row.at, row.file, row.ranIn, row.seconds, row.caught])).toEqual([
      ['2026-10-20 10:00:00', red, 'suite', null, true],
      ['2026-10-20 11:00:00', other, 'suite', 1, false],
      ['2026-10-20 11:00:00', red, 'suite', 1.2, false],
    ])
    expect(totalsFor(ran, red)).toMatchObject({ runs: 2, secondsKnown: 1, secondsTotal: 1.2, caught: 1 })
  })

  it('uses a main-moved-while-testing step as the window for the next test', () => {
    // The shape is main moved at testing.mjs:245, which gives no row but whose time bounds the next report.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const one = 'tests/one.test.ts'
    const two = 'tests/two.test.ts'
    const folder = writeEntry(queue, 'entry-moved', [
      aTested('2026-10-20 10:00:00', aDetail(tree, { ran: { test: { exit: 0, report: '/old/one.json' } } })),
      aMoved('2026-10-20 10:15:00'),
      aTested('2026-10-20 10:20:00', aDetail(tree, {
        ran: { test: { exit: 1, report: '/old/two.json' } },
        red: [{ file: two, alone: 'red' }],
        stillRed: [two],
        green: false,
      })),
    ])
    writeReport(folder, 'one.json', localMs('2026-10-20 10:00:00'), [{ name: join(tree, one), seconds: 1 }])
    writeReport(folder, 'two.json', localMs('2026-10-20 10:10:00'), [{ name: join(tree, two), seconds: 0.8 }])

    const ran = runTheTool(queue)

    expect(ran.json.skipped['report written over']).toBe(1)
    expect(ran.json.rows).toEqual([
      expect.objectContaining({ file: one, at: '2026-10-20 10:00:00', ranIn: 'suite', seconds: 1 }),
      expect.objectContaining({ file: two, at: '2026-10-20 10:20:00', ranIn: 'suite', seconds: null, caught: true }),
    ])
  })
})

describe('the steps it skips', () => {
  it('counts every skip reason, including each older shape, and leaves all the others at zero', () => {
    // The shapes are: documents at testing.mjs:117, plugin at plugin-lane.mjs:132, a fix round at
    // testing.mjs:261, a failed build at testing.mjs:177, and a detail from before this design.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    writeEntry(queue, 'entry-before-since', [aTested('2026-10-17 23:59:59', aDetail(tree, { ran: { test: { exit: 0 } } }))])
    writeEntry(queue, 'entry-documentation', [{ at: AT, step: 'tested', facts: {}, detail: { documents: { tree } } }])
    writeEntry(queue, 'entry-plugin', [{ at: AT, step: 'tested', facts: {}, detail: { plugin: { folder: 'plugins/x' } } }])
    writeEntry(queue, 'entry-fix-affected', [aTested(AT, aDetail(tree, { ran: { affected: { selection: 'complete' } } }))])
    writeEntry(queue, 'entry-fix-whole', [aTested(AT, aDetail(tree, { wholeSuiteRed: { outcome: 'admitted-for-fix-round' } }))])
    writeEntry(queue, 'entry-build-red', [aTested(AT, aDetail(tree, { ran: { build: { exit: 2 } }, green: false }))])
    for (const field of ['commit', 'tree', 'ran', 'red', 'stillRed', 'redOnMainToo', 'clearedByThePair', 'green'] as const) {
      const detail = aDetail(tree, { ran: { test: { exit: 0 } } })
      delete detail[field]
      writeEntry(queue, `entry-old-${field}`, [{ at: AT, step: 'tested', facts: {}, detail }])
    }
    writeEntry(queue, 'entry-bad-json', ['this is not JSON'])
    writeEntry(queue, 'entry-bad-time', [{ at: 'yesterday', step: 'tested', facts: {}, detail: aDetail(tree) }])
    mkdirSync(join(queue, 'entry-no-steps'))

    const ran = runTheTool(queue)

    expect(ran.status).toBe(0)
    expect(ran.json.read).toEqual({ entries: 17, lines: 16, testedSteps: 0, rowsFromSteps: 0 })
    expect(ran.json.rows).toEqual([])
    expect(ran.json.files).toEqual({})
    expect(ran.json.skipped).toEqual({
      'before since': 1,
      borrowed: 0,
      documentation: 1,
      plugin: 1,
      'fix round': 2,
      'build red': 1,
      'older shape': 8,
      'report written over': 0,
      'carried count mismatch': 0,
      'a command, not a file': 0,
      'a red the detail does not explain': 0,
      'a file outside the tree': 0,
      'no steps file': 1,
      'unreadable line': 1,
      'unreadable time': 1,
    })
    expect(ran.stderr).toContain('0 tested steps read')
    expect(ran.stderr).toContain('17 skipped')
  })

  it('counts a report item outside the tree and gives it no row', () => {
    // The shape is a vitest report's absolute name, as the suite report keeps it at testing.mjs:414.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const folder = writeEntry(queue, 'entry-outside', [
      aTested(AT, aDetail(tree, { ran: { test: { exit: 0, report: '/old/suite.json' } } })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [
      { name: join(tree, 'tests/inside.test.ts'), seconds: 1 },
      { name: join(root, 'outside', 'elsewhere.test.ts'), seconds: 2 },
    ])

    const ran = runTheTool(queue)

    expect(ran.json.rows.map((row: any) => row.file)).toEqual(['tests/inside.test.ts'])
    expect(ran.json.skipped['a file outside the tree']).toBe(1)
  })
})

describe('the command line', () => {
  it('refuses a run with no queue, a queue that is not there, a made-up date and an unknown flag', () => {
    const { root, queue } = aWorkspace()
    const run = (args: string[]) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 30_000 })

    const noQueue = run([])
    expect(noQueue.status).toBe(2)
    expect(noQueue.stderr).toContain('--queue')

    const missing = join(root, 'not-there')
    const notThere = run(['--queue', missing])
    expect(notThere.status).toBe(1)
    expect(notThere.stderr).toContain(missing)

    const madeUpDate = run(['--queue', queue, '--since', '2026-02-30'])
    expect(madeUpDate.status).toBe(2)
    expect(madeUpDate.stderr).toContain('2026-02-30')

    const unknown = run(['--queue', queue, '--wat'])
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('--wat')

    const noValue = run(['--queue', queue, '--since'])
    expect(noValue.status).toBe(2)
    expect(noValue.stderr).toContain('--since')

    const help = run(['--help'])
    expect(help.status).toBe(0)
    expect(`${help.stdout}${help.stderr}`).toContain('~/.cache/mole-office/merge-queue')
  })

  it('writes nothing into the queue folder', () => {
    // The shape is one green tested step and its suite report, as in the first case.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const folder = writeEntry(queue, 'entry-untouched', [
      aTested(AT, aDetail(tree, { ran: { test: { exit: 0, report: '/old/suite.json' } } })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, 'tests/a.test.ts'), seconds: 1 }])
    const before = aListing(queue)

    expect(runTheTool(queue).status).toBe(0)
    expect(runTheTool(queue, ['--out', join(root, 'written.json')]).status).toBe(0)

    expect(aListing(queue)).toEqual(before)
  })

  it('writes with --out exactly the JSON it gives on stdout without it', () => {
    // The same green shape as the first case.
    const { root, queue } = aWorkspace()
    const tree = join(root, 'tree')
    const folder = writeEntry(queue, 'entry-out', [
      aTested(AT, aDetail(tree, { ran: { test: { exit: 0, report: '/old/suite.json' } } })),
    ])
    writeReport(folder, 'suite.json', localMs(AT), [{ name: join(tree, 'tests/a.test.ts'), seconds: 1 }])
    const onStdout = runTheTool(queue)
    const outFile = join(root, 'out.json')
    const toFile = runTheTool(queue, ['--out', outFile])

    expect(onStdout.status).toBe(0)
    expect(toFile.status).toBe(0)
    expect(readFileSync(outFile, 'utf8')).toBe(onStdout.stdout)
    expect(toFile.stderr).toContain(outFile)
  })
})
