// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0183 STILL IMPORTS, AND NEVER ERASES THE LANGUAGE A PERSON CHOSE.
 *
 * Migration 0183 added one column to `people`: the language a person chose for the pages (recommendation
 * 4A of report r4pB7iVUDO-f). A decision accepted that recommendation. The export writes
 * it on every person's
 * row. An archive written before 0183 has no such line, and the importer refuses a row that leaves out a
 * column unless MAY_BE_ABSENT in src/server/lib/import.ts lists it. Now `language` is listed for people:
 *
 *   - a row the import INSERTS has no language chosen, so the pages follow the browser;
 *   - a row ALREADY STORED keeps its person's choice;
 *   - the plan's notes count both.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out what an
 * export before 0183 did not write: the language line inside each people block, and the manifest's
 * migration blocks from 0183 on. It is the way tests/an-archive-before-0181-imports.test.ts does it.
 *
 * Every name here is made up.
 *
 * MUTATION PROOF (after a green control), in src/server/lib/import.ts: take 'language' out of the
 * `people` entry of MAY_BE_ABSENT. The plan is refused again, naming the column.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let removedLines = 0
let personId = ''
const NEW_PERSON = 'made-up-second-person'

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before 0183 wrote it: no language line in any people block. */
function makeItOld(dir: string): void {
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let inPeople = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office people') inPeople = true
      else if (line === '```') inPeople = false
      if (inPeople && line.startsWith('language: ')) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "(\d{4})_[^"]*"\n```\n*/g, (block, number: string) =>
        Number(number) >= 183 ? '' : block,
      )
      if (text.includes('0183_')) throw new Error('the manifest still names migration 0183')
      if (!text.includes('0182_')) throw new Error('the manifest lost migration 0182 as well')
    }
    writeFileSync(file, text)
  }
}

function languageOf(t: TestDb, id: string): string | null {
  const row = t.client.sqlite.prepare('SELECT language FROM people WHERE id = ?').get(id) as { language: string | null } | undefined
  if (row === undefined) throw new Error(`person ${id} is not stored`)
  return row.language
}

/**
 * A second person row, copied from the first with its own made-up id, handle and name. It does not copy
 * `office_owner`: the first person owns the office, and an office has one owner (a unique index holds it).
 */
function aSecondPerson(t: TestDb, fromId: string): void {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(people)').all() as { name: string }[]).map((c) => c.name)
  const others = columns.filter((c) => c !== 'id' && c !== 'handle' && c !== 'name' && c !== 'office_owner')
  t.client.sqlite
    .prepare(`INSERT INTO people (id, handle, name, ${others.join(', ')}) SELECT ?, ?, ?, ${others.join(', ')} FROM people WHERE id = ?`)
    .run(NEW_PERSON, NEW_PERSON, 'A made-up second person', fromId)
  t.client.sqlite.prepare('UPDATE people SET language = ? WHERE id = ?').run('en', NEW_PERSON)
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0183-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0183-old-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const person = source.client.sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string } | undefined
  if (person === undefined) throw new Error('the test database holds no person row')
  personId = person.id
  source.client.sqlite.prepare('UPDATE people SET language = ? WHERE id = ?').run('zh', personId)
  exportLib.writeExport(fullArchive)

  aSecondPerson(source, personId)
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  const first = importLib.applyImport(fullArchive)
  if (!first.applied) throw new Error('the full archive did not import')
})

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before migration 0183', () => {
  it('is what an old export writes: no language line on any person row', () => {
    expect(removedLines, 'language lines taken out').toBeGreaterThanOrEqual(2)
    expect(languageOf(target, personId)).toBe('zh')
  })

  it('imports, and the plan counts the rows that say nothing about the language', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const notes = plan.notes.filter((n) => n.includes('say nothing about the language chosen for the pages'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toContain('1 new row(s) are inserted with no language chosen, and 1 existing row(s) keep what is stored')
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
  })

  it('leaves a stored choice as it was, and inserts a new person with no language chosen', () => {
    expect(languageOf(target, personId)).toBe('zh')
    expect(languageOf(target, NEW_PERSON)).toBeNull()
  })
})
