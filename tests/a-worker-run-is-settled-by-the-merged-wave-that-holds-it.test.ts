// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER'S RUN IS SETTLED BY THE CHECKED AND MERGED WAVE THAT HOLDS ITS WORK. A decision
 * agreed to the change as proposed. Problem `1pzFUvtcfLNu`;
 * The secretary's answer `F4KyroEu2Pp3`, choice (b).
 *
 * In the wave flow each worker run queues its own check, but only the wave's run is checked and
 * merged. The worker's commits reach the wave by cherry-pick, so they have new hashes. The door
 * POST /api/checks/<run>/superseded now accepts a later run on another branch when that run was
 * released by an inspector, confirmed and merged, both runs have git seals in one repository, and
 * git finds each of the worker's commits in the later run: by ancestry, or by the same patch-id.
 *
 * WHAT IS MEASURED, on a real git repository this file makes in a temporary folder:
 *
 *   · the starter settles a worker run by naming the wave run: 201, `theCheck.superseded` holds how
 *     it was proved, and nothing else on either run changed;
 *   · the retire door, which refused the worker before, lets it go after;
 *   · the ancestor proof settles a run whose sealed commit is in the wave's history;
 *   · one refusal for each way it can fail, each naming what was missing and writing nothing;
 *   · a commit changed by hand is refused, and the refusal names that commit;
 *   · a caller who is neither the starter nor the proved person is refused.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control, each restored byte-identical
 * ---------------------------------------------------------------------------------------
 *
 *   M1 `whatALaterSealHolds` (src/server/lib/sealed-tip.ts): never push onto `missing`. The
 *      hand-changed commit case goes red.
 *   M2 `theLaterRunHoldsThisRun` (src/server/lib/inspection.ts): drop the `how !== 'an inspector'`
 *      branch. The "not checked by an inspector" case goes red.
 *   M3 the same function: drop the `released === null` line. The "not released" case goes red.
 *   M4 the same function: drop the `confirmed === null` line. The "not confirmed" case goes red.
 *   M5 `theMergeOfARun` (src/server/lib/merge-queue.ts): drop the `state !== 'merged'` refusal.
 *      The "entry not merged" case goes red.
 *   M6 the same function: drop the missing-receipt refusal. The "no receipt" case goes red.
 *   M7 `theLaterRunHoldsThisRun`: drop the repository comparison. The different-repositories case
 *      goes red.
 *   M8 `supersedeARun`: read the owner as `me.kind === 'person'` without `thePersonIsProved`. The
 *      unproved-person case goes red.
 *   M9 `supersedeARun`: leave `contains` out of the written mark. The settle case goes red.
 *   M10 `whatALaterSealHolds`: skip the ancestor proof. The ancestor case goes red.
 *   M11 `theLaterRunHoldsThisRun`: refuse only when BOTH seals are missing. Both no-seal cases go red.
 *   M12 `whatALaterSealHolds`: answer '' where git fails, and read every failure of
 *       `merge-base --is-ancestor` as "no". Two lines, because either one alone still refuses with the
 *       same words. The unreadable-repository case goes red.
 *   M13 `whatRetiringWhileACheckIsOwed`: count `superseded` as owed. The retire case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, writeAVerdictAsItsDoorWould } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'run-settled-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}

function commit(dir: string, file: string, content: string, subject: string): string {
  writeFileSync(join(dir, 'work', file), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', subject)
  return git(dir, 'rev-parse', 'HEAD')
}

let repositories = 0
/** A new repository with one baseline commit on main. */
function aRepository(): string {
  repositories += 1
  const dir = join(made, `repo-${String(repositories)}`)
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic settlement fixture')
  writeFileSync(join(dir, 'work', 'a.txt'), 'a before\n')
  writeFileSync(join(dir, 'work', 'b.txt'), 'b before\n')
  writeFileSync(join(dir, 'work', 'c.txt'), 'c before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic baseline')
  return dir
}

/** A new worktree of `repository` on a new branch cut from `from`. */
function aWorktree(repository: string, branch: string, from = 'main'): string {
  const dir = join(made, `${branch}-${String(repositories)}`)
  git(repository, 'worktree', 'add', '-b', branch, dir, from)
  return dir
}

/**
 * A worker branch with two commits, and a wave branch that makes its own commit first and then
 * cherry-picks both, so the wave's commits carry the same patches under new hashes.
 */
function aWorkerAndAWave(repository: string, name: string): { worker: string; wave: string; workerCommits: string[] } {
  const worker = aWorktree(repository, `${name}-worker`)
  const first = commit(worker, 'a.txt', 'a from the worker\n', 'The worker changes a')
  const second = commit(worker, 'b.txt', 'b from the worker\n', 'The worker changes b')
  const wave = aWorktree(repository, `${name}-wave`)
  commit(wave, 'c.txt', 'c from the wave\n', 'The wave changes c')
  git(wave, 'cherry-pick', first, second)
  return { worker, wave, workerCommits: [first, second] }
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A run finished through the real finish door, so the office seals its git work. */
async function aSealedRun(handle: string, directory: string): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title: `Synthetic sealed run of ${handle}`,
      data: { state: 'running', servingAgent: handle, workingDirectory: directory, cutFrom: 'main' },
    },
  })
  expect(created.statusCode, created.body).toBe(201)
  const id = (created.json() as { record: { id: string } }).record.id
  const finished = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(finished.statusCode, finished.body).toBe(200)
  expect(t.api.getRecord(id)!.data['sealedTip'], 'the finish sealed the run').toBeTruthy()
  return id
}

