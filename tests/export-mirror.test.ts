// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Submission events add one legitimate archive file per edit; the original one-record and incidental-file bounds remain. */
/**
 * THE GIT MIRROR — the exported text, committed, with a history worth reading.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A mirror that commits on every run makes its own history useless: every commit says "something
 * happened" and none of them means it, and the first question anybody asks a mirror — what changed
 * while I was away — has no answer. So the test that matters most below is the dullest one: run
 * the mirror twice with no writes in between, and assert the second run makes NO COMMIT AT ALL.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS DRIVES A REAL GIT
 * ---------------------------------------------------------------------------------------
 *
 * A fake git would prove that gitmirror.ts calls the commands its author expected, which is a
 * statement about the author. Whether two identical exports leave the index clean is a fact about
 * git, and the only way to know it is to ask git. So `systemGit` — the same runner the CLI uses,
 * and the only implementation there is — is imported from scripts/export.ts and pointed at
 * throwaway directories.
 *
 * One test uses a fake runner, and only one: git being absent from the machine cannot be arranged
 * on a machine that has it.
 *
 * ---------------------------------------------------------------------------------------
 * PROCESS AND FILE HYGIENE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here starts a server and nothing here listens on a port. Every database is a throwaway
 * from `freshDb()` and every mirror is a fresh temporary directory that is removed afterwards.
 * `./data/panelx.db` is never opened, and the last test in this file asserts that rather than
 * asserting it in a comment.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
// The runner the product itself uses. It lives outside src/ because A7's rule is that one
// interface talks to the operating system and OsProbe has no way to run a command; importing this
// module gives the runner and runs nothing, because scripts/export.ts only acts when it is argv[1].
import { systemGit } from '../scripts/export.ts'

type MirrorLib = typeof import('../src/server/lib/gitmirror.ts')

let t: TestDb
let lib: MirrorLib
const roots: string[] = []

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A mirror directory nothing else has touched. Removed in afterAll. */
function freshRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-mirror-'))
  roots.push(dir)
  return dir
}

/** Run git in a mirror and hand back its output, or fail the test with what git said. */
function git(root: string, ...args: string[]): string {
  const outcome = systemGit(args, root)
  if (outcome.failure !== null) throw new Error(`git ${args.join(' ')}: ${outcome.failure}`)
  if (outcome.status !== 0) throw new Error(`git ${args.join(' ')} exited ${String(outcome.status)}: ${outcome.stderr}`)
  return outcome.stdout
}

/** How many commits the mirror holds. Zero before the first one. */
function commitCount(root: string): number {
  const outcome = systemGit(['rev-list', '--count', 'HEAD'], root)
  return outcome.status === 0 ? Number(outcome.stdout.trim()) : 0
}

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/gitmirror.ts')

  // Everything below needs git on the machine. Said plainly, once, so a failure elsewhere in this
  // file is about the mirror rather than about the machine.
  const version = systemGit(['--version'], tmpdir())
  expect(version.failure, 'git is not usable on this machine, so nothing in this file can mean anything').toBe(null)

  const module = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: '夹具标定', summary: '把 effort 值标定成实际夹持力', data: { context: 'The gripper calibration.', parts: [] }, actor: HUMAN })
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Transplant v2', data: {}, actor: HUMAN })
  const block = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'done' }, HUMAN)
  t.api.createLink({ fromId: module.id, toId: block.block.id, type: 'implements', inferred: true, actor: HUMAN })
})

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  t.close()
})

// ================================================================================ the first commit

describe('the first run makes a repository and one commit', () => {
  it('creates the repository, commits everything, and says which', () => {
    const root = freshRoot()
    const report = lib.mirror({ root, git: systemGit })

    expect(report.repository).toBe('created')
    expect(report.committed).not.toBeNull()
    expect(report.quiet).toBeNull()
    expect(commitCount(root)).toBe(1)
    // The subject of a first export names what the archive holds, because there is nothing to
    // compare it against and "3 files changed" would say nothing about what was saved.
    expect(report.committed?.subject).toContain('First export')
    expect(report.committed?.subject).toContain('records')
  })

  it('commits on a branch named the same on every machine', () => {
    // init.defaultBranch differs between installations. A mirror whose branch depended on the
    // machine would be two different repositories when it moved.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    expect(git(root, 'branch', '--show-current').trim()).toBe('main')
  })

  it('has the whole export in it, tracked, including the Chinese title', () => {
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    const tracked = git(root, 'ls-files').trim().split('\n')
    expect(tracked).toContain('MANIFEST.md')
    expect(tracked).toContain('INDEX.md')
    expect(tracked.filter((f) => f.startsWith('records/')).length).toBeGreaterThan(0)
    expect(git(root, 'show', 'HEAD:INDEX.md')).toContain('夹具标定')
  })
})

// ================================================================================ the whole point

