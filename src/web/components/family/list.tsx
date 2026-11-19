// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { targetAttributes, type Target } from '@shared/targets.ts'
/**
 * THE FAMILY LISTS' ONE DESIGN: Findings, Ideas, Shelved, Modules and Pipelines draw their lists here.
 *
 * ---------------------------------------------------------------------------------------
 * THE DESIGN, AND WHERE IT IS DRAWN
 * ---------------------------------------------------------------------------------------
 * Report n9Mjk3c_sJRu (block b-17) proposed one design for the five pages, and it was taken as
 * recommended. A review adds that the width is used side by
 * side: the eye should not travel along one stretched line to read one item.
 *
 *   A page is the same head, then Needs you where the page can hold it, then one plain list per state.
 *   A section is not a box: a heading in the look's label style, its count, and rows split by a line.
 *   A row is a title and one second line. Its state word and a date, or a small progress bar, sit at
 *   its right in columns of fixed width, so the facts of every row line up down the page.
 *   The whole row opens its thing. A row holds at most one press (Shelved's Restore).
 *   "Made-up example" is said once beside the heading when every row carries it, and on the row
 *   otherwise (question 5). `GroupOriginMark` and `RowMarks` in parts.tsx decide which.
 *   Each page ends with one closed fold saying how it is ordered.
 *
 * On a narrow list (under 46rem, which is a phone and the 660 window) the facts go to a line of
 * their own under the title, and the press goes with them.
 *
 * THE CLASS NAMES ARE THIS FILE'S OWN (flst-*). React keeps a page's stylesheet after the page
 * closes, so a name another page uses would restyle that page too. Round 10 was refused for that.
 */

import { Children, useState, type ReactNode } from 'react'
import { DRAWS_THE_NAME } from '../agent/pointing.ts'
import { declaredAttributes, type Declares } from '../declares.ts'
import { Btn } from '../ui.tsx'
import { GroupOriginMark, RowMarks } from './parts.tsx'

/** The lists of one page, and the stylesheet they share. */
export function FamilyLists({ children }: { children: ReactNode }) {
  return (
    <div className="flst">
      <style href="mole-office-family-lists" precedence="default">
        {FAMILY_LISTS_CSS}
      </style>
      {children}
    </div>
  )
}

/**
 * ONE LIST: a heading with its count, and its rows.
 *
 * `records` are the rows' records, read only to decide whether their shared origin mark goes beside
 * the heading. `foldPast` draws that many rows and a press that shows the rest; the press says the
 * exact count.
 */
