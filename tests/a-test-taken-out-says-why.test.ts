// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST THAT IS TAKEN OUT SAYS WHY, AND THE RUNNER REALLY LEAVES IT OUT.
 *
 * Tests that cost a lot for what they prove can be taken out of the suite that runs instead of
 * being deleted; a whole class of tests can also be deleted when the owner decides so.
 * tests/taken-out.json is the list of those taken out. vitest.config.ts reads and checks it, leaves
 * out each file named whole, and hands each single case to tests/skip-what-is-taken-out.ts, which
 * skips it with its reason.
 *
 * This file checks two things:
 *   3. The checks refuse a list that is not whole, with a sentence naming the entry. The real list
 *      may be empty, so each check is also tried on a small list made here.
 *   4. The runner skips what a list names. It is run on two fixture files in a temporary folder
 *      made here, never under tests/, with a list of their own. The list's path is handed over in
 *      the one environment variable vitest.config.ts reads for this (`A_TESTS_OWN_LIST`). That is
 *      one line in the config; a copy of the config would be a second config that could drift.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  A_TESTS_OWN_LIST,
  THE_REQUIRED_FIELDS,
  type TakenOut,
  theTakenOutList,
  whatIsWrongWithTheTakenOutList,
} from '../vitest.config.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')

/** Every folder this file made, removed when it is done. */
const MADE: string[] = []
afterAll(() => {
  for (const folder of MADE) rmSync(folder, { recursive: true, force: true })
})

/** A fresh folder with the given files in it, paths relative to the folder. */
function aFolderWith(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), 'taken-out-'))
  MADE.push(folder)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** Run vitest from the checkout with these arguments, and the list at `list` if one is given. */
function vitest(args: string[], list?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env[A_TESTS_OWN_LIST]
  if (list !== undefined) env[A_TESTS_OWN_LIST] = list
  const run = spawnSync(process.execPath, [VITEST, ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 200_000 })
  return { status: run.status, stderr: run.stderr, output: `${run.stdout}\n${run.stderr}`, error: run.error }
}

/**
 * Every case vitest lists in each of these files, by full name, from `vitest list --json`. The
 * files are relative to `dir`, the folder vitest looks for test files in.
 */
function theCasesVitestLists(dir: string, files: string[]): Map<string, Set<string>> {
  const out = join(aFolderWith({}), 'list.json')
  const run = vitest(['list', `--json=${out}`, `--dir=${dir}`, ...files])
  if (run.status !== 0) throw new Error(`vitest list did not finish (exit ${run.status}): ${run.output}`)
  const listed = JSON.parse(readFileSync(out, 'utf8')) as { name: string; file: string }[]
  const cases = new Map<string, Set<string>>()
  for (const file of files) cases.set(file, new Set())
  for (const one of listed) {
    const file = files.find((name) => one.file === join(dir, name))
    if (file !== undefined) cases.get(file)?.add(one.name)
  }
  return cases
}

/** Every case entry whose case vitest does not list in its file, one sentence each. */
function theCasesThatDoNotExist(list: readonly TakenOut[], dir: string): string[] {
  const withACase = list.filter((entry) => entry.case !== undefined)
  if (withACase.length === 0) return []
  const files = [...new Set(withACase.map((entry) => entry.file))]
  const cases = theCasesVitestLists(dir, files)
  return withACase
    .filter((entry) => !cases.get(entry.file)?.has(entry.case as string))
    .map((entry) => `${entry.file} has no case named "${entry.case}".`)
}

/** An entry with every field, for a file the fixture folder holds. */
function anEntry(fields: Partial<TakenOut> = {}): Record<string, string> {
  return {
    file: 'tests/runs.test.ts',
    reason: 'It proves nothing another case does not.',
    cost: 'A fixture cost, not measured.',
    provedInstead: 'nothing: this is a fixture',
    decidedBy: 'a-fixture-id',
    since: '2026-09-25',
    ...fields,
  }
}

