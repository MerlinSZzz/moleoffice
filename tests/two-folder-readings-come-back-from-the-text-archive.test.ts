// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE WITH TWO FOLDER READINGS ROUND-TRIPS THROUGH THE TEXT ARCHIVE, WITH BOTH ROWS BACK AND THE MANIFEST'S
 * COUNT EQUAL TO WHAT THE IMPORT READ. Wave 13s round 155.
 *
 * A folder reading carries its pieces as a JSON document, and the import reads one such row from a file and refuses
 * a file that holds more. The export wrote every reading into `folder-readings.md`, so an office with two readings
 * wrote an archive its own import refused, and a backup of it could not be restored. The export now writes one file
 * for each reading, as it does for each run.
 *
 *   - BOTH READINGS COME BACK: the archive is planned and imported into a fresh database with no refusal, the manifest
 *     counts two, the plan read two, and the two rows are stored as they were.
 *   - A MIRROR AN OLDER EXPORT WROTE IS PUT RIGHT: an export into a folder whose `folder-readings.md` still holds a
 *     reading's blocks rewrites that file, so the reading is not read twice.
 *
 * Every folder, title and quote here is made up. The agent id is made up, and the person is the test office's.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/two-folder-readings-come-back-from-the-text-archive.test.ts
 * Red before the code: at the commit before the export change, both cases fail, because the import refuses
 * `folder-readings.md` for holding two rows that carry a JSON document. After a green control, copy
 * src/server/lib/export.ts, then:
 *   1. in the loop that writes one file for each reading, push every page to `folder-readings/all.md` in place of
 *      its own path: both cases go red, as they were before the code;
 *   2. take out the line that writes `folder-readings.md`: the second case goes red, because the older file is left
 *      holding a reading's blocks.
 * Restore the file with cp after each, check it with cmp, and run the command again for green.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const PROJECT = 'default'
const AN_AGENT = 'made-up-reading-agent'
const THE_FOLDERS = ['/made-up/the-first-folder', '/made-up/the-second-folder']

const made: string[] = []
let archive: string
let mirror: string
let sourceRows: unknown[]
let intoAnEmptyOne: { plan: ReturnType<ImportLib['planImport']>; applied: boolean; rows: unknown[] }
let theMirrorsPlan: ReturnType<ImportLib['planImport']>
let firstReadingsPage: string | undefined

function aFolder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

function theReadings(t: TestDb): unknown[] {
  return t.client.sqlite.prepare('SELECT * FROM folder_readings ORDER BY id').all()
}

/** Each refusal as one line, so a red run shows what was refused. */
function said(refusals: ReturnType<ImportLib['planImport']>['refusals']): string[] {
  return refusals.map((one) => `${one.path}:${String(one.line)} ${one.problem}`)
}

/** The count of folder readings the manifest states, read from its line. */
function theManifestsCount(root: string): number | null {
  const line = /^folder_readings: (\d+)$/m.exec(readFileSync(join(root, 'MANIFEST.md'), 'utf8'))
  return line === null ? null : Number(line[1])
}

beforeAll(async () => {
  archive = aFolder('mole-office-two-readings-')
  mirror = aFolder('mole-office-two-readings-mirror-')

  const source = await freshDb()
  try {
    const folders = await import('../src/server/lib/folderreading.ts')
    const exportLib = await import('../src/server/lib/export.ts')
    for (const folder of THE_FOLDERS) {
      folders.fileAFolderReading({
        workspaceId: PROJECT,
        actorId: AN_AGENT,
        actorKind: 'agent',
        folder,
        pieces: [{ kind: 'note', title: `A made-up observation about ${folder}`, data: {}, from: ['NOTES.md'], quote: 'This is made-up material.' }],
      })
    }
    sourceRows = theReadings(source)
    if (sourceRows.length !== THE_FOLDERS.length) throw new Error(`the source holds ${String(sourceRows.length)} folder readings, and the test filed ${String(THE_FOLDERS.length)}`)
    exportLib.writeExport(archive)

    // A mirror whose `folder-readings.md` an older export wrote, holding the first reading's blocks as that export
    // put them. They are taken from the file today's export writes for that reading.
    exportLib.writeExport(mirror)
    firstReadingsPage = readdirSync(mirror, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.md') && path !== 'folder-readings.md')
      .map((path) => readFileSync(join(mirror, path), 'utf8'))
      .find((text) => text.includes(THE_FOLDERS[0]!) && text.includes('```json mole-office folder_readings.pieces'))
    writeFileSync(join(mirror, 'folder-readings.md'), `# What an agent read in a folder\n\n${firstReadingsPage ?? ''}`)
    exportLib.writeExport(mirror)
  } finally {
    source.close()
  }

  const target = await freshDb()
  try {
    const importLib = await import('../src/server/lib/import.ts')
    const plan = importLib.planImport(archive)
    const applied = plan.ok && importLib.applyImport(archive).applied
    intoAnEmptyOne = { plan, applied, rows: theReadings(target) }
    theMirrorsPlan = importLib.planImport(mirror)
  } finally {
    target.close()
  }
}, 60_000)

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('an office with two folder readings', () => {
  it('writes an archive that imports with both readings back and the manifest count equal to what was read', () => {
    expect(said(intoAnEmptyOne.plan.refusals)).toEqual([])
    expect(intoAnEmptyOne.applied).toBe(true)
    expect(theManifestsCount(archive)).toBe(THE_FOLDERS.length)
    expect(intoAnEmptyOne.plan.read['folder_readings']).toBe(THE_FOLDERS.length)
    expect(intoAnEmptyOne.rows).toEqual(sourceRows)
  })

  it('rewrites a folder-readings.md an older export left holding a reading, so the reading is read once', () => {
    expect(firstReadingsPage, 'no file but folder-readings.md holds the first reading').toBeDefined()
    expect(said(theMirrorsPlan.refusals)).toEqual([])
    expect(theMirrorsPlan.read['folder_readings']).toBe(THE_FOLDERS.length)
  })
})
