// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKTREE READS THE MAIN CHECKOUT'S `.env`, AND SAYS SO LOUDLY WHEN THERE IS NONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `.env` is gitignored, so no git worktree has one — and the office tells every agent to work in a
 * worktree. The declaration therefore always named `resolve(REPO_ROOT, '.env')`, a file that never
 * exists there, so every setting fell to its built-in default. `MOLE_OFFICE_PORT`'s default is
 * 8787 and the live checkout's `.env` names another port, so `tools/close-worlds-nobody-serves.mjs` answered "The office
 * could not be read at http://127.0.0.1:8787" from a worktree.
 *
 * The mend reads the `.env` of the main checkout the worktree was made from, found through
 * `git rev-parse --path-format=absolute --git-common-dir`. `--path-format=absolute` is not
 * decoration: an ordinary checkout prints a RELATIVE `.git` without it, and resolving that against
 * the working directory gives the wrong file. That is the trap the second case below is for.
 *
 * ---------------------------------------------------------------------------------------
 * THREE CONDITIONS ON THIS CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE WARNING GOES TO STDERR, NEVER STDOUT. `tools/session-hook.mjs` prints the `MOLE OFFICE —`
 *    report on stdout and three tests pin its shape, so a warning on stdout would land inside the
 *    one line every arriving agent reads to learn where it is. The warning case below spies on both
 *    streams.
 * 2. IT NAMES EVERY `.env` IT CHECKED, so a reader can tell "nothing is there" from "nobody has
 *    looked". The same case asserts each checked path is in the message.
 * 3. IT FIRES ONCE PER PROCESS. A tool is a process, so once per process is exactly once per tool;
 *    the live server reads settings on every request and must not repeat it forever.
 *
 * AND IT MUST NOT FIRE ON THE HOOK'S ORDINARY PATH. The checkout the hook is registered against has
 * a `.env`, so `findEnvFile` returns before the git call. The `git` probe below records every
 * invocation and asserts none happened for a checkout that has one, because otherwise this change
 * would add a synchronous subprocess to every session start.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  apiAddressFrom,
  findEnvFile,
  forgetTheDefaultApiAddressWarning,
} from '../src/config/settings.mjs'
import { SETTINGS_MODULE, whatACopyOfSettingsCarries } from './what-a-copy-of-settings-carries.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const DECLARATION = join(REPO, 'src', 'config', 'settings.mjs')

/** Run one git command in `cwd`, quietly, and hand back what it printed. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/** Directories made by this file, removed however the case ends. */
const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway git repository with one commit and NO `.env` of its own. */
function aRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-resolver-main-'))
  made.push(root)
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'resolver-test@example.invalid')
  git(root, 'config', 'user.name', 'Resolver Test')
  writeFileSync(join(root, 'README'), 'a repository whose .env is not committed\n')
  git(root, 'add', 'README')
  git(root, 'commit', '-qm', 'first')
  return root
}

/**
 * A throwaway repository with a `.env` in its main checkout and a worktree that has none.
 *
 * The `.env` is written AFTER the commit, so it is untracked and the worktree checks out a tree
 * that does not hold it — which is the real shape: `.env` is gitignored and never reaches a
 * worktree.
 */
function aRepositoryWithAWorktree(): { root: string; worktree: string } {
  const root = aRepository()
  writeFileSync(join(root, '.env'), 'MOLE_OFFICE_PORT=39017\n')
  const worktree = join(root, '..', `${basename(root)}-worktree`)
  made.push(worktree)
  git(root, 'worktree', 'add', '-q', worktree, '-b', 'a-branch')
  return { root, worktree }
}

describe('the resolver reads the main checkout .env when this checkout has none', () => {
  it('follows a worktree to the main checkout and says it checked both paths', () => {
    const { root, worktree } = aRepositoryWithAWorktree()
    const found = findEnvFile(worktree)
    expect(found.found, 'the main checkout .env was not found through the worktree').toBe(true)
    expect(found.path).toBe(join(root, '.env'))
    expect(found.checked).toEqual([join(worktree, '.env'), join(root, '.env')])
  })

  it('never resolves a checkout through the working directory: `--path-format=absolute`', () => {
    // WITHOUT `--path-format=absolute` an ordinary checkout prints the RELATIVE string `.git`, and
    // resolving that against the working directory finds a file that is not the checkout's at all.
    // Here the checkout has NO `.env` and the working directory HAS one, so the missing flag
    // answers "found, at the working directory's file" for a checkout that has none. The child is
    // given that working directory, so the case is caught wherever this suite is run.
    const root = aRepository()
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-resolver-elsewhere-'))
    made.push(elsewhere)
    writeFileSync(join(elsewhere, '.env'), 'MOLE_OFFICE_PORT=9\n')
    const script =
      `import(${JSON.stringify(DECLARATION)}).then((m) => ` +
      `process.stdout.write(JSON.stringify(m.findEnvFile(${JSON.stringify(root)}))))`
    const said = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: elsewhere,
      encoding: 'utf8',
    })
    const found = JSON.parse(said.trim()) as { found: boolean; path: string; checked: string[] }
    expect(found.found, 'a checkout with no .env took the working directory\'s').toBe(false)
    expect(found.path).toBe(join(root, '.env'))
    // An ordinary checkout's common dir IS its own .git, so it is one place checked and not two.
    expect(found.checked).toEqual([join(root, '.env')])
  })

  it('falls back to its own absent .env in a directory that is not a git repository', () => {
    // The git command exits 128 there. The fallback is exactly today's behaviour: this checkout's
    // own file, which every caller already reads as "nobody set this".
    const plain = mkdtempSync(join(tmpdir(), 'mole-resolver-plain-'))
    made.push(plain)
    const found = findEnvFile(plain)
    expect(found.found).toBe(false)
    expect(found.path).toBe(join(plain, '.env'))
    expect(found.checked).toEqual([join(plain, '.env')])
  })
})

