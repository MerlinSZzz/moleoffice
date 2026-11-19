// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GIT REWRITE DOES NOT STOP THE SERVER BEING WATCHED.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `7XK5_FQcvEjl`, measured on 4 September 2026. `tsx watch` puts one inotify watch on each
 * file the server loaded. A watch on a file follows the file's inode, and `git checkout`,
 * `git merge`, `git stash pop` and every editor that saves through a temporary file REPLACE a file
 * rather than write into it. On a scratch stack under `tsx watch`: 714 watches at the start with
 * `src/shared/product.ts` among them; after `git checkout -- src/shared/product.ts`, 713 watches
 * and that file gone from the list. From then on nothing about that file restarted the server —
 * an append, a rename over it, a rewrite in place: none of them — for the life of that supervisor.
 * The server really was running old code, `GET /api/health` answered ok false and the red banner
 * blocked the browser app, with no restart ever coming.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE FIX IS, AND WHAT THESE TESTS SEPARATE
 * ---------------------------------------------------------------------------------------
 *
 * `npm run dev:server` now runs `tools/serve-dev.mjs`, which watches DIRECTORIES. A directory's
 * inode is not replaced when a file inside it is unlinked and written again, so the watch survives.
 *
 * Two things have to be true at once and they are tested apart:
 *
 * 1. **Watching a folder is how a change is NOTICED.** The first two groups below measure that
 *    directly: one watch on a file and one on its directory, across the same rewrite. This is the
 *    control for `tsx watch`, and it is the mechanism rather than a re-run of the product, because
 *    `tsx watch` is not what this product runs any more.
 * 2. **The set of files the server is built from is what decides whether a change MATTERS.** That is
 *    problem `TMy3C0ydoYYR`'s fix and it is not undone here: a change to a file under a watched
 *    folder that the server does not import restarts nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE SLOW GROUP RUNS A REAL SUPERVISOR OVER A REAL GIT CHECKOUT
 * ---------------------------------------------------------------------------------------
 *
 * `src`, `tools`, `drizzle` and the two config files are copied to a temporary directory, that copy
 * is made into a git repository with one commit, and `node tools/serve-dev.mjs` is started against
 * it on a free port with a database of its own. The rewrite is a real `git checkout`, because the
 * whole problem is about what git does to an inode; simulating it would be testing the simulation.
 * Nothing is written inside this checkout.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SLOW GROUP DOES NOT PROVE, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * IT DOES NOT PROVE THAT WATCHING DIRECTORIES IS WHAT FIXED IT. Measured on 4 September 2026: a
 * mutant of `tools/serve-dev.mjs` that watches each FILE of the set instead of its directory — the
 * shape `tsx watch` uses — passes every test in the slow group. The reason is the supervisor's
 * other habit: it re-arms every watch after every restart, and `tsx watch` does not. The rewrite
 * that loses a file watch also causes a restart, and the restart puts the watch back.
 *
 * So the two are separated on purpose. The slow group measures the SUPERVISOR: the reproduction
 * restarts on the third change, a rewrite of many files is one restart, a crash comes back, a new
 * import enters the set. The fast group above it — "a watch on a file is lost when the file is
 * replaced" — measures the WATCH SHAPE, with no server and no race, and that is the only place the
 * directory choice is held shut.
 *
 * Watching directories is still what this supervisor does, for reasons a test cannot carry: four
 * watch calls instead of 199, four to re-arm instead of 199 on every restart, and a recovery that
 * does not depend on a restart having happened.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, unlinkSync, watch } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  COLLECT_CHANGES_FOR,
  theDirectoriesToWatch,
  whatChanged,
  whyItMayNotStart } from '../tools/serve-dev.mjs'
import { commandThatStopsWithItsOwner, freshDb, type TestDb } from './helpers.ts'
import { THE_SERVER_FOLDERS } from '../src/config/newest-source.mjs'
import type { RuntimeRecord } from '../src/shared/runtime.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Wait for a watch event or process exit, with a deadline and the last observed state. */
async function untilState(check: () => boolean, says: () => string, within = 10_000): Promise<void> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (check()) return
    await sleep(25)
  }
  throw new Error(`the expected state did not arrive: ${says()}`)
}

/** A second collecting window exposes an extra restart without paying for another server start. */
const A_QUIET_RESTART_WINDOW = 2 * COLLECT_CHANGES_FOR + 250

