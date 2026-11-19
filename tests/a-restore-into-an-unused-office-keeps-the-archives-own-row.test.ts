// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTORE INTO AN OFFICE NOBODY HAS USED YET KEEPS THE ARCHIVE'S OWN OFFICE ROW, AND REFUSES WHERE THE FRESH ROW IS NAMED.
 *
 * Every office draws its own row when it is migrated: an agent with the office's handle, an id drawn for it, and a
 * drawn picture. So an archive of office A, restored into a fresh office B, carries A's own row while B holds its
 * own, and two live agents would hold one handle. Decision VoBEPWMJn4AI settles it: where nothing in B
 * names B's own row apart from that row and its picture, the import deletes those two rows inside its transaction
 * and inserts A's like any other row. The plan carries a note naming both ids, and counts the two deleted rows.
 * Where anything names B's row, or the census cannot read a row, the import refuses, names the places and writes
 * nothing. An archive with no office row leaves B's row as it is.
 *
 * WHAT IS REAL: offices made in this process by `freshDb`, never the live office. A and B are fresh. C is fresh
 * too, and its own row and picture are deleted before its archive is written, so that archive stands for one
 * written before an office had a row of its own. The session record and the void mark in the third case are made
 * up, to give B's row something that names it, and so is its read with no kind beside its side, to give the census a
 * row it cannot read.
 *
 * MUTATIONS, each after a control run and each restored from the commit:
 *   1. take the reading of what names the fresh row out of the plan: case 3 goes red.
 *   2. keep the fresh row, insert the archive's beside it, and let the handle check pass the office's handle: the
 *      set-up fails and no case runs, because SQLite's unique index on agents.handle refuses the second live row.
 *   3. leave the fresh row's picture behind when its agent row is deleted: cases 1 and 5 go red.
 *   4. write no note: case 1 goes red.
 *   5. find the fresh row by the id `mole-office` instead of by its handle: every case but case 4 goes red.
 *   6. leave the rows the census cannot read out of the places that keep the fresh row: case 3's read goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')
type ImportPlan = ReturnType<ImportLib['planImport']>
type ImportReport = ReturnType<ImportLib['applyImport']>

/** What one import did: its report, or the problems it was refused for. */
type Outcome = { report: ImportReport; refused: null } | { report: null; refused: string[] }

/** applyImport, with a refusal kept as its problems, so a case reads what was refused instead of failing in its set-up. */
function attempt(lib: ImportLib, root: string): Outcome {
  try {
    return { report: lib.applyImport(root), refused: null }
  } catch (error) {
    if (!(error instanceof lib.ImportRefused)) throw error
    return { report: null, refused: error.plan.refusals.map((refusal) => refusal.problem) }
  }
}

interface OwnRow {
  id: string
  avatar: string
}

/** Every live agents row holding the office's handle, as the participants migration finds the office's own row. */
function theOwnRowsOf(t: TestDb, handle: string): OwnRow[] {
  return t.client.sqlite.prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE handle = ? AND retired = 0 ORDER BY id').all(handle) as OwnRow[]
}

function theOnlyOwnRowOf(t: TestDb, handle: string): OwnRow {
  const rows = theOwnRowsOf(t, handle)
  if (rows.length !== 1) throw new Error(`a fresh office holds ${rows.length} live rows with the handle ${handle}`)
  return rows[0]!
}

function thePicture(t: TestDb, id: string): unknown {
  return t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(id)
}

/** Every row of every table, as text, table by table. */
function everyRowOf(t: TestDb): Record<string, string> {
  const db = t.client.sqlite
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  return Object.fromEntries(tables.map(({ name }) => [name, JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all())]))
}

const deleted = (plan: ImportPlan): string[] =>
  plan.rows.filter((row) => row.action === 'delete').map((row) => `${row.region} ${row.key}`).sort()

const notesNaming = (plan: ImportPlan, ...ids: string[]): string[] => plan.notes.filter((note) => ids.every((id) => note.includes(id)))

let handle: string
let archive: string
let bare: string
let a: TestDb
let c: TestDb
let b: TestDb
let aOwn: OwnRow
let aPicture: unknown
let bOwn: OwnRow
let plan: ImportPlan
let first: Outcome
let second: Outcome
let afterFirst: Record<string, string>
let afterSecond: Record<string, string>
let ownAfterFirst: OwnRow[]
let pictureAfterFirst: unknown
let bPictureAfterFirst: unknown

beforeAll(async () => {
  archive = aTestDatabaseFolder('own-row-archive')
  bare = aTestDatabaseFolder('own-row-archive-without-it')

  // C: an office whose own row and picture are deleted before its archive is written.
  c = await freshDb()
  handle = (await import('../src/shared/participants.ts')).MOLE_OFFICE_HANDLE
  const cOwn = theOnlyOwnRowOf(c, handle)
  c.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(cOwn.id)
  c.client.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(cOwn.avatar)
  ;(await import('../src/server/lib/export.ts')).writeExport(bare)

  // A: the office the archive is taken from.
  a = await freshDb()
  aOwn = theOnlyOwnRowOf(a, handle)
  aPicture = thePicture(a, aOwn.avatar)
  ;(await import('../src/server/lib/export.ts')).writeExport(archive)

  // B: a fresh office, restored from A's archive twice.
  b = await freshDb()
  bOwn = theOnlyOwnRowOf(b, handle)
  const lib = (await import('../src/server/lib/import.ts')) as ImportLib
  plan = lib.planImport(archive)
  first = attempt(lib, archive)
  afterFirst = everyRowOf(b)
  ownAfterFirst = theOwnRowsOf(b, handle)
  pictureAfterFirst = thePicture(b, aOwn.avatar)
  bPictureAfterFirst = thePicture(b, bOwn.avatar)
  second = attempt(lib, archive)
  afterSecond = everyRowOf(b)
}, 120_000)

