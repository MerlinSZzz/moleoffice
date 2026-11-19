// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RED RUN'S FAILURE LINES ARE KEPT WITH THE PROBLEM THAT NAMES THE RUN (message bkz8lMSIr2Dz; wave 13u round
 * 180). The merge tool files "a test changed its answer" and "red on main" with the red run's log named, and a log is not
 * kept for ever. So the tool reads each such file's failure block from the log while it is there, cut to a bound, and
 * sends it on the step; the office keeps it in the problem. The office's side is driven in
 * tests/a-test-that-changed-its-answer-is-filed-for-the-sheriff.test.ts. This file holds the tool's side:
 *
 *   1. a made-up red run's log gives each failing case's block for the file, from its FAIL line to the line of ⎯ that
 *      ends it, with the line of the log it stands on. Another file's block, a progress line and the FAIL line of a
 *      longer file name are not the file's. A file that failed as a whole is found by its own FAIL line. A log vitest
 *      coloured, as it does outside an agent, gives the same blocks, with the colour codes left out;
 *   2. a long block is cut to the bound, and each cut block says so: the lines after its FAIL line, the characters of a
 *      line, and the blocks of one file, whose rest is counted as left out. The bound keeps a file's lines small;
 *   3. a log with no FAIL line for the file says so, with how many lines it read. A log that cannot be read is said to be
 *      unread, with what reading it said, and is never taken for a log with no FAIL line;
 *   4. the tool takes a changed answer's lines from the run it was red in: a file green alone from the run that was red,
 *      a file green in the pair from its own red run alone. A file that carries its lines keeps them, and one whose red
 *      run names no log is sent without them. A file red on main takes them from its own log on main;
 *   5. this tree's step door takes the lines on both steps and refuses lines over the bound. The tool knows the door's
 *      refusal of a key on the items of a step's list by the door's own words and status, item by item, and nothing
 *      looser;
 *   6. an office that takes the lines gets each step once, with them;
 *   7. an office older than the field refuses them, in those words: the tool sends the step again without them, says so
 *      in its log, and goes on;
 *   8. any other refusal of the step stops the tool: another key refused, the same words at another status, and a
 *      refusal of the step sent again.
 *
 * Cases 6 to 8 run the merge tool's own step function in a process of its own, against a stand-in office in this
 * process, because no office that lacks the field can be started from this tree. The stand-in answers with the real
 * door's words for a key it does not declare, read in case 5, with that key changed to failureLines. Every log, file and
 * case here is made up. The modules are read by their path, so this file type-checks before they exist.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

type ABlock = { line: number; lines: string[]; cut: boolean }
type TheLines = { log: string; found: 'blocks'; blocks: ABlock[]; leftOut: number } | { log: string; found: 'none'; lines: number } | { log: string; found: 'unread'; why: string }
type TheBound = { blocks: number; linesAfter: number; characters: number; why: number }
type ARefusal = { status: number; words: string }
type Shared = { HOW_MUCH_OF_A_RED_RUN_IS_KEPT?: TheBound; theFailureLinesOf?: (text: string, file: string, log: string) => TheLines }
type AChanged = { file: string; how: 'green-alone' | 'green-in-the-pair'; commit: string; log?: string; failureLines?: TheLines }
type TheTool = {
  theFailureLinesIn?: (log: string, file: string) => TheLines
  withTheirFailureLines?: (changed: AChanged[], reruns: { file: string; log?: string | null }[], redRun: string | null | undefined) => AChanged[]
  theRedOnMainFiles?: (files: { file: string; log?: string | null }[]) => { file: string; log?: string; failureLines?: TheLines }[]
  theStepDoorDoesNotKnowTheNestedKey?: (refusal: ARefusal, step: string, facts: Record<string, unknown>, key: string) => boolean
  withoutTheFailureLines?: (step: string, facts: Record<string, unknown>) => Record<string, unknown>
  theOfficeDidNotTakeTheFailureLines?: (office: string, step: string, words: string) => string
}

