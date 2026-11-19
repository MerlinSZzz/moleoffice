// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD STARTED FROM A GIT WORKTREE KEEPS ITS DATA OUTSIDE THE CHECKOUT. Problem 54K4oDbsvsZT.
 *
 * Since cf998d4 an office refuses a database or a key file inside a git worktree (problem nd7jOk5LCU4s), reading the
 * folder through links. tools/isolated-mole-office.mjs copies a world's database to <checkout>/.logs/isolated/<name>/
 * and migrates it there, so from a worktree every start was refused, and six tests that start a world failed in every
 * worktree. Now, in a linked worktree, `start` makes .logs/isolated a link to a folder of its own beside the checkout,
 * `<its parent>/.<its name>.worlds` (theWorldsFolderIn), so every reader of that path reads it as before, the office no
 * longer refuses what is written there, and the host and a sandbox's container, which see a sandbox's folder at the
 * same path, see the same folder.
 *
 * WHAT IS PROVED, in a real main clone and a real worktree git makes in a temporary folder:
 *   1. In the worktree .logs/isolated becomes a link to the folder beside it, mode 700, and the office's own refusal
 *      (refuseADataFolderInAWorktree) passes a world's copy.db under it, as it refuses the same file in a plain folder.
 *   2. Asked again, the same link is kept; a link whose folder is gone gets its folder again, at the same path; a link
 *      to anywhere else is replaced.
 *   3. A real folder that already holds worlds is left as it is, and the sentence names it; an empty one is replaced.
 *   4. In a main clone, and in a folder that is no checkout, nothing changes: no link is made.
 *
 * MUTATIONS, each proved red in the run that adds this file: no link is ever made (1, 2); a link whose folder is gone
 * is kept without it (2); a link to anywhere else is kept (2); a real folder that holds worlds is replaced anyway (3);
 * every checkout is taken for a worktree (4).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { refuseADataFolderInAWorktree } from '../src/server/lib/git-checkout.ts'
import { theWorldsFolderIn } from '../tools/isolated-mole-office.mjs'

let folder = ''
let main = ''
let worktree = ''

/** git, quietly, with an identity of its own so no person's is read or written. */
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=a-test', '-c', 'user.email=a-test@example.invalid', ...args], { cwd, stdio: 'ignore' })
}

beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-worlds-worktree-')))
  main = join(folder, 'main')
  worktree = join(folder, 'a-worktree')
  mkdirSync(main)
  git(main, 'init', '-q')
  writeFileSync(join(main, 'README'), 'a checkout\n')
  git(main, 'add', 'README')
  git(main, 'commit', '-q', '-m', 'a first commit')
  git(main, 'worktree', 'add', '-q', worktree)
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** The folder beside the worktree that its worlds go to. */
const beside = (): string => join(folder, '.a-worktree.worlds')

describe('a world started from a git worktree keeps its data outside the checkout', () => {
  it("links .logs/isolated out of the worktree, so the office's refusal passes a world's copy there", () => {
    const plain = join(worktree, '.logs', 'a-plain-folder', 'a-world', 'copy.db')
    expect(() => refuseADataFolderInAWorktree(plain)).toThrow(/^REFUSING TO WRITE /)

    const worlds = theWorldsFolderIn(worktree)
    expect(worlds).toEqual({ folder: join(worktree, '.logs', 'isolated'), said: null })
    expect(lstatSync(worlds.folder).isSymbolicLink()).toBe(true)
    const outside = realpathSync(worlds.folder)
    expect(outside).toBe(beside())
    expect(lstatSync(outside).mode & 0o777).toBe(0o700)
    mkdirSync(join(worlds.folder, 'a-world'))
    expect(() => refuseADataFolderInAWorktree(join(worlds.folder, 'a-world', 'copy.db'))).not.toThrow()
    expect(existsSync(join(outside, 'a-world'))).toBe(true)
  })

  it('keeps the same link when asked again, gives a link whose folder is gone its folder again, and replaces a link to elsewhere', () => {
    const first = theWorldsFolderIn(worktree)
    theWorldsFolderIn(worktree)
    expect(readlinkSync(first.folder)).toBe(beside())

    rmSync(beside(), { recursive: true, force: true })
    expect(theWorldsFolderIn(worktree).said).toBeNull()
    expect(readlinkSync(first.folder)).toBe(beside())
    expect(existsSync(beside())).toBe(true)

    const elsewhere = join(folder, 'a-temporary-folder')
    mkdirSync(elsewhere)
    rmSync(first.folder)
    symlinkSync(elsewhere, first.folder, 'dir')
    expect(theWorldsFolderIn(worktree).said).toBeNull()
    expect(readlinkSync(first.folder)).toBe(beside())
  })

  it('leaves a real folder that already holds worlds, and says so; replaces an empty one', () => {
    const isolated = join(worktree, '.logs', 'isolated')
    mkdirSync(join(isolated, 'an-old-world'), { recursive: true })
    const held = theWorldsFolderIn(worktree)
    expect(lstatSync(isolated).isSymbolicLink()).toBe(false)
    expect(existsSync(join(isolated, 'an-old-world'))).toBe(true)
    expect(held.said).toContain(`${isolated} is a folder inside the git worktree ${worktree}`)
    expect(held.said).toContain('Stop those worlds and remove the folder')

    rmSync(join(isolated, 'an-old-world'), { recursive: true })
    expect(theWorldsFolderIn(worktree).said).toBeNull()
    expect(lstatSync(isolated).isSymbolicLink()).toBe(true)
  })

  it('changes nothing in a main clone, or in a folder that is no checkout', () => {
    expect(theWorldsFolderIn(main)).toEqual({ folder: join(main, '.logs', 'isolated'), said: null })
    expect(existsSync(join(main, '.logs'))).toBe(false)
    const nothing = join(folder, 'no-checkout')
    mkdirSync(nothing)
    expect(theWorldsFolderIn(nothing)).toEqual({ folder: join(nothing, '.logs', 'isolated'), said: null })
    expect(existsSync(join(nothing, '.logs'))).toBe(false)
  })
})
