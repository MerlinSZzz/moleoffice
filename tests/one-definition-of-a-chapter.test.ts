// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DEFINITION OF A CHAPTER, READ THE SAME IN JAVASCRIPT AND IN SQL.
 *
 * Wave 13s round 7b, on the inspector's note to check 43Sdjxdkm5IW (invariant 9). Whether a record is a
 * chapter is decided in two languages: `chapterNumberOf` in src/shared/office-rules.ts, which the page,
 * the exporter and the record door ask, and `isAChapterRow` in src/server/lib/chapter-rows.ts, which the
 * start's copy of the default regulations asks in SQL. Both read
 * `A_CHAPTER`. This file stores one row at a time in every shape that could divide them and requires the
 * two to give the same answer for each. A change to either reader alone fails here.
 *
 * WHAT IS REAL HERE. The migrated schema and SQLite's own `json_type`. The rows are synthetic and are
 * written straight into a temporary database, because some of the shapes are ones the record door would
 * never let through, and the readers must still agree on them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let rowId = ''
let readers: {
  chapterNumberOf: (kind: string, data: unknown) => number | null
  inSql: (id: string) => boolean
}

/** Every shape of `kind` and `data` that could make the two readers part ways. */
const SHAPES: { name: string; kind: string; data: unknown }[] = [
  { name: 'a module with a whole chapter number', kind: 'module', data: { extra: { chapter: 3 } } },
  { name: 'a module with a fractional chapter number', kind: 'module', data: { extra: { chapter: 2.5 } } },
  { name: 'a module with chapter 0', kind: 'module', data: { extra: { chapter: 0 } } },
  { name: 'a module with a negative chapter number', kind: 'module', data: { extra: { chapter: -1 } } },
  { name: 'a module whose chapter is a number written as text', kind: 'module', data: { extra: { chapter: '2' } } },
  { name: 'a module whose chapter is null', kind: 'module', data: { extra: { chapter: null } } },
  { name: 'a module whose chapter is true', kind: 'module', data: { extra: { chapter: true } } },
  { name: 'a module whose chapter is a list', kind: 'module', data: { extra: { chapter: [1] } } },
  { name: 'a module whose chapter is an object', kind: 'module', data: { extra: { chapter: { n: 1 } } } },
  { name: 'a module with no chapter in extra', kind: 'module', data: { extra: { code: 'x' } } },
  { name: 'a module with no extra', kind: 'module', data: { context: 'a subsystem' } },
  { name: 'a module whose extra is a list', kind: 'module', data: { extra: [{ chapter: 1 }] } },
  { name: 'a module whose extra is text', kind: 'module', data: { extra: 'chapter 1' } },
  { name: 'a module whose chapter sits one level deeper', kind: 'module', data: { extra: { more: { chapter: 1 } } } },
  { name: 'a module whose chapter sits at the top of its data', kind: 'module', data: { chapter: 1 } },
  { name: 'a module whose data is a list', kind: 'module', data: [{ extra: { chapter: 1 } }] },
  { name: 'a task carrying a chapter number', kind: 'task', data: { extra: { chapter: 1 } } },
  { name: 'a regulation carrying a chapter number', kind: 'regulation', data: { extra: { chapter: 4 } } },
]

beforeAll(async () => {
  t = await freshDb()
  const office = await import('../src/shared/office-rules.ts')
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  const { isAChapterRow } = await import('../src/server/lib/chapter-rows.ts')
  const { and, eq, sql } = await import('drizzle-orm')
  rowId = t.api.createRecord({
    kind: 'module',
    title: 'A synthetic row whose kind and data this file rewrites',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'chapter-definition-test' },
    data: { context: 'synthetic', parts: [] },
  }).id
  readers = {
    chapterNumberOf: office.chapterNumberOf,
    inSql: (id) =>
      (db.select({ n: sql<number>`count(*)` }).from(records).where(and(eq(records.id, id), isAChapterRow())).get()?.n ?? 0) === 1,
  }
})

afterAll(() => t?.close())

describe('one definition of a chapter (invariant 9)', () => {
  it('gives the same answer in JavaScript and in SQL for every shape of data', () => {
    const differ: string[] = []
    let chapters = 0
    for (const shape of SHAPES) {
      t.client.sqlite.prepare('UPDATE records SET kind = ?, data = ? WHERE id = ?').run(shape.kind, JSON.stringify(shape.data), rowId)
      const inJavaScript = readers.chapterNumberOf(shape.kind, shape.data) !== null
      const inSql = readers.inSql(rowId)
      if (inJavaScript) chapters++
      if (inJavaScript !== inSql) differ.push(`${shape.name}: JavaScript says ${String(inJavaScript)}, SQL says ${String(inSql)}`)
    }
    expect(differ).toEqual([])
    // Both answers occur, so the comparison is not passing on shapes that are all one or all the other.
    expect(chapters).toBeGreaterThan(0)
    expect(chapters).toBeLessThan(SHAPES.length)
  })
})
