// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FINDING A RECORD BY WHAT IT SAYS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * There was no search. `GET /api/search` was a 404 and `GET /api/records?q=` a 400, so every
 * "which record says X" was a full corpus download and local string matching — ~250 KB for 113
 * records. An agent that used the product for a week put it plainly: *"Answering questions 4, 5, 10
 * and 11 was string-matching in Python, not API use."*
 *
 * The browser had a box, and it narrowed the records ALREADY LOADED by title and one-line summary
 * only, and said so on the screen. Measured against the live corpus on 2026-08-12, that is not
 * nearly enough:
 *
 *     clamp        matches  20 records · only  9 by title and summary
 *     anchor                 8                 2
 *     workspace            100                13
 *     夹具                   12                10
 *
 * More than half of every real search is in the body of the record. So this reads the content.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "BILINGUAL" MEANS HERE, AND WHY IT IS SUBSTRING RATHER THAN WORDS
 * ---------------------------------------------------------------------------------------
 *
 * 60 of 413 records in the live corpus carry Chinese, 51 of them in the title. Chinese is written
 * without spaces between words, so there is no word boundary to tokenise on and no stemmer that
 * would help; and it has no case, so nothing to fold. English needs case folding and has spaces.
 *
 * A SUBSTRING MATCH IS THE ONE RULE THAT IS HONEST IN BOTH. `夹具` finds `夹具标定` because in
 * Chinese that IS how you look for it, and `clam` finds `clamp` because a person typing four
 * letters means the prefix. What it does not do is pretend to understand either language: it never
 * stems, never expands a synonym, and never scores one match as more relevant than another by
 * guessing at meaning. Ranking is by WHERE the match is (see `FIELD_RANK`), which is a fact about
 * the record rather than a judgement about the words.
 *
 * ---------------------------------------------------------------------------------------
 * IT SEARCHES VALUES, NEVER FIELD NAMES
 * ---------------------------------------------------------------------------------------
 *
 * A record's `data` is JSON, and searching the raw text of it would match the KEYS: a search for
 * `symptom` would return every problem in the corpus because every problem has a `symptom` field,
 * whether or not anybody wrote that word. That is a match a reader cannot check, and it would make
 * the commonest searches — the names of the fields this product publishes — useless.
 *
 * So the walk below yields the string VALUES a person or an agent typed, each with the path it was
 * found at, and the path is reported beside the match. Numbers, booleans and nulls are not text and
 * are not searched: `18` in a search box means the number eighteen to nobody.
 */

import type { PanelRecord } from './types.ts'

/** One place a query was found, and enough around it to see why it matched. */
export interface SearchHit {
  /**
   * Where it matched, in the record's own vocabulary: `title`, `summary`, or a path into `data`
   * such as `data.symptom` or `data.parts[2].items[0].text`.
   *
   * REPORTED RATHER THAN LEFT TO BE GUESSED. A result whose match is in a checklist line and a
   * result whose match is in the title are different answers to "does this record say X", and a
   * reader deciding which of nine results to open needs to know which they are looking at.
   */
  where: string
  /** The text around the match, with the match in it. See `snippetAround` for what is cut. */
  snippet: string
}

/** One record that matched, with every place it matched. */
export interface SearchResult<R extends PanelRecord = PanelRecord> {
  /**
   * THE SAME ROW SHAPE THE RECORDS LIST SERVES, so a result and a row are one thing.
   *
   * The generic is not decoration: `GET /api/records` serves `PanelRecord & { incompleteCount }`,
   * and if a search result were a bare record the browser would hold two shapes for one thing and
   * the page that draws both would have to know which it had. That is the second model this
   * repository keeps deleting.
   */
  record: R
  /** Every hit, best field first. Never empty — a result with no hit is not a result. */
  hits: SearchHit[]
  /** How this result was ordered against the others. See `FIELD_RANK`. */
  rank: number
}

