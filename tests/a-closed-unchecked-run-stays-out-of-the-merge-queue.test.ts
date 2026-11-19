// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic ended checks cannot enter or supply a verdict to the merge queue. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { MERGE_STATES, MERGE_STATE_SPECS, type MergeState } from '../src/shared/merge-queue.ts'

let t: TestDb
let app: FastifyInstance
let root: string
let inspection: typeof import('../src/server/lib/inspection.ts')
let queue: typeof import('../src/server/lib/merge-queue.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let machine: typeof import('../src/server/lib/merge-state-machine.ts')
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const check = { askedAt: '2026-09-26 09:00:00', checkout: {}, says: 'Synthetic check waiting.' }
const because = 'Synthetic: the old check will not run.'
const made: string[] = []
function git(...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim() }
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  inspection = await import('../src/server/lib/inspection.ts')
  queue = await import('../src/server/lib/merge-queue.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  machine = await import('../src/server/lib/merge-state-machine.ts')
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'unchecked-queue-worker', name: 'Synthetic queue worker', role: 'worker', workArea: ['work'] } })
  expect(registered.statusCode).toBe(201)
  mkdirSync('.logs', { recursive: true }); root = mkdtempSync(join(process.cwd(), '.logs', 'unchecked-queue-')); made.push(root)
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic unchecked fixture')
  mkdirSync(join(root, 'work')); writeFileSync(join(root, 'work', 'a.txt'), 'before\n'); git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'worker'); writeFileSync(join(root, 'work', 'a.txt'), 'after\n'); git('add', '.'); git('commit', '-q', '-m', 'Synthetic work')
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'synthetic-unchecked', root, actor: person })
})
afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })
function run() {
  const record = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic queue run', origin: 'fixture', actor: person,
    data: { state: 'running', servingAgent: 'unchecked-queue-worker', workingDirectory: root, cutFrom: 'main', theCheck: check } })
  t.api.patchRecord(record.id, { dataPatch: { state: 'finished' } }, person)
  return record.id
}
function close(id: string) { return inspection.closeARunUnchecked({ runId: id, workspaceId: 'default', because, actor: person }) }
function corpus() { return JSON.stringify(['records', 'changes', 'revisions', 'links'].map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())) }
function entry(id: string, state: MergeState, extra: Record<string, unknown> = {}) {
  const sealId = t.api.getRecord(id)!.data.sealedTip as string
  const seal = t.api.getRecord(sealId)!.data.seal as { hash: string; git: { commit: string; forkBase: string } }
  return door.asTheMergeQueue(() => t.api.createRecord({ workspaceId: 'default', kind: 'merge_entry', title: 'Synthetic historical entry', origin: 'fixture', actor: person,
    data: { run: id, ...(MERGE_STATE_SPECS[state].occupiesTheLane ? { occupies: join(root, id) } : {}), seal: { id: sealId, hash: seal.hash }, changeset: { adapter: 'git', root: join(root, id), repository: 'synthetic-unchecked', branch: 'worker', commit: seal.git.commit, base: seal.git.forkBase }, state, submittedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, ...extra } })).id
}
for (const state of MERGE_STATES.filter((one) => !MERGE_STATE_SPECS[one].final)) {
  it(`refuses closure while the run has a ${state} entry`, () => {
    const id = run(); const held = entry(id, state)
    const before = corpus()
    expect(() => close(id)).toThrow(`merge entry ${held} that has not ended`)
    expect(corpus()).toBe(before)
  })
}
it('refuses closure while the run is another entry’s check again', () => {
  const original = run(); const id = run()
  const held = entry(original, 'reinspecting', { reinspection: { run: id, only: ['work/a.txt'], needsJudgment: [], askedAt: check.askedAt } })
  const before = corpus(); expect(() => close(id)).toThrow(`merge entry ${held} that has not ended`); expect(corpus()).toBe(before)
})
for (const wasReleased of [false, true]) {
  it(`refuses a valid sealed submission after closure, with a true sentence for a ${wasReleased ? 'previously released' : 'never released'} run`, () => {
    const id = run()
    if (wasReleased) writeAVerdictAsItsDoorWould(t, id, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: check.askedAt, how: 'an inspector', check: 'synthetic-verdict' } })
    close(id)
    const before = corpus()
    expect(() => queue.submitAMergeEntry({ workspaceId: 'default', submission: { run: id, changeset: { adapter: 'git', repository: 'synthetic-unchecked' } }, actor: person })).toThrow(`Run ${id} was closed unchecked and cannot enter the merge queue. Nothing was written.`)
    expect(corpus()).toBe(before)
  })
}
for (const scoped of [false, true]) {
  it(`never counts a queued ${scoped ? 'scoped' : 'whole'} verdict as covering a closed-unchecked run`, () => {
    const id = run(); const sealId = t.api.getRecord(id)!.data.sealedTip as string
    const seal = t.api.getRecord(sealId)!.data.seal as { hash: string; git: { commit: string } }
    writeAVerdictAsItsDoorWould(t, id, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: check.askedAt, how: 'an inspector', check: 'synthetic-verdict',
      read: { sealId, sealHash: seal.hash, worktree: root, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check read.', ...(scoped ? { only: ['work/a.txt'] } : {}) } } })
    close(id)
    // An archived or already queued verdict can outlive closure; this entry is synthetic history.
    const original = scoped ? run() : id
    const held = entry(original, scoped ? 'reinspecting' : 'pinned', scoped ? { reinspection: { run: id, only: ['work/a.txt'], needsJudgment: [], askedAt: check.askedAt } } : {})
    const before = corpus()
    const heard = machine.theMergeQueueHearsAVerdict({ runId: id, workspaceId: 'default', actor: person })
    expect(heard.moved).toEqual([])
    expect(heard.waiting).toEqual([expect.objectContaining({ entry: held, says: expect.stringContaining('closed unchecked') })])
    expect(corpus()).toBe(before)
  })
}
