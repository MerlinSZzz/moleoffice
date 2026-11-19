// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROBLEM ROWS A READING READS. Wave 13u round 58.
 *
 * Install before making the app, so statements the server keeps are counted too. Drizzle asks
 * `raw().all()` for arrays: `columns()` says which values came from records.id, kind and data.
 * An id mentioned inside another record's data is no problem row. A whole records.data column,
 * or a symptom marker anywhere in a returned value, does count as a whole problem read.
 *
 * Counts cover rows handed back by all, get and iterate since reset, including other tables.
 * Markers belong to the caller's made-up office; this helper reads no fixture rows itself.
 */
import type { TestDb } from './helpers.ts'

type Column = { name: string; column: string | null; table: string | null }
type Statement = {
  columns(): Column[]
  all(...args: unknown[]): unknown[]
  get(...args: unknown[]): unknown
  iterate(...args: unknown[]): IterableIterator<unknown>
}

export function theProblemRowsAReadingReads(t: TestDb, markers: ReadonlyMap<string, string>) {
  let problemIds = new Set<string>()
  let wholeProblemIds = new Set<string>()
  let rows = 0
  const byMarker = new Map([...markers].map(([id, marker]) => [marker, id]))
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let prefix = byMarker.keys().next().value ?? ''
  for (const marker of byMarker.keys()) while (!marker.startsWith(prefix)) prefix = prefix.slice(0, -1)
  // Most cells carry no marker. Share the markers' prefix rather than testing thousands of
  // almost identical alternatives against every cell of the measurement itself.
  const pattern = markers.size === 0 ? null : new RegExp(`${escape(prefix)}(?:${[...byMarker.keys()].map(marker => escape(marker.slice(prefix.length))).join('|')})`, 'g')
  const sqlite = t.client.sqlite as unknown as { prepare(text: string): Statement }
  const prepare = sqlite.prepare
  sqlite.prepare = function (text: string) {
    const statement = prepare.call(this, text)
    let columns: Column[] | undefined
    function handedBack(row: unknown) {
      if (row === undefined) return
      rows++
      const metadata = columns ??= statement.columns()
      const values = Array.isArray(row) ? row : metadata.map(column => (row as Record<string, unknown>)[column.name])
      const fromRecords = (name: string) => metadata.findIndex(column => column.table === 'records' && column.column === name)
      const id = values[fromRecords('id')]
      if (typeof id === 'string' && values[fromRecords('kind')] === 'problem') {
        problemIds.add(id)
      }
      if (typeof id === 'string' && (markers.has(id) || values[fromRecords('kind')] === 'problem') && fromRecords('data') !== -1) wholeProblemIds.add(id)
      if (pattern !== null) for (const value of values) {
        const text = typeof value === 'string' ? value : JSON.stringify(value)
        if (text === undefined || !text.includes(prefix)) continue
        for (const match of text.matchAll(pattern)) wholeProblemIds.add(byMarker.get(match[0])!)
      }
    }
    const all = statement.all
    statement.all = function (...args: unknown[]) {
      const answer = all.apply(this, args)
      for (const row of answer) handedBack(row)
      return answer
    }
    const get = statement.get
    statement.get = function (...args: unknown[]) {
      const answer = get.apply(this, args)
      handedBack(answer)
      return answer
    }
    const iterate = statement.iterate
    statement.iterate = function* (...args: unknown[]) {
      for (const row of iterate.apply(this, args)) {
        handedBack(row)
        yield row
      }
    }
    return statement
  }
  return {
    reset() { problemIds = new Set(); wholeProblemIds = new Set(); rows = 0 },
    read() { return { problemIds: [...problemIds].sort(), wholeProblemIds: [...wholeProblemIds].sort(), rows } },
  }
}
