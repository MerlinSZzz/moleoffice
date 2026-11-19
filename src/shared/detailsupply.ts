// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SETTINGS PAGE'S DETAIL GRID COUNTS, WORKED OUT IN ONE PLACE FOR THE SERVER AND THE PAGE.
 *
 * The grid on the Settings page (src/web/components/DetailSays.tsx) draws, under each position, how
 * many records have that length written of how many could, the records with a place and nothing in
 * it, and one real record per row to preview. It used to read every record of the project to work
 * that out in the browser: 134 MB at the live size. `GET /api/records/detail-supply` now works it out
 * on the server with the functions below, and the page draws the answer. The page and the server
 * import this one file, so the count the server sends and the count a test works out from a list of
 * records cannot disagree.
 */
import { detailSourceOf } from './detailsource.ts'
import { DETAIL_KINDS_DRAWN, DETAIL_ROWS, detailOf, RUNGS, type DetailAnswer, type DetailRow, type DetailSource, type Rung } from './detail.ts'
import type { WordKey } from './i18n.ts'
import { formsWrittenIn } from './zoom.ts'
import type { PanelRecord } from './types.ts'

/** One position of the counter row: how many records have this written, of how many could. */
export interface Supply {
  rung: Rung
  /** Records with a place for this position and something written in it. */
  written: number
  /** Records with a place for this position at all. */
  possible: number
  /** The records with a place and nothing in it, so the worklist is the count's own evidence. */
  unwritten: PanelRecord[]
  /** WHAT THE DENOMINATOR IS, in the grid's own words, so a reader is not left counting. */
  countedOver: WordKey
}

/**
 * WHICH RECORDS ARE IN ONE POSITION'S DENOMINATOR, AND THE SENTENCE THAT SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * THE LABEL AND THE BY-PART STRUCTURE BELONG TO REPORTS
 * ---------------------------------------------------------------------------------------
 *
 * `data.shortForms` is declared on modules as well as reports, so the denominator at those four
 * positions used to be both kinds and the *Unwritten* list offered a module as work to do. Nobody
 * writes a label or a by-part summary of a module: those four positions are what a report is read
 * at. So the denominator is the reports, and this sentence says it on the grid rather than leaving
 * a reader to work out what 3 of 43 was counted over.
 *
 * ---------------------------------------------------------------------------------------
 * LENGTHS 2 AND 3 ARE EVERY RECORD, BECAUSE EVERY RECORD HAS THOSE COLUMNS
 * ---------------------------------------------------------------------------------------
 *
 * They are the record's own title and its own summary since 3 September 2026 — criterion A14b — and
 * every kind has both columns, so every record has a place for them. That is what the resolver
 * already answers, and it is why those two rows are not filtered here.
 */
const COUNTED_OVER = {
  label: 'settingsPanel.detail.countedOver.label',
  title: 'settingsPanel.detail.countedOver.title',
  gist: 'settingsPanel.detail.countedOver.gist',
  outline: 'settingsPanel.detail.countedOver.byPart',
  sketch: 'settingsPanel.detail.countedOver.byPart',
  digest: 'settingsPanel.detail.countedOver.byPart',
  full: 'settingsPanel.detail.countedOver.full',
} as const satisfies Record<Rung, WordKey>

/** True where this position's denominator is the reports and not every record with a place for it. */
function reportsOnly(rung: Rung): boolean {
  return rung !== 'full' && rung !== 'title' && rung !== 'gist'
}

/**
 * COUNT THE SUPPLY WITH THE READERS THE SCREEN USES, never with a rule written a second time here.
 *
 * ---------------------------------------------------------------------------------------
 * THE DENOMINATOR IS THE RESOLVER'S ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * A record is OUT of a position's denominator when the resolver answers `notOnThisKind` — that kind
 * has no place for that length, so nobody should write one. It is IN the denominator and out of the
 * numerator when nobody has written one. Those are exactly what `detailOf` already distinguishes,
 * which is why this function does not know what a short form is or which kinds declare one.
 *
 * ---------------------------------------------------------------------------------------
 * THE NUMERATOR IS `formsWrittenIn`, AND IT USED TO BE THE RESOLVER TOO
 * ---------------------------------------------------------------------------------------
 *
 * Levels 4, 5 and 6 are written BY PART: a heading and two texts for each part of the report. There
 * is no single string for the resolver to hand back, so it steps over those three lengths, and a
 * counter reading `drew === rung` off it counted every one of them as unwritten. It read **0 of 43**
 * at all three, on a corpus where all 26 reports draw between four and twenty-four written parts at
 * each of them, and its *Unwritten* worklist offered those reports as work still to do. Problem
 * `gzRwiq38pp7v`.
 *
 * `formsWrittenIn` in @shared/zoom.ts is the one list of which lengths a record has words
 * for, and the report page draws from it. The grid takes the same list, so it cannot say a length
 * is unwritten while the page draws it.
 *
 * FULL IS NOT ON THAT LIST and is asked of the resolver here. Full is the record itself rather than
 * a form somebody wrote, so there is no shorter form of it to be missing; `drew === 'full'` is the
 * resolver saying the record has a body and it is written.
 */
export function supplyOf(records: readonly PanelRecord[]): Supply[] {
  return supplyWith(records, answersAt)
}

/** A record's answer at every position, in the order of `RUNGS`. */
function answersAt(source: DetailSource): DetailAnswer[] {
  return RUNGS.map((rung) => detailOf(source, rung))
}

/**
 * `supplyOf`, with each record's answers worked out by `answersOf`, so the grid's answer can keep
 * how many different answers each record gave for the preview choice instead of asking again.
 */
