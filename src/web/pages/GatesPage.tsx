// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { GatesPanel } from '../components/GatesPanel.tsx'
import { useLanguage } from '../lib/language.ts'
import { PageFromSettings } from './PagesFromSettings.tsx'

export function GatesPage(_props: { edit?: boolean }) {
  useLanguage()
  return (
    <PageFromSettings
      heading={<h1 className="pfs-title" data-title-is="its-label">{t('gates.title')}</h1>}
    >
      <GatesPanel />
    </PageFromSettings>
  )
}
