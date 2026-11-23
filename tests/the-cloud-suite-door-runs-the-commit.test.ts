// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * tools/cloud-suite.criteria.md is the criterion. Every box and suite in this file is made up.
 * The real door's remote script runs in a temporary home; fake Docker/npm avoid a real cloud connection.
 * The real queue caller accepts the real door, with theRealDoor naming another path as its test guard requires.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { aSuiteOnTheBoxOrHere } from '../tools/merge-tool/cloud-suite-door.mjs'
import { theBoxLock, theInstalledLock, theLocksCompared } from '../tools/merge-tool/installed-lock.mjs'

const REPO = join(import.meta.dirname, '..')
const DOOR = join(REPO, 'tools', 'cloud-suite.mjs')
let root: string
let commit: string
let runner: string
let config: Record<string, string>
let env: NodeJS.ProcessEnv
let held: ReturnType<typeof spawn> | undefined

function git(...args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } })
  if (result.status !== 0) throw new Error(`fixture git failed: ${result.stderr}`)
  return result.stdout.trim()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cloud-door-fixture-'))
  const work = join(root, 'work')
  const source = join(root, 'source')
  const home = join(root, 'remote-home')
  const bin = join(root, 'bin')
  for (const folder of [work, source, home, bin, join(root, 'local-home')]) mkdirSync(folder)
  config = { work, home, bin, savedWork: join(root, 'local-work'), remoteWork: join(root, 'remote-work'), repository: join(root, 'repository.git'), calls: join(root, 'calls.jsonl'), commands: join(root, 'commands.jsonl'), git: spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(), mode: 'green' }
  for (const command of ['git', 'docker', 'npm']) {
    copyFileSync(join(REPO, 'tests', 'cloud-box-commands.mjs'), join(bin, command))
    chmodSync(join(bin, command), 0o755)
  }
  // A MADE-UP BOX OF 16 CPUS (criterion 24), more than the runner file's 7 workers, so every case runs at 7 on any machine.
  writeFileSync(join(bin, 'nproc'), '#!/bin/sh\necho 16\n', { mode: 0o755 })
  const transport = join(root, 'transport')
  copyFileSync(join(REPO, 'tests', 'cloud-box-stand-in.mjs'), transport)
  chmodSync(transport, 0o755)
  const key = join(root, 'fixture-key')
  writeFileSync(key, JSON.stringify(config))
  runner = join(root, 'fixture-runner.env')
  writeFileSync(runner, `RUNNER_HOST=runner.example.invalid\nRUNNER_USER=fixture\nRUNNER_KEY=${key}\nRUNNER_WORKERS=7\n`, { mode: 0o600 })
  mkdirSync(join(source, 'sandboxes', 'mole-office-dev'), { recursive: true })
  writeFileSync(join(source, 'sandboxes', 'mole-office-dev', 'Dockerfile'), '# made-up image\n')
  writeFileSync(join(source, 'package.json'), '{"name":"made-up-suite","version":"1.0.0"}\n')
  writeFileSync(join(source, 'package-lock.json'), '{"name":"made-up-suite","lockfileVersion":3}\n')
  mkdirSync(join(source, 'tools'))
  copyFileSync(join(REPO, 'tools', 'record-what-tests-read.mjs'), join(source, 'tools', 'record-what-tests-read.mjs'))
  git('init', '-q', source)
  git('-C', source, 'add', '.')
  git('-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'made-up suite fixture')
  commit = git('-C', source, 'rev-parse', 'HEAD')
  git('clone', '-q', '--bare', source, config.repository!)
  git('clone', '-q', source, join(work, 'clone'))
  env = { PATH: process.env.PATH, HOME: join(root, 'local-home'), [THE_TEST_MARK]: String(process.pid), MOLE_OFFICE_CLOUD_RUNNER_FILE: runner, MOLE_OFFICE_CLOUD_TRANSPORT: transport,
    // Deliberate fake credentials: none may appear in either transport or container environments.
    MOLE_AGENT_KEY: 'made-up-office-key', MOLE_OFFICE_API: 'http://made-up-office.invalid', DATABASE_URL: 'made-up-database' }
})

afterEach(async () => {
  if (held?.pid) {
    process.kill(-held.pid, 'SIGTERM')
    await new Promise<void>((done) => held!.once('close', () => done()))
    held = undefined
  }
  rmSync(root, { recursive: true, force: true })
})

function box(timeoutSec = 20) {
  return { clone: join(config.work!, 'clone'), commit, report: join(config.work!, 'reports', 'suite.json'), reads: join(config.work!, 'reports', 'reads'), suiteLog: join(config.work!, 'reports', 'suite.log'), timeoutSec }
}
function mode(name: string) {
  config.mode = name
  writeFileSync(join(root, 'fixture-key'), JSON.stringify(config))
}
function login(user: string) {
  config.login = user
  writeFileSync(runner, readFileSync(runner, 'utf8').replace(/^RUNNER_USER=.*$/m, `RUNNER_USER=${user}`))
  writeFileSync(join(root, 'fixture-key'), JSON.stringify(config))
}
function call(timeoutSec = 20, manifest?: string, sampledEvery?: string) {
  const b = box(timeoutSec)
  return execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', String(timeoutSec), ...(manifest === undefined ? [] : ['--manifest', manifest]), ...(sampledEvery === undefined ? [] : ['--box-sampled-every', sampledEvery])], b.clone, b)
}
const manifestPath = () => join(config.work!, 'reports', 'expected.json')
const commandsMade = () => readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
/** The queue and direct cases use this same process runner. The queue's own argument array is executed unchanged. */
function execute(command: string, args: string[], cwd: string, b: ReturnType<typeof box>, limitMs = 30_000) {
  const output = join(root, 'door-output.log')
  const fd = openSync(output, 'w')
  const result = spawnSync(command, args, { cwd, env, stdio: ['ignore', fd, fd], timeout: limitMs })
  closeSync(fd)
  const text = readFileSync(output, 'utf8')
  const answer = JSON.parse(text.trim().split('\n').at(-1)!)
  if (process.env.CLOUD_DOOR_LAST_LINES) appendFileSync(process.env.CLOUD_DOOR_LAST_LINES, `${JSON.stringify({ mode: config.mode, status: result.status, last: text.trim().split('\n').at(-1) })}\n`)
  return { ...result, text, answer, b }
}
function notRun(result: ReturnType<typeof call>, reason: string) {
  expect(result.status, result.text).toBe(75)
  expect(result.answer).toEqual({ ran: false, reason })
}

it('the real queue accepts the real door and the exact returned paths, then a cache hit runs without reinstalling', async () => {
  const b = box()
  // THE SCRIPT THE QUEUE'S CALL BUILT is kept: the key names this folder, and the stand-in box writes the script into it.
  config.scripts = join(root, 'scripts')
  mkdirSync(config.scripts)
  mode('green')
  let hereCalls = 0
  const ran = await aSuiteOnTheBoxOrHere({ label: 'fixture-suite', box: b, door: DOOR, theRealDoor: join(root, 'some-other-door'), env,
    log: () => {}, hereIs: 'the made-up local runner', here: async () => { hereCalls++; return { code: 0 } },
    run: async (_label: string, command: string, args: string[], options: { cwd: string }) => { const result = execute(command, args, options.cwd, b); return { code: result.status, signal: result.signal, timedOut: false, outFile: join(root, 'door-output.log') } },
  })
  expect(ran).toMatchObject({ where: 'box', code: 0, box: { workers: 7, ran: true } })
  expect(readFileSync(join(config.scripts, 'run.sh'), 'utf8'), 'the queue passes no sample interval, so the box is read every 15 s').toContain('sleep 15 &')
  expect(hereCalls).toBe(0)
  const doorLines = readFileSync(join(root, 'door-output.log'), 'utf8').trim().split('\n')
  const boxTime = JSON.parse(doorLines.find((line) => line.startsWith('{"phase":'))!).wallSec
  expect(JSON.parse(doorLines.at(-1)!).wallSec).toBe(boxTime)
  expect(Number.isFinite(boxTime)).toBe(true)
  expect(boxTime).toBeGreaterThanOrEqual(0)
  expect(JSON.parse(readFileSync(b.report, 'utf8')).testResults[0].name).toBe(join(b.clone, 'tests', 'made-up.test.ts'))
  expect(readFileSync(b.suiteLog, 'utf8')).toContain('made-up npm test')
  expect(readdirSync(b.reads).length).toBeGreaterThan(0)
  expect(readdirSync(b.reads).some((name) => readFileSync(join(b.reads, name), 'utf8').includes('R package.json'))).toBe(true)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(readdirSync(config.remoteWork!).some((name) => name.startsWith('.cloud-home-'))).toBe(false)
  const next = call()
  expect(next.answer).toMatchObject({ ran: true, code: 0, commit, workers: 7, files: 1, failed: [] })
  const commands = readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(commands.filter((one) => one.program === 'npm' && one.args[0] === 'ci')).toHaveLength(1)
  expect(commands.filter((one) => one.program === 'docker' && one.args[0] === 'build')).toHaveLength(1)
  expect(commands.filter((one) => one.program === 'npm').map((one) => one.args[0])).toEqual(['ci', 'run', 'test', 'run', 'test'])
  const container = commands.find((one) => one.program === 'docker' && one.args.includes('test'))
  expect(container.args).toEqual(expect.arrayContaining(['--init', '--network', 'host', '-u', '1000:1000', '-v', `${dirname(b.clone)}:${dirname(b.clone)}`, '--maxWorkers=7', `--outputFile.json=${b.report}`, `TEST_READ_RECORD=${b.reads}`, `TEST_READ_ROOT=${b.clone}`]))
  expect(container.args.join(' ')).toContain(`NODE_OPTIONS=--import=${b.clone}/tools/record-what-tests-read.mjs`)
  expect(container.args.some((word: string) => word.startsWith('HOME=') && word.includes('.cloud-home-'))).toBe(true)
  const calls = readFileSync(config.calls!, 'utf8')
  const containers = JSON.stringify(commands)
  for (const text of [calls, containers]) for (const secret of ['made-up-office-key', 'made-up-office.invalid', 'made-up-database']) expect(text).not.toContain(secret)
  expect(JSON.parse(calls.split('\n')[0]!).args).toEqual(expect.arrayContaining(['-i', join(root, 'fixture-key'), 'IdentitiesOnly=yes', 'BatchMode=yes', 'ConnectTimeout=15']))
  mode('no-report')
  notRun(call(), 'the cloud box returned no readable Vitest report at the requested path')
})

