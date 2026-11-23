// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * The two questions typed links exist to answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE IS MOSTLY WORDS
 * ---------------------------------------------------------------------------------------
 * Everything else in Mole Office shows you something you already know you have. These two lists
 * show you something you do NOT know you have: a result nobody picked up, and work waiting on
 * something that is no longer there. Neither is a to-do list; both are "something has gone
 * quiet", which is the one failure a directory full of reports can never show you, and which
 * is the reason links carry a TYPE instead of just joining two records.
 *
 * A list of titles under a two-word heading would be useless here. Someone opening this page
 * for the first time has to be told what the question is, why the answer matters, what to do
 * about a row, and — this is the part usually left out — what the query does NOT cover. So
 * each panel carries all four, in that order, before its rows.
 *
 * ---------------------------------------------------------------------------------------
 * ALL FOUR ARE NOW BEHIND ONE PRESS, AND NOT ONE WORD OF THEM IS GONE
 * ---------------------------------------------------------------------------------------
 * Photographed at 1440 the four paragraphs were about 330px of prose standing above a list of
 * two rows. They are worth reading — the fourth in particular, because most products never write
 * down what their own query misses — and they are worth reading ONCE. Read for the two hundredth
 * time they are the thing between a reader and the answer.
 *
 * So each panel now opens on three things: its title, how many rows it found, and ONE LINE. That
 * line is a LIMIT ON THE COUNT and nothing else. `Explain` from ui.tsx holds the rest, at every
 * width, and its control names the four notes and counts them — never the word "more". The `<dl>`
 * inside it is unchanged, which is why `QueryNotes` below still takes the same four props and
 * writes the same four sentences.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE ONE VISIBLE LINE IS ALLOWED TO SAY — narrowed on 2026-08-12
 * ---------------------------------------------------------------------------------------
 * It may not be the panel's own title in different words. "Nothing is built on these" above a panel
 * called "Results nothing is using" is a line a reader has already read.
 *
 * AND IT MAY NOT BE THE QUERY'S IMPLEMENTATION EITHER, which is what it became instead. The page
 * opened on "Both lists are derived from links, not stored", then "One row is one `consumes` link
 * that no longer lands on a record", then "No `consumes` link points at these, counted over claim,
 * module and idea records only" — three sentences about how Mole Office works, standing in front of the
 * first result. How the query runs is read once; it is in `the question`, one press away, at length.
 *
 * What is left visible is the half of those sentences that cannot wait for a press: the SCOPE.
 * Every count on this page answers a narrower question than its heading suggests, and a reader who
 * does not know the narrowing reads "0 broken links" as "nothing is wrong anywhere". So the
 * unconsumed panel says which record kinds it counted over, the unmet panel says which link type it
 * checked, and neither says another word. The page's own lede — the case for typing links at all —
 * moved to the FOOT, behind `AboutTheseQueries`, under the answer rather than in front of it.
 *
 * NO ROW REPEATS ANY OF IT: the rule is the same for every row on a list, so it is said once, above
 * them, and each row spends its line on what differs — its own summary, and its own state word.
 *
 * ---------------------------------------------------------------------------------------
 * TWO QUERIES, TWO KINDS OF ANSWER, AND THE PAGE SAYS WHICH BEFORE A WORD IS READ
 * ---------------------------------------------------------------------------------------
 * One of these lists reports a FAULT: a dependency that used to resolve and no longer does. The
 * other asks a QUESTION that is usually fine: nothing is built on this yet. They were drawn at
 * rank 0 and rank 1 — an alarm, and the ordinary panel every list in this product gets — under
 * identical headers with identical count tags and identical rows, so a second's looking said "two
 * lists, one has a red edge". They are now the ends of the panel scale: the fault is filled,
 * spined and tinted, the question is a plain bordered list. Each panel's own rank carries the note.
 *
 * The page also declares its EMPHASIS, once, on the element everything hangs off. These rows are
 * read to be told apart rather than scanned for what needs a person today, which is `analytical` —
 * see THE SAME SEMANTIC FACT in ui.tsx. It changes what a chip is allowed to be drawn with and it
 * changes nothing about what any word MEANS.
 *
 * ---------------------------------------------------------------------------------------
 * THE GEOMETRY IS THE FAMILY PAGES', AND THE FOUR NUMBERS THAT MADE IT SO — 14 August 2026
 * ---------------------------------------------------------------------------------------
 * Measured in Chromium at 1440, before this pass, on the live `panelx` project:
 *
 *   eight left edges for the row titles   x = 551.8, 599.6, 613.5, 617.2, 635.3, 640.2, 648.6, 687
 *   a visible page heading                43.2px tall, saying the words the rail row beside it says
 *   two widths for the first column       112px on a broken row, 0px on an unconsumed one
 *   the first panel                       y = 111.8, where Home puts its first panel at y = 14
 *
 * THE TITLES MOVED BECAUSE THE ROW'S MARKS WERE DRAWN IN FRONT OF THEM. The kind tag, the state
 * chip and the provenance mark all sat in the row's `leading` cell, so how far across the screen a
 * title started depended on which of the three that row happened to carry and how long its kind
 * word was. A column of titles that do not share an x cannot be scanned, and scanning is the whole
 * job of a list. This is the same fault `src/web/pages/family/rows.tsx` measured at 107px on
 * `#/modules`, and the repair is the same one: nothing is drawn before the title.
 *
 * So the row is laid on `famCols()` — the one grid every family page uses — and its pieces moved:
 *
 *   the fixed left column   the KIND on the unconsumed list, `Broken` on the unmet one.
 *   the title               starts at one x on every row of both lists.
 *   the right-hand cell     how it got here, the stored state word where there is one, and when it
 *                           last changed — the stamp LAST, so its right edge lines up down the page.
 *
 * WHY THE KIND AND NOT THE STATE WORD, on the unconsumed list. The state word is the more
 * interesting fact and it is drawn on the row, in the right-hand cell. It cannot hold the fixed
 * column because it is usually not there: measured on the live corpus, 15 of the 21 unconsumed
 * records are modules and NOT ONE module in either project carries a state word. A left column
 * that is empty on three rows in four is the "widest, leftmost, loudest column is a non-answer"
 * finding that `components/family/parts.tsx` records, and this page would have reproduced it. The
 * kind is stored on every record, it never has to be guessed at, and it is the axis this list is
 * already read by — the panel's own header tallies by kind.
 *
 * THE HEADING IS STILL IN THE DOCUMENT AND IS NO LONGER ON THE SCREEN, which is what the family
 * pages do and for the same reason: it said the words the navigation row beside it had just said,
 * and it cost 43px at the top of every visit. Deleting it outright would leave a page a screen
 * reader cannot announce or jump to, so it keeps the clipped recipe `.px-sr` carries.
 *
 * ---------------------------------------------------------------------------------------
 * NORMAL AND DEVELOPER, WHICH THIS PAGE HAD NEVER BEEN GIVEN
 * ---------------------------------------------------------------------------------------
 * It printed `part_of` in the unmet panel's "what it does not cover" — a spelling no reader has
 * ever been shown, on one of the pages a first-time reader hits hardest. It was recorded as a known
 * exception in the normal-mode test, and the entry was deleted when the page passed.
 *
 * Every stored word this page prints goes through `src/web/lib/words.ts` now:
 *
 *   link types    `LinkName` below. "part of" in Normal, `part_of` in Developer, and the two
 *                 spellings come from `LINK_TYPES`, which declares both readings.
 *   record kinds  `KindName` below, and `Tag` on a row already did it.
 *   the query's own name  "unconsumed" and "unmet dependencies" were the eyebrow above each panel's
 *                 title. They are the names of the two server functions, said to a reader who has
 *                 never seen them, directly above a title that says the same thing in English. They
 *                 are Developer-only now: a developer reading this page wants to know which query
 *                 produced it, and nobody else does.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SERVER ACTUALLY COMPUTES (src/server/lib/records/queries.ts)
 * ---------------------------------------------------------------------------------------
 *   unconsumed  every live record of kind claim, module or idea that is not the TARGET of any
 *               `consumes` link. Other kinds are not considered: a task or an obligation is
 *               not a result, so nothing consuming it means nothing.
 *   unmet       every `consumes` link whose target row is missing or soft-deleted, reported
 *               from the consumer's side. `consumes` only — a broken `blocks` or `measures`
 *               link is real but is not in this answer.
 *
 * The scope notes on the page below are copied from those two rules on purpose: an unscoped
 * "nothing is broken" is a claim the page cannot support. THE COPY IS THE DEFECT THIS REPOSITORY
 * IS NAMED FOR and it is not fixed here: `unconsumed()` in src/server/lib/records/queries.ts
 * filters on its own named list, `UNCONSUMED_OVER`, of claim, module and idea, and this file names
 * the same three. Changing one leaves the other wrong with nothing failing. `UNCONSUMED_KINDS`
 * below is at least the only place the browser says it — the three sentences that used to spell
 * the kinds out separately all read it — but the fix is for the server to export its filter and
 * for this file to import it, which is another owner's file. Reported rather than worked around.
 */

