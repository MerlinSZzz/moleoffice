// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE INDEX OF THE RECORDS' TEXT SERVES GET /api/search AND GET /api/report-files/named-inside, AND IT CANNOT
 * CHANGE AN ANSWER OF EITHER.
 *
 * Wave 13y round 64. Both doors ask which records hold some text. Before this round each read every record and
 * looked in each. Now each first asks the index which records COULD hold the text, reads only those, and looks in
 * them exactly as before. So the index may keep too many records but never too few. This file proves the second
 * half in five parts:
 *
 * 1. The search folds case with JavaScript's toLowerCase, and the index folds with SQLite's own rules. For some
 *    letters the two disagree, and the index is never asked about those letters. Their list is in
 *    src/server/lib/record-text-index.ts, and it is checked here against every code point, with this SQLite and this
 *    JavaScript.
 * 2. Random records and random searches: every record the search finds is among the records the index keeps.
 * 3. The search door still counts every record it could read, not only the ones the index kept, and it asks the
 *    index with the search as the search itself folds and trims it. It reads the records the index keeps by their
 *    ids, and when the index keeps more than it reads by id, it reads every record as it did before the index. The
 *    index is asked first, and its keys are read as it gives them, so the question stops at that number.
 * 4. The named-inside door narrows by a folder whose last segment has no Latin letter, and still finds the record
 *    that names it. It reads by id up to the same number, and by its condition of round 63 past it. It asks about a
 *    store's name only for a folder at or above that store, so a folder elsewhere is still read by id when many records
 *    name a store. It reads each record it keeps whole once and asks its condition once, and counts the same (round 72).
 * 5. A project's read given ids starts from the ids. Its condition holds the project's view of the messages, and
 *    SQLite answered that by reading every message of the office for each piece of ids (wave 13y round 64).
 *
 * The migration's own cases are in tests/migration-0290-one-index-of-the-records-text.test.ts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { searchRecord, theNeedle } from '../src/shared/search.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { MIGRATIONS } from './migration-fixtures.ts'

// The first office of this process is built in a hook, so no case below pays for it.
buildTheFirstOfficeInAHook()

/** Every code point there is, less the surrogates, which are not characters on their own. */
function everyCodePoint(): number[] {
  const all: number[] = []
  for (let c = 0; c <= 0x10ffff; c++) if (c < 0xd800 || c > 0xdfff) all.push(c)
  return all
}

/** The index table exactly as the migration makes it, under the name `t`. */
function theIndexTableAsTheMigrationMakesIt(): string {
  const file = readdirSync(MIGRATIONS).find((one) => one.endsWith('_one_index_of_the_records_text.sql'))
  expect(file, 'no migration file *_one_index_of_the_records_text.sql').toBeDefined()
  const made = readFileSync(join(MIGRATIONS, file!), 'utf8').match(/CREATE VIRTUAL TABLE IF NOT EXISTS `record_text` USING fts5\([^;]*\)/)
  expect(made, 'the migration does not make the virtual table `record_text`').not.toBeNull()
  return made![0].replace('`record_text`', 't')
}

// ============================================================================ 1. the two foldings

