// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `How much each thing says` — THE SETTINGS PANEL FOR THE DETAIL AXIS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ON THE SCREEN
 * ---------------------------------------------------------------------------------------
 *
 *                          Level 1  Level 2  Conclusion  Level 4  Level 5  Level 6  Full
 *     Everywhere              ·        ·         ●          ·        ·        ·      ·
 *     ──────────────────────────────────────────────────────────────────────────────────
 *     Home cards              ·        ·         ○          ·        ·        ·      ·
 *     Review pane             ·        ●         ·          ·        ·        ·      ·
 *     … eight more rows …
 *     ──────────────────────────────────────────────────────────────────────────────────
 *                             1       541       430         0        0        0      7
 *                           /541     /541      /541       /33      /33      /33    /33
 *
 * ---------------------------------------------------------------------------------------
 * NO WORD ON THE SCREEN NAMES THE AXIS, AND THAT IS A RULE RATHER THAN A STYLE
 * ---------------------------------------------------------------------------------------
 *
 * The seven positions are drawn in the words the report's own level control uses, and nothing else
 * — `levelLabel` in shared/detail.ts is the one place that decides them, so this page and that
 * control cannot come to two names for one position. They used to be drawn as bare numerals here,
 * and the two disagreed about the third: the grid said `3` where the control said `Conclusion`.
 *
 * The phrases — `a few words`, `one line`, `the report's outline, one line per part` — stay in
 * accessible names, where a screen reader and a hover find them and a page of ordinary reading does
 * not. Two reasons, and neither is taste:
 *
 *   the word `Detail` already belongs to the composer's fold, and two controls may not share a
 *   word; and every name anybody proposed for the axis itself was either a density word this
 *   product has already spent (`Compact`) or five words trying to name seven things.
 *
 * ---------------------------------------------------------------------------------------
 * THREE GLYPH SHAPES CARRY THE WHOLE PRECEDENCE MODEL, WITH NO PROSE
 * ---------------------------------------------------------------------------------------
 *
 *   `·`  nothing chosen at this position
 *   `○`  this is what the row resolves to, and something above it decided — the Everywhere row,
 *        what the thing being read asks for, or Mole Office's own setting
 *   `●`  set here, on this row
 *
 * Shape carries it. The accent on `●` is this contract's one permitted accent job — the chosen
 * segment of a control — and a ring keeps it legible with the colour removed.
 *
 * ---------------------------------------------------------------------------------------
 * THE PREVIEW FOLLOWS THE CELL, NOT THE ROW, AND THAT IS THE POINT OF THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * A person must SEE what a level means rather than read about it. A preview that followed the
 * ROW would mean learning what position 4 says required pressing 4 — which sets it. So hovering or
 * focusing a cell draws what a real record from this corpus says at that position, without setting
 * anything. Positions that resolve to the same words for the record on screen are dimmed, because
 * many of them are aliases for most records — four of six, measured on this corpus while the ladder
 * still had six — and pressing one position and then the next would otherwise leave the same screen
 * with no explanation.
 *
 * ---------------------------------------------------------------------------------------
 * THE COUNTER ROW IS THIS CAMPAIGN'S OWN HONESTY GATE
 * ---------------------------------------------------------------------------------------
 *
 * It is computed by the SAME resolver the screen uses, over the records this project holds, so a
 * repair that wires every reader up without moving any supply leaves `1/541` where the owner can
 * see it. The column's own label is the label: no rung name, no storage word, no second name for a
 * position.
 *
 * `Unwritten (n) →` at the end of it opens the list of records that have a place for that position
 * and nothing written in it. It is a control drawn at rest, not a link hidden on a jargon noun.
 */
import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { kindWord } from '@shared/words.ts'
import { DETAIL_ROW_WORDS as ROW_NAMES, DETAIL_PHRASE_WORDS as PHRASE_KEYS, DETAIL_LEVEL_WORDS as LEVEL_KEYS } from '@shared/detail-setting-words.ts'
import {
  asReaderRung,
  DETAIL_DRAWS,
  expectedUnread,
  FLOORED_KIND,
  FLOORED_SURFACE,
  isReaderRung,
  isRung,
  readerFloorApplies,
  RUNGS,
  type DetailDecider,
  type DetailSurface,
  type Rung,
  type RungChoice,
} from '@shared/detail.ts'
import { DETAIL_READERS } from '@shared/detail-readers.generated.ts'
import { readerSees, type Reader } from '@shared/audience.ts'
import { InReachMark, useReach } from './InReach.tsx'
import { blocksFieldOf } from '@shared/kinds.ts'
import { reportAt } from '@shared/reportrungs.ts'
import type { PanelRecord, SummaryBlock } from '@shared/types.ts'
import { api } from '../api.ts'
import {
  DETAIL_ROWS,
  detailStorageFault,
  setDetailFor,
  storedFor,
  useDetailAll,
  type DetailRow,
} from '../lib/detailchoice.ts'
import { detailSourceOf, wordsAt } from '@shared/detailsource.ts'
import { previewRecord, supplyOf, type DetailSupply, type DetailSupplyPosition } from '@shared/detailsupply.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect, useReader } from '../lib/mode.ts'
import { recordPath, RouteLink } from './router.tsx'
import { SummaryBlocks } from './SummaryBlocks.tsx'
import { Absence, Loading } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** The mark drawn in one cell. Three shapes, and they are the whole precedence model. */
type Mark = 'none' | 'inherited' | 'here'

const GLYPH: Record<Mark, string> = { none: '·', inherited: '○', here: '●' }

function rowName(row: DetailRow): string {
  return t(ROW_NAMES[row])
}