/** The two fixture files: one with a case to skip and a case to run, one to leave out whole. */
const THE_FIXTURE_FILES = {
  // `describe` and `it` are the runner's globals, because this folder has no node_modules to import from.
  'tests/runs.test.ts': [
    "describe('a fixture', () => {",
    "  it('is taken out', () => { throw new Error('this case ran, and it is on the list') })",
    "  it('still runs', () => { expect(1).toBe(1) })",
    '})',
    '',
  ].join('\n'),
  'tests/whole.test.ts': "it('is in a file taken out whole', () => { throw new Error('this file ran') })\n",
}

describe('the checks refuse a list that is not whole, naming the entry', () => {
  let folder = ''
  beforeAll(() => {
    folder = aFolderWith(THE_FIXTURE_FILES)
  })

  it('takes a whole list', () => {
    const whole = anEntry({ file: 'tests/whole.test.ts' })
    expect(whatIsWrongWithTheTakenOutList([whole, anEntry({ case: 'a fixture > is taken out' })], folder)).toEqual([])
    expect(whatIsWrongWithTheTakenOutList([], folder)).toEqual([])
  })

  it('refuses an entry with a required field missing or empty', () => {
    for (const field of THE_REQUIRED_FIELDS) {
      const missing: Record<string, string> = anEntry()
      delete missing[field]
      const problems = whatIsWrongWithTheTakenOutList([anEntry(), missing], folder)
      expect(problems.join('\n'), field).toMatch(new RegExp(`^Entry 2\\b.* has no ${field}\\.`, 'm'))
      expect(whatIsWrongWithTheTakenOutList([anEntry({ [field]: ' ' })], folder).join('\n'), field).toContain(
        `has no ${field}.`,
      )
    }
  })

  it('refuses an empty case, an unknown field, and a date not written YYYY-MM-DD', () => {
    expect(whatIsWrongWithTheTakenOutList([anEntry({ case: '' })], folder)).toEqual([
      'Entry 1 (tests/runs.test.ts) has a case that is empty. Leave case out to take out the whole file.',
    ])
    expect(whatIsWrongWithTheTakenOutList([{ ...anEntry(), cases: 'a fixture > is taken out' }], folder)).toEqual([
      'Entry 1 (tests/runs.test.ts) has a field the list does not know: cases.',
    ])
    expect(whatIsWrongWithTheTakenOutList([anEntry({ since: '25 September' })], folder)).toEqual([
      'Entry 1 (tests/runs.test.ts) has since "25 September", which is not a date written YYYY-MM-DD.',
    ])
  })

  it('refuses an entry naming a file that does not exist', () => {
    const problems = whatIsWrongWithTheTakenOutList([anEntry({ file: 'tests/gone.test.ts' })], folder)
    expect(problems).toEqual([
      `Entry 1 (tests/gone.test.ts) names a file that does not exist: ${join(folder, 'tests/gone.test.ts')}.`,
    ])
  })

  it('refuses a case entry for a file that is also taken out whole', () => {
    const problems = whatIsWrongWithTheTakenOutList([anEntry(), anEntry({ case: 'a fixture > is taken out' })], folder)
    expect(problems).toEqual([
      'Entry 2 (tests/runs.test.ts) takes out one case of a file that another entry takes out whole.',
    ])
  })

  it('finds a case the file does not have, by what vitest lists', () => {
    const list = [
      anEntry({ case: 'a fixture > is taken out' }) as unknown as TakenOut,
      anEntry({ case: 'a fixture > was never written' }) as unknown as TakenOut,
    ]
    expect(theCasesThatDoNotExist(list, folder)).toEqual([
      'tests/runs.test.ts has no case named "a fixture > was never written".',
    ])
  })

  it('stops reading at a list that is not JSON, naming the list', () => {
    const bad = join(aFolderWith({ 'tests/taken-out.json': '[{' }), 'tests', 'taken-out.json')
    expect(() => theTakenOutList(bad)).toThrow(`The list of tests taken out, ${bad}, could not be read as JSON`)
  })
})

