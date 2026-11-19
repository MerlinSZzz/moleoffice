// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VIEW FILTER LOOKS UP A COMMENT'S RECORD BY ITS ID, INSTEAD OF BUILDING EVERY ID OF THE PROJECT.
 *
 * `aCommentOnARecordOf` (src/server/lib/message-centre.ts) used to ask, twice, whether a message's target record id
 * is in a list of every id in a workspace. SQLite built that list, and its bloom filter, on every row. It now looks
 * the one record up by its id, and keeps the answer the list gave when the target names no record: NULL, not false.
 *
 * Every id and every word here is made up. The messages are written straight into the records table so each case is
 * exactly the case named, and the reads go through drizzle and the product's own filter and project reading.
 *
 * Cases 2, 3 and 4 are guards: they pass on the code before this change and must still pass after it. Case 1 is the
 * change itself, and it is the only one that is red before it.
 */
import { asc, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** Made-up ids. `elsewhere` is a project these messages may name, and no record of it is filed in our project. */
const HERE = 'made-up-project'
const ELSEWHERE = 'made-up-elsewhere'
const OTHER = 'made-up-other-project'

type Insert = {
  id: string
  workspaceId?: string
  kind?: string
  title: string
  data: Record<string, unknown>
  createdAt: string
}

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', ?, ?, ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  const rows: Insert[] = [
    // Three made-up records: one filed in our project, one in the message centre, one in another project.
    { id: 'made-up-in-project', workspaceId: HERE, kind: 'note', title: 'A made-up note in the project', data: {}, createdAt: '2026-10-01 08:59:01' },
    { id: 'made-up-in-centre', workspaceId: MESSAGE_CENTRE, kind: 'note', title: 'A made-up note in the message centre', data: {}, createdAt: '2026-10-01 08:59:02' },
    { id: 'made-up-in-elsewhere', workspaceId: ELSEWHERE, kind: 'note', title: 'A made-up note in another project', data: {}, createdAt: '2026-10-01 08:59:03' },
    // A message for each case in the table, and messages in the view for the other reasons.
    { id: 'made-up-names-elsewhere-written-in-project', title: 'A made-up message naming another project', createdAt: '2026-10-01 09:00:01', data: { body: 'Made-up words.', writtenIn: { project: HERE }, target: { target: { workspaceId: ELSEWHERE } } } },
    { id: 'made-up-names-elsewhere-written-elsewhere', title: 'A made-up message naming another project', createdAt: '2026-10-01 09:00:02', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { workspaceId: ELSEWHERE } } } },
    { id: 'made-up-names-nothing-written-elsewhere', title: 'A made-up message with an empty target', createdAt: '2026-10-01 09:00:03', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: {} } } },
    { id: 'made-up-no-target-written-elsewhere', title: 'A made-up message with no target', createdAt: '2026-10-01 09:00:04', data: { body: 'Made-up words.', writtenIn: { project: OTHER } } },
    { id: 'made-up-names-a-record-in-project', title: 'A made-up message naming a record of the project', createdAt: '2026-10-01 09:00:05', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { kind: 'record', recordId: 'made-up-in-project', workspaceId: HERE } } } },
    { id: 'made-up-names-a-workspace-and-a-missing-id', title: 'A made-up message naming no record', createdAt: '2026-10-01 09:00:06', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { kind: 'record', recordId: 'made-up-nobody-filed', workspaceId: ELSEWHERE } } } },
    { id: 'made-up-names-a-record-in-centre', title: 'A made-up comment on a message', createdAt: '2026-10-01 09:00:07', data: { body: 'Made-up words.', writtenIn: { project: HERE }, target: { target: { kind: 'record', recordId: 'made-up-in-centre', workspaceId: MESSAGE_CENTRE } } } },
    { id: 'made-up-written-in-project', title: 'A made-up message written in the project', createdAt: '2026-10-01 09:00:08', data: { body: 'Made-up words.', writtenIn: { project: HERE } } },
    { id: 'made-up-about-project', title: 'A made-up message about the project', createdAt: '2026-10-01 09:00:09', data: { body: 'Made-up words.', aboutProject: HERE, writtenIn: { project: OTHER } } },
    { id: 'made-up-names-the-project', title: 'A made-up message naming the project', createdAt: '2026-10-01 09:00:10', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { workspaceId: HERE } } } },
    { id: 'made-up-names-a-record-in-elsewhere', title: 'A made-up message naming a record of another project', createdAt: '2026-10-01 09:00:11', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { kind: 'record', recordId: 'made-up-in-elsewhere', workspaceId: ELSEWHERE } } } },
    // Targets that name only a record id, with no workspace: the record lookup alone decides these.
    { id: 'made-up-only-record-in-project', title: 'A made-up message naming only a record of the project', createdAt: '2026-10-01 09:00:12', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { kind: 'record', recordId: 'made-up-in-project' } } } },
    { id: 'made-up-only-record-in-centre', title: 'A made-up comment naming only a message', createdAt: '2026-10-01 09:00:13', data: { body: 'Made-up words.', writtenIn: { project: HERE }, target: { target: { kind: 'record', recordId: 'made-up-in-centre' } } } },
    { id: 'made-up-only-record-in-elsewhere', title: 'A made-up message naming only a record of another project', createdAt: '2026-10-01 09:00:14', data: { body: 'Made-up words.', writtenIn: { project: OTHER }, target: { target: { kind: 'record', recordId: 'made-up-in-elsewhere' } } } },
  ]
  t.client.sqlite.transaction(() => {
    for (const row of rows) {
      add.run(row.id, row.workspaceId ?? MESSAGE_CENTRE, row.createdAt, row.createdAt, row.kind ?? 'message', row.title, JSON.stringify(row.data))
    }
  })()
}, 60_000)

