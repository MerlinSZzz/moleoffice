// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S OWN COMMITS ARE READ WHEN THEIR PATCH LOG IS LARGER THAN ONE GIT READ MAY PRINT, AND A GIT READ THAT FAILS THERE
 * IS SAID IN WORDS.
 *
 * THE REAL FAULT. A run's finishing write answered 500 "internal error". To find which of the run's commits are already
 * on main, the seal asks `git log -p` for the patches from the fork base to HEAD and hands them to `git patch-id`. In that
 * run's working directory the log was 285,341,261 bytes. The office keeps at most 64 MiB of what one git read prints, so
 * the read threw "spawnSync git ENOBUFS". Nothing caught it as a failure of git, and the write answered 500 with no words.
 *
 * WHAT IS PROVED.
 *   1. A run whose own commits add a 70 MiB file and then delete it has a patch log of about 148 MB. Its own commits are
 *      read: both commits are the run's, and none is carried. Today's code throws ENOBUFS here.
 *  1b. In the same kind of repository with the large file's object taken out, git cannot print the patch log. The read
 *      answers `unread`, and its sentence names the read, the directory and git's own words. It also carries the HEAD
 *      git read before the patches, which a records seal stores as the run's end commit. Today's code throws git's
 *      error, which the finishing write answered with the same 500.
 *   After each case the folder this file gave the office as its temporary folder is empty, so the reader removed the
 *   folder it wrote the log in, also when git failed. No fault of that kind has been seen; the check is here because a
 *   log left behind would be 150 MB each time.
 *
 * SMALL ON DISK. The large file is written as a git object only, never into a working tree. Its one line, repeated,
 * compresses to about a megabyte. While the read runs, the log is written to a file in the temporary folder this file
 * made, about 150 MB, and the reader removes it.
 *
 * ONLY THIS FILE'S OWN TEMPORARY FOLDER IS LISTED. TMPDIR is set to a folder this file made, for the read alone, so the
 * reader can make its folder only there.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { AnOwnCommitsAsk, TheRunsOwnCommits } from '../src/server/lib/a-runs-own-commits.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let ownCommits: typeof import('../src/server/lib/a-runs-own-commits.ts')
let scratch = ''
let theOfficesTemporaryFolder = ''
let n = 0

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** One made-up line of 80 bytes, so 70 MiB of it is 917,504 whole lines. */
const A_LINE = `${'Synthetic line of a large made-up file, the same line again and again'.padEnd(79, '.')}\n`

/** 70 MiB. The patch log prints each of its lines once added and once deleted, about 148 MB in all. */
const LARGE = 70 * 1024 * 1024

const ADDED = 'Synthetic commit that adds a large file'
const DELETED = 'Synthetic commit that deletes it'

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-patch-log-repositories-'))
  theOfficesTemporaryFolder = mkdtempSync(join(tmpdir(), 'mole-office-patch-log-temporary-'))
  t = await freshDb()
  ownCommits = await import('../src/server/lib/a-runs-own-commits.ts')
})

afterAll(() => {
  t?.close()
  for (const folder of [scratch, theOfficesTemporaryFolder]) if (folder) rmSync(folder, { recursive: true, force: true })
})

/**
 * A made-up repository: a base commit on main, and on the branch `worker` a commit that adds a 70 MiB file and a commit
 * that deletes it. The file is a git object only. The branch is moved with update-ref, so the working tree stays at the
 * base and never holds the file.
 */
function aRepositoryWithALargeFileAddedAndDeleted(): { dir: string; base: string; added: string; deleted: string; blob: string } {
  const dir = join(scratch, `repository-${++n}`)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic patch log fixture')
  git(dir, 'config', 'user.email', ['fixture', 'example.invalid'].join('@'))
  git(dir, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'base.txt'), 'Synthetic base.\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic base')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const blob = execFileSync('git', ['-C', dir, 'hash-object', '-w', '--stdin'], { input: Buffer.alloc(LARGE, A_LINE), encoding: 'utf8' }).trim()
  const withTheFile = execFileSync('git', ['-C', dir, 'mktree'], { input: `${git(dir, 'ls-tree', 'HEAD')}\n100644 blob ${blob}\tlarge.txt\n`, encoding: 'utf8' }).trim()
  const added = git(dir, 'commit-tree', withTheFile, '-p', base, '-m', ADDED)
  const deleted = git(dir, 'commit-tree', `${base}^{tree}`, '-p', added, '-m', DELETED)
  git(dir, 'update-ref', 'refs/heads/worker', deleted)
  return { dir, base, added, deleted, blob }
}

/** What a finishing write asks of a run filed at the base, not yet ended, that names main as its cut. */
function theAskOf(dir: string, base: string): AnOwnCommitsAsk {
  return { directory: dir, filedIn: dir, named: 'main', records: false, prior: null, runs: [{ filing: base, end: null }], seals: [] }
}

/** The run's own commits, read with TMPDIR set to the folder this file made, and put back after. */
function theOwnCommitsReadFor(ask: AnOwnCommitsAsk): TheRunsOwnCommits {
  const before = process.env['TMPDIR']
  process.env['TMPDIR'] = theOfficesTemporaryFolder
  try {
    return ownCommits.theRunsOwnCommitsRead(ask)
  } finally {
    if (before === undefined) delete process.env['TMPDIR']
    else process.env['TMPDIR'] = before
  }
}

it("1: reads a run's own commits whose patch log is larger than one git read may print", () => {
  // THE REAL FAULT: the finishing write of a run whose patch log was 285,341,261 bytes answered 500, because the log was
  // read whole into the 64 MiB one git read may hold and the ENOBUFS it threw was not caught as a failure of git.
  const { dir, base, added, deleted } = aRepositoryWithALargeFileAddedAndDeleted()
  expect(theOwnCommitsReadFor(theAskOf(dir, base))).toEqual({
    forkBase: base,
    head: deleted,
    own: [{ commit: added, subject: ADDED }, { commit: deleted, subject: DELETED }],
    carried: [],
    foreign: [],
    cutFound: true,
  })
  expect(readdirSync(theOfficesTemporaryFolder)).toEqual([])
})

it('1b: says which git read failed, where and why, when git cannot print the patch log', () => {
  // THE REAL FAULT: any git failure in these reads was thrown, and the finishing write answered it with a 500 and no words.
  // Here git exits 128, because the object the patch log has to print is gone.
  const { dir, base, deleted, blob } = aRepositoryWithALargeFileAddedAndDeleted()
  rmSync(join(dir, '.git', 'objects', blob.slice(0, 2), blob.slice(2)))
  const read = theOwnCommitsReadFor(theAskOf(dir, base))
  if (!('unread' in read)) throw new Error(`the read was not unread: ${JSON.stringify(read)}`)
  expect(read.unread.startsWith(`git could not read the patches of ${base}..${deleted} in ${dir} (git exited 128: `), read.unread).toBe(true)
  expect(read.unread).toContain(blob)
  // HEAD WAS READ BEFORE THE PATCHES, so the answer still holds it, and a seal does not store it as not read.
  expect(read).toMatchObject({ head: deleted })
  expect(readdirSync(theOfficesTemporaryFolder)).toEqual([])
})
