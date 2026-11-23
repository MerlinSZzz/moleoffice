// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS RELATED TO A MODULE OR A PIPELINE, DRAWN AS ONE LIST.
 *
 * The related door (GET /api/records/:id/related) finds the decisions, the reports or the checklists about a scope and
 * its parts at every depth. Every such list on a module's page and on a pipeline's page draws the answer through
 * `RelatedList`. So each says in the same words which part a row came through, which row was worked out from files
 * and is not linked, which emptiness an empty list is, and what the door left out. Nothing is worked out here: the
 * door's answer is drawn as it came.
 *
 * NONE IS NOT NOT READ. A reading that ran and found nothing draws the none word. A reading that failed, or a way the
 * door could not run (`couldNotRead`), draws the not-read word. It is drawn beside rows as well, so a short list is not
 * taken for a whole one.
 *
 * THE FOLD IS A PRESS. Rows past `fold` are not drawn until somebody presses for them, and the press says how many.
 */
import { Fragment, useState, type ReactNode } from 'react'
import { CHECKLIST_ITEM_STATES, type ChecklistItemState } from '@shared/checklists.ts'
import { t } from '@shared/i18n.ts'
import type { ARelatedRow, RelatedAnswer } from '../../server/lib/related.ts'
import { useInspect } from '../lib/mode.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { ItemMark } from './ChecklistParts.tsx'
import { DecisionBasis } from './DecisionBasis.tsx'
import { declaredAttributes } from './declares.ts'
import { recordPath, RouteLink } from './router.tsx'
import { theLinkedRecord } from './sections.ts'
import { Absence, Btn, ErrorNote, Tag, type ErrorNoteProps } from './ui.tsx'

/** The words of a related list, named in full so each is read where it is used. */
export const RELATED_WORDS = {
  through: 'w13s.related.through',
  alsoThrough: 'w13s.related.alsoThrough',
  inferred: 'w13s.related.inferred',
  inferredTitle: 'w13s.related.inferredTitle',
  none: 'w13s.related.none',
  notRead: 'w13s.related.notRead',
  more: 'w13s.related.more',
  left: 'w13s.related.left',
  replacedLeftOut: 'w13s.related.replacedLeftOut',
  deletedLeftOut: 'w13s.related.deletedLeftOut',
} as const

/** What a related list is given: the door's answer, or why it could not be read. */
export type RelatedReading =
  | { status: 'ready'; value: RelatedAnswer }
  | { status: 'error'; message: string; fault?: ErrorNoteProps['fault'] }

export function RelatedList({
  reading,
  fold,
  drawRow,
  workspaceId,
  retry,
}: {
  reading: RelatedReading
  /** How many rows are drawn before the rest go behind a press. */
  fold: number
  /** What a row draws in place of its title's link: a report's line, a decision's facts. */
  drawRow?: (row: ARelatedRow) => ReactNode
  /** The project the rows are in. When it is given, each row says which record it names. */
  workspaceId?: string
  retry?: () => void
}) {
  const inspect = useInspect()
  const [open, setOpen] = useState(false)
  if (reading.status === 'error') {
    return (
      <div className="rel-list">
        <p className="rel-state">
          <Absence tier="told-apart" looked={false} word={t(RELATED_WORDS.notRead)} />
        </p>
        <ErrorNote message={reading.message} fault={reading.fault ?? null} retry={retry} />
      </div>
    )
  }
  const answer = reading.value
  const drawn = open ? answer.rows : answer.rows.slice(0, fold)
  const behind = answer.rows.length - drawn.length
  const unread = answer.couldNotRead.length > 0
  return (
    <div className="rel-list" data-kind={answer.kind}>
      {answer.rows.length === 0 && !unread ? (
        <p className="rel-state">
          <Absence tier="told-apart" looked word={t(RELATED_WORDS.none)} />
        </p>
      ) : null}
      {drawn.length === 0 ? null : (
        <ul className="rel-rows">
          {drawn.map((row) => (
            <RelatedRow key={row.id} row={row} drawRow={drawRow} workspaceId={workspaceId} />
          ))}
        </ul>
      )}
      {behind === 0 ? null : (
        <div className="rel-more">
          <Btn size="sm" onClick={() => setOpen(true)}>
            {t(RELATED_WORDS.more, { n: behind })}
          </Btn>
        </div>
      )}
      {answer.left === 0 ? null : <p className="rel-note">{t(RELATED_WORDS.left, { n: answer.left })}</p>}
      {answer.replacedLeftOut.length === 0 ? null : (
        <p className="rel-note">{t(RELATED_WORDS.replacedLeftOut, { n: answer.replacedLeftOut.length })}</p>
      )}
      {answer.deletedLeftOut === null || answer.deletedLeftOut === 0 ? null : (
        <p className="rel-note">{t(RELATED_WORDS.deletedLeftOut, { n: answer.deletedLeftOut })}</p>
      )}
      {unread ? (
        <p className="rel-state">
          <Absence tier="told-apart" looked={false} word={t(RELATED_WORDS.notRead)} />
          {inspect ? <span className="rel-detail"> {answer.couldNotRead.join(' ')}</span> : null}
        </p>
      ) : null}
      <style href="mole-office-related-here" precedence="default">
        {CSS}
      </style>
    </div>
  )
}

