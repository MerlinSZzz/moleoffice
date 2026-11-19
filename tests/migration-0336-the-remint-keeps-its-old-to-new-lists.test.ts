// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0336 GIVES THE RE-MINT ONE TABLE FOR ITS OLD-TO-NEW LISTS, AND REFUSES A ROW OF THE WRONG SHAPE.
 *
 * OLD: the table held four lists. A seal whose content the re-mint rewrote got a new own hash, and nothing kept
 * the own hash it replaced. Two partial unique indexes kept the table's pairs.
 * NEW: `registry_remint_kept_lists` holds one row for each pair of old and new, of one of five lists, in one
 * generation: an agent's old id and its new one, a revision's old content hash and its new one, the old hash a
 * seal pinned a revision row by and the new hash of that row, the old hash a seal pinned a link's row by and the
 * new hash of that row, and a seal's old own hash and the own hash of its rewritten content. A `link_hash` row
 * names its link by `link_id`; the other four lists have no link id. A `seal_own_hash` row names the seal's
 * revision by its record and seq, and each of its hashes has the length `sealHash` makes.
 * The shape checks refuse a list word that is not one of the five, a record id, seq or link id on an agent row,
 * a missing record id or seq, or a link id, on a content-hash, seal-hash or seal-own-hash row, a missing link id,
 * or a record id or seq, on a link-hash row, a seq below one, two equal values, and a hash or new agent id of the
 * wrong shape. Three partial unique indexes keep one new value for each old one, one content-hash pair for each
 * revision, and one own-hash pair for each seal revision, in a generation. A revision can hold both a content-hash
 * pair and an own-hash pair, because the re-mint changes both when it rewrites a seal. An archive carries the
 * table, and an `agent_id` row whose record id, seq and link id are NULL comes back once from an archive imported
 * twice.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. Every generation, hash, agent id,
 * record id and link id here is made up.
 *
 * THE REFERENCE IS A FOREIGN KEY AND A FRESH OFFICE HOLDS IT. `src/server/db/client.ts` turns `foreign_keys` on,
 * and `freshDb` opens that connection, so a row whose generation names no generation row is refused by SQLite
 * itself. The case also reads `PRAGMA foreign_key_list` and checks that the column points at the generations table.
 *
 * MUTATIONS, each after a control run and each restored from the commit:
 *   1. take the list-word check out of the migration: case 2 goes red.
 *   2. take the check that ties record_id, seq and link_id to the list out: case 2 goes red.
 *   3. take the check that old and new differ out: case 2 goes red.
 *   4. put 15 in place of HASH_CHARS in the migration: case 2 goes red.
 *   5. take the reference to the generations table out: case 2 goes red.
 *   6. take the (generation, list, old) unique index out: case 3 goes red.
 *   7. put the content-hash index on (generation, list, old): case 3 goes red.
 *   8. make the writer skip every seal_hash row: case 4 goes red.
 *   9. make the proof filler write no kept-list row: the export and restore tests are the ones that could show it.
 *  10. print a NULL key column differently on each side of the import's key: the import-twice case goes red.
 *  11. leave link_hash out of the list-word check: cases 2 and 4 go red.
 *  12. take the link id out of what a link_hash row needs: case 2 goes red.
 *  13. take the ban on a link id on the other three lists out: case 2 goes red.
 *  14. put 63 in place of 64 in the link-hash length check: case 2 goes red.
 *  15. leave link_hash out of the (generation, list, old) index: case 3 goes red.
 *  16. make the writer write null in link_id on every row: case 4 goes red.
 *  17. make the proof filler write no link_hash row: the export and restore tests are the ones that could show it.
 *  18. leave seal_own_hash out of the list-word check: cases 2 to 4 go red.
 *  19. take seal_own_hash out of what needs a record id and a seq: case 2 goes red.
 *  20. take the seal-own-hash length check out: case 2 goes red.
 *  21. take the (generation, record_id, seq) own-hash index out: cases 1 and 3 go red.
 *  22. put seal_own_hash in the content-hash index's condition and take its own index out: cases 1 to 4 go red.
 *  23. make the writer skip every seal_own_hash row: case 4 goes red.
 *  24. make the proof filler write no seal_own_hash row: the export and restore tests are the ones that could show
 *      it.
 */
