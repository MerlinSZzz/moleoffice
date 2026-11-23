// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0278 STILL IMPORTS, AND KEEPS EACH READER'S NEWEST READ OF EACH CONVERSATION.
 *
 * Wave 13s round 64. Since migration 0278, `conversation_reads` keeps one row for
 * each reader in each conversation in each project, the newest read, and a unique index refuses a second. An archive
 * written before 0278 holds every read, so a restore of it used to stop on that index: SQLite refused the second read
 * of a key, the whole import rolled back, and the preview had said it would go through. Every text archive the office
 * wrote before this round holds such reads, so none of them could be restored on the way back from a lost disk.
 *
 * NOW THE IMPORT FOLDS THE READS THE WAY 0278 DOES, BY THE RULE A READ IS WRITTEN BY. `aReadMovesTheReadPoint` in
 * src/server/lib/messages.ts says whether a read replaces the one held, and the import asks it rather than a copy of
 * it: for a key the database already holds, and for the reads of one key in the archive, taken in the order the import
 * writes them, which is the order of their ids. An archive carries no order of writing, so two reads of one key in one
 * second from different sides keep the later id. The restores before this one already wrote these rows in id order, so
 * a restored database broke such a tie by id before this round as well. Two reads in one second from the same side
 * are one read made twice, and the earlier id is kept, as a writer writes nothing for the second.
 *
 * THE PREVIEW AND THE RESTORE AGREE. planImport's note says how many reads are left out, and applyImport leaves out
 * exactly that many. It is a note and not a refusal, because the loss was accepted in a message, recorded as a
 * decision, and the restore goes on. The note says what is kept
 * and that the older reads are not restored, and names no record: this office's ids mean nothing in another office.
 *
 * A HELD READ THAT A NEWER ONE IN THE ARCHIVE REPLACES IS DELETED, and the archive's read goes in under its own id, as
 * `recordThatSomebodyRead` does, so a restored database keeps the origin's ids. It is one of the two kinds of row an
 * import deletes; the other is the own row of an office nobody has used yet, with its picture, which gives way to the
 * archive's. The plan lists each as a delete before anything is written, and every reply of /api/import names both
 * (tests/import-api.test.ts).
 *
 * HOW THE OLD ARCHIVE IS MADE. A test database drops 0278's unique index, writes its reads as the office wrote them
 * before 0278, one row for every read, and is exported; the manifest's migration block for 0278 is then taken out.
 * The database the archive is restored into stands for one migrated now, so the reads it already holds are written
 * with the kind of their side beside it, as a writer writes a read now, and the archive's are written without it, as
 * before migration 0311. Every name here is made up.
 *
 * MUTATION PROOF (after a green control), in src/server/lib/import.ts and src/server/lib/messages.ts:
 *   - the fold taken out of the import's writes: the UNIQUE error comes back;
 *   - the note taken out of the plan: the preview says nothing of the reads it leaves out;
 *   - the older of two reads kept instead of the newer;
 *   - for a key the database holds, the archive's older read written over the held newer one;
 *   - the held read's delete taken out of the plan's rows: the plan does not show it;
 *   - a held read the import deletes still counted as a row the archive does not mention;
 *   - a read in the same second from another side not taken as moving the read point: the tie keeps the earlier id;
 *   - a read at the same point from the same side taken as moving it: the repeat keeps the later id.
 * And in src/server/api/import.ts, the exception taken out of the reply's promise: tests/import-api.test.ts goes red.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const PROJECT = 'default'
const PAIR = 'made-up-agent-a~made-up-agent-b'
const SECOND_PAIR = 'made-up-agent-a~made-up-agent-c'
const THIRD_PAIR = 'made-up-agent-b~made-up-agent-c'
const THE_MIGRATION = '_a_reader_keeps_only_the_newest_read'

/** One read, as the office wrote it. */
interface Read {
  id: string
  pair: string
  asSide: string
  at: string
}

/**
 * FIVE READS OF THREE KEYS, as the office wrote them before 0278.
 *
 * The first key's newer read has the LOWER id, so the import meets it first and must still keep it over the older
 * read it meets after. The second key's two reads share one second from different sides, and the later id is kept.
 */
