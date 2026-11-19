// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONFLICT ABOUT A WHOLE FILE IS TOLD BY ITS KIND (wave 13u round 131, item 51 (b); the decision on conflicts,
 * two tiers, as this line reads it). A whole-file conflict is not a cannot by its kind. Where git stops on one,
 * the queue says which kind it is, so the supervisor and the inspector read the same rule:
 *   - the same file renamed differently on each side is resolvable, and main's name stands;
 *   - a file deleted on one side and changed on the other is a cannot, and the words name the file and the side;
 *   - a file renamed on one side and changed on the other is resolvable in the renamed file;
 *   - a file added on both sides is an ordinary conflict of lines in that file.
 *
 * WHAT THIS FILE PROVES, one case per kind, each on a made-up repository:
 * 1. The queue's rebase with its joins (tools/merge-tool/rebase-with-joins.mjs), which the conflict step and the early
 *    trial both run, stops with the paths git left in conflict and says the kind in the words of the stop.
 * 2. The early replay at the pin (tools/merge-tool/early-conflicts.mjs `canItJoin`) says the kind for each path where git
 *    wrote no conflict markers, instead of a guess at what the two sides disagree about.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs):
 *   - the kind's words are left out of the rebase's words: every case of item 1 goes red;
 *   - the early replay keeps its old reason for a path with no markers: the cases of item 2 go red.
 *
 * Every repository here is synthetic and says so: made under the temporary directory, outside every checkout, and
 * removed after. The tool's arguments and its log are stubs. Nothing reaches an office.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  return { MergerFailure, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words), stamp: () => '2026-10-30 00:00:00', writeState: () => {} }
})
import { canItJoin } from '../tools/merge-tool/early-conflicts.mjs'
import { rebaseWithTheJoins } from '../tools/merge-tool/rebase-with-joins.mjs'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

/** The file both sides change, under the ancestor's name, and the names main and the entry give it. */
const ANCESTOR = 'work/numbered-04.txt'
const MAINS = 'work/numbered-09.txt'
const ENTRYS = 'work/numbered-06.txt'
const ADDED = 'work/added.txt'
/** Ten lines, long enough that git finds a file renamed with one of them changed to be the same file. */
const LINES = Array.from({ length: 10 }, (_, n) => `Synthetic line ${String(n + 1)} of the numbered file, as the ancestor has it.`)
const text = (lines: string[]) => `${lines.join('\n')}\n`
/** The ten lines with line `n` (1-based) said otherwise. */
const changed = (n: number, said: string) => text(LINES.map((line, at) => (at === n - 1 ? said : line)))

type Side = (git: (...args: string[]) => string, write: (path: string, words: string) => void) => void

/** A synthetic repository: the ancestor holds ANCESTOR, then main's commit and the entry's commit each do their side. */
function aRepository(mains: Side, entrys: Side) {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-whole-file-'))
  folders.push(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path: string, words: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), words) }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid')
  write(ANCESTOR, text(LINES)); write('work/other.txt', 'kept\n')
  git('add', '-A'); git('commit', '-qm', 'Synthetic ancestor')
  const base = git('rev-parse', 'HEAD')
  git('checkout', '-qb', 'entry'); entrys(git, write); git('add', '-A'); git('commit', '-qm', "Synthetic entry's side")
  const tip = git('rev-parse', 'HEAD')
  git('checkout', '-q', 'main'); mains(git, write); git('add', '-A'); git('commit', '-qm', "Synthetic main's side")
  const main = git('rev-parse', 'HEAD')
  git('checkout', '-q', 'entry')
  return { root, base, tip, main }
}

const probe = (cwd: string, args: string[]) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const renamedTo = (to: string, lines: string): Side => (git, write) => { git('mv', ANCESTOR, to); write(to, lines) }
const deleted: Side = (git) => { git('rm', '-q', ANCESTOR) }
const changedAt = (n: number, said: string): Side => (_git, write) => write(ANCESTOR, changed(n, said))
const added = (words: string): Side => (_git, write) => write(ADDED, words)

/** What the queue's rebase stopped on and said, run as the conflict step runs it. */
function theStop(made: ReturnType<typeof aRepository>) {
  const rebased = rebaseWithTheJoins(made.root, { main: made.main, upstream: made.base, commit: made.tip })
  expect(rebased.ok, boundary.logs.join('\n')).toBe(false)
  return rebased as { ok: false; files: string[]; says: string }
}