afterAll(() => {
  for (const folder of [archive, bare]) if (folder !== undefined) removeThisTestFolder(folder)
  // Any may be missing when the set-up failed before it, and that failure is the one to read.
  b?.close()
  a?.close()
  c?.close()
})

describe('a restore into an office nobody has used yet', () => {
  it("applies A's archive to B, and B then holds A's own row with A's id and picture, and not its own", () => {
    expect(first.refused ?? [], `refused: ${JSON.stringify(first.refused)}`).toEqual([])
    expect(first.report?.applied).toBe(true)
    expect(aOwn.id).not.toBe(bOwn.id)
    expect(ownAfterFirst).toEqual([aOwn])
    expect(pictureAfterFirst).toEqual(aPicture)
    expect(JSON.parse(afterFirst['agents'] ?? '[]').filter((row: { id: string }) => row.id === bOwn.id), "B's own row is still there").toEqual([])
    expect(bPictureAfterFirst, "B's own picture is still there").toBeUndefined()
    expect(notesNaming(plan, aOwn.id, bOwn.id), 'the plan has no single note naming both ids').toHaveLength(1)
    expect(first.report === null ? [] : notesNaming(first.report, aOwn.id, bOwn.id), 'the report has no single note naming both ids').toHaveLength(1)
  })

  it('changes nothing when the same archive is imported a second time, and is not refused', () => {
    expect(second.refused ?? [], `refused: ${JSON.stringify(second.refused)}`).toEqual([])
    expect(second.report?.applied).toBe(true)
    expect(second.report?.rows).toEqual([])
    expect(afterSecond).toEqual(afterFirst)
  })

  // Each plant returns the words that name its place in the refusal.
  it.each([
    {
      what: 'a session record filed by the fresh row names it',
      plant: (t: TestDb, own: OwnRow) => {
        const record = t.api.createRecord({ kind: 'session', title: "A made-up run the fresh office's own row filed", workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: own.id } })
        const revision = t.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id = ?').get(record.id) as { id: string }
        return ['revisions', revision.id]
      },
    },
    {
      what: 'a row whose foreign key holds the fresh row names it',
      plant: (t: TestDb, own: OwnRow) => {
        t.client.sqlite
          .prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('a-made-up-void-mark', own.id, 'a-made-up-file.txt', 'made up for this test', '2026-11-12 21:30:00', 'person', 'a-made-up-person')
        return ['resident_void_marks', 'a-made-up-void-mark']
      },
    },
    {
      // A read written before migration 0311 may hold an id with no kind beside it, and this one could be the fresh row's.
      what: 'the census cannot read a row that may name it',
      plant: (t: TestDb, own: OwnRow) => {
        t.client.sqlite
          .prepare('INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, as_side_kind, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run('a-made-up-read', 'default', 'person', 'a-made-up-person', `${own.id}~a-made-up-agent`, own.id, null, '2026-11-12 21:30:00')
        return ['conversation_reads.as_side', 'cannot read']
      },
    },
  ])('refuses, names the place and writes nothing, where $what', async ({ plant }) => {
    const named = await freshDb()
    try {
      const own = theOnlyOwnRowOf(named, handle)
      const place = plant(named, own)
      const lib = (await import('../src/server/lib/import.ts')) as ImportLib
      const before = everyRowOf(named)
      const outcome = attempt(lib, archive)
      expect(outcome.report).toBeNull()
      const naming = (outcome.refused ?? []).filter((problem) => problem.includes(own.id) && place.every((words) => problem.includes(words)))
      expect(naming, `no refusal names ${place.join(' ')}: ${JSON.stringify(outcome.refused)}`).toHaveLength(1)
      expect(everyRowOf(named)).toEqual(before)
    } finally {
      named.close()
    }
  }, 60_000)

  it("leaves B's own row as it is when the archive holds no office row", async () => {
    const plain = await freshDb()
    try {
      const own = theOnlyOwnRowOf(plain, handle)
      const picture = thePicture(plain, own.avatar)
      const lib = (await import('../src/server/lib/import.ts')) as ImportLib
      const outcome = attempt(lib, bare)
      expect(outcome.refused ?? [], `refused: ${JSON.stringify(outcome.refused)}`).toEqual([])
      expect(theOwnRowsOf(plain, handle)).toEqual([own])
      expect(thePicture(plain, own.avatar)).toEqual(picture)
      expect(outcome.report === null ? [] : deleted(outcome.report)).toEqual([])
      expect(outcome.report === null ? [] : notesNaming(outcome.report, own.id)).toEqual([])
    } finally {
      plain.close()
    }
  }, 60_000)

  it('counts the two deleted rows in the plan and in the report, and only those', () => {
    const theTwo = [`agents ${bOwn.id}`, `assets ${bOwn.avatar}`].sort()
    // Soft, so a run shows every count and not only the first that is wrong.
    expect.soft(deleted(plan), 'the plan').toEqual(theTwo)
    expect.soft(first.report === null ? [] : deleted(first.report), 'the report').toEqual(theTwo)
    for (const region of ['agents', 'assets']) {
      expect.soft(plan.notInArchive[region], `the plan counts a ${region} row as left in the database`).toBe(0)
    }
  })
})
