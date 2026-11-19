// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION FILE SPLIT INTO WHAT SQLITE RUNS AND WHAT ONLY A PERSON READS.
 *
 * Two tests read the applied migration files under drizzle/ this way, so the split is worked out
 * here once. tests/the-applied-migrations-keep-their-statements.test.ts compares what SQLite runs
 * with main's. tests/the-owners-project-is-not-in-the-source.test.ts reads the comments for words
 * that name the owner.
 *
 * WHAT COUNTS AS A COMMENT. A `--` comment runs to the end of its line, and a block comment runs
 * from its opening to its close, as SQLite reads them. Neither counts inside a quoted string or a
 * quoted name. `--> statement-breakpoint` is NOT a comment here: drizzle splits a file into
 * statements on it, so moving or losing one changes what runs.
 *
 * WHAT THE STATEMENTS ARE. The file with every comment taken out, then every line that is left
 * blank dropped. Each remaining line is kept exactly, spaces included. So a comment may be
 * rewritten, shortened or removed, and the statements read the same; a change to one character
 * outside a comment does not.
 */

export interface MigrationText {
  /** What SQLite runs: every non-blank line left once the comments are out, joined by newlines. */
  statements: string
  /** Each comment, with the line it starts on (from 1) and its words without the comment marks. */
  comments: { line: number; text: string }[]
}

const BREAKPOINT = '--> statement-breakpoint'

export function splitMigration(sql: string): MigrationText {
  let kept = ''
  const comments: { line: number; text: string }[] = []
  let line = 1
  let i = 0
  while (i < sql.length) {
    const c = sql[i]!
    if (c === "'" || c === '"' || c === '`') {
      // A quoted string or name runs to its closing mark; a doubled mark is the mark itself.
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue }
          break
        }
        j++
      }
      const piece = sql.slice(i, j + 1)
      kept += piece
      line += piece.split('\n').length - 1
      i = j + 1
      continue
    }
    if (sql.startsWith(BREAKPOINT, i)) {
      kept += BREAKPOINT
      i += BREAKPOINT.length
      continue
    }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      const stop = end === -1 ? sql.length : end
      comments.push({ line, text: sql.slice(i + 2, stop) })
      i = stop
      continue
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      const stop = end === -1 ? sql.length : end + 2
      const body = sql.slice(i + 2, end === -1 ? sql.length : end)
      comments.push({ line, text: body })
      line += body.split('\n').length - 1
      i = stop
      continue
    }
    if (c === '\n') line++
    kept += c
    i++
  }
  const statements = kept
    .split('\n')
    .filter((one) => one.trim() !== '')
    .join('\n')
  return { statements, comments }
}