const WITH_OLDER_READS: readonly Read[] = [
  { id: 'r-z-older', pair: PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 10:00:00' },
  { id: 'r-a-newer', pair: PAIR, asSide: 'made-up-agent-b', at: '2026-10-01 10:05:00' },
  { id: 'r-tie-1', pair: SECOND_PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 10:00:00' },
  { id: 'r-tie-2', pair: SECOND_PAIR, asSide: 'made-up-agent-c', at: '2026-10-01 10:00:00' },
  { id: 'r-only', pair: THIRD_PAIR, asSide: 'made-up-agent-b', at: '2026-10-01 09:00:00' },
]
const KEPT = ['r-a-newer', 'r-only', 'r-tie-2']

const READER = { kind: 'person', id: 'made-up-reader' } as const

const open: TestDb[] = []
const folders: string[] = []
afterEach(() => {
  for (const one of open.splice(0)) one.close()
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function aFolder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-0278-${name}-`))
  folders.push(dir)
  return dir
}

/** Write these reads in one of two forms: as before migration 0311, with no kind beside the side, or as a writer writes one now. */
function writeReads(t: TestDb, reads: readonly Read[], form: 'before 0311' | 'now' = 'before 0311'): void {
  const insert = t.client.sqlite.prepare(
    'INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, as_side_kind, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  // Every side here is one of the two agents of its pair, so a writer now writes 'agent' beside it.
  for (const one of reads) insert.run(one.id, PROJECT, READER.kind, READER.id, one.pair, one.asSide, form === 'now' ? 'agent' : null, one.at)
}

/** Take 0278's block out of the manifest, as an export before it was written. */
function takeOut0278(dir: string): void {
  const manifest = join(dir, 'MANIFEST.md')
  const before = readFileSync(manifest, 'utf8')
  const after = before.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "\d{4}_a_reader_keeps_only_the_newest_read"\n```\n*/g, '')
  if (after === before || after.includes(THE_MIGRATION)) throw new Error('the manifest did not name migration 0278 once, so the archive is not made old')
  writeFileSync(manifest, after)
}

/** An archive written as the office wrote one before 0278, holding these reads, from a database seeded or empty. */
async function anArchiveHolding(reads: readonly Read[], options: { seeded?: boolean } = {}): Promise<string> {
  const source = await freshDb()
  open.push(source)
  if (options.seeded === true) await import('../scripts/seed.ts')
  const exportLib = await import('../src/server/lib/export.ts')
  // BEFORE 0278 THE TABLE HAD NO UNIQUE INDEX, and every read was a row.
  source.client.sqlite.exec('DROP INDEX conversation_reads_one_per_reader_idx')
  writeReads(source, reads)
  const dir = aFolder('archive')
  exportLib.writeExport(dir)
  takeOut0278(dir)
  return dir
}

/** A freshly migrated database, holding these reads already, and the import as it reads that database. */
async function aDatabaseHolding(reads: readonly Read[]): Promise<{ t: TestDb; importLib: ImportLib }> {
  const t = await freshDb()
  open.push(t)
  writeReads(t, reads, 'now')
  return { t, importLib: await import('../src/server/lib/import.ts') }
}

function idsIn(t: TestDb): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM conversation_reads ORDER BY id').all() as { id: string }[]).map((row) => row.id)
}

/** The plan's note about the reads it leaves out, or undefined when it wrote none. */
function theReadsNote(notes: readonly string[]): string | undefined {
  return notes.find((note) => /^\d+ conversation_reads row\(s\) were left out/.test(note))
}

/** The note's count, its share from the archive, and its share held in the database. */
function theCounts(note: string | undefined): { all: number; fromTheArchive: number; heldHere: number } {
  const match = /^(\d+) conversation_reads row\(s\) were left out: (\d+) in this archive, and (\d+) held in this database/.exec(note ?? '')
  if (match === null) throw new Error(`the plan's note does not give the count: ${String(note)}`)
  return { all: Number(match[1]), fromTheArchive: Number(match[2]), heldHere: Number(match[3]) }
}

/** The reads the restore saw, in the archive or held, that it did not keep. */
function leftOutBy(archiveIds: readonly string[], heldBefore: readonly string[], after: readonly string[]): string[] {
  return [...new Set([...archiveIds, ...heldBefore])].filter((id) => !after.includes(id)).sort()
}

/** Every file under a directory, as text, keyed by its path relative to the root. */
function files(root: string): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else out.set(relative(root, full).split(sep).join('/'), readFileSync(full, 'utf8'))
    }
  }
  visit(root)
  return out
}

