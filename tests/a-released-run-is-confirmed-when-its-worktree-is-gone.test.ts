// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASED RUN IS CONFIRMED WHEN ITS WORKTREE IS GONE, OR THE REPOSITORY ITS SEAL NAMES IS GONE. Problem
 * ubRkOIcdBWnS; wave 13k round 6, piece 1.
 *
 * On 26 September 2026 the owner pressed confirm on two released runs of an agent's, and it answered "The submitted Git
 * work cannot be sealed": both worktrees had been removed. The secretary re-created them at the sealed commits from the
 * office's repository, and the press then answered "The repository or files differ from seal …": both seals name the
 * repository's old path, which the restore of 21 September moved away.
 *
 * WHAT IS MEASURED, on real git repositories this file makes in a temporary folder. Every record here is synthetic.
 * One repository, the LANE, is the project's one registered repository; each case works on its own branch.
 *
 *   · case (a): the run's worktree was removed. The confirm answers 201, and its sentence says the seal was read from
 *     the sealed commit in the lane, because the worktree no longer exists;
 *   · case (b): the run was sealed in a clone that is gone, and its worktree was re-created in the lane at the sealed
 *     commit. The confirm answers 201 and says the repository the seal names no longer exists;
 *   · still refused: the lane does not hold the sealed commit; the worktree is in the sealed repository and HEAD no
 *     longer contains the sealed commit; the worktree is in a different repository while the sealed repository still
 *     exists.
 *
 * UNDER A LATER COMMIT (wave 13s round 21, piece 2). The confirm reads a seal under later commits as the inspector does:
 *   · a worktree in the sealed repository whose HEAD is a later commit on top of the seal is confirmed, and the answer
 *     says the later commits were not read;
 *   · still refused: HEAD contains the sealed commit but the worktree is in another repository; HEAD contains it but
 *     git's objects no longer hold a sealed file at its sealed hash (its blob's loose object rewritten to hold other
 *     bytes, because the office's git reads ignore `git replace`).
 *   The case "HEAD moved" before round 21 committed on top of the seal, which is now accepted on purpose; it amends the
 *   sealed commit instead, so HEAD no longer contains it.
 *
 * THE CHECK AGAIN'S OWN REPOSITORY (wave 13s round 21, piece 1; problem JCSXirDhnzaE). These cases run last, because
 * they register a second repository. With two, a run whose worktree is gone is refused, since the office cannot tell
 * which to read; but a run that is the merge queue's check again for a merge entry is read in the repository that
 * entry names, and the answer names the entry.
 *
 * MUTATION (wave 13k round 6): in `theSealReadFromItsCommit` (src/server/lib/sealed-tip.ts), skip the check that the
 * repository holds the sealed commit. The absent-commit case goes red: its refusal no longer names the missing commit.
 *
 * MUTATIONS (wave 13s round 21), each run once against this file and then restored:
 *   (i) the confirm in src/server/lib/inspection.ts passes `{ fromTheCommit: true }` without `underALaterCommit`: the
 *       later-commit case goes red (409 "The tip moved"), and so do the two later-commit refusals, whose refusals
 *       no longer name what they are about.
 *   (ii) `theCommitIsUnder` in sealed-tip.ts answers true without asking git: the amended case goes red (201).
 *   (iii) `theSealReadUnderALaterCommit` skips its repository comparison: the other-repository case goes red.
 *   (iv) `theSealReadUnderALaterCommit` skips its file comparison: the replaced-blob case goes red.
 *   (v) `theRepositoryOfACheckAgain` answers null for every run: the check-again case goes red (409, two repositories).
 *
 * THE FOLDER MOVED ON (wave 13u round 72). The next round can start in the run's folder before the confirm: on a new
 * branch at the sealed commit with a file changed or added, or on a new branch without the sealed commit. The folder is
 * read first, and where it refuses, the folder is still a worktree of the sealed repository, and a branch there still
 * holds the sealed commit, the confirm reads the seal from that commit and says so. Every refusal above keeps its words.
 * On the code before the change, the three moves are refused 409 with the folder's words.
 *   Still refused (wave 13u round 131, item 15): the folder moved on and a branch holds the sealed commit, but git's
 *   objects no longer hold a sealed file at its sealed hash, so the commit is not the seal's. MUTATION: in
 *   `theSealReadAfterItsWorktreeMovedOn` (sealed-tip.ts), skip `theCommitHoldsTheSeal`: the case goes red (201).
 *
 * THE AMENDED CASE'S COMMIT IS ITS OWN (wave 13u round 73; round 72's check, 075A2BSrDBkx). It used case (a)'s file,
 * text and message, so when both were made in the same second they were one commit. Case (a)'s branch then held the
 * commit the amended case amends away, and the confirm read the seal from it: 201 in 3 of 21 runs. Its commit now has a
 * message of its own. With git's dates fixed to one second (GIT_AUTHOR_DATE and GIT_COMMITTER_DATE), the case is red on
 * the old message every time and green on the new one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'confirm-gone-worktree-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']
