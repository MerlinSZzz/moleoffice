// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASED STATEMENT SETTLES A WORKER COMMIT WHOSE OWN LINES THE WAVE CHANGED. A decision, in a message
 * that chose option B as proposed, on the design of report aUYFiA68BGIz, block b-17,
 * point 2; wave 13k round 6, piece 2.
 *
 * The superseded door proves a later run holds a worker's commit by ancestry, the same patch or the same changed lines.
 * A wave that resolved a conflict inside a worker's commit changed its own lines, so none of the three finds it. A
 * wave's statement (a report with one table of the columns in src/shared/commit-statements.ts) names what each such
 * commit became; the door accepts it as a fourth proof only when an inspector's release covers the statement and git
 * agrees with every other line of it.
 *
 * WHAT IS MEASURED, on real git repositories this file makes in a temporary folder. Every record here is synthetic.
 * In each case a worker makes two commits: the first the wave cherry-picks unchanged, the second the wave makes again
 * with changes this case chooses; then the wave's branch lands on main (a fast-forward), unless the case says not.
 *
 *   · control: with no statement, today's three proofs refuse the changed commit;
 *   · a covered statement naming the file whose own line the wave changed settles it: 201, contains.how is "named by
 *     a released statement", it names the statement, and it pairs both commits;
 *   · refused: a statement no release covers (no release at all; a release naming another seal; a statement changed
 *     after its seal); a statement that leaves out a file where the worker's lines differ; one that names a file whose
 *     lines did not change; a commit it became that is not on main; damage in a file the statement does not name, as
 *     S1 (a file dropped) and S3 (a comparison inverted) of the report.
 *
 * MUTATIONS (wave 13k round 6), in `theStatementSettles` (src/server/lib/inspection.ts):
 *   M1 drop the check that the files where the lines differ are all named: the left-out, S1 and S3 cases turn green.
 *   M2 drop the release check: the uncovered cases turn green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, reduceASealAsMigration0154Did, type TestDb, theVerdictsApart, writeAVerdictAsItsDoorWould } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STATEMENT_COLUMNS } from '../src/shared/commit-statements.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'released-statement-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commitFiles(dir: string, files: Record<string, string | null>, subject: string): string {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) rmSync(join(dir, 'work', file), { force: true })
    else writeFileSync(join(dir, 'work', file), content)
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', subject)
  return git(dir, 'rev-parse', 'HEAD')
}

const BASELINE: Record<string, string> = {
  'a.txt': 'a before\n',
  'journal.json': '{\n  "when": 1\n}\n',
  'check.ts': 'export const allowed = (key: string, held: string): boolean => key === held\n',
  'notes.txt': 'notes before\n',
}
/** The worker's second commit: its own lines in three files. */
const WORKER_SECOND: Record<string, string> = {
  'journal.json': '{\n  "when": 28\n}\n',
  'check.ts': 'export const allowed = (key: string, held: string): boolean => key === held && key !== ""\n',
  'notes.txt': 'notes from the worker\n',
}

let repositories = 0
/**
 * A lane with a worker branch and a wave branch. The wave cherry-picks the worker's first commit, and makes the second
 * again from `waveSecond` (the worker's files with the wave's changes). Main fast-forwards to the wave after the wave's
 * run is sealed (`theRuns`), unless `landed` is false. Answers the lane, the two worktrees, the worker's two commits and
 * the commit the second became.
 */
function aLaneAndAWave(waveSecond: Record<string, string | null>, landed = true) {
  repositories += 1
  const lane = join(made, `lane-${String(repositories)}`)
  mkdirSync(join(lane, 'work'), { recursive: true })
  git(lane, 'init', '-q', '-b', 'main')
  git(lane, 'config', 'user.email', 'fixture@example.invalid')
  git(lane, 'config', 'user.name', 'Synthetic statement fixture')
  commitFiles(lane, BASELINE, 'Synthetic baseline')
  const worker = join(made, `worker-${String(repositories)}`)
  git(lane, 'worktree', 'add', '-q', '-b', `worker-${String(repositories)}`, worker, 'main')
  const first = commitFiles(worker, { 'a.txt': 'a from the worker\n' }, 'The worker changes a')
  const second = commitFiles(worker, WORKER_SECOND, 'The worker changes three files')
  const wave = join(made, `wave-${String(repositories)}`)
  git(lane, 'worktree', 'add', '-q', '-b', `wave-${String(repositories)}`, wave, 'main')
  git(wave, 'cherry-pick', first)
  const became = commitFiles(wave, waveSecond, 'The worker changes three files')
  return { lane, worker, wave, first, second, became, branch: `wave-${String(repositories)}`, landed }
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function aRun(handle: string, data: Record<string, unknown>): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(handle), payload: { kind: 'session', title: `Synthetic run of ${handle}`, data: { state: 'running', servingAgent: handle, ...data } } })
  expect(created.statusCode, created.body).toBe(201)
  return (created.json() as { record: { id: string } }).record.id
}
async function finish(handle: string, run: string, extra: Record<string, unknown> = {}): Promise<{ seal: string; hash: string }> {
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(handle, run), payload: { dataPatch: { state: 'finished', ...extra } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  return { seal, hash: (t.api.getRecord(seal)!.data['seal'] as { hash: string }).hash }
}
/** A fixture's write. A run's verdicts go through `writeAVerdictAsItsDoorWould`, since an ordinary write of them is refused. */
async function patch(run: string, dataPatch: Record<string, unknown>): Promise<void> {
  const { verdicts, rest } = theVerdictsApart(dataPatch)
  writeAVerdictAsItsDoorWould(t, run, verdicts)
  if (Object.keys(rest).length === 0) return
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { dataPatch: rest } })
  expect(reply.statusCode, reply.body).toBe(200)
}
const aRelease = (sealId: string, sealHash: string) => ({
  by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
  at: '2026-09-26 10:00:00',
  how: 'an inspector',
  read: { sealId, sealHash, worktree: '/synthetic/worktree', ofItsOwn: true, says: 'Synthetic: read the submission.' },
})

