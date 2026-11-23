// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Run boundaries decide attribution; the seal's fork-base range remains unchanged. */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let beforeSeal: typeof import('../src/server/lib/before-the-seal.ts')
let scratch = ''
let n = 0
const officeKey = randomBytes(32).toString('hex')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'boundary-worker' }
const office = { ...headers, 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': officeKey }
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'seal-own-commits-'))
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  beforeSeal = await import('../src/server/lib/before-the-seal.ts')
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'boundary-starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'boundary-starter' }, payload: { handle: 'boundary-worker', name: 'Synthetic worker', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

function repository() {
  const dir = join(scratch, `repository-${++n}`)
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic boundary fixture')
  git(dir, 'config', 'user.email', ['fixture', 'example.invalid'].join('@'))
  git(dir, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'work/base.txt'), 'base\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Baseline')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  return { dir, base }
}
function commit(dir: string, subject: string) {
  writeFileSync(join(dir, 'work', `change-${++n}.txt`), `${subject}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', subject)
  return git(dir, 'rev-parse', 'HEAD')
}
async function run(dir: string, previous?: string) {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: {
    kind: 'session', title: 'Synthetic boundary run', data: { state: 'running', servingAgent: 'boundary-worker', workingDirectory: dir, cutFrom: 'main' },
    ...(previous ? { links: [{ type: 'derived_from', toId: previous }] } : {}),
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  return filed.json<{ record: { id: string } }>().record.id
}
async function note(id: string) {
  const result = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, 'x-mole-office-session': id }, payload: { kind: 'note', title: 'Synthetic run note' } })
  expect(result.statusCode, result.body).toBe(201)
  return result.json<{ record: { id: string } }>().record.id
}
async function finish(id: string, submission?: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { state: 'finished', ...(submission ? { submission } : {}) } } })
}
async function end(id: string) {
  const result = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: office, payload: { dataPatch: { commandEnded: { at: '2026-11-22 10:00:00', code: 0 } } } })
  expect(result.statusCode, result.body).toBe(200)
  const observation = t.api.getRecord(id)!.data['endHead'] as { commit?: unknown; at?: unknown }
  expect(observation).toMatchObject({ commit: expect.any(String), at: expect.any(String) })
}
function countSeals(id: string) {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND json_extract(data, '$.seal.run') = ?").get(id) as { n: number }).n
}
/** A git finish over another run's commit is told the records write; a records finish over its own commit, the mixed one. */
const REFUSED_WITH = { records: 'sealHoldsCommitsNotTheRunsOwn', mixed: 'sealLeavesOutTheRunsOwnCommits' } as const
/** The codes of the fields only the office writes. */
const OFFICE_ONLY: Record<string, string> = { filingHead: 'onlyTheOfficeWritesTheFilingHead', endHead: 'onlyTheOfficeWritesTheEndHead' }
function namesCommitAndWrite(result: { statusCode: number; body: string }, id: string, hash: string, subject: string, kind: keyof typeof REFUSED_WITH) {
  expect(result.statusCode, result.body).toBe(409)
  const refused = JSON.parse(result.body) as { error: string; code: string }
  expect(refused.code).toBe(REFUSED_WITH[kind])
  expect(refused.error).toContain(hash)
  expect(refused.error).toContain(subject)
  expect(refused.error).toContain(`PATCH /api/records/${id} {"dataPatch":{"state":"finished","submission":{"kind":"${kind}"`)
  expect(countSeals(id)).toBe(0)
}

it('counts the continued run after a sealed predecessor and retains the original fork base', async () => {
  const { dir, base } = repository()
  const first = await run(dir)
  const b = commit(dir, 'First sealed work')
  expect((await finish(first, { kind: 'git' })).statusCode).toBe(200)
  const second = await run(dir, first)
  const c = commit(dir, 'Continued work')
  const record = await note(second)
  const refused = await finish(second, { kind: 'records', records: [record] })
  namesCommitAndWrite(refused, second, c, 'Continued work', 'mixed')
  expect(refused.body).not.toContain(b)
  const mixed = await finish(second, { kind: 'mixed', records: [record] })
  expect(mixed.statusCode, mixed.body).toBe(200)
  expect(seals.readRunSeal(second)?.seal.git).toMatchObject({ forkBase: base, commit: c })
})

it('includes an unsealed predecessor even when the continuation adds no commits', async () => {
  for (const kind of ['git', 'records'] as const) {
    const { dir, base } = repository()
    const first = await run(dir)
    const own = commit(dir, 'Unsealed predecessor work')
    await end(first)
    const second = await run(dir, first)
    const record = await note(second)
    const result = await finish(second, kind === 'git' ? { kind } : { kind, records: [record] })
    if (kind === 'git') {
      expect(result.statusCode, result.body).toBe(200)
      expect(seals.readRunSeal(second)?.seal.git).toMatchObject({ forkBase: base, commit: own })
    } else namesCommitAndWrite(result, second, own, 'Unsealed predecessor work', 'mixed')
  }
})

it('does not claim a later run’s commit when an ended run is finished later', async () => {
  const { dir, base } = repository()
  const first = await run(dir)
  await end(first)
  const later = await run(dir)
  const laterCommit = commit(dir, 'Later run work')
  expect(t.api.getRecord(first)!.data['endHead']).toMatchObject({ commit: base })
  const refused = await finish(first)
  namesCommitAndWrite(refused, first, laterCommit, 'Later run work', 'records')
  const record = await note(first)
  const done = await finish(first, { kind: 'records', records: [record] })
  expect(done.statusCode, done.body).toBe(200)
  expect(seals.readRunSeal(first)?.seal.git).toBeNull()
  expect(countSeals(later)).toBe(0)
})

it('preserves legacy behavior and refuses an unreadable end without writing', async () => {
  const legacy = repository()
  const old = await run(legacy.dir)
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.filingHead') WHERE id = ?").run(old)
  const oldCommit = commit(legacy.dir, 'Legacy work')
  const sealed = await finish(old, { kind: 'git' })
  expect(sealed.statusCode, sealed.body).toBe(200)
  expect(seals.readRunSeal(old)?.seal.git).toMatchObject({ forkBase: legacy.base, commit: oldCommit })

  const current = repository()
  const id = await run(current.dir)
  const before = t.api.getRecord(id)!.data
  renameSync(current.dir, `${current.dir}-moved`)
  const refused = await finish(id, { kind: 'git' })
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json<{ code: string }>().code).toBe('sealWorkingDirectoryUnread')
  expect(refused.json<{ error: string }>().error).toContain(current.dir)
  expect(t.api.getRecord(id)!.data).toEqual(before)
  expect(countSeals(id)).toBe(0)
})

it.each(['git', 'mixed', 'records'] as const)('keeps the first run’s fork base for %s', async (kind) => {
  const { dir, base } = repository()
  const id = await run(dir)
  const tip = kind === 'records' ? base : commit(dir, 'First run work')
  const records = kind === 'git' ? [] : [await note(id)]
  const result = await finish(id, { kind, ...(kind === 'git' ? {} : { records }) })
  expect(result.statusCode, result.body).toBe(200)
  const seal = seals.readRunSeal(id)!.seal
  expect(seal.kind).toBe(kind)
  if (kind === 'records') expect(seal.git).toBeNull()
  else expect(seal.git).toMatchObject({ forkBase: base, commit: tip })
})

it('names a patch from main as carried and does not judge it as new', async () => {
  const { dir, base } = repository()
  git(dir, 'switch', '-q', 'main')
  commit(dir, 'Other main work')
  const onMain = commit(dir, 'Patch already on main')
  git(dir, 'switch', '-q', 'worker')
  const id = await run(dir)
  git(dir, 'cherry-pick', onMain)
  const carried = git(dir, 'rev-parse', 'HEAD')
  const own = commit(dir, 'New work')
  const facts = beforeSeal.theFactsBeforeTheSealOf(t.api.getRecord(id)!)
  expect('commits' in facts.git && facts.git.commits.map((one) => one.commit)).toEqual([own])
  const result = await finish(id, { kind: 'git' })
  expect(result.statusCode, result.body).toBe(200)
  const seal = seals.readRunSeal(id)!.seal
  expect(seal.git).toMatchObject({ forkBase: base, commit: own })
  expect((seal as unknown as Record<string, unknown>)['carriedCommits']).toEqual(expect.arrayContaining([expect.objectContaining({ commit: carried, matches: onMain })]))
})


it('does not accept caller-written boundary observations or changes to a seal', async () => {
  const { dir, base } = repository()
  const fake = { commit: base, at: '2026-11-22 10:00:00' }
  for (const field of ['filingHead', 'endHead']) {
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'session', title: 'Synthetic forged boundary', data: { state: 'running', servingAgent: 'boundary-worker', workingDirectory: dir, [field]: fake } } })
    expect(filed.statusCode, filed.body).toBe(403)
    expect(filed.json<{ code: string }>().code).toBe(OFFICE_ONLY[field])
  }
  const id = await run(dir)
  const stored = t.api.getRecord(id)!.data
  expect(stored['filingHead']).toMatchObject({ commit: base, at: expect.any(String) })
  for (const field of ['filingHead', 'endHead']) {
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { [field]: fake } } })
    expect(changed.statusCode, changed.body).toBe(403)
    expect(changed.json<{ code: string }>().code).toBe(OFFICE_ONLY[field])
  }
  const replacement = { ...stored }
  delete replacement['filingHead']
  const removed = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { data: replacement, replace: true } })
  expect(removed.statusCode, removed.body).toBe(403)
  expect(removed.json<{ code: string }>().code).toBe('onlyTheOfficeWritesTheFilingHead')
  expect(t.api.getRecord(id)!.data).toEqual(stored)
  const done = await finish(id, { kind: 'git' })
  expect(done.statusCode, done.body).toBe(200)
  const seal = seals.readRunSeal(id)!
  const changedSeal = await app.inject({ method: 'PATCH', url: `/api/records/${seal.id}`, headers, payload: { dataPatch: { seal: { ...seal.seal, carriedCommits: [] } } } })
  expect(changedSeal.statusCode, changedSeal.body).toBe(403)
  expect(changedSeal.json<{ code: string }>().code).toBe('onlyTheOfficeWritesTheCarriedCommits')
})

it('names a commit carried from its worker’s seal and judges only the new commit', async () => {
  const { dir, base } = repository()
  const id = await run(dir)
  const elsewhere = join(scratch, `worker-tree-${++n}`)
  git(dir, 'worktree', 'add', '-q', '-b', `asked-${n}`, elsewhere, 'main')
  const worker = await run(elsewhere)
  const sealedByTheWorker = commit(elsewhere, 'Worker sealed work')
  expect((await finish(worker, { kind: 'git' })).statusCode).toBe(200)
  const workerSeal = seals.readRunSeal(worker)!.id
  // No door writes a started worker run without a launcher, so the entry is stored as the office keeps it.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.workerRuns', json(?)) WHERE id = ?").run(JSON.stringify({ 'boundary-worker': {
    state: 'started', askedAt: '2026-11-22 10:00:00', handle: 'boundary-worker',
    askedBy: { who: { kind: 'agent', id: 'boundary-worker' }, session: id },
    brief: { path: join(scratch, 'brief.md'), sha256: '0'.repeat(64), bytes: 1 },
    sandbox: { folder: scratch, instance: 'fixture', container: 'fixture' },
    started: { at: '2026-11-22 10:00:00', run: worker, runKeyId: 'synthetic-key' },
  } }), id)
  git(dir, 'cherry-pick', '-x', sealedByTheWorker)
  const carried = git(dir, 'rev-parse', 'HEAD')
  const own = commit(dir, 'New work after the worker')
  const facts = beforeSeal.theFactsBeforeTheSealOf(t.api.getRecord(id)!)
  expect('commits' in facts.git && facts.git.commits.map((one) => one.commit)).toEqual([own])
  const result = await finish(id, { kind: 'git' })
  expect(result.statusCode, result.body).toBe(200)
  const seal = seals.readRunSeal(id)!.seal
  expect(seal.git).toMatchObject({ forkBase: base, commit: own })
  expect((seal as unknown as Record<string, unknown>)['carriedCommits']).toEqual([{ commit: carried, matches: sealedByTheWorker, where: workerSeal }])
})

it('counts a commit cherry-picked into a new worktree as its own after the run moves', async () => {
  const { dir } = repository()
  const id = await run(dir)
  const first = commit(dir, 'Moved run work')
  git(dir, 'switch', '-q', 'main')
  const moved = commit(dir, 'Main moved on')
  git(dir, 'switch', '-q', 'worker')
  const second = join(scratch, `second-tree-${++n}`)
  git(dir, 'worktree', 'add', '-q', '-b', `second-${n}`, second, 'main')
  const changed = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { workingDirectory: second } } })
  expect(changed.statusCode, changed.body).toBe(200)
  git(second, 'cherry-pick', first)
  const picked = git(second, 'rev-parse', 'HEAD')
  const record = await note(id)
  namesCommitAndWrite(await finish(id, { kind: 'records', records: [record] }), id, picked, 'Moved run work', 'mixed')
  const result = await finish(id, { kind: 'git' })
  expect(result.statusCode, result.body).toBe(200)
  expect(seals.readRunSeal(id)?.seal.git).toMatchObject({ forkBase: moved, commit: picked })
})

it('does not take a later run’s commit for a run that never ended', async () => {
  const { dir } = repository()
  const first = await run(dir)
  const second = await run(dir)
  const laterCommit = commit(dir, 'Second run work')
  namesCommitAndWrite(await finish(first, { kind: 'git' }), first, laterCommit, 'Second run work', 'records')
  const record = await note(first)
  const done = await finish(first, { kind: 'records', records: [record] })
  expect(done.statusCode, done.body).toBe(200)
  expect(seals.readRunSeal(first)?.seal.git).toBeNull()
  expect(countSeals(second)).toBe(0)
})