afterAll(() => {
  t.close()
})

/** The one value `aCommentOnARecordOf(HERE)` gives a stored row, as SQLite answers it. */
async function theAnswerFor(id: string): Promise<unknown> {
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  const { aCommentOnARecordOf } = await import('../src/server/lib/message-centre.ts')
  const row = db.select({ answer: aCommentOnARecordOf(HERE) }).from(records).where(sql`${records.id} = ${id}`).get()
  return row?.answer
}

/** The ids `WHERE NOT (aCommentOnARecordOf(HERE))` keeps, in a fixed order so the answer is repeatable. */
async function theRowsNotAComment(): Promise<string[]> {
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  const { aCommentOnARecordOf } = await import('../src/server/lib/message-centre.ts')
  return db
    .select({ id: records.id })
    .from(records)
    .where(sql`NOT (${aCommentOnARecordOf(HERE)})`)
    .orderBy(asc(records.id))
    .all()
    .map((row) => row.id)
}

describe('the view filter', () => {
  it('1. looks the record up by its id instead of building every id in the workspace', async () => {
    const { db } = await import('../src/server/db/client.ts')
    const { records } = await import('../src/server/db/schema.ts')
    const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
    const { justThisProject } = await import('../src/shared/which-projects.ts')
    const query = db.select({ id: records.id }).from(records).where(messagesInTheViewOf(justThisProject(HERE))).toSQL()
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.params) as { detail: string }[]).map((step) => step.detail)
    expect(plan.filter((step) => step.includes('LIST SUBQUERY'))).toEqual([])
    expect(plan.filter((step) => step === 'SEARCH the_targets_record USING INDEX sqlite_autoindex_records_1 (id=?)')).toHaveLength(2)
  })

  it('2. keeps NULL where the target names a workspace and no record, so NOT drops the row as it did', async () => {
    // Both rows of the table that tell NULL from false: a target naming elsewhere and no record id, written here and
    // written in another project.
    expect(await theAnswerFor('made-up-names-elsewhere-written-in-project')).toBeNull()
    expect(await theAnswerFor('made-up-names-elsewhere-written-elsewhere')).toBeNull()
    const kept = await theRowsNotAComment()
    expect(kept).not.toContain('made-up-names-elsewhere-written-in-project')
    expect(kept).not.toContain('made-up-names-elsewhere-written-elsewhere')
    // The query still keeps a row the filter answers false for, so the two absences above are not an empty query.
    expect(kept).toContain('made-up-names-a-workspace-and-a-missing-id')
  })

  it('3. gives the other answers the IN list gave', async () => {
    expect(await theAnswerFor('made-up-names-a-record-in-project'), 'a record filed in the project').toBe(1)
    expect(await theAnswerFor('made-up-names-a-record-in-centre'), 'a comment on a message, written here').toBe(1)
    expect(await theAnswerFor('made-up-names-a-workspace-and-a-missing-id'), 'a workspace and no record of it').toBe(0)
    expect(await theAnswerFor('made-up-names-nothing-written-elsewhere'), 'neither a workspace nor a record').toBeNull()
    // A target that names only a record id: no workspace term can give the answer, so the lookup itself must.
    expect(await theAnswerFor('made-up-only-record-in-project'), 'only a record filed in the project').toBe(1)
    expect(await theAnswerFor('made-up-only-record-in-centre'), 'only a record filed in the message centre, written here').toBe(1)
    // No workspace is named, so the workspace term is NULL and the OR stays NULL, even though the record exists in
    // another project: the IN list answered NULL here too, not false.
    expect(await theAnswerFor('made-up-only-record-in-elsewhere'), 'only a record filed in another project').toBeNull()
  })

  it('4. keeps the same rows in the same order', async () => {
    const { db } = await import('../src/server/db/client.ts')
    const { records } = await import('../src/server/db/schema.ts')
    const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
    const { justThisProject } = await import('../src/shared/which-projects.ts')
    const ids = db
      .select({ id: records.id })
      .from(records)
      .where(messagesInTheViewOf(justThisProject(HERE)))
      .orderBy(asc(records.createdAt), sql`records.rowid`)
      .all()
      .map((row) => row.id)
    expect(ids).toEqual([
      'made-up-names-elsewhere-written-in-project',
      'made-up-names-a-record-in-project',
      'made-up-names-a-record-in-centre',
      'made-up-written-in-project',
      'made-up-about-project',
      'made-up-names-the-project',
      'made-up-only-record-in-project',
      'made-up-only-record-in-centre',
    ])
  })
})
