// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE ASKED AFTER THE DATABASE IS CLOSED IS SKIPPED, WITH ONE LINE, AND NEVER THROWS (package SD).
 *
 * The shut-down closes the database and then goes on: it ends the terminal holder, which can take twenty seconds, and
 * lets the service lock go (src/server/index.ts). A timer or an event that wrote in that time met better-sqlite3's own
 * "The database connection is not open", thrown into whatever asked, and a throw with no caller ends the process before
 * the holder is ended. `closeTheDatabase` is the one place that decides the handle is closed. It closes the handle and
 * changes it once, so no writer asks whether it is open:
 *
 * - A write is skipped. The log says what it was and why, in one line. `run` answers that no row changed, which is true.
 * - A read fails, in words that say the shut-down closed the database. An answer made from nothing would be a lie.
 * - A statement this file cannot tell is a read or a write fails as a read.
 * - A transaction's own BEGIN, COMMIT and ROLLBACK are skipped with no line. They change no row.
 * - A PRAGMA fails as a read: its words cannot tell reading a setting from setting it.
 *
 * A STATEMENT PREPARED BEFORE THE CLOSE says itself whether it writes (`readonly`, SQLite's own answer). One asked for
 * after it cannot be prepared, so its first word decides: INSERT, UPDATE, DELETE, REPLACE, CREATE, DROP and ALTER write,
 * and anything else, WITH included, cannot be told and fails as a read. `exec` answers no rows, so it is a write.
 */
import type Database from 'better-sqlite3'

type Statement = Database.Statement<unknown[], unknown>

/** What a statement is to the closed handle: a write to skip with a line, a step of a transaction, or a read to fail. */
type WhatItIs = 'a write' | 'a step of a transaction' | 'a read'

const WRITES_BY_THEIR_FIRST_WORD = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'DROP', 'ALTER'])
const STEPS_OF_A_TRANSACTION = new Set(['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'])

/** The statement's first word, after any comment, in capitals. */
function theFirstWordOf(source: string): string {
  const bare = source.replace(/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/u, '')
  return (/^[A-Za-z]+/u.exec(bare)?.[0] ?? '').toUpperCase()
}

/** For a statement asked for after the close, which cannot be prepared to ask SQLite. */
function whatTheWordsAre(source: string): WhatItIs {
  const first = theFirstWordOf(source)
  if (STEPS_OF_A_TRANSACTION.has(first)) return 'a step of a transaction'
  return WRITES_BY_THEIR_FIRST_WORD.has(first) ? 'a write' : 'a read'
}

/** For a statement prepared before the close: SQLite said then whether it writes. */
function whatThePreparedStatementIs(statement: Statement): WhatItIs {
  if (!statement.readonly) return 'a write'
  return statement.reader ? 'a read' : 'a step of a transaction'
}

/** The statement as the log line names it: its words, on one line, cut at 160 characters. No value bound to it. */
function theStatementsWords(source: string): string {
  const one = source.replace(/\s+/gu, ' ').trim()
  return one.length > 160 ? `${one.slice(0, 159)}…` : one
}

/**
 * Close `handle`, and from then on skip what writes to it and fail what reads it, as the header says. `say` takes the
 * one line for each write skipped. Statements of any other handle in this process are left as they are.
 */
export function closeTheDatabase(handle: Database.Database, say: (line: string) => void): void {
  // THE TRANSACTION'S OWN STATEMENTS ARE MADE THE FIRST TIME `transaction` IS CALLED, and they cannot be made once the
  // handle is closed. One call here makes them, so a transaction asked for after the close is skipped like any write.
  handle.transaction(() => undefined)
  // EVERY STATEMENT OF EVERY HANDLE SHARES ONE PROTOTYPE, so the methods are taken from a statement of this handle.
  const prototype = Object.getPrototypeOf(handle.prepare('SELECT 1')) as Statement
  const closedAt = new Date().toLocaleTimeString('en-GB', { hour12: false })
  handle.close()

  const skipped = (source: string): void => {
    say(`A write was skipped because the shut-down had closed the database at ${closedAt}: ${theStatementsWords(source)}`)
  }
  const refused = (source: string): Error =>
    new Error(`This read was not answered because the shut-down had closed the database at ${closedAt}: ${theStatementsWords(source)}`)
  /** What `run`, `get`, `all` and `iterate` answer for a statement that is skipped. */
  const nothing = {
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
    get: () => undefined,
    all: () => [],
    iterate: () => [][Symbol.iterator](),
  } as const
  const asked = (source: string, what: WhatItIs, method: keyof typeof nothing): unknown => {
    if (what === 'a read') throw refused(source)
    if (what === 'a write') skipped(source)
    return nothing[method]()
  }

  for (const method of ['run', 'get', 'all', 'iterate'] as const) {
    const itsOwn = prototype[method] as (this: Statement, ...args: unknown[]) => unknown
    ;(prototype as unknown as Record<string, unknown>)[method] = function (this: Statement, ...args: unknown[]): unknown {
      if (this.database !== handle) return itsOwn.apply(this, args)
      return asked(this.source, whatThePreparedStatementIs(this), method)
    }
  }
  // `bind` AND `columns` ASK THE HANDLE THEMSELVES, and would throw better-sqlite3's own words. A bound statement then
  // runs as above; its columns are a read.
  const itsOwnBind = prototype.bind as (this: Statement, ...args: unknown[]) => Statement
  const itsOwnColumns = prototype.columns as (this: Statement) => unknown
  ;(prototype as unknown as Record<string, unknown>)['bind'] = function (this: Statement, ...args: unknown[]): Statement {
    return this.database === handle ? this : itsOwnBind.apply(this, args)
  }
  ;(prototype as unknown as Record<string, unknown>)['columns'] = function (this: Statement): unknown {
    if (this.database === handle) throw refused(this.source)
    return itsOwnColumns.apply(this)
  }

  // A STATEMENT ASKED FOR AFTER THE CLOSE is a stand-in that answers as the header says. Drizzle prepares each query here.
  handle.prepare = ((source: string) => {
    const what = whatTheWordsAre(source)
    const standIn: Record<string, unknown> = {
      source,
      database: handle,
      reader: what === 'a read',
      readonly: what !== 'a write',
      busy: false,
      run: () => asked(source, what, 'run'),
      get: () => asked(source, what, 'get'),
      all: () => asked(source, what, 'all'),
      iterate: () => asked(source, what, 'iterate'),
      columns: () => {
        throw refused(source)
      },
    }
    for (const setting of ['pluck', 'expand', 'raw', 'safeIntegers', 'bind']) standIn[setting] = () => standIn
    return standIn as unknown as Statement
  }) as Database.Database['prepare']
  handle.exec = ((source: string) => {
    skipped(source)
    return handle
  }) as Database.Database['exec']
  // A PRAGMA reads a setting or sets one, and its words cannot tell which, so it fails as a read.
  handle.pragma = ((source: string) => {
    throw refused(`PRAGMA ${source}`)
  }) as Database.Database['pragma']
}
