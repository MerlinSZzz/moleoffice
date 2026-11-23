// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPORT READS AN EXPORT LARGER THAN ITS HEAP, AND GIVES THE SAME STORE AND THE SAME REFUSALS AS BEFORE.
 *
 * The import read every file of an export whole, and every row of every file, before it checked anything. So an export
 * larger than the import's heap could not be imported at all. Cases:
 *   1. the import command, given a heap smaller than a made-up export, imports it into the office as it was before the
 *      export's history: it exits 0 and every records, revisions and changes row is in the store, byte for byte. With
 *      the same heap, the same export given to the store it came from plans the rows the small export plans for its own
 *      store, as the same command reads them;
 *   2. a small export, imported by the command into an empty store, gives every records, revisions, changes and links
 *      row of the store it came from byte for byte, and counts each row it read once;
 *   3. a fault in a file read after the first gives the refusal it gave before, at the file and line of the fault, in
 *      the words the import exports, and a refused import writes nothing.
 *
 * THE HEAP IN CASE 1. The command is given HEAP_MB when it can start in that much, as the export's own test gives the
 * export. If it cannot, it is given the heap it holds once started, measured here after a garbage collection, plus
 * HEAP_MB. The made-up history is then made until the export is larger than the whole heap that limit gives, and the
 * test checks that it is. The numbers are printed, so a run of this file says them.
 *
 * THE WORDS IN CASE 3 are read from the import's exports, from the grammar's own refusal of the same file, from
 * JSON.parse's own words for the same block, and from the reader of a revision held in part, never copied here.
 *
 * THE TIME LIMITS ARE NOT MEASURED. A worker runs no test, so beside each limit there is no time of a run alone.
 *
 * Every id, title, stamp and block of words here is made up, in a throwaway office in the test's own folder. Each
 * command is given only PATH, LANG, a made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings
 * file of anybody's.
 */
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry } from './registry-alias-fixture.ts'

const REPO = resolve(import.meta.dirname, '..')
const MIB = 1024 * 1024
/** The heap the import command is given in case 1 when it can start in it, in MiB. */
const HEAP_MB = 192
/** The three ledgers, which case 1 compares row by row and byte for byte. */
const LEDGERS = ['records', 'revisions', 'changes'] as const
/** The tables case 2 compares row by row and byte for byte. */
const COMPARED = [...LEDGERS, 'links'] as const

type Importer = typeof import('../src/server/lib/import.ts')
type Exporter = typeof import('../src/server/lib/export.ts')
type Grammar = typeof import('../src/server/db/export-grammar.ts')
type Pages = typeof import('../src/server/db/registry-aliases/history-bytes.ts')
type Region = ReturnType<Grammar['parseExportFile']>['regions'][number]

let t: TestDb
let importer: Importer
let exporter: Exporter
let grammar: Grammar
let pages: Pages
/** A copy of the small office, taken before case 1 adds its history, and an export of the small office. */
let small: string
let smallExport: string
/** Two made-up notes, the first linked to the second, and a made-up session whose chapters are stored once. */
let first: string
let second: string
let session: string

const folder = () => dirname(t.file)

/** Made-up chapters of about 60 kB, different for each `seed`, in the shape a round's saved chapters have. */
function madeUpChapters(seed: string): Record<string, unknown> {
  const text = (n: number): string => Array.from({ length: n }, (_, i) => `${seed} made-up line ${String(i)}.`).join('\n')
  return {
    madeUp: true,
    version: 1,
    sources: { code: { bytes: 4000, text: text(150) }, line: { bytes: 3000, text: text(120) } },
    chapters: Array.from({ length: 14 }, (_, i) => ({ chapter: i + 1, level: 'full', text: text(60) })),
    brief: { text: text(200) },
  }
}

/** A made-up session: revision 1 holds its chapters whole, revisions 2 and 3 name revision 1 for them, and 4 holds new ones. */
function aSessionWithChapters(): string {
  const created = t.api.createRecord({
    kind: 'session',
    title: 'A made-up round',
    workspaceId: 'default',
    actor: t.api.HUMAN,
    origin: 'fixture',
    data: { state: 'running', doing: 'starting', extra: { roundChapters: madeUpChapters('first') } },
  })
  for (const doing of ['reading the brief', 'writing the test']) t.api.patchRecord(created.id, { dataPatch: { doing } }, t.api.HUMAN)
  t.api.patchRecord(created.id, { dataPatch: { extra: { roundChapters: madeUpChapters('second') } } }, t.api.HUMAN)
  return created.id
}

