// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE INSPECTOR'S TWO FETCHES BY PATH CHECK THE ADDRESS GIT WOULD FETCH.
 *
 * bringTheCloneUpToMain fetches the checkout's main into the sandbox's own clone, and
 * fetchIntoTheSandbox fetches commits into that clone and into the check's independent work clone.
 * A clone's config is a sandbox's to write, and git applies a url.<base>.insteadOf rewrite to an
 * address given by a folder's path too, so such a config can make either fetch take commits from
 * another folder. Each fetch asks what address git in that repository would fetch the folder from
 * first, and fetches nothing when the answer is not the folder itself.
 *
 * MUTATION PROOF: the address check left out of both fetches, and the two rewritten cases go red,
 * each fetching from the other folder.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { bringTheCloneUpToMain, fetchIntoTheSandbox } from '../tools/inspector-sandbox.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'the-inspectors-fetches-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const env = {
  ...withoutInheritedEffort(),
  GIT_AUTHOR_NAME: 'a test',
  GIT_AUTHOR_EMAIL: 'a-test@example.invalid',
  GIT_COMMITTER_NAME: 'a test',
  GIT_COMMITTER_EMAIL: 'a-test@example.invalid',
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim()

/** A checkout whose main is at a commit of its own. */
function aCheckout(name: string): string {
  const checkout = join(scratch, `${name}-checkout`)
  execFileSync('git', ['init', '-q', '-b', 'main', checkout], { env })
  writeFileSync(join(checkout, 'launcher.mjs'), 'the launcher as it was\n')
  git(checkout, 'add', '-A')
  git(checkout, 'commit', '-qm', 'the launcher as it was')
  return checkout
}

/** A clone of the checkout, as `up` makes the sandbox's own clone. */
function aCloneOf(checkout: string, name: string): string {
  const clone = join(scratch, `${name}-clone`)
  execFileSync('git', ['clone', '-q', checkout, clone], { env })
  return clone
}

/** Main moves on: the launcher learns a switch. */
function mainMovesOn(checkout: string): string {
  writeFileSync(join(checkout, 'launcher.mjs'), 'the launcher with its new switch\n')
  git(checkout, 'commit', '-qam', 'the launcher learns a switch')
  return git(checkout, 'rev-parse', 'main')
}

/** A clone of the checkout with one commit of its own: a folder a rewritten address points at. */
function elsewhere(name: string, checkout: string): { folder: string; theirs: string } {
  const folder = join(scratch, `${name}-elsewhere`)
  execFileSync('git', ['clone', '-q', checkout, folder], { env })
  writeFileSync(join(folder, 'elsewhere.txt'), 'a commit only the other folder has\n')
  git(folder, 'add', '-A')
  git(folder, 'commit', '-qm', 'a commit only the other folder has')
  return { folder, theirs: git(folder, 'rev-parse', 'main') }
}

/** The move the sandbox's container makes. A test's clone has no container, so the stand-in runs git here. */
const movedHere = (clone: string) => (commit: string): void => {
  git(clone, 'merge', '-q', '--ff-only', commit)
}

/** The sandbox fetchIntoTheSandbox needs: its instance folder, its repo, and the check whose work clone is cut there. */
function aCheckSandbox(name: string): { checkout: string; folder: string; repo: string; work: string; sandbox: { folder: string; repo: string; asked: { check: string } } } {
  const checkout = aCheckout(name)
  const folder = join(scratch, `${name}-instance`)
  const repo = join(folder, 'repo')
  const work = join(folder, 'check-views', 'a-check', 'work')
  for (const clone of [repo, work]) {
    mkdirSync(dirname(clone), { recursive: true })
    execFileSync('git', ['clone', '-q', checkout, clone], { env })
  }
  return { checkout, folder, repo, work, sandbox: { folder, repo, asked: { check: 'a-check' } } }
}

describe("the sandbox's own clone brought up to main", () => {
  it('refuses a rewritten address, names it, fetches nothing and never fast-forwards', () => {
    const checkout = aCheckout('clone-rewritten')
    const clone = aCloneOf(checkout, 'clone-rewritten')
    const main = mainMovesOn(checkout)
    const other = elsewhere('clone-rewritten', checkout)
    git(clone, 'config', `url.${other.folder}.insteadOf`, checkout)
    const fastForward = vi.fn(movedHere(clone))
    let said = ''
    try {
      bringTheCloneUpToMain(clone, checkout, fastForward)
    } catch (why) {
      said = why instanceof Error ? why.message : String(why)
    }
    expect(said).toContain(other.folder)
    expect(said).toContain(clone)
    expect(said).toContain(checkout)
    expect(said).toContain('nothing was fetched and nothing was run')
    expect(() => git(clone, 'cat-file', '-e', `${other.theirs}^{commit}`)).toThrow()
    expect(fastForward).not.toHaveBeenCalled()
    expect(git(clone, 'rev-parse', 'HEAD')).not.toBe(main)
  })
})

describe('the commits brought into the sandbox', () => {
  it('refuses a rewritten address in the work clone, names it, and fetches into neither repository', () => {
    const { checkout, repo, work, sandbox } = aCheckSandbox('fetch-rewritten')
    const main = mainMovesOn(checkout)
    const other = elsewhere('fetch-rewritten', checkout)
    git(work, 'config', `url.${other.folder}.insteadOf`, checkout)
    let said = ''
    try {
      fetchIntoTheSandbox(sandbox, checkout, [main])
    } catch (why) {
      said = why instanceof Error ? why.message : String(why)
    }
    expect(said).toContain(other.folder)
    expect(said).toContain(work)
    expect(said).toContain('nothing was fetched into any repository')
    for (const one of [repo, work]) expect(() => git(one, 'cat-file', '-e', `${main}^{commit}`)).toThrow()
  })
})

describe('with no rewrite', () => {
  it('bringTheCloneUpToMain fetches and moves the clone to main', () => {
    const checkout = aCheckout('clone-plain')
    const clone = aCloneOf(checkout, 'clone-plain')
    const main = mainMovesOn(checkout)
    const fastForward = vi.fn(movedHere(clone))
    const said = bringTheCloneUpToMain(clone, checkout, fastForward)
    expect(said).toContain('is now at main')
    expect(fastForward).toHaveBeenCalledWith(main)
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(main)
  })

  it('fetchIntoTheSandbox fetches the commits into the repo and the work clone', () => {
    const { checkout, repo, work, sandbox } = aCheckSandbox('fetch-plain')
    const main = mainMovesOn(checkout)
    fetchIntoTheSandbox(sandbox, checkout, [main])
    for (const one of [repo, work]) expect(git(one, 'rev-parse', '--verify', `${main}^{commit}`)).toBe(main)
  })
})
