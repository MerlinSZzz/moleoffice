// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOCUMENTS USE WHAT THEIR CALLER GIVES.
 *
 * tools/merge-tool/documents.mjs used to import ask, sleep, step and theLane from office-keeper.mjs, the module that
 * talks to the office, and MERGE_WORKERS_BOUNDS, settingNamed and settingValue from src/config/settings.mjs. It now
 * takes those office functions from its caller, as land.mjs and testing.mjs pass office-keeper.mjs's, and the three
 * suite-workers reads from its caller, as testing.mjs passes arguments.mjs's THE_SUITE_WORKERS_READS, so documents.mjs
 * reaches no office module and reads no setting itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. aMoveOfOnlyDocuments, untilNoOtherLandingOf and carryPastDocuments each refuse, as its first statement, with
 *    exactly THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS when given nothing, all they need but one left out in turn, or a
 *    part that is not a function. None of the given functions is called and no office-keeper function is reached.
 * 2. theSuiteWorkers refuses, as its first statement, with exactly THE_SUITE_WORKERS_NEED_THE_SETTING_READS when given
 *    nothing, the three reads with one left out in turn, or bounds that are not an object with number fewest and most,
 *    even when the entry names its own count. Neither read is called.
 * 3. aMoveOfOnlyDocuments asks the given theLane for the documents lane in the merged state, and answers the chain of
 *    documentation landings from `from` to `to`, or null when the chain breaks.
 * 4. untilNoOtherLandingOf waits with the given sleep while another entry lands, asks the given ask for the emergency
 *    pushes, and returns.
 * 5. carryPastDocuments passes the given theLane to aMoveOfOnlyDocuments and, over real temporary git repositories,
 *    calls the given step once with 'moved-past-documents'.
 * 6. theSuiteWorkers reads at the moment of use, answers each call's count, falls back with the sentence it says when
 *    the value is outside the given bounds, and calls neither read for an entry that names its own count.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 3 (documents-c3-red.log): the new file red in all eight cases on the old code, each for its
 *   own reason; 8 failed and 0 passed.
 * - after commit 6 (documents-green.log): this file green, 1 file and 8 tests passed.
 * - mutation (m3-no-until-check-red-final.log): taking untilNoOtherLandingOf's first-statement check out made case 1
 *   red; 1 failed and 7 passed. The restore was green (m3-no-until-check-green-final.log, 8 passed).
 * - mutation (m5-not-given-sleep-red-final.log): untilNoOtherLandingOf waiting with a real 5000 ms timeout made case 4
 *   red; 1 failed and 7 passed. The restore was green (m5-not-given-sleep-green-final.log, 8 passed).
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { DOCUMENTS_LANE } from '../../src/shared/merge-queue.ts'

const boundary = vi.hoisted(() => ({
  folder: '',
  workdir: '',
  state: {} as Record<string, any>,
  logs: [] as string[],
  writes: 0,
  officeKeeper: [] as string[],
}))

const SYNTHETIC_GIT = vi.hoisted(() => (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'Synthetic documents',
  GIT_AUTHOR_EMAIL: 'fixture@test.example',
  GIT_COMMITTER_NAME: 'Synthetic documents',
  GIT_COMMITTER_EMAIL: 'fixture@test.example',
}))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  chosen: {
    entry: 'synthetic-entry',
    get workdir() { return boundary.workdir },
  },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (why: string) => { throw new Error(why) },
  log: (line: string) => { boundary.logs.push(line) },
  stamp: () => '2026-11-11 00:00:00',
  writeState: (patch: Record<string, any>) => { boundary.writes += 1; boundary.state = { ...boundary.state, ...patch }; return boundary.state },
}))

vi.mock('../../tools/merge-tool/git.mjs', () => {
  const env = () => SYNTHETIC_GIT()
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  return {
    git,
    gitBytes: (cwd: string, args: string[]) => Buffer.from(git(cwd, args)),
    tryGit: (cwd: string, args: string[]) => {
      const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: env() })
      return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
    },
    changedBetween: (cwd: string, from: string, to: string) => git(cwd, ['diff', '--no-renames', '--name-only', from, to]).split('\n').filter((path) => path !== ''),
    contentAt: (_cwd: string, _commit: string, paths: string[]) => Object.fromEntries(paths.map((path) => [path, 'synthetic-content'])),
    cleanEnvironment: (extra: Record<string, string> = {}) => ({
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && !name.startsWith('MOLE_OFFICE_'))),
      ...extra,
    }),
  }
})

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => {
  const reached = (name: string) => async () => {
    boundary.officeKeeper.push(name)
    throw new Error(`the documents reached office-keeper.mjs itself: ${name}`)
  }
  return {
    ask: reached('ask'),
    sleep: reached('sleep'),
    step: reached('step'),
    theLane: reached('theLane'),
  }
})