const theShared = async () => {
  const module = (await import(join(REPO, 'src/shared/the-failure-lines-of-a-red-run.ts'))) as Shared
  expect(module.theFailureLinesOf).toBeTypeOf('function')
  expect(module.HOW_MUCH_OF_A_RED_RUN_IS_KEPT).toBeDefined()
  return { theFailureLinesOf: module.theFailureLinesOf!, bound: module.HOW_MUCH_OF_A_RED_RUN_IS_KEPT! }
}
const theTool = async () => (await import(join(REPO, 'tools/merge-tool/the-failure-lines.mjs'))) as TheTool

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
const aFolder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-lines-'))
  made.push(dir)
  return dir
}

const FILE = 'tests/made-up-red.test.ts'
const OTHER = 'tests/made-up-other.test.ts'
const LONGER = `${FILE}x`
const RULE = '⎯'.repeat(30)
const A_SHA = 'a'.repeat(40)
const B_SHA = 'b'.repeat(40)
const text = (lines: string[]) => `${lines.join('\n')}\n`
/** The line of `lines` that `line` stands on, counted from 1 as a log's lines are. */
const lineOf = (lines: string[], line: string) => {
  expect(lines.filter((one) => one === line)).toHaveLength(1)
  return lines.indexOf(line) + 1
}

/** A made-up red run's log, as vitest's default reporter writes one: progress lines, then each failure and its rule. */
const A_RED_RUN = [
  '> made-up-office@0.0.0 test',
  '> vitest run',
  '',
  ` ❯ ${FILE} (4 tests | 3 failed) 41ms`,
  '   × keeps the made-up total 12ms',
  '',
  `${RULE} Failed Tests 4 ${RULE}`,
  '',
  ` FAIL  ${OTHER} > says the made-up word`,
  'AssertionError: expected 1 to be 2',
  ` ❯ ${OTHER}:4:13`,
  '',
  `${RULE}[1/4]⎯`,
  '',
  ` FAIL  ${FILE} > keeps the made-up total`,
  'AssertionError: expected 3 to be 4',
  '',
  '- Expected',
  '+ Received',
  '',
  '- 4',
  '+ 3',
  '',
  ` ❯ ${FILE}:9:21`,
  '',
  `${RULE}[2/4]⎯`,
  '',
  ` FAIL  ${OTHER} > counts the made-up rows`,
  ` FAIL  ${FILE} > counts the made-up rows`,
  ` FAIL  ${FILE} > counts the made-up rows again`,
  'Error: Test timed out in 5000ms.',
  ` ❯ ${FILE}:14:3`,
  '',
  `${RULE}[3/4]⎯`,
  '',
  ` FAIL  ${LONGER} > is another file`,
  'Error: made-up',
  '',
  `${RULE}[4/4]⎯`,
  '',
  ' Test Files  3 failed (3)',
]

