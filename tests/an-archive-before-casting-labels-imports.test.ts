// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Before labels existed, a grouped Casting row selected the work group. An archive that says
 * nothing about the four new cells must preserve existing cells, insert ungrouped rows, and refuse
 * a new grouped row when its label identity cannot be proved. A current archive's explicit cells
 * (including null) still apply. Removing the absent-field rule or the grouped-row refusal turns
 * these cases red. All databases and archives below are test-owned.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, migrationsBefore } from './migration-fixtures.ts'
import { THE_MIGRATION_TAG } from '../src/server/db/casting-labels-migration.ts'

const before = journal(MIGRATIONS).slice(0, migrationsBefore(THE_MIGRATION_TAG)).map((entry) => entry.tag)
const at = '2026-01-02 03:04:05'
const from = JSON.stringify({ at, by: { kind: 'human', id: 'test-person' }, decision: null, moved: false, copied: false })
let source: TestDb
let target: TestDb
let oldArchive: string
let currentArchive: string
let partialArchive: string
let imports: typeof import('../src/server/lib/import.ts')

function markdown(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? markdown(path) : path.endsWith('.md') ? [path] : []
  })
}
function oldShape(dir: string): void {
  let removed = 0
  for (const path of markdown(dir)) {
    let inRow = false
    let text = readFileSync(path, 'utf8').split('\n').filter((line) => {
      if (line === '```mole-office casting_rows') inRow = true
      else if (line === '```') inRow = false
      if (inRow && /^(labels|labelsFrom|outUntil|outUntilFrom): /.test(line)) { removed++; return false }
      return true
    }).join('\n')
    if (path.endsWith('MANIFEST.md')) text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "([^"]*)"\n```\n*/g,
      (block, tag: string) => before.includes(tag) ? block : '')
    writeFileSync(path, text)
  }
  if (removed !== 12) throw new Error(`expected four cells on three rows, removed ${removed}`)
}
function row(db: TestDb, id: number) {
  return db.client.sqlite.prepare('SELECT * FROM casting_rows WHERE id = ?').get(id) as Record<string, unknown> | undefined
}
function addRow(db: TestDb, id: number, group: string | null): void {
  db.client.sqlite.prepare('INSERT INTO casting_rows (id, role, project, marked, model, model_from, work_group, work_group_from, changed_at, changed_by_kind, changed_by_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'worker', '', `test-model-${id}`, from, group, group === null ? null : from, at, 'human', 'test-person')
}

beforeAll(async () => {
  oldArchive = mkdtempSync(join(tmpdir(), 'casting-old-'))
  currentArchive = mkdtempSync(join(tmpdir(), 'casting-current-'))
  partialArchive = mkdtempSync(join(tmpdir(), 'casting-partial-'))
  source = await freshDb()
  addRow(source, 101, 'hard')
  addRow(source, 102, null)
  addRow(source, 103, 'simple')
  const exporter = await import('../src/server/lib/export.ts')
  exporter.writeExport(oldArchive)
  oldShape(oldArchive)
  source.client.sqlite.prepare('INSERT INTO casting_labels (id, name, meaning, meaning_from, changed_at, changed_by_kind, changed_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(77, 'test-label', 'test meaning', from, at, 'human', 'test-person')
  source.client.sqlite.prepare('UPDATE casting_rows SET labels = ?, labels_from = ?, out_until = ?, out_until_from = ? WHERE id = ?')
    .run(JSON.stringify([77]), from, '2030-01-02T03:04:05Z', from, 101)
  exporter.writeExport(currentArchive)
  cpSync(currentArchive, partialArchive, { recursive: true })
  for (const path of markdown(partialArchive)) {
    const text = readFileSync(path, 'utf8').replace(/^outUntilFrom: .*\n/m, '')
    writeFileSync(path, text)
  }
  target = await freshDb()
  target.client.sqlite.prepare('INSERT INTO casting_labels (id, name, meaning, meaning_from, changed_at, changed_by_kind, changed_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(999, 'local-label', 'local meaning', from, at, 'human', 'test-person')
  addRow(target, 101, 'hard')
  addRow(target, 103, 'simple')
  target.client.sqlite.prepare('UPDATE casting_rows SET labels = ?, labels_from = ?, out_until = ?, out_until_from = ? WHERE id = ?')
    .run(JSON.stringify([999]), from, '2040-01-02T03:04:05Z', from, 101)
  imports = await import('../src/server/lib/import.ts')
}, 120_000)

afterAll(() => {
  target?.close(); source?.close()
  for (const dir of [oldArchive, currentArchive, partialArchive]) if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('an archive before Casting labels', () => {
  it('imports an ungrouped new row and preserves every new cell on an existing row', () => {
    const saved = row(target, 101)!
    const plan = imports.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(imports.applyImport(oldArchive).applied).toBe(true)
    expect(row(target, 102)).toMatchObject({ work_group: null, labels: null, labels_from: null, out_until: null, out_until_from: null })
    expect(row(target, 101)).toMatchObject({ labels: saved.labels, labels_from: saved.labels_from, out_until: saved.out_until, out_until_from: saved.out_until_from })
  })

  it('refuses a new grouped row before writing any other row', () => {
    target.client.sqlite.prepare('DELETE FROM casting_rows WHERE id = ?').run(103)
    target.client.sqlite.prepare('UPDATE casting_rows SET model = ? WHERE id = ?').run('test-local-model', 101)
    const plan = imports.planImport(oldArchive)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.some((refusal) => /103/.test(refusal.problem) && /group|label/i.test(refusal.problem))).toBe(true)
    expect(() => imports.applyImport(oldArchive)).toThrow()
    expect(row(target, 103)).toBeUndefined()
    expect(row(target, 101)?.model).toBe('test-local-model')
  })

  it('applies explicit current values, including null, and refuses a partial current row', () => {
    expect(imports.planImport(partialArchive).ok).toBe(false)
    addRow(target, 103, 'simple')
    target.client.sqlite.prepare('UPDATE casting_rows SET labels = ?, labels_from = ?, out_until = ?, out_until_from = ? WHERE id = ?')
      .run(JSON.stringify([999]), from, '2040-01-02T03:04:05Z', from, 103)
    expect(imports.applyImport(currentArchive).applied).toBe(true)
    expect(row(target, 101)).toMatchObject({ labels: JSON.stringify([77]), labels_from: from, out_until: '2030-01-02T03:04:05Z', out_until_from: from })
    expect(row(target, 103)).toMatchObject({ labels: null, labels_from: null, out_until: null, out_until_from: null })
  })
})

describe('old rows that meet different target rows', () => {
  const differences = [
    ['model', 'model', 'different-model'],
    ['program', 'program', 'codex'],
    ['role', 'role', 'different-role'],
    ['project', 'project', 'different-project'],
    ['work_group', 'workGroup', 'simple'],
  ] as const
  const retained = [
    ['label', JSON.stringify([999]), from, null, null],
    ['out-until', null, null, '2040-01-02T03:04:05Z', from],
    ['sources alone', null, from, null, from],
  ] as const
  it.each(differences.flatMap(([column, field, local]) => retained.map(([what, labels, labelsFrom, outUntil, outUntilFrom]) =>
    ({ column, field, local, what, labels, labelsFrom, outUntil, outUntilFrom }))))
  ('refuses $field when the target has $what, before any write', ({ column, field, local, labels, labelsFrom, outUntil, outUntilFrom }) => {
    target.client.sqlite.prepare('UPDATE casting_rows SET role = ?, project = ?, program = NULL, model = ?, work_group = ?, labels = ?, labels_from = ?, out_until = ?, out_until_from = ? WHERE id = 101')
      .run('worker', '', 'test-model-101', 'hard', labels, labelsFrom, outUntil, outUntilFrom)
    target.client.sqlite.prepare(`UPDATE casting_rows SET ${column} = ? WHERE id = 101`).run(local)
    target.client.sqlite.prepare('UPDATE casting_rows SET model = ? WHERE id = 102').run('local-neighbour')
    const before = row(target, 101)
    const neighbour = row(target, 102)
    const plan = imports.planImport(oldArchive)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.some((refusal) => /101/.test(refusal.problem) && refusal.problem.includes(field))).toBe(true)
    expect(() => imports.applyImport(oldArchive)).toThrow()
    expect(row(target, 101)).toEqual(before)
    expect(row(target, 102)).toEqual(neighbour)
  })

  it('refuses a changed old group even when the target has no newer cells', () => {
    target.client.sqlite.prepare('UPDATE casting_rows SET role = ?, project = ?, program = NULL, model = ?, work_group = ?, labels = NULL, labels_from = NULL, out_until = NULL, out_until_from = NULL WHERE id = 101')
      .run('worker', '', 'test-model-101', 'simple')
    const before = row(target, 101)
    expect(imports.planImport(oldArchive).refusals.some((refusal) => /101/.test(refusal.problem) && /workGroup/.test(refusal.problem))).toBe(true)
    expect(() => imports.applyImport(oldArchive)).toThrow()
    expect(row(target, 101)).toEqual(before)
  })

  it('allows an identity change with no retained cells, and preserves cells across a nonidentity change', () => {
    target.client.sqlite.prepare('UPDATE casting_rows SET work_group = ?, model = ?, labels = NULL, labels_from = NULL, out_until = NULL, out_until_from = NULL WHERE id = 101').run('hard', 'local-model')
    expect(imports.planImport(oldArchive).refusals).toEqual([])
    expect(imports.applyImport(oldArchive).applied).toBe(true)
    expect(row(target, 101)).toMatchObject({ model: 'test-model-101', labels: null, out_until: null })
    target.client.sqlite.prepare('UPDATE casting_rows SET effort = ?, labels = ?, labels_from = ?, out_until = ?, out_until_from = ? WHERE id = 101')
      .run('local-effort', JSON.stringify([999]), from, '2040-01-02T03:04:05Z', from)
    expect(imports.planImport(oldArchive).refusals).toEqual([])
    expect(imports.applyImport(oldArchive).applied).toBe(true)
    expect(row(target, 101)).toMatchObject({ effort: null, labels: JSON.stringify([999]), labels_from: from, out_until: '2040-01-02T03:04:05Z', out_until_from: from })
  })
})
