// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYBOARD SHORTCUTS ARE MOUNTED BY IMPORTING THIS FILE.
 * It follows item 5 of a decision.
 *
 * `src/web/App.tsx` imports it in one line and nothing else there changes: the shortcuts draw into a
 * root of their own, in an element of their own at the end of the page. They need nothing from the
 * shell's tree. The words, the settings and the look they read are each held once for the whole page
 * (`language.ts`, `shortcuts.ts`, `PresetBar.tsx`), and the presses they act on are found on the page.
 *
 * Outside a browser, for a test that imports App.tsx with no document, it mounts nothing: there is no
 * page to take keys from.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ShortcutKeys } from './ShortcutKeys.tsx'

/** The id of the element the shortcuts draw into. */
export const SHORTCUT_KEYS_ROOT = 'mole-office-shortcut-keys'

if (typeof document !== 'undefined' && document.getElementById(SHORTCUT_KEYS_ROOT) === null) {
  const holder = document.createElement('div')
  holder.id = SHORTCUT_KEYS_ROOT
  document.body.appendChild(holder)
  createRoot(holder).render(
    <StrictMode>
      <ShortcutKeys />
    </StrictMode>,
  )
}