const BY_AN_INSPECTOR = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-25 12:30:00', how: 'an inspector' as const }
const BY_ITS_STARTER = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-25 12:30:00', how: 'its starter' as const }
const A_CONFIRMATION = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-25 12:40:00', because: 'The report is sound.' }

let entries = 0
/** A merge entry standing `state`, written the way the merge queue writes one. */
function aMergeEntry(run: string, state: 'merged' | 'submitted'): string {
  entries += 1
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  return door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry ${String(entries)}`,
      workspaceId: WORKSPACE,
      origin: 'fixture',
      data: {
        run,
        seal: { id: seal, hash: 'h' },
        changeset: { adapter: 'git', root: made, repository: 'r', branch: `wave-${String(entries)}`, commit: 'c', base: 'b' },
        state,
        submittedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
      },
      actor: inspection.THE_OFFICE,
    }),
  ).id
}

/** Write what makes a later run checked, confirmed and merged; each part may be left out. */
async function settleTheLaterRun(
  later: string,
  parts: { released?: typeof BY_AN_INSPECTOR | typeof BY_ITS_STARTER | null; confirmed?: boolean; merged?: 'merged' | 'submitted' | null } = {},
): Promise<void> {
  const released = parts.released === undefined ? BY_AN_INSPECTOR : parts.released
  const patch: Record<string, unknown> = {}
  if (released !== null) patch['released'] = released
  if (parts.confirmed !== false) patch['confirmed'] = A_CONFIRMATION
  if (Object.keys(patch).length > 0) {
    // THE LATER RUN'S VERDICTS, written as their doors write them: an ordinary write of them is refused.
    writeAVerdictAsItsDoorWould(t, later, patch)
  }
  const merged = parts.merged === undefined ? 'merged' : parts.merged
  if (merged !== null) {
    const entry = aMergeEntry(later, merged)
    t.api.patchRecord(later, { dataPatch: { integrated: { entry, mainBefore: 'm1', mainAfter: 'm2', rebasedTip: null, sealId: 's', at: '2026-09-25 12:50:00' } } }, inspection.THE_OFFICE)
  }
}

interface Answer {
  code: number
  said: Record<string, unknown>
}

async function supersede(run: string, by: string, headers = asAgent(THE_TEST_OFFICES_SECRETARY.handle)): Promise<Answer> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/superseded`,
    headers,
    payload: { by, because: 'The wave that holds this work was checked and merged.' },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** A refusal: 409, the words given, "Nothing was written.", and the run's data exactly as before. */
async function expectRefused(run: string, by: string, ...words: string[]): Promise<string> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const laterBefore = JSON.stringify(t.api.getRecord(by)!.data)
  const { code, said } = await supersede(run, by)
  expect(code, JSON.stringify(said)).toBe(409)
  const why = String(said['error'])
  for (const word of words) expect(why).toContain(word)
  expect(why).toContain('Nothing was written.')
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
  expect(JSON.stringify(t.api.getRecord(by)!.data)).toBe(laterBefore)
  return why
}

async function retire(handle: string): Promise<Answer> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers: AS_THE_PERSON,
    payload: { because: 'the piece of work is done' },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** A worker run and a wave run in one new repository, both sealed; the wave run not yet settled. */