/**
 * WHERE A MATCH COUNTS FOR MOST, and it is the only ranking there is.
 *
 * A title is what somebody chose to call the thing, a summary is the one line they wrote about it,
 * and the body is everything else. That order is a fact about how the record was written, not a
 * guess about what the searcher meant — which is the whole reason ranking stops here. There is no
 * term frequency, no field weighting anybody has to defend, and no recency: a record that mentions
 * the word twice is not more about it than one that mentions it once.
 */
const FIELD_RANK: Record<'title' | 'summary' | 'data', number> = { title: 0, summary: 1, data: 2 }

/** How much of the text around a match comes back. Enough to read the clause it is in. */
export const SNIPPET_RADIUS = 60

/**
 * The text around a match, with an ellipsis where something was cut.
 *
 * The ellipsis is only ever where text was really removed, so a snippet that starts at the
 * beginning of the value looks like the beginning of the value.
 */
export function snippetAround(text: string, at: number, length: number): string {
  const from = Math.max(0, at - SNIPPET_RADIUS)
  const to = Math.min(text.length, at + length + SNIPPET_RADIUS)
  return (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '')
}

/**
 * Every string value inside a record's `data`, with the path it was found at.
 *
 * Arrays are indexed and objects are named, so the path reads the way the API's own refusals do —
 * `data.parts[0].items[2].text`. A caller can take that path back to the record and check.
 */
export function textValuesIn(data: unknown, path = 'data'): { where: string; text: string }[] {
  const found: { where: string; text: string }[] = []
  eachTextIn(data, path, (text, where) => {
    found.push({ where: where!, text })
    return false
  })
  return found
}

/**
 * THE WALK `textValuesIn` MAKES, and the one place that says which values are text: each string value that is not
 * blank, in the record's own order, given to `visit` until it answers true. With a `path` of null no path is built,
 * for a reader that asks only whether a record says something.
 */
function eachTextIn(data: unknown, path: string | null, visit: (text: string, where: string | null) => boolean): boolean {
  if (typeof data === 'string') return data.trim() !== '' && visit(data, path)
  if (Array.isArray(data)) return data.some((v, i) => eachTextIn(v, path === null ? null : `${path}[${i}]`, visit))
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>).some(([key, v]) => eachTextIn(v, path === null ? null : `${path}.${key}`, visit))
  }
  // A number, a boolean, a null. None of them is text somebody typed, and matching "18" against a
  // stored `hours: 18` would be a match a reader cannot see in the record.
  return false
}

/**
 * Fold a string for comparison: case for the Latin alphabet, nothing for anything else.
 *
 * `toLowerCase` on a Chinese string returns it unchanged, which is correct rather than lucky —
 * there is no case to fold — so one call is honest for both scripts and there is no branch here
 * deciding which language it is looking at. Deciding that is exactly what this must not do.
 */
function fold(text: string): string {
  return text.toLowerCase()
}

/**
 * What a search looks for: the query without the spaces around it, folded. The index of the records' text is asked
 * about this same string (src/server/lib/record-text-index.ts), so the two cannot look for different things.
 */
export function theNeedle(query: string): string {
  return fold(query.trim())
}

/** Whether a query is one this can answer. An empty or blank query is not a search. */
export function usableQuery(q: string): boolean {
  return q.trim() !== ''
}

/**
 * Search one record. `null` when it does not match — never an empty result.
 *
 * Every hit is collected rather than the first, because "where does this record say it" is the
 * question a reader has after "which records say it", and answering it costs one more pass over
 * text that is already in hand.
 */
export function searchRecord<R extends PanelRecord>(record: R, query: string): SearchResult<R> | null {
  const needle = theNeedle(query)
  if (needle === '') return null

  const hits: SearchHit[] = []
  let best = Number.POSITIVE_INFINITY

  eachTextOf(record, true, (text, where, rank) => {
    const at = fold(text).indexOf(needle)
    if (at === -1) return false
    hits.push({ where: where!, snippet: snippetAround(text, at, query.trim().length) })
    best = Math.min(best, rank)
    return false
  })

  if (hits.length === 0) return null
  // Best field first, then the order they were found in, which is the record's own field order.
  hits.sort((a, b) => rankOf(a.where) - rankOf(b.where))
  return { record, hits, rank: best }
}

