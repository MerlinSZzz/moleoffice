// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let source: TestDb
let target: TestDb
let full: string
let old: string
let importer: typeof import('../src/server/lib/import.ts')
let personId: string
const starter = 'archive-starter'
const existing = 'archive-existing'
const newAgent = 'archive-new-agent'
const newPerson = 'archive-new-person'
const explicitNull = 'archive-explicit-null'
const handedTo = 'archive-handed-to'

function addAgent(t: TestDb, id: string, by: string | null): void {
  t.client.sqlite.prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')").run(`avatar-default-agent-${id}`, '2026-01-01 00:00:00')
  t.client.sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) VALUES (?, ?, ?, ?, 0, ?, ?, ?)').run(id, id, id, `avatar-default-agent-${id}`, '2026-01-01 00:00:00', by === null ? 'person' : 'agent', by ?? personId)
}

function oldArchive(dir: string): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) { oldArchive(path); continue }
    if (!name.endsWith('.md')) continue
    const lines: string[] = []
    let agents = false
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line === '```mole-office agents') agents = true
      else if (line === '```') agents = false
      if (agents && (line.startsWith('ownerId: ') || line.startsWith('ownerKind: '))) continue
      lines.push(line)
    }
    const content = lines.join('\n').replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "[^"\n]*_an_agent_keeps_its_owner_apart"\n```\n*/g, '')
    writeFileSync(path, content)
  }
}

function hasOwnerKind(t: TestDb): boolean {
  return (t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]).some((column) => column.name === 'owner_kind')
}

function owner(id: string): { owner_kind: string | null; owner_id: string | null } {
  const kind = hasOwnerKind(target) ? 'owner_kind' : "CASE WHEN owner_id IS NULL THEN NULL ELSE 'agent' END AS owner_kind"
  return target.client.sqlite.prepare(`SELECT ${kind}, owner_id FROM agents WHERE id = ?`).get(id) as { owner_kind: string | null; owner_id: string | null }
}

beforeAll(async () => {
  full = mkdtempSync(join(tmpdir(), 'owner-full-'))
  old = mkdtempSync(join(tmpdir(), 'owner-old-'))
  source = await freshDb()
  personId = (await import('../src/shared/person.ts')).THE_PERSON
  addAgent(source, starter, null)
  if (hasOwnerKind(source)) source.client.sqlite.prepare("UPDATE agents SET owner_kind = 'person', owner_id = ? WHERE id = ?").run(personId, starter)
  addAgent(source, handedTo, null)
  addAgent(source, existing, starter)
  addAgent(source, explicitNull, starter)
  const exporter = await import('../src/server/lib/export.ts')
  exporter.writeExport(full)
  addAgent(source, newAgent, starter)
  addAgent(source, newPerson, null)
  exporter.writeExport(old)
  oldArchive(old)
  target = await freshDb()
  importer = await import('../src/server/lib/import.ts')
  expect(importer.applyImport(full).applied).toBe(true)
  setFixtureOwner(target.client.sqlite, handedTo, existing, 'id')
}, 120_000)

afterAll(() => {
  source?.close()
  target?.close()
  for (const path of [full, old]) if (path) rmSync(path, { recursive: true, force: true })
})

describe('an archive from before agent ownership', () => {
  it('derives owners of new rows from agent starters and describes the rule in the plan', () => {
    const plan = importer.planImport(old)
    expect(plan.refusals).toEqual([])
    expect(plan.notes.some((note) => note.includes(importer.ABSENT_OWNER_RULE))).toBe(true)
    expect(importer.applyImport(old).applied).toBe(true)
    expect(owner(newAgent)).toEqual({ owner_kind: 'agent', owner_id: starter })
  })

  it('derives a person owner for a new person-started row', () => {
    expect(owner(newPerson)).toEqual({ owner_kind: 'person', owner_id: personId })
  })

  it('keeps an explicitly null owner from a current archive', () => {
    expect(owner(explicitNull)).toEqual({ owner_kind: null, owner_id: null })
  })

  it('keeps a person owner from a current archive', () => {
    expect(owner(starter)).toEqual({ owner_kind: 'person', owner_id: personId })
  })

  it('keeps the existing owner when the older archive is imported', () => {
    expect(owner(existing)).toEqual({ owner_kind: 'agent', owner_id: handedTo })
  })
})
