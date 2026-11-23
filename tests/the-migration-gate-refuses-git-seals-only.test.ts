// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MIGRATION GATE REFUSES GIT SEALS ONLY. By a decision and point 1 of a message, on Scope 7hJCvyqbez-2, as
 * reviewed, the fresh migration check runs at every git seal, and a records or files submission is not
 * one. Wave 14a round 1 (src/server/lib/before-the-seal.ts,
 * src/server/lib/records.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A run whose branch holds a bare migration prefix finishes with a records submission. Its first write is
 *      answered with the reminder, and the reminder names the migration item. The same write again is refused with 409,
 *      but not by this gate: commit B is past the run's cut, and a records seal would leave it out. The words name
 *      commit B and the mixed write that would seal it, and they do not name the migration item. The run is left as it
 *      was, running and with no seal.
 *   2. The same branch seals at once with a files submission sent with `remindBeforeTheSeal: false`. A records
 *      submission sent the same way is refused at once, in the words of 1.
 *   3. A run filed already finished with a records submission over the same branch is filed and sealed as records:
 *      commit B was there when the run was filed, so it is not the run's own commit.
 *   4. The gate is unchanged for the seals that do seal the branch: a write naming no submission, one naming git and
 *      one naming mixed are each refused over the prefix, with the item's own sentence and what to do, and the run is
 *      left as it was; a clean branch's git seal still seals.
 *
 * THE RECORDS ARE IN FORM WHERE THE RUN'S OWN KEY FINISHES. A fault of form is listed before the seal and never refused
 * by the hard gate (tests/a-fault-of-form-is-listed-not-refused.test.ts), so form is not what these claims test. Each run
 * whose own key finishes in 1, 2 and 4 still has a report in form linked about it, and a note a records seal carries still
 * has its label (tests/a-run-in-form.ts): what these claims prove is the migration item alone. The office's filing in 3
 * and the person's write in 4 need no report in form, and are left as they were.
 *
 * Every repository is made here in the system's temporary folder; every key is made up. The bare prefix is built at
 * runtime, so no comment and no literal in this file ever reads as one.
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aLabelFor, aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-that-keeps-its-gate'

/**
 * THE BARE MIGRATION PREFIX, BUILT AT RUNTIME. A literal quoted four-digit prefix and underscore in this file's source
 * would itself be an added line under tests/ in this run's own commits, so this run's reminder would name it and the
 * gate would refuse this run's own seal. The pieces below never read as a bare prefix in the source and always do at
 * runtime.
 */
const A_MIGRATION_PREFIX = ['02', '16_'].join('')
const THE_BARE_MIGRATION_FILE = 'tests/made-up-migration.test.ts'
const aLineNamingAMigrationByItsPrefix = (): string => `const before = migrationsBefore('${A_MIGRATION_PREFIX}')`

let t: TestDb
let app: FastifyInstance
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A made-up repository at commit A on main, with the worker branch checked out. */
function aMadeUpRepository(): { dir: string; a: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-gate-git-seals-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic gate test')
  git(dir, 'config', 'user.email', 'gate@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  return { dir, a }
}

/** Commit B on the worker branch, written after the run is filed: the run's own commit. */
function commitB(dir: string, options: { migration: boolean }): string {
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  if (options.migration) {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, THE_BARE_MIGRATION_FILE), `${aLineNamingAMigrationByItsPrefix()}\n`)
  } else {
    writeFileSync(join(dir, 'work/made-up.test.ts'), 'it("is made up", () => {})\n')
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return git(dir, 'rev-parse', 'HEAD')
}

/** File a running session for this tree through the door the launcher uses; the office mints its key in the same write. */
async function fileTheRun(dir: string, a: string, title: string): Promise<{ id: string; key: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  return { id: body.record.id, key }
}

/** A running run whose own commit B adds a test naming a migration by its bare prefix. */
async function aRunOverABarePrefix(title: string): Promise<{ id: string; key: string; dir: string; b: string }> {
  const { dir, a } = aMadeUpRepository()
  const run = await fileTheRun(dir, a, title)
  const b = commitB(dir, { migration: true })
  return { ...run, dir, b }
}

/** A running run whose own commit B is clean of any bare prefix. */
async function aCleanRun(title: string): Promise<{ id: string; key: string; dir: string; b: string }> {
  const { dir, a } = aMadeUpRepository()
  const run = await fileTheRun(dir, a, title)
  const b = commitB(dir, { migration: false })
  return { ...run, dir, b }
}

/** A tree whose commit B adds the prefix, for a run filed already finished after it. */
function aTreeWithABarePrefix(): { dir: string; b: string } {
  const { dir } = aMadeUpRepository()
  return { dir, b: commitB(dir, { migration: true }) }
}

/** A record the records submission can name: the seal captures the revisions of what it submits. */
function aNote(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'Synthetic note a records seal submits',
    data: { body: 'Made up.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

type ANamedItemInAReply = { key: string; about: string; says: string }
const theReminderOf = (body: string): { sealed: boolean; items: ANamedItemInAReply[] } => {
  const parsed = JSON.parse(body) as { beforeTheSeal?: { sealed: boolean; items: ANamedItemInAReply[] } }
  if (parsed.beforeTheSeal === undefined) throw new Error('the reply carried no reminder')
  return parsed.beforeTheSeal
}
const theMigrationItemsOf = (items: ANamedItemInAReply[]): ANamedItemInAReply[] => items.filter((one) => one.about === 'migration')

/** What a refused seal must leave behind: the run as it was, with no seal. */
function expectTheRunIsAsItWas(id: string, beforeTheWrite: { data: Record<string, unknown> }): void {
  const after = t.api.getRecord(id)!
  expect(after.data['state']).toBe(beforeTheWrite.data['state'])
  expect(after.data['tip']).toBe(beforeTheWrite.data['tip'])
  expect(after.data['sealedTip']).toBe(beforeTheWrite.data['sealedTip'])
  expect(after.data['theCheck']).toBeUndefined()
}

/**
 * A RECORDS FINISH OVER COMMIT B IS REFUSED BY THE COMMITS PAST ITS CUT, NOT BY THIS GATE: the words name commit B, the
 * run's own commit, by its full hash, and the mixed write that would seal it, and not the migration item. Returns the run
 * the words name.
 */
function expectTheCommitsPastTheCutRefuse(refused: { statusCode: number; body: string }, tree: { dir: string; b: string }, note: string): string {
  expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
  const error = (JSON.parse(refused.body) as { error: string }).error
  const run = /^Run (\S+) declared a records submission/.exec(error)?.[1]
  if (run === undefined) throw new Error(`the refusal names no run: ${error}`)
  expect(error).toContain(`so a records seal would leave it out: ${tree.b} "Synthetic commit B".`)
  expect(error).toContain(`PATCH /api/records/${run} ${JSON.stringify({ dataPatch: { state: 'finished', submission: { kind: 'mixed', records: [note] } } })}`)
  expect(error).not.toContain('names a migration by the bare prefix')
  return run
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a chapters line is read against the office's
  // chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the migration gate at a records or files seal', () => {
  it('1: a records submission over the bare prefix is refused by the commits past its cut, not by the gate, and the run is left as it was', async () => {
    const run = await aRunOverABarePrefix('Synthetic dirty run sealed as records')
    await aReportInForm(t, run.id, HANDLE)
    const note = aNote()
    await aLabelFor(note)
    const theWrite = { dataPatch: { state: 'finished', tip: run.b, submission: { kind: 'records', records: [note] } } }
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: theWrite })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const reminder = theReminderOf(first.body)
    expect(reminder.sealed).toBe(false)
    const migration = theMigrationItemsOf(reminder.items)
    expect(migration).toHaveLength(1)
    expect(t.api.getRecord(run.id)!.data['state']).toBe('running')

    const beforeTheWrite = t.api.getRecord(run.id)!
    const second = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: theWrite })
    expect(expectTheCommitsPastTheCutRefuse(second, run, note)).toBe(run.id)
    expectTheRunIsAsItWas(run.id, beforeTheWrite)
  })

  it('2: a files submission sent with remindBeforeTheSeal false seals at once over the bare prefix, and a records one is refused by the commits past its cut', async () => {
    const files = await aRunOverABarePrefix('Synthetic dirty run sealed as files')
    await aReportInForm(t, files.id, HANDLE)
    const staged = mkdtempSync(join(tmpdir(), 'mole-office-gate-files-'))
    directories.push(staged)
    writeFileSync(join(staged, 'made-up.txt'), 'made up\n')
    const byFiles = await app.inject({
      method: 'PATCH',
      url: `/api/records/${files.id}`,
      headers: asTheRun(files.id, files.key),
      payload: { dataPatch: { state: 'finished', submission: { kind: 'files', stagedAt: staged, root: files.dir } }, remindBeforeTheSeal: false },
    })
    expect(byFiles.statusCode, byFiles.body.slice(0, 800)).toBe(200)
    expect((byFiles.json() as { beforeTheSeal?: unknown }).beforeTheSeal).toBeUndefined()
    expect(t.api.getRecord(files.id)!.data['state']).toBe('finished')
    expect(t.api.getRecord(files.id)!.data['sealedTip']).toEqual(expect.any(String))

    const records = await aRunOverABarePrefix('Synthetic dirty run sealed as records without a reminder')
    await aReportInForm(t, records.id, HANDLE)
    const note = aNote()
    await aLabelFor(note)
    const beforeTheWrite = t.api.getRecord(records.id)!
    const byRecords = await app.inject({
      method: 'PATCH',
      url: `/api/records/${records.id}`,
      headers: asTheRun(records.id, records.key),
      payload: { dataPatch: { state: 'finished', submission: { kind: 'records', records: [note] } }, remindBeforeTheSeal: false },
    })
    expect(expectTheCommitsPastTheCutRefuse(byRecords, records, note)).toBe(records.id)
    expectTheRunIsAsItWas(records.id, beforeTheWrite)
  })

  it('3: a run filed already finished with a records submission over the prefix is sealed as records, since commit B was there when it was filed', async () => {
    const tree = aTreeWithABarePrefix()
    const note = aNote()
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OFFICE_WORKER,
      payload: {
        kind: 'session',
        title: 'Synthetic tree filed finished as records',
        data: {
          state: 'finished',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: HANDLE,
          doing: 'filed already finished',
          workingDirectory: tree.dir,
          cutFrom: 'main',
          tip: tree.b,
          submission: { kind: 'records', records: [note] },
          startedAt: localStamp(new Date(Date.now() - 30 * 60_000)),
        },
      },
    })
    expect(filed.statusCode, filed.body.slice(0, 800)).toBe(201)
    const named = (filed.json() as { record: { id: string } }).record.id
    expect(t.api.getRecord(named)?.data['state']).toBe('finished')
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND json_extract(data, '$.seal.run') = ? AND json_extract(data, '$.seal.kind') = 'records'").get(named) as { n: number }).n).toBe(1)
  })
})