it('no runner file gives 75 with its reason', () => {
  rmSync(runner)
  notRun(call(), 'no runner file is configured for the cloud box')
})
it.each(['mode', 'link'])('refuses a runner file with invalid %s before reaching the stand-in', (bad) => {
  if (bad === 'mode') chmodSync(runner, 0o644)
  else { renameRunner(); symlinkSync(join(root, 'real-runner'), runner) }
  notRun(call(), 'the runner file must be a regular file owned by this user with mode 0600')
  expect(existsSync(config.calls!)).toBe(false)
})
function renameRunner() { copyFileSync(runner, join(root, 'real-runner')); rmSync(runner) }

it.each(['implicit default', 'explicit default', 'no stand-in'])('the test mark refuses the real box with %s', (variant) => {
  const defaultRunner = join(env.HOME!, '.cache', 'mole-office', 'cloud-runner', 'runner.env')
  mkdirSync(dirname(defaultRunner), { recursive: true })
  copyFileSync(runner, defaultRunner)
  chmodSync(defaultRunner, 0o600)
  if (variant === 'implicit default') delete env.MOLE_OFFICE_CLOUD_RUNNER_FILE
  else if (variant === 'explicit default') env.MOLE_OFFICE_CLOUD_RUNNER_FILE = defaultRunner
  else {
    // Even the guard's mutation cannot reach real SSH: the fixture supplies the only ssh on PATH.
    copyFileSync(env.MOLE_OFFICE_CLOUD_TRANSPORT!, join(config.bin!, 'ssh'))
    chmodSync(join(config.bin!, 'ssh'), 0o755)
    env.PATH = `${config.bin}:${env.PATH}`
    delete env.MOLE_OFFICE_CLOUD_TRANSPORT
  }
  notRun(call(), 'a run the test suite started never reaches the real cloud box')
  expect(existsSync(config.calls!)).toBe(false)
})

