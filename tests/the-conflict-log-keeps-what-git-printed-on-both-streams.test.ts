// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONFLICT LOG KEEPS WHAT GIT PRINTED ON BOTH STREAMS, by Q5 of tier 1 of a wave 13p
 * decision. When the queue's rebase stops, git prints the line that names the conflict,
 * "CONFLICT (content): Merge conflict in <path>", on stdout, and "error: could not apply <commit>" on stderr.
 * tools/merge-tool/rebase-with-joins.mjs kept `stderr || stdout`, so the conflict log and the step's `said` held the
 * second and never the first.
 *
 * The git tree is real and temporary; the tool's arguments and its log are stubs.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the fix records the runs):
 *   - `output` is `stderr || stdout` again: both cases go red.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ logs: [] as string[] }))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  WORKDIR: '/nonexistent-synthetic-workdir',
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: { GIT_AUTHOR_NAME: 'Synthetic queue', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic queue', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  chosen: { entry: 'synthetic-entry', pinOnly: false, sandboxes: '/nonexistent-synthetic-sandboxes' },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  return { MergerFailure, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words), stamp: () => '2026-10-16 00:00:00', writeState: () => {} }
})
import { rebaseWithTheJoins, tryTheRebaseEarly } from '../tools/merge-tool/rebase-with-joins.mjs'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

/** A repository where main and an entry changed the one line of notes.txt; the entry is checked out. */
function aConflict() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-conflict-log-'))
  folders.push(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (text: string, message: string) => { writeFileSync(join(root, 'notes.txt'), text); git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid')
  const base = commit('base\n', 'Synthetic base')
  git('checkout', '-qb', 'entry'); const tip = commit('entry\n', 'Synthetic entry changes the note')
  git('checkout', '-q', 'main'); const main = commit('main\n', 'Synthetic main changes the note')
  git('checkout', '-q', 'entry')
  return { root, base, tip, main }
}

it('keeps the conflict line from stdout and the error from stderr in what the rebase returns', () => {
  const { root, base, tip, main } = aConflict()
  const rebased = rebaseWithTheJoins(root, { main, upstream: base, commit: tip })
  expect(rebased.ok).toBe(false)
  expect(rebased.output, 'the line git prints on stdout').toContain('CONFLICT (content): Merge conflict in notes.txt')
  expect(rebased.output, 'the line git prints on stderr').toContain('could not apply')
})

it('keeps both in the conflict log the early trial writes', () => {
  const { root, tip, main } = aConflict()
  const folder = mkdtempSync(join(tmpdir(), 'synthetic-conflict-log-trial-'))
  folders.push(folder)
  const tried = tryTheRebaseEarly(root, main, tip, folder)
  expect(tried, boundary.logs.join('\n')).toMatchObject({ resolved: false, files: ['notes.txt'] })
  const written = readFileSync(join(folder, 'conflict.log'), 'utf8')
  expect(written).toContain('CONFLICT (content): Merge conflict in notes.txt')
  expect(written).toContain('could not apply')
})