/** Why a row resolves where it does. The English is each `DETAIL_PRECEDENCE` entry's `why`, read by en.ts. */
const WHY_KEYS = {
  here: 'settingsPanel.detail.why.here',
  thisSurface: 'settingsPanel.detail.why.thisSurface',
  everywhere: 'settingsPanel.detail.why.everywhere',
  recommended: 'settingsPanel.detail.why.recommended',
  default: 'settingsPanel.detail.why.default',
} as const satisfies Record<DetailDecider, WordKey>

/** What a screen reader says for a cell: the row, the position, and what that length is. */
function cellName(row: DetailRow, rung: Rung): string {
  return t('settingsPanel.detail.cellName', { row: rowName(row), level: columnLabel(rung), phrase: t(PHRASE_KEYS[rung]) })
}

/** A cell's name with one more fact after it. */
function cellWith(row: DetailRow, rung: Rung, note: string): string {
  return t('settingsPanel.detail.cellWith', { cell: cellName(row, rung), note })
}

/**
 * WHETHER THIS CELL IS A POSITION A PERSON CAN CHOOSE.
 *
 * Everywhere on this grid it is, except levels 1 and 2 on the Report content row: a person reads a
 * report no lower than the conclusion, which is `READER_FLOOR` in shared/detail.ts and the owner's
 * decision of 3 September 2026. Criterion A19. The other nine rows still offer all seven, because a
 * label is exactly what a row of a list, a card and a graph node are for.
 *
 * IT ASKS `readerFloorApplies` WITH `FLOORED_KIND`, WHICH IS THE KIND THIS ROW IS NAMED FOR. The
 * floor is for a report and for nothing else, and this row is the one
 * a report page reads. The same row also sets how much a module's curated summary says, and a
 * module is not floored; the row's own words below say so, because one row governing two kinds is a
 * fact a person setting it needs, and a second row for the same stored value would be two controls
 * over one setting.
 */
function notAReadingChoice(row: DetailRow, rung: Rung): boolean {
  return row !== 'everywhere' && readerFloorApplies(row, FLOORED_KIND) && !isReaderRung(rung)
}

/** What the grid says about a position it counts but nobody reads a report at. Its own words. */
const NOT_A_READING_CHOICE = 'settingsPanel.detail.notAReadingChoice'

/**
 * WHY THE TWO SHORTEST COLUMNS ARE STILL HERE, AND WHO THE FLOOR IS FOR. It hangs on the counter
 * cells and on the two cells of the Report content row, which are the places the question comes up.
 */
const WHY_THE_COLUMN_STAYS = 'settingsPanel.detail.whyColumnStays'

/**
 * WHAT IS DRAWN IN THE HEADER ABOVE EACH COLUMN: the words the report's own level control uses.
 *
 * IT WAS `positionLabel`, WHICH DRAWS THE BARE NUMERAL, and the two disagreed about one position:
 * the grid said `3` where the control said `Conclusion`. Criterion A18 asks that the settings page
 * and the control name the same seven, and two functions naming one ladder is the defect this
 * repository keeps producing — nothing failed while they differed, and nothing would have failed if
 * they had differed about more.
 *
 * `positionLabel` STAYS, because the numeral is still the right answer somewhere else: it is what
 * `levelLabel` counts with, and it is drawn on the axis of the control itself. What is gone is this
 * file having an opinion of its own about what a position is called.
 */
/** `levelLabel` in the page language: en.ts reads each English word from `levelLabel` itself. */
function columnLabel(rung: Rung): string {
  return t(LEVEL_KEYS[rung])
}

// ------------------------------------------------------------------- what the corpus holds

/**
 * THE COUNTS AND THE PREVIEW RECORDS ARE WORKED OUT IN src/shared/detailsupply.ts, by the server for
 * this panel and by a test from a list of records. Exported again here for the tests that read them.
 */
export { previewRecord, supplyOf }

/**
 * WHAT THE PREVIEW BOX DRAWS FOR ONE POSITION OF ONE ROW.
 *
 * Three shapes, because a surface has three things it can put on a screen: stored words, the
 * record's own content, or — for the 0 records in this corpus whose title column is blank —
 * nothing at all. The one it must never draw is a fourth: the NAME of a stored field. That is what
 * shipped on 19 August, and `data.blocks` was on screen at three of the six positions.
 */
export type Preview =
  | { shows: 'words'; text: string; drew: Rung; asked: Rung; field: string }
  | { shows: 'content'; drew: Rung; asked: Rung; field: string; blocks: SummaryBlock[] }
  | { shows: 'nothing'; drew: Rung; asked: Rung }

/**
 * WHAT A REPORT DRAWS AT ONE POSITION, WRITTEN OUT SO TWO POSITIONS CAN BE COMPARED.
 *
 * Two positions that draw exactly the same stored things are aliases on this record, and the grid
 * dims the second one. THE COMPARISON IS THE SET OF STORED THINGS, not the number of characters:
 * a position that drew the same paragraphs shorter would be the same position, and dimming it is
 * right.
 */
