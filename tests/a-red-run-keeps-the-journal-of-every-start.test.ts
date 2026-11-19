// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RED RUN KEEPS A JOURNAL FOR EVERY TEST FILE THAT BEGAN A STAGE, WHATEVER ENDED IT, AND THE LOCK
 * HOLDERS' LINES FROM THE WHOLE RUN.
 *
 * Asked on 2 November 2026: the merge tool's copy of a pair suite's startup journals kept three of
 * the suite's stacks for one merge entry, and neither lock's who.txt. A stack that gave up at the
 * health stage left no journal there.
 *
 * The first two cases run this checkout's vitest in a child process, with its own setup files and
 * global setups, on fixture files written into a test folder. Each fixture writes one startup row
 * through tests/a-start-keeps-its-waits.ts, as `liveApp` does, and then ends in its own way: a
 * `beforeAll` that gives up followed by an `afterAll` that throws, a case that fails, a test process
 * that is killed, and a file that passes. The third case holds the server build's lock with a process
 * of its own and reads what the waiting start wrote.
 *
 * The note inside a lock is removed when the lock is let go, so a red run read later never has it.
 * The lines a lock leaves are therefore the rows of the startup journals: who took it, let it go,
 * waited for it, and removed it after its holder ended. All three build locks write them in the same
 * four forms, `theFourRows` below.
 *
 * The page build's two locks are taken by `waitForAPage` in tests/helpers.ts. A case for each runs a
 * fixture file that waits for a lock of that name held by a process it then kills, and fails; the red
 * run's kept journal must hold the four rows. The same case holds a lock of that name with the wait
 * itself and asks tools/cloud-suite-journals.mjs, as the cloud box does, to copy its who.txt.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import * as fs from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { ONE_JOURNAL_KEEPS_AT_MOST, THE_JOURNALS_KEEP_AT_MOST, THE_JOURNALS_LOOKED_FOR, keepTheStartupJournals } from '../tools/cloud-suite-journals.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { theSetupWaitsKeptFor, type Wait } from './a-start-keeps-its-waits.ts'
import { waitForAPage } from './helpers.ts'
import { buildTheServer, theServerBrowserTestsStart } from './the-server-browser-tests-start.ts'

const ROOT = join(import.meta.dirname, '..')
const LOGS = join(ROOT, '.logs')
const KEEPS_A_ROW = JSON.stringify(join(ROOT, 'tests/a-start-keeps-its-waits.ts'))
const WAITS_FOR_A_PAGE = JSON.stringify(join(ROOT, 'tests/helpers.ts'))
const THE_STAGE = 'the API server to answer /api/health'

/** The rows a build lock leaves in the journal of a start that waited for it, held by `held`, and then took it. */
const theFourRows = (named: string, held: number): string[] => [
  `waits for ${named}, which process ${String(held)} holds`,
  `removed ${named}, which process ${String(held)} held and has ended`,
  `took ${named}`,
  `let go of ${named}`,
]

/** The four ways a fixture file ends, each after it has written one startup row. */
const ENDINGS: Record<string, (who: string, folder: string) => string> = {
  'a-hook-gives-up': (who) => `
import { afterAll, beforeAll, it } from 'vitest'
import { keepTheSetupWait } from ${KEEPS_A_ROW}
let app
beforeAll(() => {
  keepTheSetupWait(${JSON.stringify(who)}, ${JSON.stringify(THE_STAGE)})
  throw new Error('The fixture gives up at the health stage.')
})
afterAll(async () => { await app.stop() })
it('needs its stack', () => {})
`,
  'a-case-fails': (who) => `
import { expect, it } from 'vitest'
import { keepTheSetupWait } from ${KEEPS_A_ROW}
it('fails after its stage', () => {
  keepTheSetupWait(${JSON.stringify(who)}, ${JSON.stringify(THE_STAGE)})
  expect('given up').toBe('answered')
})
`,
  'the-process-is-killed': (who) => `
import { it } from 'vitest'
import { keepTheSetupWait } from ${KEEPS_A_ROW}
it('is killed after its stage', () => {
  keepTheSetupWait(${JSON.stringify(who)}, ${JSON.stringify(THE_STAGE)})
  process.kill(process.pid, 'SIGKILL')
})
`,
  'it-passes': (who) => `
import { it } from 'vitest'
import { keepTheSetupWait } from ${KEEPS_A_ROW}
it('passes after its stage', () => {
  keepTheSetupWait(${JSON.stringify(who)}, ${JSON.stringify(THE_STAGE)})
})
`,
}

/** The page build's two locks, by their folder in dist/ (tests/helpers.ts). */
const THE_PAGE_LOCKS = ['web-for-tests-lock', 'web-build-lock'] as const

/**
 * A fixture file that waits for a page lock in its own test folder, held by a process it starts, and
 * fails after the wait. It kills the holder only once `waitForAPage` has seen it, so the wait writes
 * all four rows; the holder's process id goes into `held` for the case to read.
 */