const lane = join(made, 'lane')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commit(dir: string, file: string, content: string, subject: string): string {
  writeFileSync(join(dir, 'work', file), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', subject)
  return git(dir, 'rev-parse', 'HEAD')
}
function aRepository(dir: string): void {
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic confirm fixture')
  writeFileSync(join(dir, 'work', 'a.txt'), 'a before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
}

let worktrees = 0
/** A worktree of `repository` on a new branch cut from main, where a run commits and is sealed. */
function aWorktree(repository: string, name: string): string {
  worktrees += 1
  const at = join(made, `${name}-${String(worktrees)}`)
  git(repository, 'worktree', 'add', '-q', '-b', `${name}-${String(worktrees)}`, at, 'main')
  return at
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A run finished through the real finish door, sealed, and released by an inspector who read THIS seal. */
async function aReleasedRun(directory: string): Promise<{ run: string; seal: string; commit: string }> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('gone-worker'),
    payload: { kind: 'session', title: 'Synthetic sealed run', data: { state: 'running', servingAgent: 'gone-worker', workingDirectory: directory, cutFrom: 'main' } },
  })
  expect(created.statusCode, created.body).toBe(201)
  const run = (created.json() as { record: { id: string } }).record.id
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('gone-worker'), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  const sealData = t.api.getRecord(seal)!.data['seal'] as { hash: string; git: { commit: string } }
  const released = {
    by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
    at: '2026-09-26 09:00:00',
    how: 'an inspector',
    read: { sealId: seal, sealHash: sealData.hash, worktree: directory, tip: sealData.git.commit, ofItsOwn: true, says: 'Synthetic: read the sealed tree.' },
  }
  writeAVerdictAsItsDoorWould(t, run, { released })
  return { run, seal, commit: sealData.git.commit }
}

