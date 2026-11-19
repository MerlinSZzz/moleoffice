// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEAR-DUPLICATE TITLE REPORT: `SimilarTitle`, `NEAR_DUPLICATE_FLOOR`,
 * `NEAR_DUPLICATES_REPORTED`, `nearDuplicateTitles` and `describeSimilar`. It was moved whole out of
 * src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands these names on with `export *`, and every caller still imports
 * them from records.ts, records/creating.ts included.
 *
 * THIS FILE IMPORTS NOTHING FROM records.ts, so there is no cycle and no caller changed.
 */
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import type { RecordKind } from '@shared/types.ts'

// ================================================== SAYING WHAT IS ALREADY FILED, ON THE WAY IN
//
// THE DEFECT THIS SECTION EXISTS TO REMOVE. Seven agents filed 93 records into this workspace in
// one night, working in parallel and without reading each other. Three of them filed a record
// somebody else had already filed, in different words, and every one of the three was answered
// `201 {"incomplete": []}` -- the strongest "you got this right" signal the product has. All three
// were found afterwards, by an author re-reading a page by chance, and one is still standing as an
// unresolved `contradicts` between two agents who each thought they were first.
//
// An EXACT repeat is reported separately, as `sameTitle` on the create result. What this is about
// is the NEAR miss, which is what two people describing the same fact actually produce:
//
//     "A misspelt actor header was silently promoted to the person, the one identity allowed …"
//     "A misspelt actor header was silently promoted to the human identity"
//
// THIS IS A REPORT AND NEVER A REFUSAL, and that is the whole design. Two records with similar
// titles are usually two different things, so refusing would be wrong far more often than right.
// Deduplicating them automatically would be worse still: it would decide, on a string, that two
// pieces of somebody's work are one. What every agent that hit this asked for was the same small
// thing -- a write that answers with what is already there -- so that is what it is.

/** One live record whose title is close to the one being filed. */
export interface SimilarTitle {
  id: string
  kind: RecordKind
  title: string
  /** How close, 0 to 1, by the measure below. */
  closeness: number
}

/**
 * How close two titles must be before the write mentions one to the other.
 *
 * MEASURED, NOT PICKED. The threshold was chosen by running the measure below over the titles of
 * all 378 live records in the workspace the dogfood wrote -- 71,253 pairs -- and looking at what
 * comes out. The two real duplicate pairs the exercise found by hand score 0.78 and 0.73. At 0.70
 * the whole corpus yields 24 pairs, 11 of them not involving a block, and most of those 11 are
 * themselves genuine near-duplicates that nobody had noticed (an obligation and a task for the same
 * errand, four separate times). Raising it to 0.75 loses the second real pair. Lowering it to 0.65
 * doubles the noise and finds nothing new.
 */
export const NEAR_DUPLICATE_FLOOR = 0.7

/** At most this many are reported. The closest first; a wall of near-misses is not a report. */
export const NEAR_DUPLICATES_REPORTED = 3

/**
 * A title reduced to what it says, so that punctuation and capitals cannot hide a repeat.
 *
 * `\p{L}` and `\p{N}` rather than `a-z0-9`, because a third of this workspace's titles are Chinese
 * and stripping them to nothing would make every one of them look identical to every other.
 */
function titleWords(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The character pairs of a normalised title, with their counts. The unit the measure compares. */
function shingles(normalised: string): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = 0; i + 1 < normalised.length; i += 1) {
    const pair = normalised.slice(i, i + 2)
    out.set(pair, (out.get(pair) ?? 0) + 1)
  }
  return out
}

/**
 * How close two titles are, from 0 (nothing in common) to 1 (the same string).
 *
 * The Sørensen–Dice coefficient over character pairs: twice the pairs both titles have, divided by
 * how many pairs they have between them. Character pairs rather than words because the two real
 * duplicates differ by a word each ("block's" against "step's") and a word-set measure scores that
 * pair 0.55, below anything that could also be quiet. It is a few lines of arithmetic with no index
 * and no model, which is the point -- this had to be cheap enough to run on every create.
 */
function closenessOf(a: Map<string, number>, b: Map<string, number>): number {
  const total = sum(a) + sum(b)
  if (total === 0) return 0
  let shared = 0
  for (const [pair, count] of a) shared += Math.min(count, b.get(pair) ?? 0)
  return (2 * shared) / total
}

function sum(counts: Map<string, number>): number {
  let n = 0
  for (const count of counts.values()) n += count
  return n
}