const aWaitForAPageLock = (lock: string, held: string) => (_who: string, folder: string): string => `
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { waitForAPage } from ${WAITS_FOR_A_PAGE}
it('waits for a page lock whose holder ends, and then fails', async () => {
  const lock = join(${JSON.stringify(folder)}, 'dist', ${JSON.stringify(lock)})
  const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], { stdio: 'ignore' })
  mkdirSync(lock, { recursive: true })
  writeFileSync(join(lock, 'who.txt'), 'process ' + String(holder.pid) + '\\n')
  writeFileSync(${JSON.stringify(held)}, String(holder.pid))
  let built = false
  const waited = waitForAPage({
    lock,
    who: join(lock, 'who.txt'),
    limit: 30_000,
    ready: () => built,
    build: () => ({ ended: Promise.resolve().then(() => { built = true }), output: () => '' }),
    builds: () => 0,
    refusal: () => 'The fixture gave up waiting for its page lock.',
  })
  holder.kill('SIGKILL')
  await waited
  expect('the page').toBe('a failure after it, so that the run is red')
})
`

/** The journals a run left in this checkout's `.logs/` for one test file, read and then removed. */
function theJournalsKeptFor(file: string): Wait[][] {
  if (!existsSync(LOGS)) return []
  const prefix = `setup-waits-${createHash('sha256').update(file).digest('hex')}-`
  const names = readdirSync(LOGS).filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl'))
  return names.map((name) => {
    const path = join(LOGS, name)
    const rows = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Wait)
    rmSync(path)
    return rows
  })
}

/** Runs this checkout's vitest on the named fixture files, and says what each file's journal kept. */
function aRunOf(
  endings: string[],
  sources: Record<string, (who: string, folder: string) => string> = ENDINGS,
): { status: number | null; output: string; kept: Record<string, Wait[][]>; who: Record<string, string>; folder: string } {
  const folder = aTestDatabaseFolder('red-run-journals')
  const files: Record<string, string> = {}
  const who: Record<string, string> = {}
  try {
    mkdirSync(join(folder, 'tests'))
    for (const ending of endings) {
      files[ending] = join(folder, 'tests', `${ending}.test.ts`)
      who[ending] = `the stack for the fixture ${randomUUID()}`
      writeFileSync(files[ending], sources[ending]!(who[ending], folder))
    }
    // `--isolate`: each fixture file has a process of its own, as the endings above are written for. This run
    // reads this checkout's vitest.config.ts and this environment, so with MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS
    // on, one process would run every fixture file in turn, and the fixture that kills its process would end the
    // files after it before they began their stage.
    const ran = spawnSync(process.execPath, [
      join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', `--dir=${folder}`, '--no-file-parallelism', '--isolate', '--reporter=default',
      ...Object.values(files),
    ], { cwd: ROOT, env: process.env, encoding: 'utf8', timeout: 90_000 })
    if (ran.error) throw ran.error
    const kept: Record<string, Wait[][]> = {}
    for (const ending of endings) kept[ending] = theJournalsKeptFor(files[ending]!)
    return { status: ran.status, output: `${ran.stdout}\n${ran.stderr}`, kept, who, folder }
  } finally {
    for (const file of Object.values(files)) theJournalsKeptFor(file)
    removeThisTestFolder(folder)
  }
}

describe('a run of test files that each began a stage', () => {
  it('keeps the journal of every file when the run is red, whatever ended each one', () => {
    const run = aRunOf(Object.keys(ENDINGS))
    expect(run.status, run.output).toBe(1)
    for (const ending of Object.keys(ENDINGS)) {
      expect.soft(run.kept[ending], `the journal of the fixture file that ends with "${ending}"`).toEqual([
        [{ who: run.who[ending], what: THE_STAGE, at: expect.any(Number) }],
      ])
    }
  }, 120_000)

  it('keeps none when the run is green', () => {
    const run = aRunOf(['it-passes'])
    expect(run.status, run.output).toBe(0)
    expect(run.kept['it-passes']).toEqual([])
  }, 120_000)
})

describe('the lock of the server build', () => {
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  it('journals who waited for it and for whom, who removed it after its holder ended, and who took it and let it go', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'server-build-lock-'))
    made.push(dir)
    const entry = join(dir, 'entry.ts')
    writeFileSync(entry, "console.log('built')\n")
    const file = join(dir, 'out', 'server.mjs')
    const lock = join(dir, 'lock')
    const named = relative(ROOT, lock)

    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], { stdio: 'ignore' })
    const held = holder.pid
    if (held === undefined) throw new Error('The process that holds the lock did not start.')
    mkdirSync(lock)
    writeFileSync(join(lock, 'who.txt'), `process ${String(held)}\n`)

    const me = `process ${String(process.pid)}`
    const testPath = expect.getState().testPath
    if (testPath === undefined) throw new Error('This case could not read its own test file.')
    const rows = (): string[] => theSetupWaitsKeptFor(testPath).filter((row) => row.who === me && row.what.includes(named)).map((row) => row.what)

    const ended = once(holder, 'exit')
    try {
      const started = theServerBrowserTestsStart(file, entry, buildTheServer, lock)
      const until = Date.now() + 10_000
      while (rows().length === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50))
      holder.kill('SIGKILL')
      await ended
      expect(await started).toBe(file)
    } finally {
      holder.kill('SIGKILL')
    }

    expect(rows()).toEqual(theFourRows(named, held))
  }, 60_000)
})

