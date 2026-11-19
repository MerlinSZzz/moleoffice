// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0311 IMPORTS, SAYS WHICH ROWS NAME NO KIND, INSERTS THEM WITHOUT ONE, AND LEAVES
 * A STORED ROW'S KIND AS IT WAS. Wave 13s round 155, item 30c part 3.
 *
 * Migration 0311 added a kind column beside four ids: `folder_readings.owner_kind` and `read_by_kind`,
 * `revalidations.decided_by_kind` and `conversation_reads.as_side_kind`. An export before it wrote no line for any of
 * them. It added no table, so the manifest fence has nothing to refuse.
 *
 *   - THE PLAN SAYS IT, in one note for each of the three tables: how many rows say nothing about the kind, how many
 *     are inserted with none, and how many are already stored and keep theirs.
 *   - A ROW THE IMPORT INSERTS HAS NO KIND, which the identity census counts as an id that cannot be told. The import
 *     does not tell it from the registries, because what they hold now is not what was known when the row was written.
 *   - A ROW ALREADY STORED KEEPS ITS KIND.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes one row of each table through its writer and exports twice with
 * today's export. From the second archive it takes out the four lines and the manifest's block for 0311, the way
 * tests/an-archive-before-0280-imports.test.ts does. The old archive is imported into two databases: one that already
 * holds the rows, from the first archive, and one that holds none. One row of each table is enough for each note to
 * count the new and the stored. Every name here is made up, except the test office's person.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/an-archive-before-0311-imports.test.ts
 * After a green control, copy src/server/lib/import.ts, then:
 *   1. take `'decidedByKind'` out of the `revalidations` entry of MAY_BE_ABSENT, leaving `[]`: both plans are refused
 *      for the missing column, and the second and third cases go red;
 *   2. take `'conversation_reads'` out of the list the 0311 notes are written for: no note counts the reads, and the
 *      second case goes red;
 *   3. put `${0}` in place of `${unsaid.length - kept}`, where the 0311 note counts the rows inserted: the second case
 *      goes red.
 * Restore the file with cp after each, check it with cmp, and run the command again for green.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { conversationReads, folderReadings, revalidations } from '../src/server/db/schema.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const PROJECT = 'default'
const AN_AGENT = 'made-up-reading-agent'
const THE_MIGRATION = '_four_ids_have_a_kind_beside_them'

/** Each table 0311 added a kind to, with the kind columns by their property in schema.ts, which is the archive's name. */
const THE_TABLES = [
  { table: 'folder_readings', schema: folderReadings, fields: ['ownerKind', 'readByKind'] as const },
  { table: 'revalidations', schema: revalidations, fields: ['decidedByKind'] as const },
  { table: 'conversation_reads', schema: conversationReads, fields: ['asSideKind'] as const },
] as const

/** SQLite's names for a table's kind columns. */
function columnsOf(table: string): string[] {
  const one = THE_TABLES.find((each) => each.table === table)!
  return one.fields.map((field) => (one.schema as unknown as Record<string, { name: string }>)[field]!.name)
}

/** What one database held, planned and kept when the old archive was imported into it. */
interface Imported {
  plan: ReturnType<ImportLib['planImport']>
  applied: boolean
  /** Each table's one row, by its kinds after the import. */
  kinds: Map<string, unknown[] | undefined>
}