import { type PanelRecord, type RecordKind } from '@shared/types.ts'
import { api, type UnmetItem } from '../api.ts'
import { pathFor, recordPath, RouteLink } from '../components/router.tsx'
import {
  Empty,
  ErrorNote,
  Hint,
  Loading,
  OriginMark,
  Panel,
  Row,
  Stamp,
  StoredState,
  Tag,
  surfaceEmphasis,
  UnmarkedRowsNote,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
/**
 * THE ONE GRID EVERY LIST OF RECORDS IN THIS PRODUCT IS LAID ON.
 *
 * Imported rather than written out, because the width of that first column was a literal in four
 * files and all four had drifted — 130px, 140px, 150px and 152px for a column doing one job. This
 * page was the fifth, and it did not have a width at all: it closed the column to 0 on one list and
 * left it at the stylesheet's default 112px on the other.
 */
import { famCols } from './family/rows.tsx'
import { useInspect } from '../lib/mode.ts'
import { kindWord } from '../lib/words.ts'
/**
 * ONE READING OF "what state word does this record store", shared with the records archive.
 *
 * Imported rather than written again. `stateOf` reads `data.state` defensively and classifies it
 * with the same `progressOf` the server ran, so this page and the records list cannot end up
 * disagreeing about what `measured` means — which is this repository's recurring defect in one
 * function. The attention panel imported `readingStamp` from `SessionPanel` for the same reason,
 * until its ranked list was removed in wave 13k's round 19.
 */
import { stateOf } from './RecordsPage.tsx'

// ============================================================================ words a reader reads

/**
 * The three kinds the unconsumed query is taken over, said once in this file.
 *
 * It used to be typed out in three separate sentences here — the visible line, `the question` and
 * `what it does not cover` — so a fourth kind becoming a result meant finding all three. There is
 * still a fourth copy, and it is the one that matters: `unconsumed()` in
 * src/server/lib/records/queries.ts filters on the same three kinds, in its list `UNCONSUMED_OVER`.
 * See the note at the head of this file.
 */
const UNCONSUMED_KINDS = ['claim', 'module', 'idea'] as const satisfies readonly RecordKind[]

// ============================================================================ one row

/**
 * THE RECORD'S OWN STATE WORD, ON THE CLOSED ROW, WHERE IT HAS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RESULT ROW CARRIES A STATE AT ALL, WHEN THE QUERY IS ABOUT LINKS
 * ---------------------------------------------------------------------------------------
 *
 * Photographed at 1440 the unconsumed list was twenty-one rows of kind, title, sentence and stamp,
 * and the six that matter were indistinguishable from the fifteen that do not. A `claim` whose
 * stored word is `measured` and which nothing consumes is a FINISHED result nobody picked up —
 * the finding this query exists to make. A `claim` still `proposed` and consumed by nothing is
 * ordinary. One is a green chip and the other a grey one, and the difference is readable in the
 * second before any word is.
 *
 * NOTHING IS INVENTED FOR A RECORD THAT HAS NO STATE WORD, and nothing is drawn there either. On
 * the records archive an absent state word is the answer to the question that page asks, and
 * `NoStateMark` says which of the three absences it is. Here it is not the question: this list is
 * about a missing LINK, and printing "no state" fifteen times would be a second query's answer
 * pasted onto this one's rows. How many records carry no state word is counted, exactly, on Home.
 *
 * IT IS IN THE ROW'S RIGHT-HAND CELL AND NOT IN THE FIXED COLUMN, and that is what the absence
 * costs. A chip that is missing three times in four cannot hold a column: the column would be
 * empty on fifteen of twenty-one rows and a reader would learn to stop looking at it. It sits with
 * the other two facts about the record's own history instead — how it got here, and when it last
 * moved — where being drawn on some rows and not others is ordinary.
 */
function RowState({ record }: { record: PanelRecord }) {
  const state = stateOf(record)
  if (state.progress === null) return null
  // No alarm level: this list is not ranked by urgency, so the chip is drawn at its own tone and
  // the analytical emphasis this page declares hands the state's colour back to it.
  return <StoredState state={state.word} progress={state.progress} />
}

/**
 * The right-hand cell of a query row: how it got here, then the page's own fact, then when.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAMP IS LAST BECAUSE IT IS THE ONE THING ON EVERY ROW
 * ---------------------------------------------------------------------------------------
 * The cell is right-aligned, so whichever piece is drawn LAST is the one whose edge makes a
 * straight column. `src/web/pages/family/rows.tsx` measured the cost of getting that wrong on
 * `#/modules`: the mark five rows in twelve carry was drawn last, so the mark that is on every row
 * started at x=1140 on those and x=1245 on the rest. The stamp is on every row of both lists here,
 * and it is the fact this page turns on — how long a result has sat unused — so it takes the edge.
 *
 * BOTH LISTS GET THE PROVENANCE MARK, and this component exists so that neither can be given it
 * without the other. A query result is a record shown to a reader, so decision 17's rule applies to
 * it exactly as it applies to the records list — and the second list here is the more dangerous of
 * the two, because a broken dependency is read as evidence that something real is stuck.
 */
function RowRight({
  record,
  children,
}: {
  record: { kind: string; origin?: unknown; updatedAt: string }
  /**
   * The one fact this list adds, between how the record got here and when it last moved.
   *
   * The unconsumed list puts the record's own state word here; the unmet list puts the consumer's
   * kind, because that list spends its fixed column on `Broken` and a reader still has to see
   * whether the stuck thing is a task or a whole module.
   */
  children?: React.ReactNode
}) {
  return (
    <>
      <OriginMark record={record} only="exceptions" />
      {children}
      <Stamp at={record.updatedAt} />
    </>
  )
}

// ============================================================================ shared bits

/**
 * The grid both lists are laid on, from the one declaration every list of records reads.
 *
 * It was `'0 minmax(0, 1fr) auto'` on one list here — the first column closed outright — and
 * nothing at all on the other, which left it at the stylesheet's 112px default. Two lists on one
 * page whose titles began at different places, which is half of the eight left edges this page had.
 */
// Keep the title readable at 660px until the family rows use a bounded right column (wgMS3adgQNTO).
const QUERY_COLS = famCols('fit-content(40%)')


/**
 * What the fold on every query panel says it holds.
 *
 * Written once so the two panels cannot describe the same four notes two ways, and written as the
 * names of the four rather than as a number alone — "4 notes" on its own is the bare word "more"
 * with arithmetic in front of it, and `Explain` rejects that spelling for exactly this reason.
 */
// "query" IS HOW THIS PAGE IS COMPUTED, and the address was deliberately renamed from `queries` to
// `missing` for exactly that reason — router.tsx argues the case. The permission to keep a stored
// word is for addresses, not for a caption a person reads. Finding 29, 19 August 2026.

// ============================================================================ unconsumed

/**
 * The line under one unconsumed row: what this record says about itself, or that it says nothing.
 *
 * IT NO LONGER APPENDS THE REASON. Every row on this list is here for the identical reason and the
 * kind is already drawn on the same row, so the clause "— no `consumes` link points at this
 * module" was the panel's own visible line printed again once per row with one word changing. At
 * 390 that clause was the difference between a two-line and a three-line row on twenty rows.
 *
 * The rule itself did not move out of sight: it is the panel's visible `meaning`, above the rows,
 * where it is read once and governs all of them.
 */
export function unconsumedMeta(record: PanelRecord): React.ReactNode {
  return record.summary === null || record.summary.trim() === '' ? (
    // Absence said out loud rather than a blank cell, the same answer the records list gives.
    <span className="qp-nosummary">{t('dev.queries.noOneLineSummaryStored')}</span>
  ) : (
    record.summary
  )
}

/**
 * What this list is MADE OF, by kind, biggest first.
 *
 * Twenty rows under one heading is a number; "12 modules, 5 claims, 3 ideas" is a shape, and the
 * shape is what tells a person whether the modules are drifting or the claims are. It is grouping
 * and counting over rows that are already on the page, so it invents nothing and can be checked
 * against the list under it.
 */
export function kindTally(records: readonly PanelRecord[]): { kind: RecordKind; count: number }[] {
  const counts = new Map<string, number>()
  for (const record of records) counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([kind, count]) => ({ kind: kind as RecordKind, count }))
}