function supplyWith(records: readonly PanelRecord[], answersOf: (source: DetailSource, record: PanelRecord) => readonly DetailAnswer[]): Supply[] {
  const supply: Supply[] = RUNGS.map((rung) => ({ rung, written: 0, possible: 0, unwritten: [], countedOver: COUNTED_OVER[rung] }))
  for (const record of records) {
    const source = detailSourceOf(record)
    const answers = answersOf(source, record)
    let forms: ReturnType<typeof formsWrittenIn> | null = null
    supply.forEach((one, at) => {
      // THE LABEL AND THE THREE BY-PART LENGTHS ARE COUNTED OVER THE REPORTS. See `COUNTED_OVER`.
      // It was every kind that declares `shortForms`, which put 27 modules nobody intends to label
      // into the denominator and into the *Unwritten* worklist beside them.
      if (reportsOnly(one.rung) && record.kind !== 'report') return
      const answer = answers[at]!
      if (answer.kind === 'nothing') return
      if (answer.gap === 'notOnThisKind') return
      one.possible += 1
      const has =
        one.rung === 'full' ? answer.drew === 'full' : (forms ??= formsWrittenIn(source)).some((form) => form.rung === one.rung)
      if (has) one.written += 1
      else one.unwritten.push(record)
    })
  }
  return supply
}

/**
 * THE RECORD THE PREVIEW DRAWS. A REAL ONE, CHOSEN THE SAME WAY EVERY TIME.
 *
 * It is the record whose six positions give the most DIFFERENT answers, with the lowest id winning
 * a tie. That is deliberate and it is not cherry-picking: a preview is for learning what the
 * positions mean, and a record that answers all six with the same sentence teaches nothing. The
 * counter row two lines below says how rare such a record is, so nothing here implies the corpus is
 * richer than it is.
 */
export function previewRecord(records: readonly PanelRecord[], row: DetailRow): PanelRecord | null {
  return bestOf(byId(records), row, (record) => answersGivenBy(answersAt(detailSourceOf(record))))
}

/** The records in the order the preview choice walks them, lowest id first, so the lowest id wins a tie. */
function byId(records: readonly PanelRecord[]): PanelRecord[] {
  return [...records].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** How many different answers a record gives across the positions, which is what the preview choice ranks by. */
function answersGivenBy(answers: readonly DetailAnswer[]): number {
  return new Set(
    answers.map((answer) => {
      return answer.kind === 'text' ? answer.text : `${answer.kind}:${String(answer.kind === 'body' ? answer.field : '')}`
    }),
  ).size
}

/** The record of `sorted` that this row's surface draws and that gives the most different answers. */
function bestOf(sorted: readonly PanelRecord[], row: DetailRow, answers: (record: PanelRecord) => number): PanelRecord | null {
  // WHICH RECORDS THIS ROW'S SURFACE ACTUALLY DRAWS. `Report content` draws reports and `Module
  // cards` draws modules, so previewing either with whatever the corpus sorted first would be an
  // example of a screen a person never sees. Where a surface draws every kind — Home ranks all of
  // them — the filter is null and any record can stand for it.
  const only = row === 'everywhere' ? null : DETAIL_KINDS_DRAWN[row]
  let best: PanelRecord | null = null
  let bestCount = -1
  for (const record of sorted) {
    if (only !== null && !only.includes(record.kind)) continue
    const count = answers(record)
    if (count > bestCount) {
      best = record
      bestCount = count
    }
  }
  return best
}

/** How many of a position's unwritten records the grid lists when its count is opened. */
export const UNWRITTEN_LISTED = 40

/** One position of the counter row as the server sends it: the counts, and the first records it lists. */
export interface DetailSupplyPosition {
  rung: Rung
  written: number
  possible: number
  /** How many records have a place for this position and nothing in it. */
  unwritten: number
  /** The first `UNWRITTEN_LISTED` of them, in the order the count met them: what the opened list draws. */
  listed: { id: string; title: string }[]
  countedOver: WordKey
}

/** What `GET /api/records/detail-supply` answers, and everything the grid draws from the project's records. */
export interface DetailSupply {
  /** How many records were counted: the records `GET /api/records` lists for this reader. */
  counted: number
  /** One entry per position, in the order of `RUNGS`. */
  positions: DetailSupplyPosition[]
  /** The record each row previews, by row, or null where no record is of a kind that row draws. */
  samples: Record<DetailRow, PanelRecord | null>
}

/** The grid's answer from a list of records. The server calls this; so does a test that has the records. */
export function detailSupplyOf(records: readonly PanelRecord[]): DetailSupply {
  // EACH RECORD'S SEVEN ANSWERS ARE WORKED OUT ONCE, in the one walk that counts them, and only how
  // many of them differ is kept for the eleven rows' preview choice. Worked out again for each row,
  // the preview choice alone took 2 s on an office of 36,000 records; worked out once for the counts
  // and once more for the preview, the two took 430 ms.
  const counts = new Map<PanelRecord, number>()
  const supply = supplyWith(records, (source, record) => {
    const answers = answersAt(source)
    counts.set(record, answersGivenBy(answers))
    return answers
  })
  const answers = (record: PanelRecord): number => counts.get(record)!
  const sorted = byId(records)
  return {
    counted: records.length,
    positions: supply.map((one) => ({
      rung: one.rung,
      written: one.written,
      possible: one.possible,
      unwritten: one.unwritten.length,
      listed: one.unwritten.slice(0, UNWRITTEN_LISTED).map((record) => ({ id: record.id, title: record.title })),
      countedOver: one.countedOver,
    })),
    samples: Object.fromEntries(DETAIL_ROWS.map((row) => [row, bestOf(sorted, row, answers)])) as Record<DetailRow, PanelRecord | null>,
  }
}