export function drawnAt(
  record: PanelRecord,
  blocks: readonly SummaryBlock[],
  rung: Rung,
  /**
   * WHO IS READING, AND THIS ARGUMENT IS THE REPAIR.
   *
   * The key below stands for *what this position draws*, and the grid dims a position whose key
   * matches an earlier one. `SummaryBlocks` draws a report through TWO filters: how much it says,
   * which `reportAt` applies, and who the block was written for, which `readerSees` applies. This
   * key only applied the first. So a report holding a block written for developers gave two
   * positions different keys for a normal reader who was drawn the same thing at both — the grid
   * said they differ, and the page drew them identically.
   *
   * REQUIRED rather than defaulted, because a default would be a caller half-remembering which
   * reader its own surface draws for, and that is the same fault one level up.
   */
  reader: Reader,
): string {
  // THE SAME LIST THE PAGE PASSES. If the page filters and this key does not, the grid says three
  // positions differ while the page draws them identically.
  const drawing = reportAt(detailSourceOf(record), blocks, rung)
  // AND THE SAME AUDIENCE RULE THE PAGE APPLIES, asked rather than repeated. A block this reader is
  // not shown is dropped BEFORE the join, so it cannot make two identical drawings look different.
  const shown = drawing.blocks.filter((i) => readerSees(blocks[i]?.audience, reader))
  // AND NOTHING ELSE, BECAUSE THE PAGE DRAWS NOTHING ELSE. This key used to carry a third part: the
  // selection of the report's own lines that sat under the written form. That went: no excerpt is
  // needed, so the report body draws the opening
  // line and the blocks, and this key stands for both of them and for nothing that is not drawn.
  //
  // THE REGION IDS AND NOT THE WORDS, for the reason the head of this function already gives: the
  // key stands for WHICH STORED THINGS a position draws, and a position drawing the same regions is
  // the same position.
  // AND THE PARTS, WHERE THIS LENGTH DRAWS THEM. Reading lengths 4, 5 and 6 draw no line and no
  // block: they draw the report's parts, and what changes between the three is which of each part's
  // texts is under its heading. A key built from the lines and the blocks alone is the empty string
  // at all three, so the grid would dim three positions that draw three different things — which is
  // this file's own note about one question asked twice, in the place it was written against.
  const parts = (drawing.parts ?? []).map((part) => `${part.id}:${part.text ?? ''}:${part.media.join(',')}`)
  return [...drawing.lines.map((line) => line.field), ...shown.map(String), ...parts].join(' ')
}

/** The blocks a record stores, read through the one declaration of which field holds them. */
function blocksOf(record: PanelRecord): SummaryBlock[] {
  const field = blocksFieldOf(record.kind)
  if (field === null) return []
  const held = (record.data as Record<string, unknown> | undefined)?.[field]
  return Array.isArray(held) ? (held as SummaryBlock[]) : []
}

/**
 * THE ANSWER COMES FROM THE SURFACE ITSELF, NEVER FROM A SECOND READING OF THE RESOLVER.
 *
 * A row of a list calls `wordsAt`, which is what Home's rows call. A surface that draws a record's
 * own content is drawn by `SummaryBlocks`, the component the report page draws, told which position
 * to draw at. So the preview cannot say one thing while the page does another.
 *
 * THIS USED TO HAND BACK `everyBlock` AT THREE OF THE SIX POSITIONS, which drew one identical
 * report three times over and taught a reader that positions 4, 5 and 6 were the same thing. They
 * are not: the fourth draws every heading, the fifth adds the opening of each part, and the sixth
 * is the report. `src/shared/reportrungs.ts` is where that is decided, once.
 */
export function previewAt(record: PanelRecord, row: DetailRow, rung: Rung): Preview {
  const draws = row === 'everywhere' ? 'oneLine' : DETAIL_DRAWS[row]
  if (draws === 'theRecordsOwnContent') {
    return {
      shows: 'content',
      drew: rung,
      asked: rung,
      field: `data.${String(blocksFieldOf(record.kind))}`,
      blocks: blocksOf(record),
    }
  }
  const answer = wordsAt(record, rung)
  if (answer.kind === 'text') {
    return { shows: 'words', text: answer.text, drew: answer.drew, asked: rung, field: answer.field }
  }
  return { shows: 'nothing', drew: rung, asked: rung }
}

// -------------------------------------------------------------------------------- the grid

export function DetailSaysPanel() {
  useLanguage()
  // THE COUNTS, WORKED OUT ON THE SERVER. This panel read every record of the project to count them
  // here, which was the largest read on the Settings page; the server counts with the same functions
  // (src/shared/detailsupply.ts) and sends the counts, the first unwritten records and one record per row.
  const [answer] = useProjectAsync(() => api.detailSupply(), [])
  if (answer.status === 'loading') return <Loading label={t('settingsPanel.title.detail')} what="records" rows={4} />
  if (answer.status === 'error') {
    return (
      <p className="dsay-fault" role="status">
        {answer.message}
      </p>
    )
  }
  return <DetailGrid answer={answer.value} />
}

/**
 * The grid itself, given what the server counted rather than fetching it.
 *
 * EXPORTED so a test can draw it without a server, the same reason `projectNameOn` in HomePage.tsx
 * is: the panel above cannot be rendered without a fetch, and this is the whole of what it draws. A
 * test with a list of records hands it `detailSupplyOf(records)`, which is what the server sends.
 */