export function UnconsumedPanel({ records, counted = 0 }: { records: PanelRecord[]; counted?: number }) {
  const kinds = kindTally(records)
  const inspect = useInspect()
  return (
    <Panel titleIs="label" declares={{ surface: 'queries.unconsumed' }}
      title={t('dev.queries.resultsNothingIsUsing')}
      // THE QUERY'S OWN NAME, TO SOMEBODY WHO WANTS IT. `unconsumed` is the name of a function in
      // src/server/lib/records/queries.ts, and it was drawn as an eyebrow directly above a title
      // that says the same thing in English. A Normal reader gets the English; a developer gets the
      // handle that will find the code.
      {...(inspect ? { kind: t('dev.queries.unusedKind') } : {})}
      /**
       * QUIET, AND THAT IS THE WHOLE DIFFERENCE BETWEEN THE TWO QUERIES ON THIS PAGE.
       *
       * It was never an alarm — an unconsumed claim is normal for a day-old result and becomes a
       * problem only when it stays that way — but "not an alarm" was drawn as rank 1, the ordinary
       * panel every list in this product gets, sitting directly under a rank 0 panel with the same
       * header shape, the same count tag and the same rows. At a glance the page read as two
       * lists, one of which happened to have a red edge. It is two DIFFERENT KINDS OF ANSWER: one
       * says something is broken, the other asks a question nobody has answered yet.
       *
       * Rank 2 gives up the fill and the elevation and keeps the border, the eyebrow, the title,
       * the count and every row. So the page is a filled, spined, tinted panel above a plain one,
       * and which is which survives a second of looking without a word being read.
       */
      rank={2}
      // The split by kind rides in the title row beside the total, so it costs no line of its own.
      actions={
        <>
          {kinds.length === 0 ? null : (
            <span className="qp-kinds">
              {kinds.map((entry) => (
                <span className="qp-kind" key={entry.kind}>
                  <Tag kind={entry.kind} />
                  <span className="num">{entry.count}</span>
                </span>
              ))}
            </span>
          )}
          <Tag tone="quiet">{t('dev.queries.recordCount', { n: records.length })}</Tag>
          <Hint>{t('dev.queries.countedKinds', { kinds: UNCONSUMED_KINDS.map((kind) => kindWord(kind).text).join(t('dev.queries.separator')) })}</Hint>
        </>
      }
    >
      {records.length === 0 ? (
        <Empty
          /* IN AN EMPTY PROJECT THIS WAS DRAWN IN BOLD AS IF IT WERE GOOD NEWS: "Everything that
             can be consumed is consumed". Nothing was being consumed because nothing was there.
             `counted` is the server saying how many records the check was taken over, which is the
             only thing that tells the two apart — invariant 5, on a screen. Neither is bold, because
             nobody has to do anything about either. */
          message={
            counted === 0
              ? t('dev.queries.nothingYet')
              : t('absence.none')
          }
          action={
            // `pathFor`, not "/records" typed out: FLAT_ROUTES in router.tsx is the only place the
            // address of a page lives, and a second copy of it here is a link that goes on pointing
            // at the old address on the day the first copy moves, with nothing failing.
            <RouteLink to={pathFor('records')} className="qp-link">{t('dev.queries.lookAtAllRecords')}</RouteLink>
          }
        />
      ) : (
        records.map((record) => (
          <Row
            key={record.id}
            cols={QUERY_COLS}
            // THE KIND HOLDS THE FIXED COLUMN. See the note on RowState: the state word is the
            // better fact and is missing on three rows in four, so it cannot hold a column.
            sev={<Tag kind={record.kind} />}
            title={record.title}
            href={`#${recordPath(record.id, record.kind)}`}
            target={{ kind: 'record', recordId: record.id, workspaceId: record.workspaceId }}
            meta={unconsumedMeta(record)}
            right={
              <RowRight record={record}>
                <RowState record={record} />
              </RowRight>
            }
          />
        ))
      )}
    </Panel>
  )
}

