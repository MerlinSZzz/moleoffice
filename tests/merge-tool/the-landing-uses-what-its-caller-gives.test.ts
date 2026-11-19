// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANDING USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/land.mjs used to import ask, countAGateMet, runInSandbox, step, theOfficesRuntime, theSandbox,
 * waitForHealth and conflictsAfterLanding from office-keeper.mjs, the module that talks to the office, and
 * wholeSuiteFixRoundIsOn and pluginPagesPosition from src/config/whole-suite-red.mjs and
 * src/config/integration-guards.mjs, which read src/config/settings.mjs. It now takes all twelve from its caller: the
 * ten office functions from office-keeper.mjs and the two gate reads from arguments.mjs's THE_LANDING_GATE_READS, as
 * tools/the-merger.mjs passes them, so land.mjs reaches no office module itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. landGit refuses, as its first statement, with exactly LAND_GIT_NEEDS_WHAT_ITS_CALLER_GIVES when it is given no
 *    options, only { replayOnly: true }, or all twelve but one left out in turn. None of the twelve is called, no
 *    state is read or written, and no office-keeper function is reached.
 * 2. A landing that finds main moved calls the given ask from sayThePushesThatMovedMain and the given step once with
 *    'main-moved', answers what the step answered, and reaches no office-keeper function.
 * 3. A whole landing calls the given theOfficesRuntime, waitForHealth and conflictsAfterLanding, and its given step
 *    last with 'landed'. No office-keeper function is reached.
 * 4. A plugin page whose build gave no result reads the given pluginPagesPosition. (a) At 'block' the landing rejects,
 *    with main where it was, and the given countAGateMet is called with plugin-pages-built-before-landing and 'block'.
 *    (b) At 'remind' the landing goes on and countAGateMet is called with plugin-pages-built-before-landing and
 *    'remind'. No office-keeper function is reached.
 * 5. The whole-suite read is the given wholeSuiteFixRoundIsOn. (a) At true, with a red whole suite and main moved,
 *    carryPastDocuments is not called and the run stops at the early return after step('landing'). (b) At false it is
 *    called and the run stops at the return of the entry carryPastDocuments answered, which is not in testing. In both
 *    the given reader is called once and no office-keeper function is reached.
 * 7. A landing from testing whose main moved only by documentation passes the given theLane, sleep and ask to
 *    untilNoOtherLandingOf as its second argument, and the given theLane and step to carryPastDocuments as its fourth.
 *    Each named function is the very one given, and no office-keeper function is reached.
 *
 * THE OFFICE-KEEPER MOCK'S TWELVE FUNCTIONS RECORD THAT THEY WERE REACHED AND THROW, so the old code is red at once with
 * a plain sentence instead of talking to the office. documents.mjs reaches the office through its own import and
 * push.mjs reaches the network, so both are mocked in this file; documents.mjs's two functions record their calls.
 * arguments.mjs is mocked because it reads the test runner's command line when it loads, and the git module is a
 * stand-in that runs real git on the temporary repositories this file makes.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, before commit 1 (control-before-c1.log): the new file on the old code, the six cases red, each for its own
 *   reason. Its vitest JSON was read before commit 1.
 * - control, after commit 1 (control-c1-red.log): the new file red in all six cases and the guard green; 6 failed and 4
 *   passed over the two files.
 * - after commit 2 (guard-c2-red.log): the guard red in case 1 alone, naming that land.mjs reaches the office by
 *   tools/merge-tool/land.mjs -> tools/merge-tool/office-keeper.mjs; 1 failed and 3 passed.
 * - after commit 3 (green-c3.log): the seven changed test files green, 7 files and 97 tests passed.
 * - after commit 4 (after-code-1.log and after-code-2.log): the new file, the guard, the pinning test, the
 *   files-adapter test and a-merge-tool-library-run-as-a-program-refuses green, 5 files and 32 tests; then the seven
 *   changed files green, 7 files and 97 tests.
 * - mutation 1 (m1-guard-red.log): the wholeSuiteFixRoundIsOn import put back in land.mjs made the guard red naming
 *   land.mjs and src/config/whole-suite-red.mjs; 1 failed and 3 passed. The restore was green (m1-guard-green.log).
 * - mutation 2 (m2-guard-red.log): the step import put back in land.mjs made the guard red naming land.mjs and
 *   tools/merge-tool/office-keeper.mjs; 1 failed and 3 passed. The restore was green (m2-guard-green.log).
 * - mutation 3 (m3-case1-red.log): the first-statement check taken out made case 1 red alone; 1 failed and 5 passed.
 *   The restore was green (m3-green.log).
 * - mutation 4 (m4-case3-red.log): decideAboutTheOffice answering a made-up runtime in place of the given
 *   theOfficesRuntime made case 3 red alone; 1 failed and 5 passed. The restore was green (m4-green.log).
 * - mutation 5 (m5-case4a-red.log): buildTheChangedPlugins using 'remind' in place of the given pluginPagesPosition()
 *   made case 4 red alone; 1 failed and 5 passed. The restore was green (m5-green.log).
 * - mutation 6 (m6-case5a-red.log): the line-94 test using false in place of the given wholeSuiteFixRoundIsOn() made
 *   case 5 red alone; 1 failed and 5 passed. The restore was green (m6-green.log).
 *
 * ROUND 207, THE DOCUMENTS MOVE: theLane and sleep join the twelve.
 * - control, after commit 2 (landing-c2-red.log): case 1, case 6 and case 7 red, the other four green; 3 failed and 4
 *   passed. The brief named cases 1 and 7 alone; the supervisor corrected it (message cwujxzA3vq--) because case 6 is
 *   red until the Code commit changes tools/the-merger.mjs.
 * - after commit 6 (landing-green.log): this file green, 1 file and 7 tests passed.
 * - mutation (m4-until-no-ask-red-final.log): land.mjs line 99 passing { theLane, sleep } without ask made case 7
 *   red alone; 1 failed and 6 passed. The restore was green (m4-until-no-ask-green-final.log, 7 passed).
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  folder: '',
  state: {} as Record<string, any>,
  logs: [] as string[],
  reads: 0,
  writes: 0,
  officeKeeper: [] as string[],
  untils: [] as unknown[],
  carried: [] as unknown[],
  carriedAnswer: null as any,
}))