// ============================================================== what a change is decided against

describe('the directories to watch cover every file the server is built from', () => {
  it('watches each folder the server code comes out of, and each one recursively', () => {
    const watched = theDirectoriesToWatch([], REPO)
    for (const folder of THE_SERVER_FOLDERS) {
      const one = watched.find((w) => w.path === join(REPO, folder))
      expect(one, `${folder} is not watched`).toBeDefined()
      expect(one?.recursive, `${folder} is not watched recursively`).toBe(true)
    }
  })

  it('adds the directory of a file that lies outside those folders', () => {
    // The API server really does import a file out of src/web — lib/attention.ts, through
    // lib/records.ts — and a folder list would miss it.
    const watched = theDirectoriesToWatch(['src/web/lib/attention.ts'], REPO)
    expect(watched.map((w) => w.path)).toContain(join(REPO, 'src/web/lib'))
    expect(watched.find((w) => w.path === join(REPO, 'src/web/lib'))?.recursive).toBe(false)
  })

  it('does not watch a directory twice, nor one already inside a recursive watch', () => {
    const watched = theDirectoriesToWatch(
      ['src/shared/product.ts', 'src/shared/time.ts', 'src/server/lib/runtime.ts', 'src/web/lib/attention.ts'],
      REPO,
    )
    expect(new Set(watched.map((w) => w.path)).size).toBe(watched.length)
    // src/shared and src/server are already watched recursively, so their sub-directories add nothing.
    expect(watched.filter((w) => w.path.startsWith(join(REPO, 'src/shared')))).toHaveLength(1)
  })

  it('leaves out a directory that is not there rather than watching nothing and saying nothing', () => {
    const watched = theDirectoriesToWatch(['src/nowhere/at/all.ts'], REPO)
    expect(watched.map((w) => w.path)).not.toContain(join(REPO, 'src/nowhere/at'))
  })
})

describe('a watch event is turned into a path this checkout can be asked about', () => {
  it('names the file relative to the checkout', () => {
    expect(whatChanged(join(REPO, 'src/shared'), 'product.ts', REPO)).toBe('src/shared/product.ts')
  })

  it('keeps the sub-directory a recursive watch reports', () => {
    expect(whatChanged(join(REPO, 'src/server'), 'lib/runtime.ts', REPO)).toBe('src/server/lib/runtime.ts')
  })

  it('says nothing rather than guessing when the machine did not name the file', () => {
    expect(whatChanged(join(REPO, 'src/shared'), null, REPO)).toBeNull()
    expect(whatChanged(join(REPO, 'src/shared'), '', REPO)).toBeNull()
  })
})



// ======================================================== the mechanism, and the tsx watch control

/**
 * THE CONTROL: A WATCH ON A FILE AND A WATCH ON ITS DIRECTORY, ACROSS THE SAME REWRITE.
 *
 * This is what `tsx watch` does against what `tools/serve-dev.mjs` does, reduced to the one call
 * that differs. It uses the same rewrite git uses — unlink the file, write a new one — and it is
 * deterministic, which a race against git's own timing is not.
 */