import type Database from 'better-sqlite3'
import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let restored: TestDb | undefined
let archive: string | undefined
beforeEach(async () => {
  t = await freshDb()
})
afterEach(() => {
  restored?.close()
  restored = undefined
  if (archive !== undefined) {
    removeThisTestFolder(archive)
    archive = undefined
  }
  t?.close()
})

/** One row of the table, with the property names the writer takes. */
interface KeptRow {
  list: 'agent_id' | 'content_hash' | 'seal_hash' | 'link_hash' | 'seal_own_hash'
  recordId: string | null
  seq: number | null
  linkId?: string | null
  old: string
  new: string
}

/**
 * The product's own words for this table: its name, its columns and its index names from the drizzle declaration,
 * the hash length from `versionOf`'s file, the mint's length from the one function that draws an office id, the
 * function that makes a seal's own hash, and the two writers from the re-mint's own module. Everything is imported
 * after `freshDb()`, because an import at the top of the file would open the database before the test office
 * exists.
 */
async function theProductsWords() {
  const schema = await import('../src/server/db/schema.ts')
  const { HASH_CHARS } = await import('../src/server/lib/version.ts')
  const { anOfficeId } = await import('../src/server/lib/ids.ts')
  const { sealHash, theHashOfARow } = await import('../src/server/lib/the-hash-a-seal-pins-a-row-by.ts')
  const remint = await import('../src/server/db/remint-migration.ts')
  const config = getTableConfig(schema.registryRemintKeptLists)
  return {
    table: getTableName(schema.registryRemintKeptLists),
    columns: config.columns.map((column) => column.name),
    indexNames: config.indexes.map((index) => index.config.name),
    indexColumns: config.indexes.map((index) => index.config.columns.map((column) => ('name' in column ? column.name : String(column)))),
    HASH_CHARS,
    mintLength: anOfficeId().length,
    sealHash,
    theHashOfARow,
    fileTheRemintGeneration: remint.fileTheRemintGeneration,
    fileTheKeptLists: remint.fileTheKeptLists,
  }
}