const SYNTHETIC_GIT = vi.hoisted(() => (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'Synthetic landing',
  GIT_AUTHOR_EMAIL: 'fixture@test.example',
  GIT_COMMITTER_NAME: 'Synthetic landing',
  GIT_COMMITTER_EMAIL: 'fixture@test.example',
}))

vi.mock('../../tools/merge-tool/arguments.mjs', async () => ({
  THE_OFFICE_CONFIGURATION: (await import('../../tools/merge-tool/config.mjs')).theOfficeConfiguration({ repository: fileURLToPath(new URL('../..', import.meta.url)), commitEmail: (await import('../the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS }),
  get WORKDIR() { return join(boundary.folder, 'workdir') },
  THIS_CHECKOUT: fileURLToPath(new URL('../..', import.meta.url)),
  MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  RERUN_LIMITS: { timeoutMs: 30_000, idleTimeoutMs: 30_000 },
  LOG: 'synthetic-merger.log', ABSENT: 'absent', API: 'http://office.invalid', WORKSPACE: 'synthetic',
  PINNED_REF_PREFIX: 'refs/synthetic/',
  GIT_IDENTITY: (await import('../the-test-commit-address.mjs')).aTestIdentity('Synthetic landing', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, checkResolution: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (why: string) => { throw new Error(why) },
  log: (line: string) => { boundary.logs.push(line) },
  stamp: () => '2026-11-11 00:00:00',
  readState: () => { boundary.reads += 1; return boundary.state },
  writeState: (patch: Record<string, any>) => { boundary.writes += 1; boundary.state = { ...boundary.state, ...patch }; return boundary.state },
}))

vi.mock('../../tools/merge-tool/git.mjs', () => {
  const env = () => SYNTHETIC_GIT()
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  return {
    git,
    tryGit: (cwd: string, args: string[]) => {
      const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: env() })
      return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
    },
    changedBetween: (cwd: string, from: string, to: string) => git(cwd, ['diff', '--name-only', from, to]).split('\n').filter((path) => path !== ''),
    packageScripts: (cwd: string) => {
      const file = join(cwd, 'package.json')
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).scripts ?? {} : {}
    },
    cleanEnvironment: (extra: Record<string, string> = {}) => ({
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && !name.startsWith('MOLE_OFFICE_'))),
      ...extra,
    }),
    run: async (name: string) => { throw new Error(`Synthetic: the ${name} command is not reached in this file`) },
  }
})

