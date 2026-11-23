// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY ITEM, AS THE SERVER AND THE PAGE BOTH READ IT. Wave 13s round 281, point HD-2c of home as a data dashboard.
 *
 * A key item is a record of the kind `key_item`: one of the few things a project keeps in front of the person, with its
 * progress and an estimate of the time left. It belongs to one project. Only its own doors at /api/key-items write one,
 * for the person or for a secretary writing as itself (src/server/lib/key-items.ts), and the office writes who set its
 * progress and its estimate, and when, from the writer and its own clock.
 *
 * ITS PROGRESS IS COUNTED OR SET, AND THE READ SAYS WHICH. A key item that names packages counts their points: the
 * points done of all their points. One that names none may carry a figure somebody set, with who set it and when.
 *
 * ITS TIME LEFT IS AN ESTIMATE, in whole hours, and every read of it says so, with who estimated it and when. A page
 * shows it as days of 24 hours and hours, worked out by `daysAndHours` here and nowhere else.
 */
import type { ParticipantRef } from './participants.ts'
import type { PanelRecord } from './types.ts'

export const KEY_ITEM_KIND = 'key_item'

/** A key item's states. Only an open one has a place in the order. */
export const KEY_ITEM_STATES = ['open', 'closed'] as const
export type KeyItemState = (typeof KEY_ITEM_STATES)[number]

/** The longest title of a key item, in characters. A title is one line. */
export const A_KEY_ITEM_TITLE_AT_MOST = 200

/** The most packages one key item names. Its read reads each of them by id. */
export const PACKAGES_OF_A_KEY_ITEM_AT_MOST = 50

/** The highest progress figure, a whole percent. */
export const PROGRESS_AT_MOST = 100

/** The longest estimate, in hours: ten years of 24-hour days. A longer one is a slip of the keyboard. */
export const HOURS_LEFT_AT_MOST = 87_600

/** The hours in one day of an estimate. An estimate counts the clock's hours, not working hours. */
export const HOURS_IN_A_DAY = 24

/** Who may write a key item, in the sentence every refusal of a writer ends with. */
export const WHO_MAY_WRITE_A_KEY_ITEM = 'Only the person, or a secretary writing as itself with its own key, writes a key item.'

export const A_KEY_ITEM_IS_WRITTEN_BY_ITS_DOORS =
  'A key item is written only by its own doors, for the person or for a secretary writing as itself, because the ' +
  'office writes who set its progress and its estimate, and when. Nothing was written.'

export const THE_KEY_ITEM_DOORS =
  'List the key items with GET /api/key-items (add ?projects=every for every project, ?state=closed for the closed ' +
  'ones), add one with POST /api/key-items, read one with GET /api/key-items/<id>, change its title, packages, ' +
  'progress or estimate with PATCH /api/key-items/<id>, move it with POST /api/key-items/<id>/place, close it with ' +
  'POST /api/key-items/<id>/close and open it again with POST /api/key-items/<id>/reopen.'

/** A key item's fields as stored. The office writes the `...By` and `...At` fields; nobody types them. */
export interface KeyItemData {
  state: KeyItemState
  place?: number
  packages?: string[]
  progress?: number
  progressSetBy?: ParticipantRef
  progressSetAt?: string
  hoursLeft?: number
  estimatedBy?: ParticipantRef
  estimatedAt?: string
}

/** An estimate in hours as whole days of 24 hours and the hours over. */
export function daysAndHours(hoursLeft: number): { days: number; hours: number } {
  return { days: Math.floor(hoursLeft / HOURS_IN_A_DAY), hours: hoursLeft % HOURS_IN_A_DAY }
}

/** The whole percent `done` is of `of`, or null when there is nothing to count. */
export function percentOf(done: number, of: number): number | null {
  return of === 0 ? null : Math.round((done * 100) / of)
}

/** Who set a figure or made an estimate: the participant the office wrote, and its handle where it is an agent. */
export interface KeyItemWho extends ParticipantRef {
  handle: string | null
}

/**
 * WHY A PACKAGE A KEY ITEM NAMES WAS NOT COUNTED: no record has its id, it was deleted, it holds no package with points,
 * or it is in another project. The doors refuse each of these when the key item is written; a package can become one
 * after it.
 */
export const A_PACKAGE_NOT_COUNTED_BECAUSE = ['no-record', 'deleted', 'no-package', 'another-project'] as const
export type APackageNotCounted = (typeof A_PACKAGE_NOT_COUNTED_BECAUSE)[number]

/** One package a key item names, as its progress counts it, or why it was not counted. */
export type KeyItemPackage =
  | { id: string; title: string; done: number; of: number }
  | { id: string; notCounted: APackageNotCounted }

/**
 * A KEY ITEM'S PROGRESS, AND WHERE IT CAME FROM. Counted from the points of its packages, those that could be counted;
 * set by somebody, with who and when; or not set, which is nobody having set it and not a zero.
 */
export type KeyItemProgress =
  | { from: 'packages'; done: number; of: number; percent: number | null; packages: KeyItemPackage[] }
  | { from: 'set'; percent: number; setBy: KeyItemWho; setAt: string }
  | { from: 'not-set' }

/** A key item's estimate of the time left, marked as an estimate, with who made it and when; or that nobody has. */
export type KeyItemEstimate =
  | { state: 'estimated'; hoursLeft: number; days: number; hours: number; estimatedBy: KeyItemWho; estimatedAt: string }
  | { state: 'not-estimated' }

/** One key item as the doors and home read it. */
export interface KeyItemRead {
  id: string
  title: string
  /** Its project, and the project's title; null where no project has that id, which is said and not guessed. */
  project: { id: string; title: string | null }
  state: KeyItemState
  /** Its place in the order of its project's open key items, 1 first; null for a closed one. */
  place: number | null
  packages: string[]
  progress: KeyItemProgress
  estimate: KeyItemEstimate
}

/**
 * What GET /api/key-items answers: the key items of this project or of every project, open ones by default. Open ones
 * come in their order and closed ones last closed first; with every project, project by project, by the project's id.
 */
export interface TheKeyItems {
  projects: 'this' | 'every'
  state: KeyItemState
  items: KeyItemRead[]
}

/** One estimate a key item has carried, as its history keeps it. */
export interface AnEarlierEstimate {
  seq: number
  hoursLeft: number
  estimatedBy: KeyItemWho
  estimatedAt: string
}

/**
 * What GET /api/key-items/:id answers: the key item, and each estimate it has carried, newest first, read from its
 * history. `revisionsNotRead` counts the oldest revisions the read left out, so an estimate older than those is not in
 * the list; 0 when every revision was read.
 */
export interface OneKeyItem {
  item: KeyItemRead
  estimates: AnEarlierEstimate[]
  revisionsNotRead: number
}

/** What a write through a key item door answers: the key item as read after it, what the write did, and the record. */
export interface AKeyItemWritten extends OneKeyItem {
  written: 'created' | 'changed' | 'moved' | 'closed' | 'opened again' | 'nothing changed'
  record: PanelRecord
  /** Why nothing was written, when nothing was. */
  nothingWritten?: string
}