it('a held lock gives 75 busy and does not start the suite', async () => {
  const lock = join(config.home!, '.cache', 'mole-office', 'cloud-suite', 'suite.lock')
  mkdirSync(dirname(lock), { recursive: true })
  held = spawn('flock', [lock, 'bash', '-c', 'echo locked; sleep 30'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise<void>((done) => held!.stdout!.once('data', () => done()))
  notRun(call(), 'the cloud box is busy with another suite')
  const commands = existsSync(config.commands!) ? readFileSync(config.commands!, 'utf8') : ''
  expect(commands).not.toContain('"program":"docker"')
  expect(commands).not.toContain('"program":"npm"')
})
it('a failed npm test returns ran true and exits with the real npm test code', () => {
  mode('red')
  const result = call()
  expect(result.status, result.text).toBe(3)
  expect(result.answer).toMatchObject({ ran: true, code: 3, workers: 7, commit, files: 1, failed: ['tests/made-up.test.ts'] })
})
it('reads the box\'s load and available memory at the interval it is given while npm test runs, and answers how many times, the median and the worst', async () => {
  // THE MODULE IS READ BY ITS PATH, so this file type-checks before it is there.
  const every = Reflect.get(await import(join(REPO, 'tools', 'the-box-under-the-suite.mjs')) as object, 'BOX_SAMPLED_EVERY_SEC') as number | undefined
  expect(every, 'tools/the-box-under-the-suite.mjs says how often the box is read').toBe(15)
  notRun(call(60, undefined, '0'), 'the box sample interval must be a whole number of seconds above 0')
  notRun(call(60, undefined, '16'), 'the box sample interval must be a whole number of seconds above 0')
  // THE MADE-UP SUITE OF THE TIMEOUT CASES TAKES 2.5 S, so read every second it is read at its start and at least twice more.
  mode('timeout')
  const result = call(60, undefined, '1')
  expect(result.status, result.text).toBe(0)
  // THE STAND-IN BOX IS THIS MACHINE, so the numbers are this machine's own; only their shape and order are known.
  const said = result.answer.boxLoad as { everySec: number; samples: number; notRead: number; load: { median: number; worst: number }; availableMemoryMb: { median: number; worst: number } }
  expect(said, 'the answer reads the samples at the interval the sampler slept').toMatchObject({ everySec: 1, notRead: 0 })
  expect(said.samples, 'a suite of 2.5 s is read at its start, 1 s and 2 s later').toBeGreaterThanOrEqual(3)
  expect(said.samples, 'no two readings are less than 1 s apart').toBeLessThanOrEqual(Math.floor(result.answer.wallSec as number) + 1)
  expect(said.load.median).toBeGreaterThanOrEqual(0)
  expect(said.load.worst, 'the worst load is the highest').toBeGreaterThanOrEqual(said.load.median)
  expect(said.availableMemoryMb.worst).toBeGreaterThan(0)
  expect(said.availableMemoryMb.median, 'the worst memory is the least').toBeGreaterThanOrEqual(said.availableMemoryMb.worst)
  expect(said.availableMemoryMb.median).toBeLessThanOrEqual(totalmem() / 1024 / 1024)
}, 60_000)
// CRITERION 23. The lock's words are made up; the fake install writes them as npm writes its own installed lock.
const MADE_UP_INSTALLED_LOCK = '{"name":"made-up-suite","lockfileVersion":3,"packages":{"node_modules/made-up":{"version":"1.0.0"}}}\n'
it('answers installedLock, the sha256 of the node_modules/.package-lock.json its install left, after a suite', () => {
  config.installedLock = MADE_UP_INSTALLED_LOCK
  mode('green')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, installedLock: createHash('sha256').update(MADE_UP_INSTALLED_LOCK).digest('hex') })
})
it('answers no installedLock when its install left no node_modules/.package-lock.json, and the answer is accepted as before', () => {
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, files: 1, failed: [] })
  expect(result.answer, 'no lock is given when there is none').not.toHaveProperty('installedLock')
})
it.each(['lock-not-hex', 'lock-on-build'])('refuses a result whose installedLock is not 64 hex or comes beside a failed build (%s)', (name) => {
  config.installedLock = MADE_UP_INSTALLED_LOCK
  mode(name)
  const result = call()
  // THE MADE-UP SHAPE REACHED THE HOST: the box's result line, as the door printed it, carries the wrong lock in the phase
  // the mode names, so the refusal below is for that lock and for nothing else.
  const line = JSON.parse(result.text.split('\n').filter((one) => one.startsWith('{"phase":')).at(-1)!)
  expect(line).toMatchObject(name === 'lock-not-hex' ? { phase: 'test', code: 0, installedLock: 'made-up-not-hex' } : { phase: 'build', code: 4, installedLock: 'f'.repeat(64) })
  notRun(result, 'the cloud box returned an invalid suite result')
})
// A MADE-UP INSTALLED LOCK WITH A ROOT NAME AND VERSION, beside one made-up package at a version.
const MADE_UP_ROOT_AT = (version: string, made: string) => `{"name":"made-up-suite","version":"${version}","lockfileVersion":3,"requires":true,"packages":{"node_modules/made-up":{"version":"${made}"}}}\n`
it('answers installedPackages, which a lock read here matches when only the root\'s version differs, and not when a package does', () => {
  config.installedLock = MADE_UP_ROOT_AT('1.0.0', '1.0.0')
  mode('green')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, installedLock: createHash('sha256').update(config.installedLock).digest('hex'), installedPackages: expect.stringMatching(/^[0-9a-f]{64}$/u) })
  /** The lock a run alone here reads of a made-up tree whose installed lock is `text`. */
  const readHere = (name: string, text: string) => {
    mkdirSync(join(root, name, 'node_modules'), { recursive: true })
    writeFileSync(join(root, name, 'node_modules', '.package-lock.json'), text)
    return theInstalledLock(join(root, name))
  }
  const onTheBox = theBoxLock(result.answer, join(config.work!, 'clone'))
  expect(theLocksCompared('the suite', onTheBox, readHere('bumped', MADE_UP_ROOT_AT('1.0.1', '1.0.0')))).toContain('the suite and the run alone had the same installed packages')
  expect(theLocksCompared('the suite', onTheBox, readHere('other', MADE_UP_ROOT_AT('1.0.0', '2.0.0')))).toContain('the suite and the run alone had different installed packages')
})
it('answers installedPackagesUnread in place of installedPackages when the lock is not JSON, and keeps the suite\'s result', () => {
  config.installedLock = 'made-up lock that is not JSON\n'
  mode('green')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, files: 1, installedLock: createHash('sha256').update(config.installedLock).digest('hex'), installedPackagesUnread: expect.stringMatching(/\S/u) })
  expect(result.answer).not.toHaveProperty('installedPackages')
})
/** The made-up field each mode puts on the box's result line, and the phase and code that line has. */
const WRONG_PACKAGES: Record<string, object> = {
  'packages-not-hex': { phase: 'test', code: 0, installedPackages: 'made-up-not-hex' },
  'packages-on-build': { phase: 'build', code: 4, installedPackages: 'f'.repeat(64) },
  'unread-on-build': { phase: 'build', code: 4, installedPackagesUnread: 'made-up reason' },
  'unread-beside-packages': { phase: 'test', code: 0, installedPackages: expect.stringMatching(/^[0-9a-f]{64}$/u), installedPackagesUnread: 'made-up reason' },
}
it.each(Object.keys(WRONG_PACKAGES))('refuses a result whose installedPackages is not 64 hex or comes beside a failed build, or whose installedPackagesUnread comes beside either (%s)', (name) => {
  config.installedLock = MADE_UP_INSTALLED_LOCK
  mode(name)
  const result = call()
  const line = JSON.parse(result.text.split('\n').filter((one) => one.startsWith('{"phase":')).at(-1)!)
  expect(line).toMatchObject(WRONG_PACKAGES[name]!)
  notRun(result, 'the cloud box returned an invalid suite result')
})
// CRITERION 24. The box's CPUs are made up: the nproc first on the stand-in box's PATH prints them and exits as told.
function theBoxCounts(said: string, exit = 0) {
  writeFileSync(join(config.bin!, 'nproc'), `#!/bin/sh\necho '${said}'\nexit ${String(exit)}\n`, { mode: 0o755 })
}
const theRunnerFileNames = () => Number(/^RUNNER_WORKERS=(\d+)$/mu.exec(readFileSync(runner, 'utf8'))![1])
it('runs discovery and npm test at the box\'s CPUs when it has fewer than the runner file names, and answers all three counts', () => {
  theBoxCounts('3')
  expect(theRunnerFileNames(), 'the made-up box has fewer CPUs than the runner file names').toBeGreaterThan(3)
  const manifest = manifestPath()
  const result = call(20, manifest)
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, phase: 'test', code: 0, workers: 3, cpus: 3, runnerWorkers: theRunnerFileNames() })
  const commands = commandsMade()
  const discovery = commands.find((one) => one.program === 'vitest')
  const suite = commands.find((one) => one.program === 'npm' && one.args[0] === 'test')
  expect(discovery.args).toContain('--maxWorkers=3')
  expect(suite.args).toContain('--maxWorkers=3')
  expect(suite.args, 'the runner file\'s count is not also given').not.toContain(`--maxWorkers=${String(theRunnerFileNames())}`)
})
it('keeps the runner file\'s count on a box with more CPUs, and answers all three counts', () => {
  theBoxCounts('32')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, workers: theRunnerFileNames(), cpus: 32, runnerWorkers: theRunnerFileNames() })
  expect(commandsMade().find((one) => one.program === 'npm' && one.args[0] === 'test').args).toContain(`--maxWorkers=${String(theRunnerFileNames())}`)
})
it('answers the three counts beside a failed build too', () => {
  theBoxCounts('3')
  mode('build-fails')
  const result = call()
  expect(result.status, result.text).toBe(4)
  expect(result.answer).toMatchObject({ ran: true, code: 4, workers: 3, cpus: 3, runnerWorkers: theRunnerFileNames() })
})
it.each([['fails', '4', 1], ['prints a word', 'four', 0], ['prints 0', '0', 0]])('a box whose nproc %s clones and runs nothing, and gives 75 with the reason', async (_, said, exit) => {
  // THE MODULE IS READ BY ITS PATH, so this file type-checks before the reason is there.
  const reason = Reflect.get(await import(join(REPO, 'tools', 'the-box-under-the-suite.mjs')) as object, 'THE_CPUS_NOT_COUNTED') as string | undefined
  expect(reason, 'tools/the-box-under-the-suite.mjs names the reason').toBeTypeOf('string')
  theBoxCounts(said, exit)
  notRun(call(), reason!)
  const made = existsSync(config.commands!) ? commandsMade() : []
  expect(made.filter((one) => (one.program === 'git' && one.args[0] === 'clone') || (one.program === 'docker' && ['image', 'build', 'run'].includes(one.args[0])) || one.program === 'npm')).toEqual([])
})
// THE INFRASTRUCTURE AGENT'S CONDITION (criterion 24): nproc honours OMP_NUM_THREADS and OMP_THREAD_LIMIT, so a variable
// left in the box's environment would cut the workers. Here the machine's own nproc counts, and the stand-in box's
// environment sets the variable to 2.
it.each([['omp-num-threads', 'OMP_NUM_THREADS'], ['omp-thread-limit', 'OMP_THREAD_LIMIT']])('counts the CPUs with nproc\'s variables taken out of its environment (%s)', (name, variable) => {
  rmSync(join(config.bin!, 'nproc'))
  const counted = Number(spawnSync('nproc', { encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout.trim())
  expect(counted, 'this machine has more CPUs than the made-up 2, so the variable would show').toBeGreaterThan(2)
  expect(spawnSync('nproc', { encoding: 'utf8', env: { PATH: process.env.PATH, [variable]: '2' } }).stdout.trim(), `this machine's nproc honours ${variable}`).toBe('2')
  mode(name)
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, cpus: counted, workers: Math.min(counted, theRunnerFileNames()), runnerWorkers: theRunnerFileNames() })
})
it.each(['cpus-zero', 'workers-not-the-fewer'])('refuses a result whose CPUs are not a whole number above zero, or whose workers are not the fewer (%s)', (name) => {
  mode(name)
  const result = call()
  // THE MADE-UP SHAPE REACHED THE HOST: the box's result line, as the door printed it, carries the wrong count, so the
  // refusal below is for that count and for nothing else.
  const line = JSON.parse(result.text.split('\n').filter((one) => one.startsWith('{"phase":')).at(-1)!)
  expect(line).toMatchObject(name === 'cpus-zero' ? { phase: 'test', code: 0, cpus: 0 } : { phase: 'test', code: 0, cpus: 16, workers: 16 })
  notRun(result, 'the cloud box returned an invalid suite result')
})
it('masks IPv4, IPv6 and the host in every printed or returned text', () => {
  mode('addresses')
  const result = call()
  expect(result.status, result.text).toBe(0)
  const texts = [result.text, readFileSync(result.b.report, 'utf8'), readFileSync(result.b.suiteLog, 'utf8'), ...readdirSync(result.b.reads).map((name) => readFileSync(join(result.b.reads, name), 'utf8'))]
  for (const text of texts) for (const address of ['192.0.2.91', '2001:db8::91', '::1', '::ffff:192.0.2.91', 'fe80::1234%eth0', 'runner.example.invalid']) expect(text).not.toContain(address)
  expect(result.text).toContain('the cloud box')
  expect(readFileSync(result.b.suiteLog, 'utf8')).toContain('the cloud box')
})
function returnedReadFormats(host = 'runner.example.invalid') {
  config.host = host
  writeFileSync(runner, readFileSync(runner, 'utf8').replace(/^RUNNER_HOST=.*$/m, `RUNNER_HOST=${host}`))
  mode('read-formats')
  const result = call()
  expect(result.status, result.text).toBe(0)
  const before = JSON.parse(readFileSync(join(config.home!, 'read-record-before-mask.json'), 'utf8')) as { fixture: boolean, records: Record<string, string> }
  expect(before.fixture).toBe(true)
  expect(Object.keys(before.records).length).toBeGreaterThan(0)
  expect(readdirSync(result.b.reads).sort()).toEqual(Object.keys(before.records).sort())
  return Object.entries(before.records).map(([name, original]) => ({ original, returned: readFileSync(join(result.b.reads, name), 'utf8') }))
}
it.each(['runner.example.invalid', '::'])('returned read records keep every line format and X separator byte for byte with stand-in host %s while masking box identities', (host) => {
  const records = returnedReadFormats(host)
  const originals = records.flatMap((one) => one.original.trimEnd().split('\n'))
  expect([...new Set(originals.map((line) => line[0]))].sort()).toEqual(['C', 'L', 'N', 'R', 'T', 'X'])
  expect(originals).toContain('L .')
  expect(originals.some((line) => line.startsWith('X . :: '))).toBe(true)
  expect(originals.some((line) => line.startsWith('X .fixture/cwd with space :: '))).toBe(true)
  expect(originals.some((line) => line.includes('fixture.punctuation=: :: ::: . .. ... :.: .::. .:: "quoted" \'single\' ; | > <'))).toBe(true)
  let identities = 0
  for (const { original, returned } of records) {
    const before = original.split('\n'), after = returned.split('\n')
    expect(after).toHaveLength(before.length)
    for (const [index, line] of before.entries()) {
      if (!line.includes('fixture.sensitive=')) expect(after[index]).toBe(line)
      else {
        identities++
        expect(after[index]).toContain('fixture.sensitive=the cloud box')
        expect(after[index]).toContain('the cloud box:~/PROJECTS/mole-office')
        for (const secret of ['192.0.2.91', 'runner.example.invalid', 'fixture@', '/home/fixture']) expect(after[index]).not.toContain(secret)
      }
    }
  }
  expect(identities).toBeGreaterThan(0)
})
it('returned read records still mask real compressed IPv6 addresses including loopback', () => {
  const records = returnedReadFormats()
  const originals = records.map((one) => one.original).join('\n')
  const returned = records.map((one) => one.returned).join('\n')
  for (const address of ['2001:db8::1', '::1', '::ffff:192.0.2.91']) {
    expect(originals).toContain(address)
    expect(returned).not.toContain(address)
  }
  expect(returned).toContain('the cloud box')
})
it('an unreachable box gives 75 and a masked reason', () => {
  mode('unreachable')
  notRun(call(), 'the cloud box could not be reached to receive the commit')
})
it.each(['ssh', 'push'])('a stand-in %s failure masks the box login in every line and the last answer', (failure) => {
  login('made')
  mode(`${failure}-login-fails`)
  const result = call()
  expect(result.status, result.text).toBe(75)
  expect(result.answer.ran).toBe(false)
  expect(result.text).toContain('the cloud box')
  expect(result.text).toContain('~/PROJECTS/mole-office')
  for (const line of result.text.trim().split('\n')) {
    expect(line).not.toContain('made@')
    expect(line).not.toContain('/home/made')
    expect(line).not.toContain('runner.example.invalid')
  }
  if (failure === 'ssh') expect(result.answer.reason).toContain('~/PROJECTS/mole-office')
  else expect(readFileSync(config.calls!, 'utf8')).toContain('git-receive-pack')
})
it('a system error masks the box login in the catch reason and final line', () => {
  login('made')
  env.MOLE_OFFICE_CLOUD_TRANSPORT = join(root, 'home', 'made', 'made@runner.example.invalid', 'missing-transport')
  const result = call()
  expect(result.status, result.text).toBe(75)
  expect(result.answer).toMatchObject({ ran: false })
  expect(result.answer.reason).toContain('ENOENT')
  expect(result.answer.reason).toContain('the cloud box')
  expect(result.answer.reason).toContain('~/the cloud box')
  for (const text of [result.text, result.answer.reason]) {
    expect(text).not.toContain('made@')
    expect(text).not.toContain('/home/made')
    expect(text).not.toContain('runner.example.invalid')
  }
})
it('a green stand-in preserves caller login paths and report names while masking returned text', async () => {
  const callerWork = join(root, 'home', 'made', 'work')
  mkdirSync(dirname(callerWork), { recursive: true })
  renameSync(config.work!, callerWork)
  config.work = callerWork
  login('made')
  mode('logins')
  const b = box()
  let hereCalls = 0
  const ran = await aSuiteOnTheBoxOrHere({ label: 'made-up-suite', box: b, door: DOOR, theRealDoor: join(root, 'some-other-door'), env,
    log: () => {}, hereIs: 'the made-up local runner', here: async () => { hereCalls++; return { code: 0 } },
    run: async (_label: string, command: string, args: string[], options: { cwd: string }) => { const result = execute(command, args, options.cwd, b); return { code: result.status, signal: result.signal, timedOut: false, outFile: join(root, 'door-output.log') } },
  })
  expect(ran, readFileSync(join(root, 'door-output.log'), 'utf8')).toMatchObject({ where: 'box', code: 0, box: { ran: true } })
  expect(hereCalls).toBe(0)
  const report = JSON.parse(readFileSync(b.report, 'utf8'))
  expect(report.fixture).toBe(true)
  expect(report.testResults).toHaveLength(1)
  for (const result of report.testResults) {
    expect(result.name).toBe(join(b.clone, 'tests', 'made-up.test.ts'))
    expect(result.name.startsWith(`${b.clone}/`)).toBe(true)
    expect(result.message).toContain('the cloud box')
    expect(result.message).toContain('~/PROJECTS/mole-office')
    expect(result.message).not.toContain('made@')
    expect(result.message).not.toContain('/home/made')
  }
  const log = readFileSync(b.suiteLog, 'utf8')
  expect(log).toContain('made-up unrelated words: made made-up.test.ts /home/made-other/file /home/madesuffix/file')
  expect(log).toContain('~/PROJECTS/mole-office')
  expect(log).not.toContain('made@')
  expect(log).not.toMatch(/\/home\/made(?:\/|\s|$)/)
  expect(log).toContain('home ~')
  expect(readdirSync(b.reads).length).toBeGreaterThan(0)
  const output = readFileSync(join(root, 'door-output.log'), 'utf8')
  expect(output).not.toContain('made@')
  expect(output).not.toMatch(/\/home\/made(?:\/|\s|$)/)
  const commands = readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const testContainer = commands.find((one) => one.program === 'docker' && one.args.includes('test'))
  expect(testContainer.args).toEqual(expect.arrayContaining([`${dirname(b.clone)}:${dirname(b.clone)}`, `--outputFile.json=${b.report}`, `TEST_READ_RECORD=${b.reads}`, `TEST_READ_ROOT=${b.clone}`]))
})
it('a timeout gives 75 and leaves no remote clone or run HOME', () => {
  mode('timeout')
  const result = call(1)
  notRun(result, 'timed out after 1 s')
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(readdirSync(config.remoteWork!).some((name) => name.startsWith('.cloud-home-'))).toBe(false)
  expect(existsSync(join(config.home!, 'container-running'))).toBe(false)
  expect(existsSync(join(config.home!, 'mask-before-removal'))).toBe(false)
})
it('a manifest-mode timeout after test entry leaves the outcome unknown and cleans its run folders', () => {
  mode('timeout')
  const result = call(2, manifestPath())
  notRun(result, 'timed out after 2 s')
  expect(commandsMade().some((one) => one.program === 'npm' && one.args[0] === 'test')).toBe(true)
  expect(result.answer).not.toHaveProperty('phase')
  expect(result.answer).not.toHaveProperty('buildExitCode')
  expect(result.answer).not.toHaveProperty('suiteExitCode')
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(existsSync(join(config.home!, 'container-running'))).toBe(false)
  expect(readdirSync(config.remoteWork!).some((name) => name.startsWith('.cloud-home-'))).toBe(false)
})
it('a failed dependency install gives 75 rather than pretending the suite ran', () => {
  mode('ci-fails')
  notRun(call(), 'the cloud box could not prepare or run the suite')
})
it('a cleanup failure gives 75 and keeps its diagnostic masked on the stand-in box', () => {
  mode('cleanup-fails')
  const result = call()
  notRun(result, 'the cloud box run folders could not be cleaned up')
  const states = join(config.home!, '.cache', 'mole-office', 'cloud-suite', 'runs')
  const diagnostic = readFileSync(join(states, readdirSync(states)[0]!, 'docker-error'), 'utf8')
  expect(diagnostic).toContain('made-up Docker cleanup failure at the cloud box')
  for (const address of ['192.0.2.91', '2001:db8::91']) {
    expect(result.text).not.toContain(address)
    expect(diagnostic).not.toContain(address)
  }
})
it('a failed npm build returns its actual code and log without inventing test artifacts', () => {
  config.installedLock = MADE_UP_INSTALLED_LOCK
  mode('build-fails')
  const result = call()
  expect(result.status, result.text).toBe(4)
  expect(result.answer).toMatchObject({ ran: true, code: 4, workers: 7, commit, files: 0, failed: [] })
  expect(result.answer.boxLoad, 'a build that failed ran no suite, so the box was not read').toBeUndefined()
  expect(result.answer, 'a build that failed ran no suite, so no installed lock is given').not.toHaveProperty('installedLock')
  expect(readFileSync(result.b.suiteLog, 'utf8')).toContain('made-up npm run build')
  expect(existsSync(result.b.report)).toBe(false)
  expect(existsSync(result.b.reads)).toBe(false)
  const commands = readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(commands.filter((one) => one.program === 'npm').map((one) => one.args[0])).toEqual(['ci', 'run'])
})
it('a container that never starts the build gives 75 instead of claiming npm ran', () => {
  mode('build-not-started')
  notRun(call(), 'the cloud box could not prepare or run the suite')
})

