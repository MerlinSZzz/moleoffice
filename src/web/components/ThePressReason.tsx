// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REASON A PRESS FOR THE PERSON GAVE, DRAWN WHERE THE ACT IT MADE IS DRAWN. Wave 13s round 2a.
 *
 * Every press a secretary makes under the person's grant gives its reason, and the reason is kept in one place, the
 * press's row. The page of a grant's acts and the checklist line of an item marked done under the grant both draw it
 * here, so the three answers read the same on both: the reason; no reason was written down; or, for an act matched to
 * its press by time, that two presses match it and Mole Office cannot tell which reason is its own.
 */
import { content, t } from '@shared/i18n.ts'
import type { TheReasonOfAnAct } from '@shared/roles.ts'

export function ThePressReason({ reason, className }: { reason: TheReasonOfAnAct; className: string }) {
  return (
    <span className={className}>
      {reason.written !== null
        ? t('w13s.press.reason', { reason: content(reason.written) })
        : reason.because === 'cannot tell'
          ? t('w13s.press.cannotTell')
          : t('w13s.press.noReason')}
    </span>
  )
}