/**
 * WHETHER A RECORD SAYS THIS: what `searchRecord(record, query) !== null` answers, without a snippet, a path or a rank,
 * and stopping at the first text that says it. For a reader that only counts the records that match.
 */
export function saysIt(record: PanelRecord, query: string): boolean {
  return theBestFieldThatSays(record, query) !== null
}

/**
 * THE BEST FIELD THAT SAYS THIS: the `rank` `searchRecord(record, query)` gives, or null where it gives null, without a
 * snippet or a path, and stopping at the first text that says it. `eachTextOf` gives the title, then the summary, then
 * each text in the body, which is the order of their ranks, so the first text that says it is in the best field.
 */
export function theBestFieldThatSays(record: PanelRecord, query: string): number | null {
  const needle = theNeedle(query)
  if (needle === '') return null
  let best: number | null = null
  eachTextOf(record, false, (text, _where, rank) => {
    if (!fold(text).includes(needle)) return false
    best = rank
    return true
  })
  return best
}

/**
 * EVERY TEXT A RECORD IS SEARCHED IN, best field first: its title, its summary when it has one, and each text value in
 * its `data`. `searchRecord` and `saysIt` both look through here, so they cannot look in different places.
 */
function eachTextOf(record: PanelRecord, withPaths: boolean, visit: (text: string, where: string | null, rank: number) => boolean): boolean {
  if (visit(record.title, 'title', FIELD_RANK.title)) return true
  if (record.summary !== null && visit(record.summary, 'summary', FIELD_RANK.summary)) return true
  return eachTextIn(record.data, withPaths ? 'data' : null, (text, where) => visit(text, where, FIELD_RANK.data))
}

/** Which of the three fields a `where` belongs to. Anything under `data.` is the body. */
function rankOf(where: string): number {
  if (where === 'title') return FIELD_RANK.title
  if (where === 'summary') return FIELD_RANK.summary
  return FIELD_RANK.data
}

/**
 * Search a whole workspace's records.
 *
 * IT LOOKS IN EVERY RECORD IT IS GIVEN. Choosing fewer records to give it is the caller's part.
 * Until wave 13y round 64 there was no index, because the live corpus was 413 records holding 301 KB
 * of `data`. On the made-up office of 22 October 2026 one search took about two seconds, so
 * GET /api/search now asks the index of the records' text which records could match and gives
 * only those to this function (src/server/lib/record-text-index.ts). The triggers of migration
 * `*_one_index_of_the_records_text` keep the index on every write, so there is no second copy
 * for a writer to forget.
 */
export function searchRecords<R extends PanelRecord>(records: readonly R[], query: string): SearchResult<R>[] {
  const found: SearchResult<R>[] = []
  for (const record of records) {
    const result = searchRecord(record, query)
    if (result !== null) found.push(result)
  }
  return inTheSearchOrder(found)
}

/**
 * THE RECORDS THAT SAY THIS, each with its best field, in the order `searchRecords` gives them, with no snippet and no
 * path. For a reader that counts and orders every match and shows a few: `searchRecord` gives the hits of each it shows.
 */
export function theRecordsThatSay<R extends PanelRecord>(records: readonly R[], query: string): { record: R; rank: number }[] {
  const found: { record: R; rank: number }[] = []
  for (const record of records) {
    const rank = theBestFieldThatSays(record, query)
    if (rank !== null) found.push({ record, rank })
  }
  return inTheSearchOrder(found)
}

/**
 * THE ORDER OF A SEARCH'S MATCHES. Best field first; within a field, the newest record first, because two records whose
 * titles both carry the word are told apart by which one somebody wrote most recently and by nothing else this function
 * is willing to guess at. Records with the same `createdAt` stay in the order they were given in.
 */
function inTheSearchOrder<M extends { record: PanelRecord; rank: number }>(found: M[]): M[] {
  return found.sort((a, b) => a.rank - b.rank || b.record.createdAt.localeCompare(a.record.createdAt))
}