beforeAll(async () => {
  t = await freshDb()
  inventedRegistry(t)
  // A REGISTRY ALIAS, SO EVERY EXPORT HERE CARRIES PAGES OF HISTORY BYTES, as the person's does.
  await fileSyntheticAlias(t)
  importer = await import('../src/server/lib/import.ts')
  exporter = await import('../src/server/lib/export.ts')
  grammar = await import('../src/server/db/export-grammar.ts')
  pages = await import('../src/server/db/registry-aliases/history-bytes.ts')
  const notes = [1, 2, 3].map((n) => {
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `A made-up note ${String(n)}`, origin: 'fixture', data: { body: `Made-up words ${String(n)}.` }, actor: t.api.HUMAN })
    t.api.updateRecord(note.id, { data: { body: `Made-up words ${String(n)}, written again.` } }, t.api.HUMAN)
    return note.id
  })
  first = notes[0]!
  second = notes[1]!
  t.api.createLink({ fromId: first, toId: second, type: 'relates_to', actor: t.api.HUMAN })
  session = aSessionWithChapters()
  small = join(folder(), 'small.db')
  t.client.sqlite.prepare('VACUUM INTO ?').run(small)
  smallExport = join(folder(), 'export-of-the-small-office')
  exporter.writeExport(smallExport)
}, 120_000) // not measured
afterAll(() => t?.close())

interface Ran {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

/**
 * A command of this checkout, `node --import tsx <script> <args>`, on the store `database`, with the heap and preload
 * asked for, and only PATH, LANG, a made-up home and MOLE_OFFICE_DB. With no NODE_OPTIONS, the only heap the command has
 * is the one asked for here.
 */
function theCommand(database: string, script: string, args: readonly string[], options: { heapMb?: number; exposeGc?: boolean; preload?: string } = {}): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const env = { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }
  const ran = spawnSync(
    process.execPath,
    [
      ...(options.heapMb === undefined ? [] : [`--max-old-space-size=${String(options.heapMb)}`]),
      ...(options.exposeGc === true ? ['--expose-gc'] : []),
      ...(options.preload === undefined ? [] : ['--import', options.preload]),
      '--import', 'tsx', script, ...args,
    ],
    { cwd: REPO, env, encoding: 'utf8', maxBuffer: 256 * MIB, timeout: 840_000 },
  )
  if (ran.error !== undefined) throw ran.error
  return { status: ran.status, signal: ran.signal, stdout: ran.stdout, stderr: ran.stderr }
}

type Report = Pick<import('../src/server/lib/import.ts').ImportReport, 'refusals' | 'read' | 'inserts' | 'updates' | 'unchanged' | 'rows'> & { applied: boolean }

/** The command's JSON, read from the first line that opens an object, so a line a module prints as it loads is passed over. */
function theReportIn(stdout: string): Report {
  const lines = stdout.split('\n')
  const at = lines.findIndex((line) => line.startsWith('{'))
  expect(at, stdout.slice(0, 2000)).toBeGreaterThanOrEqual(0)
  return JSON.parse(lines.slice(at).join('\n')) as Report
}

