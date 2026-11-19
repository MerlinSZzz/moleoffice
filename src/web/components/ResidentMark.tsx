// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK ON A PERMANENT RESIDENT'S ROW: "Permanent resident, since 14 Oct 2026".
 * The proposal report GsGFiDygATd5, block b-8.
 *
 * DRAWN ONLY FROM THE STORED CONFIRMATION. The caller passes the `since` of a row of GET /api/residents,
 * which is the moment the person confirmed. An agent that is not a resident gets no mark and no word,
 * so this has no "not a resident" drawing.
 *
 * Its own file, so a list that another piece of work owns (the agent pages) can draw the same mark
 * with one line.
 */
import { dayInThePageLanguage, t } from '@shared/i18n.ts'
import { parseAnyStamp } from '@shared/time.ts'
import { useLanguage } from '../lib/language.ts'
import { Tag } from './ui.tsx'

export function ResidentMark({ since }: { since: string }) {
  useLanguage()
  const at = parseAnyStamp(since)
  // A MOMENT THE PAGE CANNOT READ IS SHOWN AS IT WAS STORED, never dropped and never guessed at.
  const day = at === null ? since : dayInThePageLanguage(at, true)
  return (
    <span className="resident-mark" data-resident-since={since}>
      <style href="mole-office-resident-mark" precedence="default">
        {RESIDENT_MARK_CSS}
      </style>
      <Tag tone="accent">{t('resident.mark')}</Tag>
      <span className="resident-mark-since">{t('resident.mark.since', { day })}</span>
    </span>
  )
}

/** The words of a mark, as one line a list can carry beside its other facts. No backtick in this string. */
const RESIDENT_MARK_CSS = `
.resident-mark { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.resident-mark-since { font-size: var(--fs-1); color: var(--text-3); }
`
