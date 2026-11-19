// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * ONE ROW GEOMETRY for the family pages, and the one module row in the product.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT IT COST A READER
 * ---------------------------------------------------------------------------------------
 * Measured in Chromium at 1440 on 14 August, before this file existed. Every family page builds
 * its rows from the same `Row` in ui.tsx, and every one of them set a different first column, so:
 *
 *   page          row height   the title's left edge        first column
 *   #/modules     52px         x = 600.5 AND x = 708        140px
 *   #/structure   52px, 79px   x = 600.5 AND x = 708        140px
 *   #/findings    74px         x = 610.5                    150px
 *   #/ideas       74px, 96px   x = 590.5                    130px
 *   #/notes       72px         x = 590.5 AND x = 593.5      130px
 *   #/work        34px         x = 465 / 479 / 493          152px
 *
 * Two separate faults are in that table.
 *
 * THE FIRST IS THE TITLE'S LEFT EDGE. It moved by 107px down one screen of `#/modules`, because
 * the row's marks -- "Made-up example", "2 to fill in" -- were drawn BEFORE the title, and how
 * wide they are depends on which marks that row happens to carry. A column of titles that do not
 * start at the same x cannot be scanned, and scanning is the whole job of a list. Measured: the
 * marks were 161.5px on a row with one and 269px on a row with two.
 *
 * So they are not in front of the title any more. They are the first thing on the row's second
 * line, in a cell of their own, which is where every other fact about the record already is. The
 * title now starts at ONE x on every row of every page. Nothing is hidden, nothing is folded, and
 * `RowMarks` still draws both marks at rest on the row they belong to -- USER.md invariant 3 asks for
 * a made-up example to be labelled in the place it appears, and it is.
 *
 * THE SECOND IS THAT ONE COLUMN HAD FOUR WIDTHS. 130, 140, 150 and 152 across five pages that do
 * the same job. `FAMILY_SEV` below is the one width, and it is 9.5rem because that is what the
 * rebuilt `#/work` uses -- the page the others are being brought into line with.
 *
 * ---------------------------------------------------------------------------------------
 * A SIXTH READER, AND IT IS NOT A FAMILY PAGE
 * ---------------------------------------------------------------------------------------
 * `#/missing` -- src/web/pages/QueriesPage.tsx -- calls `famCols()` too, as of 14 August. It had
 * the same fault in a worse state: its unconsumed list closed the first column to 0 outright and
 * its unmet list left it at the component sheet's 112px default, so the two lists on one page put
 * their titles in different places. Measured before: eight left edges between x=551.8 and x=687.
 *
 * ONLY THE GRID IS SHARED, AND THAT IS DELIBERATE. That page draws its own right-hand cell and its
 * own stylesheet: it answers a different question, its rows carry different facts, and this file's
 * `RowRight` is dressed by `.fam-when` and `.fam-marks` in components/family/parts.tsx, which no
 * page outside `.fam` hoists. What must not differ between the two is where a title starts, and
 * that is `famCols`.
 */

import type { RecordListItem } from '../../api.ts'
import { Facts, RowMarks, type Fact } from '../../components/family/parts.tsx'
import { moduleCondition, parseModule } from '../../components/ModuleView.tsx'
import { recordPath } from '../../components/router.tsx'
import { Absence, Row, StoredState, Tag } from '../../components/ui.tsx'
import { progressOf } from '@shared/work.ts'

// ============================================================================ the geometry

/**
 * The one width of the fixed first column, on every family page.
 *
 * 9.5rem is 152px, which is what `#/work` sets. It is stated once here and nowhere else: four
 * literals in four files were four chances for one of them to change alone, and all four had.
 */
export const FAMILY_SEV = '9.5rem'

/**
 * The grid a family row is laid on.
 *
 * The right-hand column is the caller's, because what sits there really does differ per page -- a
 * timestamp on `#/findings`, a link to the record on `#/structure`, nothing at all on some rows of
 * `#/modules`. What must NOT differ is where the title starts, and that is the first two columns,
 * which are the same everywhere.
 */
