// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCRATCH SWEEP KEEPS A FOLDER THAT HOLDS A GIT WORKTREE WITH WORK ONLY THAT WORKTREE HOLDS.
 *
 * tools/sweep-run-scratch.mjs removes a finished run's scratch folder once its wait has passed. A git worktree put inside
 * that folder may hold the only copy of some work: a HEAD at a commit that no branch, tag or other ref of its repository
 * contains, or changes nobody committed. The sweep keeps such a folder, and its line names the worktree and its commit.
 * A worktree is found by its `.git` file, at any depth. When git cannot answer for a worktree, the folder is kept, and
 * the line carries what git said. A worktree on a branch with nothing uncommitted does not keep the folder. The sweep's
 * git starts no program that the repository's config names.
 *
 * THE CASES, each for a finished run past its wait
 *   1. A worktree detached at a commit no ref holds: kept, and the line names the worktree and the commit.
 *   2. A worktree on a branch with a changed tracked file: kept, and the line names the worktree and the commit.
 *   3. A worktree on a branch with only an untracked file: kept.
 *   4. A worktree on a branch with nothing uncommitted: the folder is removed.
 *   5. A `.git` file whose repository is gone: kept, and the line carries git's words, which name the repository folder
 *      the `.git` file points at.
 *   6. A worktree two folders deep, detached at a commit no ref holds: kept.
 *   7. A worktree on a branch with nothing uncommitted, whose repository names a program as its core.fsmonitor: the sweep
 *      starts no such program. Before the sweep, the test's own plain git status starts it, so the program is shown to
 *      be one git would run.
 *
 * WHAT IS REAL. The sweep, the folder, the repository each case makes with git init, its worktrees and git itself.
 * WHAT IS MADE UP. The run's record, the office's answer and the two process checks, which find no process. Case 7's
 * fsmonitor is a made-up program that only adds a line to a marker file outside the folder. Every commit is under a
 * made-up name and address. The test's own git calls run with no GIT_* variable from the environment, and the commits a
 * line names are read with git rev-parse.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { A_FINISHED_RUNS_SCRATCH_WAITS_MS, sweepRunScratch } from '../tools/sweep-run-scratch.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

const run = 'worktree_k_1', now = new Date(2026, 10, 16, 12).getTime()
let root: string, temp: string, instanceDir: string, folder: string, repository: string

/** This process's environment with no GIT_* variable, for the test's own git calls. */
const withNoGitVariable = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
/** Git in `cwd`, committing as a made-up committer; answers what it printed, trimmed. */
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [
  '-c', 'user.name=A made-up committer', '-c', 'user.email=made-up-committer@example.invalid', '-c', 'commit.gpgsign=false', ...args,
], { cwd, env: withNoGitVariable(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'worktree-keep-sweep-')); temp = join(root, 'tmp'); instanceDir = join(root, 'instance')
  repository = join(root, 'repository'); folder = join(temp, `${run}-ABC123`)
  for (const dir of [instanceDir, folder, repository]) mkdirSync(dir, { recursive: true })
  git(repository, 'init', '-q', '-b', 'main')
  writeFileSync(join(repository, 'notes.txt'), 'A made-up file\n')
  git(repository, 'add', 'notes.txt')
  git(repository, 'commit', '-q', '-m', 'A made-up first commit')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/**
 * A worktree of the case's repository at `where` inside the folder, made from main on a branch of its own or detached.
 * Answers its real path, read before the sweep, as the sweep walks the folder's real path.
 */
function aWorktree(where: string, on: 'a branch' | 'detached'): string {
  const path = join(folder, where)
  git(repository, 'worktree', 'add', '-q', ...(on === 'a branch' ? ['-b', `made-up-${where.replaceAll('/', '-')}`] : ['--detach']), path, 'main')
  return realpathSync(path)
}

/** A new commit in a detached `worktree`, which only its HEAD holds; answers the commit, read with git rev-parse. */
function aCommitOnlyItsHeadHolds(worktree: string): string {
  git(worktree, 'commit', '-q', '--allow-empty', '-m', 'A made-up commit that no ref holds')
  return git(worktree, 'rev-parse', '--verify', 'HEAD')
}