async function confirm(run: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: AS_THE_PERSON, payload: { because: 'The report is sound.' } })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function expectRefused(run: string, ...words: string[]): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const { code, said } = await confirm(run)
  expect(code, JSON.stringify(said)).toBe(409)
  for (const word of words) expect(String(said['error'])).toContain(word)
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  aRepository(lane)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'gone-worker', name: 'Gone worker', role: 'worker', workArea: ['work'] })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-lane', root: lane, actor: { type: 'human', id: THE_PERSON } })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('confirming a released run whose worktree or sealed repository is gone', () => {
  it('(a) reads the seal from its commit in the project\'s repository when the worktree was removed, and says so', async () => {
    const at = aWorktree(lane, 'removed')
    commit(at, 'a.txt', 'a from the run\n', 'The run changes a')
    const { run, seal, commit: sealed } = await aReleasedRun(at)
    git(lane, 'worktree', 'remove', '--force', at)
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(String(said['says'])).toContain(
      `The seal ${seal} was read from commit ${sealed} in the repository ${lane}, because the run's worktree ${at} no longer exists`,
    )
    expect((said['stands'] as Record<string, unknown>)['standing']).toBe('closed')
  })

  it('(b) reads it from its commit when the repository the seal names is gone and the worktree was re-created elsewhere', async () => {
    const clone = join(made, 'old-home-of-the-project')
    git(made, 'clone', '-q', lane, clone)
    git(clone, 'config', 'user.email', 'fixture@example.invalid')
    git(clone, 'config', 'user.name', 'Synthetic confirm fixture')
    const at = aWorktree(clone, 'moved')
    commit(at, 'a.txt', 'a from the moved run\n', 'The moved run changes a')
    const { run, seal, commit: sealed } = await aReleasedRun(at)
    // THE PROJECT MOVED: the lane takes the commit, the old repository and its worktree go, and the worktree is made
    // again at the sealed commit from the lane, as the secretary did for that agent's runs.
    git(lane, 'fetch', '-q', clone, `moved-${String(worktrees)}`)
    rmSync(clone, { recursive: true, force: true })
    rmSync(at, { recursive: true, force: true })
    git(lane, 'worktree', 'add', '-q', '--detach', at, sealed)
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(String(said['says'])).toContain(`The seal ${seal} was read from commit ${sealed} in the repository ${lane}, because the repository the seal names,`)
    expect(String(said['says'])).toContain('no longer exists')
  })

  it('still refuses when the project\'s repository does not hold the sealed commit', async () => {
    const elsewhere = join(made, 'never-fetched')
    git(made, 'clone', '-q', lane, elsewhere)
    git(elsewhere, 'config', 'user.email', 'fixture@example.invalid')
    git(elsewhere, 'config', 'user.name', 'Synthetic confirm fixture')
    const at = aWorktree(elsewhere, 'absent')
    const sealed = commit(at, 'a.txt', 'a that never reached the lane\n', 'The run changes a where the lane never sees it')
    const { run } = await aReleasedRun(at)
    git(elsewhere, 'worktree', 'remove', '--force', at)
    await expectRefused(run, `does not hold its sealed commit ${sealed}`)
  })

  it('still refuses a worktree in the sealed repository whose HEAD no longer contains the sealed commit', async () => {
    const at = aWorktree(lane, 'moved-head')
    // A MESSAGE NO OTHER CASE USES (wave 13u round 73). With case (a)'s message, a commit made in the same second as
    // case (a)'s was the same commit, and case (a)'s branch still held it, so the confirm read it from there (201).
    commit(at, 'a.txt', 'a from the run\n', 'The run changes a, and this commit is amended after the seal')
    const { run } = await aReleasedRun(at)
    // AMENDED, not committed on top: a commit on top is read under the later commit since round 21 (below).
    writeFileSync(join(at, 'work', 'a.txt'), 'a changed after the seal\n')
    git(at, 'commit', '-q', '-a', '--amend', '-m', 'The sealed commit, amended after the seal')
    await expectRefused(run, 'The tip moved after seal')
  })

  it('confirms a worktree in the sealed repository whose HEAD is a later commit on top of the seal, and says so', async () => {
    const at = aWorktree(lane, 'later-commit')
    commit(at, 'a.txt', 'a from the run\n', 'The run changes a')
    const { run, seal, commit: sealed } = await aReleasedRun(at)
    const later = commit(at, 'a.txt', 'a changed on top of the seal\n', 'A commit on top of the seal')
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(String(said['says'])).toContain(
      `The seal ${seal} was read from commit ${sealed} in the repository ${join(lane, '.git')}, because the worktree's HEAD moved on to ${later}, ` +
        `which still contains the sealed commit ${sealed}`,
    )
    expect(String(said['says'])).toContain('the later commits were not read')
  })

  it('still refuses a later commit on top of the seal in a different repository while the sealed repository still exists', async () => {
    const at = aWorktree(lane, 'later-elsewhere')
    const sealed = commit(at, 'a.txt', 'a from the run\n', 'The run changes a')
    const { run } = await aReleasedRun(at)
    const other = join(made, 'later-elsewhere-repository')
    git(made, 'clone', '-q', lane, other)
    git(other, 'config', 'user.email', 'fixture@example.invalid')
    git(other, 'config', 'user.name', 'Synthetic confirm fixture')
    git(other, 'fetch', '-q', lane, `later-elsewhere-${String(worktrees)}`)
    git(lane, 'worktree', 'remove', '--force', at)
    git(other, 'worktree', 'add', '-q', '-b', 'on-top', at, sealed)
    commit(at, 'a.txt', 'a changed on top, elsewhere\n', 'A commit on top of the seal in another repository')
    await expectRefused(run, "the worktree's repository is", `not the sealed ${join(lane, '.git')}`)
  })

  it('still refuses a later commit on top of the seal when git no longer holds a sealed file at its sealed hash', async () => {
    const at = aWorktree(lane, 'replaced-blob')
    commit(at, 'a.txt', 'a from the run, whose blob is replaced\n', 'The run changes a')
    const { run } = await aReleasedRun(at)
    commit(at, 'a.txt', 'a changed on top of the replaced seal\n', 'A commit on top of the seal')
    // THE BLOB'S OWN LOOSE OBJECT NOW HOLDS OTHER BYTES. Git does not check an object's bytes against its name when it
    // reads it, so the sealed name now reads as other bytes. The office's reads ignore `git replace`, so this is the way.
    const blob = git(at, 'rev-parse', 'HEAD~1:work/a.txt')
    const loose = join(lane, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
    const sealedObject = readFileSync(loose)
    const other = Buffer.from('other bytes\n')
    chmodSync(loose, 0o644)
    writeFileSync(loose, deflateSync(Buffer.concat([Buffer.from(`blob ${String(other.length)}\0`), other])))
    try {
      await expectRefused(run, 'Sealed file work/a.txt differs from seal', 'no longer hold the sealed files')
    } finally {
      writeFileSync(loose, sealedObject)
      chmodSync(loose, 0o444)
    }
  })
  it('still refuses a worktree in a different repository while the sealed repository still exists', async () => {
    const at = aWorktree(lane, 'other-repository')
    const sealed = commit(at, 'a.txt', 'a from the run\n', 'The run changes a')
    const { run } = await aReleasedRun(at)
    const other = join(made, 'other-repository')
    git(made, 'clone', '-q', lane, other)
    git(other, 'fetch', '-q', lane, `other-repository-${String(worktrees)}`)
    git(lane, 'worktree', 'remove', '--force', at)
    git(other, 'worktree', 'add', '-q', '--detach', at, sealed)
    await expectRefused(run, 'The repository or files differ from seal')
  })

  // THE NEXT ROUND MOVED THE FOLDER ON (wave 13u round 72). The folder is read first, as in every case above. Where it
  // refuses, the folder is still a worktree of the sealed repository, and a branch there still holds the sealed commit,
  // the seal is read from that commit. The amended case above stays refused, because no branch holds a commit amended
  // away; the two other-repository cases stay refused, because their folder is a worktree of another repository.
  it.each([
    {
      move: 'to a new branch at the sealed commit, with a sealed file changed and not committed',
      moves: (at: string, next: string) => {
        git(at, 'switch', '-q', '-c', next)
        writeFileSync(join(at, 'work', 'a.txt'), 'the next round began here\n')
      },
      theFolderSays: 'Sealed file work/a.txt differs from seal',
    },
    {
      move: 'to a new branch at the sealed commit, with a file the seal does not hold added',
      moves: (at: string, next: string) => {
        git(at, 'switch', '-q', '-c', next)
        writeFileSync(join(at, 'work', 'the-next-round.txt'), 'the next round began here\n')
      },
      theFolderSays: 'The tip cannot be sealed while files are outside its commit',
    },
    {
      move: 'to a new branch from main, with a sealed file changed and committed',
      moves: (at: string, next: string) => {
        git(at, 'switch', '-q', '-c', next, 'main')
        commit(at, 'a.txt', 'the next round began here\n', 'The next round')
      },
      theFolderSays: 'The tip moved after seal',
    },
  ])('confirms a run whose folder moved on $move, reading the seal from its commit, and says so', async ({ moves, theFolderSays }) => {
    const at = aWorktree(lane, 'moved-on')
    const branch = git(at, 'branch', '--show-current')
    commit(at, 'a.txt', 'a from the run\n', 'The run changes a')
    const { run, seal, commit: sealed } = await aReleasedRun(at)
    moves(at, `the-next-round-${String(worktrees)}`)
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    const says = String(said['says'])
    expect(says).toContain(`The seal ${seal} was read from commit ${sealed} in the repository ${join(lane, '.git')}, because its worktree ${at} moved on`)
    expect(says).toContain(theFolderSays)
    expect(says).toContain(branch)
    expect((said['stands'] as Record<string, unknown>)['standing']).toBe('closed')
  })

  // THE SEALED COMMIT ITSELF NO LONGER HOLDS THE SEAL (wave 13u round 131, item 15). The folder moved on and a branch
  // still holds the sealed commit, but git's objects no longer hold a sealed file at its sealed hash, made as in the
  // replaced-blob case above. The confirm reads the commit and refuses, with the folder's words and the commit's.
  it('still refuses a run whose folder moved on when the sealed commit no longer holds a sealed file at its sealed hash', async () => {
    const at = aWorktree(lane, 'moved-on-replaced-blob')
    const sealed = commit(at, 'a.txt', 'a from the run, whose blob is replaced after its folder moved on\n', 'The run changes a, and its blob is replaced')
    const { run, seal } = await aReleasedRun(at)
    git(at, 'switch', '-q', '-c', `the-next-round-${String(worktrees)}`)
    writeFileSync(join(at, 'work', 'a.txt'), 'the next round began here\n')
    const blob = git(at, 'rev-parse', `${sealed}:work/a.txt`)
    const loose = join(lane, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
    const sealedObject = readFileSync(loose)
    const other = Buffer.from('other bytes\n')
    chmodSync(loose, 0o644)
    writeFileSync(loose, deflateSync(Buffer.concat([Buffer.from(`blob ${String(other.length)}\0`), other])))
    try {
      await expectRefused(
        run,
        `Seal ${seal} cannot be read from its sealed commit after its worktree moved on (Sealed file work/a.txt differs from seal ${seal}.)`,
        `and the files commit ${sealed} changed since`,
        "are not the seal's",
      )
    } finally {
      writeFileSync(loose, sealedObject)
      chmodSync(loose, 0o444)
    }
  })
})