export function famCols(right: string = 'fit-content(40%)'): string {
  return `${FAMILY_SEV} minmax(0, 1fr) ${right}`
}

// ============================================================================ the second line

/**
 * The row's right-hand cell: what the page puts there, and then the two marks.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MARKS ARE HERE AND NOT IN FRONT OF THE TITLE
 * ---------------------------------------------------------------------------------------
 * They were in front of the title, and that is what moved the title's left edge by 107px down one
 * screen of `#/modules`. Two other places were tried and measured before this one:
 *
 *   IN FRONT OF THE TITLE, IN A FIXED CELL. The cell has to be 269px wide to hold both marks, so
 *   every title on every family page would start a fifth of the way across the row.
 *
 *   AT THE HEAD OF THE ROW'S SECOND LINE. The title's edge was fixed and the raggedness moved down
 *   one line: measured, the description after the marks started at x=610.5 on a row with one mark
 *   and x=718 on a row with two.
 *
 * Here it is right-aligned against the row's own edge, so the marks make a straight column of
 * their own and nothing else on the row moves because of them. Nothing is hidden, nothing is
 * folded, and both marks are still drawn at rest on the row they are about — USER.md invariant 3 asks
 * for a made-up example to be labelled in the place it appears, and 290 of the 385 records in this
 * workspace are made-up examples.
 */
export function RowRight({
  record,
  children,
}: {
  record: { origin?: unknown; kind: string; incompleteCount?: number }
  children?: React.ReactNode
}) {
  return (
    <span className="fam-when fam-right">
      {children}
      <RowMarks record={record} />
    </span>
  )
}

/**
 * When something happened, in the row's right-hand cell.
 *
 * IT IS NOT A `b`. It used to be, and `.fam-when b` sets `font-weight: 400` -- so the tag was
 * carrying a colour and no emphasis at all, which is a bold that says nothing. Nine of them were
 * on `#/findings` alone. The colour is what was wanted and the colour is what it now asks for.
 */
export function At({ children }: { children: React.ReactNode }) {
  return <span className="fam-at">{children}</span>
}

// ============================================================================ one module

export interface ModuleRowProps {
  record: RecordListItem
  /** Problems linked to this module: how many are still open, and how many are linked at all. */
  problems: { open: number; linked: number }
  /** The stored lifecycle word, drawn only where the page is not already grouping by it. */
  lifecycle: string | null
  sayLifecycle: boolean
  /** True when the rows differ on whether a problem is linked, so the row has to say which. */
  sayNoProblems: boolean
}

/**
 * ONE MODULE ROW, drawn once and used by `#/structure` and `#/modules`.
 *
 * ---------------------------------------------------------------------------------------
 * IT REPORTS WHAT STOPPED, NOT ONLY WHAT FINISHED
 * ---------------------------------------------------------------------------------------
 * The row this replaces said `7 / 12 checked` and nothing else about the checklist. Measured on
 * the live corpus: the twelve modules in `greenhouse` hold 36 done, 13 to do, 9 doing, 9 BLOCKED and
 * 6 FAILED items, and the page reported the 36 and hid the 15. A checklist that says only what
 * finished tells a reader that a module with six broken items is simply behind.
 *
 * So the blocked and failed counts are in the same cell, under the done count, and only when there
 * are any -- a row of zeroes on eleven rows would be the mark-on-everything this product keeps
 * having to undo. `no checklist yet` is still its own answer and is still not drawn as 0 / 0.
 *
 * THEY CARRY NO HUE. docs/UX-CONTRACT.md allows one urgency mark per row and this row already
 * spends it on an open problem. Weight and the word carry these instead, which is what the same
 * document asks for anyway: nothing stated by colour alone.
 *
 * THE COUNT COMES FROM `moduleCondition`, the record page's own function, so a module row and the
 * module's own page cannot report different arithmetic about one checklist.
 */