describe('a watch on a file is lost when the file is replaced; a watch on its directory is not', () => {
  let dir = ''

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-watch-'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('stops delivering to a watch on the file, and goes on delivering to a watch on the folder', async () => {
    const file = join(dir, 'watched.ts')
    writeFileSync(file, 'export const one = 1\n')

    let theFileWatchSaw = 0
    let theFolderWatchSaw = 0
    const onTheFile = watch(file, () => {
      theFileWatchSaw += 1
    })
    const onTheFolder = watch(dir, (_event, name) => {
      if (name === 'watched.ts') theFolderWatchSaw += 1
    })
    try {
      // A rewrite in place. Both see it, which is why the fault stayed hidden for so long.
      appendFileSync(file, '// one\n')
      await untilState(() => theFileWatchSaw > 0 && theFolderWatchSaw > 0, () => `${theFileWatchSaw} file events, ${theFolderWatchSaw} folder events`)
      expect(theFileWatchSaw, 'a watch on the file did not see a plain append').toBeGreaterThan(0)
      expect(theFolderWatchSaw, 'a watch on the folder did not see a plain append').toBeGreaterThan(0)

      // WHAT GIT DOES: the file is unlinked and a new one written under the same name.
      const beforeRewrite = { file: theFileWatchSaw, folder: theFolderWatchSaw }
      unlinkSync(file)
      writeFileSync(file, 'export const one = 2\n')
      await untilState(() => theFileWatchSaw > beforeRewrite.file && theFolderWatchSaw > beforeRewrite.folder,
        () => `${theFileWatchSaw} file events, ${theFolderWatchSaw} folder events`)
      // Let the unlink’s remaining events drain before the append that must reach only the folder.
      await sleep(100)
      const fileWatchAfterTheRewrite = theFileWatchSaw
      const folderWatchAfterTheRewrite = theFolderWatchSaw

      // AND NOW THE ONE THAT MATTERS: an ordinary save, after the rewrite.
      appendFileSync(file, '// two\n')
      await untilState(() => theFolderWatchSaw > folderWatchAfterTheRewrite, () => `${theFolderWatchSaw} folder events`)
      // A quiet window still proves the replaced inode receives no append event.
      await sleep(100)
      expect(
        theFileWatchSaw,
        'a watch on the file saw a change after the file had been replaced, which is what problem ' +
          '7XK5_FQcvEjl says it does not',
      ).toBe(fileWatchAfterTheRewrite)
      expect(
        theFolderWatchSaw,
        'a watch on the folder stopped seeing changes after the file was replaced — the fix rests on it not doing that',
      ).toBeGreaterThan(folderWatchAfterTheRewrite)
    } finally {
      onTheFile.close()
      onTheFolder.close()
    }
  })
})

// ================================================================== one supervisor per port

describe('a supervisor refuses a port another supervisor holds', () => {
  const aRuntime = (supervisor: unknown): { answered: true; runtime: unknown } => ({
    answered: true,
    runtime: { process: { pid: 4242 }, repository: { path: `${THE_TEST_FIXTURE_ROOT}/px-elsewhere` }, supervisor },
  })

  it('starts when nothing answers on the port', () => {
    expect(whyItMayNotStart({ answered: false }, 29800, 'http://127.0.0.1:29800')).toBeNull()
  })

  it('refuses, and names the supervisor that holds it', () => {
    const why = whyItMayNotStart(
      aRuntime({ watching: true, kind: 'the dev supervisor', pid: 4200, says: '' }),
      29800,
      'http://127.0.0.1:29800',
    )
    expect(why).toContain('the dev supervisor')
    expect(why).toContain('4200')
    expect(why).toContain(`${THE_TEST_FIXTURE_ROOT}/px-elsewhere`)
    expect(why).toContain('did not start and has changed nothing')
  })

  it('refuses a port held by a server nothing is watching, and says that is what it is', () => {
    const why = whyItMayNotStart(
      aRuntime({ watching: false, kind: 'nothing that restarts it', pid: null, says: 'nobody is watching it' }),
      29800,
      'http://127.0.0.1:29800',
    )
    expect(why).toContain('nobody is watching it')
    expect(why).toContain('did not start')
  })

  it('refuses a port something answers on that is not a Mole Office at all', () => {
    const why = whyItMayNotStart({ answered: true, runtime: null }, 29800, 'http://127.0.0.1:29800')
    expect(why).toContain('not a Mole Office API')
  })
})

// ======================================================= what the server says is watching it

describe('a server reads which supervisor is above it off the command line, rather than being told', () => {
  /**
   * `src/server/lib/runtime.ts` opens the database when it is imported, so it is imported after
   * `freshDb` has named a temporary one. `tests/no-test-opens-the-live-corpus.test.ts` is what
   * catches a test that forgets, and it caught this one.
   */
  let db: TestDb | null = null
  let whichSupervisor: (command: string) => string

  beforeAll(async () => {
    db = await freshDb()
    ;({ whichSupervisor } = await import('../src/server/lib/runtime.ts'))
  })

  afterAll(() => {
    db?.close()
  })

  it('recognises this product’s own supervisor', () => {
    expect(whichSupervisor('node tools/serve-dev.mjs')).toBe('the dev supervisor')
    expect(whichSupervisor(`${process.execPath} /a/b/tools/serve-dev.mjs`)).toBe(
      'the dev supervisor',
    )
  })

  it('recognises tsx watch, which is what npm run dev:server used to run', () => {
    expect(whichSupervisor('node /a/b/node_modules/.bin/tsx watch src/server/index.ts')).toBe('tsx watch')
  })

  it('does not call a plain tsx a supervisor, because it restarts nothing', () => {
    expect(whichSupervisor('node /a/b/node_modules/tsx/dist/cli.mjs src/server/index.ts')).toBe(
      'nothing that restarts it',
    )
    expect(whichSupervisor('tsx src/server/index.ts')).toBe('nothing that restarts it')
  })

  it('does not call a shell or a test runner a supervisor', () => {
    expect(whichSupervisor('/bin/bash')).toBe('nothing that restarts it')
    expect(whichSupervisor('node /a/b/node_modules/vitest/vitest.mjs run')).toBe('nothing that restarts it')
  })
})