export function DetailGrid({ answer }: { answer: DetailSupply }) {
  useLanguage()
  const supply = answer.positions
  /** The cell the pointer or the focus is on. Nothing is set by looking at it. */
  const [at, setAt] = useState<{ row: DetailRow; rung: Rung } | null>(null)
  const [open, setOpen] = useState<Rung | null>(null)

  const shown = at ?? { row: 'everywhere' as DetailRow, rung: 'gist' as Rung }
  /**
   * PER ROW: a record that row's surface would actually draw, and which of the six positions give
   * that row the same answer as an earlier one.
   *
   * BOTH ARE PER ROW AND THEY DID NOT USED TO BE. One record stood for all eleven rows, so
   * `Module cards` previewed a report; and one aliasing map was worked out from that one record, so
   * a row that genuinely has three answers was dimmed as though it had two. A surface that draws a
   * record's own content answers differently from a row of a list at the same position — measured
   * on this corpus, 3 distinct answers against 2 — and that difference is the whole reason the axis
   * looked dead on a report page.
   */
  // WHO IS READING. The same hook `SummaryBlocks` asks, so the grid's aliasing and the page's
  // drawing answer the audience question with one rule rather than with two.
  const reader = useReader()
  const perRow = useMemo(() => {
    const out = new Map<DetailRow, { sample: PanelRecord | null; sameAs: ReadonlyMap<Rung, Rung> }>()
    for (const row of DETAIL_ROWS) {
      const sample = answer.samples[row]
      const sameAs = new Map<Rung, Rung>()
      if (sample !== null) {
        const seen = new Map<string, Rung>()
        for (const rung of RUNGS) {
          const answer = previewAt(sample, row, rung)
          const key =
            answer.shows === 'words'
              ? answer.text
              : answer.shows === 'content'
                ? drawnAt(sample, answer.blocks, rung, reader)
                : answer.shows
          const first = seen.get(key)
          if (first === undefined) seen.set(key, rung)
          else sameAs.set(rung, first)
        }
      }
      out.set(row, { sample, sameAs })
    }
    return out
    // `reader` is a dependency because it changes what a position draws, which is what this map is.
  }, [answer, reader])

  const here = perRow.get(shown.row) ?? { sample: null, sameAs: new Map<Rung, Rung>() }
  const sample = here.sample
  const preview = sample === null ? null : previewAt(sample, shown.row, shown.rung)

  const resolved = useDetailAll()
  const fault = detailStorageFault()
  // The number of records is what changes the counter row's widths, so it is what says to measure
  // the grid again.
  const reach = useReach(String(answer.counted))

  return (
    <div className="dsay">
      <style href="mole-office-detail-says" precedence="default">
        {DETAIL_SAYS_CSS}
      </style>

      {/* ELEVEN ROWS BY ONE COLUMN PER RUNG, IN A PANEL NOT ALWAYS WIDE ENOUGH FOR THEM. Below about
          340px the far columns go off the right and the row a person is reading goes with them. The
          grid keeps its own role and its own name — it is a group of controls, not a region of text
          — and takes only the ref, the tab stop and the mark. See components/InReach.tsx. */}
      <InReachMark reach={reach}>
      <div
        className="dsay-grid"
        role="group"
        aria-label={t('settingsPanel.title.detail')}
        ref={reach.box as React.RefObject<HTMLDivElement>}
        tabIndex={reach.sides.length === 0 ? undefined : 0}
      >
        <div className="dsay-head" aria-hidden="true">
          <span />
          {RUNGS.map((rung) => (
            <span key={rung} className="dsay-col">
              {columnLabel(rung)}
            </span>
          ))}
        </div>

        {DETAIL_ROWS.map((row) => (
          <Row
            key={row}
            row={row}
            resolved={row === 'everywhere' ? null : (resolved[row] ?? null)}
            onAt={setAt}
            dimmed={perRow.get(row)?.sameAs ?? new Map<Rung, Rung>()}
          />
        ))}

        <div className="dsay-counter">
          {/* The leading cell of the counter row is empty on purpose: the label of each number is
              the column it sits under. Where the count came from is on the row's own title, which
              is the channel a scope belongs in — it is not a fact a reader needs on every visit. */}
          <span
            className="dsay-rowname"
            title={t('settingsPanel.detail.countedAll', { n: answer.counted })}
          />
          {/* THE TWO SHORTEST COLUMNS STAY, AND THEY COUNT WHAT IS WRITTEN. A person reads a report
              no lower than the conclusion, so levels 1 and 2 are no longer a reading choice — but
              the label is still written, still stored, still served and still drawn in lists, cards
              and the graph, so a count of it is a real number and taking the column away would hide
              it. The number is drawn in the ink every other count uses, because dimming a true
              count would be a claim about the count rather than about the choice. What the column
              is not is said in the words on the cell and in the mark on the Report content row.
              Criterion A19. */}
          {supply.map((position) => {
            const shut = notAReadingChoice(FLOORED_SURFACE, position.rung)
            const countedOver = t(position.countedOver)
            const over = shut ? t('settingsPanel.detail.twoSentences', { first: countedOver, second: t(WHY_THE_COLUMN_STAYS) }) : countedOver
            const said = {
              className: 'dsay-count',
              'data-reading': shut ? 'no' : undefined,
              'data-detail-rung': position.rung,
              title: over,
              'aria-label': t('settingsPanel.detail.countAria', {
                cell: shut ? cellWith('everywhere', position.rung, t(NOT_A_READING_CHOICE)) : cellName('everywhere', position.rung),
                written: position.written,
                possible: position.possible,
                over,
              }),
            }
            const number = (
              <>
                <b aria-hidden="true">{position.written}</b>
                <i aria-hidden="true">/{position.possible}</i>
              </>
            )
            // A COUNT WITH RECORDS BEHIND IT OPENS THEM. Problem tuP05HQGTcqv: the list below
            // followed the cell under the pointer, and reaching its button left the cell, so only
            // Conclusion's list could ever be opened. The count sits under its own column, so a
            // press on it names its position without any pointer having to stay anywhere. A count
            // with nothing unwritten has nothing to open and stays a plain number.
            if (position.unwritten === 0) return <span key={position.rung} {...said}>{number}</span>
            const opened = open === position.rung
            return (
              <button key={position.rung} {...said} type="button" aria-expanded={opened} onClick={() => setOpen(opened ? null : position.rung)}>
                {number}
              </button>
            )
          })}
        </div>
      </div>
      </InReachMark>

      {/* THE LIST STAYS ON THE POSITION IT WAS OPENED FOR, whatever the pointer does next. While it
          is shut, the button follows the cell under the pointer, as before. */}
      <Unwritten supply={supply} at={open ?? shown.rung} open={open} onOpen={setOpen} />

      {sample === null ? null : (
        <PreviewBox record={sample} at={shown} preview={preview} />
      )}

      {fault === null ? null : (
        <p className="dsay-fault" role="status">
          {fault}
        </p>
      )}
    </div>
  )
}

