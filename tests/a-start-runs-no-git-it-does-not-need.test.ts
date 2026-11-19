// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START RUNS NO GIT IT DOES NOT NEED, AND ON A MAC IT DOES NOT START APPLE'S STAND-IN. Wave 13t,
 * round 23.
 *
 * On a Mac without Apple's command-line developer tools, `/usr/bin/git` is a stand-in that puts up a
 * prompt asking the person to install them. Measured on 6 October 2026 with a logging git first on
 * PATH, one start of the office from a worktree ran git six times: `git rev-parse --git-common-dir`
 * twice, once in each process that loads src/config/settings.mjs to find the `.env`, and
 * `git status --porcelain` four times, once for each reply's world while the start waited for the
 * office to answer. An installed app runs neither: it is a bundle, whose `.env` is in its data folder
 * and whose world names the build without git.
 *
 *   1. the settings find a worktree's `.env` in its main checkout by reading `.git`, and start no git,
 *      either for a worktree, an ordinary checkout or a folder that is no checkout, or when
 *      settings.mjs is loaded in this worktree;
 *   2. `gitDirsOf`, which the settings and the server's checkout reading share, reads both shapes
 *      of `.git` and answers null where there is no checkout;
 *   3. on a Mac stood in, `whyGitWouldAskToBeInstalled` says in words that git is needed when the first
 *      git on PATH is Apple's stand-in and no developer folder holds a git, and says nothing otherwise;
 *   4. the macOS probe's checkout reading then starts no git, says those words, and leaves whether the
 *      tree is dirty unknown; with the tools there (the control) it runs `git status` through the
 *      office's one git reader, with the guard of src/config/guarded-git.mjs in front.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - findEnvFile asks `git rev-parse --path-format=absolute --git-common-dir` again: red, case 1;
 *   - gitDirsOf ignores the `commondir` file: red, cases 1, 2 and 4;
 *   - whyGitWouldAskToBeInstalled no longer follows links (`mac.realPath(found)` → `found`): red, cases 3 and 4;
 *   - DEVELOPER_DIR is not taken alone: red, case 3;
 *   - the macOS probe's checkout hands on no reason: red, case 4;
 *   - the shared checkout runs `git status` though it was given a reason: red, case 4;
 *   - the office's git reader leaves out the guard's options: red, case 4.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync as makeTemp, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GUARDED_GIT_OPTIONS } from '../src/config/guarded-git.mjs'
import { findEnvFile, gitDirsOf } from '../src/config/settings.mjs'
import type { BorrowedByTheMac, DarwinProcessReader, TheMacsGit } from '../src/server/lib/darwin-probe.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SETTINGS = pathToFileURL(join(REPO, 'src', 'config', 'settings.mjs')).href

/** Every temporary folder this file made, removed after each case. */
const made: string[] = []
function mkdtempSync(prefix: string): string {
  const dir = makeTemp(prefix)
  made.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Run one git command in `cwd`, quietly. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/** A throwaway repository with one commit, no `.env`, and a worktree beside it. */
function aRepositoryWithAWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'no-git-test@example.invalid')
  git(root, 'config', 'user.name', 'No Git Test')
  writeFileSync(join(root, 'README'), 'x\n')
  git(root, 'add', 'README')
  git(root, 'commit', '-qm', 'first')
  const worktree = join(mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-worktree-')), 'wt')
  git(root, 'worktree', 'add', '-q', worktree, '-b', 'a-branch')
  return { root, worktree }
}

/** A folder holding a `git` that writes each call to a log and then runs the real git. */
function aLoggingGit() {
  const bin = mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-bin-'))
  const log = join(bin, 'calls.log')
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\nexec ${JSON.stringify(real)} "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])
  return { bin, gitPath: join(bin, 'git'), calls }
}

