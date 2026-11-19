// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S WORK TREE IS CHECKED OUT INSIDE ITS SANDBOX BY GIT'S PARALLEL CHECKOUT (item 2bb of the requirement list).
 *
 * In a sandbox the inspector clones the run's repository with no files, then checks the tip out inside the sandbox
 * (aWorktreeOfItsOwn in tools/the-inspector.mjs). git wrote the files with one process: 9,422 files of this repository
 * took about 0.9 seconds. With checkout.workers below one, git starts a worker process for each core and writes the same
 * files in about 0.2 seconds. The command is named in tools/inspector-checkout.mjs.
 *
 * WHAT IS PROVED, one case each:
 *   - The command starts git's checkout workers on a tree of 300 files, and leaves the tip checked out, detached, with
 *     nothing changed against it.
 *   - It writes what a checkout by one process writes: the same paths, bytes, modes and link targets.
 *
 * Every file is made up by this test, in a temporary folder of its own that is removed after each case. git reads no
 * configuration but the repository's and the command's, so the result does not depend on the machine's.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, then restored:
 *   - Leave checkout.workers out of the command: the first case goes red, because no worker is started.
 *   - Set checkout.workers to 1: the first case goes red, for the same reason.
 *   - Add core.symlinks=false to the command: both cases go red, because a link is written as a file, and git then
 *     counts it as changed.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theCheckoutInsideTheSandbox } from '../tools/inspector-checkout.mjs'

let scratch = ''
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-checks-checkout-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** git with no configuration from the machine, its author made up. */
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'A made-up author',
  GIT_AUTHOR_EMAIL: 'made-up@example.invalid',
  GIT_COMMITTER_NAME: 'A made-up author',
  GIT_COMMITTER_EMAIL: 'made-up@example.invalid',
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim()

/** A repository of 300 made-up files in 10 folders, one of them executable and one a link, and its tip. */
function aRepository(): { repository: string; tip: string } {
  const repository = join(scratch, 'the-run')
  for (let folder = 0; folder < 10; folder += 1) {
    mkdirSync(join(repository, `folder-${String(folder)}`), { recursive: true })
    for (let file = 0; file < 30; file += 1) writeFileSync(join(repository, `folder-${String(folder)}`, `file-${String(file)}.txt`), `folder ${String(folder)}, file ${String(file)}\n`)
  }
  chmodSync(join(repository, 'folder-0', 'file-0.txt'), 0o755)
  symlinkSync('../folder-0/file-0.txt', join(repository, 'folder-1', 'a-link'))
  git(repository, 'init', '-q')
  git(repository, 'add', '.')
  git(repository, 'commit', '-q', '-m', 'made-up files')
  return { repository, tip: git(repository, 'rev-parse', 'HEAD') }
}

/** A clone with no files checked out, as the inspector cuts it before the checkout inside the sandbox. */
function aCloneWithNoFiles(repository: string, name: string): string {
  const at = join(scratch, name)
  git(scratch, 'clone', '--quiet', '--no-local', '--no-checkout', repository, at)
  return at
}

/** The command checked out in `at`, as the sandbox runs it: from the work tree, with git's trace written to `trace`. */
function checkedOut(at: string, argv: string[], trace: string) {
  execFileSync(argv[0]!, argv.slice(1), { cwd: at, env: { ...ENV, GIT_TRACE2_EVENT: trace }, encoding: 'utf8' })
}

/** Every entry under `root` but `.git`, each as one line: its path, its kind, its mode, and its bytes or its link's target. */
function whatIsIn(root: string): string[] {
  const lines: string[] = []
  const walk = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      if (folder === root && name === '.git') continue
      const path = join(folder, name)
      const held = lstatSync(path)
      const where = relative(root, path)
      if (held.isSymbolicLink()) lines.push(`${where} link to ${readlinkSync(path)}`)
      else if (held.isDirectory()) {
        lines.push(`${where} folder`)
        walk(path)
      } else lines.push(`${where} file ${(held.mode & 0o111) === 0 ? 'not executable' : 'executable'} ${readFileSync(path, 'base64')}`)
    }
  }
  walk(root)
  return lines
}

describe("a check's checkout inside its sandbox", () => {
  it("starts git's checkout workers and leaves the tip checked out, detached, with nothing changed", () => {
    const { repository, tip } = aRepository()
    const at = aCloneWithNoFiles(repository, 'the-check')
    git(at, 'fetch', '--quiet', '--no-tags', repository, tip)
    const trace = join(scratch, 'trace.json')

    checkedOut(at, theCheckoutInsideTheSandbox(tip), trace)

    const workers = readFileSync(trace, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { event: string; argv?: string[] })
      .filter((one) => one.event === 'child_start' && one.argv?.[1] === 'checkout--worker')
    expect(workers.length, "git's checkout workers started").toBeGreaterThan(0)
    expect(git(at, 'rev-parse', 'HEAD')).toBe(tip)
    expect(() => git(at, 'symbolic-ref', '-q', 'HEAD'), 'HEAD is detached').toThrow()
    expect(git(at, 'status', '--porcelain')).toBe('')
  })

  it('writes what a checkout by one process writes', () => {
    const { repository, tip } = aRepository()
    const one = aCloneWithNoFiles(repository, 'by-one-process')
    git(one, 'checkout', '--quiet', '--detach', tip)
    const at = aCloneWithNoFiles(repository, 'the-check')

    checkedOut(at, theCheckoutInsideTheSandbox(tip), join(scratch, 'trace.json'))

    const there = whatIsIn(at)
    expect(there).toEqual(whatIsIn(one))
    expect(there).toContain('folder-1/a-link link to ../folder-0/file-0.txt')
    expect(there.filter((line) => / executable /.test(line) && !/ not executable /.test(line))).toEqual([`folder-0/file-0.txt file executable ${Buffer.from('folder 0, file 0\n').toString('base64')}`])
  })
})
