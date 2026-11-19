// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALLED PACKAGE LOCK IS KEPT BESIDE EACH RUN. A file red in the whole suite and green alone may have run on
 * different packages, and nothing the merge queue kept said which packages each run had. Now the merge tool keeps,
 * beside each run alone and each suite run, the sha256 of the installed package lock where that run ran:
 * node_modules/.package-lock.json when it is there, and otherwise the package-lock.json the install used. A place with
 * neither keeps "no lock found", never an empty hash. When a file is red in the suite and green alone, the entry's
 * words say whether the two runs had the same installed packages. A suite on the cloud box keeps the lock the box's
 * answer gives (tools/cloud-suite.criteria.md, criterion 23), and otherwise the commit's package-lock.json, read here.
 * The related tests, run first when the office's setting is on, keep their lock too, and the log line of a file red
 * there and green alone says whether the two runs had the same installed packages.
 * Each lock also says where it was read: here, with the path of the file read, or on the cloud box, after an npm ci of
 * the commit's package-lock.json. The words that compare two locks name both places, since two hashes read on two
 * machines can differ for a reason that is not the packages.
 * Two locks are compared by their packages: the sha256 of the lock without the root's own name and version, at its
 * top and in its "" entry, so a bump of the root's version alone is not a different install. A suite on the cloud box
 * compares the hash of its packages its answer gives as installedPackages. An answer that gives
 * installedPackagesUnread in its place says why the box could not make it, and one with installedLock and neither is
 * from before the box gave it: neither is compared.
 * The lock is evidence and decides nothing: what lands and what bounces is unchanged.
 *
 * EVERY LOCK, TREE, SUITE AND RUN HERE IS MADE UP. The runs alone are real calls of runAlone through
 * tests/stand-in-sandbox-tool.mjs, whose test command is a small report writer. The door is the merge tool's own,
 * calling tests/stand-in-cloud-suite-door.mjs. The suites are the real testGit, with the sandbox, the office and the
 * door stood in for as in tests/the-whole-suite-red-gate.test.ts. The related tests' list comes from a made-up
 * run-named-tests.mjs in the made-up tool folder, which names the one made-up test file.
 *
 * MUTATION PROOF (logs named in the report of the run that added each case), each alone after a green control:
 *   - node_modules/.package-lock.json is not read: cases 1, 2, 7 and 8 go red;
 *   - the lockfile read is the tree's own, not the one beside the install: case 3 goes red;
 *   - a place with no lock keeps an empty hash: cases 4 and 11 go red;
 *   - the door drops the box's installed lock: case 5 goes red;
 *   - the door takes an installed lock that is not a sha256: case 6 goes red;
 *   - the suite's lock leaves out the one the box answered: case 9 goes red;
 *   - the entry's words say "the same" whatever the hashes: case 8 goes red;
 *   - the suite keeps no lock: cases 7, 9, 10 and 11 go red;
 *   - the entry's words leave out whether the packages were the same: cases 7 to 11 go red;
 *   - the related tests keep no lock: case 12 goes red;
 *   - the log line of a file red in the related tests and green alone leaves out the comparison: case 12 goes red;
 *   - that line compares the run alone's lock with itself, not with the related tests' lock: case 12 goes red;
 *   - a lock does not say where it was read: cases 13 to 17 go red;
 *   - a lock read here names the tree's node_modules, not the file read after its links: case 13 goes red;
 *   - the words that compare two locks leave out where each was read: cases 10 and 14 to 17 go red;
 *   - the part hashed keeps the root's version at its top: cases 18 and 20 go red;
 *   - the part hashed keeps the root's name and version in the "" entry: case 20 goes red;
 *   - two locks are compared by the whole file's sha256, not by their packages: cases 18 and 20 go red;
 *   - the box's lock leaves out the installedPackages its answer gives: cases 9 and 14 go red;
 *   - an answer with no installedPackages takes its installedLock as its packages: cases 21 and 24 go red;
 *   - the door drops installedPackages, or takes one that is not a sha256: case 22 goes red;
 *   - the door drops installedPackagesUnread, or takes one with no words in it: case 23 goes red;
 *   - the words leave out the reason the box could not hash its packages: case 24 goes red.
 *
 * Where a lock was read is read from LOCK_READ in tools/merge-tool/installed-lock.mjs, which builds those words, and
 * the words that compare two locks are held to naming both places, the run's first. The run alone's place is this
 * file's own made-up words.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const REPO = join(import.meta.dirname, '..')
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
/** Made-up locks, as npm writes them: two installs of different packages, and the lockfile of a third. */
const LOCK_ONE = '{"name":"made-up","lockfileVersion":3,"packages":{"node_modules/made-up-one":{"version":"1.0.0"}}}\n'
const LOCK_TWO = '{"name":"made-up","lockfileVersion":3,"packages":{"node_modules/made-up-one":{"version":"2.0.0"}}}\n'
const LOCKFILE = '{"name":"made-up","lockfileVersion":3,"packages":{"":{"name":"made-up"},"node_modules/made-up-one":{"version":"1.0.0"}}}\n'
const INSTALLED = 'node_modules/.package-lock.json'
/** A made-up installed lock whose root has its own name and version, beside one made-up package at a version. */
const ROOT_AT = (name: string, version: string, made: string) => `{"name":"${name}","version":"${version}","lockfileVersion":3,"requires":true,"packages":{"node_modules/made-up-one":{"version":"${made}"}}}\n`
/** A made-up package-lock.json, whose "" entry also holds the root's name and version. */
const LOCKFILE_AT = (version: string, made: string) => `{"name":"made-up","version":"${version}","lockfileVersion":3,"requires":true,"packages":{"":{"name":"made-up","version":"${version}"},"node_modules/made-up-one":{"version":"${made}"}}}\n`

