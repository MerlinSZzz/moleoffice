// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY TEST FILE GETS A HOME OF ITS OWN, AND THE HOME OF WHOEVER IS RUNNING IS PUT OUT OF REACH.
 *
 * Problem `hlNgNPM9hGTh`, 24 September 2026. On 23 September at 22:51 and on 24 September at 10:59,
 * measurement agents unpacked this checkout with `git archive` into throwaway folders and ran its
 * tools inside them, with the real `HOME`. `tools/install-the-entry.mjs` appended a `SessionStart`
 * and a `SessionEnd` line to the owner's own `~/.claude/settings.json`, each running a session hook
 * in a folder that was about to be deleted. Three pairs of them were in the owner's file, beside their own,
 * and every Claude Code session on the machine ran all four.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS THIS FILE DOES
 * ---------------------------------------------------------------------------------------
 *
 * 1. IT MOVES `HOME`. Before the runner collects a test file, `HOME` is pointed at a fresh
 *    directory this file makes under `~/.cache/mole-office/test-homes`, and that directory is
 *    removed when the file's tests are done. `WHERE_TEST_HOMES_GO` below says why it is there and
 *    not in the system temporary folder. `os.homedir()` reads `$HOME` on this platform, so every path
 *    a test or a tool works out from the home directory lands in there instead. Test files that
 *    already moved `HOME` themselves keep working: they capture `process.env.HOME` and put it back,
 *    and what they put back is now this directory rather than the owner's.
 *
 * 2. IT GUARDS THE HOME THEY STARTED WITH. Moving `HOME` does nothing about a path written out in
 *    full, or one captured before the move. So the write calls of `node:fs` and `node:fs/promises`
 *    are wrapped, and a write under the home this process started with fails at the call, with a
 *    sentence naming the call and the path. Reads are not touched: a test may still read anything
 *    it could read before.
 *
 *    IT THROWS, EVEN ON THE `node:fs/promises` CALLS, which return a promise when they run. A path
 *    under that home is a mistake in the test rather than something the disk did, and a mistake is
 *    raised where it was made. `await writeFile(...)` inside a test still lands in that test's own
 *    failure; a caller that neither awaits nor catches sees the same error, which is what should
 *    happen to it.
 *
 * THE ONE FOLDER UNDER THE OWNER'S HOME A TEST MAY STILL WRITE. Chapter 3 rule 1 of the office regulations
 * names `~/.cache/mole-office` as where this project's own files go — worktrees and sandboxes.
 * Writes there are allowed and everything else under the owner's home is not.
 *
 * WHY IT IS A SETUP FILE AND NOT A RULE EACH TEST FOLLOWS. `vitest.config.ts` names this under
 * `setupFiles`, so it runs in the process that runs the test file, before that file is collected.
 * One place means a new test file is covered on the day it is written, with nobody having to
 * remember. Six test files were already doing this by hand before this file existed, each in its
 * own `beforeAll`, and a seventh that forgot would have looked exactly like the six that did not.
 *
 * WHERE THE GUARD DOES NOT REACH, said here rather than left to be discovered. It wraps the calls
 * this checkout makes, named one by one in `THE_WRITE_CALLS` below; a write through a call that is
 * not in that list is not seen. It compares the path as it was given, with `.` and `..` worked out
 * but symbolic links not followed. A test file that mocks `node:fs` itself replaces this wrapper
 * for that file — `tests/the-key-file-can-gain-an-entry.test.ts` is the one that does, and
 * `tests/no-test-writes-into-the-owners-home.test.ts` names it. And it is in this process only: a
 * command a test starts is a process of its own, where nothing here runs. What protects those is
 * the moved `HOME` above, which they inherit, and the refusals in
 * `src/config/install-the-entry.mjs` — that is the act that caused problem `hlNgNPM9hGTh`, and it
 * now refuses to point a hook at a folder git keeps nothing of, whatever the home directory says.
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, vi } from 'vitest'

import { THE_HOME_BEFORE_THE_TESTS } from './the-home-before-the-tests.ts'

/**
 * THE REAL `node:fs`, NOT THE WRAPPED ONE.
 *
 * The runner hoists the `vi.mock` calls below above this file's own imports, so an
 * `import { mkdtempSync } from 'node:fs'` here would reach the guard while the guard is still being
 * built. `createRequire` loads the module the way Node does, which the runner does not touch, so
 * the three calls this file makes for itself are the real ones.
 */
const realFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')

/**
 * THE HOME THIS PROCESS STARTED WITH, read before `HOME` is moved and resolved through any symbolic
 * link, so a comparison below is against the path the file system really uses.
 */
const THE_HOME_THEY_STARTED_WITH = aRealPath(homedir())