describe('the letters the two foldings disagree on', () => {
  it('are, over every code point, exactly the letters the index is never asked about', async () => {
    const { isUnsafeToFold } = await import('../src/server/lib/record-text-index.ts')
    const db = new Database(':memory:')
    db.exec(theIndexTableAsTheMigrationMakesIt())
    db.exec("CREATE VIRTUAL TABLE temp.pieces USING fts5vocab(main, t, 'instance')")
    const write = db.prepare('INSERT INTO t (rowid, text) VALUES (?, ?)')
    db.transaction(() => {
      for (const c of everyCodePoint()) write.run(c + 1, `a${String.fromCodePoint(c)}b`)
    })()
    // What SQLite makes of each code point: the middle letter of the one piece "a?b" gives.
    const sqlite = new Map<number, string>()
    for (const { doc, term } of db.prepare('SELECT doc, term FROM temp.pieces').iterate() as Iterable<{ doc: number; term: string }>) {
      const letters = [...term]
      if (letters.length === 3) sqlite.set(doc - 1, letters[1]!)
    }
    db.close()
    // NUL is the one code point the index drops, and a search with a NUL in it does not ask the index.
    expect(everyCodePoint().filter((c) => !sqlite.has(c))).toEqual([0])
    const foldedBySqlite = (text: string): string => [...text].map((one) => sqlite.get(one.codePointAt(0)!) ?? one).join('')

    // A letter of the search is unsafe when some letter of a record lowercases to it in JavaScript and SQLite folds
    // the two differently. Then the record holds the search, and the index would say it does not. A lowercase of more
    // than one letter never folds to the same one letter, so all its letters are unsafe too.
    const unsafe = new Set<number>()
    const intoI: number[] = []
    const intoMoreThanOne: number[] = []
    for (const c of everyCodePoint()) {
      if (c === 0) continue
      const letter = String.fromCodePoint(c)
      const lowered = new Set([letter.toLowerCase(), `A${letter}`.toLowerCase().slice(1), `A${letter}A`.toLowerCase().slice(1, -1)])
      for (const lower of lowered) {
        if ([...lower].length > 1) intoMoreThanOne.push(c)
        if (foldedBySqlite(lower) === foldedBySqlite(letter)) continue
        for (const one of lower) unsafe.add(one.codePointAt(0)!)
        if (lower.includes('i')) intoI.push(c)
      }
    }
    // "i" is the one unsafe letter the index is still asked about. Only "İ" makes it unsafe, and "İ" lowercases to
    // "i" and U+0307 together, so an "i" in a search is unsafe only when U+0307 follows it or it is the last letter.
    expect([...new Set(intoI)]).toEqual([0x130])
    expect([...new Set(intoMoreThanOne)]).toEqual([0x130])
    expect(unsafe.has(0x307)).toBe(true)
    unsafe.delete(0x69)
    const wrong = everyCodePoint().filter((c) => isUnsafeToFold(c) !== unsafe.has(c))
    expect(wrong.map((c) => c.toString(16)), 'the list in record-text-index.ts and this SQLite disagree').toEqual([])
    expect(unsafe.size, 'nothing was found unsafe, so the comparison proved nothing').toBeGreaterThan(400)
  }, 60_000)
})

// ============================================================================ the test office

let t: TestDb
let app: FastifyInstance | undefined

beforeEach(async () => {
  t = await freshDb()
})
afterEach(async () => {
  await app?.close()
  app = undefined
  t.close()
})

/** A record with this title, summary and data, written straight into the table, so the triggers write the index. */
function aRecord(title: string, summary: string | null, data: unknown, workspaceId = 'default'): string {
  const row = t.api.createRecord({ workspaceId, kind: 'note', title: 'Synthetic note', actor: t.api.HUMAN })
  t.client.sqlite.prepare('UPDATE records SET title = ?, summary = ?, data = ? WHERE id = ?').run(title, summary, JSON.stringify(data), row.id)
  return row.id
}

// ============================================================================ 2. never too few

/** A fixed sequence of numbers in [0, 1), so a failure can be run again. */
function aSequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The letters the random records and searches are made of: Latin with its dotted and dotless i, the combining dot,
 * the three Greek sigmas, the Kelvin and Ohm signs, sharp s, Georgian in both cases, Cherokee in both cases, a
 * titlecase pair, Chinese, an emoji, a quotation mark, a space, a line break, NUL and a lone surrogate.
 */
const LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'I', 'i', 'İ', 'ı', '̇', 'S', 's', 'Σ', 'σ', 'ς', 'K', 'k', 'K', 'Ω', 'ω',
  'ß', 'ẞ', 'Ა', 'ა', 'Ꭰ', 'ꭰ', 'Ᏸ', 'ᏸ', 'ǅ', 'ǆ', '夹', '具', '标', '定', '😀', '"', ' ', '\n', '\0', '\ud800', 'é',
]

function aText(next: () => number, length: number): string {
  let text = ''
  for (let at = 0; at < length; at++) text += LETTERS[Math.floor(next() * LETTERS.length)]
  return text
}

/** The same letters with the case of some of them changed, as a person might type them. */
function retyped(next: () => number, text: string): string {
  return [...text].map((one) => (next() < 0.3 ? one.toUpperCase() : next() < 0.3 ? one.toLowerCase() : one)).join('')
}

