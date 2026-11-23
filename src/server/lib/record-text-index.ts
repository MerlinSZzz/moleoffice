// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH RECORDS COULD HOLD SOME TEXT, ASKED OF THE INDEX OF THE RECORDS' TEXT. Wave 13y round 64.
 *
 * Migration `*_one_index_of_the_records_text` keeps one full-text index of every record's title, summary and the
 * string values in its data. It holds every three letters of that text, folded to one case by SQLite. GET /api/search
 * and GET /api/report-files/named-inside ask it first which records could hold what they look for, and then look in
 * those records exactly as they looked in every record before. So the index decides only which records are read.
 *
 * IT MAY KEEP TOO MANY RECORDS AND NEVER TOO FEW. A record that holds the text holds each three letters of it, and
 * the index holds them for that record, so the record is kept. That is true for any text written as it is stored,
 * which is what named-inside looks for. The search looks for the text in any case, and folds both sides with
 * JavaScript's toLowerCase, which is not SQLite's folding. For each letter the two agree except on the list below, so
 * three letters with none of those in them are asked of the index, and three letters with one are left out of the
 * question. Leaving letters out keeps more records, never fewer.
 *
 * Each function gives the ids of the records it keeps, which the caller reads by id. It gives undefined when it cannot
 * narrow at all, or when it keeps more than its bound, by default `AT_MOST_READ_BY_ID`, and the caller then reads every
 * record, as before.
 *
 * tests/one-index-of-the-records-text-serves-search-and-named-inside.test.ts proves the list over every code point
 * with this SQLite, and proves on random records in many scripts that the search finds nothing the index left out.
 */
import { sql } from 'drizzle-orm'

import { db } from '../db/client.ts'

/**
 * HOW MANY RECORDS ARE READ BY ID AT MOST. Past this many, the caller reads every record as it did before the index.
 *
 * On the made-up office at the 22 October scale (wave 13y round 64), a record read by id cost 1.2 to 2.2 µs in each
 * read. A read of one project that is not given ids walks every row of the project or of a kind: 35 ms at least, and
 * 93 to 170 ms with no kind. So 2,000 records cost at most about 4.4 ms a read. For a common word the index kept 92,885
 * records for, reading them by id took 2,027 ms for eleven projects, and walking the projects took 1,847 ms.
 *
 * A caller may give a larger number of its own. The named-inside door does, with its measure beside it in
 * src/server/api/reportfiles.ts.
 */
export const AT_MOST_READ_BY_ID = 2000

/**
 * THE LETTERS THE TWO FOLDINGS DISAGREE ON, as ranges of code points, first and last.
 *
 * A letter here is the lowercase, in JavaScript, of some letter that SQLite folds to something else. Georgian
 * Mkhedruli is the largest group: JavaScript lowercases Mtavruli to it, and SQLite does not fold Mtavruli. Most other
 * rows are the same: capitals that Unicode added after the tables SQLite folds by, such as Cherokee's and Osage's.
 *
 * The small "i" is left out, because it is unsafe only after "İ" (U+0130), which JavaScript lowercases to "i" and
 * U+0307. So an "i" is unsafe only when U+0307 follows it in the search or it is the search's last letter. U+0307
 * itself is on the list.
 */
const UNSAFE_TO_FOLD: readonly (readonly [number, number])[] = [
  [0x19b, 0x19b], [0x25c, 0x25c], [0x261, 0x261], [0x264, 0x264], [0x26a, 0x26a], [0x26c, 0x26c], [0x282, 0x282],
  [0x287, 0x287], [0x29d, 0x29e], [0x307, 0x307], [0x3f3, 0x3f3], [0x529, 0x529], [0x52b, 0x52b], [0x52d, 0x52d],
  [0x52f, 0x52f], [0x10d0, 0x10fa], [0x10fd, 0x10ff], [0x13f8, 0x13fd], [0x1c8a, 0x1c8a], [0x1d8e, 0x1d8e],
  [0x2c5f, 0x2c5f], [0xa699, 0xa699], [0xa69b, 0xa69b], [0xa794, 0xa794], [0xa797, 0xa797], [0xa799, 0xa799],
  [0xa79b, 0xa79b], [0xa79d, 0xa79d], [0xa79f, 0xa79f], [0xa7b5, 0xa7b5], [0xa7b7, 0xa7b7], [0xa7b9, 0xa7b9],
  [0xa7bb, 0xa7bb], [0xa7bd, 0xa7bd], [0xa7bf, 0xa7bf], [0xa7c1, 0xa7c1], [0xa7c3, 0xa7c3], [0xa7c8, 0xa7c8],
  [0xa7ca, 0xa7ca], [0xa7cd, 0xa7cd], [0xa7cf, 0xa7cf], [0xa7d1, 0xa7d1], [0xa7d3, 0xa7d3], [0xa7d5, 0xa7d5],
  [0xa7d7, 0xa7d7], [0xa7d9, 0xa7d9], [0xa7db, 0xa7db], [0xa7f6, 0xa7f6], [0xab53, 0xab53], [0xab70, 0xabbf],
  [0x104d8, 0x104fb], [0x10597, 0x105a1], [0x105a3, 0x105b1], [0x105b3, 0x105b9], [0x105bb, 0x105bc],
  [0x10cc0, 0x10cf2], [0x10d70, 0x10d85], [0x118c0, 0x118df], [0x16e60, 0x16e7f], [0x16ebb, 0x16ed3],
  [0x1e922, 0x1e943],
]