describe("the tool reads a red run's failure lines from its log", () => {
  // Mutation: start a block at a FAIL line of another file or of a longer name, take a progress line for a FAIL line,
  // run a block past its rule, keep the blank line before the rule, start a second block inside the first, count
  // lines from 0, or read a coloured log with its colour codes, and this case goes red.
  it("gives each failing case's block for the file, from its FAIL line to its rule, with the line it stands on", async () => {
    const { theFailureLinesOf } = await theShared()
    const log = '/made-up/merge/suite.log'
    const total = ` FAIL  ${FILE} > keeps the made-up total`
    const rows = ` FAIL  ${FILE} > counts the made-up rows`
    expect(theFailureLinesOf(text(A_RED_RUN), FILE, log)).toEqual({
      log,
      found: 'blocks',
      blocks: [
        { line: lineOf(A_RED_RUN, total), lines: [total, 'AssertionError: expected 3 to be 4', '', '- Expected', '+ Received', '', '- 4', '+ 3', '', ` ❯ ${FILE}:9:21`], cut: false },
        { line: lineOf(A_RED_RUN, rows), lines: [rows, ` FAIL  ${FILE} > counts the made-up rows again`, 'Error: Test timed out in 5000ms.', ` ❯ ${FILE}:14:3`], cut: false },
      ],
      leftOut: 0,
    })
    const whole = [`${RULE} Failed Suites 1 ${RULE}`, '', ` FAIL  ${FILE} [ ${FILE} ]`, "Error: Cannot find module '/made-up/tools/made-up-helper.mjs'", ` ❯ ${FILE}:3:1`, '', `${RULE}[1/1]⎯`]
    expect(theFailureLinesOf(text(whole), FILE, log)).toEqual({ log, found: 'blocks', blocks: [{ line: 3, lines: whole.slice(2, 5), cut: false }], leftOut: 0 })
    // A log cut off inside a block keeps the block to its last line.
    expect(theFailureLinesOf(A_RED_RUN.slice(0, 18).join('\n'), FILE, log)).toEqual({ log, found: 'blocks', blocks: [{ line: lineOf(A_RED_RUN, total), lines: A_RED_RUN.slice(14, 18), cut: false }], leftOut: 0 })
    // Outside an agent vitest colours its log. A FAIL line gets the codes vitest 4.1 wrote around it in a run here, and
    // every other line red, so no line of the coloured log is the plain line.
    const coloured = A_RED_RUN.map((line) => line.startsWith(' FAIL  ') ? line.replace(/^ FAIL  (\S+) > /, '\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m $1\u001b[2m > \u001b[22m') : line === '' ? line : `\u001b[31m${line}\u001b[39m`)
    expect(coloured.filter((line) => line !== '' && A_RED_RUN.includes(line))).toEqual([])
    expect(theFailureLinesOf(text(coloured), FILE, log)).toEqual(theFailureLinesOf(text(A_RED_RUN), FILE, log))
  })

  // Mutation: keep a line past linesAfter, a character past the bound, or a block past the bound; leave a cut block
  // unmarked, mark an uncut one, or count the blocks left out wrongly, and this case goes red.
  it('cuts a long block to the bound and says each cut, and counts the blocks of one file it left out', async () => {
    const { theFailureLinesOf, bound } = await theShared()
    expect(bound.blocks).toBeGreaterThan(1)
    expect(bound.linesAfter).toBeGreaterThan(1)
    expect(bound.characters).toBeGreaterThan(1)
    // The bound keeps one file's lines in a problem small.
    expect(bound.blocks * (1 + bound.linesAfter) * bound.characters).toBeLessThanOrEqual(16_000)
    const frames = Array.from({ length: bound.linesAfter + 10 }, (_, index) => ` ❯ made-up/frame-${String(index + 1)}.mjs:${String(index + 1)}:1`)
    const longLine = `Error: ${'made-up words '.repeat(Math.ceil(bound.characters / 6))}`
    expect(longLine.length).toBeGreaterThan(bound.characters)
    const block = (name: string, after: string[]) => [` FAIL  ${FILE} > ${name}`, ...after, '', `${RULE}[n]⎯`, '']
    const more = Array.from({ length: bound.blocks }, (_, index) => block(`is one more, number ${String(index + 1)}`, ['Error: made-up'])).flat()
    const lines = [...block('has a long stack', [longLine, ...frames]), ...block('has a short stack', ['Error: made-up short']), ...more]
    const read = theFailureLinesOf(text(lines), FILE, '/made-up/merge/long.log')
    expect(read.found).toBe('blocks')
    if (read.found !== 'blocks') return
    expect(read.blocks).toHaveLength(bound.blocks)
    expect(read.leftOut).toBe(2)
    const [long, short] = read.blocks
    expect(long).toEqual({ line: 1, lines: [` FAIL  ${FILE} > has a long stack`, `${longLine.slice(0, bound.characters - 1)}…`, ...frames.slice(0, bound.linesAfter - 1)], cut: true })
    expect(short).toEqual({ line: lineOf(lines, ` FAIL  ${FILE} > has a short stack`), lines: [` FAIL  ${FILE} > has a short stack`, 'Error: made-up short'], cut: false })
    for (const one of read.blocks) for (const line of one.lines) expect(line.length).toBeLessThanOrEqual(bound.characters)
    // A block whose lines fit but one of whose lines is too long is cut too, and so is one with lines past the bound only.
    const oneLong = theFailureLinesOf(text(block('has one long line', [longLine])), FILE, '/l') as { blocks: ABlock[] }
    expect(oneLong.blocks[0]).toEqual({ line: 1, lines: [` FAIL  ${FILE} > has one long line`, `${longLine.slice(0, bound.characters - 1)}…`], cut: true })
    const onlyLong = theFailureLinesOf(text(block('has many lines', frames)), FILE, '/l') as { blocks: ABlock[] }
    expect(onlyLong.blocks[0]).toEqual({ line: 1, lines: [` FAIL  ${FILE} > has many lines`, ...frames.slice(0, bound.linesAfter)], cut: true })
    // A block exactly at the bound is whole.
    const exact = theFailureLinesOf(text(block('fits the bound', [`${'x'.repeat(bound.characters)}`, ...frames.slice(0, bound.linesAfter - 1)])), FILE, '/l') as { blocks: ABlock[] }
    expect(exact.blocks[0]!.cut).toBe(false)
    expect(exact.blocks[0]!.lines).toHaveLength(1 + bound.linesAfter)
  })

  // Mutation: answer none for a log that cannot be read, answer none without the lines it read, take a progress line
  // or a longer name's FAIL line for the file, or leave why unbounded, and this case goes red.
  it('says a log with no FAIL line for the file has none, with the lines it read, and a log it cannot read is unread', async () => {
    const { theFailureLinesOf, bound } = await theShared()
    const noBlock = A_RED_RUN.filter((line) => !line.startsWith(` FAIL  ${FILE} `))
    expect(noBlock.some((line) => line.includes(FILE))).toBe(true)
    expect(theFailureLinesOf(text(noBlock), FILE, '/made-up/merge/green.log')).toEqual({ log: '/made-up/merge/green.log', found: 'none', lines: noBlock.length })
    expect(theFailureLinesOf('', FILE, '/made-up/merge/empty.log')).toEqual({ log: '/made-up/merge/empty.log', found: 'none', lines: 0 })
    const { theFailureLinesIn } = await theTool()
    expect(theFailureLinesIn).toBeTypeOf('function')
    const dir = aFolder()
    const missing = join(dir, 'no-such.log')
    const gone = theFailureLinesIn!(missing, FILE)
    expect(gone).toMatchObject({ log: missing, found: 'unread' })
    expect(gone.found === 'unread' && gone.why).toContain('ENOENT')
    const folder = theFailureLinesIn!(dir, FILE)
    expect(folder).toMatchObject({ log: dir, found: 'unread' })
    expect(folder.found === 'unread' && folder.why).toContain('EISDIR')
    for (const one of [gone, folder]) expect(one.found === 'unread' && one.why.length).toBeLessThanOrEqual(bound.why)
    const there = join(dir, 'suite.log')
    writeFileSync(there, text(A_RED_RUN))
    expect(theFailureLinesIn!(there, FILE)).toEqual(theFailureLinesOf(text(A_RED_RUN), FILE, there))
  })

  // Mutation: read a green-alone file's lines from its green rerun, a green-in-the-pair file's from the red run or
  // the pair, read again a file that carries its lines, send lines for a file with no red log, or read a file red on
  // main from another file's log, and this case goes red.
  it("takes each changed answer's lines from the run it was red in, and each file red on main's from its own log on main", async () => {
    const tool = await theTool()
    expect(tool.withTheirFailureLines).toBeTypeOf('function')
    expect(tool.theRedOnMainFiles).toBeTypeOf('function')
    const { theFailureLinesOf } = await theShared()
    const dir = aFolder()
    const PAIRED = 'tests/made-up-paired.test.ts'
    const at = (name: string, lines: string[]) => {
      const path = join(dir, name)
      writeFileSync(path, text(lines))
      return path
    }
    const suite = at('suite.log', A_RED_RUN)
    const greenRerun = at('rerun-1.log', [` ✓ ${FILE} (4 tests) 30ms`])
    const redRerun = at('rerun-2.log', [` FAIL  ${PAIRED} > passes only with main`, 'AssertionError: made-up', '', `${RULE}[1/1]⎯`])
    const carried: TheLines = { log: '/made-up/merge/related.log', found: 'none', lines: 3 }
    const changed: AChanged[] = [
      { file: FILE, how: 'green-alone', commit: A_SHA, log: greenRerun },
      { file: PAIRED, how: 'green-in-the-pair', commit: A_SHA, log: '/made-up/merge/pair-entry.log' },
      { file: OTHER, how: 'green-alone', commit: A_SHA, failureLines: carried },
      { file: 'tests/made-up-cleared.test.ts', how: 'green-in-the-pair', commit: A_SHA },
    ]
    const reruns = [{ file: FILE, log: greenRerun }, { file: PAIRED, log: redRerun }, { file: OTHER, log: null }]
    expect(tool.withTheirFailureLines!(changed, reruns, suite)).toEqual([
      { ...changed[0], failureLines: theFailureLinesOf(text(A_RED_RUN), FILE, suite) },
      { ...changed[1], failureLines: { log: redRerun, found: 'blocks', blocks: [{ line: 1, lines: [` FAIL  ${PAIRED} > passes only with main`, 'AssertionError: made-up'], cut: false }], leftOut: 0 } },
      changed[2],
      changed[3],
    ])
    // A green-alone file whose red run names no log is sent without lines.
    expect(tool.withTheirFailureLines!([changed[0]!], reruns, null)).toEqual([changed[0]])
    const onMain = at('main-red.log', A_RED_RUN)
    expect(tool.theRedOnMainFiles!([{ file: FILE, log: onMain }, { file: OTHER, log: onMain }, { file: PAIRED, log: null }, { file: LONGER }])).toEqual([
      { file: FILE, log: onMain, failureLines: theFailureLinesOf(text(A_RED_RUN), FILE, onMain) },
      { file: OTHER, log: onMain, failureLines: theFailureLinesOf(text(A_RED_RUN), OTHER, onMain) },
      { file: PAIRED },
      { file: LONGER },
    ])
  })
})

