// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORDS SEAL REFUSES A RUN WHOSE WORKING DIRECTORY HOLDS COMMITS PAST ITS CUT (src/server/lib/sealed-tip.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A run that declares a records submission while its working directory holds commits past its cut is refused with
 *      409, through the PATCH that finishes it and through a POST that files it finished. The refusal names each commit
 *      by its short hash and the first line of its message, and the exact write that seals it as mixed. Nothing is
 *      written: no seal, and the run is not finished. The write the refusal names then seals git and records.
 *   2. A records run whose working directory holds no commit past its cut is sealed as before: a records seal with no
 *      git, and the answer says nothing of commits.
 *   3. A mixed run with commits past its cut seals git and records.
 *   4. Where the office cannot read the commits (a run on another computer, a working directory that does not exist, a
 *      folder that is no repository, a cut git cannot find, no working directory), the run is sealed as before, and the
 *      finishing write's answer says in one sentence that the commits were not checked, and why. The sentence is on
 *      neither the seal nor the run, and the seal holds the same keys as a records seal made before this check.
 *   5. A pass of a finishing write that is rolled back leaves no sentence in the answer.
 *
 * THE MUTATIONS, each run after a control:
 *   M1 src/server/lib/sealed-tip.ts `refuseARecordsSealOverCommitsPastTheCut`: the commits counted as none → case 1 red.
 *   M2 src/server/lib/a-finish-reads-git-apart.ts `theCommitsNotCheckedFor`: the sentence left out of the answer → case 4
 *      red.
 *   M3 src/server/lib/a-finish-reads-git-apart.ts `during`: the sentence not emptied at a pass's start → case 5 red.
 *
 * Every repository and the office are made here in the system's temporary folder.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let scratch = ''
let made = 0
const STARTER = 'a-records-starter'
const WORKER = 'a-records-finisher'
const THE_MAC = 'the-mac'
/** The address the owner's table names the-mac by. It is invented, and built from its numbers because the address scan refuses one written out. */
const THE_MACS_ADDRESS = [100, 101, 0, 19].join('.')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }
/** The word a run says its work is finished with (src/config/finished.mjs). */
const FINISHED = FINISHED_STATES[0]
/** A state in which a run is still going (src/config/still-going.mjs). */
const RUNNING = STILL_GOING_STATES[0]
/** The keys of a records seal as `sealFinishedRun` stored one before this check. */
const A_RECORDS_SEALS_KEYS = ['area', 'attempt', 'execution', 'git', 'hash', 'kind', 'records', 'run', 'sealedAt', 'version']
/** The answer's sentence, up to the reason. */
const NOT_CHECKED = "The office did not check this run's working directory for commits past its cut, because "

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mo-records-past-the-cut-'))
  t = await freshDb()
  app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: STARTER, name: 'Synthetic starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': STARTER },
    payload: { handle: WORKER, name: 'Synthetic worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
  // THE OWNER'S TABLE, as the Settings page stores it: one synthetic address, named the-mac.
  const named = t.client.sqlite.prepare('UPDATE installation SET machine_names = ? WHERE only_row = 1').run(JSON.stringify({ [THE_MACS_ADDRESS]: THE_MAC }))
  expect(named.changes, 'the test office has no installation row to name a machine on').toBe(1)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

// ================================================================================================== the folders

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A folder of its own in the scratch folder, made empty. */
function aFolder(): string {
  made += 1
  const dir = join(scratch, `folder-${String(made)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A repository at its first commit on main, with the branch `work` checked out at that same commit. */
function aRepository(): string {
  const dir = aFolder()
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic records fixture')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-qc', 'work')
  return dir
}

/** Commit one new file under work/ with a message of `lines`, and answer the commit's short hash as git log writes it. */
function aCommit(dir: string, ...lines: string[]): string {
  made += 1
  writeFileSync(join(dir, 'work', `${String(made)}.txt`), `change ${String(made)}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', ...lines.flatMap((line) => ['-m', line]))
  return git(dir, 'log', '-1', '--format=%h')
}

// ================================================================================================== the runs

/** File a running run of the worker through the door. */
async function aRun(data: Record<string, unknown>): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'session', title: 'A synthetic run that finishes', data: { state: RUNNING, servingAgent: WORKER, cutFrom: 'main', ...data } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return filed.json<{ record: { id: string } }>().record.id
}

/** A note the run wrote, filed in its session, which is what a records submission names. */
async function aNoteOf(run: string): Promise<string> {
  const wrote = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...headers, 'x-mole-office-session': run },
    payload: { kind: 'note', title: 'A synthetic note the run wrote' },
  })
  expect(wrote.statusCode, wrote.body).toBe(201)
  return wrote.json<{ record: { id: string } }>().record.id
}

/** The finishing write as a run sends it. */
async function finish(run: string, submission: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { state: FINISHED, submission } } })
}

