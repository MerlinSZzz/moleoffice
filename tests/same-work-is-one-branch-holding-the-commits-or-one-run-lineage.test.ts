// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SAME WORK IS A NEWER COMMIT THAT CONTAINS THE OLDER ONE. NEVER THE FOLDER, THE BRANCH NAME OR THE RUN LINEAGE ALONE.
 * Problem YL2A9GqoUWHd: runs OPyb3wNIO5U8 and sqfHzN2E7zVh both worked in the same worktree, on the branches
 * up-can-leave-the-gpu-out and codex-workers-and-rounds. The office compared only the folder, so the newer entry
 * SmQ1ePvlIThf superseded cRCa-voguDqT, although its commit 178d2d33a did not hold 4e7732223.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and synthetic git trees under `.logs/`:
 *
 *   1. Two runs in one folder on two branches are two works: neither entry is superseded.
 *   2. One branch whose newer commit does not hold the older commit is two works.
 *   3. One branch whose newer commit holds the older one, from another run, is one work. The older entry keeps
 *      `superseded` {by, because, at}, and the submission says why.
 *   4. A run that continues the older run (`derived_from`) is not one work by that alone: on another branch, with a
 *      commit that does not contain the older one, both entries stay (wave 13v round 16).
 *   5. A superseded entry is never silent (wave 13v round 16). From one folder, two entries on two branches stay;
 *      a third whose commit contains the first supersedes the first only, and the first's run's agent and its
 *      starter are sent a waking `anEntryWasSuperseded` notice naming the newer entry, its run and the containment.
 *
 * Every fixture is synthetic and says so; nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'sw-worker')
const asStarter = as('agent', 'sw-starter')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `same-work-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic git tree with one baseline commit on `main`. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic same-work fixture')
  writeFileSync(join(dir, 'base.txt'), 'baseline\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  return dir
}

/** One synthetic commit in `dir` on its current branch, touching `work/<file>`, inside the worker's work area. */
function commit(dir: string, file: string, text: string): string {
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', file), text)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', `Synthetic ${file}`)
  return git(dir, 'rev-parse', 'HEAD')
}

/** A run of the worker in `dir`, finished so it is sealed on the folder's HEAD as it stands now. */
async function aSealedRun(dir: string): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic same-work run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'sw-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'sw-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

async function submit(run: string, branch: string) {
  const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: 'sw-main', branch } } })
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as { entry: Record<string, any>; superseded: string[]; says: string }
}

function stateOf(id: string): unknown {
  return t.api.getRecord(id)!.data['state']
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'sw-starter')
  await started(asStarter, 'sw-worker', ['work'])
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'sw-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('same work in the merge queue (problem YL2A9GqoUWHd)', () => {
  it('is not two runs in one folder on two branches', async () => {
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'up-can-leave-the-gpu-out')
    commit(dir, 'gpu.txt', 'the gpu may be left out\n')
    const older = await submit(await aSealedRun(dir), 'up-can-leave-the-gpu-out')
    git(dir, 'switch', '-q', 'main')
    git(dir, 'switch', '-q', '-c', 'codex-workers-and-rounds')
    commit(dir, 'codex.txt', 'codex workers and rounds\n')
    const newer = await submit(await aSealedRun(dir), 'codex-workers-and-rounds')
    expect(newer.superseded).toEqual([])
    expect(stateOf(String(older.entry['id']))).toBe('submitted')
  })

  it('is not one branch whose newer commit does not hold the older one', async () => {
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'work')
    commit(dir, 'a.txt', 'first try\n')
    const older = await submit(await aSealedRun(dir), 'work')
    git(dir, 'switch', '-q', 'main')
    git(dir, 'switch', '-q', '-C', 'work')
    commit(dir, 'b.txt', 'a different piece\n')
    const newer = await submit(await aSealedRun(dir), 'work')
    expect(newer.superseded).toEqual([])
    expect(stateOf(String(older.entry['id']))).toBe('submitted')
  })

  it("is one branch whose newer commit holds the older one, and the older entry says by which entry and why", async () => {
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'held')
    const first = commit(dir, 'a.txt', 'first piece\n')
    const older = await submit(await aSealedRun(dir), 'held')
    commit(dir, 'b.txt', 'second piece\n')
    const newer = await submit(await aSealedRun(dir), 'held')
    const olderId = String(older.entry['id'])
    expect(newer.superseded).toEqual([olderId])
    expect(stateOf(olderId)).toBe('superseded')
    const kept = t.api.getRecord(olderId)!.data['superseded'] as Record<string, string>
    expect(kept['by']).toBe(newer.entry['id'])
    expect(kept['because']).toContain(`contains the older entry's commit ${first.slice(0, 12)}`)
    expect(kept['at']).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(newer.says).toContain(`It supersedes ${olderId}. ${kept['because']}`)
    const read = await app.inject({ method: 'GET', url: `/api/merge-queue/${olderId}`, headers: asWorker })
    expect((read.json() as { entry: Record<string, unknown> }).entry['superseded']).toEqual(kept)
  })

  it('is not a run that continues the older run, on another branch, when the newer commit does not contain the older one', async () => {
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'before-compaction')
    commit(dir, 'a.txt', 'before\n')
    const olderRun = await aSealedRun(dir)
    const older = await submit(olderRun, 'before-compaction')
    git(dir, 'switch', '-q', 'main')
    git(dir, 'switch', '-q', '-c', 'after-compaction')
    commit(dir, 'c.txt', 'after\n')
    const newerRun = await aSealedRun(dir)
    t.api.createLink({ fromId: newerRun, toId: olderRun, type: 'derived_from', actor: { type: 'agent', id: 'sw-worker' } })
    const newer = await submit(newerRun, 'after-compaction')
    expect(newer.superseded).toEqual([])
    expect(stateOf(String(older.entry['id']))).toBe('submitted')
  })
})

