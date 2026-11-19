// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE STARTS GIT IN ONE PLACE, AND ONLY FOR THE READS IT NAMES.
 *
 * `readGit` in src/server/lib/resources.ts is the one reader: always `git --literal-pathspecs -C <dir>`, and the first
 * argument one of `GIT_READS`. The Runtime page's dirty read (criterion G2) and the reads of the seal, the check before
 * it, the merge queue and the inspection all go through it (round 64, item 3, the decision that replaces
 * ilJfWT5ko2se). A command that is not on the list is refused with a sentence naming it, before any process starts.
 *
 * The refused command here is `git config`, which would WRITE to the scratch repository. So the proof that nothing
 * started is the repository itself: the setting is not there afterwards.
 *
 * Mutation proof (round 64): with the list check removed from `readGit`, the refusal case goes red, because git runs
 * and writes the setting.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

let scratch = ''
let t: Awaited<ReturnType<typeof freshDb>>
// resources.ts reaches the database module, so it is imported after the test database is named.
let GIT_READS: readonly string[]
let readGit: typeof import('../src/server/lib/resources.ts').readGit

/** This file's own git, to set up and look at the scratch repository. */
function git(args: string[]): string {
  return execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

beforeAll(async () => {
  t = await freshDb()
  ;({ GIT_READS, readGit } = await import('../src/server/lib/resources.ts'))
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-one-git-reader-'))
  git(['init', '-q', '--initial-branch=trunk'])
})

afterAll(() => {
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the office runs only the git reads it names', () => {
  it('runs a listed read in the directory it was named', () => {
    expect(GIT_READS).toContain('rev-parse')
    expect(readGit(scratch, ['rev-parse', '--git-dir']).toString('utf8').trim()).toBe('.git')
  })

  it('refuses a command that is not on the list, names it, and starts no git', () => {
    expect(GIT_READS).not.toContain('config')
    expect(() => readGit(scratch, ['config', '--local', 'mole.written', 'yes'])).toThrow(
      /git "config" was not started, because the office's git reader runs only cat-file, .*status, symbolic-ref\./,
    )
    // git config --get exits 1 when the setting is not there.
    expect(() => git(['config', '--local', '--get', 'mole.written']), 'git ran and wrote the setting').toThrow()
  })

  it('refuses a call with no command at all', () => {
    expect(() => readGit(scratch, [])).toThrow(/git with no command was not started/)
  })
})
