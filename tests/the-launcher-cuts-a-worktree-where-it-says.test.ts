// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER CUTS A WORKER'S WORKTREE AT THE COMMIT IT WAS GIVEN, OR SAYS IT DID NOT. Wave 13j, the round after
 * loop-10, item 2. The office gives the sandbox launcher `--cut-from <commit>` for a worker whose worktree is not there
 * yet (src/server/lib/worker-runs.ts, "the cut"), and `theAgentsWorktree` in tools/sandbox-common.mjs makes the
 * worktree. tests/a-supervisor-starts-its-own-worker.test.ts proves the office's side; this file proves the launcher's.
 *
 * EVERYTHING HERE IS MADE UP: the instance folder, its repository with two commits, and the branches. Every git command
 * writes only inside this test's own temporary folder.
 *
 * WHAT IS PROVED
 *   1. A worktree that is not there is made on a new branch named for the agent, at the cut, and the sentence says so.
 *   2. A branch of the agent's name that an earlier run left at the cut's commit is reused, and the sentence is the one
 *      for a new branch at the cut, which is true of it.
 *   3. A left branch at another commit, with the cut named on purpose (`cutNamed`, which `--cut-from` sets), is not
 *      reused: the worktree is made detached at the cut and is given the branch named for the agent and the run once
 *      the run is filed, and the left branch stays where it was.
 *   4. The same branch with no cut named is reused as it stood, as before, and the sentence says it was not cut from
 *      the commit given.
 *   5. A branch another worktree holds: detached at the cut, then the branch named for the agent and the run.
 *   6. A folder that is there is used as it stands, and nothing is made.
 *
 * MUTATION PROOF (after a green control, alone, restored with cp and checked with cmp, then green again): named in the
 * commit that passes the cut, with its logs.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theAgentsWorktree, theWorktreesBranchAfterFiling } from '../tools/sandbox-common.mjs'

/** A made-up run id, as the office would give the worker's run. */
const A_RUN = 'Rs1e2r3t4y5u'

let scratch = ''
let instance = ''
let repo = ''
let from = ''
/** The first and second commits of the made-up repository; `main` stands at the second. */
let first = ''
let second = ''
const settingsBefore: Record<string, string | undefined> = {}
const GIT_SETTINGS = ['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'] as const

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const worktreeOf = (handle: string): string => join(instance, 'worktrees', handle)
const madeFrom = (dir: string, how: string): string => `--worktree ${dir} did not exist, so it was made: git worktree add from ${repo}, ${how}.`

beforeAll(() => {
  // GIT READS NO CONFIGURATION OF THIS MACHINE'S, here and in the launcher's own git commands, which this process starts.
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-launcher-cut-')))
  for (const name of GIT_SETTINGS) settingsBefore[name] = process.env[name]
  Object.assign(process.env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(scratch, 'no-config'),
    GIT_AUTHOR_NAME: 'A made-up instance', GIT_AUTHOR_EMAIL: 'instance@example.invalid',
    GIT_COMMITTER_NAME: 'A made-up instance', GIT_COMMITTER_EMAIL: 'instance@example.invalid',
  })
  instance = join(scratch, 'instance')
  repo = join(instance, 'repo')
  from = join(scratch, 'a-source-with-no-node-modules')
  mkdirSync(from, { recursive: true })
  git(scratch, 'init', '-q', '-b', 'main', repo)
  git(repo, 'commit', '--allow-empty', '-qm', 'The first made-up commit')
  first = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'commit', '--allow-empty', '-qm', 'The second made-up commit')
  second = git(repo, 'rev-parse', 'HEAD')
})

afterAll(() => {
  for (const name of GIT_SETTINGS) {
    if (settingsBefore[name] === undefined) delete process.env[name]
    else process.env[name] = settingsBefore[name]
  }
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the worktree a worker is cut into', () => {
  it('1: makes a worktree that is not there on a new branch named for the agent, at the cut', () => {
    const dir = worktreeOf('tw-new')
    const made = theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-new', value: dir, cutFrom: first, cutNamed: true })
    expect(made).toEqual({ dir, branchAfterRun: null, made: madeFrom(dir, `cut from ${first}, on branch tw-new`) })
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(first)
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('tw-new')
  })

  it('2: reuses a branch an earlier run left at the commit of the cut', () => {
    git(repo, 'branch', 'tw-at', second)
    const dir = worktreeOf('tw-at')
    const made = theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-at', value: dir, cutFrom: 'main', cutNamed: true })
    expect(made).toEqual({ dir, branchAfterRun: null, made: madeFrom(dir, 'cut from main, on branch tw-at') })
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('tw-at')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(second)
  })

  it('3: does not reuse a left branch at another commit when the cut was named, and gives the run its own branch at the cut', () => {
    git(repo, 'branch', 'tw-else', first)
    const dir = worktreeOf('tw-else')
    const made = theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-else', value: dir, cutFrom: second, cutNamed: true })
    expect(made).toEqual({ dir, branchAfterRun: 'tw-else', made: madeFrom(dir, `cut from ${second}, detached until its run is filed because branch tw-else is there already at another commit`) })
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(second)
    expect(theWorktreesBranchAfterFiling(made, A_RUN)).toBe(`--worktree ${dir} is now on branch tw-else-${A_RUN}.`)
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe(`tw-else-${A_RUN}`)
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(second)
    expect(git(repo, 'rev-parse', 'refs/heads/tw-else')).toBe(first)
  })

  it('4: reuses a left branch at another commit as it stood when no cut was named, and says it was not cut from the commit given', () => {
    git(repo, 'branch', 'tw-old', first)
    const dir = worktreeOf('tw-old')
    const made = theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-old', value: dir, cutFrom: second })
    expect(made).toEqual({
      dir, branchAfterRun: null,
      made: madeFrom(dir, `on branch tw-old, which was there already at ${first} and was checked out as it stood, so it was not cut from ${second}`),
    })
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('tw-old')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(first)
  })

  it('5: detaches at the cut when another worktree holds the branch, and gives the run its own branch', () => {
    git(repo, 'worktree', 'add', '-q', '-b', 'tw-held', join(scratch, 'the-holder'), first)
    const dir = worktreeOf('tw-held')
    const made = theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-held', value: dir, cutFrom: second, cutNamed: true })
    expect(made).toEqual({ dir, branchAfterRun: 'tw-held', made: madeFrom(dir, `cut from ${second}, detached until its run is filed because branch tw-held is held by another worktree`) })
    expect(theWorktreesBranchAfterFiling(made, A_RUN)).toBe(`--worktree ${dir} is now on branch tw-held-${A_RUN}.`)
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(second)
  })

  it('6: uses a folder that is there as it stands, and makes nothing', () => {
    const dir = worktreeOf('tw-there')
    mkdirSync(dir, { recursive: true })
    expect(theAgentsWorktree({ instanceDir: instance, from, branch: 'tw-there', value: dir, cutFrom: second, cutNamed: true })).toEqual({ dir, made: null, branchAfterRun: null })
    expect(git(repo, 'branch', '--list', 'tw-there')).toBe('')
  })
})
