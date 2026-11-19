// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** An unsealed round reads its git off the request thread and writes one account. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aRepository, asAgent, git, theOfficesCheckers } from './a-seal-read-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKER = 'a-worker-whose-round-ends'
const OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }
let t: TestDb
let app: FastifyInstance
let folder = ''
let count = 0
let apart: typeof import('../src/server/lib/the-seal-read-apart.ts')
let sealedTip: typeof import('../src/server/lib/sealed-tip.ts')

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'round-git-apart-'))
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await theOfficesCheckers(app)
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle: WORKER, name: WORKER, role: 'worker', workArea: ['work'] } })
  expect(made.statusCode, made.body).toBe(201)
  apart = await import('../src/server/lib/the-seal-read-apart.ts')
  sealedTip = await import('../src/server/lib/sealed-tip.ts')
}, 60_000)
afterEach(() => vi.restoreAllMocks())
afterAll(async () => { await app?.close(); t?.close(); if (folder) rmSync(folder, { recursive: true, force: true }) })

function aRun(): string {
  const dir = aRepository(join(folder, `repository-${++count}`))
  git(dir, 'switch', '-qc', 'worker')
  const run = t.api.createRecord({ kind: 'session', title: 'A round with a commit', workspaceId: 'default', actor: OFFICE, data: { state: 'running', servingAgent: WORKER, workingDirectory: dir, cutFrom: 'main', sandbox: { template: 'test', container: 'test', folder: dir } } }).id
  const report = t.api.createRecord({ kind: 'report', title: 'A report of the round', workspaceId: 'default', actor: OFFICE, data: { blocks: [{ id: 'one', type: 'text', text: 'The work is recorded.' }] } }).id
  t.api.createLink({ fromId: report, toId: run, type: 'about', actor: OFFICE })
  writeFileSync(join(dir, 'work', 'kept.txt'), 'A later commit.\n')
  git(dir, 'commit', '-qam', 'A later commit')
  return run
}
const ended = { at: '2026-11-18 18:00:00', code: 0 }
const data = (id: string) => t.api.getRecord(id)!.data
const accountOf = (id: string) => data(id).howTheRoundEnded as { state: string; says: string; reasons: { why: string }[] } | undefined
const pending = (id: string) => accountOf(id)?.reasons.some((reason) => reason.why === 'git-being-read') === true
const lines = (id: string) => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = 'A round ended without a seal'").get(id) as { n: number }).n

it('keeps the first end while its git is read apart, and tells the starter once', async () => {
  const run = aRun()
  const capture = vi.spyOn(sealedTip, 'captureGit')
  const original = apart.readTheFinishApart
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const read = vi.spyOn(apart, 'readTheFinishApart').mockImplementation(async (ask) => { await gate; return original(ask) })
  try {
    t.api.patchRecord(run, { dataPatch: { commandEnded: ended, detail: 'The command ended.' } }, OFFICE)
    expect(capture).not.toHaveBeenCalled()
    expect(pending(run)).toBe(true)
    await vi.waitFor(() => expect(read).toHaveBeenCalled(), { timeout: 20_000 })
    t.api.patchRecord(run, { dataPatch: { state: 'crashed', detail: 'The later crash.' } }, OFFICE)
    expect(pending(run)).toBe(true)
    release()
    await vi.waitFor(() => expect(pending(run)).toBe(false), { timeout: 30_000 })
    const account = data(run).howTheRoundEnded as { state: string; says: string; reasons: { why: string }[] }
    expect(account.state).toBe('running')
    expect(account.says).toContain('The command ended.')
    expect(account.says).not.toContain('The later crash.')
    expect(account.reasons.map((one) => one.why)).not.toContain('no-commits')
    expect(account.reasons.map((one) => one.why)).not.toContain('commits-not-known')
    expect(lines(run)).toBe(1)
  } finally { release() }
}, 60_000)

it('files a problem when the apart read fails', async () => {
  const run = aRun()
  vi.spyOn(apart, 'readTheFinishApart').mockRejectedValueOnce(new Error('A made-up thread failure.'))
  t.api.patchRecord(run, { dataPatch: { state: 'orphaned' } }, OFFICE)
  const problems = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records r JOIN links l ON l.from_id = r.id WHERE r.kind = 'problem' AND l.type = 'about' AND l.to_id = ? AND r.deleted_at IS NULL").get(run) as { n: number }).n
  await vi.waitFor(() => expect(problems()).toBe(1), { timeout: 30_000 })
  expect(pending(run)).toBe(true)
}, 60_000)

it('files a problem if the ending revision is missing', async () => {
  const run = aRun()
  const original = apart.readTheFinishApart
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const read = vi.spyOn(apart, 'readTheFinishApart').mockImplementation(async (ask) => { await gate; return original(ask) })
  try {
    t.api.patchRecord(run, { dataPatch: { commandEnded: ended } }, OFFICE)
    const pending = t.client.sqlite.prepare("SELECT MAX(seq) AS seq FROM revisions WHERE record_id = ? AND json_extract(data, '$.howTheRoundEnded') IS NULL").get(run) as { seq: number }
    expect(pending.seq).toEqual(expect.any(Number))
    await vi.waitFor(() => expect(read).toHaveBeenCalled(), { timeout: 20_000 })
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ? AND seq = ?').run(run, pending.seq)
  } finally { release() }
  const problems = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records r JOIN links l ON l.from_id = r.id WHERE r.kind = 'problem' AND l.type = 'about' AND l.to_id = ? AND r.deleted_at IS NULL").get(run) as { n: number }).n
  await vi.waitFor(() => expect(problems()).toBe(1), { timeout: 30_000 })
  expect(pending(run)).toBe(true)
}, 60_000)

it.each(['account', 'seal'] as const)('writes no second account or line if a %s wins the race', async (winner) => {
  const run = aRun()
  const original = apart.readTheFinishApart
  let release!: () => void
  let completed!: () => void
  const completedRead = new Promise<void>((resolve) => { completed = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  const read = vi.spyOn(apart, 'readTheFinishApart').mockImplementation(async (ask) => { await gate; try { return await original(ask) } finally { completed() } })
  try {
    t.api.patchRecord(run, { dataPatch: { commandEnded: ended } }, OFFICE)
    await vi.waitFor(() => expect(read).toHaveBeenCalled(), { timeout: 20_000 })
    expect(pending(run)).toBe(true)
    if (winner === 'account') {
      const records = await import('../src/server/lib/records.ts')
      records.writeHowTheRoundEnded(run, { sealed: true }, OFFICE)
    } else {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sealedTip', 'a-made-up-seal') WHERE id = ?").run(run)
    }
  } finally { release() }
  await completedRead
  await new Promise((resolve) => setImmediate(resolve))
  if (winner === 'account') expect(data(run).howTheRoundEnded).toEqual({ sealed: true })
  else expect(pending(run)).toBe(true)
  expect(lines(run)).toBe(0)
}, 60_000)

it('schedules no read when the outer transaction fails', async () => {
  const run = aRun()
  const capture = vi.spyOn(sealedTip, 'captureGit')
  const read = vi.spyOn(apart, 'readTheFinishApart')
  expect(() => t.client.sqlite.transaction(() => {
    t.api.patchRecord(run, { dataPatch: { state: 'orphaned' } }, OFFICE)
    throw new Error('A made-up rollback.')
  })()).toThrow('A made-up rollback.')
  await new Promise((resolve) => setImmediate(resolve))
  expect(capture).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(data(run).state).toBe('running')
}, 60_000)
