// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE THE RENAME IS STILL READABLE, AND SAYS SO.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FAILURE THIS CLOSES
 * ---------------------------------------------------------------------------------------------
 *
 * This product was called PanelX until 28 August 2026. Its archives carry three marks of that
 * name: the manifest's `format: "panelx-export/1"`, the front matter key `panelx: "records"`, and
 * the fence language ```` ```panelx records ````.
 *
 * Renaming all three in the writer and not in the reader makes every archive taken before that day
 * unrestorable — and the failure appears at restore time, which is the one moment somebody cannot
 * afford it. Measured on the owner's own `data/mirror` on 28 August 2026: with the legacy branches
 * removed, 440 of its files were refused with "front matter must name its region" and the manifest
 * was not found at all.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS IS THE ONE COMPATIBILITY ALIAS IN THE WHOLE RENAME, AND IT IS READ-ONLY
 * ---------------------------------------------------------------------------------------------
 *
 * The environment variables got a refusal instead of an alias. The HTTP headers got a refusal. The
 * workspace id was left alone. This is the only place where two names are both accepted, and it is
 * owed because the archives already exist and cannot be rewritten by anybody but their owner.
 *
 * THE WRITER ONLY EVER WRITES THE NEW FORM. So a legacy archive imported and re-exported comes
 * back in the new form, and the alias stops mattering for it from then on. Nothing carries two
 * names forward.
 *
 * AND IT IS ANNOUNCED. The plan's notes say which version was read, in words, so an old archive is
 * never read in silence. That is asserted below, because silence is exactly what the format's own
 * version check exists to prevent.
 *
 * WHEN THIS CAN GO: when the owner confirms no archive written before 28 August 2026 is still
 * needed. Removing it is one constant, one branch in `parseExportFile`, one branch in the FENCE
 * pattern, and this file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let source: TestDb
let target: TestDb
let archive: string
let exportLib: ExportLib

/** Turn a freshly written archive into the form this product wrote before 28 August 2026. */
function windBackToTheOldForm(root: string): number {
  let files = 0
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith('.md')) continue
      const before = readFileSync(full, 'utf8')
      const after = before
        .replace(/^region: /m, 'panelx: ')
        .replaceAll('```json mole-office ', '```json panelx ')
        .replaceAll('```mole-office ', '```panelx ')
        .replace('format: "mole-office-export/2"', 'format: "panelx-export/1"')
      if (after !== before) files += 1
      writeFileSync(full, after, 'utf8')
    }
  }
  walk(root)
  return files
}

beforeAll(async () => {
  source = await freshDb()
  exportLib = (await import('../src/server/lib/export.ts')) as ExportLib

  source.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'Written while this was called Mole Office',
    summary: 'The title is deliberate: a record made before the rename is not rewritten by it.',
    data: {},
    actor: HUMAN,
  })

  archive = mkdtempSync(join(tmpdir(), 'mole-office-legacy-archive-'))
  exportLib.writeExport(archive)

  target = await freshDb()
})

afterAll(async () => {
  await source?.close()
  await target?.close()
  rmSync(archive, { recursive: true, force: true })
})

describe('the three marks of the old name are all in a freshly written archive once wound back', () => {
  it('changes the manifest, the front matter and the fences, or this file tests nothing', () => {
    const changed = windBackToTheOldForm(archive)
    expect(changed, 'nothing in the archive was wound back, so the import below proves nothing').toBeGreaterThan(0)

    const manifest = readFileSync(join(archive, 'MANIFEST.md'), 'utf8')
    expect(manifest).toContain('format: "panelx-export/1"')
    expect(manifest, 'the manifest still carries the new version').not.toContain('mole-office-export/2')

    const record = readdirSync(join(archive, 'records', 'note'))[0] ?? ''
    const text = readFileSync(join(archive, 'records', 'note', record), 'utf8')
    expect(text).toContain('panelx: "records"')
    expect(text, 'a JSON fence still names the new language').toContain('```json panelx ')

    // And a plain fence somewhere in the archive, since a record with no stored data has only the
    // JSON one. Both forms are separate branches of the FENCE pattern, so both have to be here.
    const everything = readdirSync(archive)
      .map((name) => join(archive, name))
      .filter((full) => statSync(full).isFile())
      .map((full) => readFileSync(full, 'utf8'))
      .join('\n')
    expect(everything.replace(/```json panelx /g, ''), 'no plain fence was wound back').toContain('```panelx ')
    expect(everything, 'a fence still names the new language').not.toContain('```mole-office ')
  })
})

describe('the importer reads it', () => {
  it('refuses nothing about the format, the region or the fences', async () => {
    const lib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = lib.planImport(archive)
    expect(plan.refusals.map((r) => `${r.path}:${r.line} ${r.problem}`)).toEqual([])
  })

  it('says in its notes which version it read, so an old archive is never read in silence', async () => {
    const lib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = lib.planImport(archive)
    const said = plan.notes.join('\n')
    expect(said).toContain('panelx-export/1')
    expect(said).toContain('28 August 2026')
    expect(said).toContain('mole-office-export/2')
  })

  it('puts the record back, with the title it was written under', async () => {
    const lib = (await import('../src/server/lib/import.ts')) as ImportLib
    const report = lib.applyImport(archive)
    expect(report.refusals ?? []).toEqual([])
    const back = target.api.getRecordByTitle('Written while this was called Mole Office', 'default')
    expect(back?.title).toBe('Written while this was called Mole Office')
  })

  it('says nothing about a version when the archive is a current one', async () => {
    // The control for the note above. A message printed on every import would tell a reader
    // nothing, and would not be evidence that an OLD archive was recognised as old.
    const fresh = mkdtempSync(join(tmpdir(), 'mole-office-current-archive-'))
    try {
      exportLib.writeExport(fresh)
      const lib = (await import('../src/server/lib/import.ts')) as ImportLib
      const plan = lib.planImport(fresh)
      expect(plan.notes.join('\n')).not.toContain('panelx-export/1')
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })
})