describe('a run that changes nothing makes no commit', () => {
  it('leaves the history exactly where it was', () => {
    // THE PROPERTY THE WHOLE MIRROR RESTS ON. If this fails, every export is a commit, the log
    // fills with noise, and "what changed while I was away" stops being answerable.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    const first = git(root, 'rev-parse', 'HEAD').trim()

    const second = lib.mirror({ root, git: systemGit })
    expect(second.committed).toBeNull()
    expect(second.repository).toBe('already there')
    expect(commitCount(root)).toBe(1)
    expect(git(root, 'rev-parse', 'HEAD').trim()).toBe(first)
  })

  it('says why in words rather than leaving a null to be interpreted', () => {
    // "The mirror is up to date" and "the mirror did not run" look identical from the outside, and
    // only one of them is fine.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    const again = lib.mirror({ root, git: systemGit })
    expect(again.quiet).toContain('nothing changed')
    expect(again.quiet).toContain('not a failure')
  })

  it('leaves no uncommitted change behind either, so the tree is genuinely clean', () => {
    // A mirror that skipped the commit while leaving the working tree dirty would look up to date
    // and be one edit away from committing somebody else's afternoon by accident.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    lib.mirror({ root, git: systemGit })
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
  })
})

// ================================================================================ a real change

describe('a change makes exactly one commit, and the diff says what it was', () => {
  it('commits the record that moved and nothing else', () => {
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })

    const gripper = t.api.getRecordByTitle('夹具标定', 'default')
    expect(gripper).not.toBeNull()
    t.api.patchRecord(String(gripper?.id), { summary: 'Recalibrated after the reprint' }, HUMAN)

    const report = lib.mirror({ root, git: systemGit })
    expect(commitCount(root)).toBe(2)
    const changed = git(root, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n')
    // The record file, the change-log day the edit landed on, and the manifest, whose change count
    // moved. Nothing else — a record edit must not rewrite 300 files.
    expect(changed).toContain(`records/module/${String(gripper?.id)}.md`)
    expect(changed.filter((f) => f.startsWith('records/')).length).toBe(1)
    // `submissions.md` used to move with every edit because submission_events copied each one;
    // migration 0154 dropped that copy (criterion C34) and a record edit now leaves the
    // submitted-evidence page untouched. The bound stays: still fewer than six files, all told.
    expect(report.export.written.length).toBeLessThan(6)
  })

  it('shows the edit as a readable line-level diff', () => {
    // This is what "readable history" buys. The whole point of a text mirror over a copied .db.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    const gripper = t.api.getRecordByTitle('夹具标定', 'default')
    t.api.patchRecord(String(gripper?.id), { summary: 'A second recalibration' }, HUMAN)
    lib.mirror({ root, git: systemGit })

    const diff = git(root, 'show', '--format=', 'HEAD')
    expect(diff).toContain('+summary: "A second recalibration"')
    expect(diff).toContain('records/module/')
  })

  it('names the row counts that moved in the subject, and the whole table in the body', () => {
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note filed between two exports', data: {}, actor: HUMAN })
    const report = lib.mirror({ root, git: systemGit })

    expect(report.committed?.subject).toContain('+1 records')
    const body = git(root, 'log', '-1', '--format=%b')
    expect(body).toContain('records')
    expect(body).toContain('(+1)')
    expect(body).toContain('mole-office-export/2')
    expect(body).toContain('design/durability/FORMAT.md')
  })

  it('commits a deletion when a file is no longer produced, rather than leaving the file behind', () => {
    // A mirror written before a decision holds each panel layout as layouts/<id>.md, and no export writes one
    // now. The file is committed here as such a mirror holds it.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    mkdirSync(join(root, 'layouts'), { recursive: true })
    writeFileSync(join(root, 'layouts', 'home.md'), '# Panel layout `home`\n')
    git(root, 'add', 'layouts/home.md')
    git(root, 'commit', '-q', '-m', 'a layout, as a mirror written before a decision holds it')
    expect(git(root, 'ls-files').trim().split('\n')).toContain('layouts/home.md')

    const report = lib.mirror({ root, git: systemGit })
    expect(report.export.removed).toEqual(['layouts/home.md'])
    expect(git(root, 'ls-files').trim().split('\n')).not.toContain('layouts/home.md')
    // A stale file left in the mirror would be re-read by the next import, which is a row coming
    // back from the dead after somebody removed it.
    expect(existsSync(join(root, 'layouts', 'home.md'))).toBe(false)
  })
})

// ================================================================================ what must never be committed

