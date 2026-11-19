// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECOND OPINION ON MODAL BEFORE AN ENTRY BOUNCES, in wave 13v round 21.
 *
 * A test file red alone with an entry here, and green on main here, is run once more on Modal before the entry bounces
 * for it: with the entry's tree, and with main's tree unless the entry brought or changed the file. Green on both is a
 * load timeout and the file is not held against the entry. Red on Modal, no result (exit 75), a refusal (exit 2), or a
 * run that would pass the owner's monthly cap of 42.5 dollars leaves the file red, and the entry says why.
 *
 * EVERY CASE HERE IS MADE UP: a small git tree of its own, and tests/stand-in-modal-runner.mjs in place of the Modal
 * runner. Nothing here calls Modal, and the real runner is never named as the runner except in the case that proves a
 * test-started process refuses to call it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { MODAL_MONTHLY_CAP_USD } from '../src/config/settings.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { localStamp } from '../src/shared/time.ts'
import { A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION, aSecondOpinion } from '../tools/merge-tool/second-opinion.mjs'
import { VM_CHECKOUT, VM_DEFAULTS, VM_SANDBOX_GRACE_SECONDS, estimateUSD, readMonthReceipts, receiptsFile, modalRunnerFiles, validateToken, executable } from '../tools/modal-tests.mjs'

const REPO = join(import.meta.dirname, '..')
const STAND_IN = join(REPO, 'tests', 'stand-in-modal-runner.mjs')
/** A path that is not the stand-in, standing for the real runner in every case but the test-mark one. */
const NOT_THE_STAND_IN = join(REPO, 'tools', 'modal-tests.mjs')
/** Synthetic local files pass the same checks as the real runner; the stand-in reads neither. */
const SETTINGS: Record<string, string> = {
  MOLE_OFFICE_MODAL_MONTHLY_CAP_USD: String(MODAL_MONTHLY_CAP_USD),
}

let root = ''
let home = ''
let oldHome: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'second-opinion-'))
  home = join(root, 'home')
  mkdirSync(home)
  // THE RECEIPTS ARE READ UNDER HOME, so each case has a home of its own and never reads the machine's real receipts.
  oldHome = process.env['HOME']
  process.env['HOME'] = home
  SETTINGS['MOLE_OFFICE_MODAL_TOKEN_FILE'] = join(root, 'synthetic-modal.toml')
  SETTINGS['MOLE_OFFICE_MODAL_PYTHON'] = join(root, 'synthetic-python')
  writeFileSync(SETTINGS['MOLE_OFFICE_MODAL_TOKEN_FILE'], 'Synthetic token; never a credential.', { mode: 0o600 })
  writeFileSync(SETTINGS['MOLE_OFFICE_MODAL_PYTHON'], '#!/bin/sh\nexit 0\n', { mode: 0o700 })
})

afterEach(() => {
  if (oldHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = oldHome
  rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } }).trim()
}

/**
 * A MADE-UP ENTRY'S TREE: main holds two test files, a slow one and one the entry changes; the entry also brings a test
 * file of its own, and changes a source file.
 */
function aTree(): { tree: string; M: string; head: string } {
  const tree = join(root, 'tree')
  mkdirSync(join(tree, 'tests'), { recursive: true })
  git(root, ['init', '-q', '-b', 'main', tree])
  writeFileSync(join(tree, 'tests', 'slow.test.ts'), "it('is slow here', () => {})\n")
  writeFileSync(join(tree, 'tests', 'changed.test.ts'), "it('was', () => {})\n")
  git(tree, ['add', '-A'])
  git(tree, ['commit', '-q', '-m', 'main'])
  const M = git(tree, ['rev-parse', 'HEAD'])
  writeFileSync(join(tree, 'tests', 'changed.test.ts'), "it('is', () => {})\n")
  writeFileSync(join(tree, 'tests', 'brought.test.ts'), "it('is new', () => {})\n")
  writeFileSync(join(tree, 'thing.txt'), 'changed\n')
  git(tree, ['add', '-A'])
  git(tree, ['commit', '-q', '-m', 'the entry'])
  return { tree, M, head: git(tree, ['rev-parse', 'HEAD']) }
}

/** A file comparedWithMain left red, with the pair of runs here: main green unless `mainFailing` names tests. */
function red(file: string, mainFailing: string[] = []) {
  return { file, pair: { main: { at: 'x', load1: 1, log: join(root, `main-${file.replace(/\W/gu, '-')}.log`), failing: mainFailing }, entry: { at: 'x', load1: 1, log: join(root, `entry-${file.replace(/\W/gu, '-')}.log`), failing: ['is slow here'] } } }
}