// ============================================================================ unmet

/**
 * What to say about the far end of a broken `consumes` link.
 *
 * The server hands back the target's title when the row still exists and is merely deleted,
 * and the literal string "(unknown)" when the link points at an id with no row at all. Those
 * are different accidents with different fixes, so they get different sentences rather than
 * one that covers both by being vague.
 */
export function unmetMeta(item: UnmetItem): string {
  if (item.missingTitle === '(unknown)') {
    return t('queriesPage.missingNotInTheDatabase')
  }
  // What to do about it is the panel's own "what to do" note, one press away, where it is fuller
  // and names the Restore button. On the row it was the same instruction once per row.
  return t('dev.queries.missingDeleted', { title: item.missingTitle })
}

export function UnmetPanel({ items }: { items: UnmetItem[] }) {
  const inspect = useInspect()
  return (
    <Panel titleIs="label" declares={{ surface: 'queries.unmet' }}
      title={t('dev.queries.workWaitingOnSomethingThatIsNot')}
      // The query's own name, for a developer only. See the same prop on the panel above.
      {...(inspect ? { kind: t('dev.queries.unmetKind') } : {})}
      // This one IS an alarm when it has rows: every row is a link that used to resolve and no
      // longer does, which is the failure the whole soft-delete design exists to make visible.
      rank={items.length > 0 ? 0 : 1}
      tone="broken"
      // One row is one broken link, not one record: a record that consumes two missing things
      // is two rows, and calling that "1 record" would undercount the work.
      actions={
        <>
          <Tag tone="quiet">{t('dev.queries.brokenCount', { n: items.length })}</Tag>
          <Hint>{t('dev.queries.onlyWhatARecordSaysItUses')}</Hint>
        </>
      }
    >
      {items.length === 0 ? (
        // NOBODY ACTS ON THIS, so it is not bold and it is not two sentences. The qualifier is on
        // the visible line above, where it belongs: it is what stops a count of nought being read
        // as an all-clear about every link in the project.
        <Empty
          message={t('absence.none')}
          action={
            <RouteLink to="/" className="qp-link">{t('dev.queries.backToWhatNeedsYouToday')}</RouteLink>
          }
        />
      ) : (
        items.map((item) => (
          <Row
            // A consumer can be missing two different things, so the id alone is not unique.
            key={`${item.consumer.id}:${item.missingTitle}`}
            cols={QUERY_COLS}
            // THE FIXED COLUMN IS THE FAULT, on the list whose rows are faults. `state` draws the
            // chip and spines the row, which is what tells this list from the quiet one below it.
            state="broken"
            title={item.consumer.title}
            href={`#${recordPath(item.consumer.id, item.consumer.kind)}`}
            target={{ kind: 'record', recordId: item.consumer.id, workspaceId: item.consumer.workspaceId }}
            meta={unmetMeta(item)}
            right={
              <RowRight record={item.consumer}>
                {/* The consumer's kind, because this list's fixed column is spent on the fault and
                    a reader still has to see whether the stuck thing is a task or a whole module.
                    Quiet: the row already carries one loud word and it is `Broken`. */}
                <Tag kind={item.consumer.kind} tone="quiet" />
              </RowRight>
            }
          />
        ))
      )}
    </Panel>
  )
}