/** The one folder under it a test may write into: office regulations chapter 3 rule 1. */
const THE_PROJECTS_OWN_FOLDER_IN_IT = join(THE_HOME_THEY_STARTED_WITH, '.cache', 'mole-office')

/**
 * WHERE THE HOMES THIS FILE MAKES GO: `~/.cache/mole-office/test-homes`, on the home the run
 * started with.
 *
 * NOT THE SYSTEM TEMPORARY FOLDER, and that was measured. `src/config/files-area.mjs` counts the
 * home this process runs in as one of the homes on the machine, and the files-area door refuses any
 * folder that holds a home. With the test home under `/tmp`, `/tmp` held a home, and
 * `tests/an-agents-files-area-never-holds-what-no-files-run-writes.test.ts` — which registers `/tmp`
 * and expects to be told it holds the office's data folder — was told it held a home instead. Both
 * sentences were true; the door says one of them. Half the suite keeps its scratch folders in
 * `/tmp`, so a home there collides with whatever else reasons about homes.
 *
 * `~/.cache/mole-office` is where office regulations chapter 3 rule 1 sends this project's own
 * files, and the suite already keeps worktrees and sandboxes there.
 */
const WHERE_TEST_HOMES_GO = join(THE_PROJECTS_OWN_FOLDER_IN_IT, 'test-homes')

/** This test file's own home, made here and removed when this file's tests are done. */
const THIS_FILES_HOME = aHomeForThisFile()

/**
 * THE TWO VARIABLES THIS FILE SETS, and nothing else does.
 *
 * `HOME` is where every path a test works out from the home directory now lands.
 * `THE_HOME_BEFORE_THE_TESTS` is the old value, written down because once `HOME` has moved nothing
 * else on the machine can say what it was, and the test that checks the guard names that home.
 * `tests/the-home-before-the-tests.ts` reads it back.
 */
process.env[THE_HOME_BEFORE_THE_TESTS] = THE_HOME_THEY_STARTED_WITH
process.env.HOME = THIS_FILES_HOME

/**
 * THE WRITE CALLS THAT ARE WRAPPED, and which of their arguments is a path being written.
 *
 * Every one of these creates, changes, moves or removes something on disk. `renameSync(a, b)`
 * unlinks `a` as well as making `b`, so both are checked. `copyFileSync`, `cpSync`, `linkSync` and
 * `symlinkSync` take the source first and the thing they make second, so only the second is a
 * write. Reading calls are deliberately absent: a test may read whatever it could read before.
 *
 * `open` and `openSync` are handled separately below, because whether they write depends on the
 * flags they are given rather than on the name of the call.
 */
const THE_WRITE_CALLS: Readonly<Record<string, readonly number[]>> = {
  appendFile: [0],
  appendFileSync: [0],
  chmod: [0],
  chmodSync: [0],
  chown: [0],
  chownSync: [0],
  copyFile: [1],
  copyFileSync: [1],
  cp: [1],
  cpSync: [1],
  createWriteStream: [0],
  lchmod: [0],
  lchmodSync: [0],
  lchown: [0],
  lchownSync: [0],
  link: [1],
  linkSync: [1],
  lutimes: [0],
  lutimesSync: [0],
  mkdir: [0],
  mkdirSync: [0],
  mkdtemp: [0],
  mkdtempSync: [0],
  rename: [0, 1],
  renameSync: [0, 1],
  rm: [0],
  rmSync: [0],
  rmdir: [0],
  rmdirSync: [0],
  symlink: [1],
  symlinkSync: [1],
  truncate: [0],
  truncateSync: [0],
  unlink: [0],
  unlinkSync: [0],
  utimes: [0],
  utimesSync: [0],
  writeFile: [0],
  writeFileSync: [0],
}

/**
 * A fresh home for this test file, made under `WHERE_TEST_HOMES_GO`.
 *
 * It fails rather than falling back anywhere else. A home somewhere nobody expected is the fault
 * this file exists to stop, so a directory that cannot be made is said out loud.
 */
function aHomeForThisFile(): string {
  realFs.mkdirSync(WHERE_TEST_HOMES_GO, { recursive: true })
  return realFs.mkdtempSync(join(WHERE_TEST_HOMES_GO, 'a-test-home-'))
}

/** The real path of a directory, or the path itself when the file system cannot resolve it. */
function aRealPath(path: string): string {
  try {
    return realFs.realpathSync(path)
  } catch {
    // Nothing is there to resolve, so the path as written is the best answer there is, and saying
    // so is better than failing every test because a temporary folder has not been made yet.
    return path
  }
}

/** A path argument as a string, or null because it is a file descriptor or something else. */
function asAPath(given: unknown): string | null {
  if (typeof given === 'string') return given
  if (given instanceof URL && given.protocol === 'file:') return fileURLToPath(given)
  if (Buffer.isBuffer(given)) return given.toString('utf8')
  return null
}

