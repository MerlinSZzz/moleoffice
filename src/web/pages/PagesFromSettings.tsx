// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE PAGES THAT WERE PANELS ON SETTINGS, wave 13y round 125 (item 62).
 * Settings now shows one category at a time with every panel open, and these three have pages of their own:
 *
 *   - Gates, a row in the Office group after Office regulations;
 *   - Office controls, the Developer group's last row, drawn in developer mode only, as the panel was on Settings;
 *   - the sidebar's arrangement, with no row of its own, reached from the entry "Arrange the sidebar" in Settings'
 *     Looks and from the link the sidebar draws when the saved arrangement is refused.
 *
 * Each old address, #/settings/gates, #/settings/officecontrols and #/settings/sidebar, leads to its page
 * (MOVED_SETTINGS_PANELS in src/shared/addresses.ts). Each page draws the panel it was, unchanged. The normal-mode
 * notice about refused saved values stays on Settings (RefusedSavedSettings in src/web/components/OfficeControls.tsx).
 *
 * GATES AND THE SIDEBAR'S ARRANGEMENT OPEN AS A READING, and an Edit press shows their controls, because a page opens
 * as a reading (tests/read-before-edit.test.ts). The editing face is the same address with `/edit` on the end, as on
 * the schedule and a record, and Stop editing leads back. Office controls draws its controls on arrival, in developer
 * mode only.
 *
 * EACH PAGE LEADS BACK TO THE LEVEL ABOVE IT, round 135. The sidebar's arrangement passes its link as `back`, to
 * Settings opened at Looks, where its entry is. Gates and Office controls pass none: the path the frame draws above
 * every page of a sidebar group already leads to the group's page, Office or Developer.
 *
 * This file is the frame the three share: GatesPage.tsx, OfficeControlsPage.tsx and SidebarArrangementPage.tsx beside
 * it. Each page writes its own heading.
 */

import type { ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { editingAddress, RouteLink } from '../components/router.tsx'

/** The way back, when the page passes one, then a page's heading, written by the page, and under it the panel the page is. */
export function PageFromSettings({ back = null, heading, children }: { back?: ReactNode; heading: ReactNode; children: ReactNode }) {
  return (
    <div className="page pfs">
      <style href="mole-office-pages-from-settings" precedence="default">
        {PAGES_FROM_SETTINGS_CSS}
      </style>
      {back}
      <header className="pfs-head">{heading}</header>
      <div className="pfs-body">{children}</div>
    </div>
  )
}

/** The press between a page's reading and its editing face: Edit on the reading, Stop editing on the editing face. */
export function EditPress({ path, edit }: { path: string; edit: boolean }) {
  return (
    <RouteLink to={edit ? path : editingAddress(path)} className="px-btn pfs-press">
      {t(edit ? 'pagesFromSettings.stopEditing' : 'pagesFromSettings.edit')}
    </RouteLink>
  )
}

/** Every value is a token, and there is no backtick anywhere in here. */
const PAGES_FROM_SETTINGS_CSS = `
.pfs { display: grid; gap: var(--gut); min-width: 0; }
.pfs-head { display: grid; gap: var(--pad); min-width: 0; }
/* --fs-6, which is what the Settings page's name is set at, since these were its panels. */
.pfs-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.pfs-body { min-width: 0; }
.pfs-press { justify-self: start; text-decoration: none; }
.pfs-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.pfs-say { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-2); line-height: var(--lh-tight); color: var(--text-2); }
a.pfs-say { color: var(--accent); }

/* THE PANEL'S OWN TITLE IS THE PAGE'S NAME NOW, so it is not drawn twice. A head that holds more keeps the rest. */
.pfs-body > .px-panel > .px-panel-head .px-panel-title { display: none; }
.pfs-body > .px-panel > .px-panel-head:not(:has(.px-panel-kind, .px-panel-actions)) { display: none; }
.pfs-body > .px-panel > .px-panel-head:not(:has(.px-panel-kind, .px-panel-actions)) + .px-panel-body { padding-top: 0; }
`
