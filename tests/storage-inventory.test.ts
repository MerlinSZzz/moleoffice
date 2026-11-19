// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync, renameSync, rmSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { STORAGE_CATEGORIES, DEFERRED_STORAGE_STORES } from '../src/shared/storage/categories.ts'
import { STORAGE_REFUSAL_CODES } from '../src/shared/storage/refusals.ts'
import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { FastifyInstance } from 'fastify'
let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/storage/inventory.ts')
let hooks: typeof import('../src/server/lib/storage/store.ts')
let archive: string
let writerKey: string
beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/storage/inventory.ts')
  hooks = await import('../src/server/lib/storage/store.ts')
  app = (await apiApp()).app
  archive = aTestDatabaseFolder('storage-archive')
})
afterAll(async () => { await app?.close(); t?.close(); if (archive) removeThisTestFolder(archive) })
const path = (name: string) => join(dirname(t.file), 'personal-spaces', 'made-up-resident', name)
const total = (category: string) => lib.readStorageCategories(t.client.sqlite).categories.find(row => row.category === category)!
it('starts unmeasured, preserves one category per physical path and maintains overwrite/rename/delete totals', () => {
  const first = lib.readStorageCategories(t.client.sqlite)
  expect(first).toMatchObject({ state: 'unmeasured', complete: false, deferredStores: [...DEFERRED_STORAGE_STORES], snapshotTime: null })
  mkdirSync(dirname(path('memo.md')), { recursive: true })
  writeFileSync(path('memo.md'), 'first')
  hooks.storedFileChanged(path('memo.md')); hooks.storedFileChanged(path('memo.md'))
  expect(total('text')).toMatchObject({ files: 1, bytes: 5 })
  t.client.sqlite.prepare("UPDATE storage_files SET category='other' WHERE path=?").run(lib.storagePath(dirname(t.file), path('memo.md')))
  hooks.storedFileChanged(path('memo.md'))
  expect(total('other').files).toBe(1)
  writeFileSync(path('memo.md'), '%PDF-1.7')
  hooks.storedFileChanged(path('memo.md'))
  expect(total('reports')).toMatchObject({ files: 1, bytes: 8 })
  const version = path('.versions/memo.md/1')
  mkdirSync(dirname(version), { recursive: true }); renameSync(path('memo.md'), version)
  hooks.storedFileMoved(path('memo.md'), version)
  expect(total('reports').files).toBe(1)
  rmSync(version); hooks.storedFileRemoved(version)
  expect(total('reports').bytes).toBe(0)
})
it('hooks real message/returned/personal and generated-origin writers, including retained versions', async () => {
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = dirname(t.file)
  const pictures = await import('../src/server/lib/messagepictures.ts')
  const returned = await import('../src/server/lib/returnedfiles.ts')
  const origins = await import('../src/server/lib/session-origins.ts')
  const residents = await import('../src/server/lib/residents.ts')
  const png = Buffer.from([137,80,78,71,13,10,26,10])
  pictures.storeAMessagePicture(png, 'default')
  returned.storeAReturnedFile(Buffer.from([80,75,3,4,0,0]), 'default')
  expect(total('pictures').files).toBe(1); expect(total('other').files).toBe(1)
  const agentReply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }, payload: { handle: 'synthetic-storage-writer', name: 'Synthetic storage writer', role: 'worker' } })
  expect(agentReply.statusCode, agentReply.body).toBe(201)
  const agent = agentReply.json().agent
  writerKey = agentReply.json().whatToGiveIt.key
  t.client.sqlite.prepare("UPDATE agents SET resident_since='2026-01-01 00:00:00' WHERE id=?").run(agent.id)
  const space = residents.theSpaceOf(agent.id); mkdirSync(space, { recursive: true })
  origins.writeTheFirstOrigin(space, agent.id, agent.handle)
  const residency = residents.residencyOf(agent.id)!
  const actor = { type: 'agent' as const, id: agent.handle, provedBy: 'an-agent-key' as const, keyHolder: agent.id }
  residents.writeAFile(residency, 'memory/notes.md', Buffer.from('old memory'), actor)
  residents.writeAFile(residency, 'memory/notes.md', Buffer.from('new memory'), actor)
  const rows = t.client.sqlite.prepare('SELECT path,category FROM storage_files WHERE path LIKE ?').all(`personal-spaces/${agent.id}/%`) as { path: string; category: string }[]
  expect(rows).toHaveLength(3)
  expect(rows.every(row => row.category === 'text')).toBe(true)
  expect(readFileSync(join(space, 'memory/notes.md'), 'utf8')).toBe('new memory')
  const range = t.client.sqlite.prepare('EXPLAIN QUERY PLAN DELETE FROM storage_files WHERE path >= ? AND path < ?').all(`personal-spaces/${agent.id}/`, `personal-spaces/${agent.id}0`) as { detail: string }[]
  expect(range.some(row => /SEARCH storage_files/.test(row.detail))).toBe(true)
  t.client.sqlite.exec("CREATE TRIGGER storage_synthetic_failure BEFORE UPDATE ON storage_files BEGIN SELECT RAISE(ABORT,'synthetic inventory failure'); END")
  expect(() => residents.writeAFile(residency, 'memory/notes.md', Buffer.from('failed replacement'), actor)).toThrow('synthetic inventory failure')
  expect(readFileSync(join(space, 'memory/notes.md'), 'utf8')).toBe('new memory')
  t.client.sqlite.exec('DROP TRIGGER storage_synthetic_failure')
  expect(t.client.sqlite.prepare('SELECT path FROM storage_files WHERE path LIKE ?').all(`personal-spaces/${agent.id}/%`)).toHaveLength(3)
  rmSync(space, { recursive: true }); hooks.storedTreeRemoved(space)
  expect(t.client.sqlite.prepare('SELECT path FROM storage_files WHERE path LIKE ?').all(`personal-spaces/${agent.id}/%`)).toEqual([])
})
it('serves authorized discovery using only fixed summary rows and no physical paths', async () => {
  const queries: string[] = []
  let rows = 0
  const bounded = { prepare(sql: string) {
    queries.push(sql)
    if (!/^SELECT .+ FROM storage_(totals|measurement)\b/.test(sql) || /sum\(|storage_files|records|revisions/i.test(sql)) throw new Error('Unbounded summary query')
    const statement = t.client.sqlite.prepare(sql)
    return { all() { const result = statement.all(); rows += result.length; return result }, get() { const result = statement.get(); rows += result ? 1 : 0; return result } }
  } }
  const result = lib.readStorageCategories(bounded as never)
  expect(queries).toHaveLength(2); expect(rows).toBeLessThanOrEqual(STORAGE_CATEGORIES.length + 1)
  expect(result.complete).toBe(false)
  const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
  const response = await app.inject({ method: 'GET', url: '/api/storage/categories', headers: person })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json().categories).toHaveLength(STORAGE_CATEGORIES.length)
  expect(response.body).not.toContain(dirname(t.file))
  const refused = await app.inject({ method: 'GET', url: '/api/storage/categories', headers: { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'synthetic-storage-writer', 'x-mole-office-key': writerKey } })
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json()).toMatchObject({ code: Object.keys(STORAGE_REFUSAL_CODES)[0], values: {} })
  expect(enWave13u[`server.${refused.json().code}` as keyof typeof enWave13u]).toBeTruthy()
  const discovery = await app.inject({ method: 'GET', url: '/api', headers: person })
  expect(discovery.body).toContain('/storage/categories')
})
it('retains categories in SQLite backups and explicitly omits inventory from real text export/import', async () => {
  const sourceTables = ['storage_files','storage_totals','storage_measurement']
  const before = sourceTables.map(table => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())
  const backupFile = join(archive, 'binary.db')
  await t.client.sqlite.backup(backupFile)
  const backup = new Database(backupFile)
  try {
    for (let i = 0; i < sourceTables.length; i++) expect(backup.prepare(`SELECT * FROM ${sourceTables[i]} ORDER BY 1`).all()).toEqual(before[i])
    lib.registerStorageFile(backup, { path: 'report-files/after-restore.txt', category: 'text', bytes: 7, fingerprint: 'new-bytes' })
    expect(lib.readStorageCategories(backup).categories.find(row => row.category === 'text')!.bytes).toBe(total('text').bytes + 7)
  } finally { backup.close() }
  const schema = await import('../src/server/db/schema.ts')
  expect(schema.everyPartTable().filter(part => sourceTables.includes(part.name)).every(part => !part.says.exported && part.says.restore === 'may be lost')).toBe(true)
  const exporter = await import('../src/server/lib/export.ts')
  expect(exporter.EXPORTED_REGIONS.some(region => sourceTables.includes(region))).toBe(false)
  exporter.writeExport(archive)
  const restored = await freshDb()
  try {
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.applyImport(archive).applied).toBe(true)
    for (const table of sourceTables) expect(restored.client.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    expect(lib.readStorageCategories(restored.client.sqlite)).toMatchObject({ state: 'unmeasured', complete: false })
  } finally { restored.close() }
})
