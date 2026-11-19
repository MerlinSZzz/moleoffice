// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ROWS OF `records` ARE CHAPTERS, in SQL, read from the one definition `A_CHAPTER` in
 * src/shared/office-rules.ts, which `chapterNumberOf` reads too. The start's copy of the default
 * regulations asks it. tests/one-definition-of-a-chapter.test.ts holds this and `chapterNumberOf` to the
 * same answer on every shape of data.
 *
 * A role card's neighbourhood (rule 6 of `recordsAround` in lib/records.ts) asks `isAChapterRow` too, and
 * `chapterRecord` in src/web/components/RoleCard.tsx asks `chapterNumberOf`, so the card and the page
 * name the same chapters; a record of another kind that only carries a number at `extra.chapter` is not
 * one.
 */
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { A_CHAPTER } from '@shared/office-rules.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'

/** True for a row that is a chapter: its kind, and a number at the chapter's place in its data. */
export function isAChapterRow(): SQL {
  const types = sql.join(A_CHAPTER.sqliteNumberTypes.map((type) => sql`${type}`), sql`, `)
  return and(eq(records.kind, A_CHAPTER.kind), sql`json_type(${records.data}, ${A_CHAPTER.jsonPath}) in (${types})`)!
}

/**
 * THE PROJECT A NEW CHAPTER RECORD GOES IN: the project of the office's live chapter changed last, or `default` when the
 * office holds no live chapter. The chapter restore press and the start's copy of the default regulations both ask here.
 */
export function theProjectOfTheChapters(): string {
  const newest = db
    .select({ workspaceId: records.workspaceId })
    .from(records)
    .where(and(isNull(records.deletedAt), isAChapterRow()))
    .orderBy(desc(records.updatedAt), asc(records.id))
    .limit(1)
    .get()
  return newest?.workspaceId ?? DEFAULT_WORKSPACE
}
