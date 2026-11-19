// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic command evidence. The real testGit runs on independent git repositories; no suite,
 * cloud box, container, or live office runs. Commands below are tiny Node report writers.
 *
 * A RED SUITE THAT FINDS MAIN MOVED NAMES THE PUSH (item 16, part b). Its case is here, beside the other cases of the
 * real testGit, because the move is found by testGit's own read of main after a red suite. The push is synthetic: a
 * commit made on the fixture's main while the suite runs, and listed by the office stand-in below. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import { wholeSuiteFixRoundIsOn } from '../src/config/whole-suite-red.mjs'
import { pluginPagesPosition } from '../src/config/integration-guards.mjs'

const f = vi.hoisted(() => ({ folder: '', clone: '', root: '', trusted: '', work: '', tip: '', base: '', mode: '', calls: [] as any[], steps: [] as any[], logged: [] as string[], pushes: [] as any[], bus: null as any, landing: null as any, carried: vi.fn(), borrowed: vi.fn(), counted: vi.fn() }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  THE_OFFICE_CONFIGURATION: (await import('../tools/merge-tool/config.mjs')).theOfficeConfiguration({ repository: fileURLToPath(new URL('..', import.meta.url)), commitEmail: (await import('./the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS }),
  get LOG() { return join(f.work, 'tool.log') }, get WORKDIR() { return f.work }, get THIS_CHECKOUT() { return f.trusted },
  MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 5000, SUITE_TIMEOUT_MS: 5000, MODAL_RUNNER: '', THE_REAL_MODAL_RUNNER: '',
  THE_MODAL_PARTS: Object.freeze({
    VM_CHECKOUT: '/synthetic-checkout',
    VM_DEFAULTS: { limitSeconds: 1, cpu: 1, memoryMiB: 1 },
    VM_SANDBOX_GRACE_SECONDS: 0,
    estimateUSD: () => 0,
    readMonthReceipts: () => 0,
    receiptsFile: () => '/synthetic-receipts.jsonl',
    validateToken: () => {},
    executable: () => '/synthetic-python',
    runnerFiles: () => ({ token: { path: '/synthetic-token.toml', source: 'the setting' }, python: { path: '/synthetic-python', source: 'the setting' } }),
    capAsWritten: () => '0',
    capSetting: 'A_SYNTHETIC_CAP',
  }),
  THE_SUITE_WORKERS_READS: Object.freeze({ given: () => '1', fallback: () => 1, bounds: { fewest: 1, most: 32 } }),
  THE_BUS_READS: Object.freeze({
    mostEntries: Object.freeze({ given: () => '8', fallback: () => 8 }),
    leavesAfterSeconds: Object.freeze({ given: () => '1800', fallback: () => 1800 }),
    bounds: { fewest: 1, most: 64 },
    queueCodeRidesABus: () => ({ id: 'queue-code-rides-a-bus', setting: 'MOLE_OFFICE_QUEUE_CODE_RIDES_A_BUS', position: '0' }),
  }),
  chosen: { entry: 'synthetic-driver', get workdir() { return f.work } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  readState: () => ({ integrated: { clone: f.clone, M: f.base, Cfinal: f.tip, ...(f.mode === 'integrated-build-red' ? { build: { passed: false, exit: 1, log: '/synthetic/integrate-build.log' } } : {}) }, landing: f.landing }), writeState: (value: any) => { f.landing = value.landing; return value }, log: (line: string) => { f.logged.push(line) },
  fail: (why: string) => { throw new Error(why) }, stamp: () => '2026-10-15 10:00:00',
}))
vi.mock('../tools/merge-tool/git.mjs', () => ({
  checkBeforeATool: () => {},
  git: (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(),
  tryGit: (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { ok: r.status === 0, stdout: r.stdout.trim() } },
  changedBetween: () => [], cleanEnvironment: () => ({ ...process.env }), linkNodeModules: () => {}, run: () => { throw new Error('Unexpected external command') },
  packageScripts: () => ({ ...(f.mode === 'no-build' ? {} : { build: 'synthetic build' }), test: 'synthetic tests' }),
}))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  // A landing, or a red suite, that finds main moved asks the lane for the emergency pushes that moved it (item 16):
  // those a case put in f.pushes.
  ask: async () => ({ status: 200, body: { lanes: [], emergencyPushes: f.pushes } }),
  theLane: async () => { throw new Error('Synthetic: theLane is not reached in this file') },
  sleep: async () => { throw new Error('Synthetic: sleep is not reached in this file') },
  theOfficesRuntime: async () => { throw new Error('Synthetic: theOfficesRuntime is not reached in this file') },
  countAGateMet: (...args: unknown[]) => f.counted(...args),
  theSandbox: async () => ({ name: 'synthetic', folder: f.folder }),
  acquireFullSuiteSeat: async () => ({ id: 'synthetic-seat', seat: 1 }), releaseSeat: async () => {},
  theRelatedTestsFirstSetting: async () => ({ on: false, says: 'synthetic setting off' }),
  keepTheReport: (path: string) => path,
  theOfficeHealthWhile: () => ({ stop: async () => ({ samples: 0, answered: 0, unanswered: 0, medianMs: null, maxMs: null, over10s: 0, everySeconds: 15 }) }),
  step: async (step: string, facts: any, detail: any) => { f.steps.push({ step, facts, detail }); return { step, facts, detail, state: step === 'landing' ? 'landing' : 'judged' } },
  runInSandbox: async (_sandbox: any, label: string, _command: string, args: string[], options: any) => {
    f.calls.push({ label, args, cwd: options.cwd })
    if (f.mode === 'pushed-while-testing' && label === 'suite') {
      // AN EMERGENCY PUSH MOVES MAIN WHILE THE SUITE RUNS: one commit on the main checkout, which the office lists as pushed.
      writeFileSync(join(f.root, 'pushed'), 'synthetic emergency fix'); git(f.root, 'add', '.'); git(f.root, 'commit', '-qm', 'Synthetic emergency fix')
      f.pushes = [{ id: 'synthetic-push', state: 'pushed', root: f.root, commit: git(f.root, 'rev-parse', 'HEAD') }]
    }
    const outFile = join(f.work, `${label}.log`)
    const report = args.find(arg => arg.startsWith('--outputFile.json='))?.slice('--outputFile.json='.length)
    const affected = label === 'fix-round-affected'
    const failed = affected ? f.mode === 'affected-red' : true
    const file = affected ? 'tests/affected.test.ts' : 'tests/unrelated.test.ts'
    const status = failed ? 'failed' : 'passed'
    const data = {
      success: !failed, numTotalTests: 1, numPassedTests: failed ? 0 : 1, numFailedTests: failed ? 1 : 0, numPendingTests: 0, numTodoTests: 0,
      testResults: [{ name: join(options.cwd, file), status, assertionResults: [{ fullName: 'synthetic observation', status }] }],
    }
    if (f.mode === 'partial' && !affected) data.numTotalTests = 2
    if (f.mode === 'missing-affected' && affected) data.testResults = []
    // Execute a command that writes the synthetic evidence, rather than inventing a helper return alone.
    const script = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(outFile)}, 'sandbox-start: started {}\\nsynthetic command\\n'); ${report === undefined || f.mode === 'no-report' ? '' : `fs.writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(JSON.stringify(data))});`}`
    execFileSync(process.execPath, ['-e', script], { cwd: options.cwd, timeout: 5000 })
    return { code: report === undefined ? (f.mode === 'build-red' ? 1 : 0) : (failed ? 1 : 0), outFile, timedOut: f.mode === 'cut-off' && !affected && report !== undefined, signal: null }
  },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ carryPastDocuments: (...args: any[]) => f.carried(...args), untilNoOtherLandingOf: async () => {}, theRecordCarriedForward: () => {}, aMoveOfOnlyDocuments: async () => null, theSuiteWorkers: () => ({ count: 1, said: null }), theReadsFile: () => '' }))
vi.mock('../tools/merge-tool/push.mjs', () => ({ pushLanded: () => { throw new Error('Unexpected push') } }))
vi.mock('../tools/merge-tool/pairs.mjs', () => ({
  aResultToBorrow: (...args: any[]) => f.borrowed(...args), aBusFor: async () => f.bus ?? { none: 'synthetic single entry' }, aCollisionNaming: async () => '',
  whatTheBusDecides: async () => ({ theseRed: [], aloneBuilt: true, testedWith: { entry: 'synthetic-rider', tree: f.bus.tree }, detail: { still: [] }, says: 'Synthetic unknown cause' }),
}))
vi.mock('../tools/merge-tool/plugin-lane.mjs', () => ({ thePluginOnlyChangeOf: () => null, testAPlugin: () => { throw new Error('Unexpected plugin') } }))
vi.mock('../tools/merge-tool/second-opinion.mjs', () => ({ aSecondOpinion: async ({ stillRed }: any) => ({ kept: stillRed, cleared: [], says: '' }) }))
vi.mock('../tools/merge-tool/cloud-suite-door.mjs', () => ({ aSuiteOnTheBoxOrHere: async ({ here }: any) => ({ ...await here(), where: 'here', wallSec: 0 }) }))
vi.mock('../tools/merge-tool/red-files.mjs', async importOriginal => ({
  ...await importOriginal<any>(),
  runAlone: async () => ({ red: false, noResult: null, log: '/synthetic/rerun.log', report: '/synthetic/rerun.json', lock: { file: null, sha256: null, says: 'no lock found' } }),
}))

const notReached = (name: string) => () => { throw new Error(`Synthetic: ${name} is not reached in this file`) }
/** The twelve functions landGit needs. */
const LANDING_NEEDS = {
  ask: officeKeeper.ask,
  countAGateMet: officeKeeper.countAGateMet,
  runInSandbox: officeKeeper.runInSandbox,
  step: officeKeeper.step,
  theSandbox: officeKeeper.theSandbox,
  theOfficesRuntime: notReached('theOfficesRuntime'),
  waitForHealth: notReached('waitForHealth'),
  conflictsAfterLanding: notReached('conflictsAfterLanding'),
  theLane: notReached('theLane'),
  sleep: notReached('sleep'),
  wholeSuiteFixRoundIsOn,
  pluginPagesPosition,
}

function git(cwd: string, ...args: string[]) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim() }
function fixture(mode = '') {
  f.folder = mkdtempSync(join(tmpdir(), 'whole-suite-red-fixture-'))
  f.root = join(f.folder, 'main'); f.clone = join(f.folder, 'entry'); f.trusted = join(f.folder, 'tool'); f.work = join(f.folder, 'logs')
  for (const dir of [f.root, f.work, join(f.trusted, 'tools')]) mkdirSync(dir, { recursive: true })
  git(f.root, 'init', '-q', '-b', 'main'); git(f.root, 'config', 'user.name', 'Synthetic fixture'); git(f.root, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(f.root, 'baseline'), 'synthetic baseline'); git(f.root, 'add', '.'); git(f.root, 'commit', '-qm', 'Synthetic base')
  f.base = git(f.root, 'rev-parse', 'HEAD')
  execFileSync('git', ['clone', '-q', '--no-hardlinks', f.root, f.clone])
  git(f.clone, 'config', 'user.name', 'Synthetic fixture'); git(f.clone, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(f.clone, 'change'), 'synthetic entry'); git(f.clone, 'add', '.'); git(f.clone, 'commit', '-qm', 'Synthetic entry')
  f.tip = git(f.clone, 'rev-parse', 'HEAD'); f.mode = mode; f.calls = []; f.steps = []; f.logged = []; f.pushes = []; f.bus = null; f.landing = null; f.carried.mockReset().mockResolvedValue({ entry: { state: 'judged' } })
  f.counted.mockReset().mockResolvedValue({counted: true})
  f.borrowed.mockReset().mockResolvedValue({ facts: { green: false, redTests: ['tests/unrelated.test.ts'], borrowedFrom: { entry: 'prior', tree: 'synthetic' }, log: '/synthetic/borrowed.log', tip: f.tip }, detail: {} })
  writeFileSync(join(f.trusted, 'tools', 'run-named-tests.mjs'), mode === 'refused-selection' ? 'process.exit(2)' : mode === 'empty-selection' ? '' : `console.log(${JSON.stringify(join(f.clone, 'tests/affected.test.ts'))})`)
  return { id: 'synthetic-driver', changeset: { adapter: 'git', root: f.root } }
}
afterEach(() => { delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']; if (f.folder) rmSync(f.folder, { recursive: true, force: true }) })

it('runs original exact-entry evidence instead of borrowing and preserves the observed suite red', async () => {
  const entry = fixture()
  const { testGit } = await import('../tools/merge-tool/testing.mjs')
  const off = await testGit(entry)
  expect(off.facts.borrowedFrom.entry).toBe('prior')
  expect(f.calls).toEqual([])
  expect(f.counted).not.toHaveBeenCalled()
  f.borrowed.mockClear()
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  const on = await testGit(entry)
  expect(f.borrowed).not.toHaveBeenCalled()
  expect(f.counted.mock.calls.filter(([id]) => id === 'whole-suite-fix-round')).toEqual([['whole-suite-fix-round', '1']])
  expect(f.counted).toHaveBeenCalledWith('related-tests-only', '0')
  expect(on.facts.green).toBe(false)
  expect(on.facts).not.toHaveProperty('borrowedFrom')
  expect(on.facts.wholeSuiteRed).toMatchObject({ outcome: 'admitted-for-fix-round', build: { tip: f.tip, tree: git(f.clone, 'rev-parse', 'HEAD^{tree}'), exit: 0 }, affected: { selection: 'complete', ran: 1, passed: 1 }, suite: { source: 'original', complete: true, exit: 1, redTests: ['tests/unrelated.test.ts'] } })
  expect(f.calls.map(one => one.label)).toContain('fix-round-affected')
  expect(f.calls.find(one => one.label === 'fix-round-affected').cwd).toBe(f.clone)
  expect(f.calls.find(one => one.label === 'suite').args).not.toContain('--exclude')
})

it('never admits missing failed refused or incomplete original evidence', async () => {
  const { testGit } = await import('../tools/merge-tool/testing.mjs')
  for (const mode of ['build-red', 'no-build', 'affected-red', 'refused-selection', 'empty-selection', 'missing-affected', 'partial', 'cut-off', 'no-report']) {
    const entry = fixture(mode)
    process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
    let result: any
    try { result = await testGit(entry) } catch (error) { expect(String(error)).toMatch(/result|report|complete|affected|build/i) }
    expect(result?.facts.wholeSuiteRed, mode).toBeUndefined()
    if (result !== undefined) expect(result.facts.green, mode).toBe(false)
    rmSync(f.folder, { recursive: true, force: true }); f.folder = ''
  }
})

it('keeps original bus prefix commits and unknown cause without inventing a receipt', async () => {
  const entry = fixture()
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  const busClone = join(f.folder, 'bus')
  execFileSync('git', ['clone', '-q', '--no-hardlinks', f.clone, busClone])
  git(busClone, 'config', 'user.name', 'Synthetic fixture'); git(busClone, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(busClone, 'rider'), 'synthetic rider'); git(busClone, 'add', '.'); git(busClone, 'commit', '-qm', 'Synthetic rider')
  const tip = git(busClone, 'rev-parse', 'HEAD'), tree = git(busClone, 'rev-parse', 'HEAD^{tree}')
  const b = { id: 'synthetic-rider', changeset: { commit: tip, base: f.tip } }
  f.bus = { b, riders: [{ b, T: tip, tree }], clone: busClone, T: tip, tree, passed: [], stopped: null, passedForACheck: [] }
  const { testGit } = await import('../tools/merge-tool/testing.mjs')
  const result = await testGit(entry)
  expect(result.facts.green).toBe(false)
  expect(result.facts.wholeSuiteRed.affected.tip).toBe(f.tip)
  expect(result.facts.wholeSuiteRed.suite).toMatchObject({ tip, tree })
  expect(result.facts.busCause).toEqual({ mainAt: f.base, suite: { commit: tip, tree }, order: [{ entry: entry.id, commit: f.tip, tree: git(f.clone, 'rev-parse', 'HEAD^{tree}'), commits: [f.tip] }, { entry: b.id, commit: tip, tree, commits: [tip] }], pairDecided: { still: [] } })
  expect(f.steps.map(one => one.step)).toEqual(['tested'])
})


it('retests admitted red after main moves while preserving the ordinary document carry', async () => {
  const entry = fixture()
  writeFileSync(join(f.root, 'document'), 'synthetic document'); git(f.root, 'add', '.'); git(f.root, 'commit', '-qm', 'Synthetic document landing')
  const { landGit: landGitFixture } = await import('../tools/merge-tool/land.mjs')
  const landGit = (entry: any) => landGitFixture(entry, { replayOnly: true, ...LANDING_NEEDS })
  const redEntry = { ...entry, state: 'testing', machine: { tested: { green: false, wholeSuiteRed: { outcome: 'admitted-for-fix-round' } } } }
  delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
  await landGit(redEntry)
  expect(f.carried).toHaveBeenCalledTimes(1)
  f.carried.mockClear()
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  await landGit({ ...redEntry, machine: { tested: { green: true } } })
  expect(f.carried).toHaveBeenCalledTimes(1)
  f.carried.mockClear()
  const moved = await landGit(redEntry)
  expect(f.carried).not.toHaveBeenCalled()
  expect(moved.step).toBe('main-moved')
  expect(f.steps.map(one => one.step)).toEqual(['landing', 'main-moved'])
})

it('lets the actual merger loop advance an authorized red and preserves its disabled and exact-tip checks', async () => {
  const entry = fixture()
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  const { testGit } = await import('../tools/merge-tool/testing.mjs')
  const tested = (await testGit(entry)).facts
  const helperPath = '../src/config/whole-suite-red.mjs'
  const { mergeTestsAuthorizeLanding } = await import(helperPath)
  const source = readFileSync(fileURLToPath(new URL('../tools/the-merger.mjs', import.meta.url)), 'utf8')
  const start = source.indexOf('function testedGreenOnWhatIsHeld(')
  const code = source.slice(start, source.indexOf('\n}', start) + 2)
  // Execute the actual named function without starting the tool's process cleanup or main loop.
  const held = new Function('mergeTestsAuthorizeLanding', 'readState', `${code}; return testedGreenOnWhatIsHeld`)(mergeTestsAuthorizeLanding, () => ({ integrated: { Cfinal: f.tip } }))
  const reading = { ...entry, machine: { tested } }
  expect(held(reading)).toBe(true)
  expect(held({ ...reading, machine: { tested: { ...tested, tip: 'wrong' } } })).toBe(false)
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '0'
  expect(held(reading)).toBe(false)
  expect(held({ ...reading, machine: { tested: { green: true, tip: f.tip } } })).toBe(true)
})

it('counts the off position once when its own whole suite is red', async () => {
  const entry = fixture()
  f.borrowed.mockResolvedValue(null)
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '0'
  const {testGit} = await import('../tools/merge-tool/testing.mjs')
  await testGit(entry)
  expect(f.counted.mock.calls.filter(([id]) => id === 'whole-suite-fix-round')).toEqual([['whole-suite-fix-round', '0']])
  expect(f.counted).toHaveBeenCalledWith('related-tests-only', '0')
})

// AN INTEGRATED TREE THAT DID NOT BUILD, let go on by the integrated-tree-builds gate at off (wave 13r round L), is red
// here on the build the integrate step ran. Nothing is built, run or borrowed again, and no fix round can take it.
// Mutation: drop the carried build from testGit, and the tree is built and tested again, or a pair's result is borrowed.
it('reports the build the integrate step found red as red, and builds, runs and borrows nothing', async () => {
  for (const fixRound of ['0', '1']) {
    const entry = fixture('integrated-build-red')
    process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = fixRound
    const {testGit} = await import('../tools/merge-tool/testing.mjs')
    const result = await testGit(entry)
    expect(result.step, fixRound).toBe('tested')
    expect(result.facts, fixRound).toMatchObject({green: false, build: {passed: false}, redTests: ['npm run build'], log: '/synthetic/integrate-build.log', tip: f.tip})
    expect(result.facts.says, fixRound).toContain('integrated-tree-builds')
    expect(result.facts.wholeSuiteRed, fixRound).toBeUndefined()
    expect(f.calls, fixRound).toEqual([])
    expect(f.borrowed, fixRound).not.toHaveBeenCalled()
    rmSync(f.folder, { recursive: true, force: true }); f.folder = ''
  }
})

it('names in the log the emergency push that moved main while the red suite ran, in the words a landing writes', async () => {
  const entry = fixture('pushed-while-testing')
  f.borrowed.mockResolvedValue(null)
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '0'
  const { testGit } = await import('../tools/merge-tool/testing.mjs')
  const moved = await testGit(entry)
  expect(moved.step).toBe('main-moved-while-testing')
  const [push] = f.pushes
  expect(push.commit).not.toBe(f.base)
  expect(f.logged.filter(line => line.includes(`emergency push ${push.id} moved main to ${push.commit}`))).toHaveLength(1)
})
