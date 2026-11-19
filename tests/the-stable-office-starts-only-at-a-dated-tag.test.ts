// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE OFFICE STARTS ONLY AT A DATED TAG OF ITS OWN CLONE.
 *
 * Condition 3, as reworded (oBVSWaD1dd6h): the stable checkout is its own clone, on branch
 * stable at the dated tag of its last upgrade; only the upgrade moves it; the office refuses to start
 * from it at anything else. Also (fPbGHEXq5OfR): the start refuses anything but a dated tag, with a
 * test. The server's start will call `whyThisCheckoutIsNotAtADatedStableTag` once the setting that
 * names the development checkout lands; this file proves the reader alone, on throwaway repositories.
 *
 * EVERY REPOSITORY IS MADE UNDER $TMPDIR BY GIT, with GIT_CONFIG_GLOBAL=/dev/null and
 * GIT_CONFIG_NOSYSTEM=1, so the machine's own configuration reaches none of them. The clones are made
 * with `git clone --no-local`, so `.git` is a folder and the checkout is its own clone; the linked
 * worktree case makes one with `git worktree add`, whose `.git` is a file.
 *
 * MUTATIONS, each planted alone with the module in place and this whole file run:
 *   - accept a detached HEAD (treat a 40-character HEAD as branch stable): the detached case goes red;
 *   - skip the `^` peel (compare the packed tag's tag object id): the packed annotated case goes red;
 *   - accept a `.git` file (drop the folder check): the linked worktree case goes red;
 *   - accept any tag name (drop DATED_STABLE_TAG): the `stable-tomorrow` case goes red.
 */

import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  THE_STABLE_TAG_REFUSAL_BEGINS,
  whyThisCheckoutIsNotAtADatedStableTag } from '../src/config/stable-tag.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const GIT_ENVIRONMENT = {
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: '/nowhere-called-home',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
}