export function ModuleRow({ record, problems, lifecycle, sayLifecycle, sayNoProblems }: ModuleRowProps) {
  const parsed = parseModule(record.data)
  const condition = moduleCondition(parsed.parts)
  const done = condition.byState.done
  const blocked = condition.byState.blocked
  const failed = condition.byState.failed

  // ONE LABELLED FACT, AND THEN THE DESCRIPTION AS PROSE. The summary is not a fact labelled "what
  // it is": a label earns its place when it says which of several questions a clause answers, and
  // on this row there is only one.
  const facts: Fact[] = [
    {
      get label(): string { return t('g7a.family.problems') },
      value:
        problems.linked === 0
          ? null
          : problems.open === 0
            ? t('g7a.family.allClosed', { n: problems.linked })
            : t('g7a.family.openOf', { open: problems.open, total: problems.linked }),
      lead: problems.open > 0,
      urgent: problems.open > 0,
    },
  ]

  return (
    <Row
      cols={famCols()}
      sev={
        condition.items === 0 ? (
          // AN EMPTY CHECKLIST IS AN ANSWER AND IS NOT `0 / 0`. Sending an empty list is what
          // kinds.ts asks a caller to do when there is nothing on the list yet.
          <span className="fam-count" data-empty="1">
            <Absence />
          </span>
        ) : (
          <span className="fam-count">
            <b className="num">
              {done} / {condition.items}
            </b>
            <span>{t('g7a.family.checked')}</span>
            {blocked === 0 ? null : <span className="fam-stopped">{t('g7a.family.blockedCount', { n: blocked })}</span>}
            {failed === 0 ? null : <span className="fam-stopped">{t('g7a.family.failedCount', { n: failed })}</span>}
          </span>
        )
      }
      title={record.title}
      href={`#${recordPath(record.id, record.kind)}`}
      target={{ kind: 'record', recordId: record.id, workspaceId: record.workspaceId }}
      leading={
        // THE STORED WORD, and only when one is stored and the page is not already grouping by it.
        // `StoredState` would print a non-answer for a null, and that non-answer is the same on
        // every row of both pages. It is a chip of one width, so it does not move the title.
        sayLifecycle && lifecycle !== null ? (
          <StoredState state={lifecycle} progress={progressOf(lifecycle)} />
        ) : undefined
      }
      meta={
        <>
          <Facts facts={facts} />
          {record.summary === null ? null : <span className="fam-body">{record.summary}</span>}
        </>
      }
      right={
        <RowRight record={record}>
          {sayNoProblems && problems.linked === 0 ? (
            <Absence />
          ) : null}
        </RowRight>
      }
    />
  )
}

// ============================================================================ styles

/**
 * Hoisted by `FamilyPage` into the one family stylesheet, after `FAMILY_CSS`, so a rule here
 * out-weighs the rule it corrects. NO BACKTICK ANYWHERE IN THIS STRING, including in a comment.
 */