// ===================================================== a real supervisor over a real git checkout

/** What each step of the run saw. Filled in `beforeAll`; the tests below only read it. */
const seen: {
  atTheStart: RuntimeRecord | null
  afterTheFirstAppend: RuntimeRecord | null
  afterTheGitCheckout: RuntimeRecord | null
  afterTheThirdAppend: RuntimeRecord | null
  settledBeforeTheUnimportedFile: RuntimeRecord | null
  afterAFileTheServerDoesNotImport: RuntimeRecord | null
  restartsForTheManyFileRewrite: number
  filesTheManyFileRewriteChanged: number
  afterTheCrash: RuntimeRecord | null
  afterANewFileWasImported: RuntimeRecord | null
  afterOnlyTheNewFileChanged: RuntimeRecord | null
  theSecondSupervisorSaid: string
  theSecondSupervisorExitedWith: number | null
  lines: string[]
} = {
  atTheStart: null,
  afterTheFirstAppend: null,
  afterTheGitCheckout: null,
  afterTheThirdAppend: null,
  settledBeforeTheUnimportedFile: null,
  afterAFileTheServerDoesNotImport: null,
  restartsForTheManyFileRewrite: -1,
  filesTheManyFileRewriteChanged: -1,
  afterTheCrash: null,
  afterANewFileWasImported: null,
  afterOnlyTheNewFileChanged: null,
  theSecondSupervisorSaid: '',
  theSecondSupervisorExitedWith: null,
  lines: [],
}

let dir = ''
let api = ''
let port = 0
let supervisor: ChildProcess | null = null
let output = ''

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => {
          fail(new Error('the probe socket reported no port'))
        })
        return
      }
      const { port: got } = address
      probe.close(() => {
        done(got)
      })
    })
  })
}

/** Run a command in the copy and refuse quietly to carry on if it failed. */
function inTheCopy(command: string, args: string[]): void {
  const ran = spawnSync(command, args, { cwd: dir, encoding: 'utf8' })
  if (ran.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in the copy: ${ran.stderr || ran.stdout}`)
  }
}

/** Read the runtime record, or null while the server is not answering. */
async function read(): Promise<RuntimeRecord | null> {
  try {
    const answered = await fetch(`${api}/api/runtime`, { headers: { 'x-mole-office-workspace': 'default' } })
    if (!answered.ok) return null
    return (await answered.json()) as RuntimeRecord
  } catch {
    return null
  }
}

/** Wait until a reading satisfies `test`, and say what the last one was when it does not. */
async function until(test: (r: RuntimeRecord) => boolean, what: string, within = 90_000): Promise<RuntimeRecord> {
  const stopAt = Date.now() + within
  let last: RuntimeRecord | null = null
  while (Date.now() < stopAt) {
    last = await read()
    if (last !== null && test(last)) return last
    await sleep(250)
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. The last reading was ` +
      `${last === null ? 'nothing at all' : `pid ${String(last.process.pid)}, ${last.supervisor.says}`}.` +
      `\nThe supervisor said:\n${output}`,
  )
}

/** Wait until the server answering is a different process from the one named. */
const untilItIsNotPid = async (was: number, what: string): Promise<RuntimeRecord> =>
  until((r) => r.process.pid !== was, what)

const restartLines = (): number => output.split('\n').filter((l) => l.startsWith('[dev] restarting')).length