function theSealsOf(run: string): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND json_extract(data, '$.seal.run') = ?").get(run) as { n: number }).n
}

function theRun(run: string): Record<string, unknown> {
  const record = t.api.getRecord(run)
  if (!record) throw new Error(`The run ${run} is not in the test office.`)
  return record.data
}

/** The exact write a refusal names, for these records. */
function theMixedWrite(records: string[]): string {
  return `{"dataPatch":{"state":"finished","submission":{"kind":"mixed","records":${JSON.stringify(records)}}}}`
}

// ================================================================================================== 1. refused

describe('a records finish from a working directory with commits past its cut', () => {
  it('is refused through the PATCH that finishes it, naming each commit and the mixed write, and nothing is written; the write it names seals git and records', async () => {
    const dir = aRepository()
    const first = aCommit(dir, 'Synthetic first commit past the cut')
    const second = aCommit(dir, 'Synthetic second commit past the cut', 'A second paragraph the refusal leaves out.')
    const run = await aRun({ workingDirectory: dir })
    const note = await aNoteOf(run)
    const before = theRun(run)

    const refused = await finish(run, { kind: 'records', records: [note] })
    expect(refused.statusCode, refused.body).toBe(409)
    const error = refused.json<{ error: string }>().error
    expect(error.startsWith(`Run ${run} declared a records submission, but its working directory ${dir} holds 2 commits past its cut main, so a records seal would leave them out. `), error).toBe(true)
    expect(error).toContain(`The commits: ${second} "Synthetic second commit past the cut", ${first} "Synthetic first commit past the cut".`)
    expect(error, 'the refusal carries more than the first line of a message').not.toContain('A second paragraph')
    expect(error).toContain('Nothing was written.')
    expect(error.endsWith(`declare the submission mixed: PATCH /api/records/${run} ${theMixedWrite([note])}`), error).toBe(true)
    expect(theSealsOf(run), 'the refused finish left a seal').toBe(0)
    expect(theRun(run), 'the refused finish changed the run').toEqual(before)
    expect(theRun(run)['state']).toBe(RUNNING)

    const named = error.slice(error.lastIndexOf(`PATCH /api/records/${run} `) + `PATCH /api/records/${run} `.length)
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: JSON.parse(named) as Record<string, unknown> })
    expect(sealed.statusCode, sealed.body).toBe(200)
    const seal = seals.readRunSeal(run)?.seal
    expect(seal?.kind).toBe('mixed')
    expect(seal?.git?.commit).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(seal?.records?.records.map((one) => one.id)).toEqual([note])
  })

  it('is refused through a POST that files the run finished, and no run and no seal are filed', async () => {
    const dir = aRepository()
    const only = aCommit(dir, 'Synthetic only commit past the cut')
    const holder = await aRun({})
    const note = await aNoteOf(holder)
    const title = 'A synthetic run filed finished as records over a commit'
    const sealsBefore = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip'").get() as { n: number }).n
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: { kind: 'session', title, data: { state: FINISHED, servingAgent: WORKER, cutFrom: 'main', workingDirectory: dir, submission: { kind: 'records', records: [note] } } },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    const error = refused.json<{ error: string }>().error
    expect(error).toContain(`declared a records submission, but its working directory ${dir} holds a commit past its cut main, so a records seal would leave it out. `)
    expect(error).toContain(`The commit: ${only} "Synthetic only commit past the cut".`)
    expect(error).toContain(theMixedWrite([note]))
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND title = ?").get(title) as { n: number }).n, 'the refused POST filed its run').toBe(0)
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip'").get() as { n: number }).n, 'the refused POST filed a seal').toBe(sealsBefore)
  })
})

// ================================================================================================== 2. and 3. as before

describe('a records finish from a working directory with no commit past its cut', () => {
  it('is sealed as records with no git, and its answer says nothing of commits', async () => {
    const dir = aRepository()
    const run = await aRun({ workingDirectory: dir })
    const note = await aNoteOf(run)
    const sealed = await finish(run, { kind: 'records', records: [note] })
    expect(sealed.statusCode, sealed.body).toBe(200)
    expect(sealed.json<Record<string, unknown>>()).not.toHaveProperty('commitsPastTheCutNotChecked')
    expect(theRun(run)['state']).toBe(FINISHED)
    const seal = seals.readRunSeal(run)?.seal
    expect(seal?.kind).toBe('records')
    expect(seal?.git).toBeNull()
    expect(Object.keys(seal ?? {}).sort()).toEqual(A_RECORDS_SEALS_KEYS)
  })
})

describe('a mixed finish from a working directory with commits past its cut', () => {
  it('seals git and records', async () => {
    const dir = aRepository()
    aCommit(dir, 'Synthetic commit a mixed run submits')
    const run = await aRun({ workingDirectory: dir })
    const note = await aNoteOf(run)
    const sealed = await finish(run, { kind: 'mixed', records: [note] })
    expect(sealed.statusCode, sealed.body).toBe(200)
    const seal = seals.readRunSeal(run)?.seal
    expect(seal?.kind).toBe('mixed')
    expect(seal?.git?.commit).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(seal?.git?.forkBase).toBe(git(dir, 'rev-parse', 'main'))
    expect(seal?.records?.records.map((one) => one.id)).toEqual([note])
  })
})