type Lock = { file: string | null; sha256: string | null; packages?: string | null; says?: string; readAt?: string }

/** Where a lock was read, as tools/merge-tool/installed-lock.mjs exports the words in LOCK_READ. */
interface TheLockPlaces {
  here(file: string): string
  hereInTheCommitTheBoxRan(file: string): string
  onTheBox: string
}
let READ: TheLockPlaces
/** The part of a lock its packages are hashed from, and the words of a box answer from before it gave that hash. */
let INSTALLED_PART: ((text: string) => string) | undefined
let FROM_BEFORE: string | undefined
beforeAll(async () => {
  // READ BY NAME, so this file says the export is missing rather than failing to load.
  const lib: object = await import('../tools/merge-tool/installed-lock.mjs')
  const read: unknown = Reflect.get(lib, 'LOCK_READ')
  if (typeof read !== 'object' || read === null) throw new Error('tools/merge-tool/installed-lock.mjs exports no LOCK_READ, so the places this file checks cannot be read.')
  READ = read as TheLockPlaces
  const part: unknown = Reflect.get(lib, 'theInstalledPart')
  INSTALLED_PART = typeof part === 'function' ? (part as (text: string) => string) : undefined
  const before: unknown = Reflect.get(lib, 'FROM_BEFORE_THE_PACKAGES')
  FROM_BEFORE = typeof before === 'string' ? before : undefined
})

/** The sha256 of a lock's packages, from the part tools/merge-tool/installed-lock.mjs hashes, so a made-up run can give it. */
function packagesOf(text: string): string {
  if (INSTALLED_PART === undefined) throw new Error("tools/merge-tool/installed-lock.mjs exports no theInstalledPart, so the hash of a lock's packages cannot be made.")
  return sha256(INSTALLED_PART(text))
}

/** Where this file says the run alone read its lock: made-up words, which the comparison carries as they are. */
const ALONE_READ_AT = 'MADE-UP: where the run alone of this test read its lock'

/** The words name where the run read its lock, and after it where the run alone read its own. */
function namesBothPlaces(words: string, inTheRun: string): void {
  const run = words.indexOf(inTheRun)
  expect(run, `the words do not name where the run read its lock, ${inTheRun}: ${words}`).toBeGreaterThan(-1)
  expect(words.indexOf(ALONE_READ_AT, run + inTheRun.length), `the words do not name, after it, where the run alone read its lock: ${words}`).toBeGreaterThan(-1)
}

