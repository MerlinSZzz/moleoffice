// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT READS THE STORE READ-ONLY, AND READS ITS HISTORY ONE ROW AT A TIME. Wave 13s round 187, item 1.
 *
 * `npx tsx scripts/export.ts` opened the store through the office's own client, which switches the file to write-ahead
 * logging as it opens it, so an export changed a store it only read. And it read every table whole before it wrote a
 * file, so it ran out of memory on a store larger than its heap. Cases:
 *   1. the command on a made-up store in journal mode delete exits 0 and leaves the file's bytes, its journal mode and
 *      the folder beside it as they were;
 *   2. the command, given a heap of HEAP_MB, exports a made-up store larger than that heap: it exits 0, counts every
 *      record, revision and change row, writes a page for every revision, and leaves the store as it was;
 *   3. the handle the command opens is read-only, and refuses a write. A store that is not there is refused, and no
 *      file is made in its place;
 *   4. a revision whose seq is 0 is refused, and nothing is written: every refusal comes before the first file;
 *   5. a change row written by another connection while the command writes its files is in none of them, and is not
 *      counted: one export reads one moment of the store;
 *   6. a day whose stamps do not sort together, and stamps with no day, still give one page each, holding every row.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-export-reads-the-store-read-only-and-one-row-at-a-time.test.ts
 * After a green control, copy src/server/lib/export.ts, src/server/lib/the-store-to-export.ts and scripts/export.ts,
 * then make one of these changes:
 *   1. in export.ts, put `null` in place of `theStoreGivenToTheExport()`: the export loads the office's client, which
 *      switches the store to write-ahead logging, and cases 1 and 2 go red;
 *   2. in export.ts, put `'./records.ts'` in place of `'./panel-error.ts'`: records.ts loads the client, and cases 1 and
 *      2 go red;
 *   3. in export.ts, put `.all(` in place of `.iterate(` in `eachRowOf`: the revisions are read whole, the command runs
 *      out of memory, and case 2 goes red;
 *   4. in the-store-to-export.ts, delete `readonly: true`: the handle can write and a missing store is made, and case 3
 *      goes red;
 *   5. in export.ts, delete the line `exportFileByFile(opts, () => {})`: pages are written before the refusal, and case
 *      4 goes red;
 *   6. in export.ts, put `writeEachFile(root, opts)` in place of `inOneReading(() => writeEachFile(root, opts))`: the
 *      change log is read after the other connection's write, and case 5 goes red;
 *   7. in export.ts, delete the line `if (!at.startsWith(day)) keptBack.set(day, [])`: a day and the undated rows get
 *      two pages each, and case 6 goes red;
 *   8. in scripts/export.ts, move the line that imports lib/export.ts above `const store = openTheStoreToExport()`: the
 *      export loads the client before the store is given to it, the client makes the missing store, and cases 1 to 3
 *      go red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, note, stamp and block of words here is made up, in a throwaway office. Each command is given only PATH,
 * LANG, a made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** The heap the command is given in case 2, in MiB. The made-up store there is larger. */
const HEAP_MB = 192
/** A made-up change row: its id, the record it names and its stamp. */
const A_CHANGE_ROW =
  "INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, workspace_id, append_order) VALUES (?, ?, 'update', 'agent', 'made-up-agent', NULL, 'data', NULL, 'a made-up value', ?, 'default', (SELECT coalesce(max(append_order), 0) + 1 FROM changes))"

let t: TestDb
let lib: typeof import('../src/server/lib/export.ts')
/** A copy of the office in journal mode delete, and a copy of that with made-up history larger than HEAP_MB. */
let small: string
let big: string