it('every remote container gets the time zone resolved by the calling machine', () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  env.TZ = zone
  const result = call()
  expect(result.status, result.text).toBe(0)
  const containers = readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    .filter((one) => one.program === 'docker' && one.args[0] === 'run')
  expect(containers).toHaveLength(3)
  for (const container of containers) {
    const index = container.args.indexOf(`TZ=${zone}`)
    expect(index).toBeGreaterThan(0)
    expect(container.args[index - 1]).toBe('-e')
  }
})

it.each(['', '../odd-zone', 'NoSuch/Zone'])('an invalid resolved caller zone %j gives 75 before reaching the box', (zone) => {
  const preload = join(root, 'made-up-zone.mjs')
  writeFileSync(preload, `// Test fixture: a broken caller zone.\nconst actual = Intl.DateTimeFormat; Intl.DateTimeFormat = function (...args) { return args.length ? new actual(...args) : { resolvedOptions: () => ({ timeZone: ${JSON.stringify(zone)} }) } }\n`)
  const b = box()
  const result = execute(process.execPath, ['--import', preload, DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', '20'], b.clone, b)
  notRun(result, 'the calling machine did not return a valid time zone')
  expect(existsSync(config.calls!)).toBe(false)
})

it.each(['node', 'docker', 'git', 'flock', 'timeout', 'tar', 'sha256sum'])('a box without host %s gives its reason before a push or remote preparation', (program) => {
  mode(`no-host-${program}`)
  notRun(call(), `the cloud box has no ${program} on its host`)
  expect(existsSync(join(config.home!, '.cache'))).toBe(false)
  expect(git('--git-dir', config.repository!, 'for-each-ref', 'refs/door/')).toBe('')
  const calls = readFileSync(config.calls!, 'utf8')
  expect(calls).not.toContain('git-receive-pack')
  expect(existsSync(config.commands!)).toBe(false)
})

it('cleanup still removes the container and folders when its node filter fails', () => {
  mode('cleanup-node-fails')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0 })
  expect(existsSync(join(config.home!, 'container-running'))).toBe(false)
  expect(existsSync(join(config.home!, 'mask-before-removal'))).toBe(false)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(readdirSync(config.remoteWork!).some((name) => name.startsWith('.cloud-home-'))).toBe(false)
  expect(readdirSync(join(config.home!, '.cache', 'mole-office', 'cloud-suite', 'runs'))).toEqual([])
  const commands = readFileSync(config.commands!, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(commands.some((one) => one.program === 'docker' && one.args[0] === 'rm')).toBe(true)
  for (const address of ['192.0.2.91', '2001:db8::91']) expect(result.text).not.toContain(address)
})

it.each([
  ['cache-fails', 'the cloud box could not make its cache folder'],
  ['lock-fails', 'the cloud box could not open its suite lock file'],
  ['clone-fails', 'the cloud box could not prepare the run clone'],
  ['home-fails', 'the cloud box could not make the run home'],
  ['outputs-fail', 'the cloud box could not prepare the output paths'],
  ['output-exists', 'the cloud box already has a requested output path'],
])('an early %s answers one JSON reason and preserves an existing output', (failure, reason) => {
  mode(failure)
  if (failure === 'lock-fails') mkdirSync(join(config.home!, '.cache', 'mole-office', 'cloud-suite', 'suite.lock'), { recursive: true })
  if (failure === 'output-exists') {
    mkdirSync(join(config.remoteWork!, 'reports'), { recursive: true })
    writeFileSync(join(config.remoteWork!, 'reports', 'suite.json'), 'made-up existing output\n')
  }
  const result = call()
  notRun(result, reason)
  expect(result.text.trim().split('\n').filter((line) => line.startsWith('{"ran":false'))).toHaveLength(2) // Remote reason, then the door's final answer.
  if (failure === 'output-exists') expect(readFileSync(join(config.remoteWork!, 'reports', 'suite.json'), 'utf8')).toBe('made-up existing output\n')
})

it.each(['green', 'red', 'cache-fails', 'cleanup-fails'])('cleanup removes the pushed ref after a %s outcome', (outcome) => {
  mode(outcome)
  const result = call()
  expect(result.status, result.text).toBe({ green: 0, red: 3, 'cache-fails': 75, 'cleanup-fails': 75 }[outcome])
  expect(git('--git-dir', config.repository!, 'for-each-ref', 'refs/door/')).toBe('')
})

it.each(['green', 'red'])('manifest mode returns expected files and real build/suite exits for a %s suite', (outcome) => {
  mode(outcome)
  const manifest = manifestPath()
  const result = call(20, manifest)
  const code = outcome === 'red' ? 3 : 0
  expect(result.status, result.text).toBe(code)
  expect(result.answer).toMatchObject({ ran: true, phase: 'test', buildExitCode: 0, suiteExitCode: code, code, workers: 7, commit, files: 1, failed: code === 0 ? [] : ['tests/made-up.test.ts'] })
  expect(Number.isFinite(result.answer.wallSec)).toBe(true)
  expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual([{ file: join(result.b.clone, 'tests', 'made-up.test.ts') }])
  expect(JSON.parse(readFileSync(result.b.report, 'utf8')).testResults[0].name).toBe(join(result.b.clone, 'tests', 'made-up.test.ts'))
  expect(readdirSync(result.b.reads).length).toBeGreaterThan(0)
  const log = readFileSync(result.b.suiteLog, 'utf8')
  expect(log.indexOf('made-up npm run build')).toBeLessThan(log.indexOf('made-up Vitest file discovery; no tests executed'))
  expect(log.indexOf('made-up Vitest file discovery; no tests executed')).toBeLessThan(log.indexOf('made-up npm test'))
  const commands = commandsMade()
  expect(commands.filter((one) => ['npm', 'vitest'].includes(one.program)).map((one) => `${one.program} ${one.args[0]}`)).toEqual(['npm ci', 'npm run', 'vitest list', 'npm test'])
  const discovery = commands.find((one) => one.program === 'vitest')
  const suite = commands.find((one) => one.program === 'npm' && one.args[0] === 'test')
  expect(discovery.args).toEqual(['list', '--filesOnly', '--json', manifest, '--maxWorkers=7'])
  expect(discovery.env).toEqual(suite.env)
  const containers = commands.filter((one) => one.program === 'docker' && one.args[0] === 'run')
  const discoverContainer = containers.find((one) => one.args.includes('node_modules/.bin/vitest'))
  const suiteContainer = containers.find((one) => one.args.includes('test'))
  expect(discoverContainer.args.slice(0, discoverContainer.args.indexOf('env'))).toEqual(suiteContainer.args.slice(0, suiteContainer.args.indexOf('env')))
  expect(existsSync(join(config.remoteWork!, 'reports', 'expected.json'))).toBe(false)
  expect(readdirSync(config.remoteWork!).some((name) => name.startsWith('.cloud-home-'))).toBe(false)
  expect(git('--git-dir', config.repository!, 'for-each-ref', 'refs/door/')).toBe('')
})

it('manifest mode keeps the actual failed build exit and clears absent suite and manifest artifacts', () => {
  mode('build-fails')
  const manifest = manifestPath()
  const b = box()
  mkdirSync(b.reads, { recursive: true })
  writeFileSync(b.report, 'made-up stale report')
  writeFileSync(join(b.reads, 'stale'), 'made-up stale reads')
  mkdirSync(dirname(manifest), { recursive: true })
  writeFileSync(manifest, 'made-up stale manifest')
  const result = call(20, manifest)
  expect(result.status, result.text).toBe(4)
  expect(result.answer).toMatchObject({ ran: true, phase: 'build', code: 4, buildExitCode: 4, workers: 7, commit, files: 0, failed: [] })
  expect(result.answer).not.toHaveProperty('suiteExitCode')
  for (const path of [manifest, b.report, b.reads]) expect(existsSync(path)).toBe(false)
  expect(readFileSync(b.suiteLog, 'utf8')).toContain('made-up npm run build')
  expect(commandsMade().filter((one) => ['npm', 'vitest'].includes(one.program)).map((one) => `${one.program} ${one.args[0]}`)).toEqual(['npm ci', 'npm run'])
})

it.each(['fails', 'missing', 'empty', 'invalid', 'outside', 'relative', 'shape', 'project', 'address'])('manifest discovery %s returns not run with words, a build exit and no suite evidence', (failure) => {
  mode(`discovery-${failure}`)
  const manifest = manifestPath()
  mkdirSync(dirname(manifest), { recursive: true })
  writeFileSync(manifest, 'made-up stale manifest')
  const result = call(20, manifest)
  expect(result.status, result.text).toBe(75)
  expect(result.answer).toMatchObject({ ran: false, phase: 'discovery', code: 75, buildExitCode: 0, workers: 7, commit, files: 0, failed: [] })
  expect(result.answer.reason).toBe(failure === 'fails' ? 'the cloud box test-file discovery failed' : 'the cloud box test-file discovery returned no valid nonempty manifest')
  expect(result.answer).not.toHaveProperty('suiteExitCode')
  for (const path of [manifest, result.b.report, result.b.reads]) expect(existsSync(path)).toBe(false)
  expect(readFileSync(result.b.suiteLog, 'utf8')).toContain('made-up Vitest file discovery; no tests executed')
  expect(commandsMade().filter((one) => ['npm', 'vitest'].includes(one.program)).map((one) => `${one.program} ${one.args[0]}`)).toEqual(['npm ci', 'npm run', 'vitest list'])
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
})

it('manifest mode refuses invalid, overlapping and address-bearing caller paths before transport', () => {
  const b = box()
  const reason = 'the manifest must be an absolute file path separate from the clone and other artifacts'
  for (const path of ['', 'relative.json', '/', b.clone, `${b.clone}/../expected.json`, config.work!, b.report, join(b.reads, 'manifest.json')]) {
    notRun(call(20, path), reason)
    expect(existsSync(config.calls!)).toBe(false)
  }
  notRun(call(20, join(b.clone, '192.0.2.91.json')), 'a requested path contains an address and cannot be masked without changing its meaning')
  expect(existsSync(config.calls!)).toBe(false)
})

it('manifest mode preserves the exact caller login paths and original absolute test names', () => {
  const callerWork = join(root, 'home', 'made', 'work')
  mkdirSync(dirname(callerWork), { recursive: true })
  renameSync(config.work!, callerWork)
  config.work = callerWork
  login('made')
  mode('manifest-logins')
  const manifest = join(config.work!, 'home', 'made', 'expected with space.json')
  const result = call(20, manifest)
  expect(result.status, result.text).toBe(0)
  expect(JSON.parse(readFileSync(manifest, 'utf8'))[0].file).toBe(join(result.b.clone, 'tests', 'made-up.test.ts'))
  expect(JSON.parse(readFileSync(result.b.report, 'utf8')).testResults[0].name).toBe(join(result.b.clone, 'tests', 'made-up.test.ts'))
  expect(commandsMade().find((one) => one.program === 'vitest').args).toContain(manifest)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
})

it('manifest mode masks project text and keeps punctuation separators', () => {
  login('made')
  mode('manifest-logins')
  const manifest = manifestPath()
  const result = call(20, manifest)
  expect(result.status, result.text).toBe(0)
  const project = JSON.parse(readFileSync(manifest, 'utf8'))[0].projectName
  expect(project).toBe('fixture project at the cloud box:~; :: the cloud box the cloud box')
  for (const text of [result.text, project, readFileSync(result.b.suiteLog, 'utf8')]) {
    for (const secret of ['made@', '/home/made', 'runner.example.invalid', '192.0.2.91', '2001:db8::1']) expect(text).not.toContain(secret)
  }
})

it.each(['manifest-unmasked', 'manifest-not-returned', 'manifest-directory'])('manifest mode refuses %s transfer evidence', (failure) => {
  mode(failure)
  const result = call(20, manifestPath())
  expect(result.status, result.text).toBe(75)
  expect(result.answer).toMatchObject({ ran: false, phase: 'test', buildExitCode: 0, suiteExitCode: 0, reason: failure === 'manifest-unmasked' ? 'the cloud box returned an unmasked address or login' : 'the cloud box returned no expected test manifest at the requested path' })
  expect(existsSync(manifestPath())).toBe(false)
  for (const secret of ['fixture@', '/home/fixture', 'runner.example.invalid', '192.0.2.91']) expect(result.text).not.toContain(secret)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
})

it('manifest mode checks a preexisting remote manifest before discovery', () => {
  mode('manifest-exists')
  notRun(call(20, manifestPath()), 'the cloud box already has a requested output path')
  expect(commandsMade().some((one) => ['npm', 'vitest'].includes(one.program))).toBe(false)
  expect(existsSync(manifestPath())).toBe(false)
  expect(readFileSync(join(config.remoteWork!, 'reports', 'expected.json'), 'utf8')).toBe('made-up existing manifest\n')
})

// Runs alone (criteria 16 to 20). Every red file, every run alone and every exit below is made up.
const alonePath = () => join(config.work!, 'reports', 'alone')
function callAlone(timeoutSec = 40, alone = alonePath()) {
  const b = box(timeoutSec)
  return execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', String(timeoutSec), '--manifest', manifestPath(), '--alone', alone], b.clone, b, (timeoutSec + 20) * 1000)
}
const aloneRuns = () => commandsMade().filter((one) => one.program === 'npm' && one.args[0] === 'test' && one.args.includes('--no-file-parallelism'))

it('a file red beside others and green alone is run alone once, after the one build, and the whole run keeps its verdict', () => {
  mode('flaky')
  const alone = alonePath()
  const result = callAlone()
  expect(result.status, result.text).toBe(1)
  const listed = [{ file: 'tests/made-up.test.ts', n: 1, code: 0 }, { file: 'tests/pending.test.ts', n: 2, code: 0 }]
  expect(result.answer).toMatchObject({ ran: true, phase: 'test', buildExitCode: 0, suiteExitCode: 1, code: 1, files: 3, failed: ['tests/made-up.test.ts'], alone: listed })
  expect(JSON.parse(readFileSync(join(alone, 'index.json'), 'utf8'))).toEqual({ files: listed })
  const commands = commandsMade()
  expect(commands.filter((one) => ['npm', 'vitest'].includes(one.program)).map((one) => `${one.program} ${one.args[0]}`)).toEqual(['npm ci', 'npm run', 'vitest list', 'npm test', 'npm test', 'npm test'])
  expect(commands.filter((one) => one.program === 'docker' && one.args[0] === 'build').length).toBeLessThanOrEqual(1)
  const tests = commands.filter((one) => one.program === 'npm' && one.args[0] === 'test')
  expect(tests[0].args).not.toContain('--no-file-parallelism')
  for (const [index, file] of ['tests/made-up.test.ts', 'tests/pending.test.ts'].entries()) {
    const n = String(index + 1)
    expect(tests[index + 1].args).toEqual(['test', '--', '--no-file-parallelism', '--reporter=default', '--reporter=json', `--outputFile.json=${join(alone, n, 'report.json')}`, file])
    expect(tests[index + 1].env.TEST_READ_RECORD).toBe(join(alone, n, 'reads'))
    for (const key of ['NODE_OPTIONS', 'TEST_READ_ROOT', 'MOLE_OFFICE_WHOLE_SUITE', 'HOME', 'TZ']) expect(tests[index + 1].env[key], key).toBe(tests[0].env[key])
    const report = JSON.parse(readFileSync(join(alone, n, 'report.json'), 'utf8'))
    expect(report.testResults.map((one: { name: string }) => one.name)).toEqual([join(result.b.clone, file)])
    expect(report.testResults[0].message).toContain('the cloud box')
    expect(JSON.stringify(report)).not.toContain('192.0.2.91')
    expect(readFileSync(join(alone, n, 'run.log'), 'utf8')).toContain('made-up npm test -- --no-file-parallelism')
  }
  const containers = commands.filter((one) => one.program === 'docker' && one.args[0] === 'run' && one.args.includes('test'))
  expect(containers).toHaveLength(3)
  const before = (args: string[]) => args.slice(0, args.indexOf('env'))
  for (const container of containers.slice(1)) expect(before(container.args)).toEqual(before(containers[0].args))
  expect(readFileSync(result.b.suiteLog, 'utf8').match(/made-up npm test/g)).toHaveLength(1)
  expect(JSON.parse(readFileSync(result.b.report, 'utf8')).testResults).toHaveLength(3)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(git('--git-dir', config.repository!, 'for-each-ref', 'refs/door/')).toBe('')
}, 60_000)

it('a file red alone keeps its own exit, and the whole run keeps its verdict', () => {
  mode('red-alone')
  const result = callAlone()
  expect(result.status, result.text).toBe(1)
  expect(result.answer).toMatchObject({ ran: true, code: 1, suiteExitCode: 1, failed: ['tests/made-up.test.ts'], alone: [{ file: 'tests/made-up.test.ts', n: 1, code: 3 }, { file: 'tests/pending.test.ts', n: 2, code: 3 }] })
  expect(aloneRuns()).toHaveLength(2)
}, 60_000)

it('runs at most 50 files alone and names every file over that limit', () => {
  mode('many-red')
  const result = callAlone(45)
  expect(result.status, result.text).toBe(1)
  const red = Array.from({ length: 55 }, (_, index) => `tests/red-${String(index + 1).padStart(2, '0')}.test.ts`)
  expect(result.answer.failed).toEqual(red)
  // Every file over the count carries one reason, and a receipt shows its words, so they are pinned.
  const overTheCount = result.answer.alone[50]?.notRun
  expect(overTheCount).toBe('the limit of 50 files run alone was reached')
  expect(result.answer.alone).toEqual([...red.slice(0, 50).map((file, index) => ({ file, n: index + 1, code: 0 })), ...red.slice(50).map((file) => ({ file, notRun: overTheCount }))])
  expect(aloneRuns().map((one) => one.args.at(-1))).toEqual(red.slice(0, 50))
}, 90_000)

it('stops a run alone at the time limit, keeps its cut exit and names the files not run', () => {
  mode('slow-alone')
  const started = Date.now()
  const result = callAlone(18)
  expect(result.status, result.text).toBe(1)
  expect(result.answer).toMatchObject({ ran: true, code: 1, suiteExitCode: 1, failed: ['tests/made-up.test.ts'], alone: [{ file: 'tests/made-up.test.ts', n: 1, code: 124 }, { file: 'tests/pending.test.ts', notRun: 'the time limit for runs alone was reached' }] })
  expect(aloneRuns()).toHaveLength(1)
  expect(Date.now() - started).toBeLessThan(18_000)
  expect(existsSync(join(config.home!, 'container-running'))).toBe(false)
}, 60_000)

it('a green whole run runs nothing alone and lists nothing, and a failed build returns no alone folder', () => {
  mode('green')
  const green = callAlone()
  expect(green.status, green.text).toBe(0)
  expect(green.answer).toMatchObject({ ran: true, code: 0, suiteExitCode: 0, failed: [], alone: [] })
  expect(JSON.parse(readFileSync(join(alonePath(), 'index.json'), 'utf8'))).toEqual({ files: [] })
  expect(aloneRuns()).toHaveLength(0)
  mode('build-fails')
  const build = callAlone()
  expect(build.status, build.text).toBe(4)
  expect(build.answer).toMatchObject({ ran: true, phase: 'build', code: 4 })
  expect(build.answer).not.toHaveProperty('alone')
  expect(existsSync(alonePath())).toBe(false)
}, 60_000)

it('refuses --alone without the manifest, repeated, misspelt, or at a folder that is not its own, before transport', () => {
  const b = box()
  const base = [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', '20']
  const asked = (...words: string[]) => execute(process.execPath, [...base, ...words], b.clone, b)
  notRun(asked('--alone', alonePath()), 'the runs alone need the manifest')
  notRun(asked('--manifest', manifestPath(), '--alone', alonePath(), '--alone', alonePath()), 'the cloud suite arguments are incomplete or repeated')
  notRun(asked('--manifest', manifestPath(), '--alone-limit', '30'), 'the cloud suite arguments are incomplete or repeated')
  notRun(asked('--manifest', manifestPath(), '--alone'), 'the cloud suite arguments are incomplete or repeated')
  for (const path of ['', 'relative', '/', `${alonePath()}/`, `${b.clone}/../alone`, b.clone, join(b.clone, 'alone'), config.work!, dirname(b.report), b.report, join(b.reads, 'alone'), b.suiteLog, manifestPath(), join(manifestPath(), 'alone')]) {
    notRun(asked('--manifest', manifestPath(), '--alone', path), 'the alone folder must be an absolute folder path separate from the clone and other artifacts')
  }
  notRun(callAlone(20, join(config.work!, '192.0.2.91')), 'a requested path contains an address and cannot be masked without changing its meaning')
  expect(existsSync(config.calls!)).toBe(false)
})

// The startup journals (criterion 22). Every journal, build-lock line, login and secret below is made up.
type AJournalFound = { from: string; file?: string; bytes: number; keptBytes?: number; cut?: string; notKept?: string }
type TheJournalsIndex = { oneAtMost: number; allAtMost: number; lookedFor: string[]; files: AJournalFound[] }
const journalsPath = () => join(config.work!, 'reports', 'suite-startup-journals')
const theJournalsIndex = () => JSON.parse(readFileSync(join(journalsPath(), 'index.json'), 'utf8')) as TheJournalsIndex
/** A journal's name as tests/a-start-keeps-its-waits.ts makes it: a sha256 of 64 hex digits and a process id. */
const aJournal = (n: number) => `setup-waits-${String(n).padStart(2, '0').repeat(32)}-${String(4000 + n)}.jsonl`
/** What the made-up suite leaves in the clone: each journal as a line written so many times, and each lock's owner line. */
function leaves(files: { name: string; line: string; times: number }[], locks: Record<string, string> = {}) {
  config.journals = JSON.stringify({ files, locks })
  writeFileSync(join(root, 'fixture-key'), JSON.stringify(config))
}
/** The bounds, read from the module by its path so this file type-checks before the module is there. */
async function theJournalBounds() {
  const module = (await import(join(REPO, 'tools', 'cloud-suite-journals.mjs'))) as object
  const one = Reflect.get(module, 'ONE_JOURNAL_KEEPS_AT_MOST') as number | undefined
  const all = Reflect.get(module, 'THE_JOURNALS_KEEP_AT_MOST') as number | undefined
  expect(one, 'tools/cloud-suite-journals.mjs names the bound of one journal').toBeTypeOf('number')
  expect(all, 'tools/cloud-suite-journals.mjs names the bound of all the journals').toBeTypeOf('number')
  return { one: one!, all: all! }
}

it('keeps the startup journals and a build lock\'s owner line beside the suite log, masked as a printed line, and the box keeps no copy', () => {
  const secret = `${JSON.stringify({ who: 'made-up liveApp', what: 'made-up start with MOLE_AGENT_KEY=made-up-agent-key-value and token: made-up-token-value for someone@example.invalid in /home/someone/office at 192.0.2.7 then a wait', at: 1 })}\n`
  const plain = `${JSON.stringify({ who: 'made-up page build', what: 'made-up wait for the page build lock', at: 2 })}\n`
  const owner = 'process 4242\n'
  leaves([{ name: aJournal(2), line: plain, times: 3 }, { name: aJournal(1), line: secret, times: 1 }], { web: owner })
  const result = call()
  expect(result.status, result.text).toBe(0)
  const folder = journalsPath()
  expect(result.answer).toMatchObject({ ran: true, code: 0, failed: [], journals: { folder, files: 3, cut: 0, notKept: 0 } })
  expect(theJournalsIndex().files).toEqual([
    { from: `.logs/${aJournal(1)}`, file: aJournal(1), bytes: Buffer.byteLength(secret), keptBytes: Buffer.byteLength(secret) },
    { from: `.logs/${aJournal(2)}`, file: aJournal(2), bytes: Buffer.byteLength(plain) * 3, keptBytes: Buffer.byteLength(plain) * 3 },
    { from: 'dist/web-for-tests-lock/who.txt', file: 'web-for-tests-lock-who.txt', bytes: Buffer.byteLength(owner), keptBytes: Buffer.byteLength(owner) },
  ])
  expect(readdirSync(folder).sort()).toEqual([aJournal(1), aJournal(2), 'index.json', 'web-for-tests-lock-who.txt'].sort())
  expect(readFileSync(join(folder, aJournal(2)), 'utf8')).toBe(plain.repeat(3))
  expect(readFileSync(join(folder, 'web-for-tests-lock-who.txt'), 'utf8')).toBe(owner)
  const masked = readFileSync(join(folder, aJournal(1)), 'utf8')
  for (const shown of ['made-up-agent-key-value', 'made-up-token-value', 'someone@example.invalid', '/home/someone', '192.0.2.7']) expect(masked, shown).not.toContain(shown)
  expect(masked).toContain('made-up start with MOLE_AGENT_KEY=')
  expect(masked).toContain(' in ~/office at ')
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
  expect(existsSync(join(config.remoteWork!, 'reports', 'suite-startup-journals')), 'the box keeps no copy of the journals').toBe(false)
})

it('cuts a journal over the bound of one file to its whole lines and says so, and keeps no more than the bound of all', async () => {
  const { one, all } = await theJournalBounds()
  const row = `${JSON.stringify({ who: 'made-up stage', what: `made-up wait ${'.'.repeat(100)}`, at: 3 })}\n`
  const fits = Math.floor(one / row.length)
  // Enough files each under the bound of one to pass the bound of all.
  const more = Math.ceil(all / ((fits - 1) * row.length)) + 2
  const names = Array.from({ length: more + 1 }, (_, at) => aJournal(at + 1))
  leaves([{ name: names[0]!, line: row, times: fits + 5 }, ...names.slice(1).map((name) => ({ name, line: row, times: fits - 1 }))])
  const result = call()
  expect(result.status, result.text).toBe(0)
  const index = theJournalsIndex()
  expect(index).toMatchObject({ oneAtMost: one, allAtMost: all })
  expect(index.files.map((found) => found.from)).toEqual(names.map((name) => `.logs/${name}`))
  const first = index.files[0]!
  expect(first).toMatchObject({ file: names[0], bytes: (fits + 5) * row.length, keptBytes: fits * row.length })
  expect(first.cut, 'the cut names the bound of one file').toContain(String(one))
  const lines = readFileSync(join(journalsPath(), names[0]!), 'utf8').split('\n')
  expect(lines.slice(0, fits)).toEqual(Array.from({ length: fits }, () => row.trimEnd()))
  expect(JSON.parse(lines[fits]!), 'the file ends by saying it was cut').toEqual({ cut: first.cut })
  expect(lines.slice(fits + 1)).toEqual([''])
  const kept = index.files.filter((found) => found.notKept === undefined)
  const notKept = index.files.filter((found) => found.notKept !== undefined)
  expect(kept.reduce((sum, found) => sum + found.keptBytes!, 0)).toBeLessThanOrEqual(all)
  expect(notKept.length).toBeGreaterThan(0)
  for (const found of notKept) {
    expect(found.notKept, 'a file not kept names the bound of all').toContain(String(all))
    expect(found.file).toBeUndefined()
  }
  expect(index.files.indexOf(notKept[0]!), 'once the bound of all is spent, no later file is kept').toBe(kept.length)
  expect(readdirSync(journalsPath()).sort()).toEqual([...kept.map((found) => found.file!), 'index.json'].sort())
  expect(result.answer.journals).toEqual({ folder: journalsPath(), files: kept.length, cut: index.files.filter((found) => found.cut !== undefined).length, notKept: notKept.length })
}, 60_000)

it('a failed build keeps no journals, and a folder beside the log that is another output is refused before transport', () => {
  leaves([{ name: aJournal(1), line: '{"who":"made-up","what":"made-up","at":4}\n', times: 1 }])
  mode('build-fails')
  const build = call()
  expect(build.status, build.text).toBe(4)
  expect(build.answer).toMatchObject({ ran: true, code: 4 })
  expect(build.answer).not.toHaveProperty('journals')
  expect(existsSync(journalsPath())).toBe(false)
  rmSync(config.calls!)
  const b = box()
  const asked = (report: string) => execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', '20'], b.clone, b)
  for (const report of [journalsPath(), join(journalsPath(), 'suite.json')]) {
    notRun(asked(report), 'the startup journals folder beside the log must be separate from the clone and the other outputs')
  }
  expect(existsSync(config.calls!)).toBe(false)
})

// THE RUNNER'S SHARE-A-PROCESS SWITCH (criterion 25). The box's own command log says which environment each command
// got. The stand-in keeps the run script the box got, and a case compares it with an unset run's script of the same
// commit, with only the run's token and its seconds left taken out, since those two differ in every run.
const SHARE = 'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS'
const PASSED = ` "${SHARE}=on"`
const RECORDER = '"NODE_OPTIONS=--import=$clone/tools/record-what-tests-read.mjs" "TEST_READ_ROOT=$clone"'
function sharing(value: string | undefined) {
  if (value === undefined) delete env[SHARE]
  else env[SHARE] = value
}
function theRunScript() {
  const script = readFileSync(join(config.scripts!, 'run.sh'), 'utf8')
  const token = script.match(/mole-cloud-([0-9a-f]{24})/)?.[1]
  expect(token, 'the run script names its container by the run\'s token').toBeDefined()
  return script.replaceAll(token!, '<token>')
    .replace(/(--kill-after=3 )'[0-9.]+'( bash -s <<'CLOUD_WORKER')/, "$1'<seconds>'$2")
    .replaceAll(/worker_started \+ -?\d+/g, 'worker_started + <seconds>')
}
/** A run with a file red in the whole run, so discovery, the whole run and two runs alone all happen. */
function aRunWithRunsAlone(value: string | undefined) {
  sharing(value)
  rmSync(config.commands!, { force: true })
  const result = callAlone()
  expect(result.status, result.text).toBe(1)
  const commands = commandsMade()
  const whole = commands.filter((one) => one.program === 'npm' && one.args[0] === 'test' && !one.args.includes('--no-file-parallelism'))
  const discovery = commands.filter((one) => one.program === 'vitest' && one.args[0] === 'list')
  expect(whole).toHaveLength(1)
  expect(discovery).toHaveLength(1)
  expect(aloneRuns()).toHaveLength(2)
  return { answer: result.answer, script: theRunScript(), whole: whole[0].env[SHARE], discovery: discovery[0].env[SHARE], alone: aloneRuns().map((one) => one.env[SHARE]) }
}
function keepingTheScripts() {
  config.scripts = join(root, 'scripts')
  mkdirSync(config.scripts)
  mode('flaky')
}

it('passes no share-a-process switch when the variable is unset, and the box gets the commands it got before the switch', () => {
  keepingTheScripts()
  const unset = aRunWithRunsAlone(undefined)
  expect(unset.answer).toMatchObject({ ran: true, code: 1, filesShareAProcess: false })
  expect([unset.whole, unset.discovery, ...unset.alone]).toEqual([undefined, undefined, undefined, undefined])
  expect(unset.script).not.toContain(SHARE)
  expect(unset.script).toContain(`run_logged env ${RECORDER} "TEST_READ_RECORD=$reads" "MOLE_OFFICE_WHOLE_SUITE=yes" npm test -- "--maxWorkers=$workers" `)
  expect(unset.script).toContain(`run_logged env ${RECORDER} "TEST_READ_RECORD=$reads" "MOLE_OFFICE_WHOLE_SUITE=yes" node_modules/.bin/vitest list `)
  expect(unset.script).toContain(`run_logged env ${RECORDER} "TEST_READ_RECORD=$alone/$n/reads" "MOLE_OFFICE_WHOLE_SUITE=yes" timeout `)
}, 90_000)

it('passes the switch to discovery and the whole run when the variable is exactly on, never to a run alone, and says so', () => {
  keepingTheScripts()
  const unset = aRunWithRunsAlone(undefined)
  const on = aRunWithRunsAlone('on')
  expect(on.answer).toMatchObject({ ran: true, code: 1, filesShareAProcess: true })
  expect(on.whole, 'the whole run').toBe('on')
  expect(on.discovery, 'discovery reads the configuration the whole run reads').toBe('on')
  expect(on.alone, 'a run alone').toEqual([undefined, undefined])
  expect(on.script.split(PASSED), 'the switch is in the script twice, for discovery and the whole run').toHaveLength(3)
  expect(on.script.replaceAll(PASSED, ''), 'the switch is all that is added').toBe(unset.script)
}, 120_000)

it.each(['off', 'yes'])('passes no switch when the variable is %s, and the box gets the script of an unset run', (value) => {
  keepingTheScripts()
  const unset = aRunWithRunsAlone(undefined)
  const other = aRunWithRunsAlone(value)
  expect(other.answer).toMatchObject({ ran: true, code: 1, filesShareAProcess: false })
  expect([other.whole, other.discovery, ...other.alone]).toEqual([undefined, undefined, undefined, undefined])
  expect(other.script).toBe(unset.script)
}, 120_000)

it('says whether the switch was passed in the answer of a failed build too', () => {
  mode('build-fails')
  for (const [value, passed] of [[undefined, false], ['on', true]] as const) {
    sharing(value)
    const build = call()
    expect(build.status, build.text).toBe(4)
    expect(build.answer).toMatchObject({ ran: true, code: 4, filesShareAProcess: passed })
  }
})

// Files carried over from the last receipt run alone first (criterion 26). Every file and result below is made up.
function callCarried(carried: string, timeoutSec = 45) {
  const b = box(timeoutSec)
  return execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', String(timeoutSec), '--manifest', manifestPath(), '--alone', alonePath(), '--carried-over', carried], b.clone, b, (timeoutSec + 20) * 1000)
}
const ranAlone = () => aloneRuns().map((one) => one.args.at(-1))

it('runs the carried-over files that are red again alone first, then the other red files in sorted order, within the limit of 50', () => {
  mode('many-red')
  // Both carried-over files come after the 50th in sorted order, so only being put first runs them alone.
  const carried = ['tests/red-53.test.ts', 'tests/red-51.test.ts']
  const result = callCarried(JSON.stringify(carried))
  expect(result.status, result.text).toBe(1)
  const red = Array.from({ length: 55 }, (_, index) => `tests/red-${String(index + 1).padStart(2, '0')}.test.ts`)
  const order = [...carried, ...red.filter((file) => !carried.includes(file))]
  expect(result.answer.failed).toEqual(red)
  expect(result.answer.carriedOverFirst).toEqual(carried)
  expect(result.answer.alone).toEqual([...order.slice(0, 50).map((file, index) => ({ file, n: index + 1, code: 0 })), ...order.slice(50).map((file) => ({ file, notRun: expect.any(String) }))])
  expect(JSON.parse(readFileSync(join(alonePath(), 'index.json'), 'utf8'))).toEqual({ files: result.answer.alone })
  expect(ranAlone()).toEqual(order.slice(0, 50))
}, 90_000)

it('runs no carried-over file alone that the whole run passed or did not name, and the one red again goes first', () => {
  mode('flaky')
  const result = callCarried(JSON.stringify(['tests/other.test.ts', 'tests/gone.test.ts', 'tests/pending.test.ts']))
  expect(result.status, result.text).toBe(1)
  expect(result.answer.carriedOverFirst).toEqual(['tests/pending.test.ts'])
  expect(result.answer.alone).toEqual([{ file: 'tests/pending.test.ts', n: 1, code: 0 }, { file: 'tests/made-up.test.ts', n: 2, code: 0 }])
  expect(ranAlone()).toEqual(['tests/pending.test.ts', 'tests/made-up.test.ts'])
}, 60_000)

it('refuses --carried-over without --alone, repeated, or not a list of distinct clean paths inside the clone, before transport', () => {
  const b = box()
  const base = [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', '20', '--manifest', manifestPath()]
  const asked = (...words: string[]) => execute(process.execPath, [...base, ...words], b.clone, b)
  const refused = (result: ReturnType<typeof asked>, list: string) => {
    expect(result.status, `${list}: ${result.text}`).toBe(75)
    expect(result.answer, list).toMatchObject({ ran: false, reason: expect.stringMatching(/\S/) })
  }
  refused(asked('--carried-over', '["tests/a.test.ts"]'), 'without --alone')
  refused(asked('--alone', alonePath(), '--carried-over', '["tests/a.test.ts"]', '--carried-over', '["tests/b.test.ts"]'), 'repeated')
  for (const list of ['tests/a.test.ts', '{}', '[7]', '[""]', '["tests/a.test.ts","tests/a.test.ts"]', `["${b.clone}/tests/a.test.ts"]`, '["../a.test.ts"]', '["tests/../a.test.ts"]', '["tests//a.test.ts"]', '["./tests/a.test.ts"]', '["tests/192.0.2.91.test.ts"]']) {
    refused(asked('--alone', alonePath(), '--carried-over', list), list)
  }
  expect(existsSync(config.calls!)).toBe(false)
})

// A whole run that stops moving (criterion 27). The suites below are made up and run by the real vitest of this
// checkout on the stand-in box, so the workers, their kernel waits and their read records are real. The quiet spell is
// shortened to a few seconds through the variable the door reads only under the test mark.
const QUIET = 'MOLE_OFFICE_CLOUD_QUIET_SPELL_SECONDS'
const SPELL_SEC = 6
const MADE_UP_CONFIG = 'export default { test: { globals: true, include: ["tests/**/*.test.mjs"], pool: "forks" } }\n'
const BLOCKS = `import { execFileSync } from 'node:child_process'
import { openSync } from 'node:fs'
it('opens a named pipe nobody writes to', () => {
  execFileSync('mkfifo', ['made-up.fifo'])
  openSync('made-up.fifo', 'r')
}, 600_000)
`
const LEAVES = `import { spawn } from 'node:child_process'
it('leaves a process behind when it ends', () => {
  spawn('sleep', ['120'], { stdio: 'ignore' }).unref()
})
`
// One process on one core for a few seconds past the spell, ended when its case ends: not a stress test.
const BUSY = `it('keeps one core busy past the quiet spell', () => {
  const until = Date.now() + ${String((SPELL_SEC + 4) * 1000)}
  while (Date.now() < until) { /* busy on purpose */ }
}, 60_000)
`
const TALKS = `it('prints a line every second and uses next to no CPU', async () => {
  for (let n = 0; n < ${String(SPELL_SEC + 4)}; n++) { console.log('made-up line'); await new Promise((done) => setTimeout(done, 1000)) }
}, 60_000)
`
function aMadeUpSuite(files: Record<string, string>) {
  const clone = join(config.work!, 'clone')
  writeFileSync(join(clone, 'made-up.vitest.config.mjs'), MADE_UP_CONFIG)
  mkdirSync(join(clone, 'tests'), { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(clone, 'tests', name), text)
  git('-C', clone, 'add', '.')
  git('-C', clone, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'made-up suite for the real vitest')
  commit = git('-C', clone, 'rev-parse', 'HEAD')
  config.vitest = join(REPO, 'node_modules', 'vitest', 'vitest.mjs')
  env[QUIET] = String(SPELL_SEC)
  mode('real-vitest')
}
function callTheRealSuite(timeoutSec: number) {
  const b = box(timeoutSec)
  return execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', b.suiteLog, '--timeout', String(timeoutSec)], b.clone, b, (timeoutSec + 20) * 1000)
}
const gone = (pid: number) => { try { process.kill(pid, 0); return false } catch { return true } }

it('ends a whole run whose test blocks opening a named pipe within the quiet spell and a minute, names its file and wait, and the queue takes it as not run', async () => {
  aMadeUpSuite({ 'blocks.test.mjs': BLOCKS, 'leaves.test.mjs': LEAVES })
  const b = box(SPELL_SEC + 60)
  const started = Date.now()
  const ran = await aSuiteOnTheBoxOrHere({ label: 'fixture-suite', box: b, door: DOOR, theRealDoor: join(root, 'some-other-door'), env,
    log: () => {}, hereIs: 'the made-up local runner', here: async () => ({ code: 0 }),
    run: async (_label: string, command: string, args: string[], options: { cwd: string }) => { const result = execute(command, args, options.cwd, b, (SPELL_SEC + 90) * 1000); return { code: result.status, signal: result.signal, timedOut: false, outFile: join(root, 'door-output.log') } },
  })
  expect(Date.now() - started).toBeLessThan((SPELL_SEC + 60) * 1000)
  const said = JSON.parse(readFileSync(join(root, 'door-output.log'), 'utf8').trim().split('\n').at(-1)!)
  expect(ran).toMatchObject({ where: 'here' })
  expect(said).toMatchObject({ ran: false, phase: 'test', buildExitCode: 0, hung: { quietSec: SPELL_SEC } })
  expect(said, 'the suite did not end by itself').not.toHaveProperty('suiteExitCode')
  expect(said.hung.workers).toEqual([{ pid: expect.any(Number), wait: 'wait_for_partner', file: 'tests/blocks.test.mjs' }])
  expect(said.hung.leftBehind).toEqual([{ pid: expect.any(Number), command: 'sleep', wait: expect.stringMatching(/\S/) }])
  expect(said.reason).toContain('tests/blocks.test.mjs')
  expect(said.reason).toContain('wait_for_partner')
  for (const { pid } of [...said.hung.workers, ...said.hung.leftBehind]) expect(gone(pid), String(pid)).toBe(true)
  expect(existsSync(join(config.home!, 'container-running'))).toBe(false)
  expect(existsSync(join(config.remoteWork!, 'clone'))).toBe(false)
}, 150_000)

it('never ends a whole run whose test keeps the CPU busy past the quiet spell', () => {
  aMadeUpSuite({ 'busy.test.mjs': BUSY })
  const started = Date.now()
  const result = callTheRealSuite(SPELL_SEC + 60)
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, files: 1, failed: [] })
  expect(result.answer).not.toHaveProperty('hung')
  expect(Date.now() - started).toBeGreaterThan((SPELL_SEC + 4) * 1000)
}, 120_000)

it('never ends a whole run whose test keeps printing while it uses next to no CPU', () => {
  aMadeUpSuite({ 'talks.test.mjs': TALKS })
  const result = callTheRealSuite(SPELL_SEC + 60)
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, files: 1, failed: [] })
  expect(result.answer).not.toHaveProperty('hung')
}, 120_000)