// ============================================================================ the page

export function QueriesPage() {
  const [state, reload] = useProjectAsync(async () => {
    // One await, so the two lists are always the same moment. Two sequential fetches could show
    // a record as unconsumed in the first list and deleted in the second.
    const [unconsumed, unmet] = await Promise.all([api.unconsumed(), api.unmet()])
    return { unconsumed, unmet }
  }, [])

  return (
    // Analytical, the same declaration Records makes and for the same reason: these rows are read
    // to be told apart — a broken dependency from a result nobody picked up — not scanned for what
    // needs a person today. See THE SAME SEMANTIC FACT in ui.tsx.
    <div className="qp" {...surfaceEmphasis('analytical')}>
      <style href="mole-office-queries" precedence="default">
        {QUERIES_CSS}
      </style>

      {/* THE PAGE'S NAME, IN THE DOCUMENT AND NOT ON THE SCREEN. The rail row that opened this page
          and the address both say "missing and unused", and this heading said it a third time, 43px
          tall, at the top of every visit — which is what put the first panel at y=111.8 where Home
          puts its first panel at y=14. It is clipped rather than deleted: a page with no heading is
          a page a screen reader cannot announce or jump to. */}
      <header className="qp-head">
        <h1 className="qp-title">{t('nav.queries')}</h1>
      </header>

      {state.status === 'loading' ? <Loading label={t('dev.queries.theLinkQueries')} rows={4} /> : null}

      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}

      {state.status === 'ready' ? (
        <>
          {/* The broken one first. It is the list with something to fix; the unconsumed list is
              a prompt to think, and a prompt should not sit above an alarm. */}
          <UnmetPanel items={state.value.unmet} />
          <UnconsumedPanel records={state.value.unconsumed.records} counted={state.value.unconsumed.counted} />
        </>
      ) : null}

      {/* WHAT AN UNMARKED ROW MEANS, AND THE ARGUMENT FOR TYPED LINKS — both after the answer.
          The provenance sentence used to sit in the page header, above the first panel, which is
          two lines of statement about a list standing in front of the list. It is what makes
          `OriginMark only="exceptions"` on the rows honest, so it is not hidden and not moved into
          Developer mode; it is moved BELOW the rows it is about, which is where a statement about a
          list belongs. The same arrangement `PageFoot` gives every family page. */}
      <footer className="qp-foot">
        <UnmarkedRowsNote what={t('dev.queries.result')} />
      </footer>
    </div>
  )
}

