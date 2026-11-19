// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic archives restore a real closure and refuse an unsupported one before changing anything. */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { buildTheFirstOfficeInAHook, apiApp, freshDb, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb
let root: string
let exporting: typeof import('../src/server/lib/export.ts')
let importing: typeof import('../src/server/lib/import.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asked = { askedAt: '2026-09-26 09:00:00', checkout: {}, says: 'Synthetic check waiting.' }
const forged = { by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, at: '2026-09-26 10:00:00', because: 'Synthetic unsupported closure.' }
async function openOffice() {
  t = await freshDb()
  exporting = await import('../src/server/lib/export.ts')
  importing = await import('../src/server/lib/import.ts')
  inspection = await import('../src/server/lib/inspection.ts')
}
beforeEach(async () => {
  mkdirSync('.logs', { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs', 'closed-unchecked-archive-'))
  await openOffice()
})
afterEach(() => { t?.close(); rmSync(root, { recursive: true, force: true }) })
function run() {
  return historicalSession(t, { workspaceId: 'default', kind: 'session', title: 'Synthetic archive run', actor: person, origin: 'fixture', data: { state: 'finished', theCheck: asked } })
}
function close(id: string) {
  return inspection.closeARunUnchecked({ runId: id, workspaceId: 'default', actor: person, because: 'Synthetic: the old check will not run.' })
}
async function registerSecretary() {
  const { app } = await apiApp()
  try {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started',
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { handle: 'archive-secretary', name: 'Synthetic archive secretary', role: 'secretary' } })
    expect(registered.statusCode, registered.body).toBe(201)
  } finally { await app.close() }
}
function archiveData(id: string, data: Record<string, unknown>) {
  const path = join(root, 'records', 'session', `${id}.md`)
  const text = readFileSync(path, 'utf8')
  const changed = text.replace(/(```json (?:mole-office|panelx) records\.data\n)[\s\S]*?(\n```)/, `$1${JSON.stringify(data, null, 2)}$2`)
  expect(changed).not.toBe(text)
  writeFileSync(path, changed)
}
function corpus() {
  return createHash('sha256').update(JSON.stringify(['records', 'changes', 'revisions', 'links'].map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).digest('hex')
}
function refused() {
  const before = corpus()
  expect(() => importing.applyImport(root)).toThrow('closed-unchecked')
  expect(corpus()).toBe(before)
}
describe('closed unchecked on the archive road', () => {
  it('refuses a hand-added closure with no door history before changing another record', () => {
    const row = run()
    const other = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic before', actor: person })
    exporting.writeExport(root)
    t.api.patchRecord(other.id, { title: 'Synthetic after' }, person)
    archiveData(row.id, { ...row.data, closedUnchecked: forged })
    refused()
  })
  it('refuses a changed reason even when the door wrote an earlier value', () => {
    const row = run(); const closed = close(row.id).stands.closedUnchecked!
    exporting.writeExport(root)
    archiveData(row.id, { ...row.data, closedUnchecked: { ...closed, because: 'Synthetic rewritten reason.' } })
    refused()
  })
  it('refuses dropping a stored closure', () => {
    const row = run(); exporting.writeExport(root); close(row.id); refused()
  })
  it('refuses copying another run’s closure', () => {
    const row = run(); const other = run(); const closed = close(other.id).stands.closedUnchecked
    exporting.writeExport(root)
    archiveData(row.id, { ...row.data, closedUnchecked: closed })
    refused()
  })
  it('refuses a historical change without the key proof', () => {
    const row = run(); close(row.id)
    t.client.sqlite.prepare('UPDATE changes SET proved_by = NULL WHERE record_id = ?').run(row.id)
    exporting.writeExport(root)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(row.data), row.id)
    refused()
  })
  it('restores the exact closure from the door’s change row into an empty office, and round trips it', async () => {
    const row = run(); const closed = close(row.id).stands.closedUnchecked
    exporting.writeExport(root)
    t.close(); await openOffice()
    expect(importing.applyImport(root).ok).toBe(true)
    expect(t.api.getRecord(row.id)!.data.closedUnchecked).toEqual(closed)
    const before = corpus()
    expect(importing.applyImport(root).ok).toBe(true)
    expect(corpus()).toBe(before)
  })
  it('restores a secretary’s closure when the history names its handle and the stamp holds its registry id', async () => {
    await registerSecretary()
    const row = run()
    const closed = inspection.closeARunUnchecked({ runId: row.id, workspaceId: 'default', because: 'Synthetic secretary closure.',
      actor: { type: 'agent', id: 'archive-secretary', provedBy: 'an-agent-key' } }).stands.closedUnchecked!
    expect(closed.by.id).not.toBe('archive-secretary')
    exporting.writeExport(root)
    t.close(); await openOffice()
    expect(importing.applyImport(root).ok).toBe(true)
    expect(t.api.getRecord(row.id)!.data.closedUnchecked).toEqual(closed)
  })
  it('refuses an ambiguous stored handle even when one of its agents holds the closure stamp', async () => {
    await registerSecretary()
    const row = run()
    const closed = inspection.closeARunUnchecked({ runId: row.id, workspaceId: 'default', because: 'Synthetic secretary closure.',
      actor: { type: 'agent', id: 'archive-secretary', provedBy: 'an-agent-key' } }).stands.closedUnchecked!
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(closed.by.id)
    // Synthetic old history: two retired agents bore this handle, so the stored writer is ambiguous.
    t.client.sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) SELECT ?, name, handle, avatar_asset_id, 1, created_at FROM agents WHERE id = ?').run('other-archive-secretary', closed.by.id)
    exporting.writeExport(root)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(row.data), row.id)
    refused()
  })
})
