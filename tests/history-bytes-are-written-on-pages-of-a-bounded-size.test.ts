// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HISTORY BYTES ARE WRITTEN ON NUMBERED PAGES OF A BOUNDED SIZE, AND AN IMPORT REFUSES PAGES THAT ARE COPIED OR
 * MISSING, PAGES BESIDE THE OLD history-bytes.md, AND A CAPABILITY IT DOES NOT KNOW.
 *
 * Once a store holds a registry alias, its archive carries the original JSON text of every records.data,
 * revisions.data and proved_holder. That text was one envelope in one file, and Node cannot make a string longer than
 * buffer.constants.MAX_STRING_LENGTH, so a large store could not be exported. Now the text is on numbered pages in a
 * folder, one envelope on each, and src/server/lib/registry-aliases/history-bytes.ts says how much a page holds. This
 * test reads that bound, the folder, the page names, the capability and the words of each refusal from that file.
 *
 * THE PAGES. A page takes rows in order while the JSON text of its rows, each written compactly, adds up to no more
 * than the bound, and a page always takes its first row. So every page of more than one row holds at most the bound,
 * and every page but the last would pass it with the next page's first row. The rows are in the order of the three
 * ledgers, records, revisions and changes, and in each by id. A second export of the same store into the same root
 * writes no page again.
 *
 * THE REFUSALS. A copied page holds every row twice, so the import refuses its rows as duplicates. A missing page
 * leaves rows out, so the import refuses the archive as omitting rows. history-bytes.md beside the pages is an envelope
 * off the pages, and an archive that holds both is refused. A capability one higher than the export writes is refused
 * in the words the import has always used for a capability it does not know.
 *
 * THE STORE, AND WHY IT IS THIS SIZE. Four made-up records each hold one string of double quotes, the bound divided by
 * 16 long. JSON stores each quote as two characters, and on a page each of those is escaped again, so each quote is
 * four characters there. Each record's data and its create revision's data are then about a quarter of the bound on a
 * page, and the eight rows about twice the bound, so the export makes at least two pages. With a bound of 64 MiB, the
 * store holds about 64 MiB of quotes, and the archive is about 200 MB, in the test's own folder.
 *
 * THE TIME LIMITS ARE THE TEST'S OWN. Beside each is the time it took with the file run alone (alone-pages, 13 Nov
 * 2026): the seven cases took 12.0 s together. vitest's report gives no time for a hook alone, so the setup's time is
 * worked out and not measured on its own: vitest's tests time was 19.28 s, so the setup and the cleaning up took about
 * 7.3 s together.
 *
 * Every id and value here is made up, and every office is a fresh one in the test's own folder.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { fileSyntheticAlias, inventedRegistry } from './registry-alias-fixture.ts'

const RECORDS = 4
const LEDGERS = ['records', 'revisions', 'changes'] as const
const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

type Pages = typeof import('../src/server/lib/registry-aliases/history-bytes.ts')
type Importer = typeof import('../src/server/lib/import.ts')
interface APage { path: string; envelope: { version: unknown; rows: { region: string; id: string }[] } }

let source: TestDb
let restored: TestDb | undefined
let archive: string
let pages: Pages
let importer: Importer

/** Every page in the archive's history bytes folder, in the order of its names, each with the one envelope it holds. */
async function thePages(): Promise<APage[]> {
  const { parseExportFile } = await import('../src/server/lib/export-grammar.ts')
  return readdirSync(join(archive, pages.HISTORY_BYTES_FOLDER)).sort().map((name) => {
    const path = `${pages.HISTORY_BYTES_FOLDER}/${name}`
    const regions = parseExportFile(readFileSync(join(archive, path), 'utf8'), path).regions
    expect(regions.map((region) => `${region.name} ${region.kind}`), path).toEqual(['history_bytes json'])
    return { path, envelope: regions[0]!.json as APage['envelope'] }
  })
}

/** The refusals of an import of the archive as it is now, each by where it is and what it says. */
function theRefusals(): { path: string; problem: string }[] {
  return importer.planImport(archive).refusals.map(({ path, problem }) => ({ path, problem }))
}

beforeAll(async () => {
  source = await freshDb()
  inventedRegistry(source)
  await fileSyntheticAlias(source)
  pages = await import('../src/server/lib/registry-aliases/history-bytes.ts')
  expect(pages.HISTORY_BYTES_PAGE_CHARACTERS, 'the bound of a page, as the code names it').toBeTypeOf('number')
  archive = aTestDatabaseFolder('history-bytes-pages')
  for (let n = 1; n <= RECORDS; n++) {
    const record = source.api.createRecord({
      kind: 'module',
      workspaceId: 'default',
      title: `Made-up module ${String(n)} holding quotes`,
      origin: 'fixture',
      data: { context: '"'.repeat(Math.ceil(pages.HISTORY_BYTES_PAGE_CHARACTERS / 16)) },
      actor,
    })
    const raw = JSON.stringify(source.api.getRecord(record.id)!.data, null, 2)
    source.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(raw, record.id)
    const last = source.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(record.id) as { id: string }
    source.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE id = ?').run(raw, last.id)
  }
}, 60_000) // about 7.3 s with the cleaning up, worked out as the header says

