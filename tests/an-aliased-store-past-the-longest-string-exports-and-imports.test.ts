// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORE WITH A REGISTRY ALIAS WHOSE STORED JSON TEXT PASSES THE LONGEST STRING ONCE ESCAPED EXPORTS, AND IT IMPORTS
 * INTO A FRESH OFFICE WITH EVERY STORED TEXT THE SAME, BYTE FOR BYTE.
 *
 * Once a store holds a registry alias, the export also writes the original JSON text of every records.data,
 * revisions.data and proved_holder, so that an import stores the same bytes and not only the same value. A re-mint is
 * what files the aliases. That text was written as one JSON string, and Node cannot make a string longer than
 * buffer.constants.MAX_STRING_LENGTH. So the export of a large store after a re-mint failed with "Invalid string
 * length" and wrote nothing.
 *
 * THE STORE, AND WHY IT IS THIS SIZE. Eight made-up records each hold one string of double quotes. JSON stores each
 * quote as two characters, \", and the original text in the archive escapes both of them again, so each quote is four
 * characters there. A record's create revision holds the same data, so each quote is stored twice and written eight
 * times. The test reads the limit and gives each record the limit divided by 64, and one quote more, so the escaped
 * text passes the limit. With Node 22's limit of 536,870,888 characters, that is 8,388,609 quotes a record. Then
 * records.data and revisions.data hold about 268 million characters, and as each is one byte, about 268 MB. Quotes keep
 * the store small: letters would need twice as many characters, because a letter is not escaped. Eight records keep
 * each record's own page, about 17 million characters, far under the limit. After the fix the archive is about 805 MB
 * on disk and the office it is imported into about 270 MB more, all in the test's own folders.
 *
 * THE STORED TEXT IS NOT THE TEXT AN IMPORT WOULD WRITE FROM THE VALUE. Each record's data and its revision's data are
 * stored pretty-printed, as tests/registry-alias-archives.test.ts stores them. An import that dropped the original text
 * and wrote the value again would store other bytes, and the last case would name every such row.
 *
 * THE TIME LIMITS ARE THE TEST'S OWN, because vitest gives a case 5 s and a hook 10 s. Beside each is the time it took
 * with the file run alone (after-big, 13 Nov 2026): the cases took 1.1 s, 10.2 s and 13.6 s, the file 24.9 s. vitest's
 * report gives no time for a hook alone, so the setup's time is worked out and not measured on its own: vitest's tests
 * time was 37.45 s, so the setup and the cleaning up took about 12.5 s together.
 *
 * Every id and value here is made up, and every office is a fresh one in the test's own folder.
 */
import { constants } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { fileSyntheticAlias, inventedRegistry } from './registry-alias-fixture.ts'

/** The longest string Node can make, read and never typed. */
const THE_LONGEST_STRING = constants.MAX_STRING_LENGTH

/** Eight records, each holding the limit divided by 64 quotes and one more. Why 64 is in the header. */
const RECORDS = 8
const QUOTES_A_RECORD = Math.ceil(THE_LONGEST_STRING / 64) + 1

/** The three ledgers whose stored JSON text the archive keeps as it was. */
const LEDGERS = ['records', 'revisions', 'changes'] as const

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let source: TestDb
let restored: TestDb | undefined
let archive: string
const madeUp: string[] = []

/** Each stored text of records.data and revisions.data, one row at a time, with its length once escaped. */
function escapedLengthOfTheStoredText(t: TestDb): number {
  let length = 0
  for (const table of ['records', 'revisions'] as const) {
    for (const row of t.client.sqlite.prepare(`SELECT data FROM ${table}`).iterate() as Iterable<{ data: string | null }>) {
      if (row.data !== null) length += JSON.stringify(row.data).length - 2
    }
  }
  return length
}

/**
 * Every place where the restored office does not hold the source's row as the source stores it: each column's type and
 * its bytes, read from each store as a blob. One row at a time, so neither office is held whole.
 */
function whereTheRestoredStoreDiffers(from: TestDb, into: TestDb): { compared: number; differences: string[] } {
  const differences: string[] = []
  let compared = 0
  for (const table of LEDGERS) {
    const columns = (from.client.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((c) => c.name)
    const read = `SELECT ${columns.map((c, i) => `typeof("${c}") AS t${String(i)}, CAST("${c}" AS BLOB) AS b${String(i)}`).join(', ')} FROM ${table} WHERE id = ?`
    const [theSourceRow, theRestoredRow] = [from.client.sqlite.prepare(read), into.client.sqlite.prepare(read)]
    // The ids are read first, because a connection that is iterating cannot answer another query.
    const ids = from.client.sqlite.prepare(`SELECT id FROM ${table} ORDER BY id`).pluck().all() as string[]
    for (const id of ids) {
      const was = theSourceRow.get(id) as Record<string, string | Buffer | null>
      const now = theRestoredRow.get(id) as Record<string, string | Buffer | null> | undefined
      compared += 1
      if (now === undefined) {
        differences.push(`${table} ${id}: the restored office holds no such row`)
        continue
      }
      columns.forEach((column, i) => {
        const [a, b] = [was[`b${String(i)}`] ?? null, now[`b${String(i)}`] ?? null]
        const sameBytes = a === null || b === null ? a === b : Buffer.compare(a as Buffer, b as Buffer) === 0
        if (was[`t${String(i)}`] !== now[`t${String(i)}`] || !sameBytes) differences.push(`${table} ${id} ${column}`)
      })
    }
  }
  return { compared, differences }
}

beforeAll(async () => {
  source = await freshDb()
  inventedRegistry(source)
  await fileSyntheticAlias(source)
  archive = aTestDatabaseFolder('alias-archive-past-the-longest-string')
  for (let n = 1; n <= RECORDS; n++) {
    const record = source.api.createRecord({
      kind: 'module',
      workspaceId: 'default',
      title: `Made-up module ${String(n)} holding quotes`,
      origin: 'fixture',
      data: { context: '"'.repeat(QUOTES_A_RECORD) },
      actor,
    })
    madeUp.push(record.id)
    const raw = JSON.stringify(source.api.getRecord(record.id)!.data, null, 2)
    source.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(raw, record.id)
    const last = source.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(record.id) as { id: string }
    source.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE id = ?').run(raw, last.id)
  }
}, 120_000) // about 12.5 s with the cleaning up, worked out as the header says

afterAll(() => {
  restored?.close()
  source?.close()
  if (archive) removeThisTestFolder(archive)
})

describe('a store with a registry alias whose stored JSON text passes the longest string once escaped', () => {
  it('holds stored JSON text that is longer than the longest string once escaped', () => {
    expect(madeUp).toHaveLength(RECORDS)
    expect(escapedLengthOfTheStoredText(source)).toBeGreaterThan(THE_LONGEST_STRING)
  })

  it('exports, and the archive says it carries the original text', async () => {
    const lib = await import('../src/server/lib/export.ts')
    lib.writeExport(archive)
    expect(readFileSync(join(archive, 'MANIFEST.md'), 'utf8')).toMatch(/^historyBytes: \d+$/m)
  }, 300_000) // took 10.2 s alone

  it('imports into a fresh office, which then stores every row of the three ledgers with the same bytes', async () => {
    restored = await freshDb()
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    const { compared, differences } = whereTheRestoredStoreDiffers(source, restored)
    expect(differences).toEqual([])
    expect(compared).toBeGreaterThanOrEqual(2 * RECORDS)
  }, 300_000) // took 13.6 s alone
})