describe('no secret and nothing generated ever reaches a commit', () => {
  it('refuses to commit at all when a .env is sitting in the mirror', () => {
    // .env is where a secret would live. A secret in a git history has leaked, and no later
    // commit takes it back out.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    writeFileSync(join(root, '.env'), 'MOLE_OFFICE_FAKE_SECRET=not-a-real-secret\n')

    let thrown: Error | null = null
    try {
      lib.mirror({ root, git: systemGit })
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown?.message).toContain('.env')
    expect(thrown?.message).toContain('secret')
    // Refused, and the file left alone: deleting somebody's file is not this tool's decision.
    expect(commitCount(root)).toBe(1)
    expect(existsSync(join(root, '.env'))).toBe(true)
    expect(git(root, 'ls-files').trim()).not.toContain('.env')
    rmSync(join(root, '.env'))
  })

  it('refuses a database file, which is binary and is the thing this exists to replace', () => {
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    writeFileSync(join(root, 'panelx.db'), 'not really a database')
    expect(() => lib.mirror({ root, git: systemGit })).toThrow(/panelx\.db/)
    expect(commitCount(root)).toBe(1)
    rmSync(join(root, 'panelx.db'))
  })

  it('refuses anything generated', () => {
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    const generated = join(root, 'node_modules')
    writeFileSync(join(root, 'node_modules'), '')
    expect(() => lib.mirror({ root, git: systemGit })).toThrow(/node_modules/)
    rmSync(generated)
  })

  it('refuses to make the Mole Office repository itself into the mirror', () => {
    // `--to <the repo>` would write the export into the source tree and then `git add -A` it,
    // staging .env, ./data/panelx.db and node_modules in somebody's working copy. Caught before
    // anything is written rather than after.
    const repo = new URL('../', import.meta.url).pathname
    expect(() => lib.mirror({ root: repo, git: systemGit })).toThrow(/will not commit there/)
    // And an ancestor of it, where the same thing happens one directory up.
    expect(() => lib.mirror({ root: join(repo, '..'), git: systemGit })).toThrow(/will not commit there/)
  })
})

// ================================================================================ attribution

describe('who the commit is from', () => {
  it('is Mole Office when the repository has no identity of its own', () => {
    // Not an invented person and not a guess at who is at the keyboard. WHO changed the data is
    // recorded per row in `changes`, with actor type, actor id and session; a commit here says
    // only which program wrote the files.
    const root = freshRoot()
    lib.mirror({ root, git: systemGit })
    expect(git(root, 'log', '-1', '--format=%an <%ae>').trim()).toBe('Mole Office <mole-office@localhost>')
  })

  it('leaves an identity a person configured alone', () => {
    const root = freshRoot()
    git(root, 'init')
    git(root, 'config', 'user.name', THE_TEST_OFFICES_OWNER.name)
    git(root, 'config', 'user.email', `${THE_TEST_OFFICES_OWNER.id}@example.com`)
    lib.mirror({ root, git: systemGit })
    expect(git(root, 'log', '-1', '--format=%an <%ae>').trim()).toBe(`${THE_TEST_OFFICES_OWNER.name} <${THE_TEST_OFFICES_OWNER.id}@example.com>`)
  })
})

// ================================================================================ when git is absent

describe('a machine with no git', () => {
  it('says so, having written the export anyway', () => {
    // The export is the durable half and the commit is the safety net. Losing the second is worth
    // a sentence; losing the first because of it would not be.
    const root = freshRoot()
    // The one fake runner in this file. A machine that has git cannot be made not to have it, and
    // this is the branch a person on a fresh machine meets first.
    const noGit = (): { status: null; stdout: string; stderr: string; failure: string } => ({
      status: null,
      stdout: '',
      stderr: '',
      failure: 'git is not installed on this machine, so the export was written but nothing was committed',
    })

    expect(() => lib.mirror({ root, git: noGit })).toThrow(/git is not installed/)
    // Written before git was ever asked for, which is the order that matters.
    expect(existsSync(join(root, 'MANIFEST.md'))).toBe(true)
    expect(readFileSync(join(root, 'INDEX.md'), 'utf8')).toContain('夹具标定')
  })
})

// ================================================================================ status without git

describe('what the server can say about the mirror without running anything', () => {
  it('reports whether the directory and the repository are there, and nothing it cannot know', () => {
    // POST /api/export uses this. The server may read files and may not spawn processes, so it can
    // say a repository exists and cannot say what is in it. Guessing the second half would be
    // worse than not answering it.
    const root = freshRoot()
    expect(lib.mirrorStatus(root)).toEqual({ root, exists: true, isRepository: false })
    lib.mirror({ root, git: systemGit })
    expect(lib.mirrorStatus(root)).toEqual({ root, exists: true, isRepository: true })
    expect(lib.mirrorStatus(join(root, 'nowhere'))).toEqual({ root: join(root, 'nowhere'), exists: false, isRepository: false })
  })
})

// ================================================================================ hygiene

describe('this file never touched the real database', () => {
  afterEach(() => {
    // Nothing here starts a process that outlives a call: `systemGit` is spawnSync with a timeout,
    // so there is no group to kill and no port to free. The rule is still written down, because
    // five orphaned-process incidents in this project all began with nobody writing it down.
    expect(process.env.MOLE_OFFICE_DB).toBe(t.file)
  })

  it('is pointed at a throwaway file, and every mirror is a temporary directory', () => {
    expect(t.file).toContain(tmpdir())
    expect(t.file).not.toContain('data/panelx.db')
    for (const root of roots) expect(root).toContain(tmpdir())
  })
})