describe('the index keeps every record the search finds', () => {
  it('for random records and random searches in many scripts', async () => {
    const { theRecordsThatMaySay } = await import('../src/server/lib/record-text-index.ts')
    const next = aSequence(64)
    const texts: string[] = []
    for (let at = 0; at < 150; at++) {
      const title = aText(next, 4 + Math.floor(next() * 12))
      const summary = next() < 0.5 ? null : aText(next, 4 + Math.floor(next() * 12))
      const values = [aText(next, 3 + Math.floor(next() * 20)), aText(next, 3 + Math.floor(next() * 20))]
      aRecord(title, summary, { said: values[0], list: [{ deep: values[1] }, 7, true] })
      texts.push(title, ...(summary === null ? [] : [summary]), ...values)
    }
    for (const [title, value] of [
      ['İSTANBUL', 'Made up: istanbul'],
      ['ΣΊΣΥΦΟΣ', 'σίσυφος'],
      ['ᲥᲐᲠᲗᲣᲚᲘ', 'ქართული'],
      ['ᏣᎳᎩ', 'ꮳꮃꭹ'],
      ['KELVIN', 'STRASSE straße'],
    ] as const) {
      aRecord(title, null, { value })
      texts.push(title, value)
    }
    const all = t.api.listRecords({ workspaceId: t.api.ACROSS_WORKSPACES })
    const searches = ['istanbul', 'i̇stanbul', 'stanbul', 'İstanbul', 'σίσυφος', 'ςίσυφος', 'ΣΊΣΥΦΟΣ', 'ქართული', 'ᲥᲐᲠᲗᲣᲚᲘ',
      'ᏣᎳᎩ', 'ꮳꮃꭹ', 'kelvin', 'Kelvin', 'straße', 'STRASSE', 'ß']
    for (let at = 0; at < 600; at++) {
      if (next() < 0.6) {
        const from = [...texts[Math.floor(next() * texts.length)]!]
        const start = Math.floor(next() * from.length)
        searches.push(retyped(next, from.slice(start, start + 1 + Math.floor(next() * 7)).join('')))
      } else {
        searches.push(aText(next, 1 + Math.floor(next() * 6)))
      }
    }
    let found = 0
    let narrowed = 0
    for (const q of searches) {
      if (theNeedle(q) === '') continue
      const expected = all.filter((record) => searchRecord(record, q) !== null).map((record) => record.id)
      found += expected.length
      const ids = theRecordsThatMaySay(theNeedle(q))
      if (ids === undefined) continue
      const kept = new Set(t.api.listRecords({ workspaceId: t.api.ACROSS_WORKSPACES, ids }).map((record) => record.id))
      if (kept.size < all.length) narrowed++
      expect(expected.filter((id) => !kept.has(id)), `the index left out a record the search finds, for ${JSON.stringify(q)}`).toEqual([])
    }
    expect(found, 'the searches found almost nothing, so this proved little').toBeGreaterThan(300)
    expect(narrowed, 'the index narrowed almost no search, so this proved little').toBeGreaterThan(150)
  }, 60_000)
})

// ============================================================================ 3. the search door's count