async function aPair(name: string, worker = 'settled-worker'): Promise<{ run: string; later: string; repository: string; workerCommits: string[]; wave: string }> {
  const repository = aRepository()
  const branches = aWorkerAndAWave(repository, name)
  const run = await aSealedRun(worker, branches.worker)
  const later = await aSealedRun('wave-supervisor', branches.wave)
  return { run, later, repository, workerCommits: branches.workerCommits, wave: branches.wave }
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'settled-worker', name: 'Settled worker', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'retired-worker', name: 'Retired worker', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'wave-supervisor', name: 'Wave supervisor', role: 'supervisor', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'outsider', name: 'Outsider', role: 'worker', workArea: ['work'] })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('the starter settles a worker run by naming the merged wave run that holds its commits', () => {
  it('answers 201, writes how it was proved, and changes nothing else on either run', async () => {
    const { run, later, workerCommits, wave } = await aPair('settle')
    await settleTheLaterRun(later)
    const before = t.api.getRecord(run)!.data
    const laterBefore = t.api.getRecord(later)!.data

    const { code, said } = await supersede(run, later)
    expect(code, JSON.stringify(said)).toBe(201)
    expect((said['stands'] as Record<string, unknown>)['standing']).toBe('superseded')

    const after = t.api.getRecord(run)!.data
    const check = after['theCheck'] as Record<string, unknown>
    const mark = check['superseded'] as Record<string, unknown>
    expect(mark['by']).toBe(later)
    const contains = mark['contains'] as { how: string; laterCommit: string; commits: { commit: string; as: string }[] }
    expect(contains.how).toBe('same patches')
    expect(contains.laterCommit).toBe(git(wave, 'rev-parse', 'HEAD'))
    // EACH WORKER COMMIT IS PAIRED WITH THE WAVE'S CHERRY-PICK OF IT, which has a new hash.
    const picked = git(wave, 'log', '--reverse', '--format=%H', 'HEAD~2..HEAD').split('\n')
    expect(contains.commits).toEqual([
      { commit: workerCommits[0], as: picked[0] },
      { commit: workerCommits[1], as: picked[1] },
    ])
    expect(picked).not.toEqual(workerCommits)

    // NOTHING ELSE MOVED: every other field of the run, the rest of its check, and the whole later run.
    const { theCheck: checkAfter, ...restAfter } = after
    const { theCheck: checkBefore, ...restBefore } = before
    expect(restAfter).toEqual(restBefore)
    const { superseded: _mark, ...checkRest } = checkAfter as Record<string, unknown>
    expect(checkRest).toEqual(checkBefore)
    expect(t.api.getRecord(later)!.data).toEqual(laterBefore)
  })

  it('settles by ancestry when the worker commit is in the wave history', async () => {
    const repository = aRepository()
    const worker = aWorktree(repository, 'ancestor-worker')
    const only = commit(worker, 'a.txt', 'a from the worker\n', 'The worker changes a')
    const wave = aWorktree(repository, 'ancestor-wave', 'ancestor-worker')
    commit(wave, 'c.txt', 'c from the wave\n', 'The wave changes c')
    const run = await aSealedRun('settled-worker', worker)
    const later = await aSealedRun('wave-supervisor', wave)
    await settleTheLaterRun(later)

    const { code, said } = await supersede(run, later)
    expect(code, JSON.stringify(said)).toBe(201)
    const mark = (t.api.getRecord(run)!.data['theCheck'] as Record<string, unknown>)['superseded'] as Record<string, unknown>
    expect(mark['contains']).toEqual({ how: 'ancestor', laterCommit: git(wave, 'rev-parse', 'HEAD'), commits: [{ commit: only, as: only }] })
  })
})

describe('the retire door lets the worker go once its run is settled', () => {
  it('refuses the retire before, and lets the worker go after', async () => {
    const { run, later } = await aPair('retire', 'retired-worker')
    await settleTheLaterRun(later)

    const blocked = await retire('retired-worker')
    expect(blocked.code).toBe(409)
    expect(String(blocked.said['error'])).toContain(`run ${run}`)

    expect((await supersede(run, later)).code).toBe(201)

    const allowed = await retire('retired-worker')
    expect(allowed.code, JSON.stringify(allowed.said)).toBe(200)
  })
})