/** A file the entry brought, which main has no copy of, as comparedWithMain leaves it. */
function brought(file: string) {
  return { file, pair: null }
}

/** The merge tool's run, done here with spawnSync: the command's output in its own log, and its exit. */
function run(label: string, command: string, args: string[], { cwd }: { cwd: string; timeoutMs: number }) {
  const outFile = join(root, `${label}.log`)
  const done = spawnSync(command, args, { cwd, encoding: 'utf8', env: theStandInsEnvironment })
  writeFileSync(outFile, `${done.stdout}${done.stderr}`)
  return Promise.resolve({ code: done.status, signal: done.signal, timedOut: false, outFile })
}

let theStandInsEnvironment: Record<string, string | undefined> = {}

/** What the stand-in will answer, and where it writes down each call. */
function theStandInSays(says: object, usd: number | null = null): string {
  const calls = join(root, 'calls.jsonl')
  theStandInsEnvironment = { PATH: process.env['PATH'], HOME: home, STAND_IN_MODAL_SAYS: JSON.stringify(says), STAND_IN_MODAL_CALLS: calls, ...(usd === null ? {} : { STAND_IN_MODAL_USD: String(usd) }) }
  return calls
}

function callsIn(file: string): { commit: string; files: string[] }[] {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { commit: string; files: string[] }) : []
}

function ask(tree: string, M: string, stillRed: object[], over: { settings?: Record<string, string>; runner?: string; theRealRunner?: string; env?: Record<string, string> } = {}) {
  const settings = over.settings ?? SETTINGS
  const setting = (name: string) => settings[name] ?? null
  return aSecondOpinion({
    tree,
    M,
    stillRed,
    runner: over.runner ?? STAND_IN,
    theRealRunner: over.theRealRunner ?? NOT_THE_STAND_IN,
    outFolder: root,
    run,
    git,
    log: () => {},
    env: over.env ?? {},
    modal: {
      VM_CHECKOUT,
      VM_DEFAULTS,
      VM_SANDBOX_GRACE_SECONDS,
      estimateUSD,
      readMonthReceipts,
      receiptsFile,
      validateToken,
      executable,
      runnerFiles: () => modalRunnerFiles(setting),
      capAsWritten: () => setting('MOLE_OFFICE_MODAL_MONTHLY_CAP_USD'),
      capSetting: 'MOLE_OFFICE_MODAL_MONTHLY_CAP_USD',
    },
  })
}

it('clears a file green on Modal with the entry and with main, as a load timeout carrying every run', async () => {
  const { tree, M, head } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(answer.kept).toEqual([])
  expect(answer.cleared).toEqual([
    {
      file: 'tests/slow.test.ts',
      mainAt: M,
      here: { entryLog: expect.stringContaining('entry-'), mainLog: expect.stringContaining('main-') },
      modal: { entry: { commit: head, log: expect.stringContaining('modal-entry-'), report: expect.stringContaining('modal-entry-') }, main: { commit: M, log: expect.stringContaining('modal-main-'), report: expect.stringContaining('modal-main-') } },
    },
  ])
  expect(answer.says).toContain('1 file(s) red alone here were green on a Modal VM, and are kept as load timeouts')
  // ONE CALL ON THE ENTRY'S TREE, THEN ONE ON MAIN'S, each with the tree as the checkout.
  expect(callsIn(calls)).toEqual([
    { commit: head, repo: tree, files: ['tests/slow.test.ts'] },
    { commit: M, repo: tree, files: ['tests/slow.test.ts'] },
  ])
})

it('keeps a file red on Modal with the entry, and asks nothing of main', async () => {
  const { tree, M, head } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'failed' } } })
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(answer.cleared).toEqual([])
  expect(answer.kept.map((one: { file: string }) => one.file)).toEqual(['tests/slow.test.ts'])
  expect(answer.says).toContain('tests/slow.test.ts (red on Modal with this entry too (log ')
  expect(callsIn(calls).map((one) => one.commit)).toEqual([head])
})

it('keeps a file when the runner gives no result (exit 75), and says so', async () => {
  const { tree, M } = aTree()
  theStandInSays({ exit: 75 })
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(answer.cleared).toEqual([])
  expect(answer.kept).toHaveLength(1)
  expect(answer.says).toContain('no second opinion: the Modal runner gave no result (exit 75)')
})

