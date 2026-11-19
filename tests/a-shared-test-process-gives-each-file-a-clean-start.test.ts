// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST FILE THAT SHARES A PROCESS WITH AN EARLIER FILE STARTS AS IT WOULD IN A PROCESS OF ITS OWN.
 *
 * With MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS on, vitest.config.ts runs file after file in one process,
 * and tests/a-file-in-a-shared-process-starts-clean.ts takes back what each file leaves behind. This is
 * its proof. It runs the checkout's own vitest, with the checkout's own config, on two fixture files in
 * a folder made here, never in the checkout's own tests/:
 *   - THE CANARY. Each fixture file first checks that it starts clean and then leaves something behind
 *     on purpose: a changed module value, an environment variable, a global, the named timers' observer
 *     of the garbage collector, a browser launched on its own time zone, another working folder, a
 *     faked clock, a mocked module, better-sqlite3's statements wrapped to count them, schemas built with
 *     zod around an object of its own, the tests' helpers it loaded, and a spy and a mock made around
 *     objects of its own. The two files
 *     are the same apart from their names and the zone each sets, so it does not matter which of them
 *     vitest runs first.
 *   - THE CLEAN START. Both files run in one process, the second after the first, and every case of
 *     both passes. So the second file found none of what the first left.
 *   - WITH THE SWITCH OFF, the same two files run in two processes, as every test file did before.
 *
 * WHAT GOES RED. Take the loop that resets the last file's modules out of `startClean`, and the second
 * file finds the module value the first one changed. Each of the other things a file leaves behind has
 * a mutation of its own; the commit message and the report name them and what each turned red.
 *
 * THE BROWSER'S ZONE. Chromium takes its time zone from the environment it is launched in. Take the
 * closing of the shared browser out of `startClean`, and the second file's page answers with the zone
 * the first file set. That is how the agent page's test went red after another file in wave 13n
 * round M: "This computer's clock is Europe/London", beside an office on Asia/Shanghai.
 *
 * THE NAMED TIMERS' OBSERVER. src/server/lib/named-timers.ts keeps one observer of the garbage collector
 * for the whole process, under a global. Take that global out of what `startClean` keeps, and the second
 * file's import starts a second observer beside the first, which is still running (problem 20MmS7mSGmXu).
 *
 * WHAT AN EARLIER FILE LEAVES ALIVE. A canary keeps a weak reference on the process to what it built,
 * and the next canary checks after the clean start's collection that nothing it refers to is alive.
 *   - zod keeps the first schema of each kind it builds for as long as zod is loaded, and with it
 *     everything that schema refers to. Loaded once for the whole process, it kept the first two test
 *     files' copies of the server, each about 200 MB, with their databases. Let zod be loaded once per
 *     process again, by taking `zod` out of what vitest.config.ts loads for each file, and the second
 *     file finds alive the zod the first loaded and an object the first file's schema closes over.
 *   - A handler on `process` lasts as long as the process, and keeps alive the module it was written
 *     in, with everything that module imports. The tests' helpers put their handlers in place when the
 *     first file loaded them, and so kept that file's helpers, its copy of the server and its database
 *     for every file after it. Write those handlers in tests/helpers.ts again, and the second file finds
 *     alive the helpers the first loaded, and the zod the first loaded with them.
 *   - vitest keeps every mock a file makes, and each mock keeps the object a spy was put on and the
 *     function a mock was made from. Take out the emptying of that list, in `startClean`, and the
 *     second file finds alive what the first made a mock of.
 *
 * AN EXCEPTION NOBODY CATCHES FAILS THE RUN, AND THE SERVERS STILL GO. A fixture file starts a stand-in
 * server in a process group of its own, gives the group to tests/what-a-test-process-takes-with-it.ts as
 * tests/helpers.ts gives it its servers, and throws from a timer while its case waits. With the switch on
 * and off, the run must end with a failure whose words name the error, and the stand-in must be gone
 * when the run has ended. vitest 4 reports such an exception only when its own `uncaughtException`
 * listener is the only one, so a second listener in that module hid it and the run passed. The same
 * fixture run by plain Node must end with code 1, print the error and leave the stand-in gone: that is
 * the module's `exit` handler. Take the `exit` handler out, and the stand-in is still running.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readSetting } from '../src/config/settings.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