export const FAMILY_ROWS_CSS = `
/* ---------------------------------------------------------------- the page name, drawn once
   THE NAME IS ON THE SCREEN. It used to be clipped to one pixel here, so six pages -- Work to do,
   Modules, Findings, Ideas, Notes and messages, and Modules and pipelines -- opened with nothing in
   the content area saying what they were. Four testers, given the product and no documents, each
   named that as the thing slowing them down on every page.

   THE ARGUMENT FOR CLIPPING IT WAS THAT THE RAIL ROW ALREADY SAYS THE NAME. That is true and it is
   not enough: the rail is the frame, and a reader who has scrolled, or who is on a phone where the
   rail is collapsed to two letters, has no name anywhere. It is also the argument nobody applied to
   Plans, Everything, Pipelines or Agent runs, all of which draw their own name at this size -- so
   the product named half its pages and not the other half.

   ONE NAME, DRAWN ONCE, AT THE TOP LEFT OF THE CONTENT. The string comes from KIND_FAMILIES through
   FamilyHead, which is the same declaration the rail row reads, so there is one of it. The size is
   --fs-6, set by FAMILY_CSS and no longer overruled here, which is what Plans, Everything, Pipelines
   and Agent runs are set at. */
/* ---------------------------------------------------------------- where the page name starts
   THE PAGE NAME STARTS AT THE SAME X AS THE PANELS UNDER IT, AND AS EVERY OTHER PAGE'S NAME.
   It used to be pushed 8px right by a left and right pad of one unit here, on the argument that the head
   should line up with the TEXT inside the first panel rather than with the panel's edge. Measured
   in Chromium at 1440 on 15 August: that put the title at x=270 on Work to do, Modules, Findings,
   Ideas and Reports and notes, while Home, Plans, Decisions, Pipelines, Agent runs, Everything and
   Missing and unused all start theirs at x=262. Seven pages against five, and 262 is where the
   panels themselves start, so the title, the panel edges and the count line make one straight edge
   down the left of the page. The panel's own title stays at 271 and its rows at 279: those are
   steps INTO a panel, and a step in is what says the rows belong to it.
   The count line and the foot line in components/family/parts.tsx lost the same 8px in the same change,
   because a count line at 270 under a title at 262 would be the misalignment moved rather than
   fixed. */
.fam .fam-head { align-items: center; gap: var(--pad); padding: 0; }

/* ---------------------------------------------------------------- the marks, in their own column
   Right-aligned against the row's own edge, after whatever the page puts in this cell, so they
   make a straight column and nothing else on the row moves because of them. See RowRight. */
.fam-right { justify-content: flex-end; row-gap: 2px; }
.fam-right > .fam-marks { flex: none; }
/* THE MARK THAT IS ON EVERY ROW GOES FLUSH RIGHT, and the one that is on some rows sits inside it.
   The cell is right-aligned, so whichever mark is drawn LAST is the one whose edge lines up down
   the page -- and that was the unfilled-field count, which five of twelve rows on this project
   carry. The result was "Made-up example" starting at x=1140 on those rows and x=1245 on the rest:
   the most repeated object on the page, in a ragged column. It is a visual order only; the reading
   order is untouched, and the two marks say different things about different subjects, so there is
   no sequence between them for a screen reader to lose. */
.fam-right .px-inc-mark { order: -1; }

/* ---------------------------------------------------------------- a middle-width panel
   BETWEEN A PHONE AND A DESK, THE RIGHT-HAND CELL GOES UNDER THE TITLE. With three columns in a
   panel about 620px wide, the fixed first column took 152px and the right-hand cell took up to 40%
   of the row for "filed 6d ago" and the made-up mark. The title and its facts were left about 210px,
   so on Ideas at 660 a fact such as "would need" wrapped to one word a line (wave 13q's
   pictures). Here the row keeps its first column, the title and its
   facts take the whole of the rest, and the right-hand cell starts a second line under the title.
   The range starts above 340px because ui.tsx turns a narrower panel's row into one column, and a
   rule here would outweigh that one. Only a row drawn with RowRight is moved: that is the row this
   file lays out. */
@container panel (340px < width <= 46rem) {
  .fam .px-row:has(> .px-row-right > .fam-right) { grid-template-columns: ${FAMILY_SEV} minmax(0, 1fr); }
  .fam .px-row:has(> .px-row-right > .fam-right) > .px-row-sev { grid-row: span 2; }
  .fam .px-row:has(> .px-row-right > .fam-right) > .px-row-right { grid-column: 2; justify-content: flex-start; }
  .fam .px-row-right > .fam-right { justify-content: flex-start; }
}

/* When it happened. The colour the b tag used to be borrowed for, asked for by name. */
.fam-at { color: var(--text-2); font-variant-numeric: tabular-nums; }

/* ---------------------------------------------------------------- what stopped on a checklist
   Weight and the word, never a hue: the row's one urgency mark is already spent on an open
   problem, and docs/UX-CONTRACT.md allows one per row. */
.fam-stopped { color: var(--text); font-weight: 600; white-space: nowrap; }

/* ---------------------------------------------------------------- the fold under a row
   ITS BODY LINES UP WITH ITS OWN SUMMARY TEXT, not with the triangle, and a summary long enough to
   wrap does the same. The triangle is drawn outside the box, so the box is moved right by one
   marker width and the triangle lands back on the column the facts above it are in. Measured
   before: the summary's text sat at x=441 and the fold's contents at x=456, fifteen pixels apart
   for no reason a reader could see. */
.fam-more { padding-left: 1.15em; }
.fam-more-body { padding-left: 0; }
`
