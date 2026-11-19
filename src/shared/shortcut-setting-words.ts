// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { WordKey } from './i18n.ts'
import type { ShortcutId } from './participants.ts'

/**
 * THE WORDS OF EACH SETTINGS ROW, one per setting. Typed over every id, so a shortcut added to the
 * shared list has no row until it has words.
 */
export const SHORTCUT_SETTING_WORDS: Readonly<Record<ShortcutId, WordKey>> = {
  chat: 'shortcuts.what.chat',
  keys: 'shortcuts.what.keys',
  home: 'shortcuts.what.home',
  decisions: 'shortcuts.what.decisions',
  settings: 'shortcuts.what.settings',
  project: 'shortcuts.what.project',
  waiting: 'shortcuts.what.waiting',
  search: 'shortcuts.what.search',
  quickSearch: 'shortcuts.what.quickSearch',
  theme: 'shortcuts.what.theme',
}