describe('each way it can fail is refused, naming what was missing, and nothing is written', () => {
  it('refuses a later run released by its starter rather than checked by an inspector', async () => {
    const { run, later } = await aPair('starter-released')
    await settleTheLaterRun(later, { released: BY_ITS_STARTER })
    await expectRefused(run, later, `is not on the same branch as run ${run}`, `Run ${later} was released by its starter, not checked by an inspector.`)
  })

  it('refuses a later run that was not released', async () => {
    const { run, later } = await aPair('unreleased')
    await settleTheLaterRun(later, { released: null })
    await expectRefused(run, later, `Run ${later} was not released.`)
  })

  it('refuses a later run whose report was not confirmed', async () => {
    const { run, later } = await aPair('unconfirmed')
    await settleTheLaterRun(later, { confirmed: false })
    await expectRefused(run, later, `Run ${later}'s report was not confirmed.`)
  })

  it('refuses a later run with no merge receipt', async () => {
    const { run, later } = await aPair('no-receipt')
    await settleTheLaterRun(later, { merged: null })
    await expectRefused(run, later, `Run ${later} was not merged: Run ${later} holds no merge receipt`)
  })

  it('refuses a later run whose merge entry is not merged', async () => {
    const { run, later } = await aPair('entry-submitted')
    await settleTheLaterRun(later, { merged: 'submitted' })
    await expectRefused(run, later, `Run ${later} was not merged:`, 'which is submitted, not merged.')
  })

  it('refuses a run that has no seal', async () => {
    const repository = aRepository()
    const { wave } = aWorkerAndAWave(repository, 'unsealed-run')
    const run = historicalSession(t, {
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'Synthetic unsealed run',
      actor: { type: 'agent', id: 'settled-worker' },
      data: { state: 'finished', servingAgent: 'settled-worker', workingDirectory: join(made, 'nowhere') },
    }).id
    const later = await aSealedRun('wave-supervisor', wave)
    await settleTheLaterRun(later)
    await expectRefused(run, later, `Run ${run} has no seal of git work.`)
  })

  it('refuses a later run that has no seal', async () => {
    const repository = aRepository()
    const { worker } = aWorkerAndAWave(repository, 'unsealed-later')
    const run = await aSealedRun('settled-worker', worker)
    const later = historicalSession(t, {
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'Synthetic unsealed wave run',
      actor: { type: 'agent', id: 'wave-supervisor' },
      data: { state: 'finished', servingAgent: 'wave-supervisor', workingDirectory: join(made, 'nowhere-else') },
    }).id
    await settleTheLaterRun(later)
    await expectRefused(run, later, `Run ${later} has no seal of git work.`)
  })

  it('refuses two runs sealed in different repositories, naming both', async () => {
    const one = aRepository()
    const { worker } = aWorkerAndAWave(one, 'two-repos-a')
    const other = aRepository()
    const { wave } = aWorkerAndAWave(other, 'two-repos-b')
    const run = await aSealedRun('settled-worker', worker)
    const later = await aSealedRun('wave-supervisor', wave)
    await settleTheLaterRun(later)
    await expectRefused(run, later, `Run ${run} was sealed in the repository`, `and run ${later} in the repository`, 'Commits can only be compared inside one repository.')
  })

  it('refuses when the repository both seals name cannot be read', async () => {
    const { run, later, repository } = await aPair('gone')
    await settleTheLaterRun(later)
    // THE CLONE IS GONE: its folder is moved away, inside the folder this file made.
    renameSync(repository, `${repository}-moved-away`)
    await expectRefused(run, later, 'Git could not read the repository')
  })

  it('refuses a commit the supervisor changed by hand, naming that commit', async () => {
    const repository = aRepository()
    const worker = aWorktree(repository, 'by-hand-worker')
    const first = commit(worker, 'a.txt', 'a from the worker\n', 'The worker changes a')
    const second = commit(worker, 'b.txt', 'b from the worker\n', 'The worker changes b')
    const wave = aWorktree(repository, 'by-hand-wave')
    commit(wave, 'c.txt', 'c from the wave\n', 'The wave changes c')
    git(wave, 'cherry-pick', first)
    // THE SECOND CHANGE IS MADE AGAIN BY HAND, with one word different, so its patch differs.
    commit(wave, 'b.txt', 'b from the supervisor\n', 'The worker changes b')
    const run = await aSealedRun('settled-worker', worker)
    const later = await aSealedRun('wave-supervisor', wave)
    await settleTheLaterRun(later)
    const why = await expectRefused(run, later, `${second.slice(0, 12)} "The worker changes b"`, 'A commit changed by hand has a different patch')
    expect(why).not.toContain(first.slice(0, 12))
  })
})

describe('only the starter or the proved person may settle a run', () => {
  it('refuses an agent that is neither', async () => {
    const { run, later } = await aPair('outsider')
    await settleTheLaterRun(later)
    const before = JSON.stringify(t.api.getRecord(run)!.data)
    const { code, said } = await supersede(run, later, asAgent('outsider'))
    expect(code).toBe(403)
    expect(String(said['error'])).toContain('is the act of its starter')
    expect(String(said['error'])).toContain('Nothing was written.')
    expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
  })

  it('refuses a person header from another machine that carried no key', async () => {
    const { run, later } = await aPair('unproved')
    await settleTheLaterRun(later)
    const before = JSON.stringify(t.api.getRecord(run)!.data)
    expect(() =>
      inspection.supersedeARun({
        runId: run,
        workspaceId: WORKSPACE,
        by: later,
        because: 'A claim in the owner’s name.',
        actor: { type: 'human', id: THE_PERSON, from: 'another machine' },
      }),
    ).toThrow(/is the act of its starter[\s\S]*Nothing was written\./)
    expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
  })

  it('accepts the person where the person is proved', async () => {
    const { run, later } = await aPair('proved')
    await settleTheLaterRun(later)
    const { code, said } = await supersede(run, later, AS_THE_PERSON)
    expect(code, JSON.stringify(said)).toBe(201)
  })
})