afterAll(() => {
  restored?.close()
  source?.close()
  if (archive) removeThisTestFolder(archive)
})

describe('the history bytes on pages of a bounded size', () => {
  it('are written on numbered pages, each holding rows up to the bound and no further, in the order of the ledgers and their ids', async () => {
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)
    expect(readFileSync(join(archive, 'MANIFEST.md'), 'utf8')).toMatch(new RegExp(`^historyBytes: ${String(pages.HISTORY_BYTES_VERSION)}$`, 'm'))
    expect(existsSync(join(archive, pages.HISTORY_BYTES_FILE))).toBe(false)
    const written = await thePages()
    expect(written.length).toBeGreaterThan(1)
    expect(written.map((page) => page.path)).toEqual(written.map((_, i) => pages.historyBytesPage(i + 1)))
    const size = (row: unknown) => JSON.stringify(row).length
    written.forEach(({ path, envelope }, i) => {
      expect(envelope.version, path).toBe(pages.HISTORY_BYTES_VERSION)
      expect(envelope.rows.length, path).toBeGreaterThan(0)
      const held = envelope.rows.reduce((sum, row) => sum + size(row), 0)
      if (envelope.rows.length > 1) expect(held, `${path} holds no more than the bound`).toBeLessThanOrEqual(pages.HISTORY_BYTES_PAGE_CHARACTERS)
      const next = written[i + 1]?.envelope.rows[0]
      if (next !== undefined) expect(held + size(next), `${path} with the next page's first row passes the bound`).toBeGreaterThan(pages.HISTORY_BYTES_PAGE_CHARACTERS)
    })
    const order = written.flatMap((page) => page.envelope.rows.map((row) => `${row.region} ${row.id}`))
    const held = LEDGERS.flatMap((table) => (source.client.sqlite.prepare(`SELECT id FROM ${table} ORDER BY id`).pluck().all() as string[]).map((id) => `${table} ${id}`))
    expect(order).toEqual(held)
  }, 120_000) // took 3.0 s alone

  it('are the same pages when the same store is exported into the same root again', async () => {
    const exporter = await import('../src/server/lib/export.ts')
    const again = exporter.writeExport(archive)
    expect(again.written.filter((path) => path.startsWith(`${pages.HISTORY_BYTES_FOLDER}/`))).toEqual([])
    expect(again.removed).toEqual([])
  }, 120_000) // took 2.5 s alone

  it('import into a fresh office with no refusal', async () => {
    restored = await freshDb()
    importer = await import('../src/server/lib/import.ts')
    expect(theRefusals()).toEqual([])
  }, 120_000) // took 1.4 s alone

  it('are refused, when one page is copied, for holding a row twice', () => {
    const copy = pages.historyBytesPage(readdirSync(join(archive, pages.HISTORY_BYTES_FOLDER)).length + 1)
    cpSync(join(archive, pages.historyBytesPage(1)), join(archive, copy))
    try {
      expect(theRefusals()).toContainEqual({ path: copy, problem: expect.stringContaining(pages.HISTORY_BYTES_REFUSALS.duplicate) })
    } finally {
      rmSync(join(archive, copy))
    }
  }, 120_000) // took 1.1 s alone

  it('are refused, when one page is missing, for omitting rows', () => {
    const lost = join(archive, pages.historyBytesPage(2)), kept = readFileSync(lost)
    rmSync(lost)
    try {
      expect(theRefusals().map((refusal) => refusal.problem)).toContainEqual(expect.stringContaining(pages.HISTORY_BYTES_REFUSALS.omitted))
    } finally {
      writeFileSync(lost, kept)
    }
  }, 120_000) // took 0.8 s alone

  it('are refused beside the old history-bytes.md, as an envelope off the pages', () => {
    writeFileSync(join(archive, pages.HISTORY_BYTES_FILE), readFileSync(join(archive, pages.historyBytesPage(1))))
    try {
      expect(theRefusals()).toContainEqual({ path: pages.HISTORY_BYTES_FILE, problem: expect.stringContaining(pages.HISTORY_BYTES_REFUSALS.offThePages) })
    } finally {
      rmSync(join(archive, pages.HISTORY_BYTES_FILE))
    }
  }, 120_000) // took 1.3 s alone

  it('are refused under a capability the import does not know, in the words it has always used', () => {
    const manifest = join(archive, 'MANIFEST.md'), declared = readFileSync(manifest, 'utf8')
    const unknown = declared.replace(new RegExp(`^historyBytes: ${String(pages.HISTORY_BYTES_VERSION)}$`, 'm'), `historyBytes: ${String(pages.HISTORY_BYTES_VERSION + 1)}`)
    expect(unknown).not.toBe(declared)
    writeFileSync(manifest, unknown)
    try {
      expect(theRefusals()).toContainEqual({ path: 'MANIFEST.md', problem: pages.HISTORY_BYTES_REFUSALS.unsupported })
    } finally {
      writeFileSync(manifest, declared)
    }
    expect(theRefusals()).toEqual([])
  }, 120_000) // took 1.9 s alone
})
