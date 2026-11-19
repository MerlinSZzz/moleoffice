// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE INSPECTOR'S SANDBOX KEEPS UP WITH MAIN, AND IS STOPPED IN THE PROJECT THAT STARTED IT.
 *
 * Acceptance finding 50 (report EnJvvsDTF_Dx, block f-50): every command a check runs goes through
 * tools/sandbox-start.mjs inside the container, from the sandbox's own clone, which `up` made once and nothing
 * moved. When a launcher switch landed on main, the clone's helper did not know it, and every check died at its
 * build step for 22 minutes on 23 September 2026. bringTheCloneUpToMain moves a clean clone that main descends
 * from, and stops the check with a sentence otherwise.
 *
 * Acceptance finding 51 (block f-51): the sandbox is shared by checks from every project, and a robotics check
 * that was the last to leave asked the robotics ledger for a row panelx held, so the container was left running.
 * theRowToStop answers the project and the session the instance recorded.
 *
 * MUTATION PROOF, 23 September 2026, each alone: the fast-forward left out, and the behind case goes red; the
 * check for changes of its own left out, and the dirty case goes red on git's own words; the check that main
 * descends from the clone left out, and the other-history case goes red on git's own words; theRowToStop
 * answering the leaving check's own project and session, and its first case goes red.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bringTheCloneUpToMain, theRowToStop } from '../tools/inspector-sandbox.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'the-inspectors-sandbox-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...withoutInheritedEffort(), GIT_AUTHOR_NAME: 'a test', GIT_AUTHOR_EMAIL: 'a-test@example.invalid', GIT_COMMITTER_NAME: 'a test', GIT_COMMITTER_EMAIL: 'a-test@example.invalid' },
  }).trim()

/** A checkout with main at a first commit, and a clone of it made then: the sandbox's clone, as `up` makes it. */
function aCheckoutAndItsClone(name: string): { checkout: string; clone: string } {
  const checkout = join(scratch, `${name}-checkout`)
  execFileSync('git', ['init', '-q', '-b', 'main', checkout])
  writeFileSync(join(checkout, 'launcher.mjs'), 'the launcher as it was\n')
  git(checkout, 'add', '-A')
  git(checkout, 'commit', '-qm', 'the launcher as it was')
  const clone = join(scratch, `${name}-clone`)
  execFileSync('git', ['clone', '-q', checkout, clone])
  return { checkout, clone }
}

/**
 * The move the sandbox's container makes. A test's clone has no container, so the stand-in runs git here,
 * on a repository the test made.
 */
const movedHere = (clone: string) => (commit: string): void => {
  git(clone, 'merge', '-q', '--ff-only', commit)
}

/** Main moves on: the launcher learns a switch. */
function mainMovesOn(checkout: string): string {
  writeFileSync(join(checkout, 'launcher.mjs'), 'the launcher with its new switch\n')
  git(checkout, 'commit', '-qam', 'the launcher learns a switch')
  return git(checkout, 'rev-parse', 'main')
}

describe("the sandbox's own clone", () => {
  it('is left alone when it is already at main', () => {
    const { checkout, clone } = aCheckoutAndItsClone('at-main')
    expect(bringTheCloneUpToMain(clone, checkout, movedHere(clone))).toBeNull()
  })

  it('is moved forward to main when it is clean and main descends from it', () => {
    const { checkout, clone } = aCheckoutAndItsClone('behind')
    const main = mainMovesOn(checkout)
    const said = bringTheCloneUpToMain(clone, checkout, movedHere(clone))
    expect(said).toContain(`is now at main ${main.slice(0, 12)}`)
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(main)
  })

  it('is not moved when it has changes of its own, and the check stops saying so', () => {
    const { checkout, clone } = aCheckoutAndItsClone('dirty')
    mainMovesOn(checkout)
    const before = git(clone, 'rev-parse', 'HEAD')
    writeFileSync(join(clone, 'launcher.mjs'), 'somebody changed it by hand\n')
    expect(() => bringTheCloneUpToMain(clone, checkout, movedHere(clone))).toThrow('has changes of its own')
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(before)
  })

  it('is not moved when main does not descend from it, and the check stops saying so', () => {
    const { checkout, clone } = aCheckoutAndItsClone('other-history')
    mainMovesOn(checkout)
    writeFileSync(join(clone, 'elsewhere.txt'), 'history main never had\n')
    git(clone, 'add', '-A')
    git(clone, 'commit', '-qm', 'history main never had')
    const before = git(clone, 'rev-parse', 'HEAD')
    expect(() => bringTheCloneUpToMain(clone, checkout, movedHere(clone))).toThrow('does not descend from')
    expect(git(clone, 'rev-parse', 'HEAD')).toBe(before)
  })
})

describe('the row a shared sandbox is stopped by', () => {
  it('is in the project and under the session of the check that started it, not of the one leaving', () => {
    const started = { workspace: 'panelx', startedBy: { agent: 'inspector', session: 'the-first-check' } }
    expect(theRowToStop(started, { workspace: 'robotics', check: 'the-last-check' })).toEqual({ workspace: 'panelx', session: 'the-first-check' })
  })

  it("is the leaving check's own only when the instance records none", () => {
    expect(theRowToStop(null, { workspace: 'robotics', check: 'the-last-check' })).toEqual({ workspace: 'robotics', session: 'the-last-check' })
  })
})