const theRowsIn = (file: string, table: string): number => {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/**
 * Every row of `tables` in `from` that is not in `into` with the same type and the same bytes in every column. It reads
 * `from` one row at a time and `into` by id, so it holds one row of each.
 */
function whereTheStoresDiffer(from: string, into: string, tables: readonly string[]): string[] {
  const a = new Database(from, { readonly: true, fileMustExist: true })
  const b = new Database(into, { readonly: true, fileMustExist: true })
  const differences: string[] = []
  try {
    for (const table of tables) {
      const columns = (a.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((column) => column.name)
      const select = `SELECT id AS the_id, ${columns.map((column, i) => `typeof("${column}") AS t${String(i)}, CAST("${column}" AS BLOB) AS b${String(i)}`).join(', ')} FROM ${table}`
      const there = b.prepare(`${select} WHERE id = ?`)
      for (const row of a.prepare(select).iterate() as Iterable<Record<string, unknown>>) {
        const other = there.get(row['the_id']) as Record<string, unknown> | undefined
        if (other === undefined) {
          differences.push(`${table} ${String(row['the_id'])} is not there`)
          continue
        }
        columns.forEach((column, i) => {
          const [mine, theirs] = [row[`b${String(i)}`], other[`b${String(i)}`]]
          const same = row[`t${String(i)}`] === other[`t${String(i)}`] &&
            (mine === null ? theirs === null : theirs !== null && Buffer.compare(mine as Buffer, theirs as Buffer) === 0)
          if (!same) differences.push(`${table} ${String(row['the_id'])} differs in ${column}`)
        })
        if (differences.length >= 20) return differences
      }
    }
    return differences
  } finally {
    a.close()
    b.close()
  }
}

/** The bytes of every file under a folder. */
function theBytesUnder(root: string): number {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0)
}

// ================================================================================ case 3, on the small office

/** A copy of the small export in a folder of its own, for one fault. */
function aCopyOfTheSmallExport(name: string): string {
  const to = join(folder(), `export-with-${name}`)
  cpSync(smallExport, to, { recursive: true })
  return to
}

const theText = (root: string, path: string): string => readFileSync(join(root, path), 'utf8')

/** A region of a file as the export's grammar reads it: the first one named `name` that `which` takes. */
function theRegion(root: string, path: string, name: string, which: (region: Region) => boolean = () => true): Region {
  const region = grammar.parseExportFile(theText(root, path), path).regions.find((one) => one.name === name && which(one))
  expect(region, `${path} holds a ${name} region`).toBeDefined()
  return region!
}

/** The lines of a region's block: the index of the line that opens it and of the line that closes it. */
function theBlockAt(lines: readonly string[], region: Region): { open: number; close: number } {
  const open = region.line - 1
  const close = lines.findIndex((line, n) => n > open && (line === '```' || (open === 0 && line === '---')))
  expect(close, `the block at line ${String(region.line)} closes`).toBeGreaterThan(open)
  return { open, close }
}

/** One field line of a region given a new value, in the file. Answers the value it had. */
function setAField(root: string, path: string, region: Region, key: string, value: unknown): unknown {
  const lines = theText(root, path).split('\n')
  const { open, close } = theBlockAt(lines, region)
  const at = lines.findIndex((line, n) => n > open && n < close && line.startsWith(`${key}: `))
  expect(at, `${path} has ${key} at line ${String(region.line)}`).toBeGreaterThan(open)
  const had = JSON.parse(lines[at]!.slice(key.length + 2)) as unknown
  lines[at] = `${key}: ${JSON.stringify(value)}`
  writeFileSync(join(root, path), lines.join('\n'))
  return had
}

/** A JSON block that no longer parses: its last line given one more closing brace. Answers what JSON.parse says of its body. */
function breakAJsonBlock(root: string, path: string, region: Region): string {
  const lines = theText(root, path).split('\n')
  const { open, close } = theBlockAt(lines, region)
  lines[close - 1] = `${lines[close - 1]!}}`
  writeFileSync(join(root, path), lines.join('\n'))
  try {
    JSON.parse(lines.slice(open + 1, close).join('\n'))
  } catch (error) {
    return (error as Error).message
  }
  throw new Error(`the block at ${path}:${String(region.line)} still parses`)
}

/** Where the export's grammar refuses a file, and the whole of its words. */
function theGrammarsRefusalOf(root: string, path: string): { path: string; line: number; message: string } {
  try {
    grammar.parseExportFile(theText(root, path), path)
  } catch (error) {
    expect(error).toBeInstanceOf(grammar.ExportFormatError)
    const refused = error as InstanceType<Grammar['ExportFormatError']>
    return { path: refused.path, line: refused.line, message: refused.message }
  }
  throw new Error(`${path} parses`)
}

const theRefusalsOf = (root: string) => importer.planImport(root).refusals

/** The refusal of a block that does not parse: where the grammar puts it, ending in the grammar's words and JSON.parse's. */
function expectTheRefusalOfABrokenBlock(root: string, path: string, parsing: string): void {
  const grammars = theGrammarsRefusalOf(root, path)
  expect(grammars.path).toBe(path)
  const refusal = theRefusalsOf(root).find((one) => one.path === grammars.path && one.line === grammars.line)
  expect(refusal, `a refusal at ${path}:${String(grammars.line)}`).toBeDefined()
  expect(refusal!.problem.length).toBeGreaterThan(parsing.length)
  expect(grammars.message.endsWith(refusal!.problem), `the grammar's words end with ${refusal!.problem}`).toBe(true)
  expect(refusal!.problem.endsWith(parsing), `the refusal ends with JSON.parse's words, ${parsing}`).toBe(true)
}

describe('a fault in a file read after the first gives the refusal it gave before', () => {
  it('and the export with no fault is refused nothing', () => {
    expect(theRefusalsOf(smallExport)).toEqual([])
  }, 120_000) // not measured

  it('a record file copied to a later name is a second row with the first one\'s key', () => {
    const root = aCopyOfTheSmallExport('a-second-row')
    const path = `records/note/${first}.md`
    // `~` IS AFTER EVERY LETTER, DIGIT, `-` AND `_` BY CODE UNIT, so the copy is read after the file it copies.
    const later = 'records/note/~a-made-up-copy.md'
    writeFileSync(join(root, later), theText(root, path))
    const line = theRegion(root, path, 'records').line
    expect(theRefusalsOf(root)).toContainEqual({ path: later, line, problem: importer.aSecondRowClaiming('records', first, { path, line }) })
  }, 120_000) // not measured

  it('a record file without its data block is a row without its document', () => {
    const root = aCopyOfTheSmallExport('no-data-block')
    const path = `records/note/${second}.md`
    const line = theRegion(root, path, 'records').line
    const lines = theText(root, path).split('\n')
    const { open, close } = theBlockAt(lines, theRegion(root, path, 'records.data'))
    lines.splice(open, close - open + 1)
    writeFileSync(join(root, path), lines.join('\n'))
    expect(theRefusalsOf(root)).toContainEqual({ path, line, problem: importer.aRowWithoutItsDocument('records', 'data') })
  }, 120_000) // not measured

  it('a link to a record that is nowhere is refused at the link', () => {
    const root = aCopyOfTheSmallExport('a-link-to-nowhere')
    const path = `records/note/${first}.md`
    const nowhere = 'aMadeUpIdOfNoRecord'
    setAField(root, path, theRegion(root, path, 'links'), 'toId', nowhere)
    const line = theRegion(root, path, 'links').line
    expect(theRefusalsOf(root)).toContainEqual({ path, line, problem: importer.aLinkEndThatIsNowhere('toId', nowhere) })
  }, 120_000) // not measured

  it('a stored change row given another value is refused as a rewritten past', () => {
    const root = aCopyOfTheSmallExport('a-rewritten-change')
    const change = t.client.sqlite.prepare("SELECT id FROM changes WHERE record_id = ? AND op = 'create'").get(first) as { id: string }
    const path = readdirSync(join(root, 'changes')).map((name) => `changes/${name}`).find((one) => theText(root, one).includes(`id: ${JSON.stringify(change.id)}`))
    expect(path, `the page holding change ${change.id}`).toBeDefined()
    const region = theRegion(root, path!, 'changes', (one) => one.fields['id'] === change.id)
    const rewritten = 'A rewritten made-up title'
    const had = setAField(root, path!, region, 'newValue', rewritten)
    expect(theRefusalsOf(root)).toContainEqual({ path, line: region.line, problem: importer.aRewrittenChangeRow(change.id, ['newValue'], had, rewritten) })
  }, 120_000) // not measured

  it('a revision whose title no longer hashes to its content hash is refused', async () => {
    const { contentOf, versionOf } = await import('../src/server/db/version.ts')
    const root = aCopyOfTheSmallExport('a-retitled-revision')
    const path = `revisions/${first}/1.md`
    const retitled = 'A retitled made-up note'
    setAField(root, path, theRegion(root, path, 'revisions'), 'title', retitled)
    const { line, fields } = theRegion(root, path, 'revisions')
    const data = theRegion(root, path, 'revisions.data').json as Record<string, unknown>
    const hash = versionOf(contentOf({
      kind: String(fields['kind']),
      title: retitled,
      summary: fields['summary'] === null || fields['summary'] === undefined ? null : String(fields['summary']),
      data,
      deletedAt: fields['deletedAt'] === null || fields['deletedAt'] === undefined ? null : String(fields['deletedAt']),
    }))
    expect(hash).not.toBe(fields['contentHash'])
    expect(theRefusalsOf(root)).toContainEqual({
      path,
      line,
      problem: importer.aRevisionWhoseHashDisagrees(String(fields['id']), first, fields['contentHash'], hash),
    })
  }, 120_000) // not measured

  it('a revision whose number is 0 is refused', () => {
    const root = aCopyOfTheSmallExport('a-revision-numbered-0')
    const path = `revisions/${second}/2.md`
    setAField(root, path, theRegion(root, path, 'revisions'), 'seq', 0)
    expect(theRefusalsOf(root)).toContainEqual({ path, line: theRegion(root, path, 'revisions').line, problem: importer.aRevisionNumberThatIsNotOne(0) })
  }, 120_000) // not measured

  it('a revision held in part, in an archive without the earlier revision that holds the rest, is refused', async () => {
    const { wholeRevisionData } = await import('../src/server/db/revision-stored-once.ts')
    const root = aCopyOfTheSmallExport('no-holder-of-the-chapters')
    rmSync(join(root, `revisions/${session}/1.md`))
    const stored = t.client.sqlite.prepare('SELECT data, parts FROM revisions WHERE record_id = ? AND seq = 2').get(session) as { data: string; parts: string | null }
    expect(stored.parts, 'revision 2 of the session names the revision that holds its chapters').not.toBeNull()
    let threw = ''
    try {
      wholeRevisionData({ recordId: session, seq: 2, data: JSON.parse(stored.data) as Record<string, unknown>, parts: stored.parts }, () => undefined)
    } catch (error) {
      threw = (error as Error).message
    }
    expect(threw).not.toBe('')
    const path = `revisions/${session}/2.md`
    expect(theRefusalsOf(root)).toContainEqual({ path, line: theRegion(root, path, 'revisions').line, problem: importer.aRevisionHeldInPart(threw) })
  }, 120_000) // not measured

  it('a JSON block of a revision that does not parse is refused in the grammar\'s words, ending in JSON.parse\'s', () => {
    const root = aCopyOfTheSmallExport('a-broken-revision-block')
    const path = `revisions/${second}/1.md`
    const parsing = breakAJsonBlock(root, path, theRegion(root, path, 'revisions.data'))
    expectTheRefusalOfABrokenBlock(root, path, parsing)
  }, 120_000) // not measured

  it('a page of history bytes that does not parse is refused in the grammar\'s words, ending in JSON.parse\'s', () => {
    const root = aCopyOfTheSmallExport('a-broken-page')
    const path = pages.historyBytesPage(1)
    const parsing = breakAJsonBlock(root, path, theRegion(root, path, 'history_bytes'))
    expectTheRefusalOfABrokenBlock(root, path, parsing)
  }, 120_000) // not measured

  it('a row of history bytes that a later page holds again is refused as a duplicate, on the later page', () => {
    const root = aCopyOfTheSmallExport('a-row-on-two-pages')
    const page = pages.historyBytesPage(1)
    const region = theRegion(root, page, 'history_bytes')
    const envelope = region.json as { version: unknown; rows: unknown[] }
    expect(envelope.rows.length).toBeGreaterThan(0)
    const lines = theText(root, page).split('\n')
    const { open, close } = theBlockAt(lines, region)
    const later = pages.historyBytesPage(2)
    const again = [...lines.slice(0, open + 1), ...JSON.stringify({ version: envelope.version, rows: [envelope.rows[0]] }, null, 2).split('\n'), ...lines.slice(close)]
    writeFileSync(join(root, later), again.join('\n'))
    expect(theRefusalsOf(root)).toContainEqual({ path: later, line: region.line, problem: expect.stringContaining(pages.HISTORY_BYTES_REFUSALS.duplicate) })
  }, 120_000) // not measured

  it('an import refused for a fault in a later file writes nothing', () => {
    const root = aCopyOfTheSmallExport('refused-whole')
    const path = `revisions/${second}/1.md`
    breakAJsonBlock(root, path, theRegion(root, path, 'revisions.data'))
    const counts = () => COMPARED.map((table) => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
    const before = counts()
    expect(() => importer.applyImport(root)).toThrow(importer.ImportRefused)
    expect(counts()).toEqual(before)
  }, 120_000) // not measured
})

// ================================================================================ case 2, a small export by the command

describe('a small export imported by the command into an empty store', () => {
  it('gives every row of the store it came from byte for byte, and counts each row read once', () => {
    const work = join(folder(), 'case-2')
    mkdirSync(work)
    const restored = join(work, 'restored.db')
    const migrated = theCommand(restored, 'scripts/restore-check.ts', ['--phase', 'migrate', '--scratch', work])
    expect(migrated.status, migrated.stdout + migrated.stderr).toBe(0)
    const ran = theCommand(restored, 'scripts/import.ts', ['--from', smallExport, '--apply', '--json'])
    expect(ran.status, ran.stdout.slice(-4000) + ran.stderr.slice(-2000)).toBe(0)
    const report = theReportIn(ran.stdout)
    expect(report.applied).toBe(true)
    expect(report.refusals).toEqual([])
    for (const [region, read] of Object.entries(report.read)) {
      expect((report.inserts[region] ?? 0) + (report.updates[region] ?? 0) + (report.unchanged[region] ?? 0), `${region}: each row read is counted once`).toBe(read)
    }
    for (const table of COMPARED) expect(report.read[table], `${table} rows read`).toBe(theRowsIn(small, table))
    expect(whereTheStoresDiffer(small, restored, COMPARED)).toEqual([])
  }, 600_000) // not measured
})

// ================================================================================ case 1, an export larger than the heap

/** The words of a made-up block of about 100,000 bytes, different for each `n`. */
function aBlock(n: number): string {
  const line = `Made-up words of block ${String(n)}, for an import measured against its heap; nothing here is real. `
  return line.repeat(Math.ceil(100_000 / line.length)).slice(0, 100_000)
}

/** A made-up note of about 100,000 bytes, and seven new titles: eight revisions, each holding the note's data whole. */
function aNoteWithHistory(n: number): void {
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `A made-up note of history ${String(n)}`, origin: 'fixture', data: { body: aBlock(n) }, actor: t.api.HUMAN })
  for (let s = 2; s <= 8; s++) t.api.updateRecord(note.id, { title: `A made-up note of history ${String(n)}, title ${String(s)}` }, t.api.HUMAN)
}