describe('the warning says which .env files were checked, on stderr, once', () => {
  it('writes to stderr and names every path, never to stdout, and only once per process', () => {
    const checked = findEnvFile().checked
    forgetTheDefaultApiAddressWarning()
    const onErr: string[] = []
    const onOut: string[] = []
    const realErr = process.stderr.write
    const realOut = process.stdout.write
    // A DIRECT OVERRIDE, not `vi.spyOn`: the warning is written by `process.stderr.write` at the
    // moment it is called, and swapping the property is the thing that certainly reaches it.
    process.stderr.write = ((chunk: unknown) => {
      onErr.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      onOut.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      apiAddressFrom({})
      apiAddressFrom({})
    } finally {
      process.stderr.write = realErr
      process.stdout.write = realOut
      forgetTheDefaultApiAddressWarning()
    }
    const said = onErr.join('')
    // NOT ON STDOUT. The session hook's shape is pinned there and a warning would corrupt it.
    expect(onOut.join('')).toBe('')
    // ONCE PER PROCESS, though the reader was asked twice.
    expect(onErr.length).toBe(1)
    // IT NAMES BOTH PLACES IT LOOKED, so "nothing is there" and "nobody has looked" differ.
    for (const path of checked) expect(said).toContain(path)
    expect(said).toContain('8787')
    expect(said).toContain('once per process')
  })

  it('says nothing when MOLE_OFFICE_API or MOLE_OFFICE_PORT was set', () => {
    forgetTheDefaultApiAddressWarning()
    const onErr: string[] = []
    const realErr = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      onErr.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    try {
      expect(apiAddressFrom({ MOLE_OFFICE_API: 'http://127.0.0.1:9' })).toBe('http://127.0.0.1:9')
      expect(apiAddressFrom({ MOLE_OFFICE_PORT: '9' })).toBe('http://127.0.0.1:9')
    } finally {
      process.stderr.write = realErr
      forgetTheDefaultApiAddressWarning()
    }
    expect(onErr).toEqual([])
  })
})

describe('a checkout that has a .env never runs the git lookup', () => {
  it('reads its own .env without a git subprocess, which the session hook cannot afford', () => {
    // A fake `git` first on PATH records every call. A checkout WITH a .env must not call it: the
    // hook is spawned before nvm is sourced and a synchronous subprocess on every session start
    // would be a new cost this change may not add.
    const bin = mkdtempSync(join(tmpdir(), 'mole-resolver-bin-'))
    made.push(bin)
    const log = join(bin, 'calls.log')
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\nexec /usr/bin/git "$@"\n`,
    )
    execFileSync('chmod', ['+x', join(bin, 'git')])
    const checkout = mkdtempSync(join(tmpdir(), 'mole-resolver-checkout-'))
    made.push(checkout)
    // settings.mjs with what it imports, read from its imports so a module it starts to import is copied too.
    for (const file of whatACopyOfSettingsCarries(REPO)) {
      mkdirSync(join(checkout, file, '..'), { recursive: true })
      writeFileSync(join(checkout, file), execFileSync('cat', [join(REPO, file)]))
    }
    const module = join(checkout, SETTINGS_MODULE)
    writeFileSync(join(checkout, '.env'), 'MOLE_OFFICE_PORT=39017\n')
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` }
    // The child must read the `.env` this case wrote, not a port this suite happens to export.
    delete childEnv['MOLE_OFFICE_PORT']
    delete childEnv['MOLE_OFFICE_API']
    const said = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        // `process.stdout.write`, not `console.log`: this environment forces colour and `console.log`
        // paints a number, which would make the assertion about the value fail for the wrong reason.
        `import(${JSON.stringify(module)}).then((m) => process.stdout.write(String(m.settings().apiPort)))`,
      ],
      { encoding: 'utf8', env: childEnv },
    )
    expect(said.trim()).toBe('39017')
    expect(existsSync(log), `a checkout with a .env ran git: ${existsSync(log) ? execFileSync('cat', [log], { encoding: 'utf8' }) : ''}`).toBe(false)
  })
})