async function searchApp(): Promise<FastifyInstance> {
  const { searchRoutes } = await import('../src/server/api/search.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const made = Fastify()
  installErrorHandling(made)
  await made.register(searchRoutes, { prefix: '/api' })
  await made.ready()
  return made
}

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

describe('the search door', () => {
  async function ask(query: string): Promise<{ counts: unknown; note: string; elsewhere: { workspaceId: string; matched: number }[] }> {
    const reply = await app!.inject({ method: 'GET', url: `/api/search?${query}`, headers: PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    return reply.json()
  }

  it('counts every record it could read, and not only the ones the index kept', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'r64-elsewhere', title: 'Synthetic second project' })
    aRecord('Synthetic quillwort survey', null, {})
    aRecord('Synthetic pond', 'by the pond, synthetic quillwort', {})
    for (const title of ['Synthetic clamp', 'Synthetic bench', 'Synthetic rig', 'Synthetic carriage']) aRecord(title, null, { text: 'nothing here' })
    aRecord('Synthetic far quillwort', null, {}, 'r64-elsewhere')
    app = await searchApp()

    const here = await ask('q=quillwort')
    expect(here.counts).toEqual({ matched: 2, returned: 2, searched: 6 })
    expect(here.note).toContain('2 of 6 records say "quillwort"')
    expect(here.elsewhere.map(({ workspaceId, matched }) => ({ workspaceId, matched }))).toEqual([{ workspaceId: 'r64-elsewhere', matched: 1 }])

    const kind = await ask('q=quillwort&kind=note')
    expect(kind.counts).toEqual({ matched: 2, returned: 2, searched: 6 })

    const everywhere = await ask('q=quillwort&projects=all')
    expect(everywhere.counts).toEqual({ matched: 3, returned: 3, searched: 7 })

    const nothing = await ask('q=zzqqxxnothing')
    expect(nothing.counts).toEqual({ matched: 0, returned: 0, searched: 6 })
    expect(nothing.note).toContain("Nothing in this project's 6 records says")
  })

  // Asked as it was typed, the Georgian capitals would be asked of the index, which does not fold them to the small
  // letters the note is written in, and the spaces would be asked as letters of the search.
  it('finds what the search finds for a search in capitals the index does not fold, or with spaces around it', async () => {
    aRecord('Synthetic note in ქართული', null, {})
    aRecord('Synthetic quillwort', null, {})
    for (const title of ['Synthetic clamp', 'Synthetic bench']) aRecord(title, null, { text: 'nothing here' })
    app = await searchApp()
    expect((await ask(`q=${encodeURIComponent('ᲥᲐᲠᲗᲣᲚᲘ')}`)).counts).toEqual({ matched: 1, returned: 1, searched: 4 })
    expect((await ask(`q=${encodeURIComponent('  quillwort ')}`)).counts).toEqual({ matched: 1, returned: 1, searched: 4 })
  })

  // Read by id, a record costs about the same in every read, and a read that is not given ids walks a project or a
  // kind. So past a number of records the index keeps, the door reads as it did before the index, and none is lost.
  it('reads the records the index keeps by id up to a number, and every record as before past it', async () => {
    const { AT_MOST_READ_BY_ID, theRecordsThatMaySay } = await import('../src/server/lib/record-text-index.ts')
    expect(AT_MOST_READ_BY_ID, 'record-text-index.ts says how many records it reads by id').toBeTypeOf('number')
    for (const title of ['Synthetic clamp', 'Synthetic bench']) aRecord(title, null, { text: 'nothing here' })
    copiesOf(aRecord('Synthetic quillwort', null, {}), AT_MOST_READ_BY_ID - 1)
    expect(theRecordsThatMaySay('quillwort'), 'the ids of every record that says it').toHaveLength(AT_MOST_READ_BY_ID)
    aRecord('Synthetic last quillwort', null, {})
    expect(theRecordsThatMaySay('quillwort'), 'one record more than are read by id').toBeUndefined()
    app = await searchApp()
    expect((await ask('q=quillwort')).counts).toMatchObject({ matched: AT_MOST_READ_BY_ID + 1, searched: AT_MOST_READ_BY_ID + 3 })
  })

  // Asked with IN, SQLite made the list of every record the index keeps before it read one key: 16.7 ms for a common
  // word on the made-up office at the 22 October scale, and 0.5 ms asked as a join (wave 13y round 64).
  it('asks the index first and reads the keys as the index gives them, so it stops at that number', async () => {
    const { theRecordsThatMaySay } = await import('../src/server/lib/record-text-index.ts')
    aRecord('Synthetic quillwort', null, {})
    const plans = thePlansDuring(() => theRecordsThatMaySay('quillwort'))
    expect(plans, 'the reads of the index').toHaveLength(1)
    expect(plans[0]!.plan).toMatch(/^SCAN record_text VIRTUAL TABLE/)
    expect(plans[0]!.plan).not.toMatch(/LIST SUBQUERY|TEMP B-TREE|MATERIALIZE/)
  })
})

/**
 * This many copies of a record, at least one, written straight into the table, so the triggers write the index. A
 * copy's id and title are the record's with the copy's number after them.
 */