/** One row: what it is, the inferred word when nobody linked it, and the parts it came through. */
function RelatedRow({ row, drawRow, workspaceId }: { row: ARelatedRow; drawRow?: (row: ARelatedRow) => ReactNode; workspaceId?: string }) {
  return (
    <li
      className="rel-row"
      data-kind={row.kind}
      {...(workspaceId === undefined ? {} : declaredAttributes(theLinkedRecord(row.id, workspaceId)))}
    >
      {drawRow === undefined ? <RouteLink to={recordPath(row.id)}>{row.title}</RouteLink> : drawRow(row)}
      {row.inferred ? (
        <span className="rel-inferred" title={t(RELATED_WORDS.inferredTitle)}>
          {t(RELATED_WORDS.inferred)}
        </span>
      ) : null}
      {row.through.length === 0 ? null : (
        <span className="rel-through">
          {t(row.directly ? RELATED_WORDS.alsoThrough : RELATED_WORDS.through)}{' '}
          {row.through.map((one, i) => (
            <Fragment key={one.id}>
              {i === 0 ? null : ', '}
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
            </Fragment>
          ))}
        </span>
      )}
    </li>
  )
}

/**
 * A DECISION ROW: its name, its day, how it is about this scope and its basis one press down. The module's page and the
 * pipeline's page draw a decision row by this, so the two say it in the same words.
 */
export function DecisionFacts({ row }: { row: ARelatedRow }) {
  const one = row.decision
  return (
    <>
      <span className="rp-open-head">
        <Tag kind="decision" />
        <RouteLink to={recordPath(row.id)} className="rp-open-says" {...DRAWS_THE_NAME}>
          {row.title}
        </RouteLink>
      </span>
      {one === undefined ? null : (
        <span className="rp-open-facts">
          {/* THE DAY, AND A TOLD-APART ABSENCE WHEN THE DAY IS ONLY WHEN IT WAS FILED. Almost every
              decision in this corpus carries no `decided_on`, so almost every row needs this — and a
              whole sentence per row would be weight on something nobody has to act on. It goes
              through `Absence` at the told-apart tier: the word on the row, the sentence in the
              tooltip and read out to a screen reader, which is the one place it is written. */}
          <span className="rp-open-state">{row.date}</span>
          {one.nobodyWroteWhen ? (
            <Absence tier="told-apart" looked word={t('g2b.decided.filed')} title={t('g2b.decided.filedTitle')} />
          ) : null}
          {/* HOW IT IS ABOUT THIS, in the server's own words. A decision reached through a fork is not a decision
              somebody wrote about this module, and a row that did not say so would present the weaker fact as the
              stronger one. A row worked out from files carries the list's inferred word instead. */}
          {row.inferred ? null : (
            <span className="rp-open-state">
              {one.how === 'governs it' ? t('w13q.decided.governs') : one.how === 'linked to it' ? t('g2b.decided.linked') : t('g2b.decided.throughFork')}
            </span>
          )}
          {one.throughTheFork === null ? null : (
            <RouteLink to={recordPath(one.throughTheFork.id)} className="rp-open-hops">
              {one.throughTheFork.title}
            </RouteLink>
          )}
        </span>
      )}
      {one === undefined ? null : <DecisionBasis basis={one.basis} />}
    </>
  )
}

/**
 * A CHECKLIST ROW: the checklist's title, and only the items whose links name this scope or one of its parts, each with
 * its mark and its words, as a row on the checklists page draws an item. An item whose stored state is not one of the
 * five draws the not-read word in place of its mark.
 */
export function ChecklistItemsHere({ row }: { row: ARelatedRow }) {
  const items = row.checklist?.items ?? []
  return (
    <>
      <RouteLink to={recordPath(row.id)}>{row.title}</RouteLink>
      {items.length === 0 ? null : (
        <ul className="rel-items">
          {items.map((item, i) => (
            <li key={`${String(i)}-${item.id}`} className="rel-item">
              {isAState(item.state) ? (
                <ItemMark state={item.state} />
              ) : (
                <Absence tier="told-apart" looked={false} word={t(RELATED_WORDS.notRead)} />
              )}{' '}
              {item.words}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function isAState(state: string | null): state is ChecklistItemState {
  return (CHECKLIST_ITEM_STATES as readonly (string | null)[]).includes(state)
}

const CSS = `
.rel-rows { margin: 0; padding-left: 1.2em; display: grid; gap: var(--gut); }
.rel-row { overflow-wrap: anywhere; }
.rel-inferred, .rel-through { margin-left: var(--gut); color: var(--text-2); }
.rel-inferred { font-style: italic; }
.rel-items { margin: 0; padding-left: 1.2em; list-style: none; }
.rel-more { margin-top: var(--gut); }
.rel-note, .rel-state { color: var(--text-2); margin: var(--gut) 0 0; }
`
