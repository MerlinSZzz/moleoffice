// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT NEVER SAID ITS WORK WAS FINISHED IS CLOSED AS SUPERSEDED ONCE ITS PROCESS HAS ENDED. Problem
 * `FuHKnNDBzrXW`.
 *
 * A worker's run can end without ever saying it is finished, while its commits reach a wave that is checked and merged.
 * Before this, POST /api/checks/<run>/superseded answered 400 for such a run: the door wrote the mark into the run's
 * `theCheck`, and the session kind refuses a `theCheck` without the fields of a check that was asked for. Now the door
 * writes the mark on the run itself when the run holds no check, reads the run's commits from its working directory
 * because no seal holds them, and closes the run only once its process has ended. Every proof asked of the later run
 * is the one the door already asked.
 *
 * WHAT IS MEASURED, on a real git repository this file makes in a temporary folder:
 *
 *   · a running run with no check, whose starting run has ended, is closed as superseded by a later run on another
 *     branch that was released by an inspector, confirmed and merged, and holds the same patches. The mark is on the
 *     run itself, no `theCheck` is invented, and the run's reading, `howARunStands` and GET /api/checks/<run> all
 *     name the later run;
 *   · the door refuses such a run while a process registered under it is still running, and while nothing says its
 *     process has ended, and writes nothing;
 *   · the door refuses such a run when the later run was not confirmed, and writes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control, each restored byte-identical
 * ---------------------------------------------------------------------------------------
 *
 *   M1 `supersedeARun` (src/server/lib/inspection.ts): write the mark into `theCheck` on every run, as before. The
 *      closing case goes red (the session kind answers 400).
 *   M2 `checkSupersedingARun`: skip the process check (`if (!stands.saidFinished)` read as `if (false)`). Both
 *      process cases go red (the door answers 201).
 *   M3 `theLaterRunHoldsThisRun`: drop the `confirmed === null` line. The not-confirmed case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, writeAVerdictAsItsDoorWould } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { howARunStands } from '../src/shared/releasing.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let resources: typeof import('../src/server/lib/resources.ts')

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
const made = mkdtempSync(join(tmpdir(), 'never-finished-'))
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
/**
 * A new repository with one baseline commit on main; a worker branch with two commits; and a wave branch that makes
 * its own commit first and then cherry-picks both, so the wave's commits carry the same patches under new hashes.
 */
function aWorkerAndAWave(): { worker: string; wave: string; workerCommits: string[] } {
  repositories += 1
  const repository = join(made, `repo-${String(repositories)}`)
  mkdirSync(join(repository, 'work'), { recursive: true })
  git(repository, 'init', '-b', 'main')
  git(repository, 'config', 'user.email', 'fixture@example.invalid')
  git(repository, 'config', 'user.name', 'Synthetic never-finished fixture')
  for (const name of ['a', 'b', 'c']) writeFileSync(join(repository, 'work', `${name}.txt`), `${name} before\n`)
  git(repository, 'add', '.')
  git(repository, 'commit', '-m', 'Synthetic baseline')
  const worker = join(made, `worker-${String(repositories)}`)
  git(repository, 'worktree', 'add', '-b', `worker-${String(repositories)}`, worker, 'main')
  const first = commit(worker, 'a.txt', 'a from the worker\n', 'The worker changes a')
  const second = commit(worker, 'b.txt', 'b from the worker\n', 'The worker changes b')
  const wave = join(made, `wave-${String(repositories)}`)
  git(repository, 'worktree', 'add', '-b', `wave-${String(repositories)}`, wave, 'main')
  commit(wave, 'c.txt', 'c from the wave\n', 'The wave changes c')
  git(wave, 'cherry-pick', first, second)
  return { worker, wave, workerCommits: [first, second] }
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A session record filed through the record door, as the agent it serves unless `filedBy` names its filer. */
async function aRun(handle: string, data: Record<string, unknown>, filedBy = handle): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(filedBy),
    payload: { kind: 'session', title: `Synthetic run of ${handle}`, data: { servingAgent: handle, ...data } },
  })
  expect(created.statusCode, created.body).toBe(201)
  return (created.json() as { record: { id: string } }).record.id
}

