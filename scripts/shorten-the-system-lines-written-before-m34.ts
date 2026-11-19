// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUT THE SHORT WORDS ON THE SYSTEM LINES THAT WERE WRITTEN BEFORE THERE WERE ANY. Run once.
 *
 *   npx tsx scripts/shorten-the-system-lines-written-before-m34.ts            # say what it would do
 *   npx tsx scripts/shorten-the-system-lines-written-before-m34.ts --do-it    # do it
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M34 shortened what Mole Office WRITES, not what it DRAWS. A line written since carries a
 * few words in `body` and the whole sentence in `saidInFull`, and the conversation draws the body
 * with the sentence as its hover text. A line written before the change stored the long sentence as
 * its body and has no `saidInFull` at all, so the block draws three sentences and the hover is
 * empty. The system messages are too long. The ones that were being read then are the ones still
 * long. Problem `TGpaH7XhhPLJ`.
 *
 * Counted on a copy of the live database on 5 September 2026: 2 of 6 system lines in this project.
 * It does not grow — every line written since the change is already short.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT MAKE THE DRAWING SHORTEN A LONG BODY INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * Because then the rule for how long a system line is would live in the browser as well as in the
 * writer, and the two could disagree — the defect CLAUDE.md names as this repository's own. The
 * rows are wrong, so the rows are what is put right.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH SHAPE A LONG SENTENCE BELONGS TO IS WORKED OUT FROM `SYSTEM_LINES`, NOT TYPED OUT HERE
 * ---------------------------------------------------------------------------------------
 *
 * Every line Mole Office writes is declared once, in `SYSTEM_LINES` in src/shared/groups.ts, as a
 * few words plus a sentence. Some of those are built with values in them — a name, a number of
 * minutes — so the same shape makes many sentences.
 *
 * This builds each shape TWICE with different values and keeps what does not change: the common
 * beginning and the common end. A stored sentence belongs to that shape when it starts with the one
 * and ends with the other. Nothing is parsed out of it and nothing is retyped here, so a shape whose
 * wording is edited is still matched, and a shape this cannot place is reported rather than guessed.
 *
 * A SHAPE THAT CANNOT BE IDENTIFIED THIS WAY IS NOT REPAIRED, and a row of that shape is reported
 * rather than guessed at. Two kinds cannot: one whose sentence has nothing fixed in it at all, and
 * one whose short words hold a name that is not in the sentence — "<name> joined the group" — where
 * writing the words would mean inventing the name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It touches only messages titled as a system line whose `saidInFull` is missing and whose body
 * matches a shape. Nothing anybody wrote is touched: a system line is Mole Office's own text, and
 * the sentence it stored is kept exactly as it stands — it moves into `saidInFull`, where a reader
 * still sees it. Running it twice writes nothing the second time.
 */

import { sqlite } from '../src/server/db/client.ts'
import { SYSTEM_LINES, SYSTEM_LINE_TITLE, type SystemLine } from '../src/shared/groups.ts'
import { THE_OFFICES_OWN_LINE, patchRecord } from '../src/server/lib/records.ts'

const doIt = process.argv.includes('--do-it')

/** What a shape looks like once it is built: what never changes, and the words it draws. */
interface Shape {
  name: string
  /** What every sentence of this shape begins with. */
  starts: string
  /** What every sentence of this shape ends with. */
  ends: string
  /** The few words to draw. */
  line: string
}

/** Two sets of stand-in values, so building a shape twice shows what does not change in it. */
const FIRST = ['A', 1, 'A'] as const
const SECOND = ['B', 2, 'B'] as const

const commonStart = (a: string, b: string): string => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  return a.slice(0, i)
}
const commonEnd = (a: string, b: string): string => {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1
  return a.slice(a.length - i)
}

const isSystemLine = (value: unknown): value is SystemLine =>
  typeof value === 'object' && value !== null && 'line' in value && 'said' in value

/** Build one entry of `SYSTEM_LINES` with a set of stand-in values, or null if it is not a line. */
function build(entry: unknown, args: readonly unknown[]): SystemLine | null {
  if (isSystemLine(entry)) return entry
  if (typeof entry !== 'function') return null
  const made = (entry as (...rest: unknown[]) => unknown)(...args.slice(0, entry.length))
  return isSystemLine(made) ? made : null
}

/**
 * Build one entry twice with the stand-in values, or null when they are not the kind of values it
 * takes. A FEW LINES TAKE MORE THAN A NAME OR A NUMBER: `theRunsAStopCauseStopped` takes the list
 * of runs a cause stopped, and a stand-in string where that list belongs throws. A line whose
 * values the stand-ins cannot supply is one this tool cannot identify, and a row of that shape is
 * reported rather than guessed at — the same answer this file already gives a line that has nothing
 * fixed in it.
 */