it('keeps a file when the runner refuses (exit 2), quoting its reason', async () => {
  const { tree, M } = aTree()
  theStandInSays({ exit: 2 })
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(answer.cleared).toEqual([])
  expect(answer.says).toContain('no second opinion: the Modal runner refused: The Modal token file is missing.')
})

it('starts no run that could pass the cap, and says what the month already holds', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const most = estimateUSD(VM_DEFAULTS.limitSeconds + VM_SANDBOX_GRACE_SECONDS, VM_DEFAULTS.cpu, VM_DEFAULTS.memoryMiB)
  // THIS MONTH'S RECEIPTS LEAVE A CENT LESS THAN ONE RUN COULD COST; LAST MONTH'S ARE NOT COUNTED.
  mkdirSync(join(home, '.cache', 'mole-office', 'modal'), { recursive: true })
  const now = localStamp(new Date())
  const lastYear = `${String(Number(now.slice(0, 4)) - 1)}${now.slice(4)}`
  writeFileSync(receiptsFile(), [{ at: now, estimatedUSD: MODAL_MONTHLY_CAP_USD - most + 0.01 }, { at: lastYear, estimatedUSD: 1000 }].map((one) => JSON.stringify(one)).join('\n') + '\n')
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(callsIn(calls), 'the runner was called over the budget').toEqual([])
  expect(answer.cleared).toEqual([])
  expect(answer.says).toContain(`which would pass the cap of ${String(MODAL_MONTHLY_CAP_USD)} dollars`)
  // AND A CENT UNDER IT, THE SAME FILE IS ASKED ABOUT.
  writeFileSync(receiptsFile(), `${JSON.stringify({ at: now, estimatedUSD: MODAL_MONTHLY_CAP_USD - most - 0.01 })}\n`)
  const under = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(under.cleared).toHaveLength(1)
})

it('counts each run it makes against the cap, so the month stops when the receipts reach it', async () => {
  const { tree, M } = aTree()
  const most = estimateUSD(VM_DEFAULTS.limitSeconds + VM_SANDBOX_GRACE_SECONDS, VM_DEFAULTS.cpu, VM_DEFAULTS.memoryMiB)
  // EACH STAND-IN RUN WRITES A RECEIPT THAT LEAVES LESS THAN ONE MORE RUN: the run on the entry's tree is paid, and main's would pass the cap.
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } }, MODAL_MONTHLY_CAP_USD - most + 0.01)
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(callsIn(calls)).toHaveLength(1)
  expect(answer.cleared).toEqual([])
  expect(answer.says).toContain("green on Modal with this entry, and main's run on Modal gave no answer: this month's receipts hold")
})

it('is off when a runner file is missing, naming its path and whether it is the setting or the default', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const { MOLE_OFFICE_MODAL_TOKEN_FILE: token, MOLE_OFFICE_MODAL_PYTHON: pythonPath, ...neitherSetting } = SETTINGS
  const defaultToken = join(home, '.cache/mole-office/modal/token.toml')
  const answer = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...neitherSetting, MOLE_OFFICE_MODAL_PYTHON: pythonPath! } })
  expect(callsIn(calls)).toEqual([])
  expect(answer.cleared).toEqual([])
  expect(answer.says).toBe(` No second opinion on Modal was taken: there is no Modal token file at ${defaultToken} (the default; MOLE_OFFICE_MODAL_TOKEN_FILE is not set), so the Modal runner cannot start.`)
  const neither = await ask(tree, M, [red('tests/slow.test.ts')], { settings: neitherSetting })
  expect(neither.says).toBe(answer.says)
  const python = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...neitherSetting, MOLE_OFFICE_MODAL_TOKEN_FILE: token! } })
  expect(python.says).toBe(` No second opinion on Modal was taken: there is no executable Python at ${join(home, '.cache/mole-office/modal/venv/bin/python')} (the default; MOLE_OFFICE_MODAL_PYTHON is not set), so the Modal runner cannot start.`)
  const missingToken = join(root, 'missing-token.toml')
  const set = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...SETTINGS, MOLE_OFFICE_MODAL_TOKEN_FILE: missingToken } })
  expect(set.says).toBe(` No second opinion on Modal was taken: there is no Modal token file at ${missingToken} (the setting MOLE_OFFICE_MODAL_TOKEN_FILE), so the Modal runner cannot start.`)
  expect(callsIn(calls)).toEqual([])
})

it('uses the chosen cap above the shipped 42.5', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const above = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...SETTINGS, MOLE_OFFICE_MODAL_MONTHLY_CAP_USD: '42.51' } })
  expect(above.kept).toEqual([])
  expect(above.cleared).toHaveLength(1)
  expect(callsIn(calls)).toHaveLength(2)
})

