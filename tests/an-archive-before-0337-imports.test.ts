// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0337 IMPORTS, A PICTURE ROW IT INSERTS IS DRAWN FROM THE PARTICIPANT ITS KEY NAMES,
 * AND A STORED ROW KEEPS WHAT IT IS DRAWN FROM. Re-mint piece 3d.
 *
 * Migration 0337 added `assets.drawn_from`, the digest a drawn face is drawn from. An export before it wrote no
 * `drawnFrom` line on any picture row, and its manifest does not name the migration.
 *
 *   - IT IMPORTS. A picture row the import inserts gets drawn_from null, which says the face is drawn from the participant
 *     its key names, as every face was then. A row already stored keeps its digest, so a face the re-mint renamed sends
 *     the same bytes after the import. The plan's notes count both.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out what an export before 0337
 * did not write, the way tests/an-archive-before-0280-imports.test.ts does. Every id here is made up.
 *
 * MUTATIONS, each after a control run, in src/server/lib/import.ts:
 *   · the `assets` entry of MAY_BE_ABSENT taken out → "imports, and the plan counts" and "keeps a stored digest" are red,
 *     because the plan is refused, naming the column;
 *   · the notes block for migration 0337 taken out → "imports, and the plan counts" is red, because no note counts the
 *     rows, and "keeps a stored digest" with it, because that case reads what the import before it applied.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, migrationsBefore } from './migration-fixtures.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')
type DrawingLib = typeof import('../src/server/lib/avatar-drawing.ts')

/** The made-up agents: one the re-mint renamed, the id it had before, and one whose face is added after the first export. */
const RENAMED = { kind: 'agent', id: 'MadeUpNewId1' } as const
const EARLIER = { kind: 'agent', id: 'made-up-earlier-id' } as const
const LATER = { kind: 'agent', id: 'made-up-later-agent' } as const

/** The migration that added the column, by its whole tag, and the tags an export before it wrote. */
const THE_COLUMNS_MIGRATION = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_a_drawn_face_keeps_what_it_is_drawn_from'))?.tag
if (THE_COLUMNS_MIGRATION === undefined) throw new Error('The migration journal holds no migration ending _a_drawn_face_keeps_what_it_is_drawn_from.')
const THE_TAGS_BEFORE_IT = journal(MIGRATIONS)
  .slice(0, migrationsBefore(THE_COLUMNS_MIGRATION))
  .map((entry) => entry.tag)

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let drawing: DrawingLib
let renamedKey = ''
let laterKey = ''
let removedLines = 0
let inTheOldArchive = 0
let keptBeforeTheOldImport = 0

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before 0337 wrote it: no drawnFrom line, and no migration 0337 in the manifest. */
function makeItOld(dir: string): void {
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let inAssets = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office assets') inAssets = true
      else if (line === '```') inAssets = false
      if (inAssets && line.startsWith('drawnFrom: ')) {
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
      if (text.includes(THE_COLUMNS_MIGRATION!)) throw new Error('the manifest still names migration 0337')
      if (!text.includes(THE_TAGS_BEFORE_IT.at(-1)!)) throw new Error('the manifest lost the migration before 0337 as well')
    }
    writeFileSync(file, text)
  }
}

function assetKeys(t: TestDb): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM assets ORDER BY id').all() as { id: string }[]).map((row) => row.id)
}

function drawnFromOf(t: TestDb, key: string): string | null {
  const row = t.client.sqlite.prepare('SELECT drawn_from FROM assets WHERE id = ?').get(key) as { drawn_from: string | null } | undefined
  if (row === undefined) throw new Error(`the picture row ${key} is not stored`)
  return row.drawn_from
}

function sends(t: TestDb, key: string) {
  const row = t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(key) as Record<string, unknown> | undefined
  return drawing.whatAnAssetRowSends(row, key, dirname(t.file))
}

/** One drawn picture row, as the product writes one, with the digest it is drawn from when one is given. */
async function aDrawnFace(t: TestDb, key: string, drawnFrom: string | null): Promise<void> {
  const { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME } = await import('../src/shared/participants.ts')
  t.client.sqlite
    .prepare(
      "INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source, drawn_from) VALUES (?, ?, 'default', NULL, ?, NULL, '2026-11-12 10:00:00', NULL, NULL, ?, ?)",
    )
    .run(key, AVATAR_ASSET_KIND, GENERATED_AVATAR_MIME, GENERATED_AVATAR_LICENCE, drawnFrom)
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0337-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0337-old-'))

  source = await freshDb()
  const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
  drawing = await import('../src/server/lib/avatar-drawing.ts')
  const exportLib = await import('../src/server/lib/export.ts')
  renamedKey = defaultAvatarAssetId(RENAMED)
  laterKey = defaultAvatarAssetId(LATER)
  // A FACE AS THE RE-MINT LEAVES IT: its key names the new id, and it is drawn from the id the agent had before.
  await aDrawnFace(source, renamedKey, drawing.theDigestADrawingIsMadeOf(EARLIER))
  exportLib.writeExport(fullArchive)

  await aDrawnFace(source, laterKey, null)
  inTheOldArchive = assetKeys(source).length
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = await import('../src/server/lib/import.ts')
  const first = importLib.applyImport(fullArchive)
  if (!first.applied) throw new Error('the full archive did not import')
  const stored = new Set(assetKeys(target))
  keptBeforeTheOldImport = assetKeys(source).filter((key) => stored.has(key)).length
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before migration 0337', () => {
  it('is what an old export writes: no drawnFrom line on any picture row', () => {
    expect(removedLines).toBe(inTheOldArchive)
    expect(drawnFromOf(target, renamedKey)).toBe(drawing.theDigestADrawingIsMadeOf(EARLIER))
    expect(assetKeys(target)).not.toContain(laterKey)
  })

  it('imports, and the plan counts the picture rows that say nothing about what they are drawn from', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const notes = plan.notes.filter((n) => n.includes('say nothing about what a drawn face is drawn from'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toContain(`${String(inTheOldArchive)} assets row(s) say nothing`)
    expect(notes[0]).toContain(`${String(inTheOldArchive - keptBeforeTheOldImport)} new row(s) are inserted with drawn_from null`)
    expect(notes[0]).toContain(`${String(keptBeforeTheOldImport)} existing row(s) keep what is stored`)
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
  })

  it('keeps a stored digest, so the renamed face sends the same bytes, and inserts the new row drawn from its key', () => {
    expect(drawnFromOf(target, renamedKey)).toBe(drawing.theDigestADrawingIsMadeOf(EARLIER))
    expect(sends(target, renamedKey)).toEqual(sends(source, renamedKey))
    expect(sends(target, renamedKey)).toMatchObject({ drawing: drawing.drawDefaultAvatar(EARLIER) })
    expect(drawnFromOf(target, laterKey)).toBeNull()
    expect(sends(target, laterKey)).toMatchObject({ drawing: drawing.drawDefaultAvatar(LATER) })
  })
})