/** One git command in one throwaway repository; a failure is said rather than swallowed. */
function git(cwd: string, args: string[]): string {
  const ran = spawnSync('git', args, { cwd, env: GIT_ENVIRONMENT, encoding: 'utf8' })
  if (ran.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${ran.stderr.trim()}`)
  return ran.stdout.trim()
}

function placeholders(cwd: string): void {
  git(cwd, ['config', 'user.email', 'placeholder@example.invalid'])
  git(cwd, ['config', 'user.name', 'Placeholder Person'])
}

/** A source repository with one made-up commit, the origin every case clones from. */
function aSourceRepository(what: string): string {
  const root = aTestDatabaseFolder(what)
  git(root, ['init', '-q', '-b', 'main'])
  placeholders(root)
  writeFileSync(join(root, 'a-made-up-file.txt'), 'made up\n')
  git(root, ['add', 'a-made-up-file.txt'])
  git(root, ['commit', '-qm', 'the first made-up commit'])
  return root
}

/** THE STABLE CHECKOUT: its own clone, on branch stable, at the origin's first commit. */
function theStableCheckout(what: string): string {
  const origin = aSourceRepository(`${what}-origin`)
  const parent = aTestDatabaseFolder(`${what}-stable`)
  git(parent, ['clone', '-q', '--no-local', origin, join(parent, 'checkout')])
  const checkout = join(parent, 'checkout')
  placeholders(checkout)
  git(checkout, ['checkout', '-q', '-b', 'stable'])
  return checkout
}

/** The one sentence a refusal must be, naming what was found. */
function theRefusalAt(root: string): string {
  const said = whyThisCheckoutIsNotAtADatedStableTag(root)
  expect(said, 'this checkout should have been refused').not.toBeNull()
  expect(said!.startsWith(THE_STABLE_TAG_REFUSAL_BEGINS)).toBe(true)
  expect(said!.startsWith(`${THE_STABLE_TAG_REFUSAL_BEGINS} and `)).toBe(true)
  return said!
}

describe('a checkout at a dated tag of its own clone is accepted', () => {
  it('accepts a loose lightweight dated tag at HEAD', () => {
    const checkout = theStableCheckout('loose')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    expect(whyThisCheckoutIsNotAtADatedStableTag(checkout)).toBeNull()
  }, 20_000)

  it('accepts a packed lightweight dated tag at HEAD', () => {
    const checkout = theStableCheckout('packed')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    git(checkout, ['pack-refs', '--all'])
    expect(whyThisCheckoutIsNotAtADatedStableTag(checkout)).toBeNull()
  }, 20_000)

  it('accepts a packed annotated dated tag, compared by the commit its ^ line peels', () => {
    const checkout = theStableCheckout('packed-annotated')
    git(checkout, ['tag', '-a', 'stable-2026-10-19-annotated', '-m', 'a made-up tag message'])
    git(checkout, ['pack-refs', '--all'])
    expect(whyThisCheckoutIsNotAtADatedStableTag(checkout)).toBeNull()
  }, 20_000)

  it('accepts a dated tag at HEAD while a nested folder holds other tags', () => {
    const checkout = theStableCheckout('nested-others')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    git(checkout, ['tag', 'release/made-up'])
    expect(whyThisCheckoutIsNotAtADatedStableTag(checkout)).toBeNull()
  }, 20_000)
})

describe('a checkout that is not the stable checkout at a dated tag is refused', () => {
  it('refuses a detached HEAD, naming the commit it is at', () => {
    const checkout = theStableCheckout('detached')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    git(checkout, ['checkout', '-q', '--detach'])
    const head = git(checkout, ['rev-parse', 'HEAD'])
    const said = theRefusalAt(checkout)
    expect(said).toContain(head)
    expect(said).toContain('detached HEAD')
  }, 20_000)

  it('refuses another branch, naming it', () => {
    const checkout = theStableCheckout('main')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    git(checkout, ['checkout', '-q', 'main'])
    const said = theRefusalAt(checkout)
    expect(said).toContain('refs/heads/main')
    expect(said).toContain('not refs/heads/stable')
  }, 20_000)

  it('refuses HEAD one commit past the dated tag, naming both commits', () => {
    const checkout = theStableCheckout('past')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    const tagged = git(checkout, ['rev-parse', 'HEAD'])
    writeFileSync(join(checkout, 'a-later-file.txt'), 'made up\n')
    git(checkout, ['add', 'a-later-file.txt'])
    git(checkout, ['commit', '-qm', 'a later made-up commit'])
    const head = git(checkout, ['rev-parse', 'HEAD'])
    const said = theRefusalAt(checkout)
    expect(said).toContain('stable-2026-10-19-one')
    expect(said).toContain(tagged)
    expect(said).toContain(head)
    expect(said).toContain(`HEAD is refs/heads/stable at ${head}`)
  }, 20_000)

  it('refuses tags at HEAD that are not dated stable tags, naming them', () => {
    const checkout = theStableCheckout('not-dated')
    git(checkout, ['tag', 'stable-tomorrow'])
    git(checkout, ['tag', 'v1.0'])
    const said = theRefusalAt(checkout)
    expect(said).toContain('stable-tomorrow')
    expect(said).toContain('v1.0')
    expect(said).toContain('no tag whose name is a dated stable tag')
    expect(said).toContain(`HEAD is refs/heads/stable at ${git(checkout, ['rev-parse', 'HEAD'])}`)
  }, 20_000)

  it('refuses a nested tag whose whole name is not a dated stable tag, naming the whole name', () => {
    const checkout = theStableCheckout('nested-only')
    git(checkout, ['tag', 'a/stable-2026-10-19-x'])
    const said = theRefusalAt(checkout)
    expect(said).toContain('a/stable-2026-10-19-x')
    expect(said).toContain('no tag whose name is a dated stable tag')
  }, 20_000)

  it('refuses a loose annotated dated tag, saying only lightweight or packed-peeled tags are read', () => {
    const checkout = theStableCheckout('loose-annotated')
    git(checkout, ['tag', '-a', 'stable-2026-10-19-annotated', '-m', 'a made-up tag message'])
    const said = theRefusalAt(checkout)
    expect(said).toContain('stable-2026-10-19-annotated')
    expect(said).toContain('a loose annotated tag points at a tag object')
    expect(said).toContain('only lightweight tags and packed tags with a peeled commit are read')
  }, 20_000)

  it('refuses a linked worktree, whose .git is a file', () => {
    const checkout = theStableCheckout('worktree-origin')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    const linked = join(aTestDatabaseFolder('worktree-linked'), 'linked')
    git(checkout, ['worktree', 'add', '-q', '--detach', linked])
    const said = theRefusalAt(linked)
    expect(said).toContain(join(linked, '.git'))
    expect(said).toContain('is a file, not a folder')
    expect(said).toContain('linked worktree')
    expect(said).toContain('must be its own clone')
  }, 20_000)

  it('refuses a folder with no .git at all', () => {
    const empty = aTestDatabaseFolder('no-git')
    const said = theRefusalAt(empty)
    expect(said).toContain(join(empty, '.git'))
    expect(said).toContain('there is no .git')
  }, 20_000)

  // SKIPPED WHEN THIS RUNS AS ROOT: root reads a file whose mode is 000, so the unreadable case cannot be made.
  it.skipIf(process.getuid?.() === 0)('refuses when packed-refs cannot be read, naming the file and the error', () => {
    const checkout = theStableCheckout('unreadable-packed')
    git(checkout, ['tag', 'stable-2026-10-19-one'])
    git(checkout, ['pack-refs', '--all'])
    chmodSync(join(checkout, '.git', 'packed-refs'), 0o000)
    const said = theRefusalAt(checkout)
    expect(said).toContain(join(checkout, '.git', 'packed-refs'))
    expect(said).toContain('could not be read')
    expect(said).toContain('EACCES')
  }, 20_000)

  it('says a different sentence for every kind of refusal', () => {
    const sentences = [
      (() => { const c = theStableCheckout('distinct-detached'); git(c, ['checkout', '-q', '--detach']); return theRefusalAt(c) })(),
      (() => { const c = theStableCheckout('distinct-main'); git(c, ['checkout', '-q', 'main']); return theRefusalAt(c) })(),
      (() => { const c = theStableCheckout('distinct-nondated'); git(c, ['tag', 'v1.0']); return theRefusalAt(c) })(),
      (() => { const c = theStableCheckout('distinct-annotated'); git(c, ['tag', '-a', 'stable-2026-10-19-a', '-m', 'made up']); return theRefusalAt(c) })(),
      (() => { const c = aTestDatabaseFolder('distinct-nogit'); return theRefusalAt(c) })(),
    ]
    expect(new Set(sentences).size).toBe(sentences.length)
  }, 90_000)
})

