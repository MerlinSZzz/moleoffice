// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY FROM ONE PAGE OF A LIST TO THE NEXT, and the line saying which rows are on screen.
 *
 * The Everything and Messages pages draw one page of rows at a time. Each
 * page asks its door for one page and the door says how many rows there are in all; this draws the
 * line "Showing 1 to 50 of 16,557." and the two presses. It follows the door's own paging: an
 * offset (how many rows come before this page) and a page size, which is what `GET /api/records`
 * and `GET /api/messages` take as `offset` and `limit`.
 *
 * Nothing is drawn for an empty list: the page's own empty state says that, once. A list that fits
 * on one page gets the line and no presses: two presses that can never be pressed were drawn under
 * "Showing 1 to 3 of 3." (photographed at every width, 27 September 2026).
 */

import { count, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn } from './ui.tsx'

export function Pager({
  offset,
  pageSize,
  total,
  onGo,
  line = true,
}: {
  /** How many rows come before the page on screen. */
  offset: number
  /** How many rows one page holds. */
  pageSize: number
  /** How many rows the list holds in all, on every page. */
  total: number
  /** Go to the page that starts after this many rows. */
  onGo: (offset: number) => void
  /** Whether to draw the line saying which rows are shown. The copy below a list draws only the presses. */
  line?: boolean
}) {
  useLanguage()
  if (total === 0) return null
  const from = Math.min(offset + 1, total)
  const to = Math.min(offset + pageSize, total)
  const first = offset === 0
  const last = to >= total
  if (first && last && !line) return null
  return (
    <div className="px-pager" role="group" aria-label={t('paging.label')}>
      <style href="mole-office-pager" precedence="default">
        {PAGER_CSS}
      </style>
      {line ? (
        <p className="px-pager-line">
          {t('paging.showing', { from: count(from), to: count(to), total: count(total) })}
        </p>
      ) : null}
      {first && last ? null : (
        <span className="px-pager-acts">
          <Btn
            size="sm"
            disabled={first}
            reason={t('paging.onTheFirst')}
            onClick={() => onGo(Math.max(0, offset - pageSize))}
          >
            {t('paging.previous')}
          </Btn>
          <Btn size="sm" disabled={last} reason={t('paging.onTheLast')} onClick={() => onGo(offset + pageSize)}>
            {t('paging.next')}
          </Btn>
        </span>
      )}
    </div>
  )
}

const PAGER_CSS = `
.px-pager {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--pad) var(--gut);
  padding: 0 var(--pad);
  min-width: 0;
}
.px-pager-line {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.px-pager-acts { display: inline-flex; gap: var(--pad); flex-wrap: wrap; margin-left: auto; }
`