/** Is this path inside that directory, or the directory itself? */
function inside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}${sep}`)
}

/**
 * WHY THIS WRITE IS REFUSED, or null because it is somewhere a test may write.
 *
 * The sentence names the call, the path, the folder this test file was given instead, and the one
 * folder under the owner's home that is still open, so whoever reads it can act on it without looking
 * anything up.
 */
function whyThisWriteIsRefused(call: string, given: unknown): string | null {
  const path = asAPath(given)
  if (path === null) return null
  const full = resolve(path)
  if (!inside(full, THE_HOME_THEY_STARTED_WITH)) return null
  if (inside(full, THE_PROJECTS_OWN_FOLDER_IN_IT)) return null
  // This file's own home is inside the folder above, so it is already allowed; the line is here
  // because the folder it goes in is a decision that could move.
  if (inside(full, THIS_FILES_HOME)) return null
  return (
    `A test called ${call} on ${full}, which is under the home directory this test run started ` +
    `with: ${THE_HOME_THEY_STARTED_WITH}. Nothing a test makes goes into it (office regulations ` +
    "chapter 3 rule 1), and problem hlNgNPM9hGTh is what one such write cost: the owner's " +
    '~/.claude/settings.json gained hook lines running code in a folder that was about to be ' +
    `deleted. Nothing was written. This test file's own home is ${THIS_FILES_HOME}, and the one ` +
    `folder under the old home a test may write into is ${THE_PROJECTS_OWN_FOLDER_IN_IT}.`
  )
}

/**
 * Do these `open` flags ask to write?
 *
 * A string flag writes unless it is `r` or `rs` with no `+`. A number is the bits `fs.constants`
 * names, and any of writing, creating, appending or truncating makes it a write. No flags at all
 * means `r`, which reads.
 */
function theseFlagsWrite(flags: unknown, constants: Record<string, number | undefined>): boolean {
  if (flags === undefined || flags === null) return false
  if (typeof flags === 'string') return flags.includes('w') || flags.includes('a') || flags.includes('+')
  if (typeof flags === 'number') {
    // A name this platform does not have counts for nothing, rather than making the whole mask NaN.
    const writing = ['O_WRONLY', 'O_RDWR', 'O_CREAT', 'O_APPEND', 'O_TRUNC'].reduce(
      (mask, name) => mask | (constants[name] ?? 0),
      0,
    )
    return (flags & writing) !== 0
  }
  return false
}

/** One call wrapped: the guard first, then the real call with the arguments it was given. */
function guarded(call: string, real: unknown, at: readonly number[]): unknown {
  if (typeof real !== 'function') return real
  const run = real as (...args: unknown[]) => unknown
  return function (this: unknown, ...args: unknown[]) {
    for (const index of at) {
      const why = whyThisWriteIsRefused(call, args[index])
      if (why !== null) throw new Error(why)
    }
    return run.apply(this, args)
  }
}

/** Every write call of one `fs`-shaped object wrapped, with everything else left as it was. */
function withTheGuard<T extends object>(real: T, constants: Record<string, number | undefined>): T {
  const wrapped: Record<string, unknown> = { ...(real as Record<string, unknown>) }
  for (const [call, at] of Object.entries(THE_WRITE_CALLS)) {
    if (call in wrapped) wrapped[call] = guarded(call, wrapped[call], at)
  }
  for (const call of ['open', 'openSync']) {
    const held = wrapped[call]
    if (typeof held !== 'function') continue
    const run = held as (...args: unknown[]) => unknown
    wrapped[call] = function (this: unknown, ...args: unknown[]) {
      if (theseFlagsWrite(args[1], constants)) {
        const why = whyThisWriteIsRefused(call, args[0])
        if (why !== null) throw new Error(why)
      }
      return run.apply(this, args)
    }
  }
  return wrapped as T
}

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const guardedFs = withTheGuard(real, real.constants as unknown as Record<string, number | undefined>)
  return {
    ...guardedFs,
    // `import fs from 'node:fs'` and `fs.promises` have to reach the guard too, or the same write
    // gets through by being spelled a different way.
    promises: withTheGuard(real.promises, real.constants as unknown as Record<string, number | undefined>),
    default: {
      ...guardedFs,
      promises: withTheGuard(real.promises, real.constants as unknown as Record<string, number | undefined>),
    },
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  const { constants } = await import('node:fs')
  const guardedPromises = withTheGuard(real, constants as unknown as Record<string, number | undefined>)
  return { ...guardedPromises, default: guardedPromises }
})

afterAll(() => {
  realFs.rmSync(THIS_FILES_HOME, { recursive: true, force: true })
})