/** Whether a letter of a search is one the index is never asked about. See `UNSAFE_TO_FOLD`. */
export function isUnsafeToFold(codePoint: number): boolean {
  return UNSAFE_TO_FOLD.some(([first, last]) => codePoint >= first && codePoint <= last)
}

/** A NUL, which the index skips, or half of a surrogate pair, which SQLite stores as another letter. */
function cannotBeAsked(text: string): boolean {
  return text.includes('\0') || /\p{Cs}/u.test(text)
}

/** One three-letter piece as the index's query language writes it: in double quotes, a quote inside written twice. */
function quoted(piece: string): string {
  return `"${piece.replaceAll('"', '""')}"`
}

/**
 * The ids of the records whose index entry the query matches, or undefined when there are more than `atMost`, by
 * default `AT_MOST_READ_BY_ID`.
 *
 * Asked as a join, the index is read first and each key as the index gives it, so the read stops at the number. Asked
 * with IN, SQLite made the list of every record the index keeps before it read one key. For a common word the index
 * kept 92,885 records for, on the made-up office at the 22 October scale, that was 16.7 ms against 0.5 ms.
 */
function theRecordsMatching(query: string, atMost = AT_MOST_READ_BY_ID): string[] | undefined {
  const kept = db.all<{ id: string }>(sql`SELECT k.record_id AS id FROM record_text JOIN record_text_keys k ON k.n = record_text.rowid
    WHERE record_text MATCH ${query} LIMIT ${atMost + 1}`)
  return kept.length > atMost ? undefined : kept.map((one) => one.id)
}

/**
 * THE RECORDS THAT COULD HOLD A SEARCH, for a search already folded by `theNeedle` (src/shared/search.ts), or undefined
 * when no three letters of it may be asked. A search shorter than three letters is one of those.
 */
export function theRecordsThatMaySay(needle: string): string[] | undefined {
  if (cannotBeAsked(needle)) return undefined
  const letters = [...needle]
  const unsafe = letters.map((letter, at) => {
    const codePoint = letter.codePointAt(0)!
    if (codePoint === 0x69) return at === letters.length - 1 || letters[at + 1] === '̇'
    return isUnsafeToFold(codePoint)
  })
  const pieces = new Set<string>()
  for (let at = 0; at + 3 <= letters.length; at++) {
    if (!unsafe[at] && !unsafe[at + 1] && !unsafe[at + 2]) pieces.add(letters.slice(at, at + 3).join(''))
  }
  if (pieces.size === 0) return undefined
  return theRecordsMatching([...pieces].map(quoted).join(' AND '))
}

/**
 * THE RECORDS THAT COULD HOLD ANY ONE OF THESE TEXTS AS WRITTEN, or undefined when one of them cannot be asked. A text
 * shorter than three letters cannot. It gives undefined as well when it keeps more than `atMost` records, by default
 * `AT_MOST_READ_BY_ID`.
 */
export function theRecordsThatMayHoldOneOf(texts: readonly string[], atMost = AT_MOST_READ_BY_ID): string[] | undefined {
  const asked: string[] = []
  for (const text of texts) {
    const letters = [...text]
    if (letters.length < 3 || cannotBeAsked(text)) return undefined
    const pieces = new Set<string>()
    for (let at = 0; at + 3 <= letters.length; at++) pieces.add(letters.slice(at, at + 3).join(''))
    asked.push(`(${[...pieces].map(quoted).join(' AND ')})`)
  }
  if (asked.length === 0) return undefined
  return theRecordsMatching(asked.join(' OR '), atMost)
}