/** One row: a radio group of six positions, named by the surface it sets. */
function Row({
  row,
  resolved,
  onAt,
  dimmed,
}: {
  row: DetailRow
  /**
   * What this row resolves to, or null for `Everywhere`.
   *
   * The Everywhere row has no resolved position of its own: it is what the other ten fall back to,
   * so the only thing it can draw is whether somebody set it. It is passed in rather than read here
   * because one of the eleven rows is not a surface, and a hook cannot be called for ten of eleven.
   */
  resolved: RungChoice | null
  onAt: (at: { row: DetailRow; rung: Rung } | null) => void
  dimmed: ReadonlyMap<Rung, Rung>
}) {
  useLanguage()
  // ORDINARY EMPTINESS IS THE SHORT MARK IN NORMAL MODE: the words that say
  // why are on hover there, and drawn beside the mark in developer mode.
  const developer = useInspect()
  const stored = storedFor(row)
  // WHAT IS STORED, AS THE ROW'S OWN SURFACE READS IT. On Report content a choice of level 1 or 2 —
  // stored before the reader floor, or typed into this browser's storage — resolves to Conclusion,
  // so the mark is drawn on Conclusion. Drawing it on a cell a person cannot press would say the
  // row is set to a position the report page does not draw. `asReaderRung` is the same function the
  // resolver uses, so the grid and the page cannot come to two answers. Criterion A19.
  //
  // IT ASKS THE SAME PREDICATE THE SHUT CELLS ASK, with the kind this row is named for. A row that
  // raised the mark by its own rule would be a second opinion about where the floor is.
  const setHere =
    typeof stored !== 'string'
      ? null
      : row !== 'everywhere' && readerFloorApplies(row, FLOORED_KIND) && isRung(stored)
        ? asReaderRung(stored)
        : stored
  /**
   * WHETHER ANYTHING ON ANY SCREEN ASKS THIS ROW HOW MUCH TO SAY.
   *
   * Eight of the ten do not, today. A row that sets a value nothing reads is a control that does
   * nothing, and a first-time user measuring one found nine identical numbers out of nine and had
   * no way to tell a dead control from a corpus with nothing more to say. The row says which it is.
   * The list is in `src/shared/detail.ts` and a test reads `src/web` to keep the two honest.
   */
  const dead = row !== 'everywhere' && expectedUnread(row)
  // `everywhere` is a band rather than a surface, so nothing reads it directly and there is no
  // number to draw. Every other row is one of the ten surfaces the generated file counts.
  const readers = row === 'everywhere' ? null : (DETAIL_READERS[row] ?? 0)

  function markAt(rung: Rung): Mark {
    if (setHere === rung) return 'here'
    if (setHere === null && resolved !== null && resolved.rung === rung) return 'inherited'
    return 'none'
  }

  function press(rung: Rung): void {
    // Pressing the one already set HERE clears it, and the row goes back to inheriting. That is
    // the only way back, and it is why the filled mark is a press rather than a drawing.
    setDetailFor(row, setHere === rung ? null : rung)
  }

  function keys(event: KeyboardEvent<HTMLButtonElement>, rung: Rung): void {
    const index = RUNGS.indexOf(rung)
    const move = (next: number): void => {
      const target = document.querySelector<HTMLButtonElement>(
        `[data-detail-row="${row}"][data-detail-rung="${String(RUNGS[next])}"]`,
      )
      target?.focus()
      event.preventDefault()
    }
    // A CELL THAT IS NOT A CHOICE IS DISABLED, AND A DISABLED BUTTON CANNOT TAKE FOCUS. Without
    // this the left arrow off Conclusion on the Report content row moved focus nowhere and looked
    // like a dead key. The step skips to the first cell that can hold it, and answers null when
    // there is none, which is the end of that row.
    const nextChoice = (from: number, by: 1 | -1): number | null => {
      for (let at = from + by; at >= 0 && at < RUNGS.length; at += by) {
        const there = RUNGS[at]
        if (there !== undefined && !notAReadingChoice(row, there)) return at
      }
      return null
    }
    const right = nextChoice(index, 1)
    const left = nextChoice(index, -1)
    if (event.key === 'ArrowRight' && right !== null) move(right)
    else if (event.key === 'ArrowLeft' && left !== null) move(left)
    else if (event.key === 'Backspace') {
      setDetailFor(row, null)
      event.preventDefault()
    }
  }

  return (
    <div
      className="dsay-row"
      role="radiogroup"
      aria-label={rowName(row)}
      data-floor={row === FLOORED_SURFACE ? 'yes' : undefined}
      data-inherits={row === 'everywhere' ? undefined : 'yes'}
      data-reads={dead ? 'no' : undefined}
      data-readers={readers === null ? undefined : String(readers)}
      title={resolved === null ? undefined : t(WHY_KEYS[resolved.decider])}
    >
      <span className="dsay-rowname">
        {rowName(row)}
        {/* HOW MANY PLACES ASK THIS ROW HOW MUCH TO SAY. settings-and-governance.md 3.4 asks for
            this fact on the row and graph.md:215 asks for it in the same words; the file it comes
            from is generated by node tools/detail-readers.mjs and a test fails the build when the
            two disagree. IT IS A DIAGNOSTIC AND NEVER A REASON TO HIDE ANYTHING: the scan reads
            text and cannot see a call site reached through a prop, a constant or a loop, so a
            working control can scan to zero. The radio group below is drawn in full whatever this
            says, which is what that section measured and what its own test holds. */}
        {readers === null ? null : ' '}
        {readers === null ? null : (
          <span className="dsay-readers" title={t('settingsPanel.detail.readersWhy')} data-readers={readers}>
            {t('settingsPanel.detail.readBy', { n: readers })}
          </span>
        )}
        {dead ? (
          <>
            {' '}
            <Absence
              tier="ordinary"
              word={developer ? t('settingsPanel.detail.nothingReads') : undefined}
              title={t('settingsPanel.detail.nothingReadsRow', { row: rowName(row) })}
            />
          </>
        ) : null}
        {/* THE TWO CELLS THIS ROW CANNOT BE SET TO, SAID ON THE ROW. It is the same mark a row
            nothing reads carries, in the same place, because it is the same kind of fact: a
            position on this row that a press will not reach. Criterion A19. */}
        {row === FLOORED_SURFACE ? (
          <>
            {' '}
            <Absence
              tier="ordinary"
              word={t('settingsPanel.detail.floorWord', {
                first: columnLabel('label'),
                second: columnLabel('title'),
                note: t(NOT_A_READING_CHOICE),
              })}
              title={t(WHY_THE_COLUMN_STAYS)}
            />
          </>
        ) : null}
      </span>
      {RUNGS.map((rung) => {
        const mark = markAt(rung)
        // NOT A POSITION THIS ROW CAN BE SET TO. Two cells of one row, and the button is disabled
        // rather than hidden: the column stays under its own header and under its own count.
        const shut = notAReadingChoice(row, rung)
        return (
          <button
            key={rung}
            type="button"
            role="radio"
            aria-checked={mark !== 'none'}
            aria-label={
              shut
                ? cellWith(row, rung, t(NOT_A_READING_CHOICE))
                : dead
                  ? cellWith(row, rung, t('settingsPanel.detail.nothingReads'))
                  : cellName(row, rung)
            }
            title={shut ? t(WHY_THE_COLUMN_STAYS) : undefined}
            className="dsay-cell"
            disabled={shut}
            data-mark={mark}
            data-reading={shut ? 'no' : undefined}
            data-same={dimmed.has(rung) ? 'yes' : undefined}
            data-detail-row={row}
            data-detail-rung={rung}
            tabIndex={shut || mark === 'none' ? -1 : 0}
            onClick={() => press(rung)}
            onKeyDown={(e) => keys(e, rung)}
            onMouseEnter={() => onAt({ row, rung })}
            onFocus={() => onAt({ row, rung })}
            onMouseLeave={() => onAt(null)}
            onBlur={() => onAt(null)}
          >
            <span aria-hidden="true">{GLYPH[mark]}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * WHAT A REAL RECORD SAYS AT THE POSITION UNDER THE POINTER.
 *
 * It never says how many characters a position is worth and never describes one. It draws the
 * stored words. Where the resolver had to walk — because nobody wrote anything at the position
 * asked for — the corner says which position answered instead, so a reader is never shown one
 * length while believing they are looking at another.
 */
function PreviewBox({
  record,
  at,
  preview,
}: {
  record: PanelRecord
  at: { row: DetailRow; rung: Rung }
  preview: Preview | null
}) {
  useLanguage()
  const developer = useInspect()
  if (preview === null) return null
  const walked = preview.drew !== preview.asked
  const dead = at.row !== 'everywhere' && expectedUnread(at.row)
  return (
    <div className="dsay-preview" aria-live="off">
      <div className="dsay-preview-head" aria-hidden="true">
        <span className="dsay-preview-where">{rowName(at.row)}</span>
        <span className="dsay-preview-pos">{columnLabel(at.rung)}</span>
        {walked ? <span className="dsay-preview-walked">{columnLabel(preview.drew)}</span> : null}
        {/* WHICH RECORD THIS IS. The box names a surface, and without this it looked like a
            preview of that surface's own writing rather than of one record drawn on it. */}
        <span className="dsay-preview-record">{kindWord(record.kind, developer ? 'inspect' : 'normal').text}</span>
        {dead ? (
          <Absence
            tier="ordinary"
            word={developer ? t('settingsPanel.detail.nothingReads') : undefined}
            title={t('settingsPanel.detail.nothingReadsPreview', { row: rowName(at.row) })}
          />
        ) : null}
      </div>
      {preview.shows === 'content' ? (
        // THE REAL THING, DRAWN BY THE COMPONENT THAT DRAWS IT ON THE PAGE, at the position under
        // the pointer. It used to be the characters `data.blocks`, which is a stored field path
        // shown to a person as the answer to "what will this look like", and then it was the whole
        // report drawn three times. The box is bounded and scrolls down; nothing is cut away.
        <div
          className="dsay-preview-body"
          data-surface={at.row}
          data-shows="content"
          title={
            developer
              ? t('settingsPanel.detail.contentFrom', { id: record.id, level: columnLabel(at.rung), field: preview.field })
              : undefined
          }
        >
          <SummaryBlocks
            blocks={preview.blocks}
            drawAt={at.rung}
            inRecord={{
              recordId: record.id,
              kind: record.kind,
              stored: detailSourceOf(record),
              // AND IT ANNOUNCES NO REGION TREE, because it has not read this record's links and a
              // tree missing the record's relation sections is a shorter tree than the write door
              // validates against — which is the exact defect `BlocksInRecord.wholeRecord` exists
              // to end, in smaller clothes. A settings preview is not the record's page; the
              // readers of the announcement print true sentences when nobody announced one.
              wholeRecord: null,
            }}
          />
        </div>
      ) : preview.shows === 'words' ? (
        <div
          className="dsay-preview-body"
          data-surface={at.row}
          title={developer ? t('settingsPanel.detail.wordsFrom', { field: preview.field, id: record.id }) : undefined}
        >
          {content(preview.text)}
        </div>
      ) : (
        <div className="dsay-preview-body" data-surface={at.row}>
          <Absence
            tier="ordinary"
            word={developer ? t('settingsPanel.detail.nothingStored') : undefined}
            title={
              developer
                ? t('settingsPanel.detail.blankTitleColumn', { id: record.id })
                : t('settingsPanel.detail.blankTitle')
            }
          />
        </div>
      )}
    </div>
  )
}

/**
 * THE RECORDS THAT HAVE A PLACE FOR THIS POSITION AND NOTHING IN IT.
 *
 * It is the counter row's own evidence: the same walk that produced `written of possible` kept the
 * records it did not count, so the number and the list cannot disagree. Nothing here is a route or
 * a query — a count a person cannot open is a number they have to trust.
 */
function Unwritten({
  supply,
  at,
  open,
  onOpen,
}: {
  supply: readonly DetailSupplyPosition[]
  at: Rung
  open: Rung | null
  onOpen: (rung: Rung | null) => void
}) {
  useLanguage()
  const here = supply.find((s) => s.rung === at)
  if (here === undefined || here.unwritten === 0) return null
  const showing = open === at
  return (
    <div className="dsay-unwritten">
      <button
        type="button"
        className="dsay-unwritten-open"
        aria-expanded={showing}
        aria-label={t(settingsControlWord('settings.detail', 'settingsPanel.detail.unwrittenAria'), { n: here.unwritten, cell: cellName('everywhere', at) })}
        onClick={() => onOpen(showing ? null : at)}
      >
        {t('settingsPanel.detail.unwritten', { n: here.unwritten })} <span aria-hidden="true">{showing ? '▾' : '→'}</span>
      </button>
      {showing ? (
        <ul className="dsay-unwritten-list">
          {here.listed.map((record) => (
            <li key={record.id}>
              <RouteLink to={recordPath(record.id)}>{content(record.title)}</RouteLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * The panel's own rules. Every value is a token, so a density or a theme swap reaches all of it.
 *
 * THE GRID IS ONE TEMPLATE AND THE COUNTER ROW SITS UNDER THE SAME COLUMNS. That is what makes
 * position the label: the number under a column is the count for the position drawn above it, and
 * nothing has to say so in words.
 *
 * THERE IS ONE COLUMN PER RUNG AND THE NUMBER IS COUNTED, NEVER TYPED. It was the literal 6, and
 * the header row, the cells and the counter row are all drawn by mapping over RUNGS — so the day a
 * sixth authored length was declared, the three rows would have drawn seven things into six columns
 * and the grid would have wrapped or clipped with nothing failing.
 */
export const DETAIL_SAYS_CSS = `
.dsay { display:flex; flex-direction:column; gap: var(--pad); min-width:0; container-type: inline-size; container-name: dsay; }

.dsay-grid { display:flex; flex-direction:column; min-width:0; overflow-x:auto; }
.dsay-head, .dsay-row, .dsay-counter {
  display:grid; grid-template-columns: minmax(7rem, 13rem) repeat(${String(RUNGS.length)}, 4.5rem);
  justify-content:start; align-items:center; gap: 2px;
}
.dsay-head { padding-bottom: 4px; border-bottom: var(--border-w) solid var(--border-strong); }
/* WIDE ENOUGH FOR THE LONGEST OF THE CONTROL'S OWN WORDS, which is Conclusion at ten characters.
   The three grids below are three separate grid elements, so a column that sized itself to its own
   content would come out a different width in each and the columns would not line up; the width is
   therefore stated once, here, for all three. */
.dsay-col { text-align:center; font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums;
  white-space: nowrap; }

.dsay-rowname { font-size: var(--fs-2); color: var(--text-2); min-width:0; overflow-wrap:anywhere; }
/* A row nothing reads says so UNDER its own name rather than after it, so the two never read as
   one run-on phrase and the mark lines up down the column. */
.dsay-rowname .px-absent { display:block; font-size: var(--fs-1); }
/* THE ONE MARK ON THIS GRID THAT IS TOO LONG FOR THE COLUMN, SO IT WRAPS. Every absence mark in
   this product is one short phrase on one line, and the shared rule holds them to it. The Report
   content row carries a longer one — it names two positions — and measured on 3 September 2026 at
   660px it wanted 245px in a 112px column and drew straight over the Level 1 and Level 2 dots.
   THE RULE IS ON THIS ROW AND NOT ON THE SHARED CLASS, because letting every mark in the product
   wrap would make eight other rows of this grid taller to fix one. */
.dsay-row[data-floor="yes"] .dsay-rowname .px-absent { white-space: normal; }
/* The ten rows sit under the row they inherit from, and the rule says so without a sentence. */
.dsay-row[data-inherits="yes"]:first-of-type { margin-top: 4px; padding-top: 4px;
  border-top: var(--border-w) solid var(--border); }

.dsay-cell {
  display:flex; align-items:center; justify-content:center;
  min-height: 26px; padding:0; border: var(--border-w) solid transparent; border-radius: var(--radius-sm);
  background: none; color: var(--text-3); font-size: var(--fs-3); line-height:1; cursor:pointer;
}
.dsay-cell:hover { background: var(--hover); }
.dsay-cell[data-mark="inherited"] { color: var(--text); }
/* THE ONE PERMITTED ACCENT JOB: the chosen segment of a control. The ring is what carries it when
   the colour is taken away, so the mark is still legible in the monochrome theme. */
.dsay-cell[data-mark="here"] { color: var(--accent); border-color: var(--accent); }
/* A position that gives the same words as an earlier one, for the record in the preview. */
.dsay-cell[data-same="yes"] { opacity: 0.45; }
/* A CELL THIS ROW CANNOT BE SET TO. Two of them, on the Report content row: a person reads a report
   no lower than the conclusion. The cursor says the press will not happen before the press, and the
   dot is drawn faint so the column keeps its place under its own header and its own count. */
.dsay-cell[data-reading="no"] { opacity: 0.3; cursor: default; }
.dsay-cell[data-reading="no"]:hover { background: none; }

.dsay-counter { padding-top: 4px; border-top: var(--border-w) solid var(--border-strong); }

/* WHERE THE GRID DOES NOT FIT, EACH ROW'S NAME TAKES ITS OWN LINE and the seven columns share the whole
   width under it. At 390 the grid was wider than the page and scrolled sideways, so every column after
   the third was out of sight. The width is the name's least and the
   seven columns' widths, and the columns still line up, because all three grids change together. */
@container dsay (width < 40rem) {
  .dsay-head, .dsay-row, .dsay-counter { grid-template-columns: repeat(${String(RUNGS.length)}, minmax(0, 1fr)); }
  .dsay-row > .dsay-rowname { grid-column: 1 / -1; }
  .dsay-head > span:first-child, .dsay-counter > .dsay-rowname { display: none; }
  /* A COLUMN IS THEN NARROWER THAN ITS WORD, so the word runs up the column: Conclusion wants 62px and
     a column at 390 has 45. A Chinese word fits its column lying flat, so it stays flat: drawn upright
     down the column, Chrome gave the Chinese word for Conclusion no height and ran the Chinese
     level-1 heading below the head's line. */
  .dsay-head { align-items: end; }
  .dsay-col { justify-self: center; writing-mode: vertical-rl; transform: rotate(180deg); text-align: start; line-height: var(--lh-tight); }
  :lang(zh) .dsay-col { writing-mode: horizontal-tb; transform: none; text-align: center; }
}
.dsay-count { display:flex; flex-direction:column; align-items:center; line-height:1.1;
  font-variant-numeric: tabular-nums; }
/* A count that opens its unwritten records. The button's own frame is taken off so it reads as the
   same number as the counts beside it; the hover and the open state are what say it can be pressed. */
button.dsay-count { font: inherit; color: inherit; background: none; border: 0; padding: 2px 0; margin: 0;
  border-radius: var(--radius-sm); cursor: pointer; }
button.dsay-count:hover, button.dsay-count[aria-expanded="true"] { background: var(--hover); }
.dsay-count b { font-size: var(--fs-1); font-weight:600; color: var(--text); }
.dsay-count i { font-size: var(--fs-1); font-style:normal; color: var(--text-3); }

.dsay-unwritten { display:flex; flex-direction:column; gap: 4px; align-items:flex-start; }
.dsay-unwritten-open {
  min-height: 26px; padding: 0 var(--pad); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); background: var(--panel); color: var(--text);
  font-size: var(--fs-1); font-weight:600; cursor:pointer;
}
.dsay-unwritten-open:hover { background: var(--hover); }
.dsay-unwritten-list { margin:0; padding-left: var(--pad-lg); display:flex; flex-direction:column; gap:2px;
  font-size: var(--fs-1); max-height: 12rem; overflow-y:auto; }

.dsay-preview { display:flex; flex-direction:column; gap: 4px; padding: var(--pad);
  background: var(--panel-2); border: var(--border-w) solid var(--border); border-radius: var(--radius); }
.dsay-preview-head { display:flex; align-items:center; gap: 6px; font-size: var(--fs-1); color: var(--text-3); }
.dsay-preview-pos, .dsay-preview-walked {
  min-width: 1.4rem; text-align:center; border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); font-variant-numeric: tabular-nums;
}
.dsay-preview-walked { color: var(--st-inferred); border-color: var(--st-inferred-line); }
.dsay-preview-record { font-size: var(--fs-1); color: var(--text-3); }
.dsay-preview-body { font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text);
  max-width: var(--measure-in-box); overflow-wrap:anywhere; }
/* The whole thing is the whole thing. The box holds a height and scrolls DOWN, which is reading;
   it never scrolls sideways, which is the thing the overflow gate refuses to leave silent. */
.dsay-preview-body[data-shows="everyBlock"] { max-height: 16rem; overflow-y:auto; overflow-x:hidden; }

/* ROLE 9 OF THE COLOUR ROLE REGISTER, AND IT USED TO BE ROLE 10's INK. This line said "Mole Office
   cannot read or write your settings in this browser" in --st-inferred — the token that means
   Mole Office WORKED SOMETHING OUT — eight lines under the walked chip, which is role 10 and is the
   only thing --st-inferred is allowed to mean. One token, two meanings, in one stylesheet.
   It is --st-failed now, which is what the appearance bar one panel above has always used for the
   same refusal, so role 9 is one treatment in both places: the ink, the ✕, weight 700 and a rail. */
/* THE NUMBER SITS BESIDE THE ROW NAME AND NOT AGAINST IT. Photographed at 1440 on 26 August 2026
   reading "Home cardsread by 1": the name is a text node and the number an inline span, so without
   a gap the two run together into a word that is neither.
   THE FIRST REPAIR WAS THIS MARGIN ALONE, AND A MARGIN IS NOT A SPACE. The picture came out right
   and the text did not: the element still read "Home cardsread by 1" to a screen reader and to a
   search of the page, which is how the wave that takes photographs because tests miss things missed
   it in the text after taking them. There is a real space in the markup now, and the margin is
   smaller by about that much so the gap on the screen has not moved. */
.dsay-readers {
  flex: none; margin-left: .15em; font-size: var(--fs-1); color: var(--text-3);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.dsay-fault { margin:0; font-size: var(--fs-1); color: var(--st-failed);
  background: var(--st-failed-row); border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm); padding: 4px var(--pad);
  font-weight: var(--st-failed-weight); display: flex; align-items: baseline; gap: 6px; }
.dsay-fault::before { content: var(--st-failed-glyph); flex: none; }
`
