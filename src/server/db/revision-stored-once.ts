// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REVISION STORES ONCE PER RUN, AND HOW A REVISION'S WHOLE DATA IS PUT BACK TOGETHER. Migration 0351.
 *
 * A revision stores the whole record at every write. A session record carries the chapters its round was given at
 * `data.extra.roundChapters`, hundreds of kilobytes that change about once per run, so most of what the revisions
 * table grew by was the same chapters stored again. Now the first revision of a record that holds a value there stores
 * it whole, as before. A later revision with the same value stores, at that place, `partHashOf` of the value's JSON,
 * and `revisions.parts` names the place with the number of the revision that holds the value whole:
 * `{"extra.roundChapters": 1}`. NULL there means the data is stored whole, as every revision written before migration
 * 0351 is, and such a revision is read exactly as before.
 *
 * WHAT A READER IS GIVEN DOES NOT CHANGE. `wholeRevisionData` puts each value back at its own place, so the key order
 * is the record's, and `contentHash` is still `versionOf` of the whole content: `saveRevision` hashes the record it
 * read, not what it stores.
 *
 * A READ OF `revisions.data` THAT DOES NOT COME THROUGH `wholeRevisionData` SEES THE HASH where such a revision's
 * chapters were. That is right for a read that names other paths, or never reads a session. A read that needs the
 * record as it was goes through this file.
 *
 * A REVISION ANOTHER ONE NAMES MUST BE KEPT. Nothing deletes a revision today. Whatever does one day must keep every
 * revision a later one names in its `parts`, or put the value back into the later one first.
 *
 * NOTHING HERE OPENS THE DATABASE. A reader is handed what it reads, so the import and a migration can use this file
 * with their own rows or their own handle.
 */

import { partHashOf } from './version.ts'

/**
 * THE PLACES IN A KIND'S DATA A REVISION STORES ONCE, as dotted paths. One place today.
 *
 * Any JSON value at a declared place is stored once; an absent place is left absent.
 */
const STORED_ONCE: Readonly<Record<string, readonly string[]>> = {
  session: ['extra.roundChapters'],
}

/** Whether a revision of `kind` can store a value once, so `saveRevision` reads the revision before it only then. */
export function storesOnce(kind: string): boolean {
  return (STORED_ONCE[kind]?.length ?? 0) > 0
}

/** What a revision row holds, as this file reads it. `parts` as stored: a drizzle read hands it parsed, a plain SQL read as text. */
export interface StoredRevisionData {
  data: Record<string, unknown> | null
  parts?: unknown
}

/** One revision row of a record, with the two numbers that name it. */
export interface StoredRevision extends StoredRevisionData {
  id?: string
  recordId: string
  seq: number
}

/** How the revision that holds a value whole is read: by its record and number, or undefined when there is none. */
export type ReadARevision = (recordId: string, seq: number) => StoredRevisionData | undefined

/** What `saveRevision` writes in `data` and `parts`. */
export interface RevisionDataToStore {
  data: Record<string, unknown>
  /** Null when this revision holds every value whole, which is what NULL in `revisions.parts` says. */
  parts: Record<string, number> | null
}

const A_PART_HASH = /^[0-9a-f]{64}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The value at a dotted path, or undefined when the path does not reach one. */
function valueAt(data: Record<string, unknown> | null, path: readonly string[]): unknown {
  let here: unknown = data
  for (const key of path) {
    if (!isPlainObject(here) || !Object.hasOwn(here, key)) return undefined
    here = here[key]
  }
  return here
}

/**
 * The data with the value at `path` replaced. Every object on the way is copied with its keys in their order, so the
 * key that is replaced stays where it was.
 */
function withValueAt(data: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  const [key, ...rest] = path
  if (key === undefined) throw new Error('A revision was given an empty path to store once.')
  const inner = data[key]
  return { ...data, [key]: rest.length === 0 ? value : withValueAt(inner as Record<string, unknown>, rest, value) }
}

/** `revisions.parts` read: each path with the number of the revision that holds its value whole, or null. */
function namedIn(parts: unknown, where: string): Record<string, number> | null {
  if (parts === null || parts === undefined) return null
  const named: unknown = typeof parts === 'string' ? JSON.parse(parts) : parts
  if (!isPlainObject(named) || !Object.values(named).every((seq) => Number.isSafeInteger(seq) && (seq as number) > 0)) {
    throw new Error(
      `${where}: revisions.parts holds ${JSON.stringify(parts)}, and it holds either nothing or each path with the number of the revision that holds it whole.`,
    )
  }
  return named as Record<string, number>
}

/**
 * The data and `parts` a revision of `kind` stores for a record holding `data`.
 *
 * `previous` is the record's newest revision before this one, filed in the same project. A value is stored once when
 * that revision holds the same value, whole or by name; otherwise this revision holds it whole. Only the newest
 * revision is asked, so a value that comes back after another one is stored whole again.
 */
