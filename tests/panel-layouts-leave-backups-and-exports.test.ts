// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PANEL_LAYOUTS LEAVES BACKUPS AND EXPORTS, AND STAYS DECLARED. Item 1 of a decision
 * on problem _vHwDWnDLLGd: the table stays declared, and backups and exports stop
 * carrying it; nothing is deleted.
 *
 * The table's only writer, PUT /api/layout/:id, was deleted with the panel grid on 10 August 2026. Every
 * row here is written in SQL, because no product path can write one.
 *
 *   1. A backup (`npm run db:backup`) is SQLite's online copy of the whole file. The copy keeps the table,
 *      empty: its rows are deleted in the copy before the copy is rewritten, so they are not in its bytes
 *      either. The office's own database keeps its row. The backup says how many rows it left out, and why.
 *   2. An archive written before the decision may hold a panel layout, as `layouts/<id>.md`, and count it in
 *      its manifest. Importing it imports everything else, writes no panel_layouts row, and says in its
 *      notes how many it did not import and why. It is never refused for it, and never silent about it.
 *
 * The export side (no region, no file, no count, and the README and MANIFEST say why) is in
 * tests/export-format.test.ts; the restore side is in tests/import-roundtrip.test.ts.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A mark in the layout's JSON, so the copy's bytes can be searched for the row. Made up for this test. */
const LAYOUT_MARK = 'layout-mark-of-the-panel-layouts-test-7c1e'
const LAYOUT = JSON.stringify({ columns: 2, blocks: [{ id: LAYOUT_MARK, column: 0, order: 0 }] })

function putALayout(t: TestDb): void {
  t.client.sqlite
    .prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?,?,?,?,?)')
    .run('default', 'home', LAYOUT, '2026-08-10 18:40:02', `human:${THE_TEST_OFFICES_OWNER.id}`)
}

function layoutsIn(file: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare('SELECT count(*) AS n FROM panel_layouts').get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** Run the real backup command, as an operator does. */
function backup(args: readonly string[], env: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const run = spawnSync('npx', ['tsx', BACKUP_SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60_000 })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

describe('a backup leaves panel_layouts out, and keeps the table', () => {
  let source: TestDb
  let copy: string
  let copyInWords: string
  let said: { ok: boolean; counts: Record<string, number>; leftOut?: Record<string, number> }

  beforeAll(async () => {
    source = await freshDb()
    putALayout(source)
    copy = join(dirname(source.file), 'the-backup.db')
    const run = backup(['--to', copy, '--json'], { MOLE_OFFICE_DB: source.file })
    expect(run.status, run.stderr).toBe(0)
    said = JSON.parse(run.stdout) as typeof said
    const inWords = backup(['--to', join(dirname(source.file), 'the-second-backup.db')], { MOLE_OFFICE_DB: source.file })
    expect(inWords.status, inWords.stderr).toBe(0)
    copyInWords = inWords.stdout
  }, 180_000)

  afterAll(() => source?.close())

  it('the copy holds the table, with no row in it and no trace of the row in its bytes', () => {
    expect(said.ok).toBe(true)
    expect(said.counts['panel_layouts']).toBe(0)
    expect(layoutsIn(copy)).toBe(0)
    expect(readFileSync(copy).includes(LAYOUT_MARK), 'the deleted row is still in the copy\'s bytes').toBe(false)
  })

  it('the office\'s own database keeps its row: nothing is deleted there', () => {
    expect(layoutsIn(source.file)).toBe(1)
  })

  it('says how many rows it left out, and why', () => {
    expect(said.leftOut).toEqual({ panel_layouts: 1 })
    expect(copyInWords).toContain('panel_layouts')
    expect(copyInWords).toContain("the owner's decision leaves that table out of every backup")
  })
})

describe('an archive written before the decision, holding a panel layout, imports without it and says so', () => {
  let archive: string
  let restored: TestDb
  let report: ReturnType<ImportLib['applyImport']>
  let noteId = ''

  beforeAll(async () => {
    archive = mkdtempSync(join(tmpdir(), 'mole-office-old-archive-'))
    const source = await freshDb()
    noteId = source.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note the old archive carries', data: {}, actor: HUMAN }).id
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.writeExport(archive)
    source.close()

    // THE LAYOUT AS AN EXPORT MADE BEFORE 29 SEPTEMBER 2026 WROTE IT: its own file, and a count in the manifest.
    mkdirSync(join(archive, 'layouts'), { recursive: true })
    writeFileSync(
      join(archive, 'layouts', 'home.md'),
      [
        '---',
        'region: "panel_layouts"',
        'workspaceId: "default"',
        'id: "home"',
        'updatedAt: "2026-08-10 18:40:02"',
        `updatedBy: "human:${THE_TEST_OFFICES_OWNER.id}"`,
        '---',
        '',
        '# Panel layout `home`',
        '',
        '```json mole-office panel_layouts.layout',
        JSON.stringify(JSON.parse(LAYOUT), null, 2),
        '```',
        '',
      ].join('\n'),
    )
    const manifest = join(archive, 'MANIFEST.md')
    const text = readFileSync(manifest, 'utf8')
    expect(text).toMatch(/^presentation_intent: \d+$/m)
    writeFileSync(manifest, text.replace(/^(presentation_intent: \d+)$/m, '$1\npanel_layouts: 1'))

    restored = await freshDb()
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    report = importLib.applyImport(archive)
  }, 180_000)

  afterAll(() => {
    restored?.close()
    rmSync(archive, { recursive: true, force: true })
  })

  it('imports the rest of the archive', () => {
    expect(report.refusals).toEqual([])
    expect(report.applied).toBe(true)
    const note = restored.client.sqlite.prepare('SELECT title FROM records WHERE id = ?').get(noteId) as { title: string } | undefined
    expect(note?.title).toBe('A note the old archive carries')
  })

  it('writes no panel_layouts row', () => {
    expect(layoutsIn(restored.file)).toBe(0)
  })

  it('says how many it did not import, and why', () => {
    const notes = report.notes.filter((n) => n.includes('panel_layouts'))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('1 panel_layouts row')
    expect(notes[0]).toContain('panel_layouts is left out of every backup and export')
    expect(notes[0]).toContain('layouts/home.md')
  })
})