// ---------------------------------------------------------------------------------------------------------------------
// The testGit stand-ins, hoisted for the whole file. The runs alone of cases 1 to 4 are in a process of their own, and
// the door of cases 5 and 6 is the real one, read past its stand-in below.
const f = vi.hoisted(() => ({ folder: '', clone: '', root: '', trusted: '', work: '', tip: '', base: '', alone: null as any, door: 'here' as 'here' | 'box', boxLock: undefined as string | undefined, boxPackages: undefined as string | undefined, boxUnread: undefined as string | undefined, related: false, steps: [] as any[], logged: [] as string[] }))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
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
  readState: () => ({ integrated: { clone: f.clone, M: f.base, Cfinal: f.tip }, landing: null }), writeState: (value: any) => value, log: (line: string) => { f.logged.push(line) },
  fail: (why: string) => { throw new Error(why) }, stamp: () => '2026-11-01 10:00:00',
}))
vi.mock('../tools/merge-tool/git.mjs', () => ({
  checkBeforeATool: () => {},
  git: (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(),
  tryGit: (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { ok: r.status === 0, stdout: r.stdout.trim() } },
  changedBetween: () => [], cleanEnvironment: () => ({ ...process.env }), linkNodeModules: () => {}, run: () => { throw new Error('Unexpected external command') },
  packageScripts: () => ({ build: 'synthetic build', test: 'synthetic tests' }),
}))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  ask: async () => ({ status: 200, body: { lanes: [], emergencyPushes: [] } }),
  countAGateMet: async () => ({ counted: true }),
  theLane: async () => { throw new Error('Synthetic: theLane is not reached in this file') },
  sleep: async () => { throw new Error('Synthetic: sleep is not reached in this file') },
  theOfficesRuntime: async () => { throw new Error('Synthetic: theOfficesRuntime is not reached in this file') },
  theSandbox: async () => ({ name: 'synthetic', folder: f.folder }),
  acquireFullSuiteSeat: async () => ({ id: 'synthetic-seat', seat: 1 }), releaseSeat: async () => {},
  theRelatedTestsFirstSetting: async () => (f.related ? { on: true, leaveOutSlowerThanSeconds: null, says: 'synthetic setting on' } : { on: false, says: 'synthetic setting off' }),
  keepTheReport: (path: string) => path,
  theOfficeHealthWhile: () => ({ stop: async () => ({ samples: 0, answered: 0, unanswered: 0, medianMs: null, maxMs: null, over10s: 0, everySeconds: 15 }) }),
  step: async (step: string, facts: any, detail: any) => { f.steps.push({ step, facts, detail }); return { step, facts, detail, state: 'judged' } },
  // A BUILD WRITES NO REPORT, AND THE SUITE ONE OF ONE RED FILE, by a command that writes that made-up report.
  runInSandbox: async (_sandbox: any, label: string, _command: string, args: string[], options: any) => {
    const outFile = join(f.work, `${label}.log`)
    const report = args.find(arg => arg.startsWith('--outputFile.json='))?.slice('--outputFile.json='.length)
    const data = { numTotalTests: 1, numPassedTests: 0, numFailedTests: 1, testResults: [{ name: join(options.cwd, 'tests/made-up.test.ts'), status: 'failed', assertionResults: [{ fullName: 'synthetic observation', status: 'failed' }] }] }
    execFileSync(process.execPath, ['-e', `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(outFile)}, 'sandbox-start: started {}\\nsynthetic command\\n'); ${report === undefined ? '' : `fs.writeFileSync(${JSON.stringify(report)}, ${JSON.stringify(JSON.stringify(data))});`}`], { cwd: options.cwd, timeout: 5000 })
    return { code: report === undefined ? 0 : 1, outFile, timedOut: false, signal: null }
  },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ carryPastDocuments: async () => ({ entry: { state: 'judged' } }), untilNoOtherLandingOf: async () => {}, theRecordCarriedForward: () => {}, aMoveOfOnlyDocuments: async () => null, theSuiteWorkers: () => ({ count: 1, said: null }), theReadsFile: () => '' }))
vi.mock('../tools/merge-tool/push.mjs', () => ({ pushLanded: () => { throw new Error('Unexpected push') } }))
vi.mock('../tools/merge-tool/pairs.mjs', () => ({ aResultToBorrow: async () => null, aBusFor: async () => ({ none: 'synthetic single entry' }), aCollisionNaming: async () => '' }))
vi.mock('../tools/merge-tool/plugin-lane.mjs', () => ({ thePluginOnlyChangeOf: () => null, testAPlugin: () => { throw new Error('Unexpected plugin') } }))
vi.mock('../tools/merge-tool/second-opinion.mjs', () => ({ aSecondOpinion: async ({ stillRed }: any) => ({ kept: stillRed, cleared: [], says: '' }) }))
// THE SUITE RUNS HERE, or "on the box", which hands back its run with the box's answer as the door would.
vi.mock('../tools/merge-tool/cloud-suite-door.mjs', () => ({
  aSuiteOnTheBoxOrHere: async ({ here }: any) => {
    const ran = await here()
    return f.door === 'here' ? { ...ran, where: 'here', wallSec: 0 } : { ...ran, where: 'box', wallSec: 0, box: { ran: true, wallSec: 0, workers: 7, doorLog: '/synthetic/door.log', ...(f.boxLock === undefined ? {} : { installedLock: f.boxLock }), ...(f.boxPackages === undefined ? {} : { installedPackages: f.boxPackages }), ...(f.boxUnread === undefined ? {} : { installedPackagesUnread: f.boxUnread }) } }
  },
}))
vi.mock('../tools/merge-tool/red-files.mjs', async importOriginal => ({
  ...await importOriginal<any>(),
  runAlone: async () => ({ red: false, absent: false, noResult: null, log: '/synthetic/rerun.log', report: '/synthetic/rerun.json', lock: f.alone }),
}))

