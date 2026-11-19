// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE CONTROLS, a page of their own since wave 13y round 125 (item 62): the Developer group's last row. They
 * were a developer-only panel on Settings, and #/settings/officecontrols leads here. The panel is OfficeControls,
 * unchanged; the frame is PagesFromSettings.tsx's.
 *
 * IN DEVELOPER MODE ONLY, as on Settings. In normal mode the page says the controls are shown in developer mode and
 * draws the switch between the two modes, as Settings did when an address named the panel in normal mode.
 */

import { settingsPath } from '@shared/addresses.ts'
import { t } from '@shared/i18n.ts'
import { OfficeControls } from '../components/OfficeControls.tsx'
import { RouteLink } from '../components/router.tsx'
import { ViewSwitch } from '../components/ViewSwitch.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { PageFromSettings } from './PagesFromSettings.tsx'

export function OfficeControlsPage() {
  useLanguage()
  const developer = useInspect()
  return (
    <PageFromSettings heading={<h1 className="pfs-title" data-title-is="its-label">{t('runtimeSettings.title')}</h1>}>
      {developer ? (
        <OfficeControls />
      ) : (
        <div className="pfs-stack" data-shown-in-developer-mode="">
          <p className="pfs-say">{t('settingsCats.shownInDeveloperMode', { panel: t('runtimeSettings.title') })}</p>
          <ViewSwitch />
          <RouteLink to={settingsPath('settings.mode')} className="pfs-say">
            {t('settingsPanel.title.mode')}
          </RouteLink>
        </div>
      )}
    </PageFromSettings>
  )
}
