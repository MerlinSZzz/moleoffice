// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTORE BRINGS BACK A TOOL USE THAT NAMES NO WRITER, AND STILL REFUSES EVERY OTHER UNKNOWN WRITER.
 *
 * Migration 0231 (wave 13s round 33) moved each run's old `data.toolUses` list into `tool_uses`. The list never
 * said who wrote each line, so a moved row's `actorType` is null, and the schema declares that column nullable.
 * The import refused every such row, because `checkActorTypes` accepted only human, agent or system, so an
 * office that had run 0231 could not be restored from its own archive. Merge entry 5xA4LLcn0yJx bounced on it.
 *
 * Decision GN_vn7U9pqxT (11 October 2026): a null is accepted only where the schema declares the
 * column nullable, which today is `tool_uses` alone. It comes back as the null it is, and the notes count it.
 * A null on any other region, and a word that is present but not one of the three, stay refused.
 */

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

interface UseRow {
  id: string
  actor_type: string | null
  actor_id: string | null
  moved_at: string | null
}

let source: TestDb
let restored: TestDb
let archive: string
let importLib: ImportLib
let before: UseRow[]
let notes: string[]
/** The two edited archives, each planned into the empty database before the restore, so no other check sees a stored row. */
let nullOnChanges: { ok: boolean; why: string }
let aWordOnToolUses: { ok: boolean; why: string }

/** A copy of the archive with one substring changed, refusing if it was not there: a test that edited nothing. */
function anArchiveWith(file: (dir: string) => string, from: string, to: string): string {
  const copy = mkdtempSync(join(tmpdir(), 'mole-office-moved-use-edit-'))
  cpSync(archive, copy, { recursive: true })
  const path = file(copy)
  const text = readFileSync(path, 'utf8')
  if (!text.includes(from)) throw new Error(`this test meant to change ${JSON.stringify(from)} in ${path} and it is not there`)
  writeFileSync(path, text.replace(from, to), 'utf8')
  return copy
}

/** The first change file holding an agent-attributed row. */
function anAgentChangeFile(dir: string): string {
  const changes = join(dir, 'changes')
  for (const name of readdirSync(changes).sort()) {
    const path = join(changes, name)
    if (readFileSync(path, 'utf8').includes('actorType: "agent"')) return path
  }
  throw new Error('the archive holds no agent-attributed change row, so this test cannot edit one')
}

function refusalsOf(dir: string): { ok: boolean; why: string } {
  try {
    const plan = importLib.planImport(dir)
    return { ok: plan.ok, why: plan.refusals.map((r) => `${r.path}:${String(r.line)} ${r.problem}`).join('\n') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const usesIn = (db: TestDb): UseRow[] =>
  db.client.sqlite.prepare('SELECT id, actor_type, actor_id, moved_at FROM tool_uses ORDER BY id').all() as UseRow[]

beforeAll(async () => {
  archive = mkdtempSync(join(tmpdir(), 'mole-office-moved-use-'))
  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const { moveToolUsesIntoTheirTable } = await import('../src/server/db/tool-uses-migration.ts')

  // A run whose list was moved by 0231's own data step, so two rows name no writer.
  const oldRun = source.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A made-up run from before round 33',
    data: { state: 'finished' },
    actor: { type: 'agent', id: 'moved-use-tester' },
  }).id
  const list = [
    { at: '2026-10-01 10:00:00', tool: 'data-copy', said: 'make: a made-up use' },
    { at: '2026-10-01 10:00:05', tool: 'data-copy', said: 'open: a second made-up use' },
  ]
  source.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.toolUses', json(?)) WHERE id = ?").run(JSON.stringify(list), oldRun)
  expect(moveToolUsesIntoTheirTable(source.client.sqlite).rowsWritten).toBe(2)
  // And one row the use door would write, which names its writer.
  source.client.sqlite
    .prepare(
      "INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id) VALUES ('door-use', 'default', ?, 3, '2026-10-01 10:01:00', 'data-copy', 'make: a door use', 'agent', 'moved-use-tester')",
    )
    .run(oldRun)
  before = usesIn(source)
  exportLib.writeExport(archive)

  restored = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  nullOnChanges = refusalsOf(anArchiveWith(anAgentChangeFile, 'actorType: "agent"', 'actorType: null'))
  aWordOnToolUses = refusalsOf(anArchiveWith((dir) => join(dir, 'tool-uses.md'), 'actorType: null', 'actorType: "hooman"'))
  const plan = importLib.planImport(archive)
  notes = plan.notes
  importLib.applyImport(archive)
})

afterAll(() => {
  rmSync(archive, { recursive: true, force: true })
  restored.close()
  source.close()
})

describe('a tool use that migration 0231 moved comes back from the archive', () => {
  it('had two moved rows naming no writer and one door row naming its writer before the export', () => {
    expect(before.filter((row) => row.actor_type === null && row.moved_at !== null)).toHaveLength(2)
    expect(before.filter((row) => row.actor_type === 'agent' && row.moved_at === null)).toHaveLength(1)
  })

  it('restores every row with the writer it held, and writes no actor onto a moved row', () => {
    expect(usesIn(restored)).toEqual(before)
  })

  it('counts the rows that name no writer in the notes, by region', () => {
    expect(notes.join('\n')).toMatch(/2 tool_uses row\(s\) say nobody recorded who did it \(actorType null\)/)
  })
})

describe('the refusals that stay', () => {
  it('refuses a null writer on a region whose column the schema declares not null', () => {
    expect(nullOnChanges.ok, 'a change row naming no writer was accepted').toBe(false)
    // Two checks read the same schema fact, and either refusal is the right answer: the row check refuses a null
    // in a column declared not null before checkActorTypes sees the row, and checkActorTypes accepts a null only
    // where the column is declared nullable.
    expect(nullOnChanges.why).toMatch(/changes\.actorType is null, and the column may not be|this changes row says who did it was null/)
  })

  it('refuses a word that is present and not one of the three, on tool_uses too', () => {
    expect(aWordOnToolUses.ok, 'a tool use naming a writer nobody knows was accepted').toBe(false)
    expect(aWordOnToolUses.why).toMatch(/this tool_uses row says who did it was "hooman"/)
  })
})