let entries = 0
/** The worker's sealed run, and the wave's run sealed, released by an inspector, confirmed and merged into `lane`. */
async function theRuns(fixture: ReturnType<typeof aLaneAndAWave>): Promise<{ run: string; later: string }> {
  const run = await aRun('statement-worker', { workingDirectory: fixture.worker, cutFrom: 'main' })
  await finish('statement-worker', run)
  const later = await aRun('wave-writer', { workingDirectory: fixture.wave, cutFrom: 'main' })
  const sealed = await finish('wave-writer', later)
  // THE WAVE LANDS AFTER IT WAS SEALED, as a merged wave does.
  if (fixture.landed) git(fixture.lane, 'merge', '-q', '--ff-only', fixture.branch)
  await patch(later, { released: aRelease(sealed.seal, sealed.hash), confirmed: { by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-26 10:10:00', because: 'Sound.' } })
  entries += 1
  const entry = door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry ${String(entries)}`,
      workspaceId: WORKSPACE,
      origin: 'fixture',
      data: { run: later, seal: { id: sealed.seal, hash: sealed.hash }, changeset: { adapter: 'git', root: fixture.lane, repository: 'r', branch: `wave-${String(entries)}`, commit: 'c', base: 'b' }, state: 'merged', submittedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle } },
      actor: inspection.THE_OFFICE,
    }),
  ).id
  t.api.patchRecord(later, { dataPatch: { integrated: { entry, mainBefore: 'm1', mainAfter: 'm2', rebasedTip: null, sealId: sealed.seal, at: '2026-09-26 10:20:00' } } }, inspection.THE_OFFICE)
  return { run, later }
}

/**
 * A statement naming `files` for the worker's second commit, filed by a statement run and sealed by its records
 * submission. `release` says what, if anything, releases that run: its own seal, another seal, or nothing.
 */
async function aStatement(run: string, second: string, became: string, files: string[], release: 'its seal' | 'its seal, before 0154' | 'another seal' | 'none'): Promise<string> {
  const writer = await aRun('wave-writer', {})
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('wave-writer', writer),
    payload: {
      kind: 'report',
      title: 'Synthetic statement of what a changed worker commit became',
      data: {
        for: THE_TEST_OFFICES_SECRETARY.handle,
        date: '2026-09-26',
        blocks: [{ id: 'b-1', type: 'table', columns: STATEMENT_COLUMNS.map((label) => ({ label })), rows: [{ cells: [run, second, became, files.join(', ')] }] }],
      },
    },
  })
  expect(created.statusCode, created.body).toBe(201)
  const statement = (created.json() as { record: { id: string } }).record.id
  const sealed = await finish('wave-writer', writer, { submission: { kind: 'records', records: [statement] } })
  if (release === 'its seal' || release === 'its seal, before 0154') await patch(writer, { released: aRelease(sealed.seal, sealed.hash) })
  // THE RELEASE WAS WRITTEN BEFORE MIGRATION 0154, which then re-hashed the seal and kept the hash the release names.
  if (release === 'its seal, before 0154') reduceASealAsMigration0154Did(t, sealed.seal)
  if (release === 'another seal') await patch(writer, { released: aRelease('SomeOtherSeal', sealed.hash) })
  return statement
}

async function supersede(run: string, by: string, statement?: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/superseded`,
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { by, because: 'The wave that holds this work was checked and merged.', ...(statement === undefined ? {} : { statement }) },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}
async function expectRefused(run: string, by: string, statement: string | undefined, ...words: string[]): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const { code, said } = await supersede(run, by, statement)
  expect(code, JSON.stringify(said)).toBe(409)
  for (const word of words) expect(String(said['error'])).toContain(word)
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
}

/** The wave's version of the second commit: the worker's, with the journal's own line changed (a conflict resolution). */
const JOURNAL_CHANGED = { ...WORKER_SECOND, 'journal.json': '{\n  "when": 32\n}\n' }

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'statement-worker', name: 'Statement worker', role: 'worker', workArea: ['work'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'wave-writer', name: 'Wave writer', role: 'supervisor', workArea: ['work'] })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('a released statement settles a worker commit the wave changed', () => {
  it('control: without a statement, the three proofs refuse the changed commit', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED)
    const { run, later } = await theRuns(fixture)
    await expectRefused(run, later, undefined, 'holds no commit with the same patch', 'The worker changes three files')
  })

  it('settles it with a covered statement naming the changed file, and contains.how names the statement', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED)
    const { run, later } = await theRuns(fixture)
    const statement = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'its seal')
    const { code, said } = await supersede(run, later, statement)
    expect(code, JSON.stringify(said)).toBe(201)
    const mark = (t.api.getRecord(run)!.data['theCheck'] as Record<string, any>)['superseded']
    expect(mark['contains']['how']).toBe('named by a released statement')
    expect(mark['contains']['statement']).toBe(statement)
    expect(mark['contains']['commits']).toEqual([
      { commit: fixture.first, as: expect.any(String) },
      { commit: fixture.second, as: fixture.became },
    ])
  })

  /**
   * A RELEASE WRITTEN BEFORE MIGRATION 0154 STILL COVERS ITS STATEMENT. Wave 13k round 7, the inspector's note on
   * piece 0: `theStatementSettles` reads the covering release through `howAReleaseNamesThisSeal`.
   * MUTATION: drop the `reduced.was` branch of `howAReleaseNamesThisSeal`; this case is refused with "No inspector's
   * release covers statement".
   */
  it('settles it with a statement whose release names the seal as it was before migration 0154', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED)
    const { run, later } = await theRuns(fixture)
    const statement = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'its seal, before 0154')
    const { code, said } = await supersede(run, later, statement)
    expect(code, JSON.stringify(said)).toBe(201)
    const mark = (t.api.getRecord(run)!.data['theCheck'] as Record<string, any>)['superseded']
    expect(mark['contains']['how']).toBe('named by a released statement')
    expect(mark['contains']['statement']).toBe(statement)
  })

  it('refuses a statement no release covers: no release, a release naming another seal, or one changed after its seal', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED)
    const { run, later } = await theRuns(fixture)
    const none = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'none')
    await expectRefused(run, later, none, `No inspector's release covers statement ${none}`)
    const other = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'another seal')
    await expectRefused(run, later, other, `No inspector's release covers statement ${other}`)
    const changed = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'its seal')
    t.api.patchRecord(changed, { dataPatch: { date: '2026-09-27' } }, { type: 'agent', id: 'wave-writer' })
    await expectRefused(run, later, changed, `No inspector's release covers statement ${changed}`)
  })

  it('refuses a statement that leaves out a file where the worker\'s lines differ', async () => {
    const fixture = aLaneAndAWave({ ...JOURNAL_CHANGED, 'notes.txt': 'notes changed by the wave\n' })
    const { run, later } = await theRuns(fixture)
    const statement = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'its seal')
    await expectRefused(run, later, statement, 'also differ in', 'work/notes.txt', 'does not name')
  })

  it('refuses a statement that names a file whose lines did not change', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED)
    const { run, later } = await theRuns(fixture)
    const statement = await aStatement(run, fixture.second, fixture.became, ['work/journal.json', 'work/notes.txt'], 'its seal')
    await expectRefused(run, later, statement, 'names work/notes.txt', 'did not change')
  })

  it('refuses a commit it became that is not on main', async () => {
    const fixture = aLaneAndAWave(JOURNAL_CHANGED, false)
    const { run, later } = await theRuns(fixture)
    const statement = await aStatement(run, fixture.second, fixture.became, ['work/journal.json'], 'its seal')
    await expectRefused(run, later, statement, 'which is not on main in')
  })

  it('refuses damage in a file the statement does not name: S1, a file dropped, and S3, a comparison inverted', async () => {
    const dropped = aLaneAndAWave({ ...JOURNAL_CHANGED, 'check.ts': null })
    const one = await theRuns(dropped)
    const s1 = await aStatement(one.run, dropped.second, dropped.became, ['work/journal.json'], 'its seal')
    await expectRefused(one.run, one.later, s1, 'also differ in', 'work/check.ts')
    const inverted = aLaneAndAWave({ ...JOURNAL_CHANGED, 'check.ts': WORKER_SECOND['check.ts']!.replace('key === held', 'key !== held') })
    const three = await theRuns(inverted)
    const s3 = await aStatement(three.run, inverted.second, inverted.became, ['work/journal.json'], 'its seal')
    await expectRefused(three.run, three.later, s3, 'also differ in', 'work/check.ts')
  })
})