// These tests cite a decision.
describe('an archive written before 0278, into a freshly migrated database', { timeout: 60_000 }, () => {
  it('keeps the earlier id of two reads of one key from the same side in the same second', async () => {
    // ONE READ TWICE: the second does not move the read point, as a writer writes nothing for it.
    const archive = await anArchiveHolding([
      { id: 'r-repeat-1', pair: PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 10:00:00' },
      { id: 'r-repeat-2', pair: PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 10:00:00' },
    ])
    const { t, importLib } = await aDatabaseHolding([])

    const report = importLib.applyImport(archive)

    expect(report.applied).toBe(true)
    expect(idsIn(t)).toEqual(['r-repeat-1'])
  })

  it('says in the preview how many reads it leaves out, and the restore leaves out exactly that many', async () => {
    const archive = await anArchiveHolding(WITH_OLDER_READS)
    const { t, importLib } = await aDatabaseHolding([])

    const plan = importLib.planImport(archive)
    const note = theReadsNote(plan.notes)
    expect(plan.ok).toBe(true)
    expect(plan.refusals).toEqual([])
    expect(theCounts(note)).toEqual({ all: 2, fromTheArchive: 2, heldHere: 0 })
    expect(plan.inserts['conversation_reads']).toBe(KEPT.length)

    importLib.applyImport(archive)

    const leftOut = leftOutBy(WITH_OLDER_READS.map((one) => one.id), [], idsIn(t))
    expect(leftOut).toEqual(['r-tie-1', 'r-z-older'])
    expect(leftOut).toHaveLength(theCounts(note).all)
  })

  it('says what it keeps and that the older reads are not restored, as a note that names no record', async () => {
    const archive = await anArchiveHolding(WITH_OLDER_READS)
    const { importLib } = await aDatabaseHolding([])

    const note = theReadsNote(importLib.planImport(archive).notes)

    expect(note).toContain('Each reader keeps one read of each conversation in each project, the newest, and a newer read replaces it.')
    expect(note).toContain('The older reads are not restored.')
    expect(note).not.toMatch(/madeUprcgywm|madeUpozoixm/)
  })

  it('writes no note for an archive holding one read of each key', async () => {
    const archive = await anArchiveHolding(WITH_OLDER_READS.filter((one) => KEPT.includes(one.id)))
    const { t, importLib } = await aDatabaseHolding([])

    expect(theReadsNote(importLib.planImport(archive).notes)).toBeUndefined()
    importLib.applyImport(archive)
    expect(idsIn(t)).toEqual(KEPT)
  })
})

describe('an archive read of a key the database already holds under another id', { timeout: 60_000 }, () => {
  it('replaces the held read when the archive read is newer, and the preview counts the held one', async () => {
    const archive = await anArchiveHolding([{ id: 'r-a-newer', pair: PAIR, asSide: 'made-up-agent-b', at: '2026-10-01 10:05:00' }])
    const { t, importLib } = await aDatabaseHolding([{ id: 'held-older', pair: PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 09:00:00' }])

    const plan = importLib.planImport(archive)
    const note = theReadsNote(plan.notes)
    expect(theCounts(note)).toEqual({ all: 1, fromTheArchive: 0, heldHere: 1 })
    expect(plan.rows.filter((row) => row.region === 'conversation_reads').map((row) => `${row.action} ${row.key}`)).toEqual([
      'delete held-older',
      'insert r-a-newer',
    ])
    // THE NOTE IS THE ONE THE IMPORT MAKES for one held read that a newer one replaces, in an office whose own row and
    // picture give way to the archive's as well, so it names both as the rows this import deletes.
    expect(note).toBe(importLib.whatTheReadsNoteSays({ fromTheArchive: new Set(), heldHere: new Set(['held-older']) }, true))
    expect(plan.notInArchive['conversation_reads']).toBe(0)
    importLib.applyImport(archive)

    expect(idsIn(t)).toEqual(['r-a-newer'])
    expect(leftOutBy(['r-a-newer'], ['held-older'], idsIn(t))).toHaveLength(theCounts(note).all)
  })

  it('keeps the held read when the archive read is older, and the preview counts the archive one', async () => {
    const archive = await anArchiveHolding([{ id: 'r-a-newer', pair: PAIR, asSide: 'made-up-agent-b', at: '2026-10-01 10:05:00' }])
    const { t, importLib } = await aDatabaseHolding([{ id: 'held-newer', pair: PAIR, asSide: 'made-up-agent-a', at: '2026-10-01 11:00:00' }])

    const plan = importLib.planImport(archive)
    const note = theReadsNote(plan.notes)
    expect(theCounts(note)).toEqual({ all: 1, fromTheArchive: 1, heldHere: 0 })
    expect(plan.inserts['conversation_reads'] ?? 0).toBe(0)
    importLib.applyImport(archive)

    expect(idsIn(t)).toEqual(['held-newer'])
    expect(leftOutBy(['r-a-newer'], ['held-newer'], idsIn(t))).toHaveLength(theCounts(note).all)
  })
})

describe('the way back from a lost disk: fresh clone, migrate, import an archive written before 0278', { timeout: 60_000 }, () => {
  it('brings every other table back whole, and conversation_reads back as one row per key', async () => {
    const archive = await anArchiveHolding(WITH_OLDER_READS, { seeded: true })
    const { t, importLib } = await aDatabaseHolding([])

    const report = importLib.applyImport(archive)
    expect(report.applied).toBe(true)
    expect(idsIn(t)).toEqual(KEPT)

    // THE RESTORED DATABASE, EXPORTED AGAIN, IS THE ARCHIVE BYTE FOR BYTE, except where the reads are counted and
    // listed and where the manifest names 0278, which the restored database has and the old archive did not.
    const exportLib = await import('../src/server/lib/export.ts')
    const again = aFolder('again')
    exportLib.writeExport(again)
    const before = files(archive)
    const after = files(again)
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
    const differing = [...before.keys()].filter((path) => after.get(path) !== before.get(path)).sort()
    expect(differing).toEqual(['MANIFEST.md', 'README.md', 'conversation-reads.md'])
  })
})