/**
 * TEN MINUTES FOR THE HOOK BELOW, not the four a hook that starts something has. Four minutes were set for a hook that
 * waits for one server to start, and this one waits for ten, each a start of a real server under the dev supervisor.
 * Alone on 13 November 2026 at load average 7 the hook took 47 s.
 * In the whole suite that day this file went red with none of its cases named, which is how a failed hook is reported,
 * and it was green alone. tests/how-long-a-test-may-take.ts measured the first hook that imports the server at 4.7 s at
 * load 12 and 12.4 s at load 49, and works out about 22 s at load 96, the highest recorded on this machine: about five
 * times as long as at load 12. If these ten starts slow down the same way, 47 s becomes about the whole four minutes.
 * Ten minutes is two and a half times that. A start that never comes is not left to this budget: `until` gives up on it
 * within 90 s and names the step.
 */
const THE_HOOK_THAT_WAITS_FOR_TEN_STARTS = 600_000

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-rewrite-'))
  // src/config holds roles.json (copied with src), which the server reads before it serves and refuses to start
  // without (P3, P4): a copy of the program without it is not a program that starts.
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  // A REAL GIT REPOSITORY, because the rewrite this problem is about is one git makes.
  inTheCopy('git', ['init', '-q'])
  inTheCopy('git', ['add', '-A'])
  inTheCopy('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'the copy'])

  port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  const environment = {
    ...process.env,
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_DB: join(dir, 'watched.db'),
    LOG_LEVEL: 'warn',
    // Not under a test runner as far as the children are concerned: they are a real supervisor and
    // a real server, and these would make src/server/db/client.ts refuse a database nobody named.
    VITEST: undefined,
    VITEST_WORKER_ID: undefined,
  } as NodeJS.ProcessEnv
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  supervisor = spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: environment,
  })
  supervisor.stdout?.on('data', (d: Buffer) => (output += d.toString()))
  supervisor.stderr?.on('data', (d: Buffer) => (output += d.toString()))

  /**
   * WAIT FOR THE RECORD TO NAME THE SUPERVISOR, not merely for something to answer on the port.
   *
   * Measured on 4 September 2026 in a full suite run at load average 36: this file failed two
   * assertions — `supervisor.kind` was `nothing that restarts it` and `restartedBecause` was null —
   * and passed 39 of 40 when run alone. Both readings are of a server whose parent is not this
   * supervisor and which was told no reason, which is what ANOTHER test's server on the same port
   * looks like: `freePort` closes its probe socket before the supervisor binds, and under load a
   * second `freePort` elsewhere in the suite can hand out the same number in between.
   *
   * So the wait is for the thing being measured. If the port really was taken, this times out and
   * `until` prints the last reading and everything the supervisor said, which names the fault
   * instead of asserting a wrong value.
   */
  seen.atTheStart = await until(
    (r) => r.supervisor.watching === true && r.supervisor.restartedBecause !== null,
    'the server started under the dev supervisor, and the runtime record named it',
  )

  // ---------------------------------------------------------------- THE REPRODUCTION, IN ORDER
  appendFileSync(join(dir, 'src/shared/product.ts'), '\n// the first append\n')
  seen.afterTheFirstAppend = await untilItIsNotPid(seen.atTheStart.process.pid, 'the first append restarted the server')

  inTheCopy('git', ['checkout', '--', 'src/shared/product.ts'])
  seen.afterTheGitCheckout = await untilItIsNotPid(
    seen.afterTheFirstAppend.process.pid,
    'the git checkout restarted the server',
  )

  appendFileSync(join(dir, 'src/shared/product.ts'), '\n// the third change\n')
  seen.afterTheThirdAppend = await untilItIsNotPid(
    seen.afterTheGitCheckout.process.pid,
    'the append AFTER the git checkout restarted the server, which is the whole of problem 7XK5_FQcvEjl',
  )
  inTheCopy('git', ['checkout', '--', 'src/shared/product.ts'])
  await untilItIsNotPid(seen.afterTheThirdAppend.process.pid, 'the file was put back')

  // ------------------------------------ A FILE UNDER A WATCHED FOLDER THAT THE SERVER DOES NOT LOAD
  // SETTLED MEANS IT HAS LOADED THE FILE THAT WAS PUT BACK, not only that something answers: a write git made late
  // would bring one more restart, and it must not fall inside the window below. The reading after the window waits for
  // an answer instead of taking one read: a restart there is the fault, and the case below names it by its process.
  seen.settledBeforeTheUnimportedFile = await until((r) => r.freshness.verdict === 'as new as the checkout', 'the server settled on the file put back')
  appendFileSync(join(dir, 'src/shared/colourroles.ts'), '\n// nothing imports this\n')
  await sleep(A_QUIET_RESTART_WINDOW)
  seen.afterAFileTheServerDoesNotImport = await until((r) => r.process.pid > 0, 'the server answered after a file it does not import changed')

  // ------------------------------------------------ A GIT REWRITE OF MANY FILES AT ONCE, IN ONE GO
  // The five files are changed first and that restart is waited out, so what is counted below is
  // the ONE act this is about: git putting five files back in the same moment.
  const many = ['records.ts', 'runtime.ts', 'resources.ts', 'listeners.ts', 'worker.ts']
  for (const file of many) appendFileSync(join(dir, 'src/server/lib', file), '\n// touched\n')
  const beforeTheRewrite = await untilItIsNotPid(
    seen.settledBeforeTheUnimportedFile.process.pid,
    'the five changed files restarted the server',
  )
  await until((r) => r.process.pid === beforeTheRewrite.process.pid && r.freshness.verdict === 'as new as the checkout', 'the changed files were loaded')
  const changed = spawnSync('git', ['status', '--short', 'src/server/lib'], { cwd: dir, encoding: 'utf8' })
  seen.filesTheManyFileRewriteChanged = changed.stdout.trim().split('\n').filter(Boolean).length
  const restartsBefore = restartLines()
  inTheCopy('git', ['checkout', '--', 'src/server/lib'])
  await untilItIsNotPid(beforeTheRewrite.process.pid, 'the many-file rewrite restarted the server')
  await sleep(A_QUIET_RESTART_WINDOW)
  seen.restartsForTheManyFileRewrite = restartLines() - restartsBefore

  // ------------------------------------------------------------------------------------ A CRASH
  const before = await until((r) => r.process.pid > 0, 'the server was up before the crash')
  process.kill(before.process.pid, 'SIGKILL')
  seen.afterTheCrash = await untilItIsNotPid(before.process.pid, 'the supervisor restarted a server that was killed')

  // ------------------------------------------------ A FILE THAT IS NEW, AND NEWLY IMPORTED
  writeFileSync(join(dir, 'src/server/lib/new-arrival.ts'), 'export const theNewArrival = 1\n')
  appendFileSync(
    join(dir, 'src/server/index.ts'),
    "\nimport { theNewArrival } from './lib/new-arrival.ts'\nvoid theNewArrival\n",
  )
  seen.afterANewFileWasImported = await untilItIsNotPid(
    seen.afterTheCrash.process.pid,
    'importing a new file restarted the server',
  )
  await until((r) => r.process.pid === seen.afterANewFileWasImported?.process.pid && r.freshness.verdict === 'as new as the checkout', 'the new import was loaded')
  appendFileSync(join(dir, 'src/server/lib/new-arrival.ts'), '\n// and now it is watched\n')
  seen.afterOnlyTheNewFileChanged = await untilItIsNotPid(
    seen.afterANewFileWasImported.process.pid,
    'the newly imported file was in the set at the next restart, and changing only it restarted the server',
  )

  // ------------------------------------------------------------------- ONE SUPERVISOR PER PORT
  const secondCommand = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  const second = spawn(secondCommand.command, secondCommand.args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: environment,
    timeout: 30_000,
  })
  let secondOutput = ''
  second.stdout?.on('data', (chunk: Buffer) => { secondOutput += chunk.toString() })
  second.stderr?.on('data', (chunk: Buffer) => { secondOutput += chunk.toString() })
  // The watchdog holds no output pipe, so close follows the refused command's own exit.
  seen.theSecondSupervisorExitedWith = (await once(second, 'close'))[0] as number | null
  seen.theSecondSupervisorSaid = secondOutput
  seen.lines = output.split('\n').filter((l) => l.startsWith('[dev]'))
}, THE_HOOK_THAT_WAITS_FOR_TEN_STARTS)