describe('the migration gate at a git seal', () => {
  it('4: a submission naming none, git and mixed are each refused over the prefix; a clean branch seals', async () => {
    // NAMING NO SUBMISSION, read as git: the run's own key is reminded first, and the same write again is refused.
    const implicit = await aRunOverABarePrefix('Synthetic dirty run sealed as git')
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${implicit.id}`, headers: asTheRun(implicit.id, implicit.key), payload: { dataPatch: { state: 'finished', tip: implicit.b } } })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const migration = theMigrationItemsOf(theReminderOf(first.body).items)
    expect(migration).toHaveLength(1)
    const beforeTheWrite = t.api.getRecord(implicit.id)!
    const refused = await app.inject({ method: 'PATCH', url: `/api/records/${implicit.id}`, headers: asTheRun(implicit.id, implicit.key), payload: { dataPatch: { state: 'finished', tip: implicit.b } } })
    expect(refused.statusCode, refused.body.slice(0, 800)).toBe(409)
    expect((refused.json() as { error: string }).error).toContain(`${THE_BARE_MIGRATION_FILE}:1 names a migration by the bare prefix`)
    expectTheRunIsAsItWas(implicit.id, beforeTheWrite)

    // NAMING GIT, sent the launcher's way.
    const explicitGit = await aRunOverABarePrefix('Synthetic dirty run naming git')
    const refusedGit = await app.inject({
      method: 'PATCH',
      url: `/api/records/${explicitGit.id}`,
      headers: asTheRun(explicitGit.id, explicitGit.key),
      payload: { dataPatch: { state: 'finished', tip: explicitGit.b, submission: { kind: 'git' } }, remindBeforeTheSeal: false },
    })
    expect(refusedGit.statusCode, refusedGit.body.slice(0, 800)).toBe(409)
    expect(t.api.getRecord(explicitGit.id)!.data['state']).toBe('running')

    // NAMING MIXED, sent by the person and not the run's own key.
    const mixed = await aRunOverABarePrefix('Synthetic dirty run naming mixed')
    const refusedMixed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${mixed.id}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { state: 'finished', tip: mixed.b, submission: { kind: 'mixed', records: [aNote()] } } },
    })
    expect(refusedMixed.statusCode, refusedMixed.body.slice(0, 800)).toBe(409)
    expect(t.api.getRecord(mixed.id)!.data['state']).toBe('running')

    // A CLEAN BRANCH'S GIT SEAL STILL SEALS.
    const clean = await aCleanRun('Synthetic clean run sealed as git')
    await aReportInForm(t, clean.id, HANDLE)
    const sealed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${clean.id}`,
      headers: asTheRun(clean.id, clean.key),
      payload: { dataPatch: { state: 'finished', tip: clean.b }, remindBeforeTheSeal: false },
    })
    expect(sealed.statusCode, sealed.body.slice(0, 800)).toBe(200)
    expect(t.api.getRecord(clean.id)!.data['state']).toBe('finished')
    expect(t.api.getRecord(clean.id)!.data['sealedTip']).toEqual(expect.any(String))
  })
})