it('refuses a cap that is not a dollar amount and uses a lower chosen cap', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const word = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...SETTINGS, MOLE_OFFICE_MODAL_MONTHLY_CAP_USD: 'lots' } })
  expect(word.says).toContain('is "lots", which is not a number of dollars')
  expect(callsIn(calls)).toEqual([])
  // A fresh tree keeps this a budget check, rather than reuse of a result already paid for.
  const lower = await ask(tree, M, [red('tests/slow.test.ts')], { settings: { ...SETTINGS, MOLE_OFFICE_MODAL_MONTHLY_CAP_USD: '0.5' } })
  expect(lower.says).toContain('which would pass the cap of 0.5 dollars')
})

it('asks Modal nothing about a file that was not green on main here', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const answer = await ask(tree, M, [red('tests/slow.test.ts', ['fails on main too'])])
  expect(callsIn(calls)).toEqual([])
  expect(answer.cleared).toEqual([])
  expect(answer.says).toContain('it was not green on main here either (1 test(s) failed there), so Modal was not asked')
})

it("runs a file the entry brought or changed only on the entry's tree", async () => {
  const { tree, M, head } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  const answer = await ask(tree, M, [brought('tests/brought.test.ts'), red('tests/changed.test.ts')])
  expect(callsIn(calls)).toEqual([{ commit: head, repo: tree, files: ['tests/brought.test.ts', 'tests/changed.test.ts'] }])
  expect(answer.cleared.map((one: { file: string; here: object; modal: { main?: object } }) => [one.file, one.here, one.modal.main])).toEqual([
    ['tests/brought.test.ts', {}, undefined],
    ['tests/changed.test.ts', { entryLog: expect.any(String), mainLog: expect.any(String) }, undefined],
  ])
  expect(answer.says).toContain('this entry brought or changed it, so main was not run on Modal')
})

it('keeps a file green on Modal with the entry and red on Modal on main', async () => {
  const { tree, M } = aTree()
  theStandInSays({ results: { [M]: { 'tests/slow.test.ts': 'failed' }, '*': { '*': 'passed' } } })
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(answer.cleared).toEqual([])
  expect(answer.says).toContain(`green on Modal with this entry, but red on Modal on main ${M.slice(0, 12)}`)
})

it('reads a red run file by file: one file cleared, one kept, from one call', async () => {
  const { tree, M, head } = aTree()
  const calls = theStandInSays({ results: { [head]: { 'tests/changed.test.ts': 'failed' }, '*': { '*': 'passed' } } })
  const answer = await ask(tree, M, [red('tests/slow.test.ts'), red('tests/changed.test.ts')])
  expect(answer.cleared.map((one: { file: string }) => one.file)).toEqual(['tests/slow.test.ts'])
  expect(answer.kept.map((one: { file: string }) => one.file)).toEqual(['tests/changed.test.ts'])
  expect(callsIn(calls).map((one) => one.files)).toEqual([['tests/slow.test.ts', 'tests/changed.test.ts'], ['tests/slow.test.ts']])
})

it('pays once for a file on a tree and commit, when the related tests and then the whole suite ask', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  await ask(tree, M, [red('tests/slow.test.ts')])
  const again = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(again.cleared).toHaveLength(1)
  expect(callsIn(calls)).toHaveLength(2)
})

it('is off when the receipts cannot be read, so the budget is not known', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  mkdirSync(join(home, '.cache', 'mole-office', 'modal'), { recursive: true })
  // A RECEIPT WITH NO ESTIMATE, as the real runner writes when the driver reported no seconds.
  writeFileSync(receiptsFile(), `${JSON.stringify({ at: localStamp(new Date()), estimatedUSD: null })}\n`)
  const answer = await ask(tree, M, [red('tests/slow.test.ts')])
  expect(callsIn(calls)).toEqual([])
  expect(answer.says).toContain("the runner's receipts for this month could not be read (A receipt has no valid estimate.)")
})

it('never calls the real runner from a process the test suite started', async () => {
  const { tree, M } = aTree()
  const calls = theStandInSays({ results: { '*': { '*': 'passed' } } })
  // THE STAND-IN IS NAMED AS THE REAL RUNNER HERE, so a call would be written down rather than reach Modal.
  const answer = await ask(tree, M, [red('tests/slow.test.ts')], { theRealRunner: STAND_IN, env: { [THE_TEST_MARK]: '1' } })
  expect(callsIn(calls)).toEqual([])
  expect(answer.says).toContain(A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION)
})