describe('a superseded entry is never silent (problem YL2A9GqoUWHd, wave 13v round 16)', () => {
  const idOf = (handle: string) => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  const noticesAbout = (run: string) =>
    (
      t.client.sqlite
        .prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.notice') = 'anEntryWasSuperseded' AND json_extract(data, '$.aboutRun') = ?")
        .all(run) as { id: string; data: string }[]
    ).map((row) => ({ id: row.id, ...(JSON.parse(row.data) as { to: { kind: string; id: string }[]; body: string }) }))

  it('keeps both entries from one folder on two branches, then supersedes the older one only when a newer commit contains it, and tells its people', async () => {
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'first-line')
    const firstCommit = commit(dir, 'first.txt', 'first line of work\n')
    const firstRun = await aSealedRun(dir)
    const first = String((await submit(firstRun, 'first-line')).entry['id'])
    git(dir, 'switch', '-q', 'main')
    git(dir, 'switch', '-q', '-c', 'second-line')
    commit(dir, 'second.txt', 'second line of work\n')
    const secondRun = await aSealedRun(dir)
    const second = await submit(secondRun, 'second-line')
    expect(second.superseded).toEqual([])
    expect(stateOf(first)).toBe('submitted')
    expect(stateOf(String(second.entry['id']))).toBe('submitted')
    expect(noticesAbout(firstRun)).toEqual([])

    git(dir, 'switch', '-q', 'first-line')
    commit(dir, 'first-more.txt', 'more of the first line\n')
    const thirdRun = await aSealedRun(dir)
    const third = await submit(thirdRun, 'first-line')
    const thirdId = String(third.entry['id'])
    expect(third.superseded).toEqual([first])
    expect(stateOf(first)).toBe('superseded')
    expect(stateOf(String(second.entry['id']))).toBe('submitted')

    const told = noticesAbout(firstRun)
    expect(told).toHaveLength(1)
    const notice = told[0]!
    expect(notice.to.map((one) => one.id).sort()).toEqual([idOf('sw-starter'), idOf('sw-worker')].sort())
    expect(notice.body).toContain(`superseded by merge entry ${thirdId}`)
    expect(notice.body).toContain(`submitted from run ${thirdRun}`)
    expect(notice.body).toContain(`contains the older entry's commit ${firstCommit.slice(0, 12)}`)
    expect((t.api.getRecord(first)!.data['told'] as { submitter: string[] }).submitter).toEqual([notice.id])
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    expect(NOTICES.anEntryWasSuperseded.wakes).toBe(true)
  })
})