// CRITERION 28: the blob report beside the JSON report.
const BLOB_BOUND = 'MOLE_OFFICE_CLOUD_BLOB_BYTES'

it('the whole run writes the blob report beside the JSON report, and it comes back masked while the answer stays the same', () => {
  mode('green')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, files: 1, failed: [] })
  const container = commandsMade().find((one) => one.program === 'docker' && one.args.includes('test'))
  expect(container.args).toEqual(expect.arrayContaining(['--reporter=blob', `--outputFile.blob=${result.b.report}.blob`, `--outputFile.json=${result.b.report}`]))
  const blob = readFileSync(`${result.b.report}.blob`, 'utf8')
  expect(JSON.parse(blob)).toEqual({ fixture: true, blob: 'made-up blob of made-up.test.ts at the cloud box' })
  expect(blob).not.toContain('192.0.2.91')
})

it('a blob report over its bound is not kept and the log says so, and the run is answered as before', () => {
  env[BLOB_BOUND] = '1024'
  mode('blob-too-big')
  const result = call()
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, commit, files: 1, failed: [] })
  expect(existsSync(`${result.b.report}.blob`)).toBe(false)
  expect(readFileSync(result.b.suiteLog, 'utf8')).toContain('the blob report was 4096 bytes, over the 1024 it may keep, so it is not kept')
})