function copiesOf(id: string, count: number): void {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
  const made = columns.map((one) => (one === '"id"' || one === '"title"' ? `${one} || '-' || n.i` : one))
  t.client.sqlite.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
    INSERT INTO records (${columns.join(', ')}) SELECT ${made.join(', ')} FROM records, n WHERE "id" = ?`).run(count, id)
}

// ============================================================================ 4. the named-inside door

describe('the named-inside door', () => {
  function report(title: string, data: Record<string, unknown>, workspaceId = 'default'): string {
    const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
    writeDataBypassingTheGate(t, row.id, data)
    return row.id
  }

  async function theDoorLists(folder: string): Promise<string[]> {
    app = (await apiApp()).app
    await app.ready()
    const reply = await app.inject({
      method: 'GET',
      url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`,
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    return (reply.json() as { records: { id: string }[] }).records.map((record) => record.id)
  }

  it('narrows by a last segment with no Latin letter, and keeps the record that names the folder', async () => {
    const asked = '/test-worktrees/夹具标定'
    for (let at = 0; at < 40; at++) report(`Synthetic unrelated report ${String(at)}`, { text: `Synthetic notes under /test-worktrees/另一个-${String(at)}.` })
    const naming = report('Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    const which = whichRecordsCouldNameIt(asked)
    expect(which, 'the door does not read by the ids the index keeps').toHaveProperty('ids')
    const kept = t.api.listRecords({ workspaceId: t.api.ACROSS_WORKSPACES, includeDeleted: false, ...which })
    expect(kept.map((record) => record.id)).toContain(naming)
    expect(kept.length, `the records kept: ${kept.map((record) => record.title).join(', ')}`).toBeLessThan(5)
    expect(await theDoorLists(asked)).toEqual([naming])
  })

  it('still narrows by a last segment shorter than three letters, as before this round', async () => {
    const asked = '/test-worktrees/ab'
    for (let at = 0; at < 10; at++) report(`Synthetic unrelated report ${String(at)}`, { text: `Synthetic notes under /test-worktrees/cd-${String(at)}.` })
    const naming = report('Synthetic short-folder report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    const which = whichRecordsCouldNameIt(asked)
    expect(which, 'the condition of round 63').toMatchObject({ alsoWhere: expect.anything() })
    const kept = t.api.listRecords({ workspaceId: t.api.ACROSS_WORKSPACES, includeDeleted: false, ...which })
    expect(kept.map((record) => record.id)).toContain(naming)
    expect(kept.length).toBeLessThan(5)
    expect(await theDoorLists(asked)).toEqual([naming])
  })

  it('reads by its condition of round 63 when the index keeps more records than it reads by id, and lists the same', async () => {
    const { AT_MOST_READ_BY_ID } = await import('../src/server/lib/record-text-index.ts')
    const asked = '/test-worktrees/夹具标定'
    copiesOf(report('Synthetic note on 夹具标定', { text: 'Synthetic: the 夹具标定 bench, with no path' }), AT_MOST_READ_BY_ID)
    const naming = report('Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    expect(whichRecordsCouldNameIt(asked), 'the index keeps more records than it reads by id').not.toHaveProperty('ids')
    expect(await theDoorLists(asked)).toEqual([naming])
  })

  // On a made-up office at panelx's live share, more than AT_MOST_READ_BY_ID records hold "report-files", so a door that
  // asked about every store's name read every record by its condition, twice, for a folder in no store (round 72).
  it('asks about no store’s name for a folder that holds no store, so it still reads by id when many records hold one', async () => {
    const { AT_MOST_READ_BY_ID } = await import('../src/server/lib/record-text-index.ts')
    const { theDataFolderHasMoved } = await import('../src/server/api/files.ts')
    expect(theDataFolderHasMoved(), 'the test office’s data folder is the default one, so no store’s name would be asked').toBe(true)
    const asked = '/test-worktrees/夹具标定'
    copiesOf(report('Synthetic report with a stored picture', { blocks: [{ id: 'evidence', type: 'image', path: '/made-up/data/report-files/picture.png' }] }), AT_MOST_READ_BY_ID)
    const naming = report('Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    expect(whichRecordsCouldNameIt(asked), 'the door does not read by the ids the index keeps').toHaveProperty('ids')
    expect(await theDoorLists(asked)).toEqual([naming])
  })

  /**
   * What the door answered for a folder, the ids of the rows each statement that read records whole handed back while
   * it answered, and how many statements asked a condition on the stored text.
   */
  async function whatTheDoorRead(folder: string): Promise<{ answer: unknown; readWhole: string[]; askedTheText: number }> {
    app = (await apiApp()).app
    await app.ready()
    const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
    const readWhole: string[] = []
    let askedTheText = 0
    const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
    const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
      const statement = prepare(source)
      const selected = /^select (.*?) from "records"/i.exec(source)?.[1]?.split(', ')
      const whole = selected !== undefined && columns.every((column) => selected.includes(column))
      if (/from "records"/i.test(source) && source.includes('instr(')) askedTheText++
      if (whole) {
        const at = selected.indexOf('"id"')
        const real = statement.all.bind(statement) as (...values: unknown[]) => unknown[]
        ;(statement as unknown as Record<string, unknown>).all = (...values: unknown[]) => {
          const rows = real(...values)
          for (const row of rows) readWhole.push(String(Array.isArray(row) ? row[at] : (row as { id: string }).id))
          return rows
        }
      }
      return statement
    }) as never)
    try {
      const reply = await app.inject({
        method: 'GET',
        url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`,
        headers: { 'x-mole-office-workspace': 'default' },
      })
      expect(reply.statusCode, reply.body).toBe(200)
      const { records, hiddenCount, leftOut } = reply.json() as { records: { id: string }[]; hiddenCount: number; leftOut: { id: string }[] }
      return { answer: { records: records.map((record) => record.id), hiddenCount, leftOut: leftOut.map((record) => record.id) }, readWhole, askedTheText }
    } finally {
      spy.mockRestore()
      await app.close()
      app = undefined
    }
  }

  // Before round 72 the door read every record it kept whole twice: this project's for its list, and every project's
  // again only to count the ones it could not list. In the read by condition that was two passes over the stored text.
  it('reads each record it keeps whole once and asks its condition once, by id and by its condition, and counts the same', async () => {
    const { AT_MOST_READ_BY_ID } = await import('../src/server/lib/record-text-index.ts')
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'elsewhere', title: 'Synthetic other project' })
    const asked = '/test-worktrees/bench-72'
    const naming = report('Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    report('Synthetic report in another project', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/other.txt` }] }, 'elsewhere')
    aRecord('Synthetic note naming the folder in its text', null, { text: `Synthetic: the log is ${asked}/run.log.` })
    const expected = { records: [naming], hiddenCount: 2, leftOut: [] }
    const twice = (ids: string[]): string[] => ids.filter((id, at) => ids.indexOf(id) !== at)

    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    expect(whichRecordsCouldNameIt(asked), 'the first read is not by id').toHaveProperty('ids')
    const byId = await whatTheDoorRead(asked)
    expect(byId.answer).toEqual(expected)
    expect(byId.readWhole.length, 'the door read no record whole, so this proved nothing').toBeGreaterThan(0)
    expect(twice(byId.readWhole), 'records the door read whole twice, by id').toEqual([])

    copiesOf(aRecord('Synthetic note on bench-72', null, { text: 'Synthetic: the bench-72 bench, with no path' }), AT_MOST_READ_BY_ID)
    expect(whichRecordsCouldNameIt(asked), 'the second read is not by its condition').toMatchObject({ alsoWhere: expect.anything() })
    const byCondition = await whatTheDoorRead(asked)
    expect(byCondition.answer).toEqual(expected)
    expect(byCondition.askedTheText, 'statements that asked the condition on the stored text').toBe(1)
    expect(twice(byCondition.readWhole), 'records the door read whole twice, by its condition').toEqual([])
  })
})

