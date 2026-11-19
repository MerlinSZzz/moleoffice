// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A MADE-UP SANDBOX REPOSITORY. A worker run is asked only for a commit that a branch or tag of `<sandbox>/repo`
 * reaches (src/server/lib/worker-runs.ts, "the cut"). This makes `<folder>/repo` a new repository that reads the
 * objects of the checkout `from` as alternates, with `main` at the commit `from` stands at. Every git command writes
 * only inside `folder`: `from` is read and never written.
 */
export function aMadeUpSandboxRepo(folder: string, from: string): { repo: string; head: string; git: (cwd: string, ...args: string[]) => string } {
  const home = join(folder, 'git-home')
  mkdirSync(home, { recursive: true })
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, 'no-config'),
        GIT_AUTHOR_NAME: 'A made-up sandbox', GIT_AUTHOR_EMAIL: 'sandbox@example.invalid',
        GIT_COMMITTER_NAME: 'A made-up sandbox', GIT_COMMITTER_EMAIL: 'sandbox@example.invalid',
      },
    }).trim()
  const repo = join(folder, 'repo')
  const head = git(from, 'rev-parse', '--verify', 'HEAD^{commit}')
  const objects = join(git(from, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'objects')
  git(folder, 'init', '-q', '-b', 'main', repo)
  writeFileSync(join(repo, '.git', 'objects', 'info', 'alternates'), `${objects}\n`)
  git(repo, 'update-ref', 'refs/heads/main', head)
  return { repo, head, git }
}
