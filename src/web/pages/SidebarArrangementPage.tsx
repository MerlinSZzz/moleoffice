// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR'S ARRANGEMENT, a page of its own since wave 13y round 125 (item 62), with no sidebar row. It is reached
 * from the entry "Arrange the sidebar" in Settings' Looks, from the link the sidebar draws when the saved arrangement
 * is refused, and from #/settings/sidebar, which leads here. The panel is SidebarArrangementPanel; the frame is
 * PagesFromSettings.tsx's.
 *
 * `#/sidebar-arrangement` is a reading, with the groups and their pages in order and no control to move them;
 * `#/sidebar-arrangement/edit`, reached by the Edit press, is the panel with its controls, as it was on Settings. A
 * page opens as a reading (tests/read-before-edit.test.ts). The Edit press changes only the arrangement, which is one
 * for every reader, and not the person's own pinned pages above it, so it stands in the arrangement's part, under the
 * pinned pages.
 */

import { settingsPath } from '@shared/addresses.ts'
import { t } from '@shared/i18n.ts'
import { BackLink } from '../components/BackLink.tsx'
import { SidebarArrangementPanel } from '../components/SidebarArrangement.tsx'
import { pathFor } from '../components/router.tsx'
import { useLanguage } from '../lib/language.ts'
import { EditPress, PageFromSettings } from './PagesFromSettings.tsx'

export function SidebarArrangementPage({ edit = false }: { edit?: boolean }) {
  useLanguage()
  return (
    <PageFromSettings
      back={<BackLink page="settings" to={settingsPath('settings.arrangesidebar')} />}
      heading={<h1 className="pfs-title" data-title-is="its-label">{t('sidebarSetting.title')}</h1>}
    >
      <SidebarArrangementPanel reading={!edit} editPress={<EditPress path={pathFor('sidebarArrangement')} edit={edit} />} />
    </PageFromSettings>
  )
}
