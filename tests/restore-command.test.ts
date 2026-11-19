// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The refusal is direct and small. One shipped export/import chain restores a deleted source;
 * restore-semantics.test.ts holds repeatability and the detailed semantic comparisons. */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { freshDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { runCheck } from '../scripts/restore-check.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

describe('the command refuses to run somewhere it could destroy something', () => {
it('will not work in a directory that already holds a database', () => {
  const dirty = mkdtempSync(join(tmpdir(), 'mole-office-restore-dirty-'))
  writeFileSync(join(dirty, 'panelx.db'), 'preserve this database')
  try {
    expect(() => runCheck(dirty)).toThrow(/refuses to work in one that already has any/)
    expect(existsSync(join(dirty, 'panelx.db'))).toBe(true)
    expect(readFileSync(join(dirty, 'panelx.db'), 'utf8')).toBe('preserve this database')
  } finally {
    rmSync(dirty, { recursive: true, force: true })
  }
})

})

it('restores the preserved archive after the source database and export folder were deleted', async () => {
  const work = mkdtempSync(join(tmpdir(), 'mole-office-restore-cmd-'))
  const root = resolve(import.meta.dirname, '..')
  const source = await freshDb()
  let closed = false
  const command = (database: string, script: string, ...args: string[]) => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
      cwd: root, env: { ...process.env, MOLE_OFFICE_DB: database }, encoding: 'utf8', timeout: 120_000,
    })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  }
  try {
    const note = source.api.createRecord({ kind: 'note', title: 'Synthetic restored note', summary: 'A command smoke test.',
      workspaceId: 'default', origin: 'fixture', data: { body: 'A preserved line.\nAnd a second line.' }, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    inventedRegistry(source)
    await fileSyntheticAlias(source)
    const raw = JSON.stringify(note.data, null, 2)
    source.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(raw,note.id)
    source.client.sqlite.prepare('UPDATE revisions SET data=? WHERE record_id=?').run(raw,note.id)
    const before = rawHistory(source)
    const mirror = join(work, 'mirror'), archive = join(work, 'archive'), restored = join(work, 'restored.db')
    command(source.file, 'scripts/export.ts', '--to', mirror, '--no-commit', '--json')
    cpSync(mirror, archive, { recursive: true })
    source.close(); closed = true
    rmSync(mirror, { recursive: true })
    for (const file of [source.file, `${source.file}-wal`, `${source.file}-shm`, mirror]) expect(existsSync(file), file).toBe(false)
    expect(existsSync(join(archive, 'MANIFEST.md'))).toBe(true)
    expect(existsSync(restored)).toBe(false)
    command(restored, 'scripts/restore-check.ts', '--phase', 'migrate', '--scratch', work)
    command(restored, 'scripts/import.ts', '--from', archive, '--apply')
    const db = new Database(restored, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare('SELECT id, kind, title, summary, data FROM records WHERE id = ?').get(note.id) as { id: string; kind: string; title: string; summary: string; data: string }
      expect(row).toBeDefined()
      expect({ ...row, data: JSON.parse(row.data) }).toEqual({ id: note.id, kind: note.kind, title: note.title, summary: note.summary, data: note.data })
      expect(db.prepare('SELECT data FROM records WHERE id=?').get(note.id)).toEqual({data:raw})
      for (const table of ['records','revisions','changes']) for (const original of before[table] as Record<string,unknown>[]) expect(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(original['id'])).toEqual(original)
      expect(db.prepare('SELECT * FROM registry_aliases').all()).toEqual([{namespace:'agent-registry',alias_id:syntheticAlias.aliasId,canonical_id:syntheticAlias.canonicalId}])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally { db.close() }
  } finally {
    if (!closed) source.close()
    rmSync(work, { recursive: true, force: true })
  }
}, 300_000)