// THESE RUN LAST: they register a second repository, and the cases above read with one.
describe("confirming the merge queue's check again after its merge clone was cleared, in a project with two repositories", () => {
  let laneId = ''
  beforeAll(async () => {
    const repositories = await import('../src/server/lib/repositories.ts')
    laneId = repositories.repositoryNamed('fixture-lane', WORKSPACE)!.id
    const second = join(made, 'second-repository')
    aRepository(second)
    repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-second', root: second, actor: { type: 'human', id: THE_PERSON } })
  })

  /** A merge entry of `run` in the lane, merged, written the way the merge queue writes one. */
  async function aMergedEntry(run: string, seal: string, sealed: string): Promise<string> {
    const door = await import('../src/server/lib/merge-entry-door.ts')
    const inspection = await import('../src/server/lib/inspection.ts')
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: 'Synthetic merged entry of a check again',
        workspaceId: WORKSPACE,
        origin: 'fixture',
        data: {
          run,
          seal: { id: seal, hash: 'h' },
          changeset: { adapter: 'git', root: lane, repository: laneId, branch: `check-again-${String(worktrees)}`, commit: sealed, base: 'main' },
          state: 'merged',
          submittedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
        },
        actor: inspection.THE_OFFICE,
      }),
    ).id
  }

  it('reads the seal from its commit in the repository its merge entry names, and names the entry', async () => {
    const clone = join(made, 'merge-clone')
    git(made, 'clone', '-q', lane, clone)
    git(clone, 'config', 'user.email', 'fixture@example.invalid')
    git(clone, 'config', 'user.name', 'Synthetic confirm fixture')
    const at = aWorktree(clone, 'check-again')
    commit(at, 'a.txt', 'a from the check again\n', 'The check again reads a')
    const { run, seal, commit: sealed } = await aReleasedRun(at)
    // THE ENTRY MERGED: the lane takes the commit, and the merge clone is cleared, as a clear after a merge does.
    git(lane, 'fetch', '-q', clone, `check-again-${String(worktrees)}`)
    const entry = await aMergedEntry(run, seal, sealed)
    const inspection = await import('../src/server/lib/inspection.ts')
    t.api.patchRecord(run, { dataPatch: { extra: { purpose: 'reinspection', mergeEntry: entry } } }, inspection.THE_OFFICE)
    rmSync(clone, { recursive: true, force: true })
    rmSync(at, { recursive: true, force: true })
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(String(said['says'])).toContain(
      `The seal ${seal} was read from commit ${sealed} in the repository ${lane}, which its merge entry ${entry} names, because the run's worktree ${at} no longer exists`,
    )
  })

  it('still refuses a run that is not a check again, since two repositories leave the office unable to tell which to read', async () => {
    const at = aWorktree(lane, 'two-repositories')
    commit(at, 'a.txt', 'a from an ordinary run\n', 'The run changes a')
    const { run } = await aReleasedRun(at)
    git(lane, 'worktree', 'remove', '--force', at)
    await expectRefused(run, 'this project has 2 registered repositories with a checkout rather than one')
  })
})
