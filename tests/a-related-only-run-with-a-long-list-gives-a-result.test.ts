// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELATED-ONLY RUN WITH A LONG LIST STILL GIVES A RESULT. npm runs a package's test script with sh -c and one
 * argument: the script and every word given after it, joined. Linux refuses to start a program with an argument longer
 * than 131,071 bytes, and npm then exits 249 and writes no report. An entry that changed a file many tests import once
 * had 1,127 related files, each named by its full path in the clone, about 130 characters long, and its suite gave no
 * result three times.
 *
 * Each case changes a file that 1,200 test files import, in a checkout of 2,411 test files, so the related list is
 * 1,200 files and under half of them all. The checkout's test script is a stand-in for vitest and runs no test: it
 * writes a vitest report in which each file it is given passed, or every test file when it is given none. npm still
 * joins its words into one argument, and that argument is what these cases are about.
 *
 *   1. Names of 95 characters inside the clone. 1,200 of them fit in one argument; the same names with the clone's
 *      folder in front do not. The related tests run, and the result counts 1,200 files.
 *   2. Names of 115 characters. 1,200 of them do not fit even inside the clone. The whole suite runs instead, for all
 *      2,411 files, and the entry's facts and the tool's log say why.
 *
 * CONTROL: red before the change, in both cases: npm exits 249 and the tool stops with no result. MUTATION: passing the
 * full paths again turns case 1 red; taking out the fallback to the whole suite turns case 2 red.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aRealOfficeForTheMerger, PASSING_TEST, factsOf, git, mainCheckout, readingOf, runTheTool, stateOf, submitGit } from './the-merger-fixture.ts'
import { WITH_LISTS, change, filesNamed, judged, position, suitesOf } from './related-only-merger-fixture.ts'

aRealOfficeForTheMerger('tests/a-related-only-run-with-a-long-list-gives-a-result.test.ts')

const RELATED = 1200
const UNRELATED = 1210
// The fixture's own first test file is the one more.
const EVERY = RELATED + UNRELATED + 1
// Linux's longest single argument, 32 pages of 4,096 bytes, less the zero byte that ends it.
const ONE_ARGUMENT_AT_MOST = 32 * 4096 - 1

const STAND_IN_RUNNER = [
  "import { existsSync, readdirSync, writeFileSync } from 'node:fs'",
  "import { resolve } from 'node:path'",
  'const words = process.argv.slice(2)',
  'let report = null',
  'const named = []',
  'const leftOut = new Set()',
  'for (let i = 0; i < words.length; i += 1) {',
  "  if (words[i].startsWith('--outputFile.json=')) report = words[i].slice('--outputFile.json='.length)",
  "  else if (words[i] === '--exclude') leftOut.add(resolve(words[++i]))",
  "  else if (!words[i].startsWith('--')) named.push(resolve(words[i]))",
  '}',
  'const missing = named.filter((file) => !existsSync(file))',
  "if (report === null || missing.length > 0) { console.error(`stand-in test runner: no report was asked for, or these files are missing: ${missing.join(' ')}`); process.exit(1) }",
  "const every = readdirSync('tests').filter((file) => file.endsWith('.test.ts')).map((file) => resolve('tests', file))",
  'const files = (named.length > 0 ? named : every).filter((file) => !leftOut.has(file))',
  "writeFileSync(report, JSON.stringify({ numTotalTests: files.length, numPassedTests: files.length, numFailedTests: 0, testResults: files.map((name) => ({ name, status: 'passed', startTime: 0, endTime: 1, assertionResults: [{ title: 'stands in', status: 'passed' }] })) }))",
  'console.log(`stand-in test runner: ${String(files.length)} files, each called passed without running`)',
  '',
].join('\n')

/** A test file name of exactly `length` characters, from tests/ to .test.ts. */
function aLongName(index: number, length: number): string {
  const end = `-${String(index).padStart(4, '0')}.test.ts`
  return `tests/${'a-test-file-that-imports-the-changed-module-'.repeat(4).slice(0, length - 'tests/'.length - end.length)}${end}`
}

/** Main, with 1,200 test files of names `length` long that import src/thing.ts, 1,210 that do not, and the stand-in. */
function aCheckoutWithALongList(name: string, length: number): string {
  const related = Array.from({ length: RELATED }, (_, i) => aLongName(i + 1, length))
  const main = mainCheckout(name, {
    'src/thing.ts': WITH_LISTS['src/thing.ts']!,
    'tests/the-test-lists.ts': `if (process.argv[2] === 'whole-tree') console.log(${JSON.stringify(related[0])})\n`,
    'tools/stand-in-test-runner.mjs': STAND_IN_RUNNER,
    ...Object.fromEntries(related.map((file) => [file, WITH_LISTS['tests/thing.test.ts']!])),
    ...Object.fromEntries(Array.from({ length: UNRELATED }, (_, i) => [`tests/plain-${String(i + 1).padStart(4, '0')}.test.ts`, PASSING_TEST])),
  })
  const manifest = JSON.parse(readFileSync(join(main, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  manifest.scripts['test'] = 'node tools/stand-in-test-runner.mjs'
  writeFileSync(join(main, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  git(main, 'commit', '-q', '-a', '-m', 'Synthetic stand-in test runner')
  return main
}

it('runs the 1,200 related files when their names inside the clone fit in one argument and their full paths do not', async () => position('1', async () => {
  const main = aCheckoutWithALongList('long-list-fits', 95)
  const { entry } = await submitGit(main, 'long-list-fits', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  const suites = suitesOf(entry)
  expect(suites).toHaveLength(1)
  const named = filesNamed(suites[0]!)
  expect(named).toHaveLength(RELATED)
  // The same names with the clone's folder in front would not fit, so this case is the one the change is for.
  const clone = String(suites[0]!['cwd'])
  expect(named.reduce((bytes, file) => bytes + 1 + clone.length + 1 + file.length, 0)).toBeGreaterThan(ONE_ARGUMENT_AT_MOST)
  const facts = factsOf(done, 'tested')!
  expect(facts['relatedOnly']).toMatchObject({ files: RELATED, related: RELATED, every: EVERY })
  expect(facts['wholeSuiteBecause']).toBeUndefined()
}), 300_000)

it('runs the whole suite, and says why, when the related names do not fit in one argument even inside the clone', async () => position('1', async () => {
  const main = aCheckoutWithALongList('long-list-too-long', 115)
  const { entry } = await submitGit(main, 'long-list-too-long', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
  const facts = factsOf(done, 'tested')!
  expect(facts['relatedOnly']).toBeUndefined()
  expect(facts['ran']).toBe(EVERY)
  const because = facts['wholeSuiteBecause'] as { case: number; says: string }[]
  expect(because).toEqual([{ case: 7, says: expect.stringContaining('Case 7') }])
  expect(because[0]!.says).toContain(String(RELATED))
  expect(because[0]!.says).toContain(String(ONE_ARGUMENT_AT_MOST))
  expect(readingOf(entry).machine?.tested?.wholeSuiteBecause).toEqual(because)
  expect(facts['says']).toContain(because[0]!.says)
  expect(readFileSync(done.log, 'utf8')).toContain(because[0]!.says)
}), 300_000)