const THE_SWITCH = 'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS'
/** The module that counts a request's statements, by wrapping better-sqlite3's statement methods. */
const SLOW_REQUESTS = join(ROOT, 'src', 'server', 'lib', 'slow-requests.ts')
/** The module that keeps one observer of the garbage collector for the whole process. */
const NAMED_TIMERS = join(ROOT, 'src', 'server', 'lib', 'named-timers.ts')
/** The tests' helpers, whose shared browser a canary takes. */
const HELPERS = join(ROOT, 'tests', 'helpers.ts')
/** zod, as the server's own `import 'zod'` finds it. */
const ZOD = fileURLToPath(import.meta.resolve('zod'))

/** The time zone a canary sets before it takes the shared browser, a different one for each. */
function theZoneOf(name: string): string {
  return name === THE_CANARIES[0] ? 'Asia/Shanghai' : 'America/New_York'
}

/** Every folder this file made, removed when it is done. */
const MADE: string[] = []
afterAll(() => {
  for (const folder of MADE) rmSync(folder, { recursive: true, force: true })
})

/**
 * One canary file. Every case checks one thing a new process would give it, and then changes that
 * thing for whichever file comes next. `it`, `expect` and `vi` are the runner's globals, because the
 * fixture folder has no node_modules to import them from.
 */
function aCanaryFile(name: string): string {
  return `import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { PerformanceObserver } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { box } from './state.ts'

const NAME = '${name}'
const ZONE = '${theZoneOf(name)}'
const HERE = dirname(fileURLToPath(import.meta.url))
const SEEN = HERE + '/seen.jsonl'

/** What an earlier file referred to weakly under \`key\` on the process, and which is still alive, in one line. */
function whatIsStillAliveOf(key: string): string {
  const left = (process as unknown as Record<string, { what: string; ref: WeakRef<object> }[] | undefined>)[key] ?? []
  return left.filter((one) => one.ref.deref() !== undefined).map((one) => one.what).join('; ')
}

/** Refers weakly to what this file made, for the next file in the process to look for. */
function leaveForTheNextFile(key: string, left: { what: string; ref: WeakRef<object> }[]): void {
  ;(process as unknown as Record<string, unknown>)[key] = left
}

it('writes down its process, the folder it started in and how many files ran before it', () => {
  const before = existsSync(SEEN) ? readFileSync(SEEN, 'utf8').split('\\n').filter(Boolean).length : 0
  appendFileSync(SEEN, JSON.stringify({ name: NAME, pid: process.pid, cwd: process.cwd(), before }) + '\\n')
})

// Before any case that imports the server: zod keeps the first schema of each kind it builds.
it('finds gone the zod an earlier file loaded, and what that file built schemas around', async () => {
  const alive = whatIsStillAliveOf('leftByACanarysSchemas')
  expect(alive, 'Still alive from an earlier file: ' + alive).toBe('')
  const { z } = await import(${JSON.stringify(ZOD)})
  const held = { by: NAME }
  z.object({ name: z.string().transform((text: string) => text + held.by) })
  leaveForTheNextFile('leftByACanarysSchemas', [
    { what: 'the zod ' + NAME + ' loaded', ref: new WeakRef(z.ZodType) },
    { what: 'an object a schema of ' + NAME + ' closes over', ref: new WeakRef(held) },
  ])
})

it('finds the module value the module sets', () => {
  expect(box.value).toBe('fresh')
  box.value = 'changed by ' + NAME
})

it('finds no environment variable an earlier file set', () => {
  expect(process.env.LEFT_BEHIND_BY_A_CANARY).toBeUndefined()
  process.env.LEFT_BEHIND_BY_A_CANARY = NAME
})

it('finds no global an earlier file set', () => {
  expect('leftBehindByACanary' in globalThis).toBe(false)
  ;(globalThis as Record<string, unknown>).leftBehindByACanary = NAME
})

it('finds one observer of the garbage collector in its process, however many files loaded the named timers', async () => {
  // Every observer made from here on is counted on the process, which outlives each file. Node's own modules
  // are loaded once per process, so the counting stays in place for the next file.
  const counted = process as unknown as { gcObserversACanaryCounted?: number }
  if (counted.gcObserversACanaryCounted === undefined) {
    counted.gcObserversACanaryCounted = 0
    const observe = PerformanceObserver.prototype.observe
    PerformanceObserver.prototype.observe = function (this: PerformanceObserver, options: Parameters<typeof observe>[0]) {
      if (JSON.stringify(options).includes('"gc"')) counted.gcObserversACanaryCounted! += 1
      return observe.call(this, options)
    }
  }
  await import(${JSON.stringify(NAMED_TIMERS)})
  expect(counted.gcObserversACanaryCounted).toBe(1)
})

it('opens its pages on a browser that runs on the time zone it set', async () => {
  process.env.TZ = ZONE
  const { theBrowserThisWorkerShares } = await import(${JSON.stringify(HELPERS)})
  const context = await (await theBrowserThisWorkerShares()).newContext()
  try {
    const page = await context.newPage()
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(ZONE)
  } finally {
    await context.close()
  }
}, 60_000)

// After the case that loads the helpers: the first file to load them puts the handlers on \`process\` in place.
it('finds gone the helpers an earlier file loaded', async () => {
  const alive = whatIsStillAliveOf('leftByACanarysHelpers')
  expect(alive, 'Still alive from an earlier file: ' + alive).toBe('')
  const { theBrowserThisWorkerShares } = await import(${JSON.stringify(HELPERS)})
  leaveForTheNextFile('leftByACanarysHelpers', [{ what: 'the helpers ' + NAME + ' loaded', ref: new WeakRef(theBrowserThisWorkerShares) }])
})

it('starts in the folder the run started in', () => {
  expect(process.cwd()).not.toBe(HERE)
  process.chdir(HERE)
})

it('has a real clock', () => {
  expect(vi.isFakeTimers()).toBe(false)
  vi.useFakeTimers()
})

it('imports a module as it is, and not as an earlier file mocked it', async () => {
  expect((await import('./word.ts')).word).toBe('real')
  vi.doMock('./word.ts', () => ({ word: 'mocked by ' + NAME }))
})

it('counts the statements of a database it measures', async () => {
  const { aFreshCount, countedTo, measureTheStatementsOf } = await import(${JSON.stringify(SLOW_REQUESTS)})
  const Database = createRequire(${JSON.stringify(join(ROOT, 'package.json'))})('better-sqlite3')
  const handle = new Database(':memory:')
  try {
    measureTheStatementsOf(handle)
    const count = aFreshCount()
    countedTo(count, () => handle.prepare('SELECT 1').get())
    expect(count.statements).toBe(1)
  } finally {
    handle.close()
  }
})

it('finds gone what an earlier file made mocks of', () => {
  const alive = whatIsStillAliveOf('leftByACanarysMocks')
  expect(alive, 'Still alive from an earlier file: ' + alive).toBe('')
  const spiedOn = { say: () => NAME }
  vi.spyOn(spiedOn, 'say')
  const held = { by: NAME }
  vi.fn(() => held.by)
  leaveForTheNextFile('leftByACanarysMocks', [
    { what: 'an object ' + NAME + ' put a spy on', ref: new WeakRef(spiedOn) },
    { what: 'an object a mock of ' + NAME + ' closes over', ref: new WeakRef(held) },
  ])
})
`
}