describe('the locks of the page builds', () => {
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  for (const lock of THE_PAGE_LOCKS) {
    it(`a red run keeps the rows dist/${lock} writes, and the cloud box finds its who.txt while it is held`, async () => {
      const side = mkdtempSync(join(tmpdir(), 'a-page-lock-'))
      made.push(side)
      const held = join(side, 'held')
      const run = aRunOf(['waits-for-a-page-lock'], { 'waits-for-a-page-lock': aWaitForAPageLock(lock, held) })
      expect(run.status, run.output).toBe(1)
      const named = relative(ROOT, join(run.folder, 'dist', lock))
      const kept = (run.kept['waits-for-a-page-lock'] ?? []).map((rows) => rows.filter((row) => row.what.includes(named)).map((row) => row.what))
      expect(kept, run.output).toEqual([theFourRows(named, Number(readFileSync(held, 'utf8')))])

      // A lock of this name in a folder laid out as the box's clone, held by the wait until the case lets it go.
      const clone = join(side, 'clone')
      const into = join(side, 'kept')
      let finish = (): void => {}
      const building = new Promise<void>((resolve) => {
        finish = resolve
      })
      let built = false
      const holding = join(clone, 'dist', lock)
      const waited = waitForAPage({
        lock: holding,
        who: join(holding, 'who.txt'),
        limit: 30_000,
        ready: () => built,
        build: () => ({ ended: building.then(() => { built = true }), output: () => '' }),
        builds: () => 0,
        refusal: () => `The case gave up waiting for its own ${lock}.`,
      })
      try {
        keepTheStartupJournals(fs, clone, into, ONE_JOURNAL_KEEPS_AT_MOST, THE_JOURNALS_KEEP_AT_MOST, THE_JOURNALS_LOOKED_FOR)
      } finally {
        finish()
        await waited
      }
      const owner = `process ${String(process.pid)}\n`
      const index = JSON.parse(readFileSync(join(into, 'index.json'), 'utf8')) as { lookedFor: string[]; files: unknown[] }
      expect(index.lookedFor).toContain(`dist/${lock}/who.txt`)
      expect(index.files).toEqual([
        { from: `dist/${lock}/who.txt`, file: `${lock}-who.txt`, bytes: Buffer.byteLength(owner), keptBytes: Buffer.byteLength(owner) },
      ])
      expect(readFileSync(join(into, `${lock}-who.txt`), 'utf8')).toBe(owner)
    }, 120_000)
  }
})

/** Read from the module when the case runs, so that this file type-checks before that module has it. */
async function theCopyOfEveryJournal(): Promise<(from: string, into: string, say: (line: string) => void) => void> {
  const where = './a-red-run-keeps-every-starts-journal.ts'
  const copy: unknown = Reflect.get(await import(where), 'keepEveryJournal')
  if (typeof copy !== 'function') throw new Error(`${where} has no keepEveryJournal.`)
  return copy as (from: string, into: string, say: (line: string) => void) => void
}

describe('a journal a red run cannot keep', () => {
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  it('is said with its name and why, the other journals are still kept, and nothing is thrown', async () => {
    const keepEveryJournal = await theCopyOfEveryJournal()
    const from = mkdtempSync(join(tmpdir(), 'journals-from-'))
    const into = mkdtempSync(join(tmpdir(), 'journals-into-'))
    made.push(from, into)
    const [first, kept, last] = ['a', 'b', 'c'].map((letter, at) => `setup-waits-${letter.repeat(64)}-${String(at + 1)}.jsonl`) as [string, string, string]
    for (const name of [first, kept, last]) writeFileSync(join(from, name), `{"who":"${name}","what":"${THE_STAGE}","at":1}\n`)
    // A folder where a copy would go makes that copy fail, whatever order the folder is read in.
    mkdirSync(join(into, first))
    mkdirSync(join(into, last))

    const said: string[] = []
    expect(() => keepEveryJournal(from, into, (line) => said.push(line))).not.toThrow()
    expect(said.sort()).toEqual([
      expect.stringMatching(new RegExp(`^A red run could not keep the startup journal ${first.replace('.', '\\.')} in .+: \\S`)),
      expect.stringMatching(new RegExp(`^A red run could not keep the startup journal ${last.replace('.', '\\.')} in .+: \\S`)),
    ])
    expect(readFileSync(join(into, kept), 'utf8')).toBe(readFileSync(join(from, kept), 'utf8'))
  })

  it('says a folder of journals it cannot read, and throws nothing', async () => {
    const keepEveryJournal = await theCopyOfEveryJournal()
    const from = join(tmpdir(), `journals-never-made-${randomUUID()}`)
    const said: string[] = []
    expect(() => keepEveryJournal(from, join(from, 'into'), (line) => said.push(line))).not.toThrow()
    expect(said).toEqual([expect.stringMatching(new RegExp(`^A red run could not read its startup journals in .+: \\S`))])
  })
})