// ============================================================================ 5. a project's read given ids

/** Each statement `work` ran that reads, with its query plan in SQLite's words for the values it was given. */
function thePlansDuring(work: () => unknown): { sql: string; plan: string }[] {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
        ran.push({ sql: source, values })
        return real(...values)
      }
    }
    return statement
  }) as never)
  try {
    work()
  } finally {
    spy.mockRestore()
  }
  return ran
    .filter((one) => /^\s*select/i.test(one.sql))
    .map((one) => ({
      sql: one.sql,
      plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[])
        .map((step) => step.detail)
        .join('; '),
    }))
}

describe("a project's read given ids", () => {
  // Sixty ids, in one piece. With 3, SQLite started from the ids whether the project was asked off its index or not.
  // With 10 or more, it read the project's condition through two indexes unless it was asked off them.
  it('starts from the ids, with no kind, the kind message or another kind, and reads no index of a project or a kind', () => {
    const first = aRecord('Synthetic planned record', null, {})
    copiesOf(first, 59)
    const ids = [first, ...Array.from({ length: 59 }, (_, at) => `${first}-${String(at + 1)}`)]
    for (const kind of [undefined, 'message', 'note'] as const) {
      const plans = thePlansDuring(() => t.api.listRecords({ workspaceId: 'default', ...(kind === undefined ? {} : { kind }), ids }))
      expect(plans, `the reads with kind ${String(kind)}`).toHaveLength(1)
      const { plan } = plans[0]!
      expect(plan, `with kind ${String(kind)}`).toMatch(/SEARCH records USING INDEX sqlite_autoindex_records_1 \(id=\?\)/)
      expect(plan, `with kind ${String(kind)}`).not.toMatch(/MULTI-INDEX OR|SCAN records|SEARCH records USING INDEX (?!sqlite_autoindex_records_1)/)
    }
    expect(t.api.listRecords({ workspaceId: 'default', ids }).map((record) => record.id).sort()).toEqual([...ids].sort())
  })
})
