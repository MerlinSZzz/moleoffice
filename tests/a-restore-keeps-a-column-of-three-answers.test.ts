// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTORE KEEPS A PROJECT'S PACKAGE-INSPECTION COLUMN OF THREE ANSWERS: A PROJECT THAT HAS CHOSEN NOTHING IS
 * STILL UNCHOSEN AFTERWARDS, AND THE OFFICE STILL READS IT AS ON.
 *
 * `workspaces.packageInspection` is true, false, or null, and null is nobody having chosen, which
 * `packageInspectionOf` in src/shared/workspaces.ts reads as on. The export writes the column through the boolean
 * reader in src/server/lib/export.ts, which keeps a null in a column that may hold one. An export that wrote a null
 * as false would turn a project's inspection off on a restore. Nothing wrote a null, exported it and read it back.
 *
 * WHAT THIS FILE ASKS. A made-up office holds a made-up project whose package inspection is null. It exports the
 * office, reads the archive's own line for that project, imports the archive into a fresh made-up office, and reads
 * the value back from the table. The project must still be null there, and the office must read it as on.
 *
 * MUTATION, after a control run, in src/server/lib/export.ts: the null-keeping branch of the boolean writer taken
 * out, so a null is written as false. The archive line and the restored value both become false, and the file is red.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { packageInspectionOf } from '../src/shared/workspaces.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

/** The made-up project. Its package inspection is never chosen, so the column stays null. */
const PROJECT = 'made-up-unchosen-inspection'
const AT = '2026-11-18 12:00:00'

let source: TestDb
let target: TestDb
let archive: string
let importLib: ImportLib

function packageInspectionOfProject(t: TestDb): boolean | null {
  const row = t.client.sqlite.prepare('SELECT package_inspection FROM workspaces WHERE id = ?').get(PROJECT) as
    | { package_inspection: number | null }
    | undefined
  if (row === undefined) throw new Error(`the project ${PROJECT} is not stored`)
  return row.package_inspection === null ? null : row.package_inspection !== 0
}

/** The `packageInspection` line the archive writes for one project, read from its own heading and block. */
function packageInspectionLineOf(dir: string): string {
  let inOurProject = false
  let inTheBlock = false
  for (const line of readFileSync(join(dir, 'workspaces.md'), 'utf8').split('\n')) {
    if (line.startsWith(`### ${PROJECT} — `)) inOurProject = true
    else if (line.startsWith('### ')) inOurProject = false
    else if (inOurProject && line === '```mole-office workspaces') inTheBlock = true
    else if (inTheBlock && line === '```') inTheBlock = false
    else if (inTheBlock && line.startsWith('packageInspection: ')) return line
  }
  throw new Error(`the archive has no packageInspection line for ${PROJECT}`)
}

beforeAll(async () => {
  archive = mkdtempSync(join(tmpdir(), 'mole-office-archive-unchosen-inspection-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  source.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, package_inspection, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
    .run(PROJECT, 'A made-up project that has chosen nothing', AT, AT)
  exportLib.writeExport(archive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(archive)
}, 60_000)

afterAll(() => {
  rmSync(archive, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe("a project's package inspection, which has three answers", () => {
  it('is written as a null when nobody has chosen, and is null in the office it came from', () => {
    expect(packageInspectionOfProject(source)).toBeNull()
    expect(packageInspectionLineOf(archive)).toBe('packageInspection: null')
  })

  it('is still null after the restore, and the office reads it as on', () => {
    expect(packageInspectionOfProject(target)).toBeNull()
    expect(packageInspectionOf(packageInspectionOfProject(target))).toBe(true)
  })
})