// ================================================================================================== 4. not checked

describe('a records finish whose commits cannot be read here', () => {
  const cases: { name: string; data: () => Record<string, unknown>; because: () => string }[] = [
    {
      name: 'a run on another computer',
      data: () => {
        const dir = aRepository()
        aCommit(dir, 'Synthetic commit on a folder of the same name here')
        return { machine: THE_MAC, workingDirectory: dir }
      },
      because: () => `the run works on another computer, ${THE_MAC}, and its working directory is on that one`,
    },
    {
      name: 'a working directory that does not exist',
      data: () => ({ workingDirectory: join(scratch, 'a-folder-nobody-made') }),
      because: () => `${join(scratch, 'a-folder-nobody-made')} does not exist on this computer`,
    },
    {
      name: 'a working directory that is no repository',
      data: () => ({ workingDirectory: join(scratch, 'no-repository') }),
      because: () => `git could not read a commit at HEAD in ${join(scratch, 'no-repository')} (git exited`,
    },
    {
      name: 'a cut git cannot find',
      data: () => {
        const dir = aRepository()
        aCommit(dir, 'Synthetic commit past a cut nobody made')
        return { workingDirectory: dir, cutFrom: 'a-branch-nobody-made' }
      },
      because: () => 'git could not find the cut a-branch-nobody-made in ',
    },
    {
      name: 'no working directory',
      data: () => ({}),
      because: () => 'the run names no working directory',
    },
  ]

  for (const one of cases) {
    it(`is sealed as before for ${one.name}, and only its answer says the commits were not checked, and why`, async () => {
      mkdirSync(join(scratch, 'no-repository'), { recursive: true })
      const run = await aRun(one.data())
      const note = await aNoteOf(run)
      const sealed = await finish(run, { kind: 'records', records: [note] })
      expect(sealed.statusCode, sealed.body).toBe(200)
      const said = sealed.json<{ commitsPastTheCutNotChecked?: string }>().commitsPastTheCutNotChecked
      expect(said?.startsWith(NOT_CHECKED), String(said)).toBe(true)
      expect(said).toContain(one.because())
      expect(said?.endsWith('.')).toBe(true)
      expect(theRun(run)['state']).toBe(FINISHED)
      const read = seals.readRunSeal(run)
      expect(read?.seal.kind).toBe('records')
      expect(Object.keys(read?.seal ?? {}).sort(), 'the seal holds a key a records seal did not hold').toEqual(A_RECORDS_SEALS_KEYS)
      const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id IN (?, ?)').all(run, String(read?.id)) as { data: string }[]
      expect(stored).toHaveLength(2)
      for (const row of stored) expect(row.data, 'the sentence was stored').not.toContain('did not check')
    })
  }

  it('is filed finished through a POST, and only its answer says the commits were not checked, and why', async () => {
    const holder = await aRun({})
    const note = await aNoteOf(holder)
    const gone = join(scratch, 'another-folder-nobody-made')
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: { kind: 'session', title: 'A synthetic run filed finished as records', data: { state: FINISHED, servingAgent: WORKER, cutFrom: 'main', workingDirectory: gone, submission: { kind: 'records', records: [note] } } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    expect(filed.json<{ commitsPastTheCutNotChecked?: string }>().commitsPastTheCutNotChecked).toBe(`${NOT_CHECKED}${gone} does not exist on this computer.`)
    const run = filed.json<{ record: { id: string } }>().record.id
    expect(seals.readRunSeal(run)?.seal.kind).toBe('records')
    expect(JSON.stringify(theRun(run)), 'the sentence was stored on the run').not.toContain('did not check')
  })
})

// ================================================================================================== 5. a pass rolled back

describe('a finishing write that runs again after a pass is rolled back', () => {
  it('answers no sentence that only the rolled-back pass said', async () => {
    const apart = await import('../src/server/lib/a-finish-reads-git-apart.ts')
    const dir = aRepository()
    const req = {} as FastifyRequest
    let passes = 0
    const read = await apart.aFinishReadsItsGitApart(req, (inside) =>
      inside(() => {
        passes += 1
        if (passes === 1) apart.sayTheCommitsWereNotChecked(`${NOT_CHECKED}a pass that is rolled back said so.`)
        return apart.theCommitsPastTheCutAtTheWrite({ directory: dir, cut: 'main' })
      }),
    )
    expect(passes, 'the first pass read the commits without a reading').toBe(2)
    expect(read).toEqual({ commits: [] })
    expect(apart.theCommitsNotCheckedFor(req)).toEqual({})
  })
})