// ---------------------------------------------------------------------------------------------------------------------
describe('a run alone keeps the installed lock of the tree it ran in', () => {
  let runs: Record<string, { red: boolean | null; noResult: string | null; lock: Lock }> = {}
  const folder = mkdtempSync(join(tmpdir(), 'installed-lock-alone-'))

  beforeAll(() => {
    const sandboxes = join(folder, 'sandboxes')
    const instance = join(sandboxes, 'synthetic-lock')
    const logs = join(folder, 'logs')
    mkdirSync(instance, { recursive: true }); mkdirSync(logs)
    writeFileSync(join(instance, 'instance.json'), JSON.stringify({ running: true, template: 'synthetic', from: folder }))
    // A MADE-UP INSTALL OUTSIDE THE SANDBOX, as the host checkout's is: its node_modules has no installed lock, and its
    // lockfile is the one that install used.
    const install = join(folder, 'install')
    mkdirSync(join(install, 'node_modules'), { recursive: true })
    writeFileSync(join(install, 'package-lock.json'), LOCKFILE)
    const trees: Record<string, (tree: string) => void> = {
      'lock-one': (tree) => { mkdirSync(join(tree, 'node_modules')); writeFileSync(join(tree, INSTALLED), LOCK_ONE) },
      'lock-one-again': (tree) => { mkdirSync(join(tree, 'node_modules')); writeFileSync(join(tree, INSTALLED), LOCK_ONE) },
      'lock-two': (tree) => { mkdirSync(join(tree, 'node_modules')); writeFileSync(join(tree, INSTALLED), LOCK_TWO) },
      // ITS OWN package-lock.json differs from the install's, so the hash says which of the two was read.
      'linked-install': (tree) => { symlinkSync(join(install, 'node_modules'), join(tree, 'node_modules')); writeFileSync(join(tree, 'package-lock.json'), LOCK_TWO) },
      'no-node-modules': (tree) => { writeFileSync(join(tree, 'package-lock.json'), LOCK_TWO) },
      'empty-node-modules': (tree) => { mkdirSync(join(tree, 'node_modules')) },
    }
    for (const [name, make] of Object.entries(trees)) {
      const tree = join(instance, name)
      mkdirSync(tree)
      writeFileSync(join(tree, 'tests.test.ts'), '// Made-up test name.\n')
      writeFileSync(join(tree, 'package.json'), JSON.stringify({ scripts: { test: 'node report.cjs' } }))
      // THE TEST COMMAND WRITES A GREEN REPORT OF THE ONE FILE, and runs nothing.
      writeFileSync(join(tree, 'report.cjs'), `const fs=require('node:fs'),path=require('node:path');
const report=process.argv.find(a=>a.startsWith('--outputFile.json='));
fs.writeFileSync(report.slice('--outputFile.json='.length),JSON.stringify({numTotalTests:1,numPassedTests:1,numFailedTests:0,testResults:[{name:path.resolve('tests.test.ts'),status:'passed',assertionResults:[{status:'passed'}]}]}));
`)
      make(tree)
    }
    const driver = join(folder, 'driver.mjs')
    writeFileSync(driver, `import {runAlone} from ${JSON.stringify(join(REPO, 'tools/merge-tool/red-files.mjs'))};
import {keepTheReport,runInSandbox} from ${JSON.stringify(join(REPO, 'tools/merge-tool/office-keeper.mjs'))};
const runs={};
for (const name of ${JSON.stringify(Object.keys(trees))}) {
  const tree=${JSON.stringify(instance)}+'/'+name;
  runs[name]=await runAlone({name:'synthetic-lock'},tree,'tests.test.ts','alone-'+name,tree,{noResult:'answer',runInSandbox,keepTheReport});
}
console.log('RESULT '+JSON.stringify(runs));
`)
    const output = execFileSync(process.execPath, [driver, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--workdir', logs, '--sandboxes', sandboxes, '--sandbox-tool', join(REPO, 'tests/stand-in-sandbox-tool.mjs'), '--api', 'http://127.0.0.1:1'], { encoding: 'utf8', timeout: 50_000, env: { ...process.env, MOLE_OFFICE_API: '', MOLE_AGENT_KEY: '' } })
    runs = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT '))!.slice(7))
  }, 60_000)
  afterAll(() => { rmSync(folder, { recursive: true, force: true }) })

  it('1: keeps the sha256 of node_modules/.package-lock.json when the tree has it', () => {
    for (const run of Object.values(runs)) expect(run.noResult, 'every made-up run alone gave a result').toBeNull()
    expect(runs['lock-one']!.red).toBe(false)
    expect(runs['lock-one']!.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_ONE) })
  })

  it('2: two places with the same installed packages keep the same hash, and different packages a different one', () => {
    expect(runs['lock-one-again']!.lock).toMatchObject({ file: INSTALLED, sha256: runs['lock-one']!.lock.sha256 })
    expect(runs['lock-two']!.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_TWO) })
    expect(runs['lock-two']!.lock.sha256).not.toBe(runs['lock-one']!.lock.sha256)
  })

  it('3: with no installed lock, keeps the lockfile the install used, beside the node_modules the tree links to', () => {
    expect(runs['linked-install']!.lock).toMatchObject({ file: 'package-lock.json', sha256: sha256(LOCKFILE) })
  })

  it('4: a place with no lock keeps "no lock found", never an empty hash', () => {
    for (const name of ['no-node-modules', 'empty-node-modules']) {
      const lock = runs[name]!.lock
      expect(lock, name).toMatchObject({ says: 'no lock found' })
      expect(lock.sha256, `${name}: no hash at all, and not an empty one`).toBeNull()
    }
  })

  it('13: says where it read each lock, with the path of the file it read after the links', () => {
    const real = realpathSync(folder)
    expect(runs['lock-one']!.lock).toMatchObject({ readAt: READ.here(join(real, 'sandboxes', 'synthetic-lock', 'lock-one', INSTALLED)) })
    expect(runs['linked-install']!.lock).toMatchObject({ readAt: READ.here(join(real, 'install', 'package-lock.json')) })
    expect(runs['no-node-modules']!.lock, 'a place with no lock read nothing anywhere').not.toHaveProperty('readAt')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the door keeps the installed lock the box answered', () => {
  let root = ''
  afterEach(() => { if (root !== '') rmSync(root, { recursive: true, force: true }); root = '' })

  /** The merge tool's real door, given the stand-in door and an installed lock for its answer, or none, its packages' hash, and why it could not make that hash. */
  async function aSuiteOnTheBox(installedLock: string | undefined, installedPackages?: string, unread?: string) {
    const { aSuiteOnTheBoxOrHere } = await vi.importActual<any>('../tools/merge-tool/cloud-suite-door.mjs')
    root = mkdtempSync(join(tmpdir(), 'installed-lock-door-'))
    for (const folder of ['clone', 'reports']) mkdirSync(join(root, folder))
    const env = { PATH: String(process.env['PATH']), HOME: join(root, 'home'), STAND_IN_DOOR_DOES: 'green', ...(installedLock === undefined ? {} : { STAND_IN_DOOR_INSTALLED_LOCK: installedLock }), ...(installedPackages === undefined ? {} : { STAND_IN_DOOR_INSTALLED_PACKAGES: installedPackages }), ...(unread === undefined ? {} : { STAND_IN_DOOR_INSTALLED_PACKAGES_UNREAD: unread }) }
    const lines: string[] = []
    let ranHere = false
    const ran = await aSuiteOnTheBoxOrHere({
      label: 'suite',
      box: { clone: join(root, 'clone'), commit: 'd'.repeat(40), report: join(root, 'reports', 'suite.json'), reads: join(root, 'reports', 'suite-reads'), suiteLog: join(root, 'reports', 'suite.log'), timeoutSec: 10800 },
      here: () => { ranHere = true; writeFileSync(join(root, 'here.log'), 'made-up run here\n'); return Promise.resolve({ code: 0, signal: null, timedOut: false, stoppedReason: null, outFile: join(root, 'here.log') }) },
      hereIs: 'in sandbox made-up-sandbox',
      door: join(REPO, 'tests', 'stand-in-cloud-suite-door.mjs'),
      theRealDoor: join(REPO, 'tools', 'cloud-suite.mjs'),
      run: (label: string, command: string, args: string[], { cwd }: { cwd: string }) => {
        const outFile = join(root, `${label}.log`)
        const done = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 10_000 })
        writeFileSync(outFile, `${done.stdout}${done.stderr}`)
        return Promise.resolve({ code: done.status, signal: done.signal, timedOut: false, stoppedReason: null, outFile })
      },
      log: (line: string) => lines.push(line),
      keepTheLog: (file: string) => { const kept = join(root, 'kept-suite.log'); copyFileSync(file, kept); return kept },
      env: {},
    })
    return { ran, lines, ranHere }
  }

  it('5: a suite on the box keeps the installedLock its answer gives', async () => {
    const { ran, ranHere } = await aSuiteOnTheBox(sha256(LOCK_ONE))
    expect(ranHere).toBe(false)
    expect(ran).toMatchObject({ where: 'box', box: { ran: true, installedLock: sha256(LOCK_ONE) } })
  })

  it('6: an answer with no installedLock keeps none, and one that is not a sha256 is not taken as the box\'s run', async () => {
    const none = await aSuiteOnTheBox(undefined)
    expect(none.ran).toMatchObject({ where: 'box', box: { ran: true } })
    expect(none.ran.box).not.toHaveProperty('installedLock')
    rmSync(root, { recursive: true, force: true })
    const wrong = await aSuiteOnTheBox('made-up-not-a-sha256')
    expect(wrong.ranHere, 'the suite ran here instead').toBe(true)
    expect(wrong.ran.where).toBe('here')
    expect(wrong.lines.join('\n')).toContain('installedLock')
  })

  it('22: a suite on the box keeps the installedPackages its answer gives, and one that is not a sha256 is not taken as the box\'s run', async () => {
    const kept = await aSuiteOnTheBox(sha256(LOCK_ONE), packagesOf(LOCK_ONE))
    expect(kept.ranHere).toBe(false)
    expect(kept.ran).toMatchObject({ where: 'box', box: { ran: true, installedLock: sha256(LOCK_ONE), installedPackages: packagesOf(LOCK_ONE) } })
    rmSync(root, { recursive: true, force: true })
    const wrong = await aSuiteOnTheBox(sha256(LOCK_ONE), 'made-up-not-a-sha256')
    expect(wrong.ranHere, 'the suite ran here instead').toBe(true)
    expect(wrong.ran.where).toBe('here')
    expect(wrong.lines.join('\n')).toContain('installedPackages')
  })

  it('23: a suite on the box keeps the installedPackagesUnread its answer gives, and one with no words in it is not taken as the box\'s run', async () => {
    const kept = await aSuiteOnTheBox(sha256(LOCK_ONE), undefined, 'MADE-UP: the reason the box could not hash its packages')
    expect(kept.ranHere).toBe(false)
    expect(kept.ran).toMatchObject({ where: 'box', box: { ran: true, installedLock: sha256(LOCK_ONE), installedPackagesUnread: 'MADE-UP: the reason the box could not hash its packages' } })
    rmSync(root, { recursive: true, force: true })
    const wrong = await aSuiteOnTheBox(sha256(LOCK_ONE), undefined, ' ')
    expect(wrong.ranHere, 'the suite ran here instead').toBe(true)
    expect(wrong.lines.join('\n')).toContain('installedPackagesUnread')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('the suite keeps its lock, and the entry says whether it and the run alone had the same packages', () => {
  function git(cwd: string, ...args: string[]) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim() }
  /**
   * A made-up entry on a made-up main, whose clone has `installed` as node_modules/.package-lock.json, or no node_modules.
   * With `related`, the office's setting has the related tests run first, and their list names the one made-up file.
   */
  function anEntry(installed: string | null, { door = 'here', boxLock, boxPackages, boxUnread, related = false }: { door?: 'here' | 'box'; boxLock?: string; boxPackages?: string; boxUnread?: string; related?: boolean } = {}) {
    f.folder = mkdtempSync(join(tmpdir(), 'installed-lock-suite-'))
    f.root = join(f.folder, 'main'); f.clone = join(f.folder, 'entry'); f.trusted = join(f.folder, 'tool'); f.work = join(f.folder, 'logs')
    for (const dir of [f.root, f.work, join(f.trusted, 'tools')]) mkdirSync(dir, { recursive: true })
    git(f.root, 'init', '-q', '-b', 'main'); git(f.root, 'config', 'user.name', 'Synthetic fixture'); git(f.root, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(f.root, 'package-lock.json'), LOCKFILE); git(f.root, 'add', '.'); git(f.root, 'commit', '-qm', 'Synthetic base')
    f.base = git(f.root, 'rev-parse', 'HEAD')
    execFileSync('git', ['clone', '-q', '--no-hardlinks', f.root, f.clone])
    git(f.clone, 'config', 'user.name', 'Synthetic fixture'); git(f.clone, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(f.clone, 'change'), 'synthetic entry'); git(f.clone, 'add', '.'); git(f.clone, 'commit', '-qm', 'Synthetic entry')
    f.tip = git(f.clone, 'rev-parse', 'HEAD')
    if (installed !== null) { mkdirSync(join(f.clone, 'node_modules')); writeFileSync(join(f.clone, INSTALLED), installed) }
    if (related) writeFileSync(join(f.trusted, 'tools', 'run-named-tests.mjs'), "console.log('tests/made-up.test.ts')\n")
    f.door = door; f.boxLock = boxLock; f.boxPackages = boxPackages; f.boxUnread = boxUnread; f.related = related; f.steps = []; f.logged = []
    return { id: 'synthetic-driver', changeset: { adapter: 'git', root: f.root } }
  }
  /** What the tested step says, and the evidence it keeps, of a suite red in one file that is green alone. */
  async function tested(entry: object, alone: Lock) {
    f.alone = alone
    const { testGit } = await import('../tools/merge-tool/testing.mjs')
    const result = await testGit(entry)
    expect(result.facts.green, 'a file red in the suite and green alone passes, as before').toBe(true)
    const step = f.steps.find(one => one.step === 'tested')
    return { says: String(step.facts.says), detail: step.detail }
  }
  const aloneWith = (text: string): Lock => ({ file: INSTALLED, sha256: sha256(text), packages: packagesOf(text), readAt: ALONE_READ_AT })
  // THE TWO QUEUE SETTINGS AT THEIR DEFAULTS, said here, so a value in the environment cannot take another path.
  const SETTINGS = ['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', 'MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY']
  beforeEach(() => { for (const name of SETTINGS) process.env[name] = '0' })
  afterEach(() => { for (const name of SETTINGS) delete process.env[name]; if (f.folder) rmSync(f.folder, { recursive: true, force: true }); f.folder = '' })

  it('7: the suite keeps its own lock beside its log, each run alone its lock, and the same packages are said to be the same', async () => {
    const { says, detail } = await tested(anEntry(LOCK_ONE), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_ONE) })
    expect(detail.red).toEqual([expect.objectContaining({ file: 'tests/made-up.test.ts', alone: 'green', lock: aloneWith(LOCK_ONE) })])
    expect(says).toContain('tests/made-up.test.ts green alone (load ')
    expect(says).toContain('the suite and the run alone had the same installed packages')
    expect(says).toContain(packagesOf(LOCK_ONE).slice(0, 16))
  })

  it('8: different installed packages are said to be different, with both hashes', async () => {
    const { says } = await tested(anEntry(LOCK_ONE), aloneWith(LOCK_TWO))
    expect(says).toContain('the suite and the run alone had different installed packages')
    expect(says).toContain(packagesOf(LOCK_ONE).slice(0, 16))
    expect(says).toContain(packagesOf(LOCK_TWO).slice(0, 16))
    expect(says).not.toContain('the same installed packages')
  })

  it('9: a suite on the box keeps the lock the box answered, and compares it with the run alone\'s', async () => {
    const { says, detail } = await tested(anEntry(LOCK_TWO, { door: 'box', boxLock: sha256(LOCK_ONE), boxPackages: packagesOf(LOCK_ONE) }), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_ONE) })
    expect(says).toContain('on the cloud box')
    expect(says).toContain('the suite and the run alone had the same installed packages')
  })

  it('10: a box that gave no lock keeps the commit\'s package-lock.json, read here, which cannot be compared with an installed lock', async () => {
    const { says, detail } = await tested(anEntry(LOCK_ONE, { door: 'box' }), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ file: 'package-lock.json', sha256: sha256(LOCKFILE) })
    expect(says).toContain('read here')
    expect(says).toContain('cannot be compared')
    expect(says).not.toContain('the same installed packages')
  })

  it('11: a suite where no lock is found keeps "no lock found", never an empty hash, and its words say so', async () => {
    const { says, detail } = await tested(anEntry(null), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ says: 'no lock found' })
    expect(detail.ran.test.lock.sha256).toBeNull()
    expect(says).toContain('no lock found')
    expect(says).toContain('cannot be compared')
  })

  it('12: the related tests keep their lock beside their log, and a file red there and green alone is compared with it', async () => {
    const { detail } = await tested(anEntry(LOCK_ONE, { related: true }), aloneWith(LOCK_TWO))
    expect(detail.ran.related).toMatchObject({ files: 1, lock: { file: INSTALLED, sha256: sha256(LOCK_ONE) } })
    const rerun = f.logged.filter(line => line.startsWith('tests/made-up.test.ts, red in the related tests, is green alone'))
    expect(rerun, 'the related tests ran first, and their one red file was run again alone').toHaveLength(1)
    expect(rerun[0]).toContain('the related tests and the run alone had different installed packages')
    expect(rerun[0]).toContain(`sha256 ${packagesOf(LOCK_ONE).slice(0, 16)} in the related tests and ${packagesOf(LOCK_TWO).slice(0, 16)} alone`)
  })

  it('14: a suite on the cloud box says its lock was read there, and the run alone\'s where it was read here', async () => {
    const { says } = await tested(anEntry(LOCK_TWO, { door: 'box', boxLock: sha256(LOCK_ONE), boxPackages: packagesOf(LOCK_ONE) }), aloneWith(LOCK_ONE))
    expect(says).toContain('the suite and the run alone had the same installed packages')
    namesBothPlaces(says, READ.onTheBox)
  })

  it('15: a suite here says the path of the lock it read, and different packages name both places too', async () => {
    const { says } = await tested(anEntry(LOCK_ONE), aloneWith(LOCK_TWO))
    expect(says).toContain('the suite and the run alone had different installed packages')
    namesBothPlaces(says, READ.here(join(realpathSync(join(f.clone, 'node_modules')), '.package-lock.json')))
  })

  it('16: a box that gave no lock says the commit\'s package-lock.json was read here, and where', async () => {
    const { says } = await tested(anEntry(LOCK_ONE, { door: 'box' }), aloneWith(LOCK_ONE))
    namesBothPlaces(says, READ.hereInTheCommitTheBoxRan(join(f.clone, 'package-lock.json')))
    expect(says, 'the commit\'s lockfile is named with its hash').toContain(sha256(LOCKFILE).slice(0, 16))
    expect(says, 'the run alone\'s lock is named with its hash').toContain(sha256(LOCK_ONE).slice(0, 16))
  })

  it('17: the log line of a file red in the related tests and green alone names where each lock was read', async () => {
    await tested(anEntry(LOCK_ONE, { related: true }), aloneWith(LOCK_TWO))
    const rerun = f.logged.filter(line => line.startsWith('tests/made-up.test.ts, red in the related tests, is green alone'))
    expect(rerun).toHaveLength(1)
    namesBothPlaces(rerun[0]!, READ.here(join(realpathSync(join(f.clone, 'node_modules')), '.package-lock.json')))
  })

  it('18: two installs whose locks differ only in the root\'s name and version are said to have the same installed packages', async () => {
    const inIt = ROOT_AT('made-up', '1.0.0', '1.0.0'), alone = ROOT_AT('made-up-renamed', '1.0.1', '1.0.0')
    const { says, detail } = await tested(anEntry(inIt), aloneWith(alone))
    expect(detail.ran.test.lock.sha256, 'the two whole files differ').not.toBe(sha256(alone))
    expect(says).toContain('the suite and the run alone had the same installed packages')
    expect(says).not.toContain('different installed packages')
  })

  it('19: two installs whose locks differ in a package entry are said to have different installed packages', async () => {
    const { says } = await tested(anEntry(ROOT_AT('made-up', '1.0.0', '1.0.0')), aloneWith(ROOT_AT('made-up', '1.0.0', '2.0.0')))
    expect(says).toContain('the suite and the run alone had different installed packages')
    expect(says).not.toContain('the same installed packages')
  })

  it('20: a package-lock.json, read where there is no installed lock, is compared without the root\'s name and version in its "" entry too', async () => {
    const { theInstalledLock, theLocksCompared } = await import('../tools/merge-tool/installed-lock.mjs')
    const lockIn = (name: string, text: string) => {
      const tree = join(f.folder, name)
      mkdirSync(join(tree, 'node_modules'), { recursive: true })
      writeFileSync(join(tree, 'package-lock.json'), text)
      return theInstalledLock(tree)
    }
    f.folder = mkdtempSync(join(tmpdir(), 'installed-lock-lockfile-'))
    const one = lockIn('one', LOCKFILE_AT('1.0.0', '1.0.0')), bumped = lockIn('bumped', LOCKFILE_AT('1.0.1', '1.0.0')), other = lockIn('other', LOCKFILE_AT('1.0.0', '2.0.0'))
    expect(one).toMatchObject({ file: 'package-lock.json' })
    expect(one.sha256, 'the two whole files differ').not.toBe(bumped.sha256)
    expect(theLocksCompared('the suite', one, bumped)).toContain('the suite and the run alone had the same installed packages')
    expect(theLocksCompared('the suite', one, other)).toContain('the suite and the run alone had different installed packages')
  })

  it('21: a box whose answer gives installedLock and no installedPackages is from before it gave that hash, and its packages are not compared', async () => {
    if (FROM_BEFORE === undefined) throw new Error('tools/merge-tool/installed-lock.mjs exports no FROM_BEFORE_THE_PACKAGES, so the words of such an answer cannot be read.')
    const { says, detail } = await tested(anEntry(LOCK_ONE, { door: 'box', boxLock: sha256(LOCK_ONE) }), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_ONE), packages: null })
    expect(says).toContain('cannot be compared')
    expect(says).toContain(FROM_BEFORE)
    expect(says).not.toContain('the same installed packages')
  })

  it('24: a box whose answer says why it could not hash its packages says that reason, and its packages are not compared', async () => {
    const reason = 'MADE-UP: the reason the box could not hash its packages'
    const { says, detail } = await tested(anEntry(LOCK_ONE, { door: 'box', boxLock: sha256(LOCK_ONE), boxUnread: reason }), aloneWith(LOCK_ONE))
    expect(detail.ran.test.lock).toMatchObject({ file: INSTALLED, sha256: sha256(LOCK_ONE), packages: null, packagesUnread: reason })
    expect(says).toContain('cannot be compared')
    expect(says).toContain(reason)
    expect(says, 'it is not said to be from before').not.toContain(FROM_BEFORE ?? 'from before')
  })
})
