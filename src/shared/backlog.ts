// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BACKLOG ITEM: THE KIND WORD, ITS STATES AND THE ORDER OF A LINE. KIND_SPECS.backlog_item in ./kinds.ts holds its
 * fields; src/server/lib/backlog.ts reads one line's items, in the order this file gives.
 *
 * Item 38 of wave 13s's requirements: each item of a line's backlog is a
 * record, so that a round reads only its own line's items and not the whole backlog.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

/** The kind word, in one place. */
export const BACKLOG_ITEM_KIND = 'backlog_item'

/**
 * WHERE AN ITEM STANDS. `todo` before anybody started it, `doing` while a round works on it, `done` when what counts as
 * done is true, and `dropped` when it was taken out of the backlog without being done. A pause is the `paused` field,
 * as on a task, and not a state.
 */
export const BACKLOG_ITEM_STATES = ['todo', 'doing', 'done', 'dropped'] as const
export type BacklogItemState = (typeof BACKLOG_ITEM_STATES)[number]

/** What the line's order reads of one item: its stored `order`, when it was filed, and its id. */
export interface AnItemInTheLine {
  id: string
  createdAt: string
  data: unknown
}

/** The item's `order`, or null when it has none that is a number. */
function orderOf(item: AnItemInTheLine): number | null {
  const order = typeof item.data === 'object' && item.data !== null ? (item.data as Record<string, unknown>)['order'] : undefined
  return typeof order === 'number' && Number.isFinite(order) ? order : null
}

/**
 * THE ORDER OF A LINE: by `order`, smallest first; the items with no order after every item with one; and the items
 * with the same order, or with none, in the order they were filed, then by id.
 */
export function inTheLinesOrder(one: AnItemInTheLine, other: AnItemInTheLine): number {
  const a = orderOf(one)
  const b = orderOf(other)
  if (a !== b) {
    if (a === null) return 1
    if (b === null) return -1
    return a - b
  }
  if (one.createdAt !== other.createdAt) return one.createdAt < other.createdAt ? -1 : 1
  return one.id < other.id ? -1 : one.id > other.id ? 1 : 0
}
