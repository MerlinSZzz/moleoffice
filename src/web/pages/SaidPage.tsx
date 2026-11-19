// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT HAS BEEN SAID. Home drew it in Developer mode and now has a press to this page
 * there. The band reads its own route and carries its own stylesheet.
 */
import { t } from '@shared/i18n.ts'
import { HOME_SECTIONS_CSS } from '../components/home/HomeSections.tsx'
import { WhatHasBeenSaidBand, WHAT_HAS_BEEN_SAID_CSS } from '../components/home/WhatHasBeenSaid.tsx'
import { useLanguage } from '../lib/language.ts'

export function SaidPage() {
  useLanguage()
  return (
    <div className="page hm-away" data-away-from-home="said">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      <style href="mole-office-what-has-been-said" precedence="default">{WHAT_HAS_BEEN_SAID_CSS}</style>
      {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
      <h1 className="hm-away-title" data-title-is="its-label">{t('home.said')}</h1>
      <WhatHasBeenSaidBand reloadKey={0} />
    </div>
  )
}
