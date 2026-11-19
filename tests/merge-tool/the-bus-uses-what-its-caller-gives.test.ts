// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BUS USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/pairs.mjs used to import BUS_ENTRIES_BOUNDS, settingNamed and settingValue from
 * src/config/settings.mjs, queueCodeRidesABus from src/config/queue-code-rides-a-bus.mjs, and countAGateMet,
 * keepTheReport, runInSandbox, sleep, theLane and theOfficesRuntime from office-keeper.mjs. It now takes those office
 * functions from its caller, as testing.mjs passes office-keeper.mjs's, and the bus reads from its caller, as
 * testing.mjs passes arguments.mjs's THE_BUS_READS (decision BxtP4m3YkTOQ, option (a)), so pairs.mjs reaches no office
 * module and reads no setting itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. Each of aBusFor, aResultToBorrow, aCollisionNaming and whatTheBusDecides refuses, as its first statement, with
 *    exactly THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS when given nothing or all its office functions but one left out in
 *    turn. aBusFor needs five office functions: theLane, sleep, countAGateMet, theOfficesRuntime and runInSandbox.
 *    None of the given functions is called and no office-keeper function is reached. aCollisionNaming refuses
 *    with an empty stillRed too.
 * 2. theBusRules refuses with exactly THE_BUS_NEEDS_THE_SETTING_READS when given nothing, the three reads with one
 *    left out or an inner given or fallback that is not a function in turn, and aBusFor refuses the same way when its
 *    reads leave out queueCodeRidesABus. No read and no office function is called.
 * 3. theBusRules reads at the moment of use: two calls with readers whose answers change answer each call's numbers. A
 *    cap above the given bounds' most gives the fallback and logs the sentence with "the technical limit is"; a leave
 *    time that is not a whole number gives its fallback and logs its sentence.
 * 4. aBusFor waits with what it is given: an entry that changes no queue code, a lane with one submitted entry and then
 *    none, and a leave time of 1800. It asks the given theLane twice, calls the given sleep once with 1000, reads each
 *    given again at each read of the rules, and answers { none: 'no other entry of this lane is judged' }.
 * 5. aBusFor asks the given switch: an entry that changes a file under tools/merge-tool/ is tested alone when the
 *    switch is 0, and, when it is 1 and the office gives no runtime answer, says so. The switch decides, not an import.
 * 6. aResultToBorrow and aCollisionNaming ask the given theLane for entry.changeset.root: an empty lane gives null and
 *    '' respectively, and a lane entry that recorded a collision gives aCollisionNaming's sentence naming it.
 *
 * PROOF RUNS (chapter 5 rule 1), each `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control at 0fd1ebc39: this file green with the new integration file, the guard and four others, 7 files and 78
 *   tests (control-run4.log); after commit 1 this file and the new integration file green, 2 files and 13 tests
 *   (c1-new-and-bus-2.log).
 * - at commit 3's final tree 2d42e02f3: this file red in cases 1 and 8 and green in 2 to 7; with the new integration
 *   file 7 failed and 10 passed, and case 1 left 10 unhandled rejections (c3-final-red.log).
 * - after commit 4 (192c7873f): this file and the new integration file green, 2 files and 17 tests (c4-pre-2.log),
 *   and the seven-file control run green, 7 files and 82 tests (c4-proof-a.log).
 * - mutations on 192c7873f's tree: M8, testing.mjs's call without runInSandbox, made case 8 red (m8-red.log) and
 *   its restore green (m8-restore.log); M9, aBusFor's check without runInSandbox, made case 1 red (m9-red.log) and
 *   its restore green (m9-restore.log).
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { BUS_ENTRIES_BOUNDS } from '../../src/config/settings.mjs'
import { queueCodeRidesABus } from '../../src/config/queue-code-rides-a-bus.mjs'

const boundary = vi.hoisted(() => ({
  folder: '',
  workdir: '',
  state: {} as Record<string, any>,
  logs: [] as string[],
  officeKeeper: [] as string[],
}))

const SYNTHETIC_GIT = vi.hoisted(() => (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'Synthetic bus',
  GIT_AUTHOR_EMAIL: 'fixture@test.example',
  GIT_COMMITTER_NAME: 'Synthetic bus',
  GIT_COMMITTER_EMAIL: 'fixture@test.example',
}))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  ABSENT: 'absent',
  API: '',
  GIT_IDENTITY: { name: 'Synthetic bus', email: 'fixture@test.example' },
  PINNED_REF_PREFIX: 'refs/synthetic/',
  RERUN_LIMITS: { timeoutMs: 30_000, idleTimeoutMs: 30_000 },
  SCRIPT_TIMEOUT_MS: 30_000,
  THIS_CHECKOUT: fileURLToPath(new URL('../..', import.meta.url)),
  get WORKDIR() { return boundary.workdir },
  WORKSPACE: 'synthetic',
  chosen: {
    entry: 'synthetic-entry',
    slotEvery: 1,
    get workdir() { return boundary.workdir },
    get sandboxes() { return join(boundary.folder, 'sandboxes') },
  },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  class ACloneNamesAProgram extends MergerFailure {}
  return {
    MergerFailure,
    ACloneNamesAProgram,
    fail: (why: string) => { throw new Error(why) },
    log: (line: string) => { boundary.logs.push(line) },
    stamp: () => '2026-11-11 00:00:00',
    readState: () => boundary.state,
    readStateAt: () => ({}),
    writeState: (patch: Record<string, any>) => { boundary.state = { ...boundary.state, ...patch }; return boundary.state },
    writeStateAt: () => ({}),
  }
})

vi.mock('../../tools/merge-tool/documents.mjs', () => ({
  generatedPathsOf: () => [],
  theDocumentsOf: () => ({ none: 'Synthetic code entry' }),
  theRecordOfMain: () => ({ record: null }),
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => {
  const reached = (name: string) => async () => {
    boundary.officeKeeper.push(name)
    throw new Error(`the bus reached office-keeper.mjs itself: ${name}`)
  }
  return {
    ask: reached('ask'),
    countAGateMet: reached('countAGateMet'),
    keepTheReport: reached('keepTheReport'),
    runInSandbox: reached('runInSandbox'),
    sleep: reached('sleep'),
    step: reached('step'),
    theLane: reached('theLane'),
    theOfficesRuntime: reached('theOfficesRuntime'),
    theSandbox: reached('theSandbox'),
    theSeal: reached('theSeal'),
  }
})

import * as theBus from '../../tools/merge-tool/pairs.mjs'

type TheReads = {
  mostEntries?: { given?: unknown; fallback?: unknown }
  leavesAfterSeconds?: { given?: unknown; fallback?: unknown }
  bounds?: unknown
  queueCodeRidesABus?: unknown
}
type TheOfficeGiven = {
  theLane?: unknown
  sleep?: unknown
  countAGateMet?: unknown
  theOfficesRuntime?: unknown
  runInSandbox?: unknown
  reads?: unknown
}
type TheBus = {
  theBusRules: (reads?: TheReads) => { most: number; leavesAfterSeconds: number }
  aBusFor: (entry: unknown, integrated: unknown, sandbox: unknown, given?: TheOfficeGiven) => Promise<any>
  aResultToBorrow: (entry: unknown, integrated: unknown, given?: { theLane?: unknown }) => Promise<any>
  aCollisionNaming: (entry: unknown, stillRed: string[], given?: { theLane?: unknown }) => Promise<string>
  whatTheBusDecides: (given?: Record<string, unknown>) => Promise<any>
}
/** Cast through unknown, so this file compiles before and after the functions take their later arguments. */
const bus = theBus as unknown as TheBus

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
  throw new Error('the bus accepted what it cannot use')
}

/** The message a refused synchronous call throws. */
function theThrown(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the bus accepted what it cannot use')
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
  boundary.folder = aMadeFolder('the-bus-')
  boundary.workdir = join(boundary.folder, 'workdir')
  mkdirSync(boundary.workdir, { recursive: true })
  boundary.state = {}
  boundary.logs = []
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

/** The bus's reads as this file gives them: its two numbers made up, and the switch the case chooses. */
function madeUpReads(position = '0'): TheReads & { queueCodeRidesABus: () => Record<string, string> } {
  return {
    mostEntries: { given: () => '8', fallback: () => 8 },
    leavesAfterSeconds: { given: () => '1800', fallback: () => 1800 },
    bounds: BUS_ENTRIES_BOUNDS,
    queueCodeRidesABus: () => ({ id: 'queue-code-rides-a-bus', setting: 'MOLE_OFFICE_QUEUE_CODE_RIDES_A_BUS', position }),
  }
}

it('1. each bus function refuses with its sentence when the office functions are missing', async () => {
  const sentence = aNonEmptyString(Reflect.get(theBus, 'THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS'))
  const theLane = vi.fn(async () => [])
  const sleep = vi.fn(async () => undefined)
  const countAGateMet = vi.fn(async () => ({}))
  const theOfficesRuntime = vi.fn(async () => null)
  const runInSandbox = vi.fn(async () => ({}))
  const keepTheReport = vi.fn((path: string) => path)
  const reads = madeUpReads()
  const entry = { changeset: { root: '/synthetic/root' } }
  const refused: Promise<unknown>[] = [
    bus.aBusFor(entry, {}, {}),
    bus.aBusFor(entry, {}, {}, { sleep, countAGateMet, theOfficesRuntime, runInSandbox, reads }),
    bus.aBusFor(entry, {}, {}, { theLane, countAGateMet, theOfficesRuntime, runInSandbox, reads }),
    bus.aBusFor(entry, {}, {}, { theLane, sleep, theOfficesRuntime, runInSandbox, reads }),
    bus.aBusFor(entry, {}, {}, { theLane, sleep, countAGateMet, runInSandbox, reads }),
    bus.aBusFor(entry, {}, {}, { theLane, sleep, countAGateMet, theOfficesRuntime, reads }),
    bus.aResultToBorrow(entry, {}),
    bus.aResultToBorrow(entry, {}, {}),
    bus.aCollisionNaming(entry, ['tests/synthetic-red.test.ts']),
    bus.aCollisionNaming(entry, ['tests/synthetic-red.test.ts'], {}),
    bus.aCollisionNaming(entry, []),
    bus.aCollisionNaming(entry, [], {}),
    bus.whatTheBusDecides(),
    bus.whatTheBusDecides({}),
    bus.whatTheBusDecides({ keepTheReport }),
    bus.whatTheBusDecides({ runInSandbox }),
  ]
  for (const run of refused) expect(await theRefusal(run), 'the refusal the bus gives').toBe(sentence)

  for (const given of [theLane, sleep, countAGateMet, theOfficesRuntime, runInSandbox, keepTheReport]) {
    expect(given, 'no function given is called').not.toHaveBeenCalled()
  }
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('2. theBusRules refuses with its sentence when the reads are missing', async () => {
  const sentence = aNonEmptyString(Reflect.get(theBus, 'THE_BUS_NEEDS_THE_SETTING_READS'))
  const mostEntries = { given: vi.fn(() => '8'), fallback: vi.fn(() => 8) }
  const leavesAfterSeconds = { given: vi.fn(() => '1800'), fallback: vi.fn(() => 1800) }
  const bounds = { fewest: 1, most: 64 }
  const refused: Array<() => unknown> = [
    () => bus.theBusRules(),
    () => bus.theBusRules({}),
    () => bus.theBusRules({ leavesAfterSeconds, bounds }),
    () => bus.theBusRules({ mostEntries, bounds }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds }),
    () => bus.theBusRules({ mostEntries: { ...mostEntries, given: 'not a function' }, leavesAfterSeconds, bounds }),
    () => bus.theBusRules({ mostEntries: { ...mostEntries, fallback: 'not a function' }, leavesAfterSeconds, bounds }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds: { ...leavesAfterSeconds, given: 'not a function' }, bounds }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds: { ...leavesAfterSeconds, fallback: 'not a function' }, bounds }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds, bounds: {} }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds, bounds: { fewest: 1 } }),
    () => bus.theBusRules({ mostEntries, leavesAfterSeconds, bounds: { fewest: '1', most: 64 } }),
  ]
  for (const run of refused) expect(theThrown(run), 'the refusal theBusRules gives').toBe(sentence)

  for (const read of [mostEntries.given, mostEntries.fallback, leavesAfterSeconds.given, leavesAfterSeconds.fallback]) {
    expect(read, 'the given reads are not called').not.toHaveBeenCalled()
  }

  const theLane = vi.fn(async () => [])
  const sleep = vi.fn(async () => undefined)
  const countAGateMet = vi.fn(async () => ({}))
  const theOfficesRuntime = vi.fn(async () => null)
  const runInSandbox = vi.fn(async () => ({}))
  const withoutTheSwitch = { mostEntries, leavesAfterSeconds, bounds }
  const refusal = await theRefusal(bus.aBusFor({ changeset: { root: '/synthetic/root' } }, {}, {}, { theLane, sleep, countAGateMet, theOfficesRuntime, runInSandbox, reads: withoutTheSwitch }))
  expect(refusal, 'aBusFor gives the same sentence when its reads leave out the switch').toBe(sentence)
  for (const given of [theLane, sleep, countAGateMet, theOfficesRuntime]) expect(given, 'no office function given is called').not.toHaveBeenCalled()
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('3. theBusRules reads at the moment of use and uses the given bounds and fallback', () => {
  const bounds = { fewest: 1, most: 64 }
  const mostEntries = { given: vi.fn().mockReturnValueOnce('3').mockReturnValueOnce('5'), fallback: vi.fn(() => 8) }
  const leavesAfterSeconds = { given: vi.fn().mockReturnValueOnce('20').mockReturnValueOnce('30'), fallback: vi.fn(() => 1800) }
  expect(bus.theBusRules({ mostEntries, leavesAfterSeconds, bounds }), 'the first call answers the first reading').toEqual({ most: 3, leavesAfterSeconds: 20 })
  expect(bus.theBusRules({ mostEntries, leavesAfterSeconds, bounds }), 'the second call answers the second reading').toEqual({ most: 5, leavesAfterSeconds: 30 })
  expect(mostEntries.given, 'the cap is read for each call').toHaveBeenCalledTimes(2)
  expect(leavesAfterSeconds.given, 'the leave time is read for each call').toHaveBeenCalledTimes(2)

  const above = bus.theBusRules({
    mostEntries: { given: () => '65', fallback: () => 8 },
    leavesAfterSeconds: { given: () => '20', fallback: () => 1800 },
    bounds,
  })
  expect(above.most, 'a cap above the given bounds gives the fallback').toBe(8)
  expect(boundary.logs, 'the cap it cannot use is said in words').toContain('MOLE_OFFICE_BUS_MOST_ENTRIES is "65", which it cannot use: the technical limit is 64 entries, so the bus uses 8.')

  const notWhole = bus.theBusRules({
    mostEntries: { given: () => '8', fallback: () => 8 },
    leavesAfterSeconds: { given: () => '4.0', fallback: () => 1800 },
    bounds,
  })
  expect(notWhole.leavesAfterSeconds, 'a leave time that is not a whole number gives its fallback').toBe(1800)
  expect(boundary.logs, 'the leave time it cannot use is said in words').toContain('MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS is "4.0", which it cannot use, so the bus uses 1800.')
})

it('4. aBusFor waits with what it is given', async () => {
  const lane = aLane({ 'src/entry.txt': 'entry\n' })
  const entry = { id: 'synthetic-lead', changeset: { adapter: 'git', root: lane.root, base: lane.M, commit: lane.Cfinal }, machine: { judged: {} } }
  const mostGiven = vi.fn(() => '8')
  const mostFallback = vi.fn(() => 8)
  const leaveGiven = vi.fn(() => '1800')
  const leaveFallback = vi.fn(() => 1800)
  const reads = {
    mostEntries: { given: mostGiven, fallback: mostFallback },
    leavesAfterSeconds: { given: leaveGiven, fallback: leaveFallback },
    bounds: BUS_ENTRIES_BOUNDS,
    queueCodeRidesABus: () => { throw new Error('the queue switch is not reached in this case') },
  }
  const theLane = vi.fn()
  theLane.mockResolvedValueOnce([{ id: 'synthetic-waiting', state: 'submitted' }])
  theLane.mockResolvedValue([])
  const sleep = vi.fn(async () => undefined)
  const countAGateMet = vi.fn(async () => ({}))
  const theOfficesRuntime = vi.fn(async () => null)
  const runInSandbox = vi.fn(async () => ({}))

  const answer = await bus.aBusFor(entry, { clone: lane.clone, M: lane.M, Cfinal: lane.Cfinal }, { folder: boundary.folder }, { theLane, sleep, countAGateMet, theOfficesRuntime, runInSandbox, reads })

  expect(answer, 'the bus that waited for nobody answers so').toEqual({ none: 'no other entry of this lane is judged' })
  expect(theLane, 'the given theLane is asked for the entry root at each look').toHaveBeenCalledTimes(2)
  expect(theLane).toHaveBeenNthCalledWith(1, lane.root)
  expect(theLane).toHaveBeenNthCalledWith(2, lane.root)
  expect(sleep, 'the given sleep waits one slot').toHaveBeenCalledTimes(1)
  expect(sleep, 'the given sleep waits one slot').toHaveBeenCalledWith(1000)
  // FOUR READS OF THE RULES: before the clone (line 278), the first look (line 458), the loop's refresh before waiting
  // (line 484), and the look after the given sleep (line 458). Each read calls the fallback and then the given value.
  for (const read of [mostGiven, leaveGiven, mostFallback, leaveFallback]) {
    expect(read, 'each read is made again at each read of the rules').toHaveBeenCalledTimes(4)
  }
  expect(countAGateMet, 'the queue-code gate is not counted').not.toHaveBeenCalled()
  expect(theOfficesRuntime, 'the office runtime is not asked').not.toHaveBeenCalled()
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('5. aBusFor asks the given switch', async () => {
  const lane = aLane({ 'tools/merge-tool/synthetic-queue.mjs': 'export const synthetic = true\n' })
  const entry = { id: 'synthetic-lead', changeset: { adapter: 'git', root: lane.root, base: lane.M, commit: lane.Cfinal }, machine: { judged: {} } }
  const integrated = { clone: lane.clone, M: lane.M, Cfinal: lane.Cfinal }
  const anOffice = () => ({
    theLane: vi.fn(async () => []),
    sleep: vi.fn(async () => undefined),
    countAGateMet: vi.fn(async () => ({})),
    theOfficesRuntime: vi.fn(async () => null),
    runInSandbox: vi.fn(async () => ({})),
  })

  const off = anOffice()
  const offAnswer = await bus.aBusFor(entry, integrated, { folder: boundary.folder }, { ...off, reads: madeUpReads('0') })
  expect(offAnswer.none, 'at 0 the queue own code is tested alone').toContain('is 0, so it is tested alone')
  expect(off.countAGateMet, 'the switch is counted once').toHaveBeenCalledTimes(1)
  expect(off.countAGateMet, 'the switch is counted with its id and position').toHaveBeenCalledWith('queue-code-rides-a-bus', '0')
  expect(off.theOfficesRuntime, 'the office is not asked at 0').not.toHaveBeenCalled()

  const on = anOffice()
  const onAnswer = await bus.aBusFor(entry, integrated, { folder: boundary.folder }, { ...on, reads: madeUpReads('1') })
  expect(onAnswer.none, 'at 1 with no runtime answer the entry is tested alone').toContain('the office gave no runtime answer')
  expect(on.countAGateMet, 'the switch is counted once').toHaveBeenCalledWith('queue-code-rides-a-bus', '1')
  expect(on.theOfficesRuntime, 'the office runtime is asked once at 1').toHaveBeenCalledTimes(1)
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('6. aResultToBorrow and aCollisionNaming ask the given theLane for the entry root', async () => {
  const entry = { id: 'synthetic-entry', changeset: { root: '/synthetic/root' } }

  const emptyForTheResult = vi.fn(async () => [])
  expect(await bus.aResultToBorrow(entry, {}, { theLane: emptyForTheResult }), 'an empty lane borrows nothing').toBeNull()
  expect(emptyForTheResult, 'the given theLane is asked for the entry root').toHaveBeenCalledWith('/synthetic/root')

  const emptyForTheName = vi.fn(async () => [])
  expect(await bus.aCollisionNaming(entry, ['tests/synthetic-red.test.ts'], { theLane: emptyForTheName }), 'an empty lane names no collision').toBe('')
  expect(emptyForTheName, 'the given theLane is asked for the entry root').toHaveBeenCalledWith('/synthetic/root')

  const collision = vi.fn(async () => [{
    id: 'synthetic-collision-entry',
    machine: { tested: { testedWith: { entry: 'synthetic-entry', collision: ['tests/synthetic-red.test.ts'], tree: 'a'.repeat(40) } } },
  }])
  const named = await bus.aCollisionNaming(entry, ['tests/synthetic-red.test.ts'], { theLane: collision })
  expect(named, 'the sentence names the entry that collided').toContain('merge entry synthetic-collision-entry')
  expect(named, 'the sentence names the file').toContain('tests/synthetic-red.test.ts')
  expect(collision, 'the given theLane is asked for the entry root').toHaveBeenCalledWith('/synthetic/root')
  expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

let realArguments: typeof import('../../tools/merge-tool/arguments.mjs')

beforeAll(async () => {
  // THE REAL ARGUMENTS MODULE READS THE COMMAND LINE WHEN IT LOADS, so it is loaded here with a made-up one, and
  // process.argv is put back at once. The workdir is this test's own folder under the system temporary folder.
  const workdir = aMadeFolder('the-bus-arguments-')
  const savedArgv = process.argv
  process.argv = ['node', 'made-up-reader', '--entry', 'made-up-entry', '--session', 'made-up-run', '--api', 'http://127.0.0.1:0', '--workdir', workdir]
  try {
    realArguments = await vi.importActual('../../tools/merge-tool/arguments.mjs')
  } finally {
    process.argv = savedArgv
  }
})


