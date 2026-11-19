// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE OF THE FIRST HISTORY BYTES CAPABILITY, WITH ROWS, STILL IMPORTS, AND THE IMPORTED OFFICE STORES THE SAME
 * TEXT AS THE OFFICE IT CAME FROM.
 *
 * Once a store holds a registry alias, its archive carries the original JSON text of every records.data,
 * revisions.data and proved_holder. The first capability, `historyBytes: 1` in the manifest, kept all of it as one
 * envelope, {version: 1, rows}, in one file, history-bytes.md. Archives of that capability exist, so an import must go
 * on reading them after the export writes another.
 *
 * So this test exports a small aliased store, and makes the archive one of the first capability whatever the export
 * wrote: it takes the rows of every history_bytes envelope the archive holds, removes the files that held them, writes
 * the rows as one version 1 envelope in history-bytes.md, and sets the manifest to capability 1. An export that writes
 * capability 1 is left as it was, apart from the file being written again. Then it imports the archive into a fresh
 * office, and compares every row of records, revisions and changes with the source.
 *
 * The data of each made-up record is stored pretty-printed, so the import stores the same text only if it takes it from
 * the envelope and not from the value. Every id and value here is made up, and both offices are fresh ones in the
 * test's own folders.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory } from './registry-alias-fixture.ts'

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let source: TestDb
let restored: TestDb | undefined
let archive: string

beforeEach(async () => {
  source = await freshDb()
  inventedRegistry(source)
  await fileSyntheticAlias(source)
  archive = aTestDatabaseFolder('first-capability-archive')
})

afterEach(() => {
  restored?.close()
  restored = undefined
  source?.close()
  if (archive) removeThisTestFolder(archive)
})

/** Every .md file under the archive, by its path from the archive's top. */
function theArchivesPages(): string[] {
  return readdirSync(archive, { recursive: true }).map(String).filter((path) => path.endsWith('.md') && statSync(join(archive, path)).isFile())
}

describe('an archive of the first history bytes capability', () => {
  it('imports, holding rows, and the imported office stores every row of the three ledgers as the source does', async () => {
    for (const n of [1, 2]) {
      const record = source.api.createRecord({ kind: 'module', workspaceId: 'default', title: `Made-up module ${String(n)}`, origin: 'fixture', data: { context: `made-up context ${String(n)}` }, actor })
      source.api.patchRecord(record.id, { dataPatch: { context: `made-up context ${String(n)}, changed` } }, actor)
      const raw = JSON.stringify(source.api.getRecord(record.id)!.data, null, 2)
      source.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(raw, record.id)
      const last = source.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(record.id) as { id: string }
      source.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE id = ?').run(raw, last.id)
    }
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)

    // THE ARCHIVE MADE ONE OF THE FIRST CAPABILITY, from the envelopes the export wrote.
    const { parseExportFile } = await import('../src/server/lib/export-grammar.ts')
    const { HISTORY_BYTES_FILE } = await import('../src/server/lib/registry-aliases/history-bytes.ts')
    const rows: unknown[] = []
    for (const path of theArchivesPages()) {
      const regions = parseExportFile(readFileSync(join(archive, path), 'utf8'), path).regions.filter((region) => region.name === 'history_bytes')
      if (regions.length === 0) continue
      for (const region of regions) rows.push(...(region.json as { rows: unknown[] }).rows)
      rmSync(join(archive, path))
    }
    expect(rows.length).toBeGreaterThan(0)
    writeFileSync(join(archive, HISTORY_BYTES_FILE), '```json mole-office history_bytes\n' + JSON.stringify({ version: 1, rows }, null, 2) + '\n```\n')
    const manifest = join(archive, 'MANIFEST.md')
    const declared = readFileSync(manifest, 'utf8')
    expect(declared).toMatch(/^historyBytes: \d+$/m)
    writeFileSync(manifest, declared.replace(/^historyBytes: \d+$/m, 'historyBytes: 1'))
    expect(theArchivesPages().filter((path) => readFileSync(join(archive, path), 'utf8').includes('```json mole-office history_bytes'))).toEqual([HISTORY_BYTES_FILE])
    expect(existsSync(join(archive, HISTORY_BYTES_FILE))).toBe(true)

    const before = rawHistory(source)
    restored = await freshDb()
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    for (const table of ['records', 'revisions', 'changes'] as const) {
      const held = before[table] as Record<string, unknown>[]
      expect(held.length).toBeGreaterThan(0)
      for (const row of held) expect(restored.client.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row['id']), `${table} ${String(row['id'])}`).toEqual(row)
    }
  })
})