export function revisionDataToStore(kind: string, data: Record<string, unknown>, previous: (StoredRevisionData & { seq: number }) | undefined): RevisionDataToStore {
  let stored = data
  const parts: Record<string, number> = {}
  if (previous === undefined) return { data, parts: null }
  const previousNames = namedIn(previous.parts, `The revision ${String(previous.seq)} before this one`)
  for (const dotted of STORED_ONCE[kind] ?? []) {
    const path = dotted.split('.')
    const value = valueAt(data, path)
    const json = JSON.stringify(value)
    if (json === undefined) continue
    const hash = partHashOf(json)
    const before = valueAt(previous.data, path)
    const named = previousNames?.[dotted]
    const holder = named !== undefined ? (before === hash ? named : undefined) : JSON.stringify(before) === json ? previous.seq : undefined
    if (holder === undefined) continue
    stored = withValueAt(stored, path, hash)
    parts[dotted] = holder
  }
  return { data: stored, parts: Object.keys(parts).length === 0 ? null : parts }
}

/**
 * A revision's data whole: each value it names put back at its place, from the revision that holds it whole.
 *
 * A revision that names nothing is handed back as it is. Anything else that does not fit throws, naming the revision: a
 * named place that holds no hash, a holder that is not there or does not hold the value whole, or a value whose hash is
 * not the one this revision holds. A revision with a value missing is not handed out as if it were whole.
 */
export function wholeRevisionData(row: StoredRevision, readRevision: ReadARevision): Record<string, unknown> {
  const where = `Revision ${String(row.seq)} of record ${row.recordId}`
  const data = row.data ?? {}
  const named = namedIn(row.parts, where)
  if (named === null) return data
  let whole = data
  for (const [dotted, seq] of Object.entries(named)) {
    const path = dotted.split('.')
    if (seq >= row.seq) {
      throw new Error(`${where} names revision ${String(seq)} as holding ${dotted} whole, but the holder must be earlier.`)
    }
    const hash = valueAt(data, path)
    if (typeof hash !== 'string' || !A_PART_HASH.test(hash)) {
      throw new Error(`${where} names ${dotted} as held whole in revision ${String(seq)}, and its own data holds ${JSON.stringify(hash)} there, not the value's hash.`)
    }
    const holder = readRevision(row.recordId, seq)
    if (holder === undefined) {
      throw new Error(`${where} names revision ${String(seq)} as holding ${dotted} whole, and the record has no revision ${String(seq)}.`)
    }
    if (namedIn(holder.parts, `Revision ${String(seq)} of record ${row.recordId}`)?.[dotted] !== undefined) {
      throw new Error(`${where} names revision ${String(seq)} as holding ${dotted} whole, and that revision names another for it.`)
    }
    const json = JSON.stringify(valueAt(holder.data, path))
    if (json === undefined || partHashOf(json) !== hash) {
      throw new Error(`${where} names revision ${String(seq)} as holding ${dotted} whole, and the value there is not the one whose hash it holds.`)
    }
    whole = withValueAt(whole, path, JSON.parse(json) as unknown)
  }
  return whole
}

/**
 * Whether two revisions can be compared as stored: both hold every value whole, or both name the same revisions for
 * the same places and hold the same hashes there. Then their stored data differ exactly where their whole data differ.
 */
export function comparableAsStored(a: StoredRevision, b: StoredRevision): boolean {
  const namedA = namedIn(a.parts, `Revision ${String(a.seq)} of record ${a.recordId}`)
  const namedB = namedIn(b.parts, `Revision ${String(b.seq)} of record ${b.recordId}`)
  if (namedA === null || namedB === null) return namedA === namedB
  const paths = Object.keys(namedA)
  if (paths.length !== Object.keys(namedB).length) return false
  return paths.every((dotted) => {
    if (namedB[dotted] !== namedA[dotted]) return false
    const path = dotted.split('.')
    return valueAt(a.data, path) === valueAt(b.data, path)
  })
}

/**
 * A reader of one database's revisions by record and number, keeping each one it has read for as long as it is kept. It
 * asks the database nothing until a revision names another, so a reader made for a whole revision costs nothing.
 */
export function revisionsReaderOf(sqlite: { prepare(sql: string): { get(...args: unknown[]): unknown } }): ReadARevision {
  const read = new Map<string, StoredRevisionData>()
  let query: { get(...args: unknown[]): unknown } | undefined
  return (recordId, seq) => {
    const key = `${recordId}\u0000${String(seq)}`
    const known = read.get(key)
    if (known !== undefined) return known
    query ??= sqlite.prepare('SELECT data, parts FROM revisions WHERE record_id = ? AND seq = ?')
    const row = query.get(recordId, seq) as { data: string | null; parts: string | null } | undefined
    if (row === undefined) return undefined
    const stored = { data: row.data === null ? null : (JSON.parse(row.data) as Record<string, unknown>), parts: row.parts }
    read.set(key, stored)
    return stored
  }
}
