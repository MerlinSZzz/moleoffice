// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0280 IS REFUSED BY ITS MANIFEST, SAYING SO, AND ONCE COUNTED IT IMPORTS WITHOUT
 * ERASING A PRESS. Wave 13s round 1.
 *
 * Migration 0280 added the table `presses_for_the_person` and the column `changes.press_id`. An export before it wrote
 * neither: no presses-for-the-person.md, no count for the table in MANIFEST.md, and no `pressId` line on any change row.
 *
 *   - THE MANIFEST FENCE REFUSES IT, as it refuses an archive written before any table was added (FORMAT.md §7,
 *     `checkManifest` in src/server/lib/import.ts): a table the manifest does not count is a table whose missing rows
 *     nobody could notice. The refusal names the table and nothing is written.
 *   - A PERSON WHO ADDS THE COUNT BY HAND, `presses_for_the_person: 0`, can import it. Then ABSENT_PRESS_ID_RULE in
 *     src/server/lib/import.ts applies: a change row the import inserts gets press_id null, which says nobody recorded
 *     a press, and a stored row keeps the press it names. The plan's notes count both.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out what an export before
 * 0280 did not write, the way tests/an-archive-before-0183-imports.test.ts does. Every name here is made up.
 *
 * MUTATION, after a control run (the report of the run that added this file), in src/server/lib/import.ts:
 *   · 'pressId' taken out of the `changes` entry of MAY_BE_ABSENT → "is refused by its manifest" and "imports once the
 *     count is added" are red, because the plan is refused naming the column as well;
 *   · the call to reportAbsentPresses taken out → "imports once the count is added" is red, because no note counts the
 *     rows.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, migrationsBefore } from './migration-fixtures.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const PRESS = 'made-up-press'

/** The migration that added the presses, by its whole tag, and the tags an export before it wrote. */
const THE_PRESSES_MIGRATION = '0280_a_press_for_the_person_is_one_row'
const THE_TAGS_BEFORE_IT = journal(MIGRATIONS)
  .slice(0, migrationsBefore(THE_PRESSES_MIGRATION))
  .map((entry) => entry.tag)

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let removedLines = 0
let inTheFullArchive = 0
let inTheOldArchive = 0
let pressedRow = ''

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before 0280 wrote it: no presses page, no count, no pressId line. */
function makeItOld(dir: string): void {
  rmSync(join(dir, 'presses-for-the-person.md'))
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let inChanges = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office changes') inChanges = true
      else if (line === '```') inChanges = false
      if (inChanges && line.startsWith('pressId: ')) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "([^"]*)"\n```\n*/g, (block, tag: string) =>
        THE_TAGS_BEFORE_IT.includes(tag) ? block : '',
      )
      text = text.replace(/^presses_for_the_person: \d+\n/m, '')
      if (text.includes(THE_PRESSES_MIGRATION) || text.includes('presses_for_the_person')) throw new Error('the manifest still names the presses')
      if (!text.includes(THE_TAGS_BEFORE_IT.at(-1)!)) throw new Error('the manifest lost the migration before the presses as well')
    }
    writeFileSync(file, text)
  }
}

/** The count a person adds by hand, after the refusal names the table. */
function countThePressesByHand(dir: string): void {
  const manifest = join(dir, 'MANIFEST.md')
  const before = readFileSync(manifest, 'utf8')
  const after = before.replace(/^```mole-office manifest\n/m, '```mole-office manifest\npresses_for_the_person: 0\n')
  if (after === before) throw new Error('the manifest has no manifest block')
  writeFileSync(manifest, after)
}

function changeRows(t: TestDb): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
}

function pressOf(t: TestDb, id: string): string | null {
  const row = t.client.sqlite.prepare('SELECT press_id FROM changes WHERE id = ?').get(id) as { press_id: string | null } | undefined
  if (row === undefined) throw new Error(`change row ${id} is not stored`)
  return row.press_id
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0280-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0280-old-'))

  source = await freshDb()
  const records = await import('../src/server/lib/records.ts')
  const exportLib = await import('../src/server/lib/export.ts')
  const actor = { type: 'agent', id: 'made-up-secretary', sessionId: null, stated: true } as const
  records.createRecord({ kind: 'note', title: 'A made-up note before the press', data: { body: 'x' }, workspaceId: 'default', actor })
  // A PRESS, written straight into the tables, and the last change row naming it.
  source.client.sqlite
    .prepare("INSERT INTO presses_for_the_person (id, workspace_id, agent_id, session_id, grant_id, operation, reason, at) VALUES (?, 'default', 'made-up-secretary', NULL, 'made-up-grant', 'record.promote', 'A made-up reason.', '2026-10-21 10:00:00')")
    .run(PRESS)
  pressedRow = (source.client.sqlite.prepare('SELECT id FROM changes ORDER BY rowid DESC LIMIT 1').get() as { id: string }).id
  source.client.sqlite.prepare('UPDATE changes SET press_id = ? WHERE id = ?').run(PRESS, pressedRow)
  inTheFullArchive = changeRows(source)
  exportLib.writeExport(fullArchive)

  records.createRecord({ kind: 'note', title: 'A made-up note after the export', data: { body: 'y' }, workspaceId: 'default', actor })
  inTheOldArchive = changeRows(source)
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = await import('../src/server/lib/import.ts')
  const first = importLib.applyImport(fullArchive)
  if (!first.applied) throw new Error('the full archive did not import')
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before migration 0280', () => {
  it('is what an old export writes: no pressId line on any change row', () => {
    expect(removedLines).toBe(inTheOldArchive)
    expect(inTheOldArchive).toBeGreaterThan(inTheFullArchive)
    expect(pressOf(target, pressedRow)).toBe(PRESS)
  })

  it('is refused by its manifest, which does not count the presses, and nothing is written', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.map((one) => one.problem)).toEqual(['the manifest does not count `presses_for_the_person`, so a missing row there could not be noticed.'])
    const rows = changeRows(target)
    expect(() => importLib.applyImport(oldArchive)).toThrow(importLib.ImportRefused)
    expect(changeRows(target)).toBe(rows)
  })

  it('imports once the count is added, and the plan counts the rows that name no press', () => {
    countThePressesByHand(oldArchive)
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const notes = plan.notes.filter((n) => n.includes('carry no `pressId` line'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    const added = inTheOldArchive - inTheFullArchive
    expect(notes[0]).toContain(`${inTheOldArchive} changes row(s) in this archive carry no \`pressId\` line`)
    expect(notes[0]).toContain(`${added} new row(s) inserted with pressId null and ${inTheFullArchive} existing row(s)`)
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
  })

  it('leaves a stored press as it was, and inserts the new rows naming no press', () => {
    expect(pressOf(target, pressedRow)).toBe(PRESS)
    const named = target.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE press_id IS NOT NULL').get() as { n: number }
    expect(named.n).toBe(1)
    expect((target.client.sqlite.prepare('SELECT id FROM presses_for_the_person').all() as { id: string }[]).map((row) => row.id)).toEqual([PRESS])
  })
})