// ============================================================================ styles

/**
 * This page's own rules: the clipped heading, the row's cells, and the explanation block.
 *
 * styles.css and the component stylesheet belong to other agents this phase, so what is only
 * this page's business lives with the page. React 19 hoists `<style href>` into <head> and
 * de-duplicates by href, so this is one element however often the page renders. Every value
 * below is a token from tokens.css — no colour and no type size is written out, so a preset
 * swap on <html> reaches all of it.
 */
const QUERIES_CSS = `
.qp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

/* ---------------------------------------------------------------- the page name, drawn once
   IT IS DRAWN. This heading was clipped to one pixel, on the reasoning that the rail row beside it
   already names the page. A first-time reader went through six pages like that and reported the
   missing name on every one: the rail is a list of places, and the content area then names itself
   nowhere. So the page carries its name, at the size every other page uses, and the name still
   comes from one string. */
.qp-title {
  margin: 0;
  font-size: var(--fs-6);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
}

.qp-foot { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

/* ---- A RESULT ROW IS READ, NOT DECODED.
   Measured at 1440 on 2026-08-12: 112 of this page's 153 leaf text nodes were set below 13px, and
   the biggest single group of them was the row summary -- one full sentence per row at --fs-1, in
   --text-3, on twenty-one rows. --fs-1 is what tokens.css calls "labels, meta, chips"; a sentence
   is none of those. It is the row's whole evidence and it is what a reader is here to compare, so
   it takes --fs-2, the size tokens.css calls "UI body, row text; the size most of the app is set
   in", and the second text colour rather than the third. The title stays a step above it in --text,
   so the hierarchy is unchanged -- what changed is that the bottom of it is legible.
   The stamp goes with it. How long a result has sat unused is the one fact on this page that turns
   an ordinary row into a finding, and it was in the smallest type on the row. */
.qp .px-row-meta {
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
}
/* The right-hand cell holds three things now -- how the record got here, the fact this list adds,
   and when it last moved -- so it is allowed to wrap onto a second line rather than squeezing a
   chip off the edge. It is right-aligned by the component sheet and the stamp is drawn LAST, so
   the stamp's edge is the straight column down the page. See RowRight. */
.qp .px-row-right { font-size: var(--fs-2); flex-wrap: wrap; row-gap: 2px; }

/* A record with no summary says so, in the same voice the records list uses for the same absence. */
.qp-nosummary { font-style: italic; }

/* The split by kind, in the title row. It wraps on a phone rather than being cut, because a count
   that is half off the edge of the screen is a count nobody can use. */
.qp-kinds { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.qp-kind { display: inline-flex; align-items: baseline; gap: 4px; }
.qp-kind .num {
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.qp-link {
  color: var(--accent);
  font-size: var(--fs-2);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: .16em;
}
`
