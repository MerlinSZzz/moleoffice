// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic historical rows, inventoried by the migration's actual selection, never resealed. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
let t: TestDb, app: FastifyInstance, run: string
let seal: typeof import('../src/server/lib/sealed-tip.ts')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'legacy-starter' }
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  seal = await import('../src/server/lib/sealed-tip.ts')
  for (const [as, type, handle] of [[THE_TEST_OFFICES_OWNER.id,'human','legacy-starter'], ['legacy-starter','agent','legacy-worker']]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': type!, 'x-mole-office-actor-id': as! }, payload: { handle, name: handle, workArea: ['work'] } })
    expect(r.statusCode, r.body).toBe(201)
  }
  run = t.api.createRecord({ kind: 'session', title: 'Synthetic historical finished run', workspaceId: 'default', actor: { type: 'agent', id: 'legacy-worker' }, origin: 'fixture', data: { state: 'running', servingAgent: 'legacy-worker', workingDirectory: '/synthetic/old-checkout', cutFrom: 'old-main', tip: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }).id
  // Raw historical storage is intentional: a current finish would need a current seal.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
})
afterAll(async () => { await app?.close(); t?.close() })
it('inventories historical finishes without changing their records, revisions or resources', () => {
  const raw = t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(run)
  const revisions = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(run)
  const rows = t.client.sqlite.prepare('SELECT * FROM session_resources').all()
  const migration = readFileSync('drizzle/0146_sealed_submissions.sql', 'utf8')
  const inventory = migration.split('--> statement-breakpoint').find((sql) => sql.includes('INSERT INTO legacy_unsealed_runs'))!
  t.client.sqlite.exec(inventory)
  expect(seal.legacyUnsealedInventory('default')).toContainEqual({ run, title: 'Synthetic historical finished run', status: 'legacy-unsealed' })
  expect(t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(run)).toEqual(raw)
  expect(t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(run)).toEqual(revisions)
  expect(t.client.sqlite.prepare('SELECT * FROM session_resources').all()).toEqual(rows)
  expect(seal.readRunSeal(run)).toBeNull()
})
it('a-legacy-run-is-read-as-unsealed', async () => {
  const address = await app.listen({ port: 0, host: '127.0.0.1' })
  const { chromium } = await import('playwright'); const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ extraHTTPHeaders: headers })
    await page.goto(address + '/api/checks/' + run)
    const read = await page.evaluate(() => JSON.parse(document.body.innerText))
    expect(read.submission).toBeNull()
    expect(read.submissionStatus).toBe('legacy-unsealed')
    expect(read.checkout.cutFrom).toBe('old-main')
    const inventory = await app.inject({ method: 'GET', url: '/api/checks/legacy-unsealed', headers })
    expect(inventory.json().runs.map((r: { run: string }) => r.run)).toContain(run)
  } finally { await browser.close() }
}, 60_000)
it('marks the historical verdict unsealed and preserves that reading', async () => {
  const lib = await import('../src/server/lib/inspection.ts')
  lib.releaseOrRefuse({ runId: run, workspaceId: 'default', by: { kind: 'agent', id: 'legacy-starter' }, how: 'its starter', inspector: null, actor: { type: 'agent', id: 'legacy-starter' },
    check: { verdict: 'released', check: 'Synthetic check of historical evidence.', missing: [], says: null, chaptersRead: [], read: { worktree: '/synthetic/old-check', tip: 'historical-tip', ofItsOwn: true, says: 'Read against the old fork point.' } } })
  const standing = lib.whereARunStands(t.api.getRecord(run)!)
  expect(standing.released!.read!.unsealed).toBe(true)
  expect(standing.released!.read!.says).toContain('Unsealed legacy tip')
  expect(standing.released!.read!.tip).toBe('historical-tip')
  expect(seal.readRunSeal(run)).toBeNull()
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, { type: 'agent', id: 'legacy-worker' })
  expect(seal.readRunSeal(run)).toBeNull()
})

it('keeps a legacy verdict explicitly unsealed when no Git tip was reported', async () => {
  const actor = { type: 'agent' as const, id: 'legacy-worker' }
  const id = t.api.createRecord({ kind: 'session', title: 'Synthetic historical run without a reported Git reading', workspaceId: 'default', actor, origin: 'fixture', data: { state: 'running', servingAgent: actor.id, cutFrom: 'main', tip: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }).id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  const lib = await import('../src/server/lib/inspection.ts')
  lib.releaseOrRefuse({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'legacy-starter' }, how: 'its starter', inspector: null, actor: { type: 'agent', id: 'legacy-starter' }, check: { verdict: 'released', check: 'Synthetic legacy check without a Git reading.', missing: [], says: null, chaptersRead: [], read: null } })
  const read = (t.api.getRecord(id)!.data['released'] as { read: Record<string, unknown> }).read
  expect(read['unsealed']).toBe(true)
  expect(Object.hasOwn(read, 'tip')).toBe(false)
  expect(lib.whereARunStands(t.api.getRecord(id)!).released!.read!.tip).toBeNull()
})