/**
 * A TEST STAND-IN, loaded before the command with --expose-gc: as the command ends, it collects the garbage and leaves in
 * `mark` the bytes the heap still holds.
 */
function aHeapMark(mark: string): string {
  const at = join(folder(), 'a-heap-mark.mjs')
  writeFileSync(at, [
    "import { writeFileSync } from 'node:fs'",
    "import { getHeapStatistics } from 'node:v8'",
    "process.on('exit', () => {",
    '  globalThis.gc()',
    `  writeFileSync(${JSON.stringify(mark)}, String(getHeapStatistics().used_heap_size))`,
    '})',
  ].join('\n'))
  return pathToFileURL(at).href
}

describe('an export larger than the import\'s heap', () => {
  /** The heap the import is given, in MiB, the whole heap that gives, in bytes, and the export's bytes. */
  let limitMb = 0
  let wholeHeap = 0
  let big = ''
  let bigExport = ''

  beforeAll(() => {
    // THE HEAP THE COMMAND HOLDS ONCE STARTED: it is pointed at a folder that is not there, which it refuses before it reads anything.
    const missing = join(folder(), 'no-export-is-here')
    const scratch = join(folder(), 'a-store-to-start-on.db')
    copyFileSync(small, scratch)
    const mark = join(folder(), 'the-heap-once-started')
    const measured = theCommand(scratch, 'scripts/import.ts', ['--from', missing, '--json'], { exposeGc: true, preload: aHeapMark(mark) })
    expect(measured.status, measured.stderr.slice(-2000)).toBe(1)
    expect(theReportIn(measured.stdout).refusals.length).toBe(1)
    const started = Number(readFileSync(mark, 'utf8'))
    expect(started).toBeGreaterThan(0)
    const at192 = theCommand(scratch, 'scripts/import.ts', ['--from', missing, '--json'], { heapMb: HEAP_MB })
    const startsIn192 = at192.status === 1 && at192.stdout.includes('"refusals"')
    limitMb = startsIn192 ? HEAP_MB : Math.ceil(started / MIB) + HEAP_MB
    const limit = spawnSync(process.execPath, [`--max-old-space-size=${String(limitMb)}`, '-p', "require('node:v8').getHeapStatistics().heap_size_limit"], {
      env: { PATH: process.env.PATH, LANG: 'C' },
      encoding: 'utf8',
    })
    wholeHeap = Number(limit.stdout.trim())
    expect(wholeHeap).toBeGreaterThan(limitMb * MIB)

    // THE MADE-UP HISTORY, MADE UNTIL THE DATA IT HOLDS IS THREE QUARTERS OF THE WHOLE HEAP. The export writes that data
    // twice, once in the records and revisions files and once on the pages of history bytes, so it is about one and a half
    // times the whole heap. Every row is written by the office's own calls, so every check of the import passes it.
    const held = () => (t.client.sqlite.prepare('SELECT (SELECT coalesce(sum(length(data)), 0) FROM revisions) + (SELECT coalesce(sum(length(data)), 0) FROM records) AS n').get() as { n: number }).n
    let n = 0
    while (held() < 0.75 * wholeHeap) for (let k = 0; k < 25; k++) aNoteWithHistory(n++)
    big = join(folder(), 'big.db')
    t.client.sqlite.prepare('VACUUM INTO ?').run(big)
    bigExport = join(folder(), 'export-of-the-big-office')
    exporter.writeExport(bigExport)
    const exportBytes = theBytesUnder(bigExport)
    console.log(
      `the import's heap: ${String(started)} bytes once started; it ${startsIn192 ? 'starts' : 'does not start'} in ${String(HEAP_MB)} MiB; ` +
        `it is given ${String(limitMb)} MiB, a whole heap of ${String(wholeHeap)} bytes; the export is ${String(exportBytes)} bytes, of ${String(n)} made-up notes`,
    )
    expect(exportBytes, 'the export is larger than the whole heap').toBeGreaterThan(wholeHeap)
  }, 1_800_000) // not measured

  it('is imported with that heap into the office as it was before its history: every row, byte for byte', () => {
    const into = join(folder(), 'the-office-before-its-history.db')
    copyFileSync(small, into)
    const ran = theCommand(into, 'scripts/import.ts', ['--from', bigExport, '--apply', '--json'], { heapMb: limitMb })
    expect({ status: ran.status, signal: ran.signal }, ran.stderr.slice(-2000)).toEqual({ status: 0, signal: null })
    const report = theReportIn(ran.stdout)
    expect(report.applied).toBe(true)
    expect(report.refusals).toEqual([])
    for (const table of LEDGERS) {
      expect(report.inserts[table], `${table} rows inserted`).toBe(theRowsIn(big, table) - theRowsIn(small, table))
      expect(theRowsIn(into, table), `${table} rows in the store`).toBe(theRowsIn(big, table))
    }
    expect(whereTheStoresDiffer(big, into, LEDGERS)).toEqual([])
  }, 900_000) // not measured

  it('plans, with that heap, for the store it came from, the rows the small export plans for its own store', () => {
    // A DRY RUN FOR THE STORE AN EXPORT CAME FROM DOES NOT PLAN NOTHING HERE. The fixture writes its two made-up agents by
    // SQL with no map size, and the import fills a missing map size with one it makes, so it plans each as an update.
    // Which rows those are is read from the same command at the same commit, planning the small export for a copy of the
    // small office, never from a list copied here.
    const own = join(folder(), 'a-copy-of-the-small-office.db')
    copyFileSync(small, own)
    const planned = theCommand(own, 'scripts/import.ts', ['--from', smallExport, '--json'])
    expect({ status: planned.status, signal: planned.signal }, planned.stderr.slice(-2000)).toEqual({ status: 0, signal: null })
    const expected = theReportIn(planned.stdout)
    expect(expected.refusals).toEqual([])
    const into = join(folder(), 'a-copy-of-the-office-it-came-from.db')
    copyFileSync(big, into)
    const ran = theCommand(into, 'scripts/import.ts', ['--from', bigExport, '--json'], { heapMb: limitMb })
    expect({ status: ran.status, signal: ran.signal }, ran.stderr.slice(-2000)).toEqual({ status: 0, signal: null })
    const report = theReportIn(ran.stdout)
    expect(report.refusals).toEqual([])
    expect(report.rows).toEqual(expected.rows)
  }, 900_000) // not measured
})