const THE_CANARIES = ['canary-a.test.ts', 'canary-b.test.ts']

/** How many cases one canary has, counted in the text above. */
const CASES_IN_A_CANARY = (aCanaryFile('a canary').match(/^it\(/gm) ?? []).length

/**
 * A fresh folder with a tests/ folder in it, holding the two canaries and the two modules they share.
 * vitest.config.ts looks for test files under tests/ of the folder vitest is given.
 */
function aFolderOfCanaries(): { folder: string; tests: string } {
  const folder = mkdtempSync(join(tmpdir(), 'a-shared-test-process-'))
  MADE.push(folder)
  const tests = join(folder, 'tests')
  mkdirSync(tests)
  writeFileSync(join(tests, 'state.ts'), "export const box = { value: 'fresh' }\n")
  writeFileSync(join(tests, 'word.ts'), "export const word = 'real'\n")
  for (const name of THE_CANARIES) writeFileSync(join(tests, name), aCanaryFile(name))
  return { folder, tests }
}

interface Seen {
  name: string
  pid: number
  cwd: string
  before: number
}

interface ARun {
  status: number | null
  output: string
  seen: Seen[]
  cases: { file: string; title: string; status: string; failureMessages: string[] }[]
}

/**
 * Run the checkout's vitest on the two canaries, one file at a time, with the switch as given. The
 * files are named by their full paths, which can match nothing in the real tests/.
 */
function runTheCanaries(theSwitch: 'on' | undefined): ARun {
  const { folder, tests } = aFolderOfCanaries()
  const out = join(folder, 'report.json')
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env[THE_SWITCH]
  if (theSwitch !== undefined) env[THE_SWITCH] = theSwitch
  const run = spawnSync(
    process.execPath,
    [
      VITEST,
      'run',
      `--dir=${folder}`,
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${out}`,
      '--no-file-parallelism',
      ...THE_CANARIES.map((name) => join(tests, name)),
    ],
    { cwd: ROOT, env, encoding: 'utf8', timeout: 200_000 },
  )
  if (run.error !== undefined) throw run.error
  const output = `${run.stdout}\n${run.stderr}`
  if (!existsSync(out) || !existsSync(join(tests, 'seen.jsonl'))) {
    throw new Error(`The canaries did not run (vitest exited ${run.status}), so nothing is known about a clean start. vitest said:\n${output}`)
  }
  const report = JSON.parse(readFileSync(out, 'utf8')) as {
    testResults: { name: string; assertionResults: { title: string; status: string; failureMessages: string[] }[] }[]
  }
  return {
    status: run.status,
    output,
    seen: readFileSync(join(tests, 'seen.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Seen),
    cases: report.testResults.flatMap((file) => file.assertionResults.map((one) => ({ file: file.name, ...one }))),
  }
}

/** Each case that did not pass, with its file and why, so a red run says what leaked. */
function whatDidNotPass(run: ARun): string[] {
  return run.cases.filter((one) => one.status !== 'passed').map((one) => `${one.file} > ${one.title}: ${one.failureMessages.join(' ')}`)
}

describe('with the switch on, a second file in the same process starts clean', () => {
  let run: ARun = { status: null, output: '', seen: [], cases: [] }
  beforeAll(() => {
    run = runTheCanaries('on')
  }, 240_000)

  it('says at the start of the run that test files share processes', () => {
    expect(run.output).toContain(`Test files share processes in this run, because ${THE_SWITCH} is on.`)
  })

  it('runs both files in one process, one after the other', () => {
    expect(run.seen.map((one) => one.before)).toEqual([0, 1])
    expect(new Set(run.seen.map((one) => one.pid)).size, JSON.stringify(run.seen)).toBe(1)
  })

  it('passes every case of both files, so the second found nothing the first left behind', () => {
    expect(whatDidNotPass(run)).toEqual([])
    expect(run.cases.length, run.output).toBe(THE_CANARIES.length * CASES_IN_A_CANARY)
    expect(run.status, run.output).toBe(0)
  })

  it('starts both files in the folder the run started in', () => {
    expect(run.seen.map((one) => one.cwd)).toEqual([ROOT, ROOT])
  })
})

describe('with the switch off, each file has a process of its own, as before', () => {
  let run: ARun = { status: null, output: '', seen: [], cases: [] }
  beforeAll(() => {
    run = runTheCanaries(undefined)
  }, 240_000)

  it('runs the two files in two processes and passes them', () => {
    expect(run.seen.length).toBe(2)
    expect(new Set(run.seen.map((one) => one.pid)).size, JSON.stringify(run.seen)).toBe(2)
    expect(whatDidNotPass(run)).toEqual([])
    expect(run.status, run.output).toBe(0)
  })

  it('says nothing about sharing processes', () => {
    expect(run.output).not.toContain('Test files share processes')
  })
})

describe('the switch', () => {
  it('is off when it is not set', () => {
    expect(readSetting(THE_SWITCH, {}).value).toBe(null)
  })

  it('takes on and off as they are written', () => {
    expect(readSetting(THE_SWITCH, { [THE_SWITCH]: 'on' }).value).toBe('on')
    expect(readSetting(THE_SWITCH, { [THE_SWITCH]: 'off' }).value).toBe('off')
  })

  it('refuses any other word, and guesses nothing from it', () => {
    expect(() => readSetting(THE_SWITCH, { [THE_SWITCH]: 'yes' })).toThrow(
      `${THE_SWITCH} is "yes", and it must be on or off. Nothing was guessed from it.`,
    )
  })
})

/** The module that stops a test process's servers and folders when the process ends. */
const THE_END_OF_A_PROCESS = join(ROOT, 'tests', 'what-a-test-process-takes-with-it.ts')
/** What the thrower's timer throws, so the run's words can be searched for it. */
const THE_THROWN_ERROR = 'A timer threw outside any case, and nothing in the file caught it'

/**
 * A file that starts a stand-in for a test server in a process group of its own, gives the group to
 * THE_END_OF_A_PROCESS as tests/helpers.ts gives it its servers, writes the group's id to `group` beside
 * itself, and then throws from a timer. A test file, whose timer throws while its one case waits, when
 * `asATestFile`; else a script for plain Node.
 */
function aThrower(folder: string, asATestFile: boolean): string {
  const header = `import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { stopEverythingWhenTheProcessEnds } from ${JSON.stringify(THE_END_OF_A_PROCESS)}
`
  const throwing = `const standIn = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
standIn.unref()
writeFileSync(${JSON.stringify(join(folder, 'group'))}, String(standIn.pid))
stopEverythingWhenTheProcessEnds({ groups: new Set([standIn.pid]), transcripts: null, migratedSchema: null })
setTimeout(() => { throw new Error(${JSON.stringify(THE_THROWN_ERROR)}) }, 0)`
  if (!asATestFile) return `${header}${throwing}\n`
  return `${header}
it('starts a server, and its timer throws while the case waits', async () => {
  ${throwing.split('\n').join('\n  ')}
  await new Promise((done) => setTimeout(done, 200))
})
`
}

/** Whether any process of the group is still running. A zombie has stopped, and only waits to be reaped. */
function theGroupIsRunning(group: number): boolean {
  try {
    process.kill(-group, 0)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
  const stat = existsSync(`/proc/${group}/stat`) ? readFileSync(`/proc/${group}/stat`, 'utf8') : ''
  return stat === '' || stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z'
}

/** Whether the group is still running two seconds on: a group sent SIGKILL can take a moment to go. */
async function theGroupIsStillRunningTwoSecondsOn(group: number): Promise<boolean> {
  const until = Date.now() + 2_000
  while (theGroupIsRunning(group)) {
    if (Date.now() > until) return true
    await new Promise((done) => setTimeout(done, 50))
  }
  return false
}

/** Takes down a stand-in a red run left running. */
function stopTheGroup(group: number): void {
  try {
    process.kill(-group, 'SIGKILL')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
  }
}

interface AThrowersRun {
  status: number | null
  output: string
  group: number
}

/** Run the checkout's vitest on one thrower file, with the switch as given. */
function runTheThrowerUnderVitest(theSwitch: 'on' | undefined): AThrowersRun {
  const folder = mkdtempSync(join(tmpdir(), 'an-uncaught-exception-'))
  MADE.push(folder)
  const tests = join(folder, 'tests')
  mkdirSync(tests)
  const file = join(tests, 'thrower.test.ts')
  writeFileSync(file, aThrower(folder, true))
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env[THE_SWITCH]
  if (theSwitch !== undefined) env[THE_SWITCH] = theSwitch
  const run = spawnSync(process.execPath, [VITEST, 'run', `--dir=${folder}`, '--reporter=default', file], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 200_000,
  })
  if (run.error !== undefined) throw run.error
  const output = `${run.stdout}\n${run.stderr}`
  if (!existsSync(join(folder, 'group'))) {
    throw new Error(`The thrower did not start its server (vitest exited ${run.status}), so nothing is known. vitest said:\n${output}`)
  }
  return { status: run.status, output, group: Number(readFileSync(join(folder, 'group'), 'utf8')) }
}

for (const theSwitch of ['on', undefined] as const) {
  describe(`with the switch ${theSwitch ?? 'off'}, an exception nobody catches fails the run`, () => {
    let run: AThrowersRun = { status: null, output: '', group: 0 }
    beforeAll(() => {
      run = runTheThrowerUnderVitest(theSwitch)
    }, 240_000)
    afterAll(() => {
      if (run.group > 0) stopTheGroup(run.group)
    })

    it('ends the run with a failure, and the run names the error', () => {
      expect(run.status, `vitest exited ${String(run.status)} after a timer threw. It said:\n${run.output}`).not.toBe(0)
      expect(run.output).toContain('Uncaught Exception')
      expect(run.output).toContain(THE_THROWN_ERROR)
    })

    it('stops the server the file started, by the time the run has ended', async () => {
      expect(await theGroupIsStillRunningTwoSecondsOn(run.group), run.output).toBe(false)
    })
  })
}

describe('a process that ends on an exception nobody catches, outside vitest', () => {
  it('stops the servers it started, and ends with a failure that names the error', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'an-uncaught-exception-'))
    MADE.push(folder)
    const script = join(folder, 'thrower.mjs')
    writeFileSync(script, aThrower(folder, false))
    const run = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
    if (run.error !== undefined) throw run.error
    const group = Number(readFileSync(join(folder, 'group'), 'utf8'))
    try {
      expect(await theGroupIsStillRunningTwoSecondsOn(group), `The server stand-in is still running after its process ended. Node said:\n${run.stderr}`).toBe(false)
      expect(run.status, run.stderr).toBe(1)
      expect(run.stderr).toContain(THE_THROWN_ERROR)
    } finally {
      stopTheGroup(group)
    }
  })
})
