// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROWS A READ HANDS THE SERVER. Wave 13s round 281.
 *
 * Install before making the app, so statements the server keeps from then on are counted too. It wraps `prepare` on
 * the test's connection, and all, get and iterate on each statement it makes. Each row handed back between start and
 * stop is counted, in every row mode: objects, arrays (raw), single values (pluck) and objects by table (expand).
 *
 * A row counts as outside when a value that `columns()` says came from records.id is an outside id. It also counts
 * when a value read as text holds an outside marker. An outside id inside another record's data is not counted: it is
 * a value of that record, not the id of the row handed back.
 *
 * It cannot see a statement prepared before it is installed, or one on another connection or thread. It cannot see a
 * row whose id and marker are not among the columns handed back. It cannot see a row that is not in the caller's list.
 * An object row that names one column twice keeps only the last of them, so only that one is read. The ids and
 * markers belong to the caller's made-up office; this helper reads no rows itself.
 */
import type { TestDb } from './helpers.ts'

type Column = { name: string; column: string | null; table: string | null }
type Statement = {
  readonly reader: boolean
  columns(): Column[]
  all(...args: unknown[]): unknown[]
  get(...args: unknown[]): unknown
  iterate(...args: unknown[]): IterableIterator<unknown>
}

export function theRowsAReadHandsTheServer(t: TestDb, markers: ReadonlyMap<string, string>) {
  let counting: { outsideIds: Set<string>; rows: number } | null = null
  const byMarker = new Map([...markers].map(([id, marker]) => [marker, id]))
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let prefix = byMarker.keys().next().value ?? ''
  for (const marker of byMarker.keys()) while (!marker.startsWith(prefix)) prefix = prefix.slice(0, -1)
  // Most cells carry no marker. Share the markers' prefix rather than testing every marker against every cell.
  const pattern = markers.size === 0 ? null : new RegExp(`${escape(prefix)}(?:${[...byMarker.keys()].map(marker => escape(marker.slice(prefix.length))).join('|')})`, 'g')
  const sqlite = t.client.sqlite as unknown as { prepare(text: string): Statement }
  const prepare = sqlite.prepare
  sqlite.prepare = function (text: string) {
    const statement = prepare.call(this, text)
    let metadata: Column[] | undefined
    // Asked before a row is read: `columns()` is refused while the statement iterates.
    const columnsOf = () => (metadata ??= statement.columns())
    function handedBack(row: unknown, columns: Column[]) {
      const count = counting
      if (count === null || row === undefined) return
      count.rows++
      // THE FOUR ROW MODES. An array is raw. A single value is pluck, the first column. An object whose values are
      // objects is expand, by table and then by name, with '$' for a column of no table. Any other object is by name.
      const byTable = row as Record<string, Record<string, unknown> | undefined>
      const values = Array.isArray(row)
        ? row
        : row === null || typeof row !== 'object' || row instanceof Uint8Array
          ? [row]
          : Object.values(row).some(value => value !== null && typeof value === 'object' && !(value instanceof Uint8Array))
            ? columns.map(column => byTable[column.table ?? '$']?.[column.name])
            : columns.map(column => (row as Record<string, unknown>)[column.name])
      values.forEach((value, i) => {
        if (columns[i]?.table === 'records' && columns[i]?.column === 'id' && typeof value === 'string' && markers.has(value)) count.outsideIds.add(value)
        const text = typeof value === 'string' ? value : value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : null
        if (pattern === null || text === null || !text.includes(prefix)) return
        for (const match of text.matchAll(pattern)) count.outsideIds.add(byMarker.get(match[0])!)
      })
    }
    const all = statement.all
    statement.all = function (...args: unknown[]) {
      if (counting === null) return all.apply(this, args)
      const answer = all.apply(this, args)
      for (const row of answer) handedBack(row, columnsOf())
      return answer
    }
    const get = statement.get
    statement.get = function (...args: unknown[]) {
      if (counting === null) return get.apply(this, args)
      const answer = get.apply(this, args)
      if (answer !== undefined) handedBack(answer, columnsOf())
      return answer
    }
    const iterate = statement.iterate
    statement.iterate = function (...args: unknown[]) {
      if (counting === null) return iterate.apply(this, args)
      const columns = statement.reader ? columnsOf() : []
      const rows = iterate.apply(this, args)
      return (function* () {
        for (const row of rows) {
          handedBack(row, columns)
          yield row
        }
      })()
    }
    return statement
  }
  return {
    /** Begins a count from nothing. */
    start() { counting = { outsideIds: new Set(), rows: 0 } },
    /** Ends the count, and answers the outside ids found, sorted, and the number of rows handed back. */
    stop() {
      const ended = counting ?? { outsideIds: new Set<string>(), rows: 0 }
      counting = null
      return { outsideIds: [...ended.outsideIds].sort(), rows: ended.rows }
    },
  }
}