export function ListGroup({
  group,
  heading,
  count,
  records,
  ask = false,
  foldPast,
  empty,
  shared,
  declares,
  children,
}: {
  /** A stable name for the list, written on the section so a test or a stylesheet can find it. */
  group: string
  heading: string
  count: number
  records: readonly { origin?: unknown }[]
  /** Needs you: the heading and the rows in the ask colour. */
  ask?: boolean
  foldPast?: number
  /** What an empty list says, in one line under its heading (rule R4). */
  empty?: ReactNode
  /** A fact every row of the list shares, said once beside the heading instead of on each row (rule R11). */
  shared?: ReactNode
  /**
   * The list's name as a part of the screen, where it has one in src/shared/surfaces.ts, so a comment
   * can be left on it. A list with no name of its own is a plain section, as on the Reports page.
   */
  declares?: Declares
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rows = Children.toArray(children)
  const cap = foldPast === undefined || open ? rows.length : Math.min(foldPast, rows.length)
  return (
    <section className="flst-group" data-group={group} data-ask={ask ? '1' : undefined} {...(declares === undefined ? {} : declaredAttributes(declares))}>
      <h2 className="flst-head">
        <span>{heading}</span>
        <span className="flst-count num">{count}</span>
        {shared === undefined ? null : <span className="flst-shared">{shared}</span>}
        <GroupOriginMark records={records} />
      </h2>
      {rows.length === 0 ? <p className="flst-quiet">{empty}</p> : <ul className="flst-list">{rows.slice(0, cap)}</ul>}
      {cap < rows.length ? (
        <p className="flst-more">
          <span>{t('g7a.family.shown', { shown: cap, total: rows.length })}</span>
          <Btn size="sm" onClick={() => setOpen(true)}>
            {t('g7a.family.showAll', { n: rows.length })}
          </Btn>
        </p>
      ) : null}
    </section>
  )
}

/**
 * ONE ROW. The title and its second line are one link, and the link covers the whole row, so a press
 * anywhere on the row opens it. The facts at the right and the one press sit above that link.
 *
 * `sayOrigin` is false when the heading already carries the origin every row of the list shares.
 */
export function ListRow({
  record,
  href,
  target,
  line,
  standing,
  when,
  press,
  below,
  sayOrigin,
  wrap = false,
}: {
  record: { title: string; origin?: unknown; kind: string; incompleteCount?: number }
  href: string
  target: Target
  /** The second line. Null draws the row's marks alone on it, or nothing when it has none. */
  line: ReactNode | null
  /** The state word, or a count such as "3 of 7 checked": the row's first fact at its right. */
  standing?: ReactNode
  /** A date, or a small progress bar. */
  when?: ReactNode
  /** The row's one press. */
  press?: ReactNode
  /** What a press left to say, such as the server's refusal. Drawn under the row. */
  below?: ReactNode
  sayOrigin: boolean
  /** True lets the second line wrap instead of ending in an ellipsis, for words nothing else on screen shows. */
  wrap?: boolean
}) {
  return (
    <li className="flst-row" data-press={press === undefined ? undefined : '1'} data-wrap={wrap ? '1' : undefined}>
      <a className="flst-open" href={href} {...targetAttributes(target)}>
        {/* The title is what the row is called, so a right-click names the record by it and not by
            every word the row draws (see DRAWS_THE_NAME in agent/pointing.ts). */}
        <span className="flst-title" {...DRAWS_THE_NAME}>{record.title}</span>
        <span className="flst-line">
          {line === null ? null : <span className="flst-text">{line}</span>}
          <RowMarks record={record} origin={sayOrigin} />
        </span>
      </a>
      <span className="flst-facts">
        <span className="flst-state">{standing}</span>
        <span className="flst-when">{when}</span>
        {press === undefined ? null : <span className="flst-press">{press}</span>}
      </span>
      {below === undefined || below === null ? null : <div className="flst-below">{below}</div>}
    </li>
  )
}

/**
 * A SMALL PROGRESS BAR with its count, for Modules (items checked) and Pipelines (steps done).
 * The bar is never the only way the number is said: `count` writes it beside the bar, and a caller
 * that leaves it off has already written the number in the row's state column.
 */
export function SmallBar({ done, total, label, count = true }: { done: number; total: number; label: string; count?: boolean }) {
  const share = total === 0 ? 0 : Math.max(0, Math.min(1, done / total))
  return (
    <span className="flst-bar-wrap" title={label}>
      <span className="flst-bar" role="img" aria-label={label}>
        <span className="flst-bar-fill" style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </span>
      {count ? (
        <span className="flst-bar-count num">
          {done}/{total}
        </span>
      ) : null}
    </span>
  )
}

/** Needs you, when it holds nothing: one quiet line (rule R6). */
export function NothingNeedsYou() {
  return <p className="flst-quiet" data-group="needs-you">{t('reports.nothingNeedsYou')}</p>
}

/** The one closed fold at the foot of a page, saying how its lists are ordered. */
export function OrderFold({ children }: { children: ReactNode }) {
  return (
    <details className="flst-order">
      <summary className="flst-order-sum">{t('lists.order.summary')}</summary>
      <div className="flst-order-body">{children}</div>
    </details>
  )
}

/**
 * The lists' own sheet. NO BACKTICK ANYWHERE IN THIS STRING, including in a comment.
 *
 * The heading is the look's label style, as on the Reports page. The row is a grid: the title and
 * its line take what is left, and the facts take fixed columns (11rem for the state, 9rem for the
 * date or the bar), so they line up down the list and sit beside the title rather than at the end of
 * one long line.
 */
export const FAMILY_LISTS_CSS = `
.flst { display: flex; flex-direction: column; gap: calc(var(--gut) * 2); min-width: 0; container-type: inline-size; container-name: flst; }

.flst-group { display: flex; flex-direction: column; min-width: 0; }
.flst-head {
  margin: 0 0 var(--pad); display: flex; align-items: center; flex-wrap: wrap; gap: var(--pad);
  font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight);
  color: var(--text);
}
.flst-shared { display: inline-flex; text-transform: none; letter-spacing: 0; font-family: var(--font-ui); font-size: var(--fs-1); font-weight: 400; }
.flst-head .px-origin { text-transform: none; letter-spacing: 0; font-family: var(--font-ui); }
.flst-group[data-ask="1"] .flst-head { color: var(--ask); }
.flst-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }

.flst-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.flst-row {
  position: relative;
  display: grid; grid-template-columns: minmax(0, 1fr) 11rem 9rem; align-items: center; gap: 4px var(--gut);
  min-height: 44px; padding: var(--pad);
  border-bottom: 1px solid var(--border);
}
.flst-row[data-press="1"] { grid-template-columns: minmax(0, 1fr) 11rem 9rem auto; }
.flst-group[data-ask="1"] .flst-row { background: var(--ask-row); }
.flst-row:hover { background: var(--hover); }
.flst-open { display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--text); text-decoration: none; }
.flst-open::after { content: ""; position: absolute; inset: 0; }
.flst-open:focus-visible { outline: none; }
.flst-open:focus-visible::after { outline: var(--focus-w) solid var(--focus); outline-offset: -2px; }
.flst-title { font-size: var(--fs-2); font-weight: 600; line-height: var(--lh-tight); overflow-wrap: anywhere; }
.flst-line { display: flex; align-items: center; gap: var(--pad); min-width: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.flst-line:empty { display: none; }
.flst-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flst-line > .fam-marks { flex: 0 1 auto; min-width: 0; }
.flst-row[data-wrap="1"] .flst-text { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.flst-facts { display: contents; }
.flst-state, .flst-when { min-width: 0; font-size: var(--fs-1); line-height: var(--lh-tight); color: var(--text-2); font-variant-numeric: tabular-nums; }
.flst-press { position: relative; z-index: 1; justify-self: end; }
.flst-below { position: relative; z-index: 1; grid-column: 1 / -1; }
.flst-warn { color: var(--st-failed); font-weight: 600; }
.flst-label { color: var(--text-3); }
/* What stopped on a checklist: weight and the word, never a hue (the row's warning colour is spent on an open problem). */
.flst-strong { color: var(--text); font-weight: 600; }

.flst-bar-wrap { display: inline-flex; align-items: center; gap: var(--pad); }
.flst-bar { display: inline-block; width: 5rem; height: 8px; border-radius: 4px; background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--text-3); overflow: hidden; }
.flst-bar-fill { display: block; height: 100%; background: var(--text-2); }
.flst-bar-count { color: var(--text-2); white-space: nowrap; }

.flst-more { margin: var(--pad) 0 0; display: flex; align-items: center; gap: var(--gut); font-size: var(--fs-1); color: var(--text-3); }
.flst-quiet { margin: 0; color: var(--text-3); font-size: var(--fs-2); }

.flst-order { font-size: var(--fs-1); color: var(--text-2); }
.flst-order-sum { cursor: pointer; color: var(--text-3); }
.flst-order-sum:hover { color: var(--text-2); }
.flst-order-sum:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.flst-order-body { margin-top: var(--pad); max-width: var(--measure-in-box); line-height: var(--lh-body); }
.flst-order-body > p { margin: 0 0 var(--pad); }

@container flst (width < 46rem) {
  .flst-row, .flst-row[data-press="1"] { grid-template-columns: minmax(0, 1fr); }
  .flst-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); }
  .flst-state:empty, .flst-when:empty { display: none; }
  .flst-press { justify-self: auto; margin-left: auto; }
  .flst-press .px-btn { min-height: 44px; }
  /* THE SECOND LINE, AND ITS MARK, WRAP IN A NARROW LIST. On one line, a fact such as how many of
     the linked problems are open took most of the width at 390 and the record's own words ended in
     "…". The unfilled-fields mark keeps its own width, so in Greek and Italian at 390 it ran past
     the row and the page scrolled sideways; wrapping lets it take a line of its own. */
  .flst-line { flex-wrap: wrap; }
  .flst-text { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
}
`
