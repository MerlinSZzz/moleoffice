// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE IMPORT KEEPS THE OFFICE'S OWN OWNER, AND AN ARCHIVE FROM BEFORE THE OWNER MIGRATION STILL IMPORTS.
 *
 * The owner migration (`the_owner_comes_from_the_installer`) marks exactly one person as the office's
 * owner, in `people.office_owner`, and a unique index holds it to one. The export carries the mark on
 * every person's row. Restoring an archive is the owner's own act, and it must not be refused, so:
 *
 *   1. AN ARCHIVE WRITTEN BEFORE THE OWNER MIGRATION has no `officeOwner` line on any person. It
 *      imports. A person it inserts is not the owner; the person already marked keeps the mark.
 *   2. AN ARCHIVE WHOSE OWNER IS SOMEBODY ELSE imports, and THE OFFICE'S OWN OWNER WINS. The owner is
 *      written once, from the installer, and every migrate stops the office when MOLE_OFFICE_OWNER_ID
 *      no longer names the marked row; an archive that moved the mark would leave an office that
 *      will not start, or one handed to a person nobody named. The archive's owner is imported as a
 *      person without the mark, and the plan's notes say so, naming both.
 *
 * HOW THE ARCHIVES ARE MADE. One source office. The first archive is its export with the
 * `officeOwner` line taken out of every people block and the manifest's migration blocks from the
 * owner migration on, the way tests/an-archive-before-0183-imports.test.ts makes its archive. Then a
 * second, made-up person is added and the mark is moved to them, and the second archive is exported.
 * Both are imported, in that order, into one fresh office whose owner is the source's first owner. The
 * importer is loaded after that office is opened, because it reads the database open when it loads.
 *
 * Every name here is made up.
 *
 * MUTATION PROOFS (after a green control), in src/server/lib/import.ts:
 *   - take 'officeOwner' out of the `people` entry of MAY_BE_ABSENT: case 1 is refused again, naming the column;
 *   - stop `theOfficeKeepsItsOwner` from changing the archive's rows: case 2 is red, because the mark moves
 *     to the archive's owner (the owner's row is written first and loses it, then the other row takes it).
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const SOMEBODY_ELSE = 'made-up-other-owner'
const THE_MIGRATION = 'the_owner_comes_from_the_installer'

let source: TestDb
let beforeTheMigration: string
let otherOwner: string
let target: TestDb
let importLib: ImportLib
let removedLines = 0
let firstOwner = ''

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before the owner migration wrote it. */
function makeItOld(dir: string): void {
  const manifest = filesUnder(dir).find((file) => file.endsWith('MANIFEST.md'))
  const own = manifest === undefined ? null : new RegExp(`tag: "(\\d{4})_${THE_MIGRATION}"`).exec(readFileSync(manifest, 'utf8'))
  if (own === null) throw new Error('the manifest does not name the owner migration')
  const from = Number(own[1])
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let inPeople = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office people') inPeople = true
      else if (line === '```') inPeople = false
      if (inPeople && line.startsWith('officeOwner: ')) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "(\d{4})_[^"]*"\n```\n*/g, (block, number: string) =>
        Number(number) >= from ? '' : block,
      )
      if (text.includes(THE_MIGRATION)) throw new Error('the manifest still names the owner migration')
    }
    writeFileSync(file, text)
  }
}

function markOf(t: TestDb, id: string): string | null {
  const row = t.client.sqlite.prepare('SELECT office_owner AS mark FROM people WHERE id = ?').get(id) as { mark: string | null } | undefined
  if (row === undefined) throw new Error(`person ${id} is not stored`)
  return row.mark
}

function marked(t: TestDb): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM people WHERE office_owner IS NOT NULL').all() as { id: string }[]).map((r) => r.id)
}

beforeAll(async () => {
  beforeTheMigration = mkdtempSync(join(tmpdir(), 'mole-office-archive-owner-old-'))
  otherOwner = mkdtempSync(join(tmpdir(), 'mole-office-archive-owner-other-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const owners = marked(source)
  if (owners.length !== 1) throw new Error(`the source office has ${owners.length} owners`)
  firstOwner = owners[0] as string

  exportLib.writeExport(beforeTheMigration)
  makeItOld(beforeTheMigration)

  // A SECOND PERSON, AND THE MARK MOVED TO THEM: the archive of an office somebody else owns.
  const sqlite = source.client.sqlite
  const columns = (sqlite.prepare('PRAGMA table_info(people)').all() as { name: string }[]).map((c) => c.name)
  const others = columns.filter((c) => c !== 'id' && c !== 'handle' && c !== 'name' && c !== 'office_owner')
  sqlite
    .prepare(`INSERT INTO people (id, handle, name, ${others.join(', ')}) SELECT ?, ?, ?, ${others.join(', ')} FROM people WHERE id = ?`)
    .run(SOMEBODY_ELSE, SOMEBODY_ELSE, 'Odile Made-Up', firstOwner)
  const mark = markOf(source, firstOwner)
  sqlite.prepare('UPDATE people SET office_owner = NULL WHERE id = ?').run(firstOwner)
  sqlite.prepare('UPDATE people SET office_owner = ? WHERE id = ?').run(mark, SOMEBODY_ELSE)
  exportLib.writeExport(otherOwner)

  // THE OFFICE THE RESTORE FINDS: fresh, and its own owner is the source's first owner.
  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  if (marked(target).join() !== firstOwner) throw new Error(`the fresh office is owned by ${marked(target).join(', ')}`)
})

afterAll(() => {
  for (const dir of [beforeTheMigration, otherOwner]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive import keeps the office its own owner', () => {
  it('imports an archive written before the owner migration, and the owner keeps the mark', async () => {
    expect(removedLines, 'officeOwner lines taken out').toBeGreaterThanOrEqual(1)
    const mark = markOf(target, firstOwner)
    const plan = importLib.planImport(beforeTheMigration)
    expect(plan.refusals).toEqual([])
    const notes = plan.notes.filter((n) => n.includes('say nothing about who owns the office'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toContain(`The owner stays ${JSON.stringify(firstOwner)}`)
    expect(importLib.applyImport(beforeTheMigration).applied).toBe(true)
    expect(marked(target)).toEqual([firstOwner])
    expect(markOf(target, firstOwner)).toBe(mark)
  })

  it("imports an archive whose owner is somebody else, and the office's own owner wins", async () => {
    const mark = markOf(target, firstOwner)
    const plan = importLib.planImport(otherOwner)
    expect(plan.refusals).toEqual([])
    const notes = plan.notes.filter((n) => n.includes('marks a different person as the owner'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toContain(JSON.stringify(SOMEBODY_ELSE))
    expect(notes[0]).toContain(JSON.stringify(firstOwner))
    expect(importLib.applyImport(otherOwner).applied).toBe(true)
    expect(marked(target)).toEqual([firstOwner])
    expect(markOf(target, firstOwner)).toBe(mark)
    expect(markOf(target, SOMEBODY_ELSE)).toBeNull()
  })
})
