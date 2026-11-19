// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A MADE-UP RUN'S WORKTREE OF ITS OWN, for the territory tests. Two runs meet where the paths each changed since its
 * cut meet (src/server/lib/claims.ts, wave 13u round 194), and Git reads those paths from the run's `workingDirectory`
 * and `cutFrom`. This makes a Git repository in a folder the test owns, commits one file in it, and answers the two
 * fields for the run's data. Every git command writes only inside that folder, with no configuration of this machine's.
 */
export function aWorktreeOfItsOwn(folder: string): { workingDirectory: string; cutFrom: string } {
  const workingDirectory = mkdtempSync(join(folder, 'a-run-worktree-'))
  git(workingDirectory, 'init', '-q')
  writeFileSync(join(workingDirectory, 'a-made-up-readme.md'), 'as it was cut\n')
  git(workingDirectory, 'add', '-A')
  git(workingDirectory, 'commit', '-q', '-m', 'The made-up cut')
  return { workingDirectory, cutFrom: git(workingDirectory, 'rev-parse', 'HEAD') }
}

/**
 * THE RUN CHANGES THESE PATHS: each one that is no pattern and no folder written with a closing slash is written as a
 * file in its worktree, untracked, so Git lists it as changed since the cut. Given a run's territory, the run has changed
 * every file its territory names, so two runs that name one file both changed it and meet at it.
 */
export function theRunChanges(workingDirectory: string, paths: readonly string[]): void {
  for (const path of paths) {
    if (/[*?]/.test(path) || path.endsWith('/')) continue
    mkdirSync(dirname(join(workingDirectory, path)), { recursive: true })
    writeFileSync(join(workingDirectory, path), 'changed by the made-up run\n')
  }
}

function git(folder: string, ...args: string[]): string {
  return execFileSync('git', ['-C', folder, ...args], {
    encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'A made-up run', GIT_AUTHOR_EMAIL: 'run@example.invalid',
      GIT_COMMITTER_NAME: 'A made-up run', GIT_COMMITTER_EMAIL: 'run@example.invalid',
    },
  }).trim()
}