import * as theDocuments from '../../tools/merge-tool/documents.mjs'

type TheOfficeGiven = { theLane?: unknown; sleep?: unknown; ask?: unknown; step?: unknown }
type TheDocuments = {
  aMoveOfOnlyDocuments: (root: string, from: string, to: string, given?: TheOfficeGiven) => Promise<unknown>
  untilNoOtherLandingOf: (root: string, given?: TheOfficeGiven) => Promise<void>
  carryPastDocuments: (integrated: unknown, head: string, root: string, given?: TheOfficeGiven) => Promise<any>
  theSuiteWorkers: (entry: unknown, given?: { given?: unknown; fallback?: unknown; bounds?: unknown }) => { count: number; said: string | null }
}
/** Cast through unknown, so this file compiles before and after the functions take their second argument. */
const documents = theDocuments as unknown as TheDocuments

function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

/** The message a refused call throws. */
async function theRefusal(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the documents accepted what they cannot use')
}

/** The message a refused synchronous call throws. */
function theThrown(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the documents accepted what they cannot use')
}

const madeFolders: string[] = []

function aMadeFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), name))
  madeFolders.push(folder)
  return folder
}

afterAll(() => {
  for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

beforeEach(() => {
  boundary.folder = aMadeFolder('the-documents-')
  boundary.workdir = join(boundary.folder, 'workdir')
  boundary.state = {}
  boundary.logs = []
  boundary.writes = 0
  boundary.officeKeeper = []
})

function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: SYNTHETIC_GIT(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function commitIn(cwd: string, message: string): string {
  gitIn(cwd, 'add', '-A')
  gitIn(cwd, 'commit', '-qm', message)
  return gitIn(cwd, 'rev-parse', 'HEAD')
}

/** A main checkout at M, a final commit Cfinal on a branch, and an independent clone detached at Cfinal. */
function aLane(files: Record<string, string> = {}): { root: string; M: string; Cfinal: string; clone: string } {
  const lane = mkdtempSync(join(boundary.folder, 'lane-'))
  const root = join(lane, 'root')
  mkdirSync(root)
  gitIn(root, 'init', '-qb', 'main')
  writeFileSync(join(root, '.gitignore'), 'node_modules\n')
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'value.txt'), 'base\n')
  const M = commitIn(root, 'Synthetic baseline')
  gitIn(root, 'switch', '-qc', 'feature')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const Cfinal = commitIn(root, 'Synthetic final commit')
  gitIn(root, 'switch', '-q', 'main')
  const clone = join(lane, 'clone')
  execFileSync('git', ['clone', '-q', '--no-local', root, clone], { env: SYNTHETIC_GIT(), stdio: 'ignore' })
  gitIn(clone, 'checkout', '-q', '--detach', Cfinal)
  return { root, M, Cfinal, clone }
}

it('1. each documents function refuses with its sentence when the office functions are missing', async () => {
  const sentence = aNonEmptyString(Reflect.get(theDocuments, 'THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS'))
  const theLane = vi.fn(async () => [])
  const sleep = vi.fn(async () => undefined)
  const ask = vi.fn(async () => ({ status: 200, body: {} }))
  const step = vi.fn(async () => ({}))
  const from = 'a'.repeat(40)
  const to = 'b'.repeat(40)
  const refused: Promise<unknown>[] = [
    documents.aMoveOfOnlyDocuments('/nowhere', from, to),
    documents.aMoveOfOnlyDocuments('/nowhere', from, to, {}),
    documents.aMoveOfOnlyDocuments('/nowhere', from, to, { theLane: 'not a function' }),
    documents.untilNoOtherLandingOf('/nowhere'),
    documents.untilNoOtherLandingOf('/nowhere', {}),
    documents.untilNoOtherLandingOf('/nowhere', { sleep, ask }),
    documents.untilNoOtherLandingOf('/nowhere', { theLane, ask }),
    documents.untilNoOtherLandingOf('/nowhere', { theLane, sleep }),
    documents.untilNoOtherLandingOf('/nowhere', { theLane, sleep, ask: 'not a function' }),
    documents.carryPastDocuments({}, from, '/nowhere'),
    documents.carryPastDocuments({}, from, '/nowhere', {}),
    documents.carryPastDocuments({}, from, '/nowhere', { step }),
    documents.carryPastDocuments({}, from, '/nowhere', { theLane }),
  ]
  for (const run of refused) expect(await theRefusal(run), 'the refusal the documents give').toBe(sentence)

  for (const given of [theLane, sleep, ask, step]) expect(given, 'no function given is called').not.toHaveBeenCalled()
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('2. theSuiteWorkers refuses with its sentence when the setting reads or bounds are missing', () => {
  const sentence = aNonEmptyString(Reflect.get(theDocuments, 'THE_SUITE_WORKERS_NEED_THE_SETTING_READS'))
  const given = vi.fn(() => '3')
  const fallback = vi.fn(() => 2)
  const bounds = { fewest: 1, most: 8 }
  const ownEntry = { id: 'synthetic-entry', suiteWorkers: { count: 9, by: { kind: 'agent', id: 'made-up' } } }
  const refused: Array<() => unknown> = [
    () => documents.theSuiteWorkers(ownEntry),
    () => documents.theSuiteWorkers(ownEntry, {}),
    () => documents.theSuiteWorkers(ownEntry, { fallback, bounds }),
    () => documents.theSuiteWorkers(ownEntry, { given, bounds }),
    () => documents.theSuiteWorkers(ownEntry, { given, fallback }),
    () => documents.theSuiteWorkers(ownEntry, { given: 'not a function', fallback, bounds }),
    () => documents.theSuiteWorkers(ownEntry, { given, fallback: 'not a function', bounds }),
    () => documents.theSuiteWorkers(ownEntry, { given, fallback, bounds: {} }),
    () => documents.theSuiteWorkers(ownEntry, { given, fallback, bounds: { fewest: 1 } }),
    () => documents.theSuiteWorkers(ownEntry, { given, fallback, bounds: { fewest: '1', most: 8 } }),
  ]
  for (const run of refused) expect(theThrown(run), 'the refusal theSuiteWorkers gives').toBe(sentence)

  expect(given, 'the given read is not called').not.toHaveBeenCalled()
  expect(fallback, 'the fallback read is not called').not.toHaveBeenCalled()
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('3. aMoveOfOnlyDocuments uses the given theLane and answers the chain of landings', async () => {
  const root = '/synthetic/documents-root'
  const from = 'a'.repeat(40)
  const mid = 'b'.repeat(40)
  const to = 'c'.repeat(40)
  const merged = [
    { id: 'first-landing', state: 'merged', machine: { integrated: { mainBefore: from, mainAfter: mid } } },
    { id: 'second-landing', state: 'merged', machine: { integrated: { mainBefore: mid, mainAfter: to } } },
    { id: 'not-a-landing', state: 'judged', machine: { integrated: { mainBefore: mid, mainAfter: to } } },
  ]
  const theLane = vi.fn(async () => merged)
  expect(await documents.aMoveOfOnlyDocuments(root, from, to, { theLane }), 'the chain is answered').toEqual(['first-landing', 'second-landing'])
  expect(theLane, 'the given theLane is asked for the documents lane in the merged state').toHaveBeenCalledWith(`${root} ${DOCUMENTS_LANE}`, ['merged'])

  const broken = vi.fn(async () => [merged[0]])
  expect(await documents.aMoveOfOnlyDocuments(root, from, to, { theLane: broken }), 'a broken chain is null').toBeNull()
  expect(await documents.aMoveOfOnlyDocuments(root, from, from, { theLane }), 'a move that is no move is an empty list').toEqual([])
})

it('4. untilNoOtherLandingOf waits with the given sleep and asks the given ask', async () => {
  const root = '/synthetic/documents-root'
  const anotherLanding = { id: 'another-entry', state: 'landing' }
  const theLane = vi.fn()
  theLane.mockResolvedValueOnce([anotherLanding])
  theLane.mockResolvedValue([])
  const sleep = vi.fn(async () => undefined)
  const ask = vi.fn(async () => ({ status: 200, body: { lanes: [], emergencyPushes: [] } }))

  await documents.untilNoOtherLandingOf(root, { theLane, sleep, ask })

  expect(sleep, 'the given sleep is called once').toHaveBeenCalledTimes(1)
  expect(sleep, 'the given sleep is called with 5000').toHaveBeenCalledWith(5000)
  expect(ask, 'the given ask is called for the emergency pushes').toHaveBeenCalledTimes(1)
  expect(ask, 'the given ask is called with GET and a merge-list path').toHaveBeenCalledWith('GET', expect.stringContaining('/api/merge-queue'))
  expect(theLane, 'the given theLane is called for both lanes').toHaveBeenCalledWith(root, ['landing'])
  expect(theLane).toHaveBeenCalledWith(`${root} ${DOCUMENTS_LANE}`, ['landing'])
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('5. carryPastDocuments passes the given theLane and step over real repositories', async () => {
  const lane = aLane({ 'src/entry.txt': 'entry\n' })
  mkdirSync(join(lane.root, 'design'), { recursive: true })
  writeFileSync(join(lane.root, 'design', 'main-moved.md'), 'a document moved main\n')
  const head = commitIn(lane.root, 'Synthetic main moved by a document')
  const theLane = vi.fn(async () => [{ id: 'doc-landing', state: 'merged', machine: { integrated: { mainBefore: lane.M, mainAfter: head } } }])
  const answer = { state: 'landing', name: 'moved-past-documents' }
  const step = vi.fn(async () => answer)

  const result = await documents.carryPastDocuments({ M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone }, head, lane.root, { theLane, step })

  expect(theLane, 'the given theLane is passed to aMoveOfOnlyDocuments').toHaveBeenCalledWith(`${lane.root} ${DOCUMENTS_LANE}`, ['merged'])
  expect(step, 'the given step is called once').toHaveBeenCalledTimes(1)
  const [name, facts, detail] = step.mock.calls[0] as unknown as [string, Record<string, any>, Record<string, any>]
  expect(name, 'the given step is called with moved-past-documents').toBe('moved-past-documents')
  expect(facts, 'the facts name the new main and the documentation landings').toMatchObject({ mainAt: head, documents: ['doc-landing'] })
  expect(detail, 'the detail names the move it carried the entry past').toMatchObject({ from: lane.M, to: head, before: lane.Cfinal })
  expect(result.entry, 'the answer is the step answer').toBe(answer)
  expect(result.M, 'the new main is answered').toBe(head)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('6. theSuiteWorkers reads at the moment of use and uses the given bounds and fallback', () => {
  const bounds = { fewest: 1, most: 8 }
  const entry = { id: 'synthetic-entry' }
  const fallback = vi.fn(() => 2)
  const given = vi.fn()
  given.mockReturnValueOnce('3').mockReturnValueOnce('5')
  expect(documents.theSuiteWorkers(entry, { given, fallback, bounds }), 'the first call answers the first reading').toEqual({ count: 3, said: null })
  expect(documents.theSuiteWorkers(entry, { given, fallback, bounds }), 'the second call answers the second reading').toEqual({ count: 5, said: null })
  expect(given, 'the given read is called for each call').toHaveBeenCalledTimes(2)
  expect(fallback, 'the fallback read is called for each call').toHaveBeenCalledTimes(2)
  expect(fallback.mock.invocationCallOrder[0], 'the fallback is read before the value, as before').toBeLessThan(given.mock.invocationCallOrder[0]!)
  expect(fallback.mock.invocationCallOrder[1], 'the fallback is read before the value again').toBeLessThan(given.mock.invocationCallOrder[1]!)

  const outsideFallback = vi.fn(() => 7)
  const outsideGiven = vi.fn(() => '99')
  const outside = documents.theSuiteWorkers(entry, { given: outsideGiven, fallback: outsideFallback, bounds })
  expect(outside.count, 'a value outside the bounds gives the fallback').toBe(7)
  expect(outside.said, 'the sentence names the value it read').toContain('MOLE_OFFICE_MERGE_WORKERS is "99"')
  expect(outside.said, 'the sentence names the bounds it was given').toContain('from 1 to 8')
  expect(outside.said, 'the sentence says the count it used').toContain('so the suite ran at 7 workers.')

  const ownGiven = vi.fn()
  const ownFallback = vi.fn()
  const own = documents.theSuiteWorkers(
    { id: 'own-entry', suiteWorkers: { count: 9, by: { kind: 'agent', id: 'made-up' } } },
    { given: ownGiven, fallback: ownFallback, bounds },
  )
  expect(own.count, "an entry's own count is used").toBe(9)
  expect(own.said, "an entry's own count is said").toContain('9 suite workers')
  expect(ownGiven, "an entry's own count calls neither read").not.toHaveBeenCalled()
  expect(ownFallback, "an entry's own count calls neither read").not.toHaveBeenCalled()
})

let realArguments: typeof import('../../tools/merge-tool/arguments.mjs')

beforeAll(async () => {
  // THE REAL ARGUMENTS MODULE READS THE COMMAND LINE WHEN IT LOADS, so it is loaded here with a made-up one, and
  // process.argv is put back at once. The workdir is this test's own folder under the system temporary folder.
  const workdir = aMadeFolder('the-documents-arguments-')
  const savedArgv = process.argv
  process.argv = ['node', 'made-up-reader', '--entry', 'made-up-entry', '--session', 'made-up-run', '--api', 'http://127.0.0.1:0', '--workdir', workdir]
  try {
    realArguments = await vi.importActual('../../tools/merge-tool/arguments.mjs')
  } finally {
    process.argv = savedArgv
  }
})