/** The early replay's line for `path`, as the pin reads it. */
function theLineAtThePin(made: ReturnType<typeof aRepository>, path: string) {
  const found = canItJoin(made.root, made.main, made.tip, probe) as { joins: boolean; lines: { path: string; ranges?: string; why?: string }[] }
  expect(found.joins).toBe(false)
  return found.lines.find((one) => one.path === path)
}

const RENAMED = `${ANCESTOR} was renamed to ${MAINS} on main and to ${ENTRYS} by the entry. Main's name stands, so the entry's changes go into ${MAINS}, and ${ENTRYS} is not kept.`
const A_CANNOT = 'and keeping both would change what one side meant, so the entry has to be cut again from current main.'

describe('the queue says the kind of a whole-file conflict where its rebase stops', () => {
  it('the same file renamed differently on each side: resolvable, and main keeps its name', () => {
    const made = aRepository(renamedTo(MAINS, changed(1, 'Synthetic line 1, as main has it.')), renamedTo(ENTRYS, changed(10, 'Synthetic line 10, as the entry has it.')))
    const stop = theStop(made)
    expect(stop.files).toEqual([ANCESTOR, MAINS, ENTRYS].sort())
    expect(stop.says).toContain(RENAMED)
    expect(stop.says).not.toContain(A_CANNOT)
  })

  it('deleted on main and changed by the entry: a cannot that names the file and the side', () => {
    const stop = theStop(aRepository(deleted, changedAt(2, 'Synthetic line 2, as the entry has it.')))
    expect(stop.files).toEqual([ANCESTOR])
    expect(stop.says).toContain(`${ANCESTOR} was deleted on main and changed by the entry, ${A_CANNOT}`)
  })

  it('deleted by the entry and changed on main: a cannot that names the file and the side', () => {
    const stop = theStop(aRepository(changedAt(2, 'Synthetic line 2, as main has it.'), deleted))
    expect(stop.files).toEqual([ANCESTOR])
    expect(stop.says).toContain(`${ANCESTOR} was deleted by the entry and changed on main, ${A_CANNOT}`)
  })

  it('renamed by the entry and deleted on main: a cannot, since a rename is a change', () => {
    const stop = theStop(aRepository(deleted, renamedTo(ENTRYS, text(LINES))))
    expect(stop.files).toEqual([ENTRYS])
    expect(stop.says).toContain(`${ANCESTOR} was deleted on main and renamed to ${ENTRYS} by the entry, ${A_CANNOT}`)
  })

  it("renamed on main and changed by the entry: resolvable, in main's renamed file", () => {
    const stop = theStop(aRepository(renamedTo(MAINS, changed(2, 'Synthetic line 2, as main has it.')), changedAt(2, 'Synthetic line 2, as the entry has it.')))
    expect(stop.files).toEqual([MAINS])
    expect(stop.says).toContain(`${MAINS} was renamed on main and changed by the entry, so the entry's change goes into ${MAINS}, where git left its lines in conflict.`)
  })

  it('added on both sides with different contents: an ordinary conflict of lines in that file', () => {
    const stop = theStop(aRepository(added('added on main\n'), added('added by the entry\n')))
    expect(stop.files).toEqual([ADDED])
    expect(stop.says).toContain(`${ADDED} was added on both sides with different contents, so it is a conflict of lines in that one file.`)
  })
})

describe('the early replay at the pin says the kind where git wrote no markers', () => {
  it('the same file renamed differently on each side', () => {
    const made = aRepository(renamedTo(MAINS, changed(1, 'Synthetic line 1, as main has it.')), renamedTo(ENTRYS, changed(10, 'Synthetic line 10, as the entry has it.')))
    for (const path of [ANCESTOR, MAINS, ENTRYS]) expect(theLineAtThePin(made, path)).toEqual({ path, why: RENAMED })
  })

  it('deleted on one side and changed on the other', () => {
    expect(theLineAtThePin(aRepository(deleted, changedAt(2, 'Synthetic line 2, as the entry has it.')), ANCESTOR)).toEqual({ path: ANCESTOR, why: `${ANCESTOR} was deleted on main and changed by the entry, ${A_CANNOT}` })
    expect(theLineAtThePin(aRepository(changedAt(2, 'Synthetic line 2, as main has it.'), deleted), ANCESTOR)).toEqual({ path: ANCESTOR, why: `${ANCESTOR} was deleted by the entry and changed on main, ${A_CANNOT}` })
  })
})