/** One sweep, for a finished run whose record last changed a minute past its wait. */
async function sweep(): Promise<void> {
  const record = { id: run, kind: 'session', updatedAt: localStampOf(new Date(now - A_FINISHED_RUNS_SCRATCH_WAITS_MS - 60_000)), data: { state: 'finished' } }
  await sweepRunScratch({ root: temp, instanceDir, workspace: 'synthetic', now, clock: () => now, sleep: async () => {},
    processes: () => ({ using: [], unreadable: [] }), free: () => ({ why: null, unreadable: [] }),
    ask: async (path: string) => path === `/api/records/${run}` ? { status: 200, body: { record } } : { status: 404, body: { error: 'Synthetic: no such door' } } })
}

/** What each line the sweep wrote about the folder in the run's finish.log says after the folder's path. */
const linesAbout = (): string[] => {
  const log = join(instanceDir, 'logs', run, 'finish.log')
  return (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []).filter(line => line.includes(` ${folder} `))
    .map(line => line.slice(line.indexOf(` ${folder} `) + folder.length + 2))
}

/** The folder is still there, and the one line about it names each of `names`. */
function itIsKeptNaming(...names: string[]): void {
  expect(existsSync(folder), linesAbout().join('\n')).toBe(true)
  expect(linesAbout()).toHaveLength(1)
  for (const name of names) expect(linesAbout()[0]).toContain(name)
}

it('1: keeps the folder while a worktree in it is detached at a commit no ref holds, naming the worktree and the commit', async () => {
  const worktree = aWorktree('worktree', 'detached')
  const commit = aCommitOnlyItsHeadHolds(worktree)
  await sweep()
  itIsKeptNaming(worktree, commit)
})

it('2: keeps the folder while a worktree in it has a changed tracked file, naming the worktree and the commit', async () => {
  const worktree = aWorktree('worktree', 'a branch')
  writeFileSync(join(worktree, 'notes.txt'), 'A made-up change nobody committed\n')
  const commit = git(worktree, 'rev-parse', '--verify', 'HEAD')
  await sweep()
  itIsKeptNaming(worktree, commit)
})

it('3: keeps the folder while a worktree in it has only an untracked file', async () => {
  const worktree = aWorktree('worktree', 'a branch')
  writeFileSync(join(worktree, 'made-up-untracked.txt'), 'A made-up file nobody added\n')
  await sweep()
  itIsKeptNaming(worktree)
})

it('4: removes the folder when its worktree is on a branch with nothing uncommitted', async () => {
  aWorktree('worktree', 'a branch')
  await sweep()
  expect(existsSync(folder), linesAbout().join('\n')).toBe(false)
})

it("5: keeps the folder when a worktree's repository is gone, and the line carries what git said", async () => {
  const worktree = aWorktree('worktree', 'a branch')
  const gitdir = /^gitdir: (.+)$/m.exec(readFileSync(join(worktree, '.git'), 'utf8'))?.[1]
  expect(gitdir, 'the worktree has no gitdir line').toBeDefined()
  rmSync(repository, { recursive: true, force: true })
  await sweep()
  // Git names the folder the .git file points at when it cannot find the repository there.
  itIsKeptNaming(worktree, String(gitdir))
})

it('6: keeps the folder while a worktree two folders deep in it is detached at a commit no ref holds', async () => {
  const worktree = aWorktree('first/second', 'detached')
  const commit = aCommitOnlyItsHeadHolds(worktree)
  await sweep()
  itIsKeptNaming(worktree, commit)
})

it('7: starts no program that the repository of a worktree in it names as its fsmonitor', async () => {
  const worktree = aWorktree('worktree', 'a branch')
  const marker = join(root, 'the-made-up-fsmonitor-ran'), program = join(root, 'a-made-up-fsmonitor')
  writeFileSync(program, `#!/bin/sh\necho ran >> '${marker}'\nexit 1\n`)
  chmodSync(program, 0o755)
  // Named after the worktree is made, so the worktree's own making does not start it.
  git(repository, 'config', 'core.fsmonitor', program)
  git(worktree, 'status', '--porcelain')
  expect(existsSync(marker), 'a plain git status did not start the made-up fsmonitor, so this case shows nothing').toBe(true)
  rmSync(marker)
  await sweep()
  expect(existsSync(marker), linesAbout().join('\n')).toBe(false)
})