function buildTwice(entry: unknown): [SystemLine, SystemLine] | null {
  try {
    const one = build(entry, FIRST)
    const two = build(entry, SECOND)
    // THE SENTENCE MUST REALLY BE A STRING. The stand-in values are a bare string and a bare number,
    // and a line that takes its second value as a sentence gets the number, which is no sentence at
    // all. That is the same answer as any other line the stand-ins cannot supply: this tool cannot
    // identify it, and it is reported rather than guessed at. Checking here rather than after
    // `commonStart` is what keeps a line the stand-ins cannot build from taking the tool down.
    if (one === null || two === null) return null
    if (typeof one.said !== 'string' || typeof two.said !== 'string') return null
    return [one, two]
  } catch {
    return null
  }
}

const shapes: Shape[] = []
for (const [name, entry] of Object.entries(SYSTEM_LINES)) {
  const built = buildTwice(entry)
  if (built === null) continue
  const [one, two] = built
  if (one.said === null || two.said === null) continue
  const starts = commonStart(one.said, two.said)
  const ends = commonEnd(one.said, two.said)
  // A SHAPE WITH NOTHING FIXED IN IT IDENTIFIES NOTHING. `memberAdded` is the whole of that case:
  // its sentence is "<name> was added to this group. <because>", so two builds share no first
  // character and no last one, and an empty beginning and an empty end would match every sentence
  // there is.
  if (starts === '' && ends === '') continue
  // AND A SHAPE WHOSE SHORT WORDS CHANGE WITH THE VALUES CANNOT BE RECOVERED EITHER. "<name> joined
  // the group" holds a name that is not in the sentence, and writing one would mean inventing it.
  // Both kinds are left out here, and a row of either kind is then reported as one no shape matches,
  // which is what it is.
  if (one.line !== two.line) continue
  shapes.push({ name, starts, ends, line: one.line })
}

interface Row {
  id: string
  workspace_id: string
  created_at: string
  body: string | null
}

const rows = sqlite
  .prepare(
    "SELECT id, workspace_id, created_at, json_extract(data, '$.body') AS body FROM records " +
      "WHERE kind = 'message' AND deleted_at IS NULL AND title = ? " +
      "AND json_extract(data, '$.saidInFull') IS NULL ORDER BY created_at",
  )
  .all(SYSTEM_LINE_TITLE) as Row[]

if (rows.length === 0) {
  console.log('Every line Mole Office wrote in this database already carries its whole sentence. Nothing to write.')
  process.exit(0)
}

console.log(
  `${String(rows.length)} line(s) Mole Office wrote carry no sentence behind them:` +
    (doIt ? '' : '\n(saying only — run again with --do-it to write them)'),
)

/**
 * WHOSE ACT THIS IS. It is Mole Office putting its own words right, and the record says so rather
 * than putting the change under a person who never made it.
 */
const ACTOR = { type: 'agent', id: 'mole-office/the-api-server' } as const

let written = 0
let unplaced = 0
for (const row of rows) {
  const body = row.body ?? ''
  // THE SHAPE WITH THE MOST OF ITSELF IN THIS SENTENCE, and only if nothing else fits as well. A
  // sentence two shapes fit equally is one this cannot place, and placing it anyway would be a
  // guess about somebody's screen.
  const fits = shapes
    .filter((one) => body.startsWith(one.starts) && body.endsWith(one.ends) && body.length > one.starts.length)
    .sort((a, b) => b.starts.length + b.ends.length - (a.starts.length + a.ends.length))
  const shape = fits[0]
  const second = fits[1]
  if (shape === undefined) {
    unplaced += 1
    console.log(`  ${row.id}  ${row.created_at}\n      no shape in SYSTEM_LINES matches it, so it is left alone`)
    continue
  }
  if (
    second !== undefined &&
    second.starts.length + second.ends.length === shape.starts.length + shape.ends.length
  ) {
    unplaced += 1
    console.log(
      `  ${row.id}  ${row.created_at}\n` +
        `      "${shape.name}" and "${second.name}" fit it equally well, so it is left alone`,
    )
    continue
  }
  if (body === shape.line) continue
  if (!doIt) {
    console.log(`  ${row.id}  ${row.created_at}\n      would become "${shape.line}", with what it says now behind it`)
    continue
  }
  // THE PRODUCT'S OWN DOOR, so the revision ledger and the change log say this happened. A hand
  // edit of the row would leave the record saying one thing and its history another.
  //
  // A MERGE AND NOT A WHOLE `data`. These rows also carry `to`, `sentBy` and `aboutRun`, and a
  // wholesale write would empty all three. The door refuses that outright, which is how this was
  // caught rather than by reading the rows afterwards.
  // THE OFFICE REWRITING ITS OWN LINE, which is the one change to a notice from Mole Office anything may
  // make. It is `THE_OFFICES_OWN_LINE` in lib/records/record-patch.ts.
  patchRecord(row.id, { dataPatch: { body: shape.line, saidInFull: body }, [THE_OFFICES_OWN_LINE]: true }, ACTOR)
  written += 1
  console.log(`  ${row.id}  ${row.created_at}\n      now reads "${shape.line}", with what it said behind it`)
}

console.log(
  doIt
    ? `${String(written)} line(s) shortened. ${String(unplaced)} could not be placed and were left alone.`
    : `Nothing was written. ${String(unplaced)} of the ${String(rows.length)} could not be placed.`,
)
