// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED RECORD, AS THE DETAIL RESOLVER NEEDS TO SEE IT.
 *
 * `detailOf` in `src/shared/detail.ts` refuses to read a database, and that is deliberate: it runs
 * in the browser and on the server, and it never cuts, generates or guesses. It takes a
 * `DetailSource` — a handful of stored fields, exactly as stored. This file is the one place a
 * `PanelRecord` becomes one, so eleven surfaces cannot each decide for themselves what a record's
 * body is or which kinds have a place for a short form.
 *
 * EVERY FIELD HERE IS READ, NEVER COMPUTED. Nothing is shortened on the way in — a caller that
 * trimmed a title before passing it would have moved the cut the resolver refuses to make.
 *
 * WHICH KINDS HAVE A BODY AND WHICH DECLARE SHORT FORMS ARE BOTH READ OFF `kinds.ts`, never listed
 * here. `blocksFieldOf` finds the field whose declared type is `SummaryBlock[]`; the short-forms
 * field is found by its declared key. A third kind that gains either one arrives here with no edit,
 * which is the point — the alternative is a list of kind names in a component, and this repository
 * has already paid for three of those.
 */
import { blocksFieldOf, kindDeclaresShortForms } from './kinds.ts'
import { SHORT_FORM_LEVELS, SHORT_FORMS_FIELD } from './zoom.ts'
import {
  detailOf,
  theRecordsOwnWords,
  type DetailNothing,
  type DetailSource,
  type DetailText,
  type Rung,
} from './detail.ts'
// THE PROSE OF A RECORD'S BLOCKS, read the way every other reader of it reads it.
import { proseOfBlocks } from './waitingclaims.ts'
import { RECORD_KINDS, type PanelRecord, type SummaryBlock } from './types.ts'

/** Where a record says whether its title was cut from its own prose. */
const TITLE_DERIVED_FIELD = 'titleDerived'

/**
 * EVERY FIELD OF A RECORD'S `data` THAT `detailSourceOf` READS, AND NO OTHER.
 *
 * A reader that turns every record of a project into a detail source, as the Settings page's detail
 * grid does, asks the database for these fields alone and not for the rest of each record. The blocks
 * fields are read off `kinds.ts` by `blocksFieldOf`, as `detailSourceOf` reads them, so a kind that
 * gains one is read here with no edit.
 */
export const THE_DATA_FIELDS_A_DETAIL_SOURCE_READS: readonly string[] = [
  SHORT_FORMS_FIELD,
  TITLE_DERIVED_FIELD,
  ...new Set(RECORD_KINDS.flatMap((kind) => blocksFieldOf(kind) ?? [])),
]

/**
 * The record as the resolver sees it.
 *
 * `titleDerived` is passed through UNCHANGED and is left out where the record does not carry it.
 * Left out means NOBODY RECORDED whether the title was cut, which is the truth about every record
 * in this corpus today. Sending `false` instead would be this file inventing the distinction the
 * contract forbids.
 */
export function detailSourceOf(record: PanelRecord): DetailSource {
  const data = (record.data ?? {}) as Record<string, unknown>
  const blocksField = blocksFieldOf(record.kind)
  const derived = data[TITLE_DERIVED_FIELD]
  const blocks = blocksField === null ? null : data[blocksField]
  const body =
    blocksField === null || !Array.isArray(blocks)
      ? null
      : { field: `data.${blocksField}`, prose: proseOfBlocks(blocks as readonly SummaryBlock[]) }

  return {
    title: record.title,
    summary: record.summary,
    shortForms: data[SHORT_FORMS_FIELD],
    declaresShortForms: kindDeclaresShortForms(record.kind),
    ...(typeof derived === 'boolean' ? { titleDerived: derived } : {}),
    body:
      blocksField === null
        ? null
        : { field: `data.${blocksField}`, written: Array.isArray(blocks) && (blocks as unknown[]).length > 0 },
    // HOW LONG THE RECORD'S OWN CONTENT IS, so `rungsFor` can stop the ladder at it. WHICH TEXT
    // that is, is decided in `theRecordsOwnWords` and not here: the write door asks the same
    // question of the same record, and two answers to it would be this repository's oldest defect.
    ownWords: theRecordsOwnWords({ body, summary: record.summary ?? null, title: record.title }).words,
  }
}

/**
 * THE WORDS A ROW DRAWS, WHEN THE POSITION ASKED FOR IS THE RECORD'S OWN CONTENT.
 *
 * A row of a list is a line of text. `Full` is not a line of text — it is a report's blocks, a
 * module's summary, a whole thing. So a list asked to say `Full` cannot draw what it was asked for,
 * and this is the one place that decides what it draws instead.
 *
 * IT NEVER CUTS THE BODY DOWN. It asks the resolver for the LONGEST length anybody actually wrote,
 * shortest-last, and takes the first that somebody wrote at that length. Every character still comes
 * out of a stored field, and the answer still says which one, so a surface can mark it. Where
 * nobody wrote any short form, the title column answers, which it always can.
 *
 * The alternative — cutting the body to fit the row — is the thing this whole axis exists to stop.
 */
export function wordsAt(record: PanelRecord, rung: Rung): DetailText | DetailNothing {
  const source = detailSourceOf(record)
  const answer = detailOf(source, rung)
  if (answer.kind !== 'body') return answer
  // LONGEST FIRST, AND THE LIST IS THE DECLARATION READ BACKWARDS RATHER THAN TYPED OUT. It was
  // typed out, and the day a sixth length was declared this walk would have skipped it silently:
  // a row asked for the whole thing would have drawn the brief while an account sat unread beside
  // it, with the answer naming a field that was not the longest one written.
  for (const shorter of [...SHORT_FORM_LEVELS].reverse()) {
    const written = detailOf(source, shorter)
    if (written.kind === 'text' && written.drew === shorter) return written
  }
  // The title column is NOT NULL, so this answers for every record that has one; where it is blank
  // the resolver says `nothing` and the caller says so rather than drawing an empty line.
  const last = detailOf(source, 'title')
  return last.kind === 'body' ? { kind: 'nothing', asked: rung, why: 'theTitleColumnIsBlank' } : last
}