it('a blob report path that is another output is refused before transport', () => {
  mode('green')
  const b = box()
  const result = execute(process.execPath, [DOOR, 'run', '--clone', b.clone, '--commit', commit, '--report', b.report, '--reads', b.reads, '--log', `${b.report}.blob`, '--timeout', '20'], b.clone, b)
  notRun(result, 'the blob report beside the report is, or lies in, another output')
  expect(existsSync(config.calls!)).toBe(false)
})

it('the real vitest writes a blob report the door hands back beside the JSON report', () => {
  const clone = join(config.work!, 'clone')
  writeFileSync(join(clone, 'made-up.vitest.config.mjs'), MADE_UP_CONFIG)
  mkdirSync(join(clone, 'tests'), { recursive: true })
  writeFileSync(join(clone, 'tests', 'quick.test.mjs'), "it('passes at once', () => {})\n")
  git('-C', clone, 'add', '.')
  git('-C', clone, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'made-up suite for the real vitest blob')
  commit = git('-C', clone, 'rev-parse', 'HEAD')
  config.vitest = join(REPO, 'node_modules', 'vitest', 'vitest.mjs')
  mode('real-vitest')
  const result = callTheRealSuite(60)
  expect(result.status, result.text).toBe(0)
  expect(result.answer).toMatchObject({ ran: true, code: 0, files: 1, failed: [] })
  const blob = readFileSync(`${result.b.report}.blob`, 'utf8')
  expect(Array.isArray(JSON.parse(blob))).toBe(true)
  expect(blob).toContain('quick.test.mjs')
})
