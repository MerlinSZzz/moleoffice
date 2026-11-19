// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NEEDS YOU, EVERY ROW. Home draws the first rows of this list and a press to this
 * page. The list is the frame's one waiting reading, so this page, Home and
 * the rail's badge count the same thing.
 */
import { t } from '@shared/i18n.ts'
import { HOME_SECTIONS_CSS, HomeNeedsYou } from '../components/home/HomeSections.tsx'
import { ResidentProposals } from '../components/ResidentProposals.tsx'
import type { AsyncState } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'
import type { WaitingReply } from '../lib/waiting.ts'

export function NeedsYouPage({ waiting, onWaitingChanged }: { waiting: AsyncState<WaitingReply>; onWaitingChanged: () => void }) {
  useLanguage()
  return (
    <div className="page hm-away" data-away-from-home="needsyou">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="hm-away-title" data-title-is="its-label">{t('home.needsYou')}</h1>
      <HomeNeedsYou waiting={waiting} presses={<ResidentProposals onAnswered={onWaitingChanged} />} />
    </div>
  )
}