/** A run finished through the real finish door, so the office seals its git work. */
async function aSealedRun(handle: string, directory: string): Promise<string> {
  const id = await aRun(handle, { state: 'running', workingDirectory: directory, cutFrom: 'main' })
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent(handle), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  expect(t.api.getRecord(id)!.data['sealedTip'], 'the finish sealed the run').toBeTruthy()
  return id
}

const BY_AN_INSPECTOR = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-27 23:00:00', how: 'an inspector' as const }
const A_CONFIRMATION = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-27 23:05:00', because: 'The report is sound.' }

/** The later run released by an inspector, confirmed unless asked not to, and merged, as their doors write them. */
function settleTheLaterRun(later: string, confirmed = true): void {
  writeAVerdictAsItsDoorWould(t, later, { released: BY_AN_INSPECTOR, ...(confirmed ? { confirmed: A_CONFIRMATION } : {}) })
  const seal = String(t.api.getRecord(later)!.data['sealedTip'])
  const entry = door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry of ${later}`,
      workspaceId: WORKSPACE,
      origin: 'fixture',
      data: {
        run: later,
        seal: { id: seal, hash: 'h' },
        changeset: { adapter: 'git', root: made, repository: 'r', branch: 'wave', commit: 'c', base: 'b' },
        state: 'merged',
        submittedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
      },
      actor: inspection.THE_OFFICE,
    }),
  ).id
  t.api.patchRecord(later, { dataPatch: { integrated: { entry, mainBefore: 'm1', mainAfter: 'm2', rebasedTip: null, sealId: 's', at: '2026-09-27 23:09:00' } } }, inspection.THE_OFFICE)
}

/**
 * A worker run that never said it was finished, working in `worker`, started by a run whose state is `starterState`,
 * and a sealed wave run holding its commits. The wave run is not settled yet.
 */
async function aNeverFinishedRunAndItsWave(starterState: 'finished' | 'running'): Promise<{ run: string; later: string; worker: string; wave: string; workerCommits: string[] }> {
  const branches = aWorkerAndAWave()
  const starter = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic starting run',
    workspaceId: WORKSPACE,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'wave-supervisor' },
    actor: inspection.THE_OFFICE,
  }).id
  if (starterState === 'finished') t.api.patchRecord(starter, { dataPatch: { state: 'crashed' } }, inspection.THE_OFFICE)
  // THE SECRETARY FILES THE WORKER'S RUN UNDER THE SUPERVISOR'S RUN, as it does with tools/register-a-run.mjs --parent. The secretary
  // started the supervisor, so it may name that run as the parent (problem NlOyicZP_Jjt).
  const run = await aRun('settled-worker', { state: 'running', workingDirectory: branches.worker, cutFrom: 'main', parentAttachment: starter }, THE_TEST_OFFICES_SECRETARY.handle)
  const later = await aSealedRun('wave-supervisor', branches.wave)
  return { run, later, ...branches }
}

interface Answer {
  code: number
  said: Record<string, unknown>
}

async function supersede(run: string, by: string): Promise<Answer> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/superseded`,
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { by, because: 'The wave that holds this work was checked and merged.' },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** A refusal: 409, the words given, "Nothing was written.", and both runs' data exactly as before. */
async function expectRefused(run: string, by: string, ...words: string[]): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const laterBefore = JSON.stringify(t.api.getRecord(by)!.data)
  const { code, said } = await supersede(run, by)
  expect(code, JSON.stringify(said)).toBe(409)
  const why = String(said['error'])
  for (const word of words) expect(why).toContain(word)
  expect(why).toContain('Nothing was written.')
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
  expect(JSON.stringify(t.api.getRecord(by)!.data)).toBe(laterBefore)
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  resources = await import('../src/server/lib/resources.ts')
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'settled-worker', name: 'Settled worker', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'wave-supervisor', name: 'Wave supervisor', role: 'supervisor', workArea: ['work'] })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('a running run with no check, whose process has ended, is closed as superseded', () => {
  it('writes the mark on the run itself, invents no check, and every reading names the later run', async () => {
    const { run, later, worker, wave, workerCommits } = await aNeverFinishedRunAndItsWave('finished')
    settleTheLaterRun(later)
    expect(t.api.getRecord(run)!.data['theCheck'], 'the run holds no check before').toBeUndefined()
    const before = t.api.getRecord(run)!.data
    const laterBefore = t.api.getRecord(later)!.data

    const { code, said } = await supersede(run, later)
    expect(code, JSON.stringify(said)).toBe(201)
    expect((said['stands'] as Record<string, unknown>)['standing']).toBe('superseded')

    // THE MARK IS ON THE RUN ITSELF, and no theCheck was invented for a check nobody asked for.
    const after = t.api.getRecord(run)!.data
    expect(after['theCheck']).toBeUndefined()
    const mark = after['superseded'] as Record<string, unknown>
    expect(mark['by']).toBe(later)
    const picked = git(wave, 'log', '--reverse', '--format=%H', 'HEAD~2..HEAD').split('\n')
    expect(mark['contains']).toEqual({
      how: 'same patches',
      laterCommit: git(wave, 'rev-parse', 'HEAD'),
      commits: [
        { commit: workerCommits[0], as: picked[0] },
        { commit: workerCommits[1], as: picked[1] },
      ],
      readFromItsWorkingDirectory: { directory: worker, forkBase: git(worker, 'merge-base', 'HEAD', 'main'), commit: workerCommits[1] },
    })

    // NOTHING ELSE MOVED on either run.
    const { superseded: _mark, ...restAfter } = after
    expect(restAfter).toEqual(before)
    expect(t.api.getRecord(later)!.data).toEqual(laterBefore)

    // THE RUN'S OWN READING, the shared reader, and GET /api/checks/<run> all name the later run.
    const stands = howARunStands(after)
    expect(stands.standing).toBe('superseded')
    expect(stands.superseded?.by).toBe(later)
    expect(stands.says).toContain(`Superseded by run ${later}`)
    expect(stands.waitingFor).toBeNull()
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const readStands = (read.json() as { stands: { standing: string; says: string } }).stands
    expect(readStands.standing).toBe('superseded')
    expect(readStands.says).toContain(`Superseded by run ${later}`)
  })
})

describe('the door still refuses a run whose process has not ended', () => {
  it('refuses while a process registered under the run is still running, and writes nothing', async () => {
    const { run, later } = await aNeverFinishedRunAndItsWave('finished')
    settleTheLaterRun(later)
    // THIS TEST'S OWN PROCESS, which is running for as long as the test is, registered under the run.
    resources.registerResource({ workspaceId: WORKSPACE, sessionRecordId: run, type: 'process', key: String(process.pid), actor: inspection.THE_OFFICE })
    await expectRefused(run, later, `Run ${run} has not said its work is finished`, `process ${String(process.pid)}, registered under it, is still running`)
  })

  it('refuses while nothing says its process has ended, and writes nothing', async () => {
    const { run, later } = await aNeverFinishedRunAndItsWave('running')
    settleTheLaterRun(later)
    await expectRefused(run, later, `Run ${run} has not said its work is finished`, 'nothing says its process has ended')
  })
})

describe('the door still asks the later run to be released and confirmed', () => {
  it('refuses when the later run was not confirmed, and writes nothing', async () => {
    const { run, later } = await aNeverFinishedRunAndItsWave('finished')
    settleTheLaterRun(later, false)
    await expectRefused(run, later, `Run ${later}'s report was not confirmed.`)
  })
})
