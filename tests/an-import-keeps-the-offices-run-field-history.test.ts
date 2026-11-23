// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Problem l3vULTAJYUNT: an import restores office evidence and refuses hand-written run endings. */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { NEEDS_NO_CHECK } from '../src/shared/releasing.ts'

const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const office = { type: 'agent', id: 'mole-office/the-api-server' } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const fields = [
  { field: NEEDS_NO_CHECK, value: { decision: 'synthetic-decision', at: '2026-09-26 09:00:00', because: 'Synthetic office mark.' },
    refusal: "The office writes needsNoCheck when it files a run for a secretary's design/-only merge entry, at a seal while its checks are switched off, or at its start while its checks are switched off. Nothing was written." },
] as const
let t: TestDb
let app: FastifyInstance
let root: string
let exporting: typeof import('../src/server/lib/export.ts')

async function openOffice() {
  t = await freshDb()
  exporting = await import('../src/server/lib/export.ts')
  exporting.useExportRoot(root)
  const { importRoutes } = await import('../src/server/api/import.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(importRoutes, { prefix: '/api' })
  await app.ready()
}
beforeEach(async () => {
  mkdirSync('.logs', { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs', 'office-fields-import-'))
  await openOffice()
})
afterEach(async () => { await app?.close(); t?.close(); rmSync(root, { recursive: true, force: true }) })

function run(data: Record<string, unknown> = {}) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic archived run', actor: person,
    origin: 'fixture', data: { state: 'running', ...data } })
}
function storedData(id: string, data: Record<string, unknown>) {
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
}
function archiveData(id: string, data: Record<string, unknown>) {
  const path = join(root, 'records', 'session', `${id}.md`)
  const text = readFileSync(path, 'utf8')
  const changed = text.replace(/(```json (?:mole-office|panelx) records\.data\n)[\s\S]*?(\n```)/, `$1${JSON.stringify(data, null, 2)}$2`)
  expect(changed, 'the archive fixture must edit the records.data region').not.toBe(text)
  writeFileSync(path, changed)
}
function corpus() {
  return createHash('sha256').update(JSON.stringify(['records', 'changes', 'revisions', 'links', 'submission_baselines', 'legacy_unsealed_runs'].map((table) =>
    t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).digest('hex')
}
async function importRefused(id: string, refusal: string) {
  const before = corpus()
  const r = await app.inject({ method: 'POST', url: '/api/import', headers })
  expect({ status: r.statusCode, unchanged: corpus() === before }).toEqual({ status: 403, unchanged: true })
  expect(r.json().error).toContain(refusal)
  expect(r.json().error).toContain(id)
}

describe.each(fields)('the archive and $field', ({ field, value, refusal }) => {
  it('refuses a hand-edited addition without an office change row, before any other record is changed', async () => {
    const row = run()
    const other = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic archived note', actor: person })
    exporting.writeExport(root)
    t.api.patchRecord(other.id, { title: 'Synthetic newer note' }, person)
    archiveData(row.id, { ...row.data, [field]: value })
    await importRefused(row.id, refusal)
  })

  it('refuses a hand-edited value even when the office wrote an earlier value', async () => {
    const row = run()
    t.doors.asTheDoorOf(field, () => t.api.patchRecord(row.id, { dataPatch: { [field]: value } }, office))
    exporting.writeExport(root)
    archiveData(row.id, { ...t.api.getRecord(row.id)!.data, [field]: { ...value, because: 'Synthetic forgery after the office write.' } })
    await importRefused(row.id, refusal)
  })

  it('refuses to drop a stored field', async () => {
    const row = run()
    exporting.writeExport(root)
    t.doors.asTheDoorOf(field, () => t.api.patchRecord(row.id, { dataPatch: { [field]: value } }, office))
    await importRefused(row.id, refusal)
  })

  for (const evidence of ['create', 'update'] as const) {
    it(`restores the exact field from an office ${evidence} into an empty database`, async () => {
      const row = evidence === 'create'
        ? t.doors.asTheDoorOf(field, () => t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic office-created run',
          actor: office, origin: 'fixture', data: { state: 'running', [field]: value } }))
        : run()
      if (evidence === 'update') t.doors.asTheDoorOf(field, () => t.api.patchRecord(row.id, { dataPatch: { [field]: value } }, office))
      exporting.writeExport(root)
      await app.close(); t.close(); await openOffice()
      const r = await app.inject({ method: 'POST', url: '/api/import', headers })
      expect(r.statusCode, r.body).toBe(200)
      expect(t.api.getRecord(row.id)!.data[field]).toEqual(value)
      const after = corpus()
      const again = await app.inject({ method: 'POST', url: '/api/import', headers })
      expect(again.statusCode, again.body).toBe(200)
      expect(corpus()).toBe(after)
    })
  }

  it('refuses evidence from another actor, even one using another office actor name', async () => {
    const row = run()
    // Historical input in a throwaway database: neither the person nor another system actor is this writer.
    storedData(row.id, { ...row.data, [field]: value })
    t.api.logChange(row.id, 'update', { type: 'agent', id: 'mole-office/the-message-worker' }, `data.${field}`, null, value)
    exporting.writeExport(root)
    storedData(row.id, row.data)
    await importRefused(row.id, refusal)
  })

  it('refuses a value on a different record from the one the office wrote', async () => {
    const row = run()
    const other = run()
    t.doors.asTheDoorOf(field, () => t.api.patchRecord(other.id, { dataPatch: { [field]: value } }, office))
    exporting.writeExport(root)
    archiveData(row.id, { ...row.data, [field]: value })
    await importRefused(row.id, refusal)
  })
})