describe('the runner leaves out what the list names', () => {
  let folder = ''
  let run: ReturnType<typeof vitest> = { status: null, stderr: '', output: '', error: undefined }
  let report: {
    testResults: {
      name: string
      assertionResults: { fullName: string; title: string; status: string; meta: Record<string, unknown> }[]
    }[]
  } = { testResults: [] }

  beforeAll(() => {
    folder = aFolderWith(THE_FIXTURE_FILES)
    const list = join(folder, 'tests', 'taken-out.json')
    writeFileSync(
      list,
      JSON.stringify([
        anEntry({ file: 'tests/whole.test.ts', reason: 'The whole file is a fixture to leave out.' }),
        anEntry({ case: 'a fixture > is taken out', reason: 'This case is a fixture to skip.' }),
      ]),
    )
    const out = join(folder, 'report.json')
    // The run names the fixture's two files by their full paths. A run with no file named is refused
    // (tests/the-whole-suite-is-asked-for-by-name.ts), and full paths can match nothing in the real
    // tests/, even if --dir were ignored. The file taken out whole is named too, to show that naming
    // it does not bring it back.
    run = vitest(
      [
        'run',
        `--dir=${folder}`,
        '--reporter=verbose',
        '--reporter=json',
        `--outputFile.json=${out}`,
        '--no-file-parallelism',
        ...Object.keys(THE_FIXTURE_FILES).filter((name) => name.endsWith('.test.ts')).map((name) => join(folder, name)),
      ],
      list,
    )
    if (run.error !== undefined) throw run.error
    report = JSON.parse(readFileSync(out, 'utf8'))
  }, 240_000)

  /** The fixture's case with this title, as the JSON report has it. */
  function theCase(title: string) {
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    const found = cases.find((one) => one.title === title)
    if (found === undefined) throw new Error(`The report has no case "${title}". It has: ${JSON.stringify(cases)}`)
    return found
  }

  it('passes the run, since only the case and the file on the list would fail', () => {
    expect(run.status, run.output).toBe(0)
  })

  it('reports the case on the list as skipped, with its reason', () => {
    const skipped = theCase('is taken out')
    expect(skipped.status).toBe('skipped')
    expect(skipped.meta.takenOut).toBe('This case is a fixture to skip.')
    expect(run.output).toContain('[taken out: This case is a fixture to skip.]')
  })

  it('runs and passes the case that is not on the list', () => {
    expect(theCase('still runs').status).toBe('passed')
  })

  it('does not run a file taken out whole', () => {
    expect(report.testResults.map((file) => file.name)).toEqual([join(folder, 'tests', 'runs.test.ts')])
  })

  it('says at the start of the run what it did not run, and where the list is', () => {
    const line = `Taken out of this run and not run: 1 test file and 1 single case. ${join(folder, 'tests', 'taken-out.json')} says why for each: tests/whole.test.ts; tests/runs.test.ts > a fixture > is taken out.`
    // The line is written on the error stream when the runner loads its config, before any file is collected.
    expect(run.stderr.trimStart().split('\n')[0]).toBe(line)
  })

  it('stops the run, naming the entry, when the list is not whole', () => {
    const bad = join(folder, 'tests', 'taken-out.json')
    writeFileSync(bad, JSON.stringify([anEntry({ file: 'tests/gone.test.ts' })]))
    const stopped = vitest(['run', `--dir=${folder}`, '--no-file-parallelism'], bad)
    expect(stopped.status, stopped.output).not.toBe(0)
    expect(stopped.output).toContain(`is not whole, so no test runs:`)
    expect(stopped.output).toContain(`Entry 1 (tests/gone.test.ts) names a file that does not exist`)
    expect(stopped.output).not.toContain('still runs')
  })
})