beforeAll(async () => {
  t = await freshDb()
  // IMPORTED BEFORE CASE 3 OPENS A STORE IN THIS PROCESS, so cases 4 and 6 read the office's own handle.
  lib = await import('../src/server/lib/export.ts')
  for (const n of [1, 2, 3]) {
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `A made-up note ${n}`, data: { body: `Made-up words ${n}.` }, actor: HUMAN })
    t.api.updateRecord(note.id, { data: { body: `Made-up words ${n}, written again.` } }, HUMAN)
  }
  small = join(folder(), 'small.db')
  t.client.sqlite.prepare('VACUUM INTO ?').run(small)
  const db = new Database(small)
  db.pragma('journal_mode = DELETE')
  db.close()
  big = join(folder(), 'big.db')
  aStoreLargerThanTheHeap(small, big)
  expect(statSync(big).size).toBeGreaterThan(HEAP_MB * 1024 * 1024)
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

/**
 * A COPY OF `from` WITH MADE-UP HISTORY OF ABOUT 255 MB: 120 notes, each with 20 revisions and 20 change rows, and
 * every revision's data about 100,000 bytes, as the made-up stores this round was measured on.
 */
function aStoreLargerThanTheHeap(from: string, to: string): void {
  copyFileSync(from, to)
  const db = new Database(to)
  try {
    const aRecord = db.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) VALUES (?, 'default', 'made-up-owner', ?, ?, 'note', ?, NULL, ?, NULL, 'fixture')")
    const aRevision = db.prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, session_id, at, note) VALUES (?, ?, 'default', ?, ?, 'note', ?, NULL, ?, NULL, ?, 'agent', 'made-up-agent', NULL, ?, NULL)")
    const aChange = db.prepare("INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, workspace_id, append_order) VALUES (?, ?, ?, 'agent', 'made-up-agent', NULL, 'data', ?, ?, ?, 'default', ?)")
    let order = (db.prepare('SELECT coalesce(max(append_order), 0) AS n FROM changes').get() as { n: number }).n
    const id = (prefix: string, i: number) => (prefix + String(i).padStart(11, '0')).slice(-12)
    const stamp = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString().slice(0, 19).replace('T', ' ')
    const aBlock = (i: number) => {
      const line = `Made-up words of block ${String(i)}, for an export measured against its heap; nothing here is real. `
      return line.repeat(Math.ceil(100_000 / line.length)).slice(0, 100_000)
    }
    db.transaction(() => {
      for (let r = 0; r < 120; r++) {
        const recordId = id('r', r)
        const title = `A made-up note of history ${String(r)}`
        let last = { data: '', at: '' }
        for (let s = 1; s <= 20; s++) {
          const i = r * 20 + s
          const data = JSON.stringify({ body: aBlock(i) })
          const at = stamp(i)
          aRevision.run(id('v', i), recordId, s, `h${String(i).padStart(15, '0')}`, title, data, s === 1 ? 'create' : 'update', at)
          aChange.run(id('c', i), recordId, s === 1 ? 'create' : 'update', s === 1 ? null : 'an older made-up value', `a newer made-up value ${String(s)}`, at, ++order)
          last = { data, at }
        }
        aRecord.run(recordId, stamp(r * 20 + 1), last.at, title, last.data)
      }
    })()
  } finally {
    db.close()
  }
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
/** The real export command, `npx tsx scripts/export.ts --to <to> --no-commit`, on `database`, with only PATH, LANG, a made-up home and MOLE_OFFICE_DB. */
function theExportCommand(database: string, to: string, options: { heapMb?: number; json?: boolean; preload?: string } = {}): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const args = [
    ...(options.heapMb === undefined ? [] : [`--max-old-space-size=${String(options.heapMb)}`]),
    ...(options.preload === undefined ? [] : ['--import', options.preload]),
    '--import', 'tsx', 'scripts/export.ts', '--to', to, '--no-commit',
    ...(options.json === true ? ['--json'] : []),
  ]
  const it = spawnSync(process.execPath, args, {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}

/** The command's report, read from the first line that opens an object, so a line a module prints as it loads is passed over. */
function theReportIn(stdout: string): { counts: Record<string, number> } {
  const lines = stdout.split('\n')
  const first = lines.findIndex((line) => line.startsWith('{'))
  expect(first, stdout.slice(0, 2000)).toBeGreaterThanOrEqual(0)
  return JSON.parse(lines.slice(first).join('\n')) as { counts: Record<string, number> }
}

/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
/** What a read-only look at the file says, which makes no file beside a store in journal mode delete. */
function aLookAt<T>(file: string, look: (db: Database.Database) => T): T {
  const db = new Database(file, { readonly: true })
  try {
    return look(db)
  } finally {
    db.close()
  }
}
const theJournalModeOf = (file: string) => aLookAt(file, (db) => db.pragma('journal_mode', { simple: true }))
const theRowsIn = (file: string, table: string) => aLookAt(file, (db) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)

/**
 * A TEST STAND-IN, loaded before the command: on the command's first write of a file under `to`, another connection
 * writes the made-up change row `written` into `database`, and the stand-in leaves the file `mark` to say it did.
 */
function aSecondWriter(database: string, to: string, written: string, mark: string): string {
  const at = join(folder(), 'a-second-writer.mjs')
  writeFileSync(at, [
    "import fs from 'node:fs'",
    "import { createRequire, syncBuiltinESMExports } from 'node:module'",
    `const Database = createRequire(${JSON.stringify(join(REPO, 'package.json'))})('better-sqlite3')`,
    'const write = fs.writeFileSync',
    'let wrote = false',
    'fs.writeFileSync = (file, ...rest) => {',
    `  if (!wrote && String(file).startsWith(${JSON.stringify(to)})) {`,
    '    wrote = true',
    `    const another = new Database(${JSON.stringify(database)})`,
    `    another.prepare(${JSON.stringify(A_CHANGE_ROW)}).run(${JSON.stringify(written)}, 'rMadeUpNote1', '2026-10-03 09:00:00')`,
    '    another.close()',
    `    write(${JSON.stringify(mark)}, 'written')`,
    '  }',
    '  return write(file, ...rest)',
    '}',
    'syncBuiltinESMExports()',
  ].join('\n'))
  return pathToFileURL(at).href
}

/** The store as a person would check it before and after: its bytes, its journal mode and what is beside it. */
const theStateOf = (file: string) => ({ sha256: sha256(file), journal: theJournalModeOf(file), beside: theFilesBeside(file) })

describe('the export command reads the store read-only', () => {
  it('leaves a store in journal mode delete as it was', () => {
    const before = theStateOf(small)
    expect(before).toEqual({ sha256: before.sha256, journal: 'delete', beside: [] })
    const ran = theExportCommand(small, join(folder(), 'export-of-the-small-store'))
    expect(ran.status, ran.stdout + ran.stderr).toBe(0)
    expect(theStateOf(small)).toEqual(before)
  }, 120_000)

  it(`exports a store larger than a heap of ${String(HEAP_MB)} MiB, and counts every row`, () => {
    const before = theStateOf(big)
    const rows = { records: theRowsIn(big, 'records'), revisions: theRowsIn(big, 'revisions'), changes: theRowsIn(big, 'changes') }
    expect(rows.revisions).toBeGreaterThanOrEqual(2400)
    const to = join(folder(), 'export-of-the-big-store')
    const ran = theExportCommand(big, to, { heapMb: HEAP_MB, json: true })
    expect(ran.status, ran.stderr.slice(-2000)).toBe(0)
    const report = theReportIn(ran.stdout)
    expect({ records: report.counts['records'], revisions: report.counts['revisions'], changes: report.counts['changes'] }).toEqual(rows)
    const pages = readdirSync(join(to, 'revisions'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    expect(pages.length).toBe(rows.revisions)
    expect(theStateOf(big)).toEqual(before)
  }, 240_000)

  it('opens a handle that refuses a write, and refuses a store that is not there without making one', async () => {
    const { openTheStoreToExport } = await import('../src/server/lib/the-store-to-export.ts')
    const store = openTheStoreToExport()
    try {
      expect(store.name).toBe(t.file)
      expect(store.readonly).toBe(true)
      expect(() => store.exec('CREATE TABLE a_made_up_table (x)')).toThrow(/readonly/)
    } finally {
      store.close()
    }
    const missing = join(folder(), 'a-store-that-is-not-there.db')
    const ran = theExportCommand(missing, join(folder(), 'export-of-no-store'))
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain('The export could not open the store at')
    expect(existsSync(missing)).toBe(false)
  }, 120_000)
})

describe('the export reads its history one row at a time, from one moment of the store', () => {
  it('refuses a revision whose seq is 0 before it writes any file', () => {
    const revision = t.client.sqlite.prepare('SELECT id, seq FROM revisions ORDER BY id LIMIT 1').get() as { id: string; seq: number }
    const to = join(folder(), 'export-refused')
    t.client.sqlite.prepare('UPDATE revisions SET seq = 0 WHERE id = ?').run(revision.id)
    try {
      expect(() => lib.writeExport(to)).toThrow(/whole number counting from 1/)
    } finally {
      t.client.sqlite.prepare('UPDATE revisions SET seq = ? WHERE id = ?').run(revision.seq, revision.id)
    }
    expect(existsSync(to) ? readdirSync(to, { recursive: true }) : []).toEqual([])
  })

  it('leaves out a change row another connection writes while the command writes its files', () => {
    // IN WRITE-AHEAD LOGGING, as the office keeps its store, so the other connection can write while the export reads.
    const wal = join(folder(), 'wal.db')
    copyFileSync(small, wal)
    const db = new Database(wal)
    db.pragma('journal_mode = WAL')
    db.close()
    const before = theRowsIn(wal, 'changes')
    const to = join(folder(), 'export-while-another-writes')
    const [written, mark] = ['cWrittenLate', join(folder(), 'the-second-writer-wrote')]
    const ran = theExportCommand(wal, to, { json: true, preload: aSecondWriter(wal, to, written, mark) })
    expect(ran.status, ran.stderr.slice(-2000)).toBe(0)
    expect(existsSync(mark)).toBe(true)
    expect(theRowsIn(wal, 'changes')).toBe(before + 1)
    const report = theReportIn(ran.stdout)
    expect(report.counts['changes']).toBe(before)
    const changePages = readdirSync(join(to, 'changes'))
    expect(changePages.filter((page) => readFileSync(join(to, 'changes', page), 'utf8').includes(written))).toEqual([])
  }, 120_000)

  it('gives each day one page, and the undated rows one page, when their stamps do not sort together', () => {
    const add = t.client.sqlite.prepare(A_CHANGE_ROW)
    const stamps: Record<string, string> = {
      cDayOneMorn: '2026-10-01 09:00:00',
      cDayTwoMorn: '2026-10-02 09:00:00',
      cDayTwoSpace: ' 2026-10-02 10:00:00',
      cUndatedZero: '0 not a stamp',
      cUndatedZed: 'z not a stamp',
    }
    for (const [id, at] of Object.entries(stamps)) add.run(id, 'rMadeUpNote2', at)
    const { files } = lib.buildExport()
    const paths = files.map((file) => file.path)
    expect(paths.filter((path, i) => paths.indexOf(path) !== i)).toEqual([])
    const pageOf = (path: string) => files.find((file) => file.path === path)?.text ?? ''
    const holding = (path: string) => Object.keys(stamps).filter((id) => pageOf(path).includes(id))
    expect(holding('changes/2026-10-01.md')).toEqual(['cDayOneMorn'])
    expect(holding('changes/2026-10-02.md')).toEqual(['cDayTwoMorn', 'cDayTwoSpace'])
    expect(holding('changes/undated.md')).toEqual(['cUndatedZero', 'cUndatedZed'])
  })
})
