// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ORDER OF THE EVERYTHING PAGE, worked out in one place for the server and the page.
 *
 * The Everything page draws one page of rows at a time. A page sorted in the
 * browser would sort only the rows it holds, so the order is worked out by `GET /api/records` over
 * every row, and the page asks for the order a column head names. The columns, which way each one
 * opens and what each one sorts on live here, so the head a person presses and the order the door
 * answers cannot come apart.
 */

import type { PanelRecord } from './types.ts'
import { progressOf } from './work.ts'

/** The eight columns of the Everything page, in the order they are drawn. */
export const CATALOGUE_COLUMNS = ['kind', 'state', 'title', 'updated', 'created', 'incomplete', 'origin', 'id'] as const
export type CatalogueColumn = (typeof CATALOGUE_COLUMNS)[number]

export const SORT_DIRECTIONS = ['asc', 'desc'] as const
export type SortDirection = (typeof SORT_DIRECTIONS)[number]

/** A row of the list: a record and how many of its fields are still empty. */
type CatalogueRow = Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data' | 'updatedAt' | 'createdAt' | 'origin'> & {
  incompleteCount: number
}

/**
 * The shared state word a row sorts on, or an empty string when it has no readable state.
 * This is the literal stored reading the row draws; derived work progress is a separate reading.
 */
function stateWord(record: Pick<PanelRecord, 'data'>): string {
  const raw = record.data?.['state']
  return progressOf(raw) === null ? '' : String(raw).trim()
}

/**
 * What each column sorts on, and which way it opens.
 *
 * DATES OPEN NEWEST FIRST AND WORDS OPEN A TO Z. A column whose first press gave the least useful
 * order is a column people press twice every time.
 */
export const COLUMN_SORT: Readonly<
  Record<CatalogueColumn, { key: (r: CatalogueRow) => string | number; opens: SortDirection; numeric: boolean }>
> = {
  kind: { key: (r) => r.kind, opens: 'asc', numeric: false },
  state: { key: (r) => stateWord(r), opens: 'asc', numeric: false },
  title: { key: (r) => r.title.toLowerCase(), opens: 'asc', numeric: false },
  updated: { key: (r) => r.updatedAt, opens: 'desc', numeric: false },
  created: { key: (r) => r.createdAt, opens: 'desc', numeric: false },
  incomplete: { key: (r) => r.incompleteCount, opens: 'desc', numeric: true },
  origin: { key: (r) => String(r.origin ?? ''), opens: 'asc', numeric: false },
  id: { key: (r) => r.id, opens: 'asc', numeric: false },
}

/**
 * Put the rows in order.
 *
 * THE ID IS ALWAYS THE FINAL TIE-BREAK. Without it, rows with the same key come back in whatever
 * order they arrived in, and the same row could turn up on two pages or on none.
 */
export function sortCatalogue<R extends CatalogueRow>(
  records: readonly R[],
  column: CatalogueColumn,
  direction: SortDirection,
): R[] {
  const { key, numeric } = COLUMN_SORT[column]
  const sign = direction === 'asc' ? 1 : -1
  // One collator for the whole sort: it orders exactly as `localeCompare` with no arguments does, and
  // is not built again for each of the many comparisons a list of thousands of rows takes.
  const words = new Intl.Collator()
  const keyed = records.map((record) => ({ record, k: key(record) }))
  keyed.sort((a, b) => {
    if (a.k !== b.k) {
      const by = numeric ? (a.k as number) - (b.k as number) : words.compare(String(a.k), String(b.k))
      if (by !== 0) return sign * by
    }
    return a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0
  })
  return keyed.map((one) => one.record)
}