vi.mock('../../tools/merge-tool/documents.mjs', () => ({
  untilNoOtherLandingOf: async (...args: unknown[]) => { boundary.untils.push(args) },
  carryPastDocuments: async (...args: unknown[]) => { boundary.carried.push(args); return boundary.carriedAnswer },
  theRecordCarriedForward: () => {},
}))

vi.mock('../../tools/merge-tool/push.mjs', () => ({
  pushLanded: async (_root: string, commit: string) => ({ ok: true, commit, says: 'Synthetic push.' }),
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => {
  const reached = (name: string) => async () => {
    boundary.officeKeeper.push(name)
    throw new Error(`the landing reached office-keeper.mjs itself: ${name}`)
  }
  return {
    ask: reached('ask'),
    countAGateMet: reached('countAGateMet'),
    runInSandbox: reached('runInSandbox'),
    step: reached('step'),
    theOfficesRuntime: reached('theOfficesRuntime'),
    theSandbox: reached('theSandbox'),
    waitForHealth: reached('waitForHealth'),
    conflictsAfterLanding: reached('conflictsAfterLanding'),
    theLane: reached('theLane'),
    sleep: reached('sleep'),
  }
})

import * as theLanding from '../../tools/merge-tool/land.mjs'

const THE_TWELVE = [
  'ask',
  'countAGateMet',
  'runInSandbox',
  'step',
  'theOfficesRuntime',
  'theSandbox',
  'waitForHealth',
  'conflictsAfterLanding',
  'theLane',
  'sleep',
  'wholeSuiteFixRoundIsOn',
  'pluginPagesPosition',
] as const
type TheName = typeof THE_TWELVE[number]

type TheOptions = { replayOnly?: boolean } & Partial<Record<TheName, unknown>>
type TheLanding = { landGit: (entry: unknown, given?: TheOptions) => Promise<any> }
/** Cast through unknown, so this file compiles before and after landGit takes the twelve options. */
const landGit = theLanding as unknown as TheLanding

/** A made-up function for each of the twelve, recording its calls, with the answers a case needs. */
function theGiven(overrides: Partial<Record<TheName, any>> = {}): Record<TheName, any> {
  const made = {} as Record<TheName, any>
  for (const name of THE_TWELVE) made[name] = vi.fn(async () => undefined)
  return { ...made, ...overrides }
}

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
  throw new Error('the landing accepted what it cannot use')
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
  boundary.folder = aMadeFolder('the-landing-')
  boundary.state = {}
  boundary.logs = []
  boundary.reads = 0
  boundary.writes = 0
  boundary.officeKeeper = []
  boundary.untils = []
  boundary.carried = []
  boundary.carriedAnswer = null
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

function anEntry(root: string, state: string): Record<string, any> {
  return { id: 'synthetic-entry', run: 'synthetic-run', state, changeset: { root } }
}

it('1. landGit refuses with exactly its sentence when one of the twelve is not a function', async () => {
  const sentence = aNonEmptyString(Reflect.get(theLanding, 'LAND_GIT_NEEDS_WHAT_ITS_CALLER_GIVES'))
  const entry = { id: 'synthetic-entry', changeset: { root: join(boundary.folder, 'nowhere') } }
  const all = theGiven()
  const refused: Promise<unknown>[] = [
    landGit.landGit(entry),
    landGit.landGit(entry, { replayOnly: true }),
    ...THE_TWELVE.map((name) => {
      const given: Record<string, unknown> = { ...all, replayOnly: true }
      delete given[name]
      return landGit.landGit(entry, given)
    }),
  ]
  for (const run of refused) expect(await theRefusal(run), 'the refusal landGit gives').toBe(sentence)

  for (const name of THE_TWELVE) expect(all[name], `${name} is not called`).not.toHaveBeenCalled()
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  expect(boundary.reads, 'no state was read').toBe(0)
  expect(boundary.writes, 'no state was written').toBe(0)
  expect(existsSync(join(boundary.folder, 'workdir')), 'the made-up WORKDIR holds no state file').toBe(false)
})

it('2. a landing that finds main moved uses the given ask and step', async () => {
  const lane = aLane({ 'src/landed.txt': 'landed\n' })
  mkdirSync(join(lane.root, 'design'), { recursive: true })
  writeFileSync(join(lane.root, 'design', 'main-moved.md'), 'a document moved main\n')
  commitIn(lane.root, 'Synthetic main moved by a document')
  boundary.state = { integrated: { M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone } }

  const answer = { status: 200, body: { lanes: [], emergencyPushes: [] } }
  const ask = vi.fn(async () => answer)
  const answered = { state: 'judged', name: 'main-moved' }
  const step = vi.fn(async () => answered)
  const result = await landGit.landGit(anEntry(lane.root, 'landing'), { replayOnly: true, ...theGiven({ ask, step }) })

  expect(ask, 'the given ask is called by sayThePushesThatMovedMain').toHaveBeenCalledTimes(1)
  expect(ask, 'the given ask is called with GET and a merge-list path').toHaveBeenCalledWith('GET', expect.any(String))
  expect(step, 'the given step is called once').toHaveBeenCalledTimes(1)
  expect(step, 'the given step is called with main-moved').toHaveBeenCalledWith('main-moved', expect.anything(), expect.anything())
  expect(result, 'landGit answers what the step answered').toBe(answered)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('3. a whole landing uses the given office functions', async () => {
  const lane = aLane({ 'src/landed.txt': 'landed\n' })
  boundary.state = { integrated: { M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone } }

  const theOfficesRuntime = vi.fn(async () => ({ repository: { path: lane.root } }))
  const waitForHealth = vi.fn(async () => ({ says: 'Synthetic health passed' }))
  const conflictsAfterLanding = vi.fn(async () => [])
  const answered = { state: 'merged', name: 'landed' }
  const step = vi.fn(async () => answered)
  const result = await landGit.landGit(anEntry(lane.root, 'landing'), {
    replayOnly: true,
    ...theGiven({ theOfficesRuntime, waitForHealth, conflictsAfterLanding, step }),
  })

  expect(theOfficesRuntime, 'the given theOfficesRuntime is called').toHaveBeenCalledTimes(1)
  expect(waitForHealth, 'the given waitForHealth is called').toHaveBeenCalledTimes(1)
  expect(conflictsAfterLanding, 'the given conflictsAfterLanding is called').toHaveBeenCalledTimes(1)
  expect(step, 'the given step is called once').toHaveBeenCalledTimes(1)
  expect(step, 'the given step is called last with landed').toHaveBeenCalledWith('landed', expect.anything(), expect.anything())
  expect(result, 'landGit answers what the step answered').toBe(answered)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('4. the plugin page build uses the given sandbox functions and gate read', async () => {
  const files = {
    'tools/build-a-plugin.mjs': '// synthetic build\n',
    'plugins/made-up-plugin/plugin.json': '{"name":"made-up-plugin"}\n',
    'plugins/made-up-plugin/src/index.ts': 'export const synthetic = true\n',
  }
  const anAnswer = { error: 'synthetic: the launcher never started', code: null, signal: null, timedOut: false, outFile: join(boundary.folder, 'no-result.log'), tail: '' }

  // (a) AT BLOCK. The real office setting says remind, so only the given read can decide; the old code reads it and
  // goes on instead of rejecting.
  vi.stubEnv('MOLE_OFFICE_GATE_PLUGIN_PAGES_BUILT_BEFORE_LANDING', 'remind')
  const blockLane = aLane(files)
  boundary.state = { integrated: { M: blockLane.M, Cfinal: blockLane.Cfinal, clone: blockLane.clone } }
  const blockSandbox = vi.fn(async () => ({ name: 'synthetic-sandbox', folder: boundary.folder }))
  const blockRun = vi.fn(async () => anAnswer)
  const blockCount = vi.fn(async () => ({ counted: true }))
  const blocked = await landGit.landGit(anEntry(blockLane.root, 'landing'), {
    replayOnly: true,
    ...theGiven({
      theSandbox: blockSandbox,
      runInSandbox: blockRun,
      countAGateMet: blockCount,
      pluginPagesPosition: vi.fn(() => 'block'),
      theOfficesRuntime: vi.fn(async () => ({ repository: { path: blockLane.root } })),
      step: vi.fn(async () => ({ state: 'merged' })),
    }),
  }).then(() => null, (error: Error) => error.message)

  expect(blocked, 'at block the landing rejects').toContain('gave no result in sandbox synthetic-sandbox')
  expect(blockCount, 'the given countAGateMet is called at block').toHaveBeenCalledTimes(1)
  expect(blockCount).toHaveBeenCalledWith('plugin-pages-built-before-landing', 'block')
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])

  // (b) AT REMIND. The real office setting says block, so only the given read can let the landing go on.
  vi.stubEnv('MOLE_OFFICE_GATE_PLUGIN_PAGES_BUILT_BEFORE_LANDING', 'block')
  const remindLane = aLane(files)
  boundary.state = { integrated: { M: remindLane.M, Cfinal: remindLane.Cfinal, clone: remindLane.clone } }
  boundary.logs = []
  const remindSandbox = vi.fn(async () => ({ name: 'synthetic-sandbox', folder: boundary.folder }))
  const remindRun = vi.fn(async () => anAnswer)
  const remindCount = vi.fn(async () => ({ counted: true }))
  const answered = { state: 'merged', name: 'landed' }
  const remindStep = vi.fn(async () => answered)
  const landed = await landGit.landGit(anEntry(remindLane.root, 'landing'), {
    replayOnly: true,
    ...theGiven({
      theSandbox: remindSandbox,
      runInSandbox: remindRun,
      countAGateMet: remindCount,
      pluginPagesPosition: vi.fn(() => 'remind'),
      theOfficesRuntime: vi.fn(async () => ({ repository: { path: remindLane.root } })),
      waitForHealth: vi.fn(async () => ({ says: 'Synthetic health passed' })),
      conflictsAfterLanding: vi.fn(async () => []),
      step: remindStep,
    }),
  })

  expect(remindCount, 'the given countAGateMet is called at remind').toHaveBeenCalledTimes(1)
  expect(remindCount).toHaveBeenCalledWith('plugin-pages-built-before-landing', 'remind')
  expect(remindStep, 'the landing went on to the landed step').toHaveBeenCalledWith('landed', expect.anything(), expect.anything())
  expect(landed, 'the landing answers what the step answered').toBe(answered)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  vi.unstubAllEnvs()
})

it('5. the whole-suite read is the given one', async () => {
  const lane = aLane({ 'src/entry.txt': 'entry\n' })
  mkdirSync(join(lane.root, 'design'), { recursive: true })
  writeFileSync(join(lane.root, 'design', 'main-moved.md'), 'a document moved main\n')
  commitIn(lane.root, 'Synthetic main moved by a document')
  const entry = {
    id: 'synthetic-entry',
    state: 'testing',
    changeset: { root: lane.root },
    machine: { tested: { green: false, wholeSuiteRed: { outcome: 'admitted-for-fix-round' } } },
  }

  // (a) AT TRUE. The real office setting says off, so only the given read can keep carryPastDocuments away. The
  // carry answers an entry that is not in testing, so the old code's wrong carry stops here rather than at the step.
  // The new code stops at the early return after step('landing'): `if (entry.state !== 'landing') return entry`.
  vi.stubEnv('MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', '0')
  boundary.state = { integrated: { M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone } }
  boundary.carriedAnswer = { entry: { state: 'judged', name: 'wrongly-carried' } }
  const trueRead = vi.fn(() => true)
  const answered = { state: 'tested', name: 'stopped-after-the-landing-step' }
  const landedOnRead = vi.fn(async () => answered)
  const stopped = await landGit.landGit(entry, { replayOnly: true, ...theGiven({ wholeSuiteFixRoundIsOn: trueRead, step: landedOnRead }) })

  expect(trueRead, 'the given wholeSuiteFixRoundIsOn is called once at true').toHaveBeenCalledTimes(1)
  expect(boundary.untils, 'untilNoOtherLandingOf is called once').toHaveLength(1)
  expect(boundary.carried, 'at true carryPastDocuments is not called').toEqual([])
  expect(stopped, 'the run stops at the early return after step(landing)').toBe(answered)

  // (b) AT FALSE. The real office setting says off too, so only the given read can ask for the carry. The run stops at
  // `if (carried.entry.state !== 'testing') return carried.entry`, which answers an entry that is not in testing.
  boundary.state = { integrated: { M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone } }
  boundary.untils = []
  boundary.carried = []
  const carriedEntry = { state: 'judged', name: 'carried-past-documents' }
  boundary.carriedAnswer = { entry: carriedEntry }
  const falseRead = vi.fn(() => false)
  const afterTheCarry = vi.fn(async () => ({ state: 'landing' }))
  const carried = await landGit.landGit(entry, { replayOnly: true, ...theGiven({ wholeSuiteFixRoundIsOn: falseRead, step: afterTheCarry }) })

  expect(falseRead, 'the given wholeSuiteFixRoundIsOn is called once at false').toHaveBeenCalledTimes(1)
  expect(boundary.untils, 'untilNoOtherLandingOf is called once').toHaveLength(1)
  expect(boundary.carried, 'at false carryPastDocuments is called').toHaveLength(1)
  expect(afterTheCarry, 'the run stops before the landing step').not.toHaveBeenCalled()
  expect(carried, 'the run answers the entry carryPastDocuments answered').toBe(carriedEntry)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  vi.unstubAllEnvs()
})

it('7. a move of only documents passes the given theLane, sleep, ask and step to documents.mjs', async () => {
  const lane = aLane({ 'src/entry.txt': 'entry\n' })
  mkdirSync(join(lane.root, 'design'), { recursive: true })
  writeFileSync(join(lane.root, 'design', 'main-moved.md'), 'a document moved main\n')
  const head = commitIn(lane.root, 'Synthetic main moved by a document')
  const entry = { id: 'synthetic-entry', state: 'testing', changeset: { root: lane.root } }
  boundary.state = { integrated: { M: lane.M, Cfinal: lane.Cfinal, clone: lane.clone } }
  boundary.carriedAnswer = { entry: { state: 'judged', name: 'carried-past-documents' } }

  const theLane = vi.fn(async () => [])
  const sleep = vi.fn(async () => undefined)
  const ask = vi.fn(async () => ({ status: 200, body: { lanes: [], emergencyPushes: [] } }))
  const step = vi.fn(async () => ({ state: 'landing' }))
  const carried = await landGit.landGit(entry, {
    replayOnly: true,
    ...theGiven({ theLane, sleep, ask, step, wholeSuiteFixRoundIsOn: () => false }),
  })

  expect(boundary.untils, 'untilNoOtherLandingOf is called once').toHaveLength(1)
  const [untilRoot, untilGiven] = boundary.untils[0] as [string, Record<string, unknown>]
  expect(untilRoot, 'untilNoOtherLandingOf is given the root').toBe(lane.root)
  expect(untilGiven.theLane, 'the very theLane given').toBe(theLane)
  expect(untilGiven.sleep, 'the very sleep given').toBe(sleep)
  expect(untilGiven.ask, 'the very ask given').toBe(ask)

  expect(boundary.carried, 'carryPastDocuments is called once').toHaveLength(1)
  const [carriedIntegrated, carriedHead, carriedRoot, carriedGiven] = boundary.carried[0] as [Record<string, any>, string, string, Record<string, unknown>]
  expect(carriedIntegrated, 'the integrated state is given').toMatchObject({ M: lane.M, Cfinal: lane.Cfinal })
  expect(carriedHead, 'the new main is given').toBe(head)
  expect(carriedRoot, 'the root is given').toBe(lane.root)
  expect(carriedGiven.theLane, 'the very theLane given').toBe(theLane)
  expect(carriedGiven.step, 'the very step given').toBe(step)
  expect(carried, 'the run answers the entry carryPastDocuments answered').toBe(boundary.carriedAnswer.entry)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})