describe('a start runs no git it does not need', () => {
  it('1. the settings find each checkout\'s .env without starting git', () => {
    const { root, worktree } = aRepositoryWithAWorktree()
    writeFileSync(join(root, '.env'), 'MOLE_OFFICE_PORT=9\n')
    const plain = mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-plain-'))
    const { bin, calls } = aLoggingGit()
    const script =
      `const m = await import(${JSON.stringify(SETTINGS)})\n` +
      `process.stdout.write(JSON.stringify([${[worktree, root, plain].map((r) => `m.findEnvFile(${JSON.stringify(r)})`).join(', ')}]))\n`
    // The child loads settings.mjs from this worktree, so its own ENV_FILE is worked out there too.
    const said = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: plain,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
    })
    const [fromTheWorktree, fromTheMain, fromNoCheckout] = JSON.parse(said) as { path: string; found: boolean; checked: string[] }[]
    expect(fromTheWorktree).toEqual({ path: join(root, '.env'), found: true, checked: [join(worktree, '.env'), join(root, '.env')] })
    expect(fromTheMain).toEqual({ path: join(root, '.env'), found: true, checked: [join(root, '.env')] })
    expect(fromNoCheckout).toEqual({ path: join(plain, '.env'), found: false, checked: [join(plain, '.env')] })
    expect(calls(), 'a start of the settings ran git').toEqual([])
    // In-process too, with the same answers.
    expect(findEnvFile(worktree).path).toBe(join(root, '.env'))
  })

  it('2. gitDirsOf reads both shapes of .git, and answers null where there is no checkout', () => {
    const { root, worktree } = aRepositoryWithAWorktree()
    expect(gitDirsOf(root)).toEqual({ gitDir: join(root, '.git'), commonDir: join(root, '.git') })
    const fromTheWorktree = gitDirsOf(worktree)
    expect(fromTheWorktree?.commonDir).toBe(join(root, '.git'))
    expect(fromTheWorktree?.commonDir).toBe(git(worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
    expect(fromTheWorktree?.gitDir).toBe(git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir'))
    expect(gitDirsOf(mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-none-')))).toBeNull()
    const broken = mkdtempSync(join(tmpdir(), 'a-start-runs-no-git-broken-'))
    writeFileSync(join(broken, '.git'), 'not a gitdir line\n')
    expect(gitDirsOf(broken)).toBeNull()
  })
})

/** A Mac stood in: these files exist, these links lead there, and this is the environment. */
function aMac({ files, links = {}, env }: { files: string[]; links?: Record<string, string>; env: { PATH?: string; DEVELOPER_DIR?: string } }): TheMacsGit {
  return {
    environment: () => env,
    isFile: (path) => files.includes(path),
    realPath: (path) => links[path] ?? (files.includes(path) ? path : null),
  }
}

const APPLES_STAND_IN_GIT = '/usr/bin/git'
const TOOLS_GIT = '/Library/Developer/CommandLineTools/usr/bin/git'
const XCODE_GIT = '/Applications/Xcode.app/Contents/Developer/usr/bin/git'

describe('on a Mac, git is not started when it would only ask to be installed', () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  let t: TestDb
  let mac: typeof import('../src/server/lib/darwin-probe.ts')
  let res: typeof import('../src/server/lib/resources.ts')
  beforeAll(async () => {
    t = await freshDb()
    res = await import('../src/server/lib/resources.ts')
    mac = await import('../src/server/lib/darwin-probe.ts')
  })
  afterAll(() => t.close())

  it('3. Apple\'s stand-in with no developer folder is named in words; anything else may run', () => {
    const bare = mac.whyGitWouldAskToBeInstalled('/a/checkout', aMac({ files: [APPLES_STAND_IN_GIT], env: { PATH: '/usr/bin:/bin' } }))
    expect(bare).toContain('git is needed to say whether /a/checkout has changes nobody committed, and it was not started')
    expect(bare).toContain("/usr/bin/git, Apple's stand-in")
    expect(bare).toContain('xcode-select --install')
    expect(bare).toContain('/Library/Developer/CommandLineTools')
    // The command-line tools, or Xcode chosen through xcode-select's link: git may run.
    expect(mac.whyGitWouldAskToBeInstalled('/a', aMac({ files: [APPLES_STAND_IN_GIT, TOOLS_GIT], env: { PATH: '/usr/bin' } }))).toBeNull()
    expect(
      mac.whyGitWouldAskToBeInstalled('/a', aMac({
        files: [APPLES_STAND_IN_GIT, '/opt/x/Xcode-beta.app/Contents/Developer/usr/bin/git'],
        links: { '/var/db/xcode_select_link': '/opt/x/Xcode-beta.app/Contents/Developer' },
        env: { PATH: '/usr/bin' },
      })),
    ).toBeNull()
    expect(mac.whyGitWouldAskToBeInstalled('/a', aMac({ files: [APPLES_STAND_IN_GIT, XCODE_GIT], env: { PATH: '/usr/bin' } }))).toBeNull()
    // DEVELOPER_DIR is the only folder the stand-in reads when it is set, so the tools elsewhere do not count.
    const elsewhere = mac.whyGitWouldAskToBeInstalled('/a', aMac({ files: [APPLES_STAND_IN_GIT, TOOLS_GIT], env: { PATH: '/usr/bin', DEVELOPER_DIR: '/nowhere' } }))
    expect(elsewhere).toContain('looked in /nowhere)')
    // Homebrew's git first on PATH, even when it is a link: it is not the stand-in.
    expect(
      mac.whyGitWouldAskToBeInstalled('/a', aMac({
        files: ['/opt/homebrew/bin/git', APPLES_STAND_IN_GIT],
        links: { '/opt/homebrew/bin/git': '/opt/homebrew/Cellar/git/2.47.0/bin/git' },
        env: { PATH: '/opt/homebrew/bin:/usr/bin' },
      })),
    ).toBeNull()
    // A link that leads to the stand-in is the stand-in.
    expect(
      mac.whyGitWouldAskToBeInstalled('/a', aMac({ files: ['/usr/local/bin/git', APPLES_STAND_IN_GIT], links: { '/usr/local/bin/git': APPLES_STAND_IN_GIT }, env: { PATH: '/usr/local/bin:/usr/bin' } })),
    ).toContain('/usr/local/bin/git')
    // No git at all: nothing to prompt, and the reading says git is not installed in its own words.
    expect(mac.whyGitWouldAskToBeInstalled('/a', aMac({ files: [], env: { PATH: '/usr/bin' } }))).toBeNull()
  })

  it('4. the macOS probe\'s checkout starts no git then, and says so; with the tools there it runs git status', () => {
    const { worktree } = aRepositoryWithAWorktree()
    const { bin, gitPath, calls } = aLoggingGit()
    const reader = { commands: { lsof: () => ({ ran: false, reason: 'not asked' }) } } as unknown as DarwinProcessReader
    const install = { from: 'checkout' as const, root: REPO }
    const theMac = (withTheTools: boolean): TheMacsGit => ({
      environment: () => ({ PATH: bin }),
      isFile: (path) => path === gitPath || (withTheTools && path === TOOLS_GIT),
      // The logging git stands in for Apple's: its links are followed to /usr/bin/git.
      realPath: (path) => (path === gitPath ? APPLES_STAND_IN_GIT : null),
    })
    const was = process.env['PATH']
    process.env['PATH'] = `${bin}:${was ?? ''}`
    try {
      const without = new mac.DarwinProbe(res.LINUX_PROBE as unknown as BorrowedByTheMac, reader, install, theMac(false)).checkout(worktree)
      expect(calls(), 'the probe started git on a Mac whose git would ask to be installed').toEqual([])
      expect(without.dirty).toBeNull()
      expect(without.couldNotRead.join('\n')).toContain("Apple's stand-in, which would ask you to install the command-line developer tools")
      // What the files say is still read, with no git.
      expect(without.branch).toBe('a-branch')
      expect(without.isWorktree).toBe(true)

      const withTheTools = new mac.DarwinProbe(res.LINUX_PROBE as unknown as BorrowedByTheMac, reader, install, theMac(true)).checkout(worktree)
      // Through the office's one git reader: the guard's options, then the reader's own, then the directory.
      expect(calls(), 'the control: with the tools there, git status runs').toEqual([
        [...GUARDED_GIT_OPTIONS, '--literal-pathspecs', '-C', worktree, 'status', '--porcelain'].join(' '),
      ])
      expect(withTheTools.dirty).toBe(false)
      expect(withTheTools.couldNotRead).toEqual([])
    } finally {
      process.env['PATH'] = was
    }
  })
})