/**
 * The live records whose titles are close to this one, closest first.
 *
 * ONE QUERY: the id, kind and title of every live record of the project that is not a block come
 * back in a single select, and the comparison is arithmetic over short strings. A length bound runs
 * first. Two titles whose lengths differ by more than the coefficient's own bound can never reach the
 * floor, so they are skipped before their pairs are built. How many that skips depends on how far the
 * project's titles spread in length, and it may be none. The bound is on the title as `titleWords`
 * gives it back, so it cannot be moved into the select: a title longer only in its punctuation would
 * be left out there.
 *
 * MEASURED THREE TIMES, because "one query" is a claim and not a number.
 *   - On 11 August 2026: filing a workspace's own 311 non-block titles one after another, so that
 *     the last create was measured against 310 stored records, cost 0.90 ms per create with this
 *     check and 0.51 ms without it. That workspace held 378 records after a year of use.
 *   - In a measurement, on a made-up office built to the live counts (18,799 live records),
 *     one call read all 18,799 rows. Over four runs of 25 titles a call took 22 to 63 ms, and each
 *     run's median was 43 to 46 ms. About 15 ms of a call was the select. The rest was the rows
 *     becoming objects and the comparison. That office's titles are made up, short and alike: for
 *     its own titles the bound skipped none of the candidates, and for titles of 33 to 47
 *     characters it skipped 54 to 100% of them.
 *   - In a measurement, on one project of a made-up office, with 35,550 live records, 164 of
 *     them blocks, over two runs of three sets of 10 titles. Before that round a call read 35,550
 *     rows, and its median was 89.4 and 91.5 ms: about 40 ms the select, 6 to 7 ms the rows becoming
 *     objects, and 43 to 44 ms the comparison. Leaving the blocks out of the select saved 164 rows
 *     and under 1 ms. The check against the floor before a candidate's pairs are built took the
 *     comparison to about 30 ms. After both, a call read 35,386 rows, and its median was 76.8 and
 *     78.4 ms. For 42 fixed titles the answers were the same records, in the same order, with the
 *     same closeness.
 *
 * BLOCKS ARE NEITHER REPORTED NOR ASKED ABOUT. A block's title is not chosen by whoever files it:
 * the server builds it as `<its pipeline's title> › <its own name>`, so two blocks of one pipeline
 * are similar because their pipeline is one pipeline, and a block is similar to its own pipeline by
 * construction. Measured on the real corpus, blocks produce 13 of the 24 pairs at this floor and
 * not one of them says anything. The question this report answers -- "has somebody already filed
 * this?" -- is a question about a title a caller chose.
 */
export function nearDuplicateTitles(title: string, workspaceId: string): SimilarTitle[] {
  const asked = titleWords(title)
  const mine = shingles(asked)
  const minePairs = sum(mine)
  if (minePairs === 0) return []

  // The bound: with |a| ≤ |b| pairs, the coefficient cannot exceed 2|a| / (|a| + |b|). So a
  // candidate longer than |a|(2 - floor)/floor, or shorter than the same the other way, is out
  // before its pairs are counted. The lengths below are characters of the title as `titleWords` gives
  // it back, one more than its pairs, and that only lets a few more candidates through to be compared.
  const stretch = (2 - NEAR_DUPLICATE_FLOOR) / NEAR_DUPLICATE_FLOOR
  const longest = asked.length * stretch
  const shortest = asked.length / stretch

  const found: SimilarTitle[] = []
  // THE BLOCKS ARE LEFT OUT BY THE SELECT, using the same condition the loop previously checked for each row. A
  // record's kind is never null, so `kind <> 'block'` keeps every row that test kept. THE ROWS COME BACK AS DRIZZLE
  // READ THEM, each an array of its three columns in the order selected, and no row is made into an object: at most
  // three are reported, and the statement and its rows are the ones `.all()` asked and mapped.
  const candidates = db
    .select({ id: records.id, kind: records.kind, title: records.title })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), isNull(records.deletedAt), ne(records.kind, BLOCK_KIND)))
    .values() as [string, string, string][]

  for (const [id, kind, title] of candidates) {
    const theirs = titleWords(title)
    if (theirs.length > longest || theirs.length < shortest) continue
    // THE FLOOR IS CHECKED BEFORE THE CANDIDATE'S PAIRS ARE COUNTED INTO A MAP OF THEIR OWN. A pair of the candidate is
    // shared while this title has one of it left, so `shared` is the sum `closenessOf` takes, and the number below is
    // its number: this leaves out exactly the candidates the floor leaves out. Few candidates come through it, and only
    // they are counted again by `closenessOf`, which gives the number reported.
    const usedOf = new Map<string, number>()
    let shared = 0
    for (let i = 0; i + 1 < theirs.length; i += 1) {
      const pair = theirs.slice(i, i + 2)
      const used = usedOf.get(pair) ?? 0
      if (used < (mine.get(pair) ?? 0)) {
        shared += 1
        usedOf.set(pair, used + 1)
      }
    }
    if ((2 * shared) / (minePairs + Math.max(0, theirs.length - 1)) < NEAR_DUPLICATE_FLOOR) continue
    const closeness = closenessOf(mine, shingles(theirs))
    if (closeness < NEAR_DUPLICATE_FLOOR) continue
    found.push({ id, kind: kind as RecordKind, title, closeness })
  }

  return found.sort((a, b) => b.closeness - a.closeness).slice(0, NEAR_DUPLICATES_REPORTED)
}

/**
 * The sentence a create leads with when something very like it is already filed.
 *
 * It names the records and their ids, because the next thing the caller wants to do is read one --
 * and it says plainly that the write went through, so that nobody reads this as a refusal.
 */
export function describeSimilar(recordId: string, similar: readonly SimilarTitle[]): string {
  const each = similar.map((s) => `${s.kind} ${s.id} "${s.title}"`).join('; ')
  const one = similar.length === 1
  return (
    `Stored, and something very like it is already here: ${one ? 'one record' : `${similar.length} records`} ` +
    `in this workspace ${one ? 'has' : 'have'} a title this close to yours — ${each}. ` +
    `Nothing was refused and nothing was merged. This is Mole Office saying what is already filed, because ` +
    `two agents writing one fact in different words is invisible to a check on the exact title. ` +
    `Read ${one ? 'it' : 'them'} with GET /api/records/<id>. If yours says the same thing, ` +
    `DELETE /api/records/${recordId} and add to the one that exists; if it says something different, ` +
    `POST /api/links {"fromId":"${recordId}","toId":"<the other>","type":"relates_to"} so the next reader ` +
    `does not have to work the difference out twice.`
  )
}