describe('the step door takes the lines, and the tool sends a step again without them only to an office older than the field', () => {
  let t: TestDb
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  beforeAll(async () => {
    t = await freshDb()
    machine = await import('../src/server/lib/merge-state-machine.ts')
  }, 60_000)
  afterAll(() => t?.close())

  const ENTRY = 'made-up-entry'
  /** A key no step declares. */
  const UNDECLARED = 'aKeyNoStepDeclares'
  const LINES: TheLines = { log: '/made-up/merge/suite.log', found: 'blocks', blocks: [{ line: 15, lines: [` FAIL  ${FILE} > keeps the made-up total`, 'AssertionError: expected 3 to be 4'], cut: false }], leftOut: 0 }
  const NONE: TheLines = { log: '/made-up/merge/suite.log', found: 'none', lines: 40 }
  const UNREAD: TheLines = { log: '/made-up/merge/gone.log', found: 'unread', why: 'ENOENT: no such file or directory' }
  const item = (file: string, more: Record<string, unknown> = {}) => ({ file, how: 'green-alone', commit: A_SHA, log: '/made-up/merge/rerun-1.log', ...more })
  const TESTED = { green: true, tip: A_SHA, log: '/made-up/merge/suite.log' }
  const testedWith = (items: Record<string, unknown>[]) => ({ ...TESTED, changedTheirAnswer: items })
  const WITH_THE_LINES = testedWith([item(FILE, { failureLines: LINES }), item(OTHER), item(LONGER, { failureLines: NONE })])
  const WITHOUT_THE_LINES = testedWith([item(FILE), item(OTHER), item(LONGER)])
  const RED_ON_MAIN = { mainAt: B_SHA, files: [{ file: FILE, log: '/made-up/merge/main-red.log', failureLines: UNREAD }] }
  const RED_ON_MAIN_WITHOUT = { mainAt: B_SHA, files: [{ file: FILE, log: '/made-up/merge/main-red.log' }] }

  /** What this tree's step door answers for a step's facts: null when it takes them. */
  const theDoorsAnswer = (step: 'tested' | 'red-on-main', facts: Record<string, unknown>): ARefusal | null => {
    expect(machine.parseTheFacts).toBeTypeOf('function')
    try {
      machine.parseTheFacts(step, facts)
      return null
    } catch (error) {
      if (!(error instanceof Error) || typeof (error as { status?: unknown }).status !== 'number') throw error
      return { status: (error as Error & { status: number }).status, words: error.message }
    }
  }
  /** The door's refusal of a key it does not declare on two items, and the same refusal as an office without failureLines gives it. */
  const theRefusals = (): { undeclared: ARefusal; older: ARefusal; olderOnMain: ARefusal } => {
    const undeclared = theDoorsAnswer('tested', testedWith([item(FILE, { [UNDECLARED]: 1 }), item(OTHER), item(LONGER, { [UNDECLARED]: 1 })]))
    expect(undeclared).not.toBeNull()
    expect(undeclared!.words.split(`"${UNDECLARED}"`).length, undeclared!.words).toBe(3)
    const onMain = theDoorsAnswer('red-on-main', { ...RED_ON_MAIN_WITHOUT, files: [{ ...RED_ON_MAIN_WITHOUT.files[0], [UNDECLARED]: 1 }] })
    expect(onMain).not.toBeNull()
    const older = (refusal: ARefusal) => ({ status: refusal.status, words: refusal.words.replaceAll(`"${UNDECLARED}"`, '"failureLines"') })
    return { undeclared: undeclared!, older: older(undeclared!), olderOnMain: older(onMain!) }
  }

  // Mutation: leave failureLines out of either step's item, take a block past the bound, a line past the bound, more
  // blocks than the bound, a block with no line, a line number below 1, an empty block list, a key the shape lacks or a
  // why past the bound, and this case goes red.
  it('takes the three kinds of lines on both steps, and refuses lines over the bound', async () => {
    const { bound } = await theShared()
    expect(theDoorsAnswer('tested', WITH_THE_LINES)).toBeNull()
    expect(theDoorsAnswer('tested', testedWith([item(FILE, { failureLines: UNREAD })]))).toBeNull()
    expect(theDoorsAnswer('red-on-main', RED_ON_MAIN)).toBeNull()
    expect(theDoorsAnswer('red-on-main', { mainAt: B_SHA, files: [{ file: FILE, log: '/made-up/merge/main-red.log', failureLines: LINES }] })).toBeNull()
    const full: TheLines = { log: '/made-up/merge/full.log', found: 'blocks', blocks: Array.from({ length: bound.blocks }, (_, index) => ({ line: index + 1, lines: Array.from({ length: 1 + bound.linesAfter }, () => 'x'.repeat(bound.characters)), cut: true })), leftOut: 7 }
    expect(theDoorsAnswer('tested', testedWith([item(FILE, { failureLines: full })]))).toBeNull()
    const blocks = full.blocks
    const over: Array<[string, unknown]> = [
      ['a block past the bound', { ...full, blocks: [{ ...blocks[0]!, lines: [...blocks[0]!.lines, 'x'] }] }],
      ['a line past the bound', { ...full, blocks: [{ ...blocks[0]!, lines: ['x'.repeat(bound.characters + 1)] }] }],
      ['more blocks than the bound', { ...full, blocks: [...blocks, blocks[0]] }],
      ['a block with no line', { ...full, blocks: [{ ...blocks[0]!, lines: [] }] }],
      ['a line number below 1', { ...full, blocks: [{ ...blocks[0]!, line: 0 }] }],
      ['no block', { ...full, blocks: [] }],
      ['a key the shape lacks', { ...NONE, blocks: [] }],
      ['a why past the bound', { ...UNREAD, why: 'x'.repeat(bound.why + 1) }],
      ['another kind', { ...NONE, found: 'some' }],
      ['left out below 0', { ...full, leftOut: -1 }],
    ]
    for (const [what, failureLines] of over) {
      expect(theDoorsAnswer('tested', testedWith([item(FILE, { failureLines })]))?.status, what).toBe(422)
      expect(theDoorsAnswer('red-on-main', { mainAt: B_SHA, files: [{ file: FILE, failureLines }] })?.status, what).toBe(422)
    }
  })

  // Mutation: let the reading take the words without the status, or a part of them, or the issues of other items, and
  // this case goes red.
  it("knows the door's refusal of a key on the items of a step's list by the door's own words and status, item by item, and nothing looser", async () => {
    const { theStepDoorDoesNotKnowTheNestedKey: knows } = await theTool()
    expect(knows).toBeTypeOf('function')
    const { undeclared, older, olderOnMain } = theRefusals()
    const sent = testedWith([item(FILE, { [UNDECLARED]: 1 }), item(OTHER), item(LONGER, { [UNDECLARED]: 1 })])
    expect(knows!(undeclared, 'tested', sent, UNDECLARED)).toBe(true)
    expect(knows!(older, 'tested', WITH_THE_LINES, 'failureLines')).toBe(true)
    expect(knows!(olderOnMain, 'red-on-main', RED_ON_MAIN, 'failureLines')).toBe(true)
    // Another key, another step, another status, and the words for items other than those that carry the key are not
    // that refusal, and neither are the door's words for a second fault beside the key.
    expect(knows!(undeclared, 'tested', sent, 'failureLines')).toBe(false)
    expect(knows!(undeclared, 'red-on-main', sent, UNDECLARED)).toBe(false)
    expect(knows!(undeclared, 'integrated', sent, UNDECLARED)).toBe(false)
    expect(knows!({ ...undeclared, status: undeclared.status + 1 }, 'tested', sent, UNDECLARED)).toBe(false)
    expect(knows!(undeclared, 'tested', testedWith([item(FILE, { [UNDECLARED]: 1 }), item(OTHER, { [UNDECLARED]: 1 }), item(LONGER, { [UNDECLARED]: 1 })]), UNDECLARED)).toBe(false)
    expect(knows!(undeclared, 'tested', testedWith([item(FILE, { [UNDECLARED]: 1 })]), UNDECLARED)).toBe(false)
    expect(knows!(undeclared, 'tested', WITHOUT_THE_LINES, UNDECLARED)).toBe(false)
    const two = theDoorsAnswer('tested', { ...sent, tip: '' })
    expect(two?.words).toContain(`"${UNDECLARED}"`)
    expect(knows!(two!, 'tested', sent, UNDECLARED)).toBe(false)
  })

  type Sent = { step: string; facts: Record<string, unknown> }
  type AnAnswer = { status: number; body: Record<string, unknown> }
  /**
   * A STAND-IN OFFICE ON A LOOPBACK PORT: it answers each step sent from `answers`, in order, and keeps each; a read of the
   * entry gets a state, as the step function reads one back after a step it took.
   */
  async function aStandInOffice(answers: AnAnswer[]): Promise<{ api: string; sent: Sent[]; close: () => Promise<void> }> {
    const sent: Sent[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        const answer = (status: number, value: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(value))
        }
        if (req.method === 'POST' && req.url === `/api/merge-queue/${ENTRY}/step`) {
          sent.push(JSON.parse(body) as Sent)
          const next = answers[sent.length - 1]
          return next === undefined ? answer(500, { error: 'Made up: the stand-in office was sent more steps than it has answers for.' }) : answer(next.status, next.body)
        }
        if (req.method === 'GET' && req.url === `/api/merge-queue/${ENTRY}`) return answer(200, { entry: { state: 'testing' } })
        return answer(404, { error: `Made up: the stand-in office has no door ${String(req.method)} ${String(req.url)}.` })
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    return { api: `http://127.0.0.1:${String(port)}`, sent, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
  }

  /** Process groups this file started and has not seen end. */
  const groups = new Set<number>()
  afterAll(() => {
    for (const group of groups) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        // It ended between its exit and this hook.
      }
    }
  })

  /**
   * THE MERGE TOOL'S OWN STEP FUNCTION, in a process of its own, as the tool runs it. The first argument stands where the
   * tool's script path stands. The database it names is in the scratch folder and does not exist, so no key is read.
   */
  async function theToolSends(api: string, step: string, facts: Record<string, unknown>): Promise<{ code: number | null; out: string; log: string }> {
    const workdir = aFolder()
    const code = `const { step } = await import(${JSON.stringify(join(REPO, 'tools', 'merge-tool', 'office-keeper.mjs'))}); await step(${JSON.stringify(step)}, ${JSON.stringify(facts)})`
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', code, '--', 'the-step-sender', '--entry', ENTRY, '--session', 'made-up-session', '--api', api, '--workspace', 'default', '--workdir', workdir, '--office-for', '30'],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(workdir, 'no-office.db') }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    groups.add(child.pid!)
    let out = ''
    child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    const ended = await new Promise<number | null>((resolve) => child.on('close', resolve))
    groups.delete(child.pid!)
    const log = join(workdir, 'the-merger.log')
    return { code: ended, out, log: existsSync(log) ? readFileSync(log, 'utf8') : '' }
  }

  // Mutation: drop the lines before the first send, and the stand-in is sent the step without them.
  it('sends each step once, with the lines, to an office that takes them', async () => {
    const { theOfficeDidNotTakeTheFailureLines: said } = await theTool()
    expect(said).toBeTypeOf('function')
    for (const [step, facts] of [['tested', WITH_THE_LINES], ['red-on-main', RED_ON_MAIN]] as const) {
      const office = await aStandInOffice([{ status: 200, body: { decided: 'Made up: the stand-in took the step.' } }])
      try {
        const ran = await theToolSends(office.api, step, facts)
        expect(ran.code, ran.out).toBe(0)
        expect(office.sent).toEqual([{ step, facts }])
        const opening = said!(office.api, step, '\u0000').split('\u0000')[0]!
        expect(opening.length).toBeGreaterThan(20)
        expect(ran.log).not.toContain(opening)
      } finally {
        await office.close()
      }
    }
  })

  // Mutation: take out the second send, send it with the lines, strip another key, or leave the log line out.
  it('sends the step again without the lines to an office that refuses them, says so in its log, and goes on', async () => {
    const { theOfficeDidNotTakeTheFailureLines: said, withoutTheFailureLines } = await theTool()
    expect(said).toBeTypeOf('function')
    expect(withoutTheFailureLines).toBeTypeOf('function')
    const { older, olderOnMain } = theRefusals()
    const cases = [['tested', WITH_THE_LINES, WITHOUT_THE_LINES, older], ['red-on-main', RED_ON_MAIN, RED_ON_MAIN_WITHOUT, olderOnMain]] as const
    for (const [step, facts, without, refusal] of cases) {
      expect(withoutTheFailureLines!(step, facts)).toEqual(without)
      const office = await aStandInOffice([{ status: refusal.status, body: { error: refusal.words } }, { status: 200, body: { decided: 'Made up: the stand-in took the step.' } }])
      try {
        const ran = await theToolSends(office.api, step, facts)
        expect(ran.code, ran.out).toBe(0)
        expect(office.sent).toEqual([{ step, facts }, { step, facts: without }])
        const line = said!(office.api, step, refusal.words)
        expect(line).toContain(office.api)
        expect(line).toContain(refusal.words)
        expect(ran.log).toContain(line)
        expect(ran.log).toContain('the office answered: the entry is now testing')
      } finally {
        await office.close()
      }
    }
  })

  // Mutation: send the step again on any refusal, or on the words alone, or go on when the step sent again is refused.
  it('stops on any other refusal of the step: another key refused, the same words at another status, and a refusal of the step sent again', async () => {
    const { undeclared, older } = theRefusals()
    const refusals: Array<[string, AnAnswer[]]> = [
      ['another key', [{ status: undeclared.status, body: { error: undeclared.words } }]],
      ['another status', [{ status: older.status + 1, body: { error: older.words } }]],
      ['the step sent again refused', [{ status: older.status, body: { error: older.words } }, { status: 409, body: { error: 'Made up: the stand-in refuses the step sent again.' } }]],
    ]
    for (const [what, answers] of refusals) {
      const office = await aStandInOffice(answers)
      try {
        const ran = await theToolSends(office.api, 'tested', WITH_THE_LINES)
        expect(ran.code, `${what}: ${ran.out}`).not.toBe(0)
        expect(office.sent.length, what).toBe(answers.length)
        const last = answers.at(-1)!
        expect(ran.out, what).toContain(`The office refused the step "tested" for merge entry ${ENTRY} (${String(last.status)}): ${String(last.body['error'])}`)
      } finally {
        await office.close()
      }
    }
  })
})