afterAll(async () => {
  if (supervisor?.pid !== undefined && supervisor.pid !== null) {
    try {
      process.kill(-supervisor.pid, 'SIGTERM')
    } catch {
      // Already gone, which is the outcome that was wanted.
    }
    await untilState(() => supervisor?.exitCode !== null || supervisor?.signalCode !== null, () => output, 15_000).catch(() => undefined)
    try {
      process.kill(-supervisor.pid, 'SIGKILL')
    } catch {
      // Gone, as asked.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('the reproduction of problem 7XK5_FQcvEjl, under the dev supervisor', () => {
  it('restarts on an ordinary save', () => {
    expect(seen.afterTheFirstAppend?.process.pid).not.toBe(seen.atTheStart?.process.pid)
  })

  it('restarts when git rewrites the file', () => {
    expect(seen.afterTheGitCheckout?.process.pid).not.toBe(seen.afterTheFirstAppend?.process.pid)
  })

  it('STILL restarts on the next save after that, which is the whole problem', () => {
    expect(seen.afterTheThirdAppend?.process.pid).not.toBe(seen.afterTheGitCheckout?.process.pid)
  })

  it('is as new as the checkout afterwards, so nothing raises the banner', () => {
    expect(seen.afterTheThirdAppend?.freshness.verdict).toBe('as new as the checkout')
  })
})

describe('a change is judged against the files the server is built from, not the folder it sits in', () => {
  /**
   * Problem `TMy3C0ydoYYR`'s fix, held shut from the other direction. `src/shared/colourroles.ts`
   * lives under a folder this supervisor watches and no file under `src/` imports it, so the server
   * has nothing to pick up and must not be restarted for it.
   */
  it('does not restart for a file under a watched folder that the server does not import', () => {
    expect(seen.afterAFileTheServerDoesNotImport?.process.pid).toBe(seen.settledBeforeTheUnimportedFile?.process.pid)
  })
})

describe('a git rewrite of many files at once is one restart, not one each', () => {
  it('really rewrote more than one file', () => {
    expect(seen.filesTheManyFileRewriteChanged).toBeGreaterThan(1)
  })

  it('restarted once', () => {
    expect(seen.restartsForTheManyFileRewrite).toBe(1)
  })
})

describe('a server that dies is started again, and the record says why', () => {
  it('is answering again after being killed outright', () => {
    expect(seen.afterTheCrash).not.toBeNull()
    expect(seen.afterTheCrash?.process.pid).toBeGreaterThan(0)
  })

  it('says the previous run stopped on its own, in the runtime record', () => {
    expect(seen.afterTheCrash?.supervisor.restartedBecause).toContain('stopped on its own')
  })

  it('printed a line about it that names the signal', () => {
    expect(seen.lines.join('\n')).toContain('SIGKILL')
  })
})

describe('a file that is new and newly imported enters the set at the next restart', () => {
  it('restarted when the file that imports it changed', () => {
    expect(seen.afterANewFileWasImported?.process.pid).not.toBe(seen.afterTheCrash?.process.pid)
  })

  it('restarts for the new file alone from then on', () => {
    expect(seen.afterOnlyTheNewFileChanged?.process.pid).not.toBe(seen.afterANewFileWasImported?.process.pid)
  })

  it('counts one more file in the set than it did at the start', () => {
    const atTheStart = seen.atTheStart?.freshness.filesTheServerIsBuiltFrom ?? 0
    expect(seen.afterOnlyTheNewFileChanged?.freshness.filesTheServerIsBuiltFrom).toBe(atTheStart + 1)
  })
})

describe('the server says which supervisor is watching it and why it last started', () => {
  it('names the dev supervisor, and its process', () => {
    expect(seen.atTheStart?.supervisor.kind).toBe('the dev supervisor')
    expect(seen.atTheStart?.supervisor.watching).toBe(true)
    expect(seen.atTheStart?.supervisor.pid).toBe(supervisor?.pid)
  })

  it('says the first start was the first start, and a later one names the file', () => {
    expect(seen.atTheStart?.supervisor.restartedBecause).toBe('the first start')
    expect(seen.afterTheFirstAppend?.supervisor.restartedBecause).toContain('src/shared/product.ts changed')
  })

  it('prints one plain line per restart, naming the file', () => {
    expect(seen.lines.join('\n')).toContain('[dev] restarting the server: src/shared/product.ts changed')
  })
})

describe('one supervisor per port', () => {
  it('the second supervisor refused to start', () => {
    expect(seen.theSecondSupervisorExitedWith).toBe(1)
  })

  it('and said whose the port is, rather than only that something was there', () => {
    expect(seen.theSecondSupervisorSaid).toContain('the dev supervisor')
    expect(seen.theSecondSupervisorSaid).toContain(String(port))
    expect(seen.theSecondSupervisorSaid).toContain('did not start and has changed nothing')
  })
})