/** One row written straight into the table, which is the only way a case can offer a row of the wrong shape. */
function insertKeptRow(db: Database.Database, table: string, generation: string, row: KeptRow): void {
  db.prepare(`INSERT INTO "${table}" (generation, list, record_id, seq, link_id, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    generation,
    row.list,
    row.recordId,
    row.seq,
    row.linkId ?? null,
    row.old,
    row.new,
  )
}

/** The seven columns of one row as the database returns them, in the order the migration declares them. */
interface StoredKeptRow {
  generation: string
  list: string
  record_id: string | null
  seq: number | null
  link_id: string | null
  old: string
  new: string
}

describe('migration 0336 keeps the re-mint old-to-new lists', () => {
  it('has exactly the seven columns, in order, and the three unique indexes', async () => {
    const p = await theProductsWords()
    const db = t.client.sqlite
    expect(p.columns, 'the table the schema declares has the seven columns').toHaveLength(7)
    const columns = (db.prepare(`PRAGMA table_info("${p.table}")`).all() as { name: string }[]).map((column) => column.name)
    expect(columns).toEqual(p.columns)

    // THE THREE INDEXES ARE THE DECLARATION'S, read from the table object rather than retyped here.
    expect(p.indexNames).toEqual([expect.any(String), expect.any(String), expect.any(String)])
    const fromTheDatabase = (
      db.prepare(`PRAGMA index_list("${p.table}")`).all() as { name: string; unique: number; origin: string }[]
    )
      .filter((index) => index.origin === 'c')
      .map((index) => ({ name: index.name, unique: index.unique }))
    expect(fromTheDatabase.map((index) => index.name).sort()).toEqual([...p.indexNames].sort())
    for (const index of fromTheDatabase) expect(index.unique, index.name).toBe(1)

    for (const [at, name] of p.indexNames.entries()) {
      if (name === undefined) throw new Error('the table declaration names an index without a name')
      const columns = (db.prepare(`PRAGMA index_info("${name}")`).all() as { name: string }[]).map((column) => column.name)
      expect(columns, name).toEqual(p.indexColumns[at])
    }
  })

  it('refuses each row that breaks a check, and takes a row that keeps every one', async () => {
    const p = await theProductsWords()
    const db = t.client.sqlite
    const generation = p.theHashOfARow({ madeUp: 'a generation the office filed' })
    p.fileTheRemintGeneration(db, { digest: generation, schema: p.theHashOfARow({ madeUp: 'a schema digest' }), agents: 0 })

    const validAgent: KeptRow = { list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-legacy-agent', new: 'A'.repeat(p.mintLength) }
    const validContent: KeptRow = { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: 'a'.repeat(p.HASH_CHARS), new: 'b'.repeat(p.HASH_CHARS) }
    const validSeal: KeptRow = {
      list: 'seal_hash',
      recordId: 'a-made-up-record',
      seq: 2,
      old: p.theHashOfARow({ madeUp: 'the old seal hash' }),
      new: p.theHashOfARow({ madeUp: 'the new seal hash' }),
    }
    const validLink: KeptRow = {
      list: 'link_hash',
      recordId: null,
      seq: null,
      linkId: 'a-made-up-link',
      old: p.theHashOfARow({ madeUp: 'the old link hash' }),
      new: p.theHashOfARow({ madeUp: 'the new link hash' }),
    }
    // A seal's own hash and its new one, at the seal's record and the seq of its revision. That revision also holds
    // the content-hash pair above, as a seal the re-mint rewrites does.
    const validOwn: KeptRow = {
      list: 'seal_own_hash',
      recordId: 'a-made-up-record',
      seq: 1,
      old: p.sealHash('the content of a made-up seal'),
      new: p.sealHash('the same content after the rewrite'),
    }
    for (const row of [validAgent, validContent, validSeal, validLink, validOwn]) insertKeptRow(db, p.table, generation, row)
    expect((db.prepare(`SELECT count(*) AS n FROM "${p.table}"`).get() as { n: number }).n).toBe(5)

    /** A row the database must refuse, with the number the list says it breaks. */
    const refuses = (row: KeptRow, because: string, message = /CHECK/): void => {
      expect(() => insertKeptRow(db, p.table, generation, row), because).toThrow(message)
    }

    // THE LIST IS ONE OF FIVE WORDS. This row has a shape every other check takes, so only the list check can be
    // the one that refuses it.
    refuses({ list: 'a_word_no_list_has' as KeptRow['list'], recordId: 'a-made-up-record', seq: 3, linkId: null, old: 'c'.repeat(p.HASH_CHARS), new: 'd'.repeat(p.HASH_CHARS) }, 'a list word that is not one of the five')

    // A RECORD ID AND A SEQ BELONG TO THE CONTENT-HASH, SEAL-HASH AND SEAL-OWN-HASH LISTS, AND A LINK ID BELONGS TO
    // NO AGENT ROW.
    refuses({ ...validAgent, old: 'another-made-up-legacy-agent', recordId: 'a-made-up-record' }, 'an agent_id row with a record id')
    refuses({ ...validAgent, old: 'a-third-made-up-legacy-agent', seq: 1 }, 'an agent_id row with a seq')
    refuses({ ...validAgent, old: 'a-fourth-made-up-legacy-agent', linkId: 'a-made-up-link' }, 'an agent_id row with a link id')

    // EACH OF THE RECORD ID AND THE SEQ IS MISSING FROM A CONTENT-HASH, A SEAL-HASH AND A SEAL-OWN-HASH ROW, AND A
    // SEQ BELOW ONE IS REFUSED. None of the three may carry a link id.
    for (const list of ['content_hash', 'seal_hash', 'seal_own_hash'] as const) {
      const hashed = (label: string) => (list === 'seal_own_hash' ? p.sealHash(label) : p.theHashOfARow({ madeUp: label }))
      const old = list === 'content_hash' ? 'e'.repeat(p.HASH_CHARS) : hashed(`${list} without a record`)
      const newer = list === 'content_hash' ? 'f'.repeat(p.HASH_CHARS) : hashed(`${list} without a record, new`)
      refuses({ list, recordId: null, seq: 1, old, new: newer }, `a ${list} row without a record id`)
      refuses({ list, recordId: 'a-made-up-record', seq: null, old, new: newer }, `a ${list} row without a seq`)
      refuses({ list, recordId: 'a-made-up-record', seq: 0, old, new: newer }, `a ${list} row with seq 0`)
      refuses({ list, recordId: 'a-made-up-record', seq: 6, linkId: 'a-made-up-link', old, new: newer }, `a ${list} row with a link id`)
    }

    // A LINK-HASH ROW NAMES ITS LINK AND NOTHING ELSE, SO IT NEEDS A LINK ID AND TAKES NO RECORD ID OR SEQ.
    refuses({ ...validLink, old: p.theHashOfARow({ madeUp: 'a link without an id' }), new: p.theHashOfARow({ madeUp: 'its new hash' }), linkId: null }, 'a link_hash row without a link id')
    refuses({ ...validLink, recordId: 'a-made-up-record', seq: 1, old: p.theHashOfARow({ madeUp: 'a link with a record' }), new: p.theHashOfARow({ madeUp: 'its new hash' }) }, 'a link_hash row with a record id and a seq')
    refuses({ ...validLink, seq: 1, old: p.theHashOfARow({ madeUp: 'a link with a seq' }), new: p.theHashOfARow({ madeUp: 'its new hash' }) }, 'a link_hash row with a seq')

    // OLD AND NEW ARE NEVER EQUAL, on each of the five lists.
    refuses({ list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-same-agent', new: 'a-made-up-same-agent' }, 'an agent_id row whose old and new are the same')
    refuses({ list: 'content_hash', recordId: 'a-made-up-record', seq: 4, old: '0'.repeat(p.HASH_CHARS), new: '0'.repeat(p.HASH_CHARS) }, 'a content_hash row whose old and new are the same')
    refuses({ list: 'seal_hash', recordId: 'a-made-up-record', seq: 4, old: p.theHashOfARow({ madeUp: 'one seal' }), new: p.theHashOfARow({ madeUp: 'one seal' }) }, 'a seal_hash row whose old and new are the same')
    refuses({ list: 'link_hash', recordId: null, seq: null, linkId: 'a-made-up-link', old: p.theHashOfARow({ madeUp: 'one link' }), new: p.theHashOfARow({ madeUp: 'one link' }) }, 'a link_hash row whose old and new are the same')
    refuses({ ...validOwn, seq: 4, old: p.sealHash('one seal content'), new: p.sealHash('one seal content') }, 'a seal_own_hash row whose old and new are the same')

    // A CONTENT HASH IS HASH_CHARS LOWERCASE HEX CHARACTERS.
    refuses({ list: 'content_hash', recordId: 'a-made-up-record', seq: 5, old: 'a'.repeat(p.HASH_CHARS - 1), new: 'b'.repeat(p.HASH_CHARS) }, 'a content hash one character short')
    refuses({ list: 'content_hash', recordId: 'a-made-up-record', seq: 5, old: 'a'.repeat(p.HASH_CHARS + 1), new: 'b'.repeat(p.HASH_CHARS) }, 'a content hash one character too long')
    refuses({ list: 'content_hash', recordId: 'a-made-up-record', seq: 5, old: 'a'.repeat(p.HASH_CHARS), new: 'A'.repeat(p.HASH_CHARS) }, 'a content hash with an uppercase character')
    refuses({ list: 'content_hash', recordId: 'a-made-up-record', seq: 5, old: 'a'.repeat(p.HASH_CHARS), new: `g${'a'.repeat(p.HASH_CHARS - 1)}` }, 'a content hash with a character that is not hex')

    // A SEAL HASH IS 64 LOWERCASE HEX CHARACTERS.
    refuses({ list: 'seal_hash', recordId: 'a-made-up-record', seq: 5, old: p.theHashOfARow({ madeUp: 'a seal' }).slice(1), new: p.theHashOfARow({ madeUp: 'another seal' }) }, 'a seal hash one character short')
    refuses({ list: 'seal_hash', recordId: 'a-made-up-record', seq: 5, old: p.theHashOfARow({ madeUp: 'a seal' }), new: p.theHashOfARow({ madeUp: 'another seal' }).toUpperCase() }, 'a seal hash with uppercase characters')

    // A LINK HASH IS 64 LOWERCASE HEX CHARACTERS TOO, IN OLD AND IN NEW.
    const oldLink = p.theHashOfARow({ madeUp: 'a link row' })
    const newLink = p.theHashOfARow({ madeUp: 'the same link row after the rewrite' })
    refuses({ ...validLink, old: oldLink.slice(1), new: newLink }, 'a link hash one character short in old')
    refuses({ ...validLink, old: `A${oldLink.slice(1)}`, new: newLink }, 'a link hash with an uppercase character in old')
    refuses({ ...validLink, old: oldLink, new: newLink.slice(1) }, 'a link hash one character short in new')
    refuses({ ...validLink, old: oldLink, new: `g${newLink.slice(1)}` }, 'a link hash with a character that is not lowercase hex in new')

    // A SEAL'S OWN HASH HAS THE LENGTH `sealHash` MAKES, IN LOWERCASE HEX, IN OLD AND IN NEW.
    const oldOwn = p.sealHash('the content of a seal before the rewrite')
    const newOwn = p.sealHash('the content of that seal after the rewrite')
    const own = (old: string, newer: string): KeptRow => ({ ...validOwn, seq: 5, old, new: newer })
    refuses(own(oldOwn.slice(1), newOwn), 'a seal own hash one character short in old')
    refuses(own(`${oldOwn}a`, newOwn), 'a seal own hash one character too long in old')
    refuses(own(`A${oldOwn.slice(1)}`, newOwn), 'a seal own hash with an uppercase character in old')
    refuses(own(oldOwn, newOwn.slice(1)), 'a seal own hash one character short in new')
    refuses(own(oldOwn, `g${newOwn.slice(1)}`), 'a seal own hash with a character that is not lowercase hex in new')
    expect(() => insertKeptRow(db, p.table, generation, own(oldOwn, newOwn)), 'the same row with both hashes of the right shape').not.toThrow()

    // A NEW AGENT ID IS THE MINT'S LENGTH. Only the length is checked, so a made-up alphabet is enough.
    refuses({ list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-agent', new: 'A'.repeat(p.mintLength - 1) }, 'a new agent id one character short')
    refuses({ list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-agent', new: 'A'.repeat(p.mintLength + 1) }, 'a new agent id one character too long')

    // A GENERATION THAT NO GENERATION ROW NAMES IS REFUSED BY THE REFERENCE. The pragma says the reference is a
    // foreign key to the generations table, and the connection has `foreign_keys` on, so the insert itself fails.
    const references = db.prepare(`PRAGMA foreign_key_list("${p.table}")`).all() as { table: string; from: string; to: string }[]
    expect(references).toContainEqual(expect.objectContaining({ table: 'registry_remint_generations', from: 'generation', to: 'digest' }))
    const noGeneration = p.theHashOfARow({ madeUp: 'a generation no generation row names' })
    expect(() =>
      insertKeptRow(db, p.table, noGeneration, {
        ...validContent,
        recordId: 'a-made-up-record-with-no-generation',
        old: '1'.repeat(p.HASH_CHARS),
        new: '2'.repeat(p.HASH_CHARS),
      }),
      'a generation no generation row names',
    ).toThrow(/FOREIGN KEY/)
  })

  it('refuses a second row through each unique index, and allows the same pair in another generation', async () => {
    const p = await theProductsWords()
    const db = t.client.sqlite
    const one = p.theHashOfARow({ madeUp: 'the first generation' })
    const another = p.theHashOfARow({ madeUp: 'another generation' })
    for (const digest of [one, another]) p.fileTheRemintGeneration(db, { digest, schema: p.theHashOfARow({ madeUp: 'a schema digest' }), agents: 0 })
    const insert = (generation: string, row: KeptRow) => insertKeptRow(db, p.table, generation, row)
    const newAgent = (n: number) => String(n).repeat(p.mintLength)
    const content = (label: string) => p.theHashOfARow({ madeUp: label }).slice(0, p.HASH_CHARS)

    // ONE NEW ID FOR EACH OLD AGENT ID IN A GENERATION.
    const oldAgent = 'a-made-up-old-agent'
    insert(one, { list: 'agent_id', recordId: null, seq: null, old: oldAgent, new: newAgent(1) })
    expect(() => insert(one, { list: 'agent_id', recordId: null, seq: null, old: oldAgent, new: newAgent(2) })).toThrow(/UNIQUE/)
    expect(() => insert(another, { list: 'agent_id', recordId: null, seq: null, old: oldAgent, new: newAgent(2) })).not.toThrow()

    // ONE NEW HASH FOR EACH OLD SEAL HASH IN A GENERATION.
    const oldSeal = p.theHashOfARow({ madeUp: 'an old seal hash' })
    insert(one, { list: 'seal_hash', recordId: 'a-made-up-record', seq: 1, old: oldSeal, new: p.theHashOfARow({ madeUp: 'a new seal hash' }) })
    expect(() =>
      insert(one, { list: 'seal_hash', recordId: 'a-made-up-record', seq: 2, old: oldSeal, new: p.theHashOfARow({ madeUp: 'another new seal hash' }) }),
    ).toThrow(/UNIQUE/)
    expect(() =>
      insert(another, { list: 'seal_hash', recordId: 'a-made-up-record', seq: 1, old: oldSeal, new: p.theHashOfARow({ madeUp: 'a third new seal hash' }) }),
    ).not.toThrow()

    // ONE NEW HASH FOR EACH OLD LINK HASH IN A GENERATION, whatever link it names.
    const oldLink = p.theHashOfARow({ madeUp: 'an old link hash' })
    insert(one, { list: 'link_hash', recordId: null, seq: null, linkId: 'a-made-up-link', old: oldLink, new: p.theHashOfARow({ madeUp: 'a new link hash' }) })
    expect(() =>
      insert(one, { list: 'link_hash', recordId: null, seq: null, linkId: 'another-made-up-link', old: oldLink, new: p.theHashOfARow({ madeUp: 'another new link hash' }) }),
    ).toThrow(/UNIQUE/)
    expect(() =>
      insert(another, { list: 'link_hash', recordId: null, seq: null, linkId: 'a-made-up-link', old: oldLink, new: p.theHashOfARow({ madeUp: 'a third new link hash' }) }),
    ).not.toThrow()

    // ONE CONTENT-HASH PAIR FOR EACH REVISION IN A GENERATION. The old hash alone is not the key, because two
    // revisions of different records can hold the same content.
    const firstOld = content('a content hash')
    insert(one, { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: firstOld, new: content('the first new content hash') })
    expect(() =>
      insert(one, { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: content('another old content hash'), new: content('the second new content hash') }),
    ).toThrow(/UNIQUE/)
    expect(() =>
      insert(another, { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: firstOld, new: content('the third new content hash') }),
    ).not.toThrow()

    // THE SAME OLD CONTENT HASH ON TWO DIFFERENT REVISIONS IS TAKEN TWICE.
    expect(() =>
      insert(one, { list: 'content_hash', recordId: 'a-made-up-record', seq: 2, old: firstOld, new: content('the fourth new content hash') }),
    ).not.toThrow()
    expect(() =>
      insert(one, { list: 'content_hash', recordId: 'another-made-up-record', seq: 1, old: firstOld, new: content('the fifth new content hash') }),
    ).not.toThrow()

    // ONE OWN-HASH PAIR FOR EACH SEAL REVISION IN A GENERATION. The revision that holds a content-hash pair above
    // takes an own-hash pair too, because a rewritten seal changes both.
    const ownOld = p.sealHash('the content of a made-up seal')
    insert(one, { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 1, old: ownOld, new: p.sealHash('its content after the rewrite') })
    expect(() =>
      insert(one, { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 1, old: p.sealHash('other content'), new: p.sealHash('other content after the rewrite') }),
    ).toThrow(/UNIQUE/)
    expect(() =>
      insert(another, { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 1, old: ownOld, new: p.sealHash('its content after another rewrite') }),
    ).not.toThrow()
    expect(() =>
      insert(one, { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 2, old: p.sealHash('the content of its second revision'), new: p.sealHash('that content after the rewrite') }),
    ).not.toThrow()
  })

  it('writes every row it is given, of all five lists, and they read back exactly', async () => {
    const p = await theProductsWords()
    const db = t.client.sqlite
    const generation = p.theHashOfARow({ madeUp: 'the generation the writer filed' })
    p.fileTheRemintGeneration(db, { digest: generation, schema: p.theHashOfARow({ madeUp: 'a schema digest' }), agents: 0 })
    const rows: KeptRow[] = [
      // This agent row is given with no linkId field at all, and must read back with a null link_id.
      { list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-old-agent', new: 'B'.repeat(p.mintLength) },
      { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: p.theHashOfARow({ madeUp: 'a content hash' }).slice(0, p.HASH_CHARS), new: p.theHashOfARow({ madeUp: 'a new content hash' }).slice(0, p.HASH_CHARS) },
      { list: 'seal_hash', recordId: 'a-made-up-record', seq: 1, old: p.theHashOfARow({ madeUp: 'an old seal hash' }), new: p.theHashOfARow({ madeUp: 'a new seal hash' }) },
      { list: 'link_hash', recordId: null, seq: null, linkId: 'a-made-up-link', old: p.theHashOfARow({ madeUp: 'an old link hash' }), new: p.theHashOfARow({ madeUp: 'a new link hash' }) },
      { list: 'content_hash', recordId: 'another-made-up-record', seq: 3, old: p.theHashOfARow({ madeUp: 'a repeated content hash' }).slice(0, p.HASH_CHARS), new: p.theHashOfARow({ madeUp: 'another new content hash' }).slice(0, p.HASH_CHARS) },
      { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 1, old: p.sealHash('the content of a made-up seal'), new: p.sealHash('that content after the rewrite') },
    ]
    p.fileTheKeptLists(db, generation, rows)

    const stored = db
      .prepare(`SELECT generation, list, record_id, seq, link_id, old, new FROM "${p.table}" ORDER BY rowid`)
      .all() as StoredKeptRow[]
    expect(stored).toEqual(
      rows.map((row) => ({ generation, list: row.list, record_id: row.recordId, seq: row.seq, link_id: row.linkId ?? null, old: row.old, new: row.new })),
    )
    const agent = stored.find((row) => row.list === 'agent_id')
    expect(agent).toBeDefined()
    expect(agent?.link_id).toBeNull()
  })

  it('keeps one agent-id row whose key columns are null through an archive imported twice', async () => {
    const p = await theProductsWords()
    const source = t.client.sqlite
    const generation = p.theHashOfARow({ madeUp: 'the generation the archive carries' })
    p.fileTheRemintGeneration(source, { digest: generation, schema: p.theHashOfARow({ madeUp: 'a schema digest' }), agents: 0 })
    const agentRow = { list: 'agent_id' as const, recordId: null, seq: null, old: 'a-made-up-old-agent', new: 'D'.repeat(p.mintLength) }
    p.fileTheKeptLists(source, generation, [agentRow])

    // AN ARCHIVE OF THIS OFFICE, then a second fresh office it is imported into twice. The import matches a stored
    // row by its whole primary key, and a null column prints the same on both sides.
    archive = aTestDatabaseFolder('kept-lists-in-an-archive')
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)
    restored = await freshDb()
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    const held = [{ generation, list: agentRow.list, record_id: agentRow.recordId, seq: agentRow.seq, old: agentRow.old, new: agentRow.new }]
    const read = () =>
      restored!.client.sqlite.prepare(`SELECT generation, list, record_id, seq, old, new FROM "${p.table}" ORDER BY rowid`).all()

    const first = importer.applyImport(archive)
    expect(first.refusals).toEqual([])
    expect(first.applied).toBe(true)
    expect(read()).toEqual(held)

    const second = importer.applyImport(archive)
    expect(second.refusals).toEqual([])
    expect(second.inserts[p.table]).toBe(0)
    expect(read()).toEqual(held)
  })
})