let fullArchive: string
let oldArchive: string
let removedLines = 0
/** Each table's one row: its id, and its kinds as the writer stored them. */
const written = new Map<string, { id: string; kinds: unknown[] }>()
let intoOneHoldingTheRows: Imported
let intoAnEmptyOne: Imported

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before 0311 wrote it: no kind line in the three tables, no block for 0311. */
function makeItOld(dir: string): void {
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let fields: string[] = []
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.startsWith('```mole-office ')) fields = [...(THE_TABLES.find((one) => one.table === line.slice('```mole-office '.length))?.fields ?? [])]
      else if (line === '```') fields = []
      if (fields.some((field) => line.startsWith(`${field}: `))) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      const without = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "\d{4}_four_ids_have_a_kind_beside_them"\n```\n*/g, '')
      if (without === text || without.includes(THE_MIGRATION)) throw new Error('the manifest did not name migration 0311 once, so the archive is not made old')
      text = without
    }
    writeFileSync(file, text)
  }
}

function idsIn(t: TestDb, table: string): string[] {
  return (t.client.sqlite.prepare(`SELECT id FROM "${table}" ORDER BY id`).all() as { id: string }[]).map((row) => row.id)
}

/** The kinds a row holds, in the order of THE_TABLES' fields. */
function kindsOf(t: TestDb, table: string, id: string): unknown[] {
  return t.client.sqlite.prepare(`SELECT ${columnsOf(table).map((one) => `"${one}"`).join(', ')} FROM "${table}" WHERE id = ?`).raw().get(id) as unknown[]
}

/** One row in each of the three tables, written by their writers. */
async function oneOfEach(t: TestDb): Promise<void> {
  const folders = await import('../src/server/lib/folderreading.ts')
  const revalidationsLib = await import('../src/server/lib/revalidations.ts')
  const messages = await import('../src/server/lib/messages.ts')
  folders.fileAFolderReading({
    workspaceId: PROJECT,
    actorId: AN_AGENT,
    actorKind: 'agent',
    folder: '/made-up/a-folder',
    pieces: [{ kind: 'note', title: 'A made-up observation', data: {}, from: ['NOTES.md'], quote: 'This is made-up material.' }],
  })
  const person = { type: 'human', id: THE_PERSON } as const
  const placeholder = t.api.createRecord({
    kind: 'placeholder',
    title: 'A made-up slot nobody has filled',
    data: {
      what: 'Nobody has supplied the made-up figure.',
      slot: 'stand_in',
      substitute: 'a made-up figure',
      resolved_when: 'Somebody supplies the figure.',
      allowed_uses: ['plumbing'],
      disallowed_claims: ['any comparison'],
      severity: 'stops_final',
    },
    workspaceId: PROJECT,
    actor: person,
  })
  const claim = t.api.createRecord({ kind: 'claim', title: 'A made-up result', data: { state: 'measured' }, workspaceId: PROJECT, actor: person })
  t.api.createLink({ fromId: placeholder.id, toId: claim.id, type: 'about', actor: person })
  revalidationsLib.recordJudgement({ restrictionId: placeholder.id, recordId: claim.id, state: 'checked', workspaceId: PROJECT, actor: person })
  messages.recordThatSomebodyRead({ kind: 'person', id: THE_PERSON }, 'made-up-agent-a~made-up-agent-b', { kind: 'agent', id: 'made-up-agent-a' }, PROJECT, '2026-10-30 10:00:00')
}

/** Import the old archive into a fresh database, after the full one when `holding`, and read what it kept. */
async function importTheOldArchive(holding: boolean): Promise<Imported> {
  const t = await freshDb()
  try {
    const importLib = await import('../src/server/lib/import.ts')
    if (holding && !importLib.applyImport(fullArchive).applied) throw new Error('the full archive did not import')
    const plan = importLib.planImport(oldArchive)
    const applied = plan.ok && importLib.applyImport(oldArchive).applied
    return { plan, applied, kinds: new Map(THE_TABLES.map(({ table }) => [table, kindsOf(t, table, written.get(table)!.id)])) }
  } finally {
    t.close()
  }
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0311-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0311-old-'))

  const source = await freshDb()
  try {
    const exportLib = await import('../src/server/lib/export.ts')
    await oneOfEach(source)
    for (const { table } of THE_TABLES) {
      const ids = idsIn(source, table)
      if (ids.length !== 1) throw new Error(`${table} holds ${String(ids.length)} rows, and the test wrote one`)
      written.set(table, { id: ids[0]!, kinds: kindsOf(source, table, ids[0]!) })
    }
    exportLib.writeExport(fullArchive)
    exportLib.writeExport(oldArchive)
    makeItOld(oldArchive)
  } finally {
    source.close()
  }
  intoOneHoldingTheRows = await importTheOldArchive(true)
  intoAnEmptyOne = await importTheOldArchive(false)
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
})

/** The plan's note for one table, which must be the only one. */
function theNote(imported: Imported, table: string): string {
  const notes = imported.plan.notes.filter((n) => n.includes(`${table} row(s) say nothing about whether a person's id or an agent's is stored in them`))
  expect(notes, imported.plan.notes.join('\n')).toHaveLength(1)
  return notes[0]!
}

describe('an archive written before migration 0311', () => {
  it('is what an old export writes: no kind line on any row of the three tables, which the writers had told', () => {
    for (const { table, fields } of THE_TABLES) {
      expect(written.get(table)!.kinds, table).toEqual(fields.map(() => expect.stringMatching(/^(person|agent)$/)))
    }
    expect(removedLines).toBe(THE_TABLES.reduce((sum, { fields }) => sum + fields.length, 0))
  })

  it('imports, and the plan counts for each table the rows that name no kind, the new and the stored', () => {
    for (const imported of [intoOneHoldingTheRows, intoAnEmptyOne]) {
      expect(imported.plan.refusals).toEqual([])
      expect(imported.applied).toBe(true)
    }
    for (const { table } of THE_TABLES) {
      expect(theNote(intoOneHoldingTheRows, table)).toMatch(new RegExp(`^1 ${table} row.* 0 new row\\(s\\) are inserted with no kind.* and 1 existing row\\(s\\) keep what is stored\\.$`))
      expect(theNote(intoAnEmptyOne, table)).toMatch(new RegExp(`^1 ${table} row.* 1 new row\\(s\\) are inserted with no kind.* and 0 existing row\\(s\\) keep what is stored\\.$`))
    }
  })

  it('leaves a stored row its kind, and inserts a new row with none', () => {
    for (const { table, fields } of THE_TABLES) {
      expect(intoOneHoldingTheRows.kinds.get(table), table).toEqual(written.get(table)!.kinds)
      expect(intoAnEmptyOne.kinds.get(table), table).toEqual(fields.map(() => null))
    }
  })
})
