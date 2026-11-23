// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0356 IS REFUSED BY ITS MANIFEST, SAYING SO, AND ONCE COUNTED IT IMPORTS WITHOUT
 * ERASING THE MOMENT THIS OFFICE BEGAN TO KEEP THE HAND-OVERS OF AN AGENT'S OWNER.
 *
 * Migration 0356 added the table `agent_owner_changes` and the column `installation.owner_changes_since`. An export
 * before it wrote neither: no page for the table, no count for it in MANIFEST.md, and no `ownerChangesSince` line on the
 * installation row.
 *
 *   - THE MANIFEST FENCE REFUSES IT, as it refuses an archive written before any other table was added (FORMAT.md §7,
 *     `checkManifest` in src/server/lib/import.ts, and tests/an-archive-before-0280-imports.test.ts). The refusal names
 *     the table and nothing is written.
 *   - A PERSON WHO ADDS THE COUNT BY HAND, `agent_owner_changes: 0`, can import it. The installation row may leave the
 *     column out: one the import inserts says nobody recorded the moment, and one already stored keeps its moment. The
 *     plan's notes count both.
 *   - AN ARCHIVE WRITTEN SINCE CARRIES THE MOMENT, and its import sets it.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out what an export before
 * 0356 did not write, the way tests/an-archive-before-0280-imports.test.ts does. Every moment here is made up.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, migrationsBefore } from './migration-fixtures.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

/** The migration that added the table and the column, by its whole tag, and the tags an export before it wrote. */
const THE_MIGRATION = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_an_agent_keeps_its_owner_hand_overs'))?.tag
if (THE_MIGRATION === undefined) throw new Error('The migration journal holds no migration ending _an_agent_keeps_its_owner_hand_overs.')
const THE_TAGS_BEFORE_IT = journal(MIGRATIONS)
  .slice(0, migrationsBefore(THE_MIGRATION))
  .map((entry) => entry.tag)

/** The table's page in an archive, and the made-up moments: the source's, and one the target holds before the import. */
const THE_PAGE = join('schema-parts', 'agent_owner_changes.md')
const THE_SOURCES_DAY = '2026-11-20 09:00:00'
const THE_TARGETS_DAY = '2026-11-21 08:00:00'

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let removedLines = 0
let fullLines: string[] = []

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** The `ownerChangesSince` lines of the installation row, in every page of an archive. */
function dayLinesIn(dir: string): string[] {
  const found: string[] = []
  for (const file of filesUnder(dir)) {
    let inInstallation = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office installation') inInstallation = true
      else if (line === '```') inInstallation = false
      if (inInstallation && line.startsWith('ownerChangesSince: ')) found.push(line)
    }
  }
  return found
}

/** Make the archive look as an export before 0356 wrote it: no page, no count, no ownerChangesSince line. */
function makeItOld(dir: string): void {
  rmSync(join(dir, THE_PAGE))
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let inInstallation = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office installation') inInstallation = true
      else if (line === '```') inInstallation = false
      if (inInstallation && line.startsWith('ownerChangesSince: ')) {
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
      text = text.replace(/^agent_owner_changes: \d+\n/m, '')
      if (text.includes(THE_MIGRATION!) || text.includes('agent_owner_changes')) throw new Error('the manifest still names the hand-overs')
      if (!text.includes(THE_TAGS_BEFORE_IT.at(-1)!)) throw new Error('the manifest lost the migration before the hand-overs as well')
    }
    writeFileSync(file, text)
  }
}

/** The count a person adds by hand, after the refusal names the table. */
function countTheHandOversByHand(dir: string): void {
  const manifest = join(dir, 'MANIFEST.md')
  const before = readFileSync(manifest, 'utf8')
  const after = before.replace(/^```mole-office manifest\n/m, '```mole-office manifest\nagent_owner_changes: 0\n')
  if (after === before) throw new Error('the manifest has no manifest block')
  writeFileSync(manifest, after)
}

function theDayOf(t: TestDb): string | null {
  return t.client.sqlite.prepare('SELECT owner_changes_since FROM installation WHERE only_row = 1').pluck().get() as string | null
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0356-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0356-old-'))

  source = await freshDb()
  const exportLib = await import('../src/server/lib/export.ts')
  const set = source.client.sqlite.prepare('UPDATE installation SET owner_changes_since = ? WHERE only_row = 1').run(THE_SOURCES_DAY)
  if (set.changes !== 1) throw new Error('the source office has no installation row')
  exportLib.writeExport(fullArchive)
  fullLines = dayLinesIn(fullArchive)
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = await import('../src/server/lib/import.ts')
  const held = target.client.sqlite.prepare('UPDATE installation SET owner_changes_since = ? WHERE only_row = 1').run(THE_TARGETS_DAY)
  if (held.changes !== 1) throw new Error('the target office has no installation row')
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before migration 0356', () => {
  it('is what an old export writes: no page for the hand-overs and no ownerChangesSince line, where today’s export writes both', () => {
    expect(existsSync(join(fullArchive, THE_PAGE)), 'today’s export writes the page of the hand-overs').toBe(true)
    expect(fullLines).toHaveLength(1)
    expect(fullLines[0]).toContain(THE_SOURCES_DAY)
    expect(removedLines).toBe(1)
    expect(existsSync(join(oldArchive, THE_PAGE))).toBe(false)
    expect(dayLinesIn(oldArchive)).toEqual([])
  })

  it('is refused by its manifest, which does not count the hand-overs, and nothing is written', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.ok).toBe(false)
    expect(plan.refusals.map((one) => one.problem)).toEqual(['the manifest does not count `agent_owner_changes`, so a missing row there could not be noticed.'])
    expect(() => importLib.applyImport(oldArchive)).toThrow(importLib.ImportRefused)
    expect(theDayOf(target)).toBe(THE_TARGETS_DAY)
  })

  it('imports once the count is added, the plan counts the installation row that says nothing about the moment, and the stored moment stays', () => {
    countTheHandOversByHand(oldArchive)
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const notes = plan.notes.filter((n) => n.includes('before migration 0356'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toContain('1 installation row(s) say nothing')
    expect(notes[0]).toContain('0 new row(s) are inserted')
    expect(notes[0]).toContain('1 existing row(s) keep what is stored')
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
    expect(theDayOf(target)).toBe(THE_TARGETS_DAY)
  })

  it('sets the moment an archive written since carries', () => {
    expect(importLib.applyImport(fullArchive).applied).toBe(true)
    expect(theDayOf(target)).toBe(THE_SOURCES_DAY)
  })
})
